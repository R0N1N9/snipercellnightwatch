// Unified keyboard/mouse + touch input. Game code reads `state` and edge-triggered `pressed`.

export class Input {
  constructor(canvas, touchRoot) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressedSet = new Set();
    this.look = { x: 0, y: 0 };
    this.move = { x: 0, y: 0 };
    this.mouseFire = false;
    this.mouseScope = false;
    this.touch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
    this.enabled = false;
    this.sensitivity = 1;
    this.invertY = false;
    this.scopeToggle = false;
    this.scopeLatched = false;
    this.breathLatched = false;
    this.touchSensL = 1;
    this.touchSensR = 1;
    this.gyroMode = 'off';
    this.gyroSens = 1;
    this.gyroInvertY = false;
    this.isScoped = false;
    this.locked = false;
    this._bindKeyboard();
    if (this.touch) this._bindTouch(touchRoot);
  }

  _bindKeyboard() {
    addEventListener('keydown', (e) => {
      if (!this.enabled) return;
      // Cmd (macOS) shortcuts belong to the system (Cmd+Shift+4 is a screenshot, not "Shift +
      // 4"), and macOS sends no keyup for keys released while Cmd is down: let go of everything.
      if (e.metaKey) { this.keys.clear(); return; }
      this.kbmT = performance.now();
      if (e.code === 'Tab') e.preventDefault();
      if (!this.keys.has(e.code)) this.pressedSet.add(e.code);
      this.keys.add(e.code);
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    // A real mouse on a touch device (iPad + MX Master, Magic Mouse/Trackpad, Android +
    // mouse) switches on mouse mode: mouse aims and fires, touch controls keep working.
    this.mouseMode = !this.touch;
    // Clicks count when they land on the game view (the canvas, or the touch-control layer
    // that covers it on tablets), not on menus or a touch button.
    const onGame = (e) => e.target === this.canvas || (e.target.closest && e.target.closest('#touch') && !e.target.closest('[data-act], .pill'));
    addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && this.touch && !this.mouseMode && this.enabled && onGame(e)) this.setMouseMode(true);
    });
    addEventListener('mousedown', (e) => {
      if (!this.enabled || !onGame(e)) return;
      if (!this.locked && this.mouseMode) {
        this.requestLock();
        if (!this.touch) return; // desktop: first click only grabs the mouse
      }
      // Mac trackpads: Ctrl-click is the right click (scope), not fire + crouch.
      const btn = this._btn(e);
      if (btn === 2 && e.button === 0) this._ctrlScope = true;
      if (btn === 0) { this.mouseFire = true; this.pressedSet.add('Fire'); }
      if (btn === 2) {
        this.mouseScope = true;
        this.pressedSet.add('Scope');
      }
      // Extra buttons (MX Master and friends): middle = rangefinder, back = reload, forward = swap.
      if (e.button === 1) { this.pressedSet.add('range'); e.preventDefault(); }
      if (e.button === 3) { this.pressedSet.add('reload'); e.preventDefault(); }
      if (e.button === 4) { this.pressedSet.add('swap'); e.preventDefault(); }
    });
    addEventListener('mouseup', (e) => {
      if (e.button === 0 && this._ctrlScope) { this._ctrlScope = false; this.mouseScope = false; return; }
      if (e.button === 0) this.mouseFire = false;
      if (e.button === 2) this.mouseScope = false;
      if (e.button === 3 || e.button === 4) e.preventDefault(); // don't navigate back/forward
    });
    this.canvas.addEventListener('auxclick', (e) => e.preventDefault());
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('mousemove', (e) => {
      // Locked pointer, or (iPad without pointer lock) relative motion of the cursor.
      if (!this.enabled || !(this.locked || (this.mouseMode && this.touch && e.pointerType !== 'touch'))) return;
      this.look.x += e.movementX;
      this.look.y += e.movementY;
      if (e.movementX || e.movementY) this.kbmT = performance.now();
    });
    addEventListener('wheel', (e) => {
      if (!this.enabled) return;
      // Horizontal scroll (the MX Master thumb wheel) dials the zero; vertical zooms.
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        this.zeroAcc = (this.zeroAcc || 0) + e.deltaX;
        if (Math.abs(this.zeroAcc) >= 40) {
          this.pressedSet.add(this.zeroAcc > 0 ? 'zeroup' : 'zerodown');
          this.zeroAcc = 0;
        }
        return;
      }
      // Vertical: one step per notch of a wheel, but a trackpad's two-finger scroll sends a
      // stream of tiny deltas (with momentum): add them up and step at most every 120 ms.
      if (e.deltaY !== 0) {
        this.wheelAcc = (this.wheelAcc || 0) + e.deltaY * (e.deltaMode ? 40 : 1);
        const now = performance.now();
        if (Math.abs(this.wheelAcc) >= 50 && now - (this.wheelT || 0) > 120) {
          this.pressedSet.add(this.wheelAcc < 0 ? 'ZoomIn' : 'ZoomOut');
          this.wheelAcc = 0;
          this.wheelT = now;
        }
        clearTimeout(this._wheelReset);
        this._wheelReset = setTimeout(() => { this.wheelAcc = 0; }, 200);
      }
    }, { passive: true });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.canvas;
    });
  }

  get _isMac() { return /Mac/i.test(navigator.platform || navigator.userAgent) && !this.touch; }
  // Which button this is: on a Mac, Ctrl + click is the trackpad's right click.
  _btn(e) {
    return e.button === 0 && e.ctrlKey && this._isMac ? 2 : e.button;
  }

  setMouseMode(on) {
    this.mouseMode = on;
    document.body.classList.toggle('mouse-mode', on && this.touch);
    if (on && this.enabled) this.requestLock();
  }

  requestLock() {
    if (!this.mouseMode) return;
    // A refused lock (no user gesture yet) must not surface as an unhandled rejection:
    // the next click on the canvas asks again.
    const quiet = (p) => { if (p && p.catch) p.catch(() => {}); };
    try {
      const p = this.canvas.requestPointerLock({ unadjustedMovement: true });
      if (p && p.catch) p.catch(() => quiet(this.canvas.requestPointerLock()));
    } catch {
      try { quiet(this.canvas.requestPointerLock()); } catch {}
    }
  }

  // Touch: fixed joystick bottom-left; any touch that isn't on a control aims (either thumb,
  // each with its own sensitivity); buttons are listed in index.html with data-act.
  _bindTouch(root) {
    root.classList.add('on');
    const stick = root.querySelector('.stick');
    const knob = root.querySelector('.knob');
    let moveId = null;
    const looks = new Map(); // touch id -> { x, y, side }
    const R = 56;
    const stickCenter = () => {
      const r = stick.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, reach: r.width * 0.75 };
    };
    const setStick = (t) => {
      const c = stickCenter();
      let dx = t.clientX - c.x, dy = t.clientY - c.y;
      const d = Math.hypot(dx, dy);
      if (d > R) { dx *= R / d; dy *= R / d; }
      this.move.x = dx / R;
      this.move.y = dy / R;
      knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
      stick.classList.toggle('run', this.move.y < -0.9);
    };
    root.addEventListener('touchstart', (e) => {
      if (!this.enabled) return;
      for (const t of e.changedTouches) {
        const btn = t.target.closest && t.target.closest('[data-act]');
        if (btn) {
          const act = btn.dataset.act;
          this.pressedSet.add(act);
          this.keys.add('T:' + act);
          btn.classList.add('down');
          btn._tid = t.identifier;
          if (navigator.vibrate && act === 'fire') navigator.vibrate(8);
          continue;
        }
        const c = stickCenter();
        if (moveId === null && Math.hypot(t.clientX - c.x, t.clientY - c.y) < c.reach) {
          moveId = t.identifier;
          stick.classList.add('active');
          setStick(t);
        } else {
          looks.set(t.identifier, { x: t.clientX, y: t.clientY, side: t.clientX < innerWidth / 2 ? 'L' : 'R' });
          if (this.onLookTouch) this.onLookTouch('start', t);
        }
      }
      e.preventDefault();
    }, { passive: false });
    root.addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === moveId) setStick(t);
        else if (looks.has(t.identifier)) {
          const l = looks.get(t.identifier);
          // A mode can claim a look touch (e.g. a press-and-hold menu): then it doesn't aim.
          if (this.onLookTouch && this.onLookTouch('move', t)) { l.x = t.clientX; l.y = t.clientY; continue; }
          const k = 2.2 * (l.side === 'L' ? this.touchSensL : this.touchSensR);
          this.look.x += (t.clientX - l.x) * k;
          this.look.y += (t.clientY - l.y) * k;
          l.x = t.clientX;
          l.y = t.clientY;
        }
      }
      e.preventDefault();
    }, { passive: false });
    const end = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === moveId) {
          moveId = null;
          this.move.x = this.move.y = 0;
          stick.classList.remove('active', 'run');
          knob.style.transform = 'translate(-50%,-50%)';
        }
        if (looks.has(t.identifier) && this.onLookTouch) this.onLookTouch('end', t);
        looks.delete(t.identifier);
        root.querySelectorAll('[data-act]').forEach((b) => {
          if (b._tid === t.identifier) {
            b.classList.remove('down');
            this.keys.delete('T:' + b.dataset.act);
            b._tid = null;
          }
        });
      }
    };
    root.addEventListener('touchend', end);
    root.addEventListener('touchcancel', end);
    this.touchRoot = root;
    const relayout = () => requestAnimationFrame(() => this.layoutTouch());
    addEventListener('resize', relayout);
    addEventListener('orientationchange', relayout);
    relayout();
  }

  // Place controls on arcs around where each thumb naturally rests, inset from the
  // corners and clear of notches / rounded corners.
  layoutTouch() {
    const root = this.touchRoot;
    if (!root) return;
    const probe = document.createElement('div');
    probe.style.cssText = 'position:fixed;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);visibility:hidden';
    document.body.appendChild(probe);
    const cs = getComputedStyle(probe);
    const safe = { t: parseFloat(cs.paddingTop) || 0, r: parseFloat(cs.paddingRight) || 0, b: parseFloat(cs.paddingBottom) || 0, l: parseFloat(cs.paddingLeft) || 0 };
    probe.remove();
    const W = innerWidth, H = innerHeight;
    const s = Math.min(1, H / 390); // scale the rings down a little on short screens
    const place = (sel, x, y) => {
      const el = root.querySelector(sel);
      if (!el) return;
      el.classList.add('placed');
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
    };
    const arc = (cx, cy, r, deg) => [cx + Math.cos((deg * Math.PI) / 180) * r * s, cy - Math.sin((deg * Math.PI) / 180) * r * s];
    // Right thumb: FIRE at rest, inner ring for aiming controls, outer ring for rifle setup.
    const fx = W - safe.r - 128 * s, fy = H - safe.b - 108 * s;
    place('.fire-r', fx, fy);
    place('.tb.scope', ...arc(fx, fy, 104, 84)); // scope above FIRE (bigger), reload to its left
    place('.tb.zin', ...arc(fx, fy, 104, 118));
    place('.tb.zout', ...arc(fx, fy, 104, 147));
    place('.tb.reload', ...arc(fx, fy, 100, 186));
    place('.tb.jump', ...arc(fx, fy, 96, 46));
    place('.tb.zdn', ...arc(fx, fy, 176, 176));
    place('.tb.zup', ...arc(fx, fy, 176, 153));
    place('.tb.rng', ...arc(fx, fy, 176, 130));
    place('.tb.swp', ...arc(fx, fy, 176, 107));
    // Left thumb: fixed stick, with fire / breath / stance on an arc above-right of it.
    const sx = safe.l + 120 * s, sy = H - safe.b - 108 * s;
    place('.stick', sx, sy);
    place('.fire-l', ...arc(sx, sy, 128, 14));
    place('.tb.breath', ...arc(sx, sy, 124, 52));
    place('.tb.crouch', ...arc(sx, sy, 118, 92));
    place('.tb.prone', ...arc(sx, sy, 122, 128));
    place('.tb.bipodb', ...arc(sx, sy, 196, 78));
  }

  // ---- Gyro aiming ------------------------------------------------------------
  // Must be called from a user gesture on iOS (permission prompt).
  requestGyro() {
    if (this.gyroMode === 'off') return;
    // Listen right away; on iOS events only start flowing once permission is granted.
    if (!this._gyroBound) {
      this._gyroBound = true;
      addEventListener('devicemotion', (e) => this._onMotion(e));
    }
    const DM = window.DeviceMotionEvent;
    if (DM && typeof DM.requestPermission === 'function' && !this._gyroAsked) {
      this._gyroAsked = true;
      DM.requestPermission().catch(() => { this._gyroAsked = false; });
    }
  }

  _onMotion(e) {
    const r = e.rotationRate;
    if (!r || !this.enabled || this.gyroMode === 'off') return;
    if (this.gyroMode === 'scoped' && !this.isScoped) return;
    let dt = e.interval || 16;
    dt = dt > 1 ? dt / 1000 : dt; // ms (spec) or seconds (older Safari)
    const toRad = Math.PI / 180;
    const ang = (screen.orientation && screen.orientation.angle) ?? window.orientation ?? 0;
    const a = ((ang % 360) + 360) % 360;
    // Map device rotation rates to screen yaw/pitch for the current orientation.
    let yawRate, pitchRate;
    if (a === 90) { yawRate = -(r.beta || 0); pitchRate = -(r.gamma || 0); }
    else if (a === 270) { yawRate = r.beta || 0; pitchRate = r.gamma || 0; }
    else { yawRate = -(r.gamma || 0); pitchRate = r.beta || 0; }
    // Convert radians of real rotation into look units (1:1 unscoped at sensitivity 1).
    const k = (dt * toRad * this.gyroSens) / 0.0022;
    this.look.x += yawRate * k;
    this.look.y += pitchRate * -k * (this.gyroInvertY ? -1 : 1);
  }

  held(code) {
    return this.keys.has(code);
  }
  pressed(code) {
    return this.pressedSet.has(code);
  }

  // ---- Gamepad (PS5 DualSense, Xbox and others with the standard mapping) ------------------
  // Call once per frame before reading actions. Buttons become the same key codes the keyboard
  // sends (so every mode reads them unchanged); the sticks move and aim; the triggers fire and
  // scope. Layout (PlayStation names):
  //   L stick move · R stick aim · R2 fire · L2 aim / scope · R1 ping / mark (hold: wheel)
  //   L1 ability (camo / drone) · X jump · O crouch (hold: prone) · [] use, or reload (hold:
  //   round type) · /\ next weapon · L3 sprint (scoped: hold breath) · R3 knife
  //   d-pad: up NV, down IFAK, left sticky / binoculars, right sync · touchpad deadeye / hack
  //   Create: tablet / map · Options: pause
  pollPad(dt) {
    if (!navigator.getGamepads || !this.enabled) return;
    if (!this._padLive) { this._padScan = (this._padScan || 0) - dt; if (this._padScan > 0) return; this._padScan = 0.5; }
    let gp = null;
    try { for (const g of navigator.getGamepads() || []) if (g && g.connected !== false && g.buttons && g.axes && (!gp || (g.mapping === 'standard' && gp.mapping !== 'standard'))) gp = g; } catch {}
    const was = this._padLive;
    this._padLive = !!gp;
    this.pad = gp;
    if (!gp) { if (was) this._padRelease(); return; }
    if (!was) this.onPad && this.onPad(gp.id);
    const bt = gp.buttons, ax = gp.axes, down = (i) => !!bt[i] && (bt[i].pressed || bt[i].value > 0.5);
    const DZ = 0.16, want = new Set();
    let used = false;
    // Left stick: move (radial dead zone, rescaled from its edge).
    let x = ax[0] || 0, y = ax[1] || 0, m = Math.hypot(x, y);
    if (m > DZ) { const f = Math.min(1, (m - DZ) / (1 - DZ)) / m; this.move.x = x * f; this.move.y = y * f; this._padMove = true; used = true; }
    else if (this._padMove) { this.move.x = this.move.y = 0; this._padMove = false; }
    // Right stick: aim. Squared response: fine near the centre, quick at the rim.
    x = ax[2] || 0; y = ax[3] || 0; m = Math.hypot(x, y);
    if (m > DZ) {
      const n = Math.min(1, (m - DZ) / (1 - DZ)), v = n * n * (this.padLook || 1100) * dt;
      this.look.x += (x / m) * v; this.look.y += (y / m) * v; used = true;
    }
    // Triggers.
    const fire = down(7), scope = down(6);
    if (fire && !this.padFire) this.pressedSet.add('Fire');
    this.padFire = fire; this.padScope = scope;
    // Face buttons, shoulders, d-pad: as keys.
    const MAP = { 0: 'Space', 3: 'swap', 4: 'KeyF', 5: 'KeyQ', 8: 'Tab', 11: 'KeyV', 12: 'KeyN', 13: 'KeyG', 14: 'KeyX', 15: 'KeyT', 17: 'KeyH' };
    for (const [i, code] of Object.entries(MAP)) if (down(+i)) want.add(code);
    // O: tap crouch, hold prone.
    const o = down(1);
    if (o) { this._oT = (this._oT || 0) + dt; if (this._oT > 0.4 && !this._oDone) { this._oDone = true; this.pressedSet.add('KeyZ'); } }
    else { if (this._oT > 0 && !this._oDone) this.pressedSet.add('KeyC'); this._oT = 0; this._oDone = false; }
    // []: use when there's something to use, otherwise reload (held, so hold = round type).
    const sq = down(2);
    if (sq && !this._sqCode) this._sqCode = this.useAvail ? 'KeyE' : 'KeyR';
    if (sq) want.add(this._sqCode); else this._sqCode = null;
    // L3: sprint (click to run until you stop), or hold breath while scoped.
    const l3 = down(10);
    if (scope) { if (l3) want.add('ShiftLeft'); this._padSprint = false; }
    else {
      if (l3 && !this._l3) this._padSprint = !this._padSprint;
      if (this._padSprint && (Math.hypot(this.move.x, this.move.y) < 0.3 || fire)) this._padSprint = false;
      if (this._padSprint) want.add('ShiftLeft');
    }
    this._l3 = l3;
    if (down(9) && !this._opt) this.pressedSet.add('PadStart');
    this._opt = down(9);
    // Apply: press what's new, release what we were holding and no longer are.
    this._padKeys = this._padKeys || new Set();
    for (const c of want) { if (!this._padKeys.has(c)) { if (!this.keys.has(c)) this.pressedSet.add(c); this.keys.add(c); this._padKeys.add(c); } }
    for (const c of [...this._padKeys]) if (!want.has(c)) { this.keys.delete(c); this._padKeys.delete(c); }
    if (used || fire || scope || want.size || o || sq) this.padT = performance.now();
  }
  _padRelease() {
    for (const c of this._padKeys || []) this.keys.delete(c);
    this._padKeys = new Set();
    this.padFire = this.padScope = false;
    if (this._padMove) { this.move.x = this.move.y = 0; this._padMove = false; }
  }
  // Which you're using right now: the controller, or keyboard and mouse.
  get usingPad() { return !!this._padLive && (this.padT || 0) > (this.kbmT || 0); }
  // A rumble, where the browser supports it (Chrome / Edge with a DualSense or Xbox pad).
  rumble(strong = 0.5, weak = 0.5, ms = 80) {
    const a = this.pad && this.pad.vibrationActuator;
    if (!a || !this.usingPad) return;
    try { a.playEffect && a.playEffect('dual-rumble', { duration: ms, strongMagnitude: strong, weakMagnitude: weak }); } catch {}
  }

  // Called once per frame after the game consumed the input.
  endFrame() {
    this.pressedSet.clear();
    this.look.x = this.look.y = 0;
  }

  // Aggregated actions.
  get actions() {
    const k = (c) => this.keys.has(c);
    const p = (c) => this.pressedSet.has(c);
    let mx = this.move.x, my = this.move.y;
    if (k('KeyA') || k('ArrowLeft')) mx -= 1;
    if (k('KeyD') || k('ArrowRight')) mx += 1;
    if (k('KeyW') || k('ArrowUp')) my -= 1;
    if (k('KeyS') || k('ArrowDown')) my += 1;
    const len = Math.hypot(mx, my);
    if (len > 1) { mx /= len; my /= len; }
    let scopeHeld;
    if (this.touch && p('Scope')) {
      // Mouse right-click on a touch device: toggle like the SCOPE button, or hold.
      if (this.scopeToggle) this.scopeLatched = !this.scopeLatched;
    }
    if (this.touch && this.mouseMode && !this.scopeToggle && this.mouseScope) {
      scopeHeld = true;
      if (p('scope')) this.scopeLatched = !this.scopeLatched;
    } else if (this.touch) {
      if (p('scope')) this.scopeLatched = !this.scopeLatched;
      scopeHeld = this.scopeLatched;
    } else if (this.scopeToggle) {
      if (p('Scope')) this.scopeLatched = !this.scopeLatched;
      scopeHeld = this.scopeLatched;
    } else scopeHeld = this.mouseScope;
    if (this.padScope) scopeHeld = true;
    if (p('breath')) this.breathLatched = !this.breathLatched;
    return {
      mx, my,
      sprint: k('ShiftLeft') || k('ShiftRight') || k('T:sprint') || this.move.y < -0.9,
      breath: k('ShiftLeft') || k('ShiftRight') || this.breathLatched,
      fire: p('Fire') || p('fire'),
      fireHeld: this.mouseFire || k('T:fire') || !!this.padFire,
      scope: scopeHeld,
      zoomIn: p('ZoomIn') || p('zoomin') || p('Equal'),
      zoomOut: p('ZoomOut') || p('zoomout') || p('Minus'),
      zeroUp: p('KeyE') || p('PageUp') || p('zeroup'),
      zeroDown: p('KeyQ') || p('PageDown') || p('zerodown'),
      crouch: p('KeyC') || (p('ControlLeft') && !this._isMac) || p('crouch'), // Mac: Ctrl-click is the right click
      prone: p('KeyZ') || p('prone'),
      jump: p('Space') || p('jump'),
      reload: p('KeyR') || p('reload'),
      range: p('KeyF') || p('range'),
      scout: p('KeyT') || p('scout'),
      tactical: p('KeyG') || p('tactical'),
      loadout: p('KeyL') || p('loadout'),
      feed: p('KeyU') || p('feed'),
      supply: p('KeyV') || p('supply'),
      bipod: p('KeyX') || p('bipod'),
      slot1: p('Digit1'),
      slot2: p('Digit2'),
      swap: p('swap'),
      touchZoom: p('zoomin') || p('zoomout'),
      scoreboard: k('Tab'),
      lookX: this.look.x * this.sensitivity,
      lookY: this.look.y * this.sensitivity * (this.invertY ? -1 : 1),
    };
  }

  resetScope() {
    this.scopeLatched = false;
    this.breathLatched = false;
  }

  // Reflect toggle states on the touch buttons.
  syncToggles() {
    if (!this.touchRoot) return;
    for (const b of this.touchRoot.querySelectorAll('[data-toggle]')) {
      b.classList.toggle('on', b.dataset.toggle === 'scope' ? this.scopeLatched : this.breathLatched);
    }
  }
}

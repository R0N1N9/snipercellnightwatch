// Sniper Cell — QUICKHACKS (spotter / lone operative). Hold TAB: your left hand brings up
// your phone, the HUD drops into scan mode (time slows when you play solo) and everything
// hackable in view gets tagged. Look at one, pick a hack (mouse wheel or 1/2), click (or E)
// to run it: thumb on the screen, a short upload, done. Release TAB to put the phone away.
//   camera   LOOP CAMERA (its feed goes to the console)    drone   SHORT CIRCUIT (8 s)
//   device   DISTRACT (IoT noise)                          door    OPEN (electronic locks only)
//   light    CUT LIGHT (20 s)                              guard   JAM COMMS · REBOOT OPTICS (blind 6 s)
// Quickhacks bypass the CYBER OPS console, so they still work after ICE knocks it offline.
// Each costs bandwidth.
import * as THREE from 'three';
import { glove } from './nvg.js';
import { PAYLOAD } from './ops.js';
import { Wheel } from './wheel.js';

const RANGE = 45;
const OPTS = {
  cam: [{ k: 'cam', name: 'LOOP CAMERA', bw: 6 }],
  drone: [{ k: 'pdrone', name: 'SHORT CIRCUIT', bw: 8 }],
  iot: [{ k: 'iot', name: 'DISTRACT', bw: 6 }],
  door: [{ k: 'door', name: 'OPEN DOOR', bw: 6 }],
  light: [{ k: 'plight', name: 'CUT LIGHT', bw: 4 }],
  guard: [{ k: 'jam', name: 'JAM COMMS', bw: 6 }, { k: 'blind', name: 'REBOOT OPTICS', bw: 10 }],
};
const EXEC = 0.6;
// Commands at the spot under your crosshair (when nothing hackable is targeted): the console's
// payloads, sent from the phone. Same costs and cooldowns as the tablet.
// What the shooter can request at the crosshair (keys 4–9, or press-and-hold on touch).
export const SHOOTER_REQ = [
  { k: 'supply', name: 'SUPPLY' },
  { k: 'scan', name: 'SCAN' },
  { k: 'emp', name: 'EMP' },
  { k: 'decoy', name: 'DECOY' },
  { k: 'lights', name: 'LIGHTS' },
  { k: 'drone', name: 'DRONE' },
  { k: 'supplyme', name: 'SUPPLY ON ME', req: 'supply', me: true }, // the supply drone drops it at your feet
];
// Console commands at the crosshair, in the tablet's order (so the number keys match).
export const CMDS = [
  { k: 'scan', name: 'PULSE SCAN', p: 'scan' },
  { k: 'jam', name: 'JAM EARPIECES', p: 'jam' },
  { k: 'emp', name: 'EMP', p: 'emp' },
  { k: 'supply', name: 'SUPPLY DROP', p: 'supply' },
  { k: 'lights', name: 'CUT LIGHTS', p: 'lights' },
  { k: 'spoof', name: 'SPOOF CAMS', p: 'spoof' },
  { k: 'decoy', name: 'DECOY PING', p: 'decoy' },
  { k: 'drone', name: 'RECON DRONE', p: 'quad' },
  { k: 'medevac', name: 'MEDEVAC DRONE', p: 'medevac' },
  { k: 'sweep', name: 'ISR SWEEP', p: null, bw: 0 }, // key 0: the Predator sweeps the spot
];

function buildPhone() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.068, 0.135, 0.009), new THREE.MeshLambertMaterial({ color: '#15171b', emissive: '#15171b', emissiveIntensity: 0.3 }));
  g.add(body);
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 0.122), new THREE.MeshBasicMaterial({ color: '#0e5a52' }));
  scr.position.z = 0.0051;
  g.add(scr);
  const bar = new THREE.Mesh(new THREE.PlaneGeometry(0.044, 0.008), new THREE.MeshBasicMaterial({ color: '#30ffd0' }));
  bar.position.set(0, -0.035, 0.0056);
  g.add(bar);
  const hand = glove();
  // Gripping it from below: fingers up the back of the phone, wrist dropping out of view.
  hand.position.set(0.006, -0.07, -0.016);
  hand.rotation.set(1.27, 0, -0.1);
  hand.scale.setScalar(0.85);
  g.add(hand);
  g.userData = { scr, bar };
  return g;
}

export const Phone = {
  _phoneInit() {
    this.qh = { on: false, k: 0, target: null, list: [], opt: 0, exec: null, scanT: 0, press: 0 };
    this.phoneObj = buildPhone();
    this.phoneObj.visible = false;
    this.phoneObj.traverse((o) => { o.renderOrder = 12; o.frustumCulled = false; });
    this.camera.add(this.phoneObj);
    addEventListener('wheel', (e) => { if (this.qh.on) this._qhWheel = Math.sign(e.deltaY); }, { passive: true });
    addEventListener('mousedown', (e) => { if (this.qh.on && e.button === 0 && !this._qhHit(e.clientX, e.clientY)) this._qhClick = true; });
    // Tap / click an option row to pick it and run it (caught before the touch controls).
    const tap = (e) => {
      if (!this.qh.on) return;
      const pt = e.touches ? e.touches[0] : e;
      if (!pt || !this._qhHit(pt.clientX, pt.clientY)) return;
      e.preventDefault();
      e.stopPropagation();
    };
    addEventListener('touchstart', tap, { capture: true, passive: false });
    addEventListener('pointerdown', tap, { capture: true, passive: false });
  },

  // An option row under this screen point? Picks it and queues the run.
  _qhHit(x, y) {
    const Q = this.qh;
    for (const r of Q.rects || []) {
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
        if (performance.now() - (this._qhTapT || 0) < 250) return true;
        this._qhTapT = performance.now();
        Q.opt = r.i;
        this._qhClick = true;
        return true;
      }
    }
    return false;
  },

  // A quick phone gesture outside quickhack mode (e.g. a wheel request): up, thumb tap, down.
  _phonePulse() {
    this.qh.pulse = 1;
    this.qh.pulseT = 0;
  },

  _qhCan() {
    return (this.role === 'spotter' || this.operative) && !this.downed && !this.kia && !this.tablet.visible && !this.isr.active && !(this.quad && this.quad.active) && !this.ended;
  },
  _qhEnter() {
    if (!this._qhCan()) return;
    const Q = this.qh;
    Q.on = true;
    Q.scanT = 0;
    Q.opt = 0;
    this._qhClick = false;
    this.sfx.ui(true);
    this.hud.root.classList.add('qh');
  },
  _qhExit() {
    const Q = this.qh;
    if (!Q.on) return;
    Q.on = false;
    Q.target = null;
    Q.list = [];
    this.hud.root.classList.remove('qh');
    this.sfx.ui(false);
  },

  _qhScan() {
    const cam = this.camera, o = cam.getWorldPosition(new THREE.Vector3()), dir = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    const S = this.sentinel, F = this.fac;
    const half = THREE.MathUtils.degToRad(cam.fov * 0.6);
    const lim = 0.07 * (62 / cam.fov);
    const list = [];
    let best = null, bs = lim;
    const consider = (kind, id, x, y, z, name) => {
      const v = new THREE.Vector3(x, y, z).sub(o), d = v.length();
      if (d > RANGE) return;
      const n = v.clone().normalize();
      const a = n.angleTo(dir);
      if (a > half) return;
      // Sight to a point just in front of it (wall-mounted kit sits inside its wall).
      if (!F.los(o, { x: x - n.x * 0.45, y: y - n.y * 0.45, z: z - n.z * 0.45 })) return;
      const e = { kind, id, x, y, z, name, d };
      list.push(e);
      if (a < bs) { bs = a; best = e; }
    };
    for (const c of S.cams) if (!c.hacked) consider('cam', c.id, c.x, c.y, c.z, 'CAMERA');
    for (const d of S.drones) if (d.state !== 'dead' && !(d.empT > 0)) consider('drone', d.id, d.x, d.y, d.z, 'PATROL DRONE');
    for (const D of F.devices) consider('iot', D.id, D.x, D.y, D.z, D.kind.toUpperCase());
    for (const d of Object.values(F.doors)) if ((d.kind === 'elec' || d.kind === 'dock') && !d.open && !d.sealed && !d.unlocked) consider('door', d.id, d.x, (d.y || 0) + 1.2, d.z, 'E-LOCK DOOR');
    for (const L of F.lightSources || []) if (!L.broken && !(L.offT > 0)) consider('light', L.id, L.x, L.y, L.z, L.kind === 'panel' ? 'CEILING PANEL' : 'LAMP');
    for (const g of S.guards) if (g.state !== 'dead') consider('guard', g.id, g.x, (g.y || 0) + 1.5, g.z, ({ scav: 'OFFICER', jugg: 'JUGGERNAUT', bulwark: 'BULWARK', titan: 'TITAN', overseer: 'OVERSEER' }[g.type] || 'GUARD'));
    return { list, best };
  },

  // Per frame (local). act is consumed while the phone is up (no shooting).
  _qhTick(dt, I, act) {
    const Q = this.qh;
    if (Q.on && !this._qhCan()) this._qhExit();
    Q.k += ((Q.on ? 1 : 0) - Q.k) * Math.min(1, dt * 9);
    Q.press = Math.max(0, Q.press - dt * 5);
    // A one-off gesture: up (0-0.3 s), thumb tap (0.35 s), down (0.75-1.05 s).
    let pk = 0;
    if (Q.pulse) {
      Q.pulseT += dt;
      const t = Q.pulseT;
      pk = t < 0.3 ? t / 0.3 : t < 0.75 ? 1 : Math.max(0, 1 - (t - 0.75) / 0.3);
      if (t >= 0.35 && !Q.pulsed) { Q.pulsed = true; Q.press = 1; this.audio.click(); }
      if (t > 1.05) { Q.pulse = 0; Q.pulsed = false; }
    }
    // The phone in your left hand.
    const ph = this.phoneObj;
    const k = Math.max(Q.k, pk);
    Q.vis = k; // the viewmodel's support hand lets go of the gun while the phone is up
    ph.visible = k > 0.02;
    if (ph.visible) {
      ph.position.set(-0.3 + 0.17 * k, -0.48 + 0.35 * k - Q.press * 0.012, -0.38 + 0.03 * k - Q.press * 0.01);
      ph.rotation.set(0.75 - 0.4 * k, 0.55 - 0.15 * k, 0.12);
      const U = ph.userData;
      U.scr.material.color.set(Q.press > 0.3 ? '#bffff2' : Q.exec ? '#1aa08c' : '#0e5a52');
      U.bar.scale.x = Q.exec ? Math.max(0.05, Q.exec.t / EXEC) : 0.3 + 0.2 * Math.sin(this.t * 4);
    }
    if (!Q.on) { Q.exec = null; return; }
    const fired = act.fire;
    act.fire = act.fireHeld = act.scope = false; act.reload = false; act.slot1 = act.slot2 = act.swap = false; act.zoomIn = act.zoomOut = false;
    // Running hack.
    if (Q.exec) {
      Q.exec.t += dt;
      if (Q.exec.t >= EXEC) { const e = Q.exec; Q.exec = null; this._qhRun(e.tg, e.opt); Q.scanT = 0; }
      this._qhClick = false;
      return;
    }
    Q.scanT -= dt;
    if (Q.scanT <= 0) {
      Q.scanT = 0.15;
      const r = this._qhScan();
      Q.list = r.list;
      const prev = Q.target ? Q.target.kind + Q.target.id : 'cmd';
      // Nothing hackable under the crosshair: commands at the spot you're aiming at.
      Q.target = r.best || (this.ops ? { kind: 'cmd', id: 0, name: 'COMMANDS', at: this._aimPoint() } : null);
      if (Q.target && Q.target.kind === 'cmd') { const a = Q.target.at, P = this.player.pos; Q.target.d = a ? Math.hypot(a.x - P.x, a.z - P.z) : 0; }
      if (!Q.target || (Q.target.kind + Q.target.id) !== prev) Q.opt = 0;
    }
    const opts = Q.target ? (Q.target.kind === 'cmd' ? CMDS : OPTS[Q.target.kind]) : null;
    if (opts) {
      for (let i = 0; i < Math.min(opts.length, 10); i++) if (I.pressed('Digit' + ((i + 1) % 10))) Q.opt = i;
      if (this._qhWheel) { Q.opt = (Q.opt + (this._qhWheel > 0 ? 1 : opts.length - 1)) % opts.length; this._qhWheel = 0; }
      const go = fired || this._qhClick || I.pressed('KeyE') || I.pressed('cell-use');
      this._qhClick = false;
      if (go) {
        const o = opts[Q.opt];
        const cost = o.p ? (PAYLOAD[o.p] || {}).bw || 0 : o.bw;
        if (this.ops && this.ops.bw < cost) { this.hud.flash('NOT ENOUGH BANDWIDTH', 'red'); return; }
        Q.exec = { t: 0, tg: Q.target, opt: o };
        Q.press = 1;
        this.audio.click();
      }
    } else this._qhClick = false;
  },

  // Touch (spotter): press and hold on empty screen, drag toward a console command, lift to
  // drop it on the crosshair. The finger doesn't aim while the wheel is up.
  _cmdWheelInit() {
    if (this.cmdWheel !== undefined) return;
    this.cmdWheel = null;
    if (!this.input) return;
    const spot = this.role === 'spotter' || this.operative;
    const ICON = { supplyme: '⬇', scan: '◉', jam: '≋', emp: 'ϟ', supply: '▣', lights: '☾', spoof: '⟲', decoy: '♪', drone: '✦', medevac: '✚', sweep: '◎' };
    const SHORT = { 'SUPPLY ON ME': 'SUPPLY → ME', 'JAM EARPIECES': 'JAM', 'SPOOF CAMS': 'SPOOF', 'DECOY PING': 'DECOY', 'MEDEVAC DRONE': 'MEDEVAC', 'RECON DRONE': 'DRONE' };
    // One grouped wheel: commands (spotter) / requests (sniper) down the right, operator toggles
    // down the left, pings across the top and bottom.
    const list = spot ? CMDS : SHOOTER_REQ;
    const cols = (arr, side) => arr.map((o, i) => {
      const rows = Math.ceil(arr.length / 2), row = Math.floor(i / 2), col = i % 2;
      return { ...o, x: side * (col ? 1.12 : 0.6), y: rows > 1 ? -0.72 + (1.44 * row) / (rows - 1) : 0 };
    });
    const cmdItems = cols(list.map((o) => ({ k: o.k, label: SHORT[o.name] || o.name, group: spot ? 'cmd' : 'req', icon: ICON[o.k] || '•' })), 1);
    const TOG = spot
      ? [['cell-tab', 'TABLET', '▤'], ['cell-light', 'LIGHT', '☀'], ['cell-laser', 'LASER', '⟋'], ['cell-nv', 'NV', '◐'], ['cell-sup', 'SUPP', '▮'], ['cell-knife', 'STAB', '✕'], ['cell-chat', 'CHAT', '✉'], ...(this.net ? [['cell-mic', 'MIC', '🎙']] : [])]
      : [['cell-xr', 'ROUNDS', '⁂'], ['cell-breath', 'BREATH', '≋'], ['cell-tab', 'MAP', '▤'], ['cell-light', 'LIGHT', '☀'], ['cell-laser', 'LASER', '⟋'], ['cell-nv', 'NV', '◐'], ['cell-sup', 'SUPP', '▮'], ['cell-knife', 'STAB', '✕'], ['cell-chat', 'CHAT', '✉'], ...(this.net ? [['cell-mic', 'MIC', '🎙']] : [])];
    const togItems = cols(TOG.map(([a, l, ic]) => ({ k: 't:' + a, label: l, group: 'tog', icon: ic })), -1);
    const PINGS = [['look', 'LOOK', '◎'], ['enemy', 'ENEMY', '◆'], ['move', 'MOVE', '➤'], ['hold', 'HOLD', '✋'], ['regroup', 'ON ME', '⬤'], ['cover', 'COVER', '⛨'], ['sync', 'SYNC', '⦿'], ['perch', 'SNIPER POS', '⌖']];
    const pingItems = PINGS.map(([k, l, ic], i) => ({ k: 'p:' + k, label: l, group: 'comms', icon: ic, x: -0.69 + (i % 4) * 0.46, y: i < 4 ? -1.08 : 1.08 }));
    const W = (this.cmdWheel = new Wheel([...pingItems, ...cmdItems, ...togItems], { id: 'cell-cmdwheel', centre: spot ? 'COMMAND' : 'REQUEST', fallback: null }));
    let hold = null;
    this.input.onLookTouch = (type, t) => {
      if (type === 'start') {
        if (hold || !this._cmdWheelOk()) return false;
        const h = (hold = { id: t.identifier, x: t.clientX, y: t.clientY, open: false });
        h.timer = setTimeout(() => {
          if (hold !== h || !this._cmdWheelOk()) return;
          h.open = true;
          const e = this._crosshairEnemy && this._crosshairEnemy();
          this._cwAt = this._aimPoint();
          this._cwEnemy = e ? e.id : null;
          const L = this._wheelLabels ? this._wheelLabels() : {};
          W.show(h.x, h.y, spot ? 'COMMANDS \u2192 CROSSHAIR' : 'REQUESTS \u2192 CROSSHAIR', L.enemy ? { 'p:enemy': L.enemy } : {});
          this._phonePulse && this._phonePulse();
          navigator.vibrate && navigator.vibrate(12);
        }, 450);
        return false;
      }
      if (!hold || t.identifier !== hold.id) return false;
      if (type === 'move') {
        if (hold.open) { W.point(t.clientX, t.clientY); return true; }
        if (Math.hypot(t.clientX - hold.x, t.clientY - hold.y) > 14) { clearTimeout(hold.timer); hold = null; } // it's an aim drag
        return false;
      }
      // end
      clearTimeout(hold.timer);
      const was = hold.open;
      hold = null;
      if (!was) return false;
      const k = W.close();
      if (k && k.startsWith('t:')) { this.input.pressedSet.add(k.slice(2)); return true; } // a toggle: as if its button was tapped
      if (k && k.startsWith('p:')) { if (this._cmdWheelOk()) this._wheelPick(k.slice(2), this._cwAt || this._aimPoint(), this._cwEnemy); return true; }
      const o = k && list.find((c) => c.k === k);
      if (o && this._cmdWheelOk()) { if (spot) this._pointCmd(o); else this._requestPayload(o.req || o.k, o.me ? this._myPoint() : this._aimPoint()); }
      return true;
    };
  },
  // A couple of metres in front of you (where you're facing), for a drop "on me".
  _myPoint() {
    const P = this.player.pos, y = this.player.yaw;
    return { x: P.x - Math.sin(y) * 2.5, y: P.y, z: P.z - Math.cos(y) * 2.5 };
  },
  _cmdWheelOk() {
    // Never while scoped: that thumb is aiming.
    return !(this.player.scoped || this.player.scopeT > 0.1 || (this.bino && this.bino.on && this.bino.k > 0.1) || (this.qh && this.qh.on) || this.tablet.visible || this.isr.active || (this.quad && this.quad.active) || this.mini.open || this.downed || this.kia || this.paused || this.ended || (this.wheel && this.wheel.open) || (this.cine && this.cine.active));
  },

  // Spotter, outside the tablet: number keys 1–9 fire that console command straight at the
  // crosshair (same numbering as the tablet's payloads). The phone comes up and you tap it.
  _cmdKeys(I) {
    this._cmdWheelInit();
    if (this.cmdWheel && this.cmdWheel.open && !this._cmdWheelOk()) this.cmdWheel.cancel();
    if (this.xr && this.xr.menu) return; // the rounds menu has the number keys
    if (this.role === 'shooter' && !this.operative) {
      // Shooter: keys 4–9 request that support at the crosshair (1 / 2 / 3 are your weapons).
      if (this.tablet.visible || this.downed || this.kia || this.paused || (this._voteOpen && this._voteOpen())) return;
      // Shift+4: a supply drop in front of you.
      if (I.pressed('Digit4') && (I.held('ShiftLeft') || I.held('ShiftRight'))) { this._requestPayload('supply', this._myPoint()); return; }
      for (let i = 0; i < 6; i++) if (I.pressed('Digit' + (i + 4))) { this._requestPayload(SHOOTER_REQ[i].k, this._aimPoint()); return; }
      return;
    }
    if (!(this.role === 'spotter' || this.operative) || !this.ops) return;
    if ((this.qh && this.qh.on) || this.tablet.visible || this.isr.active || this.mini.open || this.downed || this.kia || this.paused) return;
    if (this._voteOpen && this._voteOpen()) return;
    const first = this.operative ? 3 : 1; // a lone operative keeps 1 / 2 for weapons
    for (let i = first; i <= CMDS.length; i++) if (I.pressed('Digit' + (i % 10))) { this._pointCmd(CMDS[i - 1]); return; }
  },
  _pointCmd(o) {
    const at = this._aimPoint();
    const why = this._runRequest(o.k, at);
    this._phonePulse && this._phonePulse();
    this.hud.flash(why ? `${o.name}: ${why}` : o.name, why ? 'red' : 'cyan', 0.9);
    if (!why) {
      this.sfx.ui(true);
      const p = PAYLOAD[o.p];
      if (((p && p.aim) || o.k === 'sweep') && at) this._addPin({ x: at.x, z: at.z, label: o.name, by: this.role });
    }
  },

  _qhRun(tg, o) {
    if (tg.kind === 'cmd') {
      // A console command at the aimed spot (costs and cooldowns handled by the console).
      const why = this._runRequest(o.k, tg.at || this._aimPoint());
      this.hud.flash(why ? `${o.name}: ${why}` : o.name, why ? 'red' : 'cyan', 0.9);
      if (!why) this.sfx.ui(true);
      return;
    }
    if (this.ops) this.ops.bw = Math.max(0, this.ops.bw - o.bw);
    this.sfx.ui(true);
    if (o.k === 'jam') this.payload('jam', { x: tg.x, z: tg.z });
    else this.payload(o.k, { id: tg.id });
    this.hud.flash(`QUICKHACK · ${o.name}`, 'cyan', 0.9);
  },

  // HUD: scan tint, tags on everything hackable in view, and the hack menu on your target.
  _qhHud(c, proj, W, H) {
    const Q = this.qh;
    if (!Q || Q.k < 0.05) return;
    c.save();
    c.globalAlpha = Q.k;
    c.fillStyle = 'rgba(0,30,34,0.28)';
    c.fillRect(0, 0, W, H);
    c.fillStyle = 'rgba(48,255,208,0.05)';
    for (let y = (this.t * 60) % 4; y < H; y += 4) c.fillRect(0, y, W, 1);
    const vg = c.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.7);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,20,24,0.55)');
    c.fillStyle = vg;
    c.fillRect(0, 0, W, H);
    c.textAlign = 'center';
    c.font = '700 14px JetBrains Mono, monospace';
    c.fillStyle = 'rgba(48,255,208,0.95)';
    c.fillText(`QUICKHACK${this.solo ? ' · TIME SLOWED' : ''}  ·  BW ${this.ops ? Math.round(this.ops.bw) : '--'}`, W / 2, 88);
    if (!Q.on) { c.restore(); return; }
    c.font = '600 10px JetBrains Mono, monospace';
    for (const e of Q.list) {
      const p = proj(e.x, e.y, e.z);
      if (p.behind) continue;
      const sel = Q.target && e.kind === Q.target.kind && e.id === Q.target.id;
      c.strokeStyle = sel ? 'rgba(255,255,255,0.95)' : e.kind === 'guard' ? 'rgba(255,90,110,0.85)' : 'rgba(48,255,208,0.8)';
      c.lineWidth = sel ? 2 : 1;
      const r = sel ? 14 : 8;
      c.beginPath();
      for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 + Math.PI / 6; const x = p.x + Math.cos(a) * r, y = p.y + Math.sin(a) * r; if (i) c.lineTo(x, y); else c.moveTo(x, y); }
      c.closePath(); c.stroke();
      if (!sel) { c.fillStyle = c.strokeStyle; c.fillText(e.name, p.x, p.y - r - 4); }
    }
    const tg = Q.target;
    Q.rects = [];
    if (tg) {
      const cmd = tg.kind === 'cmd';
      let ax = W / 2 + 40, ay = H / 2 - 40;
      if (cmd) {
        // Where the command lands: a ring on the ground under the crosshair.
        if (tg.at) {
          const g = proj(tg.at.x, this.fac.groundAt(tg.at.x, tg.at.z, 60, 0.5) + 0.2, tg.at.z);
          if (!g.behind) { c.strokeStyle = 'rgba(48,255,208,0.8)'; c.lineWidth = 1.5; c.beginPath(); c.ellipse(g.x, g.y, 18, 7, 0, 0, Math.PI * 2); c.stroke(); }
        }
      } else {
        const p = proj(tg.x, tg.y, tg.z);
        if (p.behind) { c.restore(); return; }
        ax = p.x + 26; ay = p.y - 30;
      }
      const opts = cmd ? CMDS : OPTS[tg.kind];
      const rowH = 26, w = 230, h = 34 + opts.length * rowH;
      const x = Math.min(W - w - 16, ax), y = Math.min(H - h - 150, Math.max(110, ay));
      c.textAlign = 'left';
      c.fillStyle = 'rgba(2,12,14,0.86)';
      c.fillRect(x, y, w, h);
      c.strokeStyle = 'rgba(48,255,208,0.9)';
      c.lineWidth = 1;
      c.strokeRect(x, y, w, h);
      c.fillStyle = '#e8fffb';
      c.font = '700 12px JetBrains Mono, monospace';
      c.fillText(cmd ? `COMMANDS \u00B7 ${Math.round(tg.d || 0)} m` : `${tg.name} \u00B7 ${Math.round(tg.d)} m`, x + 10, y + 18);
      opts.forEach((o, i) => {
        const yy = y + 28 + i * rowH;
        const on = i === Q.opt;
        const cost = o.p ? (PAYLOAD[o.p] || {}).bw || 0 : o.bw;
        const cd = o.p && this.ops ? this.ops.cd[o.p] || 0 : 0;
        if (on) { c.fillStyle = 'rgba(48,255,208,0.25)'; c.fillRect(x + 4, yy, w - 8, rowH - 4); }
        c.fillStyle = cd > 0 ? 'rgba(200,240,235,0.35)' : on ? '#30ffd0' : 'rgba(200,240,235,0.8)';
        c.font = `${on ? 700 : 600} 12px JetBrains Mono, monospace`;
        c.fillText(`${i + 1}  ${o.name}`, x + 10, yy + 16);
        c.textAlign = 'right';
        c.fillText(cd > 0 ? `${Math.ceil(cd)}s` : cost ? `${cost} BW` : '', x + w - 10, yy + 16);
        c.textAlign = 'left';
        Q.rects.push({ i, x: x + 4, y: yy, w: w - 8, h: rowH - 4 });
      });
      if (Q.exec) {
        c.fillStyle = '#30ffd0';
        c.fillRect(x, y + h + 4, w * Math.min(1, Q.exec.t / EXEC), 4);
      }
    }
    c.textAlign = 'center';
    c.font = '600 12px JetBrains Mono, monospace';
    c.fillStyle = 'rgba(200,240,235,0.85)';
    c.fillText(this.input.touch ? 'TAP AN OPTION  \u00B7  HACK \u2014 PUT AWAY' : 'CLICK / E \u2014 RUN  \u00B7  WHEEL / NUMBER \u2014 CHOOSE  \u00B7  RELEASE TAB \u2014 PUT AWAY', W / 2, H - 140);
    c.restore();
  },
};

export function installPhone(Cls) {
  for (const k of Object.keys(Phone)) Cls.prototype[k] = Phone[k];
}

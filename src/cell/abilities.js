// Sniper Cell — the shooter's field craft and a few shared tricks:
//   GHILLIE FREEZE   prone and dead still for 2 s: nearly invisible past ~15 m (firing breaks it)
//   BREATH / WIND    hold SHIFT on the glass: the view slows and the sway stops for a few seconds;
//                    a wind readout and a hold-off dot in the scope (the .50 drifts in the wind)
//   MARKED FOR DEATH three kills on tagged enemies inside 10 s each: Deadeye back, camo full
//   OVERWATCH LOCK   hold the scope steady on an area for 1.5 s: everything near your point of aim
//                    is marked for the team while you hold it (your partner sees the ring)
//   COUNTER-SNIPER   the tower snipers' sightlines show as red lasers (shooter only)
//   SPOTTER RELAY    tagged enemies off your screen get an arrow at the edge (shooter)
//   CAMERA DART      9: fire a camera dart into a wall or the ground; it marks what's in front of
//                    it and feeds the tablet (three darts)
//   BODY DRAG        hold E on a body to drag it (both roles); let go to drop it in the dark
// and the first-use hint cards for every ability.
import * as THREE from 'three';

export const HINTS = {
  deadeye: ['DEADEYE (H)', 'Sweep your crosshair over up to three enemies to mark them, then pull the trigger: Ra drops the rifle to his left hand, draws the M50 and drops all three, one after another.'],
  execute: ['MARK & EXECUTE (T)', 'Mark enemies (Q), then press T: Ra snaps through every marked target in line of sight, one suppressed shot each. Earn charges with silent takedowns.'],
  lure: ['LURE (X)', 'Throw a noise-maker. Patrols walk over to check it, off their route and into your sights.'],
  camo: ['ACTIVE CAMO (G)', 'Breaks line of sight: guards, cameras and drones can\u2019t see you past arm\u2019s length. Moving drains it; hold still and it slowly recharges even while on. Firing breaks it.'],
  rounds: ['ROUNDS (Z)', 'Pick a magazine: Standard goes through bodies; Explosive sticks and blows; Penetrator punches through walls and shields; EMP kills electronics and radios.'],
  ghillie: ['GHILLIE FREEZE', 'Prone and dead still: you all but vanish past ~15 m. Move or fire and it breaks.'],
  breath: ['BREATH CONTROL (SHIFT)', 'Hold SHIFT on the scope: the view slows and stops swaying for a few seconds. Watch the wind readout and aim at the hold-off dot.'],
  chain: ['MARKED FOR DEATH', 'Kill three tagged enemies within 10 s of each other: Deadeye is back and the camo battery is full.'],
  overwatch: ['OVERWATCH LOCK', 'Hold the scope steady on an area: everything around your point of aim is marked for the team while you keep it there.'],
  dart: ['CAMERA DART (9)', 'Fires a tiny camera into whatever you hit. It marks enemies in front of it and shows up as a feed on the tablet.'],
  drag: ['BODY DRAG (hold E)', 'Hold E on a body to drag it. Let go to drop it somewhere dark, out of a patrol’s path.'],
  bino: ['THERMAL BINOCULARS (X)', 'Raise them (right click / SCOPE): every enemy in the viewfinder is marked, at any range, and shows hot red.'],
  drone: ['RECON DRONE (G)', 'G to launch, G to park it (it keeps marking), hold G to recall. Enemies inside its red cone are marked.'],
  laser: ['LASER SIGHT (`)', 'A visible red laser from your weapon. Handy for showing your partner a target; guards can catch it too. The ` key (or LASER) toggles it.'],
};

const BREATH = { dur: 4, cd: 6 };
const OW = { settle: 1.5, r: 14 };
const CHAIN = { window: 10, need: 3 };

export const Abilities = {
  _abInit() {
    this.ab = { stillT: 0, ghillie: false, breath: { t: 0, cd: 0, on: false }, chain: { n: 0, t: -99 }, ow: { t: 0, on: false, at: null, ly: 0, lp: 0 }, darts: this.role === 'shooter' || this.operative ? 3 : 0, dartT: 0 };
    this.darts = [];
    this.wind = { dir: Math.random() * Math.PI * 2, speed: 1.5 + Math.random() * 5 };
    let seen = {};
    try { seen = JSON.parse(localStorage.getItem('draxxed.cellHints') || '{}'); } catch {}
    this._hintSeen = seen;
    const el = (this.hintEl = document.createElement('div'));
    el.id = 'cell-hint';
    document.body.appendChild(el);
    // Counter-sniper lasers (one per tower).
    this.csLines = [];
    // Drone view cones (yours and your partner's).
    this.droneCones = [this._mkCone(), this._mkCone()];
  },

  // A short card the first time an ability is used (remembered per browser).
  _hint(key) {
    const H = HINTS[key];
    if (!H || this._hintSeen[key]) return;
    this._hintSeen[key] = 1;
    try { localStorage.setItem('draxxed.cellHints', JSON.stringify(this._hintSeen)); } catch {}
    const el = this.hintEl;
    el.innerHTML = `<b>${H[0]}</b><span>${H[1]}</span>`;
    el.classList.add('on');
    clearTimeout(this._hintTO);
    this._hintTO = setTimeout(() => el.classList.remove('on'), 7000);
  },

  // Per-frame input (before the player update): breath control, darts.
  _abInput(dt, I, act, live) {
    const A = this.ab, P = this.player, B = A.breath;
    const shooterKit = this.role === 'shooter' || this.operative;
    B.cd = Math.max(0, B.cd - dt);
    const scopedRifle = shooterKit && P.def.slot === 'rifle' && P.scoped;
    const want = scopedRifle && (I.held('ShiftLeft') || I.held('ShiftRight') || I.held('T:breath') || I.held('T:cell-breath'));
    if (want && B.cd <= 0 && B.t < BREATH.dur) {
      if (!B.on) this._hint('breath');
      B.on = true; B.t += dt;
      act.lookX *= 0.4; act.lookY *= 0.4;
      if (B.t >= BREATH.dur) { B.on = false; B.cd = BREATH.cd; B.t = 0; }
    } else if (B.on) { B.on = false; B.cd = Math.max(B.cd, BREATH.cd * (B.t / BREATH.dur)); B.t = 0; }
    act.breath = B.on;
    if (live && shooterKit && (I.pressed('Digit9') || I.pressed('cell-dart'))) this._fireDart();
    if (I.pressed('Backquote') || I.pressed('cell-laser')) { this.laserOn = !this.laserOn; this.hud.flash(this.laserOn ? 'LASER ON' : 'LASER OFF', 'dim', 0.7); if (this.laserOn) this._hint('laser'); }
  },

  // Per-frame (all clients, after the update): ghillie, overwatch, lasers, darts.
  _abTick(dt) {
    const A = this.ab, P = this.player;
    if (!A) return;
    const shooterKit = this.role === 'shooter' || this.operative;
    // Ghillie freeze.
    const still = shooterKit && P.stance === 2 && !P.moving && !this.downed && !this.cloak.on;
    A.stillT = still ? A.stillT + dt : 0;
    const gh = A.stillT > 2;
    if (gh && !A.ghillie) { this._hint('ghillie'); this.hud.flash('GHILLIE — FROZEN', 'dim', 0.8); }
    A.ghillie = gh;
    // Overwatch lock: scope held steady on one spot.
    const O = A.ow;
    const scoped = shooterKit && P.def.slot === 'rifle' && P.scoped && !this.downed;
    const drift = Math.abs(P.yaw - O.ly) + Math.abs(P.pitch - O.lp);
    O.ly = P.yaw; O.lp = P.pitch;
    if (scoped && drift < dt * 0.05) O.t += dt; else if (!scoped || drift > dt * 0.4) O.t = 0;
    const on = O.t > OW.settle;
    if (on && !O.on) { O.at = this._aimPoint(); this._hint('overwatch'); this.hud.flash('OVERWATCH LOCK', 'cyan', 0.9); this.sfx.ui(true); }
    O.on = on;
    if (on) {
      O.markT = (O.markT || 0) - dt;
      if (O.markT <= 0) {
        O.markT = 0.3;
        O.at = this._aimPoint();
        const eye = P.eyePos(new THREE.Vector3()), ids = [];
        for (const e of [...this.sentinel.guards, ...this.sentinel.drones]) {
          if (e.state === 'dead') continue;
          if (Math.hypot(e.x - O.at.x, e.z - O.at.z) > OW.r) continue;
          if (!this.fac.los(eye, { x: e.x, y: (e.y || 0) + 1.3, z: e.z })) continue;
          ids.push(e.id);
        }
        if (ids.length) { if (this.isHost) this._neuroMark(ids, true); else this.send({ t: 'ab', k: 'qmark', target: { ids, auto: true } }); }
      }
    }
    this._csTick();
    this._dartTick(dt);
    this._coneTick(dt);
  },

  // What the partner needs to draw: your overwatch ring, ghillie state, laser.
  _abState() {
    const O = this.ab && this.ab.ow;
    return { ow: O && O.on && O.at ? [Math.round(O.at.x * 10) / 10, Math.round(O.at.z * 10) / 10] : 0, gh: this.ab && this.ab.ghillie ? 1 : 0, lz: this.laserOn ? 1 : 0 };
  },

  // A kill landed on a tagged enemy (the shooter's client): chain it.
  _chainKill() {
    const C = this.ab.chain;
    C.n = this.t - C.t < CHAIN.window ? C.n + 1 : 1;
    C.t = this.t;
    if (C.n === 1) this._hint('chain');
    if (C.n >= CHAIN.need) {
      C.n = 0;
      this.kit.deadeyeCd = 0;
      this.cloak.bat = 100; this.cloak.lockT = 0;
      this.hud.flash('MARKED FOR DEATH — DEADEYE READY · CAMO FULL', 'cyan', 1.6);
      this.sfx.ui(true);
    } else this.hud.flash(`MARK CHAIN ${C.n}/${CHAIN.need}`, 'amber', 0.9);
  },

  // ---- wind -------------------------------------------------------------------------
  // Crosswind (m/s, + = pushes to your right) for a shot along yaw.
  _crosswind(yaw) {
    const W = this.wind;
    return Math.sin(W.dir - yaw) * W.speed;
  },
  // Angular drift (rad) of a KR-50 round over d metres in that crosswind.
  _windDrift(yaw, d) {
    return this._crosswind(yaw) * d * 1.1e-6 * (1 + d / 400);
  },

  // ---- counter-sniper lasers --------------------------------------------------------
  _csTick() {
    const show = this.role === 'shooter' || this.operative;
    const towers = this.sentinel.guards.filter((g) => g.tower);
    while (this.csLines.length < towers.length) {
      const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -1)]), new THREE.LineBasicMaterial({ color: '#ff2030', transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
      l.frustumCulled = false;
      this.scene.add(l);
      this.csLines.push(l);
    }
    towers.forEach((g, i) => {
      const L = this.csLines[i];
      L.visible = show && g.state !== 'dead' && !this.cine.active;
      if (!L.visible) return;
      const a = new THREE.Vector3(g.x, g.y + 1.55, g.z);
      const yaw = g.yaw + (g.look || 0), pitch = g.state === 'alert' ? -0.04 : -0.13;
      const d = new THREE.Vector3(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
      const end = a.clone().addScaledVector(d, 140);
      const h = this.fac.ray(a.clone().addScaledVector(d, 0.6), end, 'shot');
      const b = h ? h.point : end;
      const arr = L.geometry.attributes.position.array;
      arr[0] = a.x; arr[1] = a.y; arr[2] = a.z; arr[3] = b.x; arr[4] = b.y; arr[5] = b.z;
      L.geometry.attributes.position.needsUpdate = true;
      L.material.opacity = 0.35 + 0.2 * Math.sin(this.t * 3 + i);
    });
  },

  // ---- spotter relay: arrows at the screen edge for tagged enemies off screen ----------
  _relayHud(c, proj, W, H) {
    if (!(this.role === 'shooter' || this.operative) || this.isr.active || this.tablet.visible) return;
    const P = this.player.pos;
    for (const e of [...this.sentinel.guards, ...this.sentinel.drones]) {
      if (e.state === 'dead' || !(e.tagT > 0)) continue;
      const d = Math.hypot(e.x - P.x, e.z - P.z);
      if (d > 320) continue;
      const p = proj(e.x, (e.y || 0) + 1.2, e.z);
      const on = !p.behind && p.x > 30 && p.x < W - 30 && p.y > 30 && p.y < H - 30;
      if (on) continue;
      let dx = p.x - W / 2, dy = p.y - H / 2;
      if (p.behind) { dx = -dx; dy = -dy; }
      const a = Math.atan2(dy, dx), m = Math.min(W, H) * 0.42;
      const x = W / 2 + Math.cos(a) * m, y = H / 2 + Math.sin(a) * m;
      c.save();
      c.translate(x, y); c.rotate(a);
      c.fillStyle = 'rgba(64,216,232,0.85)';
      c.beginPath(); c.moveTo(12, 0); c.lineTo(-6, -7); c.lineTo(-2, 0); c.lineTo(-6, 7); c.closePath(); c.fill();
      c.restore();
      c.fillStyle = 'rgba(64,216,232,0.85)'; c.font = '600 10px JetBrains Mono, monospace'; c.textAlign = 'center';
      c.fillText(`${Math.round(d)}m`, x, y + 18);
    }
  },

  // ---- camera darts -------------------------------------------------------------------
  _fireDart() {
    const A = this.ab;
    if (A.darts <= 0) { this.hud.flash('NO CAMERA DARTS', 'red'); return; }
    const P = this.player, o = P.eyePos(new THREE.Vector3()), dir = P.aimDir(new THREE.Vector3());
    const h = this.fac.ray(o, o.clone().addScaledVector(dir, 150), 'shot');
    if (!h) { this.hud.flash('DART: NOTHING TO STICK TO', 'red'); return; }
    A.darts--;
    const n = h.normal ? new THREE.Vector3(h.normal.x, h.normal.y, h.normal.z) : dir.clone().negate();
    let yaw = Math.abs(n.y) > 0.7 ? P.yaw : Math.atan2(-n.x, -n.z);
    const dart = { id: (this.isHost ? 0 : 500) + this.darts.length + 1, x: h.point.x + n.x * 0.05, y: h.point.y + n.y * 0.05 + (Math.abs(n.y) > 0.7 ? 0.15 : 0), z: h.point.z + n.z * 0.05, yaw, by: this.role };
    this._addDart(dart);
    this._broadcast({ k: 'dart', d: dart });
    this._hint('dart');
    this.audio.click();
    this.hud.flash(`CAMERA DART PLACED (${A.darts} left)`, 'cyan', 0.9);
  },
  _addDart(d) {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.12, 8).rotateX(Math.PI / 2), new THREE.MeshLambertMaterial({ color: '#202428' })));
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.018, 6, 4), new THREE.MeshBasicMaterial({ color: '#30ff90' }));
    led.position.set(0, 0.03, -0.05);
    g.add(led);
    g.position.set(d.x, d.y, d.z);
    g.rotation.y = d.yaw;
    this.scene.add(g);
    this.darts.push({ ...d, obj: g, led, markT: 0 });
  },
  _dartTick(dt) {
    for (const d of this.darts) {
      d.led.visible = (this.t * 1.5) % 1 < 0.5;
      if (!this.isHost) continue;
      d.markT -= dt;
      if (d.markT > 0) continue;
      d.markT = 0.4;
      const eye = { x: d.x, y: d.y, z: d.z }, ids = [];
      for (const e of [...this.sentinel.guards, ...this.sentinel.drones]) {
        if (e.state === 'dead') continue;
        const dx = e.x - d.x, dz = e.z - d.z, dist = Math.hypot(dx, dz);
        if (dist > 45) continue;
        const ang = Math.abs(Math.atan2(Math.sin(Math.atan2(-dx, -dz) - d.yaw), Math.cos(Math.atan2(-dx, -dz) - d.yaw)));
        if (ang > 0.95) continue;
        if (!this.fac.los(eye, { x: e.x, y: (e.y || 0) + 1.3, z: e.z })) continue;
        ids.push(e.id);
      }
      if (ids.length) this._neuroMark(ids, true);
    }
  },

  // ---- recon drone view cone (red, faint, breathing) ----------------------------------
  _mkCone() {
    const geo = new THREE.ConeGeometry(Math.tan(0.62) * 45, 45, 24, 1, true).translate(0, -22.5, 0).rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: '#ff3040', transparent: true, opacity: 0.06, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    m.visible = false;
    m.frustumCulled = false;
    this.scene.add(m);
    return m;
  },
  _coneTick() {
    const mine = this.quad && (this.quad.active || this.quad.parked) && !this.quad.recall ? this.quad : null;
    const theirs = this.partner.quad;
    const set = (m, q) => {
      m.visible = !!q && !this.cine.active && !(this.quad && this.quad.active && q === mine);
      if (!m.visible) return;
      m.position.set(q.x, q.y, q.z);
      m.rotation.set(q.pitch ?? -0.35, q.yaw, 0, 'YXZ');
      m.material.opacity = 0.045 + 0.025 * Math.sin(this.t * 2.2);
    };
    set(this.droneCones[0], mine);
    set(this.droneCones[1], theirs ? { x: theirs[0], y: theirs[1], z: theirs[2], yaw: theirs[3], pitch: theirs[4] } : null);
  },

  // ---- body drag (host decides; both roles) -------------------------------------------
  // Called from _interact for each agent. Returns true while that agent is dragging.
  _dragInteract(a, held, opt) {
    const ob = this.obj, S = this.sentinel, role = a.role;
    ob.drag = ob.drag || {};
    const id = ob.drag[role];
    if (id) {
      const g = S.byId(id);
      if (!held || !g) { ob.drag[role] = 0; return false; }
      const yaw = a.yaw || 0;
      g.x = a.pos.x + Math.sin(yaw) * 1.2; g.z = a.pos.z + Math.cos(yaw) * 1.2;
      g.y = this.fac.groundAt(g.x, g.z, a.pos.y + 0.5, 0.6);
      g.found = false;
      this.prompts[role] = { label: 'Dragging the body — let go of E to drop it', p: 0, key: 'drag' };
      return true;
    }
    if (!opt) return false;
    for (const g of S.guards) {
      if (g.state !== 'dead' || g.tower) continue;
      if (Math.hypot(g.x - a.pos.x, g.z - a.pos.z) > 1.8 || Math.abs(g.y - a.pos.y) > 1.2) continue;
      opt('drag', 'Hold E — drag the body', 0.35, () => { ob.drag[role] = g.id; if (role === this.role) this._hint('drag'); });
      break;
    }
    return false;
  },
};

export function installAbilities(Cls) {
  for (const k of Object.keys(Abilities)) Cls.prototype[k] = Abilities[k];
}

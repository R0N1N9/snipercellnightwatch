// Sniper Cell — systems layered onto the core game loop (installed onto CellGame's prototype):
//   * the shooter's stealth kit: active camo (cell.js), DEADEYE weak-point vision, LURE
//     noise-makers, and MARK & EXECUTE (earned with silent takedowns);
//   * the light / exposure meter;
//   * pings, tactical comms and payload requests (wheel.js is the UI);
//   * enemy fire you can see coming: plasma bolts, beam-rifle lasers, blade charges;
//   * the extraction van: spotter drives, shooter rides shotgun.
import * as THREE from 'three';
import { glowTexture } from '../textures.js';
import { SPOTS, terrainHeight, lam } from './facility.js';
import { TYPES, WALL, guardCapsules, angDiff } from './sentinel.js';
import { PAYLOAD } from './ops.js';
import { WHEEL } from './wheel.js';
import { buildVan, SEATS, setVanLights } from './van.js';

export const KIT = {
  deadeye: { dur: 8, cd: 60 },
  lure: { charges: 3, life: 7, radius: 16 },
  exec: { max: 2, start: 1, range: 35, targets: 3, gap: 0.22 },
};
const CALL_LINE = { look: 'Eyes on my mark.', enemy: 'Enemy, marked.', move: 'Moving to my mark.', hold: 'Hold position.', regroup: 'On me.', cover: 'Cover me.', sync: 'Sync target. Get on him.', pickup: 'I\'m down! Need a pickup!', perch: 'Set up there. Good sightline.' };
const COMMS_LABEL = { look: 'LOOK HERE', enemy: 'ENEMY', move: 'MOVE HERE', hold: 'HOLD', regroup: 'ON ME', cover: 'COVER ME', sync: 'SYNC TARGET', pickup: 'PICK ME UP', perch: 'SNIPER POSITION' };
const REQ_LABEL = { supply: 'SUPPLY DROP', scan: 'PULSE SCAN', emp: 'EMP', decoy: 'DECOY', lights: 'CUT LIGHTS', drone: 'DRONE OVERWATCH' };
const BOLT = {
  plasma: { color: '#60ff80', speed: 38, size: 0.5 },
  heavy: { color: '#c060ff', speed: 46, size: 0.7 },
};
const boltMats = {};
function boltMat(color) {
  if (!boltMats[color]) boltMats[color] = new THREE.SpriteMaterial({ map: glowTexture(), color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  return boltMats[color];
}

// World position of a van-local point (the van faces +X once parked at the LZ).
export function vanWorld(v, l) {
  const cs = Math.cos(v.yaw), sn = Math.sin(v.yaw);
  return { x: v.x + l.x * cs + l.z * sn, y: v.y + (l.y || 0), z: v.z - l.x * sn + l.z * cs };
}

export const KitMethods = {
  _kitInit() {
    this.kit = { deadeye: 0, deadeyeCd: 0, lures: KIT.lure.charges, execs: KIT.exec.start, execQ: [], execT: 0 };
    this.lures = [];
    this.bolts = [];
    this.lasers = new Map();
    this.requests = []; // incoming / outgoing payload requests
    this.reqId = 1;
    this.lastCm = null; // last tactical call from the partner (Y acknowledges)
    this.vVis = 0;
    // The van: parked on the east track, nose toward the road out.
    const lz = SPOTS.lz;
    this.vanState = { x: lz.x, y: terrainHeight(lz.x, lz.z), z: lz.z, yaw: -Math.PI / 2, depart: 0, speed: 0 };
    this.van = buildVan();
    this.scene.add(this.van);
    this._placeVan();
    const V = this.vanState;
    this.vanBox = this.fac.box(V.x - 2.4, V.y, V.z - 1.0, V.x + 2.4, V.y + 1.6, V.z + 1.0, null, { kind: 'van' });
    if (this.fac.lzRing) this.fac.lzRing.material.opacity = 0;
    this.obj.seats = { driver: null, passenger: null };
    this.obj.depart = 0;
    // Middle mouse opens the wheel too.
    addEventListener('mousedown', (e) => { if (e.button === 1 && this.input.enabled && !this.tablet.visible) { e.preventDefault(); this._mmb = true; } });
    addEventListener('mouseup', (e) => { if (e.button === 1) this._mmb = false; });
  },

  _placeVan() {
    const V = this.vanState;
    this.van.position.set(V.x, V.y, V.z);
    this.van.rotation.y = V.yaw;
  },

  // ---- per-frame input for the kit, the wheel and approvals ----------------------------
  _kitKeys(dt, I, tab, quad, live, act) {
    const shooterKit = this.role === 'shooter';
    if (live && !tab && !quad && shooterKit) {
      if (I.pressed('KeyH') || I.pressed('cell-deadeye')) this._deadeye();
      if (I.pressed('KeyX') || I.pressed('cell-lure')) this._throwLure();
      if (I.pressed('KeyZ') || I.pressed('cell-xr')) this._ammoMenu();
      if (this.xr && this.xr.menu) for (let i = 1; i <= 4; i++) if (I.pressed('Digit' + i)) { this._ammoPick(['std', 'xr', 'pen', 'emp'][i - 1]); act.slot1 = act.slot2 = false; }
    }
    // Downed: V / PING / HELP calls for a pickup on your position.
    this._helpCd = Math.max(0, (this._helpCd || 0) - dt);
    if (this.downed && !this.kia && (I.pressed('KeyQ') || I.pressed('cell-ping') || I.pressed('cell-help'))) this._pickupCall();
    // Ping wheel: V / middle mouse / PING (touch). Tap = smart ping, hold = wheel.
    const held = (I.held('KeyQ') || this._mmb || I.held('T:cell-ping')) && !tab && live;
    if (held) {
      this._pingT = (this._pingT || 0) + dt;
      if (!this.wheel.open && (this._pingT > 0.22 || this._mmb)) this._openWheel();
      if (this.wheel.open) { this.wheel.nudge(act.lookX * 0.6, act.lookY * 0.6); act.lookX = act.lookY = 0; }
    } else if (this._pingT > 0) {
      if (this.wheel.open) { const k = this.wheel.close(); this._wheelPick(k, this._wheelAt, this._wheelEnemy); }
      else if (live) this._smartPing();
      this._pingT = 0;
    }
    // V / KNIFE: a knife strike on whoever is in arm's reach in front of you.
    if ((I.pressed('KeyV') || I.pressed('cell-knife')) && live && !tab) this._melee();
    // Approve / deny the top request, or acknowledge the last call.
    if (I.pressed('KeyY') || I.pressed('cell-yes')) this._answerTop(true);
    if (I.pressed('KeyU') || I.pressed('cell-no')) this._answerTop(false);
  },

  _kitUpdate(dt) {
    const K = this.kit;
    K.deadeye = Math.max(0, K.deadeye - dt);
    K.deadeyeCd = Math.max(0, K.deadeyeCd - dt);
    // Execute sequence: one suppressed snap shot every KIT.exec.gap seconds.
    if (K.execQ.length) {
      K.execT -= dt;
      if (K.execT <= 0) { K.execT = KIT.exec.gap; this._execShot(K.execQ.shift()); }
    }
    this._lureTick(dt);
    this._boltsTick(dt);
    for (const r of this.requests) r.t -= dt;
    this.requests = this.requests.filter((r) => r.t > 0 && r.st === 'pending');
    if (this.lastCm) { this.lastCm.t -= dt; if (this.lastCm.t <= 0) this.lastCm = null; }
    this.vVis = this._visibility();
  },

  // How visible you are right now (same factors SENTINEL uses): 0 hidden .. 1 exposed.
  _visibility() {
    const P = this.player;
    let v = P.stance === 2 ? 0.45 : P.stance === 1 ? 0.7 : 1;
    if (!P.moving) v *= 0.8;
    if (P.sprinting) v *= 1.2;
    const light = this.fac.lightAt(P.pos.x, P.pos.y + 1, P.pos.z);
    v *= light < 0.35 ? 0.4 + light : 1;
    if (this.cloak.on) v *= this.cloak.flick > 0 ? 0.6 : 0.03;
    return Math.min(1, v);
  },

  // ---- DEADEYE: weak points glow through the dark for a few seconds -------------------
  // DEADEYE (Splinter Cell style): H, then sweep the crosshair over up to three enemies to mark
  // them; pull the trigger and Ra drops the KR-50 to his left hand, draws the M50 and puts a
  // round in each marked head in quick succession. The window closes after a few seconds.
  _deadeye() {
    const K = this.kit;
    this._hint && this._hint('deadeye');
    if (this.deSeq) return;
    if (K.deadeye > 0) { K.deadeye = 0; K.deMarks = []; this.hud.flash('DEADEYE OFF', 'dim', 0.6); return; }
    if (K.deadeyeCd > 0) { this.hud.flash(`DEADEYE ${Math.ceil(K.deadeyeCd)} s`, 'red'); return; }
    K.deadeye = KIT.deadeye.dur;
    K.deMarks = [];
    this.sfx.ui(true);
    this.hud.flash('DEADEYE \u2014 3 CLOSEST IN SIGHT MARKED \u00B7 FIRE', 'cyan', 1.2);
  },
  // Per frame. Returns true while the sequence owns the trigger.
  _deadeyeStep(dt, act, live) {
    const K = this.kit, P = this.player, S = this.sentinel;
    const D = this.deSeq;
    if (D) {
      D.t += dt;
      act.mx = act.my = 0; act.lookX = act.lookY = 0; act.sprint = false; act.scope = false;
      // Draw the M50 (0.35 s), then each target: swing onto the head (0.22 s) and fire.
      if (D.phase === 'draw') { D.switchT = Math.max(0, 0.35 - D.t); if (D.t > 0.35) { D.phase = 'aim'; D.t = 0; } return true; }
      if (D.phase === 'aim') {
        const g = S.byId(D.ids[D.i]);
        if (!g || g.state === 'dead') { D.i++; D.t = 0; if (D.i >= D.ids.length) { D.phase = 'holster'; } return true; }
        const o = P.eyePos(new THREE.Vector3()), h = guardCapsules(g)[0].a, v = h.clone().sub(o);
        const yaw = Math.atan2(-v.x, -v.z), pitch = Math.atan2(v.y, Math.hypot(v.x, v.z));
        const k = Math.min(1, dt * 16);
        P.yaw += Math.atan2(Math.sin(yaw - P.yaw), Math.cos(yaw - P.yaw)) * k;
        P.pitch += (pitch - P.pitch) * k;
        if (D.t > 0.22) {
          P.yaw = yaw; P.pitch = pitch;
          const end = o.clone().add(v.normalize().multiplyScalar(o.distanceTo(h) + 0.3));
          this.audio.shotLocal(true, true, true);
          this.viewmodel.fired(1.9);
          this.camKick = (this.camKick || 0) + 0.05;
          this._tracer(this.viewmodel.muzzleWorld(new THREE.Vector3()), h, '#ffe0a0', 0.05);
          this.audio.hitConfirm(true);
          this.hud.hitMarker(true);
          if (this.isHost) this._applyHit(g.id, 999, 'deadeye', { x: P.pos.x, z: P.pos.z }, this.role, true, o.distanceTo(h));
          else this.send({ t: 'hit', id: g.id, dmg: 999, how: 'deadeye', from: { x: P.pos.x, z: P.pos.z }, head: true, dist: o.distanceTo(h) });
          this._noise(P.pos, 14, false, true);
          void end;
          D.i++; D.t = 0;
          if (D.i >= D.ids.length) D.phase = 'holster';
        }
        return true;
      }
      // Holster the M50, the KR-50 comes back up.
      D.switchT = Math.min(0.35, D.t);
      if (D.t > 0.45) { this.deSeq = null; K.deadeyeCd = KIT.deadeye.cd; }
      return true;
    }
    if (!(K.deadeye > 0) || this.role !== 'shooter' && !this.operative) return false;
    // Marking: the three closest enemies in line of sight are marked automatically (refreshed a
    // few times a second as you move and they move).
    K.deMarkT = (K.deMarkT || 0) - dt;
    if (live && K.deMarkT <= 0) {
      K.deMarkT = 0.15;
      const o = P.eyePos(new THREE.Vector3()), fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
      const prev = K.deMarks || [];
      K.deMarks = S.guards
        .filter((g) => g.state !== 'dead')
        .map((g) => { const h = guardCapsules(g)[0].a; const v = new THREE.Vector3(h.x, h.y, h.z).sub(o); return { g, h, d: v.length(), a: v.normalize().angleTo(fwd) }; })
        .filter((q) => q.d < 60 && q.a < 1.2 && this.fac.los(o, q.h))
        .sort((a, b) => a.d - b.d).slice(0, 3).map((q) => q.g.id);
      if (K.deMarks.some((id) => !prev.includes(id))) this.audio.ping && this.audio.ping();
    }
    if (live && (act.fire) && K.deMarks.length) {
      this.deSeq = { t: 0, ids: K.deMarks.slice(), i: 0, phase: 'draw', switchT: 0.35 };
      K.deadeye = 0; K.deMarks = [];
      P.scopeT = 0; P.scoped = false;
      this.sfx.ui(true);
      return true;
    }
    if (K.deadeye <= dt && K.deMarks.length) K.deMarks = [];
    if (K.deadeye <= dt && !this.deSeq) K.deadeyeCd = Math.max(K.deadeyeCd, KIT.deadeye.cd * 0.5);
    return false;
  },

  // ---- LURE: a thrown noise-maker that pulls patrols off their route ------------------
  _throwLure() {
    this._hint && this._hint('lure');
    const K = this.kit;
    if (K.lures <= 0) { this.hud.flash('NO LURES — resupply', 'red'); return; }
    K.lures--;
    const o = this.player.eyePos(new THREE.Vector3());
    const d = this.player.aimDir(new THREE.Vector3());
    const mesh = new THREE.Group();
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.12, 8), lam('#2a2c30'));
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 4), new THREE.MeshBasicMaterial({ color: '#ff3040' }));
    led.position.y = 0.07;
    mesh.add(b, led);
    mesh.position.copy(o);
    this.scene.add(mesh);
    this.lures.push({ p: o.clone(), v: d.multiplyScalar(15).add(new THREE.Vector3(0, 3.2, 0)), mesh, led, landed: false, t: 0, tick: 0.8 });
    this.audio.click();
    this.hud.flash(`LURE OUT (${K.lures} left)`, 'cyan');
  },

  _lureTick(dt) {
    for (const L of this.lures) {
      if (!L.landed) {
        const prev = L.p.clone();
        L.v.y -= 9.8 * dt;
        L.p.addScaledVector(L.v, dt);
        const hit = this.fac.ray(prev, L.p, 'solid');
        const g = this.fac.groundAt(L.p.x, L.p.z, prev.y, 0.2);
        if (hit || L.p.y <= g + 0.05) {
          if (hit) L.p.copy(hit.point).addScaledVector(hit.normal, 0.06);
          L.p.y = Math.max(this.fac.groundAt(L.p.x, L.p.z, L.p.y + 0.3, 0.3) + 0.06, Math.min(L.p.y, prev.y));
          L.landed = true;
          this.sfx.door(L.p);
        }
      } else {
        L.t += dt;
        L.tick -= dt;
        L.led.visible = Math.sin(L.t * 12) > 0;
        if (L.tick <= 0) {
          L.tick = 1;
          this.audio.beep(L.p, Math.floor(L.t) % 2 === 0);
          this._noise(L.p, KIT.lure.radius, false);
        }
      }
      L.mesh.position.copy(L.p);
    }
    this.lures = this.lures.filter((L) => { if (L.t < KIT.lure.life) return true; this.scene.remove(L.mesh); return false; });
  },

  // ---- MARK & EXECUTE: snap headshots on up to three marked targets -------------------
  _execTargets() {
    const o = this.player.eyePos(new THREE.Vector3());
    const out = [];
    for (const g of this.sentinel.guards) {
      if (g.state === 'dead' || !(g.tagT > 0)) continue;
      const h = guardCapsules(g)[0].a;
      const d = o.distanceTo(h);
      if (d > KIT.exec.range || !this.fac.los(o, h)) continue;
      out.push({ g, d });
    }
    return out.sort((a, b) => a.d - b.d).slice(0, KIT.exec.targets).map((x) => x.g);
  },
  _execute() {
    const K = this.kit;
    this._hint && this._hint('execute');
    if (K.execQ.length) return;
    if (K.execs <= 0) { this.hud.flash('EXECUTE: earn a charge with a silent takedown', 'red'); return; }
    const list = this._execTargets();
    if (!list.length) { this.hud.flash(`EXECUTE: no marked targets in ${KIT.exec.range} m line of sight`, 'red'); return; }
    K.execs--;
    K.execQ = list.map((g) => g.id);
    K.execT = 0;
    this.hud.flash('EXECUTE', 'cyan');
  },
  _execShot(id) {
    const g = this.sentinel.guards.find((q) => q.id === id);
    if (!g || g.state === 'dead') return;
    const P = this.player;
    const o = P.eyePos(new THREE.Vector3());
    const h = guardCapsules(g)[0].a;
    const dir = h.clone().sub(o).normalize();
    P.yaw = Math.atan2(-dir.x, -dir.z);
    P.pitch = Math.asin(dir.y);
    this.audio.shotLocal(true, true);
    this._tracer(o.clone().add(new THREE.Vector3(0, -0.1, 0)), h, '#ffe0a0', 0.06);
    this.audio.hitConfirm(true);
    this.hud.hitMarker(true);
    this.effects.puff(h, 'dust', 0.6, 0.5);
    const dist = o.distanceTo(h);
    if (this.isHost) this._applyHit(id, 999, 'exec', { x: P.pos.x, z: P.pos.z }, this.role, true, dist);
    else this.send({ t: 'hit', id, dmg: 999, how: 'exec', from: { x: P.pos.x, z: P.pos.z }, head: true, dist });
  },

  // ---- pings, tactical calls and requests --------------------------------------------
  _crosshairEnemy() {
    const cam = this.camera;
    const o = cam.position.clone();
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    let best = null, bs = 0.04 * (62 / cam.fov);
    for (const e of [...this.sentinel.guards, ...this.sentinel.drones]) {
      if (e.hp <= 0 || e.state === 'dead') continue;
      const p = new THREE.Vector3(e.x, (e.y || 0) + (e.kind === 'g' ? 1.3 : 0), e.z);
      const v = p.clone().sub(o);
      if (v.length() > 320) continue;
      const ang = v.normalize().angleTo(dir);
      if (ang < bs && this.fac.los(o, p)) { bs = ang; best = e; }
    }
    return best;
  },
  _openWheel() {
    this._wheelAt = this.isr && this.isr.active ? { x: this.isr.spi.x, z: this.isr.spi.z, y: this.isr.spi.y } : this.quad && this.quad.active ? { x: this.quad.x, z: this.quad.z } : this._aimPoint();
    const e = this._crosshairEnemy();
    this._wheelEnemy = e ? e.id : null;
    this.wheel.show(innerWidth / 2, innerHeight / 2, this._wheelSub(), this._wheelLabels());
    this.sfx.ui(true);
  },
  _wheelSub() {
    if (this.ops && (this.role === 'spotter' || this.operative)) return 'REQUESTS RUN FROM YOUR TABLET';
    if (this.aiSpot) return `REQUESTS → ${this.partnerName} (AI)`;
    return `REQUESTS → ${this.partnerName}`;
  },
  _wheelLabels() {
    const L = {};
    if (this.role === 'spotter' && !this.solo) L.enemy = 'TAKE SHOT';
    if (this.aiShoot) L.enemy = 'TAKE SHOT';
    return L;
  },
  _smartPing() {
    const e = this._crosshairEnemy();
    if (e) this._wheelPick('enemy', { x: e.x, z: e.z }, e.id);
    else {
      // Nothing under the crosshair: a plain PING marker (F on open ground is "look here").
      const at = this.quad && this.quad.active ? { x: this.quad.x, z: this.quad.z } : this._aimPoint();
      const pin = { x: at.x, z: at.z, label: 'PING', by: this.role };
      this._addPin(pin);
      this.send({ t: 'pin', ...pin });
    }
  },

  // A wheel choice at a world point (from the crosshair or the tablet map).
  _wheelPick(k, at, enemyId) {
    if (!k || !at) return;
    const opt = WHEEL.find((o) => o.k === k);
    this.sfx.ui(false);
    if (opt.group === 'comms') return this._call(k, at, enemyId);
    return this._requestPayload(k, at);
  },

  _call(k, at, enemyId) {
    const P = this.player.pos;
    if (k === 'regroup') at = { x: P.x, z: P.z };
    if (k === 'sync') {
      if (!enemyId) { this.hud.flash('SYNC: aim at an enemy', 'red'); return; }
      const e = this.sentinel.byId(enemyId);
      this.payload('sync', { id: enemyId, on: true, by: this.role });
      if (e && this.isHost) { e.sync = true; e.tagT = Math.max(e.tagT || 0, 60); }
      if (e) at = { x: e.x, z: e.z };
    }
    if (k === 'enemy' && enemyId) {
      const e = this.sentinel.byId(enemyId);
      if (e) { at = { x: e.x, z: e.z }; this.payload('tag', { id: enemyId, by: this.role }); if (this.isHost) e.tagT = 12; }
    }
    const label = k === 'enemy' && (this.role === 'spotter' || this.aiShoot) ? 'TAKE THE SHOT' : COMMS_LABEL[k];
    const pin = { x: at.x, z: at.z, label, by: this.role, k };
    this._addPin(pin);
    // Routine pings are voiced only now and then (and never over other radio); the marker and
    // text always show. Orders and requests for help always speak.
    const routine = k === 'look' || k === 'enemy' || k === 'move';
    // Every now and then a marked enemy gets its range called, measured from whoever marked it.
    let rng = null;
    if (k === 'enemy' && enemyId && (this.t - (this._rngCallT ?? -99) > 8 || Math.random() < 0.4)) { this._rngCallT = this.t; rng = Math.round(Math.hypot(at.x - P.x, at.z - P.z)); }
    const voiced = !routine || !!rng || (this.radio && this.radio.idle() && Math.random() < 0.35);
    const line = rng ? `X-ray marked, ${rng} meters.` : null;
    this.send({ t: 'cm', ...pin, id: enemyId || 0, v: voiced ? 1 : 0, line });
    this.comms(line || label.charAt(0) + label.slice(1).toLowerCase() + '.', ROLES_COLOR[this.role], this.name);
    if (voiced) this._voice('me', line || CALL_LINE[k] || label.toLowerCase());
    if (k === 'pickup') return;
    if (this.aiShoot) this._aiShooterCall(k, at, enemyId);
    if (this.aiSpot) this._aiSpotterCall(k, at, enemyId);
  },

  _pickupCall() {
    if (this._helpCd > 0) return;
    this._helpCd = 6;
    const P = this.player.pos;
    this._call('pickup', { x: P.x, z: P.z });
    // An AI partner can't carry an IFAK to you from the cliff: it gets the medevac drone up.
    if (this.solo && this.aiPartner && this.ops) {
      const say = (m) => { this.comms(m, 'amber', this.partnerName); setTimeout(() => this._voice('partner', m), 2200); };
      if (this.medevac) say("Medevac's on you. Hang on.");
      else if (this.ops.ready('medevac')) { this.ops.use('medevac'); say('Medevac inbound!'); }
      else say('Medevac\'s cycling. Stay with me!');
    }
  },

  _onCall(m) {
    this._addPin({ x: m.x, z: m.z, label: m.label, by: m.by }, true);
    this.lastCm = { k: m.k, label: m.label, t: 10 };
    this.comms(m.line ? `${m.line} (Y: roger)` : `${m.label}${m.k === 'enemy' ? ' — marked' : ''}. (Y: roger)`, '#ffd040', this.partnerName);
    if (m.v !== 0) this._voice('partner', m.line || CALL_LINE[m.k] || m.label.toLowerCase());
    this.sfx.ui(true);
  },

  _requestPayload(k, at) {
    const P = this.player.pos;
    if (k === 'supply' && Math.hypot(at.x - P.x, at.z - P.z) > 60) at = { x: P.x + 1.5, z: P.z + 1 };
    // Spotter / lone operative: you own the tablet, so it just happens.
    if (this.ops && (this.role === 'spotter' || this.operative)) {
      if (this._phonePulse && !(this.qh && this.qh.on)) this._phonePulse();
      const why = this._runRequest(k, at);
      this.hud.flash(why ? `${REQ_LABEL[k]}: ${why}` : REQ_LABEL[k], why ? 'red' : 'cyan');
      return;
    }
    // Solo with the AI spotter: Rōnin answers after a beat.
    if (this.aiSpot) {
      this.comms(`Requesting ${REQ_LABEL[k].toLowerCase()}.`, '#f2b35b', this.name);
      this._voice('me', `Requesting ${REQ_LABEL[k].toLowerCase()}.`);
      setTimeout(() => {
        const why = this._runRequest(k, at);
        this.comms(why ? `Negative — ${why.toLowerCase()}.` : `${REQ_LABEL[k].toLowerCase()} — on it.`, 'cyan', this.partnerName);
        this._voice('partner', why ? 'Negative. Can\'t do that.' : `Copy. ${REQ_LABEL[k].toLowerCase()} inbound.`);
      }, 900);
      return;
    }
    // Co-op shooter: a request lands on the spotter's console / HUD.
    const r = { id: this.reqId++ * 2 + (this.isHost ? 0 : 1), k, x: at.x, z: at.z, by: this.role, t: 30, st: 'out' };
    this.send({ t: 'rq', id: r.id, k, x: at.x, z: at.z, by: this.role });
    this._addPin({ x: at.x, z: at.z, label: REQ_LABEL[k], by: this.role });
    this.comms(`Requesting ${REQ_LABEL[k].toLowerCase()}.`, '#f2b35b', this.name);
    this._voice('me', `Requesting ${REQ_LABEL[k].toLowerCase()}.`);
  },

  // Run a request with your own (or the AI's) console. Returns null or the reason it failed.
  _runRequest(k, at) {
    const O = this.ops;
    if (!O) return 'NO CONSOLE';
    if (k === 'drone') {
      // Human spotter / operative: launch the quad; AI: a drone sweep tags what's there.
      if (this.aiSpot) {
        const near = this.sentinel.guards.filter((g) => g.state !== 'dead' && Math.hypot(g.x - at.x, g.z - at.z) < 30);
        for (const g of near) this.payload('tag', { id: g.id });
        for (const g of near) g.tagT = 14;
        return near.length ? null : 'NOTHING THERE';
      }
      // Human: the quad flies itself to the spot and holds there, marking.
      const why = this._quadTo(at);
      if (!why) this._addPin({ x: at.x, z: at.z, label: 'DRONE →', by: this.role });
      return why;
    }
    if (k === 'sweep') return this._isrSweep(at);
    const p = PAYLOAD[k];
    if (!p) return 'UNKNOWN';
    return O.use(k, p.aim ? at : null);
  },

  _onRequest(m) {
    this.requests.push({ id: m.id, k: m.k, x: m.x, z: m.z, by: m.by, t: 30, st: 'pending' });
    this._addPin({ x: m.x, z: m.z, label: REQ_LABEL[m.k] + '?', by: m.by }, true);
    this.comms(`requests ${REQ_LABEL[m.k].toLowerCase()} — Y send / U deny`, '#ffd040', this.partnerName);
    this.sfx.ui(true);
    if (this.tablet) this.tablet.dirty = true;
  },
  _answer(req, ok) {
    if (!req || req.st !== 'pending') return;
    let why = null;
    if (ok) why = this._runRequest(req.k, { x: req.x, z: req.z });
    req.st = ok && !why ? 'ok' : 'no';
    this.send({ t: 'rr', id: req.id, ok: ok && !why, why: ok ? why : 'denied' });
    this.hud.flash(ok && !why ? `${REQ_LABEL[req.k]} SENT` : `${REQ_LABEL[req.k]}: ${why || 'DENIED'}`, ok && !why ? 'cyan' : 'red');
    if (this.tablet) this.tablet.dirty = true;
  },
  _onAnswer(m) {
    this.comms(m.ok ? 'on its way.' : `negative — ${String(m.why || 'denied').toLowerCase()}.`, m.ok ? 'cyan' : 'red', this.partnerName);
    this._voice('partner', m.ok ? 'Copy. On its way.' : 'Negative.');
    this.sfx.ui(!!m.ok);
  },
  _answerTop(ok) {
    const r = this.requests.find((q) => q.st === 'pending');
    if (r) return this._answer(r, ok);
    if (this.lastCm && ok) {
      this.send({ t: 'ack' });
      this.comms('Roger.', ROLES_COLOR[this.role], this.name);
      this._voice('me', 'Roger.');
      this.lastCm = null;
    }
  },

  // AI partners hearing your calls.
  _aiShooterCall(k, at, enemyId) {
    // The AI's spoken acknowledgements are occasional for routine pings (text always shows).
    const A = this.aiShoot, quiet = (k === 'look' || k === 'enemy') && Math.random() < 0.75;
    const say = (m) => { this.comms(m, 'amber', this.partnerName); if (!quiet) this._voice('partner', m); };
    if (k === 'hold') { A.holdT = 30; say('Holding fire.'); }
    else if (k === 'enemy') { A.holdT = 0; if (!enemyId) say('Nothing under your mark.'); }
    else if (k === 'perch') {
      // A sniper position anywhere the spotter marks (outside the building): Ra relocates there.
      if (this.fac.insideBuilding(at.x, at.z)) { say('No shot from inside. Pick a view.'); return; }
      const x = at.x, z = at.z;
      const yaw = Math.atan2(-(0 - x), -(-15 - z));
      SPOTS.perches[3] = { id: 'mark', name: 'SPOTTER\'S MARK', x, z, yaw, custom: true };
      const d = Math.hypot(x - this.partner.pos.x, z - this.partner.pos.z);
      A.moveTo = 3;
      A.moveT = Math.max(5, Math.min(25, d / 9));
      say('Copy, moving to your mark.');
    } else if (k === 'move') {
      const best = SPOTS.perches.map((p, i) => [Math.hypot(p.x - at.x, p.z - at.z), i]).sort((a, b) => a[0] - b[0])[0][1];
      if (best !== A.perch) this._execPayload('perch', { i: best }, 'spotter'); else say('Already here.');
    } else if (k === 'regroup' || k === 'cover') { A.coverT = 40; A.holdT = 0; say('Got you covered.'); }
    else if (k === 'look') say('Eyes on.');
  },
  _aiSpotterCall(k, at, enemyId) {
    const quiet = (k === 'look' || k === 'enemy') && Math.random() < 0.75;
    const say = (m) => { this.comms(m, 'cyan', this.partnerName); if (!quiet) this._voice('partner', m); };
    if (k === 'look') {
      const near = this.sentinel.guards.filter((g) => g.state !== 'dead' && Math.hypot(g.x - at.x, g.z - at.z) < 15);
      for (const g of near) g.tagT = 12;
      say(near.length ? (near.length > 1 ? 'Contacts there. Tagged.' : 'One contact there. Tagged.') : 'Looks clear from here.');
    } else if (k === 'enemy') say(enemyId ? 'Marked.' : 'I don’t see anything there.');
    else say('Copy.');
  },

  // ---- enemy fire ---------------------------------------------------------------------
  _spawnBolt(m) {
    const a = new THREE.Vector3(...m.a), b = new THREE.Vector3(...m.b);
    const miss = m.hit ? b : b.clone().add(new THREE.Vector3((Math.random() - 0.5) * 2.5, (Math.random() - 0.3) * 1.5, (Math.random() - 0.5) * 2.5));
    const k = m.k || 'bullet';
    const spec = BOLT[k];
    if (!spec) {
      // Instant: bullets, drone zaps, the beam rifle.
      if (k === 'beam') { this._tracer(a, miss, '#b8f4ff', 0.35); this._tracer(a.clone().add(new THREE.Vector3(0, 0.03, 0)), miss, '#30e0ff', 0.5); this.sfx.beam(a); }
      else this._tracer(a, miss, k === 'zap' ? '#ff4060' : '#ffb060', k === 'zap' ? 0.12 : 0.07);
      const d = this.camera.position.distanceTo(a);
      if (k === 'bullet') this.audio.shotDistant(a, d / 343, false); else if (k === 'zap') this.audio.beep(a, true);
      this._boltLand(m, miss, a);
      return;
    }
    const s = new THREE.Sprite(boltMat(spec.color));
    s.scale.setScalar(spec.size);
    s.position.copy(a);
    this.scene.add(s);
    // A short glowing tail.
    const tail = new THREE.Sprite(boltMat(spec.color));
    tail.scale.setScalar(spec.size * 0.6);
    this.scene.add(tail);
    this.bolts.push({ s, tail, a, b: miss, m, t: 0, dur: a.distanceTo(miss) / spec.speed });
    this.sfx.plasma(a, k === 'heavy');
  },
  _boltsTick(dt) {
    for (const B of this.bolts) {
      B.t += dt;
      const u = Math.min(1, B.t / B.dur);
      B.s.position.lerpVectors(B.a, B.b, u);
      B.tail.position.lerpVectors(B.a, B.b, Math.max(0, u - 0.04));
      if (u >= 1) {
        this.scene.remove(B.s, B.tail);
        this.effects.puff(B.b, 'metal', 0.5, 0.35);
        this._boltLand(B.m, B.b, B.a);
        B.done = true;
      }
    }
    this.bolts = this.bolts.filter((B) => !B.done);
  },
  _boltLand(m, at, from) {
    if (m.role === 'quad') {
      if (m.hit) { if (this.role === 'spotter' && this.quad && this.quad.active) this._quadDamage(m.dmg); else if (this.isHost && !this.solo) this._broadcast({ k: 'quadhit', dmg: m.dmg }); }
      return;
    }
    if (m.role !== this.role || this.downed || this.kia || this._seat()) return;
    if (!m.hit) { this.audio.crack(at, 0, 0.6); return; }
    const plate = this.role === 'spotter' || this.operative ? 0.8 : 1; // the plate carrier soaks a little
    this._damage(m.dmg * plate, from);
  },
  _onMelee(m) {
    const a = new THREE.Vector3(...m.a);
    this.sfx.blade(a);
    if (m.role !== this.role || this.downed || this.kia || this._seat()) return;
    this._damage(m.dmg, a);
    this.hud.flash('BLADE!', 'red', 0.8);
    this.player.pitch += 0.12;
  },

  _sentinelFx(ev) {
    const S = this.sentinel;
    const e = S.byId(ev.id);
    const pos = e ? new THREE.Vector3(e.x, (e.y || 0) + 1.4, e.z) : null;
    if (ev.t === 'fx' && ev.k === 'crash') { this._boom({ x: ev.x, y: ev.y, z: ev.z }); this.hud.flash('SPOTLIGHT DRONE DOWN', 'amber', 1); return; }
    if (ev.t === 'bark' && pos) this.sfx.bark(ev.k === 'flee' ? 'flee' : ev.k, pos);
    if (ev.t === 'fx' && pos) {
      if (ev.k === 'pop') { this.sfx.shieldPop(pos); this.effects.puff(pos, 'metal', 1.4, 0.4); }
      else this.sfx.shieldHit(pos);
      if (e) e.hitFx = 1;
    }
    if (ev.t === 'laser' && pos) this.sfx.laser(pos);
    if (ev.t === 'fx' && ev.k === 'helmet' && pos) { this.sfx.shieldPop(pos); this.effects.puff(pos, 'metal', 0.9, 0.4); }
    if (ev.t === 'backup') this._voice('isr', 'Backup inbound on your position.');
  },

  // Laser sights of tower snipers taking aim.
  _lasersTick() {
    const seen = new Set();
    for (const g of this.sentinel.guards) {
      if (!g.aiming || g.state === 'dead') continue;
      seen.add(g.id);
      let L = this.lasers.get(g.id);
      if (!L) {
        L = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: '#ff2040', transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
        L.frustumCulled = false;
        this.scene.add(L);
        this.lasers.set(g.id, L);
      }
      const s = TYPES[g.type].scale;
      const a = new THREE.Vector3(g.x, g.y + 1.25 * s, g.z);
      const tp = g.aiming === this.role ? this.player.pos : this.partner.pos;
      const b = new THREE.Vector3(tp.x, tp.y + 1.15 + Math.sin(this.t * 9) * 0.08, tp.z);
      const arr = L.geometry.attributes.position.array;
      arr.set([a.x, a.y, a.z, b.x, b.y, b.z]);
      L.geometry.attributes.position.needsUpdate = true;
      if (g.aiming === this.role && !this._laserWarn) { this._laserWarn = true; this.hud.flash('SNIPER LASER ON YOU', 'red', 1.2); }
    }
    for (const [id, L] of this.lasers) if (!seen.has(id)) { this.scene.remove(L); this.lasers.delete(id); }
    if (![...this.lasers.keys()].some((id) => { const g = this.sentinel.byId(id); return g && g.aiming === this.role; })) this._laserWarn = false;
  },

  // ---- the van -----------------------------------------------------------------------
  // Which seat a role may take: co-op spotter drives, shooter rides; a lone operative drives.
  _seatFor(role) {
    if (this.operative) return 'driver';
    return role === 'spotter' ? 'driver' : 'passenger';
  },
  _seat(role = this.role) {
    const s = this.obj.seats || {};
    return s.driver === role ? 'driver' : s.passenger === role ? 'passenger' : null;
  },
  _seatWorld(seat) {
    return vanWorld(this.vanState, SEATS[seat]);
  },
  _doorWorld(seat) {
    return vanWorld(this.vanState, { x: SEATS[seat].door.x, y: 0, z: SEATS[seat].door.z });
  },

  // Host: boarding prompts for an agent near the van. Returns true if it handled the agent.
  _vanInteract(a, held, dt, opt) {
    const ob = this.obj;
    if (!ob.drive || ob.drive === 'server' || ob.depart) return false;
    const mine = this._seat(a.role);
    if (mine) { opt('vanout', 'Hold E — get out', 0.5, () => { ob.seats[mine] = null; }); return true; }
    for (const seat of ['driver', 'passenger']) {
      const d = this._doorWorld(seat);
      if (Math.hypot(d.x - a.pos.x, d.z - a.pos.z) > 2.2) continue;
      const want = this._seatFor(a.role);
      if (ob.seats[seat]) continue;
      if (seat !== want && !this.operative) { opt('vanx', seat === 'driver' ? 'Driver’s seat is the spotter’s — passenger door is on the other side' : 'Passenger seat is the shooter’s — driver’s door is on the other side', 0, null); return true; }
      opt('van-' + seat, `Hold E — get in (${seat === 'driver' ? 'driver’s seat' : 'passenger seat'})`, 0.6, () => { ob.seats[seat] = a.role; this.sfx.door(new THREE.Vector3(d.x, 1, d.z)); });
      return true;
    }
    return false;
  },

  // Host: the AI partner makes for the van once the drive is out; leave when everyone's in.
  _vanTick(dt) {
    const ob = this.obj;
    if (!ob.drive || ob.drive === 'server') return;
    if (this.aiPartner && !ob.seats[this._seatFor(this.partnerRole)]) {
      this._aiBoardT = (this._aiBoardT ?? 25) - dt;
      if (this._aiBoardT <= 22 && !this._aiSaid) { this._aiSaid = true; this._toast(`${this.partnerName}: moving to the van. Get that drive out.`, this.partnerRole === 'shooter' ? 'amber' : 'cyan', this.partnerName); }
      if (this._aiBoardT <= 0) { ob.seats[this._seatFor(this.partnerRole)] = 'ai'; this._toast(`${this.partnerName}: in the van. Engine’s hot.`, this.partnerRole === 'shooter' ? 'amber' : 'cyan', this.partnerName); }
    }
    if (ob.depart) {
      ob.departT = (ob.departT || 0) + dt;
      if (ob.departT > 6.5) { ob.exfil = true; this._win(); }
      return;
    }
    // Everyone still alive (and the AI partner) aboard, with the drive.
    const need = this.agents().filter((a) => a.alive).map((a) => a.role);
    const seated = (r) => !!this._seat(r);
    const carrierIn = ob.drive && seated(ob.drive);
    const aiIn = !this.aiPartner || ob.seats[this._seatFor(this.partnerRole)] === 'ai';
    if (need.length && need.every(seated) && carrierIn && aiIn) {
      ob.depart = 1;
      ob.departT = 0;
      this._toast('Go, go, go — we’re rolling.', 'cyan');
    }
  },

  _vanVisual(dt) {
    const ob = this.obj, V = this.vanState, U = this.van.userData;
    const hot = !!(ob.drive && ob.drive !== 'server');
    setVanLights(this.van, hot, this.t);
    for (const seat of ['driver', 'passenger']) {
      const D = U.doors[seat];
      const d = this._doorWorld(seat);
      const near = hot && !ob.depart && [this.player.pos, this.partner.pos].some((p) => Math.hypot(p.x - d.x, p.z - d.z) < 3) && !ob.seats[seat];
      D.open += ((near ? 1 : 0) - D.open) * Math.min(1, dt * 6);
      D.hinge.rotation.y = D.sx * D.open * 1.1;
    }
    if (ob.depart) {
      if (!this._departing) { this._departing = true; this.sfx.van(new THREE.Vector3(V.x, V.y + 1, V.z)); this.vanBox.solid = this.vanBox.sight = this.vanBox.shot = false; }
      V.speed = Math.min(26, V.speed + 7 * dt);
      V.x += Math.cos(0) * V.speed * dt; // east along the track
      V.y = terrainHeight(V.x, V.z);
      for (const w of U.wheels) w.rotation.x -= (V.speed / 0.38) * dt;
      this._placeVan();
    }
    // Who's aboard: your partner's model sits in its seat.
    const S = ob.seats || {};
    let ps = null;
    for (const seat of ['driver', 'passenger']) { const who = S[seat]; if (who === this.partnerRole || (who === 'ai' && this._seatFor(this.partnerRole) === seat)) ps = seat; }
    this.partner.seated = ps;
    if (ps) { const w = this._seatWorld(ps); this.partner.pos.set(w.x, w.y - 0.55, w.z); this.partner.yaw = V.yaw; this.partner.st = 1; this.partner.avatarHidden = false; }
  },

  // ---- HUD overlay pieces -------------------------------------------------------------
  _kitDraw(c, W, H, proj) {
    const K = this.kit;
    // DEADEYE marks: numbered diamonds over the heads you've swept.
    for (const [i, id] of (K.deMarks || []).entries()) {
      const g = this.sentinel.byId(id);
      if (!g || g.state === 'dead') continue;
      const h = guardCapsules(g)[0].a, p = proj(h.x, h.y + 0.35, h.z);
      if (p.behind) continue;
      c.fillStyle = 'rgba(255,40,50,0.9)'; c.strokeStyle = '#ffffff'; c.lineWidth = 1.5;
      c.beginPath(); c.moveTo(p.x, p.y - 11); c.lineTo(p.x + 9, p.y); c.lineTo(p.x, p.y + 11); c.lineTo(p.x - 9, p.y); c.closePath(); c.fill(); c.stroke();
      c.fillStyle = '#ffffff'; c.font = '700 11px JetBrains Mono, monospace'; c.textAlign = 'center'; c.fillText(String(i + 1), p.x, p.y + 4);
    }
    if (K.deadeye > 0) { c.fillStyle = 'rgba(255,90,100,0.95)'; c.font = '700 13px JetBrains Mono, monospace'; c.textAlign = 'center'; c.fillText(`DEADEYE \u00B7 ${(K.deMarks || []).length}/3 AUTO-MARKED \u00B7 ${(K.deMarks || []).length ? 'FIRE TO EXECUTE' : 'NO ONE IN SIGHT'} \u00B7 ${Math.ceil(K.deadeye)} s`, W / 2, H * 0.72); }
    // DEADEYE: heads and bulwark sight-ports glow, through the dark (not through walls).
    if (K.deadeye > 0) {
      const o = this.camera.position;
      for (const g of this.sentinel.guards) {
        if (g.state === 'dead') continue;
        const h = guardCapsules(g)[0].a;
        if (o.distanceTo(h) > 260 || !this.fac.los(o, h)) continue;
        const p = proj(h.x, h.y, h.z);
        if (p.behind) continue;
        const col = TYPES[g.type].color;
        c.strokeStyle = col;
        c.lineWidth = 1.5;
        c.beginPath(); c.arc(p.x, p.y, 7, 0, Math.PI * 2); c.stroke();
        c.beginPath(); c.moveTo(p.x - 11, p.y); c.lineTo(p.x - 5, p.y); c.moveTo(p.x + 5, p.y); c.lineTo(p.x + 11, p.y); c.stroke();
        if (g.type === 'bulwark' && !(g.lower > 0)) {
          const s = TYPES.bulwark.scale, yaw = g.yaw + (g.look || 0), cs = Math.cos(yaw), sn = Math.sin(yaw);
          const lx = ((WALL.port.x0 + WALL.port.x1) / 2) * s, lz = WALL.z * s, ly = ((WALL.port.y0 + WALL.port.y1) / 2) * s;
          const q = proj(g.x + lx * cs + lz * sn, g.y + ly, g.z - lx * sn + lz * cs);
          if (!q.behind) { c.strokeStyle = '#ffffff'; c.strokeRect(q.x - 5, q.y - 4, 10, 8); c.fillStyle = '#ffffff'; c.font = '600 9px JetBrains Mono, monospace'; c.fillText('PORT', q.x, q.y - 8); }
        }
        if (g.maxShield && g.shield > 0) { c.fillStyle = col; c.font = '600 9px JetBrains Mono, monospace'; c.fillText(`SHELL ${Math.round((g.shield / g.maxShield) * 100)}%`, p.x, p.y + 18); }
      }
    }
    // Execute marks: brackets on the targets you can snap to right now.
    if (false) { // Execute was removed
      this._execList = (this._execListT = (this._execListT || 0) - 1 / 60) <= 0 ? ((this._execListT = 0.2), this._execTargets()) : this._execList || [];
      c.strokeStyle = '#ff3048';
      c.lineWidth = 2;
      for (const g of this._execList) {
        const h = guardCapsules(g)[0].a;
        const p = proj(h.x, h.y, h.z);
        if (p.behind) continue;
        const s = 10;
        c.beginPath();
        c.moveTo(p.x - s, p.y - s + 4); c.lineTo(p.x - s, p.y - s); c.lineTo(p.x - s + 4, p.y - s);
        c.moveTo(p.x + s - 4, p.y - s); c.lineTo(p.x + s, p.y - s); c.lineTo(p.x + s, p.y - s + 4);
        c.moveTo(p.x - s, p.y + s - 4); c.lineTo(p.x - s, p.y + s); c.lineTo(p.x - s + 4, p.y + s);
        c.moveTo(p.x + s - 4, p.y + s); c.lineTo(p.x + s, p.y + s); c.lineTo(p.x + s, p.y + s - 4);
        c.stroke();
      }
    }
  },
};

const ROLES_COLOR = { shooter: '#f2b35b', spotter: '#40d8e8' };
export function installKit(Cls) {
  Object.assign(Cls.prototype, KitMethods);
}
void angDiff;

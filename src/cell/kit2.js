// Sniper Cell — more systems on CellGame's prototype:
//   lights you can shoot out · suppressors and fire modes · the knife · IR strobes, lasers
//   and night-vision layers · the dropped drive · radio voices · hunt ghosts (last known
//   position) · SYNC shots (both rifles on marked heads → the light goes green).
import * as THREE from 'three';
import { ROOMS, BUILDING } from './facility.js';
import { guardCapsules, angDiff } from './sentinel.js';
import { addStrobes, blinkStrobes, IRLaser, ghostAvatar, tickGhosts, IR_LAYER } from './irfx.js';
import { glove } from './nvg.js';

const SUP_DUR = 1.25;
export const Kit2 = {
  // A payload target ({x,z,y?}) inside the building → its room (floor from y, else the
  // tablet's floor, else the operator's).
  _roomFor(t) {
    if (!t || !this.fac.insideBuilding(t.x, t.z)) return null;
    const y = t.y ?? (this.tablet && this.tablet.visible ? this.tablet.floor * BUILDING.f1 : this.player.pos.y);
    return this.fac.roomAt(t.x, t.z, y + 0.5);
  },

  // Host: a lamp or panel shot out — glass, sparks, and someone may come and look.
  _shootLight(id, at) {
    if (!this.fac.breakLight(id)) return;
    this.sentinel.noise({ x: at.x, y: at.y, z: at.z }, 12, false);
    this.sentinel.lightOut(at);
    this._broadcastFx({ k: 'glass', x: at.x, y: at.y, z: at.z });
    this.atmos.syncLamps();
  },

  // B: the support hand comes up to the muzzle and twists the can off (pocketed), or brings
  // it up from the pouch and threads it on. You can't fire mid-gesture; the state flips the
  // moment the can comes free (off) or the last thread bites (on).
  _toggleSup() {
    const w = this.player.w;
    if (w.def.slot === 'rifle') { this.hud.flash('RIFLE SUPPRESSOR IS INTEGRAL', 'dim'); return; }
    if (this.supAnim) return;
    if (this.player.reloadT > 0 || this.downed) { w.sup = !w.sup; this._supFlash(w); return; }
    this.supAnim = { t: 0, w, to: !w.sup, done: false, ticks: 0 };
    this.audio.nvgReach && this.audio.nvgReach();
  },
  _supFlash(w) {
    this.hud.flash(w.sup ? 'SUPPRESSOR ON' : 'SUPPRESSOR OFF — LOUD', w.sup ? 'cyan' : 'red');
    this.audio.click();
  },
  // Progress 0..1 for the viewmodel, or 0 when idle. Commit points: off at 0.55, on at 0.78.
  _supTick(dt) {
    const A = this.supAnim;
    if (!A) return 0;
    if (this.player.w !== A.w) { this.supAnim = null; return 0; }
    A.t += dt;
    const u = Math.min(1, A.t / SUP_DUR);
    // Thread clicks while the can turns.
    const tw0 = A.to ? 0.5 : 0.24, tw1 = A.to ? 0.78 : 0.52;
    const n = Math.floor(Math.max(0, Math.min(1, (u - tw0) / (tw1 - tw0))) * 5);
    while (A.ticks < n) { A.ticks++; this.audio.supThread && this.audio.supThread(A.ticks / 5); }
    if (!A.done && u >= (A.to ? 0.78 : 0.55)) { A.done = true; A.w.sup = A.to; this._supFlash(A.w); }
    if (u >= 1) this.supAnim = null;
    return u;
  },
  _cycleMode() {
    const w = this.player.w, M = w.def.modes;
    w.mode = M[(M.indexOf(w.mode) + 1) % M.length];
    this.hud.flash(w.mode.toUpperCase(), 'cyan', 0.7);
    this.audio.click();
  },

  // V / KNIFE: a knife strike on whoever's in arm's reach in front of you. From behind or on
  // someone who hasn't clocked you, it's a silent takedown; head-on it's a heavy wound.
  // The enemy in knife reach in front of you (or null).
  _meleeTarget() {
    const P = this.player, S = this.sentinel;
    let best = null, bd = 2.3;
    for (const g of S.guards) {
      if (g.state === 'dead' || Math.abs(g.y - P.pos.y) > 1.2) continue;
      const dx = g.x - P.pos.x, dz = g.z - P.pos.z, d = Math.hypot(dx, dz);
      if (d > bd) continue;
      if (Math.abs(angDiff(Math.atan2(-dx, -dz), P.yaw)) > 1.0) continue;
      best = g; bd = d;
    }
    return best;
  },
  _melee() {
    const P = this.player;
    if (this.knifeT > 0 || this.tdAnim || this.downed) return;
    const best = this._meleeTarget();
    if (!best) { this._knife(); return; }
    // From behind: grab him by the neck with the left hand and stab with the right. Head-on:
    // tackle him to the ground, stab, and get back up. The kill lands at the stab.
    const behind = Math.abs(angDiff(Math.atan2(-(P.pos.x - best.x), -(P.pos.z - best.z)), best.yaw + (best.look || 0))) > 1.9;
    const kind = behind ? 'grab' : 'tackle';
    const dx = best.x - P.pos.x, dz = best.z - P.pos.z, d = Math.hypot(dx, dz) || 1;
    this.tdAnim = { kind, t: 0, dur: kind === 'grab' ? 1.05 : 1.6, stabAt: kind === 'grab' ? 0.38 : 0.72, hit: false, id: best.id,
      from: P.pos.clone(), to: new THREE.Vector3(best.x - (dx / d) * (kind === 'grab' ? 0.55 : 0.9), P.pos.y, best.z - (dz / d) * (kind === 'grab' ? 0.55 : 0.9)), yaw: Math.atan2(-dx, -dz) };
    this.sfx.blade(this.camera.position);
  },
  // The takedown animation (first person): drives the camera, a left glove and the knife.
  tdGloveFactory() { const g = glove(); g.scale.setScalar(1.1); return g; },
  _tdTick(dt) {
    const A = this.tdAnim;
    if (!A) { if (this.tdGlove) this.tdGlove.visible = false; return; }
    if (!this.tdGlove) {
      const g = (this.tdGlove = glove());
      g.scale.setScalar(1.15);
      g.traverse((o) => { o.renderOrder = 11; o.frustumCulled = false; });
      this.camera.add(g);
    }
    const P = this.player, G = this.tdGlove, Kn = this.knife, u = A.t / A.dur;
    A.t += dt;
    const ease = (x) => x * x * (3 - 2 * x), seg = (a, b) => Math.max(0, Math.min(1, (A.t - a) / (b - a)));
    // Turn to face him and close in.
    P.yaw += angDiff(A.yaw, P.yaw) * Math.min(1, dt * 12);
    const close = ease(seg(0, A.kind === 'grab' ? 0.22 : 0.3));
    P.pos.x = A.from.x + (A.to.x - A.from.x) * close;
    P.pos.z = A.from.z + (A.to.z - A.from.z) * close;
    Kn.visible = true; G.visible = A.kind === 'grab';
    const stab = Math.sin(Math.PI * seg(A.stabAt - 0.12, A.stabAt + 0.14));
    if (A.kind === 'grab') {
      // Left hand up to his neck and hold; the right drives the knife in under it.
      const reach = ease(seg(0, 0.22)) * (1 - ease(seg(0.8, 1.0)));
      G.position.set(-0.28 + 0.2 * reach, -0.45 + 0.3 * reach, -0.3 - 0.16 * reach);
      G.rotation.set(1.1 - 0.5 * reach, 0.3, 0.4 * reach);
      Kn.position.set(0.16 - 0.1 * stab, -0.26 + 0.1 * stab, -0.3 - 0.22 * stab);
      Kn.rotation.set(-0.6 + 0.6 * stab, 0.4, -0.3);
      this.camera.rotation.x += -0.12 * reach;
    } else {
      // Tackle: lunge forward and down, on the ground for the stab, then back up.
      const down = ease(seg(0, 0.3)) * (1 - ease(seg(1.05, 1.55)));
      this.camera.position.y -= 1.0 * down;
      this.camera.rotation.x += -0.75 * down;
      this.camera.rotation.z += 0.25 * down * (1 - seg(0.3, 0.5)) + 0.08 * Math.sin(A.t * 30) * seg(0.25, 0.35) * (1 - seg(0.35, 0.4));
      Kn.position.set(0.14 - 0.06 * stab, -0.22 + 0.12 * stab, -0.3 - 0.2 * stab);
      Kn.rotation.set(-0.9 + 0.9 * stab, 0.3, -0.2);
    }
    if (!A.hit && A.t >= A.stabAt) {
      A.hit = true;
      this.audio.hitConfirm(true);
      this.hud.hitMarker(true);
      this.camKick = (this.camKick || 0) - 0.03;
      this.payload('melee', { id: A.id, x: A.to.x, z: A.to.z, yaw: P.yaw, by: this.role });
      this.hud.flash('TAKEDOWN', 'cyan', 0.7);
    }
    if (A.t >= A.dur) { this.tdAnim = null; Kn.visible = false; G.visible = false; }
    void u;
  },
  // Dragging a body, first person: the gun away, both gloves low in front gripping his
  // collar, rocking with each step, and the view tipped down a little to watch him.
  _dragTick(dt) {
    const on = !!(this.obj.drag && this.obj.drag[this.role]) && !this.downed && !this.kia;
    // Sounds: the grab, a scrape with each step while you drag, and the drop.
    {
      const id = on ? this.obj.drag[this.role] : 0, body = id && this.sentinel.byId(id);
      if (body) this._dragAt = { x: body.x, y: (body.y || 0) + 0.3, z: body.z };
      if (on && !this._dragWas && this._dragAt) this.foley.bodyGrab(this._dragAt);
      if (!on && this._dragWas && this._dragAt) this.foley.bodyDrop(this._dragAt);
      if (on && this._dragAt) {
        const ph = Math.floor((this.player.bobPhase || 0) / Math.PI);
        if (ph !== this._dragPh && (this.player.speed || 0) > 0.4) this.foley.dragScrape(this._dragAt);
        this._dragPh = ph;
      }
      this._dragWas = on;
    }
    this.dragK = Math.max(0, Math.min(1, (this.dragK || 0) + (on ? dt * 4 : -dt * 5)));
    const k = this.dragK;
    if (!this.dragG) {
      if (!k) return;
      this.dragG = [glove(), glove()];
      for (const g of this.dragG) { g.scale.setScalar(1.15); g.traverse((o) => { o.renderOrder = 11; o.frustumCulled = false; }); this.camera.add(g); }
    }
    const [L, R] = this.dragG;
    L.visible = R.visible = k > 0.02;
    if (!L.visible) return;
    const P = this.player, ph = P.bobPhase || 0, mv = Math.min(1, (P.speed || 0) / 1.5);
    const ease = k * k * (3 - 2 * k);
    // Each step heaves him along: the hands pull back and up, then ease forward.
    const heave = Math.sin(ph) * 0.025 * mv, sway = Math.cos(ph * 0.5) * 0.02 * mv;
    for (const [G, s] of [[L, -1], [R, 1]]) {
      G.position.set(s * (0.13 - 0.04 * ease) + sway, -0.6 + 0.34 * ease + heave, -0.36 - 0.1 * ease + heave * 0.6);
      G.rotation.set(-0.35 + heave * 4, s * 0.25, s * 0.35); // palms down, fingers curled over his collar
    }
    // Tip the view down to watch him only while he's in front of you.
    const g = on && this.sentinel.byId(this.obj.drag[this.role]);
    const ahead = g ? Math.max(0, -(Math.sin(P.yaw) * (g.x - P.pos.x) + Math.cos(P.yaw) * (g.z - P.pos.z)) / 1.85) : 0;
    this.dragLook = (this.dragLook || 0) + (ahead - (this.dragLook || 0)) * Math.min(1, dt * 4);
    this.camera.rotation.x += -0.2 * ease * this.dragLook;
    this.camera.rotation.z += sway * 0.6 * ease;
    this.camera.position.y += -0.04 * ease + heave * 0.4;
  },
  // Host: resolve a knife strike.
  _meleeHit(target, by) {
    by = target.by || by;
    const S = this.sentinel, g = S.byId(target.id);
    if (!g || g.state === 'dead') return;
    const behind = Math.abs(angDiff(Math.atan2(-(target.x - g.x), -(target.z - g.z)), g.yaw + (g.look || 0))) > 1.9;
    const unaware = g.state === 'patrol' || g.state === 'post' || g.state === 'sus' || g.stagger > 0;
    if (behind || unaware) {
      S.damage(g.id, 999, 'takedown', null, 'head');
      this._killFeed(g, 'takedown', by, false, 0);
      if (g.chief) this._toast(this.mission === 'nightwatch' ? 'The Overseer is down. Take its badge.' : 'Site Chief is down. Take his badge.', 'amber');
    } else {
      S.damage(g.id, 150, 'melee', { x: target.x, z: target.z }, 'torso');
      g.stagger = Math.max(g.stagger || 0, 0.8);
    }
  },

  // Knife takedown: a quick stab from low right.
  _knife() {
    this.knifeT = 0.55;
    this.knife.visible = true;
    this.sfx.blade(this.camera.position);
    this.audio.hitConfirm(true);
    this.hud.flash('TAKEDOWN', 'cyan', 0.7);
  },
  _knifeTick(dt) {
    if (this.tdAnim) return; // the takedown animation owns the knife
    if (!(this.knifeT > 0)) { this.knife.visible = false; return; }
    this.knifeT -= dt;
    const u = 1 - this.knifeT / 0.55;
    const thrust = Math.sin(Math.min(1, u * 1.6) * Math.PI);
    this.knife.position.set(0.12 - 0.08 * thrust, -0.16 + 0.06 * thrust, -0.25 - 0.18 * thrust);
    this.knife.rotation.set(-0.2 + 0.3 * thrust, 0.3, -0.5 * thrust);
    if (this.knifeT <= 0) this.knife.visible = false;
  },

  // ---- IR: strobes, lasers, ghosts --------------------------------------------------
  _irInit() {
    this.strobes = { partner: addStrobes(this.partner.avatar), self: addStrobes(this.selfAvatar) };
    this.irLasers = { me: new IRLaser(this.scene), partner: new IRLaser(this.scene) };
    // Visible red laser sights (K toggles yours).
    this.visLasers = { me: new IRLaser(this.scene, '#ff2a2a', false), partner: new IRLaser(this.scene, '#ff2a2a', false) };
    this.ghosts = {};
    for (const r of ['shooter', 'spotter']) this.ghosts[r] = ghostAvatar(this._look(r), this.scene);
    // Partner's drive, strapped to their back.
    this.partnerDrive = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.08, 0.3), new THREE.MeshBasicMaterial({ color: '#ff9a20' }));
    this.partnerDrive.position.set(0.15, 0.35, 0.2);
    if (this.partner.avatar.spine) this.partner.avatar.spine.add(this.partnerDrive);
    this.groundDriveMesh = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.1, 0.4), new THREE.MeshBasicMaterial({ color: '#ff9a20' }));
    this.groundDriveMesh.visible = false;
    this.scene.add(this.groundDriveMesh);
  },

  // Whether the view you're looking through sees IR (night vision, scope NV, quad, ISR IR).
  _irView() {
    const P = this.player;
    if (this.isr.active) return this.isr.mode === 'IR';
    return this.nv || !!(this.quad && this.quad.active) || (P.def.scope && P.scopeT > 0.6);
  },

  // The laser module on a first-person gun, built once per model: a small dark box with a lens,
  // under the barrel of the pistols, clamped to the right of the rifle's / SMG's forend.
  _lzMount(key, g) {
    const U = g.userData;
    if (U._lz) return U._lz;
    const m = U.muzzle.position;
    const side = key === 'kr50' || key === 'smg';
    const at = side ? new THREE.Vector3(0.034, m.y - 0.012, m.z + (key === 'kr50' ? 0.5 : 0.3)) : new THREE.Vector3(0, m.y - 0.042, m.z + 0.075);
    const box = new THREE.Mesh(new THREE.BoxGeometry(side ? 0.022 : 0.026, side ? 0.024 : 0.02, 0.06), new THREE.MeshStandardMaterial({ color: 0x1b1d20, roughness: 0.6, metalness: 0.4 }));
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.006, 10), new THREE.MeshBasicMaterial({ color: 0xff3b2a }));
    lens.position.set(0, 0, -0.0305); lens.rotation.y = Math.PI;
    box.add(lens);
    box.position.copy(at);
    const ref = U.muzzle.parent === g ? null : U.muzzle.parent;
    for (const o of [box, lens]) { o.renderOrder = 10; o.frustumCulled = false; }
    (ref || g).add(box);
    // The beam leaves from the lens.
    const tip = new THREE.Object3D(); tip.position.set(0, 0, -0.035); box.add(tip);
    U._lz = tip;
    return tip;
  },

  _irTick(dt) {
    const t = this.t;
    blinkStrobes(this.strobes.partner, t, 0.5);
    blinkStrobes(this.strobes.self, t, 0);
    tickGhosts(t);
    const ir = this._irView();
    if (ir) this.camera.layers.enable(IR_LAYER); else this.camera.layers.disable(IR_LAYER);
    // Lasers: from your weapon along your aim, and from your partner's.
    const P = this.player;
    const o = P.eyePos(new THREE.Vector3());
    const live = !this.downed && !this.kia && !this.isr.active && !(this.quad && this.quad.active) && !this.knifeEq && !(this.dragK > 0.5); // no lasers on a knife, or with both hands on a body
    if (live) {
      // From the laser module on the gun (under the barrel of a handgun, on the right of the
      // rifle's forend), straight out along the barrel: wherever the gun points, it points.
      const vm = this.viewmodel;
      const gm = vm.root.visible && vm.current && vm.models[vm.current];
      let from, end;
      if (gm) {
        const mod = this._lzMount(vm.current, gm);
        gm.updateWorldMatrix(true, true);
        from = mod.getWorldPosition(new THREE.Vector3());
        const barrel = new THREE.Vector3(0, 0, -1).applyQuaternion(mod.getWorldQuaternion(new THREE.Quaternion())).normalize();
        end = from.clone().addScaledVector(barrel, 220);
      } else {
        from = o.clone().add(new THREE.Vector3(0.04, -0.09, -0.45).applyEuler(this.camera.rotation));
        end = from.clone().addScaledVector(P.aimDir(new THREE.Vector3()), 220);
      }
      const h = this.fac.ray(from.clone().addScaledVector(end.clone().sub(from).normalize(), 0.05), end, 'shot');
      this.irLasers.me.set(from, h ? h.point : end, true);
      this.visLasers.me.set(from, h ? h.point : end, !!this.laserOn && !this.cine.active && !(this.bino && this.bino.on));
    } else { this.irLasers.me.set(o, o, false); this.visLasers.me.set(o, o, false); }
    const Q = this.partner;
    if (Q.seen && !Q.kia && !Q.downed && !Q.seated && !(Q.ai && Q.avatarHidden)) {
      // Your partner's: from the muzzle of the rifle / pistol on their model, along its barrel.
      const av = Q.avatar;
      if (!av._irMz) {
        const r = new THREE.Object3D(); r.position.set(0, 0, -1.27); av.rifle.add(r);
        const pz = new THREE.Object3D(); pz.position.set(0, 0, -0.1); av.pistol.add(pz);
        av._irMz = { rifle: r, pistol: pz };
      }
      const gun = av.pistol.visible ? av.pistol : av.rifle, mz = av.pistol.visible ? av._irMz.pistol : av._irMz.rifle;
      gun.updateWorldMatrix(true, false);
      const a = mz.getWorldPosition(new THREE.Vector3());
      const d = new THREE.Vector3(0, 0, -1).applyQuaternion(gun.getWorldQuaternion(new THREE.Quaternion())).normalize();
      const end = a.clone().addScaledVector(d, 220);
      const h = this.fac.ray(a.clone().addScaledVector(d, 0.05), end, 'shot');
      this.irLasers.partner.set(a, h ? h.point : end, true);
      this.visLasers.partner.set(a, h ? h.point : end, !!(Q.ex ? Q.ex.lz : Q.ai) && !this.cine.active);
    } else { this.irLasers.partner.set(o, o, false); this.visLasers.partner.set(o, o, false); }
    // Hunt ghosts: where SENTINEL last saw each operator, while they hunt.
    for (const role of ['shooter', 'spotter']) {
      const G = this.ghosts[role], H = this._huntInfo(role);
      const show = H && H.state === 'hunted' && H.lkp && this.agentPos(role).distanceTo(new THREE.Vector3(H.lkp.x, H.lkp.y, H.lkp.z)) > 2.5 && !(this.solo && role !== this.role && !this.aiPartner);
      G.setVisible(!!show);
      if (show) G.update(dt, { p: new THREE.Vector3(H.lkp.x, H.lkp.y, H.lkp.z), yaw: H.lkp.yaw, pitch: 0, st: H.lkp.st, moving: false, w: role === 'spotter' });
    }
    this.partnerDrive.visible = this.obj.drive === this.partnerRole;
    this._syncTick(dt);
    this._contactTick(dt);
    this._wlTick();
  },

  _groundDrive() {
    const ob = this.obj, D = this.groundDriveMesh;
    D.visible = ob.drive === 'ground' && !!ob.driveAt;
    if (D.visible) { D.position.set(ob.driveAt.x, (ob.driveAt.y || 0) + 0.06, ob.driveAt.z); D.rotation.y = this.t; }
  },

  // Map the scene's fixed point lights onto the nearest light source, so they die with it.
  _mapPoints() {
    for (const pt of this.points) {
      let best = null, bd = 1e9;
      for (const L of this.fac.lightSources) {
        const d = Math.hypot(L.x - pt.L.position.x, (L.y - pt.L.position.y) * 2, L.z - pt.L.position.z);
        if (d < bd) { bd = d; best = L; }
      }
      pt.src = bd < 12 ? best : null;
    }
  },

  // Host: authoritative hunt info; guest: from the snapshot.
  _huntInfo(role) {
    const S = this.sentinel;
    if (this.isHost) { const H = S.hunt[role]; return H && H.lkp ? { state: S.huntState(role), lkp: H.lkp, since: S.t - H.seen } : null; }
    const h = S.huntSnap && S.huntSnap[role];
    return h ? { state: h[0], lkp: { x: h[1], y: h[2], z: h[3], yaw: h[4], st: h[5] }, since: h[6] } : null;
  },

  // ---- radio voices ------------------------------------------------------------------
  // who: 'shooter' | 'spotter' | 'isr' (or 'partner' / 'me'). Plays locally.
  _voice(who, text, keep = false, low = false, parts = null) {
    if (!this.radio) return;
    if (who === 'me') who = this.role;
    if (who === 'partner') who = this.partnerRole;
    // Subtitles carry the operators' callsigns.
    this.radio.names = { [this.role]: this.name, [this.partnerRole]: this.partnerName, isr: 'OVERWATCH' };
    this.radio.say(who, text, false, keep, low, parts);
  },

  // ---- SYNC shots -----------------------------------------------------------------------
  // Mark: hold Q (or SYNC) with your sights on an enemy to flag it for your ally. Then each
  // operator puts their sights on a head that dies to one shot (no helmet). When both are on
  // target and at least one is a sync mark, a solid FIRE marker locks over both heads and,
  // after a beat, both weapons fire on their own. Operators call it over the radio.
  _syncAimFrom(o, dir, fovDeg, exclude) {
    let best = 0, bs = 0.02 * (62 / fovDeg);
    for (const g of this.sentinel.guards) {
      if (g.state === 'dead' || g.id === exclude || g.helmet) continue;
      const h = guardCapsules(g)[0].a;
      const v = h.clone().sub(o);
      if (v.length() > 400) continue;
      const ang = v.normalize().angleTo(dir);
      if (ang < bs && this.fac.los(o, h)) { bs = ang; best = g.id; }
    }
    return best;
  },
  _syncTick(dt = 0.016) {
    const P = this.player, S = this.sentinel;
    const live0 = S.guards.filter((g) => g.sync && g.state !== 'dead');
    const marks = live0.length;
    this.syncMarks = marks;
    // Mark order (each client keeps its own): the AI takes the first mark, you the next.
    const O = (this._syncOrder = this._syncOrder || new Map());
    for (const g of live0) if (!O.has(g.id)) O.set(g.id, this.t + O.size * 1e-6);
    for (const id of [...O.keys()]) { const g = S.byId(id); if (!g || !g.sync || g.state === 'dead') O.delete(id); }
    this._syncCd = Math.max(0, (this._syncCd || 0) - dt);
    if (this._syncKill) {
      const K = this._syncKill;
      K.t -= dt;
      if (K.t <= 0) {
        this._syncKill = null;
        const g = S.byId(K.id);
        if (g && g.state === 'dead') this._radio('me', ['X-ray down.', 'Tango down.', 'Target down.', 'He\'s down.'][Math.floor(Math.random() * 4)], 'soft');
      }
    }
    if (!marks) { this.syncAim = 0; this.syncPartner = 0; this._syncT = 0; this._syncSaid = false; return; }
    const o = P.eyePos(new THREE.Vector3());
    const live = !this.downed && !this.kia && !this.isr.active && !(this.quad && this.quad.active) && !this.tablet.visible;
    // Your crosshair on a head counts, aimed down sights or not.
    this.syncAim = live ? this._syncAimFrom(o, P.aimDir(new THREE.Vector3()), this.camera.fov, 0) : 0;
    if (this.aiShoot || this.aiSpot) {
      // AI partner (Ra on his rifle, or Rōnin on his pistol at shorter range): the earliest
      // sync mark he can see (and not the one you're on). You take the next one.
      const eye = this._aiEye(), range = this.aiShoot ? 340 : 75;
      const order = [...O.entries()].sort((a, b) => a[1] - b[1]).map(([id]) => S.byId(id));
      let pick = 0;
      for (const g of order) {
        if (!g || g.state === 'dead' || g.helmet || g.id === this.syncAim) continue;
        const h = guardCapsules(g)[0].a;
        if (eye.distanceTo(h) < range && this.fac.los(eye, h)) { pick = g.id; break; }
      }
      this.syncPartner = (this.aiShoot && this.aiShoot.moveT > 0) || this.partner.seated || this.partner.downed || this.partner.kia ? 0 : pick;
    } else this.syncPartner = this.partner.sy || 0;
    // Hold together for a beat, then everyone fires.
    if (this.syncReady && this._syncCd <= 0) {
      if (!this._syncSaid) { this._syncSaid = true; this._radio('me', this.role === 'shooter' ? 'On target.' : 'Sync ready.'); }
      this._syncT = (this._syncT || 0) + dt;
      if (this._syncT >= 0.7) { this._syncT = 0; this._syncCd = 1.5; this._autoFire = true; this._syncKill = { id: this.syncAim, t: 0.45 }; }
    } else { this._syncT = 0; if (!this.syncReady) this._syncSaid = false; }
  },
  get syncReady() {
    if (!(this.syncAim && this.syncPartner && this.syncAim !== this.syncPartner)) return false;
    const a = this.sentinel.byId(this.syncAim), b = this.sentinel.byId(this.syncPartner);
    return !!((a && a.sync) || (b && b.sync));
  },
  // The AI partner's eye (perch, or wherever it's walking / crouched).
  _aiEye() {
    const Q = this.partner, h = Q.st === 2 ? 0.45 : Q.st === 1 ? 1.0 : 1.45;
    return new THREE.Vector3(Q.pos.x, Q.pos.y + (this.aiShoot && Q.st === 2 ? 1.3 : h), Q.pos.z);
  },
  // Your shot on a green sync: the AI partner fires with you.
  _syncFire() {
    if (!this.syncReady || !(this.aiShoot || this.aiSpot)) return;
    const g = this.sentinel.byId(this.syncPartner);
    if (!g || g.state === 'dead') return;
    const a = this._aiEye();
    const Q = this.partner;
    if (this.aiSpot) Q.yaw = Math.atan2(-(g.x - Q.pos.x), -(g.z - Q.pos.z));
    const h = guardCapsules(g)[0].a;
    this._trail(a, h, false);
    this.audio.shotDistant(a, this.camera.position.distanceTo(a) / 343, true);
    if (this.isHost) this._applyHit(g.id, 999, 'ai', null, 'ai', true, a.distanceTo(h));
    this.hud.flash('SYNC SHOT', 'cyan', 1);
    setTimeout(() => this._voice('partner', 'X-ray down.'), 900);
  },
  // Hold Q / SYNC on an enemy: mark it as a sync target for your ally.
  _syncMark(e) {
    if (!e || e.kind !== 'g') return;
    this._call('sync', { x: e.x, z: e.z }, e.id);
    this.hud.flash('SYNC TARGET MARKED', 'cyan');
  },
  // A radio line heard by both operators.
  // low: optional chatter (callouts), skipped when the net is busy.
  _radio(who, text, low = false) {
    if (who === 'me') who = this.role;
    if (who === 'partner') who = this.partnerRole;
    if (low === 'soft' ? !this.radio.idle() : low && !this.radio.free()) return;
    this._voice(who, text, false, low === true);
    this.comms(text, who === 'shooter' ? '#ffb040' : '#40d0ff', who === this.role ? this.name : this.partnerName);
    this._broadcast({ k: 'radio', who, text });
  },
  // HUD: SYNC tags over marked heads; a solid FIRE block over both heads when you're synced.
  _syncHud(c, proj) {
    const S = this.sentinel;
    if (!this.syncMarks) return;
    const ready = this.syncReady;
    c.textAlign = 'center';
    for (const g of S.guards) {
      if (g.state === 'dead') continue;
      const lock = ready && (g.id === this.syncAim || g.id === this.syncPartner);
      if (!g.sync && !lock) continue;
      const h = guardCapsules(g)[0].a;
      const p = proj(h.x, h.y + 0.35, h.z);
      if (p.behind) continue;
      if (lock) {
        const k = Math.min(1, (this._syncT || 0) / 0.7);
        c.fillStyle = 'rgba(255,40,60,0.92)';
        c.fillRect(p.x - 26, p.y - 34, 52, 20);
        c.fillStyle = '#fff';
        c.font = '700 13px JetBrains Mono, monospace';
        c.fillText('FIRE', p.x, p.y - 19);
        c.fillStyle = 'rgba(255,255,255,0.9)';
        c.fillRect(p.x - 26, p.y - 13, 52 * k, 3);
        c.strokeStyle = 'rgba(255,40,60,0.95)';
        c.lineWidth = 2;
        c.beginPath(); c.arc(p.x, p.y + 12, 10, 0, Math.PI * 2); c.stroke();
      } else {
        // Sync target: a pulsing circle over the head.
        const r = 11 + Math.sin(this.t * 5) * 1.5;
        c.strokeStyle = 'rgba(80,255,200,0.95)';
        c.lineWidth = 2;
        c.beginPath(); c.arc(p.x, p.y, r, 0, Math.PI * 2); c.stroke();
        c.beginPath(); c.arc(p.x, p.y, 2, 0, Math.PI * 2); c.fillStyle = 'rgba(80,255,200,0.95)'; c.fill();
        c.fillStyle = 'rgba(80,255,200,0.9)';
        c.font = '600 10px JetBrains Mono, monospace';
        let tag = 'SYNC';
        if (g.id === this.syncAim) tag = 'SYNC \u00B7 YOU';
        else if (g.id === this.syncPartner) tag = 'SYNC \u00B7 ALLY';
        else if ((this.aiShoot || this.aiSpot) && this._syncOrder && this._syncOrder.size >= 2) {
          // Two marks with an AI partner: the first is his, the second is yours.
          const first = [...this._syncOrder.entries()].sort((a, b) => a[1] - b[1])[0][0];
          tag = g.id === first ? 'SYNC 1 \u00B7 ALLY' : 'SYNC 2 \u00B7 YOU';
        }
        c.fillText(tag, p.x, p.y - 17);
      }
    }
    c.lineWidth = 1;
  },

  // ---- "Contact" callouts -------------------------------------------------------------------
  // Now and then an operator calls a fresh enemy in their field of view: which side of the
  // screen (left / right / ahead) and range, over the radio, like a squad would. Each enemy is
  // called once; at most one call every 40 s (half are skipped), and only on a quiet net.
  _contactTick(dt) {
    this._ctT = (this._ctT || 0) - dt;
    this._ctCd = Math.max(0, (this._ctCd || 0) - dt);
    if (this._ctT > 0) return;
    this._ctT = 0.5;
    this._called = this._called || new Set();
    const P = this.player, S = this.sentinel;
    const live = !this.downed && !this.kia && !this.tablet.visible && !this.isr.active && !(this.quad && this.quad.active) && !this.ended && !this.cine.active;
    if (!live) return;
    const o = P.eyePos(new THREE.Vector3()), dir = P.aimDir(new THREE.Vector3());
    const half = THREE.MathUtils.degToRad(this.camera.fov * 0.55);
    const range = P.scopeT > 0.5 ? 160 : 70;
    const fresh = [];
    for (const g of S.guards) {
      if (g.state === 'dead' || this._called.has(g.id)) continue;
      const h = new THREE.Vector3(g.x, (g.y || 0) + 1.5, g.z), v = h.clone().sub(o), d = v.length();
      if (d > range || v.normalize().angleTo(dir) > half || !this.fac.los(o, h)) continue;
      fresh.push({ g, d });
    }
    if (!fresh.length) return;
    for (const f of fresh) this._called.add(f.g.id);
    if (this._ctCd > 0) return;
    if (Math.random() < 0.5) return;
    if (!this.radio || !this.radio.free()) return; // busy net: skip it without spending the cooldown
    this._ctCd = 40;
    fresh.sort((a, b) => a.d - b.d);
    const f = fresh[0];
    // Which side of your screen it's on: left, right, or ahead (within ~10 deg of the crosshair).
    const vx = f.g.x - o.x, vz = f.g.z - o.z, fl = Math.hypot(dir.x, dir.z) || 1;
    const fx = dir.x / fl, fz = dir.z / fl;
    const across = vx * -fz + vz * fx, along = vx * fx + vz * fz;
    const side = Math.abs(Math.atan2(across, along)) < 0.17 ? 'ahead' : across > 0 ? 'right' : 'left';
    // Range in bands (close / mid / long), so every callout has a recorded radio line.
    const band = f.d < 30 ? 'close' : f.d < 80 ? 'mid range' : 'long range';
    const what = { scav: 'an officer', jugg: 'a juggernaut', bulwark: 'a bulwark', titan: 'a titan', overseer: 'the Overseer', guard: 'a tango' }[f.g.type] || 'a tango';
    const n = fresh.length;
    const lines = n > 1
      ? [`Multiple contacts ${side}, ${band}.`]
      : [`Contact ${side}, ${band}.`, `Eyes on ${what}, ${side}.`, `Contact ${side}.`];
    this._radio('me', lines[Math.floor(Math.random() * lines.length)], true);
  },
};

export function installKit2(Cls) {
  Object.assign(Cls.prototype, Kit2, WeaponLight);
  Object.defineProperty(Cls.prototype, 'syncReady', Object.getOwnPropertyDescriptor(Kit2, 'syncReady'));
}
void ROOMS;

// ---- Weapon lights (L) ----------------------------------------------------------------
// A white weapon light. It lights your way and makes you far easier to see — but guards who
// catch the spot where it lands walk over to look, so you can paint a wall, send them that
// way, and move. Shine it in someone's face and they know exactly where you are.
export const WeaponLight = {
  _wlInit() {
    this.wl = { on: false };
    const mk = () => {
      const L = new THREE.SpotLight('#eef4ff', 0, 48, 0.3, 0.55, 1.3);
      const t = new THREE.Object3D();
      this.scene.add(L, t);
      L.target = t;
      return L;
    };
    this.wlSpot = mk();
    this.wlPartner = mk();
    // Visible beam for your partner's light.
    this.wlBeam = new THREE.Mesh(new THREE.ConeGeometry(2.2, 16, 14, 1, true).translate(0, -8, 0).rotateX(Math.PI / 2), new THREE.ShaderMaterial({
      vertexShader: 'varying float vD; varying vec3 vN; varying vec3 vV; void main(){ vD = clamp(length(position) / 16.0, 0.0, 1.0); vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'varying float vD; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(abs(dot(normalize(vN), normalize(vV))), 2.0); gl_FragColor = vec4(vec3(0.85, 0.92, 1.0) * (1.0 - vD) * (1.0 - vD) * 0.08 * f, 1.0); }',
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    }));
    this.wlBeam.visible = false;
    this.scene.add(this.wlBeam);
  },
  _wlToggle() {
    this.wl.on = !this.wl.on;
    this.audio.click();
    this.hud.flash(this.wl.on ? 'WEAPON LIGHT ON' : 'WEAPON LIGHT OFF', this.wl.on ? 'amber' : 'dim', 0.7);
  },
  // Source, direction and where the beam lands, for a light at eye `o` looking along `d`.
  _wlCast(o, d) {
    const end = o.clone().addScaledVector(d, 45);
    const h = this.fac.ray(o.clone().addScaledVector(d, 0.5), end, 'sight');
    return { x: o.x, y: o.y, z: o.z, dx: d.x, dy: d.y, dz: d.z, hit: h ? h.point.clone().addScaledVector(d, -0.3) : end };
  },
  _wlTick() {
    const P = this.player;
    const live = !this.downed && !this.kia && !this.isr.active && !(this.quad && this.quad.active) && !this._seat();
    // Yours.
    if (this.wl.on && live) {
      const o = P.eyePos(new THREE.Vector3()), d = P.aimDir(new THREE.Vector3());
      this.wlMine = this._wlCast(o, d);
      // Source just past the muzzle, so the beam lights the world, not your own gun.
      this.wlSpot.position.copy(o).addScaledVector(d, 1.1);
      this.wlSpot.target.position.copy(this.wlMine.hit);
      this.wlSpot.intensity = 40;
    } else { this.wlMine = null; this.wlSpot.intensity = 0; }
    // Your partner's.
    const Q = this.partner;
    if (Q.wl && Q.seen && !Q.downed && !Q.kia && !Q.seated) {
      const eye = Q.st === 2 ? 0.45 : Q.st === 1 ? 1.1 : 1.5;
      const o = new THREE.Vector3(Q.pos.x, Q.pos.y + eye, Q.pos.z);
      const yaw = Q.yaw || 0, pitch = Q.pitch || 0;
      const d = new THREE.Vector3(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
      this.wlTheirs = this._wlCast(o, d);
      this.wlPartner.position.copy(o).addScaledVector(d, 0.5);
      this.wlPartner.target.position.copy(this.wlTheirs.hit);
      this.wlPartner.intensity = 40;
      this.wlBeam.visible = true;
      this.wlBeam.position.copy(this.wlPartner.position);
      this.wlBeam.lookAt(this.wlTheirs.hit);
      this.wlBeam.rotateY(Math.PI);
    } else { this.wlTheirs = null; this.wlPartner.intensity = 0; this.wlBeam.visible = false; }
  },
};

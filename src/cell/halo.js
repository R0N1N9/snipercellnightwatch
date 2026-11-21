// Sniper Cell — the HALO insertion onto the west / east knoll (an alternative to the van).
//   0.0  a four-engine transport droning in high over the valley, ramp down, red light
//   3.4  inside the cabin, looking aft: the light goes green and they run off the ramp
//   5.4  freefall chase, then a POV of the ground rushing up with the altimeter unwinding
//   8.2  canopies crack open; chase under canopy, then a POV with hands on the toggles
//  12.4  wide on the knoll: flare, touch down, run it out, canopies collapse
// Sound: the transport's engines (positional), the wind roar in freefall, the canopy snap and
// flutter, and the landing. Everything here is cut-scene only: gameplay starts on the knoll.
import * as THREE from 'three';
import { terrainHeight, lam } from './facility.js';
import { glove } from './nvg.js';

const ease = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (t) => Math.max(0, Math.min(1, t));

export function buildPlane() {
  const g = new THREE.Group();
  const grey = '#3c4148', dark = '#22262b';
  const mk = (geo, col, x, y, z, rx = 0, ry = 0, rz = 0) => { const m = new THREE.Mesh(geo, lam(col)); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); g.add(m); return m; };
  mk(new THREE.CylinderGeometry(2.3, 2.3, 22, 14).rotateX(Math.PI / 2), grey, 0, 0, 0);
  mk(new THREE.SphereGeometry(2.3, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(-Math.PI / 2), grey, 0, 0, -11);
  mk(new THREE.BoxGeometry(36, 0.5, 4.2), grey, 0, 1.9, -2);
  for (const x of [-12, -6.5, 6.5, 12]) { mk(new THREE.CylinderGeometry(0.75, 0.8, 4, 10).rotateX(Math.PI / 2), dark, x, 1.2, -3.5); mk(new THREE.BoxGeometry(0.2, 3.6, 0.2), '#111', x, 1.2, -5.6); }
  // Tail: the upswept rear fuselage, fin and T-tail.
  mk(new THREE.BoxGeometry(4.2, 2.6, 6), grey, 0, 1.0, 13.5, 0.25);
  mk(new THREE.BoxGeometry(0.4, 7, 5), grey, 0, 5, 15.5, 0.35);
  mk(new THREE.BoxGeometry(13, 0.35, 3), grey, 0, 8.2, 16.8);
  // The ramp, lowered.
  mk(new THREE.BoxGeometry(4, 0.25, 5), dark, 0, -2.6, 13.4, -0.35);
  // Cabin floor (so the operators have something to stand on).
  mk(new THREE.BoxGeometry(3.8, 0.15, 20), '#2b2e33', 0, -1.6, 0);
  // Jump light and nav lights.
  const jl = new THREE.Mesh(new THREE.SphereGeometry(0.25, 10, 8), new THREE.MeshBasicMaterial({ color: '#ff2020' }));
  jl.position.set(1.6, 0.6, 9);
  g.add(jl);
  const glow = new THREE.PointLight('#ff2020', 6, 14, 2);
  glow.position.copy(jl.position);
  g.add(glow);
  for (const [x, c] of [[-18, '#ff2030'], [18, '#20ff60']]) { const n = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), new THREE.MeshBasicMaterial({ color: c })); n.position.set(x, 1.9, -2); g.add(n); }
  g.userData = { jl, glow };
  return g;
}

// A ram-air canopy: seven cells in a shallow arc, with lines down to the jumper.
export function buildCanopy(color = '#2e3a2c') {
  const g = new THREE.Group();
  const cells = new THREE.Group();
  for (let i = 0; i < 7; i++) {
    const a = (i - 3) * 0.13;
    const m = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.42, 2.6), lam(i % 2 ? color : '#35422f'));
    m.position.set(Math.sin(a) * 6, Math.cos(a) * 6 - 6, 0);
    m.rotation.z = -a;
    cells.add(m);
  }
  cells.position.y = 4.6;
  g.add(cells);
  const pts = [];
  for (let i = 0; i < 7; i += 2) for (const z of [-1, 1]) {
    const a = (i - 3) * 0.13;
    pts.push(new THREE.Vector3(Math.sin(a) * 6, 4.6 + Math.cos(a) * 6 - 6.2, z), new THREE.Vector3(Math.sign(i - 3) * 0.25, 1.45, 0));
  }
  const lines = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: '#9a9a90', transparent: true, opacity: 0.6 }));
  g.add(lines);
  g.userData = { cells };
  return g;
}

// Sound for the jump.
export class AirSound {
  constructor(audio) { this.a = audio; this.on = false; }
  start(pos) {
    const A = this.a;
    if (!A || !A.ctx || !A.noise || this.on) return;
    this.on = true;
    const ctx = A.ctx;
    // Engines: four props as two detuned saws and a noise roar, at the plane.
    this.p = A._panner(pos, 60);
    this.eng = ctx.createGain(); this.eng.gain.value = 0;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420;
    this.oscs = [68, 71.5, 136].map((f) => { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.connect(lp); o.start(); return o; });
    const n = ctx.createBufferSource(); n.buffer = A.noise; n.loop = true;
    const nl = ctx.createBiquadFilter(); nl.type = 'lowpass'; nl.frequency.value = 600;
    n.connect(nl).connect(this.eng); n.start(0, Math.random());
    lp.connect(this.eng);
    this.eng.connect(this.p);
    this.srcs = [n];
    // Wind roar (in your ears, not positional).
    this.wind = ctx.createGain(); this.wind.gain.value = 0;
    const w = ctx.createBufferSource(); w.buffer = A.noise; w.loop = true;
    this.windF = ctx.createBiquadFilter(); this.windF.type = 'bandpass'; this.windF.frequency.value = 700; this.windF.Q.value = 0.5;
    w.connect(this.windF).connect(this.wind).connect(A.master); w.start(0, Math.random());
    // Canopy flutter: noise with a fast tremolo.
    this.flut = ctx.createGain(); this.flut.gain.value = 0;
    const f = ctx.createBufferSource(); f.buffer = A.noise; f.loop = true;
    const fb = ctx.createBiquadFilter(); fb.type = 'bandpass'; fb.frequency.value = 320; fb.Q.value = 0.9;
    const trem = ctx.createGain(); trem.gain.value = 0.6;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 9; const lg = ctx.createGain(); lg.gain.value = 0.4;
    lfo.connect(lg).connect(trem.gain); lfo.start();
    f.connect(fb).connect(trem).connect(this.flut).connect(A.master); f.start(0, Math.random());
    this.srcs.push(w, f); this.oscs.push(lfo);
  }
  update(planePos, engine, wind, flutter) {
    if (!this.on) return;
    const now = this.a.ctx.currentTime, P = this.p;
    if (P.positionX) { P.positionX.value = planePos.x; P.positionY.value = planePos.y; P.positionZ.value = planePos.z; } else P.setPosition(planePos.x, planePos.y, planePos.z);
    this.eng.gain.setTargetAtTime(engine, now, 0.3);
    this.wind.gain.setTargetAtTime(wind, now, 0.25);
    this.windF.frequency.setTargetAtTime(500 + wind * 1500, now, 0.3);
    this.flut.gain.setTargetAtTime(flutter, now, 0.3);
  }
  snap() {
    const A = this.a; if (!this.on) return;
    const t = A.now;
    A._thump(A.master, t, 60, 0.7, 0.25);
    A._noiseBurst(A.master, t, 0.25, 'highpass', 900, 0.7, 0.5, 0.15);
    A._noiseBurst(A.master, t + 0.05, 0.4, 'bandpass', 400, 0.8, 0.35, 0.3);
  }
  thud(pos) {
    const A = this.a; if (!this.on) return;
    const p = A._panner(pos, 10), t = A.now;
    A._thump(p, t, 55, 0.6, 0.3);
    A._noiseBurst(p, t, 0.3, 'lowpass', 900, 0.8, 0.35, 0.25);
  }
  stop() {
    if (!this.on) return;
    this.on = false;
    const now = this.a.ctx.currentTime;
    for (const g of [this.eng, this.wind, this.flut]) g.gain.setTargetAtTime(0, now, 0.3);
    setTimeout(() => { try { this.srcs.forEach((s) => s.stop()); this.oscs.forEach((o) => o.stop()); this.p.disconnect(); } catch {} }, 1500);
  }
}

export const Halo = {
  _startAir() {
    const g = this.g, D = g.drop;
    const from = new THREE.Vector3(D.from[0], 0, D.from[1]).normalize();
    this.air = { from, travel: from.clone().negate(), side: new THREE.Vector3(-from.z, 0, from.x) };
    const L0 = g.drop.insert[0];
    const ly = terrainHeight(L0.x, L0.z);
    this.air.L = this.actors.map((A, i) => { const q = g.drop.insert[Math.min(i, g.drop.insert.length - 1)]; return new THREE.Vector3(q.x, terrainHeight(q.x, q.z), q.z); });
    this.air.J = new THREE.Vector3(L0.x, ly + 290, L0.z).addScaledVector(from, 260);
    this.plane = buildPlane();
    g.scene.add(this.plane);
    this.plane.rotation.set(0, Math.atan2(-this.air.travel.x, -this.air.travel.z), 0, 'YXZ');
    this.chutes = this.actors.map((A, i) => { const c = buildCanopy(i ? '#2c3432' : '#2e3a2c'); c.visible = false; g.scene.add(c); return c; });
    this.hands = [glove(), glove()];
    for (const h of this.hands) { h.visible = false; h.traverse((o) => { o.renderOrder = 12; o.frustumCulled = false; }); g.scene.add(h); }
    this.as = new AirSound(g.audio);
    this.alt = this.alt || (() => { const e = document.createElement('div'); e.className = 'cc-alt'; this.el.appendChild(e); return e; })();
    this.alt.textContent = '';
    this._snapped = new Set();
    this._landed = new Set();
  },

  _planeAt(t) {
    const A = this.air;
    return A.J.clone().addScaledVector(A.travel, (t - 4.5) * 55).add(new THREE.Vector3(0, 6, 0));
  },

  // Where an actor is at time t (and how: 'cabin' | 'free' | 'canopy' | 'ground').
  _jumper(i, t) {
    const A = this.air, d = i * 0.45, L = A.L[i];
    const te = 4.3 + d, tf = 8.2 + d, tl = 13.8 + d * 0.6;
    if (t < te) {
      // Standing on the ramp, then running off it.
      const run = clamp01((t - 3.9 - d) / 0.4);
      const local = new THREE.Vector3(i ? -0.9 : 0.9, -1.5, 8 + run * 4.5);
      this.plane.updateMatrixWorld(true);
      return { p: this.plane.localToWorld(local), mode: 'cabin', moving: run > 0 && run < 1 };
    }
    if (t < tf) {
      const u = clamp01((t - te) / (tf - te));
      const E = this._planeAt(te).addScaledVector(A.from, 12).add(new THREE.Vector3(0, -2, 0));
      const Dp = L.clone().addScaledVector(A.from, 150).addScaledVector(A.side, i ? -9 : 9);
      Dp.y = L.y + 120;
      const p = new THREE.Vector3(lerp(E.x, Dp.x, u), lerp(E.y, Dp.y, Math.pow(u, 1.5)), lerp(E.z, Dp.z, u));
      return { p, mode: 'free', u };
    }
    if (t < tl) {
      const u = clamp01((t - tf) / (tl - tf)), e = ease(u);
      const Dp = L.clone().addScaledVector(A.from, 150).addScaledVector(A.side, i ? -9 : 9);
      const p = new THREE.Vector3(lerp(Dp.x, L.x, e), lerp(L.y + 120, L.y, Math.pow(u, 0.9)), lerp(Dp.z, L.z, e));
      p.addScaledVector(A.side, Math.sin(u * Math.PI * 2) * 10 * (1 - u));
      p.y = Math.max(p.y, terrainHeight(p.x, p.z));
      return { p, mode: 'canopy', u };
    }
    const u = clamp01((t - tl) / 1.2);
    const p = L.clone().addScaledVector(A.travel, -ease(u) * 3);
    p.y = terrainHeight(p.x, p.z);
    return { p, mode: 'ground', u, moving: u < 0.9 };
  },

  _updateAir(dt) {
    const g = this.g, t = this.t, cam = this.cam, A = this.air;
    const P = this._planeAt(t);
    this.plane.position.copy(P);
    const green = t > 3.95;
    this.plane.userData.jl.material.color.set(green ? '#20ff40' : '#ff2020');
    this.plane.userData.glow.color.set(green ? '#20ff40' : '#ff2020');
    this.plane.visible = t < 9;
    // Jumpers.
    const J = this.actors.map((Ac, i) => ({ Ac, i, ...this._jumper(i, t) }));
    let anyFree = false, anyCanopy = false;
    for (const j of J) {
      const { Ac, i } = j, av = Ac.av, chute = this.chutes[i];
      const prev = Ac.prevP || j.p.clone();
      const vel = j.p.clone().sub(prev).divideScalar(Math.max(dt, 1e-3));
      Ac.prevP = j.p.clone();
      const head = Math.hypot(vel.x, vel.z) > 0.5 ? Math.atan2(-vel.x, -vel.z) : Math.atan2(-A.travel.x, -A.travel.z);
      Ac.yaw = Ac.yaw === undefined ? head : Ac.yaw + Math.atan2(Math.sin(head - Ac.yaw), Math.cos(head - Ac.yaw)) * Math.min(1, dt * 3);
      av.setVisible(true);
      av.update(dt, { p: j.p, yaw: Ac.yaw, pitch: 0, st: 0, moving: !!j.moving, w: Ac.role === 'spotter' });
      if (j.mode === 'free') {
        anyFree = true;
        // Belly to earth, arched; a little tumble right off the ramp.
        const k = clamp01((t - (4.3 + i * 0.45)) / 0.6);
        av.root.rotation.x = -1.45 * k;
        av.root.rotation.z = Math.sin(t * 2 + i) * 0.08 * k;
        av.root.position.y += 0.9 * k;
      } else { av.root.rotation.x = j.mode === 'canopy' ? -0.08 : 0; av.root.rotation.z = j.mode === 'canopy' ? Math.sin(j.u * Math.PI * 2) * -0.2 : 0; }
      // Canopy: snaps open at the deploy point, flies overhead, collapses behind on landing.
      if (j.mode === 'canopy' || (j.mode === 'ground' && j.u < 1)) {
        chute.visible = true;
        chute.position.copy(j.p);
        chute.rotation.set(0, Ac.yaw, 0, 'YXZ');
        const open = j.mode === 'canopy' ? ease(clamp01(j.u * 12)) : 1;
        const fold = j.mode === 'ground' ? ease(j.u) : 0;
        chute.userData.cells.scale.set(0.2 + 0.8 * open, 1 - 0.7 * fold, 0.4 + 0.6 * open);
        chute.rotation.x = fold * 1.2;
        chute.position.addScaledVector(A.travel, -fold * 2.5);
        if (j.mode === 'canopy') anyCanopy = true;
        if (!this._snapped.has(i)) { this._snapped.add(i); this.as.snap(); }
      } else chute.visible = false;
      if (j.mode === 'ground' && !this._landed.has(i)) { this._landed.add(i); this.as.thud(j.p); }
    }
    // Sound.
    if (!this.as.on) this.as.start(P);
    const near = cam.position.distanceTo(P);
    this.as.update(P, Math.min(0.9, 60 / Math.max(20, near)) * (t < 9 ? 1 : 0), anyFree && t > 4.6 ? 0.55 : t > 3.4 && t < 4.6 ? 0.2 : 0, anyCanopy ? 0.12 : 0);
    // Camera.
    const S = J[0], Sp = J[J.length - 1];
    this.hands.forEach((h) => (h.visible = false));
    if (t < 3.4) {
      // Wide: the transport droning in, ramp down, red light on.
      const c = A.J.clone().addScaledVector(A.side, 38).addScaledVector(A.travel, -95 + t * 22);
      c.y = A.J.y - 5;
      cam.position.copy(c);
      cam.lookAt(P.x, P.y, P.z);
      cam.fov = 34;
    } else if (t < 5.4) {
      // In the cabin, looking aft down the ramp at the night.
      this.plane.updateMatrixWorld(true);
      cam.position.copy(this.plane.localToWorld(new THREE.Vector3(0.2, 0.3, 1.5)));
      cam.lookAt(this.plane.localToWorld(new THREE.Vector3(0, -1.8, 16)));
      cam.fov = 62;
    } else if (t < 7.0) {
      // Freefall chase.
      // Freefall chase from just below and beside them, so they're silhouetted on the stars.
      cam.position.copy(S.p).add(new THREE.Vector3(0, -3, 0)).addScaledVector(A.side, 8.5).addScaledVector(A.travel, 2.5);
      const mid = J.reduce((m, j) => m.add(j.p), new THREE.Vector3()).divideScalar(J.length);
      cam.lookAt(mid.x, mid.y + 0.6, mid.z);
      cam.fov = 60;
    } else if (t < 8.2) {
      // POV: ground rushing up, the knoll ahead.
      cam.position.copy(S.p).addScaledVector(A.travel, 1.4).add(new THREE.Vector3(0, 0.2, 0));
      const L = A.L[0];
      cam.lookAt(lerp(cam.position.x, L.x, 0.6), L.y, lerp(cam.position.z, L.z, 0.6));
      cam.rotateZ(Math.sin(t * 7) * 0.02);
      cam.fov = 75;
    } else if (t < 10.6) {
      // Canopy chase behind the spotter.
      const hd = new THREE.Vector3(-Math.sin(Sp.Ac.yaw), 0, -Math.cos(Sp.Ac.yaw));
      cam.position.copy(Sp.p).addScaledVector(hd, -10).add(new THREE.Vector3(0, 4, 0)).addScaledVector(A.side, 3);
      cam.lookAt(Sp.p.x + hd.x * 20, Sp.p.y - 5, Sp.p.z + hd.z * 20);
      cam.fov = 55;
    } else if (t < 12.4) {
      // POV under canopy: hands on the toggles, lines up to the wing, the knoll coming in.
      const hd = new THREE.Vector3(-Math.sin(Sp.Ac.yaw), 0, -Math.cos(Sp.Ac.yaw));
      cam.position.copy(Sp.p).add(new THREE.Vector3(0, 1.6, 0)).addScaledVector(hd, 0.2);
      const L = A.L[Sp.i];
      cam.lookAt(lerp(cam.position.x + hd.x * 40, L.x, 0.4), cam.position.y - 14, lerp(cam.position.z + hd.z * 40, L.z, 0.4));
      cam.rotateX(0.32);
      cam.fov = 72;
      cam.updateMatrixWorld(true);
      this.hands.forEach((h, k) => {
        h.visible = true;
        h.position.copy(cam.localToWorld(new THREE.Vector3(k ? 0.32 : -0.32, 0.16 + Math.sin(t * 2 + k) * 0.02, -0.7)));
        h.quaternion.copy(cam.quaternion);
        h.rotateX(0.5);
        h.scale.setScalar(0.85);
      });
    } else {
      // On the knoll: they flare in and land.
      const L = A.L[0];
      cam.position.copy(L).addScaledVector(A.travel, 14).addScaledVector(A.side, 6);
      cam.position.y = terrainHeight(cam.position.x, cam.position.z) + 1.7;
      const mid = J.reduce((m, j) => m.add(j.p), new THREE.Vector3()).divideScalar(J.length);
      cam.lookAt(mid.x, mid.y + 1.6, mid.z);
      cam.fov = 48;
    }
    // POV shots: you don't see your own body from inside it.
    if (t > 7 && t < 8.2) S.Ac.av.setVisible(false);
    if (t > 10.6 && t < 12.4) Sp.Ac.av.setVisible(false);
    cam.aspect = innerWidth / innerHeight;
    cam.updateProjectionMatrix();
    // Altimeter in the POV shots.
    if ((t > 7 && t < 8.2) || (t > 10.6 && t < 12.4)) {
      const who = t < 8.2 ? S : Sp, agl = Math.max(0, who.p.y - A.L[who.i].y);
      this.alt.textContent = `ALT ${Math.round(agl * 3.28).toLocaleString()} FT AGL`;
      this.alt.classList.add('on');
    } else this.alt.classList.remove('on');
    // Radio.
    const two = this.actors.length === 2, nm = (r) => g._nameFor(r);
    const lines = two
      ? [[3.6, 'OVERWATCH: Green light. Jump.'], [8.6, `${nm('shooter')}: Canopy good.`], [9.5, `${nm('spotter')}: Canopy good.`], [14.6, `${nm('spotter')}: On the ground.`]]
      : [[3.6, 'OVERWATCH: Green light. Jump.'], [8.6, 'Canopy good.'], [14.6, 'On the ground.']];
    let line = '';
    for (const [at, l] of lines) if (t >= at && t < at + 2.2) line = l;
    this._say(line);
    for (const [at, l] of lines) if (t >= at && !this._voiced.has(at)) {
      this._voiced.add(at);
      const m = /^([^:]+):\s*(.*)$/.exec(l);
      const who = !m ? g.role : m[1] === 'OVERWATCH' ? 'isr' : m[1] === nm('spotter') ? 'spotter' : 'shooter';
      g._voice(who, m ? m[2] : l);
    }
    if (t > 1.2 && !this._titled) { this._titled = true; this.title.innerHTML = `<b>${g.titleHTML}</b><span>${g.missionLine}</span>`; this.title.classList.add('on'); }
    if (t > 3.3) this.title.classList.remove('on');
    this._fadeTo(t < 1.2 ? 1 - t / 1.2 : t > 15.4 ? (t - 15.4) / 0.8 : 0);
    if (t > 16.2) this._endIntro();
  },

  _endAir() {
    const g = this.g;
    if (this.plane) g.scene.remove(this.plane);
    for (const c of this.chutes || []) g.scene.remove(c);
    for (const h of this.hands || []) g.scene.remove(h);
    if (this.as) this.as.stop();
    if (this.alt) this.alt.classList.remove('on');
    this.plane = null; this.chutes = []; this.hands = [];
    this.air = null;
  },
};

export function installHalo(Cls) {
  for (const k of Object.keys(Halo)) Cls.prototype[k] = Halo[k];
}

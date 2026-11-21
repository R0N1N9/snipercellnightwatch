// Sniper Cell — the recon quad's NEUROLINK. While the quad is up (flying or parked), any
// enemy it can see within range is marked for the whole team: a diamond on the HUD and a
// red silhouette through walls, held for as long as the quad keeps line of sight (plus a
// short grace). Each new link plays a quick lock-on: brackets snapping in over the target
// and a pulse out from the quad. Rotor noise carries: guards within ~10 m hear it.
import * as THREE from 'three';

export const NEURO = { range: 45, every: 0.25, hold: 1.2, noise: 10, cone: 0.62 };
// The spotter's own eyes: range (×1.6 scoped) and how often the crosshair re-tags one enemy.
export const EYES = { range: 40, retag: 10 };

export const Neuro = {
  _neuroInit() {
    this.neuroFx = [];
    this.neuroSet = new Set();
    this._neuroT = 0;
    this.neuroCount = 0;
    this.quadNoisy = false;
  },

  // Every client runs its own quad's link; marks are applied on the host.
  _neuroTick(dt) {
    for (const f of this.neuroFx) f.t += dt;
    this.neuroFx = this.neuroFx.filter((f) => f.t < 1.1);
    if (this.neuroPulse) { this.neuroPulse.t += dt; if (this.neuroPulse.t > 0.9) this.neuroPulse = null; }
    if (!this._quadOut() || this.quad.launching || this.quad.recall) { this.neuroSet.clear(); this.neuroCount = 0; this.quadNoisy = false; return; }
    this._neuroT -= dt;
    if (this._neuroT > 0) return;
    this._neuroT = NEURO.every;
    const q = this.quad, S = this.sentinel, eye = { x: q.x, y: q.y, z: q.z };
    const seen = [];
    let noisy = false;
    for (const e of [...S.guards, ...S.drones]) {
      if (e.state === 'dead') continue;
      const d = Math.hypot(e.x - q.x, e.z - q.z, (e.y || 0) - q.y);
      if (e.kind === 'g' && d < NEURO.noise) noisy = true;
      if (d > NEURO.range) continue;
      // Only what's inside its (red) view cone.
      const fx = -Math.sin(q.yaw) * Math.cos(q.pitch ?? -0.35), fy = Math.sin(q.pitch ?? -0.35), fz = -Math.cos(q.yaw) * Math.cos(q.pitch ?? -0.35);
      const vx = e.x - q.x, vy = (e.y || 0) + (e.kind === 'd' ? 0 : 1.3) - q.y, vz = e.z - q.z, vl = Math.hypot(vx, vy, vz) || 1;
      if ((fx * vx + fy * vy + fz * vz) / vl < Math.cos(NEURO.cone)) continue;
      if (!this.fac.los(eye, { x: e.x, y: (e.y || 0) + (e.kind === 'd' ? 0 : 1.3), z: e.z })) continue;
      seen.push(e.id);
    }
    this.quadNoisy = noisy;
    this.neuroCount = seen.length;
    let fresh = 0;
    for (const id of seen) if (!this.neuroSet.has(id)) { this.neuroFx.push({ id, t: 0 }); fresh++; }
    this.neuroSet = new Set(seen);
    if (fresh) {
      this.neuroPulse = { t: 0 };
      this.sfx.ui(true);
    }
    if (!seen.length) return;
    if (this.isHost) this._neuroMark(seen);
    else this.send({ t: 'ab', k: 'qmark', target: { ids: seen } });
  },

  // The spotter's own eyes work like the quad's link: any enemy in your field of view, in the
  // clear and within EYES.range, stays marked for the team while you can see it. Putting your
  // crosshair on one tags it outright (with a ping), once per EYES.retag seconds each.
  _eyesTick(dt) {
    this._eyesT = (this._eyesT || 0) - dt;
    const live = (this.role === 'spotter' || this.operative) && !this.downed && !this.kia && !this.isr.active && !(this.quad && this.quad.active) && !this.tablet.visible && !(this.cine && this.cine.active);
    this.eyesSet = this.eyesSet || new Set();
    if (!live) { this.eyesSet.clear(); return; }
    // Crosshair: an instant tag and a ping.
    this._autoTag = this._autoTag || new Map();
    const x = this._crosshairEnemy && this._crosshairEnemy();
    if (x && this.t - (this._autoTag.get(x.id) ?? -99) > EYES.retag) {
      this._autoTag.set(x.id, this.t);
      this.payload('tag', { id: x.id, by: this.role, auto: true });
      if (this.isHost) x.tagT = Math.max(x.tagT || 0, 12);
      this.audio.ping && this.audio.ping();
      this.neuroFx.push({ id: x.id, t: 0, eyes: true });
    }
    if (this._eyesT > 0) return;
    this._eyesT = NEURO.every;
    const S = this.sentinel, cam = this.camera;
    const o = cam.position, dir = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    const half = THREE.MathUtils.degToRad(cam.fov / 2) * 1.15, halfW = Math.atan(Math.tan(half) * cam.aspect);
    const range = EYES.range * (this.player.scoped ? 1.6 : 1);
    const seen = [];
    const v = new THREE.Vector3();
    for (const e of [...S.guards, ...S.drones]) {
      if (e.state === 'dead' || e.hp <= 0) continue;
      v.set(e.x, (e.y || 0) + (e.kind === 'd' ? 0 : 1.3), e.z).sub(o);
      const d = v.length();
      if (d > range) continue;
      v.normalize();
      if (v.angleTo(dir) > Math.max(half, halfW)) continue;
      if (!this.fac.los(o, { x: e.x, y: (e.y || 0) + (e.kind === 'd' ? 0 : 1.3), z: e.z })) continue;
      seen.push(e.id);
    }
    for (const id of seen) if (!this.eyesSet.has(id)) this.neuroFx.push({ id, t: 0, eyes: true });
    this.eyesSet = new Set(seen);
    if (!seen.length) return;
    if (this.isHost) this._neuroMark(seen, true);
    else this.send({ t: 'ab', k: 'qmark', target: { ids: seen, auto: true } });
  },

  // auto: a sight mark (the spotter's eyes): it shows them, but isn't a call to shoot.
  _neuroMark(ids, auto = false) {
    const S = this.sentinel;
    for (const id of ids) {
      const e = S.byId(id);
      if (!e || e.state === 'dead') continue;
      if (auto && !(e.tagT > 0 && !e.autoTag)) e.autoTag = true;
      e.tagT = Math.max(e.tagT || 0, NEURO.hold);
    }
  },

  // HUD: lock-on brackets for fresh links; in the quad view, the link status and a noise warning.
  _neuroHud(c, proj, W, H) {
    const S = this.sentinel;
    for (const f of this.neuroFx) {
      const e = S.byId(f.id);
      if (!e) continue;
      const p = proj(e.x, (e.y || 0) + (e.kind === 'd' ? 0 : 1.1), e.z);
      if (p.behind) continue;
      const k = Math.min(1, f.t / 0.45), size = 70 - 52 * (1 - Math.pow(1 - k, 3)), a = f.t < 0.6 ? 1 : 1 - (f.t - 0.6) / 0.5;
      c.save();
      c.translate(p.x, p.y);
      c.rotate((1 - k) * 1.2);
      c.strokeStyle = `rgba(255,60,80,${a.toFixed(3)})`;
      c.lineWidth = 2;
      const s = size / 2, L = size * 0.28;
      for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { c.beginPath(); c.moveTo(sx * s, sy * (s - L)); c.lineTo(sx * s, sy * s); c.lineTo(sx * (s - L), sy * s); c.stroke(); }
      c.restore();
      if (f.t > 0.35) {
        c.fillStyle = `rgba(255,90,110,${a.toFixed(3)})`;
        c.font = '600 11px JetBrains Mono, monospace';
        c.textAlign = 'center';
        c.fillText(f.eyes ? 'MARKED' : 'NEUROLINK', p.x, p.y - size / 2 - 6);
      }
    }
    if (!(this.quad && this.quad.active)) return;
    // Pulse out from the centre when something new links.
    if (this.neuroPulse) {
      const t = this.neuroPulse.t;
      c.strokeStyle = `rgba(255,70,90,${(0.6 * (1 - t / 0.9)).toFixed(3)})`;
      c.lineWidth = 3;
      c.beginPath(); c.arc(W / 2, H / 2, 30 + t * Math.max(W, H) * 0.6, 0, Math.PI * 2); c.stroke();
    }
    c.textAlign = 'center';
    c.font = '600 13px JetBrains Mono, monospace';
    c.fillStyle = 'rgba(255,110,130,0.95)';
    c.fillText(`NEUROLINK · ${this.neuroCount} LINKED · ${NEURO.range} m`, W / 2, H - 92);
    if (this.quadNoisy) {
      c.fillStyle = (this.t * 3) % 1 < 0.5 ? 'rgba(255,200,60,0.95)' : 'rgba(255,200,60,0.5)';
      c.fillText('ROTOR NOISE — TOO CLOSE, THEY CAN HEAR YOU', W / 2, H - 112);
    }
    c.lineWidth = 1;
  },
};

export function installNeuro(Cls) {
  for (const k of Object.keys(Neuro)) Cls.prototype[k] = Neuro[k];
}
void THREE;

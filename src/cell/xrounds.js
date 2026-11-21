// Sniper Cell — the shooter's EXPLOSIVE ROUNDS (Z / EXPL). Ra swaps the KR-50's magazine for a
// marked one (a full reload animation); each of its rounds sticks where it hits, blinks for a
// second and blows. Built for the heavies: the charge on a juggernaut or titan kills it outright,
// and anything within a few metres is caught in the blast. It's loud: the whole area hears it.
// Z again swaps back to standard ammo (the explosive rounds left go back in the pouch).
import * as THREE from 'three';

export const XR = { mag: 4, start: 4, max: 8, fuse: 1.0, radius: 5.5, direct: 950, splash: 420, noise: 48, swap: 2.6 };

export const XRounds = {
  _xrInit() {
    this.xr = { rounds: this.role === 'shooter' || this.operative ? XR.start : 0, swap: null };
    this.xcharges = [];
    this._xcId = 1;
  },

  // Z: load the explosive magazine, or swap back to standard rounds.
  _xrSwap() {
    const P = this.player, X = this.xr;
    if (!X || X.swap || this.downed) return;
    const rifle = P.arms.find((w) => w.def.slot === 'rifle');
    if (!rifle) return;
    if (P.w !== rifle) { P.switchTo(P.arms.indexOf(rifle)); this.hud.flash('KR-50 UP — Z AGAIN TO LOAD', 'dim', 0.9); return; }
    if (P.reloadT > 0 || P.switchT > 0 || P.sprinting) return;
    const w = rifle;
    if (w.xr) {
      // Back to standard: the explosive rounds left go back in the pouch.
      X.rounds = Math.min(XR.max, X.rounds + w.mag + w.chamber);
      w.mag = 0; w.chamber = 0; w.xr = false;
      X.swap = { to: false };
      P.reloadEmpty = true; P.reloadDur = XR.swap; P.reloadT = XR.swap; P.cycleT = 0; P.boltPending = false;
      this.hud.flash('SWAPPING TO STANDARD', 'dim', 1);
    } else {
      if (X.rounds <= 0) { this.hud.flash('NO EXPLOSIVE ROUNDS', 'red'); return; }
      // Standard rounds back in the pouch; the marked magazine goes in.
      w.reserve += w.mag + w.chamber;
      const n = Math.min(XR.mag, X.rounds);
      X.rounds -= n;
      // Hold the standard rounds aside so the reload doesn't top the marked mag up with them.
      w.mag = n; w.chamber = 0;
      X.swap = { to: true, n, reserve: w.reserve };
      w.reserve = 0;
      P.reloadEmpty = true; P.reloadDur = XR.swap; P.reloadT = XR.swap; P.cycleT = 0; P.boltPending = false;
      this.hud.flash('LOADING EXPLOSIVE ROUNDS', 'amber', 1.2);
    }
    this.audio.click();
    this.sfx.ui(true);
  },

  // Every frame (all clients): swap completion, charges ticking and blowing.
  _xrTick(dt) {
    const X = this.xr;
    if (X && X.swap && this.player.reloadT <= 0) {
      const w = this.player.arms.find((q) => q.def.slot === 'rifle');
      if (X.swap.to && w) {
        w.reserve += X.swap.reserve || 0;
        if (w.chamber === 0 && w.mag > 0) { w.mag--; w.chamber = 1; }
        w.xr = true;
        this.hud.flash('EXPLOSIVE ROUNDS LOADED', 'amber', 1);
      }
      else if (w && !X.swap.to && w.mag === 0 && w.chamber === 0) {
        // The reload was cut short (sprint): load standard from the pouch now.
        const take = Math.min(w.def.mag, w.reserve); w.mag = take; w.reserve -= take;
        if (w.mag > 0) { w.mag--; w.chamber = 1; }
      }
      X.swap = null;
    }
    const S = this.sentinel;
    for (const c of this.xcharges) {
      c.t -= dt;
      if (c.id) {
        const e = S.byId(c.id);
        if (e) { c.x = e.x + c.ox; c.y = (e.y || 0) + c.oy; c.z = e.z + c.oz; }
      }
      if (!c.obj) {
        const g = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), new THREE.MeshBasicMaterial({ color: '#ff3020' }));
        g.renderOrder = 5;
        this.scene.add(g);
        c.obj = g;
      }
      c.obj.position.set(c.x, c.y, c.z);
      const on = (this.t * (c.t < 0.4 ? 14 : 6)) % 1 < 0.5;
      if (on && !c.on) this.audio.beep(c.obj.position, c.t < 0.4);
      c.on = on;
      c.obj.visible = on;
      if (c.t <= 0) this._xrBoom(c);
    }
    this.xcharges = this.xcharges.filter((c) => c.t > 0);
  },

  // A shot from the explosive mag landed: stick a charge there (and tell the other side).
  _xrStick(hitP, enemy) {
    const c = { cid: this._xcId++ + (this.isHost ? 0 : 5000), x: hitP.x, y: hitP.y, z: hitP.z, t: XR.fuse, by: this.role };
    if (enemy) { c.id = enemy.id; c.ox = hitP.x - enemy.x; c.oy = hitP.y - (enemy.y || 0); c.oz = hitP.z - enemy.z; }
    this.xcharges.push(c);
    this._broadcast({ k: 'xc', c: { cid: c.cid, x: c.x, y: c.y, z: c.z, id: c.id || 0, ox: c.ox || 0, oy: c.oy || 0, oz: c.oz || 0, by: c.by } });
  },
  _xrRemote(c) {
    this.xcharges.push({ ...c, id: c.id || null, t: XR.fuse });
  },

  _xrBoom(c) {
    if (c.obj) { this.scene.remove(c.obj); c.obj.geometry.dispose(); }
    const p = new THREE.Vector3(c.x, c.y, c.z);
    this._boom({ x: c.x, y: c.y - 1, z: c.z });
    this.effects.puff(p, 'metal', 2.5, 0.6);
    // Close to you: a shove of static and a little damage.
    const me = this.player.pos.distanceTo(p);
    if (me < 4 && !this.downed && !this.kia) this._damage(Math.round(35 * (1 - me / 4)), { x: p.x, z: p.z });
    if (!this.isHost) return;
    const S = this.sentinel;
    for (const e of [...S.guards, ...S.drones]) {
      if (e.state === 'dead' && !e.incap) continue;
      const d = Math.hypot(e.x - c.x, (e.y || 0) + (e.kind === 'g' ? 1 : 0) - c.y, e.z - c.z);
      const stuck = e.id === c.id;
      if (!stuck && d > XR.radius) continue;
      const dmg = stuck ? XR.direct : Math.round(XR.splash * (1 - d / XR.radius));
      if (dmg <= 0) continue;
      this._applyHit(e.id, dmg, 'explosive', { x: c.x, z: c.z }, c.by || 'shooter', false, 0);
    }
    S.noise({ x: c.x, y: c.y, z: c.z }, XR.noise, true);
  },

  // Supply crates top the pouch back up with one marked magazine.
  _xrResupply() {
    if (this.xr && (this.role === 'shooter' || this.operative)) this.xr.rounds = Math.min(XR.max, this.xr.rounds + XR.mag);
  },
};

export function installXRounds(Cls) {
  for (const k of Object.keys(XRounds)) Cls.prototype[k] = XRounds[k];
}

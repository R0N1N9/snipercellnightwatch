import * as THREE from 'three';
import { PLAYER, WEAPON, MAP, VEST } from './config.js';
import { clamp, lerp, noise2 } from './util.js';
import { zeroAngle } from './ballistics.js';
import { WEAPONS, SUPPRESSOR_FACTOR, SCOPE40 } from './weapons.js';
import { RULES } from './rules.js';

const HEIGHTS = [1.8, 1.25, 0.55];
const EYES = [PLAYER.eyeStand, PLAYER.eyeCrouch, PLAYER.eyeProne];
const SWAY = [2.6, 1.6, 0.7]; // milliradians amplitude by stance

export class LocalPlayer {
  constructor() {
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.stance = 0;
    this.eye = PLAYER.eyeStand;
    this.onGround = true;
    this.rifleKey = 'mk22';
    this.reset(new THREE.Vector3(), 0);
  }

  // ---- Weapons ---------------------------------------------------------------
  // Each weapon: rounds in the magazine, one in the chamber, spare rounds.
  equip(rifleKey = this.rifleKey) {
    this.rifleKey = WEAPONS[rifleKey] && WEAPONS[rifleKey].slot === 'rifle' ? rifleKey : 'mk22';
    const mk = (key) => {
      const d = WEAPONS[key];
      const z = d.zooms.indexOf(12);
      return { def: d, mag: d.mag, chamber: 1, reserve: d.mag * this._spare(d), zoomIdx: z >= 0 ? z : d.zooms.length - 1, zero: d.fixedZero || 400 };
    };
    this.arms = [mk(this.rifleKey), mk('m18')];
    this.slot = 0;
    this.pendingSlot = -1;
    this.switchT = 0;
    this.cycleT = 0;
    this.reloadT = 0;
    this.reloadDur = 1;
    this.reloadEmpty = false;
    this.boltPending = false;
    this.bipodState = 'stowed';
    this.bipodT = 0;
    this.bipodU = 0;
    this.autoCycle = true; // drop out of the scope to work the bolt once you let go of fire
    this.autoBipod = true; // set the bipod by itself once you've been prone and still a moment
  }

  get w() {
    return this.arms[this.slot];
  }
  get def() {
    return this.w.def;
  }
  get ammo() {
    return this.w.mag + this.w.chamber;
  }
  get reserve() {
    return this.w.reserve;
  }
  get zoomIdx() {
    return this.w.zoomIdx;
  }
  set zoomIdx(v) {
    this.w.zoomIdx = v;
  }
  get zero() {
    return this.w.zero;
  }
  set zero(v) {
    if (!this.def.fixedZero) this.w.zero = v;
  }
  // Bolt throw in progress (bolt guns only).
  get boltT() {
    return this.def.kind === 'bolt' ? this.cycleT : 0;
  }
  get switching() {
    return this.switchT > 0;
  }
  // Muzzle velocity of the weapon in hand (suppressor only fits the rifle).
  get muzzle() {
    const d = this.def;
    return Math.round((d.slot === 'rifle' && this.suppressed ? d.muzzle * SUPPRESSOR_FACTOR : d.muzzle) * RULES.speed);
  }

  // Zoom steps: the sniping style can override them (e.g. Halo's 5× / 10×).
  get zooms() {
    if (this.def.key === 'mk22' && this.scope40) return SCOPE40.zooms;
    return this.def.scope && RULES.zooms ? RULES.zooms : this.def.zooms;
  }

  // Prone and still: the bipod is down and the scope doesn't move at all.
  // Bipod: legs swing down over ~0.45 s once you're prone and still with the rifle.
  // `bipodT` is the deploy progress (0 stowed, 1 planted); sway fades out with it.
  get bipod() {
    return this.bipodState === 'deployed';
  }

  // Manual bipod (Battlefield-style): prone + stopped, then deploy by hand (X).
  //   bipodState: 'stowed' | 'deploying' | 'deployed' | 'stowing'
  //   bipodU:     progress of the current hand animation (0..1)
  //   bipodT:     how far the legs are out (0 folded .. 1 planted) — drives sway and visuals
  // Moving, standing, switching or reloading folds the legs back up.
  get canBipod() {
    return this.stance === 2 && !this.moving && this.def.slot === 'rifle' && this.switchT <= 0 && this.reloadT <= 0 && this.alive;
  }

  get bipodBusy() {
    return this.bipodState === 'deploying' || this.bipodState === 'stowing';
  }

  toggleBipod() {
    const s = this.bipodState || 'stowed';
    if (s === 'stowed') {
      if (!this.canBipod) return 'blocked';
      this.bipodState = 'deploying';
      this.bipodU = 0;
      this.bipodEvent = 'reach';
      return 'deploying';
    }
    if (s === 'deployed') {
      this._bipodHold = true; // folded by hand: don't auto-set again until you move or get up
      this.bipodState = 'stowing';
      this.bipodU = 0;
      this.bipodEvent = 'reach';
      return 'stowing';
    }
    return s;
  }

  _updateBipod(dt) {
    const s = this.bipodState || 'stowed';
    const keepOut = this.stance === 2 && !this.moving && this.def.slot === 'rifle' && this.switchT <= 0 && this.alive;
    if ((s === 'deployed' || s === 'deploying') && !keepOut) {
      // Moving or getting up folds the legs (quick, no hand needed).
      this.bipodState = 'stowing';
      this.bipodU = 1 - (this.bipodT || 0);
      this.bipodEvent = 'stow';
    }
    if (!keepOut) {
      this._bipodHold = false;
      this._stillT = 0;
    }
    // Auto-set: prone and still for half a second, hand still does the full animation.
    if (this.bipodState === 'stowed' && this.autoBipod && !this._bipodHold && this.canBipod && !this.boltPending && this.cycleT <= 0) {
      this._stillT = (this._stillT || 0) + dt;
      if (this._stillT >= 0.5) {
        this._stillT = 0;
        this.toggleBipod();
      }
    } else if (this.bipodState !== 'stowed') this._stillT = 0;
    const st = this.bipodState || 'stowed';
    if (st === 'deploying') {
      this.bipodU = Math.min(1, (this.bipodU || 0) + dt / 0.9);
      // Hand reaches forward (0–0.3), flicks the legs down (0.3–0.7), returns (0.7–1).
      this.bipodT = clamp((this.bipodU - 0.3) / 0.4, 0, 1);
      if (this.bipodU >= 1) {
        this.bipodState = 'deployed';
        this.bipodT = 1;
        this.bipodEvent = 'deploy';
      } else if (this.bipodU > 0.3 && !this._flicked) {
        this._flicked = true;
        this.bipodEvent = 'flick';
      }
    } else if (st === 'stowing') {
      this.bipodU = Math.min(1, (this.bipodU || 0) + dt / 0.55);
      this.bipodT = 1 - clamp(this.bipodU / 0.75, 0, 1);
      if (this.bipodU >= 1) {
        this.bipodState = 'stowed';
        this.bipodT = 0;
      }
    } else {
      this._flicked = false;
      this.bipodU = 0;
    }
    if (this.bipodState === 'stowed') this._flicked = false;
  }

  // Spare magazines for a weapon: the chest rig carries extra.
  _spare(d) {
    return d.spareMags + (this.vest === 'rig' ? VEST.rigExtraMags[d.slot] || 0 : 0);
  }

  refill() {
    for (const w of this.arms) {
      w.mag = w.def.mag;
      w.chamber = 1;
      w.reserve = w.def.mag * this._spare(w.def);
    }
  }

  startReload() {
    const w = this.w;
    if ((this.sprinting && !this.keepReload) || this.reloadT > 0 || this.switchT > 0 || w.reserve <= 0 || w.mag >= w.def.mag) return false;
    this.reloadEmpty = w.chamber === 0;
    this.reloadDur = this.reloadEmpty ? w.def.reloadEmpty : w.def.reload;
    this.reloadT = this.reloadDur;
    this.cycleT = 0;
    this.boltPending = false;
    return true;
  }

  switchTo(slot) {
    if (slot === this.slot || this.switchT > 0 || !this.alive) return;
    this.pendingSlot = slot;
    this.switchT = 0.7;
    this.reloadT = 0;
    this.cycleT = 0;
    this.boltPending = false;
  }

  reset(spawn, yaw) {
    this.pos.copy(spawn);
    this.vel.set(0, 0, 0);
    this.yaw = yaw;
    this.pitch = -0.04;
    this.stance = 0;
    this.eye = PLAYER.eyeStand;
    this.hp = PLAYER.hp;
    this.alive = true;
    this.scoped = false;
    this.scopeT = 0;
    this.equip();
    this.rangeT = 0;
    this.range = null;
    this.rangeShow = 0;
    this.breath = 1; // 1 = full
    this.holding = false;
    this.breathLock = 0;
    this.recoil = 0;
    this.swayT = Math.random() * 100;
    this.moving = false;
    this.speed = 0;
    this.wounded = false;
    this.bob = 0;
  }

  get zoom() {
    return this.zooms[Math.min(this.zoomIdx, this.zooms.length - 1)];
  }

  fov() {
    const base = WEAPON.baseFov;
    if (!this.def.scope) return lerp(base, this.def.adsFov, this.scopeT);
    const z = this.zoom;
    const scoped = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(base / 2)) / z));
    return lerp(base, scoped, this.scopeT);
  }

  eyePos(out = new THREE.Vector3()) {
    return out.set(this.pos.x, this.pos.y + this.eye + this.bob, this.pos.z);
  }

  // Sway offset in radians (yaw, pitch).
  sway(out = { x: 0, y: 0 }) {
    let amp = SWAY[this.stance] * 0.001 * this.def.sway * RULES.sway * (this.def.key === 'mk22' && this.scope40 ? SCOPE40.sway : 1);
    amp *= 1 - (this.bipodT || 0);
    if (this.moving) amp *= 2.4;
    if (this.wounded) amp *= 1.6;
    if (this.holding) amp *= 0.12;
    else if (this.breathLock > 0) amp *= 2.0;
    amp *= this.scopeT;
    const t = this.swayT;
    out.x = (noise2(t * 0.55, 3.3) * 1.0 + Math.sin(t * 0.9) * 0.45) * amp;
    out.y = (noise2(t * 0.6, 9.1) * 0.8 + Math.sin(t * 1.3 + 1) * 0.35) * amp - this.recoil;
    return out;
  }

  aimDir(out = new THREE.Vector3()) {
    const s = this.sway();
    const yaw = this.yaw + s.x, pitch = this.pitch - s.y;
    return out.set(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
  }

  // Direction the bullet leaves the barrel: aim + zero elevation.
  muzzleDir(out = new THREE.Vector3()) {
    const s = this.sway();
    const yaw = this.yaw + s.x, pitch = this.pitch - s.y + zeroAngle(this.zero, this.muzzle);
    return out.set(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
  }

  canFire() {
    return this.alive && !this.sprinting && !this.bipodBusy && !this.boltPending && this.cycleT <= 0 && this.reloadT <= 0 && this.switchT <= 0 && this.w.chamber > 0;
  }

  update(dt, a, world, opts) {
    const { canMove } = opts;
    this.swayT += dt;
    // --- Look
    const fovScale = this.fov() / WEAPON.baseFov;
    const sens = 0.0022 * (0.35 + 0.65 * fovScale);
    this.yaw -= a.lookX * sens;
    this.pitch -= a.lookY * sens;
    this.pitch = clamp(this.pitch, -1.45, 1.45);

    // --- Stance
    if (a.crouch) this.stance = this.stance === 1 ? 0 : 1;
    if (a.prone) this.stance = this.stance === 2 ? 0 : 2;
    if (a.jump && this.stance > 0) {
      this.stance = 0;
      a.jump = false;
    }

    // --- Scope
    const cyclingBolt = this.def.kind === 'bolt' && this.cycleT > 0 && !this.straightPull;
    // Auto-cycle: after a scoped shot with a standard bolt, come off the scope as soon as the
    // trigger finger lifts. Toggle/held scope comes back in by itself once the bolt is home.
    const autoOff = this.autoCycle && this.boltPending && this.def.kind === 'bolt' && !this.straightPull && !a.fireHeld;
    const wantScope = a.scope && this.alive && this.reloadT <= 0 && this.switchT <= 0 && !cyclingBolt && !autoOff;
    // Weapon select: 1 / 2, or the wheel when not scoped.
    if (a.slot1) this.switchTo(0);
    if (a.slot2) this.switchTo(1);
    if (a.swap || (!this.scoped && (a.zoomIn || a.zoomOut) && !a.touchZoom)) this.switchTo(1 - this.slot);
    this.scoped = wantScope;
    this.scopeT = clamp(this.scopeT + (wantScope ? dt / 0.18 : -dt / 0.12), 0, 1);
    if (this.zoomIdx > this.zooms.length - 1) this.zoomIdx = this.zooms.length - 1;
    if (a.zoomIn && this.scoped) this.zoomIdx = Math.min(this.zoomIdx + 1, this.zooms.length - 1);
    if (a.zoomOut && this.scoped) this.zoomIdx = Math.max(this.zoomIdx - 1, 0);
    if (a.zeroUp) this.zero = Math.min(this.zero + WEAPON.zeroStep, WEAPON.zeroMax);
    if (a.zeroDown) this.zero = Math.max(this.zero - WEAPON.zeroStep, WEAPON.zeroMin);

    // --- Breath (hold to steady while scoped)
    const wantHold = a.breath && this.scoped && this.breathLock <= 0 && this.breath > 0;
    this.holding = wantHold;
    if (wantHold) {
      this.breath -= dt / 5;
      if (this.breath <= 0) { this.breath = 0; this.breathLock = 2.5; this.holding = false; }
    } else {
      this.breathLock = Math.max(0, this.breathLock - dt);
      this.breath = Math.min(1, this.breath + dt / 4);
    }

    // --- Weapon timers
    if (this.switchT > 0) {
      const before = this.switchT;
      this.switchT -= dt;
      if (before > 0.35 && this.switchT <= 0.35 && this.pendingSlot >= 0) {
        this.slot = this.pendingSlot;
        this.pendingSlot = -1;
        const w = this.w;
        if (w.chamber === 0 && w.mag > 0) { w.mag--; w.chamber = 1; }
      }
      if (this.switchT < 0) this.switchT = 0;
    }
    if (this.boltPending && (!this.scoped || this.straightPull || this.def.kind !== 'bolt')) {
      this.boltPending = false;
      this.cycleT = this.def.kind === 'bolt' && this.straightPull ? this.def.cycle * 0.8 : this.def.cycle;
      if (this.def.kind === 'bolt' && this.w.mag > 0) this.boltEvent = true;
    }
    if (this.cycleT > 0) {
      this.cycleT -= dt;
      // A bolt gun chambers the next round at the end of the throw.
      if (this.cycleT <= 0) {
        this.cycleT = 0;
        const w = this.w;
        if (w.chamber === 0 && w.mag > 0) { w.mag--; w.chamber = 1; }
      }
    }
    this.rangeT = Math.max(0, this.rangeT - dt);
    this.rangeShow = Math.max(0, this.rangeShow - dt);
    this.recoil = Math.max(0, this.recoil - dt * this.recoil * 6 - dt * 0.004);
    if (this.reloadT > 0) {
      this.reloadT -= dt;
      if (this.reloadT <= 0) {
        this.reloadT = 0;
        const w = this.w;
        const take = Math.min(w.def.mag - w.mag, w.reserve);
        w.mag += take;
        w.reserve -= take;
        if (w.chamber === 0 && w.mag > 0) { w.mag--; w.chamber = 1; }
      }
    }
    if (a.reload) this.startReload();

    // --- Movement
    let speed = this.stance === 2 ? PLAYER.prone : this.stance === 1 ? PLAYER.crouch : PLAYER.walk;
    // keepReload (NightWatch): a reload in progress holds you to a walk instead of being cancelled.
    const sprinting = a.sprint && !this.scoped && this.stance === 0 && a.my < -0.3 && !this.noSprint && !(this.keepReload && this.reloadT > 0);
    if (sprinting) speed = PLAYER.sprint;
    // Sprinting: weapon at carry, no shooting, and an in-progress reload is abandoned.
    this.sprinting = sprinting && canMove;
    if (this.sprinting && this.reloadT > 0 && !this.keepReload) this.reloadT = 0;
    if (this.scoped) speed *= 0.5;
    if (this.wounded) speed *= 0.75;
    if (this.speedMul) speed *= this.speedMul;
    if (!canMove) speed = 0;
    const sn = Math.sin(this.yaw), cs = Math.cos(this.yaw);
    const wx = (a.mx * cs + a.my * sn) * speed;
    const wz = (-a.mx * sn + a.my * cs) * speed;
    const accel = this.onGround ? 14 : 3;
    this.vel.x += (wx - this.vel.x) * Math.min(1, accel * dt);
    this.vel.z += (wz - this.vel.z) * Math.min(1, accel * dt);
    if (a.jump && this.onGround && canMove && this.stance === 0) {
      this.vel.y = PLAYER.jump;
      this.onGround = false;
    }
    this.vel.y -= PLAYER.gravity * dt;

    const height = HEIGHTS[this.stance];
    const oldX = this.pos.x, oldZ = this.pos.z, oldY = this.pos.y;
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    // Steep slopes: refuse to climb terrain above ~52 degrees.
    const tNew = world.heightAt(this.pos.x, this.pos.z);
    const tOld = world.heightAt(oldX, oldZ);
    const hd = Math.hypot(this.pos.x - oldX, this.pos.z - oldZ);
    if (hd > 1e-5 && tNew - tOld > hd * 1.3 && tNew > oldY + 0.05) {
      this.pos.x = oldX;
      this.pos.z = oldZ;
    }
    world.resolveHorizontal(this.pos, PLAYER.radius, height, PLAYER.step);
    this.pos.x = clamp(this.pos.x, -MAP.playX, MAP.playX);
    this.pos.z = clamp(this.pos.z, -MAP.playZ, MAP.playZ);

    this.pos.y += this.vel.y * dt;
    const ground = world.groundAt(this.pos.x, this.pos.z, Math.max(this.pos.y, oldY), PLAYER.step);
    if (this.pos.y <= ground) {
      this.pos.y = ground;
      this.vel.y = 0;
      this.onGround = true;
    } else if (this.onGround && this.pos.y - ground < PLAYER.step && this.vel.y <= 0) {
      // Stick to the ground when walking downhill.
      this.pos.y = ground;
      this.vel.y = 0;
    } else {
      this.onGround = false;
    }

    this.speed = Math.hypot(this.vel.x, this.vel.z);
    this.moving = this.speed > 0.4;
    this._updateBipod(dt);
    const targetEye = EYES[this.stance];
    this.eye += (targetEye - this.eye) * Math.min(1, dt * 10);
    this.bobPhase = (this.bobPhase || 0) + dt * this.speed * 1.9;
    this.bob = this.onGround ? Math.sin(this.bobPhase) * 0.035 * Math.min(this.speed / 4, 1.3) * (1 - this.scopeT) : 0;
  }

  fireKick() {
    const w = this.w, d = w.def;
    w.chamber = 0;
    if (d.kind === 'bolt') {
      // Battlefield-style: the bolt is worked once you come off the scope —
      // unless you run a straight-pull bolt, which cycles while you stay on target.
      this.boltPending = true;
      this.cycleT = 0;
    } else this.cycleT = d.cycle;
    // Semi-autos chamber the next round straight away.
    if (d.kind === 'semi' && w.mag > 0) { w.mag--; w.chamber = 1; }
    const climb = d.kind === 'bolt' && this.straightPull ? 1.15 : 1;
    this.recoil = d.recoil * climb * (this.bipod ? 0.35 : this.stance === 2 ? 0.6 : 1);
    if (d.kind === 'bolt') this.holding = false;
  }
}

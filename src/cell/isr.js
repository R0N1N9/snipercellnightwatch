// Sniper Cell — ISR overwatch: a high-altitude MALE drone (Predator / Reaper class) flying a
// wide orbit around Kestrel Ridge. Everyone can spot it as a speck with blinking nav lights
// (and an IR beacon in night vision). The spotter (or a lone operative) can take its sensor:
//   mouse / drag   slew the sensor point          wheel / +− / pinch  zoom (continuous)
//   N              IR (white-hot) ⇄ EO             F           tag what's under the cross
//   V              pings & requests at the cross   I / Esc     back to first person
//   P              ping sweep: a circle on the ground that marks every unit inside it
//                  (people and machines; the tablet's pulse only hears electronics)
// IR mode shows the operators' strobes and weapon lasers.
import * as THREE from 'three';
import { glowTexture } from '../textures.js';
import { lam } from './facility.js';

export const ORBIT = { x: 0, z: -10, r: 460, alt: 330, speed: 42 };
// Continuous sensor zoom: field of view in degrees, widest to tightest.
export const ISR_FOV = { max: 40, min: 1.8, start: 16 };

export function buildUAV() {
  const g = new THREE.Group();
  const grey = '#5a5e66', dark = '#2c2f35';
  const mk = (geo, col, x, y, z) => { const m = new THREE.Mesh(geo, lam(col)); m.position.set(x, y, z); g.add(m); return m; };
  mk(new THREE.CylinderGeometry(0.42, 0.3, 9.5, 10).rotateX(Math.PI / 2), grey, 0, 0, 0);
  mk(new THREE.SphereGeometry(0.55, 12, 8), grey, 0, 0.12, -4.6);
  mk(new THREE.SphereGeometry(0.32, 10, 8), dark, 0, -0.45, -3.6); // sensor ball
  mk(new THREE.BoxGeometry(20, 0.14, 1.2), grey, 0, 0.1, -0.4);
  for (const s of [-1, 1]) { const t = mk(new THREE.BoxGeometry(0.1, 1.6, 1.0), grey, s * 1.1, 0.55, 4.3); t.rotation.z = s * 0.7; }
  mk(new THREE.BoxGeometry(0.08, 1.4, 0.8), grey, 0, -0.7, 4.3);
  const prop = mk(new THREE.BoxGeometry(2.6, 0.08, 0.2), dark, 0, 0, 4.9);
  const nav = [];
  for (const [x, c] of [[-10, '#ff2030'], [10, '#20ff60']]) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: c, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    s.position.set(x, 0.1, -0.4);
    s.scale.setScalar(5);
    g.add(s);
    nav.push(s);
  }
  // IR beacon: only night vision / IR sees it.
  const ir = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: '#ffffff', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  ir.scale.setScalar(9);
  ir.position.set(0, -0.5, 0);
  ir.layers.set(1);
  g.add(ir);
  g.userData = { prop, nav, ir };
  return g;
}

export class ISR {
  constructor(game) {
    this.g = game;
    this.uav = buildUAV();
    game.scene.add(this.uav);
    this.ang = Math.random() * Math.PI * 2;
    this.pos = new THREE.Vector3();
    this.active = false;
    this.mode = 'IR';
    this.fovT = ISR_FOV.start; // target
    this._fov = ISR_FOV.start; // eased
    this.spi = new THREE.Vector3(0, 0, -18);
    this.cam = new THREE.PerspectiveCamera(ISR_FOV.start, 16 / 10, 1, 6000);
    this._pinch();
    this.update(0);
  }

  get fov() {
    return Math.round(this._fov * 10) / 10;
  }
  // Magnification relative to the widest view.
  get mag() {
    return ISR_FOV.max / this._fov;
  }
  // k > 1 zooms in, k < 1 out.
  zoomBy(k) {
    this.fovT = THREE.MathUtils.clamp(this.fovT / k, ISR_FOV.min, ISR_FOV.max);
  }

  // Two-finger pinch anywhere on screen while the sensor is up.
  _pinch() {
    let d0 = 0, f0 = 0;
    const dist = (e) => Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
    addEventListener('touchstart', (e) => { if (this.active && e.touches.length === 2) { d0 = dist(e); f0 = this.fovT; } }, { passive: true });
    addEventListener('touchmove', (e) => {
      if (!this.active || e.touches.length !== 2 || !d0) return;
      this.fovT = THREE.MathUtils.clamp(f0 * d0 / Math.max(10, dist(e)), ISR_FOV.min, ISR_FOV.max);
    }, { passive: true });
    addEventListener('touchend', (e) => { if (e.touches.length < 2) d0 = 0; }, { passive: true });
  }

  update(dt) {
    this.sweepCd = Math.max(0, (this.sweepCd || 0) - dt);
    if (this.sweepFx) { this.sweepFx.t += dt; if (this.sweepFx.t > 6) this.sweepFx = null; }
    const O = this.g.fac ? ORBIT : ORBIT;
    this.ang += (O.speed / O.r) * dt;
    const x = O.x + Math.cos(this.ang) * O.r, z = O.z + Math.sin(this.ang) * O.r;
    this.pos.set(x, O.alt, z);
    const U = this.uav;
    U.position.copy(this.pos);
    // Nose along the orbit, banked into the turn.
    U.rotation.set(0, Math.atan2(Math.sin(this.ang), -Math.cos(this.ang)) + Math.PI, 0.22, 'YXZ');
    U.userData.prop.rotation.z += dt * 40;
    const t = this.g.t;
    U.userData.nav.forEach((s, i) => (s.visible = Math.sin(t * 3 + i) > 0.6));
    U.userData.ir.visible = (t * 1.2) % 1 < 0.12;
    // Ease the optics toward the target (log space, so every step feels the same).
    this._fov = Math.exp(THREE.MathUtils.lerp(Math.log(this._fov), Math.log(this.fovT), Math.min(1, dt * 7)));
    this._aim(this.cam);
  }

  _aim(cam) {
    cam.position.copy(this.pos).add(new THREE.Vector3(0, -1, 0));
    cam.lookAt(this.spi);
    cam.fov = this._fov;
    cam.updateProjectionMatrix();
  }

  enter() {
    this.active = true;
    this.g.sfx.ui(true);
  }
  exit() {
    this.active = false;
    this.g.sfx.ui(false);
  }

  // Sensor control: look deltas slew the sensor point across the ground.
  control(dt, act, I) {
    const cam = this.cam;
    const dist = cam.position.distanceTo(this.spi);
    const k = dist * Math.tan(THREE.MathUtils.degToRad(this.fov / 2)) * 0.0028;
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion);
    right.y = 0; right.normalize();
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    fwd.y = 0; fwd.normalize();
    this.spi.addScaledVector(right, act.lookX * k).addScaledVector(fwd, -act.lookY * k);
    // Touch / keys: WASD also slews.
    this.spi.addScaledVector(right, act.mx * dist * 0.004 * this.fov / 16 * 60 * dt).addScaledVector(fwd, -act.my * dist * 0.004 * this.fov / 16 * 60 * dt);
    this.spi.x = THREE.MathUtils.clamp(this.spi.x, -170, 170);
    this.spi.z = THREE.MathUtils.clamp(this.spi.z, -145, 320);
    this.spi.y = this.g.fac.groundAt(this.spi.x, this.spi.z, 60, 0.5);
    if (act.zoomIn || I.pressed('Equal') || I.pressed('cell-zin')) this.zoomBy(1.4);
    if (act.zoomOut || I.pressed('Minus') || I.pressed('cell-zout')) this.zoomBy(1 / 1.4);
    // Held keys / buttons: a smooth continuous zoom.
    if (I.held('BracketRight') || I.held('T:cell-zin')) this.zoomBy(1 + dt * 1.6);
    if (I.held('BracketLeft') || I.held('T:cell-zout')) this.zoomBy(1 / (1 + dt * 1.6));
    if (I.pressed('KeyN') || I.pressed('cell-nv')) this.mode = this.mode === 'IR' ? 'EO' : 'IR';
  }

  // Drive the main camera (first-person view replaced by the sensor).
  apply(camera) {
    camera.position.copy(this.cam.position);
    camera.quaternion.copy(this.cam.quaternion);
    camera.fov = this._fov;
    camera.updateProjectionMatrix();
  }

  slant() {
    return this.cam.position.distanceTo(this.spi);
  }
}

// Sniper Cell — night vision the way a modern shooter does it: your support hand reaches up,
// pulls the goggles down over your eyes (or flips them up), you hear the mount click and the
// tubes whine up, and the picture irises open out of black as the tubes warm. In the ISR or
// quad view N just switches the sensor; with the tablet up it toggles instantly.
import * as THREE from 'three';

const DUR = 0.8; // whole gesture
const SWITCH = 0.42; // when the goggles land and the tubes switch

export function glove(color = '#1c1e22') {
  const g = new THREE.Group();
  const m = new THREE.MeshLambertMaterial({ color, emissive: color, emissiveIntensity: 0.25 });
  const palm = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.03, 0.09), m);
  g.add(palm);
  for (let i = 0; i < 4; i++) {
    const f = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.018, 0.06), m);
    f.position.set(-0.028 + i * 0.019, 0.006, -0.068);
    f.rotation.x = -0.5;
    g.add(f);
  }
  const thumb = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.018, 0.05), m);
  thumb.position.set(0.045, 0, -0.01);
  thumb.rotation.y = -0.6;
  g.add(thumb);
  const cuff = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.05, 0.14), new THREE.MeshLambertMaterial({ color: '#23262b', emissive: '#23262b', emissiveIntensity: 0.2 }));
  cuff.position.z = 0.11;
  g.add(cuff);
  return g;
}

function goggles() {
  const g = new THREE.Group();
  const dark = new THREE.MeshLambertMaterial({ color: '#16181b', emissive: '#16181b', emissiveIntensity: 0.25 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.04, 0.05), dark);
  g.add(body);
  for (const sx of [-0.032, 0.032]) {
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.022, 0.07, 14).rotateX(Math.PI / 2), dark);
    tube.position.set(sx, -0.012, 0.03);
    g.add(tube);
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.016, 16), new THREE.MeshBasicMaterial({ color: '#30ffd0', transparent: true, opacity: 0.35 }));
    lens.position.set(sx, -0.012, 0.066);
    g.add(lens);
  }
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.08, 0.02), dark);
  arm.position.set(0, 0.05, -0.02);
  g.add(arm);
  return g;
}

const ease = (x) => (x < 0 ? 0 : x > 1 ? 1 : x * x * (3 - 2 * x));

export const NVG = {
  _nvgInit() {
    this.nvgHand = glove();
    this.nvgGog = goggles();
    // Goggles hinge on a pivot just above your brow.
    this.nvgPivot = new THREE.Group();
    this.nvgPivot.position.set(0, 0.11, -0.05);
    this.nvgGog.position.set(0, -0.06, -0.12);
    this.nvgPivot.add(this.nvgGog);
    for (const o of [this.nvgHand, this.nvgPivot]) {
      o.visible = false;
      o.traverse((q) => { q.renderOrder = 12; q.frustumCulled = false; });
      this.camera.add(o);
    }
    this.nvgAnim = null;
    this.nvgIris = 0; // 0 = fully open
  },

  // N pressed in first person.
  _nvgToggle() {
    if (this.nvgAnim) return;
    if (this.isr.active || (this.quad && this.quad.active) || this.tablet.visible || this.downed) {
      this.nv = !this.nv;
      this.audio.click();
      return;
    }
    this.nvgAnim = { t: 0, to: !this.nv, switched: false };
    this.audio.nvgReach && this.audio.nvgReach();
  },

  _nvgTick(dt) {
    const A = this.nvgAnim;
    this.nvgIris = Math.max(0, this.nvgIris - dt * 2.4);
    if (!A) { this.nvgHand.visible = false; this.nvgPivot.visible = false; return; }
    A.t += dt;
    const t = A.t;
    // Hand: up from the lower left to the goggle mount, then away.
    const up = ease(t / 0.3), down = ease((t - 0.5) / 0.3);
    const k = up * (1 - down);
    this.nvgHand.visible = true;
    this.nvgHand.position.set(-0.22 + 0.2 * k, -0.42 + 0.5 * k - (t > 0.3 && t < 0.5 ? (A.to ? 0.05 : -0.04) * ease((t - 0.3) / 0.15) : 0), -0.34 + 0.08 * k);
    this.nvgHand.rotation.set(-1.0 + 0.9 * k, 0.4 - 0.3 * k, 0.3);
    // Goggles: visible while they move across your eyes.
    const flip = ease((t - 0.26) / (SWITCH - 0.26));
    // 0 = over the eyes, +1.5 = hinged up over the brow (out of view). (It used to swing the
    // other way, down and back through your face, which flashed a dark slab across the screen.)
    const ang = A.to ? 1.5 * (1 - flip) : 1.5 * flip;
    this.nvgPivot.rotation.x = ang;
    this.nvgPivot.visible = t > 0.18 && t < SWITCH + (A.to ? 0.02 : 0.05) && ang < 1.3;
    if (!A.switched && t >= SWITCH) {
      A.switched = true;
      this.nv = A.to;
      if (A.to) this.nvgIris = 1;
      if (this.audio.nvg) this.audio.nvg(A.to);
      if (A.to && this.t - (this._darkT || -99) > 90 && Math.random() < 0.35) { this._darkT = this.t; this._radio('me', 'Going dark.', true); }
    }
    if (t >= DUR) { this.nvgAnim = null; this.nvgHand.visible = false; this.nvgPivot.visible = false; }
  },

  // HUD: the tubes warming up: black, then an iris opening with a bright bloom at its edge.
  _nvgHud(c, W, H) {
    const A = this.nvgAnim;
    // A beat of darkness as the goggles cover your eyes.
    if (A && A.to && A.t > 0.32 && A.t < SWITCH) { c.fillStyle = `rgba(0,0,0,${ease((A.t - 0.32) / 0.1) * 0.9})`; c.fillRect(0, 0, W, H); }
    const v = this.nvgIris;
    if (v <= 0) return;
    const R = Math.hypot(W, H) * 0.5 * (1 - v) + 4;
    c.save();
    c.fillStyle = `rgba(0,0,0,${Math.min(1, v * 1.4)})`;
    c.beginPath(); c.rect(0, 0, W, H); c.arc(W / 2, H / 2, R, 0, Math.PI * 2, true); c.fill('evenodd');
    const g = c.createRadialGradient(W / 2, H / 2, R * 0.6, W / 2, H / 2, R * 1.05);
    g.addColorStop(0, 'rgba(220,235,255,0)');
    g.addColorStop(1, `rgba(220,235,255,${(0.5 * v).toFixed(3)})`);
    c.fillStyle = g;
    c.beginPath(); c.arc(W / 2, H / 2, R * 1.05, 0, Math.PI * 2); c.fill();
    c.restore();
  },
};

export function installNVG(Cls) {
  for (const k of Object.keys(NVG)) Cls.prototype[k] = NVG[k];
}

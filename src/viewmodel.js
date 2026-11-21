// First-person weapons and arms. Everything lives in camera space (child of the camera).
// Units are metres; the camera looks down -Z.
import * as THREE from 'three';
import { clamp, smoothstep } from './util.js';
import { retint, THEMES, themeOf, camoMaterial } from './avatar.js';
import { buildChicken, animateChicken } from './chicken.js';

const C = {
  fde: '#7d6c52',
  fdeDark: '#5f533f',
  black: '#25262b',
  blackHi: '#34353b',
  tan: '#8a7758',
  sleeve: '#3d4132',
  sleeveDark: '#30332a',
  glove: '#2f2d29',
  glovePad: '#3b3833',
  lens: '#18243a',
};
const matCache = new Map();
function mat(hex) {
  if (!matCache.has(hex)) matCache.set(hex, new THREE.MeshLambertMaterial({ color: hex, emissive: hex, emissiveIntensity: 0.14 }));
  return matCache.get(hex);
}
function m(geo, hex, x = 0, y = 0, z = 0) {
  const o = new THREE.Mesh(geo, mat(hex));
  o.position.set(x, y, z);
  return o;
}
const box = (w, h, d, hex, x, y, z) => m(new THREE.BoxGeometry(w, h, d), hex, x, y, z);
// Cylinder along Z.
const cylZ = (r1, r2, len, hex, x, y, z, seg = 12) => m(new THREE.CylinderGeometry(r1, r2, len, seg).rotateX(Math.PI / 2), hex, x, y, z);
const anchor = (x, y, z) => {
  const a = new THREE.Object3D();
  a.position.set(x, y, z);
  return a;
};

function scope(g, { y, z0, len, tube, obj, eye, hex = C.black }) {
  g.add(cylZ(tube, tube, len, hex, 0, y, z0 - len / 2));
  g.add(cylZ(obj, tube, 0.09, hex, 0, y, z0 - len - 0.04));
  g.add(cylZ(obj + 0.002, obj + 0.002, 0.02, C.blackHi, 0, y, z0 - len - 0.09));
  g.add(cylZ(tube, eye, 0.07, hex, 0, y, z0 + 0.03));
  g.add(cylZ(eye + 0.002, eye + 0.002, 0.015, C.blackHi, 0, y, z0 + 0.06));
  const lens = new THREE.Mesh(new THREE.CircleGeometry(eye * 0.85, 16), new THREE.MeshBasicMaterial({ color: C.lens }));
  lens.position.set(0, y, z0 + 0.068);
  g.add(lens);
  // Elevation + windage turrets, parallax knob.
  g.add(m(new THREE.CylinderGeometry(0.016, 0.016, 0.03, 14), hex, 0, y + tube + 0.012, z0 - len * 0.45));
  g.add(m(new THREE.CylinderGeometry(0.017, 0.017, 0.006, 14), C.blackHi, 0, y + tube + 0.028, z0 - len * 0.45));
  g.add(m(new THREE.CylinderGeometry(0.014, 0.014, 0.026, 14).rotateZ(Math.PI / 2), hex, tube + 0.01, y, z0 - len * 0.45));
  g.add(m(new THREE.CylinderGeometry(0.012, 0.012, 0.022, 14).rotateZ(Math.PI / 2), hex, -tube - 0.008, y, z0 - len * 0.45));
  // Rings.
  for (const k of [0.2, 0.75]) {
    g.add(cylZ(tube + 0.004, tube + 0.004, 0.018, C.blackHi, 0, y, z0 - len * k));
    g.add(box(0.022, y - 0.035, 0.018, C.black, 0, (y + 0.035) / 2, z0 - len * k));
  }
}

function buildMk22() {
  const g = new THREE.Group();
  // Chassis / receiver.
  g.add(box(0.05, 0.055, 0.3, C.fde, 0, 0.012, -0.11));
  g.add(box(0.046, 0.02, 0.3, C.black, 0, 0.045, -0.11)); // top rail
  for (let i = 0; i < 9; i++) g.add(box(0.05, 0.006, 0.012, C.blackHi, 0, 0.057, -0.24 + i * 0.03));
  // Handguard: octagonal tube with slots.
  const hg = cylZ(0.031, 0.031, 0.44, C.fde, 0, 0.008, -0.48, 8);
  hg.rotation.z = Math.PI / 8;
  g.add(hg);
  for (let i = 0; i < 6; i++) for (const s of [-1, 1]) g.add(box(0.004, 0.012, 0.035, C.fdeDark, s * 0.03, 0.008, -0.33 - i * 0.06));
  // Barrel + muzzle brake with ports.
  g.add(cylZ(0.012, 0.014, 0.36, C.black, 0, 0.01, -0.86, 10));
  const brake = cylZ(0.021, 0.021, 0.085, C.black, 0, 0.01, -1.07, 10);
  g.add(brake);
  for (let i = 0; i < 3; i++) for (const s of [-1, 1]) g.add(box(0.004, 0.012, 0.012, '#111114', s * 0.021, 0.01, -1.045 - i * 0.022));
  // Pistol grip, trigger guard, trigger.
  const grip = box(0.032, 0.105, 0.045, C.fdeDark, 0, -0.06, 0.005);
  grip.rotation.x = 0.28;
  g.add(grip);
  g.add(box(0.008, 0.008, 0.07, C.black, 0, -0.032, -0.045));
  g.add(box(0.006, 0.028, 0.006, C.black, 0, -0.02, -0.035));
  // Magazine.
  const magG = new THREE.Group();
  magG.add(box(0.034, 0.085, 0.075, C.black, 0, -0.04, 0));
  magG.add(box(0.038, 0.012, 0.08, C.blackHi, 0, -0.085, 0));
  magG.position.set(0, -0.012, -0.1);
  g.add(magG);
  // Folding skeleton stock + cheek riser + butt pad.
  g.add(box(0.022, 0.02, 0.32, C.fde, 0, 0.02, 0.16));
  g.add(box(0.018, 0.016, 0.24, C.fde, 0, -0.07, 0.2));
  g.add(box(0.03, 0.035, 0.07, C.fdeDark, 0, 0.045, 0.14));
  g.add(box(0.03, 0.14, 0.03, C.black, 0, -0.022, 0.33));
  g.add(box(0.02, 0.1, 0.012, C.fde, 0, -0.025, 0.06));
  // Bolt (animated): body + handle with knob, on the right side.
  const bolt = new THREE.Group();
  bolt.add(cylZ(0.012, 0.012, 0.1, C.blackHi, 0, 0, 0));
  const arm = box(0.045, 0.008, 0.01, C.blackHi, 0.024, 0, 0.03);
  bolt.add(arm);
  bolt.add(m(new THREE.SphereGeometry(0.011, 10, 8), C.black, 0.048, 0, 0.03));
  bolt.position.set(0, 0.03, -0.02);
  g.add(bolt);
  // Folding bipod under the front of the handguard (animated).
  const bipod = buildBipod(g, -0.03, -0.66, 0.2);
  scope(g, { y: 0.085, z0: -0.03, len: 0.3, tube: 0.017, obj: 0.029, eye: 0.022 });
  g.userData = {
    gripR: anchor(0, -0.075, 0.015),
    gripL: anchor(-0.005, -0.03, -0.42),
    muzzle: anchor(0, 0.01, -1.12),
    bolt,
    bipod,
    boltKnob: anchor(0.048, 0.03, 0.01),
    mag: magG,
    magHome: magG.position.clone(),
    sight: 0.085,
  };
  for (const k of ['gripR', 'gripL', 'muzzle', 'boltKnob']) g.add(g.userData[k]);
  return g;
}

function buildDmr() {
  const g = new THREE.Group();
  // Upper + lower receiver.
  g.add(box(0.046, 0.05, 0.24, C.black, 0, 0.02, -0.1));
  g.add(box(0.042, 0.045, 0.16, C.blackHi, 0, -0.022, -0.08));
  g.add(box(0.026, 0.016, 0.24, C.black, 0, 0.052, -0.1));
  for (let i = 0; i < 8; i++) g.add(box(0.03, 0.006, 0.01, C.blackHi, 0, 0.062, -0.2 + i * 0.028));
  g.add(box(0.014, 0.01, 0.04, C.blackHi, 0, 0.04, 0.03)); // charging handle
  g.add(box(0.01, 0.024, 0.024, C.black, 0.026, 0.02, -0.12)); // forward assist / ejection
  // Free-float rail handguard.
  const hg = cylZ(0.029, 0.029, 0.38, C.tan, 0, 0.02, -0.41, 8);
  hg.rotation.z = Math.PI / 8;
  g.add(hg);
  g.add(box(0.024, 0.012, 0.38, C.black, 0, 0.052, -0.41));
  for (let i = 0; i < 5; i++) for (const s of [-1, 1]) g.add(box(0.004, 0.014, 0.04, '#5f553f', s * 0.028, 0.02, -0.27 - i * 0.065));
  // Barrel + flash hider.
  g.add(cylZ(0.011, 0.012, 0.22, C.black, 0, 0.02, -0.71, 10));
  g.add(cylZ(0.016, 0.016, 0.07, C.black, 0, 0.02, -0.85, 8));
  // Grip, trigger guard.
  const grip = box(0.03, 0.1, 0.042, C.black, 0, -0.07, 0.01);
  grip.rotation.x = 0.32;
  g.add(grip);
  g.add(box(0.008, 0.008, 0.065, C.black, 0, -0.045, -0.04));
  // Curved 20-round magazine.
  const magG = new THREE.Group();
  const m1 = box(0.03, 0.08, 0.07, C.black, 0, -0.04, 0);
  const m2 = box(0.03, 0.07, 0.07, C.black, 0, -0.105, -0.012);
  m2.rotation.x = 0.22;
  magG.add(m1, m2);
  magG.position.set(0, -0.04, -0.11);
  g.add(magG);
  // Buffer tube + adjustable stock.
  g.add(cylZ(0.016, 0.016, 0.2, C.black, 0, 0.012, 0.12));
  g.add(box(0.04, 0.07, 0.15, C.tan, 0, -0.005, 0.2));
  g.add(box(0.03, 0.03, 0.08, C.tan, 0, 0.04, 0.17));
  g.add(box(0.04, 0.11, 0.025, C.black, 0, -0.01, 0.285));
  scope(g, { y: 0.09, z0: -0.04, len: 0.24, tube: 0.015, obj: 0.023, eye: 0.019 });
  const bipod = buildBipod(g, -0.012, -0.56, 0.18);
  g.userData = {
    bipod,
    gripR: anchor(0, -0.085, 0.02),
    gripL: anchor(-0.004, -0.008, -0.38),
    muzzle: anchor(0, 0.02, -0.9),
    mag: magG,
    magHome: magG.position.clone(),
    sight: 0.09,
  };
  for (const k of ['gripR', 'gripL', 'muzzle']) g.add(g.userData[k]);
  return g;
}

// Bipod: a clamp with two legs hinged at the front, folded back along the handguard.
// Deploy progress k swings each leg down (and slightly forward) and splays them apart.
function buildBipod(g, y, z, len) {
  const mount = new THREE.Group();
  mount.position.set(0, y, z);
  mount.add(box(0.045, 0.02, 0.035, C.black, 0, 0, 0));
  const legs = [];
  for (const s of [-1, 1]) {
    const splay = new THREE.Group();
    splay.position.x = s * 0.017;
    const hinge = new THREE.Group();
    const leg = new THREE.Group();
    leg.add(cylZ(0.0055, 0.0055, len * 0.6, C.black, 0, 0, len * 0.3, 6));
    leg.add(cylZ(0.0042, 0.0042, len * 0.45, C.blackHi, 0, 0, len * 0.78, 6)); // telescoping lower leg
    leg.add(m(new THREE.SphereGeometry(0.009, 8, 6), C.black, 0, 0, len)); // rubber foot
    hinge.add(leg);
    splay.add(hinge);
    mount.add(splay);
    legs.push({ splay, hinge, s });
  }
  g.add(mount);
  return { legs, mount, set(k) {
    const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    for (const l of legs) {
      l.hinge.rotation.x = e * 1.72; // folded back -> pointing down and a little forward
      l.splay.rotation.z = l.s * e * 0.32;
    }
  } };
}

function buildPistol() {
  const g = new THREE.Group();
  // Frame + grip (coyote), slide (black).
  g.add(box(0.03, 0.026, 0.15, C.tan, 0, -0.005, -0.06));
  const grip = box(0.031, 0.11, 0.05, C.tan, 0, -0.065, 0.005);
  grip.rotation.x = 0.2;
  g.add(grip);
  for (let i = 0; i < 4; i++) {
    const t = box(0.032, 0.004, 0.044, '#6f6046', 0, -0.04 - i * 0.022, 0.005 + i * 0.004);
    t.rotation.x = 0.2;
    g.add(t);
  }
  g.add(box(0.007, 0.007, 0.05, C.tan, 0, -0.03, -0.035));
  const slide = new THREE.Group();
  slide.add(box(0.027, 0.03, 0.18, C.black, 0, 0, 0));
  for (let i = 0; i < 6; i++) slide.add(box(0.028, 0.022, 0.003, '#141418', 0, 0, 0.06 + i * 0.006));
  slide.add(box(0.006, 0.008, 0.008, C.blackHi, 0, 0.019, -0.084)); // front sight
  slide.add(box(0.02, 0.009, 0.008, C.blackHi, 0, 0.019, 0.08)); // rear sight
  slide.add(cylZ(0.006, 0.006, 0.01, '#111114', 0, 0.002, -0.092, 8));
  slide.position.set(0, 0.022, -0.06);
  g.add(slide);
  const magG = new THREE.Group();
  magG.add(box(0.028, 0.012, 0.05, C.black, 0, -0.005, 0));
  magG.position.set(0, -0.12, 0.018);
  g.add(magG);
  g.userData = {
    gripR: anchor(0, -0.07, 0.02),
    gripL: anchor(-0.022, -0.075, 0.005),
    muzzle: anchor(0, 0.022, -0.16),
    slide,
    slideHome: slide.position.clone(),
    mag: magG,
    magHome: magG.position.clone(),
    sight: 0.042,
  };
  for (const k of ['gripR', 'gripL', 'muzzle']) g.add(g.userData[k]);
  return g;
}

// Tapered segment (unit length along +Y), scaled per frame.
function segment(r0, r1, hex) {
  const geo = new THREE.CylinderGeometry(r1, r0, 1, 12, 1, true).translate(0, 0.5, 0);
  const mesh = new THREE.Mesh(geo, mat(hex));
  const capA = new THREE.Mesh(new THREE.SphereGeometry(r0, 12, 8), mat(hex));
  const capB = new THREE.Mesh(new THREE.SphereGeometry(r1, 12, 8), mat(hex));
  return { mesh, capA, capB };
}
const UP = new THREE.Vector3(0, 1, 0);
const ORIGIN = new THREE.Vector3();
const _m = new THREE.Matrix4();
function placeSeg(seg, a, b) {
  const d = b.clone().sub(a);
  const L = d.length();
  seg.mesh.position.copy(a);
  seg.mesh.quaternion.setFromUnitVectors(UP, d.normalize());
  seg.mesh.scale.set(1, L, 1);
  seg.capA.position.copy(a);
  seg.capB.position.copy(b);
}

// Two-bone IK: elbow position from shoulder, hand, bone lengths and a pole direction.
function solveElbow(sh, hand, a, b, pole) {
  const d = hand.clone().sub(sh);
  let L = d.length();
  L = clamp(L, Math.abs(a - b) + 1e-3, a + b - 1e-3);
  const dir = d.normalize();
  const cosA = (a * a + L * L - b * b) / (2 * a * L);
  const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
  const perp = pole.clone().sub(dir.clone().multiplyScalar(pole.dot(dir))).normalize();
  return sh.clone().addScaledVector(dir, a * cosA).addScaledVector(perp, a * sinA);
}

class Arm {
  constructor(root, side) {
    this.side = side;
    this.upper = segment(0.055, 0.048, C.sleeve);
    this.fore = segment(0.046, 0.036, C.sleeve);
    this.cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.035, 12), mat(C.sleeveDark));
    this.hand = new THREE.Group();
    // Gloved hand: palm, knuckle pad, curled fingers, thumb.
    this.hand.add(m(new THREE.BoxGeometry(0.05, 0.026, 0.07).translate(0, 0, 0.035), C.glove));
    this.hand.add(m(new THREE.BoxGeometry(0.052, 0.012, 0.03).translate(0, 0.016, 0.06), C.glovePad));
    for (let i = 0; i < 4; i++) {
      const f = m(new THREE.CapsuleGeometry(0.0085, 0.03, 3, 6).rotateX(Math.PI / 2).translate(0, -0.012, 0.085), C.glove);
      f.position.x = (i - 1.5) * 0.013;
      f.rotation.x = 0.9;
      this.hand.add(f);
    }
    const thumb = m(new THREE.CapsuleGeometry(0.009, 0.035, 3, 6).rotateX(Math.PI / 2).translate(0, 0, 0.03), C.glove);
    thumb.position.set(-side * 0.028, 0.004, 0.02);
    thumb.rotation.y = side * 0.6;
    this.hand.add(thumb);
    for (const o of [this.upper.mesh, this.upper.capA, this.upper.capB, this.fore.mesh, this.fore.capB, this.cuff, this.hand]) root.add(o);
    this.sleeves = [this.upper.mesh, this.upper.capA, this.upper.capB, this.fore.mesh, this.fore.capB];
    // Poncho fabric bunched over the left upper arm (the flap is thrown over that shoulder).
    if (side < 0) {
      this.drape = segment(0.085, 0.066, C.sleeve);
      this.drape.capA.visible = false;
      for (const o of [this.drape.mesh, this.drape.capB]) root.add(o);
    }
  }

  setLook(wraith, poncho, themeId) {
    const T = THEMES[themeId], theme = T.base;
    const sl = T.colors ? camoMaterial(themeId, 0.85, 0.14) : mat(retint(C.sleeve, theme)), gl = mat(wraith ? '#1b1c1e' : C.glove);
    for (const o of this.sleeves) o.material = sl;
    this.cuff.material = mat(retint(C.sleeveDark, theme));
    this.hand.traverse((o) => { if (o.isMesh && o.material !== mat(C.glovePad)) o.material = gl; });
    if (this.drape) {
      const dm = T.colors ? camoMaterial(themeId, 1, 0.14) : mat(retint('#4d5338', theme));
      this.drape.mesh.material = this.drape.capB.material = dm;
      this.drape.mesh.visible = this.drape.capB.visible = poncho;
    }
  }

  pose(shoulder, handPos, handFwd, pole) {
    const a = 0.3, b = 0.29;
    // Wrist sits a little behind the grip point along the hand's forward axis.
    const wrist = handPos.clone().addScaledVector(handFwd, -0.075);
    const elbow = solveElbow(shoulder, wrist, a, b, pole);
    placeSeg(this.upper, shoulder, elbow);
    if (this.drape) placeSeg(this.drape, shoulder, shoulder.clone().lerp(elbow, 0.62));
    placeSeg(this.fore, elbow, wrist);
    this.cuff.position.copy(wrist).addScaledVector(handFwd, -0.03);
    this.cuff.quaternion.setFromUnitVectors(UP, handFwd);
    this.hand.position.copy(wrist);
    // Build a basis: +Z along the hand, knuckles up (fingers curl down around the grip).
    _m.lookAt(handFwd, ORIGIN, UP);
    this.hand.quaternion.setFromRotationMatrix(_m);
  }
}

// Pollo Hermano: a chicken held by the beak (left hand) and pulled back by the feet (right).
function buildPolloSling() {
  const g = new THREE.Group();
  const c = buildChicken({ plain: true });
  c.scale.setScalar(0.55);
  c.position.set(0, -0.255, -0.29);
  c.userData.legs.forEach((L) => (L.rotation.x = -1.7));
  g.add(c);
  const beak = anchor(0, -0.01, -0.1);
  c.userData.head.add(beak);
  const feet = anchor(0, -0.15, 0);
  c.userData.legs[0].add(feet);
  g.userData = { gripL: beak, gripR: feet, muzzle: beak, sight: 0.085, chick: c };
  return g;
}

export class ViewModel {
  constructor(camera) {
    this.root = new THREE.Group();
    camera.add(this.root);
    this.models = { mk22: buildMk22(), dmr: buildDmr(), m18: buildPistol(), pollo: buildPolloSling() };
    this.holder = new THREE.Group();
    this.holder.scale.setScalar(0.82);
    this.root.add(this.holder);
    for (const g of Object.values(this.models)) {
      g.visible = false;
      this.holder.add(g);
    }
    this.armR = new Arm(this.root, 1);
    this.armL = new Arm(this.root, -1);
    this.root.traverse((o) => {
      o.renderOrder = 10;
      o.frustumCulled = false;
    });
    this.current = null;
    this.kick = 0;
    this.t = 0;
    this._v = new THREE.Vector3();
  }

  set visible(v) {
    this.root.visible = v;
  }

  // look: { outfit, poncho } — sleeves/gloves follow the outfit, poncho drapes the left arm.
  setLook(look) {
    const wraith = look.outfit === 'wraith', poncho = !!look.poncho;
    const theme = themeOf(look.theme, look.outfit);
    const key = wraith + ':' + poncho + ':' + theme;
    if (this._look === key) return;
    this._look = key;
    this.armR.setLook(wraith, false, theme);
    this.armL.setLook(wraith, poncho, theme);
  }

  muzzleWorld(out = new THREE.Vector3()) {
    const g = this.models[this.current];
    if (!g) return out.set(0, 0, 0);
    return g.userData.muzzle.getWorldPosition(out);
  }

  fired(strength = 1) {
    this.kick = 1;
    this.kickS = strength;
  }

  // st: { def, scopeT, speed, sprint, bobPhase, cycleT, reloadT, reloadDur, reloadEmpty, switchT, slot }
  update(dt, st) {
    this.t += dt;
    const def = st.def;
    const key = st.pollo && def.slot === 'rifle' ? 'pollo' : def.key;
    if (this.current !== key) {
      if (this.current) this.models[this.current].visible = false;
      this.current = key;
      this.models[key].visible = true;
    }
    const g = this.models[key];
    const U = g.userData;
    const pistol = def.slot === 'pistol';
    this.kick = Math.max(0, this.kick - dt * (pistol ? 9 : 5));

    // ---- Base pose (hip / low ready) and ADS for the pistol.
    const ads = pistol ? smoothstep(0, 1, st.scopeT) : 0;
    const base = pistol ? new THREE.Vector3(0.12, -0.14, -0.34) : new THREE.Vector3(0.165, -0.16, -0.3);
    const adsPos = new THREE.Vector3(0, -(U.sight + 0.004) * 0.82, -0.3);
    // Canted hold (handguns, an option): centre of the screen, tilted, like CoD; aiming down
    // the sights straightens it out.
    // IR (night vision on): handguns and the SMG come up higher and cant over, MW-style, so
    // the IR laser shows across the view. Firing keeps it; aiming down the sights takes it out.
    // (Not the sniper rifle.)
    this.irK = (this.irK || 0) + ((st.irCant && pistol ? 1 : 0) - (this.irK || 0)) * Math.min(1, dt * 6);
    const irK = this.irK * (1 - ads);
    const cantK = pistol && def.key !== 'smg' ? Math.max(st.cant ? 1 - ads : 0, irK) : 0;
    if (cantK > 0) base.lerp(new THREE.Vector3(0.035, -0.125 + 0.025 * irK, -0.33), cantK);
    const smgIr = def.key === 'smg' ? irK : 0;
    if (smgIr > 0) base.lerp(new THREE.Vector3(0.07, -0.115, -0.33), smgIr);
    const pos = base.clone().lerp(adsPos, ads);
    const rot = new THREE.Euler(0, 0, 0, 'YXZ');
    if (!pistol) rot.y = 0.04;
    // Canted so the right side of the gun rides up and the top leans left, as in CoD.
    rot.z += 0.42 * cantK + 0.5 * smgIr;

    // Breathing + walk bob.
    const breathe = Math.sin(this.t * 1.6);
    pos.y += breathe * 0.0025 * (1 - ads * 0.7);
    rot.x += breathe * 0.004;
    const bp = st.bobPhase || 0;
    const walk = Math.min(st.speed / 4, 1.5) * (1 - ads * 0.8);
    pos.x += Math.sin(bp) * 0.01 * walk;
    pos.y += Math.abs(Math.cos(bp)) * 0.012 * walk;
    rot.z += Math.sin(bp) * 0.02 * walk;

    // Sprint: rifle swung across the chest.
    const sprintK = st.sprint ? 1 : 0;
    this.sprintK = (this.sprintK || 0) + (sprintK - (this.sprintK || 0)) * Math.min(1, dt * 8);
    const sk = this.sprintK;
    pos.x -= 0.05 * sk;
    pos.y -= 0.06 * sk;
    rot.y += 0.75 * sk;
    rot.x -= 0.35 * sk;
    rot.z += 0.25 * sk;

    // Recoil.
    const k = this.kick * this.kick * (this.kickS || 1);
    pos.z += k * (pistol ? 0.04 : 0.07);
    rot.x += k * (pistol ? 0.22 : 0.09);

    // Bipod: legs swing down, then the rifle settles onto them with a small dip.
    const bk = st.bipodT || 0;
    if (U.bipod) U.bipod.set(bk);
    if (bk > 0) {
      pos.y -= 0.018 * bk + Math.sin(clamp((bk - 0.55) / 0.45, 0, 1) * Math.PI) * 0.012;
      rot.x -= 0.02 * bk;
      pos.y -= breathe * 0.0025 * bk; // planted: the breathing bob all but stops
    }

    // Weapon switch: drop out, swap (handled by the player state), come back up.
    if (st.switchT > 0) {
      const u = st.switchT > 0.35 ? 1 - (st.switchT - 0.35) / 0.35 : st.switchT / 0.35;
      const e = smoothstep(0, 1, u);
      pos.y -= 0.35 * e;
      rot.x -= 0.6 * e;
    }

    // Reload: tilt, magazine out, new magazine in.
    let magOff = 0, leftReach = 0, rack = 0;
    if (st.reloadT > 0) {
      const r = 1 - st.reloadT / st.reloadDur; // 0 -> 1
      const tilt = smoothstep(0, 0.12, r) * (1 - smoothstep(0.85, 1, r));
      rot.z += 0.38 * tilt;
      rot.x += 0.12 * tilt;
      pos.y += 0.02 * tilt;
      magOff = smoothstep(0.12, 0.3, r) * (1 - smoothstep(0.55, 0.72, r));
      leftReach = smoothstep(0.2, 0.4, r) * (1 - smoothstep(0.55, 0.75, r));
      if (st.reloadEmpty) rack = smoothstep(0.8, 0.88, r) * (1 - smoothstep(0.9, 0.97, r));
    }
    if (U.mag) {
      U.mag.position.copy(U.magHome);
      U.mag.position.y -= magOff * 0.35;
      U.mag.visible = magOff < 0.95;
    }

    // Bolt throw (Mk22): lift, pull, push, lower.
    let boltReach = 0;
    if (U.bolt) {
      let u = 0;
      if (st.cycleT > 0 && def.kind === 'bolt') u = clamp(1 - (st.cycleT - 0.05) / (def.cycle - 0.25), 0, 1);
      if (st.reloadEmpty && st.reloadT > 0) u = clamp((1 - st.reloadT / st.reloadDur - 0.78) / 0.2, 0, 1);
      const lift = smoothstep(0.15, 0.28, u) * (1 - smoothstep(0.72, 0.85, u));
      const pull = smoothstep(0.3, 0.48, u) * (1 - smoothstep(0.52, 0.7, u));
      U.bolt.rotation.z = lift * 1.15;
      U.bolt.position.z = -0.02 + pull * 0.1;
      boltReach = smoothstep(0.02, 0.15, u) * (1 - smoothstep(0.85, 0.98, u));
      if (u > 0) rot.z -= 0.08 * boltReach;
    }
    // Pollo: stretch the chicken as you draw; it's gone once flung until you grab the next one.
    if (U.chick) {
      const C = U.chick.userData;
      const draw = 0.15 + 0.85 * smoothstep(0, 1, st.scopeT);
      animateChicken(U.chick, this.t, { flap: draw > 0.5 ? 0.5 : 0.15 });
      C.body.scale.z = 1 + 0.45 * draw;
      U.chick.userData.legs.forEach((L) => (L.rotation.x = -1.5 - 0.35 * draw));
      let grab = 1;
      if (st.boltPending || st.empty) grab = 0;
      else if (st.cycleT > 0) grab = smoothstep(0.55, 0.95, 1 - st.cycleT / def.cycle);
      U.chick.visible = grab > 0.02;
      U.chick.scale.setScalar(0.55 * (0.2 + 0.8 * grab));
    }
    // Pistol slide: recoil cycle and empty-reload rack.
    if (U.slide) {
      const back = Math.max(this.kick, rack, st.empty ? 1 : 0);
      U.slide.position.z = U.slideHome.z + back * 0.035;
    }
    if (!U.bolt && rack > 0) rot.z -= 0.05 * rack;

    // Suppressor off / on: weapon canted up and in, support hand to the muzzle, the can turns
    // and comes away into the hand (off), or comes up from the pouch and threads on (on).
    const su = st.supU || 0, can = st.supCan;
    let supReach = 0;
    if (su > 0 && can) {
      const hold = smoothstep(0, 0.16, su) * (1 - smoothstep(0.86, 1, su));
      rot.y -= 0.42 * hold;
      rot.x += 0.12 * hold;
      pos.x -= 0.04 * hold;
      pos.y += 0.03 * hold;
      pos.z += 0.03 * hold;
      if (!can.userData.home) can.userData.home = can.position.clone();
      const H = can.userData.home;
      // tw: threads turning; out: can travelling between muzzle and pouch (0 = on the muzzle).
      let tw, out;
      if (st.supTo) { out = 1 - smoothstep(0.2, 0.48, su); tw = smoothstep(0.5, 0.78, su); }
      else { tw = smoothstep(0.24, 0.52, su); out = smoothstep(0.55, 0.82, su); }
      can.position.copy(H);
      can.position.z -= 0.025 * (st.supTo ? 1 - tw : tw) + 0.08 * out;
      can.position.x -= 0.22 * out * out;
      can.position.y -= 0.3 * out * out;
      can.rotation.z = (st.supTo ? tw : -tw) * Math.PI * 3;
      rot.z += Math.sin(tw * Math.PI * 5) * 0.025 * (tw > 0 && tw < 1 ? 1 : 0);
      supReach = st.supTo ? smoothstep(0.1, 0.22, su) * (1 - smoothstep(0.8, 0.94, su)) : smoothstep(0.08, 0.24, su) * (1 - smoothstep(0.82, 0.96, su));
    } else if (can && can.userData.home) { can.position.copy(can.userData.home); can.rotation.z = 0; }

    this.holder.position.copy(pos);
    this.holder.rotation.copy(rot);
    this.holder.updateMatrixWorld(true);
    this.root.updateMatrixWorld(true);

    // ---- Arms (IK to anchors on the weapon).
    const toRoot = (obj) => this.root.worldToLocal(obj.getWorldPosition(new THREE.Vector3()));
    const fwd = new THREE.Vector3(0, 0, -1).applyEuler(rot);
    let handR = toRoot(U.gripR);
    if (U.boltKnob && boltReach > 0) handR.lerp(toRoot(U.boltKnob).add(new THREE.Vector3(0.012, 0.01, 0.02)), boltReach);
    if (U.slide && rack > 0) handR = handR; // right hand stays; left racks the slide
    let handL = toRoot(U.gripL);
    if (leftReach > 0) handL.lerp(new THREE.Vector3(-0.05, -0.45, -0.2), leftReach);
    // The support hand leaves the gun (e.g. to hold a phone): it drops away low left, out of view.
    const leftOff = Math.max(0, Math.min(1, st.leftOff || 0));
    if (leftOff > 0) handL.lerp(new THREE.Vector3(-0.24, -0.66, -0.1), smoothstep(0, 1, leftOff));
    // Bipod: the support hand slides forward to the legs, flicks them, and comes back.
    if (U.bipod && (st.bipodState === 'deploying' || st.bipodState === 'stowing')) {
      const u = st.bipodU || 0;
      const reach = st.bipodState === 'deploying'
        ? smoothstep(0, 0.28, u) * (1 - smoothstep(0.72, 1, u))
        : smoothstep(0, 0.2, u) * (1 - smoothstep(0.6, 0.95, u));
      const legs = toRoot(U.bipod.mount).add(new THREE.Vector3(0, -0.035 - 0.06 * (st.bipodT || 0), 0.03));
      handL.lerp(legs, reach);
    }
    if (supReach > 0) handL.lerp(toRoot(can).add(new THREE.Vector3(-0.012, -0.022, 0.01)), supReach);
    // A caller can take the support hand elsewhere (Deadeye: it holds the lowered rifle).
    if (st.leftHand) handL = st.leftHand.clone();
    if (rack > 0 && !U.bolt) handL.lerp(toRoot(U.slide || U.gripL).add(new THREE.Vector3(0, 0.02, 0.06)), rack);
    const fR = fwd.clone().add(new THREE.Vector3(0, -0.25, 0)).normalize();
    const fL = pistol ? fwd.clone().add(new THREE.Vector3(0.4, -0.15, 0)).normalize() : fwd.clone().add(new THREE.Vector3(0.15, 0.25, 0)).normalize();
    // Canted: the shoulders sit lower and further back, so the arms come up from below.
    const shR = pistol ? new THREE.Vector3(0.22, -0.46, 0.12).lerp(new THREE.Vector3(0.16, -0.62, 0.02), cantK) : new THREE.Vector3(0.24, -0.3, 0.16);
    const shL = pistol ? new THREE.Vector3(-0.2, -0.46, 0.12).lerp(new THREE.Vector3(-0.12, -0.64, 0.0), cantK) : new THREE.Vector3(-0.1, -0.42, 0.02);
    this.armR.pose(shR, handR, boltReach > 0 ? fR.lerp(new THREE.Vector3(-0.3, 0, -1).normalize(), boltReach).normalize() : fR, new THREE.Vector3(0.6, -1, 0.1).normalize());
    this.armL.pose(shL, handL, fL, new THREE.Vector3(-0.8, -1, 0.3).normalize());
  }
}

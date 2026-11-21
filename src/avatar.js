import * as THREE from 'three';
import { withHaze } from './atmosphere.js';
import { RULES } from './rules.js';
import { buildChicken } from './chicken.js';

// Stance: 0 stand, 1 crouch (kneeling), 2 prone.
// Local space: feet at origin, facing -Z.
const CAPS = [
  {
    head: [[0, 1.6, -0.02], [0, 1.6, -0.02], 0.15],
    torso: [[0, 0.98, 0], [0, 1.4, 0], 0.24],
    legs: [[0, 0.12, 0], [0, 0.9, 0], 0.19],
  },
  {
    head: [[0, 1.12, -0.18], [0, 1.12, -0.18], 0.15],
    torso: [[0, 0.62, 0.05], [0, 0.98, -0.1], 0.25],
    legs: [[0, 0.12, -0.35], [0, 0.55, 0.05], 0.2],
  },
  {
    // Up on the elbows: head raised behind the scope, chest off the ground.
    head: [[0, 0.5, -0.5], [0, 0.5, -0.5], 0.15],
    torso: [[0, 0.21, 0.12], [0, 0.34, -0.3], 0.23],
    legs: [[0, 0.16, 0.22], [0, 0.15, 1.0], 0.17],
  },
];

export const AIM_POS = [
  [0.0, 1.42, -0.08],
  [0.0, 0.98, -0.2],
  [0.0, 0.28, -0.72],
];

export function worldCapsules(pos, yaw, stance, out = []) {
  const c = CAPS[stance] || CAPS[0];
  const cs = Math.cos(yaw), sn = Math.sin(yaw);
  const tf = (l) => new THREE.Vector3(pos.x + l[0] * cs + l[2] * sn, pos.y + l[1], pos.z - l[0] * sn + l[2] * cs);
  out.length = 0;
  for (const part of ['head', 'torso', 'legs']) {
    const [a, b, r] = c[part];
    out.push({ part, a: tf(a), b: tf(b), r: r * (RULES.hitbox || 1) });
  }
  return out;
}

// World position of the scope's objective lens (for glint).
export function scopePoint(pos, yaw, pitch, stance, out = new THREE.Vector3()) {
  const a = AIM_POS[stance] || AIM_POS[0];
  const cs = Math.cos(yaw), sn = Math.sin(yaw);
  const fx = -sn * Math.cos(pitch), fy = Math.sin(pitch), fz = -cs * Math.cos(pitch);
  return out.set(pos.x + a[2] * sn + fx * 0.35, pos.y + a[1] + 0.1 + fy * 0.35, pos.z + a[2] * cs + fz * 0.35);
}

// ---------------------------------------------------------------------------
// Materials & geometry helpers
// ---------------------------------------------------------------------------
const PAL = {
  fatigue: '#4b4e3a',
  fatigueDark: '#3e4131',
  vest: '#57553f',
  pouch: '#4a4936',
  glove: '#2e2c27',
  boot: '#2a2623',
  face: '#5a4c40',
  paint: '#363b2b',
  hat: '#5b5b40',
  steel: '#25262a',
  furniture: '#4c4a3a',
  lens: '#1a1f2e',
  rig: '#5a573f',
  web: '#45432f',
  tab: '#7c6b4c',
  mag: '#2a2b2e',
  can: '#3d4a35',
};
const GHILLIE = ['#4c5434', '#57603a', '#3c452e', '#646044', '#474530', '#5b6640', '#41492f'];

const matCache = new Map();
function mat(hex, flat = false) {
  const key = hex + flat;
  if (!matCache.has(key)) {
    matCache.set(key, withHaze(new THREE.MeshLambertMaterial({ color: hex, flatShading: flat }), { key: flat ? 'avatarF' : 'avatar' }));
  }
  return matCache.get(key);
}
let ghillieMat = null;
function ghillieMaterial() {
  return (ghillieMat ||= withHaze(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide }), { key: 'ghillie' }));
}

function mesh(geo, hex, flat = false) {
  const m = new THREE.Mesh(geo, mat(hex, flat));
  m.castShadow = true;
  m.userData.hex = hex;
  m.userData.flat = flat;
  return m;
}

// Capsule spanning two points (in the parent's space), optionally tapered.
const UP = new THREE.Vector3(0, 1, 0);
function limb(a, b, r, hex, r2 = r) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const len = Math.max(A.distanceTo(B), 0.001);
  const geo = r2 === r ? new THREE.CapsuleGeometry(r, len, 4, 10) : taper(r, r2, len);
  const m = mesh(geo, hex);
  m.position.copy(A).add(B).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(UP, B.clone().sub(A).normalize());
  return m;
}

// Tapered capsule: r1 at the start (bottom, -Y), r2 at the end (+Y).
function taper(r1, r2, len) {
  const g = new THREE.CylinderGeometry(r2, r1, len, 10, 1, true);
  const top = new THREE.SphereGeometry(r2, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, len / 2, 0);
  const bot = new THREE.SphereGeometry(r1, 10, 5, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2).translate(0, -len / 2, 0);
  return merge([g, top, bot]);
}

function merge(geos) {
  const parts = geos.map((g) => (g.index ? g.toNonIndexed() : g));
  const total = parts.reduce((n, g) => n + g.attributes.position.count, 0);
  const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3);
  const hasCol = parts.every((g) => g.attributes.color);
  const col = hasCol ? new Float32Array(total * 3) : null;
  let o = 0;
  for (const g of parts) {
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    if (col) col.set(g.attributes.color.array, o * 3);
    o += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  if (col) out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return out;
}

// A clump of jute strands hanging from an anchor box. area = [cx,cy,cz, sx,sy,sz].
function strands(rng, count, area, lenRange, droop) {
  const geos = [];
  const c = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const len = lenRange[0] + rng() * (lenRange[1] - lenRange[0]);
    const g = new THREE.ConeGeometry(0.012 + rng() * 0.016, len, 3, 1).toNonIndexed();
    g.rotateX(Math.PI); // point down
    g.translate(0, -len / 2, 0); // hang from the root
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(area[0] + (rng() - 0.5) * area[3], area[1] + (rng() - 0.5) * area[4], area[2] + (rng() - 0.5) * area[5]),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(droop[0] + (rng() - 0.5) * 0.45, 0, droop[1] + (rng() - 0.5) * 0.45, 'YXZ')),
      new THREE.Vector3(1, 1, 1),
    );
    g.applyMatrix4(m);
    c.set(GHILLIE[Math.floor(rng() * GHILLIE.length)]).multiplyScalar(0.85 + rng() * 0.3);
    const n = g.attributes.position.count;
    const cols = new Float32Array(n * 3);
    for (let k = 0; k < n; k++) { cols[k * 3] = c.r; cols[k * 3 + 1] = c.g; cols[k * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    geos.push(g);
  }
  return merge(geos);
}

function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Outfits: 'ghillie' (default) and 'wraith' (balaclava, goggles, helmet).
// Any outfit can wear the thermal poncho; the wraith wears a cloth one anyway.
// ---------------------------------------------------------------------------
export const DEFAULT_LENS = '#e0283a';
export const HATS = { boonie: 'Boonie', helmet: 'Helmet', cap: 'Cap', capback: 'Cap (back)', beanie: 'Beanie', none: 'None' };
export const EYEWEAR = { glasses: 'Glasses', goggles: 'Goggles', visor: 'Visor', none: 'None' };
export const DEFAULT_GEAR = { ghillie: { hat: 'boonie', eyes: 'glasses' }, wraith: { hat: 'helmet', eyes: 'goggles' } };
export const LENS_COLORS = ['#e0283a', '#ff8a1f', '#f2d23c', '#3cf28a', '#38d6f2', '#8a5cff', '#f23ca8', '#1b1d22'];
export const OUTFITS = {
  wraith: { name: 'Wraith', desc: 'Balaclava and respirator. Helmet and goggles by default.' },
  ghillie: { name: 'Ghillie', desc: 'Jute ghillie and painted face. Boonie and glasses by default.' },
};
const WRAITH_MAP = {
  [PAL.glove]: '#1d1e20',
  [PAL.boot]: '#1c1b1b',
  [PAL.face]: '#1f2022', // balaclava
};
// Operator theme: these parts take the theme colour, keeping their light/dark relationships.
const THEMED = new Set([PAL.fatigue, PAL.fatigueDark, PAL.vest, PAL.pouch, PAL.rig, PAL.web, PAL.hat, PAL.can]);
// Load-bearing kit that takes look.gear (e.g. flat dark earth over multicam black).
const GEAR = new Set([PAL.vest, PAL.pouch, PAL.rig, PAL.web]);
let _irMat = null;
function irMarkMat() {
  if (!_irMat) _irMat = withHaze(new THREE.MeshLambertMaterial({ color: '#6e2424', emissive: '#3a0c0c', emissiveIntensity: 0.6 }), { key: 'avatarIR' });
  return _irMat;
}
// The KR-50 Nightjar for third person (matches the first-person model): slab receiver, boxy
// shroud, a fat suppressor, scope, stock and magazine. Muzzle at z ≈ -1.31 like the valley rifle.
function buildKR50TP() {
  const g = new THREE.Group();
  const M = (hex) => withHaze(new THREE.MeshLambertMaterial({ color: hex }), { key: 'avatar' });
  const body = M('#2a2d31'), dark = M('#17181b'), hi = M('#3a3e44');
  const box = (w, h, d, m, x, y, z, rx = 0) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.rotation.x = rx; g.add(o); return o; };
  const cyl = (r, len, m, x, y, z) => { const o = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 14).rotateX(Math.PI / 2), m); o.position.set(x, y, z); g.add(o); return o; };
  box(0.075, 0.085, 0.42, body, 0, 0.01, -0.12);
  box(0.08, 0.03, 0.42, hi, 0, 0.06, -0.12);
  box(0.07, 0.075, 0.62, body, 0, 0.0, -0.62);
  box(0.074, 0.02, 0.6, dark, 0, 0.045, -0.62);
  cyl(0.042, 0.38, dark, 0, 0.0, -1.12);
  cyl(0.03, 0.34, dark, 0, 0.115, -0.14);
  cyl(0.038, 0.06, dark, 0, 0.115, -0.33);
  box(0.03, 0.05, 0.04, dark, 0, 0.08, -0.06);
  box(0.055, 0.13, 0.3, body, 0, -0.03, 0.22);
  box(0.045, 0.06, 0.12, dark, 0, -0.065, 0.33);
  box(0.035, 0.11, 0.05, dark, 0, -0.08, 0.04, 0.3);
  box(0.05, 0.13, 0.09, dark, 0, -0.09, -0.13);
  return g;
}
// Tactical colour schemes only. Patterned ones (multicam, digital) are drawn by a camo shader.
export const THEMES = {
  ranger: { name: 'Ranger green', base: '#4b4e3a' },
  fde: { name: 'Flat dark earth', base: '#6b5d47' },
  gray: { name: 'Dark gray', base: '#37393c' },
  black: { name: 'Black', base: '#202124' },
  mcblack: { name: 'Multicam black', base: '#2b2c2e', pattern: 0, colors: ['#2b2c2e', '#1a1b1c', '#3c3d3d', '#4b4c49', '#121314'] },
  ocp: { name: 'Multicam OCP', base: '#5c5644', pattern: 0, colors: ['#5c5644', '#454b3b', '#4f4335', '#6c6752', '#29281f'] },
  urban: { name: 'Urban digital', base: '#45484b', pattern: 1, colors: ['#4a4d50', '#303336', '#606366', '#777a7c', '#1f2124'] },
  urbandark: { name: 'Urban digital (dark)', base: '#2f3336', pattern: 1, colors: ['#33373b', '#1f2225', '#454a4f', '#585d62', '#141618'] },
};
export const THEME_DEFAULT = { ghillie: 'ranger', wraith: 'mcblack' };
export function themeOf(id, outfit = 'ghillie') {
  return THEMES[id] ? id : THEME_DEFAULT[outfit === 'wraith' ? 'wraith' : 'ghillie'];
}
// Parts that carry the camo print when the theme is patterned (the rest take its base colour).
const PRINTED = new Map([[PAL.fatigue, 1], [PAL.fatigueDark, 0.85], [PAL.vest, 1.05], [PAL.rig, 1.08], [PAL.hat, 1.1]]);

const CAMO_GLSL = /* glsl */ `
varying vec3 vCamo;
uniform vec3 uCamo0; uniform vec3 uCamo1; uniform vec3 uCamo2; uniform vec3 uCamo3; uniform vec3 uCamo4;
uniform float uCamoDigital; uniform float uCamoShade;
float camoH(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float camoN(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(camoH(i), camoH(i + vec3(1, 0, 0)), f.x), mix(camoH(i + vec3(0, 1, 0)), camoH(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(camoH(i + vec3(0, 0, 1)), camoH(i + vec3(1, 0, 1)), f.x), mix(camoH(i + vec3(0, 1, 1)), camoH(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
float camoE(float n, float t) { return uCamoDigital > 0.5 ? step(t, n) : smoothstep(t - 0.025, t + 0.025, n); }
vec3 camoColor(vec3 p) {
  if (uCamoDigital > 0.5) p = floor(p * 30.0) / 30.0;
  vec3 c = uCamo0;
  c = mix(c, uCamo1, camoE(camoN(p * 6.0 + 3.1), 0.55));
  c = mix(c, uCamo2, camoE(camoN(p * 10.0 + 7.7), 0.6));
  c = mix(c, uCamo3, camoE(camoN(p * 15.0 + 1.3), 0.66));
  c = mix(c, uCamo4, camoE(camoN(p * 22.0 + 5.9), 0.72));
  return c * uCamoShade;
}
`;
const camoCache = new Map();
// Lambert material printed with a theme's camo (object-space, so it rides with the body).
export function camoMaterial(id, shade = 1, emissive = 0) {
  const key = id + shade + ':' + emissive;
  if (camoCache.has(key)) return camoCache.get(key);
  const T = THEMES[id];
  const uniforms = { uCamoDigital: { value: T.pattern }, uCamoShade: { value: shade } };
  T.colors.forEach((c, i) => (uniforms['uCamo' + i] = { value: new THREE.Color(c) }));
  const m = withHaze(new THREE.MeshLambertMaterial({ color: '#ffffff', emissive: emissive ? '#ffffff' : '#000000', emissiveIntensity: emissive }), {
    key: 'camo' + key,
    uniforms,
    parsVertex: 'varying vec3 vCamo;',
    vertex: 'vCamo = position * vec3(length(modelMatrix[0].xyz), length(modelMatrix[1].xyz), length(modelMatrix[2].xyz));',
  });
  const hz = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    hz(sh, r);
    sh.fragmentShader = sh.fragmentShader
      .replace('void main() {', CAMO_GLSL + '\nvoid main() {')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= camoColor(vCamo);')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance *= camoColor(vCamo);');
  };
  camoCache.set(key, m);
  return m;
}
const _h1 = {}, _h2 = {}, _h3 = {}, _rc = new THREE.Color();
// Recolour `hex` as if `ref` had been `theme` (hue shift, saturation and lightness scale).
export function retint(hex, theme, ref = PAL.fatigue) {
  if (!theme || theme.toLowerCase() === ref.toLowerCase()) return hex;
  _rc.set(hex).getHSL(_h1);
  _rc.set(ref).getHSL(_h2);
  _rc.set(theme).getHSL(_h3);
  // Take the theme's hue; scale saturation gently (greys stay as rich as the theme itself).
  const h = _h3.h;
  const ratio = _h2.s < 0.06 ? 1 : Math.min(1.25, Math.max(0.6, _h1.s / _h2.s));
  const sat = Math.min(1, _h3.s * ratio);
  const l = Math.min(0.92, Math.max(0.025, _h1.l * (_h3.l / Math.max(0.02, _h2.l))));
  return '#' + _rc.setHSL(h, sat, l).getHexString();
}
const CAMO = {
  olive: ['#363c2a', '#454b33', '#535940', '#61633f', '#3d3a2b'],
  urban: ['#1b1c1e', '#2a2c2f', '#424548', '#63676a', '#828586'],
};
const LINING = { foil: '#9fa3a0', dark: '#1e1f1e' };

function hash3(x, y, z) {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(z, 1440662683)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const sm = (t) => t * t * (3 - 2 * t);
  const fx = sm(x - xi), fy = sm(y - yi), fz = sm(z - zi);
  const L = (a, b, t) => a + (b - a) * t;
  const c = (dx, dy, dz) => hash3(xi + dx, yi + dy, zi + dz);
  return L(L(L(c(0, 0, 0), c(1, 0, 0), fx), L(c(0, 1, 0), c(1, 1, 0), fx), fy), L(L(c(0, 0, 1), c(1, 0, 1), fx), L(c(0, 1, 1), c(1, 1, 1), fx), fy), fz);
}
// Blotchy camo: two octaves of value noise per vertex (computed once), mapped to a palette.
const _c2 = new THREE.Color();
function camoNoise(geo, seed) {
  const pos = geo.attributes.position, n = pos.count, out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = pos.getX(i) + seed, y = pos.getY(i), z = pos.getZ(i);
    out[i] = vnoise(x * 4.2, y * 4.2, z * 4.2) * 0.8 + vnoise(x * 11 + 9, y * 11, z * 11) * 0.2;
  }
  return out;
}
function camoFill(arr, noise, pal) {
  const c = new THREE.Color();
  for (let i = 0; i < noise.length; i++) {
    // Soft-edged blotches: steepened blend between neighbouring palette colours.
    const f = Math.max(0, Math.min(pal.length - 1.001, (noise[i] - 0.2) * pal.length * 1.6));
    const k = Math.floor(f);
    let t = f - k;
    t = t < 0.35 ? 0 : t > 0.65 ? 1 : (t - 0.35) / 0.3;
    c.set(pal[k]).lerp(_c2.set(pal[k + 1]), t);
    arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b;
  }
}

// Grid surface from fn(u, v) -> Vector3, wound so its front faces point outward.
function cloth(nu, nv, fn, outward) {
  const pos = [], idx = [];
  for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) pos.push(...fn(i / nu, j / nv).toArray());
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
    const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const mid = (Math.floor(nv / 2) * (nu + 1) + Math.floor(nu / 2));
  const p = new THREE.Vector3().fromBufferAttribute(g.attributes.position, mid);
  const nrm = new THREE.Vector3().fromBufferAttribute(g.attributes.normal, mid);
  if (nrm.dot(outward(p)) < 0) {
    for (let k = 0; k < idx.length; k += 3) [idx[k + 1], idx[k + 2]] = [idx[k + 2], idx[k + 1]];
    g.setIndex(idx);
    g.computeVertexNormals();
  }
  return g;
}

const ponchoMats = {};
function ponchoOuter() {
  return (ponchoMats.outer ||= withHaze(new THREE.MeshLambertMaterial({ vertexColors: true }), { key: 'poncho' }));
}
function ponchoLining(kind) {
  return (ponchoMats[kind] ||= withHaze(new THREE.MeshLambertMaterial({ color: LINING[kind], side: THREE.BackSide }), { key: 'ponchoL' }));
}

// Poncho in spine space (hip joint at origin, shoulders ~y 0.47, back is +Z, left is -X).
// Worn the "Poncho Villa" way: the body hangs behind the arms and down the back, and the front
// flap is thrown up over the left shoulder so the chest rig and rifle are clear.
const CAPE_TOP = 0.51, CAPE_LEN = 0.88;
function capeAt(th, y, extra = 0) {
  const k = Math.min(1, Math.max(0, (CAPE_TOP - y) / CAPE_LEN));
  const r = 0.28 + 0.1 * k + extra;
  const k2 = Math.min(1, k / 0.3);
  const back = Math.max(0, Math.cos(th));
  return new THREE.Vector3(Math.sin(th) * r * 1.08, y, Math.cos(th) * r * 0.82 + back * 0.1 * k2 + 0.02);
}
function buildPonchoBody() {
  const parts = [];
  // Main body: from a collar round the neck, over the shoulders, hanging behind the arms.
  const cape = cloth(30, 16, (u, v) => {
    const th = -1.55 + u * 3.1;
    if (v < 0.16) {
      const k = Math.pow(v / 0.16, 0.7);
      const r = 0.13 + 0.15 * k;
      return new THREE.Vector3(Math.sin(th) * r * 1.08, 0.63 - 0.12 * k, Math.cos(th) * r * 0.82 + 0.02);
    }
    const k = (v - 0.16) / 0.84;
    const fold = 0.026 * k * Math.sin(th * 8 + k * 1.7) + 0.01 * k * Math.sin(th * 19);
    const edge = Math.max(0, Math.abs(th) - 1.2) * 0.25 * k; // front edges swing back a little
    return capeAt(th * (1 - edge * 0.4), CAPE_TOP - CAPE_LEN * k + 0.035 * Math.sin(th * 4.5 + 1) * k * k * k, fold);
  }, (p) => new THREE.Vector3(p.x, 0, p.z - 0.02));
  parts.push(cape);
  // The thrown-over front flap: a bunched roll riding on top of the left shoulder...
  const curve = new THREE.CatmullRomCurve3([
    [-0.1, 0.6, -0.05], [-0.2, 0.645, -0.04], [-0.275, 0.62, 0.04], [-0.27, 0.55, 0.15], [-0.22, 0.47, 0.22],
  ].map((a) => new THREE.Vector3(...a)));
  const tmp = new THREE.Vector3();
  const roll = cloth(12, 20, (u, t) => {
    const c = curve.getPointAt(t), tan = curve.getTangentAt(t);
    const n = c.clone().sub(tmp.set(-0.1, 0.42, 0.04)).normalize();
    const w = new THREE.Vector3().crossVectors(tan, n).normalize();
    const n2 = new THREE.Vector3().crossVectors(w, tan).normalize();
    const a = u * Math.PI * 2;
    const taper = Math.min(1, t / 0.2);
    const wd = 0.075 * (0.55 + 0.45 * taper);
    const th = 0.05 * (0.6 + 0.4 * taper) + 0.008 * Math.sin(t * 22);
    return c.clone().addScaledVector(w, Math.cos(a) * wd).addScaledVector(n2, Math.sin(a) * th + 0.01 * Math.sin(a * 3 + t * 17));
  }, (p) => {
    let best = 0, bd = 1e9;
    for (let i = 0; i <= 20; i++) { const d = curve.getPointAt(i / 20).distanceToSquared(p); if (d < bd) { bd = d; best = i / 20; } }
    return p.clone().sub(curve.getPointAt(best));
  });
  parts.push(roll);
  // ...and the rest of the flap hanging down the back-left, over the main body, hem on a slant.
  const sheet = cloth(18, 14, (u, v) => {
    const th = -1.3 + u * 1.15;
    const top = 0.56 - 0.07 * u;
    const bottom = -0.26 + 0.2 * u;
    const y = top + (bottom - top) * v;
    const fold = 0.035 + 0.02 * v * Math.sin(u * 13 + v * 2) + 0.012 * Math.sin(u * 29);
    return capeAt(th, y, fold);
  }, (p) => new THREE.Vector3(p.x, 0, p.z - 0.02));
  parts.push(sheet);
  // Bunched cowl round the neck where the hood meets the body.
  const cowl = new THREE.TorusGeometry(0.135, 0.05, 8, 20).rotateX(Math.PI / 2).scale(1.15, 1, 0.95).translate(0, 0.6, 0.0);
  return { parts, cowl };
}

// Rounded slab (bevelled box) centred on the origin: plates, pouches, holsters.
function slab(w, h, d, r = 0.012) {
  const b = Math.min(r, d / 3, w / 3, h / 3);
  const sh = new THREE.Shape();
  const x = -w / 2 + b, y = -h / 2 + b, W = w - 2 * b, H = h - 2 * b, c = Math.min(b * 1.2, W / 2, H / 2);
  sh.moveTo(x + c, y);
  sh.lineTo(x + W - c, y); sh.quadraticCurveTo(x + W, y, x + W, y + c);
  sh.lineTo(x + W, y + H - c); sh.quadraticCurveTo(x + W, y + H, x + W - c, y + H);
  sh.lineTo(x + c, y + H); sh.quadraticCurveTo(x, y + H, x, y + H - c);
  sh.lineTo(x, y + c); sh.quadraticCurveTo(x, y, x + c, y);
  const g = new THREE.ExtrudeGeometry(sh, { depth: Math.max(0.001, d - 2 * b), bevelEnabled: true, bevelThickness: b, bevelSize: b * 0.9, bevelSegments: 2, curveSegments: 3 });
  g.translate(0, 0, -(d - 2 * b) / 2);
  g.computeVertexNormals();
  return g;
}

// Hood in head space (head centre at origin, face toward -Z).
function buildHood() {
  return cloth(22, 14, (u, v) => {
    const b = 0.05 + v * Math.PI * 0.82;
    const open = 0.32 + 0.6 * v; // front opening widens toward the chin
    const a = -(Math.PI - open) + u * 2 * (Math.PI - open);
    const r = 0.152 * (1 + 0.55 * Math.max(0, v - 0.62));
    const front = Math.max(0, -Math.cos(a));
    return new THREE.Vector3(
      Math.sin(a) * Math.sin(b) * r,
      Math.cos(b) * r * 1.12 + 0.015 + 0.02 * Math.max(0, Math.cos(a)) * (1 - v) * (1 - v),
      Math.cos(a) * Math.sin(b) * r * 1.06 + 0.02 - 0.035 * front * (1 - v),
    );
  }, (p) => new THREE.Vector3(p.x, p.y - 0.015, p.z - 0.02));
}

function buildRifle() {
  const r = new THREE.Group();
  const P = PAL;
  const stock = mesh(new THREE.BoxGeometry(0.05, 0.11, 0.3), P.furniture);
  stock.position.set(0, -0.03, 0.06);
  r.add(stock);
  const riser = mesh(new THREE.CapsuleGeometry(0.022, 0.14, 3, 8).rotateX(Math.PI / 2), P.furniture);
  riser.position.set(0, 0.035, 0.06);
  r.add(riser);
  const butt = mesh(new THREE.BoxGeometry(0.055, 0.13, 0.025), P.glove);
  butt.position.set(0, -0.035, 0.22);
  r.add(butt);
  const grip = mesh(new THREE.CapsuleGeometry(0.018, 0.07, 3, 8), P.steel);
  grip.position.set(0, -0.08, -0.06);
  grip.rotation.x = 0.35;
  r.add(grip);
  const recv = mesh(new THREE.BoxGeometry(0.05, 0.065, 0.28), P.steel);
  recv.position.set(0, 0, -0.18);
  r.add(recv);
  const guard = mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.36, 8).rotateX(Math.PI / 2), P.furniture);
  guard.position.set(0, -0.005, -0.48);
  r.add(guard);
  const mag = mesh(new THREE.BoxGeometry(0.035, 0.08, 0.07), P.steel);
  mag.position.set(0, -0.065, -0.2);
  r.add(mag);
  const barrel = mesh(new THREE.CylinderGeometry(0.011, 0.013, 0.42, 8).rotateX(Math.PI / 2), P.steel);
  barrel.position.set(0, 0, -0.86);
  r.add(barrel);
  const brake = mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.07, 8).rotateX(Math.PI / 2), P.steel);
  brake.position.set(0, 0, -1.09);
  r.add(brake);
  const can = mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.22, 12).rotateX(Math.PI / 2), '#2e2f33');
  can.position.set(0, 0, -1.15);
  can.visible = false;
  r.add(can);
  const tube = mesh(new THREE.CylinderGeometry(0.017, 0.017, 0.24, 12).rotateX(Math.PI / 2), P.steel);
  tube.position.set(0, 0.075, -0.2);
  r.add(tube);
  const obj = mesh(new THREE.CylinderGeometry(0.03, 0.019, 0.1, 12).rotateX(Math.PI / 2), P.steel);
  obj.position.set(0, 0.075, -0.35);
  r.add(obj);
  const eye = mesh(new THREE.CylinderGeometry(0.019, 0.025, 0.07, 12).rotateX(Math.PI / 2), P.steel);
  eye.position.set(0, 0.075, -0.05);
  r.add(eye);
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.027, 14), new THREE.MeshBasicMaterial({ color: P.lens }));
  lens.position.set(0, 0.075, -0.401);
  lens.rotation.y = Math.PI;
  r.add(lens);
  const turret = mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.05, 8), P.steel);
  turret.position.set(0, 0.105, -0.2);
  r.add(turret);
  const turret2 = turret.clone();
  turret2.rotation.z = Math.PI / 2;
  turret2.position.set(0.03, 0.075, -0.2);
  r.add(turret2);
  for (const z of [-0.12, -0.27]) {
    const ring = mesh(new THREE.BoxGeometry(0.03, 0.05, 0.02), P.steel);
    ring.position.set(0, 0.045, z);
    r.add(ring);
  }
  const bipod = new THREE.Group();
  for (const s of [-1, 1]) {
    const leg = mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.22, 6), P.steel);
    leg.position.set(s * 0.025, -0.11, 0);
    leg.rotation.z = s * 0.18;
    bipod.add(leg);
  }
  bipod.position.set(0, -0.02, -0.62);
  r.add(bipod);
  r.userData.bipod = bipod;
  r.userData.brake = brake;
  r.userData.can = can;
  const honey = mesh(new THREE.CylinderGeometry(0.031, 0.031, 0.05, 6).rotateX(Math.PI / 2), '#202124');
  honey.position.set(0, 0.075, -0.42);
  honey.visible = false;
  r.add(honey);
  r.userData.honey = honey;
  return r;
}

const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _v4 = new THREE.Vector3();
const _v5 = new THREE.Vector3(), _v6 = new THREE.Vector3(), _v7 = new THREE.Vector3(), _v8 = new THREE.Vector3();
function placeSeg(g, a, b) {
  _v7.subVectors(b, a);
  const L = Math.max(0.001, _v7.length());
  g.m.position.copy(a);
  g.m.quaternion.setFromUnitVectors(UP, _v7.multiplyScalar(1 / L));
  g.m.scale.set(1, L, 1);
  g.ca.position.copy(a);
  g.cb.position.copy(b);
}
// Two-bone IK: elbow from shoulder, hand, bone lengths and a pole direction.
function solveElbow(sh, hand, a, b, pole, out) {
  _v7.subVectors(hand, sh);
  const L = Math.min(a + b - 1e-3, Math.max(Math.abs(a - b) + 1e-3, _v7.length()));
  const dir = _v7.normalize();
  const cosA = (a * a + L * L - b * b) / (2 * a * L);
  const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
  _v8.copy(pole).addScaledVector(dir, -pole.dot(dir)).normalize();
  return out.copy(sh).addScaledVector(dir, a * cosA).addScaledVector(_v8, a * sinA);
}

export class Avatar {
  constructor(accent = '#d89a3a', seed = 7) {
    this.accent = accent;
    const rng = seeded(seed);
    const P = PAL;
    // Goggle / glasses lenses: tinted and faintly lit so the colour reads at dusk.
    this.lensMat = withHaze(new THREE.MeshLambertMaterial({ color: '#e0283a', emissive: '#e0283a', emissiveIntensity: 0.45 }), { key: 'lens' });
    this.root = new THREE.Group();
    this.root.rotation.order = 'YXZ';
    this.body = new THREE.Group();
    this.root.add(this.body);

    // --- Hips & legs (hip joint -> knee joint) ---
    this.hips = new THREE.Group();
    this.body.add(this.hips);
    const pelvis = limb([-0.09, 0.03, 0], [0.09, 0.03, 0], 0.105, P.fatigue);
    pelvis.scale.set(0.9, 1, 1);
    this.hips.add(pelvis);
    const belt = mesh(new THREE.CylinderGeometry(0.165, 0.17, 0.06, 16).scale(1.05, 1, 0.78), P.vest);
    belt.position.set(0, 0.1, 0);
    this.hips.add(belt);
    const mkLeg = (side) => {
      const hip = new THREE.Group();
      hip.position.set(side * 0.1, 0, 0);
      hip.add(limb([0, -0.4, 0.01], [0, -0.02, 0], 0.072, P.fatigue, 0.088));
      const pocket = mesh(new THREE.BoxGeometry(0.05, 0.12, 0.1), P.fatigueDark);
      pocket.position.set(side * 0.08, -0.22, 0);
      hip.add(pocket);
      const knee = new THREE.Group();
      knee.position.set(0, -0.42, 0.01);
      const pad = mesh(new THREE.SphereGeometry(0.045, 10, 6).scale(1, 1.2, 0.55), P.vest);
      pad.position.set(0, 0, -0.055);
      knee.add(pad);
      knee.add(limb([0, -0.36, 0.02], [0, 0, 0], 0.055, P.fatigue, 0.068));
      const ankle = mesh(new THREE.CylinderGeometry(0.06, 0.065, 0.1, 10), P.boot);
      ankle.position.set(0, -0.36, 0.01);
      knee.add(ankle);
      const boot = mesh(new THREE.CapsuleGeometry(0.055, 0.13, 3, 8).rotateX(Math.PI / 2).scale(1, 0.8, 1), P.boot);
      boot.position.set(0, -0.43, -0.04);
      knee.add(boot);
      hip.add(knee);
      hip.userData.knee = knee;
      return hip;
    };
    this.legL = mkLeg(-1);
    this.legR = mkLeg(1);
    this.hips.add(this.legL, this.legR);
    // Battle belt: drop-leg holster with the M18 on the right thigh, dump pouch, smoke cans.
    const at = (geo, hex, parent, x, y, z, rx = 0, ry = 0, rz = 0) => {
      const m = mesh(geo, hex);
      m.position.set(x, y, z);
      m.rotation.set(rx, ry, rz);
      parent.add(m);
      return m;
    };
    const holster = new THREE.Group();
    holster.position.set(0.085, -0.15, -0.005);
    holster.rotation.z = 0.08;
    at(slab(0.03, 0.17, 0.075, 0.012), P.rig, holster, 0.0, 0, 0);
    at(new THREE.TorusGeometry(0.088, 0.01, 5, 18).rotateX(Math.PI / 2), P.web, holster, -0.085, -0.04, 0.0);
    at(new THREE.TorusGeometry(0.085, 0.01, 5, 18).rotateX(Math.PI / 2), P.web, holster, -0.085, 0.06, 0.0);
    at(slab(0.012, 0.16, 0.012, 0.004), P.web, holster, -0.035, 0.12, 0.0, 0, 0, 0.35);
    this.holsterPistol = new THREE.Group();
    at(slab(0.028, 0.035, 0.115, 0.006), '#232428', this.holsterPistol, 0, 0.1, -0.005);
    at(slab(0.026, 0.075, 0.04, 0.008), '#8a7758', this.holsterPistol, 0, 0.125, 0.04, -0.3);
    holster.add(this.holsterPistol);
    this.legR.add(holster);
    at(slab(0.14, 0.11, 0.06, 0.02), P.web, this.hips, -0.06, 0.03, 0.17, 0.1);
    at(slab(0.06, 0.07, 0.05, 0.01), P.rig, this.hips, 0.17, 0.1, 0.08, 0, -0.9);
    const smoke = new THREE.Group();
    smoke.visible = false;
    for (const [x, z] of [[-0.175, -0.04], [-0.185, 0.05]]) {
      at(new THREE.CylinderGeometry(0.027, 0.027, 0.1, 12), P.can, smoke, x, 0.07, z);
      at(new THREE.CylinderGeometry(0.018, 0.022, 0.025, 10), '#8d9088', smoke, x, 0.13, z);
      at(slab(0.006, 0.05, 0.012, 0.003), '#8d9088', smoke, x - 0.025, 0.1, z, 0, 0, 0.1);
    }
    this.hips.add(smoke);
    this.smokeKit = smoke;

    // --- Spine: torso, plate carrier, pack, ghillie ---
    this.spine = new THREE.Group();
    this.hips.add(this.spine);
    const chest = mesh(new THREE.CapsuleGeometry(0.17, 0.3, 4, 12).scale(1.12, 1, 0.72), P.fatigue);
    chest.position.set(0, 0.3, 0);
    this.spine.add(chest);
    // Plate carrier: front/back plates, cummerbund, shoulder straps.
    const carrier = mesh(new THREE.CapsuleGeometry(0.172, 0.2, 4, 12).scale(1.08, 1, 0.76), P.web);
    carrier.position.set(0, 0.33, -0.005);
    this.spine.add(carrier);
    const put = (geo, hex, x, y, z, rx = 0, ry = 0, rz = 0, parent = this.spine) => {
      const m = mesh(geo, hex);
      m.position.set(x, y, z);
      m.rotation.set(rx, ry, rz);
      parent.add(m);
      return m;
    };
    // Vest: plate carrier (plates + cummerbund, triple mag shingle, admin pouch) or an open
    // chest rig (harness and a wide pouch panel holding more magazines).
    this.vests = { plate: new THREE.Group(), rig: new THREE.Group() };
    this.spine.add(this.vests.plate, this.vests.rig);
    const pv = this.vests.plate, rv = this.vests.rig;
    put(slab(0.29, 0.3, 0.055, 0.02), P.rig, 0, 0.37, -0.135, -0.06, 0, 0, pv);
    put(slab(0.29, 0.31, 0.05, 0.02), P.rig, 0, 0.37, 0.13, 0.05, 0, 0, pv);
    put(new THREE.CylinderGeometry(0.2, 0.205, 0.12, 22, 1, true).scale(1.04, 1, 0.8), P.rig, 0, 0.255, 0, 0, 0, 0, pv);
    for (const sx of [-1, 1]) put(slab(0.065, 0.03, 0.27, 0.01), P.rig, sx * 0.11, 0.535, 0.0, 0, 0, sx * -0.18, pv);
    for (let i = -1; i <= 1; i++) {
      put(slab(0.074, 0.1, 0.05, 0.01), P.rig, i * 0.086, 0.26, -0.185, 0, 0, 0, pv);
      put(slab(0.05, 0.04, 0.03, 0.006), P.mag, i * 0.086, 0.325, -0.185, 0, 0, 0, pv);
      put(slab(0.02, 0.035, 0.008, 0.003), P.tab, i * 0.086, 0.35, -0.205, -0.3, 0, 0, pv);
    }
    put(slab(0.19, 0.085, 0.032, 0.01), P.rig, 0, 0.425, -0.172, -0.06, 0, 0, pv);
    put(slab(0.075, 0.04, 0.006, 0.003), accent, 0.04, 0.43, -0.19, -0.06, 0, 0, pv);
    // Chest rig: wide low panel with five mag pouches, a map pocket above, H-harness + back X.
    put(slab(0.36, 0.15, 0.035, 0.015), P.rig, 0, 0.24, -0.15, -0.04, 0, 0, rv);
    for (let i = -2; i <= 2; i++) {
      put(slab(0.064, 0.105, 0.048, 0.01), P.rig, i * 0.07, 0.25, -0.18, -0.04, 0, 0, rv);
      put(slab(0.044, 0.04, 0.028, 0.006), P.mag, i * 0.07, 0.315, -0.178, -0.04, 0, 0, rv);
      put(slab(0.018, 0.032, 0.008, 0.003), P.tab, i * 0.07, 0.34, -0.2, -0.3, 0, 0, rv);
    }
    put(slab(0.2, 0.07, 0.022, 0.008), P.web, 0, 0.355, -0.155, -0.08, 0, 0, rv);
    put(slab(0.06, 0.035, 0.006, 0.003), accent, 0.05, 0.36, -0.168, -0.08, 0, 0, rv);
    for (const sx of [-1, 1]) {
      put(slab(0.045, 0.012, 0.3, 0.004), P.web, sx * 0.1, 0.5, -0.01, -0.2, 0, sx * -0.12, rv); // over the shoulders
      put(slab(0.045, 0.3, 0.012, 0.004), P.web, sx * 0.1, 0.4, -0.145, -0.05, 0, 0, rv); // front straps
      put(slab(0.04, 0.38, 0.012, 0.004), P.web, 0, 0.36, 0.145, 0.05, 0, sx * 0.55, rv); // back X
      put(slab(0.07, 0.11, 0.06, 0.012), P.rig, sx * 0.19, 0.24, -0.09, 0, sx * -0.6, 0, rv); // side utility pouches
    }
    // Tourniquet on the left strap, radio on the left side, med pouch on the right.
    put(new THREE.CylinderGeometry(0.019, 0.019, 0.1, 10), '#1d1d1f', -0.115, 0.49, -0.115, 0.15);
    put(slab(0.025, 0.018, 0.02, 0.004), '#a8402e', -0.115, 0.545, -0.12);
    put(slab(0.06, 0.13, 0.045, 0.01), P.rig, -0.205, 0.33, 0.05, 0, 0.5);
    put(new THREE.CylinderGeometry(0.004, 0.004, 0.38, 4), P.glove, -0.21, 0.56, 0.08, 0.1, 0, 0.12);
    put(slab(0.05, 0.1, 0.07, 0.012), P.rig, 0.205, 0.27, 0.03, 0, -0.5);
    // Assault pack on the back.
    put(slab(0.25, 0.3, 0.11, 0.025), P.vest, 0, 0.34, 0.22);
    put(slab(0.22, 0.08, 0.03, 0.012), P.web, 0, 0.42, 0.285);
    // Kit-dependent gear: each piece is shown when that tool is in the loadout.
    this.kit = {};
    const kitG = (name, parent = this.spine) => { const g = new THREE.Group(); g.visible = false; parent.add(g); this.kit[name] = g; return g; };
    // Spotting quadcopter, folded and strapped to the pack.
    const quad = kitG('drone');
    put(slab(0.12, 0.05, 0.17, 0.015), '#2b2c30', 0, 0.4, 0.31, Math.PI / 2 - 0.15, 0, 0, quad);
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
      put(new THREE.CylinderGeometry(0.006, 0.006, 0.12, 5), '#1f2023', sx * 0.07, 0.4 + sy * 0.07, 0.33, 0, 0, sx * sy * 0.5, quad);
      put(new THREE.CylinderGeometry(0.035, 0.035, 0.006, 12).rotateX(Math.PI / 2), '#3a3b40', sx * 0.1, 0.4 + sy * 0.11, 0.335, 0, 0, 0, quad);
    }
    put(new THREE.CylinderGeometry(0.012, 0.012, 0.01, 8).rotateX(Math.PI / 2), '#ff5d55', 0, 0.36, 0.34, 0, 0, 0, quad);
    // Hunter drone: launch tube slung diagonally across the pack.
    const tube = kitG('hunter');
    const TA = -1.0, tc = [0.0, 0.31, 0.31];
    const along = (k) => [tc[0] - Math.sin(TA) * k, tc[1] + Math.cos(TA) * k, tc[2]];
    put(new THREE.CylinderGeometry(0.048, 0.048, 0.52, 14), '#3d4031', ...tc, 0, 0, TA, tube);
    for (const k of [-0.24, 0.24]) put(new THREE.CylinderGeometry(0.053, 0.053, 0.04, 14), '#25262a', ...along(k), 0, 0, TA, tube);
    put(new THREE.CylinderGeometry(0.054, 0.054, 0.015, 14), accent, ...along(0.15), 0, 0, TA, tube);
    // Recon darts: a pair of dart canisters on the right of the pack.
    const darts = kitG('dart');
    for (const dz of [0, 0.05]) put(new THREE.CylinderGeometry(0.02, 0.02, 0.2, 10), '#2c2e2a', 0.15, 0.36, 0.2 + dz, 0, 0, 0, darts);
    put(new THREE.CylinderGeometry(0.021, 0.021, 0.02, 10), accent, 0.15, 0.47, 0.2, 0, 0, 0, darts);
    // UAV jammer: box with stubby antennas on top of the pack.
    const jam = kitG('jammer');
    put(slab(0.14, 0.06, 0.08, 0.01), '#26272b', 0, 0.52, 0.22, 0, 0, 0, jam);
    for (const sx of [-1, 1]) put(new THREE.CylinderGeometry(0.006, 0.004, 0.14, 5), '#1a1a1c', sx * 0.05, 0.6, 0.22, 0, 0, sx * 0.25, jam);
    put(new THREE.SphereGeometry(0.008, 6, 4), '#58ff8a', 0.03, 0.555, 0.18, 0, 0, 0, jam);
    // Decoy: rolled mannequin strapped under the pack.
    const dec = kitG('decoy');
    put(new THREE.CylinderGeometry(0.06, 0.06, 0.32, 14).rotateZ(Math.PI / 2), P.tab, 0, 0.17, 0.25, 0, 0, 0, dec);
    for (const sx of [-1, 1]) put(new THREE.CylinderGeometry(0.063, 0.063, 0.02, 14).rotateZ(Math.PI / 2), '#26272b', sx * 0.1, 0.17, 0.25, 0, 0, 0, dec);
    for (const s of [-1, 1]) {
      const sh = mesh(new THREE.SphereGeometry(0.078, 10, 8), P.fatigue);
      sh.position.set(s * 0.2, 0.47, 0.01);
      this.spine.add(sh);
    }
    const drape = new THREE.Mesh(
      merge([
        strands(rng, 110, [0, 0.56, 0.1, 0.44, 0.04, 0.2], [0.18, 0.4], [0.18, 0]),
        strands(rng, 70, [0, 0.4, 0.24, 0.34, 0.28, 0.04], [0.16, 0.34], [0.12, 0]),
        strands(rng, 40, [-0.22, 0.5, 0.0, 0.05, 0.05, 0.16], [0.12, 0.26], [0, 0.25]),
        strands(rng, 40, [0.22, 0.5, 0.0, 0.05, 0.05, 0.16], [0.12, 0.26], [0, -0.25]),
      ]),
      ghillieMaterial(),
    );
    drape.castShadow = true;
    this.spine.add(drape);
    this.ghilliePart = drape;

    // --- Head: painted face, boonie hat, ghillie veil ---
    this.neck = new THREE.Group();
    this.neck.position.set(0, 0.58, -0.01);
    this.spine.add(this.neck);
    this.neck.add(limb([0, 0, 0], [0, 0.07, -0.01], 0.055, P.face));
    const head = new THREE.Group();
    head.position.set(0, 0.15, -0.02);
    head.add(mesh(new THREE.SphereGeometry(0.105, 14, 10).scale(0.92, 1.08, 1), P.face));
    // Camo paint band across the eyes.
    const paint = mesh(new THREE.SphereGeometry(0.107, 14, 10, Math.PI * 0.6, Math.PI * 0.8, Math.PI * 0.36, Math.PI * 0.26).scale(0.92, 1.08, 1), P.paint);
    head.add(paint);
    const nose = mesh(new THREE.ConeGeometry(0.018, 0.04, 5).rotateX(-Math.PI / 2), P.face);
    nose.position.set(0, -0.005, -0.1);
    head.add(nose);
    const brim = mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.012, 16), P.hat);
    brim.position.set(0, 0.06, 0);
    head.add(brim);
    const crown = mesh(new THREE.CylinderGeometry(0.095, 0.108, 0.1, 14), P.hat);
    crown.position.set(0, 0.11, 0);
    head.add(crown);
    const veil = new THREE.Mesh(strands(rng, 60, [0, 0.07, 0.05, 0.32, 0.02, 0.26], [0.1, 0.22], [0.12, 0]), ghillieMaterial());
    head.add(veil);
    this.veil = veil;
    // Headwear options (boonie / helmet / cap / backwards cap / beanie / none) and eyewear
    // (glasses / goggles / visor / none). The helmet is built below with the wraith kit.
    this.hats = { boonie: new THREE.Group() };
    this.hats.boonie.add(brim, crown, veil);
    head.add(this.hats.boonie);
    const cap = new THREE.Group();
    const capCrown = mesh(new THREE.SphereGeometry(0.114, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.42).scale(0.95, 0.95, 1.03), P.hat);
    capCrown.position.y = 0.035;
    cap.add(capCrown);
    // A proper ball-cap brim: wide, curved a little, and sticking well out over the eyes.
    const capBill = mesh(new THREE.CylinderGeometry(0.095, 0.095, 0.009, 20, 1, false, Math.PI / 2, Math.PI).scale(0.98, 1, 1.45), P.hat);
    capBill.position.set(0, 0.052, -0.088);
    capBill.rotation.x = -0.1;
    cap.add(capBill);
    const capButton = mesh(new THREE.SphereGeometry(0.01, 6, 4), P.web);
    capButton.position.y = 0.143;
    cap.add(capButton);
    const capPatch = mesh(slab(0.04, 0.025, 0.006, 0.003), P.web);
    capPatch.position.set(0, 0.085, -0.106);
    capPatch.rotation.x = 0.35;
    cap.add(capPatch);
    head.add(cap);
    this.hats.cap = cap;
    // Comms headset (flat dark earth) with a boom mic across to the mouth.
    const hs = (this.headset = new THREE.Group());
    const hsFde = '#6b5d45';
    for (const sx of [-1, 1]) {
      const hsCup = mesh(new THREE.CylinderGeometry(0.048, 0.048, 0.034, 14).rotateZ(Math.PI / 2), hsFde);
      hsCup.position.set(sx * 0.118, -0.005, 0.005);
      hs.add(hsCup);
    }
    const hsBand = mesh(new THREE.TorusGeometry(0.122, 0.009, 6, 18, Math.PI).rotateY(Math.PI / 2).rotateX(Math.PI / 2), hsFde);
    hsBand.rotation.set(0, 0, 0);
    hsBand.position.set(0, 0.0, 0.03);
    hsBand.rotation.z = Math.PI / 2;
    hs.add(hsBand);
    const hsBoom = mesh(new THREE.CylinderGeometry(0.0045, 0.0045, 0.13, 6).rotateX(Math.PI / 2), '#222');
    hsBoom.position.set(-0.1, -0.045, -0.06);
    hsBoom.rotation.y = -0.55;
    hs.add(hsBoom);
    const hsMic = mesh(new THREE.SphereGeometry(0.013, 8, 6), '#1a1a1a');
    hsMic.position.set(-0.045, -0.06, -0.115);
    hs.add(hsMic);
    hs.visible = false;
    head.add(hs);
    // Covert earpiece: a clear coiled tube from the right ear down into the collar.
    const epPts = [];
    for (let i = 0; i <= 40; i++) { const u = i / 40; epPts.push(new THREE.Vector3(0.112 + Math.cos(u * 40) * 0.006, -0.01 - u * 0.2, 0.02 + Math.sin(u * 40) * 0.006 + u * 0.03)); }
    const coil = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(epPts), 60, 0.003, 5), new THREE.MeshLambertMaterial({ color: '#d8ecff', transparent: true, opacity: 0.5 }));
    const epBud = new THREE.Mesh(new THREE.SphereGeometry(0.011, 8, 6), new THREE.MeshLambertMaterial({ color: '#e8f4ff', transparent: true, opacity: 0.6 }));
    epBud.position.set(0.112, -0.005, 0.015);
    this.earpiece = new THREE.Group();
    this.earpiece.add(coil, epBud);
    this.earpiece.visible = false;
    head.add(this.earpiece);
    const capBack = cap.clone();
    capBack.rotation.y = Math.PI;
    capBack.children.forEach((c) => { if (c.position.z < -0.09) c.visible = false; });
    // Snapback opening and strap, now at the forehead.
    const gap = new THREE.Mesh(new THREE.CircleGeometry(0.03, 12, 0, Math.PI).scale(1.1, 0.9, 1), mat('#26211d'));
    gap.position.set(0, 0.04, 0.109);
    capBack.add(gap); // capBack is turned round, so +Z here is the wearer's front
    const strap = mesh(slab(0.07, 0.012, 0.006, 0.002), P.web);
    strap.position.set(0, 0.046, 0.11);
    capBack.add(strap);
    capBack.children[1].rotation.x = -0.22; // bill rides a little higher at the back
    head.add(capBack);
    this.hats.capback = capBack;
    const beanie = new THREE.Group();
    const knit = mesh(new THREE.SphereGeometry(0.115, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.47).scale(0.95, 1.08, 1.03), P.web);
    knit.position.y = 0.03;
    beanie.add(knit);
    const cuff = mesh(new THREE.TorusGeometry(0.108, 0.014, 6, 22).rotateX(Math.PI / 2).scale(0.94, 1, 1.02), P.web);
    cuff.position.y = 0.05;
    beanie.add(cuff);
    head.add(beanie);
    this.hats.beanie = beanie;
    // Short hair, for a bare-headed ghillie.
    this.hair = new THREE.Mesh(new THREE.SphereGeometry(0.109, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.4).scale(0.94, 1.08, 1.03), mat('#26211d'));
    this.hair.position.set(0, 0.004, 0.006);
    head.add(this.hair);
    // Ghillie: wraparound shooting glasses.
    const glasses = new THREE.Group();
    // Ballistic glasses: two rounded lenses with thin rims, a bridge and arms back to the ears.
    for (const sx of [-1, 1]) {
      const lensG = new THREE.Mesh(new THREE.CircleGeometry(0.021, 18).scale(1.25, 0.8, 1), this.lensMat);
      lensG.position.set(sx * 0.037, 0, -0.107);
      lensG.rotation.y = Math.PI - sx * 0.32;
      glasses.add(lensG);
      const rim = mesh(new THREE.TorusGeometry(0.021, 0.003, 4, 18).scale(1.25, 0.8, 1), '#141416');
      rim.position.copy(lensG.position);
      rim.rotation.copy(lensG.rotation);
      glasses.add(rim);
      const armG = mesh(new THREE.BoxGeometry(0.004, 0.005, 0.095), '#141416');
      armG.position.set(sx * 0.083, 0.008, -0.055);
      armG.rotation.y = sx * 0.12;
      glasses.add(armG);
    }
    const bridge = mesh(new THREE.BoxGeometry(0.018, 0.005, 0.005), '#141416');
    bridge.position.set(0, 0.012, -0.113);
    glasses.add(bridge);
    glasses.position.set(0, 0.02, 0.0);
    head.add(glasses);
    this.eyewear = { glasses };
    // Wraparound visor.
    const visor = new THREE.Group();
    visor.add(new THREE.Mesh(new THREE.CylinderGeometry(0.103, 0.1, 0.03, 18, 1, true, Math.PI * 0.62, Math.PI * 0.76).scale(0.95, 1, 1.02), this.lensMat));
    const vFrame = mesh(new THREE.CylinderGeometry(0.106, 0.106, 0.007, 18, 1, true, Math.PI * 0.6, Math.PI * 0.8).scale(0.95, 1, 1.02), '#151517');
    vFrame.position.y = 0.019;
    visor.add(vFrame);
    visor.position.set(0, 0.018, -0.004);
    head.add(visor);
    this.eyewear.visor = visor;
    this.faceParts = [paint, nose];
    // Wraith: goggles, respirator half-mask (the balaclava is the head recoloured).
    const mask = new THREE.Group();
    const goggles = new THREE.Group();
    const band = mesh(new THREE.TorusGeometry(0.106, 0.011, 6, 22).rotateX(Math.PI / 2).scale(0.93, 1, 1), '#141516');
    band.position.y = 0.02;
    goggles.add(band);
    head.add(goggles);
    this.eyewear.goggles = goggles;
    for (const sx of [-1, 1]) {
      const cup = mesh(new THREE.CylinderGeometry(0.03, 0.034, 0.035, 12).rotateX(Math.PI / 2), '#161718');
      cup.position.set(sx * 0.04, 0.02, -0.098);
      cup.rotation.y = sx * 0.22;
      goggles.add(cup);
      const lens = new THREE.Mesh(new THREE.CircleGeometry(0.025, 14), this.lensMat);
      lens.position.set(sx * 0.043, 0.02, -0.117);
      lens.rotation.y = Math.PI + sx * 0.22;
      goggles.add(lens);
    }
    const resp = mesh(new THREE.SphereGeometry(0.06, 12, 8).scale(1.05, 0.75, 0.7), '#28292b');
    resp.position.set(0, -0.055, -0.075);
    mask.add(resp);
    for (const sx of [-1, 1]) {
      const filt = mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.02, 10).rotateX(Math.PI / 2), '#1a1b1c');
      filt.position.set(sx * 0.04, -0.065, -0.11);
      filt.rotation.y = sx * 0.5;
      mask.add(filt);
    }
    head.add(mask);
    // Wraith: high-cut helmet with NVG shroud and side rails (off when the poncho hood is up).
    const helmet = new THREE.Group();
    const shell = mesh(new THREE.SphereGeometry(0.128, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.42).scale(0.95, 1.0, 1.08), P.rig);
    shell.position.set(0, 0.01, 0.005);
    helmet.add(shell);
    const brimH = mesh(new THREE.CylinderGeometry(0.122, 0.124, 0.022, 18, 1, true, Math.PI * 0.3, Math.PI * 1.4).scale(0.95, 1, 1.08), P.web);
    brimH.position.set(0, 0.055, 0.005);
    helmet.add(brimH);
    for (const sx of [-1, 1]) {
      const rail = mesh(slab(0.012, 0.03, 0.09, 0.004), '#1b1c1e');
      rail.position.set(sx * 0.118, 0.06, 0.01);
      helmet.add(rail);
    }
    const shroud = mesh(slab(0.04, 0.03, 0.02, 0.005), '#1b1c1e');
    shroud.position.set(0, 0.095, -0.125);
    shroud.rotation.x = 0.35;
    helmet.add(shroud);
    const strobe = mesh(slab(0.025, 0.02, 0.03, 0.005), '#1b1c1e');
    strobe.position.set(0, 0.135, 0.07);
    helmet.add(strobe);
    head.add(helmet);
    this.hats.helmet = helmet;
    this.mask = mask;
    this.head = head;
    this.neck.add(head);

    // --- Thermal poncho (shown only when it's in the loadout) ---
    this.poncho = new THREE.Group();
    this.ponchoMeshes = [];
    const pb = buildPonchoBody();
    const addCloth = (geo, parent, lining = true) => {
      const outer = new THREE.Mesh(geo, ponchoOuter());
      outer.castShadow = true;
      outer.userData.noise = camoNoise(geo, seed * 0.37);
      geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 3), 3));
      parent.add(outer);
      this.ponchoMeshes.push(outer);
      if (lining) {
        const inner = new THREE.Mesh(geo, ponchoLining('dark'));
        inner.userData.lining = true;
        parent.add(inner);
        this.ponchoMeshes.push(inner);
      }
    };
    for (const g of pb.parts) addCloth(g, this.poncho);
    addCloth(pb.cowl, this.poncho, false);
    this.spine.add(this.poncho);
    this.hood = new THREE.Group();
    addCloth(buildHood(), this.hood);
    head.add(this.hood);

    // --- Aim group: rifle and arms (pitches with aim) ---
    this.aim = new THREE.Group();
    const rifle = buildRifle();
    rifle.position.set(0.06, 0.1, 0.06);
    this.rifle = rifle;
    this.aim.add(rifle);
    // Arms: hands fixed on the weapon, shoulders follow the body; elbows by two-bone IK
    // each frame, so every stance (prone up on the elbows included) stays connected.
    const seg = (r0, r1, hex) => {
      const m = mesh(new THREE.CylinderGeometry(r1, r0, 1, 10, 1, true).translate(0, 0.5, 0), hex);
      const ca = mesh(new THREE.SphereGeometry(r0, 10, 6), hex);
      const cb = mesh(new THREE.SphereGeometry(r1, 10, 6), hex);
      this.aim.add(m, ca, cb);
      return { m, ca, cb };
    };
    this.arms = [1, -1].map((side) => {
      const glove = mesh(new THREE.SphereGeometry(0.045, 8, 6).scale(1, 0.8, 1.3), P.glove);
      this.aim.add(glove);
      return {
        side,
        upper: seg(0.062, 0.052, P.fatigue),
        fore: seg(0.05, 0.04, P.fatigue),
        band: side < 0 ? seg(0.066, 0.066, accent) : null,
        glove,
        rifleHand: side > 0 ? new THREE.Vector3(0.07, 0.02, 0.0) : new THREE.Vector3(0.05, 0.05, -0.36),
        pistolHand: side > 0 ? new THREE.Vector3(0.04, -0.03, -0.3) : new THREE.Vector3(0.0, -0.04, -0.32),
        proneHand: side > 0 ? new THREE.Vector3(0.07, 0.02, 0.0) : new THREE.Vector3(0.04, -0.07, 0.13),
        shoulderLocal: new THREE.Vector3(side * 0.2, 0.455, 0.02),
      };
    });
    this.root.add(this.aim);
    // Sidearm, shown instead of the rifle when drawn.
    // A real-looking service pistol: slide, frame with a rail and trigger guard, a raked grip
    // with the magazine base, and a suppressor on the muzzle.
    const pistol = new THREE.Group();
    const psSlide = mesh(new THREE.BoxGeometry(0.032, 0.036, 0.19), '#1e1f22');
    psSlide.position.set(0, 0.018, 0);
    pistol.add(psSlide);
    for (let i = 0; i < 5; i++) { const psSr = mesh(new THREE.BoxGeometry(0.034, 0.024, 0.004), '#2c2e31'); psSr.position.set(0, 0.018, 0.07 + i * 0.007); pistol.add(psSr); }
    const psFrame = mesh(new THREE.BoxGeometry(0.03, 0.022, 0.165), '#2a2c2f');
    psFrame.position.set(0, -0.009, -0.01);
    pistol.add(psFrame);
    const psGuard = mesh(new THREE.TorusGeometry(0.019, 0.0035, 5, 10, Math.PI).rotateY(Math.PI / 2), '#2a2c2f');
    psGuard.position.set(0, -0.02, 0.0);
    psGuard.rotation.x = Math.PI;
    pistol.add(psGuard);
    const pg = mesh(new THREE.BoxGeometry(0.03, 0.105, 0.042), '#25272a');
    pg.position.set(0, -0.065, 0.058);
    pg.rotation.x = -0.28; // grip rakes back, bottom toward the shooter
    pistol.add(pg);
    const psBase = mesh(new THREE.BoxGeometry(0.032, 0.012, 0.046), '#1a1b1d');
    psBase.position.set(0, -0.116, 0.074);
    psBase.rotation.x = -0.28;
    pistol.add(psBase);
    const psCan = mesh(new THREE.CylinderGeometry(0.017, 0.017, 0.13, 12).rotateX(Math.PI / 2), '#1a1b1e');
    psCan.position.set(0, 0.016, -0.16);
    pistol.add(psCan);
    pistol.position.set(0.04, 0.0, -0.4);
    pistol.visible = false;
    this.pistol = pistol;
    this.aim.add(pistol);
    // Pollo Hermano: a chicken held by the beak (left hand) and pulled back by the feet (right).
    const held = buildChicken();
    held.position.set(0.05, -0.2, -0.16);
    held.userData.body.scale.z = 1.25;
    held.userData.legs.forEach((L) => (L.rotation.x = -1.35));
    const beakA = new THREE.Object3D();
    beakA.position.set(0, -0.01, -0.1);
    held.userData.head.add(beakA);
    const feetA = new THREE.Object3D();
    feetA.position.set(0, -0.15, 0);
    held.userData.legs[0].add(feetA);
    held.userData.beakA = beakA;
    held.userData.feetA = feetA;
    held.visible = false;
    this.aim.add(held);
    this.heldChick = held;
    this._buildChickenSuit();

    this.walkPhase = 0;
    this.look = null;
    this.setLook({ outfit: 'ghillie', poncho: false });
  }

  setVisible(v) {
    this.root.visible = v;
  }

  // Yellow chicken suit: mascot head, tail fan and big orange feet (the rest of the suit is
  // the uniform recoloured yellow).
  _buildChickenSuit() {
    const Y = '#e9c11d', R = '#d8282a', O = '#f08a1c';
    const put = (parent, geo, hex, x, y, z) => { const m = mesh(geo, hex); m.position.set(x, y, z); parent.add(m); return m; };
    const head = new THREE.Group();
    put(head, new THREE.SphereGeometry(0.155, 18, 14).scale(0.95, 1.05, 1.05), Y, 0, 0.025, 0.005);
    const beak = put(head, new THREE.ConeGeometry(0.045, 0.12, 10).rotateX(-Math.PI / 2), O, 0, 0.005, -0.2);
    beak.scale.y = 0.75;
    put(head, new THREE.ConeGeometry(0.03, 0.07, 8).rotateX(-Math.PI / 2), '#d27414', 0, -0.03, -0.175);
    for (const [y, z, r] of [[0.175, -0.07, 0.035], [0.195, -0.01, 0.042], [0.185, 0.055, 0.036]]) put(head, new THREE.SphereGeometry(r, 10, 8).scale(0.6, 1, 1), R, 0, y, z);
    put(head, new THREE.SphereGeometry(0.03, 10, 8).scale(0.8, 1.5, 0.8), R, 0, -0.08, -0.15);
    for (const sx of [-1, 1]) {
      put(head, new THREE.SphereGeometry(0.032, 10, 8), '#f4f1e8', sx * 0.07, 0.07, -0.125);
      put(head, new THREE.SphereGeometry(0.017, 8, 6), '#121212', sx * 0.076, 0.075, -0.15);
    }
    this.head.add(head);
    const tail = new THREE.Group();
    for (let i = -2; i <= 2; i++) {
      const f = put(tail, new THREE.ConeGeometry(0.035, 0.26, 8), i % 2 ? '#f7e27a' : Y, i * 0.05, 0.12, 0);
      f.rotation.set(0.75, 0, i * 0.3);
    }
    tail.position.set(0, 0.12, 0.27);
    this.spine.add(tail);
    const feet = [];
    for (const leg of [this.legL, this.legR]) {
      const f = new THREE.Group();
      for (const a of [-0.45, 0, 0.45]) {
        const toe = put(f, new THREE.BoxGeometry(0.035, 0.03, 0.16), O, Math.sin(a) * 0.06, 0, -Math.cos(a) * 0.08);
        toe.rotation.y = a;
      }
      f.position.set(0, -0.46, -0.06);
      leg.userData.knee.add(f);
      feet.push(f);
    }
    this.chickenSuit = [head, tail, ...feet];
  }

  // look: { outfit: 'ghillie' | 'wraith', poncho: thermal poncho equipped, lens: '#rrggbb',
  //         theme: '#rrggbb' (operator colour; outfit default if empty),
  //         kit: { scout, stealth, tactical } — shows the matching gear on the body }
  setLook(look = {}) {
    const outfit = look.outfit === 'wraith' ? 'wraith' : 'ghillie';
    const thermal = !!look.poncho;
    const hexOk = (h) => /^#[0-9a-f]{6}$/i.test(h || '');
    const lens = hexOk(look.lens) ? look.lens : DEFAULT_LENS;
    const pollo = !!look.pollo && thermal;
    const themeId = themeOf(look.theme, outfit);
    const T = pollo ? { base: '#d9b21c' } : THEMES[themeId], theme = T.base;
    const kit = look.kit || {};
    const hat = HATS[look.hat] ? look.hat : DEFAULT_GEAR[outfit].hat;
    const eyes = EYEWEAR[look.eyes] ? look.eyes : DEFAULT_GEAR[outfit].eyes;
    const key = [outfit, thermal, pollo, lens, themeId, hat, eyes, look.vest, kit.scout, kit.stealth, kit.tactical, look.ponchoTheme, look.gear, look.headset, look.earpiece, look.rifle, look.irMark].join('|');
    if (this.look === key) return;
    this.look = key;
    const wraith = outfit === 'wraith';
    this.poncho.visible = this.hood.visible = thermal;
    this.ghilliePart.visible = !wraith && !thermal;
    for (const o of this.faceParts) o.visible = !wraith;
    this.mask.visible = wraith;
    // The poncho hood replaces any hat; the boonie keeps its jute veil only on the ghillie.
    for (const [k, g] of Object.entries(this.hats)) g.visible = !thermal && k === hat;
    this.veil.visible = !wraith;
    this.hair.visible = !wraith && !thermal && hat === 'none';
    // Pollo Hermano: the chicken suit replaces the poncho, hood, hat and eyewear.
    this._pollo = pollo;
    for (const o of this.chickenSuit) o.visible = pollo;
    if (pollo) {
      this.poncho.visible = this.hood.visible = false;
      for (const g of Object.values(this.hats)) g.visible = false;
      for (const g of Object.values(this.eyewear)) g.visible = false;
      this.mask.visible = false;
    }
    for (const [k, g] of Object.entries(this.eyewear)) g.visible = k === eyes;
    this.lensMat.color.set(lens);
    this.lensMat.emissive.set(lens);
    for (const [k, g] of Object.entries(this.kit)) {
      g.visible = kit.scout === k || kit.stealth === k || kit.tactical === k;
      g.position.z = thermal ? 0.09 : 0; // strapped on over the poncho
    }
    this.smokeKit.visible = kit.tactical === 'smoke';
    this.headset.visible = !!look.headset;
    this.earpiece.visible = !!look.earpiece;
    // NightWatch rifle: the KR-50 instead of the valley rifle (same one you see in first person).
    if (look.rifle === 'kr50') {
      if (!this._kr50) {
        this._kr50 = buildKR50TP();
        this._rifleParts = this.rifle.children.slice();
        this.rifle.add(this._kr50);
      }
      for (const c of this._rifleParts) c.visible = false;
      this._kr50.visible = true;
    } else if (this._kr50) { this._kr50.visible = false; for (const c of this._rifleParts) c.visible = true; }
    const vest = look.vest === 'rig' ? 'rig' : 'plate';
    this.vests.plate.visible = vest === 'plate';
    this.vests.rig.visible = vest === 'rig';
    const sup = kit.stealth === 'suppressor';
    this.rifle.userData.can.visible = sup && look.rifle !== 'kr50';
    this.rifle.userData.brake.visible = !sup && look.rifle !== 'kr50';
    this.rifle.userData.honey.visible = kit.stealth === 'killflash' && look.rifle !== 'kr50';
    const setMat = (o, m) => {
      if (o.userData.coolMat) o.userData.coolMat = m;
      else o.material = m;
    };
    this.root.traverse((o) => {
      if (!o.isMesh || !o.userData.hex) return;
      let hex = o.userData.hex;
      // IR-reflective markers and armbands: a muted red that glints under IR.
      if (look.irMark && hex === this.accent) return setMat(o, irMarkMat());
      // Load-bearing kit (carrier, rig, pouches, webbing) in its own colour over the uniform.
      if (look.gear && GEAR.has(hex)) return setMat(o, mat(retint(hex, look.gear, PAL.vest), o.userData.flat));
      if (T.colors && PRINTED.has(hex)) return setMat(o, camoMaterial(themeId, PRINTED.get(hex)));
      if (THEMED.has(hex)) hex = retint(hex, theme);
      else if (wraith && WRAITH_MAP[hex]) hex = WRAITH_MAP[hex];
      setMat(o, mat(hex, o.userData.flat));
    });
    // Poncho camo follows the theme: woodland tones for the ghillie, high-contrast urban for the wraith.
    // A poncho can carry its own pattern over the uniform (Sniper Cell: urban digital over multicam black).
    const PT = !pollo && THEMES[look.ponchoTheme] && THEMES[look.ponchoTheme].colors ? THEMES[look.ponchoTheme] : null;
    const pal = PT ? [PT.colors[4], PT.colors[1], PT.colors[0], PT.colors[2], PT.colors[3]] : T.colors ? [T.colors[4], T.colors[1], T.colors[0], T.colors[2], T.colors[3]] : (wraith ? CAMO.urban : CAMO.olive).map((h) => retint(h, theme, THEMES[THEME_DEFAULT[outfit]].base));
    for (const o of this.ponchoMeshes) {
      if (o.userData.lining) setMat(o, ponchoLining(thermal ? 'foil' : 'dark'));
      else {
        camoFill(o.geometry.attributes.color.array, o.userData.noise, pal);
        o.geometry.attributes.color.needsUpdate = true;
      }
    }
  }

  update(dt, s) {
    // s: { p, yaw, pitch, st, moving }
    this.poncho.scale.set(1, 1, 1);
    this.root.position.copy(s.p);
    this.root.rotation.y = s.yaw;
    const st = s.st | 0;
    if (s.moving) this.walkPhase += dt * (st === 2 ? 3 : st === 1 ? 5 : 8);
    const sw = s.moving ? Math.sin(this.walkPhase) : 0;
    const ap = AIM_POS[st];
    this.aim.position.set(ap[0], ap[1], ap[2]);
    this.aim.rotation.x = s.pitch;
    // Low ready (staging): weapon down in front, canted off to the side.
    this.aim.rotation.y = s.lowReady ? (s.w ? 0.25 : 0.55) : 0;
    this.aim.rotation.z = s.lowReady ? (s.w ? 0.1 : 0.35) : 0;
    this._pistolOut = !!s.w;
    this._prone = (s.st | 0) === 2;
    this.rifle.visible = !s.w && !this._pollo;
    this.heldChick.visible = !s.w && !!this._pollo;
    this.pistol.visible = !!s.w;
    this.holsterPistol.visible = !s.w;
    const kL = this.legL.userData.knee, kR = this.legR.userData.knee;
    this.rifle.userData.bipod.rotation.x = st === 2 ? 0.15 : 1.45;
    this.legL.rotation.z = this.legR.rotation.z = 0;
    if (st === 0) {
      this.body.rotation.x = 0;
      this.body.position.set(0, 0, 0);
      this.hips.position.set(0, 0.92, 0.02);
      this.legL.rotation.x = sw * 0.5;
      this.legR.rotation.x = -sw * 0.5;
      kL.rotation.x = -Math.max(0, sw) * 0.7;
      kR.rotation.x = -Math.max(0, -sw) * 0.7;
      this.spine.rotation.x = -0.12;
      this.neck.rotation.x = 0.12 + s.pitch * 0.5;
    } else if (st === 1) {
      // Kneeling: left foot planted forward, right knee on the ground.
      this.body.rotation.x = 0;
      this.body.position.set(0, 0, 0);
      this.hips.position.set(0, 0.52, 0.06);
      this.legL.rotation.x = 1.35 + sw * 0.15;
      kL.rotation.x = -1.4;
      this.legR.rotation.x = -0.15 - sw * 0.15;
      kR.rotation.x = -1.45;
      this.spine.rotation.x = -0.28;
      this.neck.rotation.x = 0.3 + s.pitch * 0.5;
    } else {
      // Prone: body flat, legs spread, head raised to the scope.
      this.body.rotation.x = -Math.PI / 2;
      this.body.position.set(0, 0.17, 0.15);
      this.hips.position.set(0, 0, 0);
      this.legL.rotation.x = sw * 0.12;
      this.legR.rotation.x = -sw * 0.12;
      this.legL.rotation.z = -0.18;
      this.legR.rotation.z = 0.18;
      kL.rotation.x = kR.rotation.x = -0.08;
      // Up on the elbows: chest raised so the eye sits right behind the scope.
      this.spine.rotation.x = 0.475;
      this.neck.rotation.x = 0.3 + s.pitch * 0.6;
      this.poncho.scale.set(1.05, 1, 0.62); // lies flatter over the back when prone
    }
    this._poseArms();
  }

  _poseArms() {
    this.root.updateMatrixWorld(true);
    const sh = _v1, el = _v2, hand = _v3, pole = _v4;
    for (const A of this.arms) {
      sh.copy(A.shoulderLocal);
      this.spine.localToWorld(sh);
      this.aim.worldToLocal(sh);
      // Prone: support hand back under the buttstock (rear-bag grip), elbows down on the ground.
      hand.copy(this._pistolOut ? A.pistolHand : this._prone ? A.proneHand : A.rifleHand);
      if (this._pollo && !this._pistolOut) {
        const anchor = A.side > 0 ? this.heldChick.userData.feetA : this.heldChick.userData.beakA;
        this.aim.worldToLocal(anchor.getWorldPosition(hand));
      }
      if (this._prone) pole.set(A.side * 0.5, -1, 0.4).normalize();
      else pole.set(A.side * 0.8, -1, 0.2).normalize();
      solveElbow(sh, hand, 0.3, 0.29, pole, el);
      placeSeg(A.upper, sh, el);
      placeSeg(A.fore, el, hand);
      if (A.band) {
        _v5.copy(sh).lerp(el, 0.3);
        _v6.copy(sh).lerp(el, 0.5);
        placeSeg(A.band, _v5, _v6);
      }
      A.glove.position.copy(hand);
    }
  }
}

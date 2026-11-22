// GENERATED from the NightWatch bible (tools/render/hero-guns-b.js) by export_hero_to_game.py. Edit there, re-export.
// Hero-tier guns (b) [PROPOSED]: Moth PDW, Hatchet, Wren, Glasscutter, KR-35 Osprey, DM-9 Swift, KR-50 Nightjar,
// P-9 and the Talon karambit, rebuilt at the hero X4 / VX-7 bar (tools/render/hero.js): extruded side profiles with
// fillets and bevels, cut-through slots and windows, lathed barrels, cans and optics, the master toon material with
// bevel wear, and inverted-hull outlines. Design sources: armory.js (proposed models) and Sniper Cell's buildKR50 /
// buildP9 (canon; same layout and anchors). Guns point -Z, 1 unit = 1 m, and carry the hero hand contract
// (userData.handR / handL) so heroOperator({ gun }) can hold them. The Talon carries userData.grip.
import * as THREE from 'three';
import { hm, GLOW, K, outline, shade, decal, decalMesh, RIM } from './hero.js';

const PI = Math.PI;
const V = (x, y, z) => new THREE.Vector3(x, y, z);

// ---------------------------------------------------------------------------------------------
// Palette (same values as hero.js W) and small kit-of-parts helpers
// ---------------------------------------------------------------------------------------------
const W = {
  poly: () => hm('#2c2f33', 'plate', { wear: 0.6 }),
  gm: () => hm('#2a2d31', 'plate', { wear: 0.6 }),
  steel: () => hm('#2b2e33', 'hard'),
  hi: () => hm('#3a3e44', 'hard', { wear: 0.3 }),
  dark: () => hm('#17181b', 'hard', { wear: 0.5 }),
  darkL: () => hm('#17181b', 'hard', { wear: 0.12, spec: 0.6 }),   // lathed parts: little bevel wear (it reads as speckle on round surfaces)
  olive: () => hm('#3b3f36', 'plate', { wear: 0.7, wearCol: '#b0a888' }),
  ranger: () => hm('#3d4232', 'plate', { wear: 0.7, wearCol: '#b0a888' }),
  rangerD: () => hm('#2f3428', 'plate', { wear: 0.6, wearCol: '#b0a888' }),
  fde: () => hm('#5f533e', 'plate', { wear: 0.6, wearCol: '#c9b48e' }),
  fdeD: () => hm('#4a4130', 'plate', { wear: 0.5, wearCol: '#c9b48e' }),
  rubber: () => hm('#121314', 'cloth', { paint: 0.08 }),
  red: () => hm('#a3262c', 'plate', { wear: 0.2, spec: 0.2 }),
};
const glassM = () => new THREE.MeshBasicMaterial({ color: '#3a6a74', transparent: true, opacity: 0.22, depthWrite: false });
const lensM = (c = '#07160e') => { const m = new THREE.MeshBasicMaterial({ color: c }); m.userData.noHull = true; return m; };

// Picatinny strip: base and teeth from s0 to s1 (forward), top of base at y.
function rail(k, s0, s1, y, m, w = 0.026, pitch = 0.0105) {
  k.rb(w * 0.85, 0.006, s1 - s0, 0.0018, m, 0, y - 0.003, -(s0 + s1) / 2);
  const n = Math.floor((s1 - s0 - 0.006) / pitch);
  for (let i = 0; i < n; i++) k.rb(w, 0.0045, pitch * 0.5, 0.0012, m, 0, y + 0.0015, -(s0 + 0.006 + i * pitch));
}
// Rectangular slot path (a cut-through) at s0..s1, y0..y1.
const slot = (s0, s1, y0, y1, r = 0.003) => [[s0, y0, r], [s1, y0, r], [s1, y1, r], [s0, y1, r]];
// Regular polygon path in the side plane.
const poly = (cs, cy, r, n, a0 = 0) => Array.from({ length: n }, (_, i) => { const a = a0 + (i / n) * PI * 2; return [cs + Math.cos(a) * r, cy + Math.sin(a) * r, 0.0015]; });
// Engraving on the right face (x) of a part, centred at forward distance s.
function engrave(g, key, text, w, h, x, y, s, col = '#8d949c') {
  const t = decal(key, 512, 64, (c) => { c.fillStyle = '#fff'; c.font = '600 34px "JetBrains Mono", monospace'; c.textBaseline = 'middle'; c.fillText(text, 6, 34); });
  const d = decalMesh(t, w, h, col); d.position.set(x, y, -s); d.rotation.y = PI / 2; g.add(d); return d;
}
// The X4 grip family (finger grooves, palm swell), in the side plane with its top at y = 0.
const GRIP = [[0.024, 0.0], [0.021, -0.03, 0.008], [0.026, -0.045, 0.006], [0.016, -0.06, 0.008], [0.02, -0.075, 0.006], [0.011, -0.09, 0.008], [0.009, -0.116, 0.005],
  [-0.042, -0.116, 0.008], [-0.034, -0.075, 0.02], [-0.03, -0.025, 0.01], [-0.036, 0.0]];
function grip(parent, s, y, rake, m, w = 0.036, tex = true) {
  const gg = new THREE.Group(); gg.position.set(0, y, -s); gg.rotation.x = -rake; parent.add(gg);
  const k = K(gg); k.side(GRIP, w, m, { bevel: 0.004 });
  if (tex) for (let i = 0; i < 5; i++) k.rb(w + 0.002, 0.0022, 0.01, 0.001, W.dark(), 0, -0.035 - i * 0.014, 0.031);
  k.rb(w + 0.006, 0.006, 0.05, 0.002, W.dark(), 0, -0.118, 0.008);       // base cap
  return gg;
}
// Trigger-guard loop and trigger (X4 family), top at y, front at s1, back at s0.
function guard(k, s0, s1, y, m, tm) {
  const d = s1 - s0;
  k.side([[s0, y], [s1, y, 0.002], [s1 - 0.002, y - 0.012, 0.006], [s1 - 0.014, y - 0.03, 0.01], [s0 + 0.032, y - 0.034, 0.008], [s0 + 0.016, y - 0.022]], 0.024, m,
    { bevel: 0.0015, holes: [[[s0 + 0.026, y - 0.005, 0.002], [s1 - 0.01, y - 0.005, 0.003], [s1 - 0.019, y - 0.023, 0.007], [s0 + 0.036, y - 0.026, 0.005], [s0 + 0.026, y - 0.017, 0.002]]] });
  const ts = s0 + d * 0.55;
  k.side([[ts - 0.003, y - 0.003], [ts + 0.003, y - 0.003], [ts + 0.002, y - 0.013, 0.004], [ts - 0.006, y - 0.022, 0.003], [ts - 0.009, y - 0.02], [ts - 0.004, y - 0.012]], 0.007, tm, { bevel: 0.001 });
}
// Hand specs (copied from the hero X4 / VX-7 and adjusted): pistol grip, vertical foregrip, handguard wrap.
function handGrip(at, rake = 0.2, r = 0.02) {
  return { at, axis: V(0, -Math.cos(rake), Math.sin(rake)), r, back: [0.03, -0.008], arc: [-0.1 * PI, 1.15 * PI], wrist: at.clone().add(V(0.032, 0.009, 0.06)) };
}
function handVert(at, tilt = 0.12, r = 0.016) {
  return { at, axis: V(0, -Math.cos(tilt), -Math.sin(tilt)), r, back: [-0.026, -0.006], arc: [-0.1 * PI, 1.15 * PI], wrist: at.clone().add(V(-0.03, -0.015, 0.064)) };
}
function handWrap(at, r = 0.04) {
  const f = r / 0.04;
  return { at, axis: V(0, 0, -1), r, back: [-0.03 * f, -0.034 * f], arc: [-0.55 * PI, 0.95 * PI], wrist: at.clone().add(V(-0.05 * f, -0.076 * f, 0.06)) };
}
// Shift every vector anchor in a userData by o (for guns built in an offset sub-group).
function shiftAnchors(U, o) {
  for (const k of ['gripR', 'gripL', 'muzzle']) if (U[k]) U[k].add(o);
  for (const k of ['handR', 'handL']) if (U[k]) { U[k].at.add(o); U[k].wrist.add(o); }
  if (typeof U.sight === 'number') U.sight += o.y;
  return U;
}
// Lathed scope: eyepiece, tube, objective bell. s values forward; returns the objective front s.
function scope(k, y, { e0, e1, t0, t1, o1, re = 0.028, rt = 0.022, ro = 0.036 }, m, ring) {
  k.barrel([[0.0001, e0], [re - 0.004, e0], [re, e0 + 0.006], [re, e1 - 0.012], [rt + 0.002, e1], [rt, e1 + 0.004], [rt, t1], [rt + 0.003, t1 + 0.01], [ro, o1 - 0.03], [ro + 0.002, o1 - 0.024], [ro + 0.002, o1 - 0.004], [ro - 0.002, o1], [0.0001, o1]], m, 0, y);
  k.barrel([[re + 0.0012, e0 + 0.02], [re + 0.0022, e0 + 0.022], [re + 0.0022, e0 + 0.04], [re + 0.0012, e0 + 0.042]], ring, 0, y);
  for (const s of [t0 + 0.02, t1 - 0.03]) k.barrel([[rt, s], [rt + 0.0025, s + 0.002], [rt + 0.0025, s + 0.008], [rt, s + 0.01]], ring, 0, y);
}
// Scope ring mount on a rail top yr up to a tube of radius rt at y.
function ringMount(k, s, yr, y, rt, m) {
  k.side([[s - 0.012, yr], [s + 0.012, yr], [s + 0.01, y - rt * 0.6, 0.004], [s - 0.01, y - rt * 0.6, 0.004]], 0.03, m, { bevel: 0.0015 });
  k.add(new THREE.TorusGeometry(rt + 0.0035, 0.0045, 8, 28), m, 0, y, -s);
  k.cyl(0.003, 0.003, 0.012, W.steel(), 0.018, yr + 0.006, -s, 0, 0, PI / 2, 10);
}
function turrets(k, s, y, rt, m, cap) {
  k.cyl(0.014, 0.014, 0.022, m, 0, y + rt + 0.01, -s, 0, 0, 0, 20); k.cyl(0.016, 0.016, 0.01, cap, 0, y + rt + 0.024, -s, 0, 0, 0, 24);
  k.cyl(0.013, 0.013, 0.018, m, rt + 0.008, y, -s, 0, 0, PI / 2, 20); k.cyl(0.015, 0.015, 0.008, cap, rt + 0.02, y, -s, 0, 0, PI / 2, 24);
  for (let i = 0; i < 12; i++) { const a = (i / 12) * PI * 2; k.rb(0.002, 0.008, 0.002, 0.0005, m, Math.cos(a) * 0.0162, y + rt + 0.024, -s + Math.sin(a) * 0.0162); }
}

// ---------------------------------------------------------------------------------------------
// MOTH PDW — top-loading 50-round, integral can (no flash), folding stock. Compact: grip at z ≈ 0.
// ---------------------------------------------------------------------------------------------
export function heroMoth({ folded = false } = {}) {
  const g = new THREE.Group(), k = K(g);
  const poly = W.poly(), steel = W.steel(), dark = W.dark(), rg = W.ranger();
  // Upper (steel): flat top, nose chamfered into the can.
  k.side([[-0.078, 0.0, 0.004], [0.3, 0.0, 0.004], [0.314, 0.014, 0.006], [0.304, 0.036, 0.004], [-0.062, 0.036, 0.004], [-0.08, 0.024, 0.01]], 0.046, steel, { bevel: 0.0025 });
  // Lower (polymer): long slab, swept nose.
  k.side([[-0.084, 0.003, 0.006], [0.316, 0.003, 0.006], [0.322, -0.018, 0.01], [0.302, -0.038, 0.008], [0.0, -0.038, 0.004], [-0.084, -0.03, 0.014]], 0.05, poly, { bevel: 0.003 });
  // Ranger side plates with lightening slots cut through.
  const sl = [0, 1, 2, 3].map((i) => slot(0.07 + i * 0.024, 0.084 + i * 0.024, -0.026, -0.01, 0.003));
  k.side([[0.056, 0.0, 0.006], [0.2, 0.0, 0.006], [0.206, -0.018, 0.008], [0.2, -0.034, 0.006], [0.056, -0.034, 0.006]], 0.0535, rg, { bevel: 0.0015, holes: sl });
  // Molded hand stop (narrower, raked forward) with grip ribs.
  k.side([[0.198, -0.03, 0.004], [0.262, -0.03, 0.004], [0.276, -0.11, 0.01], [0.262, -0.122, 0.008], [0.224, -0.12, 0.008], [0.21, -0.074, 0.016], [0.196, -0.05, 0.01]], 0.034, poly, { bevel: 0.004 });
  for (let i = 0; i < 4; i++) k.rb(0.036, 0.0024, 0.014, 0.001, dark, 0, -0.06 - i * 0.015, -(0.204 + i * 0.0035), 0.12);
  // Top-loading 50-round magazine: smoked shell, windows cut through to the round stack, ribbed top, latch.
  const win = [0, 1, 2, 3, 4, 5].map((i) => slot(0.104 + i * 0.03, 0.122 + i * 0.03, 0.046, 0.062, 0.003));
  k.side([[0.072, 0.034, 0.003], [0.298, 0.034, 0.003], [0.306, 0.05, 0.008], [0.292, 0.075, 0.006], [0.094, 0.075, 0.006], [0.072, 0.062, 0.01]], 0.054, hm('#1e2226', 'plate', { wear: 0.4, spec: 0.5 }), { bevel: 0.0025, holes: win });
  k.rb(0.03, 0.02, 0.2, 0.004, hm('#5e5236', 'hard', { wear: 0.2 }), 0, 0.054, -0.19);        // round stack, seen through the windows
  for (let i = 0; i < 7; i++) k.rb(0.044, 0.003, 0.008, 0.001, dark, 0, 0.0765, -(0.11 + i * 0.026));
  k.rb(0.04, 0.02, 0.014, 0.004, rg, 0, 0.055, -0.302);
  k.rb(0.03, 0.008, 0.008, 0.003, rg, 0, 0.068, -0.31);
  // Sight riser (cut through) with rail teeth, closed reflex sight and green dot.
  k.side([[-0.074, 0.034, 0.002], [0.07, 0.034, 0.002], [0.066, 0.082, 0.006], [-0.062, 0.082, 0.006], [-0.074, 0.07, 0.008]], 0.034, dark,
    { bevel: 0.002, holes: [[[-0.048, 0.044, 0.004], [0.046, 0.044, 0.004], [0.042, 0.07, 0.006], [-0.044, 0.07, 0.006]]] });
  rail(k, -0.06, 0.062, 0.082, dark, 0.03);
  const sy = 0.108;
  k.side([[-0.05, 0.086, 0.002], [0.026, 0.086, 0.002], [0.022, 0.096, 0.003], [-0.046, 0.096, 0.003]], 0.03, dark, { bevel: 0.0015 });
  k.face([[-0.0185, 0.092, 0.003], [0.0185, 0.092, 0.003], [0.0185, 0.122, 0.01], [0.012, 0.13, 0.006], [-0.012, 0.13, 0.006], [-0.0185, 0.122, 0.01]], 0.05, dark,
    { z: 0.012, holes: [[[-0.0145, 0.097, 0.002], [0.0145, 0.097, 0.002], [0.0145, 0.12, 0.007], [-0.0145, 0.12, 0.007]]] });
  k.cyl(0.005, 0.005, 0.006, steel, 0.021, 0.112, 0.01, 0, 0, PI / 2, 16);
  const gl = new THREE.Mesh(new THREE.PlaneGeometry(0.029, 0.023), glassM()); gl.position.set(0, sy, -0.012); g.add(gl);
  k.ball(0.0017, GLOW('#40ffb0', 3), 0, sy, -0.0135);
  // Integral suppressor: core, ten vent bars round it, steel collars, recessed crown. No flash, ever.
  const by = 0.016;
  k.barrel([[0.0001, 0.3], [0.021, 0.3], [0.023, 0.31], [0.023, 0.57], [0.0001, 0.57]], W.darkL(), 0, by);
  for (let i = 0; i < 10; i++) { const a = (i / 10) * PI * 2; k.rb(0.007, 0.0055, 0.2, 0.002, hm('#24272b', 'hard', { wear: 0.15 }), Math.cos(a) * 0.024, by + Math.sin(a) * 0.024, -0.44, 0, 0, a + PI / 2); }
  for (const s of [0.318, 0.548]) k.barrel([[0.0001, s], [0.027, s], [0.0285, s + 0.003], [0.0285, s + 0.014], [0.027, s + 0.017], [0.0001, s + 0.017]], steel, 0, by);
  k.barrel([[0.0001, 0.564], [0.026, 0.564], [0.028, 0.568], [0.028, 0.582], [0.022, 0.588], [0.008, 0.588], [0.006, 0.582], [0.0001, 0.582]], W.darkL(), 0, by);
  k.cyl(0.0058, 0.0058, 0.002, lensM('#050506'), 0, by, -0.5885, PI / 2, 0, 0, 16);
  // Pistol grip (X4 family) with storage cap, trigger guard, trigger.
  grip(g, 0.0, -0.03, 0.18, poly);
  guard(k, 0.0, 0.088, -0.036, poly, steel);
  // Bottom ejection chute (the top is the magazine), with deflector lip.
  k.rb(0.026, 0.006, 0.056, 0.002, dark, 0, -0.0395, -0.14);
  k.rb(0.03, 0.004, 0.008, 0.0015, poly, 0, -0.042, -0.172);
  // Pins, side charging handle (left) and its slot, selector with the red fire mark.
  for (const s of [-0.07, 0.29]) k.cyl(0.0042, 0.0042, 0.052, steel, 0, -0.016, -s, 0, 0, PI / 2, 14);
  k.rb(0.002, 0.008, 0.12, 0.002, dark, -0.0235, 0.02, -0.17);
  k.lathe([[0.0001, 0], [0.007, 0], [0.008, 0.004], [0.0075, 0.016], [0.0001, 0.017]], steel, -0.024, 0.02, -0.215, 0, 0, PI / 2, 16);
  k.rb(0.004, 0.006, 0.024, 0.0015, steel, -0.0265, -0.012, 0.03, 0.4);
  k.cyl(0.0045, 0.0045, 0.004, steel, -0.0262, -0.012, 0.018, 0, 0, PI / 2, 14);
  k.ball(0.0022, W.red(), -0.0275, -0.002, 0.02, 0.4, 1, 1);
  // Sling loop.
  k.torus(0.009, 0.0022, steel, 0, -0.03, 0.09, 0, PI / 2, 0);
  // Folding stock: hinge block and barrel; a ranger skeleton stock with a cut-out and rubber pad. Folds right.
  k.rb(0.04, 0.056, 0.016, 0.005, steel, 0, -0.008, 0.088);
  k.cyl(0.006, 0.006, 0.06, steel, 0.024, -0.008, 0.09, 0, 0, 0, 14);
  const sg = new THREE.Group(); sg.position.set(0.024, 0, 0.092); g.add(sg); const ks = K(sg);
  if (folded) sg.rotation.y = PI - 0.02;
  const o = 0.092;
  ks.side([[-0.096 + o, 0.028, 0.008], [-0.262 + o, 0.036, 0.012], [-0.276 + o, 0.026, 0.006], [-0.276 + o, -0.07, 0.01], [-0.258 + o, -0.078, 0.008], [-0.21 + o, -0.06, 0.02], [-0.096 + o, -0.024, 0.008]], 0.034, rg,
    { bevel: 0.003, x: -0.024, holes: [[[-0.126 + o, 0.016, 0.005], [-0.244 + o, 0.022, 0.008], [-0.25 + o, -0.052, 0.01], [-0.215 + o, -0.042, 0.012], [-0.13 + o, -0.012, 0.008]]] });
  ks.side([[-0.274 + o, 0.036, 0.006], [-0.288 + o, 0.036, 0.004], [-0.29 + o, -0.074, 0.006], [-0.276 + o, -0.08, 0.004]], 0.038, W.rubber(), { bevel: 0.002, x: -0.024 });
  for (let i = 0; i < 6; i++) ks.rb(0.036, 0.003, 0.004, 0.001, W.rubber(), -0.024, -0.064 + i * 0.019, 0.29 - o);
  // Engraving.
  engrave(g, 'moth', 'MOTH  ·  PDW  ·  50', 0.12, 0.015, 0.0256, -0.02, 0.1);
  g.userData = {
    compact: true,
    gripR: V(0, -0.075, 0.01), gripL: V(0, -0.085, -0.236), muzzle: V(0, by, -0.59), sight: sy,
    handR: handGrip(V(0, -0.07, 0.012), 0.18, 0.021),
    handL: handVert(V(0, -0.086, -0.238), 0.14, 0.02),
  };
  shade(g); return g;
}

// ---------------------------------------------------------------------------------------------
// HATCHET — compact pump breacher: pistol grip, no stock, crenellated stand-off, shell saddle (EMP / breach).
// ---------------------------------------------------------------------------------------------
export function heroHatchet() {
  const g = new THREE.Group(), k = K(g);
  const gm = W.gm(), steel = W.steel(), dark = W.dark(), rg = W.ranger();
  // Receiver: slab with a rounded hump at the back and a rear sling plate (no stock).
  k.side([[-0.064, -0.032, 0.008], [0.2, -0.032, 0.004], [0.206, 0.0, 0.004], [0.204, 0.046, 0.004], [0.02, 0.05, 0.01], [-0.04, 0.05, 0.02], [-0.066, 0.02, 0.02]], 0.05, gm, { bevel: 0.003 });
  k.side([[-0.06, -0.026, 0.004], [-0.04, -0.026, 0.004], [-0.04, 0.03, 0.008], [-0.072, 0.03, 0.01], [-0.078, 0.0, 0.008]], 0.034, dark, { bevel: 0.002, holes: [[[-0.066, -0.004, 0.003], [-0.05, -0.004, 0.003], [-0.05, 0.016, 0.004], [-0.066, 0.016, 0.004]]] });
  // Bottom loading/ejection port, takedown pins, cross-bolt safety (red band), slide release.
  k.rb(0.03, 0.005, 0.11, 0.002, dark, 0, -0.033, -0.12);
  for (const s of [-0.02, 0.18]) k.cyl(0.0042, 0.0042, 0.052, steel, 0, -0.018, -s, 0, 0, PI / 2, 14);
  k.cyl(0.0048, 0.0048, 0.058, steel, 0, -0.006, -0.098, 0, 0, PI / 2, 14);
  k.cyl(0.0051, 0.0051, 0.004, W.red(), 0.027, -0.006, -0.098, 0, 0, PI / 2, 14);
  k.rb(0.004, 0.006, 0.02, 0.0015, steel, -0.026, -0.022, -0.06);
  // Barrel, magazine tube, clamp.
  const by = 0.024, my = -0.012;
  k.barrel([[0.0001, 0.2], [0.0178, 0.2], [0.0178, 0.5], [0.0001, 0.5]], W.darkL(), 0, by);
  k.barrel([[0.0001, 0.2], [0.0145, 0.2], [0.0145, 0.44], [0.0155, 0.442], [0.0155, 0.456], [0.011, 0.462], [0.0001, 0.462]], W.darkL(), 0, my);
  k.side([[0.432, -0.03, 0.006], [0.45, -0.03, 0.006], [0.45, 0.044, 0.008], [0.432, 0.044, 0.008]], 0.04, steel, { bevel: 0.002 });
  // Ventilated heat shield over the barrel (oval ports cut through).
  const ports = [0, 1, 2, 3, 4].map((i) => slot(0.236 + i * 0.038, 0.262 + i * 0.038, 0.034, 0.044, 0.005));
  k.side([[0.214, 0.026, 0.004], [0.43, 0.026, 0.004], [0.432, 0.046, 0.006], [0.42, 0.052, 0.006], [0.214, 0.052, 0.006]], 0.04, hm('#202326', 'hard', { wear: 0.6 }), { bevel: 0.002, holes: ports });
  // Pump: ranger forend with grooves and a front hand stop lip; action bars running back.
  const pump = new THREE.Group(); g.add(pump); const kp = K(pump);
  kp.side([[0.236, 0.006, 0.006], [0.392, 0.006, 0.006], [0.402, -0.02, 0.008], [0.414, -0.052, 0.006], [0.4, -0.058, 0.004], [0.384, -0.04, 0.008], [0.25, -0.038, 0.01], [0.236, -0.026, 0.008]], 0.052, rg, { bevel: 0.004 });
  for (let i = 0; i < 6; i++) kp.rb(0.054, 0.028, 0.004, 0.0012, W.rangerD(), 0, -0.016, -(0.262 + i * 0.02));
  for (const sx of [-1, 1]) kp.rb(0.003, 0.006, 0.2, 0.0012, steel, sx * 0.022, -0.004, -0.17);
  // Breaching stand-off: lathed collar with gas vents and six crenellations.
  k.barrel([[0.0001, 0.488], [0.021, 0.488], [0.023, 0.494], [0.023, 0.53], [0.016, 0.532], [0.0001, 0.532]], W.darkL(), 0, by);
  for (let i = 0; i < 6; i++) { const a = (i / 6) * PI * 2 + PI / 6; k.rb(0.008, 0.006, 0.03, 0.0015, steel, Math.cos(a) * 0.0185, by + Math.sin(a) * 0.0185, -0.544, 0, 0, a + PI / 2); }
  for (let i = 0; i < 3; i++) k.rb(0.048, 0.004, 0.006, 0.0015, hm('#0a0a0b', 'hard'), 0, by, -(0.499 + i * 0.011));
  k.cyl(0.0105, 0.0105, 0.002, lensM('#050506'), 0, by, -0.533, PI / 2, 0, 0, 16);
  // Ghost-ring rear (cut-through aperture) and a front post with a red insert.
  k.face([[-0.012, 0.046, 0.002], [0.012, 0.046, 0.002], [0.012, 0.068, 0.006], [0.006, 0.078, 0.004], [-0.006, 0.078, 0.004], [-0.012, 0.068, 0.006]], 0.008, dark,
    { z: -0.02, holes: [poly(0, 0.066, 0.0045, 14).map(([x, y]) => [x, y])] });
  k.side([[0.47, 0.04], [0.49, 0.04], [0.486, 0.068, 0.002], [0.478, 0.068, 0.002]], 0.006, dark, { bevel: 0.001 });
  k.ball(0.0018, W.red(), 0, 0.064, -0.478, 1, 1, 0.6);
  // Pistol grip (raked hard, a breacher's punch angle), trigger guard, trigger.
  grip(g, 0.0, -0.028, 0.32, hm('#1f2124', 'plate', { wear: 0.5 }));
  guard(k, 0.0, 0.09, -0.03, gm, steel);
  // Shell saddle on the right: four shells, coded cyan (EMP slug) and orange (breaching slug).
  k.side([[0.03, -0.024, 0.004], [0.178, -0.024, 0.004], [0.178, 0.036, 0.004], [0.03, 0.036, 0.004]], 0.006, dark, { bevel: 0.0015, x: 0.028 });
  const sc = ['#1f6b78', '#1f6b78', '#93501c', '#93501c'];
  for (let i = 0; i < 4; i++) {
    const z = -(0.05 + i * 0.034);
    k.lathe([[0.0001, -0.03], [0.0102, -0.03], [0.0102, 0.018], [0.0095, 0.022], [0.0001, 0.022]], hm(sc[i], 'plate', { wear: 0.3 }), 0.042, 0.004, z, 0, 0, 0, 20);
    k.lathe([[0.0001, 0.018], [0.0108, 0.018], [0.0108, 0.034], [0.0001, 0.034]], hm('#7a6a48', 'hard', { wear: 0.3 }), 0.042, 0.004, z, 0, 0, 0, 20);
  }
  k.rb(0.006, 0.014, 0.148, 0.002, dark, 0.034, -0.018, -0.104);
  // Sling loop at the rear plate.
  k.torus(0.009, 0.0022, steel, 0, -0.03, 0.074, 0, PI / 2, 0);
  engrave(g, 'hatchet', 'HATCHET  ·  12  ·  BREACH', 0.12, 0.014, 0.0256, -0.018, 0.0);
  g.userData = {
    compact: true,
    gripR: V(0, -0.075, 0.016), gripL: V(0, -0.016, -0.32), muzzle: V(0, by, -0.56), sight: 0.066, pump,
    handR: handGrip(V(0, -0.068, 0.02), 0.32, 0.02),
    handL: handWrap(V(0, -0.016, -0.32), 0.03),
  };
  shade(g); return g;
}

// ---------------------------------------------------------------------------------------------
// WREN — 40 mm revolver launcher: 4-chamber fluted cylinder (smoke, EMP, sticky HE, lantern IR flare).
// ---------------------------------------------------------------------------------------------
export function heroWren() {
  const g = new THREE.Group(), k = K(g);
  const gm = W.gm(), steel = W.steel(), dark = W.dark(), rg = W.ranger();
  const by = 0.03, cy = -0.012, cr = 0.042;
  // Frame: grip block, top strap and bottom strap with the cylinder window cut through.
  k.side([[-0.08, -0.034, 0.01], [0.075, -0.034, 0.006], [0.082, -0.098, 0.012], [0.29, -0.098, 0.012], [0.3, -0.06, 0.01], [0.3, 0.088, 0.008], [0.0, 0.088, 0.008], [-0.08, 0.066, 0.02]], 0.044, gm,
    { bevel: 0.003, holes: [[[0.094, -0.086, 0.01], [0.28, -0.086, 0.01], [0.28, 0.076, 0.01], [0.094, 0.076, 0.01]]] });
  // Cylinder: front profile with four flutes and four chambers, extruded along the bore.
  const cpts = [], N = 64, fl = (a) => { let d = 0; for (let i = 0; i < 4; i++) { const da = Math.atan2(Math.sin(a - (PI / 4 + i * PI / 2)), Math.cos(a - (PI / 4 + i * PI / 2))); d = Math.max(d, Math.exp(-(da * da) / 0.05)); } return d; };
  for (let i = 0; i < N; i++) { const a = (i / N) * PI * 2, r = 0.07 - 0.011 * fl(a); cpts.push([Math.cos(a) * r, cy + Math.sin(a) * r]); }
  const ch = [0, 1, 2, 3].map((i) => { const a = PI / 2 + i * PI / 2; return poly(Math.cos(a) * cr, cy + Math.sin(a) * cr, 0.0205, 20).map(([x, y]) => [x, y]); });
  const cyl = new THREE.Group(); g.add(cyl);
  K(cyl).face(cpts, 0.152, hm('#25282c', 'hard', { wear: 0.0, paint: 0.04 }), { z: -0.181, bevel: 0.003, holes: ch });
  // Rounds in the chambers; colour-coded noses show in the gap ahead of the cylinder.
  const rc = ['#6e736c', '#1f6b78', '#93501c', '#a9adb0'];
  for (let i = 0; i < 4; i++) {
    const a = PI / 2 + i * PI / 2, x = Math.cos(a) * cr, y = cy + Math.sin(a) * cr;
    K(cyl).barrel([[0.0001, 0.104], [0.0195, 0.104], [0.0195, 0.262], [0.017, 0.268], [0.0001, 0.27]], hm(rc[i], 'plate', { wear: 0.25 }), x, y, 20);
  }
  K(cyl).barrel([[0.0001, 0.088], [0.012, 0.088], [0.012, 0.29], [0.0001, 0.29]], steel, 0, cy, 18);   // axle
  K(cyl).barrel([[0.0001, 0.268], [0.016, 0.268], [0.018, 0.274], [0.018, 0.28], [0.0001, 0.28]], steel, 0, cy, 18);
  // Barrel: 40 mm tube with a visible bore and a crowned muzzle.
  k.barrel([[0.021, 0.3], [0.03, 0.3], [0.03, 0.548], [0.0335, 0.552], [0.0335, 0.566], [0.03, 0.57], [0.021, 0.57], [0.021, 0.31]], W.darkL(), 0, by, 32);
  k.cyl(0.021, 0.021, 0.002, lensM('#050506'), 0, by, -0.33, PI / 2, 0, 0, 24);
  // Ranger handguard with M-LOK slots cut through (the tube shows inside), top rail, vertical grip.
  const ml = [0, 1, 2, 3].map((i) => slot(0.33 + i * 0.05, 0.36 + i * 0.05, 0.02, 0.04, 0.004));
  k.side([[0.3, 0.07, 0.004], [0.53, 0.07, 0.008], [0.536, 0.034, 0.01], [0.53, -0.018, 0.008], [0.3, -0.018, 0.004]], 0.074, rg, { bevel: 0.004, holes: ml });
  rail(k, 0.12, 0.53, 0.096, steel, 0.028);
  k.rb(0.026, 0.013, 0.042, 0.004, steel, 0, -0.024, -0.45);
  const fg = k.lathe([[0.0001, 0], [0.0135, 0], [0.015, -0.006], [0.0142, -0.02], [0.0152, -0.035], [0.0142, -0.05], [0.0158, -0.068], [0.0165, -0.078], [0.012, -0.086], [0.0001, -0.087]], W.poly(), 0, -0.028, -0.45, 0.12);
  fg.scale.set(0.85, 1, 1);
  // Reflex sight on the top strap (red dot) and a flip-up range ladder (rungs cut through).
  const sy = 0.122;
  k.side([[0.0, 0.088, 0.002], [0.07, 0.088, 0.002], [0.066, 0.1, 0.003], [0.004, 0.1, 0.003]], 0.032, dark, { bevel: 0.0015 });
  k.face([[-0.0195, 0.096, 0.003], [0.0195, 0.096, 0.003], [0.0195, 0.13, 0.01], [0.012, 0.138, 0.006], [-0.012, 0.138, 0.006], [-0.0195, 0.13, 0.01]], 0.009, dark,
    { z: -0.06, holes: [[[-0.0155, 0.101, 0.002], [0.0155, 0.101, 0.002], [0.0155, 0.128, 0.007], [-0.0155, 0.128, 0.007]]] });
  const gl = new THREE.Mesh(new THREE.PlaneGeometry(0.031, 0.026), glassM()); gl.position.set(0, sy - 0.006, -0.06); g.add(gl);
  k.ball(0.0018, GLOW('#ff3040', 3), 0, sy - 0.006, -0.0655);
  k.side([[0.2, 0.098, 0.002], [0.222, 0.098, 0.002], [0.218, 0.158, 0.004], [0.204, 0.158, 0.004]], 0.004, steel,
    { bevel: 0.0008, x: 0.012, holes: [0, 1, 2, 3].map((i) => slot(0.206, 0.216, 0.106 + i * 0.012, 0.112 + i * 0.012, 0.001)) });
  k.cyl(0.004, 0.004, 0.02, steel, 0.008, 0.099, -0.211, 0, 0, PI / 2, 12);
  // Collapsible stock: buffer tube, ranger skeleton stock, heavy rubber pad.
  k.barrel([[0.0001, -0.08], [0.016, -0.08], [0.016, -0.3], [0.0001, -0.3]], W.darkL(), 0, by);
  for (let i = 0; i < 5; i++) k.rb(0.006, 0.004, 0.008, 0.001, steel, 0, by - 0.017, 0.12 + i * 0.03);
  k.side([[-0.2, 0.074, 0.008], [-0.35, 0.082, 0.012], [-0.372, 0.072, 0.006], [-0.376, -0.072, 0.012], [-0.35, -0.08, 0.008], [-0.3, -0.03, 0.02], [-0.2, 0.0, 0.012]], 0.05, rg,
    { bevel: 0.004, holes: [[[-0.29, 0.056, 0.008], [-0.344, 0.062, 0.008], [-0.352, -0.044, 0.01], [-0.31, -0.01, 0.012]]] });
  k.side([[-0.372, 0.082, 0.006], [-0.39, 0.082, 0.004], [-0.394, -0.08, 0.008], [-0.376, -0.086, 0.004]], 0.054, W.rubber(), { bevel: 0.002 });
  // Grip, trigger guard, cylinder latch, sling loop.
  grip(g, 0.0, -0.03, 0.2, hm('#1f2124', 'plate', { wear: 0.5 }));
  guard(k, -0.004, 0.078, -0.034, gm, steel);
  k.rb(0.008, 0.012, 0.03, 0.003, steel, 0.025, 0.06, -0.07);
  k.torus(0.009, 0.0022, steel, 0, -0.03, 0.07, 0, PI / 2, 0);
  engrave(g, 'wren', 'WREN  ·  40  ·  4 RND', 0.11, 0.014, 0.0234, 0.04, 0.03);
  g.userData = {
    cylinder: cyl,
    gripR: V(0, -0.078, 0.016), gripL: V(0, -0.08, -0.45), muzzle: V(0, by, -0.57), sight: sy - 0.006,
    handR: handGrip(V(0, -0.07, 0.016), 0.2, 0.02),
    handL: handVert(V(0, -0.078, -0.452), 0.12, 0.016),
  };
  shade(g); return g;
}

// ---------------------------------------------------------------------------------------------
// GLASSCUTTER — anti-materiel semi-auto 12.7 mm. Built with the grip at s = 0, then set back so the grip sits at
// z = +0.1 like the VX-7's (the butt meets the shoulder).
// ---------------------------------------------------------------------------------------------
export function heroGlasscutter() {
  const g = new THREE.Group(), b = new THREE.Group(); b.position.z = 0.1; g.add(b); const k = K(b);
  const gm = W.gm(), steel = W.steel(), dark = W.dark(), ol = W.olive();
  const by = 0.006;
  // Lower and upper receivers: deep slab, chamfered nose, big ejection port with a brass deflector.
  k.side([[-0.14, 0.0, 0.004], [0.37, 0.0, 0.004], [0.374, -0.036, 0.008], [0.35, -0.056, 0.01], [0.17, -0.056, 0.006], [0.02, -0.056, 0.006], [-0.14, -0.044, 0.014]], 0.074, gm, { bevel: 0.0035 });
  k.side([[-0.15, -0.002, 0.004], [0.37, -0.002, 0.004], [0.376, 0.03, 0.008], [0.36, 0.062, 0.006], [-0.13, 0.062, 0.006], [-0.152, 0.04, 0.012]], 0.07, steel, { bevel: 0.003 });
  k.rb(0.004, 0.03, 0.11, 0.003, dark, 0.035, 0.028, -0.17);
  k.rb(0.002, 0.024, 0.1, 0.002, steel, 0.0365, 0.028, -0.17);
  k.rb(0.014, 0.026, 0.036, 0.006, gm, 0.036, 0.03, -0.1);
  // Big left-side charging handle.
  k.rb(0.002, 0.01, 0.14, 0.002, dark, -0.0355, 0.03, -0.2);
  k.lathe([[0.0001, 0], [0.01, 0], [0.012, 0.006], [0.011, 0.024], [0.008, 0.03], [0.0001, 0.031]], steel, -0.036, 0.03, -0.27, 0, 0, PI / 2, 18);
  // Magazine: single-stack box with ribs and an AP round-count window (the one yellow tell).
  k.side([[0.05, -0.05, 0.004], [0.164, -0.05, 0.004], [0.172, -0.2, 0.006], [0.062, -0.204, 0.006]], 0.05, dark,
    { bevel: 0.003, holes: [slot(0.112, 0.128, -0.17, -0.082, 0.004)] });
  k.rb(0.024, 0.08, 0.012, 0.004, GLOW('#f2d23c', 1.4), 0, -0.126, -0.12);
  for (let i = 0; i < 3; i++) k.rb(0.054, 0.004, 0.1, 0.0015, steel, 0, -0.075 - i * 0.035, -(0.108 + i * 0.002));
  k.side([[0.056, -0.198, 0.004], [0.178, -0.194, 0.004], [0.18, -0.214, 0.006], [0.054, -0.218, 0.006]], 0.056, W.fde(), { bevel: 0.002 });
  // Grip, guard, red safety mark.
  grip(b, -0.006, -0.05, 0.24, hm('#1f2124', 'plate', { wear: 0.5 }), 0.038);
  guard(k, -0.006, 0.05, -0.054, gm, steel);
  k.rb(0.004, 0.008, 0.03, 0.002, steel, -0.0385, -0.026, 0.03, 0.4); k.ball(0.0025, W.red(), -0.039, -0.016, 0.018, 0.4, 1, 1);
  // Barrel (fluted) and the olive forend with triangular cut-throughs.
  k.barrel([[0.0001, 0.36], [0.024, 0.36], [0.024, 0.4], [0.021, 0.41], [0.021, 0.86], [0.0001, 0.86]], W.darkL(), 0, by);
  for (let i = 0; i < 6; i++) { const a = (i / 6) * PI * 2; k.rb(0.004, 0.004, 0.44, 0.0015, hm('#0c0d0e', 'hard'), Math.cos(a) * 0.0205, by + Math.sin(a) * 0.0205, -0.63, 0, 0, a); }
  const tri = [];
  for (let i = 0; i < 5; i++) {
    const s0 = 0.4 + i * 0.078, up = i % 2 === 0;
    tri.push(up ? [[s0, -0.03, 0.006], [s0 + 0.068, -0.03, 0.006], [s0 + 0.034, 0.03, 0.006]] : [[s0, 0.03, 0.006], [s0 + 0.068, 0.03, 0.006], [s0 + 0.034, -0.03, 0.006]]);
  }
  k.side([[0.364, 0.056, 0.004], [0.8, 0.056, 0.008], [0.818, 0.04, 0.01], [0.818, -0.036, 0.01], [0.8, -0.056, 0.008], [0.4, -0.056, 0.006], [0.364, -0.048, 0.01]], 0.082, ol, { bevel: 0.004, holes: tri });
  rail(k, -0.14, 0.8, 0.074, steel, 0.032);
  // Folded bipod under the forend.
  k.rb(0.05, 0.02, 0.03, 0.005, steel, 0, -0.064, -0.79);
  for (const sx of [-1, 1]) { k.barrel([[0.0001, 0.52], [0.0065, 0.52], [0.0065, 0.78], [0.0001, 0.78]], W.darkL(), sx * 0.018, -0.068, 14); k.barrel([[0.0001, 0.5], [0.0085, 0.5], [0.0085, 0.53], [0.0001, 0.53]], W.rubber(), sx * 0.018, -0.068, 14); }
  // Suppressor and boxy muzzle brake (side ports cut through).
  k.barrel([[0.0001, 0.818], [0.04, 0.818], [0.048, 0.83], [0.048, 1.12], [0.044, 1.13], [0.03, 1.134], [0.0001, 1.134]], W.darkL(), 0, by, 32);
  for (let i = 0; i < 4; i++) k.barrel([[0.048, 0.87 + i * 0.065], [0.0495, 0.872 + i * 0.065], [0.0495, 0.882 + i * 0.065], [0.048, 0.884 + i * 0.065]], steel, 0, by, 32);
  k.side([[1.128, -0.036, 0.006], [1.25, -0.036, 0.01], [1.256, 0.0, 0.006], [1.25, 0.044, 0.01], [1.128, 0.044, 0.006]], 0.09, hm('#1d1f22', 'hard', { wear: 0.8 }),
    { bevel: 0.004, holes: [0, 1, 2].map((i) => slot(1.142 + i * 0.036, 1.166 + i * 0.036, -0.016, 0.026, 0.006)) });
  k.cyl(0.012, 0.012, 0.004, lensM('#050506'), 0, by, -1.256, PI / 2, 0, 0, 16);
  // Optic: long tube on two rings, turrets, big objective.
  const sy = 0.152, rt = 0.025;
  scope(k, sy, { e0: -0.2, e1: -0.1, t0: -0.1, t1: 0.26, o1: 0.38, re: 0.03, rt, ro: 0.042 }, W.darkL(), steel);
  for (const s of [-0.06, 0.2]) ringMount(k, s, 0.08, sy, rt, dark);
  turrets(k, 0.07, sy, rt, dark, steel);
  k.cyl(0.033, 0.033, 0.002, lensM('#0a1712'), 0, sy, -0.381, PI / 2, 0, 0, 28);
  // Stock: olive skeleton with cut-out, adjustable cheek riser, rubber pad, rear monopod.
  k.side([[-0.14, 0.05, 0.008], [-0.42, 0.058, 0.012], [-0.44, 0.05, 0.006], [-0.44, -0.11, 0.012], [-0.41, -0.118, 0.008], [-0.3, -0.07, 0.03], [-0.14, -0.044, 0.01]], 0.06, ol,
    { bevel: 0.004, holes: [[[-0.2, 0.034, 0.008], [-0.396, 0.04, 0.01], [-0.404, -0.086, 0.01], [-0.31, -0.044, 0.02], [-0.21, -0.024, 0.01]]] });
  k.side([[-0.2, 0.074, 0.008], [-0.37, 0.074, 0.008], [-0.372, 0.096, 0.006], [-0.21, 0.096, 0.01]], 0.05, dark, { bevel: 0.003 });
  for (const s of [-0.24, -0.33]) k.cyl(0.005, 0.005, 0.02, steel, 0, 0.065, -s, 0, 0, 0, 12);
  k.cyl(0.008, 0.008, 0.014, steel, 0.031, 0.065, 0.28, 0, 0, PI / 2, 16);
  k.side([[-0.44, 0.062, 0.006], [-0.462, 0.062, 0.004], [-0.464, -0.118, 0.008], [-0.44, -0.124, 0.004]], 0.064, W.rubber(), { bevel: 0.002 });
  for (let i = 0; i < 8; i++) k.rb(0.062, 0.004, 0.004, 0.001, W.rubber(), 0, -0.1 + i * 0.022, 0.464);
  k.rb(0.03, 0.02, 0.03, 0.005, steel, 0, -0.112, 0.4);
  k.lathe([[0.0001, 0], [0.008, 0], [0.008, -0.05], [0.012, -0.054], [0.012, -0.062], [0.0001, -0.062]], dark, 0, -0.118, 0.4);
  engrave(b, 'glasscutter', 'GLASSCUTTER  ·  12.7  ·  SEMI', 0.2, 0.022, 0.0376, -0.028, 0.14);
  g.userData = shiftAnchors({
    gripR: V(0, -0.12, 0.03), gripL: V(0, -0.0, -0.56), muzzle: V(0, by, -1.26), sight: sy,
    handR: handGrip(V(0, -0.09, 0.03), 0.24, 0.021),
    handL: handWrap(V(0, 0.0, -0.56), 0.048),
  }, b.position.clone());
  shade(g); return g;
}

// ---------------------------------------------------------------------------------------------
// KR-35 OSPREY — FDE chassis bolt gun: wing skeleton stock with monopod, hex-fluted barrel, vented shroud,
// oversized tapered bolt knob, long scope with sunshade and clip-on night unit (cyan lens), offset red dot.
// ---------------------------------------------------------------------------------------------
export function heroOsprey() {
  const g = new THREE.Group(), b = new THREE.Group(); b.position.z = 0.1; g.add(b); const k = K(b);
  const fde = W.fde(), fdeD = W.fdeD(), steel = W.steel(), dark = W.dark();
  const by = 0.012;
  // Chassis (FDE) with a dark bottom-metal insert.
  k.side([[-0.17, 0.034, 0.006], [0.33, 0.034, 0.006], [0.336, -0.01, 0.01], [0.32, -0.04, 0.008], [0.16, -0.044, 0.006], [0.02, -0.044, 0.006], [-0.17, -0.036, 0.012]], 0.068, fde, { bevel: 0.0035 });
  k.side([[-0.03, -0.034, 0.004], [0.2, -0.034, 0.004], [0.2, -0.05, 0.006], [-0.03, -0.05, 0.006]], 0.06, dark, { bevel: 0.002 });
  // Round action sunk into the chassis, bolt shroud, ejection port, rail.
  k.barrel([[0.0001, -0.13], [0.022, -0.13], [0.024, -0.124], [0.024, 0.21], [0.022, 0.216], [0.0001, 0.216]], steel, 0, 0.036);
  k.barrel([[0.0001, -0.178], [0.012, -0.178], [0.017, -0.168], [0.019, -0.13], [0.0001, -0.13]], W.darkL(), 0, 0.036);
  k.rb(0.006, 0.02, 0.08, 0.004, dark, 0.021, 0.044, -0.03);
  rail(k, -0.12, 0.22, 0.068, dark, 0.026);
  k.rb(0.024, 0.008, 0.34, 0.003, dark, 0, 0.058, -0.05);
  // Bolt handle: arm out to the right, oversized tapered knob.
  k.rb(0.05, 0.01, 0.012, 0.004, steel, 0.03, 0.036, 0.1, 0, 0, -0.35);
  k.lathe([[0.0001, 0], [0.008, 0], [0.011, 0.01], [0.016, 0.026], [0.0175, 0.036], [0.016, 0.044], [0.01, 0.049], [0.0001, 0.05]], dark, 0.05, 0.028, 0.1, 0, 0, -PI / 2 + 0.35, 24);
  // Short magazine, grip, guard.
  k.side([[0.06, -0.044, 0.004], [0.138, -0.044, 0.004], [0.142, -0.104, 0.006], [0.062, -0.106, 0.006]], 0.046, dark, { bevel: 0.003 });
  k.side([[0.058, -0.1, 0.004], [0.146, -0.1, 0.004], [0.148, -0.114, 0.005], [0.056, -0.116, 0.005]], 0.05, fdeD, { bevel: 0.002 });
  grip(b, -0.01, -0.036, 0.32, hm('#1f2124', 'plate', { wear: 0.5 }), 0.036);
  guard(k, -0.01, 0.05, -0.044, dark, steel);
  // FDE forend with hexagonal cut-throughs; the hex-fluted barrel shows inside.
  const hex = [0, 1, 2, 3, 4].map((i) => poly(0.38 + i * 0.062, -0.003, 0.022, 6, PI / 6));
  k.side([[0.33, 0.03, 0.006], [0.7, 0.03, 0.008], [0.712, 0.0, 0.01], [0.7, -0.036, 0.008], [0.33, -0.04, 0.006]], 0.07, fde, { bevel: 0.0035, holes: hex });
  k.barrel([[0.0001, 0.2], [0.021, 0.2], [0.021, 0.3], [0.019, 0.32], [0.016, 1.0], [0.0001, 1.0]], W.darkL(), 0, by, 6);
  for (let i = 0; i < 6; i++) { const a = (i / 6) * PI * 2 + PI / 6; k.rb(0.003, 0.003, 0.62, 0.001, hm('#3c4046', 'hard'), Math.cos(a) * 0.0165, by + Math.sin(a) * 0.0165, -0.66, 0, 0, a); }
  // Vented shroud: core, eight vent bars, collars and a flat cap.
  k.barrel([[0.0001, 0.97], [0.024, 0.97], [0.024, 1.24], [0.0001, 1.24]], hm('#101113', 'hard'), 0, by);
  for (let i = 0; i < 8; i++) { const a = (i / 8) * PI * 2; k.rb(0.011, 0.007, 0.2, 0.002, dark, Math.cos(a) * 0.026, by + Math.sin(a) * 0.026, -1.105, 0, 0, a + PI / 2); }
  for (const s of [0.98, 1.21]) k.barrel([[0.0001, s], [0.03, s], [0.0315, s + 0.004], [0.0315, s + 0.022], [0.03, s + 0.026], [0.0001, s + 0.026]], W.darkL(), 0, by);
  k.barrel([[0.0001, 1.236], [0.03, 1.236], [0.032, 1.242], [0.03, 1.256], [0.0001, 1.256]], steel, 0, by);
  k.cyl(0.006, 0.006, 0.002, lensM('#050506'), 0, by, -1.257, PI / 2, 0, 0, 16);
  // Folded bipod under the forend.
  k.rb(0.046, 0.016, 0.03, 0.005, dark, 0, -0.046, -0.69);
  for (const sx of [-1, 1]) k.barrel([[0.0001, 0.46], [0.0055, 0.46], [0.0055, 0.68], [0.0001, 0.68]], W.darkL(), sx * 0.017, -0.05, 12);
  // Long scope: sunshade and clip-on night unit (cyan lens), rings, turrets, offset red dot.
  const sy = 0.124, rt = 0.021;
  scope(k, sy, { e0: -0.21, e1: -0.11, t0: -0.11, t1: 0.2, o1: 0.3, re: 0.028, rt, ro: 0.032 }, W.darkL(), steel);
  k.barrel([[0.031, 0.3], [0.035, 0.3], [0.035, 0.392], [0.031, 0.392], [0.031, 0.31]], W.darkL(), 0, sy);
  const nv = 0.392;
  k.rb(0.06, 0.07, 0.11, 0.012, fdeD, 0, sy + 0.004, -(nv + 0.058));
  k.barrel([[0.0001, nv + 0.11], [0.03, nv + 0.11], [0.031, nv + 0.116], [0.031, nv + 0.15], [0.028, nv + 0.154], [0.0001, nv + 0.154]], W.darkL(), 0, sy);
  k.cyl(0.024, 0.024, 0.002, GLOW('#38d6f2', 1.8), 0, sy, -(nv + 0.155), PI / 2, 0, 0, 28);
  k.rb(0.02, 0.02, 0.03, 0.005, dark, 0.034, sy + 0.012, -(nv + 0.05)); k.cyl(0.006, 0.006, 0.012, steel, 0.046, sy + 0.012, -(nv + 0.05), 0, 0, PI / 2, 12);
  k.rb(0.034, 0.012, 0.09, 0.003, dark, 0, sy - 0.036, -(nv + 0.04));
  for (const s of [-0.07, 0.15]) ringMount(k, s, 0.072, sy, rt, dark);
  turrets(k, 0.04, sy, rt, dark, steel);
  k.cyl(0.03, 0.03, 0.002, lensM('#0a1712'), 0, sy, 0.212, PI / 2, 0, 0, 28);
  const rd = new THREE.Group(); rd.position.set(0.03, 0.075, -0.17); rd.rotation.z = -PI / 4; b.add(rd); const kr = K(rd);
  kr.rb(0.016, 0.016, 0.03, 0.003, dark, 0, -0.005, 0);
  kr.face([[-0.012, 0.0, 0.002], [0.012, 0.0, 0.002], [0.012, 0.026, 0.006], [-0.012, 0.026, 0.006]], 0.02, dark, { holes: [[[-0.009, 0.004, 0.002], [0.009, 0.004, 0.002], [0.009, 0.022, 0.005], [-0.009, 0.022, 0.005]]] });
  kr.ball(0.0015, GLOW('#ff3040', 3), 0, 0.013, -0.006);
  // Wing stock: hinge, FDE skeleton with a scalloped trailing edge (the feathers), cheek riser, pad, monopod.
  k.rb(0.05, 0.06, 0.03, 0.006, dark, 0, -0.002, 0.18);
  k.cyl(0.006, 0.006, 0.07, steel, 0.026, -0.002, 0.18, 0, 0, 0, 14);
  k.side([[-0.19, 0.032, 0.008], [-0.3, 0.05, 0.04], [-0.42, 0.064, 0.012], [-0.452, 0.064, 0.006], [-0.456, 0.04, 0.004], [-0.456, -0.104, 0.008],
    [-0.432, -0.112, 0.006], [-0.414, -0.084, 0.008], [-0.392, -0.098, 0.006], [-0.372, -0.072, 0.008], [-0.35, -0.082, 0.006], [-0.33, -0.058, 0.008], [-0.306, -0.064, 0.006], [-0.29, -0.044, 0.01], [-0.19, -0.03, 0.008]], 0.044, fde,
  { bevel: 0.0035, holes: [[[-0.215, 0.012, 0.006], [-0.32, 0.03, 0.016], [-0.38, 0.04, 0.01], [-0.34, 0.006, 0.012], [-0.25, -0.012, 0.008]],
    [[-0.398, 0.046, 0.006], [-0.434, 0.046, 0.006], [-0.436, -0.07, 0.008], [-0.42, -0.064, 0.006], [-0.398, -0.01, 0.01]]] });
  k.side([[-0.25, 0.074, 0.008], [-0.39, 0.08, 0.008], [-0.392, 0.098, 0.006], [-0.26, 0.094, 0.01]], 0.04, fdeD, { bevel: 0.003 });
  for (const s of [-0.29, -0.36]) k.cyl(0.004, 0.004, 0.026, steel, 0, 0.07, -s, 0, 0, 0, 12);
  k.side([[-0.454, 0.068, 0.006], [-0.47, 0.068, 0.004], [-0.472, -0.108, 0.008], [-0.454, -0.114, 0.004]], 0.048, W.rubber(), { bevel: 0.002 });
  k.lathe([[0.0001, 0], [0.007, 0], [0.007, -0.05], [0.0095, -0.052], [0.0095, -0.07], [0.014, -0.074], [0.014, -0.08], [0.0001, -0.08]], dark, 0, -0.096, 0.42);
  engrave(b, 'osprey', 'KR-35 OSPREY  ·  FDE', 0.15, 0.018, 0.0346, -0.012, 0.12, '#2a251c');
  g.userData = shiftAnchors({
    gripR: V(0, -0.1, 0.04), gripL: V(0, -0.003, -0.47), muzzle: V(0, by, -1.26), sight: sy,
    handR: handGrip(V(0, -0.08, 0.036), 0.32, 0.02),
    handL: handWrap(V(0, -0.004, -0.47), 0.04),
  }, b.position.clone());
  shade(g); return g;
}

// ---------------------------------------------------------------------------------------------
// DM-9 SWIFT — bullpup 7.62 DMR: ranger shell over black, mag behind the grip, raised rail bridge (cut through) with
// an LPVO (cyan lens), integral suppressor, folding forward grip. The butt sits at z ≈ 0.42 like the VX-7's.
// ---------------------------------------------------------------------------------------------
export function heroSwift() {
  const g = new THREE.Group(), k = K(g);
  const sh = W.ranger(), shD = W.rangerD(), steel = W.steel(), dark = W.dark();
  const by = 0.012;
  // The shell: one sculpted profile from butt to nose, vents cut through over the barrel.
  const vents = [0, 1, 2, 3, 4].map((i) => slot(0.15 + i * 0.034, 0.17 + i * 0.034, -0.012, 0.026, 0.006));
  k.side([[-0.42, 0.054, 0.012], [-0.3, 0.06, 0.04], [-0.1, 0.054, 0.02], [0.33, 0.05, 0.012], [0.362, 0.02, 0.014], [0.352, -0.036, 0.01], [0.13, -0.04, 0.01],
    [0.07, -0.034, 0.01], [-0.22, -0.04, 0.01], [-0.3, -0.06, 0.03], [-0.36, -0.104, 0.012], [-0.42, -0.104, 0.01]], 0.072, sh, { bevel: 0.004, holes: vents });
  // Black lower insert and mag well.
  k.side([[-0.29, -0.024, 0.006], [0.12, -0.024, 0.006], [0.126, -0.046, 0.006], [-0.21, -0.048, 0.008], [-0.29, -0.04, 0.008]], 0.076, hm('#1d1f22', 'plate', { wear: 0.6 }), { bevel: 0.003 });
  k.side([[-0.2, -0.04, 0.004], [-0.09, -0.04, 0.004], [-0.086, -0.066, 0.006], [-0.198, -0.068, 0.006]], 0.06, hm('#1d1f22', 'plate', { wear: 0.6 }), { bevel: 0.003 });
  // Rubber butt pad and a cheek piece.
  k.side([[-0.418, 0.06, 0.006], [-0.434, 0.06, 0.004], [-0.436, -0.106, 0.008], [-0.418, -0.112, 0.004]], 0.074, W.rubber(), { bevel: 0.002 });
  for (let i = 0; i < 7; i++) k.rb(0.072, 0.004, 0.004, 0.001, W.rubber(), 0, -0.09 + i * 0.022, 0.436);
  k.side([[-0.36, 0.05, 0.006], [-0.16, 0.05, 0.006], [-0.16, 0.068, 0.008], [-0.34, 0.074, 0.012]], 0.052, shD, { bevel: 0.003 });
  // Shell parting seam, stippled grip panels, take-down pin, QD sling cup.
  for (const sx of [-1, 1]) {
    k.rb(0.0015, 0.003, 0.5, 0.001, hm('#141613', 'plate'), sx * 0.0362, -0.002, 0.05);
    k.side([[-0.38, 0.03, 0.008], [-0.25, 0.03, 0.008], [-0.25, -0.02, 0.008], [-0.3, -0.05, 0.012], [-0.37, -0.08, 0.008]], 0.002, shD, { bevel: 0.0005, x: sx * 0.0362 });
  }
  k.cyl(0.0045, 0.0045, 0.075, steel, 0, 0.0, 0.33, 0, 0, PI / 2, 14);
  k.cyl(0.007, 0.007, 0.076, dark, 0, -0.07, 0.37, 0, 0, PI / 2, 16);
  // Ejection ports both sides (ambi), charging handle forward on the left.
  for (const sx of [-1, 1]) { k.rb(0.004, 0.02, 0.07, 0.004, dark, sx * 0.0365, 0.02, 0.12); k.rb(0.002, 0.014, 0.064, 0.002, steel, sx * 0.0375, 0.02, 0.12); }
  k.rb(0.002, 0.01, 0.16, 0.002, dark, -0.0365, 0.03, -0.16);
  k.lathe([[0.0001, 0], [0.008, 0], [0.009, 0.004], [0.0085, 0.018], [0.0001, 0.019]], steel, -0.037, 0.03, -0.25, 0, 0, PI / 2, 16);
  // Magazine behind the grip (curved, ribbed, FDE base pad).
  const mp = [], mn = 8;
  for (let i = 0; i <= mn; i++) { const t = i / mn; mp.push([-0.09 + Math.sin(t * 0.3) * 0.06, -0.06 - t * 0.14, 0]); }
  const mb = mp.map(([s, y]) => [s - 0.074, y + 0.002]).reverse(); mb[0][2] = 0.006; mp[mn][2] = 0.008;
  k.side([...mp, ...mb], 0.03, dark, { bevel: 0.003 });
  k.side([[-0.064, -0.196, 0.004], [-0.148, -0.198, 0.004], [-0.15, -0.214, 0.006], [-0.062, -0.212, 0.006]], 0.034, W.fde(), { bevel: 0.002 });
  for (let i = 0; i < 3; i++) k.rb(0.0315, 0.003, 0.06, 0.001, steel, 0, -0.09 - i * 0.035, 0.125 - i * 0.004);
  // Grip and trigger guard (forward of the mag, bullpup style).
  grip(g, 0.0, -0.034, 0.22, hm('#1f2124', 'plate', { wear: 0.5 }), 0.036);
  guard(k, 0.0, 0.09, -0.04, hm('#1d1f22', 'plate', { wear: 0.6 }), steel);
  // Barrel and integral suppressor.
  k.barrel([[0.0001, -0.2], [0.012, -0.2], [0.012, 0.36], [0.0001, 0.36]], W.darkL(), 0, by);
  k.barrel([[0.0001, 0.35], [0.026, 0.35], [0.03, 0.358], [0.03, 0.628], [0.027, 0.638], [0.014, 0.64], [0.0001, 0.64]], W.darkL(), 0, by, 32);
  for (let i = 0; i < 4; i++) k.barrel([[0.0302, 0.39 + i * 0.058], [0.0315, 0.392 + i * 0.058], [0.0315, 0.404 + i * 0.058], [0.0302, 0.406 + i * 0.058]], steel, 0, by, 32);
  k.cyl(0.008, 0.008, 0.002, lensM('#050506'), 0, by, -0.6405, PI / 2, 0, 0, 16);
  // Raised rail bridge (gap cut through) and teeth.
  k.side([[-0.21, 0.046, 0.002], [0.26, 0.044, 0.002], [0.262, 0.092, 0.004], [-0.212, 0.092, 0.004]], 0.034, dark,
    { bevel: 0.002, holes: [[[-0.17, 0.056, 0.008], [0.21, 0.056, 0.008], [0.21, 0.08, 0.008], [-0.17, 0.08, 0.008]]] });
  rail(k, -0.21, 0.26, 0.1, dark, 0.03);
  // LPVO with throw lever, turrets and a cyan objective.
  const sy = 0.148, rt = 0.019;
  scope(k, sy, { e0: -0.25, e1: -0.15, t0: -0.15, t1: 0.1, o1: 0.19, re: 0.026, rt, ro: 0.027 }, W.darkL(), steel);
  for (const s of [-0.12, 0.08]) ringMount(k, s, 0.104, sy, rt, dark);
  turrets(k, -0.02, sy, rt, dark, steel);
  k.rb(0.026, 0.006, 0.01, 0.003, steel, 0.026, sy + 0.01, 0.19, 0, 0, -0.4);
  k.cyl(0.022, 0.022, 0.002, GLOW('#38d6f2', 1.6), 0, sy, -0.191, PI / 2, 0, 0, 28);
  // Folding forward grip (deployed).
  k.rb(0.026, 0.014, 0.044, 0.004, steel, 0, -0.044, -0.27);
  k.cyl(0.004, 0.004, 0.03, steel, 0, -0.046, -0.29, 0, 0, PI / 2, 12);
  const fg = k.lathe([[0.0001, 0], [0.0135, 0], [0.015, -0.006], [0.0142, -0.02], [0.0152, -0.035], [0.0142, -0.05], [0.0158, -0.068], [0.0165, -0.078], [0.012, -0.086], [0.0001, -0.087]], W.poly(), 0, -0.05, -0.274, 0.16);
  fg.scale.set(0.85, 1, 1);
  k.torus(0.009, 0.0022, steel, 0, -0.06, 0.36, 0, PI / 2, 0);
  engrave(g, 'swift', 'DM-9 SWIFT  ·  7.62', 0.14, 0.016, 0.0366, 0.012, -0.14, '#1d2018');
  g.userData = {
    gripR: V(0, -0.08, 0.016), gripL: V(0, -0.095, -0.28), muzzle: V(0, by, -0.64), sight: sy,
    handR: handGrip(V(0, -0.075, 0.02), 0.22, 0.02),
    handL: handVert(V(0, -0.098, -0.282), 0.16, 0.016),
  };
  shade(g); return g;
}

// ---------------------------------------------------------------------------------------------
// KR-50 NIGHTJAR [CANON layout] — Ra's suppressed .50 bolt gun with the NV scope (Sniper Cell buildKR50): same
// parts, positions and anchors (gripR / gripL / muzzle / bolt / boltKnob / mag / sight / eye), hero finish.
// ---------------------------------------------------------------------------------------------
export function heroNightjar() {
  const g = new THREE.Group(), k = K(g);
  const body = W.gm(), dark = W.dark(), hi = W.hi(), ol = W.olive(), steel = W.steel();
  // Slab receiver (z 0.09 … -0.33) and its raised top plate; toothed rail.
  k.side([[-0.09, -0.032, 0.008], [0.33, -0.032, 0.004], [0.336, 0.01, 0.006], [0.33, 0.052, 0.004], [-0.08, 0.052, 0.006], [-0.096, 0.03, 0.014]], 0.075, body, { bevel: 0.0035 });
  k.side([[-0.09, 0.045, 0.004], [0.33, 0.045, 0.004], [0.33, 0.075, 0.006], [-0.075, 0.075, 0.006], [-0.094, 0.06, 0.008]], 0.08, hi, { bevel: 0.003 });
  rail(k, -0.06, 0.34, 0.082, dark, 0.05, 0.026);
  // Long boxy shroud (z -0.31 … -0.93), the canon's seven vent slots cut through; barrel inside; dark top strip.
  const vs = []; for (let i = 0; i < 7; i++) { const s = 0.4 + i * 0.075; vs.push(slot(s - 0.025, s + 0.025, -0.015, 0.015, 0.006)); }
  k.side([[0.31, -0.0375, 0.006], [0.92, -0.0375, 0.008], [0.93, -0.02, 0.008], [0.93, 0.0375, 0.008], [0.31, 0.0375, 0.006]], 0.07, body, { bevel: 0.0035, holes: vs });
  k.side([[0.32, 0.034, 0.004], [0.918, 0.034, 0.004], [0.918, 0.055, 0.006], [0.32, 0.055, 0.006]], 0.074, dark, { bevel: 0.0025 });
  k.barrel([[0.0001, 0.3], [0.018, 0.3], [0.018, 0.93], [0.0001, 0.93]], hm('#0e0f11', 'hard'), 0, 0.0);
  // Fat integral suppressor with the two canon collars.
  k.barrel([[0.0001, 0.925], [0.036, 0.925], [0.042, 0.935], [0.042, 1.3], [0.038, 1.312], [0.016, 1.316], [0.0001, 1.316]], W.darkL(), 0, 0.0, 32);
  for (const s of [0.93, 1.29]) k.barrel([[0.042, s], [0.0445, s + 0.003], [0.0445, s + 0.017], [0.042, s + 0.02]], hi, 0, 0.0, 32);
  for (let i = 0; i < 5; i++) k.barrel([[0.042, 1.0 + i * 0.055], [0.0428, 1.002 + i * 0.055], [0.0428, 1.008 + i * 0.055], [0.042, 1.01 + i * 0.055]], steel, 0, 0.0, 32);
  k.cyl(0.009, 0.009, 0.002, lensM('#050506'), 0, 0.0, -1.3165, PI / 2, 0, 0, 16);
  // Grip (olive, raked 0.3 like canon) with texture bands; trigger guard loop.
  grip(g, -0.035, -0.024, 0.3, ol, 0.04);
  guard(k, -0.005, 0.085, -0.032, body, hi);
  // Magazine (canon group, z -0.12): body, three ribs, base plate.
  const magG = new THREE.Group(); magG.position.set(0, -0.03, -0.12); g.add(magG); const km = K(magG);
  km.side([[-0.05, 0.004, 0.004], [0.05, 0.004, 0.004], [0.05, -0.1, 0.008], [-0.05, -0.1, 0.008]], 0.05, dark, { bevel: 0.003 });
  for (let i = 0; i < 3; i++) km.rb(0.052, 0.005, 0.102, 0.0015, hi, 0, -0.02 - i * 0.03, 0);
  km.side([[-0.054, -0.1, 0.004], [0.054, -0.1, 0.004], [0.054, -0.115, 0.006], [-0.054, -0.115, 0.006]], 0.056, hi, { bevel: 0.002 });
  // Olive stock (z 0.05 … 0.35) with a thumbhole cut, cheek piece, adjustable riser and knob, dark butt, rubber pad.
  k.side([[-0.05, 0.035, 0.006], [-0.34, 0.035, 0.006], [-0.346, -0.055, 0.008], [-0.18, -0.055, 0.02], [-0.1, -0.05, 0.02], [-0.05, -0.032, 0.008]], 0.06, ol,
    { bevel: 0.004, holes: [[[-0.1, 0.012, 0.01], [-0.17, 0.016, 0.01], [-0.17, -0.034, 0.014], [-0.11, -0.03, 0.012]], [[-0.2, 0.016, 0.008], [-0.31, 0.016, 0.008], [-0.31, -0.034, 0.01], [-0.21, -0.034, 0.012]]] });
  k.side([[-0.1, 0.033, 0.006], [-0.22, 0.033, 0.006], [-0.22, 0.075, 0.01], [-0.1, 0.068, 0.012]], 0.05, ol, { bevel: 0.003 });
  k.side([[-0.12, 0.086, 0.004], [-0.22, 0.086, 0.004], [-0.22, 0.104, 0.008], [-0.13, 0.104, 0.008]], 0.054, dark, { bevel: 0.0025 });
  for (const s of [-0.14, -0.2]) k.cyl(0.004, 0.004, 0.014, steel, 0, 0.079, -s, 0, 0, 0, 12);
  k.cyl(0.008, 0.008, 0.012, hi, 0.034, 0.07, 0.17, 0, 0, PI / 2, 16);
  k.side([[-0.34, 0.045, 0.006], [-0.38, 0.045, 0.004], [-0.38, -0.105, 0.006], [-0.34, -0.105, 0.006]], 0.06, dark, { bevel: 0.003 });
  k.side([[-0.38, 0.05, 0.006], [-0.4, 0.05, 0.004], [-0.4, -0.11, 0.006], [-0.38, -0.11, 0.004]], 0.064, hm('#101113', 'cloth', { paint: 0.08 }), { bevel: 0.002 });
  for (let i = 0; i < 4; i++) k.rb(0.066, 0.004, 0.022, 0.001, dark, 0, -0.09 + i * 0.04, 0.39);
  // Bolt (canon group at y 0.035, z -0.02): body, arm, big ball knob.
  const bolt = new THREE.Group(); bolt.position.set(0, 0.035, -0.02); g.add(bolt); const kb = K(bolt);
  kb.barrel([[0.0001, -0.11], [0.016, -0.11], [0.016, 0.06], [0.0001, 0.06]], hi, 0, 0);
  kb.rb(0.055, 0.012, 0.014, 0.004, hi, 0.03, 0, 0.03);
  kb.lathe([[0.0001, -0.016], [0.009, -0.0145], [0.0145, -0.008], [0.017, 0.0], [0.0145, 0.008], [0.009, 0.0145], [0.0001, 0.016]], dark, 0.06, 0, 0.03, 0, 0, PI / 2, 24);
  k.rb(0.004, 0.018, 0.07, 0.004, hm('#0c0d0e', 'hard'), 0.0385, 0.028, 0.0);
  // NV scope (y 0.115): eyepiece, tube, objective bell; mounts and rings; turrets; battery box with the green tell.
  const sy = 0.115;
  scope(k, sy, { e0: -0.062, e1: 0.02, t0: 0.02, t1: 0.33, o1: 0.44, re: 0.03, rt: 0.024, ro: 0.04 }, W.darkL(), hi);
  for (const s of [0.08, 0.28]) { k.side([[s - 0.016, 0.079], [s + 0.016, 0.079], [s + 0.014, 0.098, 0.004], [s - 0.014, 0.098, 0.004]], 0.03, dark, { bevel: 0.0015 }); k.add(new THREE.TorusGeometry(0.0275, 0.005, 8, 28), hi, 0, sy, -s); }
  turrets(k, 0.19, sy, 0.024, hi, dark);
  k.rb(0.026, 0.032, 0.06, 0.006, hi, 0.03, sy, -0.16);
  k.cyl(0.0065, 0.0065, 0.004, dark, 0.044, sy + 0.005, -0.16, 0, 0, PI / 2, 14);
  k.ball(0.0048, GLOW('#40ffb0', 2.2), 0.0455, sy + 0.005, -0.16, 0.5, 1, 1);
  k.cyl(0.036, 0.036, 0.002, lensM('#0a1712'), 0, sy, -0.441, PI / 2, 0, 0, 28);
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.024, 24), lensM('#07160e')); lens.position.set(0, sy, 0.0625); g.add(lens);
  const eyeRing = new THREE.Mesh(new THREE.RingGeometry(0.019, 0.03, 24), new THREE.MeshBasicMaterial({ color: '#c8ffe0', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
  eyeRing.position.set(0, sy, 0.064); g.add(eyeRing);
  // Folded bipod (canon z -0.51 … -0.73), its hinge block, sling swivels.
  k.rb(0.05, 0.02, 0.03, 0.005, hi, 0, -0.045, -0.5);
  for (const sx of [-1, 1]) { k.barrel([[0.0001, 0.51], [0.007, 0.51], [0.007, 0.72], [0.0001, 0.72]], W.darkL(), sx * 0.02, -0.05, 14); k.barrel([[0.0001, 0.715], [0.009, 0.715], [0.009, 0.735], [0.0001, 0.735]], W.rubber(), sx * 0.02, -0.05, 14); }
  for (const z of [-0.78, 0.3]) k.torus(0.012, 0.003, hi, 0, -0.05, z, 0, PI / 2, 0);
  engrave(g, 'nightjar', 'KR-50 NIGHTJAR  ·  .50 SUB', 0.17, 0.02, 0.0381, 0.01, 0.12);
  const A = (x, y, z) => { const a = new THREE.Object3D(); a.position.set(x, y, z); g.add(a); return a; };
  g.userData = {
    gripR: V(0, -0.09, 0.03), gripL: V(-0.005, -0.04, -0.5), muzzle: V(0, 0, -1.33),
    bolt, boltKnob: A(0.06, 0.035, 0.01), mag: magG, magHome: magG.position.clone(), sight: sy, eye: lens, eyeRing,
    handR: handGrip(V(0, -0.08, 0.044), 0.3, 0.021),
    handL: handWrap(V(0, 0.0, -0.5), 0.042),
  };
  shade(g); return g;
}

// ---------------------------------------------------------------------------------------------
// P-9 [CANON layout] — the service pistol (Sniper Cell buildP9): polymer frame with rail and raked textured grip,
// black slide with rear serrations, green-rear / red-front night sights. Option can: the removable suppressor.
// ---------------------------------------------------------------------------------------------
export function heroP9({ can = false } = {}) {
  const g = new THREE.Group(), k = K(g);
  const frame = hm('#3b3e43', 'plate', { wear: 0.5 }), gripM = hm('#2f3236', 'plate', { wear: 0.45 }), slideM = hm('#141518', 'hard', { spec: 1.0, wear: 0.7 }), dark = hm('#111214', 'hard');
  // Frame / dust cover with the integral trigger guard (cut through) and beavertail.
  k.side([[-0.034, 0.008, 0.002], [0.146, 0.008, 0.002], [0.148, -0.006, 0.004], [0.144, -0.019, 0.003], [0.074, -0.019, 0.004], [0.07, -0.058, 0.006], [0.056, -0.06, 0.008], [0.0, -0.06, 0.008], [-0.01, -0.03, 0.006], [-0.03, -0.012, 0.006], [-0.04, 0.0, 0.004]], 0.031, frame,
    { bevel: 0.002, holes: [[[0.006, -0.024, 0.003], [0.064, -0.024, 0.004], [0.062, -0.052, 0.006], [0.01, -0.053, 0.008]]] });
  // Accessory rail under the dust cover.
  k.rb(0.026, 0.008, 0.06, 0.002, frame, 0, -0.022, -0.11);
  for (let i = 0; i < 3; i++) k.rb(0.027, 0.003, 0.004, 0.001, dark, 0, -0.024, -(0.09 + i * 0.018));
  // Raked textured grip (canon box at y -0.068, z 0.012, rake 0.2) with finger grooves and five bands.
  const gg = new THREE.Group(); gg.position.set(0, -0.068, 0.012); gg.rotation.x = -0.2; g.add(gg); const kg = K(gg);
  kg.side([[0.026, 0.05], [0.022, 0.03, 0.006], [0.026, 0.016, 0.004], [0.02, 0.0, 0.006], [0.024, -0.014, 0.004], [0.02, -0.03, 0.006], [0.024, -0.046, 0.004], [0.022, -0.056, 0.004],
    [-0.026, -0.056, 0.004], [-0.026, -0.02, 0.012], [-0.03, 0.03, 0.01], [-0.022, 0.056]], 0.034, gripM, { bevel: 0.003 });
  for (let i = 0; i < 5; i++) kg.rb(0.035, 0.004, 0.046, 0.0012, frame, 0, 0.033 - i * 0.02, 0.0);
  // Trigger.
  k.side([[0.024, -0.02], [0.03, -0.02], [0.029, -0.032, 0.004], [0.02, -0.042, 0.003], [0.017, -0.04], [0.023, -0.032]], 0.006, dark, { bevel: 0.0008 });
  // Magazine base plate (canon group).
  const magG = new THREE.Group(); magG.position.set(0, -0.124, 0.02); g.add(magG);
  K(magG).rb(0.03, 0.013, 0.05, 0.004, dark, 0, 0, 0);
  // Slide (canon group at y 0.024, z -0.066): bevelled nose, rear serrations, ejection port, night sights, bore.
  const slide = new THREE.Group(); slide.position.set(0, 0.024, -0.066); g.add(slide); const ks = K(slide);
  ks.side([[-0.0975, -0.017, 0.002], [0.0975, -0.017, 0.002], [0.0975, 0.006, 0.004], [0.092, 0.017, 0.004], [-0.094, 0.017, 0.004], [-0.0975, 0.01, 0.004]], 0.03, slideM, { bevel: 0.0025 });
  for (let i = 0; i < 6; i++) ks.rb(0.0312, 0.024, 0.0026, 0.0008, dark, 0, -0.002, 0.064 + i * 0.0058);
  for (let i = 0; i < 3; i++) ks.rb(0.0312, 0.02, 0.0024, 0.0008, dark, 0, -0.004, -0.07 - i * 0.0058);
  ks.rb(0.012, 0.004, 0.03, 0.0015, dark, 0.006, 0.0165, -0.005);
  ks.side([[0.084, 0.016], [0.096, 0.016], [0.094, 0.027, 0.002], [0.087, 0.027, 0.002]], 0.006, dark, { bevel: 0.0008 });
  ks.ball(0.0032, GLOW('#ff2a2a', 1.6), 0, 0.023, -0.085);
  ks.side([[-0.092, 0.016], [-0.082, 0.016], [-0.084, 0.027, 0.002], [-0.092, 0.027, 0.002]], 0.022, dark, { bevel: 0.001, holes: [[[-0.0895, 0.022], [-0.0845, 0.022], [-0.0845, 0.0275], [-0.0895, 0.0275]]] });
  for (const sx of [-0.0072, 0.0072]) ks.ball(0.003, GLOW('#30ff60', 1.5), sx, 0.023, 0.0925);
  ks.cyl(0.0055, 0.0055, 0.002, lensM('#050506'), 0, 0.002, -0.0985, PI / 2, 0, 0, 14);
  ks.barrel([[0.0001, 0.094], [0.007, 0.094], [0.007, 0.0975], [0.0001, 0.0975]], hm('#2b2e33', 'hard'), 0, 0.002);
  // Slide stop, takedown lever, mag release.
  k.rb(0.003, 0.005, 0.022, 0.0015, dark, -0.017, 0.004, -0.03);
  k.rb(0.003, 0.004, 0.008, 0.0015, dark, -0.017, 0.0, -0.05);
  k.rb(0.036, 0.007, 0.007, 0.0025, dark, 0, -0.022, -0.002);
  // Removable suppressor (the canon twist-on), optional.
  if (can) {
    k.barrel([[0.0001, 0.164], [0.008, 0.164], [0.008, 0.172], [0.0001, 0.172]], hm('#2b2e33', 'hard'), 0, 0.026);
    k.barrel([[0.0001, 0.17], [0.015, 0.17], [0.0175, 0.176], [0.0175, 0.33], [0.015, 0.336], [0.006, 0.338], [0.0001, 0.338]], hm('#17181b', 'hard', { wear: 0.5 }), 0, 0.026, 28);
    for (let i = 0; i < 2; i++) k.barrel([[0.0176, 0.2 + i * 0.1], [0.0186, 0.202 + i * 0.1], [0.0186, 0.21 + i * 0.1], [0.0176, 0.212 + i * 0.1]], hm('#3a3e44', 'hard'), 0, 0.026, 28);
  }
  engrave(slide, 'p9', 'P-9  ·  9MM', 0.05, 0.0075, 0.0151, -0.002, 0.015, '#6d737b');
  g.userData = {
    gripR: V(0, -0.072, 0.02), gripL: V(-0.023, -0.077, 0.005), muzzle: V(0, 0.026, can ? -0.34 : -0.17),
    slide, slideHome: slide.position.clone(), mag: magG, magHome: magG.position.clone(), sight: 0.047,
    handR: handGrip(V(0, -0.066, 0.02), 0.2, 0.019),
    handL: { ...handGrip(V(-0.004, -0.078, 0.012), 0.2, 0.021), back: [-0.032, -0.012], wrist: V(-0.045, -0.085, 0.07) },
  };
  shade(g); return g;
}

// ---------------------------------------------------------------------------------------------
// TALON — karambit: hooked claw blade (black coat, bright ground edge, spine jimping), full tang into a finger ring,
// G10 scales over a single red liner. Points -Z (blade forward); userData.grip is the fist centre.
// ---------------------------------------------------------------------------------------------
export function heroTalon() {
  const g = new THREE.Group(), k = K(g);
  const coat = hm('#26292d', 'hard', { spec: 0.9, wear: 0.9 }), edge = hm('#a8b0b8', 'hard', { spec: 1.2, wear: 0.1 }), steel = W.steel();
  const g10 = hm('#2b2f28', 'plate', { paint: 0.35, scale: 60, wear: 0.6, wearCol: '#8c9478' });
  const bz = (a, b, c, t) => [(1 - t) * (1 - t) * a[0] + 2 * (1 - t) * t * b[0] + t * t * c[0], (1 - t) * (1 - t) * a[1] + 2 * (1 - t) * t * b[1] + t * t * c[1]];
  // Blade: spine and edge as two quadratic curves meeting at the tip (the claw).
  const tip = [0.114, -0.082], N = 14;
  const spine = [], edg = [], grind = [];
  for (let i = 0; i <= N; i++) { const t = i / N; spine.push(bz([0.026, 0.013], [0.126, 0.046], tip, t)); }
  for (let i = N; i >= 0; i--) { const t = i / N; edg.push(bz([0.042, -0.014], [0.08, -0.002], tip, t)); }
  k.side([...spine.map(([s, y]) => [s, y]), ...edg.map(([s, y]) => [s, y])], 0.005, coat, { bevel: 0.0012 });
  // Ground edge: a bright band along the concave edge, both faces.
  for (let i = N; i >= 1; i--) { const t = i / N; grind.push(bz([0.042, -0.014], [0.08, -0.002], tip, t)); }
  const inner = grind.map(([s, y], i) => { const t = (N - i) / N, w = 0.0075 * Math.min(1, t * 4) * Math.min(1, (1 - t) * 6 + 0.2); return [s + w * 0.35, y + w]; }).reverse();
  k.side([...grind.map(([s, y]) => [s, y]), ...inner.map(([s, y]) => [s, y])], 0.0058, edge, { bevel: 0.0004 });
  for (let i = 0; i < 6; i++) { const [s, y] = bz([0.026, 0.013], [0.126, 0.046], tip, 0.08 + i * 0.035); k.rb(0.0058, 0.003, 0.0016, 0.0005, steel, 0, y + 0.0005, -s, -0.25 + i * 0.03); }
  // Full tang and finger ring (steel, ring cut through).
  const ring = poly(-0.072, -0.004, 0.0165, 24).map(([s, y]) => [s, y]);
  k.side([...poly(-0.072, -0.004, 0.0265, 24).map(([s, y]) => [s, y])], 0.0062, steel, { bevel: 0.0012, holes: [ring] });
  // Handle: curved, finger grooves under; red liner sandwiched between tang and G10 scales.
  const H = [[-0.05, 0.012, 0.008], [0.0, 0.018, 0.02], [0.036, 0.016, 0.006], [0.044, 0.002, 0.004], [0.042, -0.016, 0.006], [0.028, -0.022, 0.008], [0.016, -0.016, 0.006], [0.004, -0.024, 0.008],
    [-0.01, -0.018, 0.006], [-0.024, -0.026, 0.008], [-0.04, -0.022, 0.008], [-0.054, -0.012, 0.006]];
  k.side(H, 0.0055, steel, { bevel: 0.001 });
  k.side(H, 0.0085, W.red(), { bevel: 0.0008 });
  for (const sx of [-1, 1]) k.side(H.map(([s, y, r]) => [s + 0.002 * Math.sign(s), y * 0.94, r]), 0.0055, g10, { bevel: 0.0018, x: sx * 0.0068 });
  for (const s of [-0.036, 0.0, 0.03]) k.cyl(0.0032, 0.0032, 0.0222, steel, 0, s === 0 ? 0.0 : -0.002, -s, 0, 0, PI / 2, 14);
  g.userData = { grip: V(0, -0.004, 0.0), ring: V(0, -0.004, 0.072), tip: V(0, tip[1], -tip[0]) };
  shade(g); return g;
}


// GENERATED from the NightWatch bible (tools/render/hero-guns-a.js) by export_hero_to_game.py. Edit there, re-export.
// Hero-tier guns (a) [PROPOSED]: the class weapons of the Recce, Breacher, Bulwark, Corpsman and Cyber, rebuilt to the
// hero bar of heroX4() / heroVX7() in hero.js: extruded side profiles with fillets and bevels, cut-through holes, lathed
// barrels and tubes, rounded boxes, the master toon material, outlines and wear.
//   R4 Lark   (Recce)    armory.js lark(): light 16" recce rifle, LPVO, long can, folded bipod, adjustable stock
//   B12       (Breacher) Killhouse src/nw/guns.js buildB12(): pump breaching shotgun, box mag, stand-off muzzle
//   T60       (Bulwark)  Killhouse buildT60(): suppressed belt-fed LMG, feed cover, carry handle, bipod, belt pouch
//   K9 Hush   (Corpsman) Sniper Cell src/cell/arms.js buildSMG(): integrally suppressed SMG
//   Owl       (Cyber)    armory.js owl(): the RF-dart cyber rifle (dart tube, emitter rings, cyan status strip)
// Contract (as the X4 / VX-7): muzzle -Z, 1 unit = 1 m, userData = { gripR, gripL, muzzle, sight, handR, handL }.
import * as THREE from 'three';
import { hm, GLOW, K, decal, decalMesh, outline, shade, RIM } from './hero.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const PI = Math.PI;

// ---------------------------------------------------------------------------------------------
// Palette (the hero weapon palette, plus brass, a single red and the cyber cyan)
// ---------------------------------------------------------------------------------------------
const P = {
  gm: () => hm('#2a2d31', 'plate', { wear: 0.6 }),
  poly: () => hm('#2c2f33', 'plate', { wear: 0.6 }),
  steel: () => hm('#2b2e33', 'hard'),
  dark: () => hm('#17181b', 'hard', { wear: 0.5 }),
  olive: () => hm('#3e4436', 'plate', { wear: 0.7, wearCol: '#b0a888' }),
  ranger: () => hm('#3d4232', 'plate', { wear: 0.7, wearCol: '#b0a888' }),
  fde: () => hm('#5f533e', 'plate', { wear: 0.6, wearCol: '#c9b48e' }),
  tan: () => hm('#6b5d45', 'plate', { wear: 0.6, wearCol: '#c9b48e' }),
  rubber: () => hm('#121314', 'cloth', { paint: 0.08 }),
  brass: () => hm('#a8843e', 'hard', { wear: 0.15, spec: 1, wearCol: '#e8d08a' }),
  red: () => hm('#d0303c', 'plate', { wear: 0, emissive: '#d0303c', ei: 0.35 }),
  cyberGrey: () => hm('#33373d', 'plate', { wear: 0.55 }),
};
// Lathed parts take a low-wear variant of their material: the bevel-wear mask reads every curved normal as an edge.
const LOW = new Map();
function lowWear(m) {
  if (!LOW.size) for (const [c, k] of [['#17181b', 'hard'], ['#2b2e33', 'hard'], ['#26292d', 'hard'], ['#2a2d32', 'hard'], ['#3a3e44', 'plate'], ['#454a52', 'hard']]) {
    const base = c === '#17181b' ? P.dark() : c === '#3a3e44' ? hm(c, 'plate', { wear: 0.6 }) : hm(c, k);
    LOW.set(base, hm(c, k, { wear: 0.03 }));
  }
  return LOW.get(m) || m;
}
// K() with lathes on low-wear materials.
// Curved lathes also skip receiving shadows: at this scale the shadow map acnes them into blotches.
function KL(g) {
  const k = K(g), b = k.barrel, l = k.lathe, nr = (o) => { o.userData.noRecv = true; return o; };
  k.barrel = (prof, m, ...a) => nr(b(prof, lowWear(m), ...a)); k.lathe = (prof, m, ...a) => nr(l(prof, lowWear(m), ...a)); return k;
}
// Slide a canon-layout gun back so its pistol grip sits where the VX-7's does (z ≈ 0.1): the hero rig places every gun
// by its origin, so this puts the stock in the shoulder and the fist where the VX-7's goes. Anchors move with it.
function rebase(g, dz) {
  for (const c of g.children) c.position.z += dz;
  const U = g.userData;
  for (const k of ['gripR', 'gripL', 'muzzle']) U[k].z += dz;
  for (const h of [U.handR, U.handL]) { h.at.z += dz; h.wrist.z += dz; }
  return g;
}
function finish(g) { shade(g); g.traverse((o) => { if (o.userData.noRecv) o.receiveShadow = false; }); return g; }
const glassM = () => new THREE.MeshBasicMaterial({ color: '#3a6a74', transparent: true, opacity: 0.24, depthWrite: false });

// ---------------------------------------------------------------------------------------------
// Shared parts (the family resemblance: same grip, guard, rail and can language as the VX-7)
// ---------------------------------------------------------------------------------------------
const sh = (pts, ds = 0, dy = 0) => pts.map(([s, y, r]) => [s + ds, y + dy, r || 0]);
const bar = (k, s0, s1, r, m, x = 0, y = 0, seg = 24) => k.barrel([[0.0001, s0], [r, s0], [r, s1], [0.0001, s1]], m, x, y, seg);
// A rounded "pill" hole for a side profile: s0..s1 along the gun, y0..y1.
const slot = (s0, s1, y0, y1, r) => { r = r ?? Math.min(s1 - s0, y1 - y0) * 0.49; return [[s0, y0, r], [s1, y0, r], [s1, y1, r], [s0, y1, r]]; };

// The VX-7 pistol grip: finger grooves, palm swell, raked back; backstrap texture. Origin at the top of the grip.
const GRIP = [[0.022, 0.0], [0.02, -0.03, 0.008], [0.025, -0.045, 0.006], [0.015, -0.06, 0.008], [0.019, -0.075, 0.006], [0.01, -0.09, 0.008], [0.008, -0.118, 0.006],
  [-0.04, -0.118, 0.008], [-0.033, -0.075, 0.02], [-0.03, -0.02, 0.01], [-0.034, 0.0]];
function pistolGrip(g, s, y, m, rake = -0.22) {
  const grip = new THREE.Group(); grip.position.set(0, y, -s); grip.rotation.x = rake; g.add(grip);
  const kg = K(grip), dark = P.dark();
  kg.side(GRIP, 0.036, m, { bevel: 0.004 });
  for (let i = 0; i < 5; i++) kg.rb(0.038, 0.0026, 0.008, 0.001, dark, 0, -0.032 - i * 0.012, 0.031 + i * 0.0004);
  kg.rb(0.039, 0.01, 0.05, 0.003, m, 0, -0.114, 0.008);   // flared base
  return grip;
}
// The right hand closes on the grip: the VX-7's spec, solved for this grip's origin and rake.
function handRFor(s, y, rake = -0.22) {
  const at = V(0, -0.052, 0.009).applyAxisAngle(V(1, 0, 0), rake).add(V(0, y, -s));
  return { at, axis: V(0, -Math.cos(rake), -Math.sin(rake)), r: 0.02, back: [0.03, -0.008], arc: [-0.1 * PI, 1.15 * PI], wrist: at.clone().add(V(0.032, 0.008, 0.06)) };
}
// The support hand wrapped round a handguard / pump of half-height ~r-0.005 (the VX-7's spec, scaled).
function handLFor(s, y, r = 0.04) {
  const k = r / 0.04;
  return { at: V(0, y, -s), axis: V(0, 0, -1), r, back: [-0.03 * k, -0.034 * k], arc: [-0.55 * PI, 0.95 * PI], wrist: V(-0.05 * k, y - 0.076 * k, -s + 0.06) };
}
// Trigger guard loop and trigger (VX-7 positions; shift with ds/dy).
function guard(k, m, ds = 0, dy = 0) {
  k.side(sh([[-0.1, -0.03], [-0.02, -0.03], [-0.02, -0.048, 0.006], [-0.05, -0.068, 0.012], [-0.09, -0.07, 0.01], [-0.11, -0.05]], ds, dy), 0.03, m,
    { bevel: 0.0015, holes: [sh([[-0.088, -0.038, 0.002], [-0.028, -0.038, 0.002], [-0.03, -0.05, 0.005], [-0.055, -0.062, 0.008], [-0.084, -0.062, 0.006]], ds, dy)] });
  k.side(sh([[-0.055, -0.037], [-0.049, -0.037], [-0.05, -0.048, 0.004], [-0.058, -0.056, 0.003], [-0.061, -0.054], [-0.056, -0.046]], ds, dy), 0.007, P.steel(), { bevel: 0.001 });
}
// Picatinny: base strip and teeth from s0 to s1, base centred at y.
function rail(k, s0, s1, y, w = 0.03) {
  const steel = P.steel();
  k.rb(w, 0.008, s1 - s0, 0.002, steel, 0, y, -(s0 + s1) / 2);
  for (let s = s0 + 0.008; s < s1 - 0.006; s += 0.022) k.rb(w + 0.006, 0.0055, 0.011, 0.0015, steel, 0, y + 0.0055, -s - 0.0055);
}
// Knurled cap: ribs round a lathed knob whose axis is +Y of the given group.
function knurl(kk, r, h, n, m, y0 = 0) { for (let i = 0; i < n; i++) { const a = (i / n) * PI * 2; kk.rb(0.0022, h, 0.0022, 0.0006, m, Math.cos(a) * r, y0 + h / 2, Math.sin(a) * r, 0, -a, 0); } }
function engrave(g, key, text, w, h, x, y, s) {
  const tag = decal(key, 512, 64, (c) => { c.fillStyle = '#fff'; c.font = '600 34px "JetBrains Mono", monospace'; c.textBaseline = 'middle'; c.fillText(text, 6, 34); });
  const dm = decalMesh(tag, w, h, '#8d949c'); dm.position.set(x, y, -s); dm.rotation.y = PI / 2; g.add(dm); return dm;
}
// Sling QD cup.
const qd = (k, x, y, s) => { k.cyl(0.0065, 0.0065, 0.006, P.steel(), x, y, -s, 0, 0, PI / 2, 16); k.torus(0.009, 0.0022, P.steel(), x + Math.sign(x) * 0.006, y, -s, 0, PI / 2, 0); };

// ---------------------------------------------------------------------------------------------
// R4 LARK (Recce): light 16" recce rifle. FDE furniture, slim slotted handguard, LPVO, long can, folded bipod.
// ---------------------------------------------------------------------------------------------
export function heroLark() {
  const g = new THREE.Group(), k = KL(g);
  const gm = P.gm(), steel = P.steel(), dark = P.dark(), fde = P.fde(), rub = P.rubber();
  // Upper receiver: forward-assist bump, port and dust cover, charging handle.
  k.side([[-0.16, 0.0, 0.003], [0.168, 0.0, 0.003], [0.17, 0.036, 0.004], [0.163, 0.04, 0.002], [-0.14, 0.04, 0.004], [-0.162, 0.03, 0.008]], 0.054, gm, { bevel: 0.003 });
  k.rb(0.012, 0.022, 0.03, 0.005, gm, 0.029, 0.026, 0.11);
  k.cyl(0.006, 0.006, 0.006, steel, 0.036, 0.026, 0.11, 0, 0, PI / 2, 16);
  k.rb(0.004, 0.02, 0.058, 0.002, dark, 0.0275, 0.018, -0.01);
  k.rb(0.002, 0.015, 0.052, 0.001, steel, 0.0287, 0.018, -0.01);
  k.rb(0.056, 0.008, 0.016, 0.003, steel, 0, 0.034, 0.168);
  k.rb(0.012, 0.01, 0.012, 0.003, steel, -0.032, 0.034, 0.164);
  // Lower: magwell flare, trigger guard, pins, selector.
  k.side([[-0.16, 0.002, 0.004], [0.16, 0.002, 0.004], [0.156, -0.034, 0.01], [0.1, -0.043, 0.006], [0.03, -0.043, 0.006], [0.0, -0.034, 0.006], [-0.16, -0.034, 0.008]], 0.056, gm, { bevel: 0.003 });
  k.side([[0.1, -0.035], [0.12, -0.048, 0.004], [0.112, -0.06, 0.004], [0.026, -0.06, 0.004], [0.018, -0.04, 0.004], [0.026, -0.035]], 0.06, gm, { bevel: 0.002 });
  guard(k, gm);
  for (const s of [-0.15, 0.15]) k.cyl(0.005, 0.005, 0.06, steel, 0, -0.012, -s, 0, 0, PI / 2, 14);
  k.rb(0.004, 0.008, 0.03, 0.002, steel, -0.0295, -0.012, 0.05, 0.4);
  k.rb(0.006, 0.012, 0.012, 0.003, steel, 0.0285, -0.022, -0.012);   // mag release
  pistolGrip(g, -0.1, -0.03, dark);
  // 20-round mag: straighter than the VX-7's, ribbed, FDE base pad.
  const mf = [], mb = [], N = 8;
  for (let i = 0; i <= N; i++) { const t = i / N; mf.push([0.104 + 0.028 * t * t, -0.05 - 0.128 * t, 0]); }
  for (let i = N; i >= 0; i--) { const [s, y] = mf[i]; mb.push([s - 0.07, y + 0.004, 0]); }
  mf[N][2] = 0.008; mb[0][2] = 0.006;
  k.side([...mf, ...mb], 0.028, dark, { bevel: 0.003 });
  k.side([[0.138, -0.172, 0.003], [0.058, -0.17, 0.003], [0.056, -0.186, 0.005], [0.142, -0.188, 0.005]], 0.032, fde, { bevel: 0.002 });
  for (let i = 0; i < 3; i++) { const t = 0.25 + i * 0.25, y = -0.05 - 0.128 * t; k.rb(0.0295, 0.003, 0.058, 0.001, dark, 0, y, -(0.104 + 0.028 * t * t - 0.035), 0.056 * t); }
  // Slim free-float handguard (FDE): long slots cut through (the barrel shows inside), a row of round vents.
  const holes = [];
  for (let i = 0; i < 7; i++) { const s0 = 0.2 + i * 0.054; holes.push(slot(s0, s0 + 0.036, -0.002, 0.012)); }
  for (let i = 0; i < 13; i++) { const s0 = 0.196 + i * 0.03; holes.push(slot(s0, s0 + 0.01, -0.02, -0.01)); }
  k.side([[0.168, 0.036, 0.004], [0.588, 0.036, 0.008], [0.6, 0.026, 0.006], [0.6, -0.02, 0.006], [0.588, -0.028, 0.008], [0.168, -0.028, 0.004]], 0.05, fde, { bevel: 0.0035, holes });
  bar(k, 0.16, 0.61, 0.0105, dark, 0, 0.004);
  k.barrel([[0.0001, 0.548], [0.015, 0.548], [0.016, 0.552], [0.016, 0.57], [0.015, 0.574], [0.0001, 0.574]], steel, 0, 0.004);   // gas block
  rail(k, -0.15, 0.6, 0.04);
  for (const s of [0.24, 0.45]) k.rb(0.054, 0.006, 0.024, 0.002, dark, 0, 0.036, -s);   // rail clamp bands
  qd(k, -0.026, -0.008, 0.2);
  // Long suppressor: stepped mount, raised heat rings, flat end cap with a bore.
  k.barrel([[0.0001, 0.598], [0.017, 0.598], [0.019, 0.604], [0.022, 0.608], [0.022, 0.62], [0.0001, 0.62]], steel, 0, 0.004);
  k.barrel([[0.0001, 0.618], [0.022, 0.618], [0.0265, 0.624], [0.0265, 0.848], [0.0245, 0.856], [0.0095, 0.858], [0.0075, 0.852], [0.0001, 0.852]], dark, 0, 0.004);
  for (let i = 0; i < 4; i++) { const s = 0.65 + i * 0.05; k.barrel([[0.0265, s], [0.0277, s + 0.002], [0.0277, s + 0.008], [0.0265, s + 0.01]], steel, 0, 0.004); }
  // LPVO: ocular bell, magnification ring with throw lever and the red index, tube, turret saddle, objective bell.
  const sy = 0.093;
  k.barrel([[0.0001, -0.095], [0.019, -0.095], [0.0215, -0.09], [0.0215, -0.06], [0.019, -0.048], [0.0001, -0.048]], rub, 0, sy);
  k.barrel([[0.0001, -0.05], [0.0205, -0.05], [0.0205, -0.022], [0.016, -0.016], [0.0001, -0.016]], dark, 0, sy);
  for (let i = 0; i < 18; i++) { const a = (i / 18) * PI * 2; k.rb(0.003, 0.003, 0.02, 0.0008, dark, Math.cos(a) * 0.021, sy + Math.sin(a) * 0.021, 0.036); }
  k.rb(0.006, 0.018, 0.008, 0.002, steel, 0.024, sy + 0.01, 0.034, 0, 0, -0.6);    // throw lever
  k.rb(0.0035, 0.003, 0.007, 0.001, P.red(), 0, sy + 0.0218, 0.03);                // the red index mark
  k.barrel([[0.0001, -0.018], [0.0165, -0.018], [0.0165, 0.17], [0.0001, 0.17]], dark, 0, sy);
  k.rb(0.034, 0.03, 0.05, 0.008, dark, 0, sy, -0.06);
  k.barrel([[0.0001, 0.168], [0.0165, 0.168], [0.0235, 0.198], [0.0235, 0.202], [0.0235, 0.236], [0.0222, 0.24], [0.0001, 0.24]], dark, 0, sy);
  k.barrel([[0.0235, 0.226], [0.0245, 0.228], [0.0245, 0.236], [0.0235, 0.238]], steel, 0, sy);
  const tg = new THREE.Group(); tg.position.set(0, sy + 0.014, -0.06); g.add(tg);   // elevation turret (top)
  KL(tg).lathe([[0.0001, 0], [0.012, 0], [0.012, 0.004], [0.0115, 0.006], [0.0115, 0.017], [0.01, 0.019], [0.0001, 0.019]], steel, 0, 0, 0); knurl(K(tg), 0.0115, 0.01, 16, dark, 0.006);
  const tw = new THREE.Group(); tw.position.set(0.016, sy, -0.06); tw.rotation.z = -PI / 2; g.add(tw);   // windage (right)
  KL(tw).lathe([[0.0001, 0], [0.011, 0], [0.011, 0.012], [0.0095, 0.014], [0.0001, 0.014]], steel, 0, 0, 0); knurl(K(tw), 0.011, 0.008, 14, dark, 0.004);
  const ti = new THREE.Group(); ti.position.set(-0.016, sy, -0.06); ti.rotation.z = PI / 2; g.add(ti);    // illumination (left)
  KL(ti).lathe([[0.0001, 0], [0.0095, 0], [0.0095, 0.01], [0.008, 0.012], [0.0001, 0.012]], dark, 0, 0, 0);
  const lensO = new THREE.Mesh(new THREE.CircleGeometry(0.02, 28), glassM()); lensO.position.set(0, sy, -0.2405); g.add(lensO);
  const lensE = new THREE.Mesh(new THREE.CircleGeometry(0.017, 28), glassM()); lensE.position.set(0, sy, 0.0955); lensE.rotation.y = PI; g.add(lensE);
  // Cantilever mount: base on the rail, two rings.
  k.rb(0.026, 0.008, 0.19, 0.003, dark, 0, 0.0545, -0.06);
  for (const s of [-0.005, 0.125]) {
    k.torus(0.0172, 0.004, dark, 0, sy, -s, 0, 0, 0);
    k.side([[s - 0.008, 0.052, 0.002], [s + 0.008, 0.052, 0.002], [s + 0.007, sy - 0.012, 0.003], [s - 0.007, sy - 0.012, 0.003]], 0.02, dark, { bevel: 0.002 });
    k.cyl(0.003, 0.003, 0.034, steel, 0, 0.066, -s, 0, 0, PI / 2, 10);
  }
  // Folded bipod: clamp, pivot, telescoping legs swung back under the handguard, rubber feet.
  k.rb(0.036, 0.016, 0.034, 0.005, dark, 0, -0.035, -0.56);
  k.cyl(0.004, 0.004, 0.044, steel, 0, -0.04, -0.56, 0, 0, PI / 2, 12);
  for (const x of [-0.012, 0.012]) {
    k.barrel([[0.0001, 0.475], [0.0058, 0.475], [0.0058, 0.555], [0.0001, 0.555]], dark, x, -0.046);
    k.barrel([[0.0001, 0.415], [0.0042, 0.415], [0.0042, 0.476], [0.0001, 0.476]], steel, x, -0.046);
    k.barrel([[0.0055, 0.474], [0.0068, 0.476], [0.0068, 0.484], [0.0055, 0.486]], dark, x, -0.046);
    k.ball(0.0075, rub, x, -0.046, -0.412, 1, 1, 1.3);
  }
  // Adjustable stock: buffer tube, FDE stock with cut-out, cheek riser on posts with a lock knob, rubber butt.
  bar(k, -0.37, -0.16, 0.016, dark, 0, 0.012);
  k.side([[-0.19, 0.034, 0.008], [-0.36, 0.04, 0.01], [-0.395, 0.046, 0.01], [-0.403, -0.07, 0.012], [-0.38, -0.078, 0.008], [-0.33, -0.03, 0.02], [-0.19, -0.014, 0.01]], 0.048, fde,
    { bevel: 0.004, holes: [[[-0.29, 0.018, 0.008], [-0.35, 0.024, 0.008], [-0.365, -0.014, 0.01], [-0.31, -0.006, 0.008]]] });
  k.side([[-0.235, 0.05, 0.004], [-0.39, 0.056, 0.004], [-0.39, 0.074, 0.008], [-0.25, 0.068, 0.012]], 0.036, fde, { bevel: 0.003 });
  for (const s of [-0.27, -0.35]) k.cyl(0.004, 0.004, 0.016, steel, 0, 0.046, -s, 0, 0, 0, 10);
  k.lathe([[0.0001, 0], [0.008, 0], [0.008, 0.008], [0.006, 0.01], [0.0001, 0.01]], steel, 0.024, 0.05, 0.31, 0, 0, -PI / 2);
  k.side([[-0.399, 0.046, 0.006], [-0.413, 0.046, 0.004], [-0.419, -0.072, 0.008], [-0.403, -0.078, 0.004]], 0.05, rub, { bevel: 0.002 });
  for (let i = 0; i < 7; i++) k.rb(0.048, 0.003, 0.004, 0.001, rub, 0, -0.06 + i * 0.016, 0.4155 + (0.06 - i * 0.016) * 0.05);
  qd(k, 0.024, -0.04, -0.36);
  engrave(g, 'lark', 'R4 LARK  ·  SAFE  SEMI', 0.12, 0.015, 0.0283, -0.019, 0.097);
  g.userData = {
    gripR: V(0, -0.075, 0.115), gripL: V(0, -0.03, -0.3), muzzle: V(0, 0.004, -0.858), sight: sy,
    handR: handRFor(-0.1, -0.03, -0.22), handL: handLFor(0.3, 0.004, 0.037),
  };
  return finish(g);
}

// ---------------------------------------------------------------------------------------------
// B12 (Breacher): the canon Killhouse pump breaching shotgun, 7-round box mag, ghost-ring irons, stand-off muzzle.
// ---------------------------------------------------------------------------------------------
export function heroB12() {
  const g = new THREE.Group(), k = KL(g);
  const steel = hm('#26292d', 'hard'), poly = hm('#2a2c30', 'plate', { wear: 0.6 }), dark = P.dark(), olive = P.olive(), rub = P.rubber();
  // Receiver: chamfered nose, sloped rear, scalloped flank; port, rail, bolt release.
  k.side([[-0.045, -0.022, 0.004], [0.2, -0.022, 0.004], [0.207, 0.0, 0.006], [0.2, 0.046, 0.004], [-0.03, 0.046, 0.004], [-0.048, 0.03, 0.01]], 0.052, steel, { bevel: 0.003 });
  k.side([[0.02, 0.004, 0.006], [0.18, 0.004, 0.006], [0.18, 0.034, 0.006], [0.02, 0.034, 0.006]], 0.0545, hm('#202326', 'hard'), { bevel: 0.002 });
  k.rb(0.004, 0.026, 0.074, 0.003, dark, 0.026, 0.02, -0.06);
  k.rb(0.002, 0.008, 0.06, 0.001, steel, 0.0278, 0.009, -0.06);
  k.rb(0.006, 0.01, 0.018, 0.003, steel, -0.028, 0.014, -0.12);
  rail(k, 0.0, 0.16, 0.05);
  // Lower: trigger housing, magwell, guard, pins.
  k.side([[-0.05, -0.018], [0.165, -0.018], [0.165, -0.034, 0.006], [0.05, -0.034], [-0.05, -0.03, 0.006]], 0.05, poly, { bevel: 0.0025 });
  k.side([[0.048, -0.026], [0.152, -0.026], [0.158, -0.046, 0.005], [0.046, -0.046, 0.005]], 0.052, poly, { bevel: 0.0025 });
  guard(k, poly, 0.065, 0.01);
  for (const s of [-0.03, 0.18]) k.cyl(0.0045, 0.0045, 0.056, steel, 0, -0.008, -s, 0, 0, PI / 2, 14);
  pistolGrip(g, -0.035, -0.02, poly, -0.28);
  // 7-shell box mag with witness windows cut through: shells visible inside.
  const win = [0, 1, 2].map((i) => slot(0.072, 0.13, -0.07 - i * 0.03, -0.056 - i * 0.03, 0.006));
  k.side([[0.056, -0.03], [0.144, -0.03], [0.144, -0.158, 0.006], [0.056, -0.158, 0.006]], 0.04, poly, { bevel: 0.0025, holes: win });
  for (let i = 0; i < 3; i++) {
    const y = -0.063 - i * 0.03;
    k.barrel([[0.0001, 0.064], [0.0108, 0.064], [0.0108, 0.08], [0.0001, 0.08]], P.brass(), 0, y, 20);
    k.barrel([[0.0001, 0.08], [0.0104, 0.08], [0.0104, 0.136], [0.0001, 0.136]], hm('#4a5238', 'plate', { wear: 0.2 }), 0, y, 20);
  }
  k.side([[0.05, -0.155, 0.003], [0.15, -0.155, 0.003], [0.153, -0.17, 0.005], [0.047, -0.17, 0.005]], 0.046, olive, { bevel: 0.002 });
  k.rb(0.044, 0.006, 0.012, 0.002, dark, 0, -0.04, -0.15);
  // Barrel and a vented heat shield (oval vents cut through; the barrel shows).
  bar(k, 0.2, 0.79, 0.0145, dark, 0, 0.022);
  const vents = []; for (let i = 0; i < 8; i++) { const s0 = 0.29 + i * 0.044; vents.push(slot(s0, s0 + 0.028, 0.022, 0.038)); }
  k.side([[0.26, 0.012, 0.004], [0.66, 0.012, 0.004], [0.665, 0.03, 0.006], [0.655, 0.048, 0.006], [0.27, 0.048, 0.006], [0.255, 0.034, 0.006]], 0.036, poly, { bevel: 0.003, holes: vents });
  for (const s of [0.268, 0.652]) k.barrel([[0.0001, s - 0.008], [0.0188, s - 0.008], [0.019, s - 0.006], [0.019, s + 0.006], [0.0188, s + 0.008], [0.0001, s + 0.008]], steel, 0, 0.022);
  // Breaching muzzle: ported body and six stand-off teeth.
  k.barrel([[0.0001, 0.772], [0.0175, 0.772], [0.022, 0.78], [0.022, 0.836], [0.0205, 0.842], [0.0001, 0.842]], steel, 0, 0.022);
  for (let i = 0; i < 6; i++) { const a = (i / 6) * PI * 2; k.rb(0.006, 0.006, 0.026, 0.002, dark, Math.cos(a) * 0.0205, 0.022 + Math.sin(a) * 0.0205, -0.806, 0, 0, a); }
  for (let i = 0; i < 6; i++) {
    const t = new THREE.Group(); t.position.set(0, 0.022, 0); t.rotation.z = (i / 6) * PI * 2 + PI / 6; g.add(t);
    K(t).side([[0.836, 0.012, 0], [0.842, 0.0225, 0.002], [0.868, 0.0185, 0.002], [0.866, 0.012, 0.001]], 0.009, steel, { bevel: 0.0012 });
  }
  // Front sight: barrel band, post with protective ears, the red fibre.
  k.barrel([[0.0001, 0.73], [0.0175, 0.73], [0.0175, 0.75], [0.0001, 0.75]], dark, 0, 0.022);
  k.face([[-0.012, 0.034], [0.012, 0.034], [0.012, 0.078, 0.004], [0.008, 0.078], [0.008, 0.052], [-0.008, 0.052], [-0.008, 0.078], [-0.012, 0.078, 0.004]], 0.01, dark, { z: -0.74 });
  k.rb(0.004, 0.026, 0.008, 0.0015, dark, 0, 0.058, -0.74);
  k.ball(0.0028, GLOW('#ff3040', 2.4), 0, 0.07, -0.7355);
  // Ghost-ring rear: protective ears and the aperture.
  const sy = 0.07;
  k.rb(0.032, 0.008, 0.02, 0.003, dark, 0, 0.058, -0.005);
  k.face([[-0.018, 0.054], [0.018, 0.054], [0.018, 0.086, 0.003], [0.013, 0.086, 0.002], [0.013, 0.064], [-0.013, 0.064], [-0.013, 0.086, 0.002], [-0.018, 0.086, 0.003]], 0.014, dark, { z: -0.005 });
  k.torus(0.0072, 0.0026, steel, 0, sy, -0.005, 0, 0, 0);
  k.rb(0.004, 0.006, 0.006, 0.001, steel, 0, 0.0605, -0.005);
  // Pump forend (olive): flared ends, grip grooves; action bars back into the receiver.
  k.side([[0.3, 0.022, 0.006], [0.5, 0.022, 0.006], [0.505, 0.008, 0.004], [0.502, -0.038, 0.006], [0.48, -0.036, 0.006], [0.47, -0.03, 0.008], [0.33, -0.03, 0.008], [0.32, -0.036, 0.006], [0.298, -0.038, 0.006], [0.296, 0.008, 0.004]], 0.058, olive, { bevel: 0.004 });
  for (let i = 0; i < 6; i++) for (const sx of [-1, 1]) k.rb(0.004, 0.034, 0.008, 0.0015, dark, sx * 0.0292, -0.006, -(0.345 + i * 0.022));
  for (const sx of [-1, 1]) k.rb(0.004, 0.008, 0.11, 0.002, steel, sx * 0.022, -0.004, -0.25);
  // Collapsible stock: buffer tube, stock body with a cut-out, rubber pad, latch.
  k.barrel([[0.0001, -0.25], [0.016, -0.25], [0.016, -0.045], [0.0001, -0.045]], steel, 0, 0.012);
  for (let i = 0; i < 5; i++) k.rb(0.005, 0.004, 0.006, 0.001, dark, 0, -0.005, 0.07 + i * 0.022);
  k.side([[-0.14, 0.034, 0.008], [-0.29, 0.042, 0.008], [-0.296, -0.07, 0.01], [-0.26, -0.075, 0.01], [-0.2, -0.03, 0.02], [-0.14, -0.022, 0.008]], 0.042, poly,
    { bevel: 0.004, holes: [[[-0.2, 0.018, 0.008], [-0.262, 0.024, 0.008], [-0.27, -0.03, 0.01], [-0.23, -0.018, 0.01]]] });
  k.side([[-0.294, 0.044, 0.006], [-0.31, 0.044, 0.004], [-0.316, -0.072, 0.008], [-0.298, -0.074, 0.004]], 0.046, rub, { bevel: 0.002 });
  k.rb(0.03, 0.006, 0.024, 0.002, dark, 0, -0.026, 0.16);
  qd(k, -0.022, 0.0, 0.25);
  engrave(g, 'b12', 'B12  ·  BREACH  ·  12GA', 0.12, 0.015, 0.0268, -0.008, 0.1);
  g.userData = {
    gripR: V(0, -0.08, 0.04), gripL: V(0, -0.044, -0.41), muzzle: V(0, 0.022, -0.868), sight: sy,
    handR: handRFor(-0.035, -0.02, -0.28), handL: handLFor(0.4, -0.006, 0.035),
  };
  return finish(rebase(g, 0.065));
}

// ---------------------------------------------------------------------------------------------
// T60 (Bulwark): the canon Killhouse belt-fed LMG. Hinged feed cover, carry handle, vented shroud, folded bipod,
// a soft 80-round belt pouch with the belt rising into the feed tray, skeleton stock, compact red dot, short can.
// ---------------------------------------------------------------------------------------------
export function heroT60() {
  const g = new THREE.Group(), k = KL(g);
  const metal = P.steel(), poly = hm('#26282c', 'plate', { wear: 0.6 }), dark = P.dark(), hi = hm('#3a3e44', 'plate', { wear: 0.6 }), olive = P.olive(), rub = P.rubber();
  // Receiver: tall, sloped nose, ribbed flank; port and charging handle on the right, feed port on the left.
  k.side([[-0.07, -0.028, 0.006], [0.27, -0.028, 0.004], [0.276, 0.0, 0.006], [0.268, 0.046, 0.004], [-0.06, 0.046, 0.004], [-0.075, 0.03, 0.01]], 0.064, metal, { bevel: 0.003 });
  for (const sx of [-1, 1]) k.rb(0.003, 0.006, 0.26, 0.0015, dark, sx * 0.032, -0.012, -0.12);
  k.rb(0.004, 0.03, 0.1, 0.003, dark, 0.032, 0.014, -0.08);
  k.rb(0.002, 0.024, 0.092, 0.001, metal, 0.0335, 0.014, -0.08);
  k.rb(0.006, 0.012, 0.12, 0.003, dark, 0.032, 0.03, -0.18);
  k.rb(0.016, 0.012, 0.014, 0.004, metal, 0.04, 0.03, -0.22);
  k.rb(0.004, 0.028, 0.07, 0.003, dark, -0.032, 0.014, -0.13);
  for (const s of [-0.055, 0.25]) k.cyl(0.0048, 0.0048, 0.068, metal, 0, -0.016, -s, 0, 0, PI / 2, 14);
  for (const sx of [-1, 1]) for (const [s, y] of [[0.235, 0.0], [0.255, 0.0], [0.235, 0.024], [0.255, 0.024], [-0.04, 0.03], [-0.04, 0.008]]) k.cyl(0.0034, 0.0034, 0.004, dark, sx * 0.032, y, -s, 0, 0, PI / 2, 10);   // trunnion rivets
  // Feed tray cover (hinged at the front, latch at the back), ribs, rail on top.
  k.side([[0.018, 0.044], [0.222, 0.044], [0.226, 0.054, 0.004], [0.21, 0.068, 0.006], [0.04, 0.068, 0.004], [0.016, 0.06, 0.006]], 0.068, hi, { bevel: 0.003 });
  for (const sx of [-1, 1]) k.rb(0.003, 0.008, 0.15, 0.0015, dark, sx * 0.0345, 0.056, -0.12);
  k.cyl(0.006, 0.006, 0.074, metal, 0, 0.052, -0.216, 0, 0, PI / 2, 16);
  k.rb(0.052, 0.012, 0.014, 0.004, metal, 0, 0.058, -0.012);
  rail(k, 0.04, 0.205, 0.072);
  // Compact red dot on a riser: a lathed open tube (you look down it), brightness knob, lens and dot.
  const sy = 0.112;
  k.rb(0.026, 0.024, 0.05, 0.005, dark, 0, 0.088, -0.1);
  k.rb(0.034, 0.008, 0.06, 0.003, dark, 0, 0.0805, -0.1);
  k.rb(0.006, 0.014, 0.02, 0.003, metal, -0.02, 0.08, -0.1);
  k.barrel([[0.0145, 0.066], [0.0185, 0.066], [0.0198, 0.07], [0.0198, 0.13], [0.0185, 0.134], [0.0145, 0.134], [0.0145, 0.066]], hm('#17181b', 'hard', { wear: 0.5, side: THREE.DoubleSide }), 0, sy, 32);
  for (const s of [0.068, 0.132]) k.barrel([[0.0195, s - 0.003], [0.0212, s - 0.002], [0.0212, s + 0.002], [0.0195, s + 0.003]], hi, 0, sy);
  const kb = new THREE.Group(); kb.position.set(0.019, sy, -0.1); kb.rotation.z = -PI / 2; g.add(kb);
  KL(kb).lathe([[0.0001, 0], [0.009, 0], [0.009, 0.01], [0.0075, 0.012], [0.0001, 0.012]], metal, 0, 0, 0); knurl(K(kb), 0.009, 0.008, 12, dark, 0.002);
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.0148, 24), glassM()); lens.position.set(0, sy, -0.133); g.add(lens);
  const dot = new THREE.Mesh(new THREE.CircleGeometry(0.0018, 12), GLOW('#ff3040', 3)); dot.position.set(0, sy, -0.127); g.add(dot);
  // Carry handle: a filleted loop over the barrel trunnion, on a clamp.
  k.side([[0.225, 0.048, 0.004], [0.378, 0.048, 0.004], [0.378, 0.058, 0.006], [0.364, 0.1, 0.012], [0.236, 0.1, 0.012], [0.225, 0.058, 0.006]], 0.016, dark,
    { bevel: 0.003, holes: [[[0.244, 0.062, 0.006], [0.358, 0.062, 0.006], [0.35, 0.086, 0.01], [0.25, 0.086, 0.01]]] });
  k.rb(0.03, 0.018, 0.034, 0.005, dark, 0, 0.04, -0.36);
  for (let i = 0; i < 6; i++) k.rb(0.018, 0.003, 0.006, 0.001, rub, 0, 0.1015, -(0.27 + i * 0.012));
  // Vented shroud: two rows of slots cut through (barrel and gas tube show), front collar.
  const vh = [];
  for (let i = 0; i < 6; i++) { const s0 = 0.3 + i * 0.046; vh.push(slot(s0, s0 + 0.03, 0.017, 0.029)); vh.push(slot(s0 + 0.008, s0 + 0.022, -0.006, 0.004)); }
  k.side([[0.27, 0.037, 0.004], [0.585, 0.037, 0.008], [0.592, 0.026, 0.004], [0.592, -0.006, 0.004], [0.585, -0.013, 0.006], [0.27, -0.013, 0.004]], 0.05, poly, { bevel: 0.004, holes: vh });
  bar(k, 0.26, 0.86, 0.0135, dark, 0, 0.02);
  bar(k, 0.26, 0.76, 0.008, metal, 0, -0.008, 16);
  k.rb(0.026, 0.044, 0.03, 0.006, dark, 0, 0.008, -0.755);
  k.barrel([[0.0001, 0.588], [0.022, 0.588], [0.024, 0.594], [0.024, 0.61], [0.022, 0.614], [0.0001, 0.614]], metal, 0, 0.012);
  // Short suppressor: knurled coupling, ported front cap.
  k.barrel([[0.0001, 0.83], [0.017, 0.83], [0.017, 0.848], [0.0001, 0.848]], metal, 0, 0.02);
  knurl(K((() => { const q = new THREE.Group(); q.position.set(0, 0.02, -0.83); q.rotation.x = -PI / 2; g.add(q); return q; })()), 0.017, 0.018, 18, dark, 0);
  k.barrel([[0.0001, 0.846], [0.019, 0.846], [0.0235, 0.852], [0.0235, 0.926], [0.021, 0.934], [0.008, 0.935], [0.0065, 0.93], [0.0001, 0.93]], dark, 0, 0.02);
  for (let i = 0; i < 2; i++) k.barrel([[0.0235, 0.872 + i * 0.03], [0.0247, 0.874 + i * 0.03], [0.0247, 0.88 + i * 0.03], [0.0235, 0.882 + i * 0.03]], metal, 0, 0.02);
  // IR aiming box on the right of the shroud (olive, dull red lens).
  k.rb(0.022, 0.03, 0.07, 0.006, olive, 0.04, 0.012, -0.42);
  k.rb(0.006, 0.02, 0.05, 0.002, metal, 0.028, 0.012, -0.42);
  k.cyl(0.0058, 0.0058, 0.004, dark, 0.043, 0.019, -0.456, PI / 2, 0, 0, 16); k.ball(0.004, GLOW('#ff3040', 1.2), 0.043, 0.019, -0.457, 1, 1, 0.4);
  // Bipod folded back under the shroud: clamp, pivot, telescoping legs, feet.
  k.rb(0.042, 0.02, 0.032, 0.006, dark, 0, -0.02, -0.6);
  k.cyl(0.0045, 0.0045, 0.05, metal, 0, -0.024, -0.6, 0, 0, PI / 2, 12);
  for (const x of [-0.014, 0.014]) {
    k.barrel([[0.0001, 0.48], [0.0062, 0.48], [0.0062, 0.598], [0.0001, 0.598]], dark, x, -0.028);
    k.barrel([[0.0001, 0.4], [0.0046, 0.4], [0.0046, 0.482], [0.0001, 0.482]], metal, x, -0.028);
    k.barrel([[0.006, 0.478], [0.0074, 0.48], [0.0074, 0.49], [0.006, 0.492]], dark, x, -0.028);
    k.ball(0.008, rub, x, -0.028, -0.397, 1, 1, 1.3);
  }
  // Grip, trigger housing and guard.
  k.side([[-0.075, -0.022], [0.06, -0.022], [0.06, -0.04, 0.006], [-0.075, -0.036, 0.006]], 0.048, poly, { bevel: 0.0025 });
  guard(k, poly, 0.06, 0.005);
  pistolGrip(g, -0.04, -0.025, poly, -0.28);
  // Belt pouch (soft, olive): flap with a pull tab, snaps, side straps, bracket; belt rising into the left feed port.
  const cloth = hm('#3e4436', 'cloth', { paint: 0.18, scale: 8 }), clothD = hm('#343a2e', 'cloth', { paint: 0.15 });
  k.rb(0.075, 0.118, 0.13, 0.02, cloth, -0.03, -0.097, -0.12);
  k.rb(0.08, 0.026, 0.136, 0.01, clothD, -0.03, -0.042, -0.12);
  k.rb(0.006, 0.05, 0.03, 0.003, clothD, -0.07, -0.06, -0.12);
  k.rb(0.012, 0.012, 0.024, 0.003, rub, -0.073, -0.084, -0.12);
  for (const s of [0.07, 0.17]) { k.rb(0.079, 0.106, 0.014, 0.003, clothD, -0.03, -0.1, -s); k.rb(0.012, 0.016, 0.018, 0.003, dark, -0.0705, -0.135, -s); }
  for (const s of [0.09, 0.15]) k.cyl(0.005, 0.005, 0.004, metal, -0.0705, -0.05, -s, 0, 0, PI / 2, 12);
  k.rb(0.004, 0.094, 0.02, 0.002, clothD, 0.0085, -0.1, -0.12);                     // right-face strap, buckle, ID tape
  k.rb(0.005, 0.018, 0.026, 0.003, dark, 0.009, -0.07, -0.12);
  const tape = decal('t60pouch', 512, 64, (c) => { c.fillStyle = '#fff'; c.font = '700 40px "JetBrains Mono", monospace'; c.textBaseline = 'middle'; c.fillText('80 · LINK', 12, 34); });
  const tm = decalMesh(tape, 0.05, 0.007, '#b8b39c'); tm.position.set(0.0084, -0.13, -0.075); tm.rotation.y = PI / 2; g.add(tm);
  k.rb(0.04, 0.012, 0.11, 0.004, dark, -0.012, -0.03, -0.12);
  k.rb(0.03, 0.004, 0.1, 0.002, metal, -0.036, -0.0325, -0.12);
  const BA = V(-0.062, -0.034, 0), BC = V(-0.07, 0.0, 0), BB = V(-0.036, 0.016, 0);
  for (let i = 0; i < 6; i++) {
    const t = i / 5, p = BA.clone().multiplyScalar((1 - t) * (1 - t)).addScaledVector(BC, 2 * t * (1 - t)).addScaledVector(BB, t * t);
    k.barrel([[0.0001, 0.098], [0.0058, 0.098], [0.0058, 0.142], [0.0001, 0.142]], P.brass(), p.x, p.y, 14);
    k.barrel([[0.0001, 0.142], [0.0052, 0.142], [0.0034, 0.156], [0.0001, 0.162]], hm('#7a5a32', 'hard', { wear: 0.1 }), p.x, p.y, 14);
    for (const s of [0.108, 0.13]) k.torus(0.0066, 0.0016, dark, p.x, p.y, -s, 0, 0, 0);
  }
  k.rb(0.006, 0.034, 0.07, 0.003, metal, -0.035, 0.012, -0.12);
  // Skeleton stock: one filleted frame with a big cut-out, cheek pad, rubber butt; sling cup.
  k.side([[-0.062, 0.036, 0.006], [-0.27, 0.04, 0.008], [-0.284, 0.05, 0.004], [-0.288, -0.078, 0.008], [-0.262, -0.077, 0.01], [-0.1, -0.046, 0.012], [-0.075, -0.03, 0.008], [-0.062, -0.02, 0.006]], 0.036, poly,
    { bevel: 0.0035, holes: [[[-0.09, 0.02, 0.006], [-0.252, 0.025, 0.008], [-0.256, -0.056, 0.01], [-0.115, -0.031, 0.01]]] });
  k.rb(0.03, 0.01, 0.13, 0.004, rub, 0, 0.044, 0.185);
  k.side([[-0.282, 0.052, 0.006], [-0.298, 0.052, 0.004], [-0.302, -0.08, 0.008], [-0.286, -0.082, 0.004]], 0.044, rub, { bevel: 0.002 });
  qd(k, 0.02, -0.06, -0.24);
  engrave(g, 't60', 'T60  ·  LMG  ·  SAFE  AUTO', 0.13, 0.016, 0.0335, -0.003, 0.03);
  g.userData = {
    gripR: V(0, -0.085, 0.035), gripL: V(0, -0.02, -0.33), muzzle: V(0, 0.02, -0.935), sight: sy, heavy: true,
    handR: handRFor(-0.04, -0.025, -0.28), handL: handLFor(0.335, 0.012, 0.031),
  };
  return finish(rebase(g, 0.065));
}

// ---------------------------------------------------------------------------------------------
// K9 HUSH (Corpsman / Spotter): the canon Sniper Cell SMG (buildSMG), integrally suppressed.
// ---------------------------------------------------------------------------------------------
export function heroK9() {
  const g = new THREE.Group(), k = KL(g);
  const metal = hm('#2a2d32', 'hard'), poly = hm('#25272b', 'plate', { wear: 0.6 }), dark = P.dark(), hi = hm('#454a52', 'hard'), tan = P.tan(), rub = P.rubber();
  // Upper: chamfered top deck, full-length rail, port, left-side charging handle in its slot.
  k.side([[-0.05, -0.017, 0.004], [0.29, -0.017, 0.004], [0.293, 0.02, 0.004], [0.286, 0.04, 0.004], [-0.044, 0.04, 0.004], [-0.053, 0.026, 0.006]], 0.05, metal, { bevel: 0.003 });
  k.rb(0.042, 0.012, 0.34, 0.004, metal, 0, 0.044, -0.12);
  for (let i = 0; i < 14; i++) k.rb(0.046, 0.006, 0.01, 0.0015, dark, 0, 0.053, 0.03 - i * 0.022 - 0.005);
  k.rb(0.004, 0.018, 0.054, 0.002, dark, 0.025, 0.02, -0.06);
  k.rb(0.002, 0.013, 0.048, 0.001, metal, 0.0262, 0.02, -0.06);
  k.rb(0.004, 0.008, 0.12, 0.002, dark, -0.025, 0.03, -0.09);
  k.rb(0.014, 0.012, 0.026, 0.004, metal, -0.032, 0.03, -0.05);
  // Handguard: slotted (cut through, barrel inside), tan accent panel along the bottom.
  const hs = [];
  for (let i = 0; i < 4; i++) hs.push(slot(0.298 + i * 0.036, 0.322 + i * 0.036, 0.0, 0.014));
  k.side([[0.278, 0.031, 0.004], [0.436, 0.031, 0.006], [0.442, 0.022, 0.004], [0.442, -0.014, 0.004], [0.436, -0.019, 0.006], [0.278, -0.019, 0.004]], 0.056, poly, { bevel: 0.0035, holes: hs });
  bar(k, 0.27, 0.45, 0.0095, dark, 0, 0.008);
  k.side([[0.31, -0.016, 0.004], [0.43, -0.016, 0.004], [0.426, -0.028, 0.004], [0.314, -0.028, 0.004]], 0.058, tan, { bevel: 0.002 });
  // Lower: flared magwell, big trigger guard, textured grip.
  k.side([[-0.03, -0.012], [0.18, -0.012], [0.18, -0.028, 0.006], [0.152, -0.052, 0.006], [0.072, -0.052, 0.004], [0.064, -0.036, 0.004], [-0.03, -0.036, 0.006]], 0.042, poly, { bevel: 0.0025 });
  k.side([[0.068, -0.04], [0.156, -0.04], [0.158, -0.055, 0.004], [0.066, -0.055, 0.004]], 0.046, poly, { bevel: 0.002 });
  guard(k, poly, 0.07, 0.015);
  pistolGrip(g, -0.03, -0.015, poly, -0.3);
  k.cyl(0.0045, 0.0045, 0.046, metal, 0, -0.022, 0.02, 0, 0, PI / 2, 14);
  // Long 40-round mag, swept forward, ribbed, tan base.
  k.side([[0.077, -0.03], [0.127, -0.03], [0.146, -0.18, 0.004], [0.096, -0.18, 0.004]], 0.028, poly, { bevel: 0.0025 });
  for (let i = 0; i < 3; i++) { const y = -0.06 - i * 0.04; k.rb(0.0305, 0.004, 0.052, 0.0012, dark, 0, y, -(0.102 + (-0.03 - y) * 0.1206), 0.12); }
  k.side([[0.093, -0.176, 0.003], [0.15, -0.176, 0.003], [0.153, -0.19, 0.005], [0.096, -0.192, 0.005]], 0.034, tan, { bevel: 0.002 });
  // Integral suppressor: fluted shroud (lathed grooves), knurled coupling, the detachable can.
  const shroud = [[0.0001, 0.44], [0.024, 0.44], [0.027, 0.446]];
  for (let i = 0; i < 6; i++) { const s = 0.47 + i * 0.036; shroud.push([0.027, s], [0.0245, s + 0.004], [0.0245, s + 0.014], [0.027, s + 0.018]); }
  shroud.push([0.027, 0.698], [0.0001, 0.698]);
  k.barrel(shroud, dark, 0, 0.012, 32);
  for (let i = 0; i < 6; i++) for (const sx of [-1, 1]) k.rb(0.004, 0.01, 0.014, 0.002, hi, sx * 0.025, 0.012, -(0.479 + i * 0.036));
  k.barrel([[0.0001, 0.696], [0.0262, 0.696], [0.0262, 0.712], [0.0001, 0.712]], metal, 0, 0.012);
  knurl(K((() => { const q = new THREE.Group(); q.position.set(0, 0.012, -0.696); q.rotation.x = -PI / 2; g.add(q); return q; })()), 0.0262, 0.016, 20, dark, 0);
  k.barrel([[0.0001, 0.71], [0.0245, 0.71], [0.025, 0.714], [0.025, 0.812], [0.023, 0.82], [0.008, 0.822], [0.0065, 0.817], [0.0001, 0.817]], dark, 0, 0.012);
  k.barrel([[0.025, 0.79], [0.0262, 0.792], [0.0262, 0.8], [0.025, 0.802]], metal, 0, 0.012);
  // Hooded red dot: base, a tunnel hood with the window cut through, buttons, lens and dot.
  k.rb(0.036, 0.008, 0.07, 0.003, dark, 0, 0.06, -0.1);
  k.face([[-0.02, 0.058, 0.002], [0.02, 0.058, 0.002], [0.02, 0.092, 0.01], [0.012, 0.099, 0.006], [-0.012, 0.099, 0.006], [-0.02, 0.092, 0.01]], 0.064, metal,
    { z: -0.1, bevel: 0.002, holes: [[[-0.0145, 0.064, 0.002], [0.0145, 0.064, 0.002], [0.0145, 0.09, 0.007], [-0.0145, 0.09, 0.007]]] });
  for (const s of [0.09, 0.105]) k.cyl(0.0035, 0.0035, 0.004, dark, 0.021, 0.076, -s, 0, 0, PI / 2, 12);
  const lens = new THREE.Mesh(new THREE.PlaneGeometry(0.028, 0.025), glassM()); lens.position.set(0, 0.077, -0.13); g.add(lens);
  const dot = new THREE.Mesh(new THREE.CircleGeometry(0.0022, 12), GLOW('#ff3040', 3)); dot.position.set(0, 0.078, -0.1315); g.add(dot);
  // Back-up irons: rear notch block with two green dots, front post with ears and a red dot.
  k.face([[-0.014, 0.058], [0.014, 0.058], [0.014, 0.073, 0.003], [0.005, 0.073], [0.005, 0.066], [-0.005, 0.066], [-0.005, 0.073], [-0.014, 0.073, 0.003]], 0.012, dark, { z: 0.016 });
  for (const sx of [-0.009, 0.009]) k.ball(0.0026, GLOW('#30ff60', 2), sx, 0.069, 0.0095);
  k.face([[-0.012, 0.058], [0.012, 0.058], [0.012, 0.082, 0.004], [0.008, 0.082], [0.008, 0.064], [-0.008, 0.064], [-0.008, 0.082], [-0.012, 0.082, 0.004]], 0.01, dark, { z: -0.268 });
  k.rb(0.004, 0.016, 0.006, 0.0015, dark, 0, 0.07, -0.268);
  k.ball(0.003, GLOW('#ff3040', 2.4), 0, 0.078, -0.2635);
  // Angled foregrip (raked like the canon's), on its mount.
  k.rb(0.026, 0.008, 0.044, 0.003, dark, 0, -0.03, -0.335);
  const fg = new THREE.Group(); fg.position.set(0, -0.032, -0.33); fg.rotation.x = -0.25; g.add(fg);
  K(fg).side([[0.02, 0.0, 0.002], [-0.02, 0.0, 0.002], [-0.017, -0.066, 0.01], [-0.006, -0.08, 0.006], [0.014, -0.08, 0.006], [0.02, -0.07, 0.006], [0.015, -0.04, 0.012], [0.022, -0.012, 0.004]], 0.03, poly, { bevel: 0.0035 });
  for (let i = 0; i < 3; i++) K(fg).rb(0.032, 0.003, 0.03, 0.001, dark, 0, -0.03 - i * 0.014, 0.0);
  // Collapsible stock, pulled out: buffer, latch housing, twin guide rods, skeletal butt with riser, rubber pad.
  bar(k, -0.12, -0.05, 0.012, metal, 0, 0.006);
  k.rb(0.03, 0.026, 0.02, 0.006, dark, 0, 0.004, 0.058);
  for (const sx of [-1, 1]) { k.barrel([[0.0001, -0.262], [0.0045, -0.262], [0.0045, -0.05], [0.0001, -0.05]], metal, sx * 0.013, -0.012, 12); k.ball(0.0055, metal, sx * 0.013, -0.012, 0.05); }
  k.side([[-0.14, 0.036, 0.004], [-0.268, 0.042, 0.006], [-0.272, -0.052, 0.006], [-0.246, -0.055, 0.006], [-0.236, -0.01, 0.01], [-0.19, 0.012, 0.008], [-0.14, 0.016, 0.004]], 0.03, poly,
    { bevel: 0.003, holes: [[[-0.2, 0.027, 0.003], [-0.255, 0.031, 0.004], [-0.256, -0.03, 0.005]]] });
  k.rb(0.024, 0.012, 0.07, 0.004, poly, 0, 0.044, 0.21);
  k.side([[-0.27, 0.044, 0.004], [-0.281, 0.044, 0.003], [-0.284, -0.054, 0.006], [-0.272, -0.057, 0.004]], 0.034, rub, { bevel: 0.002 });
  k.rb(0.006, 0.006, 0.02, 0.002, metal, 0, -0.03, 0.12);
  engrave(g, 'k9', 'K9 HUSH  ·  5MM CL', 0.11, 0.014, 0.0258, -0.005, 0.13);
  const ga = V(0, -0.032, -0.33), at = V(0, -0.046, 0).applyAxisAngle(V(1, 0, 0), -0.25).add(ga);
  g.userData = {
    gripR: V(0, -0.075, 0.03), gripL: V(0, -0.09, -0.33), muzzle: V(0, 0.012, -0.822), sight: 0.078,
    handR: handRFor(-0.03, -0.015, -0.3),
    handL: { at, axis: V(0, -Math.cos(0.25), Math.sin(0.25)), r: 0.016, back: [-0.026, -0.006], arc: [-0.1 * PI, 1.15 * PI], wrist: at.clone().add(V(-0.03, -0.015, 0.064)) },
  };
  return finish(rebase(g, 0.075));
}

// ---------------------------------------------------------------------------------------------
// OWL (Cyber): the RF-dart rifle. A filleted housing round a fat emitter core (rings, alternate ones lit), a caged
// dart tube with spacer collars, an emitter head with the dart's lit tip, RF tracker sight, blade antenna, cyan
// status strip down the right flank, ranger-green stock and sleeve.
// ---------------------------------------------------------------------------------------------
export function heroOwl() {
  const g = new THREE.Group(), k = KL(g);
  const body = P.cyberGrey(), steel = P.steel(), dark = P.dark(), rg = P.ranger(), rub = P.rubber(), teal = hm('#1c3a44', 'hard', { wear: 0.2 });
  const cyan = GLOW('#38d6f2', 2.2), cyanD = GLOW('#38d6f2', 0.7);
  // Housing: soft filleted shell with three slanted cooling slots cut through at the back.
  const cool = [0, 1, 2].map((i) => { const s0 = -0.16 + i * 0.026; return [[s0, -0.018, 0.004], [s0 + 0.012, -0.018, 0.004], [s0 + 0.022, 0.022, 0.004], [s0 + 0.01, 0.022, 0.004]]; });
  k.side([[-0.2, -0.035, 0.012], [0.12, -0.04, 0.01], [0.2, -0.03, 0.015], [0.225, 0.004, 0.012], [0.21, 0.04, 0.012], [-0.05, 0.046, 0.01], [-0.18, 0.04, 0.015], [-0.206, 0.01, 0.01]], 0.066, body,
    { bevel: 0.004, holes: cool });
  bar(k, -0.19, -0.07, 0.012, dark, 0, 0.002);   // heat sink seen through the slots
  // Emitter core: lathed drum with collars; the rings between them alternate lit cyan and dark teal.
  k.barrel([[0.0001, -0.03], [0.04, -0.03], [0.046, -0.022], [0.046, 0.152], [0.04, 0.16], [0.0001, 0.16]], dark, 0, 0.004, 36);
  for (let i = 0; i < 6; i++) {
    const s = -0.016 + i * 0.032;
    k.barrel([[0.046, s], [0.0505, s + 0.002], [0.0505, s + 0.012], [0.046, s + 0.014]], steel, 0, 0.004, 36);
    if (i < 5) k.barrel([[0.0462, s + 0.017], [0.0482, s + 0.018], [0.0482, s + 0.027], [0.0462, s + 0.028]], i % 2 ? teal : cyan, 0, 0.004, 36);
  }
  // Dart tube: sleeve (support hand), caged tube with spacer collars, emitter head, the dart's lit tip.
  k.barrel([[0.0001, 0.2], [0.026, 0.2], [0.03, 0.208], [0.03, 0.39], [0.034, 0.396], [0.034, 0.404], [0.026, 0.41], [0.0001, 0.41]], rg, 0, 0.012, 32);
  for (let i = 0; i < 4; i++) k.barrel([[0.0302, 0.24 + i * 0.036], [0.0314, 0.242 + i * 0.036], [0.0314, 0.246 + i * 0.036], [0.0302, 0.248 + i * 0.036]], dark, 0, 0.012);
  bar(k, 0.16, 0.66, 0.0145, dark, 0, 0.012);
  for (let i = 0; i < 3; i++) { const a = PI / 2 + (i / 3) * PI * 2; k.barrel([[0.0001, 0.4], [0.003, 0.4], [0.003, 0.64], [0.0001, 0.64]], steel, Math.cos(a) * 0.024, 0.012 + Math.sin(a) * 0.024, 10); }
  for (const s of [0.47, 0.56]) {
    k.barrel([[0.0001, s], [0.027, s], [0.029, s + 0.004], [0.029, s + 0.012], [0.027, s + 0.016], [0.0001, s + 0.016]], dark, 0, 0.012);
    k.ball(0.0028, cyan, 0, 0.012 + 0.029, -s - 0.008);
  }
  k.barrel([[0.0001, 0.636], [0.024, 0.636], [0.03, 0.66], [0.031, 0.69], [0.028, 0.696], [0.012, 0.697], [0.0115, 0.69], [0.0001, 0.69]], dark, 0, 0.012);
  k.barrel([[0.0115, 0.69], [0.0165, 0.69], [0.0165, 0.6962], [0.0115, 0.6962]], cyanD, 0, 0.012);
  k.barrel([[0.0001, 0.676], [0.0062, 0.676], [0.0062, 0.705], [0.0001, 0.732]], cyan, 0, 0.012, 16);
  // RF tracker sight: base, hood with the window cut through, cyan lens and ring reticle.
  const sy = 0.077;
  k.rb(0.04, 0.008, 0.12, 0.003, dark, 0, 0.05, -0.0);
  k.face([[-0.022, 0.052, 0.003], [0.022, 0.052, 0.003], [0.022, 0.092, 0.012], [0.014, 0.1, 0.006], [-0.014, 0.1, 0.006], [-0.022, 0.092, 0.012]], 0.11, dark,
    { z: 0.0, bevel: 0.002, holes: [[[-0.016, 0.062, 0.003], [0.016, 0.062, 0.003], [0.016, 0.091, 0.009], [-0.016, 0.091, 0.009]]] });
  const lensC = new THREE.Mesh(new THREE.PlaneGeometry(0.032, 0.029), new THREE.MeshBasicMaterial({ color: '#38d6f2', transparent: true, opacity: 0.18, depthWrite: false })); lensC.position.set(0, sy, -0.054); g.add(lensC);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.007, 0.0007, 6, 32), GLOW('#38d6f2', 2.6)); ring.position.set(0, sy, -0.055); g.add(ring);
  k.cyl(0.006, 0.006, 0.006, steel, 0.025, 0.078, 0.02, 0, 0, PI / 2, 16);
  // Blade antenna on a knuckle, folded up and back.
  k.rb(0.022, 0.012, 0.03, 0.004, dark, 0, 0.047, -0.165);
  k.cyl(0.007, 0.007, 0.026, steel, 0, 0.056, -0.165, 0, 0, PI / 2, 16);
  k.lathe([[0.0001, 0], [0.0042, 0], [0.004, 0.06], [0.0028, 0.064], [0.0028, 0.21], [0.0001, 0.212]], rub, 0, 0.056, -0.165, 1.05, 0, 0, 12);
  k.ball(0.0045, dark, 0, 0.056 + Math.cos(1.05) * 0.212, -0.165 + Math.sin(1.05) * 0.212);
  // Cyan status strip down the right flank (charge: five lit, three dim), and the red index by the selector.
  k.rb(0.003, 0.012, 0.15, 0.002, dark, 0.0335, 0.022, 0.06);
  for (let i = 0; i < 8; i++) k.rb(0.002, 0.006, 0.014, 0.001, i < 5 ? cyan : cyanD, 0.0352, 0.022, 0.125 - i * 0.018);
  k.rb(0.003, 0.006, 0.006, 0.001, P.red(), 0.0345, -0.008, 0.06);
  k.rb(0.004, 0.008, 0.026, 0.002, steel, -0.034, -0.008, 0.06, 0.4);
  // Dart cassette ahead of the guard: ribbed, with two windows onto the dart tips.
  k.side([[0.0, -0.036], [0.11, -0.036], [0.108, -0.1, 0.008], [0.004, -0.1, 0.008]], 0.034, body, { bevel: 0.003, holes: [slot(0.02, 0.09, -0.06, -0.05), slot(0.02, 0.09, -0.082, -0.072)] });
  for (const y of [-0.055, -0.077]) k.barrel([[0.0001, 0.015], [0.004, 0.015], [0.004, 0.08], [0.0025, 0.09], [0.0001, 0.094]], cyanD, 0, y, 12);
  k.side([[-0.002, -0.098, 0.003], [0.112, -0.098, 0.003], [0.114, -0.108, 0.004], [-0.004, -0.108, 0.004]], 0.038, rg, { bevel: 0.002 });
  // Grip and guard (the family grip).
  guard(k, body);
  pistolGrip(g, -0.1, -0.03, dark);
  // Ranger-green stock with a cut-out, rubber butt.
  k.side([[-0.19, 0.035, 0.01], [-0.44, 0.04, 0.012], [-0.452, 0.03, 0.006], [-0.455, -0.07, 0.012], [-0.43, -0.076, 0.01], [-0.35, -0.04, 0.03], [-0.19, -0.03, 0.01]], 0.05, rg,
    { bevel: 0.004, holes: [[[-0.27, 0.02, 0.008], [-0.39, 0.024, 0.01], [-0.4, -0.03, 0.012], [-0.33, -0.02, 0.01]]] });
  k.side([[-0.452, 0.04, 0.006], [-0.466, 0.04, 0.004], [-0.47, -0.074, 0.008], [-0.455, -0.078, 0.004]], 0.052, rub, { bevel: 0.002 });
  qd(k, -0.025, -0.01, -0.2);
  engrave(g, 'owl', 'OWL  ·  RF DART  ·  150 M', 0.13, 0.016, 0.0335, -0.022, 0.06);
  g.userData = {
    gripR: V(0, -0.075, 0.115), gripL: V(0, 0.012, -0.3), muzzle: V(0, 0.012, -0.732), sight: sy,
    handR: handRFor(-0.1, -0.03, -0.22), handL: handLFor(0.3, 0.012, 0.036),
  };
  return finish(g);
}


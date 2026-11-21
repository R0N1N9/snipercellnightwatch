// TIDY-UP TIME — the grown-up's hands. One skinned mesh per hand: palm, four fingers, thumb
// and forearm modelled as smooth tubes around a 17-bone skeleton (so joints bend as skin, not
// as beads on a string), with the skin's detail baked into its vertex colours: flushed tips
// and knuckles, nails, creases, palm lines. A knitted sleeve covers the forearm; the upper arm
// is a second sleeve that runs off the edge of the frame. Shading is the scene's own standard
// material with a patch for soft wrapped light, a warm terminator and a velvet rim.
import { clamp, lerp, smoothstep, makeCanvas, makeRng, rand, mixHex, shade, TAU } from '../../kit.js';

// Skin tones: base, flush (blood under thin skin), nail, palm (lighter, pinker), shadow tint.
export const SKINS = [
  { base: '#f1c6a6', flush: '#e98f7e', nail: '#f6d9d0', palm: '#f6cdb6', sss: '#ff5a3c' },
  { base: '#d9a07a', flush: '#c9705a', nail: '#efc6b4', palm: '#e7b392', sss: '#f0502e' },
  { base: '#a8694a', flush: '#9a4a3c', nail: '#d9a68e', palm: '#d29a7c', sss: '#d8401e' },
  { base: '#70432f', flush: '#6a2e28', nail: '#c08a72', palm: '#b77e64', sss: '#b83418' },
];
// Knitwear: body, fleck, cuff rib.
export const SLEEVES = [
  { body: '#c9a24a', fleck: '#8f6a22', rib: '#b48d3a', name: 'mustard' },
  { body: '#3f6b52', fleck: '#244232', rib: '#365e47', name: 'forest' },
  { body: '#e7dcc6', fleck: '#b8aa8c', rib: '#d8ccb2', name: 'oatmeal' },
  { body: '#2f3f66', fleck: '#8fa3c9', rib: '#283658', name: 'navy' },
  { body: '#b4533e', fleck: '#7a2f22', rib: '#9c4534', name: 'rust' },
];

// Joint angles (radians). Fingers: [mcp, pip, dip, spread]; thumb: [opp, abd, mcp, ip, roll].
const F = (m, p, d, s = 0) => [m, p, d, s];
export const POSES = {
  relax: { f: [F(0.22, 0.32, 0.18, -0.03), F(0.26, 0.36, 0.2), F(0.32, 0.42, 0.22, 0.03), F(0.38, 0.46, 0.24, 0.07)], t: [0.15, 0.15, 0.12, 0.18, 0] },
  ready: { f: [F(0.1, 0.16, 0.1, -0.08), F(0.12, 0.18, 0.1), F(0.16, 0.22, 0.12, 0.08), F(0.2, 0.26, 0.14, 0.16)], t: [0.15, 0.32, 0.05, 0.1, 0] },
  flat: { f: [F(0.03, 0.06, 0.05, -0.05), F(0.03, 0.06, 0.05), F(0.04, 0.07, 0.05, 0.05), F(0.05, 0.08, 0.06, 0.1)], t: [0.05, 0.25, 0.0, 0.05, 0] },
  scoop: { f: [F(0.42, 0.32, 0.16, 0.04), F(0.42, 0.34, 0.16), F(0.44, 0.34, 0.16, -0.04), F(0.48, 0.36, 0.18, -0.08)], t: [0.1, 0.05, 0.1, 0.12, 0.2] },
  cup: { f: [F(0.72, 0.62, 0.3, 0.04), F(0.74, 0.66, 0.32), F(0.78, 0.68, 0.32, -0.04), F(0.84, 0.72, 0.34, -0.08)], t: [0.55, -0.05, 0.3, 0.3, 0.35] },
  pinchOpen: { f: [F(0.32, 0.42, 0.2, -0.02), F(0.62, 0.95, 0.5), F(0.78, 1.1, 0.6, 0.04), F(0.9, 1.15, 0.6, 0.08)], t: [0.7, 0.35, 0.05, 0.05, 0.3] },
  pinch: { f: [F(0.5, 0.62, 0.3, 0.0), F(0.72, 1.05, 0.55), F(0.86, 1.18, 0.62, 0.04), F(0.98, 1.22, 0.62, 0.08)], t: [0.95, 0.12, 0.3, 0.32, 0.45] },
  grip: { f: [F(0.75, 0.95, 0.5, -0.02), F(0.8, 1.0, 0.52), F(0.84, 1.02, 0.54, 0.03), F(0.9, 1.05, 0.56, 0.06)], t: [0.85, 0.05, 0.35, 0.4, 0.5] },
  blade: { f: [F(0.06, 0.12, 0.08, 0.02), F(0.06, 0.12, 0.08), F(0.07, 0.13, 0.08, -0.02), F(0.08, 0.14, 0.09, -0.04)], t: [0.0, 0.05, 0.05, 0.05, 0] },
  hold: { f: [F(0.32, 0.44, 0.22, -0.02), F(0.34, 0.46, 0.22), F(0.38, 0.5, 0.24, 0.03), F(0.42, 0.54, 0.26, 0.06)], t: [0.4, 0.25, 0.15, 0.15, 0.15] },
  point: { f: [F(0.04, 0.06, 0.04, -0.02), F(0.95, 1.25, 0.6), F(1.0, 1.3, 0.62, 0.04), F(1.05, 1.32, 0.62, 0.08)], t: [0.75, 0.0, 0.35, 0.35, 0.4] },
};

// Proportions in world units (one unit is about 3 cm): an adult hand, a little chunkier than life.
const FINGERS = [
  // knuckle x, knuckle z, splay, proximal, middle, distal, base radius, tip radius
  { x: 0.98, z: 3.12, a: -0.07, L: [1.42, 0.86, 0.72], r0: 0.33, r1: 0.255 }, // index (thumb side)
  { x: 0.33, z: 3.26, a: -0.01, L: [1.56, 0.96, 0.74], r0: 0.34, r1: 0.265 },
  { x: -0.31, z: 3.14, a: 0.05, L: [1.46, 0.9, 0.72], r0: 0.32, r1: 0.25 },
  { x: -0.92, z: 2.84, a: 0.13, L: [1.14, 0.66, 0.6], r0: 0.28, r1: 0.22 }, // little finger
];
const THUMB = { p: [0.9, -0.2, 0.36], dir: [0.8, -0.16, 0.58], L: [1.4, 1.0, 0.82], r0: 0.47, r1: 0.34 };
export const FOREARM = 9.2; // wrist to elbow
export const UPPER = 10.5; // elbow to shoulder

const srgbToLinear = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
function lin(hex, out) {
  const n = parseInt(hex.slice(1), 16);
  out[0] = srgbToLinear(((n >> 16) & 255) / 255); out[1] = srgbToLinear(((n >> 8) & 255) / 255); out[2] = srgbToLinear((n & 255) / 255);
  return out;
}
const gauss = (x) => Math.exp(-x * x);

// The one shader patch every lit thing in the film shares (hands, sleeves, toys): light that
// wraps round the terminator instead of stopping at it, a warm band where it turns (light
// that went into the skin and came back out), and a soft rim. uWrap, uSSS, uRim per material.
export function softPatch(material, U, o = {}) {
  const u = { uWrap: { value: o.wrap ?? 0.4 }, uSSS: { value: o.sss || [0, 0, 0] }, uRim: { value: o.rim || [0, 0, 0] }, uRimPow: { value: o.rimPow ?? 3 } };
  material.userData.soft = u;
  material.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u, { uKeyDir: U.keyDir, uKeyCol: U.keyCol });
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uWrap, uRimPow; uniform vec3 uSSS, uRim, uKeyDir, uKeyCol;')
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
{
  float nl = dot(normal, uKeyDir);
  float wrapX = max(0.0, (nl + uWrap) / (1.0 + uWrap)) - max(nl, 0.0);
  float band = smoothstep(-0.45, 0.05, nl) * (1.0 - smoothstep(0.05, 0.55, nl));
  reflectedLight.indirectDiffuse += uKeyCol * BRDF_Lambert(diffuseColor.rgb) * (wrapX * 0.7) + uKeyCol * uSSS * band * 0.12;
  float fr = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), uRimPow);
  reflectedLight.indirectDiffuse += uRim * fr;
}`);
  };
  material.customProgramCacheKey = () => 'tidy-soft';
  return material;
}

// A knitted sleeve: rows of little Vs, heathered, with a ribbed cuff at the bottom of the map.
function knitCanvas(sl, seed) {
  const rng = makeRng(seed), c = makeCanvas(256, 256), g = c.g;
  g.fillStyle = sl.body; g.fillRect(0, 0, 256, 256);
  const cell = 16;
  for (let y = 0; y < 208; y += cell) for (let x = 0; x < 256; x += cell) {
    const k = rand(rng, -0.1, 0.1);
    g.fillStyle = shade(sl.body, k - 0.16);
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + cell / 2, y + cell); g.lineTo(x + cell / 2, y + cell * 0.55); g.lineTo(x + 1, y); g.fill();
    g.beginPath(); g.moveTo(x + cell, y); g.lineTo(x + cell / 2, y + cell); g.lineTo(x + cell / 2, y + cell * 0.55); g.lineTo(x + cell - 1, y); g.fill();
    g.fillStyle = shade(sl.body, k + 0.12);
    g.fillRect(x + 2.5, y + 1.5, 2.5, cell * 0.45); g.fillRect(x + cell - 5, y + 1.5, 2.5, cell * 0.45);
    if (rng() < 0.08) { g.fillStyle = sl.fleck; g.fillRect(x + rand(rng, 2, 12), y + rand(rng, 2, 12), 3, 2); }
  }
  // the rib: tight vertical cords
  for (let x = 0; x < 256; x += 6) {
    const gr = g.createLinearGradient(x, 0, x + 6, 0);
    gr.addColorStop(0, shade(sl.rib, -0.3)); gr.addColorStop(0.5, shade(sl.rib, 0.1)); gr.addColorStop(1, shade(sl.rib, -0.3));
    g.fillStyle = gr; g.fillRect(x, 208, 6, 48);
  }
  g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, 206, 256, 3);
  return c.canvas;
}

// A tube along +z: rings[i] = { z, cx, cy, rx, ryUp, ryDown, w:[i0, w0, i1, w1], tone(θ, s) }.
function tube(B, rings, segs, closeEnd) {
  const base = B.pos.length / 3;
  for (const r of rings) {
    for (let j = 0; j < segs; j++) {
      const th = (j / segs) * TAU, c = Math.cos(th), s = Math.sin(th);
      const ry = s >= 0 ? r.ryUp : r.ryDown;
      const ex = r.ex ?? 2; // superellipse: a little boxier than a circle
      const cc = Math.sign(c) * Math.pow(Math.abs(c), 2 / ex), ss = Math.sign(s) * Math.pow(Math.abs(s), 2 / ex);
      let x = r.cx + r.rx * cc, y = r.cy + ry * ss;
      const bump = r.bump ? r.bump(th) : 0;
      x += c * bump; y += s * bump;
      B.pos.push(x, y, r.z);
      const w = r.wf ? r.wf(th) : r.w;
      B.skin.push(w[0], w[2], w[4] || 0, 0); B.wt.push(w[1], w[3], w[5] || 0, 0);
      const t = r.tone ? r.tone(th) : null;
      B.tone.push(t ? t[0] : 0, t ? t[1] : 0, t ? t[2] : 0);
    }
  }
  for (let i = 0; i < rings.length - 1; i++) for (let j = 0; j < segs; j++) {
    const a = base + i * segs + j, b = base + i * segs + ((j + 1) % segs), c = a + segs, d = b + segs;
    B.idx.push(a, b, c, b, d, c);
  }
  if (closeEnd) {
    // a pole at the last ring's centre
    const r = rings[rings.length - 1], p = B.pos.length / 3;
    B.pos.push(r.cx, r.cy, r.z + (r.capZ || 0)); B.skin.push(r.w[0], r.w[2], 0, 0); B.wt.push(r.w[1], r.w[3], 0, 0);
    const t = r.tone ? r.tone(Math.PI / 2) : null; B.tone.push(t ? t[0] : 0, t ? t[1] : 0, t ? t[2] : 0);
    const last = base + (rings.length - 1) * segs;
    for (let j = 0; j < segs; j++) B.idx.push(last + j, last + ((j + 1) % segs), p);
  }
}

// Transform the vertices added since `from` by a matrix (THREE.Matrix4).
function bake(THREE, B, from, m) {
  const v = new THREE.Vector3();
  for (let i = from; i < B.pos.length / 3; i++) {
    v.set(B.pos[i * 3], B.pos[i * 3 + 1], B.pos[i * 3 + 2]).applyMatrix4(m);
    B.pos[i * 3] = v.x; B.pos[i * 3 + 1] = v.y; B.pos[i * 3 + 2] = v.z;
  }
}

/**
 * makeHand(THREE, { side: +1 right | -1 left, skin, sleeve, acc: 'watch'|'ring'|'plaster'|null, seed, U })
 * Returns { group, set(state), dispose() }. The group holds everything; set() poses it.
 */
export function makeHand(THREE, o) {
  const S = o.side; // +1: a right hand (thumb on local +x when the palm faces down, fingers +z)
  const SC = o.scale || 1; // how much bigger than life (they are a toy's idea of a grown-up's hands)
  const own = [];
  const keep = (x) => { own.push(x); return x; };
  // ---- skeleton ----
  const bones = [];
  const bone = (parent, x, y, z, q) => { const b = new THREE.Bone(); b.position.set(x, y, z); if (q) b.quaternion.copy(q); if (parent) parent.add(b); bones.push(b); return b; };
  const arm = bone(null, 0, 0, 0), hand = bone(arm, 0, 0, 0);
  const qy = (a) => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), a);
  const fingers = FINGERS.map((f) => {
    const p = bone(hand, S * f.x, -0.03, f.z, qy(-S * f.a));
    const m = bone(p, 0, 0, f.L[0]), d = bone(m, 0, 0, f.L[1]);
    return { f, b: [p, m, d], rest: p.quaternion.clone() };
  });
  const tdir = new THREE.Vector3(S * THUMB.dir[0], THUMB.dir[1], THUMB.dir[2]).normalize();
  // The thumb's frame: +z along it, its nail turned out to the side and up.
  const tq = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), tdir);
  tq.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -S * 1.05));
  const t0 = bone(hand, S * THUMB.p[0], THUMB.p[1], THUMB.p[2], tq), t1 = bone(t0, 0, 0, THUMB.L[0]), t2 = bone(t1, 0, 0, THUMB.L[1]);
  const thumb = { b: [t0, t1, t2], rest: tq.clone() };
  const bi = (b) => bones.indexOf(b);
  arm.updateMatrixWorld(true);

  // ---- geometry ----
  const B = { pos: [], skin: [], wt: [], tone: [], idx: [] };
  const SEG = 14;
  // tone channels: [flush, nail, crease/occlusion]

  // Fingers (and the thumb) in their own frame, then baked to the hand's rest pose.
  function digit(chain, L, r0, r1, isThumb, parentIdx) {
    const from = B.pos.length / 3;
    const total = L[0] + L[1] + L[2], j1 = L[0], j2 = L[0] + L[1];
    const rings = [];
    const start = isThumb ? -0.75 : -0.5;
    const n = isThumb ? 30 : 28;
    for (let i = 0; i <= n; i++) {
      const s = start + ((total - start) * i) / n;
      const k = clamp(s / total, 0, 1);
      let r = lerp(r0, r1, Math.pow(k, 0.9));
      r *= 1 + 0.07 * gauss((s - j1) / 0.2) + 0.05 * gauss((s - j2) / 0.15) - 0.04 * gauss((s - (j1 + j2) / 2) / 0.25);
      if (isThumb) r *= 1 + 0.16 * gauss((s + 0.2) / 0.6);
      else r *= lerp(0.72, 1, smoothstep(-0.5, 0.1, s)); // (the root stays under the skin of the palm)
      const ph = s < j1 ? s / j1 : s < j2 ? (s - j1) / L[1] : (s - j2) / L[2];
      const pad = 1 + 0.1 * Math.sin(Math.PI * clamp(ph, 0, 1)) * (s > 0 ? 1 : 0);
      const tipK = smoothstep(total - 0.35, total, s);
      // bone weights: palm → proximal → middle → distal, blended over each joint
      const w0 = isThumb ? smoothstep(-0.7, 0.25, s) : smoothstep(-0.5, 0.3, s), w1 = smoothstep(j1 - 0.24, j1 + 0.22, s), w2 = smoothstep(j2 - 0.16, j2 + 0.15, s);
      let w;
      if (s < j1 - 0.24) w = [parentIdx, 1 - w0, bi(chain[0]), w0];
      else if (s < j2 - 0.16) w = [bi(chain[0]), 1 - w1, bi(chain[1]), w1];
      else w = [bi(chain[1]), 1 - w2, bi(chain[2]), w2];
      const nailK = smoothstep(j2 + 0.16, j2 + 0.3, s);
      rings.push({
        z: s, cx: 0, cy: 0, rx: r * (isThumb ? 1.02 : 1), ryUp: r * (0.84 - 0.08 * nailK), ryDown: r * 0.94 * pad, ex: 2.15, w,
        bump: (th) => {
          // the nail plate stands a hair proud; the knuckle crease sinks a hair
          const up = Math.sin(th);
          const nb = nailK * smoothstep(0.35, 0.75, up) * 0.018;
          return nb - (up > 0 ? 0.008 * gauss((s - j1) / 0.05) + 0.006 * gauss((s - j2) / 0.04) : 0.012 * gauss((s - j1) / 0.04) + 0.01 * gauss((s - j2) / 0.035));
        },
        tone: (th) => {
          const up = Math.sin(th);
          const nail = nailK * smoothstep(0.3, 0.62, up);
          const flush = 0.55 * tipK + 0.35 * gauss((s - j1) / 0.18) * Math.max(0, up) + 0.2 * gauss((s - j2) / 0.14) * Math.max(0, up) + 0.25 * Math.max(0, -up) * (1 - smoothstep(0, 0.4, ph) * smoothstep(1, 0.6, ph)) * (s > 0 ? 1 : 0);
          let occ = 0.45 * (1 - smoothstep(-0.2, 0.45, s)); // deep between the fingers
          occ += up < 0 ? 0.55 * gauss((s - j1) / 0.035) + 0.5 * gauss((s - j2) / 0.03) : 0.22 * (gauss((s - j1 + 0.05) / 0.025) + gauss((s - j1 - 0.07) / 0.022)) * up + 0.15 * gauss((s - j2) / 0.025) * up;
          occ += nail * 0.35 * gauss((s - j2 - 0.18) / 0.03); // cuticle
          return [flush, nail, occ];
        },
      });
    }
    // the rounded tip: rings closing over a dome
    const last = rings[rings.length - 1];
    for (let i = 1; i <= 6; i++) {
      const a = (i / 6) * (Math.PI / 2), c = Math.cos(a);
      rings.push({ ...last, z: total + Math.sin(a) * last.rx * 0.95, rx: last.rx * c, ryUp: last.ryUp * c, ryDown: last.ryDown * c, bump: (th) => last.bump(th) * c, tone: (th) => { const t = last.tone(th); return [Math.min(1, t[0] + 0.15), t[1] * smoothstep(0.75, 0.2, i / 6), 0]; } });
    }
    tube(B, rings, SEG, true);
    return from;
  }
  for (const fg of fingers) {
    const from = digit(fg.b, fg.f.L, fg.f.r0, fg.f.r1, false, bi(hand));
    fg.b[0].updateMatrixWorld(true);
    bake(THREE, B, from, fg.b[0].matrixWorld);
  }
  {
    const from = digit(thumb.b, THUMB.L, THUMB.r0, THUMB.r1, true, bi(hand));
    t0.updateMatrixWorld(true);
    bake(THREE, B, from, t0.matrixWorld);
  }

  // Forearm and palm: ONE tube from the elbow to the finger roots, so the wrist is skin and not
  // a seam. Arched across the back, the thumb's pad on one side (it goes where the thumb goes),
  // the heel of the hand below, tendons on the back, lines on the front; past the knuckles it
  // becomes the webbing, which rides on the fingers.
  {
    const ih = bi(hand), ia = bi(arm), it0 = bi(t0), zs = [];
    for (let z = -FOREARM - 0.3; z < -1.2; z += 0.9) zs.push(z);
    for (let z = -1.2; z <= 3.98; z += 0.16) zs.push(z);
    const KZ = FINGERS.map((f) => f.z);
    const prof = (z) => {
      const fa = smoothstep(-FOREARM, -0.4, z); // 0 at the elbow, 1 at the wrist
      const pa = smoothstep(-0.35, 1.6, z); // into the palm
      const fr = smoothstep(3.0, 3.98, z); // past the knuckles
      const end = Math.cos(Math.pow(fr, 1.6) * Math.PI / 2);
      let rx = lerp(1.44, 1.0, fa), up = lerp(1.08, 0.56, fa), dn = lerp(1.12, 0.6, fa);
      rx = lerp(rx, 1.44, pa); up = lerp(up, 0.47, pa); dn = lerp(dn, 0.55, pa);
      rx -= 0.06 * smoothstep(2.4, 3.6, z);
      return { rx: rx * (0.82 + 0.18 * end), up: up * (0.2 + 0.8 * end), dn: dn * (0.15 + 0.85 * end) };
    };
    const rings = [];
    for (const z of zs) {
      const P = prof(z), hw = P.rx, k = clamp((z + 0.3) / 3.6, 0, 1);
      const toArm = smoothstep(0.15, -0.75, z);
      rings.push({
        z, cx: S * 0.03, cy: -0.02, rx: hw, ryUp: P.up, ryDown: P.dn, ex: 2.3,
        w: [ih, 1 - toArm, ia, toArm],
        wf: (th) => {
          const xs = S * Math.cos(th) * hw, down = Math.max(0, -Math.sin(th));
          // the thumb's pad rides on the thumb's first bone
          const tw = 0.6 * smoothstep(0.2, 1.0, xs) * gauss((z - 0.9) / 0.95) * (0.3 + 0.7 * down);
          // the webbing rides on the nearest two fingers
          let a = 0, bI = 1;
          for (let i = 1; i < 4; i++) if (Math.abs(xs - FINGERS[i].x) < Math.abs(xs - FINGERS[a].x)) a = i;
          bI = xs > FINGERS[a].x ? Math.max(0, a - 1) : Math.min(3, a + 1);
          const span = Math.abs(FINGERS[bI].x - FINGERS[a].x) || 1;
          const u = bI === a ? 0 : clamp(Math.abs(xs - FINGERS[a].x) / span, 0, 0.5);
          const web = smoothstep(KZ[a] - 0.55, KZ[a] + 0.45, z);
          const rest = 1 - tw - web;
          if (web > 0.001) return [ih, Math.max(0, rest), bi(fingers[a].b[0]), web * (1 - u), bi(fingers[bI].b[0]), web * u];
          return [ih, (1 - toArm) * (1 - tw), ia, toArm * (1 - tw), it0, tw];
        },
        bump: (th) => {
          const c = Math.cos(th), s = Math.sin(th), xs = S * c * hw;
          let b = 0;
          if (z < -0.2) return 0.1 * gauss((xs + 0.85) / 0.25) * Math.max(0, s) * gauss((z + 0.55) / 0.3); // the wrist bone
          if (s > 0) {
            // the heads of the knuckles, and the tendons that run back from them
            for (const f of FINGERS) {
              const along = smoothstep(0.4, 2.9, z);
              const fx = f.x * (0.55 + 0.45 * along);
              b += 0.1 * gauss((xs - fx) / 0.24) * gauss((z - f.z + 0.02) / 0.3) * s;
              b += 0.025 * gauss((xs - fx) / 0.1) * along * smoothstep(3.0, 2.4, z) * s;
            }
            b -= 0.05 * smoothstep(3.25, 3.7, z) * (1 - Math.min(1, FINGERS.reduce((m, f) => Math.max(m, gauss((xs - f.x) / 0.22)), 0))) * s; // dips between them
          } else {
            b += 0.3 * gauss((xs - 0.75) / 0.36) * gauss((z - 0.95) / 0.8) * -s; // the thumb's pad
            b += 0.14 * gauss((xs + 0.8) / 0.36) * gauss((z - 0.9) / 0.95) * -s; // the heel on the far side
            b += 0.08 * gauss((z - 3.05) / 0.32) * -s; // the pads under the finger roots
            b -= 0.07 * gauss(xs / 0.45) * gauss((z - 1.8) / 0.7) * -s; // the hollow
          }
          return b;
        },
        tone: (th) => {
          const c = Math.cos(th), s = Math.sin(th), xs = S * c * hw;
          let occ = 0, flush = 0;
          if (z < -0.6) return [0.1 * Math.max(0, -s), 0, 0];
          if (s < 0) {
            const dn = smoothstep(0.2, 0.6, -s);
            // three palm lines: across under the fingers, across the middle, and round the thumb pad
            occ += 0.5 * dn * gauss((z - (2.72 - 0.22 * xs)) / 0.045) * smoothstep(-1.25, -0.45, -Math.abs(xs + 0.1));
            occ += 0.45 * dn * gauss((z - (2.0 + 0.3 * xs)) / 0.045) * smoothstep(0.95, 0.35, xs) * smoothstep(-1.4, -0.9, xs);
            const lx = 0.62 - 0.45 * Math.sin(clamp((z - 0.15) / 2.5, 0, 1) * Math.PI * 0.8);
            occ += 0.45 * dn * gauss((xs - lx) / 0.05) * smoothstep(0.1, 0.5, z) * smoothstep(2.65, 2.15, z);
            flush += 0.4 * gauss((xs - 0.7) / 0.42) * gauss((z - 0.9) / 0.7) + 0.3 * gauss((xs + 0.75) / 0.4) * gauss((z - 0.9) / 0.8) + 0.3 * gauss((z - 3.1) / 0.3);
            occ += 0.35 * dn * gauss((z + 0.25) / 0.06) + 0.2 * dn * gauss((z + 0.5) / 0.05); // the wrist creases
          } else {
            for (const f of FINGERS) flush += 0.32 * gauss((xs - f.x) / 0.2) * gauss((z - f.z) / 0.24) * s;
          }
          occ += 0.35 * smoothstep(3.3, 3.9, z); // deep between the finger roots
          return [flush, 0, occ];
        },
      });
    }
    tube(B, rings, 28, true);
  }

  // Bake the skin's colour: tone + per-vertex detail, in linear light.
  const sk = o.skin, base = lin(sk.base, [0, 0, 0]), fl = lin(sk.flush, [0, 0, 0]), nl = lin(sk.nail, [0, 0, 0]), pl = lin(sk.palm, [0, 0, 0]);
  const nv = B.pos.length / 3, col = new Float32Array(nv * 3);
  // which way is "down" (palm side) for each vertex: palm side is -y in the rest pose, near enough
  const geo = keep(new THREE.BufferGeometry());
  geo.setAttribute('position', new THREE.Float32BufferAttribute(B.pos, 3));
  geo.setIndex(B.idx);
  geo.computeVertexNormals();
  const nrm = geo.attributes.normal;
  for (let i = 0; i < nv; i++) {
    const [f, n, oc] = [B.tone[i * 3], B.tone[i * 3 + 1], B.tone[i * 3 + 2]];
    const palmK = clamp(-nrm.getY(i) * 1.3, 0, 1) * smoothstep(-0.6, 0.6, B.pos[i * 3 + 2]); // the inside of the hand is lighter
    for (let c = 0; c < 3; c++) {
      let v = lerp(base[c], pl[c], palmK * 0.75);
      v = lerp(v, fl[c], clamp(f, 0, 1) * 0.55);
      v = lerp(v, nl[c], clamp(n, 0, 1) * 0.6);
      v *= 1 - clamp(oc, 0, 1) * 0.5;
      col[i * 3 + c] = v;
    }
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(B.skin, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(B.wt, 4));

  const sss = lin(sk.sss, [0, 0, 0]);
  const skinMat = keep(softPatch(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.52, metalness: 0 }), o.U, { wrap: 0.55, sss, rim: [0.1 * sss[0] + 0.05, 0.05, 0.04], rimPow: 3.2 }));
  const mesh = new THREE.SkinnedMesh(geo, skinMat);
  mesh.frustumCulled = false;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const skeleton = new THREE.Skeleton(bones);
  mesh.add(arm);
  mesh.bind(skeleton);

  // ---- the sleeve: forearm part (rides the arm bone) and upper arm (placed each frame) ----
  const sl = o.sleeve;
  const knitTex = keep(new THREE.CanvasTexture(knitCanvas(sl, o.seed)));
  knitTex.colorSpace = THREE.SRGBColorSpace;
  knitTex.wrapS = THREE.RepeatWrapping; knitTex.wrapT = THREE.ClampToEdgeWrapping;
  const knitMat = keep(softPatch(new THREE.MeshStandardMaterial({ map: knitTex, roughness: 1, metalness: 0 }), o.U, { wrap: 0.8, rim: lin(mixHex(sl.body, '#ffffff', 0.4), [0, 0, 0]).map((v) => v * 0.18), rimPow: 2 }));
  const frng = makeRng(o.seed ^ 0x51ee);
  // Lower sleeve: from the rolled cuff back past the elbow; loose, with a few soft folds.
  function sleeveGeo(len, r0, r1, cuff, folds) {
    const segs = 22, rows = 18, pos = [], uv = [], idx = [];
    const ph = [rand(frng, 0, TAU), rand(frng, 0, TAU), rand(frng, 0, TAU)];
    for (let i = 0; i <= rows; i++) {
      const k = i / rows, z = -k * len;
      let r = lerp(r0, r1, k);
      const inCuff = cuff ? 1 - smoothstep(0.08, 0.12, k) : 0;
      if (cuff) r *= 1 + 0.08 * gauss((k - 0.1) / 0.035) - 0.06 * inCuff; // the roll at the top of the rib
      for (let j = 0; j <= segs; j++) {
        const th = (j / segs) * TAU;
        let rr = r * (1 + (folds ? 0.05 * Math.sin(th * 3 + ph[0] + k * 4) * Math.sin(k * 9 + ph[1]) + 0.03 * Math.sin(th * 5 + ph[2]) : 0) * (1 - inCuff));
        if (cuff) rr *= 1 + inCuff * 0.025 * Math.cos(th * 22);
        pos.push(Math.cos(th) * rr * 1.08, Math.sin(th) * rr, z);
        uv.push((j / segs) * 2, cuff ? (inCuff > 0.5 ? lerp(0.0, 0.18, k / 0.1) : 0.22 + k * 0.78) : 0.22 + k * 0.78);
      }
    }
    for (let i = 0; i < rows; i++) for (let j = 0; j < segs; j++) {
      const a = i * (segs + 1) + j, b = a + 1, c = a + segs + 1, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    // (map v: the rib sits at the bottom of the canvas, which is v 0..0.19)
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return keep(g);
  }
  const lowerGeo = sleeveGeo(FOREARM - 3.5, 1.38, 1.62, true, true);
  const lower = new THREE.Mesh(lowerGeo, knitMat);
  lower.position.set(0, 0.02, -3.9);
  lower.castShadow = lower.receiveShadow = true;
  arm.add(lower);
  // the upper arm: a unit-length sleeve stretched from the elbow to the shoulder every frame
  const upperGeo = sleeveGeo(1, 1.66, 1.9, false, true);
  const upper = new THREE.Mesh(upperGeo, knitMat);
  upper.castShadow = upper.receiveShadow = true;
  upper.frustumCulled = false;

  // ---- one small thing that makes them somebody's hands ----
  let accMesh = null;
  if (o.acc === 'watch') {
    const g = new THREE.Group();
    const strapMat = keep(softPatch(new THREE.MeshStandardMaterial({ color: '#5a3a24', roughness: 0.7 }), o.U, { wrap: 0.3 }));
    const caseMat = keep(new THREE.MeshStandardMaterial({ color: '#d8c08a', roughness: 0.25, metalness: 0.9 }));
    const faceMat = keep(new THREE.MeshStandardMaterial({ color: '#f4eee0', roughness: 0.4, emissive: new THREE.Color('#f4eee0').multiplyScalar(0.08) }));
    const strap = new THREE.Mesh(keep(new THREE.TorusGeometry(1.0, 0.13, 6, 28)), strapMat);
    strap.scale.set(1.08, 0.66, 1.9);
    const face = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.42, 0.42, 0.14, 24)), caseMat);
    face.position.set(0, 0.68, 0);
    const dial = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.34, 0.34, 0.02, 24)), faceMat);
    dial.position.set(0, 0.76, 0);
    g.add(strap, face, dial);
    g.position.set(0, 0, -1.25);
    strap.castShadow = face.castShadow = true;
    arm.add(g);
    accMesh = g;
  } else if (o.acc === 'ring') {
    const ringMat = keep(new THREE.MeshStandardMaterial({ color: '#e2b65a', roughness: 0.22, metalness: 1 }));
    const r = new THREE.Mesh(keep(new THREE.TorusGeometry(0.33, 0.06, 8, 24)), ringMat);
    r.scale.set(1.02, 0.92, 1);
    r.position.set(0, -0.01, 0.62);
    fingers[2].b[0].add(r);
    accMesh = r;
  } else if (o.acc === 'plaster') {
    const pc = makeCanvas(64, 32), g = pc.g;
    g.fillStyle = '#e9c9a0'; g.fillRect(0, 0, 64, 32);
    g.fillStyle = '#f3dcc0'; g.fillRect(20, 4, 24, 24);
    g.fillStyle = 'rgba(120,80,50,0.25)'; for (let y = 6; y < 28; y += 5) for (let x = 3; x < 18; x += 5) { g.fillRect(x, y, 1.5, 1.5); g.fillRect(x + 44, y, 1.5, 1.5); }
    g.fillStyle = '#e0503a'; g.beginPath();
    for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + (k / 10) * TAU, rr = k & 1 ? 3.5 : 8; g.lineTo(32 + Math.cos(a) * rr, 16 + Math.sin(a) * rr); }
    g.fill();
    const t = keep(new THREE.CanvasTexture(pc.canvas)); t.colorSpace = THREE.SRGBColorSpace;
    const m = keep(softPatch(new THREE.MeshStandardMaterial({ map: t, roughness: 0.8 }), o.U, { wrap: 0.5 }));
    // wrapped round the middle of the index finger: an open cylinder, a little proud of the skin
    const pg = keep(new THREE.CylinderGeometry(0.315, 0.31, 0.5, 18, 1, true, -1.9, 3.8).rotateX(Math.PI / 2));
    const pm = new THREE.Mesh(pg, m);
    pm.scale.set(1, 0.9, 1);
    pm.position.set(0, 0.0, 0.42);
    fingers[0].b[1].add(pm);
    accMesh = pm;
  }

  const group = new THREE.Group();
  group.add(mesh, upper);

  // ---- posing ----
  const qa = new THREE.Quaternion(), qb = new THREE.Quaternion(), qc = new THREE.Quaternion(), e = new THREE.Euler(), X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Zv = new THREE.Vector3(0, 0, 1);
  const vA = new THREE.Vector3(), vB = new THREE.Vector3(), vC = new THREE.Vector3(), vD = new THREE.Vector3(), m4 = new THREE.Matrix4();
  const armQ = new THREE.Quaternion(), invArm = new THREE.Quaternion();
  const elbow = new THREE.Vector3(), shoulder = new THREE.Vector3();

  /**
   * st = { wrist: Vector3, q: Quaternion (hand), shoulder: Vector3, pole: Vector3, pose: {f, t}, curl?: number }
   */
  function set(st) {
    // 1. where the elbow goes: two bones between the shoulder and the wrist, bending away from `pole`
    shoulder.copy(st.shoulder);
    const W = st.wrist;
    vA.subVectors(shoulder, W);
    let d = vA.length();
    const reach = (FOREARM + UPPER) * SC - 0.05;
    if (d > reach) { shoulder.copy(W).addScaledVector(vA, reach / d); d = reach; } // they lean in
    d = Math.max(d, 1e-3);
    vA.divideScalar(d); // wrist → shoulder
    const a = FOREARM * SC, b = UPPER * SC;
    const cosA = clamp((a * a + d * d - b * b) / (2 * a * d), -1, 1), sinA = Math.sqrt(1 - cosA * cosA);
    vB.copy(st.pole).addScaledVector(vA, -st.pole.dot(vA)); // the pole, square to the line
    if (vB.lengthSq() < 1e-6) vB.set(0, -1, 0).addScaledVector(vA, vA.y);
    vB.normalize();
    elbow.copy(W).addScaledVector(vA, a * cosA).addScaledVector(vB, a * sinA);
    // 2. the forearm points from the elbow to the wrist and rolls with the hand
    vC.subVectors(W, elbow).normalize(); // forearm +z
    vD.set(0, 1, 0).applyQuaternion(st.q); // the back of the hand
    vD.addScaledVector(vC, -vD.dot(vC));
    if (vD.lengthSq() < 1e-6) vD.set(0, 1, 0);
    vD.normalize();
    vB.crossVectors(vD, vC); // x
    m4.makeBasis(vB, vD, vC);
    armQ.setFromRotationMatrix(m4);
    arm.position.copy(W);
    arm.quaternion.copy(armQ);
    arm.scale.setScalar(SC);
    // 3. the wrist: whatever turns the forearm into the hand
    invArm.copy(armQ).invert();
    hand.quaternion.multiplyQuaternions(invArm, st.q);
    // 4. fingers
    const P = st.pose;
    for (let i = 0; i < 4; i++) {
      const fg = fingers[i], a4 = P.f[i];
      qa.setFromAxisAngle(Y, -S * a4[3]);
      qb.setFromAxisAngle(X, a4[0]);
      fg.b[0].quaternion.copy(fg.rest).multiply(qa).multiply(qb);
      fg.b[1].quaternion.setFromAxisAngle(X, a4[1]);
      fg.b[2].quaternion.setFromAxisAngle(X, a4[2]);
    }
    const tp = P.t;
    qa.setFromAxisAngle(Y, -S * tp[0] * 0.55);
    qb.setFromAxisAngle(X, tp[0] * 0.55 - tp[1] * 0.6);
    e.set(0, 0, S * tp[4]);
    thumb.b[0].quaternion.copy(thumb.rest).multiply(qa).multiply(qb).multiply(qc.setFromEuler(e));
    thumb.b[1].quaternion.setFromAxisAngle(X, tp[2]);
    thumb.b[2].quaternion.setFromAxisAngle(X, tp[3]);
    arm.updateMatrixWorld(true);
    // 5. the upper arm's sleeve: elbow to shoulder (and on past it, out of the picture)
    vA.subVectors(shoulder, elbow);
    const len = vA.length() + 40;
    vA.normalize();
    upper.position.copy(elbow).addScaledVector(vA, -0.6 * SC);
    // the sleeve's local -z runs from the elbow to the shoulder
    vB.copy(vA).negate();
    vC.copy(vD).addScaledVector(vB, -vD.dot(vB));
    if (vC.lengthSq() < 1e-6) vC.set(0, 1, 0);
    vC.normalize();
    vD.crossVectors(vC, vB);
    m4.makeBasis(vD, vC, vB);
    upper.quaternion.setFromRotationMatrix(m4);
    upper.scale.set(SC, SC, len);
  }

  // A point in the hand's frame (e.g. the cup of the palm), in world space.
  const handPoint = (x, y, z, out) => out.set(S * x, y, z).applyMatrix4(hand.matrixWorld);
  const tipOf = (i, out) => { const fg = i < 4 ? fingers[i] : thumb; const L = i < 4 ? fg.f.L[2] : THUMB.L[2]; return out.set(0, -0.05, L * 0.8).applyMatrix4(fg.b[2].matrixWorld); };

  return {
    group, mesh, hand, arm, side: S, elbow, set, handPoint, tipOf, acc: accMesh,
    dispose() { for (const x of own) x.dispose(); skeleton.dispose(); },
  };
}

// Blend two poses (component-wise) with a per-finger stagger already applied by the caller.
export function mixPose(a, b, k, out) {
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) out.f[i][j] = lerp(a.f[i][j], b.f[i][j], Array.isArray(k) ? k[i] : k);
  const kt = Array.isArray(k) ? k[4] : k;
  for (let j = 0; j < 5; j++) out.t[j] = lerp(a.t[j], b.t[j], kt);
  return out;
}
export const newPose = () => ({ f: [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]], t: [0, 0, 0, 0, 0] });

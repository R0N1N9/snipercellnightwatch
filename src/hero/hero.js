// GENERATED from the NightWatch bible (tools/render/hero.js) by export_hero_to_game.py. Edit there, re-export.
// Hero tier [PROPOSED]: a study of how far the procedural pipeline goes before hand-authored assets.
// Implements items 1–4 of art/style-guide.md › Polish target, in code:
//   • geometry: side-profile extrusions with real bevels, fillets and through-cut holes; lathed barrels,
//     tubes and limbs; rounded boxes with true radii, instead of raw boxes and cylinders
//   • shading:  one master toon material: a ramp per material (cloth soft, plates hard), a crisp moon rim,
//               a small specular "anime hit" on hard surfaces, painted low-frequency variation and bevel wear
//   • lines:    inverted-hull outlines in screen-space pixels, tinted per material (blue-black on cloth,
//               warm black on skin), on top of the canon depth-Laplacian ink pass
// Guns point -Z (the Killhouse contract: gripR / gripL / muzzle anchors). Characters face -Z. 1 unit = 1 m.
import * as THREE from 'three';

// ---------------------------------------------------------------------------------------------
// Master toon material
// ---------------------------------------------------------------------------------------------
function rampTex(vals) {
  const t = new THREE.DataTexture(new Uint8Array(vals), vals.length, 1, THREE.RedFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter; t.generateMipmaps = false; t.needsUpdate = true; return t;
}
const RAMPS = {
  cloth: rampTex([118, 150, 185, 215, 240, 255]),  // soft: more, closer bands
  plate: rampTex([125, 200, 245, 255]),            // the canon three tones
  hard: rampTex([105, 225, 255]),                  // two bands and a hard terminator for metal and helmets
};
const INK = { cloth: '#05070d', plate: '#040508', hard: '#030304', skin: '#0d0706' };
export const RIM = { dir: new THREE.Vector3(-0.45, 0.5, 0.75).normalize(), color: new THREE.Color('#8fc4ff') };

const NOISE = /* glsl */`
  float h3(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float vn(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(h3(i), h3(i + vec3(1,0,0)), f.x), mix(h3(i + vec3(0,1,0)), h3(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(h3(i + vec3(0,0,1)), h3(i + vec3(1,0,1)), f.x), mix(h3(i + vec3(0,1,1)), h3(i + vec3(1,1,1)), f.x), f.y), f.z); }`;

// Looks [PROPOSED]. 'hero': per-material ramps, painted noise, bevel wear, thick inverted-hull outlines.
// 'soft': thinner, blue-tinted hulls and quieter paint. 'keyart': the original concept-art look on the new models:
// no hulls (only the canon depth ink), the canon three-tone ramp everywhere, paint and wear turned well down.
export const HERO_STYLES = {
  hero: { paint: 1, wear: 1, rim: 1, spec: 1, hull: 1, tint: 0, ramp: 'kind' },
  soft: { paint: 0.55, wear: 0.55, rim: 0.8, spec: 0.7, hull: 0.5, tint: 0.45, ramp: 'kind' },
  keyart: { paint: 0.3, wear: 0.3, rim: 0.55, spec: 0.45, hull: 0, tint: 0, ramp: 'canon' },
};
const STY = { uStyPaint: { value: 1 }, uStyWear: { value: 1 }, uStyRim: { value: 1 }, uStySpec: { value: 1 } };
const HULL = { uHullScale: { value: 1 }, uHullMix: { value: 0 }, uHullTint: { value: new THREE.Color('#1a2433') } };
let STYLE = 'hero';
export function heroStyle(name = 'hero') {
  const S = HERO_STYLES[name] || HERO_STYLES.hero; STYLE = name;
  STY.uStyPaint.value = S.paint; STY.uStyWear.value = S.wear; STY.uStyRim.value = S.rim; STY.uStySpec.value = S.spec;
  HULL.uHullScale.value = S.hull; HULL.uHullMix.value = S.tint;
  for (const m of matCache.values()) m.gradientMap = S.ramp === 'canon' ? RAMPS.plate : RAMPS[m.userData.ramp];
  for (const m of hullMats.values()) m.visible = S.hull > 0;
  return name;
}
const matCache = new Map();
// kind: cloth | plate | hard. rim/spec/wear/paint are 0..1-ish strengths; scale = noise frequency (per metre).
export function hm(color, kind = 'plate', o = {}) {
  const key = color + kind + JSON.stringify(o, (k, v) => (v && v.isTexture ? v.uuid : v));
  if (matCache.has(key)) return matCache.get(key);
  const d = { cloth: { rim: 0.35, spec: 0, wear: 0, paint: 0.16, scale: 9 }, plate: { rim: 0.5, spec: 0.35, wear: 0.5, paint: 0.12, scale: 14 }, hard: { rim: 0.6, spec: 0.9, wear: 0.7, paint: 0.08, scale: 22 } }[kind];
  const P = { ...d, ...o };
  const m = new THREE.MeshToonMaterial({ color, gradientMap: RAMPS[P.ramp || kind], map: P.map || null, emissive: P.emissive || '#000000', emissiveIntensity: P.ei ?? 1, side: P.side ?? THREE.FrontSide });
  const U = {
    uRim: { value: P.rim }, uSpec: { value: P.spec }, uWear: { value: P.wear }, uPaint: { value: P.paint }, uScale: { value: P.scale },
    uRimDir: { value: RIM.dir }, uRimCol: { value: RIM.color }, uWearCol: { value: new THREE.Color(P.wearCol || '#9a9282') },
  };
  m.userData.ramp = P.ramp || kind;
  if (HERO_STYLES[STYLE].ramp === 'canon') m.gradientMap = RAMPS.plate;
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, U, STY);
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vOP; varying vec3 vON;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvOP = position; vON = objectNormal;');
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vOP; varying vec3 vON;
        uniform float uRim, uSpec, uWear, uPaint, uScale, uStyPaint, uStyWear, uStyRim, uStySpec; uniform vec3 uRimDir, uRimCol, uWearCol;
        ${NOISE}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        // Painted variation: two octaves of low-frequency value noise, like a wash over flat colour.
        float pn = vn(vOP * uScale) * 0.65 + vn(vOP * uScale * 3.1 + 7.0) * 0.35;
        diffuseColor.rgb *= 1.0 + uPaint * uStyPaint * (pn - 0.5) * 2.0;
        // Bevel wear: faces that aren't axis-aligned in object space are the bevels and fillets.
        vec3 an = abs(normalize(vON)); float ax = max(an.x, max(an.y, an.z));
        float bev = smoothstep(0.985, 0.86, ax) * smoothstep(0.25, 0.6, vn(vOP * uScale * 6.0));
        diffuseColor.rgb = mix(diffuseColor.rgb, uWearCol * 0.55, bev * uWear * uStyWear * 0.55);`)
      .replace('#include <opaque_fragment>', `
        vec3 vd = normalize(vViewPosition);
        float fres = 1.0 - clamp(dot(normal, vd), 0.0, 1.0);
        vec3 rd = normalize((viewMatrix * vec4(uRimDir, 0.0)).xyz);
        float rimMask = clamp(dot(normal, rd) * 0.8 + 0.35, 0.0, 1.0);
        outgoingLight += uRimCol * smoothstep(0.55, 0.68, fres) * rimMask * uRim * uStyRim * 0.55 * diffuseColor.rgb * 3.0;
        #if NUM_DIR_LIGHTS > 0
          vec3 hv = normalize(directionalLights[0].direction + vd);
          float sp = pow(clamp(dot(normal, hv), 0.0, 1.0), 60.0);
          outgoingLight += directionalLights[0].color * smoothstep(0.45, 0.55, sp) * uSpec * uStySpec * 0.22;
        #endif
        #include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => 'nw-hero';
  m.userData.ink = P.ink || INK[kind];
  m.userData.hullW = P.hull ?? (kind === 'cloth' ? 2.4 : 2.0);
  matCache.set(key, m); return m;
}
export const GLOW = (c, k = 2.4) => { const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(k) }); m.userData.noHull = true; return m; };

// ---------------------------------------------------------------------------------------------
// Inverted-hull outline (constant pixel width; smooth normals so hard edges don't crack)
// ---------------------------------------------------------------------------------------------
function hullNormals(geo) {
  if (geo.attributes.hullNormal) return;
  const p = geo.attributes.position, idx = geo.index, acc = new Map(), keyOf = (i) => `${Math.round(p.getX(i) * 1e4)},${Math.round(p.getY(i) * 1e4)},${Math.round(p.getZ(i) * 1e4)}`;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
  const tri = idx ? idx.count / 3 : p.count / 3;
  const keys = new Array(p.count); for (let i = 0; i < p.count; i++) keys[i] = keyOf(i);
  for (let t = 0; t < tri; t++) {
    const i0 = idx ? idx.getX(t * 3) : t * 3, i1 = idx ? idx.getX(t * 3 + 1) : t * 3 + 1, i2 = idx ? idx.getX(t * 3 + 2) : t * 3 + 2;
    a.fromBufferAttribute(p, i0); b.fromBufferAttribute(p, i1); c.fromBufferAttribute(p, i2);
    n.subVectors(c, b).cross(a.clone().sub(b)); // area-weighted
    for (const i of [i0, i1, i2]) { const k = keys[i]; const v = acc.get(k) || acc.set(k, new THREE.Vector3()).get(k); v.add(n); }
  }
  const out = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) { const v = acc.get(keys[i]).clone().normalize(); out[i * 3] = v.x; out[i * 3 + 1] = v.y; out[i * 3 + 2] = v.z; }
  geo.setAttribute('hullNormal', new THREE.BufferAttribute(out, 3));
}
const hullMats = new Map();
// Outline widths are in pixels: call when the render size changes.
export function setOutlineRes(w, h) { for (const m of hullMats.values()) m.uniforms.uRes.value.set(w, h); }
function hullMat(color, w) {
  const k = color + w; if (hullMats.has(k)) return hullMats.get(k);
  const m = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: { uColor: { value: new THREE.Color(color) }, uW: { value: w }, uRes: { value: new THREE.Vector2(innerWidth, innerHeight) }, ...HULL },
    vertexShader: `attribute vec3 hullNormal; uniform float uW, uHullScale; uniform vec2 uRes;
      void main(){
        vec4 clip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        vec3 n = normalize(normalMatrix * hullNormal);
        vec2 d = (projectionMatrix * vec4(n, 0.0)).xy;
        float l = length(d); d = l > 1e-5 ? d / l : vec2(0.0);
        clip.xy += d * uW * uHullScale * 2.0 / uRes * clip.w;
        clip.z += 0.00002 * clip.w;
        gl_Position = clip;
      }`,
    fragmentShader: 'uniform vec3 uColor, uHullTint; uniform float uHullMix; void main(){ gl_FragColor = vec4(mix(uColor, uHullTint, uHullMix), 1.0); }',
  });
  m.visible = HERO_STYLES[STYLE].hull > 0;
  hullMats.set(k, m); return m;
}
// Add outlines to every hero mesh under root. scale multiplies widths (e.g. 0.6 for a distant figure).
export function outline(root, scale = 1) {
  const meshes = []; root.traverse((o) => { if (o.isMesh && !o.userData.isHull && o.material?.userData?.ink && !o.material.userData.noHull && !o.userData.noHull && !o.children.some((c) => c.userData.isHull)) meshes.push(o); });
  for (const o of meshes) {
    hullNormals(o.geometry);
    const w = (o.userData.hullW ?? o.material.userData.hullW) * scale; if (w <= 0) continue;
    const h = new THREE.Mesh(o.geometry, hullMat(o.material.userData.ink, w));
    h.userData.isHull = true; h.castShadow = false; h.receiveShadow = false; h.frustumCulled = false;
    o.add(h);
  }
  return root;
}

// ---------------------------------------------------------------------------------------------
// Geometry kit
// ---------------------------------------------------------------------------------------------
// A 2D outline with filleted corners: pts = [[x, y, r?], ...].
export function shapeOf(pts, Cls = THREE.Shape) {
  const s = new Cls(), n = pts.length, P = pts.map((p) => new THREE.Vector2(p[0], p[1]));
  for (let i = 0; i < n; i++) {
    const p = P[i], r = pts[i][2] || 0;
    if (!r) { i ? s.lineTo(p.x, p.y) : s.moveTo(p.x, p.y); continue; }
    const a = P[(i - 1 + n) % n], b = P[(i + 1) % n];
    const da = a.clone().sub(p), db = b.clone().sub(p);
    const rr = Math.min(r, da.length() * 0.49, db.length() * 0.49);
    const s0 = p.clone().addScaledVector(da.normalize(), rr), s1 = p.clone().addScaledVector(db.normalize(), rr);
    i ? s.lineTo(s0.x, s0.y) : s.moveTo(s0.x, s0.y);
    s.quadraticCurveTo(p.x, p.y, s1.x, s1.y);
  }
  s.closePath(); return s;
}
export function extrude(pts, w, bevel, holes) {
  const s = shapeOf(pts);
  for (const h of holes || []) s.holes.push(shapeOf(h, THREE.Path));
  const bt = Math.min(bevel, w * 0.45);
  const g = new THREE.ExtrudeGeometry(s, { depth: Math.max(1e-4, w - 2 * bt), bevelEnabled: bevel > 0, bevelThickness: bt, bevelSize: bevel, bevelOffset: -bevel, bevelSegments: 2, curveSegments: 8 });
  g.translate(0, 0, -(w - 2 * bt) / 2);
  return g;
}
// Bend a geometry around the Y axis (a plate wrapping a torso): x → arc of radius R.
export function bend(geo, R) {
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i), a = x / R, r = R - z; p.setXYZ(i, Math.sin(a) * r, p.getY(i), R - Math.cos(a) * r); }
  geo.computeVertexNormals(); return geo;
}
// Rounded box with true radii and analytic normals.
const rbCache = new Map();
export function roundedBox(w, h, d, r, seg = 3) {
  const key = [w, h, d, r, seg].join(','); if (rbCache.has(key)) return rbCache.get(key);
  r = Math.min(r, w / 2, h / 2, d / 2) * 0.999;
  const g = new THREE.BoxGeometry(w, h, d, seg * 2, seg * 2, seg * 2), p = g.attributes.position, nn = g.attributes.normal;
  const v = new THREE.Vector3(), c = new THREE.Vector3(), lim = new THREE.Vector3(w / 2 - r, h / 2 - r, d / 2 - r), nlim = lim.clone().negate();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i); c.copy(v).clamp(nlim, lim); const dir = v.clone().sub(c);
    if (dir.lengthSq() < 1e-12) continue; dir.normalize(); v.copy(c).addScaledVector(dir, r);
    p.setXYZ(i, v.x, v.y, v.z); nn.setXYZ(i, dir.x, dir.y, dir.z);
  }
  rbCache.set(key, g); return g;
}
const Y = new THREE.Vector3(0, 1, 0);
export function K(parent) {
  const add = (geo, m, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); parent.add(o); return o; };
  return {
    add,
    // Side profile (gun convention): pts are [s, y, r] with s = distance forward (toward -Z); extruded across X, width w.
    side: (pts, w, m, { bevel = 0.002, holes, x = 0 } = {}) => { const g = extrude(pts, w, bevel, holes); g.rotateY(Math.PI / 2); return add(g, m, x); },
    // Front-facing profile: pts are [x, y, r] in the XY plane, extruded along Z (depth d), centred on z.
    face: (pts, d, m, { bevel = 0.0015, holes, z = 0 } = {}) => add(extrude(pts, d, bevel, holes), m, 0, 0, z),
    rb: (w, h, d, r, m, x, y, z, rx, ry, rz) => add(roundedBox(w, h, d, r), m, x, y, z, rx, ry, rz),
    // Lathe along -Z (barrels): prof = [[r, s], ...] with s forward.
    barrel: (prof, m, x = 0, y = 0, seg = 28) => { const g = new THREE.LatheGeometry(prof.map(([r, s]) => new THREE.Vector2(r, s)), seg); g.rotateX(-Math.PI / 2); return add(g, m, x, y, 0); },
    // Lathe around Y: prof = [[r, y], ...].
    lathe: (prof, m, x, y, z, rx = 0, ry = 0, rz = 0, seg = 28) => add(new THREE.LatheGeometry(prof.map(([r, yy]) => new THREE.Vector2(r, yy)), seg), m, x, y, z, rx, ry, rz),
    cyl: (r0, r1, len, m, x, y, z, rx = 0, ry = 0, rz = 0, seg = 20) => add(new THREE.CylinderGeometry(r0, r1, len, seg), m, x, y, z, rx, ry, rz),
    ball: (r, m, x, y, z, sx = 1, sy = 1, sz = 1) => { const o = add(new THREE.SphereGeometry(r, 28, 18), m, x, y, z); o.scale.set(sx, sy, sz); return o; },
    torus: (r, t, m, x, y, z, rx = 0, ry = 0, rz = 0, arc = Math.PI * 2) => add(new THREE.TorusGeometry(r, t, 10, 36, arc), m, x, y, z, rx, ry, rz),
  };
}
// Orient an object's +Y from A to B and put it at their midpoint.
export function span(o, A, B) { o.position.copy(A).add(B).multiplyScalar(0.5); o.quaternion.setFromUnitVectors(Y, B.clone().sub(A).normalize()); return o; }
// A limb between A and B with a lathe profile prof = [[t, r], ...], t from 0 (A) to 1 (B). Ends are capped round.
export function limb(parent, A, B, prof, m, flat = 1) {
  const L = A.distanceTo(B);
  const r0 = prof[0][1], r1 = prof[prof.length - 1][1];
  const pts = [new THREE.Vector2(0.001, -L / 2 - r0 * 0.6)];
  for (let i = 1; i <= 4; i++) { const a = (i / 5) * Math.PI / 2; pts.push(new THREE.Vector2(Math.sin(a) * r0, -L / 2 - Math.cos(a) * r0 * 0.6)); }
  for (const [t, r] of prof) pts.push(new THREE.Vector2(r, -L / 2 + t * L));
  for (let i = 4; i >= 1; i--) { const a = (i / 5) * Math.PI / 2; pts.push(new THREE.Vector2(Math.sin(a) * r1, L / 2 + Math.cos(a) * r1 * 0.6)); }
  pts.push(new THREE.Vector2(0.001, L / 2 + r1 * 0.6));
  const o = new THREE.Mesh(new THREE.LatheGeometry(pts, 24), m);
  span(o, A, B); if (flat !== 1) o.scale.set(flat, 1, 1); parent.add(o); return o;
}
// Two-bone IK: the elbow/knee between S and H, bending toward pole.
export function joint(S, H, l1, l2, pole) {
  const d = Math.min(S.distanceTo(H), l1 + l2 - 1e-3), dir = H.clone().sub(S).normalize();
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  const p = pole.clone().sub(dir.clone().multiplyScalar(pole.dot(dir))).normalize();
  return S.clone().addScaledVector(dir, a).addScaledVector(p, h);
}

// ---------------------------------------------------------------------------------------------
// Canvas textures (fabric camo, webbing, engraving)
// ---------------------------------------------------------------------------------------------
const texCache = new Map();
let seed = 11; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
function canvasTex(key, w, h, draw, rep = [1, 1]) {
  if (texCache.has(key)) return texCache.get(key);
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h; draw(cv.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...rep); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  texCache.set(key, t); return t;
}
// Multicam Black (night): blobs in four near-blacks, plus a woven grain. Drawn white-relative (multiplied by the material colour).
const CAMO = {
  mcblack: ['#c9cacb', '#a2a3a5', '#dcdddd', '#eeeeee', '#8a8b8d'],
  black: ['#d8d8d8', '#c8c8c8', '#e2e2e2', '#d0d0d0', '#bcbcbc'],
};
export const camo = (id = 'mcblack') => canvasTex('camo-' + id, 512, 512, (g, w, h) => {
  seed = 23; const C = CAMO[id]; g.fillStyle = C[0]; g.fillRect(0, 0, w, h);
  for (let layer = 1; layer < C.length; layer++) {
    g.fillStyle = C[layer];
    for (let i = 0; i < (layer === 3 ? 10 : 22); i++) {
      const cx = rnd() * w, cy = rnd() * h, r = 16 + rnd() * 30;
      g.beginPath();
      for (let a = 0; a <= 12; a++) { const t = (a / 12) * Math.PI * 2, rr = r * (0.6 + rnd() * 0.6); const x = cx + Math.cos(t) * rr * 1.5, y = cy + Math.sin(t) * rr; a ? g.lineTo(x, y) : g.moveTo(x, y); }
      g.closePath(); g.fill();
      // wrap so the tile repeats seamlessly
      for (const [dx, dy] of [[w, 0], [-w, 0], [0, h], [0, -h]]) { g.save(); g.translate(dx, dy); g.fill(); g.restore(); }
    }
  }
  g.globalAlpha = 0.07; g.strokeStyle = '#000';
  for (let y = 0; y < h; y += 3) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
  g.globalAlpha = 1;
}, [1, 2]);
// MOLLE webbing rows for carrier and belt.
export const webbing = () => canvasTex('webbing', 128, 128, (g, w, h) => {
  g.fillStyle = '#e2ddd4'; g.fillRect(0, 0, w, h);
  for (let y = 10; y < h; y += 32) {
    g.fillStyle = '#b8b0a3'; g.fillRect(0, y, w, 12);
    g.fillStyle = '#857d71'; g.fillRect(0, y + 11, w, 2);
    for (let x = 0; x < w; x += 32) { g.fillStyle = '#e2ddd4'; g.fillRect(x + 24, y, 5, 12); }
  }
  g.globalAlpha = 0.08; g.fillStyle = '#000'; for (let i = 0; i < 300; i++) g.fillRect(rnd() * w, rnd() * h, 1, 1); g.globalAlpha = 1;
}, [3, 2]);
export const decal = (key, w, h, draw) => canvasTex('decal-' + key, w, h, (g) => { g.clearRect(0, 0, w, h); draw(g, w, h); });
export function decalMesh(tex, w, h, color = '#b9bdc2') {
  const m = new THREE.MeshBasicMaterial({ map: tex, color, transparent: true, alphaTest: 0.35, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  const o = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m); o.userData.noHull = true; return o;
}

// ---------------------------------------------------------------------------------------------
// Weapon palette
// ---------------------------------------------------------------------------------------------
const W = {
  poly: () => hm('#2c2f33', 'plate', { wear: 0.6 }),
  steel: () => hm('#2b2e33', 'hard'),
  dark: () => hm('#17181b', 'hard', { wear: 0.5 }),
  olive: () => hm('#3e4436', 'plate', { wear: 0.7, wearCol: '#b0a888' }),
  ranger: () => hm('#3d4232', 'plate', { wear: 0.7, wearCol: '#b0a888' }),
  fde: () => hm('#5f533e', 'plate', { wear: 0.6, wearCol: '#c9b48e' }),
  rubber: () => hm('#121314', 'cloth', { paint: 0.08 }),
};

// ---------------------------------------------------------------------------------------------
// X4 SHRIKE PDW (hero) — same design and anchors as Killhouse src/nw/guns.js buildPDW().
// ---------------------------------------------------------------------------------------------
export function heroX4() {
  const g = new THREE.Group(), k = K(g);
  const poly = W.poly(), steel = W.steel(), dark = W.dark(), olive = W.olive();
  // Upper receiver: chamfered nose, sloped rear.
  k.side([[-0.012, 0.006, 0.003], [0.248, 0.006, 0.003], [0.254, 0.026, 0.006], [0.242, 0.05, 0.004], [0.02, 0.05, 0.004], [-0.014, 0.04, 0.008]], 0.044, steel, { bevel: 0.0025 });
  // Lower receiver: the polymer body, with a magwell flare at the grip.
  k.side([[-0.026, 0.009, 0.004], [0.25, 0.009, 0.004], [0.258, -0.006, 0.01], [0.246, -0.031, 0.006], [0.085, -0.031, 0.002], [0.01, -0.031, 0.004], [-0.03, -0.014, 0.012]], 0.047, poly, { bevel: 0.003 });
  // Accent panel: olive side plates with three lightening slots cut through to the body.
  const slots = [0, 1, 2].map((i) => { const s0 = 0.18 + i * 0.02; return [[s0, -0.009, 0.003], [s0 + 0.012, -0.009, 0.003], [s0 + 0.012, -0.022, 0.003], [s0, -0.022, 0.003]]; });
  k.side([[0.168, -0.001, 0.006], [0.246, -0.001, 0.004], [0.25, -0.016, 0.006], [0.242, -0.029, 0.006], [0.168, -0.029, 0.006]], 0.0505, olive, { bevel: 0.0015, holes: slots });
  // Pistol grip with finger grooves and a palm swell (the magazine lives inside).
  k.side([[0.026, -0.02], [0.022, -0.045, 0.008], [0.027, -0.06, 0.006], [0.017, -0.075, 0.008], [0.021, -0.09, 0.006], [0.011, -0.105, 0.008], [0.009, -0.126, 0.004],
    [-0.046, -0.12, 0.006], [-0.037, -0.08, 0.02], [-0.031, -0.035, 0.01], [-0.046, -0.012, 0.006], [-0.03, 0.0, 0.004], [0.026, 0.0]], 0.036, poly, { bevel: 0.004 });
  for (let i = 0; i < 6; i++) k.rb(0.038, 0.0025, 0.012, 0.001, dark, 0, -0.05 - i * 0.012, 0.035 + i * 0.0022, -0.18, 0, 0); // back-strap texture
  // Mag base plate (olive), proud of the grip.
  k.side([[0.014, -0.122, 0.003], [-0.052, -0.116, 0.003], [-0.055, -0.13, 0.005], [0.016, -0.138, 0.005]], 0.042, olive, { bevel: 0.002 });
  // Trigger guard (a real loop) and trigger.
  k.side([[0.004, -0.028], [0.088, -0.028, 0.002], [0.086, -0.04, 0.006], [0.074, -0.058, 0.01], [0.036, -0.062, 0.008], [0.02, -0.05]], 0.026, poly,
    { bevel: 0.0015, holes: [[[0.03, -0.033, 0.002], [0.078, -0.033, 0.003], [0.069, -0.051, 0.007], [0.04, -0.054, 0.005], [0.03, -0.045, 0.002]]] });
  k.side([[0.052, -0.031], [0.058, -0.031], [0.057, -0.041, 0.004], [0.049, -0.05, 0.003], [0.046, -0.048], [0.051, -0.04]], 0.007, steel, { bevel: 0.001 });
  // Top rail: a base strip and ten teeth.
  k.rb(0.03, 0.007, 0.226, 0.002, steel, 0, 0.054, -0.122);
  for (let i = 0; i < 10; i++) k.rb(0.036, 0.0055, 0.011, 0.0015, steel, 0, 0.0595, -0.018 - i * 0.022);
  // Ejection port (right) with its dust cover, takedown pins, selector, mag release.
  k.rb(0.003, 0.017, 0.05, 0.002, dark, 0.0225, 0.03, -0.09);
  k.rb(0.002, 0.012, 0.044, 0.001, steel, 0.0235, 0.03, -0.09);
  for (const s of [0.004, 0.236]) { k.cyl(0.0045, 0.0045, 0.051, steel, 0, -0.012, -s, 0, 0, Math.PI / 2, 14); }
  k.rb(0.004, 0.006, 0.026, 0.0015, steel, -0.0255, -0.002, -0.03, 0.35);
  k.cyl(0.0042, 0.0042, 0.004, steel, -0.0236, -0.002, -0.017, 0, 0, Math.PI / 2, 14);
  k.cyl(0.005, 0.005, 0.05, dark, 0, -0.02, -0.075, 0, 0, Math.PI / 2, 14);
  // Charging handle (T) at the back.
  k.rb(0.058, 0.008, 0.014, 0.003, steel, 0, 0.041, 0.008);
  // Barrel, gas block, slotted flash hider (real tines and gaps).
  const by = 0.022;
  k.barrel([[0.0001, 0.25], [0.0095, 0.25], [0.0095, 0.333], [0.0001, 0.333]], dark, 0, by);
  k.barrel([[0.0001, 0.27], [0.0125, 0.27], [0.0135, 0.274], [0.0135, 0.292], [0.0125, 0.296], [0.0001, 0.296]], steel, 0, by);
  k.barrel([[0.0001, 0.333], [0.0145, 0.333], [0.015, 0.337], [0.015, 0.348], [0.0001, 0.348]], dark, 0, by);
  for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2 + Math.PI / 4; k.rb(0.0055, 0.0055, 0.03, 0.0015, dark, Math.cos(a) * 0.0115, by + Math.sin(a) * 0.0115, -0.362, 0, 0, a); }
  // Folding vertical foregrip, unfolded: hinge block, lathed grip with ribs.
  k.rb(0.026, 0.013, 0.042, 0.004, steel, 0, -0.033, -0.22);
  k.cyl(0.004, 0.004, 0.03, steel, 0, -0.033, -0.234, 0, 0, Math.PI / 2, 12);
  const fg = k.lathe([[0.0001, 0], [0.0135, 0], [0.015, -0.006], [0.0142, -0.02], [0.0152, -0.035], [0.0142, -0.05], [0.0158, -0.068], [0.0165, -0.078], [0.012, -0.086], [0.0001, -0.087]], poly, 0, -0.038, -0.22, 0.12);
  fg.scale.set(0.85, 1, 1);
  // Telescoping wire stock: two rods, end caps, and a shaped butt with a cut-out and rubber pad.
  for (const sx of [-1, 1]) { k.cyl(0.0042, 0.0042, 0.205, steel, sx * 0.017, 0.012, 0.09, Math.PI / 2, 0, 0, 12); k.ball(0.0055, steel, sx * 0.017, 0.012, 0.19); }
  k.side([[-0.172, 0.05, 0.006], [-0.198, 0.054, 0.01], [-0.206, -0.054, 0.012], [-0.19, -0.062, 0.008], [-0.172, -0.028, 0.014]], 0.044, poly,
    { bevel: 0.003, holes: [[[-0.18, 0.03, 0.006], [-0.192, 0.032, 0.005], [-0.195, -0.02, 0.006], [-0.183, -0.012, 0.006]]] });
  k.side([[-0.2, 0.054, 0.006], [-0.211, 0.054, 0.004], [-0.217, -0.056, 0.006], [-0.204, -0.06, 0.004]], 0.046, W.rubber(), { bevel: 0.002 });
  for (let i = 0; i < 7; i++) k.rb(0.044, 0.003, 0.004, 0.001, W.rubber(), 0, -0.045 + i * 0.014, 0.2125 + (0.045 - i * 0.014) * 0.055);
  // Sling loop at the rear of the receiver.
  k.torus(0.009, 0.0022, steel, -0.026, -0.004, 0.024, 0, Math.PI / 2, 0);
  // Open reflex sight: base, a framed window with a hood, glass and the dot.
  const sy = 0.084;
  k.side([[0.04, 0.059, 0.002], [0.098, 0.059, 0.002], [0.094, 0.07, 0.003], [0.044, 0.07, 0.003]], 0.032, dark, { bevel: 0.0015 });
  k.face([[-0.0195, 0.066, 0.003], [0.0195, 0.066, 0.003], [0.0195, 0.098, 0.01], [0.012, 0.106, 0.006], [-0.012, 0.106, 0.006], [-0.0195, 0.098, 0.01]], 0.009, dark,
    { z: -0.088, holes: [[[-0.0155, 0.071, 0.002], [0.0155, 0.071, 0.002], [0.0155, 0.096, 0.007], [-0.0155, 0.096, 0.007]]] });
  k.cyl(0.0055, 0.0055, 0.006, steel, 0.022, 0.078, -0.08, 0, 0, Math.PI / 2, 16);
  const win = new THREE.Mesh(new THREE.PlaneGeometry(0.031, 0.025), new THREE.MeshBasicMaterial({ color: '#3a6a74', transparent: true, opacity: 0.22, depthWrite: false }));
  win.position.set(0, sy, -0.088); g.add(win);
  const dot = new THREE.Mesh(new THREE.CircleGeometry(0.0018, 12), GLOW('#ff3040', 3)); dot.position.set(0, sy, -0.0935); g.add(dot);
  // IR laser box (right side): rounded body, two apertures (dull red IR, clear vis), pressure pad.
  k.rb(0.022, 0.03, 0.072, 0.006, olive, 0.036, 0.016, -0.2);
  k.rb(0.006, 0.02, 0.05, 0.002, steel, 0.025, 0.016, -0.2);
  k.cyl(0.006, 0.006, 0.004, dark, 0.04, 0.024, -0.237, Math.PI / 2, 0, 0, 16); k.ball(0.0042, GLOW('#ff3040', 1.4), 0.04, 0.024, -0.238, 1, 1, 0.4);
  k.cyl(0.0055, 0.0055, 0.004, dark, 0.032, 0.008, -0.237, Math.PI / 2, 0, 0, 16); k.ball(0.0038, hm('#c8d8e0', 'hard'), 0.032, 0.008, -0.238, 1, 1, 0.4);
  k.rb(0.004, 0.014, 0.018, 0.002, dark, 0.048, 0.016, -0.19);
  // Engraving on the right of the lower.
  const tag = decal('x4', 512, 64, (c) => { c.fillStyle = '#fff'; c.font = '600 34px "JetBrains Mono", monospace'; c.textBaseline = 'middle'; c.fillText('X4 SHRIKE  ·  PDW', 6, 34); });
  const dm = decalMesh(tag, 0.12, 0.015, '#8d949c'); dm.position.set(0.0238, -0.017, -0.085); dm.rotation.y = Math.PI / 2; g.add(dm);
  g.userData = {
    gripR: new THREE.Vector3(0, -0.075, 0.01), gripL: new THREE.Vector3(0, -0.085, -0.22), muzzle: new THREE.Vector3(0, 0.022, -0.38),
    sight: sy,
    // Hand specs (gun-local): where the fist closes, round which axis, grip radius, back-of-hand offset [x, z] in the
    // hand frame, finger arc [start, length], and the wrist position.
    handR: { at: new THREE.Vector3(0, -0.07, 0.012), axis: new THREE.Vector3(0, -Math.cos(0.18), Math.sin(0.18)), r: 0.021, back: [0.03, -0.008], arc: [-0.1 * Math.PI, 1.15 * Math.PI], wrist: new THREE.Vector3(0.032, -0.06, 0.07) },
    handL: { at: new THREE.Vector3(0, -0.085, -0.224), axis: new THREE.Vector3(0, -Math.cos(0.12), -Math.sin(0.12)), r: 0.016, back: [-0.026, -0.006], arc: [-0.1 * Math.PI, 1.15 * Math.PI], wrist: new THREE.Vector3(-0.03, -0.1, -0.16) },
  };
  shade(g); return g;
}

// ---------------------------------------------------------------------------------------------
// VX-7 LANTERN (hero) — the Operator's rifle (armory.js vx7()), at the same proportions, muzzle -Z.
// ---------------------------------------------------------------------------------------------
// Options (variants of the same rifle for other roles): furn = furniture colour, optic = 'holo' | 'lpvo',
// can = 'long' for a longer suppressor, bipod = folded bipod under the handguard, lantern = false to drop the illuminator.
export function heroVX7(o = {}) {
  const g = new THREE.Group(), k = K(g);
  const gm = hm('#2a2d31', 'plate', { wear: 0.6 }), steel = W.steel(), dark = W.dark(), rg = o.furn ? hm(o.furn, 'plate', { wear: 0.7, wearCol: '#c9b48e' }) : W.ranger(), fde = W.fde();
  // Upper receiver with forward-assist bump and brass deflector.
  k.side([[-0.17, 0.0, 0.003], [0.17, 0.0, 0.003], [0.172, 0.036, 0.004], [0.165, 0.04, 0.002], [-0.15, 0.04, 0.004], [-0.172, 0.03, 0.008]], 0.056, gm, { bevel: 0.003 });
  k.rb(0.012, 0.022, 0.03, 0.005, gm, 0.03, 0.026, 0.11);
  k.rb(0.004, 0.022, 0.06, 0.002, dark, 0.0295, 0.018, -0.01);               // ejection port
  k.rb(0.002, 0.016, 0.054, 0.001, steel, 0.0305, 0.018, -0.01);
  // Lower receiver: magwell flare, trigger guard loop.
  k.side([[-0.17, 0.002, 0.004], [0.17, 0.002, 0.004], [0.165, -0.036, 0.01], [0.105, -0.045, 0.006], [0.03, -0.045, 0.006], [0.0, -0.036, 0.006], [-0.17, -0.036, 0.008]], 0.058, gm, { bevel: 0.003 });
  k.side([[0.1, -0.035], [0.12, -0.048, 0.004], [0.112, -0.062, 0.004], [0.026, -0.062, 0.004], [0.018, -0.04, 0.004], [0.026, -0.035]], 0.062, gm, { bevel: 0.002 }); // magwell
  k.side([[-0.1, -0.03], [-0.02, -0.03], [-0.02, -0.048, 0.006], [-0.05, -0.068, 0.012], [-0.09, -0.07, 0.01], [-0.11, -0.05]], 0.03, gm,
    { bevel: 0.0015, holes: [[[-0.088, -0.038, 0.002], [-0.028, -0.038, 0.002], [-0.03, -0.05, 0.005], [-0.055, -0.062, 0.008], [-0.084, -0.062, 0.006]]] });
  k.side([[-0.055, -0.037], [-0.049, -0.037], [-0.05, -0.048, 0.004], [-0.058, -0.056, 0.003], [-0.061, -0.054], [-0.056, -0.046]], 0.007, steel, { bevel: 0.001 });
  for (const s of [-0.15, 0.15]) k.cyl(0.005, 0.005, 0.062, steel, 0, -0.012, -s, 0, 0, Math.PI / 2, 14);
  k.rb(0.004, 0.008, 0.03, 0.002, steel, -0.0305, -0.012, 0.05, 0.4);
  // Pistol grip (same family as the X4's), raked back.
  const grip = new THREE.Group(); grip.position.set(0, -0.03, 0.1); grip.rotation.x = -0.22; g.add(grip);
  K(grip).side([[0.022, 0.0], [0.02, -0.03, 0.008], [0.025, -0.045, 0.006], [0.015, -0.06, 0.008], [0.019, -0.075, 0.006], [0.01, -0.09, 0.008], [0.008, -0.118, 0.006],
    [-0.04, -0.118, 0.008], [-0.033, -0.075, 0.02], [-0.03, -0.02, 0.01], [-0.034, 0.0]], 0.036, dark, { bevel: 0.004 });
  // Curved 30-round magazine with ribs and an FDE base pad.
  const magPts = [], magN = 10;
  for (let i = 0; i <= magN; i++) { const t = i / magN, a = t * 0.38; magPts.push([0.062 + Math.sin(a) * 0.17 - 0.0, -0.05 - Math.sin(a + 1.2) * 0.0 - t * 0.165, 0]); }
  const back = magPts.map(([s, y]) => [s - 0.07, y + 0.004]).reverse();
  magPts[0][2] = 0; back[0][2] = 0.006; magPts[magN][2] = 0.008;
  k.side([...magPts, ...back], 0.026, dark, { bevel: 0.003 });
  k.side([[0.122, -0.212, 0.004], [0.05, -0.21, 0.004], [0.048, -0.226, 0.006], [0.126, -0.228, 0.006]], 0.03, fde, { bevel: 0.002 });
  for (let i = 0; i < 4; i++) k.rb(0.0275, 0.003, 0.05, 0.001, dark, 0, -0.08 - i * 0.03, -0.036 - 0.07 - i * 0.012 + 0.03, 0.38 * (i + 1) / 5);
  // Free-float handguard (ranger green) with M-LOK slots cut through, top rail, barrel visible inside.
  const mlok = []; for (let i = 0; i < 5; i++) { const s0 = 0.2 + i * 0.062; mlok.push([[s0, -0.012, 0.004], [s0 + 0.034, -0.012, 0.004], [s0 + 0.034, -0.022, 0.004], [s0, -0.022, 0.004]]); }
  k.side([[0.168, 0.034, 0.004], [0.53, 0.034, 0.008], [0.534, -0.036, 0.008], [0.168, -0.036, 0.004]], 0.064, rg, { bevel: 0.004, holes: mlok });
  for (let i = 0; i < 4; i++) k.rb(0.066, 0.012, 0.026, 0.004, rg, 0, -0.036, -0.21 - i * 0.08);
  k.barrel([[0.0001, 0.17], [0.011, 0.17], [0.011, 0.55], [0.0001, 0.55]], dark, 0, 0.004);
  k.rb(0.03, 0.008, 0.68, 0.002, steel, 0, 0.044, -0.17);
  for (let i = 0; i < 30; i++) k.rb(0.036, 0.0055, 0.011, 0.0015, steel, 0, 0.0505, 0.155 - i * 0.022);
  // Suppressor: lathe with heat rings and a flat-faced end cap.
  k.barrel([[0.0001, 0.53], [0.024, 0.53], [0.028, 0.535], [0.028, 0.72], [0.0265, 0.73], [0.012, 0.732], [0.0001, 0.732]], dark, 0, 0.004);
  for (let i = 0; i < 3; i++) k.barrel([[0.0285, 0.56 + i * 0.05], [0.0295, 0.562 + i * 0.05], [0.0295, 0.568 + i * 0.05], [0.0285, 0.57 + i * 0.05]], steel, 0, 0.004);
  // Stock: buffer tube, adjustable stock with cheek riser and cut-out, rubber butt.
  k.barrel([[0.0001, -0.17], [0.017, -0.17], [0.017, -0.36], [0.0001, -0.36]], dark, 0, 0.012);
  k.side([[-0.2, 0.034, 0.008], [-0.36, 0.044, 0.01], [-0.4, 0.05, 0.01], [-0.408, -0.07, 0.012], [-0.384, -0.078, 0.008], [-0.34, -0.03, 0.02], [-0.2, -0.016, 0.01]], 0.05, rg,
    { bevel: 0.004, holes: [[[-0.3, 0.018, 0.008], [-0.355, 0.024, 0.008], [-0.37, -0.012, 0.01], [-0.32, -0.006, 0.008]]] });
  k.side([[-0.404, 0.05, 0.006], [-0.418, 0.05, 0.004], [-0.424, -0.072, 0.008], [-0.408, -0.078, 0.004]], 0.052, W.rubber(), { bevel: 0.002 });
  if (o.optic !== 'lpvo') {
    // Holographic sight: body, hood with a window, glass, ring-and-dot reticle.
    k.side([[-0.06, 0.05, 0.004], [0.04, 0.05, 0.004], [0.04, 0.068, 0.006], [-0.06, 0.068, 0.006]], 0.046, dark, { bevel: 0.002 });
    k.face([[-0.026, 0.062, 0.004], [0.026, 0.062, 0.004], [0.026, 0.112, 0.012], [-0.026, 0.112, 0.012]], 0.09, dark,
      { z: 0.0, holes: [[[-0.021, 0.07, 0.003], [0.021, 0.07, 0.003], [0.021, 0.105, 0.009], [-0.021, 0.105, 0.009]]] });
    k.cyl(0.007, 0.007, 0.01, steel, 0.03, 0.08, 0.02, 0, 0, Math.PI / 2, 16);
    for (let i = 0; i < 3; i++) k.rb(0.006, 0.004, 0.006, 0.001, steel, -0.012 + i * 0.012, 0.057, 0.04);
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(0.044, 0.036), new THREE.MeshBasicMaterial({ color: '#3a6a74', transparent: true, opacity: 0.22, depthWrite: false })); glass.position.set(0, 0.088, -0.04); g.add(glass);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.008, 0.0006, 6, 32), GLOW('#ff3040', 2.5)); ring.position.set(0, 0.088, -0.041); g.add(ring);
    k.ball(0.0012, GLOW('#ff3040', 3), 0, 0.088, -0.0415);
  } else {
    // LPVO: a scope tube with objective and ocular bells on two rings, turrets on top and side.
    k.barrel([[0.0001, -0.12], [0.02, -0.12], [0.024, -0.1], [0.024, -0.07], [0.016, -0.05], [0.016, 0.08], [0.022, 0.1], [0.026, 0.13], [0.026, 0.15], [0.0001, 0.15]], dark, 0, 0.098);
    for (const z of [-0.0, -0.1]) k.rb(0.03, 0.05, 0.016, 0.004, dark, 0, 0.072, z);
    k.cyl(0.009, 0.009, 0.02, steel, 0, 0.122, -0.02); k.cyl(0.009, 0.009, 0.02, steel, 0.024, 0.098, -0.02, 0, 0, Math.PI / 2);
    k.barrel([[0.0001, 0.151], [0.022, 0.151], [0.0001, 0.152]], hm('#2a4a5a', 'hard', { spec: 1.2 }), 0, 0.098);
  }
  // IR aiming box (FDE) on the handguard: rounded body, apertures, dull red lens.
  k.rb(0.03, 0.036, 0.08, 0.007, fde, 0.046, 0.018, -0.35);
  k.cyl(0.0075, 0.0075, 0.004, dark, 0.05, 0.026, -0.392, Math.PI / 2, 0, 0, 16); k.ball(0.005, GLOW('#ff3040', 1.3), 0.05, 0.026, -0.393, 1, 1, 0.4);
  k.cyl(0.006, 0.006, 0.004, dark, 0.042, 0.008, -0.392, Math.PI / 2, 0, 0, 16);
  if (o.lantern !== false) {
    // The lantern: integral IR illuminator under the muzzle end of the handguard.
    k.barrel([[0.0001, 0.42], [0.022, 0.42], [0.024, 0.43], [0.024, 0.49], [0.026, 0.495], [0.026, 0.505], [0.0001, 0.505]], fde, 0, -0.058);
    k.rb(0.02, 0.022, 0.05, 0.004, fde, 0, -0.044, -0.46);
    k.barrel([[0.0001, 0.5055], [0.019, 0.5055], [0.0001, 0.507]], GLOW('#cfe6ff', 1.6), 0, -0.058);
  }
  if (o.can === 'long') { k.barrel([[0.0001, 0.72], [0.028, 0.72], [0.028, 0.86], [0.0265, 0.87], [0.012, 0.872], [0.0001, 0.872]], dark, 0, 0.004); for (let i = 0; i < 2; i++) k.barrel([[0.0285, 0.76 + i * 0.05], [0.0295, 0.762 + i * 0.05], [0.0295, 0.768 + i * 0.05], [0.0285, 0.77 + i * 0.05]], steel, 0, 0.004); }
  if (o.bipod) { for (const sx of [-1, 1]) k.cyl(0.006, 0.005, 0.2, steel, sx * 0.016, -0.05, -0.36, Math.PI / 2, 0, 0, 10); k.rb(0.05, 0.02, 0.03, 0.006, dark, 0, -0.046, -0.47); }
  // Engraving.
  const tag = decal('vx7', 512, 64, (c) => { c.fillStyle = '#fff'; c.font = '600 34px "JetBrains Mono", monospace'; c.textBaseline = 'middle'; c.fillText('VX-7 LANTERN  ·  SAFE  SEMI  AUTO', 6, 34); });
  const dm = decalMesh(tag, 0.15, 0.018, '#8d949c'); dm.position.set(0.0293, -0.02, -0.05); dm.rotation.y = Math.PI / 2; g.add(dm);
  g.userData = {
    gripR: new THREE.Vector3(0, -0.075, 0.115), gripL: new THREE.Vector3(0, -0.04, -0.33), muzzle: new THREE.Vector3(0, 0.004, o.can === 'long' ? -0.872 : -0.732),
    sight: 0.088,
    handR: { at: new THREE.Vector3(0, -0.088, 0.12), axis: new THREE.Vector3(0, -Math.cos(0.22), Math.sin(0.22)), r: 0.02, back: [0.03, -0.008], arc: [-0.1 * Math.PI, 1.15 * Math.PI], wrist: new THREE.Vector3(0.032, -0.08, 0.18) },
    handL: { at: new THREE.Vector3(0, -0.004, -0.25), axis: new THREE.Vector3(0, 0, -1), r: 0.04, back: [-0.03, -0.034], arc: [-0.55 * Math.PI, 0.95 * Math.PI], wrist: new THREE.Vector3(-0.05, -0.08, -0.19) },
  };
  shade(g); return g;
}

// Any armory or canon gun on the hero rig: turn it muzzle -Z, then place the fists from its bounds (grip behind the
// middle and low, support hand on the handguard) using the VX-7's hand shapes. negZ: the model already points -Z.
export function adaptGun(model, { negZ = false, grip = 0.38, fore = 0.33, gripY = 0.55 } = {}) {
  const g = new THREE.Group(), inner = new THREE.Group(); inner.add(model); g.add(inner);
  if (!negZ) inner.rotation.y = Math.PI / 2;
  g.updateMatrixWorld(true);
  const bb = new THREE.Box3().setFromObject(inner), L = bb.max.z - bb.min.z;
  const ref = heroVX7().userData;
  const place = (h, at) => ({ ...h, at, wrist: at.clone().add(h.wrist.clone().sub(h.at)) });
  g.userData.handR = place(ref.handR, new THREE.Vector3(0, bb.min.y * gripY, bb.max.z - grip * L));
  g.userData.handL = place(ref.handL, new THREE.Vector3(0, (bb.min.y + bb.max.y) * 0.5 - 0.01, bb.min.z + fore * L));
  g.userData.muzzle = new THREE.Vector3(0, (bb.min.y + bb.max.y) * 0.5, bb.min.z);
  return g;
}
export function shade(root) { root.traverse((o) => { if (o.isMesh && !o.material.transparent) { o.castShadow = true; o.receiveShadow = true; } }); }
// ---------------------------------------------------------------------------------------------
// Held items for the roster: they follow the gun contract (hand specs in local space, userData.at = placement in
// the aim frame, which sits between the shoulders).
// ---------------------------------------------------------------------------------------------
// Bulwark: a bent ballistic shield with a viewport on the left arm, a sidearm in the right hand.
export function heroShieldKit() {
  const g = new THREE.Group();
  const sh = new THREE.Group(); sh.position.set(-0.2, -0.42, -0.32); sh.rotation.y = 0.3; g.add(sh); const ks = K(sh);
  const panel = new THREE.Mesh(bend(extrude([[-0.27, -0.46, 0.05], [0.27, -0.46, 0.05], [0.27, 0.42, 0.08], [0.2, 0.5, 0.06], [-0.2, 0.5, 0.06], [-0.27, 0.42, 0.08]], 0.03, 0.008,
    [[[-0.12, 0.25, 0.012], [0.12, 0.25, 0.012], [0.12, 0.33, 0.012], [-0.12, 0.33, 0.012]]]), 0.9), hm('#1d1f22', 'plate', { wear: 0.55, paint: 0.18, scale: 6 }));
  panel.rotation.y = Math.PI; sh.add(panel);
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.08), new THREE.MeshBasicMaterial({ color: '#3a6a74', transparent: true, opacity: 0.35, depthWrite: false })); glass.position.set(0, 0.29, 0.0); sh.add(glass);
  ks.rb(0.42, 0.016, 0.01, 0.004, hm('#c8283a', 'plate', { emissive: '#c8283a', ei: 0.3, wear: 0 }), 0, 0.18, -0.02);
  ks.rb(0.3, 0.05, 0.01, 0.006, hm('#5f533e', 'plate', { wear: 0.3 }), 0, -0.3, -0.022);
  ks.rb(0.56, 0.02, 0.05, 0.008, hm('#121314', 'cloth'), 0, -0.47, 0.01);                                    // rubber edge
  ks.rb(0.03, 0.14, 0.03, 0.01, W.steel(), 0.0, -0.02, 0.05); ks.rb(0.03, 0.02, 0.05, 0.006, W.steel(), 0, 0.06, 0.035); ks.rb(0.03, 0.02, 0.05, 0.006, W.steel(), 0, -0.1, 0.035); // handle
  ks.rb(0.06, 0.18, 0.012, 0.004, hm('#121314', 'cloth'), 0, -0.02, 0.066);                                  // forearm pad
  // Sidearm.
  const p = new THREE.Group(); p.position.set(0.12, -0.02, -0.36); g.add(p); const kp = K(p), poly = W.poly(), steel = W.steel();
  kp.side([[-0.075, 0.0, 0.004], [0.11, 0.0, 0.004], [0.112, 0.032, 0.006], [-0.072, 0.032, 0.006]], 0.028, steel, { bevel: 0.002 });
  for (let i = 0; i < 6; i++) kp.rb(0.03, 0.02, 0.003, 0.001, W.dark(), 0, 0.017, 0.06 - i * 0.007);
  kp.side([[-0.06, -0.002], [0.1, -0.002, 0.004], [0.1, -0.016, 0.006], [0.05, -0.02], [0.03, -0.034, 0.006], [0.0, -0.034, 0.004], [-0.01, -0.02]], 0.026, poly,
    { bevel: 0.0015, holes: [[[0.004, -0.019, 0.002], [0.032, -0.019, 0.002], [0.026, -0.029, 0.004], [0.006, -0.029, 0.003]]] });
  kp.side([[-0.008, -0.004], [-0.022, -0.1, 0.008], [-0.068, -0.096, 0.008], [-0.062, -0.01, 0.01], [-0.075, 0.0]], 0.03, poly, { bevel: 0.003 });
  kp.barrel([[0.0001, 0.112], [0.006, 0.112], [0.006, 0.116], [0.0001, 0.116]], W.dark(), 0, 0.02);
  g.userData = {
    at: new THREE.Vector3(0, 0, 0), muzzle: new THREE.Vector3(0.12, 0.0, -0.48),
    handR: { at: new THREE.Vector3(0.12, -0.07, -0.318), axis: new THREE.Vector3(0, -Math.cos(0.2), Math.sin(0.2)), r: 0.02, back: [0.029, -0.008], arc: [-0.1 * Math.PI, 1.15 * Math.PI], wrist: new THREE.Vector3(0.15, -0.11, -0.25) },
    handL: { at: new THREE.Vector3(-0.185, -0.44, -0.272), axis: new THREE.Vector3(0, -1, 0), r: 0.016, back: [-0.03, 0.006], arc: [-0.1 * Math.PI, 1.15 * Math.PI], wrist: new THREE.Vector3(-0.21, -0.5, -0.19) },
  };
  shade(g); return g;
}
// Cyber: a rugged tablet held at the chest, ICE on the screen.
export function heroTablet() {
  const g = new THREE.Group(), t = new THREE.Group(); t.position.set(0, -0.2, -0.3); t.rotation.x = -0.75; g.add(t); const k = K(t);
  k.rb(0.27, 0.19, 0.024, 0.02, hm('#1d1f22', 'plate', { wear: 0.5 }), 0, 0, 0);
  for (const [x, y] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) k.rb(0.05, 0.05, 0.03, 0.014, hm('#3f4433', 'plate', { wear: 0.4 }), x * 0.12, y * 0.08, 0);
  const scr = decal('ice', 512, 352, (c, w, h) => {
    c.fillStyle = '#061418'; c.fillRect(0, 0, w, h); c.strokeStyle = '#38d6f2'; c.lineWidth = 3;
    for (let i = 0; i < 7; i++) { c.globalAlpha = 0.3 + i * 0.1; c.beginPath(); c.arc(w * 0.32, h * 0.55, 30 + i * 22, Math.PI * (1 + i * 0.12), Math.PI * (1.6 + i * 0.12)); c.stroke(); }
    c.globalAlpha = 1; c.fillStyle = '#38d6f2'; c.font = '600 26px "JetBrains Mono", monospace'; c.fillText('ICE // DC-3 NODE 04', 24, 42); c.fillText('BREACH 68%', 300, 300);
    c.fillStyle = '#e0283a'; c.fillRect(300, 120, 160, 10); c.fillStyle = '#38d6f2'; c.fillRect(300, 120, 108, 10);
  });
  const sm = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.15), new THREE.MeshBasicMaterial({ map: scr, color: new THREE.Color('#ffffff').multiplyScalar(1.4) })); sm.position.set(0, 0, 0.0125); sm.userData.noHull = true; t.add(sm);
  g.updateMatrixWorld(true);
  const L = (x, y, z) => t.localToWorld(new THREE.Vector3(x, y, z));
  const ax = new THREE.Vector3(0, -1, 0).applyQuaternion(t.quaternion);
  g.userData = {
    at: new THREE.Vector3(0, 0, 0), muzzle: L(0, 0.1, 0),
    handR: { at: L(0.14, -0.02, -0.004), axis: ax.clone(), r: 0.014, back: [0.012, -0.024], arc: [0.35 * Math.PI, 1.0 * Math.PI], wrist: L(0.19, -0.08, -0.06) },
    handL: { at: L(-0.14, -0.02, -0.004), axis: ax.clone(), r: 0.014, back: [-0.012, -0.024], arc: [-0.35 * Math.PI, 1.0 * Math.PI], wrist: L(-0.19, -0.08, -0.06) },
  };
  shade(g); return g;
}


// ---------------------------------------------------------------------------------------------
// The Operator (hero): Multicam Black × FDE, high-cut helmet, quad NVG, plate carrier, gun in hand.
// ---------------------------------------------------------------------------------------------
export const COLOURWAYS = {
  nightwatch: { uniform: '#2c2d30', camo: 'mcblack', gear: '#5f533e', gearD: '#4b4231', acc: '#1c1d1f', helmet: '#5d5341', label: 'MULTICAM BLACK · FDE' },
  blackrg: { uniform: '#2a2b2d', camo: 'black', gear: '#3f4433', gearD: '#323628', acc: '#141516', helmet: '#262729', label: 'BLACK · RANGER GREEN' },
};
// Class kit [PROPOSED]: head = helmet | cap | capback | beanie; eyes = nods | up | goggles | glasses | none (helmet default:
// nods / up from `nods`); vest = plate | runner; kit = any of drone, medpack, tablet, binos, charges, shield, antenna.
// Every variant wears the combat shirt: black knit body, sleeves and trousers in the colourway's camo.
export function heroOperator({ gun = 'vx7', cw = 'nightwatch', nods = true, stance = 'ready', head: hat = 'helmet', eyes, vest = 'plate', kit = [], callsign = 'WICK' } = {}) {
  const C = COLOURWAYS[cw];
  eyes = eyes || (hat === 'helmet' ? (nods ? 'nods' : 'up') : 'none');
  const has = (x) => kit.includes(x);
  const shirt = hm('#1a1b1d', 'cloth', { paint: 0.1 });
  const root = new THREE.Group(), b = new THREE.Group(); root.add(b);
  const k = K(b);
  const fab = hm(C.uniform, 'cloth', { map: camo(C.camo), paint: 0.1 });
  const fabD = hm(C.uniform, 'cloth', { map: camo(C.camo), paint: 0.1, ramp: 'cloth' });
  const gear = hm(C.gear, 'cloth', { map: webbing(), paint: 0.18, scale: 6 });
  const gearP = hm(C.gear, 'plate', { wear: 0.35, wearCol: '#c9b48e', paint: 0.14 });
  const gearD = hm(C.gearD, 'cloth', { paint: 0.15 });
  const acc = hm(C.acc, 'cloth', { paint: 0.12 }), accP = hm(C.acc, 'plate', { wear: 0.3 });
  const glove = hm('#2a2826', 'cloth', { paint: 0.15, ink: INK.skin }), knuck = hm('#1b1a19', 'plate', { wear: 0.3 });
  const boot = hm('#2b2620', 'plate', { wear: 0.25, wearCol: '#8a7a60' }), sole = hm('#121212', 'plate', { wear: 0 });
  const mask = hm('#1a1b1d', 'cloth', { paint: 0.08, ink: INK.skin });
  const helm = hm(C.helmet, 'hard', { wear: 0.6, wearCol: '#c9b48e', spec: 0.6 });
  const nvg = hm('#1a1b1e', 'hard', { wear: 0.5 }), nvgH = hm('#2c2e33', 'hard');
  const red = hm('#c8283a', 'plate', { emissive: '#c8283a', ei: 0.25, wear: 0 });
  const V = (x, y, z) => new THREE.Vector3(x, y, z);

  // ---- stance: feet staggered, knees soft
  const st = stance === 'ready' ? { lf: V(-0.15, 0.085, -0.12), rf: V(0.17, 0.085, 0.14), pel: V(0, 0.95, 0.01), lean: 0.08 } : { lf: V(-0.13, 0.085, 0), rf: V(0.13, 0.085, 0), pel: V(0, 0.97, 0), lean: 0.02 };
  const hipL = V(-0.095, st.pel.y - 0.05, st.pel.z), hipR = V(0.095, st.pel.y - 0.05, st.pel.z);
  const legs = [[hipL, st.lf, -1], [hipR, st.rf, 1]];
  for (const [H, F, s] of legs) {
    const Kn = joint(H, F, 0.43, 0.43, V(s * 0.12, 0, -1));
    limb(b, H, Kn, [[0, 0.088], [0.3, 0.084], [0.7, 0.07], [1, 0.06]], fab);                 // thigh
    limb(b, Kn, F.clone().add(V(0, 0.07, 0)), [[0, 0.058], [0.25, 0.062], [0.6, 0.05], [1, 0.045]], fab); // calf
    // Knee pad (hard cap over a strap), cargo pocket with flap on the thigh.
    const kd = Kn.clone().sub(H).normalize(), kf = V(0, 0, -1).applyAxisAngle(Y, 0); void kd;
    const pad = k.rb(0.09, 0.11, 0.035, 0.016, accP, Kn.x, Kn.y - 0.01, Kn.z - 0.058); pad.lookAt(pad.position.clone().add(V(0, 0.15, -1))); void kf;
    k.torus(0.062, 0.006, acc, Kn.x, Kn.y - 0.005, Kn.z, Math.PI / 2, 0, 0);
    const mid = H.clone().lerp(Kn, 0.55), tdir = Kn.clone().sub(H).normalize();
    const pk = new THREE.Mesh(roundedBox(0.03, 0.14, 0.11, 0.012), fabD); span(pk, mid.clone().addScaledVector(tdir, -0.07), mid.clone().addScaledVector(tdir, 0.07)); pk.position.x += s * 0.085; b.add(pk);
    const fl = new THREE.Mesh(roundedBox(0.034, 0.04, 0.118, 0.01), fabD); fl.position.copy(mid).addScaledVector(tdir, -0.06); fl.position.x += s * 0.087; fl.quaternion.copy(pk.quaternion); b.add(fl);
    // Boot: shaft, upper with lathed toe, lugged sole; trouser blousing over the shaft.
    const bt = new THREE.Group(); bt.position.copy(F); bt.rotation.y = s * 0.12; b.add(bt); const kb = K(bt);
    kb.cyl(0.05, 0.054, 0.12, boot, 0, 0.02, 0.01);
    kb.rb(0.1, 0.08, 0.25, 0.035, boot, 0, -0.035, -0.045);
    kb.rb(0.108, 0.022, 0.27, 0.01, sole, 0, -0.082, -0.045);
    for (let i = 0; i < 6; i++) kb.rb(0.11, 0.008, 0.012, 0.003, sole, 0, -0.095, 0.07 - i * 0.04);
    for (let i = 0; i < 4; i++) kb.rb(0.05, 0.006, 0.012, 0.003, acc, 0, 0.006 + 0.012 * i - 0.03 + i * 0.004, -0.075 - i * 0.022 + 0.04, 0.6);
    kb.torus(0.056, 0.016, fabD, 0, 0.09, 0.01, Math.PI / 2, 0, 0);
  }
  // ---- pelvis, belt
  const tilt = st.lean;
  const torso = new THREE.Group(); torso.position.copy(st.pel); torso.rotation.x = -tilt; b.add(torso); const kt = K(torso);
  kt.rb(0.3, 0.17, 0.2, 0.07, fab, 0, -0.01, 0.0);
  { const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.172, 0.172, 0.05, 40, 1, true), hm(C.gear, 'cloth', { map: webbing(), paint: 0.18, scale: 6, side: THREE.DoubleSide })); belt.scale.set(1, 1, 0.68); belt.position.set(0, 0.06, 0); torso.add(belt); } // battle belt
  kt.rb(0.07, 0.04, 0.03, 0.008, accP, 0, 0.06, -0.115);                    // buckle
  kt.rb(0.06, 0.12, 0.05, 0.015, gearP, 0.17, -0.02, 0.02, 0, 0, 0.12);     // dump pouch R
  kt.rb(0.05, 0.09, 0.04, 0.012, acc, -0.17, 0.0, -0.02, 0, 0, -0.1);       // pistol mag pouch L
  kt.rb(0.055, 0.03, 0.045, 0.01, acc, -0.17, 0.05, -0.02, 0, 0, -0.1);
  kt.rb(0.11, 0.085, 0.05, 0.02, gearP, 0.0, 0.0, 0.125);                   // IFAK on the back
  // ---- chest (uniform under the carrier)
  const chest = new THREE.Group(); chest.position.set(0, 0.22, 0.0); chest.rotation.x = -0.03; torso.add(chest); const kc = K(chest);
  kc.rb(0.33, 0.4, 0.21, 0.09, shirt, 0, 0.08, 0.0);
  kc.ball(0.09, shirt, 0, 0.25, 0, 1.8, 0.55, 1.05);                            // trapezius
  // Runner rig: a light split-front chest rig on the upper torso only (spotter, Recce, Cyber).
  const runnerRig = () => {
    for (const sx of [-1, 1]) {
      const P = new THREE.Group(); P.position.set(sx * 0.066, 0.17, -0.112); P.rotation.set(0.1, sx * -0.18, 0); chest.add(P); const kp = K(P);
      kp.rb(0.106, 0.17, 0.026, 0.014, gear, 0, 0, 0);
      kp.rb(0.098, 0.03, 0.03, 0.01, gearD, 0, 0.075, -0.004);
      if (sx < 0) for (const dx of [-0.025, 0.025]) { kp.rb(0.044, 0.11, 0.036, 0.01, acc, dx, -0.02, -0.026); kp.rb(0.032, 0.03, 0.024, 0.006, hm('#24251f', 'hard', { wear: 0.4 }), dx, 0.05, -0.024); }
      else { kp.rb(0.068, 0.09, 0.024, 0.01, acc, -0.006, 0.006, -0.022); kp.rb(0.075, 0.042, 0.02, 0.008, acc, -0.004, -0.066, -0.02); kp.rb(0.022, 0.03, 0.008, 0.003, red, 0.024, 0.035, -0.036); }
      const strap = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.02, 10, 24, Math.PI), gear); strap.scale.set(1, 0.8, 1.3); strap.position.set(sx * 0.085, 0.205, 0.0); strap.rotation.set(0, Math.PI / 2, 0); chest.add(strap);
      kc.rb(0.07, 0.11, 0.02, 0.01, gear, sx * 0.155, 0.16, -0.07, 0, sx * -0.95, 0);          // side wing
      kc.rb(0.012, 0.022, 0.2, 0.004, gearD, sx * 0.17, 0.1, 0.03, 0, sx * 0.25, 0);           // elastic side strap
    }
    for (const y of [0.215, 0.145]) { kc.rb(0.09, 0.012, 0.006, 0.002, gearD, 0, y, -0.14); kc.rb(0.02, 0.018, 0.01, 0.003, accP, 0, y, -0.143); }
    kc.rb(0.2, 0.14, 0.024, 0.014, gear, 0, 0.2, 0.125, -0.12);                                 // upper back panel
    const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([V(0.07, 0.3, 0.12), V(0.1, 0.34, 0.0), V(0.1, 0.3, -0.1), V(0.105, 0.22, -0.145)]), 16, 0.0055, 6), acc); chest.add(tube);
    kc.cyl(0.009, 0.009, 0.026, gearP, 0.105, 0.205, -0.15, 0.2);
  };
  if (vest === 'runner') runnerRig();
  else {
  // Plate carrier: front and back plates bent to the chest, cummerbund, padded shoulder straps.
    const fp = new THREE.Mesh(bend(roundedBox(0.3, 0.33, 0.045, 0.02, 4).clone(), 0.45), gear); fp.position.set(0, 0.09, -0.135); fp.rotation.y = Math.PI; chest.add(fp);
    const bp = new THREE.Mesh(bend(roundedBox(0.3, 0.36, 0.045, 0.02, 4).clone(), 0.45), gear); bp.position.set(0, 0.1, 0.135); chest.add(bp);
    const cb = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.17, 32, 1, true), gear); cb.scale.set(0.97, 1, 0.72); cb.position.set(0, -0.0, 0); chest.add(cb);
    for (const s of [-1, 1]) {
      const strap = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.022, 10, 24, Math.PI), gear); strap.scale.set(1, 0.8, 1.3); strap.position.set(s * 0.1, 0.205, 0.0); strap.rotation.set(0, Math.PI / 2, 0); chest.add(strap);
      kc.rb(0.06, 0.04, 0.12, 0.016, gearD, s * 0.1, 0.32, 0.0);            // shoulder pad
    }
    // Front: triple mag shingle with bungee flaps and mag tips, admin pouch, badge, callsign tape.
    for (let i = 0; i < 3; i++) {
      const x = -0.09 + i * 0.09;
      kc.rb(0.078, 0.13, 0.05, 0.014, acc, x, -0.02, -0.18);
      kc.rb(0.07, 0.025, 0.04, 0.008, hm('#24251f', 'hard', { wear: 0.4 }), x, 0.055, -0.18);
      kc.rb(0.082, 0.035, 0.056, 0.012, acc, x, 0.035, -0.184);
      kc.rb(0.012, 0.03, 0.01, 0.004, gearD, x, 0.06, -0.212);
    }
    kc.rb(0.2, 0.09, 0.035, 0.016, gearP, 0, 0.14, -0.17);
    kc.rb(0.05, 0.034, 0.01, 0.004, red, 0.06, 0.15, -0.19);
    kc.rb(0.1, 0.026, 0.01, 0.004, acc, -0.045, 0.15, -0.19);
    const cs = decal('callsign-' + callsign, 256, 64, (c) => { c.fillStyle = '#fff'; c.font = '700 44px Rajdhani, Arial'; c.textBaseline = 'middle'; c.fillText(callsign, 70, 34); });
    const csm = decalMesh(cs, 0.1, 0.026, '#7f8f98'); csm.position.set(-0.045, 0.15, -0.1955); csm.rotation.y = Math.PI; chest.add(csm);
  }
  // Radio on the left side with its antenna up past the shoulder; hydration carrier on the back.
  kc.rb(0.05, 0.12, 0.06, 0.012, acc, -0.19, 0.03, 0.05);
  kc.cyl(0.004, 0.003, 0.42, acc, -0.2, 0.3, 0.1, -0.12, 0, 0.12, 8);
  kc.rb(0.22, 0.3, 0.07, 0.04, gear, 0, 0.06, 0.2);
  kc.rb(0.2, 0.04, 0.06, 0.02, gearD, 0, 0.23, 0.21);
  // ---- neck & head
  const head = new THREE.Group(); head.position.set(0, 0.39, -0.02); head.rotation.set(0.05, -0.12, 0); chest.add(head); const kh = K(head);
  kh.cyl(0.055, 0.06, 0.1, mask, 0, -0.05, 0.0);
  kh.torus(0.06, 0.012, mask, 0, -0.07, 0, Math.PI / 2, 0, 0);
  kh.ball(0.1, mask, 0, 0.07, 0.0, 0.92, 1.12, 1.03);
  kh.ball(0.03, mask, 0, 0.03, -0.09, 1, 0.9, 0.9);                                    // nose & mouth under the balaclava
  kh.ball(0.05, mask, 0, -0.0, -0.065, 1.1, 0.8, 0.9);                                 // jaw
  if (hat === 'helmet') {
    // High-cut helmet: lathed shell, cut high over the ears, ARC rails, shroud, velcro, bungee, cover seams.
    const shell = kh.lathe([[0.0001, 0.115], [0.04, 0.112], [0.075, 0.1], [0.1, 0.075], [0.115, 0.045], [0.121, 0.012], [0.122, -0.004], [0.116, -0.008]], helm, 0, 0.065, 0.005, 0, 0, 0, 36);
    shell.scale.set(0.96, 1, 1.08);
    for (const s of [-1, 1]) {
      kh.rb(0.014, 0.022, 0.13, 0.005, nvg, s * 0.113, 0.06, 0.005, 0, 0, s * 0.15);     // ARC rail
      kh.cyl(0.046, 0.046, 0.036, acc, s * 0.106, 0.015, 0.012, 0, 0, Math.PI / 2, 24); // ear cup
      kh.cyl(0.036, 0.036, 0.008, accP, s * 0.126, 0.015, 0.012, 0, 0, Math.PI / 2, 24);
      kh.torus(0.11, 0.006, acc, 0, 0.09, 0.005, 0.2, 0, s * 1.15, Math.PI * 0.18);    // headband
    }
    kh.cyl(0.004, 0.004, 0.11, acc, -0.08, -0.01, -0.06, 1.2, 0.6, 0, 8);                // boom mic
    kh.ball(0.008, acc, -0.03, -0.035, -0.105);
    kh.rb(0.08, 0.016, 0.07, 0.008, gearP, 0, 0.18, -0.015);                             // top velcro
    kh.rb(0.06, 0.045, 0.03, 0.008, nvg, 0, 0.125, -0.112, -0.35);                       // shroud
    kh.torus(0.115, 0.004, acc, 0, 0.11, 0.0, Math.PI / 2 - 0.15, 0, 0, Math.PI * 2);    // bungee
    // Battery pack & strobe on the back.
    kh.rb(0.09, 0.05, 0.04, 0.012, nvg, 0, 0.12, 0.12, -0.45);
    kh.ball(0.012, GLOW('#6e2424', 0.6), 0, 0.155, 0.126);
  } else {
    // Soft headgear over the balaclava, with the comms headset on top.
    if (hat === 'beanie') {
      kh.lathe([[0.0001, 0.108], [0.05, 0.1], [0.085, 0.075], [0.104, 0.04], [0.108, 0.0], [0.104, -0.01]], acc, 0, 0.07, 0.0, 0, 0, 0, 28).scale.set(0.97, 1, 1.06);
      kh.torus(0.104, 0.016, acc, 0, 0.07, 0.0, Math.PI / 2, 0, 0).scale.set(0.97, 1.06, 1);
    } else {
      const capG = new THREE.Group(); capG.position.set(0, 0.07, 0.0); if (hat === 'capback') capG.rotation.y = Math.PI; head.add(capG); const kk = K(capG);
      kk.lathe([[0.0001, 0.098], [0.05, 0.092], [0.083, 0.068], [0.102, 0.03], [0.106, 0.0]], hm(C.gear, 'cloth', { paint: 0.15 }), 0, 0.0, 0.0, 0, 0, 0, 28).scale.set(0.97, 1, 1.06);
      const brim = new THREE.Mesh(bend(roundedBox(0.15, 0.012, 0.08, 0.005, 3).clone(), 0.3), hm(C.gear, 'plate', { wear: 0.2 })); brim.position.set(0, 0.006, -0.135); capG.add(brim);
      kk.rb(0.05, 0.03, 0.008, 0.003, acc, 0, 0.05, -0.09, -0.35);                 // velcro patch
    }
    for (const s of [-1, 1]) {
      kh.cyl(0.046, 0.046, 0.036, acc, s * 0.106, 0.015, 0.012, 0, 0, Math.PI / 2, 24);
      kh.cyl(0.036, 0.036, 0.008, accP, s * 0.126, 0.015, 0.012, 0, 0, Math.PI / 2, 24);
    }
    kh.torus(0.115, 0.008, acc, 0, 0.02, 0.012, 0, Math.PI / 2, 0, Math.PI).rotation.set(0, Math.PI / 2, 0);  // headband over the top
    kh.cyl(0.004, 0.004, 0.11, acc, -0.08, -0.01, -0.06, 1.2, 0.6, 0, 8);
  }
  // Eyes: quad NVGs (down / up), goggles or glasses with the red lens tint.
  const lens = hm('#e0283a', 'hard', { emissive: '#e0283a', ei: 0.45, wear: 0, spec: 1 });
  if (eyes === 'goggles') {
    kh.torus(0.104, 0.008, acc, 0, 0.065, 0.0, Math.PI / 2, 0, 0).scale.set(0.97, 1.08, 1);
    const fr = new THREE.Mesh(bend(roundedBox(0.15, 0.05, 0.03, 0.014, 3).clone(), 0.11), hm('#1b1c1e', 'hard', { wear: 0.3 })); fr.position.set(0, 0.065, -0.1); fr.rotation.y = Math.PI; head.add(fr);
    for (const s of [-1, 1]) kh.rb(0.056, 0.034, 0.008, 0.01, lens, s * 0.034, 0.066, -0.116, 0, s * 0.18, 0);
  } else if (eyes === 'glasses') {
    for (const s of [-1, 1]) { kh.rb(0.046, 0.028, 0.006, 0.01, lens, s * 0.03, 0.058, -0.104, 0, s * 0.15, 0); kh.rb(0.006, 0.006, 0.09, 0.002, acc, s * 0.08, 0.06, -0.06, 0, 0, 0); }
    kh.rb(0.02, 0.006, 0.006, 0.002, acc, 0, 0.062, -0.106);
  }
  if (eyes === 'nods' || eyes === 'up') {
    nods = eyes === 'nods';
    // Quad NVG: bridge, mount arm, four lathed tubes (outer two canted), faint green lenses when down.
    const q = new THREE.Group(); head.add(q); const kq = K(q);
    if (nods) { q.position.set(0, 0.07, -0.135); } else { q.position.set(0, 0.17, -0.12); q.rotation.x = -1.2; }
    kq.rb(0.165, 0.036, 0.05, 0.012, nvg, 0, 0.012, 0.01);
    kq.rb(0.034, 0.064, 0.034, 0.01, nvgH, 0, 0.05, 0.03, -0.2);
    for (const [x, ry] of [[-0.026, 0.02], [0.026, -0.02], [-0.068, 0.3], [0.068, -0.3]]) {
      const t = new THREE.Group(); t.position.set(x, -0.004, -0.01); t.rotation.y = ry; q.add(t); const kk = K(t);
      kk.barrel([[0.0001, -0.01], [0.017, -0.01], [0.019, 0.0], [0.019, 0.05], [0.0205, 0.052], [0.0205, 0.066], [0.0175, 0.07], [0.0001, 0.07]], nvg);
      kk.barrel([[0.0001, 0.071], [0.014, 0.071], [0.0001, 0.0715]], GLOW('#40ffb0', nods ? 0.5 : 0.2));
    }
  }
  // ---- class kit
  const dark = hm('#1d1e21', 'hard', { wear: 0.45 }), steel = hm('#4a4d52', 'hard', { wear: 0.6, spec: 0.8 });
  if (has('drone')) {        // folded recon quad strapped to the pack
    const d = new THREE.Group(); d.position.set(0, 0.12, 0.25); d.rotation.x = Math.PI / 2 - 0.15; chest.add(d); const kd = K(d);
    kd.rb(0.1, 0.035, 0.15, 0.012, dark, 0, 0, 0);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { kd.rb(0.012, 0.01, 0.1, 0.003, dark, sx * 0.06, 0, sz * 0.05, 0, sx * sz * 0.5, 0); kd.cyl(0.032, 0.032, 0.008, hm('#2c2e33', 'hard'), sx * 0.085, 0.006, sz * 0.085, 0, 0, 0, 20); }
    kd.cyl(0.01, 0.01, 0.01, GLOW('#6e2424', 0.6), 0, 0.022, -0.05);
    kd.rb(0.05, 0.02, 0.06, 0.006, hm(C.gear, 'plate'), 0, 0.02, 0.03);   // FDE battery
  }
  if (has('medpack')) {      // large med pack over the hydration carrier, red cross patch
    kc.rb(0.27, 0.34, 0.13, 0.05, gear, 0, 0.05, 0.27);
    kc.rb(0.25, 0.05, 0.135, 0.02, gearD, 0, 0.2, 0.27);
    kc.rb(0.07, 0.022, 0.01, 0.004, red, 0, 0.06, 0.339); kc.rb(0.022, 0.07, 0.01, 0.004, red, 0, 0.06, 0.339);
    kc.rb(0.07, 0.11, 0.05, 0.014, gearP, 0.15, -0.0, 0.18, 0, 0.4, 0);
  }
  if (has('tablet')) {       // CYBER OPS tablet hinged off the chest, screen up
    const t = new THREE.Group(); t.position.set(0, vest === 'runner' ? 0.0 : -0.11, vest === 'runner' ? -0.17 : -0.23); t.rotation.x = -0.55; chest.add(t); const ktb = K(t);
    ktb.rb(0.2, 0.14, 0.014, 0.012, dark, 0, 0, 0);
    ktb.rb(0.18, 0.12, 0.004, 0.006, GLOW('#38d6f2', 0.55), 0, 0, -0.008);
    ktb.rb(0.06, 0.012, 0.004, 0.002, GLOW('#9fe07a', 0.8), -0.05, 0.04, -0.011);
  }
  if (has('binos')) {        // thermal binoculars hanging at the sternum
    for (const sx of [-1, 1]) kc.cyl(0.024, 0.026, 0.12, dark, sx * 0.028, 0.0, vest === 'runner' ? -0.165 : -0.225, 0.2, 0, 0, 20);
    kc.rb(0.04, 0.03, 0.03, 0.008, dark, 0, 0.03, vest === 'runner' ? -0.165 : -0.225);
  }
  if (has('charges')) {      // strip charges on the left of the carrier, hatchet across the pack
    for (let i = 0; i < 3; i++) kc.rb(0.022, 0.16, 0.026, 0.006, hm('#3b3a30', 'plate', { wear: 0.3 }), -0.205, 0.04, -0.05 + i * 0.035, 0, 0, 0.08);
    const ht = new THREE.Group(); ht.position.set(0.02, 0.1, 0.27); ht.rotation.z = 0.7; chest.add(ht); const kx = K(ht);
    kx.cyl(0.014, 0.016, 0.5, hm('#2a2622', 'plate', { wear: 0.4 }), 0, 0, 0, 0, 0, 0, 12);
    kx.rb(0.14, 0.05, 0.025, 0.006, steel, 0.05, 0.23, 0); kx.rb(0.03, 0.09, 0.022, 0.006, steel, -0.03, 0.22, 0);
  }
  if (has('antenna')) {      // whip antenna off the pack
    kc.cyl(0.005, 0.003, 0.75, acc, 0.08, 0.5, 0.24, -0.1, 0, -0.08, 8);
    kc.rb(0.06, 0.08, 0.05, 0.01, dark, 0.08, 0.12, 0.26);
  }
  if (has('shield')) {       // Bulwark ballistic shield on the left forearm
    const sh = new THREE.Group(); sh.position.set(-0.2, 1.05, -0.48); sh.rotation.y = 0.22; root.add(sh); const ks = K(sh);
    const face = new THREE.Mesh(bend(roundedBox(0.56, 0.92, 0.04, 0.04, 4).clone(), 0.8), hm('#1c1d1f', 'plate', { wear: 0.4, wearCol: '#8a8e93' })); face.rotation.y = Math.PI; sh.add(face);
    ks.rb(0.26, 0.075, 0.05, 0.02, hm('#0e1a20', 'hard', { spec: 1 }), 0, 0.3, -0.01);
    ks.rb(0.3, 0.012, 0.052, 0.004, red, 0, 0.255, -0.01);
    ks.rb(0.4, 0.05, 0.05, 0.012, gearP, 0, -0.22, -0.01);
  }
  // ---- arms: IK from the shoulders to the hands on the gun
  const G = gun === 'x4' ? heroX4() : gun === 'vx7' ? heroVX7() : gun;   // or an adaptGun() group
  const gunWrap = new THREE.Group(); gunWrap.add(G); root.add(gunWrap);
  const ready = stance === 'ready';
  if (gun === 'x4' || (gun.isObject3D && gun.userData.compact)) { gunWrap.position.set(0.05, 1.2, -0.32); gunWrap.rotation.set(ready ? -0.42 : -0.3, 0.12, 0.05); }
  else { gunWrap.position.set(0.07, 1.22, -0.2); gunWrap.rotation.set(-0.38, 0.14, 0.06); }
  root.updateMatrixWorld(true);
  const toRoot = (v) => root.worldToLocal(G.localToWorld(v.clone()));
  const U = G.userData;
  const gq = new THREE.Quaternion(); G.getWorldQuaternion(gq); const rq = new THREE.Quaternion(); root.getWorldQuaternion(rq); gq.premultiply(rq.invert());
  const shoulders = [];
  for (const s of [-1, 1]) { const sv = V(s * 0.18, 0.3, -0.01); chest.localToWorld(sv); root.worldToLocal(sv); shoulders.push(sv); }
  const hands = [{ S: shoulders[1], h: U.handR, side: 1, pole: V(0.9, -0.7, 0.4) }, { S: shoulders[0], h: U.handL, side: -1, pole: V(-0.9, -0.8, 0.1) }];
  for (const { S, h, side, pole } of hands) {
    const H = toRoot(h.at), wrist = toRoot(h.wrist);
    const E = joint(S, wrist, 0.3, 0.27, pole);
    k.ball(0.062, fab, S.x, S.y, S.z, 1.0, 0.95, 1.05);                                              // deltoid
    limb(b, S, E, [[0, 0.06], [0.35, 0.062], [0.75, 0.052], [1, 0.047]], fab);                     // upper arm
    limb(b, E, wrist, [[0, 0.05], [0.25, 0.053], [0.7, 0.042], [1, 0.036]], fab);                  // forearm
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.066, 0.066, 0.05, 24, 1, true), hm('#6e2424', 'cloth', { paint: 0.1, side: THREE.DoubleSide })); span(band, S.clone().lerp(E, 0.36), S.clone().lerp(E, 0.5)); b.add(band);
    const cuff = new THREE.Mesh(new THREE.TorusGeometry(0.039, 0.012, 10, 24), fabD); cuff.position.copy(E.clone().lerp(wrist, 0.84)); cuff.quaternion.setFromUnitVectors(V(0, 0, 1), wrist.clone().sub(E).normalize()); b.add(cuff);
    // Glove in the hand frame: +Y along the grip axis, X = the gun's right.
    const hand = new THREE.Group(); hand.position.copy(H); b.add(hand);
    hand.quaternion.copy(gq).multiply(new THREE.Quaternion().setFromUnitVectors(Y, h.axis.clone().normalize()));
    const hk = K(hand), r = h.r;
    hk.rb(0.028, 0.085, 0.07, 0.013, glove, h.back[0], 0, h.back[1]);                               // back of hand
    hk.rb(0.01, 0.07, 0.03, 0.004, knuck, h.back[0] + Math.sign(h.back[0]) * 0.016, 0, h.back[1] + 0.012);
    for (let f = 0; f < 4; f++) {
      const fr = new THREE.Mesh(new THREE.TorusGeometry(r + 0.01, 0.0105, 8, 18, h.arc[1]), glove);
      fr.position.set(0, 0.031 - f * 0.021, 0); fr.rotation.set(Math.PI / 2, 0, h.arc[0]); hand.add(fr);
    }
    const th = new THREE.Mesh(new THREE.CapsuleGeometry(0.0115, 0.045, 6, 12), glove); th.position.set(-Math.sign(h.back[0]) * (r * 0.3), 0.05, -r - 0.004); th.rotation.set(0.9, 0, 0); hand.add(th);
    // Wrist into the back of the glove.
    const bw = hand.localToWorld(V(h.back[0], -0.01, h.back[1])); root.updateMatrixWorld(true); root.worldToLocal(bw);
    limb(b, wrist, bw, [[0, 0.036], [1, 0.032]], glove);
  }
  root.userData.gun = G; root.userData.head = head;
  shade(root);
  return root;
}


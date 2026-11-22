// Graphics look (names in rules.js LOOKS), chosen by the host (it rides in RULES.look, so both players see the same):
//   'inked' (default): comic-book ink lines from the depth buffer (in the grade pass, game.js)
//                      and three-tone cel shading on plain-lit props, the viewmodel and figures.
//   'og':              the original look: soft Lambert shading and the old silhouette-only outline.
//   'hero':            the NightWatch bible's hero tier: Inked, plus a ramp per material (cloth soft, plates three
//                      tones, dark hard parts two), a moon rim and a small specular hit, and inverted-hull outlines on
//                      characters, guns and props. Outlines are merged per parent group and ink colour, so a figure
//                      costs a handful of extra draw calls, not one per part.
//
// Cel shading swaps plain Lambert / Standard / Phong materials for MeshToonMaterial with a
// three-tone ramp. Materials with their own shader patch (haze, wind, camo) are left alone, as are
// transparent and alpha-tested ones. The toon copy shares the original's colors and reads its
// scalar settings live, so code that animates the original material keeps working.
import * as THREE from 'three';

// Three tones: soft enough for gear to read, flat enough to look illustrated.
const ramp = new THREE.DataTexture(new Uint8Array([135, 190, 235, 255]), 4, 1, THREE.RedFormat);
ramp.minFilter = THREE.NearestFilter;
ramp.magFilter = THREE.NearestFilter;
ramp.generateMipmaps = false;
ramp.needsUpdate = true;

const PLAIN = THREE.Material.prototype.onBeforeCompile;
const LIVE = ['opacity', 'visible', 'emissiveIntensity', 'map', 'emissiveMap', 'depthWrite', 'depthTest', 'colorWrite'];
const toonOf = new WeakMap(); // original material → toon copy (or the original itself when it can't be converted)

function toToon(mat) {
  if (!mat) return mat;
  if (toonOf.has(mat)) return toonOf.get(mat);
  let out = mat;
  if ((mat.isMeshLambertMaterial || mat.isMeshStandardMaterial || mat.isMeshPhongMaterial) &&
      mat.onBeforeCompile === PLAIN && !mat.transparent && !(mat.alphaTest > 0) && !mat.userData.noToon) {
    out = new THREE.MeshToonMaterial({
      gradientMap: ramp, vertexColors: mat.vertexColors, side: mat.side, flatShading: mat.flatShading, fog: mat.fog,
    });
    out.color = mat.color;
    out.emissive = mat.emissive;
    for (const k of LIVE) Object.defineProperty(out, k, { get: () => mat[k], set: (v) => { mat[k] = v; }, configurable: true });
    out.userData.ogMaterial = mat;
  }
  toonOf.set(mat, out);
  return out;
}

// ---- hero tier -------------------------------------------------------------------------------
function rampOf(vals) {
  const t = new THREE.DataTexture(new Uint8Array(vals), vals.length, 1, THREE.RedFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter; t.generateMipmaps = false; t.needsUpdate = true; return t;
}
const HERO_RAMPS = { cloth: rampOf([118, 150, 185, 215, 240, 255]), plate: ramp, hard: rampOf([105, 225, 255]) };
const HERO_INK = { cloth: '#05070d', plate: '#040508', hard: '#030304' };
const HERO_K = { cloth: { rim: 0.35, spec: 0 }, plate: { rim: 0.5, spec: 0.35 }, hard: { rim: 0.6, spec: 0.9 } };
const RIM_DIR = new THREE.Vector3(-0.45, 0.5, 0.75).normalize(), RIM_COL = new THREE.Color('#8fc4ff');
const heroOf = new WeakMap();
function toHero(mat) {
  if (!mat) return mat;
  if (heroOf.has(mat)) return heroOf.get(mat);
  let out = mat;
  if ((mat.isMeshLambertMaterial || mat.isMeshStandardMaterial || mat.isMeshPhongMaterial) &&
      mat.onBeforeCompile === PLAIN && !mat.transparent && !(mat.alphaTest > 0) && !mat.userData.noToon) {
    const l = mat.color.getHSL({ h: 0, s: 0, l: 0 }).l;
    const kind = mat.map ? 'cloth' : l < 0.09 ? 'hard' : 'plate', K = HERO_K[kind];
    out = new THREE.MeshToonMaterial({ gradientMap: HERO_RAMPS[kind], vertexColors: mat.vertexColors, side: mat.side, flatShading: mat.flatShading, fog: mat.fog });
    out.color = mat.color; out.emissive = mat.emissive;
    for (const k of LIVE) Object.defineProperty(out, k, { get: () => mat[k], set: (v) => { mat[k] = v; }, configurable: true });
    const U = { uRim: { value: K.rim }, uSpec: { value: K.spec }, uRimDir: { value: RIM_DIR }, uRimCol: { value: RIM_COL } };
    out.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, U);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uRim, uSpec; uniform vec3 uRimDir, uRimCol;')
        .replace('#include <opaque_fragment>', `
          vec3 vd = normalize(vViewPosition);
          float fres = 1.0 - clamp(dot(normal, vd), 0.0, 1.0);
          vec3 rd = normalize((viewMatrix * vec4(uRimDir, 0.0)).xyz);
          outgoingLight += uRimCol * smoothstep(0.55, 0.68, fres) * clamp(dot(normal, rd) * 0.8 + 0.35, 0.0, 1.0) * uRim * 1.65 * diffuseColor.rgb;
          #if NUM_DIR_LIGHTS > 0
            vec3 hv = normalize(directionalLights[0].direction + vd);
            outgoingLight += directionalLights[0].color * smoothstep(0.45, 0.55, pow(clamp(dot(normal, hv), 0.0, 1.0), 60.0)) * uSpec * 0.22;
          #endif
          #include <opaque_fragment>`);
    };
    out.customProgramCacheKey = () => 'hero-' + kind;
    out.userData.ogMaterial = mat;
    out.userData.ink = HERO_INK[kind]; out.userData.hullW = kind === 'cloth' ? 2.2 : 1.8;
  }
  heroOf.set(mat, out);
  return out;
}

// Inverted-hull outlines, constant pixel width. Share OUTLINE_RES and set it to the canvas CSS size on resize.
export const OUTLINE_RES = { value: new THREE.Vector2(innerWidth, innerHeight) };
const hullMats = new Map();
function hullMat(color, w) {
  const k = color + w; if (hullMats.has(k)) return hullMats.get(k);
  const m = new THREE.ShaderMaterial({
    side: THREE.BackSide, fog: false,
    uniforms: { uColor: { value: new THREE.Color(color) }, uW: { value: w }, uRes: OUTLINE_RES },
    vertexShader: `attribute vec3 hullNormal; uniform float uW; uniform vec2 uRes;
      void main(){
        vec4 mv = modelViewMatrix * vec4(position, 1.0), clip = projectionMatrix * mv;
        vec2 d = (projectionMatrix * vec4(normalize(normalMatrix * hullNormal), 0.0)).xy;
        float l = length(d); d = l > 1e-5 ? d / l : vec2(0.0);
        // Full width up close, gone by 70 m: far figures fall back to the depth ink and the haze.
        clip.xy += d * uW * smoothstep(70.0, 25.0, -mv.z) * 2.0 / uRes * clip.w;
        clip.z += 0.00002 * clip.w;
        gl_Position = clip;
      }`,
    fragmentShader: 'uniform vec3 uColor; void main(){ gl_FragColor = vec4(uColor, 1.0); }',
  });
  hullMats.set(k, m); return m;
}
// Smooth (position-welded) normals so hard edges don't crack the hull. Cached on the geometry.
function hullNormals(geo) {
  if (geo.userData.hullN) return geo.userData.hullN;
  const p = geo.attributes.position, idx = geo.index, acc = new Map();
  const key = (i) => `${Math.round(p.getX(i) * 1e4)},${Math.round(p.getY(i) * 1e4)},${Math.round(p.getZ(i) * 1e4)}`;
  const keys = new Array(p.count); for (let i = 0; i < p.count; i++) keys[i] = key(i);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
  const tri = idx ? idx.count / 3 : p.count / 3;
  for (let t = 0; t < tri; t++) {
    const i0 = idx ? idx.getX(t * 3) : t * 3, i1 = idx ? idx.getX(t * 3 + 1) : t * 3 + 1, i2 = idx ? idx.getX(t * 3 + 2) : t * 3 + 2;
    a.fromBufferAttribute(p, i0); b.fromBufferAttribute(p, i1); c.fromBufferAttribute(p, i2);
    n.subVectors(c, b).cross(a.sub(b));
    for (const i of [i0, i1, i2]) { const k = keys[i]; (acc.get(k) || acc.set(k, new THREE.Vector3()).get(k)).add(n); }
  }
  const out = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) { const v = acc.get(keys[i]).normalize(); out[i * 3] = v.x; out[i * 3 + 1] = v.y; out[i * 3 + 2] = v.z; }
  return (geo.userData.hullN = out);
}
const MAX_R = 3.2;   // outline things up to about a container; terrain, buildings and walls stay ink-pass only
function outlinable(o) {
  if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || o.userData.isHull || o.userData.noOutline || !o.visible || o.renderOrder) return false;
  // The first-person viewmodel rides the camera and draws on top of the world: no hulls there.
  for (let p = o.parent; p; p = p.parent) if (p.isCamera) return false;
  const m = o.material; if (!m || Array.isArray(m) || !m.userData.ink || m.side !== THREE.FrontSide || m.alphaTest > 0) return false;
  const g = o.geometry; if (!g || !g.attributes.position || g.attributes.position.count > 40000) return false;
  if (!g.boundingSphere) g.computeBoundingSphere();
  const s = o.scale, r = g.boundingSphere.radius * Math.max(s.x, s.y, s.z);
  return r < MAX_R && r > 0.015;   // tiny parts (screws, LEDs) add clutter, not shape
}
// One merged hull per (parent, ink, width), in the parent's space. Rebuilt only when its children change.
const _m = new THREE.Matrix4(), _n = new THREE.Matrix3(), _v = new THREE.Vector3();
function hullParent(parent) {
  const kids = parent.children.filter(outlinable);
  const sig = kids.map((o) => o.id + (o.material.userData.ink)).join(',');
  if (parent.userData.hullSig === sig) return;
  parent.userData.hullSig = sig;
  for (const h of parent.userData.hulls || []) { parent.remove(h); h.geometry.dispose(); }
  parent.userData.hulls = [];
  if (!kids.length) return;
  const groups = new Map();
  for (const o of kids) { const k = o.material.userData.ink + '|' + o.material.userData.hullW; (groups.get(k) || groups.set(k, []).get(k)).push(o); }
  for (const [k, list] of groups) {
    let count = 0; for (const o of list) count += o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count;
    const pos = new Float32Array(count * 3), nor = new Float32Array(count * 3); let j = 0;
    for (const o of list) {
      o.updateMatrix(); _m.copy(o.matrix); _n.getNormalMatrix(_m);
      const g = o.geometry, p = g.attributes.position, hn = hullNormals(g), idx = g.index, N = idx ? idx.count : p.count;
      for (let t = 0; t < N; t++) {
        const i = idx ? idx.getX(t) : t;
        _v.fromBufferAttribute(p, i).applyMatrix4(_m); pos[j * 3] = _v.x; pos[j * 3 + 1] = _v.y; pos[j * 3 + 2] = _v.z;
        _v.set(hn[i * 3], hn[i * 3 + 1], hn[i * 3 + 2]).applyMatrix3(_n).normalize(); nor[j * 3] = _v.x; nor[j * 3 + 1] = _v.y; nor[j * 3 + 2] = _v.z;
        j++;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('hullNormal', new THREE.BufferAttribute(nor, 3));
    geo.computeBoundingSphere();
    const [ink, w] = k.split('|');
    const h = new THREE.Mesh(geo, hullMat(ink, +w)); h.userData.isHull = true; h.castShadow = h.receiveShadow = false;
    h.matrixAutoUpdate = false; parent.add(h); parent.userData.hulls.push(h);
  }
}
function clearHulls(root) {
  const ps = []; root.traverse((o) => { if (o.userData.hulls) ps.push(o); });
  for (const p of ps) { for (const h of p.userData.hulls) { p.remove(h); h.geometry.dispose(); } delete p.userData.hulls; delete p.userData.hullSig; }
}

const swap = (m, toon) => (toon ? toToon(m) : (m && m.userData.ogMaterial) || m);
const back = (m) => (m && m.userData.ogMaterial) || m;

// Bring every mesh under `root` in line with the look. Cheap to repeat: conversions are cached,
// so it can run now and then to catch meshes added since (chickens, supply drops, avatars).
// opts.outlines: false keeps Hero's shading but skips the hull outlines (the Low quality preset).
export function applyLook(root, look, opts = {}) {
  const toon = look !== 'og', hero = look === 'hero', hulls = hero && opts.outlines !== false;
  const parents = new Set();
  root.traverse((o) => {
    if (!o.isMesh || o.isSkinnedMesh || !o.material || o.userData.isHull) return;
    const m = o.material;
    const conv = (x) => {
      if (!hero) return swap(back(x), toon);
      const h = toHero(back(x));
      // Shader-patched lit materials (camo, haze) keep their shader but still take an outline.
      if (h && !h.userData.ink && !h.transparent && !(h.alphaTest > 0) && h.side === THREE.FrontSide && (h.isMeshLambertMaterial || h.isMeshStandardMaterial || h.isMeshPhongMaterial || h.isMeshToonMaterial)) { h.userData.ink = '#05070d'; h.userData.hullW = 2.2; }
      return h;
    };
    const next = Array.isArray(m) ? m.map(conv) : conv(m);
    if (Array.isArray(m) ? next.some((x, i) => x !== m[i]) : next !== m) o.material = next;
    if (hulls && o.parent) parents.add(o.parent);
  });
  if (hulls) for (const p of parents) hullParent(p);
  else clearHulls(root);
}

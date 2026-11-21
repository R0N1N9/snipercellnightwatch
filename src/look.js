// Graphics look (names in rules.js LOOKS), chosen by the host (it rides in RULES.look, so both players see the same):
//   'inked' (default): comic-book ink lines from the depth buffer (in the grade pass, game.js)
//                      and three-tone cel shading on plain-lit props, the viewmodel and figures.
//   'og':              the original look: soft Lambert shading and the old silhouette-only outline.
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

const swap = (m, toon) => (toon ? toToon(m) : (m && m.userData.ogMaterial) || m);

// Bring every mesh under `root` in line with the look. Cheap to repeat: conversions are cached,
// so it can run now and then to catch meshes added since (chickens, supply drops, avatars).
export function applyLook(root, look) {
  const toon = look !== 'og';
  root.traverse((o) => {
    if (!o.isMesh || o.isSkinnedMesh || !o.material) return;
    const m = o.material;
    const next = Array.isArray(m) ? m.map((x) => swap(x, toon)) : swap(m, toon);
    if (Array.isArray(m) ? next.some((x, i) => x !== m[i]) : next !== m) o.material = next;
  });
}

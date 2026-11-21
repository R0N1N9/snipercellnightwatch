// TIDY-UP TIME — the lens. Two jobs:
//  1. Work out the camera the toy world's last frame was taken with (its lens is an
//     orthographic three-quarter view fitted to the screen, pushed in on the victim for the
//     kill), so that frame can be laid back down on the floor it was a picture of.
//  2. The post pass: the room is drawn in linear light into a target, then put together with a
//     soft quarter-size copy (the world's own tilt-shift and glow), graded, grained, exposed —
//     and, at the very end, handed over to the next world.
import { clamp, lerp, smoothstep } from '../../kit.js';

// The toy world's room (mirrors dimensions/toybox/world.js + view.js; read, never imported,
// so this film keeps working whatever that world does to its own internals).
export const RUG_A = 21, RUG_B = 12.5, HEAD = 2.7;

// The world's fitted lens for a w x h screen (view.js fit(), without touch insets).
function fitted(w, h) {
  const phone = h < 480, top = phone ? 30 : 56, bottom = phone ? 6 : 14, aw = w - (phone ? 8 : 24), ah = h - top - bottom;
  let s = Math.max(1, aw / (2 * RUG_A * 1.02));
  const sin = clamp((ah / s - HEAD * 0.7) / (2 * RUG_B), 0.6, 0.8), phi = Math.asin(sin), cos = Math.cos(phi);
  s = Math.max(1, Math.min(s, ah / (2 * RUG_B * sin + HEAD * cos)));
  const cy = top + HEAD * cos * s + RUG_B * sin * s + (ah - (2 * RUG_B * sin + HEAD * cos) * s) * 0.5;
  return { s, phi, cx: w / 2, cy };
}

// A lens {tx, tz, cx, cy, s, phi, psi} → screen position of a world point.
function toScreen(L, x, y, z, out) {
  const sy = Math.sin(L.psi), cyw = Math.cos(L.psi), sp = Math.sin(L.phi), cp = Math.cos(L.phi);
  const dx = x - L.tx, dz = z - L.tz;
  out.x = L.cx + L.s * (dx * cyw - dz * sy);
  out.y = L.cy - L.s * (-sp * (dx * sy + dz * cyw) + cp * y);
  return out;
}

/**
 * Guess the lens of the old world's last frame. `kill`: the frame is the toy world's kill
 * close-up (the victim, at `focus`, sits near the middle); otherwise it is the opening crane
 * (the transition lab photographs a world half a second into its intro), solved so that the
 * far soldier lands on `focus`. Returns { L, victim:{x,z}, kill }.
 */
export function guessLens(w, h, focus, isToy) {
  const F = fitted(w, h);
  const P = { x: 0, y: 0 };
  const killish = Math.abs(focus.x - w / 2) < w * 0.24 && Math.abs(focus.y - h * 0.56) < h * 0.26;
  if (isToy && killish) {
    // The kill: push in 1.8x on where the victim stood, drop 0.11 rad, swing 0.29 rad away
    // from their side; the victim's spot is solved from where it shows on screen.
    let side = focus.x < w / 2 ? 1 : -1, vx = 0, vz = 0;
    for (let it = 0; it < 3; it++) {
      const L = { tx: 0, tz: 0, cx: w / 2, cy: h * 0.56, s: F.s * 1.79, phi: F.phi - 0.11, psi: side * 0.29 };
      const sy = Math.sin(L.psi), cyw = Math.cos(L.psi), sp = Math.sin(L.phi), cp = Math.cos(L.phi);
      const a = (focus.x - L.cx) / L.s, b = ((L.cy - focus.y) / L.s - cp * 0.8) / -sp;
      const dx = a * cyw + b * sy, dz = -a * sy + b * cyw;
      vx = dx * 5; vz = dz * 5; // (the lens sits at 0.8 of the victim's position: what is left is a fifth)
      const ns = vx < 0 ? 1 : -1;
      if (ns === side) break;
      side = ns;
    }
    vx = clamp(vx, -RUG_A + 1, RUG_A - 1); vz = clamp(vz, -RUG_B + 1, RUG_B - 1);
    return { L: { tx: vx * 0.8, tz: vz * 0.8, cx: w / 2, cy: h * 0.56, s: F.s * 1.79, phi: F.phi - 0.11, psi: side * 0.29 }, victim: { x: vx, z: vz }, kill: true };
  }
  if (isToy) {
    // The opening crane: psi from -0.5 towards 0, s from 0.8x, phi 0.09 lower. Find how far
    // along it is from where the far soldier (spawn B) shows.
    let best = null;
    for (let i = 0; i <= 40; i++) {
      const e = i / 40, L = { tx: 0, tz: 0, cx: F.cx, cy: F.cy, s: F.s * lerp(0.8, 1, e), phi: F.phi - (1 - e) * 0.09, psi: lerp(-0.5, 0, e) };
      toScreen(L, 17, 0.8, -1.3, P);
      const d = Math.hypot(P.x - focus.x, P.y - focus.y);
      if (!best || d < best.d) best = { d, L };
    }
    const L = best && best.d < w * 0.08 ? best.L : { tx: 0, tz: 0, cx: F.cx, cy: F.cy, s: F.s, phi: F.phi, psi: 0 };
    return { L, victim: { x: 17, z: -1.3 }, kill: false };
  }
  // Another world: its picture is simply laid on the rug as if it were a play mat.
  return { L: { tx: 0, tz: 0, cx: F.cx, cy: F.cy, s: F.s * 1.05, phi: F.phi, psi: 0 }, victim: { x: clamp(((focus.x - w / 2) / w) * 30, -15, 15), z: clamp(((focus.y - h / 2) / h) * 16, -8, 8) }, kill: false };
}

// The lens as a three.js orthographic camera (view.js builds the very same one).
export function lensCamera(THREE, L, w, h) {
  const cam = new THREE.OrthographicCamera(-L.cx / L.s, (w - L.cx) / L.s, L.cy / L.s, -(h - L.cy) / L.s, 1, 400);
  const sy = Math.sin(L.psi), cyw = Math.cos(L.psi), sp = Math.sin(L.phi), cp = Math.cos(L.phi);
  cam.position.set(L.tx + sy * cp * 110, sp * 110, L.tz + cyw * cp * 110);
  cam.lookAt(L.tx, 0, L.tz);
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld(true);
  return cam;
}

// Where a screen point lands on the floor (height y) under a lens.
export function lensFloor(L, sx, sy0, y, out) {
  const sy = Math.sin(L.psi), cyw = Math.cos(L.psi), sp = Math.sin(L.phi), cp = Math.cos(L.phi);
  const a = (sx - L.cx) / L.s, b = -(sy0 - L.cy) / L.s, q = (cp * y - b) / sp;
  out.x = L.tx + a * cyw + q * sy;
  out.z = L.tz - a * sy + q * cyw;
  return out;
}

// ---------------------------------------------------------------------------------------------
// Post
// ---------------------------------------------------------------------------------------------
const VERT = 'varying vec2 vUv; void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }';
const DOWN = `precision highp float; varying vec2 vUv; uniform sampler2D tSrc; uniform vec2 uTexel;
void main() { gl_FragColor = min((texture2D(tSrc, vUv + uTexel * vec2(-1.0, -1.0)) + texture2D(tSrc, vUv + uTexel * vec2(1.0, -1.0)) + texture2D(tSrc, vUv + uTexel * vec2(-1.0, 1.0)) + texture2D(tSrc, vUv + uTexel * vec2(1.0, 1.0))) * 0.25, vec4(30.0)); }`;
const BLUR = `precision highp float; varying vec2 vUv; uniform sampler2D tSrc; uniform vec2 uTexel, uDir;
void main() { vec2 o1 = uDir * uTexel * 1.3846, o2 = uDir * uTexel * 3.2308;
  gl_FragColor = texture2D(tSrc, vUv) * 0.2270 + (texture2D(tSrc, vUv + o1) + texture2D(tSrc, vUv - o1)) * 0.3162 + (texture2D(tSrc, vUv + o2) + texture2D(tSrc, vUv - o2)) * 0.0703; }`;
// The from-image's grade when the big light comes on: the moody lamp light flattened out.
// Works in display values (the image is a finished picture).
export const FLATTEN_GLSL = `
vec3 flatten(vec3 c, float k, vec2 uv) {
  // the world's vignette, mostly undone: the corners are lit now too
  vec2 q = uv - 0.5;
  float vig = 1.0 - smoothstep(0.35, 1.05, length(q * vec2(1.0, 1.25)));
  vec3 o = c / mix(1.0, mix(0.3, 1.0, vig), 0.72 * k);
  float l = dot(o, vec3(0.2126, 0.7152, 0.0722));
  o = pow(max(o, 0.0), vec3(mix(1.0, 0.68, k)));                 // lift the dark
  vec3 g = vec3(dot(o, vec3(0.2126, 0.7152, 0.0722)));
  o = mix(o, g, 0.14 * k);                                        // less amber
  o *= mix(vec3(1.0), vec3(1.1, 1.09, 1.08), k);                  // a brighter, whiter light
  o = mix(o, o * 0.92 + 0.05, 0.3 * k);                           // flatter
  return clamp(o, 0.0, 1.0);
}`;
const FINAL = `precision highp float; varying vec2 vUv;
uniform sampler2D tSrc, tSoft, tTo; uniform vec2 uTexel;
uniform float uFocusY, uFocusH, uTilt, uGlow, uGrade, uVig, uGrain, uExpo, uFlash, uDark, uTo, uAlpha, uTime, uToAsp, uScrAsp, uWarp;
uniform vec3 uFlashCol;
vec3 tone(vec3 x) { vec3 k = max(x - 0.8, 0.0); return min(x, 0.8) + k / (1.0 + k * 1.6); } // (exact below 0.8: the old frame survives the trip)
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
vec3 toSrgb(vec3 c) { return mix(c * 12.92, 1.055 * pow(max(c, 0.0), vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
void main() {
  vec2 uv = vUv, c = uv - 0.5;
  // a lens kick: the picture bulges as we go through glass
  uv = 0.5 + c * (1.0 - uWarp * 0.35 * (1.0 - dot(c, c) * 2.0));
  float f = clamp((abs(uv.y - uFocusY) - uFocusH) / max(0.5 - uFocusH, 0.05), 0.0, 1.0);
  f = pow(f, 1.5) * uTilt;
  vec3 sharp = texture2D(tSrc, uv).rgb, soft = texture2D(tSoft, uv).rgb;
  vec3 col = mix(sharp, soft, clamp(f * 1.6, 0.0, 1.0));
  col += max(soft - 0.9, 0.0) * uGlow;
  col *= uExpo;
  col = tone(col);
  // grade: cool lifted shadows, warm highlights, a little extra colour (as toys have)
  float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
  vec3 gr = mix(vec3(l), col, 1.08) * mix(vec3(0.93, 0.98, 1.08), vec3(1.05, 1.0, 0.93), smoothstep(0.05, 0.6, l));
  col = mix(col, gr, uGrade);
  col = toSrgb(col);
  float vig = 1.0 - smoothstep(0.4, 1.1, length(c * vec2(1.0, 1.25)));
  col *= mix(1.0, mix(0.55, 1.0, vig), uVig);
  col += (hash(gl_FragCoord.xy + fract(uTime * 7.31) * 113.0) - 0.5) * uGrain * (1.0 - 0.6 * l);
  col = mix(col, uFlashCol, uFlash);
  col *= 1.0 - uDark;
  // the next world, full-screen and untouched, takes over at the very end
  vec2 s = uScrAsp > uToAsp ? vec2(1.0, uToAsp / uScrAsp) : vec2(uScrAsp / uToAsp, 1.0);
  vec3 to = texture2D(tTo, (vUv - 0.5) * s + 0.5).rgb;
  col = mix(col, to, uTo);
  gl_FragColor = vec4(col * uAlpha, uAlpha);
}`;

export function makeLens(THREE, renderer, q) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quad = new THREE.Mesh(geo, null);
  quad.frustumCulled = false;
  const mat = (fragmentShader, uniforms = {}) => new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader, depthTest: false, depthWrite: false, uniforms: { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, ...uniforms } });
  const U = {
    tSoft: { value: null }, tTo: { value: null }, uFocusY: { value: 0.5 }, uFocusH: { value: 0.3 }, uTilt: { value: 0 }, uGlow: { value: 0 }, uGrade: { value: 0 }, uVig: { value: 0 },
    uGrain: { value: 0 }, uExpo: { value: 1 }, uFlash: { value: 0 }, uDark: { value: 0 }, uTo: { value: 0 }, uAlpha: { value: 1 }, uTime: { value: 0 }, uToAsp: { value: 1 }, uScrAsp: { value: 1 },
    uWarp: { value: 0 }, uFlashCol: { value: new THREE.Vector3(1, 0.97, 0.92) },
  };
  const mDown = mat(DOWN), mBlur = mat(BLUR, { uDir: { value: new THREE.Vector2() } }), mFinal = mat(FINAL, U);
  mFinal.transparent = true;
  mFinal.blending = THREE.NoBlending;
  const rt = (o) => new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, depthBuffer: false, ...o });
  const scene = rt({ depthBuffer: true, samples: q.msaa ? 4 : 0 }), ha = rt(), qa = rt(), qb = rt();
  const size = new THREE.Vector2();
  let sw = 0, sh = 0;

  function pass(material, src, dst) {
    material.uniforms.tSrc.value = src.texture;
    material.uniforms.uTexel.value.set(1 / src.width, 1 / src.height);
    quad.material = material;
    renderer.setRenderTarget(dst);
    renderer.render(quad, cam);
  }
  return {
    u: U,
    resize() {
      renderer.getDrawingBufferSize(size);
      const scale = Math.min(q.scale, Math.sqrt(q.cap / Math.max(1, size.x * size.y)));
      const w = Math.max(8, Math.round(size.x * scale)), h = Math.max(8, Math.round(size.y * scale));
      if (w === sw && h === sh) return;
      sw = w; sh = h;
      scene.setSize(w, h);
      ha.setSize(Math.max(4, w >> 1), Math.max(4, h >> 1));
      qa.setSize(Math.max(4, w >> 2), Math.max(4, h >> 2)); qb.setSize(Math.max(4, w >> 2), Math.max(4, h >> 2));
    },
    // Draw `world` through `camera`, then everything after.
    render(world, camera, t) {
      this.resize();
      renderer.setRenderTarget(scene);
      renderer.clear();
      renderer.render(world, camera);
      pass(mDown, scene, ha);
      pass(mDown, ha, qa);
      mBlur.uniforms.uDir.value.set(1, 0); pass(mBlur, qa, qb);
      mBlur.uniforms.uDir.value.set(0, 1); pass(mBlur, qb, qa);
      mBlur.uniforms.uDir.value.set(1.8, 0); pass(mBlur, qa, qb);
      mBlur.uniforms.uDir.value.set(0, 1.8); pass(mBlur, qb, qa);
      U.tSoft.value = qa.texture;
      U.uTime.value = t;
      if (!U.tTo.value) U.tTo.value = qa.texture; // (a sampler must point somewhere)
      pass(mFinal, scene, null);
    },
    dispose() {
      renderer.setRenderTarget(null);
      for (const t of [scene, ha, qa, qb]) t.dispose();
      for (const m of [mDown, mBlur, mFinal]) m.dispose();
      geo.dispose();
    },
  };
}

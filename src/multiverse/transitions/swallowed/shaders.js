// SWALLOWED — the GLSL. Everything we add to the deep's last frame is lit and graded the way
// the deep itself is (post.js: linear light, x1.55 exposure, ACES, its teal-and-warm grade,
// gamma), so the kraken's skin sits in that frame instead of on top of it. Skin colours,
// sucker rings, bands and photophores are the world's own (kraken.js), drawn closer.

// Shared by every pass: the deep's grade and lens, and a little hash.
export const COMMON = `
precision highp float;
#define TAU 6.2831853
uniform vec2 uRes;      // drawing-buffer pixels
uniform float uAsp, uT, uK;
uniform float uMaskK, uVigK;
const vec3 SUN = vec3(0.81, 1.15, 0.89);         // the world's sun, ten metres down
const vec3 PHOTO = vec3(0.16, 0.42, 1.25);       // the kraken's cold blue lights
vec3 aces(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
vec3 grade(vec3 col) {
  col = aces(col * 1.55);
  float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(vec3(l), col, 1.12);
  col *= mix(vec3(0.86, 1.02, 1.08), vec3(1.08, 1.0, 0.86), smoothstep(0.2, 0.85, l));
  col = clamp((col - 0.5) * 1.06 + 0.5 + 0.004, 0.0, 1.0);
  return pow(col, vec3(1.0 / 2.2));
}
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float grain(vec2 fc) { return hash12(fc + fract(uT * 7.31) * 113.0) - 0.5; }
// The deep's vignette and the mask's rubber at the corners: what we add sits behind the glass.
float lensK(vec2 uv) {
  vec2 c = uv - 0.5;
  float vig = 1.0 - smoothstep(0.35, 1.05, length(c * vec2(uAsp, 1.0) * vec2(0.82, 1.0)));
  float k = mix(1.0, mix(0.5, 1.0, vig), uVigK);
  vec2 m = abs(c) * 2.0;
  float box = length(max(m - vec2(0.86, 0.8), 0.0)) - 0.17;
  return k * (1.0 - smoothstep(0.0, 0.07, box) * 0.9 * uMaskK);
}
`;

// Act 1: the old frame, with the light going out of it.
export const FRAME = `
uniform sampler2D tFrom;
uniform float uDim, uShade, uZoom, uWob;
uniform vec2 uZoomC, uShadeDir;
vec2 frameUv(vec2 uv) {
  vec2 w = vec2(sin(uv.y * 9.0 + uT * 1.3), cos(uv.x * 7.0 + uT * 1.1)) * 0.0035 * uWob;
  return uZoomC + (uv - uZoomC) / uZoom + w;
}
vec3 frameAt(vec2 uv) {
  vec3 c = texture2D(tFrom, frameUv(uv)).rgb;
  // its bulk comes between us and the sun: the shadow crosses the frame from one side,
  // the bright things (shafts, the caustic net) go first, what is left turns cold
  vec2 sp = (uv - 0.5) * vec2(uAsp, 1.0);
  float sh = smoothstep(-0.25, 0.25, uShade * 2.4 - 1.2 - dot(sp, uShadeDir));
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  c = mix(c, vec3(l * 0.5, l * 0.86, l * 1.08), uDim * 0.5);
  c -= max(c - 0.55, 0.0) * uDim * 0.65;
  c *= 1.0 - uDim * (0.3 + 0.22 * sh) - 0.12 * uDim * smoothstep(0.0, 0.6, uv.y);
  return max(c, 0.0);
}
`;

// The kraken's head round one great eye, in "eye space": one unit is the eyeball's radius,
// y up. A height field gives the lids and the skin their relief; the eye itself is shaded
// as a sphere under a wet cornea. Returns linear light (rgb) and coverage (a).
export const KRAKEN = `
uniform sampler2D tNoise, tCaustic;
uniform vec2 uEyeC, uPup, uGaze, uBodyDir;
uniform float uEyeR, uRoll, uLid, uHood, uBody, uSun, uPhoto, uGlow, uInner, uFleckK, uGlint, uTorch, uDist;
uniform vec3 uIrisA, uIrisB, uIrisC, uFleck, uInnerCol, uEnv;
// a noise lookup at a chosen level of detail (the iris is sampled round a seam: no derivatives)
vec4 nlod(vec2 uv, float texPerPx) { return textureLod(tNoise, uv, log2(max(1.0, texPerPx * 256.0))); }
float sdLobe(vec2 p, vec2 o, vec2 d, float len, float w0, float w1) {
  vec2 q = p - o;
  float a = dot(q, d), c = dot(q, vec2(-d.y, d.x));
  return max(max(abs(c) - mix(w0, w1, clamp(a / len, 0.0, 1.0)), -a), a - len);
}

vec4 kraken(vec2 sp, out vec3 emit, out vec3 wet, out float inA, out float far, out float pupil) {
  float cr = cos(uRoll), sr = sin(uRoll);
  mat2 R = mat2(cr, sr, -sr, cr), Ri = mat2(cr, -sr, sr, cr);
  vec2 p = R * (sp - uEyeC) / uEyeR;
  float r = length(p);
  float px = 1.0 / (uRes.y * uEyeR); // one pixel in eye units
  vec3 L = normalize(vec3(0.22, 0.78, 0.58)), V = vec3(0.0, 0.0, 1.0);
  // the sun reaches it less the deeper it is; our own torch only reaches it close up
  float sun = uSun * mix(0.35, 1.0, clamp(6.0 / uDist, 0.0, 1.0));
  float torch = uTorch / (1.0 + uDist * uDist * 0.04);

  // ---- the lids: an almond between two arcs through the corners (a true distance, so the
  // lid's roll and lights follow it all the way round); the upper lid does most of the closing
  float lu = max(uLid, uHood), ac = 1.18;
  float bU = mix(1.0, -0.14, lu);
  bU = bU >= 0.0 ? max(bU, 0.012) : min(bU, -0.012);
  float cU = (bU * bU - ac * ac) / (2.0 * bU);
  float sU = sign(bU) * (length(p - vec2(0.0, cU)) - abs(bU - cU));
  float bL = -mix(0.9, 0.14, uLid);
  float cL = (bL * bL - ac * ac) / (2.0 * bL);
  float sL = length(p - vec2(0.0, cL)) - (cL - bL);
  float S = max(sU, sL);
  inA = 1.0 - smoothstep(-px, px, S);
  float dl = max(S, 0.0), dap = -S;

  // ---- the silhouette: the head round the eye, the mantle trailing away behind it with its
  // fins, and the roots of the arms fanning out the other way (towards us: they become the arms)
  vec2 bd = uBodyDir;
  vec4 nz = texture2D(tNoise, p * 0.085 + vec2(0.17, 0.41));
  vec4 fine = texture2D(tNoise, p * 0.31 + vec2(0.71, 0.29));
  float sHead = length(vec2(dot(p, bd) * 0.85, dot(p, vec2(-bd.y, bd.x)))) - 3.1;
  float u = (dot(p, bd) - 1.2) / 11.5;
  float mw = mix(3.0, 0.35, pow(clamp(u, 0.0, 1.0), 1.2)) + 1.7 * exp(-pow((u - 0.8) / 0.11, 2.0));
  float sMantle = max(max(abs(dot(p, vec2(-bd.y, bd.x))) - mw, -u * 11.5 - 0.5), u * 11.5 - 11.5);
  float sArms = 1e3;
  for (int i = 0; i < 5; i++) {
    float an = (float(i) - 2.0) * 0.36;
    vec2 d = -vec2(bd.x * cos(an) - bd.y * sin(an), bd.x * sin(an) + bd.y * cos(an));
    sArms = min(sArms, sdLobe(p, -bd * 1.2 + d * 1.5, d, 7.5, 0.95, 0.12));
  }
  float edgeN = (nz.a - 0.5) * 0.8;
  float sBody = min(sMantle, sArms) + edgeN;
  float sAll = min(sHead + edgeN, mix(1e3, sBody, step(0.001, uBody)));
  float cov = 1.0 - smoothstep(-0.5, 0.35, sAll);
  if (uBody < 0.999) cov = max(1.0 - smoothstep(-0.5, 0.35, sHead + edgeN), cov * uBody);
  far = clamp(u, 0.0, 1.0) * (1.0 - smoothstep(-0.4, 0.4, sMantle - sHead));

  // ---- relief: the lid's thick roll and the crease behind it (broken up, never a perfect
  // ring), soft folds radiating from the eye, the body's rounded edges
  float h = 0.17 * exp(-pow((dl - 0.13) / 0.11, 2.0)) * (0.75 + 0.5 * fine.r) - 0.045 * exp(-pow((dl - 0.33) / 0.08, 2.0)) * (0.5 + fine.g);
  h *= 1.0 - inA;
  float ra = atan(p.y, p.x + 1e-5);
  h += min(sqrt(max(0.0, -sAll)), 1.0) * 0.9 + nz.r * 0.3 + fine.r * 0.05;
  h += sin(ra * 9.0 + nz.g * 7.0 + r * 1.3) * 0.02 * smoothstep(0.5, 1.2, dl) * (1.0 - smoothstep(1.6, 2.8, dl)) * fine.g;
  vec2 gs = vec2(dFdx(h), dFdy(h)) / px;
  vec3 ns = normalize(vec3(-gs * 0.9, 1.0));

  // ---- the eye: an iris that fills most of it, a pupil from slit to round
  vec2 q = p - uGaze;
  float rr = length(q);
  float ang = atan(q.y, q.x + 1e-5), ca = cos(ang), sa = sin(ang);
  float pr = 1.0 / sqrt(ca * ca / (uPup.x * uPup.x) + sa * sa / (uPup.y * uPup.y));
  float IR = 0.9;
  float v = clamp((rr - pr) / max(IR - pr, 0.05), 0.0, 1.0);
  float a01 = ang / TAU + 0.5;
  float tpp = px / max(rr, 0.05) / TAU; // texels of angle per pixel, per unit of a01
  // fibres stretched between the pupil and the rim (they stretch as it dilates), crypts,
  // a raised zigzag collarette, flecks, a dark ruff at the pupil and a dark limbal ring
  float fibA = nlod(vec2(a01 * 7.0, v * 0.22 + 0.13), 7.0 * tpp).g;
  float fibB = nlod(vec2(a01 * 19.0, v * 0.5 + 0.61), 19.0 * tpp).b;
  float fibC = nlod(vec2(a01 * 41.0, v * 0.8 + 0.37), 41.0 * tpp).g;
  float blot = nlod(vec2(a01 * 3.0, v * 0.3 + 0.4), 3.0 * tpp).a;
  float pit = nlod(vec2(a01 * 11.0, v * 0.9 + 0.2), 11.0 * tpp).r;
  vec3 iris = mix(uIrisA, uIrisB, smoothstep(0.04, 0.4, v));
  iris = mix(iris, uIrisC, smoothstep(0.5, 0.95, v));
  float fib = clamp(fibA * (0.6 + 0.8 * fibB) * (0.75 + 0.5 * fibC), 0.0, 1.6);
  iris *= 0.18 + 0.85 * fib * fib;
  float zz = 0.3 + 0.035 * sin(ang * 23.0 + fibB * 4.0);
  float coll = exp(-pow((v - zz) / 0.04, 2.0));
  iris = mix(iris, uIrisB * 1.15, coll * 0.55);
  iris *= 1.0 - smoothstep(0.6, 0.74, pit) * smoothstep(0.16, 0.34, v) * (1.0 - smoothstep(0.6, 0.8, v)) * 0.75;
  iris = mix(iris, uFleck * (0.6 + 0.6 * fibB), smoothstep(0.66, 0.84, blot) * uFleckK * smoothstep(0.1, 0.4, v));
  iris *= 0.2 + 0.8 * smoothstep(0.0, 0.1, v);
  iris *= 1.0 - smoothstep(0.82, 1.0, v) * 0.85;
  float irisM = 1.0 - smoothstep(IR - 1.5 * px, IR + 1.5 * px, rr);
  pupil = (1.0 - smoothstep(-1.5 * px, 1.5 * px, rr - pr)) * inA;
  // round the iris, no white: skin-dark tissue shot with iridophores, silver-gold-green
  vec3 en = normalize(vec3(Ri * (p * 0.7), 1.0));
  vec3 irid = mix(vec3(0.22, 0.2, 0.12), vec3(0.1, 0.22, 0.2), 0.5 + 0.5 * sin(en.x * 5.0 + en.y * 3.0 + nz.g * 6.0));
  vec3 sclera = irid * (0.4 + 0.6 * smoothstep(0.35, 0.75, fine.g)) + vec3(0.06, 0.012, 0.012);
  vec3 alb = mix(sclera, iris, irisM);
  alb = mix(alb, vec3(0.002, 0.003, 0.003), pupil);
  float occ = smoothstep(0.0, 0.32, -sU) * mix(0.55, 1.0, smoothstep(0.0, 0.18, -sL));
  vec3 eamb = mix(vec3(0.008, 0.04, 0.062), vec3(0.05, 0.2, 0.23), en.y * 0.5 + 0.5) * vec3(0.6, 0.76, 0.81);
  vec3 eye = alb * (SUN * sun * max(dot(en, L) * 0.7 + 0.3, 0.0) * 0.75 + eamb * (0.6 + 0.4 * sun) + vec3(1.0, 0.95, 0.85) * torch * en.z) * mix(0.12, 1.0, occ);
  // it glows from within, as the world's eye does: brightest in the fibres
  float notP = 1.0 - pupil;
  eye += uIrisB * irisM * notP * uGlow * (0.02 + 0.1 * fib * fib * smoothstep(0.05, 0.5, v)) * mix(0.3, 1.0, occ);
  // the light of whatever is in the pupil, spilling out across the iris
  eye += uInnerCol * uInner * irisM * notP * (exp(-v * 4.5) * 0.3 + 0.025) * (0.3 + 0.8 * fib) * mix(0.5, 1.0, occ);
  // eyeshine: something gold-green, deep in the dark of the pupil
  eye += vec3(0.012, 0.018, 0.005) * pupil * (1.0 - smoothstep(0.0, max(pr, 0.01), rr)) * uGlow;
  // the cornea: the surface's light across the top of it, our torch, a cold glint, the water
  vec3 Rf = reflect(-V, en);
  float fres = 0.04 + 0.96 * pow(1.0 - max(en.z, 0.0), 5.0);
  float win = smoothstep(0.3, 0.6, Rf.y) * (1.0 - smoothstep(0.5, 0.88, abs(Rf.x + 0.1)));
  float rip = texture2D(tCaustic, Rf.xy * vec2(0.45, 0.3) + vec2(uT * 0.02, uT * 0.013)).r;
  wet = SUN * win * (0.2 + 0.8 * rip) * 0.35 * sun;
  wet += vec3(1.0, 0.97, 0.9) * pow(max(dot(Rf, normalize(vec3(-0.38, 0.62, 0.69))), 0.0), 360.0) * (2.2 * sun + uGlint);
  wet += vec3(1.0, 0.96, 0.88) * pow(max(dot(Rf, normalize(vec3(0.16, 0.14, 0.98))), 0.0), 1400.0) * torch * 5.0;
  wet += vec3(0.75, 0.9, 1.0) * pow(max(dot(Rf, normalize(vec3(0.5, -0.3, 0.81))), 0.0), 900.0) * (0.4 * sun + 0.5 * uGlint);
  wet += uEnv * fres * 0.8;
  wet += vec3(0.55, 0.68, 0.7) * exp(-pow(dap / 0.02, 2.0)) * (0.16 * sun + 0.06 * uPhoto + 0.3 * torch);
  wet *= inA * mix(0.3, 1.0, occ);

  // ---- skin: the world's oxblood, mottled, banded out from the eye, the lid rims salmon
  vec3 skin = mix(vec3(0.12, 0.01, 0.016), vec3(0.5, 0.055, 0.045), smoothstep(0.25, 0.8, nz.r * 0.8 + fine.r * 0.35));
  float band = smoothstep(0.3, 0.7, 0.5 + 0.5 * sin(ra * 6.0 + nz.g * 5.0 + r * 0.8));
  skin *= mix(1.0, mix(0.5, 1.0, band), smoothstep(1.2, 2.0, r));
  skin = mix(skin, vec3(0.42, 0.17, 0.14) * (0.8 + 0.35 * nz.g), exp(-pow((dl - 0.07) / 0.08, 2.0)) * 0.85);
  // chromatophores: fine speckles that flush darker and brighter, slowly
  float spk = texture2D(tNoise, p * vec2(1.5, 1.8) + vec2(uT * 0.013, -uT * 0.02)).b;
  skin *= 0.7 + 0.55 * smoothstep(0.42, 0.68, spk);
  float cau = texture2D(tCaustic, p * 0.16 + vec2(uT * 0.013, uT * 0.008)).r * texture2D(tCaustic, p * 0.21 + vec2(-uT * 0.01, uT * 0.014) + 0.37).r * 3.2;
  vec3 samb = mix(vec3(0.008, 0.04, 0.062), vec3(0.05, 0.2, 0.23), ns.y * 0.5 + 0.5) * vec3(0.6, 0.76, 0.81);
  vec3 sk = skin * (SUN * sun * 0.75 * max((dot(ns, L) + 0.3) / 1.3, 0.0) * (0.5 + cau * 1.3 * smoothstep(0.0, 0.6, ns.y)) + samb * (0.5 + 0.5 * sun) + vec3(1.0, 0.95, 0.85) * torch * 0.5 * max(ns.z, 0.0));
  sk *= mix(1.0, 0.45, exp(-pow((dl - 0.32) / 0.09, 2.0)));
  vec3 Hs = normalize(L + V);
  sk += SUN * sun * pow(max(dot(ns, Hs), 0.0), 40.0) * 0.12 + vec3(1.0, 0.95, 0.85) * torch * pow(max(ns.z, 0.0), 80.0) * 0.12;
  sk += uEnv * pow(1.0 - max(ns.z, 0.0), 3.0) * 0.4;
  sk += uInnerCol * uInner * skin * 0.35 * exp(-dl * 4.0) * (1.0 - smoothstep(0.6, 1.6, r));

  // ---- photophores: a ring along each lid, a scatter over the body, pulsing in slow waves
  float f = fract(atan(p.y * 1.7, p.x + 1e-5) / TAU * 30.0) - 0.5, rd = dl - 0.3;
  float ring = exp(-(f * f * 70.0 + rd * rd * 1100.0)) * step(0.001, dl);
  vec2 cell = p * 2.6, cf = fract(cell) - 0.5;
  float hs = hash12(floor(cell) + 7.0);
  float spots = (1.0 - smoothstep(0.03, 0.09 + 0.05 * hs, length(cf + (vec2(hash12(floor(cell) + 3.1), hs) - 0.5) * 0.5))) * step(0.66, hs) * smoothstep(0.55, 0.8, dl);
  float wave = 0.25 + 0.75 * pow(0.5 + 0.5 * sin(uT * 1.6 - r * 0.9 + hs * 2.0), 2.0);
  emit = PHOTO * (ring * 1.2 + spots * 0.8) * wave * uPhoto * (1.0 - inA) * cov;
  return vec4(mix(sk, eye, inA), cov);
}
`;

const VERT_SCREEN = 'void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }';

// Act 1 backdrop: the old frame, darkening, with the kraken rising through its water.
export const BACK1 = {
  vertexShader: VERT_SCREEN,
  fragmentShader: COMMON + FRAME + KRAKEN + `
uniform float uEyeA, uHole;
uniform vec2 uFocus;
void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  vec3 bg = frameAt(uv);
  vec3 col = bg;
  if (uEyeA > 0.001) {
    vec2 sp = (uv - 0.5) * vec2(uAsp, 1.0);
    vec3 emit, wet; float inA, far, pupil;
    vec4 k = kraken(sp, emit, wet, inA, far, pupil);
    // water between us and it: the frame's own colour, more of it for the mantle further back
    float fog = 1.0 - exp(-(uDist + far * 22.0) * 0.045);
    vec3 lit = grade(k.rgb + wet);
    vec3 kc = mix(lit, bg, fog);
    kc += (grade(k.rgb + wet + emit) - lit) * (1.0 - fog * 0.55); // its lights carry further than its shape
    kc *= lensK(uv);
    float cov = k.a * uEyeA;
    // the one who was shot stays in front of it while it is still far below
    vec2 fd = (uv - uFocus) * vec2(uAsp, 1.0);
    cov *= 1.0 - uHole * (1.0 - smoothstep(0.04, 0.15, length(fd)));
    col = mix(bg, kc, cov);
  }
  col += grain(gl_FragCoord.xy) * 0.035 * uK;
  gl_FragColor = vec4(col, 1.0);
}`,
};

// The arms: the world's arm skin (bands, salmon underside, two rows of ringed suckers,
// photophores down the back) with real relief in the suckers, lit by the dimming sun and
// the caustic net, rimmed by the frame's own water, fogged into it.
export const ARM = {
  vertexShader: `
attribute vec3 aTan;
attribute float aS;
varying vec3 vP, vN, vT;
varying vec2 vUv;
varying float vS;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vP = w.xyz; vN = normal; vT = aTan; vUv = uv; vS = aS;
  gl_Position = projectionMatrix * viewMatrix * w;
}`,
  fragmentShader: COMMON + FRAME + `
uniform sampler2D tNoise, tCaustic;
uniform float uSun, uPhoto, uBump, uTorch;
varying vec3 vP, vN, vT;
varying vec2 vUv;
varying float vS;
void main() {
  // (the tube's normals are built outward; its inside is never seen)
  vec3 n = normalize(vN);
  vec3 T = normalize(vT);
  vec3 A = normalize(cross(T, n));
  vec3 V = normalize(-vP);
  vec2 uv = vUv;
  float side = abs(uv.x - 0.5);
  float under = 1.0 - smoothstep(0.1, 0.19, side);
  vec4 nz = texture2D(tNoise, vec2(uv.x * 1.5, vS * 0.045));
  float band = smoothstep(0.35, 0.65, 0.5 + 0.5 * sin(vS * 0.42 + nz.r * 3.0));
  vec3 back = mix(vec3(0.13, 0.01, 0.018), vec3(0.46, 0.05, 0.045), smoothstep(0.3, 0.75, nz.r)) * mix(0.55, 1.0, band);
  vec3 belly = vec3(0.42, 0.17, 0.14) * (0.8 + 0.35 * nz.g);
  vec3 skin = mix(back, belly, under);
  // suckers: two staggered rows; a raised pale rim round a deep cup with a horny ring in it
  float row = step(0.5, uv.x);
  float f = fract(vS * 1.15 + row * 0.5) - 0.5;
  float across = (side - 0.055) * 6.283;
  vec2 sc = vec2(f / 1.15, across);
  float dd = length(sc);
  float rim = (1.0 - smoothstep(0.17, 0.23, dd)) * smoothstep(0.08, 0.13, dd) * under;
  float cup = (1.0 - smoothstep(0.07, 0.12, dd)) * under;
  float horn = exp(-pow((dd - 0.085) / 0.014, 2.0)) * under;
  skin = mix(skin, vec3(0.72, 0.5, 0.42), rim * 0.85);
  skin = mix(skin * (1.0 - cup * 0.78), vec3(0.78, 0.62, 0.48), horn * 0.45);
  // relief: d(height)/d(dd) of rim-minus-cup, pushed into the normal along the arm and round it
  float dh = (-2.0 * (dd - 0.19) / 0.0012) * exp(-pow((dd - 0.19) / 0.035, 2.0)) * 0.012 + (smoothstep(0.05, 0.13, dd + 0.004) - smoothstep(0.05, 0.13, dd - 0.004)) / 0.008 * 0.05;
  vec2 dir = sc / max(dd, 1e-4);
  n = normalize(n - (T * dir.x * -1.0 + A * dir.y * (row * 2.0 - 1.0)) * dh * under * uBump);
  // chromatophores
  skin *= 0.75 + 0.5 * smoothstep(0.45, 0.65, texture2D(tNoise, vec2(uv.x * 6.0, vS * 0.25) + vec2(uT * 0.013, -uT * 0.02)).b);
  // photophores down the back, a wave of light running out to the tip
  float pf = fract(vS * 0.55) - 0.5, pa = min(uv.x, 1.0 - uv.x) * 6.283 - 0.35;
  float pd = length(vec2(pf / 0.55, pa));
  float wave = 0.2 + 0.8 * pow(0.5 + 0.5 * sin(uv.y * 16.0 - uT * 2.2), 4.0);
  vec3 emit = PHOTO * ((1.0 - smoothstep(0.06, 0.14, pd)) * 0.9 + exp(-pd * 9.0) * 0.12) * wave * uPhoto;
  vec3 L = normalize(vec3(0.22, 0.85, 0.45));
  float cau = texture2D(tCaustic, vP.xz * 0.35 + vec2(uT * 0.013, uT * 0.008)).r * texture2D(tCaustic, vP.xz * 0.47 + vec2(-uT * 0.01, uT * 0.014) + 0.37).r * 3.2;
  vec3 amb = mix(vec3(0.008, 0.04, 0.062), vec3(0.05, 0.2, 0.23), n.y * 0.5 + 0.5) * vec3(0.6, 0.76, 0.81);
  vec2 suv = gl_FragCoord.xy / uRes;
  vec3 bg = frameAt(suv);
  // light: the dimming sun and its caustic net from above, the water's own glow all round
  // (the frame's colour), and the diver's torch from the lens, falling off fast
  float dist = length(vP);
  float torch = uTorch / (1.0 + dist * dist * 0.06);
  vec3 col = skin * (SUN * uSun * max((dot(n, L) + 0.3) / 1.3, 0.0) * (0.5 + cau * 1.45 * smoothstep(0.0, 0.7, n.y)) + amb * (0.6 + 0.4 * uSun) + bg * bg * 0.9 + vec3(1.0, 0.95, 0.85) * torch * max(dot(n, V), 0.0));
  vec3 Hs = normalize(L + V);
  col += SUN * uSun * (pow(max(dot(n, Hs), 0.0), 60.0) * 0.4 + pow(max(dot(n, Hs), 0.0), 8.0) * 0.03);
  col += vec3(1.0, 0.95, 0.85) * torch * (pow(max(dot(n, V), 0.0), 50.0) * 0.6 + pow(max(dot(n, V), 0.0), 6.0) * 0.04);
  col += bg * bg * pow(1.0 - max(dot(n, V), 0.0), 3.0) * 1.2;
  float fog = 1.0 - exp(-dist * 0.03);
  vec3 lit = grade(col);
  vec3 outc = mix(lit, bg, fog) + (grade(col + emit) - lit) * (1.0 - fog * 0.5);
  outc *= lensK(suv);
  gl_FragColor = vec4(outc + grain(gl_FragCoord.xy) * 0.035, 1.0);
}`,
};

// The jet of ink: a plume shot from the siphon that slows and billows until there is
// nothing else. Thin ink is a bruised violet-brown and catches the last light; thick ink
// is the world's own ink colour, near black. Premultiplied out.
export const INK = {
  vertexShader: VERT_SCREEN,
  fragmentShader: COMMON + `
uniform sampler2D tNoise;
uniform float uInk, uInkFull;
uniform vec2 uInkS, uInkDir;
void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  vec2 sp = (uv - 0.5) * vec2(uAsp, 1.0);
  vec2 d = sp - uInkS;
  float Lj = 2.6 * (1.0 - pow(1.0 - uInk, 2.2));
  float al = dot(d, uInkDir);
  vec2 c = d - uInkDir * clamp(al, 0.0, Lj);
  float u = clamp(al / max(Lj, 1e-3), 0.0, 1.0);
  float rad = (0.07 + 0.55 * uInk) * (0.4 + 0.9 * u) * (0.6 + 0.4 * uInk) + 1.2 * uInk * uInk * uInk;
  vec2 drift = uInkDir * uT * 0.12;
  float n1 = texture2D(tNoise, sp * 0.9 - drift).r;
  float n2 = texture2D(tNoise, sp * 2.6 - drift * 1.6 + vec2(0.3, 0.7)).g;
  float n3 = texture2D(tNoise, sp * 6.0 - drift * 2.2 + 0.5).b;
  float e = rad - length(c) + ((n1 - 0.5) * 0.7 + (n2 - 0.5) * 0.3 + (n3 - 0.5) * 0.1) * (rad + 0.05);
  float dens = smoothstep(-0.015, 0.1, e) * step(0.001, uInk);
  float thick = smoothstep(0.02, 0.3, e);
  vec3 col = mix(vec3(0.17, 0.08, 0.14), vec3(0.014, 0.006, 0.018), thick);
  col += vec3(0.05, 0.08, 0.085) * smoothstep(0.55, 0.85, n2) * (1.0 - thick) * smoothstep(-0.3, 0.4, sp.y);
  float a = max(dens, uInkFull);
  col = mix(col, vec3(0.014, 0.006, 0.018), uInkFull) * mix(1.0, lensK(uv), 0.6);
  gl_FragColor = vec4(col * a, a);
}`,
};

// Act 2 backdrop: the ink, the eye opening in it, and the next world in its pupil. At the
// end the picture is the new world's first frame, pixel for pixel, and fades to nothing.
export const BACK2 = {
  vertexShader: VERT_SCREEN,
  fragmentShader: COMMON + KRAKEN + `
uniform sampler2D tTo;
uniform float uEyeA, uPic, uRho, uSc, uTear, uExit, uAlpha, uBright;
uniform vec2 uPicC;
void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  vec2 sp = (uv - 0.5) * vec2(uAsp, 1.0);
  vec4 n = texture2D(tNoise, sp * 0.45 + vec2(uT * 0.012, -uT * 0.009));
  vec3 ink = vec3(0.012, 0.006, 0.016) + vec3(0.02, 0.012, 0.03) * smoothstep(0.45, 0.85, n.r);
  vec3 col = ink;
  vec3 wet = vec3(0.0);
  float inA = 0.0;
  if (uEyeA > 0.001) {
    vec3 emit; float far, pupil;
    vec4 k = kraken(sp, emit, wet, inA, far, pupil);
    col = mix(ink, grade(k.rgb + emit), k.a * uEyeA);
    wet *= uEyeA;
    inA *= uEyeA;
  }
  if (uPic > 0.001) {
    vec2 d = sp - uPicC;
    float dl = length(d);
    // the pupil's edge: crisp while it is an eye, torn smoke as we fall through it
    float tn = texture2D(tNoise, sp * 1.2 + vec2(0.0, -uT * 0.15)).r * 0.65 + texture2D(tNoise, sp * 3.4 + uT * 0.05).g * 0.35;
    float px = 1.5 / uRes.y;
    float edge = uRho * (1.0 + (tn - 0.5) * 0.5 * uTear) + uTear * uTear * 0.6;
    float m = 1.0 - smoothstep(edge - px - uTear * 0.08, edge + px, dl);
    m *= mix(smoothstep(0.0, 0.6, inA), 1.0, uTear);
    // the pupil is a lens: the picture bulges in it while it is small
    vec2 X = d / max(uSc, 1e-3);
    float qq = dl / max(uRho, 1e-3);
    X *= 1.0 - (1.0 - uSc) * 0.22 * (1.0 - min(qq * qq, 1.0));
    vec2 tuv = mix(X / vec2(uAsp, 1.0) + 0.5, uv, uExit);
    vec3 pic = texture2D(tTo, tuv).rgb;
    pic = mix(pic, pic * 1.2 + 0.035, uBright * (1.0 - uExit));
    // smoke where it tears: a dark rim of ink just outside the edge
    float smoke = smoothstep(0.0, 0.12, dl - edge) * (1.0 - smoothstep(0.12, 0.4 + uTear * 0.3, dl - edge)) * uTear;
    col = mix(col, ink, smoke * 0.85 * (1.0 - uExit));
    col = mix(col, pic, m * uPic);
  }
  col += (vec3(1.0) - exp(-wet * 1.4)) * 0.85 * (1.0 - uTear);
  col += grain(gl_FragCoord.xy) * 0.03 * (1.0 - uExit);
  gl_FragColor = vec4(col * uAlpha, uAlpha);
}`,
};

// The specks: every one a pure function of t. They drift, gather into a slow spiral, settle
// on the next world's outlines (sampled from its first frame) and fall into the pupil.
export const SPECK = {
  vertexShader: `
attribute vec4 aR;
attribute vec3 aCol;
attribute vec2 aTgt;
attribute float aDel;
uniform float uT, uAsp, uPx, uHand, uArms, uTwist, uTilt, uIncl, uTgtOn, uSc, uFade;
uniform float uOn0, uS0, uS1, uG0, uG1, uP0, uP1;
uniform vec2 uGal, uPicC;
uniform vec3 uBleed;
varying vec3 vCol;
varying float vA;
#define TAU 6.2831853
void main() {
  vec3 r = position;
  float t = uT;
  // drifting in the dark
  vec2 a = (r.xy - 0.5) * vec2(uAsp * 1.05, 1.05) + vec2(sin(t * 0.31 + r.z * 6.28), cos(t * 0.27 + aR.x * 6.28)) * 0.025 + vec2(0.0, (t - uOn0) * 0.012);
  // the galaxy: arms wound by uTwist, inner stars faster than outer
  float gr = 0.035 + 0.43 * pow(aR.y, 0.75);
  float arm = floor(aR.z * uArms);
  float th = arm / uArms * TAU + uHand * gr * uTwist + (aR.w - 0.5) * (0.35 + 1.4 * gr) * 0.6;
  th += uHand * (t - uS0) * 0.32 / (0.18 + gr);
  vec2 g = vec2(cos(th), sin(th) * uIncl) * gr;
  float ct = cos(uTilt), st = sin(uTilt);
  vec2 b = uGal + vec2(g.x * ct - g.y * st, g.x * st + g.y * ct);
  // the next world, in points
  vec2 c = aTgt + vec2(sin(t * 1.7 + r.z * 20.0), cos(t * 1.3 + r.x * 17.0)) * 0.0025;
  vec2 dpt = uPicC + aTgt * uSc;
  float kB = smoothstep(0.0, 1.0, clamp((t - uS0 - r.z * 0.35) / (uS1 - uS0), 0.0, 1.0));
  float kC = smoothstep(0.0, 1.0, clamp((t - uG0 - aDel) / (uG1 - uG0), 0.0, 1.0)) * uTgtOn;
  float kD = smoothstep(0.0, 1.0, clamp((t - uP0 - aR.x * 0.12) / (uP1 - uP0), 0.0, 1.0)) * uTgtOn;
  // (a curve on the way in: they swirl onto their places rather than slide)
  vec2 mid = mix(b, c, kC);
  vec2 perp = vec2(-(c.y - b.y), c.x - b.x) * uHand * 0.35 * sin(kC * 3.14159);
  vec2 pos = mix(mid + perp, dpt, kD);
  gl_Position = vec4(pos.x / (uAsp * 0.5), pos.y / 0.5, 0.0, 1.0);
  float on = smoothstep(uOn0 + r.x * 0.7, uOn0 + r.x * 0.7 + 0.3, t);
  float tw = 0.6 + 0.4 * sin(t * (2.5 + r.y * 4.0) + r.z * 40.0);
  vec3 bio = mix(vec3(0.22, 0.6, 1.0), vec3(0.3, 1.0, 0.82), aR.w * aR.w);
  vec3 tgt = mix(aCol, uBleed, 0.25) * 1.35 + 0.06;
  vCol = mix(bio, tgt, kC * 0.85) * tw * 1.9;
  vA = on * uFade * (1.0 - kD * 0.35);
  float core = 1.0 + 1.6 * step(0.92, aR.y) * (1.0 - kC);
  gl_PointSize = (3.6 + 5.0 * aR.x * aR.x) * core * uPx * mix(1.0, 0.8, kC) * mix(1.0, 0.55, kD);
}`,
  fragmentShader: `
precision highp float;
varying vec3 vCol;
varying float vA;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c) * 2.0;
  float a = (exp(-d * d * 14.0) + exp(-d * 4.0) * 0.4) * vA * (1.0 - smoothstep(0.8, 1.0, d));
  gl_FragColor = vec4(vCol * a, 0.0);
}`,
};

// SWALLOWED — the bioluminescent specks. Their whole flight is in the vertex shader (see
// SPECK in shaders.js); here they are made, and given their places in the next world: its
// first frame is looked at once, small, and every speck is dealt a point on its outlines
// (where colour and brightness change fastest) or, more rarely, on its bright areas.
import { makeCanvas } from '../../kit.js';
import { SPECK } from './shaders.js';

export function makeSpecks(THREE, rng, n, plan) {
  const g = new THREE.BufferGeometry();
  const r3 = new Float32Array(n * 3), r4 = new Float32Array(n * 4);
  for (let i = 0; i < n * 3; i++) r3[i] = rng();
  for (let i = 0; i < n * 4; i++) r4[i] = rng();
  // the dealing is decided now, so it is the same film whatever the frame looks like
  const deal = new Float32Array(n * 3);
  for (let i = 0; i < deal.length; i++) deal[i] = rng();
  const col = new Float32Array(n * 3), tgt = new Float32Array(n * 2), del = new Float32Array(n);
  g.setAttribute('position', new THREE.BufferAttribute(r3, 3));
  g.setAttribute('aR', new THREE.BufferAttribute(r4, 4));
  g.setAttribute('aCol', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aTgt', new THREE.BufferAttribute(tgt, 2));
  g.setAttribute('aDel', new THREE.BufferAttribute(del, 1));
  const uniforms = {
    uT: { value: 0 }, uAsp: { value: 1 }, uPx: { value: 1 }, uHand: { value: plan.hand }, uArms: { value: plan.arms }, uTwist: { value: plan.twist },
    uTilt: { value: plan.tilt }, uIncl: { value: plan.incl }, uTgtOn: { value: 0 }, uSc: { value: 0.2 }, uFade: { value: 1 },
    uOn0: { value: 0 }, uS0: { value: 0 }, uS1: { value: 1 }, uG0: { value: 0 }, uG1: { value: 1 }, uP0: { value: 0 }, uP1: { value: 1 },
    uGal: { value: new THREE.Vector2() }, uPicC: { value: new THREE.Vector2() }, uBleed: { value: new THREE.Vector3(1, 1, 1) },
  };
  const material = new THREE.ShaderMaterial({
    vertexShader: SPECK.vertexShader, fragmentShader: SPECK.fragmentShader, uniforms,
    transparent: true, depthTest: false, depthWrite: false,
    // additive light that leaves the overlay's alpha alone
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
    blendEquationAlpha: THREE.AddEquation, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
  });
  const points = new THREE.Points(g, material);
  points.frustumCulled = false;
  points.renderOrder = 5;
  let ready = false;

  // Look at the next world's first frame once and deal the specks onto it.
  function target(img, asp, gal) {
    if (ready) return;
    ready = true;
    const GW = 144, GH = Math.max(24, Math.round(GW / Math.max(0.5, asp)));
    let d = null;
    try {
      const c = makeCanvas(GW, GH);
      c.g.drawImage(img, 0, 0, GW, GH);
      d = c.g.getImageData(0, 0, GW, GH).data;
      c.canvas.width = c.canvas.height = 1;
    } catch { d = null; }
    const N = GW * GH, lum = new Float32Array(N), w = new Float32Array(N);
    if (d) for (let i = 0; i < N; i++) lum[i] = (d[i * 4] * 0.3 + d[i * 4 + 1] * 0.55 + d[i * 4 + 2] * 0.15) / 255;
    let maxE = 1e-6;
    for (let y = 1; y < GH - 1; y++) for (let x = 1; x < GW - 1; x++) {
      const i = y * GW + x;
      // Sobel on brightness, plus the colour's own change (two flat colours of one brightness still have an edge)
      const gx = lum[i - GW + 1] + 2 * lum[i + 1] + lum[i + GW + 1] - lum[i - GW - 1] - 2 * lum[i - 1] - lum[i + GW - 1];
      const gy = lum[i + GW - 1] + 2 * lum[i + GW] + lum[i + GW + 1] - lum[i - GW - 1] - 2 * lum[i - GW] - lum[i - GW + 1];
      let cd = 0;
      if (d) for (let k = 0; k < 3; k++) cd += Math.abs(d[(i + 1) * 4 + k] - d[(i - 1) * 4 + k]) + Math.abs(d[(i + GW) * 4 + k] - d[(i - GW) * 4 + k]);
      const e = Math.hypot(gx, gy) + cd / 255 * 0.35;
      w[i] = e;
      if (e > maxE) maxE = e;
    }
    // weights: strong edges, a little of the bright areas, a floor so a blank frame still draws
    const cdf = new Float32Array(N);
    let acc = 0;
    for (let i = 0; i < N; i++) {
      const e = w[i] / maxE;
      acc += (e > 0.12 ? Math.pow(e, 1.3) : 0) + lum[i] * lum[i] * 0.04 + 0.0015;
      cdf[i] = acc;
    }
    const n3 = n;
    let maxD = 1e-6;
    for (let s = 0; s < n3; s++) {
      const u = deal[s * 3] * acc;
      let lo = 0, hi = N - 1;
      while (lo < hi) { const m = (lo + hi) >> 1; if (cdf[m] < u) lo = m + 1; else hi = m; }
      const cx = lo % GW, cy = (lo / GW) | 0;
      const fx = (cx + deal[s * 3 + 1]) / GW, fy = (cy + deal[s * 3 + 2]) / GH;
      tgt[s * 2] = (fx - 0.5) * asp;
      tgt[s * 2 + 1] = 0.5 - fy;
      let r = 0.6, gg = 0.8, b = 1;
      if (d) { r = d[lo * 4] / 255; gg = d[lo * 4 + 1] / 255; b = d[lo * 4 + 2] / 255; }
      // light, not paint: lift every colour towards full brightness, keep its hue
      const mx = Math.max(r, gg, b, 0.05), lift = 0.55 + 0.45 * mx;
      col[s * 3] = (r / mx) * lift; col[s * 3 + 1] = (gg / mx) * lift; col[s * 3 + 2] = (b / mx) * lift;
      const e = w[lo] / maxE;
      // when each one leaves the spiral
      let o;
      if (plan.order === 'centre') o = Math.hypot(tgt[s * 2] - gal.x, tgt[s * 2 + 1] - gal.y);
      else if (plan.order === 'sweep') o = plan.sweepDir > 0 ? fx * asp : (1 - fx) * asp;
      else if (plan.order === 'rise') o = 1 - fy;
      else o = 1 - Math.min(1, e) + deal[s * 3 + 1] * 0.3;
      del[s] = o;
      if (o > maxD) maxD = o;
    }
    for (let s = 0; s < n3; s++) del[s] = (del[s] / maxD) * 0.55 + r4[s * 4] * 0.08;
    for (const k of ['aCol', 'aTgt', 'aDel']) g.attributes[k].needsUpdate = true;
    uniforms.uTgtOn.value = 1;
  }

  return {
    points, uniforms, target,
    get ready() { return ready; },
    dispose() { g.dispose(); material.dispose(); },
  };
}

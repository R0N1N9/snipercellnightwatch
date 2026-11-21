// SWALLOWED — the arms. Each one is drawn in screen space and lifted into depth: a root
// beyond an edge of the frame, a heading in, and a curvature that grows towards the tip
// (a log-spiral coil). Curvature is tied to the FLESH (distance from the tip), not to the
// path, so as the arm slides in, the coil travels out with the tip and the flesh behind it
// straightens: the arm unrolls, as an octopus arm does. The skin pattern is anchored to the
// flesh too, so suckers and lights slide past the lens as it comes.
import { seg, ease, lerp, rand, randSign, pick, TAU } from '../../kit.js';

export const TN = Math.tan((50 / 2) * Math.PI / 180); // the film camera: 50 degrees vertical

// The staging, decided once: where the arms come from and how each moves.
export function planArms(rng, soft) {
  const pattern = pick(rng, ['ring', 'below', 'sweep', 'curtain']);
  const side = randSign(rng);
  const n = soft ? 5 : pick(rng, [5, 6, 6, 7]);
  const hero = Math.floor(rng() * n);
  const base = rand(rng, 0, TAU);
  const arms = [];
  for (let i = 0; i < n; i++) {
    const k = n > 1 ? i / (n - 1) - 0.5 : 0;
    let th;
    if (pattern === 'ring') th = base + (i / n) * TAU + rand(rng, -0.25, 0.25);
    else if (pattern === 'below') th = -Math.PI / 2 + k * 3.3 + rand(rng, -0.15, 0.15);
    else if (pattern === 'curtain') th = Math.PI / 2 + k * 3.4 + rand(rng, -0.15, 0.15);
    else th = (i === n - 1 ? (side > 0 ? Math.PI : 0) : (side > 0 ? 0 : Math.PI)) + (i === n - 1 ? rand(rng, -0.6, 0.6) : k * 2.6 * side + rand(rng, -0.12, 0.12));
    const isHero = i === hero;
    const hand = randSign(rng);
    arms.push({
      th, hand,
      defl: rand(rng, 0.25, 0.75) * hand,         // heading off the straight line in
      k0: rand(rng, -0.35, 0.1) * hand,           // the gentle bend of the whole arm
      coil: rand(rng, 0.9, 1.35),                 // how tightly the tip rolls
      L: isHero ? rand(rng, 2.5, 3.0) : rand(rng, 1.8, 2.6),
      r0: isHero ? rand(rng, 0.34, 0.42) : rand(rng, 0.16, 0.27),
      rt: isHero ? 0.022 : 0.013,
      zr: isHero ? -rand(rng, 1.15, 1.45) : -rand(rng, 2.2, 3.6),
      zt: -rand(rng, 4.5, 8.5),
      t0: 0.45 + rand(rng, 0, 0.7) + (isHero ? 0.3 : 0),
      dur: rand(rng, 1.5, 2.0),
      out: rand(rng, 0, 0.18),                    // stagger of the recoil
      wA: rand(rng, 0.35, 0.8), wF: rand(rng, 1.8, 3.0), wPh: rand(rng, 0, TAU),
      sway: rand(rng, 0, TAU),
      hero: isHero,
    });
  }
  return { pattern, side, arms };
}

// Girth (screen units) by distance from the tip, and the flesh coordinate in girths (the
// pattern's own measure, as kraken.js uses it), both analytic so the skin never swims.
function girth(a, s) { const k = (a.r0 - a.rt) / (a.L * 0.8); return Math.min(a.r0, a.rt + k * s); }
function fleshS(a, s) {
  const k = (a.r0 - a.rt) / (a.L * 0.8), sc = (a.r0 - a.rt) / k;
  return s < sc ? Math.log((a.rt + k * s) / a.rt) / k : Math.log(a.r0 / a.rt) / k + (s - sc) / a.r0;
}

export function buildArms(THREE, plan, material, soft) {
  const NR = soft ? 44 : 76, M = soft ? 14 : 22;
  const group = new THREE.Group();
  const list = plan.arms.map((a) => {
    const nv = NR * (M + 1);
    const pos = new Float32Array(nv * 3), nrm = new Float32Array(nv * 3), tan = new Float32Array(nv * 3), uv = new Float32Array(nv * 2), as = new Float32Array(nv);
    const idx = [];
    for (let k = 0; k < NR - 1; k++) for (let j = 0; j < M; j++) {
      const p = k * (M + 1) + j, q = p + M + 1;
      idx.push(p, q, p + 1, q, q + 1, p + 1);
    }
    const g = new THREE.BufferGeometry();
    const attr = (arr, n) => new THREE.BufferAttribute(arr, n).setUsage(THREE.DynamicDrawUsage);
    const A = { position: attr(pos, 3), normal: attr(nrm, 3), aTan: attr(tan, 3), uv: attr(uv, 2), aS: attr(as, 1) };
    for (const k in A) g.setAttribute(k, A[k]);
    g.setIndex(idx);
    const mesh = new THREE.Mesh(g, material);
    mesh.frustumCulled = false;
    mesh.renderOrder = 1;
    group.add(mesh);
    return { a, g, mesh, A, pos, nrm, tan, uv, as, cx: new Float32Array(NR * 3), ps: new Float32Array(NR), sg: new Float32Array(NR) };
  });

  // How far in each arm's tip has come at time t (screen units of path), and its coil.
  function reach(a, t, T) {
    const inK = ease.inOutSine(seg(t, a.t0, a.t0 + a.dur));
    const settle = 0.05 * Math.sin((t - a.t0) * 1.3 + a.sway) * seg(t, a.t0 + a.dur * 0.6, a.t0 + a.dur);
    const back = ease.inCubic(seg(t, T.recoil + a.out, T.recoil + a.out + 0.55));
    return Math.max(0, a.L * (inK + settle) - (a.L + 0.3) * back);
  }

  const D = [0, 0, 0], B = [0, 0, 0], Tg = [0, 0, 0];
  function update(t, asp, T) {
    for (const o of list) {
      const a = o.a, l = reach(a, t, T);
      o.mesh.visible = l > 0.03;
      if (!o.mesh.visible) continue;
      // the coil tightens as the ink comes (it flinches), and writhes slowly all along
      const coilK = a.coil * (1 + 0.8 * ease.inQuad(seg(t, T.recoil - 0.1, T.recoil + 0.4)));
      const c = Math.cos(a.th), s = Math.sin(a.th);
      const kr = Math.min((asp + 0.3) / Math.max(Math.abs(c), 1e-3), 1.3 / Math.max(Math.abs(s), 1e-3));
      let x = c * kr + 0.05 * Math.sin(t * 0.7 + a.sway), y = s * kr + 0.05 * Math.cos(t * 0.6 + a.sway);
      let psi = a.th + Math.PI + a.defl + 0.08 * Math.sin(t * 0.5 + a.sway);
      const ds = l / (NR - 1);
      for (let k = 0; k < NR; k++) {
        const sp = k * ds, sig = l - sp;
        const z = lerp(a.zr, a.zt, Math.min(1, sp / a.L));
        const depth = -z * TN;
        o.cx[k * 3] = x * depth; o.cx[k * 3 + 1] = y * depth; o.cx[k * 3 + 2] = z;
        o.ps[k] = psi;
        o.sg[k] = sig;
        const kap = a.k0 + a.hand * coilK * 1.15 / (sig + 0.07) * 0.5 + a.wA * Math.sin(sp * a.wF - t * 1.25 + a.wPh) * 0.6;
        // midpoint step
        const ph = psi + kap * ds * 0.5;
        x += Math.cos(ph) * ds; y += Math.sin(ph) * ds;
        psi += kap * ds;
      }
      const P = o.pos, N = o.nrm, TA = o.tan, U = o.uv, S = o.as, C = o.cx;
      for (let k = 0; k < NR; k++) {
        const k0 = Math.max(0, k - 1), k1 = Math.min(NR - 1, k + 1);
        Tg[0] = C[k1 * 3] - C[k0 * 3]; Tg[1] = C[k1 * 3 + 1] - C[k0 * 3 + 1]; Tg[2] = C[k1 * 3 + 2] - C[k0 * 3 + 2];
        let tl = Math.hypot(Tg[0], Tg[1], Tg[2]) || 1;
        Tg[0] /= tl; Tg[1] /= tl; Tg[2] /= tl;
        // the sucker face looks into the curl and towards the lens
        const ix = -Math.sin(o.ps[k]) * a.hand, iy = Math.cos(o.ps[k]) * a.hand;
        D[0] = ix * 0.6; D[1] = iy * 0.6; D[2] = 0.8;
        const dp = D[0] * Tg[0] + D[1] * Tg[1] + D[2] * Tg[2];
        D[0] -= Tg[0] * dp; D[1] -= Tg[1] * dp; D[2] -= Tg[2] * dp;
        tl = Math.hypot(D[0], D[1], D[2]) || 1;
        D[0] /= tl; D[1] /= tl; D[2] /= tl;
        B[0] = Tg[1] * D[2] - Tg[2] * D[1]; B[1] = Tg[2] * D[0] - Tg[0] * D[2]; B[2] = Tg[0] * D[1] - Tg[1] * D[0];
        const sig = o.sg[k], rm = girth(a, sig) * -C[k * 3 + 2] * TN, fs = fleshS(a, sig), av = 1 - sig / a.L;
        for (let j = 0; j <= M; j++) {
          const ang = (j / M) * TAU - Math.PI, ca = Math.cos(ang), sa = Math.sin(ang);
          const fl = ca > 0 ? 0.8 : 1; // flatter across the sucker face
          const ox = D[0] * ca * fl + B[0] * sa * 0.92, oy = D[1] * ca * fl + B[1] * sa * 0.92, oz = D[2] * ca * fl + B[2] * sa * 0.92;
          const i = k * (M + 1) + j;
          P[i * 3] = C[k * 3] + ox * rm; P[i * 3 + 1] = C[k * 3 + 1] + oy * rm; P[i * 3 + 2] = C[k * 3 + 2] + oz * rm;
          const ol = Math.hypot(ox, oy, oz) || 1;
          N[i * 3] = ox / ol; N[i * 3 + 1] = oy / ol; N[i * 3 + 2] = oz / ol;
          TA[i * 3] = Tg[0]; TA[i * 3 + 1] = Tg[1]; TA[i * 3 + 2] = Tg[2];
          U[i * 2] = j / M; U[i * 2 + 1] = av;
          S[i] = fs;
        }
      }
      for (const k in o.A) o.A[k].needsUpdate = true;
    }
  }

  return {
    group, list, update,
    dispose() { for (const o of list) o.g.dispose(); },
  };
}

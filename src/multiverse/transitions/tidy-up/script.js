// TIDY-UP TIME — the timetable, the plan (every random choice, made once) and the hands'
// choreography as keyframes. Positions are in the room's canonical layout (toy box to the
// right, +x); the room's root mirrors them when the fallen soldier lay on the left.
import { clamp, lerp, rand, pick, ease } from '../../kit.js';
import { POSES, SKINS, SLEEVES, newPose } from './hands.js';
import { CALLS } from './sound.js';
import { BOX, SHELF, LOOP } from './room.js';
import { RUG_A, RUG_B } from './lens.js';

export const DURATION = 8.8;
export const SWAP = 5.0;
export const SWAP_AT = SWAP / DURATION;
export const T = {
  call: 0.1, click: 0.95, hand: 1.0, pull1: 2.05,
  dive0: 3.92, dive1: 4.32, inBox: 4.52, lid0: 4.42, shut: 4.86,
  open0: 5.7, cut: 5.98, set: 6.55, away: 7.0, dive2: 7.02, dive3: 8.3, to0: 8.22, to1: 8.46, fade0: 8.46, fade1: DURATION,
};
export const ARRIVALS = ['box', 'book', 'globe'];
const STICKERS = [['NEW!', 'WORLD'], ['2', 'SNIPERS'], ['ONE', 'SHOT'], ['ALL', 'NEW'], ['NO', 'BATTERIES']];

// ---------------------------------------------------------------------------------------------
// Keyframed tracks: { t, p:[x,y,z], r:[yaw, pitch, roll], pose, stop?, sh?:[x,y,z] shoulder, pole? }
// Positions are cubic Hermite through the keys (Catmull-Rom tangents, zero at a `stop`), so a
// hand accelerates out of each stop and settles into the next; rotations ride the same curve.
// ---------------------------------------------------------------------------------------------
function tangent(keys, i, f) {
  const k = keys[i];
  if (k.stop || i === 0 || i === keys.length - 1) return 0;
  const a = keys[i - 1], b = keys[i + 1];
  return (f(b) - f(a)) / Math.max(1e-3, b.t - a.t);
}
function herm(keys, i, u, f) {
  const a = keys[i], b = keys[i + 1], h = b.t - a.t;
  const m0 = tangent(keys, i, f) * h, m1 = tangent(keys, i + 1, f) * h;
  const u2 = u * u, u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * f(a) + (u3 - 2 * u2 + u) * m0 + (-2 * u3 + 3 * u2) * f(b) + (u3 - u2) * m1;
}
const POSE_KEYS = (k) => (typeof k.pose === 'string' ? POSES[k.pose] : k.pose);
const STAGGER = [0.0, 0.05, 0.1, 0.15, -0.04]; // fingers close one after another (index first), thumb leads

// out = { p:{x,y,z}, e:[yaw,pitch,roll], pose, sh:{x,y,z}, pole:{x,y,z}, on }
export function evalTrack(keys, t, out, life) {
  out.on = t >= keys[0].t && t <= keys[keys.length - 1].t;
  t = clamp(t, keys[0].t, keys[keys.length - 1].t);
  let i = 0;
  while (i < keys.length - 2 && t > keys[i + 1].t) i++;
  const a = keys[i], b = keys[i + 1], u = clamp((t - a.t) / Math.max(1e-4, b.t - a.t), 0, 1);
  for (let c = 0; c < 3; c++) {
    out.p[c] = herm(keys, i, u, (k) => k.p[c]);
    out.e[c] = herm(keys, i, u, (k) => k.r[c]);
    out.sh[c] = lerp(a.sh[c], b.sh[c], ease.inOutSine(u));
    out.pole[c] = lerp(a.pole[c], b.pole[c], ease.inOutSine(u));
  }
  // the fingers change shape over the second half of a move, one after another
  const A = POSE_KEYS(a), B = POSE_KEYS(b), P = out.pose, w = b.poseIn ?? 0.55;
  for (let f = 0; f < 5; f++) {
    const k = ease.inOutSine(clamp((u - (1 - w) - STAGGER[f] * w) / Math.max(0.05, w * 0.8), 0, 1));
    if (f < 4) for (let j = 0; j < 4; j++) P.f[f][j] = lerp(A.f[f][j], B.f[f][j], k);
    else for (let j = 0; j < 5; j++) P.t[j] = lerp(A.t[j], B.t[j], k);
  }
  // a little life in the fingers, never quite still
  if (life) for (let f = 0; f < 4; f++) { const s = Math.sin(t * (1.7 + f * 0.37) + life * 3.1 + f * 1.9) * 0.025; P.f[f][0] += s; P.f[f][1] += s * 0.8; }
  return out;
}
export const newState = () => ({ p: [0, 0, 0], e: [0, 0, 0], pose: newPose(), sh: [0, 0, 0], pole: [0, 0, 0], on: false });

// ---------------------------------------------------------------------------------------------
// The plan
// ---------------------------------------------------------------------------------------------
// M: -1 when the fallen soldier lay on the left (the plan is made with the box on the right
// and mirrored); foot(x, y, z): is that canonical spot inside the old frame's picture?
export function makePlan(ctx, guess, M, foot) {
  const rng = ctx.rng;
  const V = { x: clamp(Math.abs(guess.victim.x), 0, RUG_A - 4), z: clamp(guess.victim.z, -RUG_B + 3, RUG_B - 3.5) };
  // the winner: where the lab's photo shows them (their spawn), or across the rug, outside the
  // old frame if there is room (inside it, the frame would show a second one)
  let W = { x: -V.x, z: V.z };
  if (guess.kill) {
    for (let i = 0; i < 14; i++) {
      W = { x: -rand(rng, 11, 17.5), z: rand(rng, -4.5, 6.5) };
      if (!foot(W.x, 0.3, W.z) && !foot(W.x, 2.8, W.z) && Math.hypot(W.x - V.x, W.z - V.z) > 8) break;
    }
  }
  if (Math.hypot(W.x - V.x, W.z - V.z) < 8) W.x = -15;

  const plan = {
    M, V, W, rng,
    arrival: pick(rng, ARRIVALS),
    skin: Math.floor(rng() * SKINS.length),
    sleeve: Math.floor(rng() * SLEEVES.length),
    acc: pick(rng, ['watch', 'ring', 'plaster', null, 'watch', 'ring']),
    call: Math.floor(rng() * CALLS.length),
    callHz: rand(rng, 300, 400),
    doorSide: rng() < 0.5 ? -1 : 1,
    sticker: pick(rng, STICKERS),
    lullaby: Math.floor(rng() * 8) * 2,
    lead: rng() < 0.5 ? 'A' : 'B', // which hand moves first
    yaw: rand(rng, -0.1, 0.1), // the wide shot's angle
    drift: rand(rng, -1, 1),
    sweepZ: rand(rng, -7.4, -5.8),
    trainA: rand(rng, 0.85, 1.35), // where on its loop the train stands
    trainInFoot: false,
  };
  // the train stands somewhere on its loop the old frame does not show (if anywhere)
  {
    const at = (th) => [LOOP.x + Math.cos(th) * LOOP.a, LOOP.z + Math.sin(th) * LOOP.b];
    const clear = (th) => [0, 0.35, 0.7, 1.0].every((d) => { const [x, z] = at(th + d); return !foot(x, 0.5, z) && !foot(x, 2.2, z); });
    let ok = false;
    for (let k = 0; k < 16 && !ok; k++) { const th = plan.trainA + (k & 1 ? -1 : 1) * Math.ceil(k / 2) * 0.4; if (clear(th)) { plan.trainA = th; ok = true; } }
    plan.trainInFoot = !ok;
  }
  const lagA = plan.lead === 'A' ? 0 : 0.07, lagB = plan.lead === 'B' ? 0 : 0.07;
  const PI = Math.PI;

  // ---- hand A (the box side): gather up the fallen soldier, into the box; then the train ----
  // A key either places the wrist (p) or puts one of the hand's contact points on a spot
  // (at + via: 'tips' | 'pinch' | 'palm' | 'grip'); the main module solves those on the real rig.
  const shA = [13, 9, 34], shB = [-13, 9, 34], poA = [1, 0.35, 0.3], poB = [-1, 0.35, 0.3];
  const BX = { x: BOX.x, z: BOX.z };
  const E = { x: LOOP.x + Math.cos(plan.trainA) * LOOP.a, z: LOOP.z + Math.sin(plan.trainA) * LOOP.b };
  plan.E = E;
  const key = (sh, pole) => (t, p, r, pose, o = {}) => ({ t, p: o.at ? null : p, at: o.at ? p : null, via: o.at || null, r, pose, sh: o.sh || sh, pole: o.pole || pole, stop: !!o.stop, poseIn: o.poseIn });
  const a = key(shA, poA), tA = (x) => x + lagA;
  plan.A = [
    a(tA(1.16), [V.x + 16, 22, V.z + 26], [PI + 0.3, 0.3, -0.2], 'relax'),
    a(tA(1.54), [V.x + 0.6, 6.5, V.z + 1.2], [PI + 0.2, 0.45, -0.25], 'ready', { at: 'palm' }),
    a(tA(1.78), [V.x, 1.7, V.z + 0.3], [PI + 0.15, 0.3, -0.15], 'ready', { at: 'palm', stop: true }),
    a(tA(1.95), [V.x, 1.15, V.z + 0.1], [PI + 0.15, 0.32, -0.15], 'cup', { at: 'palm', stop: true, poseIn: 0.95 }),
    a(tA(2.13), [V.x + 1.5, 11, V.z + 1.5], [PI + 0.25, 0.4, -0.25], 'cup'),
    a(tA(2.38), [BX.x - 1.2, 16, BX.z + 0.5], [PI + 0.45, 0.5, -0.25], 'cup'),
    a(tA(2.48), [BX.x - 0.8, 14.5, BX.z + 0.2], [PI + 0.45, 0.6, -0.2], 'ready', { stop: true, poseIn: 0.9 }),
    a(tA(2.72), [BX.x - 8, 15, BX.z + 10], [PI + 0.4, 0.4, -0.2], 'relax'),
    a(tA(3.04), [E.x + 0.3, 6.5, E.z + 0.5], [PI + 0.3, 0.75, -0.1], 'pinchOpen', { at: 'grip' }),
    a(tA(3.2), [E.x, 2.0, E.z], [PI + 0.3, 0.85, -0.1], 'grip', { at: 'grip', stop: true, poseIn: 0.8 }),
    a(tA(3.4), [E.x + 2, 14, E.z + 1], [PI + 0.4, 0.8, -0.1], 'grip'),
    a(tA(3.68), [BX.x - 0.5, 18.5, BX.z - 0.2], [PI + 0.55, 0.85, -0.1], 'grip'),
    a(tA(3.8), [BX.x - 0.3, 17, BX.z - 0.4], [PI + 0.55, 0.8, -0.1], 'ready', { stop: true, poseIn: 0.9 }),
    a(tA(4.15), [BX.x + 6, 28, BX.z + 24], [PI + 0.6, 0.4, -0.1], 'relax'),
  ];
  plan.Agrab = { pieces: tA(1.91), piecesOut: tA(2.48), train: tA(3.2), trainOut: tA(3.8) };

  // ---- hand B: the winner to the shelf, then the forearm across the rug, then the lid ----
  const b = key(shB, poB), tB = (x) => x + lagB;
  const SH = { x: SHELF.x + 0.5, y: SHELF.h, z: SHELF.z + rand(rng, -2.4, 2.4) };
  plan.SH = SH;
  const PH = 1.95; // where a soldier is pinched: round the chest
  const pr = [PI - 0.25, 0.9, 0.35];
  const zS = plan.sweepZ;
  const swSh = [-8, 9, 30], swPole = [0, -1, 0.2], shS = [-30, 10, 26]; // (to the shelf the arm comes round from the side)
  plan.B = [
    b(tB(1.42), [W.x - 14, 22, W.z + 26], [PI - 0.3, 0.3, 0.2], 'relax'),
    b(tB(1.96), [W.x, PH + 4.5, W.z + 0.6], [PI - 0.25, 0.75, 0.3], 'pinchOpen', { at: 'pinch' }),
    b(tB(2.2), [W.x, PH, W.z], pr, 'pinch', { at: 'pinch', stop: true, poseIn: 0.6 }),
    b(tB(2.42), [lerp(W.x, SH.x, 0.25), PH + 8, lerp(W.z, SH.z, 0.25)], [PI - 0.3, 0.8, 0.35], 'pinch', { at: 'pinch', sh: shS }),
    b(tB(2.72), [SH.x, SH.y + PH + 2.6, SH.z], [PI - 0.28, 0.86, 0.35], 'pinch', { at: 'pinch', sh: shS }),
    b(tB(2.88), [SH.x, SH.y + PH, SH.z], pr, 'pinch', { at: 'pinch', stop: true, sh: shS }),
    b(tB(3.02), [SH.x + 1, SH.y + PH + 3.5, SH.z + 2], [PI - 0.3, 0.7, 0.3], 'pinchOpen', { at: 'pinch', poseIn: 0.9, sh: shS }),
    b(tB(3.22), [-25, 8, zS + 3], [PI + 0.05, 0.3, 0.25], 'blade', { sh: swSh, pole: swPole }),
    b(tB(3.34), [-21, 0.55, zS], [PI + 0.03, 0.06, 0.15], 'blade', { at: 'palm', sh: swSh, pole: swPole, stop: true }),
    b(tB(3.74), [19.5, 0.55, zS + 0.8], [PI - 0.05, 0.06, 0.15], 'blade', { at: 'palm', sh: [14, 9, 30], pole: swPole }),
    b(tB(3.84), [22.5, 4.5, zS + 1.4], [PI - 0.1, -0.1, 0.25], 'blade', { sh: [16, 10, 30], pole: swPole, stop: true }),
  ];
  plan.Bgrab = { winner: tB(2.2), winnerOut: tB(2.88), sweep0: tB(3.34), sweep1: tB(3.74) };
  if (!ctx.winner) {
    // a drawn round: nobody earned the shelf; the other one goes in the box too
    const k4 = plan.B[4], k5 = plan.B[5];
    k4.at = [BX.x - 1.5, 14, BX.z - 2]; k5.at = [BX.x - 1.2, 12.5, BX.z - 2];
  }
  return plan;
}

// Mirror keys from the canonical layout (box to the right) into the room: x flips, and so do
// the turns about the vertical (yaw) and about the forearm (roll); a right hand's move mirrored
// is a left hand's. In place; returns the keys.
export function mirrorKeys(keys, M) {
  for (const k of keys) {
    k.sh = k.sh.slice(); k.pole = k.pole.slice(); k.r = k.r.slice();
    if (k.p) k.p = k.p.slice();
    if (k.at) k.at = k.at.slice();
    if (M > 0) continue;
    if (k.p) k.p[0] = -k.p[0];
    if (k.at) k.at[0] = -k.at[0];
    k.sh[0] = -k.sh[0]; k.pole[0] = -k.pole[0];
    k.r[0] = -k.r[0]; k.r[2] = -k.r[2];
  }
  return keys;
}

// The lid's angle (radians open, 0 shut) at time t.
export const LET_GO = T.lid0 + 0.26, LET_ANG = 0.95;
export function lidAngle(t) {
  const OPEN = 1.9;
  if (t < T.lid0) return OPEN;
  // pulled over by hand, let go, and down it comes
  if (t < LET_GO) return lerp(OPEN, LET_ANG, ease.inOutSine((t - T.lid0) / (LET_GO - T.lid0)));
  if (t < T.shut) return LET_ANG * (1 - ease.inQuad((t - LET_GO) / (T.shut - LET_GO)));
  if (t < T.open0) { const u = t - T.shut; return 0.05 * Math.exp(-u * 14) * Math.abs(Math.sin(u * 30)); }
  return OPEN * ease.outCubic(clamp((t - T.open0) / 0.42, 0, 1));
}

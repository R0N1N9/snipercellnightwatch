// BLOW ON IT — the hand. A small 2D rig seen from the thumb side, palm down: a wedge of palm,
// four fingers of three bones each that curl in the picture plane, a thumb, and a sleeved
// forearm running off to a shoulder outside the frame. It is lit like the room: a dark fill and
// a bright rim on the side facing the light, which is how a hand reads in a dark bedroom.
import { lerp } from '../../kit.js';
import { lit, css } from './room.js';

// local frame: the wrist at the origin, +x toward the fingertips, +y the palm side; 1 = palm length
const KN = [[1.0, 0.0], [0.97, -0.11], [0.92, -0.21], [0.85, -0.3]]; // knuckles, index .. pinky
const FL = [0.95, 1.03, 0.96, 0.76];
const FWD = [0.215, 0.22, 0.205, 0.175];
const SEG = [0.46, 0.31, 0.23];
const THB = [0.3, 0.13]; // thumb root

export const POSES = {
  relax: { c: [0.3, 0.36, 0.42, 0.5], sp: 0.05, th: 0.62, tc: 0.25 },
  reach: { c: [0.08, 0.1, 0.14, 0.2], sp: 0.12, th: 0.75, tc: 0.08 },
  fist: { c: [1, 1, 1, 1], sp: 0, th: 0.05, tc: 0.75 },
  point: { c: [0.04, 0.98, 1, 1], sp: 0, th: 0.15, tc: 0.6 },
  grip: { c: [0.62, 0.66, 0.7, 0.74], sp: 0.02, th: 1.05, tc: 0.12 },
  open: { c: [-0.05, -0.04, 0.0, 0.05], sp: 0.22, th: 0.95, tc: 0 },
};

export const makePose = () => ({ c: [0, 0, 0, 0], sp: 0, th: 0, tc: 0 });
export function blendPose(a, b, t, out) {
  for (let i = 0; i < 4; i++) out.c[i] = lerp(a.c[i], b.c[i], t);
  out.sp = lerp(a.sp, b.sp, t);
  out.th = lerp(a.th, b.th, t);
  out.tc = lerp(a.tc, b.tc, t);
  return out;
}

// forward kinematics into a shared scratch: joints of each finger and the thumb
const J = [0, 1, 2, 3].map(() => new Float32Array(8));
const TJ = new Float32Array(6);
function solve(p) {
  for (let i = 0; i < 4; i++) {
    const j = J[i], cu = p.c[i], len = FL[i];
    let x = KN[i][0], y = KN[i][1], a = (i - 0.5) * -p.sp * 0.35 - 0.04 * i;
    j[0] = x; j[1] = y;
    const bend = [1.25 * cu, 1.65 * cu, 1.05 * cu];
    for (let s = 0; s < 3; s++) {
      a += bend[s];
      x += Math.cos(a) * SEG[s] * len;
      y += Math.sin(a) * SEG[s] * len;
      j[2 + s * 2] = x; j[3 + s * 2] = y;
    }
  }
  let a = p.th, x = THB[0], y = THB[1];
  TJ[0] = x; TJ[1] = y;
  x += Math.cos(a) * 0.42; y += Math.sin(a) * 0.42; TJ[2] = x; TJ[3] = y;
  a -= p.tc * 0.9;
  x += Math.cos(a) * 0.32; y += Math.sin(a) * 0.32; TJ[4] = x; TJ[5] = y;
}

/** A pose's working point, in local units: fist → its heel, point → the index tip, grip → between thumb and fingers. */
export function contact(kind, p, out) {
  solve(p);
  if (kind === 'point') { out.x = J[0][6]; out.y = J[0][7]; }
  else if (kind === 'grip') { out.x = (J[0][6] + J[1][6] + TJ[4] * 2) / 4; out.y = (J[0][7] + J[1][7] + TJ[5] * 2) / 4; }
  else if (kind === 'fist') { out.x = (J[0][4] + J[1][4]) / 2; out.y = Math.max(J[0][5], J[1][5]) + 0.08; }
  else { out.x = 1.1; out.y = 0.05; }
  return out;
}

/**
 * Draw the hand: wrist at (x, y), s px per unit, turned by rot; flip mirrors the palm side so it
 * faces down on screen. layer: 'all' | 'back' (all but the thumb) | 'front' (the thumb only).
 * look: { skin, nail, sleeve, cuff, stripe }; Lr = { amb, rim (rgb, already scaled), lx, ly (screen dir to the light) }
 */
export function drawHand(g, x, y, s, rot, flip, p, look, Lr, layer = 'all') {
  if (s < 1) return;
  solve(p);
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  g.scale(s, s * flip);
  g.lineCap = 'round';
  g.lineJoin = 'round';
  // the light's direction in this frame
  const c = Math.cos(-rot), sn = Math.sin(-rot);
  let lx = Lr.lx * c - Lr.ly * sn, ly = (Lr.lx * sn + Lr.ly * c) * flip;
  const ll = Math.hypot(lx, ly) || 1;
  lx /= ll; ly /= ll;
  const fill = lit(look.skin, Lr.amb, null);
  const fillB = lit(look.skin, Lr.amb, null, 1);
  const rim = lit(look.skin, Lr.amb, Lr.rim);
  const edge = 'rgba(8,4,12,0.9)';
  const off = 0.045;
  const finger = (i, shade) => {
    const j = J[i], w = FWD[i];
    const path = () => { g.beginPath(); g.moveTo(j[0], j[1]); g.lineTo(j[2], j[3]); g.lineTo(j[4], j[5]); g.lineTo(j[6], j[7]); };
    path(); g.strokeStyle = edge; g.lineWidth = w + 0.04; g.stroke();
    path(); g.strokeStyle = rim; g.lineWidth = w; g.stroke();
    g.save(); g.translate(-lx * off, -ly * off);
    path(); g.strokeStyle = shade; g.lineWidth = w * 0.86; g.stroke();
    g.restore();
    // a nail catches the light on fingers that are not tucked away
    if (p.c[i] < 0.5 && i < 2) {
      const a = Math.atan2(j[7] - j[5], j[6] - j[4]);
      g.save(); g.translate(j[6] - Math.cos(a) * 0.06, j[7] - Math.sin(a) * 0.06); g.rotate(a);
      g.fillStyle = lit(look.nail, Lr.amb, Lr.rim, 0.8);
      g.beginPath(); g.ellipse(0, -w * 0.18, 0.06, w * 0.2, 0, 0, Math.PI * 2); g.fill();
      g.restore();
    }
  };
  const palm = () => {
    g.beginPath();
    g.moveTo(-0.05, -0.27);
    g.quadraticCurveTo(0.45, -0.42, KN[3][0], KN[3][1] - 0.08);
    g.quadraticCurveTo(KN[0][0] + 0.1, KN[0][1] - 0.2, KN[0][0] + 0.06, KN[0][1] + 0.06);
    g.quadraticCurveTo(0.7, 0.2, 0.32, 0.2);
    g.quadraticCurveTo(0.05, 0.22, -0.05, 0.16);
    g.closePath();
  };
  if (layer !== 'front') {
    const back = lit(look.skin, Lr.amb, null, 1);
    for (let i = 3; i >= 1; i--) finger(i, i === 3 ? back : fillB);
    palm(); g.strokeStyle = edge; g.lineWidth = 0.04; g.stroke();
    palm(); g.fillStyle = rim; g.fill();
    g.save(); g.translate(-lx * off * 1.4, -ly * off * 1.4); palm(); g.fillStyle = fill; g.fill(); g.restore();
    // the knuckles' ridge, a breath of light
    g.strokeStyle = lit(look.skin, Lr.amb, Lr.rim, 0.35);
    g.lineWidth = 0.035;
    g.beginPath(); g.moveTo(KN[3][0] - 0.05, KN[3][1] - 0.03); g.quadraticCurveTo(KN[1][0], KN[1][1] - 0.06, KN[0][0] - 0.02, KN[0][1] - 0.04); g.stroke();
    finger(0, fill);
  }
  if (layer !== 'back') {
    const tp = () => { g.beginPath(); g.moveTo(TJ[0], TJ[1]); g.lineTo(TJ[2], TJ[3]); g.lineTo(TJ[4], TJ[5]); };
    tp(); g.strokeStyle = edge; g.lineWidth = 0.28; g.stroke();
    tp(); g.strokeStyle = rim; g.lineWidth = 0.24; g.stroke();
    g.save(); g.translate(-lx * off, -ly * off); tp(); g.strokeStyle = fill; g.lineWidth = 0.2; g.stroke(); g.restore();
    // thumb pad mound
    g.fillStyle = fill;
    g.beginPath(); g.ellipse(0.24, 0.1, 0.2, 0.12, 0.5, 0, Math.PI * 2); g.fill();
  }
  g.restore();
}

/**
 * The forearm and sleeve, as the lens sees an arm reaching away from it: three projected points
 * (wrist, elbow, shoulder) with their half-widths in px, so the sleeve swells toward the lens.
 * s = the palm's length in px (the bare wrist and the cuff are sized from it). Drawn before the hand.
 */
export function drawArm(g, P, s, look, Lr) {
  const [wx, wy, w0, ex, ey, w1, sx, sy, w2] = P;
  const dx = ex - wx, dy = ey - wy, len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len, nx = -uy, ny = ux;
  const dx2 = sx - ex, dy2 = sy - ey, len2 = Math.hypot(dx2, dy2) || 1;
  const nx2 = -dy2 / len2, ny2 = dx2 / len2;
  const lside = Lr.lx * nx + Lr.ly * ny > 0 ? 1 : -1;
  const cuff = Math.min(len * 0.4, s * 0.3);
  const at = (d) => w0 + (w1 - w0) * Math.min(1, d / len);
  // the bare wrist
  g.beginPath();
  g.moveTo(wx - ux * s * 0.1 + nx * w0, wy - uy * s * 0.1 + ny * w0);
  g.lineTo(wx + ux * (cuff + s * 0.1) + nx * at(cuff), wy + uy * (cuff + s * 0.1) + ny * at(cuff));
  g.lineTo(wx + ux * (cuff + s * 0.1) - nx * at(cuff), wy + uy * (cuff + s * 0.1) - ny * at(cuff));
  g.lineTo(wx - ux * s * 0.1 - nx * w0, wy - uy * s * 0.1 - ny * w0);
  g.closePath();
  g.fillStyle = lit(look.skin, Lr.amb, null);
  g.fill();
  // the sleeve: cuff → elbow → shoulder, the joint rounded
  const cw = at(cuff) * 1.18;
  const sleeve = () => {
    g.beginPath();
    g.moveTo(wx + ux * cuff + nx * cw, wy + uy * cuff + ny * cw);
    g.lineTo(ex + nx * w1, ey + ny * w1);
    g.quadraticCurveTo(ex + (nx + nx2) * w1 * 0.6, ey + (ny + ny2) * w1 * 0.6, ex + nx2 * w1, ey + ny2 * w1);
    g.lineTo(sx + nx2 * w2, sy + ny2 * w2);
    g.lineTo(sx - nx2 * w2, sy - ny2 * w2);
    g.lineTo(ex - nx2 * w1, ey - ny2 * w1);
    g.quadraticCurveTo(ex - (nx + nx2) * w1 * 0.6, ey - (ny + ny2) * w1 * 0.6, ex - nx * w1, ey - ny * w1);
    g.lineTo(wx + ux * cuff - nx * cw, wy + uy * cuff - ny * cw);
    g.closePath();
  };
  sleeve();
  const mx = (wx + ex) / 2, my = (wy + ey) / 2, mw = (w0 + w1) / 2;
  const sg = g.createLinearGradient(mx + nx * mw * lside, my + ny * mw * lside, mx - nx * mw * lside, my - ny * mw * lside);
  sg.addColorStop(0, lit(look.sleeve, Lr.amb, Lr.rim));
  sg.addColorStop(0.3, lit(look.sleeve, Lr.amb, null));
  sg.addColorStop(1, lit(look.sleeve, Lr.amb2 || Lr.amb, null));
  g.fillStyle = sg;
  g.fill();
  if (look.stripe) {
    // knit stripes round the forearm, spaced by depth: closer together far away
    g.save();
    sleeve();
    g.clip();
    g.strokeStyle = lit(look.stripe, Lr.amb, null, 0.75);
    for (let i = 0; i < 12; i++) {
      const q = Math.pow((i + 0.5) / 12, 1.6);
      const px = lerp(wx + ux * cuff, ex, q), py = lerp(wy + uy * cuff, ey, q), hw = lerp(cw, w1, q);
      g.lineWidth = Math.max(1, hw * 0.28);
      g.beginPath();
      g.moveTo(px + nx * hw * 1.1, py + ny * hw * 1.1);
      g.quadraticCurveTo(px + ux * hw * 0.25, py + uy * hw * 0.25, px - nx * hw * 1.1, py - ny * hw * 1.1);
      g.stroke();
    }
    g.restore();
  }
  // the cuff, rolled
  g.strokeStyle = lit(look.cuff, Lr.amb, Lr.rim);
  g.lineWidth = Math.max(1, s * 0.13);
  g.beginPath();
  g.moveTo(wx + ux * (cuff + s * 0.04) + nx * cw, wy + uy * (cuff + s * 0.04) + ny * cw);
  g.quadraticCurveTo(wx + ux * (cuff + s * 0.12), wy + uy * (cuff + s * 0.12), wx + ux * (cuff + s * 0.04) - nx * cw, wy + uy * (cuff + s * 0.04) - ny * cw);
  g.stroke();
  // rim light along the lit edge of the forearm
  g.strokeStyle = css(Lr.rim, 0.55);
  g.lineWidth = Math.max(1, s * 0.03);
  g.beginPath();
  g.moveTo(wx + ux * cuff + nx * cw * lside, wy + uy * cuff + ny * cw * lside);
  g.lineTo(ex + nx * w1 * lside, ey + ny * w1 * lside);
  g.stroke();
}

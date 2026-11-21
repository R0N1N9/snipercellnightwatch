// BLOW ON IT — the things on the carpet: the console (an original top-loader, the
// SKLOUNST 16), cartridges and their labels, the heap of other cartridges, two pads.
import { clamp, lerp, roundRect, makeCanvas, luminance } from '../../kit.js';
import { PAL, bayer, drawText, textWidth } from '../../dimensions/pixel/palette.js';
import { PLAYER_COLORS } from '../../contract.js';
import { proj, floorFrame, YF, lit, css, quad, rgb01 } from './room.js';

const A = { x: 0, y: 0, k: 0, d: 0 }, B = { x: 0, y: 0, k: 0, d: 0 };
// No handwriting font ships on Android; fall back to the game's bold sans rather than a script face.
export const HAND_FONT = `'Marker Felt', 'Chalkboard SE', 'Comic Sans MS', 'Segoe Print', 'Rajdhani', 'Arial Rounded MT Bold', sans-serif`;

// ---------------------------------------------------------------------------------------------
// the console
// ---------------------------------------------------------------------------------------------
export const CON = { hw: 0.66, h: 0.24, z0: -1.85, z1: -0.95, hump: 0.09, hz0: -1.4, hz1: -1.02, slotZ: -1.2, cartW: 0.6 };
export const cartTopY = () => YF - CON.h - CON.hump; // where the slot opens

/** Points on the console the hand needs, in world units. */
export function consoleSpots(xc, side) {
  return {
    top: { x: xc - side * 0.22, y: YF - CON.h, z: -1.6 },
    power: { x: xc + side * 0.47, y: YF - CON.h - 0.03, z: -1.62 },
    slot: { x: xc, y: cartTopY(), z: CON.slotZ },
  };
}

export function drawConsole(g, cam, xc, side, look, L, st, P) {
  const x0 = xc - CON.hw, x1 = xc + CON.hw, yt = YF - CON.h - st.bump, yb = YF, z0 = CON.z0, z1 = CON.z1;
  const body = look.body, dark = look.dark;
  // contact shadow, and the long shadow the tube's light throws toward the lens
  // (a flat floor patch is an affine map: it is only drawn while it lies well in front of the lens)
  const reach = Math.min(1.6, z0 - cam.z - 1.2);
  if (reach > 0.1) {
    g.save();
    floorFrame(g, cam, xc, z0, P);
    const sg = g.createLinearGradient(0, 0, 0, -reach);
    sg.addColorStop(0, `rgba(6,3,14,${0.55 * L.keyI + 0.2})`);
    sg.addColorStop(1, 'rgba(6,3,14,0)');
    g.fillStyle = sg;
    const wv = 0.55 * (reach / 1.6);
    g.beginPath(); g.moveTo(-CON.hw - 0.05, 0.05); g.lineTo(CON.hw + 0.05, 0.05); g.lineTo(CON.hw + wv, -reach); g.lineTo(-CON.hw - wv, -reach); g.closePath(); g.fill();
    g.fillStyle = 'rgba(4,2,10,0.6)';
    g.fillRect(-CON.hw - 0.04, -0.02, CON.hw * 2 + 0.08, 0.95);
    g.restore();
  }
  // body
  if (cam.x > x1) quad(g, cam, [x1, yt, z0, x1, yb, z0, x1, yb, z1, x1, yt, z1], lit(body, L.amb2, L.sideAdd), false);
  if (cam.x < x0) quad(g, cam, [x0, yb, z0, x0, yt, z0, x0, yt, z1, x0, yb, z1], lit(body, L.amb2, L.sideAdd), false);
  // top: brightest at the back, where the tube's light skims across it
  proj(cam, xc, yt, z1, A); proj(cam, xc, yt, z0, B);
  const tg = g.createLinearGradient(0, A.y, 0, B.y);
  tg.addColorStop(0, lit(body, L.amb, L.topAdd));
  tg.addColorStop(1, lit(body, L.amb, L.topAdd2));
  quad(g, cam, [x0, yt, z0, x1, yt, z0, x1, yt, z1, x0, yt, z1], tg, false);
  // ribs across the top
  for (let i = 0; i < 5; i++) {
    const z = lerp(z0 + 0.08, CON.hz0 - 0.04, i / 4);
    quad(g, cam, [x0 + 0.08, yt - 0.001, z, x0 + 0.42, yt - 0.001, z, x0 + 0.42, yt - 0.001, z + 0.025, x0 + 0.08, yt - 0.001, z + 0.025], lit(dark, L.amb, null), false);
  }
  // the hump that carries the slot
  const hx0 = xc - 0.42, hx1 = xc + 0.42, hy = yt - CON.hump;
  if (cam.x > hx1) quad(g, cam, [hx1, hy, CON.hz0, hx1, yt, CON.hz0, hx1, yt, CON.hz1, hx1, hy, CON.hz1], lit(body, L.amb2, L.sideAdd), false);
  if (cam.x < hx0) quad(g, cam, [hx0, yt, CON.hz0, hx0, hy, CON.hz0, hx0, hy, CON.hz1, hx0, yt, CON.hz1], lit(body, L.amb2, L.sideAdd), false);
  quad(g, cam, [hx0, hy, CON.hz0, hx1, hy, CON.hz0, hx1, hy, CON.hz1, hx0, hy, CON.hz1], lit(body, L.amb, L.topAdd), false);
  proj(cam, hx0, hy, CON.hz0, A); proj(cam, hx1, yt, CON.hz0, B);
  g.fillStyle = lit(body, L.amb2, L.frontAdd);
  g.fillRect(A.x, A.y, B.x - A.x, B.y - A.y);
  // the slot, and its dust flap
  const open = st.slotOpen;
  quad(g, cam, [xc - 0.33, hy - 0.002, CON.slotZ - 0.035, xc + 0.33, hy - 0.002, CON.slotZ - 0.035, xc + 0.33, hy - 0.002, CON.slotZ + 0.035, xc - 0.33, hy - 0.002, CON.slotZ + 0.035], '#07040c', false);
  if (open < 1) quad(g, cam, [xc - 0.32, hy - 0.004, CON.slotZ - 0.03, xc + 0.32, hy - 0.004, CON.slotZ - 0.03, xc + 0.32, hy - 0.004, CON.slotZ - 0.03 + 0.06 * (1 - open), xc - 0.32, hy - 0.004, CON.slotZ - 0.03 + 0.06 * (1 - open)], lit(dark, L.amb, L.topAdd), false);
  return { hy, yt };
}

/** The console's front: stripe, badge, LED, ports, and the power slider and reset button on top. */
export function drawConsoleFront(g, cam, xc, side, look, L, st, P) {
  const x0 = xc - CON.hw, x1 = xc + CON.hw, yt = YF - CON.h - st.bump, z0 = CON.z0;
  proj(cam, x0, yt, z0, A); proj(cam, x1, YF, z0, B);
  const k = A.k;
  g.fillStyle = lit(look.body, L.amb2, L.frontAdd);
  g.fillRect(A.x, A.y, B.x - A.x, B.y - A.y);
  g.fillStyle = 'rgba(255,255,255,0.07)';
  g.fillRect(A.x, A.y, B.x - A.x, Math.max(1, k * 0.012));
  g.fillStyle = lit(look.stripe, L.amb, L.frontAdd);
  g.fillRect(A.x, A.y + (B.y - A.y) * 0.36, B.x - A.x, Math.max(1, (B.y - A.y) * 0.1));
  // controller ports
  for (let i = 0; i < 2; i++) {
    const px = xc + side * (-0.18 + i * 0.26) - 0.08;
    proj(cam, px, YF - 0.15, z0, A);
    g.fillStyle = '#06040a';
    roundRect(g, A.x, A.y, k * 0.16, k * 0.09, k * 0.02);
    g.fill();
  }
  // LED and badge
  proj(cam, xc + side * 0.47, YF - 0.12, z0, A);
  const on = st.led;
  g.fillStyle = on > 0.5 ? '#ff4b3a' : '#3a1010';
  g.beginPath(); g.arc(A.x, A.y, Math.max(1, k * 0.014), 0, Math.PI * 2); g.fill();
  if (on > 0.5) {
    const lg = g.createRadialGradient(A.x, A.y, 0, A.x, A.y, k * 0.09);
    lg.addColorStop(0, 'rgba(255,75,58,0.55)'); lg.addColorStop(1, 'rgba(255,75,58,0)');
    g.fillStyle = lg; g.fillRect(A.x - k * 0.09, A.y - k * 0.09, k * 0.18, k * 0.18);
  }
  if (k > 60) {
    proj(cam, xc - side * 0.42, YF - 0.06, z0, A);
    g.font = `700 ${k * 0.045}px 'Rajdhani', 'Futura', sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = lit([0.75, 0.73, 0.8], L.amb, L.frontAdd);
    g.fillText('SKLOUNST 16', A.x, A.y);
  }
  // power slider (side of the hand) and reset button
  const pz = -1.62, px = xc + side * 0.47 + side * (st.power - 0.5) * 0.08;
  quad(g, cam, [xc + side * 0.47 - 0.09, yt - 0.001, pz - 0.05, xc + side * 0.47 + 0.09, yt - 0.001, pz - 0.05, xc + side * 0.47 + 0.09, yt - 0.001, pz + 0.05, xc + side * 0.47 - 0.09, yt - 0.001, pz + 0.05], '#08050e', false);
  boxTop(g, cam, px, yt, pz, 0.045, 0.05, 0.035, look.knob, L);
  boxTop(g, cam, xc + side * 0.27, yt, pz, 0.05, 0.035 - st.reset * 0.02, 0.045, look.knob, L);
}

function boxTop(g, cam, x, yt, z, hw, hh, hd, col, L) {
  quad(g, cam, [x - hw, yt - hh, z - hd, x + hw, yt - hh, z - hd, x + hw, yt, z - hd, x - hw, yt, z - hd], lit(col, L.amb2, L.frontAdd), false);
  if (cam.x > x + hw) quad(g, cam, [x + hw, yt - hh, z - hd, x + hw, yt - hh, z + hd, x + hw, yt, z + hd, x + hw, yt, z - hd], lit(col, L.amb2, L.sideAdd), false);
  if (cam.x < x - hw) quad(g, cam, [x - hw, yt - hh, z + hd, x - hw, yt - hh, z - hd, x - hw, yt, z - hd, x - hw, yt, z + hd], lit(col, L.amb2, L.sideAdd), false);
  quad(g, cam, [x - hw, yt - hh, z - hd, x + hw, yt - hh, z - hd, x + hw, yt - hh, z + hd, x - hw, yt - hh, z + hd], lit(col, L.amb, L.topAdd), false);
}

// ---------------------------------------------------------------------------------------------
// cartridges
// ---------------------------------------------------------------------------------------------
// One cartridge, front on, in units of its own width: the bottom edge's centre is the origin.
export const CART_H = 0.82;
function cartPath(g) {
  g.beginPath();
  g.moveTo(-0.5, -0.04);
  g.lineTo(-0.5, -0.64);
  g.lineTo(-0.45, -0.69);
  g.lineTo(-0.45, -0.77);
  g.quadraticCurveTo(-0.45, -0.82, -0.4, -0.82);
  g.lineTo(0.4, -0.82);
  g.quadraticCurveTo(0.45, -0.82, 0.45, -0.77);
  g.lineTo(0.45, -0.69);
  g.lineTo(0.5, -0.64);
  g.lineTo(0.5, -0.04);
  g.quadraticCurveTo(0.5, 0, 0.46, 0);
  g.lineTo(-0.46, 0);
  g.quadraticCurveTo(-0.5, 0, -0.5, -0.04);
  g.closePath();
}

/**
 * Draw a cartridge with its bottom centre at (x, y), s CSS px per unit, turned by rot.
 * o: { shell (0..1 rgb), label (canvas), tilt, L (light triple), rim (added light), edge (-1|1 side
 * the thickness shows on), contacts (0..1), back (true: the back of the shell faces the lens) }
 */
export function drawCart(g, x, y, s, rot, o) {
  if (s < 0.5) return;
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  g.scale(s, s);
  const L = o.L, rim = o.rim;
  // thickness: the shell's side, just past one edge
  g.save();
  g.translate(o.edge * 0.045, -0.03);
  cartPath(g);
  g.fillStyle = lit(o.shell, L, null);
  g.fill();
  g.restore();
  g.fillStyle = 'rgba(0,0,0,0.35)';
  g.save(); g.translate(o.edge * 0.045, -0.03); cartPath(g); g.fill(); g.restore();
  cartPath(g);
  const sg = g.createLinearGradient(0, -0.82, 0, 0);
  sg.addColorStop(0, lit(o.shell, L, rim));
  sg.addColorStop(1, lit(o.shell, L, null));
  g.fillStyle = sg;
  g.fill();
  // grip ridges and the arrow that says which way is in
  g.strokeStyle = lit(o.shell, L, null, 0.9);
  g.lineWidth = 0.018;
  for (let i = 0; i < 5; i++) {
    const yy = -0.74 + i * 0.03;
    g.beginPath(); g.moveTo(-0.43, yy); g.lineTo(-0.3, yy); g.moveTo(0.3, yy); g.lineTo(0.43, yy); g.stroke();
  }
  g.fillStyle = 'rgba(0,0,0,0.25)';
  g.beginPath(); g.moveTo(-0.05, -0.76); g.lineTo(0.05, -0.76); g.lineTo(0, -0.7); g.closePath(); g.fill();
  if (o.back) {
    // screws and a moulded panel instead of a label
    g.fillStyle = 'rgba(0,0,0,0.25)';
    roundRect(g, -0.36, -0.6, 0.72, 0.46, 0.04); g.fill();
    g.fillStyle = lit([0.6, 0.6, 0.62], L, rim);
    for (const sx of [-0.25, 0.25]) { g.beginPath(); g.arc(sx, -0.37, 0.025, 0, Math.PI * 2); g.fill(); }
  } else if (o.label) {
    // recess, then the sticker
    g.fillStyle = 'rgba(0,0,0,0.3)';
    g.fillRect(-0.41, -0.635, 0.82, 0.53);
    g.save();
    g.rotate(o.tilt || 0);
    g.drawImage(o.label, -0.39, -0.62, 0.78, 0.49);
    // the sticker is lit like everything else: darken it to the room
    g.fillStyle = `rgba(5,3,14,${clamp(1 - o.labelLight, 0, 0.92)})`;
    g.fillRect(-0.39, -0.62, 0.78, 0.49);
    if (o.sheen > 0) {
      const lg = g.createLinearGradient(-0.39, -0.62, 0.2, -0.13);
      lg.addColorStop(0, `rgba(255,255,255,${0.18 * o.sheen})`); lg.addColorStop(0.5, 'rgba(255,255,255,0)');
      g.fillStyle = lg;
      g.fillRect(-0.39, -0.62, 0.78, 0.49);
    }
    g.restore();
  }
  // the edge connector: a dark mouth with gold fingers
  if (o.contacts > 0) {
    g.fillStyle = '#0a0610';
    g.fillRect(-0.38, -0.07, 0.76, 0.07);
    g.fillStyle = `rgba(230,180,80,${o.contacts})`;
    for (let i = 0; i < 18; i++) g.fillRect(-0.36 + i * 0.04, -0.055, 0.022, 0.05);
  }
  // rim light along the lit edge
  if (rim) {
    g.strokeStyle = css(rim, 0.55);
    g.lineWidth = 0.02;
    cartPath(g);
    g.stroke();
  }
  g.restore();
}

// ---------------------------------------------------------------------------------------------
// labels — baked once
// ---------------------------------------------------------------------------------------------
const LW = 640, LH = 402;
function paper(g, bg, seed, w = LW, h = LH) {
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  // fibre and a little grime
  let s = seed;
  const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const dark = luminance(bg) > 0.35;
  for (let i = 0; i < 260; i++) {
    g.fillStyle = dark ? `rgba(60,40,20,${0.04 + r() * 0.06})` : `rgba(255,255,255,${0.03 + r() * 0.04})`;
    g.fillRect(r() * w, r() * h, 1 + r() * 3, 1 + r() * 2);
  }
  const vg = g.createRadialGradient(w / 2, h / 2, h * 0.3, w / 2, h / 2, w * 0.7);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(40,20,0,0.22)');
  g.fillStyle = vg;
  g.fillRect(0, 0, w, h);
}

/** Marker lettering: every letter a little off, like a hand wrote it. Returns the width used. */
export function handWrite(g, text, cx, cy, maxW, size, color, seed, weight = 700) {
  let px = size;
  g.font = `${weight} ${px}px ${HAND_FONT}`;
  let tw = g.measureText(text).width * 1.04;
  if (tw > maxW) { px = Math.max(8, (px * maxW) / tw); g.font = `${weight} ${px}px ${HAND_FONT}`; tw = g.measureText(text).width * 1.04; }
  let x = cx - tw / 2;
  g.fillStyle = color;
  g.textBaseline = 'middle';
  g.textAlign = 'left';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const h1 = Math.sin((i + 1) * 12.9898 + seed * 78.233) * 43758.5453, j = h1 - Math.floor(h1);
    const h2 = Math.sin((i + 1) * 39.346 + seed * 11.135) * 24634.6345, k = h2 - Math.floor(h2);
    const cw = g.measureText(ch).width * 1.04;
    g.save();
    g.translate(x + cw / 2, cy + (j - 0.5) * px * 0.1);
    g.rotate((k - 0.5) * 0.12);
    g.fillText(ch, -cw / 2, 0);
    g.restore();
    x += cw;
  }
  return { w: tw, px };
}

/** Split a title over two lines when it is long. */
function lines(title) {
  const t = String(title || '').toUpperCase().trim() || '???';
  if (t.length <= 11 || t.indexOf(' ') < 0) return [t];
  let best = [t], bestD = 1e9;
  for (let i = 1; i < t.length; i++) if (t[i] === ' ') { const d = Math.abs(i - (t.length - i)); if (d < bestD) { bestD = d; best = [t.slice(0, i), t.slice(i + 1)]; } }
  return best;
}

// A doodle for the top of a hand-made label, in the world's own colours.
function doodle(g, kind, x, y, w, h, ink, acc, seed) {
  g.save();
  g.lineCap = 'round'; g.lineJoin = 'round';
  g.strokeStyle = acc; g.fillStyle = acc;
  g.lineWidth = Math.max(3, h * 0.06);
  const cx = x + w / 2, cy = y + h / 2;
  let s = seed;
  const r = () => { s = (s * 16807 + 7) % 2147483647; return s / 2147483647; };
  if (kind === 'grid') {
    for (let i = 0; i <= 6; i++) { g.beginPath(); g.moveTo(x + (i / 6) * w, y + h); g.lineTo(cx + (i / 6 - 0.5) * w * 0.25, y + h * 0.35); g.stroke(); }
    for (let i = 0; i < 4; i++) { const yy = y + h * (0.4 + Math.pow(i / 3, 1.6) * 0.6); g.beginPath(); g.moveTo(x, yy); g.lineTo(x + w, yy); g.stroke(); }
    g.beginPath(); g.arc(cx, y + h * 0.3, h * 0.2, Math.PI, 0); g.fill();
  } else if (kind === 'blocks') {
    const bw = h * 0.32;
    [[-1.5, 0], [-0.5, 0], [0.5, 0], [-1, -1], [0, -1], [-0.5, -2]].forEach(([i, j], n) => {
      g.strokeStyle = n % 2 ? acc : ink;
      g.strokeRect(cx + i * bw * 1.05, y + h - bw + j * bw * 1.02 - 2, bw * 0.95, bw * 0.95);
    });
  } else if (kind === 'burst') {
    g.beginPath();
    for (let i = 0; i <= 18; i++) { const a = (i / 18) * Math.PI * 2, rr = (i % 2 ? 0.28 : 0.5) * h * (0.9 + r() * 0.2); g.lineTo(cx + Math.cos(a) * rr * 1.6, cy + Math.sin(a) * rr); }
    g.closePath(); g.stroke();
  } else if (kind === 'wave') {
    g.beginPath(); g.moveTo(x, y + h * 0.8);
    g.bezierCurveTo(x + w * 0.3, y + h * 0.9, x + w * 0.45, y + h * 0.1, x + w * 0.7, y + h * 0.25);
    g.bezierCurveTo(x + w * 0.85, y + h * 0.35, x + w * 0.72, y + h * 0.6, x + w * 0.62, y + h * 0.45);
    g.stroke();
    g.beginPath(); g.moveTo(x + w * 0.55, y + h * 0.95); g.quadraticCurveTo(x + w * 0.8, y + h * 0.7, x + w, y + h * 0.85); g.stroke();
  } else if (kind === 'speed') {
    for (let i = 0; i < 14; i++) { const a = (i / 14) * Math.PI * 2; g.beginPath(); g.moveTo(cx + Math.cos(a) * h * 0.2, cy + Math.sin(a) * h * 0.16); g.lineTo(cx + Math.cos(a) * h * 0.9, cy + Math.sin(a) * h * 0.55); g.stroke(); }
  } else if (kind === 'plane') {
    g.beginPath(); g.moveTo(cx - w * 0.3, cy); g.lineTo(cx + w * 0.3, cy); g.stroke();
    g.beginPath(); g.moveTo(cx - w * 0.05, cy - h * 0.38); g.lineTo(cx + w * 0.02, cy + h * 0.38); g.stroke();
    g.beginPath(); g.moveTo(cx - w * 0.28, cy - h * 0.18); g.lineTo(cx - w * 0.28, cy + h * 0.18); g.stroke();
    for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(cx + w * 0.34 + i * w * 0.05, cy - h * 0.25); g.lineTo(cx + w * 0.34 + i * w * 0.05, cy + h * 0.25); g.stroke(); }
  } else if (kind === 'prompt') {
    g.beginPath(); g.moveTo(cx - w * 0.2, cy - h * 0.3); g.lineTo(cx - w * 0.05, cy); g.lineTo(cx - w * 0.2, cy + h * 0.3); g.stroke();
    g.fillRect(cx + w * 0.02, cy + h * 0.22, w * 0.18, h * 0.1);
  } else if (kind === 'fish') {
    g.beginPath(); g.ellipse(cx, cy, w * 0.18, h * 0.28, 0, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.moveTo(cx + w * 0.17, cy); g.lineTo(cx + w * 0.32, cy - h * 0.25); g.lineTo(cx + w * 0.32, cy + h * 0.25); g.closePath(); g.stroke();
    g.beginPath(); g.arc(cx - w * 0.08, cy - h * 0.05, h * 0.05, 0, Math.PI * 2); g.fill();
  } else if (kind === 'mountains') {
    g.beginPath(); g.moveTo(x, y + h); g.lineTo(x + w * 0.3, y + h * 0.2); g.lineTo(x + w * 0.5, y + h * 0.6); g.lineTo(x + w * 0.7, y + h * 0.1); g.lineTo(x + w, y + h); g.stroke();
  } else if (kind === 'bolt') {
    g.beginPath(); g.moveTo(cx + w * 0.05, y); g.lineTo(cx - w * 0.1, cy + h * 0.05); g.lineTo(cx + w * 0.04, cy + h * 0.05); g.lineTo(cx - w * 0.08, y + h); g.lineTo(cx + w * 0.14, cy - h * 0.1); g.lineTo(cx, cy - h * 0.1); g.closePath(); g.fill();
  } else if (kind === 'cube') {
    const q = h * 0.42;
    g.beginPath(); g.moveTo(cx, cy - q); g.lineTo(cx + q, cy - q / 2); g.lineTo(cx + q, cy + q / 2); g.lineTo(cx, cy + q); g.lineTo(cx - q, cy + q / 2); g.lineTo(cx - q, cy - q / 2); g.closePath(); g.stroke();
    g.beginPath(); g.moveTo(cx - q, cy - q / 2); g.lineTo(cx, cy); g.lineTo(cx + q, cy - q / 2); g.moveTo(cx, cy); g.lineTo(cx, cy + q); g.stroke();
  } else { // stars
    for (let i = 0; i < 5; i++) {
      const sx = x + w * (0.1 + 0.8 * r()), sy = y + h * (0.15 + 0.7 * r()), rr = h * (0.1 + r() * 0.12);
      g.beginPath();
      for (let j = 0; j <= 10; j++) { const a = -Math.PI / 2 + (j / 10) * Math.PI * 2, q = j % 2 ? rr * 0.45 : rr; g.lineTo(sx + Math.cos(a) * q, sy + Math.sin(a) * q); }
      g.fill();
    }
  }
  g.restore();
}

const BY_ID = { neon: 'grid', toybox: 'blocks', comic: 'burst', surf: 'wave', manga: 'speed', ww2: 'plane', terminal: 'prompt', abyss: 'fish', valley: 'mountains', toon: 'stars', orbit: 'stars', arcade: 'grid', snow: 'mountains', heli: 'plane', worm: 'bolt', petri: 'stars', paper: 'cube', noir: 'bolt', tapestry: 'stars' };
function doodleFor(meta, rng) {
  if (BY_ID[meta.id]) return BY_ID[meta.id];
  const p = String(meta.perspective || '').toUpperCase();
  if (p.includes('TOP')) return 'grid';
  if (p.includes('ISO')) return 'cube';
  return ['stars', 'bolt', 'mountains', 'cube'][Math.floor(rng() * 4)];
}

/** The next world's cartridge: its name in marker, in its own colours, with a doodle. */
export function bakeNewLabel(meta, rng, extra) {
  const { canvas, g } = makeCanvas(LW, LH);
  const pal = meta.palette || { bg: '#222', fg: '#fff', accent: '#f80' };
  const bg = pal.bg, acc = pal.accent;
  let ink = pal.fg;
  if (Math.abs(luminance(ink) - luminance(bg)) < 0.25) ink = luminance(bg) > 0.4 ? '#111' : '#fff';
  paper(g, bg, 1 + Math.floor(rng() * 9999));
  // a border scribbled round the edge
  g.strokeStyle = acc;
  g.lineWidth = 7;
  g.lineJoin = 'round';
  const j = () => (rng() - 0.5) * 8;
  g.beginPath(); g.moveTo(16 + j(), 16 + j()); g.lineTo(LW - 16 + j(), 18 + j()); g.lineTo(LW - 18 + j(), LH - 16 + j()); g.lineTo(18 + j(), LH - 18 + j()); g.closePath(); g.stroke();
  const kind = doodleFor(meta, rng);
  doodle(g, kind, LW * 0.2, 34, LW * 0.6, LH * 0.3, ink, acc, 1 + Math.floor(rng() * 9999));
  const ls = lines(meta.name);
  const seed = rng() * 10;
  const size = ls.length > 1 ? LH * 0.2 : LH * 0.25;
  const y0 = ls.length > 1 ? LH * 0.55 : LH * 0.62;
  // a shadow pass in the accent, then the ink: a marker gone over twice
  ls.forEach((ln, i) => handWrite(g, ln, LW / 2 + 4, y0 + i * size * 1.05 + 4, LW * 0.86, size, acc, seed));
  let tw = 0;
  ls.forEach((ln, i) => { tw = Math.max(tw, handWrite(g, ln, LW / 2, y0 + i * size * 1.05, LW * 0.86, size, ink, seed).w); });
  // underline swoosh
  const uy = y0 + (ls.length - 1) * size * 1.05 + size * 0.62;
  g.strokeStyle = acc; g.lineWidth = 6; g.lineCap = 'round';
  g.beginPath(); g.moveTo(LW / 2 - tw * 0.45, uy + 4); g.quadraticCurveTo(LW / 2, uy - 6, LW / 2 + tw * 0.48, uy + 2); g.stroke();
  if (extra) handWrite(g, extra.text, LW / 2, LH - 34, LW * 0.8, LH * 0.075, extra.color || ink, seed + 3, 600);
  return canvas;
}

/** The world it came out of: a proper printed label in its own pixel lettering, if it is the canyon. */
export function bakeOldLabel(meta) {
  const { canvas, g } = makeCanvas(LW, LH);
  if (meta.id === 'pixel') {
    // a tiny dusk in the canyon's sixteen colours, blown up pixel for pixel
    const W = 80, H = 50, s = LW / W;
    const sky = [PAL.ink, PAL.night, PAL.plum, PAL.orchid, PAL.rose, PAL.coral, PAL.peach];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const v = Math.min(6, 0.2 + 6.6 * Math.pow(y / 34, 1.5)), i0 = Math.floor(v);
      let c = bayer(x, y) / 16 < (v - i0 - 0.6) * 3 ? sky[Math.min(6, i0 + 1)] : sky[i0];
      const dx = x - 40, dy = y - 27, d = Math.hypot(dx, dy * 1.1);
      if (d < 11 && !(dy > 0 && (dy + 20) % 4 < 1.5)) c = dy < -4 ? PAL.cream : dy < 2 ? PAL.peach : PAL.coral;
      const mesa = 33 + Math.round(3 * Math.sin(x * 0.21) + 2 * Math.sin(x * 0.53 + 1));
      if (y > mesa) c = y < mesa + 2 ? PAL.orchid : PAL.plum;
      if (y > 41) c = (x + y) % 9 === 0 ? PAL.night : PAL.ink;
      g.fillStyle = c;
      g.fillRect(Math.floor(x * s), Math.floor(y * s), Math.ceil(s), Math.ceil(s));
    }
    // the title in the canyon's own 5x7 lettering, with its ink outline
    const tx = 'CARTRIDGE', ty = 'CANYON';
    const sc = Math.floor((LW * 0.9) / textWidth(tx));
    const yy = Math.round(LH * 0.06);
    drawText(g, tx, LW / 2 + sc, yy + sc, PAL.plum, sc, 'c');
    drawText(g, tx, LW / 2, yy, PAL.cream, sc, 'c', PAL.ink);
    drawText(g, ty, LW / 2 + sc, yy + sc * 9 + sc, PAL.plum, sc, 'c');
    drawText(g, ty, LW / 2, yy + sc * 9, PAL.cream, sc, 'c', PAL.ink);
    const sc2 = Math.max(2, Math.floor(sc / 2));
    drawText(g, '1-2 PLAYERS', LW / 2, LH - sc2 * 11, PAL.peach, sc2, 'c', PAL.ink);
  } else {
    const pal = meta.palette || { bg: '#222', fg: '#fff', accent: '#f80' };
    paper(g, pal.bg, 77);
    g.fillStyle = pal.accent;
    g.fillRect(0, LH * 0.7, LW, LH * 0.08);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = pal.fg;
    const ls = lines(meta.name);
    let px = LH * 0.2;
    g.font = `700 ${px}px 'Rajdhani', 'Futura', sans-serif`;
    const mw = Math.max(...ls.map((l) => g.measureText(l).width));
    if (mw > LW * 0.86) { px *= (LW * 0.86) / mw; g.font = `700 ${px}px 'Rajdhani', 'Futura', sans-serif`; }
    ls.forEach((l, i) => g.fillText(l, LW / 2, LH * 0.38 + (i - (ls.length - 1) / 2) * px));
  }
  return canvas;
}

const JOKES = ['RACING??', "DON'T TOUCH", 'GOLF 2', 'BOWLING (BROKEN)', 'MYSTERY', 'SPACE THING', 'COPY OF COPY', '???', 'NO SAVE', 'DEMO', 'BEST ONE', 'SCARY', 'FISHING', 'TENNIS?', 'DO NOT LEND', 'LEVEL 9 SAVE'];
const INKS = [['#f3e9d2', '#1b1b2a', '#d0453b'], ['#1d1d28', '#f2f2f2', '#ffd23f'], ['#c8e6f5', '#14233a', '#e2543b'], ['#f6d5e5', '#2a1430', '#3aa0c8'], ['#fff3a8', '#20201a', '#3a7d44'], ['#d8f0d0', '#122015', '#c84a8a']];
const SHELLS = ['#8c8896', '#5e5a66', '#3a3640', '#8a2e36', '#c9b25a', '#5b4a8a', '#7aa6a0'];

/** The heap: some lying flat, a few leaning upright; one of those is the next world. */
export function makePile(rng, newLabel, shellNew) {
  const jokes = JOKES.slice();
  const take = () => jokes.splice(Math.floor(rng() * jokes.length), 1)[0];
  const flat = [];
  const n = 4 + Math.floor(rng() * 4);
  for (let i = 0; i < n; i++) {
    const ink = INKS[Math.floor(rng() * INKS.length)];
    const { canvas, g } = makeCanvas(LW / 2, LH / 2);
    paper(g, ink[0], 3 + i * 31, LW / 2, LH / 2);
    handWrite(g, take(), LW / 4, LH / 4, LW * 0.44, LH * 0.15, ink[1], i * 3.3);
    g.strokeStyle = ink[2]; g.lineWidth = 4;
    g.beginPath(); g.moveTo(LW * 0.08, LH * 0.38); g.lineTo(LW * 0.42, LH * 0.37); g.stroke();
    flat.push({
      u: (rng() - 0.5) * 0.7, v: (rng() - 0.5) * 0.5, layer: i < 3 ? 0 : i < 5 ? 1 : 2, rot: (rng() - 0.5) * 1.6,
      shell: rgb01(SHELLS[Math.floor(rng() * SHELLS.length)]), label: canvas,
    });
  }
  flat.sort((a, b) => a.layer - b.layer || b.v - a.v);
  const lean = [];
  const nl = 2 + Math.floor(rng() * 2);
  const pickAt = Math.floor(rng() * nl);
  for (let i = 0; i < nl; i++) {
    let label = newLabel, shell = shellNew;
    if (i !== pickAt) {
      const ink = INKS[Math.floor(rng() * INKS.length)];
      const c = makeCanvas(LW / 2, LH / 2);
      paper(c.g, ink[0], 91 + i * 17, LW / 2, LH / 2);
      handWrite(c.g, take(), LW / 4, LH / 4, LW * 0.44, LH * 0.15, ink[1], i * 5.1 + 2);
      label = c.canvas;
      shell = rgb01(SHELLS[Math.floor(rng() * SHELLS.length)]);
    }
    lean.push({ du: (i - (nl - 1) / 2) * 0.34 + (rng() - 0.5) * 0.06, dz: -0.18 + (i % 2) * 0.08, rot: (rng() - 0.5) * 0.5, shell, label, chosen: i === pickAt, tilt: (rng() - 0.5) * 0.06 });
  }
  return { flat, lean, chosen: lean[pickAt] };
}

/** The flat part of the heap, in the floor's own plane. */
export function drawPileFlat(g, cam, X, Z, pile, L, P, extra) {
  const list = extra ? pile.flat.concat([extra]) : pile.flat;
  for (const c of list) {
    if (c.hidden) continue;
    const y = c.layer * 0.075;
    for (let pass = 0; pass < 2; pass++) {
      // lifted off the carpet: height is a straight screen offset at this depth
      const lift = (y + (pass ? 0.07 : 0)) * proj(cam, X + c.u, YF, Z + c.v, P).k;
      g.save();
      g.translate(0, -lift);
      floorFrame(g, cam, X + c.u, Z + c.v, P);
      g.rotate(c.rot);
      g.scale(0.6, -0.6);
      if (pass === 0) {
        g.fillStyle = 'rgba(0,0,0,0.5)';
        g.fillRect(-0.52, -0.84, 1.04, 0.86);
        g.fillStyle = lit(c.shell, L.amb2, L.sideAdd);
        g.fillRect(-0.5, -0.82, 1, 0.82);
      } else {
        g.fillStyle = lit(c.shell, L.amb, L.topAdd);
        g.fillRect(-0.5, -0.82, 1, 0.82);
        g.drawImage(c.label, -0.39, -0.62, 0.78, 0.49);
        g.fillStyle = `rgba(5,3,14,${clamp(1 - L.labelI * 0.8, 0, 0.9)})`;
        g.fillRect(-0.39, -0.62, 0.78, 0.49);
      }
      g.restore();
    }
  }
}

// ---------------------------------------------------------------------------------------------
// the pads
// ---------------------------------------------------------------------------------------------
export function makePads(rng, ctx) {
  const W = ctx.winner ? ctx.winner.index : -1;
  return [0, 1].map((i) => ({
    col: rgb01([ctx.winner, ctx.loser].find((p) => p && p.index === i)?.color || PLAYER_COLORS[i]),
    u: (i ? 0.75 : -0.75) + (rng() - 0.5) * 0.2,
    z: -2.35 - rng() * 0.25,
    rot: (rng() - 0.5) * 0.5 + (W >= 0 && i !== W ? (rng() < 0.5 ? 2.6 : -2.4) : 0),
    flipped: W >= 0 && i !== W, // the loser's pad, thrown down face first
    sag: rng(),
  }));
}

export function drawPads(g, cam, xc, side, pads, look, L, P) {
  for (let i = 0; i < 2; i++) {
    const p = pads[i];
    const X = xc + p.u;
    // the cord, lying on the carpet in a lazy curve back to its port
    const portX = xc + side * (-0.18 + i * 0.26);
    g.strokeStyle = 'rgba(6,4,10,0.95)';
    g.lineWidth = Math.max(1, proj(cam, X, YF, p.z, A).k * 0.018);
    g.lineCap = 'round';
    g.beginPath();
    for (let s = 0; s <= 12; s++) {
      const q = s / 12;
      const x = lerp(X, portX, q) + Math.sin(q * Math.PI) * (0.35 + p.sag * 0.3) * (i ? 1 : -1);
      const z = lerp(p.z + 0.1, CON.z0, q);
      const y = q > 0.92 ? YF - 0.1 * (q - 0.92) / 0.08 : YF;
      proj(cam, x, y, z, A);
      if (s === 0) g.moveTo(A.x, A.y); else g.lineTo(A.x, A.y);
    }
    g.stroke();
    g.save();
    floorFrame(g, cam, X, p.z, P);
    g.rotate(p.rot);
    g.scale(1, -1);
    const body = look.pad;
    g.fillStyle = 'rgba(0,0,0,0.45)';
    roundRect(g, -0.29, -0.11, 0.6, 0.25, 0.1); g.fill();
    g.fillStyle = lit(body, L.amb, p.flipped ? L.sideAdd : L.topAdd);
    roundRect(g, -0.3, -0.13, 0.6, 0.26, 0.11); g.fill();
    if (p.flipped) {
      g.fillStyle = 'rgba(0,0,0,0.3)';
      for (const sx of [-0.2, 0, 0.2]) { g.beginPath(); g.arc(sx, 0, 0.018, 0, Math.PI * 2); g.fill(); }
      g.fillStyle = lit(p.col, L.amb, L.topAdd);
      g.fillRect(-0.08, -0.05, 0.16, 0.1);
    } else {
      g.fillStyle = 'rgba(10,8,16,0.85)';
      g.fillRect(-0.24, -0.02, 0.12, 0.04); g.fillRect(-0.2, -0.06, 0.04, 0.12);
      g.fillStyle = lit(p.col, L.amb, L.topAdd);
      g.beginPath(); g.arc(0.14, 0.02, 0.035, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.arc(0.22, -0.03, 0.035, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(10,8,16,0.6)';
      g.fillRect(-0.06, -0.01, 0.05, 0.02); g.fillRect(0.01, -0.01, 0.05, 0.02);
    }
    g.restore();
  }
}

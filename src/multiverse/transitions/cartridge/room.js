// BLOW ON IT — the bedroom: a pinhole camera, the light in the room, and the set that stands
// still (wall, window, poster, carpet, the little television). World units: the TV's glass is
// one unit tall and as wide as the stage's aspect, centred on the origin at Z = 0; +Y is down,
// +Z goes away from the lens. Faces parallel to the lens are plain scaled 2D drawings, the rest
// are projected corners, so the set has real perspective without a 3D engine.
import { clamp, lerp, hexToRgb, roundRect } from '../../kit.js';

export const YF = 0.97; // the carpet
export const ZW = 1.75; // the wall behind the TV
export const TVB = { side: 0.2, top: 0.17, bot: 0.43, depth: 1.18, back: 0.6, r: 0.12, zf: -0.035 };

/** Pinhole projection: fills out {x, y, k (CSS px per unit at that depth), d}. */
export function proj(cam, X, Y, Z, out) {
  const d = Math.max(0.02, Z - cam.z);
  const k = cam.h / d;
  out.x = cam.w * cam.px + (X - cam.x) * k;
  out.y = cam.h * cam.py + (Y - cam.y) * k;
  out.k = k;
  out.d = d;
  return out;
}

/** The affine map of a small patch of floor around (X, Z): local u along X, v along Z (away from the lens). */
export function floorFrame(g, cam, X, Z, P) {
  proj(cam, X, YF, Z, P);
  const d = P.d, k = P.k;
  g.transform(k, 0, (-(X - cam.x) * k) / d, (-(YF - cam.y) * k) / d, P.x, P.y);
}

export const rgb01 = (hex) => { const c = hexToRgb(hex); return [c.r / 255, c.g / 255, c.b / 255]; };
const to255 = (v) => (v <= 0 ? 0 : v >= 1 ? 255 : Math.round(v * 255));
/** A base colour (0..1 triple) under a light (0..1+ triple), plus an optional second light. */
export function lit(base, L, add, a = 1) {
  const r = base[0] * (L[0] + (add ? add[0] : 0)), gg = base[1] * (L[1] + (add ? add[1] : 0)), b = base[2] * (L[2] + (add ? add[2] : 0));
  return a >= 1 ? `rgb(${to255(r)},${to255(gg)},${to255(b)})` : `rgba(${to255(r)},${to255(gg)},${to255(b)},${a})`;
}
export const css = (c, a = 1) => `rgba(${to255(c[0])},${to255(c[1])},${to255(c[2])},${clamp(a, 0, 1)})`;
export const mix3 = (a, b, t, out = [0, 0, 0]) => { out[0] = lerp(a[0], b[0], t); out[1] = lerp(a[1], b[1], t); out[2] = lerp(a[2], b[2], t); return out; };
export const scale3 = (a, s, out = [0, 0, 0]) => { out[0] = a[0] * s; out[1] = a[1] * s; out[2] = a[2] * s; return out; };
export const add3 = (a, b, out = [0, 0, 0]) => { out[0] = a[0] + b[0]; out[1] = a[1] + b[1]; out[2] = a[2] + b[2]; return out; };

const A = { x: 0, y: 0, k: 0, d: 0 }, B = { x: 0, y: 0, k: 0, d: 0 }, C = { x: 0, y: 0, k: 0, d: 0 }, D = { x: 0, y: 0, k: 0, d: 0 };

/** Fill a projected quad if it faces the lens. Returns false when it is turned away. */
export function quad(g, cam, p, fill, cull = true) {
  proj(cam, p[0], p[1], p[2], A); proj(cam, p[3], p[4], p[5], B); proj(cam, p[6], p[7], p[8], C); proj(cam, p[9], p[10], p[11], D);
  if (Math.min(A.d, B.d, C.d, D.d) < 0.08) return false; // at or behind the lens
  const area = (B.x - A.x) * (C.y - A.y) - (B.y - A.y) * (C.x - A.x) + (C.x - A.x) * (D.y - A.y) - (C.y - A.y) * (D.x - A.x);
  if (cull && area <= 0) return false;
  g.fillStyle = fill;
  g.beginPath();
  g.moveTo(A.x, A.y); g.lineTo(B.x, B.y); g.lineTo(C.x, C.y); g.lineTo(D.x, D.y);
  g.closePath();
  g.fill();
  return true;
}

/**
 * The set, decided once. side: which way the room opens (window, pile and the hand mirror with it).
 */
export function makeRoom(rng, side) {
  const pick = (a) => a[Math.floor(rng() * a.length)];
  const casing = pick([
    { body: '#2a2630', trim: '#45404f', knob: '#8f8899', name: 'charcoal' },
    { body: '#cfc6b4', trim: '#a89e8a', knob: '#5a5448', name: 'putty' },
    { body: '#8e2f35', trim: '#b2474c', knob: '#e8d6c0', name: 'red' },
  ]);
  const stars = [];
  for (let i = 0; i < 26; i++) stars.push([rng(), rng(), 0.3 + rng() * 0.7]);
  return {
    side,
    casing: { body: rgb01(casing.body), trim: rgb01(casing.trim), knob: rgb01(casing.knob), light: casing.name === 'putty' },
    wall: rgb01(pick(['#3b3260', '#2f3a5c', '#4a3150'])),
    carpet: rgb01(pick(['#5a3b5e', '#2e4f56', '#6a3a3a', '#3d4a3a'])),
    winX: side * (0.62 + rng() * 0.25), // window centre, in TV-screen widths from the middle
    moonX: 0.25 + rng() * 0.5, moonY: 0.2 + rng() * 0.25, moonPhase: rng() < 0.5 ? 0 : 0.35 + rng() * 0.3,
    stars,
    poster: pick(['valley', 'rocket', 'band']),
    posterTilt: (rng() - 0.5) * 0.08,
    antenna: [-(0.55 + rng() * 0.4), 0.55 + rng() * 0.4],
    knobs: rng() < 0.5,
    stripe: rgb01(pick(['#f0805a', '#40d8e8', '#ffc27d', '#c9607f'])),
  };
}

/** Wall, window, poster and the light on them. L = the frame's lights. */
export function drawWall(g, cam, room, L, a, w, h) {
  proj(cam, 0, YF, ZW, A);
  const wy = clamp(A.y, -10, h + 10);
  if (wy <= 0) return wy;
  const k = A.k;
  // the paint, darker toward the ceiling
  const gr = g.createLinearGradient(0, 0, 0, wy);
  gr.addColorStop(0, lit(room.wall, L.amb, null));
  gr.addColorStop(1, lit(room.wall, L.amb2, null));
  g.fillStyle = gr;
  g.fillRect(0, 0, w, wy);
  // wallpaper: thin stripes that only show where light falls
  proj(cam, 0, 0, ZW, B);
  const step = 0.36 * k;
  if (step > 3) {
    g.fillStyle = lit(room.wall, L.amb, null, 0.5);
    const x0 = B.x - Math.ceil(B.x / step) * step;
    for (let x = x0; x < w; x += step) g.fillRect(x, 0, Math.max(1, k * 0.025), wy);
  }
  // the window, on the open side of the room
  const wx = room.winX * (a * 0.5 + 1.6);
  const wx0 = wx - 0.75, wx1 = wx + 0.75, wyt = -2.3, wyb = -0.1;
  proj(cam, wx0, wyt, ZW, C); proj(cam, wx1, wyb, ZW, D);
  if (D.x > 0 && C.x < w) {
    const sky = g.createLinearGradient(0, C.y, 0, D.y);
    sky.addColorStop(0, '#0b1230');
    sky.addColorStop(1, '#1f2b5a');
    g.fillStyle = sky;
    g.fillRect(C.x, C.y, D.x - C.x, D.y - C.y);
    g.save();
    g.beginPath(); g.rect(C.x, C.y, D.x - C.x, D.y - C.y); g.clip();
    // rooftops far away, a few lit windows
    g.fillStyle = '#0a0d1e';
    const bw = (D.x - C.x) / 7;
    for (let i = 0; i < 7; i++) {
      const bh = (0.18 + ((i * 37) % 5) * 0.05) * (D.y - C.y);
      g.fillRect(C.x + i * bw, D.y - bh, bw * 1.02, bh);
      if (i % 2) { g.fillStyle = 'rgba(255,214,140,0.55)'; g.fillRect(C.x + i * bw + bw * 0.3, D.y - bh * 0.7, bw * 0.12, bw * 0.12); g.fillStyle = '#0a0d1e'; }
    }
    for (const s of room.stars) {
      g.fillStyle = `rgba(230,235,255,${s[2] * 0.8})`;
      const r = Math.max(0.6, k * 0.012 * s[2]);
      g.fillRect(C.x + s[0] * (D.x - C.x), C.y + s[1] * (D.y - C.y) * 0.6, r, r);
    }
    // the moon
    const mx = C.x + room.moonX * (D.x - C.x), my = C.y + room.moonY * (D.y - C.y), mr = k * 0.13;
    const halo = g.createRadialGradient(mx, my, mr * 0.5, mx, my, mr * 5);
    halo.addColorStop(0, 'rgba(190,210,255,0.35)');
    halo.addColorStop(1, 'rgba(190,210,255,0)');
    g.fillStyle = halo;
    g.fillRect(mx - mr * 5, my - mr * 5, mr * 10, mr * 10);
    g.fillStyle = '#e9edff';
    g.beginPath(); g.arc(mx, my, mr, 0, Math.PI * 2); g.fill();
    if (room.moonPhase > 0) {
      g.fillStyle = '#1a2450';
      g.beginPath(); g.arc(mx + mr * room.moonPhase * 1.6, my - mr * 0.2, mr * 0.95, 0, Math.PI * 2); g.fill();
    }
    g.restore();
    // frame and mullions, lit by the sky behind them
    const fw = Math.max(1.5, k * 0.06);
    g.fillStyle = lit([0.2, 0.2, 0.3], L.amb, L.moonAdd);
    g.fillRect(C.x - fw, C.y - fw, D.x - C.x + fw * 2, fw);
    g.fillRect(C.x - fw, D.y, D.x - C.x + fw * 2, fw * 1.6);
    g.fillRect(C.x - fw, C.y, fw, D.y - C.y);
    g.fillRect(D.x, C.y, fw, D.y - C.y);
    g.fillRect((C.x + D.x) / 2 - fw / 2, C.y, fw, D.y - C.y);
    g.fillRect(C.x, lerp(C.y, D.y, 0.45) - fw / 2, D.x - C.x, fw);
    // curtains: heavy folds either side
    for (const sx of [-1, 1]) {
      const cx = sx < 0 ? C.x - fw : D.x + fw, cw = (D.x - C.x) * 0.28;
      const x0 = sx < 0 ? cx - cw * 0.45 : cx - cw * 0.55;
      const cg = g.createLinearGradient(x0, 0, x0 + cw, 0);
      for (let i = 0; i <= 6; i++) cg.addColorStop(i / 6, i % 2 ? 'rgba(20,12,40,0.97)' : 'rgba(58,36,84,0.97)');
      g.fillStyle = cg;
      g.fillRect(x0, C.y - fw * 3, cw, D.y - C.y + fw * 9);
    }
  }
  // the poster on the other side
  drawPoster(g, cam, room, L, -room.side * (a * 0.5 + 1.05), w);
  // the TV's light thrown up the wall
  if (L.keyI > 0.01) {
    proj(cam, 0, -0.1, ZW, B);
    const R = B.k * 2.9;
    const spill = g.createRadialGradient(B.x, B.y, 0, B.x, B.y, R);
    spill.addColorStop(0, css(L.key, 0.55));
    spill.addColorStop(0.45, css(L.key, 0.16));
    spill.addColorStop(1, css(L.key, 0));
    g.globalCompositeOperation = 'lighter';
    g.fillStyle = spill;
    g.fillRect(B.x - R, B.y - R, R * 2, Math.min(R * 2, wy - (B.y - R)));
    g.globalCompositeOperation = 'source-over';
  }
  // skirting board
  proj(cam, 0, YF - 0.11, ZW, B);
  g.fillStyle = lit(room.wall, L.amb2, null);
  g.fillRect(0, B.y, w, wy - B.y);
  g.fillStyle = 'rgba(255,255,255,0.05)';
  g.fillRect(0, B.y, w, Math.max(1, k * 0.012));
  return wy;
}

function drawPoster(g, cam, room, L, X, w) {
  proj(cam, X - 0.55, -1.75, ZW, C); proj(cam, X + 0.55, -0.35, ZW, D);
  if (D.x < 0 || C.x > w) return;
  const cx = (C.x + D.x) / 2, cy = (C.y + D.y) / 2, pw = D.x - C.x, ph = D.y - C.y;
  g.save();
  g.translate(cx, cy);
  g.rotate(room.posterTilt);
  const dim = L.amb;
  g.fillStyle = 'rgba(0,0,0,0.35)';
  g.fillRect(-pw / 2 + pw * 0.03, -ph / 2 + pw * 0.04, pw, ph);
  if (room.poster === 'valley') {
    // the mountain duel this all started from, as a souvenir
    const sky = g.createLinearGradient(0, -ph / 2, 0, ph / 2);
    sky.addColorStop(0, lit([0.95, 0.6, 0.4], dim, null)); sky.addColorStop(1, lit([0.4, 0.5, 0.8], dim, null));
    g.fillStyle = sky; g.fillRect(-pw / 2, -ph / 2, pw, ph);
    g.fillStyle = lit([0.25, 0.3, 0.45], dim, null);
    g.beginPath(); g.moveTo(-pw / 2, ph * 0.2); g.lineTo(-pw * 0.2, -ph * 0.15); g.lineTo(0, ph * 0.05); g.lineTo(pw * 0.25, -ph * 0.25); g.lineTo(pw / 2, ph * 0.1); g.lineTo(pw / 2, ph / 2); g.lineTo(-pw / 2, ph / 2); g.fill();
    g.fillStyle = lit([0.15, 0.2, 0.3], dim, null);
    g.beginPath(); g.moveTo(-pw / 2, ph * 0.38); g.lineTo(-pw * 0.05, ph * 0.18); g.lineTo(pw / 2, ph * 0.35); g.lineTo(pw / 2, ph / 2); g.lineTo(-pw / 2, ph / 2); g.fill();
  } else if (room.poster === 'rocket') {
    g.fillStyle = lit([0.1, 0.12, 0.3], dim, null); g.fillRect(-pw / 2, -ph / 2, pw, ph);
    g.fillStyle = lit([0.95, 0.9, 0.8], dim, null);
    g.beginPath(); g.moveTo(0, -ph * 0.38); g.quadraticCurveTo(pw * 0.16, -ph * 0.1, pw * 0.1, ph * 0.18); g.lineTo(-pw * 0.1, ph * 0.18); g.quadraticCurveTo(-pw * 0.16, -ph * 0.1, 0, -ph * 0.38); g.fill();
    g.fillStyle = lit([0.95, 0.45, 0.3], dim, null);
    g.beginPath(); g.moveTo(-pw * 0.08, ph * 0.2); g.lineTo(0, ph * 0.4); g.lineTo(pw * 0.08, ph * 0.2); g.fill();
  } else {
    g.fillStyle = lit([0.85, 0.25, 0.35], dim, null); g.fillRect(-pw / 2, -ph / 2, pw, ph);
    g.fillStyle = lit([0.1, 0.05, 0.1], dim, null);
    g.beginPath(); g.arc(0, ph * 0.02, pw * 0.3, 0, Math.PI * 2); g.fill();
    g.fillStyle = lit([0.95, 0.85, 0.3], dim, null);
    g.fillRect(-pw * 0.38, -ph * 0.42, pw * 0.76, ph * 0.1);
  }
  // tape on the corners
  g.fillStyle = lit([0.9, 0.85, 0.7], dim, null, 0.8);
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
    g.save(); g.translate((sx * pw) / 2, (sy * ph) / 2); g.rotate(sx * sy * 0.7); g.fillRect(-pw * 0.07, -pw * 0.025, pw * 0.14, pw * 0.05); g.restore();
  }
  g.restore();
}

/** The carpet: base, the pool of light in front of the tube, the moonlight from the window. */
export function drawFloor(g, cam, room, L, a, wy, w, h, P) {
  if (wy >= h) return;
  const gr = g.createLinearGradient(0, Math.max(0, wy), 0, h);
  gr.addColorStop(0, lit(room.carpet, L.amb2, null));
  gr.addColorStop(1, lit(room.carpet, L.amb, null));
  g.fillStyle = gr;
  g.fillRect(0, Math.max(0, wy), w, h - Math.max(0, wy));
  // moonlight lying on the carpet: the window's panes, stretched toward the lens
  const wx = room.winX * (a * 0.5 + 1.6);
  if (L.moonI > 0) {
    g.save();
    floorFrame(g, cam, wx - room.side * 0.6, ZW - 0.1, P);
    g.globalCompositeOperation = 'lighter';
    const mg = g.createLinearGradient(0, 0, -room.side * 1.2, -2.6);
    mg.addColorStop(0, css(L.moon, 0.13 * L.moonI));
    mg.addColorStop(1, css(L.moon, 0));
    g.fillStyle = mg;
    g.beginPath();
    g.moveTo(-0.7, 0); g.lineTo(0.7, 0); g.lineTo(0.7 - room.side * 1.2, -2.6); g.lineTo(-0.7 - room.side * 1.2, -2.6); g.closePath();
    g.fill();
    g.restore();
  }
  // the pool of the tube's light
  if (L.keyI > 0.01) {
    g.save();
    floorFrame(g, cam, 0, -0.15, P);
    const R = 2.6;
    const pool = g.createRadialGradient(0, 0, 0, 0, 0, R);
    pool.addColorStop(0, css(L.key, 0.85));
    pool.addColorStop(0.35, css(L.key, 0.35));
    pool.addColorStop(1, css(L.key, 0));
    g.globalCompositeOperation = 'lighter';
    g.fillStyle = pool;
    g.fillRect(-R, -R, R * 2, R * 2);
    g.restore();
  }
}

/** The little television: tapered housing, bezel, knobs, rabbit ears. Leaves the glass for the GL layer. */
export function drawTV(g, cam, room, L, a, off) {
  const c = room.casing, sw = a / 2;
  const x0 = -sw - TVB.side + off.x, x1 = sw + TVB.side + off.x, y0 = -0.5 - TVB.top + off.y, y1 = 0.5 + TVB.bot + off.y, zf = TVB.zf;
  const bs = TVB.back, by = 0.12 + off.y, zb = TVB.depth;
  const bx0 = off.x + (x0 - off.x) * bs, bx1 = off.x + (x1 - off.x) * bs, by0 = by + (y0 - by) * bs, by1 = by + (y1 - by) * bs;
  // rabbit ears first: they stand behind the housing's top
  proj(cam, off.x, by0 + 0.02, zb * 0.55, A);
  for (const ex of room.antenna) {
    proj(cam, off.x + ex, by0 - 1.25, zb * 0.6, B);
    const lw = Math.max(1, A.k * 0.022);
    g.strokeStyle = lit([0.55, 0.55, 0.62], L.amb, L.moonAdd);
    g.lineWidth = lw;
    g.lineCap = 'round';
    g.beginPath(); g.moveTo(A.x, A.y); g.lineTo(B.x, B.y); g.stroke();
    g.strokeStyle = css(L.key, 0.35);
    g.lineWidth = lw * 0.5;
    g.beginPath(); g.moveTo(A.x, A.y); g.lineTo(B.x, B.y); g.stroke();
    g.fillStyle = lit([0.7, 0.7, 0.75], L.amb, L.moonAdd);
    g.beginPath(); g.arc(B.x, B.y, lw * 1.4, 0, Math.PI * 2); g.fill();
  }
  g.fillStyle = lit(c.trim, L.amb, null);
  g.beginPath(); g.ellipse(A.x, A.y, A.k * 0.16, A.k * 0.07, 0, Math.PI, 0); g.fill();
  // housing: top and sides, tapering back to the tube's neck
  const top = lit(c.body, L.amb, L.moonAdd), sideL = lit(c.body, L.amb2, null);
  if (cam.y < y0) quad(g, cam, [x0, y0, zf, x1, y0, zf, bx1, by0, zb, bx0, by0, zb], top, false);
  // a side shows only to a lens out past it (the taper lets it show a little sooner)
  if (cam.x > bx1) quad(g, cam, [x1, y0, zf, x1, y1, zf, bx1, by1, zb, bx1, by0, zb], sideL, false);
  if (cam.x < bx0) quad(g, cam, [x0, y1, zf, x0, y0, zf, bx0, by0, zb, bx0, by1, zb], sideL, false);
  // the front
  proj(cam, x0, y0, zf, A); proj(cam, x1, y1, zf, B);
  const k = A.k, r = TVB.r * k;
  const fg = g.createLinearGradient(0, A.y, 0, B.y);
  fg.addColorStop(0, lit(c.body, L.amb, L.bezelAdd));
  fg.addColorStop(1, lit(c.body, L.amb2, null));
  g.fillStyle = fg;
  roundRect(g, A.x, A.y, B.x - A.x, B.y - A.y, r);
  g.fill();
  g.strokeStyle = lit(c.trim, L.amb, L.bezelAdd);
  g.lineWidth = Math.max(1, k * 0.012);
  roundRect(g, A.x + k * 0.02, A.y + k * 0.02, B.x - A.x - k * 0.04, B.y - A.y - k * 0.04, r * 0.8);
  g.stroke();
  // feet
  g.fillStyle = 'rgba(5,3,10,0.9)';
  g.fillRect(A.x + k * 0.12, B.y - 1, k * 0.22, k * 0.04 + 1);
  g.fillRect(B.x - k * 0.34, B.y - 1, k * 0.22, k * 0.04 + 1);
  // the bottom panel: grille on one side, knobs and the LED on the other
  const py = B.y - TVB.bot * k + k * 0.06, ph = TVB.bot * k - k * 0.12;
  const gs = room.side, gx0 = gs > 0 ? A.x + k * 0.14 : B.x - k * 0.14 - k * 0.9;
  g.fillStyle = lit(c.body, L.amb2, null, 1);
  for (let i = 0; i < 6; i++) {
    g.fillStyle = 'rgba(5,3,12,0.55)';
    g.fillRect(gx0, py + ph * (0.12 + i * 0.14), k * 0.9, Math.max(1, ph * 0.06));
  }
  const kx = gs > 0 ? B.x - k * 0.32 : A.x + k * 0.32;
  for (let i = 0; i < 2; i++) {
    const cx = kx - gs * i * k * 0.3, cy = py + ph * 0.45, kr = k * (i ? 0.09 : 0.11);
    g.fillStyle = 'rgba(0,0,0,0.5)';
    g.beginPath(); g.arc(cx + kr * 0.15, cy + kr * 0.2, kr, 0, Math.PI * 2); g.fill();
    g.fillStyle = lit(c.knob, L.amb, L.bezelAdd);
    g.beginPath(); g.arc(cx, cy, kr, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.45)';
    g.lineWidth = Math.max(1, kr * 0.2);
    g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(i * 2 + 0.6) * kr * 0.8, cy + Math.sin(i * 2 + 0.6) * kr * 0.8); g.stroke();
  }
  // power LED
  const lx = kx - gs * k * 0.62, ly = py + ph * 0.45;
  g.fillStyle = '#ff5a3c';
  g.beginPath(); g.arc(lx, ly, Math.max(1, k * 0.018), 0, Math.PI * 2); g.fill();
  const led = g.createRadialGradient(lx, ly, 0, lx, ly, k * 0.08);
  led.addColorStop(0, 'rgba(255,90,60,0.6)'); led.addColorStop(1, 'rgba(255,90,60,0)');
  g.fillStyle = led; g.fillRect(lx - k * 0.08, ly - k * 0.08, k * 0.16, k * 0.16);
  // maker's badge — a made-up one
  if (k > 40) {
    g.font = `700 ${k * 0.055}px 'Rajdhani', 'Futura', sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = lit(c.trim, L.amb, L.bezelAdd);
    g.fillText('COLOR · 14', (A.x + B.x) / 2, py + ph * 0.45);
  }
  // the glass: a hole for the GL layer, with a recess around it
  proj(cam, -sw + off.x, -0.5 + off.y, 0, C); proj(cam, sw + off.x, 0.5 + off.y, 0, D);
  const gr = Math.max(2, k * 0.07);
  g.strokeStyle = 'rgba(3,2,8,0.85)';
  g.lineWidth = Math.max(2, k * 0.045);
  roundRect(g, C.x - k * 0.012, C.y - k * 0.012, D.x - C.x + k * 0.024, D.y - C.y + k * 0.024, gr * 1.15);
  g.stroke();
  g.globalCompositeOperation = 'destination-out';
  g.fillStyle = '#000';
  roundRect(g, C.x + 1, C.y + 1, D.x - C.x - 2, D.y - C.y - 2, gr);
  g.fill();
  g.globalCompositeOperation = 'source-over';
  return { x0: C.x, y0: C.y, x1: D.x, y1: D.y, r: gr, k };
}

/** Glass reflections, drawn over the GL layer's picture (kept inside the glass). */
export function drawGlass(g, scr, L, dark, room) {
  const w = scr.x1 - scr.x0, h = scr.y1 - scr.y0;
  if (w < 4) return;
  g.save();
  roundRect(g, scr.x0, scr.y0, w, h, scr.r);
  g.clip();
  // a curved sheen across the top, stronger when the tube is dark
  const a = 0.05 + dark * 0.1;
  const sh = g.createLinearGradient(scr.x0, scr.y0, scr.x0 + w * 0.6, scr.y0 + h);
  sh.addColorStop(0, `rgba(220,230,255,${a * 1.6})`);
  sh.addColorStop(0.35, `rgba(220,230,255,${a * 0.3})`);
  sh.addColorStop(1, 'rgba(220,230,255,0)');
  g.fillStyle = sh;
  g.beginPath();
  g.moveTo(scr.x0, scr.y0);
  g.lineTo(scr.x0 + w * 0.7, scr.y0);
  g.quadraticCurveTo(scr.x0 + w * 0.35, scr.y0 + h * 0.25, scr.x0, scr.y0 + h * 0.55);
  g.closePath();
  g.fill();
  // the window, reflected faintly in the dark glass
  if (dark > 0.01) {
    const rx = room.side > 0 ? scr.x0 + w * 0.68 : scr.x0 + w * 0.12, ry = scr.y0 + h * 0.12;
    g.fillStyle = `rgba(150,170,255,${0.08 * dark})`;
    g.fillRect(rx, ry, w * 0.09, h * 0.3);
    g.fillRect(rx + w * 0.1, ry, w * 0.09, h * 0.3);
  }
  g.restore();
}

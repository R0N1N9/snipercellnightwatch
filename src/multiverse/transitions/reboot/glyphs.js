// KERNEL PANIC — the character generator. Every letter the film shows is a cell of one atlas,
// baked once in the terminal world's own typeface at twice the size a cell is drawn (so the
// shader's bilinear read is a clean 2:1 box filter). Block and box-drawing glyphs are drawn
// procedurally and run into the padding so neighbouring cells join without seams, the way a
// real character ROM's line glyphs touch the cell edges.
import { FONT } from '../../dimensions/terminal/look.js';

export const NX = 16, NY = 12, SLOTS = NX * NY;
// Index 0 is the blank cell. The two density ramps come first so the shader can find them.
export const RAMPS = [' .:-=+*#%@', ' .,:;ox%#@', ' ·░▒▓█'];
const BASE = ' .:-=+*#%@,;ox·░▒▓█!"$&\'()/0123456789<>?ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwyz{|}~' +
  '▀▄▌▐─│┌┐└┘├┤┬┴┼═║╔╗╚╝╟╢╠╣▶◀▲▼×…•■□→←↑↓⏎✓';

const BOX = { // [up, down, left, right] weight: 1 single, 2 double
  '─': [0, 0, 1, 1], '│': [1, 1, 0, 0], '┌': [0, 1, 0, 1], '┐': [0, 1, 1, 0], '└': [1, 0, 0, 1], '┘': [1, 0, 1, 0],
  '├': [1, 1, 0, 1], '┤': [1, 1, 1, 0], '┬': [0, 1, 1, 1], '┴': [1, 0, 1, 1], '┼': [1, 1, 1, 1],
  '═': [0, 0, 2, 2], '║': [2, 2, 0, 0], '╔': [0, 2, 0, 2], '╗': [0, 2, 2, 0], '╚': [2, 0, 0, 2], '╝': [2, 0, 2, 0],
  '╟': [2, 2, 0, 1], '╢': [2, 2, 1, 0], '╠': [2, 2, 0, 2], '╣': [2, 2, 2, 0],
};

export function makeGlyphs() {
  const chars = [];
  const index = new Map();
  const add = (ch) => {
    if (index.has(ch) || chars.length >= SLOTS) return;
    index.set(ch, chars.length);
    chars.push(ch);
  };
  for (const ch of BASE) add(ch);
  const canvas = document.createElement('canvas');
  const G = {
    canvas, chars, index, version: 0, cw: 0, ch: 0, pad: 0, font: false,
    /** Make room for any character a name brings with it (callsigns are not always ASCII). */
    learn(str) { for (const ch of String(str)) if (!index.has(ch)) add(ch); },
    code(ch) { const i = index.get(ch); return i === undefined ? index.get('?') : i; },
    /** Bake the atlas for cells of cw x ch device pixels (already doubled by the caller). */
    bake(cw, ch) {
      cw = Math.max(4, Math.round(cw)); ch = Math.max(8, Math.round(ch));
      const pad = Math.max(2, Math.round(cw * 0.12));
      let fontOk = false;
      try { fontOk = !!(document.fonts && document.fonts.check('500 12px "JetBrains Mono"')); } catch { fontOk = true; }
      if (cw === G.cw && ch === G.ch && fontOk === G.font) return false;
      G.cw = cw; G.ch = ch; G.pad = pad; G.font = fontOk;
      const sw = cw + pad * 2, sh = ch + pad * 2;
      canvas.width = Math.min(4096, NX * sw);
      canvas.height = Math.min(4096, NY * sh);
      const g = canvas.getContext('2d');
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.fillStyle = '#000';
      g.fillRect(0, 0, canvas.width, canvas.height);
      // Size the face so its advance fills the cell: fallback monospace faces differ in width.
      let fs = ch / 1.3;
      g.font = `600 ${fs}px ${FONT}`;
      const adv = g.measureText('M').width || fs * 0.6;
      fs = Math.min(fs * (cw * 0.98) / adv, ch / 1.12);
      g.font = `600 ${fs}px ${FONT}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillStyle = '#fff';
      for (let i = 0; i < chars.length; i++) {
        const x0 = (i % NX) * sw + pad, y0 = Math.floor(i / NX) * sh + pad;
        drawGlyph(g, chars[i], x0, y0, cw, ch, pad, fs);
      }
      G.version++;
      return true;
    },
  };
  return G;
}

function drawGlyph(g, c, x, y, w, h, pad, fs) {
  if (c === ' ') return;
  const box = BOX[c];
  if (box) {
    // Lines reach through the padding so the bilinear read at the cell edge stays solid.
    const t = Math.max(1, Math.round(w * 0.11)), cx = x + w / 2, cy = y + h / 2, gap = t * 2.6;
    const v = (x1, y1, x2, y2) => g.fillRect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1) || t, Math.abs(y2 - y1) || t);
    const arm = (k, dir) => {
      const offs = k === 2 ? [-gap / 2, gap / 2] : [0];
      for (const o of offs) {
        if (dir === 0) v(cx - t / 2 + o, y - pad, cx - t / 2 + o, cy + t / 2 + (k === 2 ? gap / 2 : 0));
        if (dir === 1) v(cx - t / 2 + o, cy - t / 2 - (k === 2 ? gap / 2 : 0), cx - t / 2 + o, y + h + pad);
        if (dir === 2) v(x - pad, cy - t / 2 + o, cx + t / 2 + (k === 2 ? gap / 2 : 0), cy - t / 2 + o);
        if (dir === 3) v(cx - t / 2 - (k === 2 ? gap / 2 : 0), cy - t / 2 + o, x + w + pad, cy - t / 2 + o);
      }
    };
    for (let d = 0; d < 4; d++) if (box[d]) arm(box[d], d);
    return;
  }
  switch (c) {
    case '█': g.fillRect(x - pad, y - pad, w + pad * 2, h + pad * 2); return;
    case '▀': g.fillRect(x - pad, y - pad, w + pad * 2, h / 2 + pad); return;
    case '▄': g.fillRect(x - pad, y + h / 2, w + pad * 2, h / 2 + pad); return;
    case '▌': g.fillRect(x - pad, y - pad, w / 2 + pad, h + pad * 2); return;
    case '▐': g.fillRect(x + w / 2, y - pad, w / 2 + pad, h + pad * 2); return;
    case '░': case '▒': case '▓': {
      // Dot screens on a 4 x 8 lattice, the way shade glyphs sit in a character ROM.
      const dx = w / 4, dy = h / 8, d = c === '░' ? 1 : c === '▒' ? 2 : 3;
      for (let j = 0; j < 8; j++) {
        for (let i = 0; i < 4; i++) {
          const on = d === 2 ? (i + j) % 2 === 0 : d === 1 ? (i % 2 === 0 && j % 2 === 0) || (i % 2 === 1 && j % 4 === 2) : !(i % 2 === 1 && j % 2 === 1);
          if (on) g.fillRect(x + i * dx, y + j * dy, Math.ceil(dx), Math.ceil(dy));
        }
      }
      return;
    }
    case '■': g.fillRect(x + w * 0.14, y + h * 0.3, w * 0.72, h * 0.4); return;
    default: g.fillText(c, x + w / 2, y + h * 0.5 + fs * 0.04);
  }
}

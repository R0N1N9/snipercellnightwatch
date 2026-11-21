// KERNEL PANIC — the text-mode screen: a grid of character cells in a small data texture the
// shader reads (glyph, colour, intensity, background), plus one attribute per row for
// double- and triple-height lines. Lines are compiled once into typed arrays, so a frame only
// copies bytes: no strings are built while the film plays.

// palette slots (the shader's 16-colour table)
export const C = { INK: 0, MID: 1, HI: 2, LO: 3, DIM: 4, WARN: 5, WIN: 6, LOSE: 7, TOA: 8, TOF: 9, TOB: 10, WHITE: 11, ON_TOA: 12, P0: 13, P1: 14, ERR: 15 };
// flags, high nibble of the colour byte
export const F = { INV: 1, BAR: 2, BLINK: 4 };
export const MAXC = 256, MAXR = 128;

/**
 * A span is [text, colour, intensity 0..1, flags]. Lines: { spans, scale, fill } where fill
 * pads the line with inverse blanks to the full width (a header bar).
 */
export function compileLine(glyphs, spans, opt = {}) {
  let n = 0;
  for (const s of spans) n += [...String(s[0])].length;
  const L = {
    n, scale: opt.scale || 1, fill: opt.fill ?? -1, fillCol: opt.fillCol ?? C.MID, center: !!opt.center, bg: opt.bg ?? 1,
    g: new Uint8Array(Math.max(1, n)), c: new Uint8Array(Math.max(1, n)), i: new Uint8Array(Math.max(1, n)),
    shown: n, // how many characters to draw (typing / deleting)
  };
  let k = 0;
  for (const s of spans) {
    const col = s[1] ?? C.MID, int = Math.round(255 * Math.max(0, Math.min(1, s[2] ?? 1))), fl = s[3] || 0;
    for (const ch of String(s[0])) { L.g[k] = glyphs.code(ch); L.c[k] = (col & 15) | (fl << 4); L.i[k] = int; k++; }
  }
  return L;
}

/** Overwrite characters of a compiled line in place (counters, countdowns). */
export function poke(glyphs, L, at, str) {
  let k = at;
  for (const ch of str) { if (k >= L.n) break; L.g[k++] = glyphs.code(ch); }
}

export function makeScreen() {
  const data = new Uint8Array(MAXC * MAXR * 4);
  const rows = new Uint8Array(MAXR * 4);
  const S = {
    data, rows, cols: 80, nrows: 24, dirty: true,
    clear() { data.fill(0); rows.fill(0); for (let r = 0; r < MAXR; r++) { rows[r * 4] = 1; rows[r * 4 + 2] = 128; } S.dirty = true; },
    cell(c, r, glyph, col, int, bg) {
      if (c < 0 || r < 0 || c >= MAXC || r >= MAXR) return;
      const o = (r * MAXC + c) * 4;
      data[o] = glyph; data[o + 1] = col; data[o + 2] = int; data[o + 3] = bg;
    },
    /** Draw line L with its top at row r (it occupies L.scale rows); gain brightens a fresh line. */
    line(L, r, colOffset = 0, gain = 1) {
      const s = L.scale, width = Math.floor(S.cols / s);
      if (r + s <= 0 || r >= MAXR) return s;
      const shown = Math.min(L.shown, L.n, width);
      const x0 = L.center ? Math.max(0, Math.floor((width - L.n) / 2)) : colOffset;
      const bg = Math.round(255 * L.bg);
      for (let p = 0; p < s; p++) {
        const rr = r + p;
        if (rr < 0 || rr >= MAXR) continue;
        rows[rr * 4] = s; rows[rr * 4 + 1] = p; rows[rr * 4 + 2] = Math.min(255, Math.round(gain * 128));
        if (L.fill >= 0) for (let c = 0; c < width; c++) S.cell(c, rr, 0, L.fillCol | (F.INV << 4), 255, 255);
        for (let k = 0; k < shown; k++) {
          const c = x0 + k;
          if (c < 0) continue;
          if (c >= width) break;
          S.cell(c, rr, L.g[k], L.c[k], L.i[k], bg);
        }
      }
      S.dirty = true;
      return s;
    },
  };
  S.clear();
  return S;
}

// KERNEL PANIC — TTY DUEL's own way out.
//
// CONCEPT
//   The terminal world IS a computer, so a kill there does what killing a process does: the
//   program crashes, and then the whole machine does. The last frame freezes; its cells come
//   apart into glitch glyphs and ASCII shading spreading from the body, columns of characters
//   drip down the glass. The system prints its fault in the world's own typeface and phosphor:
//   a segmentation fault naming the loser, then a kernel panic whose backtrace is the story of
//   the kill (the winner's moves, the rifle at that range, the loser's last mistake), a hex
//   dump whose ASCII column spells a taunt, and a countdown that runs faster than seconds. The
//   tube collapses to a line and a dot. Black; a relay clicks. An original firmware runs its
//   power-on self test (2 snipers found, the score kept in CMOS), offers a boot menu of
//   dimensions, skips past a few, and boots the next world by name. Its loader bar is drawn in
//   block characters — and those blocks turn out to be the first row of the next world: the
//   screen scrolls, the bar becomes the top row of the picture, the rows under it print as
//   ASCII art, and cell by cell the text refines into the real picture as the glass flattens.
//   The old world went out as text; the new one comes in as text.
//
// BEAT SHEET (8.8 s, swap at 3.70 s)
//   0.00         the kill's last frame, untouched
//   0.12 → 1.10  the freeze: corruption spreads from the impact point (glitch glyphs, then ASCII
//                shading), rows slip, columns drip; a stuck buzz, crunches
//   0.34         "Segmentation fault: <LOSER> ..." prints over the picture; 0.56 (core dumped)
//   1.00 → 2.1   KERNEL PANIC: the header bar, cause (winner -> loser · kill label), the
//                backtrace, the core dump with the taunt in its ASCII column; the picture dims
//   2.1 → 3.12   "rebooting in 3 … 2 … 1" (the countdown is quicker than seconds)
//   3.12 → 3.62  the tube collapses: a line (3.24), a dot (3.38), the dot fades
//   3.70         THE SWAP, in the black
//   3.86         the relay clicks
//   4.00         power on: the raster opens, the degauss wobble and hum
//   4.12 → 5.40  the firmware's self test: memory counts up (one beep), devices, "2 snipers
//                found.", the score from CMOS, MATCH POINT when it is
//   5.50 → 6.72  the boot menu: the old world (core dumped) refuses, the cursor skips past a few
//                dimensions (sometimes overshoots and comes back), lands on the next world; ⏎
//   6.82 → 7.50  the loader: the next world's name as a triple-height title, the bar fills with
//                blocks in the colours of the next world's top row
//   7.50 → 7.80  the screen scrolls: the bar rises to the top and becomes the picture's first row
//   7.78 → 8.16  the rows under it print as ASCII art of the next world
//   7.86 → 8.50  cell by cell the text refines into the real picture; the title backspaces away
//   8.20 → 8.60  the glass flattens: barrel, scanlines, bloom and mask fall away
//   8.60 → 8.78  the overlay fades off the live world; the last frame is clear
//
// AXES OF VARIATION (all drawn once from ctx.rng in create())
//   1. the crash: which columns drip, where they start and how fast, when rows slip, the
//      glitch glyphs, the drip density, the stuck buzz's pitch
//   2. the words of the panic: the segfault phrasing, the panic header, the backtrace (which of
//      the winner's and the loser's moves, how many, their order, how it ends), the taunt in
//      the dump, the reboot phrasing, pids, addresses, uptime
//   3. the firmware: its name and version, the size of memory it counts, its joke lines
//   4. the boot menu: which other dimensions are listed, their order and status, where the
//      next world sits, whether the cursor overshoots
//   5. the arrival: the ASCII ramp (classic / soft / block shading) and the order the cells
//      refine in (scatter, out from the centre, a diagonal sweep)
//
// CONTEXT
//   ctx.from / fromImage  the phosphor (amber or green) is read from the last frame itself, so
//                         the panic is in the same colour as the duel was; the frame is what
//                         comes apart; TTY DUEL heads the boot menu as "core dumped"
//   ctx.focus             the corruption spreads out from the impact point
//   winner / loser        named (in their identity colours) in the segfault, the cause line,
//                         the backtrace's function names, the taunt, the self test
//   ctx.how               the rifle's frame in the backtrace (rifle_bounce_once_47_cols ...),
//                         the cause line
//   score / matchPoint    the core dump taunt (sometimes), score.cmos in the self test,
//                         MATCH POINT blinking there
//   round                 the panic header / pid line, the firmware's version and boot count
//   ctx.to                name, perspective and tagline in the menu and the title; its palette
//                         lights the menu's cursor bar and the title before it arrives; its
//                         first frame fills the loader bar and then the screen
import { seg, ease, clamp, lerp, rand, pick, randInt, makeCanvas, canvasTexture, fullscreenPass, hexToRgb, mixHex, luminance } from '../kit.js';
import { makePalette } from '../dimensions/terminal/look.js';
import { makeGlyphs, NX, NY, RAMPS } from './reboot/glyphs.js';
import { makeScreen, C, F, MAXC, MAXR, poke } from './reboot/screen.js';
import { chooseScript, buildScript } from './reboot/script.js';
import { SCREEN_FRAG, DOWN_FRAG, TUBE_FRAG } from './reboot/shader.js';

const DURATION = 8.8;
const SWAP_AT = 0.42;
const T = {
  cor0: 0.12, seg: 0.34, core: 0.56, panic: 1.0, panicEnd: 2.3,
  off: 3.12, line: 3.22, dot: 3.4, dark: 3.78, relay: 3.9, on: 4.04,
  post: 4.12, postEnd: 5.08, menu: 5.5, load: 6.82,
  bar0: 6.98, bar1: 7.5, scr0: 7.5, scr1: 7.8, rast0: 7.8, rast1: 8.16, ref0: 7.88, ref1: 8.36,
  untitle0: 8.08, untitle1: 8.4, crt0: 8.2, crt1: 8.6, fade0: 8.6, fade1: DURATION - 0.02,
};

// Which phosphor the duel was drawn in, read from the frame itself (one tiny read, once).
function readPhosphor(img) {
  try {
    const p = makeCanvas(32, 18);
    p.g.drawImage(img, 0, 0, 32, 18);
    const d = p.g.getImageData(0, 0, 32, 18).data;
    let r = 0, g = 0;
    for (let i = 0; i < d.length; i += 4) {
      const m = Math.max(d[i], d[i + 1], d[i + 2]);
      if (m > 50) { r += d[i] * m; g += d[i + 1] * m; }
    }
    p.canvas.width = p.canvas.height = 1;
    return r > g * 1.08;
  } catch { return false; }
}
// The picture's dark and bright luma (10th / 97th percentile), read once from a tiny copy.
function lumaRange(img) {
  try {
    const p = makeCanvas(48, 27);
    p.g.drawImage(img, 0, 0, 48, 27);
    const d = p.g.getImageData(0, 0, 48, 27).data, v = [];
    for (let i = 0; i < d.length; i += 4) v.push((0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255);
    p.canvas.width = p.canvas.height = 1;
    v.sort((a, b) => a - b);
    const lo = v[Math.floor(v.length * 0.1)], hi = v[Math.floor(v.length * 0.97)];
    return [Math.min(lo, 0.5), Math.max(hi, lo + 0.15)];
  } catch { return [0, 1]; }
}
// A colour that reads as text on near-black.
function legible(hex) {
  let c = hex;
  for (let i = 0; i < 6 && luminance(c) < 0.32; i++) c = mixHex(c, '#ffffff', 0.25);
  return c;
}

export default {
  id: 'reboot',
  name: 'KERNEL PANIC',
  duration: DURATION,
  swapAt: SWAP_AT,

  create(ctx) {
    const { THREE, renderer } = ctx.three;
    const A = ctx.audio, rng = ctx.rng;
    const amber = readPhosphor(ctx.fromImage);
    const P0 = '#f2b35b', P1 = '#40d8e8';
    const col0 = ctx.winner && ctx.winner.index === 0 ? ctx.winner.color : ctx.loser && ctx.loser.index === 0 ? ctx.loser.color : P0;
    const col1 = ctx.winner && ctx.winner.index === 1 ? ctx.winner.color : ctx.loser && ctx.loser.index === 1 ? ctx.loser.color : P1;
    const ph = makePalette(amber, col0, col1);
    const tp = ctx.to.palette || { bg: '#111', fg: '#eee', accent: '#8cf' };
    const tr = amber ? Math.pow(2, 5 / 12) : 1; // the amber monitor plays a fourth higher, as in the duel

    // --- decided once ------------------------------------------------------------------------
    const ch = chooseScript(rng, ctx);
    const shade = {
      seed: rand(rng, 1, 90), drip: rand(rng, 0.22, 0.5), spread: rand(rng, 0.8, 1.3),
      tears: [rand(rng, 0.2, 0.45), rand(rng, 0.6, 0.95), rand(rng, 1.3, 2.0), rand(rng, 2.3, 2.9)],
      ramp: randInt(rng, 0, RAMPS.length - 1), order: randInt(rng, 0, 2),
      buzz: pick(rng, [110, 120, 147, 98]) * tr, beep: pick(rng, [880, 988, 1046]) * tr,
      landNotes: pick(rng, [[660, 990], [784, 1175], [587, 880]]).map((f) => f * tr),
    };

    // --- the character generator and the screen ------------------------------------------------
    const G = makeGlyphs();
    for (const s of [ctx.winner && ctx.winner.name, ctx.loser && ctx.loser.name, ctx.to.name, ctx.to.tagline, ctx.to.perspective, ctx.from.name]) G.learn(s || '');
    G.learn(String(ctx.to.name || '').toUpperCase());
    G.learn(String(ctx.from.name || '').toUpperCase());
    const S = makeScreen();
    const lay = { w: 0, h: 0, cols: 80, rows: 24, cw: 8, ch: 16, dpr: 1 };
    let sc = null; // the compiled script
    function layout() {
      const w = Math.max(64, ctx.width), h = Math.max(64, ctx.height), dpr = ctx.dpr || 1;
      if (w === lay.w && h === lay.h && dpr === lay.dpr && sc) return;
      const f = clamp(Math.min(h * 0.036, w * 0.02), 10.5, 22);
      lay.w = w; lay.h = h; lay.dpr = dpr;
      lay.cols = clamp(Math.floor(w / (f * 0.6)), 40, MAXC);
      lay.rows = clamp(Math.floor(h / (f * 1.32)), 14, 60);
      lay.cw = w / lay.cols; lay.ch = h / lay.rows;
      S.cols = lay.cols; S.nrows = lay.rows;
      G.bake(lay.cw * dpr * 2, lay.ch * dpr * 2);
      sc = buildScript(ch, ctx, G, lay.cols, amber);
      timeLines();
    }

    // --- GPU -------------------------------------------------------------------------------------
    const texFrom = canvasTexture(THREE, ctx.fromImage, { srgb: false });
    let texTo = null;
    let atlas = null, atlasW = 0, atlasH = 0, U = null;
    function freshAtlas() {
      // a new size needs a new GL texture (its storage is allocated once)
      if (atlas && atlasW === G.canvas.width && atlasH === G.canvas.height) { atlas.needsUpdate = true; return; }
      if (atlas) atlas.dispose();
      atlas = canvasTexture(THREE, G.canvas, { srgb: false });
      atlas.flipY = false;
      atlasW = G.canvas.width; atlasH = G.canvas.height;
      if (U) U.tAtlas.value = atlas;
    }
    const cells = new THREE.DataTexture(S.data, MAXC, MAXR, THREE.RGBAFormat, THREE.UnsignedByteType);
    const rowsTex = new THREE.DataTexture(S.rows, MAXR, 1, THREE.RGBAFormat, THREE.UnsignedByteType);
    const palData = new Uint8Array(16 * 2 * 4);
    const palTex = new THREE.DataTexture(palData, 16, 2, THREE.RGBAFormat, THREE.UnsignedByteType);
    for (const t of [cells, rowsTex, palTex]) {
      t.minFilter = t.magFilter = THREE.NearestFilter;
      t.generateMipmaps = false;
      t.colorSpace = THREE.NoColorSpace;
      t.needsUpdate = true;
    }
    {
      const cols = [];
      cols[C.INK] = ph.bg; cols[C.MID] = ph.mid; cols[C.HI] = ph.hi; cols[C.LO] = ph.lo; cols[C.DIM] = ph.dim; cols[C.WARN] = ph.warn;
      cols[C.WIN] = ctx.winner ? ctx.winner.color : ph.warn; cols[C.LOSE] = ctx.loser ? ctx.loser.color : ph.mid;
      cols[C.TOA] = legible(tp.accent); cols[C.TOF] = legible(tp.fg); cols[C.TOB] = tp.bg; cols[C.WHITE] = '#f4fff6';
      cols[C.ON_TOA] = '#000'; cols[C.P0] = col0; cols[C.P1] = col1; cols[C.ERR] = '#ff5a48';
      for (let i = 0; i < 16; i++) { const c = hexToRgb(cols[i] || '#ffffff'); palData.set([c.r, c.g, c.b, 255], i * 4); }
      const ramp = RAMPS[shade.ramp];
      [...ramp].forEach((chr, i) => { palData[(16 + i) * 4] = G.code(chr); });
    }
    const V2 = (x = 0, y = 0) => new THREE.Vector2(x, y);
    const screen = fullscreenPass(THREE, {
      fragmentShader: SCREEN_FRAG,
      uniforms: {
        tFrom: { value: texFrom }, tTo: { value: texFrom }, tAtlas: { value: null }, tCells: { value: cells }, tRows: { value: rowsTex }, tPal: { value: palTex },
        uRes: { value: V2(1, 1) }, uCell: { value: V2(8, 16) }, uGrid: { value: V2(80, 24) }, uMax: { value: V2(MAXC, MAXR) },
        uAtlasN: { value: V2(NX, NY) }, uPad: { value: V2(0.1, 0.05) },
        uK: { value: 1 }, uT: { value: 0 }, uSeed: { value: shade.seed }, uScroll: { value: 0 }, uTextK: { value: 1 },
        uFromK: { value: 1 }, uFromBright: { value: 1 }, uCor0: { value: T.cor0 }, uSpread: { value: shade.spread }, uDrip: { value: 0 }, uTear: { value: 0 }, uGlyphK: { value: 1 },
        uFocus: { value: V2(ctx.focus.x, ctx.focus.y) }, uFromRange: { value: V2(...lumaRange(ctx.fromImage)) }, uToRange: { value: V2(0, 1) },
        uToK: { value: 0 }, uRast0: { value: T.rast0 }, uRastRate: { value: 0.02 }, uRef0: { value: T.ref0 }, uRefSpan: { value: T.ref1 - T.ref0 },
        uOrder: { value: shade.order }, uRampN: { value: RAMPS[shade.ramp].length }, uBlock: { value: G.code('█') },
      },
    });
    const down = fullscreenPass(THREE, { fragmentShader: DOWN_FRAG, uniforms: { tSrc: { value: null }, uTexel: { value: V2() } } });
    const tube = fullscreenPass(THREE, {
      fragmentShader: TUBE_FRAG,
      uniforms: {
        tA: { value: null }, tB: { value: null }, uRes: { value: V2(1, 1) }, uBTexel: { value: V2() },
        uK: { value: 1 }, uMask: { value: 0 }, uScan: { value: 0 }, uBloom: { value: 0 }, uSqY: { value: 1 }, uSqX: { value: 1 }, uDot: { value: 0 },
        uBright: { value: 1 }, uBeam: { value: 0 }, uAlpha: { value: 1 }, uWobble: { value: 0 }, uT: { value: 0 }, uNoise: { value: 0 },
        uPhos: { value: new THREE.Vector3(...['r', 'g', 'b'].map((k) => hexToRgb(ph.base)[k] / 255)) },
      },
    });
    const rtOpts = { depthBuffer: false, stencilBuffer: false, type: THREE.UnsignedByteType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false };
    const rtA = new THREE.WebGLRenderTarget(2, 2, rtOpts), rtB = new THREE.WebGLRenderTarget(2, 2, rtOpts);
    rtA.texture.colorSpace = rtB.texture.colorSpace = THREE.NoColorSpace;
    const buf = new THREE.Vector2();
    let atlasVer = -1;
    U = screen.uniforms;
    const UT = tube.uniforms;

    // --- the timeline of the text ---------------------------------------------------------------
    // Line times are worked out from the script's gaps and squeezed to fit their act.
    const times = { panic: [], post: [], countAt: [0, 0, 0], memAt: 0, memEnd: 0, steps: [], land: 0, enter: 0, path: [] };
    function stack(list, t0, t1, out) {
      let sum = 0;
      for (const x of list) sum += x.gap;
      const k = Math.min(1, (t1 - t0) / Math.max(1e-3, sum));
      let t = t0;
      out.length = 0;
      for (const x of list) { t += x.gap * k; out.push(t); }
      return t;
    }
    function timeLines() {
      const end = stack(sc.panic, T.panic, T.panicEnd, times.panic);
      const d = (T.off - end) / 3.2;
      times.countAt = [end, end + d, end + d * 2];
      stack(sc.post, T.post, T.postEnd, times.post);
      const mi = sc.post.findIndex((x) => x.L === sc.memLine);
      times.memAt = times.post[mi];
      times.memEnd = mi + 1 < times.post.length ? times.post[mi + 1] - 0.04 : times.memAt + 0.3;
      // the cursor's walk: from the dead world down to the next (overshooting once, sometimes)
      const to = sc.menu.toIndex;
      const path = [];
      for (let i = 1; i <= to; i++) path.push(i);
      if (ch.overshoot && to + 1 < sc.menu.entries.length) path.push(to + 1, to);
      times.path = path;
      times.enter = T.load - 0.12;
      times.land = times.enter - 0.34;
      const s0 = T.menu + 0.42;
      times.steps = path.map((_, i) => lerp(s0, times.land, (i + 1) / path.length));
    }
    layout();

    // --- sound ------------------------------------------------------------------------------------
    const cues = [];
    const cue = (t, fn) => cues.push({ t, fn });
    const tick = (g = 0.022) => A.tone({ freq: 1500 + rng() * 700, type: 'square', dur: 0.014, gain: g });
    const sq = (f, dur, g, delay = 0) => A.tone({ freq: f, type: 'square', dur, gain: g, delay });
    // act 1
    cue(0.03, () => { A.sfx('glitch', { gain: 0.45 }); sq(shade.buzz, 0.5, 0.045); A.noise({ filter: 'bandpass', freq: 2600, freqEnd: 700, q: 2, dur: 0.2, gain: 0.18 }); });
    for (let i = 0; i < 11; i++) { const t = T.cor0 + 0.04 + i * 0.075 + rng() * 0.03, f = rand(rng, 160, 1500); cue(t, () => A.tone({ type: 'square', freq: f, freqEnd: f * 0.5, dur: 0.045, gain: 0.04 })); }
    for (const t of shade.tears) cue(t, () => A.noise({ filter: 'bandpass', freq: 3800, q: 3, dur: 0.06, gain: 0.12 }));
    cue(T.seg, () => { for (let i = 0; i < 3; i++) sq(90 * tr, 0.1, 0.075, i * 0.14); tick(0.03); });
    cue(T.core, () => tick(0.03));
    cue(T.panic - 0.01, () => {
      sq(shade.beep, 0.11, 0.06); sq(shade.beep * 0.75, 0.11, 0.06, 0.13); sq(shade.beep, 0.11, 0.05, 0.26);
      A.tone({ type: 'sawtooth', freq: 55 * tr, dur: 2.0, gain: 0.035, attack: 0.3 });
      A.noise({ filter: 'lowpass', freq: 300, dur: 1.9, gain: 0.05, attack: 0.4 });
    });
    const panicCue = () => times.panic.forEach((t, i) => { if (i > 0) cue(t, () => tick()); });
    const countCue = () => times.countAt.forEach((t) => cue(t, () => sq(shade.beep * 1.5, 0.05, 0.05)));
    cue(T.off - 0.01, () => {
      A.sfx('click', { gain: 0.5, pitch: 0.7 });
      A.tone({ freq: 1100, freqEnd: 50, dur: 0.38, gain: 0.13 });
      A.noise({ filter: 'highpass', freq: 4500, dur: 0.1, gain: 0.06 });
      A.tone({ freq: 7600, freqEnd: 3800, dur: 0.45, gain: 0.006 }); // the flyback lets go
    });
    cue(T.relay, () => { A.sfx('click', { gain: 0.8, pitch: 0.55 }); A.noise({ filter: 'bandpass', freq: 2400, q: 6, dur: 0.03, gain: 0.2, delay: 0.012 }); A.tone({ freq: 90, freqEnd: 40, dur: 0.09, gain: 0.18 }); });
    cue(T.on, () => {
      A.tone({ type: 'sawtooth', freq: 60, freqEnd: 58, dur: 0.75, gain: 0.06, attack: 0.02 });
      A.noise({ filter: 'lowpass', freq: 420, freqEnd: 120, dur: 0.6, gain: 0.16, attack: 0.01 });
      A.sfx('thud', { gain: 0.4, pitch: 0.6 });
      A.tone({ freq: 3400, freqEnd: 7800, dur: 0.5, gain: 0.004, attack: 0.2 });
    });
    const postCue = () => {
      times.post.forEach((t, i) => { if (i !== 0) cue(t, () => tick(0.02)); });
      for (let i = 0; i < 10; i++) cue(lerp(times.memAt, times.memEnd, i / 10), () => tick(0.012));
      cue(times.memEnd, () => sq(1000 * tr, 0.16, 0.07)); // one beep: memory is fine
      cue(times.post[sc.foundIdx], () => { sq(shade.landNotes[0], 0.07, 0.05); sq(shade.landNotes[1], 0.12, 0.05, 0.08); });
    };
    const menuCue = () => {
      cue(T.menu, () => { sq(1320 * tr, 0.03, 0.05); A.noise({ filter: 'bandpass', freq: 1800, q: 1, dur: 0.08, gain: 0.05 }); });
      cue(T.menu + 0.2, () => sq(140, 0.12, 0.08)); // the dead world refuses to boot
      times.steps.forEach((t) => cue(t, () => { sq(1320 * tr, 0.025, 0.05); A.tone({ freq: 190, freqEnd: 90, type: 'square', dur: 0.04, gain: 0.03 }); }));
      cue(times.land + 0.02, () => { sq(shade.landNotes[0], 0.06, 0.05); sq(shade.landNotes[1], 0.14, 0.05, 0.07); });
      cue(times.enter, () => { A.sfx('click', { gain: 0.6, pitch: 1.2 }); A.tone({ freq: 190, freqEnd: 80, type: 'square', dur: 0.06, gain: 0.06 }); });
      if (ctx.matchPoint) cue(T.menu + 0.1, () => A.sfx('heartbeat', { gain: 0.5, pitch: 0.9 }));
    };
    cue(T.load + 0.02, () => tick(0.03));
    for (let i = 0; i < 14; i++) { const k = i / 13; cue(lerp(T.bar0, T.bar1, ease.outQuad(k)), () => sq(lerp(420, 1650, k) * tr, 0.03, 0.035)); }
    cue(T.scr0, () => A.sfx('whoosh', { gain: 0.22, pitch: 1.3 }));
    cue(T.rast0, () => {
      A.noise({ filter: 'bandpass', freq: 900, freqEnd: 5200, q: 2.5, dur: T.rast1 - T.rast0 + 0.1, gain: 0.12 });
      for (let i = 0; i < 6; i++) sq((520 + i * 210) * tr, 0.04, 0.03, i * 0.055);
    });
    cue(T.ref0 + 0.12, () => { A.sfx('chime', { gain: 0.45 }); A.sfx('riser', { gain: 0.18, pitch: 1.6 }); });
    for (let i = 0; i < 6; i++) cue(lerp(T.untitle0, T.untitle1, i / 6), () => tick(0.015));
    cue(T.crt1 - 0.08, () => A.sfx('swoosh', { gain: 0.2, pitch: 0.8 }));
    panicCue(); countCue(); postCue(); menuCue();
    cues.sort((a, b) => a.t - b.t);
    let cueAt = 0;

    // --- the text, frame by frame -------------------------------------------------------------
    const flare = (t, at) => 1 + 0.7 * Math.exp(-Math.max(0, t - at) * 9);
    function cursor(r, c) { S.cell(c, r, G.code('█'), C.HI | (F.BLINK << 4), 230, 255); }
    // Act 1: the fault, then the panic stacking under it and scrolling once it fills the glass.
    const act1 = [], act1At = []; // reused every frame
    function writeAct1(t) {
      act1.length = act1At.length = 0;
      if (t >= T.seg) { act1.push(sc.segLine); act1At.push(T.seg); }
      if (t >= T.core) { act1.push(sc.coreLine); act1At.push(T.core); }
      for (let i = 0; i < sc.panic.length; i++) if (t >= times.panic[i]) { act1.push(sc.panic[i].L); act1At.push(times.panic[i]); }
      const n = t >= times.countAt[2] ? 1 : t >= times.countAt[1] ? 2 : 3;
      poke(G, sc.countLine, sc.countAt, String(n));
      let hgt = 0;
      for (const L of act1) hgt += L.scale;
      let r = Math.min(0, lay.rows - 1 - hgt);
      for (let i = 0; i < act1.length; i++) r += S.line(act1[i], r, 1, flare(t, act1At[i]));
      if (act1.length && t > T.panic) cursor(r, 2);
    }
    // The firmware's emblem, top right: a reticle in half-block pixels (two per cell, stacked).
    const EMB = (() => {
      const N = 21, c0 = 10, out = [];
      const px = (x, y) => {
        const dx = (x - c0) * 0.92, dy = y - c0, d = Math.hypot(dx, dy);
        if (d < 1.3) return 3;
        if (Math.abs(d - 8.6) < 0.95) return 2;
        if ((x === c0 && Math.abs(dy) > 3.2 && Math.abs(dy) < 10.5) || (y === c0 && Math.abs(dx) > 3.2 && Math.abs(dx) < 10.5)) return 1;
        return 0;
      };
      for (let r = 0; r < Math.ceil(N / 2); r++) {
        for (let c = 0; c < N; c++) {
          const a = px(c, r * 2), b = px(c, r * 2 + 1);
          if (!a && !b) continue;
          const k = Math.max(a, b);
          out.push({ c, r, g: G.code(a && b ? '█' : a ? '▀' : '▄'), col: k === 3 ? C.ERR : k === 2 ? C.HI : C.MID });
        }
      }
      return out;
    })();
    function writePost(t) {
      // only where it clears every line it sits beside
      let need = 0, rr = 1;
      for (const x of sc.post) { if (rr > 12) break; need = Math.max(need, (x.L.n + 3) * x.L.scale); rr += x.L.scale; }
      if (lay.cols - 23 >= need) {
        const c0 = lay.cols - 23, k = seg(t, T.post, T.post + 0.3) * 11;
        for (const e of EMB) if (e.r < k) S.cell(c0 + e.c, 1 + e.r, e.g, e.col, 235, 0);
      }
      let r = 1, last = -1, lastL = null;
      for (let i = 0; i < sc.post.length; i++) {
        if (t < times.post[i]) break;
        const L = sc.post[i].L;
        if (L === sc.memLine) {
          const k = ease.outQuad(seg(t, times.memAt, times.memEnd));
          poke(G, L, sc.memAt, String(Math.round(ch.mem * k)).padStart(sc.memW, '0'));
          L.shown = k >= 1 ? L.n : L.n - 4;
        }
        last = r; lastL = L;
        r += S.line(L, r, 1, flare(t, times.post[i]));
      }
      if (lastL && lastL.scale === 1) cursor(last, Math.min(lay.cols - 1, lastL.shown + 2));
    }
    function writeMenu(t) {
      const M = sc.menu, n = M.entries.length;
      const h = n + 5, r0 = Math.max(0, Math.floor((lay.rows - h) / 2) - 1), c0 = Math.max(0, Math.floor((lay.cols - M.bw) / 2));
      let sel = 0;
      for (let i = 0; i < times.steps.length; i++) if (t >= times.steps[i]) sel = times.path[i];
      // the chosen line flashes twice between landing and ⏎
      const flash = t > times.land + 0.1 && t < times.enter && Math.floor((t - times.land - 0.1) * 14) % 2 === 1;
      const refuse = sel === 0 && t >= T.menu + 0.2; // the dead world will not boot
      const rows = [M.top, M.blank];
      for (let i = 0; i < n; i++) rows.push(i === sel && !flash ? (refuse ? M.entries[i].err : M.entries[i].hi) : M.entries[i].lo);
      rows.push(M.blank, M.bottom);
      for (let i = 0; i < rows.length; i++) if (t >= T.menu + i * 0.022) S.line(rows[i], r0 + i, c0);
      if (t >= T.menu + 0.2) S.line(M.hint, r0 + rows.length + 1, c0);
    }
    const barRow = () => clamp(Math.floor(lay.rows * 0.36), 3, lay.rows - 8);
    function writeLoad(t) {
      const Ld = sc.load, br = barRow();
      const k = ease.inOutSine(seg(t, T.bar0, T.bar1));
      poke(G, Ld.bootLine, Ld.pctAt, `${String(Math.round(k * 100)).padStart(3, ' ')}%`);
      S.line(Ld.bootLine, br - 2, 1, flare(t, T.load));
      if (t < T.scr1) {
        const filled = Math.floor(k * lay.cols);
        for (let c = 0; c < lay.cols; c++) {
          if (c < filled) S.cell(c, br, G.code('█'), C.MID | (F.BAR << 4), 255, 255);
          else S.cell(c, br, G.code('░'), C.DIM, 200, 255);
        }
      }
      // the title types in, and later backspaces out over the arriving picture
      const tIn = seg(t, T.load + 0.1, T.load + 0.42), tOut = seg(t, T.untitle0, T.untitle1);
      Ld.titleLine.shown = Math.round(Ld.titleLine.n * tIn * (1 - tOut));
      Ld.subLine.shown = Math.round(Ld.subLine.n * seg(t, T.load + 0.3, T.load + 0.62) * (1 - seg(t, T.untitle0 - 0.08, T.untitle0 + 0.14)));
      if (Ld.titleLine.shown > 0) S.line(Ld.titleLine, br + 2, 0, flare(t, T.load + 0.2));
      if (Ld.subLine.shown > 0) S.line(Ld.subLine, br + 3 + Ld.scale, 0);
    }
    function writeScreen(t) {
      S.clear();
      if (t < T.dark) writeAct1(t);
      else if (t >= T.on && t < T.menu) writePost(t);
      else if (t >= T.menu && t < T.load) writeMenu(t);
      else if (t >= T.load) writeLoad(t);
      cells.needsUpdate = true;
      rowsTex.needsUpdate = true;
    }

    function adoptTo(img) {
      try {
        texTo = canvasTexture(THREE, img, { srgb: false });
        U.tTo.value = texTo;
        U.uToRange.value.set(...lumaRange(img));
      } catch { /* keep the old frame bound: the arrival degrades, nothing throws */ }
    }

    return {
      update(dt, t) {
        if (!texTo && ctx.toImage) adoptTo(ctx.toImage);
        while (cueAt < cues.length && t >= cues[cueAt].t) {
          try { cues[cueAt].fn(); } catch { /* audio is never worth a crash */ }
          cueAt++;
        }
      },

      render(t) {
        layout();
        const w = lay.w, h = lay.h;
        renderer.getDrawingBufferSize(buf);
        const bw = Math.max(2, buf.x), bh = Math.max(2, buf.y);
        if (rtA.width !== bw || rtA.height !== bh) {
          rtA.setSize(bw, bh);
          rtB.setSize(Math.max(2, Math.round(bw / 4)), Math.max(2, Math.round(bh / 4)));
        }
        if (atlasVer !== G.version) { atlasVer = G.version; freshAtlas(); }
        if (t > 0.5 && !G.font && Math.floor(t * 10) % 5 === 0) G.bake(G.cw, G.ch); // the face arrived late: re-cut the ROM
        writeScreen(t);

        // --- the screen pass ---
        U.uRes.value.set(w, h);
        U.uCell.value.set(lay.cw, lay.ch);
        U.uGrid.value.set(lay.cols, lay.rows);
        U.uPad.value.set(G.pad / (G.cw + 2 * G.pad), G.pad / (G.ch + 2 * G.pad));
        U.uT.value = t;
        const flat = ease.inOutCubic(seg(t, T.crt0, T.crt1));
        U.uK.value = 1 - flat;
        U.uFromK.value = t < T.dark ? 1 : 0;
        U.uFromBright.value = lerp(1, 0.45, ease.inOutSine(seg(t, 0.7, 1.3))) * lerp(1, 0.7, seg(t, 1.6, 2.9));
        U.uDrip.value = shade.drip * ease.outQuad(seg(t, T.cor0, 1.4));
        let tear = 0;
        for (const tt of shade.tears) tear = Math.max(tear, Math.exp(-Math.abs(t - tt) * 18) * 0.35);
        U.uTear.value = t > T.cor0 && t < T.off ? tear : 0;
        U.uToK.value = t >= T.scr1 ? 1 : 0;
        U.uRastRate.value = (T.rast1 - T.rast0) / Math.max(1, lay.rows - 1);
        U.uScroll.value = t >= T.load ? barRow() * ease.inOutCubic(seg(t, T.scr0, T.scr1)) : 0;
        // the phosphor warming up after power-on, and a flicker as it does
        const warm = t >= T.on ? ease.outCubic(seg(t, T.on, T.on + 0.45)) : 1;
        U.uTextK.value = warm * (t >= T.on && t < T.on + 0.5 ? 0.85 + 0.15 * Math.sin(t * 97) : 1);
        renderer.setRenderTarget(rtA);
        screen.render(renderer);
        down.uniforms.tSrc.value = rtA.texture;
        down.uniforms.uTexel.value.set(1 / bw, 1 / bh);
        renderer.setRenderTarget(rtB);
        down.render(renderer);
        renderer.setRenderTarget(null);

        // --- the tube ---
        UT.tA.value = rtA.texture; UT.tB.value = rtB.texture;
        UT.uRes.value.set(w, h);
        UT.uBTexel.value.set(1 / rtB.width, 1 / rtB.height);
        UT.uT.value = t;
        UT.uK.value = 1 - flat;
        const crt = seg(t, 0.05, 0.5) * (1 - flat);
        UT.uMask.value = crt;
        UT.uScan.value = crt * (t < T.on ? 0.6 : 1);
        UT.uBloom.value = crt * 0.85 * (1 - 0.75 * seg(t, T.ref0, T.ref1)); // a lit picture needs no glow of its own
        UT.uNoise.value = crt * 0.035;
        // power off: a line, a dot, darkness
        let sqY = 1, sqX = 1, dot = 0, bright = 1, beam = 0;
        if (t >= T.off && t < T.on) {
          sqY = lerp(1, 0.004, ease.inQuart(seg(t, T.off, T.line)));
          sqX = lerp(1, 0.003, ease.inCubic(seg(t, T.line + 0.03, T.dot)));
          bright = (1 + 1.6 * seg(t, T.off, T.line)) * (1 - seg(t, T.line, T.line + 0.06));
          beam = seg(t, T.off + 0.03, T.line) * (1 - seg(t, T.dot - 0.03, T.dot + 0.02));
          // the dot: a pinpoint that flares as the beam lands, then the phosphor's long afterglow
          dot = seg(t, T.dot - 0.05, T.dot) * Math.exp(-Math.max(0, t - T.dot) * 7) * (1 - seg(t, T.dark - 0.1, T.dark));
          if (t >= T.dark) bright = 0;
        }
        // power on: the raster opens from a line and swims for a moment
        if (t >= T.on) {
          sqY = lerp(0.01, 1, ease.outBack(seg(t, T.on, T.on + 0.16)) );
          bright = lerp(1.8, 1, seg(t, T.on, T.on + 0.3));
        }
        UT.uSqY.value = Math.max(0.002, sqY); UT.uSqX.value = Math.max(0.001, sqX);
        UT.uDot.value = dot; UT.uBright.value = bright; UT.uBeam.value = beam;
        UT.uWobble.value = t >= T.on ? Math.exp(-(t - T.on) * 5) * (1 - seg(t, T.on + 0.6, T.on + 0.9)) : 0;
        UT.uAlpha.value = 1 - ease.inOutSine(seg(t, T.fade0, T.fade1));
        tube.render(renderer);
      },

      dispose() {
        for (const x of [texFrom, texTo, atlas, cells, rowsTex, palTex]) if (x) x.dispose();
        rtA.dispose(); rtB.dispose();
        screen.dispose(); down.dispose(); tube.dispose();
        G.canvas.width = G.canvas.height = 1;
        cues.length = 0;
      },
    };
  },
};

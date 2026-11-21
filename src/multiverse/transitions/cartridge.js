// BLOW ON IT — CARTRIDGE CANYON's own way out.
//
// CONCEPT
//   The kill crashes the game the way a dirty cartridge crashes: the canyon's last frame tears
//   into tiles fetched from the wrong address, columns of sprites smear down the screen, the
//   sixteen colours point at the wrong sixteen, the kill label loops across a row, a square-wave
//   note sticks — and the picture locks. The lens pulls back: the frozen frame is on a small
//   bulging television on a bedroom carpet at night, wired to a chunky top-loading console (the
//   SKLOUNST 16). A hand (the loser's sleeve) comes in, thumps the console (the picture jumps
//   and gets worse), flicks the power off (the tube collapses to a dot; a cricket), yanks the
//   cartridge, turns it over and BLOWS — a ridiculous cloud of dust — considers the label,
//   nah, tosses it on the heap, and picks another from the pile whose hand-written label is
//   the next world's name in the next world's colours. Slot, press, power: snow, the console's
//   two-note boot card, the next world rolling into vertical hold, and the lens pushes into the
//   glass until the curve and the scanlines are gone and it is simply the new world.
//
// BEAT SHEET (8.4 s, swap at 3.20 s)
//   0.00         the canyon's last frame, untouched
//   0.10 → 0.98  the crash, spreading from the impact: rows slip (0.10), garbage tiles, the
//                palette swaps (0.38), sprite columns smear (0.46), the kill label loops along a
//                row (0.56), a second swap (0.72); the stuck note stutters underneath
//   0.98         LOCK-UP: the picture freezes, the note goes flat and steady
//   1.02 → 2.20  the lens pulls back out of the glass: curvature, scanlines, bezel, then the dark
//                room around it, lit only by the tube and the moon
//   1.70 → 2.30  the hand comes in from the side and rises into a fist; 2.30 THUMP — the console
//                bounces, the picture jumps rows and gets worse, the note jumps to a sourer one
//   2.62 → 2.74  a finger to the power slider; 2.74 click: the picture squeezes to a line, a dot,
//                darkness (3.06); the note dies; a cricket outside
//   3.20         THE SWAP, on that held, dark beat (the overlay is the whole room: opaque)
//   3.36 → 3.66  grip and yank: the cartridge comes out of the slot with a scrape
//   3.66 → 3.98  up to the lens and over: the edge connector faces us
//   4.02 → 4.45  one, two or three blows; the last one is a ridiculous cloud of dust in the moonlight
//   4.45 → 4.85  turned back to read its label — CARTRIDGE CANYON in the canyon's own lettering — nah
//   4.85 → 5.35  tossed onto the heap (it clatters, bounces)
//   5.32 → 5.72  the hand picks the one leaning on the pile and brings it up to the lens: the next
//                world's name in marker, in its colours, with a doodle of the world (the title)
//   6.28 → 6.42  slot, chunk; 6.64 power: the LED, snow (6.64 → 6.90)
//   6.90 → 7.18  the console's boot card and its two notes
//   7.12 → 7.80  the next world rolls through the tube and catches vertical hold; the room glows
//                in its colours
//   6.85 → 8.08  the lens pushes into the glass; scanlines and curve fall away (7.5 → 8.08)
//   8.18 → 8.38  the overlay fades off the live world; the last frame is clear
//
// AXES OF VARIATION (all drawn once from ctx.rng)
//   1. the crash: palette permutations, which columns smear and how, which row loops the label,
//      the stuck note (one of the canyon's own melody notes) and its stutter
//   2. the hand: which side of the room it comes from (the whole set mirrors), skin, sleeve
//      pattern, how hard the thump lands, and how many blows (1-3) before the big one
//   3. the heap: how many cartridges, their shells, their hand-written joke titles, how they lie,
//      which of the leaning ones is the next world
//   4. the next cartridge's label: the doodle (from the world when it is known), its layout
//   5. the room: TV casing, wall and carpet colours, window side, moon phase, the poster, the
//      rabbit ears, the console's stripe; the dust cloud's shape
//   6. the boot card's interval and the roll's length and direction
//
// CONTEXT
//   ctx.focus           where the crash starts: garbage spreads out from the impact tile
//   ctx.how             the label that loops across a row of the crashed picture
//   ctx.loser / winner  the hand wears the loser's colour; the two pads in the players' colours,
//                       the loser's thrown face down; names and tallies on the sticky note
//   score / matchPoint  the tallies on the note; MATCH POINT on it and on the new label
//   ctx.from            the canyon's pixel grid (so whole tiles tear), its sixteen colours, its
//                       lettering and dusk on the old cartridge; any other world still crashes,
//                       on a grid of its own, and gets a printed label in its own palette
//   ctx.to              name, palette and a doodle on the new cartridge (its palette sits on the
//                       heap from the first wide shot), perspective under the name; its first
//                       frame boots on the tube and lights the room before the push-in
import { seg, ease, clamp, lerp, pulse, rand, randInt, pick, shuffle, mixHex, makeCanvas, canvasTexture, fullscreenPass } from '../kit.js';
import { PAL, drawText, textWidth } from '../dimensions/pixel/palette.js';
import { TUBE_FRAG } from './cartridge/shader.js';
import { proj, makeRoom, drawWall, drawFloor, drawTV, drawGlass, rgb01, css, mix3, YF } from './cartridge/room.js';
import { CON, CART_H, cartTopY, consoleSpots, drawConsole, drawConsoleFront, drawCart, bakeNewLabel, bakeOldLabel, makePile, drawPileFlat, makePads, drawPads, HAND_FONT } from './cartridge/gear.js';
import { POSES, makePose, blendPose, contact, drawHand, drawArm } from './cartridge/hand.js';
import { makeDrone } from './cartridge/sound.js';

const DURATION = 8.4;
const SWAP_AT = 0.381;
const T = {
  tear: 0.1, pal1: 0.38, smear: 0.46, text: 0.56, pal2: 0.72, lock: 0.98,
  pull0: 1.02, pull1: 2.2,
  thump: 2.3, flick: 2.74, off1: 3.06, swap: DURATION * SWAP_AT,
  grip: 3.44, yank: 3.66, blow: 3.98, look: 4.65, nah: 4.85, release: 5.05, land: 5.35,
  pick: 5.42, show: 5.72, show2: 6.05, insert: 6.42, power: 6.64,
  snow1: 6.9, boot1: 7.18, roll0: 7.12, roll1: 7.8,
  push0: 6.85, glass0: 7.5, push1: 8.08, fade0: 8.18, fade1: 8.38,
};
const HAND = 0.36; // palm length, world units
const _ = { x: 0, y: 0, k: 0, d: 0 };

function avgColour(img) {
  try {
    const p = makeCanvas(4, 4);
    p.g.drawImage(img, 0, 0, 4, 4);
    const d = p.g.getImageData(0, 0, 4, 4).data;
    let r = 0, g = 0, b = 0;
    for (let i = 0; i < 64; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; }
    p.canvas.width = p.canvas.height = 1;
    const c = [r / 16 / 255, g / 16 / 255, b / 16 / 255];
    // a tube throws a brighter, more saturated light than its average pixel
    const m = Math.max(0.05, c[0], c[1], c[2]);
    return c.map((v) => clamp(0.15 + (v / m) * 0.85, 0, 1));
  } catch { return [0.7, 0.6, 0.9]; }
}

export default {
  id: 'cartridge',
  name: 'BLOW ON IT',
  duration: DURATION,
  swapAt: SWAP_AT,

  create(ctx) {
    const { THREE, renderer } = ctx.three;
    const A = ctx.audio, rng = ctx.rng;
    const side = rng() < 0.5 ? -1 : 1; // where the hand, the heap and the camera lean
    const room = makeRoom(rng, -side);
    const pal = ctx.to.palette || { bg: '#222', fg: '#fff', accent: '#f80' };

    // --- decided once ------------------------------------------------------------------------
    const xc = side * 0.12; // the console sits a little toward the hand
    const look = {
      body: rgb01(pick(rng, ['#34303d', '#9d98ab', '#3d3a46'])),
      dark: rgb01('#1a1720'), knob: rgb01('#57525f'), stripe: room.stripe, pad: rgb01(pick(rng, ['#3a3644', '#bdb8c8'])),
    };
    look.pad = look.body;
    const sleeveBase = ctx.loser ? ctx.loser.color : pick(rng, ['#5a6a8a', '#7a5a8a']);
    const handLook = {
      skin: rgb01(pick(rng, ['#e0ac86', '#c68863', '#8d5a3c', '#f1c9a5', '#6b4430'])),
      nail: rgb01('#f3d6c6'),
      sleeve: rgb01(mixHex(sleeveBase, '#1a1430', 0.35)),
      cuff: rgb01(mixHex(sleeveBase, '#ffffff', 0.15)),
      stripe: rng() < 0.5 ? rgb01(mixHex(sleeveBase, '#ffffff', 0.35)) : null,
    };
    const blows = 1 + Math.floor(rng() * 3);
    const puffs = blows === 1 ? [4.28] : blows === 2 ? [4.1, 4.3] : [4.02, 4.15, 4.3];
    const thumpHard = rand(rng, 0.7, 1.1);
    // the crash
    // a wrong palette first (every index shifted along by a few: the picture's shapes survive in
    // the wrong colours), then a scrambled one once it has been thumped
    const shift = (k) => [...Array(16).keys()].map((i) => (i + k) % 16);
    const perms = [shift(randInt(rng, 2, 5)), shift(randInt(rng, 7, 11)), shuffle(rng, [...Array(16).keys()])];
    const melody = [440, 523.25, 659.26, 587.33, 392];
    const stuck = pick(rng, melody), sour = stuck * pick(rng, [1.059, 0.944, 1.414]);
    const stutter = rand(rng, 12, 19);
    const textRowR = rng(), seedG = rand(rng, 1, 90);
    const rollLen = rand(rng, 1.6, 2.8) * (rng() < 0.75 ? 1 : -1);
    const jingle = pick(rng, [[987.77, 1318.51], [783.99, 1174.66], [659.26, 1318.51], [880, 1174.66]]);
    const jumpRows = 3 + Math.floor(rng() * 6);
    // the cartridges
    const roundN = (ctx.round || 1) + 1;
    const newLabel = bakeNewLabel(ctx.to, rng, ctx.matchPoint ? { text: 'MATCH POINT!!', color: '#ff4b3a' } : { text: String(ctx.to.perspective || '').toLowerCase() || `round ${roundN}` });
    const oldLabel = bakeOldLabel(ctx.from);
    const shellNew = rgb01(pick(rng, ['#8c8896', '#5e5a66', '#3a3640', '#5b4a8a']));
    const shellOld = rgb01(ctx.from.id === 'pixel' ? '#7a86b8' : '#8c8896');
    const pile = makePile(rng, newLabel, shellNew);
    const pads = makePads(rng, ctx);
    const landing = { u: rand(rng, -0.2, 0.2), v: rand(rng, -0.15, 0.1), layer: 2, rot: rand(rng, -0.8, 0.8), shell: shellOld, label: oldLabel };
    const dust = [];
    for (let i = 0; i < 70; i++) dust.push({ a: rand(rng, -Math.PI, Math.PI), sp: rand(rng, 0.2, 1.4), r: rand(rng, 0.05, 0.22), life: rand(rng, 0.7, 1.5), fall: rand(rng, -0.1, 0.25), speck: rng() < 0.4 });
    const W = ctx.winner, Lz = ctx.loser;
    const byIndex = W && Lz ? (W.index === 0 ? [W, Lz] : [Lz, W]) : null;
    const noteLines = byIndex ? byIndex.map((p) => [p.name, (ctx.score && ctx.score[p.index]) || 0]) : null;
    // the stuck kill label, in the canyon's lettering
    const how = String(ctx.how || (Lz ? 'K.O.' : 'DRAW')).toUpperCase();
    const unit = how + ' ';
    const reps = Math.max(2, Math.ceil(200 / Math.max(6, textWidth(unit))));
    const textCv = makeCanvas(Math.min(1024, textWidth(unit) * reps + reps), 8);
    { let x = 0; for (let i = 0; i < reps; i++) { drawText(textCv.g, unit, x, 0, PAL.cream); x += textWidth(unit) + 1; } }
    // the console's boot card
    const logoCv = makeCanvas(196, 40);
    {
      const g = logoCv.g;
      drawText(g, 'SKLOUNST', 98, 4, PAL.cream, 2, 'c');
      const cols = [PAL.coral, PAL.peach, PAL.leaf, PAL.cyan];
      const lw = textWidth('SKLOUNST', 2);
      for (let i = 0; i < 4; i++) { g.fillStyle = cols[i]; g.fillRect(98 - lw / 2 + (i * lw) / 4, 24, lw / 4, 3); }
      drawText(g, '16', 98, 31, PAL.steel, 1, 'c');
    }

    // --- GPU ---------------------------------------------------------------------------------
    const texFrom = canvasTexture(THREE, ctx.fromImage, { srgb: false });
    const texText = canvasTexture(THREE, textCv.canvas, { filter: 'nearest', srgb: false });
    const texLogo = canvasTexture(THREE, logoCv.canvas, { filter: 'nearest', srgb: false });
    texText.wrapS = THREE.RepeatWrapping;
    let texTo = null;
    const V3 = (c) => new THREE.Vector3(c[0], c[1], c[2]);
    const palList = Object.values(PAL).slice(0, 16).map(rgb01);
    const pass = fullscreenPass(THREE, {
      fragmentShader: TUBE_FRAG,
      uniforms: {
        tFrom: { value: texFrom }, tTo: { value: texFrom }, tLogo: { value: texLogo }, tText: { value: texText },
        uRes: { value: new THREE.Vector2(1, 1) }, uRect: { value: new THREE.Vector4(0, 0, 1, 1) },
        uCurve: { value: 0 }, uScan: { value: 0 }, uLines: { value: 200 }, uAlpha: { value: 1 }, uBright: { value: 1 }, uGlow: { value: 0 },
        uFromK: { value: 1 }, uOff: { value: 0 }, uSnow: { value: 0 }, uBoot: { value: 0 }, uToK: { value: 0 }, uRoll: { value: 0 }, uJit: { value: 0 }, uT: { value: 0 },
        uGridO: { value: new THREE.Vector2() }, uCell: { value: 4 }, uStep: { value: 0 }, uSeed: { value: seedG },
        uTear: { value: 0 }, uSmear: { value: 0 }, uGarb: { value: 0 }, uSpread: { value: 0 }, uJump: { value: 0 }, uPalOn: { value: 0 },
        uText: { value: 0 }, uTextRow: { value: 0 }, uDark: { value: 0 },
        uFocusT: { value: new THREE.Vector2() }, uTiles: { value: new THREE.Vector2(40, 23) },
        uPal: { value: palList.map(V3) }, uSwap: { value: palList.map(V3) },
        uTextSize: { value: new THREE.Vector2(textCv.canvas.width, 8) },
        uInk: { value: V3(rgb01(PAL.ink)) }, uCream: { value: V3(rgb01(PAL.cream)) },
        uLogoAsp: { value: new THREE.Vector2(logoCv.canvas.width, logoCv.canvas.height) },
      },
    });
    try { renderer.compile(pass.scene, pass.camera); } catch { /* compiled on first use */ }
    const U = pass.uniforms;
    let permShown = -1;
    const setPerm = (i) => {
      if (i === permShown) return;
      permShown = i;
      const p = perms[i];
      for (let j = 0; j < 16; j++) { const c = palList[p[j]]; U.uSwap.value[j].set(c[0], c[1], c[2]); }
    };

    // The canyon's own pixel grid, worked out the way its view lays itself out, so whole tiles
    // tear. Any other world gets a grid of its own size.
    function grid(w, h) {
      let cell, ox, oy;
      if (ctx.from.id === 'pixel') {
        const dpr = ctx.dpr || 1, raw = Math.min(w / 320, h / 180);
        cell = Math.floor(raw * dpr + 1e-6) / dpr;
        if (cell * dpr < 1) cell = raw;
        ox = Math.round(((w - 320 * cell) / 2) * dpr) / dpr;
        oy = Math.round(((h - 180 * cell) / 2) * dpr) / dpr;
      } else {
        cell = Math.max(2, Math.round(h / 180));
        ox = oy = 0;
      }
      cell = Math.max(1, cell);
      const T8 = cell * 8;
      ox -= Math.ceil(ox / T8) * T8;
      oy -= Math.ceil(oy / T8) * T8;
      U.uGridO.value.set(ox, oy);
      U.uCell.value = cell;
      U.uTiles.value.set(Math.ceil((w - ox) / T8) + 1, Math.ceil((h - oy) / T8) + 1);
      U.uFocusT.value.set((ctx.focus.x - ox) / T8, (ctx.focus.y - oy) / T8);
      U.uTextRow.value = clamp(Math.floor((ctx.focus.y - oy) / T8) + Math.round((textRowR - 0.5) * 8), 1, U.uTiles.value.y - 2);
    }

    const fromLight = avgColour(ctx.fromImage);
    let toLight = rgb01(pal.accent);
    function adoptTo(img) {
      texTo = canvasTexture(THREE, img, { srgb: false });
      U.tTo.value = texTo;
      toLight = avgColour(img);
    }

    // --- sound ---------------------------------------------------------------------------------
    const drone = makeDrone(A);
    const cues = [];
    const cue = (t, fn) => cues.push({ t, fn });
    const crunch = (f, g = 0.05) => A.tone({ type: 'square', freq: f, freqEnd: f * 0.5, dur: 0.05, gain: g, attack: 0.002 });
    cue(0.04, () => { A.sfx('glitch', { gain: 0.5 }); A.noise({ filter: 'bandpass', freq: 3200, freqEnd: 900, q: 2, dur: 0.18, gain: 0.25 }); });
    for (let i = 0; i < 12; i++) { const t = 0.1 + i * 0.075 + rng() * 0.03, f = rand(rng, 180, 1400); cue(t, () => crunch(f)); }
    cue(0.14, () => drone.start(stuck, stutter, 0.045));
    cue(T.pal1, () => A.tone({ type: 'square', freq: stuck * 2, freqEnd: stuck * 0.25, dur: 0.12, gain: 0.06 }));
    cue(T.lock, () => { drone.set(stuck, 0); A.sfx('click', { gain: 0.3, pitch: 0.6 }); });
    cue(T.pull0 + 0.05, () => { A.noise({ filter: 'lowpass', freq: 380, freqEnd: 140, q: 0.6, dur: 1.6, gain: 0.16, attack: 0.5 }); A.tone({ freq: 59.9, dur: 1.8, gain: 0.05, attack: 0.6 }); });
    cue(T.pull0 + 0.1, () => A.sfx('whoosh', { gain: 0.25, pitch: 0.5 }));
    cue(1.75, () => A.noise({ filter: 'bandpass', freq: 600, freqEnd: 300, q: 0.8, dur: 0.35, gain: 0.08, attack: 0.1, pan: side * 0.5 })); // a sleeve rustle
    cue(T.thump - 0.01, () => {
      A.sfx('thud', { gain: 0.9 * thumpHard, pitch: 0.8 });
      A.tone({ type: 'triangle', freq: 120, freqEnd: 45, dur: 0.3, gain: 0.35 * thumpHard });
      A.noise({ filter: 'bandpass', freq: 2400, freqEnd: 1200, q: 3, dur: 0.12, gain: 0.18, delay: 0.03 }); // the plastic rattles
      drone.set(sour, stutter * 1.6);
    });
    cue(T.thump + 0.25, () => drone.set(sour, 0));
    cue(T.flick - 0.01, () => {
      A.sfx('click', { gain: 0.9, pitch: 0.75 });
      A.tone({ type: 'square', freq: 1800, freqEnd: 2600, dur: 0.03, gain: 0.04 });
      drone.stop(0.02);
      A.tone({ freq: 1100, freqEnd: 55, dur: 0.32, gain: 0.12 }); // the tube lets go
      A.noise({ filter: 'highpass', freq: 5000, dur: 0.12, gain: 0.06 });
    });
    cue(3.02, () => { for (let i = 0; i < 3; i++) A.tone({ freq: 4400, dur: 0.025, gain: 0.025, delay: i * 0.055, pan: -side * 0.6 }); }); // a cricket, outside
    cue(T.grip - 0.02, () => A.sfx('click', { gain: 0.35, pitch: 1.4 }));
    cue(T.grip + 0.04, () => { A.noise({ filter: 'bandpass', freq: 900, freqEnd: 2600, q: 1.5, dur: 0.18, gain: 0.25 }); A.tone({ type: 'triangle', freq: 300, freqEnd: 520, dur: 0.08, gain: 0.1, delay: 0.16 }); });
    cue(T.yank + 0.05, () => A.sfx('swoosh', { gain: 0.25, pitch: 1.2, pan: side * 0.2 }));
    puffs.forEach((tp, i) => cue(tp - 0.02, () => {
      const big = i === puffs.length - 1;
      A.noise({ filter: 'bandpass', freq: big ? 1100 : 1500, freqEnd: big ? 600 : 900, q: 0.9, dur: big ? 0.5 : 0.16, gain: big ? 0.42 : 0.2, attack: big ? 0.04 : 0.02 });
      A.noise({ filter: 'highpass', freq: 3500, dur: big ? 0.35 : 0.12, gain: big ? 0.1 : 0.05, attack: 0.02 });
    }));
    cue(T.look + 0.02, () => A.noise({ filter: 'bandpass', freq: 1800, freqEnd: 1300, q: 4, dur: 0.08, gain: 0.08 }));
    cue(T.nah - 0.15, () => { A.noise({ filter: 'bandpass', freq: 2600, q: 3, dur: 0.05, gain: 0.08 }); A.noise({ filter: 'bandpass', freq: 2400, q: 3, dur: 0.05, gain: 0.08, delay: 0.08 }); });
    cue(T.release - 0.02, () => A.sfx('swoosh', { gain: 0.3, pitch: 0.9, pan: side * 0.4 }));
    cue(T.land, () => {
      A.sfx('thud', { gain: 0.35, pitch: 1.6, pan: side * 0.5 });
      [0, 0.07, 0.15].forEach((d, i) => A.noise({ filter: 'bandpass', freq: 2200 - i * 400, q: 2.5, dur: 0.05, gain: 0.16 - i * 0.04, delay: d, pan: side * 0.5 }));
    });
    cue(T.pick - 0.02, () => A.noise({ filter: 'bandpass', freq: 1400, freqEnd: 2200, q: 2, dur: 0.12, gain: 0.12, pan: side * 0.4 }));
    cue(T.show - 0.18, () => A.sfx('whoosh', { gain: 0.18, pitch: 1.4 }));
    cue(T.insert - 0.02, () => { A.sfx('thud', { gain: 0.55, pitch: 1.1 }); A.sfx('click', { gain: 0.5, pitch: 0.9, delay: 0.03 }); A.noise({ filter: 'lowpass', freq: 600, dur: 0.1, gain: 0.25 }); });
    cue(T.power - 0.01, () => { A.sfx('click', { gain: 0.8, pitch: 0.7 }); A.tone({ type: 'sine', freq: 15700 / 4, dur: 0.6, gain: 0.006 }); });
    cue(T.power + 0.01, () => { A.noise({ filter: 'bandpass', freq: 5200, q: 0.6, dur: 0.28, gain: 0.32, attack: 0.01 }); A.noise({ filter: 'highpass', freq: 2500, dur: 0.24, gain: 0.12 }); });
    cue(T.snow1 + 0.02, () => {
      // the console's own two notes: original, short, bright
      A.tone({ type: 'square', freq: jingle[0], dur: 0.12, gain: 0.06 });
      A.tone({ type: 'triangle', freq: jingle[0] / 2, dur: 0.12, gain: 0.1 });
      A.tone({ type: 'square', freq: jingle[1], dur: 0.55, gain: 0.06, delay: 0.14 });
      A.tone({ type: 'triangle', freq: jingle[1] / 2, dur: 0.6, gain: 0.12, delay: 0.14 });
      A.tone({ type: 'square', freq: jingle[1] * 2, dur: 0.3, gain: 0.015, delay: 0.14, detune: 8 });
    });
    cue(T.roll0, () => { A.tone({ type: 'sawtooth', freq: 60, freqEnd: 50, dur: 0.6, gain: 0.03 }); A.noise({ filter: 'bandpass', freq: 400, q: 1, dur: 0.6, gain: 0.05 }); });
    cue(T.push0 + 0.3, () => A.sfx('riser', { gain: 0.35, pitch: 1.1 }));
    cue(T.push1 - 0.04, () => { A.sfx('swoosh', { gain: 0.35, pitch: 0.7 }); A.tone({ freq: jingle[1], dur: 0.9, gain: 0.03, attack: 0.02 }); A.tone({ freq: jingle[1] * 1.5, dur: 0.8, gain: 0.02, attack: 0.04 }); });
    if (ctx.matchPoint) cue(T.show + 0.05, () => A.sfx('heartbeat', { gain: 0.5, pitch: 0.9 }));
    cues.sort((a, b) => a.t - b.t);
    let cueAt = 0;

    // --- the camera ----------------------------------------------------------------------------
    const cam = { x: 0, y: 0, z: -1, px: 0.5, py: 0.5, w: 1, h: 1 };
    const KF = {
      full: { x: 0, y: 0, z: -1, px: 0.5, py: 0.5 },
      wide: { x: side * 0.35, y: -1.2, z: -5.2, px: 0.5, py: 0.1 },
      near: { x: side * 0.6, y: -1.0, z: -4.4, px: 0.5, py: 0.06 },
      boot: { x: side * 0.15, y: -0.8, z: -4.0, px: 0.5, py: 0.2 },
    };
    function blendCam(a, b, e, out) {
      const da = -a.z, db = -b.z;
      out.z = -Math.exp(lerp(Math.log(da), Math.log(db), e));
      // the other parameters follow the zoom, not the clock, so the move reads as one dolly
      const f = (1 / out.z - 1 / a.z) / (1 / b.z - 1 / a.z || 1);
      const q = clamp(Number.isFinite(f) ? f : e, 0, 1);
      out.x = lerp(a.x, b.x, q); out.y = lerp(a.y, b.y, q); out.px = lerp(a.px, b.px, q); out.py = lerp(a.py, b.py, q);
      return out;
    }
    function camAt(t, w, h) {
      cam.w = w; cam.h = h;
      if (t < T.pull0) Object.assign(cam, KF.full);
      else if (t < T.pull1) blendCam(KF.full, KF.wide, ease.inOutCubic(seg(t, T.pull0, T.pull1)), cam);
      else if (t < 3.3) blendCam(KF.wide, KF.near, ease.inOutSine(seg(t, T.pull1, 3.3)), cam);
      else if (t < T.push0) blendCam(KF.near, KF.boot, ease.inOutSine(seg(t, 5.9, T.push0)), cam);
      else {
        // into the glass: slow, then all at once, then settling flat on the picture
        const e = seg(t, T.push0, T.push1);
        blendCam(KF.boot, KF.full, ease.inOutQuart(e), cam);
      }
      // the thump and the slot land in the camera too
      const kick = Math.exp(-Math.max(0, t - T.thump) * 9) * (t > T.thump ? 1 : 0) * thumpHard + Math.exp(-Math.max(0, t - T.insert) * 12) * (t > T.insert ? 0.4 : 0);
      if (t > T.pull0 && t < T.push1 - 0.2) {
        cam.y += Math.sin(t * 61) * 0.012 * kick;
        cam.x += Math.sin(t * 47) * 0.008 * kick;
        // a breath of handheld drift so the room is never a still
        cam.x += Math.sin(t * 0.9 + 1) * 0.015 * seg(t, T.pull0, T.pull1) * (1 - seg(t, T.push0, T.push1));
        cam.y += Math.sin(t * 0.7) * 0.01 * seg(t, T.pull0, T.pull1) * (1 - seg(t, T.push0, T.push1));
      }
      return cam;
    }

    // --- the hand's script ----------------------------------------------------------------------
    const spots = consoleSpots(xc, side);
    const pileX = (a) => side * (a * 0.5 + 1.15);
    const pileZ = -1.45;
    const slotTop = cartTopY() + 0.2 - CART_H * CON.cartW; // top of the seated cartridge
    const P3 = (x, y, z) => ({ x, y, z });
    function spot(name, a, out) {
      const s = side;
      switch (name) {
        case 'offA': return Object.assign(out, P3(xc + s * (a * 0.5 + 2.4), YF - 0.7, -2.3));
        case 'raise': return Object.assign(out, P3(spots.top.x + s * 0.05, spots.top.y - 0.62 * thumpHard, spots.top.z));
        case 'thump': return Object.assign(out, P3(spots.top.x, spots.top.y, spots.top.z));
        case 'rebound': return Object.assign(out, P3(spots.top.x + s * 0.08, spots.top.y - 0.16, spots.top.z));
        case 'powerA': return Object.assign(out, P3(spots.power.x + s * 0.2, spots.power.y - 0.08, spots.power.z));
        case 'powerB': return Object.assign(out, P3(spots.power.x - s * 0.02, spots.power.y, spots.power.z));
        case 'powerC': return Object.assign(out, P3(spots.power.x + s * 0.28, spots.power.y - 0.22, spots.power.z - 0.1));
        case 'cartAbove': return Object.assign(out, P3(xc + s * 0.05, slotTop - 0.22, CON.slotZ - 0.1));
        case 'cartGrip': return Object.assign(out, P3(xc, slotTop, CON.slotZ - 0.05));
        case 'yank': return Object.assign(out, P3(xc + s * 0.05, slotTop - 0.6, CON.slotZ - 0.2));
        case 'blow': return Object.assign(out, P3(xc + s * 0.12, -0.05, -2.75));
        case 'blow2': return Object.assign(out, P3(xc + s * 0.1, -0.08, -2.78));
        case 'look': return Object.assign(out, P3(xc + s * 0.22, -0.32, -2.55));
        case 'windup': return Object.assign(out, P3(xc + s * 0.05, -0.4, -2.45));
        case 'release': return Object.assign(out, P3(xc + s * 0.75, -0.3, -2.2));
        case 'chosen': { const c = pile.chosen; return Object.assign(out, P3(pileX(a) + c.du, YF - 0.08 - CART_H * CON.cartW, pileZ + c.dz - 0.04)); }
        case 'chosenAbove': { const c = pile.chosen; return Object.assign(out, P3(pileX(a) + c.du - s * 0.05, YF - 0.3 - CART_H * CON.cartW, pileZ + c.dz - 0.1)); }
        case 'show': return Object.assign(out, P3(xc + s * 0.3, -0.5, -3.15));
        case 'show2': return Object.assign(out, P3(xc + s * 0.28, -0.48, -3.12));
        case 'slotAbove': return Object.assign(out, P3(xc, slotTop - 0.32, CON.slotZ - 0.05));
        case 'slotIn': return Object.assign(out, P3(xc, slotTop, CON.slotZ - 0.05));
        case 'powerA2': return Object.assign(out, P3(spots.power.x - s * 0.16, spots.power.y - 0.1, spots.power.z));
        case 'powerOn': return Object.assign(out, P3(spots.power.x + s * 0.03, spots.power.y, spots.power.z));
        default: return Object.assign(out, P3(xc + s * (a * 0.5 + 2.6), YF - 0.9, -2.4));
      }
    }
    // where the elbow sits relative to the hand: below and toward the lens by default; level and
    // out to the side when the hand works on the console (it comes in from the side, not from below)
    const EL = [0.6, 0.55], SIDE = [1.0, 0.02];
    const HK = [
      { t: 1.7, at: 'offA', pose: 'reach', bend: 0.15, c: 'fist', el: SIDE },
      { t: 2.08, at: 'raise', pose: 'fist', bend: -0.35, c: 'fist', e: 'outCubic', el: SIDE },
      { t: T.thump, at: 'thump', pose: 'fist', bend: -0.2, c: 'fist', e: 'inQuad', el: SIDE },
      { t: 2.44, at: 'rebound', pose: 'fist', bend: -0.1, c: 'fist', e: 'outCubic', el: SIDE },
      { t: 2.63, at: 'powerA', pose: 'point', bend: 0.1, c: 'point', e: 'inOutCubic', el: SIDE },
      { t: T.flick, at: 'powerB', pose: 'point', bend: 0.12, c: 'point', e: 'inQuad', el: SIDE },
      { t: 2.98, at: 'powerC', pose: 'relax', bend: 0.2, c: 'point', e: 'outCubic', el: SIDE },
      { t: 3.26, at: 'powerC', pose: 'relax', bend: 0.2, c: 'point', el: SIDE },
      { t: 3.38, at: 'cartAbove', pose: 'open', bend: 0.35, c: 'grip', e: 'inOutCubic' },
      { t: T.grip, at: 'cartGrip', pose: 'grip', bend: 0.4, c: 'grip', e: 'outQuad' },
      { t: T.yank, at: 'yank', pose: 'grip', bend: 0.3, c: 'grip', e: 'outBack' },
      { t: T.blow, at: 'blow', pose: 'grip', bend: -0.6, c: 'grip', e: 'inOutCubic' },
      { t: 4.45, at: 'blow2', pose: 'grip', bend: -0.6, c: 'grip' },
      { t: T.look, at: 'look', pose: 'grip', bend: 0.25, c: 'grip', e: 'inOutCubic' },
      { t: T.nah, at: 'look', pose: 'grip', bend: 0.25, c: 'grip' },
      { t: 4.97, at: 'windup', pose: 'grip', bend: 0.05, c: 'grip', e: 'inOutSine' },
      { t: T.release + 0.06, at: 'release', pose: 'open', bend: 0.5, c: 'grip', e: 'outCubic' },
      { t: 5.3, at: 'chosenAbove', pose: 'open', bend: 0.4, c: 'grip', e: 'inOutCubic' },
      { t: T.pick, at: 'chosen', pose: 'grip', bend: 0.45, c: 'grip', e: 'outQuad' },
      { t: T.show, at: 'show', pose: 'grip', bend: 0.1, c: 'grip', e: 'outCubic' },
      { t: T.show2, at: 'show2', pose: 'grip', bend: 0.1, c: 'grip' },
      { t: 6.28, at: 'slotAbove', pose: 'grip', bend: 0.35, c: 'grip', e: 'inOutCubic' },
      { t: T.insert, at: 'slotIn', pose: 'grip', bend: 0.4, c: 'grip', e: 'inQuad' },
      { t: 6.55, at: 'powerA2', pose: 'point', bend: 0.1, c: 'point', e: 'inOutCubic', el: SIDE },
      { t: T.power, at: 'powerOn', pose: 'point', bend: 0.1, c: 'point', e: 'inQuad', el: SIDE },
      { t: 7.0, at: 'offB', pose: 'relax', bend: 0.2, c: 'point', e: 'inCubic' },
    ];
    const HW = { x: 0, y: 0, z: 0 }, HW2 = { x: 0, y: 0, z: 0 };
    const pose = makePose(), poseB = makePose();
    const cA = { x: 0, y: 0 }, cB = { x: 0, y: 0 };
    const hand = { on: false, x: 0, y: 0, s: 0, rot: 0, flip: 1, cx: 0, cy: 0, k: 0, pose, arm: new Float32Array(9) };
    function handAt(t, a, w, h) {
      hand.on = t > HK[0].t && t < HK[HK.length - 1].t;
      if (!hand.on) return hand;
      let i = 0;
      while (i < HK.length - 2 && t >= HK[i + 1].t) i++;
      const k0 = HK[i], k1 = HK[i + 1];
      const e = (ease[k1.e || 'inOutSine'])(seg(t, k0.t, k1.t));
      spot(k0.at, a, HW); spot(k1.at, a, HW2);
      const x = lerp(HW.x, HW2.x, e), y = lerp(HW.y, HW2.y, e), z = lerp(HW.z, HW2.z, e);
      blendPose(POSES[k0.pose], POSES[k1.pose], clamp(e, 0, 1), pose);
      contact(k0.c, pose, cA); contact(k1.c, pose, cB);
      const lx = lerp(cA.x, cB.x, clamp(e, 0, 1)), ly = lerp(cA.y, cB.y, clamp(e, 0, 1));
      // the arm, in the room: an elbow nearer the lens and off to the side, a shoulder nearer still
      const ez = Math.max(cam.z + 0.45, z - 0.95), sz = Math.max(cam.z + 0.22, z - 1.9);
      const el0 = k0.el || EL, el1 = k1.el || EL, ee = clamp(e, 0, 1);
      const elx = lerp(el0[0], el1[0], ee), ely = lerp(el0[1], el1[1], ee);
      proj(cam, x + side * elx, y + ely, ez, _);
      const ex = _.x, ey = _.y, ek = _.k;
      proj(cam, x + side * (elx + 0.55), y + ely + 0.5, sz, _);
      const sx = _.x, sy = _.y, sk = _.k;
      proj(cam, x, y, z, _);
      const s = _.k * HAND;
      let rot = Math.atan2(_.y - ey, _.x - ex) + lerp(k0.bend, k1.bend, clamp(e, 0, 1)) * -side;
      // the nah: a little shake of the cartridge
      if (t > T.look && t < T.nah) rot += Math.sin((t - T.look) * 34) * 0.07 * pulse(t, T.look, T.nah, 0.05);
      const flip = side > 0 ? -1 : 1;
      const c = Math.cos(rot), sn = Math.sin(rot);
      hand.x = _.x - (c * lx - sn * ly * flip) * s;
      hand.y = _.y - (sn * lx + c * ly * flip) * s;
      hand.s = s; hand.rot = rot; hand.flip = flip; hand.cx = _.x; hand.cy = _.y; hand.k = _.k; hand.z = z;
      const ARM = hand.arm;
      ARM[0] = hand.x; ARM[1] = hand.y; ARM[2] = s * 0.22;
      ARM[3] = ex; ARM[4] = ey; ARM[5] = ek * 0.15;
      ARM[6] = sx; ARM[7] = sy; ARM[8] = sk * 0.22;
      return hand;
    }

    // the old cartridge's roll in the hand, and the new one's
    function oldCartRot(t) {
      if (t < T.yank) return 0;
      if (t < T.blow) return lerp(0, Math.PI - side * 0.3, ease.inOutCubic(seg(t, T.yank, T.blow)));
      if (t < 4.45) return Math.PI - side * 0.3 + Math.sin(t * 11) * 0.03;
      if (t < T.look) return lerp(Math.PI - side * 0.3, side * 0.22, ease.inOutCubic(seg(t, 4.45, T.look)));
      if (t < T.nah) return side * 0.22 + Math.sin((t - T.look) * 34) * 0.1 * pulse(t, T.look, T.nah, 0.05);
      return lerp(side * 0.22, -side * 0.35, ease.inOutSine(seg(t, T.nah, T.release)));
    }
    function newCartRot(t) {
      const c = pile.chosen;
      if (t < T.show) return lerp(c.rot, side * 0.08, ease.outCubic(seg(t, T.pick, T.show)));
      if (t < 6.28) return side * 0.08 + Math.sin((t - T.show) * 4) * 0.015;
      return lerp(side * 0.08, 0, ease.inOutCubic(seg(t, T.show2, 6.28)));
    }

    // --- light ---------------------------------------------------------------------------------
    const L = {
      key: [0, 0, 0], keyI: 0, moon: [0.55, 0.65, 1.0], moonI: 1,
      amb: [0, 0, 0], amb2: [0, 0, 0], moonAdd: [0, 0, 0], bezelAdd: [0, 0, 0], topAdd: [0, 0, 0], topAdd2: [0, 0, 0], sideAdd: [0, 0, 0], frontAdd: [0, 0, 0],
      rim: [0, 0, 0], labelI: 1,
    };
    const snowCol = [0.78, 0.82, 0.95], bootCol = [0.35, 0.33, 0.45];
    function lightAt(t) {
      let col = fromLight, I = 0;
      if (t < T.flick) { I = 1; if (t >= T.thump && t < T.thump + 0.1) I = 1.5; }
      else if (t < T.off1) I = 1.3 * (1 - ease.outQuad(seg(t, T.flick, T.off1)));
      else if (t < T.power) I = 0;
      else if (t < T.snow1) { col = snowCol; I = 0.85 * (0.8 + 0.2 * Math.sin(t * 90)); }
      else if (t < T.roll0) { col = bootCol; I = 0.3; }
      else { col = toLight; I = 0.3 + 0.75 * ease.outQuad(seg(t, T.roll0, T.roll1)); }
      if (t < T.lock) I *= 0.88 + 0.12 * Math.sin(Math.floor(t * 15) * 7.31);
      L.keyI = I;
      for (let i = 0; i < 3; i++) L.key[i] = col[i] * I;
      const ex = ease.inOutSine(seg(t, T.pull0, T.pull0 + 0.7));
      // with the tube dark the moon has the room to itself, and the eye opens up to it
      const dk = 1 - clamp(I, 0, 1);
      const m = (0.42 + 0.35 * dk) * ex;
      for (let i = 0; i < 3; i++) {
        L.amb[i] = (0.3 + 0.14 * L.moon[i] + 0.1 * dk * L.moon[i]) * ex + L.key[i] * 0.3;
        L.amb2[i] = L.amb[i] * 0.55;
        L.moonAdd[i] = L.moon[i] * m * 0.5;
        L.bezelAdd[i] = L.key[i] * 0.22;
        L.topAdd[i] = L.key[i] * 0.85 + L.moon[i] * m * 0.2;
        L.topAdd2[i] = L.key[i] * 0.2 + L.moon[i] * m * 0.2;
        L.sideAdd[i] = L.key[i] * 0.15 + L.moon[i] * m * 0.3;
        L.frontAdd[i] = L.key[i] * 0.05 + L.moon[i] * m * 0.35;
        L.rim[i] = L.key[i] * 1.1 + L.moon[i] * m * 0.9;
      }
      L.moonI = ex;
      L.labelI = clamp(0.35 * ex + I * 0.6, 0, 1);
      return L;
    }

    // --- the drawn layer -------------------------------------------------------------------------
    const Pf = { x: 0, y: 0, k: 0, d: 0 };
    const grain = makeCanvas(128, 128);
    {
      const id = grain.g.createImageData(128, 128);
      let s = 1 + Math.floor(rng() * 1e6);
      for (let i = 0; i < id.data.length; i += 4) { s = (s * 16807) % 2147483647; const v = s / 2147483647; id.data[i] = id.data[i + 1] = id.data[i + 2] = v > 0.5 ? 255 : 0; id.data[i + 3] = Math.floor(Math.abs(v - 0.5) * 2 * 40); }
      grain.g.putImageData(id, 0, 0);
    }
    const puff = makeCanvas(64, 64);
    {
      const gr = puff.g.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      puff.g.fillStyle = gr; puff.g.fillRect(0, 0, 64, 64);
    }
    const cartLight = [0, 0, 0];
    const lr = { amb: [0, 0, 0], rim: [0, 0, 0], lx: 0, ly: -1 };

    // where the old cartridge is: in the slot, in the hand, in the air, or on the heap
    const CT = { x: 0, y: 0, s: 0, rot: 0, squash: 1, clip: null };
    function oldCart(t, a, w, h) {
      CT.clip = null; CT.squash = 1;
      if (t < T.grip) {
        proj(cam, xc, cartTopY() + 0.2, CON.slotZ, _);
        CT.x = _.x; CT.y = _.y; CT.s = _.k * CON.cartW; CT.rot = 0;
        proj(cam, xc, cartTopY(), CON.slotZ - 0.035, Pf); CT.clip = Pf.y;
        return 'slot';
      }
      if (t < T.release) {
        const r = oldCartRot(t), s = hand.k * CON.cartW;
        CT.rot = r; CT.s = s;
        CT.x = hand.cx - Math.sin(r) * CART_H * s;
        CT.y = hand.cy + Math.cos(r) * CART_H * s;
        if (t < T.yank) { proj(cam, xc, cartTopY(), CON.slotZ - 0.035, Pf); CT.clip = Pf.y; }
        return 'hand';
      }
      if (t < T.land) {
        // in the air: from the hand's last grip toward the top of the heap, spinning
        const p = seg(t, T.release, T.land);
        const r0 = oldCartRot(T.release);
        handAt(T.release, a, w, h);
        const s0 = hand.k * CON.cartW;
        const x0 = hand.cx - Math.sin(r0) * CART_H * s0 * 0.5, y0 = hand.cy + Math.cos(r0) * CART_H * s0 * 0.5;
        proj(cam, pileX(a) + landing.u, YF - 0.18, pileZ + landing.v, _);
        const s1 = _.k * CON.cartW;
        CT.x = lerp(x0, _.x, p); CT.y = lerp(y0, _.y, p) - Math.sin(p * Math.PI) * h * 0.12;
        CT.s = lerp(s0, s1, p); CT.rot = r0 + side * p * 4.4;
        CT.squash = lerp(1, 0.45, ease.inQuad(p));
        // move the anchor from the top to the middle: it spins about its centre
        CT.x += Math.sin(CT.rot) * CART_H * CT.s * 0.5; CT.y -= Math.cos(CT.rot) * CART_H * CT.s * 0.5 * CT.squash;
        return 'air';
      }
      return 'heap';
    }
    const NC = { x: 0, y: 0, s: 0, rot: 0, clip: null };
    function newCart(t, a) {
      NC.clip = null;
      const c = pile.chosen;
      if (t < T.pick) {
        proj(cam, pileX(a) + c.du, YF - 0.06, pileZ + c.dz, _);
        NC.x = _.x; NC.y = _.y; NC.s = _.k * CON.cartW; NC.rot = c.rot;
        return 'heap';
      }
      if (t < T.insert) {
        const r = newCartRot(t), s = hand.k * CON.cartW;
        NC.rot = r; NC.s = s;
        NC.x = hand.cx - Math.sin(r) * CART_H * s;
        NC.y = hand.cy + Math.cos(r) * CART_H * s;
        if (t > 6.2) { proj(cam, xc, cartTopY(), CON.slotZ - 0.035, Pf); NC.clip = Pf.y; }
        return 'hand';
      }
      proj(cam, xc, cartTopY() + 0.2, CON.slotZ, _);
      NC.x = _.x; NC.y = _.y; NC.s = _.k * CON.cartW; NC.rot = 0;
      proj(cam, xc, cartTopY(), CON.slotZ - 0.035, Pf); NC.clip = Pf.y;
      return 'slot';
    }

    function cartOpts(o, shell, label, t, contacts, labelLight, sheen) {
      o.shell = shell; o.label = label; o.L = cartLight; o.rim = lr.rim; o.edge = side; o.contacts = contacts;
      o.labelLight = labelLight; o.sheen = sheen; o.tilt = 0; o.back = false; o.squash = 1;
      return o;
    }
    const CO = {};
    function drawCartAt(g, P, o, clipY, w) {
      if (clipY != null) { g.save(); g.beginPath(); g.rect(-w, -1e4, w * 3, clipY + 1e4); g.clip(); }
      if (P.squash !== 1) {
        g.save(); g.translate(P.x, P.y); g.scale(1, P.squash); drawCart(g, 0, 0, P.s, P.rot, o); g.restore();
      } else drawCart(g, P.x, P.y, P.s, P.rot, o);
      if (clipY != null) g.restore();
    }

    function drawDust(g, t, w, h) {
      // each blow: a puff from the edge connector, the last one an absurd cloud
      for (let pi = 0; pi < puffs.length; pi++) {
        const tp = puffs[pi], age0 = t - tp;
        if (age0 < 0 || age0 > 1.6) continue;
        const big = pi === puffs.length - 1;
        // where the connector was at that moment
        handAt(tp, cam.w / cam.h, w, h);
        const r = oldCartRot(tp), s = hand.k * CON.cartW;
        const ox = hand.cx - Math.sin(r) * CART_H * s * 1.0, oy = hand.cy + Math.cos(r) * CART_H * s * 1.0;
        const n = big ? dust.length : 14, scale = s * (big ? 1.5 : 0.45);
        // the poof: a dense soft core that blooms out and thins
        const core = big ? 1 - ease.inQuad(seg(age0, 0, 0.55)) : 0.6 * (1 - seg(age0, 0, 0.25));
        if (core > 0) {
          const cr = scale * (0.25 + 0.75 * ease.outCubic(seg(age0, 0, big ? 0.5 : 0.25))) * (big ? 0.9 : 0.5);
          g.globalAlpha = core * (big ? 0.75 : 0.45);
          g.drawImage(puff.canvas, ox - cr, oy - cr * 1.15, cr * 2, cr * 2);
        }
        for (let i = 0; i < n; i++) {
          const d = dust[i], age = age0 - (i % 5) * 0.012;
          if (age <= 0 || age > d.life * (big ? 1 : 0.6)) continue;
          const k = age / (d.life * (big ? 1 : 0.6));
          const travel = d.sp * (1 - Math.exp(-age * 4)) / 4 * 4;
          const dx = Math.cos(d.a) * travel * scale, dy = Math.sin(d.a) * travel * scale * 0.7 - scale * 0.25 * travel + d.fall * age * age * scale;
          const x = ox + dx + Math.sin(age * 3 + i) * scale * 0.03, y = oy + dy;
          if (d.speck) {
            g.globalAlpha = (1 - k) * 0.9;
            g.fillStyle = css(mix3([0.9, 0.85, 0.75], lr.rim, 0.5), 1);
            const q = Math.max(1, scale * 0.012);
            g.fillRect(x, y, q, q);
          } else {
            const rr = scale * d.r * (0.5 + 1.8 * ease.outCubic(k));
            g.globalAlpha = (1 - ease.inQuad(k)) * (big ? 0.42 : 0.22);
            g.drawImage(puff.canvas, x - rr, y - rr, rr * 2, rr * 2);
          }
        }
        g.globalAlpha = 1;
      }
    }

    function drawNoteOnTV(g, scr) {
      if (!noteLines && !ctx.matchPoint) return;
      const k = scr.k, s = k * 0.42;
      if (s < 18) return;
      const x = side > 0 ? scr.x0 - k * 0.06 : scr.x1 + k * 0.06 - s, y = scr.y1 + k * 0.05;
      g.save();
      g.translate(x + s / 2, y + s / 2);
      g.rotate(side * -0.08);
      g.fillStyle = 'rgba(0,0,0,0.4)'; g.fillRect(-s / 2 + s * 0.05, -s / 2 + s * 0.06, s, s);
      g.fillStyle = `rgb(${Math.round(255 * Math.min(1, 0.95 * (L.amb[0] + L.key[0] * 0.3 + 0.1)))},${Math.round(225 * Math.min(1, 0.95 * (L.amb[1] + L.key[1] * 0.3 + 0.1)))},${Math.round(100 * Math.min(1, 0.95 * (L.amb[2] + L.key[2] * 0.3 + 0.1)))})`;
      g.fillRect(-s / 2, -s / 2, s, s);
      g.textBaseline = 'middle'; g.textAlign = 'left';
      const ink = 'rgba(30,25,60,0.9)';
      if (noteLines) {
        noteLines.forEach(([nm, sc], i) => {
          const yy = -s * 0.28 + i * s * 0.26;
          const txt = String(nm).toUpperCase();
          let fs = s * 0.13;
          g.font = `${fs}px ${HAND_FONT}`;
          const tw = g.measureText(txt).width;
          if (tw > s * 0.5) { fs *= (s * 0.5) / tw; g.font = `${fs}px ${HAND_FONT}`; }
          g.fillStyle = ink;
          g.fillText(txt, -s * 0.42, yy);
          g.strokeStyle = ink; g.lineWidth = Math.max(1, s * 0.018);
          for (let j = 0; j < Math.min(9, sc); j++) {
            const tx = s * 0.12 + (j % 5) * s * 0.05 + Math.floor(j / 5) * s * 0.06;
            g.beginPath();
            if (j % 5 === 4) { g.moveTo(tx - s * 0.24, yy + s * 0.05); g.lineTo(tx, yy - s * 0.05); } else { g.moveTo(tx - s * 0.03, yy - s * 0.07); g.lineTo(tx - s * 0.03, yy + s * 0.07); }
            g.stroke();
          }
        });
      }
      if (ctx.matchPoint) {
        g.font = `700 ${s * 0.12}px ${HAND_FONT}`;
        g.fillStyle = '#d23a2a'; g.textAlign = 'center';
        g.fillText('MATCH POINT!', 0, s * 0.32);
      }
      g.restore();
    }

    function drawRoom(g, t, w, h, scrOut) {
      const a = w / h;
      lightAt(t);
      const tvOff = { x: 0, y: 0 };
      const jolt = t > T.thump ? Math.exp(-(t - T.thump) * 14) * thumpHard : 0;
      tvOff.y = -Math.abs(Math.sin((t - T.thump) * 40)) * 0.03 * jolt;
      const wy = drawWall(g, cam, room, L, a, w, h);
      drawFloor(g, cam, room, L, a, wy, w, h, Pf);
      const scr = drawTV(g, cam, room, L, a, tvOff);
      drawNoteOnTV(g, scr);
      Object.assign(scrOut, scr);
      const dark = 1 - clamp(L.keyI, 0, 1);
      drawGlass(g, scr, L, dark, room);
      // the tube's glow spilling over the bezel
      if (L.keyI > 0.02) {
        const cx = (scr.x0 + scr.x1) / 2, cy = (scr.y0 + scr.y1) / 2, R = (scr.x1 - scr.x0) * 0.85;
        const gl = g.createRadialGradient(cx, cy, R * 0.35, cx, cy, R);
        gl.addColorStop(0, css(L.key, 0.16)); gl.addColorStop(1, css(L.key, 0));
        g.globalCompositeOperation = 'lighter';
        g.fillStyle = gl; g.fillRect(cx - R, cy - R, R * 2, R * 2);
        g.globalCompositeOperation = 'source-over';
      }
      // the console, the cartridge in its slot (or not), the heap, the pads
      for (let i = 0; i < 3; i++) { cartLight[i] = L.amb[i]; lr.amb[i] = L.amb[i]; lr.rim[i] = L.rim[i]; }
      const bump = t > T.thump ? Math.abs(Math.sin((t - T.thump) * 30)) * Math.exp(-(t - T.thump) * 10) * 0.035 * thumpHard : 0;
      const st = { bump, slotOpen: t > T.grip && t < T.insert ? 1 : 0, power: t < T.flick ? 1 : t < T.power ? 0 : 1, reset: 0, led: t < T.flick || t > T.power ? 1 : 0 };
      if (t > T.flick - 0.06 && t < T.flick) st.power = 1 - seg(t, T.flick - 0.06, T.flick);
      if (t > T.power - 0.06 && t < T.power) st.power = seg(t, T.power - 0.06, T.power);
      // anything the lens has passed (on the way out of the glass or back into it) is not drawn
      const seen = (z) => z - cam.z > 0.25;
      if (!seen(CON.z0)) { drawDust(g, t, w, h); return scr; }
      drawConsole(g, cam, xc, side, look, L, st, Pf);
      const a2 = cam.w / cam.h;
      handAt(t, a2, w, h);
      const oc = oldCart(t, a2, w, h);
      handAt(t, a2, w, h);
      const nc = newCart(t, a2);
      const held = hand.on && ((oc === 'hand') || (nc === 'hand'));
      // light direction for the rims: from the hand toward the glass (or the window, when it is dark)
      const kx = (scr.x0 + scr.x1) / 2, ky = (scr.y0 + scr.y1) / 2;
      lr.lx = L.keyI > 0.1 ? kx - hand.cx : -side * w; lr.ly = L.keyI > 0.1 ? ky - hand.cy : -h * 0.6;
      if (oc === 'slot') drawCartAt(g, CT, cartOpts(CO, shellOld, oldLabel, t, 0, L.labelI, 0), CT.clip, w);
      if (nc === 'slot') drawCartAt(g, NC, cartOpts(CO, shellNew, newLabel, t, 0, L.labelI, 0), NC.clip, w);
      drawConsoleFront(g, cam, xc, side, look, L, st, Pf);
      if (seen(Math.min(pads[0].z, pads[1].z) - 1.0)) drawPads(g, cam, xc, side, pads, look, L, Pf);
      // the heap
      const px = pileX(a2);
      const landed = t >= T.land;
      const bounce = landed ? Math.abs(Math.sin((t - T.land) * 18)) * Math.exp(-(t - T.land) * 9) : 0;
      if (landed) landing.layer = 2 + bounce * 1.5;
      // the heap lies on the carpet as flat, affine-mapped cards: near the lens that map breaks
      if (seen(pileZ - 1.1)) drawPileFlat(g, cam, px, pileZ, pile, L, Pf, landed ? landing : null);
      if (seen(pileZ - 0.7)) for (const c of pile.lean) {
        if (c.chosen && nc !== 'heap') continue;
        proj(cam, px + c.du, YF - 0.06, pileZ + c.dz, _);
        const o = cartOpts(CO, c.shell, c.label, t, 0, L.labelI * 0.85, 0);
        o.tilt = c.tilt;
        drawCart(g, _.x, _.y, _.k * CON.cartW, c.rot, o);
      }
      if (oc === 'air') drawCartAt(g, CT, cartOpts(CO, shellOld, oldLabel, t, 0.6, L.labelI, 0), null, w);
      // the hand, and whatever it holds between its fingers and its thumb
      if (hand.on) {
        drawArm(g, hand.arm, hand.s, handLook, lr);
        drawHand(g, hand.x, hand.y, hand.s, hand.rot, hand.flip, hand.pose, handLook, lr, held ? 'back' : 'all');
        if (oc === 'hand') {
          const blowing = t > T.yank && t < T.look;
          // near the lens the label catches more of whatever light there is
          const ll = clamp(L.labelI + 0.25, 0, 1);
          drawCartAt(g, CT, cartOpts(CO, shellOld, oldLabel, t, blowing ? 1 : 0.5, ll, pulse(t, 4.5, T.nah, 0.15)), CT.clip, w);
        }
        if (nc === 'hand') {
          const ll = clamp(L.labelI + 0.45 * pulse(t, T.pick + 0.1, 6.3, 0.25), 0, 1);
          drawCartAt(g, NC, cartOpts(CO, shellNew, newLabel, t, 0.5, ll, pulse(t, T.show - 0.25, T.show2, 0.2)), NC.clip, w);
        }
        if (held) drawHand(g, hand.x, hand.y, hand.s, hand.rot, hand.flip, hand.pose, handLook, lr, 'front');
      }
      drawDust(g, t, w, h);
      return scr;
    }

    const scr = { x0: 0, y0: 0, x1: 1, y1: 1, r: 0, k: 1 };
    let grainPat = null;
    // the whole frame but the glass (kit's roundRect would start a new path)
    function frameMinusGlass(g, w, h, s) {
      const r = Math.min(s.r, (s.x1 - s.x0) / 2, (s.y1 - s.y0) / 2);
      g.beginPath();
      g.rect(0, 0, w, h);
      g.moveTo(s.x0 + r, s.y0);
      g.arcTo(s.x1, s.y0, s.x1, s.y1, r); g.arcTo(s.x1, s.y1, s.x0, s.y1, r);
      g.arcTo(s.x0, s.y1, s.x0, s.y0, r); g.arcTo(s.x0, s.y0, s.x1, s.y0, r);
      g.closePath();
    }
    return {
      update(dt, t) {
        while (cueAt < cues.length && t >= cues[cueAt].t) cues[cueAt++].fn();
      },

      render(t) {
        const g = ctx.g, w = ctx.width, h = ctx.height;
        renderer.setRenderTarget(null);
        if (ctx.toImage && !texTo) adoptTo(ctx.toImage);
        camAt(t, w, h);
        const roomOn = t > T.pull0 && t < T.push1;

        // ===== the drawn layer: the room around the glass ==========================================
        if (roomOn) {
          drawRoom(g, t, w, h, scr);
          // the room comes up out of the dark as the lens finds it
          const ex = ease.inOutSine(seg(t, T.pull0, T.pull0 + 0.6));
          const fade = ex * (1 - ease.inQuad(seg(t, T.push1 - 0.25, T.push1)));
          g.save();
          frameMinusGlass(g, w, h, scr);
          g.fillStyle = `rgba(4,2,10,${clamp(1 - ex, 0, 1) * 0.92})`;
          g.fill('evenodd');
          // vignette and grain
          const vg = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.hypot(w, h) * 0.6);
          vg.addColorStop(0, 'rgba(4,2,10,0)'); vg.addColorStop(1, `rgba(4,2,10,${0.55 * fade})`);
          g.fillStyle = vg;
          g.fill('evenodd');
          g.restore();
          grainPat ||= g.createPattern(grain.canvas, 'repeat');
          const f = Math.floor(t * 24);
          g.save();
          g.globalAlpha = 0.55 * fade;
          g.translate(-((f * 37) % 128), -((f * 71) % 128));
          g.fillStyle = grainPat;
          g.fillRect(0, 0, w + 128, h + 128);
          g.restore();
        } else {
          // full screen: the glass is the stage
          scr.x0 = 0; scr.y0 = 0; scr.x1 = w; scr.y1 = h; scr.k = h;
          if (t >= T.push1) { proj(cam, -w / h / 2, -0.5, 0, _); scr.x0 = _.x; scr.y0 = _.y; proj(cam, w / h / 2, 0.5, 0, _); scr.x1 = _.x; scr.y1 = _.y; }
        }

        // ===== the tube ============================================================================
        grid(w, h);
        U.uRes.value.set(w, h);
        // the glass's rectangle: wherever the lens puts it (exactly the stage at both ends)
        proj(cam, -w / h / 2, -0.5, 0, _);
        let x0 = _.x, y0 = _.y;
        proj(cam, w / h / 2, 0.5, 0, _);
        let x1 = _.x, y1 = _.y;
        if (roomOn) { x0 = scr.x0; y0 = scr.y0; x1 = scr.x1; y1 = scr.y1; }
        U.uRect.value.set(x0, y0, x1, y1);
        const screenH = y1 - y0;
        U.uT.value = t;
        const glass = Math.min(ease.inOutSine(seg(t, T.pull0, T.pull0 + 0.7)), 1 - ease.inOutSine(seg(t, T.glass0, T.push1)));
        U.uCurve.value = glass;
        U.uScan.value = glass;
        U.uLines.value = clamp(screenH / 3.2, 60, 240);
        U.uGlow.value = glass * 0.6;
        // the crash
        const step = t < T.lock ? Math.floor(t * 15) : t < T.thump ? Math.floor(T.lock * 15) : Math.floor(T.lock * 15) + 7;
        U.uStep.value = step;
        const k1 = seg(t, T.tear, T.lock);
        // it gets bad, not total: the canyon must stay recognisable under the crash until it is thumped
        U.uTear.value = t < T.tear ? 0 : 0.04 + 0.09 * k1 + (t > T.thump ? 0.14 : 0);
        U.uSpread.value = t < T.tear ? 0 : 3 + 60 * ease.inQuad(seg(t, T.tear, 0.9));
        U.uGarb.value = t < T.tear ? 0 : 0.07 + 0.17 * k1 + (t > T.thump ? 0.22 * thumpHard : 0);
        U.uSmear.value = t < T.smear ? 0 : 0.07 + 0.07 * seg(t, T.smear, T.lock) + (t > T.thump ? 0.12 : 0);
        U.uText.value = t < T.text ? 0 : 1;
        // the palette: flickers between right and wrong, then sticks wrong
        let palOn = 0;
        if (t >= T.pal1) palOn = t < T.pal1 + 0.16 ? (Math.floor(t * 30) % 2) : 1;
        U.uPalOn.value = palOn ? (t < T.pal2 ? 0.5 : t < T.thump ? 0.75 : 0.9) : 0;
        setPerm(t < T.pal2 ? 0 : t < T.thump ? 1 : 2);
        U.uJump.value = t > T.thump ? Math.round(jumpRows * ease.outCubic(seg(t, T.thump, T.thump + 0.12))) : 0;
        U.uDark.value = 0;
        U.uBright.value = 1 + (t > T.thump && t < T.thump + 0.08 ? 0.35 : 0);
        // what the tube shows
        U.uFromK.value = t < T.off1 + 0.05 ? 1 : 0;
        U.uOff.value = t < T.flick ? 0 : seg(t, T.flick, T.off1 + 0.15);
        U.uSnow.value = t < T.power ? 0 : pulse(t, T.power, T.snow1 + 0.02, 0.03);
        U.uBoot.value = t < T.snow1 ? 0 : pulse(t, T.snow1, T.boot1, 0.04);
        U.uToK.value = texTo && t >= T.roll0 ? ease.outQuad(seg(t, T.roll0, T.roll0 + 0.08)) : 0;
        U.uRoll.value = t < T.roll1 ? rollLen * Math.pow(1 - seg(t, T.roll0, T.roll1), 2.4) : 0;
        U.uJit.value = t < T.roll1 + 0.1 ? 0.6 * (1 - seg(t, T.roll0, T.roll1 + 0.1)) : 0;
        U.uAlpha.value = 1 - ease.inOutSine(seg(t, T.fade0, T.fade1));
        if (t >= T.push1) { U.uCurve.value = 0; U.uScan.value = 0; U.uGlow.value = 0; U.uRoll.value = 0; U.uJit.value = 0; }
        pass.render(renderer);
      },

      dispose() {
        drone.stop(0.05);
        for (const o of [texFrom, texTo, texText, texLogo, pass]) if (o) o.dispose();
        renderer.setRenderTarget(null);
        grainPat = null;
      },
    };
  },
};

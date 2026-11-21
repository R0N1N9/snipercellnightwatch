// SWALLOWED — the deep's own way out.
//
// CONCEPT
//   All duel long the kraken kept to the deep: it shoved, it blinded, it never killed. Now
//   the round is over and it finally takes an interest. The light goes out of the deep's
//   last frame, something vast rises behind the one who was shot, its arms unroll in round
//   every edge of the lens (suckers and cold blue lights sliding past the glass), and then
//   its eye comes up and fills the world and looks at you. It blinks. A jet of ink, a
//   groan below hearing, black. In the black the kraken's photophores drift loose, wind
//   into a slow galaxy, and settle on the outlines of the next world, drawn in points of
//   light; they pour into the eye as it opens one last time, and the next world is in its
//   pupil, small and round and bright. We fall in; the last ink tears away like smoke.
//   Nobody is taken. It only wanted a look. (The bookend of PLUNGE, which brings players
//   down into this world through a white curtain of bubbles: this one leaves through ink.)
//
// BEAT SHEET (8.8 s, swap at 4.44 s)
//   0.00         the deep's last frame, untouched (the cut in is invisible)
//   0.05 → 1.60  the light dims: highlights first, a shadow crossing the frame, all of it
//                colder; the lens creeps towards the one who was shot; a groan starts below
//   0.10 → 1.95  far below, behind the victim, a vast shape rises out of the murk: mantle,
//                blue lights, the pale glow of one eye (the victim stays in front of it)
//   0.55 → 3.00  the arms unroll in from the edges, one of them right across the glass,
//                suckers and lights sliding past; the dive computer counts the contact in
//   1.95 → 3.05  the head comes up out of the deep until the eye fills the frame; it settles
//   2.72         it finds you: the eye rolls round to the lens, the pupil opens, its lights ripple
//   3.16 → 3.62  it blinks, slowly (sometimes twice, or once half-way first)
//   3.60         the pupil snaps to a slit
//   3.66 → 4.26  INK: a jet from below the eye that billows over everything; the arms whip
//                back, the eye drops away; a sub-bass groan; black by 4.26
//   4.44         THE SWAP, in the black (a deep, soft thud)
//   4.32 → 5.40  specks of blue light wake one by one in the ink and drift
//   4.65 → 5.80  they wind into a slow spiral, a galaxy, centred where the eye will open
//   5.20 → 6.45  they leave the spiral and settle on the next world's outlines, taking its
//                colours (the next world, drawn in points of light); two brighter ones, in the
//                players' colours, circle the core with their names
//   4.70 → 6.20  a line in the dark, typed out like the dive computer's
//   6.30 → 6.90  the eye is there in the dark, closed, its lid lights glowing; the picture
//                of points pours into where its pupil will be
//   6.72 → 7.20  it opens: the next world is in the pupil, and lights the iris from inside
//   7.10 → 7.95  we fall into the pupil: the eye goes past the edges, the world rushes up
//   7.75 → 8.35  the ink at the edges tears away like smoke; the new world's name lands
//   8.45 → 8.78  the overlay fades onto the live new world; the last frame is clear
//
// AXES OF VARIATION (all from ctx.rng, in create())
//   1. the arms: from all round, from below, sweeping in from one side or down over the top;
//      five to seven, which one crosses the glass, each one's curl, timing, depth and writhe
//   2. the kraken's angle: the roll of its eye, which way its mantle trails, where it rises,
//      where it looks first, where the eye opens in the dark
//   3. the eye's colour: amber, gold, copper or bronze, with teal, violet or pale-gold flecks
//      or none; in the dark it shifts towards the next world's accent
//   4. the blink: one slow blink, a double blink, or a half-close and then the slow one
//   5. the galaxy: two to four arms, its winding, tilt and turn, and the order the specks
//      leave it in (from the core out, swept across, rising, or the strongest outlines first)
//   6. the ink: which side of the eye it jets from and the angle of the jet
//   7. the words: the dive computer's last reading and the line in the dark (names in it)
//
// CONTEXT
//   ctx.fromImage / ctx.from  the deep's frame is darkened and swayed in place, and the kraken
//                             is fogged into its own water colour; from the deep the mask's
//                             rim and vignette stay over everything we add (from anywhere
//                             else, the deep simply arrives in that world's frame)
//   ctx.focus                 where the lens creeps to, and the soft hole that keeps the one
//                             who was shot in front of the rising shape
//   ctx.winner / loser        two bright specks in their colours circle the galaxy's core
//                             with their names and go into the eye first; names in the line
//                             in the dark. A drawn round: two unnamed specks, its own line
//   ctx.how / score / matchPoint  the line over the title (score, how), MATCH POINT under it
//                             and a slow heartbeat in the black
//   ctx.to / toImage          its first frame is read once for the specks' places and
//                             colours and the light in the iris; it fills the pupil; its
//                             palette tints the specks and the eye's colour shift; its name
//                             and perspective are the title
import { seg, ease, lerp, clamp, clamp01, pulse, rand, randSign, pick, hexToRgb, mixHex, rgba, fitText, canvasTexture, makeCanvas, TAU } from '../kit.js';
import { PLAYER_COLORS } from '../contract.js';
import { makeTextures } from '../dimensions/abyss/textures.js';
import { BACK1, BACK2, ARM, INK } from './swallowed/shaders.js';
import { planArms, buildArms, TN } from './swallowed/arms.js';
import { makeSpecks } from './swallowed/specks.js';

const DURATION = 8.8;
const SWAP_AT = 0.505;
const T = {
  swap: DURATION * SWAP_AT, // 4.444
  dim0: 0.05, dim1: 1.6,
  rise0: 0.1, near0: 1.95, near1: 3.05,
  sees: 2.72, blink: 3.16, snap: 3.6,
  ink0: 3.66, recoil: 3.7, full0: 4.0, full1: 4.26,
  on0: 4.32, s0: 4.65, s1: 5.45, g0: 5.2, g1: 5.8, p0: 6.4, p1: 6.8,
  eye0: 6.3, open0: 6.72, open1: 7.2, fall0: 7.1, fall1: 7.95, tear0: 7.75, tear1: 8.35,
  exit0: 8.28, exit1: 8.45, fade0: 8.45, fade1: 8.78,
  line0: 4.7, line1: 6.2, cap0: 7.45, cap1: 8.62,
};
const MONO = "'JetBrains Mono', Menlo, monospace";
const HEAD = "'Rajdhani', 'Futura', sans-serif";
const AQUA = '#bff6ee', WARN = '#ff8a6a';
const IRIS = [
  [[0.16, 0.05, 0.01], [0.62, 0.36, 0.06], [0.34, 0.15, 0.02]],  // amber
  [[0.16, 0.08, 0.015], [0.62, 0.46, 0.12], [0.32, 0.22, 0.04]], // gold
  [[0.16, 0.035, 0.012], [0.6, 0.24, 0.07], [0.3, 0.09, 0.03]],  // copper
  [[0.12, 0.06, 0.02], [0.5, 0.34, 0.13], [0.24, 0.15, 0.06]],   // bronze
];
const FLECKS = [[0.2, 0.62, 0.48], [0.45, 0.4, 0.95], [1.0, 0.93, 0.65]];
const lin = (hex) => { const c = hexToRgb(hex); return [Math.pow(c.r / 255, 2.2), Math.pow(c.g / 255, 2.2), Math.pow(c.b / 255, 2.2)]; };

// The average colour of a frame, linear, read once at a few pixels' size.
function average(img) {
  try {
    const p = makeCanvas(4, 4);
    p.g.drawImage(img, 0, 0, 4, 4);
    const d = p.g.getImageData(0, 0, 4, 4).data;
    p.canvas.width = p.canvas.height = 1;
    const s = [0, 0, 0];
    for (let i = 0; i < 64; i += 4) for (let k = 0; k < 3; k++) s[k] += Math.pow(d[i + k] / 255, 2.2) / 16;
    return s;
  } catch { return [0.02, 0.08, 0.1]; }
}

export default {
  id: 'swallowed',
  name: 'SWALLOWED',
  duration: DURATION,
  swapAt: SWAP_AT,

  create(ctx) {
    const { THREE, renderer } = ctx.three;
    const A = ctx.audio, rng = ctx.rng;
    let soft = false;
    try {
      const gl = renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info');
      if (ext && /swiftshader|llvmpipe|software|basic render/i.test(String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)))) soft = true;
    } catch { /* masked: assume a GPU */ }
    const fromDeep = ctx.from.id === 'abyss';
    const W0 = Math.max(1, ctx.width), H0 = Math.max(1, ctx.height), ASP0 = W0 / H0;
    const pal = ctx.to.palette;

    // ---- decided once --------------------------------------------------------------------
    const armPlan = planArms(rng, soft);
    const side = randSign(rng);
    const roll1 = rand(rng, -0.28, 0.28), roll2 = rand(rng, -0.3, 0.3);
    const bodyAng = rand(rng, -0.55, 0.55);
    const riseOff = rand(rng, 0.08, 0.22) * randSign(rng);
    const endX = rand(rng, -0.05, 0.05), endY = rand(rng, -0.02, 0.05);
    const gaze0 = [rand(rng, 0.12, 0.2) * randSign(rng), rand(rng, -0.14, 0.02)];
    const iris = pick(rng, IRIS);
    const fleck = rng() < 0.75 ? pick(rng, FLECKS) : null;
    const blinkKind = pick(rng, ['slow', 'double', 'half']);
    const inkSide = randSign(rng), inkAng = rand(rng, 0.45, 1.05);
    const C2 = [rand(rng, -0.12, 0.12) * Math.min(1.6, ASP0), rand(rng, -0.04, 0.05)];
    const galaxy = { hand: randSign(rng), arms: pick(rng, [2, 2, 3, 4]), twist: rand(rng, 7, 13), tilt: rand(rng, -0.6, 0.6), incl: rand(rng, 0.5, 0.8), order: pick(rng, ['centre', 'sweep', 'rise', 'edges']), sweepDir: randSign(rng) };
    const orbit = [rand(rng, 0, TAU), rand(rng, 0, TAU)];
    const up = (s) => String(s || '').toUpperCase();
    const W = ctx.winner ? up(ctx.winner.name) : '', L = ctx.loser ? up(ctx.loser.name) : '';
    const readout = pick(rng, ['SIZE: YES', 'IT IS LOOKING', 'DO NOT BLINK', 'TOO CLOSE']);
    const darkLine = ctx.winner
      ? pick(rng, [`IT DIDN'T WANT ${L}. IT WANTED A LOOK.`, 'NOBODY WAS EATEN. EVERYBODY WAS SEEN.', `${W} TOOK THE POINT. THE DEEP TOOK AN INTEREST.`, 'IT KEEPS NOTHING. IT JUST MOVES YOU ON.'])
      : pick(rng, ['NOBODY SCORED. IT LOOKED ANYWAY.', 'NOBODY WAS EATEN. EVERYBODY WAS SEEN.']);
    const title = up(ctx.to.name).split('').join(' ');
    const sc = ctx.score || [0, 0];
    const names = [0, 1].map((i) => (ctx.winner && ctx.winner.index === i ? W : ctx.loser && ctx.loser.index === i ? L : ''));
    const scoreLine = ctx.winner ? `${names[0]}  ${sc[0]} — ${sc[1]}  ${names[1]}${ctx.how ? '  ·  ' + up(ctx.how) : ''}` : 'NO POINT · THE DEEP LETS YOU BOTH GO';
    const players = [ctx.winner, ctx.loser].map((p, i) => ({ col: p ? p.color : PLAYER_COLORS[i], name: p ? up(p.name) : '', r: [0.17, 0.27][i], ph: orbit[i] }));
    const nSpeck = soft ? 1100 : 2400;
    const glints = [];
    for (let i = 0; i < 11; i++) glints.push({ t: rand(rng, 4.4, 6.3), f: pick(rng, [587.33, 698.46, 783.99, 880, 1046.5, 1174.66]), pan: rand(rng, -0.7, 0.7), g: rand(rng, 0.014, 0.03) });
    const pops = [];
    for (const a of armPlan.arms) for (let i = 0; i < 3; i++) pops.push({ t: a.t0 + rand(rng, 0.2, a.dur), pan: clamp(Math.cos(a.th) * 0.8, -0.8, 0.8), f: rand(rng, 180, 340) });

    // ---- GPU -------------------------------------------------------------------------------
    // the deep's own noise and caustic net (read-only from the world), baked once
    const tex = makeTextures(THREE, renderer, soft);
    // srgb: false — the old frame goes straight back out, so frame 0 is the deep to the bit
    const texFrom = canvasTexture(THREE, ctx.fromImage, { srgb: false });
    let texTo = null;
    const V2 = (x, y) => new THREE.Vector2(x, y), V3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);
    const fromAvg = average(ctx.fromImage);
    const U = {
      uRes: { value: V2(W0, H0) }, uAsp: { value: ASP0 }, uT: { value: 0 }, uK: { value: 0 },
      uMaskK: { value: fromDeep ? 1 : 0 }, uVigK: { value: fromDeep ? 1 : 0.5 },
      tFrom: { value: texFrom }, tTo: { value: texFrom }, tNoise: { value: tex.noise }, tCaustic: { value: tex.caustic },
      uDim: { value: 0 }, uShade: { value: 0 }, uZoom: { value: 1 }, uWob: { value: 0 },
      uZoomC: { value: V2(clamp01(ctx.focus.x / W0), 1 - clamp01(ctx.focus.y / H0)) }, uShadeDir: { value: V2(side * 0.8, -0.6) },
      uEyeC: { value: V2(0, -1) }, uPup: { value: V2(0.58, 0.07) }, uGaze: { value: V2(0, 0) }, uBodyDir: { value: V2(Math.sin(bodyAng), -Math.cos(bodyAng)) },
      uEyeR: { value: 0.05 }, uRoll: { value: roll1 }, uLid: { value: 0 }, uHood: { value: 0.25 }, uBody: { value: 1 }, uSun: { value: 1 },
      uPhoto: { value: 0.7 }, uGlow: { value: 1 }, uInner: { value: 0 }, uFleckK: { value: fleck ? 0.8 : 0 }, uGlint: { value: 0 },
      uIrisA: { value: V3(iris[0]) }, uIrisB: { value: V3(iris[1]) }, uIrisC: { value: V3(iris[2]) }, uFleck: { value: V3(fleck || [0, 0, 0]) },
      uInnerCol: { value: V3([0.5, 0.6, 0.7]) }, uEnv: { value: V3(fromAvg.map((v) => v * 0.6)) },
      uEyeA: { value: 0 }, uDist: { value: 40 }, uHole: { value: 1 }, uFocus: { value: V2(clamp01(ctx.focus.x / W0), 1 - clamp01(ctx.focus.y / H0)) },
      uPhotoArm: { value: 1 }, uBump: { value: 0.55 }, uTorch: { value: 0 },
      uInk: { value: 0 }, uInkFull: { value: 0 }, uInkS: { value: V2(0, 0) }, uInkDir: { value: V2(0, 1) },
      uPic: { value: 0 }, uRho: { value: 0.1 }, uSc: { value: 0.2 }, uTear: { value: 0 }, uExit: { value: 0 }, uAlpha: { value: 1 }, uBright: { value: 1 }, uPicC: { value: V2(C2[0], C2[1]) },
    };
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
    const screenMat = (S, o = {}) => new THREE.ShaderMaterial({ vertexShader: S.vertexShader, fragmentShader: S.fragmentShader, uniforms: U, depthTest: false, depthWrite: false, ...o });
    const mBack1 = screenMat(BACK1, { blending: THREE.NoBlending });
    const mBack2 = screenMat(BACK2, { blending: THREE.NoBlending });
    const mInk = screenMat(INK, {
      transparent: true, blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
      blendEquationAlpha: THREE.AddEquation, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
    });
    // the arms share the frame's uniforms, with their own lights
    const mArm = new THREE.ShaderMaterial({ vertexShader: ARM.vertexShader, fragmentShader: ARM.fragmentShader, uniforms: { ...U, uPhoto: U.uPhotoArm }, side: THREE.DoubleSide });
    const quad = (m, order) => { const q = new THREE.Mesh(geo, m); q.frustumCulled = false; q.renderOrder = order; return q; };
    const scene1 = new THREE.Scene(), scene2 = new THREE.Scene();
    scene1.add(quad(mBack1, -1));
    const arms = buildArms(THREE, armPlan, mArm, soft);
    scene1.add(arms.group);
    scene1.add(quad(mInk, 9));
    scene2.add(quad(mBack2, -1));
    const specks = makeSpecks(THREE, rng, nSpeck, galaxy);
    scene2.add(specks.points);
    const camera = new THREE.PerspectiveCamera(50, ASP0, 0.05, 200);
    const vRes = V2(1, 1);
    for (const [s, c] of [[scene1, camera], [scene2, camera]]) { try { renderer.compile(s, c); } catch { /* compiled on first use */ } }
    const accent = lin(pal.accent || '#ffc861');
    specks.uniforms.uBleed.value.set(accent[0] ** 0.45, accent[1] ** 0.45, accent[2] ** 0.45);

    function adoptTo(img) {
      texTo = canvasTexture(THREE, img, { srgb: false });
      U.tTo.value = texTo;
      const a = average(img);
      const m = Math.max(a[0], a[1], a[2], 0.02);
      // the light that comes out of the pupil: the new world's own colour, brightened
      U.uInnerCol.value.set(lerp(a[0] / m, accent[0], 0.3) * 0.9, lerp(a[1] / m, accent[1], 0.3) * 0.9, lerp(a[2] / m, accent[2], 0.3) * 0.9);
      // the eye's colour shifts a little towards the next world's accent
      U.uIrisB.value.set(lerp(iris[1][0], Math.sqrt(accent[0]), 0.2), lerp(iris[1][1], Math.sqrt(accent[1]), 0.2), lerp(iris[1][2], Math.sqrt(accent[2]), 0.2));
    }

    // ---- the kraken's state at time t ------------------------------------------------------
    function blinkAt(t) {
      const b = T.blink;
      let v = ease.inQuad(seg(t, b, b + 0.2)) * (1 - ease.outCubic(seg(t, b + 0.28, b + 0.54)));
      if (blinkKind === 'double') v = Math.max(v, ease.inQuad(seg(t, b - 0.42, b - 0.33)) * (1 - ease.outQuad(seg(t, b - 0.3, b - 0.2))));
      if (blinkKind === 'half') v = Math.max(v, 0.55 * ease.inOutSine(seg(t, b - 0.62, b - 0.4)) * (1 - ease.inOutSine(seg(t, b - 0.3, b - 0.08))));
      return v;
    }
    const idR = 1 / 31, idN = 1 / 3.1;
    const ACT1 = { id: 0, x: 0, y: 0, R: 0 };
    function act1(t) {
      let id = t < T.near0 ? lerp(1 / 46, idR, ease.inOutSine(seg(t, T.rise0, T.near0))) : lerp(idR, idN, ease.inOutCubic(seg(t, T.near0, T.near1)));
      if (t > T.near1) id += idN * 0.035 * Math.sin((t - T.near1) * 6) * Math.exp(-(t - T.near1) * 3.5);
      id = lerp(id, idN * 0.42, ease.inQuad(seg(t, T.recoil, T.recoil + 0.6)));
      const fx = (U.uFocus.value.x - 0.5) * ASP0 + riseOff;
      const kr = ease.outSine(seg(t, T.rise0, T.near0)), kn = ease.inOutCubic(seg(t, T.near0 - 0.1, T.near1));
      ACT1.id = id;
      ACT1.R = (1.4 * id) / TN / 2;
      ACT1.x = lerp(fx, endX, kn) + 0.012 * Math.sin(t * 0.8);
      ACT1.y = lerp(lerp(-0.85, -0.2, kr), endY, kn) + 0.01 * Math.sin(t * 0.6 + 1) - 0.25 * ease.inQuad(seg(t, T.recoil, T.recoil + 0.6));
      return ACT1;
    }
    // Act 2: the pupil's radius on screen, the picture's scale, and the eye's centre
    const R0 = 0.36, PR0 = 0.22;
    const ACT2 = { rho: 0, sc: 0, cx: 0, cy: 0, pr: PR0, R: R0 };
    function act2(t) {
      const R = R0 * (1 + 0.1 * ease.inOutSine(seg(t, T.eye0, T.fall0)));
      const pr = lerp(PR0, 0.44, ease.inOutSine(seg(t, T.open1 - 0.2, T.fall1)));
      const sc0 = (PR0 * R0 * 1.1) / 0.5;
      const k = ease.inOutCubic(seg(t, T.fall0, T.fall1));
      ACT2.sc = lerp(sc0, 1, k);
      ACT2.rho = Math.max(ACT2.sc * 0.5, PR0 * R) + 0.9 * ease.inQuad(seg(t, T.fall1 - 0.3, T.tear1));
      ACT2.pr = pr;
      ACT2.R = ACT2.rho / pr;
      ACT2.cx = C2[0] * (1 - k);
      ACT2.cy = C2[1] * (1 - k);
      return ACT2;
    }

    // ---- sound: one-shots keyed to the timeline ------------------------------------------------
    const cues = [];
    const cue = (t, fn) => cues.push({ t, fn });
    cue(0.02, () => {
      // the hush deepens, and below it something starts to groan
      A.noise({ filter: 'lowpass', freq: 700, freqEnd: 170, q: 0.5, dur: 2.6, gain: 0.2, attack: 0.5 });
      A.tone({ freq: 40, freqEnd: 34, dur: 3.4, gain: 0.32, attack: 1.4 });
      A.tone({ type: 'sawtooth', freq: 54.5, freqEnd: 50, dur: 3.0, gain: 0.018, attack: 1.4 });
    });
    cue(0.3, () => A.noise({ filter: 'bandpass', freq: 1100, freqEnd: 260, q: 2, dur: 1.5, gain: 0.07, attack: 0.3 })); // the light going
    cue(1.05, () => {
      // the dive computer's sonar: a ping, and an echo that comes back far too soon
      A.tone({ freq: 1568, type: 'sine', dur: 1.4, gain: 0.07, attack: 0.005 });
      A.tone({ freq: 1575, type: 'sine', dur: 1.0, gain: 0.045, attack: 0.005, delay: 0.16, pan: 0.3 });
    });
    for (const a of armPlan.arms) {
      cue(a.t0 + 0.05, () => {
        const pan = clamp(Math.cos(a.th) * 0.85, -0.85, 0.85);
        A.noise({ filter: 'bandpass', freq: 320, freqEnd: 880, q: 2.5, dur: a.dur * 0.9, gain: a.hero ? 0.2 : 0.1, attack: 0.3, pan });
        A.noise({ filter: 'lowpass', freq: 260, freqEnd: 120, dur: a.dur, gain: a.hero ? 0.22 : 0.1, attack: 0.4, pan });
      });
    }
    // suckers letting go of the glass
    for (const p of pops) cue(p.t, () => A.tone({ type: 'sine', freq: p.f, freqEnd: p.f * 0.35, dur: 0.08, gain: 0.05, attack: 0.003, pan: p.pan }));
    cue(T.near0 - 0.1, () => {
      // the head rises: a swell in D, low and slow
      A.tone({ freq: 36.71, dur: 2.4, gain: 0.42, attack: 1.0 });
      A.tone({ type: 'sawtooth', freq: 55, freqEnd: 54, dur: 2.2, gain: 0.022, attack: 1.0 });
      A.tone({ type: 'triangle', freq: 73.42, dur: 2.0, gain: 0.05, attack: 1.1 });
      A.noise({ filter: 'lowpass', freq: 220, dur: 2.0, gain: 0.2, attack: 1.1 });
    });
    cue(T.sees - 0.02, () => {
      // it finds you: a low, interested hum
      A.tone({ type: 'triangle', freq: 98, freqEnd: 87.3, dur: 1.1, gain: 0.06, attack: 0.25 });
      A.tone({ type: 'sine', freq: 146.83, freqEnd: 138.6, dur: 1.0, gain: 0.03, attack: 0.3 });
      A.sfx('heartbeat', { gain: 0.4, pitch: 0.7 });
    });
    const blinkCue = (t, g) => cue(t, () => {
      A.noise({ filter: 'lowpass', freq: 480, freqEnd: 110, q: 0.9, dur: 0.38, gain: 0.26 * g, attack: 0.04 });
      A.tone({ freq: 72, freqEnd: 44, dur: 0.36, gain: 0.24 * g, attack: 0.02 });
    });
    blinkCue(T.blink + 0.02, 1);
    cue(T.blink + 0.3, () => A.noise({ filter: 'lowpass', freq: 260, freqEnd: 720, q: 0.8, dur: 0.3, gain: 0.12, attack: 0.05 }));
    if (blinkKind === 'double') blinkCue(T.blink - 0.42, 0.6);
    if (blinkKind === 'half') cue(T.blink - 0.6, () => A.noise({ filter: 'lowpass', freq: 380, freqEnd: 160, dur: 0.4, gain: 0.1, attack: 0.15 }));
    cue(T.snap, () => A.tone({ type: 'sine', freq: 2400, freqEnd: 1700, dur: 0.05, gain: 0.015, attack: 0.002 }));
    cue(T.ink0, () => {
      // the jet: a rush, and the groan dropping out of hearing
      A.noise({ filter: 'lowpass', freq: 1900, freqEnd: 140, q: 0.7, dur: 1.2, gain: 0.5, attack: 0.02, pan: inkSide * 0.3 });
      A.tone({ freq: 58, freqEnd: 26, dur: 2.3, gain: 0.55, attack: 0.03 });
      A.tone({ type: 'sawtooth', freq: 70, freqEnd: 36, dur: 1.8, gain: 0.05, attack: 0.05 });
      A.noise({ filter: 'bandpass', freq: 130, q: 1, dur: 1.7, gain: 0.3, attack: 0.1 });
      A.sfx('thud', { gain: 0.4, pitch: 0.5 });
    });
    cue(T.swap - 0.03, () => { A.sfx('boom', { gain: 0.3, pitch: 0.45 }); A.tone({ freq: 41, freqEnd: 30, dur: 1.6, gain: 0.3, attack: 0.01 }); });
    for (const g of glints) cue(g.t, () => { A.tone({ type: 'sine', freq: g.f, dur: 1.6, gain: g.g, attack: 0.01, pan: g.pan }); A.tone({ type: 'sine', freq: g.f * 2.01, dur: 0.5, gain: g.g * 0.3, attack: 0.005, pan: g.pan }); });
    cue(T.s0, () => {
      // the galaxy turning: a pad in D, and glitter
      A.tone({ freq: 146.83, dur: 2.6, gain: 0.05, attack: 1.0 });
      A.tone({ freq: 220, dur: 2.4, gain: 0.035, attack: 1.2 });
      A.tone({ freq: 329.63, dur: 2.0, gain: 0.018, attack: 1.3 });
      A.noise({ filter: 'highpass', freq: 5200, dur: 1.8, gain: 0.025, attack: 0.9 });
    });
    cue(T.g0, () => A.noise({ filter: 'bandpass', freq: 500, freqEnd: 3200, q: 1.6, dur: 1.2, gain: 0.05, attack: 0.9 }));
    [0, 1, 2, 3].forEach((i) => cue(T.g0 + 0.2 + i * 0.22, () => A.tone({ type: 'sine', freq: [587.33, 698.46, 880, 1174.66][i], dur: 1.2, gain: 0.03, attack: 0.01, pan: (i - 1.5) * 0.3 })));
    cue(T.eye0, () => {
      // the eye in the dark: the groan once more, nearer
      A.tone({ freq: 36.71, freqEnd: 34, dur: 1.8, gain: 0.4, attack: 0.35 });
      A.tone({ type: 'triangle', freq: 73.42, dur: 1.4, gain: 0.05, attack: 0.4 });
      A.noise({ filter: 'lowpass', freq: 200, dur: 1.4, gain: 0.18, attack: 0.4 });
    });
    cue(T.open0, () => A.noise({ filter: 'lowpass', freq: 240, freqEnd: 820, q: 0.8, dur: 0.5, gain: 0.15, attack: 0.1 }));
    cue(T.fall0 - 0.05, () => {
      // falling in: the water rushing past, rising, muffled
      A.noise({ filter: 'bandpass', freq: 260, freqEnd: 3800, q: 1.4, dur: 0.95, gain: 0.32, attack: 0.85 });
      A.noise({ filter: 'lowpass', freq: 300, freqEnd: 2400, dur: 0.9, gain: 0.2, attack: 0.8 });
      A.tone({ type: 'sine', freq: 110, freqEnd: 440, dur: 0.9, gain: 0.05, attack: 0.85 });
    });
    cue(T.fall1 - 0.03, () => {
      A.sfx('boom', { gain: 0.28, pitch: 0.7 });
      A.noise({ filter: 'lowpass', freq: 3000, freqEnd: 300, dur: 0.9, gain: 0.18, attack: 0.01 });
      [587.33, 880, 1174.66].forEach((f, i) => A.tone({ type: 'sine', freq: f, dur: 1.6, gain: 0.04, attack: 0.02, delay: i * 0.05, pan: (i - 1) * 0.35 }));
    });
    if (ctx.matchPoint) [4.9, 5.7].forEach((t) => cue(t, () => A.sfx('heartbeat', { gain: 0.5, pitch: 0.75 })));
    cues.sort((a, b) => a.t - b.t);
    let cueAt = 0;

    // ---- the drawn layer ---------------------------------------------------------------------
    const toPx = (x, y, w, h) => [w / 2 + x * h, h / 2 - y * h];
    function glow(g, x, y, r, col, a) {
      if (a <= 0.01) return;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, rgba('#ffffff', a));
      gr.addColorStop(0.18, rgba(col, a * 0.9));
      gr.addColorStop(0.45, rgba(col, a * 0.25));
      gr.addColorStop(1, rgba(col, 0));
      g.fillStyle = gr;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }

    // the dive computer, as the deep draws its depth gauge: what the sonar says is coming
    function sonar(g, t, w, h, a1) {
      const a = seg(t, 1.0, 1.3) * (1 - seg(t, T.ink0, T.ink0 + 0.25));
      if (a <= 0.01) return;
      const k = clamp(Math.min(w, h) / 720, 0.62, 1.35), fpx = (n) => Math.round(Math.max(n * k, n * 0.85, 9));
      const dist = Math.max(0.3, 1 / a1.id - 1.6);
      const close = dist < 3.5;
      const blinkOn = !close || Math.floor(t * 5) % 2 === 0 || t > T.blink;
      const x = 16 * k + 2, y = h - 86 * k; // (above the deep's own depth gauge)
      g.save();
      g.globalAlpha = a;
      g.textBaseline = 'alphabetic';
      g.textAlign = 'left';
      g.font = `600 ${fpx(22)}px ${HEAD}`;
      const num = dist >= 10 ? String(Math.round(dist)) : dist.toFixed(1);
      g.fillStyle = 'rgba(0,10,14,0.55)';
      g.fillText(num, x + 1, y + 1);
      g.fillStyle = close ? WARN : AQUA;
      g.fillText(num, x, y);
      const nw = g.measureText(num).width;
      g.font = `${fpx(10)}px ${MONO}`;
      const label = t < T.near0 ? 'M · CONTACT BELOW' : !close ? 'M · CONTACT CLOSING' : `M · ${readout}`;
      if (blinkOn) g.fillText(label, x + nw + 6 * k, y);
      g.fillStyle = rgba(close ? WARN : AQUA, 0.85);
      g.fillRect(x, y + 6 * k, 86 * k * clamp01(1 - dist / 46), 2 * k);
      g.fillStyle = rgba(AQUA, 0.2);
      g.fillRect(x, y + 6 * k, 86 * k, 2 * k);
      // the ping going out
      const pk = seg(t, 1.05, 1.9);
      if (pk > 0 && pk < 1) {
        g.strokeStyle = rgba(AQUA, (1 - pk) * 0.6);
        g.lineWidth = 1.2 * k;
        g.beginPath();
        g.arc(x + 4 * k, y - 26 * k, 3 * k + pk * 22 * k, 0, TAU);
        g.stroke();
      }
      g.restore();
    }

    // the two divers, as two brighter lights round the galaxy's core
    function divers(g, t, w, h) {
      const a0 = seg(t, 4.75, 5.15) * (1 - seg(t, 6.55, 6.8));
      if (a0 <= 0.01) return;
      const kin = ease.outCubic(seg(t, 4.75, 5.5)), kout = ease.inCubic(seg(t, 6.3, 6.75));
      const fs = clamp(h * 0.02, 10, 15);
      g.save();
      g.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 2; i++) {
        const p = players[i];
        const r = lerp(0.02, p.r, kin) * (1 - kout);
        const th = p.ph + galaxy.hand * (t - 4.75) * (0.75 - i * 0.2) + kout * 2.5 * galaxy.hand;
        const [x, y] = toPx(C2[0] + Math.cos(th) * r, C2[1] + Math.sin(th) * r * galaxy.incl, w, h);
        const tw = 0.85 + 0.15 * Math.sin(t * 7 + i * 2);
        glow(g, x, y, h * 0.045 * (1 - kout * 0.6), p.col, a0 * tw);
        p.x = x; p.y = y;
      }
      g.globalCompositeOperation = 'source-over';
      g.font = `600 ${fs}px ${MONO}`;
      g.textBaseline = 'middle';
      for (let i = 0; i < 2; i++) {
        const p = players[i];
        const a = pulse(t, 5.05 + i * 0.15, 6.3, 0.25);
        if (!p.name || a <= 0.01) continue;
        const right = p.x < w * 0.82;
        g.textAlign = right ? 'left' : 'right';
        g.globalAlpha = a * 0.9;
        g.fillStyle = mixHex(p.col, '#ffffff', 0.3);
        g.fillText(p.name, p.x + (right ? 1 : -1) * h * 0.03, p.y);
      }
      g.restore();
    }

    // a line in the dark, typed out like the dive computer's
    function line(g, t, w, h) {
      const a = seg(t, T.line0, T.line0 + 0.2) * (1 - seg(t, T.line1 - 0.3, T.line1));
      if (a <= 0.01) return;
      const n = Math.floor(darkLine.length * seg(t, T.line0, T.line0 + 1.0));
      const s = darkLine.slice(0, n);
      g.save();
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      const fs = fitText(g, darkLine, w * 0.86, clamp(h * 0.024, 10, 18), MONO);
      g.font = `500 ${fs}px ${MONO}`;
      g.globalAlpha = a;
      g.fillStyle = AQUA;
      const full = g.measureText(darkLine).width;
      g.textAlign = 'left';
      const x0 = w / 2 - full / 2, y = h * 0.88;
      g.fillText(s, x0, y);
      if (n < darkLine.length || Math.floor(t * 3) % 2 === 0) g.fillRect(x0 + g.measureText(s).width + 2, y - fs * 0.45, fs * 0.55, fs * 0.9);
      g.restore();
    }

    function caption(g, t, w, h) {
      const a = ease.outSine(seg(t, T.cap0, T.cap0 + 0.4)) * (1 - ease.inSine(seg(t, T.cap1 - 0.35, T.cap1)));
      if (a <= 0.01) return;
      const rise = (1 - ease.outCubic(seg(t, T.cap0, T.cap0 + 0.7))) * h * 0.02;
      const y = h * 0.78 + rise;
      g.save();
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.globalAlpha = a;
      const big = fitText(g, title, w * 0.8, clamp(h * 0.066, 22, 70), HEAD);
      g.font = `600 ${big}px ${HEAD}`;
      g.shadowColor = 'rgba(0,0,0,0.6)';
      g.shadowBlur = 12;
      g.fillStyle = '#ffffff';
      g.fillText(title, w / 2, y);
      g.shadowBlur = 6;
      const fs = fitText(g, scoreLine, w * 0.86, clamp(h * 0.019, 9, 15), MONO);
      g.font = `500 ${fs}px ${MONO}`;
      g.fillStyle = rgba('#ffffff', 0.85);
      g.fillText(scoreLine, w / 2, y - big * 0.66 - fs * 0.4);
      const lw = Math.min(w * 0.2, big * 3.2) * ease.outCubic(seg(t, T.cap0 + 0.1, T.cap0 + 0.8));
      g.shadowBlur = 0;
      g.strokeStyle = rgba(pal.accent || '#ffc861', 0.9);
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(w / 2 - lw, y + big * 0.6);
      g.lineTo(w / 2 + lw, y + big * 0.6);
      g.stroke();
      g.shadowBlur = 6;
      const per = up(ctx.to.perspective);
      if (per) {
        const ps = fitText(g, per, w * 0.8, clamp(h * 0.017, 9, 13), MONO);
        g.font = `500 ${ps}px ${MONO}`;
        g.fillStyle = rgba('#ffffff', 0.8);
        g.fillText(per, w / 2, y + big * 0.6 + ps * 1.3);
        if (ctx.matchPoint) {
          g.font = `700 ${ps}px ${MONO}`;
          g.fillStyle = pal.accent || '#ffc861';
          g.fillText('MATCH POINT', w / 2, y + big * 0.6 + ps * 2.9);
        }
      }
      g.restore();
    }

    return {
      update(dt, t) {
        while (cueAt < cues.length && t >= cues[cueAt].t) cues[cueAt++].fn();
      },

      render(t) {
        const g = ctx.g, w = ctx.width, h = ctx.height, asp = w / h;
        renderer.setRenderTarget(null);
        renderer.getDrawingBufferSize(vRes);
        U.uRes.value.copy(vRes);
        U.uAsp.value = asp;
        U.uT.value = t;
        U.uK.value = seg(t, 0, 0.3);
        camera.aspect = asp;
        camera.updateProjectionMatrix();
        const to = ctx.toImage;
        if (to && !texTo) adoptTo(to);

        if (t < T.swap) {
          // ===== ACT 1: it rises, reaches, looks, blinks, inks =====================================
          const k = act1(t);
          const dimK = ease.inOutSine(seg(t, T.dim0, T.dim1));
          U.uDim.value = dimK + 0.25 * ease.inOutSine(seg(t, T.near0, T.near1));
          U.uShade.value = ease.inOutSine(seg(t, 0.25, 1.7));
          U.uZoom.value = 1 + 0.06 * ease.inOutSine(seg(t, 0.05, 3.6));
          U.uWob.value = seg(t, 0, 0.8);
          U.uSun.value = (1 - 0.5 * dimK - 0.12 * seg(t, T.near0, T.near1)) * (1 - 0.6 * seg(t, T.ink0, T.full1));
          U.uEyeA.value = ease.inOutSine(seg(t, T.rise0, 0.9));
          U.uEyeC.value.set(k.x, k.y);
          U.uEyeR.value = k.R;
          U.uDist.value = 1 / k.id;
          U.uHole.value = 1 - seg(t, 1.5, 2.3);
          U.uBody.value = 1 - seg(t, 2.4, 2.9);
          U.uRoll.value = roll1 + 0.05 * Math.sin(t * 0.7);
          const sees = ease.inOutSine(seg(t, T.sees, T.sees + 0.4));
          U.uGaze.value.set(gaze0[0] * (1 - sees), gaze0[1] * (1 - sees));
          const snap = ease.outCubic(seg(t, T.snap, T.snap + 0.12));
          const dil = ease.outCubic(seg(t, T.sees + 0.05, T.sees + 0.5));
          U.uPup.value.set(lerp(lerp(0.58, 0.5, dil), 0.62, snap), lerp(lerp(0.07, 0.3, dil), 0.03, snap));
          U.uLid.value = blinkAt(t);
          U.uHood.value = lerp(0.25, 0.05, sees);
          U.uPhoto.value = 0.7 + 0.9 * pulse(t, T.sees, T.sees + 0.7, 0.25);
          U.uPhotoArm.value = 0.8 + 0.6 * pulse(t, T.sees + 0.1, T.sees + 0.8, 0.25);
          U.uGlow.value = 1;
          U.uInner.value = 0;
          U.uGlint.value = 0.3;
          U.uTorch.value = 0.55 * (1 - seg(t, T.ink0, T.ink0 + 0.4));
          arms.update(t, asp, T);
          // the ink: from below one side of the eye, across and up at the lens
          const ik = seg(t, T.ink0, T.ink0 + 0.75);
          U.uInk.value = ik;
          U.uInkFull.value = ease.inOutSine(seg(t, T.full0, T.full1));
          U.uInkS.value.set(k.x + inkSide * 0.3 * Math.min(asp, 1.8) * 0.5, k.y - 0.42);
          U.uInkDir.value.set(-inkSide * Math.cos(inkAng), Math.sin(inkAng));
          renderer.render(scene1, camera);
        } else {
          // ===== ACT 2: the black, the specks, the eye, the pupil =====================================
          const k = act2(t);
          U.uEyeA.value = ease.inOutSine(seg(t, T.eye0, T.eye0 + 0.35));
          U.uEyeC.value.set(k.cx, k.cy);
          U.uEyeR.value = k.R;
          U.uRoll.value = roll2 + 0.03 * Math.sin(t * 0.6);
          U.uGaze.value.set(0, 0);
          U.uPup.value.set(k.pr, k.pr);
          U.uLid.value = 1 - ease.outCubic(seg(t, T.open0, T.open1));
          U.uHood.value = 0.06;
          U.uBody.value = 0;
          U.uSun.value = 0;
          U.uPhoto.value = ease.inOutSine(seg(t, T.eye0 - 0.3, T.eye0 + 0.3)) * (1 - seg(t, T.fall0, T.fall1));
          U.uGlow.value = 0.8;
          U.uGlint.value = 0.9;
          U.uTorch.value = 0;
          U.uDist.value = 3;
          U.uEnv.value.set(0.004, 0.006, 0.01);
          U.uInner.value = texTo ? ease.inOutSine(seg(t, T.open0, T.open0 + 0.4)) : 0;
          U.uPic.value = texTo ? seg(t, T.open0, T.open0 + 0.2) : 0;
          U.uRho.value = k.rho;
          U.uSc.value = k.sc;
          U.uPicC.value.set(k.cx, k.cy);
          U.uTear.value = ease.inOutSine(seg(t, T.tear0, T.tear1));
          U.uExit.value = seg(t, T.exit0, T.exit1);
          U.uBright.value = 1 - seg(t, T.fall0 + 0.2, T.fall1);
          U.uAlpha.value = 1 - ease.inOutSine(seg(t, T.fade0, T.fade1));
          // the specks
          if (to && !specks.ready) specks.target(to, asp, { x: C2[0], y: C2[1] });
          const S = specks.uniforms;
          S.uT.value = t; S.uAsp.value = asp; S.uPx.value = Math.max(1, vRes.y / 720);
          S.uOn0.value = T.on0; S.uS0.value = T.s0; S.uS1.value = T.s1; S.uG0.value = T.g0; S.uG1.value = T.g1; S.uP0.value = T.p0; S.uP1.value = T.p1;
          S.uGal.value.set(C2[0], C2[1]);
          S.uPicC.value.set(k.cx, k.cy);
          S.uSc.value = k.sc;
          S.uFade.value = 1 - seg(t, T.p1 - 0.05, T.p1 + 0.25);
          specks.points.visible = S.uFade.value > 0.001;
          renderer.render(scene2, camera);
        }

        // ===== the drawn layer =====================================================================
        if (t <= 0) return;
        if (t < T.swap) sonar(g, t, w, h, ACT1);
        else {
          divers(g, t, w, h);
          line(g, t, w, h);
          caption(g, t, w, h);
        }
      },

      dispose() {
        for (const o of [texFrom, texTo, mBack1, mBack2, mInk, mArm, geo]) if (o) o.dispose();
        arms.dispose();
        specks.dispose();
        tex.dispose();
        renderer.setRenderTarget(null);
      },
    };
  },
};

// TIDY-UP TIME — the toy world's own way out.
//
// CONCEPT
//   Every duel on the rug ends the way every game on a bedroom floor ends: a grown-up calls
//   through the door, the big light snaps on and ruins the mood, and enormous hands put the
//   toys away. The kill's last frame becomes the rug itself, seen from further off: the toy
//   world's own lens is worked out from it and the frame is laid back down on the floor it was
//   a picture of, in the same room (the lamp, the bear, the chest, the stacker stand exactly
//   where the frame shows them). Then the hands gather the fallen soldier up in pieces and drop
//   him in the toy box, stand the winner on the bookcase like a trophy (with a strip of the
//   world's label tape to say so), lift the train with its cars swinging, and sweep the rest
//   in with one forearm — wiping the old frame off the rug as they go — and we fall into the
//   box with the toys. The lid comes down. In the dark the toys settle and the music box runs
//   down. Then the lid lifts and the hands take out the next toy and set it on the bare rug: a
//   game box, a pop-up book or a snow globe with the NEXT WORLD inside, and the lens dives in.
//
// BEAT SHEET (8.8 s, swap at 5.0 s)
//   0.00         the kill's last frame, untouched
//   0.10 → 1.10  a voice through the door: a sing-song, wordless "ti-dy UP ti-ime!"; a wedge of
//                hallway light slides across the rug
//   0.95         CLICK: the big light. The moody lamp light flattens; a beat of overexposure;
//                TIDY-UP TIME on a strip of tape
//   1.00         the frame becomes the rug: the same picture, now on the floor of the 3D room
//   1.00 → 2.05  the lens pulls back off it (a dolly-zoom out of the world's flat lens)
//   1.16 → 2.72  hand A closes over the fallen soldier, lifts him in pieces, drops him in the box
//   1.42 → 3.02  hand B pinches up the winner and stands them on the bookcase (the lens pans
//                over); the label tape pops under them, a strip beside them names them
//   3.04 → 3.80  hand A lifts the train by the engine, the cars swinging off it, into the box
//   3.22 → 3.84  hand B's forearm sweeps the rug: blocks tumble, the dominoes go down, the old
//                frame is wiped away, everything is flung over the box's edge (the lens follows)
//   3.92 → 4.52  the lens falls into the box with the toys and turns to look up
//   4.42 → 4.86  hand B pulls the lid over and lets it drop: THUMP
//   4.86 → 5.70  dark. A line of light at the lid's edge; the toys settle; the music box runs down
//   5.00         THE SWAP, in the dark
//   5.70 → 5.98  the lid lifts; light floods in (the cut out of the box hides in it)
//   5.98 → 6.55  the hands bring the next world out of the box as a toy and set it on the rug
//   6.55 → 7.30  the gesture: the game box is patted twice | the book's cover is laid open and
//                the title pops up | the snow globe was shaken on the way down; the hands go
//   7.02 → 8.30  the lens dives into the toy's picture until it fills the screen exactly
//   8.22 → 8.80  the print becomes the next world's first frame; the overlay fades to nothing
//
// AXES OF VARIATION (all from ctx.rng, in create())
//   1. the arrival: game box | pop-up book | snow globe — and the box's sticker
//   2. the grown-up: four skin tones, five knitted sleeves, a watch | ring | plaster | nothing
//   3. the call: three sing-song cadences at any pitch in a fourth; the door's side
//   4. the staging: which hand moves first, where the winner stood and where on the shelf they
//      go, where the train stands on its loop, how far back the sweep runs, the wide shot's
//      angle and drift
//   5. the room: block letters, the bookcase's books, the wallpaper's print and colour, where
//      the music box picks the lullaby up, the line on the TIDY-UP TIME tape
//   (and the context mirrors the staging: the box always goes on the fallen soldier's side)
//
// CONTEXT
//   ctx.fromImage / focus  the frame is laid back on its floor: from the focus (the victim, near
//                          the middle of the world's kill close-up) the world's own lens is
//                          solved and the frame projected through it; what it shows is healed
//                          where the hands take things and wiped where the forearm goes. Props of
//                          ours that would stand inside it wait until the forearm reaches them.
//                          Another world's frame is simply a play mat on the rug.
//   ctx.loser / winner     the gathered pieces and the trophy are moulded in their identity
//                          plastic; the label tape on the shelf and the strip beside it name the
//                          winner (and ctx.how); the TIDY-UP tape may name the one in the box
//   ctx.score              the bookcase is the scoreboard: a trophy per point already won by each
//   ctx.matchPoint         the tapes turn red and say MATCH POINT
//   ctx.to                 printed on the arrival toy: the picture is its first frame, its name in
//                          its palette, its perspective underneath
//   a drawn round          nobody goes on the shelf: both soldiers go in the box
import { seg, ease, clamp, lerp, pulse, smoothstep, roundRect, canvasTexture, fullscreenPass } from '../kit.js';
import { makeHand, SKINS, SLEEVES, POSES } from './tidy-up/hands.js';
import { buildRoom, BOX, SHELF, LOOP, LID, HINGE, FIG, LABEL_FONT } from './tidy-up/room.js';
import { guessLens, lensCamera, lensFloor, makeLens, FLATTEN_GLSL } from './tidy-up/lens.js';
import { makeArrival } from './tidy-up/arrive.js';
import { makeSound, CALLS, panOf } from './tidy-up/sound.js';
import { DURATION, SWAP_AT, T, makePlan, mirrorKeys, evalTrack, newState, lidAngle, LET_GO, LET_ANG } from './tidy-up/script.js';

// The first second is the old frame itself, graded in screen space: the hallway light, the click.
const ACT1 = `precision highp float; varying vec2 vUv;
uniform sampler2D tImg; uniform float uLight, uDoor, uExpo, uFlash, uAsp, uSide;
${FLATTEN_GLSL}
void main() {
  vec3 c = texture2D(tImg, vUv).rgb;
  // a door opens a crack somewhere off-screen: a wedge of warm hallway light across the floor
  vec2 piv = vec2(uSide > 0.0 ? 1.1 : -0.1, 1.08);
  vec2 d = vec2((vUv.x - piv.x) * uAsp, vUv.y - piv.y);
  vec2 ax = normalize(vec2(-uSide * 0.62 * uAsp, -1.0));
  float along = dot(d, ax), across = abs(d.x * ax.y - d.y * ax.x);
  float halfW = (0.015 + 0.13 * uDoor) * max(along, 0.0) + 0.004;
  float m = (1.0 - smoothstep(halfW * 0.55, halfW, across)) * smoothstep(0.0, 0.08, along) * (1.0 - smoothstep(0.7, 1.7, along)) * uDoor;
  c = c * (1.0 + 1.25 * m) + vec3(0.07, 0.045, 0.02) * m;
  c = flatten(c, uLight, vUv);
  c = min(c * uExpo, vec3(1.0));
  c = mix(c, vec3(1.0, 0.97, 0.92), uFlash);
  gl_FragColor = vec4(c, 1.0);
}`;

const PLASTIC = ['#f29a14', '#14bdd2']; // the toy world's identity plastic
const PAPER = '#f4ecd8', INK = '#211c17';

// A strip of embossed label-maker tape (the toy world's lettering), centred on (x, y).
function tape(g, x, y, bold, rest, color, px, alpha = 1, ink = '#fff', rot = 0, sq = 1) {
  if (alpha <= 0.01) return;
  g.font = `800 ${px}px ${LABEL_FONT}`;
  const wb = g.measureText(bold).width;
  g.font = `600 ${px * 0.86}px ${LABEL_FONT}`;
  const wr = rest ? g.measureText(rest).width + px * 0.45 : 0, w = wb + wr + px * 1.3, h = px * 1.75;
  g.save();
  g.globalAlpha = alpha;
  g.translate(x, y); g.rotate(rot); g.scale(sq, 2 - sq);
  g.fillStyle = 'rgba(0,0,0,0.35)'; roundRect(g, -w / 2 + 1.5, -h / 2 + 3, w, h, 3); g.fill();
  g.fillStyle = color; roundRect(g, -w / 2, -h / 2, w, h, 3); g.fill();
  g.fillStyle = 'rgba(255,255,255,0.22)'; g.fillRect(-w / 2 + 2, -h / 2 + 1.5, w - 4, 1.5);
  g.fillStyle = 'rgba(0,0,0,0.2)'; g.fillRect(-w / 2 + 2, h / 2 - 3, w - 4, 1.5);
  g.textBaseline = 'middle'; g.textAlign = 'left';
  g.font = `800 ${px}px ${LABEL_FONT}`;
  g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillText(bold, -w / 2 + px * 0.65, 1.8);
  g.fillStyle = ink; g.fillText(bold, -w / 2 + px * 0.65, 0.6);
  if (rest) { g.font = `600 ${px * 0.86}px ${LABEL_FONT}`; g.globalAlpha = alpha * 0.88; g.fillText(rest, -w / 2 + px * 0.65 + wb + px * 0.45, 0.8); }
  g.restore();
}

export default {
  id: 'tidy-up',
  name: 'TIDY-UP TIME',
  duration: DURATION,
  swapAt: SWAP_AT,

  create(ctx) {
    const { THREE, renderer } = ctx.three;
    const A = ctx.audio;
    // Like the toy world itself: on a software rasteriser, a lighter build of the same picture.
    const Q = { pbr: true, msaa: true, scale: 1, cap: 4.4e6, shadow: 2048 };
    try {
      const gl = renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info');
      if (ext && /swiftshader|llvmpipe|software|basic render/i.test(String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)))) Object.assign(Q, { pbr: false, msaa: false, scale: 0.7, cap: 9e5, shadow: 1024 });
    } catch { /* masked: assume a real GPU */ }
    const W0 = Math.max(1, ctx.width), H0 = Math.max(1, ctx.height), ASP = W0 / H0;
    const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

    // ---- the old frame's lens, and where on the floor its picture lies ----
    const isToy = ctx.from.id === 'toybox';
    const guess = guessLens(W0, H0, ctx.focus, isToy);
    const lensCam = lensCamera(THREE, guess.L, W0, H0);
    const proj = new THREE.Matrix4().multiplyMatrices(lensCam.projectionMatrix, lensCam.matrixWorldInverse);
    const M = guess.victim.x < 0 ? -1 : 1; // the box goes on the fallen soldier's side
    const fv = V3();
    // inside the old frame? (canonical x: the layout with the box to the right)
    const foot = (xc, y, z, pad = 1.04) => { fv.set(M * xc, y, z).applyMatrix4(proj); return Math.abs(fv.x) < pad && Math.abs(fv.y) < pad; };
    const plan = makePlan(ctx, guess, M, foot);
    const rng = plan.rng;
    const winner = ctx.winner, loser = ctx.loser;
    const wi = winner ? winner.index : 0, li = loser ? loser.index : 1;
    const names = [0, 1].map((i) => (winner && winner.index === i ? winner.name : loser && loser.index === i ? loser.name : ''));
    const up = (s) => String(s || '').toUpperCase();
    const mx = (x) => M * x;
    const Wv = (x, y, z) => V3(M * x, y, z); // canonical → world

    // ---- the room ----
    const U = { keyDir: { value: V3(0, 1, 0) }, keyCol: { value: new THREE.Color(1, 0.95, 0.86) } };
    const label = winner ? (ctx.matchPoint ? `${up(winner.name)} · MATCH POINT` : ctx.how ? `${up(winner.name)} · ${up(ctx.how)}` : `${up(winner.name)} · WINNER`) : null;
    const room = buildRoom(THREE, renderer, { M, Q, U, rng, seed: ctx.seed, names, colors: PLASTIC, label, labelColor: ctx.matchPoint ? '#c22f2f' : PLASTIC[wi] });
    const { scene, root } = room;
    // furniture the toy world never had fades up if it stands where the old frame shows only floor
    const furnIn = foot(BOX.x, 2, BOX.z, 1.15) || foot(BOX.x, 5, BOX.z - 5, 1.15) || foot(BOX.x, 5, BOX.z + 5, 1.15) || foot(SHELF.x, 4, SHELF.z, 1.15) || foot(SHELF.x, 8, SHELF.z - 5, 1.15) || foot(SHELF.x, 8, SHELF.z + 5, 1.15);
    const fadeMats = [room.Mt.furn, ...room.trophyMat];
    // (another world's frame is a play mat on the rug: nothing in the room is in it)
    if (!isToy) fadeMats.push(room.Mt.paint, room.Mt.plush, room.Mt.paper, room.Mt.block, room.Mt.domino, room.Mt.matte, room.Mt.lampBody, room.Mt.glow, room.Mt.bulb, room.lampGlow.material, ...room.plastic);
    if (room.label) fadeMats.push(room.label.material);

    // ---- the grown-up ----
    const HS = 1.65;
    const handA = makeHand(THREE, { side: M, scale: HS, skin: SKINS[plan.skin], sleeve: SLEEVES[plan.sleeve], acc: plan.acc === 'plaster' ? 'plaster' : null, seed: ctx.seed, U });
    const handB = makeHand(THREE, { side: -M, scale: HS, skin: SKINS[plan.skin], sleeve: SLEEVES[plan.sleeve], acc: plan.acc === 'plaster' ? null : plan.acc, seed: ctx.seed + 1, U });

    // ---------------------------------------------------------------------------------------
    // Helpers: hands, grips, poses
    // ---------------------------------------------------------------------------------------
    const stA = newState(), stB = newState(), stX = newState();
    const tmpE = new THREE.Euler(), tmpQ = new THREE.Quaternion();
    const tv = V3(), tv2 = V3(), tv3 = V3();
    const one = V3(1, 1, 1);
    const handQ = (e, out) => out.setFromEuler(tmpE.set(e[1], e[0], e[2], 'YXZ'));
    const gripAt = (keys, t, out) => { evalTrack(keys, t, stX); return out.compose(tv.fromArray(stX.p), handQ(stX.e, tmpQ), one); };
    const eulerOf = (fingers, dorsal) => {
      const z = fingers.clone().normalize(), y = dorsal.clone().addScaledVector(z, -dorsal.dot(z)).normalize(), x = V3().crossVectors(y, z);
      const e = new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z)), 'YXZ');
      return [e.y, e.x, e.z];
    };
    const copyPose = (from, to) => { for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) to.f[i][j] = from.f[i][j]; for (let j = 0; j < 5; j++) to.t[j] = from.t[j]; };
    const poseHand = (hand, st) => {
      hand.group.visible = st.on;
      if (!st.on) return;
      hand.set({ wrist: tv.fromArray(st.p), q: handQ(st.e, tmpQ), shoulder: tv2.fromArray(st.sh), pole: tv3.fromArray(st.pole).normalize(), pose: st.pose });
    };
    const localIn = (keys, t, objMatrix) => gripAt(keys, t, new THREE.Matrix4()).invert().multiply(objMatrix);
    // Where a hand's contact point (pinch, fingertips, palm, grip) is in its own frame: posed
    // on the real rig at the origin, so a key can put that point exactly on what it touches.
    const contactLocal = (hand, pose, via) => {
      hand.set({ wrist: V3(0, 0, 0), q: new THREE.Quaternion(), shoulder: V3(0, 0, -60), pole: V3(0, 1, 0), pose });
      const p = V3(), q = V3();
      if (via === 'pinch') p.addVectors(hand.tipOf(0, p), hand.tipOf(4, q)).multiplyScalar(0.5);
      else if (via === 'tips') { for (let i = 0; i < 4; i++) p.add(hand.tipOf(i, q)); p.multiplyScalar(0.25); }
      else if (via === 'grip') hand.handPoint(0, -1.05, 2.4, p);
      else hand.handPoint(0, -0.62, 1.75, p);
      return p;
    };
    const solve = (keys, hand) => {
      for (const k of keys) {
        if (!k.at) continue;
        const loc = contactLocal(hand, typeof k.pose === 'string' ? POSES[k.pose] : k.pose, k.via).applyQuaternion(handQ(k.r, new THREE.Quaternion()));
        k.p = V3().fromArray(k.at).sub(loc).toArray();
      }
      return keys;
    };
    solve(mirrorKeys(plan.A, M), handA);
    solve(mirrorKeys(plan.B, M), handB);

    // ---- the toys ----
    // the fallen soldier, in pieces: they show once the hand closes over them (the frame has them till then)
    const pieces = room.pieces(li);
    const palmLocal = contactLocal(handA, POSES.cup, 'palm');
    const inPalm = pieces.map(() => ({
      lp: V3((rng() - 0.5) * 1.1, -0.2 - rng() * 0.3, (rng() - 0.5) * 1.2).multiplyScalar(HS).add(palmLocal),
      lq: new THREE.Quaternion().setFromEuler(new THREE.Euler(rng() * 6.28, rng() * 6.28, rng() * 6.28)),
      land: Wv(BOX.x + (rng() - 0.5) * (BOX.w - 2.6), 0.5 + rng() * 0.5, BOX.z - 1.5 + (rng() - 0.5) * (BOX.d - 6)),
      spin: V3(rng() - 0.5, rng() - 0.5, rng() - 0.5).multiplyScalar(14),
    }));
    for (const p of pieces) { p.visible = false; root.add(p); }
    // the winner (after a drawn round, the other soldier: into the box with the first)
    const fig = room.soldier(wi);
    fig.position.copy(Wv(plan.W.x, 0, plan.W.z));
    fig.rotation.y = M * (Math.PI * 0.5 + (rng() - 0.5) * 0.8);
    root.add(fig);
    const figRest = new THREE.Matrix4().compose(fig.position.clone(), fig.quaternion.clone(), fig.scale.clone());
    // the bookcase is the scoreboard: one trophy per point already won
    {
      const prev = winner ? Math.min(5, Math.max(0, ctx.score[wi] - 1)) : 0, other = loser ? Math.min(4, Math.max(0, ctx.score[li])) : 0;
      const slots = [];
      for (let z = SHELF.z - SHELF.d / 2 + 1.0; z <= SHELF.z + SHELF.d / 2 - 1.0; z += 1.45) if (Math.abs(z - plan.SH.z) > 1.2) slots.push(z);
      const near = slots.slice().sort((a, b) => Math.abs(a - plan.SH.z) - Math.abs(b - plan.SH.z));
      const mine = near.slice(0, prev), theirs = near.slice(prev).sort((a, b) => Math.abs(b - plan.SH.z) - Math.abs(a - plan.SH.z)).slice(0, other);
      for (const [list, i] of [[mine, wi], [theirs, li]]) for (const z of list) {
        const t = room.soldier(i, true);
        t.position.copy(Wv(SHELF.x + 0.4 + (rng() - 0.5) * 0.6, SHELF.h, z));
        t.rotation.y = M * (Math.PI * 0.5 + (rng() - 0.5) * 0.5);
        root.add(t);
      }
    }
    // the train: three cars on the loop, the engine first
    const cars = room.cars;
    const loopAt = (th) => Wv(LOOP.x + Math.cos(th) * LOOP.a, 0.5, LOOP.z + Math.sin(th) * LOOP.b);
    const carRest = [];
    {
      let th = plan.trainA;
      const step = (d) => { th += d / Math.hypot(Math.sin(th) * LOOP.a, Math.cos(th) * LOOP.b); };
      for (let k = 0; k < 3; k++) {
        const f = loopAt(th); step(2.8);
        const r = loopAt(th); step(0.35);
        carRest.push({ f, r });
        root.add(cars[k]);
      }
    }
    const trainHidden = plan.trainInFoot; // (where the frame shows a train of its own, ours stays out of it)
    const fw = V3(), upv = V3(), side = V3(), bm = new THREE.Matrix4();
    const placeCar = (car, f, r) => {
      // a car between its front and rear couplings (which sit 0.5 above its base)
      fw.subVectors(f, r).normalize(); upv.set(0, 1, 0).addScaledVector(fw, -fw.y);
      if (upv.lengthSq() < 1e-4) upv.set(0, 0, 1);
      upv.normalize();
      side.crossVectors(fw, upv);
      car.quaternion.setFromRotationMatrix(bm.makeBasis(fw, upv, side));
      car.position.copy(f).add(r).multiplyScalar(0.5).addScaledVector(upv, -0.5);
    };
    for (let k = 0; k < 3; k++) placeCar(cars[k], carRest[k].f, carRest[k].r);
    // blocks and dominoes, all in the forearm's way (canonical x; placed at M * x)
    const sweep = [];
    {
      const spots = [[-15.5, -3.8], [-10.2, -7.2], [5.2, -6.8], [14.2, -2.6], [-3.2, -8.6], [16.5, -7.4], [-17.5, 0.8]];
      for (const [x, z] of spots) {
        if (Math.hypot(x - plan.V.x, z - plan.V.z) < 3) continue;
        const m = room.block(-1);
        sweep.push({ m, kind: 'block', x, z, y: 1.05, r: 1.1, ry: (rng() - 0.5) * 1.2 });
      }
      for (const [k, y] of [[0, 1.05], [1, 3.15]]) sweep.push({ m: room.block(k === 0 ? 3 : 2), kind: 'block', x: 0, z: LOOP.z, y, r: 1.1, ry: 0.5 + k * 0.4, top: k === 1 });
      for (const [x0, z0, n] of [[-6.2, -6.0, 5], [9.6, -3.6, 5]]) {
        for (let i = 0; i < n; i++) {
          const z = z0 + i * 0.95;
          if (Math.hypot(x0 - plan.V.x, z - plan.V.z) < 2.4) continue;
          sweep.push({ m: room.domino(), kind: 'domino', x: x0, z, y: 0.95, r: 0.3, ry: Math.PI / 2 });
        }
      }
      // whatever stands where the old frame already shows toys stays hidden until the forearm
      // reaches it: then it is simply among what gets pushed
      for (const o of sweep) { o.hide = foot(o.x, o.y, o.z, 1.02) || foot(o.x, 0, o.z, 1.02); root.add(o.m); }
    }

    // ---- the old frame on the floor ----
    const decal = room.decal(ctx.fromImage, proj);

    // ---- the lens ----
    const lens = makeLens(THREE, renderer, Q);
    const camera = new THREE.PerspectiveCamera(40, ASP, 0.3, 600);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = Q.msaa ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    const texFrom = canvasTexture(THREE, ctx.fromImage, { srgb: false });
    const act1 = fullscreenPass(THREE, { fragmentShader: ACT1, uniforms: { tImg: { value: texFrom }, uLight: { value: 0 }, uDoor: { value: 0 }, uExpo: { value: 1 }, uFlash: { value: 0 }, uAsp: { value: ASP }, uSide: { value: plan.doorSide } } });
    let texTo = null, arrival = null;
    const kind = globalThis.__tidyUpArrival || plan.arrival; // (the global: to look at one arrival on purpose)

    // ---- the score ----
    const snd = makeSound(A);
    const cues = [];
    const cue = (t, fn) => cues.push({ t, fn });
    const pA = panOf(M * 12), pB = panOf(-M * 10), pBox = panOf(M * BOX.x);
    cue(0.02, () => A.noise({ filter: 'bandpass', freq: 300, freqEnd: 180, q: 2, dur: 0.25, gain: 0.08 })); // a latch somewhere
    cue(T.call, () => snd.call(CALLS[plan.call], plan.callHz, 0.2));
    cue(T.click, () => snd.lightsOn());
    // the music box keeps playing the world's lullaby while the toys go away, then runs down in the dark
    const LULL = [69, 72, 76, 72, 69, 72, 77, 76, 74, 71, 67, 71, 74, 76, 72, 71, 69, 72, 76, 81, 79, 76, 72, 76];
    for (let i = 0; i < 12; i++) cue(1.25 + i * 0.3, () => snd.note(LULL[(plan.lullaby + i) % LULL.length], 0.035, 0, 0.8));
    const runDown = [[4.95, 1, 1.1], [5.2, 0.985, 1.3], [5.5, 0.965, 1.6], [5.86, 0.93, 1.9]];
    runDown.forEach(([t, bend, dur], i) => cue(t, () => snd.note(LULL[(plan.lullaby + 12 + i) % LULL.length], 0.06 - i * 0.008, 0, dur, bend)));
    cue(plan.A[0].t + 0.1, () => snd.swish(0.28, pA));
    cue(plan.B[0].t + 0.1, () => snd.swish(0.24, pB));
    cue(plan.Agrab.pieces - 0.06, () => { snd.pat(0.35, pA); snd.rattle(6, 0.18, pA, 0.05, 0.22, 3); });
    cue(plan.Agrab.piecesOut + 0.12, () => { snd.rattle(9, 0.22, pBox, 0, 0.3, 7); snd.tock(520, 0.18, pBox, 0.05); });
    cue(plan.Bgrab.winner, () => snd.click(0.25, pB, 0, 2000));
    cue(plan.Bgrab.winnerOut, () => { snd.tock(900, 0.22, pB); if (winner) snd.ding(0.07, pB, 0.08); });
    if (!trainHidden) {
      cue(plan.Agrab.train, () => { snd.tock(760, 0.25, pA); snd.click(0.15, pA, 0.12, 1500); });
      cue(plan.Agrab.train + 0.25, () => { for (let i = 0; i < 4; i++) snd.click(0.1, pA, i * 0.09, 2600 - i * 200); });
      cue(plan.Agrab.trainOut + 0.14, () => snd.clatter(5, 0.28, pBox, 0, 0.18, 17));
    }
    cue(plan.Bgrab.sweep0, () => { snd.pat(0.4, pB); snd.swish(0.35, 0, 0.02); });
    cue(plan.Bgrab.sweep0 + 0.12, () => { snd.dominoes(10, 0, 0); snd.clatter(5, 0.2, 0, 0.05, 0.3, 11); });
    cue(plan.Bgrab.sweep1 + 0.2, () => snd.clatter(9, 0.3, pBox, 0, 0.35, 13));
    cue(T.dive0, () => snd.whoosh(0.4, 0.7));
    cue(T.lid0 + 0.05, () => snd.creak());
    cue(T.shut, () => snd.lid(true));
    for (const [t, n] of [[5.08, 2], [5.33, 1], [5.62, 1]]) cue(t, () => snd.rattle(n, 0.08, pBox * 0.3, 0, 0.1, t * 10));
    cue(T.open0, () => snd.lid(false));
    if (kind === 'globe') { cue(6.16, () => snd.shake()); cue(6.32, () => snd.shake()); }
    cue(T.set - 0.02, () => { snd.pat(0.45, 0); snd.tock(kind === 'globe' ? 380 : 300, 0.2, 0); });
    if (kind === 'box') { cue(6.88, () => snd.pat(0.22, 0.1)); cue(7.02, () => snd.pat(0.2, 0.1)); }
    if (kind === 'book') { cue(6.68, () => snd.page()); cue(6.98, () => { snd.page(0.0); snd.click(0.1, 0, 0.05, 1200); }); }
    cue(T.dive2, () => snd.riser(1.25, 0.18));
    cue(T.dive3 - 0.02, () => { snd.chord([72, 76, 79, 84], 0.09); A.sfx('chime', { gain: 0.45, delay: 0.02 }); });
    cues.sort((a, b) => a.t - b.t);
    let cueAt = 0;

    root.add(handA.group, handB.group);
    // the pick-ups: whatever a hand holds a thing by, it keeps
    const figLocal = localIn(plan.B, plan.Bgrab.winner, figRest);
    const engRest = new THREE.Matrix4().compose(cars[0].position.clone(), cars[0].quaternion.clone(), one);
    const engLocal = localIn(plan.A, plan.Agrab.train, engRest);

    // ---- the lid: hand B pulls it over, lets go, and it falls shut ----
    const OPEN = lidAngle(0);
    const lidLocal = { p: V3(-LID.w + 2.3, -1.0, 1.4), f: V3(-1, 0.45, -0.1), d: V3(0, -1, 0.15) };
    const lidFrame = (ang, outP, outF, outD) => {
      // canonical, then mirrored (the box turns round on the other side; its length is symmetric)
      const c = Math.cos(ang), s = Math.sin(ang), rot = (v, o) => o.set(v.x * c + v.y * s, -v.x * s + v.y * c, v.z);
      rot(lidLocal.p, outP).add(V3(HINGE.x + 0.1, HINGE.y, BOX.z));
      rot(lidLocal.f, outF); rot(lidLocal.d, outD);
      outP.x *= M; outF.x *= M; outD.x *= M;
      return outP;
    };
    const lidSh = [M * 26, 22, 14], lidPole = [M * 0.3, -1, 0.5];
    {
      const p = V3(), f = V3(), d = V3();
      lidFrame(OPEN, p, f, d);
      plan.B.push({ t: T.lid0, p: p.toArray(), r: eulerOf(f, d), pose: 'hold', sh: lidSh, pole: lidPole, stop: true, poseIn: 0.4 });
    }
    const afterLid = (() => {
      const p = V3(), f = V3(), d = V3();
      lidFrame(LET_ANG, p, f, d);
      const e = eulerOf(f, d);
      return [
        { t: LET_GO, p: p.toArray(), r: e, pose: 'hold', sh: lidSh, pole: lidPole, stop: true },
        { t: LET_GO + 0.3, p: [p.x - M * 3, p.y + 9, p.z + 5], r: [e[0], e[1] - 0.4, e[2]], pose: 'relax', sh: [M * 24, 26, 16], pole: lidPole },
      ];
    })();

    // ---- Act 3: the toy (it leads) and the hands that carry it ----
    const P0z = 3.4;
    const toyKeys = mirrorKeys([
      { t: T.cut, p: [BOX.x - 3.5, 8.4, BOX.z + 1.5], r: [0.32, 0, 0.06], pose: 'relax', sh: [0, 0, 0], pole: [0, 0, 0] },
      { t: 6.3, p: [0, 6.0, P0z], r: [0.06, 0, -0.02], pose: 'relax', sh: [0, 0, 0], pole: [0, 0, 0] },
      { t: T.set, p: [0, 0, P0z], r: [0, 0, 0], pose: 'relax', sh: [0, 0, 0], pole: [0, 0, 0], stop: true },
    ], M);
    const holdOf = (hand, at, f, d, pose) => {
      at.x *= M; f.x *= M; d.x *= M;
      const z = f.clone().normalize(), y = d.clone().addScaledVector(z, -d.dot(z)).normalize(), x = V3().crossVectors(y, z);
      const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
      return { p: at.clone().sub(contactLocal(hand, POSES[pose], 'palm').applyQuaternion(q)), f, d, pose };
    };
    const HOLD = kind === 'globe'
      ? { A: holdOf(handA, V3(0.6, 10.6, 0.9), V3(-0.15, -0.55, -1), V3(0.05, 1, -0.4), 'cup'), B: null }
      : (() => {
        const g = kind === 'box' ? 7.25 : 3.75, y = kind === 'box' ? 1.4 : 0.9;
        return {
          A: holdOf(handA, V3(g + 0.3, y, 0.6), V3(-0.25, -1, -0.35), V3(1, -0.15, 0), 'hold'),
          B: holdOf(handB, V3(-g - 0.3, y, 0.6), V3(0.25, -1, -0.35), V3(-1, -0.15, 0), 'hold'),
        };
      })();
    const toyAt = (t, out) => {
      evalTrack(toyKeys, t, stX);
      const p = tv.fromArray(stX.p);
      if (kind === 'globe') p.x += Math.sin((t - 6.1) * Math.PI * 2 / 0.17) * 1.1 * pulse(t, 6.1, 6.44, 0.06);
      return out.compose(p, handQ(stX.e, tmpQ), one);
    };
    const heldKey = (h, t) => {
      const m = toyAt(t, new THREE.Matrix4()), q = new THREE.Quaternion().setFromRotationMatrix(m);
      return { t, p: h.p.clone().applyMatrix4(m).toArray(), r: eulerOf(h.f.clone().applyQuaternion(q), h.d.clone().applyQuaternion(q)), pose: h.pose };
    };
    const shA3 = [M * 13, 28, 26], shB3 = [-M * 13, 28, 26], po3A = [M, -0.3, 0.6], po3B = [-M, -0.3, 0.6];
    // after the set-down (canonical for hand A's side; mirrored below)
    const k3 = (t, p, r, pose, sh, pole, stop) => ({ t, p, r, pose, sh, pole, stop: !!stop });
    const A3 = [], B3 = [];
    {
      const relA = heldKey(HOLD.A, T.set);
      A3.push({ ...k3(T.set, relA.p, relA.r, 'hold', shA3, po3A, true), world: true });
      if (kind === 'box') {
        const lidY = 2.3, nz = P0z + 4.2;
        A3.push(k3(6.72, [Math.abs(relA.p[0]) + 1.5, 6.8, relA.p[2] + 1.2], [Math.PI + 0.25, 0.5, -0.1], 'relax', [13, 28, 26], [1, -0.3, 0.6]));
        A3.push(k3(6.82, [4.2, lidY + 3.2, nz], [Math.PI + 0.25, 0.3, -0.1], 'flat', [13, 28, 26], [1, -0.3, 0.6]));
        A3.push(k3(6.88, [4.2, lidY + 0.95, nz], [Math.PI + 0.25, 0.12, -0.1], 'flat', [13, 28, 26], [1, -0.3, 0.6], true));
        A3.push(k3(6.95, [4.3, lidY + 2.6, nz + 0.2], [Math.PI + 0.25, 0.3, -0.1], 'flat', [13, 28, 26], [1, -0.3, 0.6]));
        A3.push(k3(7.02, [4.3, lidY + 0.95, nz + 0.2], [Math.PI + 0.25, 0.12, -0.1], 'flat', [13, 28, 26], [1, -0.3, 0.6], true));
        A3.push(k3(7.34, [16, 20, 22], [Math.PI + 0.4, 0.3, -0.1], 'relax', [13, 28, 26], [1, -0.3, 0.6]));
      } else {
        A3.push(k3(6.78, [Math.abs(relA.p[0]) + 1.5, relA.p[1] + 4.5, relA.p[2] + 2], [Math.PI + 0.3, 0.6, -0.2], 'relax', [13, 28, 26], [1, -0.3, 0.6]));
        A3.push(k3(7.15, [16, 22, 22], [Math.PI + 0.4, 0.3, -0.1], 'relax', [13, 28, 26], [1, -0.3, 0.6]));
      }
      if (HOLD.B) {
        const relB = heldKey(HOLD.B, T.set);
        B3.push({ ...k3(T.set, relB.p, relB.r, 'hold', shB3, po3B, true), world: true });
        if (kind === 'book') {
          // the other hand takes the cover's edge and lays the book open
          const half = 6.6, sp = half / 2, T0 = 6.66, T1 = 6.98;
          const edge = (c) => { const a = Math.PI * (1 - c); return [sp + Math.cos(a) * (half + 0.2), 1.3 + Math.sin(a) * (half + 0.2) + 1.6, P0z + 1.2]; };
          B3.push(k3(6.62, [edge(0)[0] - 1.2, 4.2, P0z + 1.6], [Math.PI - 0.2, 0.9, 0.2], 'pinchOpen', [-13, 28, 26], [-1, -0.3, 0.6]));
          for (const c of [0, 0.35, 0.7, 1]) B3.push(k3(T0 + (T1 - T0) * c, edge(c), [Math.PI - 0.2 + c * 0.4, 0.9 - c * 0.3, 0.2 - c * 0.3], c < 1 ? 'pinch' : 'pinchOpen', [-13, 28, 26], [-1, -0.3, 0.6], c === 0));
          B3.push(k3(7.3, [-16, 22, 22], [Math.PI - 0.4, 0.3, 0.1], 'relax', [-13, 28, 26], [-1, -0.3, 0.6]));
        } else {
          B3.push(k3(6.74, [-Math.abs(relB.p[0]) - 1.5, relB.p[1] + 4.5, relB.p[2] + 2], [Math.PI - 0.3, 0.6, 0.2], 'relax', [-13, 28, 26], [-1, -0.3, 0.6]));
          B3.push(k3(7.1, [-16, 22, 22], [Math.PI - 0.4, 0.3, 0.1], 'relax', [-13, 28, 26], [-1, -0.3, 0.6]));
        }
      }
      // the first key of each is already in the world; the rest are canonical
      for (const list of [A3, B3]) { const rest = list.slice(1); mirrorKeys(rest, M); }
    }
    const bookCover = (t) => (kind === 'book' ? ease.inOutSine(seg(t, 6.66, 6.98)) : 1);

    // ---------------------------------------------------------------------------------------
    // The train: three cars on couplings, held by the engine, swinging; then dropped in the box
    // (a little position-based simulation, always run from the grab to t: a function of t alone).
    // ---------------------------------------------------------------------------------------
    const LINKS = [[0, 1, 2.8], [1, 2, 0.35], [2, 3, 2.8], [3, 4, 0.35], [4, 5, 2.8]];
    const sim = { t: -1, p: [], o: [] };
    const engM = new THREE.Matrix4();
    const engPts = (t, f, r) => {
      gripAt(plan.A, t, engM).multiply(engLocal);
      f.set(1.4, 0.5, 0).applyMatrix4(engM); r.set(-1.4, 0.5, 0).applyMatrix4(engM);
    };
    const BXW = M * BOX.x;
    const inBox = (p) => Math.abs(p.x - BXW) < BOX.w / 2 - BOX.t - 0.3 && Math.abs(p.z - BOX.z) < BOX.d / 2 - BOX.t - 0.3;
    const sf = V3(), sr = V3(), sv = V3();
    function simTo(t) {
      const t0 = plan.Agrab.train, rel = plan.Agrab.trainOut, dt = 1 / 240;
      if (t <= t0) return null;
      if (sim.t < 0 || t < sim.t) {
        sim.t = t0; sim.p = [];
        for (let k = 0; k < 3; k++) sim.p.push(carRest[k].f.clone(), carRest[k].r.clone());
        sim.o = sim.p.map((v) => v.clone());
      }
      while (sim.t < t - 1e-6) {
        const h = Math.min(dt, t - sim.t);
        sim.t += h;
        const held = sim.t < rel;
        for (let i = 0; i < 6; i++) {
          if (held && i < 2) continue;
          const p = sim.p[i], o = sim.o[i];
          sv.subVectors(p, o).multiplyScalar(0.995);
          o.copy(p);
          p.add(sv); p.y -= 170 * h * h;
        }
        if (held) { engPts(sim.t, sf, sr); sim.o[0].copy(sim.p[0]); sim.o[1].copy(sim.p[1]); sim.p[0].copy(sf); sim.p[1].copy(sr); }
        for (let it = 0; it < 4; it++) {
          for (const [a, b, L] of LINKS) {
            const pa = sim.p[a], pb = sim.p[b];
            sv.subVectors(pb, pa);
            const d = sv.length() || 1e-6, k = (d - L) / d;
            const fa = held && a < 2 ? 0 : 1, fb = held && b < 2 ? 0 : 1, s = fa + fb || 1;
            pa.addScaledVector(sv, (k * fa) / s); pb.addScaledVector(sv, (-k * fb) / s);
          }
          for (let i = 0; i < 6; i++) {
            const p = sim.p[i], o = sim.o[i];
            const floor = inBox(p) && p.y < BOX.h + 2 ? BOX.t + 0.5 : 0.5;
            if (p.y < floor) { p.y = floor; o.x = lerp(o.x, p.x, 0.25); o.z = lerp(o.z, p.z, 0.25); o.y = p.y; }
            if (inBox(o) && o.y < BOX.h) {
              p.x = clamp(p.x, BXW - BOX.w / 2 + BOX.t + 0.35, BXW + BOX.w / 2 - BOX.t - 0.35);
              p.z = clamp(p.z, BOX.z - BOX.d / 2 + BOX.t + 0.35, BOX.z + BOX.d / 2 - BOX.t - 0.35);
            }
          }
        }
      }
      return sim.p;
    }

    // ---------------------------------------------------------------------------------------
    // The sweep: the forearm's leading edge (canonical x), and each toy's moment of contact
    // ---------------------------------------------------------------------------------------
    const edgeAt = (t) => { evalTrack(plan.B, t, stX); return M * stX.p[0] + 2.1; };
    {
      const s0 = plan.Bgrab.sweep0 - 0.05, s1 = plan.Bgrab.sweep1;
      sweep.forEach((o, i) => {
        o.tc = 99;
        for (let t = s0; t <= s1; t += 1 / 240) if (edgeAt(t) >= o.x - o.r) { o.tc = t; break; }
        o.fling = s1 + 0.02 + i * 0.022 + rng() * 0.04;
        o.land = V3(BOX.x + (rng() - 0.5) * (BOX.w - 2.8), 1.3 + rng() * 1.6, BOX.z - 1.8 + (rng() - 0.5) * (BOX.d - 5.5));
        o.jit = (rng() - 0.5) * 0.9;
        o.spin = (rng() - 0.5) * 16;
        o.tum = 0.6 + rng() * 0.5;
      });
    }
    const swp = V3();
    const sweepPos = (o, t, out) => {
      // pushed: just ahead of the forearm, tumbling; flung: an arc over the box's wall (canonical)
      if (t < o.tc) return out.set(o.x, o.y, o.z), 0;
      const tf = Math.min(t, o.fling);
      const xe = Math.max(o.x, edgeAt(tf) + o.r + 0.2 + o.jit * 0.5);
      const pushed = xe - o.x;
      out.set(xe, o.top ? Math.max(1.05, o.y - 160 * Math.pow(Math.min(t - o.tc, 0.2), 2)) : o.y, o.z + o.jit * Math.min(1, pushed / 10));
      if (t <= o.fling) return pushed;
      const u = clamp((t - o.fling) / 0.42, 0, 1);
      swp.copy(out);
      out.x = lerp(swp.x, o.land.x, ease.outSine(u));
      out.z = lerp(swp.z, o.land.z, u);
      out.y = lerp(swp.y, o.land.y, u) + Math.sin(u * Math.PI) * 7.5;
      return pushed + u * 20;
    };

    // ---------------------------------------------------------------------------------------
    // The camera
    // ---------------------------------------------------------------------------------------
    const L = guess.L;
    const vfovFor = (asp, halfW) => 2 * Math.atan(Math.tan(halfW) / asp) * 180 / Math.PI;
    const cam = { p: V3(), t: V3(), up: V3(0, 1, 0), fov: 40 };
    const proj0 = (() => {
      const c = lensFloor(L, W0 / 2, H0 / 2, 0, { x: 0, z: 0 });
      return { t: V3(c.x, 0, c.z), psi: L.psi, phi: L.phi, H: H0 / L.s };
    })();
    const dirOf = (psi, phi, out) => out.set(Math.sin(psi) * Math.cos(phi), Math.sin(phi), Math.cos(psi) * Math.cos(phi));
    const wv = { t: V3(), psi: 0, phi: 0, D: 40, fov: 45 };
    function wide(t, asp, out) {
      const fov = clamp(vfovFor(asp, 0.64), 40, 60);
      // a slow pan that follows the work: the box, the shelf, then the sweep back to the box
      const toShelf = ease.inOutSine(seg(t, 2.38, 2.84)), back = ease.inOutSine(seg(t, 3.16, 3.8));
      const x = 4 - 20 * toShelf + 24 * back;
      out.t.copy(Wv(x + plan.drift * 1.2, 0.8 + 3 * toShelf * (1 - back), -2.4 - back * 0.6));
      out.psi = (plan.yaw + plan.drift * 0.03 + 0.08 * toShelf - 0.08 * back) * M; out.phi = 0.8 - 0.05 * toShelf * (1 - back) - 0.03 * back;
      out.D = 41 - 8 * toShelf * (1 - back) - 1.5 * back; out.fov = fov;
      return out;
    }
    const picR = { c: V3(), n: V3(), up: V3(), h: 1 };
    const dp = [V3(), V3(), V3()], dt3 = [V3(), V3(), V3()];
    function camAt(t, asp) {
      cam.up.set(0, 1, 0);
      if (t < T.dive0) {
        wide(t, asp, wv);
        const u = ease.inOutCubic(seg(t, T.hand, T.pull1)), uf = ease.inOutSine(seg(t, T.hand, T.pull1 - 0.1));
        const fov = Math.exp(lerp(Math.log(1.2), Math.log(wv.fov), uf));
        const H1 = 2 * wv.D * Math.tan((wv.fov * Math.PI) / 360);
        const Hh = Math.exp(lerp(Math.log(proj0.H), Math.log(H1), u));
        const D = Hh / 2 / Math.tan((fov * Math.PI) / 360);
        cam.t.lerpVectors(proj0.t, wv.t, u);
        dirOf(lerp(proj0.psi, wv.psi, u), lerp(proj0.phi, wv.phi, u), tv);
        cam.p.copy(cam.t).addScaledVector(tv, D);
        cam.fov = fov;
        return cam;
      }
      if (t < T.cut) {
        // fall into the box with the toys, and turn to look up
        wide(T.dive0, asp, wv);
        dirOf(wv.psi, wv.phi, tv);
        dp[0].copy(wv.t).addScaledVector(tv, wv.D); dp[1].copy(Wv(BOX.x - 5, 17, BOX.z + 12)); dp[2].copy(Wv(BOX.x + 0.9, 2.5, BOX.z + BOX.d / 2 - 1.1));
        dt3[0].copy(wv.t); dt3[1].copy(Wv(BOX.x - 0.3, 1, BOX.z + 1)); dt3[2].copy(Wv(BOX.x - 0.6, 1.0, BOX.z - 2.5));
        const u = seg(t, T.dive0, T.inBox), k = ease.inOutCubic(u);
        if (k < 0.5) { const a = ease.inSine(k * 2); cam.p.lerpVectors(dp[0], dp[1], a); cam.t.lerpVectors(dt3[0], dt3[1], a); }
        else { const a = ease.outCubic((k - 0.5) * 2); cam.p.lerpVectors(dp[1], dp[2], a); cam.t.lerpVectors(dt3[1], dt3[2], a); }
        cam.t.lerp(Wv(BOX.x - 2.2, 8.4, BOX.z - 3.2), ease.inOutCubic(seg(t, T.inBox - 0.12, T.inBox + 0.28)));
        cam.p.y += Math.sin(t * 2.3) * 0.05;
        cam.fov = lerp(wv.fov, 64, ease.inOutSine(u));
        return cam;
      }
      // Act 3: the bare rug, then into the toy
      const fov3 = clamp(vfovFor(asp, 0.56), 36, 52);
      const drift = seg(t, T.cut, T.dive2);
      cam.p.copy(Wv(0, 15.5 - drift * 0.8, 27.5 - drift * 1.5)); cam.t.copy(Wv(0, 1.8, P0z - 0.5));
      cam.fov = fov3;
      if (arrival && t > T.dive2) {
        const pic = arrival.picture(picR);
        const d = pic.h / 2 / Math.tan((fov3 * Math.PI) / 360);
        const u = ease.inOutCubic(seg(t, T.dive2, T.dive3));
        const s = tv.subVectors(cam.p, pic.c), sl = s.length();
        s.normalize();
        const dir = tv3.copy(s).lerp(tv2.copy(pic.n), ease.inOutSine(u)).normalize();
        cam.p.copy(pic.c).addScaledVector(dir, Math.exp(lerp(Math.log(sl), Math.log(d), u)));
        cam.t.lerp(pic.c, ease.outCubic(Math.min(1, u * 1.6)));
        cam.up.set(0, 1, 0).lerp(pic.up, ease.inOutSine(u)).normalize();
      }
      return cam;
    }

    // ---------------------------------------------------------------------------------------
    // Everything at time t
    // ---------------------------------------------------------------------------------------
    const m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), s4 = V3();
    const lidP = V3(), lidF = V3(), lidD = V3();
    const tidyFade = (t) => ease.inOutSine(seg(t, T.hand + 0.05, T.hand + 0.6));
    function stage(t) {
      // ---- hands ----
      if (t < T.cut) {
        evalTrack(plan.A, t, stA, 1); poseHand(handA, stA);
        if (t < T.lid0) evalTrack(plan.B, t, stB, 2);
        else if (t < LET_GO) {
          // riding the lid's edge
          lidFrame(lidAngle(t), lidP, lidF, lidD);
          stB.on = true; lidP.toArray(stB.p); stB.e = eulerOf(lidF, lidD);
          evalTrack(afterLid, LET_GO, stX);
          copyPose(stX.pose, stB.pose);
          stB.sh = lidSh; stB.pole = lidPole;
        } else { evalTrack(afterLid, t, stB, 2); stB.on = t < LET_GO + 0.3; }
        if (t > T.shut + 0.05) { stA.on = false; stB.on = false; }
        poseHand(handB, stB);
        handA.group.visible = stA.on && t < T.shut + 0.05;
      } else {
        if (t <= T.set) { const k = heldKey(HOLD.A, t); stA.on = true; stA.p = k.p; stA.e = k.r; stA.sh = shA3; stA.pole = po3A; copyPose(POSES[HOLD.A.pose], stA.pose); }
        else evalTrack(A3, t, stA, 1);
        poseHand(handA, stA);
        if (HOLD.B) {
          if (t <= T.set) { const k = heldKey(HOLD.B, t); stB.on = true; stB.p = k.p; stB.e = k.r; stB.sh = shB3; stB.pole = po3B; copyPose(POSES[HOLD.B.pose], stB.pose); }
          else evalTrack(B3, t, stB, 2);
          poseHand(handB, stB);
        } else handB.group.visible = false;
      }

      // ---- the fallen soldier's pieces ----
      const tp = plan.Agrab.pieces, tpo = plan.Agrab.piecesOut;
      for (let i = 0; i < pieces.length; i++) {
        const p = pieces[i], d = inPalm[i];
        p.visible = t >= tp - 0.02 && t < T.cut;
        if (!p.visible) continue;
        if (t < tpo) {
          gripAt(plan.A, t, m4);
          p.position.copy(d.lp).applyMatrix4(m4);
          p.quaternion.setFromRotationMatrix(m4).multiply(d.lq);
        } else {
          gripAt(plan.A, tpo, m4);
          const from = tv.copy(d.lp).applyMatrix4(m4);
          const u = clamp((t - tpo) / 0.3, 0, 1);
          p.position.lerpVectors(from, d.land, u);
          p.position.y = lerp(from.y, d.land.y, u * u) + Math.sin(u * Math.PI) * 0.6;
          q4.setFromRotationMatrix(m4).multiply(d.lq);
          p.quaternion.copy(q4).multiply(tmpQ.setFromEuler(tmpE.set(d.spin.x * u * 0.3, d.spin.y * u * 0.3, d.spin.z * u * 0.3)));
        }
      }
      // ---- the winner ----
      {
        const tg = plan.Bgrab.winner, to = plan.Bgrab.winnerOut;
        if (t < tg) fig.position.copy(Wv(plan.W.x, 0, plan.W.z)), fig.quaternion.setFromRotationMatrix(figRest);
        else {
          gripAt(plan.B, Math.min(t, to), m4).multiply(figLocal);
          m4.decompose(fig.position, fig.quaternion, s4);
          if (winner && t >= to) fig.position.y = Math.max(fig.position.y, SHELF.h);
          if (!winner && t > to) fig.position.lerp(Wv(BOX.x, 1.2, BOX.z - 2), clamp((t - to) / 0.3, 0, 1));
        }
        fig.scale.setScalar(FIG);
        fig.visible = t < T.cut || !!winner;
      }
      if (room.label) room.label.scale.setScalar(Math.max(0.001, ease.outBack(seg(t, plan.Bgrab.winnerOut + 0.08, plan.Bgrab.winnerOut + 0.3))));
      // ---- furniture that was never in the toy world's picture comes up as the lens pulls back ----
      {
        const k = furnIn || !isToy ? tidyFade(t) : 1;
        for (const m of fadeMats) { m.transparent = k < 1 || m === (room.label && room.label.material) || m === room.lampGlow.material; m.opacity = k; m.depthWrite = k > 0.99 && m !== room.lampGlow.material; }
      }
      // ---- the train ----
      const P = trainHidden ? null : simTo(t);
      for (let k = 0; k < 3; k++) {
        cars[k].visible = !trainHidden && t < T.cut;
        if (P) placeCar(cars[k], P[k * 2], P[k * 2 + 1]); else placeCar(cars[k], carRest[k].f, carRest[k].r);
      }
      // ---- blocks and dominoes ----
      for (const o of sweep) {
        const pushed = sweepPos(o, t, o.m.position);
        o.m.position.x *= M;
        o.m.rotation.set(0, M * o.ry, 0);
        if (pushed > 0) {
          if (o.kind === 'domino') { o.m.rotation.z = -M * Math.min(1, pushed / 1.2) * Math.PI / 2; o.m.position.y = lerp(0.95, 0.15, Math.min(1, pushed / 1.2)); }
          else { o.m.rotation.z = -M * pushed * o.tum * 0.7; o.m.position.y += Math.abs(Math.sin(o.m.rotation.z * 2)) * 0.35; }
          if (t > o.fling) o.m.rotation.x = (t - o.fling) * o.spin;
        }
        o.m.visible = t < T.cut && (!o.hide || t >= o.tc);
        if (o.hide && t >= o.tc) o.m.scale.setScalar(lerp(0.75, 1, clamp((t - o.tc) / 0.06, 0, 1)));
      }
      // ---- the lid, and the dark ----
      room.lid.rotation.z = -lidAngle(t);
      const dark = smoothstep(T.shut - 0.25, T.shut, t) * (1 - smoothstep(T.open0, T.open0 + 0.22, t));
      room.slit.visible = t > T.shut - 0.015 && dark > 0.01;
      room.slitLight.intensity = dark * (Q.pbr ? 5 : 4) + smoothstep(T.open0, T.cut, t) * 60;
      room.key.intensity = (Q.pbr ? 2.3 : 1.9) * (1 - dark);
      room.hemi.intensity = (Q.pbr ? 1.0 : 1.25) * (1 - dark * 0.96);
      room.lamp.intensity = (Q.pbr ? 900 : 700) * (1 - dark);
      U.keyCol.value.setRGB(1, 0.95, 0.86).multiplyScalar(room.key.intensity * 0.6);
      // ---- the old frame: healed where the hands took things, wiped where the forearm went ----
      const du = decal.u;
      du.uFeather.value = 0.16 * ease.inOutSine(seg(t, T.hand, T.hand + 0.55));
      const heal = (i, x, z, r, k) => du.uHeal.value[i].set(M * x, z, r, k);
      heal(0, plan.V.x, plan.V.z, 3.6, smoothstep(plan.Agrab.pieces - 0.12, plan.Agrab.pieces, t));
      heal(1, plan.W.x, plan.W.z, 2.8, smoothstep(plan.Bgrab.winner + 0.05, plan.Bgrab.winner + 0.2, t));
      heal(2, M * (carRest[0].f.x + carRest[2].r.x) / 2, (carRest[0].f.z + carRest[2].r.z) / 2, 5.5, trainHidden ? 0 : smoothstep(plan.Agrab.train + 0.1, plan.Agrab.train + 0.35, t));
      du.uSweepOn.value = t > plan.Bgrab.sweep0 - 0.1 ? 1 : 0;
      du.uSweepX.value = edgeAt(t) - 0.8;
      du.uSweepZ0.value = plan.sweepZ - 3.9; du.uSweepZ1.value = plan.sweepZ + 10.5;
      du.uFade.value = 1 - smoothstep(T.dive0 - 0.1, T.dive0 + 0.3, t);
      decal.mesh.visible = du.uFade.value > 0.002 && t >= T.hand;
    }

    // ---------------------------------------------------------------------------------------
    // The arrival, once the next world exists
    // ---------------------------------------------------------------------------------------
    function adopt(img) {
      texTo = canvasTexture(THREE, img, { srgb: false });
      lens.u.tTo.value = texTo;
      lens.u.uToAsp.value = (img.width || 1) / (img.height || 1);
      try {
        arrival = makeArrival(THREE, { kind, img, to: ctx.to, aspect: ASP, U, Q, seed: ctx.seed, sticker: plan.sticker, px: H0 });
        if (kind === 'book') arrival.inner.position.x = 6.6 / 2;
        root.add(arrival.group);
      } catch { arrival = null; }
    }

    // ---------------------------------------------------------------------------------------
    // The 2D layer: a strip of tape when the light goes on, and one beside the trophy
    // ---------------------------------------------------------------------------------------
    const tapeRest = [`${loser ? up(loser.name) : 'EVERYONE'} IN THE BOX`, 'lights on, toys away', 'everything back in the box'][Math.floor(rng() * 3)];
    function overlay(t) {
      const g = ctx.g, w = ctx.width, h = ctx.height;
      const a = seg(t, T.click + 0.02, T.click + 0.1) * (1 - seg(t, 2.35, 2.6));
      if (a <= 0.01) return;
      const px = clamp(w / 64, 12, 20), pop = ease.outBack(seg(t, T.click + 0.02, T.click + 0.22));
      tape(g, w / 2, h * (h < 480 ? 0.12 : 0.1), 'TIDY-UP TIME', tapeRest.toLowerCase(), PAPER, px, a, INK, -0.025 + (1 - pop) * 0.1, 0.85 + 0.15 * pop);
    }
    const trophyRest = ctx.matchPoint ? 'match point' : ctx.how ? String(ctx.how).toLowerCase() : 'on the shelf';
    function trophyTape(t) {
      if (!winner) return;
      const t0 = plan.Bgrab.winnerOut + 0.04, a = seg(t, t0, t0 + 0.08) * (1 - seg(t, 3.55, 3.8));
      if (a <= 0.01) return;
      const g = ctx.g, w = ctx.width, h = ctx.height, px = clamp(w / 60, 12, 21);
      fig.getWorldPosition(tv).y += 4.6;
      tv.project(camera);
      if (tv.z > 1) return;
      const pop = ease.outBack(seg(t, t0, t0 + 0.2));
      const x = clamp((tv.x * 0.5 + 0.5) * w, px * 7, w - px * 7), y = clamp((-tv.y * 0.5 + 0.5) * h, px * 2, h - px * 2);
      const col = ctx.matchPoint ? '#c22f2f' : PLASTIC[wi];
      tape(g, x, y - (1 - pop) * 8, up(winner.name), trophyRest, col, px, a, ctx.matchPoint ? '#fff' : '#1a1410', 0.03 - (1 - pop) * 0.12, 0.85 + 0.15 * pop);
      g.globalAlpha = a; g.fillStyle = col;
      g.beginPath(); g.moveTo(x - 6, y + px * 0.95); g.lineTo(x + 6, y + px * 0.95); g.lineTo(x, y + px * 0.95 + 8); g.fill();
      g.globalAlpha = 1;
    }

    return {
      update(dt, t) {
        while (cueAt < cues.length && t >= cues[cueAt].t) cues[cueAt++].fn();
      },

      render(t) {
        const w = ctx.width, h = ctx.height, asp = w / Math.max(1, h);
        renderer.setRenderTarget(null);
        if (ctx.toImage && !texTo) adopt(ctx.toImage);
        // ===== ACT 1: the frame itself, the door, the click =====
        const light = t < T.click ? 0 : t < T.click + 0.03 ? 1 : t < T.click + 0.06 ? 0.55 : 1;
        const spike = t < T.click ? 0 : Math.exp(-(t - T.click) * 6);
        if (t < T.hand) {
          const u = act1.uniforms;
          u.uLight.value = light;
          u.uDoor.value = ease.outCubic(seg(t, 0.05, 0.75)) * (1 - seg(t, T.click, T.click + 0.05));
          u.uExpo.value = 1 + 0.3 * spike;
          u.uFlash.value = 0.35 * spike;
          u.uAsp.value = asp;
          act1.render(renderer);
          overlay(t);
          return;
        }
        // ===== ACTS 2 and 3: the room =====
        stage(t);
        if (arrival) {
          arrival.group.visible = t >= T.cut;
          toyAt(Math.max(t, T.cut), m4);
          m4.decompose(arrival.group.position, arrival.group.quaternion, s4);
          arrival.st.cover = bookCover(t);
          arrival.st.pop = 1 - smoothstep(T.dive2 + 0.05, T.dive2 + 0.5, t);
          arrival.st.snow = pulse(t, 6.05, 6.9, 0.25);
          arrival.set(t);
        }
        const c = camAt(t, asp);
        camera.fov = c.fov; camera.aspect = asp; camera.near = t > T.dive0 && t < T.cut ? 0.15 : 0.5;
        camera.position.copy(c.p); camera.up.copy(c.up); camera.lookAt(c.t);
        camera.far = camera.position.distanceTo(c.t) + 400;
        camera.updateProjectionMatrix(); camera.updateMatrixWorld();
        if (arrival && kind === 'globe') {
          const cen = tv.set(0, arrival.st.centre, 0).applyMatrix4(arrival.inner.matrixWorld);
          const d = camera.position.distanceTo(cen), R = arrival.st.R;
          arrival.st.glass = smoothstep(R * 1.05, R * 1.7, d);
          arrival.set(t);
          lens.u.uWarp.value = 0.5 * pulse(t, T.dive2 + 0.5, T.dive3 - 0.2, 0.3) * (1 - smoothstep(R * 0.6, R * 1.8, d));
        } else lens.u.uWarp.value = 0;
        U.keyDir.value.subVectors(room.key.position, room.key.target.position).normalize().transformDirection(camera.matrixWorldInverse);
        // ---- the lens ----
        const L2 = lens.u;
        const g2 = seg(t, T.hand, T.hand + 0.8);
        const late = 1 - seg(t, T.dive3 - 0.5, T.to0);
        const inside = t > T.shut - 0.1 && t < T.cut ? 1 : 0;
        L2.uTilt.value = lerp(0, 0.72, g2) * late * (t > T.dive0 && t < T.cut ? 1.25 : 1);
        // (the sharp band follows the work: up to the shelf for the trophy, back for the sweep)
        const shelfFocus = ease.inOutSine(seg(t, 2.4, 2.8)) * (1 - ease.inOutSine(seg(t, 3.1, 3.5)));
        L2.uFocusY.value = t < T.dive0 ? 0.42 + 0.2 * shelfFocus : t < T.cut ? 0.5 : 0.52; L2.uFocusH.value = t < T.dive0 ? 0.26 + 0.06 * shelfFocus : t < T.cut ? 0.18 : 0.3;
        L2.uGlow.value = 0.35 * g2 * late + 1.4 * inside;
        L2.uGrade.value = g2 * late; L2.uVig.value = 0.55 * g2 * late + 0.25 * inside;
        L2.uGrain.value = 0.035 * g2 * late + 0.03 * inside;
        const dark = smoothstep(T.shut - 0.3, T.shut, t) * (1 - smoothstep(T.open0 + 0.05, T.cut, t));
        L2.uExpo.value = (1 + 0.3 * spike) * (1 + 1.2 * dark) * (1 + 1.6 * smoothstep(T.open0, T.cut, t) * (t < T.cut ? 1 : 0));
        L2.uFlash.value = 0.35 * spike + 0.9 * (t >= T.cut ? Math.exp(-(t - T.cut) * 9) : smoothstep(T.open0 + 0.1, T.cut, t));
        L2.uDark.value = 0.35 * dark;
        L2.uScrAsp.value = asp;
        L2.uTo.value = ease.inOutSine(seg(t, T.to0, T.to1)) * (texTo ? 1 : 0);
        L2.uAlpha.value = 1 - ease.inOutSine(seg(t, T.fade0, T.fade1));
        lens.render(scene, camera, t);
        overlay(t);
        trophyTape(t);
      },

      dispose() {
        snd.dispose();
        for (const o of [texFrom, texTo, act1, lens]) if (o) o.dispose();
        handA.dispose(); handB.dispose();
        if (arrival) arrival.dispose();
        room.dispose();
        renderer.shadowMap.enabled = false;
        renderer.setRenderTarget(null);
      },
    };
  },
};

// TIDY-UP TIME — the bedroom, now with the big light on: floorboards, the braided rug and the
// train's loop, the lamp and everything the toy world always keeps round the edge (in the very
// places it keeps them, so they sit exactly under their own picture), a low bookcase (the
// trophy shelf) and the toy box. The box goes on the fallen soldier's side (M = -1: the left),
// the bookcase on the other. The world's own modelling (its toys and painted surfaces) is
// borrowed, so it is the same room; the old frame is laid on the floor by the DECAL.
import { makeRng, rand, pick, makeCanvas, roundRect, TAU } from '../../kit.js';
import { makeGeo } from '../../dimensions/toybox/geo.js';
import { makeToys } from '../../dimensions/toybox/toys.js';
import { makeTextures, TOY } from '../../dimensions/toybox/tex.js';
import { softPatch } from './hands.js';
import { RUG_A, RUG_B, FLATTEN_GLSL } from './lens.js';

export const BOX = { x: 27.5, z: -2.4, w: 7.4, d: 12.6, h: 5.4, t: 0.45 }; // centre, depth across (x), length (z), height, wall
export const HINGE = { x: BOX.x + BOX.w / 2, y: BOX.h };
export const LID = { w: 7.8, t: 0.5, d: 13.0 };
export const SHELF = { x: -27.2, z: -0.6, w: 5.6, d: 12.4, h: 8.6 };
export const LOOP = { x: 0, z: 0.6, a: 10.2, b: 4.7 };
export const FIG = 1.55; // the soldiers are drawn this much bigger than their model
const LAMP_BASE = { x: -23.6, z: -11.4 }, LAMP_HEAD = { x: -18.4, y: 5.7, z: -8.8 };
export const LABEL_FONT = '"Arial Rounded MT Bold", Futura, "Trebuchet MS", Rajdhani, sans-serif';

const DECAL_VERT = `
#include <common>
#include <shadowmap_pars_vertex>
varying vec3 vW;
void main() {
  #include <beginnormal_vertex>
  #include <defaultnormal_vertex>
  #include <begin_vertex>
  #include <project_vertex>
  #include <worldpos_vertex>
  #include <shadowmap_vertex>
  vW = (modelMatrix * vec4(transformed, 1.0)).xyz;
}`;
const DECAL_FRAG = `
#include <common>
#include <packing>
#include <bsdfs>
#include <lights_pars_begin>
#include <shadowmap_pars_fragment>
#include <shadowmask_pars_fragment>
uniform sampler2D tImg; uniform mat4 uProj; uniform float uFeather, uFade, uSweepX, uSweepZ0, uSweepZ1, uSweepOn, uMirror;
uniform vec4 uHeal[3];
varying vec3 vW;
${FLATTEN_GLSL}
vec3 toLin(vec3 c) { return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }
void main() {
  vec4 pc = uProj * vec4(vW, 1.0);
  vec2 uv = pc.xy / pc.w * 0.5 + 0.5;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) discard;
  // a soft edge (grown in as the lens pulls back), the healed spots, and the forearm's wipe
  vec2 e = min(uv, 1.0 - uv);
  float m = smoothstep(0.0, uFeather, e.x * 1.4) * smoothstep(0.0, uFeather, e.y);
  for (int i = 0; i < 3; i++) m *= 1.0 - uHeal[i].w * (1.0 - smoothstep(uHeal[i].z * 0.55, uHeal[i].z, length(vW.xz - uHeal[i].xy)));
  float cx = vW.x * uMirror;
  m *= 1.0 - uSweepOn * (1.0 - smoothstep(uSweepX - 2.5, uSweepX + 0.5, cx)) * smoothstep(uSweepZ0 - 2.0, uSweepZ0 + 1.0, vW.z) * (1.0 - smoothstep(uSweepZ1 - 1.0, uSweepZ1 + 2.0, vW.z));
  m *= uFade;
  if (m < 0.003) discard;
  vec3 c = toLin(flatten(texture2D(tImg, uv).rgb, 1.0, uv));
  // the hands' shadows fall on it like on everything else
  c *= mix(0.42, 1.0, getShadowMask());
  gl_FragColor = vec4(c, m);
}`;

export function buildRoom(THREE, renderer, o) {
  const { M, Q, U, rng, names, colors } = o;
  const own = [];
  const keep = (x) => { own.push(x); return x; };
  const G = makeGeo(THREE), toys = makeToys(THREE, G), tex = makeTextures(THREE, renderer, o.seed, names, false);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0.55, 0.5, 0.45);
  const root = new THREE.Group();
  scene.add(root);

  const mat = (o2, soft = {}) => {
    const m = Q.pbr ? new THREE.MeshStandardMaterial({ metalness: 0, roughness: 0.6, ...o2 }) : (() => { const { roughness, metalness, ...rest } = o2; return new THREE.MeshLambertMaterial(rest); })();
    return keep(softPatch(m, U, { wrap: 0.35, ...soft }));
  };
  const Mt = {
    floor: mat({ map: tex.boards, roughness: 0.55 }),
    rug: mat({ map: tex.rug, roughness: 0.95 }, { wrap: 0.5 }),
    block: mat({ map: tex.blocks, roughness: 0.5 }),
    paint: mat({ vertexColors: true, roughness: 0.38 }),
    furn: mat({ vertexColors: true, roughness: 0.42 }),
    lampBody: mat({ vertexColors: true, roughness: 0.32 }),
    matte: mat({ vertexColors: true, roughness: 0.85 }),
    cover: mat({ map: tex.covers, roughness: 0.55 }),
    paper: mat({ map: tex.paper, roughness: 0.92 }),
    track: mat({ map: tex.track, roughness: 0.6 }),
    domino: mat({ map: tex.domino, roughness: 0.3 }),
    plush: mat({ vertexColors: true, roughness: 1 }, { wrap: 0.8, rim: [0.12, 0.08, 0.04] }),
    glow: keep(new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 0.9, 0.35), side: THREE.DoubleSide })),
    bulb: keep(new THREE.MeshBasicMaterial({ color: new THREE.Color(9, 7, 4) })),
  };
  const mesh = (geo, m, cast = true, receive = true) => { const x = new THREE.Mesh(geo, m); x.castShadow = cast; x.receiveShadow = receive; return x; };

  // ---- floor, wall, rug, track ----
  const floor = mesh(keep(new THREE.PlaneGeometry(220, 160).rotateX(-Math.PI / 2)), Mt.floor, false);
  floor.position.set(0, -0.16, -20);
  {
    const uv = floor.geometry.attributes.uv, p = floor.geometry.attributes.position;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, p.getX(i), p.getZ(i) - 20);
  }
  root.add(floor);
  {
    // Somewhere far back: a skirting board and a wall with a small repeating print.
    const wc = makeCanvas(256, 256), g = wc.g, wr = makeRng(o.seed ^ 0x3a11);
    const paper = pick(wr, ['#e9dcc4', '#dfe3d2', '#e7d6cf']), ink = pick(wr, ['#c98a5a', '#7f9ab8', '#a7b07a']);
    g.fillStyle = paper; g.fillRect(0, 0, 256, 256);
    for (let y = 0; y < 256; y += 64) for (let x = 0; x < 256; x += 64) {
      const ox = (y / 64) & 1 ? 32 : 0;
      g.fillStyle = ink; g.globalAlpha = 0.55;
      g.beginPath();
      for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + (k / 10) * TAU, r = k & 1 ? 4 : 9; g.lineTo(x + ox + 16 + Math.cos(a) * r, y + 18 + Math.sin(a) * r); }
      g.fill();
      g.globalAlpha = 0.35; g.beginPath(); g.arc(x + ox + 46, y + 46, 4, 0, TAU); g.fill();
    }
    g.globalAlpha = 1;
    const wt = keep(new THREE.CanvasTexture(wc.canvas)); wt.colorSpace = THREE.SRGBColorSpace; wt.wrapS = wt.wrapT = THREE.RepeatWrapping; wt.repeat.set(16, 3);
    const wall = mesh(keep(new THREE.PlaneGeometry(220, 40)), mat({ map: wt, roughness: 0.9 }), false);
    wall.position.set(0, 20, -62);
    const skirt = mesh(keep(G.rbox(220, 3.2, 0.9, 0.2, 1)), mat({ color: '#efe9dc', roughness: 0.4 }), false);
    skirt.position.set(0, 1.45, -61.5);
    root.add(wall, skirt);
  }
  const rug = mesh(keep(new THREE.CircleGeometry(1, 96).rotateX(-Math.PI / 2).scale(RUG_A, 1, RUG_B)), Mt.rug, false);
  root.add(rug);
  {
    const n = 96, pos = [], nor = [], uv = [], idx = [];
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * TAU, c = Math.cos(a), s = Math.sin(a), nl = Math.hypot(c / RUG_A, s / RUG_B);
      pos.push(c * RUG_A, 0, s * RUG_B, c * (RUG_A + 0.05), -0.16, s * (RUG_B + 0.05));
      nor.push(c / RUG_A / nl, 0.2, s / RUG_B / nl, c / RUG_A / nl, 0.2, s / RUG_B / nl);
      uv.push(0.5 + c * 0.497, 0.5 - s * 0.497, 0.5 + c * 0.493, 0.5 - s * 0.493);
      if (i < n) idx.push(i * 2, i * 2 + 2, i * 2 + 1, i * 2 + 1, i * 2 + 2, i * 2 + 3);
    }
    const g = keep(new THREE.BufferGeometry());
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
    root.add(mesh(g, Mt.rug, false));
  }
  {
    const n = 160, hw = 0.82, top = 0.15, pos = [], nor = [], uv = [], idx = [];
    let len = 0, px = LOOP.x + LOOP.a, pz = LOOP.z;
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * TAU, c = Math.cos(a), s = Math.sin(a), x = LOOP.x + c * LOOP.a, z = LOOP.z + s * LOOP.b;
      len += Math.hypot(x - px, z - pz); px = x; pz = z;
      const nl = Math.hypot(c / LOOP.a, s / LOOP.b), nx = c / LOOP.a / nl, nz = s / LOOP.b / nl, u = len / 2.4;
      pos.push(x - nx * hw, top, z - nz * hw, x + nx * hw, top, z + nz * hw, x + nx * hw, 0, z + nz * hw);
      nor.push(0, 1, 0, 0, 1, 0, nx, 0, nz);
      uv.push(u, 0, u, 1, u, 0.98);
      if (i < n) { const b = i * 3; idx.push(b, b + 3, b + 1, b + 1, b + 3, b + 4, b + 1, b + 4, b + 2, b + 2, b + 4, b + 5); }
    }
    const g = keep(new THREE.BufferGeometry());
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
    root.add(mesh(g, Mt.track, false));
  }

  // ---- the things round the edge that nobody tidies: the lamp, the stacker, the bear, crayons, books ----
  const ld = new THREE.Vector3(0 - LAMP_HEAD.x, 0 - LAMP_HEAD.y, 0.5 - LAMP_HEAD.z).normalize();
  const lampGeo = toys.lamp(LAMP_BASE, LAMP_HEAD, ld);
  keep(lampGeo.body); keep(lampGeo.glow); keep(lampGeo.bulb);
  root.add(mesh(lampGeo.body, Mt.lampBody, true, false));
  root.add(mesh(lampGeo.glow, Mt.glow, false, false));
  root.add(mesh(lampGeo.bulb, Mt.bulb, false, false));
  const glowTex = keep(new THREE.CanvasTexture((() => {
    const c = makeCanvas(128, 128), g = c.g, r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.15, 'rgba(255,255,255,0.6)'); r.addColorStop(0.4, 'rgba(255,255,255,0.12)'); r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r; g.fillRect(0, 0, 128, 128);
    return c.canvas;
  })()));
  const lampGlow = new THREE.Sprite(keep(new THREE.SpriteMaterial({ map: glowTex, color: new THREE.Color(2.4, 1.5, 0.7), blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })));
  lampGlow.position.set(LAMP_HEAD.x + ld.x * 1.1, LAMP_HEAD.y + ld.y * 1.1, LAMP_HEAD.z + ld.z * 1.1); lampGlow.scale.setScalar(4.5);
  root.add(lampGlow);
  {
    // (positions as in the toy world's own room: dimensions/toybox/build.js)
    const b = new G.Bag();
    toys.stacker(b, -18.4, 15.4);
    toys.chest(b, 13.2, -19.4, -0.1);
    [[1.0, 17.4, 0.4, TOY.red], [6.6, 15.3, -0.9, TOY.blue], [5.6, 17.9, 2.4, TOY.green], [-11.8, -15.4, 1.0, TOY.yellow], [-7.6, -16.9, -0.5, '#e8792c'], [16.5, 16.6, 0.2, '#7a4a8a'], [-13.6, 14.2, 2.0, TOY.blue], [22.6, -6.5, 1.3, TOY.red], [-23.2, 5.8, 0.5, TOY.green]]
      .forEach(([x, z, r, c]) => toys.crayon(b, x, z, r, c));
    root.add(mesh(keep(b.build()), Mt.paint));
    const p = new G.Bag();
    toys.bear(p, 20.4, -15.6, 2.45, 1.55);
    root.add(mesh(keep(p.build()), Mt.plush));
    const mb = new G.Bag();
    [[-6, 15.6, '#2f5fc4'], [-4.6, 16.5, '#2f9a5f'], [-7.4, 16.8, '#c94a3a'], [9.4, 16.0, '#e6dfc8'], [-4.6, -15.2, '#2f5fc4'], [23.4, 3.2, '#c94a3a'], [-22.6, -4.4, '#2f9a5f']]
      .forEach(([x, z, c], i) => mb.add(G.ball(0.44, 16, 12), { p: [x, 0.28, z], color: c, s: 1 + (i % 3) * 0.12 }));
    root.add(mesh(keep(mb.build()), Mt.paint));
    const ball = mesh(keep(toys.beachBall(2.5)), Mt.paint);
    ball.position.set(19.6, 2.34, 14.9); ball.rotation.set(0.5, 0.8, 0.3);
    root.add(ball);
    [[3.6, 16.2, 0.22, 0], [-10.2, -16.4, -0.3, 1], [11.8, 16.9, -0.15, 2], [-15.6, 16.6, 0.5, 3]].forEach(([x, z, r, cell]) => {
      const g = keep(new THREE.PlaneGeometry(5, 5).rotateX(-Math.PI / 2)), uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, ((cell & 1) + uv.getX(i)) / 2, 1 - ((cell >> 1) + 1 - uv.getY(i)) / 2);
      const s2 = mesh(g, Mt.paper, false);
      s2.position.set(x, -0.145, z); s2.rotation.y = r;
      root.add(s2);
    });
    const sb = new G.Bag();
    const cells = () => Array.from({ length: 6 }, () => 4 + Math.floor(rng() * 12));
    [[-12.6, -17.6, 0.3, 0], [-10.4, -18.9, -0.5, 0], [-11.6, -18.2, 0.9, 2.1], [14.6, 17.2, 0.7, 0], [-22.4, 10.6, 0.2, 0]].forEach(([x, z, r, y]) => {
      sb.add(G.faceCells(G.rbox(2.1, 2.1, 2.1, 0.13, 3), cells(), 4, 4), { p: [x, 0.89 + y, z], r: [0, r, 0] });
    });
    root.add(mesh(keep(sb.build()), Mt.block));
  }

  // ---- the bookcase: the trophy shelf ----
  const shelf = new THREE.Group();
  {
    const b = new G.Bag(), wood = '#e8dcc2', edge = '#c9573b', S = SHELF;
    b.add(G.rbox(S.w, 0.5, S.d, 0.12, 2), { p: [0, S.h - 0.25, 0], color: edge }); // top
    b.add(G.rbox(S.w - 0.2, 0.4, S.d - 0.3, 0.08, 1), { p: [0, 0.25, 0], color: wood });
    b.add(G.rbox(S.w - 0.2, 0.36, S.d - 0.5, 0.06, 1), { p: [0, S.h * 0.48, 0], color: wood });
    for (const z of [-S.d / 2 + 0.25, S.d / 2 - 0.25]) b.add(G.rbox(S.w, S.h - 0.5, 0.5, 0.1, 2), { p: [0, (S.h - 0.5) / 2, z], color: wood });
    b.add(G.rbox(0.3, S.h - 0.5, S.d - 0.6, 0.05, 1), { p: [-S.w / 2 + 0.15, (S.h - 0.5) / 2, 0], color: '#d9cdb2' });
    // books on the two shelves, spines out towards the rug
    const cols = ['#24365f', '#c9573b', '#3d7f58', '#7a4a8a', '#c9a24a', '#2f6db4', '#e4b233', '#efe4c8'];
    for (const y0 of [0.45, S.h * 0.48 + 0.18]) {
      let z = -S.d / 2 + 0.65;
      while (z < S.d / 2 - 1.1) {
        const th = rand(rng, 0.35, 0.75), ht = rand(rng, 2.4, 3.4), lean = rng() < 0.12 ? rand(rng, 0.15, 0.3) : 0;
        b.add(G.rbox(S.w - 1.0, ht, th, 0.05, 1), { p: [0.1, y0 + ht / 2, z + th / 2], r: [lean, 0, 0], color: pick(rng, cols) });
        z += th + 0.04 + (lean ? 0.4 : 0);
      }
    }
    shelf.add(mesh(keep(b.build()), Mt.furn));
    shelf.position.set(M * S.x, 0, S.z);
    shelf.rotation.y = M < 0 ? Math.PI : 0;
    root.add(shelf);
  }
  // the label-maker tape on its front edge: who won, and how
  let label = null;
  if (o.label) {
    const px = 64, c = makeCanvas(1024, 128), g = c.g;
    g.font = `800 ${px}px ${LABEL_FONT}`;
    const tw = Math.min(980, g.measureText(o.label).width + px * 1.2), lw = tw / 1024;
    g.clearRect(0, 0, 1024, 128);
    g.save();
    g.fillStyle = o.labelColor; roundRect(g, 0, 14, tw, 100, 10); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(6, 18, tw - 12, 4);
    g.fillStyle = 'rgba(0,0,0,0.2)'; g.fillRect(6, 104, tw - 12, 4);
    g.textBaseline = 'middle'; g.textAlign = 'left';
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillText(o.label, px * 0.6, 68, tw - px);
    g.fillStyle = '#fff'; g.fillText(o.label, px * 0.6, 65, tw - px);
    g.restore();
    const t = keep(new THREE.CanvasTexture(c.canvas)); t.colorSpace = THREE.SRGBColorSpace;
    const len = Math.min(SHELF.d - 1, 11 * lw / 0.9);
    const lg = keep(new THREE.PlaneGeometry(len, len * (100 / tw)));
    const uv = lg.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * lw, 1 - (14 + (1 - uv.getY(i)) * 100) / 128);
    label = new THREE.Mesh(lg, mat({ map: t, transparent: true, roughness: 0.4 }));
    label.rotation.y = M * Math.PI / 2;
    label.position.set(M * (SHELF.x + SHELF.w / 2 + 0.04), SHELF.h - 0.27, SHELF.z + rand(rng, -0.5, 0.5));
    label.scale.setScalar(0.001);
    root.add(label);
  }

  // ---- the toy box ----
  const box = new THREE.Group();
  const lid = new THREE.Group();
  {
    const B = BOX, b = new G.Bag(), wood = '#a9743f', dark = '#2d3142', inner = '#6e4a2a';
    b.add(G.rbox(B.w, B.t, B.d, 0.1, 1), { p: [0, B.t / 2, 0], color: inner });
    for (const sx of [-1, 1]) b.add(G.rbox(B.t, B.h, B.d, 0.12, 2), { p: [sx * (B.w - B.t) / 2, B.h / 2, 0], color: wood });
    for (const sz of [-1, 1]) b.add(G.rbox(B.w, B.h, B.t + 0.1, 0.12, 2), { p: [0, B.h / 2, sz * (B.d - B.t) / 2], color: dark });
    // the slats and bands on the outside, the inside a darker, unvarnished wood
    for (const y of [1.0, 2.7, 4.4]) for (const sx of [-1, 1]) b.add(G.rbox(0.12, 0.95, B.d - 0.6, 0.05, 1), { p: [sx * (B.w / 2 + 0.03), y, 0], color: y === 2.7 ? '#b98350' : '#9a6836' });
    for (const sx of [-1, 1]) b.add(G.rbox(0.06, B.h - 0.6, B.d - 1.2, 0.02, 1), { p: [sx * (B.w / 2 - B.t - 0.02), B.h / 2 + 0.2, 0], color: inner });
    b.add(G.rbox(0.2, 1.0, 1.2, 0.06, 2), { p: [-B.w / 2 - 0.1, B.h - 0.9, 0], color: '#c9a24a' }); // the hasp
    box.add(mesh(keep(b.build()), Mt.furn));
    const l = new G.Bag(), L = LID;
    l.add(G.rbox(L.w, L.t, L.d, 0.12, 2), { p: [-L.w / 2, L.t / 2, 0], color: '#8a5a30' });
    l.add(G.rbox(L.w - 1.2, 0.1, L.d - 1.2, 0.04, 1), { p: [-L.w / 2, L.t + 0.04, 0], color: '#9a6836' });
    l.add(G.rbox(L.w - 1.2, 0.1, L.d - 1.2, 0.04, 1), { p: [-L.w / 2, -0.04, 0], color: '#6e4a2a' });
    l.add(G.rbox(0.9, 0.7, 1.0, 0.06, 2), { p: [-L.w + 0.25, -0.2, 0], color: '#c9a24a' }); // the hasp's other half
    const lm = mesh(keep(l.build()), Mt.furn);
    lid.add(lm);
    lid.position.set(B.w / 2 + 0.1, B.h, 0);
    box.add(lid);
    box.position.set(M * B.x, 0, B.z);
    box.rotation.y = M < 0 ? Math.PI : 0;
    root.add(box);
  }
  // the line of light where the lid meets the front wall, seen from inside; the light it lets
  // down the wall; and a little of it on whatever is in there
  const slit = new THREE.Group();
  {
    // (in the box's own frame, so it turns with it)
    const len = BOX.d - BOX.t * 2 - 0.1, x = -BOX.w / 2 + BOX.t;
    const line = new THREE.Mesh(keep(new THREE.BoxGeometry(0.09, 0.05, len)), keep(new THREE.MeshBasicMaterial({ color: new THREE.Color(9, 8, 6.4) })));
    line.position.set(x + 0.03, BOX.h + 0.03, 0);
    const lc = makeCanvas(8, 64), lg = lc.g.createLinearGradient(0, 0, 0, 64);
    lg.addColorStop(0, 'rgba(255,240,210,0.9)'); lg.addColorStop(0.15, 'rgba(255,225,180,0.35)'); lg.addColorStop(1, 'rgba(255,210,160,0)');
    lc.g.fillStyle = lg; lc.g.fillRect(0, 0, 8, 64);
    const lt = keep(new THREE.CanvasTexture(lc.canvas)); lt.colorSpace = THREE.SRGBColorSpace;
    const leak = new THREE.Mesh(keep(new THREE.PlaneGeometry(len, 2.6).rotateY(Math.PI / 2)), keep(new THREE.MeshBasicMaterial({ map: lt, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, color: new THREE.Color(1.4, 1.2, 1.0) })));
    leak.position.set(x + 0.04, BOX.h - 1.3, 0);
    slit.add(line, leak);
    slit.visible = false;
  }
  box.add(slit);
  const slitLight = new THREE.PointLight(new THREE.Color(1, 0.88, 0.7), 0, 12, 1.2);
  slitLight.position.set(-BOX.w / 2 + 3.4, BOX.h - 2.4, -1);
  box.add(slitLight);

  // ---- the toys that get tidied ----
  const plastic = colors.map((c) => (Q.pbr ? keep(softPatch(new THREE.MeshStandardMaterial({ color: new THREE.Color(c), roughness: 0.36, metalness: 0, emissive: new THREE.Color(c).multiplyScalar(0.06) }), U, { wrap: 0.4, rim: [0.06, 0.06, 0.06] })) : mat({ color: c, vertexColors: true, emissive: new THREE.Color(c).multiplyScalar(0.08) })));
  const trophyMat = plastic.map((m) => { const c = m.clone(); c.onBeforeCompile = m.onBeforeCompile; c.customProgramCacheKey = m.customProgramCacheKey; c.userData = m.userData; return keep(c); });
  const soldier = (i, trophy) => { const m = mesh(toys.stand, trophy ? trophyMat[i] : plastic[i]); m.scale.setScalar(FIG); return m; };
  const pieces = (i) => toys.pieces.map((pc) => { const m = mesh(pc.geo, plastic[i]); m.scale.setScalar(FIG); m.userData.c = pc.c; m.userData.name = pc.name; return m; });
  const blockGeos = [];
  const blockGeo = (cells) => { const g = keep(G.faceCells(G.rbox(2.1, 2.1, 2.1, 0.13, 3), cells, 4, 4)); blockGeos.push(g); return g; };
  const anyCells = () => Array.from({ length: 6 }, () => 4 + Math.floor(rng() * 12));
  const block = (f) => mesh(blockGeo(f >= 0 ? Array(6).fill(f) : anyCells()), Mt.block);
  const domGeos = [0, 1, 2, 3].map((cell) => {
    const g = keep(G.rbox(0.95, 1.9, 0.24, 0.05, 2)), uv = g.attributes.uv, per = uv.count / 6;
    for (let i = 0; i < uv.count; i++) {
      if (Math.floor(i / per) < 4) uv.setXY(i, 0.06 / 4 + cell / 4, 0.03);
      else uv.setX(i, (cell + uv.getX(i)) / 4);
    }
    return g;
  });
  const domino = () => mesh(pick(rng, domGeos), Mt.domino);
  const cars = toys.cars.map((g) => mesh(g, Mt.paint));

  // ---- the old frame on the floor ----
  function decal(img, proj) {
    const tImg = keep(new THREE.CanvasTexture(img));
    tImg.colorSpace = THREE.NoColorSpace; tImg.generateMipmaps = false; tImg.minFilter = tImg.magFilter = THREE.LinearFilter;
    const m = keep(new THREE.ShaderMaterial({
      lights: true, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.lights, {
        tImg: { value: null }, uProj: { value: new THREE.Matrix4() }, uFeather: { value: 0 }, uFade: { value: 1 }, uSweepX: { value: -99 }, uSweepZ0: { value: 0 }, uSweepZ1: { value: 0 }, uSweepOn: { value: 0 }, uMirror: { value: M },
        uHeal: { value: [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()] },
      }]),
      vertexShader: DECAL_VERT, fragmentShader: DECAL_FRAG,
    }));
    m.uniforms.tImg.value = tImg;
    m.uniforms.uProj.value.copy(proj);
    const d = new THREE.Mesh(keep(new THREE.PlaneGeometry(240, 200).rotateX(-Math.PI / 2)), m);
    d.position.y = 0.04;
    d.receiveShadow = true;
    d.renderOrder = 1;
    scene.add(d); // (world space: the picture is never mirrored)
    return { mesh: d, u: m.uniforms };
  }

  // ---- light: the big light is on ----
  const hemi = new THREE.HemisphereLight(new THREE.Color(0.85, 0.88, 1.0), new THREE.Color(0.42, 0.32, 0.24), Q.pbr ? 1.0 : 1.25);
  const key = new THREE.DirectionalLight(new THREE.Color(1, 0.95, 0.86), Q.pbr ? 2.3 : 1.9);
  key.position.set(-14, 70, 30);
  key.target.position.set(2, 0, -3);
  key.castShadow = true;
  key.shadow.mapSize.set(Q.shadow, Q.shadow);
  Object.assign(key.shadow.camera, { left: -46, right: 46, top: 34, bottom: -34, near: 20, far: 140 });
  key.shadow.camera.updateProjectionMatrix();
  key.shadow.bias = -0.0008; key.shadow.normalBias = 0.04; key.shadow.radius = 3;
  const lamp = new THREE.SpotLight(new THREE.Color(1, 0.78, 0.5), Q.pbr ? 900 : 700, 0, 0.5, 0.9, 2);
  lamp.position.set(-8.5, 17.5, -11.5);
  lamp.target.position.set(0, 0, 0.5);
  root.add(hemi, key, key.target, lamp, lamp.target);

  return {
    scene, root, G, toys, tex, Mt, box, lid, shelf, label, slit, slitLight, hemi, key, lamp, lampGlow, trophyMat,
    soldier, pieces, block, domino, cars, plastic, decal,
    dispose() {
      for (const x of own) x.dispose();
      toys.dispose(); tex.dispose();
      if (key.shadow.map) key.shadow.map.dispose();
      if (lamp.shadow && lamp.shadow.map) lamp.shadow.map.dispose();
    },
  };
}

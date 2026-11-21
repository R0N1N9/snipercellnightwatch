// Sniper Cell: Infiltration — the map.
// Kestrel Ridge, a fenced data-center compound in a dark valley, overlooked from the south by
// a cliff the shooter can work from. Everything here is axis-aligned boxes, so collision,
// line of sight and bullets share one cheap model:
//   solid  blocks movement      sight  blocks vision      shot  stops bullets
// Units are metres; +x east, +z south, y up. The van drops the cell in a wooded draw south of
// the ridge (z ≈ 276); they walk north up the draw, over the crest (z ≈ 148) and out to the cliff.
import * as THREE from 'three';
import { withHaze } from '../atmosphere.js';
import { segBox, clamp, smoothstep, fbm, mulberry32 } from '../util.js';

export const BOUNDS = { x0: -175, x1: 175, z0: -150, z1: 335 };
export const FENCE = { x: 80, z: 60 };
// A tall block: a lobby floor at ground level and the data floor high up at f1, with the shell
// of empty storeys between (the stair tower and the elevator run through them). h is the roof.
export const BUILDING = { x0: -36, x1: 36, z0: -40, z1: 0, h: 27.8, f1: 24, g: 3.6 };
// The stair tower (switchback flights, 3 m each) and the elevator shaft.
export const TOWER = { x0: -35.6, x1: -28.4, z0: -17.8, z1: -12.8, flight: 3, laneA: [-17.8, -15.4], laneB: [-15.2, -12.8], west: -34.4, east: -29.9 };
export const SHAFT = { x0: -7.6, x1: -3.6, z0: -17.8, z1: -13.8, door: [-6.6, -4.6], speed: 4 };
// The lobby security checkpoint (a walk-through metal detector just inside the front doors).
export const CHECKPOINT = { x0: -0.9, x1: 0.9, z: -3.8 };
export const CLIFF = { y: 22, z: 104 };

// Named places the mission and the AI use.
export const SPOTS = {
  insert: [{ x: 6.9, z: 276 }, { x: 5.1, z: 276 }], // the drop-off in the draw (shooter, spotter)
  overlook: { x: -6, z: 131 }, // where an AI spotter sets up once you're over the crest
  crest: 150, // north of this you're over the hill and the approach is behind you
  perches: [
    { id: 'cliff', name: 'SOUTH CLIFF', x: 2, z: 110.5, yaw: 0 },
    { id: 'east', name: 'EAST KNOLL', x: 128, z: -72, yaw: Math.PI / 2 + 0.5 },
    { id: 'west', name: 'WEST KNOLL', x: -136, z: -28, yaw: -Math.PI / 2 },
    { id: 'roof', name: 'TOWER ROOF', x: 0, z: -1.6, yaw: Math.PI },
    { id: 'north', name: 'NORTH RIDGE', x: 1, z: -117, yaw: Math.PI },
  ],
  relay: { x: 33.2, z: -6, y: 1.1 },
  server: { x: 30, z: -35.6, y: 1.1 },
  lz: { x: 110, z: -16, r: 7 }, // the extraction van, on the east track
  barracks: { x: 43.5, z: 22 },
  gate: { x: 0, z: 72 },
  dronePad: { x: -52, z: 22.5, y: 1.2 }, // in front of the drone bay
  droneBay: { x: -52, z: 30 },
};

// Drop points the cell can choose in the menu. Each sets where the van comes in (vx, from z0
// to z1), where you and your partner start, and whether there's an approach to walk.
export const DROPS = {
  draw: { name: 'TREE LINE', desc: 'The wooded draw south of the ridge. Walk in under the trees, clear the pickets, crest the hill.', van: [6, 336, 298], insert: [{ x: 6.9, z: 276 }, { x: 5.1, z: 276 }], approach: true },
  // HALO jumps from a transport onto the knolls either side of the valley (Ra lands on the perch).
  north: { name: 'NORTH RIDGE', desc: 'HALO jump onto the ridge behind the tower. Looks straight down on the back of the building and the north towers.', air: true, from: [0.15, -1], insert: [{ x: 7, z: -122 }, { x: 4, z: -120 }], perch: 4, overlook: { x: -4, z: -121 }, approach: false },
  roof: { name: 'TOWER ROOF', desc: 'HALO straight onto the tower roof, then down the service hatch onto the data floor. Fast, high, nowhere to run.', air: true, roof: true, from: [0.25, 1], insert: [{ x: -2, z: -14 }, { x: 1.5, z: -12 }], perch: 3, overlook: { x: 10, z: -8 }, approach: false },
  west: { name: 'WEST KNOLL', desc: 'HALO jump from a transport, canopies onto the west knoll. Long view over the west fence.', air: true, from: [-1, 0.35], insert: [{ x: -133, z: -27 }, { x: -134.5, z: -23.5 }], perch: 2, overlook: { x: -131, z: -21 }, approach: false },
  east: { name: 'EAST KNOLL', desc: 'HALO jump from a transport, canopies onto the east knoll. Overlooks the dock and the exfil track.', air: true, from: [1, -0.25], insert: [{ x: 126, z: -70 }, { x: 127.5, z: -66.5 }], perch: 1, overlook: { x: 124, z: -64 }, approach: false },
};
export function setInsertion(kind) {
  const D = DROPS[kind] || DROPS.draw;
  SPOTS.insert = D.insert.map((p) => ({ ...p }));
  SPOTS.overlook = D.overlook ? { ...D.overlook } : { x: -6, z: 131 };
  SPOTS.drop = kind in DROPS ? kind : 'draw';
  return D;
}

// Rack-room keycards: one per door, each with a coloured tag that matches the door's reader.
export const CARDS = {
  dhb: { name: 'GREEN', color: '#40ff70' },
  srv: { name: 'BLUE', color: '#40a0ff' },
  arch: { name: 'VIOLET', color: '#c060ff' },
};

export const ROOMS = [
  // Ground floor
  { id: 'staging', name: 'STAGING / STAIR TOWER', x0: -36, z0: -18, x1: -8, z1: 0, tier: 1, floor: 0, y0: 0 },
  { id: 'lobby', name: 'LOBBY / CHECKPOINT', x0: -8, z0: -18, x1: 8, z1: 0, tier: 1, floor: 0, y0: 0 },
  { id: 'security', name: 'SECURITY / CCTV', x0: 8, z0: -18, x1: 22, z1: 0, tier: 1, floor: 0, y0: 0 },
  { id: 'electrical', name: 'ELECTRICAL', x0: 22, z0: -18, x1: 36, z1: 0, tier: 1, floor: 0, y0: 0 },
  { id: 'corridor', name: 'MAIN CORRIDOR', x0: -36, z0: -22, x1: 36, z1: -18, tier: 1, floor: 0, y0: 0 },
  { id: 'mail', name: 'MAILROOM / LOADING', x0: -36, z0: -40, x1: -6, z1: -22, tier: 1, floor: 0, y0: 0 },
  { id: 'guard', name: 'GUARD ROOM', x0: -6, z0: -40, x1: 12, z1: -22, tier: 1, floor: 0, y0: 0 },
  { id: 'plant', name: 'PLANT ROOM', x0: 12, z0: -40, x1: 36, z1: -22, tier: 1, floor: 0, y0: 0 },
  // The data floor, high up (stairs or elevator).
  { id: 'offices', name: 'OFFICES / STAIRS', x0: -36, z0: -18, x1: -8, z1: 0, tier: 1, floor: 1, y0: 24 },
  { id: 'break', name: 'BREAK ROOM / ELEVATOR', x0: -8, z0: -18, x1: 8, z1: 0, tier: 1, floor: 1, y0: 24 },
  { id: 'comms', name: 'COMMS ROOM', x0: 8, z0: -18, x1: 22, z1: 0, tier: 1, floor: 1, y0: 24 },
  { id: 'storage', name: 'STORAGE', x0: 22, z0: -18, x1: 36, z1: 0, tier: 1, floor: 1, y0: 24 },
  { id: 'corridor2', name: 'DATA FLOOR CORRIDOR', x0: -36, z0: -22, x1: 36, z1: -18, tier: 1, floor: 1, y0: 24 },
  { id: 'dhb', name: 'DATA HALL B', x0: -36, z0: -40, x1: -6, z1: -22, tier: 2, floor: 1, y0: 24, racks: true },
  { id: 'srv', name: 'SERVER ROOM C', x0: -6, z0: -40, x1: 12, z1: -22, tier: 2, floor: 1, y0: 24, racks: true },
  { id: 'arch', name: 'ARCHIVE', x0: 12, z0: -40, x1: 36, z1: -22, tier: 2, floor: 1, y0: 24, racks: true },
  { id: 'barracks', name: 'BARRACKS', x0: 46, z0: 14, x1: 70, z1: 30, tier: 0, solid: true },
];

// ---------------------------------------------------------------------------
// Terrain
// ---------------------------------------------------------------------------
// The approach: a wooded draw winding south from the ridge to the drop-off. Its floor sits
// ~11 m below the plateau, hemmed in by forested sides; a low crest just behind the cliff top
// hides the compound until you're over it.
export const DRAW = { z0: 150, z1: 300 };
export function drawX(z) {
  return 4 + 16 * Math.sin((z - 160) / 30) * smoothstep(160, 190, z) * (1 - smoothstep(250, 285, z));
}
function approachH(x, z) {
  if (z < 128) return 0;
  const off = Math.abs(x - drawX(z));
  const crest = 3 * smoothstep(128, 146, z) * (1 - smoothstep(150, 168, z));
  const drop = -11 * smoothstep(150, 186, z);
  const walls = (9 + 10 * fbm(z * 0.02 + 1.7, x * 0.02, 2)) * smoothstep(12, 46, off) * smoothstep(150, 182, z);
  const end = smoothstep(330, 390, z) * 30;
  return crest + drop + walls + end;
}

function bump(x, z, cx, cz, r, h) {
  const d2 = ((x - cx) ** 2 + (z - cz) ** 2) / (r * r);
  return d2 > 4 ? 0 : h * Math.exp(-d2);
}
export function terrainHeight(x, z) {
  // Flat pad under the compound, with rolling ground around it.
  const pad = smoothstep(0, 1, Math.max(Math.abs(x) - (FENCE.x + 6), 0) / 30 + Math.max(Math.abs(z) - (FENCE.z + 6), 0) / 30);
  let h = (fbm(x * 0.012 + 3.1, z * 0.012 - 7.7, 4) - 0.5) * 7 * pad;
  // The south cliff: a steep face from z 96 to 108, with a gentle trail down its west end.
  const steep = CLIFF.y * smoothstep(96, 108, z);
  const gentle = CLIFF.y * smoothstep(58, 150, z);
  const trail = smoothstep(-84, -104, x);
  const cliff = steep + (gentle - steep) * trail;
  h = Math.max(h, 0) * (1 - smoothstep(90, 104, z)) + cliff + (z > 108 ? (fbm(x * 0.03, z * 0.03, 3) - 0.5) * 2.2 * smoothstep(108, 120, z) : 0);
  // A lip on the cliff edge, then the plateau climbing into the hills behind.
  h += bump(x, z, 2, 108.5, 3, 0.6) + approachH(x, z);
  // Knolls east and west (alternate perches), and mountains hemming in the valley.
  h += bump(x, z, 128, -72, 16, 12) + bump(x, z, -136, -28, 15, 10);
  h += smoothstep(120, 175, Math.abs(x)) * 34 * (0.7 + 0.6 * fbm(z * 0.02, x * 0.01, 2));
  h += smoothstep(-95, -150, z) * 38 * (0.7 + 0.6 * fbm(x * 0.02, 5.5, 2));
  // The east track out to the van is graded flat.
  const fx = Math.max(0, 84 - x, x - 150), fz = Math.max(0, Math.abs(z + 16) - 7);
  h *= smoothstep(0, 12, Math.hypot(fx, fz));
  return h;
}

// ---------------------------------------------------------------------------
// Materials
// ---------------------------------------------------------------------------
const matCache = new Map();
export function lam(color, opts = {}) {
  const k = color + JSON.stringify(opts);
  if (!matCache.has(k)) matCache.set(k, withHaze(new THREE.MeshLambertMaterial({ color, ...opts }), { key: 'cell' + (opts.emissive ? 'e' : '') }));
  return matCache.get(k);
}
export function glowMat(color, opacity = 0.35) {
  return new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
}

// Merge many transformed box geometries that share one material into a single mesh.
export function mergeBoxes(list, material) {
  let n = 0;
  const geos = list.map(({ geo, m }) => { const g = geo.index ? geo.toNonIndexed() : geo; g.applyMatrix4(m); n += g.attributes.position.count; return g; });
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3);
  const withUv = geos.every((g) => g.attributes.uv), uv = withUv ? new Float32Array(n * 2) : null;
  let o = 0;
  for (const g of geos) {
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    if (uv) uv.set(g.attributes.uv.array, o * 2);
    o += g.attributes.position.count;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  if (uv) geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.computeBoundingSphere();
  return new THREE.Mesh(geo, material);
}

// ---------------------------------------------------------------------------
// Facility
// ---------------------------------------------------------------------------
export class Facility {
  // opts.layout: 'standard' (the built map) or 'random' (yard cover, light poles and the west
  // fence cut placed from the game's seed, so both players get the same compound).
  constructor(scene, quality = 'medium', seed = 7, opts = {}) {
    this.scene = scene;
    this.quality = quality;
    this.rng = mulberry32((seed | 0) + 1013);
    this.layout = opts.layout === 'random' ? 'random' : 'standard';
    this.lrng = mulberry32((seed | 0) * 7 + 5);
    this.cutZ = this.layout === 'random' ? [-36, -22, -6, 11, 40][Math.floor(this.lrng() * 5)] : 11;
    this.boxes = [];
    this.doors = {};
    this.lightSources = []; // { x, y, z, r, zone }
    this.batches = new Map(); // material -> [{geo, m}]
    this.root = new THREE.Group();
    scene.add(this.root);
    this.t = 0;
    this._build();
  }

  // ---- geometry helpers ------------------------------------------------------
  _queue(geo, m, material) {
    if (!this.batches.has(material)) this.batches.set(material, []);
    this.batches.get(material).push({ geo, m });
  }
  // Axis-aligned box from min/max corners. flags: solid / sight / shot (default all true).
  box(x0, y0, z0, x1, y1, z1, color, flags = {}) {
    const b = { min: [Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1)], max: [Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1)], solid: flags.solid !== false, sight: flags.sight !== false, shot: flags.shot !== false, kind: flags.kind || 'wall' };
    if (b.solid || b.sight || b.shot) this.boxes.push(b);
    if (color) {
      const g = new THREE.BoxGeometry(b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]);
      const m = new THREE.Matrix4().makeTranslation((b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2);
      if (flags.mesh) {
        const mesh = new THREE.Mesh(g, lam(color, flags.matOpts || {}));
        mesh.position.setFromMatrixPosition(m);
        this.root.add(mesh);
        b.mesh = mesh;
      } else this._queue(g, m, lam(color, flags.matOpts || {}));
    }
    return b;
  }
  // Visual-only geometry.
  deco(geo, x, y, z, color, ry = 0, matOpts) {
    const m = new THREE.Matrix4().makeRotationY(ry).setPosition(x, y, z);
    this._queue(geo, m, lam(color, matOpts || {}));
  }

  // Wall along x (constant z) or z (constant x) from a to b, with gaps [{a,b,y0,y1}].
  wallX(z, x0, x1, y0, y1, gaps, color, t = 0.5) {
    this._wall('x', z, x0, x1, y0, y1, gaps, color, t);
  }
  wallZ(x, z0, z1, y0, y1, gaps, color, t = 0.5) {
    this._wall('z', x, z0, z1, y0, y1, gaps, color, t);
  }
  _wall(axis, c, a0, a1, y0, y1, gaps, color, t) {
    const mk = (s0, s1, h0, h1) => {
      if (s1 - s0 < 0.01 || h1 - h0 < 0.01) return;
      if (axis === 'x') this.box(s0, h0, c - t / 2, s1, h1, c + t / 2, color);
      else this.box(c - t / 2, h0, s0, c + t / 2, h1, s1, color);
    };
    const gs = [...(gaps || [])].sort((p, q) => p.a - q.a);
    let s = a0;
    for (const g of gs) {
      mk(s, g.a, y0, y1);
      // Above (lintel) and below (sill) the opening.
      mk(g.a, g.b, g.y1 ?? 2.6, y1);
      if (g.y0) mk(g.a, g.b, y0, g.y0);
      s = g.b;
    }
    mk(s, a1, y0, y1);
  }

  door(id, kind, tier, x0, z0, x1, z1, color = '#3a3f48', height = 2.6, y = 0) {
    const b = this.box(x0, y, z0, x1, y + height, z1, color, { mesh: true, kind: 'door' });
    b.door = id;
    // Panel accent: a status light over the door (red locked, green open, amber hacked).
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.12, 0.25), new THREE.MeshBasicMaterial({ color: '#ff3040' }));
    lamp.position.set((x0 + x1) / 2, y + height + 0.25, (z0 + z1) / 2);
    this.root.add(lamp);
    const horiz = Math.abs(x1 - x0) > Math.abs(z1 - z0);
    this.doors[id] = { id, kind, tier, box: b, lamp, open: false, openT: 0, hackT: 0, sealed: false, unlocked: kind === 'auto', x: (x0 + x1) / 2, z: (z0 + z1) / 2, y, horiz, home: b.mesh.position.clone(), w: horiz ? Math.abs(x1 - x0) : Math.abs(z1 - z0) };
    return this.doors[id];
  }

  // ---- build -------------------------------------------------------------------
  _build() {
    this._terrain();
    this._compound();
    this._building();
    this._yard();
    this._vegetation();
    for (const [material, list] of this.batches) {
      const mesh = mergeBoxes(list, material);
      this.root.add(mesh);
    }
    this.batches.clear();
    this._nav();
  }

  _terrain() {
    const W = BOUNDS.x1 - BOUNDS.x0 + 140, D = BOUNDS.z1 - BOUNDS.z0 + 140;
    const seg = this.quality === 'low' ? 140 : 220;
    const geo = new THREE.PlaneGeometry(W, D, seg, Math.round(seg * D / W)).rotateX(-Math.PI / 2);
    geo.translate((BOUNDS.x0 + BOUNDS.x1) / 2, 0, (BOUNDS.z0 + BOUNDS.z1) / 2);
    const p = geo.attributes.position;
    const col = new Float32Array(p.count * 3);
    const c = new THREE.Color(), grass = new THREE.Color('#2b3b2f'), dirt = new THREE.Color('#38372f'), rock = new THREE.Color('#474950'), gravel = new THREE.Color('#3d4045');
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i);
      const h = terrainHeight(x, z);
      p.setY(i, h);
      const e = 1.2;
      const slope = Math.hypot(terrainHeight(x + e, z) - terrainHeight(x - e, z), terrainHeight(x, z + e) - terrainHeight(x, z - e)) / (2 * e);
      const inside = Math.abs(x) < FENCE.x + 2 && Math.abs(z) < FENCE.z + 2;
      c.copy(inside ? gravel : grass).lerp(dirt, fbm(x * 0.05, z * 0.05, 2) * 0.6);
      c.lerp(rock, smoothstep(0.6, 1.1, slope));
      col.set([c.r, c.g, c.b], i * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, withHaze(new THREE.MeshLambertMaterial({ vertexColors: true }), { key: 'cellT' }));
    this.root.add(m);
    // Roads: gate to the south trail, and a track out east to the landing zone.
    const road = lam('#26272b');
    const r1 = new THREE.Mesh(new THREE.PlaneGeometry(9, 40).rotateX(-Math.PI / 2), road);
    r1.position.set(0, 0.04, 80);
    const r2 = new THREE.Mesh(new THREE.PlaneGeometry(60, 7).rotateX(-Math.PI / 2), road);
    r2.position.set(110, 0.05, -18);
    this.root.add(r1, r2);
    // Big boulders along the approach: real cover.
    const rng = mulberry32(31);
    const rocks = [[-30, 82], [24, 86], [-55, 74], [52, 78], [-12, 92], [70, 90], [-92, 40], [-100, -10], [96, 10], [100, -40], [-70, 88], [40, 98]];
    for (const [x, z] of rocks) {
      const s = 1.6 + rng() * 1.8, y = terrainHeight(x, z);
      const g = new THREE.DodecahedronGeometry(s, 0).scale(1.3, 0.8, 1.1);
      this.deco(g, x, y + s * 0.45, z, '#3a3c42', rng() * 6);
      this.box(x - s * 1.1, y - 1, z - s * 0.95, x + s * 1.1, y + s * 1.05, z + s * 0.95, null);
    }
  }

  _compound() {
    // Chain-link fence: blocks movement only. Gaps: south gate, a cut on the west side, east service gap.
    const fenceMat = (() => {
      const cv = document.createElement('canvas');
      cv.width = cv.height = 64;
      const g = cv.getContext('2d');
      g.strokeStyle = 'rgba(160,170,180,0.9)';
      g.lineWidth = 2;
      for (let i = -64; i < 128; i += 16) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 64, 64); g.stroke(); g.beginPath(); g.moveTo(i + 64, 0); g.lineTo(i, 64); g.stroke(); }
      const tex = new THREE.CanvasTexture(cv);
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(1, 1);
      tex.colorSpace = THREE.SRGBColorSpace;
      return withHaze(new THREE.MeshLambertMaterial({ map: tex, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide }), { key: 'fence' });
    })();
    const H = 3.2;
    const seg = (x0, z0, x1, z1) => {
      const len = Math.hypot(x1 - x0, z1 - z0);
      const g = new THREE.PlaneGeometry(len, H);
      g.attributes.uv.array.forEach((v, i, a) => { a[i] = i % 2 === 0 ? v * len / 2 : v * H / 2; });
      const m = new THREE.Mesh(g, fenceMat);
      m.position.set((x0 + x1) / 2, H / 2, (z0 + z1) / 2);
      m.rotation.y = Math.abs(x1 - x0) > Math.abs(z1 - z0) ? 0 : Math.PI / 2;
      this.root.add(m);
      this.box(Math.min(x0, x1) - 0.1, 0, Math.min(z0, z1) - 0.1, Math.max(x0, x1) + 0.1, H, Math.max(z0, z1) + 0.1, null, { sight: false, shot: false, kind: 'fence' });
      for (let i = 0; i <= Math.floor(len / 4); i++) {
        const u = Math.min(1, (i * 4) / len);
        this.deco(new THREE.CylinderGeometry(0.06, 0.06, H + 0.4, 6), x0 + (x1 - x0) * u, (H + 0.4) / 2, z0 + (z1 - z0) * u, '#5b6068');
      }
    };
    const { x: X, z: Z } = FENCE;
    seg(-X, Z, -7, Z); seg(7, Z, X, Z); // south, gate gap
    seg(-X, -Z, X, -Z);
    seg(-X, -Z, -X, this.cutZ - 4); seg(-X, this.cutZ + 4, -X, Z); // west, the cut (z 7..15 on the standard map)
    seg(X, -Z, X, -27); seg(X, -19, X, Z); // east, service gap at z -27..-19
    // Gate: posts, booth, barrier arm (decorative).
    this.box(-7.5, 0, Z - 0.4, -6.5, 4, Z + 0.4, '#4a4e56');
    this.box(6.5, 0, Z - 0.4, 7.5, 4, Z + 0.4, '#4a4e56');
    this.deco(new THREE.BoxGeometry(12, 0.18, 0.18), 0, 1.1, Z + 0.8, '#c8b030');
    this.box(9, 0, Z - 7, 13, 3, Z - 3, '#565a60');
    this.box(8.8, 3, Z - 7.2, 13.2, 3.3, Z - 2.8, '#3d4046');
    this._light(11, 4.2, Z - 2.6, 18, 'yard', '#ffcf8a', true);
    // Guard towers at the four corners: legs, platform, waist-high rail (doesn't stop bullets).
    this.towers = [];
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const x = sx * (X - 7), z = sz * (Z - 7);
      for (const [lx, lz] of [[-1.4, -1.4], [1.4, -1.4], [-1.4, 1.4], [1.4, 1.4]]) this.box(x + lx - 0.15, 0, z + lz - 0.15, x + lx + 0.15, 6, z + lz + 0.15, '#4b4f57', { sight: false });
      this.box(x - 2, 6, z - 2, x + 2, 6.3, z + 2, '#3f434a');
      for (const [a0, a1, b0, b1] of [[-2, 2, -2, -1.9], [-2, 2, 1.9, 2], [-2, -1.9, -2, 2], [1.9, 2, -2, 2]]) this.box(x + a0, 6.3, z + b0, x + a1, 7.3, z + b1, '#4f535b', { sight: false, shot: false });
      this.box(x - 2.2, 9, z - 2.2, x + 2.2, 9.25, z + 2.2, '#34373d', { sight: false });
      for (const [lx, lz] of [[-1.9, -1.9], [1.9, -1.9], [-1.9, 1.9], [1.9, 1.9]]) this.deco(new THREE.CylinderGeometry(0.06, 0.06, 2.7, 5), x + lx, 7.65, z + lz, '#4b4f57');
      this.towers.push({ x, z, y: 6.3, face: Math.atan2(-x, -z) + Math.PI });
      this._light(x - sx * 1.6, 8.6, z - sz * 1.6, 30, 'yard', '#fff1cf', true, { x: -sx, z: -sz });
    }
    // Light poles around the yard.
    const poles = this.layout === 'random' ? this._randomSpots(7, 2) : [[-45, 42], [45, 42], [-58, -48], [30, -50], [0, 30], [62, -8], [-62, 4]];
    for (const [x, z] of poles) {
      this.deco(new THREE.CylinderGeometry(0.12, 0.16, 8, 6), x, 4, z, '#50545c');
      this._light(x, 8, z, 17, 'yard', '#ffc98a', true);
    }
  }

  _light(x, y, z, r, zone, color, visible, aim) {
    const L = { id: this.lightSources.length, x, y, z, r, zone, color, aim, kind: 'lamp', broken: false, offT: 0, on: true };
    this.lightSources.push(L);
    if (visible) {
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.25, 0.5), new THREE.MeshBasicMaterial({ color }));
      lamp.position.set(x, y, z);
      this.root.add(lamp);
      // Ground pool + a faint light cone, so lit areas read from the cliff.
      const gy = (this._groundForPool(x, z) || 0) + 0.06;
      const pool = new THREE.Mesh(new THREE.CircleGeometry(r * 0.62, 28).rotateX(-Math.PI / 2), poolMat(color));
      const px = aim ? x + aim.x * r * 0.25 : x, pz = aim ? z + aim.z * r * 0.25 : z;
      pool.position.set(px, gy, pz);
      const cone = new THREE.Mesh(new THREE.ConeGeometry(r * 0.5, y - gy, 24, 1, true), coneMat(color));
      cone.position.set((x + px) / 2, (y + gy) / 2, (z + pz) / 2);
      if (aim) cone.lookAt(px, gy, pz), cone.rotateX(Math.PI / 2);
      this.root.add(pool, cone);
      L.fx = [lamp, pool, cone];
    }
    return L;
  }
  // A wall-mounted panel light in the stair tower (counts for visibility like the room panels).
  _towerLight(x, y, z) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.5, 1.2), new THREE.MeshBasicMaterial({ color: '#dfe8f5' }));
    m.position.set(x, y, z);
    this.root.add(m);
    this.lightSources.push({ id: this.lightSources.length, x, y, z, r: 7, zone: 'floor', room: 'staging', floor: 0, interior: true, kind: 'panel', fx: [m], color: '#dfe8f5', broken: false, offT: 0, on: true });
  }

  // Elevator car at height y: move the car floor and roof; a landing door is open (not solid)
  // only while the car is level with it.
  setLift(y) {
    const L = this.lift;
    if (!L) return;
    L.y = y;
    const mv = (b, y0, y1) => { b.min[1] = y0; b.max[1] = y1; if (b.mesh) b.mesh.position.y = (y0 + y1) / 2; };
    mv(L.car, y - 0.27, y + 0.02);
    mv(L.roof, y + 2.7, y + 2.85);
    for (const d of L.doors) {
      const here = Math.abs(y - d.y) < 0.05;
      d.b.solid = d.b.sight = d.b.shot = !here;
      d.b.mesh.visible = !here;
      if (d.ind) d.ind.material.color.set(here ? '#30ffd0' : '#ff9a20');
    }
  }
  // Is a point inside the elevator car?
  inLift(x, z, y) {
    const S = SHAFT, L = this.lift;
    return !!L && x > S.x0 && x < S.x1 && z > S.z0 && z < S.z1 && Math.abs(y - L.y) < 1.2;
  }

  _groundForPool(x, z) {
    let y = terrainHeight(x, z);
    if (x > BUILDING.x0 && x < BUILDING.x1 && z > BUILDING.z0 && z < BUILDING.z1) y = Math.max(y, 0);
    return Math.max(y, 0);
  }

  _building() {
    const { x0, x1, z0, z1, h, f1 } = BUILDING;
    const wall = '#5a5f66', inner = '#41454c', trim = '#2d3036';
    const G = BUILDING.g; // ground-floor ceiling
    // Ground slab; the lobby ceiling and the data-floor slab, both with holes for the stair
    // tower and the elevator shaft; the roof. The storeys between are an empty shell.
    this.box(x0, -0.2, z0, x1, 0.02, z1, '#3a3d42', { solid: false, sight: false, shot: false });
    this.deco(new THREE.BoxGeometry(x1 - x0, 0.02, z1 - z0), (x0 + x1) / 2, 0.03, (z0 + z1) / 2, '#2f3237');
    this.stairHoles = [{ x0: TOWER.x0, x1: TOWER.x1, z0: TOWER.z0, z1: TOWER.z1 }];
    const holes = [...this.stairHoles, { x0: SHAFT.x0 - 0.2, x1: SHAFT.x1 + 0.2, z0: SHAFT.z0, z1: SHAFT.z1 + 0.2 }];
    this._slab(x0, x1, z0, z1, G, G + 0.2, holes, '#34373d');
    this._slab(x0, x1, z0, z1, f1 - 0.2, f1, holes, '#34373d');
    this.box(x0 - 0.4, h, z0 - 0.4, x1 + 0.4, h + 0.5, z1 + 0.4, '#3b3f45', { solid: true });
    this.deco(new THREE.BoxGeometry(x1 - x0 + 1.2, 0.5, 0.6), 0, h + 0.75, z1 + 0.1, trim);
    this.deco(new THREE.BoxGeometry(x1 - x0 + 1.2, 0.5, 0.6), 0, h + 0.75, z0 - 0.1, trim);
    this.deco(new THREE.BoxGeometry(x1 - x0 + 0.8, 0.3, 0.4), 0, f1 - 0.05, z1 + 0.05, trim); // floor band outside
    // Exterior walls, both storeys: doors on the ground floor, windows on both.
    const win = (a, b, up = false) => ({ a, b, y0: up ? f1 + 1.1 : 1.1, y1: up ? f1 + 2.4 : 2.4 });
    const southWins = [[-7, -3], [3, 7], [10, 14], [16, 20], [-30, -26], [-20, -16]];
    this._wallSplit('x', z1, x0, x1, [{ a: -2, b: 2 }, ...southWins.map(([a, b]) => win(a, b)), ...southWins.map(([a, b]) => win(a, b, true))], wall);
    this._wallSplit('x', z0, x0, x1, [win(-30, -24), win(-18, -12), win(-30, -24, true), win(4, 10, true), win(18, 24, true)], wall);
    this._wallSplit('z', x0, z0, z1, [{ a: -11, b: -9 }, win(-34, -30), win(-30, -26, true), win(-10, -6, true)], wall);
    this._wallSplit('z', x1, z0, z1, [{ a: -11, b: -9 }, { a: -22, b: -18, y1: 4 }, win(-34, -30, true), win(-12, -8, true)], wall);
    const glass = new THREE.MeshLambertMaterial({ color: '#7fa6c8', transparent: true, opacity: 0.16, emissive: '#18303f' });
    for (const [a, b] of southWins) for (const y of [1.75, f1 + 1.75]) {
      const g = new THREE.Mesh(new THREE.PlaneGeometry(b - a, 1.3), glass);
      g.position.set((a + b) / 2, y, z1 + 0.02);
      this.root.add(g);
    }
    // The storeys in between: rows of dark office glass, a few lit, and a floor band per level,
    // so the block reads as a tall tower from outside.
    {
      const dark = new THREE.MeshLambertMaterial({ color: '#1a2633', emissive: '#0a1420' });
      const lit = new THREE.MeshBasicMaterial({ color: '#8fb6d6' });
      const warm = new THREE.MeshBasicMaterial({ color: '#d8c49a' });
      const rng = mulberry32(4242);
      for (let y = G + 1.4; y < f1 - 2; y += 3.4) {
        this.deco(new THREE.BoxGeometry(x1 - x0 + 0.7, 0.22, 0.35), 0, y - 0.95, z1 + 0.05, trim);
        this.deco(new THREE.BoxGeometry(x1 - x0 + 0.7, 0.22, 0.35), 0, y - 0.95, z0 - 0.05, trim);
        for (let x = x0 + 2; x < x1 - 1.5; x += 4) for (const [zz, nz] of [[z1 + 0.27, 1], [z0 - 0.27, -1]]) {
          const r = rng();
          const m = new THREE.Mesh(new THREE.PlaneGeometry(3, 1.5), r < 0.1 ? lit : r < 0.16 ? warm : dark);
          m.position.set(x + 1.5, y, zz);
          if (nz < 0) m.rotation.y = Math.PI;
          this.root.add(m);
        }
        for (let z = z0 + 2; z < z1 - 1.5; z += 4) for (const [xx, nx] of [[x0 - 0.27, -1], [x1 + 0.27, 1]]) {
          const r = rng();
          const m = new THREE.Mesh(new THREE.PlaneGeometry(3, 1.5), r < 0.1 ? lit : r < 0.16 ? warm : dark);
          m.position.set(xx, y, z + 1.5);
          m.rotation.y = nx * Math.PI / 2;
          this.root.add(m);
        }
      }
    }
    // ---- Interior walls, per floor ----
    for (const [y0, y1, up] of [[0, G, false], [f1, h, true]]) {
      const gate = (a, b) => ({ a, b, y1: y0 + 2.6 });
      // Corridor: south side has open doorways; north side rack rooms have keycard doors.
      this.wallX(-18, x0, x1, y0, y1, [gate(-24, -21.5), gate(-1.5, 1.5), gate(13.8, 16.2), gate(27.8, 30.2)], inner, 0.3);
      this.wallX(-22, x0, x1, y0, y1, [gate(-22, -19.5), gate(1.8, 4.2), gate(23.5, 26)], inner, 0.3);
      this.wallZ(-8, -18, 0, y0, y1, [], inner, 0.3);
      this.wallZ(8, -18, 0, y0, y1, up ? [] : [gate(-14, -12)], inner, 0.3);
      this.wallZ(22, -18, 0, y0, y1, [], inner, 0.3);
      this.wallZ(-6, -40, -22, y0, y1, [], inner, 0.3);
      this.wallZ(12, -40, -22, y0, y1, [], '#4a3f44', 0.5);
    }
    // ---- The stair tower: switchback flights of 3 m in two lanes, landings at each end, from
    // the lobby floor all the way up to the data floor. Walled in between the floors and lit.
    {
      const T = TOWER, n = 10, run = (T.east - T.west) / n;
      for (let y = 0; y < f1 - 0.1; y += T.flight * 2) {
        // Lane A climbs east, lane B climbs back west.
        for (let i = 0; i < n; i++) {
          const ta = y + (i + 1) * (T.flight / n), tb = y + T.flight + (i + 1) * (T.flight / n);
          this.box(T.west + i * run, ta - 0.3, T.laneA[0], T.west + (i + 1) * run, ta, T.laneA[1], i % 2 ? '#4a4e55' : '#454950');
          this.box(T.east - (i + 1) * run, tb - 0.3, T.laneB[0], T.east - i * run, tb, T.laneB[1], i % 2 ? '#4a4e55' : '#454950');
        }
        // East landing (top of A), west landing (top of B).
        this.box(T.east, y + T.flight - 0.3, T.z0, T.x1, y + T.flight, T.z1, '#3f434a');
        if (y + T.flight * 2 < f1 - 0.1) this.box(T.x0, y + T.flight * 2 - 0.3, T.z0, T.west, y + T.flight * 2, T.z1, '#3f434a');
        // A centre rail between the lanes (waist high, doesn't block sight).
        this.box(T.west, y + 0.3, T.laneA[1], T.east, y + T.flight + 1.0, T.laneB[0], '#2b2e33', { solid: true, sight: false, shot: false });
        // A light on each landing.
        this._towerLight(T.x1 - 0.8, y + T.flight + 2.6, (T.z0 + T.z1) / 2);
      }
      // The top landing on the data floor is the floor slab itself (west end, open to the south).
      this.box(T.x0, f1 - 0.2, T.z0, T.west, f1, T.z1, '#3f434a');
      // Tower walls between the lobby ceiling and the data floor.
      this.box(T.x1 + 0.0, G, T.z0 - 0.2, T.x1 + 0.25, f1, T.z1 + 0.25, inner);
      this.box(T.x0 - 0.4, G, T.z1, T.x1 + 0.25, f1, T.z1 + 0.25, inner);
      // Railings round the hole on the data floor, leaving the west end open as the exit.
      this.box(T.x1, f1, T.z0, T.x1 + 0.08, f1 + 1.0, T.z1, '#5b6068', { sight: false, shot: false });
      this.box(T.west, f1, T.z1, T.x1, f1 + 1.0, T.z1 + 0.08, '#5b6068', { sight: false, shot: false });
    }
    // ---- The elevator: a shaft from the lobby up to the data floor, doors facing south. ----
    {
      const S = SHAFT, sh = '#3a3e45';
      this.box(S.x0 - 0.2, 0, S.z0 - 0.2, S.x0, h, S.z1 + 0.2, sh);
      this.box(S.x1, 0, S.z0 - 0.2, S.x1 + 0.2, h, S.z1 + 0.2, sh);
      this.box(S.x0, G, S.z0 - 0.2, S.x1, f1, S.z0, sh);
      // South face: a doorway at each served floor.
      const [da, db] = S.door;
      for (const [y0, y1] of [[2.6, f1], [f1 + 2.6, h]]) this.box(S.x0, y0, S.z1, S.x1, y1, S.z1 + 0.2, sh);
      for (const y of [0, f1]) { this.box(S.x0, y, S.z1, da, y + 2.6, S.z1 + 0.2, sh); this.box(db, y, S.z1, S.x1, y + 2.6, S.z1 + 0.2, sh); }
      // The car (a moving floor) and a door at each landing that's shut unless the car is there.
      this.lift = { y: 0, car: this.box(S.x0 + 0.05, -0.25, S.z0 + 0.05, S.x1 - 0.05, 0.02, S.z1 - 0.05, '#555a62', { mesh: true }), doors: [] };
      for (const [lv, y] of [[0, 0], [1, f1]]) {
        const d = this.box(da, y, S.z1 + 0.04, db, y + 2.6, S.z1 + 0.16, '#8a8f97', { mesh: true, kind: 'door' });
        this.lift.doors.push({ lv, y, b: d });
        // Floor indicator over the doors.
        const ind = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.04), new THREE.MeshBasicMaterial({ color: '#30ffd0' }));
        ind.position.set((da + db) / 2, y + 2.85, S.z1 + 0.24);
        this.root.add(ind);
        this.lift.doors[this.lift.doors.length - 1].ind = ind;
      }
      // Car roof (the car is a cage you can't climb out of mid-ride).
      this.lift.roof = this.box(S.x0 + 0.05, 2.7, S.z0 + 0.05, S.x1 - 0.05, 2.85, S.z1 - 0.05, '#4a4e55', { mesh: true });
      this.setLift(0);
    }
    // ---- The roof: a parapet round the edge and a service hatch with a ladder down into the
    // data floor's storage room. ----
    {
      const rh = h + 0.5, hx = 24.5, hz = -16.2;
      for (const [a0, b0, a1, b1] of [[x0 - 0.4, z0 - 0.4, x1 + 0.4, z0 - 0.1], [x0 - 0.4, z1 + 0.1, x1 + 0.4, z1 + 0.4], [x0 - 0.4, z0 - 0.4, x0 - 0.1, z1 + 0.4], [x1 + 0.1, z0 - 0.4, x1 + 0.4, z1 + 0.4]]) this.box(a0, rh, b0, a1, rh + 1.0, b1, '#3b3f45', { sight: false, shot: false });
      this.box(hx - 0.8, rh, hz - 0.8, hx + 0.8, rh + 0.25, hz + 0.8, '#4a4f56', { solid: false });
      const lid = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.06, 1.4), lam('#565b62'));
      lid.position.set(hx, rh + 0.6, hz - 1.1);
      lid.rotation.x = -1.1;
      this.root.add(lid);
      const hole = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 1.3).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#050607' }));
      hole.position.set(hx, rh + 0.26, hz);
      this.root.add(hole);
      // The ladder in the storage room below.
      for (const sx of [-0.25, 0.25]) this.deco(new THREE.BoxGeometry(0.05, h - f1, 0.05), hx + sx, (f1 + h) / 2, hz - 0.6, '#6b7078');
      for (let y = f1 + 0.3; y < h; y += 0.35) this.deco(new THREE.BoxGeometry(0.5, 0.03, 0.03), hx, y, hz - 0.6, '#6b7078');
      this.hatch = { x: hx, z: hz, roofY: rh };
      const rl = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2), new THREE.MeshBasicMaterial({ color: '#ff3040' }));
      rl.position.set(x1 - 1, rh + 1.2, z0 + 1);
      this.root.add(rl);
    }
    // ---- The lobby checkpoint: a walk-through metal detector with rope barriers either side
    // (step round the ends of the barriers to skip it). ----
    {
      const C = CHECKPOINT;
      this.box(C.x0 - 0.25, 0, C.z - 0.25, C.x0, 2.3, C.z + 0.25, '#7d838c');
      this.box(C.x1, 0, C.z - 0.25, C.x1 + 0.25, 2.3, C.z + 0.25, '#7d838c');
      this.box(C.x0 - 0.25, 2.3, C.z - 0.25, C.x1 + 0.25, 2.5, C.z + 0.25, '#7d838c', { solid: false });
      for (const [a, b] of [[-5, C.x0 - 0.25], [C.x1 + 0.25, 5]]) this.box(a, 0, C.z - 0.05, b, 0.95, C.z + 0.05, '#9a2a2a', { sight: false, shot: false });
      const led = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.06, 0.06), new THREE.MeshBasicMaterial({ color: '#30ff70' }));
      led.position.set(0, 2.42, C.z + 0.27);
      this.root.add(led);
      this.checkpoint = { ...C, led };
      // A desk for the officer who works it.
      this.box(2.6, 0, -6, 4.4, 1.05, -5.2, '#2f3a46');
    }
    // ---- Doors ----
    this.door('front', 'elec', 1, -2, -0.15, 2, 0.15);
    this.door('maint', 'mech', 0, x0 - 0.15, -11, x0 + 0.15, -9);
    this.door('side', 'mech', 0, x1 - 0.15, -11, x1 + 0.15, -9);
    this.door('dock', 'dock', 1, x1 - 0.2, -22, x1 + 0.2, -18, '#59544a', 4);
    // Keycard doors on the data floor's three rack rooms.
    const rk = [['dhb', -22, -19.5, f1], ['srv', 1.8, 4.2, f1], ['arch', 23.5, 26, f1]];
    for (const [room, a, b, y] of rk) {
      const d = this.door('badge-' + room, 'badge', 2, a, -22.25, b, -21.75, '#6a5a3a', 2.6, y);
      d.room = room;
      // Card reader with the room's coloured tag, on the corridor side.
      const tag = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.04), new THREE.MeshBasicMaterial({ color: CARDS[room].color }));
      tag.position.set(b + 0.45, y + 1.45, -21.7);
      this.root.add(tag);
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(b - a, 0.12, 0.04), new THREE.MeshBasicMaterial({ color: CARDS[room].color }));
      stripe.position.set((a + b) / 2, y + 2.72, -21.7);
      this.root.add(stripe);
    }
    // ---- Furnishing ----
    // Lobby, security, electrical (relay), staging — ground floor.
    this.box(-4, 0, -9, 4, 1.1, -7.8, '#2f3a46');
    this.box(9, 0, -17.6, 21, 2.6, -17.2, '#22262c');
    for (let i = 0; i < 6; i++) this.deco(new THREE.BoxGeometry(1.6, 0.9, 0.05), 10.2 + i * 1.9, 1.7, -17.12, '#3a6ea0', 0, { emissive: '#3a6ea0', emissiveIntensity: 0.8 });
    this.box(11, 0, -14, 19, 0.85, -12.8, '#3b3f46');
    for (let i = 0; i < 4; i++) this.box(24 + i * 3, 0, -16.8, 26 + i * 3, 2.4, -15.6, '#4d555a');
    this.box(34.6, 0, -8.5, 35.7, 2.2, -3.5, '#4d555a');
    this.relayMesh = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.4, 0.6), new THREE.MeshBasicMaterial({ color: '#ffb020' }));
    this.relayMesh.position.set(34.5, 1.2, -6);
    this.root.add(this.relayMesh);
    for (const [x, z, w, d, hh] of [[-26, -5, 2.4, 2.4, 1.2], [-17, -12, 4, 2, 2.2], [-12, -3, 2, 2, 1.0]]) this.box(x - w / 2, 0, z - d / 2, x + w / 2, hh, z + d / 2, '#4b4436');
    // Upstairs: offices (desks), break room, comms, storage.
    for (const [x, z] of [[-30, -6], [-24, -6], [-18, -6], [-30, -11], [-18, -11]]) this.box(x - 1.2, f1, z - 0.6, x + 1.2, f1 + 0.78, z + 0.6, '#3b3f46');
    this.box(-5, f1, -12, 5, f1 + 0.76, -10, '#3a3530');
    this.box(10, f1, -6, 20, f1 + 0.8, -4.8, '#3b3f46');
    for (const [x, z] of [[26, -12], [31, -8], [27, -5]]) this.box(x - 1.2, f1, z - 1, x + 1.2, f1 + 1.6, z + 1, '#4b4436');
    // ---- Rack rooms: rows of server racks on both floors ----
    this.racks = [];
    const rackRow = (room, floor, xa, xb, zz) => {
      const y = floor ? f1 : 0;
      this.box(xa, y, zz - 0.5, xb, y + 2.3, zz + 0.5, '#1b1e24');
      for (let x = xa + 0.3; x < xb - 0.2; x += 0.62) this.deco(new THREE.BoxGeometry(0.02, 2.1, 1.02), x + 0.29, y + 1.15, zz, '#2a2e36');
      // Each row is a run of individual cabinets (for the hidden target).
      for (let x = xa + 0.31; x < xb; x += 0.62) this.racks.push({ room, floor, x, z: zz + 0.52, zb: zz - 0.52, y0: y + 0.3, y1: y + 2.1, x0: x - 0.3, x1: x + 0.3 });
    };
    // Ground floor north: mailroom shelving, guard-room lockers, chillers in the plant room.
    for (let r = 0; r < 3; r++) this.box(-32 + r * 8, 0, -38.6, -27 + r * 8, 2.0, -37.6, '#3d3a33');
    this.box(-20, 0, -31, -14, 0.9, -29, '#4b4436');
    for (let i = 0; i < 7; i++) this.box(-4 + i * 1.1, 0, -39.4, -3.1 + i * 1.1, 2.0, -38.7, '#3b4450');
    this.box(2, 0, -32, 8, 0.78, -30, '#3b3f46');
    for (const [x, z] of [[17, -34], [24, -34], [31, -34], [17, -27.5], [31, -27.5]]) this.box(x - 2, 0, z - 1.4, x + 2, 2.2, z + 1.4, '#4a5058');
    for (const floor of [1]) {
      const A = 'dhb', N = 'srv', V = 'arch';
      for (let r = 0; r < 4; r++) { rackRow(A, floor, -34, -24, -37.5 + r * 4); rackRow(A, floor, -21, -9, -37.5 + r * 4); }
      for (let r = 0; r < 3; r++) rackRow(N, floor, -4, 10, -37 + r * 4.5);
      for (let r = 0; r < 3; r++) { rackRow(V, floor, 14, 22, -37.5 + r * 4.2); rackRow(V, floor, 26, 34, -37.5 + r * 4.2); }
    }
    this._rackLeds();
    // The archive server: one cabinet somewhere in the data floor's three rack rooms, marked by a slow amber beacon.
    const pick = this.racks[Math.floor(this.rng() * this.racks.length)];
    this.target = { x: pick.x, y: pick.y0 + 0.9, z: pick.z + 0.05, room: pick.room, floor: pick.floor, rack: pick };
    this.beacon = new THREE.Group();
    const bm = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.06, 0.03), new THREE.MeshBasicMaterial({ color: '#ffb020' }));
    bm.position.y = 1.2;
    const port = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.03), new THREE.MeshBasicMaterial({ color: '#30ffd0' }));
    port.position.y = 0.6;
    this.beacon.add(bm, port);
    this.beacon.position.set(pick.x, pick.y0, pick.z + 0.03);
    this.root.add(this.beacon);
    this.beaconMat = bm.material;
    this.driveMesh = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.1, 0.4), new THREE.MeshBasicMaterial({ color: '#ff9a20' }));
    this.driveMesh.position.set(pick.x, pick.y0 + 0.3, pick.z + 0.1);
    this.root.add(this.driveMesh);
    // ---- IoT devices (hackable distractions) ----
    this.devices = [];
    const dev = (kind, x, z, floor, w, hh, d, color, glowC) => {
      const y = floor ? f1 : 0;
      this.box(x - w / 2, y, z - d / 2, x + w / 2, y + hh, z + d / 2, color);
      const face = new THREE.Mesh(new THREE.BoxGeometry(w * 0.7, hh * 0.35, 0.02), new THREE.MeshBasicMaterial({ color: glowC }));
      face.position.set(x, y + hh * 0.65, z + d / 2 + 0.012);
      this.root.add(face);
      this.devices.push({ id: this.devices.length + 1, kind, x, y: y + hh / 2, z, floor, face, base: new THREE.Color(glowC), t: 0 });
    };
    dev('vending', -6.6, -2.2, 1, 1.0, 1.9, 0.8, '#3a2a3a', '#ff5fd0');
    dev('vending', -5.4, -2.2, 1, 1.0, 1.9, 0.8, '#2a2f3a', '#40c8ff');
    dev('coffee', 4, -16.6, 1, 0.6, 1.1, 0.5, '#2e2a26', '#ffb060');
    dev('printer', 13, -2, 1, 1.0, 1.0, 0.7, '#4a4d52', '#80ffb0');
    dev('speaker', -20, -0.8, 1, 0.6, 0.6, 0.3, '#2a2c30', '#ff8040');
    dev('printer', -30, -1, 0, 1.0, 1.0, 0.7, '#4a4d52', '#80ffb0');
    dev('vending', -6.6, -1.6, 0, 1.0, 1.9, 0.8, '#3a2a3a', '#ffd040');
    dev('tv', 15, -0.6, 0, 1.6, 1.2, 0.15, '#1a1c20', '#5080ff');
    dev('speaker', 0, -21.4, 0, 0.6, 0.6, 0.3, '#2a2c30', '#ff8040');
    dev('fan', -15, -39.2, 0, 1.4, 1.4, 0.6, '#3a3f44', '#60ff90');
    dev('fan', 3, -39.2, 1, 1.4, 1.4, 0.6, '#3a3f44', '#60ff90');
    // ---- Room stations (things you use in person) ----
    //   drawer  office desk drawers: some hold a rack-room keycard (one per rack room)
    //   shelf   storage shelving: ammo and kit, one haul each
    //   fridge  break-room fridge: food, +HP, a few servings
    //   comms   comms-room radio rack: hack it in person and SENTINEL's guards can't radio
    //   cctv    security-office CCTV desk: hack it and the cameras stop reporting you
    this.stations = [];
    const st = (kind, x, z, floor, extra = {}) => { const o = { id: kind + this.stations.length, kind, x, z, y: floor ? f1 : 0, floor, ...extra }; this.stations.push(o); return o; };
    const drawerMat = lam('#555a62');
    for (const [x, z, floor] of [[-30, -6, 1], [-24, -6, 1], [-18, -6, 1], [-30, -11, 1], [-18, -11, 1], [11.8, -13.4, 0], [18.2, -13.4, 0], [-2.5, -8.4, 0], [2.5, -8.4, 0], [11.5, -5.4, 1], [18.5, -5.4, 1]]) {
      const y = floor ? f1 : 0;
      // Drawer front on the desk's south (+z) face; slides out when searched.
      const dz = z === -13.4 ? -12.8 : z === -8.4 ? -7.8 : z === -5.4 ? -4.8 : z + 0.6;
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.22, 0.5), drawerMat);
      m.position.set(x, y + 0.55, dz - 0.2);
      this.root.add(m);
      st('drawer', x, dz + 0.6, floor, { mesh: m, home: m.position.clone(), card: null });
    }
    // Keycards: one per rack room on the data floor, hidden in random drawers (the rest hold junk).
    const drawers = this.stations.filter((q) => q.kind === 'drawer');
    const pool = drawers.slice();
    for (const room of ['dhb', 'srv', 'arch']) { const i = Math.floor(this.rng() * pool.length); pool.splice(i, 1)[0].card = room; }
    // Storage shelving: ammo cans and kit on each shelf (upstairs storage).
    for (const [x, z] of [[26, -12], [31, -8], [27, -5]]) {
      const g = new THREE.Group();
      for (let k = 0; k < 4; k++) { const c = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.26, 0.3), lam(k % 2 ? '#4a5a34' : '#3f4d2c')); c.position.set(-0.8 + k * 0.52, 0, 0); g.add(c); }
      g.position.set(x, f1 + 1.73, z + 0.6);
      this.root.add(g);
      st('shelf', x, z + 1.7, 1, { mesh: g, uses: 1 });
    }
    // The break-room fridge.
    this.box(6.2, f1, -17.6, 7.6, f1 + 2.0, -16.6, '#c9ccd0');
    this.deco(new THREE.BoxGeometry(0.04, 0.6, 0.04), 7.3, f1 + 1.3, -16.56, '#8a8e94');
    const fl = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.05, 0.02), new THREE.MeshBasicMaterial({ color: '#40c8ff' }));
    fl.position.set(6.6, f1 + 1.75, -16.58);
    this.root.add(fl);
    st('fridge', 6.9, -15.8, 1, { uses: 3, mesh: fl });
    // Comms room: a radio rack with a repeater, against the east wall.
    this.box(20.6, f1, -13, 21.8, f1 + 2.3, -9, '#20242a');
    const commsLeds = [];
    for (let i = 0; i < 5; i++) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.12, 0.5), new THREE.MeshBasicMaterial({ color: '#ff9a20' })); m.position.set(20.58, f1 + 0.6 + i * 0.35, -11); this.root.add(m); commsLeds.push(m); }
    st('comms', 19.6, -11, 1, { leds: commsLeds });
    // Security office: the CCTV desk in front of the monitor wall.
    // Live-looking feed tiles over the monitor wall (they flicker; teal once you own them).
    this.cctvScreens = [];
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.82), new THREE.MeshBasicMaterial({ color: '#3a6ea0' }));
      m.position.set(10.2 + i * 1.9, 1.7, -17.08);
      this.root.add(m);
      this.cctvScreens.push(m);
    }
    st('cctv', 15, -12.2, 0);
    // ---- Ceiling panel lights: one light source per panel, per room ----
    const rooms = ROOMS.filter((r) => r.y0 !== undefined && !r.solid);
    for (const r of rooms) {
      const y = (r.floor ? h : G) - 0.12;
      const nx = Math.max(1, Math.round((r.x1 - r.x0) / 10)), nz = Math.max(1, Math.round((r.z1 - r.z0) / 9));
      for (let i = 0; i < nx; i++) for (let k = 0; k < nz; k++) {
        const x = r.x0 + ((i + 0.5) * (r.x1 - r.x0)) / nx, z = r.z0 + ((k + 0.5) * (r.z1 - r.z0)) / nz;
        const color = r.tier >= 2 ? '#b8d8ff' : '#e8f0ff';
        const m = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.08, 0.6), new THREE.MeshBasicMaterial({ color }));
        m.position.set(x, y, z);
        this.root.add(m);
        this.lightSources.push({ id: this.lightSources.length, x, y, z, r: 9, zone: r.tier >= 2 ? 'core' : 'floor', room: r.id, floor: r.floor, interior: true, kind: 'panel', fx: [m], color, broken: false, offT: 0, on: true });
      }
    }
    this._light(0, 3.2, 1.2, 14, 'yard', '#ffd9a0', true);
    this._light(37.2, 4.6, -20, 14, 'yard', '#ffd9a0', true);
    this._light(-37.2, 3.2, -10, 10, 'yard', '#ffd9a0', true);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(10, 1.2), new THREE.MeshBasicMaterial({ map: textTexture('KESTREL RIDGE · DC-3', '#9fd8ff'), transparent: true }));
    sign.position.set(0, h - 1.2, z1 + 0.32);
    this.root.add(sign);
  }

  // A horizontal slab with rectangular holes (split into strips).
  _slab(x0, x1, z0, z1, y0, y1, holes, color) {
    const xs = [...new Set([x0, x1, ...holes.flatMap((H) => [H.x0, H.x1])])].sort((a, b) => a - b);
    for (let i = 0; i < xs.length - 1; i++) {
      const a = xs[i], b = xs[i + 1], mid = (a + b) / 2;
      const cuts = holes.filter((H) => mid > H.x0 && mid < H.x1).sort((p, q) => p.z0 - q.z0);
      let z = z0;
      for (const H of cuts) { if (H.z0 > z) this.box(a, y0, z, b, y1, H.z0, color); z = H.z1; }
      if (z < z1) this.box(a, y0, z, b, y1, z1, color);
    }
  }

  // An exterior wall with gaps running the full building height.
  _wallSplit(axis, c, a0, a1, gaps, color) {
    const H = BUILDING.h;
    // Solid wall with per-gap lintels/sills: build as vertical bands between gap edges.
    const edges = [...new Set([a0, a1, ...gaps.flatMap((g) => [g.a, g.b])])].sort((p, q) => p - q);
    for (let i = 0; i < edges.length - 1; i++) {
      const s0 = edges[i], s1 = edges[i + 1], mid = (s0 + s1) / 2;
      const holes = gaps.filter((g) => mid > g.a && mid < g.b).map((g) => [g.y0 || 0, g.y1 ?? 2.6]).sort((p, q) => p[0] - q[0]);
      let y = 0;
      const mk = (h0, h1) => { if (h1 - h0 < 0.01) return; if (axis === 'x') this.box(s0, h0, c - 0.25, s1, h1, c + 0.25, color); else this.box(c - 0.25, h0, s0, c + 0.25, h1, s1, color); };
      for (const [h0, h1] of holes) { mk(y, h0); y = h1; }
      mk(y, H);
    }
  }

  _rackLeds() {
    const n = this.racks.length * 5;
    const geo = new THREE.PlaneGeometry(0.06, 0.03);
    const mat = new THREE.MeshBasicMaterial({ color: '#ffffff' });
    const im = new THREE.InstancedMesh(geo, mat, n);
    const m = new THREE.Matrix4(), c = new THREE.Color();
    let i = 0;
    const rng = mulberry32(5);
    for (const r of this.racks) for (let k = 0; k < 5 && i < n; k++) {
      m.makeTranslation(r.x + (rng() - 0.5) * 0.3, r.y0 + (r.y1 - r.y0) * (k / 5 + rng() * 0.1), r.z + 0.01);
      im.setMatrixAt(i, m);
      im.setColorAt(i, c.set(rng() < 0.7 ? '#36ff9a' : rng() < 0.5 ? '#3aa0ff' : '#ffb030'));
      i++;
    }
    im.count = i;
    this.leds = im;
    this.root.add(im);
  }

  _yard() {
    const H = BUILDING.h;
    if (this.layout === 'random') this._randomYard(); else this._standardYard();
    // Barracks: reinforcements muster here. Hack the door panel to lock them in for a while,
    // or C4 it for good.
    this.box(46, 0, 14, 70, 4.2, 30, '#565b52');
    this.box(45.7, 4.2, 13.7, 70.3, 4.6, 30.3, '#3a3d38');
    this.deco(new THREE.BoxGeometry(0.1, 2.4, 1.6), 45.9, 1.2, 22, '#2d3036');
    this._light(45.5, 3.4, 22, 12, 'yard', '#ffc98a', true);
    const bpanel = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.3, 0.22), new THREE.MeshBasicMaterial({ color: '#ff3040' }));
    bpanel.position.set(45.86, 1.4, 23.3);
    this.root.add(bpanel);
    this.stations.push({ id: 'barracks', kind: 'barracks', x: 44.6, z: 23.3, y: 0, floor: 0, panel: bpanel });
    // Drone bay: a hangar in the west yard that launches replacement patrol drones from the
    // pad in front of it. Hack its control panel to ground them for good, or C4 it.
    this.box(-57, 0, 27, -47, 4, 33, '#4b5058');
    this.box(-57.3, 4, 26.7, -46.7, 4.35, 33.3, '#34383f');
    this.deco(new THREE.BoxGeometry(6, 3, 0.06), -52, 1.6, 26.97, '#2a2d33');
    for (let i = 0; i < 6; i++) this.deco(new THREE.BoxGeometry(5.8, 0.05, 0.03), -52, 0.4 + i * 0.5, 26.93, '#3a3e45');
    this.deco(new THREE.RingGeometry(2.0, 2.4, 28).rotateX(-Math.PI / 2), -52, terrainHeight(-52, 22.5) + 0.06, 22.5, '#d0b040');
    this._light(-52, 4.4, 26.4, 12, 'yard', '#ffc98a', true);
    const dpanel = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.4, 0.06), new THREE.MeshBasicMaterial({ color: '#30ffd0' }));
    dpanel.position.set(-48.2, 1.4, 26.96);
    this.root.add(dpanel);
    this.stations.push({ id: 'bay', kind: 'bay', x: -48.2, z: 25.8, y: 0, floor: 0, panel: dpanel });
    // Landing zone marker (lit once the drive is out).
    const lz = SPOTS.lz;
    const ring = new THREE.Mesh(new THREE.RingGeometry(lz.r - 0.5, lz.r, 40).rotateX(-Math.PI / 2), glowMat('#30ffb0', 0.0));
    ring.position.set(lz.x, terrainHeight(lz.x, lz.z) + 0.15, lz.z);
    this.root.add(ring);
    this.lzRing = ring;
    void H;
  }

  // The built map's yard: HVAC, generators, containers, trucks, sandbag nests.
  _standardYard() {
    // HVAC units on the north side and the generator yard to the west: cover.
    for (let x = -30; x <= 26; x += 9) {
      this.box(x, 0, -46.5, x + 5, 2.4, -42.5, '#5c6168');
      this.deco(new THREE.CylinderGeometry(1.2, 1.2, 0.2, 16), x + 2.5, 2.5, -44.5, '#2a2d33');
    }
    this.box(-62, 0, -32, -50, 2.8, -26, '#4f5a4b');
    this.box(-62, 0, -22, -54, 2.2, -16, '#4f5a4b');
    for (const z of [-8, -1]) {
      const g = new THREE.CylinderGeometry(1.6, 1.6, 7, 14).rotateX(Math.PI / 2);
      this.deco(g, -57, 1.7, z, '#6b6e70');
      this.box(-58.7, 0, z - 3.5, -55.3, 3.3, z + 3.5, null);
    }
    // Shipping containers and trucks in the south yard.
    const cont = (this._cont = (x, z, w, d, col) => {
      this.box(x - w / 2, 0, z - d / 2, x + w / 2, 2.6, z + d / 2, col);
      for (let i = 0; i < Math.max(w, d) / 0.6; i++) {
        const u = -Math.max(w, d) / 2 + i * 0.6 + 0.3;
        if (w > d) this.deco(new THREE.BoxGeometry(0.08, 2.4, d + 0.04), x + u, 1.3, z, shade(col, 0.82));
        else this.deco(new THREE.BoxGeometry(w + 0.04, 2.4, 0.08), x, 1.3, z + u, shade(col, 0.82));
      }
    });
    cont(-42, 26, 12, 2.5, '#6a3a2c');
    cont(-26, 40, 2.5, 12, '#2c4a6a');
    cont(28, 34, 12, 2.5, '#3f5a3a');
    cont(-60, 46, 12, 2.5, '#6a5a2c');
    cont(36, 46, 2.5, 6, '#5a2c36');
    cont(-12, 48, 6, 2.5, '#4a4a4a');
    const truck = (this._truck = (x, z) => {
      this.box(x - 1.3, 0.5, z - 4, x + 1.3, 3.1, z + 1.4, '#3a3d33');
      this.box(x - 1.25, 0.4, z + 1.4, x + 1.25, 2.6, z + 3.8, '#2f3329');
      for (const [wx, wz] of [[-1.3, -3], [1.3, -3], [-1.3, 2.8], [1.3, 2.8]]) this.deco(new THREE.CylinderGeometry(0.5, 0.5, 0.35, 10).rotateZ(Math.PI / 2), x + wx, 0.5, z + wz, '#151617');
    });
    truck(14, 18);
    truck(-14, 16);
    // Sandbag nests near the gate and the dock.
    for (const [x, z, ry] of [[-14, 54, 0], [64, -22, Math.PI / 2], [-66, 12, Math.PI / 2]]) {
      const w = 4, d = 0.9;
      if (ry) this.box(x - d / 2, 0, z - w / 2, x + d / 2, 1.1, z + w / 2, '#5a5442');
      else this.box(x - w / 2, 0, z - d / 2, x + w / 2, 1.1, z + d / 2, '#5a5442');
    }
  }

  // Places inside the wire where something can stand without blocking a road, a door, a guard
  // route, the barracks / drone bay, a tower or the fence cut. r: clearance from route points.
  _yardFree(x0, z0, x1, z1, r = 3.5) {
    const X = FENCE.x - 4, Z = FENCE.z - 4;
    if (x0 < -X || x1 > X || z0 < -Z || z1 > Z) return false;
    const rects = [[-42, -46, 42, 6], [40, 8, 76, 36], [-62, 17, -42, 37], [-10, 38, 10, 62], [6, 50, 15, 60], [34, -30, 82, -14], [-82, this.cutZ - 6, -60, this.cutZ + 6]];
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const tx = sx * (FENCE.x - 7), tz = sz * (FENCE.z - 7); rects.push([tx - 5, tz - 5, tx + 5, tz + 5]); }
    for (const [a, b, c, d] of rects) if (x1 > a && x0 < c && z1 > b && z0 < d) return false;
    const pts = [[-66, 48], [-40, 50], [-20, 52], [0, 54], [22, 50], [50, 44], [68, 40], [72, 6], [74, -23], [66, -52], [40, -52], [10, -54], [-20, -52], [-44, -52], [-68, -50], [-70, -24], [-72, this.cutZ], [-68, 32], [-44, 10], [-44, -10], [-44, -36], [44, -10], [42, -20], [44, -36], [0, 6], [-20, 8], [20, 8], [0, 28], [30, 20], [-30, 18], [40, 4], [42, 22], [-52, 22], [-60, 46], [60, 44], [-74, 0], [74, 0], [-72, -50], [72, -50], [72, 50], [-72, 50], [0, 52], [0, -52]];
    for (const [px, pz] of pts) { const cx = Math.max(x0, Math.min(px, x1)), cz = Math.max(z0, Math.min(pz, z1)); if (Math.hypot(px - cx, pz - cz) < r) return false; }
    for (const q of this._placed || []) if (x1 + 1.5 > q[0] && x0 - 1.5 < q[2] && z1 + 1.5 > q[1] && z0 - 1.5 < q[3]) return false;
    return true;
  }
  _randomSpots(n, half) {
    const out = [];
    for (let k = 0; k < 400 && out.length < n; k++) {
      const x = (this.lrng() * 2 - 1) * (FENCE.x - 5), z = (this.lrng() * 2 - 1) * (FENCE.z - 5);
      if (!this._yardFree(x - half, z - half, x + half, z + half, 2.5)) continue;
      (this._placed = this._placed || []).push([x - half, z - half, x + half, z + half]);
      out.push([x, z]);
    }
    return out;
  }
  // A random yard: the same kinds of cover as the built map, scattered from the seed.
  _randomYard() {
    this._placed = this._placed || [];
    const R = this.lrng, cols = ['#6a3a2c', '#2c4a6a', '#3f5a3a', '#6a5a2c', '#5a2c36', '#4a4a4a'];
    // Make the helpers from the standard yard without placing its pieces.
    const cont = (x, z, w, d, col) => {
      this.box(x - w / 2, 0, z - d / 2, x + w / 2, 2.6, z + d / 2, col);
      for (let i = 0; i < Math.max(w, d) / 0.6; i++) {
        const u = -Math.max(w, d) / 2 + i * 0.6 + 0.3;
        if (w > d) this.deco(new THREE.BoxGeometry(0.08, 2.4, d + 0.04), x + u, 1.3, z, shade(col, 0.82));
        else this.deco(new THREE.BoxGeometry(w + 0.04, 2.4, 0.08), x, 1.3, z + u, shade(col, 0.82));
      }
    };
    const kinds = [
      ['cont', 7], ['truck', 2], ['hvac', 4], ['gen', 2], ['bags', 4], ['crates', 5],
    ];
    for (const [kind, n] of kinds) for (let c = 0; c < n; c++) {
      for (let k = 0; k < 120; k++) {
        const x = (R() * 2 - 1) * (FENCE.x - 6), z = (R() * 2 - 1) * (FENCE.z - 6), turn = R() < 0.5;
        let w, d;
        if (kind === 'cont') { const L = R() < 0.6 ? 12 : 6; [w, d] = turn ? [L, 2.5] : [2.5, L]; }
        else if (kind === 'truck') { w = 2.6; d = 7.8; }
        else if (kind === 'hvac') { w = 5; d = 4; }
        else if (kind === 'gen') { [w, d] = turn ? [7, 3.4] : [3.4, 7]; }
        else if (kind === 'bags') { [w, d] = turn ? [4, 0.9] : [0.9, 4]; }
        else { w = 1.6 + R() * 1.4; d = 1.6 + R(); }
        if (!this._yardFree(x - w / 2, z - d / 2, x + w / 2, z + d / 2)) continue;
        this._placed.push([x - w / 2, z - d / 2, x + w / 2, z + d / 2]);
        if (kind === 'cont') cont(x, z, w, d, cols[Math.floor(R() * cols.length)]);
        else if (kind === 'truck') {
          this.box(x - 1.3, 0.5, z - 4, x + 1.3, 3.1, z + 1.4, '#3a3d33');
          this.box(x - 1.25, 0.4, z + 1.4, x + 1.25, 2.6, z + 3.8, '#2f3329');
          for (const [wx, wz] of [[-1.3, -3], [1.3, -3], [-1.3, 2.8], [1.3, 2.8]]) this.deco(new THREE.CylinderGeometry(0.5, 0.5, 0.35, 10).rotateZ(Math.PI / 2), x + wx, 0.5, z + wz, '#151617');
        } else if (kind === 'hvac') {
          this.box(x - w / 2, 0, z - d / 2, x + w / 2, 2.4, z + d / 2, '#5c6168');
          this.deco(new THREE.CylinderGeometry(1.2, 1.2, 0.2, 16), x, 2.5, z, '#2a2d33');
        } else if (kind === 'gen') {
          const g = new THREE.CylinderGeometry(1.6, 1.6, 7, 14).rotateX(Math.PI / 2);
          if (turn) g.rotateY(Math.PI / 2);
          this.deco(g, x, 1.7, z, '#6b6e70');
          this.box(x - w / 2, 0, z - d / 2, x + w / 2, 3.3, z + d / 2, null);
        } else if (kind === 'bags') this.box(x - w / 2, 0, z - d / 2, x + w / 2, 1.1, z + d / 2, '#5a5442');
        else { const hh = 1.2 + R() * 1.4; this.box(x - w / 2, 0, z - d / 2, x + w / 2, hh, z + d / 2, '#4b4436'); }
        break;
      }
    }
  }

  _vegetation() {
    const rng = mulberry32(77);
    const n = this.quality === 'low' ? 140 : 320;
    const trunk = new THREE.CylinderGeometry(0.18, 0.26, 2, 5).translate(0, 1, 0);
    const crown = new THREE.ConeGeometry(1.7, 6.5, 7).translate(0, 4.8, 0);
    const it = new THREE.InstancedMesh(trunk, lam('#2a2119'), n);
    const ic = new THREE.InstancedMesh(crown, lam('#14241b'), n);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    let i = 0, guard = 0;
    while (i < n && guard++ < 6000) {
      const x = BOUNDS.x0 + rng() * (BOUNDS.x1 - BOUNDS.x0), z = BOUNDS.z0 + rng() * (205 - BOUNDS.z0);
      if (Math.abs(x) < FENCE.x + 8 && Math.abs(z) < FENCE.z + 8) continue;
      if (z > DRAW.z0 - 6) continue; // the draw has its own forest
      if (Math.abs(x) < 9 && z > 60 && z < 100) continue; // road
      if (Math.hypot(x - SPOTS.lz.x, z - SPOTS.lz.z) < 16 || (x > 80 && Math.abs(z + 18) < 6)) continue;
      if (Math.abs(x - 2) < 14 && z > 104 && z < 136) continue; // the perch and insertion stay clear
      if (z > 95 && z < 109 && x > -84) continue; // cliff face
      const h = terrainHeight(x, z);
      const sc = 0.7 + rng() * 0.8;
      m.compose(p.set(x, h - 0.2, z), q.setFromAxisAngle(s.set(0, 1, 0), rng() * 6), s.set(sc, sc * (0.85 + rng() * 0.4), sc));
      it.setMatrixAt(i, m);
      ic.setMatrixAt(i, m);
      i++;
    }
    it.count = ic.count = i;
    this.root.add(it, ic);
    this._drawForest(trunk, crown);
  }

  // The draw: a dark tree line down both sides, a few stands on the floor to move between, and
  // the drop-off lane kept clear for the van. Crowns block sight (see ray), so the trees are cover.
  _drawForest(trunk, crown) {
    const rng = mulberry32(911);
    const n = this.quality === 'low' ? 170 : 340;
    const it = new THREE.InstancedMesh(trunk, lam('#251d16'), n);
    const ic = new THREE.InstancedMesh(crown, lam('#112019'), n);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    this.foliage = [];
    let i = 0, guard = 0;
    while (i < n && guard++ < 8000) {
      const z = DRAW.z0 - 4 + rng() * (325 - DRAW.z0), xc = drawX(z);
      // Mostly the tree line (8–34 m off the floor's centre), some scattered on the floor.
      const side = rng() < 0.5 ? -1 : 1;
      const off = rng() < 0.82 ? 8 + Math.pow(rng(), 0.7) * 28 : rng() * 8;
      const x = xc + side * off;
      if (z > 266 && Math.abs(x - 6) < 7) continue; // the van's lane and the drop-off
      if (z < 156 && Math.abs(x - 2) < 16) continue; // the crest path stays open
      if (this.foliage.some((f) => Math.hypot(f.x - x, f.z - z) < 2.6)) continue;
      const h = terrainHeight(x, z);
      const sc = 0.8 + rng() * 0.9;
      m.compose(p.set(x, h - 0.2, z), q.setFromAxisAngle(s.set(0, 1, 0), rng() * 6), s.set(sc, sc * (0.85 + rng() * 0.4), sc));
      it.setMatrixAt(i, m);
      ic.setMatrixAt(i, m);
      this.foliage.push({ x, z, y0: h + 1.6 * sc, y1: h + 7.6 * sc, r: 1.25 * sc });
      i++;
    }
    it.count = ic.count = i;
    this.root.add(it, ic);
    // A grid so sight rays only test the trees near them.
    this.folGrid = new Map();
    for (const f of this.foliage) { const k = Math.floor(f.x / 10) + ':' + Math.floor(f.z / 10); if (!this.folGrid.has(k)) this.folGrid.set(k, []); this.folGrid.get(k).push(f); }
    this._outpost();
  }

  // A picket's observation post in the draw: sandbags, a camo net on poles, an ammo crate.
  _outpost() {
    const z = 230, x = drawX(z) + 6, y = terrainHeight(x, z);
    this.outpost = { x, z, y };
    const bag = '#3b382c', net = '#1d2a1c';
    this.box(x - 2.2, y - 0.3, z + 1.1, x + 2.2, y + 0.85, z + 1.7, bag, { sight: false });
    this.box(x - 2.2, y - 0.3, z - 1.4, x - 1.6, y + 0.85, z + 1.1, bag, { sight: false });
    for (const [px, pz] of [[-2, -1.2], [2, -1.2], [-2, 1.5], [2, 1.5]]) this.box(x + px - 0.06, y - 0.2, z + pz - 0.06, x + px + 0.06, y + 2.1, z + pz + 0.06, '#2b241b', { sight: false, shot: false });
    this.box(x - 2.4, y + 2.1, z - 1.5, x + 2.4, y + 2.22, z + 1.8, net, { solid: false, shot: false });
    this.box(x + 0.6, y - 0.1, z - 0.9, x + 1.4, y + 0.45, z - 0.4, '#3a3f2a', {});
  }

  // Tree crowns between a and b? (Sight only; only trees in the draw are counted.)
  _foliageHit(a, b) {
    if (!this.folGrid || (a.z < DRAW.z0 - 8 && b.z < DRAW.z0 - 8)) return false;
    const dx = b.x - a.x, dz = b.z - a.z, L2 = dx * dx + dz * dz || 1;
    const steps = Math.max(1, Math.ceil(Math.sqrt(L2) / 10));
    const seen = new Set();
    for (let s = 0; s <= steps; s++) {
      const cx = a.x + dx * s / steps, cz = a.z + dz * s / steps;
      for (let ox = -1; ox <= 1; ox++) for (let oz = -1; oz <= 1; oz++) {
        const L = this.folGrid.get((Math.floor(cx / 10) + ox) + ':' + (Math.floor(cz / 10) + oz));
        if (!L) continue;
        for (const f of L) {
          if (seen.has(f)) continue;
          seen.add(f);
          const t = Math.max(0, Math.min(1, ((f.x - a.x) * dx + (f.z - a.z) * dz) / L2));
          const px = a.x + dx * t - f.x, pz = a.z + dz * t - f.z;
          if (px * px + pz * pz > f.r * f.r) continue;
          // Ignore a tree right at either end (you can see someone leaning on one).
          if (t * Math.sqrt(L2) < 1.5 || (1 - t) * Math.sqrt(L2) < 1.5) continue;
          const y = a.y + (b.y - a.y) * t;
          if (y > f.y0 && y < f.y1) return true;
        }
      }
    }
    return false;
  }

  // ---- navigation graph for guards (two storeys: nodes carry a floor height) ----------
  _nav() {
    const F = BUILDING.f1, I = 0.02;
    const out = [
      [-66, 48], [-40, 50], [-20, 52], [0, 54], [22, 50], [50, 44], [68, 40], [72, 6], [74, -23], [66, -52], [40, -52], [10, -54], [-20, -52], [-44, -52], [-68, -50], [-70, -24], [-72, this.cutZ], [-68, 32],
      [-44, 10], [-44, -10], [-44, -36], [44, -10], [42, -20], [44, -36], [0, 6], [-20, 8], [20, 8], [0, 28], [30, 20], [-30, 18], [40, 4], [42, 22],
      [-52, 22], [-90, this.cutZ], [0, 68], [86, -23], [0, 88], [-90, 50], [90, 30], [100, -60], [-100, -40], [110, -16],
    ].map(([x, z]) => [x, z, null]);
    const g0 = [
      [-34, -10], [-22, -9], [-22.7, -16.6], [-22.7, -20], [0, -9], [0, -16.5], [-33, -20], [-12, -20], [0, -20], [3, -20], [15, -20], [24.7, -20], [29, -20], [34, -20],
      [15, -9], [15, -16.5], [9.5, -13], [29, -9], [29, -16.5], [34, -10], [-20.7, -23.6], [-21, -31], [-30, -24], [-12, -24], [3, -23.6], [3, -31], [24.7, -23.8], [18, -27], [30, -28], [24, -31],
      [-33, -10.5], [22.8, -3.2], [23, -1.2],
    ].map(([x, z]) => [x, z, I]);
    const g1 = [
      [-33, -20], [-20, -20], [-10, -20], [0, -20], [3, -20], [15, -20], [24.7, -20], [34, -20],
      [-22.7, -16.6], [-20, -9], [-30, -9], [-26.5, -16.6], [0, -16.5], [0, -8], [-34, -9.5], [15, -16.5], [15, -9], [29, -16.5], [29, -9], [31.2, -1.2], [33, -4],
      [-20.7, -23.6], [-21, -31], [-30, -24], [-12, -24], [3, -23.6], [3, -31], [24.7, -23.8], [18, -27], [30, -28], [24, -31],
    ].map(([x, z]) => [x, z, F]);
    const pts = [...out, ...g0, ...g1];
    this.nav = pts.map(([x, z, y], i) => ({ i, x, z, y: y === null ? this.groundAt(x, z, 2, 0.5) : y, n: [] }));
    for (let a = 0; a < this.nav.length; a++) for (let b = a + 1; b < this.nav.length; b++) {
      const A = this.nav[a], B = this.nav[b];
      if (Math.abs(A.y - B.y) > 0.6 && (this.insideBuilding(A.x, A.z) || this.insideBuilding(B.x, B.z))) continue;
      const d = Math.hypot(A.x - B.x, A.z - B.z);
      if (d > 48) continue;
      if (this.walkable(A.x, A.z, B.x, B.z, 0.4, Math.max(A.y, B.y) > 2 ? F : 0)) { A.n.push(b); B.n.push(a); }
    }
    // The stair tower: a chain of nodes up the switchback flights (guards don't use the lift).
    const T = TOWER, za = (T.laneA[0] + T.laneA[1]) / 2, zb = (T.laneB[0] + T.laneB[1]) / 2;
    const xw = (T.x0 + T.west) / 2, xe = (T.east + T.x1) / 2;
    const chain = [];
    for (let y = 0; y < F - 0.1; y += T.flight * 2) chain.push([xw, za, y], [xe, za, y + T.flight], [xe, zb, y + T.flight], [xw, zb, y + T.flight * 2]);
    chain.push([xw, T.z1 + 1.4, F]);
    let prev = null;
    for (const [x, z, y] of chain) {
      const n = { i: this.nav.length, x, z, y: y < 0.1 ? I : y, n: [] };
      this.nav.push(n);
      if (prev) { prev.n.push(n.i); n.n.push(prev.i); }
      prev = n;
    }
    const first = this.nav[this.nav.length - chain.length], last = prev;
    const hook = (node, y) => {
      const near = this.nav.filter((q) => q !== node && Math.abs(q.y - y) < 0.6 && this.insideBuilding(q.x, q.z) && !chain.some((c) => c[0] === q.x && c[1] === q.z && c[2] === q.y)).sort((a, b) => Math.hypot(a.x - node.x, a.z - node.z) - Math.hypot(b.x - node.x, b.z - node.z));
      for (const q of near.slice(0, 3)) if (this.walkable(node.x, node.z, q.x, q.z, 0.3, y > 2 ? F : 0)) { node.n.push(q.i); q.n.push(node.i); }
    };
    hook(first, 0);
    hook(last, F);
  }

  // Clear walking line at a floor height (doors count as passable; guards open them).
  walkable(ax, az, bx, bz, r = 0.4, y = 0) {
    const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz) || 1;
    const px = -dz / L * r, pz = dx / L * r;
    const ry = y + 0.8;
    for (const o of [0, 1, -1]) {
      const ox = ax + px * o, oz = az + pz * o;
      for (const b of this.boxes) {
        if (!b.solid || b.door || b.max[1] < ry - 0.45 || b.min[1] > ry + 0.4) continue;
        if (segBox(ox, ry, oz, dx, 0, dz, b)) return false;
      }
    }
    if (y > 1) return true;
    const steps = Math.ceil(L / 3);
    let prev = terrainHeight(ax, az);
    for (let i = 1; i <= steps; i++) {
      const h = terrainHeight(ax + (dx * i) / steps, az + (dz * i) / steps);
      if (Math.abs(h - prev) > 2.4) return false;
      prev = h;
    }
    return true;
  }

  floorOf(y) {
    return y > BUILDING.f1 - 0.5 && y < BUILDING.h ? 1 : 0;
  }

  nearestNode(x, z, y = 0) {
    const inside = this.insideBuilding(x, z);
    const fy = inside && this.floorOf(y) ? BUILDING.f1 : 0;
    const sorted = this.nav.filter((n) => !inside || !this.insideBuilding(n.x, n.z) || Math.abs(n.y - fy) < 1).map((n) => [(n.x - x) ** 2 + (n.z - z) ** 2, n]).sort((a, b) => a[0] - b[0]);
    for (let k = 0; k < Math.min(8, sorted.length); k++) if (this.walkable(x, z, sorted[k][1].x, sorted[k][1].z, 0.2, fy)) return sorted[k][1];
    return sorted.length ? sorted[0][1] : null;
  }

  // A* over the nav graph. Returns [{x,z,y}] ending at the target point.
  path(fx, fz, tx, tz, fy = 0, ty = fy) {
    const sameFloor = this.floorOf(fy) === this.floorOf(ty) || !(this.insideBuilding(fx, fz) || this.insideBuilding(tx, tz));
    if (sameFloor && this.walkable(fx, fz, tx, tz, 0.4, this.floorOf(fy) ? BUILDING.f1 : 0)) return [{ x: tx, z: tz }];
    const s = this.nearestNode(fx, fz, fy), e = this.nearestNode(tx, tz, ty);
    if (!s || !e) return [{ x: tx, z: tz }];
    const N = this.nav, g = new Map([[s.i, 0]]), from = new Map(), open = new Set([s.i]);
    const hh = (n) => Math.hypot(n.x - e.x, n.z - e.z, (n.y - e.y) * 3);
    let found = s.i === e.i;
    while (open.size && !found) {
      let cur = -1, cf = 1e18;
      for (const i of open) { const f = g.get(i) + hh(N[i]); if (f < cf) { cf = f; cur = i; } }
      if (cur === e.i) { found = true; break; }
      open.delete(cur);
      for (const j of N[cur].n) {
        const ng = g.get(cur) + Math.hypot(N[cur].x - N[j].x, N[cur].z - N[j].z, N[cur].y - N[j].y);
        if (ng < (g.has(j) ? g.get(j) : 1e18)) { g.set(j, ng); from.set(j, cur); open.add(j); }
      }
    }
    if (!found) return [{ x: tx, z: tz }];
    const out = [{ x: tx, z: tz }];
    let c = e.i;
    while (c !== undefined) { out.unshift({ x: N[c].x, z: N[c].z, y: N[c].y }); c = from.get(c); }
    return out;
  }

  // ---- world queries ----------------------------------------------------------
  heightAt(x, z) {
    return terrainHeight(x, z);
  }

  groundAt(x, z, y, step) {
    let g = terrainHeight(x, z);
    if (x > BUILDING.x0 && x < BUILDING.x1 && z > BUILDING.z0 && z < BUILDING.z1) g = Math.max(g, 0.02);
    for (const b of this.boxes) {
      if (!b.solid) continue;
      if (x < b.min[0] || x > b.max[0] || z < b.min[2] || z > b.max[2]) continue;
      if (b.max[1] <= y + step && b.max[1] > g) g = b.max[1];
    }
    return g;
  }

  resolveHorizontal(pos, r, height, step) {
    for (const b of this.boxes) {
      if (!b.solid) continue;
      if (b.max[1] <= pos.y + step || b.min[1] >= pos.y + height) continue;
      const cx = clamp(pos.x, b.min[0], b.max[0]), cz = clamp(pos.z, b.min[2], b.max[2]);
      const dx = pos.x - cx, dz = pos.z - cz, d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      if (d2 > 1e-9) {
        const d = Math.sqrt(d2);
        pos.x = cx + (dx / d) * r;
        pos.z = cz + (dz / d) * r;
      } else {
        // Centre inside the box: push out along the shallowest axis.
        const ex = [pos.x - b.min[0], b.max[0] - pos.x], ez = [pos.z - b.min[2], b.max[2] - pos.z];
        const m = Math.min(ex[0], ex[1], ez[0], ez[1]);
        if (m === ex[0]) pos.x = b.min[0] - r; else if (m === ex[1]) pos.x = b.max[0] + r; else if (m === ez[0]) pos.z = b.min[2] - r; else pos.z = b.max[2] + r;
      }
    }
    pos.x = clamp(pos.x, BOUNDS.x0, BOUNDS.x1);
    pos.z = clamp(pos.z, BOUNDS.z0, BOUNDS.z1);
  }

  // Segment a→b against boxes (mask: 'sight' | 'shot' | 'solid') and the terrain.
  // Returns { t, point, normal, box } of the first hit, or null.
  ray(a, b, mask = 'shot') {
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
    let best = null;
    for (const bx of this.boxes) {
      if (!bx[mask]) continue;
      const h = segBox(a.x, a.y, a.z, dx, dy, dz, bx);
      if (h && (!best || h.t < best.t)) best = { t: h.t, axis: h.axis, sign: h.sign, box: bx };
    }
    // Terrain: march in ~1.5 m steps, refine the crossing. The compound pad is flat at 0,
    // so a segment that starts and ends above it inside the fence can't touch the ground.
    const pad = (x, z) => Math.abs(x) < FENCE.x + 4 && Math.abs(z) < FENCE.z + 4;
    if (pad(a.x, a.z) && pad(b.x, b.z) && a.y >= 0 && b.y >= 0) return this._hit(best, a, dx, dy, dz);
    const L = Math.hypot(dx, dy, dz);
    const steps = Math.max(2, Math.ceil(L / 1.5));
    const tMax = best ? best.t : 1;
    let prevT = 0, prevAbove = a.y - terrainHeight(a.x, a.z) > -0.05;
    for (let i = 1; i <= steps; i++) {
      const t = (i / steps) * tMax;
      const x = a.x + dx * t, y = a.y + dy * t, z = a.z + dz * t;
      const above = y > terrainHeight(x, z);
      if (prevAbove && !above) {
        let lo = prevT, hi = t;
        for (let k = 0; k < 8; k++) {
          const mid = (lo + hi) / 2;
          if (a.y + dy * mid > terrainHeight(a.x + dx * mid, a.z + dz * mid)) lo = mid; else hi = mid;
        }
        best = { t: hi, terrain: true };
        break;
      }
      prevAbove = above;
      prevT = t;
    }
    return this._hit(best, a, dx, dy, dz);
  }

  _hit(best, a, dx, dy, dz) {
    if (!best) return null;
    const point = new THREE.Vector3(a.x + dx * best.t, a.y + dy * best.t, a.z + dz * best.t);
    const normal = new THREE.Vector3(0, 1, 0);
    if (!best.terrain && best.axis >= 0) { normal.set(0, 0, 0); normal.setComponent(best.axis, best.sign); }
    return { t: best.t, point, normal, box: best.box || null, terrain: !!best.terrain };
  }

  los(a, b) {
    return !this.ray(a, b, 'sight') && !this._foliageHit(a, b);
  }

  insideBuilding(x, z, y = 0) {
    return x > BUILDING.x0 && x < BUILDING.x1 && z > BUILDING.z0 && z < BUILDING.z1 && y < BUILDING.h - 0.1;
  }

  roomAt(x, z, y = 0) {
    const f = this.floorOf(y);
    for (const r of ROOMS) if (x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1 && (r.floor === undefined || r.floor === f)) return r;
    return null;
  }

  // Security zone: 'out' (beyond the fence), 'yard', 'floor' (offices, halls) or 'core' (rack rooms).
  zoneAt(x, z, y = 0) {
    if (this.insideBuilding(x, z, y)) {
      const r = this.roomAt(x, z, y);
      return r && r.tier >= 2 ? 'core' : 'floor';
    }
    if (Math.abs(x) <= FENCE.x && Math.abs(z) <= FENCE.z) return 'yard';
    return 'out';
  }

  // How lit a point is, 0 (pitch dark) .. 1 (floodlit). Moonlight gives the outdoors a floor;
  // indoors only the panels of the room you're in count.
  lightAt(x, y, z) {
    const inside = this.insideBuilding(x, z, y);
    let l = inside ? 0.1 : 0.22;
    const room = inside ? this.roomAt(x, z, y) : null;
    for (const L of this.lightSources) {
      if (!!L.interior !== inside || !L.on) continue;
      if (inside) { if (room && L.room === room.id) l = Math.max(l, 0.78); continue; }
      const d = Math.hypot(x - L.x, (y - L.y) * 0.35, z - L.z);
      if (d < L.r) l = Math.max(l, 1 - (d / L.r) * 0.6);
    }
    return l;
  }

  roomLit(id) {
    return this.lightSources.some((L) => L.room === id && L.on);
  }

  // Turn lights off for a while (cut lights, EMP) — or for good (shot out).
  lightsOff(pred, dur) {
    for (const L of this.lightSources) if (pred(L)) L.offT = Math.max(L.offT || 0, dur);
    this._syncLights();
  }
  breakLight(id) {
    const L = this.lightSources[id];
    if (!L || L.broken) return false;
    L.broken = true;
    this._syncLights();
    return true;
  }
  // Fixtures a shot can hit: lamps and ceiling panels. Returns { id, t } or null.
  lightHit(a, b) {
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, L2 = dx * dx + dy * dy + dz * dz;
    let best = null;
    for (const L of this.lightSources) {
      if (!L.fx || L.broken) continue;
      const r = L.kind === 'panel' ? 0.75 : 0.5;
      const t = clamp(((L.x - a.x) * dx + (L.y - a.y) * dy + (L.z - a.z) * dz) / L2, 0, 1);
      const px = a.x + dx * t - L.x, py = a.y + dy * t - L.y, pz = a.z + dz * t - L.z;
      if (px * px + py * py * (L.kind === 'panel' ? 16 : 1) + pz * pz < r * r && (!best || t < best.t)) best = { id: L.id, t };
    }
    return best;
  }
  lightState() {
    return this.lightSources.filter((L) => L.broken || L.offT > 0).map((L) => [L.id, L.broken ? 1 : 0, Math.ceil(L.offT || 0)]);
  }
  applyLightState(arr) {
    const m = new Map(arr.map((a) => [a[0], a]));
    for (const L of this.lightSources) { const a = m.get(L.id); L.broken = !!(a && a[1]); L.offT = a ? a[2] : 0; }
    this._syncLights();
  }
  _syncLights() {
    for (const L of this.lightSources) {
      const on = !L.broken && !(L.offT > 0);
      if (on === L.on && L._synced) continue;
      L.on = on;
      L._synced = true;
      if (!L.fx) continue;
      if (L.kind === 'panel') L.fx[0].material.color.set(on ? L.color : L.broken ? '#0c0d10' : '#1a1c20');
      else { L.fx[0].material.color.set(on ? L.color : '#15161a'); for (const o of L.fx.slice(1)) o.visible = on; }
    }
  }

  // Doors: `open` is the authoritative state; the mesh slides to match.
  setDoor(id, open) {
    const d = this.doors[id];
    if (!d || d.open === open) return;
    d.open = open;
    d.box.solid = d.box.sight = d.box.shot = !open;
  }

  // Station visuals from the shared objective state (host and guest alike).
  syncStations(ob, t) {
    const searched = ob.searched || [], used = ob.used || {};
    for (const q of this.stations) {
      if (q.kind === 'drawer') q.mesh.position.z = q.home.z + (searched.includes(q.id) ? 0.38 : 0);
      else if (q.kind === 'shelf') q.mesh.visible = (used[q.id] || 0) < q.uses;
      else if (q.kind === 'fridge') q.mesh.material.color.set((used[q.id] || 0) < q.uses ? '#40c8ff' : '#ff4040');
      else if (q.kind === 'barracks') q.panel.material.color.set(ob.barracks === 'destroyed' ? '#202020' : ob.barracksT > 0 ? '#30ffd0' : '#ff3040');
      else if (q.kind === 'bay') q.panel.material.color.set(ob.bay === 'destroyed' ? '#202020' : ob.bay === 'hacked' ? '#ff3040' : (t * 2) % 1 < 0.5 ? '#30ffd0' : '#108070');
      else if (q.kind === 'comms') q.leds.forEach((m, i) => m.material.color.set(ob.commsDown ? ((t * 2 + i * 0.3) % 1 < 0.5 ? '#ff2030' : '#300808') : Math.sin(t * 9 + i * 2.1) > 0 ? '#ff9a20' : '#5a3008'));
    }
    for (let i = 0; i < this.cctvScreens.length; i++) {
      const m = this.cctvScreens[i].material;
      if (ob.cctv) m.color.set(Math.sin(t * 3 + i) > -0.9 ? '#30ffd0' : '#0a3a30');
      else { const k = 0.75 + 0.25 * Math.sin(t * 11 + i * 4.7) * Math.sin(t * 2.3 + i); m.color.setRGB(0.23 * k, 0.43 * k, 0.63 * k); }
    }
  }

  // Nearest station of any kind within reach on this floor.
  stationNear(x, z, y, r = 1.8) {
    let best = null, bd = r;
    for (const q of this.stations) {
      if (Math.abs(q.y - y) > 1.6) continue;
      const d = Math.hypot(q.x - x, q.z - z);
      if (d < bd) { bd = d; best = q; }
    }
    return best;
  }

  update(dt) {
    this.t += dt;
    let changed = false;
    for (const L of this.lightSources) if (L.offT > 0) { L.offT -= dt; if (L.offT <= 0) { L.offT = 0; changed = true; } }
    if (changed) this._syncLights();
    for (const d of Object.values(this.doors)) {
      d.openT = clamp(d.openT + (d.open ? dt : -dt) * 2.5, 0, 1);
      const m = d.box.mesh;
      m.position.copy(d.home);
      if (d.kind === 'dock') m.position.y += d.openT * 3.6;
      else if (d.horiz) m.position.x += d.openT * (d.w * 0.95);
      else m.position.z += d.openT * (d.w * 0.95);
      const col = d.sealed ? '#ff2a40' : d.open ? '#30ff90' : d.unlocked ? '#30c0ff' : d.hackT > 0 ? '#ffb020' : d.kind === 'badge' ? '#ffd040' : '#ff3040';
      d.lamp.material.color.set(col);
    }
    if (this.leds && Math.floor(this.t * 6) !== this._ledTick) {
      this._ledTick = Math.floor(this.t * 6);
      const c = new THREE.Color();
      for (let k = 0; k < 16; k++) {
        const i = Math.floor(Math.random() * this.leds.count);
        this.leds.setColorAt(i, c.set(Math.random() < 0.15 ? '#101010' : Math.random() < 0.7 ? '#36ff9a' : '#3aa0ff'));
      }
      this.leds.instanceColor.needsUpdate = true;
    }
    if (this.beaconMat) this.beaconMat.color.set(Math.sin(this.t * 3) > 0 ? '#ffb020' : '#402800');
    if (this.relayMesh) this.relayMesh.material.color.set(this.relayPlanted ? '#30ff90' : Math.sin(this.t * 5) > 0 ? '#ffb020' : '#553300');
    // Hacked IoT devices go haywire: flashing faces.
    for (const D of this.devices || []) {
      if (D.t > 0) { D.t -= dt; D.face.material.color.setHSL((this.t * 3) % 1, 1, Math.sin(this.t * 30) > 0 ? 0.6 : 0.2); }
      else D.face.material.color.copy(D.base);
    }
  }
}

function shade(hex, k) {
  return '#' + new THREE.Color(hex).multiplyScalar(k).getHexString();
}
function poolMat(color) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const g = cv.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,0.55)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  return new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cv), color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
}
function coneMat(color) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) } },
    vertexShader: 'varying float vY; varying vec3 vN; varying vec3 vV; void main(){ vY = uv.y; vN = normalize(normalMatrix*normal); vec4 mv = modelViewMatrix*vec4(position,1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }',
    fragmentShader: 'uniform vec3 uColor; varying float vY; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(abs(dot(vN, vV)), 1.5); gl_FragColor = vec4(uColor * 0.05 * f * (0.25 + vY), 1.0); }',
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });
}
export function textTexture(text, color, w = 512, h = 64, font = '600 40px Rajdhani, sans-serif') {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const g = cv.getContext('2d');
  g.font = font;
  g.fillStyle = color;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, w / 2, h / 2);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

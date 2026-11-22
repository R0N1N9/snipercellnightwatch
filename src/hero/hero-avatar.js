// GENERATED from the NightWatch bible (tools/render/hero-avatar.js) by export_hero_to_game.py. Edit there, re-export.
// HeroAvatar [PROPOSED]: the hero-tier Operator as a game-ready, animated character.
//
// Same contract as the canon rig (Sniper Cell: NightWatch src/avatar.js Avatar): faces -Z, 1 unit = 1 m,
//   const a = new HeroAvatar({ gun: 'vx7' }); scene.add(a.root);
//   a.update(dt, { p, yaw, pitch, st, moving, sprint, ads, speed, strafe, back });   // every frame
// st: 0 stand, 1 kneel, 2 prone (as in the canon rig). Extras: ads (aim down sights), fire() (recoil),
// setGun('vx7' | 'x4'), setNods(down), outlines(on), and anchors for the game: muzzle(), eye().
//
// How it stays cheap: a rigid-segment rig (no skinning, like the canon avatar) where each bone's static parts are
// merged into one mesh per material at build time; only the arm segments move per frame (two-bone IK from the
// shoulders to wrists on the gun, which also carries the gloves). About 60 draw calls with outlines, 30 without.
import * as THREE from 'three';
import { hm, GLOW, K, roundedBox, bend, limb, span, joint, camo, webbing, decal, decalMesh, outline, heroX4, heroVX7, heroShieldKit, heroTablet, COLOURWAYS, heroStyle } from './hero.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const Y = V(0, 1, 0);
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _q = new THREE.Quaternion();

// ---------------------------------------------------------------------------------------------
// Merge every static mesh under a bone (stopping at child bones) into one mesh per material.
// ---------------------------------------------------------------------------------------------
function mergeGeos(geos) {
  let n = 0; const parts = geos.map((g) => { const x = g.index ? g.toNonIndexed() : g; n += x.attributes.position.count; return x; });
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2);
  let o = 0;
  for (const g of parts) {
    const c = g.attributes.position.count;
    pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3);
    if (g.attributes.uv) uv.set(g.attributes.uv.array, o * 2);
    o += c;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.computeBoundingSphere(); return out;
}
function bake(bone) {
  bone.updateMatrixWorld(true);
  const inv = bone.matrixWorld.clone().invert(), groups = new Map(), victims = [];
  const visit = (o) => {
    for (const c of o.children) {
      if (c.userData.bone || c.userData.keep) continue;
      if (c.isMesh && !c.material.transparent) {
        const g = c.geometry.clone(); g.applyMatrix4(_m.multiplyMatrices(inv, c.matrixWorld));
        for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
        (groups.get(c.material) || groups.set(c.material, []).get(c.material)).push(g); victims.push(c);
      }
      visit(c);
    }
  };
  const _m = new THREE.Matrix4();
  visit(bone);
  for (const v of victims) v.parent.remove(v);
  for (const [mat, geos] of groups) { const m = new THREE.Mesh(mergeGeos(geos), mat); m.castShadow = m.receiveShadow = true; bone.add(m); }
}
const boneOf = (name, parent, x = 0, y = 0, z = 0) => { const b = new THREE.Group(); b.name = name; b.userData.bone = true; b.position.set(x, y, z); parent.add(b); return b; };

// Stance poses (radians / metres). Rotations: +x on a thigh swings the leg forward, -x on a knee bends it.
const POSE = {
  0: { hipsY: 0.95, hipsZ: 0, bodyRx: 0, bodyY: 0, bodyZ: 0, thL: -0.08, thR: 0.1, knL: -0.1, knR: -0.16, ftL: 0.18, ftR: 0.06, spRx: 0.04, twist: -0.38, splay: 0 },
  1: { hipsY: 0.6, hipsZ: 0.04, bodyRx: 0, bodyY: 0, bodyZ: 0, thL: 1.3, thR: -0.1, knL: -1.38, knR: -1.5, ftL: 0.08, ftR: 1.15, spRx: 0.18, twist: -0.42, splay: 0 },
  2: { hipsY: 0.0, hipsZ: 0, bodyRx: -Math.PI / 2, bodyY: 0.17, bodyZ: 0.55, thL: 0, thR: 0, knL: -0.06, knR: -0.06, ftL: -0.3, ftR: -0.3, spRx: 0.5, twist: -0.1, splay: 0.18 },
};
// Gun placement in the aim frame (pivot between the shoulders), shouldered.
const GUN_AT = { vx7: V(0.105, 0.035, -0.36), x4: V(0.1, 0.03, -0.17) };

export class HeroAvatar {
  // Class kit: hat 'helmet' | 'cap' | 'capback' | 'beanie'; eyes 'none' | 'glasses' | 'goggles' (red lenses); vest 'plate' | 'runner';
  // medic (red cross), drone (recon quad on the pack), item: 'shield' | 'tablet' (held instead of a gun), gunOpts: VX-7 variant.
  constructor({ gun = 'vx7', cw = 'nightwatch', nods = true, outlines = true, hat = 'helmet', eyes = 'none', vest = 'plate', medic = false, drone = false, item = null, gunOpts = {}, callsign = 'WICK', poncho = false } = {}) {
    this.kit = { hat, eyes, vest, medic, drone, callsign, poncho };
    const C = this.C = COLOURWAYS[cw];
    this.root = new THREE.Group(); this.root.name = 'HeroAvatar';
    this.body = boneOf('body', this.root);
    const hips = this.hips = boneOf('hips', this.body, 0, 0.95, 0);
    // Materials (shared through hm()'s cache across avatars).
    const M = this.M = {
      fab: hm(C.uniform, 'cloth', { map: camo(C.camo), paint: 0.1 }), fabD: hm(C.uniform, 'cloth', { map: camo(C.camo), paint: 0.1, ramp: 'cloth' }),
      gear: hm(C.gear, 'cloth', { map: webbing(), paint: 0.18, scale: 6 }), gearP: hm(C.gear, 'plate', { wear: 0.35, wearCol: '#c9b48e', paint: 0.14 }),
      gearD: hm(C.gearD, 'cloth', { paint: 0.15 }), acc: hm(C.acc, 'cloth', { paint: 0.12 }), accP: hm(C.acc, 'plate', { wear: 0.3 }),
      glove: hm('#2a2826', 'cloth', { paint: 0.15, ink: '#0d0706' }), knuck: hm('#1b1a19', 'plate', { wear: 0.3 }),
      boot: hm('#2b2620', 'plate', { wear: 0.25, wearCol: '#8a7a60' }), sole: hm('#121212', 'plate', { wear: 0 }), mask: hm('#1a1b1d', 'cloth', { paint: 0.08, ink: '#0d0706' }),
      helm: hm(C.helmet, 'hard', { wear: 0.6, wearCol: '#c9b48e', spec: 0.6 }), nvg: hm('#1a1b1e', 'hard', { wear: 0.5 }), nvgH: hm('#2c2e33', 'hard'),
      red: hm('#c8283a', 'plate', { emissive: '#c8283a', ei: 0.25, wear: 0 }), ir: hm('#6e2424', 'cloth', { paint: 0.1, side: THREE.DoubleSide }),
    };
    this._pelvis(hips, M);
    this.legs = [-1, 1].map((s) => this._leg(hips, s, M));
    this.spine = boneOf('spine', hips, 0, 0.08, 0);
    const chest = this.chest = new THREE.Group(); chest.position.set(0, 0.14, 0); this.spine.add(chest);
    this._chest(chest, M, this.kit);
    if (poncho) this._poncho(this.spine);
    this.head = boneOf('head', chest, 0, 0.39, -0.02);
    this._head(this.head, M, this.kit);
    this.nods = null;
    if (hat === 'helmet') { this.nods = boneOf('nods', this.head, 0, 0.07, -0.135); this._nvg(this.nods, M); }
    this.aim = boneOf('aim', chest, 0, 0.3, -0.01);
    this.guns = { vx7: heroVX7(gunOpts), x4: heroX4() };
    if (item) this.guns.item = item === 'shield' ? heroShieldKit() : heroTablet();
    // Any gun meeting the contract (hero-guns-*.js builders, adaptGun()): held like the X4 if compact, else like the VX-7.
    const custom = gun && gun.isObject3D ? gun : null;
    if (custom) { custom.userData.at = custom.userData.at || GUN_AT[custom.userData.compact ? 'x4' : 'vx7'].clone(); this.guns.custom = custom; }
    for (const [k, g] of Object.entries(this.guns)) {
      const w = boneOf('gun-' + k, this.aim); w.add(g); w.position.copy(g.userData.at || GUN_AT[k]); g.userData.wrap = w;
      for (const h of [g.userData.handR, g.userData.handL]) this._glove(g, h, M);
      const mz = new THREE.Object3D(); mz.position.copy(g.userData.muzzle); g.add(mz); g.userData.muzzleObj = mz;
      for (const h of [g.userData.handR, g.userData.handL]) { const wr = new THREE.Object3D(); wr.position.copy(h.wrist); g.add(wr); h.wristObj = wr; }
    }
    // Arms: segments placed every frame.
    this.arms = [1, -1].map((side) => {
      const k = K(this.body);
      const del = k.ball(0.062, M.fab, 0, 0, 0, 1.0, 0.95, 1.05);
      const up = limb(this.body, V(0, -0.15, 0), V(0, 0.15, 0), [[0, 0.06], [0.35, 0.062], [0.75, 0.052], [1, 0.047]], M.fab);
      const fo = limb(this.body, V(0, -0.135, 0), V(0, 0.135, 0), [[0, 0.05], [0.25, 0.053], [0.7, 0.042], [1, 0.036]], M.fab);
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.066, 0.066, 0.05, 24, 1, true), M.ir); this.body.add(band);
      const cuff = new THREE.Mesh(new THREE.TorusGeometry(0.039, 0.012, 10, 24), M.fabD); this.body.add(cuff);
      for (const o of [del, up, fo, band, cuff]) o.userData.keep = true;
      return { side, del, up, fo, band, cuff, shoulder: V(side * 0.18, 0.3, -0.01), l1: 0.3, l2: 0.27 };
    });
    // Bake: one mesh per material per bone.
    this.root.updateMatrixWorld(true);
    const bones = []; this.root.traverse((o) => { if (o.userData.bone) bones.push(o); });
    for (const b of bones) bake(b);
    this.root.traverse((o) => { if (o.isMesh && !o.material.transparent) { o.castShadow = true; o.receiveShadow = true; } });
    this._outlined = false; this.outlines(outlines);
    // State.
    this.cur = { ...POSE[0] }; this.phase = 0; this.lowK = 0; this.adsK = 0; this.recoil = 0; this.nodsK = nods ? 1 : 0; this.nodsDown = nods; this.t = 0;
    this.setGun(item ? 'item' : custom ? 'custom' : gun);
  }

  // ---- build ----------------------------------------------------------------------------------
  _pelvis(p, M) {
    const k = K(p);
    k.rb(0.3, 0.17, 0.2, 0.07, M.fab, 0, -0.01, 0);
    const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.172, 0.172, 0.05, 40, 1, true), hm(this.C.gear, 'cloth', { map: webbing(), paint: 0.18, scale: 6, side: THREE.DoubleSide }));
    belt.scale.set(1, 1, 0.68); belt.position.y = 0.06; p.add(belt);
    k.rb(0.07, 0.04, 0.03, 0.008, M.accP, 0, 0.06, -0.115);
    k.rb(0.06, 0.12, 0.05, 0.015, M.gearP, 0.17, -0.02, 0.02, 0, 0, 0.12);
    k.rb(0.05, 0.09, 0.04, 0.012, M.acc, -0.17, 0, -0.02, 0, 0, -0.1);
    k.rb(0.055, 0.03, 0.045, 0.01, M.acc, -0.17, 0.05, -0.02, 0, 0, -0.1);
    k.rb(0.11, 0.085, 0.05, 0.02, M.gearP, 0, 0, 0.125);
  }
  _leg(hips, s, M) {
    const thigh = boneOf('thigh' + s, hips, s * 0.095, -0.05, 0);
    limb(thigh, V(0, 0, 0), V(0, -0.43, 0), [[0, 0.088], [0.3, 0.084], [0.7, 0.07], [1, 0.06]], M.fab);
    const kt = K(thigh);
    kt.rb(0.03, 0.14, 0.11, 0.012, M.fabD, s * 0.085, -0.24, 0);
    kt.rb(0.034, 0.04, 0.118, 0.01, M.fabD, s * 0.087, -0.185, 0);
    const knee = boneOf('knee' + s, thigh, 0, -0.43, 0);
    limb(knee, V(0, 0, 0), V(0, -0.315, 0), [[0, 0.058], [0.25, 0.062], [0.6, 0.05], [1, 0.045]], M.fab);
    const kk = K(knee);
    kk.rb(0.09, 0.11, 0.035, 0.016, M.accP, 0, -0.01, -0.058, -0.12);
    kk.torus(0.062, 0.006, M.acc, 0, -0.005, 0, Math.PI / 2, 0, 0);
    const foot = boneOf('foot' + s, knee, 0, -0.385, 0);
    const bt = new THREE.Group(); bt.rotation.y = s * 0.12; foot.add(bt); const kb = K(bt);
    kb.cyl(0.05, 0.054, 0.12, M.boot, 0, 0.02, 0.01);
    kb.rb(0.1, 0.08, 0.25, 0.035, M.boot, 0, -0.035, -0.045);
    kb.rb(0.108, 0.022, 0.27, 0.01, M.sole, 0, -0.082, -0.045);
    for (let i = 0; i < 6; i++) kb.rb(0.11, 0.008, 0.012, 0.003, M.sole, 0, -0.095, 0.07 - i * 0.04);
    for (let i = 0; i < 4; i++) kb.rb(0.05, 0.006, 0.012, 0.003, M.acc, 0, -0.024 + i * 0.016, -0.035 - i * 0.022, 0.6);
    kb.torus(0.056, 0.016, M.fabD, 0, 0.09, 0.01, Math.PI / 2, 0, 0);
    return { thigh, knee, foot, s };
  }
  _chest(c, M, kit) {
    const k = K(c);
    k.rb(0.33, 0.4, 0.21, 0.09, M.fab, 0, 0.08, 0);
    k.ball(0.09, M.fab, 0, 0.25, 0, 1.8, 0.55, 1.05);
    if (kit.vest === 'runner') return this._runner(c, M, kit);
    const fp = new THREE.Mesh(bend(roundedBox(0.3, 0.33, 0.045, 0.02, 4).clone(), 0.45), M.gear); fp.position.set(0, 0.09, -0.135); fp.rotation.y = Math.PI; c.add(fp);
    const bp = new THREE.Mesh(bend(roundedBox(0.3, 0.36, 0.045, 0.02, 4).clone(), 0.45), M.gear); bp.position.set(0, 0.1, 0.135); c.add(bp);
    const cb = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.17, 32, 1, true), M.gear); cb.scale.set(0.97, 1, 0.72); c.add(cb);
    for (const s of [-1, 1]) {
      const strap = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.022, 10, 24, Math.PI), M.gear); strap.scale.set(1, 0.8, 1.3); strap.position.set(s * 0.1, 0.205, 0); strap.rotation.y = Math.PI / 2; c.add(strap);
      k.rb(0.06, 0.04, 0.12, 0.016, M.gearD, s * 0.1, 0.32, 0);
    }
    for (let i = 0; i < 3; i++) {
      const x = -0.09 + i * 0.09;
      k.rb(0.078, 0.13, 0.05, 0.014, M.acc, x, -0.02, -0.18);
      k.rb(0.07, 0.025, 0.04, 0.008, hm('#24251f', 'hard', { wear: 0.4 }), x, 0.055, -0.18);
      k.rb(0.082, 0.035, 0.056, 0.012, M.acc, x, 0.035, -0.184);
      k.rb(0.012, 0.03, 0.01, 0.004, M.gearD, x, 0.06, -0.212);
    }
    k.rb(0.2, 0.09, 0.035, 0.016, M.gearP, 0, 0.14, -0.17);
    if (kit.medic) { k.rb(0.06, 0.018, 0.008, 0.003, M.red, -0.04, 0.14, -0.19); k.rb(0.018, 0.06, 0.008, 0.003, M.red, -0.04, 0.14, -0.19); }
    k.rb(0.05, 0.034, 0.01, 0.004, M.red, 0.06, 0.15, -0.19);
    k.rb(0.1, 0.026, 0.01, 0.004, M.acc, -0.045, 0.15, -0.19);
    const cs = decal('callsign-' + kit.callsign, 256, 64, (g) => { g.fillStyle = '#fff'; g.font = '700 44px Rajdhani, Arial'; g.textBaseline = 'middle'; g.fillText(kit.callsign, 70, 34); });
    const csm = decalMesh(cs, 0.1, 0.026, '#7f8f98'); csm.position.set(-0.045, 0.15, -0.1955); csm.rotation.y = Math.PI; csm.userData.keep = true; c.add(csm);
    k.rb(0.05, 0.12, 0.06, 0.012, M.acc, -0.19, 0.03, 0.05);
    k.cyl(0.004, 0.003, 0.42, M.acc, -0.2, 0.3, 0.1, -0.12, 0, 0.12, 8);
    k.rb(0.22, 0.3, 0.07, 0.04, M.gear, 0, 0.06, 0.2);
    k.rb(0.2, 0.04, 0.06, 0.02, M.gearD, 0, 0.23, 0.21);
    if (kit.drone) this._drone(c, M);
  }
  // The spotter / recce runner rig: wide soft straps, two tall front panels (mags left, phone and radio right), twin sternum
  // straps, side wings, a small upper-back panel and a hydration tube. Belly and belt clear for prone work and climbing.
  _runner(c, M, kit) {
    const k = K(c);
    for (const s of [-1, 1]) {
      const strap = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.03, 10, 24, Math.PI), M.gearD); strap.scale.set(1, 0.8, 1.3); strap.position.set(s * 0.085, 0.205, 0); strap.rotation.y = Math.PI / 2; c.add(strap);
      k.rb(0.11, 0.2, 0.035, 0.02, M.gear, s * 0.07, 0.17, -0.14);                         // front panel
      k.rb(0.08, 0.14, 0.05, 0.02, M.gear, s * 0.16, 0.12, -0.02, 0, s * 0.9, 0);          // side wing
    }
    k.rb(0.04, 0.12, 0.03, 0.01, M.acc, -0.09, 0.15, -0.165); k.rb(0.04, 0.12, 0.03, 0.01, M.acc, -0.045, 0.15, -0.165);   // two mags
    k.rb(0.035, 0.02, 0.032, 0.006, hm('#24251f', 'hard', { wear: 0.4 }), -0.09, 0.215, -0.165); k.rb(0.035, 0.02, 0.032, 0.006, hm('#24251f', 'hard', { wear: 0.4 }), -0.045, 0.215, -0.165);
    k.rb(0.05, 0.09, 0.016, 0.008, hm('#141516', 'hard', { spec: 0.8 }), 0.05, 0.17, -0.163);                          // phone
    k.rb(0.035, 0.1, 0.03, 0.008, M.acc, 0.1, 0.14, -0.165); k.cyl(0.003, 0.003, 0.12, M.acc, 0.1, 0.25, -0.165, 0, 0, 0, 6); // radio
    for (const y of [0.2, 0.12]) k.rb(0.12, 0.012, 0.01, 0.004, M.acc, 0, y, -0.16);                                    // sternum straps
    k.rb(0.18, 0.16, 0.04, 0.03, M.gear, 0, 0.2, 0.13);                                                                // upper back
    k.rb(0.012, 0.012, 0.012, 0.004, hm('#6e2424', 'cloth'), 0.06, 0.22, -0.16);                                       // IR tab
    const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(0.11, 0.3, 0.06), new THREE.Vector3(0.14, 0.28, -0.08), new THREE.Vector3(0.1, 0.24, -0.16)]), 12, 0.007, 6), M.acc); c.add(tube);
    if (kit.drone) this._drone(c, M);
  }
  // Recon quad folded on the back.
  _drone(c, M) {
    const d = new THREE.Group(); d.position.set(0, 0.3, 0.22); d.rotation.x = -1.2; c.add(d); const k = K(d);
    k.rb(0.08, 0.03, 0.12, 0.012, M.accP, 0, 0, 0);
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { k.rb(0.07, 0.01, 0.012, 0.004, M.accP, x * 0.05, 0, z * 0.05, 0, x * z * 0.7, 0); k.cyl(0.035, 0.035, 0.004, M.acc, x * 0.08, 0.008, z * 0.075, 0, 0, 0, 20); }
    k.ball(0.008, GLOW('#38d6f2', 1.4), 0, 0.0, -0.062);
  }
  _head(h, M, kit) {
    const k = K(h);
    k.cyl(0.055, 0.06, 0.1, M.mask, 0, -0.05, 0);
    k.torus(0.06, 0.012, M.mask, 0, -0.07, 0, Math.PI / 2, 0, 0);
    k.ball(0.1, M.mask, 0, 0.07, 0, 0.92, 1.12, 1.03);
    k.ball(0.03, M.mask, 0, 0.03, -0.09, 1, 0.9, 0.9);
    k.ball(0.05, M.mask, 0, 0, -0.065, 1.1, 0.8, 0.9);
    for (const s of [-1, 1]) {                                                                                   // headset cups
      k.cyl(0.046, 0.046, 0.036, M.acc, s * 0.106, 0.015, 0.012, 0, 0, Math.PI / 2, 24);
      k.cyl(0.036, 0.036, 0.008, M.accP, s * 0.126, 0.015, 0.012, 0, 0, Math.PI / 2, 24);
    }
    k.cyl(0.004, 0.004, 0.11, M.acc, -0.08, -0.01, -0.06, 1.2, 0.6, 0, 8);
    k.ball(0.008, M.acc, -0.03, -0.035, -0.105);
    const lens = hm('#e0283a', 'hard', { emissive: '#e0283a', ei: 0.55, wear: 0, spec: 1.2, rim: 0.2 }), frame = hm('#141516', 'hard', { wear: 0.2 });
    if (kit.eyes === 'glasses') {
      for (const s of [-1, 1]) k.ball(0.026, lens, s * 0.038, 0.08, -0.098, 1.15, 0.72, 0.3);
      k.rb(0.15, 0.008, 0.012, 0.003, frame, 0, 0.098, -0.095);
      for (const s of [-1, 1]) k.rb(0.006, 0.006, 0.09, 0.002, frame, s * 0.09, 0.09, -0.05);
    } else if (kit.eyes === 'goggles') {
      k.rb(0.16, 0.052, 0.04, 0.018, frame, 0, 0.08, -0.092);
      for (const s of [-1, 1]) k.ball(0.028, lens, s * 0.036, 0.08, -0.112, 1.15, 0.75, 0.32);
      k.torus(0.105, 0.007, M.acc, 0, 0.08, 0.0, Math.PI / 2, 0, 0);
    }
    if (kit.hat === 'helmet') {
      const shell = k.lathe([[0.0001, 0.115], [0.04, 0.112], [0.075, 0.1], [0.1, 0.075], [0.115, 0.045], [0.121, 0.012], [0.122, -0.004], [0.116, -0.008]], M.helm, 0, 0.065, 0.005, 0, 0, 0, 36);
      shell.scale.set(0.96, 1, 1.08);
      for (const s of [-1, 1]) k.rb(0.014, 0.022, 0.13, 0.005, M.nvg, s * 0.113, 0.06, 0.005, 0, 0, s * 0.15);
      k.rb(0.08, 0.016, 0.07, 0.008, M.gearP, 0, 0.18, -0.015);
      k.rb(0.06, 0.045, 0.03, 0.008, M.nvg, 0, 0.125, -0.112, -0.35);
      k.torus(0.115, 0.004, M.acc, 0, 0.11, 0, Math.PI / 2 - 0.15, 0, 0);
      k.rb(0.09, 0.05, 0.04, 0.012, M.nvg, 0, 0.12, 0.12, -0.45);
      this.strobe = k.ball(0.012, GLOW('#6e2424', 0.6), 0, 0.155, 0.126);
    } else if (kit.hat === 'cap' || kit.hat === 'capback') {
      const cap = hm(this.C.gear, 'cloth', { paint: 0.15, scale: 12 });
      const crown = k.lathe([[0.0001, 0.105], [0.05, 0.1], [0.085, 0.08], [0.104, 0.045], [0.108, 0.01], [0.108, 0.0]], cap, 0, 0.075, 0.0, 0, 0, 0, 32); crown.scale.set(0.97, 1, 1.05);
      const back = kit.hat === 'capback' ? -1 : 1;
      k.rb(0.17, 0.012, 0.1, 0.03, cap, 0, 0.083, -0.135 * back, -0.12 * back);
      k.rb(0.05, 0.03, 0.006, 0.006, hm(this.C.acc, 'cloth'), 0, 0.13, -0.1 * back);                           // patch
      k.torus(0.11, 0.006, M.acc, 0, 0.12, 0.0, 0, Math.PI / 2, 0, Math.PI);                                   // headset band
      this.strobe = k.ball(0.01, GLOW('#6e2424', 0.6), 0, 0.17, 0.06 * back);
    } else if (kit.hat === 'hood') {
      // Ra's hood: a deep cowl in the poncho's pattern, open at the face, goggles glinting inside.
      const cl = this._ponchoMat();
      const g = new THREE.LatheGeometry([[0.06, 0.19], [0.1, 0.18], [0.135, 0.14], [0.152, 0.08], [0.155, 0.0], [0.15, -0.07], [0.14, -0.12]].map(([r, y]) => new THREE.Vector2(r, y)), 32, Math.PI + 0.62, Math.PI * 2 - 1.24);
      const hood = new THREE.Mesh(g, cl); hood.position.set(0, 0.07, 0.015); hood.scale.set(0.95, 1, 1.1); hood.userData.noHull = true; this.head.add(hood);
      k.ball(0.06, cl, 0, 0.25, 0.03, 1.1, 0.6, 1.2);                                                         // crown
      this.strobe = k.ball(0.01, GLOW('#6e2424', 0.6), 0, 0.24, 0.12);
    } else if (kit.hat === 'beanie') {
      const knit = hm(this.C.acc, 'cloth', { paint: 0.2, scale: 30 });
      const b = k.lathe([[0.0001, 0.13], [0.05, 0.125], [0.085, 0.1], [0.105, 0.06], [0.11, 0.02], [0.108, 0.0]], knit, 0, 0.07, 0.0, 0, 0, 0, 32); b.scale.set(0.97, 1, 1.05);
      k.torus(0.107, 0.016, knit, 0, 0.08, 0.0, Math.PI / 2, 0, 0);
      k.torus(0.11, 0.006, M.acc, 0, 0.12, 0.0, 0, Math.PI / 2, 0, Math.PI);
      this.strobe = k.ball(0.01, GLOW('#6e2424', 0.6), 0, 0.2, 0.0);
    }
    this.strobe.userData.keep = true;
  }
  _ponchoMat() { return hm('#3a3d42', 'cloth', { map: camo('mcblack'), paint: 0.14, side: THREE.DoubleSide, ink: '#05070d' }); }
  // Ra's poncho: an open-fronted cloth shell from the shoulders to the knees, on the spine (moves with the torso).
  _poncho(spine) {
    const prof = [[0.12, 0.62], [0.2, 0.57], [0.28, 0.48], [0.31, 0.3], [0.33, 0.05], [0.36, -0.25], [0.39, -0.48], [0.385, -0.52]];
    const g = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 36, Math.PI + 0.85, Math.PI * 2 - 1.7);
    const m = new THREE.Mesh(g, this._ponchoMat()); m.scale.set(1, 1, 0.78); m.userData.noHull = true; spine.add(m);
    // Hem: a slightly darker drop band, and a fold down the back.
    const hem = new THREE.LatheGeometry([[0.39, -0.46], [0.395, -0.53], [0.388, -0.55]].map(([r, y]) => new THREE.Vector2(r, y)), 36, Math.PI + 0.85, Math.PI * 2 - 1.7);
    const hm2 = new THREE.Mesh(hem, hm('#26282c', 'cloth', { side: THREE.DoubleSide })); hm2.scale.set(1, 1, 0.78); hm2.userData.noHull = true; spine.add(hm2);
  }
  _nvg(q, M) {
    const k = K(q);
    k.rb(0.165, 0.036, 0.05, 0.012, M.nvg, 0, 0.012, 0.01);
    k.rb(0.034, 0.064, 0.034, 0.01, M.nvgH, 0, 0.05, 0.03, -0.2);
    this.lensMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#40ffb0').multiplyScalar(0.5) }); this.lensMat.userData.noHull = true;
    for (const [x, ry] of [[-0.026, 0.02], [0.026, -0.02], [-0.068, 0.3], [0.068, -0.3]]) {
      const t = new THREE.Group(); t.position.set(x, -0.004, -0.01); t.rotation.y = ry; q.add(t); const kk = K(t);
      kk.barrel([[0.0001, -0.01], [0.017, -0.01], [0.019, 0], [0.019, 0.05], [0.0205, 0.052], [0.0205, 0.066], [0.0175, 0.07], [0.0001, 0.07]], M.nvg);
      kk.barrel([[0.0001, 0.071], [0.014, 0.071], [0.0001, 0.0715]], this.lensMat);
    }
  }
  // Glove closed on a grip (hand spec in gun-local space; see hero.js), plus the wrist bridge.
  _glove(gun, h, M) {
    const hand = new THREE.Group(); hand.position.copy(h.at); hand.quaternion.setFromUnitVectors(Y, h.axis.clone().normalize()); gun.add(hand);
    const k = K(hand), r = h.r;
    k.rb(0.028, 0.085, 0.07, 0.013, M.glove, h.back[0], 0, h.back[1]);
    k.rb(0.01, 0.07, 0.03, 0.004, M.knuck, h.back[0] + Math.sign(h.back[0]) * 0.016, 0, h.back[1] + 0.012);
    for (let f = 0; f < 4; f++) { const fr = new THREE.Mesh(new THREE.TorusGeometry(r + 0.01, 0.0105, 8, 18, h.arc[1]), M.glove); fr.position.set(0, 0.031 - f * 0.021, 0); fr.rotation.set(Math.PI / 2, 0, h.arc[0]); hand.add(fr); }
    const th = new THREE.Mesh(new THREE.CapsuleGeometry(0.0115, 0.045, 6, 12), M.glove); th.position.set(-Math.sign(h.back[0]) * (r * 0.3), 0.05, -r - 0.004); th.rotation.set(0.9, 0, 0); hand.add(th);
    gun.updateMatrixWorld(true);
    const back = hand.localToWorld(V(h.back[0], -0.01, h.back[1])); gun.worldToLocal(back);
    limb(gun, h.wrist.clone(), back, [[0, 0.036], [1, 0.032]], M.glove);
  }

  // ---- API ------------------------------------------------------------------------------------
  setGun(k) { this.gunKey = k; for (const [n, g] of Object.entries(this.guns)) g.userData.wrap.visible = n === k; this.gun = this.guns[k]; }
  setNods(down) { this.nodsDown = down; }
  outlines(on) {
    if (on && !this._outlined) { outline(this.root); this._outlined = true; }
    this.root.traverse((o) => { if (o.userData.isHull) o.visible = on; });
    this.outlinesOn = on;
  }
  fire() { this.recoil = 1; }
  muzzle(out = new THREE.Vector3()) { return this.gun.userData.muzzleObj.getWorldPosition(out); }
  muzzleDir(out = new THREE.Vector3()) { this.gun.getWorldQuaternion(_q); return out.set(0, 0, -1).applyQuaternion(_q); }
  eye(out = new THREE.Vector3()) { return this.head.localToWorld(out.set(0, 0.07, -0.08)); }

  // s: { p, yaw, pitch, st, moving, sprint, ads, speed (m/s), strafe (-1..1), back (bool) }
  update(dt, s) {
    this.t += dt;
    const st = s.st | 0, P = POSE[st], k = 1 - Math.exp(-dt * 9), cur = this.cur;
    for (const key in P) cur[key] += (P[key] - cur[key]) * k;
    this.root.position.copy(s.p); this.root.rotation.y = s.yaw;
    // Gait.
    const speed = s.moving ? (s.speed ?? (s.sprint ? 5.5 : 2.6)) : 0;
    const stride = st === 0 ? (s.sprint ? 1.55 : 1.25) : st === 1 ? 0.7 : 0.9;
    this.phase += (speed / stride) * Math.PI * dt * (s.back ? -1 : 1);
    this.moveK = (this.moveK || 0) + ((s.moving ? 1 : 0) - (this.moveK || 0)) * Math.min(1, dt * 8);
    const mk = this.moveK, ph = this.phase, sw = Math.sin(ph), amp = (st === 0 ? (s.sprint ? 0.85 : 0.5) : st === 1 ? 0.25 : 0.12) * mk;
    const breathe = Math.sin(this.t * 1.6) * 0.012 * (1 - mk);
    this.body.rotation.x = cur.bodyRx; this.body.position.set(0, cur.bodyY, cur.bodyZ);
    const bob = st === 0 ? Math.abs(Math.cos(ph)) * 0.035 * mk * (s.sprint ? 1.6 : 1) : 0;
    this.hips.position.set(0, cur.hipsY + bob - 0.02 * mk, cur.hipsZ);
    // Strafing: turn the hips toward the travel direction; the chest counter-turns to keep the gun on target.
    const hipYaw = (s.strafe || 0) * 0.7 * mk * (st === 2 ? 0 : 1);
    this.hips.rotation.set(st === 0 ? 0.06 * mk * (s.sprint ? 2 : 1) : 0, hipYaw, Math.sin(ph) * 0.04 * mk);
    const [L, R] = this.legs;
    if (st === 2) {
      L.thigh.rotation.set(cur.thL + sw * amp, 0, -cur.splay); R.thigh.rotation.set(cur.thR - sw * amp, 0, cur.splay);
      L.knee.rotation.x = cur.knL - Math.max(0, sw) * 0.5 * mk; R.knee.rotation.x = cur.knR - Math.max(0, -sw) * 0.5 * mk;
    } else {
      L.thigh.rotation.set(cur.thL + sw * amp, 0, -0.02 - cur.splay); R.thigh.rotation.set(cur.thR - sw * amp, 0, 0.02 + cur.splay);
      L.knee.rotation.x = cur.knL - Math.max(0, -Math.cos(ph)) * 1.1 * amp - 0.1 * mk; R.knee.rotation.x = cur.knR - Math.max(0, Math.cos(ph)) * 1.1 * amp - 0.1 * mk;
    }
    L.foot.rotation.x = cur.ftL - (L.thigh.rotation.x + L.knee.rotation.x) * (st === 0 ? 1 : 0) * 0.9;
    R.foot.rotation.x = cur.ftR - (R.thigh.rotation.x + R.knee.rotation.x) * (st === 0 ? 1 : 0) * 0.9;
    // Torso: bladed stance (twist), lean, breathing, a little counter-swing when walking.
    this.adsK += ((s.ads ? 1 : 0) - this.adsK) * Math.min(1, dt * 12);
    this.lowK += (((s.sprint && st === 0 && s.moving) || s.lowReady ? 1 : 0) - this.lowK) * Math.min(1, dt * 8);
    const twist = cur.twist * (1 - this.lowK * 0.6) - hipYaw;
    this.spine.rotation.set(cur.spRx + breathe + (s.sprint ? 0.12 : 0) * mk * (st === 0 ? 1 : 0), twist + sw * 0.05 * mk, -Math.sin(ph) * 0.03 * mk);
    this.chest.scale.set(1, 1 + breathe * 0.6, 1);
    // Head follows the view, level when prone.
    const torsoPitch = cur.bodyRx + cur.spRx;
    this.head.rotation.set(-torsoPitch + s.pitch * 0.6 - (this.lowK * 0.1), -twist * 0.85, 0);
    // Aim: the view pitch, minus what the torso already contributes; low ready when sprinting; recoil kick.
    this.recoil = Math.max(0, this.recoil - dt * 9);
    const pitch = s.pitch * (1 - this.lowK) - 0.8 * this.lowK;
    this.aim.rotation.set(pitch - torsoPitch + this.recoil * 0.06, -twist + this.lowK * 0.55, this.lowK * 0.35);
    const ga = this.gun.userData.at || GUN_AT[this.gunKey];
    this.gun.userData.wrap.position.set(ga.x - this.adsK * 0.04, ga.y + this.adsK * 0.025, ga.z + this.recoil * 0.035);
    // NVG flip.
    this.nodsK += ((this.nodsDown ? 1 : 0) - this.nodsK) * Math.min(1, dt * 7);
    if (this.nods) {
      this.nods.rotation.x = -1.25 * (1 - this.nodsK); this.nods.position.set(0, 0.07 + 0.1 * (1 - this.nodsK), -0.135 + 0.015 * (1 - this.nodsK));
      this.lensMat.color.set('#40ffb0').multiplyScalar(0.15 + 0.35 * this.nodsK);
    }
    this.strobe.visible = (this.t % 1.0) < 0.12;
    this._arms();
  }

  _arms() {
    this.root.updateMatrixWorld(true);
    const inv = this.body.matrixWorld.clone().invert(), bq = this.body.getWorldQuaternion(new THREE.Quaternion()).invert();
    const handSpec = [this.gun.userData.handR, this.gun.userData.handL];
    for (let i = 0; i < 2; i++) {
      const A = this.arms[i], h = handSpec[i];
      const S = this.chest.localToWorld(_a.copy(A.shoulder)).applyMatrix4(inv);
      const W = h.wristObj.getWorldPosition(_b).applyMatrix4(inv);
      // Pole in body space: elbows out and down.
      const pole = _c.set(A.side * 0.9, -0.8, 0.25).normalize();
      const E = joint(S, W, A.l1, A.l2, pole);
      A.del.position.copy(S);
      span(A.up, S, E); A.up.scale.set(1, S.distanceTo(E) / 0.3, 1);
      span(A.fo, E, W); A.fo.scale.set(1, E.distanceTo(W) / 0.27, 1);
      span(A.band, S.clone().lerp(E, 0.36), S.clone().lerp(E, 0.5));
      A.cuff.position.copy(E).lerp(W, 0.84); A.cuff.quaternion.setFromUnitVectors(V(0, 0, 1), W.clone().sub(E).normalize());
    }
    void bq;
  }
}


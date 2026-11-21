// Sniper Cell — SENTINEL, the facility's security: its troops, patrol drones and cameras,
// the alarm and reinforcements. The host runs the simulation (update); the guest only
// applies snapshots (applySnap) and draws the same models.
//
// Sensing and alarm rules come from Cold Archive, rescaled from its top-down pixels to
// metres: awareness fills at 2.4 × rate × visibility per second and drains at 0.4/s; full
// = alert after a 0.3–0.6 s reaction; an alert unit radios the alarm (+0.5) 1.5 s later
// unless it's dropped first; lost sight → search the last known position. Alarm 0..1
// (QUIET / ALERT / ALARM / LOCKDOWN), decaying only after 4 s without a raise.
//
// NightWatch troops are SENTINEL's augmented security, and they fight like a night-time
// alien patrol in an old shooter:
//   OFFICER     human-sized, unshielded, cowardly: alone and shot at, it shrieks and runs.
//   JUGGERNAUT  big and shielded (energy shell that recharges); shoots heavy plasma, and
//               when its shell breaks, a pack-mate dies or you get close, it goes berserk
//               and charges with an energy blade.
//   BULWARK     sharp-eyed, behind a hard-light wall with a sight-port: snipe through the
//               port, catch it when it lowers the wall to fire, or flank it. On the towers
//               it carries a beam rifle with a laser sight you can see coming.
//   OVERSEER    a juggernaut officer who carries the vault badge.
// Headshots kill anything, whatever the weapon. Infiltration keeps its plain security guards.
// Reinforcements always come from OUTSIDE the building: the barracks door and the south gate.
import * as THREE from 'three';
import { lam, glowMat, SPOTS, ROOMS, drawX, BUILDING } from './facility.js';
import { clamp, mulberry32 } from '../util.js';

export const DIFFS = {
  recruit: { name: 'Recruit', guardDmg: 0.7, guardAcc: 0.46, rate: 0.6, alarmDecay: 2.2, count: 0.65, drops: 5, hp: 120, camo: 1.4 },
  operative: { name: 'Operative', guardDmg: 1.05, guardAcc: 0.6, rate: 0.9, alarmDecay: 1.4, count: 0.9, drops: 3, hp: 100, camo: 1.0 },
  ghost: { name: 'Ghost', guardDmg: 1.35, guardAcc: 0.7, rate: 1.15, alarmDecay: 0.9, count: 1.0, drops: 2, hp: 85, camo: 0.8 },
};

export const TYPES = {
  guard: { name: 'GUARD', hp: 125, shield: 0, sight: 30, rate: 1, speed: [1.45, 1.9, 2.4, 3.6], scale: 1, color: '#4aa8ff' },
  scav: { name: 'OFFICER', hp: 60, shield: 0, sight: 24, rate: 0.8, speed: [1.6, 2.1, 2.8, 4.0], scale: 1, flee: true, color: '#ffb030' },
  jugg: { name: 'JUGGERNAUT', hp: 260, shield: 120, sight: 30, rate: 1, speed: [1.35, 1.8, 2.3, 2.9], scale: 1.22, berserk: true, color: '#ff3a6a' },
  bulwark: { name: 'BULWARK', hp: 90, shield: 0, sight: 40, rate: 1.3, speed: [1.6, 2.0, 2.8, 3.3], scale: 1, wall: true, color: '#30e0ff' },
  overseer: { name: 'OVERSEER', hp: 300, shield: 160, sight: 32, rate: 1.1, speed: [1.35, 1.8, 2.3, 2.9], scale: 1.28, berserk: true, helmet: true, color: '#c070ff' },
  // Heavy armour: plate halves body damage, and the helmet eats the first headshot.
  titan: { name: 'TITAN', hp: 380, shield: 0, sight: 30, rate: 1, speed: [1.15, 1.5, 2.0, 2.5], scale: 1.32, armor: 0.5, helmet: true, color: '#ff8030' },
};
const TYPE_KEYS = Object.keys(TYPES);
const STATES = ['patrol', 'post', 'sus', 'alert', 'search', 'dead', 'flee', 'berserk'];
const DRONE_HP = 40;
const EYE = 1.62;
// The bulwark's hard-light wall, in its local frame (feet at origin, facing -Z, before scale).
export const WALL = { z: -0.55, w: 0.95, y0: 0.3, y1: 1.85, port: { x0: 0.04, x1: 0.32, y0: 1.38, y1: 1.76 } };

// ---------------------------------------------------------------------------
// Models
// ---------------------------------------------------------------------------
function iconTexture(ch, color) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const g = cv.getContext('2d');
  g.font = '700 54px Rajdhani, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineWidth = 6;
  g.strokeStyle = 'rgba(0,0,0,0.8)';
  g.strokeText(ch, 32, 34);
  g.fillStyle = color;
  g.fillText(ch, 32, 34);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const ICONS = {};
function icon(kind) {
  const spec = { sus: ['?', '#ffd040'], alert: ['!', '#ff3048'], flee: ['!!', '#ffb030'], berserk: ['☠', '#ff2a6d'], radio: ['((•))', '#ff3048'] }[kind];
  if (!ICONS[kind]) ICONS[kind] = new THREE.SpriteMaterial({ map: iconTexture(spec[0], spec[1]), depthTest: false, transparent: true });
  return ICONS[kind];
}

const BEAM = new THREE.ConeGeometry(2.6, 12, 16, 1, true).translate(0, -6, 0).rotateX(Math.PI / 2); // apex at the light, opening down -Z
function beamMat(color = '#fff2c8') {
  // Soft volumetric look: fades along the beam, toward its silhouette, and right in front of the camera.
  return new THREE.ShaderMaterial({
    uniforms: { uC: { value: new THREE.Color(color) }, uA: { value: 1 } },
    vertexShader: 'varying float vD; varying float vC; varying vec3 vN; varying vec3 vV; void main(){ vD = clamp(length(position) / 12.0, 0.0, 1.0); vec4 mv = modelViewMatrix * vec4(position, 1.0); vC = length(mv.xyz); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'uniform vec3 uC; uniform float uA; varying float vD; varying float vC; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(abs(dot(normalize(vN), normalize(vV))), 2.0); gl_FragColor = vec4(uC * (1.0 - vD) * (1.0 - vD) * 0.06 * f * uA * smoothstep(2.0, 9.0, vC), 1.0); }',
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });
}
// Energy shell around juggernauts: a fresnel shimmer that flares when hit.
function shellMat(color) {
  return new THREE.ShaderMaterial({
    uniforms: { uC: { value: new THREE.Color(color) }, uA: { value: 0.4 }, uT: { value: 0 } },
    vertexShader: 'varying vec3 vN; varying vec3 vV; varying vec3 vP; void main(){ vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position,1.0); vV = normalize(-mv.xyz); vP = position; gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'uniform vec3 uC; uniform float uA, uT; varying vec3 vN; varying vec3 vV; varying vec3 vP; void main(){ float f = pow(1.0 - abs(dot(vN, vV)), 2.2); float hex = 0.6 + 0.4 * sin(vP.y * 40.0 + uT * 3.0) * sin(vP.x * 40.0 - uT * 2.0); gl_FragColor = vec4(uC * f * hex * uA * 1.6, 1.0); }',
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  });
}
function wallMat() {
  return new THREE.ShaderMaterial({
    uniforms: { uT: { value: 0 }, uA: { value: 1 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform float uT, uA; varying vec2 vUv;
      void main(){
        vec2 p = vUv;
        // The sight-port: a notch near the top on the weapon side.
        float port = step(${(0.5 + WALL.port.x0 / WALL.w).toFixed(3)}, p.x) * step(p.x, ${(0.5 + WALL.port.x1 / WALL.w).toFixed(3)}) * step(${((WALL.port.y0 - WALL.y0) / (WALL.y1 - WALL.y0)).toFixed(3)}, p.y) * step(p.y, ${((WALL.port.y1 - WALL.y0) / (WALL.y1 - WALL.y0)).toFixed(3)});
        if (port > 0.5) discard;
        float edge = 1.0 - smoothstep(0.0, 0.06, min(min(p.x, 1.0 - p.x), min(p.y, 1.0 - p.y)));
        float hx = abs(fract(p.x * 9.0 + 0.5 * floor(p.y * 12.0)) - 0.5) + abs(fract(p.y * 12.0) - 0.5);
        float grid = smoothstep(0.42, 0.5, hx);
        float scan = 0.5 + 0.5 * sin(p.y * 60.0 - uT * 6.0);
        vec3 c = vec3(0.2, 0.85, 1.0) * (0.12 + edge * 0.9 + grid * 0.25 + scan * 0.05);
        gl_FragColor = vec4(c * uA, 1.0);
      }`,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });
}

function rig(body, C, mk) {
  // Shared helper: hip pivots with two-part legs.
  const legs = [];
  for (const s of [-1, 1]) {
    const hip = new THREE.Group();
    hip.position.set(s * 0.11, 0.92, 0);
    body.add(hip);
    mk(new THREE.BoxGeometry(0.17, 0.5, 0.2), C.suit, 0, -0.25, 0, hip);
    mk(new THREE.BoxGeometry(0.15, 0.42, 0.17), C.suit, 0, -0.68, 0.01, hip);
    mk(new THREE.BoxGeometry(0.16, 0.1, 0.28), C.boot, 0, -0.88, -0.04, hip);
    legs.push(hip);
  }
  return legs;
}

export function buildUnit(type = 'guard', chief = false) {
  const T = TYPES[type] || TYPES.guard;
  const root = new THREE.Group();
  root.rotation.order = 'YXZ';
  const body = new THREE.Group();
  root.add(body);
  const mk = (geo, col, x, y, z, parent = body, opts) => { const m = new THREE.Mesh(geo, lam(col, opts)); m.position.set(x, y, z); parent.add(m); return m; };
  const glow = (geo, col, x, y, z, parent = body, k = 1.8) => mk(geo, col, x, y, z, parent, { emissive: col, emissiveIntensity: k });
  const gun = new THREE.Group();
  body.add(gun);
  let legs, shell = null, wall = null, blade = null, helmet = null;
  const neon = T.color;
  if (type === 'guard') {
    const C = { suit: chief ? '#2a2633' : '#30343a', armor: chief ? '#3a3448' : '#42474e', skin: '#2a2420', boot: '#151618' };
    legs = rig(body, C, mk);
    mk(new THREE.BoxGeometry(0.42, 0.56, 0.26), C.suit, 0, 1.2, 0);
    mk(new THREE.BoxGeometry(0.46, 0.44, 0.32), C.armor, 0, 1.24, -0.01);
    mk(new THREE.BoxGeometry(0.2, 0.22, 0.22), C.skin, 0, 1.6, 0);
    mk(new THREE.SphereGeometry(0.15, 10, 7, 0, Math.PI * 2, 0, Math.PI / 1.8), chief ? '#4b3f63' : '#3b4046', 0, 1.66, 0.01);
    glow(new THREE.BoxGeometry(0.2, 0.05, 0.03), chief ? '#c070ff' : '#ff4050', 0, 1.62, -0.115);
    gun.position.set(0.05, 1.18, -0.28);
    mk(new THREE.BoxGeometry(0.06, 0.09, 0.7), '#1b1c1f', 0, 0, -0.1, gun);
    for (const s of [-1, 1]) mk(new THREE.BoxGeometry(0.11, 0.11, 0.42), C.suit, s * 0.22, 1.28, -0.16).rotation.y = -s * 0.35;
  } else if (type === 'scav') {
    // Hunched little conscript: coolant pack on its back, slit visor, twitchy.
    const C = { suit: '#2b2a2f', boot: '#121214' };
    legs = rig(body, C, mk);
    for (const L of legs) L.position.y = 0.92;
    const torso = mk(new THREE.BoxGeometry(0.5, 0.5, 0.42), '#3a3530', 0, 1.18, 0.02);
    torso.rotation.x = 0.35;
    mk(new THREE.BoxGeometry(0.56, 0.2, 0.36), '#4a3f30', 0, 1.36, -0.04);
    // Coolant pack with a glowing canister.
    mk(new THREE.BoxGeometry(0.46, 0.62, 0.3), '#3c3a36', 0, 1.42, 0.3);
    glow(new THREE.CylinderGeometry(0.09, 0.09, 0.5, 10), neon, 0, 1.46, 0.47, body, 1.6);
    glow(new THREE.CylinderGeometry(0.03, 0.03, 0.5, 6), neon, 0.18, 1.55, 0.2, body, 1.2).rotation.x = 1.0;
    // Head: rebreather mask with a wide slit visor.
    mk(new THREE.BoxGeometry(0.3, 0.26, 0.3), '#2a2826', 0, 1.5, -0.12);
    glow(new THREE.BoxGeometry(0.26, 0.05, 0.02), '#ffe040', 0, 1.53, -0.28);
    mk(new THREE.CylinderGeometry(0.06, 0.08, 0.12, 8).rotateX(Math.PI / 2), '#1a1918', 0, 1.42, -0.3);
    gun.position.set(0.18, 1.12, -0.32);
    mk(new THREE.BoxGeometry(0.08, 0.1, 0.26), '#24262a', 0, 0, -0.05, gun);
    glow(new THREE.SphereGeometry(0.045, 8, 6), '#60ff70', 0, 0.02, -0.2, gun, 2);
    for (const s of [-1, 1]) mk(new THREE.BoxGeometry(0.09, 0.09, 0.36), C.suit, s * 0.22, 1.22, -0.16).rotation.y = -s * 0.3;
  } else if (type === 'jugg' || type === 'overseer') {
    // Hulking enforcer: plated, neon seams, heavy cannon on the left, energy blade on the right.
    const boss = type === 'overseer';
    const C = { suit: boss ? '#2a2236' : '#2c2628', boot: '#121214' };
    legs = rig(body, C, mk);
    mk(new THREE.BoxGeometry(0.62, 0.66, 0.42), boss ? '#3a3050' : '#3e3434', 0, 1.22, 0);
    mk(new THREE.BoxGeometry(0.7, 0.36, 0.48), boss ? '#4a3e66' : '#4e4040', 0, 1.36, -0.02);
    for (const s of [-1, 1]) {
      mk(new THREE.BoxGeometry(0.3, 0.2, 0.42), boss ? '#4a3e66' : '#4e4040', s * 0.46, 1.52, 0).rotation.z = s * 0.25;
      glow(new THREE.BoxGeometry(0.02, 0.5, 0.02), neon, s * 0.32, 1.2, -0.22);
    }
    mk(new THREE.BoxGeometry(0.3, 0.3, 0.32), '#2a2426', 0, 1.7, -0.02);
    glow(new THREE.BoxGeometry(0.24, 0.04, 0.02), neon, 0, 1.72, -0.19);
    if (boss) { glow(new THREE.BoxGeometry(0.06, 0.2, 0.06), neon, 0, 1.92, 0.02); helmet = new THREE.Group(); mk(new THREE.BoxGeometry(0.36, 0.3, 0.38), '#4a3e66', 0, 1.74, -0.02, helmet); glow(new THREE.BoxGeometry(0.28, 0.04, 0.02), neon, 0, 1.74, -0.22, helmet); body.add(helmet); }
    gun.position.set(-0.32, 1.2, -0.3);
    mk(new THREE.BoxGeometry(0.16, 0.18, 0.66), '#26232a', 0, 0, -0.1, gun);
    glow(new THREE.BoxGeometry(0.17, 0.04, 0.4), '#b050ff', 0, 0.1, -0.15, gun);
    mk(new THREE.BoxGeometry(0.14, 0.14, 0.4), C.suit, 0.32, 1.25, -0.18);
    blade = glow(new THREE.BoxGeometry(0.03, 0.08, 0.95), '#ff3aa0', 0.36, 1.1, -0.72, body, 3);
    blade.visible = false;
    shell = new THREE.Mesh(new THREE.SphereGeometry(0.62, 18, 12).scale(0.95, 1.55, 0.8), shellMat(neon));
    shell.position.y = 1.05;
    root.add(shell);
  } else if (type === 'titan') {
    // Walking armour: slab plates, a heavy cannon on each arm, a full helmet that can be shot off.
    const C = { suit: '#25272b', boot: '#101112' };
    legs = rig(body, C, mk);
    for (const L of legs) mk(new THREE.BoxGeometry(0.24, 0.3, 0.26), '#3a3d42', 0, -0.45, -0.04, L);
    mk(new THREE.BoxGeometry(0.72, 0.72, 0.5), '#3a3d42', 0, 1.22, 0);
    mk(new THREE.BoxGeometry(0.8, 0.3, 0.56), '#4a4e55', 0, 1.42, -0.02);
    for (const s of [-1, 1]) { mk(new THREE.BoxGeometry(0.34, 0.3, 0.5), '#4a4e55', s * 0.52, 1.5, 0); glow(new THREE.BoxGeometry(0.02, 0.4, 0.02), neon, s * 0.36, 1.18, -0.26); }
    mk(new THREE.BoxGeometry(0.24, 0.24, 0.26), '#1c1d20', 0, 1.7, -0.02);
    glow(new THREE.BoxGeometry(0.16, 0.03, 0.02), '#ffd040', 0, 1.71, -0.16);
    helmet = new THREE.Group();
    mk(new THREE.BoxGeometry(0.36, 0.34, 0.38), '#55595f', 0, 1.74, -0.02, helmet);
    glow(new THREE.BoxGeometry(0.3, 0.04, 0.02), neon, 0, 1.74, -0.22, helmet);
    body.add(helmet);
    gun.position.set(-0.36, 1.2, -0.32);
    mk(new THREE.BoxGeometry(0.18, 0.2, 0.7), '#26282c', 0, 0, -0.1, gun);
    glow(new THREE.BoxGeometry(0.19, 0.04, 0.44), '#ff8030', 0, 0.11, -0.15, gun);
    mk(new THREE.BoxGeometry(0.16, 0.16, 0.5), C.suit, 0.36, 1.25, -0.2);
  } else if (type === 'bulwark') {
    // Lean, long-necked lookout behind a hard-light wall with a sight-port.
    const C = { suit: '#22282c', boot: '#101214' };
    legs = rig(body, C, mk);
    mk(new THREE.BoxGeometry(0.36, 0.5, 0.26), '#2c3438', 0, 1.18, 0.04);
    mk(new THREE.BoxGeometry(0.1, 0.24, 0.1), '#22282c', 0, 1.5, -0.04).rotation.x = -0.4;
    mk(new THREE.BoxGeometry(0.2, 0.18, 0.34), '#2c3438', 0, 1.62, -0.12);
    glow(new THREE.BoxGeometry(0.03, 0.06, 0.36), neon, 0, 1.74, -0.1, body, 2);
    glow(new THREE.BoxGeometry(0.16, 0.03, 0.02), neon, 0, 1.62, -0.3);
    gun.position.set(0.22, 1.2, -0.3);
    mk(new THREE.BoxGeometry(0.06, 0.08, 0.6), '#1b1e22', 0, 0, -0.15, gun);
    glow(new THREE.BoxGeometry(0.02, 0.02, 0.5), '#30e0ff', 0, 0.05, -0.15, gun, 1.4);
    wall = new THREE.Group();
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(WALL.w, WALL.y1 - WALL.y0), wallMat());
    plane.position.set(0, (WALL.y0 + WALL.y1) / 2, WALL.z);
    wall.add(plane);
    wall.userData.plane = plane;
    body.add(wall);
  }
  // Weapon light (troops only).
  const beam = new THREE.Mesh(BEAM, beamMat(type === 'guard' ? '#fff2c8' : '#cfe8ff'));
  beam.position.set(0.04, 0.03, -0.5);
  beam.rotation.x = -0.12;
  gun.add(beam);
  beam.visible = type === 'guard' || type === 'bulwark';
  const tag = new THREE.Sprite(icon('sus'));
  tag.scale.set(0.5, 0.5, 1);
  tag.position.set(0, 2.15, 0);
  tag.visible = false;
  root.add(tag);
  body.scale.setScalar(T.scale);
  root.userData = { body, legs, gun, beam, tag, shell, wall, blade, helmet, phase: Math.random() * 6, scale: T.scale };
  return root;
}
export const buildGuard = (chief) => buildUnit('guard', chief);

// Marked enemies show as red silhouettes through walls: every solid part of the model gets a
// twin drawn with no depth test, switched on while the unit is tagged.
let xrayMat;
export function withXray(root) {
  if (!xrayMat) xrayMat = new THREE.MeshBasicMaterial({ color: '#ff1830', transparent: true, opacity: 0.42, depthTest: false, depthWrite: false });
  const U = root.userData || (root.userData = {});
  const skip = new Set([U.shell, U.wall, U.beam, U.blade, U.tag].filter(Boolean));
  const list = [];
  const walk = (o) => {
    if (skip.has(o)) return;
    if (o.isMesh && !o.material.transparent) {
      const x = new THREE.Mesh(o.geometry, xrayMat);
      x.renderOrder = 990;
      x.visible = false;
      x.userData.xray = true;
      list.push([o, x]);
    }
    for (const c of o.children.slice()) walk(c);
  };
  walk(root);
  for (const [o, x] of list) o.add(x);
  U.xray = list.map((p) => p[1]);
  U.xrayOn = false;
  return root;
}
export function setXray(root, on) {
  const U = root.userData;
  if (!U.xray || U.xrayOn === on) return;
  U.xrayOn = on;
  for (const x of U.xray) x.visible = on;
}

export function buildDrone() {
  const g = new THREE.Group();
  const dark = '#1d1f26';
  const mk = (geo, col, x, y, z, opts) => { const m = new THREE.Mesh(geo, lam(col, opts)); m.position.set(x, y, z); g.add(m); return m; };
  mk(new THREE.BoxGeometry(0.7, 0.22, 0.9), dark, 0, 0, 0);
  mk(new THREE.BoxGeometry(0.72, 0.03, 0.92), '#ff2a8a', 0, 0.12, 0, { emissive: '#ff2a8a', emissiveIntensity: 1.4 });
  mk(new THREE.SphereGeometry(0.16, 10, 8), '#111', 0, -0.16, -0.32);
  const rotors = [];
  for (const [x, z] of [[-0.6, -0.6], [0.6, -0.6], [-0.6, 0.6], [0.6, 0.6]]) {
    mk(new THREE.BoxGeometry(0.08, 0.06, 0.8), dark, x / 2, 0.02, z / 2).lookAt(new THREE.Vector3(x * 2, 0.02, z * 2));
    const r = mk(new THREE.CylinderGeometry(0.34, 0.34, 0.02, 14), '#556', x, 0.12, z, { transparent: true, opacity: 0.4 });
    rotors.push(r);
    mk(new THREE.BoxGeometry(0.06, 0.06, 0.06), '#ff2030', x, -0.04, z, { emissive: '#ff2030', emissiveIntensity: 2 });
  }
  const beam = new THREE.Mesh(new THREE.ConeGeometry(5, 11, 18, 1, true).translate(0, -5.5, 0), beamMat('#ffe4f0'));
  beam.rotation.x = 0.35;
  g.add(beam);
  g.userData = { rotors, beam };
  return g;
}

export function buildCamera() {
  const g = new THREE.Group();
  const head = new THREE.Group();
  g.add(head);
  const b = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.2, 0.45), lam('#c9ccd0'));
  b.position.z = -0.15;
  head.add(b);
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.07, 12), new THREE.MeshBasicMaterial({ color: '#ff2030' }));
  lens.position.set(0, 0, -0.38);
  lens.rotation.y = Math.PI;
  head.add(lens);
  const cone = new THREE.Mesh(new THREE.ConeGeometry(4.5, 14, 16, 1, true).translate(0, -7, 0).rotateX(-Math.PI / 2), glowMat('#ff3040', 0.035));
  head.add(cone);
  g.userData = { head, lens, cone };
  return g;
}

// ---------------------------------------------------------------------------
// Simulation
// ---------------------------------------------------------------------------
export class Sentinel {
  constructor(game, { diff = 'operative', seed = 1, sim = true, mission = 'nightwatch', pickets = true } = {}) {
    this.game = game;
    this.fac = game.fac;
    this.scene = game.scene;
    this.D = DIFFS[diff] || DIFFS.operative;
    this.mission = mission;
    this.sim = sim;
    this.rng = mulberry32(seed);
    this.guards = [];
    this.drones = [];
    this.cams = [];
    this.alarm = 0;
    this.alarmPeak = 0;
    this.lastRaise = -99;
    this.lockdown = false;
    this.t = 0;
    this.nextId = 1;
    this.respawnT = 40;
    this.events = [];
    this.lkp = null;
    this.lkpT = 0;
    this.jams = [];
    this.spoofT = 0;
    this.scanT = 0;
    this.stats = { kills: 0, takedowns: 0, drones: 0, spotted: 0, loudShots: 0, heads: 0, backups: 0 };
    // Per-operator hunt: where SENTINEL last saw each of you, and when.
    this.hunt = { shooter: { seen: -99, lkp: null, broke: true }, spotter: { seen: -99, lkp: null, broke: true } };
    this.lastBackup = -99;
    if (mission === 'nightwatch') this._populateNW(); else this._populate();
    if (pickets) this._pickets(mission === 'nightwatch');
    else this.pickets = 0;
    this._cameras();
  }

  // ---- placement -------------------------------------------------------------
  static routes() {
    return {
      yardS: [[-60, 46], [-20, 52], [22, 50], [60, 44], [22, 50], [-20, 52]],
      yardN: [[-66, -52], [-20, -52], [40, -52], [66, -52], [40, -52], [-20, -52]],
      yardW: [[-68, 32], [-70, -24], [-44, -36], [-44, 10]],
      yardE: [[68, 40], [72, 6], [74, -23], [44, -36], [42, -20], [44, -10]],
      chief: [[0, 28], [0, 6], [0, -9], [0, -20], [3, -23.6], [3, -31], [3, -23.6], [15, -20], [15, -9], [15, -16.5], [-12, -20], [-12, -24], [-21, -31], [-20.7, -23.6], [0, -20], [0, -9], [0, 6], [-30, 18]],
      corridor: [[-33, -20], [34, -20]],
      datahall: [[-30, -24], [-22.5, -31.5], [-12, -24], [-8, -29.7], [-29, -27.5]],
      staging: [[-30, -9], [-14, -8], [-22, -14]],
      security: [[11, -10], [19, -6], [15, -15]],
      lobby: [[-5, -5], [5, -5], [0, -12]],
    };
  }

  _populate() {
    const R = this.rng, keep = (p) => R() < this.D.count || p;
    const routes = Sentinel.routes();
    const P = (pts) => pts.map(([x, z]) => ({ x, z }));
    for (const k of ['yardS', 'yardN', 'yardW', 'yardE']) this.spawnGuard({ route: P(routes[k]), start: routes[k][0] });
    if (keep()) this.spawnGuard({ route: P(routes.yardS).reverse(), start: [22, 50] });
    this.spawnGuard({ route: P(routes.chief), start: routes.chief[0], chief: true });
    for (const t of this.fac.towers) this.spawnGuard({ post: { x: t.x, z: t.z, y: t.y, face: t.face, sweep: 1.2 }, tower: true });
    this.spawnGuard({ post: { x: -3, z: 56, face: Math.PI, sweep: 0.7 } });
    if (keep()) this.spawnGuard({ post: { x: 4, z: 57, face: Math.PI + 0.4, sweep: 0.5 } });
    if (keep()) this.spawnGuard({ post: { x: 42, z: 24, face: -Math.PI / 2, sweep: 0.6 } });
    this.spawnGuard({ route: P(routes.lobby), start: [-5, -5] });
    if (keep()) this.spawnGuard({ route: P(routes.staging), start: [-30, -9] });
    this.spawnGuard({ route: P(routes.security), start: [11, -10] });
    this.spawnGuard({ post: { x: 27, z: -12, face: Math.PI / 2, sweep: 0.8 } });
    this.spawnGuard({ route: P(routes.corridor), start: [-33, -20] });
    this.spawnGuard({ route: P(routes.datahall), start: [-30, -24] });
    if (keep()) this.spawnGuard({ post: { x: -22.5, z: -35, face: 0, sweep: 0.9 } });
    this.spawnGuard({ post: { x: 11, z: -30, face: Math.PI / 2 + 0.3, sweep: 0.7 } });
    this.spawnGuard({ post: { x: 26, z: -26, face: -0.2, sweep: 0.9 } });
    if (keep()) this.spawnGuard({ post: { x: 35, z: -31, face: -Math.PI / 2, sweep: 0.8 } });
    // Upstairs.
    const U = Sentinel.upper();
    this.spawnGuard({ route: U.corridor, y: BUILDING.f1 });
    this.spawnGuard({ route: U.offices, y: BUILDING.f1 });
    this.spawnGuard({ post: { x: 11, z: -30, y: BUILDING.f1, face: Math.PI / 2, sweep: 0.8 } });
    if (keep()) this.spawnGuard({ post: { x: 0, z: -9, y: BUILDING.f1, face: Math.PI, sweep: 1 } });
    this._securityPosts(false);
    this._spread(28);
    this._drones();
    this.garrison = this.guards.length;
  }

  // NightWatch: packs of scavs led by juggernauts in the yard, bulwark snipers on the towers,
  // and a mixed garrison inside.
  _populateNW() {
    const R = this.rng, keep = (p) => R() < this.D.count || p;
    const routes = Sentinel.routes();
    const P = (pts) => pts.map(([x, z]) => ({ x, z }));
    const pack = (routeKey, n, rev = false) => {
      const pts = P(routes[routeKey]);
      if (rev) pts.reverse();
      const L = this.spawnGuard({ type: 'jugg', route: pts, start: [pts[0].x, pts[0].z] });
      const offs = [[-3, 3.5], [3, 3.5], [0, 6]];
      for (let i = 0; i < n; i++) if (i === 0 || keep()) this.spawnGuard({ type: 'scav', x: L.x + offs[i][0], z: L.z + offs[i][1], leader: L.id, off: offs[i] });
    };
    pack('yardS', 1);
    pack('yardN', 1);
    // Lone scavs and a bulwark on the flanks.
    this.spawnGuard({ type: 'scav', route: P(routes.yardW), start: routes.yardW[0] });
    if (keep()) this.spawnGuard({ type: 'scav', route: P(routes.yardW).reverse(), start: routes.yardW[2] });
    this.spawnGuard({ type: 'bulwark', route: P(routes.yardE), start: routes.yardE[0] });
    this.spawnGuard({ type: 'overseer', route: P(routes.chief), start: routes.chief[0], chief: true });
    // Bulwark snipers on the north towers (beam rifles), scav lookouts on the south ones.
    // Every tower carries a beam-rifle sniper watching the ground outside the fence.
    for (const t of this.fac.towers) this.spawnGuard({ type: 'bulwark', post: { x: t.x, z: t.z, y: t.y, face: t.face, sweep: 1.1 }, tower: true });
    // The gate: a bulwark and a scav.
    this.spawnGuard({ type: 'bulwark', post: { x: -3, z: 56, face: Math.PI, sweep: 0.6 } });
    if (keep()) this.spawnGuard({ type: 'scav', post: { x: 4, z: 57, face: Math.PI + 0.4, sweep: 0.8 } });
    this.spawnGuard({ type: 'scav', post: { x: 42, z: 24, face: -Math.PI / 2, sweep: 0.8 } });
    // Inside.
    this.spawnGuard({ type: 'scav', route: P(routes.lobby), start: [-5, -5] });
    this.spawnGuard({ type: 'scav', route: P(routes.staging), start: [-30, -9] });
    if (keep()) this.spawnGuard({ type: 'scav', route: P(routes.staging).reverse(), start: [-22, -14] });
    this.spawnGuard({ type: 'bulwark', route: P(routes.security), start: [11, -10] });
    this.spawnGuard({ type: 'scav', post: { x: 27, z: -12, face: Math.PI / 2, sweep: 1 } });
    this.spawnGuard({ type: 'bulwark', route: P(routes.corridor), start: [-33, -20] });
    this.spawnGuard({ type: 'jugg', route: P(routes.datahall), start: [-30, -24] });
    if (keep()) this.spawnGuard({ type: 'scav', post: { x: -22.5, z: -35, face: 0, sweep: 1 } });
    this.spawnGuard({ type: 'bulwark', post: { x: 11, z: -30, face: Math.PI / 2 + 0.3, sweep: 0.7 } });
    this.spawnGuard({ type: 'jugg', post: { x: 26, z: -26, face: -0.2, sweep: 0.8 } });
    if (keep()) this.spawnGuard({ type: 'bulwark', post: { x: 35, z: -31, face: -Math.PI / 2, sweep: 0.8 } });
    this.spawnGuard({ type: 'titan', post: { x: -2, z: 14, face: Math.PI, sweep: 0.6 } });
    // Upstairs: a titan walks the corridor; offices, break room, comms and the rack rooms are manned.
    const U = Sentinel.upper();
    this.spawnGuard({ type: 'titan', route: U.corridor, y: BUILDING.f1 });
    this.spawnGuard({ type: 'scav', route: U.offices, y: BUILDING.f1 });
    this.spawnGuard({ type: 'scav', post: { x: 0, z: -9, y: BUILDING.f1, face: Math.PI, sweep: 1 } });
    if (keep()) this.spawnGuard({ type: 'scav', post: { x: 3, z: -12, y: BUILDING.f1, face: -Math.PI / 2, sweep: 1 } });
    this.spawnGuard({ type: 'bulwark', post: { x: 15, z: -9, y: BUILDING.f1, face: 0, sweep: 0.9 } });
    if (keep()) this.spawnGuard({ type: 'scav', post: { x: 33, z: -6, y: BUILDING.f1, face: Math.PI / 2, sweep: 1 } });
    this.spawnGuard({ type: 'jugg', route: U.dhb, y: BUILDING.f1 });
    this.spawnGuard({ type: 'bulwark', post: { x: 11, z: -30, y: BUILDING.f1, face: Math.PI / 2, sweep: 0.8 } });
    this.spawnGuard({ type: 'titan', post: { x: 24, z: -31, y: BUILDING.f1, face: 0, sweep: 0.9 } });
    this._securityPosts(true);
    this._spread(34);
    this._drones();
    this.garrison = this.guards.length;
  }

  // Pickets in the draw south of the ridge, between the drop-off and the crest: a sentry at
  // the observation post, two walkers on the valley floor, a lookout on the slope below the
  // crest (and, sometimes, one up on the tree line). Out here they walk straight over open
  // ground. Each one that sees you radios it in, so take them quietly before you go over.
  _pickets(nw) {
    const R = this.rng, keep = (p) => R() < this.D.count || p;
    const T = nw ? 'scav' : 'guard';
    const at = (z, off) => ({ x: drawX(z) + off, z });
    const add = (o) => { const g = this.spawnGuard({ type: T, ...o }); g.picket = true; g.free = true; return g; };
    const op = this.fac.outpost || at(230, 6);
    add({ post: { x: op.x - 0.2, z: op.z - 0.3, face: Math.PI + 0.15, sweep: 0.9 } });
    const walk = [at(198, -1), at(214, 2), at(236, -2), at(250, 1)];
    add({ route: walk.map((p) => ({ ...p })), start: [walk[0].x, walk[0].z] });
    const back = [...walk].reverse();
    add({ route: back.map((p) => ({ ...p })), start: [back[0].x, back[0].z] });
    const cr = at(166, -9);
    add({ post: { x: cr.x, z: cr.z, face: Math.PI - 0.35, sweep: 0.8 } });
    if (keep()) { const tl = at(212, 19); add({ post: { x: tl.x, z: tl.z, face: Math.PI / 2 + 0.6, sweep: 0.7 } }); }
    this.pickets = this.guards.filter((g) => g.picket).length;
  }

  // Static posts that make sense for a site like this, both missions:
  //   door sentries outside each ground-floor entrance, a CCTV operator at the monitor desk,
  //   someone on break, sentries in the corridors outside the rack-room doors on both floors,
  //   and a walking patrol around the inside of the fence.
  _securityPosts(nw) {
    const R = this.rng, keep = (p) => R() < this.D.count || p;
    const T = (a, b) => (nw ? a : 'guard') || b;
    const up = BUILDING.f1;
    // Door sentries (outside, facing out).
    this.spawnGuard({ type: T('bulwark'), post: { x: -3.6, z: 2.6, face: Math.PI, sweep: 0.7 } }); // front
    if (keep()) this.spawnGuard({ type: T('scav'), post: { x: 3.6, z: 2.8, face: Math.PI + 0.3, sweep: 0.7 } });
    this.spawnGuard({ type: T('scav'), post: { x: 38.6, z: -13.2, face: -Math.PI / 2, sweep: 0.8 } }); // side
    this.spawnGuard({ type: T('jugg'), post: { x: 39, z: -24.5, face: -Math.PI / 2 + 0.3, sweep: 0.7 } }); // dock
    if (keep()) this.spawnGuard({ type: T('scav'), post: { x: -38.6, z: -6.8, face: Math.PI / 2, sweep: 0.8 } }); // maintenance
    // CCTV operator watching the monitor wall (security office, ground floor).
    this.spawnGuard({ type: T('scav'), post: { x: 15, z: -11.2, face: 0, sweep: 0.35 } });
    // The lobby checkpoint: an officer at the desk beside the metal detector, watching the doors,
    // and one by the elevator.
    this.spawnGuard({ type: T('scav'), post: { x: 3.5, z: -5.7, face: Math.PI - 0.2, sweep: 0.6 } }).vital = true;
    this.spawnGuard({ type: T('scav'), post: { x: -5.6, z: -12.4, face: Math.PI * 0.85, sweep: 0.7 } }).vital = true;
    // On break, by the coffee machine upstairs.
    this.spawnGuard({ type: T('scav'), post: { x: 3.6, z: -15.2, y: up, face: 0.4, sweep: 0.5 } });
    // Corridor sentries outside the rack-room doors.
    this.spawnGuard({ type: T('bulwark'), post: { x: -17.8, z: -20.4, face: Math.PI / 2, sweep: 0.9 } });
    this.spawnGuard({ type: T('scav'), post: { x: 6, z: -20.4, face: -Math.PI / 2, sweep: 0.9 } });
    if (keep()) this.spawnGuard({ type: T('scav'), post: { x: 28, z: -20.4, face: Math.PI / 2, sweep: 0.9 } });
    this.spawnGuard({ type: T('jugg'), post: { x: -17.8, z: -20.4, y: up, face: Math.PI / 2, sweep: 0.9 } });
    if (keep()) this.spawnGuard({ type: T('scav'), post: { x: 6, z: -20.4, y: up, face: -Math.PI / 2, sweep: 0.9 } });
    this.spawnGuard({ type: T('bulwark'), post: { x: 28, z: -20.4, y: up, face: Math.PI / 2, sweep: 0.9 } });
    // Perimeter patrol: a walking loop just inside the fence, two guards half a lap apart.
    const lap = [[-72, 50], [0, 52], [72, 50], [74, 0], [72, -50], [0, -52], [-72, -50], [-74, 0]].map(([x, z]) => ({ x, z }));
    this.spawnGuard({ type: T('scav'), route: lap, start: [lap[0].x, lap[0].z] });
    const lap2 = lap.slice(4).concat(lap.slice(0, 4));
    this.spawnGuard({ type: T('jugg'), route: lap2, start: [lap2[0].x, lap2[0].z] });
  }

  // Natural separation: drop any starting guard within 9 m of one already kept on the same
  // floor (never the chief, the tower snipers, or a leader's follower), then trim to a cap.
  _spread(cap) {
    const keep = [];
    const near = (a, b, r) => Math.abs((a.y || 0) - (b.y || 0)) < 2 && Math.hypot(a.x - b.x, a.z - b.z) < r;
    const drop = (g) => { this.scene.remove(g.obj); g.dropped = true; };
    for (const g of this.guards) {
      const vital = g.chief || g.tower || g.vital;
      const follower = g.leader && keep.some((k) => k.id === g.leader);
      if (!vital && !follower && keep.some((k) => near(k, g, 9))) { drop(g); continue; }
      if (follower && keep.some((k) => k.id !== g.leader && !(k.leader === g.leader) && near(k, g, 3))) { drop(g); continue; }
      keep.push(g);
    }
    // Over the cap: thin out the least important (not chief / towers / pack leaders) at random.
    const spare = () => keep.filter((g) => !g.chief && !g.tower && !g.vital && !keep.some((k) => k.leader === g.id));
    while (keep.length > cap) {
      const pool = spare();
      if (!pool.length) break;
      const g = pool[Math.floor(this.rng() * pool.length)];
      drop(g);
      keep.splice(keep.indexOf(g), 1);
      for (const f of keep.filter((k) => k.leader === g.id)) { drop(f); keep.splice(keep.indexOf(f), 1); }
    }
    this.guards = keep;
  }

  static upper() {
    const P = (pts) => pts.map(([x, z]) => ({ x, z, y: BUILDING.f1 }));
    return {
      corridor: P([[-33, -20], [34, -20]]),
      offices: P([[-30, -9], [-20, -9], [-24, -13]]),
      dhb: P([[-30, -24], [-22.5, -31.5], [-12, -24]]),
    };
  }

  _drones() {
    const loops = [
      [[-60, -40], [60, -40], [60, 40], [-60, 40]],
      [[0, 45], [70, 0], [0, -48], [-70, 0]],
      [[-40, 20], [40, 20], [40, -50], [-40, -50]],
    ];
    const nd = this.D.count >= 0.9 ? 3 : 2;
    for (let i = 0; i < nd; i++) this.spawnDrone(loops[i].map(([x, z]) => ({ x, z })), i);
    // Outside the gates: a drone orbiting beyond the fence, the towers' eyes in the sky.
    const outer = [[-96, 76], [0, 84], [96, 76], [104, 0], [96, -74], [0, -82], [-96, -74], [-104, 0]];
    this.spawnDrone(outer.map(([x, z]) => ({ x, z })), 3);
    this.droneCap = nd + 1;
  }

  _cameras() {
    const cams = [
      [-36.5, 4.5, 0.6, Math.PI * 0.75, 1, 32], [36.5, 4.5, 0.6, -Math.PI * 0.75, 1, 32], [-36.5, 4.5, -40.6, Math.PI * 0.25, 1, 32], [36.5, 4.5, -40.6, -Math.PI * 0.25, 1, 32],
      [8, 3.8, 56.5, Math.PI + 0.3, 1, 30],
      [7.5, 3, -0.6, Math.PI / 2 + 0.6, 2, 18], [-35.5, 3, -21.5, -Math.PI / 2, 2, 30], [-6.5, 3, -39.5, Math.PI * 0.2 + Math.PI, 2, 22],
      [11.5, 3, -39.5, Math.PI + 0.6, 3, 18], [35.5, 3, -22.5, -Math.PI * 0.75, 3, 22],
    ];
    // Upstairs.
    const F = BUILDING.f1;
    cams.push([-35.5, F + 3.0, -21.5, -Math.PI / 2, 2, 30], [7.5, F + 2.8, -0.6, Math.PI / 2 + 0.6, 2, 18], [-6.5, F + 2.8, -39.5, Math.PI * 1.2, 3, 22], [35.5, F + 2.8, -22.5, -Math.PI * 0.75, 3, 22]);
    for (const [x, y, z, yaw, tier, range] of cams) this.spawnCam({ x, y, z, yaw, tier, range });
  }

  spawnGuard({ type = 'guard', route = null, post = null, start = null, chief = false, tower = false, x, z, y = 0, hunt = null, leader = null, off = null }) {
    const T = TYPES[type] || TYPES.guard;
    const g = {
      id: this.nextId++, kind: 'g', type, chief, tower, leader, off,
      x: x ?? (start ? start[0] : post ? post.x : route ? route[0].x : 0), z: z ?? (start ? start[1] : post ? post.z : route ? route[0].z : 0), y: post && post.y ? post.y : y,
      yaw: post ? post.face : 0, look: 0, state: post ? 'post' : 'patrol', hp: T.hp, maxHp: T.hp, shield: T.shield, maxShield: T.shield, shieldT: 0, hitFx: 0,
      route, ri: 0, wait: 0, post, path: null, pathT: 0, aw: 0, target: null, lkp: null,
      reactT: 0, fireT: 0, radioT: 0, searchT: 0, jamT: 0, empT: 0, seenT: 0, tagT: 0, scanT: 0, body: false, found: false, fallT: 0, moving: false,
      badge: chief, quadAw: 0, fleeT: 0, meleeT: 0, burst: 0, lower: 0, aimT: 0, aiming: null, enraged: false, helmet: !!T.helmet, stagger: 0, sync: false,
    };
    if (!post || !post.y) g.y = this.fac.groundAt(g.x, g.z, g.y + 0.5, 0.6);
    if (hunt) { g.state = 'search'; g.lkp = { ...hunt }; g.searchT = 18; }
    g.obj = withXray(buildUnit(type, chief));
    this.scene.add(g.obj);
    this.guards.push(g);
    return g;
  }

  spawnDrone(route, i) {
    const pad = SPOTS.dronePad;
    const d = { id: this.nextId++, kind: 'd', route, ri: i % route.length, x: pad.x, y: pad.y, z: pad.z, alt: 10 + (i % 2) * 2, yaw: 0, hp: DRONE_HP, state: 'patrol', aw: 0, zapT: 0, empT: 0, huntT: 0, lkp: null, tagT: 0, scanT: 0, fallV: 0 };
    d.obj = withXray(buildDrone());
    this.scene.add(d.obj);
    this.drones.push(d);
    return d;
  }

  spawnCam({ x, y, z, yaw, tier, range }) {
    const c = { id: this.nextId++, kind: 'c', x, y, z, base: yaw, yaw, tier, range, sweep: 0.7, aw: 0, loopT: 0, empT: 0, hacked: false, phase: this.rng() * 6 };
    c.obj = buildCamera();
    c.obj.position.set(x, y, z);
    this.scene.add(c.obj);
    this.cams.push(c);
    return c;
  }

  byId(id) {
    return this.guards.find((g) => g.id === id) || this.drones.find((d) => d.id === id) || this.cams.find((c) => c.id === id);
  }

  emit(ev) {
    this.events.push(ev);
  }

  // ---- alarm -------------------------------------------------------------------
  raise(v, why) {
    if (!this.sim) return;
    const before = this.alarm;
    this.alarm = clamp(this.alarm + v, 0, 1);
    this.lastRaise = this.t;
    this.alarmPeak = Math.max(this.alarmPeak, this.alarm);
    if (before < 1 && this.alarm >= 1) this.emit({ t: 'toast', m: 'SENTINEL: intruder alert. All units respond.', c: 'red' });
    else if (before < 0.3 && this.alarm >= 0.3 && why) this.emit({ t: 'toast', m: why, c: 'amber' });
  }

  get alarmLabel() {
    if (this.lockdown) return 'LOCKDOWN';
    return this.alarm >= 1 ? 'ALARM' : this.alarm > 0.3 ? 'ALERT' : 'QUIET';
  }

  // Sound at a point. Through walls it carries 45 %. Loud and close → alert, else investigate.
  noise(pos, radius, loud = false) {
    if (!this.sim) return;
    for (const g of this.guards) {
      if (g.state === 'dead' || g.state === 'flee') continue;
      const ep = { x: g.x, y: g.y + EYE, z: g.z };
      const d = Math.hypot(g.x - pos.x, g.z - pos.z);
      const r = this.fac.los(ep, { x: pos.x, y: (pos.y || 0) + 1, z: pos.z }) ? radius : radius * 0.45;
      if (d > r) continue;
      if (g.state === 'alert' || g.state === 'berserk') { if (!g.target) g.lkp = { x: pos.x, z: pos.z, y: pos.y }; continue; }
      if (loud && d < r * 0.7) this._alert(g, null, { x: pos.x, z: pos.z });
      else this._investigate(g, pos, 5 + this.rng() * 3);
    }
  }

  // A round snapped past: scavs with nobody brave around them break and run.
  nearMiss(pos, from) {
    if (!this.sim) return;
    for (const g of this.guards) {
      if (g.state === 'dead') continue;
      const d = Math.hypot(g.x - pos.x, g.z - pos.z);
      if (d > 4.5) continue;
      if (TYPES[g.type].flee) this._scare(g, from || pos);
      else if (g.state !== 'alert' && g.state !== 'berserk') this._investigate(g, from || pos, 7);
    }
  }

  _brave(g) {
    // Courage in numbers: a juggernaut / bulwark nearby, or two other scavs.
    let scavs = 0;
    for (const o of this.guards) {
      if (o === g || o.state === 'dead' || o.state === 'flee') continue;
      const d = Math.hypot(o.x - g.x, o.z - g.z);
      if (d < 18 && o.type !== 'scav') return true;
      if (d < 10 && o.type === 'scav') scavs++;
    }
    return scavs >= 2;
  }

  _scare(g, from, force = false) {
    if (!TYPES[g.type].flee || g.state === 'dead' || g.state === 'flee') return;
    if (!force && this._brave(g)) { if (g.state !== 'alert') this._alert(g, null, { x: from.x, z: from.z }); return; }
    g.state = 'flee';
    g.fleeT = 6 + this.rng() * 3;
    g.fleeFrom = { x: from.x, z: from.z };
    g.path = null;
    g.leader = null;
    this.emit({ t: 'bark', k: 'flee', id: g.id });
    // The shriek carries: others nearby come to look.
    this.noise({ x: g.x, y: g.y, z: g.z }, 20, false);
  }

  // ---- damage --------------------------------------------------------------------
  // `part` is the hit location; a headshot kills anything outright, with any weapon.
  // Returns { killed, absorbed, popped }.
  damage(id, dmg, how, from, part) {
    const e = this.byId(id);
    const out = { killed: false, absorbed: 0, popped: false };
    if (!e || e.hp <= 0) return out;
    if (e.kind === 'g') {
      const sure = how === 'takedown' || how === 'ai' || how === 'exec';
      const head = part === 'head' || sure;
      // A helmet eats the first headshot: it flies off and the wearer reels — take the follow-up.
      if (part === 'head' && !sure && e.helmet) {
        e.helmet = false;
        e.stagger = 1.4;
        out.helmet = true;
        this.emit({ t: 'fx', k: 'helmet', id });
        if (from) this._alert(e, null, { x: from.x, z: from.z, y: from.y });
        return out;
      }
      if (!head && TYPES[e.type].armor) dmg *= TYPES[e.type].armor;
      if (!head && e.shield > 0) {
        const s = Math.min(e.shield, dmg);
        e.shield -= s;
        dmg -= s;
        out.absorbed = s;
        e.hitFx = 1;
        if (e.shield <= 0) { out.popped = true; this.emit({ t: 'fx', k: 'pop', id }); }
        else this.emit({ t: 'fx', k: 'shield', id });
      }
      if (e.maxShield) e.shieldT = 4;
      e.hp -= head ? e.hp : dmg;
      if (e.hp <= 0) {
        e.state = 'dead';
        e.hp = 0;
        e.fallT = 0;
        e.body = true;
        e.diedAt = this.t;
        e.target = null;
        e.aiming = null;
        // A body-shot drop leaves them down but alive: out of the fight until someone finishes it.
        e.incap = e.kind === 'g' && part !== 'head' && how !== 'takedown' && how !== 'execute';
        if (how === 'takedown') this.stats.takedowns++; else this.stats.kills++;
        if (part === 'head') this.stats.heads++;
        this.emit({ t: 'kill', id, how, chief: e.chief });
        // Anyone who saw it drop goes to check the body (and then radios it in).
        for (const o of this.guards) {
          if (o === e || o.state === 'dead' || o.tower || o.type === 'scav' || o.state === 'alert' || o.state === 'berserk') continue;
          const d = Math.hypot(o.x - e.x, o.z - e.z);
          if (d > 32 || Math.abs((o.y || 0) - (e.y || 0)) > 2) continue;
          if (this.fac.los({ x: o.x, y: o.y + EYE, z: o.z }, { x: e.x, y: (e.y || 0) + 1, z: e.z })) { e.found = true; this._checkBody(o, e); }
        }
        // The squad reacts: scavs panic, juggernauts lose their temper.
        for (const o of this.guards) {
          if (o === e || o.state === 'dead') continue;
          const d = Math.hypot(o.x - e.x, o.z - e.z);
          if (d > 14) continue;
          if (o.type === 'scav') this._scare(o, from || e, o.leader === e.id); // lose the leader, lose your nerve
          else if (TYPES[o.type].berserk && (e.type === 'jugg' || e.type === 'overseer' || o.id === e.leader || e.leader === o.id)) o.enraged = true;
        }
        return { ...out, killed: true };
      }
      if (e.type === 'scav') this._scare(e, from || e);
      else if (from) this._alert(e, null, { x: from.x, z: from.z });
      return out;
    }
    if (e.kind === 'd') {
      e.hp -= dmg;
      if (e.hp <= 0) {
        e.state = 'dead';
        e.hp = 0;
        e.fallV = 0;
        e.respawnT = this.alarm >= 1 ? 25 : 60;
        this.stats.drones++;
        this.emit({ t: 'kill', id, how, drone: true });
        return { ...out, killed: true };
      }
      e.state = 'hunt';
      e.huntT = 8;
      if (from) e.lkp = { x: from.x, z: from.z };
    }
    return out;
  }

  // EMP: drones fall, cameras blink out, shells collapse and bulwark walls flicker off.
  emp(x, z, r) {
    for (const d of this.drones) if (Math.hypot(d.x - x, d.z - z) < r + 6) d.empT = 7;
    for (const c of this.cams) if (Math.hypot(c.x - x, c.z - z) < r) c.empT = 7;
    for (const g of this.guards) {
      if (g.state === 'dead' || Math.hypot(g.x - x, g.z - z) > r) continue;
      g.empT = 6;
      if (g.shield > 0) { g.shield = 0; g.shieldT = 6; this.emit({ t: 'fx', k: 'pop', id: g.id }); }
      if (g.state !== 'alert' && g.state !== 'berserk') this._investigate(g, { x, z }, 6);
    }
  }

  _alert(g, target, lkp) {
    if (g.state === 'dead' || g.state === 'flee') return;
    const was = g.state;
    g.sweepRoom = null;
    if (g.state !== 'berserk') g.state = 'alert';
    g.aw = 1;
    if (target) g.target = target;
    if (lkp) g.lkp = { ...lkp };
    g.searchT = 8 + this.rng() * 8;
    g.path = null;
    if (was !== 'alert' && was !== 'berserk') {
      g.reactT = 0.3 + this.rng() * 0.3;
      // Juggernauts roar and bulwarks screech (heard nearby); everybody but a scav radios it in.
      if (g.type === 'jugg' || g.type === 'overseer') { this.emit({ t: 'bark', k: 'jugg', id: g.id }); this.noise({ x: g.x, y: g.y, z: g.z }, 30, true); }
      else if (g.type === 'bulwark') this.emit({ t: 'bark', k: 'bulwark', id: g.id });
      else if (g.type === 'scav') { this.emit({ t: 'bark', k: 'scav', id: g.id }); this.noise({ x: g.x, y: g.y, z: g.z }, 22, true); }
      if (g.jamT <= 0 && (g.type !== 'scav' || g.picket) && !this.commsDown) g.radioT = g.picket ? 2.6 : 1.5;
    }
  }

  // Finish a downed (incapacitated) enemy.
  confirm(id) {
    const e = this.byId(id);
    if (!e || !e.incap) return false;
    e.incap = false;
    return true;
  }

  // Walk to a body, look it over, then get on the radio (which brings backup unless the
  // radio is jammed, the comms rack is hacked, or he's dropped before he finishes).
  _checkBody(g, b) {
    if (g.state === 'alert' || g.state === 'berserk') return;
    g.state = 'search';
    g.aw = Math.max(g.aw, 0.6);
    g.bodyCheck = { x: b.x, z: b.z, y: b.y || 0 };
    g.lkp = { ...g.bodyCheck };
    g.searchT = 25;
    g.path = null;
  }
  // A light was shot out: guards who could see it, or share its room, go and look.
  lightOut(at) {
    const room = this.fac.roomAt(at.x, at.z, (at.y || 0) - 2);
    for (const g of this.guards) {
      if (g.state === 'dead' || g.tower || g.state === 'alert' || g.state === 'berserk' || g.state === 'flee') continue;
      const d = Math.hypot(g.x - at.x, g.z - at.z);
      if (d > 28) continue;
      const same = room && this.fac.roomAt(g.x, g.z, g.y) === room;
      if (same || this.fac.los({ x: g.x, y: g.y + EYE, z: g.z }, at)) this._investigate(g, { x: at.x, z: at.z, y: room ? room.y0 || 0 : g.y }, 12);
    }
  }

  // In-person hacks from the building's rooms.
  cutComms() {
    this.commsDown = true;
    for (const g of this.guards) g.radioT = 0;
  }
  cutCctv() {
    this.cctvDown = true;
    for (const c of this.cams) { c.hacked = true; c.aw = 0; c.confirmed = false; }
  }

  // ICE: a botched upload. SENTINEL doesn't know who or where, so it rings the building:
  // guards take posts around the outside walls and sweep, a fireteam joins them, and the
  // ones already inside search their floors. Sneak out between them, or fight through.
  iceAlert(B) {
    this.ice = true;
    this.raise(0.6, null);
    this.emit({ t: 'toast', m: 'SENTINEL ICE: intrusion countermeasure. Guards are ringing the building.', c: 'red' });
    const m = 7;
    const ring = [];
    for (let i = 0; i < 4; i++) {
      const f = (i + 0.5) / 4;
      ring.push({ x: B.x0 + (B.x1 - B.x0) * f, z: B.z1 + m }, { x: B.x0 + (B.x1 - B.x0) * f, z: B.z0 - m });
    }
    for (let i = 0; i < 3; i++) { const f = (i + 0.5) / 3; ring.push({ x: B.x0 - m, z: B.z0 + (B.z1 - B.z0) * f }, { x: B.x1 + m, z: B.z0 + (B.z1 - B.z0) * f }); }
    const outside = this.guards.filter((g) => g.state !== 'dead' && !g.tower && !this.fac.insideBuilding(g.x, g.z, g.y));
    const inside = this.guards.filter((g) => g.state !== 'dead' && !g.tower && this.fac.insideBuilding(g.x, g.z, g.y));
    outside.sort((a, b) => Math.hypot(a.x, a.z + 20) - Math.hypot(b.x, b.z + 20));
    ring.forEach((p, i) => {
      const g = outside[i];
      if (g) this._icePost(g, p);
    });
    for (const g of inside) if (g.state !== 'alert' && g.state !== 'berserk') { g.state = 'search'; g.aw = Math.max(g.aw, 0.5); g.lkp = { x: g.x, z: g.z, y: g.y }; g.searchT = 40; g.path = null; }
    // A fireteam from the barracks fills the gaps in the ring.
    const s = SPOTS.barracks;
    for (let i = 0; i < (this.barracksDown ? 0 : 3); i++) {
      const p = ring[(outside.length + i) % ring.length];
      const g = this.spawnGuard({ type: this.mission === 'nightwatch' ? (i ? 'scav' : 'jugg') : 'guard', x: s.x + i - 1, z: s.z });
      this._icePost(g, p);
    }
  }
  // After the operators call it (quiet or loud), the ring starts piling into the building:
  // squads pulled off the cordon clear it room by room, ground floor first, then upstairs.
  sweepStart(plan) {
    const order = ['lobby', 'security', 'staging', 'electrical', 'corridor', 'mail', 'guard', 'plant', 'corridor2', 'offices', 'break', 'comms', 'storage', 'dhb', 'srv', 'arch'];
    this.sweep = { plan, t: 0, next: plan === 'loud' ? 4 : 8, squads: 0, rooms: order.map((id) => ROOMS.find((r) => r.id === id)).filter(Boolean) };
    // The cordon holds while they clear.
    for (const g of this.guards) if (g.icePost && g.state === 'search') g.searchT = 600;
  }
  _sweepTick(dt) {
    const W = this.sweep;
    if (!W) return;
    W.t += dt;
    W.next -= dt;
    const loud = W.plan === 'loud' || this.alarm >= 1;
    const max = loud ? 6 : 4;
    if (W.next > 0 || W.squads >= max) return;
    W.next = loud ? 9 : 15;
    const n = loud ? 3 : 2;
    const pool = this.guards.filter((g) => g.state !== 'dead' && !g.tower && !g.clear && g.icePost && g.state !== 'alert' && g.state !== 'berserk');
    if (!pool.length) return;
    const start = (W.squads * 3) % W.rooms.length;
    const rooms = W.rooms.slice(start).concat(W.rooms.slice(0, start));
    pool.sort((a, b) => Math.hypot(a.x, a.z + 2) - Math.hypot(b.x, b.z + 2));
    for (const g of pool.slice(0, n)) { g.clear = rooms; g.clearI = -1; g.icePost = null; g.searchT = 0; this._nextRoom(g); }
    W.squads++;
    this.emit({ t: 'sweep', n: Math.min(n, pool.length), squad: W.squads });
  }
  _nextRoom(g) {
    g.clearI = (g.clearI + 1) % g.clear.length;
    const r = g.clear[g.clearI];
    g.state = 'search';
    g.aw = Math.max(g.aw, 0.55);
    g.sweepRoom = r;
    g.inRoom = false;
    g.travelT = 0;
    g.sweepAt = null;
    g.lkp = { x: (r.x0 + r.x1) / 2, z: (r.z0 + r.z1) / 2, y: r.y0 || 0 };
    g.searchT = (this.sweep && this.sweep.plan === 'loud' ? 7 : 11) + Math.min(10, ((r.x1 - r.x0) * (r.z1 - r.z0)) / 90);
    g.path = null;
  }

  _icePost(g, p) {
    g.state = 'search';
    g.aw = Math.max(g.aw, 0.55);
    g.lkp = { x: p.x, z: p.z, y: 0 };
    g.icePost = { x: p.x, z: p.z };
    g.searchT = 70;
    g.path = null;
  }

  _investigate(g, pos, dur) {
    if (g.state === 'alert' || g.state === 'berserk' || g.state === 'dead' || g.state === 'flee') return;
    g.state = 'sus';
    g.lkp = { x: pos.x, z: pos.z, y: pos.y ?? g.y };
    g.searchT = dur;
    g.path = null;
  }

  // ---- sensing -------------------------------------------------------------------
  _vis(a, fromDist, flash) {
    let v = a.stance === 2 ? 0.45 : a.stance === 1 ? 0.7 : 1;
    if (!a.moving) v *= 0.8;
    if (a.sprinting) v *= 1.2;
    const light = flash ? 1 : this.fac.lightAt(a.pos.x, a.pos.y + 1, a.pos.z);
    v *= light < 0.35 ? 0.4 + light : 1;
    if (a.cloak) v *= a.cloakFlicker ? 0.6 : 0.14;
    if (a.light) v = Math.max(v, 0.9) * 1.4; // a lit weapon light gives you away
    return v;
  }

  _canSee(g, a, rangeMul = 1) {
    const T = TYPES[g.type];
    const ep = { x: g.x, y: g.y + EYE * T.scale, z: g.z };
    const tp = { x: a.pos.x, y: a.pos.y + (a.stance === 2 ? 0.35 : a.stance === 1 ? 0.95 : 1.4), z: a.pos.z };
    const dx = tp.x - ep.x, dz = tp.z - ep.z, d = Math.hypot(dx, dz);
    const alert = g.state === 'alert' || g.state === 'berserk';
    const base = (g.tower ? (g.type === 'bulwark' ? 70 : 58) : T.sight) * (alert ? 1.5 : 1) * rangeMul;
    const ang = Math.abs(angDiff(Math.atan2(-dx, -dz), g.yaw + g.look));
    const cone = alert ? 1.05 : 0.62;
    const flash = g.obj.userData.beam.visible && !g.tower && d < 13 && ang < 0.32 && !alert;
    const vis = this._vis(a, d, flash || (g.tower && d < 40));
    const range = base * (vis < 0.5 ? 0.55 : 1);
    if (d > range) return 0;
    if (d > 2.5 && ang > cone) return 0;
    if (a.cloak && !a.cloakFlicker && d > 4 && this.rng() < 0.6) return 0;
    if (!this.fac.los(ep, tp)) return 0;
    return vis * (1 - (d / range) * 0.5) * T.rate;
  }

  _lightSeen(g, a) {
    const L = a.light, ep = { x: g.x, y: g.y + EYE, z: g.z };
    // Beam straight at them.
    const dx = ep.x - L.x, dy = ep.y - L.y, dz = ep.z - L.z, d = Math.hypot(dx, dy, dz);
    if (d < 32 && (dx * L.dx + dy * L.dy + dz * L.dz) / d > 0.97 && this.fac.los(ep, L)) {
      g.aw = Math.min(1.2, g.aw + 0.35);
      g.lkp = { x: L.x, z: L.z, y: L.y - 1.5 };
      if (g.aw >= 1) this._alert(g, a.role, g.lkp);
      else if (g.state !== 'sus') this._investigate(g, { x: L.x, z: L.z, y: L.y - 1.5 }, 6);
      return;
    }
    // The spot on a wall or the ground: go and look (once every few seconds).
    if ((g.lightT || 0) > this.t) return;
    const h = L.hit;
    const sd = Math.hypot(h.x - g.x, h.z - g.z);
    if (sd > 35 || sd < 1.5) return;
    const ang = Math.abs(angDiff(Math.atan2(-(h.x - g.x), -(h.z - g.z)), g.yaw + g.look));
    if (ang > 1.0 || !this.fac.los(ep, h)) return;
    g.lightT = this.t + 3;
    this._investigate(g, { x: h.x, z: h.z, y: Math.max(0, h.y - 1) }, 7);
    this.emit({ t: 'bark', k: g.type === 'scav' ? 'scav' : g.type === 'bulwark' ? 'bulwark' : 'scav', id: g.id });
  }

  // ---- update (host) -------------------------------------------------------------
  update(dt, agents) {
    this.t += dt;
    this.agents = agents;
    if (!this.sim) return;
    if (!this.lockdown && this.t - this.lastRaise > 4) this.alarm = Math.max(0, this.alarm - 0.06 * this.D.alarmDecay * dt * (this.alarm >= 1 ? 0.35 : 1));
    if (this.lockdown) this.alarm = 1;
    this.lkpT = Math.max(0, this.lkpT - dt);
    this.spoofT = Math.max(0, this.spoofT - dt);
    this.scanT = Math.max(0, this.scanT - dt);
    for (const j of this.jams) j.t -= dt;
    this.jams = this.jams.filter((j) => j.t > 0);
    this._sense = (this._sense || 0) - dt;
    const senseNow = this._sense <= 0;
    if (senseNow) this._sense = 0.1;
    for (const g of this.guards) this._guard(g, dt, senseNow);
    for (const d of this.drones) this._drone(d, dt, senseNow);
    for (const c of this.cams) this._cam(c, dt, senseNow);
    this._reinforce(dt);
    this._sweepTick(dt);
    this._huntTick();
    this.guards = this.guards.filter((g) => {
      if (g.state === 'dead' && g.found && this.t - g.diedAt > 90) { this.scene.remove(g.obj); return false; }
      return true;
    });
  }

  // An enemy has eyes on an operator: refresh where SENTINEL thinks they are.
  _sighted(a) {
    const H = this.hunt[a.role];
    if (!H) return;
    H.seen = this.t;
    H.lkp = { x: a.pos.x, y: a.pos.y, z: a.pos.z, yaw: a.yaw || 0, st: a.stance || 0 };
    H.broke = false;
  }

  // Per operator: 'detected' (in sight now), 'hunted' (they're searching your last known
  // position — break line of sight and keep moving), or 'hidden'. Break contact for
  // 25 s and the hunt is called off.
  huntState(role) {
    const H = this.hunt[role];
    if (!H || !H.lkp) return 'hidden';
    const since = this.t - H.seen;
    if (since < 1.2) return 'detected';
    if (H.broke) return 'hidden';
    return 'hunted';
  }
  _huntTick() {
    for (const role of ['shooter', 'spotter']) {
      const H = this.hunt[role];
      if (!H.lkp || H.broke) continue;
      const since = this.t - H.seen;
      const hunters = this.guards.some((g) => (g.state === 'alert' || g.state === 'search' || g.state === 'berserk') && g.lkp && Math.hypot(g.lkp.x - H.lkp.x, g.lkp.z - H.lkp.z) < 30);
      if (since > 25 || (since > 6 && !hunters)) {
        H.broke = true;
        for (const g of this.guards) if ((g.state === 'alert' || g.state === 'search') && g.target === role) { g.state = 'search'; g.searchT = Math.min(g.searchT, 4); g.target = null; }
        this.emit({ t: 'toast', m: `${role === 'shooter' ? 'Shooter' : 'Spotter'} broke contact. They\u2019ve lost you.`, c: 'cyan' });
      }
    }
  }

  // A radio call brings a backup fireteam from outside the building, straight to the contact.
  _backup(lkp) {
    if (this.barracksDown) return;
    if (this.t - this.lastBackup < 30) return;
    this.lastBackup = this.t;
    const alive = this.guards.filter((g) => g.state !== 'dead').length;
    if (alive > this.garrison + 8) return;
    const spots = [SPOTS.barracks].filter((s) => !(this.agents || []).some((a) => a.alive && Math.hypot(a.pos.x - s.x, a.pos.z - s.z) < 14));
    const s = spots.sort((a, b) => Math.hypot(a.x - lkp.x, a.z - lkp.z) - Math.hypot(b.x - lkp.x, b.z - lkp.z))[0];
    if (!s) return;
    const hunt = { x: lkp.x, z: lkp.z, y: lkp.y || 0 };
    if (this.mission === 'nightwatch') {
      const lead = this.spawnGuard({ type: this.rng() < 0.5 ? 'titan' : 'jugg', x: s.x, z: s.z, hunt });
      for (const o of [[-3, 3.5], [3, 3.5]]) this.spawnGuard({ type: 'scav', x: s.x + o[0], z: s.z + o[1], leader: lead.id, off: o, hunt });
    } else for (let i = 0; i < 3; i++) this.spawnGuard({ x: s.x + i - 1, z: s.z, hunt });
    this.stats.backups++;
    this.emit({ t: 'toast', m: 'SENTINEL: backup requested \u2014 a fireteam is moving on your position.', c: 'red' });
    this.emit({ t: 'backup' });
  }

  _reinforce(dt) {
    const alive = this.guards.filter((g) => g.state !== 'dead' && !g.picket).length;
    const cap = this.garrison + (this.lockdown ? 6 : this.alarm >= 1 ? 3 : 0);
    const every = this.lockdown ? 9 : this.alarm >= 1 ? 14 : this.alarm > 0.3 ? 28 : 45;
    this.respawnT -= dt;
    if (this.respawnT <= 0) {
      this.respawnT = every;
      if (alive < cap) {
        // Out of the barracks door (unless it's hacked shut or blown, or an agent stands at it).
        const spots = this.barracksDown ? [] : [SPOTS.barracks].filter((s) => !(this.agents || []).some((a) => a.alive && Math.hypot(a.pos.x - s.x, a.pos.z - s.z) < 14));
        const s = spots[Math.floor(this.rng() * spots.length)];
        if (s) {
          const yard = [[-60, 46], [-20, 52], [22, 50], [60, 44], [72, 6], [44, -36], [-44, -36], [-44, 10], [0, 28], [30, 20], [-30, 18]];
          const pick = () => { const p = yard[Math.floor(this.rng() * yard.length)]; return { x: p[0], z: p[1] }; };
          const hunt = this.alarm >= 0.6 && this.lkp ? this.lkp : null;
          const route = [pick(), pick(), pick()];
          if (this.mission === 'nightwatch') {
            // A fresh pack: a juggernaut with scavs at heel (or a bulwark and a scav).
            const lead = this.spawnGuard({ type: this.rng() < 0.6 ? 'jugg' : 'bulwark', route, x: s.x, z: s.z, hunt });
            const offs = [[-3, 3.5], [3, 3.5]];
            const n = this.lockdown || this.alarm >= 1 ? 2 : 1;
            for (let i = 0; i < n && alive + 1 + i < cap; i++) this.spawnGuard({ type: 'scav', x: s.x + offs[i][0], z: s.z + offs[i][1], leader: lead.id, off: offs[i], hunt });
          } else this.spawnGuard({ route, x: s.x + (this.rng() - 0.5) * 2, z: s.z, hunt });
          this.emit({ t: 'toast', m: this.lockdown || this.alarm >= 1 ? 'SENTINEL: reinforcements deployed.' : 'Fresh patrol out of the barracks.', c: 'dim' });
        }
      }
    }
    for (const d of this.drones) {
      if (d.state !== 'dead' || d.respawnT === undefined || this.bayDown) continue;
      d.respawnT -= dt;
      if (d.respawnT <= 0) {
        const pad = SPOTS.dronePad;
        Object.assign(d, { x: pad.x, y: pad.y, z: pad.z, hp: DRONE_HP, state: this.alarm >= 1 ? 'hunt' : 'patrol', aw: 0, huntT: 10, respawnT: undefined });
        d.obj.visible = true;
        d.obj.rotation.set(0, 0, 0);
        this.emit({ t: 'toast', m: 'Patrol drone launched from the drone bay.', c: 'dim' });
      }
    }
  }

  _guardSpeed(g) {
    const s = TYPES[g.type].speed;
    if (g.state === 'berserk') return 6.8;
    if (g.state === 'flee') return s[3] * 1.3;
    return g.state === 'alert' ? s[3] : g.state === 'search' ? s[2] : g.state === 'sus' ? s[1] : s[0];
  }

  _moveTo(g, tx, tz, dt, speed, ty) {
    if (g.stagger > 0) { g.moving = false; return false; }
    if (ty === undefined) ty = g.y;
    g.pathT -= dt;
    if (g.free && g.z > 112 && tz > 112 && (!g.path || g.pathT <= 0 || !g.goal || Math.hypot(g.goal.x - tx, g.goal.z - tz) > 3)) { g.path = [{ x: tx, z: tz }]; g.goal = { x: tx, z: tz, y: ty }; g.pathT = 2.5; }
    if (!g.path || g.pathT <= 0 || !g.goal || Math.hypot(g.goal.x - tx, g.goal.z - tz, (g.goal.y - ty) * 2) > 3) {
      g.path = this.fac.path(g.x, g.z, tx, tz, g.y, ty);
      // Don't double back to the nearest node when the next one is straight ahead.
      const P = g.path;
      if (P.length > 2 && Math.abs((P[1].y ?? g.y) - g.y) < 1 && this.fac.walkable(g.x, g.z, P[1].x, P[1].z, 0.4, g.y)) P.shift();
      g.goal = { x: tx, z: tz, y: ty };
      g.pathT = 2.5;
    }
    let wp = g.path[0];
    while (wp && Math.hypot(wp.x - g.x, wp.z - g.z) < 0.7 && g.path.length > 1) { g.path.shift(); wp = g.path[0]; }
    if (!wp) return true;
    const dx = wp.x - g.x, dz = wp.z - g.z, d = Math.hypot(dx, dz);
    if (d < 0.6 && g.path.length <= 1) { g.moving = false; return true; }
    const want = Math.atan2(-dx, -dz);
    // Bulwarks keep their wall toward the threat while they move.
    if (!(g.type === 'bulwark' && g.state === 'alert' && g.faceTo)) g.yaw += angDiff(want, g.yaw) * Math.min(1, dt * 6);
    const step = Math.min(d, speed * dt);
    const p = { x: g.x + (dx / d) * step, y: g.y, z: g.z + (dz / d) * step };
    this._openDoorsNear(g);
    this.fac.resolveHorizontal(p, 0.32 * TYPES[g.type].scale, 1.7, 0.5);
    if (Math.hypot(p.x - g.x, p.z - g.z) < step * 0.2) g.stuck = (g.stuck || 0) + dt; else g.stuck = 0;
    if (g.stuck > 1.5) { g.path = null; g.stuck = 0; }
    g.x = p.x;
    g.z = p.z;
    g.y = this.fac.groundAt(g.x, g.z, g.y + 0.6, 0.6);
    g.moving = true;
    return false;
  }

  _openDoorsNear(g) {
    for (const d of Object.values(this.fac.doors)) {
      if (d.sealed) continue;
      if (Math.hypot(d.x - g.x, d.z - g.z) < 2.6) d.guardT = 2.5;
    }
  }

  // One shot (or bolt) at an agent. kinds: bullet (guards), plasma (scav/bulwark), heavy (jugg), beam (tower bulwark).
  _shoot(g, tgt, kind) {
    const d = Math.hypot(tgt.pos.x - g.x, tgt.pos.z - g.z);
    let p = this.D.guardAcc * clamp(1.15 - d / 70, 0.15, 1);
    if (kind === 'beam') p = 0.55 + this.D.guardAcc * 0.4;
    if (tgt.stance === 2) p *= 0.6; else if (tgt.stance === 1) p *= 0.8;
    if (tgt.moving) p *= kind === 'beam' ? 0.7 : 0.8;
    if (tgt.cloak) p *= 0.35;
    const base = { bullet: [9, 6], plasma: [7, 4], heavy: [11, 5], beam: [42, 10] }[kind];
    const dmg = Math.round((base[0] + this.rng() * base[1]) * this.D.guardDmg);
    const sc = TYPES[g.type].scale;
    this.emit({ t: 'eshot', id: g.id, a: [g.x, g.y + 1.35 * sc, g.z], b: [tgt.pos.x, tgt.pos.y + 1.1, tgt.pos.z], role: tgt.role, hit: this.rng() < p, dmg, k: kind });
    this.noise({ x: g.x, y: g.y, z: g.z }, kind === 'beam' ? 60 : 45, true);
  }

  _guard(g, dt, sense) {
    if (g.state === 'dead') return;
    const T = TYPES[g.type];
    g.jamT = Math.max(0, g.jamT - dt);
    g.empT = Math.max(0, g.empT - dt);
    g.tagT = Math.max(0, g.tagT - dt);
    g.scanT = Math.max(0, g.scanT - dt);
    g.lower = Math.max(0, g.lower - dt);
    g.hitFx = Math.max(0, g.hitFx - dt * 3);
    g.meleeT = Math.max(0, g.meleeT - dt);
    if (g.stagger > 0) { g.stagger -= dt; g.fireT = Math.max(g.fireT, 0.3); }
    // Shell recharge.
    if (g.maxShield) {
      if (g.shieldT > 0) g.shieldT -= dt;
      else if (g.empT <= 0) g.shield = Math.min(g.maxShield, g.shield + 60 * dt);
    }
    for (const j of this.jams) if (Math.hypot(j.x - g.x, j.z - g.z) < j.r) { if (g.jamT <= 0) g.radioT = 0; g.jamT = Math.max(g.jamT, 0.5); }
    g.moving = false;
    const agents = (this.agents || []).filter((a) => a.alive && !a.downed);
    g.blindT = Math.max(0, (g.blindT || 0) - dt);
    // Vision (not while a quickhack has his optics rebooting).
    if (sense && g.state !== 'flee' && !(g.blindT > 0)) {
      let best = null, bv = 0;
      for (const a of agents) {
        const v = this._canSee(g, a);
        if (v > bv) { bv = v; best = a; }
      }
      const fighting = g.state === 'alert' || g.state === 'berserk';
      if (best) {
        g.seenT = 0.6;
        g.aw = Math.min(1.2, g.aw + 2.4 * this.D.rate * bv * 0.1 * (fighting ? 3 : 1));
        g.lastSeen = { x: best.pos.x, z: best.pos.z };
        if (fighting) { g.target = best.role; g.lkp = { x: best.pos.x, z: best.pos.z, y: best.pos.y }; this.lkp = { ...g.lkp }; this.lkpT = 6; }
        if (fighting || g.aw >= 1) this._sighted(best);
        else if (g.aw >= 1) {
          this.stats.spotted++;
          this.lkp = { x: best.pos.x, z: best.pos.z, y: best.pos.y };
          this.lkpT = 6;
          this.emit({ t: 'spotted', id: g.id, role: best.role });
          // A lone scav that spots you panics instead of fighting.
          if (g.type === 'scav' && !this._brave(g)) this._scare(g, best.pos);
          else this._alert(g, best.role, { x: best.pos.x, z: best.pos.z, y: best.pos.y });
        } else if (g.aw >= 0.35 && g.state !== 'sus' && g.state !== 'search') this._investigate(g, best.pos, 6);
        else if (g.state === 'sus') g.lkp = { x: best.pos.x, z: best.pos.z, y: best.pos.y };
      } else {
        g.seenT = Math.max(0, g.seenT - 0.1);
        if (!fighting) g.aw = Math.max(0, g.aw - 0.4 * 0.1);
        if (g.aiming) { g.aiming = null; g.aimT = 0; }
      }
      // Weapon lights: the spot draws them over; the beam in the face gives you away.
      if (!fighting) for (const a of agents) if (a.light) this._lightSeen(g, a);
      // Bodies.
      if (!fighting) for (const b of this.guards) {
        if (b.state !== 'dead' || b.found || b === g) continue;
        const d = Math.hypot(b.x - g.x, b.z - g.z);
        if (d > 18) continue;
        const ang = Math.abs(angDiff(Math.atan2(-(b.x - g.x), -(b.z - g.z)), g.yaw + g.look));
        if (ang > 0.9 && d > 3) continue;
        const lit = this.fac.lightAt(b.x, 0.5, b.z) > 0.35 || d < 9;
        if (!lit || !this.fac.los({ x: g.x, y: g.y + EYE, z: g.z }, { x: b.x, y: b.y + 0.3, z: b.z })) continue;
        b.found = true;
        if (g.type === 'scav') this._scare(g, b);
        else this._checkBody(g, b);
        this.emit({ t: 'toast', m: b.chief ? 'They found the Overseer’s body.' : 'A body has been found.', c: 'amber' });
        break;
      }
      const q = this.quad;
      if (q && q.alive) {
        const d = Math.hypot(q.x - g.x, q.y - g.y - EYE, q.z - g.z);
        const ang = Math.abs(angDiff(Math.atan2(-(q.x - g.x), -(q.z - g.z)), g.yaw + g.look));
        if (d < 28 && (ang < 0.9 || d < 8) && this.fac.los({ x: g.x, y: g.y + EYE, z: g.z }, q)) g.quadAw = Math.min(1, g.quadAw + 0.1 * (d < 10 ? 1.6 : 0.8));
        // Rotor noise: close enough and they hear it through walls and behind them.
        else if (d < 10 && Math.abs(q.y - g.y) < 5) g.quadAw = Math.min(1, g.quadAw + 0.035);
        else g.quadAw = Math.max(0, g.quadAw - 0.03);
      }
    }
    // Radio call: the alarm only goes up if it gets the call off.
    if (g.radioT > 0) {
      g.radioT -= dt;
      if (g.radioT <= 0 && g.jamT <= 0 && !this.commsDown) {
        this.raise(0.5, 'SENTINEL: a contact has been radioed in.');
        this._backup(g.lkp || { x: g.x, z: g.z, y: g.y });
        for (const o of this.guards) if (o !== g && o.state !== 'dead' && o.state !== 'alert' && o.state !== 'berserk' && o.state !== 'flee' && Math.hypot(o.x - g.x, o.z - g.z) < 34) { o.convergeT = 0.4 + this.rng() * 0.7; o.convergeAt = { ...(g.lkp || { x: g.x, z: g.z }) }; }
      }
    }
    if (g.convergeT > 0) { g.convergeT -= dt; if (g.convergeT <= 0) this._alert(g, null, g.convergeAt); }
    g.reactT = Math.max(0, g.reactT - dt);

    // Berserk trigger: shell broken and hurt, a pack-mate dead, or you're right there.
    if (T.berserk && g.state === 'alert') {
      const tgt = g.target && agents.find((a) => a.role === g.target);
      const close = tgt && Math.hypot(tgt.pos.x - g.x, tgt.pos.z - g.z) < 11 && g.seenT > 0;
      if (g.enraged || close || (g.shield <= 0 && g.hp < g.maxHp * 0.7)) {
        g.state = 'berserk';
        g.berserkT = 6;
        g.path = null;
        this.emit({ t: 'bark', k: 'jugg', id: g.id });
        this.noise({ x: g.x, y: g.y, z: g.z }, 40, true);
      }
    }

    // Behaviour.
    if (g.state === 'patrol' && g.leader) {
      // Pack member: keep formation on the leader; if it dies, break.
      const L = this.guards.find((o) => o.id === g.leader);
      if (!L || L.state === 'dead') { g.leader = null; this._scare(g, L || g, true); }
      else if (L.state === 'patrol' || L.state === 'post') {
        const cs = Math.cos(L.yaw), sn = Math.sin(L.yaw), o = g.off || [0, 2];
        const tx = L.x + o[0] * cs + o[1] * sn, tz = L.z - o[0] * sn + o[1] * cs;
        if (Math.hypot(tx - g.x, tz - g.z) > 0.8) this._moveTo(g, tx, tz, dt, this._guardSpeed(L) * 1.25, L.y);
        else { g.yaw += angDiff(L.yaw, g.yaw) * Math.min(1, dt * 3); g.look = Math.sin(this.t * 0.9 + g.id) * 0.7; }
      } else if (L.lkp) this._alert(g, L.target, L.lkp);
    } else if (g.state === 'patrol' && g.route) {
      if (g.wait > 0) {
        g.wait -= dt;
        g.look = Math.sin((g.wait) * 2.2) * 0.9;
      } else {
        g.look *= 0.9;
        const wp = g.route[g.ri % g.route.length];
        if (this._moveTo(g, wp.x, wp.z, dt, this._guardSpeed(g), wp.y)) {
          g.ri++;
          g.wait = 0.6 + this.rng() * 1.6;
          g.path = null;
        }
      }
    } else if (g.state === 'patrol') {
      g.look = Math.sin(this.t * 0.4 + g.id) * 0.9;
    } else if (g.state === 'post') {
      const p = g.post;
      if (Math.hypot(p.x - g.x, p.z - g.z) > 1) this._moveTo(g, p.x, p.z, dt, 1.6, p.y || g.y);
      else { g.yaw += angDiff(p.face, g.yaw) * Math.min(1, dt * 2); g.look = Math.sin(this.t * 0.35 + g.id) * p.sweep; }
    } else if (g.state === 'flee') {
      // Run away from the threat, shrieking; tell the first brave ally it meets.
      g.fleeT -= dt;
      const f = g.fleeFrom || g;
      let ax = g.x - f.x, az = g.z - f.z;
      const L = Math.hypot(ax, az) || 1;
      ax /= L; az /= L;
      if (!g.fleeGoal || g.fleeT % 2 < dt) g.fleeGoal = { x: clamp(g.x + ax * 14 + (this.rng() - 0.5) * 6, -150, 150), z: clamp(g.z + az * 14 + (this.rng() - 0.5) * 6, -130, 90) };
      this._moveTo(g, g.fleeGoal.x, g.fleeGoal.z, dt, this._guardSpeed(g));
      for (const o of this.guards) {
        if (o === g || o.state === 'dead' || o.state === 'flee' || o.state === 'alert' || o.state === 'berserk') continue;
        if (Math.hypot(o.x - g.x, o.z - g.z) < 8) { this._alert(o, null, { x: f.x, z: f.z }); break; }
      }
      if (g.fleeT <= 0) { g.state = 'search'; g.lkp = { x: g.x, z: g.z }; g.searchT = 5; g.aw = 0.5; }
    } else if (g.state === 'sus' || g.state === 'search') {
      // Checking a body: once there, crouch over it a moment and get on the radio.
      if (g.bodyCheck && Math.hypot(g.bodyCheck.x - g.x, g.bodyCheck.z - g.z) < 2.2) {
        g.bodyCheck = null;
        g.lkp = { x: g.x, z: g.z, y: g.y };
        g.searchT = 14;
        if (g.jamT <= 0 && !this.commsDown) { g.radioT = 4; this.emit({ t: 'toast', m: 'A guard is radioing in a body \u2014 drop him or jam him.', c: 'amber' }); }
      }
      // A clearing squad's room clock only starts once it's actually in the room.
      if (g.sweepRoom && !g.inRoom) {
        g.travelT = (g.travelT || 0) + dt;
        const r = this.fac.roomAt(g.x, g.z, g.y);
        if ((r && r.id === g.sweepRoom.id) || g.travelT > 50) g.inRoom = true;
      } else g.searchT -= dt;
      if (g.lkp && this._moveTo(g, g.lkp.x, g.lkp.z, dt, this._guardSpeed(g), g.lkp.y)) {
        g.look = Math.sin(this.t * 1.6 + g.id) * 1.2;
        if (g.state === 'search' && g.searchT > 2) {
          const c0 = g.icePost || g.lkp, sw = g.icePost ? 7 : 12, R = g.sweepRoom;
          if (!g.sweepAt || Math.hypot(g.sweepAt.x - g.x, g.sweepAt.z - g.z) < 1) g.sweepAt = R ? { x: R.x0 + 1.5 + this.rng() * (R.x1 - R.x0 - 3), z: R.z0 + 1.5 + this.rng() * (R.z1 - R.z0 - 3), y: R.y0 || 0 } : { x: c0.x + (this.rng() - 0.5) * sw, z: c0.z + (this.rng() - 0.5) * sw, y: g.lkp.y };
          g.lkp = g.sweepAt;
        }
      }
      if (g.searchT <= 0 && g.clear) this._nextRoom(g);
      else if (g.searchT <= 0) { g.state = g.post ? 'post' : 'patrol'; g.aw = 0; g.look = 0; g.path = null; }
    } else if (g.state === 'berserk') {
      // Charge with the blade. No shooting; melee lunge in reach.
      const tgt = (g.target && agents.find((a) => a.role === g.target)) || agents.slice().sort((a, b) => Math.hypot(a.pos.x - g.x, a.pos.z - g.z) - Math.hypot(b.pos.x - g.x, b.pos.z - g.z))[0];
      g.look = 0;
      if (tgt) {
        const d = Math.hypot(tgt.pos.x - g.x, tgt.pos.z - g.z);
        const seen = g.seenT > 0 || d < 6;
        if (seen) { g.lkp = { x: tgt.pos.x, z: tgt.pos.z, y: tgt.pos.y }; g.berserkT = 6; g.target = tgt.role; }
        else g.berserkT -= dt;
        if (d > 2.0) this._moveTo(g, g.lkp ? g.lkp.x : tgt.pos.x, g.lkp ? g.lkp.z : tgt.pos.z, dt, this._guardSpeed(g), g.lkp ? g.lkp.y : tgt.pos.y);
        else g.yaw += angDiff(Math.atan2(-(tgt.pos.x - g.x), -(tgt.pos.z - g.z)), g.yaw) * Math.min(1, dt * 10);
        if (d < 2.5 && g.meleeT <= 0 && Math.abs(tgt.pos.y - g.y) < 1.5 && g.jamT <= 0) {
          g.meleeT = 1.3;
          this.emit({ t: 'emelee', id: g.id, role: tgt.role, dmg: Math.round(70 * this.D.guardDmg), a: [g.x, g.y + 1.2, g.z] });
        }
        if (g.berserkT <= 0) { g.state = 'search'; g.searchT = 10; g.enraged = false; }
      } else { g.state = 'search'; g.searchT = 8; g.enraged = false; }
    } else if (g.state === 'alert') {
      const tgt = g.target && agents.find((a) => a.role === g.target);
      const sees = tgt && g.seenT > 0 && this._canSee(g, tgt, 1.2) > 0;
      if (sees) {
        const dx = tgt.pos.x - g.x, dz = tgt.pos.z - g.z;
        g.faceTo = true;
        g.yaw += angDiff(Math.atan2(-dx, -dz), g.yaw) * Math.min(1, dt * (g.type === 'bulwark' ? 10 : 8));
        g.look = 0;
        g.fireT -= dt;
        const d = Math.hypot(dx, dz);
        const kind = g.type === 'guard' ? 'bullet' : g.type === 'scav' ? 'plasma' : g.type === 'bulwark' ? (g.tower ? 'beam' : 'plasma') : 'heavy';
        if (g.type === 'titan' && d < 40 && !g.post) this._moveTo(g, tgt.pos.x, tgt.pos.z, dt, 1.0, tgt.pos.y); // titans walk at you
        // Close the distance (bulwarks hold theirs, side-stepping behind the wall).
        if (!g.post && !g.tower) {
          if (g.type === 'bulwark') { const sx = Math.cos(this.t * 0.7 + g.id) * 6; this._moveTo(g, g.x + dz / d * sx * 0.2, g.z - dx / d * sx * 0.2, dt, 1.4); }
          else if (d > (g.type === 'scav' ? 14 : 20)) this._moveTo(g, tgt.pos.x, tgt.pos.z, dt, this._guardSpeed(g) * 0.5, tgt.pos.y);
        }
        const ready = g.reactT <= 0 && g.jamT <= 0 && g.empT <= 0 && !(g.stagger > 0);
        if (kind === 'beam') {
          // Tower sniper: a laser you can see for 1.6 s, then the beam.
          if (ready && d < 260) {
            if (!g.aiming) { g.aiming = tgt.role; g.aimT = 0; this.emit({ t: 'laser', id: g.id }); }
            g.aimT += dt;
            g.lower = 0.3;
            if (g.aimT >= 1.6) { this._shoot(g, tgt, 'beam'); g.aiming = null; g.aimT = -2.4; }
          }
        } else if (kind === 'heavy') {
          if (g.fireT <= 0 && ready && d < 70) {
            g.burst = (g.burst || 0) + 1;
            this._shoot(g, tgt, 'heavy');
            if (g.burst >= 3) { g.burst = 0; g.fireT = 1.5 + this.rng() * 0.5; } else g.fireT = 0.16;
          }
        } else if (g.fireT <= 0 && ready && d < 75) {
          g.fireT = kind === 'plasma' ? 0.55 + this.rng() * 0.35 : 0.42 + this.rng() * 0.3;
          if (g.type === 'bulwark') g.lower = 0.55; // the wall swings aside to fire
          this._shoot(g, tgt, kind);
        }
      } else if (g.tower) {
        g.faceTo = false;
        if (g.lkp) g.yaw += angDiff(Math.atan2(-(g.lkp.x - g.x), -(g.lkp.z - g.z)), g.yaw) * Math.min(1, dt * 3);
        g.look = Math.sin(this.t * 1.3 + g.id) * 0.5;
        g.searchT -= dt;
        g.aiming = null;
        if (g.searchT <= 0) { g.state = 'post'; g.aw = 0; }
      } else if (this.quad && this.quad.alive && g.quadAw >= 1 && g.jamT <= 0) {
        const q = this.quad;
        g.yaw += angDiff(Math.atan2(-(q.x - g.x), -(q.z - g.z)), g.yaw) * Math.min(1, dt * 8);
        g.fireT -= dt;
        if (g.fireT <= 0) {
          g.fireT = 0.5 + this.rng() * 0.3;
          this.emit({ t: 'eshot', id: g.id, a: [g.x, g.y + 1.35, g.z], b: [q.x, q.y, q.z], role: 'quad', hit: this.rng() < 0.55, dmg: 8, k: g.type === 'guard' ? 'bullet' : 'plasma' });
        }
      } else {
        g.faceTo = false;
        g.searchT -= dt;
        if (g.lkp && this._moveTo(g, g.lkp.x, g.lkp.z, dt, this._guardSpeed(g), g.lkp.y)) { g.state = 'search'; g.searchT = 8 + this.rng() * 6; }
        if (g.searchT <= 0) { g.state = 'search'; g.searchT = 8; }
      }
    }
    if (g.quadAw >= 1 && g.state !== 'alert' && g.state !== 'berserk' && g.state !== 'dead' && g.state !== 'flee' && this.quad && this.quad.alive) {
      this._alert(g, null, { x: this.quad.x, z: this.quad.z });
      this.raise(0.05);
    }
  }

  _drone(d, dt, sense) {
    d.tagT = Math.max(0, d.tagT - dt);
    d.scanT = Math.max(0, d.scanT - dt);
    if (d.state === 'dead') {
      if (d.y > this.fac.heightAt(d.x, d.z) + 0.2) { d.fallV += 12 * dt; d.y = Math.max(this.fac.groundAt(d.x, d.z, d.y, 0.3) + 0.15, d.y - d.fallV * dt); }
      return;
    }
    if (d.empT > 0) { d.empT -= dt; d.y = Math.max(this.fac.heightAt(d.x, d.z) + 2, d.y - 2 * dt); return; }
    const agents = (this.agents || []).filter((a) => a.alive && !a.downed);
    if (this.alarm >= 1 && d.state === 'patrol' && this.lkp) { d.state = 'hunt'; d.lkp = { ...this.lkp }; d.huntT = 12; }
    let tx, tz;
    if (d.state === 'hunt' && d.lkp) { tx = d.lkp.x; tz = d.lkp.z; d.huntT -= dt; if (d.huntT <= 0 && d.aw < 1) d.state = 'patrol'; }
    else { const wp = d.route[d.ri % d.route.length]; tx = wp.x; tz = wp.z; if (Math.hypot(tx - d.x, tz - d.z) < 3) d.ri++; }
    const speed = d.state === 'hunt' ? 10 : 6;
    const dx = tx - d.x, dz = tz - d.z, dist = Math.hypot(dx, dz);
    if (dist > 1.5) {
      d.x += (dx / dist) * Math.min(dist, speed * dt);
      d.z += (dz / dist) * Math.min(dist, speed * dt);
      d.yaw += angDiff(Math.atan2(-dx, -dz), d.yaw) * Math.min(1, dt * 3);
    } else d.yaw += dt * 0.8;
    const floor = Math.max(this.fac.heightAt(d.x, d.z), this.fac.insideBuilding(d.x, d.z) ? 8.6 : 0);
    d.y += (floor + d.alt - d.y) * Math.min(1, dt * 1.5);
    if (sense) {
      let best = null, bv = 0;
      const range = d.state === 'hunt' ? 30 : 22;
      for (const a of agents) {
        const tp = { x: a.pos.x, y: a.pos.y + 1, z: a.pos.z };
        const r = range * (a.cloak && !a.cloakFlicker ? 0.35 : 1);
        const dd = Math.hypot(tp.x - d.x, tp.y - d.y, tp.z - d.z);
        if (dd > r || !this.fac.los(d, tp)) continue;
        const v = 1 - dd / r;
        if (v > bv) { bv = v; best = a; }
      }
      if (best) {
        d.aw = Math.min(1.3, d.aw + 2 * 0.1 * (0.4 + bv));
        d.lkp = { x: best.pos.x, z: best.pos.z };
        if (d.aw >= 1) {
          if (d.state !== 'hunt' || !d.locked) this.emit({ t: 'toast', m: 'Drone has a lock on ' + (best.role === 'shooter' ? 'the shooter' : 'the spotter') + '!', c: 'red' });
          d.state = 'hunt';
          d.locked = true;
          d.huntT = 10;
          this.raise(0.02);
          this.lkp = { ...d.lkp };
          this.lkpT = 6;
          for (const g of this.guards) if (g.state !== 'dead' && g.state !== 'alert' && g.state !== 'berserk' && Math.hypot(g.x - d.x, g.z - d.z) < 45) this._alert(g, null, d.lkp);
          d.zapT -= 0.1;
          const dd = Math.hypot(best.pos.x - d.x, best.pos.z - d.z);
          if (d.zapT <= 0 && dd < 20) {
            d.zapT = 0.7 + this.rng() * 0.35;
            this.emit({ t: 'eshot', id: d.id, a: [d.x, d.y - 0.2, d.z], b: [best.pos.x, best.pos.y + 1, best.pos.z], role: best.role, hit: this.rng() < (best.cloak ? 0.45 : 0.8), dmg: Math.round((4 + this.rng() * 5) * this.D.guardDmg), k: 'zap' });
          }
        }
      } else {
        d.locked = false;
        d.aw = Math.max(0, d.aw - 0.03);
      }
    }
  }

  _cam(c, dt, sense) {
    c.loopT = Math.max(0, c.loopT - dt);
    c.empT = Math.max(0, c.empT - dt);
    c.yaw = c.base + Math.sin(this.t * 0.4 + c.phase) * c.sweep;
    const blind = c.loopT > 0 || c.empT > 0 || this.spoofT > 0 || this.cctvDown;
    if (!sense || blind) { if (blind) c.aw = Math.max(0, c.aw - 0.05); return; }
    let seen = null;
    for (const a of (this.agents || [])) {
      if (!a.alive || a.downed) continue;
      const tp = { x: a.pos.x, y: a.pos.y + 1, z: a.pos.z };
      const dx = tp.x - c.x, dz = tp.z - c.z, d = Math.hypot(dx, dz);
      let r = c.range * (a.cloak && !a.cloakFlicker ? 0.3 : 1);
      if (this.fac.lightAt(tp.x, tp.y, tp.z) < 0.35) r *= 0.5;
      if (d > r) continue;
      if (Math.abs(angDiff(Math.atan2(-dx, -dz), c.yaw)) > 0.5) continue;
      if (!this.fac.los(c, tp)) continue;
      seen = a;
      break;
    }
    if (seen) {
      c.aw = Math.min(1.5, c.aw + 0.1 / 1.1);
      if (c.aw >= 1) {
        if (!c.confirmed) { c.confirmed = true; this.emit({ t: 'toast', m: 'Camera has eyes on ' + (seen.role === 'shooter' ? 'the shooter' : 'the spotter') + '!', c: 'red' }); }
        this.raise(0.03);
        this.lkp = { x: seen.pos.x, z: seen.pos.z };
        this.lkpT = 6;
        for (const g of this.guards) if (g.state !== 'dead' && g.state !== 'alert' && g.state !== 'berserk' && Math.hypot(g.x - c.x, g.z - c.z) < 34) { g.convergeT = 0.4; g.convergeAt = { ...this.lkp }; }
      }
    } else { c.aw = Math.max(0, c.aw - 0.05); c.confirmed = false; }
  }

  // ---- intel ---------------------------------------------------------------------
  revealed(e, access, extra) {
    if (e.state === 'dead' && e.kind === 'g') return true;
    // The console's pulse scan only hears electronics; people need a tag, the quad or ISR.
    if (e.tagT > 0 || (this.scanT > 0 && e.kind !== 'g')) return true;
    const zone = this.fac.zoneAt(e.x, e.z);
    const tier = zone === 'out' ? 0 : zone === 'yard' ? 1 : zone === 'floor' ? 2 : 3;
    if (access >= tier) return true;
    for (const c of this.cams) {
      if (!c.hacked) continue;
      const dx = e.x - c.x, dz = e.z - c.z, d = Math.hypot(dx, dz);
      if (d < c.range && Math.abs(angDiff(Math.atan2(-dx, -dz), c.yaw)) < 0.55 && this.fac.los(c, { x: e.x, y: (e.y || 0) + 1.2, z: e.z })) return true;
    }
    if (extra && extra(e)) return true;
    return false;
  }

  // ---- networking ----------------------------------------------------------------
  snap() {
    const r1 = (v) => Math.round(v * 10) / 10, r2 = (v) => Math.round(v * 100) / 100;
    return {
      g: this.guards.map((g) => [g.id, r1(g.x), r1(g.y), r1(g.z), r2(g.yaw + g.look), STATES.indexOf(g.state), r2(clamp(g.aw, 0, 1)),
        (g.chief ? 1 : 0) | (g.badge ? 2 : 0) | (g.found ? 4 : 0) | (g.moving ? 8 : 0) | (g.tower ? 16 : 0) | (g.lower > 0 ? 32 : 0) | (g.empT > 0 ? 64 : 0) | (g.helmet ? 128 : 0) | (g.radioT > 0 ? 256 : 0) | (g.sync ? 512 : 0) | (g.stagger > 0 ? 1024 : 0) | (g.incap ? 2048 : 0),
        Math.ceil(g.tagT), Math.ceil(g.scanT), g.rev ? 1 : 0, TYPE_KEYS.indexOf(g.type), g.maxShield ? Math.round((g.shield / g.maxShield) * 100) : 0, g.aiming ? (g.aiming === 'shooter' ? 1 : 2) : 0]),
      d: this.drones.map((d) => [d.id, r1(d.x), r1(d.y), r1(d.z), r2(d.yaw), d.state === 'dead' ? 2 : d.state === 'hunt' ? 1 : 0, r2(clamp(d.aw, 0, 1)), d.empT > 0 ? 1 : 0, Math.ceil(d.tagT), d.rev ? 1 : 0]),
      c: this.cams.map((c) => [c.id, r2(c.yaw), (c.hacked ? 1 : 0) | (c.loopT > 0 ? 2 : 0) | (c.empT > 0 ? 4 : 0), r2(clamp(c.aw, 0, 1))]),
      al: r2(this.alarm), pk: r2(this.alarmPeak), ld: this.lockdown ? 1 : 0, lkp: this.lkpT > 0 && this.lkp ? [r1(this.lkp.x), r1(this.lkp.z)] : null, sp: Math.ceil(this.spoofT), sc: Math.ceil(this.scanT),
      st: this.stats,
      hn: Object.fromEntries(['shooter', 'spotter'].map((r) => { const H = this.hunt[r]; return [r, H.lkp ? [this.huntState(r), r1(H.lkp.x), r1(H.lkp.y), r1(H.lkp.z), r2(H.lkp.yaw), H.lkp.st, Math.round(this.t - H.seen)] : null]; })),
    };
  }

  applySnap(s) {
    const seenG = new Set();
    for (const a of s.g) {
      const [id, x, y, z, yaw, st, aw, fl, tag, scan, rev, ti, sh, aim] = a;
      seenG.add(id);
      let g = this.guards.find((q) => q.id === id);
      const type = TYPE_KEYS[ti] || 'guard';
      if (!g) {
        g = { id, kind: 'g', type, x, y, z, yaw, look: 0, state: STATES[st], hp: 1, chief: !!(fl & 1), obj: withXray(buildUnit(type, !!(fl & 1))), fallT: 0, maxShield: TYPES[type].shield, shield: 0, hitFx: 0 };
        this.scene.add(g.obj);
        this.guards.push(g);
      }
      g.tx = x; g.ty = y; g.tz = z; g.tyaw = yaw;
      const ns = STATES[st];
      if (ns === 'dead' && g.state !== 'dead') g.fallT = 0;
      if (g.maxShield && sh < (g.shieldPct ?? 100) - 1) g.hitFx = 1;
      g.shieldPct = sh;
      g.shield = (sh / 100) * g.maxShield;
      g.state = ns; g.aw = aw; g.chief = !!(fl & 1); g.badge = !!(fl & 2); g.found = !!(fl & 4); g.moving = !!(fl & 8); g.tower = !!(fl & 16);
      g.lower = fl & 32 ? 0.5 : 0; g.empT = fl & 64 ? 1 : 0; g.helmet = !!(fl & 128); g.radioT = fl & 256 ? 1 : 0; g.sync = !!(fl & 512); g.stagger = fl & 1024 ? 1 : 0; g.incap = !!(fl & 2048);
      g.tagT = tag; g.scanT = scan; g.rev = !!rev; g.hp = ns === 'dead' ? 0 : 1;
      g.aiming = aim === 1 ? 'shooter' : aim === 2 ? 'spotter' : null;
    }
    this.guards = this.guards.filter((g) => { if (seenG.has(g.id)) return true; this.scene.remove(g.obj); return false; });
    for (const a of s.d) {
      const [id, x, y, z, yaw, st, aw, emp, tag, rev] = a;
      let d = this.drones.find((q) => q.id === id);
      if (!d) { d = { id, kind: 'd', x, y, z, yaw, obj: withXray(buildDrone()) }; this.scene.add(d.obj); this.drones.push(d); }
      d.tx = x; d.ty = y; d.tz = z; d.tyaw = yaw;
      d.state = st === 2 ? 'dead' : st === 1 ? 'hunt' : 'patrol'; d.aw = aw; d.empT = emp; d.tagT = tag; d.rev = !!rev; d.hp = st === 2 ? 0 : 1;
    }
    for (const a of s.c) {
      const c = this.cams.find((q) => q.id === a[0]);
      if (!c) continue;
      c.yaw = a[1]; c.hacked = !!(a[2] & 1); c.loopT = a[2] & 2 ? 1 : 0; c.empT = a[2] & 4 ? 1 : 0; c.aw = a[3];
    }
    this.alarm = s.al; this.alarmPeak = s.pk; this.lockdown = !!s.ld; this.lkp = s.lkp ? { x: s.lkp[0], z: s.lkp[1] } : null; this.lkpT = s.lkp ? 1 : 0;
    this.spoofT = s.sp; this.scanT = s.sc; this.stats = s.st;
    this.huntSnap = s.hn || {};
  }

  // ---- visuals (both sides) ------------------------------------------------------
  draw(dt, camPos) {
    const k = Math.min(1, dt * 12);
    for (const g of this.guards) {
      if (!this.sim && g.tx !== undefined) {
        if (Math.hypot(g.tx - g.x, g.tz - g.z) > 6) { g.x = g.tx; g.z = g.tz; }
        g.x += (g.tx - g.x) * k; g.y += (g.ty - g.y) * k; g.z += (g.tz - g.z) * k;
        g.yaw += angDiff(g.tyaw, g.yaw) * k;
        g.look = 0;
        g.hitFx = Math.max(0, (g.hitFx || 0) - dt * 3);
      }
      const o = g.obj, U = o.userData;
      setXray(o, g.tagT > 0 && g.state !== 'dead');
      o.position.set(g.x, g.y, g.z);
      o.rotation.y = g.yaw + (g.look || 0);
      const dead = g.state === 'dead';
      if (U.shell) {
        const f = g.maxShield ? g.shield / g.maxShield : 0;
        U.shell.visible = !dead && f > 0.02;
        U.shell.material.uniforms.uA.value = 0.18 + f * 0.25 + (g.hitFx || 0) * 1.2;
        U.shell.material.uniforms.uT.value = this.t;
      }
      if (U.wall) {
        const down = g.lower > 0 || g.empT > 0;
        U.wall.visible = !dead && !(g.empT > 0 && Math.random() < 0.7);
        U.wall.rotation.y += ((down ? 1.2 : 0) - U.wall.rotation.y) * Math.min(1, dt * 10);
        U.wall.userData.plane.material.uniforms.uT.value = this.t;
      }
      if (U.blade) U.blade.visible = g.state === 'berserk';
      if (U.helmet) U.helmet.visible = !!g.helmet;
      if (dead) {
        g.fallT = Math.min(1, (g.fallT || 0) + dt * 2.2);
        U.body.rotation.x = -Math.PI / 2 * easeOut(g.fallT);
        U.body.position.y = 0.12 * g.fallT;
        U.beam.visible = false;
        U.tag.visible = false;
        for (const L of U.legs) L.rotation.x = 0;
        continue;
      }
      U.body.rotation.x = g.stagger > 0 ? -0.3 + Math.sin(this.t * 20) * 0.08 : g.state === 'berserk' ? 0.25 : g.state === 'flee' ? -0.15 : 0;
      U.body.position.y = 0;
      if (g.type === 'guard' || g.type === 'bulwark') U.beam.visible = !g.tower;
      if (g.moving) U.phase += dt * (g.state === 'berserk' ? 15 : g.state === 'flee' ? 14 : g.state === 'alert' ? 11 : 7);
      const sw = g.moving ? Math.sin(U.phase) * (g.state === 'berserk' || g.state === 'flee' ? 0.9 : 0.55) : 0;
      U.legs[0].rotation.x = sw;
      U.legs[1].rotation.x = -sw;
      // On the radio: weapon slung low in one hand while the other works the radio.
      U.gun.rotation.x = g.radioT > 0 ? -0.95 : g.state === 'alert' ? 0 : g.state === 'flee' ? -1.1 : -0.35;
      U.gun.rotation.z = g.radioT > 0 ? 0.5 : 0;
      const red = g.state === 'alert' || g.state === 'search';
      const kind = g.radioT > 0 ? 'radio' : g.state === 'berserk' ? 'berserk' : g.state === 'flee' ? 'flee' : red ? 'alert' : 'sus';
      const showTag = g.state === 'alert' || g.state === 'sus' || g.state === 'search' || g.state === 'flee' || g.state === 'berserk' || g.aw > 0.15;
      U.tag.visible = showTag && Math.hypot(camPos.x - g.x, camPos.z - g.z) < 120;
      U.tag.position.y = 2.15 * U.scale + 0.1;
      if (showTag) {
        U.tag.material = icon(kind);
        const s = 0.35 + 0.25 * clamp(g.aw, 0, 1);
        U.tag.scale.set(s, s, 1);
      }
    }
    for (const d of this.drones) {
      if (!this.sim && d.tx !== undefined) {
        d.x += (d.tx - d.x) * k; d.y += (d.ty - d.y) * k; d.z += (d.tz - d.z) * k; d.yaw += angDiff(d.tyaw, d.yaw) * k;
      }
      const o = d.obj;
      setXray(o, d.tagT > 0 && d.state !== 'dead');
      o.position.set(d.x, d.y, d.z);
      o.rotation.y = d.yaw;
      if (d.state === 'dead') { o.rotation.z = 1.2; o.userData.beam.visible = false; continue; }
      o.visible = true;
      o.rotation.z = Math.sin(this.t * 2 + d.id) * 0.04;
      for (const r of o.userData.rotors) r.rotation.y += dt * 40;
      o.userData.beam.visible = !(d.empT > 0);
      o.userData.beam.rotation.y = this.t * 1.4;
      o.userData.beam.material.uniforms.uC.value.set(d.state === 'hunt' ? '#ff5060' : '#e8f0ff');
    }
    for (const c of this.cams) {
      const U = c.obj.userData;
      U.head.rotation.set(-0.35, c.yaw, 0, 'YXZ');
      const blind = c.loopT > 0 || c.empT > 0 || this.spoofT > 0;
      const col = c.hacked ? '#30ffd0' : blind ? '#404040' : c.aw > 0.2 ? '#ff2030' : '#ff6070';
      U.lens.material.color.set(col);
      U.cone.material.color.set(c.hacked ? '#30ffd0' : '#ff3040');
      U.cone.material.opacity = blind && !c.hacked ? 0.005 : c.aw > 0.2 ? 0.06 : 0.018;
      U.cone.visible = Math.hypot(camPos.x - c.x, camPos.z - c.z) < 70;
    }
  }

  dispose() {
    for (const g of this.guards) this.scene.remove(g.obj);
    for (const d of this.drones) this.scene.remove(d.obj);
    for (const c of this.cams) this.scene.remove(c.obj);
  }
}

export function angDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}
function easeOut(t) {
  return 1 - (1 - t) * (1 - t);
}

// Hit capsules (feet at x,y,z), scaled to the unit's size. Dead units lie flat.
export function guardCapsules(g) {
  const s = (TYPES[g.type] || TYPES.guard).scale;
  const cs = Math.cos(g.yaw), sn = Math.sin(g.yaw);
  const P = (lx, ly, lz) => new THREE.Vector3(g.x + lx * s * cs + lz * s * sn, g.y + ly * s, g.z - lx * s * sn + lz * s * cs);
  if (g.state === 'dead') return [{ part: 'torso', a: P(0, 0.25, 0.2), b: P(0, 0.25, 1.6), r: 0.3 * s }];
  const head = g.type === 'scav' ? [P(0, 1.5, -0.12), P(0, 1.55, -0.12)] : g.type === 'bulwark' ? [P(0, 1.62, -0.1), P(0, 1.66, -0.16)] : [P(0, 1.6, 0), P(0, 1.68, 0)];
  return [
    { part: 'head', a: head[0], b: head[1], r: 0.17 * s },
    { part: 'torso', a: P(0, 0.95, 0), b: P(0, 1.42, 0), r: (g.type === 'jugg' || g.type === 'overseer' ? 0.34 : 0.3) * s },
    { part: 'legs', a: P(0, 0.08, 0), b: P(0, 0.9, 0), r: 0.21 * s },
  ];
}

// Where the segment a→b meets a bulwark's raised wall (outside its sight-port), as a fraction
// along the segment, or null when the shot gets past (port, flank, lowered wall, EMP).
export function wallBlock(g, a, b) {
  if (g.type !== 'bulwark' || g.state === 'dead' || g.lower > 0 || g.empT > 0) return null;
  const s = TYPES.bulwark.scale;
  const yaw = g.yaw + (g.look || 0);
  const cs = Math.cos(yaw), sn = Math.sin(yaw);
  const loc = (p) => { const dx = p.x - g.x, dz = p.z - g.z; return { x: (dx * cs - dz * sn) / s, y: (p.y - g.y) / s, z: (dx * sn + dz * cs) / s }; };
  const la = loc(a), lb = loc(b);
  if (la.z >= WALL.z || lb.z <= la.z) return null; // shooter must be in front, shooting toward it
  const t = (WALL.z - la.z) / (lb.z - la.z);
  if (t < 0 || t > 1) return null;
  const x = la.x + (lb.x - la.x) * t, y = la.y + (lb.y - la.y) * t;
  if (Math.abs(x) > WALL.w / 2 || y < WALL.y0 || y > WALL.y1) return null;
  const P = WALL.port;
  if (x > P.x0 && x < P.x1 && y > P.y0 && y < P.y1) return null;
  return t;
}

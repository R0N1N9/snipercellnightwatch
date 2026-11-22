// =============================================================================
// SNIPER CELL: INFILTRATION
// =============================================================================
// A night stealth mission for two: the SHOOTER (default callsign Ra) works a suppressed
// bolt-action rifle and active camo from the high ground; the SPOTTER (default callsign
// Rōnin) carries only a pistol, a recon quadcopter and the CYBER OPS tablet — the
// top-down console that hacks cameras and doors, scans, tags, cuts lights and drops
// supplies. Together they break into the Kestrel Ridge data center, upload malware to the
// cold-archive server, pull its drive and carry it out to the landing zone.
//
// Solo: pick a role and the AI plays the other one (Ra holds a perch and takes the shots
// you tag; Rōnin runs the console for you). Co-op: the host picks a role, the guest gets
// the other. The host runs SENTINEL (guards, drones, cameras, alarm, objectives); each
// client simulates its own operator and judges its own shots, exactly like the duel.
// Mission rules are adapted from Cold Archive (see sentinel.js / ops.js).
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { hazeUniforms } from '../atmosphere.js';
import { LocalPlayer } from '../player.js';
import { Avatar } from '../avatar.js';
import { ViewModel } from '../viewmodel.js';
import { Effects } from '../effects.js';
import { Input } from '../input.js';
import { WEAPON, PLAYER } from '../config.js';
import { RULES, applyRules } from '../rules.js';
import { clamp, segSegClosest } from '../util.js';
import { Facility, SPOTS, DROPS, setInsertion, SHAFT, CHECKPOINT, FENCE, BUILDING, ROOMS, CARDS, terrainHeight, lam, glowMat } from './facility.js';
import { Sentinel, DIFFS, guardCapsules, buildDrone, angDiff } from './sentinel.js';
import { Ops, AiSpotter, PAYLOAD, HACK } from './ops.js';
import { Tablet } from './tablet.js';
import { Sfx } from './sfx.js';
import { Foley } from './foley.js';
import { Wheel } from './wheel.js';
import { installKit, KIT } from './kit.js';
import { installKit2 } from './kit2.js';
import { installIce } from './ice.js';
import { installNeuro } from './neuro.js';
import { installNVG } from './nvg.js';
import { Ambience } from './ambient.js';
import { installSpatial } from './spatial.js';
import { installPhone } from './phone.js';
import { installXRounds, XR, AMMO_NAME, ROUND_CYCLE, ROUND_SHORT } from './xrounds.js';
import { installAbilities } from './abilities.js';
import { installMelee } from './melee.js';
import { installDevices } from './devices.js';
import { wallBlock } from './sentinel.js';
import { Cinema } from './cinema.js';
import { Radio, setVoiceSetting } from './voice.js';
import { Minigame } from './minigame.js';
import { SMG, MAGNUM, P9, buildSMG, buildMagnum, buildP9, buildKnife, normLoadout, cellLook } from './arms.js';
import { ISR, ISR_FOV } from './isr.js';
import { addStrobes, blinkStrobes, IRLaser, ghostAvatar, tickGhosts, IR_LAYER } from './irfx.js';
import { AtmosFX } from '../atmofx.js';
import { applyLook } from '../look.js';
import { Chat } from './chat.js';

export const MISSIONS = {
  nightwatch: { name: 'SENTINEL', title: 'NIGHTWATCH: SENTINEL', line: 'Kestrel Ridge \u00B7 0217 hrs \u00B7 SENTINEL\u2019s augmented garrison is on the night shift.' },
  infiltration: { name: 'INFILTRATION', title: 'NIGHTWATCH: INFILTRATION', line: 'Kestrel Ridge \u00B7 0140 hrs \u00B7 a skeleton crew of security guards.' },
};

export const ROLES = {
  shooter: { name: 'SHOOTER', call: 'Ra', color: '#f2b35b', desc: 'Suppressed KR-50 bolt-action, active camo, P-9 sidearm. The cell’s firepower.' },
  spotter: { name: 'SPOTTER', call: 'Rōnin', color: '#40d8e8', desc: 'P-9 and two magazines. CYBER OPS tablet, recon quadcopter, hacks, scans and supply drops.' },
};

// Weapons for this mode. Halo-style ballistics: hitscan, dead straight, no wind or sway.
const KR50 = {
  key: 'kr50', name: 'KR-50 NIGHTJAR', short: 'KR-50', caliber: '.50 subsonic', slot: 'rifle', kind: 'bolt',
  mag: 4, spareMags: 4, muzzle: 900, damage: { head: 400, torso: 260, legs: 130 }, cycle: 1.0, reload: 2.8, reloadEmpty: 3.4,
  zooms: [2, 8], scope: true, glint: 0, recoil: 0.034, sway: 0, fixedZero: 100,
};

export const OBJECTIVES = [
  { k: 'perimeter', title: 'BREACH THE PERIMETER', hint: 'Get inside the fence — the cut on the west side or the south gate.' },
  { k: 'relay', title: 'TAP THE NETWORK', hint: 'Plant a relay in the Electrical Room (SE corner). Opens the data floor to Overwatch.' },
  { k: 'card', title: 'FIND A KEYCARD', hint: 'Search the office desk drawers (E). Each rack-room door takes its own colour-tagged keycard. The Site Chief carries a master badge.' },
  { k: 'find', title: 'FIND THE ARCHIVE SERVER', hint: 'Take the elevator or the stair tower up to the data floor and swipe into its rack rooms. Look for the cabinet with the slow amber beacon.' },
  { k: 'upload', title: 'UPLOAD THE MALWARE', hint: 'Spotter: jack in at the lit rack (E), lock the signal, then hold the rack while it uploads. Shooter: cover them.' },
  { k: 'drive', title: 'EXTRACT THE DRIVE', hint: 'Release the drive at the rack (E). A clean upload means SENTINEL never knows.' },
  { k: 'exfil', title: 'EXFILTRATE', hint: 'Get the drive out the loading dock to the van east of the fence. Spotter drives, shooter rides shotgun.' },
];

const BLEED = 30;
// Overwatch's opening brief, line by line (each line is a recorded clip; see tools/vo/lines.py).
const BRIEF = {
  nightwatch: [
    'Sniper Cell, Overwatch. ISR on station.',
    'Pickets in the draw. Drop them quiet.',
    'Target: archive server. Data floor, up top.',
    'Checkpoint in the lobby. Go round it.',
    'Relay in electrical. Keycards in the office drawers.',
    'Find the amber beacon. Upload clean, pull the drive.',
    'Botch it and ICE puts them on the walls.',
    "Night shift's augmented. Watch the towers.",
    'Exfil by van, east track. Overwatch out.',
  ],
  infiltration: [
    'Sniper Cell, Overwatch. ISR on station.',
    'Pickets in the draw. Drop them quiet.',
    'Target: archive server. Data floor, up top.',
    'Checkpoint in the lobby. Go round it.',
    'Relay in electrical. Keycards in the office drawers.',
    'Find the amber beacon. Upload clean, pull the drive.',
    'Botch it and ICE puts them on the walls.',
    'Exfil by van, east track. Overwatch out.',
  ],
};
const TOUCH = typeof navigator !== 'undefined' && (navigator.maxTouchPoints > 1 || /iPad|iPhone|Android/.test(navigator.userAgent)) && matchMedia('(pointer: coarse)').matches;
// Binocular zoom steps (vertical FOV, degrees): wheel / ZOOM buttons step through them.
const BINO_FOV = [24, 13, 7, 3.6];
const QUAD_BAT = 300; // seconds of flight (half rate while flying, quarter while parked)

// ---------------------------------------------------------------------------
// Post: ink lines (Inked look), night vision (goggles / scope / quad feed), active-camo shimmer,
// damage, grain. The ink is the valley's (game.js GradeShader): the Laplacian of 1/z.
// ---------------------------------------------------------------------------
const CellShader = {
  uniforms: {
    tDiffuse: { value: null }, uTime: { value: 0 }, uRes: { value: new THREE.Vector2(1, 1) },
    uNV: { value: 0 }, uMode: { value: 0 }, uWash: { value: 0 }, uCloak: { value: 0 }, uDamage: { value: 0 }, uDown: { value: 0 }, uStatic: { value: 0 },
    tDepth: { value: null }, uNear: { value: 0.05 }, uFar: { value: 4000 }, uInked: { value: 1 },
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uTime, uNV, uMode, uCloak, uDamage, uDown, uStatic, uWash; uniform vec2 uRes; varying vec2 vUv;
    uniform sampler2D tDepth; uniform float uNear, uFar, uInked;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
    float lin(vec2 uv){ float z = texture2D(tDepth, uv).x * 2.0 - 1.0; return (2.0 * uNear * uFar) / (uFar + uNear - z * (uFar - uNear)); }
    float inkAt(vec2 uv){
      vec2 o = 1.6 / uRes;
      float d0 = lin(uv), wc = 1.0 / d0;
      float wl = 1.0 / lin(uv - vec2(o.x, 0.0)), wr = 1.0 / lin(uv + vec2(o.x, 0.0));
      float wu = 1.0 / lin(uv + vec2(0.0, o.y)), wd = 1.0 / lin(uv - vec2(0.0, o.y));
      float lap = abs(wl + wr - 2.0 * wc) + abs(wu + wd - 2.0 * wc);
      float ref = max(wc, max(max(wl, wr), max(wu, wd)));
      return smoothstep(0.012, 0.03, lap / ref) * (1.0 - step(uFar * 0.97, d0)) * (1.0 - 0.7 * smoothstep(120.0, 900.0, d0));
    }
    void main(){
      vec2 uv = vUv;
      vec2 d = uv - 0.5; d.x *= uRes.x / uRes.y; float r = length(d);
      // Active camo: the edges of your view ripple like heat over glass.
      if (uCloak > 0.0) uv += vec2(sin(uv.y * 40.0 + uTime * 6.0), cos(uv.x * 36.0 + uTime * 5.0)) * 0.0022 * uCloak * smoothstep(0.25, 0.75, r);
      vec3 c = texture2D(tDiffuse, uv).rgb;
      // Inked look: black ink on silhouettes and folds (before night vision, so goggles show it too).
      if (uInked > 0.5) c = mix(c, vec3(0.0045, 0.0045, 0.006), inkAt(uv) * 0.92);
      float g = hash(uv * uRes + fract(uTime) * 91.7) - 0.5;
      if (uNV > 0.0) {
        float l = dot(c, vec3(0.3, 0.59, 0.11));
        // White phosphor with a cold blue cast (goggles, scope, quad, ISR EO); ISR IR is white-hot greyscale.
        // The tube's auto-gain backs off when something bright is in view.
        float amp = (uMode > 2.5 ? 6.0 : uMode > 1.5 ? 7.0 : 9.0) / (1.0 + uWash * 1.6);
        float v = 1.0 - exp(-l * amp);
        vec3 tint = uMode > 2.5 ? vec3(0.95) : uMode > 1.5 ? vec3(0.84, 0.93, 1.0) : uMode > 0.5 ? vec3(0.8, 0.9, 1.0) : vec3(0.78, 0.89, 1.0);
        vec3 nv;
        if (uMode < 1.5) {
          // Goggles and scope: near-white phosphor with a slight cold blue cast: dark shadows, grey-blue mids, near-white
          // highlights. Smooth, with only a whisper of grain and no scanlines.
          vec3 lo = vec3(0.02, 0.035, 0.06), mid = vec3(0.46, 0.53, 0.62), hi = vec3(0.94, 0.97, 1.0);
          nv = mix(lo, mid, smoothstep(0.0, 0.55, v));
          nv = mix(nv, hi, smoothstep(0.55, 1.0, v));
          nv += g * 0.018 * (1.0 + uWash * 1.5);
          tint = vec3(0.86, 0.92, 1.0);
        } else {
          nv = tint * (v * 0.95 + 0.03) + g * 0.07 * (1.0 + uWash * 2.0);
          nv *= 0.92 + 0.08 * sin(uv.y * uRes.y * 1.4);
        }
        // Bright sources bloom into halos, and a light in your face washes the tube out.
        float glow = 0.0;
        for (int i = 0; i < 8; i++) {
          float a = float(i) * 0.785398;
          vec2 o = vec2(cos(a), sin(a)) * (0.012 + 0.02 * uWash) * vec2(uRes.y / uRes.x, 1.0);
          glow += smoothstep(0.25, 1.4, dot(texture2D(tDiffuse, uv + o).rgb, vec3(0.3, 0.59, 0.11)));
        }
        nv += tint * glow * 0.05 * (1.0 + uWash * 1.5);
        nv += tint * smoothstep(0.6, 3.0, l) * 0.25;
        nv = mix(nv, tint * (0.55 + 0.35 * v), clamp(uWash, 0.0, 1.0) * 0.35);
        nv *= mix(1.0, smoothstep(0.95, 0.35, r), 0.55);
        nv += uStatic * (hash(vec2(floor(uv.y * uRes.y / 3.0), floor(uTime * 24.0))) - 0.5) * 0.25;
        c = mix(c, nv, uNV);
      } else {
        float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
        c *= mix(vec3(0.86, 0.95, 1.18), vec3(1.05, 1.0, 0.92), smoothstep(0.02, 0.5, l));
        c += g * 0.012 * (0.3 + l);
      }
      if (uCloak > 0.0) c = mix(c, c * vec3(0.8, 0.95, 1.15), 0.4 * uCloak);
      float vig = smoothstep(1.0, 0.25, r);
      c *= mix(0.72, 1.0, vig);
      c = mix(c, vec3(0.45, 0.02, 0.04), uDamage * (1.0 - vig) * 0.9);
      c = mix(c, vec3(dot(c, vec3(0.33))) * vec3(0.9, 0.35, 0.35), uDown * 0.7);
      gl_FragColor = vec4(c, 1.0);
    }`,
};

// Shimmering active-camo material for an operator seen from outside.
function cloakMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uFlick: { value: 0 } },
    vertexShader: 'varying vec3 vN; varying vec3 vV; varying vec3 vW; void main(){ vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position,1.0); vV = normalize(-mv.xyz); vW = (modelMatrix * vec4(position,1.0)).xyz; gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'uniform float uTime, uFlick; varying vec3 vN; varying vec3 vV; varying vec3 vW; void main(){ float f = pow(1.0 - abs(dot(vN, vV)), 2.5); float band = 0.5 + 0.5 * sin(vW.y * 18.0 - uTime * 7.0 + vW.x * 3.0); vec3 c = vec3(0.55, 0.75, 1.0) * (f * (0.22 + 0.25 * band) + uFlick * 0.25); gl_FragColor = vec4(c, 0.08 + f * 0.35 + uFlick * 0.3); }',
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
}

// The beefy suppressed bolt gun for the first-person view. Same anchor contract as the
// valley's rifles (gripR / gripL / muzzle / bolt / boltKnob / mag / sight).
export function buildKR50() {
  const g = new THREE.Group();
  const mat = (hex) => new THREE.MeshLambertMaterial({ color: hex, emissive: hex, emissiveIntensity: 0.14 });
  const M = { body: mat('#2a2d31'), dark: mat('#17181b'), hi: mat('#3a3e44'), olive: mat('#3b3f36'), glow: new THREE.MeshBasicMaterial({ color: '#40ffb0' }) };
  const box = (w, h, d, m, x, y, z) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); g.add(o); return o; };
  const cyl = (r1, r2, len, m, x, y, z, seg = 14) => { const o = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, len, seg).rotateX(Math.PI / 2), m); o.position.set(x, y, z); g.add(o); return o; };
  // Thick slab receiver and a long boxy shroud, Halo-scale bulk.
  box(0.075, 0.085, 0.42, M.body, 0, 0.01, -0.12);
  box(0.08, 0.03, 0.42, M.hi, 0, 0.06, -0.12);
  box(0.07, 0.075, 0.62, M.body, 0, 0.0, -0.62);
  box(0.074, 0.02, 0.6, M.dark, 0, 0.045, -0.62);
  for (let i = 0; i < 7; i++) for (const s of [-1, 1]) box(0.004, 0.03, 0.05, M.dark, s * 0.038, 0.0, -0.4 - i * 0.075);
  // Fat integral suppressor.
  cyl(0.042, 0.042, 0.38, M.dark, 0, 0.0, -1.12, 16);
  cyl(0.044, 0.044, 0.02, M.hi, 0, 0.0, -0.94, 16);
  cyl(0.044, 0.044, 0.02, M.hi, 0, 0.0, -1.3, 16);
  // Grip, trigger guard, mag well, thumbhole stock.
  const grip = box(0.04, 0.12, 0.055, M.olive, 0, -0.08, 0.035);
  grip.rotation.x = -0.3; // raked back like a real pistol grip
  box(0.01, 0.01, 0.08, M.dark, 0, -0.045, -0.04);
  const magG = new THREE.Group();
  const mag = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.11, 0.1), M.dark);
  mag.position.y = -0.05;
  magG.add(mag);
  magG.position.set(0, -0.03, -0.12);
  g.add(magG);
  box(0.06, 0.09, 0.3, M.olive, 0, -0.01, 0.2);
  box(0.06, 0.15, 0.04, M.dark, 0, -0.03, 0.36);
  box(0.05, 0.04, 0.12, M.olive, 0, 0.055, 0.16);
  // Bolt with a big ball knob.
  const bolt = new THREE.Group();
  bolt.add(new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.12, 10).rotateX(Math.PI / 2), M.hi));
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.012, 0.014), M.hi);
  arm.position.set(0.03, 0, 0.03);
  bolt.add(arm);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.016, 10, 8), M.dark);
  knob.position.set(0.06, 0, 0.03);
  bolt.add(knob);
  bolt.position.set(0, 0.035, -0.02);
  g.add(bolt);
  // Night-vision scope: big objective, glowing battery tell.
  const sy = 0.115;
  cyl(0.024, 0.024, 0.34, M.dark, 0, sy, -0.18, 14);
  cyl(0.04, 0.026, 0.1, M.dark, 0, sy, -0.39, 16);
  cyl(0.028, 0.03, 0.08, M.dark, 0, sy, 0.02, 14);
  box(0.05, 0.03, 0.06, M.hi, 0.03, sy, -0.16);
  box(0.012, 0.012, 0.012, M.glow, 0.056, sy + 0.005, -0.16);
  for (const z of [-0.08, -0.28]) box(0.03, 0.06, 0.03, M.dark, 0, 0.075, z);
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.024, 16), new THREE.MeshBasicMaterial({ color: '#07160e' }));
  lens.position.set(0, sy, 0.062);
  g.add(lens);
  // The eyepiece glows faintly green-white while the scope's night vision is on (a ring of
  // light round the eyecup, with a brighter flash as it comes on).
  const eyeRing = new THREE.Mesh(new THREE.RingGeometry(0.019, 0.03, 24), new THREE.MeshBasicMaterial({ color: '#c8ffe0', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
  eyeRing.position.set(0, sy, 0.064);
  g.add(eyeRing);
  // Refinements: a toothed top rail, scope rings and turrets, an adjustable cheek riser, a
  // rubber recoil pad, a textured grip and magazine, a folded bipod and sling points.
  for (let i = 0; i < 16; i++) box(0.05, 0.007, 0.012, M.dark, 0, 0.079, 0.06 - i * 0.026);
  for (const z of [-0.08, -0.28]) { const r = cyl(0.03, 0.03, 0.022, M.hi, 0, sy, z, 14); void r; }
  const tur = (x, y, z, rot) => { const t = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.017, 0.03, 14), M.hi); t.position.set(x, y, z); if (rot) t.rotation.z = Math.PI / 2; g.add(t); const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.019, 0.006, 14), M.dark); cap.position.copy(t.position); if (rot) { cap.rotation.z = Math.PI / 2; cap.position.x += 0.016; } else cap.position.y += 0.016; g.add(cap); };
  tur(0, sy + 0.035, -0.19, false);
  tur(0.035, sy, -0.19, true);
  box(0.054, 0.018, 0.1, M.dark, 0, 0.095, 0.17);
  const ck = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.012, 10).rotateZ(Math.PI / 2), M.hi); ck.position.set(0.034, 0.07, 0.17); g.add(ck);
  box(0.064, 0.16, 0.02, mat('#101113'), 0, -0.03, 0.39);
  for (let i = 0; i < 4; i++) box(0.066, 0.004, 0.022, M.dark, 0, -0.09 + i * 0.04, 0.39);
  for (let i = 0; i < 4; i++) { const t = box(0.042, 0.005, 0.05, M.dark, 0, -0.055 - i * 0.022, 0.035 + i * 0.0066); t.rotation.x = -0.3; }
  const magPart = (w, h, d, y) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), M.hi); o.position.y = y; magG.add(o); };
  for (let i = 0; i < 3; i++) magPart(0.052, 0.005, 0.102, -0.02 - i * 0.03);
  magPart(0.056, 0.014, 0.108, -0.108);
  for (const sx of [-1, 1]) { const leg = box(0.014, 0.014, 0.22, M.dark, sx * 0.02, -0.05, -0.62); void leg; }
  box(0.05, 0.02, 0.03, M.hi, 0, -0.04, -0.5);
  for (const z of [-0.78, 0.3]) { const sw = new THREE.Mesh(new THREE.TorusGeometry(0.012, 0.003, 6, 12), M.hi); sw.position.set(0, -0.045, z); sw.rotation.y = Math.PI / 2; g.add(sw); }
  const anchor = (x, y, z) => { const a = new THREE.Object3D(); a.position.set(x, y, z); g.add(a); return a; };
  g.userData = {
    gripR: anchor(0, -0.09, 0.03), gripL: anchor(-0.005, -0.04, -0.5), muzzle: anchor(0, 0, -1.33),
    bolt, boltKnob: anchor(0.06, 0.035, 0.01), mag: magG, magHome: magG.position.clone(), sight: sy, eye: lens, eyeRing,
  };
  return g;
}

function buildHeli() {
  const g = new THREE.Group();
  const m = (geo, col, x, y, z) => { const o = new THREE.Mesh(geo, lam(col)); o.position.set(x, y, z); g.add(o); return o; };
  m(new THREE.BoxGeometry(2.6, 2.2, 7), '#2b2e33', 0, 0, 0);
  m(new THREE.BoxGeometry(2.2, 1.6, 2), '#1d2024', 0, 0.1, -4.2);
  m(new THREE.BoxGeometry(0.6, 0.6, 6), '#2b2e33', 0, 0.5, 6);
  m(new THREE.BoxGeometry(0.2, 2, 1.2), '#2b2e33', 0, 1.4, 8.8);
  const rotor = m(new THREE.BoxGeometry(14, 0.06, 0.4), '#111', 0, 1.6, 0);
  const rotor2 = m(new THREE.BoxGeometry(0.4, 0.06, 14), '#111', 0, 1.6, 0);
  for (const s of [-1, 1]) m(new THREE.BoxGeometry(0.15, 0.15, 5), '#18191c', s * 1.1, -1.6, 0);
  const light = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6), new THREE.MeshBasicMaterial({ color: '#ff3030' }));
  light.position.set(0, 1.2, 8.9);
  g.add(light);
  const beam = new THREE.Mesh(new THREE.ConeGeometry(4, 14, 18, 1, true).translate(0, -7, 0), glowMat('#e8f4ff', 0.06));
  beam.position.set(0, -1, -3);
  g.add(beam);
  g.userData = { rotor, rotor2, light };
  return g;
}

function buildCrate() {
  const g = new THREE.Group();
  const b = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.6, 0.6), lam('#3b4a35'));
  b.position.y = 0.3;
  g.add(b);
  const strip = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.08, 0.62), new THREE.MeshBasicMaterial({ color: '#40ffb0' }));
  strip.position.y = 0.45;
  g.add(strip);
  const chute = new THREE.Mesh(new THREE.SphereGeometry(1.4, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2.4), lam('#5a5a4a', { side: THREE.DoubleSide }));
  chute.position.y = 3.2;
  g.add(chute);
  g.userData = { chute };
  return g;
}

function buildSky(scene) {
  const geo = new THREE.SphereGeometry(1800, 32, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { uMoon: { value: new THREE.Vector3(-0.35, 0.42, -0.84).normalize() } },
    vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform vec3 uMoon; varying vec3 vD;
      float h(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,45.164))) * 43758.5453); }
      void main(){
        float y = max(vD.y, 0.0);
        vec3 c = mix(vec3(0.035,0.05,0.09), vec3(0.008,0.012,0.03), pow(y, 0.5));
        float m = max(dot(vD, uMoon), 0.0);
        c += vec3(0.18,0.24,0.36) * pow(m, 18.0) * 0.6 + vec3(0.5,0.6,0.8) * pow(m, 900.0) * 3.0;
        vec3 q = floor(vD * 420.0);
        float s = step(0.9975, h(q)) * smoothstep(0.02, 0.25, y);
        c += vec3(0.8, 0.85, 1.0) * s * (0.4 + 0.6 * h(q + 1.0));
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  const sky = new THREE.Mesh(geo, mat);
  sky.renderOrder = -10;
  scene.add(sky);
  // The moon itself.
  const moon = new THREE.Mesh(new THREE.CircleGeometry(38, 32), new THREE.MeshBasicMaterial({ color: '#dfe8ff', fog: false }));
  const md = new THREE.Vector3(-0.35, 0.42, -0.84).normalize().multiplyScalar(1600);
  moon.position.copy(md);
  moon.lookAt(0, 0, 0);
  scene.add(moon);
  return { sky, moon };
}

// ---------------------------------------------------------------------------
export class CellGame {
  constructor({ mode, net, role, diff = 'operative', seed = 7, quality = 'medium', settings, audio, name, partnerName, mission = 'nightwatch', look = 'inked', insert = 'draw', layout = 'standard' }) {
    // 'solo' (AI partner) | 'operative' (one operator, both roles) | 'host' | 'guest'
    this.mode = mode;
    this.isHost = mode !== 'guest';
    this.solo = mode === 'solo' || mode === 'operative';
    this.operative = mode === 'operative';
    this.aiPartner = mode === 'solo';
    this.mission = MISSIONS[mission] ? mission : 'nightwatch';
    // Drop point (menu choice; the host's applies to both): the tree-line draw or the ridge.
    this.drop = setInsertion(insert);
    this.dropKind = SPOTS.drop;
    this.net = net || null;
    this.role = role;
    this.partnerRole = role === 'shooter' ? 'spotter' : 'shooter';
    this.name = name || ROLES[role].call;
    this.partnerName = partnerName || ROLES[this.partnerRole].call;
    this.diff = diff;
    this.D = DIFFS[diff] || DIFFS.operative;
    this.quality = quality;
    this.settings = settings || {};
    this.audio = audio;
    this.t = 0;
    this.paused = false;
    this.ended = null;

    if (this.mission === 'nightwatch') Object.assign(OBJECTIVES[2], { hint: 'Search the office desk drawers (E). Each rack-room door takes its own colour-tagged keycard. The Overseer (violet juggernaut) carries a master badge.' });
    // Halo-style ballistics for this mode: instant, straight, no sway. The graphics look is the
    // host's (it rides in the cell hello), as in the valley.
    this.look = look === 'og' ? 'og' : 'inked';
    applyRules({ preset: 'halo', look: this.look });
    RULES.zooms = null;
    RULES.hitbox = 1.15;

    this._initRenderer();
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(WEAPON.baseFov, innerWidth / innerHeight, 0.05, 4000);
    this.camera.rotation.order = 'YXZ';
    this.scene.add(this.camera);
    this._lights();
    buildSky(this.scene);
    this.fac = new Facility(this.scene, quality, seed, { layout });
    this.sentinel = new Sentinel(this, { diff, seed, sim: this.isHost, mission: this.mission, pickets: this.drop.approach });
    this.sfx = new Sfx(audio);
    this.foley = new Foley(audio);
    this.effects = new Effects(this.scene);
    this.input = new Input(this.renderer.domElement, document.getElementById('touch'));
    this.input.sensitivity = this.settings.sensitivity || 1;
    this.input.invertY = !!this.settings.invertY;
    this.input.scopeToggle = !!this.settings.scopeToggle;
    for (const k of ['touchSensR', 'touchSensL', 'gyroMode', 'gyroSens', 'gyroInvertY']) if (this.settings[k] !== undefined) this.input[k] = this.settings[k];

    // Mission state (host-authoritative; mirrored on the guest).
    this.obj = { perimeter: false, relay: false, badge: false, found: false, aligned: false, upload: 0, uploading: false, trace: 0, traced: false, drive: null, driveAt: null, exfil: false, access: 1, drops: this.D.drops, canCrack: false, crack: 0, step: 0, cards: [], searched: [], used: {}, commsDown: false, cctv: false, quiet: null, ice: false, ifak: { shooter: 1, spotter: 1 }, barracks: 'ok', barracksT: 0, bay: 'ok', c4: [], lift: { y: 0, to: 0 } };
    this.crates = [];
    this.crateId = 1;
    this.prompts = {}; // role -> { label, p }
    this.holdT = {}; // role -> { key, t }
    this.revive = {};
    this.medevac = null;
    this.trails = [];
    this.pins = []; // waypoints / requests { x, z, label, by, t }
    this.commsLog = [];
    this.stats = { shots: 0, hits: 0, heads: 0, longest: 0, t0: 0 };

    this.loadout = normLoadout(this.settings.cellLoadout);
    this._setupPlayer();
    this._xrInit();
    this._abInit();
    this._devInit();
    this._wpnInit();
    this.laserOn = true;
    this._setupPartner();
    this.ops = this.role === 'spotter' ? new Ops(this) : this.solo ? new Ops(this) : null;
    if (this.ops && this.loadout.spotter.perk === 'bandwidth' && (this.role === 'spotter' || this.operative)) this.ops.bwMul = 1.4;
    if ((this.role === 'spotter' || this.operative) && this.loadout.spotter.perk === 'drops') this.obj.drops += 2;
    this.aiSpot = this.aiPartner && this.role === 'shooter' ? new AiSpotter(this, this.ops) : null;
    this.aiShoot = this.aiPartner && this.role === 'spotter' ? { perch: this.drop.perch || 0, cool: 3, aim: null, aimT: 0, moveT: 0, sayT: 0, holdT: 0, coverT: 0 } : null;
    // The approach: until you're over the crest an AI partner walks the draw with you.
    this.approach = this.drop.approach;
    this.quad = null;
    this.quadCd = 0;
    this._kitInit();
    this.wheel = new Wheel();
    this.radio = new Radio(audio);
    this.mini = new Minigame();
    this.isr = new ISR(this);
    this.atmos = new AtmosFX(this.scene, { quality, night: true, color: '#b8c8ff', mistColor: '#5d6c90', bright: 0.45, lamps: this.fac.lightSources.filter((L) => L.kind === 'lamp') });
    this._irInit();
    this._wlInit();
    this._iceInit();
    this._neuroInit();
    this._nvgInit();
    this._spatialInit();
    this._phoneInit();
    this._mapPoints();
    this._buildHud();
    this.tablet = new Tablet(this);
    if (this.net) this._setupNet();

    this._resize();
    addEventListener('resize', () => this._resize());
    this.clock = new THREE.Clock();
    this.comms(this.operative ? (this.role === 'shooter' ? 'Lone operative: rifle, camo and the CYBER OPS tablet are all yours (TAB).' : 'Lone operative: binoculars, nano drones, hacks and the CYBER OPS tablet are all yours (TAB). No sniper covering you.') : this.role === 'shooter' ? 'Ra in position. Kestrel Ridge below \u2014 lights in the yard, towers manned.' : 'R\u014dnin on the wire. CYBER OPS console synced (TAB).', ROLES[this.role].color, this.name);
    this.comms(this.operative ? 'Q to ping and mark (hold for the wheel); payloads run straight from your tablet.' : this.aiPartner ? (this.role === 'shooter' ? 'R\u014dnin (AI) runs the console. Q to ping and mark; hold Q for pings and requests.' : 'Ra (AI) holds a perch. Mark targets (Q) and Ra fires.') : `${this.partnerName} is the ${ROLES[this.partnerRole].name.toLowerCase()}. Q to ping and mark; hold Q for pings and requests.`, 'dim');
    if (this.mission === 'nightwatch') this.comms('Officers spook when they\u2019re alone. Juggernauts\u2019 shells break \u2014 then they charge. Bulwarks: shoot the port in the wall.', 'dim');
    // The night soundscape (wind, insects, distant sounds; air handling indoors). No hum.
    this.ambient = new Ambience(this.audio);
    // Doors and lights changing state (host or guest alike) make their sounds where they are.
    this.fac.onDoor = (d, open) => { if (this.t > 1) this.foley.door({ x: d.x, y: (d.y || 0) + 1.2, z: d.z }, d.kind, open); };
    this.fac.onLight = (L, on) => {
      // A whole room going dark at once is one clunk, not a dozen.
      const last = this._lightSfx;
      if (last && this.t - last.t < 0.3 && Math.hypot(last.x - L.x, last.z - L.z) < 14) return;
      this._lightSfx = { t: this.t, x: L.x, z: L.z };
      if (this.t > 1) (on ? this.foley.powerUp : this.foley.powerDown).call(this.foley, { x: L.x, y: L.y, z: L.z });
    };
    this.chat = new Chat(this);
    this.cine = new Cinema(this);
    // Opening cut-scene (skippable); ?nocine skips it for testing.
    if (!new URLSearchParams(location.search).has('nocine')) this.cine.startIntro();
    else this.hud.intro(MISSIONS[this.mission], this.operative ? 'LONE OPERATIVE' : `${ROLES[this.role].name} \u00B7 ${this.name}${this.aiPartner ? ' \u00B7 AI ' + this.partnerName : this.solo ? '' : ' \u00B7 with ' + this.partnerName}`);
    this.renderer.setAnimationLoop(() => this._frame());
  }

  // ---- setup ---------------------------------------------------------------------
  _initRenderer() {
    const canvas = document.getElementById('game');
    const q = this.quality;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: q === 'low', powerPreference: 'high-performance', stencil: false });
    this.pr = q === 'high' ? Math.min(devicePixelRatio, 2) : q === 'medium' ? Math.min(devicePixelRatio, 1.5) : Math.min(devicePixelRatio, 1);
    // Tablets and phones: cap the render resolution (Retina iPads otherwise push ~5 Mpx through the post pass).
    if (TOUCH) this.pr = Math.min(this.pr, q === 'high' ? 1.25 : 1);
    this.renderer.setPixelRatio(this.pr);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.35;
  }

  _lights() {
    this.hemi = new THREE.HemisphereLight('#5a70a0', '#141821', 2.1);
    this.moonLight = new THREE.DirectionalLight('#9fb6ff', 1.1);
    this.moonLight.position.set(-350, 420, -840);
    this.scene.add(this.hemi, this.moonLight);
    // Night haze: low ground mist that the cliff sits above.
    hazeUniforms.uHazeColor.value.set('#0b1220');
    hazeUniforms.uHazeSunColor.value.set('#22324e');
    hazeUniforms.uSunDir.value.set(-0.35, 0.42, -0.84).normalize();
    hazeUniforms.uHazeDensity.value = 0.0042;
    hazeUniforms.uHazeFloor.value = 0.22;
    hazeUniforms.uHazeFalloff.value = 22;
    hazeUniforms.uHazeBase.value = 0;
    this.renderer.setClearColor('#050810');
    // A fixed set of point lights (counts never change, so shaders compile once).
    this.points = [];
    const add = (x, y, z, col, I, d, zone) => { const L = new THREE.PointLight(col, I, d, 1.6); L.position.set(x, y, z); this.scene.add(L); this.points.push({ L, I, zone }); };
    for (const t of [[-73, -53], [73, -53], [-73, 53], [73, 53]]) add(t[0] * 0.95, 8, t[1] * 0.95, '#ffe2b0', 60, 40, 'yard');
    add(11, 4, 54, '#ffcf8a', 25, 20, 'yard');
    add(0, 4, 3, '#ffd9a0', 22, 18, 'yard');
    add(0, 6, -12, '#d8e4ff', 26, 22, 'floor');
    add(-18, 6, -30, '#d8e4ff', 22, 24, 'floor');
    add(24, 6, -31, '#b8d0ff', 22, 20, 'core');
  }

  _initComposer() {
    if (this.composer) return;
    const rt = new THREE.WebGLRenderTarget(innerWidth, innerHeight, { type: THREE.HalfFloatType, samples: this.quality === 'high' ? 4 : 0, depthTexture: new THREE.DepthTexture(innerWidth, innerHeight) });
    this.composer = new EffectComposer(this.renderer, rt);
    // The ping-pong buffer must not share the depth texture the post pass samples for ink.
    this.composer.renderTarget2.depthTexture = new THREE.DepthTexture(innerWidth, innerHeight);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    if (this.quality !== 'low') this.composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), 0.7, 0.5, 0.85));
    this.post = new ShaderPass(CellShader);
    this.composer.addPass(this.post);
    this.composer.addPass(new OutputPass());
  }

  _resize() {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight, false);
    this._initComposer();
    this.composer.setPixelRatio(this.pr);
    this.composer.setSize(innerWidth, innerHeight);
    this.post.uniforms.uRes.value.set(innerWidth, innerHeight);
    const c = this.overlay;
    if (c) { c.width = innerWidth * Math.min(devicePixelRatio, 2); c.height = innerHeight * Math.min(devicePixelRatio, 2); }
  }

  _setupPlayer() {
    const P = (this.player = new LocalPlayer());
    const i = this.role === 'shooter' ? 0 : 1;
    // Both of you start at the drop-off in the draw and walk in.
    const sp = SPOTS.insert[this.role === 'shooter' ? 0 : 1];
    const sx = sp.x, sz = sp.z;
    P.vest = this.role === 'shooter' ? 'rig' : 'plate';
    P.reset(new THREE.Vector3(sx, this.fac.groundAt(sx, sz, 200, 0.5), sz), 0);
    this._arm();
    P.autoBipod = false;
    // KR-50 bolt: standard by default (like multiplayer: tap fire and you come off the glass to
    // work the bolt; keep fire held to stay scoped). The straight-pull bolt (loadout) cycles while
    // you stay on target.
    P.autoCycle = true;
    P.straightPull = this.loadout.shooter.bolt === 'straight';
    P.keepReload = true; // running doesn't break a reload (firing breaks a sprint instead)
    P.hp = this.D.hp;
    this.hp = this.D.hp;
    this.maxHp = this.D.hp;
    this.downed = false;
    this.kia = false;
    this.bleed = BLEED;
    this.cloak = { on: false, bat: 100, flick: 0, regenT: 0 };
    this.nv = false;
    this.scopeNV = true;
    this.viewmodel = new ViewModel(this.camera);
    // The P-9 replaces the valley's sidearm model (same key, so everything else follows it).
    this.viewmodel.holder.remove(this.viewmodel.models.m18);
    for (const [key, model] of [['kr50', buildKR50()], ['smg', buildSMG()], ['mag50', buildMagnum()], ['m18', buildP9()]]) {
      model.visible = false;
      this.viewmodel.models[key] = model;
      this.viewmodel.holder.add(model);
    }
    // Deadeye: a second KR-50, held low across the body in the left hand while the M50 works.
    this.deRifle = buildKR50();
    this.deRifle.scale.setScalar(0.82);
    this.deRifle.position.set(-0.3, -0.36, -0.72);
    this.deRifle.rotation.set(0.25, 0.9, 0.5);
    this.deRifle.visible = false;
    this.deRifle.traverse((o) => { o.renderOrder = 10; o.frustumCulled = false; });
    this.camera.add(this.deRifle);
    // ...and a K9 SMG for when Deadeye goes off with the SMG in your hands.
    this.deSmg = buildSMG();
    this.deSmg.scale.setScalar(0.82);
    this.deSmg.visible = false;
    this.deSmg.traverse((o) => { o.renderOrder = 10; o.frustumCulled = false; });
    this.camera.add(this.deSmg);
    // Knife for takedowns (camera space).
    this.knife = buildKnife();
    this.knife.visible = false;
    this.camera.add(this.knife);
    this.knife.traverse((o) => { o.renderOrder = 11; o.frustumCulled = false; });
    // The carried drive, strapped low on the left of your view.
    this.carry = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.03, 0.12), new THREE.MeshBasicMaterial({ color: '#ff9a20' }));
    this.carry.position.set(-0.2, -0.2, -0.32);
    this.carry.rotation.set(0.4, 0.3, 0);
    this.carry.renderOrder = 11;
    this.carry.visible = false;
    this.camera.add(this.carry);
    // Suppressor on the P-9 (toggle with B).
    const can = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.13, 12).rotateX(Math.PI / 2), new THREE.MeshLambertMaterial({ color: '#1a1b1e', emissive: '#1a1b1e', emissiveIntensity: 0.14 }));
    const pm = this.viewmodel.models.m18;
    can.position.set(0, 0.026, -0.235);
    pm.add(can);
    this.pistolCan = can;
    // A knurled ring and a witness mark on each can so you can see it turn.
    for (const c of [can, this.viewmodel.models.smg.userData.can, this.viewmodel.models.mag50.userData.can]) {
      if (!c) continue;
      const r = c.geometry.parameters.radiusTop;
      const ring = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.08, r * 1.08, 0.014, 12).rotateX(Math.PI / 2), new THREE.MeshLambertMaterial({ color: '#2a2c30', emissive: '#2a2c30', emissiveIntensity: 0.2 }));
      ring.position.z = c.geometry.parameters.height * 0.42;
      const mark = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.003, c.geometry.parameters.height * 0.7), new THREE.MeshBasicMaterial({ color: '#6c7076' }));
      mark.position.set(0, r * 1.02, 0);
      c.add(ring, mark);
    }
    this.viewmodel.root.traverse((o) => { o.renderOrder = 10; o.frustumCulled = false; });
    this.viewmodel.setLook({ outfit: 'wraith', poncho: this.role === 'shooter', theme: 'mcblack' });
    this.i = i;
  }

  _arm() {
    const P = this.player;
    const L = this.loadout;
    if (!P._baseSpare) P._baseSpare = P._spare.bind(P);
    const extra = this.role === 'shooter' && L.shooter.perk === 'mags' ? 2 : 0;
    // A spotter running the SMG carries three magazines in all (the sniper carries five).
    P._spare = (d) => (this.role === 'spotter' && d.key === 'smg' ? 2 : P._baseSpare(d) + extra);
    const mk = (d, sup) => ({ def: d, mag: d.mag, chamber: 1, reserve: d.mag * P._spare(d), zoomIdx: 0, zero: d.fixedZero || 100, sup, mode: d.modes ? d.modes[0] : null });
    // Everything starts suppressed (B takes it off in game). The spotter's primary is the
    // binoculars (default) or the K9 SMG; the P-9 is their secondary.
    const spotSmg = this.role === 'spotter' && L.spotter.primary === 'smg';
    P.arms = this.role === 'shooter' ? [mk(KR50, true), mk(L.shooter.secondary === 'mag50' ? MAGNUM : SMG, true)] : spotSmg ? [mk(SMG, true), mk(P9, true)] : [mk(P9, true)];
    P.slot = 0;
  }

  _look(role) {
    return cellLook(role);
  }

  _setupPartner() {
    const r = this.partnerRole;
    const av = new Avatar(ROLES[r].color, r === 'shooter' ? 7 : 11);
    av.setLook(this._look(r));
    this.scene.add(av.root);
    this.cloakMat = cloakMaterial();
    const ai = this.aiPartner;
    const p = SPOTS.insert[r === 'shooter' ? 0 : 1];
    this.partner = {
      role: r, name: this.partnerName, ai, avatar: av, pos: new THREE.Vector3(p.x, this.fac.groundAt(p.x, p.z, 200, 0.5), p.z), tpos: null,
      yaw: 0, pitch: -0.05, st: 0, w: r === 'spotter', moving: false, sprinting: false, cloak: false, cloakFlicker: false,
      hp: 100, downed: false, kia: false, alive: true, tablet: false, e: false, quad: null, seen: ai, ammo: 1, lastT: 0,
    };
    // Your own (local) operator model, used when you are down and the camera pulls out.
    this.selfAvatar = new Avatar(ROLES[this.role].color, 3);
    this.selfAvatar.setLook(this._look(this.role));
    this.selfAvatar.setVisible(false);
    this.scene.add(this.selfAvatar.root);
    this.quadObj = buildDrone();
    this.quadObj.userData.beam.visible = false;
    this.quadObj.scale.setScalar(0.6);
    this.quadObj.visible = false;
    this.scene.add(this.quadObj);
    this.medObj = buildDrone();
    this.medObj.userData.beam.visible = false;
    this.medObj.visible = false;
    this.scene.add(this.medObj);
    this.heli = buildHeli();
    this.heli.visible = false;
    this.scene.add(this.heli);
    this.crateObjs = new Map();
  }

  // ---- networking --------------------------------------------------------------
  _setupNet() {
    const n = this.net;
    n.on('cp', (m) => this._onPartnerState(m));
    n.on('cw', (m) => { if (!this.isHost) this._applyWorld(m); });
    n.on('shot', (m) => this._onRemoteShot(m));
    n.on('eshot', (m) => { if (!this.isHost) this._onEshot(m); });
    n.on('hit', (m) => { if (this.isHost) this._applyHit(m.id, m.dmg, m.how, m.from, this.partnerRole, !!m.head, m.dist); });
    n.on('ab', (m) => { if (this.isHost) this._execPayload(m.k, m.target, this.partnerRole); });
    n.on('toast', (m) => { if (!this.isHost) this.comms(m.m, m.c, m.who); });
    n.on('ev', (m) => this._onEvent(m));
    n.on('end', (m) => { if (!this.isHost) this._end(m.win, m.info); });
    n.on('pin', (m) => this._addPin(m, false));
    n.on('cm', (m) => this._onCall(m));
    n.on('rq', (m) => this._onRequest(m));
    n.on('rr', (m) => this._onAnswer(m));
    n.on('ack', () => this.comms('Roger.', ROLES[this.partnerRole].color, this.partnerName));
    n.on('cname', (m) => { const nm = String(m.name || '').replace(/[<>&"]/g, '').slice(0, 16); if (nm) { this.partner.name = this.partnerName = nm; } });
    n.send({ t: 'cname', name: this.name });
    n.on('close', () => { this.comms(`${this.partnerName} lost the link.`, 'red'); this.partner.alive = false; this.partner.seen = false; });
    n.on('hello', () => {
      // A guest that raced the hello asks again: re-send it.
      if (this.isHost && this.hello) n.send(this.hello);
    });
  }

  send(m) {
    if (this.net && this.net.open) this.net.send(m);
  }

  _onPartnerState(m) {
    const P = this.partner;
    P.tpos = new THREE.Vector3(m.p[0], m.p[1], m.p[2]);
    if (!P.seen) P.pos.copy(P.tpos);
    P.seen = true;
    P.tyaw = m.y; P.pitch = m.pi; P.st = m.st; P.w = !!m.w; P.moving = !!m.mv; P.sprinting = !!m.sp;
    P.cloak = !!m.ck; P.cloakFlicker = !!m.cf; P.hp = m.hp; P.downed = !!m.dn; P.kia = !!m.kia; P.alive = !m.kia;
    P.tablet = !!m.tb; P.e = !!m.e; P.quad = m.q || null; P.scoped = !!m.sc; P.ammo = m.am; P.lastT = this.t;
    P.nv = !!m.nv;
    P.sy = m.sy || 0;
    P.wl = !!m.wl;
    P.ex = m.ex || {};
  }

  _sendState() {
    const P = this.player, r = (v) => Math.round(v * 100) / 100;
    const q = this._quadOut() ? [r(this.quad.x), r(this.quad.y), r(this.quad.z), r(this.quad.yaw), r(this.quad.pitch)] : 0;
    const total = P.arms.reduce((s, w) => s + w.mag + w.reserve + w.chamber, 0), full = P.arms.reduce((s, w) => s + w.def.mag * (1 + P._spare(w.def)), 0);
    this.send({
      t: 'cp', p: [r(P.pos.x), r(P.pos.y), r(P.pos.z)], y: r(P.yaw), pi: r(P.pitch), st: P.stance, w: P.def.slot === 'pistol' ? 1 : 0,
      mv: P.moving ? 1 : 0, sp: P.sprinting ? 1 : 0, ck: this.cloak.on ? 1 : 0, cf: this.cloak.flick > 0 ? 1 : 0, hp: Math.round(this.hp),
      dn: this.downed ? 1 : 0, kia: this.kia ? 1 : 0, tb: this.tablet.visible ? 1 : 0, e: this._eHeld ? 1 : 0, q, sc: P.scoped ? 1 : 0, am: r(total / full), nv: this.nv ? 1 : 0, sy: this.syncAim || 0, wl: this.wl.on ? 1 : 0, ex: this._abState(),
    });
  }

  _worldMsg() {
    const doors = Object.values(this.fac.doors).map((d) => [d.id, (d.open ? 1 : 0) | (d.sealed ? 2 : 0) | (d.unlocked ? 4 : 0) | (d.hackT > 0 ? 8 : 0) | (d.perm ? 16 : 0)]);
    return {
      t: 'cw', s: this.sentinel.snap(), o: this.obj, dr: doors, cr: this.crates.map((c) => [c.id, Math.round(c.x * 10) / 10, Math.round(c.y * 10) / 10, Math.round(c.z * 10) / 10, c.landed ? 1 : 0]),
      ia: this.prompts, lt: this.fac.lightState(), dv: this.fac.devices.filter((d) => d.t > 0).map((d) => d.id), md: this.medevac ? [this.medevac.x, this.medevac.y, this.medevac.z] : null,
      ai: this.aiShoot ? this.aiShoot.perch : -1, pins: this.pins.filter((p) => p.by === 'host-ai').length,
    };
  }

  _applyWorld(m) {
    this.sentinel.applySnap(m.s);
    const prevStep = this.obj.step;
    Object.assign(this.obj, m.o);
    if (this.obj.step !== prevStep) this._stepChanged(prevStep);
    for (const [id, fl] of m.dr) {
      const d = this.fac.doors[id];
      if (!d) continue;
      this.fac.setDoor(id, !!(fl & 1));
      d.sealed = !!(fl & 2); d.unlocked = !!(fl & 4); d.hackT = fl & 8 ? 1 : 0; d.perm = !!(fl & 16);
    }
    this.crates = m.cr.map(([id, x, y, z, l]) => ({ id, x, y, z, landed: !!l }));
    this.prompts = m.ia || {};
    this.fac.applyLightState(m.lt || []);
    for (const d of this.fac.devices) d.t = (m.dv || []).includes(d.id) ? Math.max(d.t, 0.3) : Math.min(d.t, 0);
    this.medevac = m.md ? { x: m.md[0], y: m.md[1], z: m.md[2] } : null;
    this.fac.relayPlanted = this.obj.relay;
  }

  _broadcast(ev) {
    this.send({ t: 'ev', ...ev });
  }

  _onEvent(m) {
    switch (m.k) {
      case 'resupply': if (m.role === this.role) this._resupply(); break;
      case 'sfxi': this.foley.interact({ x: m.x, y: m.y, z: m.z }, m.key); break;
      case 'ifakuse': if (this.isHost) this.obj.ifak[m.role] = Math.max(0, (this.obj.ifak[m.role] || 0) - 1); break;
      case 'medheal': if (m.role === this.role) this._medHeal(); break;
      case 'revive': if (m.role === this.role) this._revived(m.hp || 55); break;
      case 'kill': this._onKillEvent(m); break;
      case 'takedown': if (m.role === this.role) this._knife(); break;
      case 'lockdown': this._lockdownFx(); break;
      case 'ice': this.hud.flash('ICE ALERT', 'red'); break;
      case 'confirm': if (this.isHost) this.sentinel.confirm(m.id); break;
      case 'boom': this._boom(m); break;
      case 'blasthurt': if (m.role === this.role) this._damage(m.dmg, { x: m.x, z: m.z }); break;
      case 'sweepfx': this.isr.sweepFx = { x: m.x, z: m.z, r: m.r, t: 0 }; break;
      case 'xc': this._xrRemote(m.c); break;
      case 'chk': this._checkpointFx(); break;
      case 'tp': if (m.role === this.role) this.player.pos.set(m.x, m.y, m.z); break;
      case 'dart': this._addDart(m.d); break;
      case 'chain': if (this.role === 'shooter' || this.operative) this._chainKill(); break;
      case 'fcall': this._onFireCall(m, false); break;
      case 'vote': if (this.isHost) this._castVote(m.role, m.v); break;
      case 'heal': if (m.role === this.role) this._heal(m.hp); break;
      case 'ammo': if (m.role === this.role) this._ammo(); break;
      case 'trace': this.hud.flash('TRACED', 'red'); break;
      case 'decoy': this.audio.beep(new THREE.Vector3(m.x, 1, m.z), true); break;
      case 'quadhit': if (this.quad && this.quad.active) this._quadDamage(m.dmg); break;
      case 'noise': if (this.isHost) this.sentinel.noise({ x: m.x, y: m.y, z: m.z }, m.r, !!m.loud, !!m.grad); break;
      case 'fx': this._fx(m); break;
      case 'sfx': this._sentinelFx(m.ev); break;
      case 'aligned': case 'extracted': if (this.isHost) this._serverResult(m); break;
      case 'fumble': if (this.isHost) this.obj.trace = Math.min(0.99, this.obj.trace + 0.08); break;
      case 'drop': if (this.isHost) this._dropDrive(m.role, m.at); break;
      case 'light': if (this.isHost) this._shootLight(m.id, m.at); break;
      case 'radio': this._voice(m.who, m.text); break;
      case 'emelee': this._onMelee(m.ev); break;
      case 'nearmiss': if (this.isHost) this.sentinel.nearMiss(m.at, m.from); break;
      case 'block': if (this.isHost) { const g = this.sentinel.byId(m.id); if (g) { this.sentinel._alert(g, null, m.from); this.sentinel.emit({ t: 'fx', k: 'shield', id: m.id }); if (m.dmg) this.sentinel.wallDamage(m.id, m.dmg); } } break;
    }
  }

  // ---- helpers used by ops / tablet ------------------------------------------------
  localAgent() {
    const P = this.player;
    return { role: this.role, light: this.wlMine || null, pos: P.pos, yaw: P.yaw, stance: this.downed ? 2 : P.stance, moving: P.moving, sprinting: P.sprinting, cloak: this.cloak.on, cloakFlicker: this.cloak.flick > 0, alive: !this.kia, downed: this.downed, ghillie: !!(this.ab && this.ab.ghillie), laser: !!this.laserOn };
  }
  partnerAgent() {
    const Q = this.partner;
    if (Q.ai || !Q.seen) return null;
    return { role: Q.role, light: this.wlTheirs || null, pos: Q.pos, yaw: Q.yaw, stance: Q.downed ? 2 : Q.st, moving: Q.moving, sprinting: Q.sprinting, cloak: Q.cloak, cloakFlicker: Q.cloakFlicker, alive: Q.alive && !Q.kia, downed: Q.downed, ghillie: !!(Q.ex && Q.ex.gh), laser: !!(Q.ex && Q.ex.lz) };
  }
  agents() {
    return [this.localAgent(), this.partnerAgent()].filter(Boolean);
  }
  agentPos(role) {
    if (role === this.role) return this.player.pos;
    return this.partner.pos;
  }
  downedAgent() {
    if (this.downed && !this.kia) return this.role;
    if (!this.partner.ai && this.partner.downed && !this.partner.kia) return this.partnerRole;
    return null;
  }
  canQuad() {
    return (this.role === 'spotter' || this.operative) && !this.downed && !this.kia && this.quadCd <= 0 && !(this.quad && this.quad.active);
  }
  // Extra intel sources for the console: the recon quad, and enemies close to an agent.
  get extraReveal() {
    return (e) => {
      const ex = e.x, ez = e.z, ey = (e.y || 0) + 1.2;
      const qs = [];
      if (this.quad && this.quad.active) qs.push(this.quad);
      if (this.partner.quad) qs.push({ x: this.partner.quad[0], y: this.partner.quad[1], z: this.partner.quad[2], yaw: this.partner.quad[3] });
      for (const q of qs) {
        const d = Math.hypot(ex - q.x, ez - q.z);
        if (d < 45 && Math.abs(angDiff(Math.atan2(-(ex - q.x), -(ez - q.z)), q.yaw)) < 0.8 && this.fac.los(q, { x: ex, y: ey, z: ez })) return true;
      }
      for (const a of this.agents()) {
        if (!a.alive) continue;
        if (Math.hypot(a.pos.x - ex, a.pos.z - ez) < 25 && this.fac.los({ x: a.pos.x, y: a.pos.y + 1.5, z: a.pos.z }, { x: ex, y: ey, z: ez })) return true;
      }
      return false;
    };
  }

  comms(m, c = 'dim', who = null) {
    this.commsLog.push({ m, c, who, t: this.t });
    if (this.commsLog.length > 40) this.commsLog.shift();
    if (this.hud) this.hud.comms(m, c, who);
    if (this.tablet) this.tablet.dirty = true;
  }

  _toast(m, c = 'dim', who = null) {
    this.comms(m, c, who);
    if (this.isHost) this.send({ t: 'toast', m, c, who });
  }

  // A payload fired from the console (or the AI spotter). Host executes; guest forwards.
  payload(k, target) {
    if (this.isHost) this._execPayload(k, target, this.role === 'spotter' ? this.role : 'spotter');
    else if (k === 'crack' || k === 'fight') {
      // Held actions: batch them into ~10 messages a second.
      this._held = this._held || {};
      this._held[k] = (this._held[k] || 0) + target.dt;
      if (this._held[k] >= 0.1) { this.send({ t: 'ab', k, target: { dt: this._held[k] } }); this._held[k] = 0; }
    } else this.send({ t: 'ab', k, target });
    if (k === 'quad') this._startQuad();
  }

  _execPayload(k, target, by) {
    const S = this.sentinel, ob = this.obj;
    switch (k) {
      // The console's pulse only hears the network: drones, cameras, devices. People don't show.
      case 'scan': S.scanT = 4; for (const d of S.drones) if (d.state !== 'dead') { d.scanT = 4; d.tagT = Math.max(d.tagT, 8); } for (const c of S.cams) c.scanT = 4; this._toast('Network pulse \u2014 every drone, camera and device for 4 s. (People don\u2019t show: use the ISR sweep.)', 'cyan'); break;
      // ISR ping sweep: a circle on the ground; everything inside, flesh or machine, gets marked.
      case 'qmark': this._neuroMark(target.ids || [], !!target.auto); break;
      case 'pdrone': { const d = S.byId(target.id); if (d && d.state !== 'dead') { d.empT = 8; this._toast('Drone shorted out for 8 s.', 'cyan'); } break; }
      case 'swarm': {
        // The nano swarm reaches them about a second and a half later: silent kills.
        const ids = (target.ids || []).slice(0, 3);
        if (!this.isHost) break;
        if (by !== this.role) this._swarmFx(ids, target.from || { x: 0, y: 0, z: 0 });
        setTimeout(() => {
          for (const id of ids) {
            const e = S.byId(id);
            if (!e || e.state === 'dead') continue;
            S.damage(id, 999, 'swarm', null, 'head');
            this._killFeed(e, 'swarm', by, true, 0);
          }
        }, 1500);
        break;
      }
      case 'pcrash': {
        // Hacked out of the sky: rotors cut, it drops (a spotlight heli's wreck makes a crash).
        const d = S.byId(target.id);
        if (d && d.state !== 'dead') { d.state = 'dead'; d.hp = 0; d.fallV = 0; d.lock = null; S.emit({ t: 'kill', id: d.id, how: 'hack', drone: true }); this._toast(d.heli ? 'Spotlight drone hacked: it\u2019s coming down.' : 'Drone hacked out of the sky.', 'cyan'); }
        break;
      }
      case 'blind': { const e = S.byId(target.id); if (e && e.state !== 'dead') { e.blindT = 6; e.aw = 0; if (e.state === 'alert' || e.state === 'berserk') { e.state = 'search'; e.searchT = 6; e.target = null; } this._toast('Optics rebooted: he\u2019s blind for 6 s.', 'cyan'); } break; }
      case 'plight': this.fac.lightsOff((L) => L.id === target.id, 20); this._toast('Light taken out for 20 s.', 'dim'); break;
      case 'isrsweep': {
        let n = 0;
        for (const g of S.guards) if (g.state !== 'dead' && Math.hypot(g.x - target.x, g.z - target.z) < target.r) { g.tagT = Math.max(g.tagT, 15); n++; }
        for (const d of S.drones) if (d.state !== 'dead' && Math.hypot(d.x - target.x, d.z - target.z) < target.r) { d.tagT = Math.max(d.tagT, 15); n++; }
        for (const c of S.cams) if (Math.hypot(c.x - target.x, c.z - target.z) < target.r) { c.scanT = 6; n++; }
        this._toast(`ISR sweep: ${n} contact${n === 1 ? '' : 's'} marked for 15 s \u2014 red through walls.`, 'cyan');
        this._broadcast({ k: 'sweepfx', x: target.x, z: target.z, r: target.r });
        break;
      }
      case 'jam': S.jams.push({ x: target.x, z: target.z, r: PAYLOAD.jam.r, t: 5 }); this._toast('Earpieces jammed for 5 s.', 'cyan'); break;
      case 'melee': this._meleeHit(target, by); break;
      case 'camshot': { const c = S.cams.find((q) => q.id === target.id); if (c) { c.dead = true; c.empT = 1e6; c.aw = 0; } break; }
      case 'emp':
        {
          const room = this._roomFor(target);
          // Inside a building the pulse fills the room: shells, walls, cameras, lights.
          const er = target.r || PAYLOAD.emp.r;
          S.emp(target.x, target.z, room && !target.r ? er * 1.6 : er);
          if (room && !target.r) this.fac.lightsOff((L) => L.room === room.id, 15);
          else this.fac.lightsOff((L) => Math.hypot(L.x - target.x, L.z - target.z) < er && (!L.interior || Math.abs((L.y || 0) - (target.y || 0)) < 5), 10);
          // An EMP round also stops radios close by.
          if (target.r) for (const g of S.guards) if (g.state !== 'dead' && Math.hypot(g.x - target.x, g.z - target.z) < er) { g.jamT = Math.max(g.jamT, 6); g.radioT = 0; }
        }
        this._toast(target.r ? 'EMP round \u2014 electronics, shields and radios dark around the hit.' : 'EMP \u2014 drones, cameras and shields in the area dark for 7 s.', 'cyan');
        this._broadcastFx({ k: 'emp', x: target.x, z: target.z });
        break;
      case 'supply':
        if (ob.drops <= 0) break;
        ob.drops--;
        this.crates.push({ id: this.crateId++, x: target.x, z: target.z, y: terrainHeight(target.x, target.z) + 28, landed: false, vy: 5.5 });
        this._toast(`Supply drop inbound (${ob.drops} left).`, 'cyan');
        break;
      case 'lights': {
        // Inside, cyber reaches the whole room (20 s); outside, the lamps near the point (12 s).
        const room = this._roomFor(target);
        if (room) { this.fac.lightsOff((L) => L.room === room.id, 20); this._toast(`Lights taken out: ${room.name} for 20 s.`, 'cyan'); }
        else { this.fac.lightsOff((L) => !L.interior && Math.hypot(L.x - target.x, L.z - target.z) < 35, 12); this._toast('Yard lights near the mark taken out for 12 s.', 'cyan'); }
        break;
      }
      case 'spoof': S.spoofT = 10; this._toast('Cameras looped for 10 s.', 'cyan'); break;
      case 'decoy': this.decoys = (this.decoys || []).concat([{ x: target.x, z: target.z, t: 2.4, tick: 0 }]); this._broadcast({ k: 'decoy', x: target.x, z: target.z }); this.audio.beep(new THREE.Vector3(target.x, 1, target.z), true); break;
      case 'medevac': {
        const role = target && target.role;
        if (!role) break;
        const from = SPOTS.insert[0];
        this.medevac = { x: from.x, y: terrainHeight(from.x, from.z) + 18, z: from.z, role };
        this._toast('Medevac drone launched.', 'cyan');
        break;
      }
      case 'quad': break;
      case 'door': {
        const d = this.fac.doors[target.id];
        if (!d) break;
        if (d.kind === 'dock' && ob.drive) { d.perm = true; d.sealed = false; this._toast('Loading dock forced open. Get to the LZ!', 'cyan'); }
        else if (d.kind === 'mech') this._toast('That one\u2019s a mechanical lock \u2014 it has to be picked.', 'red');
        else if (!d.sealed) { d.unlocked = true; d.hackOpen = 2; this._toast('Door lock hacked \u2014 it\u2019s open to both of you.', 'cyan'); }
        break;
      }
      case 'cam': {
        const c = S.cams.find((q) => q.id === target.id);
        if (!c) break;
        c.hacked = true;
        c.loopT = HACK.camLoop;
        this._toast('Camera hacked: looped 9 s, feeding the console.', 'cyan');
        break;
      }
      case 'fight':
        if (ob.uploading) ob.trace = Math.max(0, ob.trace - HACK.fightRate * (target.dt || 0.1) * 2);
        break;
      case 'iot': {
        const d = this.fac.devices.find((q) => q.id === target.id);
        if (!d) break;
        d.t = 5;
        this.decoys = (this.decoys || []).concat([{ x: d.x, z: d.z, y: d.y, t: 4.5, tick: 0, r: 18, soft: true }]);
        this._broadcastFx({ k: 'iot', id: d.id });
        this._toast(`${d.kind.toUpperCase()} hacked \u2014 it\u2019s making a racket.`, 'cyan');
        break;
      }
      case 'sync': {
        const e = S.byId(target.id);
        if (e && e.hp > 0) { e.sync = target.on ?? !e.sync; e.tagT = Math.max(e.tagT, 60); e.tagBy = target.by || by; }
        break;
      }
      case 'tag': {
        const e = S.byId(target.id);
        // auto: a sight mark (crosshair), not a 'take him' call, so an AI Ra doesn't fire on it.
        if (e && e.hp > 0) { e.tagT = Math.max(e.tagT || 0, HACK.tag); e.tagBy = target.by || by; e.autoTag = !!target.auto; }
        break;
      }
      case 'perch':
        if (this.aiShoot && target.i !== this.aiShoot.perch) { this.aiShoot.moveTo = target.i; this.aiShoot.moveT = 9; this._toast(`Ra: relocating to ${SPOTS.perches[target.i].name}.`, 'amber', this.partnerName); }
        break;
    }
    void by;
  }

  _broadcastFx(ev) {
    this._fx(ev);
    this._broadcast({ k: 'fx', ...ev });
  }
  _fx(ev) {
    if (ev.k === 'iot') {
      const d = this.fac.devices.find((q) => q.id === ev.id);
      if (d) { d.t = 5; for (let i = 0; i < 6; i++) setTimeout(() => this.audio.beep(new THREE.Vector3(d.x, d.y, d.z), i % 2 === 0), i * 260); }
    }
    if (ev.k === 'emp') {
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.5, 1, 40).rotateX(-Math.PI / 2), glowMat('#60c0ff', 0.6));
      ring.position.set(ev.x, terrainHeight(ev.x, ev.z) + 0.5, ev.z);
      this.scene.add(ring);
      this.trails.push({ mesh: ring, t: 0, life: 0.8, ring: PAYLOAD.emp.r });
    }
  }

  _addPin(m, local = true) {
    this.pins.push({ x: m.x, z: m.z, label: m.label || 'PING', by: m.by, t: 12 });
    if (this.pins.length > 6) this.pins.shift();
    if (!local) this.comms(`${this.partnerName}: ${m.label === 'PING' ? 'look here.' : 'requests ' + m.label + '.'}`, ROLES[this.partnerRole].color, this.partnerName);
    this.audio.ping && this.audio.ping();
  }

  // Shooter's requests (solo: the AI spotter answers; co-op: a pin on the spotter's console).
  request(kind) {
    const P = this.player.pos;
    const label = kind.toUpperCase();
    if (this.solo && this.ops) {
      const k = { scan: 'scan', supply: 'supply', lights: 'lights', decoy: 'decoy', jam: 'jam', emp: 'emp', spoof: 'spoof' }[kind];
      if (kind === 'door') {
        const d = Object.values(this.fac.doors).filter((q) => q.kind === 'elec' || q.kind === 'dock').sort((a, b) => Math.hypot(a.x - P.x, a.z - P.z) - Math.hypot(b.x - P.x, b.z - P.z))[0];
        const why = d ? this.ops.hack('door', d.id) : 'NO DOOR';
        this.comms(why ? `Rōnin: can’t — ${why.toLowerCase()}.` : 'Rōnin: on the door.', 'cyan', this.partnerName);
        return;
      }
      const aim = this._aimPoint();
      const why = this.ops.use(k, PAYLOAD[k].aim ? (kind === 'supply' ? { x: P.x + 1.5, z: P.z + 1 } : aim) : null);
      this.comms(why ? `Rōnin: can’t — ${why.toLowerCase()}.` : `Rōnin: ${PAYLOAD[k].name.toLowerCase()}, on it.`, 'cyan', this.partnerName);
      return;
    }
    const at = kind === 'supply' || kind === 'door' ? { x: P.x, z: P.z } : this._aimPoint();
    const pin = { x: at.x, z: at.z, label, by: this.role };
    this._addPin(pin);
    this.send({ t: 'pin', ...pin });
    this.comms(`Requested ${label.toLowerCase()}.`, ROLES[this.role].color, this.name);
  }

  _aimPoint() {
    const o = this.player.eyePos(new THREE.Vector3());
    const dir = this.player.aimDir(new THREE.Vector3());
    const h = this.fac.ray(o, o.clone().addScaledVector(dir, 400), 'shot');
    const p = h ? h.point : o.clone().addScaledVector(dir, 120);
    return { x: p.x, z: p.z };
  }

  get missionTitle() {
    return MISSIONS[this.mission].title;
  }
  // Title with the colour split: SNIPER (white) CELL (red) : MISSION (cyan).
  get titleHTML() {
    return `<span class="t-w">NIGHT</span><span class="t-r">WATCH</span><span class="t-w">:</span> <span class="t-c">${MISSIONS[this.mission].name}</span>`;
  }
  get missionLine() {
    return MISSIONS[this.mission].line;
  }
  _nameFor(role) {
    return role === this.role ? this.name : this.partnerName;
  }
  _afterIntro() {
    this.comms('Weapons free on your call. Stay in the dark.', 'dim');
    // Overwatch's briefing: short, clipped radio lines, each typed out as its own subtitle.
    for (const line of BRIEF[this.mission === 'nightwatch' ? 'nightwatch' : 'infiltration']) if (this.drop.approach || !/^Pickets/.test(line)) this._voice('isr', line, true);
    this.input.requestLock();
  }

  // ---- frame -----------------------------------------------------------------------
  _frame() {
    let dt = Math.min(this.clock.getDelta(), 1 / 20);
    this.t += dt;
    hazeUniforms.uTime.value = this.t;
    if (this.cine.active) return this._cineFrame(dt);
    const a = this.input.actions;
    if (this.net) this.net.tick(dt);
    this.chat.update();
    // Paused in solo: the world freezes (co-op keeps running; your partner is still out there).
    if (!this.ended && !(this.paused && this.solo)) {
      this._updateLocal(dt, a);
      // Quickhack scan slows the world when you play solo.
      if (this.isHost) this._hostTick(this.solo && this.qh && this.qh.on ? dt * 0.3 : dt);
      this._netTick(dt);
    } else this.input.endFrame();
    this._updatePartner(dt);
    this.sentinel.draw(dt, this.camera.position);
    this.fac.update(dt);
    this._visuals(dt);
    this.effects.update(dt, this.camera);
    this.audio.setListener(this.camera);
    this._render(dt);
    this.hud.update(dt);
    this.tablet.update(dt);
  }

  // While a cut-scene runs: the world keeps ticking (host), the camera is the director's.
  _cineFrame(dt) {
    const C = this.cine;
    C.update(dt);
    this.input.endFrame();
    if (this.net) this.net.tick(dt);
    if (C.active === 'intro') {
      if (this.isHost) this._hostTick(dt);
      this._netTick(dt);
      this._updatePartner(dt);
      this.sentinel.draw(dt, C.cam.position);
      this.fac.update(dt);
      this._visuals(dt);
      this.effects.update(dt, C.cam);
      this.camera.position.copy(C.cam.position);
      this.camera.quaternion.copy(C.cam.quaternion);
      this.camera.fov = C.cam.fov;
      this.camera.updateProjectionMatrix();
      this.viewmodel.visible = false;
      // Only the cut-scene's own two operators: hide the gameplay models waiting at the drop.
      this.partner.avatar.setVisible(false);
      this.selfAvatar.setVisible(false);
      if (this.irLasers) { this.irLasers.partner.set(this.camera.position, this.camera.position, false); this.irLasers.me.set(this.camera.position, this.camera.position, false); }
      if (this.strobes) for (const k of ['partner', 'self']) for (const st of this.strobes[k] || []) st.visible = false;
    }
    this.audio.setListener(C.active === 'outro' ? C.cam : this.camera);
    if (!C.render(this.renderer)) this._render(dt);
    if (this.ended) this.hud.update(dt);
  }

  _netTick(dt) {
    if (!this.net) return;
    this._stT = (this._stT || 0) - dt;
    if (this._stT <= 0) { this._stT = 0.05; this._sendState(); }
    if (this.isHost) {
      this._wT = (this._wT || 0) - dt;
      if (this._wT <= 0) { this._wT = 0.1; this.send(this._worldMsg()); }
    }
  }

  _updateLocal(dt, a) {
    const P = this.player, I = this.input;
    const tab = this.tablet.visible;
    let quad = this.quad && this.quad.active;
    // Keys for this mode.
    // TAB: the spotter taps it for the tablet (tap again: ISR, again: back to first person)
    // and holds it for quickhacks (phone out). The shooter's TAB is just the map.
    if (this.role === 'spotter' || this.operative) {
      // TAB toggles the tablet (ISR is a button inside it, or I).
      const cycle = () => {
        if (this.tablet.visible) this.tablet.close();
        else if (this.isr.active) this.isr.exit();
        else this._raise('tablet', () => this.tablet.open());
      };
      if (!I.held('Tab')) this._tabBlock = false;
      if (this.tablet.visible || this.isr.active) { if (I.pressed('Tab') || I.pressed('cell-tab')) { cycle(); this._tabBlock = true; } this._tabT = 0; }
      else if (this._tabBlock) this._tabT = 0;
      else if (I.held('Tab') && !this.downed) {
        this._tabT = (this._tabT || 0) + dt;
        if (this._tabT > 0.22 && !this.qh.on) this._qhEnter();
      } else {
        if (this._tabT > 0 && this._tabT <= 0.22) cycle();
        else if (this._tabT > 0.22) this._qhExit();
        this._tabT = 0;
        if (I.pressed('cell-tab')) cycle();
      }
      if (I.pressed('cell-hack')) { if (this.qh.on) this._qhExit(); else this._qhEnter(); }
      // Desktop: hold H to have the phone out; let go to put it away.
      if (!this.operative) {
        if (I.held('KeyH') && !this.downed) { if (!this.qh.on && !this._hHold) { this._qhEnter(); this._hHold = true; } }
        else if (this._hHold) { this._hHold = false; if (this.qh.on) this._qhExit(); }
      }
    } else if (I.pressed('Tab') || I.pressed('cell-tab')) {
      // Shooter: TAB raises the map tablet; in the ISR view it flips back to the tablet.
      if (this.isr.active) { this.isr.exit(); this.tablet.open(); }
      else if (this.tablet.visible) this.tablet.close();
      else this._raise('tablet', () => this.tablet.open());
    }
    if ((I.pressed('KeyL') || I.pressed('cell-light')) && !tab) this._wlToggle();
    // N: on the KR-50's scope it flips the optic between night vision and plain glass;
    // otherwise it's the goggles.
    if (I.pressed('KeyN') || I.pressed('cell-nv')) {
      if (P.def.scope && P.scopeT > 0.6) { this.scopeNV = !this.scopeNV; this.audio.click(); this.hud.flash(this.scopeNV ? 'SCOPE: NIGHT VISION' : 'SCOPE: PLAIN', 'dim', 0.7); }
      else this._nvgToggle();
    }
    // Objective board: O shows / hides it, P expands / compacts it (P is the sweep in the ISR view).
    if (I.pressed('KeyO')) this.hud.objToggle();
    if (I.pressed('KeyP') && !this.isr.active) this.hud.objExpand();
    // B: tap = fire mode (SMG) / suppressor (pistols); hold = suppressor on the SMG.
    const bHeld = (I.held('KeyB') || I.held('T:cell-sup')) && !tab;
    if (bHeld) { this._bT = (this._bT || 0) + dt; if (this._bT > 0.45 && !this._bDone) { this._bDone = true; this._toggleSup(); } }
    else { if (this._bT > 0 && !this._bDone) { if (P.w.def.modes) this._cycleMode(); else this._toggleSup(); } this._bT = 0; this._bDone = false; }
    if ((this.role === 'spotter' || this.operative) && (I.pressed('KeyI') || I.pressed('cell-isr')) && !tab && !quad && !this.downed) { if (this.isr.active) this.isr.exit(); else this._raise('isr', () => this.isr.enter()); }
    if ((I.pressed('KeyJ') || I.pressed('cell-drop')) && this.obj.drive === this.role) { if (this.isHost) this._dropDrive(this.role, this.player.pos); else this._broadcast({ k: 'drop', role: this.role, at: { x: this.player.pos.x, y: this.player.pos.y, z: this.player.pos.z } }); }
    const pr = this.prompts[this.role];
    if ((I.pressed('KeyE') || I.pressed('cell-use')) && pr && (pr.key === 'jack' || pr.key === 'extract') && !tab) this._serverMinigame(pr.key);
    if (this.role === 'shooter' && (I.pressed('KeyF') || I.pressed('cell-ability')) && !this.downed) this._toggleCloak(); // F: the ability key
    if ((I.pressed('KeyG') || I.pressed('cell-ifak')) && !tab) this._useIfak();
    // Recon quad: tap Q = launch / park it (it keeps marking) / take it back; hold Q (or RECALL)
    // = quick calldown, straight back to you.
    // Recon quad (spotter / lone operative): tap Q = launch / park / take it back; hold Q (or
    // RECALL) = quick calldown. Q does nothing else.
    {
      const canQ = this.role === 'spotter' || this.operative;
      const qa = this.operative ? 'cell-quad' : 'cell-ability';
      // Desktop: F, the ability key (a lone operative: Y, since F is his camo) — Q is ping and marking.
      const qHeld = canQ && (I.held(this.operative ? 'KeyY' : 'KeyF') || I.held('T:' + qa)) && !tab;
      if (qHeld) {
        this._qT = (this._qT || 0) + dt;
        if (this._qT > 0.45 && !this._qDone && this._quadOut()) { this._qDone = true; this._recallQuad(); }
      } else {
        if (canQ && this._qT > 0 && !this._qDone) {
          if (quad) this._parkQuad();
          else if (this.quad && this.quad.parked) this._resumeQuad();
          else { const why = this.ops.use('quad'); if (why) this.hud.flash(why, 'red'); }
        }
        this._qT = 0; this._qDone = false;
      }
      if (I.pressed('cell-recall') && this._quadOut()) this._recallQuad();
      // A park / recall / launch just now changes what this frame drives.
      quad = !!(this.quad && this.quad.active);
    }
    // T (or SYNC): mark the enemy under the crosshair as your teammate's sync target.
    {
      // (Tagging lives on Q / PING; F is the ability key.)
      const fHeld = I.held('KeyT') && !tab && !this.downed;
      const mark = () => { const e = this._crosshairEnemy(); if (e && e.kind === 'g') this._syncMark(e); else this.hud.flash('SYNC: look at an enemy', 'red'); };
      if (I.pressed('cell-sync') && !quad && !tab && !this.downed) mark();
      if (fHeld) {
        this._fT = (this._fT || 0) + dt;
        if (!this._fDone && this._fT > 0.35 && !quad) {
          this._fDone = true;
          mark();
        }
      } else {
        if (this._fT > 0 && !this._fDone && !quad) mark();
        this._fT = 0; this._fDone = false;
      }
    }
    this._eHeld = (I.held('KeyE') || I.held('T:cell-use')) && !tab && !this.mini.open;
    const isr = this.isr.active;
    if (this.ops) this.ops.update(dt);
    if (this.aiSpot) this.aiSpot.update(dt);
    this._kitUpdate(dt);
    this.quadCd = Math.max(0, this.quadCd - dt);
    if (!this._quadOut() && this.quadBat !== undefined) this.quadBat = Math.min(QUAD_BAT, this.quadBat + dt * 3);
    if (this.quad && this.quad.parked && this.quad.auto && !this.quad.recall) this._quadAuto(dt);
    if (this.quad && this.quad.parked) { this.quad.bat -= dt * 0.25; if (this.quad.bat <= 0) { this.comms('Drone battery dead \u2014 it\u2019s coming home.', 'cyan', this.name); this._endQuad(); } }

    // Cloak battery (PlanetSide-style): moving drains it (sprinting faster); holding still
    // while cloaked trickles it back in; switched off it recharges at the full rate.
    const C = this.cloak;
    C.flick = Math.max(0, C.flick - dt);
    C.lockT = Math.max(0, (C.lockT || 0) - dt);
    if (C.on) {
      if (P.moving) C.bat -= (P.sprinting ? 20 : 12) * dt;
      else C.bat = Math.min(100, C.bat + 2.5 * this.D.camo * dt);
      if (C.bat <= 0) { C.bat = 0; C.on = false; this.hud.flash('CAMO DEPLETED', 'red'); this.audio.click(); }
      C.regenT = 2;
    } else {
      C.regenT -= dt;
      if (C.regenT <= 0) C.bat = Math.min(100, C.bat + 7 * this.D.camo * (this.loadout.shooter.perk === 'camo' && this.role === 'shooter' ? 1.5 : 1) * dt);
    }

    // Downed: bleed out unless your partner (or a medevac) gets you up.
    if (this.downed && !this.kia) {
      this.bleed -= dt;
      if (this.bleed <= 0) { this.kia = true; this.comms(`${this.name} is KIA.`, 'red'); this._dropDriveIfCarrying(); }
    }

    const live = !this.downed && !this.kia;
    const act = { ...a };
    this._qhTick(dt, I, act);
    this._cmdKeys(I);
    if (I.pressed('cell-menu') && this._cwMenuOpen) this._cwMenuOpen(); // MENU: the command wheel, tap to pick
    if (this.qh.on) this._eHeld = false;
    this._kitKeys(dt, I, tab, quad, live, act);
    this._abInput(dt, I, act, live && !tab && !quad);
    // Spotter's binoculars: X (or BINO) to swap from the P-9; scope raises them.
    if ((this.role === 'spotter' || this.operative) && (I.pressed('KeyX') || I.pressed('cell-bino')) && live && !tab && !quad && (this.role === 'spotter' || !this.operative)) this._binoToggle();
    // Binocular zoom: mouse wheel, +/-, or the touch ZOOM buttons while they're raised.
    if (this.bino.on && this.bino.up) {
      const B = this.bino, zi = B.zi ?? 1;
      if (act.zoomIn && zi < BINO_FOV.length - 1) { B.zi = zi + 1; this.audio.click(); }
      else if (act.zoomOut && zi > 0) { B.zi = zi - 1; this.audio.click(); }
      act.zoomIn = act.zoomOut = false;
    }
    // Spotter: through the raised binoculars, fire marks the enemy under the crosshair for the
    // nano drones; SWARM (or E) sends them.
    if (this.role === 'spotter' && live && !tab && !quad && this.nano) {
      if (this.bino.on && this.bino.up) {
        // Looking at an enemy for a moment marks it for the swarm; FIRE sends the swarm.
        const t = this._nanoAt(innerWidth / 2, innerHeight / 2), N = this.nano;
        if (t && t.id === this._lookId) this._lookT = (this._lookT || 0) + dt; else { this._lookId = t ? t.id : null; this._lookT = 0; }
        if (t && this._lookT > 0.35 && !N.marks.includes(t.id) && N.marks.length < N.ch) this._nanoMark(t.id);
        if (act.fire) { this._nanoSend(); act.fire = act.fireHeld = false; }
      }
      if (I.pressed('cell-swarm') || (this.bino.on && this.bino.up && I.pressed('KeyE'))) this._nanoSend();
      if (I.pressed('cell-lase') || (this.bino.on && this.bino.up && I.pressed('KeyR'))) { this._lase(); act.reload = false; }
    }
    if (this.bino.on) { act.fire = false; act.fireHeld = false; act.reload = false; if (P.def.slot !== 'pistol' && P.arms.some((w) => w.def.slot === 'pistol')) this._binoToggle(false); }
    if (this.bino.on && this.knifeEq) this.knifeEq = false; // X raised the binoculars
    // No shooting while the phone is up (quickhack mode uses fire to run a hack on its own).
    if (this.qh && !this.qh.on && (this.qh.vis || 0) > 0.15) { act.fire = act.fireHeld = false; }
    // ROUNDS (sniper): tap to load the next type, press and hold for a radial.
    if ((this.role === 'shooter' || this.operative) && this.xr) {
      if (I.pressed('cell-rounds') && !this._rdHold) this._rdHold = { t0: performance.now() };
      if (this._rdHold) {
        const R = this._rdHold;
        if (I.held('T:cell-rounds')) {
          if (performance.now() - R.t0 > 350 && !R.open) {
            R.open = true;
            const items = ROUND_CYCLE.map((k) => ({ k, label: `${ROUND_SHORT[k]} \u00D7${this._roundsCount(k)}`, group: 'req', icon: '\u25AE' }));
            if (this.rdWheel) this.rdWheel.el.remove();
            this.rdWheel = new Wheel(items, { id: 'cell-rdwheel', centre: 'ROUNDS', fallback: null });
            const btn = document.querySelector('#touch [data-act="cell-rounds"]'), r = btn ? btn.getBoundingClientRect() : { left: 160, top: 200, width: 0, height: 0 };
            this.rdWheel.show(Math.max(150, r.left + r.width / 2 + 60), Math.max(150, Math.min(innerHeight - 150, r.top + r.height / 2)), `NOW: ${ROUND_SHORT[this._roundsCur()]}`);
            if (!this._rdMove) { this._rdMove = true; addEventListener('touchmove', (e) => { const W = this.rdWheel, b = document.querySelector('#touch [data-act="cell-rounds"]'); if (!W || !W.open || !b) return; for (const t of e.changedTouches) if (t.identifier === b._tid) W.point(t.clientX, t.clientY); }, { passive: true }); }
          }
        } else {
          if (R.open && this.rdWheel) { const k = this.rdWheel.close(); if (k && k !== this._roundsCur()) this._ammoSwap(k); }
          else this._roundsCycle();
          this._rdHold = null;
        }
      }
    }
    // During a takedown animation you're committed: no moving, looking or shooting.
    if (this.tdAnim) { act.mx = act.my = 0; act.lookX = act.lookY = 0; act.fire = act.fireHeld = act.scope = act.sprint = act.jump = act.reload = false; }
    // In knife reach of an enemy: FIRE becomes a melee takedown.
    this._tdTarget = live && !tab && !quad && !isr && !(this.bino && this.bino.on) && !this.deSeq ? this._meleeTarget() : null;
    if (this._tdTarget && act.fire && !(this.qh && this.qh.on)) { this._melee(); act.fire = act.fireHeld = false; }
    this._wpnInput(dt, I, act, live && !tab && !quad && !isr && !this.mini.open);
    const seat = this._seat();
    if (!live || tab || quad) {
      act.fire = false; act.fireHeld = false; act.scope = false; act.reload = act.reload && live && !quad;
      act.lookX = tab || !live ? 0 : act.lookX; act.lookY = tab || !live ? 0 : act.lookY;
      act.crouch = act.prone = act.jump = false;
      act.zoomIn = act.zoomOut = false;
      act.slot1 = act.slot2 = act.swap = false;
    }
    if (quad) { act.mx = 0; act.my = 0; act.sprint = false; act.lookX = 0; act.lookY = 0; }
    if (isr || this.mini.open) {
      if (isr) this.isr.control(dt, act, I);
      if (isr && (I.pressed('KeyP') || I.pressed('cell-sweep'))) this._isrSweep();
      act.mx = act.my = 0; act.sprint = act.jump = act.crouch = act.prone = false; act.fire = act.fireHeld = act.scope = false; act.lookX = act.lookY = 0; act.zoomIn = act.zoomOut = false; act.slot1 = act.slot2 = act.swap = false; act.reload = false;
    }
    else if (I.pressed('cell-sweep') && (this.role === 'spotter' || this.operative) && !tab && !quad && !this.downed) {
      // SWEEP outside the ISR view: the drone sweeps the ground under your crosshair.
      this._pointCmd({ k: 'sweep', name: 'ISR SWEEP', p: null });
    }
    if (seat) { act.mx = act.my = 0; act.sprint = act.jump = act.crouch = act.prone = false; act.fire = act.fireHeld = false; act.scope = false; }
    if (this.role === 'spotter') { act.slot1 = act.slot2 = act.swap = false; if (!P.scoped) act.zoomIn = act.zoomOut = false; }
    act.zeroUp = act.zeroDown = false;
    act.breath = !!(this.ab && this.ab.breath.on);
    // Dragging a body: both hands on him, so no sprint, no gun, a slow walk.
    const dragging = !!(this.obj.drag && this.obj.drag[this.role]);
    P.noSprint = (!!this.obj.drive && this.obj.drive === this.role) || dragging;
    P.speedMul = (tab ? 0.55 : 1) * (dragging ? 0.5 : 1);
    if (dragging) { act.fire = act.fireHeld = act.scope = act.reload = false; P.scoped = false; }
    if (this.downed) { P.stance = 2; }
    // Pulling the trigger while running drops you out of the sprint (and the shot goes).
    if ((act.fire || act.fireHeld) && live && !quad && !tab && (P.sprinting || act.sprint)) this._noSprintT = 0.4;
    if (this._noSprintT > 0) { this._noSprintT -= dt; act.sprint = false; }
    P.update(dt, act, this.fac, { canMove: live && !quad && !seat });
    if (seat) { const w = this._seatWorld(seat); P.pos.set(w.x, w.y - P.eye + 0.62, w.z); P.vel.set(0, 0, 0); P.stance = 0; this._wasSeated = seat; }
    else if (this._wasSeated) { const d = this._doorWorld(this._wasSeated); P.pos.set(d.x, this.fac.groundAt(d.x, d.z, 5, 0.5), d.z); this._wasSeated = null; }
    if (this.downed) { P.vel.x *= 0.2; P.vel.z *= 0.2; }
    if (P.def.kind === 'bolt' && P.boltEvent) { P.boltEvent = false; this.audio.bolt(0.05); }
    if (quad && this.quad && this.quad.active) this._updateQuad(dt, a); // (a recall this frame ends it)

    // Fire. (A green sync pulls the trigger for you.)
    if (this._autoFire) { this._autoFire = false; if (live && !quad && !seat) { act.fire = true; this._syncShotId = this.syncAim; } }
    if (this.supAnim) { act.fire = false; act.fireHeld = false; }
    if (this._deadeyeStep(dt, act, live && !quad && !tab)) { act.fire = false; act.fireHeld = false; }
    const mode = P.w.mode;
    if (act.fire && live && P.w.chamber === 0 && P.w.mag === 0) { this.audio.click(); if (P.w.reserve > 0) P.startReload(); }
    else if (live && mode === 'full') { if (act.fireHeld || act.fire) { if (P.canFire()) this._fire(); } }
    else if (live && mode === 'burst') {
      this._burstGap = Math.max(0, (this._burstGap || 0) - dt);
      if ((act.fire || (act.fireHeld && this._burstGap <= 0)) && !(this._burst > 0)) this._burst = 3;
      if (this._burst > 0 && P.canFire()) { this._fire(); this._burst--; if (!this._burst) this._burstGap = 0.22; }
      if (P.w.chamber === 0 && P.w.mag === 0) this._burst = 0;
    } else if ((act.fire || act.fireHeld) && live && P.canFire()) this._fire(); // hold to keep firing at the weapon's rate
    // Footsteps make noise (running only, cloak halves it).
    if (P.moving && P.onGround && live) {
      this._stepT = (this._stepT || 0) - dt * (P.sprinting ? 1.6 : 1);
      if (this._stepT <= 0) {
        this._stepT = 0.46;
        if (P.sprinting) this._noise(P.pos, C.on ? 4 : 8, false);
      }
    }
    // Camera.
    if (isr) {
      this.isr.apply(this.camera);
    } else if (quad) {
      const q = this.quad;
      this.camera.position.set(q.x, q.y, q.z);
      this.camera.rotation.set(q.pitch, q.yaw, 0);
      this.camera.fov = 70;
    } else if (this.kia || this.downed) {
      // Third person over your own body (or your partner's, once you are KIA).
      const tgt = this.kia && this.partner.seen ? this.partner.pos : P.pos;
      const yaw = this.kia ? (this.partner.yaw || 0) + Math.sin(this.t * 0.15) * 0.6 : P.yaw;
      const back = new THREE.Vector3(Math.sin(yaw) * 4.5, 2.6, Math.cos(yaw) * 4.5);
      this.camera.position.copy(tgt).add(back);
      this.camera.lookAt(tgt.x, tgt.y + 0.6, tgt.z);
      this.camera.fov = WEAPON.baseFov;
    } else {
      P.eyePos(this.camera.position);
      // Recoil kick on top of your aim, settling back over ~0.25 s.
      const k = this.camKick || 0, ky = this.camKickYaw || 0;
      const sw = P.def.slot === 'rifle' && P.scopeT > 0.5 ? this._swayOff() : { x: 0, y: 0 };
      this.camera.rotation.set(P.pitch + k + sw.y, P.yaw + ky - sw.x, -ky * 0.6);
      this.camKick = k * Math.exp(-dt * 11);
      this.camKickYaw = ky * Math.exp(-dt * 11);
      this.camera.fov = this.bino && this.bino.on ? P.fov() + (BINO_FOV[this.bino.zi ?? 1] - P.fov()) * this.bino.k : P.fov();
    }
    this.camera.updateProjectionMatrix();
    // First-person weapon.
    const scopedRifle = P.def.scope && P.scopeT > 0.6;
    this.viewmodelVisible = live && !quad && !tab && !seat && !isr && !this.devAnim && !(this.dragK > 0.5);
    this.viewmodel.visible = this.viewmodelVisible && !scopedRifle && !(this.knifeT > 0) && !this.tdAnim && !(this.bino && this.bino.on) && !this.knifeEq;
    // Suppressor cans (mid-gesture the can shows while it's in your hand).
    const supU = this._supTick(dt), SA = this.supAnim;
    const canShow = (w) => (SA && SA.w === w ? (SA.to ? supU > 0.18 : supU < 0.82) : !!w.sup);
    const canOf = (w) => (w.def.key === 'm18' ? this.pistolCan : (this.viewmodel.models[w.def.key] || {}).userData?.can);
    for (const w of P.arms) { const c = canOf(w); if (c) c.visible = canShow(w); }
    this.carry.visible = this.obj.drive === this.role && live && !quad && !isr;
    this._knifeTick(dt);
    this._tdTick(dt);
    this._dragTick(dt);
    this._lureAnimTick(dt);
    if (!this.tdAnim) this._wpnTick();
    // Deadeye: the M50 in the right hand, the KR-50 lowered in the left.
    const DE = this.deSeq;
    // Quick-swap (sniper, CoD-style): pull a handgun and the KR-50 drops to the support hand,
    // held low on the left, while the pistol comes up one-handed on the right. Swap back while
    // it's still in your hand and it snaps straight up. Keep the pistol out a few seconds (no
    // shots) and the rifle is slung and the left hand joins the pistol. (Not for the SMG: that's
    // a two-handed gun.)
    const QDS = 3.2;
    if ((this.role === 'shooter' || this.operative) && !DE) {
      const toSlot = P.switchT > 0 && P.pendingSlot >= 0 ? P.pendingSlot : P.slot;
      const side = P.arms[1] && P.arms[1].def;
      const handgun = !!side && side.slot === 'pistol' && side.key !== 'smg';
      if (toSlot === 1 && this._qdSlot !== 1) {
        this.quickDraw = handgun ? { t: 0, stow: 0 } : null;
        if (handgun && P.switchT > 0.5) P.switchT = 0.5; // a fast draw
      }
      if (toSlot === 0 && this._qdSlot === 1 && this.quickDraw && this.quickDraw.stow < 0.5 && P.switchT > 0.45) P.switchT = 0.45; // rifle still in hand
      if (toSlot !== 1) this.quickDraw = null;
      const Q = this.quickDraw;
      if (Q && P.slot === 1) {
        if (P.cycleT > 0) Q.t = 0; // still shooting: keep the rifle ready
        Q.t += dt;
        if (Q.t > QDS) Q.stow = Math.min(1, Q.stow + dt / 0.5);
      }
      this._qdSlot = toSlot;
    }
    const QDo = !DE && this.quickDraw && P.slot === 1 && !this.knifeEq ? this.quickDraw : null;
    const QD = !!QDo && QDo.stow < 1;
    // The slung rifle: down and out of view to the lower left.
    const qs = QDo ? QDo.stow * QDo.stow * (3 - 2 * QDo.stow) : 0;
    // The lowered gun in the left hand: the one you were holding (Deadeye with the SMG out
    // lowers the SMG; with the M50 already out there's nothing to lower). Held low by the
    // forend, angled up and away to the left, the stock tucked down out of the view (close to
    // the lens it would fill the screen). Slung: it drops straight down and out.
    const low = DE ? (P.def.key === 'smg' ? this.deSmg : P.def.key === 'mag50' ? null : this.deRifle) : QD ? this.deRifle : null;
    for (const m of [this.deRifle, this.deSmg]) {
      if (!m) continue;
      const smg = m === this.deSmg;
      m.position.set((smg ? -0.27 : -0.3) - 0.1 * qs, (smg ? -0.33 : -0.36) - 0.42 * qs, smg ? -0.6 : -0.72);
      m.rotation.set(0.25 + 0.15 * qs, smg ? 0.8 : 0.9, 0.5);
      m.visible = m === low && this.viewmodel.root.visible;
    }
    // The support hand stays on the lowered gun's forend.
    let qdHand = null;
    if (low) { low.updateMatrix(); qdHand = low.userData.gripL.position.clone().applyMatrix4(low.matrix).add(new THREE.Vector3(0, -0.02, 0)); }
    this.viewmodel.update(dt, {
      def: DE ? MAGNUM : P.def, scopeT: DE ? 0.35 : P.scopeT, leftHand: qdHand, cant: !DE && !QD && this.settings.pistolCant !== false, irCant: !DE && !QD && !!this.nv, speed: P.speed, sprint: P.sprinting, bobPhase: P.bobPhase, cycleT: P.cycleT,
      reloadT: DE ? 0 : P.reloadT, reloadDur: P.reloadDur, reloadEmpty: P.reloadEmpty, switchT: DE ? DE.switchT : P.switchT, bipodT: 0, bipodState: 'stowed', bipodU: 0,
      empty: !DE && P.w.chamber === 0 && P.def.kind === 'semi', boltPending: false,
      supU: SA ? supU : 0, supTo: SA ? SA.to : false, supCan: SA ? canOf(SA.w) : null,
      leftOff: Math.max(this.qh ? Math.min(1, (this.qh.vis || 0) * 1.6) : 0, this.lureAnim ? 1 : 0),
    });
    this._nvScopeGlow(dt);
    this._reloadSfx(P);
    this._cloakViewmodel(C.on);
    this.input.isScoped = P.scoped;
    this.input.endFrame();
  }

  // Reload Foley on a timeline through the reload: mag out, mag in, then chamber (bolt, handle
  // or slide) when it was empty. Swapping round types runs the same.
  _reloadSfx(P) {
    const R = this._rl || (this._rl = { on: false, u: 0, key: '' });
    const live = P.reloadT > 0 && P.reloadDur > 0;
    if (!live) { R.on = false; return; }
    const u = 1 - P.reloadT / P.reloadDur, key = P.def.key;
    if (!R.on) { R.on = true; R.u = 0; R.key = key; R.empty = !!P.reloadEmpty; }
    const F = this.foley, at = (x) => R.u < x && u >= x;
    if (at(0.12)) F.magOut(key);
    if (at(0.55)) F.magIn(key);
    if (R.empty && at(0.8)) F.charge(key);
    R.u = u;
  }

  // KR-50 eyepiece: a soft green-white glow while the scope is in night vision, flashing
  // brighter as it switches on or the rifle comes up.
  _nvScopeGlow(dt) {
    const kr = this.viewmodel.models.kr50, U = kr && kr.userData;
    if (!U || !U.eye) return;
    const on = this.scopeNV !== false, cur = this.viewmodel.current === 'kr50';
    if ((on && !this._nvLensOn) || (cur && !this._nvLensCur)) this._nvFlash = 1;
    this._nvLensOn = on; this._nvLensCur = cur;
    this._nvFlash = Math.max(0, (this._nvFlash || 0) - dt * 2.2);
    // Faint at rest (a dim green tint in the eyepiece and a thin halo), a brief white flash.
    const k = on ? 0.1 + 0.9 * this._nvFlash * this._nvFlash + 0.02 * Math.sin(this.t * 7) : 0;
    U.eye.material.color.setRGB(0.03 + 0.3 * k, 0.09 + 0.4 * k, 0.055 + 0.32 * k);
    U.eyeRing.material.opacity = 0.32 * k;
  }

  _toggleCloak() {
    const C = this.cloak;
    this._hint('camo');
    if (!C.on && (C.bat < 10 || C.lockT > 0)) { this.hud.flash('CAMO RECHARGING', 'red'); return; }
    C.on = !C.on;
    this.audio.click();
    this.hud.flash(C.on ? 'ACTIVE CAMO' : 'CAMO OFF', C.on ? 'cyan' : 'dim');
  }

  _cloakViewmodel(on) {
    if (this._vmCloak === on) return;
    this._vmCloak = on;
    this.viewmodel.root.traverse((o) => {
      if (!o.isMesh) return;
      if (on) { o.userData._m = o.userData._m || o.material; o.material = this.cloakMat; }
      else if (o.userData._m) o.material = o.userData._m;
    });
  }

  // ---- shooting ----------------------------------------------------------------------
  // KR-50 scope sway (rad): a slow figure of eight, smaller crouched / prone, gone while you
  // hold your breath, a little worse just after you let it out.
  _swayOff() {
    const P = this.player, t = this.t;
    if (this.ab && this.ab.breath.on) return { x: 0, y: 0 };
    let a = P.stance === 2 ? 0.0005 : P.stance === 1 ? 0.0011 : 0.0019;
    if (P.moving) a *= 2;
    if (this.kit && this.kit.deadeye > 0) a *= 0.2;
    if (this.ab && this.ab.breath.cd > 0) a *= 1.4;
    return { x: Math.sin(t * 0.9) * a, y: Math.sin(t * 1.8 + 0.6) * a * 0.6 };
  }

  // Current cone (radians, full width) for the weapon in hand.
  _spreadNow() {
    const P = this.player, def = P.def, ads = P.scopeT > 0.5;
    let sp;
    if (def.slot === 'rifle') sp = ads ? 0 : 0.075;
    else sp = ads ? (def.adsSpread ?? (def.spread || 0.03) * 0.35) : (def.spread || 0.03);
    if (P.moving) sp *= 1.5;
    if (P.stance === 1) sp *= 0.85;
    return sp;
  }

  _fire() {
    const P = this.player, def = P.def;
    const rifle = def.slot === 'rifle';
    const sup = rifle || !!P.w.sup;
    const o = P.eyePos(new THREE.Vector3());
    const dir = P.aimDir(new THREE.Vector3());
    // Spread: dead-on through the scope / sights, wide from the hip (the crosshair shows it).
    {
      const sp = this._spreadNow();
      if (sp > 0) {
        const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * sp / 2;
        const right = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize(), up = new THREE.Vector3().crossVectors(right, dir);
        dir.addScaledVector(right, Math.cos(a) * r).addScaledVector(up, Math.sin(a) * r).normalize();
      }
    }
    if (this.ab) this.ab.stillT = 0;
    // The KR-50 on the glass: breathing sway (still while you hold your breath) and wind drift.
    if (rifle && P.scopeT > 0.5) {
      const sw = this._swayOff();
      const right = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();
      dir.addScaledVector(right, sw.x).add(new THREE.Vector3(0, sw.y, 0)).normalize();
      const pre = this.fac.ray(o, o.clone().addScaledVector(dir, 900), 'shot');
      dir.addScaledVector(right, this._windDrift(P.yaw, pre ? pre.t * 900 : 900)).normalize();
    }
    // A sync shot is a locked shot: straight to the head you were holding.
    if (this._syncShotId) { const sg = this.sentinel.byId(this._syncShotId); this._syncShotId = 0; if (sg && sg.state !== 'dead') dir.copy(guardCapsules(sg)[0].a).sub(o).normalize(); }
    if (this.syncReady) this._syncFire();
    P.fireKick();
    this.viewmodel.fired(def.heavy ? 1.9 : rifle ? 1.3 : 1);
    // Felt recoil: the view kicks up (and a little sideways) and settles, leaving some climb.
    const kick = def.kick || (rifle ? 0.05 : def.key === 'smg' ? 0.008 : 0.018);
    this.camKick = (this.camKick || 0) + kick;
    this.camKickYaw = (this.camKickYaw || 0) + (Math.random() - 0.5) * kick * 0.5;
    P.pitch += kick * (rifle ? 0.25 : 0.35);
    this.audio.shotLocal(sup, !rifle, def.heavy);
    this.stats.shots++;
    if (!sup) this.effects.muzzle(this.viewmodel.muzzleWorld(), dir);
    // Firing breaks the camo for a moment (it shimmers into view).
    // Firing drops the active camo entirely (and it can't come straight back).
    if (this.cloak.on) { this.cloak.on = false; this.cloak.lockT = 1.5; this.cloak.flick = 1.0; this.hud.flash('CAMO BROKEN', 'red', 0.8); }
    const end = o.clone().addScaledVector(dir, 900);
    const ammo = rifle ? P.w.ammo || 'std' : 'std';
    const from = P.scopeT > 0.5 ? o.clone().add(new THREE.Vector3(0, -0.12, 0).applyEuler(this.camera.rotation)) : this.viewmodel.muzzleWorld(new THREE.Vector3());
    // Noise: the suppressed .50 and the M50 still crack up close and fade with distance (a
    // gradient out to ~18 / 14 m); a suppressed SMG / P-9 carries ~8 m; unsuppressed is 70 m and loud.
    if (rifle) this._noise(P.pos, 18, false, true);
    else if (sup && def.heavy) this._noise(P.pos, 14, false, true);
    else this._noise(P.pos, sup ? 8 : 70, !sup);
    if (!sup) this.sentinel.stats.loudShots = (this.sentinel.stats.loudShots || 0) + 1, this._loud = true;
    // The .50 carries on through bodies, walls, doors and bulwark shields, and kills any camera it
    // passes. Each pass costs damage.
    let start = o, mul = 1, first = null, lastP = end;
    const passes = rifle ? 5 : 1;
    for (let k = 0; k < passes; k++) {
      const res = this._hitscan(start, end);
      const hitP = res ? res.point : end;
      lastP = hitP;
      if (!first) first = res;
      this._shotHit(res, hitP, start, mul, { rifle, def, o, ammo, P });
      if (rifle) this._camShot(start, hitP);
      if (!res || !rifle || ammo === 'xr' || ammo === 'emp') break;
      let skip = 0;
      if (res.enemy) { skip = 0.6; mul *= 0.7; }
      else if (res.blocked) { skip = 1.2; mul *= 0.8; }
      else if (res.box && !res.terrain) {
        const th = this._boxDepth(hitP, dir, res.box);
        if (th > 1.3 && res.box.kind !== 'fence') break;
        skip = th + 0.05; mul *= 0.85;
        this.effects.puff(hitP.clone().addScaledVector(dir, th), 'concrete', 0.5, 0.4);
      } else break;
      start = hitP.clone().addScaledVector(dir, skip);
      if (start.distanceTo(o) > 880) break;
    }
    if (rifle) this._trail(from, lastP, true, ammo);
    else this._tracer(from, lastP, '#ffe0a0', 0.05);
    this.send({ t: 'shot', a: from.toArray().map((v) => Math.round(v * 100) / 100), b: lastP.toArray().map((v) => Math.round(v * 100) / 100), r: rifle ? 1 : 0, s: sup ? 1 : 0, am: rifle ? ammo : undefined });
    // Rounds snapping past make officers bolt.
    for (const g of this.sentinel.guards) {
      if (g.state === 'dead' || (first && first.enemy === g)) continue;
      const c = { x: g.x, y: g.y + 1.2, z: g.z };
      const r = segSegClosest(o, lastP, c, c);
      if (r.d2 < 2.5 * 2.5) {
        if (this.isHost) this.sentinel.nearMiss({ x: g.x, z: g.z }, { x: P.pos.x, z: P.pos.z });
        else this._broadcast({ k: 'nearmiss', at: { x: g.x, z: g.z }, from: { x: P.pos.x, z: P.pos.z } });
      }
    }
    // Special magazine spent: back to standard.
    if (rifle && ammo !== 'std' && P.w.mag + P.w.chamber <= 0) { P.w.ammo = 'std'; P.w.xr = false; this.hud.flash(`${AMMO_NAME[ammo]} MAG EMPTY`, 'amber', 1); }
  }

  // How far a ray travels through a box from the point where it entered.
  _boxDepth(p, dir, b) {
    let tMax = 1e9;
    for (let i = 0; i < 3; i++) {
      const d = [dir.x, dir.y, dir.z][i], q = [p.x, p.y, p.z][i];
      if (Math.abs(d) < 1e-6) continue;
      const t = ((d > 0 ? b.max[i] : b.min[i]) - q) / d;
      if (t >= 0) tMax = Math.min(tMax, t);
    }
    return tMax === 1e9 ? 0 : tMax;
  }

  // One segment of a shot landing: lights, bulwark walls, bodies, enemies, the world.
  _shotHit(res, hitP, o, mul, { rifle, def, ammo, P }) {
    if (res && res.light !== undefined) {
      this.effects.puff(hitP, 'metal', 0.6, 0.3);
      if (this.isHost) this._shootLight(res.light, hitP); else this._broadcast({ k: 'light', id: res.light, at: { x: hitP.x, y: hitP.y, z: hitP.z } });
    } else if (res && res.blocked) {
      // A bulwark's wall ate it (unless it's a penetrator): sparks, and now it knows.
      const g = res.blocked;
      this.effects.puff(hitP, 'metal', 0.8, 0.3);
      this.sfx.shieldHit(hitP);
      // The shield soaks it and weakens: ~2 rifle rounds, 4 magnum, a dozen pistol, 15 SMG; an
      // explosive round breaks it outright.
      const wd = ammo === 'xr' ? 999 : ({ kr50: 60, mag50: 35, smg: 8, m18: 10 })[def.key] ?? 20;
      if (!rifle) this.hud.flash((g.wallPct ?? 100) * 1.2 - wd <= 0 ? 'SHIELD BROKEN' : 'BLOCKED \u2014 HIT THE NOTCH OR BREAK IT', 'red', 0.9);
      if (this.isHost) { this.sentinel._alert(g, null, { x: P.pos.x, z: P.pos.z }); this.sentinel.wallDamage(g.id, wd); }
      else this._broadcast({ k: 'block', id: g.id, from: { x: P.pos.x, z: P.pos.z }, dmg: wd });
    } else if (res && res.enemy && res.enemy.state === 'dead') {
      // A downed enemy: a headshot finishes it; a body shot just thumps the body.
      const e = res.enemy;
      this.effects.puff(hitP, 'dust', 0.9, 0.7);
      if (res.part === 'head') {
        this.audio.hitConfirm(true);
        this.hud.hitMarker(true);
        if (this.isHost) this.sentinel.confirm(e.id); else this._broadcast({ k: 'confirm', id: e.id });
        e.incap = false;
        setTimeout(() => this._radio('me', ['X-ray down.', 'X-ray down. Confirmed.', 'Tango down.'][Math.floor(Math.random() * 3)]), 500);
      }
    } else if (res && res.enemy) {
      const e = res.enemy;
      let dmg = Math.round((def.damage[res.part] || def.damage.torso) * mul);
      if (ammo === 'emp') dmg = Math.min(dmg, e.kind === 'd' ? 999 : 30);
      const dist = P.pos.distanceTo(hitP);
      this.audio.hitConfirm(res.part === 'head');
      this.hud.hitMarker(res.part === 'head');
      this.stats.hits++;
      if (res.part === 'head') this.stats.heads++;
      if (mul < 1) this.hud.flash('COLLATERAL', 'amber', 0.6);
      this.effects.puff(hitP, e.kind === 'd' ? 'metal' : 'dust', 0.9, 0.7);
      if (e.maxShield && e.shield > 0 && res.part !== 'head') { this.sfx.shieldHit(hitP); this.hud.flash('SHELL', 'cyan', 0.5); }
      if (e.helmet && res.part === 'head') { this.hud.flash('HELMET OFF \u2014 FOLLOW UP', 'amber', 0.9); }
      if (this._markedChain) this._markedChain(e);
      if (this.isHost) this._applyHit(e.id, dmg, rifle ? 'rifle' : 'pistol', { x: P.pos.x, z: P.pos.z }, this.role, res.part === 'head', dist);
      else this.send({ t: 'hit', id: e.id, dmg, how: rifle ? 'rifle' : 'pistol', from: { x: P.pos.x, z: P.pos.z }, head: res.part === 'head', dist });
    } else if (res) {
      const mat = res.terrain ? 'dirt' : res.box && res.box.kind === 'door' ? 'metal' : 'concrete';
      this.effects.impact(hitP, res.normal, mat);
      this.audio.impact(hitP, mat === 'metal' ? 'metal' : 'dirt', o.distanceTo(hitP) / 343);
      this._noise(hitP, 7, false);
    }
    if (res && res.quadHit) this._quadDamage(100);
    if (!rifle || !res || res.quadHit) return;
    // Special rounds.
    if (ammo === 'xr') this._xrStick(hitP, res.enemy || res.blocked || null);
    else if (ammo === 'emp') {
      this.payload('emp', { x: hitP.x, z: hitP.z, y: hitP.y, r: 8 });
      this.effects.puff(hitP, 'metal', 1.6, 0.5);
      this.audio.zap && this.audio.zap(hitP);
    }
  }

  // A rifle round kills any security camera it passes close to (sparks; out for good).
  _camShot(a, b) {
    const S = this.sentinel, ab = b.clone().sub(a), L = ab.length();
    if (L < 0.01) return;
    ab.divideScalar(L);
    for (const c of S.cams) {
      if (c.dead) continue;
      const v = new THREE.Vector3(c.x - a.x, c.y - a.y, c.z - a.z), t = v.dot(ab);
      if (t < 0 || t > L + 0.3) continue;
      if (v.addScaledVector(ab, -t).length() > 0.4) continue;
      c.dead = true;
      this.effects.puff(new THREE.Vector3(c.x, c.y, c.z), 'metal', 1.2, 0.4);
      this.audio.zap && this.audio.zap(new THREE.Vector3(c.x, c.y, c.z));
      this.hud.flash('CAMERA DESTROYED', 'cyan', 0.8);
      this.payload('camshot', { id: c.id });
    }
  }

  // Instant hit: world boxes + terrain, every guard's capsules, drones.
  _hitscan(o, end) {
    const wh = this.fac.ray(o, end, 'shot');
    const L = o.distanceTo(end);
    let bestT = wh ? wh.t : 1, best = wh ? { ...wh } : null;
    const S = this.sentinel;
    for (const g of S.guards) {
      if (g.state === 'dead' && g.incap) {
        // Downed but alive: hit the body where it lies (head end and torso).
        if (Math.hypot(g.x - o.x, g.z - o.z) > L * bestT + 3) continue;
        const B = g.obj.userData.body;
        B.updateWorldMatrix(true, false);
        const h = B.localToWorld(new THREE.Vector3(0, 1.55, 0)), m = B.localToWorld(new THREE.Vector3(0, 1.0, 0)), f = B.localToWorld(new THREE.Vector3(0, 0.15, 0));
        let hit = null;
        for (const [a, b, r, part] of [[h, h, 0.24, 'head'], [m, f, 0.3, 'torso']]) {
          const q = segSegClosest(o, end, a, b);
          if (q.d2 < r * r && (!hit || part === 'head')) hit = { s: hit ? Math.min(hit.s, q.s) : q.s, part };
        }
        if (hit && hit.s < bestT) { bestT = hit.s; best = { t: hit.s, point: o.clone().lerp(end, hit.s), enemy: g, part: hit.part }; }
        continue;
      }
      if (g.hp <= 0 && g.state === 'dead') continue;
      if (Math.hypot(g.x - o.x, g.z - o.z) > L * bestT + 3) continue;
      // The capsules overlap at the neck, so if the ray passes through the head at all, it's a
      // headshot (closest-approach order alone can hand it to the torso just below).
      let hit = null;
      for (const c of guardCapsules(g)) {
        const r = segSegClosest(o, end, c.a, c.b);
        const rad = c.r * (RULES.hitbox || 1);
        if (r.d2 >= rad * rad) continue;
        if (!hit || c.part === 'head' || (hit.part !== 'head' && r.s < hit.s)) hit = { s: hit ? Math.min(hit.s, r.s) : r.s, part: c.part === 'head' || !hit ? c.part : r.s < hit.s ? c.part : hit.part };
      }
      if (hit && hit.s < bestT) { bestT = hit.s; best = { t: hit.s, point: o.clone().lerp(end, hit.s), enemy: g, part: hit.part }; }
    }
    // Lamps and ceiling panels can be shot out.
    const lh = this.fac.lightHit(o, end);
    if (lh && lh.t < bestT) { bestT = lh.t; best = { t: lh.t, point: o.clone().lerp(end, lh.t), light: lh.id }; }
    // Bulwark walls stand in front of the bodies behind them.
    for (const g of S.guards) {
      if (g.type !== 'bulwark' || g.state === 'dead') continue;
      const t = wallBlock(g, o, end);
      if (t !== null && t < bestT) { bestT = t; best = { t, point: o.clone().lerp(end, t), blocked: g }; }
    }
    for (const d of S.drones) {
      if (d.state === 'dead') continue;
      // Spotlight helis are bigger: a capsule along the body.
      const hx = d.heli ? Math.sin(d.yaw) * 1.3 : 0.5, hz = d.heli ? Math.cos(d.yaw) * 1.3 : 0, hr = d.heli ? 1.0 : 0.75;
      const r = segSegClosest(o, end, { x: d.x - hx, y: d.y, z: d.z - hz }, { x: d.x + hx, y: d.y, z: d.z + hz });
      if (r.d2 < hr * hr && r.s < bestT) { bestT = r.s; best = { t: r.s, point: o.clone().lerp(end, r.s), enemy: d, part: 'torso' }; }
    }
    return best;
  }

  _applyHit(id, dmg, how, from, by, head, dist) {
    const S = this.sentinel;
    const e = S.byId(id);
    if (!e) return;
    const killed = S.damage(id, dmg, how, from, head ? 'head' : 'torso').killed;
    if (killed && e.kind === 'g') {
      this._killFeed(e, how, by, head, dist);
      if (e.chief) this._toast(this.mission === 'nightwatch' ? 'The Overseer is down. Take its badge.' : 'Site Chief is down. Take his badge.', 'amber');
    } else if (killed && e.kind === 'd') this._toast(`${by === this.role ? this.name : this.partnerName} shot down a patrol drone.`, 'dim');
  }

  _killFeed(e, how, by, head, dist) {
    // Kill calls: about half of kills (yours, your partner's, AI Ra's) get a radio call, at
    // most one every 10 s, and only when nobody else is talking. Dropping an enemy your
    // partner pinged gets "your mark is down".
    const killer = by === 'ai' ? 'shooter' : by;
    // Marked for death: the shooter's kills on tagged enemies chain (not AI Ra's).
    if (by === 'shooter' && e.tagT > 0) { if (this.role === 'shooter' || this.operative) this._chainKill(); else this._broadcast({ k: 'chain' }); }
    if (how !== 'takedown' && this.t - (this._xrayT || -99) > 10 && Math.random() < 0.55) {
      this._xrayT = this.t;
      const pinged = e.tagBy && e.tagBy !== killer;
      const lines = pinged ? ['X-ray down.'] : ['X-ray down.', 'Tango down.', 'Target down.', "He's down."];
      const line = lines[Math.floor(Math.random() * lines.length)];
      setTimeout(() => this._radio(killer, line), 600);
    }
    const name = by === this.role ? this.name : by === 'ai' ? this.partnerName : this.partnerName;
    const what = how === 'takedown' ? 'TAKEDOWN' : how === 'swarm' ? 'NANO SWARM' : head ? 'HEADSHOT' : e.incap ? 'DOWN' : 'KILL';
    const ev = { k: 'kill', by, what, dist: Math.round(dist || 0), chief: e.chief, name };
    this._onKillEvent(ev);
    this._broadcast(ev);
  }

  _onKillEvent(m) {
    if (m.by === this.role && m.dist) this.stats.longest = Math.max(this.stats.longest, m.dist);
    this.hud.feed(`${m.name} ▸ ${m.what}${m.dist > 30 ? ' · ' + m.dist + ' m' : ''}${m.chief ? (this.mission === 'nightwatch' ? ' · OVERSEER' : ' · SITE CHIEF') : ''}`, m.by === this.role ? ROLES[this.role].color : ROLES[this.partnerRole].color);
  }

  _onRemoteShot(m) {
    const a = new THREE.Vector3(...m.a), b = new THREE.Vector3(...m.b);
    if (m.r) this._trail(a, b, false, m.am); else this._tracer(a, b, '#ffe0a0', 0.05);
    const d = this.camera.position.distanceTo(a);
    this.audio.shotDistant(a, d / 343, !!m.s);
    if (this.isHost) this._noise(a, m.r ? 10 : m.s ? 8 : 70, !m.s);
  }

  _noise(pos, r, loud, grad = false) {
    if (this.isHost) this.sentinel.noise(pos, r, loud, grad);
    else if (r >= 6) this.send({ t: 'ev', k: 'noise', x: pos.x, y: pos.y, z: pos.z, r, loud, grad });
  }

  // The shooter's signature: a long white vapor trail that hangs in the night air.
  // Each round type has its own colour: standard white-blue, explosive orange, penetrator
  // violet, EMP electric cyan.
  _trail(a, b, mine, ammo) {
    const TC = { std: ['#cfe6ff', '#7aa6ff'], xr: ['#ffb070', '#ff5a20'], pen: ['#e0b0ff', '#a050ff'], emp: ['#b0fff8', '#20e8ff'] }[ammo] || ['#cfe6ff', '#7aa6ff'];
    const len = a.distanceTo(b);
    const geo = new THREE.CylinderGeometry(0.018, 0.018, len, 6, 1, true).translate(0, len / 2, 0).rotateX(Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({ color: TC[0], transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false });
    const m = new THREE.Mesh(geo, mat);
    m.position.copy(a);
    m.lookAt(b);
    this.scene.add(m);
    const glow = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, len, 6, 1, true).translate(0, len / 2, 0).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: TC[1], transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false }));
    m.add(glow);
    this.trails.push({ mesh: m, t: 0, life: mine ? 2.2 : 2.6, grow: true });
  }

  _tracer(a, b, color, life) {
    const geo = new THREE.BufferGeometry().setFromPoints([a, b]);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.scene.add(line);
    this.trails.push({ mesh: line, t: 0, life });
  }

  // Enemy fire reaching a client.
  _onEshot(m) {
    return this._spawnBolt(m);
  }

  _onEshotOld(m) {
    const a = new THREE.Vector3(...m.a), b = new THREE.Vector3(...m.b);
    const miss = m.hit ? b : b.clone().add(new THREE.Vector3((Math.random() - 0.5) * 2.5, (Math.random() - 0.3) * 1.5, (Math.random() - 0.5) * 2.5));
    this._tracer(a, miss, m.zap ? '#ff4060' : '#ffb060', m.zap ? 0.12 : 0.07);
    const d = this.camera.position.distanceTo(a);
    if (!m.zap) this.audio.shotDistant(a, d / 343, false); else this.audio.droneZap(a);
    if (m.role === 'quad') {
      if (m.hit) { if (this.role === 'spotter' && this.quad && this.quad.active) this._quadDamage(m.dmg); else if (this.isHost) this._broadcast({ k: 'quadhit', dmg: m.dmg }); }
      return;
    }
    if (m.role !== this.role || this.downed || this.kia) return;
    if (!m.hit) { this.audio.crack(miss, 0, 0.6); return; }
    const plate = this.role === 'spotter' ? 0.8 : 1; // the plate carrier soaks a little
    this._damage(m.dmg * plate, a);
  }

  _damage(dmg, from) {
    if ((this.role === 'spotter' || this.operative) && this.loadout.spotter.perk === 'armor') dmg *= 0.8;
    this.hp -= dmg;
    this.audio.hurt && this.audio.hurt(dmg >= 40);
    this.hud.damage(Math.atan2(from.x - this.player.pos.x, from.z - this.player.pos.z) - this.player.yaw);
    this.dmgFx = 1;
    if (this.hp <= 0) {
      this.hp = 0;
      this.downed = true;
      this.bleed = BLEED;
      this.cloak.on = false;
      if (this.tablet.visible) this.tablet.close();
      if (this.quad && this.quad.active) this._endQuad();
      this.player.scoped = false;
      this.comms(`${this.name} is DOWN — ${BLEED} s to bleed out.`, 'red');
      this._dropDriveIfCarrying();
    }
  }

  _revived(hp) {
    if (!this.downed || this.kia) return;
    this.downed = false;
    this.hp = Math.round(this.maxHp * 0.55) || hp;
    this.player.stance = 1;
    this.comms(`${this.name} is back up.`, 'cyan');
  }

  // Is there an enemy under the crosshair, standing or downed-but-alive? (Reticle goes red.)
  _reticleHot() {
    if (this._retT === this.t) return this._retV;
    this._retT = this.t;
    const cam = this.camera, o = cam.position, dir = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    let hot = !!this._crosshairEnemy();
    if (!hot) {
      const bs = 0.035 * (62 / cam.fov);
      for (const g of this.sentinel.guards) {
        if (!(g.state === 'dead' && g.incap)) continue;
        const p = new THREE.Vector3(g.x, (g.y || 0) + 0.3, g.z), v = p.clone().sub(o);
        if (v.length() > 320 || v.normalize().angleTo(dir) > bs) continue;
        if (this.fac.los(o, p)) { hot = true; break; }
      }
    }
    return (this._retV = hot);
  }

  // ISR ping sweep at the sensor point (spotter / lone operative, in the ISR view).
  // ISR ping sweep: at the sensor point in the ISR view, or (at) the ground under your crosshair.
  // Returns null, or why it couldn't run.
  _isrSweep(at) {
    const I = this.isr;
    if (I.sweepCd > 0) { const why = `SWEEP ${Math.ceil(I.sweepCd)} s`; if (!at) this.hud.flash(why, 'red'); return why; }
    I.sweepCd = 25;
    const r = at ? 30 : Math.max(18, Math.min(45, I.slant() * Math.tan((I.fov * Math.PI) / 360) * 0.8));
    const x = at ? at.x : I.spi.x, z = at ? at.z : I.spi.z;
    I.sweepFx = { x, z, r, t: 0 };
    this.sfx.ui(true);
    this._voice('isr', 'Sweep running.');
    this.payload('isrsweep', { x, z, r });
    return null;
  }

  _heal(n) {
    this.hp = Math.min(this.maxHp, this.hp + n);
    this.audio.click();
    this.hud.flash(`+${n} HP`, 'cyan');
  }
  _ammo() {
    this.player.refill();
    this.audio.click();
    this.hud.flash('AMMO RESTOCKED', 'cyan');
  }

  // Use one of your IFAKs on yourself: back to full health.
  _useIfak() {
    const ob = this.obj, n = (ob.ifak && ob.ifak[this.role]) || 0;
    if (this.downed || this.kia) return;
    if (n <= 0) { this.hud.flash('NO IFAK', 'red', 0.8); return; }
    if (this.hp >= this.maxHp) { this.hud.flash('ALREADY AT FULL HEALTH', 'dim', 0.8); return; }
    if (this.isHost) ob.ifak[this.role] = n - 1; else { ob.ifak[this.role] = n - 1; this._broadcast({ k: 'ifakuse', role: this.role }); }
    this.hp = this.maxHp;
    this.dmgFx = 0;
    this.audio.click();
    this.hud.flash('IFAK \u2014 FULL HEALTH', 'cyan');
  }
  // The medevac drone reached you: up off the floor if you were down, and patched to full.
  _medHeal() {
    if (this.kia) return;
    if (this.downed) this._revived(100);
    this.hp = this.maxHp;
    this.dmgFx = 0;
    this.audio.click();
    this.hud.flash('MEDEVAC \u2014 FULL HEALTH', 'cyan');
  }
  // Who the medevac drone should fly to: anyone down first, else whoever is hurt worst.
  hurtAgent() {
    const d = this.downedAgent();
    if (d) return d;
    const list = [];
    if (!this.kia && this.hp < this.maxHp) list.push([this.role, this.hp]);
    if (!this.solo && !this.partner.ai && !this.partner.kia && this.partner.hp != null && this.partner.hp < this.maxHp) list.push([this.partnerRole, this.partner.hp]);
    list.sort((a, b) => a[1] - b[1]);
    return list.length ? list[0][0] : null;
  }

  _resupply() {
    this.player.refill();
    this._xrResupply();
    if (this.kit && (this.role === 'shooter' || this.operative)) this.kit.lures = Math.min(5, this.kit.lures + 1); // +1 sticky
    this.hp = Math.min(this.maxHp, this.hp + 35);
    this.audio.click();
    this.hud.flash('RESUPPLIED +35 HP \u00B7 +1 IFAK', 'cyan');
  }

  _dropDriveIfCarrying() {
    if (this.isHost && this.obj.drive === this.role) {
      this.obj.drive = 'ground';
      this.obj.driveAt = { x: this.player.pos.x, z: this.player.pos.z };
      this._toast('The drive is on the ground!', 'red');
    }
  }

  // F: tag the contact under the crosshair (spotting). Works through the quad too.
  _tagAtCrosshair() {
    const cam = this.camera;
    const o = cam.position.clone();
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    let best = null, bs = 0.035 * (WEAPON.baseFov / cam.fov);
    const S = this.sentinel;
    for (const e of [...S.guards, ...S.drones]) {
      if (e.hp <= 0 || e.state === 'dead') continue;
      const p = new THREE.Vector3(e.x, (e.y || 0) + (e.kind === 'g' ? 1.3 : 0), e.z);
      const v = p.clone().sub(o);
      const d = v.length();
      if (d > 320) continue;
      const ang = v.normalize().angleTo(dir);
      if (ang < bs && this.fac.los(o, p)) { bs = ang; best = e; }
    }
    if (best && best.tagT > 0 && best.kind === 'g') {
      // Second F on a marked enemy: make it a SYNC target.
      const on = !best.sync;
      this.payload('sync', { id: best.id, on, by: this.role });
      if (this.isHost) best.sync = on;
      this.hud.flash(on ? 'SYNC TARGET' : 'SYNC CLEARED', on ? 'cyan' : 'dim');
      if (on) this._voice(this.role, 'Sync target marked.');
      return;
    }
    if (best) {
      this.payload('tag', { id: best.id, by: this.role });
      if (this.isHost) best.tagT = HACK.tag;
      this.audio.scan && this.audio.scan();
      this.hud.flash(best.kind === 'd' ? 'DRONE TAGGED' : best.chief ? 'SITE CHIEF TAGGED' : 'TAGGED');
    } else {
      // Nothing there: call "look here" on the spot (V on open ground drops a plain PING).
      this._wheelPick('look', this._aimPoint(), null);
    }
  }

  // ---- recon quad (spotter) ----------------------------------------------------------
  _startQuad() {
    if (this.role !== 'spotter' && !this.operative) return;
    this._hint('drone');
    const P = this.player, auto = this._quadAutoNext;
    // Sent to a spot (tablet drag-and-drop, or the command at your crosshair): it flies itself
    // there and holds, and you stay where you are. Otherwise you take the sticks.
    if (!auto) { if (this.tablet.visible) this.tablet.close(); if (this.isr.active) this.isr.exit(); }
    this.quad = { active: false, parked: !!auto, launching: !auto, auto: auto || null, x: P.pos.x, y: P.pos.y + 2.2, z: P.pos.z, yaw: P.yaw, pitch: -0.2, bat: this.quadBat ?? QUAD_BAT, hp: 30, vy: 0 };
    if (auto) this.audio.startLoop('quad', new THREE.Vector3(this.quad.x, this.quad.y, this.quad.z), 'rotor', 0.22);
    // By hand: tossed up out of the left hand, then the feed cuts in.
    else this._raise('drone', () => { const q = this.quad; if (!q || !q.launching) return; q.launching = false; q.active = true; this.post.uniforms.uStatic.value = 1; this.audio.startLoop('quad', new THREE.Vector3(q.x, q.y, q.z), 'rotor', 0.22); });
    if (auto) this.comms('Recon drone en route to the mark. F to take it, hold F to recall.', 'cyan', this.name);
    else this.comms('Recon drone up. Look at enemies to neurolink them. F park \u00B7 hold F recall \u00B7 SPACE/C climb.', 'cyan', this.name);
  }
  // Send the quad to a spot: launch it there, or redirect it if it's already up.
  _quadTo(at) {
    if (!at) return 'PICK A SPOT';
    if (this._quadOut()) {
      const q = this.quad;
      if (q.active) { q.active = false; q.parked = true; }
      q.auto = { x: at.x, z: at.z };
      this.comms('Recon drone moving to the mark.', 'cyan', this.name);
      return null;
    }
    this._quadAutoNext = { x: at.x, z: at.z };
    const why = this.ops ? this.ops.use('quad') : 'NO CONSOLE';
    this._quadAutoNext = null;
    return why;
  }
  // Autopilot: climb to ~9 m over the ground, fly to the mark at 12 m/s, then hold and mark.
  _quadAuto(dt) {
    const q = this.quad, A = q.auto;
    const P = this.player.pos;
    let tx = A.x, tz = A.z;
    const lp = Math.hypot(tx - P.x, tz - P.z);
    if (lp > 250) { tx = P.x + (tx - P.x) * 250 / lp; tz = P.z + (tz - P.z) * 250 / lp; } // signal leash
    const dx = tx - q.x, dz = tz - q.z, d = Math.hypot(dx, dz);
    const inside = this.fac.insideBuilding(tx, tz);
    const want = (inside ? 0 : 0) + Math.max(this.fac.groundAt(q.x, q.z, q.y, 0.5), terrainHeight(q.x, q.z)) + (d > 6 ? 9 : 7);
    q.y += clamp(want - q.y, -4 * dt, 5 * dt);
    if (d > 0.8) {
      const st = Math.min(d, 12 * dt);
      const p = { x: q.x + (dx / d) * st, y: q.y, z: q.z + (dz / d) * st };
      this.fac.resolveHorizontal(p, 0.4, 0.5, 0);
      q.x = p.x; q.z = p.z;
      q.yaw = Math.atan2(-dx, -dz);
    } else {
      q.auto = null;
      this.comms('Recon drone on station. It keeps marking. G to take it.', 'cyan', this.name);
      this.sfx.ui(true);
    }
    this.audio.updateLoop('quad', new THREE.Vector3(q.x, q.y, q.z));
  }
  _quadOut() {
    return !!(this.quad && (this.quad.active || this.quad.parked || this.quad.launching || this.quad.recall));
  }
  // Leave the quad hovering where it is: it keeps marking what it can see. Rotor noise still carries.
  _parkQuad() {
    const q = this.quad;
    if (!q) return;
    q.active = false;
    q.parked = true;
    this.sfx.ui(false);
    this.comms('Recon drone parked. It keeps marking. F to fly it, hold F to recall.', 'cyan', this.name);
  }
  _resumeQuad() {
    const q = this.quad;
    if (!q || this.downed) return;
    if (this.tablet.visible) this.tablet.close();
    if (this.isr.active) this.isr.exit();
    q.active = true;
    q.parked = false;
    q.auto = null;
    this.sfx.ui(true);
  }
  // Quick calldown: the quad comes straight home and is ready again in a few seconds.
  _recallQuad() {
    const q = this.quad;
    if (!q || q.recall) return;
    if (q.launching) { this._endQuad(false, true); return; }
    this.comms('Recon drone recalled.', 'cyan', this.name);
    this.sfx.ui(false);
    // It flies home (RECALLING overlay); _devTick lands it.
    q.active = false; q.parked = false; q.auto = null;
    q.recall = { t: 0, dur: 1.3, from: { x: q.x, y: q.y, z: q.z } };
    this.post.uniforms.uStatic.value = 0.8;
  }
  _updateQuad(dt, a) {
    const q = this.quad;
    if (!q || !q.active) return;
    q.bat -= dt * 0.5;
    const sens = 0.0022;
    q.yaw -= a.lookX * sens;
    q.pitch = clamp(q.pitch - a.lookY * sens, -1.4, 0.6);
    const sn = Math.sin(q.yaw), cs = Math.cos(q.yaw);
    const mx = a.mx, my = a.my;
    const sp = a.sprint ? 14 : 8;
    const up = (this.input.held('Space') || this.input.held('T:jump') ? 1 : 0) - (this.input.held('KeyC') || this.input.held('ControlLeft') || this.input.held('T:crouch') ? 1 : 0);
    const p = { x: q.x + (mx * cs + my * sn) * sp * dt, y: q.y + up * 5 * dt, z: q.z + (-mx * sn + my * cs) * sp * dt };
    this.fac.resolveHorizontal(p, 0.4, 0.5, 0);
    const g = this.fac.groundAt(p.x, p.z, p.y, 0.5);
    p.y = clamp(p.y, g + 0.6, Math.min(terrainHeight(p.x, p.z) + 60, this.fac.insideBuilding(p.x, p.z) ? BUILDING.h - 0.4 : 999));
    // Keep it on a leash (~260 m of signal).
    const d = Math.hypot(p.x - this.player.pos.x, p.z - this.player.pos.z);
    if (d > 260) { p.x = q.x; p.z = q.z; }
    q.x = p.x; q.y = p.y; q.z = p.z;
    this.audio.updateLoop('quad', new THREE.Vector3(q.x, q.y, q.z));
    if (q.bat <= 0) { this.comms('Drone battery dead — it’s coming home.', 'cyan', this.name); this._endQuad(); }
    if (this.isHost) this.sentinel.quad = { alive: true, x: q.x, y: q.y, z: q.z };
  }
  _quadDamage(dmg) {
    if (!this.quad || !this.quad.active) return;
    this.quad.hp -= dmg;
    this.post.uniforms.uStatic.value = 1;
    if (this.quad.hp <= 0) { this.comms('Recon drone shot down.', 'red', this.name); this._endQuad(true); }
  }
  _endQuad(lost = false, recall = false) {
    if (!this.quad) return;
    this.quadBat = lost ? QUAD_BAT : Math.max(0, this.quad.bat);
    this.quad.active = false;
    this.quad.parked = false;
    this.quadCd = lost ? 40 : recall ? 3 : this.quadBat <= 0 ? 20 : 6;
    if (this.ops) this.ops.cd.quad = this.quadCd;
    this.audio.stopLoop('quad');
    if (this.isHost) this.sentinel.quad = null;
    this.quad = null;
  }

  // ---- host: objectives, interactions, doors, crates, AI shooter --------------------
  _hostTick(dt) {
    const S = this.sentinel, ob = this.obj;
    // Elevator car: run toward the floor it's been sent to.
    { const L = ob.lift, want = L.to * BUILDING.f1, d = want - L.y; if (Math.abs(d) > 0.001) L.y += Math.sign(d) * Math.min(Math.abs(d), SHAFT.speed * dt); }
    // Lobby checkpoint: walking through the detector sets it off (unless the CCTV desk is ours).
    this._ckPrev = this._ckPrev || {};
    for (const a of this.agents()) {
      if (!a.alive) continue;
      const prev = this._ckPrev[a.role], C = CHECKPOINT;
      this._ckPrev[a.role] = { z: a.pos.z, x: a.pos.x };
      if (!prev || ob.cctv || a.pos.y > 1.2) continue;
      const crossed = (prev.z - C.z) * (a.pos.z - C.z) <= 0 && prev.z !== a.pos.z;
      if (crossed && a.pos.x > C.x0 && a.pos.x < C.x1 && this.t - (this._ckT || -99) > 6) {
        this._ckT = this.t;
        S.noise({ x: 0, y: 1, z: C.z }, 28, true);
        S.raise(0.35, 'SENTINEL: checkpoint alarm in the lobby.');
        this._toast('Checkpoint alarm! The detector went off \u2014 step round the barriers next time.', 'red');
        this._broadcast({ k: 'chk' });
        this._checkpointFx();
      }
    }
    // Remote quad position feeds SENTINEL (guards shoot support drones).
    if (!this.solo && this.partner.quad) { const q = this.partner.quad; S.quad = { alive: true, x: q[0], y: q[1], z: q[2] }; }
    else if (!this._quadOut()) S.quad = null;
    else S.quad = { alive: true, x: this.quad.x, y: this.quad.y, z: this.quad.z };
    S.update(dt, this.agents());
    for (const ev of S.events) this._sentinelEvent(ev);
    S.events.length = 0;
    // Revealed flags (console intel) for the snapshot.
    for (const e of [...S.guards, ...S.drones]) e.rev = S.revealed(e, ob.access, this.extraReveal);
    // Decoys keep pinging.
    if (this.decoys) for (const d of this.decoys) { d.t -= dt; d.tick -= dt; if (d.tick <= 0) { d.tick = 0.6; S.noise({ x: d.x, y: (d.y ?? 0) + 1, z: d.z }, d.r || 25, !d.soft); } }
    if (this.decoys) this.decoys = this.decoys.filter((d) => d.t > 0);
    // Lights come back on.
    this._doors(dt);
    this._crates(dt);
    this._iceHost(dt);
    this._c4Tick(dt);
    this._medevacTick(dt);
    if (this.aiShoot) this._aiShooter(dt);
    this._objectives(dt);
  }

  _sentinelEvent(ev) {
    if (ev.t === 'eshot') { this._onEshot(ev); this.send({ t: 'eshot', ...ev }); }
    else if (ev.t === 'bark' || ev.t === 'fx' || ev.t === 'laser') { this._sentinelFx(ev); this._broadcast({ k: 'sfx', ev }); }
    else if (ev.t === 'emelee') { this._onMelee(ev); this._broadcast({ k: 'emelee', ev }); }
    else if (ev.t === 'toast') this._toast(ev.m, ev.c);
    else if (ev.t === 'spotted') { /* surfaced through the guard's state */ }
  }

  _doors(dt) {
    const agents = this.agents();
    for (const d of Object.values(this.fac.doors)) {
      d.hackOpen = Math.max(0, (d.hackOpen || 0) - dt);
      d.guardT = Math.max(0, (d.guardT || 0) - dt);
      d.hackT = 0;
      const near = agents.some((a) => a.alive && Math.hypot(a.pos.x - d.x, a.pos.z - d.z) < 2.8);
      let open = false;
      if (d.perm) open = true;
      else if (d.sealed) open = false;
      else open = d.hackOpen > 0 || d.guardT > 0 || (d.unlocked && near);
      // Never slam a door shut on top of somebody.
      if (!open && d.open && agents.some((a) => Math.hypot(a.pos.x - d.x, a.pos.z - d.z) < 1.2)) open = true;
      this.fac.setDoor(d.id, open);
    }
    if (this.ops) for (const c of this.ops.casts) if (c.k === 'door' && this.fac.doors[c.id]) this.fac.doors[c.id].hackT = 1;
  }

  _crates(dt) {
    for (const c of this.crates) {
      if (!c.landed) {
        c.y -= c.vy * dt * 3;
        const g = this.fac.groundAt(c.x, c.z, c.y, 0.5);
        if (c.y <= g) { c.y = g; c.landed = true; c.life = 90; }
        continue;
      }
      c.life -= dt;
      for (const a of this.agents()) {
        if (!a.alive || a.downed) continue;
        if (Math.hypot(a.pos.x - c.x, a.pos.z - c.z) < 1.6) {
          c.taken = true;
          this.obj.ifak[a.role] = Math.min(3, (this.obj.ifak[a.role] || 0) + 1); // every crate packs an IFAK
          if (a.role === this.role) this._resupply(); else this._broadcast({ k: 'resupply', role: a.role });
          break;
        }
      }
    }
    this.crates = this.crates.filter((c) => !c.taken && (!c.landed || c.life > 0));
  }

  _medevacTick(dt) {
    const m = this.medevac;
    if (!m) return;
    const tgt = this.agentPos(m.role);
    const goal = { x: tgt.x, y: tgt.y + 1.2, z: tgt.z };
    const cruise = this.fac.insideBuilding(tgt.x, tgt.z) ? 0 : 14;
    const dx = goal.x - m.x, dz = goal.z - m.z, d = Math.hypot(dx, dz);
    const sp = 18 * dt;
    if (d > 1) { m.x += (dx / d) * Math.min(d, sp); m.z += (dz / d) * Math.min(d, sp); }
    const wantY = d > 12 ? goal.y + cruise : goal.y;
    m.y += (wantY - m.y) * Math.min(1, dt * 2);
    if (d < 1.5 && Math.abs(m.y - goal.y) < 1.5) {
      if (m.role === this.role) this._medHeal(); else this._broadcast({ k: 'medheal', role: m.role });
      this.medevac = null;
    }
  }

  // AI partner on foot: follows you up the draw (a few metres back and to the side, crouched
  // when you are), then walks out to its post once you're over the crest. True while walking.
  _aiWalk(dt) {
    const Q = this.partner, me = this.player.pos;
    if (!Q.ai || Q.kia || Q.downed) return false;
    if (this.approach && me.z < SPOTS.crest) {
      this.approach = false;
      Q.walkTo = Q.role === 'shooter' ? { x: SPOTS.perches[0].x, z: SPOTS.perches[0].z } : { x: SPOTS.overlook.x, z: SPOTS.overlook.z };
      this._radio('partner', Q.role === 'shooter' ? 'Moving to the cliff.' : 'Setting up on the ridge.');
    }
    let tx, tz, run = false;
    if (this.approach) {
      const side = Q.role === 'shooter' ? 1 : -1, yaw = this.player.yaw;
      tx = me.x + Math.sin(yaw) * 3.2 + Math.cos(yaw) * 2.2 * side;
      tz = me.z + Math.cos(yaw) * 3.2 - Math.sin(yaw) * 2.2 * side;
      Q.st = this.player.stance === 2 ? 1 : this.player.stance;
    } else if (Q.walkTo) {
      tx = Q.walkTo.x; tz = Q.walkTo.z; run = true; Q.st = 0;
    } else return false;
    const dx = tx - Q.pos.x, dz = tz - Q.pos.z, d = Math.hypot(dx, dz);
    if (!this.approach && d < 0.8) { Q.walkTo = null; Q.moving = false; Q.sprinting = false; return false; }
    const sp = (run ? 4.2 : Q.st === 1 ? 2.2 : 3.4) * Math.min(1, d / 2.5 + (d > 8 ? 1 : 0));
    if (d > 0.4) {
      const k = Math.min(d, sp * dt) / d;
      Q.pos.x += dx * k; Q.pos.z += dz * k;
      Q.yaw += angDiff(Math.atan2(-dx, -dz), Q.yaw) * Math.min(1, dt * 6);
      Q.moving = true;
    } else { Q.moving = false; Q.yaw += angDiff(this.player.yaw, Q.yaw) * Math.min(1, dt * 3); }
    if (d > 40) { Q.pos.x = tx; Q.pos.z = tz; } // left far behind: catch up
    Q.pos.y = this.fac.groundAt(Q.pos.x, Q.pos.z, Q.pos.y + 0.6, 0.6);
    Q.sprinting = run && Q.moving;
    return true;
  }

  // Solo spotter: Ra holds a perch and takes the shots you tag.
  _aiShooter(dt) {
    const A = this.aiShoot, S = this.sentinel, Q = this.partner;
    const perch = SPOTS.perches[A.perch];
    A.cool -= dt;
    A.sayT -= dt;
    A.holdT = Math.max(0, (A.holdT || 0) - dt);
    A.coverT = Math.max(0, (A.coverT || 0) - dt);
    if (Q.seated) return; // aboard the van
    // On the approach Ra walks with you (and shoots from wherever he is); then out to the cliff.
    const walking = this._aiWalk(dt);
    if (walking) { A.walkEye = { x: Q.pos.x, y: Q.pos.y + (Q.st === 1 ? 1.0 : 1.45), z: Q.pos.z }; }
    else A.walkEye = null;
    if (A.moveT > 0) {
      A.moveT -= dt;
      Q.avatarHidden = true;
      if (A.moveT <= 0) { A.perch = A.moveTo; const p = SPOTS.perches[A.perch]; Q.pos.set(p.x, this.fac.groundAt(p.x, p.z, 200, 0.5), p.z); Q.yaw = p.yaw; Q.avatarHidden = false; this._toast(`Ra: set at ${p.name}.`, 'amber', this.partnerName); }
      return;
    }
    if (!A.walkEye) { Q.pos.set(perch.x, this.fac.groundAt(perch.x, perch.z, 200, 0.5), perch.z); Q.st = 2; if (!A.aim) Q.yaw += angDiff(perch.yaw, Q.yaw) * Math.min(1, dt * 3); }
    const eye = A.walkEye || { x: perch.x, y: Q.pos.y + 1.3, z: perch.z };
    // Candidates: anything tagged, anything with eyes on the spotter, drones locked on.
    const me = this.player.pos;
    const cands = [];
    for (const g of S.guards) {
      if (g.state === 'dead') continue;
      const near = Math.hypot(g.x - me.x, g.z - me.z);
      const threat = (g.state === 'alert' || g.state === 'berserk') && g.target === this.role && near < 45 || (A.coverT > 0 && near < 40);
      if ((g.tagT > 0 && !g.autoTag) || threat) cands.push({ e: g, p: { x: g.x, y: g.y + 1.25, z: g.z }, pri: threat ? 2 : 1 });
    }
    for (const d of S.drones) if (d.state !== 'dead' && (d.tagT > 0 || d.aw > 0.6)) cands.push({ e: d, p: { x: d.x, y: d.y, z: d.z }, pri: d.aw > 0.6 ? 3 : 1 });
    cands.sort((a, b) => b.pri - a.pri);
    let pick = null;
    for (const c of cands) {
      if (Math.hypot(c.p.x - eye.x, c.p.z - eye.z) > 340) continue;
      if (this.fac.los(eye, c.p)) { pick = c; break; }
    }
    if (A.holdT > 0 && !(pick && pick.pri >= 2)) { A.aim = null; return; }
    if (!pick) {
      A.aim = null;
      if (cands.length && A.sayT <= 0) { A.sayT = 9; this._toast('Ra: no line of sight on that one from here. Move me or bring him into the open.', 'amber', this.partnerName); }
      return;
    }
    Q.yaw = Math.atan2(-(pick.p.x - eye.x), -(pick.p.z - eye.z));
    if (A.aim !== pick.e.id) { A.aim = pick.e.id; A.aimT = 1.6 + Math.random() * 1.4; if (A.sayT <= 0) { A.sayT = 4; this._toast('Ra: on him. Sending it.', 'amber', this.partnerName); } }
    A.aimT -= dt;
    if (A.aimT > 0 || A.cool > 0) return;
    A.cool = 2.4;
    A.aim = null;
    const a = new THREE.Vector3(eye.x, eye.y, eye.z), b = new THREE.Vector3(pick.p.x, pick.p.y, pick.p.z);
    this._trail(a, b, false);
    this.send({ t: 'shot', a: a.toArray(), b: b.toArray(), r: 1, s: 1 });
    this.audio.shotDistant(a, this.camera.position.distanceTo(a) / 343, true);
    if (Math.random() < 0.93) {
      const dist = a.distanceTo(b);
      const killed = S.damage(pick.e.id, 999, 'ai', null, 'head').killed;
      if (killed && pick.e.kind === 'g') this._killFeed(pick.e, 'rifle', 'ai', Math.random() < 0.6, dist);
      if (killed && pick.e.kind === 'g' && pick.e.chief) this._toast('Site Chief is down. Take his badge.', 'amber');
      this._toast(pick.e.kind === 'd' ? 'Ra: drone down.' : 'Ra: target down.', 'amber', this.partnerName);
    } else this._toast('Ra: missed — cycling.', 'amber', this.partnerName);
    S.noise({ x: b.x, y: b.y, z: b.z }, 7, false);
  }

  // Who may work the server and swipe the badge: the spotter in co-op; anyone solo.
  _techRole(role) {
    return this.solo || role === 'spotter';
  }

  _objectives(dt) {
    const ob = this.obj, S = this.sentinel, T = this.fac.target;
    const agents = this.agents();
    const inFence = (p) => Math.abs(p.x) < FENCE.x && Math.abs(p.z) < FENCE.z;
    if (!ob.perimeter && agents.some((a) => a.alive && inFence(a.pos))) { ob.perimeter = true; this._toast('Perimeter breached. Inside the wire.', 'cyan'); }
    // Finding the archive server: eyes on the cabinet with the amber beacon.
    const near = (a, r) => Math.hypot(a.pos.x - T.x, a.pos.z - T.z) < r && this.fac.floorOf(a.pos.y + 0.5) === T.floor;
    if (!ob.found && (ob.badge || ob.cards.length)) for (const a of agents) {
      if (!a.alive || !near(a, 7)) continue;
      if (!this.fac.los({ x: a.pos.x, y: a.pos.y + 1.5, z: a.pos.z }, { x: T.x, y: T.y + 0.4, z: T.z + 0.2 })) continue;
      ob.found = true;
      ob.access = 3;
      const room = ROOMS.find((r) => r.id === T.room);
      this._toast(`Archive server found — ${room ? room.name : 'rack room'}${T.floor ? ' (upper floor)' : ''}.`, 'cyan');
      this._voice(a.role, a.role === 'spotter' ? 'Found it. Jacking in.' : 'Got the beacon. On me.');
      break;
    }
    // Upload runs while someone allowed stays at the rack after the signal lock.
    const atRack = ob.aligned && ob.upload < 1 && agents.some((a) => a.alive && !a.downed && this._techRole(a.role) && near(a, 3));
    ob.uploading = atRack;
    if (atRack) {
      ob.upload = Math.min(1, ob.upload + 0.1 * dt);
      if (!ob.traced && !ob.quiet) ob.trace = Math.min(1, ob.trace + 0.05 * dt);
      if (ob.upload >= 1) { this._toast(ob.quiet ? 'Malware uploaded clean. Pull the drive — SENTINEL is none the wiser.' : 'Malware uploaded. Evidence copied. Extract the drive.', 'cyan'); this._voice('isr', 'Upload complete. Pull the drive.'); }
      if (ob.trace >= 1 && !ob.traced) {
        ob.traced = true;
        S.raise(1, null);
        this._toast('SENTINEL traced the uplink!', 'red');
        this._broadcast({ k: 'trace' });
        this.hud.flash('TRACED', 'red');
        for (const g of S.guards) if (g.state !== 'dead') S._alert(g, null, { x: T.x, z: T.z + 4, y: T.y });
      }
    } else if (ob.aligned && ob.upload < 1) ob.trace = Math.max(0, ob.trace - 0.03 * dt);
    for (const a of agents) this._interact(a, a.role === this.role ? this._eHeld : this.partner.e, dt);
    for (const a of agents) if (ob.drive === a.role && (a.downed || !a.alive)) this._dropDrive(a.role, a.pos, 'The drive is on the ground!');
    if (S.alarm >= 1 && !S.lockdown) this._loudAlarm = true;
    this._vanTick(dt);
    const allOut = agents.length && agents.every((a) => !a.alive);
    if (allOut) this._lose();
    const prev = ob.step;
    ob.step = this._step();
    if (ob.step !== prev) this._stepChanged(prev);
  }

  _step() {
    const ob = this.obj;
    if (!ob.perimeter) return 0;
    if (!ob.relay) return 1;
    if (!ob.badge && !ob.cards.length) return 2;
    if (!ob.found) return 3;
    if (ob.upload < 1) return 4;
    if (!ob.drive) return 5;
    return 6;
  }

  _stepChanged() {
    const o = OBJECTIVES[this.obj.step];
    if (o) this.hud.objective(this.obj.step, o, true);
    this.audio.ping && this.audio.ping();
  }

  // Host: the drive lands on the floor where the carrier is.
  _dropDrive(role, pos, msg = null) {
    const ob = this.obj;
    if (ob.drive !== role) return;
    ob.drive = 'ground';
    ob.driveAt = { x: pos.x, y: pos.y, z: pos.z };
    this._toast(msg || `${role === this.role ? this.name : this.partnerName} dropped the drive.`, msg ? 'red' : 'cyan');
  }

  _interact(a, held, dt) {
    const ob = this.obj, S = this.sentinel, role = a.role, p = a.pos, T = this.fac.target;
    let best = null;
    const opt = (key, label, dur, fn, auto = false) => { if (!best) best = { key, label, dur, fn, auto }; };
    if (!a.alive || a.downed) { this.prompts[role] = a.downed ? { label: 'DOWNED — waiting for a revive', p: 0 } : null; return; }
    if (this._dragInteract(a, held, null)) return;
    this._vanInteract(a, held, dt, opt);
    const sameFloor = (y) => Math.abs(y - p.y) < 1.6;
    const other = this.agents().find((b) => b.role !== role);
    // Revive: each operator carries one IFAK. Use it on your partner; after that it's the medevac drone.
    if (other && other.downed && other.alive && Math.hypot(other.pos.x - p.x, other.pos.z - p.z) < 2.2 && sameFloor(other.pos.y)) {
      const on = other.role === this.role ? this.name : this.partnerName;
      if ((ob.ifak[role] || 0) > 0) opt('revive', `Hold E — patch up ${on} with your IFAK`, 3, () => { ob.ifak[role]--; this._toast(`IFAK used on ${on}.`, 'cyan'); if (other.role === this.role) this._revived(55); else this._broadcast({ k: 'revive', role: other.role, hp: 55 }); });
      else opt('revivex', `No IFAK left — ${on} needs the medevac drone`, 0, null);
    }
    // Knife takedown from behind (or on an unaware patrol at arm's length).
    for (const g of S.guards) {
      if (g.state === 'dead' || g.state === 'alert' || g.state === 'berserk' || g.tower) continue;
      const d = Math.hypot(g.x - p.x, g.z - p.z);
      if (d > 1.9 || Math.abs(p.y - g.y) > 1) continue;
      const behind = Math.abs(angDiff(Math.atan2(-(p.x - g.x), -(p.z - g.z)), g.yaw + g.look)) > 1.9;
      if (behind || (g.state === 'patrol' && d < 1.2) || g.stagger > 0) {
        opt('takedown', 'E — knife takedown', 0, () => {
          S.damage(g.id, 999, 'takedown', null, 'head');
          this._killFeed(g, 'takedown', role, false, 0);
          if (role === this.role) this._knife(); else this._broadcast({ k: 'takedown', role });
          if (g.chief) this._toast(this.mission === 'nightwatch' ? 'The Overseer is down. Take its badge.' : 'Site Chief is down. Take his badge.', 'amber');
        });
        break;
      }
    }
    // Loot the badge (the team shares it; in co-op only the spotter can swipe it).
    if (!ob.badge) {
      const chief = S.guards.find((g) => g.chief && g.state === 'dead' && g.badge);
      if (chief && Math.hypot(chief.x - p.x, chief.z - p.z) < 2.4 && sameFloor(chief.y)) opt('badge', 'Hold E — take the master badge', 1, () => { ob.badge = true; chief.badge = false; this._toast('Master badge cloned to the team — it opens every rack room. Find the server with the amber beacon.', 'cyan'); });
    }
    this._dragInteract(a, held, opt);
    const rl = SPOTS.relay;
    if (!ob.relay && Math.hypot(rl.x - p.x, rl.z - p.z) < 2.4 && p.y < 2) opt('relay', 'Hold E — plant network relay', 2.2, () => { ob.relay = true; ob.access = Math.max(ob.access, 2); this.fac.relayPlanted = true; this._toast('Relay planted. The building is on the console: cameras, doors, devices, contacts.', 'cyan'); });
    // Exterior doors. Mechanical locks (maintenance, side) can't be hacked: the spotter has
    // to pick them in person. Electronic locks (front, dock) open over the network: the
    // console, a quickhack, or the AI spotter. The shooter can't unlock anything; he only
    // uses doors that are already open to him.
    const picker = role === 'spotter' || this.operative;
    for (const d of Object.values(this.fac.doors)) {
      if (d.kind !== 'mech' && d.kind !== 'elec') continue;
      if (d.unlocked || d.sealed || d.open || !sameFloor(d.y || 0) || Math.hypot(d.x - p.x, d.z - p.z) > 2.6) continue;
      const who = role === this.role ? this.partnerName : this.name;
      if (d.kind === 'mech') {
        if (picker) opt('pick', 'Hold E \u2014 pick the lock (lock-pick set)', 3, () => { d.unlocked = true; this._toast('Lock picked. The door\u2019s open to both of you.', 'dim'); });
        else opt('pickx', `Mechanical lock \u2014 ${this.solo ? 'can\u2019t be hacked; use the front door' : who + ' has to pick it'}`, 0, null);
      } else if (!picker) opt('elecx', `Electronic lock \u2014 ${this.solo ? 'Rōnin will hack it' : who + ' can open it over the network'}`, 0, null);
      else opt('elecx', 'Electronic lock \u2014 hack it: hold TAB and look at it, or use the console', 0, null);
      break;
    }
    // Keycard doors on the rack rooms.
    for (const d of Object.values(this.fac.doors)) {
      if (d.kind !== 'badge' || d.unlocked || !sameFloor(d.y) || Math.hypot(d.x - p.x, d.z - p.z) > 2.4) continue;
      const cd = CARDS[d.room], rn = (ROOMS.find((r) => r.id === d.room) || {}).name || 'RACK ROOM';
      if (ob.cards.includes(d.room)) opt('swipe', `Hold E — swipe the ${cd.name} keycard (${rn})`, 0.8, () => { d.unlocked = true; this._toast(`${cd.name} keycard accepted — ${rn}.`, 'dim'); });
      else if (ob.badge) opt('swipe', `Hold E — swipe the master badge (${rn})`, 0.8, () => { d.unlocked = true; this._toast(`Master badge accepted — ${rn}.`, 'dim'); });
      else opt('badgex', `${rn} — needs the ${cd.name} keycard (search the office drawers)`, 0, null);
      break;
    }
    // The roof hatch: a ladder between the roof and the data floor's storage room.
    {
      const H = this.fac.hatch, F = BUILDING.f1;
      if (H && Math.hypot(p.x - H.x, p.z - H.z) < 1.6) {
        const onRoof = p.y > BUILDING.h - 0.5;
        const dest = onRoof ? { x: H.x, y: F + 0.02, z: H.z + 1.2 } : p.y > F - 1 && p.y < F + 2 ? { x: H.x, y: H.roofY, z: H.z - 1.3 } : null;
        if (dest) opt('hatch', onRoof ? 'Hold E \u2014 climb down the hatch' : 'Hold E \u2014 climb up to the roof', 0.8, () => {
          if (role === this.role) this.player.pos.set(dest.x, dest.y, dest.z); else this._broadcast({ k: 'tp', role, ...dest });
          this.audio.click();
        });
      }
    }
    // The elevator: ride it from inside the car, or call it from a landing.
    {
      const L = ob.lift, F = BUILDING.f1, moving = Math.abs(L.y - L.to * F) > 0.01;
      const dx = (SHAFT.door[0] + SHAFT.door[1]) / 2, dz = SHAFT.z1 + 0.8;
      if (!moving && this.fac.inLift(p.x, p.z, p.y)) opt('lift', L.to ? 'E — elevator \u25BC LOBBY' : 'E — elevator \u25B2 DATA FLOOR', 0, () => { L.to = L.to ? 0 : 1; });
      else if (Math.hypot(p.x - dx, p.z - dz) < 2 && Math.abs(p.y - (p.y > F - 1 ? F : 0)) < 1.6) {
        const lv = p.y > F - 1 ? 1 : 0;
        if (moving) opt('liftx', 'Elevator on its way\u2026', 0, null);
        else if (L.to !== lv) opt('lift', 'E — call the elevator', 0, () => { L.to = lv; });
      }
    }
    this._stationOpt(a, opt);
    // The archive server: jack in (signal lock), then extract (drive release). Minigames run
    // on the operator's own screen; the host just offers the prompt.
    if (ob.found && Math.hypot(T.x - p.x, T.z - p.z) < 2.2 && this.fac.floorOf(p.y + 0.5) === T.floor) {
      if (!this._techRole(role)) opt('techx', 'The spotter works the server — cover them', 0, null);
      else if (!ob.aligned) opt('jack', 'E — jack in: upload the malware', 0, () => {});
      else if (ob.upload >= 1 && !ob.drive) opt('extract', 'E — extract the drive', 0, () => {});
      else if (ob.upload < 1) this.prompts[role] = { label: `UPLOADING ${Math.round(ob.upload * 100)} % · TRACE ${Math.round(ob.trace * 100)} % — stay at the rack`, p: ob.upload, key: 'upl' };
    }
    if (ob.drive === 'ground' && ob.driveAt && Math.hypot(ob.driveAt.x - p.x, ob.driveAt.z - p.z) < 2 && sameFloor(ob.driveAt.y || 0)) opt('pickup', 'Hold E — pick up the drive', 0.6, () => { ob.drive = role; this._toast(`${role === this.role ? this.name : this.partnerName} has the drive.`, 'cyan'); });
    const dk = this.fac.doors.dock;
    if (ob.drive && !dk.perm && Math.hypot(dk.x - p.x, dk.z - p.z) < 3.5) opt('force', 'Hold E — force the dock door', 8, () => { dk.perm = true; dk.sealed = false; this._toast('Dock forced open.', 'cyan'); this.sentinel.noise({ x: dk.x, y: 1, z: dk.z }, 30, true); });
    if (!best) { if (!(this.prompts[role] && this.prompts[role].key === 'upl' && ob.uploading)) this.prompts[role] = null; this.holdT[role] = null; return; }
    if (!best.fn) { this.prompts[role] = { label: best.label, p: 0, key: best.key }; return; }
    let h = this.holdT[role];
    if (!h || h.key !== best.key) h = this.holdT[role] = { key: best.key, t: 0 };
    if (held) h.t += dt; else h.t = 0;
    this.prompts[role] = { label: best.label, p: best.dur ? clamp(h.t / best.dur, 0, 1) : 0, key: best.key };
    if (best.key === 'jack' || best.key === 'extract') return; // the operator's client opens the minigame
    if (held && h.t >= best.dur && !h.done) {
      h.done = true; best.fn();
      // The sound of it, for both of you.
      if (!/^(drag|takedown|revive)$/.test(best.key)) { const at = { x: p.x, y: p.y + 1, z: p.z }; this.foley.interact(at, best.key); this._broadcast({ k: 'sfxi', x: at.x, y: at.y, z: at.z, key: best.key }); }
    }
    if (!held) h.done = false;
    if (held && best.key === 'pick' && Math.random() < dt * 2) this.sentinel.noise(p, 6, false);
  }

  // Room stations: drawers (keycards), storage shelves (ammo), the break-room fridge (HP),
  // the comms rack (no more radio calls) and the CCTV desk (cameras stop reporting you).
  _stationOpt(a, opt) {
    const ob = this.obj, role = a.role, p = a.pos;
    const q = this.fac.stationNear(p.x, p.z, p.y);
    if (!q) return;
    const who = role === this.role ? this.name : this.partnerName;
    const fast = this._techRole(role) || this.operative;
    const used = ob.used[q.id] || 0;
    const give = (k, extra) => { if (role === this.role) this[k](extra); else this._broadcast({ k: k === '_heal' ? 'heal' : 'ammo', role, hp: extra }); };
    switch (q.kind) {
      case 'drawer':
        if (ob.searched.includes(q.id)) return;
        opt('search', 'Hold E — search the desk drawer', 1.2, () => {
          ob.searched.push(q.id);
          this.sentinel.noise({ x: q.x, y: q.y + 1, z: q.z }, 5, false);
          if (q.card && !ob.cards.includes(q.card)) {
            ob.cards.push(q.card);
            const cd = CARDS[q.card], rn = (ROOMS.find((r) => r.id === q.card) || {}).name;
            this._toast(`${who} found the ${cd.name} keycard — ${rn}${/^(dhb|srv|arch)$/.test(q.card) ? ' (upper floor)' : ''}.`, 'amber');
            this._voice(role, `${cd.name.charAt(0) + cd.name.slice(1).toLowerCase()} keycard.`);
          } else this._toast(['Drawer: pens, a stale protein bar.', 'Drawer: cable ties and a dead vape.', 'Drawer: shift rota. No card.', 'Drawer: empty.'][ob.searched.length % 4], 'dim');
        });
        return;
      case 'shelf':
        if (used >= q.uses) return opt('shelfx', 'Storage shelf — already cleared', 0, null);
        opt('shelf', 'Hold E — grab ammo and kit off the shelf', 1.4, () => { ob.used[q.id] = used + 1; give('_ammo'); this._toast(`${who} restocked from storage.`, 'dim'); });
        return;
      case 'fridge':
        if (used >= q.uses) return opt('fridgex', 'Fridge — nothing left but a lemon', 0, null);
        opt('fridge', `Hold E — eat something from the fridge (+40 HP, ${q.uses - used} left)`, 1.6, () => { ob.used[q.id] = used + 1; give('_heal', 40); this._toast(`${who} raided the break-room fridge.`, 'dim'); });
        return;
      case 'comms':
        if (ob.commsDown) return opt('commsx', 'Comms rack — radio net is down', 0, null);
        opt('comms', `Hold E — hack the comms rack in person${fast ? '' : ' (slow without the tablet)'}`, fast ? 3 : 5, () => {
          ob.commsDown = true;
          this.sentinel.cutComms();
          this._toast('Comms rack hacked: SENTINEL\u2019s radio net is down. Guards can\u2019t call for backup.', 'cyan');
          this._voice(role, 'Comms are down.');
        });
        return;
      // Barracks: the spotter hacks the door shut for a while; the shooter can C4 it for good.
      // Drone bay: a hack grounds it for good; so does C4. Planting C4 puts every guard on alert.
      case 'barracks':
      case 'bay': {
        const site = q.kind, name = site === 'bay' ? 'drone bay' : 'barracks';
        const st = site === 'bay' ? ob.bay : ob.barracks;
        if (st === 'destroyed') return opt(site + 'x', `The ${name} is wrecked`, 0, null);
        if (ob.c4.some((c) => c.site === site)) return opt(site + 'x', `C4 is set on the ${name} \u2014 get clear!`, 0, null);
        const c4 = role === 'shooter' && (!this.operative || (role === this.role && this.input.held('ShiftLeft')));
        if (c4) {
          opt('c4', `Hold E \u2014 plant C4 on the ${name} (alerts every guard)`, 2.5, () => this._plantC4(site, q, role));
        } else {
          if (site === 'bay' && st === 'hacked') return opt('bayx', 'Drone bay grounded \u2014 no more launches', 0, null);
          if (site === 'barracks' && ob.barracksT > 0) return opt('barx', `Barracks locked down \u2014 ${Math.ceil(ob.barracksT)} s`, 0, null);
          opt(site, site === 'bay' ? 'Hold E \u2014 hack the drone bay controls (ground it for good)' : 'Hold E \u2014 hack the barracks door (lock them in for 90 s)', site === 'bay' ? 3.5 : 3, () => {
            if (site === 'bay') { ob.bay = 'hacked'; this._toast('Drone bay hacked: no more drone launches.', 'cyan'); this._radio(role, "Drone bay's down."); }
            else { ob.barracksT = 90; this._toast('Barracks door hacked shut: no reinforcements for 90 s.', 'cyan'); this._radio(role, 'Barracks locked.'); }
          });
        }
        return;
      }
      case 'cctv':
        if (ob.cctv) return opt('cctvx', 'CCTV desk — the feeds are yours', 0, null);
        opt('cctv', `Hold E — hack the CCTV desk in person${fast ? '' : ' (slow without the tablet)'}`, fast ? 3 : 5, () => {
          ob.cctv = true;
          this.sentinel.cutCctv();
          this._toast('CCTV hacked: every camera is looped for SENTINEL and feeding the console.', 'cyan');
          this._voice(role, 'Cameras are ours.');
        });
        return;
    }
  }

  // C4: a six-second fuse. Planting it is loud work: every guard on the map is alerted to it.
  _plantC4(site, q, role) {
    const ob = this.obj, S = this.sentinel;
    const at = site === 'bay' ? { x: -52, y: 1.0, z: 26.85 } : { x: 45.8, y: 1.0, z: 21.2 };
    ob.c4.push({ id: (this._c4id = (this._c4id || 0) + 1), site, x: at.x, y: at.y, z: at.z, t: 6 });
    S.raise(1, null);
    for (const g of S.guards) if (g.state !== 'dead' && g.state !== 'flee' && !g.tower) S._alert(g, null, { x: q.x, z: q.z, y: 0 });
    this._toast(`C4 planted on the ${site === 'bay' ? 'drone bay' : 'barracks'} \u2014 6 s. Every guard is coming.`, 'red');
    this._radio(role, 'Charge set! Get clear!');
  }
  _c4Tick(dt) {
    const ob = this.obj, S = this.sentinel;
    if (ob.barracksT > 0) ob.barracksT = Math.max(0, ob.barracksT - dt);
    S.barracksDown = ob.barracks === 'destroyed' || ob.barracksT > 0;
    S.bayDown = ob.bay !== 'ok';
    for (const c of ob.c4) {
      c.t -= dt;
      if (c.t > 0) continue;
      c.done = true;
      if (c.site === 'bay') ob.bay = 'destroyed'; else ob.barracks = 'destroyed';
      // Blast: anything within 9 m.
      for (const g of S.guards) if (g.state !== 'dead' && Math.hypot(g.x - c.x, g.z - c.z) < 9) S.damage(g.id, 999, 'explosive', { x: c.x, z: c.z }, 'torso');
      for (const d of S.drones) if (d.state !== 'dead' && Math.hypot(d.x - c.x, d.z - c.z) < 9) S.damage(d.id, 999, 'explosive', { x: c.x, z: c.z }, 'torso');
      for (const a of this.agents()) {
        const dd = Math.hypot(a.pos.x - c.x, a.pos.z - c.z);
        if (a.alive && dd < 9) { const dmg = Math.round(120 * (1 - dd / 9)); if (a.role === this.role) this._damage(dmg, { x: c.x, z: c.z }); else this._broadcast({ k: 'blasthurt', role: a.role, dmg, x: c.x, z: c.z }); }
      }
      S.noise({ x: c.x, y: 1, z: c.z }, 140, true);
      this._toast(c.site === 'bay' ? 'Drone bay destroyed. No more drones.' : 'Barracks destroyed. No more reinforcements.', 'amber');
      this._broadcast({ k: 'boom', x: c.x, y: c.y, z: c.z });
      this._boom(c);
    }
    ob.c4 = ob.c4.filter((c) => !c.done);
  }
  _boom(c) {
    const p = new THREE.Vector3(c.x, c.y + 1, c.z);
    for (let i = 0; i < 6; i++) this.effects.puff(p.clone().add(new THREE.Vector3((Math.random() - 0.5) * 4, Math.random() * 3, (Math.random() - 0.5) * 4)), 'dust', 4 + Math.random() * 3, 2.5);
    this.audio.shotDistant(p, this.camera.position.distanceTo(p) / 343, false);
    this.audio.rumble && this.audio.rumble(2.5);
    this.post.uniforms.uStatic.value = Math.max(this.post.uniforms.uStatic.value, this.camera.position.distanceTo(p) < 40 ? 0.8 : 0.2);
  }
  // Every client: the charges' blinking LEDs, and smoke over wrecked sites.
  _c4Visuals(dt) {
    const ob = this.obj;
    this.c4Objs = this.c4Objs || new Map();
    const seen = new Set();
    for (const c of ob.c4 || []) {
      seen.add(c.id);
      let o = this.c4Objs.get(c.id);
      if (!o) {
        o = new THREE.Group();
        o.add(new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.14, 0.08), new THREE.MeshLambertMaterial({ color: '#c8b48a' })));
        const led = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), new THREE.MeshBasicMaterial({ color: '#ff2020' }));
        led.position.set(0.06, 0.08, 0.04);
        o.add(led);
        o.userData.led = led;
        o.position.set(c.x, c.y, c.z);
        this.scene.add(o);
        this.c4Objs.set(c.id, o);
      }
      const fast = c.t < 2 ? 6 : 2;
      const on = (this.t * fast) % 1 < 0.5;
      if (on && !o.userData.on) this.audio.beep(o.position, c.t < 2);
      o.userData.on = on;
      o.userData.led.visible = on;
    }
    for (const [id, o] of this.c4Objs) if (!seen.has(id)) { this.scene.remove(o); this.c4Objs.delete(id); }
    this._smokeT = (this._smokeT || 0) - dt;
    if (this._smokeT <= 0) {
      this._smokeT = 0.6;
      if (ob.barracks === 'destroyed') this.effects.puff(new THREE.Vector3(58 + (Math.random() - 0.5) * 10, 4.5, 22 + (Math.random() - 0.5) * 6), 'dust', 3.5, 3);
      if (ob.bay === 'destroyed') this.effects.puff(new THREE.Vector3(-52 + (Math.random() - 0.5) * 6, 4.2, 30 + (Math.random() - 0.5) * 4), 'dust', 3, 3);
    }
  }

  // Client: E on a jack/extract prompt opens the minigame; the result goes to the host.
  _serverMinigame(key) {
    if (this.mini.open) return;
    const kind = key === 'jack' ? 'upload' : 'extract';
    this.input.keys.clear();
    document.exitPointerLock && document.exitPointerLock();
    this._voice(this.role, kind === 'upload' ? 'Jacking in. Cover me.' : this.obj.quiet ? 'Pulling the drive.' : 'Pulling the drive.');
    this.mini.start(kind, (ok) => {
      this.input.requestLock();
      if (!ok) return;
      const ev = { k: kind === 'upload' ? 'aligned' : 'extracted', role: this.role, fail: ok === 'fail' };
      if (this.isHost) this._serverResult(ev); else this._broadcast(ev);
    }, () => {
      // A fumble spikes the trace (host-side).
      if (this.isHost) this.obj.trace = Math.min(0.99, this.obj.trace + 0.08); else this._broadcast({ k: 'fumble' });
    });
  }
  _serverResult(m) {
    const ob = this.obj;
    if (m.k === 'aligned' && !ob.aligned) {
      ob.aligned = true;
      if (!m.fail) {
        // Clean lock: SENTINEL never sees the upload. No trace, no lockdown.
        ob.quiet = true;
        ob.trace = 0;
        this._toast('Signal locked clean. Upload running silent — hold the rack.', 'cyan');
        this._voice('isr', 'Clean lock. Hold the rack.');
      } else {
        // Botched: ICE. The upload still forces through, but the garrison rings the building.
        ob.quiet = false;
        ob.ice = true;
        this.sentinel.iceAlert(BUILDING);
        this._iceStart();
        this.hud.flash('ICE ALERT', 'red');
        this._broadcast({ k: 'ice' });
        this._toast('Upload forced through, but SENTINEL\u2019s ICE tripped. Guards are ringing the building — sneak out or go loud.', 'red');
        this._voice('isr', 'ICE alert. Guards to the walls.');
      }
    }
    if (m.k === 'extracted' && ob.upload >= 1 && !ob.drive) {
      ob.drive = m.role;
      this.fac.driveMesh.visible = false;
      if (ob.quiet) { this._toast('Drive out. Nobody knows you were here — walk it to the van.', 'cyan'); this._voice('isr', "Intel's out. Get to the van."); }
      else this._toast('Drive out. The ring is still on the walls — slip through it or punch a hole. Van on the east track.', 'amber');
    }
  }

  _lockdown() {
    const S = this.sentinel;
    S.lockdown = true;
    S.raise(1, null);
    for (const id of ['front', 'side', 'dock']) { const d = this.fac.doors[id]; d.sealed = true; d.hackOpen = 0; }
    const T = this.fac.target;
    for (const g of S.guards) if (g.state !== 'dead') S._alert(g, null, { x: T.x, z: T.z + 6, y: T.y }), g.searchT = 20;
    this._toast('SENTINEL: lockdown. The building is sealed.', 'red');
    this._toast('The van is hot on the east track. Get the dock open \u2014 spotter drives, shooter rides shotgun.', 'cyan');
    this._lockdownFx();
    this._broadcast({ k: 'lockdown' });
  }

  _lockdownFx() {
    this.hud.flash('LOCKDOWN', 'red');
  }

  // ---- end ------------------------------------------------------------------------------
  _rating(win) {
    const st = this.sentinel.stats;
    if (!win) return 'BURNED';
    if (this.sentinel.alarmPeakPre >= 1 || this._loudAlarm) return 'LOUD';
    if (st.kills > 0) return 'LETHAL';
    if (st.takedowns > 0) return 'SILENT';
    return 'GHOST';
  }

  _win() {
    if (this.ended) return;
    const info = this._endInfo(true);
    this._end(true, info);
    this.send({ t: 'end', win: true, info });
  }
  _lose() {
    if (this.ended) return;
    const info = this._endInfo(false);
    this._end(false, info);
    this.send({ t: 'end', win: false, info });
  }
  _endInfo(win) {
    const st = this.sentinel.stats;
    return { rating: this._rating(win), time: Math.round(this.t), kills: st.kills, takedowns: st.takedowns, drones: st.drones, spotted: st.spotted, alarm: Math.round(this.sentinel.alarmPeak * 100) };
  }

  _end(win, info) {
    if (this.ended) return;
    this.ended = { win, info };
    if (this.tablet.visible) this.tablet.close();
    if (this.quad && this.quad.active) this._endQuad();
    document.exitPointerLock && document.exitPointerLock();
    if (this.cine.active === 'intro') this.cine.skip();
    // A win rolls the drive out into the sunrise first; the debrief lands over it.
    if (win) this.cine.startOutro(() => this.hud.debrief(win, info, this.stats));
    else this.hud.debrief(win, info, this.stats);
  }

  // ---- visuals ------------------------------------------------------------------------
  _updatePartner(dt) {
    const Q = this.partner;
    if (!Q.ai && Q.tpos) {
      if (Q.pos.distanceTo(Q.tpos) > 8) Q.pos.copy(Q.tpos);
      Q.pos.lerp(Q.tpos, Math.min(1, dt * 12));
      Q.yaw += angDiff(Q.tyaw || 0, Q.yaw) * Math.min(1, dt * 12);
    }
    if (Q.ai && Q.role === 'spotter' && !this.ended && !(this.paused && this.solo) && !this._aiWalk(dt)) {
      if (!this.approach) { const o = SPOTS.overlook; Q.pos.set(o.x, this.fac.groundAt(o.x, o.z, 200, 0.5), o.z); Q.st = 1; Q.moving = false; }
      Q.yaw = Math.PI * 0.02;
    }
    const av = Q.avatar;
    av.setVisible(Q.seen && !Q.avatarHidden && !Q.kia);
    if (!Q.seen) return;
    av.update(dt, { p: Q.pos, yaw: Q.yaw, pitch: Q.pitch || 0, st: Q.downed ? 2 : Q.st, moving: Q.moving, w: Q.w, sprint: !!Q.sprinting && Q.moving });
    // Cloaked shooter: shimmer instead of the kit.
    const ck = Q.cloak;
    if (ck !== Q._ck) {
      Q._ck = ck;
      av.root.traverse((o) => {
        if (!o.isMesh) return;
        if (ck) { o.userData._m = o.userData._m || o.material; o.material = this.cloakMat; }
        else if (o.userData._m) o.material = o.userData._m;
      });
    }
    // Partner's quad.
    if (Q.quad) { this.quadObj.visible = true; this.quadObj.position.set(Q.quad[0], Q.quad[1], Q.quad[2]); this.quadObj.rotation.y = Q.quad[3]; }
    else if (this.quad && this.quad.parked) { this.quadObj.visible = true; this.quadObj.position.set(this.quad.x, this.quad.y, this.quad.z); this.quadObj.rotation.y = this.quad.yaw; }
    else if (!(this.quad && this.quad.active)) this.quadObj.visible = false;
    // Your own body when down (third person).
    const showSelf = (this.downed && !this.kia) || this.isr.active || !!(this.quad && this.quad.active);
    this.selfAvatar.setVisible(showSelf);
    if (showSelf) this.selfAvatar.update(dt, { p: this.player.pos, yaw: this.player.yaw, pitch: 0, st: this.downed ? 2 : 1, moving: false, w: true });
  }

  // The detector going off: buzzer and a red strobe on its arch.
  _checkpointFx() {
    this.audio.buzzer && this.audio.buzzer(new THREE.Vector3(0, 2.2, CHECKPOINT.z));
    this._ckFx = 3;
  }
  _liftVisuals(dt) {
    const L = this.obj.lift, F = this.fac;
    if (!L) return;
    const was = F.lift.y;
    F.setLift(L.y);
    const moving = Math.abs(L.y - was) > 1e-4;
    const pos = new THREE.Vector3((SHAFT.x0 + SHAFT.x1) / 2, L.y + 1.4, (SHAFT.z0 + SHAFT.z1) / 2);
    if (moving && !this._liftMoving) this.audio.startLoop('lift', pos, 'lift', 0.18);
    if (moving) this.audio.updateLoop('lift', pos);
    if (!moving && this._liftMoving) { this.audio.stopLoop('lift'); this.audio.chime && this.audio.chime(pos); }
    this._liftMoving = moving;
    // Checkpoint arch light: green armed, dark once the CCTV is ours, red while it's alarming.
    const C = F.checkpoint;
    if (C) {
      this._ckFx = Math.max(0, (this._ckFx || 0) - dt);
      C.led.material.color.set(this._ckFx > 0 ? ((this.t * 8) % 1 < 0.5 ? '#ff2020' : '#400000') : this.obj.cctv ? '#202428' : '#30ff70');
    }
  }

  _visuals(dt) {
    this._iceClient(dt);
    this._liftVisuals(dt);
    this._xrTick(dt);
    this._abTick(dt);
    this._devTick(dt);
    this._binoView(dt);
    this._neuroTick(dt);
    this._eyesTick(dt);
    this._nvgTick(dt);
    this._spatialTick(dt);
    if (this.ambient) {
      if (!this.ambient.on) this.ambient.start();
      const pp = this.player.pos, rm = this.fac.roomAt(pp.x, pp.z, pp.y);
      this.ambient.update(dt, pp, this.fac.insideBuilding(pp.x, pp.z, pp.y), !!(rm && rm.racks));
    }
    this._c4Visuals(dt);
    this.fac.syncStations(this.obj, this.t);
    this._vanVisual(dt);
    this._lasersTick();
    this.cloakMat.uniforms.uTime.value = this.t;
    this.cloakMat.uniforms.uFlick.value = Math.max(this.cloak.flick, this.partner.cloakFlicker ? 1 : 0) * 0.6;
    // Trails fade (and the vapor trail swells a little as it hangs).
    for (const tr of this.trails) {
      tr.t += dt;
      const k = tr.t / tr.life;
      if (tr.ring) { const s = 1 + k * tr.ring; tr.mesh.scale.set(s, 1, s); tr.mesh.material.opacity = 0.6 * (1 - k); }
      else if (tr.grow) { tr.mesh.material.opacity = 0.55 * (1 - k) * (1 - k); tr.mesh.scale.set(1 + k * 3, 1 + k * 3, 1); tr.mesh.children[0].material.opacity = 0.12 * (1 - k); }
      else tr.mesh.material.opacity = 0.9 * (1 - k);
      if (k >= 1) { this.scene.remove(tr.mesh); tr.mesh.geometry.dispose(); }
    }
    this.trails = this.trails.filter((tr) => tr.t < tr.life);
    // Supply crates.
    const seen = new Set();
    for (const c of this.crates) {
      seen.add(c.id);
      let o = this.crateObjs.get(c.id);
      if (!o) { o = buildCrate(); this.scene.add(o); this.crateObjs.set(c.id, o); }
      o.position.set(c.x, c.y, c.z);
      o.userData.chute.visible = !c.landed;
    }
    for (const [id, o] of this.crateObjs) if (!seen.has(id)) { this.scene.remove(o); this.crateObjs.delete(id); }
    // Medevac drone.
    this.medObj.visible = !!this.medevac;
    if (this.medevac) { this.medObj.position.set(this.medevac.x, this.medevac.y, this.medevac.z); for (const r of this.medObj.userData.rotors) r.rotation.y += dt * 40; }
    // Own quad seen from outside isn't needed (you're in it).
    if (this.quad && this.quad.active) this.quadObj.visible = false;
    // Exfil bird.
    if (this.heli.visible) {
      this.heliT = (this.heliT || 0) + dt;
      const lz = SPOTS.lz;
      const k = clamp(this.heliT / 25, 0, 1);
      const e = 1 - (1 - k) * (1 - k);
      const x = lz.x + 220 * (1 - e), y = terrainHeight(lz.x, lz.z) + 6 + 40 * (1 - e) + Math.sin(this.t * 1.3) * 0.3, z = lz.z - 140 * (1 - e);
      this.heli.position.set(x, y, z);
      this.heli.rotation.y = Math.PI / 2 + 0.6 * (1 - e);
      this.heli.userData.rotor.rotation.y += dt * 25;
      this.heli.userData.rotor2.rotation.y += dt * 25;
      this.heli.userData.light.visible = Math.sin(this.t * 6) > 0;
      this.fac.lzRing.material.opacity = 0.35 + Math.sin(this.t * 4) * 0.2;
      if (!this._heliLoop) { this._heliLoop = true; this.audio.startLoop('heli', this.heli.position, 'rotor', 0.5); }
      this.audio.updateLoop('heli', this.heli.position);
    }
    // Light toggles drive the point lights too.
    for (const pt of this.points) pt.L.intensity = !pt.src || pt.src.on ? pt.I : 0;
    this._irTick(dt);
    this.atmos.update(dt, this.camera, hazeUniforms.uWind.value, (x, z) => this.fac.groundAt(x, z, this.camera.position.y + 1, 2));
    this.isr.update(dt);
    // The drive model leaves the rack once pulled.
    this.fac.driveMesh.visible = !this.obj.drive;
    this._groundDrive();
  }

  // Render a camera into a small 2D canvas (via a hidden corner of the main canvas).
  _renderToCanvas(cam, cv) {
    const rect = cv.getBoundingClientRect();
    const w = Math.max(16, Math.round(rect.width)), h = Math.max(10, Math.round(rect.height));
    if (cv.width !== w) { cv.width = w; cv.height = h; }
    cam.aspect = w / h;
    cam.updateProjectionMatrix();
    this._cornerRender(cam, w, h, cv, cv.getContext('2d'));
  }

  // How hard bright light in front of you blooms the night-vision tube (0..1.5).
  _washout() {
    const cam = this.camera, o = cam.position;
    const f = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    const zoom = WEAPON.baseFov / cam.fov;
    let w = 0;
    for (const L of this.fac.lightSources) {
      if (!L.on) continue;
      const dx = L.x - o.x, dy = L.y - o.y, dz = L.z - o.z, d = Math.hypot(dx, dy, dz);
      if (d > 90 || d < 0.5) continue;
      const dot = (dx * f.x + dy * f.y + dz * f.z) / d;
      const cone = 1 - Math.min(1, (1 - dot) * 12 * zoom);
      if (cone <= 0) continue;
      if (L.interior && !this.fac.insideBuilding(o.x, o.z, o.y)) continue;
      w += cone * (1 - d / 90) * (L.kind === 'panel' ? 0.25 : 0.7) * Math.min(2, zoom * 0.6 + 0.4);
    }
    if (this.wlTheirs) {
      const L = this.wlTheirs, dx = o.x - L.x, dy = o.y - L.y, dz = o.z - L.z, d = Math.hypot(dx, dy, dz);
      if (d < 40 && (dx * L.dx + dy * L.dy + dz * L.dz) / d > 0.96) w += (1 - d / 40) * 1.4;
    }
    // Weapon lights pointed straight at you.
    for (const g of this.sentinel.guards) {
      if (g.state === 'dead' || !g.obj.userData.beam.visible) continue;
      const d = Math.hypot(g.x - o.x, g.z - o.z);
      if (d > 18) continue;
      const toMe = Math.atan2(-(o.x - g.x), -(o.z - g.z));
      let a = toMe - (g.yaw + (g.look || 0));
      a = Math.atan2(Math.sin(a), Math.cos(a));
      if (Math.abs(a) < 0.35) w += (1 - d / 18) * 1.2;
    }
    return Math.min(1.2, w);
  }

  _render(dt) {
    const u = this.post.uniforms;
    u.uTime.value = this.t;
    u.uInked.value = this.look === 'og' ? 0 : 1;
    u.tDepth.value = this.composer.readBuffer.depthTexture;
    u.uNear.value = this.camera.near;
    u.uFar.value = this.camera.far;
    // Cel shading for the Inked look; re-swept now and then for meshes added since (drops, bodies).
    this._lookSweep = (this._lookSweep || 0) - dt;
    if (this._lookSweep <= 0) { this._lookSweep = 1; applyLook(this.scene, this.look); }
    const P = this.player;
    const quad = this.quad && this.quad.active;
    const isr = this.isr.active;
    const scopeNV = !isr && P.def.scope && P.scopeT > 0.6 && this.scopeNV !== false;
    const nv = isr || quad || scopeNV || this.nv;
    u.uNV.value += ((nv ? 1 : 0) - u.uNV.value) * Math.min(1, dt * 10);
    u.uMode.value = isr ? (this.isr.mode === 'IR' ? 3 : 2) : quad ? 2 : scopeNV ? 1 : 0;
    u.uWash.value += ((nv && !isr ? this._washout() : 0) - u.uWash.value) * Math.min(1, dt * 6);
    u.uCloak.value += ((this.cloak.on && !quad ? 1 : 0) - u.uCloak.value) * Math.min(1, dt * 6);
    this.dmgFx = Math.max(0, (this.dmgFx || 0) - dt * 1.5);
    u.uDamage.value = Math.max(this.dmgFx, this.hp < this.maxHp * 0.3 && !this.downed ? 0.35 + Math.sin(this.t * 4) * 0.1 : 0);
    u.uDown.value = this.downed || this.kia ? 1 : 0;
    u.uStatic.value = Math.max(0, u.uStatic.value - dt * 2) + (quad && this.quad.bat < 8 ? 0.4 : 0);
    // (drawn first: the main frame then paints over the corner it borrowed)
    // ISR picture-in-picture (spotter HUD), a few times a second.
    if (this._pipIsr && this.hud.sqIsr && !this.isr.active && !this.tablet.visible) {
      this._pipIsr = false;
      const cam = this.isr.cam;
      if (this.isr.mode === 'IR') cam.layers.enable(1); else cam.layers.disable(1);
      this._renderToCanvas(cam, this.hud.sqIsr);
    }
    // Tablet camera feed (~15 Hz): rendered into a corner of the main canvas and copied into
    // the console *before* the post pass, so the full frame always paints over that corner.
    this._feedT = (this._feedT || 0) - dt;
    const f = this.tablet.visible && this._feedT <= 0 && this.tablet.feed();
    if (f) {
      this._feedT = 1 / 15;
      f.cam.layers.disable(1);
      this._cornerRender(f.cam, Math.round(f.w), Math.round(f.h), f.canvas, f.ctx);
      f.ctx.fillStyle = 'rgba(0,255,224,0.06)';
      for (let y = 0; y < f.canvas.height; y += 3) f.ctx.fillRect(0, y, f.canvas.width, 1);
    }
    this.composer.render();
  }

  // Render a camera into the bottom-left corner of the main canvas and copy it out to a 2D
  // canvas. Restores the renderer's exact viewport / scissor afterwards (the canvas isn't
  // always innerWidth x innerHeight, e.g. on iPad), so nothing is left behind on screen.
  _cornerRender(cam, w, h, canvas, ctx) {
    const r = this.renderer;
    const vp = r.getViewport(new THREE.Vector4()), sc = r.getScissor(new THREE.Vector4()), st = r.getScissorTest();
    r.autoClear = false;
    r.setScissorTest(true);
    r.setScissor(0, 0, w, h);
    r.setViewport(0, 0, w, h);
    r.clear();
    r.render(this.scene, cam);
    r.setScissorTest(st);
    r.setScissor(sc);
    r.setViewport(vp);
    r.autoClear = true;
    const pr = r.getPixelRatio(), src = r.domElement;
    ctx.drawImage(src, 0, src.height - h * pr, w * pr, h * pr, 0, 0, canvas.width, canvas.height);
  }

  // ---- HUD ------------------------------------------------------------------------------
  _buildHud() {
    this.hud = new CellHud(this);
  }

  exit() {
    if (this.net && this.net.close) this.net.close();
    if (location.search) location.replace(location.href.split('?')[0].split('#')[0]);
    else location.reload();
  }
}

// =============================================================================
// HUD
// =============================================================================
class CellHud {
  constructor(game) {
    this.g = game;
    const root = (this.root = document.createElement('div'));
    root.id = 'cell-hud';
    root.className = 'role-' + game.role;
    // The spotter (and lone operative) get the CYBER OPS / ISR panels across the top right.
    const pip = game.role === 'spotter' || game.operative;
    if (pip) root.classList.add('has-pip');
    document.body.classList.toggle('cell-pip', !!pip);
    root.innerHTML = `
      <canvas id="cell-overlay"></canvas>
      <div class="c-obj"><div class="c-obj-n"></div><div class="c-obj-t"></div><div class="c-obj-a"></div><div class="c-obj-h"></div></div>
      <div class="c-alarm"><span class="c-al-l">SENTINEL</span><b class="c-al-s">QUIET</b><i><em></em></i></div>
      <div class="c-partner"></div>
      <div class="c-feed"></div>
      <div class="c-comms"></div>
      <div class="c-vitals"><div class="c-hp"><span>HP</span><i><em></em></i></div><div class="c-camo"><span>CAMO</span><i><em></em></i></div><div class="c-chips"></div></div>
      <div class="c-ammo"><b class="c-am-n"></b><span class="c-am-r"></span><div class="c-am-w"></div><div class="c-am-s"></div></div>
      <div class="c-prompt"><span></span><i><em></em></i></div>
      <div class="c-flash"></div>
      <div class="c-keys"></div>
      <div class="c-dmg"></div>
      <div class="c-vis"><span>EXPOSURE</span><i><em></em></i><b></b></div>
      <div class="c-hunt"></div>
      <div class="c-sync"><i class="a"></i><b>SYNC</b><i class="b"></i></div>
      <div class="c-pip"><div class="c-sq" data-sq="ops"><span>CYBER OPS <em>TAB</em></span><canvas></canvas></div><div class="c-sq" data-sq="isr"><span>ISR \u00B7 PREDATOR <em>I</em></span><canvas></canvas></div></div>
      <div class="c-kit"></div>
      <div class="c-req"><span class="c-req-t"></span><button class="c-req-y">\u2713 <small>Y</small></button><button class="c-req-n">\u2715 <small>U</small></button></div>
      <div class="c-intro"><div class="c-intro-k">KESTREL RIDGE // DC-3</div><h1></h1><p class="c-intro-l"></p><p class="c-intro-r"></p></div>
      <div class="c-pause"><div class="c-card"><h2>PAUSED</h2><p class="c-pnote"></p><button class="primary c-resume">Resume</button><button class="c-voice">Radio voices: ON</button><button class="c-bcam">Partner bodycam: OFF</button><button class="c-cant">Pistol hold: CENTRE</button><button class="ghost c-exit">Exit to main menu</button></div></div>
      <div class="c-debrief"></div>`;
    document.body.appendChild(root);
    document.body.classList.add('cell-mode', 'cell-' + game.role);
    const $ = (s) => root.querySelector(s);
    this.el = {
      overlay: $('#cell-overlay'), objN: $('.c-obj-n'), objT: $('.c-obj-t'), objH: $('.c-obj-h'), objA: $('.c-obj-a'), alS: $('.c-al-s'), alBar: $('.c-alarm em'), alarm: $('.c-alarm'),
      partner: $('.c-partner'), feed: $('.c-feed'), comms: $('.c-comms'), hp: $('.c-hp em'), camo: $('.c-camo em'), camoBox: $('.c-camo'), chips: $('.c-chips'),
      amN: $('.c-am-n'), amR: $('.c-am-r'), amW: $('.c-am-w'), amS: $('.c-am-s'), prompt: $('.c-prompt'), promptT: $('.c-prompt span'), promptB: $('.c-prompt em'),
      flash: $('.c-flash'), keys: $('.c-keys'), dmg: $('.c-dmg'), pause: $('.c-pause'), debrief: $('.c-debrief'),
      hunt: $('.c-hunt'), sync: $('.c-sync'), pip: $('.c-pip'),
      vis: $('.c-vis em'), visL: $('.c-vis b'), visBox: $('.c-vis'), kit: $('.c-kit'), req: $('.c-req'), reqT: $('.c-req-t'), intro: $('.c-intro'),
    };
    $('.c-req-y').addEventListener('pointerdown', (e) => { e.preventDefault(); game._answerTop(true); });
    $('.c-req-n').addEventListener('pointerdown', (e) => { e.preventDefault(); game._answerTop(false); });
    game.overlay = this.el.overlay;
    this.ctx = this.el.overlay.getContext('2d');
    this.el.camoBox.style.display = game.role === 'shooter' ? '' : 'none';
    const K = (k, l) => `<b>${k}</b> ${l}`;
    const shooterKeys = [K('Esc', 'pause'), K('4–9', 'request at crosshair'), K('F', 'camo'), K('H', 'deadeye'), K('X', 'sticky grenade'), K('SHIFT', 'breath (scoped)'), K('Q', 'ping / mark (hold: wheel)'), K('T', 'sync'), K('E', 'use'), K('V', 'knife'), K('1/2/3', 'rifle/sidearm/knife'), K('B', 'suppressor'), K('N', 'NV'), K('TAB', game.operative ? 'tablet (hold: quickhack)' : 'map')];
    const spotterKeys = [K('Esc', 'pause'), K('X', 'binoculars'), K('1–0', 'command at crosshair'), K('H', 'hold: hack phone'), K('TAB', 'tablet (hold: hack)'), K('F', 'recon drone'), K('Q', 'ping / mark (hold: wheel)'), K('T', 'sync'), K('E', 'use'), K('V', 'knife'), K('Y/U', 'approve/deny'), K('B', 'suppressor'), K('`', 'laser'), K('N', 'NV')];
    shooterKeys.push(K('L', 'light'), K('\u21B5', 'chat'));
    spotterKeys.push(K('L', 'light'), K('I', 'ISR'));
    spotterKeys.push(K('\u21B5', 'chat'));
    if (game.net) { shooterKeys.push(K('M', 'mic'), K('K', 'talk')); spotterKeys.push(K('M', 'mic'), K('K', 'talk')); }
    this.el.keys.innerHTML = (game.operative && game.role === 'shooter' ? [...shooterKeys, K('Y', 'recon drone')] : game.role === 'shooter' ? shooterKeys : spotterKeys).join('');
    this.objective(0, OBJECTIVES[0], false);
    // Spotter (and lone operative): picture-in-picture squares for the console and the drone.
    const pipOn = game.role === 'spotter' || game.operative;
    this.el.pip.style.display = pipOn ? '' : 'none';
    // Tap (or click) any on-screen view to collapse it to its title strip; tap again to bring it
    // back: the objective board, the console / ISR squares and the bodycams. Caught before the
    // touch layer so the tap never aims or fires.
    const views = () => [root.querySelector('.c-obj'), ...root.querySelectorAll('.c-pip .c-sq'), ...document.querySelectorAll('#cell-bodycams .bc')];
    const viewAt = (x, y) => views().find((v) => {
      if (!v || !v.getClientRects().length || getComputedStyle(v).display === 'none') return false;
      const r = v.getBoundingClientRect();
      return r.width > 0 && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
    });
    const tapView = (e) => {
      if (game.paused || game.ended || document.pointerLockElement) return;
      const pt = e.touches ? e.changedTouches[0] : e;
      const v = pt && viewAt(pt.clientX, pt.clientY);
      if (!v) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.type === 'touchstart' || e.type === 'mousedown') { v.classList.toggle('min'); game.audio.click && game.audio.click(); }
    };
    addEventListener('touchstart', tapView, { capture: true, passive: false });
    addEventListener('mousedown', tapView, { capture: true });
    this.sqOps = root.querySelector('[data-sq="ops"] canvas');
    this.sqIsr = root.querySelector('[data-sq="isr"] canvas');
    // The shooter's HUD stays minimal: hints fade once you've read them.
    if (game.role === 'shooter' && !game.operative) root.classList.add('minimal');
    setTimeout(() => this.el.keys.classList.add('gone'), 25000);
    this.hits = [];
    // Pause: losing pointer lock (Esc) opens it, except while the tablet has the mouse.
    document.addEventListener('pointerlockchange', () => {
      if (game.input.touch && !game.input.mouseMode) return;
      const locked = document.pointerLockElement === game.renderer.domElement;
      this.setPause(!locked && !game.tablet.visible && !game.ended && !game.tablet.justClosed && !(game.chat && game.chat.isOpen) && !(game.cine && game.cine.active) && !(this._chatClosed && performance.now() - this._chatClosed < 500));
    });
    $('.c-resume').onclick = () => { this.setPause(false); game.input.requestLock(); };
    $('.c-exit').onclick = () => game.exit();
    const bcBtn = $('.c-bcam');
    const bcLabel = () => { bcBtn.textContent = `Partner bodycam: ${game.bodycamOn ? 'ON' : 'OFF'}`; };
    try { game.bodycamOn = localStorage.getItem('draxxed.cellBodycam') === 'on'; } catch {}
    bcLabel();
    bcBtn.onclick = () => { game.bodycamOn = !game.bodycamOn; try { localStorage.setItem('draxxed.cellBodycam', game.bodycamOn ? 'on' : 'off'); } catch {} bcLabel(); };
    const voiceBtn = $('.c-voice');
    const voiceLabel = () => { voiceBtn.textContent = `Radio voices: ${game.radio.voiceOn ? 'ON' : 'OFF (text only)'}`; };
    voiceLabel();
    voiceBtn.onclick = () => { game.radio.voiceOn = !game.radio.voiceOn; setVoiceSetting(game.radio.voiceOn); voiceLabel(); };
    // Pistol hold (P-9 and M50): canted in the centre of the screen (the default) or the plain
    // hold on the right. Saved with the other settings.
    const cantBtn = $('.c-cant');
    const cantLabel = () => { cantBtn.textContent = `Pistol hold: ${game.settings.pistolCant !== false ? 'CENTRE (canted)' : 'RIGHT SIDE'}`; };
    cantLabel();
    cantBtn.onclick = () => {
      game.settings.pistolCant = game.settings.pistolCant === false;
      try { localStorage.setItem('draxxed.pistolCant', JSON.stringify(game.settings.pistolCant)); } catch {}
      const box = document.getElementById('in-cant');
      if (box) box.checked = game.settings.pistolCant;
      cantLabel();
    };
    $('.c-pnote').textContent = game.solo ? 'Solo: the mission is paused.' : 'Co-op: the mission keeps running while you are in this menu \u2014 find cover first.';
    this._touch();
  }

  // Extra touch buttons for this mode, added to the existing touch layer.
  _touch() {
    const g = this.g;
    const t = document.getElementById('touch');
    if (!t) return;
    const bar = document.createElement('div');
    bar.className = 'cell-tbar';
    // SWEEP ('z') shows only in the ISR view; elsewhere the press-and-hold wheel has it.
    const extra = (g.role === 'spotter' || g.operative) ? [['cell-zout', 'ZOOM \u2212', 'z'], ['cell-zin', 'ZOOM +', 'z'], ['cell-sweep', 'SWEEP', 'z']] : [];
    const common = [...extra, ['cell-light', 'LIGHT'], ['cell-drop', 'DROP'], ['cell-ping', 'PING \u25CE'], ['cell-knife', 'KNIFE'], ['cell-sup', 'SUPP'], ['cell-laser', 'LASER'], ['cell-nv', 'NV'], ['cell-chat', 'CHAT'], ...(g.net ? [['cell-mic', 'MIC'], ['cell-talk', 'TALK']] : [])];
    const pills = g.operative && g.role === 'shooter'
      ? [['cell-tab', 'TABLET'], ['cell-menu', 'COMMANDS'], ['cell-recall', 'RECALL'], ...common]
      : g.role === 'shooter'
        ? [['cell-tab', 'TABLET'], ['cell-menu', 'COMMANDS'], ['cell-breath', 'BREATH'], ...common]
        : [['cell-tab', 'TABLET'], ['cell-menu', 'COMMANDS'], ['cell-recall', 'RECALL'], ['cell-yes', 'SEND \u2713'], ['cell-no', 'DENY \u2715'], ...common];
    const KEEP = new Set(['cell-tab', 'cell-menu', 'cell-drop', 'cell-yes', 'cell-no', 'cell-recall', 'cell-talk']); // still shown on phones
    bar.innerHTML = pills.map(([a, l, c]) => `<div class="pill${c ? ' ' + c : ''}${KEEP.has(a) ? ' keep' : ''}" data-act="${a}">${l}</div>`).join('') + '<div class="pill keep" id="cell-tpause">❚❚</div>';
    t.appendChild(bar);
    // Abilities: their own round buttons on the left, each with a recharge bar along the bottom.
    const AB = g.operative && g.role === 'shooter'
      ? [['cell-rounds', 'STD', 'rounds'], ['cell-ability', 'CAMO', 'camo'], ['cell-deadeye', 'DEADEYE', 'deadeye'], ['cell-lure', 'STICKY', 'lure'], ['cell-sync', 'SYNC', 'sync'], ['cell-quad', 'DRONE', 'drone'], ['cell-isr', 'ISR', 'isr'], ['cell-hack', 'HACK', 'hack']]
      : g.role === 'shooter'
        ? [['cell-rounds', 'STD', 'rounds'], ['cell-ability', 'CAMO', 'camo'], ['cell-deadeye', 'DEADEYE', 'deadeye'], ['cell-lure', 'STICKY', 'lure'], ['cell-sync', 'SYNC', 'sync']]
        : [['cell-ability', 'DRONE', 'drone'], ['cell-sync', 'SYNC', 'sync'], ['cell-isr', 'ISR', 'isr'], ['cell-hack', '📱 HACK', 'hack'], ...(g._hasBino && !g._hasBino() ? [] : [['cell-swarm', 'SWARM', 'swarm'], ['cell-lase', 'LASE', 'lase']])];
    const ab = document.createElement('div');
    ab.className = 'cell-abil';
    ab.innerHTML = AB.map(([a, l, k]) => `<div class="ab" data-act="${a}" data-k="${k}"><span>${l}</span><em></em><i><b></b></i></div>`).join('');
    t.appendChild(ab);
    this.abEl = ab;
    // USE: a round button that pops up beside FIRE when there's something to interact with.
    const use = document.createElement('div');
    use.className = 'tb sm cell-usebtn';
    use.dataset.act = 'cell-use';
    use.innerHTML = '<span>USE</span>';
    use.style.display = 'none';
    t.appendChild(use);
    this.useBtn = use;
    // CALL FOR HELP: big, mid-screen, only while you're down.
    const help = document.createElement('div');
    help.className = 'pill cell-helpbtn';
    help.dataset.act = 'cell-help';
    help.textContent = 'CALL FOR HELP \u271A';
    help.style.display = 'none';
    t.appendChild(help);
    this.helpBtn = help;
    // IFAK: tap to patch yourself up to full (bottom left, over the IFAK chip).
    const ifk = document.createElement('div');
    ifk.className = 'pill cell-ifakbtn';
    ifk.dataset.act = 'cell-ifak';
    ifk.textContent = '\u271A IFAK';
    ifk.style.display = 'none';
    t.appendChild(ifk);
    this.ifakBtn = ifk;
    this.abBtns = [...ab.children].map((el) => ({ el, k: el.dataset.k, bar: el.querySelector('b'), cnt: el.querySelector('em'), last: '' }));
    bar.querySelector('#cell-tpause').addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); this.setPause(true); }, { passive: false });
    // PING: hold and drag your thumb to pick from the wheel.
    const ping = bar.querySelector('[data-act="cell-ping"]');
    let pid = null, x0 = 0, y0 = 0;
    ping.addEventListener('touchstart', (e) => { const t = e.changedTouches[0]; pid = t.identifier; x0 = t.clientX; y0 = t.clientY; });
    addEventListener('touchmove', (e) => {
      if (pid === null || !g.wheel.open) return;
      for (const t of e.changedTouches) if (t.identifier === pid) { g.wheel.dx = (t.clientX - x0) * 1.6; g.wheel.dy = (t.clientY - y0) * 1.6; g.wheel._pick(); }
    }, { passive: true });
    addEventListener('touchend', (e) => { for (const t of e.changedTouches) if (t.identifier === pid) pid = null; });
    this.tbar = bar;
  }

  // Ability buttons (touch): fill = how charged / ready it is; 'cd' greys it out, 'on' = active.
  _abilTick(dt) {
    const g = this.g, K = g.kit, A = g.ab, C = g.cloak;
    const binoUp = !!(g.bino && g.bino.up);
    for (const b of this.abBtns) {
      // The nano swarm and the laser only exist through the raised binoculars.
      if (b.k === 'swarm' || b.k === 'lase') { const show = binoUp; if ((b.el.style.visibility !== 'hidden') !== show) b.el.style.visibility = show ? '' : 'hidden'; }
      let f = 1, st = '', n = '';
      if (b.k === 'camo') { f = C.bat / 100; st = C.on ? 'on' : C.bat < 10 || C.lockT > 0 ? 'cd' : ''; }
      else if (b.k === 'deadeye' && K) { if (K.deadeye > 0) { f = K.deadeye / KIT.deadeye.dur; st = 'on'; } else if (K.deadeyeCd > 0) { f = 1 - K.deadeyeCd / KIT.deadeye.cd; st = 'cd'; n = Math.ceil(K.deadeyeCd) + 's'; } }
      else if (b.k === 'lure' && K) { const mx = Math.max(K.lures, g.loadout.shooter.perk === 'lures' ? 5 : KIT.lure.charges); f = K.lures / mx; st = K.lures ? '' : 'cd'; n = '\u00D7' + K.lures; }
      else if (b.k === 'exec' && K) { f = K.execs / KIT.exec.max; st = K.execs ? 'on' : 'cd'; n = '\u00D7' + K.execs; }
      else if (b.k === 'dart' && A) { f = A.darts / 3; st = A.darts ? '' : 'cd'; n = '\u00D7' + A.darts; }
      else if (b.k === 'drone') {
        const out = g._quadOut && g._quadOut();
        if (g.quadCd > 0) { this._qcdMax = Math.max(this._qcdMax || 0, g.quadCd); f = 1 - g.quadCd / this._qcdMax; st = 'cd'; n = Math.ceil(g.quadCd) + 's'; }
        else { this._qcdMax = 0; f = (out && g.quad ? g.quad.bat : g.quadBat ?? 300) / 300; st = out ? 'on' : ''; }
      } else if (b.k === 'isr') { const cd = g.isr.sweepCd || 0; f = 1 - cd / 25; st = g.isr.active ? 'on' : ''; n = cd > 0 ? Math.ceil(cd) + 's' : ''; }
      else if (b.k === 'swarm' && g.nano) { const N = g.nano; f = N.ch < 3 ? (N.ch + N.rl / 15) / 3 : 1; st = N.marks.length ? 'on' : N.ch ? '' : 'cd'; n = '\u00D7' + N.ch; }
      else if (b.k === 'lase') { const L = g.bino && g.bino.up && g.bino.lrf; st = L && L.e ? 'on' : g.bino && g.bino.up ? '' : 'cd'; n = L ? Math.round(L.d) + 'm' : ''; }
      else if (b.k === 'rounds') {
        const cur = g._roundsCur ? g._roundsCur() : 'std', cnt = g._roundsCount ? g._roundsCount(cur) : 0;
        const lbl = ROUND_SHORT[cur] || 'STD';
        const sp = b.el.querySelector('span'); if (sp.textContent !== lbl) sp.textContent = lbl;
        n = '\u00D7' + cnt; st = g.xr && g.xr.swap ? 'cd' : ''; f = g.xr && g.xr.swap ? Math.min(1, 1 - (g.player.reloadT || 0) / (XR.swap || 2.6)) : 1;
        b.el.classList.toggle('mag', true);
      }
      else if (b.k === 'sync') { st = (g.sentinel && g.sentinel.guards.some((q) => q.sync && q.state !== 'dead')) ? 'on' : ''; }
      else if (b.k === 'hack') { f = g.ops ? g.ops.bw / 100 : 0; st = g.qh && g.qh.on ? 'on' : ''; }
      f = Math.max(0, Math.min(1, f));
      const key = st + '|' + n + '|' + Math.round(f * 50);
      if (key === b.last) continue;
      b.last = key;
      b.el.classList.toggle('on', st === 'on');
      b.el.classList.toggle('cd', st === 'cd');
      b.el.classList.toggle('full', f >= 0.999);
      b.bar.style.width = `${Math.round(f * 100)}%`;
      b.cnt.textContent = n;
    }
    this._abPlaceT = (this._abPlaceT || 0) - dt;
    if (this._abPlaceT <= 0) {
      this._abPlaceT = 1;
      // Phones (or any small touch screen): the middle strip folds into the press-and-hold wheel.
      document.body.classList.toggle('cell-compact', innerWidth < 1000 || innerHeight < 560);
      this._abilPlace();
    }
  }

  // Scatter the ability buttons round the left thumb, like PRONE and CROUCH: candidate spots on
  // arcs above and around the move stick (nearest first), each taken only if it clears every
  // other control and the buttons already placed.
  _abilPlace() {
    const el = this.abEl;
    if (!el || !el.getClientRects().length) return;
    const VV = window.visualViewport, W = (VV && VV.width) || innerWidth, H = Math.min((VV && VV.height) || innerHeight, document.documentElement.clientHeight || innerHeight), small = Math.min(W, H) < 500, size = small ? 44 : 50;
    const avoid = [...document.querySelectorAll('#touch .tb, #touch .cell-tbar .pill, #touch .stick, #cell-hud .c-obj, #cell-hud .c-vis, #cell-hud .c-vitals, #cell-bodycams')]
      .filter((e) => e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden' && !e.classList.contains('cell-usebtn'))
      .map((e) => e.getBoundingClientRect()).filter((r) => r.width > 0 && r.height > 0);
    const st = document.querySelector('#touch .stick'), sr = st && st.getBoundingClientRect();
    const cx = sr && sr.width ? sr.left + sr.width / 2 : 120, cy = sr && sr.height ? sr.top + sr.height / 2 : H - 120;
    const R = sr && sr.width ? sr.width / 2 : 70;
    const obj = document.querySelector('#cell-hud .c-obj');
    const top0 = obj && obj.getClientRects().length ? obj.getBoundingClientRect().bottom + 6 : 60;
    const placedRects = [];
    const blockers = [...avoid, ...placedRects];
    const n = this.abBtns.length, gap = 10;
    const okSpot = (x, y, others) => x - size / 2 >= 6 && x + size / 2 <= W * 0.5 && y - size / 2 >= top0 && y + size / 2 <= H - 16
      && !blockers.some((r) => x + size / 2 > r.left - 6 && x - size / 2 < r.right + 6 && y + size / 2 > r.top - 6 && y - size / 2 < r.bottom + 6)
      && !others.some(([px, py]) => Math.hypot(px - x, py - y) < size + gap);
    // A tidy cluster just above PRONE, CROUCH and the left FIRE button: rows of evenly spaced
    // buttons centred over them, stepping up a row (or sliding along) until nothing overlaps.
    const anchors = ['#touch .prone', '#touch .crouch', '#touch .fire-l'].map((q) => document.querySelector(q)).filter((e) => e && e.getClientRects().length).map((e) => e.getBoundingClientRect());
    const aL = anchors.length ? Math.min(...anchors.map((r) => r.left)) : 12, aR = anchors.length ? Math.max(...anchors.map((r) => r.right)) : W * 0.35;
    const aTop = anchors.length ? Math.min(...anchors.map((r) => r.top)) : H * 0.6;
    const fit = Math.max(1, Math.min(n, Math.floor((aR - aL + gap) / (size + gap)) || 1));
    let layout = null;
    // Phones: a triangle (apex up) centred between CROUCH and the left FIRE button, nudged until
    // it clears everything.
    if (small) {
      const cr = document.querySelector('#touch .crouch'), fl = document.querySelector('#touch .fire-l');
      const a = cr && cr.getBoundingClientRect(), b = fl && fl.getBoundingClientRect();
      if (a && b && a.width && b.width) {
        const mx = (a.left + a.right + b.left + b.right) / 4, my = (a.top + a.bottom + b.top + b.bottom) / 4;
        // The binocular-only buttons (last in order) sit beside the triangle, not in it.
        const core = this.abBtns.filter((q) => q.k !== 'swarm' && q.k !== 'lase').length;
        const ROWS = { 1: [1], 2: [2], 3: [1, 2], 4: [1, 3], 5: [2, 3], 6: [1, 2, 3], 7: [1, 2, 4], 8: [2, 3, 3] }[core] || [Math.ceil(core / 2), Math.floor(core / 2)];
        const step = size + gap, hTot = (ROWS.length - 1) * step;
        const tri = (ox, oy) => {
          const pts = [];
          ROWS.forEach((cnt, r) => { for (let c = 0; c < cnt; c++) pts.push([ox + (c - (cnt - 1) / 2) * step, oy - hTot / 2 + r * step]); });
          return pts;
        };
        const offs = [];
        for (let d = 0; d <= 240; d += 4) for (const [ux, uy] of [[0, -1], [0, 1], [1, 0], [-1, 0], [1, -1], [-1, -1], [1, 1], [-1, 1]]) offs.push([ux * d, uy * d]);
        for (const [ox, oy] of offs) {
          const pts = tri(mx + ox, my + oy), ok = [];
          for (const p of pts) { if (!okSpot(p[0], p[1], ok)) break; ok.push(p); }
          if (ok.length === core) {
            // The rest: nearest clear spots next to the triangle.
            const cx0 = mx + ox, cy0 = my + oy, cand = [];
            for (let gy = -6; gy <= 6; gy++) for (let gx = -6; gx <= 6; gx++) cand.push([cx0 + gx * step * 0.5, cy0 + gy * step * 0.5]);
            cand.sort((p, q) => Math.hypot(p[0] - cx0, p[1] - cy0) - Math.hypot(q[0] - cx0, q[1] - cy0));
            for (let k = core; k < n; k++) { const sp = cand.find(([x, y]) => okSpot(x, y, ok)); if (!sp) break; ok.push(sp); }
            if (ok.length === n) { layout = ok; break; }
          }
        }
      }
    }
    // Nearest first: just above them, then nudged down into the gaps between them, rows of
    // different widths, sliding sideways a little.
    const lifts = [];
    for (let d = 0; d < H; d += 6) { lifts.push(d); if (d) lifts.push(-d); }
    for (const lift of layout ? [] : lifts) for (const perRow of [...new Set([fit, n, 2, 3])]) {
      if (layout) break;
      for (const shift of [0, 20, -20, 40, -40, 60, -60, 90, -90, 120]) {
        const pts = [];
        for (let k = 0; k < n; k++) {
          const row = Math.floor(k / perRow), inRow = Math.min(perRow, n - row * perRow), col = k % perRow;
          const rowW = inRow * size + (inRow - 1) * gap, x0 = (aL + aR) / 2 - rowW / 2 + shift;
          const p = [x0 + col * (size + gap) + size / 2, aTop - gap - size / 2 - lift - row * (size + gap)];
          if (!okSpot(p[0], p[1], pts)) break;
          pts.push(p);
        }
        if (pts.length === n) { layout = pts; break; }
      }
    }
    // Couldn't fit the cluster: the nearest clear spots, still kept apart.
    if (!layout) {
      // A grid aligned on the cluster point (above the anchors), filled nearest-first, so the
      // buttons still sit together in neat rows and columns.
      layout = [];
      const hx = (aL + aR) / 2, hy = aTop - gap - size / 2, step = size + gap, cand = [];
      for (let gy = -8; gy <= 8; gy++) for (let gx = -8; gx <= 8; gx++) cand.push([hx + gx * step, hy + gy * step]);
      for (let gy = -16; gy <= 16; gy++) for (let gx = -16; gx <= 16; gx++) cand.push([hx + gx * step / 2, hy + gy * step / 2]);
      cand.sort((p, q) => Math.hypot(p[0] - hx, (p[1] - hy) * 1.3) - Math.hypot(q[0] - hx, (q[1] - hy) * 1.3));
      for (let k = 0; k < n; k++) layout.push(cand.find(([x, y]) => okSpot(x, y, layout)) || [6 + size / 2 + k * (size + 8), top0 + size / 2]);
    }
    // Then the magazine strip, clear of the buttons too.
    const abRects = layout.map(([x, y]) => ({ left: x - size / 2, top: y - size / 2, right: x + size / 2, bottom: y + size / 2 }));
    // The magazine strip (sniper): a column (or a row) in the first clear spot on the left.
    const mags = document.getElementById('cell-mags');
    if (mags && mags.style.display !== 'none' && mags.children.length) {
      const n = mags.children.length, iw = 40, ih = 52, gap = 5;
      let done = false;
      for (const [col, maxX] of [[true, 0.42], [false, 0.42], [true, 0.62], [false, 0.62]]) {
        const mw = col ? iw : n * iw + (n - 1) * gap, mh = col ? n * ih + (n - 1) * gap : ih;
        for (let y = top0; y + mh < H - 16 && !done; y += 8) for (let x = 6; x + mw < W * maxX && !done; x += 8) {
          if (![...avoid, ...abRects].some((r) => x + mw > r.left - 6 && x < r.right + 6 && y + mh > r.top - 6 && y < r.bottom + 6)) {
            mags.classList.toggle('col', col); mags.style.left = `${x}px`; mags.style.top = `${y}px`;
            placedRects.push({ left: x, top: y, right: x + mw, bottom: y + mh }); done = true;
          }
        }
        if (done) break;
      }
      // Nowhere clear at all: keep it out of the way rather than overlapping buttons.
      mags.style.visibility = done ? '' : 'hidden';
    }
    el.style.setProperty('--ab', `${size}px`);
    this.abBtns.forEach((b, k) => { b.el.style.left = `${Math.round(layout[k][0] - size / 2)}px`; b.el.style.top = `${Math.round(layout[k][1] - size / 2)}px`; });
  }

  intro(M, who) {
    const el = this.el.intro;
    el.querySelector('h1').innerHTML = this.g.titleHTML;
    el.querySelector('.c-intro-l').textContent = M.line;
    el.querySelector('.c-intro-r').textContent = who;
    el.classList.add('on');
    setTimeout(() => el.classList.add('out'), 4200);
    setTimeout(() => el.classList.remove('on', 'out'), 6000);
  }

  setPause(on) {
    this.el.pause.classList.toggle('on', on);
    this.g.paused = on;
    // Lift the HUD (with this menu) above the touch controls, or taps never reach its buttons.
    document.body.classList.toggle('cell-modal', on || this.el.debrief.classList.contains('on'));
  }

  objToggle() {
    this.root.classList.toggle('obj-off');
  }
  objExpand() {
    this.objFull = !this.objFull;
    this.root.classList.toggle('obj-full', this.objFull);
    if (this.objFull) this.el.objH.classList.remove('gone');
    else this.el.objH.classList.add('gone');
  }

  objective(i, o, announce) {
    this.el.objN.textContent = `OBJECTIVE ${i + 1} / ${OBJECTIVES.length}`;
    this.el.objT.textContent = o.title;
    this.el.objH.textContent = o.hint;
    this.el.objH.classList.remove('gone');
    clearTimeout(this._hintT);
    this._hintT = setTimeout(() => { if (!this.objFull) this.el.objH.classList.add('gone'); }, 12000);
    if (announce) this.flash(o.title, 'cyan', 3);
  }

  comms(m, c, who) {
    const d = document.createElement('div');
    d.className = 'c-line c-' + (c && c[0] === '#' ? 'x' : c);
    if (c && c[0] === '#') d.style.color = c;
    d.innerHTML = (who ? `<b>${esc(who)}</b> ` : '') + esc(m);
    this.el.comms.appendChild(d);
    while (this.el.comms.children.length > 5) this.el.comms.firstChild.remove();
    // Lines fade out after a few seconds to keep the screen clean (the tablet keeps the full log).
    setTimeout(() => d.classList.add('old'), 5000);
    setTimeout(() => d.remove(), 6600);
  }

  feed(text, color) {
    const d = document.createElement('div');
    d.textContent = text;
    d.style.color = color;
    this.el.feed.appendChild(d);
    while (this.el.feed.children.length > 4) this.el.feed.firstChild.remove();
    setTimeout(() => d.remove(), 6000);
  }

  flash(text, c = 'dim', dur = 1.6) {
    const f = this.el.flash;
    f.textContent = text;
    f.className = 'c-flash on c-' + c;
    clearTimeout(this._fl);
    this._fl = setTimeout(() => (f.className = 'c-flash'), dur * 1000);
  }

  hitMarker(head) {
    this.hits.push({ t: 0, head });
  }

  damage(ang) {
    const d = document.createElement('i');
    d.style.transform = `rotate(${-ang * 180 / Math.PI + 180}deg)`;
    this.el.dmg.appendChild(d);
    setTimeout(() => d.remove(), 900);
  }

  debrief(win, info, st) {
    const g = this.g;
    const el = this.el.debrief;
    const mm = Math.floor(info.time / 60), ss = String(info.time % 60).padStart(2, '0');
    const RATING = { GHOST: 'Never seen. Nobody hurt.', SILENT: 'Takedowns only. No alarm.', LETHAL: 'Clean but bloody. No full alarm.', LOUD: 'They knew you were there.', BURNED: 'The cell was lost.' };
    el.innerHTML = `<div class="c-card"><div class="kick">${g.missionTitle} // DEBRIEF</div>
      <h2>${win ? 'INTEL SECURED' : 'MISSION FAILED'}</h2><div class="c-rate c-rate-${info.rating.toLowerCase()}">${info.rating}</div><p>${RATING[info.rating]}</p>
      <table><tr><td>Time</td><td>${mm}:${ss}</td></tr><tr><td>Kills / takedowns</td><td>${info.kills} / ${info.takedowns}</td></tr><tr><td>Drones down</td><td>${info.drones}</td></tr><tr><td>Times spotted</td><td>${info.spotted}</td></tr><tr><td>Peak alarm</td><td>${info.alarm} %</td></tr>
      <tr><td>Your shots / hits / heads</td><td>${st.shots} / ${st.hits} / ${st.heads}</td></tr><tr><td>Longest kill</td><td>${st.longest} m</td></tr></table>
      <button class="primary c-again">Back to menu</button></div>`;
    el.classList.add('on');
    document.body.classList.add('cell-modal');
    el.querySelector('.c-again').onclick = () => g.exit();
  }

  update(dt) {
    const g = this.g, P = g.player, ob = g.obj, S = g.sentinel;
    if (this.abBtns) this._abilTick(dt);
    const fl = g.kit && g.kit.deadeye > 0 && (g.kit.deMarks || []).length ? 'EXECUTE' : g._tdTarget ? 'TAKEDOWN' : g.bino && g.bino.up && g.role === 'spotter' ? 'SWARM' : 'FIRE';
    if (fl !== this._fireLbl) {
      this._fireLbl = fl;
      for (const b of document.querySelectorAll('#touch .tb.fire')) { const s = b.querySelector('span'); if (s) s.textContent = fl; b.classList.toggle('fire-alt', fl !== 'FIRE'); }
    }
    if (this.ifakBtn) {
      const n = (g.obj.ifak && g.obj.ifak[g.role]) || 0, on = n > 0 && !g.downed && !g.kia;
      if ((this.ifakBtn.style.display !== 'none') !== on) this.ifakBtn.style.display = on ? '' : 'none';
      const lbl = `\u271A IFAK${n > 1 ? ' \u00D7' + n : ''}`;
      if (this.ifakBtn.textContent !== lbl) this.ifakBtn.textContent = lbl;
      this.ifakBtn.classList.toggle('full', g.hp >= g.maxHp);
    }
    if (this.helpBtn) {
      const on = !!g.downed && !g.kia;
      if ((this.helpBtn.style.display !== 'none') !== on) this.helpBtn.style.display = on ? '' : 'none';
      if (on) { const lbl = (g._helpCd || 0) > 0 ? `HELP CALLED \u00B7 ${Math.ceil(g._helpCd)} s` : 'CALL FOR HELP \u271A'; if (this.helpBtn.textContent !== lbl) this.helpBtn.textContent = lbl; }
    }
    if (this.useBtn) {
      const pr = g.prompts && g.prompts[g.role];
      const on = !!(pr && pr.label && !/^DOWNED/.test(pr.label)) && !g.tablet.visible && !g.isr.active;
      if ((this.useBtn.style.display !== 'none') !== on) {
        this.useBtn.style.display = on ? '' : 'none';
        const f = document.querySelector('#touch .fire-r');
        if (on && f) {
          // A free spot round FIRE (left, up-left, up...), clear of the other buttons.
          const r = f.getBoundingClientRect(), fx = r.left + r.width / 2, fy = r.top + r.height / 2, R = r.width / 2 + 36, s = 50;
          const others = [...document.querySelectorAll('#touch .tb, #touch .cell-tbar .pill, #cell-hud .c-ammo, #touch .cell-abil .ab, #cell-mags')].filter((e) => e !== this.useBtn && e.getClientRects().length && getComputedStyle(e).display !== 'none').map((e) => e.getBoundingClientRect());
          // Try rings round FIRE (nearest first), every 15°, and take the first clear spot.
          let best = null;
          const ov = (x, y) => others.some((o) => x + s / 2 > o.left - 4 && x - s / 2 < o.right + 4 && y + s / 2 > o.top - 4 && y - s / 2 < o.bottom + 4);
          for (const rr of [R, R + 28, R + 56, R + 84]) {
            for (const a of [180, 195, 165, 210, 150, 225, 135, 240, 120, 255, 105, 270, 90]) {
              const x = fx + Math.cos((a * Math.PI) / 180) * rr, y = fy - Math.sin((a * Math.PI) / 180) * rr;
              if (x - s / 2 < 4 || x + s / 2 > innerWidth - 4 || y - s / 2 < 4 || y + s / 2 > innerHeight - 4) continue;
              if (!ov(x, y)) { best = [x, y]; break; }
            }
            if (best) break;
          }
          if (!best) best = [fx - R, fy - R];
          this.useBtn.style.left = `${Math.round(best[0] - s / 2)}px`;
          this.useBtn.style.top = `${Math.round(best[1] - s / 2)}px`;
        }
      }
    }
    // Context buttons only while they do something: DROP (carrying the drive), SEND / DENY (a
    // request waiting), RECALL (drone out).
    if (this.tbar) {
      const ctx = { 'cell-drop': g.obj.drive === g.role, 'cell-yes': g.requests.some((r) => r.st === 'pending'), 'cell-no': g.requests.some((r) => r.st === 'pending'), 'cell-recall': !!(g._quadOut && g._quadOut()) };
      for (const [a, on] of Object.entries(ctx)) {
        const el = this._ctxEl?.[a] ?? ((this._ctxEl = this._ctxEl || {})[a] = this.tbar.querySelector(`[data-act="${a}"]`) || 0);
        if (el && (el.style.display === 'none') === on) el.style.display = on ? '' : 'none';
      }
    }
    // Touch swap button names the weapon in your hands (KR-50, K9, M50, P-9, KNIFE, BINOS);
    // tap for the next one, hold for the wheel.
    if (!this.elSwap) this.elSwap = document.getElementById('pill-swap') || 0;
    if (this.elSwap) {
      const cur = g._wpnCur ? g._wpnCur() : 'p', it = g._wpnList ? g._wpnList().find((o) => o.k === cur) : null;
      const lbl = it ? (it.label === 'BINOCULARS' ? 'BINOS' : it.label) : 'SWAP';
      if (this.elSwap.textContent !== lbl) this.elSwap.textContent = lbl;
    }
    // Objective & alarm.
    const lab = S.alarmLabel;
    if (lab !== this._al) { this._al = lab; this.el.alS.textContent = lab; this.el.alarm.dataset.s = lab.toLowerCase(); }
    this.el.alBar.style.width = `${Math.round(S.alarm * 100)}%`;
    if (ob.step !== this._step) { this._step = ob.step; this.objective(ob.step, OBJECTIVES[ob.step], false); }
    // The approach: pickets left in the draw, while you're still south of the crest.
    {
      const left = S.guards.filter((q) => q.picket && q.state !== 'dead' && !q.incap).length;
      const show = P.pos.z > SPOTS.crest && left > 0 && ob.step === 0;
      const txt = show ? `APPROACH \u00B7 ${left} PICKET${left > 1 ? 'S' : ''} IN THE DRAW \u2014 DROP THEM QUIET` : '';
      if (txt !== this._apTxt) { this._apTxt = txt; this.el.objA.textContent = txt; this.el.objA.style.display = txt ? '' : 'none'; }
      if (this._apLeft > 0 && left === 0 && !this._apClear) { this._apClear = true; g._radio(g.aiPartner ? 'partner' : 'me', "Draw's clear."); }
      this._apLeft = left;
    }
    // Partner card.
    const Q = g.partner;
    const qd = Q.seen ? Math.round(Q.pos.distanceTo(P.pos)) : 0;
    const qs = Q.kia ? 'KIA' : Q.downed ? 'DOWN' : !Q.seen ? 'NO LINK' : Q.ai ? (g.aiShoot && g.aiShoot.moveT > 0 ? 'RELOCATING' : 'AI') : Q.tablet ? 'ON CONSOLE' : Q.quad ? 'FLYING DRONE' : Q.cloak ? 'CLOAKED' : 'OK';
    const ph = `<b style="color:${ROLES[Q.role].color}">${esc(Q.name)}</b> <span>${ROLES[Q.role].name}</span> <em>${qs}</em> <span>${qd} m</span>`;
    if (ph !== this._ph) { this._ph = ph; this.el.partner.innerHTML = ph; }
    // Vitals & chips.
    this.el.hp.style.width = `${Math.round((g.hp / g.maxHp) * 100)}%`;
    this.el.hp.parentNode.parentNode.classList.toggle('low', g.hp < g.maxHp * 0.3);
    this.el.camo.style.width = `${Math.round(g.cloak.bat)}%`;
    this.el.camoBox.classList.toggle('on', g.cloak.on);
    const chips = [];
    if (g.nv) chips.push('NV');
    if (g.cloak.on) chips.push('CAMO');
    if (ob.badge === g.role) chips.push('BADGE');
    if (ob.drive === g.role) chips.push('DRIVE');
    if (ob.ifak && ob.ifak[g.role] > 0 && !g.input.touch) chips.push(ob.ifak[g.role] > 1 ? `IFAK \u00D7${ob.ifak[g.role]} (G)` : 'IFAK (G)');
    if (g.role === 'spotter' && g.ops) chips.push(`BW ${Math.round(g.ops.bw)}`);
    if (g.role === 'spotter') chips.push(g._quadOut() ? `DRONE ${g.quad.parked ? 'PARKED ' : ''}${Math.round((g.quad.bat / QUAD_BAT) * 100)}%` : g.quadCd > 0 ? `DRONE ${Math.ceil(g.quadCd)}s` : 'DRONE READY');
    const ch = chips.map((c) => `<i>${c}</i>`).join('');
    if (ch !== this._ch) { this._ch = ch; this.el.chips.innerHTML = ch; }
    // Ammo.
    const w = P.w;
    this.el.amN.textContent = w.mag + w.chamber;
    this.el.amR.textContent = '/ ' + w.reserve;
    this.el.amW.textContent = P.def.name + (P.def.slot === 'rifle' ? ' · SUPPRESSED' : '');
    const sec = P.def.slot === 'pistol';
    this.el.amS.textContent = sec ? `${w.mode ? w.mode.toUpperCase() + ' (B) \u00B7 ' : ''}${w.sup ? 'SUPPRESSED' : 'UNSUPPRESSED \u2014 LOUD'}${w.mode ? ' (hold B)' : ' (B)'}` : P.scoped ? `${P.zoom}\u00D7 \u00B7 ${this.g.scopeNV === false ? 'PLAIN' : 'NIGHT VISION'}${w.ammo && w.ammo !== 'std' ? ' \u00B7 ' + AMMO_NAME[w.ammo] : ''}` : w.ammo && w.ammo !== 'std' ? `${AMMO_NAME[w.ammo]} ROUNDS (Z: rounds menu)` : '';
    this.el.amS.classList.toggle('loud', sec && !w.sup);
    // Prompt.
    let pr = g.prompts[g.role];
    if (g.downed && !g.kia) pr = { label: `BLEEDING OUT ${Math.ceil(g.bleed)} s — ${g.solo ? 'medevac drone is your only way up' : (g.obj.ifak && g.obj.ifak[g.partnerRole] > 0 ? g.partnerName + ' can patch you up with an IFAK' : g.partnerName + ' is out of IFAKs \u2014 medevac only')} \u00B7 V / HELP: call for pickup`, p: g.bleed / BLEED };
    if (g.kia) pr = { label: `KIA — watching ${g.partnerName}`, p: 0 };
    this.el.prompt.classList.toggle('on', !!pr && !g.tablet.visible);
    if (pr) { this.el.promptT.textContent = pr.label; this.el.promptB.style.width = `${Math.round((pr.p || 0) * 100)}%`; this.el.prompt.classList.toggle('bar', pr.p > 0); }
    this.root.classList.toggle('tablet', g.tablet.visible);
    this.root.classList.toggle('isr', g.isr.active);
    // Detection: DETECTED / HUNTED (break line of sight) / contact broken.
    const H = g._huntInfo(g.role);
    const hs = H ? H.state : 'hidden';
    if (hs !== this._hs) {
      // Overwatch only calls these now and then (the HUD always shows them).
      const now = performance.now(), say = (k) => { if (now - (this['_isr' + k] || -1e9) > 60000 && Math.random() < 0.5) { this['_isr' + k] = now; return true; } return false; };
      if (this._hs === 'hunted' && hs === 'hidden') { this.flash('CONTACT BROKEN', 'cyan', 2); if (say('Clear')) g._voice('isr', 'You\u2019re clear.'); }
      if (hs === 'detected' && this._hs !== 'detected' && say('Spot')) g._voice('isr', 'You\u2019re spotted. Break contact.');
      this._hs = hs;
    }
    this.el.hunt.className = 'c-hunt ' + hs;
    this.el.hunt.textContent = hs === 'detected' ? 'DETECTED' : hs === 'hunted' ? `HUNTED \u2014 break line of sight \u00B7 ${Math.max(0, 25 - Math.round(H.since || 0))} s` : '';
    // SYNC light: one dot per rifle; green when both are on marked heads.
    const sm = g.syncMarks || 0;
    this.el.sync.style.display = sm && !g.ended ? '' : 'none';
    if (sm) {
      this.el.sync.classList.toggle('go', g.syncReady);
      this.el.sync.querySelector('.a').className = 'a' + (g.syncAim ? ' on' : '');
      this.el.sync.querySelector('.b').className = 'b' + (g.syncPartner ? ' on' : '');
      this.el.sync.querySelector('b').textContent = g.syncReady ? 'SYNC \u2014 FIRE' : g.operative ? 'SYNC \u2014 needs a second rifle' : `SYNC \u00B7 ${sm} MARKED`;
    }
    // PiP squares (~4 Hz).
    if (this.el.pip.style.display !== 'none') {
      this._pipT = (this._pipT || 0) - dt;
      if (this._pipT <= 0) { this._pipT = 0.25; g.tablet.drawMini(this.sqOps); g._pipIsr = true; }
    }
    // Exposure meter (how visible you are right now) + the most-aware enemy.
    const v = g.vVis;
    this.el.vis.style.width = `${Math.round(v * 100)}%`;
    const vlab = v < 0.2 ? 'HIDDEN' : v < 0.45 ? 'LOW' : v < 0.75 ? 'VISIBLE' : 'EXPOSED';
    if (vlab !== this._vl) { this._vl = vlab; this.el.visL.textContent = vlab; this.el.visBox.dataset.l = vlab.toLowerCase(); }
    // Ability chips.
    if (g.role === 'shooter') {
      const K = g.kit;
      const kh = `<i class="${K.deadeye > 0 ? 'on' : K.deadeyeCd > 0 ? 'cd' : ''}">H DEADEYE ${K.deadeye > 0 ? Math.ceil(K.deadeye) + 's' : K.deadeyeCd > 0 ? Math.ceil(K.deadeyeCd) + 's' : 'READY'}</i><i class="${K.lures ? '' : 'cd'}">X STICKY \u00D7${K.lures}</i>`;
      if (kh !== this._kh) { this._kh = kh; this.el.kit.innerHTML = kh; }
    }
    // Incoming request / call card.
    const rq = g.requests.find((r) => r.st === 'pending');
    const card = rq ? `${g.partnerName} requests ${({ supply: 'SUPPLY DROP', scan: 'PULSE SCAN', emp: 'EMP', decoy: 'DECOY', lights: 'TAKE OUT THE LIGHTS', drone: 'DRONE OVERWATCH' })[rq.k]} \u00B7 ${Math.round(Math.hypot(rq.x - P.pos.x, rq.z - P.pos.z))} m` : g.lastCm ? `${g.partnerName}: ${g.lastCm.label}` : '';
    this.el.req.classList.toggle('on', !!card && !g.ended);
    this.el.req.classList.toggle('ack', !rq);
    if (card !== this._rq) { this._rq = card; this.el.reqT.textContent = card; }
    this._draw(dt);
  }

  // Markers (tags, objectives, partner, pins), the scope and the detection arcs.
  _draw(dt) {
    const g = this.g, c = this.ctx, cv = this.el.overlay, P = g.player, S = g.sentinel, cam = g.camera;
    const k = cv.width / innerWidth;
    c.setTransform(k, 0, 0, k, 0, 0);
    c.clearRect(0, 0, innerWidth, innerHeight);
    if (g.tablet.visible || g.ended) return;
    const W = innerWidth, H = innerHeight;
    const v = new THREE.Vector3();
    const proj = (x, y, z) => {
      v.set(x, y, z).project(cam);
      const behind = v.z > 1;
      return { x: (v.x * 0.5 + 0.5) * W, y: (-v.y * 0.5 + 0.5) * H, behind };
    };
    this._proj = proj;
    const camP = cam.position;
    const edge = (p, m = 30) => { if (p.behind) { p.x = clamp(W - p.x, W * 0.3, W * 0.7); p.y = H - 70; } p.x = clamp(p.x, m, W - m); p.y = clamp(p.y, m, H - m); return p; };
    const scoped = P.def.scope && P.scopeT > 0.6 && !(g.quad && g.quad.active);
    // Tagged and scanned contacts: red diamonds through walls.
    c.font = '600 11px JetBrains Mono, monospace';
    c.textAlign = 'center';
    for (const e of [...S.guards, ...S.drones]) {
      if (e.state === 'dead') continue;
      const tag = e.tagT > 0, scan = e.scanT > 0;
      if (!tag && !scan) continue;
      const y = (e.y || 0) + (e.kind === 'g' ? 2.05 : 0.8);
      const p = proj(e.x, y, e.z);
      if (p.behind) continue;
      const d = Math.hypot(e.x - camP.x, e.z - camP.z);
      const s = tag ? 7 : 4;
      c.strokeStyle = e.chief ? '#c070ff' : e.kind === 'd' ? '#ff8040' : '#ff3048';
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(p.x, p.y - s); c.lineTo(p.x + s, p.y); c.lineTo(p.x, p.y + s); c.lineTo(p.x - s, p.y); c.closePath();
      c.stroke();
      if (tag) { c.fillStyle = c.strokeStyle; c.fillText(`${e.chief ? 'CHIEF ' : ''}${Math.round(d)}m`, p.x, p.y - 11); }
    }
    // Objective marker.
    const om = this._objPoint();
    if (om && !om.hide) {
      const p = edge(proj(om.x, om.y, om.z));
      const d = Math.hypot(om.x - camP.x, om.z - camP.z);
      c.strokeStyle = '#30ffd0';
      c.fillStyle = '#30ffd0';
      c.lineWidth = 2;
      c.beginPath(); c.arc(p.x, p.y, 7, 0, Math.PI * 2); c.stroke();
      c.fillText(`${om.label} ${Math.round(d)}m`, p.x, p.y - 13);
    }
    // Partner.
    const Q = g.partner;
    if (Q.seen && !Q.kia && !(Q.ai && Q.avatarHidden)) {
      const p = edge(proj(Q.pos.x, Q.pos.y + 2.2, Q.pos.z));
      c.fillStyle = ROLES[Q.role].color;
      c.beginPath(); c.moveTo(p.x, p.y + 6); c.lineTo(p.x - 6, p.y - 4); c.lineTo(p.x + 6, p.y - 4); c.closePath(); c.fill();
      c.fillText(`${Q.name}${Q.downed ? ' — DOWN' : ''}`, p.x, p.y - 9);
    }
    // Pins and the LKP.
    for (const pin of g.pins) {
      pin.t -= dt;
      const p = edge(proj(pin.x, terrainHeight(pin.x, pin.z) + 1.5, pin.z));
      c.strokeStyle = c.fillStyle = pin.by === g.role ? ROLES[g.role].color : ROLES[g.partnerRole].color;
      c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(p.x - 5, p.y - 10); c.lineTo(p.x + 5, p.y - 10); c.closePath(); c.stroke();
      c.fillText(pin.label, p.x, p.y - 14);
    }
    g.pins = g.pins.filter((p) => p.t > 0);
    for (const role of ['shooter', 'spotter']) {
      const H = g._huntInfo(role);
      if (!H || H.state !== 'hunted' || !H.lkp) continue;
      const p = proj(H.lkp.x, H.lkp.y + 2.1, H.lkp.z);
      if (!p.behind) { c.fillStyle = 'rgba(255,255,255,0.8)'; c.fillText(`LAST KNOWN \u00B7 ${role === g.role ? 'YOU' : g.partnerName}`, p.x, p.y); }
    }
    // Supply crates.
    for (const cr of g.crates) { if (!cr.landed) continue; const p = proj(cr.x, cr.y + 1.2, cr.z); if (!p.behind) { c.fillStyle = '#40ffb0'; c.fillText('SUPPLY', p.x, p.y); } }
    // Detection arcs: guards that are noticing you.
    const me = P.pos;
    for (const e of S.guards) {
      if (e.state === 'dead' || e.aw < 0.08) continue;
      const d = Math.hypot(e.x - me.x, e.z - me.z);
      if (d > 70) continue;
      if (!(e.state === 'alert' && e.target === g.role) && e.state !== 'sus' && e.aw < 0.15) continue;
      const ang = Math.atan2(e.x - me.x, e.z - me.z) - P.yaw;
      const rr = Math.min(W, H) * 0.18;
      const a0 = -ang - Math.PI / 2 + Math.PI;
      c.strokeStyle = e.state === 'alert' ? 'rgba(255,48,72,0.9)' : 'rgba(255,208,64,0.85)';
      c.lineWidth = 4;
      c.beginPath();
      c.arc(W / 2, H / 2, rr, a0 - 0.22 * clamp(e.aw, 0.2, 1), a0 + 0.22 * clamp(e.aw, 0.2, 1));
      c.stroke();
    }
    g._kitDraw(c, W, H, proj);
    // Hit markers.
    for (const h of this.hits) h.t += dt;
    this.hits = this.hits.filter((h) => h.t < 0.32);
    // CoD-style: a crisp X round the crosshair that pops slightly and fades (red on a headshot).
    for (const h of this.hits) {
      const k = h.t / 0.32, pop = h.t < 0.05 ? 1.25 - h.t * 5 : 1, o = 7 * pop, s = 15 * pop;
      c.globalAlpha = 1 - k * k;
      for (const [col, lw] of [['rgba(0,0,0,0.55)', 4.5], [h.head ? '#ff3a4e' : '#ffffff', 2.4]]) {
        c.strokeStyle = col; c.lineWidth = lw; c.lineCap = 'round';
        for (const [sx, sy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) { c.beginPath(); c.moveTo(W / 2 + sx * o, H / 2 + sy * o); c.lineTo(W / 2 + sx * s, H / 2 + sy * s); c.stroke(); }
      }
      c.globalAlpha = 1; c.lineCap = 'butt';
    }
    // Scope (Halo-style ring with a range readout) or a small crosshair.
    g._neuroHud(c, proj, W, H);
    g._relayHud(c, proj, W, H);
    g._binoHud(c, proj, W, H);
    g._fcallHud(c, proj);
    g._devHud(c, W, H);
    this._owHud(c, proj);
    g._syncHud(c, proj);
    g._qhHud(c, proj, W, H);
    g._nvgHud(c, W, H);
    if (g.isr.active) this._isrHud(c, W, H);
    else if (scoped) this._scope(c, W, H);
    else if (g.quad && g.quad.active) this._quadHud(c, W, H);
    else if (!g.downed && !g.kia && !(g.bino && g.bino.up)) {
      c.strokeStyle = g._reticleHot() ? 'rgba(255,50,60,0.95)' : 'rgba(220,240,255,0.75)';
      c.lineWidth = 1.5;
      // The gap opens with the weapon's spread: tight on the sights, wide from the hip.
      const sp = g._spreadNow();
      const gap = Math.max(4, Math.min(H * 0.3, (Math.tan(sp / 2) / Math.tan(THREE.MathUtils.degToRad(g.camera.fov / 2))) * H / 2));
      this._xg = this._xg === undefined ? gap : this._xg + (gap - this._xg) * 0.25;
      const s = P.def.slot === 'pistol' && P.scopeT > 0.5 ? 4 : 7, q = this._xg;
      c.beginPath();
      c.moveTo(W / 2 - s - q, H / 2); c.lineTo(W / 2 - q, H / 2); c.moveTo(W / 2 + q, H / 2); c.lineTo(W / 2 + s + q, H / 2);
      c.moveTo(W / 2, H / 2 + q); c.lineTo(W / 2, H / 2 + s + q); c.moveTo(W / 2, H / 2 - q); c.lineTo(W / 2, H / 2 - s - q);
      c.stroke();
      c.fillStyle = c.strokeStyle; c.fillRect(W / 2 - 1, H / 2 - 1, 2, 2);
    }
  }

  _objPoint() {
    const g = this.g, ob = g.obj;
    switch (ob.step) {
      case 0: return { x: -80, y: 2, z: this.g.fac.cutZ, label: 'FENCE GAP' };
      case 1: return { x: SPOTS.relay.x, y: 1.5, z: SPOTS.relay.z, label: 'RELAY' };
      case 2: { const c = g.sentinel.guards.find((q) => q.chief && q.state === 'dead' && q.badge); return c ? { x: c.x, y: c.y + 2.6, z: c.z, label: 'MASTER BADGE' } : null; }
      case 3: return null; // search: no marker until someone finds the beacon
      case 4: case 5: { const T = g.fac.target; return { x: T.x, y: T.y + 1.2, z: T.z + 0.4, label: ob.step === 4 ? 'UPLOAD' : 'DRIVE' }; }
      case 6: {
        if (ob.drive === 'ground' && ob.driveAt) return { x: ob.driveAt.x, y: 1, z: ob.driveAt.z, label: 'DRIVE' };
        if (g._seat()) return null;
        const d = g._doorWorld(g._seatFor(g.role));
        return { x: d.x, y: g.vanState.y + 1.6, z: d.z, label: g._seatFor(g.role) === 'driver' ? 'VAN \u00B7 DRIVER' : 'VAN \u00B7 PASSENGER' };
      }
    }
    return null;
  }

  _scope(c, W, H) {
    const g = this.g, P = g.player;
    const R = Math.min(W, H) * 0.44;
    c.fillStyle = '#000';
    c.beginPath();
    c.rect(0, 0, W, H);
    c.arc(W / 2, H / 2, R, 0, Math.PI * 2, true);
    c.fill('evenodd');
    c.strokeStyle = g._reticleHot() ? 'rgba(255,60,70,0.95)' : 'rgba(200,225,255,0.85)';
    c.lineWidth = 1.5;
    c.beginPath(); c.arc(W / 2, H / 2, R, 0, Math.PI * 2); c.stroke();
    c.beginPath(); c.arc(W / 2, H / 2, R * 0.12, 0, Math.PI * 2); c.stroke();
    c.beginPath();
    c.moveTo(W / 2 - R, H / 2); c.lineTo(W / 2 - R * 0.14, H / 2);
    c.moveTo(W / 2 + R * 0.14, H / 2); c.lineTo(W / 2 + R, H / 2);
    c.moveTo(W / 2, H / 2 + R * 0.14); c.lineTo(W / 2, H / 2 + R);
    c.moveTo(W / 2, H / 2 - R); c.lineTo(W / 2, H / 2 - R * 0.14);
    c.stroke();
    c.fillStyle = 'rgba(210,232,255,0.9)';
    c.fillRect(W / 2 - 1, H / 2 - 1, 2, 2);
    // Range to whatever is under the reticle (refreshed a few times a second).
    this._rT = (this._rT || 0) - 1 / 60;
    if (this._rT <= 0) {
      this._rT = 0.15;
      const o = P.eyePos(new THREE.Vector3());
      const h = g._hitscan(o, o.clone().addScaledVector(P.aimDir(new THREE.Vector3()), 900));
      this._range = h ? o.distanceTo(h.point) : null;
      this._onTarget = !!(h && h.enemy);
    }
    c.font = '600 14px JetBrains Mono, monospace';
    c.textAlign = 'left';
    c.fillText(`${P.zoom}×`, W / 2 + R * 0.72, H / 2 + R * 0.62);
    c.fillText(this._range ? `${this._range.toFixed(1)} m` : '--- m', W / 2 + R * 0.18, H / 2 - R * 0.06);
    c.textAlign = 'center';
    if (this._onTarget) { c.strokeStyle = 'rgba(255,60,80,0.95)'; c.beginPath(); c.arc(W / 2, H / 2, R * 0.12, 0, Math.PI * 2); c.stroke(); }
    c.fillText(g.scopeNV === false ? 'PLAIN \u00B7 N: NIGHT VISION' : 'NIGHT VISION \u00B7 N: PLAIN', W / 2, H / 2 + R * 0.86);
    // Wind: speed and direction across your shot, and a hold-off dot for this range.
    if (P.def.slot === 'rifle') {
      const cw = g._crosswind(P.yaw), drift = g._windDrift(P.yaw, this._range || 300);
      const px = (Math.tan(drift) / Math.tan(THREE.MathUtils.degToRad(g.camera.fov / 2))) * (H / 2);
      c.fillStyle = 'rgba(255,190,90,0.95)';
      c.beginPath(); c.arc(W / 2 - px, H / 2, 2.5, 0, Math.PI * 2); c.fill();
      c.font = '600 12px JetBrains Mono, monospace'; c.textAlign = 'left';
      c.fillText(`WIND ${Math.abs(cw).toFixed(1)} m/s ${cw > 0.2 ? '\u2192' : cw < -0.2 ? '\u2190' : '\u00B7'}`, W / 2 - R * 0.86, H / 2 + R * 0.62);
      const B = g.ab && g.ab.breath;
      if (B) c.fillText(B.on ? `BREATH HELD ${(4 - B.t).toFixed(1)} s` : B.cd > 0 ? `BREATH ${Math.ceil(B.cd)} s` : 'SHIFT: HOLD BREATH', W / 2 - R * 0.86, H / 2 + R * 0.72);
      if (g.ab && g.ab.ow.on) { c.fillStyle = 'rgba(64,216,232,0.95)'; c.textAlign = 'center'; c.fillText('OVERWATCH LOCK', W / 2, H / 2 - R * 0.8); }
      c.textAlign = 'center';
    }
  }

  // Overwatch rings on the ground (yours and your partner's).
  _owHud(c, proj) {
    const g = this.g, rings = [];
    if (g.ab && g.ab.ow.on && g.ab.ow.at) rings.push([g.ab.ow.at.x, g.ab.ow.at.z, 'rgba(242,179,91,']);
    const pe = g.partner.ex;
    if (pe && pe.ow) rings.push([pe.ow[0], pe.ow[1], 'rgba(242,179,91,']);
    for (const [x, z, col] of rings) {
      const y = g.fac.groundAt(x, z, 60, 0.5) + 0.2;
      c.strokeStyle = col + (0.5 + 0.2 * Math.sin(g.t * 3)).toFixed(2) + ')';
      c.lineWidth = 1.5;
      c.beginPath();
      let first = true;
      for (let i = 0; i <= 24; i++) {
        const a = (i / 24) * Math.PI * 2, p = proj(x + Math.cos(a) * 14, y, z + Math.sin(a) * 14);
        if (p.behind) { first = true; continue; }
        if (first) c.moveTo(p.x, p.y); else c.lineTo(p.x, p.y);
        first = false;
      }
      c.stroke();
      const p = proj(x, y + 1, z);
      if (!p.behind) { c.fillStyle = col + '0.9)'; c.font = '600 10px JetBrains Mono, monospace'; c.textAlign = 'center'; c.fillText('OVERWATCH', p.x, p.y); }
    }
    c.lineWidth = 1;
  }

  _isrHud(c, W, H) {
    const I = this.g.isr;
    // Ping sweep: an expanding ring on the ground, then a held circle while it fades.
    const F = I.sweepFx;
    if (F && F.t < 6) {
      const k = Math.min(1, F.t / 1.2), a = F.t < 1.2 ? 0.9 : 0.9 * (1 - (F.t - 1.2) / 4.8);
      c.strokeStyle = `rgba(255,70,90,${a.toFixed(3)})`;
      c.lineWidth = 2;
      for (const rr of [F.r * k, F.r * k * 0.66, F.r * k * 0.33]) {
        c.beginPath();
        for (let i = 0; i <= 48; i++) {
          const t = (i / 48) * Math.PI * 2, x = F.x + Math.cos(t) * rr, z = F.z + Math.sin(t) * rr;
          const p = this._proj(x, this.g.fac.groundAt(x, z, 60, 0.5) + 0.3, z);
          if (i === 0) c.moveTo(p.x, p.y); else c.lineTo(p.x, p.y);
        }
        c.stroke();
      }
    }
    c.strokeStyle = 'rgba(235,245,255,0.85)';
    c.fillStyle = 'rgba(235,245,255,0.9)';
    c.lineWidth = 1.5;
    const cx = W / 2, cy = H / 2;
    c.beginPath();
    c.moveTo(cx - 60, cy); c.lineTo(cx - 12, cy); c.moveTo(cx + 12, cy); c.lineTo(cx + 60, cy);
    c.moveTo(cx, cy - 60); c.lineTo(cx, cy - 12); c.moveTo(cx, cy + 12); c.lineTo(cx, cy + 60);
    c.stroke();
    c.strokeRect(cx - 4, cy - 4, 8, 8);
    const m = 36;
    for (const [x, y, sx, sy] of [[m, m, 1, 1], [W - m, m, -1, 1], [m, H - m, 1, -1], [W - m, H - m, -1, -1]]) { c.beginPath(); c.moveTo(x, y + sy * 40); c.lineTo(x, y); c.lineTo(x + sx * 40, y); c.stroke(); }
    c.font = '600 13px JetBrains Mono, monospace';
    c.textAlign = 'left';
    c.fillText(`ISR // PREDATOR \u00B7 ${I.mode === 'IR' ? 'IR WHT-HOT' : 'EO'} \u00B7 ${I.mag.toFixed(1)}\u00D7 \u00B7 FOV ${I.fov.toFixed(1)}\u00B0`, m + 10, m + 20);
    // Zoom ladder on the right edge.
    {
      const x = W - m - 6, y0 = H / 2 - 90, y1 = H / 2 + 90;
      c.beginPath(); c.moveTo(x, y0); c.lineTo(x, y1);
      for (let i = 0; i <= 8; i++) { const y = y0 + (y1 - y0) * i / 8; c.moveTo(x - (i % 4 ? 5 : 10), y); c.lineTo(x, y); }
      c.stroke();
      const k = Math.log(ISR_FOV.max / I.fov) / Math.log(ISR_FOV.max / ISR_FOV.min);
      const y = y1 - (y1 - y0) * k;
      c.beginPath(); c.moveTo(x - 2, y); c.lineTo(x - 16, y - 6); c.lineTo(x - 16, y + 6); c.closePath(); c.fill();
      c.textAlign = 'right';
      c.fillText('ZOOM', x, y0 - 10);
      c.textAlign = 'left';
    }
    c.fillText(`ALT ${Math.round(I.pos.y)} m \u00B7 SLANT ${Math.round(I.slant())} m \u00B7 SPI ${Math.round(I.spi.x)} ${Math.round(-I.spi.z)}`, m + 10, m + 38);
    c.textAlign = 'right';
    c.fillText(`MOUSE/DRAG SLEW \u00B7 WHEEL / +\u2212 / [ ] / PINCH ZOOM \u00B7 N IR/EO \u00B7 F TAG \u00B7 P SWEEP${I.sweepCd > 0 ? ' ' + Math.ceil(I.sweepCd) + 's' : ''} \u00B7 V PING \u00B7 I EXIT`, W - m - 10, H - m - 12);
    c.textAlign = 'center';
  }

  _quadHud(c, W, H) {
    const q = this.g.quad;
    c.strokeStyle = 'rgba(230,240,255,0.8)';
    c.lineWidth = 1.5;
    const m = 40;
    for (const [x, y, sx, sy] of [[m, m, 1, 1], [W - m, m, -1, 1], [m, H - m, 1, -1], [W - m, H - m, -1, -1]]) { c.beginPath(); c.moveTo(x, y + sy * 30); c.lineTo(x, y); c.lineTo(x + sx * 30, y); c.stroke(); }
    c.beginPath(); c.arc(W / 2, H / 2, 16, 0, Math.PI * 2); c.stroke();
    c.fillStyle = 'rgba(230,240,255,0.9)';
    c.font = '600 13px JetBrains Mono, monospace';
    c.fillText(`RECON DRONE · BAT ${Math.ceil(q.bat)} s · HULL ${Math.max(0, q.hp)}`, W / 2, 78);
    c.fillText(`ALT ${(q.y - terrainHeight(q.x, q.z)).toFixed(1)} m · BAT ${Math.round((q.bat / 300) * 100)}% · Q PARK · HOLD Q RECALL`, W / 2, 96);
  }
}

function esc(s) {
  return String(s).replace(/[<>&"]/g, (ch) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[ch]));
}
void PLAYER;

installKit(CellGame);
installKit2(CellGame);
installIce(CellGame);
installNeuro(CellGame);
installNVG(CellGame);
installSpatial(CellGame);
installPhone(CellGame);
installXRounds(CellGame);
installAbilities(CellGame);
installMelee(CellGame);
installDevices(CellGame);

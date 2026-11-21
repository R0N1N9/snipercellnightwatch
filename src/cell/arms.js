// Sniper Cell — sidearms, their first-person models, and the staging-area loadouts.
//   K9 HUSH      compact SMG with a long suppressor shroud, red-dot, folding stock, a long
//                magazine ahead of the trigger and a vertical foregrip. FULL / BURST / SEMI.
//   M50 MAGNUM   heavy semi-auto hand cannon. Slow, hits hard.
//   P-9          the spotter's basic pistol.
// Every sidearm wears a detachable suppressor, on by default. Same anchor contract as the
// valley's viewmodels (gripR / gripL / muzzle / mag / magHome / slide / slideHome / sight).
import * as THREE from 'three';

export const SMG = {
  key: 'smg', name: 'K9 HUSH SMG', short: 'K9', caliber: '5 mm caseless', slot: 'pistol', kind: 'semi', modes: ['full', 'burst', 'semi'],
  mag: 40, spareMags: 4, muzzle: 420, damage: { head: 150, torso: 30, legs: 22 }, cycle: 0.066, reload: 2.1, reloadEmpty: 2.5,
  zooms: [1], scope: false, adsFov: 48, fixedZero: 25, glint: 0, recoil: 0.011, sway: 0, spread: 0.022,
};
export const MAGNUM = {
  key: 'mag50', name: 'M50 MAGNUM', short: 'M50', caliber: '12.7 mm', slot: 'pistol', kind: 'semi',
  mag: 7, spareMags: 4, muzzle: 460, damage: { head: 300, torso: 115, legs: 65 }, cycle: 0.36, reload: 1.8, reloadEmpty: 2.2,
  zooms: [1], scope: false, adsFov: 42, fixedZero: 25, glint: 0, recoil: 0.065, sway: 0, spread: 0.012,
};
export const P9 = {
  key: 'm18', name: 'P-9', short: 'P-9', caliber: '9 mm', slot: 'pistol', kind: 'semi',
  mag: 12, spareMags: 1, muzzle: 380, damage: { head: 150, torso: 50, legs: 35 }, cycle: 0.24, reload: 1.4, reloadEmpty: 1.8,
  zooms: [1], scope: false, adsFov: 46, fixedZero: 25, glint: 0, recoil: 0.03, sway: 0, spread: 0.03,
};

export const PERKS = {
  shooter: { lures: { name: 'EXTRA LURES', desc: '5 lures instead of 3.' }, mags: { name: 'EXTRA MAGS', desc: '+2 magazines for every weapon.' }, camo: { name: 'FAST CAMO', desc: 'Active camo recharges 50% faster.' } },
  spotter: { bandwidth: { name: 'BANDWIDTH', desc: 'Console bandwidth regenerates 40% faster.' }, drops: { name: 'LOGISTICS', desc: '+2 supply drops for the team.' }, armor: { name: 'LIGHT ARMOR', desc: 'Take 20% less damage.' } },
};
export const DEFAULT_LOADOUT = {
  shooter: { secondary: 'smg', secSup: true, perk: 'lures' },
  spotter: { pistolSup: true, perk: 'bandwidth' },
};
export function normLoadout(lo) {
  const L = JSON.parse(JSON.stringify(DEFAULT_LOADOUT));
  if (lo && lo.shooter) {
    if (['smg', 'mag50'].includes(lo.shooter.secondary)) L.shooter.secondary = lo.shooter.secondary;
    if (typeof lo.shooter.secSup === 'boolean') L.shooter.secSup = lo.shooter.secSup;
    if (PERKS.shooter[lo.shooter.perk]) L.shooter.perk = lo.shooter.perk;
  }
  if (lo && lo.spotter) {
    if (typeof lo.spotter.pistolSup === 'boolean') L.spotter.pistolSup = lo.spotter.pistolSup;
    if (PERKS.spotter[lo.spotter.perk]) L.spotter.perk = lo.spotter.perk;
  }
  return L;
}

function mats() {
  const m = (hex) => new THREE.MeshLambertMaterial({ color: hex, emissive: hex, emissiveIntensity: 0.14 });
  return { body: m('#30343a'), dark: m('#17181b'), hi: m('#454a52'), olive: m('#3e4436'), red: new THREE.MeshBasicMaterial({ color: '#ff3040' }), glass: new THREE.MeshBasicMaterial({ color: '#1a2a30' }) };
}
function kit(g) {
  const box = (w, h, d, mt, x, y, z, rx = 0) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mt); o.position.set(x, y, z); o.rotation.x = rx; g.add(o); return o; };
  const cyl = (r, len, mt, x, y, z, seg = 14) => { const o = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, seg).rotateX(Math.PI / 2), mt); o.position.set(x, y, z); g.add(o); return o; };
  const anchor = (x, y, z) => { const a = new THREE.Object3D(); a.position.set(x, y, z); g.add(a); return a; };
  return { box, cyl, anchor };
}

export function buildSMG() {
  const g = new THREE.Group();
  const M = mats(), { box, cyl, anchor } = kit(g);
  // Angular upper receiver with a chamfered top, lower with the grip.
  box(0.05, 0.06, 0.32, M.body, 0, 0.01, -0.12);
  box(0.046, 0.02, 0.3, M.hi, 0, 0.048, -0.12);
  box(0.054, 0.03, 0.14, M.olive, 0, -0.012, -0.21);
  // Long ventilated suppressor shroud (integral-looking).
  cyl(0.026, 0.34, M.dark, 0, 0.012, -0.44, 12);
  for (let i = 0; i < 5; i++) box(0.054, 0.006, 0.02, M.hi, 0, 0.012, -0.32 - i * 0.055);
  // Detachable can extension at the very end (removable suppressor).
  const can = cyl(0.024, 0.14, M.dark, 0, 0.012, -0.68, 12);
  // Red-dot sight.
  box(0.034, 0.03, 0.06, M.dark, 0, 0.075, -0.1);
  const dot = new THREE.Mesh(new THREE.CircleGeometry(0.006, 8), M.red);
  dot.position.set(0, 0.078, -0.068);
  g.add(dot);
  // Grip, trigger guard, long magazine ahead of the trigger, vertical foregrip.
  box(0.034, 0.1, 0.046, M.dark, 0, -0.06, 0.02, 0.3);
  box(0.008, 0.008, 0.06, M.dark, 0, -0.03, -0.035);
  const magG = new THREE.Group();
  const mag = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.17, 0.05), M.dark);
  mag.position.y = -0.085;
  mag.rotation.x = 0.12;
  magG.add(mag);
  magG.position.set(0, -0.02, -0.1);
  g.add(magG);
  box(0.03, 0.09, 0.03, M.body, 0, -0.055, -0.25);
  // Folding skeleton stock (folded along the right side).
  box(0.012, 0.03, 0.2, M.hi, 0.034, 0.0, 0.08);
  box(0.012, 0.07, 0.014, M.hi, 0.034, -0.02, 0.18);
  const slide = new THREE.Group();
  slide.add(new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.014, 0.03), M.hi));
  slide.position.set(-0.03, 0.03, -0.05);
  g.add(slide);
  g.userData = {
    gripR: anchor(0, -0.075, 0.03), gripL: anchor(0, -0.09, -0.25), muzzle: anchor(0, 0.012, -0.76), can,
    mag: magG, magHome: magG.position.clone(), slide, slideHome: slide.position.clone(), sight: 0.078,
  };
  return g;
}

export function buildMagnum() {
  const g = new THREE.Group();
  const M = mats(), { box, cyl, anchor } = kit(g);
  box(0.036, 0.03, 0.17, M.hi, 0, -0.004, -0.06);
  const grip = box(0.036, 0.115, 0.055, M.dark, 0, -0.07, 0.008, 0.22);
  void grip;
  const slide = new THREE.Group();
  slide.add(new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.04, 0.21), M.body));
  for (let i = 0; i < 5; i++) { const s = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.03, 0.004), M.dark); s.position.set(0, 0, 0.07 + i * 0.008); slide.add(s); }
  const sightF = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.01, 0.008), M.red); sightF.position.set(0, 0.025, -0.1); slide.add(sightF);
  const sightR = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.01, 0.008), M.hi); sightR.position.set(0, 0.025, 0.095); slide.add(sightR);
  slide.position.set(0, 0.028, -0.07);
  g.add(slide);
  // Ported compensator and a suppressor can.
  box(0.03, 0.036, 0.04, M.dark, 0, 0.026, -0.195);
  const can = cyl(0.02, 0.15, M.dark, 0, 0.026, -0.29, 12);
  const magG = new THREE.Group();
  magG.add(new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.014, 0.05), M.dark));
  magG.position.set(0, -0.13, 0.022);
  g.add(magG);
  g.userData = {
    gripR: anchor(0, -0.075, 0.02), gripL: anchor(-0.024, -0.08, 0.005), muzzle: anchor(0, 0.026, -0.37), can,
    slide, slideHome: slide.position.clone(), mag: magG, magHome: magG.position.clone(), sight: 0.052,
  };
  return g;
}

// A combat knife for takedowns, held low in the right hand.
export function buildKnife() {
  const g = new THREE.Group();
  const M = mats();
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.03, 0.17), new THREE.MeshLambertMaterial({ color: '#9aa2ac', emissive: '#9aa2ac', emissiveIntensity: 0.25 }));
  blade.position.z = -0.12;
  const guard = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.05, 0.012), M.dark);
  guard.position.z = -0.03;
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.032, 0.1), M.olive);
  handle.position.z = 0.02;
  g.add(blade, guard, handle);
  return g;
}

// What each operator wears (game and menu preview). Both wear the multicam-black kit: the
// shooter adds a chest rig and the urban-digital poncho; the spotter wears the plate carrier
// with a quad on the pack.
export function cellLook(role) {
  return role === 'shooter'
    ? { outfit: 'wraith', theme: 'mcblack', vest: 'rig', poncho: true, ponchoTheme: 'urbandark', hat: 'none', eyes: 'goggles', kit: { stealth: 'suppressor' } }
    : { outfit: 'wraith', theme: 'mcblack', vest: 'plate', poncho: false, hat: 'cap', eyes: 'goggles', kit: { scout: 'drone' } };
}

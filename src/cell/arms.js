// Sniper Cell — sidearms, their first-person models, and the staging-area loadouts.
//   K9 HUSH      compact SMG with a long suppressor shroud, red-dot, folding stock, a long
//                magazine ahead of the trigger and a vertical foregrip. FULL / BURST / SEMI.
//   M50 MAGNUM   heavy semi-auto hand cannon: steel slide, ported comp. Slow, hits hard.
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
  mag: 7, spareMags: 4, muzzle: 460, damage: { head: 300, torso: 130, legs: 70 }, cycle: 0.62, reload: 1.8, reloadEmpty: 2.2,
  zooms: [1], scope: false, adsFov: 42, fixedZero: 25, glint: 0, recoil: 0.085, sway: 0, spread: 0.075, adsSpread: 0.006, kick: 0.07, heavy: true,
};
export const P9 = {
  key: 'm18', name: 'P-9', short: 'P-9', caliber: '9 mm', slot: 'pistol', kind: 'semi',
  mag: 12, spareMags: 2, muzzle: 380, damage: { head: 150, torso: 50, legs: 35 }, cycle: 0.24, reload: 1.4, reloadEmpty: 1.8,
  zooms: [1], scope: false, adsFov: 46, fixedZero: 25, glint: 0, recoil: 0.03, sway: 0, spread: 0.03,
};

export const PERKS = {
  shooter: { lures: { name: 'EXTRA STICKIES', desc: '5 sticky grenades instead of 3.' }, mags: { name: 'EXTRA MAGS', desc: '+2 magazines for every weapon.' }, camo: { name: 'FAST CAMO', desc: 'Active camo recharges 50% faster.' } },
  spotter: { bandwidth: { name: 'BANDWIDTH', desc: 'Console bandwidth regenerates 40% faster.' }, drops: { name: 'LOGISTICS', desc: '+2 supply drops for the team.' }, armor: { name: 'LIGHT ARMOR', desc: 'Take 20% less damage.' } },
};
export const DEFAULT_LOADOUT = {
  shooter: { secondary: 'smg', secSup: true, perk: 'camo', bolt: 'standard' },
  spotter: { primary: 'bino', pistolSup: true, perk: 'bandwidth' },
};
export function normLoadout(lo) {
  const L = JSON.parse(JSON.stringify(DEFAULT_LOADOUT));
  if (lo && lo.shooter) {
    if (['smg', 'mag50'].includes(lo.shooter.secondary)) L.shooter.secondary = lo.shooter.secondary;
    if (PERKS.shooter[lo.shooter.perk]) L.shooter.perk = lo.shooter.perk;
    if (['standard', 'straight'].includes(lo.shooter.bolt)) L.shooter.bolt = lo.shooter.bolt;
  }
  if (lo && lo.spotter) {
    if (['bino', 'smg'].includes(lo.spotter.primary)) L.spotter.primary = lo.spotter.primary;
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
  const metal = new THREE.MeshStandardMaterial({ color: '#2a2d32', metalness: 0.6, roughness: 0.45, emissive: '#16181b', emissiveIntensity: 0.45 });
  const poly = new THREE.MeshLambertMaterial({ color: '#25272b', emissive: '#25272b', emissiveIntensity: 0.14 });
  const tan = new THREE.MeshLambertMaterial({ color: '#6b5d45', emissive: '#6b5d45', emissiveIntensity: 0.12 });
  // Upper receiver with a chamfered top and a full-length rail (teeth along the top).
  box(0.05, 0.058, 0.34, metal, 0, 0.012, -0.12);
  box(0.042, 0.012, 0.34, metal, 0, 0.046, -0.12);
  for (let i = 0; i < 14; i++) box(0.046, 0.006, 0.01, M.dark, 0, 0.055, 0.03 - i * 0.022);
  // Ejection port and a side charging handle (the "slide" the reload animates).
  box(0.002, 0.016, 0.05, M.dark, 0.026, 0.02, -0.06);
  // Handguard: slotted (M-LOK style), wider than the receiver, tan accent panel.
  box(0.056, 0.05, 0.16, poly, 0, 0.006, -0.36);
  for (let i = 0; i < 4; i++) for (const sx of [-1, 1]) box(0.002, 0.012, 0.024, M.dark, sx * 0.029, 0.006, -0.3 - i * 0.036);
  box(0.058, 0.012, 0.1, tan, 0, -0.022, -0.36);
  // Lower: textured pistol grip, flared magwell, big trigger guard.
  const grip = box(0.036, 0.11, 0.05, poly, 0, -0.065, 0.03, -0.3);
  void grip;
  for (let i = 0; i < 4; i++) box(0.037, 0.004, 0.044, M.dark, 0, -0.04 - i * 0.022, 0.022 + i * 0.0066, -0.3);
  box(0.04, 0.03, 0.18, poly, 0, -0.025, -0.08);
  box(0.034, 0.008, 0.07, poly, 0, -0.048, -0.025);
  box(0.006, 0.022, 0.006, M.dark, 0, -0.035, -0.02);
  box(0.044, 0.02, 0.06, poly, 0, -0.045, -0.12);
  // Long ventilated suppressor shroud with cooling flutes.
  cyl(0.027, 0.26, M.dark, 0, 0.012, -0.57, 16);
  for (let i = 0; i < 6; i++) box(0.058, 0.005, 0.018, M.hi, 0, 0.012, -0.47 - i * 0.04);
  // Detachable can at the very end (removable suppressor).
  const can = cyl(0.025, 0.12, M.dark, 0, 0.012, -0.76, 16);
  // Hooded red-dot with a lens and a dot.
  box(0.036, 0.008, 0.07, M.dark, 0, 0.06, -0.1);
  box(0.006, 0.034, 0.06, metal, -0.017, 0.078, -0.1);
  box(0.006, 0.034, 0.06, metal, 0.017, 0.078, -0.1);
  box(0.04, 0.006, 0.064, metal, 0, 0.097, -0.1);
  const lens = new THREE.Mesh(new THREE.PlaneGeometry(0.028, 0.028), new THREE.MeshBasicMaterial({ color: '#2a4a52', transparent: true, opacity: 0.35 }));
  lens.position.set(0, 0.078, -0.13); g.add(lens);
  const dot = new THREE.Mesh(new THREE.CircleGeometry(0.0045, 10), M.red);
  dot.position.set(0, 0.078, -0.068);
  g.add(dot);
  // Back-up irons (cosmetic): two green dots on a rear sight behind the reflex, a red dot on a
  // front post at the end of the rail.
  const green = new THREE.MeshBasicMaterial({ color: '#30ff60' }), red = new THREE.MeshBasicMaterial({ color: '#ff2a2a' });
  for (const sx of [-0.008, 0.008]) {
    box(0.008, 0.016, 0.01, M.dark, sx, 0.063, -0.018);
    const gd = new THREE.Mesh(new THREE.SphereGeometry(0.0032, 8, 6), green); gd.position.set(sx, 0.068, -0.012); g.add(gd);
  }
  box(0.008, 0.024, 0.01, M.dark, 0, 0.067, -0.27);
  const rf = new THREE.Mesh(new THREE.SphereGeometry(0.0035, 8, 6), red); rf.position.set(0, 0.077, -0.264); g.add(rf);
  // Long magazine ahead of the trigger (textured), angled foregrip.
  const magG = new THREE.Group();
  const mag = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.17, 0.05), poly);
  mag.position.y = -0.085; mag.rotation.x = 0.12; magG.add(mag);
  for (let i = 0; i < 3; i++) { const r = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.004, 0.052), M.dark); r.position.set(0, -0.05 - i * 0.04, -0.005 + i * 0.005); r.rotation.x = 0.12; magG.add(r); }
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.012, 0.058), tan); base.position.set(0, -0.172, -0.012); base.rotation.x = 0.12; magG.add(base);
  magG.position.set(0, -0.02, -0.1);
  g.add(magG);
  box(0.03, 0.08, 0.03, poly, 0, -0.06, -0.33, -0.25);
  // Collapsible stock, pulled out: a buffer tube off the back of the receiver, twin guide
  // rods running back to a skeletal butt (top strut, cheek riser, rubber pad).
  cyl(0.012, 0.07, metal, 0, 0.006, 0.085, 12); // buffer tube
  box(0.03, 0.026, 0.02, M.dark, 0, 0.004, 0.058); // end plate / latch housing
  for (const sx of [-1, 1]) cyl(0.0045, 0.2, metal, sx * 0.013, -0.012, 0.15, 8); // guide rods (extended)
  box(0.012, 0.012, 0.12, poly, 0, 0.026, 0.2); // top strut
  box(0.024, 0.016, 0.07, poly, 0, 0.032, 0.21); // cheek riser
  box(0.032, 0.094, 0.026, poly, 0, -0.006, 0.255); // butt
  box(0.034, 0.1, 0.012, M.dark, 0, -0.006, 0.272); // rubber pad
  box(0.006, 0.006, 0.02, M.dark, 0, -0.03, 0.12); // adjustment lever
  const slide = new THREE.Group();
  slide.add(new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.014, 0.03), metal));
  slide.position.set(-0.032, 0.03, -0.05);
  g.add(slide);
  g.userData = {
    gripR: anchor(0, -0.075, 0.03), gripL: anchor(0, -0.09, -0.33), muzzle: anchor(0, 0.012, -0.82), can,
    mag: magG, magHome: magG.position.clone(), slide, slideHome: slide.position.clone(), sight: 0.078,
  };
  return g;
}

// M50 Magnum: a big, modern hand cannon, nothing like the P-9. A black frame with a
// full-length dust cover, a tall brushed-steel slide with a lightening window over the barrel, a ported
// compensator, an oversized squared trigger guard, a chunky textured grip with a flared
// magwell, hammer and beavertail, and night sights: two green rear dots, a red front dot.
export function buildMagnum() {
  const g = new THREE.Group();
  const { box, cyl, anchor } = kit(g);
  const frameM = new THREE.MeshStandardMaterial({ color: '#1c1e22', metalness: 0.5, roughness: 0.5, emissive: '#111214', emissiveIntensity: 0.5 });
  const slideM = new THREE.MeshStandardMaterial({ color: '#7d838b', metalness: 0.85, roughness: 0.3, emissive: '#3c4046', emissiveIntensity: 0.5 }); // brushed steel
  const gripM = new THREE.MeshLambertMaterial({ color: '#202226', emissive: '#202226', emissiveIntensity: 0.12 });
  const dark = new THREE.MeshLambertMaterial({ color: '#0d0e10' });
  const barrelM = new THREE.MeshStandardMaterial({ color: '#8a8f96', metalness: 0.9, roughness: 0.25, emissive: '#3a3d42', emissiveIntensity: 0.4 });
  // Frame: full-length dust cover under the slide, with a rail underneath.
  box(0.044, 0.032, 0.27, frameM, 0, -0.006, -0.1);
  box(0.03, 0.01, 0.11, frameM, 0, -0.027, -0.16);
  for (let i = 0; i < 4; i++) box(0.034, 0.004, 0.012, dark, 0, -0.033, -0.12 - i * 0.026);
  // Oversized squared trigger guard and trigger.
  box(0.036, 0.01, 0.06, frameM, 0, -0.06, -0.04);
  box(0.036, 0.04, 0.01, frameM, 0, -0.042, -0.068);
  box(0.008, 0.026, 0.008, dark, 0, -0.035, -0.03);
  // Grip: chunky, raked, wraparound texture, flared magwell, beavertail.
  box(0.044, 0.13, 0.064, gripM, 0, -0.078, 0.02, -0.22);
  const texM = new THREE.MeshLambertMaterial({ color: '#3d4148', emissive: '#3d4148', emissiveIntensity: 0.12 });
  for (let i = 0; i < 6; i++) box(0.046, 0.004, 0.058, texM, 0, -0.04 - i * 0.019, 0.012 + i * 0.0045, -0.22);
  box(0.05, 0.016, 0.07, frameM, 0, -0.142, 0.036, -0.22);
  box(0.036, 0.016, 0.03, frameM, 0, 0.004, 0.052, -0.3);
  const slide = new THREE.Group();
  // Long slide with a chamfered front, serrations front and back, a top rib and a window.
  const sl = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.054, 0.27), slideM); slide.add(sl);
  const nose = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.036, 0.03), slideM); nose.position.set(0, -0.006, -0.148); slide.add(nose);
  for (let i = 0; i < 7; i++) { const c = new THREE.Mesh(new THREE.BoxGeometry(0.044, 0.04, 0.003), dark); c.position.set(0, -0.002, 0.09 + i * 0.006); slide.add(c); }
  for (let i = 0; i < 4; i++) { const c = new THREE.Mesh(new THREE.BoxGeometry(0.044, 0.034, 0.003), dark); c.position.set(0, -0.004, -0.09 - i * 0.006); slide.add(c); }
  const rib = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.005, 0.18), dark); rib.position.set(0, 0.029, -0.01); slide.add(rib);
  for (const sx of [-1, 1]) {
    const win = new THREE.Mesh(new THREE.BoxGeometry(0.002, 0.026, 0.11), dark); win.position.set(sx * 0.0215, 0.004, -0.045); slide.add(win);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.002, 0.014, 0.1), barrelM); bar.position.set(sx * 0.0225, 0.004, -0.045); slide.add(bar);
  }
  const port = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.004, 0.04), dark); port.position.set(0.008, 0.0275, 0.03); slide.add(port);
  // Night sights: red dot up front, two green dots either side of the rear notch.
  const fs = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.012, 0.01), dark); fs.position.set(0, 0.033, -0.118); slide.add(fs);
  const fd = new THREE.Mesh(new THREE.SphereGeometry(0.0042, 10, 8), new THREE.MeshBasicMaterial({ color: '#ff2a2a' })); fd.position.set(0, 0.035, -0.112); slide.add(fd);
  for (const sx of [-0.0095, 0.0095]) {
    const rs = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.014, 0.01), dark); rs.position.set(sx, 0.033, 0.118); slide.add(rs);
    const rd = new THREE.Mesh(new THREE.SphereGeometry(0.0038, 10, 8), new THREE.MeshBasicMaterial({ color: '#30ff60' })); rd.position.set(sx, 0.035, 0.124); slide.add(rd);
  }
  const hammer = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.02, 0.012), dark); hammer.position.set(0, 0.01, 0.14); hammer.rotation.x = -0.4; slide.add(hammer);
  slide.position.set(0, 0.032, -0.09);
  g.add(slide);
  // Ported compensator: blocky, with three top ports, then a can for the suppressor.
  box(0.046, 0.054, 0.06, frameM, 0, 0.022, -0.265);
  for (let i = 0; i < 3; i++) box(0.024, 0.004, 0.008, dark, 0, 0.05, -0.248 - i * 0.016);
  const bore = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.01, 10).rotateX(Math.PI / 2), dark); bore.position.set(0, 0.026, -0.296); g.add(bore);
  const can = cyl(0.026, 0.16, dark, 0, 0.026, -0.375, 16);
  const magG = new THREE.Group();
  magG.add(new THREE.Mesh(new THREE.BoxGeometry(0.044, 0.016, 0.066), frameM));
  magG.position.set(0, -0.155, 0.04);
  g.add(magG);
  g.userData = {
    gripR: anchor(0, -0.085, 0.022), gripL: anchor(-0.028, -0.09, 0.006), muzzle: anchor(0, 0.026, -0.46), can,
    slide, slideHome: slide.position.clone(), mag: magG, magHome: magG.position.clone(), sight: 0.067,
  };
  return g;
}

// P-9 service pistol (first person): a dark grey polymer frame with a rail and a raked,
// textured grip, a black metal slide with cocking serrations, two green rear night-sight dots
// and a red front dot. A size down from the M50.
export function buildP9() {
  const g = new THREE.Group();
  const { box, anchor } = kit(g);
  const frameM = new THREE.MeshLambertMaterial({ color: '#3b3e43', emissive: '#3b3e43', emissiveIntensity: 0.14 });
  const gripM = new THREE.MeshLambertMaterial({ color: '#2f3236', emissive: '#2f3236', emissiveIntensity: 0.12 });
  const slideM = new THREE.MeshStandardMaterial({ color: '#141518', metalness: 0.75, roughness: 0.38, emissive: '#0d0e10', emissiveIntensity: 0.4 });
  const dark = new THREE.MeshLambertMaterial({ color: '#111214' });
  box(0.032, 0.026, 0.165, frameM, 0, -0.006, -0.064); // frame / dust cover
  box(0.026, 0.008, 0.06, frameM, 0, -0.022, -0.11); // accessory rail
  box(0.034, 0.112, 0.052, gripM, 0, -0.068, 0.012, -0.2); // grip, raked back
  for (let i = 0; i < 5; i++) box(0.035, 0.004, 0.046, frameM, 0, -0.035 - i * 0.02, 0.006 + i * 0.004, -0.2);
  // Trigger guard: front post, bottom bar curving back to the grip.
  box(0.03, 0.03, 0.009, frameM, 0, -0.035, -0.05);
  box(0.03, 0.008, 0.058, frameM, 0, -0.051, -0.023);
  box(0.03, 0.012, 0.01, frameM, 0, -0.045, 0.004);
  box(0.006, 0.02, 0.006, dark, 0, -0.03, -0.022); // trigger
  box(0.03, 0.022, 0.012, frameM, 0, 0.0, 0.03); // beavertail
  const slide = new THREE.Group();
  const sl = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.034, 0.195), slideM); slide.add(sl);
  for (let i = 0; i < 6; i++) { const c = new THREE.Mesh(new THREE.BoxGeometry(0.031, 0.026, 0.003), dark); c.position.set(0, -0.001, 0.062 + i * 0.006); slide.add(c); }
  const port = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.004, 0.03), dark); port.position.set(0.006, 0.0175, -0.005); slide.add(port);
  // Night sights: red dot up front, two green dots either side of the rear notch.
  const fs = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.01, 0.008), dark); fs.position.set(0, 0.022, -0.09); slide.add(fs);
  const fd = new THREE.Mesh(new THREE.SphereGeometry(0.0032, 8, 6), new THREE.MeshBasicMaterial({ color: '#ff2a2a' })); fd.position.set(0, 0.023, -0.085); slide.add(fd);
  for (const sx of [-0.0072, 0.0072]) {
    const rs = new THREE.Mesh(new THREE.BoxGeometry(0.0075, 0.011, 0.008), dark); rs.position.set(sx, 0.022, 0.088); slide.add(rs);
    const rd = new THREE.Mesh(new THREE.SphereGeometry(0.003, 8, 6), new THREE.MeshBasicMaterial({ color: '#30ff60' })); rd.position.set(sx, 0.023, 0.0925); slide.add(rd);
  }
  const bore = new THREE.Mesh(new THREE.CylinderGeometry(0.0055, 0.0055, 0.01, 8).rotateX(Math.PI / 2), dark); bore.position.set(0, 0.002, -0.098); slide.add(bore);
  slide.position.set(0, 0.024, -0.066);
  g.add(slide);
  const magG = new THREE.Group();
  magG.add(new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.013, 0.05), dark));
  magG.position.set(0, -0.124, 0.02);
  g.add(magG);
  g.userData = {
    gripR: anchor(0, -0.072, 0.02), gripL: anchor(-0.023, -0.077, 0.005), muzzle: anchor(0, 0.026, -0.17),
    slide, slideHome: slide.position.clone(), mag: magG, magHome: magG.position.clone(), sight: 0.047,
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
  // Uniforms multicam black; carrier, rig, belts and straps a dark, muted flat dark earth; IR
  // markers. The shooter wears a clear coiled earpiece under the hood and carries the KR-50; the
  // spotter wears a ball cap and an FDE headset with a boom mic.
  const common = { outfit: 'wraith', theme: 'mcblack', gear: '#5f533e', gearAccent: '#1c1d1f', irMark: true, eyes: 'goggles' };
  return role === 'shooter'
    ? { ...common, vest: 'rig', poncho: true, ponchoTheme: 'urbandark', hat: 'none', earpiece: true, rifle: 'kr50', kit: { stealth: 'suppressor' } }
    : { ...common, vest: 'plate', poncho: false, hat: 'cap', headset: true, kit: { scout: 'drone' } };
}

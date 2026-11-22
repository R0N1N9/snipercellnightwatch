// The cell's operators on the hero rig (NightWatch bible, tools/render/hero-avatar.js), behind the canon Avatar's
// interface (root, setLook, setVisible, update) so cell.js can swap them in. Soft style: thin night-blue outlines,
// quieter paint, so the models sit in the Inked and OG looks without heavy ink.
import { HeroAvatar } from './hero-avatar.js';
import { heroStyle, setOutlineRes } from './hero.js';
import { heroK9 } from './hero-guns-a.js';
import { heroNightjar } from './hero-guns-b.js';

const KIT = {
  // Ra: hood and poncho-cape over the plate carrier, the KR-50 Nightjar (hero tier).
  shooter: { hat: 'hood', eyes: 'goggles', vest: 'plate', poncho: true, gun: () => heroNightjar(), callsign: 'RA' },
  // Rōnin: cap, goggles, runner rig, recon quad on the pack, the K9 Hush (hero tier).
  spotter: { hat: 'cap', eyes: 'goggles', vest: 'runner', drone: true, gun: () => { const g = heroK9(); g.userData.compact = true; return g; }, callsign: 'RONIN' },
};

export function heroOutlineRes(w, h) { setOutlineRes(w, h); }

export function heroCellAvatar(role) {
  heroStyle('soft');
  const kit = { ...(KIT[role] || KIT.spotter) };
  if (typeof kit.gun === 'function') kit.gun = kit.gun();
  const h = new HeroAvatar({ cw: 'nightwatch', outlines: true, ...kit });
  // The game's Hero look outlines props itself; these figures carry their own hulls.
  h.root.traverse((o) => { o.userData.noOutline = true; });
  return {
    root: h.root, hero: h, head: h.head, neck: h.head, spine: h.spine,
    setLook() {},
    setVisible(v) { h.root.visible = v; },
    update(dt, s) {
      h.update(dt, { p: s.p, yaw: s.yaw, pitch: s.pitch || 0, st: s.st | 0, moving: !!s.moving, sprint: !!s.sprint, ads: !!s.ads, lowReady: s.lowReady, speed: s.speed, strafe: s.strafe });
    },
  };
}

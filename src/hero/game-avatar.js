// The cell's operators on the hero rig (NightWatch bible, tools/render/hero-avatar.js), behind the canon Avatar's
// interface (root, setLook, setVisible, update) so cell.js can swap them in. Soft style: thin night-blue outlines,
// quieter paint, so the models sit in the Inked and OG looks without heavy ink.
import { HeroAvatar } from './hero-avatar.js';
import { heroStyle, setOutlineRes } from './hero.js';

const KIT = {
  // Ra: hood and poncho over the plate carrier, the long suppressed rifle on an LPVO (the KR-50 stand-in).
  shooter: { hat: 'hood', eyes: 'goggles', vest: 'plate', poncho: true, gunOpts: { optic: 'lpvo', can: 'long', bipod: true, lantern: false }, callsign: 'RA' },
  // Rōnin: cap, goggles, runner rig, recon quad on the pack.
  spotter: { hat: 'cap', eyes: 'goggles', vest: 'runner', drone: true, gun: 'x4', callsign: 'RONIN' },
};

export function heroOutlineRes(w, h) { setOutlineRes(w, h); }

export function heroCellAvatar(role) {
  heroStyle('soft');
  const h = new HeroAvatar({ cw: 'nightwatch', outlines: true, ...(KIT[role] || KIT.spotter) });
  // The game's Hero look outlines props itself; these figures carry their own hulls.
  h.root.traverse((o) => { o.userData.noOutline = true; });
  return {
    root: h.root, hero: h, head: h.head, neck: h.head, spine: h.spine,
    setLook() {},
    setVisible(v) { h.root.visible = v; },
    update(dt, s) {
      h.update(dt, { p: s.p, yaw: s.yaw, pitch: s.pitch || 0, st: s.st | 0, moving: !!s.moving, sprint: !!s.sprint, ads: !!s.ads, lowReady: s.lowReady ?? !s.moving, speed: s.speed, strafe: s.strafe });
    },
  };
}

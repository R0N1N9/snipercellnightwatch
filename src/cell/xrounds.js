// Sniper Cell — the shooter's special magazines (Z / ROUNDS opens the menu): EXPLOSIVE, PENETRATOR, EMP.
// EXPLOSIVE ROUNDS: Ra swaps the KR-50's magazine for a
// marked one (a full reload animation); each of its rounds sticks where it hits, blinks for a
// second and blows. Built for the heavies: the charge on a juggernaut or titan kills it outright,
// and anything within a few metres is caught in the blast. It's loud: the whole area hears it.
// Z again swaps back to standard ammo (the explosive rounds left go back in the pouch).
import * as THREE from 'three';

export const XR = { mag: 4, start: 4, max: 8, fuse: 1.0, radius: 5.5, direct: 950, splash: 420, noise: 48, swap: 2.6 };
// Magazine types for the KR-50 (Z opens the rounds menu on the left of the screen).
export const AMMO = [
  { k: 'std', name: 'STANDARD', desc: 'Subsonic .50. Goes straight through bodies: line them up.' },
  { k: 'xr', name: 'EXPLOSIVE', desc: 'Sticks where it hits, blows a second later. Kills heavies. Loud.' },
  { k: 'pen', name: 'PENETRATOR', desc: 'Tungsten core: through walls and doors, exterior walls and bulwark shields too.' },
  { k: 'emp', name: 'EMP', desc: 'Kills drones, cameras, lights, shields and radios around the hit.' },
];
export const AMMO_NAME = Object.fromEntries(AMMO.map((a) => [a.k, a.name]));
const START = { xr: 4, pen: 6, emp: 4 };

export const XRounds = {
  _xrInit() {
    const own = false; // special magazines removed: the KR-50's standard round penetrates and kills cameras
    this.xr = { pouch: own ? { ...START } : { xr: 0, pen: 0, emp: 0 }, swap: null, menu: false };
    Object.defineProperty(this.xr, 'rounds', { get: () => this.xr.pouch.xr, set: (v) => (this.xr.pouch.xr = v) });
    this.xcharges = [];
    this._xcId = 1;
    if (own) { this._ammoMenuBuild(); this._magStripBuild(); }
  },

  // The magazine strip on the left: an orange silhouette per round type with how many rounds you
  // have; tap (or click) one to load it (the full mag-out / mag-in reload).
  _magStripBuild() {
    const el = (this.magEl = document.createElement('div'));
    el.id = 'cell-mags';
    el.className = 'col';
    const tip = { std: '', xr: '#ff4a3a', pen: '#d8dde4', emp: '#3fe8ff' };
    const short = { std: 'STD', xr: 'EXP', pen: 'PEN', emp: 'EMP' };
    el.innerHTML = AMMO.map((a) => `<div class="cm" data-a="${a.k}"><svg viewBox="0 0 26 38"><path d="M7 2h12l1 4-1 3 2 23-1 4H6l-1-4 2-23-1-3z" /><path class="rib" d="M8 13h10M8 18h10M8 23h10M8 28h10" />${tip[a.k] ? `<rect x="9" y="0" width="8" height="4" rx="1" fill="${tip[a.k]}" />` : ''}</svg><b>${short[a.k]}</b><em></em></div>`).join('');
    document.body.appendChild(el);
    const pick = (e) => { const b = e.target.closest('[data-a]'); if (!b) return; e.preventDefault(); e.stopPropagation(); this._ammoSwap(b.dataset.a); this._magPaint(true); };
    el.addEventListener('pointerdown', pick);
    el.addEventListener('touchstart', pick, { passive: false });
    this._magPaint(true);
  },
  _magPaint(force) {
    const el = this.magEl;
    if (!el) return;
    const P = this.player, w = P.arms.find((q) => q.def.slot === 'rifle');
    const show = !!w && P.w === w && !this.knifeEq && !(this.tablet && this.tablet.visible) && !(this.isr && this.isr.active) && !(this.quad && this.quad.active) && !this.downed && !this.kia && !(this.cine && this.cine.active);
    el.style.display = show ? '' : 'none';
    if (!show) return;
    this._magT = (this._magT || 0) - 1 / 60;
    if (!force && this._magT > 0) return;
    this._magT = 0.25;
    const cur = w.ammo || 'std', X = this.xr;
    for (const b of el.children) {
      const k = b.dataset.a;
      const n = k === 'std' ? w.reserve + (cur === 'std' ? w.mag + w.chamber : 0) : X.pouch[k] + (cur === k ? w.mag + w.chamber : 0);
      b.querySelector('em').textContent = '\u00D7' + n;
      b.classList.toggle('on', cur === k);
      b.classList.toggle('out', !n);
      b.classList.toggle('busy', !!X.swap && X.swap.to === k);
    }
  },

  // The rounds menu: a column on the left. Z toggles it; 1–4, a click or a tap loads one.
  _ammoMenuBuild() {
    const el = (this.ammoEl = document.createElement('div'));
    el.id = 'cell-ammo';
    document.body.appendChild(el);
    el.addEventListener('pointerdown', (e) => { const b = e.target.closest('[data-a]'); if (!b) return; e.preventDefault(); e.stopPropagation(); this._ammoPick(b.dataset.a); });
    el.addEventListener('touchstart', (e) => { const b = e.target.closest('[data-a]'); if (!b) return; e.preventDefault(); e.stopPropagation(); this._ammoPick(b.dataset.a); }, { passive: false });
  },
  _ammoMenu(on) {
    if (!this.ammoEl) return;
    this.xr.menu = on === undefined ? !this.xr.menu : on;
    this.ammoEl.classList.toggle('on', this.xr.menu);
    this._ammoPaint();
    if (this.xr.menu) this._hint && this._hint('rounds');
  },
  _ammoPaint() {
    if (!this.ammoEl || !this.xr.menu) return;
    const w = this.player.arms.find((q) => q.def.slot === 'rifle'), cur = (w && w.ammo) || 'std';
    this.ammoEl.innerHTML = '<div class="ca-h">ROUNDS \u00B7 KR-50</div>' + AMMO.map((a, i) => {
      const n = a.k === 'std' ? (w ? w.reserve + (cur === 'std' ? w.mag + w.chamber : 0) : 0) : this.xr.pouch[a.k] + (cur === a.k ? w.mag + w.chamber : 0);
      return `<button data-a="${a.k}" class="${cur === a.k ? 'on' : ''} ${n ? '' : 'out'}"><i>${i + 1}</i><b>${a.name}</b><em>\u00D7${n}</em><span>${a.desc}</span></button>`;
    }).join('') + '<div class="ca-f">Z close \u00B7 1\u20134 load</div>';
  },
  _ammoPick(k) {
    this._ammoMenu(false);
    this._ammoSwap(k);
  },
  // Kept for the old Z binding: toggles the menu now.
  _xrSwap() { this._ammoMenu(); },

  // Swap the KR-50's magazine to round type k (a full reload animation).
  _ammoSwap(k) {
    const P = this.player, X = this.xr;
    if (!X || X.swap || this.downed) return;
    const rifle = P.arms.find((w) => w.def.slot === 'rifle');
    if (!rifle) return;
    if (P.w !== rifle) { P.switchTo(P.arms.indexOf(rifle)); }
    if (P.reloadT > 0 || P.sprinting) return;
    const w = rifle, cur = w.ammo || 'std';
    if (cur === k) { this.hud.flash(`${AMMO_NAME[k]} ALREADY LOADED`, 'dim', 0.8); return; }
    if (k !== 'std' && !(X.pouch[k] > 0)) { this.hud.flash(`NO ${AMMO_NAME[k]} ROUNDS`, 'red'); return; }
    // What's in the gun goes back in the pouch.
    if (cur === 'std') w.reserve += w.mag + w.chamber; else X.pouch[cur] = Math.min(XR.max, X.pouch[cur] + w.mag + w.chamber);
    w.ammo = 'std'; w.xr = false;
    if (k === 'std') {
      w.mag = 0; w.chamber = 0;
      X.swap = { to: 'std' };
    } else {
      const n = Math.min(XR.mag, X.pouch[k]);
      X.pouch[k] -= n;
      // Hold the standard rounds aside so the reload doesn't top the marked mag up with them.
      w.mag = n; w.chamber = 0;
      X.swap = { to: k, reserve: w.reserve };
      w.reserve = 0;
    }
    P.reloadEmpty = true; P.reloadDur = XR.swap; P.reloadT = XR.swap; P.cycleT = 0; P.boltPending = false;
    this.hud.flash(`LOADING ${AMMO_NAME[k]} ROUNDS`, k === 'std' ? 'dim' : 'amber', 1.2);
    this.audio.click();
    this.sfx.ui(true);
  },

  // Every frame (all clients): swap completion, charges ticking and blowing.
  _xrTick(dt) {
    const X = this.xr;
    if (this.magEl) this._magPaint();
    if (X && X.swap && this.player.reloadT <= 0) {
      const w = this.player.arms.find((q) => q.def.slot === 'rifle');
      if (w && X.swap.to !== 'std') {
        w.reserve += X.swap.reserve || 0;
        if (w.chamber === 0 && w.mag > 0) { w.mag--; w.chamber = 1; }
        w.ammo = X.swap.to; w.xr = w.ammo === 'xr';
        this.hud.flash(`${AMMO_NAME[w.ammo]} ROUNDS LOADED`, 'amber', 1);
      } else if (w && w.mag === 0 && w.chamber === 0) {
        // The reload was cut short (sprint): load standard from the pouch now.
        const take = Math.min(w.def.mag, w.reserve); w.mag = take; w.reserve -= take;
        if (w.mag > 0) { w.mag--; w.chamber = 1; }
      }
      X.swap = null;
    }
    if (X && X.menu) { this._amT = (this._amT || 0) - dt; if (this._amT <= 0) { this._amT = 0.3; this._ammoPaint(); } }
    const S = this.sentinel;
    for (const c of this.xcharges) {
      c.t -= dt;
      if (c.id) {
        const e = S.byId(c.id);
        if (e) { c.x = e.x + c.ox; c.y = (e.y || 0) + c.oy; c.z = e.z + c.oz; }
      }
      if (!c.obj) {
        const g = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), new THREE.MeshBasicMaterial({ color: '#ff3020' }));
        g.renderOrder = 5;
        this.scene.add(g);
        c.obj = g;
      }
      c.obj.position.set(c.x, c.y, c.z);
      const on = (this.t * (c.t < 0.4 ? 14 : 6)) % 1 < 0.5;
      if (on && !c.on) this.audio.beep(c.obj.position, c.t < 0.4);
      c.on = on;
      c.obj.visible = on;
      if (c.t <= 0) this._xrBoom(c);
    }
    this.xcharges = this.xcharges.filter((c) => c.t > 0);
  },

  // A shot from the explosive mag landed: stick a charge there (and tell the other side).
  _xrStick(hitP, enemy) {
    const c = { cid: this._xcId++ + (this.isHost ? 0 : 5000), x: hitP.x, y: hitP.y, z: hitP.z, t: XR.fuse, by: this.role };
    if (enemy) { c.id = enemy.id; c.ox = hitP.x - enemy.x; c.oy = hitP.y - (enemy.y || 0); c.oz = hitP.z - enemy.z; }
    this.xcharges.push(c);
    this._broadcast({ k: 'xc', c: { cid: c.cid, x: c.x, y: c.y, z: c.z, id: c.id || 0, ox: c.ox || 0, oy: c.oy || 0, oz: c.oz || 0, by: c.by } });
  },
  _xrRemote(c) {
    this.xcharges.push({ ...c, id: c.id || null, t: XR.fuse });
  },

  _xrBoom(c) {
    if (c.obj) { this.scene.remove(c.obj); c.obj.geometry.dispose(); }
    const p = new THREE.Vector3(c.x, c.y, c.z);
    this._boom({ x: c.x, y: c.y - 1, z: c.z });
    this.effects.puff(p, 'metal', 2.5, 0.6);
    // Close to you: a shove of static and a little damage.
    const me = this.player.pos.distanceTo(p);
    if (me < 4 && !this.downed && !this.kia) this._damage(Math.round(35 * (1 - me / 4)), { x: p.x, z: p.z });
    if (!this.isHost) return;
    const S = this.sentinel;
    for (const e of [...S.guards, ...S.drones]) {
      if (e.state === 'dead' && !e.incap) continue;
      const d = Math.hypot(e.x - c.x, (e.y || 0) + (e.kind === 'g' ? 1 : 0) - c.y, e.z - c.z);
      const stuck = e.id === c.id;
      if (!stuck && d > XR.radius) continue;
      const dmg = stuck ? XR.direct : Math.round(XR.splash * (1 - d / XR.radius));
      if (dmg <= 0) continue;
      this._applyHit(e.id, dmg, 'explosive', { x: c.x, z: c.z }, c.by || 'shooter', false, 0);
    }
    S.noise({ x: c.x, y: c.y, z: c.z }, XR.noise, true);
  },

  // Supply crates top the pouch back up with one marked magazine.
  _xrResupply() {
    if (!this.xr || !(this.role === 'shooter' || this.operative)) return;
    for (const k of Object.keys(START)) this.xr.pouch[k] = Math.min(XR.max, this.xr.pouch[k] + Math.ceil(START[k] / 2));
  },
};

export function installXRounds(Cls) {
  for (const k of Object.keys(XRounds)) Cls.prototype[k] = XRounds[k];
}

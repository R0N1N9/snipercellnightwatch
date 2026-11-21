// Sniper Cell — the knife as a weapon you carry, and the weapon wheel.
//   Sniper:  PRIMARY (KR-50) · SECONDARY (K9 / M50) · KNIFE      keys 1 / 2 / 3, mouse wheel
//   Spotter: PRIMARY (binoculars, or the K9 SMG) · SECONDARY (P-9) · KNIFE   mouse wheel, X for binoculars
// Touch: tap the swap button for the next weapon; press and hold it for the weapon wheel
// (drag to a weapon and let go). With the knife out, fire swings it (V still stabs from any
// weapon).
import { Wheel } from './wheel.js';

const SLOT_NAME = { p: 'PRIMARY', s: 'SECONDARY', k: 'KNIFE' };

export const Melee = {
  _wpnInit() {
    this.knifeEq = false;
    this.wpnWheel = null;
    this._swHold = null;
    addEventListener('touchmove', (e) => {
      const W = this.wpnWheel, H = this._swHold;
      if (!W || !W.open || !H) return;
      const btn = document.querySelector('#touch [data-act="swap"]');
      for (const t of e.changedTouches) if (btn && t.identifier === btn._tid) W.point(t.clientX, t.clientY);
    }, { passive: true });
  },

  _wpnList() {
    const P = this.player;
    if (this.role === 'spotter' && !this.operative) return [this._spotBino() ? { k: 'p', label: 'BINOCULARS', icon: '◎' } : { k: 'p', label: 'K9', icon: '═' }, { k: 's', label: 'P-9', icon: '⌐' }, { k: 'k', label: 'KNIFE', icon: '⟋' }];
    const sec = P.arms[1] ? P.arms[1].def.short || P.arms[1].def.name : 'SIDEARM';
    return [{ k: 'p', label: (P.arms[0] && P.arms[0].def.short) || 'RIFLE', icon: '═' }, ...(P.arms[1] ? [{ k: 's', label: sec, icon: '⌐' }] : []), { k: 'k', label: 'KNIFE', icon: '⟋' }];
  },
  // Spotter with the binoculars as primary (the default) rather than the SMG.
  _spotBino() {
    return this.role === 'spotter' && !this.operative && !(this.loadout && this.loadout.spotter.primary === 'smg');
  },
  _wpnCur() {
    if (this.knifeEq) return 'k';
    if (this._spotBino()) return this.bino && this.bino.on ? 'p' : 's';
    const P = this.player, slot = P.switchT > 0 && P.pendingSlot >= 0 ? P.pendingSlot : P.slot; // mid-swap: where it's going
    return slot === 0 ? 'p' : 's';
  },
  _wpnNextK(dir = 1) {
    const L = this._wpnList(), i = L.findIndex((o) => o.k === this._wpnCur());
    return L[(i + dir + L.length) % L.length].k;
  },
  _wpnSelect(k) {
    if (k === this._wpnCur()) return;
    const P = this.player;
    this.knifeEq = k === 'k';
    if (this._spotBino()) {
      const want = k === 'p';
      if (!!this.bino.on !== want) this._binoToggle(want);
    } else if (k !== 'k') {
      if (this.bino && this.bino.on) this._binoToggle(false);
      const i = k === 'p' ? 0 : 1;
      if (!P.arms[i]) return;
      const to = P.switchT > 0 && P.pendingSlot >= 0 ? P.pendingSlot : P.slot;
      if (to === i) return;
      if (P.switchT > 0) { P.switchT = 0; P.pendingSlot = -1; } // already swapping: start over toward this one
      if (P.slot !== i) P.switchTo(i);
    }
    if (this.knifeEq) { if (this.bino && this.bino.on) this._binoToggle(false); this.audio.click(); this.hud.flash('KNIFE', 'dim', 0.6); }
  },

  // Per frame, after the other input handling and before the player update: weapon keys, the
  // mouse wheel, the touch swap button (tap / hold for the wheel), and the knife's fire.
  _wpnInput(dt, I, act, ok) {
    const P = this.player, spot = this.role === 'spotter' && !this.operative;
    const H = this._swHold;
    if (!ok) {
      if (H) { if (this.wpnWheel && this.wpnWheel.open) this.wpnWheel.cancel(); this._swHold = null; }
    } else {
      // Touch: tap = next weapon, hold = the weapon wheel.
      if (I.pressed('swap') && I.held('T:swap') && !H) this._swHold = { t0: performance.now() };
      else if (I.pressed('swap') && !I.held('T:swap')) this._wpnSelect(this._wpnNextK()); // mouse button 4
      if (this._swHold) {
        const S = this._swHold;
        if (I.held('T:swap')) {
          // Real time, so a slow frame rate doesn't stretch the hold.
          if (performance.now() - S.t0 > 350 && !(this.wpnWheel && this.wpnWheel.open)) this._wpnWheelOpen();
        } else {
          const W = this.wpnWheel;
          if (W && W.open) { const k = W.close(); if (k) this._wpnSelect(k); }
          else this._wpnSelect(this._wpnNextK());
          this._swHold = null;
        }
      }
      // Keys: the sniper's 1 / 2 / 3. (The spotter's number keys are console commands.)
      if (!spot && !this.operative && !(this.xr && this.xr.menu)) {
        if (I.pressed('Digit1')) this._wpnSelect('p');
        else if (I.pressed('Digit2')) this._wpnSelect('s');
        else if (I.pressed('Digit3') && !(I.held('ShiftLeft') || I.held('ShiftRight'))) this._wpnSelect('k');
      } else if (this.operative) {
        if (I.pressed('Digit1')) this._wpnSelect('p');
        else if (I.pressed('Digit2')) this._wpnSelect('s');
      }
      // Mouse wheel (not scoped): step through the weapons.
      if (!P.scoped && !(this.bino && this.bino.on && this.bino.k > 0.5) && (act.zoomIn || act.zoomOut) && !act.touchZoom) this._wpnSelect(this._wpnNextK(act.zoomIn ? -1 : 1));
    }
    // We own weapon selection now.
    act.slot1 = act.slot2 = act.swap = false;
    if (!P.scoped && !act.touchZoom) act.zoomIn = act.zoomOut = false;
    // Knife out: fire swings it; nothing else of the gun works.
    if (this.knifeEq) {
      if (act.fire && ok) this._melee();
      act.fire = act.fireHeld = act.scope = act.reload = false;
    }
  },

  _wpnWheelOpen() {
    const L = this._wpnList();
    const key = L.map((o) => o.k + o.label).join('|');
    if (!this.wpnWheel || this._wpnKey !== key) {
      if (this.wpnWheel) this.wpnWheel.el.remove();
      this.wpnWheel = new Wheel(L.map((o) => ({ k: o.k, label: o.label, group: 'cmd', icon: o.icon })), { id: 'cell-wpnwheel', centre: 'WEAPON', fallback: null });
      this._wpnKey = key;
    }
    const btn = document.querySelector('#touch [data-act="swap"]');
    const r = btn ? btn.getBoundingClientRect() : { left: innerWidth - 160, top: innerHeight / 2, width: 0, height: 0 };
    // Open it beside the button, kept on screen.
    const x = Math.min(innerWidth - 130, Math.max(130, r.left + r.width / 2 - 90)), y = Math.min(innerHeight - 130, Math.max(130, r.top + r.height / 2));
    this.wpnWheel.show(x, y, `NOW: ${SLOT_NAME[this._wpnCur()]}`);
    navigator.vibrate && navigator.vibrate(12);
  },

  // The knife held ready (when it isn't mid-swing): low right, edge forward, a slight bob.
  _wpnTick() {
    if (!this.knifeEq || this.knifeT > 0) return;
    const P = this.player, b = Math.sin((P.bobPhase || 0)) * 0.006 * Math.min(1, (P.speed || 0) / 3);
    this.knife.visible = this.viewmodelVisible !== false;
    this.knife.position.set(0.15, -0.2 + b, -0.3);
    this.knife.rotation.set(-0.85, 0.3, -0.25);
  },
};

export function installMelee(Cls) {
  Object.assign(Cls.prototype, Melee);
}

// Sniper Cell — the ping / request wheel.
// Laptop: tap V for a quick ping, hold V (or the middle mouse button) and flick the mouse
// toward an option, release to send. iPad: tap PING for a quick ping, hold it and drag your
// thumb, lift to send. On the tablet map: right-click or long-press a spot.
export const WHEEL = [
  { k: 'look', label: 'LOOK', group: 'comms', icon: '◎' },
  { k: 'enemy', label: 'ENEMY', group: 'comms', icon: '◆' },
  { k: 'move', label: 'MOVE', group: 'comms', icon: '➤' },
  { k: 'hold', label: 'HOLD', group: 'comms', icon: '✋' },
  { k: 'regroup', label: 'ON ME', group: 'comms', icon: '⬤' },
  { k: 'cover', label: 'COVER', group: 'comms', icon: '⛨' },
  { k: 'sync', label: 'SYNC', group: 'comms', icon: '⦿' },
  { k: 'perch', label: 'SNIPER POS', group: 'comms', icon: '⌖' },
  { k: 'supply', label: 'SUPPLY', group: 'req', icon: '▣' },
  { k: 'scan', label: 'SCAN', group: 'req', icon: '◉' },
  { k: 'emp', label: 'EMP', group: 'req', icon: 'ϟ' },
  { k: 'decoy', label: 'DECOY', group: 'req', icon: '♪' },
  { k: 'lights', label: 'LIGHTS', group: 'req', icon: '☾' },
  { k: 'drone', label: 'DRONE', group: 'req', icon: '✦' },
];

// items: the options ({ k, label, group, icon }); opts.id / opts.centre (the idle label) /
// opts.fallback (what close() returns with nothing picked).
export class Wheel {
  constructor(items = WHEEL, opts = {}) {
    const WHEEL = (this.list = items);
    this.centre = opts.centre || 'PING';
    this.fallback = opts.fallback === undefined ? 'look' : opts.fallback;
    const el = (this.el = document.createElement('div'));
    el.id = opts.id || 'cell-wheel';
    el.className = 'cell-wheel';
    const n = WHEEL.length;
    el.innerHTML = '<div class="cw-ring"></div>' + WHEEL.map((o, i) => {
      const a = (i / n) * Math.PI * 2 - Math.PI / 2;
      return `<div class="cw-item cw-${o.group}" data-i="${i}" style="--x:${Math.cos(a).toFixed(3)};--y:${Math.sin(a).toFixed(3)}"><i>${o.icon}</i><b>${o.label}</b></div>`;
    }).join('') + `<div class="cw-centre"><b class="cw-sel">${this.centre}</b><span class="cw-sub"></span></div>`;
    document.body.appendChild(el);
    this.items = [...el.querySelectorAll('.cw-item')];
    this.sel = -1;
    this.open = false;
  }

  // Open centred on a screen point; `sub` is a short line under the selection ("REQUEST → Rōnin").
  show(x, y, sub = '', labels = {}) {
    this.open = true;
    this.cx = x;
    this.cy = y;
    this.dx = this.dy = 0;
    this.sel = -1;
    this.el.style.left = x + 'px';
    this.el.style.top = y + 'px';
    this.el.classList.add('on');
    this.el.querySelector('.cw-sub').textContent = sub;
    this.items.forEach((it, i) => { it.querySelector('b').textContent = labels[this.list[i].k] || this.list[i].label; it.classList.remove('sel'); });
    this._paint();
  }

  // Relative motion (pointer-locked mouse).
  nudge(dx, dy) {
    this.dx = Math.max(-140, Math.min(140, this.dx + dx));
    this.dy = Math.max(-140, Math.min(140, this.dy + dy));
    this._pick();
  }
  // Absolute pointer position (touch / free cursor).
  point(x, y) {
    this.dx = x - this.cx;
    this.dy = y - this.cy;
    this._pick();
  }
  _pick() {
    const d = Math.hypot(this.dx, this.dy);
    if (d < 26) { this.sel = -1; this._paint(); return; }
    let a = Math.atan2(this.dy, this.dx) + Math.PI / 2;
    if (a < 0) a += Math.PI * 2;
    this.sel = Math.round((a / (Math.PI * 2)) * this.list.length) % this.list.length;
    this._paint();
  }
  _paint() {
    this.items.forEach((it, i) => it.classList.toggle('sel', i === this.sel));
    this.el.querySelector('.cw-sel').textContent = this.sel >= 0 ? this.items[this.sel].querySelector('b').textContent : this.centre;
  }

  // Close and return the chosen option ('look' when nothing was picked).
  close() {
    if (!this.open) return null;
    this.open = false;
    this.el.classList.remove('on');
    return this.sel >= 0 ? this.list[this.sel].k : this.fallback;
  }
  cancel() {
    this.open = false;
    this.el.classList.remove('on');
  }
}

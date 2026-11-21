import * as THREE from 'three';
import { UPLINK, ROUND, WEAPON } from './config.js';
import { TOOLS } from './tools.js';
const TOOL_SHORT = Object.fromEntries(Object.entries(TOOLS).map(([k, t]) => [k, t.short]));

const $ = (id) => document.getElementById(id);
const MONO = "'JetBrains Mono', ui-monospace, Menlo, monospace";
const COL = {
  ink: 'rgba(232,230,240,0.92)',
  amber: '#f2b35b',
  me: '#62d9e8',
  them: '#ff5d55',
};

export class Hud {
  constructor() {
    this.root = $('hud');
    this.scope = $('scope');
    this.sctx = this.scope.getContext('2d');
    this.compass = $('compass');
    this.cctx = this.compass.getContext('2d');
    this.el = {
      timer: $('h-timer'),
      score: $('h-score'),
      round: $('h-round'),
      phase: $('h-phase'),
      hp: $('h-hp'),
      hpNum: $('h-hpnum'),
      ammo: $('h-ammo'),
      zero: $('h-zero'),
      stance: $('h-stance'),
      msg: $('h-msg'),
      sub: $('h-sub'),
      center: $('h-center'),
      hit: $('h-hit'),
      dmg: $('h-dmg'),
      dmgDir: $('h-dmgdir'),
      uplinks: $('h-uplinks'),
      breath: $('h-breath'),
      breathFill: $('h-breath-fill'),
      scopeInfo: $('h-scopeinfo'),
      markers: $('h-markers'),
      card: $('h-card'),
      ping: $('h-ping'),
      hint: $('h-hint'),
      practice: $('h-practice'),
    };
    this.scopeKey = '';
    this.msgT = 0;
    this.markers = [];
    this.uplinkEls = [];
    for (const [n, label] of [['A', 'TOWN'], ['B', 'DAM'], ['C', 'LIFT']]) {
      const d = document.createElement('div');
      d.className = 'uplink';
      d.innerHTML = `<div class="dia"><svg viewBox="0 0 40 40"><rect x="9" y="9" width="22" height="22" transform="rotate(45 20 20)" class="bg"/><rect x="9" y="9" width="22" height="22" transform="rotate(45 20 20)" class="prog" pathLength="100" stroke-dasharray="100" stroke-dashoffset="100"/></svg><b>${n}</b></div><span>${label}</span>`;
      this.el.uplinks.appendChild(d);
      this.uplinkEls.push(d);
    }
    this.hpSegs = [];
    for (let i = 0; i < 10; i++) {
      const s = document.createElement('i');
      this.el.hp.appendChild(s);
      this.hpSegs.push(s);
    }
    this._ammoKey = '';
    this._scoreKey = '';
    addEventListener('resize', () => (this.scopeKey = ''));
  }

  show(v) {
    this.root.classList.toggle('on', v);
  }

  message(text, sub = '', dur = 3) {
    this.el.msg.textContent = text;
    this.el.msg.style.display = text ? '' : 'none';
    this.el.sub.textContent = sub;
    this.el.center.classList.add('on');
    this.msgT = dur;
  }

  hitMarker(head) {
    this.el.hit.classList.remove('on', 'head');
    void this.el.hit.offsetWidth;
    this.el.hit.classList.add('on');
    if (head) this.el.hit.classList.add('head');
  }

  damage(fromAngle) {
    for (const el of [this.el.dmg, this.el.dmgDir]) {
      el.classList.remove('on');
      void el.offsetWidth;
      el.classList.add('on');
    }
    this.el.dmgDir.style.transform = `translate(-50%,-50%) rotate(${fromAngle}rad)`;
  }

  card(html, dur = 0) {
    this.el.card.innerHTML = html;
    this.el.card.classList.toggle('on', !!html);
    this.cardT = dur;
  }

  addMarker(pos, label, cls, life) {
    const el = document.createElement('div');
    el.className = 'marker ' + cls;
    el.innerHTML = `<i></i><b></b>`;
    this.el.markers.appendChild(el);
    this.markers.push({ pos: pos.clone(), el, life, age: 0, label });
  }

  clearMarkers() {
    for (const m of this.markers) m.el.remove();
    this.markers.length = 0;
  }

  update(dt, g) {
    const { player, camera } = g;
    if (this.msgT > 0) {
      this.msgT -= dt;
      if (this.msgT <= 0) this.el.center.classList.remove('on');
    }
    if (this.cardT > 0) {
      this.cardT -= dt;
      if (this.cardT <= 0) this.card('');
    }
    this.el.timer.textContent = g.timerText();
    this.el.round.textContent = g.roundText();
    this.el.phase.textContent = g.phaseText();
    this.el.ping.textContent = g.net && g.net.open && !g.net.isBot ? `LINK ${Math.round(g.net.rtt)} MS` : '';
    this._score(g);
    // Vitals
    const hp = Math.max(0, player.hp);
    const segs = Math.ceil(hp / 10);
    this.hpSegs.forEach((s, i) => (s.className = i < segs ? (hp <= 30 ? 'on low' : 'on') : ''));
    this.el.hpNum.textContent = String(Math.round(hp)).padStart(3, '0');
    const W = player.w, D = player.def;
    const ak = `${D.key}/${W.mag}/${W.chamber}/${W.reserve}/${player.reloadT > 0}/${player.boltT > 0}/${player.switchT > 0}`;
    if (ak !== this._ammoKey) {
      this._ammoKey = ak;
      const chamber = `<i class="ch${W.chamber ? ' on' : ''}" title="chambered"></i>`;
      let mag;
      if (D.mag <= 10) {
        mag = '';
        for (let i = 0; i < D.mag; i++) mag += `<i class="${i < W.mag ? 'on' : ''}"></i>`;
      } else mag = `<b>${String(W.mag).padStart(2, '0')}</b>`;
      this.el.ammo.innerHTML = player.switchT > 0
        ? `<em>SWITCHING</em>`
        : player.reloadT > 0
        ? `<em>${player.reloadEmpty ? 'RELOAD · CHAMBERING' : 'RELOADING'}</em>`
        : `<span class="pips${player.boltT > 0 ? ' cyc' : ''}">${chamber}<span class="sep"></span>${mag}</span><span class="res">${String(W.reserve).padStart(2, '0')}</span>`;
      document.getElementById('h-wname').textContent = (player.pollo && D.slot === 'rifle' ? '🐔 POLLO HERMANO · YELLOW CHICKENS' : `${D.name} · ${D.caliber}`).toUpperCase();
    }
    this.el.zero.textContent = D.scope ? `ZERO ${player.zero} M · ${player.zoom}×` : 'IRON SIGHTS · 1 / 2 SWAP';
    this.el.stance.textContent = ['STANDING', 'CROUCHED', 'PRONE'][player.stance] + (player.bipod ? ' · BIPOD DOWN' : '') + (player.wounded ? ' · WOUNDED' : '');
    this.el.breath.classList.toggle('on', player.scopeT > 0.9);
    this.el.breathFill.style.transform = `scaleX(${player.breath})`;
    this.el.breath.classList.toggle('lock', player.breathLock > 0);
    g.uplinkState.forEach((u, i) => {
      const el = this.uplinkEls[i];
      el.className = 'uplink' + (u.owner === g.me ? ' mine' : u.owner === 1 - g.me ? ' theirs' : '') + (u.enemyHacking ? ' alert' : '') + (g.hacking === i ? ' hacking' : '');
      el.querySelector('.prog').style.strokeDashoffset = `${100 * (1 - u.progress / UPLINK.hackTime)}`;
    });
    this._tools(g);
    this._drawScope(g.replay.active ? { scopeT: g.replay.scopeView ? 1 : 0 } : (g.tools && g.tools.thermalActive()) || !player.def.scope ? { scopeT: 0 } : player, camera);
    this._drawCompass(player, g);
    const v = new THREE.Vector3();
    for (let i = this.markers.length - 1; i >= 0; i--) {
      const m = this.markers[i];
      m.age += dt;
      if (m.age > m.life) { m.el.remove(); this.markers.splice(i, 1); continue; }
      v.copy(m.pos).project(camera);
      const behind = v.z > 1;
      const x = (v.x * 0.5 + 0.5) * innerWidth, y = (-v.y * 0.5 + 0.5) * innerHeight;
      m.el.style.display = behind ? 'none' : '';
      m.el.style.transform = `translate(${x}px, ${y}px)`;
      m.el.style.opacity = Math.min(1, (m.life - m.age) * 1.5);
      m.el.querySelector('b').textContent = `${m.label} ${Math.round(m.pos.distanceTo(camera.position))}M`;
    }
  }

  _tools(g) {
    const T = g.tools;
    if (!T) return;
    const L = T.loadout, C = T.charges;
    const chip = (key, tool) => {
      const n = C[tool] ?? 0;
      return `<span class="chip${n ? '' : ' empty'}"><kbd>${key}</kbd>${TOOL_SHORT[tool]} ×${n}</span>`;
    };
    const stealth = L.stealth === 'jammer' ? `${TOOL_SHORT.jammer} ${T.jammer ? 'READY' : 'USED'}` : TOOL_SHORT[L.stealth];
    const sup = g.supply ? g.supply.status : 'READY';
    const cooling = /S$/.test(sup);
    const html = chip('T', L.scout) + chip('G', L.tactical) + `<span class="chip${cooling ? ' empty' : ''}"><kbd>V</kbd>SUPPLY ${sup}</span>` + `<span class="chip passive">${stealth}</span>`;
    const ps2 = document.getElementById('pill-supply');
    if (ps2) {
      const t = sup === 'READY' ? 'SUPPLY' : cooling ? `SUPPLY ${sup.toLowerCase()}` : 'SUPPLY …';
      if (ps2.textContent !== t) ps2.textContent = t;
      ps2.classList.toggle('empty', cooling);
    }
    if (html !== this._toolsHtml) {
      this._toolsHtml = html;
      document.getElementById('h-tools').innerHTML = html;
      const ps = document.getElementById('pill-scout'), pt = document.getElementById('pill-tact'), sw = document.getElementById('pill-swap');
      if (ps) {
        ps.textContent = `${TOOL_SHORT[L.scout]} ×${C[L.scout] ?? 0}`;
        pt.textContent = `${TOOL_SHORT[L.tactical]} ×${C[L.tactical] ?? 0}`;
        ps.classList.toggle('empty', !C[L.scout]);
        pt.classList.toggle('empty', !C[L.tactical]);
      }
    }
    const sw = document.getElementById('pill-swap');
    if (sw) {
      const lbl = g.player.slot === 0 ? 'SECONDARY' : 'PRIMARY'; // names the weapon you'd swap to
      if (sw.textContent !== lbl) sw.textContent = lbl;
      const pf = document.getElementById('pill-feed');
      pf.classList.toggle('live', T.feedWindow > 0 || T.feed > 0);
    }
    const dr = T.drone, el = document.getElementById('h-drone');
    const feed = T.feed > 0;
    el.classList.toggle('on', !!dr || feed);
    this.root.classList.toggle('droneview', !!dr || feed);
    if (feed) {
      const tgt = T.feedTarget;
      const rng = tgt ? Math.round(T.predatorPos(g.roundTime).distanceTo(tgt)) : 0;
      el.innerHTML = `<b>● MQ-9 · LIVE FEED</b><span>TRACKING</span><span>SLANT ${rng}m</span><span>${Math.ceil(T.feed)}s</span><em>U exit</em>`;
    } else if (T.feedWindow > 0) {
      el.classList.add('on');
      el.innerHTML = `<b>● PREDATOR FEED AVAILABLE</b><em>press U to tune in · ${Math.ceil(T.feedWindow)}s</em>`;
    }
    if (dr) {
      const dist = Math.round(Math.hypot(dr.pos.x - g.player.pos.x, dr.pos.z - g.player.pos.z));
      const alt = Math.round(dr.pos.y - g.world.heightAt(dr.pos.x, dr.pos.z));
      el.innerHTML = `<b>● DRONE · THERMAL</b><span>BAT ${Math.ceil(dr.battery)}s</span><span>RNG ${dist}m</span><span>ALT ${alt}m</span><span>${dr.zoom > 1 ? '3×' : '1×'}</span><em>T return · click to mark</em>`;
    }
  }

  _score(g) {
    const key = `${g.mode}|${g.scores}|${g.name}|${g.oppName}`;
    if (key === this._scoreKey) return;
    this._scoreKey = key;
    if (g.mode === 'practice') {
      this.el.score.innerHTML = `<div class="row me"><span class="nm">${esc(g.name)}</span><span class="tag">SOLO</span></div>`;
      return;
    }
    const pips = (n, cls) => {
      let s = '';
      for (let i = 0; i < ROUND.winsToMatch; i++) s += `<i class="${i < n ? 'on ' + cls : ''}"></i>`;
      return s;
    };
    this.el.score.innerHTML =
      `<div class="row me"><span class="nm">${esc(g.name)}</span><span class="pp">${pips(g.scores[g.me], 'me')}</span></div>` +
      `<div class="row them"><span class="nm">${esc(g.oppName)}</span><span class="pp">${pips(g.scores[1 - g.me], 'them')}</span></div>`;
  }

  _drawScope(player, camera) {
    const on = player.scopeT > 0.02;
    this.scope.style.display = on ? 'block' : 'none';
    this.el.scopeInfo.classList.toggle('on', player.scopeT > 0.9 && player.zero !== undefined);
    this.root.classList.toggle('scoped', player.scopeT > 0.5);
    if (!on) return;
    const w = innerWidth, h = innerHeight;
    const dpr = Math.min(devicePixelRatio, 2);
    this.scope.style.opacity = Math.min(1, player.scopeT * 1.5);
    const key = `${w}x${h}@${camera.fov.toFixed(2)}:${player.scopeT.toFixed(2)}:${!!player.killflash}`;
    if (key === this.scopeKey) return;
    this.scopeKey = key;
    if (this.scope.width !== Math.round(w * dpr)) {
      this.scope.width = Math.round(w * dpr);
      this.scope.height = Math.round(h * dpr);
    }
    const c = this.sctx;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, w, h);
    const cx = w / 2, cy = h / 2;
    const R = Math.min(w, h) * 0.48 * (0.9 + 0.1 * player.scopeT) * (player.killflash ? 0.78 : 1);
    c.fillStyle = '#050508';
    c.beginPath();
    c.rect(0, 0, w, h);
    c.arc(cx, cy, R, 0, Math.PI * 2, true);
    c.fill('evenodd');
    const edge = c.createRadialGradient(cx, cy, R * 0.7, cx, cy, R);
    edge.addColorStop(0, 'rgba(0,0,0,0)');
    edge.addColorStop(0.75, 'rgba(8,10,24,0.35)');
    edge.addColorStop(0.95, 'rgba(0,0,0,0.92)');
    edge.addColorStop(1, 'rgba(0,0,0,1)');
    c.fillStyle = edge;
    c.beginPath();
    c.arc(cx, cy, R, 0, Math.PI * 2);
    c.fill();
    if (player.killflash) {
      // Honeycomb anti-reflection device: darker, slightly hazy image.
      c.fillStyle = 'rgba(0,0,0,0.28)';
      c.beginPath();
      c.arc(cx, cy, R, 0, Math.PI * 2);
      c.fill();
    }
    c.lineWidth = 1;
    c.strokeStyle = 'rgba(140,170,255,0.18)';
    c.beginPath(); c.arc(cx, cy, R - 1.5, 0, Math.PI * 2); c.stroke();

    // Reticle: 1 mil = 1/1000 rad at the current FOV.
    const fov = THREE.MathUtils.degToRad(camera.fov);
    const mil = ((h / 2) / Math.tan(fov / 2)) * 0.001;
    const ink = 'rgba(6,6,10,0.95)';
    c.strokeStyle = ink;
    c.fillStyle = ink;
    const post = Math.min(12 * mil, R * 0.55);
    c.lineWidth = 3.5;
    c.beginPath();
    c.moveTo(cx - R, cy); c.lineTo(cx - post, cy);
    c.moveTo(cx + post, cy); c.lineTo(cx + R, cy);
    c.moveTo(cx, cy + post); c.lineTo(cx, cy + R);
    c.moveTo(cx, cy - R); c.lineTo(cx, cy - post);
    c.stroke();
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(cx - post, cy); c.lineTo(cx + post, cy);
    c.moveTo(cx, cy - post); c.lineTo(cx, cy + post);
    c.stroke();
    c.font = `500 ${mil > 9 ? 10 : 9}px ${MONO}`;
    c.textBaseline = 'middle';
    c.textAlign = 'left';
    for (let m = 1; m <= 12; m++) {
      const d = m * mil;
      if (d > post) break;
      const big = m % 2 === 0;
      if (mil < 3.5 && !big) continue;
      const len = big ? 6 : 3;
      c.beginPath();
      c.moveTo(cx - len, cy + d); c.lineTo(cx + len, cy + d);
      c.moveTo(cx + d, cy - len); c.lineTo(cx + d, cy + len);
      c.moveTo(cx - d, cy - len); c.lineTo(cx - d, cy + len);
      c.moveTo(cx - len * 0.6, cy - d); c.lineTo(cx + len * 0.6, cy - d);
      c.stroke();
      if (big && mil > 4.5) c.fillText(String(m), cx + 9, cy + d);
    }
    c.fillStyle = 'rgba(255,70,50,0.95)';
    c.beginPath();
    c.moveTo(cx, cy - 0.5); c.lineTo(cx - 3, cy + 4); c.lineTo(cx + 3, cy + 4);
    c.closePath();
    c.fill();
    c.strokeStyle = 'rgba(232,230,240,0.22)';
    for (let a = 0; a < 360; a += 10) {
      const r = (a * Math.PI) / 180;
      const l = a % 90 === 0 ? 10 : 4;
      c.beginPath();
      c.moveTo(cx + Math.cos(r) * (R + 4), cy + Math.sin(r) * (R + 4));
      c.lineTo(cx + Math.cos(r) * (R + 4 + l), cy + Math.sin(r) * (R + 4 + l));
      c.stroke();
    }
  }

  _drawCompass(player, g) {
    const c = this.cctx;
    const dpr = Math.min(devicePixelRatio, 2);
    const W = this.compass.clientWidth || 480, H = 34;
    if (this.compass.width !== Math.round(W * dpr)) {
      this.compass.width = Math.round(W * dpr);
      this.compass.height = Math.round(H * dpr);
    }
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, W, H);
    const bearing = ((Math.atan2(-Math.sin(player.yaw), -Math.cos(player.yaw)) * 180) / Math.PI + 360) % 360;
    const span = 110;
    const px = W / span;
    const fade = (x) => Math.max(0, 1 - Math.pow(Math.abs(x - W / 2) / (W / 2), 2.2));
    c.font = `600 11px ${MONO}`;
    c.textAlign = 'center';
    c.textBaseline = 'alphabetic';
    for (let d = Math.floor(bearing - span / 2); d <= bearing + span / 2; d++) {
      if (d % 5 !== 0) continue;
      const x = W / 2 + (d - bearing) * px;
      const bb = ((d % 360) + 360) % 360;
      const a = fade(x);
      const card = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' }[bb];
      const major = bb % 15 === 0;
      c.strokeStyle = `rgba(232,230,240,${0.55 * a})`;
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(Math.round(x) + 0.5, H - 2);
      c.lineTo(Math.round(x) + 0.5, H - (major ? 9 : 5));
      c.stroke();
      if (card || (major && Math.abs(x - W / 2) > 26)) {
        c.fillStyle = card ? `rgba(242,179,91,${a})` : `rgba(232,230,240,${0.6 * a})`;
        c.fillText(card || String(bb).padStart(3, '0'), x, 12);
      }
    }
    const eye = g.camera.position;
    g.world.uplinks.forEach((u, i) => {
      const ub = ((Math.atan2(u.pos.x - eye.x, u.pos.z - eye.z) * 180) / Math.PI + 360) % 360;
      const rel = ((ub - bearing + 540) % 360) - 180;
      if (Math.abs(rel) > span / 2) return;
      const x = W / 2 + rel * px;
      const st = g.uplinkState[i];
      const col = st.owner === g.me ? COL.me : st.owner === 1 - g.me ? COL.them : COL.ink;
      c.save();
      c.globalAlpha = 0.4 + 0.6 * fade(x);
      c.translate(x, 22);
      c.rotate(Math.PI / 4);
      c.strokeStyle = col;
      c.lineWidth = 1.2;
      c.strokeRect(-4.5, -4.5, 9, 9);
      c.restore();
      c.fillStyle = col;
      c.font = `700 8px ${MONO}`;
      c.fillText(u.name, x, 25);
      c.font = `600 11px ${MONO}`;
    });
    const txt = String(Math.round(bearing) % 360).padStart(3, '0');
    c.fillStyle = 'rgba(8,8,14,0.85)';
    c.fillRect(W / 2 - 19, 0, 38, 16);
    c.strokeStyle = COL.amber;
    c.strokeRect(W / 2 - 18.5, 0.5, 37, 15);
    c.fillStyle = COL.amber;
    c.fillText(txt, W / 2, 12);
    c.beginPath();
    c.moveTo(W / 2 - 4, 16); c.lineTo(W / 2 + 4, 16); c.lineTo(W / 2, 20);
    c.fill();
  }

  scopeInfo(player, rangeText) {
    const html = `<span>${player.zoom}×</span><span>ZERO ${player.zero}</span><span class="rng">${rangeText ? 'RNG ' + rangeText : 'RNG ----'}</span>`;
    if (html !== this._siHtml) {
      this._siHtml = html;
      this.el.scopeInfo.innerHTML = html;
    }
  }
}

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

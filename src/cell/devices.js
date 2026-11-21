// Sniper Cell — first-person handling of the kit that isn't a gun:
//   TABLET / MAP / ISR  the weapon drops away, the left hand brings the tablet up until it fills
//                       the view, the screen flickers on, and you're in the console (or the ISR feed)
//   RECON DRONE         the left hand tosses it up and out in front of you before the feed cuts in;
//                       recalling it flies it home with a RECALLING overlay on screen
//   BINOCULARS          the spotter's second "weapon" (2): held in both hands, low and centred;
//                       raise them (scope) for a thermal view that marks every enemy in the viewfinder
import * as THREE from 'three';
import { glove } from './nvg.js';

const ease = (x) => (x < 0 ? 0 : x > 1 ? 1 : x * x * (3 - 2 * x));
const lerp = (a, b, t) => a + (b - a) * t;

function tabletMesh() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.24, 0.016), new THREE.MeshLambertMaterial({ color: '#16181c', emissive: '#16181c', emissiveIntensity: 0.3 }));
  g.add(body);
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.33, 0.21), new THREE.MeshBasicMaterial({ color: '#000000' }));
  scr.position.z = 0.0085;
  g.add(scr);
  const hand = glove();
  hand.position.set(-0.18, -0.04, -0.02);
  hand.rotation.set(0.2, 0.3, 1.4);
  g.add(hand);
  g.userData = { scr };
  return g;
}

function binoMesh() {
  const g = new THREE.Group();
  const dark = new THREE.MeshLambertMaterial({ color: '#25282c', emissive: '#25282c', emissiveIntensity: 0.25 });
  for (const sx of [-0.042, 0.042]) {
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.036, 0.15, 14).rotateX(Math.PI / 2), dark);
    t.position.set(sx, 0, 0);
    g.add(t);
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.03, 16), new THREE.MeshBasicMaterial({ color: '#331a14' }));
    lens.position.set(sx, 0, -0.076);
    lens.rotation.y = Math.PI;
    g.add(lens);
  }
  const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.03, 0.09), dark);
  g.add(bridge);
  const pad = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.012, 0.05), new THREE.MeshLambertMaterial({ color: '#6b5e45' }));
  pad.position.set(0, 0.036, 0.02);
  g.add(pad);
  for (const s of [-1, 1]) {
    const h = glove();
    h.position.set(s * 0.085, -0.03, 0.04);
    h.rotation.set(0.2, -s * 0.5, s * 1.2);
    g.add(h);
  }
  return g;
}

function droneMesh() {
  const g = new THREE.Group();
  const m = new THREE.MeshLambertMaterial({ color: '#2a2e33', emissive: '#2a2e33', emissiveIntensity: 0.3 });
  g.add(new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.04, 0.12), m));
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.012, 0.014), m);
    arm.position.set(x * 0.07, 0, z * 0.07); arm.rotation.y = x * z > 0 ? -Math.PI / 4 : Math.PI / 4;
    g.add(arm);
    const rot = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.004, 14), new THREE.MeshBasicMaterial({ color: '#555b63', transparent: true, opacity: 0.6 }));
    rot.position.set(x * 0.1, 0.02, z * 0.1);
    g.add(rot);
  }
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.01, 6, 4), new THREE.MeshBasicMaterial({ color: '#ff3040' }));
  led.position.set(0, 0, -0.065);
  g.add(led);
  const h = glove();
  h.position.set(0.0, -0.035, 0.02);
  h.rotation.set(-0.6, 0, 0);
  g.add(h);
  return g;
}

function ROLES_COLOR_SAFE(r) { return r === 'shooter' ? '#f2b35b' : '#3fe0d0'; }

export const Devices = {
  // Head-mounted bodycams: both show as small squares in the ISR view; your partner's can be
  // pinned as a small square on your own screen (pause menu: Partner bodycam).
  _bcInit() {
    const el = (this.bcEl = document.createElement('div'));
    el.id = 'cell-bodycams';
    el.innerHTML = ['shooter', 'spotter'].map((r) => `<div class="bc" data-r="${r}"><canvas></canvas><i class="rec">\u25CF REC</i><b></b><s></s></div>`).join('');
    document.body.appendChild(el);
    // Shoulder-mounted, wide-angle (MW-style), not a copy of their eyes.
    this.bcCams = { shooter: new THREE.PerspectiveCamera(92, 16 / 10, 0.05, 900), spotter: new THREE.PerspectiveCamera(92, 16 / 10, 0.05, 900) };
    for (const c of Object.values(this.bcCams)) c.rotation.order = 'YXZ';
    this._bcT = 0;
  },
  _bcTick(dt) {
    if (!this.bcEl) this._bcInit();
    const isr = this.isr.active, show = { shooter: false, spotter: false };
    if (isr) { show.shooter = true; show.spotter = !this.operative; }
    else if (this.bodycamOn && !this.tablet.visible && !this.cine.active) show[this.partnerRole] = !this.operative;
    this.bcEl.classList.toggle('isr', isr);
    let any = false;
    for (const box of this.bcEl.children) { const on = show[box.dataset.r]; box.style.display = on ? '' : 'none'; any = any || on; }
    if (!any) return;
    this._bcPlaceT = (this._bcPlaceT || 0) - dt;
    if (!isr && this._bcPlaceT <= 0) { this._bcPlaceT = 0.5; this._bcPlace(); }
    else if (isr && this.bcEl.style.width) { this.bcEl.style.width = ''; this.bcEl.style.top = ''; this.bcEl.style.right = ''; this.bcEl.style.left = ''; }
    this._bcT -= dt;
    if (this._bcT > 0) return;
    this._bcT = 0.2; // ~5 fps: a bodycam, not a second screen
    for (const role of ['shooter', 'spotter']) {
      if (!show[role]) continue;
      const box = this.bcEl.querySelector(`[data-r="${role}"]`), cv = box.querySelector('canvas'), cam = this.bcCams[role];
      let p, yaw, pitch, st, alive = true;
      if (role === this.role) { const P = this.player; p = P.pos; yaw = P.yaw; pitch = P.pitch; st = P.stance; alive = !this.kia; }
      else { const Q = this.partner; if (!Q.seen) continue; p = Q.pos; yaw = Q.yaw; pitch = Q.pitch || 0; st = Q.st; alive = !Q.kia; }
      // Shoulder cam (MW-style): on the right shoulder strap, just above and behind the shoulder,
      // looking along their aim, so their shoulder, arm and weapon sit in the bottom of the frame.
      const sh = st === 2 ? 0.6 : st === 1 ? 1.3 : 1.68;
      cam.position.set(p.x, p.y + sh, p.z);
      const sway = Math.sin(this.t * 7) * 0.01;
      cam.rotation.set(pitch * 0.85 - 0.05, yaw + sway, sway * 0.5);
      cam.translateX(st === 2 ? 0.26 : 0.24);
      cam.translateZ(st === 2 ? 0.02 : 0.1);
      if (box.classList.contains('min')) { box.querySelector('b').textContent = `BODYCAM \u00B7 ${role === this.role ? this.name : this.partnerName} \u25B8`; continue; }
      const r = box.getBoundingClientRect();
      const w = Math.max(40, Math.round(r.width)), h = Math.max(30, Math.round(r.height));
      if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
      cam.aspect = w / h;
      cam.updateProjectionMatrix();
      box.querySelector('b').textContent = `BODYCAM \u00B7 ${role === this.role ? this.name : this.partnerName}${alive ? '' : ' \u00B7 NO SIGNAL'}`;
      box.querySelector('s').textContent = this._bcStamp();
      if (!alive || box.classList.contains('min')) continue;
      // Keep the wearer in shot (shoulder, arm, weapon) but drop the head so it doesn't fill
      // the left of the frame.
      const av = role === this.role ? null : this.partner.avatar;
      const was = av && av.neck && av.neck.visible;
      if (av && av.neck) av.neck.visible = false;
      // Low-light sensor: a lot more gain than your eyes get.
      const R = this.renderer, ex = R.toneMappingExposure;
      R.toneMappingExposure = ex * 4;
      this._cornerRender(cam, w, h, cv, cv.getContext('2d'));
      R.toneMappingExposure = ex;
      if (av && av.neck) av.neck.visible = was;
    }
  },
  _bcStamp() {
    const s = Math.floor(this.t), z = (n) => String(n).padStart(2, '0');
    return `${z(2 + Math.floor(s / 3600) % 24)}:${z(Math.floor(s / 60) % 60)}:${z(s % 60)}`;
  },
  // Your partner's bodycam: top right, under the partner card, shrunk (or moved left) until it
  // clears every button and HUD block it would sit on.
  _bcPlace() {
    const el = this.bcEl, W = innerWidth, H = innerHeight;
    const card = document.querySelector('#cell-hud .c-partner');
    const cr = card && card.getBoundingClientRect();
    const top = Math.round(cr && cr.height ? cr.bottom + 8 : 60);
    const avoid = [...document.querySelectorAll('#touch .tb, #touch .pill, #touch .stick, #touch .cell-abil .ab, #cell-hud .c-ammo, #cell-hud .c-pip, #cell-hud .c-obj, #cell-hud .c-kit, #cell-hud .c-chips')]
      .map((e) => e.getClientRects().length ? e.getBoundingClientRect() : null)
      .filter((r) => r && r.width > 0 && r.height > 0);
    const hits = (x, y, w, h) => avoid.some((r) => x < r.right + 4 && x + w > r.left - 4 && y < r.bottom + 4 && y + h > r.top - 4);
    const right = 12;
    let w = Math.min(240, W * 0.26), ok = false;
    for (; w >= 104; w *= 0.9) {
      const h = w / 1.6;
      if (top + h < H - 8 && !hits(W - right - w, top, w, h)) { ok = true; break; }
    }
    // Nothing fits on the right: try the top centre, just under the alarm bar.
    let left = null, t2 = top;
    if (!ok) {
      for (w = Math.min(200, W * 0.24); w >= 104; w *= 0.9) {
        const h = w / 1.6, x = W / 2 - w / 2 + W * 0.18, y = 58;
        if (!hits(x, y, w, h)) { ok = true; left = x; t2 = y; break; }
      }
    }
    if (!ok) w = 104;
    el.style.width = `${Math.round(w)}px`;
    el.style.top = `${t2}px`;
    if (left !== null) { el.style.left = `${Math.round(left)}px`; el.style.right = 'auto'; }
    else { el.style.left = ''; el.style.right = `${right}px`; }
  },

  _devInit() {
    const add = (o) => { o.visible = false; o.traverse((q) => { q.renderOrder = 13; q.frustumCulled = false; }); this.camera.add(o); return o; };
    this.devTablet = add(tabletMesh());
    this.devBino = add(binoMesh());
    this.devDrone = add(droneMesh());
    this.devAnim = null;
    this.bino = { on: false, k: 0 };
    this._nanoInit();
  },

  // Bring a device up, then run `then` (open the tablet, enter ISR, launch the drone).
  _raise(kind, then) {
    if (this.devAnim) return;
    if (this.tablet.visible || this.isr.active || this.downed || this.kia || (this.quad && this.quad.active)) { then(); return; }
    this.devAnim = { kind, t: 0, dur: kind === 'drone' ? 0.75 : 0.55, then };
    this.audio.nvgReach && this.audio.nvgReach();
  },

  // ---- nano drones (spotter, through the thermal binoculars) -----------------------------
  // Three nano drones that reload one at a time (15 s each). With the binoculars raised, tap
  // enemies (or fire on the one under the crosshair) to mark up to as many as you have drones;
  // SWARM (E on desktop) sends them, and each marked target drops silently ~1.5 s later.
  _nanoInit() {
    this.nano = { ch: 3, rl: 0, marks: [] };
    addEventListener('touchstart', (e) => {
      const B = this.bino;
      if (!B || !B.up || this.role !== 'spotter' || this.paused) return;
      const t = e.changedTouches[0];
      if (!t || (t.target.closest && t.target.closest('[data-act], .pill, .cell-abil'))) return;
      const g = this._nanoAt(t.clientX, t.clientY);
      if (!g) return;
      e.preventDefault(); e.stopPropagation();
      this._nanoMark(g.id);
    }, { capture: true, passive: false });
  },
  _nanoTargets() {
    const B = this.bino;
    return this.sentinel.guards.filter((g) => g.state !== 'dead' && B && B.seen && B.seen.has(g.id));
  },
  // The enemy drawn nearest a screen point (within ~60 px), or under the crosshair.
  _nanoAt(x, y) {
    const cam = this.camera, W = innerWidth, H = innerHeight, v = new THREE.Vector3();
    let best = null, bd = 60;
    for (const g of this._nanoTargets()) {
      v.set(g.x, (g.y || 0) + 1.2 * ((g.obj && g.obj.userData.scale) || 1), g.z).project(cam);
      if (v.z > 1) continue;
      const d = Math.hypot((v.x * 0.5 + 0.5) * W - x, (-v.y * 0.5 + 0.5) * H - y);
      if (d < bd) { bd = d; best = g; }
    }
    return best;
  },
  _nanoMark(id) {
    const N = this.nano, i = N.marks.indexOf(id);
    if (i >= 0) { N.marks.splice(i, 1); this.audio.click(); return; }
    if (N.marks.length >= N.ch) { this.hud.flash(N.ch ? `ONLY ${N.ch} NANO DRONE${N.ch > 1 ? 'S' : ''} READY` : 'NANO DRONES RELOADING', 'red', 0.8); return; }
    N.marks.push(id);
    this.audio.click();
    this.hud.flash(`MARKED ${N.marks.length}/${N.ch} · SWARM TO SEND`, 'cyan', 0.7);
  },
  _nanoSend() {
    const N = this.nano, S = this.sentinel;
    if (!N) return;
    N.marks = N.marks.filter((id) => { const g = S.byId(id); return g && g.state !== 'dead'; });
    if (!N.marks.length) { this.hud.flash(this.bino && this.bino.up ? 'MARK TARGETS FIRST (TAP THEM)' : 'RAISE THE BINOCULARS AND MARK TARGETS', 'red', 0.9); return; }
    const ids = N.marks.slice(0, N.ch);
    N.ch -= ids.length;
    N.marks = [];
    this.hud.flash(`NANO SWARM → ${ids.length} TARGET${ids.length > 1 ? 'S' : ''}`, 'cyan', 1.2);
    this._radio && this._radio(this.role, 'Swarm away.');
    const from = { x: this.player.pos.x, y: this.player.pos.y + 1.6, z: this.player.pos.z };
    this._swarmFx(ids, from);
    this.payload('swarm', { ids, from });
  },
  // ---- laser rangefinder, firing call and weak points (binoculars) ---------------------
  // What's under the binocular crosshair: an enemy (if one's close to the centre) or the ground.
  _lrfTarget() {
    const cam = this.camera, o = cam.getWorldPosition(new THREE.Vector3()), dir = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    const e = this._nanoAt ? this._nanoAt(innerWidth / 2, innerHeight / 2) : null;
    if (e) return { e, p: new THREE.Vector3(e.x, (e.y || 0) + 1.2, e.z), d: Math.hypot(e.x - o.x, (e.y || 0) + 1.2 - o.y, e.z - o.z) };
    const h = this.fac.ray(o, o.clone().addScaledVector(dir, 1200), 'shot');
    return h ? { e: null, p: h.point.clone(), d: h.point.distanceTo(o) } : null;
  },
  // R (or LASE on touch) through the binoculars: lase the target and give the sniper a firing
  // call — the range from the SNIPER's position, lead if it's walking, and "send it". A brute,
  // titan or the overseer also gets its weak points marked for both of you.
  _lase() {
    const B = this.bino;
    if (!B || !B.up) { this.hud.flash('RAISE THE BINOCULARS TO LASE', 'red', 0.8); return; }
    const T = this._lrfTarget();
    if (!T || !T.e) { this.hud.flash(T ? `RANGE ${Math.round(T.d)} m \u00B7 NO TARGET` : 'NO RETURN', 'dim', 0.8); return; }
    const e = T.e;
    this.sfx.ui(true);
    const sh = this.role === 'shooter' ? this.player.pos : this.partner && this.partner.seen ? this.partner.pos : null;
    const dS = sh ? Math.round(Math.hypot(e.x - sh.x, e.z - sh.z)) : Math.round(T.d);
    const heavy = e.type === 'jugg' || e.type === 'overseer' || e.type === 'titan';
    let lead = 'dead on';
    if (e.moving && sh) {
      const side = Math.sin(e.yaw) * (e.z - sh.z) - Math.cos(e.yaw) * (e.x - sh.x) > 0 ? 'left' : 'right';
      lead = `walking ${side}, lead him`;
    }
    const name = { guard: 'X-ray', scav: 'officer', bulwark: 'bulwark', jugg: 'brute', overseer: 'overseer', titan: 'titan' }[e.type] || 'X-ray';
    const line = `Target, ${name}. ${dS} meters. ${lead.charAt(0).toUpperCase() + lead.slice(1)}. Send it.`;
    this.hud.flash(`LASED ${Math.round(T.d)} m \u00B7 FIRING CALL SENT`, 'cyan', 1.2);
    this.comms(line, ROLES_COLOR_SAFE(this.role), this.name);
    this._voice && this._voice('me', line);
    const call = { id: e.id, d: dS, lead, heavy, line };
    this._onFireCall(call, true);
    this._broadcast({ k: 'fcall', ...call });
    // Solo with AI Ra: lasing it is the same as marking it for him.
    if (this.aiShoot && this._aiShooterCall) this._aiShooterCall('enemy', { x: e.x, z: e.z }, e.id);
  },
  _onFireCall(c, mine) {
    this.fcalls = this.fcalls || {};
    this.fcalls[c.id] = { d: c.d, lead: c.lead, t: 15 };
    if (c.heavy) { this.weak = this.weak || {}; this.weak[c.id] = 20; }
    if (!mine) {
      this.comms(c.line, '#ffd040', this.partnerName);
      this._voice && this._voice('partner', c.line);
      this.hud.flash(`FIRING CALL \u00B7 ${c.d} m \u00B7 ${c.lead.toUpperCase()}`, 'amber', 1.6);
    }
  },
  _fcallTick(dt) {
    for (const o of [this.fcalls, this.weak]) if (o) for (const k of Object.keys(o)) { if (o[k].t !== undefined) { o[k].t -= dt; if (o[k].t <= 0) delete o[k]; } else { o[k] -= dt; if (o[k] <= 0) delete o[k]; } }
  },
  // Markers for both players: the firing-call target (range + lead) and weak points on heavies.
  _fcallHud(c, proj) {
    const S = this.sentinel;
    c.save();
    c.font = '600 12px JetBrains Mono, monospace';
    c.textAlign = 'center';
    for (const [id, f] of Object.entries(this.fcalls || {})) {
      const e = S.byId(+id);
      if (!e || e.state === 'dead') continue;
      const p = proj(e.x, (e.y || 0) + 1.3, e.z);
      if (p.behind) continue;
      c.strokeStyle = '#ffd040'; c.lineWidth = 2;
      c.beginPath(); c.moveTo(p.x - 16, p.y); c.lineTo(p.x - 6, p.y); c.moveTo(p.x + 6, p.y); c.lineTo(p.x + 16, p.y); c.moveTo(p.x, p.y - 16); c.lineTo(p.x, p.y - 6); c.moveTo(p.x, p.y + 6); c.lineTo(p.x, p.y + 16); c.stroke();
      c.fillStyle = '#ffd040';
      c.fillText(`${f.d} m \u00B7 ${f.lead.toUpperCase()}`, p.x, p.y - 22);
    }
    for (const id of Object.keys(this.weak || {})) {
      const e = S.byId(+id);
      if (!e || e.state === 'dead') continue;
      const sc = (e.obj && e.obj.userData.scale) || 1;
      const spots = [[0, 1.68, -0.05, 'HEAD']];
      if (e.type === 'titan') spots.push([0, 1.36, 0.34, 'POWER PACK']);
      if (e.type === 'jugg' || e.type === 'overseer') spots.push([0, 1.3, 0.3, 'SPINE']);
      const cs = Math.cos(e.yaw), sn = Math.sin(e.yaw);
      for (const [lx, ly, lz, lab] of spots) {
        const wx = e.x + (lx * cs + lz * sn) * sc, wz = e.z + (-lx * sn + lz * cs) * sc;
        const p = proj(wx, (e.y || 0) + ly * sc, wz);
        if (p.behind) continue;
        const pulse = 9 + Math.sin(this.t * 6) * 2;
        c.strokeStyle = '#ffe14a'; c.lineWidth = 2;
        c.beginPath(); c.arc(p.x, p.y, pulse, 0, Math.PI * 2); c.stroke();
        c.fillStyle = 'rgba(255,225,74,0.9)'; c.font = '600 10px JetBrains Mono, monospace';
        c.fillText(`WEAK \u00B7 ${lab}`, p.x, p.y + pulse + 12);
      }
    }
    c.restore();
  },

  // The swarm itself: a cloud of tiny glints per target that streams out and wraps the head.
  _swarmFx(ids, from) {
    this.swarms = this.swarms || [];
    for (const id of ids) {
      const n = 40, pos = new Float32Array(n * 3), seeds = [];
      for (let i = 0; i < n; i++) seeds.push([Math.random() * 6.28, Math.random() * 6.28, 0.4 + Math.random() * 0.6, Math.random() * 0.25]);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: '#9fe8ff', size: 0.05, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending }));
      pts.frustumCulled = false;
      this.scene.add(pts);
      this.swarms.push({ id, from: new THREE.Vector3(from.x, from.y, from.z), pts, seeds, t: 0 });
    }
  },
  _swarmTick(dt) {
    const N = this.nano;
    if (N && N.ch < 3) { N.rl += dt; if (N.rl >= 15) { N.rl = 0; N.ch++; } }
    if (!this.swarms || !this.swarms.length) return;
    const S = this.sentinel, v = new THREE.Vector3();
    for (const w of this.swarms) {
      w.t += dt;
      const g = S.byId(w.id);
      const to = g ? new THREE.Vector3(g.x, (g.y || 0) + 1.6 * (S.constructor.TYPES ? 1 : 1), g.z) : w.from;
      const a = w.pts.geometry.attributes.position.array;
      w.seeds.forEach(([p1, p2, sp, lag], i) => {
        const k = Math.min(1, Math.max(0, (w.t - lag) / 1.4)), e = k * k * (3 - 2 * k);
        v.copy(w.from).lerp(to, e);
        v.y += Math.sin(e * Math.PI) * 2.5; // arc up and over
        const r = k < 1 ? 0.35 * (1 - e) + 0.12 : 0.18;
        v.x += Math.cos(p1 + w.t * 9 * sp) * r; v.y += Math.sin(p2 + w.t * 7 * sp) * r * 0.7; v.z += Math.sin(p1 + w.t * 9 * sp) * r;
        a[i * 3] = v.x; a[i * 3 + 1] = v.y; a[i * 3 + 2] = v.z;
      });
      w.pts.geometry.attributes.position.needsUpdate = true;
      w.pts.material.opacity = w.t > 2.0 ? Math.max(0, 0.9 - (w.t - 2.0) * 1.5) : 0.9;
    }
    for (const w of this.swarms) if (w.t > 2.6) { this.scene.remove(w.pts); w.pts.geometry.dispose(); w.pts.material.dispose(); }
    this.swarms = this.swarms.filter((w) => w.t <= 2.6);
  },

  _devTick(dt) {
    this._swarmTick(dt);
    this._fcallTick(dt);
    this._bcTick(dt);
    const A = this.devAnim, T = this.devTablet, D = this.devDrone;
    T.visible = false; D.visible = false;
    if (A) {
      A.t += dt;
      const u = Math.min(1, A.t / A.dur);
      if (A.kind === 'drone') {
        // Up from the hip in the left hand, a beat, then tossed up and forward.
        D.visible = true;
        const lift = ease(u / 0.45), toss = ease((u - 0.5) / 0.5);
        D.position.set(lerp(-0.25, -0.12, lift) + toss * 0.05, lerp(-0.42, -0.2, lift) + toss * 0.35, lerp(-0.45, -0.42, lift) - toss * 0.9);
        D.rotation.set(-0.3 + toss * 0.4, 0.2, 0.1 + toss * 0.3);
        D.children[D.children.length - 1].visible = u < 0.62; // the hand lets go
        if (u > 0.55 && !A.whir) { A.whir = true; this.audio.startLoop && this.audio.startLoop('quad', this.camera.position.clone(), 'rotor', 0.22); }
      } else {
        // Tablet: up from low left, turning to face you, filling the view; then the screen lights.
        T.visible = true;
        const k = ease(u / 0.8);
        T.position.set(lerp(-0.3, 0, k), lerp(-0.42, 0, k), lerp(-0.5, -0.215, k));
        T.rotation.set(lerp(-1.1, 0, k), lerp(0.5, 0, k), lerp(0.4, 0, k));
        const on = u > 0.72 ? ((u * 30) % 1 < 0.6 ? 1 : 0.3) * ease((u - 0.72) / 0.28) : 0;
        T.userData.scr.material.color.setRGB(0.02 + 0.1 * on, 0.1 + 0.6 * on, 0.12 + 0.55 * on);
        if (u > 0.72 && !A.click) { A.click = true; this.audio.click(); }
      }
      if (u >= 1) { this.devAnim = null; T.visible = false; D.visible = false; A.then(); }
    }
    // Binoculars: low and centred in both hands; raised to the eyes when you scope.
    const B = this.bino, Bm = this.devBino;
    const wantUp = B.on && this.player.scoped;
    B.k += ((wantUp ? 1 : 0) - B.k) * Math.min(1, dt * 9);
    Bm.visible = B.on && !this.devAnim && !this.tablet.visible && !this.isr.active && !(this.quad && this.quad.active) && !this.downed && B.k < 0.92;
    const bob = Math.sin(this.t * 1.6) * 0.003 + (this.player.moving ? Math.sin(this.player.bobPhase || 0) * 0.008 : 0);
    Bm.position.set(0, lerp(-0.2, -0.02, B.k) + bob, lerp(-0.34, -0.12, B.k));
    Bm.rotation.set(lerp(0.25, 0, B.k), 0, 0);
    // Drone recall: fly it home.
    const q = this.quad;
    if (q && q.recall) {
      const R = q.recall;
      R.t += dt;
      const u = Math.min(1, R.t / R.dur), e = ease(u);
      const P = this.player.pos;
      q.x = lerp(R.from.x, P.x, e); q.z = lerp(R.from.z, P.z, e); q.y = lerp(R.from.y, P.y + 1.4, e) + Math.sin(u * Math.PI) * 3;
      this.audio.updateLoop && this.audio.updateLoop('quad', new THREE.Vector3(q.x, q.y, q.z));
      this.quadObj.visible = u < 0.96;
      this.quadObj.position.set(q.x, q.y, q.z);
      if (u >= 1) this._endQuad(false, true);
    }
  },

  // HUD over the first-person view: the recall overlay.
  _devHud(c, W, H) {
    const q = this.quad;
    if (!(q && q.recall)) return;
    const u = Math.min(1, q.recall.t / q.recall.dur);
    c.save();
    c.fillStyle = `rgba(255,40,60,${(0.08 * (1 - u)).toFixed(3)})`;
    c.fillRect(0, 0, W, H);
    for (let y = (this.t * 140) % 6; y < H; y += 6) { c.fillStyle = 'rgba(255,80,100,0.05)'; c.fillRect(0, y, W, 1); }
    const cx = W / 2, cy = H * 0.3, r = 26;
    c.strokeStyle = 'rgba(255,90,110,0.35)'; c.lineWidth = 3;
    c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.stroke();
    c.strokeStyle = 'rgba(255,90,110,0.95)';
    c.beginPath(); c.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + u * Math.PI * 2); c.stroke();
    c.fillStyle = 'rgba(255,120,140,0.95)'; c.font = '700 13px JetBrains Mono, monospace'; c.textAlign = 'center';
    c.fillText('RECALLING DRONE', cx, cy + r + 20);
    c.font = '600 10px JetBrains Mono, monospace';
    c.fillText(`${Math.round(u * 100)} %`, cx, cy + 4);
    c.restore();
    c.lineWidth = 1;
  },

  // ---- binoculars ------------------------------------------------------------------------
  // An SMG spotter carries no binoculars at all (one or the other).
  _hasBino() {
    return !(this.role === 'spotter' && this.loadout && this.loadout.spotter.primary === 'smg');
  },
  _binoToggle(on) {
    const B = this.bino;
    if ((on === undefined || on) && !B.on && !this._hasBino()) { this.hud.flash('NO BINOCULARS (SMG LOADOUT)', 'dim', 0.8); return; }
    B.on = on === undefined ? !B.on : on;
    this.audio.click();
    if (B.on) this._hint('bino');
    this.hud.flash(B.on ? 'BINOCULARS' : 'P-9', 'dim', 0.6);
  },
  // Thermal view while raised: grey picture (CSS), enemies drawn hot red, all of them marked.
  _binoView(dt) {
    const B = this.bino, up = B.on && B.k > 0.9 && !this.tablet.visible && !this.isr.active;
    const cv = this.renderer.domElement;
    // Thermal: a bright grey world (terrain, trees and buildings readable), warm bodies drawn red on top.
    const want = up ? 'grayscale(1) brightness(2.8) contrast(1.15)' : '';
    if (cv.style.filter !== want) cv.style.filter = want;
    B.up = up;
    if (!up) return;
    B.markT = (B.markT || 0) - dt;
    if (B.markT > 0) return;
    B.markT = 0.25;
    const cam = this.camera, o = cam.position, dir = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    const half = THREE.MathUtils.degToRad(cam.fov / 2) * Math.max(1, cam.aspect) * 0.95;
    const ids = [], v = new THREE.Vector3();
    for (const e of [...this.sentinel.guards, ...this.sentinel.drones]) {
      if (e.state === 'dead' && !e.incap) continue;
      v.set(e.x, (e.y || 0) + (e.kind === 'd' ? 0 : 1.2), e.z).sub(o);
      if (v.normalize().angleTo(dir) > half) continue;
      if (!this.fac.los(o, { x: e.x, y: (e.y || 0) + (e.kind === 'd' ? 0 : 1.2), z: e.z })) continue;
      ids.push(e.id);
      if (!(this.eyesSet && this.eyesSet.has(e.id)) && !(B.seen && B.seen.has(e.id))) this.neuroFx.push({ id: e.id, t: 0, eyes: true });
    }
    B.seen = new Set(ids);
    if (ids.length) { if (this.isHost) this._neuroMark(ids, true); else this.send({ t: 'ab', k: 'qmark', target: { ids, auto: true } }); }
  },
  // The binocular viewfinder: two circles, a reticle, and hot red bodies.
  _binoHud(c, proj, W, H) {
    const B = this.bino;
    if (!B || !B.up) return;
    c.save();
    // Heat: every warm body in view glows red through the grey.
    for (const e of [...this.sentinel.guards, ...this.sentinel.drones]) {
      if (e.state === 'dead' && !e.incap) continue;
      const top = proj(e.x, (e.y || 0) + (e.kind === 'd' ? 0.3 : 1.85), e.z), bot = proj(e.x, (e.y || 0) + (e.kind === 'd' ? -0.3 : 0), e.z);
      if (top.behind || bot.behind) continue;
      const h = Math.max(4, bot.y - top.y), w = h * (e.kind === 'd' ? 1.4 : 0.38);
      const g = c.createRadialGradient(top.x, (top.y + bot.y) / 2, 1, top.x, (top.y + bot.y) / 2, h * 0.6);
      g.addColorStop(0, 'rgba(255,70,40,0.85)'); g.addColorStop(0.6, 'rgba(255,40,30,0.45)'); g.addColorStop(1, 'rgba(255,20,20,0)');
      c.fillStyle = g;
      c.beginPath(); c.ellipse(top.x, (top.y + bot.y) / 2, w, h * 0.55, 0, 0, Math.PI * 2); c.fill();
    }
    // Viewfinder: two overlapping circles, black outside.
    // Two big overlapping circles (a Venn diagram), filling most of the screen.
    const r = Math.min(H * 0.55, W * 0.3), dx = r * 0.62;
    const m = (this._binoMask = this._binoMask || document.createElement('canvas'));
    if (m.width !== W || m.height !== H) { m.width = W; m.height = H; }
    const mc = m.getContext('2d');
    mc.globalCompositeOperation = 'source-over';
    mc.fillStyle = 'rgba(0,0,0,0.22)'; mc.fillRect(0, 0, W, H); // the world stays visible round the lenses, like NV
    mc.globalCompositeOperation = 'destination-out';
    mc.beginPath(); mc.arc(W / 2 - dx, H / 2, r, 0, Math.PI * 2); mc.arc(W / 2 + dx, H / 2, r, 0, Math.PI * 2); mc.fill();
    c.drawImage(m, 0, 0, W, H);
    // A rim round each lens so the two-circle shape reads even against the night.
    // Only the outer edges: the arcs inside the other lens are left out, so no lines cross the middle.
    c.strokeStyle = 'rgba(190,205,220,0.45)'; c.lineWidth = 2;
    const a = Math.atan2(Math.sqrt(Math.max(0, r * r - dx * dx)), dx);
    c.beginPath(); c.arc(W / 2 - dx, H / 2, r, a, Math.PI * 2 - a); c.stroke();
    c.beginPath(); c.arc(W / 2 + dx, H / 2, r, Math.PI + a, Math.PI - a + Math.PI * 2); c.stroke();
    c.strokeStyle = 'rgba(220,230,240,0.7)'; c.lineWidth = 1;
    c.beginPath(); c.moveTo(W / 2 - 40, H / 2); c.lineTo(W / 2 + 40, H / 2); c.moveTo(W / 2, H / 2 - 30); c.lineTo(W / 2, H / 2 + 30); c.stroke();
    for (let i = -3; i <= 3; i++) { c.beginPath(); c.moveTo(W / 2 + i * 14, H / 2 - 4); c.lineTo(W / 2 + i * 14, H / 2 + 4); c.stroke(); }
    c.fillStyle = 'rgba(255,120,90,0.95)'; c.font = '600 12px JetBrains Mono, monospace'; c.textAlign = 'center';
    const mag = Math.round(((this.player.fov ? this.player.fov() : 70) / this.camera.fov) * 10) / 10;
    // Laser rangefinder: a live range under the crosshair (refreshed a few times a second).
    B.lrfT = (B.lrfT || 0) - 1 / 60;
    if (B.lrfT <= 0) { B.lrfT = 0.2; B.lrf = this._lrfTarget(); }
    const L = B.lrf;
    c.fillStyle = L && L.e ? '#ffd040' : 'rgba(220,230,240,0.9)';
    c.fillText(L ? `${L.e ? 'TARGET' : 'RANGE'} ${Math.round(L.d)} m${L.e ? ' \u00B7 R / LASE: FIRING CALL' : ''}` : 'RANGE ---', W / 2, H / 2 + 46);
    c.fillStyle = 'rgba(255,120,90,0.95)';
    c.fillText(`THERMAL · ${mag}\u00D7 (WHEEL / ZOOM) · ${B.seen ? B.seen.size : 0} MARKED`, W / 2, H / 2 + r * 0.8);
    if (this.role === 'spotter' && this.nano) {
      const N = this.nano;
      // Marked targets: a cyan diamond and its number.
      c.strokeStyle = '#7fe8ff'; c.fillStyle = '#7fe8ff'; c.lineWidth = 2;
      N.marks.forEach((id, i) => {
        const g = this.sentinel.byId(id);
        if (!g || g.state === 'dead') return;
        const hp = proj(g.x, (g.y || 0) + 1.6 * ((g.obj && g.obj.userData.scale) || 1), g.z);
        if (hp.behind) return;
        // A ring on the head and a numbered diamond just above it (screen-space, so zoom doesn't push it off).
        c.beginPath(); c.arc(hp.x, hp.y, 14, 0, Math.PI * 2); c.stroke();
        const p = { x: hp.x, y: hp.y - 30 };
        c.beginPath(); c.moveTo(p.x, p.y - 10); c.lineTo(p.x + 9, p.y); c.lineTo(p.x, p.y + 10); c.lineTo(p.x - 9, p.y); c.closePath(); c.stroke();
        c.fillText(String(i + 1), p.x, p.y + 4);
      });
      c.fillStyle = N.ch ? 'rgba(150,235,255,0.95)' : 'rgba(160,170,180,0.85)';
      const pips = '\u25C6'.repeat(N.ch) + '\u25C7'.repeat(3 - N.ch);
      c.fillText(`NANO ${pips}${N.ch < 3 ? ` +1 in ${Math.ceil(15 - N.rl)} s` : ''} \u00B7 LOOK / TAP: MARK ${N.marks.length} \u00B7 FIRE / E: SWARM`, W / 2, H / 2 + r * 0.8 + 18);
    }
    c.restore();
  },
};

export function installDevices(Cls) {
  for (const k of Object.keys(Devices)) Cls.prototype[k] = Devices[k];
}

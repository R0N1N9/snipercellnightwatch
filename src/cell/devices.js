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

export const Devices = {
  // Head-mounted bodycams: both show as small squares in the ISR view; your partner's can be
  // pinned as a small square on your own screen (pause menu: Partner bodycam).
  _bcInit() {
    const el = (this.bcEl = document.createElement('div'));
    el.id = 'cell-bodycams';
    el.innerHTML = ['shooter', 'spotter'].map((r) => `<div class="bc" data-r="${r}"><canvas></canvas><i class="rec">\u25CF REC</i><b></b><s></s></div>`).join('');
    document.body.appendChild(el);
    // Chest-mounted, wide-angle (DMZ-style), not a copy of their eyes.
    this.bcCams = { shooter: new THREE.PerspectiveCamera(100, 16 / 10, 0.1, 900), spotter: new THREE.PerspectiveCamera(100, 16 / 10, 0.1, 900) };
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
      // Chest rig, slightly right of centre, ahead of the vest; follows the body more than the
      // head (pitch damped), with a little walk sway.
      const chest = st === 2 ? 0.32 : st === 1 ? 0.85 : 1.3;
      cam.position.set(p.x, p.y + chest, p.z);
      const sway = Math.sin(this.t * 7) * 0.012;
      cam.rotation.set(pitch * 0.6 - 0.04, yaw + sway, sway * 0.6);
      cam.translateX(0.08);
      cam.translateZ(st === 2 ? -0.55 : -0.32);
      const r = box.getBoundingClientRect();
      const w = Math.max(40, Math.round(r.width)), h = Math.max(30, Math.round(r.height));
      if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
      cam.aspect = w / h;
      cam.updateProjectionMatrix();
      box.querySelector('b').textContent = `BODYCAM \u00B7 ${role === this.role ? this.name : this.partnerName}${alive ? '' : ' \u00B7 NO SIGNAL'}`;
      box.querySelector('s').textContent = this._bcStamp();
      if (!alive) continue;
      // Hide the wearer's own model so their hood, arms and rifle don't fill the frame.
      const av = role === this.role ? null : this.partner.avatar;
      const was = av && av.root.visible;
      if (av) av.root.visible = false;
      // Low-light sensor: a lot more gain than your eyes get.
      const R = this.renderer, ex = R.toneMappingExposure;
      R.toneMappingExposure = ex * 4;
      this._cornerRender(cam, w, h, cv, cv.getContext('2d'));
      R.toneMappingExposure = ex;
      if (av) av.root.visible = was;
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
    const avoid = [...document.querySelectorAll('#touch .tb, #touch .pill, #touch .stick, #cell-hud .c-ammo, #cell-hud .c-pip, #cell-hud .c-obj, #cell-hud .c-kit, #cell-hud .c-chips')]
      .map((e) => (e.offsetParent || getComputedStyle(e).position === 'fixed') ? e.getBoundingClientRect() : null)
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
  },

  // Bring a device up, then run `then` (open the tablet, enter ISR, launch the drone).
  _raise(kind, then) {
    if (this.devAnim) return;
    if (this.tablet.visible || this.isr.active || this.downed || this.kia || (this.quad && this.quad.active)) { then(); return; }
    this.devAnim = { kind, t: 0, dur: kind === 'drone' ? 0.75 : 0.55, then };
    this.audio.nvgReach && this.audio.nvgReach();
  },

  _devTick(dt) {
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
  _binoToggle(on) {
    const B = this.bino;
    B.on = on === undefined ? !B.on : on;
    this.audio.click();
    if (B.on) this._hint('bino');
    this.hud.flash(B.on ? 'BINOCULARS' : 'P-9', 'dim', 0.6);
  },
  // Thermal view while raised: grey picture (CSS), enemies drawn hot red, all of them marked.
  _binoView(dt) {
    const B = this.bino, up = B.on && B.k > 0.9 && !this.tablet.visible && !this.isr.active;
    const cv = this.renderer.domElement;
    const want = up ? 'grayscale(1) brightness(0.75) contrast(1.35)' : '';
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
    const r = Math.min(W * 0.27, H * 0.46), dx = r * 0.55;
    const m = (this._binoMask = this._binoMask || document.createElement('canvas'));
    if (m.width !== W || m.height !== H) { m.width = W; m.height = H; }
    const mc = m.getContext('2d');
    mc.globalCompositeOperation = 'source-over';
    mc.fillStyle = '#000'; mc.fillRect(0, 0, W, H);
    mc.globalCompositeOperation = 'destination-out';
    mc.beginPath(); mc.arc(W / 2 - dx, H / 2, r, 0, Math.PI * 2); mc.arc(W / 2 + dx, H / 2, r, 0, Math.PI * 2); mc.fill();
    c.drawImage(m, 0, 0, W, H);
    c.strokeStyle = 'rgba(220,230,240,0.7)'; c.lineWidth = 1;
    c.beginPath(); c.moveTo(W / 2 - 40, H / 2); c.lineTo(W / 2 + 40, H / 2); c.moveTo(W / 2, H / 2 - 30); c.lineTo(W / 2, H / 2 + 30); c.stroke();
    for (let i = -3; i <= 3; i++) { c.beginPath(); c.moveTo(W / 2 + i * 14, H / 2 - 4); c.lineTo(W / 2 + i * 14, H / 2 + 4); c.stroke(); }
    c.fillStyle = 'rgba(255,120,90,0.95)'; c.font = '600 12px JetBrains Mono, monospace'; c.textAlign = 'center';
    c.fillText(`THERMAL · ${B.seen ? B.seen.size : 0} MARKED`, W / 2, H / 2 + r * 0.8);
    c.restore();
  },
};

export function installDevices(Cls) {
  for (const k of Object.keys(Devices)) Cls.prototype[k] = Devices[k];
}

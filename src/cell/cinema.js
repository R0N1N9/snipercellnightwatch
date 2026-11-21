// Sniper Cell — the two cut-scenes, played locally on each client (skippable).
//   INTRO  the van comes down the plateau track with its lights on, stops, both doors swing
//          open, the operators step out, gear up (rifle up, comms check, a flicker of active
//          camo, the tablet lights), and walk together into the wooded draw below Kestrel Ridge.
//   OUTRO  after the van pulls out: an open road across a plain, the van running flat out
//          toward a sunrise, ending on its silhouette against the sun as the debrief rolls.
import * as THREE from 'three';
import { Avatar } from '../avatar.js';
import { hazeUniforms } from '../atmosphere.js';
import { terrainHeight, lam } from './facility.js';
import { buildVan, setVanLights } from './van.js';
import { VanSound } from './vansound.js';

const ease = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const lerp = (a, b, t) => a + (b - a) * t;

export class Cinema {
  constructor(game) {
    this.g = game;
    this.active = null; // 'intro' | 'outro' | null
    this.t = 0;
    const el = (this.el = document.createElement('div'));
    el.id = 'cell-cine';
    el.innerHTML = '<div class="cc-bar cc-top"></div><div class="cc-bar cc-bot"></div><div class="cc-sub"></div><div class="cc-title"></div><button class="cc-skip">SKIP ▸ <small>SPACE</small></button><div class="cc-fade"></div>';
    document.body.appendChild(el);
    this.sub = el.querySelector('.cc-sub');
    this.title = el.querySelector('.cc-title');
    this.fade = el.querySelector('.cc-fade');
    el.querySelector('.cc-skip').addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); this.skip(); });
    addEventListener('keydown', (e) => {
      if (!this.active) return;
      if (['Space', 'Enter', 'Escape', 'KeyE'].includes(e.code)) { e.preventDefault(); this.skip(); }
    });
    this.cam = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 6000);
  }

  _show(on) {
    this.el.classList.toggle('on', on);
    document.body.classList.toggle('cell-cine', on);
  }
  _say(text) {
    if (this._said === text) return;
    this._said = text;
    this.sub.textContent = text || '';
    this.sub.classList.toggle('on', !!text);
  }
  _fadeTo(v) {
    this.fade.style.opacity = String(Math.max(0, Math.min(1, v)));
  }

  skip() {
    if (this.active === 'intro') this._endIntro();
    else if (this.active === 'outro' && this.t < 9) this.t = 9;
  }

  // ---- INTRO -------------------------------------------------------------------------
  startIntro() {
    const g = this.g;
    this.active = 'intro';
    this.t = 0;
    this._show(true);
    // Actors: both operators in their own kit (one, for a lone operative).
    const roles = g.operative ? ['shooter'] : ['shooter', 'spotter'];
    this.actors = roles.map((role) => {
      const av = new Avatar(role === 'shooter' ? '#f2b35b' : '#40d8e8', role === 'shooter' ? 21 : 23);
      av.setLook(g._look(role));
      g.scene.add(av.root);
      return { role, av, p: new THREE.Vector3(), yaw: 0, moving: false };
    });
    this.van = buildVan();
    g.scene.add(this.van);
    // The chosen drop point: down the draw, or up onto the ridge (the walk-out ends at SPOTS.insert).
    [this.vx, this.vz0, this.vz1] = g.drop.van;
    this.title.textContent = '';
    this._voiced = new Set();
    this.vs = new VanSound(g.audio);
    this._pz = null;
    this._fadeTo(1);
  }

  _vanAt(z) {
    const y = terrainHeight(this.vx, z);
    this.van.position.set(this.vx, y, z);
    // Pitch with the slope so it rides the hill.
    const ahead = terrainHeight(this.vx, z - 2), behind = terrainHeight(this.vx, z + 2);
    this.van.rotation.set(Math.atan2(behind - ahead, 4) * -1, 0, 0, 'YXZ');
    return y;
  }

  _updateIntro(dt) {
    const g = this.g, t = this.t, cam = this.cam;
    const vx = this.vx;
    // Van: rolls in 0–5.6 s.
    const k = ease(Math.min(1, t / 5.6));
    const vz = lerp(this.vz0, this.vz1, k);
    const vy = this._vanAt(vz);
    setVanLights(this.van, true, g.t);
    for (const w of this.van.userData.wheels) w.rotation.x -= (t < 5.6 ? (1 - k) * 22 : 0) * dt;
    // Doors open at 6 s, close at 9.5 s.
    const doorOpen = t > 6 && t < 9.5 ? Math.min(1, (t - 6) * 2.5) : Math.max(0, 1 - (t - 9.5) * 2.5);
    for (const D of Object.values(this.van.userData.doors)) D.hinge.rotation.y = D.sx * (t > 6 ? doorOpen : 0) * 1.15;
    // Sound: the van rolling in, braking, the doors, and the two of them kitting up.
    const VS = this.vs;
    if (!VS.on) VS.start(this.van.position, true);
    const spd = this._pz === null || dt <= 0 ? 0 : Math.abs(this._pz - vz) / dt;
    this._pz = vz;
    VS.update(dt, this.van.position, spd);
    const cross = (at) => t >= at && t - dt < at;
    if (cross(6)) VS.door(true);
    if (cross(6.15)) VS.door(true);
    if (cross(7.1) || cross(8.3)) VS.gear();
    if (cross(9.6)) VS.door(false);
    if (cross(9.85)) VS.door(false);
    // Actors.
    const two = this.actors.length === 2;
    for (const A of this.actors) {
      const side = A.role === 'spotter' ? -1 : 1; // spotter drove (left), shooter rode shotgun (right)
      const seatX = vx + side * 0.42, doorX = vx + side * 1.9;
      const frontX = vx + (two ? side * 0.9 : 0);
      let x, z, yaw = 0, moving = false, st = 0, w = A.role === 'spotter';
      if (t < 6.4) { x = seatX; z = vz - 0.1; A.hidden = true; }
      else if (t < 7.6) { const u = ease((t - 6.4) / 1.2); x = lerp(seatX, doorX, u); z = vz - 0.4; yaw = side > 0 ? -Math.PI / 2 : Math.PI / 2; moving = true; A.hidden = false; }
      else if (t < 9) { const u = ease((t - 7.6) / 1.4); x = lerp(doorX, frontX, u); z = lerp(vz - 0.4, vz - 4.2, u); yaw = Math.atan2(-(frontX - doorX), 4) ; moving = true; }
      else if (t < 11) { x = frontX; z = vz - 4.2; yaw = 0; st = 0; }
      else { const u = Math.min(1, (t - 11) / 4.5); x = frontX; z = lerp(vz - 4.2, vz - 22, u); yaw = 0; moving = true; }
      A.hidden = t < 6.4; // in the van until the doors open
      A.p.set(x, terrainHeight(x, z), z);
      A.av.setVisible(!A.hidden);
      A.av.update(dt, { p: A.p, yaw, pitch: t > 9 && t < 11 ? -0.05 : 0, st, moving, w });
      // Camo check: the shooter shimmers out for a beat.
      const cloak = A.role === 'shooter' && t > 10 && t < 10.9 && Math.sin(t * 40) > -0.6;
      if (cloak !== A.ck) {
        A.ck = cloak;
        A.av.root.traverse((o) => { if (!o.isMesh) return; if (cloak) { o.userData._cm = o.userData._cm || o.material; o.material = g.cloakMat; } else if (o.userData._cm) o.material = o.userData._cm; });
      }
    }
    // Camera shots.
    const S = this.actors[0];
    if (t < 6) {
      // Wide: watching the van come down the track toward us, the valley glow beyond.
      const z1 = this.vz1 + 7, z0 = this.vz1 + 22;
      const cp = new THREE.Vector3(vx + 13, terrainHeight(vx + 13, z1) + 2.4, z1);
      cam.position.lerpVectors(new THREE.Vector3(vx + 16, cp.y + 3, z0), cp, ease(t / 6));
      cam.lookAt(vx, vy + 1, vz);
      cam.fov = 42;
    } else if (t < 9) {
      // Close on the doors as they come out.
      // Centred on the van, so both operators are the same distance from the lens.
      cam.position.set(vx, vy + 1.5, vz - 7.5);
      cam.lookAt(vx, vy + 1.1, vz - 0.5);
      cam.fov = 48;
    } else if (t < 11) {
      // Gear-up: facing them, van lights behind.
      const fz = vz - 4.2;
      cam.position.set(vx, terrainHeight(vx, fz - 4.6) + 1.45, fz - 4.6 - (t - 9) * 0.25);
      cam.lookAt(vx, terrainHeight(vx, fz) + 1.2, fz);
      cam.fov = 40;
    } else {
      // Walking out together up the draw, into the trees toward the ridge.
      // Behind the pair, centred between them (not over one shoulder).
      const ahead = S.p;
      cam.position.set(vx, ahead.y + 1.9, ahead.z + 4.8);
      cam.lookAt(vx, ahead.y + 0.6, ahead.z - 40);
      cam.fov = 52;
    }
    cam.aspect = innerWidth / innerHeight;
    cam.updateProjectionMatrix();
    // Words and title.
    const lines = g.operative
      ? [[6.8, 'Comms check. All on me tonight.'], [9.2, 'Camo’s good.'], [11.4, 'In and out before sunrise.']]
      : [[6.8, `${g._nameFor('spotter')}: Link’s up. Console’s synced.`], [8.4, `${g._nameFor('shooter')}: Rifle’s cold and quiet.`], [9.8, `${g._nameFor('shooter')}: Camo check. Good.`], [11.4, `${g._nameFor('spotter')}: In and out before sunrise.`]];
    let line = '';
    for (const [at, l] of lines) if (t >= at && t < at + 2.2) line = l;
    this._say(line);
    // Voice each line once, over the radio.
    for (const [at, l] of lines) if (t >= at && !this._voiced.has(at)) {
      this._voiced.add(at);
      const m = /^([^:]+):\s*(.*)$/.exec(l);
      const who = m ? (m[1] === g._nameFor('spotter') ? 'spotter' : 'shooter') : g.role;
      g._voice(who, m ? m[2] : l);
    }
    if (t > 1.2 && !this._titled) { this._titled = true; this.title.innerHTML = `<b>${g.titleHTML}</b><span>${g.missionLine}</span>`; this.title.classList.add('on'); }
    if (t > 5.2) this.title.classList.remove('on');
    this._fadeTo(t < 1.2 ? 1 - t / 1.2 : t > 14.6 ? (t - 14.6) / 0.8 : 0);
    if (t > 15.4) this._endIntro();
  }

  _endIntro() {
    const g = this.g;
    if (this.active !== 'intro') return;
    this.active = null;
    for (const A of this.actors) g.scene.remove(A.av.root);
    g.scene.remove(this.van);
    if (this.vs) this.vs.stop();
    this._show(false);
    this._say('');
    this.title.classList.remove('on');
    this._fadeTo(0);
    g._afterIntro();
  }

  // ---- OUTRO -------------------------------------------------------------------------
  startOutro(onTitle) {
    this.active = 'outro';
    this.t = 0;
    this.onTitle = onTitle;
    this._show(true);
    this.el.classList.add('outro');
    this._say('');
    this._buildOutro();
    this.vs2 = new VanSound(this.g.audio);
    this._fadeTo(1);
  }

  _buildOutro() {
    const s = (this.oscene = new THREE.Scene());
    // Sunrise: haze turns warm for the drive out.
    hazeUniforms.uHazeColor.value.set('#e9a07e');
    hazeUniforms.uHazeSunColor.value.set('#ffd6a0');
    hazeUniforms.uSunDir.value.set(0, 0.08, -1).normalize();
    hazeUniforms.uHazeDensity.value = 0.0011;
    hazeUniforms.uHazeFloor.value = 0.3;
    hazeUniforms.uHazeFalloff.value = 60;
    const sky = new THREE.Mesh(new THREE.SphereGeometry(3000, 32, 16), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false,
      uniforms: { uSun: { value: new THREE.Vector3(0, 0.03, -1).normalize() } },
      vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform vec3 uSun; varying vec3 vD;
        void main(){
          float y = vD.y;
          vec3 top = vec3(0.16, 0.24, 0.48), mid = vec3(0.86, 0.52, 0.52), hor = vec3(1.0, 0.72, 0.42);
          vec3 c = mix(hor, mid, smoothstep(0.0, 0.12, y));
          c = mix(c, top, smoothstep(0.1, 0.6, y));
          float s = max(dot(vD, uSun), 0.0);
          c += vec3(1.0, 0.62, 0.5) * pow(s, 12.0) * 0.9 + vec3(1.0, 0.5, 0.6) * pow(s, 220.0) * 0.5;
          c = mix(c, vec3(0.4, 0.3, 0.32), smoothstep(0.0, -0.05, y));
          gl_FragColor = vec4(c, 1.0);
        }`,
    }));
    s.add(sky);
    // The sun: the only retro touch. A big gradient disc (hot pink at the base, gold on top)
    // sliced by horizontal bands that thicken toward the horizon, half risen over the plain.
    const disc = new THREE.Mesh(new THREE.CircleGeometry(150, 72), new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `varying vec2 vUv;
        void main(){
          vec3 c = mix(vec3(1.0, 0.27, 0.52), vec3(1.0, 0.86, 0.36), smoothstep(0.1, 0.95, vUv.y));
          float band = 0.0;
          if (vUv.y < 0.6) { float k = (0.6 - vUv.y) / 0.6; band = step(fract(vUv.y * 16.0), 0.12 + k * 0.5); }
          gl_FragColor = vec4(c * 1.35, 1.0 - band);
        }`,
    }));
    disc.position.set(0, 78, -2600);
    s.add(disc);
    s.add(new THREE.HemisphereLight('#ffc9a0', '#4a3a3a', 1.6));
    const sun = new THREE.DirectionalLight('#ffd0a0', 2.2);
    sun.position.set(0, 120, -1000);
    s.add(sun);
    // Ground: a wide plain with a long straight road toward the sun.
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(4000, 6000, 40, 60).rotateX(-Math.PI / 2), lam('#7a6a52'));
    ground.position.z = -2400;
    const pos = ground.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) { const x = pos.getX(i); pos.setY(i, Math.abs(x) > 30 ? (Math.sin(x * 0.01) + Math.sin(pos.getZ(i) * 0.013)) * 1.5 * Math.min(1, (Math.abs(x) - 30) / 80) : -0.05); }
    ground.geometry.computeVertexNormals();
    s.add(ground);
    const road = new THREE.Mesh(new THREE.PlaneGeometry(9, 6000).rotateX(-Math.PI / 2), lam('#2c2b2e'));
    road.position.set(0, 0.02, -2400);
    s.add(road);
    const dashes = new THREE.InstancedMesh(new THREE.BoxGeometry(0.18, 0.02, 3), lam('#e8d8a8'), 400);
    const m = new THREE.Matrix4();
    for (let i = 0; i < 400; i++) { m.makeTranslation(0, 0.04, 200 - i * 14); dashes.setMatrixAt(i, m); }
    s.add(dashes);
    for (const sx of [-1, 1]) {
      const edge = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 6000).rotateX(-Math.PI / 2), lam('#d8d0c0'));
      edge.position.set(sx * 4.2, 0.03, -2400);
      s.add(edge);
    }
    // Far mountains and roadside poles for speed.
    for (let i = 0; i < 26; i++) {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(120 + Math.random() * 160, 60 + Math.random() * 120, 6), lam('#5a4558'));
      const side = i % 2 ? 1 : -1;
      cone.position.set(side * (300 + Math.random() * 900), 20, -900 - Math.random() * 1600);
      s.add(cone);
    }
    const poles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.08, 0.1, 6, 5), lam('#3a3030'), 160);
    for (let i = 0; i < 160; i++) { m.makeTranslation(i % 2 ? 9 : -9, 3, 150 - i * 40); poles.setMatrixAt(i, m); }
    s.add(poles);
    this.ovan = buildVan();
    s.add(this.ovan);
    this.vz = 0;
  }

  _updateOutro(dt) {
    const t = this.t, cam = this.cam;
    const speed = 24;
    this.vz -= speed * dt;
    const v = this.ovan;
    v.position.set(1.8, 0, this.vz);
    v.rotation.set(0, 0, 0);
    v.userData.body.position.y = Math.sin(t * 9) * 0.01;
    for (const w of v.userData.wheels) w.rotation.x -= (speed / 0.38) * dt;
    setVanLights(v, true, t);
    if (!this.vs2.on) this.vs2.start(v.position, false);
    this.vs2.update(dt, v.position, speed);
    const vp = v.position;
    if (t < 3.6) {
      // Low chase behind, the sun dead ahead.
      cam.position.set(vp.x + 1.2, 1.1, vp.z + 7.5 - t * 0.4);
      cam.lookAt(vp.x - 0.4, 1.4, vp.z - 30);
      cam.fov = 55;
    } else if (t < 7.2) {
      // Tracking alongside.
      const u = (t - 3.6) / 3.6;
      cam.position.set(vp.x + 6.5 - u * 1.5, 1.4 + u * 0.6, vp.z + 2 - u * 4);
      cam.lookAt(vp.x, 1.0, vp.z - 1);
      cam.fov = 42;
    } else {
      // Wide and still: the van runs away into the sunrise.
      if (!this.fixed) this.fixed = new THREE.Vector3(-0.5, 2.6, vp.z + 14);
      cam.position.copy(this.fixed);
      cam.lookAt(0, 4, this.fixed.z - 400);
      cam.fov = 38;
    }
    cam.aspect = innerWidth / innerHeight;
    cam.updateProjectionMatrix();
    this._fadeTo(t < 1.4 ? 1 - t / 1.4 : 0);
    if (t > 7.6 && !this._out) { this._out = true; this.title.innerHTML = `<b>INTEL SECURED</b><span>${this.g.titleHTML} · THE DRIVE IS OUT</span>`; this.title.classList.add('on'); }
    if (t > 10.5 && !this._deb) { this._deb = true; this.title.classList.remove('on'); this.el.classList.add('done'); if (this.onTitle) this.onTitle(); }
  }

  update(dt) {
    if (!this.active) return;
    this.t += dt;
    if (this.active === 'intro') this._updateIntro(dt);
    else this._updateOutro(dt);
  }

  // The outro has its own little world; the intro plays in the main one.
  render(renderer) {
    if (this.active !== 'outro') return false;
    renderer.toneMappingExposure = 1.0;
    renderer.render(this.oscene, this.cam);
    return true;
  }
}

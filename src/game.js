import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

import { BALLISTICS, ROUND, WEAPON, UPLINK, NET, DAMAGE, PLAYER, VEST } from './config.js';
import { PALETTES, applyPalette, withHaze, hazeUniforms } from './atmosphere.js';
import { World } from './world.js';
import { Wind, stepProjectile } from './ballistics.js';
import { LocalPlayer } from './player.js';
import { Avatar, worldCapsules, scopePoint } from './avatar.js';
import { Effects } from './effects.js';
import { glowTexture } from './textures.js';
import { Hud } from './hud.js';
import { Input } from './input.js';
import { Audio } from './audio.js';
import { Replay, sampleHist, pushHist } from './killcam.js';
import { segSegClosest, clamp, mulberry32 } from './util.js';
import { crestAt } from './terrain.js';
import { spawnPoint } from './range.js';
import { Chickens, buildChicken, animateChicken } from './chicken.js';
import { Reckoning } from './reckoning.js';
import { BotPeer } from './bot.js';
import { Sandbox } from './sandbox.js';
import { ToolSystem, setThermal } from './tools.js';
import { LoadoutPanel } from './loadout.js';
import { ViewModel } from './viewmodel.js';
import { WEAPONS } from './weapons.js';
import { Supply } from './supply.js';
import { RULES, rulesLabel } from './rules.js';
import { applyLook } from './look.js';
import { PALETTES as PALS } from './atmosphere.js';
import { AtmosFX } from './atmofx.js';
import { hazeUniforms as HZ } from './atmosphere.js';

const ACCENTS = ['#e0a040', '#40c8d8'];
// Higher magnification = bigger objective = more glint.
const ZOOM_GLINT = { 4: 0.32, 5: 0.4, 8: 0.68, 10: 0.85, 12: 1.0, 16: 1.15, 20: 1.3, 30: 1.5, 40: 1.7 };
const UAV_INTERVAL = 60;
const PART_NAMES = { head: 'HEADSHOT', torso: 'BODY SHOT', legs: 'LEG SHOT', chicken: 'FLICKED BY THE OVERLORD' };

// Final look: ink lines from depth, split-tone grade, vignette, grain, damage tint.
// uInked picks the look (RULES.look): 1 = Inked (the default; Phantom Overwatch's ink pass: the
// Laplacian of 1/z catches silhouettes and folds alike, strong, fading past ~120 m, with saturated
// color and light grain), 0 = OG (silhouettes only, a slightly desaturated filmic grade).
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    tDepth: { value: null },
    uNear: { value: 0.1 },
    uFar: { value: 7000 },
    uRes: { value: new THREE.Vector2(1, 1) },
    uTime: { value: 0 },
    uAmount: { value: 0.35 },
    uDamage: { value: 0 },
    uOutline: { value: 1 },
    uInked: { value: 1 },
    uThermal: { value: 0 },
    uStatic: { value: 0 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform sampler2D tDepth;
    uniform float uNear, uFar, uTime, uAmount, uDamage, uOutline, uInked, uThermal, uStatic; uniform vec2 uRes;
    varying vec2 vUv;
    float lin(vec2 uv) {
      float z = texture2D(tDepth, uv).x * 2.0 - 1.0;
      return (2.0 * uNear * uFar) / (uFar + uNear - z * (uFar - uNear));
    }
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      float d0 = lin(vUv);
      if (uInked > 0.5) {
        // Inked: ink wherever 1/z bends (silhouettes and creases); flat planes have a zero Laplacian.
        vec2 o = 1.6 / uRes;
        float wc = 1.0 / d0;
        float wl = 1.0 / lin(vUv - vec2(o.x, 0.0)), wr = 1.0 / lin(vUv + vec2(o.x, 0.0));
        float wu = 1.0 / lin(vUv + vec2(0.0, o.y)), wd = 1.0 / lin(vUv - vec2(0.0, o.y));
        float lap = abs(wl + wr - 2.0 * wc) + abs(wu + wd - 2.0 * wc);
        float ref = max(wc, max(max(wl, wr), max(wu, wd)));
        float sky = step(uFar * 0.97, d0);
        float ink = smoothstep(0.012, 0.03, lap / ref) * (1.0 - sky) * (1.0 - 0.7 * smoothstep(120.0, 900.0, d0)) * uOutline;
        c.rgb = mix(c.rgb, vec3(0.0045, 0.0045, 0.006), ink * 0.92);
      } else {
        // OG: ink only where a nearer surface sits in front of something much farther.
        vec2 px = 1.0 / uRes;
        float dm = 0.0;
        dm = max(dm, lin(vUv + vec2(px.x, 0.0)) - d0);
        dm = max(dm, lin(vUv - vec2(px.x, 0.0)) - d0);
        dm = max(dm, lin(vUv + vec2(0.0, px.y)) - d0);
        dm = max(dm, lin(vUv - vec2(0.0, px.y)) - d0);
        float edge = smoothstep(0.06, 0.22, dm / d0) * (1.0 - smoothstep(350.0, 1400.0, d0)) * uOutline;
        c.rgb = mix(c.rgb, c.rgb * 0.18 + vec3(0.006, 0.005, 0.012), edge * 0.85);
      }
      // Grade: cool shadows / warm highlights (OG desaturates slightly, Inked keeps color punchy).
      float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
      if (uThermal > 0.5) {
        // Drone thermal: the world is cold slate, warm bodies and lit windows burn white-orange.
        float cold = smoothstep(0.0, 0.6, l);
        vec3 th = mix(vec3(0.015, 0.02, 0.05), vec3(0.16, 0.18, 0.26), cold);
        th = mix(th, vec3(1.4, 0.7, 0.25), smoothstep(1.1, 2.0, l));
        th = mix(th, vec3(2.4, 2.3, 2.1), smoothstep(2.4, 4.5, l));
        float sc = sin(vUv.y * uRes.y * 1.5) * 0.02;
        // Long-range feed: heavier static, rolling bands and the odd tear line.
        float row = floor(vUv.y * uRes.y / 3.0);
        float n = hash(vec2(row, floor(uTime * 24.0))) - 0.5;
        float px2 = hash(vUv * uRes + fract(uTime * 7.0) * 113.0) - 0.5;
        float band = smoothstep(0.96, 1.0, sin(vUv.y * 6.0 - uTime * 1.7));
        float tear = step(0.985, hash(vec2(row * 0.37, floor(uTime * 8.0))));
        th += uStatic * (px2 * 0.09 + n * 0.04 + band * 0.05 + tear * 0.3);
        gl_FragColor = vec4(th + sc, 1.0);
        return;
      }
      c.rgb = mix(vec3(l), c.rgb, uInked > 0.5 ? 1.12 : 0.88);
      vec3 cool = vec3(0.9, 0.96, 1.12), warm = vec3(1.07, 1.0, 0.9);
      c.rgb *= mix(cool, warm, smoothstep(0.03, 0.6, l));
      // Vignette + damage.
      vec2 d = vUv - 0.5;
      d.x *= uRes.x / uRes.y;
      float v = smoothstep(1.0, 0.25, length(d));
      c.rgb *= mix(1.0 - uAmount, 1.0, v);
      c.rgb = mix(c.rgb, vec3(0.5, 0.02, 0.04), uDamage * (1.0 - v) * 0.85);
      // Film grain.
      float g = hash(vUv * uRes + fract(uTime) * 91.7) - 0.5;
      c.rgb += g * (uInked > 0.5 ? 0.006 : 0.018) * (0.25 + l);
      gl_FragColor = c;
    }`,
};

export class Game {
  constructor({ mode, net, quality, paletteKey, name, settings, hostCode, difficulty, mv }) {
    // 'ai' and 'sandbox' run as a host whose "peer" is the local AI.
    this.offline = mode === 'ai' || mode === 'sandbox' ? mode : null;
    if (this.offline) mode = 'host';
    this.mode = mode; // 'practice' | 'host' | 'guest'
    this.difficulty = difficulty || 'normal';
    this.net = net;
    // Multiverse: this game is one dimension of a larger match. The director starts each
    // round (mvBegin), is told when one is over (mv.roundOver) and suspends us in between.
    this.mv = mv || null;
    this.suspended = false;
    this.frozen = false;
    this.paused = false;
    this.timeScale = 1;
    this.quality = quality;
    this.paletteKey = paletteKey;
    this.palette = PALETTES[paletteKey];
    this.name = name || 'You';
    this.oppName = 'Opponent';
    this.hostCode = hostCode;
    this.me = mode === 'guest' ? 1 : 0;
    this.settings = settings;

    this._initRenderer();
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(WEAPON.baseFov, innerWidth / innerHeight, 0.1, 7000);
    this.camera.rotation.order = 'YXZ';
    this.scene.add(this.camera);

    this.hemi = new THREE.HemisphereLight(0xffffff, 0x000000, 1);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffffff, 1);
    this.scene.add(this.sun, this.sun.target);
    if (quality === 'high') {
      this.sun.castShadow = true;
      this.sun.shadow.mapSize.set(2048, 2048);
      const sc = this.sun.shadow.camera;
      sc.left = -70; sc.right = 70; sc.top = 70; sc.bottom = -70; sc.near = 1; sc.far = 900;
      this.sun.shadow.bias = -0.0006;
      this.sun.shadow.normalBias = 0.6;
    }

    this.world = new World(this.scene, quality, this.palette);
    // Atmosphere: dust / pollen in the air, low mist banks, fireflies at dusk.
    const dusk = paletteKey === 'dusk';
    this.atmos = new AtmosFX(this.scene, { quality, night: dusk, color: dusk ? '#ffc8a8' : '#ffe2a0', mistColor: dusk ? '#8c7aa8' : '#d8c0a0', mistOpacity: dusk ? 0.05 : 0.035, bright: dusk ? 0.4 : 0.55 });
    this.sunDir = applyPalette(this.palette, { sky: this.world.sky, sunLight: this.sun, hemi: this.hemi, renderer: this.renderer });

    this.effects = new Effects(this.scene);
    this.hud = new Hud();
    this.input = new Input(this.renderer.domElement, document.getElementById('touch'));
    this.input.sensitivity = settings.sensitivity;
    this.input.invertY = settings.invertY;
    this.input.scopeToggle = settings.scopeToggle;
    this.audio = settings.audio;

    this.player = new LocalPlayer();
    this.remote = new Avatar(ACCENTS[1 - this.me]);
    this.scene.add(this.remote.root);
    this.remote.setVisible(false);
    this.ghostA = new Avatar(ACCENTS[0]);
    this.ghostB = new Avatar(ACCENTS[1]);
    this.scene.add(this.ghostA.root, this.ghostB.root);
    this.ghostA.setVisible(false);
    this.ghostB.setVisible(false);
    this.wind = new Wind();
    this.replay = new Replay({ scene: this.scene, camera: this.camera, effects: this.effects, ghostA: this.ghostA, ghostB: this.ghostB, wind: this.wind });
    this._buildViewmodel();

    // Match state
    this.phase = mode === 'practice' ? 'practice' : this.offline === 'sandbox' ? 'sandbox' : this.mv ? 'hold' : 'wait';
    this.uavT = UAV_INTERVAL;
    this.phaseT = 0;
    this.round = 0;
    this.scores = [0, 0];
    this.sides = [-1, 1];
    this.roundTime = 0;
    this.uplinkState = this.world.uplinks.map(() => ({ owner: -1, progress: 0, enemyHacking: false }));
    this.hacking = -1;
    this.bullets = [];
    this.shotId = 0;
    this.myShots = new Map();
    this.remoteShots = new Map();
    this.selfHist = [];
    this.remoteHist = [];
    this.remoteHp = 100;
    this.remoteAlive = false;
    this.remoteHack = -1;
    this.pings = [];
    this.stateT = 0;
    this.syncT = 0;
    this.now = 0;
    this.result = null;
    this.killShown = null;
    this.beepT = 0;
    this.footT = 0;

    this.targets = [];
    this.tools = new ToolSystem(this);
    this.supply = new Supply(this);
    this.chickens = new Chickens(this);
    this.reckoning = new Reckoning(this);
    this.loadoutPanel = new LoadoutPanel(this, settings.saveLoadout);
    if (this.offline) this.net = new BotPeer(this, { difficulty: this.difficulty, behaviour: this.offline === 'sandbox' ? 'passive' : 'hostile' });
    if (mode === 'practice') this._setupPractice();
    else this._setupNet();
    if (this.offline === 'sandbox') {
      this._spawnTargets();
      this.wind.set(Math.random() * Math.PI * 2, 3, Math.random() * 100);
      this.sandbox = new Sandbox(this);
    }

    this._spawnFree();
    this.hud.show(true);
    this._resize();
    addEventListener('resize', () => this._resize());
    this.look = null;
    this.lookSweep = 0;
    this._syncLook(0);
    this.clock = new THREE.Clock();
    this.frameTimes = [];
    this.renderer.setAnimationLoop(() => this._frame());
  }

  // Graphics look (host's RULES.look, see look.js). Follows the rules if they change, and now and
  // then re-sweeps the scene so meshes added since (avatars, chickens, drops) get the same shading.
  _syncLook(dt) {
    const look = RULES.look === 'og' ? 'og' : 'inked';
    this.lookSweep -= dt;
    if (look === this.look && (look === 'og' || this.lookSweep > 0)) return;
    if (look !== this.look) {
      this.look = look;
      const inked = look === 'inked';
      if (this.bloom) this.bloom.strength = inked ? 0.33 : 0.55;
      // Grass stays out of the ink: inked, every clump would turn into a black dash.
      const grass = this.world.grass && this.world.grass.mesh;
      if (grass) { grass.material.depthWrite = !inked; grass.renderOrder = inked ? 2 : 0; }
    }
    this.lookSweep = 1;
    applyLook(this.scene, look);
  }

  // -------------------------------------------------------------------------
  // Setup
  // -------------------------------------------------------------------------
  _initRenderer() {
    const canvas = document.getElementById('game');
    const q = this.quality;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: q === 'low', powerPreference: 'high-performance', stencil: false });
    this.basePR = q === 'high' ? Math.min(devicePixelRatio, 2) : q === 'medium' ? Math.min(devicePixelRatio, 1.5) : Math.min(devicePixelRatio, 1);
    this.pr = this.basePR;
    this.renderer.setPixelRatio(this.pr);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.shadowMap.enabled = q === 'high';
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.useComposer = q !== 'low';
  }

  _initComposer() {
    if (!this.useComposer || this.composer) return;
    const rt = new THREE.WebGLRenderTarget(innerWidth, innerHeight, {
      type: THREE.HalfFloatType,
      samples: this.quality === 'high' ? 4 : 0,
      depthTexture: new THREE.DepthTexture(innerWidth, innerHeight),
    });
    this.composer = new EffectComposer(this.renderer, rt);
    // The ping-pong buffer must not share the depth texture we sample in the grade pass.
    this.composer.renderTarget2.depthTexture = new THREE.DepthTexture(innerWidth, innerHeight);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), 0.55, 0.55, 0.92);
    this.composer.addPass(this.bloom);
    this.vignette = new ShaderPass(GradeShader);
    this.composer.addPass(this.vignette);
    this.composer.addPass(new OutputPass());
  }

  _resize() {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight, false);
    this._initComposer();
    if (this.composer) {
      this.composer.setPixelRatio(this.pr);
      this.composer.setSize(innerWidth, innerHeight);
    }
  }

  _buildViewmodel() {
    this.viewmodel = new ViewModel(this.camera);
  }

  _spawnFree() {
    // Practice / waiting: on the south crest, facing the valley.
    const x = -20, z = -(crestAt(x) - 8);
    const sp = new THREE.Vector3(x, this.world.groundAt(x, z, 1e4, 0), z);
    this.player.reset(sp, Math.PI);
    this.player.zero = 400;
  }

  _setupPractice() {
    this.wind.set(Math.random() * Math.PI * 2, 2 + Math.random() * 4, Math.random() * 100);
    this._spawnTargets();
    this.hud.el.practice.classList.add('on');
  }

  _spawnTargets() {
    const steel = withHaze(new THREE.MeshLambertMaterial({ color: '#3e3c44', flatShading: true }), { key: 'steel' });
    const paint = withHaze(new THREE.MeshLambertMaterial({ color: '#d8d0c0', flatShading: true }), { key: 'paint' });
    const spots = [
      [-30, -230], [40, -150], [-10, -60], [60, 40], [-60, 120], [20, 200], [-40, 290], [80, 360], [-120, 395], [-600, -60], [430, 100],
    ];
    const mk = (x, z, mover) => {
      const y = mover ? 2 : this.world.heightAt(x, z);
      const g = new THREE.Group();
      const plate = new THREE.Group();
      const torso = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.62, 0.03), paint);
      torso.position.set(0, 1.18, 0);
      const head = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.03, 10).rotateX(Math.PI / 2), paint);
      head.position.set(0, 1.62, 0);
      const legs = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.85, 0.03), steel);
      legs.position.set(0, 0.45, 0);
      plate.add(torso, head, legs);
      g.add(plate);
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.1, 0.5), steel);
      post.position.y = 0.05;
      g.add(post);
      g.position.set(x, y, z);
      g.rotation.y = 0; // faces -Z? plates are flat; orientation hardly matters
      this.scene.add(g);
      this.targets.push({ g, plate, pos: g.position, yaw: Math.PI, swing: 0, mover, base: x, dir: 1, paint: [torso, head] });
    };
    for (const [x, z] of spots) mk(x, z, false);
    mk(0, 100, true);
  }

  _setupNet() {
    const n = this.net;
    this.tools.bindNet(n);
    n.on('supply', (m) => this.supply.onRemote(m));
    n.on('supplytaken', (m) => this.supply.onRemoteTaken(m));
    n.on('chickhit', (m) => this.chickens.onRemoteHit(m));
    n.on('open', () => {
      n.send({ t: 'hello', name: this.name, pal: this.paletteKey, rules: { ...RULES } });
      if (this.offline === 'sandbox') {
        this.sides = [-1, 1];
        this.remoteAlive = true;
        n.sandboxSpawn(1);
        this.hud.message('SANDBOX', 'Press B (or TOOLS) for the tools panel', 3);
      } else if (this.mode === 'host' && !this.mv) {
        this.hud.message(this.offline ? 'AI OPPONENT READY' : 'OPPONENT CONNECTED', 'Match starting…', 2.5);
        setTimeout(() => this._hostStartRound(), 1500);
      }
    });
    n.on('hello', (m) => {
      this.oppName = String(m.name || 'Opponent').replace(/[<>&"]/g, '').slice(0, 16);
    });
    n.on('close', () => {
      // After the reveal the director reports a lost connection; before it, this is still
      // the classic duel as far as anyone can tell, so it is reported the classic way.
      if (this.mv && !this.mv.secret()) return;
      this.hud.card(`<h2>CONNECTION LOST</h2><p>${this.oppName} left the game.</p><button onclick="location.href=location.pathname">Back to menu</button>`);
      this.remote.setVisible(false);
      this.remoteAlive = false;
      document.exitPointerLock && document.exitPointerLock();
    });
    n.on('s', (m) => this._onRemoteState(m));
    n.on('respawn', () => {
      this.remoteDeadLock = false;
      this.remoteAlive = true;
      this.remoteHp = 100;
      this.remoteHist.length = 0;
      this.killShown = null;
    });
    n.on('uav', () => this._onUav());
    n.on('shot', (m) => this._onRemoteShot(m));
    n.on('hit', (m) => this._onHitByRemote(m));
    n.on('died', (m) => this._onRemoteDied(m));
    n.on('round', (m) => this._applyRound(m));
    n.on('sync', (m) => {
      if (this.mode !== 'guest') return;
      this.phaseT = m.pt;
      this.roundTime = m.rt;
    });
    n.on('cap', (m) => this.mode === 'host' && this._hostCapture(m.i, 1));
    n.on('reveal', (m) => this._onReveal(m));
    n.on('rematch', () => this.mode === 'host' && this._hostRematch());
    if (n.open) n.handlers.open();
  }

  // -------------------------------------------------------------------------
  // Host-authoritative round flow
  // -------------------------------------------------------------------------
  _roundMsg(extra = {}) {
    return {
      t: 'round',
      round: this.round,
      phase: this.phase,
      pt: this.phaseT,
      scores: this.scores,
      sides: this.sides,
      spawns: this.spawnIdx,
      wind: { d: this.wind.dir, s: this.wind.speed, seed: this.wind.seed },
      up: this.uplinkState.map((u) => u.owner),
      ...extra,
    };
  }

  _broadcastRound(extra) {
    const m = this._roundMsg(extra);
    this.net.send(m);
    this._applyRound(m, true);
  }

  _hostStartRound() {
    this.round++;
    const flip = this.round % 2 === 0;
    this.sides = flip ? [1, -1] : [-1, 1];
    this.spawnIdx = this._mvSpawn || [Math.floor(Math.random() * 3), Math.floor(Math.random() * 3)];
    this._mvSpawn = null;
    this.wind.set(Math.random() * Math.PI * 2, 1.5 + Math.random() * 5.5, Math.random() * 1000);
    this.uplinkState.forEach((u) => (u.owner = -1));
    this.phase = 'insert';
    this.phaseT = ROUND.insert;
    this._broadcastRound({ fresh: true });
  }

  _hostEndRound(winner, reason, info = {}) {
    if (this.phase !== 'live' && this.phase !== 'insert') return;
    if (winner >= 0) this.scores[winner]++;
    this.phase = 'end';
    this.phaseT = ROUND.end;
    this._broadcastRound({ result: { winner, reason, ...info } });
  }

  _hostCapture(i, who) {
    if (this.phase !== 'live') return;
    this.uplinkState[i].owner = who;
    this._broadcastRound();
    const m = { t: 'reveal', who, i };
    this.net.send(m);
    this._onReveal(m);
  }

  _hostRematch() {
    if (this.phase !== 'match') return;
    this.scores = [0, 0];
    this.round = 0;
    this._hostStartRound();
  }

  _hostTick(dt) {
    if (this.phase === 'live' || this.phase === 'sandbox') {
      this.uavT -= dt;
      if (this.uavT <= 0) {
        this.uavT = UAV_INTERVAL;
        if (this.mode === 'host') {
          this.net.send({ t: 'uav' });
          this._onUav();
        }
      }
    }
    if (this.mode !== 'host' || this.phase === 'wait' || this.phase === 'match' || this.phase === 'sandbox' || this.phase === 'hold') return;
    this.phaseT -= dt;
    this.syncT -= dt;
    if (this.syncT <= 0) {
      this.syncT = 1;
      this.net.send({ t: 'sync', pt: this.phaseT, rt: this.roundTime });
    }
    if (this.phaseT > 0) return;
    if (this.phase === 'insert') {
      this.phase = 'live';
      this.phaseT = ROUND.live;
      this._broadcastRound();
    } else if (this.phase === 'live') {
      const mine = this.uplinkState.filter((u) => u.owner === 0).length;
      const theirs = this.uplinkState.filter((u) => u.owner === 1).length;
      const winner = mine > theirs ? 0 : theirs > mine ? 1 : -1;
      this._hostEndRound(winner, 'time', { up: [mine, theirs] });
    } else if (this.phase === 'end' && this.mv) {
      // The director takes it from here (the point throws the match somewhere else) — unless
      // it declines, as it does for a drawn round before anyone has scored: then this is
      // still just the classic duel and the next round starts as usual.
      if (this.mv.roundOver(this.result ? this.result.winner : -1, this.result || {}) === false) this._hostStartRound();
      else this.phase = 'hold';
    } else if (this.phase === 'end') {
      if (Math.max(...this.scores) >= ROUND.winsToMatch) {
        this.phase = 'match';
        this._broadcastRound();
      } else this._hostStartRound();
    }
  }

  _applyRound(m, local = false) {
    const prevPhase = this.phase;
    if (!local) {
      this.round = m.round;
      this.phase = m.phase;
      this.phaseT = m.pt;
      this.scores = m.scores;
      this.sides = m.sides;
      this.spawnIdx = m.spawns;
      this.wind.set(m.wind.d, m.wind.s, m.wind.seed);
    }
    m.up.forEach((o, i) => (this.uplinkState[i].owner = o));
    if (m.fresh) this._resetForRound();
    if (m.phase === 'live' && prevPhase !== 'live') {
      this.roundTime = 0;
      this.uavT = UAV_INTERVAL;
      this.hud.message('WEAPONS HOT', 'Find them before they find you.', 2.5);
      this.audio.beep(null, true);
    }
    if (m.result) this._onRoundResult(m.result);
    if (m.phase === 'match' && prevPhase !== 'match') this._onMatchEnd();
  }

  _resetForRound() {
    const side = this.sides[this.me];
    const sp = spawnPoint(this.world, side, this.spawnIdx[this.me]);
    this.player.reset(sp, side < 0 ? Math.PI : 0);
    this.player.zero = 400;
    this.input.resetScope();
    this.uplinkState.forEach((u) => { u.progress = 0; u.enemyHacking = false; });
    this.hacking = -1;
    this.bullets.forEach((b) => { if (b.tracer) this.effects.killTracer(b.tracer); if (b.chick) this.scene.remove(b.chick); });
    this.bullets.length = 0;
    this.pings.length = 0;
    this.hud.clearMarkers();
    this.hud.card('');
    this.tools.reset();
    this.supply.reset();
    this.chickens.reset();
    this.remoteHp = 100;
    this.remoteAlive = true;
    this.remoteDeadLock = false;
    this.remoteHist.length = 0;
    this.selfHist.length = 0;
    this.result = null;
    this.killShown = null;
    if (this.replay.active) this.replay.stop();
    this.roundTime = 0;
    this.hud.message(`ROUND ${this.round}`, `Insertion — weapons cold · ${side < 0 ? 'South' : 'North'} ridge · ${rulesLabel()} rules`, 4);
  }

  _onRoundResult(r) {
    this.result = r;
    const won = r.winner === this.me, draw = r.winner < 0;
    let reason = '';
    if (r.reason === 'kill') reason = r.part === 'chicken' ? 'Pecked · eaten · flicked off the map' : `${PART_NAMES[r.part] || 'KILL'} · ${Math.round(r.dist)} m`;
    else if (r.reason === 'time') reason = draw ? `Time — uplinks tied ${r.up[0]}–${r.up[1]}` : `Time — uplinks ${Math.max(...r.up)}–${Math.min(...r.up)}`;
    this.pendingCard = `<h2 class="${won ? 'win' : draw ? '' : 'lose'}">${draw ? 'ROUND DRAWN' : won ? 'ROUND WON' : 'ROUND LOST'}</h2><p>${reason}</p><div class="sc"><span class="me">${this.name} ${this.scores[this.me]}</span><span class="dash">—</span><span class="them">${this.scores[1 - this.me]} ${this.oppName}</span></div>`;
    if (!this.replay.active && !(r.reason === 'kill')) this._showPendingCard();
    else if (r.reason === 'kill' && !this.replay.active) setTimeout(() => !this.replay.active && this._showPendingCard(), 400);
  }

  _showPendingCard() {
    if (!this.pendingCard) return;
    this.hud.card(this.pendingCard, ROUND.end);
    this.pendingCard = null;
  }

  _onMatchEnd() {
    const won = this.scores[this.me] > this.scores[1 - this.me];
    this.hud.card(
      `<h2 class="${won ? 'win' : 'lose'}">${won ? 'VICTORY' : 'DEFEAT'}</h2><div class="sc"><span class="me">${this.name} ${this.scores[this.me]}</span><span class="dash">—</span><span class="them">${this.scores[1 - this.me]} ${this.oppName}</span></div>` +
        `<button id="btn-rematch">Rematch</button><button class="ghost" onclick="location.href=location.pathname">Leave</button>`,
    );
    document.exitPointerLock && document.exitPointerLock();
    const b = document.getElementById('btn-rematch');
    if (b)
      b.onclick = () => {
        if (this.mode === 'host') this._hostRematch();
        else { this.net.send({ t: 'rematch' }); b.textContent = 'Waiting for host…'; }
        this.input.requestLock();
      };
  }

  // -------------------------------------------------------------------------
  // Network events
  // -------------------------------------------------------------------------
  _onRemoteState(m) {
    pushHist(this.remoteHist, {
      t: this.now,
      p: new THREE.Vector3(m.p[0], m.p[1], m.p[2]),
      yaw: m.y,
      pitch: m.pi,
      st: m.st,
      sc: m.sc,
      z: m.z,
      moving: !!m.mv,
    });
    this.remoteHp = m.hp;
    if (m.al === 0) this.remoteAlive = false;
    else if (!this.remoteDeadLock && this.phase !== 'end' && this.phase !== 'match') this.remoteAlive = true;
    this.remoteHack = m.hk;
    this.remoteWpn = m.w | 0;
    this.remoteRifle = m.rt || 'mk22';
    this.tools.onRemoteState(m);
    this.chickens.onRemote(m.ck);
  }

  _onRemoteShot(m) {
    const o = new THREE.Vector3(...m.o), v = new THREE.Vector3(...m.v);
    this.remoteShots.set(m.id, { o: o.clone(), v: v.clone(), t0: this.now, windT0: m.wt, ch: !!m.ch });
    this._spawnBullet(o, v, false, m.id, m.wt, !!m.ch);
    const dir = v.clone().normalize();
    const d = o.distanceTo(this.camera.position);
    if (m.ch) {
      // Pollo Hermano: a chicken, flung.
      this.effects.puff(o.clone().addScaledVector(dir, 1), 'feather', 1.2, 0.8);
      this.audio.chicken(o, 'squawk', d / 343);
      return;
    }
    if (!m.sup) this.effects.muzzle(o, dir);
    this.audio.shotDistant(o, d / 343, !!m.sup || m.wk === 'm18');
    // Prone shots kick up a dust cloud: another tell (not with a suppressor).
    const last = this.remoteHist[this.remoteHist.length - 1];
    if (last && last.st === 2 && !m.sup) this.effects.puff(o.clone().add(new THREE.Vector3(0, -0.2, 0)), 'dust', 2.2, 2.0);
  }

  _onHitByRemote(m) {
    const P = this.player;
    if (!P.alive) return;
    if (!(this.sandbox && this.sandbox.god)) P.hp -= m.dmg;
    if (m.peck) {
      this.audio.chicken(null, 'peck');
      if (this.now - (this._peckMsgT || -9) > 3) {
        this._peckMsgT = this.now;
        this.hud.message('PECKED', 'Switching to your pistol is always faster than reloading.', 2.6);
      }
      this.hud.damage(0);
    }
    const shot = this.remoteShots.get(m.id);
    if (shot) {
      const dx = shot.o.x - P.pos.x, dz = shot.o.z - P.pos.z;
      const right = dx * Math.cos(P.yaw) - dz * Math.sin(P.yaw);
      const fwd = -dx * Math.sin(P.yaw) - dz * Math.cos(P.yaw);
      this.hud.damage(Math.atan2(right, fwd));
    }
    if (P.hp <= 0 && m.peck) {
      // Death by chicken: the Reckoning instead of a killcam.
      P.alive = false;
      P.hp = 0;
      this.net.send({ t: 'died', id: m.id, part: m.part, dist: 0, ip: m.ip, peck: 1, p: P.pos.toArray().map((x) => Math.round(x * 10) / 10) });
      this._sendState(true);
      if (this.mode === 'host') this._hostEndRound(1 - this.me, 'kill', { part: 'chicken', dist: 0 });
      this._playReckoning(P.pos.clone(), this.tools.myLook(), () => (this.offline === 'sandbox' ? this._sandboxRespawn() : this._showPendingCard()));
      return;
    }
    if (P.hp <= 0) {
      P.alive = false;
      P.hp = 0;
      this.net.send({ t: 'died', id: m.id, part: m.part, dist: m.dist, ip: m.ip });
      this._sendState(true);
      if (this.mode === 'host') this._hostEndRound(1 - this.me, 'kill', { part: m.part, dist: m.dist });
      if (!shot && this.offline === 'sandbox') setTimeout(() => this._sandboxRespawn(), 2500);
      if (shot) {
        this._ghostLooks(false);
        this.replay.start({
          mode: 'victim',
          shooterHist: this.remoteHist.slice(),
          victimHist: this.selfHist.slice(),
          shot,
          impact: new THREE.Vector3(...m.ip),
          onDone: () => (this.offline === 'sandbox' ? this._sandboxRespawn() : this._showPendingCard()),
        });
        this._replayLabel(`KILLED BY ${this.oppName.toUpperCase()}`, `${PART_NAMES[m.part]} · ${Math.round(m.dist)} m`);
      }
    } else if (!m.peck) {
      P.wounded = true;
      this.hud.message('HIT', `${PART_NAMES[m.part] || ''} — you're wounded. Move!`, 2);
    }
  }

  _sandboxRespawn() {
    this._spawnFree();
    this.hud.message('RESPAWNED', '', 1.5);
  }

  _onUav() {
    this.uavT = UAV_INTERVAL;
    const iJam = this.tools.jammer;
    if (iJam) this.tools.jammer = false;
    const theyJam = !!this.tools.remote.jm;
    this.hud.message('UAV SWEEP', theyJam ? 'Target JAMMED — no fix on the enemy' : iJam ? 'Enemy marked · your jammer kept you hidden' : 'Enemy position marked — and yours is too', 2.8);
    this.audio.ping();
    if (theyJam) { this.tools.remote.jm = 0; return; }
    this.tools.openFeed();
    if (!this.remoteAlive || !this.remoteHist.length) return;
    const s = sampleHist(this.remoteHist, this.now - NET.interpDelay);
    this.hud.addMarker(s.p.clone().add(new THREE.Vector3(0, 1.2, 0)), 'UAV', 'enemy', 4);
  }

  _onRemoteDied(m) {
    this.remoteAlive = false;
    this.remoteDeadLock = true;
    if (m.peck) {
      if (this.mode === 'host') this._hostEndRound(this.me, 'kill', { part: 'chicken', dist: 0 });
      const at = Array.isArray(m.p) ? new THREE.Vector3(...m.p) : (sampleHist(this.remoteHist, this.now - NET.interpDelay) || { p: new THREE.Vector3() }).p.clone();
      this._playReckoning(at, this.tools.remoteLook(), () => this._showPendingCard());
      return;
    }
    if (this.mode === 'host') this._hostEndRound(this.me, 'kill', { part: m.part, dist: m.dist });
    if (this.killShown !== m.id) this._startKillerReplay(m.id, new THREE.Vector3(...m.ip), m.part, m.dist);
  }

  // Swap the Reckoning cinematic in for the killcam (same interface), then swap back.
  _playReckoning(victimPos, look, onDone) {
    if (this.replay !== this.reckoning) {
      if (this.replay.active) this.replay.stop();
      this._killcam = this.replay;
    }
    this.replay = this.reckoning;
    this.reckoning.start({ victimPos, victimLook: look, ghost: this.ghostB, onStop: () => (this.replay = this._killcam), onDone });
  }

  _startKillerReplay(id, impact, part, dist) {
    const shot = this.myShots.get(id);
    if (!shot || this.replay.active) return;
    this.killShown = id;
    this._ghostLooks(true);
    this.replay.start({
      mode: 'killer',
      shooterHist: this.selfHist.slice(),
      victimHist: this.remoteHist.slice(),
      shot,
      impact,
      onDone: () => this._showPendingCard(),
    });
    this._replayLabel(`${PART_NAMES[part]}`, `${Math.round(dist)} m`);
  }

  // Replay ghosts wear the right outfits: A is the shooter, B the victim.
  _ghostLooks(shooterIsMe) {
    const me = this.tools.myLook(), them = this.tools.remoteLook();
    this.ghostA.setLook(shooterIsMe ? me : them);
    this.ghostB.setLook(shooterIsMe ? them : me);
  }

  _replayLabel(a, b) {
    this.hud.message(a, b, 5);
  }

  _onReveal(m) {
    const u = this.world.uplinks[m.i];
    if (m.who === this.me) {
      this.hud.message(`UPLINK ${u.name} SECURED`, 'Satellite sweep: enemy position pinged', 3);
      for (let k = 0; k < UPLINK.pings; k++) this.pings.push(this.now + k * UPLINK.pingInterval);
    } else {
      this.hud.message(`UPLINK ${u.name} LOST`, "You've been pinged — relocate!", 3.5);
      this.audio.beep(null, false);
    }
  }

  _sendState(force = false) {
    if (!this.net || !this.net.open) return;
    const P = this.player;
    const r = (v) => Math.round(v * 100) / 100;
    this.net.send({
      t: 's',
      p: [r(P.pos.x), r(P.pos.y), r(P.pos.z)],
      y: r(P.yaw),
      pi: Math.round(P.pitch * 1000) / 1000,
      st: P.stance,
      sc: P.scopeT > 0.5 ? 1 : 0,
      z: P.zoom,
      hk: this.hacking,
      hp: Math.max(0, Math.round(P.hp)),
      al: P.alive ? 1 : 0,
      mv: P.moving ? 1 : 0,
      w: P.slot,
      rt: P.rifleKey,
      ...this.tools.stateFields(),
      ck: this.chickens.stateField(),
    });
  }

  // -------------------------------------------------------------------------
  // Shooting
  // -------------------------------------------------------------------------
  _spawnBullet(o, v, local, id, windT0, chick = false) {
    const tracer = this.effects.addTracer(o, v, !local);
    let chickMesh = null;
    if (chick) {
      // The "bullet" is a yellow chicken, wings out, beak first, with a bright yellow trail
      // and glow so it reads at range like a tracer.
      tracer.mesh.visible = false;
      tracer.faint = false;
      tracer.rgb = [1.6, 1.25, 0.2];
      chickMesh = new THREE.Group();
      const c = buildChicken();
      c.rotation.y = Math.PI; // its beak (-Z) along the group's +Z, which lookAt points forward
      c.position.y = -0.27;
      chickMesh.add(c);
      chickMesh.userData.c = c;
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffd23a, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      glow.scale.setScalar(1.3);
      chickMesh.add(glow);
      chickMesh.position.copy(o);
      this.scene.add(chickMesh);
    }
    this.bullets.push({ p: o.clone(), v: v.clone(), prev: o.clone(), age: 0, local, id, windT0, tracer, crackDone: false, chick: chickMesh });
  }

  _fire() {
    const P = this.player;
    const o = P.eyePos(new THREE.Vector3());
    const dir = P.muzzleDir(new THREE.Vector3());
    const def = P.def;
    const chick = !!P.pollo && def.slot === 'rifle';
    const sup = (this.tools.has('suppressor') && def.slot === 'rifle') || chick;
    const v = dir.clone().multiplyScalar(P.muzzle);
    const id = ++this.shotId * 2 + this.me;
    this.myShots.set(id, { o: o.clone(), v: v.clone(), t0: this.now, windT0: this.roundTime, wk: def.key, ch: chick });
    // Start the visible bullet slightly ahead so it doesn't spawn inside the camera.
    this._spawnBullet(o, v, true, id, this.roundTime, chick);
    P.fireKick();
    if (chick) this.audio.chicken(null, 'squawk');
    else this.audio.shotLocal(sup, def.slot === 'pistol');
    // (the bolt sound plays when the bolt is actually worked — see boltEvent)
    if ((P.scopeT < 0.5 || !def.scope) && !sup) this.effects.muzzle(this.viewmodel.muzzleWorld(), dir);
    this.viewmodel.fired();
    if (this.net && this.net.open) this.net.send({ t: 'shot', id, wk: def.key, ch: chick ? 1 : 0, sup: sup ? 1 : 0, o: o.toArray().map((x) => Math.round(x * 1000) / 1000), v: v.toArray().map((x) => Math.round(x * 100) / 100), wt: this.roundTime });
  }

  _targetsForHit() {
    // Capsules the local player's bullets can hit right now.
    const list = [];
    for (const t of this.targets) {
      if (t.swing > 0) continue;
      worldCapsules(t.pos, t.yaw, 0).forEach((c) => { c.owner = t; list.push(c); });
    }
    if (this.mode !== 'practice') this.tools.hitCapsules(list);
    if (this.mode !== 'practice') this.chickens.hitCapsules(list);
    if (this.mode !== 'practice' && this.remoteAlive && this.remoteHist.length) {
      const s = sampleHist(this.remoteHist, this.now - NET.interpDelay);
      if (s) worldCapsules(s.p, s.yaw, s.st).forEach((c) => { c.owner = 'remote'; list.push(c); });
    }
    return list;
  }

  _updateBullets(dt) {
    const listener = this.camera.position;
    const targets = this._targetsForHit();
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      let dead = false;
      let rem = dt;
      while (rem > 1e-6 && !dead) {
        const h = Math.min(BALLISTICS.substep * 2, rem);
        rem -= h;
        b.prev.copy(b.p);
        stepProjectile(b.p, b.v, h, this.wind, b.windT0 + b.age);
        b.age += h;
        // Players / targets first (they're in front of the ground they stand on).
        let hit = null;
        if (b.local) {
          for (const c of targets) {
            const r = segSegClosest(b.prev, b.p, c.a, c.b);
            if (r.d2 <= c.r * c.r && (!hit || r.s < hit.s)) hit = { s: r.s, cap: c };
          }
        }
        const wh = this.world.raycast(b.prev, b.p);
        if (hit && (!wh || hit.s <= wh.t)) {
          const ip = b.prev.clone().lerp(b.p, hit.s);
          this._onLocalHit(b, hit.cap, ip);
          dead = true;
        } else if (wh) {
          const d = wh.point.distanceTo(listener);
          if (b.chick) {
            // Chicken down... and back up. Ours gets up and goes hunting.
            this.effects.puff(wh.point.clone().add(new THREE.Vector3(0, 0.3, 0)), 'feather', 1.6, 1.2);
            if (b.local) this.chickens.spawn(wh.point.clone());
          } else {
            this.effects.impact(wh.point, wh.normal, wh.mat);
            this.audio.impact(wh.point, wh.mat, d / 343);
          }
          dead = true;
        }
        // Supersonic crack for enemy rounds passing near you.
        if (!b.local && !b.crackDone && this.player.alive) {
          const r = segSegClosest(b.prev, b.p, listener, listener);
          if (r.d2 < 30 * 30 && r.s < 0.999) {
            b.crackDone = true;
            const d = Math.sqrt(r.d2);
            if (b.chick) this.audio.chicken(b.prev.clone().lerp(b.p, r.s), 'squawk', d / 343);
            else this.audio.crack(b.prev.clone().lerp(b.p, r.s), d / 343, clamp(1 - d / 30, 0, 1));
            if (d < 6) this.hud.message('', b.chick ? 'Incoming chicken!' : 'Rounds incoming!', 1.2);
          }
        }
        if (b.age > BALLISTICS.maxLife || b.p.y < -200) dead = true;
      }
      this.effects.moveTracer(b.tracer, b.p, b.v);
      if (b.chick) {
        b.chick.position.copy(b.p);
        b.chick.lookAt(b.p.x + b.v.x, b.p.y + b.v.y, b.p.z + b.v.z);
        // Keep it a readable size on screen at any range (real size up close or in a big scope).
        const dcam = b.p.distanceTo(this.camera.position);
        b.chick.scale.setScalar(Math.max(1, dcam * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * 0.06));
        animateChicken(b.chick.userData.c, this.now * 1.7 + b.id, { flap: 1 });
      }
      if (this.sandbox && b.local) this.sandbox.trace(b, dead);
      if (dead) {
        this.effects.killTracer(b.tracer);
        if (b.chick) this.scene.remove(b.chick);
        this.bullets.splice(i, 1);
      }
    }
  }

  _onLocalHit(b, cap, ip) {
    const shot = this.myShots.get(b.id);
    const dist = shot ? shot.o.distanceTo(ip) : 0;
    const head = cap.part === 'head';
    if (cap.owner === 'chicken') {
      this.chickens.shot(cap.ref);
      this.effects.puff(ip, 'feather', 1.4, 1.2);
      this.hud.hitMarker(false);
      this.hud.message('', 'Chicken down', 1);
      return;
    }
    if (cap.owner === 'decoy' || cap.owner === 'dart' || cap.owner === 'drone' || cap.owner === 'hunter') {
      this.tools.onToolHit(cap, shot ? shot.o : ip);
      return;
    }
    if (cap.owner !== 'remote') {
      const t = cap.owner;
      t.swing = 0.0001;
      this.audio.plateHit(ip, dist / 343);
      this.hud.hitMarker(head);
      this.hud.addMarker(ip.clone().add(new THREE.Vector3(0, 0.6, 0)), head ? 'HEAD' : cap.part === 'torso' ? 'BODY' : 'LEGS', head ? 'hithead' : 'hitbody', 2.2);
      this.practiceStats = this.practiceStats || { hits: 0, best: 0 };
      this.practiceStats.hits++;
      if (head) this.practiceStats.best = Math.max(this.practiceStats.best, Math.round(dist));
      if (head && dist > 250 && !this.replay.active && shot) {
        this._ghostLooks(true);
        this.replay.start({ mode: 'practice', shooterHist: this.selfHist.slice(), victimHist: [], shot, impact: ip, onDone: () => {} });
        this._replayLabel('HEADSHOT', `${Math.round(dist)} m`);
      }
      return;
    }
    let dmg = (WEAPONS[shot && shot.wk] || WEAPONS.mk22).damage[cap.part];
    if (cap.part === 'torso' && this.tools.remote.vs === 'plate') dmg = Math.round(dmg * VEST.plateTorso);
    if (this.mv) dmg = Math.max(dmg || 0, PLAYER.hp); // "Do you want to develop an app?": any hit is the kill
    this.net.send({ t: 'hit', id: b.id, part: cap.part, dmg, dist: Math.round(dist), ip: ip.toArray().map((x) => Math.round(x * 100) / 100) });
    this.audio.hitConfirm(head, 0);
    this.hud.hitMarker(head);
    if (this.remoteHp - dmg <= 0) {
      this.remoteAlive = false;
      this.remoteDeadLock = true;
      this._startKillerReplay(b.id, ip, cap.part, dist);
    } else {
      this.remoteHp -= dmg;
      this.hud.message('HIT', `${PART_NAMES[cap.part]} · ${Math.round(dist)} m — they're wounded`, 2);
    }
  }

  _rangefind() {
    const P = this.player;
    if (P.rangeT > 0) return;
    P.rangeT = WEAPON.rangeCooldown;
    const o = P.eyePos(new THREE.Vector3());
    const d = P.aimDir(new THREE.Vector3());
    const end = o.clone().addScaledVector(d, 2000);
    const wh = this.world.raycast(o, end, true);
    let dist = wh ? wh.t * 2000 : null;
    for (const c of this._targetsForHit()) {
      const r = segSegClosest(o, end, c.a, c.b);
      if (r.d2 < (c.r + 0.3) ** 2 && (dist === null || r.s * 2000 < dist)) dist = r.s * 2000;
    }
    P.range = dist;
    P.rangeShow = 5;
    this.audio.click();
    // Auto-zero: dial the scope to the measured range so the crosshair is the hit point.
    if (RULES.autoZero && dist && P.def.scope && RULES.gravity > 0) {
      P.zero = Math.round(clamp(dist, 50, 1500) / 5) * 5;
      this.hud.message('', `Zero set ${P.zero} m`, 1.2);
    }
  }

  // -------------------------------------------------------------------------
  // Per-frame
  // -------------------------------------------------------------------------
  _frame() {
    if (this.suspended) return;
    let dt = Math.min(this.clock.getDelta(), 0.05);
    // Offline modes really pause; online matches keep running underneath the menu.
    if (this.paused && this.mode !== 'guest' && (this.offline || this.mode === 'practice')) {
      this.input.endFrame();
      if (this.composer) this.composer.render(0);
      else this.renderer.render(this.scene, this.camera);
      return;
    }
    dt *= this.timeScale;
    this.now += dt;
    this._adaptResolution(dt);
    const a = this.input.actions;
    const P = this.player;
    const live = this.phase === 'live';
    const canMove = this.phase !== 'end' && this.phase !== 'match' && this.phase !== 'hold';
    const free = this.phase === 'practice' || this.phase === 'wait' || this.phase === 'sandbox';
    const canFire = live || free;
    if (live || free) this.roundTime += dt;
    if (this.mode === 'guest' && (live || this.phase === 'sandbox')) this.uavT -= dt;
    if (this.mode === 'guest' && this.phase !== 'match') this.phaseT = Math.max(0, this.phaseT - dt);
    this._hostTick(dt);
    if (this.net) this.net.tick(dt);

    if (this.phase === 'practice' && this.input.pressed('KeyN')) {
      this.wind.set(Math.random() * Math.PI * 2, 1 + Math.random() * 6, Math.random() * 100);
      this.hud.message('NEW WIND', '', 1.2);
    }

    const replaying = this.replay.active;
    if (this.sandbox) this.sandbox.preUpdate(dt, a);
    const loadoutOk = this.phase === 'insert' || this.phase === 'wait' || this.phase === 'practice' || this.phase === 'sandbox';
    if (a.loadout && loadoutOk && !this.tools.drone) this.loadoutPanel.toggle();
    if (this.tools.drone && (!P.alive || replaying)) this.tools.endDrone('');
    if (this.tools.feed > 0 && (!P.alive || replaying)) this.tools.endFeed();
    if (a.feed && P.alive && !replaying) {
      if (this.tools.feed > 0) this.tools.endFeed();
      else if (this.tools.startFeed()) this.hud.message('', 'Predator feed — U to exit', 1.5);
    }
    if (!replaying && P.alive && this.tools.feed > 0) {
      // Watching the feed: your body stays where it is.
    } else if (!replaying && P.alive && this.tools.drone) {
      this.tools.updateDrone(dt, a);
      if (a.scout) this.tools.useScout();
    } else if (!replaying && P.alive) {
      if (canFire && a.scout) this.tools.useScout();
      if (canFire && a.tactical) this.tools.useTactical();
      if (canFire && a.supply) this.supply.call();
      if (a.bipod && P.alive) {
        const r = P.toggleBipod();
        if (r === 'blocked') this.hud.message('', P.def.slot !== 'rifle' ? 'Bipod is on the rifle' : 'Go prone and stop moving to set the bipod', 1.4);
      }
      const flyFrom = this.sandbox && this.sandbox.fly ? P.pos.clone() : null;
      P.update(dt, a, this.world, { canMove });
      if (flyFrom) this.sandbox.flyMove(dt, flyFrom);
      if (a.fire && canFire && P.sprinting) this.hud.message('', 'Stop sprinting to fire', 0.8);
      else if (a.fire && canFire) {
        if (P.canFire()) {
          this._fire();
          if (this.sandbox && this.sandbox.infAmmo) P.refill();
        }
        else if (P.w.chamber === 0 && P.cycleT <= 0 && P.reloadT <= 0 && P.switchT <= 0) {
          this.audio.click();
          P.startReload();
        }
      }
      if (a.range) this._rangefind();
    }
    // Self history for replays.
    if (!this._histT || this.now - this._histT > 1 / 30) {
      this._histT = this.now;
      if (P.alive) pushHist(this.selfHist, { t: this.now, p: P.pos.clone(), yaw: P.yaw, pitch: P.pitch, st: P.stance, sc: P.scopeT > 0.5 ? 1 : 0, z: P.zoom, moving: P.moving });
    }
    if (P.boltEvent) {
      this.audio.bolt(0.05);
      P.boltEvent = false;
    }
    if (P.bipodEvent) {
      // Hand reach (cloth), leg flick (clack), rifle settling (thud), fold (clack).
      if (P.bipodEvent === 'flick' || P.bipodEvent === 'stow') this.audio.click();
      if (P.bipodEvent === 'deploy') this.audio.footstep(P.pos);
      if (P.bipodEvent === 'reach') this.audio.footstep(P.pos);
      P.bipodEvent = null;
    }
    this._updateUplinks(dt, live);
    this._updateBullets(dt);
    this.tools.update(dt);
    this.supply.update(dt);
    this.chickens.update(dt);
    this._updatePractice(dt);
    this._updateRemote(dt);
    this._updatePings();

    // Network state.
    this.stateT -= dt;
    if (this.stateT <= 0) {
      this.stateT = 1 / NET.stateHz;
      this._sendState();
    }

    // Camera
    const feedView = this.tools.feed > 0 && !replaying;
    const droneView = (!!this.tools.drone || feedView) && !replaying;
    if (droneView !== this._thermalOn || (droneView && this.tools.remote.tp !== this._thermalTp)) {
      this._thermalOn = droneView;
      this._thermalTp = this.tools.remote.tp;
      setThermal(this.remote.root, droneView && !this.tools.remote.tp);
    }
    if (feedView) {
      this.tools.applyFeedCamera(this.camera);
    } else if (droneView) {
      this.tools.applyDroneCamera(this.camera);
    } else if (!replaying) {
      P.eyePos(this.camera.position);
      const s = P.sway();
      this.camera.rotation.set(P.pitch - s.y, P.yaw + s.x, 0, 'YXZ');
      this.camera.fov = P.fov();
      this.camera.near = P.scopeT > 0.5 && P.def.scope ? 1.0 : 0.05;
      this.camera.updateProjectionMatrix();
    } else {
      this.camera.near = 0.05;
      this.replay.update(dt);
    }
    this._updateViewmodel(dt, replaying);

    const w2 = this.wind.at(this.roundTime);
    this.world.update(dt, this.now, w2, this.camera.position);
    if (this.quality === 'high') {
      this.sun.target.position.copy(this.camera.position);
      this.sun.position.copy(this.camera.position).addScaledVector(this.sunDir, 400);
    } else {
      this.sun.position.copy(this.sunDir).multiplyScalar(400);
    }
    this.effects.update(dt, this.camera);
    if (this.atmos) this.atmos.update(dt, this.camera, HZ.uWind.value, (x, z) => this.world.heightAt(x, z));
    this.audio.setListener(this.camera);
    this.audio.setWind(w2.length());

    // HUD
    this.hud.update(dt, this);
    this.hud.scopeInfo(P, P.rangeShow > 0 && P.range ? `${Math.round(P.range)} m` : P.rangeShow > 0 ? '---' : '');
    this.hud.root.classList.toggle('replay', replaying);
    this._updateHints();
    if (this.vignette) {
      const u = this.vignette.uniforms;
      u.uDamage.value = Math.max(0, 1 - P.hp / 100) * (P.alive ? 0.8 : 0.3);
      u.uAmount.value = replaying ? 0.6 : 0.38;
      u.tDepth.value = this.composer.readBuffer.depthTexture;
      u.uNear.value = this.camera.near;
      u.uFar.value = this.camera.far;
      u.uTime.value = this.now;
      u.uInked.value = this.look === 'og' ? 0 : 1;
      u.uThermal.value = this.tools.thermalActive() && !replaying ? 1 : 0;
      u.uStatic.value = this.tools.feed > 0 && !replaying ? 1 : 0;
      u.uRes.value.set(this.renderer.domElement.width, this.renderer.domElement.height);
    }
    if (this.sandbox) this.sandbox.update(dt);
    this._syncLook(dt);
    // Touch toggles: breath releases itself when you unscope or run out of air.
    this.input.isScoped = P.scoped;
    if (this.input.breathLatched && (!P.scoped || P.breathLock > 0)) this.input.breathLatched = false;
    this.input.syncToggles();
    this.input.endFrame();
    if (this.composer) this.composer.render(dt);
    else this.renderer.render(this.scene, this.camera);
  }

  _updateViewmodel(dt, replaying) {
    this.viewmodel.setLook(this.tools.myLook());
    const P = this.player;
    const scopedRifle = P.def.scope && P.scopeT > 0.6;
    this.viewmodel.visible = !replaying && P.alive && !scopedRifle && !this.tools.thermalActive();
    this.viewmodel.update(dt, {
      def: P.def,
      scopeT: P.scopeT,
      cant: !this.settings || this.settings.pistolCant !== false,
      speed: P.speed,
      sprint: P.sprinting,
      bobPhase: P.bobPhase,
      cycleT: P.cycleT,
      reloadT: P.reloadT,
      reloadDur: P.reloadDur,
      reloadEmpty: P.reloadEmpty,
      switchT: P.switchT,
      bipodT: P.def.slot === 'rifle' ? P.bipodT || 0 : 0,
      bipodState: P.bipodState,
      bipodU: P.bipodU || 0,
      empty: (P.w.chamber === 0 && P.def.kind === 'semi') || (P.pollo && P.w.chamber === 0 && P.w.mag === 0),
      pollo: !!P.pollo,
      boltPending: !!P.boltPending,
    });
  }

  _updateRemote(dt) {
    if (this.mode === 'practice' || !this.remoteHist.length) { this.remote.setVisible(false); this.effects.setGlint(null, 0); return; }
    const s = sampleHist(this.remoteHist, this.now - NET.interpDelay);
    const visible = !this.replay.active && (this.remoteAlive || this.phase === 'end');
    this.remote.setVisible(visible && this.remoteAlive);
    if (!s) return;
    s.w = this.remoteWpn;
    this.remote.setLook(this.tools.remoteLook());
    this.remote.update(dt, s);
    // Scope glint: bright when they're scoped in and pointing at you.
    let glint = 0;
    const sp = scopePoint(s.p, s.yaw, s.pitch, s.st);
    if (visible && this.remoteAlive && s.sc && !this.remoteWpn && !this.tools.remote.kf && !this.tools.smokeBlocks(this.camera.position, sp)) {
      const toMe = this.camera.position.clone().sub(sp).normalize();
      const aim = new THREE.Vector3(-Math.sin(s.yaw) * Math.cos(s.pitch), Math.sin(s.pitch), -Math.cos(s.yaw) * Math.cos(s.pitch));
      const facing = Math.max(0, aim.dot(toMe));
      glint = Math.pow(facing, 70) * (ZOOM_GLINT[s.z] || 0.5) * (WEAPONS[this.remoteRifle] || WEAPONS.mk22).glint * this.palette.glint * (0.82 + 0.18 * Math.sin(this.now * 21));
      // The sun behind the viewer makes it worse.
      glint *= 0.75 + 0.35 * Math.max(0, -toMe.dot(this.sunDir));
      sp.addScaledVector(toMe, 0.45);
    }
    this.effects.setGlint(sp, glint, this.camera);
    // Footsteps within earshot.
    if (s.moving && this.remoteAlive) {
      const d = s.p.distanceTo(this.camera.position);
      this.footT -= dt;
      if (d < 45 && this.footT <= 0) {
        this.footT = s.st === 0 ? 0.42 : 0.7;
        this.audio.footstep(s.p);
      }
    }
  }

  _updateUplinks(dt, live) {
    const P = this.player;
    this.hacking = -1;
    const t = this.now;
    this.world.uplinks.forEach((u, i) => {
      const st = this.uplinkState[i];
      st.enemyHacking = this.remoteHack === i && this.remoteAlive && live;
      const near = P.alive && Math.hypot(P.pos.x - u.pos.x, P.pos.z - u.pos.z) < UPLINK.radius && Math.abs(P.pos.y - u.pos.y) < 3;
      const canHack = (live || this.phase === 'practice' || this.phase === 'sandbox') && near && st.owner !== this.me;
      if (canHack) {
        this.hacking = i;
        st.progress += dt;
        this.beepT -= dt;
        if (this.beepT <= 0) { this.beepT = 0.8; this.audio.beep(u.pos, false); }
        if (st.progress >= UPLINK.hackTime) {
          st.progress = 0;
          if (this.phase === 'sandbox') {
            st.owner = this.me;
            this.net.send({ t: 'reveal', who: 0, i });
            this._onReveal({ who: 0, i });
          } else if (this.mode === 'host') this._hostCapture(i, 0);
          else if (this.mode === 'guest') this.net.send({ t: 'cap', i });
          else { st.owner = this.me; this.hud.message(`UPLINK ${u.name} SECURED`, 'In a match this pings your opponent 3 times.', 3); }
        }
      } else if (!near) {
        // Progress decays slowly when you leave.
        st.progress = Math.max(0, st.progress - dt * 0.5);
      }
      // Visuals: owner colour, blinking when being hacked.
      let col;
      if (st.enemyHacking || this.hacking === i) col = Math.sin(t * 14) > 0 ? new THREE.Color(2.6, 1.4, 0.2) : new THREE.Color(0.3, 0.15, 0.05);
      else if (st.owner === this.me) col = new THREE.Color(0.3, 1.6, 2.4);
      else if (st.owner === 1 - this.me) col = new THREE.Color(2.6, 0.25, 0.2);
      else col = new THREE.Color(1.6, 1.6, 1.8);
      u.screenMat.color.copy(col);
      u.lamp.material.color.setRGB(Math.min(col.r, 1), Math.min(col.g, 1), Math.min(col.b, 1));
      u.ring.material.color.setRGB(Math.min(col.r, 1), Math.min(col.g, 1), Math.min(col.b, 1));
      u.ring.material.opacity = near ? 0.7 : 0.3;
      if (st.enemyHacking) {
        st.beep = (st.beep || 0) - dt;
        if (st.beep <= 0) { st.beep = 0.5; this.audio.beep(u.pos, true); }
      }
    });
  }

  _updatePings() {
    while (this.pings.length && this.pings[0] <= this.now) {
      this.pings.shift();
      if (!this.remoteAlive || !this.remoteHist.length) continue;
      const s = sampleHist(this.remoteHist, this.now - NET.interpDelay);
      this.hud.addMarker(s.p.clone().add(new THREE.Vector3(0, 1.2, 0)), this.oppName.toUpperCase(), 'enemy', UPLINK.pingInterval + 0.8);
      this.audio.ping();
    }
  }

  _updatePractice(dt) {
    for (const t of this.targets) {
      if (t.mover && t.swing === 0) {
        t.pos.x += t.dir * 1.7 * dt;
        if (Math.abs(t.pos.x - t.base) > 45) t.dir *= -1;
        t.pos.y = this.world.heightAt(t.pos.x, t.pos.z);
      }
      if (t.swing > 0) {
        t.swing += dt;
        const k = t.swing;
        t.plate.rotation.x = k < 0.25 ? -(k / 0.25) * 1.1 : -1.1 * Math.max(0, 1 - (k - 1.6) / 0.4);
        if (k > 2.0) { t.swing = 0; t.plate.rotation.x = 0; }
      }
    }
  }

  _updateHints() {
    const P = this.player;
    let h = '';
    if (this.phase === 'wait' && this.mode === 'host') h = `Waiting for your friend… code <b>${this.hostCode}</b> — roam the valley meanwhile`;
    else if (this.phase === 'wait') h = 'Connecting…';
    else if (this.phase === 'insert') h = `Insertion — weapons cold · ${Math.ceil(this.phaseT)} · <b>L</b> loadout`;
    else if (this.hacking >= 0) h = `HACKING UPLINK ${this.world.uplinks[this.hacking].name}… ${Math.round((this.uplinkState[this.hacking].progress / UPLINK.hackTime) * 100)}%`;
    else if (!P.alive && !this.replay.active) h = 'You are down — next round soon';
    else if (P.ammo === 0 && P.reserve === 0) h = 'Out of ammo';
    else if (P.boltPending && P.scoped) h = P.autoCycle ? 'Release fire to cycle the bolt' : 'Unscope to cycle the bolt';
    else if (P.stance === 2 && !P.moving && P.def.slot === 'rifle' && (P.bipodState || 'stowed') === 'stowed' && P.scoped) h = `<b>${this.input.touch ? 'BIPOD' : 'X'}</b> set bipod`;
    const enemyHack = this.uplinkState.findIndex((u) => u.enemyHacking);
    if (enemyHack >= 0 && this.phase === 'live') h = (h ? h + ' · ' : '') + `⚠ ENEMY HACKING UPLINK ${this.world.uplinks[enemyHack].name}`;
    if (h !== this._lastHint) {
      this._lastHint = h;
      this.hud.el.hint.innerHTML = h;
    }
  }

  _adaptResolution(dt) {
    this.frameTimes.push(dt);
    if (this.frameTimes.length < 90) return;
    const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
    this.frameTimes.length = 0;
    let pr = this.pr;
    if (avg > 1 / 40 && pr > this.basePR * 0.55) pr = Math.max(this.basePR * 0.55, pr * 0.85);
    else if (avg < 1 / 58 && pr < this.basePR) pr = Math.min(this.basePR, pr * 1.1);
    if (Math.abs(pr - this.pr) > 0.01) {
      this.pr = pr;
      this.renderer.setPixelRatio(pr);
      this._resize();
    }
  }

  // -------------------------------------------------------------------------
  // Multiverse hooks (see src/multiverse/dimensions/valley/index.js)
  // -------------------------------------------------------------------------
  // The transition out of the valley has started: hands off, chrome away.
  mvFreeze() {
    this.frozen = true;
    this.input.enabled = false;
    this.input.keys.clear();
    this.input.mouseFire = this.input.mouseScope = false;
    this.input.move.x = this.input.move.y = 0;
    this.input.resetScope();
    this.hud.show(false);
    this.hud.card('');
    this.pendingCard = null;
    // The valley's own pause menu must not ride along into the next dimension.
    document.getElementById('pause').classList.remove('on');
    this.paused = false;
    document.getElementById('touch').classList.remove('active');
    if (this.loadoutPanel.open) {
      this.loadoutPanel.open = false;
      this.loadoutPanel.wrap.classList.remove('on');
      this.toolsOpen = false;
    }
    if (document.pointerLockElement === this.renderer.domElement) document.exitPointerLock();
  }

  // Another dimension is on screen: stop everything, keep the world for later.
  mvSuspend() {
    this.mvFreeze();
    this.suspended = true;
    this.renderer.setAnimationLoop(null);
    this.renderer.domElement.style.display = 'none';
    if (this.replay.active) this.replay.stop();
    if (this.tools.feed > 0) this.tools.endFeed();
    this.tools.reset();
    for (const k of ['mydrone', 'myhunter', 'enemydrone', 'enemyhunter']) this.audio.stopLoop(k);
    this.bullets.forEach((b) => b.tracer && this.effects.killTracer(b.tracer));
    this.bullets.length = 0;
    this.pings.length = 0;
    this.hud.clearMarkers();
    this.remote.setVisible(false);
    this.remoteAlive = false;
    this.audio.setWind(0);
    if (this.audio.windGain) this.audio.windGain.gain.setTargetAtTime(0, this.audio.ctx.currentTime, 0.15);
    this.phase = 'hold';
  }

  // Back on screen (still frozen, under the transition) — mvBegin starts the round.
  // pre = { sides, spawns } for the coming round, known to both clients in advance, so the
  // view the transition arrives on is the view the round starts from.
  mvResume(pre) {
    this.suspended = false;
    this.frozen = true;
    this.phase = 'hold';
    this.result = null;
    this.renderer.domElement.style.display = '';
    const side = pre ? pre.sides[this.me] : 0;
    const sp = pre && this.world.spawns[String(side)] && this.world.spawns[String(side)][pre.spawns[this.me]];
    if (sp) {
      this._mvSpawn = pre.spawns;
      this.player.reset(sp, side < 0 ? Math.PI : 0);
      this.player.zero = 400;
    } else this._spawnFree();
    this.player.eyePos(this.camera.position);
    this.camera.rotation.set(this.player.pitch, this.player.yaw, 0, 'YXZ');
    this.camera.fov = WEAPON.baseFov;
    this.camera.updateProjectionMatrix();
    this._resize();
    this.clock.getDelta();
    this.renderer.setAnimationLoop(() => this._frame());
  }

  // opening = the first round of the match: it must play exactly like the classic game's
  // (the lobby beat, the "match starting" message, the same delay before round 1).
  mvBegin(scores, round, opening) {
    this.frozen = false;
    this.scores = scores.slice();
    this.round = round - 1;
    this.hud._scoreKey = ''; // the number of pips may have changed
    this.hud.show(true);
    document.getElementById('touch').classList.add('active');
    this.input.enabled = true;
    if (!opening) this.input.requestLock();
    if (this.mode !== 'host') return;
    if (opening) {
      this.hud.message(this.offline ? 'AI OPPONENT READY' : 'OPPONENT CONNECTED', 'Match starting…', 2.5);
      setTimeout(() => this._hostStartRound(), 1500);
    } else this._hostStartRound();
  }

  // Round one, before anything has been revealed: the valley waits exactly as the classic
  // game does (free to roam, HUD on) instead of being frozen under a transition.
  mvLobby() {
    this.frozen = false;
    this.phase = 'wait';
    this.hud.show(true);
    document.getElementById('touch').classList.add('active');
    this.input.enabled = true;
    this.input.requestLock();
  }

  // Draw the current view into a 2D context (a WebGL canvas can only be copied in the
  // same task it was rendered in).
  mvCapture(g, w, h) {
    if (this.composer) this.composer.render(0);
    else this.renderer.render(this.scene, this.camera);
    g.drawImage(this.renderer.domElement, 0, 0, w, h);
  }

  // HUD text helpers
  timerText() {
    if (this.phase === 'practice') return 'RANGE';
    if (this.phase === 'sandbox') return 'SANDBOX';
    if (this.phase === 'wait') return '--:--';
    if (this.phase === 'match') return 'FINAL';
    const t = Math.max(0, Math.ceil(this.phaseT));
    return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
  }
  roundText() {
    if (this.phase === 'practice') return 'SOLO';
    if (this.phase === 'wait') return 'LOBBY';
    if (this.phase === 'sandbox') return 'B · TOOLS';
    return `RND ${String(this.round).padStart(2, '0')}`;
  }
  phaseText() {
    if (this.phase === 'practice') {
      const s = this.practiceStats;
      return s ? `${s.hits} HITS · BEST ${s.best}M` : 'NO HITS';
    }
    if (this.phase === 'live' || this.phase === 'sandbox') return `UAV IN ${Math.max(0, Math.ceil(this.uavT))}S`;
    return { wait: 'STANDBY', hold: 'STANDBY', insert: 'INSERTION', live: 'WEAPONS HOT', end: 'ROUND OVER', match: 'MATCH OVER' }[this.phase] || '';
  }
}

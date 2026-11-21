// The Multiverse director: owns the match (score, rounds, who plays where), mounts one
// dimension at a time, and on every point runs a transition that swaps it for the next.
// See contract.js for what dimensions and transitions can rely on.
//
// Authority: offline the director decides everything; online the HOST does (points, the
// next dimension, the transition and their seeds) and the guest follows its messages.
import { Stage } from './stage.js';
import { MvInput } from './input.js';
import { AudioKit } from './audiokit.js';
import { MvHud } from './hud.js';
import { Mux } from './transport.js';
import { loadDimension, loadTransition, playableDimensions, playableTransitions, firstTransition, dimensionKind, chainOf, chainedDimensions, openerDimension, exitOf, metaOf } from './registry.js';
import { PLAYER_COLORS, DEFAULTS, BOT_SKILL } from './contract.js';
import { mulberry32 } from '../util.js';
import finale from './finale.js';

const BOT_NAMES = { easy: 'RECRUIT AI', normal: 'VETERAN AI', hard: 'ELITE AI' };
const STATE_HZ = 20;
const INTERP = 0.1; // seconds the remote puppet runs behind
const OVER_SLOWMO = 0.35;
const FINALE = '@finale';
const VOID = '@void';
const FAULT = 'REALITY FAULT';
const clean = (s, d) => String(s || d).replace(/[<>&"]/g, '').slice(0, 16) || d;
const label = (s) => String(s || '').replace(/[<>&"]/g, '').slice(0, 40).toUpperCase(); // kill labels run longer than callsigns

// What a round shows when its world could not be built: static, until the host moves the match on.
const voidWorld = {
  id: VOID, name: 'STATIC', tagline: '', perspective: '', renderer: '2d', aim: 'pointer',
  palette: { bg: '#000000', fg: '#e8e6f0', accent: '#e8e6f0' }, controls: {},
  create(ctx) {
    let t = 0;
    return {
      update(dt) { t += dt; },
      render() {
        const g = ctx.g, w = ctx.width, h = ctx.height;
        g.fillStyle = '#050508';
        g.fillRect(0, 0, w, h);
        g.fillStyle = 'rgba(232,230,240,0.07)';
        for (let i = 0; i < 90; i++) {
          const y = ((Math.sin(i * 91.7 + Math.floor(t * 24) * 13.1) * 0.5 + 0.5) * h) | 0;
          g.fillRect(0, y, w, 1 + (i % 3));
        }
      },
      dispose() {},
    };
  },
};

function shuffled(list, rng) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
const mixSeed = (a, b) => (Math.imul((a ^ 0x9e3779b9) >>> 0, 2654435761) ^ Math.imul((b + 0x7f4a7c15) >>> 0, 40503)) >>> 0;

export class Director {
  /**
   * @param {Object} o
   * @param {'ai'|'host'|'guest'} o.mode
   * @param {Object} [o.net]        legacy Net (online modes)
   * @param {Object} o.audio        the game's Audio instance (already unlocked by a user gesture)
   * @param {Object} o.settings     live settings object (sensitivity, invertY, touchSens*)
   * @param {string} o.name         local callsign
   * @param {string} [o.oppName]
   * @param {string} [o.difficulty] 'easy' | 'normal' | 'hard'
   * @param {Object} [o.match]      guest: { seed, target, first } from the host's hello
   * @param {Object} [o.valley]     { build(opts) → Promise<Game> } supplied by main.js
   * @param {Object} [o.dev]        parsed dev URL parameters
   * @param {Function} [o.onExit]
   */
  constructor(o) {
    this.o = o;
    this.mode = o.mode;
    this.online = o.mode !== 'ai';
    this.authority = o.mode !== 'guest';
    this.me = o.mode === 'guest' ? 1 : 0;
    this.dev = { auto: false, speed: 1, next: [], fx: null, ...(o.dev || {}) };
    this.botSkill = this.dev.skill ?? BOT_SKILL[o.difficulty] ?? BOT_SKILL.normal;
    const mine = clean(o.name, 'Ghost');
    const theirs = this.online ? clean(o.oppName, 'Opponent') : BOT_NAMES[o.difficulty] || BOT_NAMES.normal;
    this.players = [0, 1].map((i) => ({
      index: i,
      name: i === this.me ? mine : theirs,
      color: PLAYER_COLORS[i],
      isLocal: i === this.me,
      isBot: !this.online && i !== this.me,
    }));
    this.target = Math.max(1, (o.match && o.match.target) || this.dev.target || o.target || DEFAULTS.target);
    this.matchSeed = ((o.match && o.match.seed) ?? this.dev.seed ?? Math.floor(Math.random() * 0xffffffff)) >>> 0;
    this.first = (o.match && o.match.first) || this.dev.dim || o.first || 'valley';
    // The owner's hidden menu: worlds / transitions switched off for matches this client
    // decides (hosting or solo), and `only` = play one world round after round.
    this.off = new Set([...((o.off && o.off.dims) || []), ...((o.off && o.off.fx) || [])]);
    this.only = (!this.online && o.only) || null;
    this.revealed = !!this.only; // nothing to reveal when a world was picked by hand
    this.queue = []; // worlds that must come next, ahead of the rotation

    this.score = [0, 0];
    this.round = 1;
    this.history = [];
    this.phase = 'idle'; // idle | loading | intro | live | over | transition | final
    this.dimPhase = 'intro';
    this.time = 0;
    this.sudden = false;
    this.result = null;
    this.mod = null;
    this.inst = null;
    this.natives = new Map();
    this.fx = null;
    this.next = null;
    this.paused = false;
    this.broken = new Set();
    this.errors = [];
    this.log = [];
    this.selfReady = 0;
    this.peerReady = 0;
    this.goRound = 0;
    this.settled = 0; // last round whose point has been applied here
    this.points = new Map(); // guest: points that arrived before this client reached their round
    this.claims = new Map(); // host: claims that arrived before the host was live in their round
    this.peerFault = 0; // host: latest round the guest reported it cannot play
    this.voided = false;
    this.faultDim = null;
    this.pendingRematch = null;
    this.rematchAsked = false;
    this.remoteBuf = [];
    this.remoteOut = null;
    this.pendingState = null;
    this.stateT = 0;
    this.lab = null;
    this._frameBound = (t) => this._frame(t);
  }

  get state() {
    return {
      phase: this.phase, round: this.round, score: this.score.slice(), target: this.target,
      dim: this.mod ? this.mod.id : null, fx: this.fx && this.fx.mod ? this.fx.mod.id : null,
      online: this.online, me: this.me, errors: this.errors.slice(), log: this.log.slice(-200),
    };
  }

  _log(ev, extra) {
    this.log.push({ t: Math.round(performance.now()), ev, ...extra });
    if (this.log.length > 400) this.log.splice(0, 100);
  }

  _error(where, e) {
    const msg = `${where}: ${e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e}`;
    console.error('[multiverse]', where, e);
    this.errors.push(msg);
  }

  // ---------------------------------------------------------------------------
  // Start-up
  // ---------------------------------------------------------------------------
  async start() {
    this.phase = 'loading';
    this.stage = new Stage();
    this.stage.onResize = (w, h) => {
      if (this.inst && this.inst.resize && !this.mod.native) {
        try { this.inst.resize(w, h); } catch (e) { this._error('resize', e); }
      }
    };
    this.input = new MvInput({ stageEl: this.stage.root, settings: this.o.settings || {} });
    this.input.onPause = () => this._pause(true);
    this.audio = new AudioKit(this.o.audio);
    // iPadOS interrupts the audio context (calls, Siri, app switches): any touch, click or
    // key brings it back, as does returning to the page.
    const wake = () => { try { this.o.audio.unlock(); } catch {} };
    for (const ev of ['pointerdown', 'touchend', 'keydown']) addEventListener(ev, wake, { capture: true, passive: true });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) wake(); });
    this.hud = new MvHud(this.input);
    this.hudApi = {
      message: (a, b, c) => this.hud.message(a, b, c),
      cooldown: (s, f) => this.hud.cooldown(s, f),
      charges: (s, n) => this.hud.charges(s, n),
    };
    this.hud.setPlayers(this.players, this.me);
    this.hud.setScore(this.score, this.target);
    this._resetBags();
    this._armOpener();
    if (this.online) this._wireNet();

    if (this.dev.fxlab) return this._startLab();

    await this._mountSafe({ dim: this.first, seed: mixSeed(this.matchSeed, 1) });
    this.last = performance.now();
    this.raf = requestAnimationFrame(this._frameBound);
    this._ready();
  }

  _resetBags() {
    this.pick = mulberry32(mixSeed(this.matchSeed, 0xb0b));
    // The opening world does not come round again until every other one has been seen.
    this.dimBag = shuffled(this._rotation().filter((id) => id !== this.first), this.pick);
    this.fxBag = [];
  }

  // The worlds the rotation draws from: everything playable except worlds that are only
  // reached through their lead-in (see `then` in the registry).
  _usable(id) { return !this.broken.has(id) && !this.off.has(id); }

  // The owner's showpiece (the surfing world and the underwater world it falls into) is
  // guaranteed in the first match this device hosts: it is queued to follow the first kill,
  // so even the shortest match plays both. Later matches and rematches meet it by chance.
  _armOpener() {
    if (!this.authority || !this.o.opener || this.only || this.first !== 'valley') return;
    const id = openerDimension((x) => this._usable(x));
    if (!id) return;
    this.queue.push(id);
    if (this.o.onOpener) this.o.onOpener();
  }

  _rotation() {
    const ok = (id) => this._usable(id);
    const chained = chainedDimensions(ok);
    return playableDimensions().filter((id) => ok(id) && !chained.includes(id));
  }

  // Shuffle bags: nothing repeats until everything has been seen, and never twice in a row.
  _draw(bagKey, all, current) {
    const pool = all.filter((id) => !this.broken.has(id));
    if (!pool.length) return null;
    if (pool.length === 1) return pool[0];
    let bag = this[bagKey].filter((id) => pool.includes(id));
    if (!bag.length) bag = shuffled(pool, this.pick);
    let i = bag.findIndex((id) => id !== current);
    if (i < 0) { bag = shuffled(pool, this.pick); i = bag.findIndex((id) => id !== current); }
    const [id] = bag.splice(i, 1);
    this[bagKey] = bag;
    return id;
  }

  // The next world: still a shuffle bag (nothing repeats until everything has been seen),
  // but from what is left in the bag take the one LEAST like the worlds just played, so a
  // match keeps changing viewpoint (first person / third person / top-down / side-on) and
  // look (2D / 3D) instead of serving two of a kind in a row.
  // `kill` = the round ended with a kill: only then does a chained world follow (the chain
  // is a story beat about the loser, so a drawn round moves on like any other).
  _nextDim(kill) {
    this.linkFx = null;
    if (this.dev.next.length) return this.dev.next.shift();
    if (this.only && !this.broken.has(this.only)) return this.only;
    const cur = this.mod && this.mod.id;
    while (this.queue.length) {
      const id = this.queue.shift();
      if (!this._usable(id) || id === cur) continue;
      this.dimBag = this.dimBag.filter((x) => x !== id);
      this.prevDim = cur;
      return id;
    }
    const link = kill ? chainOf(cur, (id) => this._usable(id)) : null;
    if (link) {
      this.linkFx = link.fx;
      this.prevDim = cur;
      return link.dim;
    }
    const pool = this._rotation();
    if (pool.length <= 1) return pool[0] || this.first;
    let bag = this.dimBag.filter((id) => pool.includes(id) && id !== cur);
    if (!bag.length) bag = shuffled(pool.filter((id) => id !== cur), this.pick);
    const last = dimensionKind(cur), prev = dimensionKind(this.prevDim);
    const cost = (id) => {
      const k = dimensionKind(id);
      return (k.view === last.view ? 4 : 0) + (k.look === last.look ? 2 : 0) + (k.view === prev.view ? 1 : 0);
    };
    let best = 0;
    for (let i = 1; i < bag.length; i++) if (cost(bag[i]) < cost(bag[best])) best = i; // ties keep the shuffled order
    const [id] = bag.splice(best, 1);
    this.dimBag = bag;
    this.prevDim = cur;
    return id;
  }

  _nextFx() {
    if (this.dev.fx) return this.dev.fx;
    // The first point of a match gets the reveal.
    if (!this.revealed) {
      this.revealed = true;
      const id = firstTransition();
      if (id && this._usable(id)) return id;
    }
    // A chained pair of worlds brings its own transition.
    if (this.linkFx) { const id = this.linkFx; this.linkFx = null; return id; }
    // A world with a way out of its own leaves by it (a drawn round is no exit: nobody won it).
    const out = this._killExit ? exitOf(this.mod && this.mod.id, (id) => this._usable(id)) : null;
    if (out) return out;
    return this._draw('fxBag', playableTransitions().filter((id) => !this.off.has(id)), this.lastFx) || 'none';
  }

  // ---------------------------------------------------------------------------
  // Network
  // ---------------------------------------------------------------------------
  _wireNet() {
    const tp = (this.transport = new Mux(this.o.net));
    const hello = () => tp.send({
      t: 'hello', name: this.players[this.me].name, pal: this.o.settings && this.o.settings.pal,
      ...(this.authority && this.o.hello ? this.o.hello() : {}), // the host's valley rules ride along, as in the classic game
      ...(this.authority ? { mv: { seed: this.matchSeed, target: this.target, first: this.first, v: 1 } } : { mvAck: 1 }),
    });
    tp.on('hello', (m) => {
      const p = this.players[1 - this.me];
      p.name = clean(m.name, 'Opponent');
      this.hud.setPlayers(this.players, this.me);
      if (this.authority && !m.mvAck) { hello(); this.helloAt ||= performance.now(); }
    });
    tp.on('close', () => this._lost());
    tp.on('mv', (m) => this._onCtl(m));
    tp.on('md', (m) => {
      if (m.r !== this.round || !this.inst || this.mod.native || !this.inst.onNet || this.instDead) return;
      try { this.inst.onNet(m.d); } catch (e) { this._error('onNet', e); }
    });
    tp.on('ms', (m) => {
      if (m.r !== this.round) return;
      const buf = this.remoteBuf;
      buf.push({ t: performance.now() / 1000, s: m.s });
      if (buf.length > 16) buf.shift();
      // The host's round clock is the reference: ease ours onto it.
      if (!this.authority && typeof m.c === 'number' && this.phase === 'live') {
        const err = m.c + tp.rtt / 2000 - this.time;
        if (Math.abs(err) > 0.03) this.time += Math.max(-0.25, Math.min(0.25, err)) * 0.2;
      }
    });
    hello();
  }

  _onCtl(m) {
    switch (m.k) {
      case 'claim': {
        if (!this.authority || m.r < this.round) break;
        const v = m.victim ? 1 : 0;
        if (m.r === this.round && this.phase === 'live') this._point(1 - v, v, label(m.how));
        else this.claims.set(m.r, m); // not live here yet: settle it the moment we are
        break;
      }
      case 'fault':
        if (!this.authority || m.r < this.round) break;
        if (m.dim) this.broken.add(m.dim);
        this.peerFault = Math.max(this.peerFault, m.r);
        if (m.r === this.round && this.phase === 'live') this._point(-1, -1, FAULT);
        break;
      case 'point':
        if (!this.authority) this._applyPoint(m);
        break;
      case 'ready':
        this.peerReady = Math.max(this.peerReady, m.r);
        if (this._staleShown) { this._staleShown = false; this.hud.card(''); }
        if (this.authority) this._maybeGo();
        break;
      case 'go':
        if (this.authority) break;
        this.goRound = Math.max(this.goRound, m.r);
        if (this.selfReady === this.round && this.goRound >= this.round) this._go();
        break;
      case 'rematch?':
        if (!this.authority) break;
        if (this.phase === 'final') this._rematch();
        else this.rematchAsked = true; // asked before our own card is up: honoured when it is
        break;
      case 'rematch':
        if (this.authority) break;
        if (this.phase === 'final') this._applyRematch(m);
        else this.pendingRematch = m;
        break;
    }
  }

  _lost() {
    if (this.phase === 'idle') return;
    this._log('lost');
    // Before the reveal the valley reports it itself, exactly as the classic game does.
    if (this.settled === 0 && this.mod && this.mod.native && !this.fx) return;
    this.input.setEnabled(false);
    if (this.mod && this.mod.native && this.inst && this.inst.freeze) {
      try { this.inst.freeze(); } catch (e) { this._error('freeze', e); }
    }
    // Until the first point lands nothing may hint that this is anything but the classic duel.
    const where = this.settled === 0 ? 'game' : 'match';
    this.hud.card(`<h2 class="lose">CONNECTION LOST</h2><p>${this.players[1 - this.me].name} left the ${where}.</p>`, [{ label: 'Back to menu', primary: true, onClick: () => this.exit() }]);
  }

  _netFlush(dt) {
    this.stateT -= dt;
    if (this.stateT > 0 || !this.pendingState) return;
    this.stateT = 1 / STATE_HZ;
    const m = { t: 'ms', r: this.round, s: this.pendingState };
    if (this.authority && this.phase === 'live') m.c = Math.round(this.time * 1000) / 1000;
    this.transport.send(m);
    this.pendingState = null;
  }

  // Interpolate the remote player's snapshots INTERP seconds in the past.
  _sampleRemote() {
    const buf = this.remoteBuf;
    if (!buf.length) { this.remoteOut = null; return; }
    const at = performance.now() / 1000 - INTERP;
    let i = buf.length - 1;
    while (i > 0 && buf[i].t > at) i--;
    const a = buf[i], b = buf[i + 1];
    if (!b || at <= a.t) { this.remoteOut = a.s; return; }
    const k = Math.min(1, (at - a.t) / Math.max(1e-4, b.t - a.t));
    const out = (this._remoteScratch ||= {});
    for (const key in out) if (!(key in b.s)) delete out[key];
    const angles = this.angleFields;
    for (const key in b.s) {
      const va = a.s[key], vb = b.s[key];
      if (typeof va === 'number' && typeof vb === 'number') {
        if (angles && angles.includes(key)) {
          let d = (vb - va) % (Math.PI * 2);
          if (d > Math.PI) d -= Math.PI * 2;
          else if (d < -Math.PI) d += Math.PI * 2;
          out[key] = va + d * k;
        } else out[key] = va + (vb - va) * k;
      } else out[key] = k < 0.5 && va !== undefined ? va : vb;
    }
    this.remoteOut = out;
  }

  // ---------------------------------------------------------------------------
  // Mounting dimensions
  // ---------------------------------------------------------------------------
  _ctx(mod, round, seed) {
    const d = this;
    const net = !this.online
      ? { online: false, sendState() {}, remote: null, send() {} }
      : {
          online: true,
          sendState(s) { if (d.round === round) d.pendingState = s; },
          get remote() { return d.round === round ? d.remoteOut : null; },
          send(msg) { if (d.round === round) d.transport.send({ t: 'md', r: round, d: msg }); },
        };
    return {
      get width() { return d.stage.width; },
      get height() { return d.stage.height; },
      get dpr() { return d.stage.dpr; },
      get safe() { return d.input.safe; },
      canvas: this.stage.canvas,
      g: this.stage.g,
      three: mod.renderer === 'three' ? this.stage.three() : undefined,
      me: this.me,
      players: this.players,
      opponent: this.online ? 'remote' : 'bot',
      botSkill: this.botSkill,
      autopilot: !!this.dev.auto,
      get phase() { return d.round === round ? d.dimPhase : 'over'; },
      get time() { return d.time; },
      get sudden() { return d.sudden; },
      get result() { return d.result; },
      round,
      get score() { return d.score; },
      target: this.target,
      input: this.input.state,
      audio: this._audioFor((this.dimAudioTag = 'dim' + round)),
      hud: this.hudApi,
      net,
      seed,
      rng: mulberry32(seed),
      kill: (victim, info) => d._kill(round, victim, info),
      final: mod === finale ? { winner: this.score[0] === this.score[1] ? -1 : this.score[0] > this.score[1] ? 0 : 1 } : undefined,
    };
  }

  _nativeCtx(mod, round) {
    return {
      mode: this.mode,
      transport: this.transport ? this.transport.legacy() : null,
      players: this.players,
      me: this.me,
      score: this.score.slice(),
      target: this.target,
      round,
      difficulty: this.o.difficulty || 'normal',
      valley: this.o.valley,
      seed: mixSeed(this.matchSeed, round) >>> 0,
      secret: () => this.settled === 0,
      roundOver: (winner, info) => this._nativeOver(round, winner, info),
    };
  }

  async _mount(next) {
    const mod = next.dim === FINALE ? finale : next.dim === VOID ? voidWorld : await loadDimension(next.dim);
    const round = this.round;
    this.voided = false;
    this.remoteBuf.length = 0;
    this.remoteOut = null;
    this.pendingState = null;
    this.result = null;
    this.time = 0;
    this.sudden = false;
    this.claimed = false;
    this.instDead = false;
    this.dimPhase = 'intro';
    this.holdIntro = true;
    this.angleFields = mod.angleFields || null;
    this.hud.setTheme(mod.palette);
    if (mod.native) {
      this.stage.show(null);
      this.hud.show(false);
      this.input.setEnabled(false);
      const ctx = this._nativeCtx(mod, round);
      let inst = this.natives.get(mod.id);
      if (!inst) { inst = await mod.create(ctx); this.natives.set(mod.id, inst); }
      else inst.resume(ctx);
      this.mod = mod;
      this.inst = inst;
    } else {
      this.stage.show(mod.renderer);
      this.input.configure(mod);
      this.hud.setDimension(mod, round);
      this.hud.setScore(this.score, this.target);
      this.mod = mod;
      this.inst = mod.create(this._ctx(mod, round, next.seed));
      if (!this.inst || typeof this.inst.update !== 'function' || typeof this.inst.render !== 'function') throw new Error('create() must return { update, render, dispose }');
    }
    // GPU resource counts at each mount: a dimension that leaks shows up as steady growth.
    const info = this.stage.renderer && this.stage.renderer.info.memory;
    this._log('mount', { dim: mod.id, round, ...(info ? { geo: info.geometries, tex: info.textures } : {}) });
  }

  // Mount a dimension. One that cannot even be built voids its round: this client shows
  // static, says so, and the host moves the match on without a point — the same path as a
  // dimension that throws mid-round, so both clients always stay in step.
  async _mountSafe(next) {
    try {
      await this._mount(next);
    } catch (e) {
      this._error(`mount ${next.dim}`, e);
      if (next.dim !== FINALE && next.dim !== VOID) this.broken.add(next.dim);
      this._disposeInst();
      await this._mount({ ...next, dim: VOID });
      this.voided = true;
      this.faultDim = next.dim;
      if (this.online && !this.authority) this.transport.send({ t: 'mv', k: 'fault', r: this.round, dim: next.dim });
    }
  }

  _disposeInst() {
    const inst = this.inst, mod = this.mod;
    this.inst = null;
    if (!inst || !mod) return;
    try {
      if (mod.native) inst.suspend();
      else inst.dispose();
    } catch (e) { this._error(`dispose ${mod.id}`, e); }
    this._endMusic(this.dimAudioTag);
  }

  // Each module gets its own view of the audio kit: the music slot is shared, and the old
  // world, the transition and the new world overlap in time — a module may only stop a
  // score it started, and the director ends whatever a module left playing.
  _audioFor(tag) {
    const k = this.audio, d = this;
    return {
      get ctx() { return k.ctx; },
      get out() { return k.out; },
      get now() { return k.now; },
      tone: (o) => k.tone(o),
      noise: (o) => k.noise(o),
      sfx: (n, o) => k.sfx(n, o),
      music: (spec) => { d.musicOwner = tag; k.music(spec); },
      stopMusic: (fade) => { if (d.musicOwner === tag) { d.musicOwner = null; k.stopMusic(fade); } },
      duck: (a, t) => k.duck(a, t),
    };
  }

  _endMusic(tag) {
    if (tag && this.musicOwner === tag) { this.musicOwner = null; this.audio.stopMusic(0.3); }
  }

  // ---------------------------------------------------------------------------
  // Round flow
  // ---------------------------------------------------------------------------
  // The dimension is mounted and visible; wait until both sides are, then start it. Online
  // nobody starts alone: the channel is reliable, so we simply wait for the other side.
  _ready() {
    this.phase = 'intro';
    this.selfReady = this.round;
    this.readyAt = performance.now();
    this._waitShown = false;
    if (!this.online) return this._go();
    this.transport.send({ t: 'mv', k: 'ready', r: this.round });
    if (this.authority) this._maybeGo();
    else if (this.goRound >= this.round || this.points.has(this.round)) this._go();
  }

  _maybeGo() {
    if (!this.authority || this.selfReady !== this.round || this.phase !== 'intro' || !this.holdIntro) return;
    if (this.peerReady < this.round) return;
    this.transport.send({ t: 'mv', k: 'go', r: this.round });
    this._go();
  }

  _go() {
    if (this.phase !== 'intro' || !this.holdIntro) return;
    this.holdIntro = false;
    if (this._waitShown) { this._waitShown = false; this.hud.message('', '', 0); }
    this._log('go', { round: this.round });
    const mod = this.mod;
    // Already decided while this client was away: catch up with a hard cut.
    const stored = this.points.get(this.round);
    if (stored) {
      this.points.delete(this.round);
      this.phase = this.dimPhase = 'live';
      return this._applyPoint({ ...stored, next: { ...stored.next, fx: 'none' } }, true);
    }
    // Cannot be played (here or on the other device): void it.
    if (this.instDead || this.voided || (this.authority && this.peerFault >= this.round)) {
      this.phase = this.dimPhase = 'live';
      return this._voidRound();
    }
    if (mod.native) {
      this.phase = 'live';
      this.dimPhase = 'live';
      this.time = 0;
      try { this.inst.begin(); } catch (e) { this._error('native begin', e); }
      this._onLive();
    } else {
      this.introT = DEFAULTS.introTime;
      this.hud.message('', '', 0);
      this.hud.show(true);
      this.hud.title(mod, this.round, true);
      this.input.setEnabled(true);
      if (mod.aim === 'look') this.input.requestLock();
      this._call('onPhase', 'intro');
    }
  }

  _voidRound() {
    if (this.authority) this._point(-1, -1, FAULT);
    else if (this.online) this.transport.send({ t: 'mv', k: 'fault', r: this.round, dim: this.faultDim });
  }

  _call(fn, arg) {
    const inst = this.inst;
    if (!inst || this.instDead || typeof inst[fn] !== 'function') return;
    try { inst[fn](arg); } catch (e) { this._fault(fn, e); }
  }

  // A dimension threw: stop running it and void the round. The fault is sticky — if the
  // round is not live yet it is voided the moment it would have started (see _go).
  _fault(where, e) {
    this._error(`${this.mod ? this.mod.id : '?'} ${where}`, e);
    if (this.instDead) return;
    this.instDead = true;
    if (this.mod && this.mod !== voidWorld && this.mod !== finale) { this.broken.add(this.mod.id); this.faultDim = this.mod.id; }
    if (this.phase === 'intro' && !this.holdIntro) {
      this.phase = this.dimPhase = 'live';
      this.hud.title(this.mod, this.round, false);
      this.hud.count('');
    }
    if (this.online && !this.authority) this.transport.send({ t: 'mv', k: 'fault', r: this.round, dim: this.faultDim });
    else if (this.phase === 'live') this._point(-1, -1, FAULT);
  }

  _kill(round, victim, info) {
    if (round !== this.round || this.phase !== 'live' || this.dimPhase !== 'live') return;
    victim = victim ? 1 : 0;
    const how = label(info && info.how);
    if (this.authority) return this._point(1 - victim, victim, how);
    // One claim per hit; if the host has not answered within a moment, a later hit asks again.
    const now = performance.now();
    if (this.claimed && now - this.claimedAt < 1500) return;
    this.claimed = true;
    this.claimedAt = now;
    this.transport.send({ t: 'mv', k: 'claim', r: round, victim, how });
  }

  // Returns false when the native dimension should carry on with its own next round.
  _nativeOver(round, winner, info) {
    if (!this.authority || round !== this.round || this.phase !== 'live') return true;
    winner = winner === 0 || winner === 1 ? winner : -1;
    // The mode keeps its secret until one sniper actually SHOOTS the other. A valley round
    // that runs out the clock before that (drawn, or taken on uplinks) is followed by another
    // ordinary valley round, exactly as in the classic game; an uplink win still counts.
    if (this.settled === 0 && !(info && info.kill)) {
      if (winner < 0 || this.score[winner] + 1 < this.target) {
        if (winner >= 0) this.score[winner]++;
        return false;
      }
    }
    this._point(winner, winner < 0 ? -1 : 1 - winner, label(info && info.how));
    return true;
  }

  forcePoint(winner = 0) {
    if (!this.authority) return false;
    if (this.phase !== 'live') { this._forced = winner; return false; }
    this._point(winner, winner < 0 ? -1 : 1 - winner, 'DEBUG');
    return true;
  }

  // Authority only: settle the round and decide what comes next.
  _point(winner, victim, how) {
    if (this.phase !== 'live') return;
    const score = this.score.slice();
    if (winner >= 0) score[winner]++;
    const done = winner >= 0 && score[winner] >= this.target;
    this.linkFx = null;
    const dim = done ? FINALE : this._nextDim(winner >= 0);
    this._killExit = winner >= 0;
    const fx = this._nextFx();
    this._killExit = false;
    this.lastFx = fx;
    const next = { dim, fx, seed: mixSeed(this.matchSeed, done ? 9999 : this.round + 1) };
    const m = { t: 'mv', k: 'point', r: this.round, winner, victim, how, score, next };
    if (this.online) this.transport.send(m);
    this._applyPoint(m);
  }

  // fast = catching up on a round that was settled while this client was away: no kill moment.
  _applyPoint(m, fast) {
    if (m.r <= this.settled) return;
    const playing = this.phase === 'live' || (this.phase === 'intro' && !this.holdIntro);
    if (m.r !== this.round || !playing) { this.points.set(m.r, m); return; } // never dropped: applied when we get there
    this.settled = m.r;
    this.score = m.score.slice();
    this.result = { winner: m.winner, victim: m.victim, how: m.how || '' };
    if (m.how !== FAULT) this.history.push({ id: this.mod.id, name: this.mod.name, winner: m.winner });
    this.next = m.next;
    this._log('point', { round: this.round, winner: m.winner, how: m.how, time: Math.round(this.time * 10) / 10, score: this.score.slice(), next: m.next.dim, fx: m.next.fx });
    this.preload = Promise.all([
      m.next.dim === FINALE ? null : loadDimension(m.next.dim).catch((e) => this._error('preload dim', e)),
      m.next.fx && m.next.fx !== 'none' ? loadTransition(m.next.fx).catch((e) => this._error('preload fx', e)) : null,
    ]);
    this.phase = 'over';
    this.hud.setScore(this.score, this.target);
    if (this.mod.native || this.instDead || this.voided || fast) {
      this.overT = 0;
      if (!this.mod.native) this.dimPhase = 'over';
    } else {
      this.dimPhase = 'over';
      this.overT = this.mod.overTime || DEFAULTS.overTime;
      this.hud.title(this.mod, this.round, false);
      this.hud.count('');
      this.hud.killBanner(m.winner >= 0 ? this.players[m.winner] : null, m.winner >= 0 ? this.players[1 - m.winner] : null, m.how, this.overT);
      this.audio.sfx('kill');
      this._call('onPhase', 'over');
    }
  }

  // The round is live on this client: settle anything that was waiting for that.
  _onLive() {
    if (!this.authority) return;
    const c = this.claims.get(this.round);
    this.claims.clear();
    if (this.peerFault >= this.round) return this._point(-1, -1, FAULT);
    if (c) { const v = c.victim ? 1 : 0; return this._point(1 - v, v, label(c.how)); }
    if (this._forced !== undefined) { const w = this._forced; this._forced = undefined; this._point(w, w < 0 ? -1 : 1 - w, 'DEBUG'); }
  }

  // dt drives the simulation (clamped); clock drives the round timers (real time online,
  // so two devices that hitch differently still agree on ctx.time).
  _tick(dt, clock = dt) {
    const mod = this.mod;
    if (this.phase === 'intro' && !this.holdIntro) {
      this.introT -= clock;
      const left = this.introT;
      const n = left > 2.4 ? '' : left > 1.6 ? '3' : left > 0.8 ? '2' : left > 0 ? '1' : '';
      if (n && n !== this._countShown) this.audio.sfx('tick', { pitch: 1 + (3 - +n) * 0.12 });
      this._countShown = n;
      this.hud.count(n);
      if (left <= 0) {
        this.phase = 'live';
        this.dimPhase = 'live';
        this.time = 0;
        this.hud.count('SNIPE');
        this.audio.sfx('chime');
        this._log('live', { round: this.round, dim: mod.id });
        this._call('onPhase', 'live');
        this._onLive();
      }
    } else if (this.phase === 'live') {
      this.time += clock;
      const rt = mod.roundTime || DEFAULTS.roundTime;
      if (!this.sudden && this.time >= rt) {
        this.sudden = true;
        this.hud.message('SUDDEN DEATH', 'Both snipers are exposed', 2.5);
        this.audio.sfx('error');
        this._log('sudden', { round: this.round });
      }
      this.hud.clock(this.sudden ? rt + DEFAULTS.suddenTime - this.time : rt - this.time, this.sudden);
      if (this.authority && this.time >= rt + DEFAULTS.suddenTime) this._point(-1, -1, 'STALEMATE');
    } else if (this.phase === 'over') {
      this.overT -= clock;
      if (this.overT <= 0) this._startTransition();
    }
    if (this.online) this._sampleRemote();
    if (this.inst && !this.instDead) {
      try { this.inst.update(this.phase === 'over' || this.phase === 'transition' ? dt * OVER_SLOWMO : dt); } catch (e) { this._fault('update', e); }
    }
  }

  _render() {
    if (!this.inst || this.mod.native) return;
    this.stage.begin();
    if (this.instDead) {
      this.stage.g.fillStyle = '#000';
      this.stage.g.fillRect(0, 0, this.stage.width, this.stage.height);
      return;
    }
    try { this.inst.render(); } catch (e) { this._fault('render', e); }
  }

  _capture() {
    const inst = this.inst, mod = this.mod;
    return inst && mod.native && inst.capture ? (g, w, h) => inst.capture(g, w, h) : null;
  }

  // ---------------------------------------------------------------------------
  // Transitions
  // ---------------------------------------------------------------------------
  _startTransition() {
    if (this.phase === 'transition') return;
    this.phase = 'transition';
    const next = this.next;
    (this.preload || Promise.resolve()).then(() => this._beginFx(next)).catch((e) => {
      // Whatever went wrong, the match goes on: cut straight to the next world.
      if (!this.fx) this.fx = { mod: null, inst: null, t: 0, swapT: 0, swapped: false, swapping: false, next };
      this._fxFault(e);
    });
  }

  async _beginFx(next) {
    if (this.fx) return;
    let mod = null;
    if (next.fx && next.fx !== 'none') {
      try { mod = await loadTransition(next.fx); } catch (e) { this._error(`load fx ${next.fx}`, e); }
    }
    const from = this.mod;
    let to = finale;
    if (next.dim !== FINALE) {
      try { to = await loadDimension(next.dim); } catch { to = null; }
    }
    // Last look at the old world.
    this._render();
    this.stage.snapshot(this.stage.fromImage, this._capture());
    let focus = { x: this.stage.width / 2, y: this.stage.height / 2 };
    if (this.inst && !this.instDead && this.inst.focus) {
      try {
        const f = this.inst.focus();
        if (f && isFinite(f.x) && isFinite(f.y)) focus = { x: Math.max(0, Math.min(this.stage.width, f.x)), y: Math.max(0, Math.min(this.stage.height, f.y)) };
      } catch (e) { this._error('focus', e); }
    }
    this.input.setEnabled(false);
    this.hud.show(false);
    this.hud.pause(false);
    this.paused = false;
    if (from && from.native && this.inst.freeze) {
      try { this.inst.freeze(); } catch (e) { this._error('freeze', e); }
    }
    this.audio.stopAll(0.25);
    const res = this.result || { winner: -1, victim: -1, how: '' };
    const d = this;
    const fx = (this.fx = { mod, inst: null, t: 0, swapT: mod ? mod.swapAt * mod.duration : 0, swapped: false, swapping: false, next });
    if (mod) {
      const seed = mixSeed(next.seed, 0xf1a5);
      const ctx = {
        get width() { return d.stage.width; },
        get height() { return d.stage.height; },
        get dpr() { return d.stage.dpr; },
        canvas: this.stage.fxCanvas,
        g: this.stage.fxG,
        get three() { return (this._three ||= d.stage.fxThree()); },
        fromImage: this.stage.fromImage,
        get toImage() { return fx.swapped ? d.stage.toImage : null; },
        from: metaOf(from),
        to: metaOf(to || from),
        winner: res.winner >= 0 ? this.players[res.winner] : null,
        loser: res.winner >= 0 ? this.players[1 - res.winner] : null,
        localWon: res.winner === this.me,
        how: res.how || '',
        focus,
        score: this.score.slice(),
        target: this.target,
        round: this.round,
        matchPoint: Math.max(...this.score) === this.target - 1,
        seed,
        rng: mulberry32(seed),
        audio: this._audioFor((fx.audioTag = 'fx' + this.round)),
      };
      try {
        fx.inst = mod.create(ctx);
        this.stage.beginFx();
        fx.inst.update(0, 0);
        fx.inst.render(0);
        this.stage.showFx(true);
      } catch (e) {
        this._fxFault(e);
      }
    }
    this._log('fx', { id: mod ? mod.id : 'none', to: next.dim });
    if (!fx.inst) this._swap();
  }

  _fxFault(e) {
    const fx = this.fx;
    this._error(`fx ${fx && fx.mod ? fx.mod.id : '?'}`, e);
    if (!fx) return;
    if (fx.mod) this.broken.add(fx.mod.id);
    if (fx.inst) { try { fx.inst.dispose(); } catch {} }
    fx.inst = null;
    try { this.stage.showFx(false); } catch {}
    if (!fx.swapped && !fx.swapping) this._swap();
    else if (fx.swapped) this._endTransition();
  }

  async _swap() {
    const fx = this.fx;
    if (fx.swapping || fx.swapped) return;
    fx.swapping = true;
    try {
      this._disposeInst();
      this.round++;
      this.audio.update(1.5); // building the next world can stall a frame or two: keep the score playing through it
      await this._mountSafe(fx.next);
      if (!this.mod.native) {
        try { this.inst.update(0); } catch (e) { this._fault('update', e); }
      }
      this._render();
      this.stage.snapshot(this.stage.toImage, this._capture());
    } catch (e) {
      this._error('swap', e);
    }
    fx.swapped = true;
    fx.swapping = false;
    if (!fx.inst) this._endTransition();
  }

  // quiet = advance without drawing (the lab steps to a requested frame this way).
  _fxFrame(dt, quiet) {
    const fx = this.fx;
    // Keep the world under the overlay alive: the old one before the swap, the new one after.
    if (this.inst && !fx.swapping && !this.mod.native) {
      if (this.online) this._sampleRemote();
      if (!this.instDead) {
        try { this.inst.update(fx.swapped ? dt : dt * OVER_SLOWMO); } catch (e) { this._fault('update', e); }
      }
      if (!quiet) this._render();
    }
    if (!fx.inst) return;
    if (!fx.swapping) {
      fx.t = Math.min(fx.mod.duration, fx.t + dt);
      if (!fx.swapped && fx.t >= fx.swapT) { fx.t = fx.swapT; this._swap(); }
    }
    try {
      fx.inst.update(dt, fx.t);
      if (!quiet) {
        this.stage.beginFx();
        fx.inst.render(fx.t);
      }
    } catch (e) {
      return this._fxFault(e);
    }
    if (fx.swapped && fx.t >= fx.mod.duration) this._endTransition();
  }

  _endTransition() {
    const fx = this.fx;
    if (!fx) return;
    if (fx.inst) { try { fx.inst.dispose(); } catch (e) { this._error('fx dispose', e); } }
    this._endMusic(fx.audioTag);
    this.fx = null;
    this.stage.showFx(false);
    this._log('arrive', { dim: this.mod && this.mod.id, round: this.round });
    if (this.lab) return this.lab.arrived();
    if (this.mod === finale) return this._final();
    this._ready();
  }

  // ---------------------------------------------------------------------------
  // Match end / rematch
  // ---------------------------------------------------------------------------
  _final() {
    this.phase = 'final';
    this.input.setEnabled(false);
    this.hud.show(false);
    // A rematch that was agreed while this client was still watching the last film.
    if (this.pendingRematch) { const m = this.pendingRematch; this.pendingRematch = null; return this._applyRematch(m); }
    if (this.authority && this.rematchAsked) { this.rematchAsked = false; return this._rematch(); }
    const won = this.score[this.me] > this.score[1 - this.me];
    this.audio.sfx(won ? 'powerup' : 'drop');
    this.hud.final({
      won, players: this.players, score: this.score, history: this.history, canRematch: this.authority,
      onRematch: (btn) => {
        if (this.authority) this._rematch();
        else { this.transport.send({ t: 'mv', k: 'rematch?' }); btn.textContent = 'Waiting for host…'; }
      },
      onExit: () => this.exit(),
    });
  }

  _rematch() {
    if (this.phase !== 'final') return;
    this.matchSeed = Math.floor(Math.random() * 0xffffffff) >>> 0;
    this._resetBags();
    const fx = this._nextFx();
    this.lastFx = fx;
    const m = { t: 'mv', k: 'rematch', seed: this.matchSeed, next: { dim: this._draw('dimBag', this._rotation(), null) || this.first, fx, seed: mixSeed(this.matchSeed, 1) } };
    if (this.online) this.transport.send(m);
    this._applyRematch(m);
  }

  _applyRematch(m) {
    if (this.phase !== 'final') return;
    this.matchSeed = m.seed;
    this.score = [0, 0];
    this.history = [];
    this.result = null;
    this.round = 0; // the swap increments it to 1
    this.selfReady = this.peerReady = this.goRound = 0;
    this.settled = 0;
    this.peerFault = 0;
    this.points.clear();
    this.claims.clear();
    this.pendingRematch = null;
    this.rematchAsked = false;
    this.hud.card('');
    this.hud.setScore(this.score, this.target);
    this.next = m.next;
    this.preload = null;
    this._log('rematch');
    this._startTransition();
  }

  // ---------------------------------------------------------------------------
  // Pause / exit
  // ---------------------------------------------------------------------------
  _pause(on) {
    if (on && (this.paused || this.fx || !this.inst || this.mod.native || this.phase === 'final' || this.phase === 'loading')) return;
    this.paused = on;
    this.hud.pause(on, {
      online: this.online,
      onResume: () => {
        this._pause(false);
        if (this.mod && this.mod.aim === 'look') this.input.requestLock();
      },
      onExit: () => this.exit(),
    });
  }

  exit() {
    try { if (this.transport) this.transport.close(); } catch {}
    if (this.o.onExit) this.o.onExit();
    else location.href = location.pathname;
  }

  // ---------------------------------------------------------------------------
  // Frame
  // ---------------------------------------------------------------------------
  // 3D dimensions render at full device resolution while the frame rate holds, and give
  // up pixels (down to half) when it does not — an iPad should never chug. "Holds" is judged
  // against the display's own cadence (Low Power Mode runs rAF at 30 Hz: that is not
  // overload), and a resolution that proved too much is not tried again for a while.
  _adaptResolution(dt) {
    // The quickest steady cadence ever seen is the display's.
    this._cn = (this._cn || 0) + 1;
    this._ct = (this._ct || 0) + dt;
    if (this._cn >= 20) {
      this._cadence = Math.min(this._cadence || 1, this._ct / this._cn);
      this._cn = this._ct = 0;
    }
    if (this.dev.fixres || !this.inst || !this.mod || this.mod.native || this.mod.renderer !== 'three' || this.fx || this.paused || !this._cadence) { this._ft = this._fn = 0; this._good = 0; return; }
    this._ft = (this._ft || 0) + dt;
    this._fn = (this._fn || 0) + 1;
    if (this._fn < 45) return;
    const avg = this._ft / this._fn, base = Math.max(1 / 120, this._cadence);
    this._ft = this._fn = 0;
    const k = this.stage.glScale, now = performance.now();
    if (avg > base * 1.3) {
      this._good = 0;
      this._ceil = k; // this much was too much
      this._ceilAt = now;
      this.stage.setGlScale(k * 0.85);
    } else if (avg < base * 1.1 && k < 1) {
      if (++this._good < 4) return; // several seconds of headroom first
      this._good = 0;
      const up = Math.min(1, k * 1.06);
      if (this._ceil && up >= this._ceil - 0.01 && now - this._ceilAt < 20000) return;
      this.stage.setGlScale(up);
    } else this._good = 0;
  }

  _frame(now) {
    this.raf = requestAnimationFrame(this._frameBound);
    const real = Math.min((now - this.last) / 1000, 20);
    const dt = Math.min(real, 0.05);
    this.last = now;
    if (!(dt > 0)) return;
    // Offline a hitch (or a hidden tab) simply pauses the round clock; online it must not.
    const lost = this.online ? real - dt : 0;
    this.audio.update();
    if (this.transport) {
      this.transport.tick(dt);
      this._netFlush(dt);
      // A guest that said hello but never joins in is running an old copy of the game.
      if (this.authority && this.round === 1 && this.settled === 0 && this.peerReady < 1 && this.helloAt && !this._staleShown && now - this.helloAt > 15000) {
        this._staleShown = true;
        this.hud.card('<h2>STILL CONNECTING</h2><p>If this takes much longer, ask your friend to reload the game page and join again.</p>', [{ label: 'Keep waiting', primary: true, onClick: () => this.hud.card('') }, { label: 'Back to menu', onClick: () => this.exit() }]);
      }
      // Waiting for the other device to arrive (after the reveal only: before it, nothing extra may show).
      if (this.phase === 'intro' && this.holdIntro && this.selfReady === this.round && !this._waitShown && this.settled > 0 && !this.mod.native && !this.fx && now - this.readyAt > 2500) {
        this._waitShown = true;
        this.hud.show(true);
        this.hud.message('', `Waiting for ${this.players[1 - this.me].name}…`, 9999);
      }
    }
    const speed = Math.max(1, this.dev.speed | 0);
    this._adaptResolution(dt);
    if (this.lab && this.lab.frozen) { /* frames are rendered on demand */ }
    else if (this.fx) this._fxFrame(dt * speed);
    else if (this.inst && !this.mod.native && this.phase !== 'final' && this.phase !== 'loading') {
      this.input.poll(dt);
      if (!(this.paused && !this.online)) for (let i = 0; i < speed; i++) this._tick(dt, i ? dt : dt + lost);
      this._render();
      this.input.endFrame();
      const needLock = this.mod.aim === 'look' && !this.input.touch && this.input.state.device === 'kbm' && !this.paused && document.pointerLockElement !== this.stage.root && this.phase !== 'transition';
      this.hud.lockPrompt(needLock);
    } else if (this.inst && this.phase === 'final') {
      try { this.inst.update(dt); this._render(); } catch (e) { this._error('finale', e); }
    } else if (this.inst && this.mod.native && this.phase === 'over') {
      this._startTransition();
    }
    this.hud.update(dt);
  }

  // ---------------------------------------------------------------------------
  // Transition lab (?fxlab=<id>&from=<dim>&to=<dim>): ping-pongs one transition between
  // two dimensions with no gameplay, and can render any frame on demand for the test tool.
  // ---------------------------------------------------------------------------
  async _startLab() {
    const d = this;
    const a = this.dev.from || 'example-2d', b = this.dev.to || 'example-3d';
    const fxId = this.dev.fxlab;
    let n = 0;
    const leg = () => ({ dim: n % 2 ? a : b, fx: fxId, seed: mixSeed(this.matchSeed, 100 + n) });
    this.dev.auto = true;
    await this._mountSafe({ dim: a, seed: mixSeed(this.matchSeed, 1) });
    const x = document.createElement('button');
    x.id = 'mv-lab-exit';
    x.textContent = '✕ EXIT LAB';
    x.onclick = () => this.exit();
    document.body.appendChild(x);
    this.lab = {
      frozen: false,
      wait: 0,
      async begin() {
        d.result = { winner: n % 2, victim: 1 - (n % 2), how: n % 2 ? 'RICOCHET' : 'HEADSHOT' };
        d.score = [Math.min(d.target - 1, (n + 1) >> 1), Math.min(d.target - 1, n >> 1)];
        d.next = leg();
        n++;
        d.phase = 'transition';
        await d._beginFx(d.next);
      },
      arrived() {
        d.phase = 'intro';
        if (!this.frozen) setTimeout(() => !this.frozen && this.begin(), 900);
      },
      // Deterministic frame: restart this leg from the same seeds and step to time t.
      async renderAt(t, probe) {
        this.frozen = true;
        x.style.display = 'none';
        if (d.fx) {
          if (d.fx.inst) { try { d.fx.inst.dispose(); } catch {} }
          d.fx = null;
          d.stage.showFx(false);
        }
        n = 0;
        d._disposeInst();
        d.round = 1;
        await d._mountSafe({ dim: a, seed: mixSeed(d.matchSeed, 1) });
        for (let i = 0; i < 30; i++) d._tick(1 / 60);
        await this.begin();
        const fx = d.fx;
        if (!fx || !fx.inst) return { ok: false, errors: d.errors.slice() };
        const step = 1 / 60;
        const end = Math.min(t, fx.mod.duration - 1e-3);
        while (d.fx === fx && fx.t < end - 1e-6) {
          if (fx.swapping) { await new Promise((r) => setTimeout(r, 0)); continue; }
          d._fxFrame(Math.min(step, end - fx.t), true);
        }
        if (d.fx === fx && fx.inst) {
          while (fx.swapping) await new Promise((r) => setTimeout(r, 0));
          d._fxFrame(0);
        }
        const out = { ok: d.fx === fx, t: fx.t, swapped: fx.swapped, duration: fx.mod.duration, swapAt: fx.mod.swapAt, errors: d.errors.slice() };
        return probe && out.ok ? Object.assign(out, d._probe()) : out;
      },
    };
    this.phase = 'intro';
    this.dimPhase = 'intro';
    this.last = performance.now();
    this.raf = requestAnimationFrame(this._frameBound);
    setTimeout(() => !this.lab.frozen && this.lab.begin(), 600);
  }

  // Measure the overlay for the test tool: how much of the screen it covers, and how far
  // the composite is from the old / new world. Must run in the same task as the render.
  _probe() {
    const pw = 64, ph = 36, st = this.stage, fx = this.fx;
    const c = (this._probeCanvas ||= Object.assign(document.createElement('canvas'), { width: pw, height: ph }));
    const g = c.getContext('2d', { willReadFrequently: true });
    const draw = (...layers) => {
      g.clearRect(0, 0, pw, ph);
      for (const l of layers) g.drawImage(l, 0, 0, pw, ph);
      return g.getImageData(0, 0, pw, ph).data;
    };
    const diff = (a, b) => {
      let sum = 0;
      for (let i = 0; i < a.length; i += 4) sum += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
      return sum / (pw * ph * 3 * 255);
    };
    const over = draw(st.fxGlCanvas, st.fxCanvas);
    let covered = 0;
    for (let i = 3; i < over.length; i += 4) if (over[i] >= 250) covered++;
    const firstDiff = diff(draw(st.fromImage, st.fxGlCanvas, st.fxCanvas), draw(st.fromImage));
    const lastDiff = fx && fx.swapped ? diff(draw(st.toImage, st.fxGlCanvas, st.fxCanvas), draw(st.toImage)) : 1;
    return { coverage: covered / (pw * ph), firstDiff, lastDiff };
  }
}

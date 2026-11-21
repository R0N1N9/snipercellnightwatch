// Sniper Cell — Foley and voices, all synthesised (no asset files), all placed in 3D with
// HRTF panning and distance falloff:
//   weapons      magazine out / in, slide or bolt or charging handle, per weapon
//   bodies       grabbing a body (cloth and kit), dragging it (scrape per step), dropping it
//   lights       relay clunk and a ballast hum winding down when lights are taken out,
//                a tink and flicker when they come back
//   doors        sliding electric doors (latch, servo, air seal), heavy mechanical doors
//                (handle, creak, slam)
//   interacting  rummaging a drawer, a card reader, a quick tool click
//   enemies      Halo-style chatter between calm guards (formant babble, per species),
//                shouts when they spot you, pain grunts, and a brute's growl and blade hum
//                that get louder the closer it charges
// Distance: voices use a short reference distance and a steeper rolloff than gunfire, so
// talk across the yard is faint, while something right on top of you is loud.

// Vowel formants (F1, F2) for the babble.
const VOWELS = [[730, 1090], [530, 1840], [270, 2290], [570, 840], [300, 870], [660, 1700], [440, 1020]];
// Per species: base pitch, formant scale (smaller creatures = higher formants), syllable rate,
// voice colour (source waveform), loudness.
const VOICE = {
  guard: { f0: 128, fs: 1.0, rate: 7.5, wave: 'sawtooth', gain: 0.5 },
  scav: { f0: 245, fs: 1.32, rate: 10.5, wave: 'square', gain: 0.38 },
  jugg: { f0: 74, fs: 0.72, rate: 5.2, wave: 'sawtooth', gain: 0.7 },
  bulwark: { f0: 150, fs: 1.12, rate: 8, wave: 'sawtooth', gain: 0.45 },
  titan: { f0: 62, fs: 0.66, rate: 4.6, wave: 'sawtooth', gain: 0.8 },
  overseer: { f0: 98, fs: 0.86, rate: 6.2, wave: 'sawtooth', gain: 0.6 },
};

export class Foley {
  constructor(audio) {
    this.a = audio;
    this.loops = new Map();
  }
  get ok() { return !!(this.a && this.a.ctx && this.a.noise); }
  get ctx() { return this.a.ctx; }
  get now() { return this.a.now; }

  // A panner (or the master bus for your own sounds). ref/roll shape the distance falloff.
  _out(pos, ref = 6, roll = 1, muffled = false) {
    const ctx = this.ctx;
    let head = this.a.master;
    if (pos) {
      const p = ctx.createPanner();
      p.panningModel = 'HRTF';
      p.distanceModel = 'inverse';
      p.refDistance = ref;
      p.rolloffFactor = roll;
      p.maxDistance = 400;
      if (p.positionX) { p.positionX.value = pos.x; p.positionY.value = pos.y; p.positionZ.value = pos.z; } else p.setPosition(pos.x, pos.y, pos.z);
      p.connect(this.a.master);
      head = p;
    }
    if (!muffled) return head;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 700;
    lp.connect(head);
    return lp;
  }
  // Filtered noise with an attack/decay envelope.
  _n(dest, t, dur, type, f, q, gain, attack = 0.002, f1 = 0) {
    const ctx = this.ctx, src = ctx.createBufferSource();
    src.buffer = this.a.noise;
    const fl = ctx.createBiquadFilter();
    fl.type = type; fl.frequency.setValueAtTime(f, t); fl.Q.value = q;
    if (f1) fl.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(fl).connect(g).connect(dest);
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.03);
  }
  // A pitched blip with a glide.
  _o(dest, t, dur, type, f0, f1, gain, attack = 0.003) {
    const ctx = this.ctx, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest);
    o.start(t); o.stop(t + dur + 0.03);
  }
  // Metal-on-metal: a sharp click with a short ring (a few inharmonic partials).
  _clack(dest, t, gain = 0.5, pitch = 1) {
    this._n(dest, t, 0.03, 'bandpass', 3200 * pitch, 1.2, gain);
    this._n(dest, t, 0.07, 'bandpass', 1500 * pitch, 2.5, gain * 0.6);
    for (const [f, a] of [[2300, 0.06], [3710, 0.04], [5230, 0.025]]) this._o(dest, t, 0.09, 'sine', f * pitch, f * pitch * 0.98, a * gain * 2);
  }
  _thud(dest, t, f = 90, gain = 0.5, dur = 0.18) {
    this._o(dest, t, dur, 'sine', f * 1.6, f * 0.6, gain, 0.004);
    this._n(dest, t, dur * 0.8, 'lowpass', 600, 0.7, gain * 0.7);
  }
  // Cloth / kit rustle: a few soft, overlapping grains of band-limited noise.
  _rustle(dest, t, dur = 0.35, gain = 0.25, f = 1800) {
    const n = Math.max(3, Math.round(dur * 18));
    for (let i = 0; i < n; i++) {
      const s = t + (i / n) * dur + Math.random() * 0.02;
      this._n(dest, s, 0.05 + Math.random() * 0.06, 'bandpass', f * (0.7 + Math.random() * 0.7), 0.9, gain * (0.4 + Math.random() * 0.6), 0.008);
    }
  }

  // ---- weapons ---------------------------------------------------------------------------
  // kind: 'kr50' (bolt rifle), 'smg', 'm18' (P-9), 'mag50' (M50). Your own: no position.
  magOut(kind, pos) {
    if (!this.ok) return;
    const d = this._out(pos, 3, 1.2), t = this.now, big = kind === 'kr50';
    this._clack(d, t, big ? 0.45 : 0.38, big ? 0.85 : 1.1); // release
    this._n(d, t + 0.02, big ? 0.16 : 0.1, 'bandpass', 2600, 1.4, 0.18, 0.01, 1400); // slides out
    this._rustle(d, t + 0.12, 0.25, 0.12); // into the dump pouch
  }
  magIn(kind, pos) {
    if (!this.ok) return;
    const d = this._out(pos, 3, 1.2), t = this.now, big = kind === 'kr50';
    this._n(d, t, 0.12, 'bandpass', 1900, 1.2, 0.12, 0.02, 2800); // lining it up
    this._clack(d, t + 0.13, big ? 0.6 : 0.5, big ? 0.8 : 1.05); // seated
    this._thud(d, t + 0.13, big ? 120 : 160, 0.25, 0.08);
    this._n(d, t + 0.2, 0.05, 'bandpass', 4200, 2, 0.12); // a tap to be sure
  }
  // Chambering: bolt (rifle), charging handle (SMG) or slide release (handguns).
  charge(kind, pos) {
    if (!this.ok) return;
    const d = this._out(pos, 3, 1.2), t = this.now;
    if (kind === 'kr50') {
      this._clack(d, t, 0.4, 0.7); // bolt up
      this._n(d, t + 0.05, 0.12, 'bandpass', 2000, 1.5, 0.22, 0.01, 1100); // back
      this._n(d, t + 0.22, 0.1, 'bandpass', 1300, 1.5, 0.22, 0.01, 2300); // forward
      this._clack(d, t + 0.33, 0.55, 0.75); // locked
    } else if (kind === 'smg') {
      this._n(d, t, 0.09, 'bandpass', 2400, 1.6, 0.25, 0.005, 1300); // handle back
      this._clack(d, t + 0.1, 0.6, 1.0); // slams home
    } else {
      this._clack(d, t, 0.55, 1.15); // slide release
      this._n(d, t, 0.06, 'highpass', 3500, 0.7, 0.2);
    }
  }

  // ---- bodies ----------------------------------------------------------------------------
  bodyGrab(pos) {
    if (!this.ok) return;
    const d = this._out(pos, 3, 1.1), t = this.now;
    this._rustle(d, t, 0.45, 0.32, 1500);
    this._thud(d, t + 0.05, 70, 0.22, 0.2);
    for (let i = 0; i < 4; i++) this._o(d, t + 0.08 + i * 0.05, 0.05, 'sine', 3200 + Math.random() * 1800, 3000, 0.03); // kit jingle
  }
  bodyDrop(pos) {
    if (!this.ok) return;
    const d = this._out(pos, 3, 1.1), t = this.now;
    this._rustle(d, t, 0.25, 0.22, 1300);
    this._thud(d, t + 0.12, 55, 0.6, 0.3);
    this._n(d, t + 0.12, 0.25, 'lowpass', 900, 0.8, 0.35);
    this._clack(d, t + 0.2, 0.12, 0.9); // something on his rig hits the floor
  }
  // Each step of the drag: cloth and boots scraping along the ground.
  dragScrape(pos) {
    if (!this.ok) return;
    const d = this._out(pos, 3, 1.1), t = this.now;
    this._n(d, t, 0.34, 'bandpass', 900, 0.6, 0.16, 0.06, 600);
    this._rustle(d, t + 0.05, 0.25, 0.1, 2200);
  }

  // ---- lights ----------------------------------------------------------------------------
  powerDown(pos) {
    if (!this.ok) return;
    const ctx = this.ctx, d = this._out(pos, 6, 1), t = this.now;
    this._thud(d, t, 80, 0.45, 0.2); // the relay
    this._clack(d, t, 0.25, 0.6);
    // The ballast hum winding down (mains buzz through a lowpass, falling and fading).
    const o = ctx.createOscillator(), o2 = ctx.createOscillator(), lp = ctx.createBiquadFilter(), g = ctx.createGain();
    o.type = 'sawtooth'; o2.type = 'square';
    o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(28, t + 0.9);
    o2.frequency.setValueAtTime(240, t); o2.frequency.exponentialRampToValueAtTime(50, t + 0.9);
    lp.type = 'lowpass'; lp.frequency.setValueAtTime(1800, t); lp.frequency.exponentialRampToValueAtTime(200, t + 0.9);
    g.gain.setValueAtTime(0.12, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.95);
    o.connect(lp); o2.connect(lp); lp.connect(g).connect(d);
    o.start(t); o2.start(t); o.stop(t + 1); o2.stop(t + 1);
    // Tubes cooling: a couple of tinks.
    this._o(d, t + 0.35, 0.12, 'sine', 5200, 5100, 0.03);
    this._o(d, t + 0.62, 0.1, 'sine', 4600, 4500, 0.02);
  }
  powerUp(pos) {
    if (!this.ok) return;
    const d = this._out(pos, 6, 1), t = this.now;
    this._clack(d, t, 0.18, 0.7);
    for (let i = 0; i < 3; i++) this._n(d, t + 0.05 + i * 0.07 + Math.random() * 0.03, 0.03, 'bandpass', 2800, 3, 0.1); // the flicker
    this._o(d, t + 0.1, 0.4, 'sawtooth', 100, 120, 0.03, 0.08);
  }

  // ---- doors -----------------------------------------------------------------------------
  // kind: 'elec' / 'badge' / 'dock' / 'auto' slide on a motor; 'mech' swing on a handle.
  door(pos, kind, open) {
    if (!this.ok) return;
    const ctx = this.ctx, d = this._out(pos, 5, 1), t = this.now;
    if (kind === 'mech') {
      if (open) {
        this._clack(d, t, 0.35, 0.65); // handle
        // The hinge creak: a slow, wavering resonance.
        const o = ctx.createOscillator(), bp = ctx.createBiquadFilter(), g = ctx.createGain(), lfo = ctx.createOscillator(), lg = ctx.createGain();
        o.type = 'sawtooth'; o.frequency.setValueAtTime(190, t + 0.08); o.frequency.linearRampToValueAtTime(260, t + 0.6);
        lfo.frequency.value = 23; lg.gain.value = 30; lfo.connect(lg).connect(o.frequency);
        bp.type = 'bandpass'; bp.frequency.value = 1100; bp.Q.value = 6;
        g.gain.setValueAtTime(0.0001, t + 0.08); g.gain.exponentialRampToValueAtTime(0.09, t + 0.2); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.65);
        o.connect(bp).connect(g).connect(d);
        o.start(t + 0.08); lfo.start(t + 0.08); o.stop(t + 0.7); lfo.stop(t + 0.7);
      } else {
        this._n(d, t, 0.15, 'lowpass', 500, 0.7, 0.2, 0.08); // air pushed ahead of it
        this._thud(d, t + 0.14, 70, 0.7, 0.25); // slam
        this._clack(d, t + 0.15, 0.4, 0.6); // latch
      }
      return;
    }
    const heavy = kind === 'dock';
    this._clack(d, t, 0.3, heavy ? 0.5 : 0.8); // latch / mag lock
    // Servo whine and the panel's rumble along its track.
    const o = ctx.createOscillator(), lp = ctx.createBiquadFilter(), g = ctx.createGain();
    const dur = heavy ? 1.4 : 0.5;
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(open ? 260 : 420, t + 0.03); o.frequency.linearRampToValueAtTime(open ? 460 : 280, t + dur);
    lp.type = 'lowpass'; lp.frequency.value = 900;
    g.gain.setValueAtTime(0.0001, t + 0.03); g.gain.exponentialRampToValueAtTime(heavy ? 0.06 : 0.045, t + 0.1); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(lp).connect(g).connect(d); o.start(t + 0.03); o.stop(t + dur + 0.05);
    this._n(d, t + 0.03, dur, 'bandpass', heavy ? 300 : 700, 0.7, heavy ? 0.3 : 0.14, 0.08);
    if (open) this._n(d, t, 0.25, 'highpass', 2500, 0.6, 0.12, 0.01); // the seal breaking
    else this._thud(d, t + dur, heavy ? 60 : 110, heavy ? 0.6 : 0.3, 0.15); // closed
  }

  // ---- interactions ----------------------------------------------------------------------
  interact(pos, key) {
    if (!this.ok) return;
    const d = this._out(pos, 4, 1.1), t = this.now;
    if (/badge|card|swipe|jack|upl|relay|crack/.test(key || '')) {
      this._clack(d, t, 0.2, 1.3);
      this._o(d, t + 0.08, 0.08, 'square', 1760, 1760, 0.04); this._o(d, t + 0.17, 0.12, 'square', 2350, 2350, 0.04); // reader beeps
    } else if (/search|drawer|loot|shelf|ammo|supply/.test(key || '')) {
      this._n(d, t, 0.2, 'bandpass', 700, 0.8, 0.25, 0.02, 400); // the drawer runs out
      this._rustle(d, t + 0.15, 0.5, 0.2, 2400); // rummaging
      this._clack(d, t + 0.55, 0.15, 1.2);
    } else {
      this._rustle(d, t, 0.25, 0.18);
      this._clack(d, t + 0.18, 0.25, 1.0);
    }
  }

  // ---- the nano swarm --------------------------------------------------------------------
  swarm(pos) {
    if (!this.ok) return;
    const ctx = this.ctx, d = this._out(pos, 4, 1), t = this.now;
    // A hatch pop, then the buzz of dozens of tiny rotors swelling up and away.
    this._clack(d, t, 0.25, 1.4);
    this._n(d, t, 0.12, 'highpass', 4000, 0.7, 0.2);
    const g = ctx.createGain(), bp = ctx.createBiquadFilter(), am = ctx.createGain(), lfo = ctx.createOscillator(), lg = ctx.createGain();
    bp.type = 'bandpass'; bp.frequency.value = 1700; bp.Q.value = 0.9;
    lfo.frequency.value = 46; lg.gain.value = 0.35; am.gain.value = 0.65; lfo.connect(lg).connect(am.gain);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.16, t + 0.25); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.5);
    const os = [610, 637, 702, 744, 811].map((f) => { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(f, t); o.frequency.linearRampToValueAtTime(f * 1.25, t + 0.6); o.connect(bp); o.start(t); o.stop(t + 1.55); return o; });
    bp.connect(am).connect(g).connect(d); lfo.start(t); lfo.stop(t + 1.55);
    void os;
  }

  // ---- enemy voices ----------------------------------------------------------------------
  // Formant babble, Halo-style: syllables of a buzzy source through two vowel resonances, with
  // consonant clicks between. mood: 'talk' (calm chatter), 'shout' (spotted you, alarm), 'pain'.
  chatter(pos, type = 'guard', mood = 'talk', muffled = false) {
    if (!this.ok) return 0;
    const ctx = this.ctx, V = VOICE[type] || VOICE.guard, t0 = this.now;
    const shout = mood === 'shout', pain = mood === 'pain';
    // Voices are faint at range: a short reference distance and a steep rolloff.
    const out = this._out(pos, 2.2, 1.35, muffled);
    const n = pain ? 1 : shout ? 2 + Math.floor(Math.random() * 3) : 3 + Math.floor(Math.random() * 6);
    const syl = 1 / V.rate * (shout ? 0.85 : 1);
    const f0 = V.f0 * (shout ? 1.35 : pain ? 1.5 : 1) * (0.93 + Math.random() * 0.14);
    const gain = V.gain * (shout ? 1.6 : pain ? 1.2 : 1);
    let t = t0 + Math.random() * 0.05;
    for (let i = 0; i < n; i++) {
      const len = syl * (pain ? 2.6 : 0.6 + Math.random() * 0.8);
      const [F1, F2] = VOWELS[Math.floor(Math.random() * VOWELS.length)];
      const src = ctx.createOscillator();
      src.type = V.wave;
      // Intonation: a rise and fall over the phrase, a little wobble per syllable.
      const contour = 1 + 0.12 * Math.sin((i / Math.max(1, n - 1)) * Math.PI) - (i === n - 1 ? 0.12 : 0);
      src.frequency.setValueAtTime(f0 * contour * (1 + (Math.random() - 0.5) * 0.08), t);
      src.frequency.linearRampToValueAtTime(f0 * contour * (pain ? 0.7 : 0.94 + Math.random() * 0.1), t + len);
      // Vibrato-ish roughness: brutes growl.
      if (V.f0 < 100 || pain) { const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 28 + Math.random() * 10; lg.gain.value = f0 * 0.08; lfo.connect(lg).connect(src.frequency); lfo.start(t); lfo.stop(t + len + 0.05); }
      const mix = ctx.createGain();
      mix.gain.setValueAtTime(0.0001, t);
      mix.gain.exponentialRampToValueAtTime(gain * 0.5, t + 0.018);
      mix.gain.setValueAtTime(gain * 0.5, t + len * 0.7);
      mix.gain.exponentialRampToValueAtTime(0.0001, t + len);
      for (const [F, q, a] of [[F1 * V.fs, 7, 1], [F2 * V.fs, 10, 0.55], [2600 * V.fs, 8, 0.2]]) {
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass'; bp.frequency.value = F; bp.Q.value = q;
        const ga = ctx.createGain(); ga.gain.value = a * 3;
        src.connect(bp).connect(ga).connect(mix);
      }
      mix.connect(out);
      src.start(t); src.stop(t + len + 0.05);
      // A consonant: a click or a short hiss before the next syllable.
      if (i < n - 1 && Math.random() < 0.7) this._n(out, t + len, 0.03, Math.random() < 0.5 ? 'highpass' : 'bandpass', 3000 * V.fs, 1, gain * 0.25);
      t += len + (Math.random() < 0.2 ? syl * 0.8 : syl * 0.1);
    }
    return t - t0;
  }

  // Looping sources that follow something: a brute's growl as it charges, an energy blade's
  // hum. gain is set every frame; the panner does the distance.
  loop(key, kind, pos, gain) {
    if (!this.ok) return;
    let L = this.loops.get(key);
    if (!L) {
      const ctx = this.ctx, p = this._out(pos, 2.5, 1.4), g = ctx.createGain();
      g.gain.value = 0;
      g.connect(p);
      const nodes = [];
      if (kind === 'growl') {
        // A low, rough snarl: two detuned saws through a vowel-ish resonance, ragged by an LFO.
        const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 520; bp.Q.value = 2.5;
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1400;
        const am = ctx.createGain(); am.gain.value = 0.6;
        const lfo = ctx.createOscillator(); lfo.frequency.value = 9 + Math.random() * 4; const lg = ctx.createGain(); lg.gain.value = 0.4; lfo.connect(lg).connect(am.gain); lfo.start();
        for (const f of [58, 61.5]) { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.connect(bp); o.connect(lp); o.start(); nodes.push(o); }
        const rough = ctx.createBufferSource(); rough.buffer = this.a.noise; rough.loop = true; const rf = ctx.createBiquadFilter(); rf.type = 'bandpass'; rf.frequency.value = 400; rf.Q.value = 1; const rg = ctx.createGain(); rg.gain.value = 0.5; rough.connect(rf).connect(rg).connect(am); rough.start(0, Math.random());
        bp.connect(am); lp.connect(am); am.connect(g);
        nodes.push(lfo, rough);
      } else {
        // 'blade': the energy sword's hum, with a slow beating.
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
        for (const [f, a] of [[96, 0.6], [97.3, 0.6], [192, 0.25], [288, 0.1]]) { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; const og = ctx.createGain(); og.gain.value = a; o.connect(og).connect(lp); o.start(); nodes.push(o); }
        lp.connect(g);
      }
      L = { p, g, nodes };
      this.loops.set(key, L);
    }
    if (L.p.positionX) { L.p.positionX.value = pos.x; L.p.positionY.value = pos.y; L.p.positionZ.value = pos.z; }
    L.g.gain.setTargetAtTime(gain, this.now, 0.08);
  }
  stopLoop(key) {
    const L = this.loops.get(key);
    if (!L) return;
    L.g.gain.setTargetAtTime(0, this.now, 0.1);
    setTimeout(() => { for (const n of L.nodes) { try { n.stop(); } catch {} } L.p.disconnect(); }, 600);
    this.loops.delete(key);
  }
  stopAll() { for (const k of [...this.loops.keys()]) this.stopLoop(k); }
}

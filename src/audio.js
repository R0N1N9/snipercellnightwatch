import * as THREE from 'three';

// All sound is synthesized with WebAudio: no asset downloads.
export class Audio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.volume = 0.8;
  }

  unlock() {
    if (this.ctx) {
      // 'suspended', or Safari's 'interrupted' after a call / app switch.
      if (this.ctx.state !== 'running' && this.ctx.state !== 'closed') this.ctx.resume().catch(() => {});
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -10;
    comp.ratio.value = 4;
    this.master.connect(comp).connect(ctx.destination);
    // White noise buffer.
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    // Valley echo: long decaying impulse response with discrete slap-backs off the ridges.
    const irLen = ctx.sampleRate * 3.2;
    const ir = ctx.createBuffer(2, irLen, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const ch = ir.getChannelData(c);
      for (let i = 0; i < irLen; i++) {
        const t = i / ctx.sampleRate;
        let v = (Math.random() * 2 - 1) * Math.exp(-t * 1.6) * 0.35;
        for (const [et, ea] of [[0.55, 0.5], [1.15, 0.3], [1.9, 0.16]]) {
          const dt = t - et - c * 0.03;
          if (dt > 0 && dt < 0.25) v += (Math.random() * 2 - 1) * Math.exp(-dt * 14) * ea;
        }
        ch[i] = v;
      }
    }
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = ir;
    this.reverbGain = ctx.createGain();
    this.reverbGain.gain.value = 0.55;
    this.reverb.connect(this.reverbGain).connect(this.master);
    this._startWind();
  }

  get now() {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  setListener(cam) {
    if (!this.ctx) return;
    const l = this.ctx.listener;
    const f = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    const u = new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion);
    const p = cam.getWorldPosition(new THREE.Vector3());
    if (l.positionX) {
      const t = this.ctx.currentTime;
      l.positionX.setValueAtTime(p.x, t);
      l.positionY.setValueAtTime(p.y, t);
      l.positionZ.setValueAtTime(p.z, t);
      l.forwardX.setValueAtTime(f.x, t);
      l.forwardY.setValueAtTime(f.y, t);
      l.forwardZ.setValueAtTime(f.z, t);
      l.upX.setValueAtTime(u.x, t);
      l.upY.setValueAtTime(u.y, t);
      l.upZ.setValueAtTime(u.z, t);
    } else {
      l.setPosition(p.x, p.y, p.z);
      l.setOrientation(f.x, f.y, f.z, u.x, u.y, u.z);
    }
  }

  _panner(pos, refDist = 20) {
    const p = this.ctx.createPanner();
    p.panningModel = 'HRTF';
    p.distanceModel = 'inverse';
    p.refDistance = refDist;
    p.rolloffFactor = 0.9;
    p.maxDistance = 5000;
    if (p.positionX) {
      p.positionX.value = pos.x;
      p.positionY.value = pos.y;
      p.positionZ.value = pos.z;
    } else p.setPosition(pos.x, pos.y, pos.z);
    p.connect(this.master);
    return p;
  }

  _noiseBurst(dest, when, dur, type, freq, q, gain, decay) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(gain, when + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, when + decay);
    src.connect(f).connect(g).connect(dest);
    src.start(when, Math.random());
    src.stop(when + dur);
    return g;
  }

  _thump(dest, when, freq, gain, decay) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(freq * 2.2, when);
    o.frequency.exponentialRampToValueAtTime(freq, when + 0.08);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, when);
    g.gain.exponentialRampToValueAtTime(0.0001, when + decay);
    o.connect(g).connect(dest);
    o.start(when);
    o.stop(when + decay + 0.05);
  }

  // Your own rifle: loud, close, with the valley echoing it back.
  // heavy: a hand-cannon (the M50): a deeper, longer boom with a sharp crack on top.
  shotLocal(suppressed = false, pistol = false, heavy = false) {
    if (!this.ctx) return;
    const t = this.now;
    const bus = this.ctx.createGain();
    bus.gain.value = suppressed ? (heavy ? 0.5 : 0.35) : heavy ? 0.95 : pistol ? 0.55 : 1;
    if (heavy) {
      bus.connect(this.master);
      bus.connect(this.reverb);
      this._noiseBurst(bus, t, 0.05, 'highpass', 2600, 0.7, 1.3, 0.03); // crack
      this._noiseBurst(bus, t, 0.6, 'bandpass', 1100, 0.7, 1.0, 0.22);
      this._noiseBurst(bus, t, 1.1, 'lowpass', 380, 0.7, 1.2, 0.6);
      this._thump(bus, t, 48, 1.5, 0.5);
      this._thump(bus, t + 0.02, 90, 0.6, 0.18);
      // A metallic ring from the frame as it settles.
      const o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.type = 'triangle'; o.frequency.setValueAtTime(1850, t); o.frequency.exponentialRampToValueAtTime(1500, t + 0.4);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.03, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
      o.connect(g).connect(bus); o.start(t); o.stop(t + 0.5);
      return;
    }
    bus.connect(this.master);
    bus.connect(this.reverb);
    this._noiseBurst(bus, t, 0.5, 'bandpass', 1800, 0.6, 1.1, 0.18);
    this._noiseBurst(bus, t, 0.8, 'lowpass', 500, 0.7, 1.0, 0.45);
    this._thump(bus, t, 55, 1.2, 0.35);
  }

  // Distant muzzle report, arriving after the sound travel delay.
  shotDistant(pos, delay, suppressed = false) {
    if (!this.ctx) return;
    const t = this.now + delay;
    const p = this._panner(pos, suppressed ? 8 : 60);
    const bus = this.ctx.createGain();
    bus.gain.value = suppressed ? 0.5 : 1.6;
    bus.connect(p);
    const rv = this.ctx.createGain();
    rv.gain.value = 0.5;
    bus.connect(rv).connect(this.reverb);
    this._noiseBurst(bus, t, 1.2, 'lowpass', 900, 0.5, 1.0, 0.6);
    this._thump(bus, t, 45, 0.9, 0.7);
  }

  // Supersonic crack as a bullet passes close by. Louder the closer it is.
  crack(pos, delay, closeness) {
    if (!this.ctx) return;
    const t = this.now + Math.max(0, delay);
    const p = this._panner(pos, 4);
    const g = this.ctx.createGain();
    g.gain.value = 0.6 + closeness * 1.2;
    g.connect(p);
    this._noiseBurst(g, t, 0.08, 'highpass', 2500, 0.7, 1.4, 0.03);
    this._noiseBurst(g, t + 0.004, 0.12, 'bandpass', 5200, 1.5, 0.6, 0.06);
  }

  impact(pos, mat, delay = 0) {
    if (!this.ctx) return;
    const t = this.now + delay;
    const p = this._panner(pos, 10);
    if (mat === 'metal') {
      const o = this.ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = 1400 + Math.random() * 500;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.5, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
      o.connect(g).connect(p);
      o.start(t);
      o.stop(t + 0.55);
    }
    this._noiseBurst(p, t, 0.3, 'lowpass', mat === 'dirt' ? 700 : 1500, 0.8, 0.8, 0.18);
  }

  // Hit confirmation, CoD-style: a dry, light impact rather than a ping — a short tick of
  // high-passed noise over a soft low thud; a headshot adds a crisper second tick.
  hitConfirm(head, delay = 0) {
    if (!this.ctx) return;
    const t = this.now + delay, ctx = this.ctx;
    const tick = (at, freq, gain, dur) => {
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      const hp = ctx.createBiquadFilter();
      hp.type = 'bandpass'; hp.frequency.value = freq; hp.Q.value = 0.9;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(gain, at + 0.002);
      g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
      src.connect(hp).connect(g).connect(this.master);
      src.start(at, Math.random() * 0.5);
      src.stop(at + dur + 0.02);
    };
    tick(t, 3600, 0.32, 0.035);
    // The soft body of the impact.
    const o = ctx.createOscillator(), og = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(170, t);
    o.frequency.exponentialRampToValueAtTime(90, t + 0.05);
    og.gain.setValueAtTime(0.0001, t);
    og.gain.exponentialRampToValueAtTime(0.22, t + 0.003);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
    o.connect(og).connect(this.master);
    o.start(t); o.stop(t + 0.08);
    if (head) tick(t + 0.045, 5200, 0.22, 0.03);
  }

  plateHit(pos, delay) {
    if (!this.ctx) return;
    const t = this.now + delay;
    const p = this._panner(pos, 80);
    for (const [f, a] of [[820, 0.7], [1310, 0.35], [2240, 0.2]]) {
      const o = this.ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(a, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
      o.connect(g).connect(p);
      o.start(t);
      o.stop(t + 1.2);
    }
  }

  bolt(delay = 0.25) {
    if (!this.ctx) return;
    const t = this.now + delay;
    this._noiseBurst(this.master, t, 0.08, 'bandpass', 3000, 3, 0.35, 0.05);
    this._noiseBurst(this.master, t + 0.28, 0.08, 'bandpass', 2400, 3, 0.4, 0.05);
    this._noiseBurst(this.master, t + 0.55, 0.06, 'bandpass', 3500, 4, 0.3, 0.04);
  }

  click() {
    if (!this.ctx) return;
    this._noiseBurst(this.master, this.now, 0.05, 'bandpass', 4000, 4, 0.25, 0.03);
  }

  beep(pos, high = false) {
    if (!this.ctx) return;
    const t = this.now;
    const dest = pos ? this._panner(pos, 25) : this.master;
    const o = this.ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = high ? 1320 : 880;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(pos ? 0.5 : 0.12, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + 0.15);
  }

  ping() {
    if (!this.ctx) return;
    const t = this.now;
    for (let i = 0; i < 2; i++) {
      const o = this.ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = i ? 1760 : 1320;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t + i * 0.12);
      g.gain.linearRampToValueAtTime(0.2, t + i * 0.12 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.12 + 0.4);
      o.connect(g).connect(this.master);
      o.start(t + i * 0.12);
      o.stop(t + i * 0.12 + 0.45);
    }
  }

  // Chicken noises (Pollo Hermano). kind: 'squawk' (launch / hurt), 'cluck' (idle), 'peck'.
  chicken(pos, kind = 'squawk', delay = 0) {
    if (!this.ctx) return;
    const t = this.now + delay;
    const dest = pos ? this._panner(pos, kind === 'peck' ? 4 : 10) : this.master;
    if (kind === 'peck') {
      this._noiseBurst(dest, t, 0.04, 'bandpass', 2600, 4, 0.6, 0.03);
      return;
    }
    const n = kind === 'cluck' ? 3 : 1;
    for (let i = 0; i < n; i++) {
      const t0 = t + i * 0.11;
      const len = kind === 'cluck' ? 0.07 : 0.32;
      const o = this.ctx.createOscillator();
      o.type = 'sawtooth';
      const f0 = kind === 'cluck' ? 380 + Math.random() * 60 : 620 + Math.random() * 120;
      o.frequency.setValueAtTime(f0, t0);
      if (kind === 'squawk') {
        o.frequency.linearRampToValueAtTime(f0 * 1.9, t0 + 0.05);
        o.frequency.linearRampToValueAtTime(f0 * 1.4, t0 + 0.14);
        o.frequency.linearRampToValueAtTime(f0 * 2.1, t0 + 0.2);
        o.frequency.exponentialRampToValueAtTime(f0 * 0.8, t0 + len);
      } else o.frequency.exponentialRampToValueAtTime(f0 * 0.7, t0 + len);
      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = kind === 'cluck' ? 900 : 1500;
      bp.Q.value = 1.6;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.linearRampToValueAtTime(kind === 'cluck' ? 0.35 : 0.5, t0 + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + len);
      o.connect(bp).connect(g).connect(dest);
      o.start(t0);
      o.stop(t0 + len + 0.02);
    }
  }

  // The Reckoning: deep ground rumble / roar, and the overlord's flick.
  rumble(dur = 3) {
    if (!this.ctx) return;
    const t = this.now;
    this._noiseBurst(this.master, t, dur, 'lowpass', 120, 0.7, 0.9, dur * 0.8);
    const o = this.ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(38, t);
    o.frequency.linearRampToValueAtTime(70, t + dur * 0.4);
    o.frequency.exponentialRampToValueAtTime(30, t + dur);
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 260;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.5, t + 0.3);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(lp).connect(g).connect(this.master);
    if (this.reverb) g.connect(this.reverb);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  flick() {
    if (!this.ctx) return;
    const t = this.now;
    this._noiseBurst(this.master, t, 0.05, 'highpass', 2500, 1, 1.2, 0.04);
    this._noiseBurst(this.master, t + 0.03, 0.8, 'bandpass', 900, 0.8, 0.5, 0.6);
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(1400, t + 0.02);
    o.frequency.exponentialRampToValueAtTime(180, t + 0.7);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.3, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.75);
    o.connect(g).connect(this.master);
    o.start(t + 0.02);
    o.stop(t + 0.8);
  }

  footstep(pos) {
    if (!this.ctx) return;
    const p = this._panner(pos, 3);
    this._noiseBurst(p, this.now, 0.1, 'bandpass', 600 + Math.random() * 300, 1.2, 0.35, 0.07);
  }

  // Night vision: the reach (cloth rustle), the mount click, and the tubes whining up (or down).
  // EMP discharge: a crackling electric snap and a falling whine.
  zap(pos) {
    if (!this.ctx) return;
    const t = this.now, p = this._panner(pos, 18);
    this._noiseBurst(p, t, 0.35, 'highpass', 3000, 0.8, 0.5, 0.25);
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = 'sawtooth'; o.frequency.setValueAtTime(1800, t); o.frequency.exponentialRampToValueAtTime(90, t + 0.5);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.12, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
    o.connect(g).connect(p); o.start(t); o.stop(t + 0.6);
  }
  // Elevator arrival: a two-note chime at the car.
  chime(pos) {
    if (!this.ctx) return;
    const t = this.now, p = this._panner(pos, 10);
    for (const [f, dt] of [[880, 0], [660, 0.32]]) {
      const o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t + dt); g.gain.exponentialRampToValueAtTime(0.12, t + dt + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + dt + 0.9);
      o.connect(g).connect(p); o.start(t + dt); o.stop(t + dt + 1);
    }
  }
  // Metal-detector alarm: a harsh two-tone buzz.
  buzzer(pos) {
    if (!this.ctx) return;
    const t = this.now, p = this._panner(pos, 25);
    for (let i = 0; i < 6; i++) {
      const o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.type = 'square'; o.frequency.value = i % 2 ? 620 : 830;
      g.gain.setValueAtTime(0.0001, t + i * 0.22); g.gain.exponentialRampToValueAtTime(0.14, t + i * 0.22 + 0.01); g.gain.setValueAtTime(0.14, t + i * 0.22 + 0.18); g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.22 + 0.21);
      o.connect(g).connect(p); o.start(t + i * 0.22); o.stop(t + i * 0.22 + 0.23);
    }
  }
  // One thread of a suppressor turning: a small metallic tick, the last one a firm seat.
  supThread(k) {
    if (!this.ctx) return;
    const t = this.now;
    this._noiseBurst(this.master, t, 0.018, 'bandpass', 5200 + 900 * k, 4, k >= 1 ? 0.12 : 0.05, 0.012);
    if (k >= 1) this._noiseBurst(this.master, t + 0.01, 0.03, 'bandpass', 2600, 2, 0.08, 0.02);
  }
  nvgReach() {
    if (!this.ctx) return;
    this._noiseBurst(this.master, this.now, 0.18, 'bandpass', 1800, 0.7, 0.05, 0.12);
  }
  nvg(on) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = this.now;
    this._noiseBurst(this.master, t, 0.03, 'highpass', 3500, 0.8, 0.35, 0.02);
    this._noiseBurst(this.master, t + 0.045, 0.02, 'highpass', 5000, 0.8, 0.2, 0.015);
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(on ? 4200 : 9800, t + 0.05);
    o.frequency.exponentialRampToValueAtTime(on ? 10500 : 2500, t + (on ? 0.9 : 0.5));
    g.gain.setValueAtTime(0.0001, t + 0.05);
    g.gain.exponentialRampToValueAtTime(on ? 0.035 : 0.025, t + 0.15);
    g.gain.exponentialRampToValueAtTime(on ? 0.008 : 0.0001, t + (on ? 1.4 : 0.6));
    g.gain.exponentialRampToValueAtTime(0.0001, t + (on ? 2.6 : 0.7));
    o.connect(g).connect(this.master);
    o.start(t + 0.05);
    o.stop(t + 2.7);
  }

  // A footstep somewhere in the world. heavy: juggernaut/titan weight. muffled: through a wall.
  stepAt(pos, heavy = false, muffled = false, gain = 1) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const p = this._panner(pos, heavy ? 5 : 3);
    let dest = p;
    if (muffled) { const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420; lp.connect(p); dest = lp; }
    this._noiseBurst(dest, this.now, heavy ? 0.16 : 0.09, 'bandpass', (heavy ? 220 : 520) + Math.random() * 180, 1.1, (heavy ? 0.55 : 0.3) * gain, heavy ? 0.12 : 0.06);
    if (heavy) this._thump(dest, this.now, 55, 0.35 * gain, 0.18);
  }

  // A guard's radio: a squelch and a burst of garbled chatter at their position.
  radioAt(pos, muffled = false) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = this.now;
    const p = this._panner(pos, 4);
    let dest = p;
    if (muffled) { const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 600; lp.connect(p); dest = lp; }
    this._noiseBurst(dest, t, 0.06, 'bandpass', 2400, 2, 0.18, 0.05);
    for (let i = 0; i < 5; i++) this._noiseBurst(dest, t + 0.08 + i * 0.09 + Math.random() * 0.04, 0.07, 'bandpass', 900 + Math.random() * 900, 4, 0.1, 0.06);
    this._noiseBurst(dest, t + 0.62, 0.05, 'bandpass', 2400, 2, 0.14, 0.04);
  }

  // Loop gain / muffling (patrol-drone hum behind walls).
  loopGain(key, v) {
    const l = this.loops && this.loops[key];
    if (!l) return;
    l.g.gain.setTargetAtTime(v, this.ctx.currentTime, 0.15);
  }

  _startWind() {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 400;
    f.Q.value = 0.5;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0.05;
    this.windFilter = f;
    src.connect(f).connect(this.windGain).connect(this.master);
    src.start();
  }

  setWind(speed) {
    if (!this.windGain) return;
    const t = this.ctx.currentTime;
    this.windGain.gain.setTargetAtTime(0.02 + speed * 0.012, t, 0.5);
    this.windFilter.frequency.setTargetAtTime(250 + speed * 60, t, 0.5);
  }

  // Persistent positional loops (e.g. drone rotor buzz).
  startLoop(key, pos, type, gain = 0.4) {
    if (!this.ctx) return;
    this.loops ||= {};
    if (this.loops[key]) return;
    const ctx = this.ctx;
    const p = this._panner(pos, 12);
    // 'lift': an elevator car running: a low cable hum and a soft rumble.
    if (type === 'lift') {
      const src = ctx.createBufferSource();
      src.buffer = this.noise; src.loop = true;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 220;
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = 96;
      const og = ctx.createGain(); og.gain.value = 0.25;
      const g = ctx.createGain(); g.gain.value = gain;
      src.connect(lp).connect(g); o.connect(og).connect(g); g.connect(p);
      src.start(0, Math.random()); o.start();
      this.loops[key] = { p, oscs: [src, o], g };
      return;
    }
    // 'rotor': a soft quadcopter whoosh (filtered air with a gentle blade pulse, no tones).
    if (type === 'rotor') {
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      src.loop = true;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 520;
      bp.Q.value = 0.55;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 1400;
      const trem = ctx.createGain();
      trem.gain.value = 0.75;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 17 + Math.random() * 4;
      const lg = ctx.createGain();
      lg.gain.value = 0.2;
      lfo.connect(lg).connect(trem.gain);
      const g = ctx.createGain();
      g.gain.value = gain;
      src.connect(bp).connect(lp).connect(trem).connect(g).connect(p);
      src.start(0, Math.random());
      lfo.start();
      this.loops[key] = { p, oscs: [src], lfo, g };
      return;
    }
    const g = ctx.createGain();
    g.gain.value = gain;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 900;
    f.Q.value = 0.8;
    const trem = ctx.createGain();
    trem.gain.value = 0.7;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 23;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.3;
    lfo.connect(lfoGain).connect(trem.gain);
    const oscs = [178, 183, 356].map((fr) => {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = fr;
      o.connect(f);
      o.start();
      return o;
    });
    f.connect(trem).connect(g).connect(p);
    lfo.start();
    this.loops[key] = { p, oscs, lfo, g };
  }

  updateLoop(key, pos) {
    const l = this.loops && this.loops[key];
    if (!l) return;
    if (l.p.positionX) {
      l.p.positionX.value = pos.x;
      l.p.positionY.value = pos.y;
      l.p.positionZ.value = pos.z;
    } else l.p.setPosition(pos.x, pos.y, pos.z);
  }

  stopLoop(key) {
    const l = this.loops && this.loops[key];
    if (!l) return;
    l.oscs.forEach((o) => o.stop());
    if (l.lfo) l.lfo.stop();
    l.p.disconnect();
    delete this.loops[key];
  }

  setMuffled(on) {
    if (!this.master) return;
    this.master.gain.setTargetAtTime(on ? this.volume * 0.4 : this.volume, this.ctx.currentTime, 0.2);
  }
}

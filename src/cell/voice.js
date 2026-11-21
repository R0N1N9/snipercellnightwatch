// Sniper Cell — tactical radio. Every line (operators, ISR Overwatch, cut-scenes, callouts)
// goes out over a squad net that sounds the part:
//   key-up      a mic click and a short "kssh" of static before the voice
//   the line    clipped male voices (recordings in audio/vo; otherwise the deepest, most natural
//               male voices the device has, a different one per speaker where possible)
//               over a band-limited static bed with crackle pops and brief dropouts;
//               Overwatch is a longer-range link, so its bed is heavier
//   key-down    a falling squelch tail; Overwatch ends on a two-tone talk-permit chirp
// Every line is subtitled on screen (speaker + text), even where speech isn't available.
// Recorded lines: audio/vo/ holds every scripted line pre-rendered with neural male voices
// (Kokoro; Ra, Ronin and Overwatch each have their own) and run through a radio treatment
// (narrow band, presence bump, hard compression, grit). A line with a recording plays that;
// anything else falls back to the browser's speech synthesis. See tools/vo/.
// Lines queue so nobody talks over anybody, and stale chatter is dropped.
// Synthesised voices sound most natural near their own pitch: a gentle offset per speaker
// (and a little per-line rate variation) rather than a deep pitch-down, which reads robotic.
const SPEAKERS = {
  shooter: { pitch: 0.9, rate: 1.0, color: '#ffb040', bed: 0.016 },
  spotter: { pitch: 0.98, rate: 1.06, color: '#4fd8ff', bed: 0.016 },
  isr: { pitch: 0.94, rate: 0.98, color: '#8dff9e', bed: 0.024 },
};
// Male voices, best first (natural / enhanced voices on Edge, macOS / iPadOS, Chrome, Windows).
const MALE = [
  /\(natural\)|natural.*(male|guy|andrew|brian|christopher|eric|davis|roger|steffan|ryan|thomas)/i,
  /guy online|ryan online|christopher online|eric online|davis online|andrew online|brian online|roger online|steffan online|thomas online/i,
  /\b(aaron|arthur|evan|nathan|tom|reed|rishi|gordon|lee|daniel|oliver)\b.*(enhanced|premium)/i,
  /\b(aaron|arthur|daniel|evan|nathan|tom|gordon|lee|oliver|fred|alex|ralph|reed|rocko|eddy|grandpa)\b/i,
  /google uk english male|microsoft (david|mark|george|james|richard|sean)|\bmale\b/i,
];
const FEMALE = /female|michelle|emma|ana online|natasha|clara|jane|nancy|elizabeth|amber|ashley|cora|monica|sonia|maisie|hollie|libby|samantha|victoria|karen|zira|susan|moira|tessa|serena|kate|fiona|allison|ava|nicky|sara|jenny|aria|libby|sonia|catherine|martha|shelley|sandy|flo|google us english$|google uk english female/i;

export function primeVoice() {
  // iOS only lets speech start from a user gesture: say nothing once, from a click.
  try { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; speechSynthesis.speak(u); } catch {}
}

export class Radio {
  constructor(audio) {
    this.a = audio;
    this.q = [];
    this.busy = false;
    this.enabled = true;
    this.voices = [];
    this.names = { shooter: 'RA', spotter: 'RŌNIN', isr: 'OVERWATCH' };
    // Voice audio can be switched off (menu / pause): lines then show as subtitles only.
    this.voiceOn = voiceSetting();
    const load = () => {
      try {
        const all = speechSynthesis.getVoices();
        const en = all.filter((v) => /^en/i.test(v.lang));
        this.voices = en.length ? en : all;
        this._cast = null;
      } catch {}
    };
    try { load(); speechSynthesis.onvoiceschanged = load; } catch {}
    // Recorded voice lines (absent in the single-file build or offline: speech synthesis then).
    this.vo = null;
    this.buf = new Map();
    try {
      fetch(VO_DIR + 'manifest.json').then((r) => (r.ok ? r.json() : null)).then((m) => { this.vo = m; }).catch(() => {});
    } catch {}
    // Subtitles.
    const el = (this.sub = document.createElement('div'));
    el.id = 'cell-subs';
    document.body.appendChild(el);
  }

  // Pick a male voice per speaker, distinct where the device has enough of them.
  _casting() {
    if (this._cast) return this._cast;
    const V = this.voices.filter((v) => !FEMALE.test(v.name));
    const ranked = [];
    for (const re of MALE) for (const v of V) if (re.test(v.name) && !ranked.includes(v)) ranked.push(v);
    // American English first (US radio dispatch), keeping the quality order within each group.
    const us = (v) => (/en[-_]US/i.test(v.lang) ? 0 : 1);
    ranked.sort((a, b) => us(a) - us(b));
    const pool = ranked.length ? ranked : V.length ? V : this.voices;
    this._cast = { shooter: pool[0] || null, spotter: pool[1] || pool[0] || null, isr: pool[2] || pool[0] || null };
    return this._cast;
  }

  // keep: a line that must not be dropped (e.g. the opening brief), however long it waits.
  // Free for optional chatter: nothing playing or queued, and none in the last few seconds.
  idle() {
    return !this.busy && !this.q.length;
  }
  free() {
    return !this.busy && !this.q.length && performance.now() - (this._lastLow || -1e9) > 6000;
  }

  say(who, text, prio = false, keep = false, low = false) {
    if (!this.enabled || !text) return;
    if (low) { if (!this.free()) return; this._lastLow = performance.now(); }
    const item = { who, text, t: performance.now(), keep };
    if (this.vo && window.__voMiss && !this._recorded(item)) window.__voMiss.push(`${who}: ${text}`); // test hook: lines with no clip
    if (prio) this.q.unshift(item); else this.q.push(item);
    // Too much chatter queued: drop the oldest throwaway line.
    while (this.q.filter((q) => !q.keep).length > 4) this.q.splice(this.q.findIndex((q) => !q.keep), 1);
    if (!this.busy) this._next();
  }

  stop() {
    this.q.length = 0;
    try { speechSynthesis.cancel(); } catch {}
    this._bed(false);
    this._subtitle(null);
    this.busy = false;
  }

  _next() {
    // Drop lines that went stale waiting (> 6 s).
    while (this.q.length && !this.q[0].keep && performance.now() - this.q[0].t > 6000) this.q.shift();
    const item = this.q.shift();
    if (!item) { this.busy = false; return; }
    this.busy = true;
    const S = SPEAKERS[item.who] || SPEAKERS.shooter;
    const sound = this.voiceOn;
    if (sound) { this._keyUp(); this._bed(true, item.who); }
    this._subtitle(item);
    let done = false, guard = 0;
    // Each entry stays up long enough to type out and be read, even if the audio is quicker
    // (or speech isn't available at all).
    const minEnd = performance.now() + Math.min(7000, 1300 + item.text.length * 32);
    const finish = () => {
      if (done) return;
      const wait = minEnd - performance.now();
      if (wait > 30) { clearTimeout(guard); guard = setTimeout(finish, wait); return; }
      done = true;
      clearTimeout(guard);
      if (sound) { this._bed(false); this._keyDown(item.who); }
      clearTimeout(this._subT);
      this._subT = setTimeout(() => this._subtitle(null), 900);
      // A beat between transmissions, like a real net: replies don't land on top of each other.
      setTimeout(() => this._next(), 650 + Math.random() * 400);
    };
    if (!sound) { guard = setTimeout(finish, 0); return; }
    const rec = this._recorded(item);
    if (rec) {
      // A safety timeout until the clip's real length is known.
      guard = setTimeout(finish, 3000 + item.text.length * 90);
      this._play(rec).then((dur) => { clearTimeout(guard); guard = setTimeout(finish, dur * 1000 + 120); }, () => this._speak(item, S, finish));
      return;
    }
    guard = setTimeout(finish, 1400 + item.text.length * 75);
    this._speak(item, S, finish);
  }

  // Which recording (if any) carries this line for this speaker.
  _recorded(item) {
    const V = this.vo && this.vo[item.who];
    if (!V || !this.a || !this.a.ctx) return null;
    return V[normLine(item.text)] || null;
  }

  // Fetch + decode (cached; the oldest buffers are dropped past 48) and play a recording just
  // after the key-up. Resolves with its duration.
  async _play(rel) {
    const A = this.a, ctx = A.ctx;
    let b = this.buf.get(rel);
    if (!b) {
      const r = await fetch(VO_DIR + rel);
      if (!r.ok) throw new Error('missing');
      const ab = await r.arrayBuffer();
      // Callback form: older iPad Safari doesn't return a promise from decodeAudioData.
      b = await new Promise((res, rej) => ctx.decodeAudioData(ab, res, rej));
      this.buf.set(rel, b);
      if (this.buf.size > 48) this.buf.delete(this.buf.keys().next().value);
    }
    const src = ctx.createBufferSource();
    src.buffer = b;
    const g = ctx.createGain();
    g.gain.value = 1.15;
    src.connect(g).connect(A.master);
    src.start(ctx.currentTime + 0.1);
    return b.duration + 0.1;
  }

  _speak(item, S, finish) {
    try {
      if (!window.speechSynthesis) throw new Error('no tts');
      // Radio-style delivery: no trailing full stop, so clipped calls don't sound read out.
      const u = new SpeechSynthesisUtterance(item.text.replace(/\.\s*$/, ''));
      const v = this._casting()[item.who] || this._casting().shooter;
      if (v) { u.voice = v; u.lang = v.lang; }
      u.pitch = S.pitch;
      u.rate = S.rate * (0.96 + Math.random() * 0.08);
      u.volume = 1;
      u.onend = finish;
      u.onerror = finish;
      setTimeout(() => { try { speechSynthesis.speak(u); } catch { finish(); } }, 150);
    } catch { setTimeout(finish, 900 + item.text.length * 45); }
  }

  _subtitle(item) {
    const el = this.sub;
    if (!el) return;
    if (!item) { el.classList.remove('on'); return; }
    clearTimeout(this._subT);
    const S = SPEAKERS[item.who] || SPEAKERS.shooter;
    const name = (this.names[item.who] || item.who).toUpperCase();
    // Terminal entry: a prompt and the callsign, then the line typed out with a cursor.
    el.innerHTML = `<b style="color:${S.color}">&gt; ${esc(name)}</b><span class="tx"></span><i class="cur"></i>`;
    el.style.setProperty('--c', S.color);
    el.classList.add('on');
    const tx = el.querySelector('.tx'), text = item.text;
    let n = 0;
    clearInterval(this._typeT);
    this._typeT = setInterval(() => {
      n = Math.min(text.length, n + 2);
      tx.textContent = text.slice(0, n);
      if (n >= text.length) clearInterval(this._typeT);
    }, 40);
  }

  // Key-up: mic click and a short burst of static.
  _keyUp() {
    const A = this.a;
    if (!A || !A.ctx) return;
    const t = A.now, ctx = A.ctx;
    this._click(t, 1700, 0.07);
    // Squelch opening: a short burst of static sweeping up, then settling under the voice.
    const src = ctx.createBufferSource();
    src.buffer = A.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass'; f.Q.value = 1.2;
    f.frequency.setValueAtTime(900, t);
    f.frequency.exponentialRampToValueAtTime(2800, t + 0.12);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.13, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
    src.connect(f).connect(g).connect(A.master);
    src.start(t, Math.random());
    src.stop(t + 0.17);
  }

  // Key-down: a falling squelch tail ("pssht"); Overwatch adds a two-tone talk-permit chirp.
  _keyDown(who) {
    const A = this.a;
    if (!A || !A.ctx) return;
    const ctx = A.ctx, t = A.now;
    const src = ctx.createBufferSource();
    src.buffer = A.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 1.6;
    f.frequency.setValueAtTime(3200, t);
    f.frequency.exponentialRampToValueAtTime(700, t + 0.2);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.16, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    src.connect(f).connect(g).connect(A.master);
    src.start(t, Math.random());
    src.stop(t + 0.25);
    this._click(t + 0.2, 900, 0.05);
    if (who === 'isr') { this._tone(t + 0.26, 1250, 0.06); this._tone(t + 0.34, 1650, 0.08); }
  }

  _click(t, freq, gain) {
    const A = this.a, o = A.ctx.createOscillator(), g = A.ctx.createGain();
    o.type = 'square';
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
    o.connect(g).connect(A.master);
    o.start(t);
    o.stop(t + 0.04);
  }
  _tone(t, freq, dur) {
    const A = this.a, o = A.ctx.createOscillator(), g = A.ctx.createGain();
    o.type = 'sine';
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.06, t + 0.008);
    g.gain.setValueAtTime(0.06, t + dur - 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(A.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  // The static bed under a transmission: quiet band-limited hiss with a little flutter and
  // the occasional pop. Overwatch's long-range link is a touch noisier. Kept low: the voice
  // itself carries the radio character (Codec2 in the recordings).
  _bed(on, who) {
    const A = this.a;
    if (!A || !A.ctx || !A.noise) return;
    const ctx = A.ctx;
    if (on && !this.bed) {
      const S = SPEAKERS[who] || SPEAKERS.shooter;
      const src = ctx.createBufferSource();
      src.buffer = A.noise;
      src.loop = true;
      // Narrow-band hiss (a radio passband) with a presence bump.
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 450;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 3400;
      const pk = ctx.createBiquadFilter();
      pk.type = 'peaking'; pk.frequency.value = 1800; pk.Q.value = 0.8; pk.gain.value = 4;
      const g = ctx.createGain();
      g.gain.value = S.bed;
      // Two wobbles: a fast flutter and a slow fade, like a signal drifting in and out.
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 7 + Math.random() * 5;
      const lg = ctx.createGain();
      lg.gain.value = S.bed * 0.35;
      lfo.connect(lg).connect(g.gain);
      const slow = ctx.createOscillator();
      slow.frequency.value = 0.35 + Math.random() * 0.4;
      const sg = ctx.createGain();
      sg.gain.value = S.bed * 0.4;
      slow.connect(sg).connect(g.gain);
      src.connect(hp).connect(lp).connect(pk).connect(g).connect(A.master);
      src.start(0, Math.random());
      lfo.start(); slow.start();
      // Crackle (short pops of varied pitch), and the odd brief breakup on every link.
      const tick = () => {
        if (!this.bed || this.bed.src !== src) return;
        const t = ctx.currentTime;
        if (Math.random() < 0.16) A._noiseBurst(A.master, t, 0.006 + Math.random() * 0.018, 'bandpass', 1200 + Math.random() * 2800, 2.5, S.bed * (1.2 + Math.random() * 2.4), 0.006);
        if (Math.random() < (who === 'isr' ? 0.04 : 0.015)) { const d = 0.04 + Math.random() * 0.09; g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(S.bed * 2.2, t); g.gain.setValueAtTime(S.bed * 0.2, t + 0.012); g.gain.setValueAtTime(S.bed, t + d); }
        this.bed.timer = setTimeout(tick, 35 + Math.random() * 140);
      };
      this.bed = { src, lfo, slow, g, timer: setTimeout(tick, 60) };
    } else if (!on && this.bed) {
      const b = this.bed;
      this.bed = null;
      clearTimeout(b.timer);
      try { b.g.gain.setTargetAtTime(0, ctx.currentTime, 0.02); setTimeout(() => { try { b.src.stop(); b.lfo.stop(); b.slow && b.slow.stop(); } catch {} }, 120); } catch {}
    }
  }
}

const VO_DIR = 'audio/vo/';
const VOICE_KEY = 'draxxed.cellVoice';
export function voiceSetting() {
  try { return localStorage.getItem(VOICE_KEY) !== 'off'; } catch { return true; }
}
export function setVoiceSetting(on) {
  try { localStorage.setItem(VOICE_KEY, on ? 'on' : 'off'); } catch {}
}
// Same normalisation as tools/vo/generate.py: lower case, letters/digits/spaces only.
export function normLine(t) {
  return String(t).toLowerCase().replace(/\u2019/g, "'").replace(/\u2026/g, '...').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function esc(s) {
  return String(s).replace(/[<>&"]/g, (ch) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[ch]));
}

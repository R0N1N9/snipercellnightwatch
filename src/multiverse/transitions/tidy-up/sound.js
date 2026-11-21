// TIDY-UP TIME — the score. Everything in the toy world is plastic, wood or tin and sounds it;
// this film adds a grown-up's voice through a closed door (a sawtooth through two vowel
// formants, wordless but with the unmistakable lilt of "ti-dy UP ti-ime!"), a light switch,
// a ceiling bulb's hum, and the world's own music box winding down in the dark.
import { clamp } from '../../kit.js';

// Vowel formants (Hz): F1, F2.
const V = { i: [300, 2300], I: [400, 1900], a: [750, 1250], u: [350, 900], e: [520, 1850], o: [520, 950], m: [250, 1100] };
// Three ways to call it: [syllable onset s, length s, semitones from the base, vowel, glide-to vowel, consonant]
export const CALLS = [
  [[0, 0.13, 4, 'i', null, 't'], [0.15, 0.12, 0, 'i', null, 'd'], [0.3, 0.22, 7, 'a', 'u', 0], [0.56, 0.42, 4, 'a', 'i', 't'], [0.98, 0.12, 0, 'm', null, 0]],
  [[0, 0.12, 7, 'i', null, 't'], [0.14, 0.12, 4, 'i', null, 'd'], [0.29, 0.24, 9, 'a', 'u', 0], [0.56, 0.2, 7, 'a', 'i', 't'], [0.78, 0.3, 4, 'a', 'i', 0]],
  [[0, 0.11, 0, 'i', null, 't'], [0.13, 0.11, 0, 'i', null, 'd'], [0.27, 0.2, 5, 'a', 'u', 0], [0.5, 0.18, 3, 'a', 'i', 't'], [0.7, 0.36, 0, 'a', 'i', 0]],
];

export function makeSound(A) {
  const live = []; // nodes to silence on dispose
  const ac = () => A.ctx;
  let bus = null;
  // One bus for the voice: a door (lowpass) and the hall behind it (a short, dull echo).
  function voiceBus() {
    if (bus || !A.ctx || !A.out) return bus;
    try {
      const c = A.ctx, door = c.createBiquadFilter(), hall = c.createDelay(0.5), fb = c.createGain(), wet = c.createGain(), out = c.createGain();
      door.type = 'lowpass'; door.frequency.value = 1150; door.Q.value = 0.7;
      hall.delayTime.value = 0.085; fb.gain.value = 0.32; wet.gain.value = 0.4; out.gain.value = 1;
      door.connect(out); door.connect(hall); hall.connect(fb); fb.connect(hall); hall.connect(wet); wet.connect(out); out.connect(A.out);
      bus = { in: door, out, nodes: [door, hall, fb, wet, out] };
      live.push(...bus.nodes);
    } catch { bus = null; }
    return bus;
  }

  // A voice: one sawtooth (with a little vibrato) through two formant filters per syllable.
  function call(shape, baseHz, gain, delay = 0) {
    const b = voiceBus(), c = ac();
    if (!b || !c) return;
    const t0 = c.currentTime + delay;
    for (const [on, len, semi, v0, v1, cons] of shape) {
      const f = baseHz * Math.pow(2, semi / 12), t = t0 + on;
      try {
        const o = c.createOscillator(), vib = c.createOscillator(), vg = c.createGain(), env = c.createGain();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(f * 0.97, t);
        o.frequency.linearRampToValueAtTime(f, t + 0.04);
        o.frequency.setValueAtTime(f, t + len * 0.7);
        o.frequency.linearRampToValueAtTime(f * (v1 ? 0.93 : 0.98), t + len); // a falling lilt at the end of each
        vib.frequency.value = 5.5; vg.gain.value = f * 0.012;
        vib.connect(vg); vg.connect(o.frequency);
        const fs = [0, 1].map((k) => {
          const bp = c.createBiquadFilter();
          bp.type = 'bandpass'; bp.Q.value = k ? 9 : 6;
          bp.frequency.setValueAtTime(V[v0][k], t);
          if (v1) bp.frequency.linearRampToValueAtTime(V[v1][k], t + len * 0.9);
          return bp;
        });
        env.gain.setValueAtTime(0.0001, t);
        env.gain.exponentialRampToValueAtTime(gain, t + 0.03);
        env.gain.setValueAtTime(gain, t + len * 0.75);
        env.gain.exponentialRampToValueAtTime(0.0001, t + len + 0.06);
        o.connect(fs[0]); o.connect(fs[1]); fs[0].connect(env); fs[1].connect(env); env.connect(b.in);
        o.start(t); vib.start(t); o.stop(t + len + 0.1); vib.stop(t + len + 0.1);
        live.push(o, vib);
      } catch { /* audio went away */ }
      // consonants: a tick of breath at the front of the syllable
      if (cons === 't') A.noise({ filter: 'highpass', freq: 2400, dur: 0.035, gain: gain * 0.45, delay: delay + on - 0.02 });
      else if (cons === 'd') A.noise({ filter: 'bandpass', freq: 1500, q: 1.2, dur: 0.03, gain: gain * 0.3, delay: delay + on - 0.015 });
    }
  }

  const tock = (f, g, pan = 0, delay = 0) => { // wood
    A.tone({ freq: f, freqEnd: f * 0.6, type: 'triangle', dur: 0.08, gain: g, pan, delay });
    A.tone({ freq: f * 0.3, freqEnd: f * 0.22, type: 'sine', dur: 0.07, gain: g * 0.9, pan, delay });
    A.noise({ dur: 0.03, gain: g * 0.9, filter: 'bandpass', freq: 2200, q: 2, pan, delay });
  };
  const click = (g, pan = 0, delay = 0, f = 2400) => { // plastic
    A.tone({ freq: f, freqEnd: f * 0.7, type: 'square', dur: 0.022, gain: g * 0.35, pan, delay });
    A.noise({ dur: 0.028, gain: g, filter: 'bandpass', freq: f * 1.25, q: 2, pan, delay });
  };

  return {
    call,
    // the switch on the wall, the bulb catching, its faint hum
    lightsOn() {
      A.sfx('click', { gain: 1.0, pitch: 0.55 });
      A.tone({ freq: 140, freqEnd: 70, type: 'sine', dur: 0.12, gain: 0.35 });
      A.noise({ filter: 'bandpass', freq: 900, q: 0.8, dur: 0.05, gain: 0.3, delay: 0.01 });
      A.tone({ freq: 100, type: 'sine', dur: 2.4, gain: 0.03, attack: 0.05, delay: 0.02 });
      A.tone({ freq: 200, type: 'triangle', dur: 1.8, gain: 0.008, attack: 0.05, delay: 0.02 });
    },
    // a sleeve going past the lens
    swish(g = 0.3, pan = 0, delay = 0) { A.noise({ filter: 'bandpass', freq: 700, freqEnd: 1600, q: 0.7, dur: 0.32, gain: g, attack: 0.12, pan, delay }); },
    // a hand meeting the rug
    pat(g = 0.4, pan = 0, delay = 0) { A.noise({ filter: 'lowpass', freq: 380, freqEnd: 140, dur: 0.12, gain: g, pan, delay }); A.tone({ freq: 90, freqEnd: 60, type: 'sine', dur: 0.1, gain: g * 0.6, pan, delay }); },
    tock, click,
    rattle(n, g, pan, delay = 0, spread = 0.25, seed = 1) { // a handful of plastic
      for (let i = 0; i < n; i++) { const r = Math.sin(seed * 91.7 + i * 12.9) * 0.5 + 0.5; click(g * (0.6 + 0.4 * r), pan + (r - 0.5) * 0.3, delay + (i / n) * spread * (0.7 + 0.6 * r), 1800 + r * 1900); }
    },
    clatter(n, g, pan, delay = 0, spread = 0.35, seed = 1) { // wood into wood
      for (let i = 0; i < n; i++) { const r = Math.sin(seed * 33.1 + i * 7.3) * 0.5 + 0.5; tock(700 + r * 900, g * (0.5 + 0.5 * r), pan + (r - 0.5) * 0.4, delay + Math.pow(i / n, 1.3) * spread); }
      A.noise({ filter: 'lowpass', freq: 500, dur: 0.25, gain: g * 0.7, pan, delay });
    },
    dominoes(n, pan, delay = 0) { for (let i = 0; i < n; i++) A.tone({ freq: 1900 + i * 60, freqEnd: 1300, type: 'square', dur: 0.025, gain: 0.08, pan, delay: delay + i * 0.045 }); },
    ding(g = 0.12, pan = 0, delay = 0) { A.tone({ freq: 1568, type: 'sine', dur: 0.9, gain: g, pan, delay }); A.tone({ freq: 3136, type: 'sine', dur: 0.4, gain: g * 0.3, pan, delay }); },
    lid(close, delay = 0) {
      if (close) {
        A.tone({ freq: 70, freqEnd: 38, type: 'sine', dur: 0.55, gain: 0.7, delay });
        A.noise({ filter: 'lowpass', freq: 600, freqEnd: 120, dur: 0.4, gain: 0.6, delay });
        A.sfx('thud', { gain: 0.6, pitch: 0.6, delay });
        tock(420, 0.3, 0, delay + 0.01);
      } else {
        A.noise({ filter: 'bandpass', freq: 380, freqEnd: 720, q: 4, dur: 0.35, gain: 0.12, delay }); // the hinge
        A.noise({ filter: 'highpass', freq: 1800, freqEnd: 600, dur: 0.6, gain: 0.08, attack: 0.25, delay }); // air and room
      }
    },
    creak(delay = 0) { A.noise({ filter: 'bandpass', freq: 520, freqEnd: 360, q: 6, dur: 0.3, gain: 0.08, delay }); },
    // The music box from the world's lullaby, one note at a time, the spring running down.
    note(midi, g, delay = 0, dur = 0.9, bend = 1) {
      const f = 440 * Math.pow(2, (midi - 69) / 12) * bend;
      A.tone({ freq: f, type: 'sine', dur, gain: g, delay });
      A.tone({ freq: f * 2.01, type: 'sine', dur: dur * 0.35, gain: g * 0.25, delay });
      A.tone({ freq: f * 4.03, type: 'triangle', dur: 0.05, gain: g * 0.12, delay });
    },
    whoosh(g, pitch = 1, delay = 0) { A.sfx('whoosh', { gain: g, pitch, delay }); },
    riser(dur, g, delay = 0) { A.noise({ filter: 'bandpass', freq: 300, freqEnd: 2600, q: 1.2, dur, gain: g, attack: dur * 0.85, delay }); A.tone({ freq: 220, freqEnd: 660, type: 'sine', dur, gain: g * 0.25, attack: dur * 0.8, delay }); },
    chord(notes, g, delay = 0, dur = 1.6) { notes.forEach((m, i) => { const f = 440 * Math.pow(2, (m - 69) / 12); A.tone({ freq: f, type: i ? 'triangle' : 'sine', dur, gain: g / (1 + i * 0.4), delay: delay + i * 0.015, attack: 0.01 }); }); },
    shake(delay = 0) { // a snow globe: water and glitter
      A.noise({ filter: 'bandpass', freq: 1800, freqEnd: 900, q: 1.5, dur: 0.22, gain: 0.12, delay });
      for (let i = 0; i < 5; i++) A.tone({ freq: 3400 + i * 300, type: 'sine', dur: 0.15, gain: 0.02, delay: delay + 0.05 + i * 0.04 });
    },
    page(delay = 0) { A.noise({ filter: 'highpass', freq: 1500, freqEnd: 3800, dur: 0.22, gain: 0.12, attack: 0.08, delay }); A.noise({ filter: 'bandpass', freq: 600, q: 1, dur: 0.12, gain: 0.08, delay: delay + 0.15 }); },
    dispose() {
      const c = A.ctx;
      for (const n of live) {
        try { if (n.stop) n.stop(c ? c.currentTime + 0.02 : 0); } catch { /* not started or already stopped */ }
        try { n.disconnect(); } catch { /* already gone */ }
      }
      live.length = 0;
      bus = null;
    },
  };
}

export const panOf = (x) => clamp(x / 34, -0.8, 0.8);

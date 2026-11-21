// BLOW ON IT — the one sound that has to sustain: a crashed console's stuck note. A pair of
// square waves a hair apart (they beat), gated by a square LFO (the sound buffer looping one
// frame), through a low-pass so it buzzes rather than screams. Everything else is one-shots.
export function makeDrone(audio) {
  let n = null;
  const safe = (fn) => { try { fn(); } catch { /* audio is decoration: never throw */ } };
  return {
    start(freq, stutter, gain) {
      safe(() => {
        const ac = audio.ctx, out = audio.out;
        if (!ac || !out || n) return;
        const now = ac.currentTime;
        const o1 = ac.createOscillator(), o2 = ac.createOscillator(), lfo = ac.createOscillator();
        o1.type = o2.type = 'square';
        lfo.type = 'square';
        o1.frequency.value = freq;
        o2.frequency.value = freq * 1.007;
        lfo.frequency.value = stutter || 15;
        const lp = ac.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 2400;
        const gate = ac.createGain(), depth = ac.createGain(), vol = ac.createGain();
        gate.gain.value = 0.55;
        depth.gain.value = stutter ? 0.45 : 0;
        vol.gain.setValueAtTime(0, now);
        vol.gain.linearRampToValueAtTime(gain, now + 0.04);
        lfo.connect(depth); depth.connect(gate.gain);
        o1.connect(lp); o2.connect(lp); lp.connect(gate); gate.connect(vol); vol.connect(out);
        o1.start(now); o2.start(now); lfo.start(now);
        n = { o1, o2, lfo, lp, gate, depth, vol, gain };
      });
    },
    /** Change the stuck note: a new pitch, a stutter rate (0 = a steady drone). */
    set(freq, stutter) {
      safe(() => {
        if (!n) return;
        const now = audio.ctx.currentTime;
        n.o1.frequency.setValueAtTime(freq, now);
        n.o2.frequency.setValueAtTime(freq * 1.007, now);
        if (stutter) n.lfo.frequency.setValueAtTime(stutter, now);
        n.depth.gain.setValueAtTime(stutter ? 0.45 : 0, now);
        n.gate.gain.setValueAtTime(stutter ? 0.55 : 1, now);
      });
    },
    stop(fade = 0.02) {
      safe(() => {
        if (!n) return;
        const now = audio.ctx.currentTime;
        n.vol.gain.cancelScheduledValues(now);
        n.vol.gain.setValueAtTime(n.vol.gain.value, now);
        n.vol.gain.linearRampToValueAtTime(0, now + fade);
        // stopped oscillators release the whole chain behind them: no timer has to outlive us
        for (const o of [n.o1, n.o2, n.lfo]) o.stop(now + fade + 0.05);
      });
      n = null;
    },
  };
}

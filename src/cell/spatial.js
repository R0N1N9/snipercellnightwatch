// Sniper Cell — directional audio cues, made for headphones (HRTF panning on every source):
//   guard footsteps     nearby walkers, heavier for juggernauts and titans; muffled through walls
//   radio chatter       squelch bursts from alerted / searching guards
//   patrol-drone rotors a soft rotor whoosh on the two nearest drones, quieter behind cover
//   partner footsteps   so you can hear your buddy coming up beside you
import * as THREE from 'three';

const HEAVY = new Set(['jugg', 'titan', 'overseer']);

export const Spatial = {
  _spatialInit() {
    this._sp = { steps: new Map(), radio: new Map(), loops: new Set(), los: new Map(), losT: 0, partnerT: 0, partnerPrev: null };
  },

  _spatialTick(dt) {
    const A = this.audio;
    if (!A || !A.ctx) return;
    const sp = this._sp, S = this.sentinel;
    const ear = this.camera.getWorldPosition(new THREE.Vector3());
    const off = this.ended || (this.cine && this.cine.active);
    // Occlusion is checked a few times a second, not every frame.
    sp.losT -= dt;
    const recheck = sp.losT <= 0;
    if (recheck) sp.losT = 0.25;
    const heard = (e, y) => {
      if (recheck || !sp.los.has(e.id)) sp.los.set(e.id, this.fac.los(ear, { x: e.x, y, z: e.z }));
      return sp.los.get(e.id);
    };
    // Footsteps and radios from the nearest guards.
    const near = off ? [] : S.guards
      .filter((g) => g.state !== 'dead')
      .map((g) => ({ g, d: Math.hypot(g.x - ear.x, (g.y || 0) - ear.y, g.z - ear.z) }))
      .filter((o) => o.d < 26)
      .sort((a, b) => a.d - b.d)
      .slice(0, 6);
    for (const { g, d } of near) {
      const y = (g.y || 0) + 1.2;
      if (g.moving) {
        const fast = g.state === 'alert' || g.state === 'berserk' || g.state === 'flee';
        let t = (sp.steps.get(g.id) ?? Math.random() * 0.4) - dt;
        if (t <= 0) {
          t = fast ? 0.32 : HEAVY.has(g.type) ? 0.62 : 0.5;
          const vis = heard(g, y);
          A.stepAt({ x: g.x, y: (g.y || 0) + 0.1, z: g.z }, HEAVY.has(g.type), !vis, d < 6 ? 1 : 0.8);
        }
        sp.steps.set(g.id, t);
      }
      if ((g.state === 'alert' || g.state === 'search' || g.radioT > 0) && d < 18) {
        let r = (sp.radio.get(g.id) ?? 3 + Math.random() * 6) - dt;
        if (r <= 0) { r = 12 + Math.random() * 14; if (this.t - (sp.lastRadio || -99) > 6) { sp.lastRadio = this.t; A.radioAt({ x: g.x, y, z: g.z }, !heard(g, y)); } }
        sp.radio.set(g.id, r);
      }
    }
    this._voicesTick(dt, ear, off, heard);
    // Patrol-drone hum: the three nearest drones within earshot.
    const want = new Set();
    if (!off) {
      const ds = S.drones.filter((d) => d.state !== 'dead').map((d) => ({ d, r: Math.hypot(d.x - ear.x, d.y - ear.y, d.z - ear.z) })).filter((o) => o.r < 45).sort((a, b) => a.r - b.r).slice(0, 2);
      for (const { d } of ds) {
        const key = 'pd' + d.id;
        want.add(key);
        if (!sp.loops.has(key)) { A.startLoop(key, { x: d.x, y: d.y, z: d.z }, 'rotor', 0.1); sp.loops.add(key); }
        A.updateLoop(key, { x: d.x, y: d.y, z: d.z });
        A.loopGain(key, heard(d, d.y) ? 0.1 : 0.035);
      }
    }
    for (const key of [...sp.loops]) if (!want.has(key)) { A.stopLoop(key); sp.loops.delete(key); }
    // Your partner's footsteps.
    const Q = this.partner;
    if (!off && Q && Q.pos && !Q.avatarHidden && !Q.ai && !Q.seated) {
      const prev = sp.partnerPrev;
      const moved = prev ? Math.hypot(Q.pos.x - prev.x, Q.pos.z - prev.z) / Math.max(dt, 1e-3) : 0;
      sp.partnerPrev = { x: Q.pos.x, z: Q.pos.z };
      const d = Math.hypot(Q.pos.x - ear.x, Q.pos.z - ear.z);
      if (moved > 0.8 && d < 20) {
        sp.partnerT -= dt;
        if (sp.partnerT <= 0) { sp.partnerT = moved > 4 ? 0.33 : 0.5; A.stepAt({ x: Q.pos.x, y: Q.pos.y + 0.1, z: Q.pos.z }, false, false, 0.55); }
      }
    }
  },
};

// Enemy voices (Halo-style): calm guards near each other talk back and forth; a guard who
// spots you shouts; hits draw a grunt and deaths a cry; a charging brute snarls and its blade
// hums, louder the closer it gets. Foley.chatter keeps distant talk faint.
const CALM = new Set(['patrol', 'idle', 'post', 'guard', 'wander', 'return']);
Object.assign(Spatial, {
  _voicesTick(dt, ear, off, heard) {
    const F = this.foley, S = this.sentinel, sp = this._sp;
    if (!F || !F.ok) return;
    sp.vprev = sp.vprev || new Map(); sp.vhp = sp.vhp || new Map(); sp.pairT = sp.pairT || new Map(); sp.vbusy = sp.vbusy || new Map();
    const want = new Set();
    const at = (g) => ({ x: g.x, y: (g.y || 0) + 1.65 * (g.type === 'titan' || g.type === 'jugg' ? 1.25 : 1), z: g.z });
    const busy = (g) => (sp.vbusy.get(g.id) || 0) > this.t;
    const say = (g, mood, delay = 0) => {
      if (busy(g)) return 0;
      const d = Math.hypot(g.x - ear.x, (g.y || 0) - ear.y, g.z - ear.z);
      if (d > (mood === 'shout' ? 70 : 45)) return 0;
      const go = () => { const len = F.chatter(at(g), g.type, mood, !heard(g, (g.y || 0) + 1.5)); sp.vbusy.set(g.id, this.t + len + 0.2); };
      if (delay > 0) { sp.vbusy.set(g.id, this.t + delay + 1); setTimeout(go, delay * 1000); } else go();
      return 1;
    };
    const live = off ? [] : S.guards;
    for (const g of live) {
      const prev = sp.vprev.get(g.id), st = g.state;
      sp.vprev.set(g.id, st);
      if (prev === undefined) continue;
      if (st === 'dead') {
        if (prev !== 'dead' && Math.random() < 0.6) { const d = Math.hypot(g.x - ear.x, g.z - ear.z); if (d < 30) F.chatter(at(g), g.type, 'pain', !heard(g, (g.y || 0) + 1)); }
        continue;
      }
      // Spotted you: a shout (the alarm going up).
      if (st === 'alert' && prev !== 'alert' && prev !== 'berserk') say(g, 'shout', 0.1 + Math.random() * 0.2);
      // Hit but still standing: a grunt.
      const hp = typeof g.hp === 'number' ? g.hp : null, ph = sp.vhp.get(g.id);
      if (hp != null && ph != null && hp < ph - 0.01) { sp.vbusy.set(g.id, 0); say(g, 'pain'); }
      if (hp != null) sp.vhp.set(g.id, hp);
      // A charging brute: the snarl and, if it has one, the blade.
      const charging = st === 'berserk' || (g.sword && (st === 'alert' || st === 'berserk'));
      const d = Math.hypot(g.x - ear.x, (g.y || 0) - ear.y, g.z - ear.z);
      if (charging && d < 40) { want.add('growl' + g.id); F.loop('growl' + g.id, 'growl', at(g), 0.55); }
      if (g.sword && d < 25) { want.add('blade' + g.id); F.loop('blade' + g.id, 'blade', { x: g.x, y: (g.y || 0) + 1.1, z: g.z }, 0.22); }
    }
    for (const k of [...F.loops.keys()]) if (!want.has(k)) F.stopLoop(k);
    if (off) return;
    // Calm conversation: pairs standing or walking near each other, now and then.
    const calm = S.guards.filter((g) => CALM.has(g.state) && Math.hypot(g.x - ear.x, g.z - ear.z) < 45);
    for (let i = 0; i < calm.length; i++) for (let j = i + 1; j < calm.length; j++) {
      const A = calm[i], B = calm[j];
      if (Math.hypot(A.x - B.x, A.z - B.z) > 12 || Math.abs((A.y || 0) - (B.y || 0)) > 2) continue;
      const key = A.id < B.id ? A.id + ':' + B.id : B.id + ':' + A.id;
      let t = (sp.pairT.get(key) ?? 1 + Math.random() * 3) - dt;
      if (t <= 0 && !busy(A) && !busy(B)) {
        t = 8 + Math.random() * 10;
        const [x, y] = Math.random() < 0.5 ? [A, B] : [B, A];
        if (say(x, 'talk')) {
          const reply = (sp.vbusy.get(x.id) - this.t) + 0.25 + Math.random() * 0.5;
          if (Math.random() < 0.85) say(y, 'talk', reply);
        }
      }
      sp.pairT.set(key, t);
    }
    // A guard on his own talks into his radio now and then.
    for (const g of calm) {
      const key = 'r' + g.id;
      let t = (sp.pairT.get(key) ?? 6 + Math.random() * 14) - dt;
      if (t <= 0) { t = 14 + Math.random() * 16; say(g, 'talk'); }
      sp.pairT.set(key, t);
    }
    // Someone searching for you mutters now and then.
    for (const g of S.guards) {
      if (g.state !== 'search') continue;
      const key = 's' + g.id;
      let t = (sp.pairT.get(key) ?? 3 + Math.random() * 5) - dt;
      if (t <= 0) { t = 7 + Math.random() * 8; say(g, 'talk'); }
      sp.pairT.set(key, t);
    }
  },
});

export function installSpatial(Cls) {
  for (const k of Object.keys(Spatial)) Cls.prototype[k] = Spatial[k];
}

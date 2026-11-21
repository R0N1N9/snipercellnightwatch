// Sniper Cell: Infiltration — the spotter's CYBER OPS kit: bandwidth, payloads, cooldowns,
// upload delays, and the AI spotter that runs them when you play the shooter solo.
// Numbers follow Cold Archive's Overwatch console (bandwidth 0-100, regenerating at
// 2 + 1.5 × access per second; each payload has a cost, a cooldown and an upload delay).
import { clamp } from '../util.js';

export const PAYLOADS = [
  { k: 'scan', key: '1', name: 'PULSE SCAN', bw: 10, cd: 6, cast: 1.1, aim: false, desc: 'Reveal every contact on the network for 4 s.' },
  { k: 'jam', key: '2', name: 'JAM EARPIECES', bw: 20, cd: 10, cast: 1.0, aim: true, r: 25, desc: 'Guards near the point can’t radio or fire for 5 s.' },
  { k: 'emp', key: '3', name: 'EMP', bw: 30, cd: 12, cast: 0.9, aim: true, r: 18, desc: 'Drones and cameras near the point go dark for 7 s.' },
  { k: 'supply', key: '4', name: 'SUPPLY DROP', bw: 0, cd: 2, cast: 0, aim: true, desc: 'Crate by parachute: ammo for both weapons, +35 HP. Limited.' },
  { k: 'lights', key: '5', name: 'TAKE OUT THE LIGHTS', bw: 15, cd: 8, cast: 0.7, aim: true, desc: 'Kill the power to that zone for 12 s. Dark = harder to see you.' },
  { k: 'spoof', key: '6', name: 'SPOOF CAMS', bw: 25, cd: 14, cast: 1.7, aim: false, desc: 'Loop every camera for 10 s.' },
  { k: 'decoy', key: '7', name: 'DECOY PING', bw: 12, cd: 7, cast: 0.5, aim: true, r: 25, desc: 'A loud noise at the point. Guards go and look.' },
  { k: 'quad', key: '8', name: 'RECON DRONE', bw: 0, cd: 25, cast: 0, aim: false, desc: 'Fly the recon drone (Q). Anything it sees is marked; F tags.' },
  { k: 'medevac', key: '9', name: 'MEDEVAC DRONE', bw: 30, cd: 22, cast: 0, aim: false, desc: 'Flies to a downed or wounded agent and patches them up to full health.' },
];
// What SENTINEL's ICE knocks out with the console (physical kit still works).
const ICE_BLOCKED = new Set(['scan', 'jam', 'emp', 'lights', 'spoof', 'decoy']);
export const PAYLOAD = Object.fromEntries(PAYLOADS.map((p) => [p.k, p]));

// Click-to-hack actions on the console.
export const HACK = {
  door: (tier) => 6 + 4 * tier, doorCast: 1.0, doorOpen: 8,
  cam: 10, camCast: 1.4, camLoop: 9,
  crackRate: 0.33, crackBw: 6,
  fightRate: 0.12, fightBw: 4,
  tag: 12,
};

export class Ops {
  constructor(game) {
    this.game = game;
    this.bw = 100;
    this.cd = {};
    this.casts = []; // { k, t, dur, target, name }
    this.log = [];
    this.selected = null;
    this.fighting = false;
    this.cracking = false;
  }

  ready(k) {
    const p = PAYLOAD[k];
    return (this.cd[k] || 0) <= 0 && this.bw >= p.bw && !this.casts.some((c) => c.k === k);
  }

  // Start a payload (target {x,z} for aimed ones). Returns a reason string on failure.
  use(k, target) {
    const p = PAYLOAD[k], G = this.game;
    if (!p) return 'unknown';
    if (G.obj.ice && ICE_BLOCKED.has(k)) return 'CONSOLE OFFLINE (ICE) \u2014 QUICKHACK BY SIGHT (HOLD TAB)';
    if ((this.cd[k] || 0) > 0) return 'COOLING DOWN';
    if (this.bw < p.bw) return 'NOT ENOUGH BANDWIDTH';
    if (k === 'supply' && G.obj.drops <= 0) return 'NO DROPS LEFT';
    if (k === 'supply' && target && G.fac.insideBuilding(target.x, target.z)) return 'CAN\u2019T DROP THROUGH A ROOF';
    if (k === 'quad' && !G.canQuad()) return 'DRONE UNAVAILABLE';
    if (k === 'medevac') {
      const v = G.hurtAgent();
      if (!v) return 'EVERYONE IS AT FULL HEALTH';
      target = { role: v };
    }
    if (p.aim && !target) return 'PICK A SPOT';
    this.bw -= p.bw;
    this.cd[k] = p.cd;
    if (p.cast > 0) this.casts.push({ k, t: 0, dur: p.cast, target, name: p.name });
    else G.payload(k, target);
    return null;
  }

  hack(kind, id) {
    const G = this.game;
    if (G.obj.ice) return 'CONSOLE OFFLINE (ICE) \u2014 QUICKHACK BY SIGHT (HOLD TAB)';
    if (kind === 'door') {
      const d = G.fac.doors[id];
      if (!d) return 'NO DOOR';
      if (d.kind === 'mech') return 'MECHANICAL LOCK \u2014 THE SPOTTER HAS TO PICK IT';
      if (d.kind === 'vault') return 'VAULT — BADGE IN, THEN HOLD CRACK';
      if (d.sealed && !(d.kind === 'dock' && G.obj.drive)) return 'SEALED BY SENTINEL';
      if (d.tier > G.obj.access) return 'NO ACCESS — TAP THE NETWORK FIRST';
      const cost = HACK.door(d.tier);
      if (this.bw < cost) return 'NOT ENOUGH BANDWIDTH';
      this.bw -= cost;
      this.casts.push({ k: 'door', id, t: 0, dur: HACK.doorCast, name: 'DOOR HACK' });
      return null;
    }
    if (kind === 'iot') {
      if (G.obj.access < 2) return 'NO ACCESS \u2014 PLANT THE RELAY FIRST';
      if (this.bw < 8) return 'NOT ENOUGH BANDWIDTH';
      this.bw -= 8;
      this.casts.push({ k: 'iot', id, t: 0, dur: 0.8, name: 'IOT HACK' });
      return null;
    }
    if (kind === 'cam') {
      const c = G.sentinel.cams.find((q) => q.id === id);
      if (!c) return 'NO CAMERA';
      if (c.tier > G.obj.access) return 'NO ACCESS — TAP THE NETWORK FIRST';
      if (this.bw < HACK.cam) return 'NOT ENOUGH BANDWIDTH';
      this.bw -= HACK.cam;
      this.casts.push({ k: 'cam', id, t: 0, dur: HACK.camCast, name: 'CAMERA HACK' });
      return null;
    }
    return 'unknown';
  }

  update(dt) {
    const G = this.game;
    this.bw = clamp(this.bw + (2 + 1.5 * G.obj.access) * (this.bwMul || 1) * dt, 0, 100);
    for (const k in this.cd) this.cd[k] = Math.max(0, this.cd[k] - dt);
    for (const c of this.casts) {
      c.t += dt;
      if (c.t >= c.dur) {
        if (c.k === 'door') G.payload('door', { id: c.id });
        else if (c.k === 'cam') G.payload('cam', { id: c.id });
        else if (c.k === 'iot') G.payload('iot', { id: c.id });
        else G.payload(c.k, c.target);
      }
    }
    this.casts = this.casts.filter((c) => c.t < c.dur);
    // Held actions: crack the vault, fight SENTINEL's trace. They drain bandwidth while held.
    if (this.cracking && G.obj.canCrack && !G.obj.vault) {
      if (this.bw > HACK.crackBw * dt) { this.bw -= HACK.crackBw * dt; G.payload('crack', { dt }); }
    }
    if (this.fighting && G.obj.uploading) {
      if (this.bw > HACK.fightBw * dt) { this.bw -= HACK.fightBw * dt; G.payload('fight', { dt }); }
    }
  }
}

// The AI spotter (Rōnin) for a solo shooter. Runs on the host and spends the same bandwidth.
export class AiSpotter {
  constructor(game, ops) {
    this.game = game;
    this.ops = ops;
    this.t = 0;
    this.scanT = 12;
    this.tagT = 4;
    this.say = (m) => game.comms(m, 'cyan', game.partnerName);
  }

  update(dt) {
    const G = this.game, O = this.ops, ob = G.obj, S = G.sentinel;
    this.t -= dt;
    O.cracking = ob.canCrack && !ob.vault;
    O.fighting = ob.uploading && ob.trace > 0.25;
    if (this.t > 0) return;
    this.t = 0.8;
    const me = G.localAgent();
    if (!me) return;
    const p = me.pos;
    // Medevac first.
    if (me.downed && O.ready('medevac')) { O.use('medevac'); this.say('Hang on — medevac drone inbound.'); return; }
    // Ammo / health.
    const P = G.player;
    const low = P.arms.reduce((s, w) => s + w.mag + w.reserve, 0) < 14 || G.hp < 45;
    if (low && ob.drops > 0 && O.ready('supply') && !G.fac.insideBuilding(p.x, p.z) && !G.crates.some((c) => Math.hypot(c.x - p.x, c.z - p.z) < 20)) { O.use('supply', { x: p.x + 2, z: p.z + 1 }); this.say('Supply drop on your position.'); return; }
    // Drones closing in: EMP.
    const hot = S.drones.find((d) => d.state !== 'dead' && d.aw > 0.5 && Math.hypot(d.x - p.x, d.z - p.z) < 26 && !(d.empT > 0));
    if (hot && O.ready('emp')) { O.use('emp', { x: hot.x, z: hot.z }); this.say('EMP on that drone.'); return; }
    // A guard about to radio it in: jam.
    const caller = S.guards.find((g) => g.state === 'alert' && g.radioT > 0 && Math.hypot(g.x - p.x, g.z - p.z) < 40);
    if (caller && O.ready('jam')) { O.use('jam', { x: caller.x, z: caller.z }); this.say('Jamming his radio — drop him.'); return; }
    // Electronic door next to the agent.
    for (const d of Object.values(G.fac.doors)) {
      if (d.kind !== 'elec' && !(d.kind === 'dock' && ob.drive)) continue;
      if (d.open || d.unlocked || d.tier > ob.access || (d.sealed && d.kind !== 'dock')) continue;
      if (Math.hypot(d.x - p.x, d.z - p.z) < 6 && !O.casts.some((c) => c.k === 'door') && O.bw > 20) { O.hack('door', d.id); this.say(d.kind === 'dock' ? 'Opening the dock. Go, go!' : 'Got the door.'); return; }
    }
    // Cameras the agent is walking into.
    for (const c of S.cams) {
      if (c.hacked || c.tier > ob.access || O.bw < 30) continue;
      if (Math.hypot(c.x - p.x, c.z - p.z) < 34 && !O.casts.some((q) => q.k === 'cam')) { O.hack('cam', c.id); this.say('Looping the camera ahead of you.'); return; }
    }
    // Tag contacts near the agent now and then; scan when bandwidth is plentiful.
    this.tagT -= 0.8;
    if (this.tagT <= 0) {
      this.tagT = 7;
      const near = S.guards.filter((g) => g.state !== 'dead' && g.tagT <= 0 && Math.hypot(g.x - p.x, g.z - p.z) < 70 && S.revealed(g, ob.access, G.extraReveal)).sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z)).slice(0, 2);
      for (const g of near) G.payload('tag', { id: g.id });
      if (near.length) this.say(near.length === 2 ? 'Tagged two contacts near you.' : near[0].chief ? 'Site Chief tagged.' : 'Tagged a contact.');
    }
    this.scanT -= 0.8;
    if (this.scanT <= 0 && O.bw > 60 && O.ready('scan')) { this.scanT = 22; O.use('scan'); this.say('Pulse scan.'); }
  }
}

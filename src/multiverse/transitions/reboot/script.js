// KERNEL PANIC — what the machine prints. Every random choice is drawn once (choose); the
// lines are compiled for the current grid (build), and rebuilt from the same choices if the
// window changes size, so a resize never changes the film's words.
import { pick, shuffle, randInt, chance } from '../../kit.js';
import { C, F, compileLine } from './screen.js';
import { DIMENSIONS } from '../../registry.js';

const hex = (n, w) => (n >>> 0).toString(16).padStart(w, '0').slice(-w);
const ident = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 14) || 'anon';
const up = (s) => String(s || '').toUpperCase();

/** Every random decision of the script, drawn once from ctx.rng. */
export function chooseScript(rng, ctx) {
  const W = ctx.winner, L = ctx.loser;
  const how = up(ctx.how).trim();
  const num = (how.match(/\d+/) || [''])[0];
  const unit = /COL/.test(how) ? 'cols' : /\d\s*M\b/.test(how) ? 'm' : ctx.from && ctx.from.id === 'terminal' ? 'cols' : 'm';
  const kind = /RICOCHET|BOUNCE/.test(how) ? 'ricochet' : /POINT\s*BLANK/.test(how) ? 'blank' : /SCOPE/.test(how) ? 'scoped'
    : /LONG/.test(how) ? 'long' : /HEAD/.test(how) ? 'head' : 'plain';
  const winPool = ['hold_breath', 'lead_the_target', 'wait_in_the_dark', 'check_corners', 'steady_aim', 'count_to_three', 'ignore_footsteps', 'stay_very_still', 'not_blink'];
  const special = { ricochet: 'read_the_wall', scoped: 'hold_breath', blank: 'walk_right_up', long: 'adjust_for_range', head: 'aim_a_bit_higher', plain: null }[kind];
  const winFrames = shuffle(rng, winPool.filter((f) => f !== special)).slice(0, special ? 1 : 2);
  if (special) winFrames.splice(randInt(rng, 0, 1), 0, special);
  const losePool = ['peek_corner', 'stand_in_the_open', 'reload_at_a_bad_time', 'walk_the_long_lane', 'trust_the_decoy', 'hum_loudly', 'check_the_score', 'cross_the_doorway', 'run_in_a_line'];
  const loseFrames = shuffle(rng, losePool).slice(0, randInt(rng, 1, 2));
  const crash = pick(rng, [['dodge', 'not implemented'], ['handle_bullet', 'unhandled'], ['dereference_bullet', '<-- HERE'], ['respawn', 'not found']]);
  const segN = randInt(rng, 0, 3);
  const panicN = randInt(rng, 0, 3);
  const tauntN = randInt(rng, 0, 6);
  const bootN = randInt(rng, 0, 2);
  const fw = pick(rng, ['SKLOUNST ROM', 'PHOSPHOR/FW', 'CELL MONITOR', 'DRAXX FIRMWARE']);
  const jokes = shuffle(rng, [0, 1, 2, 3, 4, 5]).slice(0, chance(rng, 0.5) ? 2 : 1);
  const mem = pick(rng, [640, 4096, 65536, 524288]);
  const others = shuffle(rng, DIMENSIONS.filter((d) => !d.dev && !d.wip && d.id !== ctx.from.id && d.id !== ctx.to.id).map((d) => d.id));
  const nOthers = randInt(rng, 3, 4);
  const toAt = randInt(rng, 2, nOthers); // the next world's place in the menu (the old one is always first)
  const status = others.map(() => pick(rng, ['ok', 'ok', 'ok', 'dirty', 'untested', 'mounted']));
  return {
    how, num, unit, kind, winFrames, loseFrames, crash, segN, panicN, tauntN, bootN, fw, jokes, mem, others, nOthers, toAt, status,
    overshoot: chance(rng, 0.5) && toAt < nOthers,
    pid: randInt(rng, 4100, 4999), base: 0x7ffe0000 + randInt(rng, 0x1000, 0xefff) * 16, dumpAt: randInt(rng, 0x10000, 0x3ffff) * 16,
    offs: Array.from({ length: 10 }, () => [randInt(rng, 1, 0x7f), randInt(rng, 0x40, 0xff)]),
    uptime: randInt(rng, 9, 58), ver: [randInt(rng, 1, 9), randInt(rng, 0, 9)],
    W: W ? W.name : '', L: L ? L.name : '', draw: !W || !L,
  };
}

/** Compile the lines for a grid of `cols` columns. Returns the scenes the film plays. */
export function buildScript(ch, ctx, G, cols, amber) {
  const line = (spans, opt) => compileLine(G, spans, opt);
  const W = ch.W, L = ch.L, w = ident(W), l = ident(L);
  const wc = C.WIN, lc = C.LOSE;
  const s = ctx.score || [0, 0];
  const how = ch.how || (ch.draw ? 'DRAW' : 'ONE SHOT');

  // ---- Act 1: the fault and the panic ----------------------------------------------------
  const seg = ch.draw
    ? [['Segmentation fault: ', C.HI], ['nobody', C.WARN], [' (both processes waited forever)', C.HI]]
    : [
      [['Segmentation fault: ', C.HI], [L, lc], [' shared a cell with a bullet', C.HI]],
      [['Segmentation fault: ', C.HI], [L, lc], [' dereferenced a bullet', C.HI]],
      [['Segmentation fault: ', C.HI], [L, lc], [' wrote to memory owned by ', C.HI], [W, wc]],
      [['Segmentation fault: ', C.HI], [L, lc], [' read past the end of their cover', C.HI]],
    ][ch.segN];
  const segLine = line([[`[${String(ch.uptime).padStart(4, ' ')}.${hex(ch.pid, 3)}] `, C.LO], ...seg]);
  const coreLine = line([[' '.repeat(12) + '(core dumped)', C.WARN]]);
  const headTxt = [' KERNEL PANIC ─ not syncing: sniper process killed ', ` KERNEL PANIC ─ fatal exception in round ${ctx.round || 1} `,
    ' KERNEL PANIC ─ not syncing: one shot, one kill ', ' KERNEL PANIC ─ attempted to kill a sniper '][ch.panicN];
  const panic = [];
  const P = (spans, opt, gap = 0.075) => { panic.push({ L: line(spans, opt), gap }); };
  P([[headTxt, C.WARN, 1, F.INV]], { fill: 1, fillCol: C.WARN }, 0);
  P([[' ', C.MID]], {}, 0.02);
  P([[` cpu0 · pid ${ch.pid} · tty0 · round ${ctx.round || 1} · uptime 00:${String(ch.uptime).padStart(2, '0')}`, C.LO]], {}, 0.09);
  if (ch.draw) P([[' cause: ', C.MID], ['round timed out, nobody fired', C.WARN]], {}, 0.08);
  else P([[' cause: ', C.MID], [W, wc], [' -> ', C.MID], [L, lc], ['  ·  ', C.LO], [how, C.HI]], {}, 0.08);
  P([[' ', C.MID]], {}, 0.02);
  P([[' backtrace (oldest first):', C.MID]], {}, 0.1);
  let k = 0;
  const frame = (name, col, tail, tailCol) => {
    const o = ch.offs[k % ch.offs.length];
    const addr = hex(ch.base + k * 0x6b + o[0], 8);
    k++;
    P([['   <', C.LO, 0.8], [addr, C.LO, 0.8], ['> ', C.LO, 0.8], [name, col], [`+0x${hex(o[0], 2)}/0x${hex(o[1], 2)}`, C.LO, 0.8], ...(tail ? [[tail, tailCol]] : [])], {}, 0.075);
  };
  if (ch.draw) {
    for (const f of ['duel_wait', 'both_hide', 'clock_expire']) frame(f, C.MID);
    frame('watchdog_bite', C.WARN, '  <-- HERE', C.ERR);
  } else {
    for (const f of ch.winFrames) frame(`${w}_${f}`, wc);
    const n = ch.num, u = ch.unit;
    const fire = { ricochet: `rifle_bounce_once${n ? `_${n}_${u}` : ''}`, blank: 'rifle_point_blank', scoped: `rifle_scoped${n ? `_${n}_${u}` : ''}`,
      long: `rifle_long_shot${n ? `_${n}_${u}` : ''}`, head: 'rifle_headshot', plain: n ? `rifle_fire_${n}_${u}` : `rifle_${ident(how)}` }[ch.kind];
    frame(fire, C.HI, '  ◀ fired', C.HI);
    for (const f of ch.loseFrames) frame(`${l}_${f}`, lc);
    frame(`${l}_${ch.crash[0]}`, lc, `  ${ch.crash[1]}`, C.ERR);
  }
  P([[' ', C.MID]], {}, 0.02);
  // the hex dump whose ASCII column is the taunt
  const t = ch.draw
    ? ['NOBODY WON. EVERYBODY CRASHED.', 'DEADLOCK: TWO SNIPERS, ZERO SHOTS.'][ch.tauntN & 1]
    : up([
      `GG, ${L}. ${W} WAS ALREADY THERE.`, `${L} HAS LEFT THE TERMINAL.`, `NOTHING PERSONAL, ${L}. JUST BITS.`,
      `${L}: PRESS ANY KEY TO RESPAWN.`, `SCORE ${s[0]}-${s[1]}. ${W} SENDS REGARDS.`,
      ctx.matchPoint ? `${W} IS ONE SHOT FROM ROOT.` : `HAVE YOU TRIED NOT BEING THERE, ${L}?`,
      `${W} WAS HERE. ${L} WAS ALSO HERE, BRIEFLY.`,
    ][ch.tauntN]);
  const per = cols >= 80 ? 16 : 8;
  P([[` core dump @ 0x${hex(ch.dumpAt, 8)}:`, C.MID]], {}, 0.1);
  const bytes = [...t].map((c) => c.charCodeAt(0) & 255);
  const nl = Math.ceil(bytes.length / per);
  for (let i = 0; i < nl; i++) {
    let hx = '', asc = '';
    for (let j = 0; j < per; j++) {
      const b = bytes[i * per + j];
      hx += (b === undefined ? '00' : hex(b, 2)) + (j === per / 2 - 1 ? '  ' : ' ');
      asc += b === undefined ? '.' : String.fromCharCode(b);
    }
    P([[`   ${hex(i * per, 4)}  `, C.LO, 0.8], [hx, C.MID, 0.7], [' |', C.LO], [asc, ch.draw ? C.WARN : wc], ['|', C.LO]], {}, 0.07);
  }
  P([[' ', C.MID]], {}, 0.02);
  const bootWord = ['rebooting in ', 'auto-reboot in ', 'restarting the multiverse in '][ch.bootN];
  const endTxt = ` ---[ end panic ─ ${bootWord}3 ]---`;
  P([[endTxt, C.WARN]], {}, 0.1);
  const countLine = panic[panic.length - 1].L, countAt = endTxt.indexOf(bootWord) + bootWord.length;

  // ---- Act 2: power-on self test ------------------------------------------------------------
  const post = [];
  const Q = (spans, opt, gap = 0.09) => { post.push({ L: line(spans, opt), gap }); };
  const dots = (label, n = 21) => ` ${label} ${'.'.repeat(Math.max(2, n - label.length))} `;
  Q([[` ${ch.fw}`, C.HI]], { scale: 2 }, 0);
  Q([[` v${ch.ver[0]}.${ch.ver[1]}.${ctx.round || 1}  ·  ${amber ? 'amber' : 'green'} phosphor  ·  (c) nobody, ever`, C.LO]], {}, 0.12);
  Q([[' ', C.MID]], {}, 0.02);
  Q([[` cold boot #${(ctx.round || 1) + 1}  ·  last shutdown: `, C.MID], ...(ch.draw ? [['deadlock', C.WARN]] : [[L, lc], [' (core dumped)', C.WARN]])], {}, 0.12);
  const memW = String(ch.mem).length;
  Q([[dots('memory test'), C.MID], ['0'.padStart(memW, '0'), C.HI], [' K', C.MID], ['  OK', C.HI]], {}, 0.1);
  const memLine = post[post.length - 1].L, memAt = dots('memory test').length;
  Q([[dots('phosphor'), C.MID], [amber ? 'amber, 1 gun' : 'green, 1 gun', C.MID], ['  OK', C.HI]], {}, 0.5);
  Q([[' detecting devices:', C.MID]], {}, 0.12);
  Q([[dots('  rifle0'), C.MID], ['bolt action, 1 round', C.MID], ['  ok', C.HI]], {}, 0.12);
  const pl = [0, 1].map((i) => (ctx.winner && ctx.winner.index === i ? ctx.winner : ctx.loser && ctx.loser.index === i ? ctx.loser : null));
  for (let i = 0; i < 2; i++) {
    const p = pl[i], name = p ? p.name : `sniper ${i}`, lost = p && ctx.loser && p.index === ctx.loser.index;
    Q([[dots(`  sniper${i}`), C.MID], [name.padEnd(17, ' '), i ? C.P1 : C.P0], [lost ? 'restored from core' : 'ok', lost ? C.WARN : C.HI]], {}, 0.12);
  }
  const foundIdx = post.length;
  Q([['   2 snipers found.', C.WHITE]], {}, 0.12);
  const sc = pl[0] && pl[1] ? [[`${pl[0].name} `, C.P0], [`${s[0]} - ${s[1]}`, C.WHITE], [` ${pl[1].name}`, C.P1]] : [[`${s[0]} - ${s[1]}`, C.WHITE]];
  Q([[dots('  score.cmos'), C.MID], ...sc, ...(ctx.matchPoint ? [['  MATCH POINT', C.ERR, 1, F.BLINK]] : [])], {}, 0.14);
  const joke = [
    [[dots('fog of war'), C.MID], ['cached', C.MID]],
    [[dots('grudge.sys'), C.MID], [ch.draw ? 'loaded (mutual)' : `loaded (${L} vs ${W})`, C.MID]],
    [[dots('ammo'), C.MID], ['1 round. it only ever needs one', C.MID]],
    [[dots('clock'), C.MID], ['00:00 (it is always 00:00)', C.MID]],
    [[dots('cooling fan'), C.MID], ['spinning (barely)', C.MID]],
    [[dots('keyboard'), C.MID], ['sticky (W key worn down)', C.MID]],
  ];
  for (const j of ch.jokes) Q(joke[j], {}, 0.11);
  Q([[dots('dimensions'), C.MID], [`${ch.nOthers + 8} found, 1 corrupted`, C.MID]], {}, 0.11);

  // ---- the boot menu ---------------------------------------------------------------------
  const bw = Math.max(36, Math.min(cols - 4, 58));
  const title = ' BOOT ─ select a dimension ';
  const top = line([['╔══', C.MID], [title, C.HI], ['═'.repeat(Math.max(0, bw - 4 - title.length)), C.MID], ['╗', C.MID]]);
  const bottom = line([['╚' + '═'.repeat(bw - 2) + '╝', C.MID]]);
  const entries = [];
  const entry = (label, stat, statCol, labCol) => {
    const inner = bw - 4;
    const room = Math.max(2, inner - label.length - stat.length - 2);
    const mkErr = () => line([['║ ', C.MID], [` ${label} `, C.ERR, 1, F.INV], ['.'.repeat(room - 2), C.ERR, 1, F.INV], [` ${stat} `, C.ERR, 1, F.INV | F.BLINK], [' ║', C.MID]]);
    const mk = (hi) => {
      const fl = hi ? F.INV : 0, base = hi ? C.TOA : labCol;
      return line([['║ ', C.MID], [` ${label} `, base, 1, fl], ['.'.repeat(room - 2), hi ? C.TOA : C.LO, hi ? 1 : 0.7, fl], [` ${stat} `, hi ? C.TOA : statCol, 1, fl], [' ║', C.MID]]);
    };
    entries.push({ lo: mk(false), hi: mk(true), err: mkErr() });
  };
  entry(up(ctx.from.name), 'core dumped', C.WARN, C.LO);
  const shown = ch.others.slice(0, ch.nOthers);
  for (let i = 0; i < shown.length; i++) {
    if (i === ch.toAt - 1) entry(up(ctx.to.name), String(ctx.to.perspective || 'ready').toLowerCase(), C.TOA, C.TOA);
    entry(`${shown[i]}.dim`, ch.status[i], C.LO, C.MID);
  }
  if (ch.toAt - 1 >= shown.length) entry(up(ctx.to.name), String(ctx.to.perspective || 'ready').toLowerCase(), C.TOA, C.TOA);
  const toIndex = Math.min(ch.toAt, entries.length - 1);
  const hint = line([['   ↑↓ select   ⏎ boot   ', C.LO], ['auto-select', C.LO]]);
  const blank = line([['║' + ' '.repeat(bw - 2) + '║', C.MID]]);

  // ---- the loader --------------------------------------------------------------------------
  const name = up(ctx.to.name);
  const bootLine = line([[' > boot ', C.MID], [`${ctx.to.id}.dim`, C.HI], [' ... ', C.MID], ['  0%', C.HI]]);
  const pctAt = bootLine.n - 4;
  const scale = Math.max(1, Math.min(3, Math.floor((cols - 2) / Math.max(1, name.length))));
  const titleLine = line([[name, C.TOA]], { scale, center: true });
  const sub = [String(ctx.to.perspective || '').toLowerCase(), ctx.to.tagline || ''].filter(Boolean).join('  ·  ');
  const subTxt = sub.length > cols - 4 ? sub.slice(0, cols - 5) + '…' : sub;
  const subLine = line([[subTxt || ' ', C.TOF]], { center: true });

  return {
    segLine, coreLine, panic, countLine, countAt,
    post, memLine, memAt, memW, foundIdx,
    menu: { top, bottom, entries, toIndex, hint, blank, bw },
    load: { bootLine, pctAt, titleLine, subLine, scale },
  };
}

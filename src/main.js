import { Net } from './net.js';
import { Audio } from './audio.js';
import { randomCode } from './util.js';
import { PALETTES } from './atmosphere.js';
import { drawMap } from './briefmap.js';
import { showPreview } from './preview.js';
import { renderLoadout } from './loadout.js';
import { PRESETS, RULES, LOOKS, applyRules, normalizeRules, rulesLabel } from './rules.js';
import { RANGES } from './range.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const LOCAL = params.has('local'); // two tabs on one machine (testing)
// Opened as a standalone file (file://): invite links can't point anywhere, so share the code instead.
const FILE_MODE = location.protocol === 'file:';
// Dev / test switches for the Multiverse (documented in src/multiverse/contract.js, section 8).
const num = (k) => (params.has(k) && isFinite(+params.get(k)) ? +params.get(k) : undefined);
const DEV = {
  dim: params.get('dim') || null,
  auto: params.get('auto') === '1',
  speed: num('speed') || 1,
  skill: num('skill'),
  seed: num('seed'),
  target: num('target'),
  next: (params.get('next') || '').split(',').filter(Boolean),
  fx: params.get('fx') || null,
  fxlab: params.get('fxlab') || null,
  from: params.get('from') || null,
  to: params.get('to') || null,
  fixres: params.get('fixres') === '1',
  autohost: params.get('autohost') || null,
  autojoin: params.get('autojoin') || null,
};

const store = {
  get(k, d) {
    try {
      const v = localStorage.getItem('draxxed.' + k);
      return v === null ? d : JSON.parse(v);
    } catch { return d; }
  },
  set(k, v) {
    try { localStorage.setItem('draxxed.' + k, JSON.stringify(v)); } catch {}
  },
};

function detectQuality() {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    if (!gl) return 'low';
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const r = (ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)) + '';
    const ua = navigator.userAgent;
    // iPads report themselves as Macs: tell them apart by touch, and give them the medium preset.
    if ((/iPad|iPhone/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1))) return 'medium';
    if (/Apple M\d|Apple GPU|Apple/i.test(r) || /Macintosh/.test(ua)) return 'high';
    if (/HD Graphics (2|3|4|5)\d{3}|HD Graphics$|Mesa Intel\(R\) HD|Ivybridge|Sandybridge|Haswell|llvmpipe|SwiftShader/i.test(r)) return 'low';
    if (/Mali|Adreno|PowerVR|Immortalis|Xclipse/i.test(r) || /Android/.test(ua)) return 'medium';
    if (/NVIDIA|GeForce|Radeon|RTX|Iris Xe|Arc/i.test(r)) return 'high';
    return 'medium';
  } catch {
    return 'medium';
  }
}

const settings = {
  name: store.get('name', ''),
  pal: store.get('pal', 'dusk'),
  quality: store.get('quality', 'auto'),
  sensitivity: store.get('sens', 1),
  invertY: store.get('invert', false),
  scopeToggle: store.get('toggle', 'ontouchstart' in window),
  // The Pollo Hermano skin is never remembered between visits: every fresh load starts on the
  // standard poncho, the classic title and the default operator.
  loadout: (() => { const lo = store.get('loadout', null); if (lo && lo.skin === 'pollo') { lo.skin = 'std'; store.set('loadout', lo); } return lo; })(),
  touchSensR: store.get('touchSensR', 1),
  touchSensL: store.get('touchSensL', 1),
  gyroMode: store.get('gyroMode', 'ontouchstart' in window ? 'scoped' : 'off'),
  gyroSens: store.get('gyroSens', 1),
  gyroInvertY: store.get('gyroInvertY', false),
  mode: store.get('mode', 'classic'), // 'classic' | 'app' ("Do you want to develop an app?")
  mvTarget: store.get('mvTarget', 7),
  autoBipod: store.get('autoBipod', true),
  autoCycle: store.get('autoCycle', true),
};

// Generic binding for [data-setting] controls (menu + pause menu share keys).
const LIVE_KEYS = ['touchSensR', 'touchSensL', 'gyroMode', 'gyroSens', 'gyroInvertY'];
function applyInputSettings() {
  if (!game) return;
  for (const k of LIVE_KEYS) game.input[k] = settings[k];
  if (game.player) {
    game.player.autoBipod = settings.autoBipod;
    game.player.autoCycle = settings.autoCycle;
  }
  if (settings.gyroMode !== 'off') game.input.requestGyro();
}
function syncSettingUI() {
  document.querySelectorAll('[data-setting]').forEach((el) => {
    const v = settings[el.dataset.setting];
    if (el.type === 'checkbox') el.checked = !!v;
    else el.value = v;
  });
  document.querySelectorAll('[data-v]').forEach((el) => {
    const v = settings[el.dataset.v];
    if (typeof v === 'number') el.textContent = v.toFixed(2);
  });
}
document.querySelectorAll('[data-setting]').forEach((el) => {
  const on = () => {
    const k = el.dataset.setting;
    settings[k] = el.type === 'checkbox' ? el.checked : el.type === 'range' || k === 'mvTarget' ? +el.value : el.value;
    store.set(k, settings[k]);
    if (k === 'gyroMode') primeGyro();
    syncSettingUI();
    applyInputSettings();
  };
  el.addEventListener('input', on);
  el.addEventListener('change', on);
});
syncSettingUI();

// iOS only grants motion access from a user gesture; call this from click/tap handlers.
function primeGyro() {
  const DM = window.DeviceMotionEvent;
  if (settings.gyroMode !== 'off' && DM && typeof DM.requestPermission === 'function') DM.requestPermission().catch(() => {});
}
settings.saveLoadout = (lo) => { settings.loadout = lo; store.set('loadout', lo && lo.skin === 'pollo' ? { ...lo, skin: 'std' } : lo); updateTitle(); };

// Easter egg: with the Pollo Hermano skin selected, the main menu takes the game's old name, Draxxed Sklounst.
// (Main menu only, and only for your own Pollo Hermano skin.)
function polloOn() {
  const lo = settings.loadout || {};
  return (lo.stealth || 'poncho') === 'poncho' && lo.skin === 'pollo';
}
function updateTitle() {
  const on = polloOn();
  // The game is Sniper Cell; in the Pollo Hermano suit the menu wears its old name.
  $('title').innerHTML = on ? 'DRAXXED<br />SKLOUNST' : 'SNIPER<br />CELL';
  $('tagline').textContent = on ? 'One pollo. Two hermanos. Eight hundred sauce packets.' : 'One valley. Two rifles. Eight hundred metres.';
  document.title = on ? 'Draxxed Sklounst' : 'Sniper Cell';
  document.body.classList.toggle('reckoning', on);
  $('in-name').placeholder = on ? 'Pollo' : 'Ghost';
}

// Halo at close range is the default. Settings saved before that carry over once: an old
// "auto" distance becomes long, and the old default pair (Battlefield at long range) becomes
// the new one — anything else was a deliberate choice and is left alone.
{
  const fresh = store.get('rules', null) === null;
  const saved = store.get('rules', { preset: 'halo', range: 'close' });
  if (!store.get('rangeV2', false)) { if (saved.range === 'auto' || !saved.range) saved.range = 'long'; store.set('rangeV2', true); store.set('rules', saved); }
  if (!store.get('rulesV3', false)) {
    if (!fresh && saved.preset === 'bf' && saved.range === 'long') { saved.preset = 'halo'; saved.range = 'close'; store.set('rules', saved); }
    store.set('rulesV3', true);
  }
  settings.rules = normalizeRules(saved);
}
applyRules(settings.rules);

// ---- Sniping style ----
function saveRules(r) {
  settings.rules = normalizeRules(r);
  store.set('rules', settings.rules);
  applyRules(settings.rules);
  renderStyle();
}
function renderStyle() {
  const r = settings.rules;
  $('style-cur').textContent = rulesLabel(r);
  // Shooting style bar.
  const SUB = { sim: 'realistic', bf: 'ballistic', cod: 'arcade', halo: 'hitscan' };
  const styleBtns = Object.entries(PRESETS).map(([k, p]) => `<button class="${r.preset === k ? 'on' : ''}" data-preset="${k}" title="Like ${p.feel}"><b>${p.short}</b><i>${SUB[k] || ''}</i></button>`);
  styleBtns.push(`<button class="${r.preset === 'custom' ? 'on' : ''}" data-preset="custom"><b>CUSTOM</b><i>your mix</i></button>`);
  $('style-presets').innerHTML = styleBtns.join('');
  $('style-desc').textContent = PRESETS[r.preset] ? `Like ${PRESETS[r.preset].feel}. ${PRESETS[r.preset].desc}` : 'Set drop, bullet speed, wind, drag, sway and hitbox size yourself.';
  $('style-custom').style.display = r.preset === 'custom' ? '' : 'none';
  document.querySelectorAll('[data-sr]').forEach((el) => { el.value = String(r[el.dataset.sr]); });
  document.querySelectorAll('[data-sv]').forEach((el) => { el.textContent = `${Math.round(r[el.dataset.sv] * 100)}%`; });
  $('style-autozero').checked = !!r.autoZero;
  const def = (PRESETS[r.preset] && PRESETS[r.preset].range) || 'long';
  const cur = RANGES[r.range] ? r.range : def;
  if ($('brief-range')) $('brief-range').textContent = RANGES[cur].dist.toUpperCase();
  if ($('brief-range-l')) $('brief-range-l').textContent = `${RANGES[cur].name.toLowerCase()} range`;
  // Shooting distance bar: each range labelled with the game it plays like.
  const sel = RANGES[r.range] ? r.range : 'auto';
  const GAME = { close: 'Halo', medium: 'Call of Duty', long: 'Battlefield', extreme: 'ARMA / Sniper Elite' };
  // Same order as the styles above, so each distance sits under the style it suits (AUTO under CUSTOM).
  $('style-range').innerHTML = [...['close', 'medium', 'long', 'extreme'].map((k) => `<button class="${sel === k ? 'on' : ''}" data-range="${k}"><b>${RANGES[k].name.toUpperCase()}</b><i>${RANGES[k].dist}</i></button>`),
    `<button class="${sel === 'auto' ? 'on' : ''}" data-range="auto"><b>AUTO</b><i>${RANGES[def].name}</i></button>`].join('');
  // Graphics look bar.
  $('style-look').innerHTML = Object.entries(LOOKS).map(([k, l]) => `<button class="${r.look === k ? 'on' : ''}" data-look="${k}"><b>${l.name.toUpperCase()}</b><i>${l.sub}</i></button>`).join('');
  $('look-desc').textContent = LOOKS[r.look].desc;
  if ($('in-look')) $('in-look').value = r.look;
  $('range-desc').textContent = sel === 'auto' ? `Follows the style: ${RANGES[def].name} (${RANGES[def].dist}, like ${GAME[def]}). ${RANGES[def].desc}` : `Like ${GAME[sel]} (${RANGES[sel].dist}). ${RANGES[sel].desc}`;
}
$('style-presets').onclick = (e) => {
  const b = e.target.closest('[data-preset]');
  if (!b) return;
  const k = b.dataset.preset;
  saveRules(k === 'custom' ? { ...settings.rules, preset: 'custom', zooms: null } : { preset: k, autoZero: settings.rules.autoZero, range: settings.rules.range, look: settings.rules.look });
};
$('style-range').onclick = (e) => {
  const b = e.target.closest('[data-range]');
  if (b) saveRules({ ...settings.rules, range: b.dataset.range });
};
$('style-look').onclick = (e) => {
  const b = e.target.closest('[data-look]');
  if (b) saveRules({ ...settings.rules, look: b.dataset.look });
};
document.querySelectorAll('[data-sr]').forEach((el) => el.addEventListener('input', () => {
  saveRules({ ...settings.rules, preset: 'custom', [el.dataset.sr]: +el.value });
}));
$('style-autozero').onchange = (e) => saveRules({ ...settings.rules, autoZero: e.target.checked });
$('btn-style').onclick = () => { renderStyle(); showPanel('panel-style'); };
renderStyle();

// ---- Menu wiring ----
updateTitle();
$('in-name').value = settings.name;
$('in-pal').value = settings.pal;
$('in-quality').value = settings.quality;
$('in-sens').value = settings.sensitivity;
$('sens-val').textContent = (+settings.sensitivity).toFixed(2);
$('in-invert').checked = settings.invertY;
$('in-toggle').checked = settings.scopeToggle;
$('in-name').oninput = (e) => store.set('name', (settings.name = e.target.value.trim()));
$('in-pal').onchange = (e) => store.set('pal', (settings.pal = e.target.value));
$('in-quality').onchange = (e) => store.set('quality', (settings.quality = e.target.value));
// Graphics style (Inked / OG): one setting, also on the Sniping style panel and the NightWatch panel.
$('in-look').value = settings.rules.look;
$('in-look').onchange = (e) => saveRules({ ...settings.rules, look: e.target.value });
$('in-sens').oninput = (e) => {
  settings.sensitivity = +e.target.value;
  $('sens-val').textContent = settings.sensitivity.toFixed(2);
  store.set('sens', settings.sensitivity);
};
$('in-invert').onchange = (e) => store.set('invert', (settings.invertY = e.target.checked));
$('in-toggle').onchange = (e) => store.set('toggle', (settings.scopeToggle = e.target.checked));

// NightWatch screens (and loading into it) say INFILTRATION and carry the op's own line;
// everything else is the TACTICAL DUEL.
let loadingCell = false;
const CELL_PANELS = new Set(['panel-cell', 'panel-staging']);
function setModeHeader(cell) {
  $('kicker-mode').textContent = cell ? '// INFILTRATION' : '// TACTICAL DUEL';
  const tl = $('tagline');
  if (cell) { if (!tl.dataset.duel) tl.dataset.duel = tl.textContent; tl.textContent = 'Night op at the Kestrel Ridge data center: break in, upload the malware, pull the archive drive, and get it out.'; tl.classList.add('cell-tag'); }
  else if (tl.dataset.duel) { tl.textContent = tl.dataset.duel; delete tl.dataset.duel; tl.classList.remove('cell-tag'); }
}
function showPanel(id) {
  if (id !== 'panel-loading') loadingCell = false;
  setModeHeader(CELL_PANELS.has(id) || (id === 'panel-loading' && loadingCell) || (id === 'panel-host' && $('panel-cell').classList.contains('hosting')));
  document.querySelectorAll('.panel').forEach((p) => p.classList.toggle('on', p.id === id));
  document.querySelector('.menu-card').classList.toggle('cell-open', id === 'panel-cell');
  document.querySelector('.menu-card').classList.toggle('stage-open', id === 'panel-staging');
  if (id === 'panel-cell') cellBrief();
  if (id === 'panel-staging') stagePreview();
}

// NightWatch: the Kestrel Ridge briefing map with the drop points, animated while it's up.
let cellMapMod = null, cellMapRaf = 0, cellMapHit = null;
async function cellBrief() {
  cellMapMod = cellMapMod || (await import('./cell/menumap.js'));
  const { DROPS } = await import('./cell/facility.js');
  if (!DROPS[cellSet.insert]) { cellSet.insert = 'draw'; store.set('cellInsert', 'draw'); }
  const box = $('cell-drops');
  const paint = () => {
    box.innerHTML = Object.entries(DROPS).map(([k, D]) => `<button data-drop="${k}" class="${cellSet.insert === k ? 'on' : ''}"><b>${D.name}${k === 'draw' ? ' \u00B7 DEFAULT' : ''}</b><span>${D.desc}</span></button>`).join('') + '<p class="note">Tap a drop point on the map or here. Hosting: your pick applies to both of you.</p>';
  };
  paint();
  box.onclick = (e) => { const b = e.target.closest('[data-drop]'); if (!b) return; cellSet.insert = b.dataset.drop; store.set('cellInsert', cellSet.insert); paint(); };
  const cv = $('cell-map');
  cv.onclick = (e) => { const k = cellMapHit && cellMapHit(e.clientX, e.clientY); if (k) { cellSet.insert = k; store.set('cellInsert', k); paint(); } };
  if (cellMapRaf) return;
  const t0 = performance.now();
  let last = 0;
  const tick = (now) => {
    if (!$('panel-cell').classList.contains('on') || !$('menu').classList.contains('on')) { cellMapRaf = 0; return; }
    cellMapRaf = requestAnimationFrame(tick);
    if (now - last < 66) return; // ~15 fps is plenty for a pulsing map
    last = now;
    cellMapHit = cellMapMod.drawCellMap(cv, cellSet.insert, (now - t0) / 1000);
  };
  cellMapRaf = requestAnimationFrame(tick);
}

// Staging: your operator on a turntable on the right (tabs switch between the two).
let stageRole = null;
async function stagePreview(role) {
  const { cellLook } = await import('./cell/arms.js');
  stageRole = role || stageRole || cellSet.role;
  const DESC = {
    shooter: 'SHOOTER \u00B7 KR-50 Nightjar, active camo, FDE chest rig, urban-digital poncho, covert earpiece, NVGs.',
    spotter: 'SPOTTER \u00B7 P-9 pistol, thermal binoculars, CYBER OPS tablet, FDE plate carrier and headset, ball cap, NVGs, recon drone on the pack.',
  };
  document.querySelectorAll('#stage-tabs button').forEach((b) => b.classList.toggle('on', b.dataset.r === stageRole));
  $('stage-who').textContent = `${stageRole.toUpperCase()} \u00B7 ${cellName(stageRole)}`;
  $('stage-desc').textContent = DESC[stageRole];
  showPreview($('stage-prev'), cellLook(stageRole), stageRole === 'spotter', true);
}
document.querySelectorAll('#stage-tabs button').forEach((b) => (b.onclick = () => stagePreview(b.dataset.r)));
document.querySelectorAll('.back').forEach((b) => (b.onclick = () => {
  if (net) { net.close(); net = null; }
  showPanel('panel-main');
}));

const audio = new Audio();
let net = null;
let game = null;
let director = null;

function callsign() {
  return (settings.name || (polloOn() ? 'Pollo' : 'Ghost')).replace(/[<>&"]/g, '');
}

// Briefing map (drawn from the real terrain).
const mapCanvas = $('map');
const redrawMap = () => { if ($('menu').classList.contains('on')) drawMap(mapCanvas); };
requestAnimationFrame(() => setTimeout(redrawMap, 50));
addEventListener('resize', redrawMap);

function goFullscreen() {
  const el = document.documentElement;
  if ('ontouchstart' in window && el.requestFullscreen && !document.fullscreenElement) el.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
  try { screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape').catch(() => {}); } catch {}
}

// Build the valley game. Used directly by Classic mode and, through the director, as the
// Multiverse's home dimension (opts.mv) — there it starts frozen and the director runs it.
async function buildValley(mode, opts = {}) {
  const quality = settings.quality === 'auto' ? detectQuality() : settings.quality;
  const { Game } = await import('./game.js');
  game = new Game({
    mode,
    net: opts.net || null,
    quality,
    paletteKey: opts.pal || settings.pal,
    name: callsign(),
    settings: { ...settings, audio },
    hostCode: opts.code,
    difficulty: opts.difficulty,
    mv: opts.mv,
  });
  if (opts.oppName) game.oppName = opts.oppName;
  window.__game = game;
  applyInputSettings();
  document.body.classList.toggle('touch', game.input.touch);
  wirePause();
  return game;
}

async function startGame(mode, opts = {}) {
  showPanel('panel-loading');
  $('loading-text').textContent = 'Building the valley…';
  // Let the loading panel paint before the heavy world build.
  await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 30)));
  await buildValley(mode, opts);
  $('menu').classList.remove('on');
  $('touch').classList.add('active');
  game.input.enabled = true;
  game.input.requestLock();
}

// "Do you want to develop an app?": it opens as the ordinary valley duel, and from the first
// point on every score throws the match somewhere else (src/multiverse). Nothing on screen
// gives that away beforehand — the menu, the loading text and round one are the classic game's.
async function startMultiverse(mode, opts = {}) {
  if (director) return;
  showPanel('panel-loading');
  $('loading-text').textContent = 'Building the valley…';
  await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 30)));
  const { Director } = await import('./multiverse/director.js');
  director = new Director({
    mode,
    net: opts.net || null,
    audio,
    settings,
    name: callsign(),
    oppName: opts.oppName,
    difficulty: opts.difficulty || aiDiff,
    match: opts.match,
    target: settings.mvTarget,
    first: opts.first,
    only: opts.only,
    off: store.get('mvOff', null),
    // The first match this device hosts shows off the surf-into-underwater pair (see the owner's menu).
    opener: mode === 'host' && store.get('mvOpener', true),
    onOpener: () => store.set('mvOpener', false),
    dev: { ...DEV, ...(opts.dev || {}) },
    valley: { build: (o) => buildValley(o.mode, { ...o, pal: opts.pal, code: opts.code }) },
    hello: () => ({ rules: { ...RULES } }),
  });
  window.__mv = director;
  try {
    await director.start();
    $('menu').classList.remove('on');
  } catch (e) {
    console.error(e);
    $('loading-text').textContent = 'Something failed to load. Reload the page to try again.';
  }
}
const multiverse = () => settings.mode === 'app';

function wirePause() {
  const pause = $('pause');
  const touch = game.input.touch;
  const offline = game.offline || game.mode === 'practice';
  $('pause-note').textContent = offline ? 'Game paused.' : 'Online match — the game keeps running while you are in this menu.';
  const show = (on) => {
    pause.classList.toggle('on', on);
    game.paused = on;
  };
  document.addEventListener('pointerlockchange', () => {
    // Frozen = another dimension (or a transition) is on screen; the director handles pausing there.
    if ((touch && !game.input.mouseMode) || game.frozen || game.suspended) return;
    const locked = document.pointerLockElement === game.renderer.domElement;
    const cardOpen = $('h-card').classList.contains('on') && $('h-card').querySelector('button');
    show(!locked && !cardOpen && !game.toolsOpen);
  });
  $('tb-pause').addEventListener('touchstart', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!game.frozen && !game.suspended) show(true);
  }, { passive: false });
  $('btn-resume').onclick = () => {
    primeGyro();
    applyInputSettings();
    show(false);
    if (!game.frozen && !game.suspended) game.input.requestLock();
  };
  $('btn-exit').onclick = () => {
    if (game.net && game.net.close) game.net.close();
    // Back to a clean menu: drop any ?host/?join query, else just reload (works for files
    // opened straight from a phone's Files app too).
    if (location.search) location.replace(location.href.split('?')[0].split('#')[0]);
    else location.reload();
  };
  $('in-sens2').value = settings.sensitivity;
  $('sens-val2').textContent = (+settings.sensitivity).toFixed(2);
  $('in-sens2').oninput = (e) => {
    settings.sensitivity = +e.target.value;
    game.input.sensitivity = settings.sensitivity;
    $('sens-val2').textContent = settings.sensitivity.toFixed(2);
    store.set('sens', settings.sensitivity);
  };
  $('in-invert2').checked = settings.invertY;
  $('in-invert2').onchange = (e) => {
    store.set('invert', (settings.invertY = e.target.checked));
    game.input.invertY = settings.invertY;
  };
  $('in-toggle2').checked = settings.scopeToggle;
  $('in-toggle2').onchange = (e) => {
    store.set('toggle', (settings.scopeToggle = e.target.checked));
    game.input.scopeToggle = settings.scopeToggle;
  };
}

// Loadout (menu)
$('btn-loadout').onclick = () => {
  showPanel('panel-loadout');
  renderLoadout($('menu-loadout'), settings.loadout, (lo) => settings.saveLoadout(lo), () => updateTitle());
};

// Vs AI
const AI_DESC = {
  easy: 'Slow to spot you, loose aim, ignores most wind.',
  normal: 'Reads glint and muzzle flash, leads moving targets, decent wind calls.',
  hard: 'Fast, precise, punishes glint and careless movement. Relocates after shooting.',
};
let aiDiff = store.get('aidiff', 'normal');
const syncDiff = () => {
  document.querySelectorAll('#ai-diff button').forEach((b) => b.classList.toggle('on', b.dataset.d === aiDiff));
  $('ai-desc').textContent = AI_DESC[aiDiff];
};
document.querySelectorAll('#ai-diff button').forEach((b) => (b.onclick = () => { aiDiff = b.dataset.d; store.set('aidiff', aiDiff); syncDiff(); }));
syncDiff();
$('btn-ai-open').onclick = () => showPanel('panel-ai');
$('btn-ai').onclick = () => {
  audio.unlock();
  primeGyro();
  goFullscreen();
  if (multiverse()) startMultiverse('ai', { difficulty: aiDiff });
  else startGame('ai', { difficulty: aiDiff });
};

// The lab (any world against the AI, any transition on a loop) would spoil the surprise,
// so it only shows up when the page is opened with ?lab.
const syncMode = () => {
  $('btn-host-go').style.display = multiverse() ? 'none' : '';
  $('btn-lab').style.display = params.has('lab') ? '' : 'none';
  // The host picks the mode; someone arriving on an invite link has nothing to pick.
  $('field-mode').style.display = params.get('join') ? 'none' : '';
  $('field-target').style.display = multiverse() && !params.get('join') ? '' : 'none';
};
document.querySelector('[data-setting="mode"]').addEventListener('change', syncMode);
syncMode();

// The owner's menu: which worlds and transitions "Do you want to develop an app?" may use,
// and a way to play any one of them alone. It would spoil the surprise, so nothing in the
// menu names it: it opens from the recording light on the briefing map (beside the version
// number on screens too narrow for the map), which reads as set dressing and is left out
// altogether on an invite link — or from the Lab button on a page opened with ?lab, which
// also lists what is still being built.
const openLab = async () => {
  showPanel('panel-lab');
  const { DIMENSIONS, TRANSITIONS, loadDimension, loadTransition, openerDimension } = await import('./multiverse/registry.js');
  // Whether the next hosted match opens with the showpiece pair: spent by the first match
  // that plays it, and re-armed here (shown only once both worlds are playable).
  const showpiece = openerDimension();
  $('lab-opener').style.display = showpiece ? '' : 'none';
  if (showpiece) {
    const box = $('lab-opener').querySelector('input');
    box.checked = store.get('mvOpener', true);
    box.onchange = () => store.set('mvOpener', box.checked);
  }
  const all = params.has('lab');
  const listed = (list) => list.filter((x) => !x.dev && (all || !x.wip));
  const off = { dims: [], fx: [], ...(store.get('mvOff', null) || {}) };
  const go = (opts) => { audio.unlock(); primeGyro(); goFullscreen(); startMultiverse('ai', { difficulty: aiDiff, ...opts }); };
  const fill = (box, key, list, load, note, onPlay) => {
    box.innerHTML = '';
    for (const e of listed(list)) {
      const row = document.createElement('div');
      row.className = 'lab-row';
      row.innerHTML = '<label><input type="checkbox" /><span></span></label><button class="ghost" title="Play">▶</button>';
      const [tick, name, play] = [row.querySelector('input'), row.querySelector('span'), row.querySelector('button')];
      const label = (title, sub) => { name.textContent = title; const sm = document.createElement('small'); sm.textContent = [sub, note(e)].filter(Boolean).join(' · '); name.appendChild(sm); };
      label(e.id, '');
      tick.checked = !off[key].includes(e.id);
      tick.onchange = () => {
        off[key] = off[key].filter((id) => id !== e.id);
        if (!tick.checked) off[key].push(e.id);
        store.set('mvOff', off);
      };
      play.onclick = () => onPlay(e);
      box.appendChild(row);
      load(e.id).then((m) => label(m.name, m.perspective || `${m.duration} s`), () => { play.disabled = true; row.classList.add('dead'); });
    }
    if (!box.children.length) box.innerHTML = '<p class="hint small">Nothing here yet.</p>';
  };
  const lead = (id) => DIMENSIONS.find((d) => d.then === id);
  fill($('lab-dims'), 'dims', DIMENSIONS, loadDimension,
    (e) => (e.id === 'valley' ? 'always opens the match' : lead(e.id) ? `follows ${lead(e.id).id}` : ''),
    (e) => go({ first: e.id, only: e.id }));
  fill($('lab-fx'), 'fx', TRANSITIONS, loadTransition,
    (e) => (e.first ? 'the first kill' : e.link ? 'links two worlds' : e.from ? `leaving ${e.from}` : ''),
    (e) => {
      // Shown between the two worlds it was made for, or between two picked at random.
      const made = DIMENSIONS.find((d) => d.via === e.id);
      const others = listed(DIMENSIONS).filter((d) => d.id !== 'valley' && d.id !== e.from).map((d) => d.id).sort(() => Math.random() - 0.5);
      const dims = made ? [made.id, made.then] : e.from ? [e.from, others[0] || e.from] : others;
      go({ dev: { fxlab: e.id, from: dims[0], to: dims[1] || dims[0] } });
    });
};
$('btn-lab').onclick = openLab;
document.querySelectorAll('.rec').forEach((el) => {
  if (params.get('join')) el.remove();
  else el.addEventListener('click', openLab);
});

// Sandbox
$('btn-sandbox').onclick = () => {
  audio.unlock();
  primeGyro();
  goFullscreen();
  startGame('sandbox', { difficulty: aiDiff });
};

// Practice
$('btn-practice').onclick = () => {
  audio.unlock();
  primeGyro();
  goFullscreen();
  startGame('practice');
};

// Host
let hostCode = null;
$('btn-host').onclick = async () => {
  audio.unlock();
  primeGyro();
  showPanel('panel-host');
  net = new Net();
  $('host-status').textContent = 'Setting up…';
  for (let attempt = 0; attempt < 4; attempt++) {
    hostCode = randomCode(5);
    $('host-code').textContent = hostCode;
    try {
      await net.host(hostCode, { local: LOCAL });
      break;
    } catch (e) {
      console.warn(e);
      if (attempt === 3) {
        $('host-status').textContent = 'Could not reach the matchmaking server. Check your connection and try again.';
        return;
      }
      net.close();
      net = new Net();
    }
  }
  $('host-status').textContent = 'Waiting for your friend to join…';
  net.on('open', () => {
    if (!game && !director) {
      $('host-status').textContent = 'Friend connected!';
      enterAsHost();
    }
  });
};

function inviteLink() {
  const u = new URL(location.href);
  u.search = '';
  u.searchParams.set('join', hostCode);
  if (LOCAL) u.searchParams.set('local', '1');
  return u.toString();
}

$('btn-share').onclick = async () => {
  const link = inviteLink();
  if (FILE_MODE && !navigator.share) return copy(`Join my Sniper Cell match — code ${hostCode}`);
  if (navigator.share) {
    const text = `Join my Sniper Cell match — code ${hostCode}`;
    try { await navigator.share(FILE_MODE ? { title: 'Sniper Cell', text } : { title: 'Sniper Cell', text, url: link }); return; } catch {}
  }
  copy(link);
};
$('btn-copy').onclick = () => copy(FILE_MODE ? hostCode : inviteLink());
function copy(text) {
  (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(
    () => ($('host-status').textContent = 'Copied to clipboard!'),
    () => prompt('Copy this link:', text),
  );
}

function enterAsHost() {
  goFullscreen();
  if (multiverse()) startMultiverse('host', { net, code: hostCode, pal: settings.pal });
  else startGame('host', { net, code: hostCode, pal: settings.pal });
}
$('btn-host-go').onclick = () => {
  audio.unlock();
  primeGyro();
  enterAsHost();
};

// Join
$('btn-join-open').onclick = () => {
  showPanel('panel-join');
  $('in-code').focus();
};
$('btn-join').onclick = async () => {
  primeTalk();
  audio.unlock();
  primeGyro();
  const code = $('in-code').value.trim().toUpperCase();
  if (code.length < 4) { $('join-status').textContent = 'Enter the 5-letter code.'; return; }
  $('join-status').textContent = 'Connecting…';
  if (net) net.close();
  net = new Net();
  let gotHello = false;
  net.on('hello', (m) => {
    if (gotHello) return;
    gotHello = true;
    if (m.rules) applyRules(m.rules);
    $('join-status').textContent = 'Connected!';
    goFullscreen();
    const o = { net, pal: PALETTES[m.pal] ? m.pal : 'dusk', oppName: String(m.name || 'Opponent').replace(/[<>&"]/g, '').slice(0, 16) };
    // The host decides the mode: a Multiverse host says so in its hello.
    if (m.cell) startCell('guest', { net, cell: m.cell, partnerName: o.oppName });
    else if (m.mv) startMultiverse('guest', { ...o, match: m.mv });
    else startGame('guest', o);
  });
  net.on('open', () => {
    $('join-status').textContent = 'Connected — waiting for host…';
    // Host greets on open; nudge in case we raced it.
    net.send({ t: 'hello', name: callsign(), pal: settings.pal });
  });
  try {
    await net.join(code, { local: LOCAL });
  } catch (e) {
    $('join-status').textContent = e.message || 'Could not connect.';
  }
};

// ---- NightWatch (co-op stealth; code in src/cell/) ----
// iOS lets speech start only from a tap: say nothing once on the way in.
function primeTalk() { try { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; speechSynthesis.speak(u); } catch {} }
const CELL_CALL = { shooter: 'Ra', spotter: 'R\u014dnin' };
// Staging-area loadouts (both roles), applied at mission start.
let cellLoadout = store.get('cellLoadout', null);
async function renderStaging() {
  const { normLoadout, PERKS } = await import('./cell/arms.js');
  const L = (cellLoadout = normLoadout(cellLoadout));
  const opt = (k, v, label, on, desc = '') => `<button class="${on ? 'on' : ''}" data-k="${k}" data-v="${v}">${label}${desc ? `<small>${desc}</small>` : ''}</button>`;
  const perks = (r) => Object.entries(PERKS[r]).map(([v, p]) => opt(r + '.perk', v, p.name, L[r].perk === v, p.desc)).join('');
  const prim = (name, desc) => `<div class="stg-prim"><b>${name}</b><small>${desc}</small></div>`;
  $('panel-staging').querySelector('.stg').innerHTML = `
    <div class="stg-col" data-r="shooter"><h3>SHOOTER \u00B7 ${CELL_CALL.shooter}</h3><p>Multicam black, FDE chest rig, urban-digital poncho, covert earpiece. Active camo, lock-pick set, weapon light, laser.</p>
      <div class="stg-k">PRIMARY</div>${prim('KR-50 NIGHTJAR', '.50 subsonic bolt gun, integral suppressor, 2\u00D7/8\u00D7 night scope. Through bodies and thin walls; special magazines (Z): explosive, penetrator, EMP. Kicks hard; wide from the hip.')}
      <div class="stg-k">KR-50 BOLT</div><div class="stg-opts">${opt('shooter.bolt', 'standard', 'STANDARD', L.shooter.bolt !== 'straight', 'Tap fire: off the glass to work the bolt. Hold fire to stay scoped.')}${opt('shooter.bolt', 'straight', 'STRAIGHT-PULL', L.shooter.bolt === 'straight', 'Cycles while you stay on target. A little more climb.')}</div>
      <div class="stg-k">SECONDARY</div><div class="stg-opts">${opt('shooter.secondary', 'smg', 'K9 HUSH SMG', L.shooter.secondary === 'smg', '40 rounds, full / burst / semi (B). Quiet, light kick.')}${opt('shooter.secondary', 'mag50', 'M50 MAGNUM', L.shooter.secondary === 'mag50', '7 rounds, slow and heavy. Big kick, wide from the hip: aim down sights.')}</div>
      <div class="stg-k">SECONDARY SUPPRESSOR</div><div class="stg-opts">${opt('shooter.secSup', '1', 'FITTED', L.shooter.secSup, 'Quiet. Hold B in game to twist it off.')}${opt('shooter.secSup', '0', 'OFF', !L.shooter.secSup, 'Loud: every shot carries 70 m.')}</div>
      <div class="stg-k">PERK</div><div class="stg-opts">${perks('shooter')}</div></div>
    <div class="stg-col" data-r="spotter"><h3>SPOTTER \u00B7 ${CELL_CALL.spotter}</h3><p>Multicam black, FDE plate carrier, ball cap, FDE headset. CYBER OPS tablet, recon drone, ISR, keycard duty.</p>
      <div class="stg-k">PRIMARY</div>${prim('P-9 PISTOL', '9 mm service pistol, 12 rounds, two magazines. Suppressor fitted by default.')}
      <div class="stg-k">SECOND</div>${prim('THERMAL BINOCULARS', 'X to swap from the P-9; raise them to mark every enemy in the viewfinder at any range.')}
      <div class="stg-k">P-9 SUPPRESSOR</div><div class="stg-opts">${opt('spotter.pistolSup', '1', 'FITTED', L.spotter.pistolSup, 'Quiet up close.')}${opt('spotter.pistolSup', '0', 'OFF', !L.spotter.pistolSup, 'Loud: every shot carries 70 m.')}</div>
      <div class="stg-k">PERK</div><div class="stg-opts">${perks('spotter')}</div></div>`;
}
$('panel-staging').addEventListener('click', (e) => {
  const b = e.target.closest('[data-k]');
  if (!b) return;
  const [r, k] = b.dataset.k.split('.');
  cellLoadout[r][k] = k.endsWith('Sup') ? b.dataset.v === '1' : b.dataset.v;
  store.set('cellLoadout', cellLoadout);
  renderStaging();
});
const cellSet = { role: store.get('cellRole', 'shooter'), diff: store.get('cellDiff', 'operative'), names: store.get('cellNames', {}), mission: store.get('cellMission', 'nightwatch'), insert: store.get('cellInsert', 'draw'), layout: store.get('cellLayout', 'standard') };
const MISSION_DESC = { nightwatch: 'Sentinel: SENTINEL\u2019s augmented night garrison \u2014 cowardly officers, shielded juggernauts with energy blades, bulwarks behind hard-light walls, beam-rifle snipers on the towers.', infiltration: 'Spec Ops: the original op against a crew of human security guards.' };
const cellName = (role) => ((cellSet.names[role] || '').trim() || CELL_CALL[role]).replace(/[<>&"]/g, '').slice(0, 16);
function syncCell() {
  document.querySelectorAll('#panel-cell .cell-role').forEach((b) => b.classList.toggle('on', b.dataset.role === cellSet.role));
  document.querySelectorAll('#cell-diff button').forEach((b) => b.classList.toggle('on', b.dataset.d === cellSet.diff));
  document.querySelectorAll('#cell-mission button').forEach((b) => b.classList.toggle('on', b.dataset.m === cellSet.mission));
  document.querySelectorAll('#cell-look button').forEach((b) => b.classList.toggle('on', b.dataset.look === settings.rules.look));
  document.querySelectorAll('#cell-layout button').forEach((b) => b.classList.toggle('on', b.dataset.lay === cellSet.layout));
  $('cell-mission-desc').textContent = MISSION_DESC[cellSet.mission];
  $('in-cell-name').value = cellSet.names[cellSet.role] || '';
  $('in-cell-name').placeholder = CELL_CALL[cellSet.role];
}
document.querySelectorAll('#panel-cell .cell-role').forEach((b) => (b.onclick = () => { cellSet.role = b.dataset.role; store.set('cellRole', cellSet.role); syncCell(); }));
document.querySelectorAll('#cell-diff button').forEach((b) => (b.onclick = () => { cellSet.diff = b.dataset.d; store.set('cellDiff', cellSet.diff); syncCell(); }));
document.querySelectorAll('#cell-mission button').forEach((b) => (b.onclick = () => { cellSet.mission = b.dataset.m; store.set('cellMission', cellSet.mission); syncCell(); }));
// Graphics look: the same setting as the Sniping style panel's Graphics row (host decides).
document.querySelectorAll('#cell-layout button').forEach((b) => (b.onclick = () => { cellSet.layout = b.dataset.lay; store.set('cellLayout', cellSet.layout); syncCell(); }));
document.querySelectorAll('#cell-look button').forEach((b) => (b.onclick = () => { saveRules({ ...settings.rules, look: b.dataset.look }); syncCell(); }));
$('in-cell-name').oninput = (e) => { cellSet.names[cellSet.role] = e.target.value; store.set('cellNames', cellSet.names); };
$('btn-cell-stage').onclick = () => { renderStaging(); showPanel('panel-staging'); };
// Radio voices on / off (off: the radio lines still show as subtitles).
{
  const key = 'draxxed.cellVoice';
  const get = () => { try { return localStorage.getItem(key) !== 'off'; } catch { return true; } };
  const label = () => { $('btn-cell-voice').innerHTML = `Radio voices: <em class="cur">${get() ? 'ON' : 'OFF \u00B7 text only'}</em>`; };
  label();
  $('btn-cell-voice').onclick = () => { try { localStorage.setItem(key, get() ? 'off' : 'on'); } catch {} label(); };
}
$('btn-stage-done').onclick = () => showPanel('panel-cell');
$('btn-cell').onclick = () => { $('panel-cell').classList.remove('hosting'); syncCell(); showPanel('panel-cell'); };
syncCell();

async function startCell(mode, opts = {}) {
  loadingCell = true;
  if (game || director) return;
  showPanel('panel-loading');
  $('loading-text').textContent = 'Inserting at Kestrel Ridge\u2026';
  await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 30)));
  const quality = settings.quality === 'auto' ? detectQuality() : settings.quality;
  const { CellGame } = await import('./cell/cell.js');
  const c = opts.cell || { role: cellSet.role, diff: cellSet.diff, mission: cellSet.mission, insert: cellSet.insert, layout: cellSet.layout, seed: (Math.random() * 1e6) | 0 };
  // The guest plays whichever role the host didn't take.
  const role = mode === 'operative' ? 'shooter' : mode === 'guest' ? (c.role === 'shooter' ? 'spotter' : 'shooter') : c.role;
  game = new CellGame({ mode, net: opts.net || null, role, diff: c.diff, seed: c.seed, mission: c.mission || 'nightwatch', insert: ['north', 'west', 'east', 'roof'].includes(c.insert) ? c.insert : 'draw', layout: c.layout === 'random' ? 'random' : 'standard', look: c.look === 'og' || c.look === 'inked' ? c.look : settings.rules.look, quality, settings: { ...settings, cellLoadout }, audio, name: cellName(role), partnerName: opts.partnerName || CELL_CALL[role === 'shooter' ? 'spotter' : 'shooter'] });
  if (opts.hello) game.hello = opts.hello;
  window.__game = game;
  document.body.classList.toggle('touch', game.input.touch);
  $('menu').classList.remove('on');
  $('touch').classList.add('active');
  game.input.enabled = true;
  game.input.requestLock();
}
$('btn-cell-solo').onclick = () => { primeTalk(); audio.unlock(); primeGyro(); goFullscreen(); startCell('solo'); };
$('btn-cell-lone').onclick = () => { primeTalk(); audio.unlock(); primeGyro(); goFullscreen(); startCell('operative'); };
$('btn-cell-join').onclick = () => { showPanel('panel-join'); $('in-code').focus(); };
$('btn-cell-cancel').onclick = () => { if (net) { net.close(); net = null; } $('panel-cell').classList.remove('hosting'); };
$('btn-cell-host').onclick = async () => {
  primeTalk();
  audio.unlock();
  primeGyro();
  $('panel-cell').classList.add('hosting');
  net = new Net();
  $('cell-status').textContent = 'Setting up\u2026';
  for (let attempt = 0; attempt < 4; attempt++) {
    hostCode = randomCode(5);
    $('cell-code').textContent = hostCode;
    try { await net.host(hostCode, { local: LOCAL }); break; } catch (e) {
      console.warn(e);
      if (attempt === 3) { $('cell-status').textContent = 'Could not reach the matchmaking server. Check your connection and try again.'; return; }
      net.close();
      net = new Net();
    }
  }
  const other = cellSet.role === 'shooter' ? 'spotter' : 'shooter';
  $('cell-status').textContent = `Waiting for your ${other}\u2026 You are the ${cellSet.role}.`;
  const cell = { role: cellSet.role, diff: cellSet.diff, mission: cellSet.mission, insert: cellSet.insert, layout: cellSet.layout, seed: (Math.random() * 1e6) | 0, look: settings.rules.look };
  const hello = { t: 'hello', name: cellName(cellSet.role), cell };
  net.on('hello', () => net.send(hello));
  net.on('open', () => {
    if (game) return;
    net.send(hello);
    $('cell-status').textContent = 'Friend connected!';
    goFullscreen();
    startCell('host', { net, cell, hello, partnerName: CELL_CALL[other] });
  });
};
$('btn-cell-share').onclick = async () => {
  const link = inviteLink();
  const text = `Join my NightWatch op in Sniper Cell \u2014 code ${hostCode}`;
  if (navigator.share) { try { await navigator.share(FILE_MODE ? { title: 'NightWatch', text } : { title: 'NightWatch', text, url: link }); return; } catch {} }
  (navigator.clipboard ? navigator.clipboard.writeText(FILE_MODE ? text : link) : Promise.reject()).then(() => ($('cell-status').textContent = 'Copied to clipboard!'), () => prompt('Copy this link:', link));
};
$('btn-cell-copy').onclick = () => (navigator.clipboard ? navigator.clipboard.writeText(FILE_MODE ? hostCode : inviteLink()) : Promise.reject()).then(() => ($('cell-status').textContent = 'Copied!'), () => prompt('Copy:', FILE_MODE ? hostCode : inviteLink()));
// Direct link: …/#nightwatch (or ?nightwatch) opens Sniper Cell with NightWatch selected;
// #infiltration does the same for the other mission.
{
  const want = ['nightwatch', 'infiltration'].find((m) => location.hash === '#' + m || params.has(m));
  if (want && !params.get('join') && !params.get('cell')) { cellSet.mission = want; store.set('cellMission', want); $('btn-cell').onclick(); }
}
if (params.get('cell')) { audio.unlock(); startCell(params.get('cell') === 'lone' ? 'operative' : 'solo', { cell: { role: params.get('role') === 'spotter' ? 'spotter' : 'shooter', diff: params.get('diff') || 'operative', mission: params.get('mission') || 'nightwatch', insert: params.get('insert') || 'draw', layout: params.get('layout') || 'standard', seed: +params.get('seed') || 7 } }); }

if (params.get('join')) {
  showPanel('panel-join');
  $('in-code').value = params.get('join').toUpperCase().slice(0, 5);
  $('join-status').textContent = 'Tap Join to enter the match.';
}

// ---- Dev / test entry points (no clicks needed) ----
if (DEV.autohost) {
  audio.unlock();
  net = new Net();
  hostCode = DEV.autohost;
  net.host(hostCode, { local: LOCAL }).then(() => net.on('open', () => startMultiverse('host', { net, code: hostCode, pal: settings.pal })));
} else if (DEV.autojoin) {
  audio.unlock();
  $('in-code').value = DEV.autojoin;
  $('btn-join').click();
} else if (DEV.dim || DEV.fxlab || params.get('mv') === 'ai') {
  audio.unlock();
  startMultiverse('ai', { difficulty: aiDiff });
}

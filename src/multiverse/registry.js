// Every dimension and transition the Multiverse knows about. Modules are imported
// lazily (one literal import() per entry so the single-file build can bundle them),
// which keeps start-up light and means one broken module cannot take down the rest.
//
// `view` (fp = first person, tp = third person, top = top-down, side = side-on) and `look`
// ('2d' or '3d': how the world READS, so a flat-drawn first-person world is '2d') drive
// the rotation: the director avoids playing two worlds of the same kind back to back.
// `then` / `via` chain two worlds into one story beat: a kill in this world always leads to
// world `then`, through transition `via` (surf: the loser falls into the sea, the winner
// dives after them, and the duel carries on underwater). The world named by `then` is only
// reached that way while its lead-in is playable; a transition marked `link: true` is only
// ever played as somebody's `via`, never drawn in the rotation.
// A transition with `from: '<world>'` is that world's own way out: it is written around what
// the world is (a cartridge pulled from a console, a terminal crashing, toys tidied away) and is
// always played when a kill ends a round there; it is never drawn in the ordinary rotation.
// `opener: true` marks the chained pair the owner wants shown off first: in the first match a
// device hosts, it is the world that follows the first kill (see Director._armOpener).
// `dev: true` keeps an entry out of the match rotation (examples / templates).
// `wip: true` does the same for a module that is still being built: it can be loaded by id
// (?dim=, ?fxlab=, the lab) but matches do not visit it until the flag is removed.
// `first: true` marks the transition reserved for the FIRST point of a match — the moment
// the mode shows its hand — which never comes round again in the rotation.

export const DIMENSIONS = [
  { id: 'valley', view: 'fp', look: '3d', load: () => import('./dimensions/valley/index.js') },
  { id: 'neon', view: 'top', look: '2d', load: () => import('./dimensions/neon/index.js') },
  { id: 'comic', view: 'tp', look: '3d', load: () => import('./dimensions/comic/index.js') },
  { id: 'pixel', view: 'side', look: '2d', load: () => import('./dimensions/pixel/index.js') },
  { id: 'ww2', view: 'tp', look: '3d', load: () => import('./dimensions/ww2/index.js') },
  { id: 'surf', view: 'tp', look: '3d', then: 'abyss', via: 'plunge', opener: true, load: () => import('./dimensions/surf/index.js') },
  { id: 'abyss', view: 'fp', look: '3d', load: () => import('./dimensions/abyss/index.js') },
  { id: 'orbit', view: 'side', look: '2d', wip: true, load: () => import('./dimensions/orbit/index.js') },
  { id: 'arcade', view: 'fp', look: '3d', wip: true, load: () => import('./dimensions/arcade/index.js') },
  { id: 'toon', view: 'side', look: '2d', load: () => import('./dimensions/toon/index.js') },
  { id: 'manga', view: 'side', look: '2d', load: () => import('./dimensions/manga/index.js') },
  { id: 'noir', view: 'fp', look: '2d', wip: true, load: () => import('./dimensions/noir/index.js') },
  { id: 'terminal', view: 'top', look: '2d', load: () => import('./dimensions/terminal/index.js') },
  { id: 'toybox', view: 'top', look: '3d', load: () => import('./dimensions/toybox/index.js') },
  { id: 'tapestry', view: 'side', look: '2d', wip: true, load: () => import('./dimensions/tapestry/index.js') },
  { id: 'petri', view: 'top', look: '2d', wip: true, load: () => import('./dimensions/petri/index.js') },
  { id: 'paper', view: 'fp', look: '2d', wip: true, load: () => import('./dimensions/paper/index.js') },
  { id: 'snow', view: 'top', look: '3d', wip: true, load: () => import('./dimensions/snow/index.js') },
  { id: 'heli', view: 'tp', look: '3d', wip: true, load: () => import('./dimensions/heli/index.js') },
  { id: 'worm', view: 'side', look: '3d', wip: true, load: () => import('./dimensions/worm/index.js') },
  { id: 'example-2d', dev: true, load: () => import('./dimensions/example-2d/index.js') },
  { id: 'example-3d', dev: true, load: () => import('./dimensions/example-3d/index.js') },
];

export const TRANSITIONS = [
  { id: 'dev-app', first: true, load: () => import('./transitions/dev-app.js') },
  { id: 'synapse', load: () => import('./transitions/synapse.js') },
  { id: 'flashback', load: () => import('./transitions/flashback.js') },
  { id: 'shatter', load: () => import('./transitions/shatter.js') },
  { id: 'wormhole', wip: true, load: () => import('./transitions/wormhole.js') },
  { id: 'channel-surf', wip: true, load: () => import('./transitions/channel-surf.js') },
  { id: 'cosmic-zoom', wip: true, load: () => import('./transitions/cosmic-zoom.js') },
  { id: 'reboot', from: 'terminal', wip: true, load: () => import('./transitions/reboot.js') },
  { id: 'cartridge', from: 'pixel', load: () => import('./transitions/cartridge.js') },
  { id: 'tidy-up', from: 'toybox', load: () => import('./transitions/tidy-up.js') },
  { id: 'page-turn', from: 'manga', wip: true, load: () => import('./transitions/page-turn.js') },
  { id: 'last-reel', from: 'toon', wip: true, load: () => import('./transitions/last-reel.js') },
  { id: 'swallowed', from: 'abyss', wip: true, load: () => import('./transitions/swallowed.js') },
  { id: 'storybook', wip: true, load: () => import('./transitions/storybook.js') },
  { id: 'slot-machine', wip: true, load: () => import('./transitions/slot-machine.js') },
  { id: 'bullet-hole', wip: true, load: () => import('./transitions/bullet-hole.js') },
  { id: 'evolution', wip: true, load: () => import('./transitions/evolution.js') },
  { id: 'elevator', wip: true, load: () => import('./transitions/elevator.js') },
  { id: 'continue', load: () => import('./transitions/continue.js') },
  { id: 'radar', wip: true, load: () => import('./transitions/radar.js') },
  { id: 'telescope', wip: true, load: () => import('./transitions/telescope.js') },
  { id: 'plunge', link: true, load: () => import('./transitions/plunge.js') },
  { id: 'example', dev: true, load: () => import('./transitions/example.js') },
];

const cache = new Map();

function fail(kind, id, why) {
  throw new Error(`${kind} "${id}": ${why}`);
}

async function load(list, kind, id, check) {
  const key = kind + ':' + id;
  if (cache.has(key)) return cache.get(key);
  const entry = list.find((e) => e.id === id);
  if (!entry) fail(kind, id, 'not in the registry');
  const mod = (await entry.load()).default;
  if (!mod || typeof mod.create !== 'function') fail(kind, id, 'no default export with create()');
  if (mod.id !== id) fail(kind, id, `module.id is "${mod.id}"`);
  check(mod);
  cache.set(key, mod);
  return mod;
}

export function loadDimension(id) {
  return load(DIMENSIONS, 'dimension', id, (m) => {
    if (m.native) return;
    if (m.renderer !== '2d' && m.renderer !== 'three') fail('dimension', id, 'renderer must be "2d" or "three"');
    if (m.aim !== 'look' && m.aim !== 'pointer') fail('dimension', id, 'aim must be "look" or "pointer"');
    if (!m.palette || !m.palette.bg || !m.palette.fg || !m.palette.accent) fail('dimension', id, 'palette needs bg, fg and accent');
    if (!m.name || !m.controls) fail('dimension', id, 'name and controls are required');
  });
}

export function loadTransition(id) {
  return load(TRANSITIONS, 'transition', id, (m) => {
    if (!(m.duration > 0)) fail('transition', id, 'duration is required');
    if (!(m.swapAt > 0 && m.swapAt < 1)) fail('transition', id, 'swapAt must be in (0,1)');
  });
}

export const dimensionKind = (id) => { const e = DIMENSIONS.find((d) => d.id === id); return e ? { view: e.view, look: e.look } : {}; };
export const playableDimensions = () => DIMENSIONS.filter((d) => !d.dev && !d.wip).map((d) => d.id);
export const playableTransitions = () => TRANSITIONS.filter((d) => !d.dev && !d.wip && !d.first && !d.link && !d.from).map((d) => d.id);
// A world's own way out, if it has one that can be played.
export const exitOf = (id, ok = () => true) => (TRANSITIONS.find((t) => t.from === id && !t.dev && !t.wip && ok(t.id)) || {}).id || null;

// Where a kill in world `id` leads, if it is chained to another: { dim, fx } (fx null when the
// linking transition is not available, in which case an ordinary one is drawn). `ok(id)` lets
// the caller rule out modules that failed to load this session.
export function chainOf(id, ok = () => true) {
  const e = DIMENSIONS.find((d) => d.id === id);
  const to = e && e.then && DIMENSIONS.find((d) => d.id === e.then);
  if (!to || to.dev || to.wip || !ok(to.id)) return null;
  const fx = TRANSITIONS.find((t) => t.id === e.via);
  return { dim: to.id, fx: fx && !fx.dev && !fx.wip && ok(fx.id) ? fx.id : null };
}
// The opener, if it and the world it leads into can both be played.
export function openerDimension(ok = () => true) {
  const e = DIMENSIONS.find((d) => d.opener && !d.dev && !d.wip && ok(d.id));
  return e && chainOf(e.id, ok) ? e.id : null;
}
// Worlds that are only reached through their lead-in (while that lead-in can be played).
export const chainedDimensions = (ok = () => true) =>
  DIMENSIONS.filter((d) => !d.dev && !d.wip && ok(d.id) && d.then).map((d) => d.then);
export const firstTransition = () => (TRANSITIONS.find((d) => d.first && !d.dev && !d.wip) || {}).id || null;

export function metaOf(mod) {
  return { id: mod.id, name: mod.name, tagline: mod.tagline || '', perspective: mod.perspective || '', palette: mod.palette };
}

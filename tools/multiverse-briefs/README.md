# Module briefs

How the worlds and transitions under `src/multiverse/` were commissioned, kept so any of
them can be rebuilt or given another polish pass later.

- `briefs.json` — the creative brief for every world (`dims`) and transition (`fx`).
- `wave-template.js` — the builder and second-engineer ("harden") instructions each brief
  is dropped into, including the test commands every module must pass.

- `genprompts.cjs` — writes the two prompts for every brief:
  `node tools/multiverse-briefs/genprompts.cjs <scratch-dir>`.
- `reports/` — the first engineer's report for each world that has been built but has not
  yet had (or finished) its second-engineer pass. The second engineer reads it as claims
  to verify.

## How a module gets into matches

1. A builder agent is given `prompts/build-<id>.md` and returns a report.
2. A second engineer (ideally a different model) is given `prompts/harden-<id>.md` and
   that report, breaks the module, fixes it and scores it.
3. Someone looks at fresh screenshots (`node tools/mv-test.mjs dim <id> --shots <dir>`,
   desktop and phone sizes) and checks a transition into and out of it.
4. Only then is `wip: true` removed from its entry in `src/multiverse/registry.js`, the
   single file rebuilt (`npm run build:single`) and the change merged.

Modules flagged `wip` are never visited by a match and are left out of the single-file
build, so unfinished work can sit in the tree safely.

## Status

Work was paused on 20 November 2026 to fit a usage limit. In matches now: eleven worlds
and five transitions, plus the plunge that links surf to the underwater world.

| Module | Kind | State |
| --- | --- | --- |
| dev-app | transition (the first-kill reveal) | in matches |
| synapse, flashback, shatter, continue | transitions | in matches |
| valley | world (the original game; always opens the match) | in matches |
| neon, ww2, pixel, terminal, manga, toon, toybox, surf, comic | worlds | in matches |
| abyss | world (underwater; the owner's showpiece) | in matches, always straight after surf; still owed a top-tier polish pass |
| plunge | linking transition, surf → abyss | in matches |
| cartridge, tidy-up, reboot, swallowed | world exits (pixel, toybox, terminal, abyss) | in matches; always played when a kill ends a round in their world |
| page-turn, last-reel | world exits (manga, toon) | brief only |
| paper | world (flat-drawn first person) | first build done (report in `reports/`); second-engineer pass not started |
| snow, orbit, heli, worm, arcade, noir, tapestry, petri | worlds | brief only |
| radar, telescope, wormhole, bullet-hole, channel-surf and the rest | transitions | brief only |

Check `git log` and the registry for what happened after this table was written: a module
without `wip` is in matches.

## Picking the work back up

In the owner's order of priority:

1. **abyss** — in matches, but the owner wants it to be the best-looking world and its second
   engineer scored the picture 7/10: give it a polish pass on the strongest model available
   (kraken eyes and arms, the wreck, rival readability at 50 m, longer cat-and-mouse). The
   hook that forced the full-quality build for stills was removed; add one back while polishing.
2. **surf** — in matches; a character and spray art pass would lift it (see
   `reports/surf-handoff.md`).
3. **plunge** — in matches. The first match a device hosts plays surf → plunge → abyss straight
   after the first kill (`opener` in the registry, re-armed from the owner's menu).
4. **paper** — second-engineer pass.
5. New worlds the owner asked for: **snow** (top-down 3D), **orbit** with the
   **telescope** transition (space; telescope replaces cosmic-zoom unless the owner wants
   both), **heli** with **radar**, **worm**.
6. At most two or three more transitions; the owner prefers few and excellent.

Never yet checked on real hardware: sound, frame rate on an M1 Mac and M1 iPad, Safari,
and a two-device match over the internet.

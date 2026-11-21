<p align="center"><img src="icon.svg" width="120" alt="Sniper Cell logo"></p>

<h1 align="center">Sniper Cell</h1>

<p align="center"><em>One valley. Two rifles. Eight hundred metres.</em></p>

A 1v1 long-range sniper duel that runs in the browser on desktop, phones and tablets. (Formerly *Draxxed Sklounst*; the old name still turns up as an easter egg.) No install, no server: one player hosts, the other opens the invite link, and the two connect peer-to-peer over WebRTC.

It also has **[NightWatch](#nightwatch-co-op)**, a co-op (or solo) night stealth mode: a shooter and a spotter infiltrate a guarded data-center tower, steal intel from a hidden server and get out in a van.

![The practice range: looking out over the valley from the ridge with the Mk22 MRAD](docs/screenshots/practice-range.png)

## Screenshots

| Main menu and AO briefing map | Vs AI: round 1 insertion |
| --- | --- |
| ![Main menu with the topographic briefing map of the valley, ridges and uplinks A, B and C](docs/screenshots/main-menu-briefing-map.png) | ![Round 1 insertion against a Veteran AI: HUD with compass, uplink markers, loadout tools and ammo](docs/screenshots/vs-ai-insertion.png) |

## Play

1. Serve this folder over HTTP(S) (see **Hosting** below) and open it.
2. **Host a match** shows a 5-letter code. Tap **Share invite link** and send it to your friend.
3. Your friend opens the link, enters a callsign, and taps **Join**. The match starts automatically.

**Vs AI** is a full match against an AI sniper (Recruit, Veteran or Elite), with the same rounds, uplinks, UAV sweeps and killcams as an online match. The AI spots you from movement, stance, scope glint and muzzle flash, leads moving targets, partly corrects for wind, relocates after shooting, and goes for uplinks when it's losing on time.

**Sandbox** is a free-play testing mode. Press **B** (or **TOOLS** on touch) to open the tools panel, which has:

- teleports to the ridges and each uplink;
- AI controls: off, passive or hostile, skill level, and a button that moves the AI to wherever you're aiming;
- wind direction and speed, and time of day;
- god mode, infinite ammo and fly mode;
- bullet-trajectory traces that label each impact with its drop;
- hitbox wireframes and quarter-speed slow motion.

**Practice range** is a solo mode with steel targets from 150 to 850 m and a moving target. Use it to learn drop, wind and zeroing.

### Rules

- Both players start on opposite ridgelines, about 800 m apart. Spawns are random among three points per ridge, and sides swap every round.
- You get one life per round. First to 4 rounds wins.
- **Predator UAV**: a drone circles high over the valley. Every 60 s of live play it pings both players in red on each other's HUD. For 8 s afterwards you can press **U** to tune into its live thermal feed of the enemy. A UAV jammer blocks the ping and the feed.
- **Pollo Hermano** (easter egg): pick the Thermal poncho, then the *Pollo Hermano* poncho skin. You wear a yellow chicken suit and your rifle flings yellow chickens instead of bullets: held by the beak, pulled back by the feet, slingshot style. They fly exactly like the rifle's bullets under the current sniping style and do the same damage on a direct hit. A chicken that lands gets up and runs at the enemy (5 m/s) and pecks them (4 damage every 0.6 s) until it's shot: the pistol is ideal. Fling yours at the ground near enemy chickens and they brawl. Up to 8 live chickens each; they wander off after 45 s. The AI shoots chickens near it with its pistol. With the suit selected, the main menu takes the game's old name, *Draxxed Sklounst*. The suit isn't remembered between visits: every fresh load starts on the standard poncho and the classic title. Pecked to death? You don't just die: a kraken bursts out of the ground and swallows the town, then a vast AI overlord reaches down from the sky and flicks you off the map: "The AI Overlords have deemed this one unworthy." (Both players watch it instead of the killcam.) In flight a chicken glows and trails yellow like a tracer.
- **Sniping style** (main menu, host's choice applies to both players). Two bars: the shooting style (bullet physics) and, underneath, the shooting distance:
  - **Halo** (the default): instant hit, no drop, wind or sway, 5×/10×/20× zoom. Plays at Close range.
  - **Call of Duty**: fast bullets, light drop, no wind, slightly bigger hitboxes. Plays at Medium range.
  - **Battlefield**: real drop and travel time, moderate wind. Plays at Long range.
  - **Simulation** (like Sniper Elite / ARMA): heavier drag and strong wind. Plays at Extreme range.
  - **Custom**: sliders for drop, bullet speed (slow to instant), wind, drag, sway and hitbox size.
  - **Distance** (mix and match with any physics; Close is the default; each sits under the style it suits): Close ~250 m (valley floor between the town and the meadow), Medium ~500 m (forward slopes, in the trees), Long ~800 m (ridge to ridge), Extreme ~1150 m (opposite ridges at opposite ends of the valley) or Auto (the style's own). It sets where both sides spawn and where the AI sets up; the valley itself doesn't change.
  - Option: the rangefinder (F) auto-sets your zero to the measured distance.
- **Graphics style** (on this panel, under Settings, and on the NightWatch panel: all three are the same setting; the host's choice applies to both players, in the duel and in NightWatch):
  - **Inked** (the default): comic-book ink lines around everything (silhouettes and folds, found in the depth buffer and fading with distance) and three-tone cel shading on props, figures and your rifle, with fuller color. Grass is left uninked so the slopes don't turn to noise.
  - **OG**: the original look, with soft shading, a light silhouette-only outline and a slightly desaturated filmic grade.
  - On Low quality there's no post-processing, so Inked gets the cel shading but no ink lines.
  - NightWatch (Sentinel and Infiltration missions) follows the same setting, with the same choice on its own menu (Inked / OG graphics). The host's choice goes to the partner with the mission.
- **Bolt cycling** (standard Mk22 bolt): after a scoped shot, lifting your finger off fire drops you out of the scope so the bolt is worked, then you go straight back in if you're still holding (or have toggled) scope. Keep fire held to stay on target and watch the shot; turn this off in Settings to unscope by hand.
- **Bipod** (Battlefield-style): go prone and hold still for half a second and it sets itself (turn that off in Settings to set it only by hand), or press **X** (BIPOD on touch). Your support hand reaches forward and flicks the legs down, then the rifle settles. You can't fire while your hand is off the rifle. Once set, the scope is dead still and recoil is reduced. Moving, standing, switching or pressing X again folds the legs; folding with X keeps it up until you move or get up.
- **Supply drone** (V, then a 90 s cooldown): a cargo hexacopter flies in from behind your ridge and drops a parachute crate where you aim (within 60 m) or at your feet. Walk onto it to refill both weapons. Both players see and hear it, and the AI uses it to find you.
- **No shooting or reloading while sprinting.** Walking and standing are fine, and starting a sprint cancels a reload.
- **Weapons**: pick your rifle in the loadout. Everyone also carries an **M18 pistol** (17+1, one spare magazine) for close range. Every weapon starts with **one in the chamber**: a reload before you're empty keeps it, while a reload from empty is slower because you have to chamber a round.
  - **Mk22 MRAD** (default): bolt-action .300 PRC, 7+1. One-shot headshots and body shots (two body shots against a plate carrier), two leg shots, 4–20× (or the 5–40× long-range scope attachment: 5 / 10 / 20 / 30 / 40×, glints harder, a little more sway) scope (higher zoom glints more). Battlefield-style bolt: after a scoped shot you come off the scope to work the bolt, and you can't scope back in until it's done. The **straight-pull bolt** option (Loadout) cycles while you stay scoped and slightly faster, with a bit more muzzle climb.
  - **M110A1 DMR**: semi-auto 7.62, 20+1, about 3 shots a second. Headshots still kill; three body shots. Its smaller 4–10× scope glints less.
- **Loadout**: before the match (main menu → Loadout) and during each round's insertion (**L**), pick one tool per slot:
  - **Scout (T):** Hunter drone (the default), Spotting drone or Recon dart.
    - **Hunter drone:** a fixed-wing loitering drone. It flies 250–450 m in the direction you aim, then circles and searches about 160 m around itself. When it sees the enemy it locks on, follows them, and marks them on your HUD every second. If it loses sight for 4 s, it goes back to searching. It lasts 40 s. It's audible and visible, the enemy is warned when it locks, and it can be shot down. Smoke breaks the lock. Against the thermal poncho it works on optics alone: it has to get within ~70 m (110 m if the target is moving), and it only drops a rough mark (within ~8 m) every 3 s.
    - Spotting drone: fly a thermal quadcopter for 25 s; loud and shootable. Recon dart ×2 (fired up to ~400 m; pings enemies moving within 45 m for 40 s; blinks, beeps and is shootable).
  - **Vest:** Plate carrier (default; torso hits do 65% damage, so you survive one Mk22 body shot and a DMR needs 4; headshots still kill) or Chest rig (no plates, so one Mk22 body shot kills; +2 rifle mags and +1 pistol mag). The model wears whichever you pick.
  - **Operator:** Ghillie (jute suit, face paint) or Wraith (balaclava, respirator). Headwear: boonie, high-cut helmet, cap, backwards cap, beanie or none. Eyewear: ballistic glasses, goggles, wraparound visor or none. Camo: Ranger green, Flat dark earth, Dark gray, Black, Multicam Black, Multicam OCP or Urban digital (patterns are printed on the uniform, carrier and helmet). Lens colour from presets or a colour picker. Choosing the thermal poncho puts on a hooded poncho with the front flap thrown over the left shoulder, Poncho-Villa style, so the chest rig stays clear. Both wear a plate carrier with a mag shingle, admin pouch and radio, plus the M18 in a drop-leg holster, and you can see your kit on them: a quadcopter or hunter-drone launch tube on the pack, dart canisters, a jammer, smoke cans, a rolled decoy, a suppressor or anti-glint cover on the rifle. Prone, the operator is up on the elbows with the eye behind the scope. It's cosmetic; Loadout shows a 3D preview you can drag to turn, and your opponent sees what you picked.
  - **Stealth (passive):** Thermal poncho (default; hidden from thermal and only weakly tracked by the hunter drone; 10% slower, you can still sprint; it shows as a foil-lined hooded poncho on your operator), Suppressor (no flash, quiet; 12% slower bullets), Anti-glint cover (no glint; narrower, darker scope) or UAV jammer (hides you from one UAV sweep).
  - **Tactical (G):** Smoke grenades ×2 (25 s screen that blocks sight, not bullets) or Decoy (a fake prone sniper with a fake glint; shooting it reveals where you fired from).
- The AI gets a random loadout each round and uses its tools: it flies drones, plants darts, smokes when it relocates, leaves decoys behind, and shoots down drones that come close.
- **Uplinks A / B / C** are in the town, on the dam and at the ski-lift station. Stand in the ring for 8 s to capture one. A capture pings your enemy's position three times. If time runs out, whoever holds the most uplinks wins the round.
- Every kill plays a **killcam** (through the shooter's scope) and then a slow-motion **bullet-cam**.

### Ballistics

- Projectiles are simulated with gravity, quadratic drag and wind. Muzzle velocity is 720 m/s, so a 700 m shot takes about 1.2 s.
- **Zeroing** runs from 100 to 1000 m. The scope uses a true mil reticle, so holdover is correct at every zoom level.
- **Wind** varies per round and gusts over time. Read it from the flags, the smoke column in town, drifting embers and the swaying grass and trees. It never appears on the HUD.
- **Scope glint** appears when an opponent is scoped in and pointed at you. It is stronger at higher zoom (12× most, 4× least) and stronger with the sun behind you.
- **Sound**: a near miss gives a supersonic *crack*, followed by the muzzle *boom* travelling at about 343 m/s. The gap between them tells you the range.
- Trees conceal you but don't stop bullets. Rocks, walls and buildings do.

### Touch controls

- Controls sit in arcs around where each thumb rests, inset from the corners and clear of notches. A fixed joystick sits bottom-left; push it fully forward to sprint. Zero −/+, Range and the weapon swap sit in an outer ring around the right-hand FIRE button. The left thumb also has a second **FIRE** and a **BREATH** toggle, so either thumb can aim while the other fires.
- Drag anywhere that isn't a button to aim. Left and right thumbs each have their own sensitivity in Settings.
- **SCOPE** (just above FIRE, the same size as RELOAD) and **BREATH** are toggles. Breath releases itself when you unscope or run out of air. **RELOAD** sits to FIRE's left.
- **Gyro aiming** (Settings): Off, When scoped (default on phones) or Always, with its own sensitivity and invert. It needs HTTPS, so it works from the hosted page, not an opened file. iPhones ask for motion permission the first time.
- Pills along the top hold your tools (with charges), kit, the Predator feed and the menu.

### Tablet + mouse (iPad with an MX Master, Magic Trackpad, etc.)

Click the game view with the mouse and it switches to mouse mode: the mouse aims (pointer lock where the browser allows it), left button fires, right button scopes (toggle or hold, per the Toggle scope setting), the scroll wheel zooms, and the horizontal scroll (the MX Master's thumb wheel) dials the zero. Middle click = rangefinder, back button = reload, forward button = swap to the pistol. The touch stick and buttons keep working, so you can move with your thumb and aim with the mouse, or plug in a keyboard for WASD.

### Controls

| Action | Keyboard / mouse | Touch |
|---|---|---|
| Move / sprint | WASD / Shift | Left stick / RUN |
| Fire / scope | LMB / RMB (hold, or toggle in settings) | FIRE / SCOPE |
| Zoom 4·8·12× | Mouse wheel | + / − |
| Hold breath | Shift while scoped | HOLD BREATH |
| Zero − / + | Q / E | Z− / Z+ |
| Crouch / prone / jump | C / Z / Space | CRCH / PRN / JMP |
| Rangefinder / reload | F / R | RNG / R |
| Rifle / pistol | 1 / 2 (or wheel when not scoped) | 1 / 2 |
| Scout / tactical tool | T / G | TOOL T / TOOL G |
| Loadout (insertion) | L | KIT |
| Predator feed | U | FEED |
| Supply drone | V | SUPPLY |
| Bipod (prone, stopped) | X | BIPOD |
| Pause menu | Esc | II |
| Sandbox tools | B | TOOLS |

## NightWatch (co-op)

A night stealth mode for one or two players, built around the feel of a classic night sniping level: a dark valley, a lit compound below, a suppressed rifle with a night-vision scope and a white vapour trail on every shot. Its rules are adapted from **Cold Archive**'s co-op infiltration (agent + Overwatch, SENTINEL's alarm, bandwidth-based payloads). The players use the duel's operator models in Multicam Black. The shooter wears a chest rig and a dark urban-digital poncho; the spotter wears a plate carrier and a cap.

Pick **NIGHTWATCH** (the cyan button) on the main menu, then a mission, the **staging area** loadout, and how to play.

**Play it:** [r0n1n9.github.io/snipercellnightwatch/#nightwatch](https://r0n1n9.github.io/snipercellnightwatch/#nightwatch) opens NightWatch with the Sentinel mission selected. Use `#infiltration` for the other mission.

### Missions

- **Sentinel** (default): SENTINEL's augmented night garrison.
  - **Officers:** human-sized and cowardly. They flee when they're alone, when shot at, or when they lose their pack leader.
  - **Juggernauts:** a recharging energy shell. When it breaks, they berserk with an energy blade.
  - **Bulwarks:** behind a hard-light wall. Snipe through its sight-port, or catch them when they lower it to fire. Tower bulwarks carry beam rifles and you see a red laser before they fire.
  - **Titans:** heavy armour. Body hits do half damage, and a helmet eats the first headshot; the follow-up kills.
  - **The Overseer:** a shielded, helmeted commander carrying a master badge that opens every rack room.
- **Infiltration:** the same op against human guards.

Headshots kill anything except a helmet's first hit.

### How to play

- **Solo · AI partner:** the AI plays the other role.
- **Solo · lone operative:** one sniper carrying both kits.
- **Co-op:** the host picks a role and the friend who joins gets the other.

### Mission

1. Breach the fence.
2. Plant the relay in the Electrical Room.
3. Find a keycard in the office drawers, or take the Overseer's master badge.
4. Find the server.
5. **Upload:** the spotter jacks in with the signal-lock minigame, then holds the rack.
   - A clean lock means a silent upload: no trace and no alarm, so you can walk the drive out.
   - Three misses trips SENTINEL's **ICE**. The upload still forces through, but the outside guards and a fireteam take posts around the building walls, and the guards inside search their floors. Sneak out between them, or go loud.
6. **Extract:** the drive-release minigame.
7. **Exfil:** carry the drive to the **extraction van** on the east track. It shows on whoever carries it; drop it with **J** for your partner to pick up. The spotter drives and the shooter rides shotgun.

### If ICE trips

1. **The report:** ISR Overwatch reports it, and the operators talk it over on the radio.
2. **The vote:** each player votes **QUIET (1)** or **LOUD (2)**, or taps the buttons.
   - The AI partner backs your call. In co-op, both players have to agree.
   - If there's no agreement when the clock runs out, you stay quiet.
3. **The sweep:** squads peel off the ring and clear the building room by room, ground floor first, then upstairs.
   - Quiet is hide and seek: the shooter has camo, and the spotter has to stay nimble.
   - Let a sweep walk past you and you'll hear about it. Get out through the ring and Overwatch sends you to the van.
4. **The music:** a tense score plays while they sweep. Once they spot you, it switches to a full combat score with drums, choir and brass.
5. **The console:** ICE also knocks the CYBER OPS tablet offline: it's all static and its network payloads are blocked. Quickhacks by line of sight still work.

### The building

The data center has **two storeys** with two stairwells. Guards, cameras and patrols are on both floors.

- **Rack rooms:** six of them, behind **keycard doors**. Each door takes its own keycard, shown by a coloured tag on the reader and above the door (red, orange, yellow, green, blue, violet). Either player can swipe.
- **Office drawers:** eleven desk drawers on both floors. Six of them hide the keycards; the rest hold junk. Searching takes a second and makes a little noise.
- **Rooms you can use:**
  - Storage shelves (upstairs): ammo for both weapons, one haul per shelf.
  - The break-room fridge: +40 HP, three servings.
  - The comms rack: hack it in person and guards can no longer radio for backup.
  - The CCTV desk (Security / CCTV, ground floor): hack it in person and every camera is looped for SENTINEL and feeds your console. The cameras still see you, but nobody hears about it.
- **The archive server:** in a random rack room. Find the cabinet with the slow amber beacon.
- **Lights:** every lamp and ceiling panel can be **shot out**.
- **IoT devices:** vending machines, printers, coffee machines, speakers, a TV and server fans. Hack them from the tablet or with a quickhack to make a distracting noise.

**Cyber inside the building:**

- Cut-lights blacks out the whole room.
- An EMP fills the room: it drops shields, bulwark walls, cameras and lights.
- **Supply drops can't land through a roof.**

### Security layout

**Outside the fence:**

- Snipers in all four watchtowers.
- A drone orbiting beyond the wire.

**Inside the fence:**

- Two guards walk the perimeter just inside the fence.
- Drones patrol the yard.
- Packs and patrols work the yard.

**Static posts:**

- Sentries outside the front, side, maintenance and dock doors.
- An operator at the CCTV desk.
- Someone on break upstairs.
- Sentries in the corridors outside the rack-room doors, on both floors.

**Inside the building:** patrols on both floors.

**Drop point:** the NightWatch menu shows a briefing map of Kestrel Ridge. Pick where you go in, on the map or with the buttons under it. When you host, your pick applies to both of you.

- **Tree line** (the default, described below): the van drops you in the woods south of the ridge.
- **North ridge**: a HALO jump onto the ridge behind the tower, looking down on the back of the building and the north towers.
- **Tower roof**: a HALO jump straight onto the roof, then down the service hatch (hold E) onto the data floor. The same hatch takes you back up.
- **West knoll** / **East knoll**: a HALO jump. The intro shows a transport droning in with the ramp down, the jump light going green, freefall (with a point-of-view shot and an altimeter), canopies opening, a point-of-view shot under canopy, and the landing on the knoll. You hear the engines, the wind in freefall, the canopy snap and flutter, and the landing.

**Layout:** **Standard layout** is the map as built. **Random layout** scatters the yard's cover (containers, trucks, HVAC, generators, sandbags, crates), the light poles and the west fence cut from the game's seed, so both players get the same compound. Roads, doors, guard routes, the towers, the barracks and the drone bay stay clear.

**The building** is a tower. The lobby floor is at ground level and the data floor is about 24 m up, with empty storeys of dark office glass between them.

- **Getting up:** take the **elevator** (stand in the car and press E, or press E at a landing to call it) or climb the **stair tower** (eight switchback flights).
- **Lobby:** a **security checkpoint** sits just inside the front doors. Walking through the metal detector sets it off: a buzzer, a noise the guards come to, and a jump in SENTINEL's alert. Step round the ends of the rope barriers instead. Hacking the CCTV desk switches it off. An officer works the checkpoint desk and another watches the elevator.
- **Ground floor:** security / CCTV, electrical (relay), the mailroom, the guard room and the plant room.
- **Data floor:** the three rack rooms (keycard doors), offices, the break room, comms and storage. The archive server is always up there.

**The approach:** the van drops you in a wooded draw south of the ridge. Walk north up the draw, using the tree line as cover (tree crowns block sight), over the crest and out to the cliff that overlooks the compound. Four or five **pickets** hold the draw: a sentry at a sandbagged observation post, two walkers on the valley floor, a lookout below the crest and sometimes one on the tree line. Each one that spots you radios it in, so take them quietly. The objective board counts the ones left until you're over the crest. An AI partner walks the draw with you (crouching when you do) and moves to its post once you crest the hill.

The garrison is kept lean, about 34 in NightWatch and 28 in Infiltration, and spread out: no two starting guards stand within about 9 m of each other, except a pack leader and its follower.

### Guards notice

- Guards who see a comrade drop, or find a body, walk over to check it.
- Then they get on the radio for backup, with the weapon slung low. Drop them first, jam them, or hack the comms rack.
- Shooting out a light brings nearby guards over to look.

### Sabotage

- **Barracks:** reinforcements and backup fireteams only come out of here.
  - The spotter can hack the door panel to lock them in for 90 s.
  - The shooter can plant **C4** to end it for good.
- **Drone bay** (west yard): replacement patrol drones launch from its pad.
  - Hacking its control panel grounds it for good, and so does C4.
- **Planting C4 alerts every guard on the map.** The fuse is 6 s, so get clear.

### Stealth

- **Radio for backup:** a guard who spots you radios after 1.5 s (watch for the ((•)) icon). The call brings a fireteam from the barracks to your position. Drop the guard first, jam his comms, or hack the comms rack so nobody can radio at all.
- **Breaking contact:** the HUD shows DETECTED, then HUNTED. Break line of sight for long enough and the hunt is called off. While they hunt, a **white silhouette** marks your last known position.
- **Light and night vision:**
  - **N** to reach up and pull the goggles down: your hand comes up, the goggles flip down with a click and a tube whine, and the picture irises open as the tubes warm.
  - The goggles and scope are smooth, near-white phosphor with a slight blue cast.
  - Bright lights, including a weapon light in your face, wash it out.
  - **IR strobes** on both operators' helmets and shoulders flash about once a second, and **IR lasers** come from both weapons. They show only in night vision (goggles, the NV scope, the recon quad) and the ISR's IR view. Both the IR and red lasers always come out along the muzzle, so they swing low with the weapon while you run. The strobes keep a minimum size on screen, so you can pick out your partner across the compound and the ISR sees both operators from altitude.
- **Weapon lights (L):** a weapon light makes you easy to see. Guards also walk over to wherever the beam lands, so it works as a distraction.
- **Sync shots:**
  1. Look at an enemy and **hold F** (or tap SYNC on touch) to mark it for your teammate: a pulsing circle sits over its head. The wheel's SYNC option works too.
  2. Put your own crosshair on another enemy's head. You don't need to aim down sights. Your teammate holds theirs on the marked one, or an AI Ra takes it.
  3. When both crosshairs are on heads that die to one shot (no helmet), a solid **FIRE** block locks on, both weapons fire on their own, and both enemies go down.
  4. With an AI partner and two marks, the AI takes the **first** one you marked and you take the **second** (the tags read SYNC 1 · ALLY and SYNC 2 · YOU). An AI Ra fires from his rifle at any range; an AI Rōnin takes his with the pistol out to about 75 m.
- **Firing:** hold the trigger and every weapon keeps firing at its own rate (semi-autos and the bolt gun as fast as they cycle; burst mode repeats bursts).
- **Downed but alive:** a body-shot kill leaves an enemy down but alive. It's out of the fight, but the reticle still goes red over it. Headshot it on the ground to finish it, and your character calls "X-ray down".
- **Radio chatter:**
  - Operators call fresh contacts in their field of view: "Contact, north-east, 60 meters".
  - When your partner drops an enemy you pinged, they call "X-ray down". Marking an enemy gets no spoken acknowledgement.
  - Switching on night vision sometimes gets a "Going dark".
- **Zoom:** the ISR sensor zooms smoothly from 40° to 1.8° (wheel, + / −, hold [ or ], pinch, or the ZOOM pills on touch), with a zoom ladder on the right of the view. On the tablet, pinch or scroll the map, and zoom the live camera / bodycam feed up to 6× with its ＋ − buttons, the scroll wheel or a pinch (double-click resets).
- **HUD:**
  - The comms log fades after a few seconds; the tablet keeps the full log.
  - **O** shows or hides the objective board, and **P** expands or compacts it.

The **Staging area · Loadout** screen shows each operator in full kit on a turntable (drag to turn; tabs switch between shooter and spotter).

### Shared kit

- **Tablet / map / ISR:** your weapon drops away, your left hand brings the tablet up until it fills the view, and the screen flickers on. On the tablet, the ISR button flips to the Predator feed (both roles), and TAB flips back.
- **Laser sights (` or LASER):** a visible red laser from your weapon, on by default. Your partner sees yours; guards can catch it too.
- **Body drag (hold E on a body):** drag it out of sight, then let go. You move at half speed while dragging.
- **Bodycams:** both operators' head cams show as small squares in the ISR view. Turn on **Partner bodycam** in the pause menu to keep your partner's in a corner of your screen.
- **Spotlight drones:** a helicopter drone circles high over each way in (west, east and south), sweeping a spotlight across the ground. Stand in the light too long and it locks on: an alarm, and every guard near you comes. Stay out of the light, or shoot it down. The wreck makes a crash the guards nearby hear.
- **Look:** both operators wear multicam black with flat dark earth load-bearing kit (carrier, rig, belts, straps) and IR-reflective red markers. The shooter has a clear coiled earpiece under the hood; the spotter has a ball cap and an FDE headset with a boom mic.

### Roles

**Shooter** (default callsign **Ra**):

- KR-50 Nightjar: bolt-action, integrally suppressed, with Halo-style hitscan and a night-vision scope. Press **N** (the NV button on touch) while scoped to switch the scope between night vision and plain vision. When an operator sprints, their third-person model drops the weapon to a low carry, matching the first-person view, and brings it back up when they stop.
  - Dead-on through the scope, wide from the hip (the crosshair opens to show it), with a real kick.
  - **Standard bolt** (default): tap fire and you come off the glass to work the bolt; keep fire held to stay scoped. The **straight-pull bolt** (Staging area) cycles while you stay on target.
  - **Collateral:** every KR-50 round carries on through bodies (losing some punch each time). Walls stop it unless it's a penetrator.
  - **Z: rounds menu** (left of the screen; 1–4, click or tap). Each swap is a full reload animation, and supply crates restock the special rounds.
    - **Standard:** the default round, with collateral.
    - **Explosive:** sticks where it hits, blinks for a second and blows. It kills a juggernaut or titan it's stuck to and catches anything within about 5 m. Loud.
    - **Penetrator:** punches through walls and doors, exterior walls and bulwark shields included.
    - **EMP:** kills drones, cameras, lights, shields and radios around the hit (non-lethal to people).
  - **Breath and wind:** hold **SHIFT** on the scope to steady it (a few seconds, then a cooldown). The scope shows the crosswind and a hold-off dot for the range; the round drifts with the wind.
  - **Recoil and noise:** the rifle kicks. Its suppressed crack and the M50's still carry a short way, fading with distance (startling anyone very close); beyond that they're silent.
- **Ghillie freeze:** prone and dead still for two seconds and you all but vanish past ~15 m. Move or fire and it breaks.
- **Marked for death:** three kills on tagged enemies, each within 10 s of the last, give you Deadeye back and a full camo battery.
- **Overwatch lock:** hold the scope steady on an area for 1.5 s and everything around your point of aim is marked for the team while you hold it. Your partner sees the ring.
- **Counter-sniper read:** the tower snipers' sightlines show to you as red lasers.
- **Spotter relay:** tagged enemies off your screen get an arrow at the edge with their range.
- **9: camera darts** (three): fire a tiny camera into a wall or the ground. It marks enemies in front of it and appears on the tablet map; click it to watch its feed.
- **First-use hints:** the first time you use an ability, a short card explains it.
- Secondary: the **K9 HUSH SMG** (40-round magazine; full / burst / semi) or the **M50 Magnum** (7 rounds, slow and heavy: a deep boom, a big kick and a wide hip spread, so aim down sights or get close). Its suppressor is fitted by default and removable: your support hand comes up to the muzzle and twists the can off and pockets it (or threads it back on). You can't fire mid-gesture.
- **Stealth kit:**
  - **G** active camo. **Firing breaks it.**
  - **H** Deadeye (Splinter Cell style): sweep your crosshair over up to three enemies to mark them, then pull the trigger. Ra drops the KR-50 to his left hand, draws the M50 and puts a round in each marked head, one after another.
  - **X** lures.
  - **T** Mark & Execute.
  - **E** knife takedown.
- **Requests at the crosshair:** keys **3–8** request supply, scan, EMP, decoy, lights or the recon drone on the spot you're aiming at. On touch, press and hold empty screen, drag to a request and lift.
- **Ping and mark (Q, or PING on touch):** tap on an enemy to mark it; tap on open ground for a PING marker; hold for the ping wheel. **F** is the sync mark.
- **Knife (V, or KNIFE on touch):** a strike on whoever is within arm's reach in front of you. From behind, or on someone who hasn't noticed you, it's a silent takedown; head-on it's a heavy wound.
- **Firing while running** drops you out of the sprint and the shot goes; **running doesn't break a reload**.
  - The shooter can't unlock doors, only walk through ones that are already open.

**Spotter** (default callsign **Rōnin**):

- P-9 pistol (2 magazines) with a removable suppressor (**B**: animated twist off / on).
- **Eyes on:** anything in your field of view, in the clear and within about 40 m (60 m aimed), is marked for the team while you can see it, like the quad's neurolink. Your crosshair on an enemy tags it at once with a ping. Sight marks don't send an AI Ra after them; tag with F or ping ENEMY for that.
- **Commands at the crosshair:** outside the tablet, number keys **1–9** fire the tablet's payloads (same numbering: scan, jam, EMP, supply, cut lights, spoof cams, decoy, recon drone, medevac) at the spot you're aiming at, with the phone animation. **0** (or the SWEEP button) calls an **ISR sweep** on the ground under your crosshair.
- **Command wheel (touch):** press and hold on empty screen, drag toward a command and lift: it drops on your crosshair. Hold TAB / HACK and aim at open ground for the same commands as a list.
- **Recon drone:** G (desktop) tosses it up out of your left hand before the feed cuts in. Hold G to recall it: it flies home with a RECALLING overlay on screen. Enemies inside its faint, breathing red view cone are marked, and both players can see the cone from outside.
- **Recon drone to a spot:** drag RECON DRONE from the tablet onto the map (or fire the drone command at your crosshair) and it launches, flies itself there at about 9 m and holds, marking what it sees. G takes the sticks; hold G recalls it.
- **Thermal binoculars (X or BINO):** swap from the P-9 to binoculars held low in both hands. Raise them (scope) for a grey thermal view where every warm body glows red, and every enemy in the viewfinder is marked, at any range.
- **Tablet:** pinch, scroll or double-tap to zoom the map (it zooms around your fingers / cursor). **Drag a payload** from the side panel onto the map to drop it there; the shooter can drag a request onto the map the same way.
- **TAB:**
  - **Tap** for the tablet. Tap again for the ISR view, and again to return to first person.
  - **Hold** for **quickhacks**: your left hand brings up your phone and the HUD switches to scan mode (time slows in solo). Everything hackable in view gets tagged.
  - Look at a target, pick a hack (mouse wheel or 1/2) and click or press E. Your thumb taps the screen and the hack uploads.
  - Hacks: loop a camera, short-circuit a drone, open an electronic door, cut a light, set off an IoT device, or jam a guard's comms / reboot his optics (blind for 6 s).
  - **Commands:** look at open ground instead and the menu becomes **Commands** for that spot: supply drop, pulse scan, EMP, decoy, cut lights or recon quad. The phone comes up, your thumb taps, and it lands where you're aiming. Ping-wheel requests get the same quick phone gesture.
  - On touch, tap an option row to pick it and run it.
  - Quickhacks still work when ICE knocks the console offline.
- **Lock-pick set:** mechanical locks (maintenance and side doors) can't be hacked; the spotter picks them in person. Electronic locks (front, dock) open over the network, from the console or a quickhack.
- **CYBER OPS tablet:** a map of both floors, with payloads (pulse scan, jam, EMP, supply drop, cut lights, spoof cameras, decoy, quad, medevac), door and camera hacks, and camera feeds.
- **Recon quad (Q):**
  - **Neurolink:** every enemy the quad can see within 45 m is marked for the team, with a lock-on animation and a red silhouette through walls. The mark stays as long as the quad keeps line of sight.
  - **Controls:** tap G to park it; parked, it keeps marking. Tap G again to fly it. **Hold G** (or RECALL) for a quick calldown. (A lone operative uses Y.)
  - **Battery:** long-lasting; it recharges while the quad is home.
  - **Noise:** the rotors are loud, so guards within about 10 m hear it.
- **ISR Predator** (I): a high-altitude drone orbiting the map. Slew its sensor with the mouse; it has IR (white-hot) and EO modes. Tag, ping and request from it.
  - **P (SWEEP)** runs a ping sweep: a circle on the ground that marks every unit inside it, people and machines, for 15 s, with red silhouettes through walls.
  - The tablet's pulse scan only hears electronics (drones, cameras, devices).
- **SNIPER POS** on the ping wheel asks the shooter to set up at a spot. It works from first person, the ISR cross or the tablet map. An AI shooter relocates there.
- The HUD shows both interfaces as small live squares; tap one to open it.

**Staging-area perks:** extra lures, extra magazines or fast camo for the shooter; bandwidth, logistics (+2 drops) or light armour for the spotter.

### Down, not out

- **Bleeding out:** a downed operator has 30 s.
- **IFAK:** each operator carries one. Patching up your partner uses yours; after that, only the medevac drone can get them up.
- **Calling for help:** while downed, press **V** or **HELP** to radio for a pickup. An AI partner sends the medevac drone.

### Comms

- **Pings and requests:** tap V or PING for a quick ping. Hold for the wheel: LOOK, ENEMY, MOVE, HOLD, ON ME, COVER, SYNC and SNIPER POS, plus SUPPLY, SCAN, EMP, DECOY, LIGHTS and DRONE requests. The spotter approves with Y / SEND.
- **Radio:** operators and ISR Overwatch talk over a tactical squad net, in short, clipped lines with a beat between transmissions. Turn **Radio voices** off on the NightWatch screen or in the pause menu to get subtitles only.
  - Every scripted line is pre-recorded with neural male voices, one per speaker: Ra (deep American), Rōnin (American) and Overwatch (a low, calm American dispatcher). Voices are pitched down with their character preserved, at a natural, unhurried pace.
  - The recordings get a radio treatment: mostly the natural voice with a lighter Codec2 digital-radio layer, band-limited to radio width (300–3400 Hz), with presence and compression.
  - In the game each line opens with a mic click and a burst of static, sits on a crackling static bed with dropouts, and ends on a squelch tail; Overwatch adds a talk-permit chirp.
  - Every line is **subtitled** as a terminal entry: the callsign, then the line typed out, cleared when it ends. Overwatch opens each op with a short, clipped brief. A line without a recording, or the offline single-file build, falls back to the browser's own voice.
- **Chat:** text chat on Enter. Voice chat (M / K) works in online co-op.
- **Cut-scenes:**
  - Opening: drive in, gear up, walk out. The van has its own sound: tyre and gravel roar, a quiet electric whine, a brake creak, door latches and slams, and the rustle of kit going on.
  - Ending: a sunrise on an open road under a striped, retro sun.
  - The title reads SNIPER in white, CELL in red and NIGHTWATCH in cyan.

### Audio

Play with headphones. Every sound is positioned in 3D (HRTF panning):

- Guard footsteps, muffled when they're behind a wall.
- Radio squelch from alerted guards.
- Patrol-drone rotor hum.
- Your partner's footsteps.
- Shots, impacts and C4 blasts.

### NightWatch controls

| Key | Shooter | Spotter |
| --- | --- | --- |
| Mouse / right-click | Aim / scope | Aim / aim down sights |
| 1 / 2 | Rifle / sidearm | — |
| B | Fire mode (SMG); hold for the suppressor | Suppressor |
| TAB | Map | Tap: tablet → ISR → back; hold: quickhacks |
| Q | Ping / mark an enemy (hold: wheel); downed: call for pickup | Same |
| G | Active camo | Recon drone (tap: launch / park / fly; hold: recall) |
| H / X / T | Deadeye / lure / Mark & Execute | — |
| E | Use, knife takedown, plant C4 | Use, pick locks, hack stations |
| F | Sync mark on the enemy under your crosshair | Same |
| V | Knife strike | Same |
| X | (Lure) | Thermal binoculars |
| Z / 9 / ` | Rounds menu / camera dart / laser | — / — / laser |
| SHIFT | Hold breath (scoped) | — |
| Y / U | Acknowledge | Approve / deny requests |
| I | — | ISR view (P: ping sweep) |
| N | Night vision | Night vision |
| L | Weapon light | Weapon light |
| J | Drop the drive | Drop the drive |
| O / P | Show / expand the objective board | Same |
| Enter / M / K | Chat / mic / push-to-talk | Same |

The lone operative carries both kits. Shift+E plants C4.

**Esc pauses** (❚❚ on touch). Resume, or **Exit to main menu**. In solo play the mission freezes while paused; in co-op it keeps running.

**On an iPad or a phone:**

- The action buttons sit in a strip along the bottom centre, like the desktop key hints, between the move stick and the fire buttons. They cover every action, including TABLET, HACK, ISR, SWEEP, QUAD, RECALL, SYNC, HELP, LIGHT, DROP, PING, TAG, USE, SUPP, NV and CHAT.
- The Auto preset gives iPads Medium, with a capped render resolution.
- For better radio voices, install enhanced male voices: Settings → Accessibility → Spoken Content → Voices → English, then Aaron, Arthur or Evan (Enhanced).

### Atmosphere

- **Visuals:** dust motes, low mist, fireflies and moths around the lamps, here and in the valley duel (`src/atmofx.js`).
- **Night soundscape** (`src/cell/ambient.js`): no constant hum or tones.
  - Outdoors: wind that gusts and settles, trees stirring with it, insects chirping around you, and now and then a distant owl, dog or high aircraft.
  - Indoors: the outside fades to quiet air handling, with more airflow in the rack rooms.
- **Drones:** patrol drones and your quad make a soft rotor whoosh. Only the two nearest drones are audible.
- **Radio discipline:** about half of kills get an "X-ray down" (at most one every 10 s). Contact callouts, routine ping voices, Overwatch's spotted and clear calls and "Going dark" are occasional and rate-limited. Guards' radio squelches are sparse and close-range.

### Code

The code is in `src/cell/`:

| File | Contents |
| --- | --- |
| `facility.js` | Two-storey map, navigation, lights, keycards and room stations |
| `sentinel.js` | Enemy roster, AI, backup and hunt |
| `kit.js`, `kit2.js` | Stealth kit, pings, van, IR, sync shots, weapon lights |
| `isr.js` | The ISR drone |
| `minigame.js` | Server minigames |
| `arms.js` | Sidearms and loadouts |
| `voice.js` | Radio voices |
| `irfx.js` | IR strobes, lasers and last-known-position ghosts |
| `ops.js` | Payloads and the AI spotter |
| `tablet.js` | The CYBER OPS console |
| `cinema.js` | Cut-scenes |
| `chat.js` | Text and voice chat |
| `ice.js`, `music.js` | The ICE vote, sweep and radio, and the procedural score |
| `neuro.js` | The recon quad's neurolink marking |
| `nvg.js` | The night-vision gesture and warm-up |
| `spatial.js` | Positional audio cues |
| `ambient.js` | The night soundscape |
| `phone.js` | Quickhacks (TAB hold) |
| `van.js`, `wheel.js`, `sfx.js` | The van, the ping wheel and synthesized sounds |
| `cell.js` | Game loop, roles, netcode, objectives and HUD |

## "Do you want to develop an app?"

A second mode, chosen by the host under **Mode** on the main menu (a guest just joins as usual). It starts as the classic duel.

<details>
<summary>Spoilers: what the mode actually does</summary>

The first time one sniper shoots the other, the game is "hijacked": a cheerful dialog asks *Do you want to develop an app?*, answers itself, and builds a different world around both players. From then on every point lands the match somewhere new — a different perspective, setting, set of controls and loadout each time — through a cinematic transition, until someone reaches the points target (first to 7 by default; **Points to win** appears next to the mode).

- Worlds so far: the valley, a neon top-down arena, a WW2 town square, a pixel-art canyon, an ASCII terminal and a manga street duel. Each one shows its controls on arrival.
- Nothing differs from the classic game before the first kill, so it works as a surprise.
- The owner's menu: tap the small red **REC** light in the corner of the briefing map (on narrow screens, the red dot beside `v1.0`). Tick which worlds and transitions the mode may use when you host or play solo, or press ▶ to play one world on its own against the AI or preview a transition. The light is not shown on an invite link. The first match a device hosts plays the surfing world and then the underwater world straight after the first kill (once both are finished); a tick box in the same menu re-arms that for the next hosted match.
- Open the page with `?lab` to get a **Lab** button that opens the same menu and also lists worlds still being built.
- The code lives in `src/multiverse/` (`contract.js` documents how worlds and transitions plug in; `tools/mv-test.mjs` plays them headlessly; `tools/multiverse-briefs/` holds the design briefs).

</details>

## Single-file version

`dist/sniper-cell.html` is the whole game in one file. Double-click it to play, or send it to a friend; it needs an internet connection only to find the other player. Since a file has no web address, the host shares the 5-letter code rather than a link. Rebuild it after code changes with `npm install && npm run build:single`.

## Hosting

The game is a static site with all dependencies vendored in `vendor/`, so there's no build step.

- **GitHub Pages**: Settings → Pages → deploy from branch, root folder.
- **Any static host** (Netlify, Cloudflare Pages, Vercel) works too.
- **Locally**: `python3 -m http.server 8080`, then open `http://<your-ip>:8080` on each device on the same Wi-Fi.

Matchmaking uses the free public PeerJS broker only to exchange connection details. Gameplay traffic goes directly between the two devices, with a TURN relay as fallback on restrictive networks.

**Testing on one machine:** add `?local=1` to the URL and open two tabs. The tabs then talk over `BroadcastChannel` instead of WebRTC.

## Radio voice lines

`audio/vo/` holds the NightWatch radio lines, rendered with [Kokoro](https://github.com/thewh1teagle/kokoro-onnx) (Apache-2.0) and processed with ffmpeg. The script list is `tools/vo/lines.py`; to add or change a line, edit it there (keep the text identical to the game's), then run:

```
pip install kokoro-onnx soundfile        # plus ffmpeg
python3 tools/vo/generate.py kokoro-v1.0.int8.onnx voices-v1.0.bin
```

The two model files are on the kokoro-onnx releases page. Existing clips are kept; only new lines are rendered.

## Graphics presets

**Auto** picks a preset based on the GPU (iPads get Medium, with the render resolution capped on touch devices):

- **High**: Apple Silicon Macs and discrete GPUs. Shadows, MSAA, bloom, ink outlines and the full grade.
- **Medium**: phones, iPads and mid-range GPUs.
- **Low**: older integrated GPUs such as Intel HD 4000. No post-processing, fewer trees, no grass.

Resolution also scales dynamically to hold the frame rate. You can override the preset under Settings in the menu.

## Code map

| File | Contents |
|---|---|
| `src/main.js` | Menu, settings, host/join flow |
| `src/game.js` | Game loop, host-authoritative rounds, shooting, hit registration, uplinks, post-processing |
| `src/world.js`, `src/terrain.js` | The valley: terrain, town, dam, ski lift, ridges, vegetation, flags |
| `src/atmosphere.js` | Dusk and golden-hour palettes, height-based haze, sky |
| `src/ballistics.js` | Projectile integration, wind, zero tables |
| `src/bot.js` | AI opponent (plugs in where the network peer would) |
| `src/weapons.js`, `src/viewmodel.js` | Weapon stats; first-person weapons and arm rig with animations |
| `src/tools.js`, `src/loadout.js` | Loadout tools, Predator UAV, loadout picker |
| `src/sandbox.js` | Sandbox tools panel |
| `src/killcam.js` | Replay histories, killcam and bullet-cam |
| `src/hud.js`, `style.css` | HUD, scope reticle, compass |
| `src/briefmap.js` | Topographic briefing map drawn from the real terrain |
| `src/net.js` | PeerJS / BroadcastChannel transport |
| `src/config.js` | Gameplay tuning |
| `src/cell/` | NightWatch: Sentinel / Infiltration missions (co-op stealth mode; file list under [NightWatch › Code](#code)) |
| `src/atmofx.js` | Atmospheric particles (motes, mist, fireflies, moths) shared by both modes |

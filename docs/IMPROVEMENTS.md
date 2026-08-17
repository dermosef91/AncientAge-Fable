# Ancient Age — 30 Improvement Proposals

A design backlog grounded in the current code (`src/`, ~11.7k lines). Each entry
states the gap as the game stands today, what to change, and roughly where the
work lands. Tags: **Impact** (how much it changes the feel of a match) and
**Effort** (S / M / L).

---

## A. Combat & units

### 1. Damage classes and a counter system
**Gap.** `dealDamage()` (`src/sim/sim.ts:733`) is flat: `max(1, rawDmg - armor)`.
Every unit beats every other unit by raw stats, so the optimal army is always
"the strongest unit I can afford". Composition never matters.

**Change.** Add `armorClass` (`infantry` / `ranged` / `cavalry` / `siege` /
`building`) and `bonus: Partial<Record<ArmorClass, number>>` to `UnitDef`
(`src/core/config.ts:41`). Spearmen get a large bonus vs `cavalry` (the War
Chariot finally has a hard answer), archers a bonus vs `infantry`, chariots a
bonus vs `ranged`. Also split armor into melee/pierce so a Hoplite can be a wall
against spears while still folding to massed archers.

**Impact** High · **Effort** M — one function plus a data pass, but it rebalances
everything downstream and the AI's `military()` needs to read it.

### 2. Unit upgrade lines
**Gap.** A Stone/Tool-age Spearman is the same Spearman in the Iron Age. The only
progression is the global `bronze` / `shields` techs.

**Change.** Per-age in-place upgrades researched at the producing building —
Spearman → Pikeman, Archer → Composite Bowman, and an elite tier of each civ's
unique unit (Chariot → Royal Chariot, etc.). Reuse the existing `upgradesTo`
pattern already implemented for shrine → temple (`src/core/config.ts:150`,
handled in `src/sim/sim.ts:142`), applied to units instead of buildings.

**Impact** High · **Effort** M

### 3. Siege units and a Siege Workshop
**Gap.** A Town Center has 1800 HP and towers out-range every unit except the
chariot. Ending a game means grinding melee into stone, which is the least
interesting thing the combat model does.

**Change.** New building `siegeworks` (Bronze Age) training a **Battering Ram**
(slow, huge bonus vs `building`, near-immune to arrows) and a **Catapult**
(outranges towers, friendly fire, tiny HP). This is where the counter system from
#1 pays off: siege beats buildings, cavalry beats siege.

**Impact** High · **Effort** L — new models in `src/render/models.ts`, new
projectile arc kind, AI logic to actually field them.

### 4. Veterancy
**Gap.** There is no reason to preserve an army; losing 10 spearmen and rebuilding
costs nothing but resources.

**Change.** Track `kills` on `Unit`; at 2 / 5 / 10 kills grant rank 1–3 (+8% HP,
+8% damage each), drawn as small chevrons or a shield tint on the model. Pairs
naturally with the Temple heal aura — suddenly retreating wounded veterans to a
Temple is a real decision.

**Impact** Medium · **Effort** S

### 5. Unit stances
**Gap.** `Unit.hold` (`src/core/types.ts:86`) is a single boolean, and `post` is
already a leash anchor — the scaffolding for stances exists but is only used one
way.

**Change.** Four stances: **Aggressive** (chase far), **Defensive** (engage within
leash, return to post — current default), **Stand Ground** (fight in place —
current `hold`), **Passive** (never auto-engage; essential for walking wounded
units home past a wolf den, and for villagers you want to keep out of a fight).
Surface as a 4-button row in the selection panel (`src/ui/hud.ts`).

**Impact** Medium · **Effort** S

### 6. Formations and group movement
**Gap.** `formationSlots()` (`src/sim/world.ts:961`) scatters units into a blob,
and each unit moves at its own speed — so a mixed group arrives as a trickle,
archers first, and dies piecemeal.

**Change.** Line / Box / Wedge formations with role sorting (melee front, ranged
and siege behind), plus group-speed matching so a selection moves at its slowest
member's pace. Rotate the formation to face the move vector.

**Impact** High · **Effort** M — pathfinding already string-pulls and separates,
so this is mostly slot generation and a per-group speed cap.

---

## B. Economy & the city

### 7. Garrison
**Gap.** When a raid hits, villagers flee to the Town Center
(`reactToDamage()`, `src/sim/sim.ts:783`) and then just stand there and die.
Towers are static damage with no player input.

**Change.** Garrison units inside Town Centers, Towers and Barracks: they become
untargetable, and each garrisoned ranged unit adds an arrow to the building's
volley. Ungarrison dumps them at the rally point. This is *the* single best
answer to the "mobile RTS, raids are hard to micro" problem — one tap saves an
economy.

**Impact** High · **Effort** M

### 8. Specialist drop-off camps
**Gap.** The Storehouse is a generic drop-off; there is no economic reason to
build forward, so the whole 264×264 map collapses to the area near your TC.

**Change.** Split into **Lumber Camp** (+15% wood, cheap, buildable only near
trees) and **Mining Camp** (+15% stone/gold), keeping the Storehouse as the
neutral fallback. Forward camps become raid targets, which gives the mid-game
map something to fight over.

**Impact** High · **Effort** S — mostly config plus a `needsNear` placement rule
alongside the existing `needsShore`.

### 9. A real economy panel
**Gap.** The Forum's labor pool (`updateLabor()`, `src/sim/sim.ts:49`) offers three
coarse presets (Balanced / Growth / Treasury). Players can't see income or
reassign precisely.

**Change.** A panel showing per-resource worker counts, income per minute, and
+/− steppers to move villagers between jobs. Add a live "gather rate" sparkline
per resource. The data is already tracked in `PlayerStats.gathered`.

**Impact** Medium · **Effort** M

### 10. Population ladder and city-layout bonuses
**Gap.** `POP_MAX = 45` (`src/core/config.ts:9`) on a map ten times the original
size. Armies cap out well before the map feels contested.

**Change.** Age-gated cap: 45 / 70 / 100 / 130. Add adjacency meaning to
building placement — farms next to a Granary/Mill yield faster, houses adjacent
to a Garden or Plaza raise a small happiness/gold trickle. Right now Garden,
Plaza and Statue are pure decoration; adjacency turns city planning into a
system instead of a diorama.

**Impact** High · **Effort** M

### 11. Trade depth and caravan raiding
**Gap.** One neutral trading post at map center; every Trade Cart runs the same
route (`updateTrade()`, `src/sim/sim.ts:324`).

**Change.** Three or four posts at varying distances, trade between your own
distant Markets, and a visible caravan route line on the minimap — for both
sides. Raiding the enemy's carts becomes a legitimate, readable strategy rather
than an accident.

**Impact** Medium · **Effort** M

---

## C. Faction design

### 12. Give each civ a unique building
**Gap.** Faction asymmetry is currently one unique unit plus two stat multipliers
(`FACTIONS`, `src/core/config.ts:349`). Egypt is "Greece with better farms".

**Change.**
- **Egypt — Obelisk**: cheap, permanent vision beacon; place them to see the map
  without scouting. Turns Egypt into the information civ.
- **Greece — Acropolis**: a fortified upgrade for a Town Center, plus walls that
  can mount towers. Leans into the existing defensive bonus.
- **Rome — Castrum**: a forward fort that trains infantry, heals, and projects a
  build radius — the natural expression of "35% faster construction".

**Impact** High · **Effort** L — three new models, but the highest return on
identity per unit of work.

### 13. Faction-unique technologies
**Gap.** All eight techs (`TECHS`, `src/core/config.ts:292`) are available to
everyone. There's no tech tree, just a tech list.

**Change.** Two exclusive techs per civ: Egypt *Nile Flood* (farms reseed free —
removes `FARM_RESEED_COST` for them), Greece *Phalanx Drill* (formation bonus,
which needs #6), Rome *Roads* (units move +20% faster near your own buildings —
and the paving visuals already exist in `src/render/terrain.ts`). Tie each to
that civ's unique building so #12 has a reason to be built.

**Impact** High · **Effort** S once #12 lands

### 14. Two more civilizations
**Gap.** Three civs, and Egypt/Greece/Rome cover a narrow slice of the era.

**Change.** **Persia** — cavalry and elephants, gold-driven economy, expensive
but overwhelming units. **Phoenicia** — naval and trade specialists, cheaper
docks, trade carts that also work as boats. Both are natural fits for the
existing island/coast map archetypes.

**Impact** High · **Effort** L

### 15. A real naval layer
**Gap.** The map generator produces island chains and a great river, but the only
ship is the Fishing Boat (`UNITS.boat`). On an island map, aggression is
impossible and the match is decided by whoever booms hardest.

**Change.** **War Galley** (ranged, from the Dock), **Transport** (carries land
units across water), and a Dock upgrade path. Shore bombardment against coastal
buildings. Pathfinding already separates water and land movement via
`Unit.water`, so the groundwork is there.

**Impact** High · **Effort** L

---

## D. Buildings & base building

### 16. Walls that behave like walls
**Gap.** Walls are 1×1 pieces placed tap-tap-tap, and *every segment has a gate*
your troops pass through (`README.md:57`). Convenient, but it means walls have no
chokepoint geometry — they're a damage sponge, not a shape.

**Change.** Explicit **Gate** buildings (openable, closable, garrisonable) with
solid wall segments between them; drag-to-build a wall line in one gesture with
a cost preview; auto-tiling so corners and ends visually connect, and a Bronze
Age **Wall Tower** that can be raised on top of an existing segment.

**Impact** High · **Effort** M

### 17. Placement quality of life
**Gap.** Placement is one building at a time with a ghost, rotate, confirm
(`src/ui/input.ts`). Laying eight houses is eight full cycles.

**Change.** Drag to place a row of houses or farms; a "farm ring" template that
lays farms around a Town Center in one action; ghost coloring that shows *why* a
spot is invalid (too steep / occupied / needs shore) rather than just refusing.

**Impact** Medium · **Effort** M

### 18. Repair and building damage states
**Gap.** Buildings track `progress` for construction and `lastHitT` for a hit
flash, but there is no repair — a tower at 5% HP stays at 5% forever.

**Change.** Villagers repair damaged buildings (reuse `updateBuild()`, driving
`hp` instead of `progress`, at a wood/stone cost). Visual damage states at 66% /
33%: scorch marks, missing roof segments, a smoke plume from
`src/render/effects.ts`. Repairing after a raid gives villagers something to do
in the lull, and it makes towers a sustainable investment.

**Impact** High · **Effort** M

### 19. Capturable neutral structures
**Gap.** The wilds are excellent but strictly one-shot: you clear a site and it's
spent (`SiteState` is `dormant | active | cleared`).

**Change.** Add persistent, contested points — a **Ruined Fort** that either side
can repair and garrison for vision and a forward spawn, and neutral **Wells** or
**Quarries** that yield to whoever holds the ground. Gives the mid-game a reason
to fight somewhere other than the two bases.

**Impact** High · **Effort** M

---

## E. The AI

### 20. AI personalities
**Gap.** One scripted opener (`src/sim/ai.ts`), varied only by difficulty
multipliers. Every match against Normal plays out the same way.

**Change.** Four personalities picked per match and shown in the setup screen:
**Rusher** (Tool-age spearman pressure), **Turtle** (towers and walls, late
elite push), **Boomer** (third TC before any military), **Raider** (chariots and
cavalry hunting villagers, avoids buildings). Same command API, different
weights and thresholds.

**Impact** High · **Effort** M

### 21. Teach the AI to play the map
**Gap.** The AI ignores the entire wilds layer and targets buildings first
(`ai.ts:357`) — it will walk past the Golden Idol to punch a house.

**Change.** Have it hunt herds for early food, contest the Idol, dig cairns,
buy the deserters, and prioritize villagers and trade carts over buildings when
raiding. Right now a human player who uses the wilds is playing a richer game
than the opponent is.

**Impact** High · **Effort** M

### 22. Honest difficulty
**Gap.** Hard mode gives the AI `aiGatherMul: 1.15` — a resource handicap, not
better play. It's invisible to the player.

**Change.** Show the handicap in the setup screen, and add a top tier with
**no** economic bonus that instead plays better: scouts properly, reacts to what
it sees, retreats damaged units, and times pushes against your age-ups.

**Impact** Medium · **Effort** M

---

## F. UX & meta

### 23. Control groups and a hotkey layer
**Gap.** Keyboard support is Esc, R, Enter and WASD panning (`src/ui/input.ts:406`).
No control groups, no build hotkeys, no camera bookmarks.

**Change.** Desktop: `1`–`9` to bind and recall, double-tap to center, `Ctrl+1`
to add; letter hotkeys for build menu entries; `H` for Town Center, `.` for next
idle villager (the counter already exists). Mobile: a swipeable group bar above
the minimap with tap-to-select, hold-to-bind — the same feature in a touch idiom.

**Impact** High · **Effort** M

### 24. Event feed and alerts
**Gap.** `SimEvent` already emits `underattack`, `research`, `age`, `built`,
`nodeDepleted`, `siteDiscovered` and more — most of which never surface as
anything a player can act on.

**Change.** A compact scrolling event log with jump-to-location on tap, plus
distinct alerts for: under attack (with a minimap ping that persists), age-up
complete, research complete, a resource node running dry, and an idle military
counter next to the existing idle-villager button.

**Impact** High · **Effort** S — the event stream is already there; this is
presentation.

### 25. Tutorial and informative tooltips
**Gap.** The game has ages, techs, boons, trade, labor pools, wilds encounters and
two victory conditions, and teaches none of it beyond a README.

**Change.** A guided first match with objective prompts ("gather 100 wood",
"advance to the Tool Age"), plus tooltips on every unit and building showing
stats, cost, what it counters and what counters it (needs #1). A compact tech
tree screen so players can see where an age leads before committing 460 food.

**Impact** High · **Effort** M

### 26. Save and resume a match
**Gap.** No persistence anywhere except a mute flag in `localStorage`
(`src/audio/sound.ts:12`). A phone call ends the match.

**Change.** Serialize `World` state (units, buildings, nodes, fog, player state,
encounter sites) to `localStorage` or IndexedDB on an interval and on
`visibilitychange`; offer "Resume match" on the title screen. The sim is already
a clean fixed-timestep state object separate from the renderer, which makes this
far easier here than in most engines.

**Impact** High for a mobile-first game · **Effort** M

### 27. Skirmish setup options and seed sharing
**Gap.** Setup is civ + difficulty. Map generation is fully procedural
(`src/sim/map.ts`) but none of its knobs are exposed.

**Change.** Let players choose map archetype (or Random), map size, resource
richness, starting age, and toggle victory conditions (Conquest / Wonder /
both). Show the map seed on the loading screen and allow entering one — free
replayability, and it turns a good generator into a feature players can talk
about.

**Impact** Medium · **Effort** S

---

## G. Visuals & audio

### 28. Day/night cycle and weather
**Gap.** A single fixed `DirectionalLight` and static fog (`src/render/view.ts:117-126`).
Every match looks like the same noon.

**Change.** A slow day/night cycle driving sun color, intensity, angle and fog
color, with night lowering unit vision slightly and lighting the braziers the
age-up pass already places on buildings. Biome-appropriate weather: sandstorms
that cut visibility in desert, rain that darkens the lush shore palette. Both
read as atmosphere *and* as tactical information.

**Impact** High · **Effort** M

### 29. A juice pass
**Gap.** The art direction is strong — flat-shaded, one draw call per entity —
but impacts are thin. `boom` events remove a building; there's no collapse.

**Change.** Building collapse animation (roof drops, dust ring, debris settling
into a rubble mesh that lingers), screen shake scaled by footprint size, arrows
that stick in the ground and in shields, dust decals under moving armies,
selection rings that pulse on command, and cheap contact shadows or SSAO for
ground contact. Bloom limited to braziers, gold piles and the Idol.

**Impact** High · **Effort** M — build on the existing pooled particle system in
`src/render/effects.ts`.

### 30. Audio depth
**Gap.** `src/audio/sound.ts` is 155 lines of procedural WebAudio one-shots. No
music, no ambience, no spatialization.

**Change.** Per-biome ambient beds (desert wind, shore surf, forest birds) that
crossfade with the camera position; procedurally generated or lightly composed
faction-flavored music that shifts to a combat theme when your units take
damage; unit acknowledgement barks; and `PannerNode` positioning so a raid on
the far side of the base is *audible* before it's visible. Given the project's
no-assets constraint, most of this can stay synthesized.

**Impact** High · **Effort** M

---

## Suggested order

If the goal is maximum change per unit of work, the first tier is **#1 (counters)**,
**#7 (garrison)**, **#24 (event feed)**, **#8 (specialist camps)** and
**#26 (save/resume)** — each is small-to-medium, each fixes something structural,
and #1 unlocks the tooltip, AI and formation work that follows.

The second tier is identity: **#12 + #13** (unique buildings and techs) turn three
stat-multiplier civs into three ways to play. The third is scope: **#15 (navy)**,
**#3 (siege)** and **#14 (new civs)**.

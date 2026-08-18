# Ancient Age — 30 Improvement Proposals

A design backlog grounded in the current code (`src/`, ~11.7k lines). Each entry
has four parts: **Today** (the gap as the game actually stands, with file and
value references), **Proposal** (the design, with numbers), **Implementation**
(where the work lands), and **Risk** (the tradeoff to watch). Tags: **Impact**
(how much it changes the feel of a match) and **Effort** (S / M / L).

> **Shipped so far:** #1 (damage classes and counters), #3 (siege units and the
> Siege Workshop), #12 (a unique building per civ), #13 (faction-unique
> technologies, plus roster gaps), #19 (capturable neutral structures), part of
> #25 (the tech tree screen) and part of #29 (building collapse, dust and
> decals). Those entries are kept as written, with a note on what actually
> landed and how it differs from the proposal.
>
> **Note on naming:** the proposals below were written against the old
> four-age progression. Ages have since become six **settlement levels**
> (Camp → Hamlet → Village → Town → City → Metropolis); read "Bronze Age" as
> "Town" and "Iron Age" as "Metropolis" where the text predates the change.

---

## A. Combat & units

### 1. Damage classes and a counter system — ✅ **shipped**

> **What landed.** Armor split into melee and pierce channels on units, plus a
> single `armor` value on buildings that siege damage ignores. Every unit has an
> `armorClass` (`worker` / `infantry` / `ranged` / `cavalry` / `siege` / `wild` /
> `building`) and a flat `bonus` table. Villagers were given their own `worker`
> class rather than `infantry`, so counters stay a military system and archer
> aggression against economies is not silently buffed. The selection panel shows
> `ARM melee/pierce` and a "Strong vs" line, without which the whole system is
> invisible. Measured: a spearman kills a chariot in 5 hits instead of 11, and a
> hoplite's 3 melee armor turns a spear thrust into 4 damage while arrows still
> land for 12.

**Today.** `dealDamage()` (`src/sim/sim.ts:733`) resolves every attack as
`max(1, rawDmg - armor)`. There is exactly one axis of defense and one of
offense, so unit choice reduces to a damage-per-cost table. A Hoplite (95 HP,
10 atk, 2 armor) is strictly better than a Spearman (55 HP, 7 atk, 0 armor) at
roughly comparable cost, and archers at 5 atk are shredded by the flat-armor
rule — 5 damage against 2 armor is a 40% loss, against 3 armor after
`shields` it's 60%. The result is that the correct army is "whatever unit my
civ unlocks last", and there is no reason to scout what the enemy is building.

**Proposal.** Two changes that work together. First, split armor into **melee
armor** and **pierce armor**, so a Hoplite's bronze can be a wall against
spears (melee 3) while still being vulnerable to massed arrows (pierce 0).
Second, add an `armorClass` to each unit (`infantry`, `ranged`, `cavalry`,
`siege`, `building`, `wild`) and a `bonus: Partial<Record<ArmorClass, number>>`
table to `UnitDef`. Suggested opening values:

| Attacker | Bonus |
| --- | --- |
| Spearman | +8 vs `cavalry` (the War Chariot finally has a hard, cheap answer) |
| Archer | +3 vs `infantry`, −2 effective vs `siege` |
| Chariot / cavalry | +6 vs `ranged`, +4 vs `siege` |
| Ram (see #3) | +40 vs `building`, ×0.25 vs everything else |
| Hoplite / Legionary | no bonus — the reliable generalists |

**Implementation.** `UnitDef` in `src/core/config.ts:41` gains three fields;
`dealDamage()` gains a class lookup on the target; `unitStats()`
(`src/sim/world.ts:137`) returns `{ meleeArmor, pierceArmor }` instead of one
`armor`. The `bronze`/`shields` techs (+25% damage, +1 armor) need re-tuning
against the new curve — a flat +1 to both armor types is stronger than it looks
once pierce armor exists. The AI's `military()` (`src/sim/ai.ts:307`) should
sample the player's visible army composition and bias production toward the
counter.

**Risk.** Counter systems make bad compositions *feel* bad, which is punishing
without #25 (tooltips showing counters). Ship them together, or at minimum ship
the tooltip half first.

**Impact** High · **Effort** M

### 2. Unit upgrade lines

**Today.** A Spearman trained in the Tool Age is an identical Spearman in the
Iron Age. The only progression is two global techs — `bronze` (+25% damage) and
`shields` (+1 armor, +15% HP) — which apply to everything at once
(`src/core/config.ts:292`). So the mid-game has no "my army just got better"
moment, and early-age units become dead weight you'd rather delete than keep.

**Proposal.** Per-age, in-place upgrade research at the producing building, each
converting *existing* units as well as future ones:

- Barracks: Spearman → **Pikeman** (Bronze, +20 HP, keeps the anti-cavalry
  bonus and gains reach) → **Phalangite** (Iron)
- Range: Archer → **Composite Bowman** (Bronze, +1 range, +2 atk) →
  **Master Bowman** (Iron)
- Each civ's unique unit gets one elite tier: Royal Chariot / Elite Hoplite /
  Praetorian, gated at Iron and priced in gold so it competes with the Wonder.

**Implementation.** The in-place transform already exists for buildings —
`upgradesTo` on `BuildingDef` (`src/core/config.ts:150`), executed in
`src/sim/sim.ts:142`. Mirror it for units: a `research` queue item that flips
`Unit.type` for every matching unit of that owner and recomputes `maxHp` via
`unitStats()`, preserving the HP *fraction* rather than the absolute value so an
upgrade never heals a wounded army. Models can be variants of the existing ones
in `src/render/models.ts` — a plume, a bigger shield, a different helmet — since
the art style is flat-shaded merged geometry where a small silhouette change
reads clearly.

**Risk.** Retroactive upgrades create a spike where the player's army suddenly
wins a fight it was losing. That's the point, but the AI needs to research the
same lines or hard mode becomes trivial.

**Impact** High · **Effort** M

### 3. Siege units and a Siege Workshop — ✅ **shipped**

> **What landed.** A `siegeworks` building (Town level) training a **Battering
> Ram** (220 HP, 4 pierce armor, +46 vs buildings, speed 1.85) and a **Catapult**
> (90 HP, range 11, +18 vs buildings, 1.6-radius splash). Both are classed
> `siege`, and every other unit type got a bonus against them, so siege is
> countered broadly rather than by one unit. Siege engines never auto-target
> troops and never retaliate when shot — they use a new
> `World.findEnemyBuilding()` and keep grinding at what they were sent for.
> Friendly splash was set to **half** damage rather than full, per the risk note
> below. Measured through the real tick loop: a lone catapult razes a Watch
> Tower in 81s while holding at 11.8 tiles — outside the tower's 8.5 reach, so
> it takes no damage at all — and three rams level a Town Center in 38s where
> three spearmen need 148s.
>
> **Known limitation:** the AI fields at most two engines and they walk at 1.85
> while the rest of the wave moves at ~3, so its siege arrives late and alone.
> The real fix is #6 (group-speed matching), not more siege logic.

**Today.** A Town Center has 1800 HP (2250 with `masonry`), a Watch Tower shoots
7 damage at 8.5 range on a 2.1s cooldown, and no unit in the game outranges it
except the chariot at 5. Ending a match means walking melee infantry into tower
fire and grinding stone for a minute per building. It's the least interesting
thing the combat model does, and it's why the AI's late game feels like a siege
of attrition rather than a decision.

**Proposal.** A Bronze Age `siegeworks` building (wood 120, stone 80) training:

- **Battering Ram** — 250 HP, 8 speed... no, deliberately *slow* (1.8), +40 vs
  `building`, ×0.25 damage taken from `arrow` projectiles, near-useless against
  units. Costs wood + gold, 3 pop.
- **Catapult** — 90 HP, range 11 (outranges every tower), long cooldown, a slow
  arcing projectile with splash that damages *friendly* units in the blast.
  Devastating against clumped armies and buildings; helpless alone.

This is where #1 pays off structurally: siege beats buildings, cavalry beats
siege, spears beat cavalry. The triangle closes.

**Implementation.** New `BuildingTypeId` and two `UnitTypeId`s; two new models;
a third `Projectile.kind` (`'boulder'`) with a higher `arc` and a splash radius
handled in `updateProjectiles()` (`src/sim/sim.ts:823`). The AI needs a rule to
build siege when the player has more than N towers, and to keep it *behind* the
melee line — which needs #6 (formations) to look right.

**Risk.** Friendly-fire splash is unforgiving on a touch screen. Consider making
it player-only-optional, or halving friendly damage.

**Impact** High · **Effort** L

### 4. Veterancy

**Today.** Nothing distinguishes a unit that has survived four battles from one
trained thirty seconds ago. Losing ten spearmen costs resources and nothing
else, so the optimal play is often to trade armies freely and out-produce.
There's no attachment to a squad and no reason to retreat.

**Proposal.** Track `kills` on `Unit`. At 2 / 5 / 10 kills the unit gains rank
1 / 2 / 3, each granting +8% max HP and +8% damage (compounding to roughly +26%
at rank 3 — noticeable, not dominant). Rank shows as small chevrons above the
selection ring, or as a metal tint on the model's trim. Killing a rank-3 unit
should feel like an accomplishment; the enemy AI's veterans should be visible to
you too.

**Implementation.** One counter on `Unit`, a hook in `killUnit()`, and a rank
multiplier folded into `unitStats()` — which already takes the unit rather than
just the type at most call sites. Render side: a tiny instanced chevron sprite
in `src/render/effects.ts`, which already has a `Markers` class for selection
rings.

**Why it's worth more than it looks.** It gives the Temple's heal aura
(`heal: { rate: 2.0, range: 10 }`) a real strategic job — pulling wounded
veterans back to heal becomes correct play rather than a nicety — and it makes
#5 (stances) and #7 (garrison) matter, because now preserving units has value.

**Risk.** Snowballing: the player who wins the first fight has better units for
the second. Cap at rank 3 and keep the per-rank bonus modest.

**Impact** Medium · **Effort** S

### 5. Unit stances

**Today.** `Unit.hold` (`src/core/types.ts:86`) is a single boolean, and
`Unit.post` is already a leash anchor set by `cmdMove()`
(`src/sim/world.ts:441`). Half the machinery for stances exists — it's just
exposed as one on/off toggle. The consequences bite: there is no way to walk a
wounded unit past a wolf den without it turning to fight, no way to tell archers
to hold their fire while you reposition, and no way to make a scout actually
scout instead of dying to the first boar.

**Proposal.** Four stances, replacing the boolean:

- **Aggressive** — pursue enemies well beyond the post (aggro radius ×2.5).
- **Defensive** *(default)* — engage within `aggro`, then return to `post`. This
  is today's behavior.
- **Stand Ground** — fight what comes into range, never move. Today's `hold`.
- **Passive** — never auto-engage; flee behaviour only. Essential for scouts,
  relic carriers, wounded units heading to a Temple, and villagers you want kept
  out of a fight near the front.

**Implementation.** `Unit.hold: boolean` → `Unit.stance: Stance`, with the
auto-engage scan in `updateUnit()` (`src/sim/sim.ts:238`) reading a per-stance
radius multiplier and `reactToDamage()` (`src/sim/sim.ts:765`) respecting
Passive. UI: a four-button segmented control in the selection panel
(`src/ui/hud.ts`), which is compact enough for the mobile layout.

**Risk.** Four states is one more than most players will use. Default to
Defensive, keep the buttons unobtrusive, and let the tutorial (#25) introduce
Passive at the moment it's needed.

**Impact** Medium · **Effort** S

### 6. Formations and group movement

**Today.** `formationSlots()` (`src/sim/world.ts:961`) generates a loose spiral
of rings at 0.85-unit spacing, and `cmdMove()` sorts units by distance to the
destination before assigning slots. Every unit then walks at its own speed —
a chariot at 4.4, a legionary at 3.0, a hoplite at 2.55. Send a mixed army
across the map and it arrives as a trickle in speed order, which means your
fastest, squishiest units meet the enemy line first and alone. Players learn to
compensate by moving in small same-speed groups, which is exactly the kind of
tedium a mobile RTS can't afford.

**Proposal.** Three formations plus group-speed matching:

- **Line** — wide, shallow; melee in front rank, ranged in the second, siege
  in the third. Rotates to face the movement vector.
- **Box** — melee on the perimeter, ranged and siege inside. The escort
  formation, and the correct answer to raids on a moving army.
- **Wedge** — fast units at the point. For charges and for punching through.

Group-speed matching: when a multi-unit selection is ordered to move, cap
everyone at the slowest member's speed so the group arrives intact. Add a
modifier (double-tap the move, or a toggle) for "move at full speed" when you're
fleeing and don't care about cohesion.

**Implementation.** Rewrite `formationSlots()` to take the mover list rather
than just a count, so it can sort by role. Add a `groupSpeed` field written onto
each `Unit` at command time and read in `approach()` (`src/sim/sim.ts:375`). The
existing A* string-pulling and separation steering (`separation()`,
`src/sim/sim.ts:856`) already handle the local collision problem, so this is
mostly slot generation and one speed clamp.

**Risk.** Rigid formations path badly through the gaps between buildings and
across the river archetype's fords. Degrade gracefully: if the destination
region can't fit the formation, fall back to today's spiral.

**Impact** High · **Effort** M

---

## B. Economy & the city

### 7. Garrison

**Today.** When a raid arrives, `reactToDamage()` (`src/sim/sim.ts:783`) sends
villagers and trade carts fleeing to a random point near their Town Center —
and then they stand there and get killed anyway, in a clump, next to the
building. Towers are static damage with no player input. On a phone, where you
cannot micro fifteen fleeing villagers, an early raid on an unguarded economy is
effectively unrecoverable.

**Proposal.** Garrison units inside Town Centers (capacity 10), Towers (5),
Barracks and Archery Ranges (8). Garrisoned units become untargetable and
slowly heal. Each garrisoned *ranged* unit adds one arrow to the building's
volley — so a tower with 5 archers inside is a genuine strongpoint rather than
7 damage every 2.1 seconds. Ungarrison dumps everyone at the rally point.
Critically: an **"all villagers to safety"** button, one tap, that garrisons
every villager within range of any garrisonable building.

**Implementation.** `Building.garrison: number[]` plus removal from the spatial
hash while inside (so `findEnemy()` skips them). Tower targeting
(`findTowerTarget()`, `src/sim/sim.ts:200`) multiplies its volley by garrison
count. The renderer needs a small occupancy pip on the building. The AI should
garrison its own villagers when `threat >= 3`, which is a condition its
`defense()` block (`src/sim/ai.ts:74`) already computes.

**Why this is the highest-value single item on the list.** It converts the
game's worst mobile-usability moment — a raid on your eco — from "unwinnable
micro problem" into "one tap, correct decision, small cost". It's the standard
solution in the genre for exactly this reason.

**Risk.** Garrison makes towers strong, which pushes the game toward turtling.
Balance against #3 (siege) landing in the same era.

**Impact** High · **Effort** M

### 8. Specialist drop-off camps

**Today.** The Storehouse (wood 35, 2×2) is a generic drop-off with no bonus.
There is no economic incentive to build anywhere except close to your Town
Center, so the entire 264×264 map — ten times the area of the original
battlefield, per the README — collapses in practice to two blobs and a trade
route between them. The map generator's four archetypes are doing beautiful work
that the economy never asks the player to engage with.

**Proposal.** Split the Storehouse into three:

- **Storehouse** — as today. Generic fallback, no bonus.
- **Lumber Camp** — placeable only within ~6 tiles of trees; +15% wood gather
  rate for villagers dropping off here.
- **Mining Camp** — placeable only near stone or gold; +15% to those.

Now the good wood is *out there*, forward camps are worth building, and forward
camps are worth raiding. The mid-game gets a map to fight over.

**Implementation.** Mostly config: two new `BuildingDef`s plus a `needsNear:
NodeKind[]` placement predicate alongside the existing `needsShore` check. The
rate bonus lands in `gatherRate()` (`src/sim/world.ts:180`) — but note it
currently takes only `(owner, kind)`, so it needs the drop-off building passed
in, or the bonus applied at deposit time in `updateDeposit()`.

**Risk.** More build-menu entries on a phone screen. Consider making the camps
*replace* the Storehouse contextually — the same button, resolving to the right
camp based on what's nearby.

**Impact** High · **Effort** S

### 9. A real economy panel

**Today.** The Forum unlocks a labor pool (`updateLabor()`, `src/sim/sim.ts:49`)
driven by `laborWeights` with three presets: Balanced, Growth, Treasury. That's
the entire economic interface. A player cannot see how many villagers are on
wood, cannot see income per minute, and cannot move six workers from food to
stone without hand-selecting them on the map.

**Proposal.** A panel (a tab on the existing HUD, not a modal) showing per
resource: current worker count, income per minute, and +/− steppers that move
villagers between jobs by reassigning the nearest idle-or-lowest-priority
worker. A small sparkline of the last 60 seconds of income per resource, so the
player can see a raid's economic damage as a dip rather than inferring it.

**Implementation.** `PlayerStats.gathered` already accumulates totals per
resource; a ring buffer sampled every sim second gives the sparkline for free.
The steppers reuse `sendVillagerTo()` (`src/sim/sim.ts:78`), which already does
exactly this job for the labor pool. Worker counts come from scanning tasks
once per second, not per tick.

**Risk.** Screen real estate on a phone in landscape. This probably wants to be
a slide-over panel triggered from the resource bar, not a permanent fixture.

**Impact** Medium · **Effort** M

### 10. Population ladder and city-layout bonuses

**Today.** `POP_MAX = 45` (`src/core/config.ts:9`). Subtract 15–20 villagers for
a functioning economy and the maximum army is roughly 25 units — on a map ten
times the original size, where the chariot alone costs 2 pop. Armies cap out
long before the map feels contested, and the Iron Age's `shields` tech arrives
for an army that can't grow. Separately, Garden, Plaza and Statue are pure
decoration: they cost resources, occupy footprint, and do nothing.

**Proposal.** Two linked changes.

*Population ladder*: cap by age — 45 / 70 / 100 / 130. Each age-up is then a
visible strategic unlock rather than only a tech gate, and the Iron Age finally
supports the army its techs are written for.

*Adjacency bonuses*: give city layout meaning.
- Farms adjacent to a Granary/Mill (new, or fold into Storehouse) gather +10%.
- Houses adjacent to a Garden or Plaza generate a small gold trickle
  (0.05/s each), capped, so beautification becomes a real if minor economy.
- Towers adjacent to Walls gain +2 range — rewarding actual fortification
  geometry rather than scattered towers.

**Implementation.** `AGE_POP_CAP: number[]` in config, read where `popCap` is
recomputed on age-up. Adjacency is a footprint neighborhood scan cached on
`built`/`boom` events rather than evaluated per tick — the building hash
(`World.buildingHash`) already supports the query cheaply.

**Risk.** Raising pop cap raises unit count, which raises pathfinding and draw
cost. The renderer is already one draw call per entity with instanced clutter,
so 130 pop per side should be fine, but it needs a profiling pass on a mid-range
phone before shipping.

**Impact** High · **Effort** M

### 11. Trade depth and caravan raiding

**Today.** One neutral trading post at map center (`World.tradePost`), and every
Trade Cart runs the same route — `updateTrade()` (`src/sim/sim.ts:324`) pays
`TRADE_BASE_GOLD + distance * TRADE_GOLD_PER_TILE`. Since both players are
roughly equidistant from the center, trade is a flat, uninteresting income tap
that neither player can meaningfully contest.

**Proposal.** Three or four posts placed at varying distances by the map
generator, so choosing a route is a risk/reward decision — the far post pays
much better and runs through contested ground. Allow trade between your own
distant Markets (which makes a forward second base pay for itself). Draw the
active caravan routes on the minimap for **both** sides, so raiding the enemy's
trade is a legible strategy rather than an accident, and losing your own carts
is something you can see happening.

**Implementation.** `tradePost: Vec2` becomes `tradePosts: Vec2[]`; the cart
picks a post at dispatch time (nearest by default, player-overridable by
selecting the Market and tapping a post). The minimap (`src/ui/minimap.ts`)
draws route polylines for visible carts. The AI's raid targeting (#21) should
learn to intercept.

**Risk.** Multiple posts plus route-drawing could clutter a small minimap. Fade
routes to near-invisible unless the Market is selected.

**Impact** Medium · **Effort** M

---

## C. Faction design

### 12. Give each civ a unique building — ✅ **shipped**

> **What landed.** All three, close to the proposal. **Egypt's Obelisk**
> (45 stone, 1×1, Hamlet) is a permanent vision beacon at radius 20 — nearly
> twice a Watch Tower's 11 — and it needed a real generalization to get there:
> `BuildingDef` gained a `vision` field, `updateFog` now calls a new
> `World.buildingVision(owner, type)` instead of the hardcoded per-type ternary
> it had, and `ENC.outpostVision` was deleted in favour of the fort's own
> `vision: 17` so there is one source of truth. **Greece's Acropolis** (160
> stone, 70 gold, Town) is an in-place upgrade of a Town Center via the existing
> `upgradesTo` mechanism, at 3000 HP with 3 armor and a built-in tower attack.
> **Rome's Castrum** (120 wood, 90 stone, Town) musters spearmen *and*
> legionaries, heals slowly, and is a forward drop-off.
>
> The Acropolis was the whole risk of this entry, and it is worth writing down
> why: a town center is special-cased in sixteen places, six of them
> load-bearing for the win condition. A `TOWN_CENTERS` set and an
> `isTownCenter()` predicate now cover conquest counting, the defeat trigger,
> `tcPos` refresh, drop-off, refugee settling, Golden Idol enshrining,
> settlement level-up (sim *and* HUD), the AI's anchor/targeting/production
> filters, civic hubs and the debug hooks. Everything else turned out to be
> data-driven and needed nothing — the Acropolis trains villagers and takes
> deposits because its `BuildingDef` says so, and it shoots because
> `updateBuildings` keys off `def.attack`.
>
> Two adjacent bugs were fixed on the way. `World.researchedAt` lets town-center
> technologies still be studied at an Acropolis, but **one-directionally**, or
> Greece could learn Phalanx Drill without ever upgrading. And `demolish()`
> declared instant defeat on pulling down *any* town center without counting the
> rest — harmless when there was one type and one of it, wrong the moment a
> settlement can hold several. It now routes through `checkTownCenters` like a
> razed one does.
>
> Gating is by a new optional `civs?: Faction[]` on `BuildingDef`/`TechDef` with
> an `availableTo()` helper, enforced in `canPlace` (so the AI and the placement
> ghost get it for free) and in `startUpgrade`, and filtered in the build menu
> and the tech tree screen. A second helper, `uniqueTo()`, exists because `civs`
> does double duty — it marks a civ's own works *and* the gaps in another's
> roster (see #13) — and only a single-civ list should be labelled "unique to".

**Today.** `FACTIONS` (`src/core/config.ts:349`) defines identity as one unique
unit plus a `bonus` object of at most three multipliers. Egypt is +25% food and
cheaper farms; Greece is +15% unit HP and sturdier defenses; Rome is faster,
cheaper construction. These are real but invisible — you don't *see* them, you
don't *build* differently because of them, and after one match they stop being
interesting. The architecture pass that retints buildings per civ is doing more
for faction identity than the mechanics are.

**Proposal.** One unique building each, gated at Tool or Bronze, that changes how
that civ is played:

- **Egypt — Obelisk** (stone 60, 1×1, Tool Age). A cheap, permanent vision
  beacon with a generous sight radius. Egypt becomes the *information* civ:
  seed obelisks across the map and you always know where the attack is coming
  from, where the Idol is, and which encounter sites are live. Pairs beautifully
  with the existing fog and encounter-discovery systems, which currently reward
  scouting the player can't afford to do.
- **Greece — Acropolis** (stone 200, gold 80, Bronze). A fortified in-place
  upgrade for a Town Center: +80% HP, a built-in tower attack, and garrison
  capacity 20 (needs #7). The literal expression of "hold the line".
- **Rome — Castrum** (wood 120, stone 90, Bronze). A forward fort that trains
  infantry, heals nearby units slowly, and projects a build radius so villagers
  can raise structures at the front. The expression of "an empire is built road
  by road" — Rome plays forward.

**Implementation.** Three `BuildingDef`s, three models in
`src/render/models.ts`, and a `civOnly: Faction` field respected by the build
menu (`BUILD_MENU`) and by `canPlace`. The Acropolis reuses the existing
`upgradesTo` mechanism (shrine → temple). The Obelisk needs a static vision
source in `updateFog()` (`src/sim/sim.ts:888`), which currently only reads unit
and building positions — a small generalization.

**Risk.** Three new models is the bulk of the effort, and they have to look as
good as what's already there. The Obelisk is the cheapest to model and the most
distinct mechanically — ship it first as a proof.

**Impact** High · **Effort** L

### 13. Faction-unique technologies — ✅ **shipped**

> **What landed.** Two exclusive technologies per civ, each researched at that
> civ's unique building from #12, so the two entries carry each other exactly as
> proposed. Egypt: **Nile Flood** (farms reseed free and never wither — the
> wither branch becomes unreachable) and **Cartography** (obelisk vision ×1.6,
> and every encounter site drawn on the minimap). Greece: **Phalanx Drill** and
> **Marble Quarry** (stone gathers +25%, and the stone *component* of every
> building price falls 15%, which meant making `buildingCost` per-resource
> rather than one flat multiplier). Rome: **Roads** and **Legion Standard**.
>
> The two close-order technologies are the interesting ones. Both hang off a
> single `closeOrderArmor()` at the `damageToUnit` choke point, and they are
> deliberately *not* symmetrical: a phalanx presents shields, so Phalanx Drill
> adds +2 melee armor only and arrows still come over the top, while the Legion
> Standard's +1 per neighbour (capped +3) applies to both channels. Phalanx
> needs two neighbours to pay out — a broken line is a soft one. Neither uses
> the shared `tmpUnits` scratch array, which is live in callers up the stack.
>
> Roads is sampled, not computed per tick: `Unit.speedAura` refreshes on
> `(world.tick + u.id) % 5`, staggered by id so the cost stays spread, and
> `updateUnit` multiplies the fresh stats object by it. A new
> `World.ownBuildingNear` does the query through the existing building hash.
>
> **The roster gaps landed with them, and are half the point.** Egypt cannot
> learn Hardened Shields, Greece cannot learn Logistics, Rome cannot learn
> Irrigation — same `civs?: Faction[]` field, used as an exclusion list. What a
> civilization *lacks* turns out to do as much for its character as what it
> owns, and it costs one array per entry.
>
> One thing the proposal asked for did **not** land: branching the shared tree
> so `bronze` and `shields` become a choice. The tree is still a checklist for
> the four common technologies.
>
> **A pre-existing bug this surfaced.** The AI researched *nothing*, ever — on
> any difficulty, in any match. Its research block sat at the tail of
> `construction()`, behind ten `if (place(...)) return;` branches, and a
> functioning AI economy lays a foundation most seconds. Measured over a
> 40-minute run it reached the block zero times. Research is now its own
> `research()` step called from `step()`, and it only needs a *near*-idle
> building (queue < 2) rather than a perfectly idle one, since a barracks that
> is always training would otherwise never study anything. The AI also now
> raises its civ's unique building and researches its own two technologies, so
> faction identity shows up when you are *fighting* a civilization and not only
> when you are playing it.

**Today.** All eight techs in `TECHS` (`src/core/config.ts:292`) are available to
every civ. It's a tech *list*, not a tech tree — no branching, no exclusivity, no
choice beyond ordering. Every Iron Age player has researched the same eight
things.

**Proposal.** Two exclusive techs per civ, each researched at that civ's unique
building from #12, so the two features reinforce each other:

- **Egypt — Nile Flood**: farms reseed for free (removes `FARM_RESEED_COST = 20`
  wood entirely) and never wither. **Cartography**: obelisk vision radius +60%,
  and encounter sites are revealed on the minimap map-wide.
- **Greece — Phalanx Drill**: units in Line or Box formation gain +2 melee armor
  (requires #6, and gives Greece a reason to actually use formations).
  **Marble Quarry**: stone gathers 25% faster, buildings cost 15% less stone.
- **Rome — Roads**: units move +20% faster within 8 tiles of your own buildings
  — and the paving visuals already exist in `src/render/terrain.ts`, so this
  reads instantly. **Legion Standard**: Legionaries gain +1 armor per adjacent
  Legionary, up to +3, making Roman blocks genuinely block-like.

Add branching to the shared tree too: `bronze` and `shields` become a choice
between an offense line and a defense line rather than a checklist.

**Implementation.** `TechDef` gains `civOnly?: Faction`. The research UI already
filters by `at` building and `age`; one more predicate. Roads needs a
proximity query per unit per tick, which is cheap through the building hash but
should be sampled (every 5 ticks) rather than evaluated every tick.

**Risk.** Exclusive techs widen balance variance. Keep the first pass modest and
tune against the AI before adding more.

**Impact** High · **Effort** S once #12 lands

### 14. Two more civilizations

**Today.** Three civs, all Mediterranean, covering a narrow slice of the era —
and mechanically they're variations on the same infantry-and-archers template.
There is no civ that plays fundamentally differently.

**Proposal.** Two civs chosen to occupy empty strategic space rather than to pad
the roster:

- **Persia — The King of Kings.** Cavalry and **War Elephants**: expensive,
  high-pop, overwhelming in a line, terrible against spears (which makes #1 load
  bearing). Gold-driven economy — gold gathers 25% faster, but food is slower,
  so Persia must control the map's gold veins. Unique building: **Satrapy**, a
  forward outpost that converts nearby neutral encounter sites to your control.
- **Phoenicia — Purple and Cedar.** The naval and trade civ (needs #15 to be
  worth anything): docks 40% cheaper, boats gather much faster, trade carts also
  function as boats and can cross water, and a **Harbor** unique building that
  extends trade routes over sea. On the islands archetype, Phoenicia is a
  different game.

**Implementation.** Each civ is a `FactionDef` entry, a unique unit, a unique
building, two techs (#13) and a starting-landscape flavor pass — the map
generator already does per-civ starting terrain (date palms for Egypt, cypress
and olive for Greece, umbrella pines for Rome). That per-civ landscape system is
the reason a new civ feels substantial here for relatively contained work.

**Risk.** Five civs is five times the balance surface, and elephants/naval both
depend on other items landing first. Sequence this after #1, #6 and #15.

**Impact** High · **Effort** L

### 15. A real naval layer

**Today.** The map generator produces four archetypes — `coast`, `islands`,
`lakes`, `river` (`src/sim/map.ts:19`) — and `islands` is 25% of rolls. The only
ship in the game is the Fishing Boat: 60 HP, 0 attack, gathers fish. There is no
transport and no warship. On an island map, aggression is *impossible*; the
match is decided entirely by who booms harder, and the "always a guaranteed land
route" rule in the generator exists partly to paper over this. A quarter of all
matches are being played on a map the ruleset can't support.

**Proposal.** Three additions, all from the Dock:

- **Transport** (Tool Age) — carries 6 land units across water. This alone fixes
  the islands archetype.
- **War Galley** (Bronze) — ranged ship, arrow volley, counters Transports and
  Fishing Boats, can bombard buildings within ~2 tiles of shore.
- **Dock upgrades** — a Shipwright research line for ship HP and speed, plus
  the existing Lighthouse bonus (+30% gather, +20% speed) extended to warships.

Shore bombardment matters more than it sounds: it means a coastal base is
genuinely exposed, which makes the `coast` and `river` archetypes tactically
different from `lakes` rather than cosmetically different.

**Implementation.** `Unit.water` and `waterPassable` already exist in the
pathfinding layer (`src/sim/pathfinding.ts`), and `waterRegion` distinguishes
dockable sea from ponds — so movement is largely solved. The hard parts are
load/unload UX on touch (tap transport → tap units → tap shore), and teaching
the AI to use boats at all, which it currently does not.

**Risk.** Naval AI is the classic place where RTS AIs fall over. An AI that
can't play islands is worse than no islands. Consider gating the islands
archetype behind AI naval competence, or offering an archetype filter (#27) in
the meantime.

**Impact** High · **Effort** L

---

## D. Buildings & base building

### 16. Walls that behave like walls

**Today.** Walls are 1×1 pieces (wood 4, stone 8, 380 HP) placed tap-tap-tap,
and — per the README — *every segment has a gate your own troops pass through*.
That's a lovely usability decision that removes the classic "my army is trapped
outside my own wall" problem, but it costs the wall its entire strategic
function: there are no chokepoints, no gates to hold, no geometry. A wall is a
damage sponge you drag around your base, and walling a real perimeter on the
current map is dozens of taps.

**Proposal.** Restore the geometry without restoring the frustration:

- **Solid wall segments** that block *all* units, friend and foe.
- **Gate** as an explicit building (wood 20, stone 30), openable/closable, that
  your units path through automatically when open and that can be garrisoned.
  Auto-close on enemy proximity is a nice touch that keeps the usability win.
- **Drag-to-build**: one gesture draws a wall line, with a live cost preview and
  a validity tint before you commit. This turns 30 taps into one drag and is the
  single biggest reason walls go unused today.
- **Auto-tiling**: corners, ends and junctions pick the right mesh so a wall
  reads as one structure. Greece's `towerWallHpMul: 1.25` finally has something
  worth applying to.
- **Wall Tower** (Bronze): raise a tower on top of an existing segment, cheaper
  than a free-standing tower and connected to the wall's line of fire. Pairs
  with the tower/wall adjacency bonus in #10.

**Implementation.** The pathfinding grid already has `F_WALL0`/`F_WALL1` flags
(`src/sim/pathfinding.ts`), which is where the pass-through behavior lives — so
making walls solid and gates permeable is a flag change, not an architecture
change. Drag-to-build is new input work in `src/ui/input.ts`, which already has
placement ghosts, rotation and confirm.

**Risk.** Solid walls resurrect the trapped-army problem for players who wall
badly. Mitigate with generous auto-pathing through your own gates and a clear
"no route" warning when a move order is unreachable.

**Impact** High · **Effort** M

### 17. Placement quality of life

**Today.** Placement is a deliberate cycle: tap to move the ghost, rotate with
⟳ or R, confirm with Build (`src/ui/input.ts`). Good for a single building on a
touch screen. Painful for eight houses, and worse for a farm ring. The ghost
also only tells you *that* a spot is invalid, not *why* — so a player trying to
place a Dock inland or a Lighthouse on a pond just gets refusal with no
explanation.

**Proposal.**
- **Drag to place a row** of houses, farms or walls; cost preview updates live,
  one confirm places the lot as a build queue.
- **Farm ring template**: one action lays a ring of farms around a Town Center
  in the standard optimal packing. This is a build order every player performs
  by hand every match.
- **Explanatory ghost**: color-code invalid placement by reason — red for
  occupied, amber for too steep, blue for "needs shore", with a one-line label.
  All of these predicates already exist in `canPlace`; they're just collapsed to
  a boolean at the UI boundary.
- **Shift-queue construction**: order a villager to build three things in
  sequence rather than babysitting each.

**Implementation.** All in `src/ui/input.ts` and `src/ui/hud.ts` plus a
`placementError(): string | null` variant of `canPlace` in `world.ts`. No sim
changes.

**Risk.** Templates can feel like the game playing itself. Keep them to
genuinely rote patterns (farm rings, house rows) and never to military layout.

**Impact** Medium · **Effort** M

### 18. Repair and building damage states

**Today.** `Building` tracks `progress` for construction and `lastHitT` for a
render flash — but there is no repair anywhere in the codebase. A tower that
survives a raid at 5% HP stays at 5% for the rest of the match. This has two
consequences: defensive buildings are a consumable rather than an investment, so
building them is often wrong; and there is nothing for villagers to do in the
lull after a raid, which is exactly when a player wants a constructive action.

**Proposal.** Villagers repair damaged buildings at a rate proportional to the
build rate, costing a fraction of the original resource cost, with multiple
villagers stacking. Add visible damage states at 66% and 33% max HP: scorch
marks, a missing roof section, a smoke plume. At <15%, the building visibly
burns and continues to lose HP slowly unless repaired — which creates urgency
without adding a new system.

**Implementation.** `updateBuild()` (`src/sim/sim.ts:583`) already drives a
villager toward a building and advances a value over time; repair is the same
loop writing `hp` instead of `progress`, with a cost drip. Damage states are
material swaps plus a particle emitter from `src/render/effects.ts`, which
already has a pooled `Particles` class. The AI should repair its own towers —
one line in its economy loop.

**Risk.** Repair makes towers much stronger defensively, again pushing toward
turtling. This is the third item (with #7 and #16) that pushes that direction —
which is precisely why #3 (siege) should land alongside them.

**Impact** High · **Effort** M

### 19. Capturable neutral structures — ✅ **shipped**

> **What landed.** A **Ruined Fort**: a neutral 3×3 derelict placed twice per
> map in the midfield. Standing in the yard with no enemy present claims it over
> 14 seconds; both sides present and the claim stalls entirely, which is what
> makes it somewhere to fight rather than somewhere to walk. A claim decays at
> 0.35× the rate it built up, so being driven off costs you progress without
> erasing it — you can come back. Holding one gives 17 tiles of vision and makes
> the fort a **forward drop-off** for gatherers, and it flies the holder's banner
> from the courtyard. New `World.reassignBuilding()` hands a standing building to
> a new owner, recomputing max HP against their faction and techs while
> preserving the wound as a fraction — taking a fort does not repair it. The AI
> spares two soldiers to claim forts once it has an army of six.
>
> The repopulating wolf dens and passive-yield wells from the proposal below did
> **not** land; the fort carries the idea on its own for now.


**Today.** The wilds layer is the best thing in the game and it is strictly
one-shot. `SiteState` is `dormant | active | cleared` (`src/core/types.ts:29`) —
you clear a wolf den, dig a cairn, buy the deserters, and that content is spent
forever. Six herds, two dens, two camps, six caches, two refugee sites
(`ENC`, `src/core/config.ts:409`), and after the first eight minutes the middle
of the map is inert scenery with a trading post in it.

**Proposal.** Add *persistent, contested* neutral points that never resolve:

- **Ruined Fort** — a derelict structure either side can repair (needs #18) and
  garrison (needs #7). Grants wide vision and acts as a forward respawn/rally.
  Can be taken and retaken all match.
- **Wells / Quarries** — neutral resource points that yield passively to
  whoever has units standing on them, or that need a captured flag structure.
  Gives armies a reason to be somewhere other than the two bases between waves.
- **Reactive wilds** — let a cleared wolf den *repopulate* after several
  minutes, and let herds migrate. Small change, keeps the middle alive.

**Implementation.** A fourth `SiteState` (`contested`) plus an `owner` field on
`EncounterSite`, and a capture-progress tick in `src/sim/encounters.ts`. The
minimap already draws sites as gold diamonds; recolor by owner.

**Why it matters.** The Golden Idol already proves this design works — one
contested object that any unit can carry, that drops where the carrier dies, and
that marks the carrier on the minimap. It generates more interesting play per
line of code than anything else in the file. #19 is asking for more of that.

**Impact** High · **Effort** M

---

## E. The AI

### 20. AI personalities

**Today.** One scripted opener in `src/sim/ai.ts`, varied only by the three
`DIFFICULTY` entries (`src/core/config.ts:437`), which change gather multiplier,
starting villagers, and wave timing/size. The build order is fixed: housing,
barracks, range, farms when berries run dry, storehouse, tower toward the
player, monument when rich, amphitheater, sometimes a wonder. Every match against
Normal unfolds the same way, and the second match is much easier than the first
for reasons that have nothing to do with the player improving.

**Proposal.** Four personalities, rolled per match and *shown in the setup
screen* so the player can prepare (or set to Random for the surprise):

- **Rusher** — skips the Tool-age economy, spearman pressure at ~5 minutes,
  never builds towers, collapses if you survive to Bronze.
- **Turtle** — towers and walls early, minimal aggression, a single overwhelming
  Iron Age push. Punishes greedy booming.
- **Boomer** — a third Town Center before any military at all. Punishes passive
  play; free win if you rush it.
- **Raider** — chariots and cavalry, targets villagers and trade carts, avoids
  buildings entirely, never commits to a fight. Teaches map awareness.

Each is the same code path with different weights and thresholds, so this is
tuning data plus a small amount of branching — not four AIs.

**Implementation.** Extract the current constants in `ai.ts` into a
`Personality` record (target villager count, wave composition, tower threshold,
age-up priority, target-selection weights) and select one at match start. The
existing `pickAttackTarget()` weight table (`ai.ts:355`) is already the right
shape for Raider vs. the rest — it just needs to be data.

**Risk.** Personalities multiply the balance testing matrix against 3–5 civs.
Start with two (Rusher, Boomer) as they're the most distinct.

**Impact** High · **Effort** M

### 21. Teach the AI to play the map

**Today.** The AI ignores the entire wilds layer. It doesn't hunt herds, doesn't
dig cairns, doesn't buy deserters, and doesn't contest the Golden Idol — a
permanent gold trickle sitting in the open. Its `pickAttackTarget()`
(`src/sim/ai.ts:355`) scores only *buildings*, weighting by distance from its own
TC with a 0.25 multiplier on a player Wonder and 0.85 on a Town Center. So it
will walk past your undefended villagers, past the Idol, to punch a house.
A human who engages with the wilds is playing a strictly richer game than the
opponent is.

**Proposal.**
- **Hunt herds** for early food — the gazelle/boar sites are placed in the
  middle distance precisely to reward this, and the AI never touches them.
- **Contest the Idol**: send a fast unit for it, and hunt the player's carrier
  when the minimap marks them.
- **Dig cairns and buy deserters** when gold-rich — the mercenaries are free
  military for an AI that can afford them.
- **Raid economies**: score villagers, trade carts and drop-off buildings as
  targets, not just structures. A raid that kills six villagers is worth more
  than one that razes a house, and the AI currently cannot express that.
- **Wolf awareness**: don't send lone villagers into an active den's raid
  radius (`wolfRaidRange: 38`).

**Implementation.** New scoring terms in `pickAttackTarget()`, plus a small
"opportunities" pass in the AI's economy loop that considers nearby sites from
`World.sites`. The AI already issues orders exclusively through the same command
API as the player, so nothing new is needed at the interface.

**Risk.** An AI that raids economies is *substantially* harder to play against,
especially on mobile without garrison (#7). Ship #7 first.

**Impact** High · **Effort** M

### 22. Honest difficulty

**Today.** Hard mode's advantage is `aiGatherMul: 1.15` against the player's 1.0,
plus 14 starting villagers to your 3 and faster waves. Easy is `0.62`. These are
economic handicaps, they're invisible to the player, and they mean "harder"
literally means "cheats more" rather than "plays better". A player who beats
Hard doesn't know whether they outplayed the AI or out-economied a bonus.

**Proposal.** Two changes:
- **Show the handicap.** Put the gather multiplier and starting villager count
  on the difficulty cards in the setup screen. Players respect an honest
  handicap and resent a hidden one.
- **Add a fourth tier with no economic bonus** (`aiGatherMul: 1.0`, same
  starting villagers as the player) that is hard because it plays better:
  scouts properly, reacts to what it sees rather than to a timer, retreats
  units below 25% HP toward its Temple, and times pushes against your age-up
  windows — which it can detect, since age progress sits in the TC queue.

**Implementation.** The setup screen already renders difficulty cards with
`name`, `icon`, `desc`; two more fields. The behavioral tier depends on #20's
refactor to make AI behavior data-driven.

**Risk.** "Plays better" is real engineering, not a config change. Scope it as a
follow-on to #20 and #21 rather than as its own project.

**Impact** Medium · **Effort** M

---

## F. UX & meta

### 23. Control groups and a hotkey layer

**Today.** Keyboard handling in `src/ui/input.ts:406` covers exactly four keys:
`Escape` (cancel), `R` (rotate placement), `Enter` (confirm placement), and
WASD/arrows for camera panning. There are no control groups, no build hotkeys,
no camera bookmarks, no "select all military" key (though there is a helmet
button). On desktop, playing this game is a mouse-only experience, which caps
how fast a competent player can act — and on mobile there's no equivalent at
all, so re-selecting your army after every fight is a fresh box-drag every time.

**Proposal.**
- **Desktop**: `1`–`9` to recall, `Ctrl+1`–`9` to bind, `Shift+1` to append;
  double-tap a number to center the camera on that group. Letter hotkeys for
  build menu entries (`H` house, `F` farm, `B` barracks…), `Space` to jump to
  the last alert, `.` for next idle villager (the counter already exists in the
  HUD), `,` for next idle military (see #24), `Home` for Town Center.
- **Mobile**: the same feature in a touch idiom — a slim group bar above the
  minimap showing up to four saved groups with unit-type icons and counts. Tap
  to select, tap again to center, long-press to bind the current selection.
  This is the mobile control-group solution and it costs one row of UI.

**Implementation.** A `groups: number[][]` array in the input layer, pruned of
dead ids on selection. The group bar reuses the existing thumbnail renderer
(`src/render/thumbnails.ts`), which already produces per-unit isometric icons.

**Risk.** None significant — this is additive.

**Impact** High · **Effort** M

### 24. Event feed and alerts

**Today.** The `SimEvent` union (`src/core/types.ts:150`) is remarkably complete:
`underattack`, `research`, `age`, `built`, `trained`, `nodeDepleted`,
`siteDiscovered`, `siteCleared`, `relic`, `farmWither`, `trade`, `wonderStart`,
`upgrade`, and more. Most of it is consumed only by the sound system
(`src/audio/sound.ts:134`) and by particle effects. The player is told almost
nothing they can act on: a farm withers silently, a gold vein runs dry silently,
a wolf den activates and starts eating villagers with a warning tone and no way
to find it.

**Proposal.** A compact event feed — four or five lines, top-left, auto-fading —
with **jump-to-location on tap**. Plus:
- **Under attack**: a persistent minimap ping at the location that stays until
  acknowledged, and a directional arrow at the screen edge if it's off-camera.
  This is the single most important alert in the game and it currently only
  makes a sound.
- **Idle military counter** next to the existing idle-villager button.
- **Economy alerts**: node depleted, farm withered, drop-off unreachable.
- **Timing alerts**: age-up complete, research complete, wonder countdown ticks
  (the wonder countdown is a 180-second win condition with, currently, minimal
  presentation).

**Implementation.** Purely presentational — a consumer of `drainEvents()` in the
HUD, plus a minimap ping layer. The events already carry `x`/`z` for every case
that needs it, so jump-to-location is nearly free.

**Why it's the best effort-to-impact ratio on this list.** The simulation is
already generating all of this information and throwing it away.

**Impact** High · **Effort** S

### 25. Tutorial and informative tooltips — 🟡 **tech tree shipped**

> **What landed.** The tech tree screen, opened by tapping the settlement chip: all six
> levels side by side, each listing the buildings, units and technologies it
> unlocks with costs, model-derived thumbnails and a Reached / You are here /
> Locked state. Everything is derived from the balance tables rather than
> hand-listed, so a new building appears the moment it is added to `config.ts` —
> the Siege Workshop showed up in it without a line of extra code. In-place
> upgrade targets (Shrine → Temple) are included even though they never appear
> in the build menu.
>
> The guided first match and per-unit tooltips are still open. The counter
> tooltip half of this entry partly landed with #1's "Strong vs" line.


**Today.** The game contains four ages, eight technologies, 21 building types,
13 unit types, six encounter kinds, three boons, a market exchange, a trade
system, a labor pool, and two victory conditions — and teaches none of it in
game. The README is excellent and no player will read it. There is no tooltip
showing what a unit costs relative to what it beats, no tech tree view, and no
indication that advancing to the Iron Age (460 food, 200 gold, 40 seconds) is
what unlocks the Wonder.

**Proposal.**
- **Guided first match** with objective prompts that advance on sim events:
  "Send three villagers to the berries" → "Build a house" → "Advance to the Tool
  Age" → "Train a spearman" → "Find the enemy". Each step highlights the
  relevant UI element. The event stream already fires everything needed to
  detect completion.
- **Rich tooltips** on every unit and building: full stats, cost, train time,
  what it counters, what counters it (needs #1), and which age unlocks it.
- **A tech tree screen** — a single scrollable view of all four ages showing
  what each unlocks, so a player can decide whether the Iron Age is worth it
  *before* committing the resources.
- **Contextual hints** for the systems that are currently invisible: the first
  time you see an encounter site, the first time you have 200 gold and a Market,
  the first time an enemy raid starts.

**Implementation.** Objective state machine reading `drainEvents()`; tooltips
are a data-driven render of `UNITS`/`BUILDINGS`/`TECHS`, which are already
complete and well-described (`desc` on every entry).

**Risk.** Tutorials are easy to make patronizing. Keep it skippable, keep it to
five minutes, and make the hint system dismissible permanently.

**Impact** High · **Effort** M

### 26. Save and resume a match

**Today.** The only persisted state in the entire game is a mute flag
(`localStorage.getItem('aa_muted')`, `src/audio/sound.ts:12`). A match on a phone
ends when a call comes in, when the browser reclaims the tab, or when the player
locks the screen. For a mobile-first game where a full match runs 20–40 minutes,
this is the most likely reason a session ends unsatisfyingly.

**Proposal.** Serialize the world and offer **Resume Match** on the title
screen. Autosave every 30 seconds and on `visibilitychange`, keep the last two
snapshots, and show a "resumed" toast so the player knows where they are.

**Implementation.** This is unusually cheap here because of an architectural
decision already made: the simulation is a fixed-timestep 10 Hz state object
fully separated from the renderer, which "only reads sim state + events". So the
save is `World` minus the derived caches — `units`, `buildings`, `nodes`,
`players`, `sites`, `grid`, `height`, `biome`, `explored`, `waterRegion`, `time`,
`tick`, `nextId`, plus the map seed. `hash` and `buildingHash` rebuild on load;
`projectiles` and `events` can be dropped. The typed arrays are the bulk —
`grid` is 264×264 bytes, `height` is a Float32Array of 265² — so IndexedDB
rather than `localStorage`, and gzip via `CompressionStream` brings a snapshot
to a few hundred KB.

**Watch for.** The AI's internal state (`attackers`, `nextWaveAt`, `waveN`) must
be serialized too, or a resumed match resets the AI's aggression clock.

**Impact** High for a mobile-first game · **Effort** M

### 27. Skirmish setup options and seed sharing

**Today.** Setup is two choices: civilization and difficulty. Meanwhile
`src/sim/map.ts` is 879 lines of genuinely good procedural generation — four
archetypes, four biomes, guaranteed land routes, per-civ starting landscapes,
encounter placement — and *none* of its knobs are exposed. The player can't ask
for an island map, can't ask for a resource-rich map, can't replay a map they
enjoyed, and can't show a friend the great river they got.

**Proposal.**
- **Map archetype**: Coast / Islands / Lakes / River / Random.
- **Map size**: Small / Medium / Large, scaling `MAP_W`/`MAP_H` — the current
  264×264 is large, and a smaller map would make aggressive play viable for
  players who want a 15-minute match.
- **Resource richness**: Sparse / Normal / Abundant, scaling `NODE_AMOUNT`.
- **Starting age**: begin in Tool or Bronze for players who want to skip the
  opening.
- **Victory conditions**: Conquest only / Wonder only / Both.
- **Seed**: display it on the loading screen, allow entering one. This turns a
  good generator into something players can share and talk about.

**Implementation.** Almost entirely plumbing — `generateMap()` already takes an
RNG, and the constants it reads are module-level. Threading a config object
through is straightforward; the setup screen (`src/ui/screens.ts`) grows a
second page.

**Risk.** Option paralysis on a phone. Default everything to Random/Normal and
put the options behind an "Advanced" disclosure.

**Impact** Medium · **Effort** S

---

## G. Visuals & audio

### 28. Day/night cycle and weather

**Today.** One `DirectionalLight` at fixed color `0xffeed2` and intensity 2.9,
one `HemisphereLight`, and a static `THREE.Fog(0xc3d8cf, 110, 235)`
(`src/render/view.ts:117-126`). ACES tone mapping and PCF soft shadows are
already set up, so the lighting *pipeline* is good — it just never changes.
Every match, at every moment, looks like the same noon. The age-up pass adds
braziers to buildings that never have a reason to glow.

**Proposal.**
- **Day/night cycle** on a slow loop (one full cycle per ~12 minutes of match
  time, starting at morning). Sun color, intensity, elevation and fog color all
  drive from a single time-of-day curve. At night, braziers, torches and the
  Lighthouse actually light the city — the assets for this are already being
  placed.
- **Night vision penalty**: unit sight radius −20% at night. Small, but it turns
  the cycle from decoration into a reason to time an attack, and it gives
  Egypt's Obelisks (#12) a moment where they shine.
- **Weather by biome**: sandstorms over desert that cut visibility and desaturate,
  rain over the lush biome that darkens the palette and adds ground wetness.
  The `biome` array (`World.biome`: 0 desert, 1 grass, 2 lush, 3 highland)
  already exists per tile, so weather can be regional rather than global.

**Implementation.** A `TimeOfDay` module feeding the view's lighting each frame;
fog color lerps alongside. Weather is a particle system (the pooled `Particles`
class in `src/render/effects.ts`) plus a fog-density modifier and a vision
multiplier in `updateFog()`.

**Risk.** Night that's actually dark is unplayable on a phone in daylight. Keep
the night floor bright — a blue-shifted dusk, not blackness — and make the cycle
optional in settings.

**Impact** High · **Effort** M

### 29. A juice pass — 🟡 **collapse, dust and decals shipped**

> **What landed.** Buildings now *fall*: the mesh holds for a fifth of the span,
> then drops, leans and squashes into the ground on an accelerating curve while
> ground dust rolls out from under it and the rubble beneath fades up to meet it.
> Anything that was burning keeps burning as it goes and gutters out with the
> roof. A pooled **decal system** (one draw call, 96 quads, each sampling terrain
> height at its own four corners so marks lie along a slope) lays scorch where a
> building fell and blood where a soldier did. Marching armies raise dust at a
> low per-unit rate, so one scout barely stirs the ground and a column trails a
> plume. Removing `rubbleGeo`'s hard-edged ground plate in favour of the soft
> scorch was part of this — the two side by side read as a bug.
>
> Still open from this entry: arrows that stick, contact shadows/SSAO, selection
> ring pulses, and scoped bloom.


**Today.** The art direction is genuinely strong: flat-shaded merged geometry,
one draw call per entity, GPU-instanced trees and paving, procedural everything.
But impacts are thin. A `boom` event removes a building from the scene — there
is no collapse, no rubble, no dust. Arrows vanish on hit. Deaths are a single
animation clip and then the unit is gone. The game *looks* better than it
*feels* to hit things in.

**Proposal.**
- **Building collapse**: on `boom`, drop the roof, emit a dust ring scaled by
  footprint `size`, and leave a low rubble mesh that persists for 30 seconds
  before fading. Razing a Town Center should be an event you feel.
- **Screen shake** scaled by footprint size, capped low enough not to nauseate.
- **Projectile persistence**: arrows stick in the ground and in shields for a
  few seconds. The `arrowGeo()` helper already exists in
  `src/render/effects.ts:226`.
- **Ground contact**: cheap SSAO or a contact-shadow blob under every unit.
  Flat-shaded low-poly art lives or dies on ground contact, and this is the
  single biggest visual upgrade available.
- **Dust and decals**: dust plumes under moving groups, scorch decals where
  buildings burned, blood decals that fade.
- **Selection feedback**: rings that pulse on command acknowledgment, a brief
  ground flash at the move destination.
- **Bloom**, tightly scoped: braziers, gold piles, the Golden Idol, and the
  Wonder. Not a global bloom — a threshold high enough that only emissive
  things glow.

**Implementation.** Nearly all of this builds on the existing pooled `Particles`
and `Markers` classes. Bloom and SSAO mean adding an `EffectComposer`, which is
the one real cost — budget a mobile performance pass, and gate post-processing
behind a quality setting.

**Impact** High · **Effort** M

### 30. Audio depth

**Today.** `src/audio/sound.ts` is 155 lines of well-crafted procedural WebAudio:
throttled one-shots for chop, mine, hammer, deposit, arrow, swing, impact,
death, boom, trained, built, research, warn, victory, defeat. It's good work and
it's the entire audio design. There is no music, no ambience, no spatialization
— every sound plays at the same volume regardless of where on a 264×264 map it
happened, filtered only by whether that tile is explored.

**Proposal.**
- **Spatialize**: route through `PannerNode` (or simple stereo pan + distance
  attenuation from camera position). A raid on the far side of your base becomes
  *audible* before it's visible, which is real gameplay information delivered for
  almost no cost.
- **Ambient beds per biome**: desert wind, shore surf, forest birds, highland
  wind — crossfaded by what the camera is looking at, using the existing
  per-tile `biome` array. Synthesized noise through shifting filters gets most
  of the way there without breaking the no-assets rule.
- **Adaptive music**: a slow procedural or lightly composed bed per faction,
  layered so that combat adds percussion and intensity when your units take
  damage, and drops back out afterward. The Wonder countdown deserves its own
  escalating cue — it's a 180-second win condition currently marked by a toast.
- **Unit barks**: short synthesized acknowledgments on selection and command,
  distinct per unit class. This is the cheapest "the game feels alive" upgrade
  available.
- **Mix discipline**: duck ambience under alerts so the under-attack warning
  (#24) always cuts through.

**Implementation.** The existing `tone()`/`noise()` primitives already take
gain, filter and delay options; adding a panner and a distance term to the
event dispatcher (`src/audio/sound.ts:134`) covers spatialization. Ambience and
music are new but stay within the project's synthesized-everything constraint.

**Impact** High · **Effort** M

---

## Suggested order

**Tier 1 — structural fixes, small to medium.** #1 (counters) and #3 (siege)
are done. Next: #24 (event feed), the best effort-to-impact ratio left — the
simulation already generates the data and the HUD throws it away. Then #7
(garrison), which fixes the game's worst mobile-usability moment; #8
(specialist camps), which gives the enormous map an economic reason to exist;
and #26 (save/resume), which stops phone sessions from ending badly.

**Tier 2 — identity.** #12 and #13 are done: unique buildings, unique
technologies and roster gaps have converted three stat-multiplier civs into
three ways to play, and the AI now plays its own civilization rather than a
generic one. What remains here is #20 and #21, to stop every match against the
AI from unfolding identically, and #5, #6 and #18 to round out the combat and
city feel. #6 (formations) is now worth more than it was: Phalanx Drill is
written against units standing close together, and formations are what would
let a player produce that on purpose rather than by accident.

**Tier 3 — scope.** #15 (navy) makes a quarter of generated maps playable as
designed. #14 (new civs) and #25 (tutorial) are what make the game feel finished
to a new player.

**A note on balance direction.** #7 (garrison), #16 (solid walls), #18 (repair)
and #10 (tower/wall adjacency) all push toward defense. #3 (siege) is the
counterweight, and it is now in — which means the defensive items are safe to
build on top of. Note that #1 already moved the needle here on its own: building
armor makes melee razing roughly 30% slower and arrows nearly useless against
stone, so a fortified town is meaningfully harder to crack than it was even
before a single garrison lands.

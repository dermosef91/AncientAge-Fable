# Ancient Age — 30 Proposals: Exploration, the City, and an Identity of Its Own

A second design backlog, written against the code as it stands (`src/`, ~13.7k
lines) and against what already shipped from `docs/IMPROVEMENTS.md`. Three
questions, ten answers each:

- **A. The wilds** — make exploring the map something the player *wants* to do
  all match, not a five-minute chore before the real game.
- **B. The city** — make raising a settlement exciting and rewarding in itself,
  not just a queue of foundations that unlocks military.
- **C. An identity of its own** — move the game out from under the shadow of
  Age of Empires, which it currently follows very closely.

Each entry keeps the house format: **Today** (the gap, with file and value
references), **Proposal** (the design, with numbers), **Implementation** (where
the work lands), **Risk** (the tradeoff). Tags: **Impact** · **Effort**
(S / M / L).

---

## A. Exploration — make the map worth walking

### 1. A scout, and a scout that grows — ✅ **shipped**

> **What landed.** A `scout` at Camp level (35 food, speed 4.6, vision 15, 45 HP,
> attack 2, cannot gather or build) trained at the Town Center, plus an
> `Explore` order that walks the frontier on a coarse 33×33 summary of the fog
> and picks the next patch on arrival. Pathfinder rank is credited from the
> encounter layer — one rank per site per side, capped at five, worth +1 vision
> and +4% speed each — and a scout that is shot at runs for home rather than
> fighting. It is excluded from the army button, from attack orders, from
> military technologies and from the "train soldiers" objective, so it never
> quietly becomes a cheap skirmisher. The rival trains one in its opening and
> explores against its own coarse record of where it has been, since it keeps
> no fog to read.

**Today.** There is no scout unit. Every land unit reveals a fixed radius of 8
tiles and every boat 9.5 (`updateFog`, `src/sim/sim.ts:975`), so the cheapest
way to explore is to send a villager — a unit you need in the mine — or a
spearman you would rather have at home. Exploration therefore costs you the
early game, which is exactly why players stop doing it.

**Proposal.** A **Scout** at Camp level: 35 food, no gold, pop 1, speed 4.6,
vision 15, 40 HP, attack 2 (enough to finish a wounded gazelle, not enough to
fight). It cannot gather or build. Two things make it worth keeping alive:

- **The scout learns the country.** Each encounter site it discovers grants a
  Pathfinder rank: +1 vision and +4% speed, to a cap of +5 (vision 20, speed
  5.5). A veteran scout at rank 5 is a genuinely valuable piece and losing it to
  a wolf pack should sting.
- **An explicit `Explore` order.** Tap the scout, tap **Explore**, and it walks
  a frontier route on its own — repeatedly picking the nearest large blob of
  unexplored cells, pathing to it, and moving on. This is the single most
  important half of the idea on a phone: exploration must not cost a hundred
  taps.

**Implementation.** A `scout` entry in `UNITS` (`src/core/config.ts:98`) with
`level: 0`, trained at `towncenter`. A `rank` field on `Unit`, incremented from
`checkDiscovery` (`src/sim/encounters.ts:81`) when the discovering unit is a
scout; `updateFog` reads `8 + u.rank`. The explore order is a new `Task` type
(`explore`) resolved in the sim: scan the `explored` bitmap on a coarse 8×8
summary grid, pick the nearest unexplored cluster, issue a move, repeat on
arrival. The frontier scan is cheap at 33×33 summary cells.

**Risk.** A free explorer makes the map trivially known by minute six, which
weakens every other entry in this section. Pair it with #2 so knowing a place
once is not the same as watching it forever.

**Impact** High · **Effort** M

---

### 2. Explored is not visible: a real shroud, and last-known intel

**Today.** `explored` is a one-shot permanent reveal (`src/sim/world.ts:31`,
`markExplored` at `:1009`). Walk a villager past the enemy town once at minute
three and you watch that town, live, in full detail, for the rest of the match —
every unit and building is drawn as long as its cell was ever seen
(`src/render/view.ts:513`, `:906`, `:1078`). There is no reason to ever scout
the same place twice, no reason to build a tower for its eyes, and no bluff or
surprise attack is possible in either direction.

**Proposal.** Two layers, the classic and correct model:

- `explored` — what you have ever seen. Terrain, resources and the shape of the
  land stay drawn. Unchanged.
- `visible` — what you can see *right now*, recomputed every tick from unit and
  building vision. Enemy units are drawn only where `visible`.

In explored-but-not-visible ground, enemy **buildings** stay drawn as a
desaturated "last known" ghost, frozen at the state you last saw: the health bar
it had, the level it was. Walk back and the ghost snaps to the truth — including
the unpleasant surprise of three new towers. Terrain fog gets a third tone:
black (unknown), dim blue (remembered), clear (seen).

This one change gives every vision source in the game a job. Watch towers become
eyes (11 tiles, `sim.ts:981`), the Lighthouse becomes coastal radar (14), the
Ruined Fort's 17 tiles of vision (`ENC.outpostVision`) becomes the real reason to
hold it, and a scout parked on a ridge becomes a genuine strategic asset.

**Implementation.** A second `Uint8Array` on `World`, cleared and rewritten in
`updateFog` each tick (264×264 = 70k cells, trivial at 10 Hz with a radius
stamp). `Terrain.updateFog` (`src/render/terrain.ts:592`) draws two mask passes
instead of one. `View` gates enemy unit meshes on `visible` rather than
`explored`, and keeps a `lastSeen` snapshot per enemy building for the ghost.
The minimap follows the same rule.

**Risk.** This is a genuine difficulty increase — the player loses information
they currently get free, and the AI must not cheat by seeing through it (it
already reads world state directly in `src/sim/ai.ts`; leave that honest gap
documented rather than pretending). Also the single largest change in this
document to the *feel* of a match. Ship it behind a setup toggle first.

**Impact** High · **Effort** M

---

### 3. The Chronicle: a discoveries screen, and cartography that pays

**Today.** Discovery emits a toast and a gold diamond on the minimap
(`siteDiscovered`, `src/sim/encounters.ts:88`; `src/ui/minimap.ts:101`) and then
vanishes from the interface. There is no record of what you have found, no sense
of how much map is left, and nothing that rewards the act of mapping as such —
only the individual payouts.

**Proposal.** A **Chronicle** screen, opened from the settlement chip beside the
tech tree, in three panels:

- **The land** — percent explored, with a thumbnail of the map as you know it,
  and the archetype named once you have seen enough of it ("A great river with
  fords").
- **Discoveries** — every site you have found, by kind, with its state
  (*known* / *cleared* / *held*) and what it gave you. Tapping one centres the
  camera on it. The unfound are shown as counted silhouettes: "Cairns 3 / 6".
  That counter alone will send players back out.
- **Boons** — the three current boons (`BOONS`, `src/core/config.ts:502`) plus
  everything this document adds, with time remaining.

And **Cartography milestones**: at 30 / 55 / 80% explored, a free permanent
reward — +1 vision on all units, then the trading post and all remaining forts
marked, then a one-off 150 gold "the maps are worth money to someone". Small
numbers, but they turn exploring into a track with a bar on it.

**Implementation.** A new screen in `src/ui/screens.ts` in the style of
`src/ui/techtree.ts`. Percent explored is a cheap running count maintained in
`markExplored`. Milestones are three thresholds checked in `sim.ts` beside the
existing win checks.

**Risk.** Low. Mostly UI, and UI is where this game's exploration layer is
currently thinnest.

**Impact** High · **Effort** S

---

### 4. Named landmarks with one mechanic each — ✅ **shipped**

> **What landed.** One landmark per map, placed further out than any other
> site, rolled from four rather than the six proposed: **Beacon Hill** and the
> **Obelisk of the Lost** are claimed with the ruined fort's capture logic
> (refactored into a shared `stepCapture`) and grant, respectively, a permanent
> reveal plus +3 vision on every unit, and 0.6 HP/s to the holder's units
> anywhere on the map; the **Amber Grove** seeds nine tree nodes at four times
> the usual timber, laid in a gapped ring and rolled back if it would block the
> land route; the **Oracle Spring** reveals the rival's town and names the
> composition of their army when a villager drinks. The Sunken Temple and Salt
> Flats did not land.

**Today.** Seven site kinds, all generic and all repeated: 6 herds, 2 dens, 2
camps, 6 cairns, 2 refugee groups, 2 forts, 1 idol (`ENC`,
`src/core/config.ts:509`). Only the Golden Idol is unique, and it is comfortably
the most memorable thing in the game — which is the lesson.

**Proposal.** One **Landmark** per map, drawn from a table of six, placed in the
deep field like the idol and worth a march across the whole board:

| Landmark | What it does |
| --- | --- |
| **The Oracle Spring** | A villager who drinks reveals the rival's town centre and current army composition — once, permanently, at the moment of drinking |
| **The Sunken Temple** | Enshrine the Idol *here* instead of at home: double trickle, but it is out in the open for anyone to take |
| **Obelisk of the Lost** | Claim like a fort; while held, all your units regain 1 HP/s anywhere on the map |
| **The Amber Grove** | Ancient trees: 4× wood per node, and they never regrow |
| **The Salt Flats** | A field of stone nodes with no cover for a mile — rich, and indefensible |
| **The Beacon Hill** | The map's highest ground; claim it to reveal a 40-tile circle permanently and light a fire the rival can see from anywhere |

Each is a distinct silhouette on the horizon, visible from far off through fog
as a shape you have to walk to identify — which is the exploration hook doing
its own advertising.

**Implementation.** Extend `EncounterKind` and add a `landmark` branch to the
placement block (`src/sim/map.ts:723`) using the idol's "as far from both
thrones as the land allows" search (`:860`). Each behaviour is a small case in
`Encounters.step`; three of the six reuse the fort's capture logic verbatim
(`stepOutpost`, `src/sim/encounters.ts:276`). Models go in
`src/render/wilds.ts`.

**Risk.** Six landmarks is six balance problems. Ship two (Beacon Hill, Amber
Grove — the two with the least new code) and add the rest once the frame holds.

**Impact** High · **Effort** M

---

### 5. Living wilds: herds migrate, dens repopulate, caravans cross

**Today.** Sites resolve once and go inert. `state` is
`dormant | active | cleared` (`src/core/types.ts`), and after the first eight
minutes the middle of the map is scenery with a trading post in it. The ruined
fort was the first fix for this and it works — it is never spent — but it is
alone.

**Proposal.** Give the wilds a clock.

- **Herds migrate.** A herd that has not been hunted for 90 seconds picks a new
  anchor 20–40 tiles away and walks there, grazing. Food you scouted is food you
  have to find again — and a herd may wander into your farmland, or into the
  rival's.
- **Dens repopulate.** A razed den leaves a `dormant` site that revives after
  4–6 minutes with a fresh pack unless someone has built within 12 tiles of it.
  Building over the wilds is how you make land safe.
- **Caravans cross.** Every 3 minutes a neutral merchant train (3 pack mules and
  2 guards) walks a straight line between two random map edges via the trading
  post. Escort it to your market for 120 gold; rob it for 80 gold and a
  reputation hit (see #25); ignore it and it leaves. It is a moving objective,
  visible on the minimap once inside your vision, and it makes the midfield
  interesting at minute 20.

**Implementation.** `stepHerd` (`src/sim/encounters.ts:132`) gains a migration
timer and an anchor rewrite. Dens get a `respawnAt` field and a check in
`onWildsBuildingRazed` (`:459`) that sets `state = 'dormant'` instead of
`cleared`. Caravans are a new site kind spawned on a timer with a scripted
patrol path — the pathfinder already handles long routes (`A*` with
string-pulling, `src/sim/pathfinding.ts`).

**Risk.** Migrating herds can walk into a player's base and be free food, or off
into a corner and be dead content. Clamp the anchor to the middle third of the
map and away from both towns.

**Impact** High · **Effort** M

---

### 6. Read the ground: vantage, fords and cover

**Today.** The map generator produces real terrain — heights, biomes, four
archetypes with fords and island chains (`src/sim/map.ts:46`) — and the
simulation ignores all of it. Height affects nothing. A ford is just a cell that
happens to be passable. So the map is a beautiful backdrop that never repays
being read.

**Proposal.** Three rules, no new systems:

- **High ground sees further and shoots further.** A unit standing at least 1.2
  world units above the target gets +25% vision and +15% range; the reverse
  costs 10% range. Suddenly the ridge is a place, and taking it is a decision.
- **Woods conceal.** A unit standing among trees is not drawn to an enemy whose
  own units are further than 6 tiles away, even inside their vision. Ambush
  becomes possible; forest edges become tactically meaningful; the tree
  instancing already knows where every trunk is.
- **Fords are named and marked.** At map generation, tag the two or three
  narrowest land crossings and the river fords; show them on the minimap once
  explored, with a name in the Chronicle. A player who knows where the fords are
  is playing the map, not the mini-map.

**Implementation.** `heightAt` already exists (`src/sim/map.ts`, used by
`civic.ts`). Range and vision modifiers go in the attack resolution and
`updateFog` respectively. Concealment is a check in the visibility gate from #2.
Ford detection is a width scan over the passability grid at generation time.

**Risk.** Height bonuses are invisible unless the UI says so — put the modifier
on the selection panel the way `ARM melee/pierce` already is, or players will
just feel randomly unlucky.

**Impact** Medium · **Effort** M

---

### 7. Free peoples: neutral villages you can court or crush — ✅ **shipped**

> **What landed.** Two Free Villages per map — a named cluster of huts with
> their own folk, owned by the wilds and hostile to nobody. Courting costs 200
> food and an envoy standing among them, and pays 0.4 gold/s plus two
> **Slingers** (a new unit that cannot be trained, only given). Taxing needs
> three soldiers in the village and pays 0.18 gold/s, stopping twelve seconds
> after the last one leaves. Sacking means razing every hut in combat: 250 in
> mixed loot, and a permanent mark on that player which every other village
> reads — they will not treat with them again. The rival courts villages on the
> same terms and never sacks one. Allegiance shows as a coloured ring on the
> minimap and a line in the selection panel.

**Today.** The wilds are wolves, boar, deserters and refugees — all either food,
loot or hazard. The deserters' camp is the only site that offers a *choice*
(pay 140 gold or take the stash by force, `stepCamp`,
`src/sim/encounters.ts:180`), and it is the best-loved beat in the layer. There
is exactly one of it, and it resolves in a single tap.

**Proposal.** Two **Free Villages** per map: neutral settlements of 6–8 huts with
their own villagers, a headman, and a name. They are not hostile. What you do
with them is the point:

- **Court them** — deliver 200 food to the headman and they become a
  *tributary*: +0.4 gold/s, and their two best fighters join you as a
  distinctive unique unit (Slingers on the coast, Horse Nomads on the plain).
- **Tax them** — station 3 soldiers in the village and they pay half as much,
  resent it, and will flip to the rival the moment your soldiers leave.
- **Sack them** — 250 mixed loot immediately, the huts burn, and every other
  free village on the map raises its price by half and will never treat with
  you again.

The rival is doing the same thing, so a courted village is a village denied.
Their allegiance shows as a banner on the minimap.

**Implementation.** A site kind with a small building cluster and a
`allegiance: -1 | 0 | 1` field; the tribute and flip logic sit in a `stepVillage`
case. `reassignBuilding` (added for the forts) already hands standing buildings
to a new owner with HP preserved. The unique units are two `UNITS` entries with
`level: 0` and no trainer.

**Risk.** This is a diplomacy system in a game with no diplomacy, and it will
feel bolted on unless the AI engages with it (see #21 in the first backlog — the
AI still ignores the wilds entirely apart from forts, `src/sim/ai.ts:370`). Do
not ship this without giving the AI a courting routine.

**Impact** High · **Effort** L

---

### 8. A rival who explores, and a race you can see

**Today.** The AI touches exactly one part of the wilds: it sends two soldiers to
contest ruined forts once it has an army of six (`src/sim/ai.ts:370`). It never
hunts, never digs, never buys deserters, never takes the Idol. A player who
engages with the wilds is playing a richer game against an opponent who is not
playing it at all — which is generous, and also means exploration has no
opposition and therefore no tension.

**Proposal.** Give the rival a scout of its own and make the race legible:

- The AI trains one scout in its opening and explores with it on the same
  frontier routine as #1.
- It values sites: cairns near its base, herds when its food is low, deserters
  when it is rich, refugees always, and the Idol above everything once its army
  can escort a carrier.
- **You can see the race.** When the rival clears a site you had discovered, a
  toast: "The rival has taken the cairn at the old ford." When the rival's scout
  crosses your vision, it pings. First blood on a contested site posts to the
  event feed. The Chronicle marks sites *lost to the rival* in the rival's
  colour.

Nothing here needs new mechanics; it needs the opponent to want the same things
you want, and the interface to say so.

**Implementation.** A `wilds` planner in `src/sim/ai.ts` next to the existing
build/attack planners, scoring sites by kind, distance and current resource
deficit, dispatching through the same command API the player uses. Site-cleared
events already carry an owner (`siteCleared`, `src/sim/encounters.ts:318`); the
toast layer just needs to listen for `owner === 1`.

**Risk.** An AI that takes the Idol on Hard is a large power swing. Gate the Idol
hunt on difficulty and give the AI carrier a visible escort so it can be
intercepted — a marked carrier crossing the map is a fine thing to fight over.

**Impact** High · **Effort** M

---

### 9. Danger in the deep field

**Today.** Exploring is free after minute four. Wolves only raid within 38 tiles
of their den and only after a 240-second grace (`ENC.wolfRaidGrace`), the
deserters only fight if provoked, and nothing else in the wilds is hostile at
all. A lone villager can walk the entire 264×264 map and come home.

**Proposal.** Make the far country cost something, so that the scout that comes
back matters:

- **Bandit ambush.** Ruins, dense woods and narrow passes hold a 20% chance of
  springing 2 bandits on the first unit to pass — hostile to both players, gone
  in 30 seconds if you leave. A scout survives by running; a lone villager does
  not.
- **Bad ground.** Marsh cells halve speed; scree on the highlands does the same
  and blocks wheels entirely, so siege and trade carts must go around. The
  pathfinder needs a movement-cost channel it does not have yet — which is worth
  having regardless.
- **Thirst in the deep desert.** On desert archetypes, units more than 45 tiles
  from any of your buildings lose 1 HP every 4 seconds. Forward storehouses and
  captured forts become the infrastructure of a long campaign, which is exactly
  what the fort's drop-off already hints at.

**Implementation.** Ambushes are a spawn on a discovery flag, reusing the wolf
behaviour. Movement costs are a per-cell `Uint8Array` consulted by the A* cost
function (`src/sim/pathfinding.ts`) and the steering speed. Attrition is a slow
scan in the sim tick, gated on archetype.

**Risk.** Attrition punishes exactly the behaviour this section is trying to
encourage. It is here because the reward side (#3, #4, #5) is being raised at the
same time; if only one ships, ship the reward.

**Impact** Medium · **Effort** M

---

### 10. The trading post as a hub — bounties and rumours

**Today.** The trading post is the target of trade carts and nothing else. It is
placed at the centre of the map (`src/sim/map.ts:700`), the Market reveals it
(`sim.ts:632`), and it never speaks. A neutral structure sitting in the middle of
the contested ground, doing one thing.

**Proposal.** Make it the place the wilds talk to you from. Once a unit of yours
has stood at the post, it offers:

- **Rumours** — for 50 gold, the location of one undiscovered site of your
  choosing by kind ("where the cairns are"). Cheap, repeatable, and a direct
  gold-into-exploration conversion for a player who has gold and no time.
- **Bounties** — one open contract at a time, refreshed every 3 minutes, drawn
  from what the map actually holds: *Clear the den in the eastern woods* (150
  food), *Hold the northern fort for 2 minutes* (120 gold), *Bring three
  refugees home* (a free villager and Gratitude), *Escort the caravan* (200
  gold). The rival can complete them too, and the post announces who did.
- **The post remembers.** Trade carts to a post you have done business with earn
  +10%.

This gives exploration a *goal channel* — a small, always-live list of things to
go and do that is generated from the map you were given.

**Implementation.** A `TradePost` state object holding the open bounty and its
timer, evaluated in `Encounters.step` against site states it already tracks. UI
is a panel on the existing selection surface when a unit stands at the post, plus
a line in the Chronicle. Rumour purchase calls `markExplored` at the chosen
site's position with a small radius.

**Risk.** Bounties can read as an MMO quest log pasted onto a strategy game. Keep
them diegetic (a merchant's problem, phrased in the game's voice), keep exactly
one live at a time, and never let one point at something the player cannot reach.

**Impact** High · **Effort** M

---

## B. The city — make building it the reward

### 11. Districts and adjacency — ✅ **shipped**

> **What landed.** `src/sim/districts.ts`, recomputed whenever a player's city
> changes shape (built, razed, upgraded, changed hands, or the settlement grew
> and dressed itself). Six bonuses shipped: a street of houses (+1 pop, +1 more
> beside a garden or plaza), the drill yard (−15% train time), the exchange
> (+20% trade gold), the field system (+10% farm yield), the depot (+10%
> gathering near a storehouse in a rich seam) and the sacred games (+50% heal
> range). Population became a derived quantity rather than an accumulated one,
> which also fixed a latent bug where the `POP_MAX` clamp could permanently eat
> housing. The placement ghost previews the bonus live, because an adjacency
> system nobody can see before committing is not a system.

**Today.** Placement is deliberate — ghost, rotate, confirm — but placement has
no consequences. A house is worth exactly 5 population whether it stands in a
neat quarter beside a plaza or alone in a swamp two hundred tiles away
(`BUILDINGS`, `src/core/config.ts:242`). The civic layer already computes the
thing that would make this work: it links every finished building to its nearest
neighbour and to the nearest hub (`planCivic`, `src/sim/civic.ts:75`,
`ROAD_REACH = 17`). The game knows your city has quarters. It just does not care.

**Proposal.** Adjacency bonuses on a 6-tile radius, shown live in the placement
ghost as a small "+" readout, so the player is solving a light puzzle every time
they build:

| Cluster | Bonus |
| --- | --- |
| House beside 2+ houses | +1 pop each (a street is worth more than a farmstead) |
| House within reach of a garden or plaza | +1 pop, and the model gains its richer dressing |
| Barracks + Archery Range + Siege Workshop within 8 tiles | *Drill Yard*: −15% train time for all three |
| Market + Forum adjacent | *Exchange*: +20% trade cart gold |
| Farm beside 2+ farms | *Field system*: +10% farm rate each |
| Storehouse within 6 of 3+ resource nodes | *Depot*: +10% gather rate at those nodes |
| Temple/Shrine + Amphitheater | *Sacred Games*: heal aura range +50% |

**Implementation.** A recompute pass over a player's buildings whenever one
finishes or falls, writing a small `bonuses` record per building; the sim reads
it where it already reads `pop`, `trainTime` and gather rate multipliers. The
placement ghost previews it by running the same function against the candidate
position. `civicAt` (`src/sim/civic.ts`) already gives a cheap spatial index.

**Risk.** Optimal layouts become mandatory layouts and the city stops looking
like a city. Keep every bonus small (10–20%) so a pretty city and an efficient
one are within a few percent of each other.

**Impact** High · **Effort** M

---

### 12. Splendour: make the beauty pay

**Today.** The city dresses itself and it is the game's best trick — streets worn
into the dirt, paved in stone at Town, gardens from Hamlet, plazas from Village,
statues from Town (`ornamentKinds`, `src/sim/civic.ts:58`). It is also entirely
cosmetic: "It is all scenery: nothing blocks a path" (README). The player watches
their city get beautiful and gains nothing from it.

**Proposal.** A fifth, soft resource: **Splendour**, shown as a small laurel
counter beside the four resources. It accrues from what the city *is*, not what
it does:

- +1 per finished building, +2 per ornament (garden/plaza/statue), +5 per paved
  road segment tier, +25 per Monument, +40 per Wonder, +10 per landmark held.
- Splendour buys nothing directly. It crosses thresholds:

| Splendour | Effect |
| --- | --- |
| 50 | **Word spreads** — a free villager arrives at your Town Centre every 90s |
| 120 | **Renown** — settlement upgrades cost 10% less |
| 220 | **The city that draws people** — +5 population cap above `POP_MAX` |
| 350 | **Glory** — all units +10% HP while your Wonder or Monument stands |

The point is that decorating, paving and finishing your city — things the game
already does beautifully and charges nothing for — become a real strategic line
you can invest in against military or economy.

**Implementation.** A running `splendour` number per player updated in the same
places `noteBuilt` fires and in `civicLevelUp` (`src/sim/civic.ts:87`).
Thresholds are checked in the sim tick. `POP_MAX` (`src/core/config.ts:9`)
becomes a soft cap with a per-player bonus.

**Risk.** A fifth resource on a phone HUD is real screen cost. Show it as one
small number with a tap-to-expand breakdown, and never make it something the
player has to *manage* — only something they accumulate.

**Impact** High · **Effort** M

---

### 13. Buildings that specialise

**Today.** One building in the game upgrades: `shrine → temple`
(`upgradesTo`, `src/core/config.ts`). It is the most satisfying single
interaction in the build menu — the model transforms in place, the aura more
than doubles — and it exists exactly once. Everything else is static from the
moment it finishes to the moment it burns.

**Proposal.** At Town, every core building offers a one-time fork, chosen from
its panel, cheap in resources and slow in time. Two branches, mutually exclusive,
each with its own model dressing:

| Building | Branch A | Branch B |
| --- | --- | --- |
| Storehouse | **Granary** — food +15% within 12 tiles | **Ore Yard** — stone/gold +15% within 12 |
| Barracks | **Drill Hall** — infantry train 25% faster | **Armoury** — infantry +1 melee armor |
| Archery Range | **Fletcher** — archers +1 range | **Stables** — cavalry/chariots +10% speed |
| Market | **Bourse** — better exchange rates | **Caravanserai** — +1 trade cart cap, +15% gold |
| Tower | **Bastion** — +50% HP, garrison 3 | **Signal Tower** — vision 18, marks enemies |
| Farm | **Terrace** — +30% yield on slopes | **Orchard** — slower, never needs reseeding |

Now two cities of the same civilisation at the same level are visibly and
mechanically different, and the player has made a dozen small authored choices
by minute twenty.

**Implementation.** Generalise the existing `upgradesTo` into
`branches?: [BuildingTypeId, BuildingTypeId]` and reuse the in-place upgrade path
that shrine→temple already walks. The models are re-dressings of existing
geometry in `src/render/models.ts`, which is already built to re-dress everything
at each settlement level.

**Risk.** Twelve new building variants is a lot of model work. Start with
Storehouse and Barracks — the two whose effects need no new systems at all.

**Impact** High · **Effort** M

---

### 14. A city you can defend: garrison, repair and visible wounds

**Today.** Buildings burn while under attack and for a few seconds after
(`src/render/effects.ts`) — a genuinely excellent effect — and then the damage is
invisible again until they collapse. Nothing can be repaired. Nothing can be
garrisoned. A villager under attack has nowhere to run, and a tower is a fixed
number rather than a position you man.

**Proposal.**

- **Garrison.** Town Centres (10), Towers (5), Forts (8) and the Wonder (10)
  take units inside. Garrisoned units are safe, heal slowly, and *add arrows*:
  each garrisoned archer adds a shot to the building's attack. An alarm bell on
  the Town Centre pulls every villager within 20 tiles inside in one tap — the
  single best panic button in this genre and a natural fit for touch.
- **Repair.** Villagers repair at 40% of build rate, costing a quarter of the
  original resources pro rata. Roman build speed (`buildRateMul: 1.35`) applies,
  which quietly gives Rome a defensive identity it does not currently have.
- **Wounds that show.** Three damage states per building — scorched, cracked,
  half-ruined — swapping dressing at 66% and 33% HP, and *staying* until
  repaired. A city that has survived a siege should look like it.

**Implementation.** A `garrison: number[]` on `Building` plus load/unload
commands; the attack code adds per-occupant shots. Repair is a `repair` task
reusing the build task's rate machinery. Damage states are a dressing swap in the
building view, driven off the same HP fraction the fire effect already reads.

**Risk.** Garrison makes towers substantially stronger and can stall aggression
into a turtle-fest. Cap the arrow bonus at 3 occupants and keep siege damage
ignoring building armor, which is what already makes fortification answerable.

**Impact** High · **Effort** M

---

### 15. Build a plan, not a building

**Today.** One foundation at a time: tap, move the ghost, rotate, confirm. Walls
place instantly in a tap-tap-tap chain, which proves the interface can do better.
Laying out a ten-house quarter is thirty deliberate taps, and it is the least
enjoyable thirty taps in the game.

**Proposal.** **Plans** — a mode where you place any number of foundations as
translucent blueprints without spending anything, arrange them freely, and then
commit. On commit, resources are reserved and every idle builder works the queue
nearest-first. Three things make it sing on a phone:

- **Stamps.** Drag a 3×3 "housing block" or a "military quarter" stamp
  (barracks + range + two houses, pre-arranged) and drop the whole thing at once.
- **Copy a quarter.** Select an existing cluster, tap *Repeat*, and drop the same
  arrangement elsewhere. The city grows in patterns, the way real ones do.
- **Deferred plans.** A blueprint you cannot yet afford stays as a ghost with a
  cost readout, and construction starts by itself the moment the resources land.

**Implementation.** A `plan` list per player parallel to `buildings`, rendered as
translucent ghosts; committing converts each into the existing unbuilt-building
path. The builder assignment logic already exists for the labor pool the Forum
unlocks. Stamps are data: an array of `{type, dx, dz, rot}`.

**Risk.** Deferred plans plus the labor pool means a player can queue a city and
watch it build itself, which is a different game. Keep plans manual-commit by
default and make auto-start an option.

**Impact** High · **Effort** M

---

### 16. Roads that actually carry the traffic — ✅ **shipped**

> **What landed.** A per-cell surface index (`World.civicKindAt`) maintained by
> the civic layer, and one multiplier in the movement step: 1.25× on laid
> stone, 1.12× on a worn path. Trade carts earn up to +15% on a route that runs
> on stone. The **Causeway** (Village, 8 stone) is drag-placed like a wall but
> is civic scenery rather than a building — it claims no cell, blocks nothing,
> upgrades a dirt path in place, and is swept away by any foundation laid over
> it. Measured: a villager crossing paved ground moves 0.337 world units per
> tick against 0.27 on grass.

**Today.** Roads are pure scenery — the README says so plainly, and `civic.ts`
opens by saying none of it is a building and none of it claims a cell. Meanwhile
the game paves a whole network at Town in one dramatic moment
(`paveOverPaths`, `src/sim/civic.ts:102`) that changes nothing but the picture.
This is a system already built, already beautiful, already connected — and
switched off.

**Proposal.** Movement on roads: +25% speed on a paved road, +12% on a worn path.
Three consequences fall out for free:

- Villagers hauling between a mine and a storehouse get faster as the city
  matures, so paving *is* an economic upgrade and reaching Town feels like one.
- Trade carts prefer roads and earn +15% on a fully-paved route, giving the
  Market a reason to sit on the network rather than at the map's edge.
- Defence gains a shape: your army redeploys along your own streets faster than
  the attacker crosses open ground. Interior lines, for free, from a system that
  is currently decoration.

Add one player-placeable piece to complete it: a **Causeway** (10 stone, drag to
place like a wall) so a player can deliberately road out to a forward fort or a
distant mine.

**Implementation.** `civicAt` (`src/sim/civic.ts`) already maps every cell to its
civic prop; the movement step reads it and scales speed. Trade route quality is a
sample along the cart's path. The causeway is a walkable, non-blocking placement
reusing the wall's drag-place interaction.

**Risk.** Roads that speed units also speed *enemy* units through your city, which
is correct and interesting but must be visible — say so in the Town level-up
toast.

**Impact** High · **Effort** S

---

### 17. Fire, and the reason to plan a street

**Today.** Buildings burn cosmetically when attacked. Nothing ever catches fire
on its own, nothing spreads, and there is no downside whatsoever to packing
wooden houses shoulder to shoulder — which is what an optimising player will
always do.

**Proposal.** **Fire spreads.** A burning building with a wooden neighbour within
3 tiles has a chance per second to ignite it, scaling with how badly it burns.
Two answers, both of which reward city planning over city stacking:

- **Firebreaks.** A garden, plaza or road between two buildings blocks the
  spread. The auto-civic layer already lays those between your buildings — so a
  well-connected, well-dressed city is naturally fire-resistant, and a hastily
  packed one is not.
- **The Well** (20 wood, 1×1, Hamlet): douses fires within 10 tiles at 3× the
  natural rate, and villagers within its radius fight fires automatically.

Stone buildings resist entirely, which gives the material progression from tents
to timber to stone a mechanical meaning it currently only has visually.

**Implementation.** Ignition and spread live in the sim beside the existing burn
timer; the renderer already draws everything needed. A `flammable` flag on
`BuildingDef` keyed to the settlement level the building was raised at.

**Risk.** Uncontrolled fire is the most frustrating way to lose a match. Cap the
spread at 3 buildings per chain and never let fire start unprovoked before
minute 10.

**Impact** Medium · **Effort** M

---

### 18. Festivals, and a city that is inhabited — 🟡 **festivals shipped**

> **What landed.** The festival half only. Every settlement level-up grants a
> 90-second boon (+15% gathering, +25% building) and throws a visible
> celebration: petals and faction colours burst over one building after
> another, rolling outward from the town center, over a gold ring on the ground
> and a horn-and-fanfare sting. Ambient citizens and market day did not land.

**Today.** The city has no people in it except the ones you built. Villagers are
all workers; the streets, plazas and gardens the game so carefully lays are
empty. Reaching City or Metropolis is a toast and a skyline change with no
occasion attached to it.

**Proposal.**

- **Citizens.** Ambient, non-pop, non-selectable figures spawned in proportion to
  population, walking your streets between houses, plazas and the market —
  children, elders, dogs, a merchant with a barrow. They reuse the existing rig
  and animation clips and take zero simulation, because they run on the road
  network only. The city stops looking like a diorama the moment they appear.
- **Festivals.** Every settlement level-up throws one: banners on every building,
  citizens converging on the plaza, a music sting, braziers lit at dusk — and a
  90-second **Festival** boon (+15% work rate, +10% build speed) so the moment is
  mechanically as well as visually a high point.
- **Market day.** Once every 4 minutes, if you have a Market, a small crowd and a
  stall cluster appear for 40 seconds and the exchange rate improves 15%.

**Implementation.** Citizens are an instanced ambient layer in
`src/render/view.ts` driven by the civic road graph — no sim entities, no
pathfinding. The festival boon is a `BOONS` entry granted in the level-up path;
the visuals hang off the existing `civicLevelUp` hook.

**Risk.** Ambient crowds cost draw calls on a phone. Cap the count by population
and cull hard by camera distance — the existing renderer is already disciplined
about this (one draw call per entity, instanced clutter).

**Impact** Medium · **Effort** M

---

### 19. Tell me how my city is doing — ✅ **shipped**

> **What landed.** A City panel on the right rail, in the tech tree's idiom.
> Income per resource per minute with a sparkline, drawn from a cumulative
> sample the *simulation* takes every three seconds (so the rate is honest
> under pause and fast-forward alike); a villager-by-job breakdown that selects
> that group when tapped; what the quarters are earning from #11; and an
> estimate of the rival that counts only what stands on ground the player has
> actually walked, with the percentage of the map explored stated plainly
> beside it.

**Today.** Four resource counters and a population number. There is no rate of
income, no idea where your villagers are, no history, and no way to know whether
your economy is ahead or behind — so the player's model of their own city is
built entirely on vibes. The first backlog called for an economy panel (#9); it
has not landed, and everything in this section makes it more necessary.

**Proposal.** A **City** panel, one tap from the HUD:

- **Income** — food/wood/stone/gold per minute, each with a 60-second sparkline
  and the villager count feeding it. Idle villagers in red.
- **Where everyone is** — a breakdown by job, tappable to select that group.
- **Splendour and adjacency** — what your quarters are earning you (#11, #12),
  which is what makes those systems legible enough to play toward.
- **Compare** — the rival's *estimated* strength in the same shape, accurate only
  as far as your scouting is current, which is a direct reward for #2 and #8: the
  better you scout, the better your dashboard.

**Implementation.** Rolling per-resource accumulators in the sim, sampled into a
120-entry ring buffer. The panel is a screen in `src/ui/`. The rival estimate
reads only what your `visible`/`lastSeen` layers legitimately know.

**Risk.** Dashboards can turn a game about a place into a game about a
spreadsheet. Keep it one tap away and never on screen by default.

**Impact** High · **Effort** M

---

### 20. The Wonder as an event, not a build queue

**Today.** The Wonder is 300 wood, 350 stone, 300 gold, 150 seconds of build
time, and then a 180-second countdown (`WONDER_COUNTDOWN`). It is the climax of
the game and it is presented as a progress bar on a large building.

**Proposal.** Stage it, and let the whole map feel it.

- **Three visible stages.** Foundation and scaffolding → shell and cranes with
  crowds of workers hauling → the scaffolds come down and the gold leaf goes on.
  Each stage completion is a world event: a horn, a camera-worthy moment, banners
  raised across your city.
- **Escalating pressure both ways.** At each stage the builder gains something
  (stage 1: +10% build speed citywide; stage 2: +1 armor on all buildings; stage
  3: the countdown begins) and the rival gains vision of the Wonder plus a
  standing objective marker. The AI should throw everything at it, and be *told*
  to by the design rather than by a threshold.
- **A finale worth the wait.** On completion: light change, a slow camera push,
  the countdown as a large diegetic clock on the Wonder itself, and a final
  Chronicle page — your city, its name, its splendour, what you found out there,
  and how long you held it.

**Implementation.** Stage thresholds on the existing build progress; each stage
swaps dressing in the building model, which already supports per-level
re-dressing. The countdown UI and the finale hang off the existing
`wonderStart` event.

**Risk.** None mechanically; this is presentation. It is in this document because
the endgame is where a player decides whether the whole city they built was worth
building.

**Impact** High · **Effort** M

---

## C. An identity of its own

The game is currently a very well-made Age of Empires: four resources, villagers
that click onto nodes, ages, counter tables, siege that ignores building armor,
a wonder timer. Everything below is a deliberate move *away* from that, ordered
roughly from cheapest to most radical. They are not all compatible with each
other; #21 and #30 in particular reshape the whole game. Pick a direction, not
the list.

---

### 21. Stop clicking villagers onto rocks

**Today.** The core economy loop is AoE's exactly: select villager, tap resource,
watch them haul. The Forum already gestures at an escape — a labor pool that
assigns idle villagers automatically along Balanced / Growth / Treasury presets —
and it is locked behind Town and framed as a convenience.

**Proposal.** Make the labor pool *the* economy, available from minute zero, and
delete the click-work entirely.

- Villagers belong to **jobs**, not to nodes: Foragers, Woodcutters, Miners,
  Farmers, Builders. You set the shape with four sliders or by tapping a
  district; the sim finds the nodes, the routes and the drop-offs.
- Individual villagers can still be grabbed and told what to do — for hunting,
  for a forward storehouse, for a dig — but you never *have* to.
- Depletion and distance become the interesting decision: a job's rate falls as
  its nearby nodes run out, and the panel tells you plainly ("Woodcutters: 6,
  walking 22 tiles — build a storehouse north").

This is the single biggest differentiator available and the one best suited to
the game's mobile-first premise: an RTS whose economy is a set of decisions
rather than a sustained clicking speed.

**Implementation.** Generalise the Forum's labor pool into a persistent
assignment layer over `cmdGather`. The node-scoring code already exists for the
**Gather** button. UI is four sliders and a rate readout.

**Risk.** Fans of the genre may read automation as being denied the game. Keep
manual control fully intact and make the automation opt-out, not mandatory.

**Impact** High · **Effort** L

---

### 22. Companies, not units — and morale

**Today.** Individual units with HP bars, a counter table, and fights that
resolve as two blobs grinding each other down while auto-attack does the work.
Selection caps at 24 (`SELECT_MAX`), population at 45, which means the game is
already fighting the fact that individual-unit control does not fit a phone.

**Proposal.** The atomic military object is a **Company** — 6 spearmen, 5
archers, 3 cavalry — trained, moved, upgraded and lost as one, with a banner, a
name, and a formation you can set (line, wedge, loose). Then add the thing that
makes ancient battles read as battles:

- **Morale.** A company has morale as well as strength. It falls from casualties,
  from being flanked, from losing its officer, from a lost fight nearby; it
  rises near your Temple, your Amphitheater, your hero, your own walls.
- **Rout, not annihilation.** A broken company drops its formation and runs for
  home. It can be rallied at a Town Centre, healed, and sent back — or it can be
  ridden down by cavalry, which is what cavalry are *for*.

Fights become about frontage, flanks and nerve rather than DPS, and they resolve
in an order of magnitude fewer taps.

**Implementation.** A `Company` grouping over existing units with shared morale
and a formation offset table (`formationSlots` in `src/sim/world.ts` is already
the seed of this). Damage and counters stay exactly as they are; morale is a new
scalar consulted for a flee state.

**Risk.** Deep change to combat, control and UI at once. Prototype with one
company type against the current system before committing.

**Impact** High · **Effort** L

---

### 23. A chieftain with a name

**Today.** No heroes. Every unit is anonymous and interchangeable, and the player
has no character in the world — which is a fine choice for a competitive RTS and
a weak one for a game whose best material is its wilds, its refugees and its
relics.

**Proposal.** One **Chieftain** per side, on the field from the first second: a
strong unit (200 HP, a real threat, not a demigod) with a name generated per
faction, a portrait, and three things that matter:

- **An aura** — units within 12 tiles gain +10% damage and resist rout (#22).
- **A choice at each settlement level** — one of two traits: *Builder* (+15%
  construction) or *Warlord* (+1 armor to nearby troops); *Trader* or *Hunter*;
  and so on. By Metropolis your chieftain is a build you made.
- **A death that costs.** Killed, they are gone for 60 seconds and return at your
  Town Centre one trait poorer. The rival's chieftain is a named target you can
  hunt, and their death is the loudest event in the game.

The Golden Idol proves this game is at its best when one object on the map is
worth everyone's attention. A chieftain is that, permanently, on both sides.

**Implementation.** A `hero` flag on `Unit`, an aura in the same pass as the
temple heal aura, a trait record per player, and a respawn timer. The name and
portrait are generation, not art.

**Risk.** Hero auras compress army balance. Keep every number small and never let
the chieftain solo anything.

**Impact** High · **Effort** M

---

### 24. Seasons and the campaigning year

**Today.** Time is flat. Farms yield at a constant rate, water is water, and a
match at minute 5 is the same world as a match at minute 35 apart from what has
been built. AoE's clock is a resource-depletion clock and this game has inherited
it exactly.

**Proposal.** A year of four seasons, three minutes each, shown as a ring on the
HUD and unmistakable in the light and the ground:

- **Spring** — farms +25%, rivers high, fords impassable. The map is two halves.
- **Summer** — normal yields, long sight lines, fires spread faster (#17).
- **Harvest** — farms +50% for one season only; the season you must be home for,
  and therefore the season your rival raids in.
- **Winter** — farms yield nothing, movement −15% in the open, shallow water
  freezes and *opens new routes*, and food stores drain. The season of sieges and
  of the flank nobody was watching.

Seasons give the match a rhythm no amount of unit balance can, and they turn map
knowledge (#6) into timing: the ford you found in spring is a road in winter.

**Implementation.** A season clock in the sim scaling farm and gather rates,
movement, and passability on shallow water cells. The renderer already tints and
re-dresses the world per biome; seasonal palettes and a light rig are the same
machinery.

**Risk.** Winter can feel like a punishment for existing. Keep the yield hit on
farms only (foraging and hunting continue) so the correct response is to *change
what you do*, not to wait.

**Impact** High · **Effort** M

---

### 25. The wilds have opinions

**Today.** The neutral power (owner 2) is a set of vending machines: kill the
wolves, get pelts; pay the deserters, get spears; dig the cairn, get gold. It has
no memory and no attitude, and "Soldiers and towers ignore grazing animals" is
the extent of its relationship with you.

**Proposal.** **Standing** with the wilds, from −100 to +100, moved by what you
do out there: hunting whole herds to extinction, razing dens, sacking free
villages (#7) and robbing caravans push it down; sparing herds, rescuing
refugees, escorting caravans, and leaving cairns undisturbed push it up.

- **High standing** — guides appear at your Town Centre (reveal a corner of the
  map), free peoples treat with you at half price, and beasts do not attack your
  villagers.
- **Low standing** — wolf packs raid on a shorter timer, free villages refuse
  you outright and may flip to your rival, and bandits (#9) target your supply
  routes specifically.

The rival has its own standing, so the wilds are a third party both of you are
courting — and a player who has spent the match being ruthless will find the
middle of the map has become hostile country.

**Implementation.** A per-player scalar on `World`, adjusted at the existing
site-resolution hooks (`onWildsUnitKilled`, `onWildsBuildingRazed`,
`stepRefugees`). Effects are multipliers on numbers already in `ENC`.

**Risk.** Invisible reputation systems are infuriating. Every change must post a
toast and appear in the Chronicle (#3) with its cause named.

**Impact** High · **Effort** M

---

### 26. The land remembers

**Today.** Buildings collapse into dust and leave decals — good work, already
shipped — but the world otherwise has no memory. A razed town becomes empty
ground. The map you fight the last ten minutes on is the map you started with,
minus some trees.

**Proposal.** Make the battlefield a record of the match, mechanically as well as
visually:

- **Ruins persist.** A razed building leaves ruins that stand for the rest of the
  match: they block movement, give cover (+2 pierce armor to units inside), and
  can be **rebuilt** by either side for half cost — so a burned-out quarter is
  contested ground, not a blank slate.
- **Refoundation.** A player whose last Town Centre falls can, once, refound at a
  ruin with a surviving villager — a last stand rather than an execution.
- **Scars.** Battle sites keep churned earth, broken spears and carrion birds.
  Heavily trafficked routes wear paths into the grass on their own, the same way
  the settlement wears its streets (`civic.ts` already does exactly this).
- **The map you leave.** The end-of-match Chronicle shows the world as you
  changed it: your roads, your ruins, where the big fights were.

**Implementation.** A `ruin` building type reusing the collapse hook; wear tracks
are a cheap per-cell traffic counter feeding the existing civic path renderer;
the cover bonus is one line in damage resolution.

**Risk.** Persistent ruins clutter the pathfinding grid and can wall off the map.
Make ruins passable-but-slow rather than solid.

**Impact** Medium · **Effort** M

---

### 27. Omens: a thin, diegetic layer of the sacred

**Today.** Shrines and temples heal. That is the entire spiritual life of a
bronze-age civilisation built around cairns, idols and monuments — the game has
all the iconography and none of the belief.

**Proposal.** **Favour**, earned slowly by Shrines, Temples, Monuments and an
enshrined Idol, and spent on a handful of one-shot **Omens** with long
cooldowns. Not spells: weather and fortune, read as the gods answering.

| Omen | Cost | Effect |
| --- | --- | --- |
| **Sandstorm** | 60 | A moving 20-tile circle of near-blindness for 25s — cover for an attack, or an escape |
| **Harvest Blessing** | 50 | +50% food for 45s |
| **The River Rises** | 80 | Fords impassable for 40s: a wall you do not have to build |
| **Portent of Doom** | 100 | Enemy units in a 15-tile circle lose morale (#22) and will not press an attack for 20s |
| **Founding Rite** | 70 | A building under construction finishes instantly |

Each is announced to both sides with an unmistakable world effect, so being on
the receiving end is a story rather than a debuff.

**Implementation.** A `favour` resource generated by existing buildings, a small
omen panel on the Temple, and five effects that are mostly modifiers on systems
that already exist (fog, gather rate, passability, morale, build progress).

**Risk.** This is the entry most likely to make the game feel like a different
franchise. Keep it to five omens, keep every one grounded in weather, harvest or
nerve, and never let one deal damage.

**Impact** Medium · **Effort** M

---

### 28. The council: decisions with consequences

**Today.** The only decision the game ever *asks* the player is the deserters'
offer — pay or raze (`stepCamp`, `src/sim/encounters.ts:180`). It is a single
line of toast text and it is, per byte, the most interesting content in the game.

**Proposal.** A **Council** that convenes at each settlement level-up and at a
few triggered moments (a bad defeat, a great discovery, a famine): one dilemma,
two or three options, a short paragraph in the game's voice, consequences that
last the match.

- *A neighbouring clan asks for shelter.* Take them in (+4 villagers, −food
  stores, +standing with the wilds) or turn them away (+gold from their goods,
  −standing).
- *Your general demands the harvest for the army.* Grant it (+20% military
  training for 3 minutes, −25% food rate) or refuse (−morale, +splendour).
- *An oracle names an omen over the Wonder.* Build anyway (Wonder −20% cost,
  enemy learns its location) or delay (nothing, and the option is gone).

Four to six per match, drawn from a pool of thirty, weighted by what has actually
happened — so the game is commenting on your match, not reading a script.

**Implementation.** A card pool as data, a trigger evaluator in the sim, and a
modal that pauses nothing (it sits until answered, expiring into the safe default
after 45 seconds). Effects are boons and resource deltas, all of which exist.

**Risk.** Writing thirty cards well is real authorship, and badly written ones
will read as filler. Ship eight excellent ones.

**Impact** High · **Effort** M

---

### 29. Win the way your people would

**Today.** Two win conditions, both inherited: raze every Town Centre, or build a
Wonder and hold it for 180 seconds. Both are the AoE endgame, and neither has
anything to do with which civilisation you picked.

**Proposal.** Four paths, each with a visible track in the Chronicle, and each
civilisation nudged toward one without being locked into it:

- **Conquest** — as today.
- **The Wonder** — as today.
- **Hegemony** (Egypt) — hold the trading post, both ruined forts and a courted
  free village simultaneously for 3 minutes. A map-control win, which makes
  everything in section A a win condition.
- **Renown** (Greece) — reach 500 Splendour (#12) with your Metropolis intact: a
  city-building win, in a game where city building is currently only a means.
- **The Long Peace** (Rome) — survive to year four (#24) with more standing
  buildings than the rival has ever destroyed. An endurance win for the turtle.

The rival announces when it is close to any of them, and the player is always
told which track they are on.

**Implementation.** Each condition is a predicate over state the sim already
keeps, checked beside the existing wonder countdown. The UI cost is a progress
strip in the Chronicle.

**Risk.** More win conditions means more ways to lose to something you were not
watching. Every path needs a loud, early warning — and a `siteCleared`-style
event feed already exists to carry it.

**Impact** High · **Effort** M

---

### 30. Time you can bend

**Today.** Real-time, one speed, no pause with orders. The game is mobile-first
and is nonetheless asking a phone player to manage an economy, a city, a scouting
programme and a battle at the same speed as a desktop player with a mouse. The
selection cap and the automation buttons are all downstream of that tension.

**Proposal.** Own the premise instead of fighting it.

- **Plan while paused.** Pause at any moment, issue any number of orders, and
  resume to watch them execute. Not a cheat mode: the standard way this game is
  played, and the reason a phone player can fight a battle and run a city at
  once.
- **Battle focus.** When a fight starts, an optional slow-motion (0.5×) window of
  ten seconds, camera pushing in — enough time to make the two decisions that
  matter (commit the reserve, pull the archers back) without twitch.
- **Fast-forward the quiet.** 2× and 4× when nothing is contested, snapping back
  to 1× the moment an alarm fires. Matches keep their length in *decisions* while
  losing the dead time.

The fixed-timestep sim (10 Hz, fully separated from the renderer) makes all three
of these nearly free — the architecture is already right for it, which is a
strong hint that this is the game the code wants to be.

**Implementation.** A time-scale multiplier on the sim step plus an order queue
that accepts commands at scale 0. The renderer interpolates already. Battle focus
is a trigger on combat events plus a camera routine.

**Risk.** Pause-with-orders changes the skill the game tests, and would need to
be off in any future competitive mode. That is a fine trade for a game whose
stated audience is holding a phone in landscape.

**Impact** High · **Effort** M

---

## Where to start

If only three ship from each section:

- **Exploration** — #2 (real vision), #3 (the Chronicle), #8 (a rival who
  explores). Together they turn a one-shot reveal into a live contest with a
  scoreboard.
- **The city** — #16 (roads that carry traffic), #12 (Splendour), #11
  (adjacency). All three make systems the game *already builds beautifully* into
  systems the player plays with. #16 is nearly free.
- **Identity** — #24 (seasons), #23 (a chieftain), #28 (the council). The
  cheapest three that change what the game *is* rather than what it contains;
  none of them requires rebuilding combat or economy first.

And one sequencing note: #2 (active vision) should land before anything else in
section A, because every other exploration idea is worth roughly double in a
world where knowing a place once is not the same as watching it forever.

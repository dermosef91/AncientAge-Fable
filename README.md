# Ancient Age

A polished, mobile-first 3D real-time strategy game in the spirit of the classics.
Choose Egypt, Greece, or Rome and race a scheming AI rival from a camp of tents
to a thriving metropolis — win by conquest, or raise a Wonder and defend it.

Every match generates a fresh world: a random archetype (open coast, island
chains, lake lands, or a great river with fords) painted with biomes — desert,
grassland, lush shores and rocky highlands — on a battlefield ten times the
size of the original map. A land route between the two towns is always
guaranteed.

Built with **TypeScript + Vite + Three.js** — every model, texture, sound, and
effect is generated procedurally at runtime. No assets, no downloads.

## Run it

```bash
npm install
npm run dev        # dev server on http://localhost:5173
npm run build      # production build in dist/
```

Open on a phone (landscape) or desktop browser.

## How to play

1. Pick a civilization and difficulty, then **To Battle**.
2. Tap a villager → tap berries/trees/stone/gold to gather. Villagers carry
   what they harvest back to your Town Center or Storehouse.
3. Select the Town Center and **grow your settlement** — camp to hamlet to
   village and beyond. Status is what unlocks your military and your best
   buildings.
4. Tap **Build** to raise houses (population), farms, barracks, towers, walls,
   docks, and your civilization's monument.
5. Train a **Scout** at the Town Center and tap **Explore** — it walks the
   frontier on its own, and gets faster and further-sighted with every site it
   finds.
6. Train soldiers, research technologies, and watch your income in the
   **city panel** (the skyline button on the right rail).
7. Find the enemy town, weather their raids, and **destroy every Town Center
   they hold** — or raise a **Wonder** as a Metropolis and keep it standing.

### Settlement levels

You begin as a **camp**: a chieftain's marquee among hide tents. Each upgrade,
started at the Town Center, raises your settlement's status and unlocks more
of the game.

| Level | Cost | Unlocks |
| --- | --- | --- |
| I — Camp | — | House, Farm, Storehouse, Dock, Villagers, **Scouts**, Fishing Boats |
| II — Hamlet | 100 food | Barracks, Wall, Spearman, civic gardens, **the Obelisk** |
| III — Village | 190 food, 80 wood | Archery Range, Market, Shrine, Archer, Trade Cart, The Wheel, Causeway, civic plazas *(Rome paves here)* |
| IV — Town | 300 food, 100 gold | Elite unit, **Siege Workshop**, Watch Tower, Academy, Forum, extra Town Centers, Masonry, Bronze Arms, Irrigation, Medicine, **the Acropolis and the Castrum** |
| V — City | 460 food, 190 gold, 100 stone | Temple, Amphitheater, Lighthouse, Monument, Coinage, Logistics |
| VI — Metropolis | 650 food, 320 gold, 200 stone | **The Wonder**, Hardened Shields |

Every level also rebuilds your skyline. Tents give way to timber halls, timber
to stone, and standing buildings grow a little taller and richer with every
step — gaining painted trim, planters, banners, gold, braziers and marble as
your status rises.

### Counters, armor and siege

Army composition decides fights. Every attack carries a **damage type** and every
target has a **class**, and the two are matched against a table of bonuses:

| Unit | Strong against |
| --- | --- |
| Spearman | Cavalry (+8), Siege (+4) — a braced spear guts a chariot in five thrusts |
| Archer | Infantry (+2), Siege (+3) |
| War Chariot | Archers (+5), Siege (+4) |
| Hoplite | Siege (+5), Cavalry (+3) |
| Legionary | Siege (+4), Buildings (+3) |
| Battering Ram | Buildings (+46) — and almost nothing else |
| Catapult | Buildings (+18), plus splash on everything nearby |

Armor comes in two channels. **Melee armor** soaks blades; **pierce armor** soaks
arrows. A Hoplite's bronze (3 melee, 0 pierce) turns a spearman's thrust into a
scratch and does nothing at all about massed archers — so the answer to a phalanx
is a volley, and the answer to archers is anything with a horse.

Buildings carry armor too, and this is what makes siege necessary: stone shrugs
off blades and arrows, but **siege damage ignores building armor entirely**.

- **Battering Ram** — slow, 4 pierce armor, shatters walls and town centers.
  Utterly helpless against troops: keep it escorted, because five spearmen will
  chop one down in about twenty seconds.
- **Catapult** — range 11, which outreaches a Watch Tower's 8.5. It will stand
  off and break the tower without taking a single arrow. Its shot is lobbed,
  so it misses runners, and the blast **damages your own units too** (at half
  rate) — do not park your infantry on the target.

The short version: siege beats buildings, everything beats siege, and the tower
you could once ignore now needs an answer.

### The city

- **Market** — swap 100 wood/food/stone for gold (or buy with gold), and train
  **Trade Carts** that shuttle to the neutral trading post at the heart of the
  map and return with gold. Longer routes pay more.
- **Walls are gatehouses** — your own troops walk straight through your walls;
  enemies still have to break them down.
- **Shrine → Temple** — heals nearby units; upgrade it in place for a far
  stronger aura. Research **Medicine** to double it.
- **Siege Workshop** *(Town)* — engineers build Battering Rams and
  Catapults. The way through a fortified town.
- **Amphitheater** — while it stands, all your units deal +30% damage.
- **Academy** — researches Irrigation, Medicine, Coinage and Logistics.
- **Forum** — unlocks the labor pool: idle villagers are assigned work
  automatically along presets you pick (Balanced / Growth / Treasury).
- **Lighthouse** — boats gather 30% faster, sail 20% faster.
- **The city builds itself** — you never place decoration. Every finished
  building is linked to its nearest neighbour and to the nearest hub by a
  street, so a sprawl of houses reads as one city; and the larger works gather
  gardens, plazas and statues in the spare ground around them as your
  settlement grows (gardens from Hamlet, plazas from Village, statues from
  Town). A young settlement only wears its streets into the dirt — reaching
  **Town** paves the whole network at once, in the same stone as the plaza
  around your town center. Rome does it a level early, at **Village**, which is
  the one civilization bonus you can read from across the map. Nothing blocks a
  path, and laying a foundation over a garden simply sweeps it away.
- **Streets carry the traffic** — and this is what paving is *for*. Everyone
  moves 25% faster on laid stone and 12% faster on a worn path, so reaching
  Town speeds up every haul in your city at once, your army redeploys along
  your own streets faster than an attacker crosses open ground, and a trade
  route that runs on stone pays up to 15% more gold. Lay your own with the
  **Causeway** *(Village, 8 stone)* — tap-tap-tap like a wall — out to a
  forward fort, a distant mine, or the market road.
- **Districts** — where a building stands now matters as much as that it
  stands. Every bonus is small, and the placement ghost tells you what the
  ground is worth before you commit:

  | Quarter | What it takes | What it gives |
  | --- | --- | --- |
  | A street of houses | 2 more houses within 6 | +1 population each |
  | ...with somewhere to sit | a garden or plaza within 4.5 | +1 more |
  | Drill yard | 2 of Barracks / Range / Siege Workshop within 9 | 15% faster training |
  | Exchange | Market and Forum within 9 | +20% trade gold |
  | Field system | 2 more farms within 6 | +10% yield each |
  | Depot | a Storehouse with 3+ resources within 6 | +10% gathering there |
  | Sacred games | Shrine or Temple within 11 of the Amphitheater | half again the healing reach |

- **Festivals** — every settlement level-up throws one. Petals go up over one
  roof after another, outward from your town center, a horn sounds, gold
  pennants rise above every roofline in the city and fly for the whole
  celebration, and for 90 seconds the whole city gathers 15% faster and builds
  25% faster. It is the one moment in the match that is nobody's emergency, and
  you can see it from across the map.
- **The city panel** *(the skyline button)* — income per minute with a
  sparkline for each resource, where every villager actually is (tap a line to
  take that group in hand), what your quarters are earning, and an estimate of
  the rival's strength that is only ever as good as your scouting. What you
  have not walked is not counted.
- **Wonder** *(Metropolis)* — complete it and defend it for three minutes to win
  without razing a single town center. The enemy will come with everything.

Placement is deliberate now: tap to move the ghost, rotate it (⟳ or **R**),
then confirm with **Build** (walls still place instantly, tap-tap-tap).

Tap the **settlement chip** in the top right to open **the tech tree** — all
six levels side by side with what each unlocks, what everything costs, and what
you have already researched. It is your civilization's tree, not a generic one:
another civ's uniques never appear, the technologies your people never learn are
simply absent, and your own are marked as yours. Worth a look before paying for
the next level.

### The wilds

A neutral third power lives between the two towns, and scouting is how you
meet it. Sites appear on the minimap as small gold diamonds once your fog
lifts; walking up to one is what springs it.

- **Read the ground** — the land the generator makes is now worth looking at:
  - **High ground is a vantage.** Stand on a ridge or a mesa shoulder and the
    eye carries 25% further; a bow shoots 15% further downhill and falls 10%
    short shooting up. The selection panel says so while it applies.
  - **Woods conceal.** A soldier standing still among trees is not drawn, not
    on the minimap, and not auto-targeted — not even by towers — until an enemy
    walks within 6 tiles or the soldier strikes. Forest edges are ambush
    country now, and the rival's base alarm cannot smell what it cannot see.
  - **Fords are named.** On river maps the carved crossings — The Reed Ford,
    The Oxen Ford, The Old Ford — announce themselves when your fog lifts off
    them and stay marked on the minimap. A player who knows the fords is
    playing the map.
- **The Scout** *(Camp, 35 food)* — fast, far-sighted, and no use whatsoever in
  a fight: shot at, it runs. Tap **Explore** and it walks the frontier by
  itself, picking the nearest worthwhile patch of unknown country and moving on
  when it gets there — exploring a map this size must not cost a hundred taps.
  Every site it finds earns a **Pathfinder** rank, up to five: +1 tile of sight
  and +4% speed each. A veteran scout is a real piece, and losing one hurts.
  The rival trains one too, and wants the same sites you do.

- **Game herds** — gazelle flee the hunt (wounded animals tire), boar turn and
  fight. A kill leaves a **carcass** your villagers butcher for food before it
  spoils; hunters switch to butchering on their own.
- **Wolf dens** — once discovered, the pack raids nearby villagers (yours *or*
  the rival's) until the den is razed. Clearing it grants **Wolf Pelts**:
  villagers gain +25% HP for the rest of the match.
- **Deserters' camps** — stand at the camp and an offer appears: pay their
  price and the mercenaries fight under your banner. Or raze the camp and take
  their stash — but they fight back, and blood spoils the deal.
- **Old cairns** — send a villager to dig; a few seconds later something comes
  up: gold, food or stone.
- **Refugees** — approach and they follow you home. Each one that reaches a
  Town Center settles as a free villager, and their **Gratitude** speeds your
  construction for a while.
- **The Golden Idol** — one relic per map, far out in the deep field. Any unit
  can carry it, the carrier is marked on the minimap, and if they fall it drops
  where they died — for anyone to take. Enshrine it at a Town Center for a
  permanent trickle of gold.
- **Free villages** — two peoples of their own, living in huts around a green.
  They are not a faction and they never attack anyone. What you do with them is
  the point: **court** them (200 food, standing among them) and they become a
  tributary, paying a steady 0.4 gold/s and sending two **Slingers** to fight
  under your banner; **tax** them (three soldiers standing over the huts) for
  less than half that, and they stop the moment your spears leave; or **sack**
  them for 250 in mixed loot — after which no free village on the map will ever
  treat with you again. The rival courts them too, so a village won is a
  village denied.
- **The landmark** — one per map, further out than anything else, and never the
  same one twice running:
  - **Beacon Hill** — claim it like a fort. The fire shows its holder a wide
    circle of country for good, and every unit they own sees further.
  - **Obelisk of the Lost** — claim it, and your wounded mend slowly wherever
    they stand, anywhere on the map.
  - **Amber Grove** — ancient trees carrying four times the timber. They never
    grow back.
  - **Oracle Spring** — send a villager to drink and their town is revealed,
    along with the shape of the army standing in it. Once, and it is spent.
- **Ruined forts** — derelicts of some older war, standing between the two
  towns. Unlike every other site these are never *spent*: stand in one with no
  enemy in the yard and you claim it, and it can be taken and retaken all match.
  A held fort watches a wide circle of country and serves as a forward drop-off
  for your gatherers. Both sides in the yard at once and the claim stalls —
  which is the point. The rival wants them too.

Soldiers and towers ignore grazing animals and the huddled — the wilds only
draw steel when the wilds draw first.

### Controls

| Action | Touch | Mouse |
| --- | --- | --- |
| Select | tap unit/building | click, or drag a box |
| Move / gather / attack | tap ground / resource / enemy | right-click |
| Pan camera | drag | middle/right drag, screen edge, or minimap |
| Zoom | pinch | scroll wheel |
| Select all soldiers | crossed-swords button | crossed-swords button |
| Next idle villager | villager button (shows a count) | same |
| Cancel / deselect | ✕ buttons | Esc |

Tap the **skyline button** on the right rail for the city panel — income,
labour and what you know of the rival. Double-tap a unit to select all of its
type. Select a production building and
tap the ground to set its rally point — rallying onto a resource puts new
villagers straight to work. **Gather** sends idle workers to the nearest
sensible resource; **Hold** roots soldiers in place so they fight without
chasing. Idle soldiers defend themselves automatically and return to their
post afterwards. On desktop, pushing the mouse to a screen edge pans the
camera (toggleable in the pause menu).

## The civilizations

Each civilization has a passive, a unique unit, a **unique building**, and
**two technologies nobody else can learn** — researched at that building, so
raising it is what opens your own branch of the tree. Each also *lacks* one
technology every other civilization has: the roster gaps are as much a part of
the identity as the uniques.

- **Egypt — Gift of the Nile**: food gathered 25% faster, farms 25% cheaper.
  Unique unit: **War Chariot**, a fast chariot archer from the Archery Range.
  Unique building: the **Obelisk** (Hamlet) — a cheap 1×1 shaft of stone that
  watches 20 tiles of country. Seed them along the roads and you always know
  where the attack is coming from. Its techs are **Nile Flood** (farms reseed
  free and never wither) and **Cartography** (obelisks see 60% further, and
  every site in the wilds is marked on your map). Egypt never learns
  **Hardened Shields** — it fights light, or not at all.
- **Greece — Phalanx and Marble**: military +15% HP, towers and walls 25%
  sturdier. Unique unit: **Hoplite**, armored heavy infantry.
  Unique building: the **Acropolis** (Town) — not built but *raised*, an
  in-place upgrade of a Town Center into a walled one with bastions and a
  tower's bite. It is still a town center in every way that counts. Its techs
  are **Phalanx Drill** (hoplites standing two or more together gain +2 melee
  armor — shields, so arrows still come over the top) and **Marble Quarry**
  (stone gathers 25% faster and every building needs 15% less of it). Greece
  never learns **Logistics**: an elite army is slow to replace.
- **Rome — Marching Eagles**: buildings 35% faster and 10% cheaper to build,
  and the streets are paved a whole level early — at Village, while everyone
  else waits for Town. Unique unit: **Legionary**, disciplined all-round
  infantry. Unique building: the **Castrum** (Town) — a marching camp for the
  front line that musters spearmen and legionaries, heals the wounded slowly,
  and takes your gatherers' goods. Its techs are **Roads** (units march 20%
  faster within eight paces of your own buildings) and **Legion Standard**
  (legionaries gain +1 armor for each legionary beside them, up to +3). Rome
  never learns **Irrigation** — it feeds on conquest and trade, not on farming.

Each civilization also starts in its own landscape: Egypt among date palms,
sandstone rocks and a sandstone forecourt; Greece among cypress and olive
groves on a limestone plaza; Rome amid umbrella pines with paved roads
radiating from the villa. Their town centers differ at **every** settlement
level, starting from the camp: Egypt pitches an open linen shade pavilion on
carved poles behind reed windbreaks, Greece a great ridge tent with a tripod
cauldron at the fire, Rome an ordered military camp behind a staked palisade
with the vexillum at the gate. Egypt's mudbrick compound never grows a gable;
Greece's timber hall is a temple front in waiting; Rome's plastered principia
already has the villa's wings.

## Tech notes

- Fixed-timestep simulation (10 Hz) fully separated from the renderer;
  the view layer interpolates and only reads sim state + events.
- A* grid pathfinding with string-pulling, unit separation steering,
  and automatic repathing when buildings appear.
- One draw call per entity: all models are merged, vertex-colored,
  flat-shaded geometry; trees, paving and ground clutter are GPU-instanced.
  A soldier is the exception and costs one more per piece of kit, since gear
  hangs off bones that move independently — but the whole army's gear shares
  a single material.
- **No emoji in the UI.** Symbols are hand-authored inline SVG
  (`src/ui/icons.ts`); every unit and building icon is the game's own 3D model
  rendered to a small isometric snapshot at runtime
  (`src/render/thumbnails.ts`), so the interface always matches the art.
- **External models** (`assets/*.glb`, loaded by `src/render/assets.ts`): a
  sculpted palm — merged to one geometry, normalized to a fixed footprint and
  drawn as an InstancedMesh — and one rigged character per civilization whose
  12 clips are driven by gameplay state (idle / walk / chop / collect / spear
  thrust / sword slash / draw and shoot / death), skeleton-cloned per unit
  with root motion stripped so the simulation still owns position. Everything
  else stays procedural, and both models fall back to procedural geometry if
  they fail to load.
- **Everyone on the field is the same body; the kit is what tells them
  apart.** Soldiers wear procedural war-gear strapped to the rig's bones
  (`src/render/soldierKit.ts`, built by `gearGeo` in `src/render/models.ts`):
  helmet on the skull, cuirass at the chest, shield on the off forearm,
  quiver between the shoulder blades, greaves at the knees, weapon in the
  fist. Crisp flat-shaded gear over the softer sculpted body is the look, and
  it is the whole reason a hoplite reads as a hoplite at sixty pixels tall.
  The three civilizations differ in shape before colour: arched hide slab,
  round bronze aspis and curved red scutum; cloth, bronze cone and iron dome;
  a warm bronze spear leaf, a bronze diamond and a grey iron one. Egypt's war
  chariot is a procedural machine with a sculpted archer standing in the cab.
- **Blows land on the beat the simulation strikes.** Combat clips are not
  free-run: each unit uses only the slice of its clip that reads as one blow —
  the wind-up and thrust, the slash, the draw and loose — scrubbed across one
  attack cooldown from the simulation's own attack timer (`driveAttack` in
  `src/render/view.ts`).
- **Villagers carry the kit their job calls for** — an axe at the trees, a
  pickaxe at stone and gold, a sickle on the farm, a mallet on a building
  site, a hand net at the fishing shallows and a basket while foraging. The
  tools are procedural geometry parented to the rig's hand bones (the basket
  is kept level as the arm swings) and swap as orders change, so the load a
  villager hauls home matches what they were just doing. Timber and ore are
  too heavy for a hand: those jobs also strap on a wicker back-basket, and the
  logs, blocks and ore ride in it.
- **Buildings burn while they are under attack** and for a few seconds after
  the last blow lands. The fire takes hold faster the worse the damage, with
  flame licks pinned up the walls, across the roof and at the foundations, a
  smoke column overhead, embers on the updraft and soot darkening the stone
  until it goes out. Flames and smoke are camera-facing sprites sized in world
  units, batched into two draw calls (`src/render/effects.ts`).
- Fog of war, minimap, pooled particles, procedural WebAudio sound,
  and an AI that runs its own economy, grows its settlement, expands, defends,
  and raids through the same command API the player uses.

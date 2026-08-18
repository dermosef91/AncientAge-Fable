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
5. Train soldiers, research technologies, and scout the map.
6. Find the enemy town, weather their raids, and **destroy every Town Center
   they hold** — or raise a **Wonder** as a Metropolis and keep it standing.

### Settlement levels

You begin as a **camp**: a chieftain's marquee among hide tents. Each upgrade,
started at the Town Center, raises your settlement's status and unlocks more
of the game.

| Level | Cost | Unlocks |
| --- | --- | --- |
| I — Camp | — | House, Farm, Storehouse, Dock, Villagers, Fishing Boats |
| II — Hamlet | 100 food | Barracks, Wall, Spearman, civic gardens |
| III — Village | 190 food, 80 wood | Archery Range, Market, Shrine, Archer, Trade Cart, The Wheel, civic plazas |
| IV — Town | 300 food, 100 gold | Elite unit, **Siege Workshop**, Watch Tower, Academy, Forum, extra Town Centers, Masonry, Bronze Arms, Irrigation, Medicine |
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
  Town). A camp, hamlet or village only wears its streets into the dirt —
  reaching **Town** paves the whole network at once, in the same stone as the
  plaza around your town center. It is all scenery: nothing blocks a path, and
  laying a foundation over a garden simply sweeps it away.
- **Wonder** *(Metropolis)* — complete it and defend it for three minutes to win
  without razing a single town center. The enemy will come with everything.

Placement is deliberate now: tap to move the ghost, rotate it (⟳ or **R**),
then confirm with **Build** (walls still place instantly, tap-tap-tap).

Tap the **settlement chip** in the top right to open **the tech tree** — all
six levels side by side with what each unlocks, what everything costs, and what
you have already researched. Worth a look before paying for the next level.

### The wilds

A neutral third power lives between the two towns, and scouting is how you
meet it. Sites appear on the minimap as small gold diamonds once your fog
lifts; walking up to one is what springs it.

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
| Select all soldiers | helmet button | helmet button |
| Next idle villager | villager button (shows a count) | same |
| Cancel / deselect | ✕ buttons | Esc |

Double-tap a unit to select all of its type. Select a production building and
tap the ground to set its rally point — rallying onto a resource puts new
villagers straight to work. **Gather** sends idle workers to the nearest
sensible resource; **Hold** roots soldiers in place so they fight without
chasing. Idle soldiers defend themselves automatically and return to their
post afterwards. On desktop, pushing the mouse to a screen edge pans the
camera (toggleable in the pause menu).

## The civilizations

- **Egypt — Gift of the Nile**: food gathered 25% faster, farms 25% cheaper.
  Unique unit: **War Chariot**, a fast chariot archer from the Archery Range.
- **Greece — Phalanx and Marble**: military +15% HP, towers and walls 25%
  sturdier. Unique unit: **Hoplite**, armored heavy infantry.
- **Rome — Marching Eagles**: buildings 35% faster and 10% cheaper to build.
  Unique unit: **Legionary**, disciplined all-round infantry.

Each civilization also starts in its own landscape: Egypt among date palms,
sandstone rocks and a sandstone forecourt; Greece among cypress and olive
groves on a limestone plaza; Rome amid umbrella pines with paved roads
radiating from the villa.

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

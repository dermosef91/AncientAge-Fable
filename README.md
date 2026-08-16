# Ancient Age

A polished, mobile-first 3D real-time strategy game in the spirit of the classics.
Choose Egypt, Greece, or Rome and race a scheming AI rival from three villagers to
a thriving empire — win by conquest, or raise a Wonder and defend it.

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
3. Select the Town Center and **advance an age** — this is what unlocks your
   military and your best buildings.
4. Tap **Build** to raise houses (population), farms, barracks, towers, walls,
   docks, and your civilization's monument.
5. Train soldiers, research technologies, and scout the map.
6. Find the enemy town, weather their raids, and **destroy every Town Center
   they hold** — or raise a **Wonder** in the Iron Age and keep it standing.

### The four ages

| Age | Cost | Unlocks |
| --- | --- | --- |
| Stone | — | House, Farm, Storehouse, Wall, Dock, Garden, Plaza, Villagers |
| Tool | 150 food | Barracks, Archery Range, Market, Shrine, Statue, Spearman, Archer, Trade Cart, The Wheel |
| Bronze | 260 food, 70 gold | Elite unit, Watch Tower, Temple, Academy, Amphitheater, Forum, Lighthouse, Monument, extra Town Centers, Masonry, Bronze Arms |
| Iron | 460 food, 200 gold | **The Wonder**, Hardened Shields, Coinage, Logistics |

Every epoch also rebuilds your skyline: standing buildings gain trim, planters,
banners, gold and braziers as the ages pass.

### The city

- **Market** — swap 100 wood/food/stone for gold (or buy with gold), and train
  **Trade Carts** that shuttle to the neutral trading post at the heart of the
  map and return with gold. Longer routes pay more.
- **Walls are gatehouses** — your own troops walk straight through your walls;
  enemies still have to break them down.
- **Shrine → Temple** — heals nearby units; upgrade it in place for a far
  stronger aura. Research **Medicine** to double it.
- **Amphitheater** — while it stands, all your units deal +30% damage.
- **Academy** — researches Irrigation, Medicine, Coinage and Logistics.
- **Forum** — unlocks the labor pool: idle villagers are assigned work
  automatically along presets you pick (Balanced / Growth / Treasury).
- **Lighthouse** — boats gather 30% faster, sail 20% faster.
- **Statue, Garden, Plaza** — beautify your city; plazas are walkable paving.
- **Wonder** *(Iron Age)* — complete it and defend it for three minutes to win
  without razing a single town center. The enemy will come with everything.

Placement is deliberate now: tap to move the ghost, rotate it (⟳ or **R**),
then confirm with **Build** (walls still place instantly, tap-tap-tap).

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
- **No emoji in the UI.** Symbols are hand-authored inline SVG
  (`src/ui/icons.ts`); every unit and building icon is the game's own 3D model
  rendered to a small isometric snapshot at runtime
  (`src/render/thumbnails.ts`), so the interface always matches the art.
- **External models** (`assets/*.glb`, loaded by `src/render/assets.ts`): a
  sculpted palm — merged to one geometry, normalized to a fixed footprint and
  drawn as an InstancedMesh — and a rigged Greek villager whose 12 clips are
  driven by gameplay state (idle / walk / chop / collect / attack / death),
  skeleton-cloned per unit with root motion stripped so the simulation still
  owns position. Everything else stays procedural, and both models fall back
  to procedural geometry if they fail to load.
- Fog of war, minimap, pooled particles, procedural WebAudio sound,
  and an AI that runs its own economy, advances ages, expands, defends,
  and raids through the same command API the player uses.

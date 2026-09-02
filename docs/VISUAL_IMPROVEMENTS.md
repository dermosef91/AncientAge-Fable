# Ancient Age — 20 Visual Improvements, Ranked

Twenty candidate visual upgrades across general fidelity, VFX, models,
animation, environment and interface — each grounded in what the renderer
actually does today (file references throughout), ranked by **visible impact
per unit of effort on a mid-range phone**. This is the visual companion to
`docs/IMPROVEMENTS.md`; where an idea extends one of its entries (#28
day/night, #29 juice pass), that is noted rather than re-proposed.

**Scoring.** *Visibility* is how much of the screen the change touches and for
how much of a match. *Effort* is S / M / L against the existing systems.
*Risk* is mobile performance or art-direction drift.

## The ranking

| # | Improvement | Category | Visibility | Effort |
| --- | --- | --- | --- | --- |
| 1 | Day/night lighting cycle | Fidelity | Whole screen, whole match | M |
| 2 | Ground-contact shadow blobs | Fidelity | Every unit, always | S |
| 3 | Trees that fall when felled | Environment | Constant economic activity | S |
| 4 | Wheels that turn, siege that throws | Animation | Every cart, chariot, engine | S |
| 5 | Building damage states & staged construction | VFX | Every fight, every build | M |
| 6 | Scoped bloom (fire, gold, braziers) | Fidelity | Every flame and treasure | M |
| 7 | Wind through grass, reeds and canopies | Environment | The entire ground layer | S |
| 8 | Battle aftermath — arrows, craters, the fallen | VFX | Every battlefield | S |
| 9 | Weather and cloud shadows | Environment | Whole screen, in spells | M |
| 10 | Command & selection feedback, allegiance colors | Interface | Every tap | S |
| 11 | Villager variety — different people, same body | Models | Every settlement | S |
| 12 | Ambient life — birds, fish, dogs, gulls | Models | The idle minute | M |
| 13 | Water 2.0 — wakes, glints, currents | Environment | Every coast and river | M |
| 14 | Fog of war 2.0 — soft veils, faded memory | Fidelity | The whole frontier | M |
| 15 | Idle & social animation — the city off-duty | Animation | Every quiet moment | M |
| 16 | Minimap 2.0 — relief, icons, live pings | Interface | Always on screen | S |
| 17 | HUD material reskin per civilization | Interface | Every panel | M |
| 18 | Wonder spectacle & victory cinematics | VFX | The match's biggest moments | M |
| 19 | Cliff faces and coastline dressing | Environment | Map edges and highlands | M |
| 20 | Quality tiers & resolution scaling | Fidelity | Enabler for 1, 6, 9 | S |

## Recommendation

Ship in four bundles, in this order:

1. **The grounding bundle — #2, #3, #4** (all S). Contact shadows, falling
   trees and turning wheels are the three cheapest changes that make the whole
   game read as *physical*. No new systems, no post-processing, no risk. A
   weekend of work that every minute of every match displays.
2. **The lighting bundle — #1, #6, #20.** Day/night is the single most
   transformative item on the list, and bloom is worth double once there is a
   night for braziers to glow into. Do #20 (quality tiers) alongside, because
   the `EffectComposer` for bloom is the one genuinely new cost in the
   renderer and needs an off-switch on weak phones.
3. **The battlefield bundle — #5, #8, #10.** Damage states, aftermath and
   command feedback turn fights from stat exchanges into stories. All three
   build on pooled systems that already exist (`Fires`, `Decals`, `Markers`).
4. **The living-world bundle — #7, #11, #12, #15.** Wind, varied people and
   ambient creatures are what make the long economic midgame pleasant to
   watch. Pure charm, zero balance surface.

Items 13–19 are real but can trail; each is independently shippable. If only
*one* item gets built, build **#1** — nothing else changes as many pixels for
as many minutes.

---

## A. General visual fidelity

### 1. Day/night lighting cycle

**Today.** One `DirectionalLight` (`0xffeed2`, intensity 2.9), one
`HemisphereLight`, a fixed fog (`src/render/view.ts:224-241`). ACES tone
mapping and PCF soft shadows mean the *pipeline* is ready; the values just
never move. Every match is the same noon, and the braziers, torches and
Lighthouse the tier system already places never have a reason to exist.

**Proposal.** This is `IMPROVEMENTS.md` #28 and it stays the top visual item:
a single time-of-day scalar driving sun color/elevation/intensity, hemisphere
tint, fog color and background color through a keyframed curve — dawn gold,
noon white, dusk amber, night a *bright* blue-shifted dusk (never darkness on
a phone). At night, tier-placed braziers get point-light halos (a handful of
pooled `PointLight`s assigned to the nearest lit buildings to camera, not one
per brazier) and windows get emissive vertex colors. One full cycle per ~12
minutes; matches start at morning.

**Why rank 1.** It changes every pixel of every frame for the entire match,
it makes the existing tier decoration pay off, and it gives screenshots taken
ten minutes apart entirely different moods — the cheapest possible variety.

**Visibility** Maximum · **Effort** M · **Risk** night legibility — keep the floor bright, add a settings toggle (#20)

### 2. Ground-contact shadow blobs

**Today.** Units cast real PCF shadows — but the sun's shadow camera is a
34-unit box around the camera target (`src/render/view.ts:239-240`), so
shadows fade at distance, and at typical RTS zoom a soft directional shadow
under a 0.5-unit figure is faint. Flat-shaded low-poly art lives or dies on
ground contact, and `IMPROVEMENTS.md` #29 already called the blob "the single
biggest visual upgrade available" — it is still open.

**Proposal.** One `InstancedMesh` of soft radial-gradient discs, one instance
per visible unit, sized by `UNITS[type].radius`, y-offset just above ground,
multiplied over the terrain (`blending: MultiplyBlending`, depthWrite off).
Update positions in `syncUnits` where positions are already computed. ~60
instances, one draw call, works at every zoom and every distance the real
shadowmap gives up on. Boats get an elliptical darkening on the water instead.

**Why rank 2.** Cheapest change on the list with a whole-scene effect: every
unit visually *lands* on the ground instead of floating, which reads even at
minimap-adjacent zoom levels.

**Visibility** High · **Effort** S · **Risk** none

### 6. Scoped bloom — fire, gold and braziers that glow

**Today.** `renderer.render(scene, camera)` directly (`src/render/view.ts:533`)
— no composer, no post. Fires are already shader sprites with hot cores
(`src/render/effects.ts`, `FLAME_FRAG`), the Golden Idol and gold piles are
painted `0xf0c05a`, and nothing glows.

**Proposal.** The tightly-scoped bloom from `IMPROVEMENTS.md` #29:
`EffectComposer` + `UnrealBloomPass` with a threshold high enough that only
deliberate emitters bloom — flame sprites, brazier heads, the Idol, gold ore
glints, the Wonder's crown, projectile trails at night. Mark emitters by
pushing their colors above 1.0 (the pipeline is already tone-mapped, so HDR
color is the selection mechanism and costs no extra pass).

**Why rank 6, not higher.** Alone at noon it is a subtle change; after #1
lands it becomes the whole look of the night half of the cycle. Sequence it
with the lighting bundle, gate it behind #20's quality tier.

**Visibility** High (after #1) · **Effort** M · **Risk** mobile fill rate — half-resolution bloom buffer, quality-gated

### 14. Fog of war 2.0 — soft veils and faded memory

**Today.** Fog is a canvas: a `MAP_W×MAP_H` mask upscaled 3× with canvas
smoothing onto a plane floating at y 6.5 (`src/render/terrain.ts`). It works,
but the veil is a flat dark wash, the edge is a blur rather than a material,
and "explored but not currently seen" looks identical to "seen right now" —
the classic RTS memory-vs-vision distinction isn't drawn.

**Proposal.** Move the mask into a small shader on the same plane: animated
noise curling along the fog edge (the unexplored boundary drifts like mist),
a slight height-fade so the veil sits *in* the world rather than on it, and a
third state — currently-visible tiles at full color, explored-but-unseen
tiles desaturated ~30% and dimmed ~15% via a fullscreen-cheap second channel
in the existing mask texture. The sim already tracks both (`explored` vs the
live vision used by `updateFog`), so this is a render-side read of data that
exists.

**Visibility** High — the frontier is most of the map for most of the match · **Effort** M · **Risk** two-channel mask update cost; keep the canvas → texture upload throttled as today

### 20. Quality tiers & resolution scaling

**Today.** One code path for every device: pixel ratio capped at 2, shadows
always on, 700-particle pool (`src/render/view.ts:217-221`,
`src/render/effects.ts:9`). There is nowhere to *put* a costlier effect
without risking the phones the game targets.

**Proposal.** Three tiers (Low / Medium / High) in the pause menu, plus
auto-detect from a first-frames FPS sample: pixel ratio (1 / 1.5 / 2), shadow
map size (1024 / 2048), post-processing on/off (#6), weather density (#9),
ambient-life budget (#12). Not itself a visible improvement — it is the
*permission slip* for the three most expensive ones, which is why it makes
the list.

**Visibility** Indirect · **Effort** S · **Risk** none

## B. Environment

### 3. Trees that fall when felled

**Today.** A depleted tree vanishes: `treeRemove()` swaps in a stump and a
green particle burst covers the pop (`src/render/view.ts:381-392`,
`src/render/terrain.ts`). Chopping wood is the single most-repeated economic
act in the game, and its payoff frame is a disappearance.

**Proposal.** On `nodeDepleted`, promote the instanced tree to a short-lived
free mesh (the geometry is shared and cached), tip it over 0.8s with
accelerating rotation about its base away from the chopping villager, small
bounce at ground contact, leaf-colored burst *at the canopy's landing spot*,
then fade the trunk out and leave today's stump. The `treeShake` machinery
already proves per-instance animation works; this is the same trick with a
promotion at the end. Amber Grove giants fall slower and shake the camera.

**Why rank 3.** Constant, closeup, and *satisfying* — the player watches
villagers chop for the entire match, and this converts the most frequent
visual event in the economy from a pop into a payoff.

**Visibility** High frequency · **Effort** S · **Risk** none

### 7. Wind through grass, reeds and canopies

**Today.** Grass, flowers, bushes, reeds are static GPU-instanced batches
(`SCATTER_KINDS`, `src/render/terrain.ts`); trees are static instanced
meshes that move only when struck. The water has a living shader; the land
holds perfectly still.

**Proposal.** Swap the scatter and tree materials for a `MeshLambertMaterial`
with an `onBeforeCompile` vertex-shader hook: displacement by
`sin(time + worldPos · windDir)` scaled by vertex height, so bases stay
planted and tips sway. Two gust frequencies (a slow rolling wave plus a
fine flutter for reeds and flowers), wind direction per map. Canopy vertices
in `treeGeo` already sit above trunk vertices, so height-scaling needs no new
attributes. Zero JS per frame — one uniform.

**Visibility** The whole ground layer, always · **Effort** S · **Risk** none — it's vertex-shader-only

### 9. Weather and cloud shadows

**Today.** Fixed fog, fixed light, and a `World.biome` array (desert / grass
/ lush / highland) that colors the ground but never the air.
(`IMPROVEMENTS.md` #28 proposed weather; the cloud-shadow half here is new
and much cheaper.)

**Proposal.** Two layers, independently shippable:
- **Cloud shadows** — a scrolling low-frequency noise texture multiplied
  into the ground material's color (same `onBeforeCompile` hook as #7).
  Slow drifting patches of light and shade across the whole map for the
  cost of one texture sample. This is the biggest "the world is alive"
  signal available per line of code, and it works at noon — no
  dependency on #1.
- **Weather spells** — a few minutes of rain over lush/grass (streak
  particles from the pooled `Particles`, darkened palette, fog pulled in)
  or blowing sand over desert (tinted fog, horizontal dust streams,
  desaturation). Regional by biome, announced by a minute of building
  cloud shadow so it reads as weather, not a bug.

**Visibility** Whole screen in spells; cloud shadows always · **Effort** M (S for clouds alone) · **Risk** rain density on weak GPUs — tie to #20

### 13. Water 2.0 — wakes, glints and currents

**Today.** The water shader is already good: per-pixel shore distance field,
foam collars that hug the real coast, depth gradient
(`src/render/terrain.ts:buildWater`). But boats slide without wakes, fish
markers bob without breaking the surface, rivers don't visibly flow anywhere,
and the sun never glitters.

**Proposal.** Four additions to systems that exist: a V-wake behind moving
boats (two rows of foam-colored particles from the pool, spawned in
`syncUnits` where dust already spawns for land units); an occasional fish
jump at fish nodes (small arc + `splash()`, which exists); a sun-glint
sparkle term in the water fragment shader (noise threshold on the existing
`n2`, brightened toward the sun azimuth); and a slow directional scroll of
the noise field on river maps so the great river visibly *runs* toward the
sea.

**Visibility** Every coastal and river map · **Effort** M · **Risk** none

### 19. Cliff faces and coastline dressing

**Today.** Highland is a color ramp (`rockLow`→`rockHigh`) on a smooth
heightfield; steep slopes are just steeper lawn. Coasts get foam from the
water side but nothing from the land side.

**Proposal.** Scatter instanced rock-outcrop meshes on tiles whose height
gradient exceeds a threshold (computed once from `World.height` at terrain
build), oriented to the slope, so highlands get real broken silhouettes; a
band of shells, driftwood and pale pebbles (`SCATTER_KINDS` additions) along
the shoreline distance field that `buildWater` already computes; darker
strata coloring on near-vertical faces. All static instancing, all at load.

**Visibility** Map edges, highland biome, every coast · **Effort** M · **Risk** rock scatter must respect pathability visuals — place only on unwalkable-steep tiles

## C. VFX

### 5. Building damage states & staged construction

**Today.** A building's damage story is: white hit-flash, fire while under
attack (with soot darkening — `src/render/view.ts:1121-1137`), then a full
collapse at death. Between 100% and 1% HP the *mesh* is pristine. And
construction is one generic scaffold plus the whole building sliding up out
of the ground (`syncBuildings`).

**Proposal.** Damage: at <66% HP swap in cracks (dark decal quads parented to
walls), at <33% remove roof segments and add a persistent thin smoke wisp
(the `Fires` smoke field, at low intensity, without flame). `buildingGeo` is
already tier-parameterized (`v.tier` rebuilds the mesh on level-up), so a
damage tier that strips parts reuses the exact mechanism. Construction: three
visible stages — foundation posts, timber frame, walls-without-roof — driven
by `b.progress` thresholds instead of the submerged-mesh slide, keeping the
scaffold. Hammer-strike dust puffs at the working villager's mallet on each
work tick (the `gatherTick` pathway already localizes effects this way).

**Visibility** Every siege and every build order · **Effort** M · **Risk** geometry rebuild churn under fast HP swings — hysteresis on the thresholds

### 8. Battle aftermath — arrows, craters and the fallen

**Today.** Arrows vanish on impact (`syncProjectiles` removes the mesh the
tick the sim drops it); a boulder disappears at the moment it should matter
most; corpses sink away in ~1–3 seconds (`updateDying`); blood and scorch
decals land and fade (`Decals`, 96-quad pool). The morning after a battle,
the field is spotless.

**Proposal.** Arrows that miss or strike ground stick at their impact angle
for 6–8 seconds then fade (a small instanced pool, fed from the projectile's
last transform — `arrowGeo` already exists). Catapult boulders leave a crater
decal (a darker, longer-lived `scorch` variant) and stay as ground rubble for
20 seconds like building rubble does. Fallen soldiers linger 3× longer at
low opacity before sinking, so a battlefield reads as one. Shields on fallen
hoplites detach and lie flat — the kit meshes are already separate objects.

**Visibility** Every fight's aftermath · **Effort** S · **Risk** decal pool pressure in big fights — bump `MAX_DECALS` or give craters their own small pool

### 18. Wonder spectacle & victory cinematics

**Today.** The Wonder — the game's alternate win condition, defended for 180
seconds — is a building like any other: same scaffold, same flags, a toast
for the countdown. Victory and defeat are screens.

**Proposal.** The Wonder construction gets a crane silhouette on the
scaffold and rising course-by-course masonry (the staged construction of #5,
with more stages); on completion, a slow column of light-gold particles and
a map-visible beam for the whole 180-second countdown, so both players see
exactly where the endgame is happening from anywhere. On any victory/defeat,
release the camera into a slow orbital drift around the decisive site
(Wonder or last Town Center) with the HUD faded, for five seconds before
the screen — the existing free camera and `addShake` infrastructure make
this a controller, not an engine feature.

**Visibility** The two biggest moments a match has · **Effort** M · **Risk** none

## D. Models

### 11. Villager variety — different people, same body

**Today.** Every villager of a civilization is the *identical* sculpted
character: same tunic, same colors, same face
(`instantiateCharacter`/`riggedAsset`). The kit system varies soldiers
brilliantly; civilians got none of it. A twenty-villager economy looks like
a cloning accident.

**Proposal.** Deterministic per-unit variety seeded by `u.id`, using
machinery that already exists: tint the cloned materials (each unit already
owns clones for the damage flash — `createRiggedUnit` pushes them into
`v.mats`) across 4–5 tunic shades and 3 skin tones per civ; and attach one
small kit piece from a civilian wardrobe — headscarf, straw hat, belt, apron
— through the same bone-mounting path `fitKit` uses for soldiers. Zero new
draw-call cost beyond one kit mesh, which is the soldier budget already.

**Visibility** Every settlement, all match · **Effort** S · **Risk** keep tints inside each civ's palette so armies still read at a glance

### 12. Ambient life — birds, fish, dogs and gulls

**Today.** The wilds have gazelle, boar and wolves as *sim* entities; the air
and the town have nothing. Between orders, nothing on screen moves but the
water.

**Proposal.** Pure-view creatures with no sim presence, budgeted by #20:
- **Birds** — instanced flocks of 5–9 two-triangle silhouettes on wandering
  spline paths, flushed upward from a tree when it's felled (#3) or when
  fighting starts nearby (reads the same events the view already handles).
- **Gulls** over coast, circling docks and fishing boats.
- **Dogs and chickens** in settlements above Hamlet — one or two per town,
  wandering between buildings on the civic street graph that already links
  them, fleeing briefly when armies pass.
- **Heat shimmer** over desert at noon — a subtle scrolling refraction band
  only when #6's composer exists; otherwise skip.

**Visibility** Every idle moment — which is most of an RTS · **Effort** M · **Risk** cap counts hard; all instanced, nothing enters the sim

### 4. Wheels that turn, siege that throws

**Today.** The chariot's wheels never rotate — the whole cab bobs on a sine
(`syncUnits`, speed 14 bounce). Trade carts roll wheel-less in effect; the
catapult's throw is the *projectile appearing*; the ram batters by leaning
(`siege` bob at speed 5). These are the most mechanical objects in the game
and none of their mechanisms move.

**Proposal.** Split wheels out as child meshes in `unitGeo`'s chariot/cart
assembly (they are already distinct boxes in the merged geometry — the change
is keeping them unmerged, at one extra draw call for these few units) and
spin them by distance traveled. Give the catapult a two-part arm: cocked
while `attackAnimT` approaches the sim's launch tick, released across 100ms
exactly when the boulder spawns — the `driveAttack` scrub-from-sim-timer
pattern already solves this synchronization for rigged units. Give the ram a
swinging head on the same timer, and both engines slight wheel-rut wobble
instead of the generic bob.

**Visibility** Every cart, chariot and siege engine — always in the fights that matter · **Effort** S · **Risk** none

## E. Animation

### 15. Idle & social animation — the city off-duty

**Today.** An idle villager plays one looping idle clip, staggered by id so
crowds don't breathe in lockstep (`createRiggedUnit`). That's the right
foundation and the whole story: nobody stretches, looks around, chats or
warms their hands.

**Proposal.** An idle-flavor layer: every 6–12 seconds an idle unit blends a
short variation — stretch, shift weight, wipe brow (reuse slices of existing
clips via the from/to windowing that `ATTACK_ANIM` already does — no new
clips needed). Two idle villagers within 2 tiles turn to face each other for
a few seconds ("chat"). Idle soldiers ground their spears; at night (#1),
idlers drift toward the nearest brazier. All view-side, reading positions
the sim already exposes.

**Visibility** Every quiet moment in town · **Effort** M · **Risk** facing changes must not fight sim-driven `u.dir` — apply only to truly idle units and yield instantly on any order

### 10. Command & selection feedback, allegiance colors

**Today.** Selection is a pool of *green* rings — the same green for your
spearman and the enemy's (`ringMat`, `src/render/view.ts:197`). A move order
shows nothing at the destination (the rally pole is production-only), an
attack order flashes nothing on the victim, and `IMPROVEMENTS.md` #29's
"selection feedback" line is still open.

**Proposal.** Allegiance-tinted rings (player green, enemy red, wilds amber
— three materials instead of one); a one-shot expanding ground ripple at
every move destination and a red pulse ring on an attack target (the
`Markers.ping` pathway, new flavors); rings ease in over 80ms rather than
appearing; box-drag select gets a translucent ground rectangle in-world.
Command acknowledgment is the highest-frequency interaction in the game —
this makes every single tap feel received.

**Visibility** Every interaction · **Effort** S · **Risk** none

## F. Interfaces

### 16. Minimap 2.0 — relief, icons, live pings

**Today.** A 256px canvas: flat terrain base image, fog overlay, square
entity dots, gold diamonds for sites, a frustum trapezoid
(`src/ui/minimap.ts`). Functional, but flat — elevation, coast and forest
all read as texture noise at this size.

**Proposal.** Bake hillshading into the base image (the height grid is right
there — one lambert pass at build time makes ridges and the river valley pop
at 256px); crisp 2-3px icon glyphs instead of squares for Town Centers,
landmarks, and the Idol carrier; animated expanding-ring pings for attacks
that repeat until the camera visits (feeding `IMPROVEMENTS.md` #24); a subtle
white coastline stroke. All canvas work, no GL.

**Visibility** Permanently on screen · **Effort** S · **Risk** none

### 17. HUD material reskin per civilization

**Today.** The HUD is clean dark-glass panels (`src/styles.css`, ~1200 lines)
— readable, consistent, and identical whether you lead Egypt or Rome. The
game's own rule — no emoji, icons from the game's real models
(`src/render/thumbnails.ts`) — is a strong foundation the chrome doesn't yet
match.

**Proposal.** Keep the layout; give the chrome a material identity: panel
backgrounds get a faint procedural texture (papyrus for Egypt, marble for
Greece, travertine for Rome — generated once to a small canvas, used as
`background-image`), the accent color already defined per faction
(`FACTIONS[].accent`) drives borders and active states, and buttons get a
1px bevel that reads as carved rather than printed. Settlement level-up
subtly enriches the chrome the way it already enriches the buildings —
Camp HUD is rope-and-hide plain; Metropolis HUD carries gilt edges.

**Visibility** Every panel, all match · **Effort** M · **Risk** readability is sacred — texture at ≤8% opacity, contrast ratios unchanged

---

## Cross-references

- **#1, #6, #9** extend `IMPROVEMENTS.md` #28 (day/night & weather); the
  cloud-shadow half of #9 is new here.
- **#2, #8, #10** close out the items `IMPROVEMENTS.md` #29 left open
  (contact shadows, arrow persistence, selection pulses, scoped bloom).
- **#5** delivers the visual half of `IMPROVEMENTS.md` #18 (damage states)
  without the repair mechanic, so it can ship independently of sim work.
- **#16** feeds `IMPROVEMENTS.md` #24 (event feed & alerts): the ping layer
  built here is the one that entry wants to reuse.

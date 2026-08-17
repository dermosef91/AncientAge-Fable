// The settlement dresses itself. Every building that goes up is linked to its
// neighbours by paved roads, and the larger works gather gardens, plazas and
// statues in the spare ground around them as the settlement grows — so a
// sprawl of houses reads as one city rather than scattered huts.
//
// None of this is a building. Civic scenery never claims a grid cell, costs
// nothing and is never selected or demolished: laying a real foundation over
// it simply sweeps it away.
import { MAP_H, MAP_W } from '../core/config';
import type { Building, BuildingTypeId, Faction } from '../core/types';
import { dist, makeRng } from '../core/utils';
import { heightAt } from './map';
import { F_BLOCK, F_BUILDING, F_WATER, landPassable } from './pathfinding';
import type { World } from './world';

export type CivicKind = 'road' | 'garden' | 'plaza' | 'statue';

/** One piece of civic scenery: a paving slab, or an ornament by a building. */
export interface CivicProp {
  id: number;
  kind: CivicKind;
  owner: number;
  faction: Faction;
  /** The building this ornament belongs to (0 for road slabs). */
  bId: number;
  cx: number; cz: number;   // top-left cell of the footprint
  size: number;             // footprint, in cells
  x: number; z: number;     // world center
  rot: number;
  /** Paving alternation, so a road doesn't look rubber-stamped. */
  variant: number;
}

/** How far a new building reaches for a neighbour to pave a road to. */
const ROAD_REACH = 17;
/** ...and how much further it reaches for one of the settlement's hubs. */
const HUB_REACH = 26;
/** Abandon a road if more than this share of the straight run is impassable. */
const ROAD_BLOCKED_MAX = 0.34;
/** Ground this low is beach or worse — nothing civic is laid on it. */
const MIN_GROUND_Y = -0.1;

/** Neither anchors a road nor earns ornaments: fields and fortifications. */
const NO_CIVIC = new Set<BuildingTypeId>(['wall', 'farm']);
/** The heart of a settlement — every new work reaches for the nearest one. */
const HUBS = new Set<BuildingTypeId>(['towncenter', 'storehouse', 'market', 'forum']);

/** Which ornaments a settlement of this level knows how to raise. */
function ornamentKinds(level: number): CivicKind[] {
  const out: CivicKind[] = [];
  if (level >= 1) out.push('garden');
  if (level >= 2) out.push('plaza');
  if (level >= 3) out.push('statue');
  return out;
}

/** How many ornaments one building earns. Only the larger works qualify. */
function ornamentBudget(level: number, size: number): number {
  if (size < 3 || level < 1) return 0;
  return Math.min(3, Math.floor((level + 1) / 2) + (size >= 4 ? 1 : 0));
}

// ---------------------------------------------------------------- entry points

/** A building has just been finished: pave its approaches and dress it up. */
export function planCivic(world: World, b: Building) {
  if (b.owner > 1 || NO_CIVIC.has(b.type)) return;
  seedCivic(world);
  layRoads(world, b);
  dressBuilding(world, b);
}

/** The settlement has grown: every standing work earns its new ornaments. */
export function civicLevelUp(world: World, owner: number) {
  seedCivic(world);
  for (const b of world.buildings.values()) {
    if (b.owner !== owner || !b.built || NO_CIVIC.has(b.type)) continue;
    dressBuilding(world, b);
  }
}

/** A foundation is being laid here — sweep away whatever scenery it covers. */
export function clearCivicUnder(world: World, cx: number, cz: number, size: number) {
  if (world.civic.length === 0) return;
  const hit = new Set<number>();
  for (let z = cz; z < cz + size; z++) {
    for (let x = cx; x < cx + size; x++) {
      if (x < 0 || z < 0 || x >= MAP_W || z >= MAP_H) continue;
      const id = world.civicAt[z * MAP_W + x];
      if (id > 0) hit.add(id);
    }
  }
  if (hit.size === 0) return;
  for (let i = world.civic.length - 1; i >= 0; i--) {
    const p = world.civic[i];
    if (!hit.has(p.id)) continue;
    for (let z = p.cz; z < p.cz + p.size; z++) {
      for (let x = p.cx; x < p.cx + p.size; x++) {
        const ci = z * MAP_W + x;
        if (world.civicAt[ci] === p.id) world.civicAt[ci] = 0;
      }
    }
    world.civic.splice(i, 1);
  }
  world.civicRev++;
}

// ---------------------------------------------------------------- roads

function layRoads(world: World, b: Building) {
  let nearest: Building | null = null, nearestD = ROAD_REACH;
  let hub: Building | null = null, hubD = HUB_REACH;
  for (const o of world.buildings.values()) {
    if (o.id === b.id || o.owner !== b.owner || !o.built || NO_CIVIC.has(o.type)) continue;
    const d = dist(o.x, o.z, b.x, b.z);
    if (d < nearestD) { nearestD = d; nearest = o; }
    if (HUBS.has(o.type) && d < hubD) { hubD = d; hub = o; }
  }
  // The nearest neighbour keeps the streets short; the nearest hub keeps them
  // pointing at the middle of town, which is what makes the sprawl read as one.
  if (nearest) pave(world, b, nearest);
  if (hub && hub !== nearest) pave(world, b, hub);
}

/** Lay a single-slab road along the straight run between two buildings. */
function pave(world: World, a: Building, b: Building) {
  const cells = walkLine(Math.floor(a.x), Math.floor(a.z), Math.floor(b.x), Math.floor(b.z));
  const open: number[] = [];
  let considered = 0, blocked = 0;
  for (const c of cells) {
    if (c.x < 1 || c.z < 1 || c.x >= MAP_W - 1 || c.z >= MAP_H - 1) return;
    const i = c.z * MAP_W + c.x;
    const v = world.grid[i];
    if (v & F_BUILDING) continue;       // passes under a neighbour, hidden anyway
    considered++;
    if ((v & (F_BLOCK | F_WATER)) || heightAt(world, c.x + 0.5, c.z + 0.5) < MIN_GROUND_Y) {
      blocked++;
      continue;
    }
    if (world.civicAt[i] !== 0) continue; // already paved
    open.push(i);
  }
  // A stand of trees or an inlet in the way means these two are not neighbours
  // in any sense a road would express.
  if (considered === 0 || blocked / considered > ROAD_BLOCKED_MAX) return;
  const faction = world.players[a.owner].faction;
  for (const i of open) {
    const cx = i % MAP_W, cz = (i / MAP_W) | 0;
    addProp(world, {
      kind: 'road', owner: a.owner, faction, bId: 0,
      cx, cz, size: 1, x: cx + 0.5, z: cz + 0.5, rot: 0,
      variant: (cx * 7 + cz * 13) % 3 === 0 ? 1 : 0
    });
  }
}

/**
 * Cells from a to b, stepping one axis at a time so the run stays
 * edge-connected — a diagonal chain of corner-touching slabs is not a road.
 */
function walkLine(ax: number, az: number, bx: number, bz: number): { x: number; z: number }[] {
  const out = [{ x: ax, z: az }];
  let x = ax, z = az;
  const sx = Math.sign(bx - ax), sz = Math.sign(bz - az);
  const adx = Math.abs(bx - ax), adz = Math.abs(bz - az);
  let err = adx - adz;
  while (x !== bx || z !== bz) {
    if (z === bz || (x !== bx && err * 2 > -adz)) { err -= adz; x += sx; }
    else { err += adx; z += sz; }
    out.push({ x, z });
  }
  return out;
}

// ---------------------------------------------------------------- ornaments

function dressBuilding(world: World, b: Building) {
  const level = world.players[b.owner].level;
  const budget = ornamentBudget(level, b.size);
  if (budget <= 0) return;
  // Where this building's existing ornaments stand, so the next ones go
  // somewhere else entirely rather than piling up along one wall.
  const taken: number[] = [];
  for (const p of world.civic) {
    if (p.bId === b.id) taken.push(Math.atan2(p.z - b.z, p.x - b.x));
  }
  if (taken.length >= budget) return;
  const kinds = ornamentKinds(level);
  if (kinds.length === 0) return;

  const faction = world.players[b.owner].faction;
  // Seeded on the building, so a given work always dresses the same way.
  const rng = makeRng((Math.imul(b.id, 2654435761) ^ 0x5f3a) >>> 0);
  // Walk a shuffled list rather than drawing independently: a building with
  // three ornaments gets one of each kind, not three of the same.
  const order = kinds.slice();
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  for (let n = taken.length; n < budget; n++) {
    const kind = order[n % order.length];
    const size = kind === 'statue' ? 1 : 2;
    const spot = pickSpot(world, b, size, taken, rng);
    if (!spot) continue;
    const x = spot.x + size / 2, z = spot.z + size / 2;
    addProp(world, {
      kind, owner: b.owner, faction, bId: b.id,
      cx: spot.x, cz: spot.z, size, x, z,
      rot: Math.floor(rng() * 4) * (Math.PI / 2),
      variant: 0
    });
    taken.push(Math.atan2(z - b.z, x - b.x));
  }
}

/**
 * The best free slot on the bands around a building: close in, and as far
 * around the building as possible from whatever it already has.
 */
function pickSpot(
  world: World, b: Building, size: number, taken: number[], rng: () => number
) {
  let best: { x: number; z: number } | null = null, bestScore = -Infinity;
  for (const s of ringSpots(b, size)) {
    if (!spotFree(world, s.x, s.z, size)) continue;
    const x = s.x + size / 2, z = s.z + size / 2;
    let score = rng() * 0.25 - dist(x, z, b.x, b.z) * 0.12;
    if (taken.length > 0) {
      let gap = Math.PI;
      const a = Math.atan2(z - b.z, x - b.x);
      for (const t of taken) gap = Math.min(gap, angleGap(a, t));
      score += gap;
    }
    if (score > bestScore) { bestScore = score; best = s; }
  }
  return best;
}

/** Smallest angle between two bearings, 0..PI. */
function angleGap(a: number, b: number): number {
  let d = Math.abs(a - b) % (Math.PI * 2);
  if (d > Math.PI) d = Math.PI * 2 - d;
  return d;
}

/** Top-left cells of the two bands just outside a building's footprint. */
function ringSpots(b: Building, size: number): { x: number; z: number }[] {
  const out: { x: number; z: number }[] = [];
  for (const gap of [1, 2]) {
    const x0 = b.cx - gap - size, x1 = b.cx + b.size + gap;
    const z0 = b.cz - gap - size, z1 = b.cz + b.size + gap;
    for (let x = x0; x <= x1; x++) { out.push({ x, z: z0 }); out.push({ x, z: z1 }); }
    for (let z = z0 + 1; z < z1; z++) { out.push({ x: x0, z }); out.push({ x: x1, z }); }
  }
  return out;
}

// ---------------------------------------------------------------- bookkeeping

/** Is every cell of this footprint open ground with no scenery on it already? */
function spotFree(world: World, cx: number, cz: number, size: number): boolean {
  for (let z = cz; z < cz + size; z++) {
    for (let x = cx; x < cx + size; x++) {
      if (x < 1 || z < 1 || x >= MAP_W - 1 || z >= MAP_H - 1) return false;
      // landPassable rejects water, blockers and building footprints alike
      if (!landPassable(world.grid, x, z)) return false;
      if (world.civicAt[z * MAP_W + x] !== 0) return false;
      if (heightAt(world, x + 0.5, z + 0.5) < MIN_GROUND_Y) return false;
    }
  }
  return true;
}

function addProp(world: World, p: Omit<CivicProp, 'id'>): CivicProp {
  const prop: CivicProp = { id: world.nextId++, ...p };
  world.civic.push(prop);
  for (let z = prop.cz; z < prop.cz + prop.size; z++) {
    for (let x = prop.cx; x < prop.cx + prop.size; x++) {
      world.civicAt[z * MAP_W + x] = prop.id;
    }
  }
  world.civicRev++;
  return prop;
}

/**
 * The founding plaza laid at map gen is scenery too, and it is not ours to
 * remove — claim its cells once so roads never double up on them.
 */
function seedCivic(world: World) {
  if (world.civicSeeded) return;
  world.civicSeeded = true;
  for (const d of world.deco) {
    if (!d.kind.startsWith('paving')) continue;
    const cx = Math.floor(d.x), cz = Math.floor(d.z);
    if (cx < 0 || cz < 0 || cx >= MAP_W || cz >= MAP_H) continue;
    world.civicAt[cz * MAP_W + cx] = -1;
  }
}

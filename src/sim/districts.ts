// Districts: what standing next to the right neighbour is worth.
//
// A house alone in a swamp supports the same five heads as a house on a paved
// street beside a garden, and the settlement already knows the difference — the
// civic layer links every finished building to its neighbours and its hub. This
// module reads that same geography back into the simulation.
//
// Every bonus is deliberately small. A handsome city and an optimal one should
// be within a few percent of each other; the point is to make placement a
// decision, not to make one layout compulsory.
import { ADJ, BUILDINGS, MAP_H, MAP_W } from '../core/config';
import type { Building, BuildingTypeId } from '../core/types';
import { dist2 } from '../core/utils';
import { SURFACE } from './civic';
import type { World } from './world';

/** Workshops that make up a drill yard when they stand together. */
const DRILL = new Set<BuildingTypeId>(['barracks', 'range', 'siegeworks']);
/** Sanctuaries that the games embolden. */
const SACRED = new Set<BuildingTypeId>(['shrine', 'temple']);

/**
 * Recompute every adjacency bonus for one player. Called whenever the shape of
 * their city changes — a building finished, fell, changed hands or was
 * upgraded, or the settlement grew and dressed itself with new ornaments.
 *
 * O(buildings^2) over one player's standing works, which at this game's scale
 * is a few thousand distance checks on an event that happens seconds apart.
 */
export function recomputeAdjacency(world: World, owner: number) {
  if (owner > 1) return;
  const mine: Building[] = [];
  for (const b of world.buildings.values()) {
    if (b.owner === owner && b.built) mine.push(b);
  }
  for (const b of mine) {
    b.adjPop = 0;
    b.adjTrain = 1;
    b.adjTrade = 1;
    b.adjFarm = 1;
    b.adjHeal = 1;
    b.adjDepot = false;
    switch (b.type) {
      case 'house': {
        // a street of houses is worth more than the same houses scattered
        let neighbours = 0;
        for (const o of mine) {
          if (o.id !== b.id && o.type === 'house' && near(b, o, ADJ.houseR)) neighbours++;
        }
        if (neighbours >= ADJ.houseNeighbours) b.adjPop += 1;
        if (ornamentNear(world, b, ADJ.ornamentR)) b.adjPop += 1;
        break;
      }
      case 'barracks': case 'range': case 'siegeworks': {
        const kinds = new Set<BuildingTypeId>();
        for (const o of mine) {
          if (o.id !== b.id && DRILL.has(o.type) && near(b, o, ADJ.drillR)) kinds.add(o.type);
        }
        if (kinds.size >= ADJ.drillTypes) b.adjTrain = Math.max(0.2, ADJ.drillMul);
        break;
      }
      case 'market': {
        for (const o of mine) {
          if (o.type === 'forum' && near(b, o, ADJ.exchangeR)) { b.adjTrade = ADJ.exchangeMul; break; }
        }
        break;
      }
      case 'farm': {
        let neighbours = 0;
        for (const o of mine) {
          if (o.id !== b.id && o.type === 'farm' && near(b, o, ADJ.farmR)) neighbours++;
        }
        if (neighbours >= ADJ.farmNeighbours) b.adjFarm = ADJ.farmMul;
        break;
      }
      case 'storehouse': {
        b.adjDepot = countNodes(world, b.x, b.z, ADJ.depotR) >= ADJ.depotNodes;
        break;
      }
      // (every other type carries no adjacency of its own)
      case 'shrine': case 'temple': {
        for (const o of mine) {
          if (o.type === 'amphitheater' && near(b, o, ADJ.sacredR)) { b.adjHeal = ADJ.sacredMul; break; }
        }
        break;
      }
    }
  }
  world.depots[owner] = mine
    .filter(b => b.type === 'storehouse' && b.adjDepot)
    .map(b => ({ x: b.x, z: b.z }));
  world.recomputePop(owner);
}

/**
 * A storehouse standing in a rich seam runs as a depot: everything hauled from
 * the nodes around it comes in a little faster.
 */
export function depotMulAt(world: World, owner: number, x: number, z: number): number {
  // Read off the short cached list, not the building map: this runs for every
  // gathering villager on every tick.
  const list = world.depots[owner];
  if (!list || list.length === 0) return 1;
  for (const d of list) {
    if (dist2(d.x, d.z, x, z) <= ADJ.depotR * ADJ.depotR) return ADJ.depotMul;
  }
  return 1;
}

/**
 * What this building would gain standing here — shown live on the placement
 * ghost, because an adjacency system nobody can see is not a system.
 */
export function previewAdjacency(
  world: World, owner: number, type: BuildingTypeId, cx: number, cz: number
): string {
  const size = BUILDINGS[type].size;
  const x = cx + size / 2, z = cz + size / 2;
  const at = { x, z };
  const own = (b: Building) => b.owner === owner && b.built;
  switch (type) {
    case 'house': {
      let neighbours = 0;
      for (const o of world.buildings.values()) {
        if (own(o) && o.type === 'house' && near(at, o, ADJ.houseR)) neighbours++;
      }
      let pop = 0;
      if (neighbours >= ADJ.houseNeighbours) pop++;
      if (ornamentNear(world, at, ADJ.ornamentR)) pop++;
      return pop > 0 ? `+${pop} pop — a street, not a farmstead` : '';
    }
    case 'barracks': case 'range': case 'siegeworks': {
      const kinds = new Set<BuildingTypeId>();
      for (const o of world.buildings.values()) {
        if (own(o) && DRILL.has(o.type) && near(at, o, ADJ.drillR)) kinds.add(o.type);
      }
      return kinds.size >= ADJ.drillTypes ? 'Drill yard — trains 15% faster' : '';
    }
    case 'market':
      for (const o of world.buildings.values()) {
        if (own(o) && o.type === 'forum' && near(at, o, ADJ.exchangeR)) return 'Exchange — +20% trade gold';
      }
      return '';
    case 'forum':
      for (const o of world.buildings.values()) {
        if (own(o) && o.type === 'market' && near(at, o, ADJ.exchangeR)) return 'Exchange — +20% trade gold';
      }
      return '';
    case 'farm': {
      let neighbours = 0;
      for (const o of world.buildings.values()) {
        if (own(o) && o.type === 'farm' && near(at, o, ADJ.farmR)) neighbours++;
      }
      return neighbours >= ADJ.farmNeighbours ? 'Field system — +10% yield' : '';
    }
    case 'storehouse':
      return countNodes(world, x, z, ADJ.depotR) >= ADJ.depotNodes
        ? 'Depot — +10% gathering nearby' : '';
    case 'shrine': case 'temple':
      for (const o of world.buildings.values()) {
        if (own(o) && o.type === 'amphitheater' && near(at, o, ADJ.sacredR)) {
          return 'Sacred games — half again the healing reach';
        }
      }
      return '';
    case 'amphitheater':
      for (const o of world.buildings.values()) {
        if (own(o) && SACRED.has(o.type) && near(at, o, ADJ.sacredR)) {
          return 'Sacred games — half again the healing reach';
        }
      }
      return '';
    default:
      return '';
  }
}

function near(a: { x: number; z: number }, b: { x: number; z: number }, r: number): boolean {
  return dist2(a.x, a.z, b.x, b.z) <= r * r;
}

/**
 * Greenery or a public square close at hand. Read off the civic cell index
 * rather than walking `world.civic`, which is one entry per paved cell and
 * runs into the thousands in a mature city.
 */
function ornamentNear(world: World, b: { x: number; z: number }, r: number): boolean {
  const x0 = Math.max(0, Math.floor(b.x - r)), x1 = Math.min(MAP_W - 1, Math.ceil(b.x + r));
  const z0 = Math.max(0, Math.floor(b.z - r)), z1 = Math.min(MAP_H - 1, Math.ceil(b.z + r));
  const r2 = r * r;
  for (let z = z0; z <= z1; z++) {
    for (let x = x0; x <= x1; x++) {
      const v = world.civicKindAt[z * MAP_W + x];
      if (v !== SURFACE.garden && v !== SURFACE.plaza) continue;
      if (dist2(x + 0.5, z + 0.5, b.x, b.z) <= r2) return true;
    }
  }
  return false;
}

/** How rich a seam this spot sits in. Stops counting once it has enough. */
function countNodes(world: World, x: number, z: number, r: number): number {
  let n = 0;
  const r2 = r * r;
  for (const node of world.nodes.values()) {
    if (node.kind === 'carcass') continue;
    if (dist2(node.x, node.z, x, z) <= r2 && ++n >= ADJ.depotNodes) return n;
  }
  return n;
}

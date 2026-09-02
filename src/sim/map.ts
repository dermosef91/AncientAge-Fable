// Procedural skirmish maps: every match rolls a fresh world. An archetype
// shapes the water (open coast, island chains, lake lands or a great river),
// biomes paint the land, a guaranteed land route links the two towns, and
// the wilds between them are seeded with encounters worth marching out for.
import { ENC, FORD_NAMES, MAP_H, MAP_W, WILDS } from '../core/config';
import type { BuildingTypeId, EncounterKind, EncounterSite, Faction, UnitTypeId } from '../core/types';
import { LANDMARK_BUILDING, LANDMARK_KINDS } from '../core/types';
import { clamp, dist, fbm, makeNoise2D, makeRng } from '../core/utils';
import { F_BLOCK, F_BUILDING, F_WATER, landPassable, nearestFree } from './pathfinding';
import type { World } from './world';

export const WATER_Y = -0.34;

// Biome ids stored per-cell in world.biome
export const BIOME_DESERT = 0;
export const BIOME_GRASS = 1;
export const BIOME_LUSH = 2;
export const BIOME_HIGHLAND = 3;

export type MapArchetype = 'coast' | 'islands' | 'lakes' | 'river';

export interface MapInfo {
  playerStart: { x: number; z: number };
  enemyStart: { x: number; z: number };
  archetype: MapArchetype;
}

export function heightAt(world: World, x: number, z: number): number {
  const gx = clamp(x, 0, MAP_W - 0.001), gz = clamp(z, 0, MAP_H - 0.001);
  const x0 = Math.floor(gx), z0 = Math.floor(gz);
  const fx = gx - x0, fz = gz - z0;
  const W = MAP_W + 1;
  const h00 = world.height[z0 * W + x0];
  const h10 = world.height[z0 * W + x0 + 1];
  const h01 = world.height[(z0 + 1) * W + x0];
  const h11 = world.height[(z0 + 1) * W + x0 + 1];
  return (h00 * (1 - fx) + h10 * fx) * (1 - fz) + (h01 * (1 - fx) + h11 * fx) * fz;
}

export function genMap(world: World, seed: number, playerFaction: Faction, aiFaction: Faction): MapInfo {
  const rng = makeRng(seed);
  const noise = makeNoise2D(seed * 7 + 1);
  const noiseB = makeNoise2D(seed * 13 + 5);
  const W1 = MAP_W + 1;
  const N = MAP_W * MAP_H;

  // ---------------------------------------------------------------- archetype
  const roll = rng();
  const archetype: MapArchetype =
    roll < 0.3 ? 'coast' : roll < 0.55 ? 'islands' : roll < 0.8 ? 'lakes' : 'river';

  // landness(x, z) > 0 means land; <= 0 means water, more negative = deeper.
  let landness: (x: number, z: number) => number;

  const fordSpots: { x: number; z: number }[] = [];
  if (archetype === 'coast') {
    // ocean along one random edge, bulging into bays
    const side = Math.floor(rng() * 4);
    const off = 28 + rng() * 22;
    landness = (x, z) => {
      const c = side === 0 ? x : side === 1 ? z : side === 2 ? MAP_W - x : MAP_H - z;
      const t = side % 2 === 0 ? z : x;
      const edge = off + noise(3.3, t * 0.017) * 13 + noise(9.1, t * 0.0045) * 26;
      return clamp((c - edge) / 14, -1, 1);
    };
  } else if (archetype === 'islands') {
    // a handful of great islands rising from open sea (plus scenic islets)
    const blobs: { x: number; z: number; r: number }[] = [];
    const big = 3 + Math.floor(rng() * 3);
    for (let i = 0; i < big; i++) {
      blobs.push({
        x: 42 + rng() * (MAP_W - 84),
        z: 42 + rng() * (MAP_H - 84),
        r: 46 + rng() * 34
      });
    }
    const small = 3 + Math.floor(rng() * 4);
    for (let i = 0; i < small; i++) {
      blobs.push({ x: 18 + rng() * (MAP_W - 36), z: 18 + rng() * (MAP_H - 36), r: 10 + rng() * 12 });
    }
    landness = (x, z) => {
      let f = 0;
      for (const b of blobs) {
        const d2 = (x - b.x) * (x - b.x) + (z - b.z) * (z - b.z);
        const k = 1 - d2 / (b.r * b.r);
        if (k > 0) f += k;
      }
      return clamp(f * 1.25 - 0.5 + fbm(noise, x * 0.02, z * 0.02, 3) * 0.34, -1, 1);
    };
  } else if (archetype === 'lakes') {
    // inland country pocked with lakes; the largest becomes "the sea"
    const lakes: { x: number; z: number; r: number }[] = [];
    const count = 3 + Math.floor(rng() * 4);
    for (let i = 0; i < count; i++) {
      lakes.push({
        x: 34 + rng() * (MAP_W - 68),
        z: 34 + rng() * (MAP_H - 68),
        r: 14 + rng() * (i === 0 ? 26 : 16)   // one grand lake, the rest modest
      });
    }
    landness = (x, z) => {
      let f = 0;
      for (const b of lakes) {
        const d2 = (x - b.x) * (x - b.x) + (z - b.z) * (z - b.z);
        const k = 1 - d2 / (b.r * b.r);
        if (k > 0) f += k;
      }
      return clamp(0.8 - f * 1.7 + fbm(noise, x * 0.025, z * 0.025, 3) * 0.22, -1, 1);
    };
  } else {
    // a great river crossing the map, with fords and a lagoon
    const vertical = rng() < 0.5;
    const mid = MAP_W / 2 + (rng() - 0.5) * 60;
    const amp = 26 + rng() * 34;
    const k = 1.2 + rng() * 1.4;
    const phase = rng() * Math.PI * 2;
    const lagoonT = 0.15 + rng() * 0.7;
    const fords: number[] = [];
    const fordCount = 2 + Math.floor(rng() * 2);
    for (let i = 0; i < fordCount; i++) {
      const t = 0.12 + (i + 0.5 + rng() * 0.4) / (fordCount + 1) * 0.8;
      if (Math.abs(t - lagoonT) > 0.09) fords.push(t);
    }
    if (fords.length === 0) fords.push(lagoonT > 0.5 ? 0.2 : 0.8);
    // Remember where the crossings were carved: they get names, and a name on
    // the minimap is what turns a lucky crossing into a known road.
    for (const f of fords) {
      const along = f * MAP_H;
      const across = mid + Math.sin(f * Math.PI * k + phase) * amp;
      fordSpots.push(vertical ? { x: across, z: along } : { x: along, z: across });
    }
    landness = (x, z) => {
      const along = (vertical ? z : x) / MAP_H;
      const across = vertical ? x : z;
      const center = mid + Math.sin(along * Math.PI * k + phase) * amp;
      let width = 8 + noise(along * 8, 3.7) * 3;
      const lag = 1 - ((along - lagoonT) / 0.1) ** 2;
      if (lag > 0) width += lag * 15;
      let L = (Math.abs(across - center) - width) / 11;
      for (const f of fords) {
        const fk = 1 - ((along - f) / 0.028) ** 2;
        if (fk > 0) L = Math.max(L, 0.3 * fk);
      }
      return clamp(L + fbm(noise, x * 0.03, z * 0.03, 2) * 0.1, -1, 1);
    };
  }

  // ---------------------------------------------------------------- heights
  // (fordSpots is filled by the river branch above, snapped to land below)
  const rollingAt = (x: number, z: number) =>
    fbm(noise, x * 0.018, z * 0.018, 3) * 0.26 + fbm(noiseB, x * 0.06, z * 0.06, 2) * 0.06;

  for (let z = 0; z <= MAP_H; z++) {
    for (let x = 0; x <= MAP_W; x++) {
      const L = landness(x, z);
      const rolling = rollingAt(x, z);
      let h: number;
      if (L <= 0) {
        h = -0.27 + L * 1.05;
      } else {
        const t = Math.min(1, L / 0.42);
        const s = t * t * (3 - 2 * t);
        h = -0.26 + s * (0.3 + Math.max(0, rolling));
        if (t >= 1) h = Math.max(h, rolling);
      }
      world.height[z * W1 + x] = h;
    }
  }

  // ---------------------------------------------------------------- water flags + regions
  const flagWater = () => {
    for (let z = 0; z < MAP_H; z++) {
      for (let x = 0; x < MAP_W; x++) {
        const i = z * MAP_W + x;
        world.grid[i] &= ~F_WATER;
        if (heightAt(world, x + 0.5, z + 0.5) < WATER_Y + 0.02) world.grid[i] |= F_WATER;
      }
    }
  };

  /** Label connected water bodies; the largest becomes region 1 (dockable). */
  const labelWater = () => {
    world.waterRegion.fill(0);
    const seen = new Uint8Array(N);
    const queue = new Int32Array(N);
    const comps: number[][] = [];
    for (let start = 0; start < N; start++) {
      if (seen[start] || !(world.grid[start] & F_WATER)) continue;
      const cells: number[] = [];
      let head = 0, tail = 0;
      queue[tail++] = start; seen[start] = 1;
      while (head < tail) {
        const i = queue[head++];
        cells.push(i);
        const x = i % MAP_W, z = (i / MAP_W) | 0;
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, nz = z + dz;
          if (nx < 0 || nz < 0 || nx >= MAP_W || nz >= MAP_H) continue;
          const ni = nz * MAP_W + nx;
          if (!seen[ni] && (world.grid[ni] & F_WATER)) { seen[ni] = 1; queue[tail++] = ni; }
        }
      }
      comps.push(cells);
    }
    comps.sort((a, b) => b.length - a.length);
    comps.forEach((cells, ci) => {
      const label = ci === 0 ? 1 : 2;
      for (const i of cells) world.waterRegion[i] = label;
    });
  };

  flagWater();
  labelWater();

  // ---------------------------------------------------------------- bases
  /** How much open land surrounds a point (0..1). */
  const openness = (cx: number, cz: number, r: number): number => {
    let land = 0, total = 0;
    for (let dz = -r; dz <= r; dz += 2) {
      for (let dx = -r; dx <= r; dx += 2) {
        if (dx * dx + dz * dz > r * r) continue;
        total++;
        const x = cx + dx, z = cz + dz;
        if (x < 2 || z < 2 || x >= MAP_W - 2 || z >= MAP_H - 2) continue;
        if (!(world.grid[z * MAP_W + x] & F_WATER) && heightAt(world, x, z) < 0.85) land++;
      }
    }
    return total ? land / total : 0;
  };

  const candidates: { x: number; z: number }[] = [];
  for (let z = 24; z < MAP_H - 24; z += 5) {
    for (let x = 24; x < MAP_W - 24; x += 5) {
      if (world.grid[z * MAP_W + x] & F_WATER) continue;
      if (openness(x, z, 11) > 0.9) candidates.push({ x, z });
    }
  }

  let playerStart = { x: Math.round(MAP_W * 0.25), z: Math.round(MAP_H * 0.75) };
  let enemyStart = { x: Math.round(MAP_W * 0.75), z: Math.round(MAP_H * 0.25) };
  if (candidates.length >= 2) {
    // random home for the player, then a rival seat a good march away
    const a = candidates[Math.floor(rng() * candidates.length)];
    let best = candidates[0], bestScore = -Infinity;
    for (const c of candidates) {
      const d = dist(a.x, a.z, c.x, c.z);
      // sweet spot around 130 tiles apart; hard floor of 90
      const score = d < 90 ? -1e6 + d : -Math.abs(d - 130) + rng() * 8;
      if (score > bestScore) { bestScore = score; best = c; }
    }
    playerStart = { x: a.x, z: a.z };
    enemyStart = { x: best.x, z: best.z };
  } else {
    // degenerate roll (all sea): raise two home islands and a bridge
    for (const s of [playerStart, enemyStart]) {
      for (let dz = -14; dz <= 14; dz++) {
        for (let dx = -14; dx <= 14; dx++) {
          const d = Math.hypot(dx, dz);
          if (d > 14) continue;
          const i = (s.z + dz) * W1 + (s.x + dx);
          const t = (14 - d) / 14;
          world.height[i] = Math.max(world.height[i], -0.26 + t * 0.36);
        }
      }
    }
    flagWater();
    labelWater();
  }

  // ---------------------------------------------------------------- connectivity
  const landReachable = (ax: number, az: number, bx: number, bz: number): boolean => {
    const seen = new Uint8Array(N);
    const queue = new Int32Array(N);
    let head = 0, tail = 0;
    const start = az * MAP_W + ax;
    const goal = bz * MAP_W + bx;
    if (world.grid[start] & (F_WATER | F_BLOCK)) return false;
    queue[tail++] = start; seen[start] = 1;
    while (head < tail) {
      const i = queue[head++];
      if (i === goal) return true;
      const x = i % MAP_W, z = (i / MAP_W) | 0;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, nz = z + dz;
        if (nx < 0 || nz < 0 || nx >= MAP_W || nz >= MAP_H) continue;
        const ni = nz * MAP_W + nx;
        if (seen[ni] || (world.grid[ni] & (F_WATER | F_BLOCK))) continue;
        seen[ni] = 1; queue[tail++] = ni;
      }
    }
    return false;
  };

  /** Raise a gently winding causeway so both towns share one landmass. */
  const carveCorridor = () => {
    const ax = playerStart.x, az = playerStart.z;
    const bx = enemyStart.x, bz = enemyStart.z;
    const steps = Math.ceil(dist(ax, az, bx, bz) * 1.5);
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const wob = Math.sin(t * Math.PI * 3 + seed) * 4;
      const px = ax + (bx - ax) * t - (bz - az) / steps * wob * 0.2;
      const pz = az + (bz - az) * t + (bx - ax) / steps * wob * 0.2;
      for (let dz = -3; dz <= 3; dz++) {
        for (let dx = -3; dx <= 3; dx++) {
          if (dx * dx + dz * dz > 10) continue;
          const vx = Math.round(px + dx), vz = Math.round(pz + dz);
          if (vx < 1 || vz < 1 || vx > MAP_W - 1 || vz > MAP_H - 1) continue;
          const vi = vz * W1 + vx;
          const lift = -0.24 + 0.28 * clamp(1.4 - Math.hypot(dx, dz) / 2.4, 0.3, 1);
          world.height[vi] = Math.max(world.height[vi], lift);
        }
      }
    }
    flagWater();
    labelWater();
  };

  for (let tries = 0; tries < 3; tries++) {
    if (landReachable(playerStart.x, playerStart.z, enemyStart.x, enemyStart.z)) break;
    carveCorridor();
  }

  // ---------------------------------------------------------------- mesas
  // Blocked scenic rock, never allowed to sever the route between towns.
  const mesaCount = 4 + Math.floor(rng() * 4);
  for (let m = 0; m < mesaCount; m++) {
    const mx = 16 + rng() * (MAP_W - 32);
    const mz = 16 + rng() * (MAP_H - 32);
    const mr = 4 + rng() * 4.5;
    if (dist(mx, mz, playerStart.x, playerStart.z) < 26) continue;
    if (dist(mx, mz, enemyStart.x, enemyStart.z) < 26) continue;
    if (world.grid[Math.floor(mz) * MAP_W + Math.floor(mx)] & F_WATER) continue;
    const touched: number[] = [];
    const savedH: [number, number][] = [];
    for (let z = Math.floor(mz - mr - 3); z <= Math.ceil(mz + mr + 3); z++) {
      for (let x = Math.floor(mx - mr - 3); x <= Math.ceil(mx + mr + 3); x++) {
        if (x < 1 || z < 1 || x > MAP_W - 1 || z > MAP_H - 1) continue;
        const d = dist(x, z, mx, mz);
        if (d < mr + 3) {
          const vi = z * W1 + x;
          savedH.push([vi, world.height[vi]]);
          const t = clamp((mr + 3 - d) / 3.4, 0, 1);
          const s = t * t * (3 - 2 * t);
          world.height[vi] += s * (1.6 + noise(x * 0.3, z * 0.3) * 0.5);
        }
        if (d < mr) {
          const ci = z * MAP_W + x;
          if (!(world.grid[ci] & F_BLOCK)) { world.grid[ci] |= F_BLOCK; touched.push(ci); }
        }
      }
    }
    if (!landReachable(playerStart.x, playerStart.z, enemyStart.x, enemyStart.z)) {
      // this mesa walled the road — take it back
      for (const ci of touched) world.grid[ci] &= ~F_BLOCK;
      for (const [vi, h] of savedH) world.height[vi] = h;
    }
  }

  // ---------------------------------------------------------------- biomes
  // near-water mask (two dilations of the water mask)
  const nearWater = new Uint8Array(N);
  for (let z = 0; z < MAP_H; z++) {
    for (let x = 0; x < MAP_W; x++) {
      if (world.grid[z * MAP_W + x] & F_WATER) nearWater[z * MAP_W + x] = 3;
    }
  }
  for (let pass = 0; pass < 3; pass++) {
    for (let z = 1; z < MAP_H - 1; z++) {
      for (let x = 1; x < MAP_W - 1; x++) {
        const i = z * MAP_W + x;
        if (nearWater[i]) continue;
        const m = Math.max(nearWater[i - 1], nearWater[i + 1], nearWater[i - MAP_W], nearWater[i + MAP_W]);
        if (m > 1) nearWater[i] = m - 1;
      }
    }
  }

  // climate decides how the biome sites are dealt
  const climate = rng();
  const biomeWeights: [number, number][] =
    climate < 0.35 ? [[BIOME_DESERT, 0.45], [BIOME_GRASS, 0.2], [BIOME_HIGHLAND, 0.25], [BIOME_LUSH, 0.1]] :
    climate < 0.7 ? [[BIOME_GRASS, 0.45], [BIOME_LUSH, 0.2], [BIOME_HIGHLAND, 0.15], [BIOME_DESERT, 0.2]] :
                    [[BIOME_DESERT, 0.25], [BIOME_GRASS, 0.25], [BIOME_LUSH, 0.25], [BIOME_HIGHLAND, 0.25]];
  const pickBiome = (): number => {
    let r = rng(), acc = 0;
    for (const [b, w] of biomeWeights) { acc += w; if (r < acc) return b; }
    return BIOME_GRASS;
  };
  const sites: { x: number; z: number; b: number }[] = [];
  const siteCount = 6 + Math.floor(rng() * 4);
  for (let i = 0; i < siteCount; i++) {
    sites.push({ x: rng() * MAP_W, z: rng() * MAP_H, b: pickBiome() });
  }
  // make sure the map isn't monotone
  if (new Set(sites.map(s => s.b)).size < 2) sites[0].b = (sites[0].b + 1) % 4;

  for (let z = 0; z < MAP_H; z++) {
    for (let x = 0; x < MAP_W; x++) {
      const i = z * MAP_W + x;
      const jx = x + noise(x * 0.045, z * 0.045) * 22;
      const jz = z + noiseB(x * 0.045, z * 0.045) * 22;
      let bestD = Infinity, b = BIOME_GRASS;
      for (const s of sites) {
        const d = (jx - s.x) * (jx - s.x) + (jz - s.z) * (jz - s.z);
        if (d < bestD) { bestD = d; b = s.b; }
      }
      const h = heightAt(world, x + 0.5, z + 0.5);
      if (h > 0.8) b = BIOME_HIGHLAND;
      else if (nearWater[i] && h < 0.4 && b !== BIOME_HIGHLAND) b = BIOME_LUSH;
      world.biome[i] = b;
    }
  }

  const biomeAt = (x: number, z: number): number => {
    const cx = clamp(Math.floor(x), 0, MAP_W - 1), cz = clamp(Math.floor(z), 0, MAP_H - 1);
    return world.biome[cz * MAP_W + cx];
  };

  // ---------------------------------------------------------------- nodes & bases
  const freeLand = (cx: number, cz: number) => landPassable(world.grid, cx, cz);

  const tryNode = (kind: 'tree' | 'berries' | 'stone' | 'gold', cx: number, cz: number, variant = 0, mul = 1) => {
    cx = Math.round(cx); cz = Math.round(cz);
    if (cx < 2 || cz < 2 || cx >= MAP_W - 2 || cz >= MAP_H - 2) return false;
    if (!freeLand(cx, cz)) return false;
    const h = heightAt(world, cx + 0.5, cz + 0.5);
    if (h < -0.15) return false;
    world.addNode(kind, cx, cz, variant, mul);
    return true;
  };

  const cluster = (kind: 'berries' | 'stone' | 'gold', cx: number, cz: number, count: number) => {
    let placed = 0, guard = 0;
    while (placed < count && guard++ < 60) {
      const a = rng() * Math.PI * 2, r = rng() * 2.2;
      if (tryNode(kind, cx + Math.cos(a) * r, cz + Math.sin(a) * r, Math.floor(rng() * 3))) placed++;
    }
  };

  // tree species by biome (variants: 0/1 palm, 2/3 olive, 4 cypress, 5 umbrella pine)
  const speciesFor = (b: number): number => {
    if (b === BIOME_DESERT) return rng() < 0.85 ? Math.floor(rng() * 2) : 2;
    if (b === BIOME_LUSH) return rng() < 0.5 ? Math.floor(rng() * 2) : 2 + Math.floor(rng() * 2);
    if (b === BIOME_HIGHLAND) return rng() < 0.6 ? 4 : 5;
    return rng() < 0.25 ? 4 : 2 + Math.floor(rng() * 2);
  };

  const FACTION_TREES: Record<Faction, number[]> = {
    egypt: [0, 1, 0, 1, 2],
    greece: [4, 2, 3, 4, 2],
    rome: [4, 5, 2, 5, 3]
  };

  const grove = (cx: number, cz: number, count: number, spread = 4.5, faction?: Faction) => {
    let placed = 0, guard = 0;
    while (placed < count && guard++ < count * 8) {
      const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * spread;
      const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      const variant = faction
        ? FACTION_TREES[faction][Math.floor(rng() * FACTION_TREES[faction].length)]
        : speciesFor(biomeAt(x, z));
      if (tryNode('tree', x, z, variant)) placed++;
    }
  };

  const center = { x: MAP_W / 2, z: MAP_H / 2 };
  const setupBase = (owner: number, bx: number, bz: number, faction: Faction) => {
    const tc = world.placeBuilding(owner, 'towncenter', bx - 2, bz - 2, true);
    tc.rally = { x: bx, z: bz + 4 };
    const angles = [0.6, 1.2, 1.8];
    for (let i = 0; i < 3; i++) {
      const a = angles[i] + owner * 2.5;
      world.spawnUnit(owner, 'villager', bx + Math.cos(a) * 3.4, bz + Math.sin(a) * 3.4);
    }
    const toC = Math.atan2(center.z - bz, center.x - bx);
    cluster('berries', bx + Math.cos(toC + 0.9) * 8, bz + Math.sin(toC + 0.9) * 8, 6);
    cluster('gold', bx + Math.cos(toC - 1.1) * 11, bz + Math.sin(toC - 1.1) * 11, 5);
    cluster('stone', bx + Math.cos(toC + 2.5) * 11, bz + Math.sin(toC + 2.5) * 11, 4);
    grove(bx + Math.cos(toC + 1.9) * 11, bz + Math.sin(toC + 1.9) * 11, 11, 5, faction);
    grove(bx + Math.cos(toC - 0.4) * 13, bz + Math.sin(toC - 0.4) * 13, 8, 4, faction);
    grove(bx - Math.cos(toC) * 9, bz - Math.sin(toC) * 9, 6, 4.5, faction);
  };

  setupBase(0, playerStart.x, playerStart.z, playerFaction);
  setupBase(1, enemyStart.x, enemyStart.z, aiFaction);
  world.homeland = [
    { x: playerStart.x, z: playerStart.z, faction: playerFaction },
    { x: enemyStart.x, z: enemyStart.z, faction: aiFaction }
  ];

  // ---------------------------------------------------------------- neutral resources
  const farFromBases = (x: number, z: number, d: number) =>
    dist(x, z, playerStart.x, playerStart.z) > d && dist(x, z, enemyStart.x, enemyStart.z) > d;

  const scatterClusters = (kind: 'berries' | 'stone' | 'gold', count: number, prefBiomes: number[]) => {
    const placedAt: { x: number; z: number }[] = [];
    let placed = 0, guard = 0;
    while (placed < count && guard++ < count * 40) {
      const x = 10 + rng() * (MAP_W - 20), z = 10 + rng() * (MAP_H - 20);
      if (world.grid[Math.floor(z) * MAP_W + Math.floor(x)] & (F_WATER | F_BLOCK)) continue;
      if (!farFromBases(x, z, 26)) continue;
      if (placedAt.some(p => dist(p.x, p.z, x, z) < 22)) continue;
      if (!prefBiomes.includes(biomeAt(x, z)) && rng() > 0.3) continue;
      cluster(kind, x, z, kind === 'berries' ? 4 + Math.floor(rng() * 3) : 3 + Math.floor(rng() * 3));
      placedAt.push({ x, z });
      placed++;
    }
  };
  scatterClusters('gold', 11, [BIOME_HIGHLAND, BIOME_DESERT, BIOME_GRASS]);
  scatterClusters('stone', 10, [BIOME_HIGHLAND, BIOME_DESERT]);
  scatterClusters('berries', 11, [BIOME_GRASS, BIOME_LUSH]);

  // forests: denser in lush and grassland, sparse stands elsewhere
  let grovesPlaced = 0, groveGuard = 0;
  while (grovesPlaced < 48 && groveGuard++ < 500) {
    const x = 8 + rng() * (MAP_W - 16), z = 8 + rng() * (MAP_H - 16);
    if (world.grid[Math.floor(z) * MAP_W + Math.floor(x)] & (F_WATER | F_BLOCK)) continue;
    if (!farFromBases(x, z, 18)) continue;
    const b = biomeAt(x, z);
    const size = b === BIOME_LUSH ? 10 + Math.floor(rng() * 6)
      : b === BIOME_GRASS ? 8 + Math.floor(rng() * 5)
      : 5 + Math.floor(rng() * 4);
    grove(x, z, size, 4.5 + rng() * 2);
    grovesPlaced++;
  }

  // shore fringe along the main water body
  for (let z = 4; z < MAP_H - 4; z += 3) {
    for (let x = 4; x < MAP_W - 4; x += 3) {
      const i = z * MAP_W + x;
      if (world.grid[i] & F_WATER) continue;
      if (!nearWater[i] || rng() > 0.28) continue;
      const b = world.biome[i];
      if (b === BIOME_DESERT || b === BIOME_LUSH) {
        grove(x + rng() * 2, z + rng() * 2, 1 + Math.floor(rng() * 2), 1.5);
      }
    }
  }

  // ---------------------------------------------------------------- fish
  let fishPlaced = 0, fishGuard = 0;
  while (fishPlaced < 14 && fishGuard++ < 900) {
    const x = 4 + Math.floor(rng() * (MAP_W - 8));
    const z = 4 + Math.floor(rng() * (MAP_H - 8));
    const i = z * MAP_W + x;
    if (!(world.grid[i] & F_WATER) || world.waterRegion[i] !== 1) continue;
    // near a coastline so boats from a dock can reach them quickly
    let coastal = false;
    for (let d = -4; d <= 4 && !coastal; d++) {
      if (!(world.grid[clamp(z + d, 0, MAP_H - 1) * MAP_W + x] & F_WATER)) coastal = true;
      if (!(world.grid[z * MAP_W + clamp(x + d, 0, MAP_W - 1)] & F_WATER)) coastal = true;
    }
    if (!coastal) continue;
    let ok = true;
    for (const n of world.nodes.values()) {
      if (n.kind === 'fish' && dist(n.x, n.z, x, z) < 12) { ok = false; break; }
    }
    if (ok) { world.addNode('fish', x, z, Math.floor(rng() * 2)); fishPlaced++; }
  }

  // ---------------------------------------------------------------- decoration
  const deco = world.deco;
  const decoFree = (x: number, z: number) => {
    const cx = Math.floor(x), cz = Math.floor(z);
    if (cx < 1 || cz < 1 || cx >= MAP_W - 1 || cz >= MAP_H - 1) return false;
    if (!freeLand(cx, cz)) return false;
    for (const n of world.nodes.values()) {
      if (dist(n.x, n.z, x, z) < 1.4) return false;
    }
    return heightAt(world, x, z) > -0.14;
  };

  const scatterB = (kind: string, count: number, biomes: number[] | null, waterside = false) => {
    let placed = 0, g = 0;
    while (placed < count && g++ < count * 8) {
      const x = 2 + rng() * (MAP_W - 4), z = 2 + rng() * (MAP_H - 4);
      const i = Math.floor(z) * MAP_W + Math.floor(x);
      if (biomes && !biomes.includes(world.biome[i])) continue;
      if (waterside && !nearWater[i]) continue;
      if (!decoFree(x, z)) continue;
      deco.push({ kind, x, z, rot: rng() * Math.PI * 2, scale: 0.75 + rng() * 0.55 });
      placed++;
    }
  };
  scatterB('grass', 1500, [BIOME_GRASS, BIOME_LUSH, BIOME_HIGHLAND]);
  scatterB('flower', 340, [BIOME_GRASS, BIOME_LUSH]);
  scatterB('bush', 300, [BIOME_GRASS, BIOME_LUSH]);
  scatterB('shrub', 300, [BIOME_DESERT, BIOME_GRASS]);
  scatterB('rock', 260, null);
  scatterB('rock_sand', 220, [BIOME_DESERT]);
  scatterB('rock_pale', 220, [BIOME_HIGHLAND]);
  scatterB('reed', 260, [BIOME_LUSH, BIOME_DESERT], true);

  const blockDeco = (x: number, z: number) => {
    world.grid[Math.floor(z) * MAP_W + Math.floor(x)] |= F_BLOCK;
  };

  // Paved plaza / roads radiating from a town center, in the faction's style
  const plaza = (bx: number, bz: number, faction: Faction) => {
    const put = (x: number, z: number) => {
      const cx = Math.floor(x), cz = Math.floor(z);
      if (cx < 1 || cz < 1 || cx >= MAP_W - 1 || cz >= MAP_H - 1) return;
      if (!landPassable(world.grid, cx, cz)) return;
      if (heightAt(world, cx + 0.5, cz + 0.5) < -0.1) return;
      for (const d of deco) {
        if (d.kind.startsWith('paving') &&
            Math.abs(d.x - (cx + 0.5)) < 0.6 && Math.abs(d.z - (cz + 0.5)) < 0.6) return;
      }
      const kind = ((cx * 7 + cz * 13) % 3 === 0) ? 'paving2' : 'paving';
      deco.push({ kind, x: cx + 0.5, z: cz + 0.5, rot: 0, scale: 1, faction });
    };
    for (let z = bz - 4; z <= bz + 4; z++) {
      for (let x = bx - 4; x <= bx + 4; x++) {
        const d = Math.max(Math.abs(x - bx), Math.abs(z - bz));
        if (d < 2) continue;
        if (d === 2 || (d === 3 && rng() < 0.45) || (d === 4 && rng() < 0.1)) put(x, z);
      }
    }
    const spokes = faction === 'rome' ? 4 : 2;
    for (let s = 0; s < spokes; s++) {
      const a = (s / spokes) * Math.PI * 2 + (faction === 'rome' ? 0.4 : 1.1);
      const len = faction === 'rome' ? 12 : 6;
      for (let r = 3; r < len; r++) {
        const x = bx + Math.cos(a) * r, z = bz + Math.sin(a) * r;
        put(x, z);
        if (faction === 'rome' && r < 10) {
          put(x + Math.cos(a + Math.PI / 2), z + Math.sin(a + Math.PI / 2));
        }
      }
    }
  };
  plaza(playerStart.x, playerStart.z, playerFaction);
  plaza(enemyStart.x, enemyStart.z, aiFaction);

  const baseScatter = (bx: number, bz: number, faction: Faction) => {
    const kinds: [string, number][] =
      faction === 'egypt' ? [['rock_sand', 14], ['shrub', 10], ['grass', 16], ['reed', 6]] :
      faction === 'greece' ? [['rock_pale', 14], ['bush', 12], ['grass', 26], ['flower', 12]] :
                             [['rock_pale', 10], ['bush', 14], ['grass', 24], ['shrub', 10]];
    for (const [kind, count] of kinds) {
      let placed = 0, guard = 0;
      while (placed < count && guard++ < count * 12) {
        const a = rng() * Math.PI * 2, r = 4 + Math.sqrt(rng()) * 13;
        const x = bx + Math.cos(a) * r, z = bz + Math.sin(a) * r;
        if (!decoFree(x, z)) continue;
        deco.push({ kind, x, z, rot: rng() * Math.PI * 2, scale: 0.75 + rng() * 0.5 });
        placed++;
      }
    }
  };
  baseScatter(playerStart.x, playerStart.z, playerFaction);
  baseScatter(enemyStart.x, enemyStart.z, aiFaction);

  const baseProps = (owner: number, bx: number, bz: number, faction: Faction) => {
    const put = (kind: string, dx: number, dz: number, rot = 0, scale = 1) => {
      const x = bx + dx, z = bz + dz;
      if (decoFree(x, z)) {
        deco.push({ kind, x, z, rot, scale, faction });
        blockDeco(x, z);
      }
    };
    put('tent', -6.5, 2.5, 0.4, 1);
    put('crates', 5.5, -3.5, 0.9, 1);
    put('well', 3.5, 5.5, 0, 1);
    if (faction === 'egypt') {
      put('sphinx', -4.5, -5.5, 2.6, 1);
      put('obelisk_s', 5.5, 3.2, 0, 0.9);
    } else if (faction === 'greece') {
      put('column_st', -4.5, -5.5, 0.4, 1);
      put('urn', 5.2, 3.5, 0, 1);
    } else {
      put('standard', -4.5, -5.5, 0.2, 1);
      put('milestone', 5.2, 3.5, 0, 1);
    }
  };
  baseProps(0, playerStart.x, playerStart.z, playerFaction);
  baseProps(1, enemyStart.x, enemyStart.z, aiFaction);

  // scattered ruins of an older age
  let ruinsPlaced = 0, ruinsGuard = 0;
  while (ruinsPlaced < 3 && ruinsGuard++ < 120) {
    const x = 20 + rng() * (MAP_W - 40), z = 20 + rng() * (MAP_H - 40);
    if (!decoFree(x, z) || !farFromBases(x, z, 32)) continue;
    deco.push({ kind: 'ruins', x, z, rot: rng() * Math.PI, scale: 1 + rng() * 0.25 });
    blockDeco(x, z);
    if (decoFree(x + 3, z + 2)) deco.push({ kind: 'column_fallen', x: x + 3, z: z + 2, rot: rng() * 3, scale: 1 });
    if (decoFree(x - 2.5, z + 2.5)) {
      deco.push({ kind: 'column_st', x: x - 2.5, z: z + 2.5, rot: rng(), scale: 0.85 });
      blockDeco(x - 2.5, z + 2.5);
    }
    ruinsPlaced++;
  }

  // ambient sail boats on the main water
  let boatsPlaced = 0, boatsGuard = 0;
  while (boatsPlaced < 3 && boatsGuard++ < 300) {
    const x = 8 + rng() * (MAP_W - 16), z = 8 + rng() * (MAP_H - 16);
    const i = Math.floor(z) * MAP_W + Math.floor(x);
    if (world.waterRegion[i] !== 1) continue;
    if (heightAt(world, x, z) > -0.55) continue;
    deco.push({ kind: 'decoboat', x, z, rot: rng() * Math.PI * 2, scale: 0.9 + rng() * 0.2 });
    boatsPlaced++;
  }

  // ---------------------------------------------------------------- trading post
  // Neutral ground midway between the two towns.
  {
    const mx = Math.round((playerStart.x + enemyStart.x) / 2);
    const mz = Math.round((playerStart.z + enemyStart.z) / 2);
    let px = mx, pz = mz;
    outer:
    for (let r = 0; r < 40; r++) {
      for (let a = 0; a < Math.max(1, r * 6); a++) {
        const ang = (a / Math.max(1, r * 6)) * Math.PI * 2;
        const cx = Math.round(mx + Math.cos(ang) * r);
        const cz = Math.round(mz + Math.sin(ang) * r);
        let ok = true;
        for (let dz = -1; dz <= 2 && ok; dz++) {
          for (let dx = -1; dx <= 2 && ok; dx++) {
            if (!landPassable(world.grid, cx + dx, cz + dz)) ok = false;
          }
        }
        if (ok) { px = cx; pz = cz; break outer; }
      }
    }
    world.tradePost = { x: px + 0.5, z: pz + 0.5 };
    deco.push({ kind: 'tradepost', x: px + 0.5, z: pz + 0.5, rot: 0.35, scale: 1 });
    world.grid[pz * MAP_W + px] |= F_BLOCK;
    world.grid[pz * MAP_W + px + 1] |= F_BLOCK;
  }

  // ---------------------------------------------------------------- encounters
  // Seed the wilds: herds, wolf dens, deserters, cairns, refugees, the idol.
  {
    // one flood fill from home marks everything a marching column can reach
    const reach = new Uint8Array(N);
    {
      const queue = new Int32Array(N);
      let head = 0, tail = 0;
      // the town center sits on the start cell itself — flood from beside it
      const free = nearestFree(world.grid, playerStart.x, playerStart.z, false, 10);
      if (free) {
        const start = free.z * MAP_W + free.x;
        queue[tail++] = start; reach[start] = 1;
      }
      while (head < tail) {
        const i = queue[head++];
        const x = i % MAP_W, z = (i / MAP_W) | 0;
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, nz = z + dz;
          if (nx < 1 || nz < 1 || nx >= MAP_W - 1 || nz >= MAP_H - 1) continue;
          const ni = nz * MAP_W + nx;
          if (reach[ni] || (world.grid[ni] & (F_WATER | F_BLOCK | F_BUILDING))) continue;
          reach[ni] = 1; queue[tail++] = ni;
        }
      }
    }

    const placedSites: { x: number; z: number }[] = [];
    const openFor = (cx: number, cz: number, size: number): boolean => {
      for (let z = cz - 1; z < cz + size + 1; z++) {
        for (let x = cx - 1; x < cx + size + 1; x++) {
          if (x < 2 || z < 2 || x >= MAP_W - 2 || z >= MAP_H - 2) return false;
          if (!landPassable(world.grid, x, z)) return false;
        }
      }
      return reach[cz * MAP_W + cx] === 1;
    };
    const pickSpot = (size: number, minBase: number): { cx: number; cz: number } | null => {
      for (let tries = 0; tries < 260; tries++) {
        const cx = 6 + Math.floor(rng() * (MAP_W - 12));
        const cz = 6 + Math.floor(rng() * (MAP_H - 12));
        if (!openFor(cx, cz, size)) continue;
        if (!farFromBases(cx, cz, minBase)) continue;
        if (dist(cx, cz, world.tradePost!.x, world.tradePost!.z) < 10) continue;
        if (placedSites.some(s => dist(s.x, s.z, cx, cz) < 15)) continue;
        return { cx, cz };
      }
      return null;
    };

    const addSite = (kind: EncounterKind, x: number, z: number, variant = 0): EncounterSite => {
      const site: EncounterSite = {
        id: world.nextId++, kind, x, z,
        state: 'dormant', discovered: false, offered: false,
        unitIds: [], buildingId: 0, carrierId: 0, provokedBy: -1,
        timer: kind === 'den' ? 25 : 0, variant,
        holder: -1, capture: 0, claimant: -1
      };
      world.sites.push(site);
      placedSites.push({ x, z });
      return site;
    };

    const wildBuilding = (type: BuildingTypeId, cx: number, cz: number): number => {
      const b = world.placeBuilding(WILDS, type, cx, cz, true, Math.floor(rng() * 4));
      // a prop must never wall off the one road between the towns
      if (!landReachable(playerStart.x, playerStart.z, enemyStart.x, enemyStart.z)) {
        world.removeBuilding(b);
        return 0;
      }
      return b.id;
    };

    const spawnPack = (site: EncounterSite, type: UnitTypeId, count: number, spread: number) => {
      for (let i = 0; i < count; i++) {
        const a = rng() * Math.PI * 2, r = 0.8 + Math.sqrt(rng()) * spread;
        let x = site.x + Math.cos(a) * r, z = site.z + Math.sin(a) * r;
        if (!landPassable(world.grid, Math.floor(x), Math.floor(z))) { x = site.x; z = site.z; }
        const u = world.spawnUnit(WILDS, type, x, z);
        u.post = { x: site.x, z: site.z };
        u.dir = rng() * Math.PI * 2;
        site.unitIds.push(u.id);
      }
    };

    // herds graze the middle distance — early meat for whoever hunts them
    for (let i = 0; i < ENC.herdSites; i++) {
      const s = pickSpot(1, 20);
      if (!s) continue;
      const boars = rng() < 0.3;
      const site = addSite('herd', s.cx + 0.5, s.cz + 0.5, boars ? 1 : 0);
      spawnPack(site, boars ? 'boar' : 'gazelle', boars ? 2 : 4 + Math.floor(rng() * 2), 2.5);
      site.state = 'active';
    }
    // wolf dens deep in the wilds
    for (let i = 0; i < ENC.denSites; i++) {
      const s = pickSpot(2, 42);
      if (!s) continue;
      const site = addSite('den', s.cx + 1, s.cz + 1);
      site.buildingId = wildBuilding('den', s.cx, s.cz);
      if (!site.buildingId) { world.sites.pop(); continue; }
      spawnPack(site, 'wolf', 2, 2);
      site.state = 'active';
    }
    // deserters' camps guard the deep field
    for (let i = 0; i < ENC.campSites; i++) {
      const s = pickSpot(3, 48);
      if (!s) continue;
      const site = addSite('camp', s.cx + 1.5, s.cz + 1.5);
      site.buildingId = wildBuilding('camp', s.cx, s.cz);
      if (!site.buildingId) { world.sites.pop(); continue; }
      spawnPack(site, 'mercenary', ENC.mercCount, 2.2);
      site.state = 'active';
    }
    // buried cairns reward every scouting trip
    for (let i = 0; i < ENC.cacheSites; i++) {
      const s = pickSpot(1, 16);
      if (!s) continue;
      const site = addSite('cache', s.cx + 0.5, s.cz + 0.5, Math.floor(rng() * 3));
      site.buildingId = wildBuilding('cairn', s.cx, s.cz);
      if (!site.buildingId) { world.sites.pop(); continue; }
      site.state = 'active';
    }
    // refugees hiding out past the midfield
    for (let i = 0; i < ENC.refugeeSites; i++) {
      const s = pickSpot(1, 38);
      if (!s) continue;
      const site = addSite('refugees', s.cx + 0.5, s.cz + 0.5);
      spawnPack(site, 'refugee', ENC.refugeeCount, 1.4);
    }
    // Ruined forts stand between the towns: never spent, always contested.
    // They sit nearer the middle than the deep-field sites, so holding one is
    // a forward commitment rather than a scouting reward.
    for (let i = 0; i < ENC.outpostSites; i++) {
      const s = pickSpot(3, 34);
      if (!s) continue;
      const site = addSite('outpost', s.cx + 1.5, s.cz + 1.5);
      site.buildingId = wildBuilding('outpost', s.cx, s.cz);
      if (!site.buildingId) { world.sites.pop(); continue; }
      site.state = 'active';
    }
    // Free villages: a people of their own, out where both sides can reach them.
    const VILLAGE_NAMES = [
      'Thornfold', 'Ashmere', 'Deepwell', 'Stonyford', 'Harrowmoor',
      'Elderbrook', 'Callowdene', 'Marrowhill'
    ];
    for (let i = 0; i < ENC.villageSites; i++) {
      const s = pickSpot(2, 40);
      if (!s) continue;
      const site = addSite('village', s.cx + 1, s.cz + 1);
      site.name = VILLAGE_NAMES[Math.floor(rng() * VILLAGE_NAMES.length)];
      site.taxedBy = -1;
      site.hutIds = [];
      // huts around a common green, dropped wherever the ground takes them
      for (let h = 0; h < ENC.villageHuts; h++) {
        const a = (h / ENC.villageHuts) * Math.PI * 2 + rng() * 0.4;
        const r = 3 + rng() * 1.6;
        const hx = Math.round(site.x + Math.cos(a) * r) - 1;
        const hz = Math.round(site.z + Math.sin(a) * r) - 1;
        if (!openFor(hx, hz, 2)) continue;
        const id = wildBuilding('hut', hx, hz);
        if (id) site.hutIds.push(id);
      }
      if (site.hutIds.length < 2) { world.sites.pop(); continue; }
      spawnPack(site, 'refugee', ENC.villageFolk, 2.2);
      site.state = 'active';
    }

    // one Golden Idol, as far from both thrones as the land allows
    {
      let best: { cx: number; cz: number } | null = null, bestScore = -1;
      for (let tries = 0; tries < 300; tries++) {
        const cx = 6 + Math.floor(rng() * (MAP_W - 12));
        const cz = 6 + Math.floor(rng() * (MAP_H - 12));
        if (!openFor(cx, cz, 1)) continue;
        if (placedSites.some(s => dist(s.x, s.z, cx, cz) < 12)) continue;
        const score = Math.min(
          dist(cx, cz, playerStart.x, playerStart.z),
          dist(cx, cz, enemyStart.x, enemyStart.z)
        );
        if (score > bestScore) { bestScore = score; best = { cx, cz }; }
      }
      if (best && bestScore > 40) {
        const site = addSite('relic', best.cx + 0.5, best.cz + 0.5);
        site.buildingId = wildBuilding('pedestal', best.cx, best.cz);
        if (!site.buildingId) world.sites.pop();
        else site.state = 'active';
      }
    }

    // One landmark per map, and it is never the same one twice running. It
    // sits further out than anything else, which is the whole argument for
    // owning a scout.
    {
      const which = Math.floor(rng() * LANDMARK_KINDS.length);
      const kind = LANDMARK_KINDS[which];
      const size = kind === 'obelisk' ? 1 : 2;
      const s = pickSpot(size, ENC.landmarkMinBase) ?? pickSpot(size, 40);
      if (s) {
        const site = addSite('landmark', s.cx + size / 2, s.cz + size / 2, which);
        site.landmark = kind;
        if (kind === 'grove') {
          // ancient trees, four times the timber, and they never come back.
          // Set in a loose ring with gaps so a stand can never wall off a pass.
          site.nodeIds = [];
          for (let i = 0; i < ENC.groveTrees; i++) {
            const a = (i / ENC.groveTrees) * Math.PI * 2;
            const r = 1.6 + (i % 3) * 1.3;
            const cx = Math.round(site.x + Math.cos(a) * r);
            const cz = Math.round(site.z + Math.sin(a) * r);
            if (!landPassable(world.grid, cx, cz)) continue;
            site.nodeIds.push(world.addNode('tree', cx, cz, Math.floor(rng() * 3), ENC.groveMul).id);
          }
          if (!landReachable(playerStart.x, playerStart.z, enemyStart.x, enemyStart.z)) {
            for (const id of site.nodeIds) {
              const n = world.nodes.get(id);
              if (n) world.removeNode(n);
            }
            world.sites.pop();
          } else if (site.nodeIds.length < 4) {
            world.sites.pop();
          } else {
            site.state = 'active';
          }
        } else {
          const prop = LANDMARK_BUILDING[kind];
          site.buildingId = prop ? wildBuilding(prop, s.cx, s.cz) : 0;
          if (!site.buildingId) world.sites.pop();
          else site.state = 'active';
        }
      }
    }
  }

  // ---------------------------------------------------------------- fords
  // Snap each carved crossing to the walkable ground it actually made. A ford
  // the noise swallowed (no passable cell nearby) is quietly dropped.
  for (const s of fordSpots) {
    if (world.fords.length >= FORD_NAMES.length) break;
    const cx = clamp(Math.round(s.x), 2, MAP_W - 3);
    const cz = clamp(Math.round(s.z), 2, MAP_H - 3);
    const cell = landPassable(world.grid, cx, cz) ? { x: cx, z: cz } : nearestFree(world.grid, cx, cz, false, 4);
    if (!cell) continue;
    world.fords.push({
      x: cell.x + 0.5, z: cell.z + 0.5,
      name: FORD_NAMES[world.fords.length], discovered: false
    });
  }

  // ---------------------------------------------------------------- fog
  world.markExplored(playerStart.x, playerStart.z, 15);

  return { playerStart, enemyStart, archetype };
}

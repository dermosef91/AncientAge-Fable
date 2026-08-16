// Grid A* pathfinding with a binary heap, 8-directional, no corner cutting.
import { MAP_W, MAP_H } from '../core/config';
import type { Vec2 } from '../core/types';

// Grid cell flags
export const F_BLOCK = 1;    // static blocker (tree, rock, node)
export const F_BUILDING = 2; // building footprint
export const F_WATER = 4;    // water cell
export const F_WALL0 = 8;    // player 0 wall (own units pass: auto gatehouse)
export const F_WALL1 = 16;   // player 1 wall

export function landPassable(grid: Uint8Array, cx: number, cz: number): boolean {
  if (cx < 0 || cz < 0 || cx >= MAP_W || cz >= MAP_H) return false;
  return (grid[cz * MAP_W + cx] & (F_BLOCK | F_BUILDING | F_WATER)) === 0;
}

/**
 * Land passability for a specific player: every wall segment doubles as a
 * gatehouse, so a player's own wall cells are walkable for them.
 */
export function landPassableFor(grid: Uint8Array, cx: number, cz: number, owner: number): boolean {
  if (cx < 0 || cz < 0 || cx >= MAP_W || cz >= MAP_H) return false;
  const v = grid[cz * MAP_W + cx];
  if (v & (F_BLOCK | F_WATER)) return false;
  if (v & F_BUILDING) {
    const gate = owner === 0 ? F_WALL0 : owner === 1 ? F_WALL1 : 0;
    return gate !== 0 && (v & gate) !== 0;
  }
  return true;
}

export function waterPassable(grid: Uint8Array, cx: number, cz: number): boolean {
  if (cx < 0 || cz < 0 || cx >= MAP_W || cz >= MAP_H) return false;
  const v = grid[cz * MAP_W + cx];
  return (v & F_WATER) !== 0 && (v & F_BUILDING) === 0;
}

class Heap {
  keys: Int32Array;
  costs: Float32Array;
  n = 0;
  constructor(cap: number) {
    this.keys = new Int32Array(cap);
    this.costs = new Float32Array(cap);
  }
  push(key: number, cost: number) {
    let i = this.n++;
    this.keys[i] = key; this.costs[i] = cost;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.costs[p] <= this.costs[i]) break;
      this.swap(i, p); i = p;
    }
  }
  pop(): number {
    const top = this.keys[0];
    this.n--;
    if (this.n > 0) {
      this.keys[0] = this.keys[this.n]; this.costs[0] = this.costs[this.n];
      let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1;
        let s = i;
        if (l < this.n && this.costs[l] < this.costs[s]) s = l;
        if (r < this.n && this.costs[r] < this.costs[s]) s = r;
        if (s === i) break;
        this.swap(i, s); i = s;
      }
    }
    return top;
  }
  private swap(a: number, b: number) {
    let t = this.keys[a]; this.keys[a] = this.keys[b]; this.keys[b] = t;
    let c = this.costs[a]; this.costs[a] = this.costs[b]; this.costs[b] = c;
  }
}

const N = MAP_W * MAP_H;
const gScore = new Float32Array(N);
const parent = new Int32Array(N);
const closed = new Uint8Array(N);
const stamp = new Int32Array(N);
let curStamp = 0;
const heap = new Heap(N * 2);

const DX = [1, -1, 0, 0, 1, 1, -1, -1];
const DZ = [0, 0, 1, -1, 1, -1, 1, -1];
const DCOST = [1, 1, 1, 1, 1.4142, 1.4142, 1.4142, 1.4142];

/**
 * Find a path between cells. Returns waypoints in world coords (cell centers),
 * or null. If the goal is blocked, routes to the nearest reachable cell nearby.
 * `owner` lets land units slip through their own walls (auto gatehouses).
 */
export function findPath(
  grid: Uint8Array,
  sx: number, sz: number, tx: number, tz: number,
  water = false, owner = -1
): Vec2[] | null {
  const pass = water
    ? waterPassable
    : (g: Uint8Array, cx: number, cz: number) => landPassableFor(g, cx, cz, owner);
  sx = Math.max(0, Math.min(MAP_W - 1, Math.floor(sx)));
  sz = Math.max(0, Math.min(MAP_H - 1, Math.floor(sz)));
  tx = Math.max(0, Math.min(MAP_W - 1, Math.floor(tx)));
  tz = Math.max(0, Math.min(MAP_H - 1, Math.floor(tz)));

  if (!pass(grid, sx, sz)) {
    const fixed = nearestFree(grid, sx, sz, water, 4);
    if (!fixed) return null;
    sx = fixed.x; sz = fixed.z;
  }
  if (!pass(grid, tx, tz)) {
    const fixed = nearestFree(grid, tx, tz, water, 10);
    if (!fixed) return null;
    tx = fixed.x; tz = fixed.z;
  }
  if (sx === tx && sz === tz) return [{ x: tx + 0.5, z: tz + 0.5 }];

  curStamp++;
  heap.n = 0;
  const startKey = sz * MAP_W + sx;
  const goalKey = tz * MAP_W + tx;
  stamp[startKey] = curStamp;
  gScore[startKey] = 0;
  parent[startKey] = -1;
  closed[startKey] = 0;
  heap.push(startKey, 0);

  let found = false;
  let best = startKey;
  let bestH = Infinity;
  let iter = 0;
  const maxIter = 36000; // enough for cross-map routes on the large battlefield

  while (heap.n > 0 && iter++ < maxIter) {
    const cur = heap.pop();
    if (closed[cur] === 1 && stamp[cur] === curStamp) continue;
    closed[cur] = 1;
    if (cur === goalKey) { found = true; best = cur; break; }
    const cx = cur % MAP_W, cz = (cur / MAP_W) | 0;
    const h0 = octile(cx, cz, tx, tz);
    if (h0 < bestH) { bestH = h0; best = cur; }

    for (let d = 0; d < 8; d++) {
      const nx = cx + DX[d], nz = cz + DZ[d];
      if (!pass(grid, nx, nz)) continue;
      // No corner cutting on diagonals
      if (d >= 4 && (!pass(grid, cx + DX[d], cz) || !pass(grid, cx, cz + DZ[d]))) continue;
      const nk = nz * MAP_W + nx;
      // Passing a gatehouse is slower than open ground, so units only take
      // the wall route when it genuinely helps.
      const gatePen = (grid[nk] & F_BUILDING) !== 0 ? 2.0 : 0;
      const ng = gScore[cur] + DCOST[d] + gatePen;
      if (stamp[nk] === curStamp && (closed[nk] === 1 || ng >= gScore[nk])) continue;
      stamp[nk] = curStamp;
      closed[nk] = 0;
      gScore[nk] = ng;
      parent[nk] = cur;
      heap.push(nk, ng + octile(nx, nz, tx, tz));
    }
  }

  // Reconstruct from goal (or nearest approach if unreachable)
  const endKey = found ? goalKey : best;
  if (!found && endKey === startKey) return null;
  const out: Vec2[] = [];
  let k = endKey;
  while (k !== -1 && stamp[k] === curStamp) {
    out.push({ x: (k % MAP_W) + 0.5, z: ((k / MAP_W) | 0) + 0.5 });
    k = parent[k];
  }
  out.reverse();
  if (out.length > 1) out.shift(); // drop the start cell
  return simplify(out, grid, water);
}

function octile(ax: number, az: number, bx: number, bz: number): number {
  const dx = Math.abs(ax - bx), dz = Math.abs(az - bz);
  return (dx + dz) + (1.4142 - 2) * Math.min(dx, dz);
}

/** String-pulling: drop waypoints when a straight line is clear. */
function simplify(path: Vec2[], grid: Uint8Array, water: boolean): Vec2[] {
  if (path.length <= 2) return path;
  const out: Vec2[] = [path[0]];
  let anchor = 0;
  for (let i = 2; i < path.length; i++) {
    if (!lineClear(grid, path[anchor].x, path[anchor].z, path[i].x, path[i].z, water)) {
      out.push(path[i - 1]);
      anchor = i - 1;
    }
  }
  out.push(path[path.length - 1]);
  return out;
}

export function lineClear(
  grid: Uint8Array, ax: number, az: number, bx: number, bz: number, water = false
): boolean {
  const pass = water ? waterPassable : landPassable;
  const d = Math.hypot(bx - ax, bz - az);
  const steps = Math.max(1, Math.ceil(d * 3));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = ax + (bx - ax) * t;
    const z = az + (bz - az) * t;
    // sample with a small radius so units don't clip corners
    for (const [ox, oz] of [[0, 0], [0.3, 0], [-0.3, 0], [0, 0.3], [0, -0.3]]) {
      if (!pass(grid, Math.floor(x + ox), Math.floor(z + oz))) return false;
    }
  }
  return true;
}

/** Spiral out from a cell to find the nearest passable cell. */
export function nearestFree(
  grid: Uint8Array, cx: number, cz: number, water = false, maxR = 8
): { x: number; z: number } | null {
  const pass = water ? waterPassable : landPassable;
  if (pass(grid, cx, cz)) return { x: cx, z: cz };
  for (let r = 1; r <= maxR; r++) {
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        if (pass(grid, cx + dx, cz + dz)) return { x: cx + dx, z: cz + dz };
      }
    }
  }
  return null;
}

/** Free cells ringing a building footprint (for spawn points / builder slots). */
export function ringCells(
  grid: Uint8Array, cx: number, cz: number, size: number, water = false
): { x: number; z: number }[] {
  const out: { x: number; z: number }[] = [];
  const pass = water ? waterPassable : landPassable;
  for (let r = 1; r <= 3; r++) {
    for (let z = cz - r; z < cz + size + r; z++) {
      for (let x = cx - r; x < cx + size + r; x++) {
        const onRing = x < cx - r + 1 || x >= cx + size + r - 1 || z < cz - r + 1 || z >= cz + size + r - 1;
        if (!onRing) continue;
        if (pass(grid, x, z)) out.push({ x, z });
      }
    }
    if (out.length > 0) return out;
  }
  return out;
}

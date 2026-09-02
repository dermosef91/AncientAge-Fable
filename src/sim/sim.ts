// Fixed-timestep simulation: unit task state machines, gathering, construction,
// combat, projectiles, fog. Deterministic given the same command stream.
import {
  BUILDINGS, ENC, FARM_FOOD, FARM_RESEED_COST, MAP_W, RES_ORDER, ROAD_TRADE_BONUS, SCOUT,
  SETTLEMENTS, SIEGE_UNITS, TECHS, TERRAIN, TRADE_BASE_GOLD, TRADE_GOLD_PER_TILE, UNITS,
  WILDS, WONDER_COUNTDOWN
} from '../core/config';
import type {
  ArmorClass, Building, DamageType, NodeKind, Projectile, ResType, Unit, UnitTypeId
} from '../core/types';
import { RES_OF_NODE } from '../core/types';
import { angleLerp, clamp, dist, dist2 } from '../core/utils';
import { civicLevelUp, planCivic } from './civic';
import { heightAt } from './map';
import { depotMulAt, recomputeAdjacency } from './districts';
import { onWildsBuildingHit, onWildsBuildingRazed, onWildsUnitKilled, wildsReact } from './encounters';
import { landPassableFor, waterPassable } from './pathfinding';
import type { World } from './world';

const tmpUnits: Unit[] = [];

export function simTick(world: World, dt: number) {
  world.time += dt;
  world.tick++;
  world.rebuildHash();

  for (const u of world.units.values()) { u.px = u.x; u.pz = u.z; }
  for (const p of world.projectiles) { p.px = p.x; p.py = p.y; p.pz = p.z; }

  updateBuildings(world, dt);
  for (const u of world.units.values()) updateUnit(world, u, dt);
  separation(world, dt);
  updateProjectiles(world, dt);
  updateWonders(world, dt);
  if (world.tick % 5 === 0) updateObelisk(world, dt);
  if (world.tick % 20 === 0) updateLabor(world);
  world.sampleEconomy(dt);

  if (world.tick % 5 === 0) updateFog(world);
}

/** A completed wonder wins the game for its owner once the countdown runs out. */
function updateWonders(world: World, dt: number) {
  for (let o = 0; o < 2; o++) {
    if (world.wonderT[o] < 0 || world.winner >= 0) continue;
    world.wonderT[o] -= dt;
    if (world.wonderT[o] <= 0) {
      world.wonderT[o] = -1;
      world.winner = o;
      world.victoryReason = 'wonder';
      world.emit({ t: 'victory', winner: o });
    }
  }
}

/**
 * The Obelisk of the Lost mends its holder's people wherever they stand — the
 * one landmark whose reward reaches the whole map, and the reason to keep it.
 */
function updateObelisk(world: World, dt: number) {
  for (let owner = 0; owner < 2; owner++) {
    if (!world.hasBoon(owner, 'obelisk')) continue;
    const rate = ENC.obeliskHeal * dt * 5;
    for (const u of world.units.values()) {
      if (u.owner !== owner || u.hp >= u.maxHp) continue;
      u.hp = Math.min(u.maxHp, u.hp + rate);
    }
  }
}

/** Forum labor pool: put idle villagers to work along the owner's weights. */
function updateLabor(world: World) {
  for (let owner = 0; owner < 2; owner++) {
    const p = world.players[owner];
    if (!p.laborOn || !world.hasBuilt(owner, 'forum')) continue;
    const idle: Unit[] = [];
    const counts: Record<ResType, number> = { food: 0, wood: 0, stone: 0, gold: 0 };
    let total = 0;
    for (const u of world.units.values()) {
      if (u.owner !== owner || u.type !== 'villager') continue;
      total++;
      const task = u.task;
      if (task.type === 'gather') {
        const n = world.nodes.get(task.nodeId);
        if (n) counts[RES_OF_NODE[n.kind]]++;
      } else if (task.type === 'farm') counts.food++;
      else if (task.type === 'deposit' && u.carryKind) counts[RES_OF_NODE[u.carryKind]]++;
      else if (task.type === 'idle' && u.idleT > 1.5) idle.push(u);
    }
    for (const v of idle) {
      let bestRes: ResType = 'food', bestDef = -Infinity;
      for (const r of RES_ORDER) {
        const deficit = p.laborWeights[r] * total - counts[r];
        if (deficit > bestDef) { bestDef = deficit; bestRes = r; }
      }
      if (sendVillagerTo(world, v, bestRes)) counts[bestRes]++;
    }
  }
}

function sendVillagerTo(world: World, v: Unit, res: ResType): boolean {
  if (res === 'food') {
    for (const b of world.buildings.values()) {
      if (b.owner === v.owner && BUILDINGS[b.type].farm && b.built &&
          (!b.workerId || !world.units.has(b.workerId))) {
        world.cmdFarm([v.id], b.id);
        return true;
      }
    }
    const berry = world.findNearestNode(v.x, v.z, 'berries', 34);
    if (berry) { world.cmdGather([v.id], berry.id); return true; }
    return false;
  }
  const kind: NodeKind = res === 'wood' ? 'tree' : res === 'stone' ? 'stone' : 'gold';
  const n = world.findNearestNode(v.x, v.z, kind, 34);
  if (n) { world.cmdGather([v.id], n.id); return true; }
  return false;
}

// ---------------------------------------------------------------- buildings
function updateBuildings(world: World, dt: number) {
  for (const b of world.buildings.values()) {
    b.cooldown = Math.max(0, b.cooldown - dt);
    b.attackAnimT += dt;
    if (!b.built) continue;
    const def = BUILDINGS[b.type];
    const p = world.players[b.owner];

    // Production queue
    if (b.queue.length > 0) {
      const q = b.queue[0];
      const drill = q.kind === 'unit' ? 1 / b.adjTrain : 1;
      q.t += dt * drill * (q.kind === 'unit' && p.techs.has('logistics') ? 1.15 : 1);
      if (q.t >= q.total) {
        b.queue.shift();
        if (q.kind === 'unit' && q.unit) {
          p.popUsed -= UNITS[q.unit].pop; // release reservation; spawnUnit re-adds
          const cell = world.freeSpawnCell(b, q.unit === 'boat');
          const u = world.spawnUnit(b.owner, q.unit, cell.x, cell.z);
          p.stats.trained++;
          world.emit({ t: 'trained', owner: b.owner, unitType: q.unit });
          if (u.type === 'tradecart') {
            // carts exist to trade — send them off immediately
            world.cmdTrade([u.id], b.id);
          } else if (b.rally) {
            const ent = world.entityAt(b.rally.x, b.rally.z);
            if (ent?.kind === 'node') world.cmdGather([u.id], ent.id);
            else if (ent?.kind === 'building') {
              const rb = world.buildings.get(ent.id);
              if (rb && rb.owner === b.owner && BUILDINGS[rb.type].farm && !rb.workerId && u.type === 'villager') {
                world.cmdFarm([u.id], rb.id);
              } else if (rb && rb.owner === b.owner && !rb.built && u.type === 'villager') {
                world.cmdBuild([u.id], rb.id);
              } else world.cmdMove([u.id], b.rally.x, b.rally.z);
            } else world.cmdMove([u.id], b.rally.x, b.rally.z);
          }
        } else if (q.kind === 'research' && q.tech) {
          applyResearch(world, b.owner, q.tech);
        } else if (q.kind === 'level' && q.level !== undefined) {
          p.level = Math.max(p.level, q.level);
          civicLevelUp(world, b.owner);
          recomputeAdjacency(world, b.owner);
          world.emit({ t: 'levelup', owner: b.owner, level: p.level });
          // Every rise is an occasion: banners go up across the city and the
          // work goes quicker for a while because everyone is out in it.
          world.grantBoon(b.owner, 'festival');
          const home = world.tcPos[b.owner];
          world.emit({ t: 'festival', owner: b.owner, level: p.level, x: home.x, z: home.z });
          if (b.owner === 0) {
            world.emit({ t: 'toast', owner: 0, msg: `Your settlement grows into a ${SETTLEMENTS[p.level].name}`, kind: 'good' });
          }
        } else if (q.kind === 'upgrade' && q.to) {
          // in-place transformation (shrine -> temple, town center -> acropolis)
          world.noteBuilt(b.owner, b.type, -1);
          const frac = b.hp / b.maxHp;
          b.type = q.to;
          b.maxHp = world.buildingHp(b.owner, q.to);
          b.hp = Math.round(b.maxHp * Math.max(frac, 0.6));
          world.noteBuilt(b.owner, b.type, 1);
          // The new building may house a different number of people than the
          // old; recomputeAdjacency re-derives the whole cap, so the difference
          // needs no bookkeeping of its own.
          recomputeAdjacency(world, b.owner);
          world.emit({ t: 'upgrade', id: b.id, owner: b.owner, bType: q.to, x: b.x, z: b.z });
          if (b.owner === 0) {
            world.emit({ t: 'toast', owner: 0, msg: `${BUILDINGS[q.to].name} consecrated`, kind: 'good' });
          }
        }
      }
    }

    // Heal aura (shrine / temple)
    if (def.heal && world.tick % 5 === 0) {
      const rate = def.heal.rate * (p.techs.has('medicine') ? 2 : 1);
      world.unitsNear(b.x, b.z, def.heal.range * b.adjHeal, tmpUnits);
      for (const t of tmpUnits) {
        if (t.owner !== b.owner || t.hp >= t.maxHp) continue;
        t.hp = Math.min(t.maxHp, t.hp + rate * dt * 5);
      }
    }

    // Tower attack
    if (def.attack && b.cooldown <= 0) {
      const targetId = findTowerTarget(world, b, def.attack.range);
      if (targetId) {
        const t = world.units.get(targetId)!;
        spawnProjectile(world, b.owner, b.x, b.z, 2.6, t.id, def.attack.dmg, 'arrow', null);
        b.cooldown = def.attack.cooldown;
        b.attackAnimT = 0;
        world.emit({ t: 'shoot', x: b.x, z: b.z });
      }
    }

    // Monument gold trickle
    if (b.type === 'monument') {
      world.players[b.owner].res.gold += 0.45 * dt * (p.techs.has('coinage') ? 1.5 : 1);
    }

    // Farm reseeding. Egypt's flood does the sowing itself, for nothing.
    if (def.farm && b.farmFood <= 0) {
      const flood = p.techs.has('nileflood');
      if (flood || p.res.wood >= FARM_RESEED_COST) {
        if (!flood) p.res.wood -= FARM_RESEED_COST;
        b.farmFood = FARM_FOOD;
        if (b.withered) { b.withered = false; }
        world.emit({ t: 'farmReseed', owner: b.owner, id: b.id });
      } else if (!b.withered) {
        b.withered = true;
        world.emit({ t: 'farmWither', owner: b.owner, id: b.id });
        if (b.owner === 0) world.emit({ t: 'toast', owner: 0, msg: 'A farm needs wood to reseed', kind: 'warn' });
      }
    }
  }
}

function findTowerTarget(world: World, b: Building, range: number): number {
  let best = 0, bestD = (range + 0.5) * (range + 0.5);
  world.unitsNear(b.x, b.z, range + 0.5, tmpUnits);
  for (const u of tmpUnits) {
    if (u.owner === b.owner) continue;
    if (u.hidden) continue;    // the watchman cannot see into the trees
    // towers don't waste arrows on grazing deer — only wilds on the attack
    if (u.owner === WILDS && !world.wildThreat(u)) continue;
    const d = dist2(u.x, u.z, b.x, b.z);
    const prio = u.type === 'villager' ? d * 1.5 : d;
    if (prio < bestD) { bestD = prio; best = u.id; }
  }
  return best;
}

function applyResearch(world: World, owner: number, techId: string) {
  const p = world.players[owner];
  p.techs.add(techId);
  world.emit({ t: 'research', owner, tech: techId });
  // Retroactive HP boosts
  if (techId === 'shields') {
    for (const u of world.units.values()) {
      if (u.owner !== owner || u.type === 'villager' || u.type === 'boat') continue;
      const s = world.unitStats(owner, u.type);
      u.hp += Math.max(0, s.hp - u.maxHp);
      u.maxHp = s.hp;
    }
  }
  if (techId === 'masonry') {
    for (const b of world.buildings.values()) {
      if (b.owner !== owner) continue;
      const nm = world.buildingHp(owner, b.type);
      b.hp += Math.max(0, nm - b.maxHp);
      b.maxHp = nm;
    }
  }
}

/** Rome's Roads: how far from your own stones a unit still marches on them. */
const ROAD_RANGE = 8;
const ROAD_SPEED_MUL = 1.2;
/** Ticks between aura samples. Staggered by unit id so the cost stays spread. */
const AURA_SAMPLE = 5;

/**
 * Ground effects are a positional question, and asking it every tick for every
 * unit would cost more than it is worth — so each unit re-checks on its own
 * beat and carries the answer until the next one.
 */
function refreshSpeedAura(world: World, u: Unit) {
  if ((world.tick + u.id) % AURA_SAMPLE !== 0) return;
  if (u.water || !world.players[u.owner].techs.has('roads')) { u.speedAura = 1; return; }
  u.speedAura = world.ownBuildingNear(u.owner, u.x, u.z, ROAD_RANGE) ? ROAD_SPEED_MUL : 1;
}

// ---------------------------------------------------------------- units
function updateUnit(world: World, u: Unit, dt: number) {
  u.cooldown = Math.max(0, u.cooldown - dt);
  u.attackAnimT += dt;
  u.scanT -= dt;
  const stats = world.unitStats(u.owner, u.type);
  // Rome's roads under the feet, and — for a scout — a season spent learning
  // the country. Both scale the same number and stack.
  refreshSpeedAura(world, u);
  stats.speed *= u.speedAura;
  if (u.rank) stats.speed *= 1 + u.rank * SCOUT.speedPerRank;

  switch (u.task.type) {
    case 'idle': {
      u.idleT += dt;
      // A scout that ran from something goes back to walking the frontier once
      // it has had a moment: the Explore order outlives the scare that broke it.
      if (u.type === 'scout' && u.exploring && u.idleT > 2) {
        u.task = { type: 'explore' };
        u.path = null;
        u.gatherT = 0;
        break;
      }
      if (u.scanT <= 0 && !u.water) {
        u.scanT = 0.4 + Math.random() * 0.2;
        const def = UNITS[u.type];
        if (isMilitary(u)) {
          // Hold-position units only strike what already stands in reach.
          const radius = u.hold ? Math.max(def.range, def.radius + 0.7) + 0.4 : def.aggro;
          // Siege engines are for stone: they never pick a fight with troops.
          const e = isSiege(u)
            ? world.findEnemyBuilding(u.owner, u.x, u.z, radius)
            : world.findEnemy(u.owner, u.x, u.z, radius, true, true);
          if (e) {
            u.post = u.post ?? { x: u.x, z: u.z };
            u.resume = u.hold ? null : { x: u.post.x, z: u.post.z, attackMove: false };
            u.task = { type: 'attack', targetId: e };
            u.path = null;
          }
        } else if (u.type === 'villager') {
          // Villagers only pick fights with enemy workers; soldiers scare them off.
          const e = world.findEnemy(u.owner, u.x, u.z, 3.2, true, true);
          const target = e ? world.units.get(e) : undefined;
          if (target && target.type === 'villager') {
            u.resume = { x: u.x, z: u.z, attackMove: false };
            u.task = { type: 'attack', targetId: e };
            u.path = null;
          }
        }
      }
      break;
    }
    case 'explore': {
      updateExplore(world, u, dt, stats.speed);
      break;
    }
    case 'move': {
      const t = u.task;
      if (t.attackMove && isMilitary(u) && u.scanT <= 0) {
        u.scanT = 0.45;
        const e = siegeAwareEnemy(world, u, UNITS[u.type].aggro + 1);
        if (e) {
          u.task = { type: 'attack', targetId: e };
          u.path = null;
          break;
        }
      }
      if (approach(world, u, dt, stats.speed, t.x, t.z, 0.45)) {
        u.task = { type: 'idle' };
        u.idleT = 0;
        if (!t.attackMove) u.resume = null;
      }
      break;
    }
    case 'gather': {
      updateGather(world, u, dt, stats.speed);
      break;
    }
    case 'farm': {
      updateFarm(world, u, dt, stats.speed);
      break;
    }
    case 'deposit': {
      updateDeposit(world, u, dt, stats.speed);
      break;
    }
    case 'build': {
      updateBuild(world, u, dt, stats.speed);
      break;
    }
    case 'attack': {
      updateAttack(world, u, dt, stats);
      break;
    }
    case 'trade': {
      updateTrade(world, u, dt, stats.speed);
      break;
    }
  }
}

/**
 * What the slope under an archer is worth. Shooting down from a ridge carries
 * further; shooting up at one falls short. Melee never cares.
 */
function vantageMul(world: World, u: Unit, tx: number, tz: number): number {
  const dh = heightAt(world, u.x, u.z) - heightAt(world, tx, tz);
  if (dh >= TERRAIN.vantageDh) return TERRAIN.rangeDownhill;
  if (dh <= -TERRAIN.vantageDh) return TERRAIN.rangeUphill;
  return 1;
}

function isMilitary(u: Unit): boolean {
  return u.type !== 'villager' && u.type !== 'scout' && u.type !== 'boat' &&
    u.type !== 'tradecart' && u.type !== 'refugee' && u.type !== 'gazelle';
}

/**
 * Walk the frontier. The scout picks the nearest worthwhile patch of unknown
 * country, walks to it, and picks the next one on arrival — the whole point
 * being that exploring a 264x264 map must not cost a hundred taps on a phone.
 *
 * Ground it cannot reach is written off for a while (see `skipFrontier`), so a
 * scout never spends the match staring across water at an island.
 */
function updateExplore(world: World, u: Unit, dt: number, speed: number) {
  if (u.task.type !== 'explore') return;
  const t = u.task;
  if (t.x === undefined || t.z === undefined) {
    const next = world.frontierTarget(u.x, u.z, u.owner);
    if (!next) {
      u.task = { type: 'idle' };
      u.idleT = 0;
      u.exploring = false;
      if (u.owner === 0) {
        world.emit({ t: 'toast', owner: 0, msg: 'The scout has walked the whole country', kind: 'good' });
      }
      return;
    }
    t.x = next.x; t.z = next.z;
    u.path = null;
    u.gatherT = 0;
    return;
  }
  // gatherT doubles as the leg timer here: a leg that drags on is a leg that
  // is not going to finish, so take the next patch instead.
  u.gatherT += dt;
  const arrived = approach(world, u, dt, speed, t.x, t.z, 2.2);
  if (arrived || u.gatherT > 40) {
    if (!arrived) world.skipFrontier(t.x, t.z);
    t.x = undefined; t.z = undefined;
    u.gatherT = 0;
    u.path = null;
  }
}

function isSiege(u: Unit): boolean {
  return SIEGE_UNITS.has(u.type);
}

/** Auto-acquire a target: siege engines only ever look for something to knock down. */
function siegeAwareEnemy(world: World, u: Unit, r: number): number {
  return isSiege(u)
    ? world.findEnemyBuilding(u.owner, u.x, u.z, r)
    : world.findEnemy(u.owner, u.x, u.z, r);
}

// ---------- trade ----------
function updateTrade(world: World, u: Unit, dt: number, speed: number) {
  if (u.task.type !== 'trade') return;
  const t = u.task;
  const post = world.tradePost;
  if (!post) { u.task = { type: 'idle' }; return; }
  let m = world.buildings.get(t.marketId);
  if (!m || m.type !== 'market' || !m.built || m.owner !== u.owner) {
    // home market gone — find another, otherwise stand down
    m = undefined;
    let bestD = Infinity;
    for (const b of world.buildings.values()) {
      if (b.owner !== u.owner || b.type !== 'market' || !b.built) continue;
      const d = dist2(b.x, b.z, u.x, u.z);
      if (d < bestD) { bestD = d; m = b; }
    }
    if (!m) { u.task = { type: 'idle' }; return; }
    t.marketId = m.id;
  }
  if (!t.loaded) {
    // out to the trading post, brief stop to barter
    if (approach(world, u, dt, speed, post.x, post.z, 1.5) ||
        dist(u.x, u.z, post.x, post.z) < 2.0) {
      u.gatherT += dt;
      if (u.gatherT >= 1.2) {
        u.gatherT = 0;
        t.loaded = true;
        u.path = null;
      }
    }
  } else {
    // home with the goods
    if (approach(world, u, dt, speed, m.x, m.z, m.size / 2 + 0.7)) {
      const d = dist(m.x, m.z, post.x, post.z);
      const p = world.players[u.owner];
      let gold = TRADE_BASE_GOLD + d * TRADE_GOLD_PER_TILE;
      if (p.techs.has('coinage')) gold *= 1.3;
      gold *= m.adjTrade;
      // A cart that has run on the city's own stone comes home richer.
      gold *= 1 + ROAD_TRADE_BONUS * routePaved(world, m, post);
      gold = Math.round(gold);
      p.res.gold += gold;
      p.stats.gathered.gold += gold;
      world.emit({ t: 'trade', owner: u.owner, gold, x: m.x, z: m.z });
      world.emit({ t: 'deposit', owner: u.owner, res: 'gold', amount: gold, x: m.x, z: m.z });
      t.loaded = false;
      u.path = null;
    }
  }
}

/**
 * How much of the straight run between market and post is laid stone, 0..1.
 * Sampled rather than walked: the cart's actual path bends around terrain, and
 * this only has to answer "is this a made road or a track through the grass".
 */
function routePaved(world: World, m: Building, post: { x: number; z: number }): number {
  const steps = 12;
  let paved = 0;
  for (let i = 1; i <= steps; i++) {
    const t = i / (steps + 1);
    const x = m.x + (post.x - m.x) * t;
    const z = m.z + (post.z - m.z) * t;
    if (world.speedMulAt(x, z) > 1.2) paved++;
  }
  return paved / steps;
}

/**
 * Move toward a point; returns true when within `range`.
 * Handles path requests, waypoint following, and getting stuck.
 */
function approach(world: World, u: Unit, dt: number, speed: number, tx: number, tz: number, range: number): boolean {
  const d = dist(u.x, u.z, tx, tz);
  if (d <= range) { u.path = null; return true; }

  u.repathT -= dt;
  const goalMoved = !u.pathGoal || dist2(u.pathGoal.x, u.pathGoal.z, tx, tz) > 1.2 * 1.2;
  if ((!u.path && u.repathT <= 0) || (goalMoved && u.repathT <= 0)) {
    world.requestPath(u, tx, tz);
    u.repathT = 0.5 + Math.random() * 0.3;
    if (!u.path || u.path.length === 0) {
      // Unreachable: accept being "near enough" if quite close
      return d < range + 2.2;
    }
  }
  if (!u.path) return false;

  // Follow current waypoint
  let wp = u.path[u.pathI];
  if (!wp) { u.path = null; return d <= range + 0.35; }
  let wx = wp.x, wz = wp.z;
  // last waypoint: head straight for the true target if clear
  if (u.pathI === u.path.length - 1) { wx = tx; wz = tz; }
  let dx = wx - u.x, dz = wz - u.z;
  let wd = Math.hypot(dx, dz);
  if (wd < 0.28) {
    u.pathI++;
    if (u.pathI >= u.path.length) {
      u.path = null;
      return dist(u.x, u.z, tx, tz) <= range + 0.35;
    }
    wp = u.path[u.pathI];
    dx = wp.x - u.x; dz = wp.z - u.z;
    wd = Math.hypot(dx, dz) || 1;
  }
  // Stone carries traffic: this is the whole return on paving a city.
  const step = Math.min(speed * world.speedMulAt(u.x, u.z) * dt, wd);
  const nx = u.x + (dx / wd) * step;
  const nz = u.z + (dz / wd) * step;
  const pass = u.water
    ? waterPassable
    : (g: Uint8Array, cx: number, cz: number) => landPassableFor(g, cx, cz, u.owner);
  if (pass(world.grid, Math.floor(nx), Math.floor(nz))) {
    u.x = nx; u.z = nz;
    u.dir = angleLerp(u.dir, Math.atan2(dx, dz), Math.min(1, dt * 10));
    u.stuckT = 0;
  } else {
    // A building appeared in the way — repath
    u.stuckT += dt;
    if (u.stuckT > 0.25) { u.path = null; u.repathT = 0; u.stuckT = 0; }
  }
  return dist(u.x, u.z, tx, tz) <= range;
}

// ---------- gathering ----------
function gatherSlotPos(u: Unit, nx: number, nz: number): { x: number; z: number } {
  const a = ((u.id * 2.399) % (Math.PI * 2));
  return { x: nx + Math.cos(a) * 0.95, z: nz + Math.sin(a) * 0.95 };
}

function updateGather(world: World, u: Unit, dt: number, speed: number) {
  if (u.task.type !== 'gather') return;
  const node = world.nodes.get(u.task.nodeId);
  if (!node || node.amount <= 0) {
    retargetGather(world, u, node ? node.kind : u.carryKind, node ? node.x : u.x, node ? node.z : u.z);
    return;
  }
  const cap = world.carryCap(u.owner);
  // If carrying a different resource, dump it mentally (simplify)
  if (u.carryKind && RES_OF_NODE[u.carryKind] !== RES_OF_NODE[node.kind]) {
    u.carryKind = null; u.carryAmt = 0;
  }
  if (u.carryAmt >= cap) {
    world.releaseTask(u);
    u.task = { type: 'deposit', thenNodeId: node.id };
    u.path = null;
    return;
  }
  const slot = gatherSlotPos(u, node.x, node.z);
  const range = node.kind === 'fish' ? 1.6 : 0.42;
  if (approach(world, u, dt, speed, slot.x, slot.z, range) ||
      dist(u.x, u.z, node.x, node.z) < 1.55) {
    // gathering
    if (u.slot < 0) { u.slot = 1; node.gatherers++; }
    u.dir = angleLerp(u.dir, Math.atan2(node.x - u.x, node.z - u.z), Math.min(1, dt * 8));
    const rate = world.gatherRate(u.owner, node.kind) * depotMulAt(world, u.owner, node.x, node.z);
    const got = Math.min(rate * dt, node.amount, cap - u.carryAmt);
    u.carryKind = node.kind;
    u.carryAmt += got;
    node.amount -= got;
    u.gatherT += dt;
    if (u.gatherT >= 1.0) {
      u.gatherT = 0;
      world.emit({ t: 'gatherTick', nodeId: node.id, kind: node.kind, x: node.x, z: node.z });
    }
    if (node.amount <= 0) {
      world.removeNode(node);
      if (u.carryAmt > 0.5) {
        world.releaseTask(u);
        u.task = { type: 'deposit', thenNodeId: 0 };
        u.path = null;
      } else {
        retargetGather(world, u, node.kind, node.x, node.z);
      }
    }
  }
}

function retargetGather(world: World, u: Unit, kind: NodeKind | null, nearX: number, nearZ: number) {
  world.releaseTask(u);
  if (kind) {
    const next = world.findNearestNode(nearX, nearZ, kind, 22) ?? world.findNearestNode(u.x, u.z, kind, 30);
    if (next) {
      u.task = { type: 'gather', nodeId: next.id };
      u.path = null;
      return;
    }
  }
  if (u.carryAmt > 0.5) {
    u.task = { type: 'deposit' };
  } else {
    u.task = { type: 'idle' };
    if (u.owner === 0 && kind) {
      world.emit({ t: 'toast', owner: 0, msg: `No more ${RES_OF_NODE[kind]} nearby`, kind: 'warn' });
    }
  }
  u.path = null;
}

function updateFarm(world: World, u: Unit, dt: number, speed: number) {
  if (u.task.type !== 'farm') return;
  const b = world.buildings.get(u.task.bId);
  if (!b || !BUILDINGS[b.type].farm) { u.task = { type: 'idle' }; return; }
  if (!b.built) { u.task = { type: 'build', bId: b.id }; u.path = null; return; }
  if (b.workerId && b.workerId !== u.id) { u.task = { type: 'idle' }; return; }
  b.workerId = u.id;
  const cap = world.carryCap(u.owner);
  if (u.carryAmt >= cap) {
    u.task = { type: 'deposit', thenFarmId: b.id };
    u.path = null;
    return;
  }
  // stand at the field edge
  if (approach(world, u, dt, speed, b.x, b.z, b.size / 2 + 0.35) ||
      dist(u.x, u.z, b.x, b.z) < b.size / 2 + 0.6) {
    if (b.withered || b.farmFood <= 0) return; // wait for reseed
    u.dir = angleLerp(u.dir, Math.atan2(b.x - u.x, b.z - u.z), Math.min(1, dt * 8));
    const rate = world.gatherRate(u.owner, 'farm') * b.adjFarm;
    const got = Math.min(rate * dt, b.farmFood, cap - u.carryAmt);
    u.carryKind = 'berries';
    u.carryAmt += got;
    b.farmFood -= got;
    u.gatherT += dt;
    if (u.gatherT >= 1.15) {
      u.gatherT = 0;
      world.emit({ t: 'gatherTick', nodeId: b.id, kind: 'berries', x: b.x, z: b.z });
    }
  }
}

function updateDeposit(world: World, u: Unit, dt: number, speed: number) {
  if (u.task.type !== 'deposit') return;
  if (u.carryAmt <= 0 || !u.carryKind) { afterDeposit(world, u); return; }
  const drop = world.findNearestDropoff(u.owner, u.x, u.z, u.water);
  if (!drop) { u.task = { type: 'idle' }; return; }
  const range = drop.size / 2 + (u.water ? 1.4 : 0.75);
  if (approach(world, u, dt, speed, drop.x, drop.z, range)) {
    const res: ResType = RES_OF_NODE[u.carryKind];
    const p = world.players[u.owner];
    p.res[res] += u.carryAmt;
    p.stats.gathered[res] += u.carryAmt;
    world.emit({ t: 'deposit', owner: u.owner, res, amount: u.carryAmt, x: drop.x, z: drop.z });
    u.carryAmt = 0;
    afterDeposit(world, u);
  }
}

function afterDeposit(world: World, u: Unit) {
  const t = u.task.type === 'deposit' ? u.task : null;
  const kind = u.carryKind;
  u.carryKind = null;
  if (t?.thenFarmId) {
    const f = world.buildings.get(t.thenFarmId);
    if (f && (!f.workerId || f.workerId === u.id)) {
      f.workerId = u.id;
      u.task = { type: 'farm', bId: f.id };
      u.path = null;
      return;
    }
  }
  if (t?.thenNodeId !== undefined) {
    const n = t.thenNodeId ? world.nodes.get(t.thenNodeId) : undefined;
    if (n && n.amount > 0) {
      u.task = { type: 'gather', nodeId: n.id };
      u.path = null;
      return;
    }
    if (kind) {
      const next = world.findNearestNode(u.x, u.z, kind, 26);
      if (next) {
        u.task = { type: 'gather', nodeId: next.id };
        u.path = null;
        return;
      }
    }
  }
  u.task = { type: 'idle' };
  u.path = null;
}

function updateBuild(world: World, u: Unit, dt: number, speed: number) {
  if (u.task.type !== 'build') return;
  const b = world.buildings.get(u.task.bId);
  if (!b || b.owner !== u.owner) { u.task = { type: 'idle' }; return; }
  const def = BUILDINGS[b.type];
  const range = b.size / 2 + 0.65;
  if (approach(world, u, dt, speed, b.x, b.z, range) || dist(u.x, u.z, b.x, b.z) < range + 0.35) {
    u.dir = angleLerp(u.dir, Math.atan2(b.x - u.x, b.z - u.z), Math.min(1, dt * 8));
    u.attackAnimT = Math.min(u.attackAnimT, 0.6); // hammer anim hint
    if (!b.built) {
      const dp = (dt / def.buildTime) * world.buildRate(u.owner);
      b.progress = Math.min(1, b.progress + dp);
      b.hp = Math.min(b.maxHp, b.hp + b.maxHp * 0.92 * dp);
      u.gatherT += dt;
      if (u.gatherT > 0.8) {
        u.gatherT = 0;
        world.emit({ t: 'gatherTick', nodeId: b.id, kind: 'stone', x: u.x, z: u.z });
      }
      if (b.progress >= 1) {
        b.built = true;
        b.hp = b.maxHp;
        world.noteBuilt(b.owner, b.type, 1);
        if (b.type === 'wonder') {
          world.wonderT[b.owner] = WONDER_COUNTDOWN;
          world.emit({ t: 'wonderStart', owner: b.owner });
        }
        if (b.type === 'lighthouse' && b.owner === 0) {
          world.markExplored(b.x, b.z, 16);
        }
        if (b.type === 'market' && b.owner === 0 && world.tradePost) {
          // merchants know the way: reveal the trading post
          world.markExplored(world.tradePost.x, world.tradePost.z, 5);
          world.emit({ t: 'toast', owner: 0, msg: 'A trading post lies at the heart of the land', kind: 'good' });
          world.emit({ t: 'ping', x: world.tradePost.x, z: world.tradePost.z, color: '#f0c05a' });
        }
        world.emit({ t: 'built', id: b.id, owner: b.owner, bType: b.type, x: b.x, z: b.z });
        // Streets to the neighbours, and ornaments if the work is grand enough.
        planCivic(world, b);
        // The new work reshapes the quarter around it (and pays the population).
        recomputeAdjacency(world, b.owner);
        // farms: builder becomes the farmer
        if (def.farm && !b.workerId) {
          b.workerId = u.id;
          u.task = { type: 'farm', bId: b.id };
          u.path = null;
          return;
        }
        // continue to a nearby construction site
        const next = findNearbySite(world, u);
        if (next) { u.task = { type: 'build', bId: next.id }; u.path = null; return; }
        u.task = { type: 'idle' };
      }
    } else if (b.hp < b.maxHp) {
      b.hp = Math.min(b.maxHp, b.hp + (b.maxHp / def.buildTime) * 0.45 * dt);
      u.gatherT += dt;
      if (u.gatherT > 0.9) {
        u.gatherT = 0;
        world.emit({ t: 'gatherTick', nodeId: b.id, kind: 'stone', x: u.x, z: u.z });
      }
    } else {
      const next = findNearbySite(world, u);
      if (next) { u.task = { type: 'build', bId: next.id }; u.path = null; return; }
      u.task = { type: 'idle' };
    }
  }
}

function findNearbySite(world: World, u: Unit): Building | null {
  let best: Building | null = null, bestD = 13 * 13;
  for (const b of world.buildings.values()) {
    if (b.owner !== u.owner || b.built) continue;
    const d = dist2(b.x, b.z, u.x, u.z);
    if (d < bestD) { bestD = d; best = b; }
  }
  return best;
}

// ---------- combat ----------
function updateAttack(world: World, u: Unit, dt: number, stats: { atk: number; speed: number }) {
  if (u.task.type !== 'attack') return;
  const def = UNITS[u.type];
  const tu = world.units.get(u.task.targetId);
  const tb = tu ? undefined : world.buildings.get(u.task.targetId);
  if (!tu && !tb) {
    // target gone — look for another, otherwise resume
    const e = isMilitary(u) ? siegeAwareEnemy(world, u, def.aggro + 1.5) : 0;
    if (e) { u.task = { type: 'attack', targetId: e }; u.path = null; return; }
    if (u.resume) {
      u.task = { type: 'move', x: u.resume.x, z: u.resume.z, attackMove: u.resume.attackMove };
      if (!u.resume.attackMove) u.resume = null;
      u.path = null;
    } else {
      u.task = { type: 'idle' }; u.idleT = 0;
    }
    return;
  }
  const tx = tu ? tu.x : tb!.x;
  const tz = tu ? tu.z : tb!.z;
  const tRad = tu ? UNITS[tu.type].radius : tb!.size * 0.62;
  const reach = def.range > 0
    ? def.range * vantageMul(world, u, tx, tz) + (tu ? 0 : tb!.size * 0.45)
    : def.radius + tRad + 0.32;

  const d = dist(u.x, u.z, tx, tz);
  if (d > reach + 0.05) {
    // Hold-position units never leave their spot to chase.
    if (u.hold) {
      const e = world.findEnemy(u.owner, u.x, u.z, reach + 0.6, true, true);
      if (e && e !== u.task.targetId) { u.task = { type: 'attack', targetId: e }; return; }
      if (!e) { u.task = { type: 'idle' }; u.path = null; }
      return;
    }
    // Auto-engaged units are leashed to the post they were guarding.
    if (u.post && !u.resume?.attackMove && dist(u.x, u.z, u.post.x, u.post.z) > 11) {
      const post = u.post;
      u.task = { type: 'move', x: post.x, z: post.z };
      u.path = null;
      return;
    }
    approach(world, u, dt, stats.speed, tx, tz, reach * 0.97);
    // If we can't actually get closer (e.g. walled off), switch to whatever
    // enemy is blocking the way — usually the wall itself.
    const after = dist(u.x, u.z, tx, tz);
    if (d - after < stats.speed * dt * 0.25) {
      u.idleT += dt;
      if (u.idleT > 2.2) {
        u.idleT = 0;
        const near = siegeAwareEnemy(world, u, 4.5);
        if (near && near !== u.task.targetId) {
          u.task = { type: 'attack', targetId: near };
          u.path = null;
        }
      }
    } else {
      u.idleT = 0;
    }
    return;
  }
  // in range: face and swing
  u.dir = angleLerp(u.dir, Math.atan2(tx - u.x, tz - u.z), Math.min(1, dt * 12));
  if (u.cooldown <= 0) {
    u.cooldown = def.cooldown;
    u.attackAnimT = 0;
    if (def.range > 0) {
      const kind = def.projectile ?? 'arrow';
      spawnProjectile(world, u.owner, u.x, u.z, 0.85, u.task.targetId, stats.atk, kind, u.type);
      world.emit({ t: 'shoot', x: u.x, z: u.z, heavy: kind === 'boulder' });
    } else {
      dealDamage(world, u.owner, u.task.targetId, stats.atk, u.x, u.z, u.type);
    }
  }
}

/** Towers loose plain arrows: pierce damage, no counter bonuses. */
const TOWER_DMG_TYPE: DamageType = 'pierce';

function dmgTypeOf(src: UnitTypeId | null): DamageType {
  return src ? UNITS[src].dmgType : TOWER_DMG_TYPE;
}

function bonusVs(src: UnitTypeId | null, cls: ArmorClass): number {
  return src ? (UNITS[src].bonus?.[cls] ?? 0) : 0;
}

/** Scratch for the close-order scans below — never the shared `tmpUnits`. */
const tmpRanks: Unit[] = [];

/** Phalanx Drill: within this, a hoplite counts as standing in the line. */
const PHALANX_RANGE = 3;
const PHALANX_ARMOR = 2;
/** ...and Legion Standard, which wants the men closer still. */
const STANDARD_RANGE = 2;
const STANDARD_ARMOR_MAX = 3;

/**
 * Armor a unit owes to the men beside it. Both are close-order drills: they
 * pay only while the formation holds, so a broken line is a soft one.
 * Greece's shield wall turns blades alone; Rome's standard turns everything.
 */
function closeOrderArmor(world: World, target: Unit, pierce: boolean): number {
  const type = target.type;
  if (type !== 'hoplite' && type !== 'legionary') return 0;
  const p = world.players[target.owner];
  const phalanx = type === 'hoplite' && p.techs.has('phalanx');
  const standard = type === 'legionary' && p.techs.has('standard');
  if (!phalanx && !standard) return 0;
  // A phalanx presents shields, not armor: arrows come over the top regardless.
  if (phalanx && pierce) return 0;
  const range = phalanx ? PHALANX_RANGE : STANDARD_RANGE;
  world.unitsNear(target.x, target.z, range, tmpRanks);
  let mates = 0;
  for (const o of tmpRanks) {
    if (o.id !== target.id && o.owner === target.owner && o.type === type) mates++;
  }
  if (phalanx) return mates >= 2 ? PHALANX_ARMOR : 0;
  return Math.min(STANDARD_ARMOR_MAX, mates);
}

/**
 * Resolve one hit against a unit: the attacker's flat counter bonus for that
 * unit's class, less whichever armor channel the damage type reads. A hit
 * always lands for at least 1 so nothing is literally immune.
 */
function damageToUnit(world: World, src: UnitTypeId | null, rawDmg: number, target: Unit): number {
  const s = world.unitStats(target.owner, target.type);
  const pierce = dmgTypeOf(src) === 'pierce';
  const armor = (pierce ? s.pierceArmor : s.meleeArmor) + closeOrderArmor(world, target, pierce);
  return Math.max(1, rawDmg + bonusVs(src, UNITS[target.type].armorClass) - armor);
}

/** Same for buildings — siege damage ignores their armor, everything else does not. */
function damageToBuilding(world: World, src: UnitTypeId | null, rawDmg: number, target: Building): number {
  const armor = dmgTypeOf(src) === 'siege' ? 0 : world.buildingArmor(target.owner, target.type);
  return Math.max(1, rawDmg + bonusVs(src, 'building') - armor);
}

export function dealDamage(
  world: World, byOwner: number, targetId: number, rawDmg: number,
  fromX: number, fromZ: number, srcType: UnitTypeId | null = null
) {
  const tu = world.units.get(targetId);
  if (tu) {
    tu.hp -= damageToUnit(world, srcType, rawDmg, tu);
    tu.lastHitT = world.time;
    world.emit({ t: 'hit', x: tu.x, z: tu.z, y: 0.7, melee: true });
    if (tu.owner === 0) world.emit({ t: 'underattack', owner: 0, x: tu.x, z: tu.z });
    if (tu.hp <= 0) {
      world.killUnit(tu, byOwner);
      if (tu.owner === WILDS) onWildsUnitKilled(world, tu, byOwner);
      return;
    }
    reactToDamage(world, tu, byOwner, fromX, fromZ);
    return;
  }
  const tb = world.buildings.get(targetId);
  if (tb) {
    tb.hp -= damageToBuilding(world, srcType, rawDmg, tb);
    tb.lastHitT = world.time;
    world.emit({ t: 'hit', x: tb.x, z: tb.z, y: 1.0, melee: true });
    if (tb.owner === 0) world.emit({ t: 'underattack', owner: 0, x: tb.x, z: tb.z });
    if (tb.hp <= 0) {
      world.destroyBuilding(tb, byOwner);
      if (tb.owner === WILDS) onWildsBuildingRazed(world, tb, byOwner);
    } else if (tb.owner === WILDS) {
      onWildsBuildingHit(world, tb, byOwner);
    }
  }
}

/**
 * A catapult's shot scatters. Everything but the unit it actually struck takes
 * a share, own troops included — at a reduced rate, because a full-price
 * friendly fire rule is unplayable on a touch screen.
 */
function splashDamage(
  world: World, byOwner: number, srcType: UnitTypeId, x: number, z: number,
  rawDmg: number, directId: number
) {
  const splash = UNITS[srcType].splash;
  if (!splash) return;
  const caught: Unit[] = [];
  world.unitsNear(x, z, splash.radius, caught);
  // Snapshot ids first: dealing damage can kill units and mutate the world.
  const ids = caught.filter(u => u.id !== directId).map(u => u.id);
  for (const id of ids) {
    const u = world.units.get(id);
    if (!u) continue;
    const share = u.owner === byOwner ? splash.friendly : 1;
    if (share <= 0) continue;
    dealDamage(world, byOwner, id, rawDmg * share, x, z, srcType);
  }
}

function reactToDamage(world: World, victim: Unit, byOwner: number, fromX: number, fromZ: number) {
  if (victim.water) return;
  if (victim.owner === WILDS) {
    // the wilds answer for themselves: herds bolt, packs and deserters bite back
    wildsReact(world, victim, byOwner, fromX, fromZ);
    return;
  }
  if (victim.type === 'refugee') {
    // rescued refugees scatter from danger rather than running a fixed route
    if (victim.task.type !== 'move' || !victim.path) {
      const tc = world.tcPos[victim.owner];
      world.releaseTask(victim);
      victim.task = { type: 'move', x: tc.x + (Math.random() * 4 - 2), z: tc.z + 3 + Math.random() * 2 };
      victim.path = null;
      victim.resume = null;
    }
    return;
  }
  if (victim.type === 'villager' || victim.type === 'tradecart' || victim.type === 'scout') {
    // flee to town center unless already fleeing (a scout carries no weapon
    // worth the name — running is the whole of its defence)
    if (victim.task.type !== 'move' || !victim.path) {
      const tc = world.tcPos[victim.owner];
      world.releaseTask(victim);
      victim.task = { type: 'move', x: tc.x + (Math.random() * 4 - 2), z: tc.z + 3 + Math.random() * 2 };
      victim.path = null;
      victim.resume = null;
    }
    return;
  }
  // Siege engines never turn on their tormentors — at 1.8 speed they could
  // never catch one anyway. They keep grinding at whatever they were sent for.
  if (isSiege(victim)) return;
  // military retaliates if not already fighting
  if (victim.task.type !== 'attack') {
    const attacker = world.findEnemy(victim.owner, fromX, fromZ, 2.5) ||
      world.findEnemy(victim.owner, victim.x, victim.z, UNITS[victim.type].aggro + 2);
    if (attacker) {
      victim.resume = { x: victim.x, z: victim.z, attackMove: false };
      victim.task = { type: 'attack', targetId: attacker };
      victim.path = null;
    }
  }
}

function spawnProjectile(
  world: World, owner: number, x: number, z: number, y: number, targetId: number,
  dmg: number, kind: Projectile['kind'], srcType: UnitTypeId | null
) {
  const tu = world.units.get(targetId);
  const tb = tu ? undefined : world.buildings.get(targetId);
  const tx = tu ? tu.x : tb ? tb.x : x;
  const tz = tu ? tu.z : tb ? tb.z : z;
  const d = dist(x, z, tx, tz);
  // A boulder is heavy: it flies slower and lobs much higher than an arrow.
  const heavy = kind === 'boulder';
  const total = Math.max(heavy ? 0.5 : 0.18, d / (heavy ? 9 : 13));
  world.projectiles.push({
    id: world.nextId++, owner,
    x, y, z, px: x, py: y, pz: z,
    sx: x, sz: z, tx, tz, targetId,
    t: 0, total, dmg,
    arc: heavy ? clamp(d * 0.3, 1.2, 3.4) : clamp(d * 0.14, 0.25, 1.5),
    kind, srcType
  });
}

function updateProjectiles(world: World, dt: number) {
  const arr = world.projectiles;
  for (let i = arr.length - 1; i >= 0; i--) {
    const p = arr[i];
    p.t += dt / p.total;
    // light homing so shots connect with moving targets — but a lobbed boulder
    // lands where it was aimed, which is what makes catapults miss runners.
    const tu = world.units.get(p.targetId);
    if (tu && p.kind !== 'boulder') {
      p.tx += (tu.x - p.tx) * Math.min(1, dt * 7);
      p.tz += (tu.z - p.tz) * Math.min(1, dt * 7);
    }
    if (p.t >= 1) {
      // impact
      const tb = world.buildings.get(p.targetId);
      const hitUnit = tu && dist(tu.x, tu.z, p.tx, p.tz) < 1.0;
      if (hitUnit || tb) {
        dealDamage(world, p.owner, p.targetId, p.dmg, p.sx, p.sz, p.srcType);
      } else {
        world.emit({ t: 'hit', x: p.tx, z: p.tz, y: 0.05, melee: false });
      }
      // Scatter catches everyone standing near where it came down, hit or miss.
      if (p.srcType && UNITS[p.srcType].splash) {
        splashDamage(world, p.owner, p.srcType, p.tx, p.tz, p.dmg, hitUnit ? p.targetId : 0);
      }
      arr.splice(i, 1);
      continue;
    }
    const t = p.t;
    p.x = p.sx + (p.tx - p.sx) * t;
    p.z = p.sz + (p.tz - p.sz) * t;
    const y0 = 0.9, y1 = 0.5;
    p.y = y0 + (y1 - y0) * t + Math.sin(t * Math.PI) * p.arc;
  }
}

// ---------- separation (anti-bunching) ----------
function separation(world: World, dt: number) {
  for (const u of world.units.values()) {
    const r = u.water ? 1.1 : 0.62;
    world.unitsNear(u.x, u.z, r, tmpUnits);
    if (tmpUnits.length < 2) continue;
    let px = 0, pz = 0;
    for (const o of tmpUnits) {
      if (o === u || o.water !== u.water) continue;
      let dx = u.x - o.x, dz = u.z - o.z;
      let d = Math.hypot(dx, dz);
      if (d < 0.001) { dx = Math.sin(u.id); dz = Math.cos(u.id); d = 1; }
      const overlap = r - d;
      if (overlap > 0) {
        px += (dx / d) * overlap;
        pz += (dz / d) * overlap;
      }
    }
    if (px !== 0 || pz !== 0) {
      const mul = (u.task.type === 'idle' ? 2.2 : 1.1) * dt;
      const nx = u.x + clamp(px * mul, -0.09, 0.09);
      const nz = u.z + clamp(pz * mul, -0.09, 0.09);
      const ok = u.water
        ? waterPassable(world.grid, Math.floor(nx), Math.floor(nz))
        : landPassableFor(world.grid, Math.floor(nx), Math.floor(nz), u.owner);
      if (ok) {
        u.x = nx; u.z = nz;
      }
    }
  }
}

// ---------- fog ----------
/**
 * A soldier standing still among trees is not there, as far as the other side
 * can see — until someone walks close enough to look in, or the soldier
 * strikes. This is what makes a forest edge a place to wait.
 */
function updateConcealment(world: World, u: Unit) {
  if (u.owner > 1 || u.water || u.task.type === 'attack') { u.hidden = false; return; }
  if (!world.inCover(u.x, u.z)) { u.hidden = false; return; }
  world.unitsNear(u.x, u.z, TERRAIN.concealR, tmpUnits);
  for (const t of tmpUnits) {
    if (t.owner <= 1 && t.owner !== u.owner && !t.water) { u.hidden = false; return; }
  }
  u.hidden = true;
}

function updateFog(world: World) {
  // Beacon Hill shows its holder the country from the fire.
  const beacon = world.hasBoon(0, 'beacon') ? ENC.beaconVision : 0;
  for (const u of world.units.values()) {
    updateConcealment(world, u);
    if (u.owner === 1) { world.noteSeen(u.x, u.z); continue; }
    if (u.owner !== 0) continue;
    let base = UNITS[u.type].vision ?? (u.water ? 9.5 : 8);
    // High ground is a vantage: the same pair of eyes carries further from it.
    if (!u.water && heightAt(world, u.x, u.z) >= TERRAIN.vantageY) base *= TERRAIN.visionMul;
    world.markExplored(u.x, u.z, base + (u.rank ?? 0) * SCOUT.visionPerRank + beacon);
  }
  for (const b of world.buildings.values()) {
    // A foundation sees nothing: an unbuilt Obelisk would otherwise be a
    // 45-stone map reveal that never needs a villager to walk to it.
    if (b.owner !== 0 || !b.built) continue;
    world.markExplored(b.x, b.z, world.buildingVision(0, b.type));
  }
  // A ford found is a ford remembered: named, marked, and worth knowing.
  for (const f of world.fords) {
    if (f.discovered || !world.isExploredWorld(f.x, f.z)) continue;
    f.discovered = true;
    world.emit({ t: 'toast', owner: 0, msg: `${f.name} — the river can be crossed here`, kind: 'good' });
    world.emit({ t: 'ping', x: f.x, z: f.z, color: '#8fc7e8' });
  }
}

// Enemy AI: runs its economy, expands, defends its base, and launches
// escalating attack waves. Issues orders through the same command API
// as the player.
import { BUILDINGS, DIFFICULTY, MAX_LEVEL, SETTLEMENTS, trainableAt, UNITS } from '../core/config';
import type { Building, Difficulty, NodeKind, ResType, Unit, UnitTypeId } from '../core/types';
import { RES_OF_NODE } from '../core/types';
import { dist, dist2 } from '../core/utils';
import type { World } from './world';

const OWNER = 1;
/** Villagers the AI wants working before it commits to each settlement level. */
const AI_LEVEL_VILLAGERS = [0, 5, 7, 10, 13, 15];

export class AIController {
  private acc = 0;
  private waveN = 0;
  private nextWaveAt: number;
  private diff: (typeof DIFFICULTY)['normal'];
  private lastStorehouseAt = -999;
  private defendUntil = 0;
  private attackers: number[] = [];
  private wonderRushAt = 0;

  constructor(private world: World, difficulty: Difficulty) {
    this.diff = DIFFICULTY[difficulty];
    this.nextWaveAt = this.diff.firstWave;
  }

  step(dt: number) {
    this.acc += dt;
    if (this.acc < 1) return;
    this.acc = 0;
    const w = this.world;
    if (w.winner >= 0) return;

    const tc = this.myTC();
    if (!tc) return;

    const units = [...w.units.values()].filter(u => u.owner === OWNER);
    const villagers = units.filter(u => u.type === 'villager');
    const military = units.filter(u => u.type !== 'villager' && u.type !== 'boat');
    const buildings = [...w.buildings.values()].filter(b => b.owner === OWNER);

    this.defense(tc, military);
    // Settlement growth gets first claim on the town center queue, otherwise
    // villager production would keep it busy forever and the AI would never advance.
    this.levelUp(tc, villagers.length);
    this.economy(tc, villagers, buildings);
    this.construction(tc, villagers, buildings);
    this.trainMilitary(buildings, military.length);
    // A standing player wonder is a death sentence — drop everything and raze it.
    if (w.wonderT[0] >= 0) {
      if (w.time > this.wonderRushAt && military.length >= 3) {
        this.wonderRushAt = w.time + 8;
        const wonder = [...w.buildings.values()].find(b => b.owner === 0 && b.type === 'wonder' && b.built);
        if (wonder) {
          const ids = military.map(u => u.id);
          this.attackers = ids;
          w.cmdMove(ids, wonder.x, wonder.z, true);
        }
      }
      return;
    }
    this.offense(tc, military);
  }

  private myTC(): Building | null {
    for (const b of this.world.buildings.values()) {
      if (b.owner === OWNER && b.type === 'towncenter') return b;
    }
    return null;
  }

  // ---------------- defense ----------------
  private defense(tc: Building, military: Unit[]) {
    const w = this.world;
    let threatX = 0, threatZ = 0, threat = 0;
    for (const u of w.units.values()) {
      if (u.owner !== 0 || u.water) continue;
      const d = dist(u.x, u.z, tc.x, tc.z);
      if (d < 20) { threat++; threatX += u.x; threatZ += u.z; }
    }
    if (threat > 0) {
      threatX /= threat; threatZ /= threat;
      if (w.time > this.defendUntil) {
        this.defendUntil = w.time + 6;
        const defenders = military
          .filter(u => !this.attackers.includes(u.id) || threat >= 3)
          .map(u => u.id);
        if (threat >= 3) this.attackers = []; // full recall on real pushes
        if (defenders.length) w.cmdMove(defenders, threatX, threatZ, true);
      }
    }
  }

  // ---------------- economy ----------------
  private economy(tc: Building, villagers: Unit[], buildings: Building[]) {
    const w = this.world;
    const p = w.players[OWNER];

    // Train villagers — but stop once we have the workers for the next level,
    // so the treasury can actually reach the settlement upgrade cost.
    const saving = p.level < MAX_LEVEL
      && villagers.length >= AI_LEVEL_VILLAGERS[p.level + 1]
      && !w.canAfford(OWNER, SETTLEMENTS[p.level + 1].cost);
    if (!saving && villagers.length < this.diff.aiVillagers && tc.built && tc.queue.length === 0) {
      w.startTrain(tc.id, 'villager');
    }

    // Desired distribution
    const t = w.time;
    const weights: Record<ResType, number> =
      t < 150 ? { food: 0.5, wood: 0.42, gold: 0.08, stone: 0 } :
      t < 330 ? { food: 0.42, wood: 0.3, gold: 0.22, stone: 0.06 } :
                { food: 0.38, wood: 0.26, gold: 0.28, stone: 0.08 };

    const counts: Record<ResType, number> = { food: 0, wood: 0, stone: 0, gold: 0 };
    const idle: Unit[] = [];
    let builders = 0;
    for (const v of villagers) {
      const task = v.task;
      if (task.type === 'gather') {
        const n = w.nodes.get(task.nodeId);
        if (n) counts[RES_OF_NODE[n.kind]]++;
      } else if (task.type === 'farm') counts.food++;
      else if (task.type === 'deposit') {
        if (v.carryKind) counts[RES_OF_NODE[v.carryKind]]++;
      } else if (task.type === 'build') builders++;
      else idle.push(v);
    }

    // Send construction help
    const sites = buildings.filter(b => !b.built);
    if (sites.length > 0 && builders < Math.min(2 + sites.length, 4) && idle.length === 0 && villagers.length > 4) {
      // pull a wood gatherer to build
      const v = villagers.find(x => x.task.type === 'gather');
      if (v) idle.push(v);
    }
    for (const site of sites) {
      if (idle.length === 0) break;
      if (builders >= 4) break;
      const v = idle.pop()!;
      w.cmdBuild([v.id], site.id);
      builders++;
    }

    // Assign remaining idle villagers to the largest deficit
    for (const v of idle) {
      const total = Math.max(1, villagers.length);
      let bestRes: ResType = 'wood', bestDef = -Infinity;
      for (const r of ['food', 'wood', 'gold', 'stone'] as ResType[]) {
        const deficit = weights[r] * total - counts[r];
        if (deficit > bestDef) { bestDef = deficit; bestRes = r; }
      }
      if (!this.sendToGather(v, bestRes, tc)) {
        // fallback: any resource
        for (const r of ['wood', 'food', 'gold', 'stone'] as ResType[]) {
          if (this.sendToGather(v, r, tc)) break;
        }
      }
      counts[bestRes]++;
    }
  }

  private sendToGather(v: Unit, res: ResType, tc: Building): boolean {
    const w = this.world;
    if (res === 'food') {
      // free farm first
      for (const b of w.buildings.values()) {
        if (b.owner === OWNER && BUILDINGS[b.type].farm && b.built && !b.workerId) {
          w.cmdFarm([v.id], b.id);
          return true;
        }
      }
      const berry = w.findNearestNode(tc.x, tc.z, 'berries', 30);
      if (berry) { w.cmdGather([v.id], berry.id); return true; }
      return false;
    }
    const kind: NodeKind = res === 'wood' ? 'tree' : res === 'stone' ? 'stone' : 'gold';
    const n = w.findNearestNode(tc.x, tc.z, kind, 34) ?? w.findNearestNode(v.x, v.z, kind, 40);
    if (n) { w.cmdGather([v.id], n.id); return true; }
    return false;
  }

  // ---------------- settlement growth ----------------
  /** Level up as soon as the economy can carry it — levels gate the AI's army. */
  private levelUp(tc: Building, villagers: number) {
    const w = this.world;
    const p = w.players[OWNER];
    if (p.level >= MAX_LEVEL) return;
    if (tc.queue.length > 0) return;
    // enough workers to keep income flowing while banking for the upgrade
    const need = AI_LEVEL_VILLAGERS[p.level + 1] ?? 12;
    if (villagers < need) return;
    const cost = SETTLEMENTS[p.level + 1].cost;
    if (!w.canAfford(OWNER, cost)) return;
    w.startLevelUp(tc.id);
  }

  // ---------------- construction ----------------
  private construction(tc: Building, villagers: Unit[], buildings: Building[]) {
    const w = this.world;
    const p = w.players[OWNER];
    const t = w.time;
    const has = (type: string) => buildings.filter(b => b.type === type).length;
    const sites = buildings.filter(b => !b.built).length;
    if (sites >= 2) return;
    if (villagers.length === 0) return;

    const place = (type: keyof typeof BUILDINGS, nearX: number, nearZ: number): boolean => {
      if (!w.canAfford(OWNER, w.buildingCost(OWNER, type))) return false;
      const spot = this.findSpot(BUILDINGS[type].size, nearX, nearZ);
      if (!spot) return false;
      const b = w.tryPlaceBuilding(OWNER, type, spot.cx, spot.cz);
      if (!b) return false;
      // send the nearest free villager
      let best: Unit | null = null, bestD = Infinity;
      for (const v of villagers) {
        if (v.task.type === 'build') continue;
        const d = dist2(v.x, v.z, b.x, b.z);
        if (d < bestD) { bestD = d; best = v; }
      }
      if (best) w.cmdBuild([best.id], b.id);
      return true;
    };

    // Housing
    if (p.popCap - p.popUsed <= 3 && p.popCap < 45) {
      if (place('house', tc.x + 5, tc.z - 4)) return;
    }
    // Barracks
    if (p.level >= 1 && has('barracks') === 0) {
      if (place('barracks', tc.x - 6, tc.z + 5)) return;
    }
    if (has('barracks') === 1 && t > 420 && p.res.wood > 160) {
      if (place('barracks', tc.x + 7, tc.z + 6)) return;
    }
    // Archery range
    if (p.level >= 2 && has('range') === 0 && (t > 170 || p.res.wood >= 190)) {
      if (place('range', tc.x + 6, tc.z + 5)) return;
    }
    // Farms when berries run dry
    const berriesLeft = w.findNearestNode(tc.x, tc.z, 'berries', 26);
    const farms = buildings.filter(b => BUILDINGS[b.type].farm);
    if ((!berriesLeft || farms.length === 0 && t > 260) && farms.length < 7 && p.res.wood >= 60) {
      if (place('farm', tc.x + (farms.length % 3) * 4 - 4, tc.z - 6 - Math.floor(farms.length / 3) * 4)) return;
    }
    // Storehouse near a far wood grove
    if (t - this.lastStorehouseAt > 90 && has('storehouse') < 2 && p.res.wood >= 50) {
      const grove = w.findNearestNode(tc.x, tc.z, 'tree', 30);
      if (grove && !w.findNearestDropoff(OWNER, grove.x, grove.z) ||
          grove && dist(grove.x, grove.z, w.findNearestDropoff(OWNER, grove.x, grove.z)!.x, w.findNearestDropoff(OWNER, grove.x, grove.z)!.z) > 11) {
        if (place('storehouse', grove.x + 2, grove.z + 2)) {
          this.lastStorehouseAt = t;
          return;
        }
      }
    }
    // Defensive tower toward the player
    if (p.level >= 3 && t > 280 && has('tower') < 2 && p.res.stone >= 85) {
      const dir = Math.atan2(w.tcPos[0].z - tc.z, w.tcPos[0].x - tc.x);
      if (place('tower', tc.x + Math.cos(dir) * 9, tc.z + Math.sin(dir) * 9)) return;
    }
    // Monument when rich (hard mode flex)
    if (p.level >= 4 && t > 500 && has('monument') === 0 && p.res.stone > 160 && p.res.gold > 180) {
      if (place('monument', tc.x - 7, tc.z - 6)) return;
    }
    // Amphitheater: the games sharpen every blade (+30% damage)
    if (p.level >= 4 && t > 560 && has('amphitheater') === 0 &&
        p.res.wood > 220 && p.res.stone > 170 && p.res.gold > 150) {
      if (place('amphitheater', tc.x + 8, tc.z - 5)) return;
    }
    // A late, rich AI reaches for a Wonder of its own
    if (p.level >= 5 && t > 780 && has('wonder') === 0 &&
        p.res.wood > 340 && p.res.stone > 390 && p.res.gold > 340) {
      if (place('wonder', tc.x - 8, tc.z - 8)) return;
    }
    // Research when comfortable (never at the cost of the next level)
    if (p.res.food > 320 && p.res.gold > 170) {
      const bar = buildings.find(b => b.type === 'barracks' && b.built && b.queue.length === 0);
      if (bar) {
        if (!p.techs.has('bronze')) w.startResearch(bar.id, 'bronze');
        else if (!p.techs.has('shields')) w.startResearch(bar.id, 'shields');
      }
      if (tc.queue.length === 0 && p.level >= 2 && !p.techs.has('wheel')) {
        w.startResearch(tc.id, 'wheel');
      }
    }
  }

  private findSpot(size: number, nearX: number, nearZ: number): { cx: number; cz: number } | null {
    const w = this.world;
    const bx = Math.round(nearX - size / 2), bz = Math.round(nearZ - size / 2);
    for (let r = 0; r < 14; r++) {
      for (let attempt = 0; attempt < Math.max(1, r * 6); attempt++) {
        const a = Math.random() * Math.PI * 2;
        const cx = bx + Math.round(Math.cos(a) * r);
        const cz = bz + Math.round(Math.sin(a) * r);
        if (w.canPlace(OWNER, size === 4 ? 'towncenter' : sizeType(size), cx, cz).ok) {
          return { cx, cz };
        }
      }
    }
    return null;
  }

  // ---------------- military ----------------
  private trainMilitary(buildings: Building[], armySize: number) {
    const w = this.world;
    const p = w.players[OWNER];
    const cap = Math.min(18, 5 + this.waveN * 3);
    if (armySize >= cap) return;
    for (const b of buildings) {
      if (!b.built || !BUILDINGS[b.type].trains) continue;
      if (b.type === 'towncenter' || b.type === 'dock') continue;
      if (b.queue.length >= 2) continue;
      const options = trainableAt(p.faction, b.type, p.level).filter(u => u !== 'boat');
      if (options.length === 0) continue;
      // Prefer elites when affordable, fall back to basics if that fails
      const elite = options.find(o => o !== 'spearman' && o !== 'archer');
      const order: UnitTypeId[] = [];
      if (elite && Math.random() < 0.55) order.push(elite);
      order.push(...options.filter(o => o !== elite));
      if (elite && !order.includes(elite)) order.push(elite);
      for (const u of order) {
        if (w.startTrain(b.id, u)) break;
      }
    }
  }

  private offense(tc: Building, military: Unit[]) {
    const w = this.world;
    this.attackers = this.attackers.filter(id => w.units.has(id));
    const waveSize = this.diff.waveBase + this.diff.waveGrow * this.waveN;
    const ready = military.length;
    const timeUp = w.time >= this.nextWaveAt;
    // Overflow attacks only between scheduled waves — never before the first one,
    // or a small waveBase would trigger a rush long before firstWave.
    const overflowing = this.waveN > 0 && ready >= Math.min(20, waveSize * 2.4);
    const lateGame = w.time > 1100 && ready >= 12 && this.attackers.length === 0;

    if ((timeUp && ready >= Math.min(waveSize, 22)) || overflowing || lateGame) {
      this.waveN++;
      this.nextWaveAt = w.time + this.diff.waveEvery;
      // send everyone not currently defending home base
      const ids = military.map(u => u.id);
      this.attackers = ids;
      const target = this.pickAttackTarget();
      w.cmdMove(ids, target.x, target.z, true);
      w.emit({ t: 'ping', x: tc.x, z: tc.z, color: '#ff5544' });
    } else if (timeUp) {
      // couldn't muster: push the deadline out a bit
      this.nextWaveAt = w.time + 30;
    }
  }

  private pickAttackTarget(): { x: number; z: number } {
    const w = this.world;
    // Prefer forward player military buildings, then TC
    let best: Building | null = null, bestD = Infinity;
    const myTc = w.tcPos[OWNER];
    for (const b of w.buildings.values()) {
      if (b.owner !== 0) continue;
      const mul = b.type === 'wonder' ? 0.25 : b.type === 'towncenter' ? 0.85 : 1;
      const score = dist2(b.x, b.z, myTc.x, myTc.z) * mul;
      if (score < bestD) { bestD = score; best = b; }
    }
    return best ? { x: best.x, z: best.z } : w.tcPos[0];
  }
}

function sizeType(size: number): 'house' | 'barracks' {
  // helper for canPlace probing by footprint size (2 or 3)
  return size === 2 ? 'house' : 'barracks';
}

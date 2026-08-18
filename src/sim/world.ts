// World: all simulation state plus entity management and player commands.
// Both the UI and the AI issue orders exclusively through these methods.
import {
  availableTo, BOONS, BUILDINGS, CARRY_CAP, ENC, FACTIONS, FARM_FOOD, GATHER_RATE, isTownCenter,
  MAP_H, MAP_W, MARKET_BUY_GOLD, MARKET_LOT, MARKET_SELL_GOLD, MAX_LEVEL, NODE_AMOUNT, POP_MAX,
  SETTLEMENTS, TECHS, UNITS, WILDS, type Cost
} from '../core/config';
import type {
  Building, BuildingTypeId, EncounterSite, Faction, NodeKind, PlayerState, Projectile,
  ResourceNode, ResType, SimEvent, Task, Unit, UnitTypeId, Vec2
} from '../core/types';
import { RES_OF_NODE } from '../core/types';
import { dist, dist2 } from '../core/utils';
import { clearCivicUnder, type CivicProp } from './civic';
import {
  F_BLOCK, F_BUILDING, F_WALL0, F_WALL1, F_WATER, findPath, landPassable, nearestFree,
  ringCells, waterPassable
} from './pathfinding';

export interface MapDeco {
  kind: string;
  x: number; z: number;
  rot: number; scale: number;
  faction?: Faction;
}

export class World {
  grid = new Uint8Array(MAP_W * MAP_H);
  waterRegion = new Uint8Array(MAP_W * MAP_H); // 1 = main sea/lake (dockable), 2 = pond
  height = new Float32Array((MAP_W + 1) * (MAP_H + 1));
  explored = new Uint8Array(MAP_W * MAP_H);    // player fog (1 = seen)
  biome = new Uint8Array(MAP_W * MAP_H);       // 0 desert, 1 grass, 2 lush, 3 highland

  units = new Map<number, Unit>();
  buildings = new Map<number, Building>();
  nodes = new Map<number, ResourceNode>();
  projectiles: Projectile[] = [];
  deco: MapDeco[] = [];

  /** Roads and ornaments the settlements lay down for themselves (see civic.ts). */
  civic: CivicProp[] = [];
  /** Cell -> civic prop id; -1 marks the founding plaza laid at map gen. */
  civicAt = new Int32Array(MAP_W * MAP_H);
  /** Bumped on every civic change so the view can resync cheaply. */
  civicRev = 0;
  civicSeeded = false;

  players: PlayerState[] = [];
  events: SimEvent[] = [];
  time = 0;
  tick = 0;
  nextId = 1;
  winner = -1; // -1 = ongoing, 0 = player, 1 = AI
  victoryReason: 'conquest' | 'wonder' = 'conquest';

  // spatial hash of units for neighbor queries (cell = 2 world units)
  hash = new Map<number, number[]>();
  buildingHash = new Map<number, number[]>();

  tcPos: Vec2[] = [{ x: 0, z: 0 }, { x: 0, z: 0 }];
  /** Where each player's settlement began — used for terrain tinting. */
  homeland: { x: number; z: number; faction: Faction }[] = [];
  /** Neutral trading post trade carts shuttle to (set during map gen). */
  tradePost: Vec2 | null = null;
  /** Wonder victory countdown per player; -1 = no completed wonder. */
  wonderT: [number, number] = [-1, -1];
  /** Encounter sites in the wilds (owner 2), placed during map gen. */
  sites: EncounterSite[] = [];

  constructor(playerFaction: Faction, aiFaction: Faction, aiGatherMul: number) {
    this.players = [
      this.makePlayer(playerFaction, 1),
      this.makePlayer(aiFaction, aiGatherMul),
      // The wilds: a faction-less third power. Its "faction" only feeds
      // cosmetic code paths; wilds models ignore it entirely.
      this.makePlayer('rome', 1)
    ];
  }

  private makePlayer(faction: Faction, gatherMul: number): PlayerState {
    return {
      faction,
      res: { food: 300, wood: 200, stone: 60, gold: 100 },
      popUsed: 0, popCap: 0,
      techs: new Set(),
      stats: { trained: 0, lost: 0, kills: 0, razed: 0, gathered: { food: 0, wood: 0, stone: 0, gold: 0 } },
      gatherMul,
      level: 0,
      built: {},
      laborOn: false,
      laborWeights: { food: 0.4, wood: 0.3, gold: 0.2, stone: 0.1 },
      boons: {}
    };
  }

  // ---------- Boons (encounter rewards) ----------
  hasBoon(owner: number, id: string): boolean {
    return (this.players[owner].boons[id] ?? 0) > this.time;
  }

  grantBoon(owner: number, id: string) {
    const def = BOONS[id];
    if (!def) return;
    const p = this.players[owner];
    p.boons[id] = def.dur > 0 ? this.time + def.dur : Infinity;
    // Pelts harden villagers already in the field, like a researched tech.
    if (id === 'pelts') {
      for (const u of this.units.values()) {
        if (u.owner !== owner || u.type !== 'villager') continue;
        const s = this.unitStats(owner, u.type);
        u.hp += Math.max(0, s.hp - u.maxHp);
        u.maxHp = s.hp;
      }
    }
    if (owner === 0) {
      this.emit({ t: 'toast', owner: 0, msg: `${def.name} — ${def.desc}`, kind: 'good' });
    }
  }

  /** Track completed buildings by type (auras: amphitheater, lighthouse, forum). */
  noteBuilt(owner: number, type: BuildingTypeId, delta: number) {
    const b = this.players[owner].built;
    b[type] = Math.max(0, (b[type] ?? 0) + delta);
  }
  hasBuilt(owner: number, type: BuildingTypeId): boolean {
    return (this.players[owner].built[type] ?? 0) > 0;
  }

  /** Is this building/unit/tech unlocked by the owner's settlement level? */
  levelOk(owner: number, needed: number): boolean {
    return this.players[owner].level >= needed;
  }

  nextLevel(owner: number): number {
    return Math.min(MAX_LEVEL, this.players[owner].level + 1);
  }

  emit(e: SimEvent) { this.events.push(e); }
  drainEvents(): SimEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  // ---------- Derived stats (faction bonuses + techs) ----------
  unitStats(owner: number, type: UnitTypeId) {
    const d = UNITS[type];
    const p = this.players[owner];
    const f = FACTIONS[p.faction];
    let hp = d.hp, atk = d.atk, speed = d.speed;
    let meleeArmor = d.meleeArmor, pierceArmor = d.pierceArmor;
    const isMil = type !== 'villager' && type !== 'boat' && type !== 'tradecart';
    if (isMil && f.bonus.unitHpMul) hp *= f.bonus.unitHpMul;
    if (isMil && p.techs.has('bronze')) atk *= 1.25;
    if (isMil && p.techs.has('shields')) { meleeArmor += 1; pierceArmor += 1; hp *= 1.15; }
    if (type === 'villager' && p.techs.has('wheel')) speed *= 1.2;
    if (type === 'villager' && this.hasBoon(owner, 'pelts')) hp *= 1.25;
    if (type === 'boat' && this.hasBuilt(owner, 'lighthouse')) speed *= 1.2;
    // The amphitheater's games embolden everyone (non-stacking).
    if (atk > 0 && this.hasBuilt(owner, 'amphitheater')) atk *= 1.3;
    return { hp: Math.round(hp), atk, meleeArmor, pierceArmor, speed };
  }

  buildingHp(owner: number, type: BuildingTypeId): number {
    const p = this.players[owner];
    const f = FACTIONS[p.faction];
    let hp = BUILDINGS[type].hp;
    if (p.techs.has('masonry')) hp *= 1.25;
    if ((type === 'tower' || type === 'wall') && f.bonus.towerWallHpMul) hp *= f.bonus.towerWallHpMul;
    return Math.round(hp);
  }

  /**
   * Damage a building soaks from blades and arrows. Masonry thickens the walls;
   * siege damage bypasses this entirely (see `resolveDamage`).
   */
  buildingArmor(owner: number, type: BuildingTypeId): number {
    const base = BUILDINGS[type].armor ?? 0;
    if (base <= 0) return 0;
    return base + (this.players[owner].techs.has('masonry') ? 1 : 0);
  }

  /** How far a building lifts the fog. Egypt's Cartography sharpens its Obelisks. */
  buildingVision(owner: number, type: BuildingTypeId): number {
    const base = BUILDINGS[type].vision ?? 7.5;
    if (type === 'obelisk' && this.players[owner].techs.has('cartography')) return base * 1.6;
    return base;
  }

  buildingCost(owner: number, type: BuildingTypeId): Cost {
    const p = this.players[owner];
    const f = FACTIONS[p.faction];
    const base = BUILDINGS[type].cost;
    const out: Cost = {};
    let mul = f.bonus.buildingCostMul ?? 1;
    if (type === 'farm' && f.bonus.farmCostMul) mul = f.bonus.farmCostMul;
    // Greece quarries its own marble: the stone component of every price falls.
    const stoneMul = p.techs.has('marble') ? 0.85 : 1;
    for (const k in base) {
      const r = k as ResType;
      out[r] = Math.round((base[r] ?? 0) * mul * (r === 'stone' ? stoneMul : 1));
    }
    return out;
  }

  carryCap(owner: number): number {
    return CARRY_CAP + (this.players[owner].techs.has('wheel') ? 4 : 0);
  }

  gatherRate(owner: number, kind: NodeKind | 'farm'): number {
    const p = this.players[owner];
    const f = FACTIONS[p.faction];
    let r = kind === 'farm' ? 0.75 : GATHER_RATE[kind];
    const res = kind === 'farm' ? 'food' : RES_OF_NODE[kind];
    if (res === 'food' && f.bonus.foodRateMul) r *= f.bonus.foodRateMul;
    if (kind === 'farm' && p.techs.has('irrigation')) r *= 1.25;
    if (kind === 'stone' && p.techs.has('marble')) r *= 1.25;
    if (kind === 'fish' && this.hasBuilt(owner, 'lighthouse')) r *= 1.3;
    return r * p.gatherMul;
  }

  buildRate(owner: number): number {
    const base = FACTIONS[this.players[owner].faction].bonus.buildRateMul ?? 1;
    return base * (this.hasBoon(owner, 'gratitude') ? 1.2 : 1);
  }

  canAfford(owner: number, c: Cost): boolean {
    const r = this.players[owner].res;
    for (const k in c) if (r[k as ResType] < (c[k as ResType] ?? 0)) return false;
    return true;
  }
  pay(owner: number, c: Cost) {
    const r = this.players[owner].res;
    for (const k in c) r[k as ResType] -= c[k as ResType] ?? 0;
  }
  refund(owner: number, c: Cost, frac: number) {
    const r = this.players[owner].res;
    for (const k in c) r[k as ResType] += Math.floor((c[k as ResType] ?? 0) * frac);
  }

  // ---------- Entity creation ----------
  spawnUnit(owner: number, type: UnitTypeId, x: number, z: number): Unit {
    const s = this.unitStats(owner, type);
    const u: Unit = {
      id: this.nextId++, owner, type,
      x, z, px: x, pz: z, dir: Math.random() * Math.PI * 2,
      hp: s.hp, maxHp: s.hp,
      task: { type: 'idle' }, resume: null,
      path: null, pathI: 0, pathGoal: null, repathT: 0,
      carryKind: null, carryAmt: 0, gatherT: 0, slot: -1,
      cooldown: 0, attackAnimT: 99, scanT: Math.random() * 0.5,
      lastHitT: -99, idleT: 0, water: !!UNITS[type].water, stuckT: 0,
      hold: false, post: null, speedAura: 1
    };
    this.units.set(u.id, u);
    this.players[owner].popUsed += UNITS[type].pop;
    return u;
  }

  placeBuilding(owner: number, type: BuildingTypeId, cx: number, cz: number, prebuilt = false, rot = 0): Building {
    const def = BUILDINGS[type];
    const maxHp = this.buildingHp(owner, type);
    const b: Building = {
      id: this.nextId++, owner, type, cx, cz, size: def.size,
      x: cx + def.size / 2, z: cz + def.size / 2, rot,
      hp: prebuilt ? maxHp : Math.max(1, Math.round(maxHp * 0.08)),
      maxHp,
      built: prebuilt, progress: prebuilt ? 1 : 0,
      queue: [], rally: null, cooldown: 0, attackAnimT: 99, lastHitT: -99,
      farmFood: def.farm ? FARM_FOOD : 0, withered: false, workerId: 0,
      trickleT: 0
    };
    this.buildings.set(b.id, b);
    // Civic scenery is built over without ceremony.
    clearCivicUnder(this, cx, cz, def.size);
    if (!def.walkable) {
      // Every wall segment doubles as a gatehouse for its owner.
      const flags = F_BUILDING | (type === 'wall' ? (owner === 0 ? F_WALL0 : F_WALL1) : 0);
      for (let z = cz; z < cz + def.size; z++)
        for (let x = cx; x < cx + def.size; x++)
          this.grid[z * MAP_W + x] |= flags;
    }
    if (prebuilt) {
      if (def.pop) this.players[owner].popCap = Math.min(POP_MAX, this.players[owner].popCap + def.pop);
      this.noteBuilt(owner, type, 1);
    }
    if (isTownCenter(type)) this.refreshTcPos(owner);
    return b;
  }

  /**
   * Hand a standing building to a new owner, as when a ruined fort is claimed.
   * Max HP is recomputed against the new owner's faction and techs, and the
   * wound it was carrying is preserved as a fraction — taking a fort does not
   * repair it.
   */
  reassignBuilding(b: Building, owner: number) {
    if (b.owner === owner) return;
    const def = BUILDINGS[b.type];
    const frac = b.maxHp > 0 ? b.hp / b.maxHp : 1;
    if (b.built) {
      this.noteBuilt(b.owner, b.type, -1);
      if (def.pop) {
        const old = this.players[b.owner];
        old.popCap = Math.max(0, old.popCap - def.pop);
      }
    }
    // Walls gate for their owner, so the pass-through flag has to move too.
    if (b.type === 'wall') {
      for (let z = b.cz; z < b.cz + b.size; z++) {
        for (let x = b.cx; x < b.cx + b.size; x++) {
          const i = z * MAP_W + x;
          this.grid[i] &= ~(F_WALL0 | F_WALL1);
          this.grid[i] |= owner === 0 ? F_WALL0 : F_WALL1;
        }
      }
    }
    b.owner = owner;
    b.rally = null;
    b.queue.length = 0;
    b.maxHp = this.buildingHp(owner, b.type);
    b.hp = Math.max(1, Math.round(b.maxHp * frac));
    if (b.built) {
      this.noteBuilt(owner, b.type, 1);
      if (def.pop) {
        const p = this.players[owner];
        p.popCap = Math.min(POP_MAX, p.popCap + def.pop);
      }
    }
    this.emit({ t: 'upgrade', id: b.id, owner, bType: b.type, x: b.x, z: b.z });
  }

  /** Keep tcPos pointing at a living town center (used for AI targeting and fleeing). */
  refreshTcPos(owner: number) {
    let fallback: Building | null = null;
    for (const b of this.buildings.values()) {
      if (b.owner !== owner || !isTownCenter(b.type)) continue;
      if (b.built) { this.tcPos[owner] = { x: b.x, z: b.z }; return; }
      fallback = b;
    }
    if (fallback) this.tcPos[owner] = { x: fallback.x, z: fallback.z };
  }

  countTownCenters(owner: number): number {
    let n = 0;
    for (const b of this.buildings.values()) {
      if (b.owner === owner && isTownCenter(b.type)) n++;
    }
    return n;
  }

  addNode(kind: NodeKind, cx: number, cz: number, variant = 0, amountMul = 1): ResourceNode {
    const n: ResourceNode = {
      id: this.nextId++, kind, cx, cz,
      x: cx + 0.5, z: cz + 0.5,
      amount: Math.round(NODE_AMOUNT[kind] * amountMul), max: Math.round(NODE_AMOUNT[kind] * amountMul),
      gatherers: 0, variant
    };
    this.nodes.set(n.id, n);
    if (kind !== 'fish') this.grid[cz * MAP_W + cx] |= F_BLOCK;
    return n;
  }

  removeNode(n: ResourceNode) {
    this.nodes.delete(n.id);
    if (n.kind !== 'fish') this.grid[n.cz * MAP_W + n.cx] &= ~F_BLOCK;
    this.emit({ t: 'nodeDepleted', nodeId: n.id, kind: n.kind, x: n.x, z: n.z });
  }

  removeBuilding(b: Building, refundFrac = 0) {
    const def = BUILDINGS[b.type];
    if (!def.walkable) {
      const flags = F_BUILDING | (b.type === 'wall' ? (F_WALL0 | F_WALL1) : 0);
      for (let z = b.cz; z < b.cz + b.size; z++)
        for (let x = b.cx; x < b.cx + b.size; x++)
          this.grid[z * MAP_W + x] &= ~flags;
    }
    const p = this.players[b.owner];
    if (b.built && def.pop) p.popCap = Math.max(0, p.popCap - def.pop);
    if (b.built) this.noteBuilt(b.owner, b.type, -1);
    if (b.type === 'wonder' && this.wonderT[b.owner] >= 0) {
      this.wonderT[b.owner] = -1;
      this.emit({ t: 'wonderEnd', owner: b.owner, destroyed: true });
    }
    if (refundFrac > 0) this.refund(b.owner, this.buildingCost(b.owner, b.type), refundFrac);
    // Free any farm worker
    if (b.workerId) {
      const w = this.units.get(b.workerId);
      if (w && w.task.type === 'farm') w.task = { type: 'idle' };
    }
    // Cancel queue (units refund + release their pop reservation)
    for (const q of b.queue) {
      if (q.kind === 'unit' && q.unit) {
        this.refund(b.owner, UNITS[q.unit].cost, 1);
        p.popUsed = Math.max(0, p.popUsed - UNITS[q.unit].pop);
      }
      if (q.kind === 'research' && q.tech) this.refund(b.owner, TECHS[q.tech].cost, 1);
      // Growth is paid for up front and is the costliest thing in the queue.
      // Losing the building carrying it used to end the match, so swallowing
      // the payment never showed; a settlement can hold several town centers
      // now, and demolishing one to reposition it must not burn the treasury.
      if (q.kind === 'level' && q.level !== undefined) {
        this.refund(b.owner, SETTLEMENTS[q.level].cost, 1);
      }
      if (q.kind === 'upgrade' && q.to) this.refund(b.owner, this.buildingCost(b.owner, q.to), 1);
    }
    this.buildings.delete(b.id);
  }

  killUnit(u: Unit, byOwner = -1) {
    if (!this.units.has(u.id)) return;
    this.units.delete(u.id);
    const p = this.players[u.owner];
    p.popUsed = Math.max(0, p.popUsed - UNITS[u.type].pop);
    p.stats.lost++;
    if (byOwner >= 0 && byOwner !== u.owner) this.players[byOwner].stats.kills++;
    // Release farm slot
    if (u.task.type === 'farm') {
      const f = this.buildings.get(u.task.bId);
      if (f && f.workerId === u.id) f.workerId = 0;
    }
    if (u.task.type === 'gather') {
      const n = this.nodes.get(u.task.nodeId);
      if (n) n.gatherers = Math.max(0, n.gatherers - 1);
    }
    this.emit({ t: 'die', id: u.id, x: u.x, z: u.z, unitType: u.type, owner: u.owner });
  }

  destroyBuilding(b: Building, byOwner = -1) {
    if (!this.buildings.has(b.id)) return;
    if (byOwner >= 0 && byOwner !== b.owner) this.players[byOwner].stats.razed++;
    this.emit({ t: 'boom', id: b.id, x: b.x, z: b.z, size: b.size, bType: b.type, owner: b.owner });
    this.removeBuilding(b);
    if (isTownCenter(b.type)) this.checkTownCenters(b.owner);
  }

  /** A civilization falls when its last town center is gone. */
  private checkTownCenters(owner: number) {
    if (this.countTownCenters(owner) > 0) {
      this.refreshTcPos(owner);
      return;
    }
    if (this.winner < 0) {
      this.winner = owner === 0 ? 1 : 0;
      this.emit({ t: 'victory', winner: this.winner });
    }
  }

  // ---------- Placement validation ----------
  canPlace(owner: number, type: BuildingTypeId, cx: number, cz: number): { ok: boolean; reason?: string } {
    const def = BUILDINGS[type];
    if (!availableTo(def, this.players[owner].faction))
      return { ok: false, reason: 'Not built by your people' };
    if (cx < 1 || cz < 1 || cx + def.size >= MAP_W - 1 || cz + def.size >= MAP_H - 1)
      return { ok: false, reason: 'Out of bounds' };
    let touchesOcean = false;
    for (let z = cz; z < cz + def.size; z++) {
      for (let x = cx; x < cx + def.size; x++) {
        const v = this.grid[z * MAP_W + x];
        if (v & (F_BLOCK | F_BUILDING)) return { ok: false, reason: 'Blocked terrain' };
        if (v & F_WATER) return { ok: false, reason: 'Cannot build on water' };
        if (owner === 0 && !this.explored[z * MAP_W + x]) return { ok: false, reason: 'Unexplored area' };
      }
    }
    if (def.needsShore) {
      for (let z = cz - 1; z <= cz + def.size; z++) {
        for (let x = cx - 1; x <= cx + def.size; x++) {
          if (x < 0 || z < 0 || x >= MAP_W || z >= MAP_H) continue;
          const v = this.grid[z * MAP_W + x];
          if ((v & F_WATER) && this.waterRegion[z * MAP_W + x] === 1) touchesOcean = true;
        }
      }
      if (!touchesOcean) return { ok: false, reason: 'Must touch the sea' };
    }
    // Walkable buildings (plazas) leave the grid clear, so check footprint
    // overlap against existing buildings explicitly.
    for (const other of this.buildings.values()) {
      if (cx < other.cx + other.size && cx + def.size > other.cx &&
          cz < other.cz + other.size && cz + def.size > other.cz)
        return { ok: false, reason: 'Blocked by a building' };
    }
    // Don't allow walling a unit inside the footprint (flat plazas don't care)
    if (!def.walkable) {
      for (const u of this.units.values()) {
        if (u.water) continue;
        if (u.x >= cx - 0.2 && u.x <= cx + def.size + 0.2 && u.z >= cz - 0.2 && u.z <= cz + def.size + 0.2)
          return { ok: false, reason: 'A unit is in the way' };
      }
    }
    return { ok: true };
  }

  /** Player/AI places a construction site. Pays cost. */
  tryPlaceBuilding(owner: number, type: BuildingTypeId, cx: number, cz: number, rot = 0): Building | null {
    if (!this.levelOk(owner, BUILDINGS[type].level)) {
      if (owner === 0) {
        this.emit({ t: 'toast', owner, msg: `Requires a ${SETTLEMENTS[BUILDINGS[type].level].name}`, kind: 'warn' });
      }
      return null;
    }
    const chk = this.canPlace(owner, type, cx, cz);
    if (!chk.ok) {
      if (owner === 0) this.emit({ t: 'toast', owner, msg: chk.reason ?? 'Cannot build here', kind: 'warn' });
      return null;
    }
    const cost = this.buildingCost(owner, type);
    if (!this.canAfford(owner, cost)) {
      if (owner === 0) this.emit({ t: 'toast', owner, msg: 'Not enough resources', kind: 'warn' });
      return null;
    }
    this.pay(owner, cost);
    const b = this.placeBuilding(owner, type, cx, cz, false, rot);
    this.emit({ t: 'place', owner, x: b.x, z: b.z });
    // Units whose path crosses the new footprint will repath on their own.
    return b;
  }

  // ---------- Commands ----------
  cmdMove(ids: number[], x: number, z: number, attackMove = false) {
    const movers = ids.map(id => this.units.get(id)).filter((u): u is Unit => !!u);
    if (movers.length === 0) return;
    const slots = formationSlots(x, z, movers.length);
    movers.sort((a, b) => dist2(a.x, a.z, x, z) - dist2(b.x, b.z, x, z));
    for (let i = 0; i < movers.length; i++) {
      const u = movers[i];
      this.releaseTask(u);
      const s = slots[Math.min(i, slots.length - 1)];
      u.task = { type: 'move', x: s.x, z: s.z, attackMove };
      u.resume = attackMove ? { x: s.x, z: s.z, attackMove: true } : null;
      u.hold = false;
      u.post = { x: s.x, z: s.z };  // guard the destination once they arrive
      u.path = null; u.pathGoal = null;
    }
  }

  cmdGather(ids: number[], nodeId: number) {
    const n = this.nodes.get(nodeId);
    if (!n) return;
    for (const id of ids) {
      const u = this.units.get(id);
      if (!u) continue;
      if (u.type === 'villager' && n.kind !== 'fish') {
        this.releaseTask(u);
        u.task = { type: 'gather', nodeId };
        u.path = null; u.pathGoal = null;
      } else if (u.type === 'boat' && n.kind === 'fish') {
        this.releaseTask(u);
        u.task = { type: 'gather', nodeId };
        u.path = null; u.pathGoal = null;
      } else if (!u.water) {
        this.releaseTask(u);
        u.task = { type: 'move', x: n.x, z: n.z };
        u.path = null; u.pathGoal = null;
      }
    }
  }

  cmdAttack(ids: number[], targetId: number) {
    // Treasure props aren't fights: tapping a cairn or the idol walks you there,
    // and the encounter takes over once someone is close enough.
    const tb = this.buildings.get(targetId);
    if (tb && tb.owner === WILDS && (tb.type === 'cairn' || tb.type === 'pedestal')) {
      this.cmdMove(ids, tb.x, tb.z + tb.size / 2 + 0.4, false);
      return;
    }
    for (const id of ids) {
      const u = this.units.get(id);
      if (!u || u.type === 'boat' || u.type === 'tradecart') continue;
      if (u.type === 'refugee' || u.type === 'gazelle') continue;
      this.releaseTask(u);
      u.task = { type: 'attack', targetId };
      u.resume = null;
      u.hold = false;
      u.post = null;   // a direct order overrides the leash
      u.path = null; u.pathGoal = null;
    }
  }

  cmdBuild(ids: number[], bId: number) {
    const b = this.buildings.get(bId);
    if (!b) return;
    for (const id of ids) {
      const u = this.units.get(id);
      if (!u || u.type !== 'villager') continue;
      this.releaseTask(u);
      u.task = { type: 'build', bId };
      u.path = null; u.pathGoal = null;
    }
  }

  cmdFarm(ids: number[], bId: number) {
    const b = this.buildings.get(bId);
    if (!b || !BUILDINGS[b.type].farm) return;
    for (const id of ids) {
      const u = this.units.get(id);
      if (!u || u.type !== 'villager') continue;
      if (b.workerId && b.workerId !== u.id) continue; // one farmer per farm
      this.releaseTask(u);
      b.workerId = u.id;
      u.task = { type: 'farm', bId };
      u.path = null; u.pathGoal = null;
    }
  }

  releaseTask(u: Unit) {
    if (u.task.type === 'gather') {
      const n = this.nodes.get(u.task.nodeId);
      if (n) n.gatherers = Math.max(0, n.gatherers - 1);
      u.slot = -1;
    }
    if (u.task.type === 'farm') {
      const f = this.buildings.get(u.task.bId);
      if (f && f.workerId === u.id) f.workerId = 0;
    }
  }

  startTrain(bId: number, type: UnitTypeId): boolean {
    const b = this.buildings.get(bId);
    if (!b || !b.built) return false;
    if (!this.levelOk(b.owner, UNITS[type].level)) {
      if (b.owner === 0) {
        this.emit({ t: 'toast', owner: 0, msg: `Requires a ${SETTLEMENTS[UNITS[type].level].name}`, kind: 'warn' });
      }
      return false;
    }
    if (b.queue.length >= 5) {
      if (b.owner === 0) this.emit({ t: 'toast', owner: 0, msg: 'Queue is full', kind: 'warn' });
      return false;
    }
    const def = UNITS[type];
    const p = this.players[b.owner];
    if (p.popUsed + def.pop > p.popCap) {
      if (b.owner === 0) this.emit({ t: 'toast', owner: 0, msg: 'Build more houses', kind: 'warn' });
      return false;
    }
    if (!this.canAfford(b.owner, def.cost)) {
      if (b.owner === 0) this.emit({ t: 'toast', owner: 0, msg: 'Not enough resources', kind: 'warn' });
      return false;
    }
    this.pay(b.owner, def.cost);
    // Reserve pop while queued so you can't overqueue
    p.popUsed += def.pop;
    b.queue.push({ kind: 'unit', unit: type, t: 0, total: def.trainTime });
    return true;
  }

  /** Begin growing the settlement to the next level at a town center. */
  startLevelUp(bId: number): boolean {
    const b = this.buildings.get(bId);
    if (!b || !b.built || !isTownCenter(b.type)) return false;
    const p = this.players[b.owner];
    const target = p.level + 1;
    if (target > MAX_LEVEL) return false;
    // only one settlement upgrade at a time, anywhere
    for (const other of this.buildings.values()) {
      if (other.owner === b.owner && other.queue.some(q => q.kind === 'level')) return false;
    }
    const def = SETTLEMENTS[target];
    if (!this.canAfford(b.owner, def.cost)) {
      if (b.owner === 0) this.emit({ t: 'toast', owner: 0, msg: 'Not enough resources', kind: 'warn' });
      return false;
    }
    this.pay(b.owner, def.cost);
    b.queue.push({ kind: 'level', level: target, t: 0, total: def.time });
    return true;
  }

  /**
   * Where a technology is studied. A town center that has become an Acropolis
   * is still the place its civilization keeps The Wheel and Masonry — but the
   * reverse does not hold: what the Acropolis teaches, only it teaches.
   */
  researchedAt(tech: { at: BuildingTypeId }, type: BuildingTypeId): boolean {
    return tech.at === type || (tech.at === 'towncenter' && isTownCenter(type));
  }

  startResearch(bId: number, techId: string): boolean {
    const b = this.buildings.get(bId);
    const tech = TECHS[techId];
    if (!b || !b.built || !tech) return false;
    const p = this.players[b.owner];
    if (!availableTo(tech, p.faction)) return false;
    if (!this.researchedAt(tech, b.type)) return false;
    if (!this.levelOk(b.owner, tech.level)) {
      if (b.owner === 0) {
        this.emit({ t: 'toast', owner: 0, msg: `Requires a ${SETTLEMENTS[tech.level].name}`, kind: 'warn' });
      }
      return false;
    }
    if (p.techs.has(techId)) return false;
    // Already being studied — anywhere. Checking only this building would let a
    // civilization with three Obelisks pay for Cartography three times over.
    for (const other of this.buildings.values()) {
      if (other.owner !== b.owner) continue;
      if (other.queue.some(q => q.kind === 'research' && q.tech === techId)) return false;
    }
    if (b.queue.length >= 5) return false;
    if (!this.canAfford(b.owner, tech.cost)) {
      if (b.owner === 0) this.emit({ t: 'toast', owner: 0, msg: 'Not enough resources', kind: 'warn' });
      return false;
    }
    this.pay(b.owner, tech.cost);
    b.queue.push({ kind: 'research', tech: techId, t: 0, total: tech.time });
    return true;
  }

  cancelQueueItem(bId: number, idx: number) {
    const b = this.buildings.get(bId);
    if (!b || idx >= b.queue.length) return;
    const q = b.queue[idx];
    if (q.kind === 'unit' && q.unit) {
      this.refund(b.owner, UNITS[q.unit].cost, 1);
      this.players[b.owner].popUsed -= UNITS[q.unit].pop;
    }
    if (q.kind === 'research' && q.tech) this.refund(b.owner, TECHS[q.tech].cost, 1);
    if (q.kind === 'level' && q.level !== undefined) this.refund(b.owner, SETTLEMENTS[q.level].cost, 1);
    if (q.kind === 'upgrade' && q.to) this.refund(b.owner, this.buildingCost(b.owner, q.to), 1);
    b.queue.splice(idx, 1);
  }

  /** Begin upgrading a building in place (shrine -> temple). */
  startUpgrade(bId: number): boolean {
    const b = this.buildings.get(bId);
    if (!b || !b.built) return false;
    const to = BUILDINGS[b.type].upgradesTo;
    if (!to) return false;
    const def = BUILDINGS[to];
    if (!availableTo(def, this.players[b.owner].faction)) return false;
    if (!this.levelOk(b.owner, def.level)) {
      if (b.owner === 0) {
        this.emit({ t: 'toast', owner: 0, msg: `Requires a ${SETTLEMENTS[def.level].name}`, kind: 'warn' });
      }
      return false;
    }
    if (b.queue.some(q => q.kind === 'upgrade')) return false;
    // Priced like any other construction, so faction discounts and Marble
    // Quarry reach it too — the tech tree quotes this number.
    const cost = this.buildingCost(b.owner, to);
    if (!this.canAfford(b.owner, cost)) {
      if (b.owner === 0) this.emit({ t: 'toast', owner: 0, msg: 'Not enough resources', kind: 'warn' });
      return false;
    }
    this.pay(b.owner, cost);
    b.queue.push({ kind: 'upgrade', to, t: 0, total: def.buildTime });
    return true;
  }

  /** Market exchange: swap a lot of a resource for gold, or gold for it. */
  marketTrade(owner: number, res: ResType, dir: 'sell' | 'buy'): boolean {
    if (res === 'gold') return false;
    const p = this.players[owner];
    if (dir === 'sell') {
      if (p.res[res] < MARKET_LOT) {
        if (owner === 0) this.emit({ t: 'toast', owner: 0, msg: `Not enough ${res}`, kind: 'warn' });
        return false;
      }
      p.res[res] -= MARKET_LOT;
      p.res.gold += MARKET_SELL_GOLD;
    } else {
      if (p.res.gold < MARKET_BUY_GOLD) {
        if (owner === 0) this.emit({ t: 'toast', owner: 0, msg: 'Not enough gold', kind: 'warn' });
        return false;
      }
      p.res.gold -= MARKET_BUY_GOLD;
      p.res[res] += MARKET_LOT;
    }
    return true;
  }

  /** Pay the deserters at a camp site: its mercenaries join the player. */
  hireMercs(siteId: number): boolean {
    const site = this.sites.find(s => s.id === siteId);
    if (!site || site.kind !== 'camp' || site.state === 'cleared' || site.provokedBy === 0) return false;
    const mercs = site.unitIds
      .map(id => this.units.get(id))
      .filter((u): u is Unit => !!u);
    if (mercs.length === 0) return false;
    if (this.players[0].res.gold < ENC.mercPrice) {
      this.emit({ t: 'toast', owner: 0, msg: 'Not enough gold', kind: 'warn' });
      return false;
    }
    this.players[0].res.gold -= ENC.mercPrice;
    for (const u of mercs) {
      this.releaseTask(u);
      this.players[WILDS].popUsed = Math.max(0, this.players[WILDS].popUsed - UNITS[u.type].pop);
      u.owner = 0;
      this.players[0].popUsed += UNITS[u.type].pop;
      const s = this.unitStats(0, u.type);
      u.hp = Math.min(s.hp, u.hp + (s.hp - u.maxHp));
      u.maxHp = s.hp;
      u.task = { type: 'idle' };
      u.post = null;
      u.resume = null;
      u.hold = false;
      u.path = null;
    }
    site.state = 'cleared';
    site.unitIds = [];
    this.emit({ t: 'siteCleared', kind: 'camp', x: site.x, z: site.z, owner: 0 });
    this.emit({
      t: 'toast', owner: 0,
      msg: `${mercs.length} mercenar${mercs.length === 1 ? 'y joins' : 'ies join'} your banner`, kind: 'good'
    });
    return true;
  }

  /** Send trade carts on their route (market <-> trading post). */
  cmdTrade(ids: number[], marketId: number) {
    const m = this.buildings.get(marketId);
    if (!m || m.type !== 'market' || !this.tradePost) return;
    for (const id of ids) {
      const u = this.units.get(id);
      if (!u || u.type !== 'tradecart') continue;
      this.releaseTask(u);
      u.task = { type: 'trade', marketId, loaded: false };
      u.path = null; u.pathGoal = null;
    }
  }

  /** Toggle hold-position on a selection. Returns the resulting state. */
  cmdHold(ids: number[], value?: boolean): boolean {
    const units = ids.map(id => this.units.get(id)).filter((u): u is Unit => !!u);
    const next = value !== undefined ? value : !units.every(u => u.hold);
    for (const u of units) {
      u.hold = next;
      if (next) {
        u.post = { x: u.x, z: u.z };
        if (u.task.type === 'move') { u.task = { type: 'idle' }; u.path = null; }
      } else {
        u.post = null;
      }
    }
    return next;
  }

  /** Send villagers/boats to the most sensible nearby resource. */
  cmdAutoGather(ids: number[]) {
    for (const id of ids) {
      const u = this.units.get(id);
      if (!u) continue;
      if (u.type === 'boat') {
        const fish = this.findNearestNode(u.x, u.z, 'fish', 40);
        if (fish) this.cmdGather([u.id], fish.id);
        continue;
      }
      if (u.type !== 'villager') continue;
      // an idle farm first, then the closest node of any kind
      let bestFarm: Building | null = null, bestFarmD = 26 * 26;
      for (const b of this.buildings.values()) {
        if (b.owner !== u.owner || !b.built || !BUILDINGS[b.type].farm) continue;
        if (b.workerId && this.units.has(b.workerId)) continue;
        const d = dist2(b.x, b.z, u.x, u.z);
        if (d < bestFarmD) { bestFarmD = d; bestFarm = b; }
      }
      let best: ResourceNode | null = null, bestD = Infinity;
      for (const kind of ['carcass', 'berries', 'tree', 'gold', 'stone'] as NodeKind[]) {
        const n = this.findNearestNode(u.x, u.z, kind, 30);
        if (!n) continue;
        // fresh meat spoils — butcher it before anything else
        const d = dist2(n.x, n.z, u.x, u.z) * (kind === 'carcass' ? 0.5 : kind === 'berries' ? 0.8 : 1);
        if (d < bestD) { bestD = d; best = n; }
      }
      if (bestFarm && bestFarmD < bestD) this.cmdFarm([u.id], bestFarm.id);
      else if (best) this.cmdGather([u.id], best.id);
    }
  }

  /** Ids of the player's villagers that have nothing to do. */
  idleVillagers(owner: number): number[] {
    const out: number[] = [];
    for (const u of this.units.values()) {
      if (u.owner === owner && u.type === 'villager' && u.task.type === 'idle') out.push(u.id);
    }
    return out;
  }

  demolish(bId: number) {
    const b = this.buildings.get(bId);
    if (!b) return;
    this.emit({ t: 'boom', id: b.id, x: b.x, z: b.z, size: b.size, bType: b.type, owner: b.owner });
    this.removeBuilding(b, b.built ? 0.25 : 0.6);
    // Pulling down a town center only ends the match if it was the last one —
    // the same test a razed one gets, now that a settlement can hold several.
    if (isTownCenter(b.type)) this.checkTownCenters(b.owner);
  }

  setRally(bId: number, x: number, z: number) {
    const b = this.buildings.get(bId);
    if (b) b.rally = { x, z };
  }

  // ---------- Queries ----------
  rebuildHash() {
    this.hash.clear();
    for (const u of this.units.values()) {
      const k = hashKey(u.x, u.z);
      let arr = this.hash.get(k);
      if (!arr) { arr = []; this.hash.set(k, arr); }
      arr.push(u.id);
    }
    this.buildingHash.clear();
    for (const b of this.buildings.values()) {
      // register every covered hash cell so radius queries find big buildings
      const x0 = (b.cx >> 1), x1 = ((b.cx + b.size - 1) >> 1);
      const z0 = (b.cz >> 1), z1 = ((b.cz + b.size - 1) >> 1);
      for (let hz = z0; hz <= z1; hz++) for (let hx = x0; hx <= x1; hx++) {
        const k = hz * 1024 + hx;
        let arr = this.buildingHash.get(k);
        if (!arr) { arr = []; this.buildingHash.set(k, arr); }
        arr.push(b.id);
      }
    }
  }

  unitsNear(x: number, z: number, r: number, out: Unit[]): Unit[] {
    out.length = 0;
    const x0 = Math.floor((x - r) / 2), x1 = Math.floor((x + r) / 2);
    const z0 = Math.floor((z - r) / 2), z1 = Math.floor((z + r) / 2);
    const r2 = r * r;
    for (let hz = z0; hz <= z1; hz++) {
      for (let hx = x0; hx <= x1; hx++) {
        const arr = this.hash.get(hz * 1024 + hx);
        if (!arr) continue;
        for (const id of arr) {
          const u = this.units.get(id);
          if (u && dist2(u.x, u.z, x, z) <= r2) out.push(u);
        }
      }
    }
    return out;
  }

  /**
   * Is this wilds creature fair game for automatic targeting? Grazing herds
   * and huddled refugees are not; wolves and anything mid-attack are.
   */
  wildThreat(u: Unit): boolean {
    return u.type === 'wolf' || u.task.type === 'attack';
  }

  /** Nearest enemy unit or building within radius. Returns entity id or 0. */
  findEnemy(owner: number, x: number, z: number, r: number, includeVillagers = true, unitsOnly = false): number {
    let bestId = 0, bestD = r * r;
    const tmp: Unit[] = [];
    this.unitsNear(x, z, r, tmp);
    for (const u of tmp) {
      if (u.owner === owner || u.water) continue;
      if (!includeVillagers && u.type === 'villager') continue;
      // Peaceful wilds are attacked by explicit order, never by reflex.
      if (u.owner === WILDS && !this.wildThreat(u)) continue;
      const d = dist2(u.x, u.z, x, z);
      const prio = u.type === 'villager' ? d * 1.6 : d; // prefer soldiers
      if (prio < bestD) { bestD = prio; bestId = u.id; }
    }
    if (bestId || unitsOnly) return bestId;
    return this.findEnemyBuilding(owner, x, z, r);
  }

  /**
   * Nearest enemy building within radius. Siege engines use this directly —
   * they exist to break stone and never chase soft targets.
   */
  /**
   * Is one of this owner's own finished buildings within r? Rome's Roads read
   * this to decide whether a unit is marching on home ground.
   */
  ownBuildingNear(owner: number, x: number, z: number, r: number): boolean {
    const x0 = Math.floor((x - r) / 2), x1 = Math.floor((x + r) / 2);
    const z0 = Math.floor((z - r) / 2), z1 = Math.floor((z + r) / 2);
    const rr = r * r;
    for (let hz = z0; hz <= z1; hz++) for (let hx = x0; hx <= x1; hx++) {
      const arr = this.buildingHash.get(hz * 1024 + hx);
      if (!arr) continue;
      for (const id of arr) {
        const b = this.buildings.get(id);
        if (!b || b.owner !== owner || !b.built) continue;
        if (dist2(b.x, b.z, x, z) <= rr) return true;
      }
    }
    return false;
  }

  findEnemyBuilding(owner: number, x: number, z: number, r: number): number {
    let bestB = 0; let bestBD = r * r * 1.4;
    const x0 = Math.floor((x - r) / 2), x1 = Math.floor((x + r) / 2);
    const z0 = Math.floor((z - r) / 2), z1 = Math.floor((z + r) / 2);
    const seen = new Set<number>();
    for (let hz = z0; hz <= z1; hz++) for (let hx = x0; hx <= x1; hx++) {
      const arr = this.buildingHash.get(hz * 1024 + hx);
      if (!arr) continue;
      for (const id of arr) {
        if (seen.has(id)) continue;
        seen.add(id);
        const b = this.buildings.get(id);
        if (!b || b.owner === owner) continue;
        // Wilds props (dens, camps, cairns) fall to deliberate attacks only.
        if (b.owner === WILDS) continue;
        const d = dist2(b.x, b.z, x, z);
        if (d < bestBD) { bestBD = d; bestB = b.id; }
      }
    }
    return bestB;
  }

  findNearestNode(x: number, z: number, kind: NodeKind, maxR = 26): ResourceNode | null {
    let best: ResourceNode | null = null, bestD = maxR * maxR;
    for (const n of this.nodes.values()) {
      if (n.kind !== kind || n.amount <= 0) continue;
      if (n.kind !== 'fish' && n.gatherers >= 4) continue;
      const d = dist2(n.x, n.z, x, z);
      if (d < bestD) { bestD = d; best = n; }
    }
    return best;
  }

  findNearestDropoff(owner: number, x: number, z: number, water = false): Building | null {
    let best: Building | null = null, bestD = Infinity;
    for (const b of this.buildings.values()) {
      if (b.owner !== owner || !b.built) continue;
      if (!BUILDINGS[b.type].dropoff) continue;
      if (water && b.type !== 'dock') continue;
      const d = dist2(b.x, b.z, x, z);
      if (d < bestD) { bestD = d; best = b; }
    }
    return best;
  }

  entityAt(x: number, z: number): { kind: 'unit' | 'building' | 'node'; id: number } | null {
    // units first (they're small)
    let bestU = 0, bestD = 0.85 * 0.85;
    for (const u of this.units.values()) {
      const d = dist2(u.x, u.z, x, z);
      if (d < bestD) { bestD = d; bestU = u.id; }
    }
    if (bestU) return { kind: 'unit', id: bestU };
    for (const b of this.buildings.values()) {
      if (x >= b.cx - 0.15 && x <= b.cx + b.size + 0.15 && z >= b.cz - 0.15 && z <= b.cz + b.size + 0.15)
        return { kind: 'building', id: b.id };
    }
    let bestN = 0; bestD = 1.1 * 1.1;
    for (const n of this.nodes.values()) {
      const d = dist2(n.x, n.z, x, z);
      if (d < bestD) { bestD = d; bestN = n.id; }
    }
    if (bestN) return { kind: 'node', id: bestN };
    return null;
  }

  requestPath(u: Unit, tx: number, tz: number): boolean {
    const p = findPath(this.grid, u.x, u.z, tx, tz, u.water, u.owner);
    u.path = p;
    u.pathI = 0;
    u.pathGoal = { x: tx, z: tz };
    u.repathT = 0;
    return !!p && p.length > 0;
  }

  freeSpawnCell(b: Building, water = false): Vec2 {
    const ring = ringCells(this.grid, b.cx, b.cz, b.size, water);
    if (ring.length > 0) {
      // prefer cell nearest rally
      const target = b.rally ?? { x: b.x, z: b.z + b.size };
      ring.sort((a, c) => dist2(a.x + 0.5, a.z + 0.5, target.x, target.z) - dist2(c.x + 0.5, c.z + 0.5, target.x, target.z));
      return { x: ring[0].x + 0.5, z: ring[0].z + 0.5 };
    }
    const nf = nearestFree(this.grid, Math.floor(b.x), Math.floor(b.z), water, 8);
    return nf ? { x: nf.x + 0.5, z: nf.z + 0.5 } : { x: b.x, z: b.z + b.size / 2 + 1 };
  }

  markExplored(x: number, z: number, r: number) {
    const x0 = Math.max(0, Math.floor(x - r)), x1 = Math.min(MAP_W - 1, Math.ceil(x + r));
    const z0 = Math.max(0, Math.floor(z - r)), z1 = Math.min(MAP_H - 1, Math.ceil(z + r));
    const r2 = r * r;
    for (let cz = z0; cz <= z1; cz++) {
      for (let cx = x0; cx <= x1; cx++) {
        if (dist2(cx + 0.5, cz + 0.5, x, z) <= r2) this.explored[cz * MAP_W + cx] = 1;
      }
    }
  }

  isExploredWorld(x: number, z: number): boolean {
    const cx = Math.floor(x), cz = Math.floor(z);
    if (cx < 0 || cz < 0 || cx >= MAP_W || cz >= MAP_H) return false;
    return this.explored[cz * MAP_W + cx] === 1;
  }
}

function hashKey(x: number, z: number): number {
  return Math.floor(z / 2) * 1024 + Math.floor(x / 2);
}

/** Loose spiral of standing slots around a destination. */
export function formationSlots(x: number, z: number, count: number): Vec2[] {
  const out: Vec2[] = [{ x, z }];
  let ring = 1;
  while (out.length < count) {
    const n = ring * 6;
    for (let i = 0; i < n && out.length < count; i++) {
      const a = (i / n) * Math.PI * 2 + ring * 0.5;
      out.push({ x: x + Math.cos(a) * ring * 0.85, z: z + Math.sin(a) * ring * 0.85 });
    }
    ring++;
  }
  return out;
}

export { dist };

// Encounters: the neutral wilds (owner 2) and everything the player can find
// in them — game herds, wolf dens, deserters' camps, buried cairns, refugees
// and the Golden Idol. Sites are placed at map gen; this module runs their
// discovery, triggers, behaviors and rewards, plus the boon channel.
//
// The Encounters class is stepped from the main loop like the AIController.
// The exported free functions are hooks called from sim.ts combat code.
import { BOONS, ENC, MAP_H, MAP_W, NODE_AMOUNT, UNITS, WILDS } from '../core/config';
import type { Building, EncounterSite, Unit } from '../core/types';
import { clamp, dist, dist2 } from '../core/utils';
import { landPassable, nearestFree } from './pathfinding';
import type { World } from './world';

const SCAN = 0.5; // seconds between site scans

export class Encounters {
  private scanAcc = 0;

  constructor(private world: World) {}

  step(dt: number) {
    const w = this.world;
    this.updateBoons(dt);
    this.decayCarcasses(dt);
    this.scanAcc += dt;
    if (this.scanAcc < SCAN) return;
    this.scanAcc = 0;
    for (const site of w.sites) {
      if (site.state === 'cleared') continue;
      this.pruneMembers(site);
      this.checkDiscovery(site);
      switch (site.kind) {
        case 'herd': this.stepHerd(site); break;
        case 'den': this.stepDen(site); break;
        case 'camp': this.stepCamp(site); break;
        case 'cache': this.stepCache(site); break;
        case 'refugees': this.stepRefugees(site); break;
        case 'relic': this.stepRelic(site); break;
        case 'outpost': this.stepOutpost(site); break;
      }
    }
  }

  // ---------------- boons ----------------
  private updateBoons(dt: number) {
    const w = this.world;
    for (let owner = 0; owner <= 1; owner++) {
      const p = w.players[owner];
      for (const id in p.boons) {
        const until = p.boons[id];
        if (until !== Infinity && until <= w.time) {
          delete p.boons[id];
          if (owner === 0) {
            w.emit({ t: 'toast', owner: 0, msg: `${BOONS[id].name} fades`, kind: '' });
          }
        }
      }
      // The Golden Idol pays a steady trickle while enshrined.
      if (w.hasBoon(owner, 'idol')) p.res.gold += ENC.idolGoldRate * dt;
    }
  }

  // ---------------- carcasses ----------------
  /** Meat spoils: carcasses shrink away on their own, gathered or not. */
  private decayCarcasses(dt: number) {
    const w = this.world;
    for (const n of w.nodes.values()) {
      if (n.kind !== 'carcass') continue;
      n.amount -= ENC.carcassRotRate * dt;
      if (n.amount <= 0) w.removeNode(n);
    }
  }

  // ---------------- shared site helpers ----------------
  private pruneMembers(site: EncounterSite) {
    const w = this.world;
    if (site.unitIds.length === 0) return;
    site.unitIds = site.unitIds.filter(id => w.units.has(id));
  }

  private checkDiscovery(site: EncounterSite) {
    const w = this.world;
    if (site.discovered) return;
    const cx = clamp(Math.floor(site.x), 0, MAP_W - 1);
    const cz = clamp(Math.floor(site.z), 0, MAP_H - 1);
    if (!w.explored[cz * MAP_W + cx]) return;
    site.discovered = true;
    w.emit({ t: 'siteDiscovered', kind: site.kind, x: site.x, z: site.z, variant: site.variant });
  }

  /** Nearest unit matching a predicate within r of a point, or null. */
  private nearest(x: number, z: number, r: number, pred: (u: Unit) => boolean): Unit | null {
    let best: Unit | null = null, bestD = r * r;
    for (const u of this.world.units.values()) {
      if (!pred(u)) continue;
      const d = dist2(u.x, u.z, x, z);
      if (d < bestD) { bestD = d; best = u; }
    }
    return best;
  }

  /** Idle wilds drift around their anchor so the land feels lived-in. */
  private wander(u: Unit, ax: number, az: number, range: number) {
    if (u.task.type !== 'idle' || u.idleT < 3 + (u.id % 5)) return;
    const a = Math.random() * Math.PI * 2;
    const d = 1.5 + Math.random() * range;
    const tx = clamp(ax + Math.cos(a) * d, 2, MAP_W - 2);
    const tz = clamp(az + Math.sin(a) * d, 2, MAP_H - 2);
    if (!landPassable(this.world.grid, Math.floor(tx), Math.floor(tz))) return;
    u.task = { type: 'move', x: tx, z: tz };
    u.path = null;
    u.idleT = 0;
  }

  /** Send provoked guards at the nearest intruder of the provoking owner. */
  private guardsEngage(site: EncounterSite, range: number) {
    const w = this.world;
    if (site.provokedBy < 0) return;
    for (const id of site.unitIds) {
      const g = w.units.get(id);
      if (!g || g.task.type === 'attack') continue;
      const foe = this.nearest(site.x, site.z, range, u => u.owner === site.provokedBy && !u.water);
      if (!foe) return;
      g.post = { x: site.x, z: site.z };
      g.resume = { x: g.x, z: g.z, attackMove: false };
      g.task = { type: 'attack', targetId: foe.id };
      g.path = null;
    }
  }

  // ---------------- herds ----------------
  private stepHerd(site: EncounterSite) {
    const w = this.world;
    if (site.unitIds.length === 0) { site.state = 'cleared'; return; }
    for (const id of site.unitIds) {
      const u = w.units.get(id)!;
      this.wander(u, site.x, site.z, 5);
    }
  }

  // ---------------- wolf den ----------------
  private stepDen(site: EncounterSite) {
    const w = this.world;
    const den = w.buildings.get(site.buildingId);
    if (!den) { site.state = 'cleared'; return; } // razed hook missed us — be safe
    this.guardsEngage(site, 12);
    for (const id of site.unitIds) {
      const u = w.units.get(id)!;
      this.wander(u, site.x, site.z, 2.5);
    }
    // Raids begin once the den is on someone's map and the early game is over.
    if (!site.discovered || w.time < ENC.wolfRaidGrace) return;
    site.timer -= SCAN;
    if (site.timer > 0) return;
    site.timer = ENC.wolfRaidEvery * (0.8 + Math.random() * 0.4);
    // replenish the pack
    while (site.unitIds.length < ENC.wolfCap) {
      const cell = w.freeSpawnCell(den);
      const wolf = w.spawnUnit(WILDS, 'wolf', cell.x, cell.z);
      wolf.post = { x: site.x, z: site.z };
      site.unitIds.push(wolf.id);
    }
    const prey = this.nearest(site.x, site.z, ENC.wolfRaidRange,
      u => u.owner <= 1 && u.type === 'villager');
    if (!prey) return;
    let sent = 0;
    for (const id of site.unitIds) {
      if (sent >= 2) break;
      const wolf = w.units.get(id)!;
      if (wolf.task.type === 'attack') continue;
      wolf.post = { x: site.x, z: site.z };
      wolf.resume = { x: site.x, z: site.z, attackMove: false };
      wolf.task = { type: 'attack', targetId: prey.id };
      wolf.path = null;
      sent++;
    }
  }

  // ---------------- deserters' camp ----------------
  private stepCamp(site: EncounterSite) {
    const w = this.world;
    const camp = w.buildings.get(site.buildingId);
    if (!camp) { site.state = 'cleared'; return; }
    this.guardsEngage(site, 10);
    for (const id of site.unitIds) {
      const u = w.units.get(id)!;
      this.wander(u, site.x, site.z, 2);
    }
    // The offer stands while the camp is unprovoked and swords remain.
    if (site.provokedBy === 0 || site.unitIds.length === 0 || site.offered) return;
    const visitor = this.nearest(site.x, site.z, ENC.offerR, u => u.owner === 0 && !u.water);
    if (visitor) {
      site.offered = true;
      w.emit({
        t: 'toast', owner: 0,
        msg: `Deserters offer their spears — ${ENC.mercPrice} gold hires ${site.unitIds.length}`, kind: 'good'
      });
    }
  }

  // ---------------- buried cairn ----------------
  private stepCache(site: EncounterSite) {
    const w = this.world;
    const digger = this.nearest(site.x, site.z, ENC.digR, u => u.owner === 0 && u.type === 'villager');
    if (!digger) return;
    if (!site.offered) {
      site.offered = true;
      w.emit({ t: 'toast', owner: 0, msg: 'Your villager digs at the old cairn…', kind: '' });
    }
    site.timer += SCAN;
    if (site.timer < ENC.digTime) return;
    // payout
    const res = (['gold', 'food', 'stone'] as const)[site.variant % 3];
    const amount = res === 'gold' ? 120 : res === 'food' ? 150 : 100;
    w.players[0].res[res] += amount;
    w.emit({ t: 'deposit', owner: 0, res, amount, x: site.x, z: site.z });
    w.emit({ t: 'toast', owner: 0, msg: `+${amount} ${res} unearthed from the cairn`, kind: 'good' });
    site.state = 'cleared';
    w.emit({ t: 'siteCleared', kind: 'cache', x: site.x, z: site.z, owner: 0 });
    const cairn = w.buildings.get(site.buildingId);
    if (cairn) w.destroyBuilding(cairn, -1); // leaves honest rubble where they dug
  }

  // ---------------- refugees ----------------
  private stepRefugees(site: EncounterSite) {
    const w = this.world;
    if (site.state === 'dormant') {
      if (site.unitIds.length === 0) { site.state = 'cleared'; return; }
      for (const id of site.unitIds) this.wander(w.units.get(id)!, site.x, site.z, 1.5);
      const rescuer = this.nearest(site.x, site.z, ENC.refugeeR, u => u.owner === 0 && !u.water);
      if (!rescuer) return;
      site.state = 'active';
      const tc = w.tcPos[0];
      for (const id of site.unitIds) {
        const u = w.units.get(id)!;
        u.owner = 0; // they walk under your banner now (and reveal fog as they go)
        u.task = { type: 'move', x: tc.x + (Math.random() * 4 - 2), z: tc.z + 3 + Math.random() * 2 };
        u.path = null;
      }
      w.emit({ t: 'toast', owner: 0, msg: 'The refugees follow you — see them home', kind: 'good' });
      return;
    }
    // walking home: each refugee that reaches a town center settles as a villager
    for (const id of [...site.unitIds]) {
      const u = w.units.get(id)!;
      if (u.relic) continue; // carrying the idol: let the relic site resolve first
      let home: Building | null = null;
      for (const b of w.buildings.values()) {
        if (b.owner === 0 && b.type === 'towncenter' && b.built &&
            dist(u.x, u.z, b.x, b.z) < b.size / 2 + 1.6) { home = b; break; }
      }
      if (!home) continue;
      w.releaseTask(u);
      w.units.delete(u.id); // no death event: the view quietly swaps the mesh
      w.spawnUnit(0, 'villager', u.x, u.z);
      site.timer++; // counts settled refugees
      site.unitIds = site.unitIds.filter(i => i !== id);
      w.emit({ t: 'toast', owner: 0, msg: 'A refugee settles as a villager', kind: 'good' });
    }
    if (site.unitIds.length === 0) {
      site.state = 'cleared';
      if (site.timer > 0) w.grantBoon(0, 'gratitude');
      w.emit({ t: 'siteCleared', kind: 'refugees', x: site.x, z: site.z, owner: 0 });
    }
  }

  // ---------------- ruined forts ----------------
  /**
   * A fort is claimed by standing in it. One side alone in the yard makes
   * progress; both sides at once and the claim stalls, which is what turns
   * these into somewhere to fight rather than somewhere to walk.
   *
   * Unlike every other site this one never resolves: it can be taken and
   * retaken all match, so the midfield stays worth holding.
   */
  private stepOutpost(site: EncounterSite) {
    const w = this.world;
    const fort = w.buildings.get(site.buildingId);
    if (!fort) { site.state = 'cleared'; return; }   // someone razed it

    let present = -1, contested = false;
    for (const u of w.units.values()) {
      if (u.owner > 1 || u.water) continue;
      if (dist2(u.x, u.z, site.x, site.z) > ENC.captureR * ENC.captureR) continue;
      if (present < 0) present = u.owner;
      else if (present !== u.owner) { contested = true; break; }
    }

    if (contested || present < 0 || present === site.holder) {
      // nobody claiming: the current effort slips back toward neutral
      if (!contested && site.capture > 0) {
        site.capture = Math.max(0, site.capture - ENC.captureDecay * SCAN / ENC.captureTime);
        if (site.capture === 0) site.claimant = -1;
      }
      return;
    }

    if (site.claimant !== present) { site.claimant = present; site.capture = 0; }
    site.capture += SCAN / ENC.captureTime;
    if (site.capture < 1) return;

    // taken
    const prev = site.holder;
    site.holder = present;
    site.capture = 0;
    site.claimant = -1;
    w.reassignBuilding(fort, present);
    if (present === 0) {
      w.markExplored(site.x, site.z, ENC.outpostVision);
      w.emit({
        t: 'toast', owner: 0,
        msg: prev === 1 ? 'You take the ruined fort back' : 'The ruined fort is yours', kind: 'good'
      });
    } else if (prev === 0) {
      w.emit({ t: 'toast', owner: 0, msg: 'The rival has taken your ruined fort', kind: 'warn' });
      w.emit({ t: 'ping', x: site.x, z: site.z, color: '#e05a44' });
    }
    w.emit({ t: 'siteCleared', kind: 'outpost', x: site.x, z: site.z, owner: present });
  }

  // ---------------- the Golden Idol ----------------
  private stepRelic(site: EncounterSite) {
    const w = this.world;
    if (site.carrierId) {
      const carrier = w.units.get(site.carrierId);
      if (!carrier) {
        // the bearer fell — the idol lies where they did
        site.carrierId = 0;
        w.emit({ t: 'relic', phase: 'dropped', x: site.x, z: site.z });
        w.emit({ t: 'toast', owner: 0, msg: 'The Golden Idol lies abandoned!', kind: 'warn' });
        w.emit({ t: 'ping', x: site.x, z: site.z, color: '#f0c05a' });
        return;
      }
      site.x = carrier.x;
      site.z = carrier.z;
      for (const b of w.buildings.values()) {
        if (b.owner === 0 && b.type === 'towncenter' && b.built &&
            dist(carrier.x, carrier.z, b.x, b.z) < b.size / 2 + ENC.relicDepositR) {
          carrier.relic = false;
          site.carrierId = 0;
          site.state = 'cleared';
          w.grantBoon(0, 'idol');
          w.emit({ t: 'relic', phase: 'home', x: b.x, z: b.z });
          w.emit({ t: 'siteCleared', kind: 'relic', x: b.x, z: b.z, owner: 0 });
          return;
        }
      }
      return;
    }
    // waiting on its pedestal (or in the grass where it was dropped)
    const taker = this.nearest(site.x, site.z, ENC.relicPickupR, u => u.owner === 0 && !u.water);
    if (!taker) return;
    site.carrierId = taker.id;
    taker.relic = true;
    const ped = w.buildings.get(site.buildingId);
    if (ped) {
      w.removeBuilding(ped);
      site.buildingId = 0;
      w.emit({ t: 'place', owner: 0, x: site.x, z: site.z }); // a puff of dust as it lifts
    }
    w.emit({ t: 'relic', phase: 'taken', x: site.x, z: site.z });
    w.emit({ t: 'toast', owner: 0, msg: 'The Golden Idol is yours — carry it home!', kind: 'good' });
  }
}

// ---------------------------------------------------------------- sim hooks
/** How a wilds creature answers being hurt. Called from reactToDamage. */
export function wildsReact(world: World, victim: Unit, byOwner: number, fromX: number, fromZ: number) {
  switch (victim.type) {
    case 'gazelle':
    case 'refugee': {
      flee(world, victim, fromX, fromZ);
      // the whole herd startles
      if (victim.type === 'gazelle') {
        for (const u of world.units.values()) {
          if (u.owner === WILDS && u.type === 'gazelle' && u.id !== victim.id &&
              dist2(u.x, u.z, victim.x, victim.z) < 7 * 7) {
            flee(world, u, fromX, fromZ);
          }
        }
      }
      return;
    }
    case 'boar':
    case 'wolf':
    case 'mercenary': {
      if (victim.task.type === 'attack') return;
      const e = world.findEnemy(WILDS, fromX, fromZ, 3.5) ||
        world.findEnemy(WILDS, victim.x, victim.z, 9);
      if (e) {
        victim.resume = victim.post
          ? { x: victim.post.x, z: victim.post.z, attackMove: false }
          : { x: victim.x, z: victim.z, attackMove: false };
        victim.task = { type: 'attack', targetId: e };
        victim.path = null;
      }
      if (victim.type === 'mercenary') provokeSiteOf(world, victim.id, byOwner);
      return;
    }
  }
}

function flee(world: World, u: Unit, fromX: number, fromZ: number) {
  let dx = u.x - fromX, dz = u.z - fromZ;
  const d = Math.hypot(dx, dz) || 1;
  dx /= d; dz /= d;
  // a wounded animal tires: each hit shortens the next dash, so a patient
  // hunter closes the gap instead of chasing forever
  const run = 2.5 + 6 * (u.hp / u.maxHp) + Math.random() * 1.5;
  const tx = clamp(u.x + dx * run + (Math.random() - 0.5) * 3, 2, MAP_W - 2);
  const tz = clamp(u.z + dz * run + (Math.random() - 0.5) * 3, 2, MAP_H - 2);
  const cell = landPassable(world.grid, Math.floor(tx), Math.floor(tz))
    ? { x: Math.floor(tx), z: Math.floor(tz) }
    : nearestFree(world.grid, Math.floor(tx), Math.floor(tz), false, 5);
  if (!cell) return;
  world.releaseTask(u);
  u.task = { type: 'move', x: cell.x + 0.5, z: cell.z + 0.5 };
  u.path = null;
  u.resume = null;
}

function provokeSiteOf(world: World, memberOrBuildingId: number, byOwner: number) {
  if (byOwner < 0 || byOwner > 1) return;
  for (const site of world.sites) {
    if (site.buildingId === memberOrBuildingId || site.unitIds.includes(memberOrBuildingId)) {
      site.provokedBy = byOwner;
      return;
    }
  }
}

/** A wilds building took a hit (but stands): its keepers turn hostile. */
export function onWildsBuildingHit(world: World, b: Building, byOwner: number) {
  provokeSiteOf(world, b.id, byOwner);
}

/** A herd animal died: leave a carcass and put nearby hunters onto it. */
export function onWildsUnitKilled(world: World, u: Unit, byOwner: number) {
  if (u.type !== 'gazelle' && u.type !== 'boar') return;
  let cx = clamp(Math.floor(u.x), 2, MAP_W - 3);
  let cz = clamp(Math.floor(u.z), 2, MAP_H - 3);
  if (!landPassable(world.grid, cx, cz)) {
    const free = nearestFree(world.grid, cx, cz, false, 4);
    if (!free) return;
    cx = free.x; cz = free.z;
  }
  const food = u.type === 'boar' ? ENC.boarFood : ENC.gazelleFood;
  const n = world.addNode('carcass', cx, cz, u.type === 'boar' ? 1 : 0, food / NODE_AMOUNT.carcass);
  // villagers that were hunting it start butchering without another tap
  for (const v of world.units.values()) {
    if (v.type === 'villager' && v.task.type === 'attack' && v.task.targetId === u.id) {
      world.cmdGather([v.id], n.id);
    }
  }
  void byOwner;
}

/** A wilds building fell: pay out whatever it was guarding. */
export function onWildsBuildingRazed(world: World, b: Building, byOwner: number) {
  const site = world.sites.find(s => s.buildingId === b.id);
  if (!site || site.state === 'cleared') return;
  site.state = 'cleared';
  site.buildingId = 0;
  const toPlayer = byOwner === 0;
  switch (site.kind) {
    case 'den':
      if (byOwner === 0 || byOwner === 1) world.grantBoon(byOwner, 'pelts');
      if (toPlayer) {
        world.emit({ t: 'toast', owner: 0, msg: 'The wolves are driven out', kind: 'good' });
      }
      break;
    case 'camp':
      if (byOwner === 0 || byOwner === 1) {
        world.players[byOwner].res.gold += ENC.campLoot;
        if (toPlayer) {
          world.emit({ t: 'deposit', owner: 0, res: 'gold', amount: ENC.campLoot, x: b.x, z: b.z });
          world.emit({ t: 'toast', owner: 0, msg: `+${ENC.campLoot} gold — the deserters' stash`, kind: 'good' });
        }
      }
      break;
    case 'cache':
      if (toPlayer) {
        world.emit({ t: 'toast', owner: 0, msg: 'The cairn is rubble — its secret is lost', kind: 'warn' });
      }
      break;
    case 'relic':
      if (toPlayer && !site.carrierId) {
        world.emit({ t: 'toast', owner: 0, msg: 'The pedestal is smashed — the idol is lost', kind: 'warn' });
      }
      break;
  }
  world.emit({ t: 'siteCleared', kind: site.kind, x: b.x, z: b.z, owner: byOwner });
}

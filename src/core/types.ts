// Shared type definitions for the whole game.

export type Faction = 'egypt' | 'greece' | 'rome';
export type ResType = 'food' | 'wood' | 'stone' | 'gold';
export type UnitTypeId =
  | 'villager' | 'scout' | 'spearman' | 'archer'
  | 'chariot' | 'hoplite' | 'legionary'
  | 'ram' | 'catapult'
  | 'boat' | 'tradecart'
  // gifted by a courted free village, never trained
  | 'slinger'
  // the wilds (owner 2)
  | 'gazelle' | 'boar' | 'wolf' | 'mercenary' | 'refugee';
export type BuildingTypeId =
  | 'towncenter' | 'house' | 'farm' | 'storehouse' | 'barracks'
  | 'range' | 'siegeworks' | 'tower' | 'wall' | 'monument' | 'dock'
  | 'market' | 'shrine' | 'temple' | 'amphitheater' | 'academy'
  | 'statue' | 'garden' | 'plaza' | 'lighthouse' | 'forum' | 'wonder'
  // player-laid stone: a road piece, not a building (see sim/civic.ts)
  | 'causeway'
  // civilization uniques
  | 'obelisk' | 'acropolis' | 'castrum'
  // encounter props (owner 2)
  | 'den' | 'camp' | 'cairn' | 'pedestal' | 'outpost'
  // free villages and the one landmark. The Obelisk of the Lost is a `menhir`
  // here so it does not collide with Egypt's Obelisk above — a standing stone
  // raised over the dead is what it is either way.
  | 'hut' | 'beacon' | 'menhir' | 'spring';

/**
 * What a target *is*, for counter bonuses. Attacks carry a table of flat
 * damage bonuses keyed by the class of whatever they land on.
 */
export type ArmorClass =
  | 'worker'    // villagers, carts, boats, refugees — never the target of counters
  | 'infantry' | 'ranged' | 'cavalry' | 'siege'
  | 'wild'      // animals and deserters
  | 'building';

/**
 * Which armor channel an attack is resolved against. `melee` and `siege` read
 * a unit's melee armor, `pierce` reads its pierce armor; `siege` alone ignores
 * building armor, which is what makes siege engines the answer to stone.
 */
export type DamageType = 'melee' | 'pierce' | 'siege';
export type NodeKind = 'tree' | 'berries' | 'stone' | 'gold' | 'fish' | 'carcass';
export type Difficulty = 'easy' | 'normal' | 'hard';

export interface Vec2 { x: number; z: number }

export const RES_OF_NODE: Record<NodeKind, ResType> = {
  tree: 'wood', berries: 'food', stone: 'stone', gold: 'gold', fish: 'food', carcass: 'food'
};

// ---------- Encounters ----------
export type EncounterKind =
  | 'herd' | 'den' | 'camp' | 'cache' | 'refugees' | 'relic' | 'outpost'
  | 'landmark' | 'village';

/**
 * Which landmark this map rolled. One per match, out in the deep field —
 * the reason to walk to the far corner rather than only to the midfield.
 */
export type LandmarkKind = 'beacon' | 'obelisk' | 'grove' | 'spring';
export const LANDMARK_KINDS: LandmarkKind[] = ['beacon', 'obelisk', 'grove', 'spring'];

/** The prop each landmark stands as. The Amber Grove is trees, and has none. */
export const LANDMARK_BUILDING: Record<LandmarkKind, BuildingTypeId | null> = {
  beacon: 'beacon', obelisk: 'menhir', grove: null, spring: 'spring'
};
export type SiteState = 'dormant' | 'active' | 'cleared';

/** One point of interest in the wilds, placed at map gen. */
export interface EncounterSite {
  id: number;
  kind: EncounterKind;
  x: number; z: number;
  state: SiteState;
  discovered: boolean;   // revealed by the player's fog
  offered: boolean;      // one-shot prompt (merc offer / dig start) fired
  unitIds: number[];     // wilds units bound to this site
  buildingId: number;    // den/camp/cairn/pedestal building, 0 = none
  carrierId: number;     // relic: unit carrying the idol, 0 = none
  provokedBy: number;    // camp/den: owner that drew blood, -1 = neutral
  timer: number;         // raid countdown / dig progress / settled count
  variant: number;       // herd species, cache payload
  /** Outposts: who holds it right now. -1 = nobody, 0 = player, 1 = the rival. */
  holder: number;
  /** Outposts: 0..1 progress the current claimant has made toward taking it. */
  capture: number;
  /** Outposts: which owner is currently making that progress. */
  claimant: number;
  /** Landmarks: which of the four this is. */
  landmark?: LandmarkKind;
  /** Villages: the name their headman gives when you ask. */
  name?: string;
  /** Villages: an owner holding them at spear-point, -1 = nobody. */
  taxedBy?: number;
  /** Villages: owners who sacked one of these and will never be treated with. */
  spurned?: number[];
  /** Landmarks (grove): the nodes it seeded, so it can retire when they run out. */
  nodeIds?: number[];
  /** Bitmask of owners whose scouts have stood here — one rank each, once. */
  seenBy?: number;
  /** Villages: the huts that make it. Raze them all and you have sacked it. */
  hutIds?: number[];
}

// ---------- Tasks ----------
export type Task =
  | { type: 'idle' }
  | { type: 'explore'; x?: number; z?: number }
  | { type: 'move'; x: number; z: number; attackMove?: boolean }
  | { type: 'gather'; nodeId: number }
  | { type: 'farm'; bId: number }
  | { type: 'build'; bId: number }
  | { type: 'attack'; targetId: number }
  | { type: 'deposit'; thenNodeId?: number; thenFarmId?: number }
  | { type: 'trade'; marketId: number; loaded: boolean };

// ---------- Entities ----------
export interface Unit {
  id: number;
  owner: number;            // 0 = player, 1 = AI
  type: UnitTypeId;
  x: number; z: number;
  px: number; pz: number;   // previous tick position (render interpolation)
  dir: number;              // facing, radians
  hp: number;
  maxHp: number;
  task: Task;
  resume?: { x: number; z: number; attackMove: boolean } | null;
  path: Vec2[] | null;
  pathI: number;
  pathGoal: Vec2 | null;
  repathT: number;
  carryKind: NodeKind | null;
  carryAmt: number;
  gatherT: number;
  slot: number;             // gather slot index around node
  cooldown: number;         // attack cooldown remaining
  attackAnimT: number;      // time since last attack fired (for render)
  scanT: number;
  lastHitT: number;         // world.time of last damage taken (render flash)
  idleT: number;
  water: boolean;           // boat
  stuckT: number;
  hold: boolean;            // hold position: fight in place, never chase
  post: Vec2 | null;        // leash anchor while auto-engaging
  relic?: boolean;          // carrying the Golden Idol
  /** Scouts: sites found, up to SCOUT.maxRank. Widens the eye, quickens the step. */
  rank?: number;
  /**
   * Scouts: the Explore order is still standing. Kept across a flight from
   * danger, so a scout that is shot at runs, waits, and then goes back to work
   * rather than standing at home for the rest of the match.
   */
  exploring?: boolean;
  /** Speed multiplier from ground effects (Rome's Roads). Sampled, not per-tick. */
  speedAura: number;
  /**
   * Standing among trees with no enemy near enough to see in: not drawn, not
   * on the minimap, not auto-targeted. Striking or being closed on ends it.
   */
  hidden?: boolean;
}

export interface QueueItem {
  kind: 'unit' | 'research' | 'level' | 'upgrade';
  unit?: UnitTypeId;
  tech?: string;
  level?: number; // target settlement level index
  to?: BuildingTypeId; // upgrade target (e.g. shrine -> temple)
  t: number;      // elapsed
  total: number;  // needed
}

export interface Building {
  id: number;
  owner: number;
  type: BuildingTypeId;
  cx: number; cz: number;   // top-left cell of footprint
  size: number;             // footprint is size x size cells
  x: number; z: number;     // world center
  rot: number;              // visual rotation, quarter turns (0..3)
  hp: number;
  maxHp: number;
  built: boolean;
  progress: number;         // 0..1 construction
  queue: QueueItem[];
  rally: Vec2 | null;
  cooldown: number;         // tower attack
  attackAnimT: number;
  lastHitT: number;
  farmFood: number;         // remaining food (farms)
  withered: boolean;
  workerId: number;         // farm worker (0 = none)
  trickleT: number;         // monument gold trickle accumulator
  /** Adjacency (see sim/districts.ts): extra population this building supports. */
  adjPop: number;
  /** Adjacency: production speed multiplier (drill yard). */
  adjTrain: number;
  /** Adjacency: trade gold multiplier (exchange). */
  adjTrade: number;
  /** Adjacency: farm yield multiplier (field system). */
  adjFarm: number;
  /** Adjacency: heal range multiplier (sacred games). */
  adjHeal: number;
  /** Adjacency: a storehouse standing in a rich seam works as a depot. */
  adjDepot: boolean;
}

export interface ResourceNode {
  id: number;
  kind: NodeKind;
  cx: number; cz: number;
  x: number; z: number;
  amount: number;
  max: number;
  gatherers: number;
  variant: number;
}

export interface Projectile {
  id: number;
  owner: number;
  x: number; y: number; z: number;
  px: number; py: number; pz: number;
  sx: number; sz: number;   // start
  tx: number; tz: number;   // target ground pos
  targetId: number;
  t: number;                // 0..1 progress
  total: number;            // flight seconds
  dmg: number;
  arc: number;
  kind: 'arrow' | 'spear' | 'boulder';
  /** Who loosed it — resolves counter bonuses and splash at impact. Null = a tower. */
  srcType: UnitTypeId | null;
}

// ---------- Events (sim -> presentation) ----------
export type SimEvent =
  | { t: 'hit'; x: number; z: number; y: number; melee: boolean }
  | { t: 'die'; id: number; x: number; z: number; unitType: UnitTypeId; owner: number }
  | { t: 'boom'; id: number; x: number; z: number; size: number; bType: BuildingTypeId; owner: number }
  | { t: 'shoot'; x: number; z: number; heavy?: boolean }
  | { t: 'built'; id: number; owner: number; bType: BuildingTypeId; x: number; z: number }
  | { t: 'trained'; owner: number; unitType: UnitTypeId }
  | { t: 'research'; owner: number; tech: string }
  | { t: 'levelup'; owner: number; level: number }
  | { t: 'deposit'; owner: number; res: ResType; amount: number; x: number; z: number }
  | { t: 'gatherTick'; nodeId: number; kind: NodeKind; x: number; z: number }
  | { t: 'nodeDepleted'; nodeId: number; kind: NodeKind; x: number; z: number }
  | { t: 'underattack'; owner: number; x: number; z: number }
  | { t: 'toast'; owner: number; msg: string; kind?: 'warn' | 'good' | '' }
  | { t: 'siteDiscovered'; kind: EncounterKind; x: number; z: number; variant: number }
  | { t: 'siteCleared'; kind: EncounterKind; x: number; z: number; owner: number }
  | { t: 'relic'; phase: 'taken' | 'dropped' | 'home'; x: number; z: number }
  | { t: 'ping'; x: number; z: number; color: string }
  | { t: 'place'; owner: number; x: number; z: number }
  | { t: 'farmReseed'; owner: number; id: number }
  | { t: 'farmWither'; owner: number; id: number }
  | { t: 'upgrade'; id: number; owner: number; bType: BuildingTypeId; x: number; z: number }
  | { t: 'trade'; owner: number; gold: number; x: number; z: number }
  | { t: 'festival'; owner: number; level: number; x: number; z: number }
  | { t: 'wonderStart'; owner: number }
  | { t: 'wonderEnd'; owner: number; destroyed: boolean }
  | { t: 'victory'; winner: number };

export interface PlayerStats {
  trained: number;
  lost: number;
  kills: number;
  razed: number;
  gathered: Record<ResType, number>;
}

export interface PlayerState {
  faction: Faction;
  res: Record<ResType, number>;
  popUsed: number;
  popCap: number;
  techs: Set<string>;
  stats: PlayerStats;
  gatherMul: number; // AI difficulty handicap/bonus
  level: number;     // settlement level, index into SETTLEMENTS
  /** Completed buildings by type — powers aura effects (amphitheater, lighthouse, forum). */
  built: Partial<Record<BuildingTypeId, number>>;
  /** Labor pool (forum): auto-assign idle villagers by these weights. */
  laborOn: boolean;
  laborWeights: Record<ResType, number>;
  /** Encounter boons: id -> expiry in world time (Infinity = permanent). */
  boons: Record<string, number>;
}

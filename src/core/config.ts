// All game balance data: settlement levels, units, buildings, factions, techs.
import type {
  ArmorClass, BuildingTypeId, DamageType, Difficulty, Faction, NodeKind, ResType, UnitTypeId
} from './types';

export const MAP_W = 264;   // ~10x the area of the original 84x84 battlefield
export const MAP_H = 264;
export const TICK = 1 / 10;         // sim seconds per tick
export const POP_MAX = 45;
export const SELECT_MAX = 24;

export type Cost = Partial<Record<ResType, number>>;

// ---------------------------------------------------- settlement levels
/**
 * Progression: the settlement itself grows from a camp of tents to a great
 * metropolis. Each level re-dresses every building and unlocks new ones.
 */
export interface SettlementDef {
  name: string;
  numeral: string;
  cost: Cost;
  time: number;
  blurb: string;
}

export const SETTLEMENTS: SettlementDef[] = [
  {
    name: 'Camp', numeral: 'I', cost: {}, time: 0,
    blurb: 'A ring of tents around a single fire.'
  },
  {
    name: 'Hamlet', numeral: 'II', cost: { food: 100 }, time: 16,
    blurb: 'Timber replaces canvas. Unlocks the Barracks and walls, and gardens begin to appear.'
  },
  {
    name: 'Village', numeral: 'III', cost: { food: 190, wood: 80 }, time: 24,
    blurb: 'Unlocks the Archery Range, Market, Shrine and trade.'
  },
  {
    name: 'Town', numeral: 'IV', cost: { food: 300, gold: 100 }, time: 32,
    blurb: 'Unlocks elite troops, towers, the Academy and new town centers.'
  },
  {
    name: 'City', numeral: 'V', cost: { food: 460, gold: 190, stone: 100 }, time: 40,
    blurb: 'Unlocks the Monument, Amphitheater, Lighthouse and Temple.'
  },
  {
    name: 'Metropolis', numeral: 'VI', cost: { food: 650, gold: 320, stone: 200 }, time: 50,
    blurb: 'The greatest city of the age. Unlocks the Wonder.'
  }
];

export const MAX_LEVEL = SETTLEMENTS.length - 1;

/** Flat damage added when an attack lands on a target of this class. */
export type BonusTable = Partial<Record<ArmorClass, number>>;

export interface UnitDef {
  name: string;
  short: string;
  cost: Cost;
  hp: number;
  atk: number;
  range: number;      // 0 => melee
  /** Soaks melee and siege damage. */
  meleeArmor: number;
  /** Soaks arrows and spears. */
  pierceArmor: number;
  /** What this unit counts as when someone else's bonus table is applied. */
  armorClass: ArmorClass;
  /** Which armor channel this unit's own attacks are resolved against. */
  dmgType: DamageType;
  /** Flat bonus damage against particular target classes. */
  bonus?: BonusTable;
  /** Area damage on impact. `friendly` scales the share own units take. */
  splash?: { radius: number; friendly: number };
  speed: number;
  trainTime: number;
  aggro: number;
  pop: number;
  radius: number;
  projectile?: 'arrow' | 'spear' | 'boulder';
  cooldown: number;
  water?: boolean;
  /** Settlement level required to train. */
  level: number;
  desc: string;
}

export const UNITS: Record<UnitTypeId, UnitDef> = {
  villager: {
    name: 'Villager', short: 'Villager', cost: { food: 50 }, hp: 32, atk: 3, range: 0,
    meleeArmor: 0, pierceArmor: 0, armorClass: 'worker', dmgType: 'melee',
    speed: 2.7, trainTime: 11, aggro: 3.5, pop: 1, radius: 0.26, cooldown: 1.4, level: 0,
    desc: 'Gathers resources, builds and repairs.'
  },
  spearman: {
    name: 'Spearman', short: 'Spearman', cost: { food: 55, wood: 20 }, hp: 55, atk: 7, range: 0,
    meleeArmor: 0, pierceArmor: 0, armorClass: 'infantry', dmgType: 'melee',
    bonus: { cavalry: 8, siege: 4 },
    speed: 2.95, trainTime: 14, aggro: 7, pop: 1, radius: 0.28, cooldown: 1.1, level: 1,
    desc: 'Cheap frontline melee fighter. Braced spears gut chariots and siege engines.'
  },
  archer: {
    name: 'Archer', short: 'Archer', cost: { wood: 35, gold: 25 }, hp: 34, atk: 5, range: 5.5,
    meleeArmor: 0, pierceArmor: 0, armorClass: 'ranged', dmgType: 'pierce',
    bonus: { infantry: 2, siege: 3 },
    speed: 2.95, trainTime: 15, aggro: 7.5, pop: 1, radius: 0.26,
    projectile: 'arrow', cooldown: 1.6, level: 2,
    desc: 'Ranged support. Deadly to infantry in numbers; arrows waste on stone.'
  },
  chariot: {
    name: 'War Chariot', short: 'Chariot', cost: { food: 45, wood: 55, gold: 25 }, hp: 72, atk: 7,
    range: 5, meleeArmor: 0, pierceArmor: 0, armorClass: 'cavalry', dmgType: 'pierce',
    bonus: { ranged: 5, siege: 4 },
    speed: 4.4, trainTime: 18, aggro: 8, pop: 2, radius: 0.42,
    projectile: 'arrow', cooldown: 1.7, level: 3,
    desc: 'Fast Egyptian chariot archer. Rides down archers and siege — but fears the spear.'
  },
  hoplite: {
    name: 'Hoplite', short: 'Hoplite', cost: { food: 60, gold: 40 }, hp: 95, atk: 10, range: 0,
    meleeArmor: 3, pierceArmor: 0, armorClass: 'infantry', dmgType: 'melee',
    bonus: { cavalry: 3, siege: 5 },
    speed: 2.55, trainTime: 18, aggro: 7, pop: 1, radius: 0.3, cooldown: 1.2, level: 3,
    desc: 'Greek heavy infantry. Bronze turns blades aside — but not arrows.'
  },
  legionary: {
    name: 'Legionary', short: 'Legionary', cost: { food: 50, gold: 30 }, hp: 80, atk: 9, range: 0,
    meleeArmor: 1, pierceArmor: 1, armorClass: 'infantry', dmgType: 'melee',
    bonus: { building: 3, siege: 4 },
    speed: 3.0, trainTime: 15, aggro: 7, pop: 1, radius: 0.29, cooldown: 1.1, level: 3,
    desc: 'Disciplined Roman infantry. Reliable, swift to muster, and handy with a pick.'
  },
  ram: {
    name: 'Battering Ram', short: 'Ram', cost: { wood: 130, gold: 40 }, hp: 220, atk: 4, range: 0,
    meleeArmor: 1, pierceArmor: 4, armorClass: 'siege', dmgType: 'siege',
    bonus: { building: 46 },
    speed: 1.85, trainTime: 26, aggro: 2.5, pop: 2, radius: 0.5, cooldown: 2.6, level: 3,
    desc: 'Shrugs off arrows and shatters stone. Helpless against troops — keep it escorted.'
  },
  catapult: {
    name: 'Catapult', short: 'Catapult', cost: { wood: 150, stone: 60, gold: 80 }, hp: 90, atk: 12,
    range: 11, meleeArmor: 0, pierceArmor: 0, armorClass: 'siege', dmgType: 'siege',
    bonus: { building: 18 },
    splash: { radius: 1.6, friendly: 0.5 },
    speed: 1.7, trainTime: 32, aggro: 9, pop: 3, radius: 0.46,
    projectile: 'boulder', cooldown: 4.2, level: 3,
    desc: 'Outranges any tower. The shot scatters, and does not ask whose men stand beneath it.'
  },
  boat: {
    name: 'Fishing Boat', short: 'Boat', cost: { wood: 40 }, hp: 60, atk: 0, range: 0,
    meleeArmor: 1, pierceArmor: 1, armorClass: 'worker', dmgType: 'melee',
    speed: 3.3, trainTime: 14, aggro: 0, pop: 1, radius: 0.5, cooldown: 1,
    water: true, level: 0,
    desc: 'Gathers food from fish shoals.'
  },
  tradecart: {
    name: 'Trade Cart', short: 'Cart', cost: { wood: 45, gold: 15 }, hp: 52, atk: 0, range: 0,
    meleeArmor: 0, pierceArmor: 0, armorClass: 'worker', dmgType: 'melee',
    speed: 3.1, trainTime: 16, aggro: 0, pop: 1, radius: 0.36, cooldown: 1, level: 2,
    desc: 'Hauls goods to the trading post and returns with gold.'
  },
  // ---- the wilds (owner 2, never trained) ----
  gazelle: {
    name: 'Gazelle', short: 'Gazelle', cost: {}, hp: 26, atk: 0, range: 0,
    meleeArmor: 0, pierceArmor: 0, armorClass: 'wild', dmgType: 'melee',
    speed: 3.45, trainTime: 0, aggro: 0, pop: 0, radius: 0.24, cooldown: 1, level: 0,
    desc: 'Swift game. Hunt it and butcher the carcass for food.'
  },
  boar: {
    name: 'Wild Boar', short: 'Boar', cost: {}, hp: 90, atk: 9, range: 0,
    meleeArmor: 0, pierceArmor: 0, armorClass: 'wild', dmgType: 'melee',
    speed: 3.15, trainTime: 0, aggro: 0, pop: 0, radius: 0.3, cooldown: 1.3, level: 0,
    desc: 'Ill-tempered and dangerous. Rich meat for the brave.'
  },
  wolf: {
    name: 'Wolf', short: 'Wolf', cost: {}, hp: 44, atk: 6, range: 0,
    meleeArmor: 0, pierceArmor: 0, armorClass: 'wild', dmgType: 'melee',
    speed: 3.85, trainTime: 0, aggro: 6.5, pop: 0, radius: 0.26, cooldown: 1.15, level: 0,
    desc: 'A pack hunter with a taste for stray villagers.'
  },
  mercenary: {
    name: 'Mercenary', short: 'Merc', cost: {}, hp: 86, atk: 9, range: 0,
    meleeArmor: 1, pierceArmor: 0, armorClass: 'infantry', dmgType: 'melee',
    bonus: { siege: 4 },
    speed: 3.0, trainTime: 0, aggro: 0, pop: 1, radius: 0.29, cooldown: 1.1, level: 0,
    desc: 'A deserter selling his spear to whoever pays.'
  },
  refugee: {
    name: 'Refugee', short: 'Refugee', cost: {}, hp: 24, atk: 0, range: 0,
    meleeArmor: 0, pierceArmor: 0, armorClass: 'worker', dmgType: 'melee',
    speed: 2.6, trainTime: 0, aggro: 0, pop: 0, radius: 0.25, cooldown: 1, level: 0,
    desc: 'Displaced folk. Lead them to a Town Center and they will settle.'
  }
};

/** Units that exist to break buildings: they never chase soft targets. */
export const SIEGE_UNITS: ReadonlySet<UnitTypeId> = new Set<UnitTypeId>(['ram', 'catapult']);

/** Human-facing names for the counter line in the selection panel. */
export const ARMOR_CLASS_NAME: Record<ArmorClass, string> = {
  worker: 'Workers', infantry: 'Infantry', ranged: 'Archers', cavalry: 'Cavalry',
  siege: 'Siege', wild: 'Beasts', building: 'Buildings'
};

export interface BuildingDef {
  name: string;
  cost: Cost;
  hp: number;
  size: number;
  buildTime: number;
  /**
   * Soaks melee and pierce damage. Siege damage ignores it entirely — that is
   * the whole reason siege engines exist.
   */
  armor?: number;
  pop?: number;
  dropoff?: boolean;
  trains?: UnitTypeId[];
  attack?: { dmg: number; range: number; cooldown: number };
  needsShore?: boolean;
  farm?: boolean;
  /** Units may walk over the footprint (plazas). */
  walkable?: boolean;
  /** Heal aura: own units nearby regenerate hp/s. */
  heal?: { rate: number; range: number };
  /** In-place upgrade target (e.g. shrine -> temple). */
  upgradesTo?: BuildingTypeId;
  /** Settlement level required to build. */
  level: number;
  desc: string;
}

export const BUILDINGS: Record<BuildingTypeId, BuildingDef> = {
  towncenter: {
    name: 'Town Center', cost: { wood: 220, stone: 180 }, hp: 1800, size: 4, buildTime: 70,
    armor: 2, pop: 5, dropoff: true, trains: ['villager'], level: 3,
    desc: 'Heart of your settlement. Trains villagers and stores goods.'
  },
  house: {
    name: 'House', cost: { wood: 30 }, hp: 250, size: 2, buildTime: 12,
    armor: 1, pop: 5, level: 0, desc: 'Supports 5 more population.'
  },
  farm: {
    name: 'Farm', cost: { wood: 45 }, hp: 120, size: 3, buildTime: 10,
    farm: true, level: 0, desc: 'Steady food for one farmer. Reseeds itself with wood.'
  },
  storehouse: {
    name: 'Storehouse', cost: { wood: 35 }, hp: 300, size: 2, buildTime: 12,
    armor: 1, dropoff: true, level: 0, desc: 'Drop-off point for all resources.'
  },
  barracks: {
    name: 'Barracks', cost: { wood: 90 }, hp: 700, size: 3, buildTime: 25,
    armor: 1, trains: ['spearman'], level: 1, desc: 'Trains melee infantry.'
  },
  range: {
    name: 'Archery Range', cost: { wood: 90 }, hp: 650, size: 3, buildTime: 25,
    armor: 1, trains: ['archer'], level: 2, desc: 'Trains ranged units.'
  },
  siegeworks: {
    name: 'Siege Workshop', cost: { wood: 120, stone: 80 }, hp: 700, size: 3, buildTime: 32,
    armor: 1, trains: ['ram', 'catapult'], level: 3,
    desc: 'Engineers build the engines that bring walls down.'
  },
  tower: {
    name: 'Watch Tower', cost: { wood: 50, stone: 80 }, hp: 550, size: 2, buildTime: 22,
    armor: 2, attack: { dmg: 7, range: 8.5, cooldown: 2.1 }, level: 3,
    desc: 'Shoots arrows at nearby enemies. Stone shrugs off blades — but not boulders.'
  },
  wall: {
    name: 'Wall', cost: { wood: 4, stone: 8 }, hp: 380, size: 1, buildTime: 5, armor: 2, level: 1,
    desc: 'Blocks enemies. Every segment has a gate your own troops pass through.'
  },
  monument: {
    name: 'Monument', cost: { stone: 120, gold: 120 }, hp: 900, size: 3, buildTime: 45,
    armor: 2, pop: 5, level: 4, desc: 'Wonder of your people. +5 pop, generates gold.'
  },
  dock: {
    name: 'Dock', cost: { wood: 60 }, hp: 350, size: 2, buildTime: 18,
    armor: 1, dropoff: true, trains: ['boat'], needsShore: true, level: 0,
    desc: 'Build on the shore. Trains fishing boats.'
  },
  market: {
    name: 'Market', cost: { wood: 100 }, hp: 550, size: 3, buildTime: 26,
    armor: 1, trains: ['tradecart'], level: 2,
    desc: 'Exchange resources and send trade carts to the trading post.'
  },
  shrine: {
    name: 'Shrine', cost: { wood: 50, gold: 25 }, hp: 400, size: 2, buildTime: 18,
    armor: 1, heal: { rate: 0.8, range: 7 }, upgradesTo: 'temple', level: 2,
    desc: 'Priests tend wounds — nearby units slowly heal.'
  },
  temple: {
    name: 'Temple', cost: { stone: 100, gold: 100 }, hp: 800, size: 2, buildTime: 30,
    armor: 2, heal: { rate: 2.0, range: 10 }, level: 4,
    desc: 'A great sanctuary. Heals nearby units swiftly.'
  },
  amphitheater: {
    name: 'Amphitheater', cost: { wood: 120, stone: 100, gold: 80 }, hp: 900, size: 3, buildTime: 40,
    armor: 2, level: 4,
    desc: 'Games and glory: all your units deal +30% damage while it stands.'
  },
  academy: {
    name: 'Academy', cost: { wood: 110, stone: 60 }, hp: 600, size: 3, buildTime: 30,
    armor: 1, level: 3,
    desc: 'Scholars unlock new technologies for your civilization.'
  },
  statue: {
    name: 'Statue', cost: { stone: 30, gold: 20 }, hp: 220, size: 1, buildTime: 8,
    level: 2, desc: 'A proud landmark for your city.'
  },
  garden: {
    name: 'Garden', cost: { wood: 25 }, hp: 150, size: 2, buildTime: 8,
    level: 1, desc: 'Greenery and calm between the rooftops.'
  },
  plaza: {
    name: 'Plaza', cost: { stone: 20 }, hp: 180, size: 2, buildTime: 8,
    walkable: true, level: 2, desc: 'Paved public square. Your people walk across it.'
  },
  lighthouse: {
    name: 'Lighthouse', cost: { stone: 120, wood: 60 }, hp: 700, size: 2, buildTime: 32,
    needsShore: true, armor: 2, level: 4,
    desc: 'Guides your boats: they gather 30% faster and sail 20% faster.'
  },
  forum: {
    name: 'Forum', cost: { wood: 140, gold: 60 }, hp: 650, size: 3, buildTime: 30,
    armor: 1, level: 3,
    desc: 'Civic administration. Unlocks the labor pool: idle villagers are put to work automatically.'
  },
  wonder: {
    name: 'Wonder', cost: { wood: 300, stone: 350, gold: 300 }, hp: 3000, size: 4, buildTime: 150,
    armor: 2, level: 5,
    desc: 'The crowning work of your people. Complete it and hold it to win.'
  },
  // ---- encounter props (owner 2, placed at map gen, never in the build menu) ----
  den: {
    name: 'Wolf Den', cost: {}, hp: 340, size: 2, buildTime: 1, level: 0,
    desc: 'A pack hunts these lands. Raze the den to end the raids.'
  },
  camp: {
    name: "Deserters' Camp", cost: {}, hp: 520, size: 3, buildTime: 1, level: 0,
    desc: 'Lawless soldiers with a price. Pay it, or take their stash by force.'
  },
  cairn: {
    name: 'Old Cairn', cost: {}, hp: 260, size: 1, buildTime: 1, level: 0,
    desc: 'Something lies buried here. Send a villager to dig it up.'
  },
  pedestal: {
    name: 'Golden Idol', cost: {}, hp: 260, size: 1, buildTime: 1, level: 0,
    desc: 'A relic of a forgotten people. Carry it home to your Town Center.'
  },
  outpost: {
    name: 'Ruined Fort', cost: {}, hp: 900, size: 3, buildTime: 1, armor: 2,
    dropoff: true, level: 0,
    desc: 'A derelict of some older war. Stand in it to claim it — it watches the country around and takes your goods.'
  }
};

/**
 * Order shown in the build menu; town center gets its own wide row.
 * Statues, gardens and plazas are not here: the settlement raises those for
 * itself around its larger works as it grows (see sim/civic.ts).
 */
export const BUILD_MENU: BuildingTypeId[] = [
  'house', 'farm', 'storehouse',
  'barracks', 'range', 'siegeworks',
  'dock', 'market', 'shrine',
  'academy', 'tower', 'wall',
  'lighthouse', 'amphitheater', 'forum',
  'monument'
];
export const BUILD_MENU_WIDE: BuildingTypeId[] = ['towncenter', 'wonder'];

export interface TechDef {
  id: string;
  name: string;
  icon: string;
  cost: Cost;
  time: number;
  at: BuildingTypeId;
  /** Settlement level required to research. */
  level: number;
  desc: string;
}

export const TECHS: Record<string, TechDef> = {
  wheel: {
    id: 'wheel', name: 'The Wheel', icon: 'wheel', cost: { food: 100, gold: 50 }, time: 32,
    at: 'towncenter', level: 2, desc: 'Villagers move 20% faster and carry +4.'
  },
  masonry: {
    id: 'masonry', name: 'Masonry', icon: 'masonry', cost: { wood: 80, stone: 60 }, time: 28,
    at: 'towncenter', level: 3, desc: 'Buildings gain +25% hit points.'
  },
  bronze: {
    id: 'bronze', name: 'Bronze Arms', icon: 'bronze', cost: { food: 120, gold: 80 }, time: 36,
    at: 'barracks', level: 3, desc: 'All military units deal +25% damage.'
  },
  shields: {
    id: 'shields', name: 'Hardened Shields', icon: 'shields', cost: { food: 100, gold: 70 }, time: 32,
    at: 'barracks', level: 5, desc: 'All military gain +1 armor and +15% hit points.'
  },
  irrigation: {
    id: 'irrigation', name: 'Irrigation', icon: 'irrigation', cost: { wood: 100, food: 60 }, time: 30,
    at: 'academy', level: 3, desc: 'Farms yield food 25% faster.'
  },
  medicine: {
    id: 'medicine', name: 'Medicine', icon: 'medicine', cost: { food: 80, gold: 60 }, time: 28,
    at: 'academy', level: 3, desc: 'Shrines and temples heal twice as fast.'
  },
  coinage: {
    id: 'coinage', name: 'Coinage', icon: 'coinage', cost: { gold: 120, food: 80 }, time: 34,
    at: 'academy', level: 4, desc: 'Trade carts earn +30% gold; monuments trickle +50%.'
  },
  logistics: {
    id: 'logistics', name: 'Logistics', icon: 'logistics', cost: { food: 100, gold: 90 }, time: 34,
    at: 'academy', level: 4, desc: 'All buildings train units 15% faster.'
  }
};

export interface FactionDef {
  id: Faction;
  name: string;
  title: string;
  color: number;      // primary building tint
  accent: number;     // banners/details
  accentCss: string;
  uiColor: string;    // menu highlight colour
  elite: UnitTypeId;
  eliteAt: BuildingTypeId;
  passive: string;
  passiveShort: string;
  bonus: {
    foodRateMul?: number;
    farmCostMul?: number;
    unitHpMul?: number;
    buildRateMul?: number;
    buildingCostMul?: number;
    towerWallHpMul?: number;
  };
}

export const FACTIONS: Record<Faction, FactionDef> = {
  egypt: {
    id: 'egypt', name: 'Egypt', title: 'Gift of the Nile',
    color: 0xd8bd8d, accent: 0x2a56c6, accentCss: '#3868e0', uiColor: '#4fd6c1',
    elite: 'chariot', eliteAt: 'range',
    passive: 'Food is gathered 25% faster and farms cost 25% less. Fields of plenty feed great armies.',
    passiveShort: '+25% food gathering, cheaper farms',
    bonus: { foodRateMul: 1.25, farmCostMul: 0.75 }
  },
  greece: {
    id: 'greece', name: 'Greece', title: 'Phalanx and Marble',
    color: 0xefe9d8, accent: 0x2f6fd0, accentCss: '#3f7fe0', uiColor: '#5b9df5',
    elite: 'hoplite', eliteAt: 'barracks',
    passive: 'Military units have +15% hit points and towers and walls are 25% sturdier. Hold the line.',
    passiveShort: '+15% unit HP, sturdier defenses',
    bonus: { unitHpMul: 1.15, towerWallHpMul: 1.25 }
  },
  rome: {
    id: 'rome', name: 'Rome', title: 'Marching Eagles',
    color: 0xe7d9c0, accent: 0xb03a2e, accentCss: '#d04a3a', uiColor: '#e0604e',
    elite: 'legionary', eliteAt: 'barracks',
    passive: 'Buildings go up 35% faster and cost 10% less. An empire is built road by road.',
    passiveShort: '35% faster, cheaper construction',
    bonus: { buildRateMul: 1.35, buildingCostMul: 0.9 }
  }
};

export const NODE_AMOUNT: Record<NodeKind, number> = {
  tree: 90, berries: 160, stone: 400, gold: 420, fish: 380, carcass: 100
};

export const GATHER_RATE: Record<NodeKind, number> = {
  tree: 0.8, berries: 0.9, stone: 0.68, gold: 0.68, fish: 1.05, carcass: 1.15
};

export const FARM_FOOD = 320;
export const FARM_RATE = 0.75;
export const CARRY_CAP = 10;
export const FARM_RESEED_COST = 20; // wood

// ---------------------------------------------------------------- encounters
/** Owner index of the neutral third power — animals, deserters, treasures. */
export const WILDS = 2;

export interface BoonDef {
  name: string;
  desc: string;
  /** Seconds; 0 = permanent. */
  dur: number;
}

export const BOONS: Record<string, BoonDef> = {
  pelts: { name: 'Wolf Pelts', desc: 'Villagers are hardier (+25% HP)', dur: 0 },
  gratitude: { name: 'Gratitude', desc: 'The rescued lend their hands (+20% build speed)', dur: 120 },
  idol: { name: 'Golden Idol', desc: 'A steady trickle of gold', dur: 0 }
};

/** Balance knobs for the encounter layer. */
export const ENC = {
  // placement counts
  herdSites: 6, denSites: 2, campSites: 2, cacheSites: 6, refugeeSites: 2,
  // wolves
  wolfRaidGrace: 240, wolfRaidEvery: 85, wolfRaidRange: 38, wolfCap: 4,
  // deserters
  mercCount: 3, mercPrice: 140, campLoot: 90, offerR: 6,
  // cairns
  digTime: 8, digR: 1.9,
  // refugees
  refugeeCount: 3, refugeeR: 5,
  // herds
  gazelleFood: 75, boarFood: 170,
  carcassRotRate: 0.9,
  // the Golden Idol
  relicPickupR: 1.7, relicDepositR: 1.8, idolGoldRate: 0.5,
  // ruined forts: contested all match, never spent
  outpostSites: 2, captureR: 4.5, captureTime: 14, captureDecay: 0.35,
  /** How far a held fort sees. Wide enough to be worth holding. */
  outpostVision: 17
};

// ---------------------------------------------------------------- trade
/** Gold per trade run: base + per-tile distance between market and post. */
export const TRADE_BASE_GOLD = 8;
export const TRADE_GOLD_PER_TILE = 1.05;
/** Seconds a wonder must stand before its owner wins. */
export const WONDER_COUNTDOWN = 180;
/** Market exchange: sell 100 of a resource for this much gold... */
export const MARKET_SELL_GOLD = 60;
/** ...or buy 100 of a resource for this much gold. */
export const MARKET_BUY_GOLD = 90;
export const MARKET_LOT = 100;

export const DIFFICULTY: Record<Difficulty, {
  name: string; icon: string; desc: string;
  aiGatherMul: number; aiVillagers: number;
  firstWave: number; waveEvery: number; waveBase: number; waveGrow: number;
}> = {
  easy: {
    name: 'Laurel', icon: 'laurel', desc: 'A distant rival who builds slowly and raids rarely.',
    aiGatherMul: 0.62, aiVillagers: 8, firstWave: 480, waveEvery: 280, waveBase: 2, waveGrow: 1
  },
  normal: {
    name: 'Bronze', icon: 'shields', desc: 'A steady foe. Expect organised raids in time.',
    aiGatherMul: 0.82, aiVillagers: 11, firstWave: 410, waveEvery: 245, waveBase: 2, waveGrow: 2
  },
  hard: {
    name: 'Iron', icon: 'ironhelm', desc: 'A patient war machine that grows dangerous.',
    aiGatherMul: 1.15, aiVillagers: 14, firstWave: 320, waveEvery: 190, waveBase: 3, waveGrow: 2
  }
};

export const RES_ORDER: ResType[] = ['food', 'wood', 'gold', 'stone'];
export const RES_NAME: Record<ResType, string> = {
  food: 'Food', wood: 'Wood', stone: 'Stone', gold: 'Gold'
};

/** Units trainable at a building for a faction, filtered by settlement level. */
export function trainableAt(faction: Faction, b: BuildingTypeId, level = MAX_LEVEL): UnitTypeId[] {
  const base = BUILDINGS[b].trains ? [...BUILDINGS[b].trains!] : [];
  const f = FACTIONS[faction];
  if (f.eliteAt === b) base.push(f.elite);
  return base.filter(u => UNITS[u].level <= level);
}

// Procedural low-poly models for every building, unit, resource and prop.
// Everything is merged vertex-colored geometry — one draw call per entity.
import * as THREE from 'three';
import { BUILDINGS } from '../core/config';
import type { BuildingTypeId, Faction, NodeKind, UnitTypeId } from '../core/types';
import { Parts } from './parts';
import { wildsBuilding, wildsNode, wildsUnit } from './wilds';

// ---------------------------------------------------------------- palette
export const PAL = {
  sand: 0xd9c193,
  sandLight: 0xe6d3a8,
  dirt: 0x9c7c52,
  soil: 0x6e563a,
  wood: 0x8a6844,
  woodDark: 0x6b4f33,
  woodLight: 0xa8845c,
  stone: 0x9a948a,
  stoneLight: 0xb9b2a4,
  leaf: 0x6f8f3f,
  leafDark: 0x5a7a34,
  olive: 0x74804a,
  oliveDark: 0x5c6a3c,
  palmLeaf: 0x5f9440,
  trunk: 0x8d6a45,
  gold: 0xd9a33c,
  goldBright: 0xf0c05a,
  white: 0xf1ece0,
  rock: 0x8f8a80,
  berry: 0xc8402e,
  wheat: 0xd6b155,
  water: 0x2e9aa8,
  cloth: 0xe8ddc4
};

interface Style {
  wall: number; wallDark: number; roof: number; trim: number;
  accent: number; column: number;
}
const STYLE: Record<Faction, Style> = {
  egypt: { wall: 0xdcc397, wallDark: 0xc9ab77, roof: 0xd3b888, trim: 0xd9a33c, accent: 0x2a56c6, column: 0xe0cb9d },
  greece: { wall: 0xf0ebdc, wallDark: 0xded6c0, roof: 0x3565c8, trim: 0xf7f3e8, accent: 0x2f6fd0, column: 0xf4f0e4 },
  rome: { wall: 0xe8dcc2, wallDark: 0xd6c6a6, roof: 0xb5533c, trim: 0xd9a33c, accent: 0xa93226, column: 0xe2d5b8 }
};

const cache = new Map<string, THREE.BufferGeometry>();
function cached(key: string, make: (p: Parts) => void, post?: (g: THREE.BufferGeometry) => void): THREE.BufferGeometry {
  let g = cache.get(key);
  if (!g) {
    const p = new Parts();
    make(p);
    g = p.build();
    post?.(g);
    cache.set(key, g);
  }
  return g;
}

// ---------------------------------------------------------------- shared motifs
/** Rotate a local facade offset (ox = along wall, oz = out of wall) around y. */
function facade(x: number, z: number, ry: number, ox: number, oz: number): [number, number] {
  const c = Math.cos(ry), s = Math.sin(ry);
  return [x + ox * c + oz * s, z - ox * s + oz * c];
}

function colonnade(p: Parts, s: Style, count: number, x0: number, x1: number, y: number, z: number, h: number, r = 0.09) {
  for (let i = 0; i < count; i++) {
    const x = x0 + (x1 - x0) * (count === 1 ? 0.5 : i / (count - 1));
    p.cyl(s.column, r, r, h, x, y + h / 2, z, { seg: 7 });
    // capital: echinus disc under a square abacus
    p.cyl(s.column, r * 1.3, r * 1.05, 0.045, x, y + h - 0.045, z, { seg: 7, shade: 1.03 });
    p.box(s.column, r * 2.6, 0.06, r * 2.6, x, y + h + 0.03, z);
    // base: plinth block + torus ring
    p.box(s.column, r * 2.2, 0.05, r * 2.2, x, y + 0.025, z);
    p.cyl(s.column, r * 1.25, r * 1.35, 0.05, x, y + 0.075, z, { seg: 7, shade: 0.97 });
  }
}

function crenellations(p: Parts, color: number, w: number, y: number, z: number, count = 4) {
  for (let i = 0; i < count; i++) {
    const x = -w / 2 + (i + 0.5) * (w / count);
    p.box(color, w / count * 0.55, 0.14, 0.14, x, y, z);
  }
}

/** Plank door with seams and a handle; optional stone frame + lintel. */
function doorway(p: Parts, color: number, w: number, h: number, x: number, y: number, z: number,
  o: { ry?: number; frame?: number } = {}) {
  const ry = o.ry ?? 0;
  const at = (ox: number, oz: number) => facade(x, z, ry, ox, oz);
  let [px, pz] = at(0, 0);
  p.box(color, w, h, 0.06, px, y + h / 2, pz, { ry });
  for (const sx of [-1, 1]) {
    [px, pz] = at(sx * w * 0.18, 0.012);
    p.box(color, 0.016, h * 0.9, 0.06, px, y + h / 2, pz, { ry, shade: 0.72 });
  }
  [px, pz] = at(w * 0.28, 0.02);
  p.sphere(PAL.gold, 0.024, px, y + h * 0.5, pz, { seg: 4 });
  if (o.frame !== undefined) {
    for (const sx of [-1, 1]) {
      [px, pz] = at(sx * (w / 2 + 0.05), 0.004);
      p.box(o.frame, 0.1, h + 0.05, 0.09, px, y + h / 2 + 0.02, pz, { ry, shade: 0.96 });
    }
    [px, pz] = at(0, 0.012);
    p.box(o.frame, w + 0.3, 0.1, 0.1, px, y + h + 0.09, pz, { ry, shade: 1.05 });
  }
}

/** Framed window: dark opening, stone surround, lintel and sill. Faces +z. */
function win(p: Parts, frameColor: number, x: number, y: number, z: number,
  o: { ry?: number; w?: number; h?: number } = {}) {
  const w = o.w ?? 0.17, h = o.h ?? 0.24, ry = o.ry ?? 0;
  const at = (ox: number, oz: number) => facade(x, z, ry, ox, oz);
  let [px, pz] = at(0, 0.01);
  p.box(0x33291f, w, h, 0.05, px, y, pz, { ry });
  [px, pz] = at(0, -0.002);
  p.box(frameColor, w + 0.09, h + 0.08, 0.05, px, y, pz, { ry, shade: 0.92 });
  [px, pz] = at(0, 0.02);
  p.box(frameColor, w + 0.14, 0.05, 0.06, px, y + h / 2 + 0.05, pz, { ry, shade: 1.04 });
  p.box(frameColor, w + 0.1, 0.04, 0.08, px, y - h / 2 - 0.035, pz, { ry, shade: 0.97 });
}

/** Shrinking stone steps descending from a doorway; faces +z. */
function steps(p: Parts, color: number, w: number, x: number, y: number, z: number,
  o: { n?: number; ry?: number } = {}) {
  const n = o.n ?? 3, ry = o.ry ?? 0;
  for (let i = 0; i < n; i++) {
    const [px, pz] = facade(x, z, ry, 0, i * 0.14);
    p.box(color, w - i * 0.1, 0.06 * (n - i), 0.15, px, y + 0.03 * (n - i), pz, { ry, shade: 1 + i * 0.025 });
  }
}

/** Gabled roof upgraded with tile seams, ridge cap and fascia boards. */
function gabledRoof(p: Parts, s: { roof: number }, w: number, h: number, d: number, x: number, y: number, z: number) {
  p.prism(s.roof, w, h, d, x, y, z);
  const th = Math.atan2(h, w / 2);
  const L = Math.hypot(h, w / 2);
  const nx = h / L, ny = (w / 2) / L; // outward slope normal
  for (const sx of [-1, 1]) {
    // tile course seams lying on the slope
    for (const t of [0.3, 0.62]) {
      const px = x + sx * ((w / 2) * (1 - t) + nx * 0.012);
      const py = y + h * t + ny * 0.012;
      p.box(s.roof, 0.07, 0.035, d + 0.05, px, py, z, { rz: -sx * th, shade: 0.82 });
    }
    // fascia board along the eave
    p.box(s.roof, 0.06, 0.11, d + 0.04, x + sx * (w / 2 - 0.015), y + 0.01, z, { shade: 0.72 });
  }
  // ridge cap
  p.box(s.roof, 0.13, 0.055, d + 0.08, x, y + h + 0.01, z, { shade: 0.68 });
}

/** Hanging wall banner on a gilded rod, with a pointed tail and emblem. */
function wallBanner(p: Parts, s: Style, x: number, y: number, z: number, ry = 0, k = 1) {
  const at = (ox: number, oz: number) => facade(x, z, ry, ox, oz);
  let [px, pz] = at(0, 0.045);
  p.box(PAL.gold, 0.3 * k, 0.035, 0.04, px, y, pz, { ry });
  [px, pz] = at(0, 0.03);
  p.box(s.accent, 0.24 * k, 0.46 * k, 0.03, px, y - 0.24 * k, pz, { ry });
  p.cone(s.accent, 0.12 * k, 0.2 * k, px, y - 0.56 * k, pz, { seg: 4, rx: Math.PI, ry: ry + Math.PI / 4, sz: 0.24 });
  [px, pz] = at(0, 0.05);
  p.box(PAL.gold, 0.085 * k, 0.085 * k, 0.02, px, y - 0.24 * k, pz, { ry, rz: Math.PI / 4 });
}

/** Woven basket piled with produce. */
function basket(p: Parts, x: number, z: number, k = 1) {
  p.cyl(0xb08d5a, 0.11 * k, 0.085 * k, 0.14 * k, x, 0.07 * k, z, { seg: 7 });
  p.cyl(0x9c7a48, 0.115 * k, 0.11 * k, 0.03 * k, x, 0.15 * k, z, { seg: 7 });
  p.sphere(0xd8b455, 0.045 * k, x - 0.03 * k, 0.17 * k, z, { seg: 4 });
  p.sphere(PAL.berry, 0.04 * k, x + 0.04 * k, 0.17 * k, z + 0.02 * k, { seg: 4 });
  p.sphere(0x8fa05a, 0.042 * k, x, 0.18 * k, z - 0.04 * k, { seg: 4 });
}

function flagpole(p: Parts, x: number, y: number, z: number, h: number, pennant?: number) {
  p.cyl(PAL.woodDark, 0.025, 0.03, h, x, y + h / 2, z, { seg: 5 });
  p.sphere(PAL.gold, 0.045, x, y + h, z, { seg: 6 });
  if (pennant !== undefined) {
    p.box(pennant, 0.26, 0.14, 0.025, x + 0.15, y + h - 0.12, z);
    p.cone(pennant, 0.07, 0.14, x + 0.33, y + h - 0.12, z, { seg: 4, rz: -Math.PI / 2, sz: 0.3 });
  }
}

function crates(p: Parts, x: number, z: number, s = 1) {
  p.box(PAL.wood, 0.3 * s, 0.3 * s, 0.3 * s, x, 0.15 * s, z, { ry: 0.3 });
  p.box(PAL.woodLight, 0.24 * s, 0.24 * s, 0.24 * s, x + 0.28 * s, 0.12 * s, z + 0.1 * s, { ry: 0.8 });
  p.box(PAL.wood, 0.2 * s, 0.2 * s, 0.2 * s, x + 0.1 * s, 0.4 * s, z + 0.02 * s, { ry: 0.5 });
}

function amphora(p: Parts, color: number, x: number, z: number, s = 1) {
  p.sphere(color, 0.11 * s, x, 0.13 * s, z, { sy: 1.35 });
  p.cyl(color, 0.045 * s, 0.03 * s, 0.08 * s, x, 0.3 * s, z, { seg: 6 });
  p.box(color, 0.1 * s, 0.03 * s, 0.1 * s, x, 0.34 * s, z);
}

// ---------------------------------------------------------------- buildings
/**
 * Build a building model. `tier` is the owner's age: every epoch dresses the
 * settlement up — trim, planters, banners, braziers and marble as time passes.
 */
export function buildingGeo(type: BuildingTypeId, faction: Faction, tier = 0): THREE.BufferGeometry {
  return cached(`b_${type}_${faction}_${tier}`, p => {
    const s = STYLE[faction];
    switch (type) {
      case 'towncenter': towncenter(p, s, faction); break;
      case 'house': house(p, s, faction); break;
      case 'farm': farmBase(p, s, faction); break;
      case 'storehouse': storehouse(p, s, faction); break;
      case 'barracks': barracks(p, s, faction); break;
      case 'range': archeryRange(p, s, faction); break;
      case 'siegeworks': siegeWorks(p, s, faction); break;
      case 'tower': tower(p, s, faction); break;
      case 'wall': wallSeg(p, s, faction, tier); break;
      case 'monument': monument(p, s, faction); break;
      case 'dock': dock(p, s, faction); break;
      case 'market': market(p, s, faction); break;
      case 'shrine': shrine(p, s, faction); break;
      case 'temple': temple(p, s, faction); break;
      case 'amphitheater': amphitheaterB(p, s, faction); break;
      case 'academy': academy(p, s, faction); break;
      case 'statue': statueB(p, s, faction); break;
      case 'garden': gardenB(p, s, faction); break;
      case 'plaza': plazaB(p, s, faction); break;
      case 'lighthouse': lighthouseB(p, s, faction); break;
      case 'forum': forumB(p, s, faction); break;
      case 'wonder': wonderB(p, s, faction); break;
      default: wildsBuilding(p, type); break; // encounter props (den, camp, …)
    }
    if (!NO_DRESS.has(type)) dress(p, s, tier, BUILDINGS[type].size);
  });
}

/** Flat, already-ornamental or wilds types skip the generic age dressing. */
const NO_DRESS = new Set<BuildingTypeId>([
  'wall', 'farm', 'plaza', 'garden', 'statue', 'den', 'camp', 'cairn', 'pedestal', 'outpost'
]);

/**
 * Age dressing: the same building grows prettier every epoch.
 * Tool Age: potted greenery + painted trim. Bronze: banners and gold.
 * Iron: marble border and burning braziers.
 */
function dress(p: Parts, s: Style, tier: number, size: number) {
  if (tier <= 0) return;
  const h = size / 2 - 0.22;
  // Tool Age: corner planters + a painted band along the front plinth
  for (const sx of [-1, 1]) {
    p.cyl(0x9c6a44, 0.09, 0.07, 0.14, sx * h, 0.07, h, { seg: 6 });
    p.sphere(PAL.olive, 0.13, sx * h, 0.2, h, { sy: 0.75 });
  }
  p.box(s.accent, size * 0.86, 0.05, 0.07, 0, 0.14, size / 2 - 0.05);
  if (tier >= 2) {
    // Bronze Age: banner poles + gold trim on the plinth band
    for (const sx of [-1, 1]) {
      flagpole(p, sx * h, 0.12, -h, 1.2);
      p.box(s.accent, 0.05, 0.3, 0.3, sx * h, 1.08, -h + 0.16);
      p.box(PAL.gold, 0.06, 0.05, 0.32, sx * h, 1.26, -h + 0.16);
    }
    p.box(PAL.gold, size * 0.86, 0.03, 0.05, 0, 0.185, size / 2 - 0.04);
  }
  if (tier >= 3) {
    // Iron Age: marble edging + braziers burning at the door
    p.box(PAL.white, size * 0.99, 0.05, size * 0.99, 0, 0.03, 0, { shade: 1.05 });
    for (const sx of [-1, 1]) {
      const bx = sx * (h - 0.42);
      p.cyl(PAL.stoneLight, 0.06, 0.09, 0.42, bx, 0.24, h, { seg: 6 });
      p.cyl(0x5a4632, 0.11, 0.08, 0.1, bx, 0.48, h, { seg: 6 });
      p.sphere(0xe0813c, 0.09, bx, 0.56, h, { seg: 5 });
      p.sphere(PAL.goldBright, 0.055, bx, 0.64, h, { seg: 4 });
    }
  }
}

export const BUILDING_VIS_HEIGHT: Record<BuildingTypeId, number> = {
  towncenter: 3.0, house: 1.5, farm: 0.7, storehouse: 1.5, barracks: 1.8,
  range: 1.7, siegeworks: 1.9, tower: 2.9, wall: 1.4, monument: 3.2, dock: 1.5,
  market: 1.6, shrine: 1.5, temple: 2.2, amphitheater: 1.6, academy: 1.9,
  statue: 1.9, garden: 0.7, plaza: 0.2, lighthouse: 3.4, forum: 1.9, wonder: 3.6,
  den: 1.2, camp: 1.7, cairn: 0.8, pedestal: 1.3, outpost: 2.2
};

function towncenter(p: Parts, s: Style, f: Faction) {
  // base plinth
  p.box(PAL.sandLight, 3.9, 0.22, 3.9, 0, 0.11, 0, { shade: 1.02 });
  p.box(s.wallDark, 3.5, 0.14, 3.5, 0, 0.29, 0);
  if (f === 'egypt') {
    // pylon gate front (+z)
    for (const sx of [-1, 1]) {
      p.cyl(s.wall, 0.42, 0.62, 1.9, sx * 1.05, 1.25, 1.15, { seg: 4, ry: Math.PI / 4 });
      p.box(s.accent, 0.78, 0.12, 0.78, sx * 1.05, 2.14, 1.15, { ry: Math.PI / 4 });
      p.box(PAL.gold, 0.7, 0.07, 0.7, sx * 1.05, 2.24, 1.15, { ry: Math.PI / 4 });
      // hanging banners on the pylon faces + crowning pennants
      wallBanner(p, s, sx * 1.05, 1.7, 1.44, 0, 1.05);
      flagpole(p, sx * 1.05, 2.28, 1.15, 0.55, s.accent);
    }
    p.box(s.wall, 1.35, 1.15, 0.5, 0, 0.9, 1.12);
    p.box(s.accent, 1.35, 0.12, 0.54, 0, 1.52, 1.12);
    doorway(p, 0x3a2c1c, 0.55, 0.8, 0, 0.3, 1.42, { frame: s.wallDark });
    steps(p, PAL.sandLight, 0.9, 0, 0, 1.6);
    // main hall — flat mud roof ringed by a painted cornice
    p.box(s.wall, 2.9, 1.25, 2.2, 0, 0.95, -0.5);
    win(p, s.wallDark, -1.0, 1.1, 0.63);
    win(p, s.wallDark, 1.0, 1.1, 0.63);
    win(p, s.wallDark, -1.47, 1.1, -0.5, { ry: -Math.PI / 2 });
    win(p, s.wallDark, 1.47, 1.1, -0.5, { ry: Math.PI / 2 });
    p.box(s.roof, 3.0, 0.16, 2.3, 0, 1.6, -0.5, { shade: 1.05 });
    const trim: [number, number, number, number][] = [
      [0, 0.58, 3.0, 0.16],   // front edge
      [0, -1.58, 3.0, 0.16],  // back edge
      [-1.42, -0.5, 0.16, 2.3],
      [1.42, -0.5, 0.16, 2.3]
    ];
    for (const [tx, tz, tw, td] of trim) {
      p.box(s.accent, tw, 0.14, td, tx, 1.72, tz);
      p.box(PAL.gold, tw * 0.98, 0.05, td * 0.98, tx, 1.81, tz);
    }
    // roof clutter: stair hut + striped awning
    p.box(s.wall, 0.7, 0.5, 0.7, -0.8, 1.9, -0.8);
    p.box(s.wallDark, 0.78, 0.08, 0.78, -0.8, 2.17, -0.8);
    for (let i = 0; i < 4; i++) {
      p.box(i % 2 === 0 ? s.accent : PAL.cloth, 0.24, 0.045, 0.75, 0.32 + i * 0.24, 1.98 - i * 0.02, -0.55, { rz: 0.1 });
    }
    for (const sx of [-1, 1]) p.cyl(PAL.woodDark, 0.03, 0.03, 0.5, 0.65 + sx * 0.42, 1.78, -0.3, { seg: 4 });
    // back obelisks
    for (const sx of [-1, 1]) {
      p.cyl(s.wall, 0.07, 0.13, 1.5, sx * 1.5, 1.15, -1.5, { seg: 4, ry: Math.PI / 4 });
      p.cone(PAL.gold, 0.13, 0.2, sx * 1.5, 2.0, -1.5, { seg: 4, ry: Math.PI / 4 });
    }
  } else if (f === 'greece') {
    // stepped stylobate
    p.box(s.wall, 3.4, 0.18, 3.0, 0, 0.42, 0);
    p.box(s.wallDark, 3.1, 0.14, 2.7, 0, 0.58, 0);
    steps(p, s.wall, 1.4, 0, 0, 1.55);
    // cella
    p.box(s.wall, 2.3, 1.35, 2.0, 0, 1.25, -0.2);
    doorway(p, 0x37455e, 0.5, 0.85, 0, 0.65, 0.82, { frame: s.wallDark });
    win(p, s.wallDark, -1.17, 1.35, -0.2, { ry: -Math.PI / 2 });
    win(p, s.wallDark, 1.17, 1.35, -0.2, { ry: Math.PI / 2 });
    // front columns
    colonnade(p, s, 5, -1.35, 1.35, 0.65, 1.15, 1.25, 0.1);
    p.box(s.trim, 3.15, 0.18, 0.4, 0, 2.0, 1.15);
    // banners between the outer columns
    wallBanner(p, s, -0.68, 1.72, 1.28, 0, 0.9);
    wallBanner(p, s, 0.68, 1.72, 1.28, 0, 0.9);
    // architrave + tiled roof with antefix studs on the front eave
    p.box(s.wallDark, 3.2, 0.16, 2.75, 0, 2.03, -0.1);
    gabledRoof(p, s, 3.5, 0.85, 3.1, 0, 2.12, -0.1);
    p.box(s.trim, 3.55, 0.09, 0.2, 0, 2.16, 1.42);
    for (const ax of [-1.35, -0.45, 0.45, 1.35]) p.box(s.trim, 0.09, 0.1, 0.06, ax, 2.28, 1.46);
    // gilded pediment emblem
    p.box(PAL.gold, 0.5, 0.22, 0.05, 0, 2.5, 1.38);
    p.sphere(PAL.gold, 0.07, 0, 3.0, -0.1, { seg: 5 });
  } else {
    // roman villa: main block + wings + arch entry
    p.box(s.wall, 2.7, 1.35, 2.0, 0, 1.0, -0.45);
    gabledRoof(p, s, 3.0, 0.8, 2.35, 0, 1.68, -0.45);
    win(p, s.wallDark, -0.85, 1.15, 0.56);
    win(p, s.wallDark, 0.85, 1.15, 0.56);
    for (const sx of [-1, 1]) {
      p.box(s.wall, 1.1, 0.95, 1.5, sx * 1.55, 0.8, 0.4);
      gabledRoof(p, s, 1.3, 0.5, 1.7, sx * 1.55, 1.28, 0.4);
      win(p, s.wallDark, sx * 1.55, 0.85, 1.16, { w: 0.15, h: 0.2 });
    }
    // arch entrance
    for (const sx of [-1, 1]) p.box(s.column, 0.28, 1.1, 0.3, sx * 0.55, 0.85, 1.35);
    p.torus(s.column, 0.55, 0.13, Math.PI, 0, 1.4, 1.35, { rz: 0 });
    p.box(s.trim, 1.5, 0.16, 0.34, 0, 1.78, 1.35);
    p.box(PAL.gold, 0.14, 0.14, 0.03, 0, 1.62, 1.53, { rz: Math.PI / 4 }); // keystone stud
    doorway(p, 0x40302a, 0.6, 0.9, 0, 0.32, 1.28, { frame: s.wallDark });
    steps(p, s.column, 1.1, 0, 0, 1.62);
    // standards flanking the gate
    for (const sx of [-1, 1]) {
      flagpole(p, sx * 1.7, 0.3, 1.55, 1.3, s.accent);
      p.box(s.accent, 0.5, 0.34, 0.04, sx * 1.7, 1.15, 1.55);
      p.box(PAL.gold, 0.5, 0.05, 0.05, sx * 1.7, 1.35, 1.55);
    }
  }
}

function house(p: Parts, s: Style, f: Faction) {
  p.box(PAL.sandLight, 1.85, 0.14, 1.85, 0, 0.07, 0);
  if (f === 'egypt') {
    p.box(s.wall, 1.45, 0.9, 1.45, 0, 0.58, 0);
    p.box(s.wallDark, 1.55, 0.12, 1.55, 0, 1.06, 0);
    crenellations(p, s.wall, 1.5, 1.18, 0.72, 3);
    crenellations(p, s.wall, 1.5, 1.18, -0.72, 3);
    doorway(p, 0x3a2c1c, 0.4, 0.6, 0, 0.14, 0.74, { frame: s.wallDark });
    win(p, s.wallDark, -0.45, 0.75, 0.74, { w: 0.14, h: 0.18 });
    win(p, s.wallDark, 0.74, 0.7, 0.35, { ry: Math.PI / 2, w: 0.14, h: 0.18 });
    // striped awning on carved posts
    p.box(s.accent, 0.8, 0.04, 0.5, 0, 0.95, 0.95, { rx: 0.25 });
    p.box(PAL.cloth, 0.8, 0.045, 0.25, 0, 1.0, 0.83, { rx: 0.25 });
    for (const sx of [-1, 1]) {
      p.cyl(PAL.woodDark, 0.02, 0.02, 0.85, sx * 0.36, 0.45, 1.1, { seg: 4 });
      p.sphere(PAL.gold, 0.028, sx * 0.36, 0.89, 1.1, { seg: 4 });
    }
    // rooftop water jars + drying cloth
    amphora(p, 0xb5744a, 0.45, 1.12, 0.72);
    p.box(PAL.cloth, 0.4, 0.025, 0.3, -0.35, 1.14, -0.2, { ry: 0.3, shade: 1.05 });
    amphora(p, 0xb5744a, 0.55, 0.62, 0.8);
  } else if (f === 'greece') {
    p.box(s.wall, 1.4, 0.85, 1.3, 0, 0.56, 0);
    gabledRoof(p, s, 1.66, 0.55, 1.56, 0, 0.98, 0);
    doorway(p, 0x37455e, 0.4, 0.6, 0, 0.14, 0.67, { frame: s.wallDark });
    win(p, s.wallDark, -0.42, 0.68, 0.66, { w: 0.14, h: 0.2 });
    win(p, s.wallDark, 0.71, 0.62, 0.3, { ry: Math.PI / 2, w: 0.14, h: 0.18 });
    p.box(s.accent, 0.5, 0.1, 0.05, 0, 0.85, 0.68);
    // trellis with climbing vine against the wall
    p.box(PAL.woodDark, 0.4, 0.5, 0.03, -0.55, 0.5, 0.66);
    p.sphere(PAL.olive, 0.13, -0.55, 0.62, 0.68, { sy: 0.6 });
    p.sphere(PAL.oliveDark, 0.09, -0.45, 0.45, 0.68, { sy: 0.6 });
    amphora(p, 0x9c5a3c, -0.6, 0.55, 0.9);
  } else {
    p.box(s.wall, 1.45, 0.8, 1.35, 0, 0.54, 0);
    gabledRoof(p, s, 1.7, 0.5, 1.6, 0, 0.94, 0);
    p.box(s.roof, 1.74, 0.07, 0.3, 0, 0.96, 0.68, { shade: 0.9 });
    doorway(p, 0x40302a, 0.4, 0.62, 0.25, 0.14, 0.7, { frame: s.wallDark });
    win(p, s.wallDark, -0.35, 0.68, 0.71, { w: 0.15, h: 0.2 });
    win(p, s.wallDark, 0.74, 0.62, -0.2, { ry: Math.PI / 2, w: 0.14, h: 0.18 });
    p.box(s.column, 0.5, 0.05, 0.06, 0.25, 0.8, 0.71);
    // window flower box
    p.box(PAL.woodDark, 0.3, 0.07, 0.09, -0.35, 0.52, 0.73);
    p.sphere(0xd8687a, 0.035, -0.42, 0.58, 0.73, { seg: 4 });
    p.sphere(0xe8e0a0, 0.035, -0.3, 0.58, 0.73, { seg: 4 });
    crates(p, -0.6, 0.55, 0.7);
  }
}

function farmBase(p: Parts, s: Style, f: Faction) {
  p.box(PAL.soil, 2.75, 0.1, 2.75, 0, 0.05, 0);
  p.box(0x5e4830, 2.85, 0.06, 2.85, 0, 0.03, 0);
  // fence posts
  for (let i = 0; i < 4; i++) {
    const t = -1.35 + i * 0.9;
    p.cyl(PAL.woodDark, 0.035, 0.035, 0.34, t, 0.17, -1.42, { seg: 4 });
    p.cyl(PAL.woodDark, 0.035, 0.035, 0.34, t, 0.17, 1.42, { seg: 4 });
    p.cyl(PAL.woodDark, 0.035, 0.035, 0.34, -1.42, 0.17, t, { seg: 4 });
    p.cyl(PAL.woodDark, 0.035, 0.035, 0.34, 1.42, 0.17, t, { seg: 4 });
  }
  p.box(PAL.wood, 2.85, 0.045, 0.05, 0, 0.3, -1.42);
  p.box(PAL.wood, 2.85, 0.045, 0.05, 0, 0.3, 1.42);
  p.box(PAL.wood, 0.05, 0.045, 2.85, -1.42, 0.3, 0);
  p.box(PAL.wood, 0.05, 0.045, 2.85, 1.42, 0.3, 0);
}

/** Farm crops: golden wheat (Egypt), staked grapevines (Greece), leafy
 *  vegetable rows (Rome). Withered fields turn to dry stubble. */
export function cropGeo(faction: Faction, withered: boolean): THREE.BufferGeometry {
  return cached(`crop_${faction}_${withered}`, p => {
    for (let r = 0; r < 4; r++) {
      const z = -1.0 + r * 0.66;
      for (let i = 0; i < 6; i++) {
        // stagger alternate rows so the field reads as planted, not stamped
        const x = -1.05 + i * 0.42 + (r % 2) * 0.13;
        const rnd = (i * 3 + r * 7) % 5;           // stable per-plant variation
        const k = 0.85 + rnd * 0.07;               // size
        const sh = 0.92 + ((i + r * 3) % 4) * 0.05; // tint
        if (withered) {
          // dry stubble: a few bent brown stalks
          for (let s = 0; s < 3; s++) {
            const a = s * 2.1 + i * 1.3 + r;
            p.cone(0x8f7d52, 0.022, 0.16 * k, x + Math.cos(a) * 0.06, 0.08, z + Math.sin(a) * 0.06,
              { seg: 3, rx: Math.sin(a) * 0.45, rz: Math.cos(a) * 0.45, shade: sh });
          }
        } else if (faction === 'egypt') {
          // wheat sheaf: dense splayed golden stalks, bright seed tips
          for (let s = 0; s < 6; s++) {
            const a = s * 1.05 + i * 1.3 + r;
            const h = (0.32 + (s % 2) * 0.1) * k;
            p.cone(0xe3bf5e, 0.032, h, x + Math.cos(a) * 0.06, h / 2, z + Math.sin(a) * 0.06,
              { seg: 4, rx: Math.sin(a) * 0.22, rz: Math.cos(a) * 0.22, shade: sh * 1.05 });
          }
          p.sphere(0xf0d382, 0.06 * k, x, 0.36 * k, z, { seg: 4, sy: 1.5, shade: sh });
          p.sphere(0xe8cd76, 0.045 * k, x + 0.06, 0.3 * k, z - 0.04, { seg: 4, sy: 1.5, shade: sh * 0.95 });
        } else if (faction === 'greece') {
          // grapevine on a stake, clusters on every other plant
          p.cyl(PAL.woodDark, 0.016, 0.02, 0.38 * k, x, 0.19 * k, z, { seg: 4 });
          p.sphere(0x5f8a3c, 0.11 * k, x, 0.34 * k, z, { seg: 5, sy: 0.85, shade: sh });
          p.sphere(0x548034, 0.07 * k, x + 0.06, 0.26 * k, z + 0.04, { seg: 4, shade: sh * 0.95 });
          if (rnd < 3) p.sphere(0x5c3a6e, 0.035 * k, x - 0.06, 0.24 * k, z - 0.03, { seg: 4 });
        } else {
          // roman kitchen garden: cabbage heads in tilled rows
          p.sphere(0x6f9c48, 0.11 * k, x, 0.08 * k, z, { seg: 5, sy: 0.75, shade: sh });
          p.sphere(0x8fb85c, 0.06 * k, x, 0.13 * k, z, { seg: 4, shade: sh });
          if (rnd < 2) p.cone(0x5f8a3c, 0.03, 0.1 * k, x + 0.09, 0.06, z + 0.05, { seg: 3, rz: 0.4, shade: sh });
        }
      }
    }
  });
}

function storehouse(p: Parts, s: Style, f: Faction) {
  p.box(PAL.sandLight, 1.85, 0.14, 1.85, 0, 0.07, 0);
  if (f === 'egypt') {
    // granary domes with masonry rings and a ladder to the hatch
    p.sphere(s.wall, 0.52, -0.4, 0.45, -0.3, { sy: 1.25 });
    p.cyl(s.wallDark, 0.43, 0.46, 0.05, -0.4, 0.42, -0.3, { seg: 8, shade: 1.02 });
    p.sphere(s.wallDark, 0.44, 0.5, 0.4, 0.25, { sy: 1.25 });
    p.cyl(s.wall, 0.36, 0.39, 0.05, 0.5, 0.38, 0.25, { seg: 8, shade: 0.97 });
    p.sphere(s.wall, 0.34, -0.15, 0.3, 0.62, { sy: 1.2 });
    p.box(0x3a2c1c, 0.14, 0.14, 0.05, -0.4, 0.92, -0.14); // top hatch
    for (const [dx, dz] of [[-0.4, -0.3], [0.5, 0.25]]) {
      p.box(0x3a2c1c, 0.2, 0.26, 0.06, dx, 0.2, dz + 0.42);
    }
    // wooden ladder against the big dome
    for (const sx of [-1, 1]) p.cyl(PAL.woodDark, 0.018, 0.018, 0.85, -0.4 + sx * 0.09, 0.44, 0.24, { seg: 4, rx: -0.5 });
    for (let i = 0; i < 4; i++) p.box(PAL.wood, 0.2, 0.025, 0.03, -0.4, 0.18 + i * 0.19, 0.36 - i * 0.11);
    basket(p, 0.2, 0.72);
    crates(p, 0.55, -0.55, 0.8);
  } else if (f === 'greece') {
    p.box(s.wall, 1.5, 0.2, 1.3, 0, 0.2, 0);
    colonnade(p, s, 3, -0.55, 0.55, 0.3, 0.5, 0.75, 0.075);
    p.box(s.wall, 1.4, 0.6, 0.6, 0, 0.6, -0.3);
    win(p, s.wallDark, -0.4, 0.75, 0.02, { w: 0.13, h: 0.16 });
    win(p, s.wallDark, 0.4, 0.75, 0.02, { w: 0.13, h: 0.16 });
    p.box(s.wallDark, 1.6, 0.12, 1.4, 0, 1.11, 0);
    gabledRoof(p, s, 1.7, 0.42, 1.5, 0, 1.17, 0);
    // grain sacks stacked between the columns
    p.sphere(0xd8c096, 0.13, 0.15, 0.42, 0.5, { sy: 0.8 });
    p.sphere(0xcbb184, 0.11, -0.18, 0.4, 0.52, { sy: 0.8, shade: 0.95 });
    amphora(p, 0x9c5a3c, -0.6, 0.62, 1);
    amphora(p, 0xb5744a, 0.68, 0.55, 0.85);
  } else {
    p.box(s.wall, 1.5, 0.85, 1.3, 0, 0.56, -0.1);
    gabledRoof(p, s, 1.74, 0.5, 1.55, 0, 0.98, -0.1);
    doorway(p, 0x40302a, 0.5, 0.6, 0, 0.14, 0.56, { frame: s.wallDark });
    win(p, s.wallDark, -0.5, 0.75, 0.54, { w: 0.14, h: 0.18 });
    crates(p, 0.55, 0.62, 0.9);
    // barrel + sack by the door
    p.cyl(0x7a5a38, 0.14, 0.14, 0.3, -0.55, 0.15, 0.62, { seg: 7 });
    p.cyl(0x6a4c30, 0.145, 0.145, 0.03, -0.55, 0.24, 0.62, { seg: 7 });
    p.sphere(0xd8c096, 0.11, -0.78, 0.1, 0.42, { sy: 0.75 });
  }
}

function barracks(p: Parts, s: Style, f: Faction) {
  p.box(PAL.sandLight, 2.8, 0.16, 2.8, 0, 0.08, 0);
  const shieldColor = s.accent;
  if (f === 'egypt') {
    // walled compound
    p.box(s.wall, 2.5, 0.65, 0.18, 0, 0.45, -1.2);
    p.box(s.wall, 2.5, 0.65, 0.18, 0, 0.45, 1.2);
    p.box(s.wall, 0.18, 0.65, 2.5, -1.2, 0.45, 0);
    p.box(s.wall, 0.18, 0.65, 2.5, 1.2, 0.45, 0);
    for (const [cx, cz] of [[-1.2, -1.2], [1.2, -1.2], [-1.2, 1.2], [1.2, 1.2]]) {
      p.box(s.wallDark, 0.4, 0.95, 0.4, cx, 0.55, cz);
      p.box(s.accent, 0.46, 0.1, 0.46, cx, 1.06, cz);
    }
    p.box(s.wall, 1.6, 0.95, 1.1, -0.2, 0.6, -0.45);
    p.box(s.wallDark, 1.7, 0.12, 1.2, -0.2, 1.13, -0.45);
    doorway(p, 0x3a2c1c, 0.42, 0.62, -0.2, 0.16, 0.12, { frame: s.wallDark });
    win(p, s.wallDark, -0.75, 0.75, 0.11, { w: 0.13, h: 0.17 });
    wallBanner(p, s, 0.35, 0.95, 0.13, 0, 0.8);
    // weapon rack
    for (let i = 0; i < 3; i++) {
      p.cyl(PAL.woodDark, 0.02, 0.02, 0.8, 0.7 + i * 0.16, 0.5, 0.6, { seg: 4, rz: 0.35 });
      p.cone(PAL.stoneLight, 0.045, 0.12, 0.7 + i * 0.16 + Math.sin(0.35) * 0.4 * 0.5, 0.9, 0.6, { seg: 5, rz: 0.35 });
    }
  } else {
    // hall style (greece/rome)
    p.box(s.wall, 2.2, 1.05, 1.7, 0, 0.7, -0.25);
    gabledRoof(p, s, 2.5, 0.65, 2.0, 0, 1.22, -0.25);
    doorway(p, f === 'greece' ? 0x37455e : 0x40302a, 0.5, 0.7, 0, 0.18, 0.62, { frame: s.wallDark });
    win(p, s.wallDark, -1.12, 0.85, -0.25, { ry: -Math.PI / 2, w: 0.14, h: 0.2 });
    win(p, s.wallDark, 1.12, 0.85, -0.25, { ry: Math.PI / 2, w: 0.14, h: 0.2 });
    // shields on the facade
    for (let i = 0; i < 3; i++) {
      const x = -0.7 + i * 0.7;
      if (f === 'greece') {
        p.cyl(shieldColor, 0.16, 0.16, 0.05, x, 0.85, 0.63, { seg: 8, rx: Math.PI / 2 });
        p.cyl(PAL.gold, 0.05, 0.05, 0.06, x, 0.85, 0.64, { seg: 6, rx: Math.PI / 2 });
      } else {
        p.box(shieldColor, 0.24, 0.34, 0.05, x, 0.85, 0.63);
        p.box(PAL.gold, 0.05, 0.24, 0.06, x, 0.85, 0.64);
      }
    }
    // spears leaning
    for (let i = 0; i < 3; i++) {
      p.cyl(PAL.woodDark, 0.018, 0.018, 1.1, 1.0 + i * 0.12, 0.55, 0.75, { seg: 4, rz: 0.2, rx: 0.1 });
    }
    // training dummy
    p.cyl(PAL.wood, 0.04, 0.04, 0.7, -0.95, 0.35, 0.75, { seg: 5 });
    p.box(PAL.cloth, 0.3, 0.3, 0.14, -0.95, 0.75, 0.75);
    p.sphere(PAL.sandLight, 0.1, -0.95, 1.0, 0.75, { seg: 5 });
  }
}

function archeryRange(p: Parts, s: Style, f: Faction) {
  p.box(PAL.sandLight, 2.8, 0.16, 2.8, 0, 0.08, 0);
  // hut
  p.box(s.wall, 1.4, 0.8, 1.1, -0.65, 0.55, -0.7);
  if (f === 'egypt') {
    p.box(s.wallDark, 1.5, 0.1, 1.2, -0.65, 1.0, -0.7);
    p.box(s.accent, 1.45, 0.06, 1.15, -0.65, 1.08, -0.7);
  } else {
    gabledRoof(p, s, 1.6, 0.5, 1.3, -0.65, 0.95, -0.7);
  }
  doorway(p, 0x3a2c1c, 0.38, 0.55, -0.65, 0.16, -0.14, { frame: s.wallDark });
  win(p, s.wallDark, -1.36, 0.7, -0.7, { ry: -Math.PI / 2, w: 0.13, h: 0.17 });
  // strung bow + quiver by the door
  p.torus(PAL.woodDark, 0.16, 0.014, Math.PI * 0.9, -0.2, 0.55, -0.16, { rz: Math.PI * 0.55 });
  p.cyl(0x6b4f33, 0.045, 0.045, 0.3, -0.05, 0.35, -0.16, { seg: 5, rz: 0.3 });
  // targets
  for (const [tx, tz, r] of [[0.85, 0.6, 0.34], [0.2, 1.0, 0.28]]) {
    p.cyl(PAL.cloth, r, r, 0.09, tx, 0.55, tz, { seg: 9, rx: Math.PI / 2, rz: -0.15 });
    p.cyl(0xc0392b, r * 0.62, r * 0.62, 0.1, tx, 0.55, tz + 0.006, { seg: 9, rx: Math.PI / 2, rz: -0.15 });
    p.cyl(PAL.cloth, r * 0.34, r * 0.34, 0.11, tx, 0.55, tz + 0.012, { seg: 9, rx: Math.PI / 2, rz: -0.15 });
    p.cyl(PAL.woodDark, 0.03, 0.03, 0.55, tx, 0.25, tz - 0.1, { seg: 4, rx: -0.2 });
  }
  // hay bales
  p.box(PAL.wheat, 0.4, 0.28, 0.3, -0.1, 0.14, 0.9, { ry: 0.4 });
  p.box(PAL.wheat, 0.36, 0.26, 0.28, 0.3, 0.13, 1.05, { ry: 0.9, shade: 0.92 });
  // fence
  for (let i = 0; i < 3; i++) {
    p.cyl(PAL.woodDark, 0.03, 0.03, 0.4, 1.25, 0.2, -1.0 + i * 0.8, { seg: 4 });
  }
  p.box(PAL.wood, 0.05, 0.05, 1.9, 1.25, 0.36, -0.2);
}

/**
 * Siege Workshop: an open-sided timber shed over a working yard — a half-built
 * engine on the stocks, a stack of seasoned beams, a wheelwright's spare wheel
 * and a smith's anvil. Deliberately unfinished-looking; this is a yard, not a hall.
 */
function siegeWorks(p: Parts, s: Style, f: Faction) {
  p.box(PAL.dirt, 2.8, 0.16, 2.8, 0, 0.08, 0, { shade: 0.96 });
  // trodden earth around the stocks
  p.box(PAL.soil, 1.9, 0.03, 1.5, 0.1, 0.17, 0.35, { shade: 1.05 });

  // open shed: four posts, cross-braces, a shallow roof over the back half
  for (const [px, pz] of [[-1.15, -1.15], [1.15, -1.15], [-1.15, 0.25], [1.15, 0.25]]) {
    p.box(PAL.woodDark, 0.17, 1.25, 0.17, px, 0.78, pz);
  }
  p.box(PAL.wood, 2.6, 0.13, 0.15, 0, 1.42, -1.15);
  p.box(PAL.wood, 2.6, 0.13, 0.15, 0, 1.42, 0.25);
  p.box(PAL.wood, 0.13, 0.11, 1.55, -1.15, 1.42, -0.45);
  p.box(PAL.wood, 0.13, 0.11, 1.55, 1.15, 1.42, -0.45);
  if (f === 'egypt') {
    // flat reed roof weighted with mud brick
    p.box(0xb99a68, 2.75, 0.12, 1.75, 0, 1.55, -0.45);
    p.box(s.wallDark, 2.5, 0.07, 1.5, 0, 1.63, -0.45, { shade: 0.95 });
  } else {
    gabledRoof(p, { roof: s.roof }, 2.8, 0.5, 1.8, 0, 1.49, -0.45);
  }
  // back wall of the shed, planked
  for (let i = 0; i < 5; i++) {
    p.box(i % 2 ? PAL.wood : PAL.woodLight, 0.52, 1.1, 0.09, -1.04 + i * 0.52, 0.68, -1.22);
  }

  // the engine on the stocks: a frame taking shape, arm not yet mounted
  p.box(PAL.woodDark, 0.13, 0.13, 1.2, -0.34, 0.45, 0.35);
  p.box(PAL.woodDark, 0.13, 0.13, 1.2, 0.54, 0.45, 0.35);
  p.box(PAL.wood, 1.05, 0.11, 0.13, 0.1, 0.52, -0.15);
  p.box(PAL.wood, 0.11, 0.62, 0.11, -0.34, 0.82, 0.1, { rx: -0.22 });
  p.box(PAL.wood, 0.11, 0.62, 0.11, 0.54, 0.82, 0.1, { rx: -0.22 });
  // trestles holding it off the ground
  for (const tz of [-0.05, 0.75]) {
    p.box(PAL.woodDark, 1.15, 0.09, 0.1, 0.1, 0.36, tz);
    p.box(PAL.woodDark, 0.09, 0.36, 0.09, -0.3, 0.18, tz, { rz: 0.16 });
    p.box(PAL.woodDark, 0.09, 0.36, 0.09, 0.5, 0.18, tz, { rz: -0.16 });
  }

  // seasoned timber stacked against the posts
  for (let i = 0; i < 3; i++) {
    p.cyl(PAL.woodLight, 0.09, 0.09, 1.5, -0.98 + i * 0.02, 0.24 + i * 0.17, -0.5,
      { seg: 6, rx: Math.PI / 2, shade: 1 - i * 0.04 });
  }
  for (let i = 0; i < 2; i++) {
    p.cyl(PAL.wood, 0.09, 0.09, 1.5, -0.79, 0.32 + i * 0.17, -0.5, { seg: 6, rx: Math.PI / 2 });
  }
  // a spare wheel leaning on the frame
  p.cyl(PAL.woodDark, 0.34, 0.34, 0.09, 1.02, 0.42, 0.72, { seg: 10, rz: Math.PI / 2, rx: 0.25 });
  p.cyl(PAL.wood, 0.24, 0.24, 0.1, 1.02, 0.42, 0.72, { seg: 9, rz: Math.PI / 2, rx: 0.25 });
  p.cyl(0x6a625a, 0.07, 0.07, 0.12, 1.02, 0.42, 0.72, { seg: 6, rz: Math.PI / 2, rx: 0.25 });
  // smith's anvil and a barrel of pitch
  p.box(PAL.woodDark, 0.22, 0.24, 0.22, -1.0, 0.28, 0.95);
  p.box(0x6a625a, 0.36, 0.13, 0.18, -1.0, 0.46, 0.95);
  p.cone(0x6a625a, 0.09, 0.16, -1.2, 0.46, 0.95, { seg: 5, rz: Math.PI / 2 });
  p.cyl(0x4a3a2a, 0.17, 0.19, 0.42, -0.55, 0.21, 1.12, { seg: 8 });
  p.cyl(0x2e2a24, 0.16, 0.16, 0.05, -0.55, 0.43, 1.12, { seg: 8 });
  // a finished ram head waiting to be fitted
  p.cyl(PAL.woodDark, 0.11, 0.11, 0.5, 0.95, 0.16, -0.8, { seg: 7, rx: Math.PI / 2 });
  p.cone(0x8a8378, 0.14, 0.22, 0.95, 0.16, -1.08, { seg: 6, rx: Math.PI / 2 });
  // banner so the yard still reads as yours from above
  flagpole(p, -1.15, 1.35, 0.25, 0.9, s.accent);
}

function tower(p: Parts, s: Style, f: Faction) {
  // stone base with masonry courses and an arrow slit
  p.box(PAL.sandLight, 1.7, 0.14, 1.7, 0, 0.07, 0);
  p.cyl(s.wallDark, 0.5, 0.66, 1.5, 0, 0.85, 0, { seg: 4, ry: Math.PI / 4 });
  p.cyl(s.wall, 0.62, 0.64, 0.07, 0, 0.32, 0, { seg: 4, ry: Math.PI / 4, shade: 0.94 });
  p.cyl(s.wall, 0.56, 0.58, 0.07, 0, 0.85, 0, { seg: 4, ry: Math.PI / 4, shade: 0.94 });
  p.box(0x33291f, 0.08, 0.3, 0.06, 0, 1.15, 0.62);
  p.box(s.wall, 1.02, 0.16, 1.02, 0, 1.66, 0);
  // wooden platform
  p.box(PAL.wood, 1.35, 0.1, 1.35, 0, 1.78, 0);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    p.cyl(PAL.woodDark, 0.04, 0.04, 0.55, sx * 0.58, 2.05, sz * 0.58, { seg: 4 });
    p.cyl(PAL.woodDark, 0.05, 0.06, 1.7, sx * 0.52, 0.9, sz * 0.52, { seg: 4, rz: sx * -0.06, rx: sz * 0.06 });
  }
  // railing
  p.box(PAL.wood, 1.3, 0.05, 0.05, 0, 2.1, -0.62);
  p.box(PAL.wood, 1.3, 0.05, 0.05, 0, 2.1, 0.62);
  p.box(PAL.wood, 0.05, 0.05, 1.3, -0.62, 2.1, 0);
  p.box(PAL.wood, 0.05, 0.05, 1.3, 0.62, 2.1, 0);
  // canopy
  if (f === 'greece' || f === 'rome') {
    gabledRoof(p, s, 1.5, 0.45, 1.5, 0, 2.32, 0);
    flagpole(p, 0, 2.77, 0, 0.5, s.accent);
  } else {
    // striped cloth canopy
    for (let i = 0; i < 5; i++) {
      p.box(i % 2 === 0 ? s.accent : PAL.cloth, 0.29, 0.045, 1.5, -0.58 + i * 0.29, 2.38, 0, { rz: 0.04 });
    }
  }
}

function wallSeg(p: Parts, s: Style, f: Faction, tier = 0) {
  p.box(s.wallDark, 0.98, 1.1, 0.98, 0, 0.55, 0);
  // masonry course lines
  p.box(s.wall, 1.0, 0.06, 1.0, 0, 0.38, 0, { shade: 0.88 });
  p.box(s.wall, 1.0, 0.06, 1.0, 0, 0.78, 0, { shade: 0.88 });
  p.box(s.wall, 1.06, 0.22, 1.06, 0, 1.2, 0);
  crenellations(p, s.wall, 1.0, 1.4, 0, 2);
  // Every segment doubles as a gatehouse: wooden doors on each face.
  for (const sz of [-1, 1]) {
    p.box(PAL.woodDark, 0.44, 0.6, 0.05, 0, 0.3, sz * 0.5);
    p.box(PAL.wood, 0.05, 0.6, 0.06, -0.12, 0.3, sz * 0.5);
    p.box(PAL.wood, 0.05, 0.6, 0.06, 0.12, 0.3, sz * 0.5);
    p.box(0x4a3a26, 0.52, 0.07, 0.05, 0, 0.64, sz * 0.5);
    p.box(PAL.woodDark, 0.05, 0.6, 0.44, sz * 0.5, 0.3, 0);
    p.box(PAL.wood, 0.06, 0.6, 0.05, sz * 0.5, 0.3, -0.12);
    p.box(PAL.wood, 0.06, 0.6, 0.05, sz * 0.5, 0.3, 0.12);
    p.box(0x4a3a26, 0.05, 0.07, 0.52, sz * 0.5, 0.64, 0);
  }
  if (tier >= 2) {
    // Bronze Age masonry: a taller stone crown
    p.box(s.wallDark, 1.0, 0.16, 1.0, 0, 1.36, 0);
    crenellations(p, s.wallDark, 1.02, 1.56, 0, 2);
  }
}

function monument(p: Parts, s: Style, f: Faction) {
  p.box(PAL.sandLight, 2.85, 0.18, 2.85, 0, 0.09, 0);
  if (f === 'egypt') {
    p.box(s.wall, 1.7, 0.3, 1.7, 0, 0.32, 0);
    p.box(s.wallDark, 1.2, 0.26, 1.2, 0, 0.6, 0);
    p.cyl(s.wall, 0.16, 0.34, 2.3, 0, 1.85, 0, { seg: 4, ry: Math.PI / 4 });
    p.cone(PAL.goldBright, 0.34, 0.42, 0, 3.2, 0, { seg: 4, ry: Math.PI / 4 });
    p.box(s.accent, 0.72, 0.1, 0.72, 0, 0.75, 0);
    for (const sx of [-1, 1]) {
      // mini sphinxes
      p.box(s.wallDark, 0.32, 0.22, 0.6, sx * 0.95, 0.55, 0.75, { shade: 0.95 });
      p.box(s.wall, 0.2, 0.24, 0.2, sx * 0.95, 0.72, 0.99);
    }
  } else if (f === 'greece') {
    // mini parthenon
    p.box(s.wall, 2.5, 0.18, 1.9, 0, 0.3, 0);
    p.box(s.wallDark, 2.3, 0.14, 1.7, 0, 0.45, 0);
    colonnade(p, s, 5, -0.95, 0.95, 0.52, 0.72, 1.1, 0.08);
    colonnade(p, s, 5, -0.95, 0.95, 0.52, -0.72, 1.1, 0.08);
    p.box(s.wall, 1.5, 1.0, 1.1, 0, 1.05, 0);
    p.box(s.wallDark, 2.35, 0.16, 1.8, 0, 1.7, 0);
    gabledRoof(p, s, 2.55, 0.6, 1.95, 0, 1.78, 0);
    p.box(s.trim, 2.6, 0.07, 0.16, 0, 1.8, 0.95);
    p.box(PAL.gold, 0.4, 0.18, 0.05, 0, 2.05, 0.93); // pediment relief
    steps(p, s.wall, 1.2, 0, 0, 1.0);
    p.sphere(PAL.gold, 0.06, 0, 2.42, 0, { seg: 5 });
  } else {
    // triumphal arch
    for (const sx of [-1, 1]) {
      p.box(s.wall, 0.6, 1.7, 0.8, sx * 0.85, 0.95, 0);
      p.box(s.trim, 0.68, 0.1, 0.88, sx * 0.85, 1.6, 0);
    }
    p.torus(s.wall, 0.85, 0.22, Math.PI, 0, 1.55, 0);
    p.box(s.wall, 2.4, 0.6, 0.85, 0, 2.15, 0);
    p.box(PAL.gold, 2.2, 0.12, 0.87, 0, 2.05, 0);
    p.box(s.accent, 0.7, 0.3, 0.06, 0, 2.2, 0.45);
    for (const sx of [-1, 1]) p.sphere(PAL.goldBright, 0.09, sx * 0.9, 2.55, 0, { seg: 6 });
    p.sphere(PAL.goldBright, 0.11, 0, 2.62, 0, { seg: 6 });
  }
}

function dock(p: Parts, s: Style, f: Faction) {
  // planked deck on posts
  p.box(PAL.wood, 1.9, 0.12, 1.9, 0, 0.28, 0);
  for (let i = 0; i < 4; i++) {
    p.box(PAL.woodLight, 1.86, 0.02, 0.4, 0, 0.35, -0.7 + i * 0.47, { shade: 0.95 + (i % 2) * 0.08 });
  }
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    p.cyl(PAL.woodDark, 0.06, 0.07, 0.9, sx * 0.8, 0.05, sz * 0.8, { seg: 5 });
  }
  // rope posts with slung mooring line
  p.cyl(PAL.woodDark, 0.05, 0.05, 0.4, 0.8, 0.5, 0, { seg: 5 });
  p.cyl(PAL.woodDark, 0.05, 0.05, 0.4, -0.8, 0.5, 0.5, { seg: 5 });
  p.torus(0xc9b184, 0.09, 0.02, Math.PI * 2, 0.8, 0.62, 0, { rx: Math.PI / 2 });
  // crane
  p.cyl(PAL.woodDark, 0.05, 0.06, 1.1, -0.5, 0.85, -0.5, { seg: 5 });
  p.cyl(PAL.wood, 0.04, 0.04, 0.9, -0.15, 1.3, -0.5, { seg: 4, rz: -Math.PI / 2.3 });
  p.box(PAL.woodDark, 0.02, 0.35, 0.02, 0.25, 1.15, -0.5);
  p.box(PAL.wood, 0.18, 0.14, 0.18, 0.25, 0.95, -0.5);
  crates(p, 0.45, 0.55, 0.85);
  // coiled rope, fish basket and a lantern post
  p.torus(0xc9b184, 0.1, 0.035, Math.PI * 2, -0.35, 0.36, 0.55, { rx: Math.PI / 2 });
  p.cyl(0xb08d5a, 0.1, 0.08, 0.12, 0.15, 0.4, 0.72, { seg: 6 });
  p.box(0x9ab2b8, 0.05, 0.04, 0.16, 0.12, 0.48, 0.72, { ry: 0.4 });
  p.box(0x7a949a, 0.04, 0.035, 0.13, 0.19, 0.47, 0.7, { ry: -0.3 });
  p.cyl(PAL.woodDark, 0.03, 0.03, 0.75, 0.82, 0.72, -0.75, { seg: 4 });
  p.box(PAL.gold, 0.09, 0.12, 0.09, 0.82, 1.14, -0.75, { shade: 1.1 });
  // pennant
  flagpole(p, -0.85, 0.34, -0.85, 1.1, 0xb03a2e);
}

// ---------------------------------------------------------------- city buildings
function market(p: Parts, s: Style, f: Faction) {
  p.box(PAL.sandLight, 2.8, 0.14, 2.8, 0, 0.07, 0);
  // counting house at the back
  p.box(s.wall, 1.4, 0.8, 1.0, 0, 0.54, -0.8);
  if (f === 'egypt') {
    p.box(s.wallDark, 1.5, 0.1, 1.1, 0, 0.99, -0.8);
    p.box(s.accent, 1.46, 0.06, 1.06, 0, 1.07, -0.8);
  } else {
    gabledRoof(p, s, 1.6, 0.5, 1.25, 0, 0.94, -0.8);
  }
  doorway(p, 0x3a2c1c, 0.4, 0.55, 0, 0.16, -0.28, { frame: s.wallDark });
  win(p, s.wallDark, -0.45, 0.7, -0.29, { w: 0.13, h: 0.16 });
  win(p, s.wallDark, 0.45, 0.7, -0.29, { w: 0.13, h: 0.16 });
  // two awning stalls out front, with scalloped valances
  for (const sx of [-1, 1]) {
    const x0 = sx * 0.8;
    for (const [px, pz] of [[-0.45, -0.35], [0.45, -0.35], [-0.45, 0.5], [0.45, 0.5]]) {
      p.cyl(PAL.woodDark, 0.028, 0.028, 0.78, x0 + px, 0.39, 0.45 + pz, { seg: 4 });
      p.sphere(PAL.gold, 0.025, x0 + px, 0.79, 0.45 + pz, { seg: 4 });
    }
    for (let i = 0; i < 4; i++) {
      const stripe = i % 2 === 0 ? (sx < 0 ? s.accent : PAL.gold) : PAL.cloth;
      p.box(stripe, 0.26, 0.04, 1.0, x0 - 0.39 + i * 0.26, 0.82 - i * 0.015, 0.5, { rz: 0.06 });
    }
    // scalloped valance hanging from the awning's front edge
    for (let i = 0; i < 5; i++) {
      const stripe = i % 2 === 0 ? (sx < 0 ? s.accent : PAL.gold) : PAL.cloth;
      p.box(stripe, 0.2, 0.09, 0.03, x0 - 0.4 + i * 0.2, 0.72, 0.99);
      p.cone(stripe, 0.07, 0.08, x0 - 0.4 + i * 0.2, 0.64, 0.99, { seg: 4, rx: Math.PI, sz: 0.35 });
    }
    p.box(PAL.wood, 0.95, 0.07, 0.45, x0, 0.36, 0.62);
    p.box(PAL.woodDark, 0.95, 0.05, 0.05, x0, 0.15, 0.83); // counter foot rail
    // goods on the counter
    p.sphere(0xd8b455, 0.075, x0 - 0.25, 0.45, 0.6, { seg: 5 });
    p.sphere(PAL.berry, 0.065, x0, 0.44, 0.68, { seg: 5 });
    p.sphere(0x8fa05a, 0.07, x0 + 0.24, 0.45, 0.58, { seg: 5 });
    basket(p, x0 - 0.35, 1.0, 0.9);
  }
  crates(p, -1.0, -0.35, 0.85);
  // hanging cloth bolts on the side of the counting house
  p.box(0x8a4a3c, 0.04, 0.3, 0.22, -0.74, 0.6, -0.75);
  p.box(0x4a6b8a, 0.04, 0.26, 0.2, -0.74, 0.56, -0.5);
  amphora(p, 0xb5744a, 1.05, -0.3, 1);
  amphora(p, 0x9c5a3c, 0.82, -0.5, 0.85);
  // hanging coin sign
  p.cyl(PAL.woodDark, 0.03, 0.035, 1.35, 1.15, 0.68, 1.05, { seg: 5 });
  p.cyl(PAL.wood, 0.02, 0.02, 0.4, 0.97, 1.3, 1.05, { seg: 4, rz: Math.PI / 2 });
  p.cyl(PAL.goldBright, 0.13, 0.13, 0.04, 0.85, 1.12, 1.05, { seg: 8, rz: Math.PI / 2 });
}

function shrine(p: Parts, s: Style, f: Faction) {
  p.box(PAL.sandLight, 1.85, 0.12, 1.85, 0, 0.06, 0);
  p.box(s.wall, 1.25, 0.22, 1.25, 0, 0.22, 0);
  p.box(s.wallDark, 0.95, 0.16, 0.95, 0, 0.4, 0);
  // altar with a living flame
  p.box(s.wall, 0.34, 0.34, 0.34, 0, 0.62, 0.15);
  p.box(s.trim, 0.4, 0.06, 0.4, 0, 0.81, 0.15);
  p.sphere(0xe0813c, 0.09, 0, 0.92, 0.15, { seg: 5 });
  p.sphere(PAL.goldBright, 0.055, 0, 1.0, 0.15, { seg: 4 });
  if (f === 'egypt') {
    for (const sx of [-1, 1]) {
      p.cyl(s.wall, 0.05, 0.09, 0.95, sx * 0.55, 0.9, -0.35, { seg: 4, ry: Math.PI / 4 });
      p.cone(PAL.gold, 0.09, 0.14, sx * 0.55, 1.43, -0.35, { seg: 4, ry: Math.PI / 4 });
    }
    p.box(s.accent, 0.5, 0.4, 0.1, 0, 0.68, -0.42);
    p.box(PAL.gold, 0.54, 0.07, 0.12, 0, 0.92, -0.42);
  } else if (f === 'greece') {
    colonnade(p, s, 2, -0.5, 0.5, 0.48, -0.35, 0.72, 0.07);
    p.box(s.wallDark, 1.3, 0.1, 0.5, 0, 1.24, -0.35);
    gabledRoof(p, s, 1.42, 0.32, 0.62, 0, 1.3, -0.35);
    // votive garland strung between the columns
    p.torus(PAL.olive, 0.34, 0.03, Math.PI, 0, 1.05, -0.28, { rz: Math.PI });
  } else {
    colonnade(p, s, 2, -0.42, 0.42, 0.48, -0.35, 0.68, 0.065);
    p.box(s.trim, 1.15, 0.1, 0.45, 0, 1.2, -0.35);
    gabledRoof(p, s, 1.25, 0.3, 0.55, 0, 1.26, -0.35);
    p.torus(PAL.olive, 0.3, 0.028, Math.PI, 0, 1.02, -0.28, { rz: Math.PI });
    p.sphere(PAL.gold, 0.05, 0, 1.6, -0.35, { seg: 5 });
  }
}

function temple(p: Parts, s: Style, f: Faction) {
  p.box(PAL.sandLight, 1.95, 0.14, 1.95, 0, 0.07, 0, { shade: 1.03 });
  p.box(s.wall, 1.7, 0.18, 1.7, 0, 0.22, 0);
  if (f === 'egypt') {
    // miniature pylon temple
    for (const sx of [-1, 1]) {
      p.cyl(s.wall, 0.24, 0.36, 1.25, sx * 0.6, 0.94, 0.55, { seg: 4, ry: Math.PI / 4 });
      p.box(s.accent, 0.5, 0.09, 0.5, sx * 0.6, 1.55, 0.55, { ry: Math.PI / 4 });
      p.box(PAL.gold, 0.44, 0.06, 0.44, sx * 0.6, 1.62, 0.55, { ry: Math.PI / 4 });
    }
    p.box(s.wall, 0.8, 0.8, 0.4, 0, 0.72, 0.55);
    doorway(p, 0x3a2c1c, 0.34, 0.5, 0, 0.32, 0.77, { frame: PAL.gold });
    p.box(s.wall, 1.5, 1.0, 1.0, 0, 0.82, -0.35);
    win(p, s.wallDark, -0.78, 0.95, -0.35, { ry: -Math.PI / 2, w: 0.12, h: 0.16 });
    win(p, s.wallDark, 0.78, 0.95, -0.35, { ry: Math.PI / 2, w: 0.12, h: 0.16 });
    p.box(s.wallDark, 1.6, 0.14, 1.1, 0, 1.39, -0.35);
    p.box(s.accent, 1.56, 0.08, 1.06, 0, 1.5, -0.35);
    p.cone(PAL.goldBright, 0.16, 0.3, 0, 1.7, -0.35, { seg: 4, ry: Math.PI / 4 });
    steps(p, PAL.sandLight, 0.6, 0, 0, 0.95, { n: 2 });
  } else if (f === 'greece') {
    p.box(s.wallDark, 1.55, 0.12, 1.55, 0, 0.37, 0);
    colonnade(p, s, 3, -0.6, 0.6, 0.44, 0.62, 1.05, 0.075);
    colonnade(p, s, 3, -0.6, 0.6, 0.44, -0.62, 1.05, 0.075);
    p.box(s.wall, 0.95, 0.95, 0.95, 0, 0.9, 0);
    p.box(s.wallDark, 1.6, 0.14, 1.6, 0, 1.55, 0);
    gabledRoof(p, s, 1.75, 0.5, 1.75, 0, 1.62, 0);
    p.box(s.trim, 1.8, 0.07, 0.16, 0, 1.66, 0.82);
    p.box(PAL.gold, 0.36, 0.16, 0.05, 0, 1.85, 0.83); // pediment relief
    steps(p, s.wall, 0.8, 0, 0, 0.82, { n: 2 });
    p.sphere(PAL.gold, 0.07, 0, 2.16, 0, { seg: 5 });
  } else {
    // roman podium temple: high base, deep porch
    p.box(s.wall, 1.5, 0.3, 1.6, 0, 0.36, 0);
    for (let i = 0; i < 3; i++) p.box(s.wallDark, 1.2 - i * 0.15, 0.09, 0.2, 0, 0.2 + i * 0.09, 0.78 - i * 0.14);
    colonnade(p, s, 3, -0.5, 0.5, 0.51, 0.55, 0.95, 0.07);
    p.box(s.wall, 1.1, 0.9, 0.85, 0, 0.96, -0.25);
    win(p, s.wallDark, -0.56, 1.05, -0.25, { ry: -Math.PI / 2, w: 0.12, h: 0.16 });
    win(p, s.wallDark, 0.56, 1.05, -0.25, { ry: Math.PI / 2, w: 0.12, h: 0.16 });
    p.box(s.trim, 1.35, 0.12, 1.5, 0, 1.5, -0.05);
    gabledRoof(p, s, 1.45, 0.45, 1.65, 0, 1.58, -0.05);
    p.box(PAL.gold, 0.32, 0.14, 0.05, 0, 1.76, 0.74); // pediment relief
    p.sphere(PAL.gold, 0.06, 0, 2.06, -0.05, { seg: 5 });
  }
  // votive braziers
  for (const sx of [-1, 1]) {
    p.cyl(0x5a4632, 0.08, 0.06, 0.3, sx * 0.78, 0.35, 0.78, { seg: 5 });
    p.sphere(0xe0813c, 0.06, sx * 0.78, 0.55, 0.78, { seg: 4 });
  }
}

function amphitheaterB(p: Parts, s: Style, f: Faction) {
  p.box(PAL.sandLight, 2.85, 0.14, 2.85, 0, 0.07, 0);
  if (f === 'rome') {
    // oval arena: stacked stone rings with arch shadows
    p.cyl(s.wall, 1.32, 1.38, 0.5, 0, 0.38, 0, { seg: 12 });
    p.cyl(s.wallDark, 1.14, 1.22, 0.45, 0, 0.82, 0, { seg: 12 });
    p.cyl(s.wall, 0.96, 1.04, 0.4, 0, 1.2, 0, { seg: 12, shade: 1.05 });
    p.cyl(0xcbb184, 0.8, 0.8, 1.34, 0, 0.68, 0, { seg: 12, shade: 1.08 }); // arena sand
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + 0.3;
      p.box(0x4a3c2a, 0.16, 0.28, 0.06, Math.cos(a) * 1.34, 0.3, Math.sin(a) * 1.34, { ry: -a + Math.PI / 2 });
    }
    p.box(s.accent, 0.4, 0.24, 0.05, 0, 1.48, 1.02);
    p.box(PAL.gold, 0.44, 0.05, 0.06, 0, 1.62, 1.02);
  } else if (f === 'greece') {
    // hillside theater: stepped half-rings facing the stage
    for (let i = 0; i < 3; i++) {
      p.torus(s.wall, 1.15 - i * 0.27, 0.15, Math.PI, 0, 0.24 + i * 0.22, -0.15, {
        rx: Math.PI / 2, ry: Math.PI, shade: 1 + i * 0.04
      });
    }
    p.cyl(PAL.sandLight, 0.52, 0.52, 0.1, 0, 0.08, 0.35, { seg: 10, shade: 1.05 });
    // skene backdrop with theater masks
    p.box(s.wall, 1.6, 0.6, 0.35, 0, 0.42, 1.0);
    colonnade(p, s, 3, -0.6, 0.6, 0.12, 0.78, 0.5, 0.05);
    gabledRoof(p, s, 1.75, 0.3, 0.5, 0, 0.72, 1.0);
    p.sphere(PAL.white, 0.06, -0.35, 0.5, 0.81, { seg: 5, sy: 1.2 });
    p.sphere(PAL.white, 0.06, 0.35, 0.5, 0.81, { seg: 5, sy: 1.2, shade: 0.92 });
  } else {
    // egyptian festival court: enclosure, masts and a dais
    p.box(s.wall, 2.5, 0.55, 0.16, 0, 0.4, -1.15);
    p.box(s.wall, 0.16, 0.55, 2.3, -1.15, 0.4, 0);
    p.box(s.wall, 0.16, 0.55, 2.3, 1.15, 0.4, 0);
    p.box(s.wall, 1.0, 0.55, 0.16, -0.75, 0.4, 1.15);
    p.box(s.wall, 1.0, 0.55, 0.16, 0.75, 0.4, 1.15);
    for (const sx of [-1, 1]) {
      p.cyl(PAL.woodDark, 0.035, 0.045, 1.7, sx * 0.95, 0.85, -1.0, { seg: 5 });
      p.box(s.accent, 0.06, 0.55, 0.22, sx * 0.95, 1.5, -0.88);
      p.box(PAL.cloth, 0.05, 0.4, 0.18, sx * 0.95, 1.06, -0.9);
    }
    p.box(s.wallDark, 0.9, 0.28, 0.9, 0, 0.24, -0.3);
    p.box(s.accent, 0.7, 0.1, 0.7, 0, 0.43, -0.3);
    p.box(PAL.gold, 0.3, 0.34, 0.3, 0, 0.62, -0.3);
    // spectators' awning
    for (let i = 0; i < 4; i++) {
      p.box(i % 2 === 0 ? s.accent : PAL.cloth, 0.24, 0.04, 0.8, -0.36 + i * 0.24, 0.9, 0.7, { rz: 0.08 });
    }
    for (const sx of [-1, 1]) p.cyl(PAL.woodDark, 0.025, 0.025, 0.9, sx * 0.45, 0.45, 1.05, { seg: 4 });
  }
}

function academy(p: Parts, s: Style, f: Faction) {
  p.box(PAL.sandLight, 2.8, 0.14, 2.8, 0, 0.07, 0);
  // lecture hall
  p.box(s.wall, 1.9, 0.95, 1.3, 0, 0.62, -0.55);
  if (f === 'egypt') {
    p.box(s.wallDark, 2.0, 0.12, 1.4, 0, 1.15, -0.55);
    p.box(s.accent, 1.96, 0.07, 1.36, 0, 1.24, -0.55);
  } else {
    gabledRoof(p, s, 2.15, 0.6, 1.55, 0, 1.09, -0.55);
    p.box(s.trim, 2.2, 0.07, 0.16, 0, 1.13, 0.18);
  }
  doorway(p, 0x37455e, 0.44, 0.62, 0, 0.16, 0.11, { frame: s.wallDark });
  win(p, s.wallDark, -0.7, 0.75, 0.1, { w: 0.14, h: 0.18 });
  win(p, s.wallDark, 0.7, 0.75, 0.1, { w: 0.14, h: 0.18 });
  colonnade(p, s, 3, -0.75, 0.75, 0.15, 0.35, 0.8, 0.07);
  // front steps
  for (let i = 0; i < 3; i++) p.box(s.wallDark, 1.3 - i * 0.2, 0.07, 0.3, 0, 0.06 + i * 0.07, 0.95 - i * 0.18);
  // armillary sphere in the courtyard — the mark of scholars
  p.cyl(PAL.stoneLight, 0.09, 0.12, 0.5, 0.95, 0.32, 0.75, { seg: 6 });
  p.torus(PAL.gold, 0.22, 0.02, Math.PI * 2, 0.95, 0.72, 0.75, { rz: 0.5 });
  p.torus(PAL.goldBright, 0.22, 0.02, Math.PI * 2, 0.95, 0.72, 0.75, { rx: Math.PI / 2, rz: 0.2 });
  p.sphere(s.accent, 0.08, 0.95, 0.72, 0.75, { seg: 6 });
  // scroll rack
  for (let i = 0; i < 3; i++) {
    p.cyl(PAL.cloth, 0.045, 0.045, 0.36, -1.0, 0.14 + i * 0.1, 0.62 + (i % 2) * 0.06, { seg: 5, rz: Math.PI / 2 });
  }
}

function statueB(p: Parts, s: Style, f: Faction) {
  p.box(PAL.stoneLight, 0.85, 0.12, 0.85, 0, 0.06, 0);
  p.box(s.wallDark, 0.52, 0.34, 0.52, 0, 0.29, 0);
  p.box(s.accent, 0.56, 0.07, 0.56, 0, 0.49, 0);
  p.box(PAL.stoneLight, 0.44, 0.06, 0.44, 0, 0.56, 0);
  if (f === 'egypt') {
    // seated guardian in gold
    p.box(PAL.gold, 0.3, 0.42, 0.24, 0, 0.8, -0.04);
    p.box(PAL.gold, 0.3, 0.12, 0.4, 0, 0.65, 0.06, { shade: 0.94 });
    p.sphere(PAL.goldBright, 0.11, 0, 1.1, -0.02, { seg: 6 });
    p.box(s.accent, 0.26, 0.08, 0.2, 0, 1.2, -0.04);
  } else {
    // standing figure, arm raised
    p.box(PAL.gold, 0.1, 0.22, 0.1, -0.06, 0.7, 0);
    p.box(PAL.gold, 0.1, 0.22, 0.1, 0.06, 0.7, 0);
    p.box(PAL.gold, 0.24, 0.34, 0.16, 0, 0.98, 0, { shade: 1.02 });
    p.box(PAL.gold, 0.07, 0.26, 0.07, -0.15, 1.02, 0, { rz: 0.35 });
    p.box(PAL.goldBright, 0.07, 0.3, 0.07, 0.17, 1.2, 0, { rz: -0.5 });
    p.sphere(PAL.goldBright, 0.095, 0, 1.26, 0, { seg: 6 });
    if (f === 'rome') p.sphere(PAL.goldBright, 0.06, 0.28, 1.38, 0, { seg: 4 }); // eagle
    else p.torus(PAL.goldBright, 0.09, 0.015, Math.PI * 2, 0, 1.4, 0, { rx: 0.4 }); // laurel
  }
}

function gardenB(p: Parts, s: Style, f: Faction) {
  // soil bed with stone border
  p.box(0x5e4830, 1.9, 0.07, 1.9, 0, 0.035, 0);
  for (const sz of [-1, 1]) {
    p.box(PAL.stoneLight, 1.95, 0.09, 0.09, 0, 0.045, sz * 0.93);
    p.box(PAL.stoneLight, 0.09, 0.09, 1.95, sz * 0.93, 0.045, 0);
  }
  // basin at the heart
  p.cyl(PAL.stoneLight, 0.28, 0.32, 0.18, 0, 0.09, 0, { seg: 8 });
  p.cyl(0x2e9aa8, 0.22, 0.22, 0.05, 0, 0.19, 0, { seg: 8, shade: 1.15 });
  p.sphere(0xbdeef0, 0.045, 0, 0.28, 0, { seg: 4 });
  // greenery per homeland
  if (f === 'egypt') {
    p.cyl(PAL.trunk, 0.035, 0.05, 0.5, -0.6, 0.25, -0.55, { seg: 5 });
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      p.cone(PAL.palmLeaf, 0.09, 0.4, -0.6 + Math.cos(a) * 0.16, 0.52, -0.55 + Math.sin(a) * 0.16,
        { seg: 4, rx: Math.sin(a) * 1.7, rz: -Math.cos(a) * 1.7, sx: 1.2, sz: 0.4 });
    }
    p.sphere(0x8fa05a, 0.16, 0.6, 0.12, 0.55, { sy: 0.7 });
    p.sphere(PAL.leaf, 0.14, 0.55, 0.1, -0.5, { sy: 0.75 });
  } else {
    p.cone(0x4a6b3a, 0.14, 0.55, -0.6, 0.3, -0.55, { seg: 6 });
    p.cone(0x54783f, 0.1, 0.4, -0.6, 0.62, -0.55, { seg: 5 });
    p.sphere(PAL.olive, 0.17, 0.6, 0.13, 0.55, { sy: 0.75 });
    p.sphere(PAL.oliveDark, 0.13, 0.5, 0.11, -0.5, { sy: 0.7 });
  }
  // flowers
  for (let i = 0; i < 6; i++) {
    const a = i * 1.05 + 0.4, r = 0.55 + (i % 2) * 0.2;
    const colors = [0xd8687a, 0xe8e0a0, 0xe0813c];
    p.sphere(colors[i % 3], 0.035, Math.cos(a) * r, 0.12, Math.sin(a) * r, { seg: 4 });
    p.cyl(0x7d8a4a, 0.01, 0.01, 0.1, Math.cos(a) * r, 0.05, Math.sin(a) * r, { seg: 3 });
  }
}

function plazaB(p: Parts, s: Style, f: Faction) {
  // flat faction paving; people stroll straight across it
  const base = f === 'rome' ? 0xb0a698 : f === 'greece' ? 0xcdc6ad : 0xcdb184;
  const alt = f === 'rome' ? 0xa79d8f : f === 'greece' ? 0xc4bda4 : 0xc4a87b;
  for (const [gx, gz] of [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]]) {
    p.box(base, 0.96, 0.07, 0.96, gx, 0.035, gz, { shade: 0.98 + ((gx + gz + 1) % 2) * 0.04 });
    p.box(alt, 0.42, 0.075, 0.42, gx + 0.22, 0.037, gz - 0.22, { shade: 0.99 });
  }
  // inlaid medallion
  p.cyl(s.accent, 0.34, 0.34, 0.075, 0, 0.04, 0, { seg: 10 });
  p.cyl(PAL.gold, 0.12, 0.12, 0.08, 0, 0.042, 0, { seg: 8 });
}

function lighthouseB(p: Parts, s: Style, f: Faction) {
  p.box(PAL.sandLight, 1.85, 0.16, 1.85, 0, 0.08, 0);
  // pharos tiers with masonry rings
  p.box(s.wallDark, 1.25, 0.55, 1.25, 0, 0.43, 0);
  p.box(s.wall, 1.28, 0.07, 1.28, 0, 0.28, 0, { shade: 0.9 });
  p.box(s.trim, 1.32, 0.08, 1.32, 0, 0.74, 0);
  p.cyl(s.wall, 0.4, 0.52, 1.4, 0, 1.48, 0, { seg: 8 });
  p.cyl(s.wallDark, 0.47, 0.49, 0.06, 0, 1.05, 0, { seg: 8, shade: 1.04 });
  p.cyl(s.wallDark, 0.43, 0.45, 0.06, 0, 1.7, 0, { seg: 8, shade: 1.04 });
  p.cyl(s.wallDark, 0.28, 0.34, 0.75, 0, 2.55, 0, { seg: 8 });
  p.box(s.trim, 0.52, 0.08, 0.52, 0, 2.97, 0);
  for (const sx of [-1, 1]) {
    p.box(s.wall, 0.08, 0.22, 0.08, sx * 0.2, 3.12, 0);
    p.box(s.wall, 0.08, 0.22, 0.08, 0, 3.12, sx * 0.2);
  }
  p.box(s.trim, 0.46, 0.06, 0.46, 0, 3.26, 0);
  // the flame
  p.sphere(0xe0813c, 0.14, 0, 3.4, 0, { seg: 6 });
  p.sphere(PAL.goldBright, 0.09, 0, 3.52, 0, { seg: 5 });
  p.cone(PAL.goldBright, 0.05, 0.14, 0, 3.64, 0, { seg: 4 });
  // window slits
  p.box(0x3a2c1c, 0.1, 0.2, 0.05, 0, 1.5, 0.45);
  p.box(0x3a2c1c, 0.1, 0.18, 0.05, 0.12, 1.05, 0.42);
  doorway(p, 0x3a2c1c, 0.34, 0.45, 0, 0.16, 0.63);
}

function forumB(p: Parts, s: Style, f: Faction) {
  p.box(PAL.sandLight, 2.8, 0.14, 2.8, 0, 0.07, 0);
  // council hall
  p.box(s.wall, 2.1, 1.0, 1.2, 0, 0.66, -0.6);
  p.box(s.wallDark, 2.2, 0.12, 1.3, 0, 1.2, -0.6);
  if (f === 'egypt') {
    p.box(s.accent, 2.16, 0.07, 1.26, 0, 1.3, -0.6);
    crenellations(p, s.wall, 2.1, 1.36, -1.1, 4);
  } else {
    gabledRoof(p, s, 2.35, 0.55, 1.45, 0, 1.28, -0.6);
    p.box(s.trim, 2.4, 0.07, 0.15, 0, 1.32, 0.1);
  }
  win(p, s.wallDark, -0.75, 0.85, 0.02, { w: 0.13, h: 0.17 });
  win(p, s.wallDark, 0.75, 0.85, 0.02, { w: 0.13, h: 0.17 });
  colonnade(p, s, 4, -0.85, 0.85, 0.15, 0.15, 0.9, 0.07);
  doorway(p, 0x40302a, 0.5, 0.66, 0, 0.16, 0.01, { frame: s.wallDark });
  // speaker's rostra
  p.box(s.wallDark, 0.9, 0.3, 0.55, 0, 0.29, 0.85);
  p.box(s.wall, 0.8, 0.08, 0.45, 0, 0.48, 0.85);
  p.box(s.accent, 0.3, 0.28, 0.06, 0, 0.66, 1.05);
  // notice stone with carved lines
  p.box(PAL.white, 0.5, 0.55, 0.08, -1.05, 0.42, 0.6, { ry: 0.4 });
  for (let i = 0; i < 3; i++) p.box(0x9a8a76, 0.36, 0.03, 0.09, -1.05, 0.55 - i * 0.1, 0.6, { ry: 0.4 });
  // twin standards
  for (const sx of [-1, 1]) {
    flagpole(p, sx * 1.15, 0.15, -1.1, 1.5);
    p.box(s.accent, 0.4, 0.28, 0.04, sx * 1.15, 1.35, -1.1);
  }
}

function wonderB(p: Parts, s: Style, f: Faction) {
  p.box(PAL.sandLight, 3.9, 0.2, 3.9, 0, 0.1, 0, { shade: 1.02 });
  if (f === 'egypt') {
    // the great pyramid
    p.box(s.wallDark, 3.3, 0.22, 3.3, 0, 0.29, 0);
    p.cyl(s.wall, 1.28, 1.58, 0.62, 0, 0.7, 0, { seg: 4, ry: Math.PI / 4 });
    p.cyl(s.wall, 0.95, 1.26, 0.62, 0, 1.32, 0, { seg: 4, ry: Math.PI / 4, shade: 1.04 });
    p.cyl(s.wall, 0.62, 0.93, 0.62, 0, 1.94, 0, { seg: 4, ry: Math.PI / 4, shade: 1.08 });
    p.cyl(s.wall, 0.3, 0.6, 0.6, 0, 2.55, 0, { seg: 4, ry: Math.PI / 4, shade: 1.12 });
    p.cone(PAL.goldBright, 0.42, 0.55, 0, 3.12, 0, { seg: 4, ry: Math.PI / 4 });
    // avenue of sphinxes
    for (const sx of [-1, 1]) {
      p.box(s.wallDark, 0.3, 0.2, 0.55, sx * 0.85, 0.48, 1.45, { shade: 0.95 });
      p.box(s.wall, 0.18, 0.22, 0.18, sx * 0.85, 0.64, 1.66);
      p.cyl(s.wall, 0.06, 0.11, 1.1, sx * 1.5, 0.93, 1.35, { seg: 4, ry: Math.PI / 4 });
      p.cone(PAL.gold, 0.11, 0.16, sx * 1.5, 1.56, 1.35, { seg: 4, ry: Math.PI / 4 });
    }
  } else if (f === 'greece') {
    // the great temple
    p.box(s.wall, 3.4, 0.2, 2.6, 0, 0.3, 0);
    p.box(s.wallDark, 3.1, 0.16, 2.3, 0, 0.48, 0);
    colonnade(p, s, 6, -1.35, 1.35, 0.56, 1.0, 1.5, 0.1);
    colonnade(p, s, 6, -1.35, 1.35, 0.56, -1.0, 1.5, 0.1);
    colonnade(p, s, 2, -1.35, -1.35, 0.56, 0.33, 1.5, 0.1);
    colonnade(p, s, 2, 1.35, 1.35, 0.56, 0.33, 1.5, 0.1);
    p.box(s.wall, 2.1, 1.4, 1.5, 0, 1.2, 0);
    p.box(s.wallDark, 3.25, 0.2, 2.45, 0, 2.12, 0);
    gabledRoof(p, s, 3.5, 0.8, 2.7, 0, 2.28, 0);
    p.box(s.trim, 3.55, 0.1, 0.22, 0, 2.34, 1.3);
    for (const ax of [-1.4, -0.7, 0.7, 1.4]) p.box(s.trim, 0.1, 0.11, 0.07, ax, 2.46, 1.34);
    steps(p, s.wall, 1.6, 0, 0, 1.35);
    p.box(PAL.gold, 1.2, 0.35, 0.06, 0, 2.6, 1.18);
    p.sphere(PAL.gold, 0.1, 0, 3.14, 0, { seg: 6 });
    for (const sx of [-1, 1]) p.sphere(PAL.goldBright, 0.08, sx * 1.7, 2.42, 1.3, { seg: 5 });
  } else {
    // the great dome, ribbed and ringed
    p.cyl(s.wall, 1.5, 1.6, 1.5, 0, 0.95, -0.3, { seg: 12 });
    p.cyl(s.wallDark, 1.57, 1.59, 0.08, 0, 0.55, -0.3, { seg: 12, shade: 1.03 });
    p.cyl(s.wallDark, 1.52, 1.54, 0.08, 0, 1.25, -0.3, { seg: 12, shade: 1.03 });
    p.box(s.trim, 3.2, 0.12, 0.2, 0, 1.72, -0.3, { ry: 0 });
    p.sphere(s.roof, 1.42, 0, 1.7, -0.3, { sy: 0.75, seg: 9 });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      p.box(s.roof, 0.07, 0.5, 0.07, Math.cos(a) * 0.62, 2.38, -0.3 + Math.sin(a) * 0.62,
        { ry: -a, rz: Math.cos(a) * 0.9, rx: -Math.sin(a) * 0.9, shade: 0.82 });
    }
    p.cyl(s.trim, 0.28, 0.34, 0.25, 0, 2.75, -0.3, { seg: 8 });
    p.sphere(PAL.goldBright, 0.14, 0, 2.95, -0.3, { seg: 6 });
    // portico
    colonnade(p, s, 4, -0.95, 0.95, 0.3, 1.25, 1.15, 0.09);
    p.box(s.wallDark, 2.3, 0.18, 0.5, 0, 1.54, 1.25);
    gabledRoof(p, s, 2.5, 0.55, 0.7, 0, 1.62, 1.25);
    p.box(PAL.gold, 0.44, 0.2, 0.05, 0, 1.85, 1.62); // pediment relief
    for (let i = 0; i < 3; i++) p.box(s.wallDark, 2.2 - i * 0.25, 0.08, 0.28, 0, 0.1 + i * 0.08, 1.85 - i * 0.2);
    p.box(PAL.gold, 1.4, 0.1, 0.06, 0, 1.5, 1.52);
  }
}

// ---------------------------------------------------------------- construction props
export function scaffoldGeo(size: number): THREE.BufferGeometry {
  return cached(`scaffold_${size}`, p => {
    const half = size / 2 - 0.15;
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      p.cyl(PAL.woodDark, 0.045, 0.05, size * 0.62, sx * half, size * 0.31, sz * half, { seg: 4 });
    }
    p.box(PAL.wood, half * 2 + 0.1, 0.05, 0.07, 0, size * 0.5, -half);
    p.box(PAL.wood, half * 2 + 0.1, 0.05, 0.07, 0, size * 0.56, half);
    p.box(PAL.wood, 0.07, 0.05, half * 2 + 0.1, -half, size * 0.62, 0);
    p.box(PAL.wood, 0.07, 0.05, half * 2 + 0.1, half, size * 0.45, 0);
    // material piles
    p.box(PAL.woodLight, 0.5, 0.14, 0.3, half * 0.5, 0.07, half * 0.7, { ry: 0.4 });
    p.box(PAL.stoneLight, 0.3, 0.18, 0.3, -half * 0.6, 0.09, half * 0.6, { ry: 0.2 });
  });
}

export function rubbleGeo(size: number): THREE.BufferGeometry {
  return cached(`rubble_${size}`, p => {
    const n = 5 + size * 2;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + i * 1.7;
      const r = (0.15 + ((i * 37) % 10) / 10 * 0.42) * size * 0.5;
      p.ico(PAL.stone, 0.1 + ((i * 13) % 5) * 0.04 * size * 0.4,
        Math.cos(a) * r, 0.07, Math.sin(a) * r,
        { ry: i, shade: 0.82 + ((i * 7) % 4) * 0.07 });
    }
    // No ground plate: the scorch decal laid down with the collapse stains the
    // earth, and a hard-edged slab beside a soft mark reads as a bug.
    for (let i = 0; i < 3; i++) {
      const a = i * 2.3 + size;
      p.box(PAL.woodDark, 0.5 * size * 0.4, 0.07, 0.11, Math.cos(a) * size * 0.16, 0.05,
        Math.sin(a) * size * 0.16, { ry: a, rz: 0.06, shade: 0.9 });
    }
  });
}

// ---------------------------------------------------------------- trees & nodes
export const TREE_VARIANTS = 6;

export function treeGeo(variant: number): THREE.BufferGeometry {
  return cached(`tree_${variant}`, p => {
    if (variant === 4) {
      // cypress: tall dark spire (Greece / Rome)
      p.cyl(PAL.woodDark, 0.055, 0.085, 0.32, 0, 0.16, 0, { seg: 5 });
      p.cone(0x4a6b3a, 0.34, 1.05, 0, 0.72, 0, { seg: 7 });
      p.cone(0x54783f, 0.29, 0.9, 0, 1.16, 0, { seg: 7, shade: 1.04 });
      p.cone(0x4a6b3a, 0.21, 0.72, 0, 1.62, 0, { seg: 6, shade: 0.96 });
      p.cone(0x5c8145, 0.12, 0.4, 0, 2.02, 0, { seg: 6 });
      return;
    }
    if (variant === 5) {
      // umbrella pine: bare trunk, flat spreading crown (Rome)
      p.cyl(PAL.woodDark, 0.07, 0.11, 1.15, 0.04, 0.57, 0, { seg: 5, rz: 0.05 });
      p.cyl(0x7a5a3a, 0.05, 0.055, 0.42, 0.16, 1.2, 0.04, { seg: 4, rz: -0.55 });
      p.sphere(0x5a7a3c, 0.62, 0.06, 1.42, 0, { sy: 0.4 });
      p.sphere(0x668a44, 0.44, -0.3, 1.52, 0.16, { sy: 0.42, shade: 1.05 });
      p.sphere(0x4f6d36, 0.4, 0.34, 1.48, -0.14, { sy: 0.42, shade: 0.94 });
      p.sphere(0x5a7a3c, 0.3, 0.1, 1.62, 0.24, { sy: 0.45 });
      return;
    }
    if (variant < 2) {
      // palm: tilted tapered trunk, two rings of drooping fronds
      const lean = variant === 0 ? 0.14 : -0.1;
      p.cyl(PAL.trunk, 0.055, 0.095, 1.45, lean * 0.65, 0.72, 0, { seg: 5, rz: -lean });
      // trunk ring detail
      p.cyl(0x7a5a3a, 0.075, 0.08, 0.06, lean * 0.35, 0.52, 0, { seg: 5, rz: -lean });
      p.cyl(0x7a5a3a, 0.065, 0.07, 0.06, lean * 0.75, 0.98, 0, { seg: 5, rz: -lean });
      const topX = lean * 1.35, topY = 1.44;
      const fronds = 7;
      for (let i = 0; i < fronds; i++) {
        const a = (i / fronds) * Math.PI * 2 + variant * 0.8;
        const dx = Math.cos(a), dz = Math.sin(a);
        // drooping frond: wide flat blade (flattened cone) arching outward-down
        const droop = 1.95 + (i % 2) * 0.15;
        p.cone(PAL.palmLeaf, 0.2, 0.85, topX + dx * 0.36, topY + 0.04, dz * 0.36, {
          seg: 4,
          rx: dz * droop, rz: -dx * droop, ry: -a,
          sx: 1.25, sz: 0.4, shade: 0.82 + (i % 3) * 0.12
        });
      }
      // upper shorter ring, raised more
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + 0.6 + variant;
        const dx = Math.cos(a), dz = Math.sin(a);
        p.cone(0x6da84a, 0.15, 0.52, topX + dx * 0.2, topY + 0.16, dz * 0.2, {
          seg: 4, rx: dz * 1.5, rz: -dx * 1.5, ry: -a, sx: 1.2, sz: 0.45, shade: 0.95
        });
      }
      p.sphere(PAL.leafDark, 0.13, topX, topY + 0.06, 0, { seg: 5 });
      p.sphere(0x7a5230, 0.055, topX + 0.11, topY - 0.06, 0.06, { seg: 4 });
      p.sphere(0x7a5230, 0.05, topX - 0.09, topY - 0.08, -0.05, { seg: 4 });
    } else {
      // olive
      const s = variant === 2 ? 1 : 0.85;
      p.cyl(PAL.woodDark, 0.08 * s, 0.13 * s, 0.55 * s, 0, 0.27 * s, 0, { seg: 5, rz: 0.08 });
      p.cyl(PAL.woodDark, 0.05 * s, 0.06 * s, 0.4 * s, 0.12 * s, 0.6 * s, 0.05, { seg: 4, rz: -0.5 });
      p.sphere(PAL.olive, 0.42 * s, 0, 0.85 * s, 0, { sy: 0.85, shade: 1 });
      p.sphere(PAL.oliveDark, 0.3 * s, 0.3 * s, 0.72 * s, 0.12 * s, { sy: 0.85 });
      p.sphere(PAL.olive, 0.26 * s, -0.26 * s, 0.7 * s, -0.14 * s, { sy: 0.9, shade: 0.9 });
    }
  });
}

export function stumpGeo(): THREE.BufferGeometry {
  return cached('stump', p => {
    p.cyl(PAL.trunk, 0.09, 0.11, 0.14, 0, 0.07, 0, { seg: 6 });
    p.cyl(0xc9b184, 0.085, 0.085, 0.03, 0, 0.15, 0, { seg: 6 });
  });
}

export function nodeGeo(kind: NodeKind, variant: number): THREE.BufferGeometry {
  return cached(`node_${kind}_${variant}`, p => {
    if (kind === 'berries') {
      p.sphere(PAL.leaf, 0.34, 0, 0.24, 0, { sy: 0.75 });
      p.sphere(PAL.leafDark, 0.26, 0.28, 0.2, 0.14, { sy: 0.75 });
      p.sphere(PAL.leaf, 0.22, -0.26, 0.18, -0.1, { sy: 0.8, shade: 0.92 });
      for (let i = 0; i < 8; i++) {
        const a = i * 0.785 + variant;
        p.sphere(PAL.berry, 0.045, Math.cos(a) * (0.2 + (i % 3) * 0.08), 0.3 + (i % 2) * 0.12, Math.sin(a) * (0.18 + (i % 2) * 0.1), { seg: 4 });
      }
    } else if (kind === 'stone') {
      for (let i = 0; i < 4; i++) {
        const a = i * 1.7 + variant;
        p.ico(PAL.rock, 0.16 + (i % 2) * 0.1, Math.cos(a) * 0.22, 0.13 + (i % 2) * 0.06, Math.sin(a) * 0.22,
          { ry: i * 1.2, shade: 0.85 + (i % 3) * 0.1 });
      }
      p.ico(PAL.stoneLight, 0.2, 0, 0.3, 0, { ry: variant });
    } else if (kind === 'gold') {
      for (let i = 0; i < 4; i++) {
        const a = i * 1.7 + variant + 0.4;
        p.ico(0xa8946a, 0.15 + (i % 2) * 0.1, Math.cos(a) * 0.22, 0.12 + (i % 2) * 0.06, Math.sin(a) * 0.22,
          { ry: i * 1.2, shade: 0.85 + (i % 3) * 0.1 });
      }
      p.ico(PAL.gold, 0.17, 0.05, 0.3, 0, { ry: variant });
      p.sphere(PAL.goldBright, 0.07, -0.18, 0.32, 0.12, { seg: 5 });
      p.sphere(PAL.goldBright, 0.06, 0.22, 0.2, -0.16, { seg: 5 });
    } else if (kind === 'fish') {
      // subtle shoal marker: fins breaking the surface + thin ripple ring
      for (let i = 0; i < 3; i++) {
        const a = i * 2.1 + variant;
        p.cone(0x3d5a64, 0.07, 0.18, Math.cos(a) * 0.32, 0.07, Math.sin(a) * 0.32, { seg: 4, rz: 0.55 });
        p.sphere(0x54747e, 0.05, Math.cos(a) * 0.32 + 0.05, 0.03, Math.sin(a) * 0.32, { seg: 4, sy: 0.5 });
      }
      p.torus(0xbdeef0, 0.5, 0.018, Math.PI * 2, 0, 0.03, 0, { rx: Math.PI / 2 });
    } else if (kind === 'carcass') {
      wildsNode(p, kind, variant); // felled game, butchered for food
    }
  });
}

// ---------------------------------------------------------------- units
const SKIN: Record<Faction, number> = { egypt: 0xc98850, greece: 0xd9a06b, rome: 0xcf9760 };

function humanoid(p: Parts, opts: {
  skin: number; tunic: number; tunicTrim?: number; head?: number;
  helmet?: number; crest?: number; shield?: { color: number; round: boolean };
  hood?: boolean; skirtLong?: boolean; scale?: number;
}) {
  const s = opts.scale ?? 1;
  const skin = opts.skin, tunic = opts.tunic;
  // legs
  p.box(skin, 0.085 * s, 0.24 * s, 0.09 * s, -0.07 * s, 0.12 * s, 0);
  p.box(skin, 0.085 * s, 0.24 * s, 0.09 * s, 0.07 * s, 0.12 * s, 0);
  // tunic/torso
  const tunicH = opts.skirtLong ? 0.45 : 0.34;
  p.box(tunic, 0.3 * s, tunicH * s, 0.2 * s, 0, (0.24 + tunicH / 2) * s, 0);
  if (opts.tunicTrim) p.box(opts.tunicTrim, 0.31 * s, 0.06 * s, 0.21 * s, 0, 0.3 * s, 0);
  // shoulders/arms
  p.box(tunic, 0.44 * s, 0.09 * s, 0.16 * s, 0, 0.53 * s, 0);
  p.box(skin, 0.07 * s, 0.22 * s, 0.09 * s, -0.19 * s, 0.4 * s, 0.02);
  p.box(skin, 0.07 * s, 0.22 * s, 0.09 * s, 0.19 * s, 0.4 * s, 0.02);
  // head
  const headY = 0.71 * s;
  p.sphere(opts.head ?? skin, 0.115 * s, 0, headY, 0, { seg: 7 });
  if (opts.hood) {
    p.sphere(tunic, 0.13 * s, 0, headY + 0.015 * s, -0.02 * s, { seg: 6, sy: 1.05 });
  }
  if (opts.helmet !== undefined) {
    p.sphere(opts.helmet, 0.125 * s, 0, headY + 0.02 * s, 0, { seg: 7, sy: 1.02 });
    p.box(opts.helmet, 0.05 * s, 0.1 * s, 0.02 * s, 0, headY - 0.03 * s, 0.115 * s);
    if (opts.crest !== undefined) {
      p.box(opts.crest, 0.05 * s, 0.1 * s, 0.24 * s, 0, headY + 0.15 * s, 0);
    }
  }
  if (opts.shield) {
    if (opts.shield.round) {
      p.cyl(opts.shield.color, 0.16 * s, 0.16 * s, 0.05 * s, -0.26 * s, 0.42 * s, 0.03, { seg: 8, rz: Math.PI / 2 });
      p.cyl(PAL.gold, 0.05 * s, 0.05 * s, 0.062 * s, -0.267 * s, 0.42 * s, 0.03, { seg: 6, rz: Math.PI / 2 });
    } else {
      p.box(opts.shield.color, 0.05 * s, 0.34 * s, 0.24 * s, -0.26 * s, 0.42 * s, 0.03);
      p.box(PAL.gold, 0.056 * s, 0.2 * s, 0.05 * s, -0.264 * s, 0.42 * s, 0.03);
    }
  }
}

export function unitGeo(type: UnitTypeId, faction: Faction): THREE.BufferGeometry {
  return cached(`u_${type}_${faction}`, p => {
    const skin = SKIN[faction];
    const st = STYLE[faction];
    switch (type) {
      case 'villager':
        if (faction === 'egypt') {
          humanoid(p, { skin, tunic: 0xf2ead8, tunicTrim: st.accent });
          p.box(0x2c2c34, 0.24, 0.06, 0.24, 0, 0.8, 0); // dark hair cap
        } else if (faction === 'greece') {
          humanoid(p, { skin, tunic: 0xd9e2e8, tunicTrim: st.accent });
          p.box(0x54432e, 0.2, 0.06, 0.2, 0, 0.8, 0);
        } else {
          humanoid(p, { skin, tunic: 0xdccdb2, tunicTrim: st.accent });
          p.box(0x3c2e20, 0.2, 0.06, 0.2, 0, 0.8, 0);
        }
        break;
      case 'spearman':
        humanoid(p, {
          skin, tunic: 0x8f6b46, tunicTrim: st.accent,
          helmet: 0x8a8378, shield: { color: st.accent, round: faction !== 'rome' }
        });
        break;
      case 'archer':
        humanoid(p, { skin, tunic: 0x7d8a5a, tunicTrim: st.accent, hood: true });
        p.box(0x6b4f33, 0.1, 0.3, 0.08, 0.08, 0.5, -0.14, { rz: 0.15 }); // quiver
        p.box(0xd8cfb8, 0.08, 0.05, 0.06, 0.08, 0.66, -0.14);
        break;
      case 'hoplite':
        humanoid(p, {
          skin, tunic: st.accent, tunicTrim: PAL.gold,
          helmet: 0xc9a227, crest: 0xb03a2e,
          shield: { color: st.accent, round: true }, skirtLong: true, scale: 1.05
        });
        break;
      case 'legionary':
        humanoid(p, {
          skin, tunic: 0xb03a2e, tunicTrim: PAL.gold,
          helmet: 0x9a938a, crest: 0xb03a2e,
          shield: { color: 0xa93226, round: false }, scale: 1.02
        });
        break;
      case 'chariot': {
        // wheels
        for (const sx of [-1, 1]) {
          p.cyl(PAL.woodDark, 0.17, 0.17, 0.05, sx * 0.3, 0.17, 0.25, { seg: 9, rz: Math.PI / 2 });
          p.cyl(PAL.gold, 0.05, 0.05, 0.06, sx * 0.3, 0.17, 0.25, { seg: 6, rz: Math.PI / 2 });
        }
        // cab
        p.box(PAL.wood, 0.5, 0.06, 0.55, 0, 0.3, 0.2);
        p.box(st.accent, 0.5, 0.3, 0.05, 0, 0.45, 0.44);
        p.box(st.accent, 0.05, 0.3, 0.5, -0.24, 0.45, 0.2);
        p.box(st.accent, 0.05, 0.3, 0.5, 0.24, 0.45, 0.2);
        p.box(PAL.gold, 0.52, 0.05, 0.06, 0, 0.6, 0.44);
        // pole + horse
        p.cyl(PAL.woodDark, 0.025, 0.025, 0.7, 0, 0.28, -0.25, { seg: 4, rx: Math.PI / 2 });
        const hz = -0.62;
        p.box(0x8a5f3c, 0.26, 0.26, 0.6, 0, 0.5, hz);
        p.box(0x7a5234, 0.14, 0.3, 0.22, 0, 0.68, hz - 0.35);
        p.box(0x8a5f3c, 0.11, 0.2, 0.26, 0, 0.86, hz - 0.42, { rx: 0.5 });
        p.box(0x5a3c24, 0.04, 0.12, 0.05, -0.035, 1.0, hz - 0.48);
        p.box(0x5a3c24, 0.04, 0.12, 0.05, 0.035, 1.0, hz - 0.48);
        for (const [lx, lz] of [[-0.09, -0.22], [0.09, -0.22], [-0.09, 0.22], [0.09, 0.22]]) {
          p.box(0x7a5234, 0.07, 0.36, 0.08, lx, 0.18, hz + lz);
        }
        p.box(0x4a3018, 0.06, 0.3, 0.08, 0, 0.5, hz + 0.34, { rx: 0.5 });
        p.box(st.accent, 0.28, 0.05, 0.4, 0, 0.64, hz, { shade: 1.1 }); // caparison
        // rider
        humanoid(p, { skin, tunic: 0xf2ead8, tunicTrim: st.accent, scale: 0.92 });
        break;
      }
      case 'ram': {
        // Four heavy wheels under a timber cradle. The hide canopy is the
        // model's whole argument for why arrows barely scratch it.
        for (const sx of [-1, 1]) {
          for (const wz of [-0.34, 0.4]) {
            p.cyl(PAL.woodDark, 0.19, 0.19, 0.09, sx * 0.35, 0.19, wz, { seg: 9, rz: Math.PI / 2 });
            p.cyl(0x6a625a, 0.055, 0.055, 0.11, sx * 0.35, 0.19, wz, { seg: 6, rz: Math.PI / 2 });
          }
        }
        // chassis, with the crew's painted shields hung along the sides so you
        // can tell whose ram is at your wall
        p.box(PAL.wood, 0.62, 0.11, 1.15, 0, 0.33, 0.02);
        p.box(PAL.woodDark, 0.7, 0.06, 1.2, 0, 0.4, 0.02, { shade: 0.92 });
        for (const sx of [-1, 1]) {
          p.box(st.accent, 0.05, 0.3, 0.92, sx * 0.35, 0.55, 0.02);
          p.box(PAL.gold, 0.06, 0.05, 0.94, sx * 0.355, 0.68, 0.02);
        }
        // A-frame uprights carrying the ram
        for (const sx of [-1, 1]) {
          p.box(PAL.woodDark, 0.09, 0.86, 0.09, sx * 0.26, 0.82, -0.32, { rz: sx * 0.14 });
          p.box(PAL.woodDark, 0.09, 0.86, 0.09, sx * 0.26, 0.82, 0.36, { rz: sx * 0.14 });
        }
        p.box(PAL.wood, 0.62, 0.09, 0.09, 0, 1.25, -0.32);
        p.box(PAL.wood, 0.62, 0.09, 0.09, 0, 1.25, 0.36);
        p.box(PAL.wood, 0.09, 0.08, 0.78, 0, 1.27, 0.02);
        // hide canopy over the crew, riding high enough to leave the ram visible
        p.prism(0x8a6f4c, 0.82, 0.32, 1.24, 0, 1.29, 0.02, { shade: 1.04 });
        p.box(st.accent, 0.86, 0.05, 0.1, 0, 1.3, -0.58);
        p.box(st.accent, 0.86, 0.05, 0.1, 0, 1.3, 0.6);
        // the ram itself, slung on ropes, iron-capped and pointing forward
        p.cyl(0x5a4632, 0.02, 0.02, 0.56, -0.2, 0.96, -0.2, { seg: 4 });
        p.cyl(0x5a4632, 0.02, 0.02, 0.56, 0.2, 0.96, 0.28, { seg: 4 });
        p.cyl(PAL.woodDark, 0.13, 0.13, 1.35, 0, 0.68, 0.06, { seg: 8, rx: Math.PI / 2 });
        p.cyl(0x6a625a, 0.15, 0.15, 0.14, 0, 0.68, 0.62, { seg: 8, rx: Math.PI / 2 });
        p.cone(0x8a8378, 0.16, 0.28, 0, 0.68, 0.82, { seg: 7, rx: Math.PI / 2 });
        // iron banding
        for (const bz of [-0.28, 0.18]) {
          p.cyl(0x4a443c, 0.14, 0.14, 0.07, 0, 0.68, bz, { seg: 8, rx: Math.PI / 2 });
        }
        break;
      }
      case 'catapult': {
        // Light frame, big arm, no cover — every bit as fragile as it plays.
        for (const sx of [-1, 1]) {
          p.cyl(PAL.woodDark, 0.17, 0.17, 0.07, sx * 0.32, 0.17, -0.18, { seg: 9, rz: Math.PI / 2 });
          p.cyl(0x6a625a, 0.05, 0.05, 0.09, sx * 0.32, 0.17, -0.18, { seg: 6, rz: Math.PI / 2 });
        }
        // skids at the front take the recoil
        p.box(PAL.woodDark, 0.1, 0.13, 0.9, -0.28, 0.14, 0.24, { rx: 0.12 });
        p.box(PAL.woodDark, 0.1, 0.13, 0.9, 0.28, 0.14, 0.24, { rx: 0.12 });
        // deck, with the crew's colors painted along the side rails
        p.box(PAL.wood, 0.56, 0.1, 1.1, 0, 0.3, 0.02);
        p.box(PAL.woodLight, 0.6, 0.05, 1.14, 0, 0.36, 0.02, { shade: 0.95 });
        for (const sx of [-1, 1]) {
          p.box(st.accent, 0.05, 0.13, 1.0, sx * 0.3, 0.32, 0.02);
        }
        // torsion bundle across the axle
        p.cyl(0xb8a179, 0.12, 0.12, 0.5, 0, 0.44, -0.24, { seg: 8, rz: Math.PI / 2 });
        p.cyl(0x6a625a, 0.13, 0.13, 0.08, -0.24, 0.44, -0.24, { seg: 8, rz: Math.PI / 2 });
        p.cyl(0x6a625a, 0.13, 0.13, 0.08, 0.24, 0.44, -0.24, { seg: 8, rz: Math.PI / 2 });
        // A-frame the arm slams into
        for (const sx of [-1, 1]) {
          p.box(PAL.woodDark, 0.08, 0.78, 0.08, sx * 0.24, 0.72, 0.3, { rz: sx * 0.2, rx: -0.16 });
        }
        p.box(PAL.wood, 0.56, 0.09, 0.12, 0, 1.06, 0.18);
        p.box(0x6f5738, 0.5, 0.09, 0.14, 0, 1.02, 0.16); // padded crossbar
        // a pennant on the frame — the only thing visible over a wall
        p.cyl(PAL.woodDark, 0.02, 0.025, 0.66, 0.3, 1.3, 0.36, { seg: 4 });
        p.box(st.accent, 0.03, 0.24, 0.3, 0.3, 1.5, 0.51);
        p.box(PAL.gold, 0.035, 0.05, 0.31, 0.3, 1.62, 0.51);
        // throwing arm, cocked back
        p.box(PAL.woodDark, 0.09, 0.09, 1.0, 0, 0.74, -0.42, { rx: 0.62 });
        // sling bucket at the tip
        p.cyl(PAL.woodDark, 0.17, 0.13, 0.16, 0, 1.16, -0.74, { seg: 8 });
        p.sphere(PAL.rock, 0.11, 0, 1.24, -0.74, { seg: 6 });
        // winch and rope
        p.cyl(PAL.woodDark, 0.07, 0.07, 0.36, 0, 0.44, 0.42, { seg: 7, rz: Math.PI / 2 });
        p.cyl(0x8a7a5c, 0.02, 0.02, 0.78, 0, 0.72, 0.06, { seg: 4, rx: 0.9 });
        p.box(PAL.woodDark, 0.05, 0.22, 0.05, 0.22, 0.5, 0.42, { rz: 0.5 });
        // spare shot in a rack
        p.sphere(PAL.rock, 0.09, -0.17, 0.44, 0.26, { seg: 5 });
        p.sphere(PAL.rock, 0.09, 0.17, 0.44, 0.26, { seg: 5, shade: 0.94 });
        break;
      }
      case 'tradecart': {
        // solid wheels
        for (const sx of [-1, 1]) {
          p.cyl(PAL.woodDark, 0.15, 0.15, 0.05, sx * 0.26, 0.15, -0.1, { seg: 8, rz: Math.PI / 2 });
          p.cyl(PAL.gold, 0.04, 0.04, 0.06, sx * 0.26, 0.15, -0.1, { seg: 6, rz: Math.PI / 2 });
        }
        // bed piled with goods
        p.box(PAL.wood, 0.44, 0.09, 0.62, 0, 0.26, -0.12);
        p.box(PAL.woodLight, 0.46, 0.16, 0.06, 0, 0.36, -0.42);
        p.sphere(0xd8c096, 0.13, -0.08, 0.4, -0.14, { sy: 0.85 });
        p.sphere(0xcbb184, 0.11, 0.12, 0.38, -0.04, { sy: 0.85 });
        p.sphere(0xd8c096, 0.1, 0, 0.42, -0.3, { sy: 0.8 });
        p.box(PAL.gold, 0.14, 0.1, 0.12, 0.06, 0.36, 0.06);
        amphora(p, 0xb5744a, -0.12, 0.31, 0.55);
        // shafts to the donkey
        p.cyl(PAL.woodDark, 0.018, 0.018, 0.5, 0.12, 0.24, 0.35, { seg: 4, rx: Math.PI / 2 });
        p.cyl(PAL.woodDark, 0.018, 0.018, 0.5, -0.12, 0.24, 0.35, { seg: 4, rx: Math.PI / 2 });
        // the donkey
        const dz = 0.56;
        p.box(0x9a8a76, 0.22, 0.22, 0.5, 0, 0.42, dz);
        p.box(0x8a7a66, 0.12, 0.24, 0.16, 0, 0.58, dz + 0.28);
        p.box(0x9a8a76, 0.09, 0.14, 0.22, 0, 0.71, dz + 0.34, { rx: -0.4 });
        p.box(0x5a4c3c, 0.035, 0.12, 0.045, -0.035, 0.8, dz + 0.3);
        p.box(0x5a4c3c, 0.035, 0.12, 0.045, 0.035, 0.8, dz + 0.3);
        for (const [lx, lz] of [[-0.08, -0.18], [0.08, -0.18], [-0.08, 0.18], [0.08, 0.18]]) {
          p.box(0x8a7a66, 0.06, 0.32, 0.07, lx, 0.16, dz + lz);
        }
        p.box(0x4a3c2c, 0.05, 0.26, 0.06, 0, 0.44, dz - 0.3, { rx: 0.5 }); // tail
        p.box(st.accent, 0.24, 0.045, 0.32, 0, 0.54, dz, { shade: 1.1 }); // blanket
        break;
      }
      case 'boat': {
        // hull
        p.box(PAL.wood, 0.5, 0.22, 1.15, 0, 0.16, 0);
        p.box(PAL.woodDark, 0.54, 0.08, 1.2, 0, 0.26, 0);
        p.cone(PAL.wood, 0.2, 0.5, 0, 0.28, 0.72, { seg: 4, rx: 1.25 });
        p.cone(PAL.wood, 0.2, 0.4, 0, 0.26, -0.68, { seg: 4, rx: -1.35 });
        // mast + sail
        p.cyl(PAL.woodDark, 0.035, 0.04, 1.05, 0, 0.8, 0, { seg: 5 });
        p.cyl(PAL.woodDark, 0.025, 0.025, 0.7, 0, 1.25, 0, { seg: 4, rz: Math.PI / 2 });
        p.box(PAL.cloth, 0.66, 0.62, 0.03, 0, 0.92, 0.05, { shade: 1.06 });
        p.box(st.accent, 0.66, 0.09, 0.035, 0, 0.92, 0.05);
        // cargo
        p.box(PAL.woodLight, 0.2, 0.12, 0.2, 0.1, 0.32, 0.35, { ry: 0.4 });
        break;
      }
      default:
        wildsUnit(p, type); // animals, deserters, refugees
        break;
    }
  }, type === 'chariot' ? g => { g.rotateY(Math.PI); g.computeBoundingSphere(); } : undefined);
}

export const UNIT_VIS_HEIGHT: Record<UnitTypeId, number> = {
  villager: 0.95, spearman: 1.0, archer: 1.0, chariot: 1.25, hoplite: 1.05, legionary: 1.0,
  ram: 1.4, catapult: 1.35,
  boat: 1.5, tradecart: 0.95,
  gazelle: 0.8, boar: 0.75, wolf: 0.7, mercenary: 1.0, refugee: 0.95
};

// weapons: origin at grip, blade along +y
export function weaponGeo(kind: 'spear' | 'sword' | 'bow'): THREE.BufferGeometry {
  return cached(`w_${kind}`, p => {
    if (kind === 'spear') {
      p.cyl(PAL.woodDark, 0.016, 0.016, 0.85, 0, 0.18, 0, { seg: 4 });
      p.cone(0xc9ccd1, 0.035, 0.14, 0, 0.66, 0, { seg: 4 });
    } else if (kind === 'sword') {
      p.box(0xc9ccd1, 0.035, 0.3, 0.012, 0, 0.22, 0);
      p.cone(0xc9ccd1, 0.024, 0.06, 0, 0.4, 0, { seg: 4 });
      p.box(PAL.gold, 0.09, 0.025, 0.03, 0, 0.06, 0);
      p.cyl(PAL.woodDark, 0.014, 0.014, 0.09, 0, 0.0, 0, { seg: 4 });
    } else {
      p.torus(PAL.woodDark, 0.19, 0.013, Math.PI * 0.85, 0, 0.15, 0, { rz: -Math.PI * 0.42 });
      p.box(0xd8cfb8, 0.005, 0.36, 0.005, 0.045, 0.15, 0);
    }
  });
}

// ---------------------------------------------------------------- villager kit
/** What a villager holds while working. */
export type ToolKind = 'axe' | 'pickaxe' | 'sickle' | 'mallet' | 'net' | 'basket';

const BRONZE = 0xb0803f;
const BRONZE_LIGHT = 0xcda05a;
const IRON = 0x8d9198;
const LASH = 0x4a3826; // leather binding at the head of a haft

/**
 * The forager's basket. It hangs from the origin — the top of its handle — so
 * that dropping it at a hand keeps it dangling the right way up.
 */
function emptyBasket(p: Parts) {
  p.cyl(0xb08d5a, 0.13, 0.095, 0.15, 0, -0.205, 0, { seg: 7 });
  p.cyl(0x9c7a48, 0.135, 0.13, 0.03, 0, -0.12, 0, { seg: 7 });
  p.torus(0x9c7a48, 0.115, 0.014, Math.PI, 0, -0.115, 0, { shade: 0.95 });
}

/**
 * A villager's working tool. Same convention as the weapons: the grip sits at
 * the origin with the haft running up +y and the business end facing +z, so a
 * tool can be dropped into either the procedural unit or a rigged hand bone.
 */
export function toolGeo(kind: ToolKind): THREE.BufferGeometry {
  return cached(`t_${kind}`, p => {
    switch (kind) {
      case 'axe':
        p.cyl(PAL.woodDark, 0.015, 0.019, 0.5, 0, 0.17, 0, { seg: 5 });
        p.cyl(LASH, 0.022, 0.022, 0.06, 0, 0.37, 0, { seg: 5 });
        p.box(BRONZE, 0.028, 0.12, 0.06, 0, 0.4, 0.05);                          // head
        p.box(BRONZE_LIGHT, 0.02, 0.17, 0.05, 0, 0.4, 0.105, { shade: 1.05 });   // flared bit
        break;
      case 'pickaxe':
        p.cyl(PAL.woodDark, 0.015, 0.019, 0.46, 0, 0.15, 0, { seg: 5 });
        p.cyl(LASH, 0.022, 0.022, 0.06, 0, 0.33, 0, { seg: 5 });
        p.box(IRON, 0.034, 0.06, 0.12, 0, 0.36, 0);                              // eye block
        p.cone(IRON, 0.036, 0.26, 0, 0.345, 0.12, { seg: 4, rx: Math.PI / 2 + 0.2 });  // point
        p.box(IRON, 0.032, 0.055, 0.17, 0, 0.35, -0.1, { rx: 0.2, shade: 0.94 });      // adze
        p.box(BRONZE_LIGHT, 0.03, 0.075, 0.035, 0, 0.335, -0.19, { rx: 0.2, shade: 1.06 });
        break;
      case 'sickle':
        p.cyl(PAL.woodDark, 0.018, 0.021, 0.17, 0, 0.04, 0, { seg: 5 });
        p.cyl(LASH, 0.024, 0.024, 0.04, 0, 0.13, 0, { seg: 5 });
        // blade: a hook sweeping from in front of the grip up and over
        p.torus(BRONZE_LIGHT, 0.13, 0.022, Math.PI * 0.78, 0, 0.16, 0, { ry: -Math.PI / 2 });
        break;
      case 'mallet':
        p.cyl(PAL.woodDark, 0.017, 0.02, 0.42, 0, 0.13, 0, { seg: 5 });
        p.cyl(LASH, 0.023, 0.023, 0.05, 0, 0.3, 0, { seg: 5 });
        p.box(PAL.stone, 0.07, 0.1, 0.19, 0, 0.35, 0);                           // stone head
        p.box(PAL.stoneLight, 0.072, 0.062, 0.045, 0, 0.35, 0.095, { shade: 1.06 });
        p.box(PAL.stoneLight, 0.072, 0.062, 0.045, 0, 0.35, -0.095, { shade: 0.94 });
        break;
      case 'net':
        p.cyl(PAL.woodDark, 0.014, 0.017, 0.34, 0, 0.1, 0, { seg: 4 });
        p.torus(PAL.woodLight, 0.1, 0.014, Math.PI * 2, 0, 0.27, 0.09, { rx: Math.PI / 2 });
        p.cone(0xd6cdb2, 0.088, 0.14, 0, 0.2, 0.09, { seg: 6, rx: Math.PI, shade: 0.96 });
        break;
      case 'basket':
        emptyBasket(p);
        break;
    }
  });
}

/** The load a villager walks home with — the food kinds ride in a basket. */
export function carryGeo(kind: NodeKind): THREE.BufferGeometry {
  return cached(`c_${kind}`, p => {
    if (kind === 'tree') {
      p.cyl(PAL.trunk, 0.05, 0.05, 0.42, 0, 0, 0, { seg: 5, rz: Math.PI / 2, ry: 0.3 });
      p.cyl(PAL.trunk, 0.045, 0.045, 0.38, 0, 0.08, 0.03, { seg: 5, rz: Math.PI / 2, ry: -0.2, shade: 0.9 });
    } else if (kind === 'berries' || kind === 'fish' || kind === 'carcass') {
      // the forager's basket, now heaped with the catch
      emptyBasket(p);
      if (kind === 'berries') {
        p.sphere(PAL.berry, 0.045, 0.045, -0.1, 0.02, { seg: 4 });
        p.sphere(PAL.berry, 0.04, -0.045, -0.11, -0.02, { seg: 4 });
        p.sphere(0xd8b455, 0.05, 0, -0.09, -0.05, { seg: 4 });
      } else if (kind === 'fish') {
        p.box(0x9ab2b8, 0.06, 0.05, 0.2, 0, -0.1, 0, { ry: 0.4 });
        p.cone(0x7a949a, 0.03, 0.07, 0, -0.1, 0.12, { rx: Math.PI / 2, ry: 0.4 });
        p.box(0x8aa2a8, 0.05, 0.045, 0.17, 0.03, -0.08, -0.03, { ry: -0.5, shade: 0.94 });
      } else {
        p.box(0xa85a4a, 0.09, 0.06, 0.13, 0, -0.09, 0, { ry: 0.3 });
        p.box(0xbd6b58, 0.07, 0.05, 0.1, 0.02, -0.05, 0.02, { ry: -0.4, shade: 1.05 });
      }
    } else if (kind === 'stone') {
      p.ico(PAL.stone, 0.11, 0, 0.02, 0);
      p.ico(PAL.stoneLight, 0.07, 0.07, 0.08, 0.03);
    } else {
      p.ico(0xa8946a, 0.1, 0, 0.02, 0);
      p.sphere(PAL.goldBright, 0.05, 0.05, 0.08, 0.02, { seg: 5 });
    }
  });
}

// ---------------------------------------------------------------- props
export function propGeo(kind: string, faction?: Faction): THREE.BufferGeometry {
  return cached(`p_${kind}_${faction ?? 'x'}`, p => {
    const st = STYLE[faction ?? 'greece'];
    switch (kind) {
      case 'grass':
        for (let i = 0; i < 4; i++) {
          const a = i * 1.6;
          p.cone(0xa8a664, 0.035, 0.24 + (i % 2) * 0.1, Math.cos(a) * 0.07, 0.12, Math.sin(a) * 0.07,
            { seg: 4, rx: Math.sin(a) * 0.25, rz: Math.cos(a) * 0.25, shade: 0.9 + (i % 3) * 0.1 });
        }
        break;
      case 'flower':
        p.cyl(0x7d8a4a, 0.012, 0.012, 0.16, 0, 0.08, 0, { seg: 4 });
        p.sphere(0xd8687a, 0.035, 0, 0.18, 0, { seg: 5 });
        p.cyl(0x7d8a4a, 0.012, 0.012, 0.12, 0.09, 0.06, 0.04, { seg: 4 });
        p.sphere(0xe8e0a0, 0.03, 0.09, 0.14, 0.04, { seg: 5 });
        break;
      case 'rock':
        p.ico(PAL.rock, 0.14, 0, 0.06, 0, { shade: 0.95 });
        p.ico(PAL.stoneLight, 0.08, 0.12, 0.04, 0.06, { ry: 1 });
        p.ico(PAL.rock, 0.06, -0.12, 0.03, -0.05, { ry: 2, shade: 0.85 });
        break;
      case 'bush':
        p.sphere(PAL.olive, 0.2, 0, 0.13, 0, { sy: 0.7 });
        p.sphere(PAL.oliveDark, 0.14, 0.1, 0.1, 0.08, { sy: 0.7 });
        p.sphere(PAL.leaf, 0.1, -0.12, 0.11, -0.06, { sy: 0.7, shade: 1.06 });
        p.sphere(0xd8687a, 0.025, 0.06, 0.24, 0.04, { seg: 4 });
        break;
      case 'shrub':
        p.sphere(0x8a9a52, 0.17, 0, 0.1, 0, { sy: 0.62 });
        p.sphere(0x76874a, 0.12, 0.13, 0.08, 0.06, { sy: 0.6 });
        p.cone(0xa8a664, 0.03, 0.2, -0.06, 0.2, -0.04, { seg: 4, rz: 0.2 });
        break;
      case 'reed':
        for (let i = 0; i < 5; i++) {
          const a = i * 1.3;
          p.cone(0x8fa054, 0.025, 0.42 + (i % 2) * 0.16, Math.cos(a) * 0.08, 0.24, Math.sin(a) * 0.08,
            { seg: 3, rx: Math.sin(a) * 0.2, rz: Math.cos(a) * 0.2 });
        }
        break;
      // Faction paving: flat slabs that form plazas and roads around a base.
      // Two variants per faction so a plaza doesn't look rubber-stamped.
      case 'paving':
      case 'paving2': {
        const alt = kind === 'paving2';
        if (faction === 'rome') {
          // a continuous road surface with cobble detail set into it
          p.box(alt ? 0xa89e90 : 0xb0a698, 0.99, 0.06, 0.99, 0, 0.03, 0);
          for (let i = 0; i < 4; i++) {
            const gx = (i % 2) * 0.48 - 0.24;
            const gz = ((i / 2) | 0) * 0.48 - 0.24;
            p.box(alt ? 0x9d9386 : 0xa79d8f, 0.42, 0.07, 0.42, gx, 0.035, gz,
              { shade: 0.96 + ((i + (alt ? 1 : 0)) % 3) * 0.045 });
          }
        } else if (faction === 'greece') {
          p.box(alt ? 0xc6bfa6 : 0xcdc6ad, 0.97, 0.06, 0.97, 0, 0.03, 0, { shade: alt ? 0.98 : 1 });
          p.box(alt ? 0xc0b9a0 : 0xc7c0a7, 0.44, 0.065, 0.44, alt ? -0.22 : 0.22, 0.033, 0.22, { shade: 0.99 });
        } else {
          p.box(alt ? 0xc7ab7e : 0xcdb184, 0.97, 0.06, 0.97, 0, 0.03, 0, { shade: alt ? 0.98 : 1 });
          p.box(alt ? 0xc0a476 : 0xc6aa7c, 0.46, 0.065, 0.92, alt ? 0.24 : -0.24, 0.033, 0, { shade: 0.99 });
        }
        break;
      }
      case 'rock_pale':
        p.ico(0xc4bda8, 0.17, 0, 0.07, 0, { shade: 1.02 });
        p.ico(0xd2cbb6, 0.1, 0.14, 0.05, 0.07, { ry: 1 });
        p.ico(0xb5ae9a, 0.08, -0.12, 0.04, -0.08, { ry: 2 });
        break;
      case 'rock_sand':
        p.ico(0xc9a877, 0.16, 0, 0.07, 0, { shade: 1.0 });
        p.ico(0xd8bb8c, 0.1, 0.13, 0.05, 0.06, { ry: 1 });
        break;
      case 'cliff':
        p.cyl(0xbfae86, 0.62, 0.78, 0.85, 0, 0.42, 0, { seg: 6, ry: 0.4 });
        p.cyl(0xa8976f, 0.72, 0.74, 0.09, 0, 0.28, 0, { seg: 6, ry: 0.4, shade: 0.95 }); // strata band
        p.cyl(0xcdbd96, 0.42, 0.56, 0.4, 0.06, 0.98, 0.04, { seg: 5, ry: 1.1 });
        p.ico(0xb2a179, 0.28, -0.5, 0.16, 0.38, { ry: 0.8 });
        // scrub clinging to the ledges
        p.sphere(PAL.olive, 0.1, 0.35, 1.2, 0.15, { sy: 0.55 });
        p.sphere(PAL.oliveDark, 0.08, -0.45, 0.62, 0.42, { sy: 0.55 });
        break;
      case 'tent': {
        // striped market tent like the reference image
        const c1 = faction === 'rome' ? 0xb03a2e : st.accent;
        for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
          p.cyl(PAL.woodDark, 0.03, 0.03, 0.75, sx * 0.55, 0.37, sz * 0.45, { seg: 4 });
        }
        for (let i = 0; i < 5; i++) {
          p.box(i % 2 === 0 ? c1 : PAL.cloth, 0.26, 0.045, 1.1, -0.52 + i * 0.26, 0.78 + Math.abs(2 - i) * -0.02 + 0.04, 0, { rz: 0 });
        }
        // scalloped valance along the front edge
        for (let i = 0; i < 5; i++) {
          const cc = i % 2 === 0 ? c1 : PAL.cloth;
          p.box(cc, 0.22, 0.08, 0.03, -0.5 + i * 0.25, 0.72, 0.56);
          p.cone(cc, 0.08, 0.08, -0.5 + i * 0.25, 0.65, 0.56, { seg: 4, rx: Math.PI, sz: 0.3 });
        }
        // gilded finials on the front posts
        for (const sx of [-1, 1]) p.sphere(PAL.gold, 0.03, sx * 0.55, 0.77, 0.45, { seg: 4 });
        p.box(PAL.wood, 1.2, 0.08, 0.5, 0, 0.3, 0.15);
        p.sphere(0xd8b455, 0.08, -0.3, 0.42, 0.1, { seg: 5 });
        p.sphere(PAL.berry, 0.07, -0.1, 0.42, 0.2, { seg: 5 });
        p.sphere(0x8fa05a, 0.075, 0.15, 0.42, 0.08, { seg: 5 });
        basket(p, 0.42, 0.42, 0.85);
        amphora(p, 0xb5744a, 0.75, 0.35, 0.9);
        break;
      }
      case 'well':
        p.cyl(PAL.stone, 0.32, 0.36, 0.4, 0, 0.2, 0, { seg: 8 });
        p.cyl(PAL.stoneLight, 0.345, 0.355, 0.06, 0, 0.12, 0, { seg: 8, shade: 0.92 }); // masonry seam
        p.cyl(PAL.stoneLight, 0.335, 0.34, 0.05, 0, 0.38, 0, { seg: 8, shade: 1.05 });  // rim cap
        p.cyl(0x27414a, 0.24, 0.24, 0.04, 0, 0.41, 0, { seg: 8 });
        for (const sx of [-1, 1]) p.cyl(PAL.woodDark, 0.03, 0.03, 0.6, sx * 0.28, 0.65, 0, { seg: 4 });
        // windlass with crank handle and hanging bucket
        p.cyl(PAL.wood, 0.045, 0.045, 0.56, 0, 0.82, 0, { seg: 5, rz: Math.PI / 2 });
        p.cyl(PAL.woodDark, 0.02, 0.02, 0.12, 0.31, 0.86, 0, { seg: 4 });
        p.cyl(PAL.woodDark, 0.02, 0.02, 0.14, 0.36, 0.9, 0, { seg: 4, rz: Math.PI / 2 });
        p.box(0xc9b184, 0.025, 0.24, 0.025, 0, 0.68, 0); // rope
        p.cyl(0x8a6844, 0.055, 0.045, 0.09, 0, 0.55, 0, { seg: 6 });
        gabledRoof(p, { roof: 0x8a6844 }, 0.85, 0.22, 0.5, 0, 0.92, 0);
        break;
      case 'sphinx':
        p.box(0xcaa96e, 0.5, 0.4, 1.0, 0, 0.4, 0);
        // forepaws
        p.box(0xcaa96e, 0.14, 0.2, 0.5, -0.16, 0.25, 0.55, { shade: 0.95 });
        p.box(0xcaa96e, 0.14, 0.2, 0.5, 0.16, 0.25, 0.55, { shade: 0.95 });
        p.box(0xd8bb80, 0.3, 0.38, 0.28, 0, 0.72, 0.35);
        // striped nemes headdress
        p.box(st.accent, 0.36, 0.1, 0.3, 0, 0.9, 0.35);
        p.box(PAL.gold, 0.38, 0.035, 0.31, 0, 0.84, 0.35);
        p.box(0xd8bb80, 0.1, 0.3, 0.06, -0.18, 0.66, 0.42, { shade: 0.9 }); // side lappets
        p.box(0xd8bb80, 0.1, 0.3, 0.06, 0.18, 0.66, 0.42, { shade: 0.9 });
        p.box(0xb59357, 0.7, 0.2, 1.2, 0, 0.1, 0);
        p.box(0x8a6a40, 0.06, 0.06, 0.4, -0.28, 0.5, -0.35, { rx: 0.5 }); // tail
        break;
      case 'obelisk_s':
        p.box(PAL.sandLight, 0.5, 0.16, 0.5, 0, 0.08, 0);
        p.box(0xcaa96e, 0.34, 0.1, 0.34, 0, 0.21, 0);
        p.cyl(0xd8bb80, 0.08, 0.14, 1.3, 0, 0.8, 0, { seg: 4, ry: Math.PI / 4 });
        // carved hieroglyph band
        for (let i = 0; i < 3; i++) p.box(0xb5945c, 0.035, 0.08, 0.02, 0, 0.55 + i * 0.17, 0.115 - i * 0.012);
        p.cone(PAL.gold, 0.14, 0.18, 0, 1.53, 0, { seg: 4, ry: Math.PI / 4 });
        break;
      case 'column_st':
        p.box(PAL.stoneLight, 0.4, 0.12, 0.4, 0, 0.06, 0);
        p.cyl(0xe8e0cd, 0.11, 0.12, 1.1, 0, 0.65, 0, { seg: 7 });
        // fluting shadows + capital volutes
        p.box(0xd6cdb4, 0.02, 1.0, 0.02, 0.1, 0.65, 0.045, { shade: 0.9 });
        p.box(0xd6cdb4, 0.02, 1.0, 0.02, -0.06, 0.65, 0.1, { shade: 0.9 });
        p.cyl(0xe8e0cd, 0.135, 0.115, 0.05, 0, 1.17, 0, { seg: 7, shade: 1.04 });
        p.box(0xe8e0cd, 0.32, 0.1, 0.32, 0, 1.25, 0);
        for (const sx of [-1, 1]) p.cyl(0xded4bc, 0.05, 0.05, 0.06, sx * 0.15, 1.2, 0.14, { seg: 6, rz: Math.PI / 2 });
        break;
      case 'column_fallen':
        p.cyl(0xded4bc, 0.12, 0.12, 0.9, 0, 0.12, 0, { seg: 7, rz: Math.PI / 2, ry: 0.2 });
        // drum seams on the fallen shaft
        p.cyl(0xc6bb9e, 0.123, 0.123, 0.03, -0.22, 0.12, 0.045, { seg: 7, rz: Math.PI / 2, ry: 0.2 });
        p.cyl(0xc6bb9e, 0.123, 0.123, 0.03, 0.2, 0.12, -0.04, { seg: 7, rz: Math.PI / 2, ry: 0.2 });
        p.cyl(0xd0c5a8, 0.12, 0.12, 0.35, 0.75, 0.12, 0.3, { seg: 7, rz: Math.PI / 2, ry: 0.9 });
        p.box(0xded4bc, 0.3, 0.1, 0.3, -0.7, 0.05, -0.2, { ry: 0.4 });
        p.ico(0xc9bda0, 0.08, 0.4, 0.05, 0.5, { ry: 1.1 });
        break;
      case 'urn':
        amphora(p, 0xa8683c, 0, 0, 1.4);
        amphora(p, 0x9c5a3c, 0.35, 0.15, 0.9);
        break;
      case 'standard':
        p.box(PAL.stone, 0.34, 0.14, 0.34, 0, 0.07, 0);
        p.cyl(PAL.woodDark, 0.03, 0.035, 1.5, 0, 0.85, 0, { seg: 5 });
        p.box(PAL.gold, 0.3, 0.05, 0.05, 0, 1.35, 0);
        p.box(0xb03a2e, 0.26, 0.4, 0.03, 0, 1.12, 0);
        p.box(PAL.gold, 0.28, 0.04, 0.04, 0, 1.32, 0);
        p.sphere(PAL.goldBright, 0.07, 0, 1.66, 0, { seg: 6 });
        p.box(PAL.goldBright, 0.2, 0.05, 0.03, 0, 1.58, 0);
        break;
      case 'milestone':
        p.cyl(0xd0c5a8, 0.12, 0.15, 0.6, 0, 0.3, 0, { seg: 6 });
        p.box(0xb8ab8c, 0.16, 0.1, 0.03, 0, 0.4, 0.13);
        // carved inscription lines
        p.box(0xa89b7c, 0.1, 0.02, 0.035, 0, 0.42, 0.13);
        p.box(0xa89b7c, 0.08, 0.02, 0.035, 0, 0.38, 0.13);
        break;
      case 'ruins':
        p.box(0xd5cab0, 1.2, 0.5, 0.25, 0, 0.25, -0.4, { ry: 0.15, shade: 0.95 });
        // crumbled top course + broken pediment fragment leaning on it
        p.box(0xc9bda0, 0.4, 0.14, 0.26, 0.25, 0.55, -0.36, { ry: 0.15, shade: 0.9 });
        p.prism(0xd5cab0, 0.55, 0.22, 0.12, 0.2, 0.02, 0.15, { ry: 0.9, rz: 0.25, shade: 0.92 });
        p.box(0xc9bda0, 0.6, 0.8, 0.25, -0.5, 0.4, -0.35, { ry: 0.15 });
        p.box(0x8a7f6a, 0.2, 0.3, 0.05, -0.5, 0.42, -0.22, { ry: 0.15, shade: 0.8 }); // empty niche
        p.cyl(0xded4bc, 0.11, 0.12, 0.6, 0.5, 0.3, 0.3, { seg: 7 });
        p.cyl(0xc6bb9e, 0.123, 0.123, 0.025, 0.5, 0.42, 0.3, { seg: 7 });
        p.cyl(0xd0c5a8, 0.11, 0.12, 0.35, -0.3, 0.17, 0.5, { seg: 7 });
        p.ico(0xc9bda0, 0.15, 0.1, 0.08, 0.15, { ry: 0.8 });
        p.ico(0xd5cab0, 0.1, 0.85, 0.06, -0.1, { ry: 0.3 });
        p.ico(0xbfb49a, 0.07, -0.15, 0.05, -0.75, { ry: 1.4 });
        // reclaiming vegetation
        p.sphere(PAL.olive, 0.12, -0.75, 0.08, 0.2, { sy: 0.6 });
        p.sphere(PAL.oliveDark, 0.08, 0.7, 0.06, 0.55, { sy: 0.6 });
        break;
      case 'decoboat':
        p.box(PAL.wood, 0.6, 0.26, 1.5, 0, 0.2, 0);
        p.box(PAL.woodDark, 0.64, 0.06, 1.54, 0, 0.32, 0, { shade: 1.08 }); // gunwale rail
        p.cone(PAL.woodDark, 0.24, 0.6, 0, 0.34, 0.95, { seg: 4, rx: 1.3 });
        p.sphere(PAL.gold, 0.05, 0, 0.52, 1.12, { seg: 4 }); // prow ornament
        p.cone(PAL.woodDark, 0.24, 0.5, 0, 0.32, -0.9, { seg: 4, rx: -1.4 });
        p.cyl(PAL.woodDark, 0.04, 0.05, 1.4, 0, 1.0, 0, { seg: 5 });
        p.cyl(PAL.woodDark, 0.025, 0.025, 0.95, 0, 1.62, 0, { seg: 4, rx: Math.PI / 2 }); // yard
        p.box(PAL.cloth, 0.9, 0.85, 0.035, 0, 1.15, 0.05, { shade: 1.05 });
        p.box(0xb03a2e, 0.9, 0.12, 0.04, 0, 1.15, 0.05);
        // oars resting along the sides
        for (const sx of [-1, 1]) {
          p.cyl(PAL.woodDark, 0.018, 0.018, 0.85, sx * 0.34, 0.35, -0.2, { seg: 4, rx: 1.2, ry: sx * 0.2 });
          p.box(PAL.wood, 0.05, 0.16, 0.02, sx * 0.34, 0.16, 0.22, { rx: 0.4 });
        }
        // cargo under the mast
        p.box(PAL.woodLight, 0.18, 0.12, 0.18, 0.12, 0.38, -0.35, { ry: 0.4 });
        amphora(p, 0xb5744a, -0.14, 0.33, 0.75);
        break;
      case 'tradepost': {
        // neutral caravanserai at the crossroads of the map
        p.box(0xc2b090, 2.5, 0.1, 2.5, 0, 0.05, 0, { shade: 0.98 });
        // main tent
        for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
          p.cyl(PAL.woodDark, 0.035, 0.035, 0.95, sx * 0.6, 0.47, sz * 0.5 - 0.3, { seg: 4 });
        }
        for (let i = 0; i < 5; i++) {
          p.box(i % 2 === 0 ? 0xb08a3c : PAL.cloth, 0.27, 0.05, 1.25,
            -0.54 + i * 0.27, 0.98 - Math.abs(2 - i) * 0.06, -0.3, { rz: (2 - i) * 0.12 });
        }
        // side awning
        p.cyl(PAL.woodDark, 0.03, 0.03, 0.7, 1.15, 0.35, 0.75, { seg: 4 });
        p.cyl(PAL.woodDark, 0.03, 0.03, 0.7, 0.35, 0.35, 0.75, { seg: 4 });
        for (let i = 0; i < 3; i++) {
          p.box(i % 2 === 0 ? 0x7a6a4a : PAL.cloth, 0.28, 0.04, 0.8, 0.47 + i * 0.28, 0.72, 0.75, { rz: 0.1 });
        }
        // wares
        crates(p, -0.95, 0.7, 1);
        amphora(p, 0xb5744a, -0.35, 0.85, 1);
        amphora(p, 0x9c5a3c, 0.75, 0.45, 0.85);
        p.sphere(0xd8c096, 0.15, 0.15, 0.42, 0.45, { sy: 0.8 });
        p.sphere(0xcbb184, 0.13, 0.4, 0.4, 0.3, { sy: 0.8 });
        // carpet spread with goods
        p.box(0x8a4a3c, 0.7, 0.03, 0.5, -0.8, 0.12, -1.0, { ry: 0.2 });
        p.box(PAL.gold, 0.12, 0.08, 0.1, -0.9, 0.18, -1.0, { ry: 0.4 });
        p.sphere(PAL.goldBright, 0.05, -0.65, 0.17, -1.05, { seg: 4 });
        // banner
        p.cyl(PAL.woodDark, 0.035, 0.045, 1.9, 1.05, 0.95, -1.0, { seg: 5 });
        p.box(0xb08a3c, 0.45, 0.3, 0.04, 1.28, 1.7, -1.0);
        p.box(PAL.gold, 0.47, 0.05, 0.05, 1.28, 1.87, -1.0);
        p.sphere(PAL.goldBright, 0.06, 1.05, 1.93, -1.0, { seg: 5 });
        break;
      }
    }
  });
}

export function disposeModelCache() {
  for (const g of cache.values()) g.dispose();
  cache.clear();
}

// Models for the neutral third power — wild animals, deserters, refugees and
// the encounter props they live around. Same idiom as models.ts: everything is
// merged vertex-colored Parts geometry, one draw call per entity. models.ts
// delegates its unknown unit/building/node ids here.
import type { Parts } from './parts';

// Palette local to the wilds so this module stays dependency-free of models.ts.
const W = {
  fawn: 0xd0a86a,
  fawnLight: 0xe2c088,
  belly: 0xefe4c8,
  horn: 0x5a4a34,
  boarHide: 0x6a5138,
  boarDark: 0x52402c,
  tusk: 0xe8ddc4,
  wolfGrey: 0x8a8a88,
  wolfDark: 0x6e6e6c,
  wolfPale: 0xb8b4ac,
  snout: 0x3a342c,
  rock: 0x8f8a80,
  rockDark: 0x746f66,
  bone: 0xe4dcc8,
  cave: 0x2c251d,
  canvas: 0x9a8462,
  canvasDark: 0x7e6a4e,
  ember: 0xe0813c,
  flame: 0xf0a04a,
  char: 0x3a3028,
  leather: 0x7a6248,
  iron: 0x6f6a62,
  skin: 0xc98850,
  drab: 0x8a7a64,
  drabDark: 0x6e6252,
  plinth: 0xcfc7b4,
  plinthDark: 0xb5ac96,
  gold: 0xd9a33c,
  goldBright: 0xf0c05a,
  meat: 0x9a4534,
  moss: 0x6f8f3f,
  wood: 0x8a6844,
  woodDark: 0x6b4f33
};

// ---------------------------------------------------------------- animals
/** Four legs for a standing quadruped. */
function legs(p: Parts, color: number, w: number, h: number, dx: number, dz: number) {
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    p.box(color, w, h, w, sx * dx, h / 2, sz * dz, { shade: 0.92 + (sx + 1) * 0.03 });
  }
}

function gazelle(p: Parts) {
  // slender tan body, white belly, ringed horns swept back — faces +z
  legs(p, W.fawn, 0.05, 0.32, 0.08, 0.15);
  p.box(W.fawn, 0.17, 0.2, 0.44, 0, 0.42, 0, { shade: 1.02 });
  p.box(W.belly, 0.15, 0.07, 0.38, 0, 0.33, 0);
  p.box(W.fawnLight, 0.15, 0.06, 0.2, 0, 0.52, -0.08, { shade: 1.05 }); // rump patch
  // neck + head
  p.box(W.fawn, 0.09, 0.22, 0.1, 0, 0.6, 0.2, { rx: 0.5 });
  p.box(W.fawn, 0.09, 0.1, 0.14, 0, 0.71, 0.3, { shade: 1.04 });
  p.box(W.snout, 0.05, 0.045, 0.05, 0, 0.69, 0.37);
  // ears + back-curved horns
  for (const sx of [-1, 1]) {
    p.box(W.fawnLight, 0.035, 0.07, 0.02, sx * 0.06, 0.77, 0.28, { rz: sx * 0.5 });
    p.cyl(W.horn, 0.012, 0.02, 0.16, sx * 0.035, 0.83, 0.26, { seg: 4, rx: -0.7, rz: sx * 0.18 });
    p.cyl(W.horn, 0.008, 0.013, 0.09, sx * 0.05, 0.9, 0.2, { seg: 4, rx: -1.1, rz: sx * 0.22, shade: 1.08 });
  }
  p.box(W.snout, 0.03, 0.09, 0.03, 0, 0.48, -0.23, { rx: 0.5 }); // tail
}

function boar(p: Parts) {
  // low bulky slab of muscle with a bristle ridge and up-curved tusks
  legs(p, W.boarDark, 0.08, 0.24, 0.13, 0.2);
  p.box(W.boarHide, 0.34, 0.32, 0.62, 0, 0.38, 0, { shade: 0.98 });
  p.box(W.boarDark, 0.3, 0.1, 0.5, 0, 0.55, -0.02);            // bristled spine
  p.box(W.boarDark, 0.06, 0.12, 0.34, 0, 0.61, 0, { shade: 0.85 }); // ridge crest
  // head: wedge + snout disc
  p.box(W.boarHide, 0.26, 0.26, 0.2, 0, 0.36, 0.38, { shade: 0.94 });
  p.box(W.snout, 0.11, 0.09, 0.06, 0, 0.3, 0.5);
  for (const sx of [-1, 1]) {
    p.cone(W.tusk, 0.025, 0.11, sx * 0.09, 0.28, 0.47, { seg: 4, rx: -0.9, rz: sx * 0.3 });
    p.box(W.boarDark, 0.05, 0.07, 0.03, sx * 0.1, 0.5, 0.4, { rz: sx * 0.5 }); // ears
  }
  p.box(W.boarDark, 0.03, 0.1, 0.03, 0, 0.5, -0.33, { rx: 0.4 });
}

function wolf(p: Parts) {
  legs(p, W.wolfDark, 0.055, 0.3, 0.09, 0.17);
  p.box(W.wolfGrey, 0.2, 0.22, 0.5, 0, 0.4, 0, { shade: 1.0 });
  p.box(W.wolfPale, 0.18, 0.12, 0.16, 0, 0.36, 0.22, { shade: 1.06 }); // chest ruff
  p.box(W.wolfDark, 0.16, 0.08, 0.3, 0, 0.53, -0.06);                 // saddle
  // head + snout, ears pricked
  p.box(W.wolfGrey, 0.15, 0.13, 0.16, 0, 0.56, 0.29, { shade: 1.03 });
  p.box(W.wolfPale, 0.07, 0.06, 0.1, 0, 0.53, 0.4);
  p.box(W.snout, 0.045, 0.035, 0.03, 0, 0.54, 0.46);
  for (const sx of [-1, 1]) {
    p.cone(W.wolfDark, 0.035, 0.09, sx * 0.05, 0.66, 0.27, { seg: 4 });
  }
  // bushy tail, kinked up
  p.box(W.wolfDark, 0.06, 0.06, 0.2, 0, 0.42, -0.31, { rx: -0.5 });
  p.box(W.wolfGrey, 0.07, 0.07, 0.12, 0, 0.5, -0.4, { rx: -0.9, shade: 0.9 });
}

// ---------------------------------------------------------------- people
/** Rough copy of the game's humanoid proportions, in wilds colors. */
function person(p: Parts, o: {
  skin: number; tunic: number; trim?: number; helmet?: number;
  shield?: number; hood?: boolean; bundle?: boolean; scale?: number;
}) {
  const s = o.scale ?? 1;
  p.box(o.skin, 0.085 * s, 0.24 * s, 0.09 * s, -0.07 * s, 0.12 * s, 0);
  p.box(o.skin, 0.085 * s, 0.24 * s, 0.09 * s, 0.07 * s, 0.12 * s, 0);
  p.box(o.tunic, 0.3 * s, 0.34 * s, 0.2 * s, 0, 0.41 * s, 0);
  if (o.trim) p.box(o.trim, 0.31 * s, 0.06 * s, 0.21 * s, 0, 0.3 * s, 0);
  p.box(o.tunic, 0.44 * s, 0.09 * s, 0.16 * s, 0, 0.53 * s, 0);
  p.box(o.skin, 0.07 * s, 0.22 * s, 0.09 * s, -0.19 * s, 0.4 * s, 0.02);
  p.box(o.skin, 0.07 * s, 0.22 * s, 0.09 * s, 0.19 * s, 0.4 * s, 0.02);
  const headY = 0.71 * s;
  p.sphere(o.skin, 0.115 * s, 0, headY, 0, { seg: 7 });
  if (o.hood) p.sphere(o.tunic, 0.13 * s, 0, headY + 0.015 * s, -0.02 * s, { seg: 6, sy: 1.05 });
  if (o.helmet !== undefined) {
    p.sphere(o.helmet, 0.125 * s, 0, headY + 0.02 * s, 0, { seg: 7, sy: 1.02 });
    p.box(o.helmet, 0.05 * s, 0.1 * s, 0.02 * s, 0, headY - 0.03 * s, 0.115 * s);
  }
  if (o.shield !== undefined) {
    p.cyl(o.shield, 0.15 * s, 0.15 * s, 0.05 * s, -0.26 * s, 0.42 * s, 0.03, { seg: 7, rz: Math.PI / 2 });
    p.sphere(W.iron, 0.045 * s, -0.28 * s, 0.42 * s, 0.03, { seg: 5 });
  }
  if (o.bundle) {
    p.sphere(W.canvasDark, 0.11 * s, 0, 0.5 * s, -0.14 * s, { sy: 1.2, shade: 0.95 });
  }
}

function mercenary(p: Parts) {
  // a deserter: worn leather, dented iron cap, hide shield, bedroll on back
  person(p, { skin: W.skin, tunic: W.leather, trim: W.drabDark, helmet: W.iron, shield: 0x6b4a34, scale: 1.02 });
  p.box(W.canvasDark, 0.1, 0.26, 0.1, 0.1, 0.48, -0.13, { rz: 0.3, shade: 0.9 }); // bedroll
}

function refugee(p: Parts) {
  // hooded, hunched under a carried bundle — drab road-worn cloth
  person(p, { skin: W.skin, tunic: W.drab, trim: W.drabDark, hood: true, bundle: true, scale: 0.95 });
  p.cyl(W.woodDark, 0.014, 0.016, 0.6, 0.16, 0.3, 0.08, { seg: 4, rx: 0.12 }); // walking staff
}

// ---------------------------------------------------------------- props
function den(p: Parts) {
  // rocky lair: piled boulders over a dark cave mouth (+z), old bones outside
  p.cyl(0x7a6a52, 0.95, 1.05, 0.1, 0, 0.05, 0, { seg: 8, shade: 0.9 });   // scratched earth
  p.ico(W.rock, 0.52, -0.3, 0.4, -0.25, { ry: 0.4, shade: 0.95 });
  p.ico(W.rockDark, 0.46, 0.35, 0.34, -0.2, { ry: 1.2 });
  p.ico(W.rock, 0.38, 0.05, 0.62, -0.35, { ry: 2.1, shade: 1.05 });
  p.ico(W.rockDark, 0.3, -0.5, 0.24, 0.25, { ry: 0.8, shade: 0.88 });
  p.ico(W.rock, 0.28, 0.52, 0.2, 0.2, { ry: 1.7 });
  // cave mouth
  p.box(W.cave, 0.5, 0.4, 0.3, 0, 0.2, 0.28);
  p.ico(W.rock, 0.24, -0.32, 0.16, 0.42, { ry: 0.3, shade: 1.02 });
  p.ico(W.rockDark, 0.2, 0.34, 0.14, 0.44, { ry: 2.4 });
  // bones
  p.cyl(W.bone, 0.02, 0.02, 0.3, 0.55, 0.03, 0.55, { seg: 4, rz: Math.PI / 2, ry: 0.5 });
  p.sphere(W.bone, 0.045, 0.68, 0.04, 0.6, { seg: 4 });
  p.cyl(W.bone, 0.018, 0.018, 0.22, -0.6, 0.03, 0.5, { seg: 4, rz: Math.PI / 2, ry: 1.8 });
  p.sphere(W.bone, 0.06, -0.4, 0.05, 0.68, { seg: 4, sy: 0.7 });
}

/**
 * A ruined fort: a broken square of old walls with one corner tower still up,
 * a gateway on the +z face and grass coming through the flags. Neutral ground
 * that either side can claim, so it is deliberately faction-less — the banner
 * the holder plants on it is the only thing that says whose it is.
 */
function outpost(p: Parts) {
  const R = 1.28;
  p.box(0x8f8a7a, R * 2.15, 0.1, R * 2.15, 0, 0.05, 0, { shade: 0.94 });   // old paving
  // weathered curtain walls, broken open toward +z
  const wall = (w: number, h: number, d: number, x: number, y: number, z: number, shade = 1) =>
    p.box(W.rock, w, h, d, x, y, z, { shade });
  wall(R * 2.1, 0.86, 0.26, 0, 0.43, -R, 0.98);               // back wall, intact
  wall(0.26, 0.78, R * 1.5, -R, 0.39, -0.2, 0.94);            // west wall
  wall(0.26, 0.5, R * 0.8, -R, 0.25, 0.72, 0.9);              // west wall, tumbled
  wall(0.26, 0.72, R * 1.1, R, 0.36, -0.45, 0.96);            // east wall
  wall(R * 0.55, 0.34, 0.26, R * 0.66, 0.17, 0.62, 0.88);     // east stub by the gate
  // crenellations survive only on the back wall
  for (let i = -2; i <= 2; i++) {
    p.box(W.rockDark, 0.24, 0.16, 0.28, i * 0.48, 0.94, -R, { shade: 0.92 });
  }
  // the one standing corner tower
  p.cyl(W.rock, 0.44, 0.5, 1.5, -R * 0.9, 0.75, -R * 0.9, { seg: 8 });
  p.cyl(W.rockDark, 0.5, 0.5, 0.12, -R * 0.9, 1.52, -R * 0.9, { seg: 8, shade: 0.9 });
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    p.box(W.rock, 0.16, 0.2, 0.16, -R * 0.9 + Math.cos(a) * 0.4, 1.66, -R * 0.9 + Math.sin(a) * 0.4,
      { ry: a, shade: 0.95 });
  }
  // gateway posts, lintel long gone
  p.box(W.rockDark, 0.3, 0.72, 0.3, -0.5, 0.36, R, { shade: 0.97 });
  p.box(W.rockDark, 0.3, 0.56, 0.3, 0.36, 0.28, R, { shade: 0.93 });
  // fallen blocks and scrub reclaiming the yard
  p.ico(W.rock, 0.26, 0.42, 0.12, 0.2, { ry: 0.7, shade: 1.03 });
  p.ico(W.rockDark, 0.2, -0.35, 0.09, 0.95, { ry: 2.2 });
  p.ico(W.rock, 0.17, 0.9, 0.08, -0.9, { ry: 1.4, shade: 0.9 });
  for (const [gx, gz] of [[-0.15, 0.35], [0.62, -0.5], [-0.75, -0.55], [0.15, 0.95]]) {
    p.cone(0x6f8f3f, 0.15, 0.26, gx, 0.13, gz, { seg: 5, shade: 0.95 });
  }
}

function camp(p: Parts) {
  // deserters' bivouac: ragged tent, lean-to, fire ring, rack of spears, loot
  p.cyl(0x8a744e, 1.35, 1.45, 0.08, 0, 0.04, 0, { seg: 9, shade: 0.92 }); // trampled ground
  // main tent (ridge along z), patched
  p.prism(W.canvas, 1.1, 0.75, 1.2, -0.55, 0.02, -0.5);
  p.box(W.canvasDark, 0.34, 0.26, 0.03, -0.75, 0.3, 0.11, { rz: -0.6, shade: 0.9 }); // patch
  p.box(W.cave, 0.3, 0.34, 0.06, -0.55, 0.18, 0.1);                                  // opening
  p.cyl(W.woodDark, 0.025, 0.03, 0.9, -0.55, 0.45, 0.62, { seg: 4, rx: 0.5 });        // guy pole
  // lean-to
  p.box(W.canvasDark, 0.7, 0.05, 0.6, 0.7, 0.42, -0.55, { rz: 0.45, shade: 0.95 });
  p.cyl(W.woodDark, 0.03, 0.035, 0.5, 0.95, 0.25, -0.35, { seg: 4 });
  p.cyl(W.woodDark, 0.03, 0.035, 0.5, 0.95, 0.25, -0.75, { seg: 4 });
  // fire ring: stones, charred logs, low flame
  const fx = 0.35, fz = 0.55;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    p.ico(W.rockDark, 0.07, fx + Math.cos(a) * 0.24, 0.05, fz + Math.sin(a) * 0.24, { ry: i, shade: 0.9 + (i % 2) * 0.12 });
  }
  p.cyl(W.char, 0.035, 0.035, 0.3, fx, 0.06, fz, { seg: 4, rz: Math.PI / 2, ry: 0.4 });
  p.cyl(W.char, 0.03, 0.03, 0.26, fx, 0.07, fz, { seg: 4, rz: Math.PI / 2, ry: 1.7 });
  p.cone(W.ember, 0.09, 0.2, fx, 0.16, fz, { seg: 5 });
  p.cone(W.flame, 0.05, 0.14, fx + 0.03, 0.22, fz - 0.02, { seg: 4 });
  // spear rack
  p.box(W.wood, 0.5, 0.05, 0.05, -0.15, 0.5, 0.85);
  p.cyl(W.woodDark, 0.025, 0.03, 0.55, -0.38, 0.27, 0.85, { seg: 4 });
  p.cyl(W.woodDark, 0.025, 0.03, 0.55, 0.08, 0.27, 0.85, { seg: 4 });
  for (const dx of [-0.28, -0.14, 0.0]) {
    p.cyl(W.woodDark, 0.014, 0.014, 0.8, dx, 0.42, 0.88, { seg: 4, rz: 0.2 });
    p.cone(0xc9ccd1, 0.03, 0.1, dx - 0.08, 0.82, 0.88, { seg: 4, rz: 0.2 });
  }
  // strongbox + sacks (the stash)
  p.box(W.wood, 0.3, 0.24, 0.22, 0.85, 0.12, 0.35, { ry: 0.3 });
  p.box(W.gold, 0.31, 0.045, 0.23, 0.85, 0.26, 0.35, { ry: 0.3 });
  p.sphere(W.canvasDark, 0.13, 0.6, 0.11, 0.72, { sy: 0.8 });
  p.sphere(W.canvas, 0.1, 0.82, 0.09, 0.78, { sy: 0.8, shade: 1.05 });
}

function cairn(p: Parts) {
  // stacked waymark stones over something buried, moss-flecked
  p.cyl(0x8a7a5e, 0.42, 0.48, 0.06, 0, 0.03, 0, { seg: 8, shade: 0.94 });
  const ring: [number, number, number][] = [
    [0.2, 0.11, 0.05], [-0.16, 0.1, 0.14], [-0.02, 0.12, -0.2], [0.13, 0.1, -0.12], [-0.2, 0.09, -0.04]
  ];
  for (let i = 0; i < ring.length; i++) {
    const [x, r, z] = ring[i];
    p.ico(W.rock, r + 0.05, x, 0.1, z, { ry: i * 1.3, shade: 0.88 + (i % 3) * 0.09 });
  }
  p.ico(W.rockDark, 0.15, 0.05, 0.28, 0.02, { ry: 0.7 });
  p.ico(W.rock, 0.12, -0.06, 0.42, -0.03, { ry: 1.9, shade: 1.06 });
  p.ico(W.rockDark, 0.08, 0.02, 0.55, 0.01, { ry: 0.2, shade: 1.1 });
  p.sphere(W.moss, 0.05, 0.16, 0.2, 0.1, { seg: 4, sy: 0.6 });
  p.sphere(W.moss, 0.04, -0.14, 0.3, -0.08, { seg: 4, sy: 0.6, shade: 0.9 });
}

function pedestal(p: Parts) {
  // weathered plinth bearing the Golden Idol
  p.box(W.plinthDark, 0.8, 0.14, 0.8, 0, 0.07, 0, { shade: 0.95 });
  p.box(W.plinth, 0.56, 0.5, 0.56, 0, 0.39, 0);
  p.box(W.plinthDark, 0.64, 0.08, 0.64, 0, 0.68, 0, { shade: 1.04 });
  // carved band
  p.box(W.plinthDark, 0.58, 0.06, 0.58, 0, 0.3, 0, { shade: 0.88 });
  // the idol: a seated figure, all gold
  p.box(W.gold, 0.22, 0.1, 0.22, 0, 0.77, 0, { shade: 0.95 });
  p.box(W.goldBright, 0.16, 0.22, 0.12, 0, 0.92, 0);
  p.sphere(W.goldBright, 0.075, 0, 1.1, 0, { seg: 6 });
  p.box(W.gold, 0.26, 0.05, 0.08, 0, 0.98, 0.02, { shade: 1.08 });   // outstretched arms
  p.cone(W.gold, 0.09, 0.12, 0, 1.2, 0, { seg: 5 });                 // crown
}

function carcass(p: Parts, variant: number) {
  // a felled animal on its side — villagers butcher it for food
  const hide = variant === 1 ? W.boarHide : W.fawn;
  const dark = variant === 1 ? W.boarDark : W.fawnLight;
  p.cyl(0x8a5a42, 0.42, 0.46, 0.03, 0, 0.015, 0, { seg: 8, shade: 0.85 });
  p.box(hide, 0.22, 0.36, 0.5, 0, 0.15, 0, { rz: Math.PI / 2 - 0.35, shade: 0.96 });
  p.box(dark, 0.18, 0.1, 0.3, -0.1, 0.24, 0.02, { rz: -0.3 });
  p.box(hide, 0.1, 0.11, 0.13, 0.1, 0.1, 0.32, { shade: 0.92 });   // head, flat
  // stiff legs
  for (const dz of [-0.14, 0.12]) {
    p.box(dark, 0.045, 0.22, 0.05, 0.12, 0.22, dz, { rz: -1.1 });
    p.box(dark, 0.045, 0.18, 0.05, 0.16, 0.14, dz + 0.05, { rz: -1.3, shade: 0.9 });
  }
  p.box(W.meat, 0.16, 0.06, 0.2, -0.14, 0.05, -0.1, { shade: 0.9 });
}

// ---------------------------------------------------------------- dispatch
/** Unit models for the wilds. Returns true if the type was handled. */
export function wildsUnit(p: Parts, type: string): boolean {
  switch (type) {
    case 'gazelle': gazelle(p); return true;
    case 'boar': boar(p); return true;
    case 'wolf': wolf(p); return true;
    case 'mercenary': mercenary(p); return true;
    case 'refugee': refugee(p); return true;
  }
  return false;
}

/** Encounter buildings (den, camp, cairn, pedestal). */
export function wildsBuilding(p: Parts, type: string): boolean {
  switch (type) {
    case 'den': den(p); return true;
    case 'camp': camp(p); return true;
    case 'cairn': cairn(p); return true;
    case 'pedestal': pedestal(p); return true;
    case 'outpost': outpost(p); return true;
  }
  return false;
}

/** Resource nodes introduced by encounters (carcasses). */
export function wildsNode(p: Parts, kind: string, variant: number): boolean {
  if (kind === 'carcass') { carcass(p, variant); return true; }
  return false;
}

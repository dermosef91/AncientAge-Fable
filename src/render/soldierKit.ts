// Bolts procedural war-gear onto the rigged villager characters. The same
// sculpted body serves as villager and soldier — the kit strapped to its bones
// (weapon, shield, helmet, armor, quiver) is what tells you which one you are
// looking at, and whose army it marches for.
import * as THREE from 'three';
import type { Faction, UnitTypeId } from '../core/types';
import {
  assets, HEAD, LEFT_FOREARM, LEFT_HAND, RIGHT_HAND, SPINE, type CharAsset
} from './assets';
import { gearGeo, weaponGeo, type WeaponKind } from './models';
import { MAT } from './parts';

/** Haft (+y) onto the palm's grip axis (+z) — same convention as the tools. */
const GRIP_X = Math.PI / 2;

/** Helmets are sculpted for an idealised head; the model's skull is smaller. */
const HELM_FIT = 0.78;

/** Elites stand a shade taller than the rank and file. */
export const SOLDIER_SCALE: Partial<Record<UnitTypeId, number>> = {
  hoplite: 1.06, legionary: 1.02
};

/** Where the archer stands in the chariot's cab, and how big he is aboard. */
export const CHARIOT_RIDER_POS: [number, number, number] = [0, 0.335, -0.18];
export const CHARIOT_RIDER_SCALE = 0.8;

/**
 * The sculpted body a unit type wears, if it has one. Everyone who fights on
 * two legs rides their civilization's villager rig; the wilds have their own.
 * Null means the unit is drawn from procedural geometry instead.
 */
export function riggedAsset(type: UnitTypeId, faction: Faction): CharAsset | null {
  switch (type) {
    case 'refugee': return assets.wilds.woman;
    case 'mercenary': return assets.wilds.bandit;
    case 'villager': case 'spearman': case 'archer':
    case 'hoplite': case 'legionary': case 'chariot':
      return assets.villagers[faction];
    default: return null;
  }
}

/** What each soldier carries, by faction — shape differs, not just paint. */
const SPEARS: Record<Faction, WeaponKind> = { egypt: 'espear', greece: 'dory', rome: 'hasta' };
const BOWS: Record<Faction, WeaponKind> = { egypt: 'recurve', greece: 'cretan', rome: 'sagbow' };

const _qb = new THREE.Quaternion();
const _qr = new THREE.Quaternion();

/**
 * A group parented to a bone whose axes match the character's own frame in
 * the bind pose: +y up, +z the way the character faces. Gear placed inside it
 * uses body coordinates (times the prop scale) and rides the bone afterwards.
 * The caller must not have posed the model yet — bind pose is the reference.
 */
function alignedAnchor(bone: THREE.Object3D, root: THREE.Object3D): THREE.Group {
  const g = new THREE.Group();
  bone.getWorldQuaternion(_qb);
  root.getWorldQuaternion(_qr);
  g.quaternion.copy(_qb.invert().multiply(_qr));
  bone.add(g);
  return g;
}

function place(
  anchor: THREE.Group,
  geo: THREE.BufferGeometry,
  s: number,
  pos: [number, number, number],
  scale = 1
): THREE.Mesh {
  const mesh = new THREE.Mesh(geo, MAT.main);
  mesh.castShadow = true;
  mesh.position.set(pos[0] * s, pos[1] * s, pos[2] * s);
  mesh.scale.setScalar(s * scale);
  anchor.add(mesh);
  return mesh;
}

/** Grip a weapon in a hand bone, the way the villager tools are held. */
function grip(
  hand: THREE.Object3D | undefined,
  kind: WeaponKind,
  s: number,
  rot: [number, number, number] = [GRIP_X, Math.PI, 0],
  scale = 1
): THREE.Mesh | null {
  if (!hand) return null;
  const mesh = new THREE.Mesh(weaponGeo(kind), MAT.main);
  mesh.castShadow = true;
  mesh.position.set(0, 0.055 * s, 0);
  mesh.rotation.set(rot[0], rot[1], rot[2]);
  mesh.scale.setScalar(s * scale);
  hand.add(mesh);
  return mesh;
}

/**
 * How a bow sits in the bow hand. A polearm lies along the palm's grip axis,
 * but a bow is held across it — riser in the fist, limbs standing up and
 * down — so it needs its own rotation rather than the tool convention.
 */
const BOW_GRIP: [number, number, number] = [GRIP_X, 0, -Math.PI / 2];

/** Skull centre relative to the Head bone, in body metres. */
const HEAD_POS: [number, number, number] = [0, 0.073, 0.024];
/** How far the mid-spine joint sits above the chest's own drawing frame. */
const CHEST_DROP = 0.068;

/**
 * Strap a soldier's full kit onto an instantiated character's bones.
 * Villagers get nothing here — their kit is the working tools, fitted by the
 * view as their task changes. Bind pose required (fit before the first
 * mixer update). Returns the meshes added.
 */
export function fitKit(
  type: UnitTypeId,
  faction: Faction,
  root: THREE.Object3D,
  bones: Map<string, THREE.Object3D>,
  s: number
): THREE.Mesh[] {
  const out: (THREE.Mesh | null)[] = [];
  const right = bones.get(RIGHT_HAND);
  const left = bones.get(LEFT_HAND);
  const head = bones.get(HEAD);
  const back = bones.get(SPINE);
  const forearm = bones.get(LEFT_FOREARM);

  const helm = (piece: string, scale = HELM_FIT) => {
    if (!head) return;
    out.push(place(alignedAnchor(head, root), gearGeo(piece, faction), s, HEAD_POS, scale));
  };
  // Armour hangs off the mid-spine so it turns with the chest, which sits a
  // little above the frame the pieces are drawn in — hence the drop.
  const torso = (piece: string, y = -CHEST_DROP) => {
    if (!back) return;
    out.push(place(alignedAnchor(back, root), gearGeo(piece, faction), s, [0, y, 0]));
  };
  const shield = (piece: string) => {
    if (!forearm) return;
    out.push(place(alignedAnchor(forearm, root), gearGeo(piece, faction), s, [0.045, 0, 0.03]));
  };
  const quiver = () => {
    if (!back) return;
    out.push(place(alignedAnchor(back, root), gearGeo('quiver', faction), s, [0, 0.02, -0.02]));
  };

  switch (type) {
    case 'spearman':
      out.push(grip(right, SPEARS[faction], s));
      helm('helm_spearman');
      torso('armor_spearman');
      shield('shield_spearman');
      break;
    case 'archer':
      out.push(grip(left, BOWS[faction], s, BOW_GRIP));
      helm('helm_archer');
      torso('armor_archer');
      quiver();
      // a bracer on the bow arm, where every draw draws the eye
      if (faction !== 'greece' && forearm) {
        out.push(place(alignedAnchor(forearm, root), gearGeo('bracer', faction), s, [0, 0, 0]));
      }
      break;
    case 'hoplite':
      out.push(grip(right, 'longdory', s));
      helm('helm_elite');
      torso('armor_elite');
      shield('shield_elite');
      for (const leg of ['LeftLeg', 'RightLeg']) {
        const b = bones.get(leg);
        if (b) out.push(place(alignedAnchor(b, root), gearGeo('greave', faction), s, [0, 0, 0.01]));
      }
      break;
    case 'legionary':
      out.push(grip(right, 'gladius', s));
      helm('helm_elite');
      torso('armor_elite');
      shield('shield_elite');
      break;
    case 'chariot':
      // the man in the cab: crown and collar, and the largest bow in the
      // arsenal — everything above the rail, because that is all you see
      out.push(grip(left, BOWS[faction], s, BOW_GRIP, 1.12));
      helm('helm_elite');
      torso('armor_elite');
      break;
    case 'mercenary':
      out.push(grip(right, 'spear', s));
      break;
  }
  return out.filter((m): m is THREE.Mesh => m !== null);
}

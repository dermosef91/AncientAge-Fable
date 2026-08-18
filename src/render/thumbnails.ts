// Renders the game's own 3D models into small isometric images used as UI
// icons. One offscreen renderer, results cached as data URLs.
import * as THREE from 'three';
import { BUILDINGS } from '../core/config';
import type { BuildingTypeId, Faction, UnitTypeId } from '../core/types';
import { instantiateCharacter, VILLAGER_CLIPS, type CharAsset } from './assets';
import { buildingGeo, cropGeo, toolGeo, unitGeo, weaponGeo, type WeaponKind } from './models';
import { MAT } from './parts';
import {
  CHARIOT_RIDER_POS, CHARIOT_RIDER_SCALE, fitKit, riggedAsset, SOLDIER_SCALE
} from './soldierKit';

const SIZE = 168;
const cache = new Map<string, string>();
const _m = new THREE.Matrix4();

let renderer: THREE.WebGLRenderer | null = null;
let scene: THREE.Scene | null = null;
let camera: THREE.OrthographicCamera | null = null;
let failed = false;

function init(): boolean {
  if (failed) return false;
  if (renderer) return true;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = SIZE;
    canvas.height = SIZE;
    renderer = new THREE.WebGLRenderer({
      canvas, antialias: true, alpha: true, preserveDrawingBuffer: true
    });
    renderer.setSize(SIZE, SIZE, false);
    renderer.setClearColor(0x000000, 0);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;

    scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xdaeaf2, 0xbfa980, 1.25));
    const sun = new THREE.DirectionalLight(0xfff2dc, 2.3);
    sun.position.set(-4, 7, 5);
    scene.add(sun);
    const rim = new THREE.DirectionalLight(0xcfe0ee, 0.7);
    rim.position.set(5, 3, -4);
    scene.add(rim);

    camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
    return true;
  } catch {
    failed = true;
    return false;
  }
}

/**
 * Bounds of a posed character, in the frame of the root passed in.
 * Box3.setFromObject reads a skinned mesh's bind pose, which for a character
 * in a T-pose is far wider than the pose we render, so sample the posed
 * vertices instead. Skinning is resolved against bone *world* matrices, so
 * the answer is only valid while the root sits where it did when it was
 * posed — hence measuring once, here, and storing it in the root's own frame.
 */
function measurePose(root: THREE.Object3D): THREE.Box3 {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3();
  const v = new THREE.Vector3();
  root.traverse(o => {
    const mesh = o as THREE.SkinnedMesh;
    if (!mesh.isSkinnedMesh) return;
    const count = mesh.geometry.getAttribute('position').count;
    const stride = Math.max(1, Math.ceil(count / 4000));
    for (let i = 0; i < count; i += stride) {
      box.expandByPoint(mesh.getVertexPosition(i, v).applyMatrix4(mesh.matrixWorld));
    }
  });
  return box.applyMatrix4(_m.copy(root.matrixWorld).invert());
}

/**
 * Bounds of an object as it will actually be drawn: every rigid mesh — a
 * soldier's helmet and spear, the chariot under its rider — contributes its
 * own box, and any posed character contributes the one measured for it.
 */
function posedBox(obj: THREE.Object3D): THREE.Box3 {
  obj.updateMatrixWorld(true);
  const box = new THREE.Box3();
  const b = new THREE.Box3();
  obj.traverse(o => {
    const posed = o.userData.posedBox as THREE.Box3 | undefined;
    if (posed) box.union(b.copy(posed).applyMatrix4(o.matrixWorld));
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || (mesh as THREE.SkinnedMesh).isSkinnedMesh) return;
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    box.union(b.copy(mesh.geometry.boundingBox!).applyMatrix4(mesh.matrixWorld));
  });
  return box.isEmpty() ? new THREE.Box3().setFromObject(obj) : box;
}

/** Frame an object isometrically and grab a PNG data URL. */
function snapshot(obj: THREE.Object3D, pad = 1.06): string {
  if (!init() || !renderer || !scene || !camera) return '';
  scene.add(obj);
  const box = posedBox(obj);
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  const r = Math.max(0.25, sphere.radius * pad);
  const dir = new THREE.Vector3(0.62, 0.6, 0.95).normalize();

  camera.left = -r; camera.right = r; camera.top = r; camera.bottom = -r;
  camera.near = 0.01; camera.far = r * 20 + 20;
  camera.position.copy(dir).multiplyScalar(r * 6).add(sphere.center);
  camera.lookAt(sphere.center);
  camera.updateProjectionMatrix();

  renderer.render(scene, camera);
  const url = renderer.domElement.toDataURL('image/png');
  scene.remove(obj);
  return url;
}

export function buildingThumb(type: BuildingTypeId, faction: Faction, tier = 0): string {
  const key = `b:${type}:${faction}:${tier}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;

  const group = new THREE.Group();
  if (type === 'wall') {
    // a lone block reads poorly — show a short stretch of rampart
    for (let i = -1; i <= 1; i++) {
      const m = new THREE.Mesh(buildingGeo('wall', faction, tier), MAT.main);
      m.position.x = i * 1.0;
      group.add(m);
    }
  } else {
    group.add(new THREE.Mesh(buildingGeo(type, faction, tier), MAT.main));
    if (BUILDINGS[type].farm) {
      group.add(new THREE.Mesh(cropGeo(faction, false), MAT.main));
    }
  }
  const url = snapshot(group, type === 'wall' ? 1.0 : 1.05);
  cache.set(key, url);
  return url;
}

/**
 * A skeleton clone of a sculpted character in its kit, frozen a hair into the
 * idle clip — the same body and gear the unit wears on the field, so the
 * portrait in the menu is the thing you get when you press the button.
 */
function posedUnit(type: UnitTypeId, faction: Faction, asset: CharAsset): THREE.Object3D {
  const { root, mixer, bones, boneScale } = instantiateCharacter(asset);
  fitKit(type, faction, root, bones, 1 / (boneScale || 1));
  const scale = SOLDIER_SCALE[type];
  if (scale) root.scale.multiplyScalar(scale);
  const clip = asset.clips.get(VILLAGER_CLIPS.idle) ?? asset.clips.values().next().value;
  if (clip) {
    mixer.clipAction(clip).play();
    // A hair into the clip: frame zero can still be the bind pose.
    mixer.update(Math.min(0.4, clip.duration * 0.25));
  }
  root.userData.posedBox = measurePose(root);
  return root;
}

export function unitThumb(type: UnitTypeId, faction: Faction): string {
  // Most units are sculpted models in game, so the menus must show those too.
  // The key records which art was used: a thumbnail baked before the models
  // finished loading is replaced rather than kept.
  const rigged = riggedAsset(type, faction);
  const key = `u:${type}:${faction}:${rigged ? 'model' : 'geo'}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;

  const group = new THREE.Group();
  if (rigged && type === 'chariot') {
    group.add(new THREE.Mesh(unitGeo(type, faction), MAT.main));
    const rider = posedUnit(type, faction, rigged);
    rider.scale.multiplyScalar(CHARIOT_RIDER_SCALE);
    rider.position.set(...CHARIOT_RIDER_POS);
    group.add(rider);
  } else if (rigged) {
    group.add(posedUnit(type, faction, rigged));
  } else {
    // Fallback art, and the only art the faction-select screen ever gets:
    // its portraits are baked at first paint, while the models are still
    // streaming in. Arm them, or the elites show up empty-handed.
    group.add(new THREE.Mesh(unitGeo(type, faction, type === 'chariot'), MAT.main));
    const wk: WeaponKind | null =
      type === 'spearman' || type === 'hoplite' ? 'spear' :
      type === 'legionary' ? 'sword' :
      type === 'archer' ? 'bow' : null;
    if (wk || type === 'villager') {
      const w = new THREE.Mesh(wk ? weaponGeo(wk) : toolGeo('axe'), MAT.main);
      const scale = type === 'hoplite' ? 1.05 : 1;
      w.position.set(0.21 * scale, 0.42, 0.06);
      w.rotation.x = wk === 'bow' ? -0.3 : -0.5;
      group.add(w);
    }
  }
  // A team and cab is far longer than it is wide: turned to face the camera
  // it foreshortens to nothing, so the chariot is shown broadside.
  const long = type === 'chariot' || type === 'boat' || type === 'ram';
  group.rotation.y = long ? -1.0 : 0.5;
  const url = snapshot(group, long ? 0.95 : 0.9);
  cache.set(key, url);
  return url;
}

/** Small helper producing an <img> tag (or nothing if WebGL is unavailable). */
export function thumbImg(src: string, cls = 'thumb'): string {
  return src ? `<img class="${cls}" src="${src}" alt="" draggable="false">` : '';
}

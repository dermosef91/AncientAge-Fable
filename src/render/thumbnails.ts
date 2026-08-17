// Renders the game's own 3D models into small isometric images used as UI
// icons. One offscreen renderer, results cached as data URLs.
import * as THREE from 'three';
import { BUILDINGS } from '../core/config';
import type { BuildingTypeId, Faction, UnitTypeId } from '../core/types';
import { assets, instantiateCharacter, VILLAGER_CLIPS, type CharAsset } from './assets';
import { buildingGeo, cropGeo, toolGeo, unitGeo, weaponGeo } from './models';
import { MAT } from './parts';

const SIZE = 168;
const cache = new Map<string, string>();

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
 * Bounds of an object as it will actually be drawn. Box3.setFromObject reads a
 * skinned mesh's bind pose, which for a character in a T-pose is far wider than
 * the pose we render — so sample the posed vertices instead.
 */
function posedBox(obj: THREE.Object3D): THREE.Box3 {
  obj.updateMatrixWorld(true);
  const box = new THREE.Box3();
  const v = new THREE.Vector3();
  let skinned = false;
  obj.traverse(o => {
    const mesh = o as THREE.SkinnedMesh;
    if (!mesh.isSkinnedMesh) return;
    const count = mesh.geometry.getAttribute('position').count;
    const stride = Math.max(1, Math.ceil(count / 4000));
    for (let i = 0; i < count; i += stride) {
      box.expandByPoint(mesh.getVertexPosition(i, v).applyMatrix4(mesh.matrixWorld));
    }
    skinned = true;
  });
  return skinned ? box : new THREE.Box3().setFromObject(obj);
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

/** A skeleton clone of a sculpted villager, frozen in its idle pose. */
function posedVillager(asset: CharAsset): THREE.Object3D {
  const { root, mixer } = instantiateCharacter(asset);
  const clip = asset.clips.get(VILLAGER_CLIPS.idle) ?? asset.clips.values().next().value;
  if (clip) {
    mixer.clipAction(clip).play();
    // A hair into the clip: frame zero can still be the bind pose.
    mixer.update(Math.min(0.4, clip.duration * 0.25));
  }
  root.updateMatrixWorld(true);
  return root;
}

export function unitThumb(type: UnitTypeId, faction: Faction): string {
  // Villagers are sculpted models in game, so the menus must show those too.
  // The key records which art was used: a thumbnail baked before the models
  // finished loading is replaced rather than kept.
  const rigged =
    type === 'villager' ? assets.villagers[faction] :
    type === 'refugee' ? assets.wilds.woman :
    type === 'mercenary' ? assets.wilds.bandit : null;
  const key = `u:${type}:${faction}:${rigged ? 'model' : 'geo'}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;

  const group = new THREE.Group();
  if (rigged) {
    group.add(posedVillager(rigged));
  } else {
    group.add(new THREE.Mesh(unitGeo(type, faction), MAT.main));
    const wk = type === 'spearman' || type === 'hoplite' ? 'spear' :
      type === 'legionary' ? 'sword' :
      type === 'archer' || type === 'chariot' ? 'bow' : null;
    // the villager poses with an axe, the commonest of its working tools
    if (wk || type === 'villager') {
      const w = new THREE.Mesh(wk ? weaponGeo(wk) : toolGeo('axe'), MAT.main);
      const s = type === 'hoplite' ? 1.05 : 1;
      w.position.set(0.21 * s, type === 'chariot' ? 0.62 : 0.42, 0.06);
      w.rotation.x = wk === 'bow' ? -0.3 : -0.5;
      group.add(w);
    }
  }
  group.rotation.y = 0.5;
  const url = snapshot(group, type === 'boat' || type === 'chariot' ? 1.05 : 0.9);
  cache.set(key, url);
  return url;
}

/** Small helper producing an <img> tag (or nothing if WebGL is unavailable). */
export function thumbImg(src: string, cls = 'thumb'): string {
  return src ? `<img class="${cls}" src="${src}" alt="" draggable="false">` : '';
}

// Renders the game's own 3D models into small isometric images used as UI
// icons. One offscreen renderer, results cached as data URLs.
import * as THREE from 'three';
import { BUILDINGS } from '../core/config';
import type { BuildingTypeId, Faction, UnitTypeId } from '../core/types';
import { buildingGeo, cropGeo, unitGeo, weaponGeo } from './models';
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

/** Frame an object isometrically and grab a PNG data URL. */
function snapshot(obj: THREE.Object3D, pad = 1.06): string {
  if (!init() || !renderer || !scene || !camera) return '';
  scene.add(obj);
  const box = new THREE.Box3().setFromObject(obj);
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

export function unitThumb(type: UnitTypeId, faction: Faction): string {
  const key = `u:${type}:${faction}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;

  const group = new THREE.Group();
  group.add(new THREE.Mesh(unitGeo(type, faction), MAT.main));
  const wk = type === 'villager' ? 'tool' :
    type === 'spearman' || type === 'hoplite' ? 'spear' :
    type === 'legionary' ? 'sword' :
    type === 'archer' || type === 'chariot' ? 'bow' : null;
  if (wk) {
    const w = new THREE.Mesh(weaponGeo(wk), MAT.main);
    const s = type === 'hoplite' ? 1.05 : 1;
    w.position.set(0.21 * s, type === 'chariot' ? 0.62 : 0.42, 0.06);
    w.rotation.x = wk === 'bow' ? -0.3 : -0.5;
    group.add(w);
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

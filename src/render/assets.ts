// Loads the external glTF models (palm tree, animated Greek villager) and
// normalizes them into the game's scale/orientation conventions.
// Everything degrades gracefully: if a model fails to load the game falls
// back to its procedural geometry.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import palmUrl from '../../assets/palm.glb';
import villagerUrl from '../../assets/greek-villager_Merged_Animations.glb';

/** A static prop flattened to one geometry + material, ready for instancing. */
export interface PropAsset {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
}

/** A rigged character kept as a template that gets skeleton-cloned per unit. */
export interface CharAsset {
  template: THREE.Object3D;
  clips: Map<string, THREE.AnimationClip>;
  /** Uniform scale that brings the model to the game's unit height. */
  scale: number;
  /** Extra Y rotation so the model faces +Z like our units do. */
  yaw: number;
}

export const assets: {
  palm: PropAsset | null;
  greekVillager: CharAsset | null;
  loaded: boolean;
} = { palm: null, greekVillager: null, loaded: false };

/** Names of the clips we drive from gameplay state. */
export const VILLAGER_CLIPS = {
  idle: 'Idle_02',
  idleAlt: 'Idle_03',
  walk: 'Walking',
  run: 'Running',
  chop: 'Heavy_Hammer_Swing',
  collect: 'Collect_Object',
  attack: 'Attack',
  die: 'dying_backwards'
};

let loadPromise: Promise<void> | null = null;

export function loadAssets(onProgress?: (frac: number) => void): Promise<void> {
  if (loadPromise) return loadPromise;
  const loader = new GLTFLoader();
  let done = 0;
  const total = 2;
  const tick = () => { done++; onProgress?.(done / total); };

  const palmJob = loader.loadAsync(palmUrl)
    .then(gltf => { assets.palm = preparePalm(gltf.scene); })
    .catch(err => { console.warn('[assets] palm failed, using procedural trees', err); })
    .finally(tick);

  const villagerJob = loader.loadAsync(villagerUrl)
    .then(gltf => { assets.greekVillager = prepareCharacter(gltf.scene, gltf.animations, 1.0); })
    .catch(err => { console.warn('[assets] villager failed, using procedural unit', err); })
    .finally(tick);

  loadPromise = Promise.all([palmJob, villagerJob]).then(() => {
    assets.loaded = true;
  });
  return loadPromise;
}

// ---------------------------------------------------------------- palm
// Fit the palm inside a box roughly this big (world units, 1 unit = 1 cell)
// so a wide frond canopy can't swallow half the settlement.
const PALM_HEIGHT = 2.4;
const PALM_WIDTH = 2.5;

/**
 * Merge the palm's meshes into a single geometry, baked so that the trunk
 * base sits at y=0 and the tree is PALM_HEIGHT tall — then it can be drawn
 * as one InstancedMesh per variant.
 */
function preparePalm(scene: THREE.Object3D): PropAsset | null {
  scene.updateMatrixWorld(true);
  let geometry: THREE.BufferGeometry | null = null;
  let material: THREE.Material | null = null;

  scene.traverse(obj => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || geometry) return;
    geometry = mesh.geometry.clone();
    geometry.applyMatrix4(mesh.matrixWorld);
    material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
  });
  if (!geometry || !material) return null;

  const geo = geometry as THREE.BufferGeometry;
  geo.computeBoundingBox();
  const box = geo.boundingBox!;
  const size = new THREE.Vector3();
  box.getSize(size);
  const scale = Math.min(
    PALM_HEIGHT / Math.max(0.001, size.y),
    PALM_WIDTH / Math.max(0.001, size.x, size.z)
  );
  const center = new THREE.Vector3();
  box.getCenter(center);
  // center on X/Z, drop the base to y = 0, then scale to game units
  geo.translate(-center.x, -box.min.y, -center.z);
  geo.scale(scale, scale, scale);
  geo.computeBoundingSphere();
  geo.computeVertexNormals();

  const mat = material as THREE.MeshStandardMaterial;
  mat.metalness = 0;
  mat.roughness = 0.95;
  // The roughness/metalness map costs GPU memory and adds nothing to the
  // game's flat look — release it and keep colour + normal detail.
  mat.metalnessMap?.dispose();
  mat.roughnessMap?.dispose();
  mat.metalnessMap = null;
  mat.roughnessMap = null;
  mat.side = THREE.DoubleSide;
  mat.needsUpdate = true;

  return { geometry: geo, material: mat };
}

// ---------------------------------------------------------------- character
/**
 * Prepare a rigged character. The template is never added to the scene —
 * each unit gets a skeleton clone of it.
 */
function prepareCharacter(
  scene: THREE.Object3D,
  animations: THREE.AnimationClip[],
  targetHeight: number
): CharAsset | null {
  scene.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(scene);
  const size = new THREE.Vector3();
  box.getSize(size);
  if (!isFinite(size.y) || size.y <= 0) return null;
  const scale = targetHeight / size.y;

  let hasSkin = false;
  scene.traverse(obj => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    if ((mesh as THREE.SkinnedMesh).isSkinnedMesh) hasSkin = true;
    mesh.castShadow = true;
    mesh.receiveShadow = false;
    mesh.frustumCulled = false; // skinned bounds drift during animation
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of mats) {
      const sm = m as THREE.MeshStandardMaterial;
      if (!sm) continue;
      sm.metalness = 0;
      sm.roughness = 0.9;
      sm.needsUpdate = true;
    }
  });
  if (!hasSkin) return null;

  const clips = new Map<string, THREE.AnimationClip>();
  for (const clip of animations) {
    stripRootMotion(clip);
    clips.set(clip.name, clip);
  }

  return { template: scene, clips, scale, yaw: 0 };
}

/**
 * The simulation owns each unit's position, so horizontal hip translation in
 * a clip would make characters slide away from where the game thinks they
 * are. Flatten the root's X/Z motion but keep its vertical bob.
 */
function stripRootMotion(clip: THREE.AnimationClip) {
  for (const track of clip.tracks) {
    if (!track.name.endsWith('.position')) continue;
    const bone = track.name.split('.')[0];
    if (!/hips|root|armature|pelvis/i.test(bone)) continue;
    const v = track.values as Float32Array;
    if (v.length < 3) continue;
    const x0 = v[0], z0 = v[2];
    for (let i = 0; i + 2 < v.length; i += 3) {
      v[i] -= x0;
      v[i + 2] -= z0;
    }
  }
}

/** Build a fresh, independently animatable instance of a character. */
export function instantiateCharacter(asset: CharAsset): {
  root: THREE.Group;
  mixer: THREE.AnimationMixer;
  bones: Map<string, THREE.Object3D>;
} {
  const model = cloneSkinned(asset.template);
  model.scale.setScalar(asset.scale);
  model.rotation.y = asset.yaw;
  const root = new THREE.Group();
  root.add(model);
  const mixer = new THREE.AnimationMixer(model);
  const bones = new Map<string, THREE.Object3D>();
  model.traverse(o => { if (o.name) bones.set(o.name, o); });
  return { root, mixer, bones };
}

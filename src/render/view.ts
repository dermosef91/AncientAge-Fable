// GameView: three.js scene, camera, lighting, and the sync layer that mirrors
// simulation state into meshes with animation and effects.
import * as THREE from 'three';
import { BUILDINGS, MAP_H, MAP_W, UNITS } from '../core/config';
import type { Building, BuildingTypeId, NodeKind, ResourceNode, SimEvent, Unit } from '../core/types';
import { clamp, lerp } from '../core/utils';
import { heightAt, WATER_Y } from '../sim/map';
import type { World } from '../sim/world';
import { assets, instantiateCharacter, VILLAGER_CLIPS, type CharAsset } from './assets';
import { arrowGeo, Flags, Markers, Particles } from './effects';
import {
  BUILDING_VIS_HEIGHT, buildingGeo, carryGeo, cropGeo, nodeGeo, rubbleGeo,
  scaffoldGeo, unitGeo, weaponGeo
} from './models';
import { MAT } from './parts';
import { TerrainView } from './terrain';

const CAM_DIR = new THREE.Vector3(0.42, 0.82, 0.42).normalize();

interface UnitView {
  group: THREE.Group;
  body: THREE.Mesh | null;        // procedural body (null for rigged models)
  weapon: THREE.Mesh | null;
  carry: THREE.Mesh | null;
  carryKind: NodeKind | null;
  carryAnchor: THREE.Object3D;    // where a carried resource is parented
  flashing: boolean;
  dying: number; // -1 = alive, else timer
  type: string;
  water: boolean;
  // rigged-character extras
  mixer: THREE.AnimationMixer | null;
  actions: Map<string, THREE.AnimationAction> | null;
  clip: string;
  mats: THREE.MeshStandardMaterial[];
  modelScale: number;             // uniform scale of the rigged model (1 = procedural)
}

interface BuildingView {
  group: THREE.Group;
  mesh: THREE.Mesh;
  crop: THREE.Mesh | null;
  scaffold: THREE.Mesh | null;
  built: boolean;
  withered: boolean;
  flashing: boolean;
  hasFlags: boolean;
  tier: number;   // owner's age when the mesh was built — refreshed on age-up
}

interface NodeView {
  mesh: THREE.Mesh;
  kind: NodeKind;
}

interface Bar {
  group: THREE.Group;
  bg: THREE.Mesh;
  fg: THREE.Mesh;
  inUse: boolean;
}

export class GameView {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  terrain: TerrainView;
  particles = new Particles();
  flags = new Flags();
  markers = new Markers();

  // camera state (driven by input)
  camTarget = new THREE.Vector2(0, 0);
  camDist = 30;
  private shake = 0;

  selection = new Set<number>();
  ghost: { type: BuildingTypeId; cx: number; cz: number; ok: boolean; rot?: number } | null = null;

  private unitViews = new Map<number, UnitView>();
  private buildingViews = new Map<number, BuildingView>();
  private nodeViews = new Map<number, NodeView>();
  private projViews = new Map<number, THREE.Mesh>();
  private rubble: { mesh: THREE.Mesh; t: number }[] = [];
  private dyingViews: UnitView[] = [];

  private sun: THREE.DirectionalLight;
  private ghostMesh: THREE.Mesh | null = null;
  private ghostPad: THREE.Mesh;
  private rallyPole: THREE.Group;
  private rings: THREE.Mesh[] = [];
  private ringGeo = new THREE.RingGeometry(0.5, 0.62, 26);
  private ringMat = new THREE.MeshBasicMaterial({ color: 0x52e08a, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide });
  private bars: Bar[] = [];
  private barGeo = new THREE.PlaneGeometry(1, 0.11);
  private barBgMat = new THREE.MeshBasicMaterial({ color: 0x1a1610, transparent: true, opacity: 0.75, depthWrite: false });
  private barFgMats = {
    green: new THREE.MeshBasicMaterial({ color: 0x5fd068, depthWrite: false }),
    yellow: new THREE.MeshBasicMaterial({ color: 0xe8c15a, depthWrite: false }),
    red: new THREE.MeshBasicMaterial({ color: 0xe05a44, depthWrite: false }),
    blue: new THREE.MeshBasicMaterial({ color: 0x5aa8e8, depthWrite: false })
  };
  private arrowG = arrowGeo();
  private raycaster = new THREE.Raycaster();
  private groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private tmpV = new THREE.Vector3();
  private tmpV2 = new THREE.Vector3();

  constructor(private world: World, public canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.scene.background = new THREE.Color(0x9fc9ce);
    this.scene.fog = new THREE.Fog(0xc3d8cf, 110, 235);

    this.camera = new THREE.PerspectiveCamera(38, 1, 1, 260);
    this.onResize();

    // lights
    const hemi = new THREE.HemisphereLight(0xcfe5ee, 0xd0ba90, 0.95);
    this.scene.add(hemi);
    this.sun = new THREE.DirectionalLight(0xffeed2, 2.9);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.near = 5;
    this.sun.shadow.camera.far = 140;
    this.sun.shadow.bias = -0.0008;
    this.sun.shadow.normalBias = 0.03;
    const sc = this.sun.shadow.camera;
    sc.left = -34; sc.right = 34; sc.top = 34; sc.bottom = -34;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    this.terrain = new TerrainView(world);
    this.scene.add(this.terrain.group);
    this.scene.add(this.particles.points);
    this.scene.add(this.flags.group);
    this.scene.add(this.markers.group);

    // ghost placement pad
    this.ghostPad = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ color: 0x3fd97a, transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide })
    );
    this.ghostPad.rotation.x = -Math.PI / 2;
    this.ghostPad.visible = false;
    this.ghostPad.renderOrder = 10;
    this.scene.add(this.ghostPad);

    // rally flag
    this.rallyPole = new THREE.Group();
    const rp = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 1.1, 5), new THREE.MeshLambertMaterial({ color: 0x6b4f33 }));
    rp.position.y = 0.55;
    const rf = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.26), new THREE.MeshLambertMaterial({ color: 0x52e08a, side: THREE.DoubleSide }));
    rf.position.set(0.22, 0.95, 0);
    this.rallyPole.add(rp, rf);
    this.rallyPole.visible = false;
    this.scene.add(this.rallyPole);

    // selection ring pool
    for (let i = 0; i < 28; i++) {
      const ring = new THREE.Mesh(this.ringGeo, this.ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.visible = false;
      ring.renderOrder = 5;
      this.scene.add(ring);
      this.rings.push(ring);
    }
    // health bar pool
    for (let i = 0; i < 56; i++) {
      const group = new THREE.Group();
      const bg = new THREE.Mesh(this.barGeo, this.barBgMat);
      const fg = new THREE.Mesh(this.barGeo, this.barFgMats.green);
      fg.position.z = 0.001;
      fg.scale.y = 0.7;
      group.add(bg, fg);
      group.visible = false;
      group.renderOrder = 30;
      this.scene.add(group);
      this.bars.push({ group, bg, fg, inUse: false });
    }

    const start = world.tcPos[0];
    this.camTarget.set(start.x + 2, start.z + 3);
  }

  onResize() {
    const wpx = window.innerWidth, hpx = window.innerHeight;
    this.renderer.setSize(wpx, hpx, false);
    this.camera.aspect = wpx / hpx;
    this.camera.updateProjectionMatrix();
  }

  // ---------------- picking ----------------
  screenToGround(clientX: number, clientY: number): { x: number; z: number } | null {
    const r = this.canvas.getBoundingClientRect();
    const nx = ((clientX - r.left) / r.width) * 2 - 1;
    const ny = -((clientY - r.top) / r.height) * 2 + 1;
    this.raycaster.setFromCamera(new THREE.Vector2(nx, ny), this.camera);
    const out = new THREE.Vector3();
    if (this.raycaster.ray.intersectPlane(this.groundPlane, out)) {
      return { x: out.x, z: out.z };
    }
    return null;
  }

  pickEntity(clientX: number, clientY: number): { kind: 'unit' | 'building' | 'node'; id: number } | null {
    const r = this.canvas.getBoundingClientRect();
    const nx = ((clientX - r.left) / r.width) * 2 - 1;
    const ny = -((clientY - r.top) / r.height) * 2 + 1;
    this.raycaster.setFromCamera(new THREE.Vector2(nx, ny), this.camera);
    const ray = this.raycaster.ray;
    const w = this.world;
    let best: { kind: 'unit' | 'building' | 'node'; id: number } | null = null;
    let bestT = Infinity;

    const test = (x: number, y: number, z: number, rad: number): number => {
      this.tmpV.set(x, y, z).sub(ray.origin);
      const t = this.tmpV.dot(ray.direction);
      if (t < 0) return -1;
      this.tmpV2.copy(ray.direction).multiplyScalar(t).add(ray.origin);
      const d = this.tmpV2.distanceTo(this.tmpV.set(x, y, z));
      return d <= rad ? t : -1;
    };

    for (const u of w.units.values()) {
      if (u.owner !== 0 && !w.isExploredWorld(u.x, u.z)) continue;
      const y = u.water ? WATER_Y + 0.6 : 0.5;
      const t = test(u.x, y, u.z, u.type === 'chariot' || u.type === 'boat' ? 0.75 : 0.55);
      if (t >= 0 && t < bestT) { bestT = t - 2; best = { kind: 'unit', id: u.id } }
    }
    for (const b of w.buildings.values()) {
      if (b.owner !== 0 && !w.isExploredWorld(b.x, b.z)) continue;
      const h = BUILDING_VIS_HEIGHT[b.type];
      const t = test(b.x, h * 0.42, b.z, b.size * 0.62 + 0.25);
      if (t >= 0 && t < bestT) { bestT = t; best = { kind: 'building', id: b.id } }
    }
    for (const n of w.nodes.values()) {
      if (!w.isExploredWorld(n.x, n.z)) continue;
      const t = test(n.x, 0.5, n.z, n.kind === 'tree' ? 0.62 : 0.75);
      if (t >= 0 && t < bestT) { bestT = t; best = { kind: 'node', id: n.id } }
    }
    return best;
  }

  worldToScreen(x: number, y: number, z: number): { x: number; y: number } {
    this.tmpV.set(x, y, z).project(this.camera);
    const r = this.canvas.getBoundingClientRect();
    return { x: (this.tmpV.x * 0.5 + 0.5) * r.width, y: (-this.tmpV.y * 0.5 + 0.5) * r.height };
  }

  addShake(amount: number) { this.shake = Math.min(0.6, this.shake + amount); }

  // ---------------- event processing ----------------
  handleEvents(events: SimEvent[]) {
    const w = this.world;
    for (const e of events) {
      switch (e.t) {
        case 'gatherTick': {
          const n = w.nodes.get(e.nodeId);
          if (n?.kind === 'tree') this.terrain.treeShake(e.nodeId);
          if (w.isExploredWorld(e.x, e.z)) {
            this.particles.gatherChips(e.x, 0.6, e.z, e.kind);
          }
          break;
        }
        case 'nodeDepleted': {
          if (e.kind === 'tree') {
            this.terrain.treeRemove(e.nodeId);
            this.particles.burst(e.x, 0.8, e.z, 12, 0x5f9440, { speed: 1.3, up: 1, life: 0.8, size: 0.16, grav: 2.5 });
          } else {
            const nv = this.nodeViews.get(e.nodeId);
            if (nv) {
              this.scene.remove(nv.mesh);
              this.nodeViews.delete(e.nodeId);
            }
            this.particles.dust(e.x, 0.3, e.z, 8);
          }
          break;
        }
        case 'hit':
          if (w.isExploredWorld(e.x, e.z)) this.particles.hit(e.x, e.y, e.z);
          break;
        case 'shoot':
          break;
        case 'die': {
          const v = this.unitViews.get(e.id);
          if (v) {
            v.dying = 0;
            if (v.actions) {
              // play the death clip once and hold the final pose
              for (const a of v.actions.values()) a.fadeOut(0.15);
              const dieAction = v.actions.get(VILLAGER_CLIPS.die);
              if (dieAction) {
                dieAction.reset().setEffectiveWeight(1).fadeIn(0.12).play();
                v.clip = VILLAGER_CLIPS.die;
              }
              if (v.carry) v.carry.visible = false;
            }
            this.dyingViews.push(v);
            this.unitViews.delete(e.id);
            if (v.water) this.particles.splash(e.x, e.z);
            else this.particles.death(e.x, e.z);
          }
          break;
        }
        case 'boom': {
          const bv = this.buildingViews.get(e.id);
          if (bv) {
            this.scene.remove(bv.group);
            this.buildingViews.delete(e.id);
            this.flags.removeFor(e.id);
          }
          this.particles.boom(e.x, e.z, e.size);
          const rub = new THREE.Mesh(rubbleGeo(e.size), MAT.main);
          rub.position.set(e.x, heightAt(w, e.x, e.z), e.z);
          rub.rotation.y = e.id;
          this.scene.add(rub);
          this.rubble.push({ mesh: rub, t: 0 });
          this.addShake(0.25 + e.size * 0.05);
          break;
        }
        case 'built': {
          this.particles.dust(e.x, 0.4, e.z, 14);
          break;
        }
        case 'place':
          this.particles.dust(e.x, 0.2, e.z, 8);
          break;
        case 'upgrade': {
          // the building transformed in place — rebuild its view with the new model
          const bv = this.buildingViews.get(e.id);
          if (bv) {
            this.scene.remove(bv.group);
            this.buildingViews.delete(e.id);
            this.flags.removeFor(e.id);
          }
          this.particles.dust(e.x, 0.6, e.z, 16);
          break;
        }
        case 'deposit':
          if (e.owner === 0) {
            this.particles.burst(e.x, 1.2, e.z, 3, 0xf0c05a, { speed: 0.5, up: 1, life: 0.5, size: 0.12, grav: 1 });
          }
          break;
        case 'ping':
          this.markers.ping(e.x, 0.1, e.z, 'attack');
          break;
      }
    }
  }

  // ---------------- main update ----------------
  update(alpha: number, rdt: number, time: number) {
    const w = this.world;
    this.syncUnits(alpha, rdt, time);
    this.syncBuildings(time);
    this.syncNodes(time);
    this.syncProjectiles(alpha);
    this.updateDying(rdt);
    this.updateRubble(rdt);
    this.particles.update(rdt);
    this.flags.update(time);
    this.markers.update(rdt);
    this.terrain.update(rdt, time);
    this.updateGhost();
    this.updateSelectionUI(time);
    this.updateCamera(rdt);
    this.renderer.render(this.scene, this.camera);
  }

  private updateCamera(rdt: number) {
    const t = this.camTarget;
    t.x = clamp(t.x, 4, MAP_W - 4);
    t.y = clamp(t.y, 4, MAP_H - 4);
    this.shake = Math.max(0, this.shake - rdt * 1.4);
    const sx = this.shake > 0 ? (Math.random() - 0.5) * this.shake * 0.7 : 0;
    const sz = this.shake > 0 ? (Math.random() - 0.5) * this.shake * 0.7 : 0;
    this.camera.position.set(
      t.x + CAM_DIR.x * this.camDist + sx,
      CAM_DIR.y * this.camDist,
      t.y + CAM_DIR.z * this.camDist + sz
    );
    this.camera.lookAt(t.x + sx, 0, t.y + sz);
    // sun follows camera target so shadows stay crisp
    this.sun.position.set(t.x - 22, 34, t.y + 14);
    this.sun.target.position.set(t.x, 0, t.y);
  }

  // ---------------- units ----------------
  private syncUnits(alpha: number, rdt: number, time: number) {
    const w = this.world;
    for (const u of w.units.values()) {
      let v = this.unitViews.get(u.id);
      if (!v) {
        v = this.createUnitView(u);
        this.unitViews.set(u.id, v);
      }
      const explored = u.owner === 0 || w.isExploredWorld(u.x, u.z);
      v.group.visible = explored;
      if (!explored) continue;

      const x = lerp(u.px, u.x, alpha);
      const z = lerp(u.pz, u.z, alpha);
      const moving = Math.hypot(u.x - u.px, u.z - u.pz) > 0.004;
      let y = u.water ? WATER_Y + 0.16 : heightAt(w, x, z);

      // animation
      const phase = u.id * 1.37;
      if (v.mixer) {
        // rigged character: the clips carry the motion
        v.mixer.update(rdt);
        this.setClip(v, this.villagerClip(u, moving));
        v.group.position.set(x, y, z);
        v.group.rotation.set(0, u.dir, 0);
      } else if (u.water) {
        y += Math.sin(time * 1.6 + phase) * 0.04;
        v.group.rotation.z = Math.sin(time * 1.2 + phase) * 0.04;
      } else if (moving) {
        const speed = u.type === 'chariot' ? 14 : 11;
        y += Math.abs(Math.sin(time * speed + phase)) * (u.type === 'chariot' ? 0.03 : 0.055);
        v.group.rotation.z = Math.sin(time * speed + phase) * 0.05;
        if (u.type === 'chariot' && Math.random() < rdt * 8) {
          this.particles.spawn(x, 0.1, z, 0, 0.4, 0, 0.5, 0.16, 0xd9c8a0, 0.5);
        }
      } else {
        // idle breathing
        v.group.rotation.z = 0;
        const s = 1 + Math.sin(time * 2.2 + phase) * 0.012;
        if (v.body) v.body.scale.y = s;
      }
      if (!v.mixer) {
        v.group.position.set(x, y, z);
        v.group.rotation.y = u.dir;
      }

      // attack lunge (rigged models carry their own attack motion)
      if (u.attackAnimT < 0.22 && !u.water && !v.mixer) {
        const k = Math.sin((u.attackAnimT / 0.22) * Math.PI);
        v.group.position.x += Math.sin(u.dir) * k * 0.16;
        v.group.position.z += Math.cos(u.dir) * k * 0.16;
      }

      // weapon swing
      if (v.weapon) {
        const working = (u.task.type === 'gather' || u.task.type === 'build' || u.task.type === 'farm') && !moving;
        if (u.type === 'villager' && working) {
          const swing = Math.sin(time * 7 + phase);
          v.weapon.rotation.x = -0.4 + swing * 0.75;
          v.weapon.visible = true;
        } else if (u.attackAnimT < 0.3) {
          const k = u.attackAnimT / 0.3;
          v.weapon.rotation.x = -1.5 + Math.sin(k * Math.PI) * 1.9;
          v.weapon.visible = true;
        } else {
          v.weapon.rotation.x = u.type === 'archer' || u.type === 'chariot' ? -0.3 : -0.15;
          v.weapon.visible = true;
        }
      }

      // carry prop — rigged villagers hold it in their hand
      const showCarry = u.carryAmt > w.carryCap(u.owner) * 0.35 && u.carryKind !== null;
      if (showCarry && v.carryKind !== u.carryKind) {
        if (v.carry) v.carry.removeFromParent();
        v.carry = new THREE.Mesh(carryGeo(u.carryKind!), MAT.main);
        if (v.mixer) {
          // parented to a hand bone, so undo the model's scale
          const inv = 1 / (v.modelScale || 1);
          v.carry.scale.setScalar(inv * 0.9);
          v.carry.position.set(0, 0.04 * inv, 0.06 * inv);
        } else {
          v.carry.position.set(0, u.carryKind === 'tree' ? 0.62 : 0.88, u.carryKind === 'tree' ? 0.1 : 0);
        }
        v.carryAnchor.add(v.carry);
        v.carryKind = u.carryKind;
      }
      if (v.carry) v.carry.visible = showCarry;
      if (!showCarry) v.carryKind = null;

      // damage flash
      const flash = w.time - u.lastHitT < 0.12;
      if (flash !== v.flashing) {
        v.flashing = flash;
        if (v.body) {
          v.body.material = flash ? MAT.flash : MAT.main;
        } else {
          for (const m of v.mats) {
            m.emissive.setHex(flash ? 0xffffff : 0x000000);
            m.emissiveIntensity = flash ? 0.85 : 0;
          }
        }
      }
    }
    // remove views for units that vanished without a death event (shouldn't happen, safety)
    for (const [id, v] of this.unitViews) {
      if (!w.units.has(id)) {
        this.scene.remove(v.group);
        this.unitViews.delete(id);
      }
    }
  }

  private createUnitView(u: Unit): UnitView {
    const w = this.world;
    const faction = w.players[u.owner].faction;

    // Villagers use their civilization's sculpted, animated model once loaded;
    // the wilds' refugees and deserters share the rig with neutral characters.
    const rigged =
      u.type === 'villager' ? assets.villagers[faction] :
      u.type === 'refugee' ? assets.wilds.woman :
      u.type === 'mercenary' ? assets.wilds.bandit : null;
    if (rigged) return this.createRiggedVillager(u, rigged);

    const group = new THREE.Group();
    const body = new THREE.Mesh(unitGeo(u.type, faction), MAT.main);
    body.castShadow = true;
    group.add(body);
    let weapon: THREE.Mesh | null = null;
    const wk = u.type === 'villager' ? 'tool' :
      u.type === 'spearman' || u.type === 'hoplite' ? 'spear' :
      u.type === 'legionary' ? 'sword' :
      u.type === 'archer' || u.type === 'chariot' ? 'bow' : null;
    if (wk) {
      weapon = new THREE.Mesh(weaponGeo(wk), MAT.main);
      const s = u.type === 'hoplite' ? 1.05 : 1;
      weapon.position.set(0.21 * s, u.type === 'chariot' ? 0.62 : 0.42, 0.06);
      if (wk === 'bow') weapon.rotation.z = Math.PI / 2 * 0.1;
      group.add(weapon);
    }
    this.scene.add(group);
    return {
      group, body, weapon, carry: null, carryKind: null, carryAnchor: group,
      flashing: false, dying: -1, type: u.type, water: u.water,
      mixer: null, actions: null, clip: '', mats: [], modelScale: 1
    };
  }

  private createRiggedVillager(u: Unit, asset: CharAsset): UnitView {
    const { root, mixer, bones } = instantiateCharacter(asset);

    // Own the materials so a damage flash affects only this villager.
    const mats: THREE.MeshStandardMaterial[] = [];
    root.traverse(o => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const src = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const cloned = src.map(m => {
        const c = (m as THREE.MeshStandardMaterial).clone();
        mats.push(c);
        return c;
      });
      mesh.material = cloned.length === 1 ? cloned[0] : cloned;
    });

    const actions = new Map<string, THREE.AnimationAction>();
    for (const [name, clip] of asset.clips) {
      const action = mixer.clipAction(clip);
      if (name === VILLAGER_CLIPS.die) {
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
      }
      actions.set(name, action);
    }
    // stagger identical idles so a crowd doesn't breathe in lockstep
    const idle = actions.get(VILLAGER_CLIPS.idle);
    if (idle) {
      idle.play();
      idle.time = (u.id * 0.37) % Math.max(0.1, idle.getClip().duration);
    }

    this.scene.add(root);
    return {
      group: root,
      body: null,
      weapon: null,
      carry: null,
      carryKind: null,
      carryAnchor: bones.get('LeftHand') ?? bones.get('RightHand') ?? root,
      flashing: false,
      dying: -1,
      type: u.type,
      water: u.water,
      mixer,
      actions,
      clip: VILLAGER_CLIPS.idle,
      mats,
      modelScale: asset.scale
    };
  }

  /** Pick the clip that matches what this unit is currently doing. */
  private villagerClip(u: Unit, moving: boolean): string {
    const C = VILLAGER_CLIPS;
    if (u.task.type === 'attack') return C.attack;
    if (moving) return C.walk;
    switch (u.task.type) {
      case 'gather': {
        const n = this.world.nodes.get(u.task.nodeId);
        return n && (n.kind === 'berries' || n.kind === 'fish') ? C.collect : C.chop;
      }
      case 'farm': return C.collect;
      case 'build': return C.chop;
      default: return C.idle;
    }
  }

  private setClip(v: UnitView, name: string, fade = 0.22) {
    if (!v.actions || v.clip === name) return;
    const next = v.actions.get(name);
    if (!next) return;
    const prev = v.clip ? v.actions.get(v.clip) : null;
    next.reset();
    next.setEffectiveTimeScale(name === VILLAGER_CLIPS.walk ? 1.25 : 1);
    next.setEffectiveWeight(1);
    next.fadeIn(fade).play();
    if (prev && prev !== next) prev.fadeOut(fade);
    v.clip = name;
  }

  private updateDying(rdt: number) {
    for (let i = this.dyingViews.length - 1; i >= 0; i--) {
      const v = this.dyingViews[i];
      v.dying += rdt;
      const t = v.dying;
      if (v.mixer) {
        // rigged: let the death clip play out, then sink away
        v.mixer.update(rdt);
        if (t > 1.9) v.group.position.y -= rdt * 0.55;
        if (t > 2.9) {
          this.scene.remove(v.group);
          this.dyingViews.splice(i, 1);
        }
        continue;
      }
      if (v.water) {
        v.group.position.y -= rdt * 0.8;
        v.group.rotation.z += rdt * 0.6;
      } else if (t < 0.35) {
        v.group.rotation.x = -(t / 0.35) * Math.PI / 2;
      } else {
        v.group.position.y -= rdt * 0.75;
      }
      if (t > 1.1) {
        this.scene.remove(v.group);
        this.dyingViews.splice(i, 1);
      }
    }
  }

  // ---------------- buildings ----------------
  private syncBuildings(time: number) {
    const w = this.world;
    for (const b of w.buildings.values()) {
      let v = this.buildingViews.get(b.id);
      if (!v) {
        v = this.createBuildingView(b);
        this.buildingViews.set(b.id, v);
      }
      const explored = b.owner === 0 || w.isExploredWorld(b.x, b.z);
      v.group.visible = explored;
      if (!explored) continue;

      // every epoch dresses standing buildings up a little more
      const tier = w.players[b.owner].age;
      if (v.tier !== tier) {
        v.tier = tier;
        v.mesh.geometry = buildingGeo(b.type, w.players[b.owner].faction, tier);
      }

      if (!b.built) {
        const h = BUILDING_VIS_HEIGHT[b.type];
        v.mesh.position.y = -h * 0.85 * (1 - b.progress);
        if (v.crop) v.crop.visible = false;
        if (!v.scaffold) {
          v.scaffold = new THREE.Mesh(scaffoldGeo(b.size), MAT.main);
          v.group.add(v.scaffold);
        }
      } else {
        v.mesh.position.y = 0;
        if (v.scaffold) {
          v.group.remove(v.scaffold);
          v.scaffold = null;
        }
        if (!v.hasFlags) {
          v.hasFlags = true;
          this.addBuildingFlags(b);
        }
        if (v.crop) {
          v.crop.visible = true;
          if (v.withered !== b.withered) {
            v.withered = b.withered;
            v.crop.geometry = cropGeo(w.players[b.owner].faction, b.withered);
          }
          const grow = clamp(b.farmFood / 320, 0.25, 1);
          v.crop.scale.y = 0.4 + grow * 0.6;
        }
      }
      // tower recoil on shot
      if (b.attackAnimT < 0.18) {
        v.mesh.position.y += Math.sin((b.attackAnimT / 0.18) * Math.PI) * 0.04;
      }
      const flash = w.time - b.lastHitT < 0.05;
      if (flash !== v.flashing) {
        v.flashing = flash;
        v.mesh.material = flash ? MAT.flash : MAT.main;
      }
    }
    for (const [id, v] of this.buildingViews) {
      if (!w.buildings.has(id)) {
        this.scene.remove(v.group);
        this.buildingViews.delete(id);
        this.flags.removeFor(id);
      }
    }
  }

  private createBuildingView(b: Building): BuildingView {
    const w = this.world;
    const faction = w.players[b.owner].faction;
    const tier = w.players[b.owner].age;
    const group = new THREE.Group();
    group.position.set(b.x, heightAt(w, b.x, b.z), b.z);
    group.rotation.y = b.rot * Math.PI / 2;
    const mesh = new THREE.Mesh(buildingGeo(b.type, faction, tier), MAT.main);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    let crop: THREE.Mesh | null = null;
    if (BUILDINGS[b.type].farm) {
      crop = new THREE.Mesh(cropGeo(faction, false), MAT.main);
      group.add(crop);
    }
    this.scene.add(group);
    const v: BuildingView = { group, mesh, crop, scaffold: null, built: b.built, withered: false, flashing: false, hasFlags: false, tier };
    if (b.built) {
      v.hasFlags = true;
      this.addBuildingFlags(b);
    }
    return v;
  }

  private addBuildingFlags(b: Building) {
    const w = this.world;
    const accent = accentOf(w, b.owner);
    const y = heightAt(w, b.x, b.z);
    switch (b.type) {
      case 'towncenter':
        this.flags.add(b.id, b.x - 1.75, y, b.z + 1.75, accent, 1.15);
        this.flags.add(b.id, b.x + 1.75, y, b.z + 1.75, accent, 1.15);
        break;
      case 'barracks':
        this.flags.add(b.id, b.x + 1.15, y, b.z + 1.15, accent, 0.9);
        break;
      case 'range':
        this.flags.add(b.id, b.x - 1.15, y, b.z + 1.15, accent, 0.9);
        break;
      case 'tower':
        this.flags.add(b.id, b.x + 0.4, y + 1.85, b.z + 0.4, accent, 0.7);
        break;
      case 'monument':
        this.flags.add(b.id, b.x - 1.25, y, b.z + 1.25, accent, 1.0);
        this.flags.add(b.id, b.x + 1.25, y, b.z + 1.25, accent, 1.0);
        break;
      case 'dock':
        this.flags.add(b.id, b.x - 0.85, y + 0.34, b.z - 0.85, accent, 0.75);
        break;
      case 'market':
        this.flags.add(b.id, b.x - 1.15, y, b.z - 1.15, accent, 0.85);
        break;
      case 'forum':
        this.flags.add(b.id, b.x + 1.2, y, b.z + 1.2, accent, 0.9);
        break;
      case 'temple':
        this.flags.add(b.id, b.x + 0.8, y, b.z - 0.8, accent, 0.8);
        break;
      case 'amphitheater':
        this.flags.add(b.id, b.x - 1.2, y, b.z + 1.2, accent, 0.9);
        this.flags.add(b.id, b.x + 1.2, y, b.z + 1.2, accent, 0.9);
        break;
      case 'wonder':
        this.flags.add(b.id, b.x - 1.8, y, b.z + 1.8, accent, 1.2);
        this.flags.add(b.id, b.x + 1.8, y, b.z + 1.8, accent, 1.2);
        break;
      case 'lighthouse':
        this.flags.add(b.id, b.x + 0.6, y + 0.6, b.z + 0.6, accent, 0.7);
        break;
    }
  }

  // ---------------- nodes ----------------
  private syncNodes(time: number) {
    const w = this.world;
    for (const n of w.nodes.values()) {
      if (n.kind === 'tree') continue; // instanced in terrain
      let v = this.nodeViews.get(n.id);
      if (!v) {
        const mesh = new THREE.Mesh(nodeGeo(n.kind, n.variant), MAT.main);
        mesh.position.set(n.x, n.kind === 'fish' ? WATER_Y + 0.14 : heightAt(w, n.x, n.z), n.z);
        mesh.rotation.y = n.id * 1.3;
        mesh.castShadow = n.kind !== 'fish';
        this.scene.add(mesh);
        v = { mesh, kind: n.kind };
        this.nodeViews.set(n.id, v);
      }
      const explored = w.isExploredWorld(n.x, n.z);
      v.mesh.visible = explored;
      if (!explored) continue;
      const frac = 0.55 + 0.45 * (n.amount / n.max);
      v.mesh.scale.setScalar(frac);
      if (n.kind === 'fish') {
        v.mesh.position.y = WATER_Y + 0.14 + Math.sin(time * 1.8 + n.id) * 0.03;
        v.mesh.rotation.y += 0.003;
      }
    }
    for (const [id, v] of this.nodeViews) {
      if (!w.nodes.has(id)) {
        this.scene.remove(v.mesh);
        this.nodeViews.delete(id);
      }
    }
  }

  // ---------------- projectiles ----------------
  private syncProjectiles(alpha: number) {
    const w = this.world;
    const seen = new Set<number>();
    for (const p of w.projectiles) {
      seen.add(p.id);
      let m = this.projViews.get(p.id);
      if (!m) {
        m = new THREE.Mesh(this.arrowG, MAT.main);
        this.scene.add(m);
        this.projViews.set(p.id, m);
      }
      const x = lerp(p.px, p.x, alpha);
      const y = lerp(p.py, p.y, alpha);
      const z = lerp(p.pz, p.z, alpha);
      m.position.set(x, y, z);
      const dx = p.x - p.px, dy = p.y - p.py, dz = p.z - p.pz;
      if (Math.abs(dx) + Math.abs(dz) > 0.001) {
        m.rotation.y = Math.atan2(dx, dz);
        m.rotation.x = -Math.atan2(dy, Math.hypot(dx, dz));
      }
      if (Math.random() < 0.4) this.particles.trail(x, y, z);
    }
    for (const [id, m] of this.projViews) {
      if (!seen.has(id)) {
        this.scene.remove(m);
        this.projViews.delete(id);
      }
    }
  }

  private updateRubble(rdt: number) {
    for (let i = this.rubble.length - 1; i >= 0; i--) {
      const r = this.rubble[i];
      r.t += rdt;
      if (r.t > 18) {
        r.mesh.position.y -= rdt * 0.06;
        if (r.t > 22) {
          this.scene.remove(r.mesh);
          this.rubble.splice(i, 1);
        }
      }
    }
  }

  // ---------------- selection / ghost ----------------
  private updateSelectionUI(time: number) {
    const w = this.world;
    let ringI = 0;
    let barI = 0;
    const pulse = 0.9 + Math.sin(time * 5) * 0.1;

    const useBar = (x: number, y: number, z: number, width: number, pct: number, color: 'green' | 'yellow' | 'red' | 'blue') => {
      if (barI >= this.bars.length) return;
      const bar = this.bars[barI++];
      bar.group.visible = true;
      bar.group.position.set(x, y, z);
      bar.group.quaternion.copy(this.camera.quaternion);
      bar.bg.scale.x = width;
      bar.fg.scale.x = Math.max(0.001, width * pct);
      bar.fg.position.x = -width * (1 - pct) / 2;
      bar.fg.material = this.barFgMats[color];
    };

    // rally flag
    this.rallyPole.visible = false;

    for (const id of this.selection) {
      const u = w.units.get(id);
      if (u) {
        if (ringI < this.rings.length) {
          const ring = this.rings[ringI++];
          ring.visible = true;
          const y = u.water ? WATER_Y + 0.18 : heightAt(w, u.x, u.z);
          ring.position.set(
            this.unitViews.get(id)?.group.position.x ?? u.x, y + 0.04,
            this.unitViews.get(id)?.group.position.z ?? u.z
          );
          const s = (UNITS[u.type].radius + 0.28) * pulse;
          ring.scale.setScalar(s * 1.6);
        }
        continue;
      }
      const b = w.buildings.get(id);
      if (b) {
        if (ringI < this.rings.length) {
          const ring = this.rings[ringI++];
          ring.visible = true;
          ring.position.set(b.x, heightAt(w, b.x, b.z) + 0.05, b.z);
          ring.scale.setScalar(b.size * 0.82 * pulse + 0.4);
        }
        if (b.rally && b.owner === 0) {
          this.rallyPole.visible = true;
          this.rallyPole.position.set(b.rally.x, heightAt(w, b.rally.x, b.rally.z), b.rally.z);
        }
      }
    }
    for (let i = ringI; i < this.rings.length; i++) this.rings[i].visible = false;

    // health bars: selected or damaged entities
    for (const u of w.units.values()) {
      const damaged = u.hp < u.maxHp - 0.5;
      const recent = w.time - u.lastHitT < 5;
      if (!(this.selection.has(u.id) || (damaged && recent) || (damaged && this.selection.has(u.id)))) continue;
      if (u.owner !== 0 && !w.isExploredWorld(u.x, u.z)) continue;
      const uv = this.unitViews.get(u.id);
      const px = uv?.group.position.x ?? u.x;
      const pz = uv?.group.position.z ?? u.z;
      const py = (uv?.group.position.y ?? 0) + (u.type === 'boat' ? 1.6 : u.type === 'chariot' ? 1.35 : 1.15);
      const pct = clamp(u.hp / u.maxHp, 0, 1);
      useBar(px, py, pz, 0.6, pct, pct > 0.55 ? 'green' : pct > 0.25 ? 'yellow' : 'red');
    }
    for (const b of w.buildings.values()) {
      if (b.owner !== 0 && !w.isExploredWorld(b.x, b.z)) continue;
      const damaged = b.hp < b.maxHp - 1;
      const constructing = !b.built;
      const recent = w.time - b.lastHitT < 6;
      const selected = this.selection.has(b.id);
      if (!(selected || constructing || (damaged && recent))) continue;
      const h = constructing ? 1.0 : BUILDING_VIS_HEIGHT[b.type] + 0.4;
      const y = heightAt(w, b.x, b.z) + h;
      if (constructing) {
        useBar(b.x, y, b.z, b.size * 0.55 + 0.5, b.progress, 'blue');
      } else {
        const pct = clamp(b.hp / b.maxHp, 0, 1);
        useBar(b.x, y, b.z, b.size * 0.55 + 0.5, pct, pct > 0.55 ? 'green' : pct > 0.25 ? 'yellow' : 'red');
      }
    }
    for (let i = barI; i < this.bars.length; i++) this.bars[i].group.visible = false;
  }

  private updateGhost() {
    if (!this.ghost) {
      if (this.ghostMesh) {
        this.scene.remove(this.ghostMesh);
        this.ghostMesh = null;
      }
      this.ghostPad.visible = false;
      return;
    }
    const g = this.ghost;
    const def = BUILDINGS[g.type];
    const faction = this.world.players[0].faction;
    const tier = this.world.players[0].age;
    const key = `${g.type}:${tier}`;
    if (!this.ghostMesh || this.ghostMesh.userData.key !== key) {
      if (this.ghostMesh) this.scene.remove(this.ghostMesh);
      this.ghostMesh = new THREE.Mesh(buildingGeo(g.type, faction, tier), MAT.ghostOk);
      this.ghostMesh.userData.key = key;
      this.ghostMesh.renderOrder = 11;
      this.scene.add(this.ghostMesh);
    }
    const cx = g.cx + def.size / 2, cz = g.cz + def.size / 2;
    this.ghostMesh.position.set(cx, heightAt(this.world, cx, cz) + 0.05, cz);
    this.ghostMesh.rotation.y = (g.rot ?? 0) * Math.PI / 2;
    this.ghostMesh.material = g.ok ? MAT.ghostOk : MAT.ghostBad;
    this.ghostPad.visible = true;
    this.ghostPad.position.set(cx, 0.03 + Math.max(0, heightAt(this.world, cx, cz)), cz);
    this.ghostPad.scale.set(def.size, def.size, 1);
    (this.ghostPad.material as THREE.MeshBasicMaterial).color.setHex(g.ok ? 0x3fd97a : 0xe0452e);
  }

  dispose() {
    this.terrain.dispose();
    this.flags.clear();
    this.markers.clear();
    this.renderer.dispose();
  }
}

function accentOf(w: World, owner: number): number {
  const f = w.players[owner].faction;
  return f === 'egypt' ? 0x2a56c6 : f === 'greece' ? 0x2f6fd0 : 0xb03a2e;
}

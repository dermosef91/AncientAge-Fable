// Terrain: vertex-colored ground mesh, animated water, instanced trees and
// scatter decoration, fog-of-war overlay, minimap base image.
import * as THREE from 'three';
import { MAP_H, MAP_W } from '../core/config';
import { clamp, lerp, makeNoise2D } from '../core/utils';
import { heightAt, WATER_Y } from '../sim/map';
import { F_WATER } from '../sim/pathfinding';
import type { World } from '../sim/world';
import { MAT } from './parts';
import { assets } from './assets';
import { propGeo, stumpGeo, treeGeo, TREE_VARIANTS } from './models';

const C = {
  deep: new THREE.Color(0x1c7fa0),
  shallow: new THREE.Color(0x6fd8dc),
  wetSand: new THREE.Color(0xc0a066),
  bottomShallow: new THREE.Color(0xc9b483),
  sand: new THREE.Color(0xdaba7e),
  sandLight: new THREE.Color(0xe8d49c),
  grass: new THREE.Color(0x8aa04a),
  grassDeep: new THREE.Color(0x74923e),
  lush: new THREE.Color(0x5d8038),
  dryGrass: new THREE.Color(0xc0ae64),
  dirt: new THREE.Color(0xb8945e),
  rockLow: new THREE.Color(0xb5a072),
  rockHigh: new THREE.Color(0xc9b98e),
  underwater: new THREE.Color(0x59bfb0),
  // faction homelands
  homeEgypt: new THREE.Color(0xe0c793),
  homeGreece: new THREE.Color(0x9fae66),
  homeRome: new THREE.Color(0xb6ab72)
};

/** Elevation of the visible water surface (the plane laps onto the beach). */
const SURF_Y = WATER_Y + 0.16;

/** Prop kinds cheap enough to draw as instanced batches. */
const SCATTER_KINDS = [
  'grass', 'flower', 'rock', 'bush', 'shrub', 'reed',
  'paving', 'paving2', 'rock_pale', 'rock_sand'
];

interface TreeHandle { mesh: THREE.InstancedMesh; index: number; x: number; z: number; baseScale: number }

export class TerrainView {
  group = new THREE.Group();
  minimapCanvas: HTMLCanvasElement;
  private waterMat: THREE.ShaderMaterial;
  private fogMaskCanvas!: HTMLCanvasElement;
  private fogTexCanvas: HTMLCanvasElement;
  private fogTex: THREE.CanvasTexture;
  private fogMesh: THREE.Mesh;
  private treeMeshes: THREE.InstancedMesh[] = [];
  private treeHandles = new Map<number, TreeHandle>();
  private shakes: { h: TreeHandle; t: number }[] = [];
  private stumpMesh: THREE.InstancedMesh;
  private stumpCount = 0;
  private dummy = new THREE.Object3D();

  constructor(private world: World) {
    this.group.add(this.buildGround());
    const { mesh: waterMesh, mat } = this.buildWater();
    this.waterMat = mat;
    this.group.add(waterMesh);
    this.buildTrees();
    this.buildScatter();
    this.buildProps();

    // stumps (appear where trees are chopped)
    this.stumpMesh = new THREE.InstancedMesh(stumpGeo(), MAT.main, 220);
    this.stumpMesh.count = 0;
    this.stumpMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.group.add(this.stumpMesh);

    // fog overlay (low-res mask upscaled with smoothing for soft edges)
    this.fogMaskCanvas = document.createElement('canvas');
    this.fogMaskCanvas.width = MAP_W;
    this.fogMaskCanvas.height = MAP_H;
    this.fogTexCanvas = document.createElement('canvas');
    this.fogTexCanvas.width = MAP_W * 3;
    this.fogTexCanvas.height = MAP_H * 3;
    this.fogTex = new THREE.CanvasTexture(this.fogTexCanvas);
    this.fogTex.magFilter = THREE.LinearFilter;
    this.fogTex.minFilter = THREE.LinearFilter;
    const fogMat = new THREE.MeshBasicMaterial({
      map: this.fogTex, transparent: true, depthWrite: false
    });
    const fogGeo = new THREE.PlaneGeometry(MAP_W, MAP_H);
    this.fogMesh = new THREE.Mesh(fogGeo, fogMat);
    this.fogMesh.rotation.x = -Math.PI / 2;
    this.fogMesh.position.set(MAP_W / 2, 6.5, MAP_H / 2);
    this.fogMesh.renderOrder = 50;
    this.group.add(this.fogMesh);
    this.updateFog();

    this.minimapCanvas = this.buildMinimapBase();
  }

  // ---------------- ground ----------------
  private buildGround(): THREE.Mesh {
    const w = this.world;
    const noise = makeNoise2D(1234);
    const noiseB = makeNoise2D(777);
    const W1 = MAP_W + 1;
    const positions = new Float32Array(W1 * (MAP_H + 1) * 3);
    const colors = new Float32Array(W1 * (MAP_H + 1) * 3);
    const col = new THREE.Color();
    const tmp = new THREE.Color();
    const biomeW = new Float32Array(4);
    // the four cells sharing this vertex — their biome mix colors the ground
    const VERT_CELLS: [number, number][] = [[-1, -1], [0, -1], [-1, 0], [0, 0]];

    /** Ground color of one biome under the shared detail noise. */
    const biomeGround = (out: THREE.Color, biome: number, n: number, n2: number, g: number) => {
      if (biome === 0) {          // desert
        out.copy(C.sand);
        if (n > 0.45) out.lerp(C.sandLight, 0.8);
        if (g > 0.35) out.lerp(C.dryGrass, 0.4);
        if (n2 > 0.42) out.lerp(C.dryGrass, 0.25);
      } else if (biome === 1) {   // grassland
        out.copy(C.sand).lerp(C.grass, clamp(0.45 + g * 2.2, 0, 1));
        if (g > 0.3) out.lerp(C.grassDeep, clamp((g - 0.3) * 3, 0, 0.8));
        if (g < -0.2) out.lerp(C.dryGrass, 0.45);
        if (n2 > 0.42) out.lerp(C.dryGrass, 0.3);
      } else if (biome === 2) {   // lush
        out.copy(C.grass).lerp(C.grassDeep, clamp(0.5 + g, 0, 1));
        out.lerp(C.lush, clamp(g * 1.5 + 0.2, 0, 0.7));
        if (n > 0.5) out.lerp(C.grassDeep, 0.3);
      } else {                    // highland
        out.copy(C.dirt).lerp(C.rockLow, clamp(0.4 + n * 0.5, 0, 1));
        if (g > 0.1) out.lerp(C.dryGrass, 0.35);
        if (n2 > 0.3) out.lerp(C.rockHigh, 0.25);
      }
    };

    for (let z = 0; z <= MAP_H; z++) {
      for (let x = 0; x <= MAP_W; x++) {
        const i = z * W1 + x;
        const h = w.height[i];
        positions[i * 3] = x;
        positions[i * 3 + 1] = h;
        positions[i * 3 + 2] = z;

        // color by height + noise
        const n = noise(x * 0.09, z * 0.09);
        const n2 = noiseB(x * 0.23, z * 0.23);
        if (h < SURF_Y - 0.03) {
          // submerged: sandy bottom shows through the shallows, then teal
          const d = SURF_Y - h;
          col.copy(C.wetSand).lerp(C.bottomShallow, clamp(d * 4, 0, 1));
          col.lerp(C.underwater, clamp((d - 0.12) * 2.6, 0, 1));
          col.lerp(C.deep, clamp((d - 0.5) * 1.6, 0, 1));
        } else if (h < -0.1) {
          // narrow wet strip right above the waterline
          col.copy(C.wetSand).lerp(C.sand, clamp((h - SURF_Y) * 12, 0, 1));
        } else if (h > 0.75) {
          col.copy(C.rockLow).lerp(C.rockHigh, clamp((h - 0.75) / 1.4, 0, 1));
          if (n2 > 0.2) col.lerp(C.dryGrass, 0.2);
        } else {
          // blend the biomes meeting at this vertex
          biomeW.fill(0);
          for (const [ox, oz] of VERT_CELLS) {
            const cx = Math.min(MAP_W - 1, Math.max(0, x + ox));
            const cz = Math.min(MAP_H - 1, Math.max(0, z + oz));
            biomeW[w.biome[cz * MAP_W + cx]] += 0.25;
          }
          const g = noise(x * 0.045 + 40, z * 0.045 + 40);
          col.setRGB(0, 0, 0);
          for (let b = 0; b < 4; b++) {
            if (biomeW[b] <= 0) continue;
            biomeGround(tmp, b, n, n2, g);
            col.r += tmp.r * biomeW[b];
            col.g += tmp.g * biomeW[b];
            col.b += tmp.b * biomeW[b];
          }
        }
        // Homeland ground: each civilization's settlement colors the earth
        for (const home of w.homeland) {
          const d = Math.hypot(x - home.x, z - home.z);
          if (d > 15) continue;
          const t = clamp((15 - d) / 15, 0, 1);
          const ground = home.faction === 'egypt' ? C.homeEgypt
            : home.faction === 'greece' ? C.homeGreece : C.homeRome;
          col.lerp(ground, t * t * 0.72 * (0.75 + n2 * 0.25));
          if (d < 7.5) col.lerp(C.dirt, clamp((7.5 - d) / 7.5, 0, 1) * 0.4 * (0.7 + n2 * 0.3));
        }
        // slight variation
        const v = 0.97 + noiseB(x * 0.7, z * 0.7) * 0.05;
        colors[i * 3] = col.r * v;
        colors[i * 3 + 1] = col.g * v;
        colors[i * 3 + 2] = col.b * v;
      }
    }

    const indices: number[] = [];
    for (let z = 0; z < MAP_H; z++) {
      for (let x = 0; x < MAP_W; x++) {
        const a = z * W1 + x, b = a + 1, c = a + W1, d = c + 1;
        indices.push(a, c, b, b, c, d);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
    mesh.receiveShadow = true;
    return mesh;
  }

  // ---------------- water ----------------
  private buildWater(): { mesh: THREE.Mesh; mat: THREE.ShaderMaterial } {
    const w = this.world;
    const seg = 96;
    const geo = new THREE.PlaneGeometry(MAP_W + 24, MAP_H + 24, seg, seg);
    geo.rotateX(-Math.PI / 2);
    geo.translate(MAP_W / 2 - 6, 0, MAP_H / 2 - 6);

    // Per-pixel shore field sampled from the height grid, so foam hugs the
    // actual coast instead of the coarse water-plane vertices.
    //   R: shallowness by depth (drives the color gradient)
    //   G: distance to the coastline (drives foam, constant width on any slope)
    const W1 = MAP_W + 1, H1 = MAP_H + 1;
    const dist = new Float32Array(W1 * H1);
    for (let i = 0; i < W1 * H1; i++) dist[i] = w.height[i] >= SURF_Y ? 0 : 1e9;
    // two-pass chamfer distance transform across the water
    const D2 = Math.SQRT2;
    for (let z = 0; z < H1; z++) {
      for (let x = 0; x < W1; x++) {
        const i = z * W1 + x;
        if (x > 0) dist[i] = Math.min(dist[i], dist[i - 1] + 1);
        if (z > 0) {
          dist[i] = Math.min(dist[i], dist[i - W1] + 1);
          if (x > 0) dist[i] = Math.min(dist[i], dist[i - W1 - 1] + D2);
          if (x < W1 - 1) dist[i] = Math.min(dist[i], dist[i - W1 + 1] + D2);
        }
      }
    }
    for (let z = H1 - 1; z >= 0; z--) {
      for (let x = W1 - 1; x >= 0; x--) {
        const i = z * W1 + x;
        if (x < W1 - 1) dist[i] = Math.min(dist[i], dist[i + 1] + 1);
        if (z < H1 - 1) {
          dist[i] = Math.min(dist[i], dist[i + W1] + 1);
          if (x < W1 - 1) dist[i] = Math.min(dist[i], dist[i + W1 + 1] + D2);
          if (x > 0) dist[i] = Math.min(dist[i], dist[i + W1 - 1] + D2);
        }
      }
    }
    const texData = new Uint8Array(W1 * H1 * 4);
    for (let i = 0; i < W1 * H1; i++) {
      texData[i * 4] = Math.round(clamp(1 - (SURF_Y - w.height[i]) * 1.6, 0, 1) * 255);
      texData[i * 4 + 1] = Math.round(clamp(dist[i] / 24, 0, 1) * 255);
      texData[i * 4 + 3] = 255;
    }
    const shoreTex = new THREE.DataTexture(texData, W1, H1, THREE.RGBAFormat);
    shoreTex.magFilter = THREE.LinearFilter;
    shoreTex.minFilter = THREE.LinearFilter;
    shoreTex.needsUpdate = true;

    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uShoreTex: { value: shoreTex },
        uDeep: { value: new THREE.Color(0x1f8db2) },
        uMid: { value: new THREE.Color(0x3ab7c6) },
        uShallow: { value: new THREE.Color(0x62d7d8) },
        uFoam: { value: new THREE.Color(0xf4fffd) }
      },
      vertexShader: `
        varying vec3 vPos;
        varying vec2 vShoreUv;
        uniform float uTime;
        void main() {
          vShoreUv = (position.xz + 0.5) / vec2(${W1}.0, ${H1}.0);
          vec3 p = position;
          // barely-there swell: large amplitude would slide the waterline
          // across flat shelves and detach the foam collar from the coast
          p.y += sin(uTime * 1.1 + position.x * 0.4 + position.z * 0.31) * 0.008;
          vPos = p;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: `
        varying vec3 vPos;
        varying vec2 vShoreUv;
        uniform float uTime;
        uniform sampler2D uShoreTex;
        uniform vec3 uDeep;
        uniform vec3 uMid;
        uniform vec3 uShallow;
        uniform vec3 uFoam;

        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float noise(vec2 p) {
          vec2 i = floor(p), f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
                     mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
        }

        void main() {
          vec2 field = texture2D(uShoreTex, vShoreUv).rg;
          float shore = field.r;             // 1 at the waterline, 0 deep
          float coastDist = field.g * 24.0;  // world units to the nearest land
          float n = noise(vPos.xz * 0.9 + uTime * 0.1);
          float n2 = noise(vPos.xz * 2.4 - uTime * 0.15);

          // depth gradient: rich deep -> mid teal -> bright turquoise shallows
          vec3 col = mix(uDeep, uMid, smoothstep(0.0, 0.5, shore));
          col = mix(col, uShallow, smoothstep(0.45, 0.9, shore));

          // large-scale tonal variation so open water is not flat
          col *= 0.96 + 0.08 * noise(vPos.xz * 0.16 + vec2(uTime * 0.03, -uTime * 0.02));

          // broad, soft swell shading (kept low-frequency to avoid moire)
          float ripple = sin(vPos.x * 0.9 - uTime * 1.1) * sin(vPos.z * 0.75 + uTime * 0.9);
          col += ripple * 0.015;
          // glints, gated by noise so they scatter instead of forming a lattice
          float glint = smoothstep(0.985, 1.0, sin(vPos.x * 4.1 + uTime * 0.8) * sin(vPos.z * 3.6 - uTime * 0.9) * sin(vPos.x * 1.3 - vPos.z * 1.1 + uTime * 0.4));
          col += glint * 0.12 * smoothstep(0.5, 0.75, n2) * (1.0 - shore * 0.5);

          // surf: thin crisp foam arcs rolling in, separated from the collar
          // by a clear turquoise gap
          float surfWin = smoothstep(2.2, 3.4, coastDist) * (1.0 - smoothstep(4.5, 11.0, coastDist));
          float band = sin(coastDist * 1.35 + uTime * 1.7 + n * 1.6);
          float crest = smoothstep(0.85, 0.95, band) * surfWin * (0.5 + 0.5 * n2);

          // faint speckled wash inside the shelf
          float wash = smoothstep(0.75, 0.98, n2 * 0.5 + (1.0 - coastDist / 12.0) * 0.5)
                     * (1.0 - smoothstep(1.5, 6.0, coastDist)) * 0.06;

          // thin solid foam collar hugging the waterline
          float nEdge = noise(vPos.xz * 3.0 + uTime * 0.25);
          float edge = 1.0 - smoothstep(0.55, 0.85, coastDist + (nEdge - 0.5) * 0.5);

          float foam = clamp(edge + crest * 0.9 + wash, 0.0, 1.0);
          col = mix(col, uFoam, foam);

          float alpha = mix(0.95, 0.68, smoothstep(0.35, 0.9, shore));
          alpha = max(alpha, foam * 0.96);
          gl_FragColor = vec4(col, alpha);
        }`
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.y = SURF_Y;
    mesh.renderOrder = 2;
    return { mesh, mat };
  }

  // ---------------- trees ----------------
  private buildTrees() {
    const w = this.world;
    const byVariant: { id: number; x: number; z: number; variant: number }[][] =
      Array.from({ length: TREE_VARIANTS }, () => []);
    for (const n of w.nodes.values()) {
      if (n.kind !== 'tree') continue;
      byVariant[n.variant % TREE_VARIANTS].push({ id: n.id, x: n.x, z: n.z, variant: n.variant });
    }
    for (let v = 0; v < TREE_VARIANTS; v++) {
      const list = byVariant[v];
      // Variants 0/1 are palms — use the sculpted model when it is available.
      const usePalm = v < 2 && assets.palm !== null;
      const geo = usePalm ? assets.palm!.geometry : treeGeo(v);
      const mat = usePalm ? assets.palm!.material : MAT.main;
      const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, list.length));
      mesh.count = list.length;
      mesh.castShadow = true;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      list.forEach((t, i) => {
        const s = (usePalm ? 0.72 : 0.85) + ((t.id * 37) % 30) / 100;
        this.dummy.position.set(t.x, heightAt(w, t.x, t.z), t.z);
        this.dummy.rotation.set(0, (t.id * 1.7) % (Math.PI * 2), 0);
        this.dummy.scale.setScalar(s);
        this.dummy.updateMatrix();
        mesh.setMatrixAt(i, this.dummy.matrix);
        this.treeHandles.set(t.id, { mesh, index: i, x: t.x, z: t.z, baseScale: s });
      });
      mesh.instanceMatrix.needsUpdate = true;
      this.treeMeshes.push(mesh);
      this.group.add(mesh);
    }
  }

  treeShake(nodeId: number) {
    const h = this.treeHandles.get(nodeId);
    if (!h) return;
    if (!this.shakes.some(s => s.h === h)) this.shakes.push({ h, t: 0 });
  }

  treeRemove(nodeId: number) {
    const h = this.treeHandles.get(nodeId);
    if (!h) return;
    this.treeHandles.delete(nodeId);
    this.dummy.position.set(0, -10, 0);
    this.dummy.scale.setScalar(0.0001);
    this.dummy.rotation.set(0, 0, 0);
    this.dummy.updateMatrix();
    h.mesh.setMatrixAt(h.index, this.dummy.matrix);
    h.mesh.instanceMatrix.needsUpdate = true;
    // stump
    if (this.stumpCount < 219) {
      this.dummy.position.set(h.x, heightAt(this.world, h.x, h.z), h.z);
      this.dummy.scale.setScalar(1);
      this.dummy.updateMatrix();
      this.stumpMesh.setMatrixAt(this.stumpCount++, this.dummy.matrix);
      this.stumpMesh.count = this.stumpCount;
      this.stumpMesh.instanceMatrix.needsUpdate = true;
    }
  }

  // ---------------- scatter deco ----------------
  private buildScatter() {
    const w = this.world;
    // Group by kind (and faction, for paving) so each set is a single draw call.
    const groups = new Map<string, typeof w.deco>();
    for (const d of w.deco) {
      if (!SCATTER_KINDS.includes(d.kind)) continue;
      const key = d.kind.startsWith('paving') ? `${d.kind}:${d.faction ?? 'greece'}` : d.kind;
      let arr = groups.get(key);
      if (!arr) { arr = []; groups.set(key, arr); }
      arr.push(d);
    }
    for (const [key, items] of groups) {
      const kind = key.split(':')[0];
      const paved = kind.startsWith('paving');
      const faction = items[0].faction;
      const mesh = new THREE.InstancedMesh(propGeo(kind, faction), MAT.main, items.length);
      mesh.receiveShadow = paved;
      items.forEach((d, i) => {
        const sink = paved ? -0.035 : -0.015;
        this.dummy.position.set(d.x, heightAt(w, d.x, d.z) + sink, d.z);
        this.dummy.rotation.set(0, d.rot, 0);
        this.dummy.scale.setScalar(d.scale);
        this.dummy.updateMatrix();
        mesh.setMatrixAt(i, this.dummy.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
      this.group.add(mesh);
    }
  }

  private buildProps() {
    const w = this.world;
    for (const d of w.deco) {
      if (SCATTER_KINDS.includes(d.kind)) continue;
      const mesh = new THREE.Mesh(propGeo(d.kind, d.faction), MAT.main);
      const y = d.kind === 'decoboat' ? WATER_Y + 0.18 : heightAt(w, d.x, d.z);
      mesh.position.set(d.x, y, d.z);
      mesh.rotation.y = d.rot;
      mesh.scale.setScalar(d.scale);
      mesh.castShadow = d.kind !== 'ruins';
      if (d.kind === 'decoboat') mesh.userData.bob = true;
      this.group.add(mesh);
    }
  }

  // ---------------- fog ----------------
  updateFog() {
    const mctx = this.fogMaskCanvas.getContext('2d')!;
    const img = mctx.createImageData(MAP_W, MAP_H);
    const data = img.data;
    const exp = this.world.explored;
    for (let i = 0; i < MAP_W * MAP_H; i++) {
      // navy-tinted fog; material color is white so the canvas defines the tone
      data[i * 4] = 13; data[i * 4 + 1] = 20; data[i * 4 + 2] = 34;
      data[i * 4 + 3] = exp[i] ? 0 : 255;
    }
    mctx.putImageData(img, 0, 0);
    // two blurred passes: a wide feather plus a denser core gives the edge a
    // smooth s-curve falloff instead of a blobby hard rim
    const ctx = this.fogTexCanvas.getContext('2d')!;
    const W = this.fogTexCanvas.width, H = this.fogTexCanvas.height;
    ctx.clearRect(0, 0, W, H);
    ctx.imageSmoothingEnabled = true;
    ctx.globalAlpha = 0.85;
    ctx.filter = 'blur(10px)';
    ctx.drawImage(this.fogMaskCanvas, 0, 0, W, H);
    ctx.globalAlpha = 0.55;
    ctx.filter = 'blur(4px)';
    ctx.drawImage(this.fogMaskCanvas, 0, 0, W, H);
    ctx.filter = 'none';
    ctx.globalAlpha = 1;
    this.fogTex.needsUpdate = true;
  }

  // ---------------- per-frame ----------------
  update(dt: number, time: number) {
    this.waterMat.uniforms.uTime.value = time;
    // tree shakes
    for (let i = this.shakes.length - 1; i >= 0; i--) {
      const s = this.shakes[i];
      s.t += dt;
      const h = s.h;
      if (!this.treeHandles.has(findKey(this.treeHandles, h)) && s.t > 0.01) {
        // tree might have been removed — drop the shake
      }
      const k = s.t < 0.3 ? 1 + Math.sin(s.t * 40) * 0.06 * (1 - s.t / 0.3) : 1;
      this.dummy.position.set(h.x, heightAt(this.world, h.x, h.z), h.z);
      this.dummy.rotation.set(Math.sin(s.t * 42) * 0.04 * (s.t < 0.3 ? 1 : 0), 0, 0);
      this.dummy.scale.setScalar(h.baseScale * k);
      this.dummy.updateMatrix();
      h.mesh.setMatrixAt(h.index, this.dummy.matrix);
      h.mesh.instanceMatrix.needsUpdate = true;
      if (s.t > 0.35) this.shakes.splice(i, 1);
    }
    // deco boats bob
    for (const child of this.group.children) {
      if ((child as THREE.Mesh).userData?.bob) {
        child.position.y = WATER_Y + 0.18 + Math.sin(time * 0.8 + child.position.x) * 0.05;
        child.rotation.z = Math.sin(time * 0.6 + child.position.z) * 0.03;
        child.rotation.y += dt * 0.01;
      }
    }
  }

  // ---------------- minimap ----------------
  private buildMinimapBase(): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = MAP_W;
    canvas.height = MAP_H;
    const ctx = canvas.getContext('2d')!;
    const img = ctx.createImageData(MAP_W, MAP_H);
    const col = new THREE.Color();
    const w = this.world;
    for (let z = 0; z < MAP_H; z++) {
      for (let x = 0; x < MAP_W; x++) {
        const i = z * MAP_W + x;
        const h = heightAt(w, x + 0.5, z + 0.5);
        if (w.grid[i] & F_WATER) {
          col.copy(C.deep).lerp(C.shallow, clamp(1 + (h - WATER_Y) * 1.8, 0, 1));
        } else if (h > 0.75) {
          col.copy(C.rockLow);
        } else {
          const b = w.biome[i];
          if (b === 3) col.copy(C.rockLow).lerp(C.dryGrass, 0.3);
          else if (b === 2) col.copy(C.grassDeep);
          else if (b === 1) {
            col.copy(C.grass);
            if (((x * 7 + z * 13) % 5) === 0) col.lerp(C.dryGrass, 0.3);
          } else {
            col.copy(C.sand);
            if (((x * 7 + z * 13) % 5) === 0) col.lerp(C.sandLight, 0.6);
          }
        }
        img.data[i * 4] = col.r * 255;
        img.data[i * 4 + 1] = col.g * 255;
        img.data[i * 4 + 2] = col.b * 255;
        img.data[i * 4 + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return canvas;
  }

  dispose() {
    this.group.traverse(o => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
    });
    this.fogTex.dispose();
  }
}

function findKey(map: Map<number, TreeHandle>, h: TreeHandle): number {
  for (const [k, v] of map) if (v === h) return k;
  return -1;
}

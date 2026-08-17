// Pooled visual effects: CPU particles, building fires, waving flags,
// projectile meshes, command markers.
import * as THREE from 'three';
import type { NodeKind } from '../core/types';
import { clamp, makeRng } from '../core/utils';
import { Parts } from './parts';

// ---------------------------------------------------------------- particles
const MAX_P = 700;

export class Particles {
  points: THREE.Points;
  private pos: Float32Array;
  private col: Float32Array;
  private size: Float32Array;
  private vel = new Float32Array(MAX_P * 3);
  private life = new Float32Array(MAX_P);
  private maxLife = new Float32Array(MAX_P);
  private grav = new Float32Array(MAX_P);
  private baseSize = new Float32Array(MAX_P);
  private head = 0;
  private geo: THREE.BufferGeometry;

  constructor() {
    this.geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(MAX_P * 3);
    this.col = new Float32Array(MAX_P * 3);
    this.size = new Float32Array(MAX_P);
    for (let i = 0; i < MAX_P; i++) this.pos[i * 3 + 1] = -50;
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.geo.setAttribute('psize', new THREE.BufferAttribute(this.size, 1));
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      vertexShader: `
        attribute float psize;
        varying vec3 vColor;
        void main() {
          vColor = color;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = psize * (140.0 / -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        varying vec3 vColor;
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          float d = length(c);
          if (d > 0.5) discard;
          float a = smoothstep(0.5, 0.18, d);
          gl_FragColor = vec4(vColor, a * 0.9);
        }`,
      vertexColors: true
    });
    this.points = new THREE.Points(this.geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 20;
  }

  spawn(x: number, y: number, z: number, vx: number, vy: number, vz: number,
        life: number, size: number, color: number, grav = 0) {
    const i = this.head;
    this.head = (this.head + 1) % MAX_P;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.life[i] = life; this.maxLife[i] = life;
    this.baseSize[i] = size;
    this.grav[i] = grav;
    const c = new THREE.Color(color);
    this.col[i * 3] = c.r; this.col[i * 3 + 1] = c.g; this.col[i * 3 + 2] = c.b;
  }

  burst(x: number, y: number, z: number, n: number, color: number, opts: {
    speed?: number; up?: number; life?: number; size?: number; grav?: number; spread?: number
  } = {}) {
    const sp = opts.speed ?? 1.2, up = opts.up ?? 1.4, life = opts.life ?? 0.6;
    const size = opts.size ?? 0.16, grav = opts.grav ?? 3.4, spread = opts.spread ?? 0.12;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * sp;
      this.spawn(
        x + (Math.random() - 0.5) * spread * 2, y + Math.random() * spread, z + (Math.random() - 0.5) * spread * 2,
        Math.cos(a) * r, up * (0.4 + Math.random() * 0.8), Math.sin(a) * r,
        life * (0.6 + Math.random() * 0.7), size * (0.7 + Math.random() * 0.6), color, grav
      );
    }
  }

  update(dt: number) {
    for (let i = 0; i < MAX_P; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        this.pos[i * 3 + 1] = -50;
        this.size[i] = 0;
        continue;
      }
      this.vel[i * 3 + 1] -= this.grav[i] * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      if (this.pos[i * 3 + 1] < 0.02 && this.grav[i] > 0) {
        this.pos[i * 3 + 1] = 0.02;
        this.vel[i * 3 + 1] *= -0.25;
        this.vel[i * 3] *= 0.7;
        this.vel[i * 3 + 2] *= 0.7;
      }
      const t = this.life[i] / this.maxLife[i];
      this.size[i] = this.baseSize[i] * (0.5 + t * 0.5);
    }
    (this.geo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.getAttribute('psize') as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
  }

  // themed helpers
  gatherChips(x: number, y: number, z: number, kind: NodeKind | 'build') {
    const color = kind === 'tree' ? 0xa8845c : kind === 'stone' ? 0xb9b2a4 :
      kind === 'gold' ? 0xf0c05a : kind === 'build' ? 0xd9c193 : 0xc8402e;
    this.burst(x, y, z, 4, color, { speed: 0.9, up: 1.6, life: 0.55, size: 0.12 });
  }
  dust(x: number, y: number, z: number, n = 5) {
    this.burst(x, y, z, n, 0xd9c8a0, { speed: 0.7, up: 0.5, life: 0.8, size: 0.24, grav: 0.4 });
  }
  hit(x: number, y: number, z: number) {
    this.burst(x, y, z, 6, 0xfff0c0, { speed: 1.6, up: 1.6, life: 0.35, size: 0.1, grav: 4 });
    this.burst(x, y, z, 3, 0xd04a3a, { speed: 1.2, up: 1.2, life: 0.4, size: 0.12, grav: 4 });
  }
  death(x: number, z: number) {
    this.burst(x, 0.4, z, 10, 0xcfc0a0, { speed: 1.1, up: 1.2, life: 0.7, size: 0.2, grav: 2 });
  }
  boom(x: number, z: number, size: number) {
    this.burst(x, 0.5, z, 26, 0xcabb96, { speed: 2.2 * size * 0.5, up: 2.6, life: 1.1, size: 0.34, grav: 3 });
    this.burst(x, 0.3, z, 14, 0x8a6844, { speed: 1.8 * size * 0.5, up: 2.2, life: 0.9, size: 0.24, grav: 3.6 });
    this.burst(x, 0.8, z, 10, 0xffb347, { speed: 1.4, up: 1.8, life: 0.4, size: 0.22, grav: 1 });
  }
  trail(x: number, y: number, z: number) {
    this.spawn(x, y, z, 0, 0.1, 0, 0.28, 0.08, 0xfff4d8, 0);
  }
  splash(x: number, z: number) {
    this.burst(x, 0.05, z, 6, 0xbfe8ea, { speed: 0.9, up: 1.3, life: 0.5, size: 0.14, grav: 3.4 });
  }
  /** A single spark riding a fire's updraft (negative gravity = it climbs). */
  ember(x: number, y: number, z: number) {
    this.spawn(
      x + (Math.random() - 0.5) * 0.3, y, z + (Math.random() - 0.5) * 0.3,
      (Math.random() - 0.5) * 0.5, 1.1 + Math.random() * 1.4, (Math.random() - 0.5) * 0.5,
      0.7 + Math.random() * 0.7, 0.09 + Math.random() * 0.06,
      Math.random() < 0.4 ? 0xffe0a0 : 0xff9838, -0.35
    );
  }
}

// ---------------------------------------------------------------- fire
// Flames and smoke are camera-facing point sprites sized in world units, so a
// lick of fire keeps its physical size as the player zooms.
const SPRITE_VERT = `
  attribute float psize;
  attribute float palpha;
  attribute float pseed;
  uniform float uScale;
  varying vec3 vColor;
  varying float vAlpha;
  varying float vSeed;
  void main() {
    vColor = color;
    vAlpha = palpha;
    vSeed = pseed;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = uScale * psize / max(0.5, -mv.z);
    gl_Position = projectionMatrix * mv;
  }`;

// Teardrop silhouette drawn in point space: wide just above the base, pinched
// at the tip, swaying as it rises. White-hot at the heart, red at the crown.
const FLAME_FRAG = `
  uniform float uTime;
  varying vec3 vColor;
  varying float vAlpha;
  varying float vSeed;
  void main() {
    vec2 p = gl_PointCoord;
    float y = 1.0 - p.y;                 // 0 at the base, 1 at the tip
    float sway = sin(uTime * 8.0 + vSeed * 12.0 + y * 5.0) * 0.08 * y * y;
    float x = p.x - 0.5 + sway;
    float w = 0.30 * pow(max(0.0, 1.0 - y), 0.6) * (0.36 + 0.64 * smoothstep(0.0, 0.22, y));
    float d = abs(x) / max(w, 0.001);
    float body = (1.0 - smoothstep(0.4, 1.0, d)) * smoothstep(1.0, 0.72, y);
    if (body < 0.01) discard;
    float hot = (1.0 - smoothstep(0.0, 0.5, y)) * (1.0 - smoothstep(0.0, 0.7, d));
    vec3 col = mix(vColor, vec3(0.95, 0.24, 0.06), smoothstep(0.28, 0.95, y));
    col = mix(col, vec3(1.0, 0.95, 0.72), hot * hot);
    gl_FragColor = vec4(col, body * vAlpha);
  }`;

const SMOKE_FRAG = `
  varying vec3 vColor;
  varying float vAlpha;
  varying float vSeed;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    if (d > 0.5) discard;
    // a lumpy rim keeps puffs from reading as perfect circles
    float ang = atan(c.y, c.x);
    float rim = 0.42 + 0.06 * sin(ang * 3.0 + vSeed * 6.28) + 0.04 * sin(ang * 5.0 - vSeed * 9.4);
    float a = smoothstep(rim, rim * 0.25, d);
    gl_FragColor = vec4(vColor, a * vAlpha);
  }`;

/** A pool of camera-facing sprites sharing one draw call. */
class SpriteField {
  points: THREE.Points;
  pos: Float32Array;
  col: Float32Array;
  size: Float32Array;
  alpha: Float32Array;
  seed: Float32Array;
  private geo = new THREE.BufferGeometry();
  private mat: THREE.ShaderMaterial;

  constructor(public max: number, frag: string, renderOrder: number) {
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.alpha = new Float32Array(max);
    this.seed = new Float32Array(max);
    for (let i = 0; i < max; i++) this.pos[i * 3 + 1] = -50;
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.geo.setAttribute('psize', new THREE.BufferAttribute(this.size, 1));
    this.geo.setAttribute('palpha', new THREE.BufferAttribute(this.alpha, 1));
    this.geo.setAttribute('pseed', new THREE.BufferAttribute(this.seed, 1));
    this.mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      vertexColors: true,
      uniforms: { uScale: { value: 900 }, uTime: { value: 0 } },
      vertexShader: SPRITE_VERT,
      fragmentShader: frag
    });
    this.points = new THREE.Points(this.geo, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = renderOrder;
  }

  set(i: number, x: number, y: number, z: number, size: number, alpha: number, seed: number,
      r: number, g: number, b: number) {
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.size[i] = size; this.alpha[i] = alpha; this.seed[i] = seed;
    this.col[i * 3] = r; this.col[i * 3 + 1] = g; this.col[i * 3 + 2] = b;
  }

  hide(i: number) {
    this.pos[i * 3 + 1] = -50;
    this.size[i] = 0;
    this.alpha[i] = 0;
  }

  flush(time: number, pixelsPerWorldUnit: number) {
    this.mat.uniforms.uTime.value = time;
    this.mat.uniforms.uScale.value = pixelsPerWorldUnit;
    for (const name of ['position', 'color', 'psize', 'palpha', 'pseed']) {
      (this.geo.getAttribute(name) as THREE.BufferAttribute).needsUpdate = true;
    }
  }
}

interface Lick {
  ox: number; oy: number; oz: number;
  h: number;      // full height at full intensity
  thr: number;    // intensity at which this lick catches
  phase: number;
}

interface FireEmitter {
  x: number; y: number; z: number;  // ground centre of the building
  top: number;                      // roof height, where smoke is born
  radius: number;
  intensity: number;
  licks: Lick[];
  smokeT: number;
  emberT: number;
  touched: boolean;
}

const MAX_FLAMES = 260;
const MAX_SMOKE = 260;
const SMOKE_YOUNG = new THREE.Color(0x574c42);
const SMOKE_OLD = new THREE.Color(0xa9a094);
const FLAME_BASE = new THREE.Color(0xff9a2b);

/**
 * Fires burning on buildings. The view feeds an intensity per building every
 * frame; the fire swells while blows land and gutters out once they stop.
 */
export class Fires {
  group = new THREE.Group();
  private flames = new SpriteField(MAX_FLAMES, FLAME_FRAG, 21);
  private smoke = new SpriteField(MAX_SMOKE, SMOKE_FRAG, 22);
  private emitters = new Map<number, FireEmitter>();
  private lights: THREE.PointLight[] = [];
  private scale = 900;

  // smoke particle state
  private sVel = new Float32Array(MAX_SMOKE * 3);
  private sLife = new Float32Array(MAX_SMOKE);
  private sMax = new Float32Array(MAX_SMOKE);
  private sSize = new Float32Array(MAX_SMOKE);
  private sGrow = new Float32Array(MAX_SMOKE);
  private sSeed = new Float32Array(MAX_SMOKE);
  private sHead = 0;
  private tmpCol = new THREE.Color();

  constructor(private particles: Particles) {
    this.group.add(this.flames.points, this.smoke.points);
    // two pooled lights follow the fiercest fires; they stay in the scene at
    // zero intensity so the light count — and the shaders — never change
    for (let i = 0; i < 2; i++) {
      const l = new THREE.PointLight(0xff7b2e, 0, 12, 2);
      this.group.add(l);
      this.lights.push(l);
    }
  }

  /** Pixels per world unit at one unit from the camera. */
  setViewport(drawingBufferHeight: number, fovDeg: number) {
    this.scale = drawingBufferHeight / (2 * Math.tan((fovDeg * Math.PI) / 360));
  }

  /** Called each frame for every burning building; untouched fires go out. */
  set(id: number, x: number, y: number, z: number, radius: number, top: number, intensity: number) {
    let e = this.emitters.get(id);
    if (!e) {
      e = {
        x, y, z, top, radius, intensity: 0,
        licks: makeLicks(id, radius, top),
        smokeT: 0, emberT: Math.random(), touched: true
      };
      this.emitters.set(id, e);
    }
    e.x = x; e.y = y; e.z = z; e.top = top; e.radius = radius;
    e.intensity = intensity;
    e.touched = true;
  }

  clearFor(id: number) { this.emitters.delete(id); }

  update(dt: number, time: number) {
    let fi = 0;
    let bestA = 0, bestB = 0;
    let lightA: FireEmitter | null = null, lightB: FireEmitter | null = null;
    // a whole town ablaze would churn the smoke pool and make puffs blink out,
    // so each column thins as the number of fires grows
    const load = clamp(3.5 / Math.max(1, this.emitters.size), 0.3, 1);

    for (const [id, e] of this.emitters) {
      if (!e.touched) { this.emitters.delete(id); continue; }
      e.touched = false;
      const inten = clamp(e.intensity, 0, 1);

      for (const l of e.licks) {
        if (fi >= MAX_FLAMES) break;
        const k = clamp((inten - l.thr) / 0.28, 0, 1);
        if (k < 0.03) continue;
        // two detuned waves so neighbouring licks never pulse in step
        const flick = 0.72 + 0.2 * Math.sin(time * 6.3 + l.phase * 7) + 0.18 * Math.sin(time * 11.7 + l.phase * 3);
        const h = l.h * (0.45 + 0.55 * k) * flick;
        this.flames.set(
          fi++, e.x + l.ox, e.y + l.oy + h * 0.5, e.z + l.oz,
          h, clamp(k * 1.1, 0, 1) * 0.95, l.phase,
          FLAME_BASE.r, FLAME_BASE.g, FLAME_BASE.b
        );
      }

      // smoke column and embers scale with how hard the place is burning
      e.smokeT += dt * (2.5 + inten * 8) * (0.55 + e.radius * 0.5) * load;
      while (e.smokeT >= 1) {
        e.smokeT -= 1;
        this.spawnSmoke(e, inten);
      }
      e.emberT += dt * (3 + inten * 12) * load;
      while (e.emberT >= 1) {
        e.emberT -= 1;
        const a = Math.random() * Math.PI * 2, r = Math.random() * e.radius * 0.8;
        this.particles.ember(e.x + Math.cos(a) * r, e.y + e.top * (0.4 + Math.random() * 0.6), e.z + Math.sin(a) * r);
      }

      const weight = inten * (0.6 + e.radius * 0.4);
      if (weight > bestA) { bestB = bestA; lightB = lightA; bestA = weight; lightA = e; }
      else if (weight > bestB) { bestB = weight; lightB = e; }
    }
    for (let i = fi; i < MAX_FLAMES; i++) this.flames.hide(i);

    for (let i = 0; i < 2; i++) {
      const e = i === 0 ? lightA : lightB;
      const l = this.lights[i];
      if (!e) { l.intensity = 0; continue; }
      // kept clear of the roof: inverse-square falloff would scorch anything
      // sitting right on top of the light
      l.position.set(e.x, e.y + e.top + 0.6, e.z);
      const flick = 0.75 + 0.25 * Math.sin(time * 13.1 + e.x) * Math.sin(time * 7.7 + e.z);
      l.intensity = 1.3 * clamp(e.intensity, 0, 1) * flick;
      l.distance = 8 + e.radius * 2;
    }

    this.updateSmoke(dt, time);
    this.flames.flush(time, this.scale);
    this.smoke.flush(time, this.scale);
  }

  private spawnSmoke(e: FireEmitter, inten: number) {
    const i = this.sHead;
    this.sHead = (this.sHead + 1) % MAX_SMOKE;
    const a = Math.random() * Math.PI * 2;
    const r = Math.random() * e.radius;
    const life = 2.2 + Math.random() * 1.8;
    this.sVel[i * 3] = (Math.random() - 0.5) * 0.55 + 0.24;
    this.sVel[i * 3 + 1] = 1.1 + Math.random() * 1.1 + inten * 0.7;
    this.sVel[i * 3 + 2] = (Math.random() - 0.5) * 0.55 + 0.16;
    this.sLife[i] = life;
    this.sMax[i] = life;
    this.sSize[i] = 0.3 + Math.random() * 0.3 + e.radius * 0.1;
    this.sGrow[i] = 0.9 + Math.random() * 0.9 + e.radius * 0.25;
    this.sSeed[i] = Math.random();
    this.smoke.set(
      i, e.x + Math.cos(a) * r, e.y + e.top * (0.35 + Math.random() * 0.4), e.z + Math.sin(a) * r,
      this.sSize[i], 0, this.sSeed[i], SMOKE_YOUNG.r, SMOKE_YOUNG.g, SMOKE_YOUNG.b
    );
  }

  private updateSmoke(dt: number, time: number) {
    const p = this.smoke.pos;
    for (let i = 0; i < MAX_SMOKE; i++) {
      if (this.sLife[i] <= 0) continue;
      this.sLife[i] -= dt;
      if (this.sLife[i] <= 0) { this.smoke.hide(i); continue; }
      const age = 1 - this.sLife[i] / this.sMax[i];
      // rise, drift downwind, and curl as the column loses its punch
      this.sVel[i * 3 + 1] *= 1 - 0.35 * dt;
      const curl = Math.sin(time * 0.9 + this.sSeed[i] * 20) * 0.4;
      p[i * 3] += (this.sVel[i * 3] + curl) * dt;
      p[i * 3 + 1] += this.sVel[i * 3 + 1] * dt;
      p[i * 3 + 2] += (this.sVel[i * 3 + 2] + curl * 0.6) * dt;
      this.smoke.size[i] = this.sSize[i] + this.sGrow[i] * age;
      this.smoke.alpha[i] = Math.min(1, age * 6) * (1 - age) * (1 - age) * 0.72;
      this.tmpCol.copy(SMOKE_YOUNG).lerp(SMOKE_OLD, Math.min(1, age * 1.6));
      this.smoke.col[i * 3] = this.tmpCol.r;
      this.smoke.col[i * 3 + 1] = this.tmpCol.g;
      this.smoke.col[i * 3 + 2] = this.tmpCol.b;
    }
  }

  clear() {
    this.emitters.clear();
    for (let i = 0; i < MAX_FLAMES; i++) this.flames.hide(i);
    for (let i = 0; i < MAX_SMOKE; i++) { this.smoke.hide(i); this.sLife[i] = 0; }
    for (const l of this.lights) l.intensity = 0;
  }
}

/**
 * Scatter flame licks over a footprint in three bands: up the outer walls, out
 * across the roof, and licking at the foundations. Wall and ground licks sit
 * just proud of the walls so the building never swallows them, and the roof
 * band stays below the visual height — that number is the tallest spire on the
 * model, not the roof deck.
 */
function makeLicks(id: number, radius: number, top: number): Lick[] {
  const rng = makeRng(id * 2654435761 + 17);
  const n = clamp(Math.round(5 + radius * 3.6), 6, 16);
  const licks: Lick[] = [];
  for (let i = 0; i < n; i++) {
    const a = rng() * Math.PI * 2;
    const band = i % 4;
    const roof = band === 1;
    const ground = band === 3;
    const r = radius * (roof ? 0.25 + rng() * 0.55 : 0.98 + rng() * 0.22);
    licks.push({
      ox: Math.cos(a) * r,
      oy: roof ? top * (0.55 + rng() * 0.2) : ground ? 0.02 + rng() * 0.12 : top * (0.24 + rng() * 0.32),
      oz: Math.sin(a) * r,
      h: 0.55 + rng() * 0.55 + radius * 0.25,
      thr: (i / n) * 0.5,
      phase: rng()
    });
  }
  return licks;
}

// ---------------------------------------------------------------- flags
interface Flag {
  mesh: THREE.Mesh;
  geo: THREE.PlaneGeometry;
  base: Float32Array;
  phase: number;
  ownerId: number;
}

export class Flags {
  group = new THREE.Group();
  private flags: Flag[] = [];
  private mats = new Map<number, THREE.MeshLambertMaterial>();

  private mat(color: number): THREE.MeshLambertMaterial {
    let m = this.mats.get(color);
    if (!m) {
      m = new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide });
      this.mats.set(color, m);
    }
    return m;
  }

  add(ownerId: number, x: number, y: number, z: number, color: number, scale = 1): void {
    // pole
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.022 * scale, 0.03 * scale, 1.5 * scale, 5),
      this.mat(0x6b4f33)
    );
    pole.position.set(x, y + 0.75 * scale, z);
    this.group.add(pole);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.045 * scale, 6, 5), this.mat(0xd9a33c));
    knob.position.set(x, y + 1.52 * scale, z);
    this.group.add(knob);
    // cloth
    const geo = new THREE.PlaneGeometry(0.55 * scale, 0.3 * scale, 6, 2);
    geo.translate(0.28 * scale, 0, 0);
    const mesh = new THREE.Mesh(geo, this.mat(color));
    mesh.position.set(x, y + 1.3 * scale, z);
    mesh.castShadow = false;
    this.group.add(mesh);
    const base = new Float32Array(geo.getAttribute('position').array);
    this.flags.push({ mesh, geo, base, phase: Math.random() * 10, ownerId });
    pole.userData.flagOwner = ownerId;
    knob.userData.flagOwner = ownerId;
    mesh.userData.flagOwner = ownerId;
  }

  removeFor(ownerId: number) {
    this.flags = this.flags.filter(f => f.ownerId !== ownerId);
    const toRemove = this.group.children.filter(c => c.userData.flagOwner === ownerId);
    for (const c of toRemove) {
      this.group.remove(c);
      (c as THREE.Mesh).geometry?.dispose();
    }
  }

  update(time: number) {
    for (const f of this.flags) {
      const pos = f.geo.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        const bx = f.base[i * 3];
        const wave = Math.sin(time * 5 + f.phase + bx * 6) * 0.05 * (bx * 2.2 + 0.1);
        pos.setZ(i, wave);
        pos.setY(i, f.base[i * 3 + 1] + Math.sin(time * 3.2 + f.phase + bx * 4) * 0.02 * (bx * 2));
      }
      pos.needsUpdate = true;
      f.geo.computeVertexNormals();
    }
  }

  clear() {
    for (const c of [...this.group.children]) {
      this.group.remove(c);
      (c as THREE.Mesh).geometry?.dispose();
    }
    this.flags = [];
  }
}

// ---------------------------------------------------------------- projectiles
export function arrowGeo(): THREE.BufferGeometry {
  const p = new Parts();
  p.cyl(0x8a6844, 0.016, 0.016, 0.5, 0, 0, 0, { seg: 4, rx: Math.PI / 2 });
  p.cone(0xd8d4c8, 0.03, 0.09, 0, 0, 0.28, { seg: 4, rx: Math.PI / 2 });
  p.box(0xe8e0cd, 0.05, 0.012, 0.09, 0, 0, -0.22);
  p.box(0xe8e0cd, 0.012, 0.05, 0.09, 0, 0, -0.22);
  return p.build();
}

// ---------------------------------------------------------------- markers
export class Markers {
  group = new THREE.Group();
  private items: { mesh: THREE.Mesh; t: number; max: number; kind: string }[] = [];
  private ringGeo = new THREE.RingGeometry(0.3, 0.42, 24);
  private moveMat = new THREE.MeshBasicMaterial({ color: 0x4ade80, transparent: true, depthWrite: false, side: THREE.DoubleSide });
  private atkMat = new THREE.MeshBasicMaterial({ color: 0xef4444, transparent: true, depthWrite: false, side: THREE.DoubleSide });

  ping(x: number, y: number, z: number, kind: 'move' | 'attack') {
    const mesh = new THREE.Mesh(this.ringGeo, (kind === 'move' ? this.moveMat : this.atkMat).clone());
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, y + 0.06, z);
    mesh.renderOrder = 15;
    this.group.add(mesh);
    this.items.push({ mesh, t: 0, max: 0.7, kind });
  }

  update(dt: number) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.t += dt;
      const k = it.t / it.max;
      if (k >= 1) {
        this.group.remove(it.mesh);
        (it.mesh.material as THREE.Material).dispose();
        this.items.splice(i, 1);
        continue;
      }
      const s = 0.6 + k * 1.1;
      it.mesh.scale.setScalar(s);
      (it.mesh.material as THREE.MeshBasicMaterial).opacity = (1 - k) * 0.9;
    }
  }

  clear() {
    for (const it of this.items) {
      this.group.remove(it.mesh);
      (it.mesh.material as THREE.Material).dispose();
    }
    this.items = [];
  }
}

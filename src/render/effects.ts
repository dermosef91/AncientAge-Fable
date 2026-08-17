// Pooled visual effects: CPU particles, waving flags, projectile meshes,
// command markers.
import * as THREE from 'three';
import type { NodeKind } from '../core/types';
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

/** A catapult's shot: a rough, faceted stone. Orientation is irrelevant. */
export function boulderGeo(): THREE.BufferGeometry {
  const p = new Parts();
  p.ico(0x8f8a80, 0.24, 0, 0, 0);
  p.ico(0x7d786f, 0.19, 0.06, 0.05, -0.04, { shade: 0.94 });
  p.ico(0x9a948a, 0.13, -0.07, -0.05, 0.06, { shade: 1.06 });
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

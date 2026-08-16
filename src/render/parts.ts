// Parts: accumulates colored primitive geometry and merges it into a single
// vertex-colored, flat-shaded BufferGeometry (one draw call per model).
import * as THREE from 'three';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();

export interface PartOpts {
  rx?: number; ry?: number; rz?: number;
  sx?: number; sy?: number; sz?: number;
  shade?: number; // brightness multiplier
}

// Primitive geometry cache (unit-sized, scaled per part)
const primCache = new Map<string, THREE.BufferGeometry>();
function prim(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
  let g = primCache.get(key);
  if (!g) {
    g = make();
    if (g.index) g = g.toNonIndexed();
    g.deleteAttribute('uv');
    primCache.set(key, g);
  }
  return g;
}

export class Parts {
  private positions: number[] = [];
  private colors: number[] = [];

  add(geo: THREE.BufferGeometry, color: number, x = 0, y = 0, z = 0, o: PartOpts = {}) {
    _e.set(o.rx ?? 0, o.ry ?? 0, o.rz ?? 0);
    _q.setFromEuler(_e);
    _p.set(x, y, z);
    _s.set(o.sx ?? 1, o.sy ?? 1, o.sz ?? 1);
    _m.compose(_p, _q, _s);
    const pos = geo.getAttribute('position');
    _c.setHex(color);
    const shade = o.shade ?? 1;
    const r = Math.min(1, _c.r * shade), g = Math.min(1, _c.g * shade), b = Math.min(1, _c.b * shade);
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos as THREE.BufferAttribute, i).applyMatrix4(_m);
      this.positions.push(v.x, v.y, v.z);
      this.colors.push(r, g, b);
    }
  }

  box(color: number, w: number, h: number, d: number, x = 0, y = 0, z = 0, o: PartOpts = {}) {
    this.add(prim('box', () => new THREE.BoxGeometry(1, 1, 1)), color, x, y, z,
      { ...o, sx: w * (o.sx ?? 1), sy: h * (o.sy ?? 1), sz: d * (o.sz ?? 1) });
  }

  /** Cylinder with unit height; rT/rB radii. seg picks the cached primitive. */
  cyl(color: number, rT: number, rB: number, h: number, x = 0, y = 0, z = 0, o: PartOpts & { seg?: number } = {}) {
    const seg = o.seg ?? 8;
    // build a frustum by using a cone-ish cylinder: cache per (seg, ratio bucket)
    const ratio = rB === 0 ? 0 : Math.round((rT / rB) * 20) / 20;
    const key = `cyl_${seg}_${ratio}`;
    const g = prim(key, () => new THREE.CylinderGeometry(ratio === 0 ? 0.5 : 0.5 * ratio, 0.5, 1, seg));
    const base = rB || rT;
    this.add(g, color, x, y, z, { ...o, sx: base * 2 * (o.sx ?? 1), sy: h * (o.sy ?? 1), sz: base * 2 * (o.sz ?? 1) });
  }

  cone(color: number, r: number, h: number, x = 0, y = 0, z = 0, o: PartOpts & { seg?: number } = {}) {
    const seg = o.seg ?? 8;
    const g = prim(`cone_${seg}`, () => new THREE.ConeGeometry(0.5, 1, seg));
    this.add(g, color, x, y, z, { ...o, sx: r * 2 * (o.sx ?? 1), sy: h * (o.sy ?? 1), sz: r * 2 * (o.sz ?? 1) });
  }

  sphere(color: number, r: number, x = 0, y = 0, z = 0, o: PartOpts & { seg?: number } = {}) {
    const seg = o.seg ?? 7;
    const g = prim(`sph_${seg}`, () => new THREE.SphereGeometry(0.5, seg, Math.max(4, seg - 1)));
    this.add(g, color, x, y, z, { ...o, sx: r * 2 * (o.sx ?? 1), sy: r * 2 * (o.sy ?? 1), sz: r * 2 * (o.sz ?? 1) });
  }

  ico(color: number, r: number, x = 0, y = 0, z = 0, o: PartOpts = {}) {
    const g = prim('ico', () => new THREE.IcosahedronGeometry(0.5, 0));
    this.add(g, color, x, y, z, { ...o, sx: r * 2 * (o.sx ?? 1), sy: r * 2 * (o.sy ?? 1), sz: r * 2 * (o.sz ?? 1) });
  }

  /** Gabled roof: ridge runs along the z axis, base at y=0. */
  prism(color: number, w: number, h: number, d: number, x = 0, y = 0, z = 0, o: PartOpts = {}) {
    const g = prim('prism', makePrism);
    this.add(g, color, x, y, z, { ...o, sx: w * (o.sx ?? 1), sy: h * (o.sy ?? 1), sz: d * (o.sz ?? 1) });
  }

  torus(color: number, r: number, tube: number, arc: number, x = 0, y = 0, z = 0, o: PartOpts = {}) {
    const key = `torus_${Math.round(arc * 100)}_${Math.round((tube / r) * 100)}`;
    const g = prim(key, () => new THREE.TorusGeometry(0.5, 0.5 * (tube / r), 6, 12, arc));
    this.add(g, color, x, y, z, { ...o, sx: r * 2 * (o.sx ?? 1), sy: r * 2 * (o.sy ?? 1), sz: r * 2 * (o.sz ?? 1) });
  }

  build(): THREE.BufferGeometry {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(this.colors, 3));
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    return geo;
  }
}

function makePrism(): THREE.BufferGeometry {
  // unit prism: w=1 (x), h=1 (y), d=1 (z), base at y=0, ridge along z at x=0
  const a = 0.5, c = 0.5;
  const A = [-a, 0, -c], B = [-a, 0, c], C = [0, 1, c], D = [0, 1, -c];
  const E = [a, 0, -c], F = [a, 0, c];
  const tris: number[][] = [
    A, B, C, A, C, D,   // left slope (faces -x)
    F, E, D, F, D, C,   // right slope (faces +x)
    B, F, C,            // front gable (+z)
    E, A, D             // back gable (-z)
  ];
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(tris.flat(), 3));
  return geo;
}

/** Shared vertex-colored materials. */
export const MAT = {
  main: new THREE.MeshLambertMaterial({ vertexColors: true }),
  mainNoShadow: new THREE.MeshLambertMaterial({ vertexColors: true }),
  ghostOk: new THREE.MeshLambertMaterial({ color: 0x3fd97a, transparent: true, opacity: 0.55, depthWrite: false }),
  ghostBad: new THREE.MeshLambertMaterial({ color: 0xe0452e, transparent: true, opacity: 0.55, depthWrite: false }),
  flash: new THREE.MeshBasicMaterial({ color: 0xffffff })
};

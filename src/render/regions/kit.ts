// Shared by the region modules (WP16, WP17; see index.ts): repeatable randoms, faceted kits washed facet by facet for
// illustratedMaterial({ painted: true }), instanced draws, parts posed on the planet, and whether a region is in view.
import * as THREE from 'three';
import { transmittanceVec } from '../../style/glsl.ts';
import type { RGB } from '../../style/palette.ts';
import { R } from '../../sim/sphere.ts';
import { CHARTS, toWorld } from '../../sim/world/geography.ts';

export type V = THREE.Vector3;
export const vec = (x = 0, y = 0, z = 0): V => new THREE.Vector3(x, y, z);

/** A repeatable stream of randoms in [0, 1). */
export function seeded(seed: number): () => number {
  let a = seed * 0x9e3779b1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The unit direction of chart point (x, y) of region ri. */
export function chartDir(ri: number, x: number, y: number): V {
  const p = vec();
  toWorld(ri, x, y, p);
  return p;
}

/** Unit direction p lifted h u over mean sea level. */
export const lift = (p: V, h: number, out = vec()): V => out.copy(p).normalize().multiplyScalar(R + h);

/** Whether any of region ri within `radius` u of its centre can lie inside the eye's horizon. */
export function regionSeen(ri: number, eye: V, radius: number): boolean {
  const d = eye.length(), h = Math.max(d - R, 0), c = CHARTS[ri].c;
  const arc = R * Math.acos(Math.min(1, (eye.x * c.x + eye.y * c.y + eye.z * c.z) / d));
  return arc < radius + Math.sqrt(2 * R * h + h * h) + 10;
}

/** A facet's wash: pigment transmittance and density. */
export interface Wash { readonly t: V; readonly d: number }
export const washOf = (pigment: RGB, d: number): Wash => ({ t: transmittanceVec(pigment), d });

/** k points round a kit's y axis, clockwise seen from above: radius r(j), at height y or y(j, x, z). */
export function ring(k: number, y: number | ((j: number, x: number, z: number) => number), r: (j: number) => number): V[] {
  return Array.from({ length: k }, (_, j) => {
    const a = (j / k) * 2 * Math.PI, rr = r(j), x = Math.cos(a) * rr, z = Math.sin(a) * rr;
    return vec(x, typeof y === 'number' ? y : y(j, x, z), z);
  });
}

/** A faceted solid in its own frame (y up), each facet washed by `paint` from its centre and outward normal. */
export class Kit {
  private readonly paint: (centre: V, normal: V) => Wash;
  private readonly pos: number[] = [];
  private readonly wash: number[] = [];
  private readonly n = vec();
  private readonly e = vec();
  private readonly c = vec();

  constructor(paint: (centre: V, normal: V) => Wash) {
    this.paint = paint;
  }

  tri(a: V, b: V, c: V): void {
    this.n.subVectors(b, a).cross(this.e.subVectors(c, a)).normalize();
    this.c.copy(a).add(b).add(c).divideScalar(3);
    const w = this.paint(this.c, this.n);
    for (const p of [a, b, c]) {
      this.pos.push(p.x, p.y, p.z);
      this.wash.push(w.t.x, w.t.y, w.t.z, w.d);
    }
  }

  /** Rings of equal length (see ring) joined from the first to the last, both ends capped. */
  loft(rings: readonly (readonly V[])[]): this {
    const k = rings[0].length, first = rings[0], last = rings[rings.length - 1];
    for (let i = 0; i + 1 < rings.length; i++) {
      for (let j = 0; j < k; j++) {
        const a = rings[i][j], b = rings[i][(j + 1) % k], c = rings[i + 1][(j + 1) % k], d = rings[i + 1][j];
        this.tri(a, c, b);
        this.tri(a, d, c);
      }
    }
    const mid = (r: readonly V[]) => r.reduce((s, p) => s.add(p), vec()).divideScalar(k);
    const m0 = mid(first), m1 = mid(last);
    for (let j = 0; j < k; j++) {
      this.tri(m0, first[j], first[(j + 1) % k]);
      this.tri(m1, last[(j + 1) % k], last[j]);
    }
    return this;
  }

  /** The kit as flat-shaded geometry with the painted material's attributes (no stone or accent tint). */
  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry(), n = this.pos.length / 3;
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('aPaint', new THREE.Float32BufferAttribute(this.wash, 4));
    g.setAttribute('aTint', new THREE.Float32BufferAttribute(new Float32Array(n), 1));
    g.setAttribute('aStone', new THREE.Float32BufferAttribute(new Float32Array(3 * n), 3));
    g.setAttribute('aAccent', new THREE.Float32BufferAttribute(new Float32Array(3 * n), 3));
    g.computeVertexNormals();
    return g;
  }
}

/** One instanced draw call of a kit, refilled whenever its parts move. */
export class Draw {
  readonly mesh: THREE.InstancedMesh;
  private n = 0;

  constructor(kit: THREE.BufferGeometry, material: THREE.Material, capacity: number) {
    this.mesh = new THREE.InstancedMesh(kit, material, Math.max(capacity, 1));
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
  }

  get triangles(): number {
    return (this.mesh.count * this.mesh.geometry.getAttribute('position').count) / 3;
  }

  begin(): void {
    this.n = 0;
  }

  add(m: THREE.Matrix4): void {
    if (this.n < this.mesh.instanceMatrix.count) this.mesh.setMatrixAt(this.n++, m);
  }

  end(): void {
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  fill(ms: readonly THREE.Matrix4[]): this {
    this.begin();
    for (const m of ms) this.add(m);
    this.end();
    return this;
  }
}

const X = vec(), Y = vec(), Z = vec(), TIP = new THREE.Matrix4();
/** A part at `origin`, its y along `up`, its z along `fwd` (made tangent) turned `yaw` toward its x, tipped `tilt`
 *  about its x (its top toward its z), and scaled. */
export function pose(out: THREE.Matrix4, origin: V, up: V, fwd: V, yaw: number, tilt: number, sx: number, sy = sx, sz = sx): THREE.Matrix4 {
  Y.copy(up).normalize();
  Z.copy(fwd).addScaledVector(Y, -fwd.dot(Y)).normalize();
  X.crossVectors(Y, Z);
  Z.multiplyScalar(Math.cos(yaw)).addScaledVector(X, Math.sin(yaw));
  X.crossVectors(Y, Z);
  out.makeBasis(X, Y, Z).setPosition(origin);
  if (tilt) out.multiply(TIP.makeRotationX(tilt));
  return out.scale(Y.set(sx, sy, sz));
}

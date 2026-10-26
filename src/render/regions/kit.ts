import * as THREE from 'three';
import { belowHorizon } from '../terrain.ts';
import { transmittanceVec } from '../../style/glsl.ts';
import type { RGB } from '../../style/palette.ts';
import { R } from '../../sim/sphere.ts';
import { CHARTS, toWorld } from '../../sim/world/geography.ts';

export type V = THREE.Vector3;
export const vec = (x = 0, y = 0, z = 0): V => new THREE.Vector3(x, y, z);

export function seeded(seed: number): () => number {
  let a = seed * 0x9e3779b1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function chartDir(ri: number, x: number, y: number): V {
  const p = vec();
  toWorld(ri, x, y, p);
  return p;
}

export const lift = (p: V, h: number, out = vec()): V => out.copy(p).normalize().multiplyScalar(R + h);

export function regionSeen(ri: number, eye: V, radius: number): boolean {
  const d = eye.length(), h = Math.max(d - R, 0), c = CHARTS[ri].c;
  const arc = R * Math.acos(Math.min(1, (eye.x * c.x + eye.y * c.y + eye.z * c.z) / d));
  return arc < radius + Math.sqrt(2 * R * h + h * h) + 10;
}

export interface Wash { readonly t: V; readonly d: number }
export const washOf = (pigment: RGB, d: number): Wash => ({ t: transmittanceVec(pigment), d });

export function ring(k: number, y: number | ((j: number, x: number, z: number) => number), r: (j: number) => number): V[] {
  return Array.from({ length: k }, (_, j) => {
    const a = (j / k) * 2 * Math.PI, rr = r(j), x = Math.cos(a) * rr, z = Math.sin(a) * rr;
    return vec(x, typeof y === 'number' ? y : y(j, x, z), z);
  });
}

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

export class CullView {
  readonly frustum = new THREE.Frustum();
  readonly eye = vec();
  readonly dir = vec();
  eyeR = R;
  pxPerRad = 1;
  epoch = 0;
  private readonly last = vec(Infinity, 0, 0);
  private readonly look = vec();
  private readonly fwd = vec();
  private readonly vp = new THREE.Matrix4();

  set(camera: THREE.PerspectiveCamera, pxHeight: number): this {
    camera.updateMatrixWorld();
    const f = camera.getWorldDirection(this.fwd), e = camera.position, el = e.length();
    if (this.last.distanceTo(e) < Math.max(1.2, 0.015 * (el - R)) && f.dot(this.look) > 0.996) return this;
    this.last.copy(e);
    this.look.copy(f);
    this.eye.copy(e);
    this.eyeR = el;
    this.dir.copy(e).divideScalar(el);
    this.frustum.setFromProjectionMatrix(this.vp.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    this.pxPerRad = pxHeight / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
    this.epoch++;
    return this;
  }
}

export function cullDraws(root: THREE.Object3D, view: CullView): void {
  root.traverseVisible((o) => (o.userData.draw as Draw | undefined)?.cull(view));
}

const SPECK_PX = 1.5;
const CM = new THREE.Matrix4(), CC = vec(), CD = vec(), CS = new THREE.Sphere();

export class Draw {
  readonly mesh: THREE.InstancedMesh;
  private n = 0;
  private snap: { n: number; m: Float32Array; attrs: [THREE.InstancedBufferAttribute, Float32Array][] } | null = null;
  private dirty = false;
  private epoch = -1;

  constructor(kit: THREE.BufferGeometry, material: THREE.Material, capacity: number) {
    this.mesh = new THREE.InstancedMesh(kit, material, Math.max(capacity, 1));
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.userData.draw = this;
  }

  cull(v: CullView): void {
    const mesh = this.mesh, im = mesh.instanceMatrix, g = mesh.geometry;
    if (this.dirty) {
      const attrs = Object.values(g.attributes).filter((a): a is THREE.InstancedBufferAttribute => (a as THREE.InstancedBufferAttribute).isInstancedBufferAttribute);
      this.snap = { n: this.n, m: (im.array as Float32Array).slice(0, this.n * 16), attrs: attrs.map((a) => [a, (a.array as Float32Array).slice(0, this.n * a.itemSize)]) };
      this.dirty = false;
    } else if (this.epoch === v.epoch) return;
    this.epoch = v.epoch;
    const s = this.snap;
    if (!s || s.n === 0) return;
    if (!g.boundingSphere) g.computeBoundingSphere();
    const gs = g.boundingSphere!, dst = im.array as Float32Array;
    let n = 0;
    for (let j = 0; j < s.n; j++) {
      CM.fromArray(s.m, j * 16).premultiply(mesh.matrixWorld);
      CC.copy(gs.center).applyMatrix4(CM);
      const r = gs.radius * CM.getMaxScaleOnAxis(), cr = CC.length(), d = Math.max(0.05, CC.distanceTo(v.eye) - r);
      if ((r * v.pxPerRad) / d < SPECK_PX * (0.6 + 0.8 * ((j * 0.6180339887) % 1))) continue;
      if (!v.frustum.intersectsSphere(CS.set(CC, r + 6 + 0.1 * d))) continue;
      if (cr > 1e-6 && belowHorizon(CD.copy(CC).divideScalar(cr), Math.asin(Math.min(1, r / cr)), cr + r, v.dir, v.eyeR)) continue;
      dst.set(s.m.subarray(j * 16, j * 16 + 16), n * 16);
      for (const [a, src] of s.attrs) (a.array as Float32Array).set(src.subarray(j * a.itemSize, (j + 1) * a.itemSize), n * a.itemSize);
      n++;
    }
    mesh.count = n;
    im.needsUpdate = true;
    for (const [a] of s.attrs) a.needsUpdate = true;
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
    this.dirty = true;
  }

  fill(ms: readonly THREE.Matrix4[]): this {
    this.begin();
    for (const m of ms) this.add(m);
    this.end();
    return this;
  }
}

const X = vec(), Y = vec(), Z = vec(), TIP = new THREE.Matrix4();
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

function eachFacet(g: THREE.BufferGeometry, fn: (i: number, centre: V, normal: V, corners: readonly V[]) => void): void {
  const pos = g.getAttribute('position'), a = vec(), b = vec(), c = vec(), n = vec(), m = vec(), corners = [a, b, c];
  for (let i = 0; i + 2 < pos.count; i += 3) {
    a.fromBufferAttribute(pos, i);
    b.fromBufferAttribute(pos, i + 1);
    c.fromBufferAttribute(pos, i + 2);
    n.subVectors(b, a).cross(m.subVectors(c, a)).normalize();
    fn(i, m.copy(a).add(b).add(c).divideScalar(3), n, corners);
  }
}

export function tintFacets(g: THREE.BufferGeometry, pick: (centre: V, normal: V) => number): THREE.BufferGeometry {
  const tint = g.getAttribute('aTint') as THREE.BufferAttribute;
  eachFacet(g, (i, c, n) => {
    const t = pick(c, n);
    for (let k = 0; k < 3; k++) tint.setX(i + k, t);
  });
  return g;
}

export function facetUV(g: THREE.BufferGeometry, along: (centre: V, normal: V, out: V) => V, per: readonly [number, number] = [1, 1]): THREE.BufferGeometry {
  const uv = new Float32Array(2 * g.getAttribute('position').count), d = vec(), e = vec();
  eachFacet(g, (i, c, n, corners) => {
    along(c, n, d).addScaledVector(n, -d.dot(n));
    if (d.lengthSq() < 1e-6) {
      const side = Math.abs(n.y) < 0.9;
      d.set(side ? 0 : 1, side ? 1 : 0, 0).addScaledVector(n, -(side ? n.y : n.x));
    }
    d.normalize();
    e.crossVectors(n, d);
    corners.forEach((p, k) => {
      uv[2 * (i + k)] = p.dot(d) / per[0];
      uv[2 * (i + k) + 1] = p.dot(e) / per[1];
    });
  });
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return g;
}

export function perInstance(g: THREE.BufferGeometry, capacity: number): { stone: THREE.InstancedBufferAttribute; accent: THREE.InstancedBufferAttribute } {
  const make = () => new THREE.InstancedBufferAttribute(new Float32Array(3 * Math.max(capacity, 1)), 3);
  const stone = make(), accent = make();
  g.setAttribute('aStone', stone);
  g.setAttribute('aAccent', accent);
  return { stone, accent };
}

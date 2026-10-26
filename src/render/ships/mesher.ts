import * as THREE from 'three';
import type { Sink } from '../craft.ts';

export const ZONE = { HULL: 0, PAINT: 1, TRIM: 2, TAR: 3, DECK: 4, SPAR: 5, IRON: 6, DARK: 7, GLASS: 8, GILT: 9 } as const;

export interface OrnamentPanel { kind: 'transom' | 'quarter' | 'taffrail' | 'beak' | 'stem'; centre: THREE.Vector3; normal: THREE.Vector3; up: THREE.Vector3; width: number; height: number }

export class ShipMesher implements Sink {
  zone: number = ZONE.HULL;
  bone = 0;
  xf: THREE.Matrix4 | null = null;
  uv: (p: THREE.Vector3, s: number, t: number) => readonly [number, number] = (p) => [p.y, p.z];
  private readonly pos: number[] = [];
  private readonly nrm: number[] = [];
  private readonly uvs: number[] = [];
  private readonly info: number[] = [];
  private readonly idx: number[] = [];
  private readonly nm = new THREE.Matrix3();
  private readonly p = new THREE.Vector3();
  private readonly n = new THREE.Vector3();

  get count(): number { return this.pos.length / 3; }
  get triangles(): number { return this.idx.length; }

  vert(p: THREE.Vector3, n: THREE.Vector3, s: number, t: number): number {
    const q = this.p.copy(p), m = this.n.copy(n);
    if (this.xf) { q.applyMatrix4(this.xf); m.applyMatrix3(this.nm.getNormalMatrix(this.xf)).normalize(); }
    this.pos.push(q.x, q.y, q.z);
    this.nrm.push(m.x, m.y, m.z);
    this.uvs.push(...this.uv(q, s, t));
    this.info.push(this.zone, this.bone);
    return this.count - 1;
  }
  tri(a: number, b: number, c: number): void {
    this.idx.push(a, b, c);
  }
  mirror(v0: number, i0: number): void {
    const n = this.count, off = n - v0;
    for (let v = v0; v < n; v++) {
      this.pos.push(-this.pos[3 * v], this.pos[3 * v + 1], this.pos[3 * v + 2]);
      this.nrm.push(-this.nrm[3 * v], this.nrm[3 * v + 1], this.nrm[3 * v + 2]);
      this.uvs.push(this.uvs[2 * v], this.uvs[2 * v + 1]);
      this.info.push(this.info[2 * v], this.info[2 * v + 1]);
    }
    for (let i = i0, e = this.idx.length; i < e; i += 3) this.idx.push(this.idx[i] + off, this.idx[i + 2] + off, this.idx[i + 1] + off);
  }
  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uvs, 2));
    g.setAttribute('aInfo', new THREE.Float32BufferAttribute(this.info, 2));
    g.setIndex(this.idx);
    return g;
  }
}

export const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
export const range = (n: number, a = 0, b = 1) => Array.from({ length: n + 1 }, (_, i) => a + ((b - a) * i) / n);
export const frame = (p: THREE.Vector3, normal: THREE.Vector3, up = V(0, 1, 0)) => {
  const z = normal.clone().normalize(), x = new THREE.Vector3().crossVectors(up, z).normalize(), y = new THREE.Vector3().crossVectors(z, x);
  return new THREE.Matrix4().makeBasis(x, y, z).setPosition(p);
};
export const along = (p: THREE.Vector3, axis: THREE.Vector3) => new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), axis.clone().normalize())).setPosition(p);

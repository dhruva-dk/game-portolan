// A small mesh builder with vertex colours, ported from the rewrite's creatures: lofted tubes and thin blades. Each
// part can carry a tag per vertex (`aPart`), so a shader can move wings and flukes without a scene graph.
import * as THREE from 'three';

export interface Ring { c: THREE.Vector3; rx: number; ry: number; col: THREE.Color; up?: THREE.Color }

export const C = (h: number): THREE.Color => new THREE.Color(h);

export class Mesher {
  pos: number[] = []; nor: number[] = []; col: number[] = []; idx: number[] = []; tag: number[] = [];
  /** The tag the next vertices carry. */
  part = 0;
  private push(p: THREE.Vector3 | number[], n: THREE.Vector3, c: THREE.Color): void {
    if (Array.isArray(p)) this.pos.push(p[0], p[1], p[2]); else this.pos.push(p.x, p.y, p.z);
    this.nor.push(n.x, n.y, n.z);
    this.col.push(c.r, c.g, c.b);
    this.tag.push(this.part);
  }
  /** A lofted tube: rings of (center, radii, colour) joined in order. */
  loft(rings: Ring[], sides = 12): void {
    const base = this.pos.length / 3, n = new THREE.Vector3();
    for (const r of rings) {
      for (let i = 0; i <= sides; i++) {
        const a = (i / sides) * Math.PI * 2;
        const x = Math.cos(a), y = Math.sin(a);
        n.set(x / Math.max(r.rx, 1e-3), y / Math.max(r.ry, 1e-3), 0).normalize();
        this.push([r.c.x + x * r.rx, r.c.y + y * r.ry, r.c.z], n, r.up && y > 0.15 ? r.up : r.col);
      }
    }
    for (let j = 0; j < rings.length - 1; j++) for (let i = 0; i < sides; i++) {
      const a = base + j * (sides + 1) + i, b = a + 1, c = a + sides + 1, d = c + 1;
      this.idx.push(a, b, c, b, d, c);
    }
  }
  /** A flat, slightly thick blade from a list of outline points (x,z) in its plane, coloured by a function. */
  blade(outline: [number, number][], thick: number, color: (x: number, z: number) => THREE.Color, m: THREE.Matrix4): void {
    const n = outline.length;
    const cx = outline.reduce((a, p) => a + p[0], 0) / n, cz = outline.reduce((a, p) => a + p[1], 0) / n;
    for (const side of [1, -1]) {
      const b0 = this.pos.length / 3;
      const nn = new THREE.Vector3(0, side, 0).transformDirection(m);
      this.push(new THREE.Vector3(cx, side * thick, cz).applyMatrix4(m), nn, color(cx, cz));
      for (const [x, z] of outline) this.push(new THREE.Vector3(x, side * thick, z).applyMatrix4(m), nn, color(x, z));
      for (let i = 0; i < n; i++) {
        const a = b0 + 1 + i, b = b0 + 1 + ((i + 1) % n);
        if (side > 0) this.idx.push(b0, b, a); else this.idx.push(b0, a, b);
      }
    }
  }
  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('aPart', new THREE.Float32BufferAttribute(this.tag, 1));
    g.setIndex(this.idx);
    return g;
  }
}

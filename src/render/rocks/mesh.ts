// Geometry helpers shared by every rock form: a triangle builder that carries the rock attribute, lofts, displaced
// icospheres with flat plane cuts, merging and normals.
//
// Every rock geometry carries `aRock` (vec4), which the rock material reads:
//   x  cavity: 0 on exposed faces, 1 deep in cracks, under overhangs and inside caves (darkens, keeps it wet)
//   y  cover:  how much the skin's cover layer (moss, snow, turf) may grow here, on top of facing up
//   z  accent: per-form: lava glow, ice veins, sandstone band shift, coral polyp pattern
//   w  piece:  a random number per piece, so pieces merged into one mesh differ in tint
import * as THREE from 'three';
import { mergeGeometries, mergeVertices, toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';

export type Vec = [number, number, number];
export type Rock4 = [number, number, number, number];

/** Collects vertices with their rock attribute and triangles, then builds a BufferGeometry. */
export class Builder {
  pos: number[] = [];
  rock: number[] = [];
  idx: number[] = [];

  get count(): number {
    return this.pos.length / 3;
  }

  vert(x: number, y: number, z: number, cav = 0, cover = 1, accent = 0, piece = 0): number {
    this.pos.push(x, y, z);
    this.rock.push(cav, cover, accent, piece);
    return this.count - 1;
  }

  tri(a: number, b: number, c: number): void {
    this.idx.push(a, b, c);
  }

  /** a-b-c-d counter-clockwise seen from outside. */
  quad(a: number, b: number, c: number, d: number): void {
    this.idx.push(a, b, c, a, c, d);
  }

  /**
   * Connects rings of equal length into a tube, faces outward. Rings run bottom to top, and each ring runs with its
   * angle increasing from +x toward +z (x = cos a, z = sin a).
   */
  loft(rings: number[][], closed = true): void {
    for (let r = 0; r + 1 < rings.length; r++) {
      const A = rings[r], B = rings[r + 1], n = A.length;
      for (let i = 0; i < (closed ? n : n - 1); i++) {
        const j = (i + 1) % n;
        this.quad(A[i], B[i], B[j], A[j]);
      }
    }
  }

  /** Fans a closed ring (same winding as loft) to a centre vertex: up = true for a cap facing +y. */
  cap(ring: number[], centre: number, up: boolean): void {
    for (let i = 0; i < ring.length; i++) {
      const j = (i + 1) % ring.length;
      if (up) this.tri(centre, ring[j], ring[i]);
      else this.tri(centre, ring[i], ring[j]);
    }
  }

  geometry(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('aRock', new THREE.Float32BufferAttribute(this.rock, 4));
    g.setIndex(this.idx);
    return g;
  }
}

/** A vertex of a ring for loftRings: position and the rock attribute. */
export interface RingPt {
  x: number;
  y: number;
  z: number;
  cav?: number;
  cover?: number;
  accent?: number;
}

/**
 * Lofts rings (bottom to top, each running x = cos a, z = sin a) into a closed solid, capping the ends with fans
 * to the given centre points.
 */
export function loftRings(rings: RingPt[][], top: RingPt | null, bottom: RingPt | null, piece = 0): THREE.BufferGeometry {
  const b = new Builder();
  const add = (p: RingPt) => b.vert(p.x, p.y, p.z, p.cav ?? 0, p.cover ?? 1, p.accent ?? 0, piece);
  const idx = rings.map((r) => r.map(add));
  b.loft(idx);
  if (top) b.cap(idx[idx.length - 1], add(top), true);
  if (bottom) b.cap(idx[0], add(bottom), false);
  return b.geometry();
}

/** Smooth normals for organic forms, or creased normals (hard edges past the angle, in degrees) for faceted ones. */
export function finish(g: THREE.BufferGeometry, crease = 0): THREE.BufferGeometry {
  let out = g;
  if (crease > 0) {
    out = toCreasedNormals(g, (crease * Math.PI) / 180);
  } else {
    out.computeVertexNormals();
  }
  out.computeBoundingBox();
  out.computeBoundingSphere();
  return out;
}

/** Merges geometries that all carry position, normal and aRock. */
export function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const clean = parts.map((p) => {
    const q = p.index ? p.toNonIndexed() : p;
    for (const name of Object.keys(q.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'aRock') q.deleteAttribute(name);
    return q;
  });
  const g = mergeGeometries(clean, false);
  if (!g) throw new Error('rocks: merge failed');
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}

/** An indexed unit icosphere. three's subdivision makes 20 * (detail + 1)^2 faces. */
export function icosphere(detail: number): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(1, detail);
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  return mergeVertices(g, 1e-5);
}

/** A cutting plane: points beyond d along n are pushed back onto the plane, leaving a flat facet. */
export interface Cut {
  n: Vec;
  d: number;
}

export interface BlobSpec {
  /** Icosphere detail, see icosphere(). */
  detail: number;
  /** Ellipsoid radii. */
  radii: Vec;
  /** Displacement of the unit direction, in units of the mean radius, before scaling. Returns [offset, cavity]. */
  shape?: (x: number, y: number, z: number) => [number, number];
  /** Flat facets, in unit-sphere space before the radii apply. */
  cuts?: Cut[];
  /** Everything below this y (after scaling) is pulled into a flat embedded base. */
  floor?: number;
  cover?: (x: number, y: number, z: number, ny: number) => number;
  accent?: (x: number, y: number, z: number) => number;
  piece?: number;
}

/** A displaced, cut ellipsoid: the base of boulders, blocks, chunks and coral heads. */
export function blob(spec: BlobSpec): THREE.BufferGeometry {
  const g = icosphere(spec.detail);
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  const n = p.count, rock = new Float32Array(n * 4);
  const [rx, ry, rz] = spec.radii;
  for (let i = 0; i < n; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    let cav = 0;
    if (spec.shape) {
      const [o, c] = spec.shape(x, y, z);
      x *= 1 + o;
      y *= 1 + o;
      z *= 1 + o;
      cav = c;
    }
    if (spec.cuts) {
      for (const c of spec.cuts) {
        const d = x * c.n[0] + y * c.n[1] + z * c.n[2] - c.d;
        if (d > 0) {
          x -= d * c.n[0];
          y -= d * c.n[1];
          z -= d * c.n[2];
        }
      }
    }
    x *= rx;
    y *= ry;
    z *= rz;
    if (spec.floor !== undefined && y < spec.floor) {
      // tuck the underside in, so the rock sits into the ground instead of balancing on a point
      const t = Math.min(1, (spec.floor - y) / (ry * 0.6));
      y = spec.floor - (spec.floor - y) * 0.6;
      x *= 1 - 0.18 * t;
      z *= 1 - 0.18 * t;
      cav = Math.max(cav, 0.5 * t);
    }
    p.setXYZ(i, x, y, z);
    const ny = y / Math.max(1e-6, Math.hypot(x, y, z));
    rock[i * 4] = cav;
    rock[i * 4 + 1] = spec.cover ? spec.cover(x, y, z, ny) : 1;
    rock[i * 4 + 2] = spec.accent ? spec.accent(x, y, z) : 0;
    rock[i * 4 + 3] = spec.piece ?? 0;
  }
  g.setAttribute('aRock', new THREE.BufferAttribute(rock, 4));
  return g;
}

/** Random cutting planes spread over the sphere: n planes at distances between dMin and dMax. */
export function randomCuts(r: () => number, n: number, dMin: number, dMax: number, flatTop = false): Cut[] {
  const out: Cut[] = [];
  for (let i = 0; i < n; i++) {
    const u = r() * 2 - 1, a = r() * Math.PI * 2, s = Math.sqrt(1 - u * u);
    out.push({ n: [s * Math.cos(a), u, s * Math.sin(a)], d: dMin + (dMax - dMin) * r() });
  }
  if (flatTop) out.push({ n: [0, 1, 0], d: dMin + (dMax - dMin) * r() });
  return out;
}

/** Applies a matrix to a geometry in place and returns it. */
export function place(g: THREE.BufferGeometry, x: number, y: number, z: number, yaw = 0, pitch = 0, roll = 0, s: Vec | number = 1): THREE.BufferGeometry {
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, yaw, roll, 'YXZ')),
    typeof s === 'number' ? new THREE.Vector3(s, s, s) : new THREE.Vector3(s[0], s[1], s[2]),
  );
  g.applyMatrix4(m);
  return g;
}

/** Sets the piece random (aRock.w) on every vertex. */
export function setPiece(g: THREE.BufferGeometry, piece: number): THREE.BufferGeometry {
  const a = g.getAttribute('aRock') as THREE.BufferAttribute;
  for (let i = 0; i < a.count; i++) a.setW(i, piece);
  return g;
}

/** Three detail levels: 0 for 10 m, 1 for 50 m, 2 for 300 m. */
export type Lod = 0 | 1 | 2;
export const pick = <T>(lod: number, a: T, b: T, c: T): T => (lod <= 0 ? a : lod === 1 ? b : c);

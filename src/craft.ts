// The shared procedural-geometry kit of the modules that model things in code (structures, ships, flora, fx):
// tubes, surfaces of revolution and boxes written through a sink, so each module keeps its own vertex format;
// the props several modules strand or set afloat (casks, driftwood); CPU value noise; cube-grid sampling; and the
// derivative-frame normal mapping their shaders share.
import * as THREE from 'three';
import { faceUV, mix, type FaceUV, type Rng, type V3 } from './sim.ts';

const TAU = Math.PI * 2;

/**
 * Receives generated geometry. vert gets a position and unit normal in the generator's frame, the generator's own
 * surface coordinates (s, t) and sample index i, and returns the new vertex's index; tri gets triangles wound
 * counter-clockwise seen from outside. Positions and normals are scratch vectors: copy them, don't keep them.
 *   tube   s around (0..1), t length along the path, i ring; caps: (s, t) disc coordinates in units, i = -1
 *   lathe  s around (0..1 of the arc), t length along the profile, i profile point
 *   box    (s, t) units along the face's two edges, i face (0 +x, 1 -x, 2 +y, 3 -y, 4 +z, 5 -z)
 */
export interface Sink {
  vert(p: THREE.Vector3, n: THREE.Vector3, s: number, t: number, i: number): number;
  tri(a: number, b: number, c: number): void;
}

const _p = new THREE.Vector3(), _n = new THREE.Vector3(), _r = new THREE.Vector3(), _q = new THREE.Vector3();
const _b = new THREE.Vector3();

export interface TubeOpt {
  /** radius multiplier around ring i at angle a (flutes, buttresses, rough bark) */
  shape?: (a: number, i: number) => number;
  /** end caps: null leaves an end open; a number caps it, its centre standing that far out (0 = flat) */
  caps?: readonly [number | null, number | null];
}

/**
 * A generalised cylinder through a path (closed when its ends meet) with parallel-transported frames, a radius per
 * ring, and normals that follow the taper and the shape.
 */
export function tube(out: Sink, path: readonly THREE.Vector3[], radius: (i: number) => number, seg: number, o: TubeOpt = {}): void {
  const n = path.length, closed = path[0].distanceTo(path[n - 1]) < 1e-6, T: THREE.Vector3[] = [], N: THREE.Vector3[] = [], L = [0];
  for (let i = 0; i < n; i++) {
    const a = path[i > 0 ? i - 1 : closed ? n - 2 : 0], b = path[i < n - 1 ? i + 1 : closed ? 1 : n - 1];
    T.push(b.clone().sub(a).normalize());
    if (i) L.push(L[i - 1] + path[i].distanceTo(path[i - 1]));
  }
  const ax = Math.abs(T[0].x) < 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1);
  N.push(ax.addScaledVector(T[0], -ax.dot(T[0])).normalize());
  for (let i = 1; i < n; i++) N.push(N[i - 1].clone().addScaledVector(T[i], -N[i - 1].dot(T[i])).normalize());
  const shape = o.shape ?? (() => 1), e = 0.05, rows: number[] = [];
  const ring = (i: number, a: number, r: number) => {
    _r.copy(N[i]).multiplyScalar(Math.cos(a)).addScaledVector(_b.crossVectors(T[i], N[i]), Math.sin(a));
    return _p.copy(path[i]).addScaledVector(_r, r);
  };
  for (let i = 0; i < n; i++) {
    const i0 = Math.max(0, i - 1), i1 = Math.min(n - 1, i + 1), r = radius(i);
    const dr = (radius(i1) - radius(i0)) / Math.max(1e-6, L[i1] - L[i0]);
    for (let k = 0; k <= seg; k++) {
      const a = (k / seg) * TAU, sh = shape(a, i), ds = (shape(a + e, i) - shape(a - e, i)) / (2 * e);
      ring(i, a, r * sh);
      _q.copy(N[i]).multiplyScalar(-Math.sin(a)).addScaledVector(_b, Math.cos(a));
      _n.copy(_r).addScaledVector(T[i], -dr * sh).addScaledVector(_q, -ds / sh).normalize();
      const v = out.vert(_p, _n, k / seg, L[i], i);
      if (!k) rows.push(v);
    }
  }
  for (let i = 0; i + 1 < n; i++) {
    for (let k = 0; k < seg; k++) {
      const a = rows[i] + k, b = rows[i + 1] + k;
      out.tri(a, a + 1, b + 1);
      out.tri(a, b + 1, b);
    }
  }
  (o.caps ?? [null, null]).forEach((tip, end) => {
    if (tip === null) return;
    const i = end ? n - 1 : 0, s = end ? 1 : -1, r = radius(i);
    const c = out.vert(_p.copy(path[i]).addScaledVector(T[i], s * tip), _n.copy(T[i]).multiplyScalar(s), 0, 0, -1);
    for (let k = 0; k < seg; k++) {
      const a = (k / seg) * TAU, sh = shape(a, i);
      ring(i, a, r * sh);
      // a flat cap faces along the path; a pointed one leans out like the cone it is
      _n.copy(T[i]).multiplyScalar(s * r * sh).addScaledVector(_r, tip).normalize();
      out.vert(_p, _n, Math.cos(a) * r * sh, Math.sin(a) * r * sh, -1);
    }
    for (let k = 0; k < seg; k++) {
      const a = c + 1 + k, b = c + 1 + ((k + 1) % seg);
      if (end) out.tri(c, a, b);
      else out.tri(c, b, a);
    }
  });
}

/**
 * Surface of revolution about +Y from [r, y] points over the arc a0..a1. Walk the profile outward along the bottom,
 * up the outside and inward over the top so faces point out; repeat a point to crease there. shape(a, i) scales the
 * radius around profile point i.
 */
export function lathe(out: Sink, prof: readonly (readonly number[])[], seg: number, a0 = 0, a1 = TAU, shape?: (a: number, i: number) => number): void {
  const np = prof.length, L = [0], rows: number[] = [], e = 0.01;
  for (let i = 1; i < np; i++) L.push(L[i - 1] + Math.hypot(prof[i][0] - prof[i - 1][0], prof[i][1] - prof[i - 1][1]));
  for (let i = 0; i < np; i++) {
    const i0 = Math.max(i - 1, 0), i1 = Math.min(i + 1, np - 1), [r, y] = prof[i];
    const dr = prof[i1][0] - prof[i0][0], dy = prof[i1][1] - prof[i0][1];
    for (let k = 0; k <= seg; k++) {
      const a = a0 + ((a1 - a0) * k) / seg, c = Math.cos(a), s = Math.sin(a);
      const m = shape ? shape(a, i) : 1, dm = shape ? (shape(a + e, i) - shape(a - e, i)) / (2 * e) : 0;
      _p.set(r * m * c, y, -r * m * s);
      // the profile's outward normal, tipped along the circle where the shape slopes
      _n.set(dy * c, -dr, -dy * s).addScaledVector(_q.set(-s, 0, -c), (-dy * dm) / m).normalize();
      const v = out.vert(_p, _n, k / seg, L[i], i);
      if (!k) rows.push(v);
    }
  }
  for (let i = 0; i + 1 < np; i++) {
    for (let k = 0; k < seg; k++) {
      const a = rows[i] + k, b = rows[i + 1] + k;
      out.tri(a, a + 1, b + 1);
      out.tri(a, b + 1, b);
    }
  }
}
/** Every inner profile point doubled, so a lathe creases there (hard-edged mouldings). */
export const crease = (prof: number[][]) => prof.flatMap((q, j) => (j && j < prof.length - 1 ? [q, q] : [q]));

/** Box of size (sx, sy, sz) centred on the origin, flat-shaded. */
export function box(out: Sink, sx: number, sy: number, sz: number): void {
  const h = [sx / 2, sy / 2, sz / 2], dims = [sx, sy, sz];
  for (let f = 0; f < 6; f++) {
    const ax = f >> 1, sgn = f & 1 ? -1 : 1, a1 = (ax + 1) % 3, a2 = (ax + 2) % 3, ids: number[] = [];
    for (const [i, j] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      _p.set(0, 0, 0).setComponent(ax, sgn * h[ax]).setComponent(a1, i * h[a1]).setComponent(a2, j * h[a2]);
      ids.push(out.vert(_p, _n.set(0, 0, 0).setComponent(ax, sgn), ((i + 1) / 2) * dims[a1], ((j + 1) / 2) * dims[a2], f));
    }
    const [a, b, c, d] = sgn > 0 ? ids : [ids[0], ids[3], ids[2], ids[1]];
    out.tri(a, b, c);
    out.tri(a, c, d);
  }
}

/** A sink that collects a plain BufferGeometry, mapping the generators' (s, t, i) to texture coordinates. */
export class GeometrySink implements Sink {
  private readonly pos: number[] = [];
  private readonly nrm: number[] = [];
  private readonly uvs: number[] = [];
  private readonly idx: number[] = [];
  private readonly uv: (s: number, t: number, i: number) => readonly [number, number];

  constructor(uv: (s: number, t: number, i: number) => readonly [number, number] = (s, t) => [s, t]) {
    this.uv = uv;
  }

  vert(p: THREE.Vector3, n: THREE.Vector3, s: number, t: number, i: number): number {
    this.pos.push(p.x, p.y, p.z);
    this.nrm.push(n.x, n.y, n.z);
    this.uvs.push(...this.uv(s, t, i));
    return this.pos.length / 3 - 1;
  }

  tri(a: number, b: number, c: number): void {
    this.idx.push(a, b, c);
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uvs, 2));
    g.setIndex(this.idx);
    return g;
  }
}

// ---------------------------------------------------------------------------------------------
// Props built by more than one module.

/**
 * A coopered cask standing on y = 0: bulging staves with a groove at every joint, a chime and recessed head at each
 * end, and four iron hoops. Staves and hoops go to their own sinks; `stave(k)` runs before each stave so a caller
 * can give it its own board.
 */
export function cask(staves: Sink, hoops: Sink, h: number, rEnd: number, rMid: number, stave?: (k: number) => void): void {
  const r = (y: number) => rEnd + (rMid - rEnd) * Math.sin((Math.PI * y) / h), n = 14, w = TAU / n, chime = 0.07 * h;
  const prof = Array.from({ length: 9 }, (_, j) => [r((h * j) / 8), (h * j) / 8]);
  for (let k = 0; k < n; k++) {
    const a0 = k * w, a1 = a0 + w;
    stave?.(k);
    lathe(staves, prof, 4, a0, a1, (a) => 1 - 0.05 * Math.max(0, 1 - Math.min(a - a0, a1 - a) / (0.25 * w)));
  }
  const rim = rEnd * 0.9;
  lathe(staves, crease([[0, chime], [rim, chime], [rim, 0], [rEnd, 0]]), 14);
  lathe(staves, crease([[rEnd, h], [rim, h], [rim, h - chime], [0, h - chime]]), 14);
  for (const f of [0.09, 0.3, 0.63, 0.84]) {
    const y0 = f * h, y1 = y0 + 0.07 * h;
    lathe(hoops, crease([[r(y0) - 0.003, y0], [r(y0) + 0.006, y0], [r(y1) + 0.006, y1], [r(y1) - 0.003, y1]]), 20);
  }
}

/**
 * A bleached, gnarled log lying along x (centred, its centreline near y = 0): a flared root end with splayed root
 * stubs, two broken-off branches, rough bark, and ends splintered to points.
 */
export function driftwood(out: Sink, rng: Rng, L: number, r0: number): void {
  const ph = rng.next() * 6;
  const path = Array.from({ length: 9 }, (_, i) => {
    const s = i / 8;
    return new THREE.Vector3((s - 0.5) * L, 0.011 * L * Math.sin(s * 5 + ph), 0.08 * L * (Math.sin(s * Math.PI + ph) - 0.45));
  });
  const radius = (i: number) => r0 * (1 - 0.45 * (i / 8)) * (i === 0 ? 1.5 : i === 1 ? 1.15 : 1);
  const limb = (from: THREE.Vector3, dir: THREE.Vector3, len: number, r: number) => {
    const pts = [0, 0.5, 1].map((s) => from.clone().addScaledVector(dir, s * len).add(new THREE.Vector3(0, 0, s * s * 0.02 * L)));
    tube(out, pts, (i) => r * (1 - i * 0.35), 6, { shape: rough(rng, 3, 6, 0.2), caps: [null, r] });
  };
  tube(out, path, radius, 9, { shape: rough(rng, 9, 9, 0.25), caps: [radius(0) * 0.3, r0 * 0.6 + radius(8) * 0.3] });
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * TAU + rng.range(-0.3, 0.3);
    limb(path[0], new THREE.Vector3(-0.7, 0.5 * Math.cos(a), Math.sin(a)).normalize(), (0.09 + 0.09 * rng.next()) * L, r0 * 0.45);
  }
  for (let k = 0; k < 2; k++) limb(path[3 + k * 2], new THREE.Vector3(0.7, 0.15, k ? 1 : -1).normalize(), (0.11 + 0.11 * rng.next()) * L, r0 * 0.4);
}

/** A tube shape: bark that bulges and dips at random around each ring, linear between sides so normals follow. */
export function rough(rng: Rng, rings: number, sides: number, amt: number): (a: number, i: number) => number {
  const jag = Array.from({ length: rings * sides }, () => 1 + amt * (rng.next() - 0.5));
  return (a, i) => {
    const f = ((((a / TAU) * sides) % sides) + sides) % sides, k = Math.floor(f);
    return mix(jag[i * sides + k], jag[i * sides + ((k + 1) % sides)], f - k);
  };
}

// ---------------------------------------------------------------------------------------------
// Noise and grids.

/** Hash of an integer lattice point to [0, 1). */
export function hash(x: number, y: number, z: number, seed: number): number {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(z | 0, 0x1b873593) ^ seed;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Value noise in [0, 1); with periods px, py > 0 it tiles every px × py cells in x and y. */
export function vnoise(x: number, y: number, z: number, seed: number, px = 0, py = 0): number {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const s = (t: number) => t * t * (3 - 2 * t), u = s(x - xi), v = s(y - yi), w = s(z - zi);
  const wx = (a: number) => (px ? ((a % px) + px) % px : a), wy = (a: number) => (py ? ((a % py) + py) % py : a);
  const l = (dx: number, dy: number, dz: number) => hash(wx(xi + dx), wy(yi + dy), zi + dz, seed);
  return mix(mix(mix(l(0, 0, 0), l(1, 0, 0), u), mix(l(0, 1, 0), l(1, 1, 0), u), v),
    mix(mix(l(0, 0, 1), l(1, 0, 1), u), mix(l(0, 1, 1), l(1, 1, 1), u), v), w);
}

/** Octaves of vnoise (frequency and periods doubling, a new seed each), normalised to [0, 1). */
export function fbm(x: number, y: number, z: number, seed: number, octaves: number, px = 0, py = 0): number {
  let s = 0, amp = 0.5, norm = 0;
  for (let o = 0, f = 1; o < octaves; o++, f *= 2, amp *= 0.5) {
    s += amp * vnoise(x * f, y * f, z * f, seed + o * 17, px * f, py * f);
    norm += amp;
  }
  return s / norm;
}

const fuv: FaceUV = { face: 0, u: 0, v: 0 };
/**
 * Bilinear lookup of a cube-grid field (n cells per face edge, `stride` channels per cell, the sim's equal-angle
 * mapping) at a unit direction, within its face as the GPU's cube filtering does. Writes every channel into out
 * and returns the first.
 */
export function sampleCube(field: ArrayLike<number>, n: number, p: V3, out: number[] = [0], stride = 1): number {
  faceUV(p, fuv);
  const x = Math.min(n - 1, Math.max(0, (fuv.u + 1) * 0.5 * n - 0.5)), y = Math.min(n - 1, Math.max(0, (fuv.v + 1) * 0.5 * n - 0.5));
  const i = Math.min(n - 2, Math.floor(x)), j = Math.min(n - 2, Math.floor(y)), fx = x - i, fy = y - j;
  const b = (fuv.face * n * n + j * n + i) * stride, up = n * stride;
  for (let c = 0; c < stride; c++) {
    const a = b + c;
    out[c] = mix(mix(field[a], field[a + stride], fx), mix(field[a + up], field[a + up + stride], fx), fy);
  }
  return out[0];
}

/** GLSL: vec3 tangentNormal(vec3 n, vec3 viewPos, vec2 uv, vec3 tn) — a tangent-space normal from screen-space
 *  derivatives, for meshes without a tangent attribute (three only builds this frame for its own normal maps). */
export const TANGENT_NORMAL_GLSL = /* glsl */ `
vec3 tangentNormal(vec3 n, vec3 p, vec2 uv, vec3 tn) {
  vec3 q0 = dFdx(p), q1 = dFdy(p);
  vec2 st0 = dFdx(uv), st1 = dFdy(uv);
  vec3 q1p = cross(q1, n), q0p = cross(n, q0);
  vec3 T = q1p * st0.x + q0p * st1.x, B = q1p * st0.y + q0p * st1.y;
  float det = max(dot(T, T), dot(B, B));
  return det == 0.0 ? n : normalize(mat3(T * inversesqrt(det), B * inversesqrt(det), n) * tn);
}
`;

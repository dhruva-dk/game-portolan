// The galleon's geometry kit: an accumulator per draw (body, sails, ropes) and the few shapes everything on her is
// made of — lofted sheets, tubes along a path, lathed profiles, boxes and hanging ropes. Ported from the galleon
// branch's mesh.ts; pure arithmetic (three's math classes only, no renderer), so it runs in node for the tests.
//
// Every vertex carries, besides its position, normal and uv, what the shaders need to know about it, set on the
// accumulator as a brush before a shape is drawn:
//   kind    which surface it is (KIND for the body, CLOTH for the sails)
//   ao      how much of the sky reaches it, 0…1 (decks and the bulwarks' insides see less of it)
//   pivot   the mast its yard turns about when the yards are braced (PIVOT), and swing: how much of that turn it
//           takes, 1 on the yard … 0 at a rope's fixed end
//   belly   on a sail, how far the wind has blown this point out of the sail's flat, metres (the shader scales it)
//   radius  on a rope, its radius (the shader widens a rope to about a pixel far off)

import { Matrix3, Matrix4, Quaternion, Euler, Vector3 } from 'three/webgpu';

export const V = (x = 0, y = 0, z = 0): Vector3 => new Vector3(x, y, z);
export const clamp = (v: number, a: number, b: number): number => Math.min(b, Math.max(a, v));
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const sm = (a: number, b: number, x: number): number => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
/** n + 1 numbers from a to b. */
export const range = (a: number, b: number, n: number): number[] => Array.from({ length: n + 1 }, (_, i) => lerp(a, b, i / n));

/** The body's surfaces. */
export const KIND = { planks: 0, paint: 1, dark: 2, deck: 3, spar: 4, gilt: 5, iron: 6 } as const;
/** The cloth's: square sails, the lateen, the pennants. */
export const CLOTH = { square: 0, lateen: 1, pennant: 2 } as const;
/** What a braced yard turns about: nothing, the foremast, the mainmast. */
export const PIVOT = { none: 0, fore: 1, main: 2 } as const;

export class Acc {
  readonly p: number[] = [];
  readonly n: number[] = [];
  readonly uv: number[] = [];
  /** kind, ao, pivot, swing, belly, radius per vertex. */
  readonly a: number[] = [];
  readonly i: number[] = [];
  kind = 0;
  ao = 1;
  pivot = 0;
  swing = 0;
  get count(): number { return this.p.length / 3; }
  get triangles(): number { return this.i.length / 3; }
  vert(p: Vector3, n: Vector3, u: number, v: number, extra: { radius?: number; belly?: number; swing?: number } = {}): number {
    this.p.push(p.x, p.y, p.z);
    this.n.push(n.x, n.y, n.z);
    this.uv.push(u, v);
    this.a.push(this.kind, this.ao, this.pivot, extra.swing ?? this.swing, extra.belly ?? 0, extra.radius ?? 0);
    return this.count - 1;
  }
  tri(a: number, b: number, c: number): void { this.i.push(a, b, c); }
  quad(a: number, b: number, c: number, d: number): void { this.i.push(a, b, c, a, c, d); }
  /** Draws with this brush for the length of `draw`, then puts the old one back. */
  with(brush: Partial<Pick<Acc, 'kind' | 'ao' | 'pivot' | 'swing'>>, draw: () => void): void {
    const old = { kind: this.kind, ao: this.ao, pivot: this.pivot, swing: this.swing };
    Object.assign(this, brush);
    draw();
    Object.assign(this, old);
  }
}

// ---------------------------------------------------------------- frames

const Y = V(0, 1, 0);
/** A matrix whose +y runs along `dir` from `at`, its +z kept as near `hint` as the direction allows. */
export function along(at: Vector3, dir: Vector3, hint = V(0, 0, 1)): Matrix4 {
  const y = dir.clone().normalize();
  let x = new Vector3().crossVectors(y, hint);
  if (x.lengthSq() < 1e-6) x = new Vector3().crossVectors(y, Math.abs(y.x) < 0.9 ? V(1, 0, 0) : V(0, 0, 1));
  x.normalize();
  const z = new Vector3().crossVectors(x, y);
  return new Matrix4().makeBasis(x, y, z).setPosition(at);
}
/** Translation, rotation (Euler XYZ, radians) and scale in one. */
export function trs(at: Vector3, rx = 0, ry = 0, rz = 0, s: Vector3 | number = 1): Matrix4 {
  const q = new Quaternion().setFromEuler(new Euler(rx, ry, rz));
  return new Matrix4().compose(at, q, typeof s === 'number' ? V(s, s, s) : s);
}

// ---------------------------------------------------------------- sheets

/**
 * A surface through a grid of points (rows × columns), normals from its own slopes, wound so the middle normal
 * points along `facing`. `belly`, if given, is each point's belly (sails). Returns whether it was wound against the
 * grid's own order (its normal the negative of (down the rows) × (along them)).
 */
export function sheet(acc: Acc, grid: Vector3[][], uvs: [number, number][][], facing: Vector3 | null, belly?: number[][]): boolean {
  const nr = grid.length, nc = grid[0].length;
  const nrm: Vector3[][] = grid.map((row, i) => row.map((_, j) => {
    const a = grid[Math.min(nr - 1, i + 1)][j].clone().sub(grid[Math.max(0, i - 1)][j]);
    const b = grid[i][Math.min(nc - 1, j + 1)].clone().sub(grid[i][Math.max(0, j - 1)]);
    return new Vector3().crossVectors(a, b).normalize();
  }));
  // where an edge closes to a point (a lateen's peak, a pennant's tip) the cross product vanishes: borrow the nearest
  // good normal
  const good = (n: Vector3) => n.lengthSq() > 0.5;
  nrm.forEach((row, i) => row.forEach((n, j) => {
    if (good(n)) return;
    let best = Infinity;
    nrm.forEach((r, ii) => r.forEach((m, jj) => {
      const d = Math.abs(ii - i) + Math.abs(jj - j);
      if (good(m) && d < best) { best = d; n.copy(m); }
    }));
  }));
  const flip = facing ? nrm[nr >> 1][nc >> 1].dot(facing) < 0 : false;
  const base = acc.count;
  for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) {
    acc.vert(grid[i][j], flip ? nrm[i][j].clone().negate() : nrm[i][j], uvs[i][j][0], uvs[i][j][1], { belly: belly?.[i][j] });
  }
  for (let i = 0; i < nr - 1; i++) for (let j = 0; j < nc - 1; j++) {
    const a = base + i * nc + j, b = a + 1, c = a + nc, d = c + 1;
    if (flip) acc.quad(a, b, d, c); else acc.quad(a, c, d, b);
  }
  return flip;
}

// ---------------------------------------------------------------- tubes

export interface TubeOptions {
  /** Metres along the tube per unit of v. */
  vScale?: number;
  /** Marks it a rope: each vertex carries its radius, for the rope shader's widening. */
  rope?: boolean;
  caps?: boolean;
  /** The swing at each end, interpolated along (ropes from a braced yard to something fixed). */
  swing?: [number, number];
}

/** A tube along a path, its section carried by parallel transport so it never twists. Radius per point or one for all. */
export function tube(acc: Acc, path: Vector3[], radius: number | number[], sides = 6, o: TubeOptions = {}): void {
  const n = path.length;
  if (n < 2 || sides < 2) return;
  const rad = (i: number) => (typeof radius === 'number' ? radius : radius[i]);
  const tan: Vector3[] = path.map((_, i) => path[Math.min(n - 1, i + 1)].clone().sub(path[Math.max(0, i - 1)]).normalize());
  const nor = new Vector3().crossVectors(tan[0], Math.abs(tan[0].y) < 0.95 ? Y : V(1, 0, 0)).normalize();
  const vs = o.vScale ?? 1;
  let len = 0;
  const base = acc.count, ring = sides + 1;
  const swingAt = (i: number) => (o.swing ? lerp(o.swing[0], o.swing[1], i / (n - 1)) : undefined);
  for (let i = 0; i < n; i++) {
    if (i > 0) {
      len += path[i].distanceTo(path[i - 1]);
      const axis = new Vector3().crossVectors(tan[i - 1], tan[i]);
      const s = axis.length();
      if (s > 1e-6) nor.applyAxisAngle(axis.normalize(), Math.asin(Math.min(1, s)) * (tan[i - 1].dot(tan[i]) < 0 ? -1 : 1));
      nor.sub(tan[i].clone().multiplyScalar(nor.dot(tan[i]))).normalize();
    }
    const bin = new Vector3().crossVectors(tan[i], nor);
    for (let k = 0; k <= sides; k++) {
      const a = (k / sides) * Math.PI * 2;
      const d = nor.clone().multiplyScalar(Math.cos(a)).addScaledVector(bin, Math.sin(a));
      acc.vert(path[i].clone().addScaledVector(d, rad(i)), d, k / sides, len / vs, { radius: o.rope ? rad(i) : 0, swing: swingAt(i) });
    }
  }
  for (let i = 0; i < n - 1; i++) for (let k = 0; k < sides; k++) {
    const a = base + i * ring + k;
    acc.quad(a, a + 1, a + ring + 1, a + ring);
  }
  if (o.caps) for (const [i, sgn] of [[0, -1], [n - 1, 1]] as const) {
    const t = tan[i].clone().multiplyScalar(sgn);
    const c = acc.vert(path[i], t, 0.5, len / vs, { swing: swingAt(i) });
    for (let k = 0; k < sides; k++) {
      const a = base + i * ring + k;
      if (sgn > 0) acc.tri(c, a, a + 1); else acc.tri(c, a + 1, a);
    }
  }
}

/** A straight spar from a to b, tapering r0 → r1. */
export function rod(acc: Acc, a: Vector3, b: Vector3, r0: number, r1 = r0, sides = 8, caps = true, vScale = 2): void {
  tube(acc, [a, b], [r0, r1], sides, { caps, vScale });
}

/** A rope from a to b hanging `sag` metres at its middle, in `segs` straight pieces (one if it barely sags). */
export function rope(acc: Acc, a: Vector3, b: Vector3, r: number, sag: number, segs: number, swing?: [number, number]): void {
  const n = sag > 0.01 ? Math.max(1, segs) : 1;
  const pts = range(0, 1, n).map((t) => a.clone().lerp(b, t).add(V(0, -4 * sag * t * (1 - t), 0)));
  tube(acc, pts, r, 3, { rope: true, vScale: 1, swing });
}

// ---------------------------------------------------------------- lathes and boxes

/** A profile [radius, height] spun round +y and placed by `m`. u round, v up the profile in metres over vScale. */
export function lathe(acc: Acc, prof: [number, number][], sides: number, m: Matrix4, vScale = 1): void {
  const nm = new Matrix3().getNormalMatrix(m);
  const base = acc.count, ring = sides + 1;
  let len = 0;
  for (let i = 0; i < prof.length; i++) {
    if (i > 0) len += Math.hypot(prof[i][0] - prof[i - 1][0], prof[i][1] - prof[i - 1][1]);
    const a = prof[Math.max(0, i - 1)], b = prof[Math.min(prof.length - 1, i + 1)];
    const dr = b[0] - a[0], dy = b[1] - a[1];
    for (let k = 0; k <= sides; k++) {
      const t = (k / sides) * Math.PI * 2, c = Math.cos(t), s = Math.sin(t);
      const p = V(prof[i][0] * c, prof[i][1], prof[i][0] * s).applyMatrix4(m);
      acc.vert(p, V(dy * c, -dr, dy * s).applyMatrix3(nm).normalize(), k / sides, len / vScale);
    }
  }
  for (let i = 0; i < prof.length - 1; i++) for (let k = 0; k < sides; k++) {
    const a = base + i * ring + k;
    acc.quad(a, a + ring, a + ring + 1, a + 1);
  }
}

/** A box of size (sx, sy, sz) centred on m's origin; uvs in metres over `uvScale`. */
export function box(acc: Acc, m: Matrix4, sx: number, sy: number, sz: number, uvScale = 1): void {
  const nm = new Matrix3().getNormalMatrix(m);
  const faces: [Vector3, Vector3, Vector3, number, number][] = [
    [V(1, 0, 0), V(0, 0, -1), V(0, 1, 0), sz, sy], [V(-1, 0, 0), V(0, 0, 1), V(0, 1, 0), sz, sy],
    [V(0, 1, 0), V(1, 0, 0), V(0, 0, -1), sx, sz], [V(0, -1, 0), V(1, 0, 0), V(0, 0, 1), sx, sz],
    [V(0, 0, 1), V(1, 0, 0), V(0, 1, 0), sx, sy], [V(0, 0, -1), V(-1, 0, 0), V(0, 1, 0), sx, sy],
  ];
  const h = V(sx / 2, sy / 2, sz / 2);
  for (const [n, u, w, du, dw] of faces) {
    const c = n.clone().multiply(h), uu = u.clone().multiply(h), ww = w.clone().multiply(h);
    const nn = n.clone().applyMatrix3(nm).normalize();
    const b = acc.count;
    for (const [a, bb] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const p = c.clone().addScaledVector(uu, a).addScaledVector(ww, bb).applyMatrix4(m);
      acc.vert(p, nn, (((a + 1) / 2) * du) / uvScale, (((bb + 1) / 2) * dw) / uvScale);
    }
    acc.quad(b, b + 1, b + 2, b + 3);
  }
}

/** A box spanning from a to b along its length (y), w wide (x) and d deep (z), z toward `hint`. */
export function beam(acc: Acc, a: Vector3, b: Vector3, w: number, d: number, hint = V(0, 0, 1), uvScale = 1): void {
  const dir = b.clone().sub(a);
  box(acc, along(a.clone().lerp(b, 0.5), dir, hint), w, dir.length(), d, uvScale);
}

/** A flat convex polygon, facing n. */
export function fan(acc: Acc, pts: Vector3[], n: Vector3, uvScale = 1): void {
  const c = pts.reduce((s, p) => s.add(p), V()).multiplyScalar(1 / pts.length);
  const t = pts[0].clone().sub(c).normalize(), b = new Vector3().crossVectors(n, t);
  const uv = (p: Vector3): [number, number] => { const d = p.clone().sub(c); return [d.dot(t) / uvScale, d.dot(b) / uvScale]; };
  const ci = acc.vert(c, n, ...uv(c));
  const first = acc.count;
  for (const p of pts) acc.vert(p, n, ...uv(p));
  const ccw = new Vector3().crossVectors(pts[0].clone().sub(c), pts[1].clone().sub(c)).dot(n) > 0;
  for (let k = 0; k < pts.length; k++) {
    const a = first + k, b = first + ((k + 1) % pts.length);
    if (ccw) acc.tri(ci, a, b); else acc.tri(ci, b, a);
  }
}

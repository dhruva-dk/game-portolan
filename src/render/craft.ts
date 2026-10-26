import * as THREE from 'three';

const TAU = Math.PI * 2;

export const smoothstep = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export interface Sink {
  vert(p: THREE.Vector3, n: THREE.Vector3, s: number, t: number, i: number): number;
  tri(a: number, b: number, c: number): void;
}

const _p = new THREE.Vector3(), _n = new THREE.Vector3(), _r = new THREE.Vector3(), _q = new THREE.Vector3();
const _b = new THREE.Vector3(), _du = new THREE.Vector3(), _dv = new THREE.Vector3();

export interface TubeOpt {
  shape?: (a: number, i: number) => number;
  caps?: readonly [number | null, number | null];
}

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

export function lathe(out: Sink, prof: readonly (readonly number[])[], seg: number, a0 = 0, a1 = TAU): void {
  const np = prof.length, L = [0], rows: number[] = [];
  for (let i = 1; i < np; i++) L.push(L[i - 1] + Math.hypot(prof[i][0] - prof[i - 1][0], prof[i][1] - prof[i - 1][1]));
  for (let i = 0; i < np; i++) {
    const i0 = Math.max(i - 1, 0), i1 = Math.min(i + 1, np - 1), [r, y] = prof[i];
    const dr = prof[i1][0] - prof[i0][0], dy = prof[i1][1] - prof[i0][1];
    for (let k = 0; k <= seg; k++) {
      const a = a0 + ((a1 - a0) * k) / seg, c = Math.cos(a), s = Math.sin(a);
      _p.set(r * c, y, -r * s);
      _n.set(dy * c, -dr, -dy * s).normalize();
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
export const crease = (prof: number[][]): number[][] => prof.flatMap((q, j) => (j && j < prof.length - 1 ? [q, q] : [q]));

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

export function grid(out: Sink, us: readonly number[], vs: readonly number[], at: (u: number, v: number, o: THREE.Vector3) => THREE.Vector3): void {
  const e = 1e-4, v0: number[] = [];
  for (let j = 0; j < vs.length; j++) {
    for (let i = 0; i < us.length; i++) {
      const u = us[i], v = vs[j];
      at(Math.min(u + e, us[us.length - 1]), v, _du).sub(at(Math.max(u - e, us[0]), v, _r));
      at(u, Math.min(v + e, vs[vs.length - 1]), _dv).sub(at(u, Math.max(v - e, vs[0]), _r));
      _n.crossVectors(_du, _dv);
      if (_n.lengthSq() < 1e-20) _n.set(0, 1, 0);
      const k = out.vert(at(u, v, _p), _n.normalize(), u, v, 0);
      if (!i) v0.push(k);
    }
  }
  for (let j = 0; j + 1 < vs.length; j++) {
    for (let i = 0; i + 1 < us.length; i++) {
      const a = v0[j] + i, b = v0[j + 1] + i;
      out.tri(a, a + 1, b + 1);
      out.tri(a, b + 1, b);
    }
  }
}

export function sweep(out: Sink, path: readonly THREE.Vector3[], side: readonly THREE.Vector3[], prof: readonly number[], closed: boolean): void {
  const np = prof.length / 2, segs = closed ? np : np - 1, L = [0];
  for (let i = 1; i < path.length; i++) L.push(L[i - 1] + path[i].distanceTo(path[i - 1]));
  const T = new THREE.Vector3(), U = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3();
  for (let k = 0; k < segs; k++) {
    const k1 = (k + 1) % np, base: number[] = [];
    for (let i = 0; i < path.length; i++) {
      T.subVectors(path[Math.min(i + 1, path.length - 1)], path[Math.max(i - 1, 0)]).normalize();
      U.crossVectors(side[i], T).normalize();
      const across = _q.crossVectors(T, U).normalize();
      a.copy(path[i]).addScaledVector(across, prof[2 * k]).addScaledVector(U, prof[2 * k + 1]);
      b.copy(path[i]).addScaledVector(across, prof[2 * k1]).addScaledVector(U, prof[2 * k1 + 1]);
      _n.subVectors(b, a).cross(T).normalize();
      base.push(out.vert(a, _n, L[i], k, k), out.vert(b, _n, L[i], k + 1, k1));
    }
    for (let i = 0; i + 1 < path.length; i++) {
      const p = base[2 * i], q = base[2 * i + 1], r = base[2 * i + 2], s = base[2 * i + 3];
      out.tri(p, r, s);
      out.tri(p, s, q);
    }
  }
}

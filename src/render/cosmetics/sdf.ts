// Signed distance shapes for flat heraldry: the emblems on sails and on the rivals page.
// Ported from the old game's src/career/emblems.ts and extended with outlines drawn as paths and with tapered strokes,
// so animals and plants can be drawn as silhouettes. Coordinates run -1..1 with y up. No three.js here, so the
// shapes render in Node too.

export type SDF = (x: number, y: number) => number;

const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));

/** How much of a pixel `px` wide a shape covers, from its distance. */
export const cover = (d: number, px: number) => clamp(0.5 - d / px, 0, 1);
/** A line of half-width `hw` along a shape's edge. */
export const edge = (d: number, px: number, hw: number) => clamp((hw - Math.abs(d)) / px + 0.5, 0, 1);

export const circle = (cx: number, cy: number, r: number): SDF => (x, y) => Math.hypot(x - cx, y - cy) - r;
export const ring = (cx: number, cy: number, r: number, w: number): SDF => (x, y) => Math.abs(Math.hypot(x - cx, y - cy) - r) - w;
export const ellipse = (cx: number, cy: number, rx: number, ry: number, a = 0): SDF => {
  const c = Math.cos(a), s = Math.sin(a);
  return (x, y) => {
    const dx = x - cx, dy = y - cy, u = c * dx + s * dy, v = -s * dx + c * dy;
    return (Math.hypot(u / rx, v / ry) - 1) * Math.min(rx, ry);
  };
};
export const seg = (ax: number, ay: number, bx: number, by: number, ra: number, rb = ra): SDF => {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1e-9;
  return (x, y) => {
    const t = clamp(((x - ax) * dx + (y - ay) * dy) / l2, 0, 1);
    return Math.hypot(x - ax - dx * t, y - ay - dy * t) - (ra + (rb - ra) * t);
  };
};
export const union = (...fs: SDF[]): SDF => (x, y) => {
  let d = Infinity;
  for (const f of fs) d = Math.min(d, f(x, y));
  return d;
};
/** A polyline through flat [x0, y0, x1, y1, ...], its radius tapering from ra to rb. */
export const path = (p: readonly number[], ra: number, rb = ra): SDF => {
  const n = p.length / 2 - 1;
  return union(...Array.from({ length: n }, (_, i) => seg(p[2 * i], p[2 * i + 1], p[2 * i + 2], p[2 * i + 3], ra + ((rb - ra) * i) / n, ra + ((rb - ra) * (i + 1)) / n)));
};
/** A filled polygon through flat [x0, y0, x1, y1, ...]. */
export const poly = (p: readonly number[], cull = 0.1): SDF => {
  const n = p.length / 2, xs = p.filter((_, i) => i % 2 === 0), ys = p.filter((_, i) => i % 2 === 1);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  return (x, y) => {
    const out = Math.hypot(Math.max(x0 - x, 0, x - x1), Math.max(y0 - y, 0, y - y1));
    if (out > cull) return out;
    let d = Infinity, s = 1;
    for (let i = 0, j = n - 1; i < n; j = i, i++) {
      const vx = p[2 * i], vy = p[2 * i + 1], ex = p[2 * j] - vx, ey = p[2 * j + 1] - vy, wx = x - vx, wy = y - vy;
      const t = clamp((wx * ex + wy * ey) / (ex * ex + ey * ey || 1e-9), 0, 1), bx = wx - ex * t, by = wy - ey * t;
      d = Math.min(d, bx * bx + by * by);
      const c1 = y >= vy, c2 = y < p[2 * j + 1], c3 = ex * wy > ey * wx;
      if ((c1 && c2 && c3) || (!c1 && !c2 && !c3)) s = -s;
    }
    return s * Math.sqrt(d);
  };
};
export const cut = (a: SDF, ...b: SDF[]): SDF => { const u = union(...b); return (x, y) => Math.max(a(x, y), -u(x, y)); };
export const inter = (a: SDF, b: SDF): SDF => (x, y) => Math.max(a(x, y), b(x, y));
export const rot = (f: SDF, a: number): SDF => { const c = Math.cos(a), s = Math.sin(a); return (x, y) => f(c * x + s * y, -s * x + c * y); };
export const move = (f: SDF, dx: number, dy: number): SDF => (x, y) => f(x - dx, y - dy);
export const scale = (f: SDF, k: number): SDF => (x, y) => f(x / k, y / k) * k;
export const mirrorX = (f: SDF): SDF => (x, y) => f(Math.abs(x), y);
export const flipX = (f: SDF): SDF => (x, y) => f(-x, y);
/** n copies of a shape round the centre. */
export const around = (f: SDF, n: number, a0 = 0): SDF => {
  const k = (2 * Math.PI) / n;
  return (x, y) => { const a = Math.atan2(y, x) - a0, r = Math.hypot(x, y), b = a - k * Math.round(a / k); return f(r * Math.cos(b), r * Math.sin(b)); };
};
export const rect = (cx: number, cy: number, hx: number, hy: number, r = 0): SDF => (x, y) => {
  const qx = Math.abs(x - cx) - hx + r, qy = Math.abs(y - cy) - hy + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
};
/** A star's outline: n points, outer radius (or a cycle of them) and inner radius. */
export const star = (n: number, ro: number | readonly number[], ri: number, a0 = Math.PI / 2): number[] =>
  Array.from({ length: 2 * n }, (_, k) => {
    const r = k % 2 ? ri : typeof ro === 'number' ? ro : ro[(k / 2) % ro.length], a = a0 + (k * Math.PI) / n;
    return [r * Math.cos(a), r * Math.sin(a)];
  }).flat();
export const hexagon = (r: number): SDF => (x, y) => {
  let px = Math.abs(x), py = Math.abs(y);
  const kx = -0.866025404, ky = 0.5, kz = 0.577350269, d = 2 * Math.min(kx * px + ky * py, 0);
  px -= d * kx;
  py -= d * ky;
  px -= clamp(px, -kz * r, kz * r);
  py -= r;
  return Math.hypot(px, py) * Math.sign(py);
};
export const above = (y0: number): SDF => (_x, y) => y0 - y;
export const below = (y0: number): SDF => (_x, y) => y - y0;
/** An Archimedean spiral line, `turns` round, out to rMax, half-width w. */
export const spiral = (turns: number, rMax: number, w: number): SDF => {
  const tMax = turns * 2 * Math.PI, b = rMax / tMax;
  return (x, y) => {
    const r = Math.hypot(x, y);
    let a = Math.atan2(y, x), d = Math.hypot(x - rMax * Math.cos(tMax), y - rMax * Math.sin(tMax));
    if (a < 0) a += 2 * Math.PI;
    for (let t = a; t <= tMax; t += 2 * Math.PI) d = Math.min(d, Math.abs(r - b * t));
    return d - w;
  };
};

/** Points along a curve given as a function of t in 0..1. */
export const trace = (f: (t: number) => readonly [number, number], n = 24): number[] =>
  Array.from({ length: n + 1 }, (_, i) => f(i / n)).flat();
/** A stroke along a curve, tapering from ra to rb: tails, necks, tentacles, stems. */
export const stroke = (f: (t: number) => readonly [number, number], ra: number, rb = ra, n = 24): SDF => path(trace(f, n), ra, rb);
/** A quadratic Bezier's points. */
export const bez = (a: readonly number[], b: readonly number[], c: readonly number[], n: number): number[] =>
  Array.from({ length: n + 1 }, (_, i) => { const t = i / n, s = 1 - t; return [s * s * a[0] + 2 * s * t * b[0] + t * t * c[0], s * s * a[1] + 2 * s * t * b[1] + t * t * c[1]]; }).flat();

/**
 * Outlines from a small path language: `M x y`, `L x y`, `Q cx cy x y`, `C c1x c1y c2x c2y x y` and `Z`, absolute,
 * y up. Each subpath is one closed polygon.
 */
export function outlines(d: string, steps = 8): number[][] {
  const tok = d.trim().split(/[\s,]+/), out: number[][] = [];
  let cur: number[] = [], i = 0, x = 0, y = 0;
  const num = () => parseFloat(tok[i++]);
  while (i < tok.length) {
    const c = tok[i++];
    if (c === 'M') { if (cur.length) out.push(cur); x = num(); y = num(); cur = [x, y]; }
    else if (c === 'L') { x = num(); y = num(); cur.push(x, y); }
    else if (c === 'Q') {
      const cx = num(), cy = num(), ex = num(), ey = num();
      cur.push(...bez([x, y], [cx, cy], [ex, ey], steps).slice(2));
      x = ex; y = ey;
    } else if (c === 'C') {
      const ax = num(), ay = num(), bx = num(), by = num(), ex = num(), ey = num();
      for (let k = 1; k <= steps; k++) {
        const t = k / steps, s = 1 - t;
        cur.push(s * s * s * x + 3 * s * s * t * ax + 3 * s * t * t * bx + t * t * t * ex, s * s * s * y + 3 * s * s * t * ay + 3 * s * t * t * by + t * t * t * ey);
      }
      x = ex; y = ey;
    } else if (c === 'Z') { if (cur.length) out.push(cur); cur = []; }
    else throw new Error(`sdf path: unknown command ${c}`);
  }
  if (cur.length) out.push(cur);
  return out;
}
/** A filled silhouette from a path; several subpaths are unioned. */
export const shape = (d: string): SDF => union(...outlines(d).map((p) => poly(p)));

/**
 * Renders a shape into an RGBA buffer, `size` pixels square, covering -extent..extent. Each channel is a coverage:
 * R the fill, G the fill's outline (half-width `line`), B a soft glow round it, A the fill and outline together.
 */
export function rasterise(f: SDF, size: number, extent = 1, line = 0.02, glow = 0.12): Uint8ClampedArray {
  const out = new Uint8ClampedArray(4 * size * size), px = (2 * extent) / size;
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
    const x = (i + 0.5) * px - extent, y = extent - (j + 0.5) * px, d = f(x, y), o = 4 * (j * size + i);
    const fill = cover(d, px), ink = edge(d, px, line);
    out[o] = 255 * fill;
    out[o + 1] = 255 * ink;
    out[o + 2] = 255 * clamp(1 - Math.max(d, 0) / glow, 0, 1) ** 2;
    out[o + 3] = 255 * Math.max(fill, ink);
  }
  return out;
}

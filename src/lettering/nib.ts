// The broad-edged nib and the paper it writes on. Pure arithmetic, so the lettering is identical every run.
//
// A broad nib is a small flat rectangle held at a fixed angle. The mark it leaves along a path is the path swept by
// that rectangle (the Minkowski sum), so a stroke is thick where it moves across the nib's edge and a hairline where
// it moves along it — the whole contrast of the chancery hand, from direction alone. Each flattened segment of a path
// sweeps a convex polygon (the hull of the rectangle at both ends); the union of a stroke's polygons is its mark.
//
// The raster accumulates exact anti-aliased area coverage (signed-area accumulation, as font-rs does): every polygon is
// oriented the same way and the winding is clamped to 1, so the union needs no clipping, the shared edges of
// consecutive segments cancel exactly (no seams), and the result is crisp at any size. A second pass records, per
// pixel, when the nib first passed over it (for the stroke-by-stroke reveal) and how loaded with ink it was.

/** Path operation, absolute coordinates: M x y | L x y | Q x1 y1 x y | C x1 y1 x2 y2 x y. */
export interface PathOp {
  readonly op: 'M' | 'L' | 'Q' | 'C';
  readonly p: readonly number[];
}

export interface Nib {
  /** Width of the nib's edge and its thickness, px. */
  readonly width: number;
  readonly thickness: number;
  /** Angle of the edge, radians, rising to the right on a y-down page. */
  readonly angle: number;
}

/** A path flattened to a polyline: points (x, y pairs) and the arc length at each point. */
export interface Polyline {
  readonly pts: number[];
  readonly len: number[];
}

/** Flattens path operations into a polyline within `tolerance` px of the curves, with no segment longer than `maxStep`. */
export function flatten(ops: readonly PathOp[], tolerance: number, maxStep: number): Polyline {
  const pts: number[] = [], len: number[] = [];
  let x = 0, y = 0;
  const push = (px: number, py: number) => {
    if (pts.length) {
      const d = Math.hypot(px - x, py - y);
      if (d < 1e-6) return;
      len.push(len[len.length - 1] + d);
    } else len.push(0);
    pts.push(px, py);
    x = px; y = py;
  };
  for (const { op, p } of ops) {
    if (op === 'M') {
      if (pts.length) throw new Error('a stroke is one pen movement: M only at its start');
      push(p[0], p[1]);
    } else if (op === 'L') {
      const n = Math.max(1, Math.ceil(Math.hypot(p[0] - x, p[1] - y) / maxStep)), x0 = x, y0 = y;
      for (let i = 1; i <= n; i++) push(x0 + (p[0] - x0) * (i / n), y0 + (p[1] - y0) * (i / n));
    } else if (op === 'Q') {
      const x0 = x, y0 = y, dd = Math.hypot(x0 - 2 * p[0] + p[2], y0 - 2 * p[1] + p[3]);
      const n = segments(dd / 4, tolerance, Math.hypot(p[0] - x0, p[1] - y0) + Math.hypot(p[2] - p[0], p[3] - p[1]), maxStep);
      for (let i = 1; i <= n; i++) {
        const t = i / n, u = 1 - t;
        push(u * u * x0 + 2 * u * t * p[0] + t * t * p[2], u * u * y0 + 2 * u * t * p[1] + t * t * p[3]);
      }
    } else {
      const x0 = x, y0 = y;
      const dd = Math.max(Math.hypot(x0 - 2 * p[0] + p[2], y0 - 2 * p[1] + p[3]), Math.hypot(p[0] - 2 * p[2] + p[4], p[1] - 2 * p[3] + p[5]));
      const chord = Math.hypot(p[0] - x0, p[1] - y0) + Math.hypot(p[2] - p[0], p[3] - p[1]) + Math.hypot(p[4] - p[2], p[5] - p[3]);
      const n = segments(dd * 0.75, tolerance, chord, maxStep);
      for (let i = 1; i <= n; i++) {
        const t = i / n, u = 1 - t, a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
        push(a * x0 + b * p[0] + c * p[2] + d * p[4], a * y0 + b * p[1] + c * p[3] + d * p[5]);
      }
    }
  }
  return { pts, len };
}

/** Uniform subdivisions keeping a curve with second-difference bound `bound` within tolerance, and steps short. */
function segments(bound: number, tolerance: number, chord: number, maxStep: number): number {
  return Math.min(512, Math.max(1, Math.ceil(Math.sqrt(bound / tolerance)), Math.ceil(chord / maxStep)));
}

/**
 * The nib swept along a polyline: calls `out` with one convex polygon (x, y pairs, positively oriented) per segment,
 * the segment's index, and its end points. `widthAt(i)` scales the nib's width at point i (a swash lifted onto the
 * nib's corner); the thickness never drops below the nib's own.
 */
export function sweep(line: Polyline, nib: Nib, widthAt: (i: number) => number, out: (poly: number[], i: number) => void): void {
  const { pts } = line;
  const ux = Math.cos(nib.angle) * 0.5, uy = -Math.sin(nib.angle) * 0.5;                // half the edge, per unit width
  const vx = Math.sin(nib.angle) * nib.thickness * 0.5, vy = Math.cos(nib.angle) * nib.thickness * 0.5; // half the thickness
  const corners = new Array<number>(16);
  const n = pts.length / 2;
  if (n === 1) {
    // a touch of the pen: the nib's own rectangle
    const w = nib.width * widthAt(0);
    out(hull(rect(corners, 0, pts[0], pts[1], ux * w, uy * w, vx, vy), 8), 0);
    return;
  }
  for (let i = 0; i + 1 < n; i++) {
    const w0 = nib.width * widthAt(i), w1 = nib.width * widthAt(i + 1);
    rect(corners, 0, pts[2 * i], pts[2 * i + 1], ux * w0, uy * w0, vx, vy);
    rect(corners, 8, pts[2 * i + 2], pts[2 * i + 3], ux * w1, uy * w1, vx, vy);
    out(hull(corners, 16), i);
  }
}

function rect(c: number[], at: number, x: number, y: number, ux: number, uy: number, vx: number, vy: number): number[] {
  c[at] = x + ux + vx; c[at + 1] = y + uy + vy;
  c[at + 2] = x - ux + vx; c[at + 3] = y - uy + vy;
  c[at + 4] = x - ux - vx; c[at + 5] = y - uy - vy;
  c[at + 6] = x + ux - vx; c[at + 7] = y + uy - vy;
  return c;
}

/** Convex hull (monotone chain) of the first `count` / 2 points, anticlockwise in x-right, y-up terms. */
function hull(c: readonly number[], count: number): number[] {
  const idx: number[] = [];
  for (let i = 0; i < count; i += 2) idx.push(i);
  idx.sort((a, b) => c[a] - c[b] || c[a + 1] - c[b + 1]);
  const cross = (o: number, a: number, b: number) => (c[a] - c[o]) * (c[b + 1] - c[o + 1]) - (c[a + 1] - c[o + 1]) * (c[b] - c[o]);
  const h: number[] = [];
  for (const pass of [idx, [...idx].reverse()]) {
    const start = h.length;
    for (const i of pass) {
      while (h.length >= start + 2 && cross(h[h.length - 2], h[h.length - 1], i) <= 0) h.pop();
      h.push(i);
    }
    h.pop();
  }
  const poly: number[] = [];
  for (const i of h) poly.push(c[i], c[i + 1]);
  return poly;
}

/** Coverage, writing time and ink load of strokes on a page of `width` × `height` px. */
export class Raster {
  readonly width: number;
  readonly height: number;
  private readonly acc: Float32Array;
  /** When the nib first passed over each pixel (Infinity: never) and the ink load it carried then. */
  readonly when: Float32Array;
  readonly load: Float32Array;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.acc = new Float32Array(width * height + 4);
    this.when = new Float32Array(width * height).fill(Infinity);
    this.load = new Float32Array(width * height);
  }

  /** Adds a convex polygon's area coverage. All polygons must lie inside the page. */
  fill(poly: readonly number[]): void {
    const n = poly.length;
    for (let i = 0; i < n; i += 2) {
      const j = (i + 2) % n;
      this.line(poly[i], poly[i + 1], poly[j], poly[j + 1]);
    }
  }

  /**
   * Marks the pixels within `grow` px of a convex polygon with the time and ink load of the nib there, keeping the
   * earliest pass. Time and load run linearly from (t0, l0) at point (x0, y0) to (t1, l1) at (x1, y1).
   */
  paint(poly: readonly number[], grow: number, x0: number, y0: number, x1: number, y1: number, t0: number, t1: number, l0: number, l1: number): void {
    const n = poly.length, w = this.width;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let i = 0; i < n; i += 2) {
      minX = Math.min(minX, poly[i]); maxX = Math.max(maxX, poly[i]);
      minY = Math.min(minY, poly[i + 1]); maxY = Math.max(maxY, poly[i + 1]);
    }
    const dx = x1 - x0, dy = y1 - y0, dd = dx * dx + dy * dy || 1;
    const ex: number[] = [], ey: number[] = [], ec: number[] = [];
    for (let i = 0; i < n; i += 2) {
      const j = (i + 2) % n, lx = poly[j] - poly[i], ly = poly[j + 1] - poly[i + 1], l = Math.hypot(lx, ly) || 1;
      // inward normal of an anticlockwise edge, and the offset so that dot(n, p) + c is the distance inside
      ex.push(-ly / l); ey.push(lx / l); ec.push((ly * poly[i] - lx * poly[i + 1]) / l + grow);
    }
    const xa = Math.max(0, Math.floor(minX - grow)), xb = Math.min(w - 1, Math.ceil(maxX + grow));
    const ya = Math.max(0, Math.floor(minY - grow)), yb = Math.min(this.height - 1, Math.ceil(maxY + grow));
    for (let y = ya; y <= yb; y++) {
      const py = y + 0.5;
      for (let x = xa; x <= xb; x++) {
        const px = x + 0.5;
        let inside = true;
        for (let k = 0; k < ex.length && inside; k++) inside = ex[k] * px + ey[k] * py + ec[k] >= 0;
        if (!inside) continue;
        const f = Math.min(1, Math.max(0, ((px - x0) * dx + (py - y0) * dy) / dd)), t = t0 + (t1 - t0) * f;
        const at = y * w + x;
        if (t < this.when[at]) {
          this.when[at] = t;
          this.load[at] = l0 + (l1 - l0) * f;
        }
      }
    }
  }

  /** The coverage of everything filled, 0–1 per pixel. */
  coverage(): Float32Array {
    const out = new Float32Array(this.width * this.height);
    let a = 0;
    for (let i = 0; i < out.length; i++) {
      a += this.acc[i];
      out[i] = Math.min(1, Math.abs(a));
    }
    return out;
  }

  // Signed-area accumulation of one edge (after Raph Levien's font-rs): each pixel cell receives the area the edge
  // sweeps across it, signed by direction; a running sum along each row then yields the winding coverage.
  private line(ax: number, ay: number, bx: number, by: number): void {
    if (ay === by) return;
    const dir = ay < by ? 1 : -1;
    const x0 = dir > 0 ? ax : bx, y0 = dir > 0 ? ay : by, x1 = dir > 0 ? bx : ax, y1 = dir > 0 ? by : ay;
    const dxdy = (x1 - x0) / (y1 - y0), w = this.width, a = this.acc;
    let x = x0;
    for (let y = Math.max(0, Math.floor(y0)); y < Math.min(this.height, Math.ceil(y1)); y++) {
      const row = y * w;
      const dy = Math.min(y + 1, y1) - Math.max(y, y0);
      const xnext = x + dxdy * dy, d = dy * dir;
      const xl = Math.min(x, xnext), xr = Math.max(x, xnext);
      const xlf = Math.floor(xl), xli = xlf, xri = Math.ceil(xr);
      if (xri <= xli + 1) {
        const xmf = 0.5 * (x + xnext) - xlf;
        a[row + xli] += d - d * xmf;
        a[row + xli + 1] += d * xmf;
      } else {
        const sInv = 1 / (xr - xl), x0f = xl - xlf;
        const a0 = 0.5 * sInv * (1 - x0f) * (1 - x0f);
        const x1f = xr - xri + 1, am = 0.5 * sInv * x1f * x1f;
        a[row + xli] += d * a0;
        if (xri === xli + 2) a[row + xli + 1] += d * (1 - a0 - am);
        else {
          const a1 = sInv * (1.5 - x0f);
          a[row + xli + 1] += d * (a1 - a0);
          for (let xi = xli + 2; xi < xri - 1; xi++) a[row + xi] += d * sInv;
          const a2 = a1 + (xri - xli - 3) * sInv;
          a[row + xri - 1] += d * (1 - a2 - am);
        }
        a[row + xri] += d * am;
      }
      x = xnext;
    }
  }
}

/** Blurs a field in place with `passes` box blurs of radius r (≈ a gaussian), returning it. */
export function blur(f: Float32Array, width: number, height: number, r: number, passes = 2): Float32Array {
  const tmp = new Float32Array(Math.max(width, height));
  const run = (start: number, stride: number, n: number) => {
    for (let i = 0; i < n; i++) tmp[i] = f[start + i * stride];
    let sum = 0;
    for (let i = -r; i <= r; i++) sum += tmp[Math.min(n - 1, Math.max(0, i))];
    for (let i = 0; i < n; i++) {
      f[start + i * stride] = sum / (2 * r + 1);
      sum += tmp[Math.min(n - 1, i + r + 1)] - tmp[Math.max(0, i - r)];
    }
  };
  for (let p = 0; p < passes; p++) {
    for (let y = 0; y < height; y++) run(y * width, 1, width);
    for (let x = 0; x < width; x++) run(x, width, height);
  }
  return f;
}

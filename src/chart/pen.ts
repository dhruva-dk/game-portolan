// The quill. Every line in the interface is a stroke with a start and an end, so anything drawn can ink itself in:
// draw it with t below 1 and only the first t of each stroke is laid, a bead of wet ink at the nib.
//
// A stroke is laid the way a cut quill lays it:
// - the hand wanders: a tremor of a third of a pixel every few pixels and a slow drift on long lines, seeded, so a
//   line is the same line each time it is drawn and no two lines are alike;
// - the nib is broad: the stroke is thick across the nib's edge and thin along it, so an upstroke is a hairline;
// - it enters light, swells where the hand presses, and pools where the quill stops, a blot darker than the line;
// - the ink soaks into the paper's grain (paper.ts): thinner on the fibres that stand up, wicking out along the ones
//   it crosses, so its edge feathers rather than cuts.
// Rules (ruled lines, hatching, ticks, rhumbs) are cheaper: one even width, the same tremor, one path for many.
// Washes are watercolour: laid a hair off the ink line, granulating in the hollows, their pigment dried to a darker
// rim at the edge. Gilt is leaf, lit from the top left.
//
// The pen carries two moods the motion and the press set: `dark` (a pressed thing's ink darkens) and `dry` (ink
// fading out as it dries away).
import { INKS, rgbOf, type InkName } from './inks.ts';
import { clamp, noise1 } from './noise.ts';
import type { Paper } from './paper.ts';

/** Flat points: x0, y0, x1, y1, ... */
export type Pts = number[];

export type Weight = 'hair' | 'fine' | 'bold';

/** The three line widths, in CSS pixels. */
export interface Widths {
  hair: number;
  fine: number;
  bold: number;
}

export interface LineStyle {
  w?: number | Weight;
  ink?: InkName | string;
  alpha?: number;
  /** Broad-nib contrast, 0 (a round pen) to 1. */
  nib?: number;
  /** The nib's edge, radians from the x axis (y down). */
  angle?: number;
  /** Tremor, in pixels. */
  wobble?: number;
  /** Slow wander on long lines, in pixels. */
  drift?: number;
  /** Length of the light entry, in pixels. */
  taper?: number;
  /** How much the quill pools where it stops, 0..1. */
  pool?: number;
  /** How far the ink wicks into the fibres round the line, in pixels. */
  wick?: number;
  seed?: number;
}

export interface WashStyle {
  alpha?: number;
  /** The rim the pigment dries to, 0..1. */
  edge?: number;
  /** Granulation in the hollows, 0..1. */
  gran?: number;
  /** Laid a hair off the line, in pixels. */
  shift?: readonly [number, number];
}

const ease = (t: number) => 1 - (1 - t) * (1 - t);

export class Pen {
  g!: CanvasRenderingContext2D;
  readonly paper: Paper;
  dpr: number;
  widths: Widths;
  /** Where the paper's grain is anchored on the target, device pixels. */
  ox = 0;
  oy = 0;
  /** A pressed thing's ink darkens, 0..1. */
  dark = 0;
  /** Ink drying away, 0..1. */
  dry = 0;
  // scratch, grown as needed: resampled points, their lengths, widths and normals
  #x = new Float64Array(256);
  #y = new Float64Array(256);
  #s = new Float64Array(256);
  #w = new Float64Array(256);
  #nx = new Float64Array(256);
  #ny = new Float64Array(256);

  constructor(paper: Paper, dpr: number, widths: Widths) {
    this.paper = paper;
    this.dpr = dpr;
    this.widths = widths;
  }

  /** Draws on this context from now on, the grain anchored at device pixel (ox, oy). */
  on(g: CanvasRenderingContext2D, ox = 0, oy = 0): this {
    this.g = g;
    this.ox = ox;
    this.oy = oy;
    return this;
  }

  width(w: number | Weight | undefined): number {
    return typeof w === 'number' ? w : this.widths[w ?? 'fine'];
  }

  /** Runs `draw` with the pen's moods set, then puts them back. */
  mood(m: { dark?: number; dry?: number }, draw: () => void): void {
    const d = this.dark, y = this.dry;
    if (m.dark !== undefined) this.dark = m.dark;
    if (m.dry !== undefined) this.dry = m.dry;
    try { draw(); } finally { this.dark = d; this.dry = y; }
  }

  #grow(n: number): void {
    if (this.#x.length >= n) return;
    const m = Math.max(n, this.#x.length * 2);
    this.#x = new Float64Array(m);
    this.#y = new Float64Array(m);
    this.#s = new Float64Array(m);
    this.#w = new Float64Array(m);
    this.#nx = new Float64Array(m);
    this.#ny = new Float64Array(m);
  }

  /** The ink's body pattern, anchored on the paper. */
  #body(ink: string): CanvasPattern {
    return this.paper.anchor(this.g, this.paper.ink(ink), this.ox, this.oy, this.dpr);
  }

  #blend(ink: string): GlobalCompositeOperation {
    return INKS[ink as InkName]?.blend ?? 'multiply';
  }

  /** How dark the moods leave a stroke that would be `a`. */
  #alpha(a: number): number {
    const dry = this.dry > 0 ? Math.pow(1 - clamp(this.dry), 1.4) : 1;
    return clamp(a * (1 + 0.45 * this.dark)) * dry;
  }

  /**
   * One quill stroke along `pts`, its first `t` laid. Returns the length laid, in pixels.
   */
  stroke(pts: ArrayLike<number>, st: LineStyle = {}, t = 1): number {
    if (t <= 0 || pts.length < 2) return 0;
    const g = this.g, inkName = st.ink ?? 'iron', ink = INKS[inkName as InkName];
    let w0 = this.width(st.w) * (1 + 0.08 * this.dark) * (1 - 0.12 * this.dry);
    let alpha = st.alpha ?? ink?.body ?? 0.9;
    // a line thinner than the screen can draw is drawn at the thinnest it can, lighter
    const minDev = 1.15;
    if (w0 * this.dpr < minDev) { alpha *= (w0 * this.dpr) / minDev; w0 = minDev / this.dpr; }
    alpha = this.#alpha(alpha);
    if (alpha <= 0.003) return 0;
    const seed = st.seed ?? ((pts[0] * 7919 + pts[1] * 104729) | 0);
    const nib = st.nib ?? 0.35, angle = st.angle ?? -0.7;
    const wobble = st.wobble ?? 0.32, drift = st.drift ?? 0.7;
    const pool = st.pool ?? 0.55, taper = st.taper ?? w0 * 3.2;

    // lengths along the input
    const n0 = pts.length >> 1;
    let L = 0;
    for (let i = 1; i < n0; i++) L += Math.hypot(pts[2 * i] - pts[2 * i - 2], pts[2 * i + 1] - pts[2 * i - 1]);
    if (L < 0.3) {
      this.dot(pts[0], pts[1], w0 * 0.6, inkName, alpha);
      return 0;
    }
    const h = clamp(w0 * 1.1, 0.9, 2.6);
    const n = Math.max(2, Math.ceil(L / h) + 1);
    this.#grow(n + 2);
    const X = this.#x, Y = this.#y, S = this.#s, W = this.#w, NX = this.#nx, NY = this.#ny;
    // resample evenly
    let seg = 0, segS = 0, segL = Math.hypot(pts[2] - pts[0], pts[3] - pts[1]);
    for (let k = 0; k < n; k++) {
      const s = (k / (n - 1)) * L;
      while (s > segS + segL && seg < n0 - 2) { segS += segL; seg++; segL = Math.hypot(pts[2 * seg + 2] - pts[2 * seg], pts[2 * seg + 3] - pts[2 * seg + 1]); }
      const f = segL > 1e-9 ? clamp((s - segS) / segL) : 0;
      X[k] = pts[2 * seg] + (pts[2 * seg + 2] - pts[2 * seg]) * f;
      Y[k] = pts[2 * seg + 1] + (pts[2 * seg + 3] - pts[2 * seg + 1]) * f;
      S[k] = s;
    }
    // normals, the hand's wander, and the width the nib and the hand give
    const longK = Math.min(1, L / 60);
    for (let k = 0; k < n; k++) {
      const a = Math.max(0, k - 1), b = Math.min(n - 1, k + 1);
      let tx = X[b] - X[a], ty = Y[b] - Y[a];
      const tl = Math.hypot(tx, ty) || 1;
      tx /= tl; ty /= tl;
      NX[k] = -ty; NY[k] = tx;
      const s = S[k];
      const off = wobble * noise1(s / 8 + seed * 0.013, seed) + drift * longK * noise1(s / 70, seed + 7);
      const across = (1 - nib) + nib * Math.abs(Math.sin(Math.atan2(ty, tx) - angle));
      const enter = 0.42 + 0.58 * clamp(s / Math.max(taper, 0.01));
      const swell = 1 + pool * 0.4 * clamp((s - (L - w0 * 2.4)) / (w0 * 2.4));
      const press = 1 + 0.13 * noise1(s / 23, seed + 3);
      W[k] = w0 * across * enter * swell * press;
      X[k] += NX[k] * off;
      Y[k] += NY[k] * off;
    }
    // how far to lay it
    const Lt = t >= 1 ? L : L * t;
    let m = n;
    if (t < 1) {
      m = 1;
      while (m < n && S[m] <= Lt) m++;
      if (m < n) {
        const f = (Lt - S[m - 1]) / Math.max(S[m] - S[m - 1], 1e-9);
        X[m] = X[m - 1] + (X[m] - X[m - 1]) * f;
        Y[m] = Y[m - 1] + (Y[m] - Y[m - 1]) * f;
        W[m] = W[m - 1] + (W[m] - W[m - 1]) * f;
        NX[m] = NX[m - 1]; NY[m] = NY[m - 1];
        m++;
      }
    }
    if (m < 2) return 0;
    const path = new Path2D();
    path.moveTo(X[0] + NX[0] * W[0] * 0.5, Y[0] + NY[0] * W[0] * 0.5);
    for (let k = 1; k < m; k++) path.lineTo(X[k] + NX[k] * W[k] * 0.5, Y[k] + NY[k] * W[k] * 0.5);
    // the round end
    const e = m - 1, ea = Math.atan2(NY[e], NX[e]);
    path.arc(X[e], Y[e], W[e] * 0.5, ea, ea - Math.PI, true);
    for (let k = m - 1; k >= 0; k--) path.lineTo(X[k] - NX[k] * W[k] * 0.5, Y[k] - NY[k] * W[k] * 0.5);
    const sa = Math.atan2(-NY[0], -NX[0]);
    path.arc(X[0], Y[0], W[0] * 0.5, sa, sa - Math.PI, true);
    path.closePath();

    g.save();
    g.globalCompositeOperation = this.#blend(inkName);
    // the wick first, so the body lies over it
    const wick = (st.wick ?? 0.7) * (ink?.wick ?? 0.4);
    if (wick > 0.01) {
      g.globalAlpha = alpha * Math.min(1, wick * 1.7);
      g.strokeStyle = this.paper.anchor(g, this.paper.wick(inkName), this.ox, this.oy, this.dpr);
      g.lineJoin = 'round';
      g.lineWidth = 1.4 + w0 * 0.9;
      g.stroke(path);
    }
    g.globalAlpha = alpha;
    g.fillStyle = this.#body(inkName);
    g.fill(path);
    // a broad stroke dries darker at its edges, where the ink was drawn as it soaked in
    if (w0 * this.dpr > 3.5) {
      g.globalAlpha = alpha * 0.4;
      g.strokeStyle = g.fillStyle;
      g.lineWidth = Math.min(0.9, w0 * 0.22);
      g.stroke(path);
    }
    if (this.dark > 0.02) {
      g.globalAlpha = alpha * 0.4 * this.dark;
      g.fill(path);
    }
    // where the quill touched down, and where it stopped (or where it is now, wet)
    const tipX = X[m - 1], tipY = Y[m - 1], tw = W[m - 1];
    const dx = -NY[m - 1], dy = NX[m - 1];
    if (t < 1) {
      g.globalAlpha = alpha * 0.55;
      g.beginPath();
      g.ellipse(tipX - dx * tw * 0.15, tipY - dy * tw * 0.15, tw * 0.62, tw * 0.5, Math.atan2(dy, dx), 0, Math.PI * 2);
      g.fill();
    } else if (pool > 0.05) {
      g.globalAlpha = alpha * 0.42 * pool;
      g.beginPath();
      g.ellipse(tipX - dx * tw * 0.2, tipY - dy * tw * 0.2, tw * 0.58, tw * 0.44, Math.atan2(dy, dx), 0, Math.PI * 2);
      g.fill();
    }
    if (pool > 0.05) {
      g.globalAlpha = alpha * 0.22 * pool;
      g.beginPath();
      g.arc(X[0], Y[0], W[0] * 0.5, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
    return Lt;
  }

  /** Several strokes, inked in one after another as t runs (each gets an equal share, overlapping a little). */
  strokes(list: readonly ArrayLike<number>[], st: LineStyle = {}, t = 1, overlap = 0.3): void {
    const n = list.length;
    if (!n) return;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * (1 - overlap), b = a + (1 / n) * (1 - overlap) + overlap;
      const lt = t >= 1 ? 1 : clamp((t - a) / (b - a));
      if (lt > 0) this.stroke(list[i], st.seed === undefined ? st : { ...st, seed: st.seed + i * 13 }, lt);
    }
  }

  /**
   * Ruled lines of one even width along each polyline, their first t laid, as one path: hatching, ticks, rhumb lines,
   * the frame. `dash` gives dotted or dashed rules ([0, gap] for round dots).
   */
  rule(list: readonly ArrayLike<number>[], st: LineStyle = {}, t = 1, dash?: number[]): void {
    if (t <= 0 || !list.length) return;
    const g = this.g, inkName = st.ink ?? 'iron', ink = INKS[inkName as InkName];
    let w0 = this.width(st.w ?? 'hair') * (1 + 0.08 * this.dark);
    let alpha = st.alpha ?? ink?.body ?? 0.9;
    const minDev = 1.1;
    if (w0 * this.dpr < minDev) { alpha *= (w0 * this.dpr) / minDev; w0 = minDev / this.dpr; }
    alpha = this.#alpha(alpha);
    if (alpha <= 0.003) return;
    const wobble = st.wobble ?? 0.3, seed0 = st.seed ?? 1;
    const path = new Path2D();
    for (let q = 0; q < list.length; q++) {
      const p = list[q], n = p.length >> 1;
      if (n < 2) continue;
      let L = 0;
      for (let i = 1; i < n; i++) L += Math.hypot(p[2 * i] - p[2 * i - 2], p[2 * i + 1] - p[2 * i - 1]);
      const Lt = L * Math.min(1, t), seed = seed0 + q * 31;
      // a wandering hand, sampled every few pixels along each piece
      let s = 0;
      path.moveTo(p[0], p[1]);
      for (let i = 1; i < n && s < Lt; i++) {
        const x0 = p[2 * i - 2], y0 = p[2 * i - 1], x1 = p[2 * i], y1 = p[2 * i + 1];
        const sl = Math.hypot(x1 - x0, y1 - y0);
        if (sl < 1e-9) continue;
        const nx = -(y1 - y0) / sl, ny = (x1 - x0) / sl;
        const steps = wobble > 0 ? Math.max(1, Math.ceil(sl / 7)) : 1;
        for (let k = 1; k <= steps; k++) {
          const f = k / steps, ss = s + sl * f;
          const cut = ss > Lt ? (Lt - s) / sl : f;
          const o = wobble > 0 && (k < steps || i < n - 1) ? wobble * noise1(ss / 9, seed) : 0;
          path.lineTo(x0 + (x1 - x0) * cut + nx * o, y0 + (y1 - y0) * cut + ny * o);
          if (ss > Lt) break;
        }
        s += sl;
      }
    }
    g.save();
    g.globalCompositeOperation = this.#blend(inkName);
    g.globalAlpha = alpha;
    g.lineWidth = w0;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    if (dash) g.setLineDash(dash.map((d) => Math.max(d, 0.01)));
    g.strokeStyle = this.#body(inkName);
    g.stroke(path);
    g.restore();
  }

  /** A blot of ink, radius r. */
  dot(x: number, y: number, r: number, ink: InkName | string = 'iron', alpha?: number): void {
    const a = this.#alpha(alpha ?? INKS[ink as InkName]?.body ?? 0.9);
    if (a <= 0.003) return;
    const g = this.g;
    g.save();
    g.globalCompositeOperation = this.#blend(ink);
    g.globalAlpha = a;
    g.fillStyle = this.#body(ink);
    g.beginPath();
    g.arc(x, y, Math.max(r, 0.5 / this.dpr), 0, Math.PI * 2);
    g.fill();
    g.restore();
  }

  /** Fills a shape solid with an ink (a dark half of a rose's point, a hull's shadow). */
  fill(path: Path2D, ink: InkName | string = 'iron', alpha?: number): void {
    const a = this.#alpha(alpha ?? INKS[ink as InkName]?.body ?? 0.9);
    if (a <= 0.003) return;
    const g = this.g;
    g.save();
    g.globalCompositeOperation = this.#blend(ink);
    g.globalAlpha = a;
    g.fillStyle = this.#body(ink);
    g.fill(path);
    g.restore();
  }

  /** Watercolour over a shape, flooding in as t runs. */
  wash(path: Path2D, hex: string, o: WashStyle = {}, t = 1): void {
    if (t <= 0) return;
    const a = this.#alpha((o.alpha ?? 0.62) * ease(Math.min(1, t)));
    if (a <= 0.003) return;
    const g = this.g, [sx, sy] = o.shift ?? [0.5, -0.35];
    g.save();
    g.translate(sx, sy);
    g.clip(path);
    g.globalCompositeOperation = 'multiply';
    g.globalAlpha = a * 0.72;
    g.fillStyle = hex;
    g.fill(path);
    const gran = o.gran ?? 0.7;
    if (gran > 0) {
      g.globalAlpha = a * gran;
      g.fillStyle = this.paper.anchor(g, this.paper.wash(hex), this.ox, this.oy, this.dpr);
      g.fill(path);
    }
    const edge = o.edge ?? 0.5;
    if (edge > 0) {
      // the pigment the wash carried to its rim as it dried, and the tide line it left
      g.strokeStyle = hex;
      g.lineJoin = 'round';
      g.globalAlpha = a * edge * 0.55;
      g.lineWidth = 4.5;
      g.stroke(path);
      g.globalAlpha = a * edge * 0.8;
      g.lineWidth = 1.3;
      g.stroke(path);
    }
    g.restore();
  }

  /** Bare paper over a shape: covers what is beneath, as the light half of a rose's point does. */
  paperFill(path: Path2D, alpha = 1): void {
    const g = this.g;
    g.save();
    g.globalAlpha = alpha * (this.dry > 0 ? Math.pow(1 - clamp(this.dry), 1.4) : 1);
    g.fillStyle = this.paper.anchor(g, this.paper.surface, this.ox, this.oy, this.dpr);
    g.fill(path);
    g.restore();
  }

  /** Gold or silver leaf laid over a shape, lit from the top left; (x, y, r) bounds the light's fall. */
  gilt(path: Path2D, metal: 'gold' | 'silver', x: number, y: number, r: number, alpha = 1): void {
    const a = this.#alpha(alpha);
    if (a <= 0.003) return;
    const g = this.g;
    g.save();
    g.globalAlpha = a;
    g.fillStyle = this.paper.anchor(g, this.paper.leaf(metal), this.ox, this.oy, this.dpr);
    g.fill(path);
    g.clip(path);
    const lg = g.createLinearGradient(x - r, y - r, x + r, y + r);
    lg.addColorStop(0, 'rgba(255,250,225,0.5)');
    lg.addColorStop(0.42, 'rgba(255,250,225,0)');
    lg.addColorStop(0.6, 'rgba(60,34,8,0)');
    lg.addColorStop(1, 'rgba(60,34,8,0.45)');
    g.fillStyle = lg;
    g.fill(path);
    g.restore();
  }

  /**
   * Hatching: parallel rules at `angle`, `gap` apart, across the box (x, y, w, h), only inside `clip`; they are laid
   * one after another as t runs. `taper` thins them toward one side (0 none, 1 to nothing).
   */
  hatch(clip: Path2D, x: number, y: number, w: number, h: number, angle: number, gap: number, st: LineStyle = {}, t = 1): void {
    if (t <= 0) return;
    const c = Math.cos(angle), s = Math.sin(angle), cx = x + w / 2, cy = y + h / 2, R = Math.hypot(w, h) / 2;
    const lines: Pts[] = [];
    const seed = st.seed ?? 5;
    for (let d = -R, i = 0; d <= R; d += gap, i++) {
      const j = noise1(i * 0.7, seed) * gap * 0.18;
      const ox = cx - s * (d + j), oy = cy + c * (d + j);
      lines.push([ox - c * R, oy - s * R, ox + c * R, oy + s * R]);
    }
    const shown = t >= 1 ? lines : lines.slice(0, Math.ceil(lines.length * t));
    const g = this.g;
    g.save();
    g.clip(clip);
    this.rule(shown, { w: 'hair', wobble: 0.25, ...st });
    g.restore();
  }

  /** A filled shape's colour as 0..255, for whatever needs the ink's own value. */
  static rgb(ink: InkName | string): readonly [number, number, number] {
    return INKS[ink as InkName]?.rgb ?? rgbOf(ink);
  }
}

// ---------------------------------------------------------------- shapes as points

/** A cubic from (x0, y0) through two handles to (x1, y1), as n + 1 points (appended to `out`). */
export function cubic(out: Pts, x0: number, y0: number, ax: number, ay: number, bx: number, by: number, x1: number, y1: number, n = 16): Pts {
  for (let i = out.length ? 1 : 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    out.push(u * u * u * x0 + 3 * u * u * t * ax + 3 * u * t * t * bx + t * t * t * x1, u * u * u * y0 + 3 * u * u * t * ay + 3 * u * t * t * by + t * t * t * y1);
  }
  return out;
}

/** An arc of a circle as points, from angle a0 to a1. */
export function arcPts(cx: number, cy: number, r: number, a0: number, a1: number, n?: number): Pts {
  const k = n ?? Math.max(6, Math.ceil(Math.abs(a1 - a0) * r / 3));
  const out: Pts = [];
  for (let i = 0; i <= k; i++) {
    const a = a0 + ((a1 - a0) * i) / k;
    out.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
  return out;
}

/**
 * A path in SVG's absolute commands (M, L, C, Q, Z), scaled by `k` and moved by (dx, dy), as one list of points per
 * subpath: a pen's strokes, written down.
 */
export function trace(d: string, k = 1, dx = 0, dy = 0, steps = 14): Pts[] {
  const tok = d.match(/[MLCQZ]|-?\d*\.?\d+(?:e-?\d+)?/gi) ?? [];
  const out: Pts[] = [];
  let cur: Pts = [], i = 0, x = 0, y = 0, sx = 0, sy = 0;
  const num = () => Number(tok[i++]);
  const P = (v: number, o: number) => v * k + o;
  while (i < tok.length) {
    const c = tok[i++].toUpperCase();
    if (c === 'M') {
      if (cur.length > 2) out.push(cur);
      x = num(); y = num(); sx = x; sy = y;
      cur = [P(x, dx), P(y, dy)];
    } else if (c === 'L') {
      x = num(); y = num();
      cur.push(P(x, dx), P(y, dy));
    } else if (c === 'C') {
      const ax = num(), ay = num(), bx = num(), by = num(), ex = num(), ey = num();
      const seg = cubic([], P(x, dx), P(y, dy), P(ax, dx), P(ay, dy), P(bx, dx), P(by, dy), P(ex, dx), P(ey, dy), steps);
      for (let q = 2; q < seg.length; q++) cur.push(seg[q]);
      x = ex; y = ey;
    } else if (c === 'Q') {
      const ax = num(), ay = num(), ex = num(), ey = num();
      const seg = cubic([], P(x, dx), P(y, dy), P(x + (2 / 3) * (ax - x), dx), P(y + (2 / 3) * (ay - y), dy),
        P(ex + (2 / 3) * (ax - ex), dx), P(ey + (2 / 3) * (ay - ey), dy), P(ex, dx), P(ey, dy), steps);
      for (let q = 2; q < seg.length; q++) cur.push(seg[q]);
      x = ex; y = ey;
    } else if (c === 'Z') {
      cur.push(P(sx, dx), P(sy, dy));
      x = sx; y = sy;
    }
  }
  if (cur.length > 2) out.push(cur);
  return out;
}

/** Points as a closed Path2D. */
export function shape(...lists: readonly ArrayLike<number>[]): Path2D {
  const p = new Path2D();
  for (const pts of lists) {
    if (pts.length < 4) continue;
    p.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) p.lineTo(pts[i], pts[i + 1]);
    p.closePath();
  }
  return p;
}

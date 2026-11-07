// The galleon mark: a captain's ship as the old charts drew ships, in profile, upright on the chart, facing the way she
// sails. Her hull is washed in her colour and lined in ink; her sails are bare paper, bellied, and her main course
// carries her emblem in her colour, large enough to read at the size of a mark; her pennant streams from the main
// truck in her colour too. Every ship is the same ship: only the colour and the emblem change.
//
// The player's own mark is gilt-rimmed: a line of gold leaf round her whole silhouette, under the ink.
// At a large size the same drawing becomes an engraving: rigging, hatching on the hull's shadowed side, the seams of the
// sailcloth, the sea curling at her bow.
//
// Unit coordinates: the waterline at y = 0, the hull about 2.2 long from stern (-1) to beakhead (1.2), y down.
import { drawEmblem, type Colours } from './emblem.ts';
import { clamp, smooth } from './noise.ts';
import { canvas, ctx } from './paper.ts';
import { Pen, cubic, shape, type Pts } from './pen.ts';

const span = (t: number, a: number, b: number) => (t >= 1 ? 1 : clamp((t - a) / (b - a)));

/** The hull: a high stern castle, a low waist, the forecastle and the beakhead. */
const HULL: Pts = (() => {
  const p: Pts = [];
  cubic(p, -1.02, -0.66, -1.05, -0.4, -0.99, -0.12, -0.86, 0.02, 8);
  cubic(p, -0.86, 0.02, -0.6, 0.16, 0.45, 0.16, 0.72, 0.03, 10);
  cubic(p, 0.72, 0.03, 0.84, -0.03, 0.9, -0.16, 0.93, -0.3, 6);
  p.push(1.22, -0.37, 1.14, -0.43, 0.88, -0.44, 0.86, -0.5, 0.46, -0.47, 0.42, -0.38, -0.2, -0.38, -0.24, -0.5, -0.64, -0.55, -0.68, -0.62, -1.02, -0.66);
  return p;
})();

/**
 * A square sail bent to a yard: centred on its mast at cx, its head `top` half-width wide at `top`, its foot wider,
 * its leeches bowed forward by the wind (b) and its foot curving down between the clews.
 */
function sailPts(cx: number, head: number, footW: number, top: number, foot: number, b: number): Pts {
  const x0 = cx - head, x1 = cx + head, f0 = cx - footW, f1 = cx + footW, h = foot - top;
  const p: Pts = [x0, top];
  cubic(p, x0, top, cx - head * 0.3, top - h * 0.04, cx + head * 0.3, top - h * 0.04, x1, top, 6);
  cubic(p, x1, top, x1 + b * 1.2, top + h * 0.3, f1 + b * 1.1, top + h * 0.75, f1 + b * 0.4, foot, 8);
  cubic(p, f1 + b * 0.4, foot, cx + footW * 0.4 + b, foot + h * 0.16, cx - footW * 0.4 + b, foot + h * 0.16, f0 + b * 0.4, foot, 8);
  cubic(p, f0 + b * 0.4, foot, f0 + b * 1.1, top + h * 0.75, x0 + b * 1.2, top + h * 0.3, x0, top, 8);
  return p;
}

const LATEEN: Pts = (() => {
  const p: Pts = [-1.0, -0.68, -0.28, -1.5];
  cubic(p, -0.28, -1.5, -0.36, -1.1, -0.44, -0.84, -0.52, -0.6, 8);
  p.push(-1.0, -0.68);
  return p;
})();

/** How she is rigged at a size: a mark's few big sails, the main course broad enough for her emblem to read; an
 *  engraving's full suit. */
interface Rig {
  sails: Pts[];
  masts: [number, number, number][];
  bowsprit: Pts;
  truck: [number, number];
  /** The emblem's centre on the main course and its size, in hull units. */
  emblem: [number, number, number];
}

const MARK: Rig = {
  sails: [sailPts(0.0, 0.44, 0.56, -1.62, -0.5, 0.1), sailPts(0.7, 0.17, 0.22, -1.18, -0.58, 0.06), LATEEN],
  masts: [[0.7, -0.46, -1.32], [0.0, -0.38, -1.84], [-0.58, -0.56, -1.56]],
  bowsprit: [0.9, -0.42, 1.4, -0.74],
  truck: [0.0, -1.84],
  emblem: [0.03, -1.07, 0.86],
};

const FULL: Rig = {
  sails: [
    sailPts(0.0, 0.4, 0.5, -1.3, -0.5, 0.1), sailPts(0.0, 0.28, 0.36, -1.9, -1.38, 0.07), sailPts(0.0, 0.16, 0.22, -2.3, -1.96, 0.04),
    sailPts(0.66, 0.24, 0.3, -1.06, -0.56, 0.07), sailPts(0.66, 0.18, 0.23, -1.56, -1.12, 0.05), sailPts(1.24, 0.12, 0.15, -0.66, -0.42, 0.04),
    LATEEN,
  ],
  masts: [[0.66, -0.46, -1.74], [0.0, -0.38, -2.4], [-0.58, -0.56, -1.62]],
  bowsprit: [0.9, -0.42, 1.46, -0.8],
  truck: [0.0, -2.4],
  emblem: [0.03, -0.92, 0.6],
};

export interface GalleonOptions {
  /** Hull length, CSS pixels. */
  size: number;
  /** +1 sails to the right, -1 to the left. */
  facing?: 1 | -1;
  /** The player's mark: a gilt rim. */
  gilt?: boolean;
  /** Pennant flutter phase, radians (a baked mark leaves it still). */
  flutter?: number;
  seed?: number;
}

/** Draws a galleon mark with her waterline's middle at (x, y). */
export function galleon(pen: Pen, cap: Colours, x: number, y: number, o: GalleonOptions, t = 1): void {
  if (t <= 0) return;
  const g = pen.g, s = o.size / 2.3, f = o.facing ?? 1, seed = o.seed ?? 21;
  const big = o.size >= 90, rig = big ? FULL : MARK, TRUCK = rig.truck;
  const P = (pts: Pts): Pts => {
    const out: Pts = new Array(pts.length);
    for (let i = 0; i < pts.length; i += 2) { out[i] = x + pts[i] * s * f; out[i + 1] = y + pts[i + 1] * s; }
    return out;
  };
  // lines thicken with her size only so far: a large ship is an engraving, not a bigger mark
  const line = (k: number, cap = pen.widths.fine) => Math.min(cap, Math.max(pen.widths.hair * 0.9, s * k));
  const hull = P(HULL), hullP = shape(hull);
  const sails = rig.sails.map(P);
  // the pennant streams aft from the main truck, rippling
  const pl = 1.0, ph = o.flutter ?? 0.6;
  const pen1: Pts = [], pen2: Pts = [];
  for (let i = 0; i <= 12; i++) {
    const u = i / 12, wv = Math.sin(u * 5.5 - ph) * 0.07 * u;
    const hw = 0.085 * (1 - 0.75 * u);
    pen1.push(TRUCK[0] - u * pl, TRUCK[1] + 0.02 + wv - hw);
    pen2.push(TRUCK[0] - u * pl, TRUCK[1] + 0.02 + wv + hw);
  }
  // swallowtail
  const tail: Pts = [...pen1, TRUCK[0] - pl * 0.86, TRUCK[1] + 0.02 + Math.sin(5.5 * 0.86 - ph) * 0.06];
  for (let i = pen2.length - 2; i >= 0; i -= 2) tail.push(pen2[i], pen2[i + 1]);
  const pennant = P(tail);

  // the gilt rim under everything: her silhouette, thickened, in gold leaf
  if (o.gilt) {
    const gt = span(t, 0.75, 1);
    if (gt > 0) {
      const sil = new Path2D();
      sil.addPath(hullP);
      for (const sp of sails) sil.addPath(shape(sp));
      g.save();
      g.globalAlpha = gt;
      g.lineJoin = 'round';
      g.lineWidth = Math.min(4.5, Math.max(2.6, s * 0.16));
      g.strokeStyle = pen.paper.anchor(g, pen.paper.leaf('gold'), pen.ox, pen.oy, pen.dpr);
      g.stroke(sil);
      g.lineWidth = Math.max(0.6, s * 0.03);
      g.strokeStyle = 'rgba(90,56,14,0.8)';
      g.globalCompositeOperation = 'multiply';
      g.stroke(sil);
      g.restore();
    }
  }
  // masts and spars
  const mt = span(t, 0.1, 0.35);
  const masts: Pts[] = rig.masts.map(([mx, y0, y1]) => P([mx, y0, mx, y1]));
  masts.push(P(rig.bowsprit));
  pen.strokes(masts, { w: line(0.055, pen.widths.bold * 1.2), nib: 0, pool: 0.2, seed }, mt, 0.2);
  if (big) {
    // standing rigging: stays and shrouds
    const lines: Pts[] = [[0.66, -1.72, 1.42, -0.8], [0.0, -2.36, 0.66, -1.5], [-0.58, -1.58, 0.0, -1.3], [0.0, -2.36, -0.96, -0.64],
      [0.66, -1.72, 0.4, -0.44], [0.0, -2.36, -0.22, -0.4], [-0.58, -1.58, -0.84, -0.56], [0.0, -2.36, 0.12, -0.4], [0.66, -1.72, 0.78, -0.44]].map(P);
    pen.rule(lines, { w: 'hair', alpha: 0.7, seed: seed + 1 }, span(t, 0.2, 0.5));
  }
  // the sails: paper, shaded on their lee, lined in ink; the emblem on the main course
  const st = span(t, 0.25, 0.7);
  sails.forEach((sp, i) => {
    const lt = span(st, i * 0.1, i * 0.1 + 0.5);
    if (lt <= 0) return;
    const p = shape(sp);
    pen.paperFill(p, smooth(0.4, 1, lt));
    pen.wash(p, '#b8a27a', { alpha: 0.28, edge: 0.6, gran: 0.4, shift: [0, 0] }, smooth(0.4, 1, lt));
    if (big) {
      // the seams of the cloth, running down the sail
      const bx = Math.min(...sp.filter((_, k) => k % 2 === 0)), ex = Math.max(...sp.filter((_, k) => k % 2 === 0));
      const by = Math.min(...sp.filter((_, k) => k % 2 === 1)), ey = Math.max(...sp.filter((_, k) => k % 2 === 1));
      pen.hatch(p, bx, by, ex - bx, ey - by, Math.PI / 2, Math.max(2.2, s * 0.09), { alpha: 0.35, seed: seed + 10 + i }, lt);
    }
    pen.stroke(sp, { w: line(0.04, pen.widths.fine * 1.15), nib: 0.25, pool: 0.3, taper: 1, seed: seed + 20 + i }, lt);
  });
  const et = span(t, 0.6, 0.85);
  const [ex, ey, es] = rig.emblem;
  if (et > 0) drawEmblem(g, pen.paper, cap.emblem, cap.colour, x + ex * s * f, y + ey * s, s * es, pen.dpr, et);
  // the hull, washed in her colour, its wales and ports in ink
  const ht = span(t, 0, 0.45);
  const wt = span(t, 0.35, 0.75);
  if (wt > 0) {
    pen.wash(hullP, cap.colour, { alpha: 0.95, edge: 0.6, gran: 0.6, shift: [0.4, -0.3] }, wt);
    // her shadowed lower body
    const shade = shape(P([-0.98, -0.2, -0.86, 0.02, -0.4, 0.13, 0.45, 0.13, 0.72, 0.03, 0.86, -0.12, 0.6, -0.1, -0.2, -0.06, -0.9, -0.16]));
    if (big) pen.hatch(shade, x - s * 1.1, y - s * 0.3, s * 2.3, s * 0.5, 0.15 * f, Math.max(1.6, s * 0.05), { alpha: 0.6 * wt, seed: seed + 30 });
    else pen.fill(shade, 'iron', 0.28 * wt);
    const wales: Pts[] = [];
    for (const yy of [-0.3, -0.17]) wales.push(P(cubic([], -1.0, yy - 0.02, -0.4, yy + 0.07, 0.4, yy + 0.07, 0.9, yy - 0.05, 10)));
    pen.rule(wales, { w: line(0.035, pen.widths.fine), alpha: 0.85, seed: seed + 31 }, wt);
    // gunports along the upper wale
    const ports = big ? 9 : 5;
    for (let k = 0; k < ports; k++) {
      const px = -0.7 + (k / (ports - 1)) * 1.3, py = -0.24 + Math.abs(px) * 0.03;
      const q = P([px, py]);
      pen.dot(q[0], q[1], Math.min(2.4, Math.max(0.55, s * 0.03)), 'iron', 0.85 * wt);
    }
  }
  pen.stroke(hull, { w: line(0.05, pen.widths.bold), nib: 0.25, pool: 0.4, taper: 1, seed: seed + 40 }, ht);
  // the pennant in her colour
  const pt = span(t, 0.7, 1);
  if (pt > 0) {
    const pp = shape(pennant);
    pen.wash(pp, cap.colour, { alpha: 0.98, edge: 0.5, gran: 0.4, shift: [0, 0] }, pt);
    pen.stroke(pennant, { w: line(0.025, pen.widths.hair * 1.4), nib: 0.2, pool: 0.2, taper: 0.5, seed: seed + 50 }, pt);
  }
  // the sea she rides: a few engraved curls
  const sea: Pts[] = [];
  const curls = big ? 7 : 3;
  for (let i = 0; i < curls; i++) {
    const cx = -1.15 + (i / (curls - 1)) * 2.5, cy = 0.1 + (i % 2) * 0.08;
    sea.push(P(cubic([], cx, cy, cx + 0.1, cy - 0.1, cx + 0.22, cy - 0.06, cx + 0.3, cy + 0.0, 6)));
  }
  pen.rule(sea, { w: line(0.03, pen.widths.fine), alpha: 0.75, seed: seed + 60 }, span(t, 0.4, 0.9));
}

const cache = new Map<string, { c: HTMLCanvasElement; ax: number; ay: number; w: number; h: number }>();

/**
 * A galleon mark baked to a sprite: (ax, ay) is her waterline's middle within it, CSS pixels. Cached by captain,
 * size, facing and gilt, so a fleet of twenty costs twenty bakes once and a draw each per frame after.
 */
export function galleonSprite(pen: Pen, cap: Colours, o: GalleonOptions): { c: HTMLCanvasElement; ax: number; ay: number; w: number; h: number } {
  const key = `${cap.colour}|${cap.emblem}|${o.size}|${o.facing ?? 1}|${o.gilt ? 1 : 0}|${pen.dpr}`;
  let sp = cache.get(key);
  if (sp) return sp;
  const s = o.size / 2.3, w = s * 3.2, ay = s * (o.size >= 90 ? 2.65 : 2.1), h = ay + s * 0.45, ax = w / 2;
  const c = canvas(w * pen.dpr, h * pen.dpr), g = ctx(c);
  g.setTransform(pen.dpr, 0, 0, pen.dpr, 0, 0);
  const was = pen.g, ox = pen.ox, oy = pen.oy;
  pen.on(g, 0, 0);
  galleon(pen, cap, ax, ay, o);
  pen.on(was, ox, oy);
  sp = { c, ax, ay, w, h };
  cache.set(key, sp);
  return sp;
}

/** Draws a baked mark with her waterline at (x, y). */
export function drawGalleon(g: CanvasRenderingContext2D, sp: { c: HTMLCanvasElement; ax: number; ay: number; w: number; h: number }, x: number, y: number, alpha = 1, scale = 1): void {
  if (alpha <= 0) return;
  const was = g.globalAlpha;
  g.globalAlpha = was * alpha;
  g.drawImage(sp.c, x - sp.ax * scale, y - sp.ay * scale, sp.w * scale, sp.h * scale);
  g.globalAlpha = was;
}

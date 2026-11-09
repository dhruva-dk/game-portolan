// The chart's small drawings: a pennant on its staff, the pointing hand, gilt stars, the inked cross of a mark, a fight's
// burst, the sun and the moon, the stamp a landed thing leaves, a laurel, and the dotted and burning rings of a course
// and the Storm.
//
// All take t, 0..1, and ink themselves in as it runs; a live one (a pennant's flutter) takes its state as plain numbers
// so the live layer can redraw it each frame for the price of a few paths.
import { hash, clamp, smooth, noise1 } from './noise.ts';
import { arcPts, shape, trace, type Pen, type Pts } from './pen.ts';
import type { InkName } from './inks.ts';

const TAU = Math.PI * 2;
const span = (t: number, a: number, b: number) => (t >= 1 ? 1 : clamp((t - a) / (b - a)));

// ---------------------------------------------------------------- pennant and staff

/** A staff: a turned pole in ink with a gilt ball at its truck, from (x, y0) down to (x, y1). */
export function staff(pen: Pen, x: number, y0: number, y1: number, t = 1, r = 4): void {
  if (t <= 0) return;
  pen.stroke([x, y1, x, y0], { w: 'bold', nib: 0, pool: 0.2, taper: 2, seed: (x * 7) | 0 }, span(t, 0, 0.7));
  const bt = span(t, 0.6, 1);
  if (bt > 0) {
    const ball = new Path2D();
    ball.arc(x, y0 - r * 0.9, r, 0, TAU);
    pen.gilt(ball, 'gold', x, y0 - r, r, bt);
    pen.stroke(arcPts(x, y0 - r * 0.9, r, -Math.PI / 2, Math.PI * 1.5), { w: 'hair', pool: 0, seed: 3 }, bt);
  }
}

export interface PennantOptions {
  /** Where it is hoisted: the top of its hoist on the staff. */
  x: number;
  y: number;
  /** How far it flies, and how tall its hoist is, CSS pixels. */
  length: number;
  height: number;
  colour: string;
  /** Which way it flies: +1 to the right. */
  dir?: 1 | -1;
  /** Flutter phase (radians) and how hard the wind blows it (0 hangs limp, 1 streams). */
  phase?: number;
  wind?: number;
  /** A band at the hoist in another colour. */
  trim?: string;
  /** Edged in gilt: the player's own. */
  gilt?: boolean;
  seed?: number;
}

/** The pennant's outline as points, and its centreline's slope along it (for the fold shading). */
function pennantShape(o: PennantOptions): { outline: Pts; fold: Float32Array; top: Pts; bottom: Pts } {
  const N = 18, L = o.length, H = o.height, dir = o.dir ?? 1, ph = o.phase ?? 0, wind = o.wind ?? 1;
  const k = (TAU * L) / Math.max(H * 5.5, 30);
  const top: Pts = [], bottom: Pts = [], fold = new Float32Array(N + 1);
  const notch = Math.min(H * 1.1, L * 0.24);
  for (let i = 0; i <= N; i++) {
    const u = i / N, x = o.x + dir * u * L;
    const amp = H * 0.32 * Math.pow(u, 1.15) * wind;
    const wave = Math.sin(u * k - ph) + 0.3 * Math.sin(u * k * 2.3 - ph * 1.7);
    // limp, it sags toward the staff
    const sag = (1 - wind) * u * u * H * 1.4;
    const c = o.y + H / 2 + wave * amp + sag;
    const hh = (H / 2) * (1 - 0.6 * u);
    top.push(x, c - hh);
    bottom.push(x, c + hh);
    fold[i] = Math.cos(u * k - ph) * amp * k / Math.max(L, 1);
  }
  // the swallowtail: the fly end cut back to a notch at its middle
  const e = N * 2, cx = top[e] - dir * notch, cy = (top[e + 1] + bottom[e + 1]) / 2;
  const outline: Pts = [...top, cx, cy];
  for (let i = N; i >= 0; i--) outline.push(bottom[2 * i], bottom[2 * i + 1]);
  return { outline, fold, top, bottom };
}

/**
 * A pennant flying from a staff: washed in its colour, its folds shaded, lined in ink. Unfurls from the staff as t
 * runs. Cheap enough to draw live.
 */
export function pennant(pen: Pen, o: PennantOptions, t = 1): void {
  if (t <= 0 || o.length <= 0.5) return;
  const len = o.length * smooth(0, 1, t);
  const sh = pennantShape({ ...o, length: len });
  const p = shape(sh.outline);
  pen.wash(p, o.colour, { alpha: 0.98, edge: 0.55, gran: 0.5, shift: [0, 0] });
  // the folds: darker in the troughs the wind makes
  const N = sh.fold.length - 1, g = pen.g;
  g.save();
  g.globalCompositeOperation = 'multiply';
  for (let i = 0; i < N; i++) {
    const s = (sh.fold[i] + sh.fold[i + 1]) * 0.5;
    if (s >= -0.02) continue;
    g.globalAlpha = Math.min(0.4, -s * 1.6) * (1 - pen.dry);
    g.fillStyle = '#3a2416';
    g.beginPath();
    g.moveTo(sh.top[2 * i], sh.top[2 * i + 1]);
    g.lineTo(sh.top[2 * i + 2], sh.top[2 * i + 3]);
    g.lineTo(sh.bottom[2 * i + 2], sh.bottom[2 * i + 3]);
    g.lineTo(sh.bottom[2 * i], sh.bottom[2 * i + 1]);
    g.closePath();
    g.save();
    g.clip(p);
    g.fill();
    g.restore();
  }
  g.restore();
  if (o.trim) {
    const dir = o.dir ?? 1, hb = Math.min(o.height * 0.8, len * 0.3);
    const band = shape([o.x, o.y - 1, o.x + dir * hb, o.y - 1, o.x + dir * hb, o.y + o.height + 6, o.x, o.y + o.height + 6]);
    g.save();
    g.clip(p);
    pen.wash(band, o.trim, { alpha: 0.95, edge: 0.4, gran: 0.4, shift: [0, 0] });
    g.restore();
  }
  if (o.gilt) {
    g.save();
    g.lineJoin = 'round';
    g.lineWidth = 2.6;
    g.strokeStyle = pen.paper.anchor(g, pen.paper.leaf('gold'), pen.ox, pen.oy, pen.dpr);
    g.stroke(p);
    g.restore();
  }
  pen.rule([sh.outline], { w: 'fine', seed: o.seed ?? 5, wobble: 0.15 });
}

// ---------------------------------------------------------------- the pointing hand

/** The manicule: a hand pointing, in ink over paper, its cuff laced, the lower side hatched. Points along `rot`. */
export function hand(pen: Pen, x: number, y: number, size: number, rot = 0, t = 1): void {
  if (t <= 0) return;
  const g = pen.g;
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  // the fingertip at the origin, so the hand points at (x, y)
  const k = size, ox = -0.98 * k;
  const T = (d: string) => trace(d, k, ox, 0);
  const body = T('M 0.16 -0.17 C 0.26 -0.25 0.4 -0.25 0.5 -0.2 L 0.9 -0.15 C 0.99 -0.14 1.01 -0.06 0.95 -0.045 L 0.57 -0.05 C 0.64 -0.03 0.63 0.05 0.55 0.055 C 0.61 0.075 0.6 0.14 0.52 0.145 C 0.57 0.17 0.55 0.225 0.46 0.215 C 0.37 0.24 0.25 0.22 0.16 0.17 Z')[0];
  const cuff = T('M 0.02 -0.22 L 0.16 -0.2 L 0.16 0.2 L 0.02 0.22 Z')[0];
  const fill = shape(body), cuffP = shape(cuff);
  const ft = span(t, 0.4, 0.9);
  pen.paperFill(fill, ft);
  pen.paperFill(cuffP, ft);
  // shade: the underside of the hand and the curled fingers
  pen.hatch(fill, ox + 0.1 * k, 0.04 * k, 0.6 * k, 0.22 * k, -0.6, Math.max(1.5, k * 0.03), { alpha: 0.6, seed: 31 }, ft);
  pen.hatch(fill, ox + 0.5 * k, -0.08 * k, 0.5 * k, 0.04 * k, -0.15, Math.max(1.4, k * 0.02), { alpha: 0.45, seed: 36 }, ft);
  pen.hatch(cuffP, ox, -0.25 * k, 0.2 * k, 0.5 * k, 1.2, Math.max(1.5, k * 0.03), { alpha: 0.5, seed: 32 }, ft);
  const lt = span(t, 0, 0.7);
  pen.stroke(body, { w: Math.min(pen.widths.bold, Math.max(pen.widths.fine, k * 0.014)), nib: 0.5, pool: 0.4, taper: 2, seed: 33 }, lt);
  pen.stroke(cuff, { w: Math.min(pen.widths.bold, Math.max(pen.widths.fine, k * 0.013)), nib: 0.3, pool: 0.3, seed: 34 }, lt);
  // the lace at the cuff's edge, the thumb along the finger, the nail, the knuckles
  const lace: Pts = [];
  for (let i = 0; i <= 8; i++) {
    const v = -0.2 + (i / 8) * 0.4, b = i % 2 ? 0.045 : 0.015;
    lace.push(ox + (0.16 + b) * k, v * k);
  }
  const details: Pts[] = [
    lace,
    T('M 0.3 -0.13 C 0.4 -0.115 0.52 -0.11 0.62 -0.105 C 0.66 -0.1 0.66 -0.08 0.6 -0.075')[0],
    T('M 0.89 -0.145 C 0.93 -0.135 0.95 -0.11 0.94 -0.085')[0],
    T('M 0.72 -0.16 C 0.72 -0.13 0.73 -0.1 0.72 -0.06')[0],
    T('M 0.79 -0.15 C 0.79 -0.12 0.8 -0.09 0.79 -0.055')[0],
  ];
  pen.strokes(details, { w: 'hair', nib: 0.3, pool: 0.3, seed: 35 }, span(t, 0.3, 1));
  g.restore();
}

// ---------------------------------------------------------------- star, cross, burst, stamp

/** A five-pointed star in gold leaf with its ink line. */
export function star(pen: Pen, x: number, y: number, r: number, t = 1, metal: 'gold' | 'silver' = 'gold', rot = 0): void {
  if (t <= 0) return;
  const pts: Pts = [];
  for (let k = 0; k < 10; k++) {
    const a = -Math.PI / 2 + rot + (k / 10) * TAU, rr = k % 2 ? r * 0.42 : r;
    pts.push(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  pts.push(pts[0], pts[1]);
  pen.gilt(shape(pts), metal, x, y, r, span(t, 0.3, 1));
  pen.stroke(pts, { w: Math.max(pen.widths.hair, r * 0.06), nib: 0.2, pool: 0.2, taper: 1, seed: (x * 3) | 0 }, span(t, 0, 0.8));
}

/** An inked cross, as a chartmaker marks a spot: two strokes. */
export function cross(pen: Pen, x: number, y: number, r: number, t = 1, ink: InkName = 'iron'): void {
  pen.strokes([[x - r, y - r * 0.9, x + r * 0.95, y + r], [x + r * 0.9, y - r, x - r * 0.95, y + r * 0.95]],
    { w: Math.max(pen.widths.fine, r * 0.24), ink, nib: 0.55, pool: 0.8, seed: (x + y) | 0 }, t, 0.15);
}

/** A fight's burst: short strokes flung out from a point, rubric blots between them. */
export function burst(pen: Pen, x: number, y: number, r: number, t = 1, seed = 1): void {
  if (t <= 0) return;
  const rays: Pts[] = [];
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * TAU + hash(k, 0, seed) * 0.4, r0 = r * (0.25 + hash(k, 1, seed) * 0.15), r1 = r * (0.75 + hash(k, 2, seed) * 0.35);
    rays.push([x + Math.cos(a) * r0, y + Math.sin(a) * r0, x + Math.cos(a) * r1, y + Math.sin(a) * r1]);
  }
  pen.strokes(rays, { w: Math.max(pen.widths.fine, r * 0.09), nib: 0.3, pool: 0.6, seed }, span(t, 0, 0.7), 0.6);
  const bt = span(t, 0.3, 1);
  for (let k = 0; k < 7; k++) {
    const a = hash(k, 5, seed) * TAU, d = r * (0.2 + hash(k, 6, seed) * 0.7);
    pen.dot(x + Math.cos(a) * d, y + Math.sin(a) * d, Math.max(0.6, r * 0.05 * (0.5 + hash(k, 7, seed))), 'rubric', 0.9 * bt);
  }
  pen.dot(x, y, r * 0.16, 'rubric', 0.9 * bt);
}

/** The mark a thing leaves where it lands with a stamp: a ring of ink pressed out, a spatter round it, fading as k
 *  runs 0..1. */
export function stamp(pen: Pen, x: number, y: number, r: number, k: number, seed = 3): void {
  if (k <= 0 || k >= 1) return;
  const e = 1 - Math.pow(1 - k, 3), fade = 1 - smooth(0.35, 1, k);
  pen.rule([arcPts(x, y, r * (1 + 0.5 * e), 0, TAU, 40)], { w: Math.max(pen.widths.hair, r * 0.05 * (1 - e)), alpha: 0.5 * fade, seed });
  for (let i = 0; i < 9; i++) {
    const a = hash(i, 1, seed) * TAU, d = r * (1.05 + e * (0.4 + hash(i, 2, seed) * 0.5));
    pen.dot(x + Math.cos(a) * d, y + Math.sin(a) * d, Math.max(0.5, r * 0.035 * (0.5 + hash(i, 3, seed))), 'iron', 0.8 * fade);
  }
}

// ---------------------------------------------------------------- the laurel

/**
 * A laurel wreath round (x, y), radius r: two branches rising from where they cross at the foot, leaves in pairs along
 * them, open at the crown. In `gold` or `silver` the leaves are gilt, rimmed in iron; in any other ink they are that
 * ink, solid. It inks itself in from the foot up.
 */
export function laurel(pen: Pen, x: number, y: number, r: number, ink: InkName = 'iron', t = 1, seed = 5): void {
  if (t <= 0) return;
  const metal = ink === 'gold' || ink === 'silver' ? ink : null, n = 13, rise = Math.PI - 0.6;
  for (const sgn of [1, -1]) {
    // the angle round the wreath at u along the branch, from the foot (just past its fellow's side) to the crown
    const at = (u: number) => Math.PI / 2 + sgn * (-0.1 + u * rise);
    const stem: Pts = [];
    for (let i = 0; i <= 40; i++) {
      const a = at(i / 40);
      stem.push(x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    pen.stroke(stem, { w: 'fine', ink, nib: 0.2, pool: 0.3, seed: seed + sgn }, span(t, 0, 0.7));
    for (let k = 0; k < n; k++) {
      const u = (k + 0.5) / n, a = at(u), lt = span(t, u * 0.75, u * 0.75 + 0.2);
      if (lt <= 0) continue;
      const L = r * (0.26 - 0.1 * u), px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
      const heading = a + (sgn * Math.PI) / 2;
      for (const side of [1, -1]) {
        const dir = heading + side * sgn * (0.5 + 0.12 * hash(k, side, seed)), L1 = L * (0.92 + 0.14 * hash(k, side + 2, seed)) * smooth(0, 1, lt);
        const cx = px + Math.cos(dir) * L1, cy = py + Math.sin(dir) * L1, ux = Math.cos(dir), uy = Math.sin(dir), hw = L1 * 0.23;
        const leaf: Pts = [];
        for (let i = 0; i <= 8; i++) {
          const v = i / 8, w = Math.sin(v * Math.PI) * hw;
          leaf.push(px + ux * L1 * v - uy * w, py + uy * L1 * v + ux * w);
        }
        for (let i = 8; i >= 1; i--) {
          const v = i / 8, w = Math.sin(v * Math.PI) * hw;
          leaf.push(px + ux * L1 * v + uy * w, py + uy * L1 * v - ux * w);
        }
        leaf.push(leaf[0], leaf[1]);
        const path = shape(leaf);
        if (metal) {
          pen.gilt(path, metal, cx, cy, L1, 0.95);
          pen.stroke(leaf, { w: 'hair', seed: seed + k * 3 + side, pool: 0.1 }, 1);
        } else pen.fill(path, ink, 0.86);
      }
    }
  }
  // the tie, where the stems cross
  pen.rule([[x - r * 0.12, y + r * 1.03, x + r * 0.12, y + r * 0.97], [x - r * 0.1, y + r * 0.96, x + r * 0.1, y + r * 1.04]], { w: 'fine', ink, seed: seed + 9 }, span(t, 0.1, 0.5));
}

// ---------------------------------------------------------------- sun and moon

/** The sun: a gilt disc with straight and flaming rays alternating, no face. */
export function sun(pen: Pen, x: number, y: number, r: number, t = 1): void {
  if (t <= 0) return;
  const rays: Pts[] = [], flames: Pts[] = [];
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * TAU - Math.PI / 2;
    if (k % 2 === 0) rays.push([x + Math.cos(a) * r * 0.62, y + Math.sin(a) * r * 0.62, x + Math.cos(a) * r, y + Math.sin(a) * r]);
    else {
      const pts: Pts = [];
      for (let i = 0; i <= 10; i++) {
        const u = i / 10, rr = r * (0.6 + 0.3 * u), w = Math.sin(u * Math.PI * 2.5) * r * 0.06 * (1 - u * 0.3);
        pts.push(x + Math.cos(a) * rr - Math.sin(a) * w, y + Math.sin(a) * rr + Math.cos(a) * w);
      }
      flames.push(pts);
    }
  }
  const disc = new Path2D();
  disc.arc(x, y, r * 0.5, 0, TAU);
  pen.gilt(disc, 'gold', x, y, r * 0.5, span(t, 0.2, 0.8));
  pen.stroke(arcPts(x, y, r * 0.5, 0, TAU), { w: Math.max(pen.widths.hair, r * 0.05), pool: 0.2, seed: 71 }, span(t, 0, 0.5));
  pen.strokes(rays, { w: Math.max(pen.widths.hair, r * 0.06), ink: 'gold', pool: 0.4, seed: 72 }, span(t, 0.3, 1), 0.7);
  pen.strokes(flames, { w: Math.max(pen.widths.hair, r * 0.05), ink: 'gold', pool: 0.4, seed: 73 }, span(t, 0.35, 1), 0.7);
}

/** The moon: a crescent in silver leaf, horns to the right. */
export function moon(pen: Pen, x: number, y: number, r: number, t = 1): void {
  if (t <= 0) return;
  // the lit limb round the left, then back along the edge of the dark that covers the rest, horns to the right
  const c: Pts = [];
  for (let i = 0; i <= 24; i++) {
    const a = -Math.PI / 2 - 0.15 - (i / 24) * (Math.PI - 0.3);
    c.push(x + Math.cos(a) * r, y + Math.sin(a) * r);
  }
  for (let i = 0; i <= 24; i++) {
    const a = Math.PI * 0.62 + (i / 24) * Math.PI * 0.76;
    c.push(x + r * 0.42 + Math.cos(a) * r * 0.9, y + Math.sin(a) * r * 0.9);
  }
  c.push(c[0], c[1]);
  pen.gilt(shape(c), 'silver', x, y, r, span(t, 0.3, 1));
  pen.stroke(c, { w: Math.max(pen.widths.hair, r * 0.06), pool: 0.3, seed: 75 }, span(t, 0, 0.8));
}

// ---------------------------------------------------------------- courses and circles

/** Wake: an ink trail that dries out toward its far end, through points from the ship back. */
export function wake(pen: Pen, pts: ArrayLike<number>, colour: InkName | string = 'iron', alpha = 0.7): void {
  const n = pts.length >> 1;
  if (n < 2) return;
  // in a few pieces, each lighter than the last
  const pieces = 4, per = Math.ceil(n / pieces);
  for (let p = 0; p < pieces; p++) {
    const a = p * per, b = Math.min(n - 1, (p + 1) * per);
    if (b - a < 1) break;
    const seg: Pts = [];
    for (let i = a; i <= b; i++) seg.push(pts[2 * i], pts[2 * i + 1]);
    pen.rule([seg], { w: 'fine', ink: colour, alpha: alpha * (1 - p / pieces), wobble: 0.2, seed: 101 + p }, 1, p > 1 ? [3, 3] : undefined);
  }
}

/** A loose ring of dots, as a course or a circle yet to be: the Storm's next circle. */
export function dottedRing(pen: Pen, x: number, y: number, r: number, t = 1, ink: InkName = 'iron', gap = 6, alpha = 0.9): void {
  pen.rule([arcPts(x, y, r, -Math.PI / 2, -Math.PI / 2 + TAU * clamp(t), Math.max(24, r / 2))], { w: 'fine', ink, alpha }, 1, [0, gap]);
}

/** An inked ring, its rim bleeding rubric on its outer side where `bleed` > 0 (the Storm's edge). */
export function stormRing(pen: Pen, x: number, y: number, r: number, t = 1, bleed = 0.6): void {
  if (t <= 0) return;
  const g = pen.g;
  if (bleed > 0) {
    g.save();
    const rg = g.createRadialGradient(x, y, r, x, y, r * 1.12);
    rg.addColorStop(0, `rgba(176,40,22,${0.45 * bleed})`);
    rg.addColorStop(1, 'rgba(176,40,22,0)');
    g.globalCompositeOperation = 'multiply';
    g.fillStyle = rg;
    g.beginPath();
    g.arc(x, y, r * 1.12, 0, TAU);
    g.arc(x, y, r, 0, TAU, true);
    g.fill();
    g.restore();
  }
  const pts = arcPts(x, y, r, -Math.PI / 2, -Math.PI / 2 + TAU * clamp(t), Math.max(48, r));
  for (let i = 0; i < pts.length; i += 2) {
    const a = (i / pts.length) * TAU, o = noise1(a * 6, 7) * 0.8;
    pts[i] += Math.cos(a) * o;
    pts[i + 1] += Math.sin(a) * o;
  }
  pen.rule([pts], { w: 'bold', ink: 'rubric', alpha: 0.9, seed: 111 });
}

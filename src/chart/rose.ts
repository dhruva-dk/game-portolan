// The compass's drawings: the rose of 8, 16 or 32 points, the graduated ring, rhumb lines and the web of them, the
// fleur-de-lis that marks north, and the needle.
//
// The rose keeps the portolan colours: the eight principal winds in ink, the eight half winds in verdigris, the sixteen
// quarter winds in vermilion. Each point is a kite split along its axis, one half shaded (ink, or a strong wash with
// the pen's hatching in it) and one half bare paper, so the rose stands in relief, lit from the top left. North is a
// gilt fleur-de-lis; the boss at the centre is gilt.
//
// Every drawing takes t, 0..1, and inks itself in as it runs: the ring's rules sweep round, its ticks follow, the
// principal winds are drawn first and the quarter winds last, and the gilt is laid when the line work is done.
import { clamp, smooth } from './noise.ts';
import { arcPts, cubic, shape, type Pen, type Pts } from './pen.ts';
import type { InkName } from './inks.ts';

const TAU = Math.PI * 2;
const span = (t: number, a: number, b: number) => (t >= 1 ? 1 : clamp((t - a) / (b - a)));

/** The fleur-de-lis, one unit tall, its foot at the origin, pointing to -y, as a Path2D at a scale and place. */
export function fleurPath(x: number, y: number, s: number, rot = 0): Path2D {
  const P = (px: number, py: number): [number, number] => {
    const c = Math.cos(rot), n = Math.sin(rot);
    return [x + (px * c - py * n) * s, y + (px * n + py * c) * s];
  };
  const p = new Path2D();
  const mv = (a: number, b: number) => p.moveTo(...P(a, b));
  const ln = (a: number, b: number) => p.lineTo(...P(a, b));
  const bz = (a: number, b: number, c: number, d: number, e: number, f: number) => p.bezierCurveTo(...P(a, b), ...P(c, d), ...P(e, f));
  // the middle petal
  mv(0, -1);
  bz(0.22, -0.8, 0.2, -0.5, 0.055, -0.3);
  ln(-0.055, -0.3);
  bz(-0.2, -0.5, -0.22, -0.8, 0, -1);
  p.closePath();
  // the two side petals, curling out and down
  for (const sgn of [1, -1]) {
    mv(0.06 * sgn, -0.33);
    bz(0.24 * sgn, -0.68, 0.6 * sgn, -0.62, 0.5 * sgn, -0.36);
    bz(0.45 * sgn, -0.23, 0.31 * sgn, -0.24, 0.34 * sgn, -0.34);
    bz(0.27 * sgn, -0.3, 0.17 * sgn, -0.27, 0.06 * sgn, -0.24);
    p.closePath();
  }
  // the band that binds them, and the foot
  mv(-0.26, -0.28); ln(0.26, -0.28); ln(0.26, -0.2); ln(-0.26, -0.2); p.closePath();
  mv(0, -0.19);
  bz(0.11, -0.12, 0.18, -0.05, 0.14, 0);
  ln(-0.14, 0);
  bz(-0.18, -0.05, -0.11, -0.12, 0, -0.19);
  p.closePath();
  return p;
}

/** A gilt fleur-de-lis with its ink line. */
export function fleur(pen: Pen, x: number, y: number, s: number, rot = 0, t = 1, metal: 'gold' | 'silver' = 'gold'): void {
  if (t <= 0) return;
  const p = fleurPath(x, y, s, rot);
  pen.gilt(p, metal, x, y - s * 0.5, s * 0.6, smooth(0.3, 1, t));
  const g = pen.g;
  g.save();
  g.globalAlpha = smooth(0, 0.6, t);
  g.lineJoin = 'round';
  g.lineWidth = Math.max(pen.widths.hair, s * 0.025);
  g.strokeStyle = pen.paper.anchor(g, pen.paper.ink('iron'), pen.ox, pen.oy, pen.dpr);
  g.globalCompositeOperation = 'multiply';
  g.stroke(p);
  g.restore();
}

export interface RingOptions {
  /** Ticks round the ring: 128 (the points' quarters) or 360 (degrees). */
  ticks?: 128 | 360;
  /** The band of alternating bars. */
  band?: boolean;
  ink?: InkName;
  seed?: number;
}

/**
 * A graduated ring between radii r0 and r1 at (cx, cy): its rules, the ticks between the inner two, the band of
 * alternating bars between the outer, the north end of it at `rot` (radians from up).
 */
export function ring(pen: Pen, cx: number, cy: number, r0: number, r1: number, o: RingOptions = {}, t = 1, rot = 0): void {
  if (t <= 0) return;
  const d = r1 - r0, at = (f: number) => r0 + d * f, seed = o.seed ?? 3, ink = o.ink ?? 'iron';
  const top = -Math.PI / 2 + rot;
  const sweep = (a: number) => arcPts(cx, cy, a, top, top + TAU * span(t, 0, 0.4));
  // the rules sweep round from north
  pen.stroke(sweep(at(0)), { w: 'fine', nib: 0.15, ink, seed, pool: 0.3, wobble: 0.25, drift: 0.3 });
  pen.rule([sweep(at(0.08)), sweep(at(0.5)), sweep(at(0.58)), sweep(at(0.92))], { w: 'hair', ink, seed: seed + 1, wobble: 0.2 });
  pen.stroke(sweep(at(1)), { w: 'bold', nib: 0.15, ink, seed: seed + 2, pool: 0.3, wobble: 0.25, drift: 0.3 });
  // the ticks follow the rules round
  const n = o.ticks ?? 128, shown = Math.floor(n * span(t, 0.15, 0.6));
  const ticks: Pts[] = [], majors: Pts[] = [];
  for (let k = 0; k < shown; k++) {
    const a = top + (k / n) * TAU, c = Math.cos(a), s = Math.sin(a);
    const major = n === 128 ? k % 16 === 0 : k % 45 === 0;
    const mid = n === 128 ? k % 4 === 0 : k % 5 === 0;
    const len = major ? 0.5 : mid ? 0.36 : 0.22;
    (major ? majors : ticks).push([cx + c * at(0.08), cy + s * at(0.08), cx + c * at(0.08 + len * 0.84), cy + s * at(0.08 + len * 0.84)]);
  }
  pen.rule(ticks, { w: 'hair', ink, seed: seed + 3, wobble: 0.1 });
  pen.rule(majors, { w: 'fine', ink, seed: seed + 4, wobble: 0.1 });
  if (o.band ?? true) {
    const cells = 64, shownCells = Math.floor(cells * span(t, 0.3, 0.75));
    const p = new Path2D();
    for (let k = 0; k < shownCells; k += 2) {
      const a0 = top + (k / cells) * TAU, a1 = a0 + TAU / cells;
      p.moveTo(cx + Math.cos(a0) * at(0.92), cy + Math.sin(a0) * at(0.92));
      p.arc(cx, cy, at(0.92), a0, a1);
      p.arc(cx, cy, at(0.58), a1, a0, true);
      p.closePath();
    }
    pen.fill(p, ink, 0.85);
  }
}

interface Wind {
  first: number;
  every: number;
  len: number;
  hw: number;
  ink: InkName;
  wash: string;
  from: number;
}

const WINDS: readonly Wind[] = [
  { first: 1, every: 2, len: 0.52, hw: 0.05, ink: 'rubric', wash: '#c0452c', from: 0.5 },
  { first: 2, every: 4, len: 0.66, hw: 0.064, ink: 'green', wash: '#4a7c4c', from: 0.38 },
  { first: 4, every: 8, len: 0.79, hw: 0.084, ink: 'iron', wash: '#2a1a10', from: 0.26 },
  { first: 0, every: 8, len: 0.95, hw: 0.1, ink: 'iron', wash: '#2a1a10', from: 0.2 },
];

export interface RoseOptions {
  points?: 8 | 16 | 32;
  /** A graduated ring round it, as a share of the radius (0 for none). */
  ring?: number;
  /** North, in radians from up. */
  rot?: number;
  /** The fleur at north. */
  fleur?: boolean;
  seed?: number;
}

/** A compass rose of radius r at (cx, cy). */
export function rose(pen: Pen, cx: number, cy: number, r: number, o: RoseOptions = {}, t = 1): void {
  if (t <= 0) return;
  const points = o.points ?? 32, rot = o.rot ?? 0, seed = o.seed ?? 11;
  const ringW = o.ring ?? 0.12;
  if (ringW > 0) ring(pen, cx, cy, r * (1 - ringW), r, { seed, ticks: 128 }, span(t, 0, 0.55), rot);
  const inner = ringW > 0 ? r * (1 - ringW) : r;
  // the circles the points stand in
  pen.rule([arcPts(cx, cy, inner * 0.24, -Math.PI / 2 + rot, -Math.PI / 2 + rot + TAU * span(t, 0.1, 0.4))], { w: 'hair', seed: seed + 5 });
  pen.rule([arcPts(cx, cy, inner * 0.3, -Math.PI / 2 + rot, -Math.PI / 2 + rot + TAU * span(t, 0.12, 0.42))], { w: 'hair', seed: seed + 6 }, 1, [0, 3]);
  const kinds = WINDS.filter((k) => (points === 32 ? true : points === 16 ? k.every >= 4 : k.every >= 8));
  for (const kd of kinds) {
    const n = 32 / kd.every;
    for (let i = 0; i < n; i++) {
      const k = kd.first + i * kd.every;
      const lt = span(t, kd.from + (i / n) * 0.18, kd.from + (i / n) * 0.18 + 0.22);
      if (lt <= 0) continue;
      const a = (k / 32) * TAU - Math.PI / 2 + rot, c = Math.cos(a), s = Math.sin(a);
      // longer points for fewer winds, so an 8-point rose still fills its circle
      const len = (points === 8 ? Math.min(0.94, kd.len * 1.12) : kd.len) * inner, hw = kd.hw * inner * (points === 8 ? 1.25 : 1);
      const tipX = cx + c * len, tipY = cy + s * len;
      // the shoulders sit a little out from the centre, so the point is a kite and not a triangle
      const sh = 0.16 * len;
      const lsx = cx + c * sh - s * hw, lsy = cy + s * sh + c * hw, rsx = cx + c * sh + s * hw, rsy = cy + s * sh - c * hw;
      const dark = shape([tipX, tipY, lsx, lsy, cx, cy]);
      const light = shape([tipX, tipY, rsx, rsy, cx, cy]);
      const fillT = smooth(0.35, 1, lt);
      pen.paperFill(shape([tipX, tipY, lsx, lsy, cx, cy, rsx, rsy]), fillT);
      if (kd.ink === 'iron') {
        pen.fill(dark, 'iron', 0.9 * fillT);
      } else {
        pen.wash(dark, kd.wash, { alpha: 0.95, edge: 0.6, gran: 0.6, shift: [0, 0] }, fillT);
        pen.hatch(dark, Math.min(tipX, cx) - hw, Math.min(tipY, cy) - hw, Math.abs(tipX - cx) + hw * 2, Math.abs(tipY - cy) + hw * 2,
          a, Math.max(1.6, hw * 0.35), { ink: kd.ink, alpha: 0.6 * fillT, seed: seed + k });
        pen.wash(light, kd.wash, { alpha: 0.18, edge: 0.3, gran: 0.5, shift: [0, 0] }, fillT);
      }
      const w = kd.every >= 8 ? 'fine' : 'hair';
      pen.stroke([cx, cy, lsx, lsy, tipX, tipY, rsx, rsy, cx, cy], { w, nib: 0.2, seed: seed + k * 3, pool: 0.25, taper: 1 }, lt);
      pen.stroke([cx, cy, tipX, tipY], { w: 'hair', nib: 0, seed: seed + k * 3 + 1, pool: 0.15 }, lt);
    }
  }
  const end = span(t, 0.8, 1);
  if (o.fleur ?? true) {
    const fl = inner * 0.26;
    const fa = rot;
    fleur(pen, cx + Math.sin(fa) * inner * 0.86, cy - Math.cos(fa) * inner * 0.86, fl, fa, end);
  }
  if (end > 0) {
    const boss = new Path2D();
    boss.arc(cx, cy, inner * 0.055, 0, TAU);
    pen.gilt(boss, 'gold', cx, cy, inner * 0.06, end);
    pen.stroke(arcPts(cx, cy, inner * 0.055, 0, TAU), { w: 'hair', seed: seed + 99, pool: 0 }, end);
    pen.dot(cx, cy, Math.max(0.6, inner * 0.012), 'iron', 0.9 * end);
  }
}

/** One rhumb line in a wind's tone: ink, verdigris or vermilion. Dotted for a course. */
export function rhumb(pen: Pen, x0: number, y0: number, x1: number, y1: number, tone: 'iron' | 'green' | 'rubric' = 'iron', t = 1, dotted = false): void {
  pen.rule([[x0, y0, x0 + (x1 - x0) * Math.min(1, t), y0 + (y1 - y0) * Math.min(1, t)]],
    { w: dotted ? 'fine' : 'hair', ink: tone, alpha: dotted ? 0.85 : 0.55, seed: (x0 * 13 + y1 * 7) | 0 }, 1, dotted ? [0, 5] : undefined);
}

/**
 * The portolan web: sixteen wind nodes on a circle of radius `ring` round (cx, cy) and one at its centre, each sending
 * the 32 winds out to `reach`. The lines grow out of their nodes as t runs, the centre's first.
 */
export function rhumbWeb(pen: Pen, cx: number, cy: number, ringR: number, reach: number, t = 1, alpha = 0.5): void {
  const tones: Pts[][] = [[], [], []];
  for (let n = 0; n <= 16; n++) {
    const a = (n / 16) * TAU, k = n < 16 ? ringR : 0, x = cx + Math.cos(a) * k, y = cy + Math.sin(a) * k;
    const len = reach * span(t, n < 16 ? 0.15 + n * 0.025 : 0, n < 16 ? 0.6 + n * 0.025 : 0.45);
    if (len <= 0) continue;
    for (let w = 0; w < 32; w++) {
      const b = (w / 32) * TAU;
      tones[w % 4 === 0 ? 0 : w % 2 === 0 ? 1 : 2].push([x, y, x + Math.cos(b) * len, y + Math.sin(b) * len]);
    }
  }
  pen.rule(tones[0], { w: 'hair', ink: 'iron', alpha, seed: 1 });
  pen.rule(tones[1], { w: 'hair', ink: 'green', alpha, seed: 2 });
  pen.rule(tones[2], { w: 'hair', ink: 'rubric', alpha: alpha * 0.8, seed: 3 });
}

/** A compass needle of half-length `len`: blued steel to the north, bright to the south, on a gilt pivot. */
export function needle(pen: Pen, cx: number, cy: number, len: number, rot: number, t = 1): void {
  if (t <= 0) return;
  const g = pen.g, w = len * 0.11;
  g.save();
  g.translate(cx, cy);
  g.rotate(rot);
  const north = shape([0, -len, w, 0, 0, w * 0.4, -w, 0]);
  const south = shape([0, len, w, 0, 0, -w * 0.4, -w, 0]);
  const a = smooth(0, 0.6, t);
  // blued steel: a dark blue that flashes lighter along its spine
  g.globalAlpha = a;
  const blue = g.createLinearGradient(-w, 0, w, 0);
  blue.addColorStop(0, '#1d2c4a');
  blue.addColorStop(0.45, '#3f5f92');
  blue.addColorStop(0.55, '#16223a');
  blue.addColorStop(1, '#0d1526');
  g.fillStyle = blue;
  g.fill(north);
  const steel = g.createLinearGradient(-w, 0, w, 0);
  steel.addColorStop(0, '#8a8e92');
  steel.addColorStop(0.45, '#e8eaea');
  steel.addColorStop(0.55, '#7a7e82');
  steel.addColorStop(1, '#55595e');
  g.fillStyle = steel;
  g.fill(south);
  g.restore();
  g.save();
  g.translate(cx, cy);
  g.rotate(rot);
  pen.stroke([0, -len, w, 0, 0, len, -w, 0, 0, -len], { w: 'fine', nib: 0.2, pool: 0.2, seed: 41 }, t);
  pen.rule([[0, -len * 0.92, 0, len * 0.92]], { w: 'hair', alpha: 0.5 }, t);
  const pivot = new Path2D();
  pivot.arc(0, 0, w * 0.55, 0, TAU);
  pen.gilt(pivot, 'gold', 0, 0, w * 0.6, smooth(0.6, 1, t));
  pen.stroke(arcPts(0, 0, w * 0.55, 0, TAU), { w: 'hair', pool: 0 }, smooth(0.6, 1, t));
  g.restore();
}

/** A feathered arrow from (x0, y0) to its head at (x1, y1), as the wind is drawn on a chart's rim. */
export function arrow(pen: Pen, x0: number, y0: number, x1: number, y1: number, t = 1, ink: InkName = 'iron'): void {
  if (t <= 0) return;
  const L = Math.hypot(x1 - x0, y1 - y0), ux = (x1 - x0) / L, uy = (y1 - y0) / L, nx = -uy, ny = ux;
  const head = Math.min(10, L * 0.25);
  pen.stroke([x0, y0, x1, y1], { w: 'fine', ink, nib: 0.1, pool: 0.4, seed: 61 }, span(t, 0, 0.6));
  const ht = span(t, 0.5, 0.8);
  const hb = [x1 - ux * head, y1 - uy * head];
  pen.fill(shape([x1, y1, hb[0] + nx * head * 0.42, hb[1] + ny * head * 0.42, hb[0] + ux * head * 0.25, hb[1] + uy * head * 0.25, hb[0] - nx * head * 0.42, hb[1] - ny * head * 0.42]), ink, 0.9 * ht);
  // the fletching: barbs swept back from the tail on both sides
  const ft = span(t, 0.6, 1), fl = Math.min(14, L * 0.3), barbs: Pts[] = [];
  for (let i = 0; i < 4; i++) {
    const f = i / 3, bx = x0 + ux * fl * f, by = y0 + uy * fl * f, len = head * 0.75;
    for (const sgn of [1, -1]) barbs.push([bx, by, bx - ux * len * 0.7 + nx * sgn * len * 0.6, by - uy * len * 0.7 + ny * sgn * len * 0.6]);
  }
  pen.rule(barbs.slice(0, Math.ceil(barbs.length * ft)), { w: 'hair', ink, seed: 63 });
}

/** A smooth closed curve through points, as points (for washes of coasts and blooms). */
export function blob(cx: number, cy: number, r: number, wobble: (a: number) => number, n = 48): Pts {
  const out: Pts = [];
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * TAU, rr = r * (1 + wobble(a));
    out.push(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  return out;
}

export { cubic };

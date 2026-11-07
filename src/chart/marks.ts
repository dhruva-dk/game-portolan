// The chart's small drawings: a pennant on its staff, tally marks, the sand-glass, the pointing hand, gilt stars, the
// inked cross of a mark, a fight's burst, the sun and the moon, the stamp a landed thing leaves, and the plain
// instruments of the controls (the stick's ring and nub, the sails' notched quadrant, the settings' dividers).
//
// All take t, 0..1, and ink themselves in as it runs; the live ones (a pennant's flutter, the sand running) take their
// state as plain numbers so the live layer can redraw them each frame for the price of a few paths.
import { hash, clamp, smooth, noise1 } from './noise.ts';
import { arcPts, cubic, shape, trace, type Pen, type Pts } from './pen.ts';
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

// ---------------------------------------------------------------- tally

/** Tally marks for n: fours struck through by a fifth, each a quill stroke, inked one after another. */
export function tally(pen: Pen, n: number, x: number, y: number, h: number, t = 1, ink: InkName = 'iron', seed = 9): number {
  const gap = h * 0.24, groupW = gap * 3 + h * 0.62;
  const strokes: Pts[] = [];
  for (let i = 0; i < n; i++) {
    const gi = Math.floor(i / 5), k = i % 5, gx = x + gi * groupW;
    const j1 = hash(i, 1, seed) - 0.5, j2 = hash(i, 2, seed) - 0.5, j3 = hash(i, 3, seed) - 0.5;
    if (k < 4) {
      const sx = gx + k * gap + j1 * gap * 0.2;
      strokes.push([sx + j2 * h * 0.05, y - h * (0.98 + j3 * 0.08), sx - h * 0.04, y + j1 * h * 0.04]);
    } else {
      strokes.push([gx - gap * 0.75, y - h * (0.12 + j1 * 0.06), gx + gap * 3.8, y - h * (0.9 + j2 * 0.08)]);
    }
  }
  pen.strokes(strokes, { w: Math.max(pen.widths.fine, h * 0.075), ink, nib: 0.45, angle: -0.7, pool: 0.7, taper: h * 0.12, seed }, t, 0.1);
  const groups = Math.ceil(n / 5);
  return groups * groupW - (n % 5 === 0 || n === 0 ? h * 0.62 - gap * 0.5 : 0);
}

// ---------------------------------------------------------------- sand-glass

/** The glass's half-width at a height v (−1 the top plate, 0 the waist, +1 the bottom plate), as a share of its width. */
const bulb = (v: number) => {
  const a = Math.abs(v);
  return 0.045 + 0.4 * Math.sin(Math.min(1, a / 0.86) * Math.PI * 0.94) ** 0.9 * (a < 0.15 ? smooth(0.02, 0.15, a) * 0.6 + 0.4 : 1);
};

export interface GlassOptions {
  /** Share of the sand still in the top bulb, 1 full to 0 run out. */
  sand: number;
  /** The thread of sand falling. */
  running?: boolean;
  /** The sand's wash. */
  colour?: string;
  /** For the falling grains. */
  time?: number;
}

/**
 * A sand-glass, `h` tall, centred at (x, y): turned end plates and posts, two blown bulbs with their glints, and the
 * sand: a dip in the top as it drains, a cone growing in the bottom, the thread falling between.
 */
export function sandglass(pen: Pen, x: number, y: number, h: number, o: GlassOptions, t = 1): void {
  if (t <= 0) return;
  const w = h * 0.56, hh = h / 2, plate = h * 0.07, inner = hh - plate;
  const sandC = o.colour ?? '#c99a4a';
  // the glass: its profile as points, down the right side and up the left
  const right: Pts = [], left: Pts = [];
  for (let i = 0; i <= 24; i++) {
    const v = -1 + (i / 24) * 2, hw = bulb(v) * w;
    right.push(x + hw, y + v * inner);
  }
  for (let i = 24; i >= 0; i--) {
    const v = -1 + (i / 24) * 2, hw = bulb(v) * w;
    left.push(x - hw, y + v * inner);
  }
  const glass = shape([...right, ...left]);
  const gt = span(t, 0.2, 0.7);
  // the sand: top, below a dished surface; bottom, a heap
  const st = span(t, 0.55, 1);
  if (st > 0) {
    const s = clamp(o.sand), g = pen.g;
    g.save();
    g.clip(glass);
    if (s > 0.005) {
      // the top bulb's sand: from the waist up to a level that falls as it drains, dished in the middle
      const level = -0.04 - 0.8 * Math.pow(s, 0.8), dish = 0.12 * (1 - s) + 0.04;
      const pts: Pts = [];
      for (let i = 0; i <= 16; i++) {
        const u = i / 16, xx = x + (u - 0.5) * w * 1.1;
        pts.push(xx, y + inner * (level + dish * (1 - Math.pow(2 * u - 1, 2))));
      }
      pts.push(x + w, y, x - w, y);
      pen.wash(shape(pts), sandC, { alpha: 0.9, edge: 0.5, gran: 1, shift: [0, 0] }, st);
    }
    const heap = 0.1 + 0.62 * (1 - s);
    const pile: Pts = [x - w, y + inner, x + w, y + inner];
    for (let i = 0; i <= 16; i++) {
      const u = i / 16, xx = x + (0.5 - u) * w * 1.2, d = Math.abs(1 - 2 * u);
      pile.push(xx, y + inner * (1 - heap * (1 - Math.pow(d, 1.4)) - 0.08));
    }
    pen.wash(shape(pile), sandC, { alpha: 0.95, edge: 0.5, gran: 1, shift: [0, 0] }, st);
    if (o.running && s > 0.005) {
      const top = y + inner * 0.02, bot = y + inner * (1 - heap - 0.08);
      pen.rule([[x, top, x, bot]], { w: Math.max(0.7, h * 0.012), ink: '#a8782e', wobble: 0 });
      const tm = o.time ?? 0;
      for (let i = 0; i < 4; i++) {
        const f = (tm * 2.2 + i / 4) % 1;
        pen.dot(x + (hash(i, Math.floor(tm * 2.2 + i / 4), 3) - 0.5) * 1.6, top + (bot - top) * f, Math.max(0.5, h * 0.008), '#a8782e', 0.8);
      }
    }
    g.restore();
  }
  // glints on the glass: lead white, down the left of each bulb
  if (gt > 0) {
    pen.stroke(cubic([], x - w * 0.27, y - inner * 0.82, x - w * 0.34, y - inner * 0.62, x - w * 0.33, y - inner * 0.42, x - w * 0.2, y - inner * 0.24, 8), { w: Math.max(1, h * 0.022), ink: 'white', alpha: 0.75, nib: 0, pool: 0, seed: 4 }, gt);
    pen.stroke(cubic([], x - w * 0.22, y + inner * 0.3, x - w * 0.33, y + inner * 0.46, x - w * 0.34, y + inner * 0.64, x - w * 0.27, y + inner * 0.8, 8), { w: Math.max(1, h * 0.018), ink: 'white', alpha: 0.6, nib: 0, pool: 0, seed: 5 }, gt);
    pen.stroke(right, { w: 'fine', nib: 0.2, pool: 0.1, taper: 1, seed: 6 }, gt);
    pen.stroke(left, { w: 'fine', nib: 0.2, pool: 0.1, taper: 1, seed: 7 }, gt);
  }
  // the frame: plates, turned posts, knobs
  const ft = span(t, 0, 0.5);
  for (const sgn of [-1, 1]) {
    const py = y + sgn * (hh - plate / 2);
    const pl = shape([x - w * 0.62, py - plate / 2, x + w * 0.62, py - plate / 2, x + w * 0.66, py + plate / 2, x - w * 0.66, py + plate / 2]);
    pen.wash(pl, '#8a5a2c', { alpha: 0.85 * ft, edge: 0.4, gran: 0.6, shift: [0, 0] });
    pen.stroke([x - w * 0.62, py - plate / 2, x + w * 0.62, py - plate / 2, x + w * 0.66, py + plate / 2, x - w * 0.66, py + plate / 2, x - w * 0.62, py - plate / 2], { w: 'fine', nib: 0.2, pool: 0.2, taper: 1, seed: 10 + sgn }, ft);
    // knob
    pen.stroke(arcPts(x, py + sgn * plate * 0.95, plate * 0.42, sgn > 0 ? 0 : Math.PI, sgn > 0 ? Math.PI : TAU), { w: 'fine', pool: 0.2, seed: 12 + sgn }, ft);
  }
  for (const sgn of [-1, 1]) {
    const px = x + sgn * w * 0.54, pts: Pts = [];
    // a bobbin-turned post: swelling and necking down its length
    for (let i = 0; i <= 20; i++) {
      const v = -1 + (i / 20) * 2;
      pts.push(px + sgn * Math.sin(v * Math.PI * 3) * h * 0.012, y + v * (inner + 1));
    }
    pen.stroke(pts, { w: Math.max(pen.widths.fine, h * 0.03), nib: 0.1, pool: 0.1, seed: 20 + sgn }, ft);
  }
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

// ---------------------------------------------------------------- instruments for the controls

/** The stick: a plain inked ring, and the nub within it at (nx, ny), paper over ink. */
export function stick(pen: Pen, x: number, y: number, r: number, nx: number, ny: number, t = 1, press = 0): void {
  if (t <= 0) return;
  pen.rule([arcPts(x, y, r, -Math.PI / 2, -Math.PI / 2 + TAU * span(t, 0, 0.7), 60)], { w: 'fine', alpha: 0.85, seed: 81 });
  pen.rule([arcPts(x, y, r * 0.93, 0, TAU * span(t, 0.1, 0.8), 60)], { w: 'hair', alpha: 0.5, seed: 82 }, 1, [0, 4]);
  const nt = span(t, 0.5, 1), nr = r * 0.36;
  if (nt > 0) {
    const nub = new Path2D();
    nub.arc(nx, ny, nr, 0, TAU);
    pen.paperFill(nub, nt);
    pen.mood({ dark: press }, () => {
      pen.wash(nub, '#a07850', { alpha: 0.25 + 0.3 * press, edge: 0.6, gran: 0.6, shift: [0, 0] }, nt);
      pen.stroke(arcPts(nx, ny, nr, -Math.PI / 2, Math.PI * 1.5, 40), { w: 'bold', nib: 0.2, pool: 0.3, seed: 83 }, nt);
      pen.stroke(arcPts(nx, ny, nr * 0.55, -Math.PI / 2, Math.PI * 1.5, 30), { w: 'hair', nib: 0.2, pool: 0.1, seed: 84 }, nt);
    });
  }
}

/**
 * The settings' instrument: a pair of brass dividers, the chartmaker's own tool, standing open on their points with the
 * hinge at the top. `spread` is half the angle between the legs (a press closes them a little); (x, y) is the middle
 * of the instrument, `size` its height.
 */
export function dividers(pen: Pen, x: number, y: number, size: number, spread = 0.36, t = 1): void {
  if (t <= 0) return;
  const hx = x, hy = y - size * 0.36, L = size * 0.84, w = size * 0.075;
  for (const side of [-1, 1]) {
    // the leg: broad at the hinge, filed to a point, bevelled down its middle
    const a = side * spread, dx = Math.sin(a), dy = Math.cos(a), nx = dy, ny = -dx;
    const px = hx + dx * L, py = hy + dy * L, kx = hx + dx * L * 0.78, ky = hy + dy * L * 0.78;
    const leg = [hx + nx * w, hy + ny * w, kx + nx * w * 0.55, ky + ny * w * 0.55, px, py, kx - nx * w * 0.55, ky - ny * w * 0.55, hx - nx * w, hy - ny * w];
    pen.gilt(shape(leg), 'gold', hx, hy + L * 0.4, L * 0.6, span(t, 0.35, 0.9));
    pen.stroke([...leg, leg[0], leg[1]], { w: 'fine', nib: 0.25, pool: 0.3, taper: 1, seed: side > 0 ? 95 : 96 }, span(t, 0, 0.65));
    pen.rule([[hx, hy, kx, ky]], { w: 'hair', alpha: 0.6, seed: side > 0 ? 97 : 98 }, span(t, 0.3, 0.8));
  }
  // the hinge, and the knurled grip above it
  const ht = span(t, 0.55, 1);
  if (ht > 0) {
    const r = size * 0.1, grip = shape([hx - r * 0.45, hy - r * 0.6, hx - r * 0.38, hy - r * 2.6, hx + r * 0.38, hy - r * 2.6, hx + r * 0.45, hy - r * 0.6]);
    pen.gilt(grip, 'gold', hx, hy - r * 1.6, r * 1.2, ht);
    pen.stroke([hx - r * 0.45, hy - r * 0.6, hx - r * 0.38, hy - r * 2.6, hx + r * 0.38, hy - r * 2.6, hx + r * 0.45, hy - r * 0.6], { w: 'hair', pool: 0.2, seed: 99 }, ht);
    pen.rule([0.9, 1.4, 1.9].map((k) => [hx - r * 0.42, hy - r * k, hx + r * 0.42, hy - r * k]), { w: 'hair', alpha: 0.55, seed: 100 }, ht);
    const pivot = new Path2D();
    pivot.arc(hx, hy, r, 0, TAU);
    pen.gilt(pivot, 'gold', hx, hy, r, ht);
    pen.stroke(arcPts(hx, hy, r, 0, TAU, 24), { w: 'fine', pool: 0.1, seed: 101 }, ht);
    pen.dot(hx, hy, Math.max(0.6, r * 0.22), 'iron', 0.9 * ht);
  }
}

/**
 * The sails' instrument: a brass quadrant with three notches, the index arm resting in one (0, 1, 2: furled, half,
 * full). `at` may be fractional while the arm swings.
 */
export function quadrant(pen: Pen, x: number, y: number, r: number, at: number, t = 1): void {
  if (t <= 0) return;
  const a0 = -Math.PI * 0.85, a1 = -Math.PI * 0.15;
  const limb = new Path2D();
  limb.arc(x, y, r, a0, a1);
  limb.arc(x, y, r * 0.78, a1, a0, true);
  limb.closePath();
  pen.wash(limb, '#b48a3c', { alpha: 0.8, edge: 0.6, gran: 0.8, shift: [0, 0] }, span(t, 0.3, 0.9));
  pen.stroke([...arcPts(x, y, r, a0, a1, 30), x + Math.cos(a1) * r * 0.78, y + Math.sin(a1) * r * 0.78, ...arcPts(x, y, r * 0.78, a1, a0, 24), x + Math.cos(a0) * r, y + Math.sin(a0) * r],
    { w: 'fine', nib: 0.2, pool: 0.3, seed: 91 }, span(t, 0, 0.6));
  // the radii to the centre, and the three notches
  pen.rule([[x, y, x + Math.cos(a0) * r * 0.78, y + Math.sin(a0) * r * 0.78], [x, y, x + Math.cos(a1) * r * 0.78, y + Math.sin(a1) * r * 0.78]], { w: 'hair', seed: 92 }, span(t, 0.2, 0.7));
  for (let k = 0; k < 3; k++) {
    const a = a0 + ((k + 0.5) / 3) * (a1 - a0);
    const notch = shape([x + Math.cos(a - 0.06) * r, y + Math.sin(a - 0.06) * r, x + Math.cos(a) * r * 0.86, y + Math.sin(a) * r * 0.86, x + Math.cos(a + 0.06) * r, y + Math.sin(a + 0.06) * r]);
    pen.fill(notch, 'iron', 0.85 * span(t, 0.5, 0.9));
  }
  // the index arm
  const it = span(t, 0.6, 1);
  if (it > 0) {
    const a = a0 + ((clamp(at, 0, 2) + 0.5) / 3) * (a1 - a0);
    pen.stroke([x, y, x + Math.cos(a) * r * 1.06, y + Math.sin(a) * r * 1.06], { w: 'bold', nib: 0.1, pool: 0.6, seed: 93 }, it);
    const piv = new Path2D();
    piv.arc(x, y, r * 0.09, 0, TAU);
    pen.gilt(piv, 'gold', x, y, r * 0.1, it);
    pen.stroke(arcPts(x, y, r * 0.09, 0, TAU, 16), { w: 'hair', pool: 0, seed: 94 }, it);
  }
}

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

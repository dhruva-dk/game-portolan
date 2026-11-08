// The HUD's instrument family (issue #54): the one treatment every element of the match screen shares, so the screen
// reads as a set of instruments from one chartmaker's bench and not as cards from different games. Everything stands
// on paper, because iron-gall ink is a stain and vanishes on the dark sea: a round button is a paper disc with an inked
// rim and its woodcut in iron; a reading (the vitals' bars, the Storm's clock, the ships afloat) is a slip of paper
// with rules and numerals on it; a hotbar slot is an inked square on a slip, the chosen one gilt; the sails are an
// arc of three notches with a needle. Only the stick's ring and the reticle lie on the world itself, and those are
// laid in lead white, the one ink that covers.
//
// Every helper takes its position in CSS pixels (a Box is centred, as the layout gives it), an optional press sink
// (press.ts) for the sink-and-darken of a finger on it, and t for inking in. The live HUD bakes what holds still to
// sprites (ChartLayer.sprite) and redraws only what moves; dev/kit.ts shows the family at rest the same way.
import type { Prim } from '../icons/draw.ts';
import { HUD_ICONS } from '../icons/sets/hud.ts';
import type { InkName } from '../chart/inks.ts';
import type { Box } from '../chart/layout.ts';
import { part } from '../chart/motion.ts';
import { clamp, noise1 } from '../chart/noise.ts';
import { figure, figureWidth } from '../chart/numerals.ts';
import { arcPts, type Pen, type Pts } from '../chart/pen.ts';
import { pressLook } from '../chart/press.ts';
import { woodcut } from '../chart/woodcut.ts';

const TAU = Math.PI * 2;

// ── paper ──

/** A slip of paper w × h centred at (x, y), cut by hand: its edges wander a hair, its corners are near enough square. */
export function slipPath(x: number, y: number, w: number, h: number, seed = 1): Path2D {
  const x0 = x - w / 2, y0 = y - h / 2;
  const sides: [number, number, number, number][] = [[x0, y0, x0 + w, y0], [x0 + w, y0, x0 + w, y0 + h], [x0 + w, y0 + h, x0, y0 + h], [x0, y0 + h, x0, y0]];
  const p = new Path2D();
  let first = true;
  sides.forEach(([ax, ay, bx, by], k) => {
    const L = Math.hypot(bx - ax, by - ay), nx = (by - ay) / L, ny = -(bx - ax) / L, sd = seed * 7 + k * 101;
    const n = Math.max(2, Math.ceil(L / 3));
    for (let i = 0; i < n; i++) {
      const s = (i / n) * L, corner = Math.min(1, s / 6, (L - s) / 6);
      const d = (0.7 * noise1(s / 11, sd) + 0.35 * noise1(s / 3.5, sd + 1)) * corner;
      const px = ax + (bx - ax) * (i / n) + nx * d, py = ay + (by - ay) * (i / n) + ny * d;
      if (first) { p.moveTo(px, py); first = false; } else p.lineTo(px, py);
    }
  });
  p.closePath();
  return p;
}

/** A round of paper, radius r at (x, y), cut by hand. */
export function discPath(x: number, y: number, r: number, seed = 1): Path2D {
  const p = new Path2D(), n = Math.max(24, Math.ceil(TAU * r / 2.5));
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU, s = a * r;
    const rr = r + 0.6 * noise1(s / 9, seed * 7) + 0.3 * noise1(s / 3, seed * 7 + 1);
    const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
    if (i) p.lineTo(px, py); else p.moveTo(px, py);
  }
  p.closePath();
  return p;
}

export interface PaperOptions {
  alpha?: number;
  /** The shadow it casts on the world, 0..1. */
  shadow?: number;
  /** How far its rim has browned with handling, in pixels. */
  burn?: number;
}

/** Paper laid on the world: the shadow it casts, the sheet itself, a rim browned with handling and a pale cut edge. */
export function paper(pen: Pen, path: Path2D, o: PaperOptions = {}): void {
  const g = pen.g, a = (o.alpha ?? 1) * (pen.dry > 0 ? Math.pow(1 - clamp(pen.dry), 1.4) : 1);
  if (a <= 0.003) return;
  const shadow = o.shadow ?? 1;
  if (shadow > 0) {
    g.save();
    g.globalAlpha = a * 0.55 * shadow;
    g.fillStyle = '#000';
    g.shadowColor = 'rgba(16,9,3,0.7)';
    g.shadowBlur = 7 * pen.dpr;
    g.shadowOffsetX = 0.6 * pen.dpr;
    g.shadowOffsetY = 2.2 * pen.dpr;
    g.fill(path);
    g.restore();
  }
  pen.paperFill(path, a);
  g.save();
  g.clip(path);
  g.globalCompositeOperation = 'multiply';
  g.lineJoin = 'round';
  g.strokeStyle = 'rgba(132,78,30,0.32)';
  g.globalAlpha = a;
  g.lineWidth = (o.burn ?? 5) * 2;
  g.stroke(path);
  g.strokeStyle = 'rgba(96,50,16,0.4)';
  g.lineWidth = 2.4;
  g.stroke(path);
  g.globalCompositeOperation = 'source-over';
  g.strokeStyle = 'rgba(252,244,224,0.35)';
  g.lineWidth = 1.2;
  g.stroke(path);
  g.restore();
}

// ── the inked rim and the ink's small marks ──

/** The rim an instrument's disc is given: a bold ring just inside the edge and a hairline inside that. */
function rim(pen: Pen, x: number, y: number, r: number, seed: number, alpha: number, t: number): void {
  pen.stroke(arcPts(x, y, r * 0.93, -Math.PI / 2, Math.PI * 1.5, Math.max(32, Math.ceil(r))), { w: 'bold', nib: 0.15, pool: 0.3, wobble: 0.3, drift: 0.2, seed, alpha: 0.92 * alpha }, part(t, 0, 0.6));
  pen.rule([arcPts(x, y, r * 0.85, 0, TAU * part(t, 0.1, 0.7), Math.max(32, Math.ceil(r)))], { w: 'hair', alpha: 0.6 * alpha, seed: seed + 1 });
}

/** A ring draining round an instrument: the part of its circle still to run, from north, clockwise. */
export function drainRing(pen: Pen, x: number, y: number, r: number, left: number, ink: InkName = 'rubric', alpha = 0.9): void {
  if (left <= 0.002) return;
  pen.rule([arcPts(x, y, r, -Math.PI / 2, -Math.PI / 2 + TAU * clamp(left), Math.max(24, Math.ceil(r)))], { w: 'bold', ink, alpha, wobble: 0.2, seed: 121 });
}

/** Charge pips in a row centred at (x, y): `full` of `n` filled with ink, the rest as empty rings. */
export function pips(pen: Pen, x: number, y: number, n: number, full: number, r: number, ink: InkName = 'iron', alpha = 1): void {
  const gap = r * 3.2, x0 = x - ((n - 1) * gap) / 2;
  for (let i = 0; i < n; i++) {
    const px = x0 + i * gap;
    pen.stroke(arcPts(px, y, r, -Math.PI / 2, Math.PI * 1.5, 20), { w: 'fine', ink, nib: 0.2, pool: 0.2, wobble: 0.15, seed: 131 + i, alpha: 0.9 * alpha });
    const f = clamp(full - i);
    if (f > 0.02) pen.dot(px, y, r * 0.62 * Math.sqrt(f), ink, 0.9 * alpha);
  }
}

// ── the round button ──

export interface ButtonOptions {
  /** The press's sink (Press.sink): the button sinks and its ink darkens. */
  press?: number;
  alpha?: number;
  /** The woodcut's ink. */
  ink?: InkName;
  /** The woodcut's size as a share of the radius (1.15 fills the face). */
  icon?: number;
  /** A ring draining round the rim: the share of the circle still to run (reload, a cooldown). */
  drain?: number;
  /** Charge pips under the woodcut (Gust). */
  pips?: { n: number; full: number };
  /** Faint: nothing to do (Reload with no gun chosen). */
  faint?: boolean;
  seed?: number;
}

/**
 * A round button, radius r at (x, y): a paper disc with an inked rim and a woodcut in iron on its face. Every button on
 * the HUD is this, at its own size: Fire the largest, Reload, Ability and Gust smaller.
 */
export function roundButton(pen: Pen, x: number, y: number, r: number, drawing: readonly Prim[] | null, o: ButtonOptions = {}, t = 1): void {
  if (t <= 0) return;
  const g = pen.g, look = pressLook(o.press ?? 0), seed = o.seed ?? 3;
  const alpha = (o.alpha ?? 1) * (o.faint ? 0.45 : 1);
  g.save();
  g.translate(x, y + look.dy);
  g.scale(look.scale, look.scale);
  g.translate(-x, -y);
  paper(pen, discPath(x, y, r, seed), { alpha, burn: Math.max(3, r * 0.1) });
  pen.mood({ dark: look.dark }, () => {
    rim(pen, x, y, r, seed, alpha, t);
    const wt = part(t, 0.3, 1);
    if (drawing && wt > 0) {
      const dy = o.pips ? -r * 0.14 : 0, size = r * (o.icon ?? (o.pips ? 1.0 : 1.15));
      woodcut(pen, drawing, x, y + dy, size, o.ink ?? 'iron', alpha * wt);
    }
    if (o.pips) pips(pen, x, y + r * 0.56, o.pips.n, o.pips.full, Math.max(2.2, r * 0.11), 'iron', alpha * wt);
  });
  if (o.drain !== undefined) drainRing(pen, x, y, r * 0.93, o.drain, 'rubric', alpha);
  g.restore();
}

// ── the bar ──

export interface BarOptions {
  /** The wash of what is left. */
  colour: string;
  /** The rules' and the numeral's ink. */
  ink?: InkName;
  /** The numeral at the right end. */
  figure?: string;
  /** Low: the wash turns to vermilion and the numeral to rubric (the hull under 35). */
  low?: boolean;
  alpha?: number;
  seed?: number;
}

/**
 * A ruled bar in its box, its wash shrinking from the right as `fill` falls from 1 to 0, a numeral at the right end:
 * the shield's and the hull's. The box is the strip and the numeral together; the strip is half the box tall.
 */
export function bar(pen: Pen, b: Box, fill: number, o: BarOptions, t = 1): number {
  if (t <= 0) return 0;
  const alpha = o.alpha ?? 1, ink = o.ink ?? 'iron', seed = o.seed ?? 5;
  const size = b.h * 0.55, room = o.figure ? figureWidth('00', size) + b.h * 0.45 : 0;
  const x0 = b.x - b.w / 2, sw = b.w - room, sh = b.h * 0.5, y0 = b.y - sh / 2, y1 = b.y + sh / 2;
  // what is left, washed in from the left; its right end is where the bar has been eaten to
  const fw = sw * clamp(fill) * part(t, 0.3, 1);
  if (fw > 0.5) {
    const p = new Path2D();
    p.rect(x0 + 0.5, y0 + 0.5, fw - 1, sh - 1);
    pen.wash(p, o.low ? '#c4452a' : o.colour, { alpha: 0.95 * alpha, edge: 0.55, gran: 0.6, shift: [0, 0] });
  }
  // the ruled strip: top and bottom rules, the end caps, a tick at each quarter
  const ticks: Pts[] = [];
  for (let k = 1; k < 4; k++) ticks.push([x0 + (sw * k) / 4, y1, x0 + (sw * k) / 4, y1 - sh * 0.3]);
  pen.rule(ticks, { w: 'hair', ink, alpha: 0.55 * alpha, seed: seed + 2 }, part(t, 0.2, 0.8));
  pen.rule([[x0, y0, x0 + sw, y0], [x0, y1, x0 + sw, y1]], { w: 'fine', ink, alpha: 0.9 * alpha, wobble: 0.25, seed }, part(t, 0, 0.7));
  pen.strokes([[x0, y0 - 1, x0, y1 + 1], [x0 + sw, y0 - 1, x0 + sw, y1 + 1]], { w: 'bold', ink, nib: 0.1, pool: 0.3, alpha: 0.9 * alpha, seed: seed + 1 }, part(t, 0.1, 0.8), 0.5);
  if (o.figure) figure(pen, o.figure, x0 + sw + b.h * 0.4, y1, size, { ink: o.low ? 'rubric' : ink, alpha: 0.95 * alpha, seed: seed + 3 }, part(t, 0.4, 1));
  return sw;
}

// ── the badge: a woodcut and its numeral on a slip ──

export interface BadgeOptions {
  ink?: InkName;
  /** The numeral's ink (rubric while the Storm closes). */
  figureInk?: InkName;
  alpha?: number;
  seed?: number;
}

/** A woodcut with a numeral beside it on a slip of paper filling the box: the Storm's clock, the ships afloat. */
export function badge(pen: Pen, b: Box, drawing: readonly Prim[], text: string, o: BadgeOptions = {}, t = 1): void {
  if (t <= 0) return;
  const alpha = o.alpha ?? 1, seed = o.seed ?? 9;
  paper(pen, slipPath(b.x, b.y, b.w, b.h, seed), { alpha, burn: 4 });
  const size = b.h * 0.72, fs = b.h * 0.5, gap = b.h * 0.22;
  const total = size + gap + figureWidth(text, fs), x0 = b.x - total / 2;
  woodcut(pen, drawing, x0 + size / 2, b.y, size, o.ink ?? 'iron', alpha * part(t, 0.2, 0.8));
  figure(pen, text, x0 + size + gap, b.y + fs * 0.42, fs, { ink: o.figureInk ?? 'iron', alpha: 0.95 * alpha, seed }, part(t, 0.4, 1));
}

// ── the hotbar slot ──

export interface SlotOptions {
  /** What is in it; nothing, and the slot is an empty one. */
  drawing?: readonly Prim[];
  /** Ammo or count, in the corner. */
  count?: string;
  /** The chosen slot, its square gilt. */
  chosen?: boolean;
  press?: number;
  alpha?: number;
  seed?: number;
}

/**
 * A hotbar slot in its box: an inked square on a slip of parchment with the item's woodcut and its count in the
 * corner; the chosen one's square is gilt; an empty one is only the square's faint outline, in lead white on the sea.
 */
export function slot(pen: Pen, b: Box, o: SlotOptions = {}, t = 1): void {
  if (t <= 0) return;
  const g = pen.g, look = pressLook(o.press ?? 0), seed = o.seed ?? 13, empty = !o.drawing, alpha = o.alpha ?? 1;
  const i = Math.max(2.5, b.w * 0.07), x0 = b.x - b.w / 2 + i, y0 = b.y - b.h / 2 + i, x1 = b.x + b.w / 2 - i, y1 = b.y + b.h / 2 - i;
  /** The square grown by d each way, clockwise from its top left, closed. */
  const square = (d: number): Pts => [x0 - d, y0 - d, x1 + d, y0 - d, x1 + d, y1 + d, x0 - d, y1 + d, x0 - d, y0 - d];
  if (empty) {
    pen.rule([square(0)], { w: 'fine', ink: 'white', alpha: 0.5 * alpha, wobble: 0.3, seed }, part(t, 0, 0.6));
    return;
  }
  g.save();
  g.translate(b.x, b.y + look.dy);
  g.scale(look.scale, look.scale);
  g.translate(-b.x, -b.y);
  paper(pen, slipPath(b.x, b.y, b.w, b.h, seed), { alpha, burn: 3 });
  pen.mood({ dark: look.dark }, () => {
    if (o.chosen) {
      // the gilt square: leaf laid between two inked lines
      const band = Math.max(2, b.w * 0.05), leaf = new Path2D(), outer = square(band / 2), inner = square(-band / 2);
      leaf.moveTo(outer[0], outer[1]);
      for (let q = 2; q < 8; q += 2) leaf.lineTo(outer[q], outer[q + 1]);
      leaf.closePath();
      leaf.moveTo(inner[0], inner[1]);
      for (let q = 6; q > 0; q -= 2) leaf.lineTo(inner[q], inner[q + 1]);
      leaf.closePath();
      pen.gilt(leaf, 'gold', b.x, b.y, b.w / 2, alpha * part(t, 0.2, 0.7));
      pen.stroke(outer, { w: 'fine', nib: 0.2, pool: 0.2, wobble: 0.2, seed, alpha: 0.9 * alpha }, part(t, 0, 0.6));
      pen.stroke(inner, { w: 'hair', nib: 0.2, pool: 0.1, wobble: 0.2, seed: seed + 1, alpha: 0.8 * alpha }, part(t, 0.1, 0.7));
    } else {
      pen.stroke(square(0), { w: 'fine', nib: 0.2, pool: 0.2, wobble: 0.25, seed, alpha: 0.9 * alpha }, part(t, 0, 0.6));
    }
    // the item up and to the left a little, so its count has the corner to itself
    const wt = part(t, 0.3, 1);
    if (o.drawing && wt > 0) woodcut(pen, o.drawing, b.x - b.w * 0.05, b.y - b.h * 0.08, b.w * 0.56, 'iron', alpha * wt);
    if (o.count && wt > 0) figure(pen, o.count, x1 - b.w * 0.05, y1 - b.h * 0.22, b.h * 0.22, { align: 'right', alpha: 0.95 * alpha, seed }, wt);
  });
  g.restore();
}

// ── the sails' instrument ──

export interface SailsOptions {
  press?: number;
  alpha?: number;
  seed?: number;
}

/**
 * The sails: a paper disc, radius r, carrying an arc with three notches (furled, half, full) over a sail woodcut, the
 * needle from the pivot resting in the notch `at` (0, 1, 2; fractional while it swings).
 */
export function sailsArc(pen: Pen, x: number, y: number, r: number, at: number, o: SailsOptions = {}, t = 1): void {
  if (t <= 0) return;
  const g = pen.g, look = pressLook(o.press ?? 0), seed = o.seed ?? 17, alpha = o.alpha ?? 1;
  g.save();
  g.translate(x, y + look.dy);
  g.scale(look.scale, look.scale);
  g.translate(-x, -y);
  paper(pen, discPath(x, y, r, seed), { alpha, burn: Math.max(3, r * 0.1) });
  pen.mood({ dark: look.dark }, () => {
    rim(pen, x, y, r, seed, alpha, t);
    // the arc over the pivot, and its three notches, longer for more sail
    const a0 = -Math.PI * 0.86, a1 = -Math.PI * 0.14, ar = r * 0.64, px = x, py = y + r * 0.16;
    pen.stroke(arcPts(px, py, ar, a0, a1, 24), { w: 'fine', nib: 0.2, pool: 0.2, wobble: 0.2, seed: seed + 2, alpha: 0.9 * alpha }, part(t, 0.1, 0.6));
    const notches: Pts[] = [];
    for (let k = 0; k < 3; k++) {
      const a = a0 + ((k + 0.5) / 3) * (a1 - a0), len = r * (0.14 + k * 0.05);
      notches.push([px + Math.cos(a) * (ar - len * 0.5), py + Math.sin(a) * (ar - len * 0.5), px + Math.cos(a) * (ar + len * 0.5), py + Math.sin(a) * (ar + len * 0.5)]);
    }
    pen.strokes(notches, { w: 'bold', nib: 0, pool: 0.4, alpha: 0.9 * alpha, seed: seed + 3 }, part(t, 0.3, 0.8), 0.4);
    // the sail, under the arc
    woodcut(pen, HUD_ICONS.sail, x, y + r * 0.5, r * 0.6, 'iron', alpha * part(t, 0.2, 0.8));
    // the needle, in rubric, from the pivot into its notch
    const a = a0 + ((clamp(at, 0, 2) + 0.5) / 3) * (a1 - a0), nt = part(t, 0.6, 1);
    pen.stroke([px, py, px + Math.cos(a) * ar * 1.04, py + Math.sin(a) * ar * 1.04], { w: 'bold', ink: 'rubric', nib: 0.1, pool: 0.5, taper: 1, seed: seed + 4, alpha }, nt);
    pen.dot(px, py, Math.max(1.6, r * 0.07), 'iron', 0.9 * alpha * nt);
  });
  g.restore();
}

// ── on the world itself: the stick and the reticle, in lead white ──

/** The stick: a ring of lead white where the thumb set it down, the nub a small paper disc pushed (dx, dy) from it. */
export function stickRing(pen: Pen, x: number, y: number, r: number, dx: number, dy: number, press = 0, alpha = 1, t = 1): void {
  if (t <= 0) return;
  const n = Math.max(48, Math.ceil(r));
  pen.rule([arcPts(x, y, r, -Math.PI / 2, -Math.PI / 2 + TAU * part(t, 0, 0.7), n)], { w: 'fine', ink: 'white', alpha: 0.8 * alpha, wobble: 0.3, seed: 81 });
  pen.rule([arcPts(x, y, r * 0.9, 0, TAU * part(t, 0.1, 0.8), n)], { w: 'hair', ink: 'white', alpha: 0.5 * alpha, wobble: 0.2, seed: 82 }, 1, [0, 4]);
  const nt = part(t, 0.4, 1);
  if (nt > 0) roundButton(pen, x + dx, y + dy, r * 0.36, null, { press, alpha: alpha * nt, seed: 83 });
}

/** The reticle: a small cross in lead white over its ink shadow, open at the centre, where the guns bear. */
export function reticle(pen: Pen, x: number, y: number, r: number, alpha = 1, t = 1): void {
  if (t <= 0) return;
  const gap = r * 0.32, arms: Pts[] = [[x - r, y, x - gap, y], [x + gap, y, x + r, y], [x, y - r, x, y - gap], [x, y + gap, x, y + r]];
  const w = Math.max(pen.widths.fine, r * 0.12);
  pen.strokes(arms.map((a) => a.map((v, q) => v + (q & 1 ? 0.8 : 0.6))), { w: w * 1.3, ink: 'iron', nib: 0, pool: 0, taper: 0, alpha: 0.6 * alpha, seed: 91 }, t, 0.5);
  pen.strokes(arms, { w, ink: 'white', nib: 0, pool: 0, taper: 0, alpha: 0.92 * alpha, seed: 92 }, t, 0.5);
}

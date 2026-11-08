// The folios' one card (issue #54): a woodcut on a slip of parchment, ruled round in its rarity's ink. A card still
// locked is in faint ink with its unlock under the drawing, a level's numeral or a rank's seal; a card worn has a small
// gilt seal pressed in its corner (the sheet presses that one, over the baked card). Every folio's cards, and the
// locker's six kinds of drawing, come from here.
import {
  WASH, drawEmblem, prims, shape, trace, woodcut,
  type Illumination, type InkName, type Pen, type Pts,
} from '../chart/index.ts';
import { HULL } from '../icons/sets/hud.ts';
import { LOOT_INKS } from '../render/actors/loot.ts';
import type { CosmeticKind, CosmeticView } from '../ui/model.ts';
import { paper, slipPath } from './instruments.ts';

/** A drawing on a card, centred at (x, y), `size` across. */
export type Art = (pen: Pen, x: number, y: number, size: number, alpha: number) => void;

/** The rank's tiers (Iron to Legend) as the illuminations rarity is drawn in, plainest first. */
export const TIER_ILLUMINATION: readonly Illumination[] = ['ink', 'ink', 'rubric', 'rubric', 'redBlue', 'redBlue', 'silver', 'gold'];

/** A card's rarity as the ink it is ruled in (the loot's five, so a rarity reads the same in and out of a match). */
export const rarityInk = (rarity: number): InkName => LOOT_INKS[rarity] ?? 'iron';

export interface CardFace {
  w: number;
  h: number;
  edge: InkName;
  locked: boolean;
  art: Art;
  /** Its unlock, drawn at (x, y) under the art while locked. */
  unlock: (pen: Pen, gc: CanvasRenderingContext2D, x: number, y: number) => void;
  seed: number;
}

/** Draws a card centred at (x, y). */
export function card(pen: Pen, gc: CanvasRenderingContext2D, x: number, y: number, c: CardFace): void {
  paper(pen, slipPath(x, y, c.w, c.h, c.seed), { burn: 3.5 });
  const alpha = c.locked ? 0.42 : 1, i = 5, seed = c.seed;
  const x0 = x - c.w / 2 + i, y0 = y - c.h / 2 + i, x1 = x + c.w / 2 - i, y1 = y + c.h / 2 - i;
  const box = (d: number): Pts => [x0 + d, y0 + d, x1 - d, y0 + d, x1 - d, y1 - d, x0 + d, y1 - d, x0 + d, y0 + d];
  pen.stroke(box(0), { w: 'bold', ink: c.edge, nib: 0.2, pool: 0.2, wobble: 0.25, seed, alpha: 0.92 * alpha });
  pen.rule([box(3.5)], { w: 'hair', ink: c.edge, alpha: 0.6 * alpha, wobble: 0.2, seed: seed + 1 });
  const unlockY = y + c.h / 2 - c.h * 0.17;
  c.art(pen, x, c.locked ? y - c.h * 0.12 : y - c.h * 0.02, c.w * 0.6, c.locked ? 0.34 : 1);
  if (c.locked) c.unlock(pen, gc, x, unlockY);
}

// ── the locker's drawings ──

/** Iron for a drawing's outlines. */
const line = (seed: number, alpha: number, w: 'hair' | 'fine' | 'bold' = 'fine') =>
  ({ w, nib: 0.2, pool: 0.2, wobble: 0.2, seed, alpha: 0.92 * alpha }) as const;

const closed = (pts: Pts): Pts => {
  pts.push(pts[0], pts[1]);
  return pts;
};

/** A square sail on its yard, its sides bellied out and its foot drawn up, as a closed outline. */
function sailOutline(x: number, y: number, s: number, inset = 0): Pts {
  const w = s * 0.42 - inset, h = s * 0.4 - inset, top = y - h, foot = y + h, out: Pts = [x - w, top];
  for (let i = 0; i <= 12; i++) {
    const u = i / 12;
    out.push(x + w + s * 0.05 * Math.sin(u * Math.PI), top + (foot - top) * u);
  }
  for (let i = 1; i < 12; i++) {
    const u = i / 12;
    out.push(x + w - 2 * w * u, foot - s * 0.08 * Math.sin(u * Math.PI));
  }
  for (let i = 12; i >= 0; i--) {
    const u = i / 12;
    out.push(x - w - s * 0.05 * Math.sin(u * Math.PI), top + (foot - top) * u);
  }
  return closed(out);
}

function sail(pen: Pen, x: number, y: number, s: number, hex: string, alpha: number, over?: (p: Path2D) => void): void {
  const out = sailOutline(x, y, s), p = shape(out), top = y - s * 0.4;
  pen.wash(p, hex, { alpha: 0.95 * alpha, edge: 0.5, gran: 0.4, shift: [0, 0] });
  over?.(p);
  pen.stroke(out, line(61, alpha));
  pen.rule([[x - s * 0.52, top, x + s * 0.52, top], [x, top - s * 0.07, x, top + s * 0.02]], line(62, alpha, 'bold'));
}

const CLOTH = '#e7dcc2';

/** A sail bearing a pattern, in vermilion on bare cloth: one for each of the sail shader's six. */
function pattern(pen: Pen, x: number, y: number, s: number, id: string, alpha: number): void {
  sail(pen, x, y, s, CLOTH, alpha, (clip) => {
    const g = pen.g, w = s * 0.46, h = s * 0.4;
    const band = (...pts: number[]) => pen.wash(shape(closed(pts)), WASH.vermilion, { alpha: 0.92 * alpha, edge: 0.45, gran: 0.5, shift: [0, 0] });
    g.save();
    g.clip(clip);
    if (id === 'singleStripe') band(x - w * 0.2, y - h, x + w * 0.2, y - h, x + w * 0.2, y + h, x - w * 0.2, y + h);
    else if (id === 'twinBands') {
      for (const yy of [y - h * 0.46, y + h * 0.18]) band(x - w, yy, x + w, yy, x + w, yy + h * 0.28, x - w, yy + h * 0.28);
    } else if (id === 'quartered') {
      band(x - w, y - h, x, y - h, x, y, x - w, y);
      band(x, y, x + w, y, x + w, y + h, x, y + h);
    } else if (id === 'chevron') {
      band(x - w, y - h * 0.5, x, y + h * 0.42, x + w, y - h * 0.5, x + w, y - h * 0.02, x, y + h * 0.9, x - w, y - h * 0.02);
    } else if (id === 'laurelEdge') {
      const rim = sailOutline(x, y, s, s * 0.05);
      pen.stroke(rim, { w: s * 0.05, ink: 'rubric', nib: 0.2, pool: 0.2, wobble: 0.3, seed: 63, alpha: 0.9 * alpha });
      for (let i = 0; i < rim.length; i += 10) pen.dot(rim[i], rim[i + 1], s * 0.03, 'green', 0.9 * alpha);
    }
    g.restore();
  });
}

/** Her hull in profile, washed in its paint, with her wale and a row of ports. */
function hull(pen: Pen, x: number, y: number, s: number, hex: string, alpha: number): void {
  const k = s / 24, ox = x - s / 2, oy = y - s / 2 - s * 0.02, out = closed(trace(HULL, k, ox, oy)[0]);
  pen.wash(shape(out), hex, { alpha: 0.96 * alpha, edge: 0.5, gran: 0.4, shift: [0, 0] });
  pen.stroke(out, line(71, alpha));
  pen.rule([[ox + k * 3, oy + k * 11, ox + k * 20.4, oy + k * 10.4]], line(72, alpha * 0.8, 'hair'));
  for (let i = 0; i < 5; i++) pen.dot(ox + k * (6.2 + i * 2.9), oy + k * (9 - i * 0.15), k * 0.62, 'iron', 0.8 * alpha);
}

/** Her wake: three ribbons of water washed in its colour, widening aft, with sparks in them where it glitters. */
function wakeLines(pen: Pen, x: number, y: number, s: number, hex: string, sparkles: boolean, alpha: number): void {
  for (let i = 0; i < 3; i++) {
    const yy = y - s * 0.22 + i * s * 0.22, top: Pts = [], bottom: Pts = [];
    for (let j = 0; j <= 16; j++) {
      const u = j / 16, px = x - s * 0.46 + s * 0.92 * u, wv = Math.sin(u * Math.PI * 2.5 + i * 1.3) * s * 0.035, tk = s * (0.015 + u * 0.05);
      top.push(px, yy + wv - tk);
      bottom.push(px, yy + wv + tk);
    }
    const outline = top.slice();
    for (let j = bottom.length - 2; j >= 0; j -= 2) outline.push(bottom[j], bottom[j + 1]);
    pen.wash(shape(closed(outline)), hex, { alpha: 0.95 * alpha, edge: 0.45, gran: 0.4, shift: [0, 0] });
    pen.stroke(top, line(81 + i, alpha * 0.85, 'hair'));
    pen.stroke(bottom, line(84 + i, alpha * 0.85, 'hair'));
  }
  if (sparkles) for (let i = 0; i < 7; i++) pen.dot(x - s * 0.36 + (i / 6) * s * 0.74, y + Math.sin(i * 4.1) * s * 0.28, s * 0.022, 'iron', 0.85 * alpha);
}

/** A cosmetic as its card draws it. */
export function cosmeticArt(v: CosmeticView): Art {
  const c = v.colour ?? CLOTH;
  switch (v.kind) {
    case 'sailColour': return (pen, x, y, s, a) => sail(pen, x, y, s, c, a);
    case 'sailPattern': return (pen, x, y, s, a) => pattern(pen, x, y, s, v.id, a);
    case 'hullPaint': return (pen, x, y, s, a) => hull(pen, x, y, s, c, a);
    case 'figurehead': return (pen, x, y, s, a) => woodcut(pen, prims(`head.${v.id}`), x, y, s, 'iron', a);
    case 'emblem': return (pen, x, y, s, a) => drawEmblem(pen.g, pen.paper, v.id, '#332114', x, y, s * 1.1, pen.dpr, a);
    case 'wake': return (pen, x, y, s, a) => wakeLines(pen, x, y, s, c, v.id !== 'foam', a);
  }
}

/** Each kind's mark at the head of its section in the locker. */
export const kindArt: Record<CosmeticKind, Art> = {
  sailColour: (pen, x, y, s, a) => sail(pen, x, y, s, WASH.azure, a),
  sailPattern: (pen, x, y, s, a) => pattern(pen, x, y, s, 'chevron', a),
  hullPaint: (pen, x, y, s, a) => hull(pen, x, y, s, '#6b4630', a),
  figurehead: (pen, x, y, s, a) => woodcut(pen, prims('head.heron'), x, y, s, 'iron', a),
  emblem: (pen, x, y, s, a) => drawEmblem(pen.g, pen.paper, 'gull', '#332114', x, y, s * 1.1, pen.dpr, a),
  wake: (pen, x, y, s, a) => wakeLines(pen, x, y, s, WASH.turquoise, false, a),
};

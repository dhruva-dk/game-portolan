// The two drawings that stand where words would: a ship standing out to sea, on the button that starts a match, and
// the same ship stooping down a gust, on the one that leaves the Gale.
import type { Colours } from './emblem.ts';
import { galleon } from './galleon.ts';
import { WASH } from './inks.ts';
import { clamp } from './noise.ts';
import { cubic, shape, type Pen, type Pts } from './pen.ts';

const part = (t: number, a: number, b: number): number => clamp((t - a) / (b - a));

/** A row of the engravers' sea from x0 to x1: arcs of about 2r hanging from the cusps between them. */
function swell(x0: number, x1: number, y: number, r: number): Pts {
  const n = Math.max(1, Math.round((x1 - x0) / (r * 2))), w = (x1 - x0) / n, out: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = x0 + i * w;
    cubic(out, a, y, a + w * 0.26, y + r * 1.1, a + w * 0.74, y + r * 1.1, a + w, y, 7);
  }
  return out;
}

/** Wind as the old charts draw it: a line along +x from (x, y), its end wound up in a curl of radius r above it. */
function windLine(x: number, y: number, len: number, r: number): Pts {
  const out: number[] = [], run = 14, turns = 22;
  for (let i = 0; i <= run; i++) {
    const u = i / run;
    out.push(x + len * u, y + Math.sin(u * Math.PI) * r * 0.22);
  }
  const cy = y - r;
  for (let i = 1; i <= turns; i++) {
    const u = i / turns, a = u * Math.PI * 3, rr = r * (1 - u * 0.72);
    out.push(x + len + Math.sin(a) * rr, cy + Math.cos(a) * rr);
  }
  return out;
}

/** The sea under a ship: a wash from the waterline down `deep`, and rows of swell over it. */
function sea(pen: Pen, x: number, y: number, w: number, deep: number, seed: number, t: number): void {
  const x0 = x - w / 2, x1 = x + w / 2, r = deep * 0.2, mid = y + deep * 0.45;
  // the wash lies in a long lens, so it ends in the paper rather than at a corner
  const lens = cubic([], x0, mid, x0 + w * 0.16, y - deep * 0.05, x1 - w * 0.16, y - deep * 0.05, x1, mid, 18);
  cubic(lens, x1, mid, x1 - w * 0.12, y + deep * 1.08, x0 + w * 0.12, y + deep * 1.08, x0, mid, 18);
  pen.wash(shape(lens), WASH.azure, { alpha: 0.42, edge: 0.7, gran: 0.7, shift: [0, 0] }, part(t, 0, 0.35));
  const rows: Pts[] = [], inset = [0.14, 0.04, 0.2];
  for (let i = 0; i < 3; i++) rows.push(swell(x0 + w * inset[i], x1 - w * inset[i], y + deep * (0.12 + i * 0.3), r));
  pen.rule(rows, { w: 'fine', alpha: 0.85, wobble: 0.25, seed }, part(t, 0.45, 1));
}

/** A ship setting out, her waterline a quarter of the way below the middle of a box w × h centred at (x, y). */
export function setSail(pen: Pen, cap: Colours, x: number, y: number, w: number, h: number, o: { seed?: number } = {}, t = 1): void {
  if (t <= 0) return;
  const seed = o.seed ?? 31, water = y + h * 0.25, size = h * 0.68;
  sea(pen, x, water - h * 0.02, w * 0.8, h * 0.22, seed, t);
  pen.rule([
    windLine(x - w * 0.36, y - h * 0.16, size * 0.3, size * 0.1),
    windLine(x - w * 0.31, y + h * 0.05, size * 0.22, size * 0.075),
  ], { w: 'fine', alpha: 0.8, nib: 0.2, taper: 0.5, seed: seed + 3 }, part(t, 0.6, 1));
  galleon(pen, cap, x + size * 0.14, water, { size, facing: 1, gilt: true, flutter: 0.6, seed: seed + 7 }, part(t, 0.1, 0.8));
}

/** A ship stooping down a gust, in a box about 2.9 × 2.3 `size` centred at (x, y), the sea small below her. */
export function gust(pen: Pen, cap: Colours, x: number, y: number, size: number, o: { seed?: number } = {}, t = 1): void {
  if (t <= 0) return;
  const g = pen.g, seed = o.seed ?? 37, ship = size * 1.42;
  sea(pen, x, y + size * 0.74, size * 2.4, size * 0.34, seed, t);
  // the gust, blowing down the way she stoops
  g.save();
  g.translate(x - size * 1.25, y - size * 0.75);
  g.rotate(0.6);
  pen.rule([
    windLine(0, 0, size * 0.55, size * 0.13),
    windLine(size * 0.05, size * 0.36, size * 0.66, size * 0.16),
    windLine(size * 0.4, size * 0.66, size * 0.42, size * 0.11),
  ], { w: 'fine', alpha: 0.9, nib: 0.2, taper: 0.5, seed: seed + 3 }, part(t, 0.5, 1));
  g.restore();
  g.save();
  g.translate(x + size * 0.2, y + size * 0.28);
  g.rotate(0.6);
  galleon(pen, cap, 0, 0, { size: ship, facing: 1, flutter: 1.4, seed: seed + 7 }, part(t, 0, 0.8));
  g.restore();
}

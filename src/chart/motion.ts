// The chart's motion. Nothing appears or leaves without one of these:
// - ink-in: a drawing inks itself in as its t runs 0..1 (every drawing in the kit takes t; `part` shares one t out);
// - unroll: a sheet rolls open from its edge, the roll's radius shrinking as it pays out, shadowing the sheet and the
//   world either side; run backwards, it rolls up;
// - fly-to: an object lifts off the sheet, travels an arc to where it goes (larger as it nears the eye, its shadow
//   falling away beneath it) and lands with a stamp: pressed into the paper, a ring of ink and a spatter round it;
// - stagger: a list inks in one after another, each starting before the last has finished;
// - dry: ink fades out, paling before it goes (the pen's `dry` mood; `dryAlpha` for anything baked).
// All are pure functions of time, so a captured strip shows the same instants every run.
import { clamp, lerp, smooth } from './noise.ts';
import type { Baked } from './sheet.ts';
import type { Paper } from './paper.ts';

export const ease = {
  out: (t: number) => 1 - Math.pow(1 - clamp(t), 3),
  in: (t: number) => Math.pow(clamp(t), 3),
  inOut: (t: number) => {
    t = clamp(t);
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  },
  /** Overshoots and settles: a thing landing, a seal springing back. */
  back: (t: number) => {
    t = clamp(t);
    const c = 1.7;
    return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
  },
};

/** The share of t that falls between a and b, 0..1: one part of a drawing's ink-in. */
export const part = (t: number, a: number, b: number): number => (t >= 1 ? 1 : clamp((t - a) / (b - a)));

/** Seconds since `start` over `dur`, 0..1. */
export const progress = (now: number, start: number, dur: number): number => clamp((now - start) / dur);

/**
 * Item i of n in a list that inks in over t: each takes `each` of the whole, starting evenly through what remains, so
 * each begins before the one before it has finished.
 */
export function stagger(t: number, i: number, n: number, each = 0.4): number {
  if (n <= 1) return clamp(t / each);
  const start = (i / (n - 1)) * (1 - each);
  return clamp((t - start) / each);
}

/** How opaque a baked thing is as it dries away, t 0..1: it pales slowly, then goes. */
export const dryAlpha = (t: number): number => Math.pow(1 - clamp(t), 1.4) * (1 - 0.15 * smooth(0, 0.4, t));

export interface Flight {
  x: number;
  y: number;
  /** Size, 1 at rest: larger in the air, squashed as it lands. */
  scale: number;
  /** Height above the sheet, 0..1. */
  lift: number;
  /** Its shadow's offset and darkness. */
  shadow: { dx: number; dy: number; alpha: number };
  /** Landed yet, and how far through its stamp (0..1). */
  landed: boolean;
  stamp: number;
}

/**
 * Where a thing flying from `from` to `to` is at t: an arc bowed up by `arc` of its length, eased in and out, landing
 * at `land` of the time and stamping through the rest.
 */
export function flight(from: { x: number; y: number }, to: { x: number; y: number }, t: number, arc = 0.32, land = 0.78): Flight {
  const dist = Math.hypot(to.x - from.x, to.y - from.y);
  const u = ease.inOut(clamp(t / land));
  const cx = (from.x + to.x) / 2, cy = (from.y + to.y) / 2 - dist * arc;
  const a = (1 - u) * (1 - u), b = 2 * (1 - u) * u, c = u * u;
  const lift = t < land ? Math.sin(Math.PI * u) : 0;
  const k = clamp((t - land) / (1 - land));
  const landed = t >= land;
  // pressed into the paper as it lands, then back
  const stampSquash = landed ? 1 - 0.14 * Math.sin(Math.PI * Math.min(1, k * 2.2)) * (1 - k) : 1;
  return {
    x: a * from.x + b * cx + c * to.x,
    y: a * from.y + b * cy + c * to.y,
    scale: (1 + 0.28 * lift) * stampSquash,
    lift,
    shadow: { dx: 5 + 12 * lift, dy: 8 + 26 * lift, alpha: 0.32 * (1 - 0.55 * lift) },
    landed,
    stamp: landed ? k : 0,
  };
}

/**
 * Draws a baked sheet unrolled to t, its top left at (x, y): open from its left edge rightward ('right'), from its
 * right edge leftward ('left') or from its top downward ('down'). The roll lies at the open edge, its back showing,
 * shaded as a cylinder, its end showing the wound layers, shadowing the sheet behind it and the world in front.
 */
export function unroll(g: CanvasRenderingContext2D, paper: Paper, b: Baked, x: number, y: number, t: number, dir: 'right' | 'left' | 'down' = 'right', dpr = b.dpr): void {
  if (t <= 0) return;
  const W = b.w, H = b.h, along = dir === 'down' ? H : W, across = dir === 'down' ? W : H;
  if (t >= 1) {
    g.drawImage(b.canvas, x - b.pad, y - b.pad, W + b.pad * 2, H + b.pad * 2);
    return;
  }
  const open = along * ease.out(t);
  const rMax = Math.min(across * 0.07, 22), rMin = 2.2;
  const r = Math.sqrt(rMin * rMin + (rMax * rMax - rMin * rMin) * (1 - open / along));
  // the flat part, up to the roll
  g.save();
  g.beginPath();
  if (dir === 'right') g.rect(x - b.pad, y - b.pad, open + b.pad, H + b.pad * 2);
  else if (dir === 'left') g.rect(x + W - open, y - b.pad, open + b.pad, H + b.pad * 2);
  else g.rect(x - b.pad, y - b.pad, W + b.pad * 2, open + b.pad);
  g.clip();
  g.drawImage(b.canvas, x - b.pad, y - b.pad, W + b.pad * 2, H + b.pad * 2);
  g.restore();
  // a local frame for the roll: u along the opening, v across it
  g.save();
  if (dir === 'right') g.setTransform(dpr, 0, 0, dpr, (x + open) * dpr, y * dpr);
  else if (dir === 'left') g.setTransform(-dpr, 0, 0, dpr, (x + W - open) * dpr, y * dpr);
  else g.setTransform(0, dpr, dpr, 0, x * dpr, (y + open) * dpr);
  // its shadow on the sheet behind it, and on the world ahead
  const back = g.createLinearGradient(-r - 10, 0, -r * 0.2, 0);
  back.addColorStop(0, 'rgba(40,22,8,0)');
  back.addColorStop(1, 'rgba(40,22,8,0.35)');
  g.fillStyle = back;
  g.fillRect(-r - 10, 0, r * 0.8 + 10, across);
  const ahead = g.createLinearGradient(r * 0.6, 0, r + 14 + r * 0.5, 0);
  ahead.addColorStop(0, 'rgba(10,6,2,0.45)');
  ahead.addColorStop(1, 'rgba(10,6,2,0)');
  g.fillStyle = ahead;
  g.fillRect(r * 0.6, 4, r * 0.5 + 14, across + 4);
  // the roll: paper, its back out, lit as a cylinder from the top left
  const body = new Path2D();
  body.rect(-r, -1.5, r * 2, across + 3);
  g.fillStyle = paper.anchor(g, paper.surface, 0, 0, dpr);
  g.fill(body);
  const shade = g.createLinearGradient(-r, 0, r, 0);
  shade.addColorStop(0, 'rgba(70,40,14,0.55)');
  shade.addColorStop(0.28, 'rgba(255,248,226,0.18)');
  shade.addColorStop(0.42, 'rgba(255,248,226,0.3)');
  shade.addColorStop(0.75, 'rgba(70,40,14,0.25)');
  shade.addColorStop(1, 'rgba(40,20,6,0.7)');
  g.fillStyle = shade;
  g.fill(body);
  // the near end: the wound layers, edge on
  g.fillStyle = 'rgba(150,112,70,1)';
  g.beginPath();
  g.ellipse(0, across + 1.5, r, r * 0.32, 0, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = 'rgba(80,50,22,0.7)';
  g.lineWidth = 0.5;
  for (let k = 1; k <= 4; k++) {
    g.beginPath();
    g.ellipse(-r * 0.06 * k, across + 1.5, r * (1 - k * 0.2), r * 0.32 * (1 - k * 0.2), 0, 0, Math.PI * 2);
    g.stroke();
  }
  // its outline in the light
  g.strokeStyle = 'rgba(60,36,14,0.6)';
  g.lineWidth = 0.7;
  g.stroke(body);
  g.restore();
}

/** A sheet thinning to let the world show through it (the title over the loading world, the dive). */
export const thin = (t: number): number => lerp(1, 0, ease.inOut(t));

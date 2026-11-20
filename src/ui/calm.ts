// The Storm's calm as both charts ink it (minimap.ts, globe.ts): its ring of
// points on the planet, the circle it next closes to (white, dotted, over a
// faint iron halo), and the way in from outside it (a white line over iron,
// ending in an arrowhead), drawn in canvas 2D. Each takes the scale its lines
// are drawn at: px a line's CSS px is (the device's pixels on the minimap, the
// UI's size on the globe).

import {
  add,
  along,
  distance,
  dot,
  frameAt,
  normalize,
  scale,
  type Vec3,
} from '../world/sphere.ts';
import { INK, alpha } from './ink.ts';

export interface Storm {
  centre: Vec3;
  radius: number;
}

/** The next circle's faint iron halo. */
const HALO = alpha(INK.iron, 0.45);
/**
 * The way in's line: iron under white, each its width, px at the drawn size.
 */
const WAY = [
  [INK.iron, 3.6],
  [INK.white, 1.8],
] as const;
/** The next circle's dots, and none. */
const DOTS = [0.1, 4.4],
  NONE: number[] = [];

/** The small circle `radius` metres round `centre`, as `n` points. */
function stormRing(storm: Storm, n = 96): Vec3[] {
  const { north, east } = frameAt(storm.centre);
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return along(
      storm.centre,
      add(scale(north, Math.cos(a)), east, Math.sin(a)),
      storm.radius
    ).p;
  });
}

/**
 * Rings of the Storm as traced (stormRing, `n` points), kept by their centre
 * and radius (metres) so a frame traces none afresh until the calm closes; the
 * oldest let go past `keep`.
 */
export function createRings(keep: number, n = 180) {
  const rings: { centre: Vec3; radius: number; ring: Vec3[] }[] = [];
  return (centre: Vec3, radius: number): Vec3[] => {
    const [x, y, z] = centre;
    for (const k of rings)
      if (
        k.radius === radius &&
        k.centre[0] === x &&
        k.centre[1] === y &&
        k.centre[2] === z
      )
        return k.ring;
    if (rings.length >= keep) rings.shift();
    const c: Vec3 = [x, y, z],
      ring = stormRing({ centre: c, radius }, n);
    rings.push({ centre: c, radius, ring });
    return ring;
  };
}

/**
 * The way in from `at` to the nearest point of `goal`'s circle: the direction
 * she would set out on (a unit tangent at `at`) and the metres to go; null
 * inside it.
 */
export function wayIn(at: Vec3, goal: Storm): { to: Vec3; gap: number } | null {
  const gap = distance(at, goal.centre) - goal.radius;
  if (gap <= 0) return null;
  return { to: normalize(add(goal.centre, at, -dot(goal.centre, at))), gap };
}

/**
 * Begins the way in's line over the planet as a path: from `at` along `way`'s
 * great circle to the circle, a point every `step` metres (at most 120), each
 * placed on the screen by `place` (null: out of sight), only the runs in sight
 * drawn. Returns where its head stands, at its end or where it last went out
 * of sight; null if none of it is seen.
 */
export function traceWay(
  ctx: CanvasRenderingContext2D,
  at: Vec3,
  way: { to: Vec3; gap: number },
  step: number,
  place: (q: Vec3) => { x: number; y: number } | null
): Tip | null {
  const n = Math.min(120, Math.max(2, Math.ceil(way.gap / step)));
  let pen = false,
    paired = false,
    px = 0,
    py = 0,
    x = 0,
    y = 0;
  ctx.beginPath();
  for (let i = 0; i <= n; i++) {
    const p = place(along(at, way.to, (way.gap * i) / n).p);
    if (!p) {
      pen = false;
      continue;
    }
    if (pen) ctx.lineTo(p.x, p.y);
    else ctx.moveTo(p.x, p.y);
    paired = pen;
    pen = true;
    px = x;
    py = y;
    x = p.x;
    y = p.y;
  }
  const l = Math.hypot(x - px, y - py);
  return paired && l > 1e-6
    ? { x, y, ux: (x - px) / l, uy: (y - py) / l }
    : null;
}

/** An arrowhead's path, its tip `l` up from (0, 0). */
export const head = (l: number) =>
  `M0 ${-l}L${l * 0.62} ${l * 0.7}L0 ${l * 0.32}L${-l * 0.62} ${l * 0.7}Z`;

/** Strokes the path begun as the next circle, its lines `s` px a CSS px. */
export function strokeNext(ctx: CanvasRenderingContext2D, s: number) {
  ctx.lineCap = 'round';
  ctx.strokeStyle = HALO;
  ctx.lineWidth = 3 * s;
  ctx.setLineDash([DOTS[0] * s, DOTS[1] * s]);
  ctx.stroke();
  ctx.strokeStyle = INK.white;
  ctx.lineWidth = 2 * s;
  ctx.stroke();
  ctx.setLineDash(NONE);
}

/** Strokes the path begun as the way in's line, its lines `s` px a CSS px. */
export function strokeWay(ctx: CanvasRenderingContext2D, s: number) {
  ctx.lineCap = ctx.lineJoin = 'round';
  for (const [ink, w] of WAY) {
    ctx.strokeStyle = ink;
    ctx.lineWidth = w * s;
    ctx.stroke();
  }
}

/** Where the way in's arrowhead stands: its tip just past (x, y), pointing along the unit (ux, uy). */
interface Tip {
  x: number;
  y: number;
  ux: number;
  uy: number;
}

/** The way in's arrowhead at `tip`, `s` px a CSS px. */
export function wayHead(ctx: CanvasRenderingContext2D, tip: Tip, s: number) {
  const { x, y, ux, uy } = tip,
    a = 5.5 * s,
    b = 3.8 * s;
  ctx.beginPath();
  ctx.moveTo(x + ux * 2 * s, y + uy * 2 * s);
  ctx.lineTo(x - ux * a - uy * b, y - uy * a + ux * b);
  ctx.lineTo(x - ux * a + uy * b, y - uy * a - ux * b);
  ctx.closePath();
  ctx.fillStyle = INK.white;
  ctx.strokeStyle = INK.iron;
  ctx.lineWidth = 1.2 * s;
  ctx.lineJoin = 'round';
  ctx.stroke();
  ctx.fill();
}

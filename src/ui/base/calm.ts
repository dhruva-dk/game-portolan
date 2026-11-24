import {
  add,
  along,
  distance,
  dot,
  frameAt,
  normalize,
  scale,
  type Vec3,
} from '../../world/sphere.ts';
import { INK, alpha } from './ink.ts';

export interface Storm {
  center: Vec3;
  radius: number;
}

const HALO = alpha(INK.iron, 0.45);
const WAY = [
  [INK.iron, 3.6],
  [INK.white, 1.8],
] as const;
const DOTS = [0.1, 4.4],
  NONE: number[] = [];

function stormRing(storm: Storm, n = 96): Vec3[] {
  const { north, east } = frameAt(storm.center);
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return along(
      storm.center,
      add(scale(north, Math.cos(a)), east, Math.sin(a)),
      storm.radius
    ).p;
  });
}

export function createRings(keep: number, n = 180) {
  const rings: { center: Vec3; radius: number; ring: Vec3[] }[] = [];
  return (center: Vec3, radius: number): Vec3[] => {
    const [x, y, z] = center;
    for (const k of rings)
      if (
        k.radius === radius &&
        k.center[0] === x &&
        k.center[1] === y &&
        k.center[2] === z
      )
        return k.ring;
    if (rings.length >= keep) rings.shift();
    const c: Vec3 = [x, y, z],
      ring = stormRing({ center: c, radius }, n);
    rings.push({ center: c, radius, ring });
    return ring;
  };
}

export function wayIn(at: Vec3, goal: Storm): { to: Vec3; gap: number } | null {
  const gap = distance(at, goal.center) - goal.radius;
  if (gap <= 0) return null;
  return { to: normalize(add(goal.center, at, -dot(goal.center, at))), gap };
}

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

export const head = (l: number) =>
  `M0 ${-l}L${l * 0.62} ${l * 0.7}L0 ${l * 0.32}L${-l * 0.62} ${l * 0.7}Z`;

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

export function strokeWay(ctx: CanvasRenderingContext2D, s: number) {
  ctx.lineCap = ctx.lineJoin = 'round';
  for (const [ink, w] of WAY) {
    ctx.strokeStyle = ink;
    ctx.lineWidth = w * s;
    ctx.stroke();
  }
}

interface Tip {
  x: number;
  y: number;
  ux: number;
  uy: number;
}

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

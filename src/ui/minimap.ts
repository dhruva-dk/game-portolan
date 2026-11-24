import type { Sea } from '../snapshot.ts';
import { R, along, dot, type Vec3 } from '../world/sphere.ts';
import {
  createRings,
  head,
  strokeNext,
  strokeWay,
  wayHead,
  wayIn,
  type Storm,
} from './calm.ts';
import type { Shores } from './coasts.ts';
import { laid, layAt, meters, newLay, place, type LayOnto } from './disc.ts';
import { createGround } from './ground.ts';
import { createHeld } from './held.ts';
import { BRASS, INK, PAPER, WASH, alpha, dyeOn, svgNode } from './ink.ts';
import { view } from './ui.ts';

const SPAN = 408;
const RATE = 30;
const STORM = alpha(WASH.storm, 0.4),
  EDGE = INK.storm;
const RINGS = 8;

export interface More {
  gilt?: boolean;
  calm?: Storm;
  next?: Storm | null;
  sea?: Sea;
  own?: number | null;
}

const same = (a: number, b: number) => a === b || (a !== a && b !== b);

export function createMinimap(
  host: HTMLElement,
  size: number,
  { coasts, ground }: Shores
) {
  const r = size / 2,
    inner = r - 8;
  host.style.width = host.style.height = `${size}px`;
  const rim = svgNode(
    size,
    size,
    `<circle cx="${r}" cy="${r}" r="${r}" fill="${BRASS}" filter="url(#sh)"/>` +
      `<circle cx="${r}" cy="${r}" r="${r - 4}" fill="none" stroke="${PAPER}" stroke-width="5" stroke-dasharray="2.2 2.2"/>` +
      `<circle cx="${r}" cy="${r}" r="${inner + 0.5}" fill="${WASH.sea}" stroke="${INK.iron}" stroke-width="1"/>`
  );
  rim.style.position = 'absolute';
  const canvas = document.createElement('canvas');
  const dpr = Math.min(view.dpr * view.k, 4);
  canvas.width = canvas.height = Math.round(inner * 2 * dpr);
  canvas.style.cssText = `position:absolute;left:${r - inner}px;top:${r - inner}px;width:${inner * 2}px;height:${inner * 2}px;border-radius:50%`;
  const over = svgNode(
    size,
    size,
    `<path transform="translate(${r} ${r})" d="M0 ${-r + 1}l-4.5 -0.5l4.5 9l4.5 -9z" fill="${WASH.vermilion}" stroke="${INK.iron}" stroke-width=".8"/>` +
      '<g></g>'
  );
  over.style.position = 'absolute';
  host.append(rim, canvas, over);
  const her = over.lastElementChild!;
  const ctx = canvas.getContext('2d')!;
  const held = createHeld(SPAN * 1.15);
  const land = createGround(ground.height, SPAN + 50, ground.top);
  const rings = createRings(RINGS),
    ringOf = (s: Storm) => rings(s.center, s.radius);
  const stats = { draws: 0, ms: 0, since: performance.now() };

  const l = newLay();
  const lay: LayOnto = (o, e, n, w, h, m) => {
    const t = laid(l, o, e, n, w, h, m);
    ctx.setTransform(t[0], t[1], t[2], t[3], t[4], t[5]);
  };
  const trace = (ring: readonly Vec3[], closed: boolean) => {
    ctx.beginPath();
    for (let i = 0; i < ring.length; i++) {
      const p = place(l, ring[i]);
      if (i) ctx.lineTo(p[0], p[1]);
      else ctx.moveTo(p[0], p[1]);
    }
    if (closed) ctx.closePath();
  };
  const bearing = (t: Vec3) =>
    (Math.atan2(dot(t, l.right), dot(t, l.ahead)) * 180) / Math.PI;

  const was = {
    x: NaN,
    y: NaN,
    z: NaN,
    heading: NaN,
    gilt: false,
    calm: NaN,
    calmAt: NaN,
    next: NaN,
    seq: NaN,
  };
  let drawnFill = '',
    then = performance.now();
  return (at: Vec3, heading: Vec3, more: More) => {
    const now = performance.now(),
      dt = (now - then) / 1000;
    if (dt < 1 / RATE - 0.002) return;
    const c = canvas.width / 2,
      k = (inner * dpr) / SPAN;
    layAt(l, at, c, k);
    const sea = more.sea,
      seq = sea?.changes.at(-1)?.seq ?? NaN;
    const x = Math.round(at[0] * 1e6),
      y = Math.round(at[1] * 1e6),
      z = Math.round(at[2] * 1e6),
      turned = Math.round(bearing(heading) * 10);
    const calmR = more.calm?.radius ?? NaN,
      calmAt = more.calm?.center[0] ?? NaN,
      nextR = more.next?.radius ?? NaN;
    if (
      x === was.x &&
      y === was.y &&
      z === was.z &&
      turned === was.heading &&
      !!more.gilt === was.gilt &&
      same(calmR, was.calm) &&
      same(calmAt, was.calmAt) &&
      same(nextR, was.next) &&
      same(seq, was.seq)
    )
      return;
    was.x = x;
    was.y = y;
    was.z = z;
    was.heading = turned;
    was.gilt = !!more.gilt;
    was.calm = calmR;
    was.calmAt = calmAt;
    was.next = nextR;
    was.seq = seq;
    then = now;
    her.setAttribute(
      'transform',
      `translate(${r} ${r}) rotate(${(turned / 10).toFixed(1)})`
    );
    const fill = more.gilt ? WASH.gold : dyeOn(sea, more.own);
    if (fill !== drawnFill) {
      drawnFill = fill;
      her.innerHTML = `<path d="${head(6)}" fill="${fill}" stroke="${INK.iron}" stroke-width="1.3" stroke-linejoin="round"/>`;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (sea && more.own != null) held.draw(ctx, l, sea, more.own + 1, dt, lay);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    land.draw(ctx, l, lay);
    shores(at);
    const calm =
      more.calm && more.calm.radius < R * Math.PI * 0.99 ? more.calm : null;
    if (calm) {
      const ring = ringOf(calm);
      trace(ring, true);
      const farOut = -dot(at, calm.center) < Math.cos(calm.radius / R);
      if (farOut) ctx.rect(canvas.width, 0, -canvas.width, canvas.height);
      ctx.fillStyle = STORM;
      ctx.fill('evenodd');
      trace(ring, true);
      ctx.strokeStyle = EDGE;
      ctx.lineWidth = 2 * dpr;
      ctx.stroke();
    }
    const next =
      more.next && more.next.radius < R * Math.PI * 0.99 ? more.next : null;
    if (next) {
      trace(ringOf(next), true);
      strokeNext(ctx, dpr);
    }
    const goal = next ?? calm,
      w = goal && wayIn(at, goal);
    if (w) way(at, w.to, w.gap, c, k);
    stats.draws++;
    stats.ms += performance.now() - now;
    if (now - stats.since > 2000) {
      const s = (now - stats.since) / 1000;
      host.dataset.cost =
        `${(stats.ms / stats.draws).toFixed(2)} ${(stats.draws / s).toFixed(1)} ` +
        `${(held.stats.ms / Math.max(1, held.stats.samplings)).toFixed(2)} ${(held.stats.samplings / s).toFixed(1)}`;
      stats.draws = stats.ms = held.stats.ms = held.stats.samplings = 0;
      stats.since = now;
    }
  };

  function way(at: Vec3, to: Vec3, gap: number, c: number, k: number) {
    const m = meters(l, along(at, to, 1).p),
      len = Math.hypot(m[0], m[1]);
    const ux = m[0] / len,
      uy = -m[1] / len,
      rim = (inner - 4) * dpr;
    const reach = Math.min(gap * k, rim),
      from = 11 * dpr,
      a = 5.5 * dpr;
    if (reach <= from + a * 1.1) return;
    const x2 = c + ux * reach,
      y2 = c + uy * reach;
    ctx.beginPath();
    ctx.moveTo(c + ux * from, c + uy * from);
    ctx.lineTo(x2 - ux * a * 0.6, y2 - uy * a * 0.6);
    strokeWay(ctx, dpr);
    wayHead(ctx, { x: x2, y: y2, ux, uy }, dpr);
  }

  function shores(at: Vec3) {
    ctx.lineCap = ctx.lineJoin = 'round';
    for (const coast of coasts) {
      if (dot(coast.center, at) <= Math.cos((SPAN * 1.45 + coast.reach) / R))
        continue;
      trace(coast.ring, false);
      ctx.strokeStyle = WASH.shore;
      ctx.lineWidth = 1.1 * dpr;
      ctx.stroke();
    }
  }
}

// The minimap: a disc of the sea round her, SPAN metres to its rim, read at a
// glance, in the chart's hand. North is always up (the rim's vermilion mark,
// fixed): the disc never turns, her arrow turns on it.
//
// On the plain sea, from the bottom up: who holds the water, a wash in each
// holder's colour, hers the deeper (held.ts); the land, its shallows a pale
// wash, its parchment going ochre up the hills (from the ground round her,
// ground.ts), its coasts inked (coasts.ts); the Storm's side of its edge washed in its own violet and the edge a
// violet line; the circle it next closes to, a white dotted line. Nothing else:
// no other ship and no loot (those are found by eye). Outside the next circle a
// white line runs from her to its nearest point, ending in an arrowhead (on the
// rim when the circle is off the disc). Her mark at the centre is a small
// arrowhead in her dye (ink.ts dyeOn) turned to her heading. Drawn in canvas
// 2D when what it shows has changed; tapped, it opens the full map.

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
import { laid, layAt, metres, newLay, place, type LayOnto } from './disc.ts';
import { createGround } from './ground.ts';
import { createHeld } from './held.ts';
import { BRASS, INK, PAPER, WASH, alpha, dyeOn, svgNode } from './ink.ts';
import { view } from './ui.ts';

/**
 * Metres from her to the disc's rim: at her 16 m/s some 25 s of sailing, twice
 * a cannon's 200 m reach; some 4.5 m a pixel on the hud's disc (hud.ts
 * MINIMAP).
 */
const SPAN = 408;
/** The most redraws a second. */
const RATE = 30;
/** The Storm's wash and its edge. */
const STORM = alpha(WASH.storm, 0.4),
  EDGE = INK.storm;
/** Rings of the Storm kept traced, the oldest let go. */
const RINGS = 8;

/**
 * What else the disc may show: her arrow gilt, for a ship watched after a
 * sinking; the Storm's calm and the calm it next closes to (radius in metres);
 * who holds the sea, and her number in it (her id).
 */
export interface More {
  gilt?: boolean;
  calm?: Storm;
  next?: Storm | null;
  sea?: Sea;
  own?: number | null;
}

/** Whether two readings are the same, none (NaN) the same as none. */
const same = (a: number, b: number) => a === b || (a !== a && b !== b);

/** size: the disc's diameter, CSS px. */
export function createMinimap(
  host: HTMLElement,
  size: number,
  { coasts, ground }: Shores
) {
  const r = size / 2,
    inner = r - 8;
  host.style.width = host.style.height = `${size}px`;
  // the brass rim, graduated, and the paper under the sea
  const rim = svgNode(
    size,
    size,
    `<circle cx="${r}" cy="${r}" r="${r}" fill="${BRASS}" filter="url(#sh)"/>` +
      `<circle cx="${r}" cy="${r}" r="${r - 4}" fill="none" stroke="${PAPER}" stroke-width="5" stroke-dasharray="2.2 2.2"/>` +
      `<circle cx="${r}" cy="${r}" r="${inner + 0.5}" fill="${WASH.sea}" stroke="${INK.iron}" stroke-width="1"/>`
  );
  rim.style.position = 'absolute';
  const canvas = document.createElement('canvas');
  // its pixels as many as it is shown at, grown by the UI's size (ui.ts)
  const dpr = Math.min(view.dpr * view.k, 4);
  canvas.width = canvas.height = Math.round(inner * 2 * dpr);
  canvas.style.cssText = `position:absolute;left:${r - inner}px;top:${r - inner}px;width:${inner * 2}px;height:${inner * 2}px;border-radius:50%`;
  // north on the rim, and her arrowhead, over the canvas
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
  // (the plate reaches past the rim by as far as she sails before it is taken afresh, and a margin)
  const land = createGround(ground.height, SPAN + 50, ground.top);
  const rings = createRings(RINGS),
    ringOf = (s: Storm) => rings(s.centre, s.radius);
  const stats = { draws: 0, ms: 0, since: performance.now() };

  /** The disc as laid this redraw (disc.ts). */
  const l = newLay();
  /** Lays an image on `o`'s own chart onto the disc (disc.ts laid). */
  const lay: LayOnto = (o, e, n, w, h, m) => {
    const t = laid(l, o, e, n, w, h, m);
    ctx.setTransform(t[0], t[1], t[2], t[3], t[4], t[5]);
  };
  /** Begins a path through `ring`'s points on the disc. */
  const trace = (ring: readonly Vec3[], closed: boolean) => {
    ctx.beginPath();
    for (let i = 0; i < ring.length; i++) {
      const p = place(l, ring[i]);
      if (i) ctx.lineTo(p[0], p[1]);
      else ctx.moveTo(p[0], p[1]);
    }
    if (closed) ctx.closePath();
  };
  /** A direction's bearing on the disc, degrees clockwise from up. */
  const bearing = (t: Vec3) =>
    (Math.atan2(dot(t, l.right), dot(t, l.ahead)) * 180) / Math.PI;

  /** What was last drawn: where she was (millionths), her heading (tenths of a degree), gilt or not, the calm's size and
   *  place, the next's size and the sea's last change. */
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
    // at most RATE times a second
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
      calmAt = more.calm?.centre[0] ?? NaN,
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
    // her arrowhead in her dye (white till her ship's colour is known); gilt watching another ship after a sinking
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
      // the Storm's side of its edge: outside the ring as laid if the far side of the planet is the Storm's, else inside
      const ring = ringOf(calm);
      trace(ring, true);
      const farOut = -dot(at, calm.centre) < Math.cos(calm.radius / R);
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
      // the circle it next closes to: white, dotted, over a faint iron halo
      trace(ringOf(next), true);
      strokeNext(ctx, dpr);
    }
    // outside the next circle (or the calm, with none to come), the way in: a line to its nearest point
    const goal = next ?? calm,
      w = goal && wayIn(at, goal);
    if (w) way(at, w.to, w.gap, c, k);
    stats.draws++;
    stats.ms += performance.now() - now;
    if (now - stats.since > 2000) {
      // the disc's cost, for tools/capture.ts and the meter's readers: ms a redraw and redraws a second; the held
      // water's ms a sampling and samplings a second
      const s = (now - stats.since) / 1000;
      host.dataset.cost =
        `${(stats.ms / stats.draws).toFixed(2)} ${(stats.draws / s).toFixed(1)} ` +
        `${(held.stats.ms / Math.max(1, held.stats.samplings)).toFixed(2)} ${(held.stats.samplings / s).toFixed(1)}`;
      stats.draws = stats.ms = held.stats.ms = held.stats.samplings = 0;
      stats.since = now;
    }
  };

  /** The way in from `at` along `to`, `gap` metres to the circle: a line ending in an arrowhead at the circle, or on
   *  the rim when the circle is off the disc. */
  function way(at: Vec3, to: Vec3, gap: number, c: number, k: number) {
    const m = metres(l, along(at, to, 1).p),
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
    // its arrowhead, at the circle or on the rim
    wayHead(ctx, { x: x2, y: y2, ux, uy }, dpr);
  }

  /** The coasts near her, inked. */
  function shores(at: Vec3) {
    ctx.lineCap = ctx.lineJoin = 'round';
    for (const coast of coasts) {
      if (dot(coast.centre, at) <= Math.cos((SPAN * 1.45 + coast.reach) / R))
        continue;
      trace(coast.ring, false);
      ctx.strokeStyle = WASH.shore;
      ctx.lineWidth = 1.1 * dpr;
      ctx.stroke();
    }
  }
}

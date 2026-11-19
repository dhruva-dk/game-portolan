// The minimap: a disc of the sea round her, SPAN metres to its rim, read at a glance as Fortnite's is, in the chart's
// hand. North is always up (the rim's vermilion mark, fixed): the disc never turns, her arrow turns on it.
//
// On the plain sea, from the bottom up: who holds the water, a wash in each holder's colour, hers the deeper (held.ts);
// the land, its aprons a pale wash, its parchment going ochre up the hills (an island's baked once, isles.ts; the
// terrain's from the ground round her, ground.ts), its coasts inked (coasts.ts);
// her open trail, a line in her colour; the Storm's side of its edge washed in its own violet and the edge a violet
// line; the circle it next closes to, a white dotted line. Nothing else: no other ship and no loot (as in Fortnite,
// those are found by eye). Outside the next circle a white line runs from her to its nearest point, ending in an
// arrowhead (on the rim when the circle is off the disc). Her mark at the centre is a small arrowhead turned to her
// heading. Drawn in canvas 2D when what it shows has changed; tapped, it opens the full map.

import type { Sea } from '../snapshot';
import { R, add, along, distance, dot, frameAt, normalize, scale, type Vec3 } from '../world/sphere';
import type { Coast, Shores } from './coasts';
import { laid, layOf, metres, place } from './disc';
import { createGround } from './ground';
import { createHeld } from './held';
import { INK, PAPER, WASH, svg } from './ink';
import { bakeIsle, zOf, type Isle } from './isles';
import { sizeNow } from './ui';

/** Metres from her to the disc's rim: at her 16 m/s some 16 s of sailing, past a cannon's 200 m reach. */
export const SPAN = 260;
/** The most redraws a second. */
const RATE = 30;
/** The sea, the Storm's wash and its edge, the next circle's line and the way's. */
const SEA = '#c3d8cf', STORM = 'rgba(96,58,120,.4)', EDGE = '#4b2763';

export interface Storm { centre: Vec3; radius: number }

/** The small circle `radius` metres round `centre`, as `n` points. */
export function stormRing(storm: Storm, n = 96): Vec3[] {
  const { north, east } = frameAt(storm.centre);
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return along(storm.centre, add(scale(north, Math.cos(a)), east, Math.sin(a)), storm.radius).p;
  });
}

/** What else the disc may show: her arrow gilt, for a ship watched after a sinking; the Storm's calm and the calm it
 *  next closes to (radius in metres); who holds the sea, and her number in it (her id). */
export interface More {
  gilt?: boolean; calm?: Storm; next?: Storm | null; sea?: Sea; own?: number | null;
}

/** An arrowhead's path, its tip `l` up from (0, 0). */
const head = (l: number) => `M0 ${-l}L${l * 0.62} ${l * 0.7}L0 ${l * 0.32}L${-l * 0.62} ${l * 0.7}Z`;

/** size: the disc's diameter, CSS px. */
export function createMinimap(host: HTMLElement, size: number, { coasts, ground: land }: Shores) {
  const r = size / 2, inner = r - 8;
  host.style.width = host.style.height = `${size}px`;
  // the brass rim, graduated, and the paper under the sea
  host.innerHTML = svg(size, size,
    `<circle cx="${r}" cy="${r}" r="${r}" fill="#5b3a1e" filter="url(#sh)"/>`
    + `<circle cx="${r}" cy="${r}" r="${r - 4}" fill="none" stroke="${PAPER}" stroke-width="5" stroke-dasharray="2.2 2.2"/>`
    + `<circle cx="${r}" cy="${r}" r="${inner + 0.5}" fill="${SEA}" stroke="${INK.iron}" stroke-width="1"/>`);
  (host.firstElementChild as SVGSVGElement).style.position = 'absolute';
  const canvas = document.createElement('canvas');
  // its pixels as many as it is shown at, grown by the UI's size (ui.ts)
  const dpr = Math.min(devicePixelRatio * sizeNow(), 4);
  canvas.width = canvas.height = Math.round(inner * 2 * dpr);
  canvas.style.cssText = `position:absolute;left:${r - inner}px;top:${r - inner}px;width:${inner * 2}px;height:${inner * 2}px;border-radius:50%`;
  host.appendChild(canvas);
  // north on the rim, and her arrowhead, over the canvas
  const over = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  over.setAttribute('viewBox', `0 0 ${size} ${size}`);
  over.setAttribute('width', `${size}`);
  over.setAttribute('height', `${size}`);
  over.style.position = 'absolute';
  over.innerHTML = `<g id="north"><path d="M0 ${-r + 1}l-4.5 -0.5l4.5 9l4.5 -9z" fill="${WASH.vermilion}" stroke="${INK.iron}" stroke-width=".8"/></g>`
    + `<g id="her"></g>`;
  host.appendChild(over);
  over.querySelector('#north')!.setAttribute('transform', `translate(${r} ${r})`);
  const her = over.querySelector('#her')!;
  const ctx = canvas.getContext('2d')!;
  const held = createHeld(SPAN * 1.15);
  // (the plate reaches past the rim by as far as she sails before it is taken afresh, and a margin)
  const ground = land && createGround(land.height, SPAN + 50, land.top);
  const isles = new Map<Coast, Isle>();
  // every island baked one at a time while the page is idle, so none is baked mid-match as she nears it
  const sites = coasts.filter((c) => c.site);
  const bake = (i: number) => {
    const coast = sites[i];
    if (!coast) return;
    if (!isles.has(coast)) isles.set(coast, bakeIsle(coast.site!));
    setTimeout(() => bake(i + 1), 0);
  };
  bake(0);
  const rings = new Map<string, Vec3[]>();
  const ringOf = (s: Storm) => {
    const key = `${s.centre.join()}|${s.radius}`;
    let ring = rings.get(key);
    if (!ring) {
      if (rings.size > 8) rings.clear();
      rings.set(key, (ring = stormRing(s, 180)));
    }
    return ring;
  };
  const stats = { draws: 0, ms: 0, since: performance.now() };

  let last = '', gilt: boolean | null = null, then = performance.now();
  return (at: Vec3, heading: Vec3, more: More = {}) => {
    // at most RATE times a second
    const now = performance.now(), dt = (now - then) / 1000;
    if (dt < 1 / RATE - 0.002) return;
    const c = canvas.width / 2, k = (inner * dpr) / SPAN, l = layOf(at, frameAt(at).north, c, k);
    const bearing = (t: Vec3) => (Math.atan2(dot(t, l.right), dot(t, l.ahead)) * 180) / Math.PI;
    const sea = more.sea, seq = sea?.changes.at(-1)?.seq, trail = sea?.trails.find((t) => t.id === more.own);
    const key = `${at.map((v) => v.toFixed(6))}${bearing(heading).toFixed(1)}${!!more.gilt}`
      + `${more.calm?.radius}${more.calm?.centre[0]}${more.next?.radius}${seq}${trail?.points.length}`;
    if (key === last) return;
    last = key;
    then = now;
    her.setAttribute('transform', `translate(${r} ${r}) rotate(${bearing(heading).toFixed(1)})`);
    if (!!more.gilt !== gilt) {
      // watching another ship after a sinking: her arrowhead gilt (0117 minimap.ts mapFace)
      gilt = !!more.gilt;
      her.innerHTML = `<path d="${head(6)}" fill="${gilt ? WASH.gold : INK.white}" stroke="${INK.iron}" stroke-width="1.3" stroke-linejoin="round"/>`;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const lay = (o: Vec3, e: Vec3, n: Vec3, w: number, h: number, m: number) => ctx.setTransform(...laid(l, o, e, n, w, h, m));
    const near = (q: Vec3, reach: number) => dot(q, at) > Math.cos(reach / R);
    const trace = (ring: readonly Vec3[], closed: boolean) => {
      ctx.beginPath();
      ring.forEach((q, i) => (i ? ctx.lineTo(...place(l, q)) : ctx.moveTo(...place(l, q))));
      if (closed) ctx.closePath();
    };

    if (sea && more.own != null) held.draw(ctx, l, sea, more.own + 1, dt, lay);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ground?.draw(ctx, l, lay);
    shores(lay, trace, near);
    if (trail && trail.points.length) {
      // her open trail, on to her stern
      trace([...trail.points, at], false);
      ctx.lineCap = ctx.lineJoin = 'round';
      ctx.strokeStyle = INK.white;
      ctx.lineWidth = 3.2 * dpr;
      ctx.stroke();
      ctx.strokeStyle = 'rgb(176,28,36)';
      ctx.lineWidth = 1.8 * dpr;
      ctx.stroke();
    }
    const calm = more.calm && more.calm.radius < R * Math.PI * 0.99 ? more.calm : null;
    if (calm) {
      // the Storm's side of its edge: outside the ring as laid if the far side of the planet is the Storm's, else inside
      const ring = ringOf(calm);
      trace(ring, true);
      const farOut = dot(scale(at, -1), calm.centre) < Math.cos(calm.radius / R);
      if (farOut) ctx.rect(canvas.width, 0, -canvas.width, canvas.height);
      ctx.fillStyle = STORM;
      ctx.fill('evenodd');
      trace(ring, true);
      ctx.strokeStyle = EDGE;
      ctx.lineWidth = 2 * dpr;
      ctx.stroke();
    }
    const next = more.next && more.next.radius < R * Math.PI * 0.99 ? more.next : null;
    if (next) {
      // the circle it next closes to: white, dotted, over a faint iron halo
      trace(ringOf(next), true);
      ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(38,25,16,.45)';
      ctx.lineWidth = 3 * dpr;
      ctx.setLineDash([0.1 * dpr, 4.4 * dpr]);
      ctx.stroke();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2 * dpr;
      ctx.stroke();
      ctx.setLineDash([]);
    }
    // outside the next circle (or the calm, with none to come), the way in: a line to its nearest point
    const goal = next ?? calm;
    const d = goal ? distance(at, goal.centre) : 0;
    if (goal && d > goal.radius) {
      const to = normalize(add(goal.centre, at, -dot(goal.centre, at)));
      const [ex, ey] = metres(l, along(at, to, 1).p), len = Math.hypot(ex, ey);
      const ux = ex / len, uy = -ey / len, rim = (inner - 4) * dpr;
      const reach = Math.min((d - goal.radius) * k, rim), from = 11 * dpr, a = 5.5 * dpr, b = 3.8 * dpr;
      if (reach > from + a * 1.1) {
        const [x1, y1] = [c + ux * from, c + uy * from], [x2, y2] = [c + ux * reach, c + uy * reach];
        ctx.lineCap = 'round';
        for (const [ink, w] of [[INK.iron, 3.6], ['#fff', 1.8]] as const) {
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2 - ux * a * 0.6, y2 - uy * a * 0.6);
          ctx.strokeStyle = ink;
          ctx.lineWidth = w * dpr;
          ctx.stroke();
        }
        // its arrowhead, at the circle or on the rim
        ctx.beginPath();
        ctx.moveTo(x2 + ux * 2 * dpr, y2 + uy * 2 * dpr);
        ctx.lineTo(x2 - ux * a - uy * b, y2 - uy * a + ux * b);
        ctx.lineTo(x2 - ux * a + uy * b, y2 - uy * a - ux * b);
        ctx.closePath();
        ctx.fillStyle = '#fff';
        ctx.strokeStyle = INK.iron;
        ctx.lineWidth = 1.2 * dpr;
        ctx.lineJoin = 'round';
        ctx.stroke();
        ctx.fill();
      }
    }
    stats.draws++;
    stats.ms += performance.now() - now;
    if (now - stats.since > 2000) {
      // the disc's cost, for tools/capture.ts and the meter's readers: ms a redraw and redraws a second; the held
      // water's ms a sampling and samplings a second
      const s = (now - stats.since) / 1000;
      host.dataset.cost = `${(stats.ms / stats.draws).toFixed(2)} ${(stats.draws / s).toFixed(1)} `
        + `${(held.stats.ms / Math.max(1, held.stats.samplings)).toFixed(2)} ${(held.stats.samplings / s).toFixed(1)}`;
      [stats.draws, stats.ms, stats.since, held.stats.ms, held.stats.samplings] = [0, 0, now, 0, 0];
    }
  };

  /** The coasts near her, inked; an island's land under its coast, baked the first time it comes near, laid on its own
   *  chart. */
  function shores(lay: (o: Vec3, e: Vec3, n: Vec3, w: number, h: number, m: number) => void,
    trace: (ring: readonly Vec3[], closed: boolean) => void, near: (q: Vec3, reach: number) => boolean) {
    ctx.lineCap = ctx.lineJoin = 'round';
    for (const coast of coasts) {
      if (!near(coast.centre, SPAN * 1.45 + coast.reach)) continue;
      const site = coast.site;
      if (site) {
        let isle = isles.get(coast);
        if (!isle) isles.set(coast, (isle = bakeIsle(site)));
        lay(coast.centre, site.chart.axis, zOf(site), isle.w, isle.h, isle.m);
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'medium';
        ctx.drawImage(isle.canvas, 0, 0);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
      }
      trace(coast.ring, coast.closed);
      ctx.strokeStyle = WASH.shore;
      ctx.lineWidth = 1.1 * dpr;
      ctx.stroke();
    }
  }
}

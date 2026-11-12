// The minimap: a disc of the sea round her, north up, SPAN metres to its rim; the islands' coasts in sand on the sea's
// wash, the Storm's edge in rubric, and her arrow at the centre turned to her heading. Its rim is a graduated brass
// ring (the sheet's). Drawn in canvas 2D each frame she has moved; tapped, it opens the full map.

import { R, add, along, dot, frameAt, scale, type Vec3 } from '../world/sphere';
import type { Coast } from './coasts';
import { INK, PAPER, WASH, svg } from './ink';

/** Metres from her to the disc's rim. */
const SPAN = 170;

export interface Storm { centre: Vec3; radius: number }

/** The small circle `radius` metres round `centre`, as `n` points. */
export function stormRing(storm: Storm, n = 96): Vec3[] {
  const { north, east } = frameAt(storm.centre);
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return along(storm.centre, add(scale(north, Math.cos(a)), east, Math.sin(a)), storm.radius).p;
  });
}

/** size: the disc's diameter, CSS px. */
export function createMinimap(host: HTMLElement, size: number, coasts: readonly Coast[]) {
  const r = size / 2, inner = r * 0.86;
  host.style.width = host.style.height = `${size}px`;
  host.innerHTML = svg(size, size,
    `<circle cx="${r}" cy="${r}" r="${r}" fill="#5b3a1e" filter="url(#sh)"/>`
    + `<circle cx="${r}" cy="${r}" r="${r * 0.93}" fill="none" stroke="${PAPER}" stroke-width="${r * 0.1}" stroke-dasharray="${r * 0.06} ${r * 0.06}"/>`
    + `<circle cx="${r}" cy="${r}" r="${inner}" fill="${WASH.sea}"/>`);
  const svgEl = host.firstElementChild as SVGSVGElement;
  svgEl.style.position = 'absolute';
  const canvas = document.createElement('canvas');
  const dpr = Math.min(devicePixelRatio, 3);
  canvas.width = canvas.height = Math.round(inner * 2 * dpr);
  canvas.style.cssText = `position:absolute;left:${r - inner}px;top:${r - inner}px;width:${inner * 2}px;height:${inner * 2}px;border-radius:50%`;
  host.appendChild(canvas);
  // her arrow and the north tick, over the canvas
  const over = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  over.setAttribute('viewBox', `0 0 ${size} ${size}`);
  over.setAttribute('width', `${size}`);
  over.setAttribute('height', `${size}`);
  over.style.position = 'absolute';
  over.innerHTML = `<path d="M${r} ${r * 0.07 - 1}l-4 -1l4 9l4 -9z" fill="${WASH.vermilion}" stroke="${INK.iron}" stroke-width=".7"/>`
    + `<g id="her"><path d="M0 -8L5 6L0 3L-5 6Z" fill="${INK.iron}" stroke="${INK.white}" stroke-width="1.2" paint-order="stroke"/></g>`;
  host.appendChild(over);
  const her = over.querySelector('#her')!;
  const ctx = canvas.getContext('2d')!;

  let last = '', gilt = false;
  return (at: Vec3, heading: Vec3, storm: Vec3[] | null, more: More = {}) => {
    const { north, east } = frameAt(at);
    const bearing = Math.atan2(dot(heading, east), dot(heading, north)), span = more.span ?? SPAN, k = (inner * dpr) / span;
    const key = `${at.map((v) => v.toFixed(5))}${bearing.toFixed(2)}${storm?.length}${span}${more.course?.length}${more.fleet?.map((q) => q[0].toFixed(4)).join()}${more.first?.length}${!!more.gilt}`;
    if (key === last) return;
    last = key;
    her.setAttribute('transform', `translate(${r} ${r}) rotate(${(bearing * 180) / Math.PI})`);
    if (!!more.gilt !== gilt) {
      // watching another ship after a sinking: her arrow gilt, a star at its heart (0117 minimap.ts mapFace)
      gilt = !!more.gilt;
      her.innerHTML = gilt
        ? `<path d="M0 -9L5.5 6.5L0 3.5L-5.5 6.5Z" fill="${WASH.gold}" stroke="${INK.iron}" stroke-width=".9"/><path d="${star(0, 0.5, 2.6)}" fill="${INK.white}"/>`
        : `<path d="M0 -8L5 6L0 3L-5 6Z" fill="${INK.iron}" stroke="${INK.white}" stroke-width="1.2" paint-order="stroke"/>`;
    }
    const c = canvas.width / 2;
    const toDisc = (q: Vec3): [number, number] => [c + dot(q, east) * R * k, c - dot(q, north) * R * k];
    const near = (q: Vec3, reach: number) => dot(q, at) > Math.cos(reach / R);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const trace = (ring: readonly Vec3[]) => {
      ctx.beginPath();
      ring.forEach((q, i) => (i ? ctx.lineTo(...toDisc(q)) : ctx.moveTo(...toDisc(q))));
      ctx.closePath();
    };
    // the sea's rhumb lines: north–south and east–west through her
    ctx.strokeStyle = 'rgba(38,25,16,.18)';
    ctx.lineWidth = dpr * 0.6;
    ctx.beginPath();
    ctx.moveTo(c, 0);
    ctx.lineTo(c, 2 * c);
    ctx.moveTo(0, c);
    ctx.lineTo(2 * c, c);
    ctx.stroke();
    for (const coast of coasts) {
      if (!near(coast.centre, Math.min(span * 1.6 + coast.radius * 2, (R * Math.PI) / 2))) continue;
      trace(coast.ring);
      ctx.fillStyle = WASH.sand;
      ctx.fill();
      ctx.strokeStyle = WASH.shore;
      ctx.lineWidth = dpr;
      ctx.stroke();
    }
    if (storm) {
      // the Storm's side of its edge washed, the edge in rubric
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, 2 * c, 2 * c);
      const visible = storm.filter((q) => dot(q, at) > 0);
      if (visible.length === storm.length) {
        storm.forEach((q, i) => (i ? ctx.lineTo(...toDisc(q)) : ctx.moveTo(...toDisc(q))));
        ctx.closePath();
        ctx.fillStyle = 'rgba(106,74,122,.35)';
        ctx.fill('evenodd');
        ctx.restore();
        trace(storm);
        ctx.strokeStyle = INK.rubric;
        ctx.lineWidth = 2 * dpr;
        ctx.stroke();
      } else ctx.restore();
    }
    /** A line through the points, in the runs on her side of the planet. */
    const runs = (line: readonly Vec3[], closed: boolean) => {
      ctx.beginPath();
      let on = false;
      for (const q of closed ? [...line, line[0]] : line) {
        if (dot(q, at) <= 0) on = false;
        else if (on) ctx.lineTo(...toDisc(q));
        else {
          ctx.moveTo(...toDisc(q));
          on = true;
        }
      }
    };
    if (more.first) {
      // the Storm's first circle a line of rubric (0117: while the Gale blows)
      runs(more.first, true);
      ctx.strokeStyle = INK.rubric;
      ctx.lineWidth = 1.2 * dpr;
      ctx.globalAlpha = 0.9;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    if (more.course) {
      // the Gale's course, dotted
      runs(more.course, false);
      ctx.strokeStyle = INK.iron;
      ctx.setLineDash([0.1 * dpr, 4 * dpr]);
      ctx.lineCap = 'round';
      ctx.lineWidth = 2 * dpr;
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.lineCap = 'butt';
    }
    if (more.fleet) {
      // a fleet this far off is too close together for marks: each ship a dot of ink on a fleck of white
      for (const [fill, size] of [[INK.white, 3.4], [INK.iron, 2.2]] as const) {
        ctx.beginPath();
        for (const q of more.fleet) {
          if (dot(q, at) <= 0) continue;
          const [x, y] = toDisc(q);
          ctx.moveTo(x + size * dpr, y);
          ctx.arc(x, y, size * dpr, 0, Math.PI * 2);
        }
        ctx.fillStyle = fill;
        ctx.globalAlpha = fill === INK.white ? 0.75 : 0.95;
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  };
}

/** What else the disc may show: how far to its rim, metres (the drop's shows a whole hemisphere); the Gale's course,
 *  the fleet in the air and the Storm's first circle; and her arrow gilt, for a ship watched after a sinking. */
export interface More { span?: number; course?: readonly Vec3[]; fleet?: readonly Vec3[]; first?: readonly Vec3[]; gilt?: boolean }

/** A small five-pointed star's path at (x, y). */
const star = (x: number, y: number, r: number) => Array.from({ length: 10 }, (_, i) => {
  const a = (i * Math.PI) / 5 - Math.PI / 2, d = i % 2 ? r * 0.45 : r;
  return `${i ? 'L' : 'M'}${(x + d * Math.cos(a)).toFixed(2)} ${(y + d * Math.sin(a)).toFixed(2)}`;
}).join('') + 'Z';


// The minimap: a disc of the sea round her, north up, SPAN metres to its rim; the islands' coasts in sand on the sea's
// wash, the loot on the water in gold dots, the Storm's side of its edge washed and the edge in rubric, the circle it
// next closes to a dotted line of iron, and her arrow at the centre turned to her heading (0117's minimap.ts). Outside
// the calm, a rubric mark on the rim points the way back in. Its rim is a graduated brass ring (the sheet's). Drawn in
// canvas 2D each frame she has moved; tapped, it opens the full map.

import { R, add, along, distance, dot, frameAt, normalize, scale, type Vec3 } from '../world/sphere';
import type { Coast } from './coasts';
import { INK, PAPER, WASH, svg } from './ink';

/** Metres from her to the disc's rim. */
const SPAN = 170;
/** The Storm's wash is worked out on a grid this many cells across, and smoothed as it is drawn. */
const WASHED = 48;

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
  // the way back into the calm, on the rim
  const back = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  back.innerHTML = `<path d="M0 ${-r * 0.97}l-6 9h12z" fill="${INK.rubric}" stroke="${INK.white}" stroke-width="1" paint-order="stroke"/>`;
  over.appendChild(back);
  const ctx = canvas.getContext('2d')!;
  const grid = document.createElement('canvas');
  grid.width = grid.height = WASHED;
  const gctx = grid.getContext('2d')!;
  const cells = gctx.createImageData(WASHED, WASHED);

  let last = '', gilt = false;
  return (at: Vec3, heading: Vec3, storm: Vec3[] | null, more: More = {}) => {
    const { north, east } = frameAt(at);
    const bearing = Math.atan2(dot(heading, east), dot(heading, north)), span = SPAN, k = (inner * dpr) / span;
    const key = `${at.map((v) => v.toFixed(5))}${bearing.toFixed(2)}${storm?.length}${!!more.gilt}`
      + `${more.calm?.radius}${more.calm?.centre[0]}${more.next?.radius}${more.loot?.length}`;
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
      if (!near(coast.centre, SPAN * 1.6 + coast.radius * 2)) continue;
      trace(coast.ring);
      ctx.fillStyle = WASH.sand;
      ctx.fill();
      ctx.strokeStyle = WASH.shore;
      ctx.lineWidth = dpr;
      ctx.stroke();
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
    const calm = more.calm && more.calm.radius < R * Math.PI * 0.99 ? more.calm : null;
    if (calm) {
      // the Storm's side of its edge washed, cell by cell over the disc (true however large the calm), and smoothed;
      // its edge in rubric
      const cap = Math.cos(calm.radius / R), d = cells.data;
      for (let j = 0; j < WASHED; j++) for (let i = 0; i < WASHED; i++) {
        const x = ((i + 0.5) / WASHED - 0.5) * 2 * span / R, y = (0.5 - (j + 0.5) / WASHED) * 2 * span / R;
        const q = add(add(scale(at, Math.sqrt(Math.max(0, 1 - x * x - y * y))), east, x), north, y);
        d.set(dot(q, calm.centre) < cap ? [106, 74, 122, 92] : [0, 0, 0, 0], (j * WASHED + i) * 4);
      }
      gctx.putImageData(cells, 0, 0);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(grid, 0, 0, 2 * c, 2 * c);
      runs(stormRing(calm, 180), true);
      ctx.strokeStyle = INK.rubric;
      ctx.lineWidth = 2 * dpr;
      ctx.stroke();
    }
    if (more.next && more.next.radius < R * Math.PI * 0.99) {
      // the circle it next closes to, dotted iron
      runs(stormRing(more.next, 180), true);
      ctx.strokeStyle = INK.iron;
      ctx.setLineDash([2 * dpr, 3 * dpr]);
      ctx.lineWidth = 1.4 * dpr;
      ctx.stroke();
      ctx.setLineDash([]);
    }
    // outside the calm, the way back in on the rim
    const out = calm && distance(at, calm.centre) > calm.radius;
    back.style.display = out ? '' : 'none';
    if (out) {
      const to = normalize(add(calm.centre, at, -dot(calm.centre, at)));
      back.setAttribute('transform', `translate(${r} ${r}) rotate(${(Math.atan2(dot(to, east), dot(to, north)) * 180) / Math.PI})`);
    }
    if (more.loot) {
      // the loot on the water, gold dots (0117's)
      ctx.beginPath();
      for (const q of more.loot) {
        if (!near(q, span * 1.05)) continue;
        const [x, y] = toDisc(q);
        ctx.moveTo(x + 2.4 * dpr, y);
        ctx.arc(x, y, 2.4 * dpr, 0, Math.PI * 2);
      }
      ctx.fillStyle = WASH.gold;
      ctx.strokeStyle = INK.iron;
      ctx.lineWidth = 0.6 * dpr;
      ctx.fill();
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
  };
}

/** What else the disc may show: her arrow gilt, for a ship watched after a sinking; the Storm's calm and the calm it
 *  next closes to (radius in metres); and the loot on the water. */
export interface More { gilt?: boolean; calm?: Storm; next?: Storm | null; loot?: readonly Vec3[] }

/** A small five-pointed star's path at (x, y). */
const star = (x: number, y: number, r: number) => Array.from({ length: 10 }, (_, i) => {
  const a = (i * Math.PI) / 5 - Math.PI / 2, d = i % 2 ? r * 0.45 : r;
  return `${i ? 'L' : 'M'}${(x + d * Math.cos(a)).toFixed(2)} ${(y + d * Math.sin(a)).toFixed(2)}`;
}).join('') + 'Z';


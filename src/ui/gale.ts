// The drop's own lean screen, as 0117 drew it (src/screens/gale.ts): nothing covers the world while the fleet is
// carried on the Gale, and the chart keeps to its edges:
//   top centre   the seconds the Gale has left to carry her, a numeral on a slip; it dries away once she has gone
//   top right    the disc, in the HUD's own place: a whole hemisphere round her, the Gale's course dotted across it,
//                the fleet still in the air as flecks, the Storm's first circle in rubric; a tap opens the full map
//   right thumb  DIVE, in Fire's place (0117 layout: 128 × 102 at 802, 317): her ship stooping down a gust over a
//                little sea, faint while the Gale takes her up and inked in once she may go; gone once she has
//   on the sea   her mark, if she has set one, an inked vermilion pennant on a staff standing where it is
// The stick comes up under the thumb for the glide (play/stick.ts, the game's). No words.

import { R, type Vec3 } from '../world/sphere';
import type { Coast } from './coasts';
import { CUT, INK, WASH, figure, galleon, slip, svg } from './ink';
import { createMinimap, stormRing } from './minimap';
import { onTap, piece, uiLayer } from './ui';

/** What the drop shows (play/game.ts DropView), and where she is. */
export interface DropState {
  left: number; ready: boolean; gone: boolean;
  course: readonly Vec3[]; fleet: readonly Vec3[]; first: { centre: Vec3; radius: number };
  pennant: { x: number; y: number } | null;
  at: Vec3; heading: Vec3;
}

const MINIMAP = 132;
/** DIVE's box, and its centre from the safe area's right and bottom edges (Fire's: hud.ts). */
const DIVE_W = 128, DIVE_H = 102, DIVE_RIGHT = 92, DIVE_BOTTOM = 102;
/** Seconds: DIVE inking in once she may go; the countdown drying once she has gone (0117 AT). */
const INKS = 0.5, DRIES = 0.35;
/** The pennant: its staff's height, the flag's length and hoist, px (0117). */
const STAFF = 62, FLAG = 42, HOIST = 17;

/** Her ship stooping down a gust over a little sea, in a box about 2.9 × 2.3 `size` centred at (x, y) (0117
 *  chart/voyage.ts gust). */
function stoop(x: number, y: number, size: number) {
  const sea = y + size * 0.74, w = size * 2.4, deep = size * 0.34;
  const swell = (y0: number, inset: number) => {
    const x0 = x - w / 2 + w * inset, x1 = x + w / 2 - w * inset, n = 6, step = (x1 - x0) / n;
    let d = `M${x0} ${y0}`;
    for (let i = 0; i < n; i++) d += `q${step / 4} ${-deep * 0.18} ${step / 2} 0t${step / 2} 0`;
    return d;
  };
  const wind = (x0: number, y0: number, len: number, curl: number) =>
    `M${x0} ${y0}h${len}a${curl} ${curl} 0 1 0 ${-curl} ${-curl}`;
  const g = { x: x - size * 1.25, y: y - size * 0.75 };
  return `<path d="M${x - w / 2} ${sea}Q${x} ${sea - deep * 0.1} ${x + w / 2} ${sea}Q${x} ${sea + deep * 1.1} ${x - w / 2} ${sea}Z" fill="${WASH.azure}" opacity=".42"/>`
    + `<path d="${swell(sea + deep * 0.12, 0.14)}${swell(sea + deep * 0.42, 0.04)}${swell(sea + deep * 0.72, 0.2)}" fill="none" stroke="${INK.iron}" stroke-width=".8" opacity=".85"/>`
    + `<g transform="translate(${g.x} ${g.y}) rotate(34)" fill="none" stroke="${INK.iron}" stroke-width="1.6" stroke-linecap="round">`
    + `<path d="${wind(0, 0, size * 0.55, size * 0.13)}${wind(size * 0.05, size * 0.36, size * 0.66, size * 0.16)}${wind(size * 0.4, size * 0.66, size * 0.42, size * 0.11)}"/></g>`
    // (the galleon's waterline lies 0.16 of its box below the box's middle)
    + `<g transform="translate(${x + size * 0.2} ${y + size * 0.28}) rotate(34)">${galleon(0, -0.16 * size * 1.42, size * 1.42, { sail: CUT })}</g>`;
}

/** A pennant on a staff, its foot at (x, y), the flag flying at `phase` (radians). */
function pennant(x: number, y: number, phase: number) {
  const top = y - STAFF, a = Math.sin(phase) * 3, b = Math.sin(phase + 1.3) * 4;
  return `<path d="M${x} ${y}V${top}" stroke="${INK.white}" stroke-width="3.4" opacity=".5"/>`
    + `<path d="M${x} ${y}V${top}" stroke="${INK.iron}" stroke-width="1.6"/><circle cx="${x}" cy="${top}" r="2" fill="${INK.iron}"/>`
    + `<path d="M${x} ${top + 3}Q${x + FLAG * 0.4} ${top + 3 + a} ${x + FLAG} ${top + 3 + HOIST / 2 + b}Q${x + FLAG * 0.45} ${top + 3 + HOIST + a} ${x} ${top + 3 + HOIST}Z" fill="${WASH.vermilion}" stroke="${INK.iron}" stroke-width="1"/>`;
}

export function createGale(coasts: readonly Coast[], act: { dive(): void; map(): void }) {
  const root = document.createElement('div');
  root.className = 'screen';
  root.style.display = 'none';
  uiLayer().appendChild(root);

  const count = piece(root, 'top centre');
  count.style.transition = `opacity ${DRIES}s`;
  const disc = piece(root, 'top right', true);
  const drawDisc = createMinimap(disc, MINIMAP, coasts);
  onTap(disc, () => act.map());
  const dive = piece(root, 'right bottom', true);
  dive.style.cssText += `;margin:0 ${DIVE_RIGHT - DIVE_W / 2 - 4 - 8}px ${DIVE_BOTTOM - DIVE_H / 2 - 4 - 8}px 0;transition:transform .08s`;
  dive.innerHTML = svg(DIVE_W + 16, DIVE_H + 16, slip(8, 8, DIVE_W, DIVE_H, { bold: true }) + stoop(8 + DIVE_W / 2, 8 + DIVE_H / 2 - 4, 30));
  // it sinks under the finger, and goes as the finger lifts, once she may go
  let ready = false, inked = 0;
  dive.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    if (ready) dive.style.transform = 'translateY(2px) scale(.97)';
  });
  const lift = () => {
    dive.style.transform = '';
  };
  dive.addEventListener('pointerleave', lift);
  onTap(dive, () => {
    lift();
    if (ready) act.dive();
  });
  const flag = piece(root, '');
  flag.style.cssText = 'left:0;top:0;width:100%;height:100%';

  let ring: Vec3[] | null = null, first: DropState['first'] | null = null, shown = '', clock = 0;

  return {
    root,
    show(on: boolean) {
      root.style.display = on ? 'block' : 'none';
      if (on) {
        inked = 0;
        count.style.opacity = '1';
      }
    },
    update(s: DropState, dt: number) {
      clock += dt;
      // the countdown, until she has gone
      const n = String(Math.ceil(s.left));
      if (s.gone) count.style.opacity = '0';
      if (n !== shown) {
        shown = n;
        count.innerHTML = svg(64, 46, slip(1, 1, 62, 44, { bold: true }) + figure(32, 23, n, 30));
      }
      // DIVE: faint, inked in once she may go, gone once she has
      ready = s.ready && !s.gone;
      inked = s.ready ? Math.min(1, inked + dt / INKS) : 0;
      dive.style.display = s.gone ? 'none' : 'block';
      dive.style.opacity = `${0.45 + 0.55 * inked}`;
      if (s.first !== first) {
        first = s.first;
        ring = stormRing({ centre: first.centre, radius: first.radius * R });
      }
      // (the disc's projection is straight down onto her plane: a span of R reaches her horizon)
      drawDisc(s.at, s.heading, null, { span: R, course: s.course, fleet: s.fleet, first: ring ?? undefined });
      // her mark, standing on the sea once she has gone
      const p = s.gone ? s.pennant : null;
      flag.innerHTML = p ? `<svg width="${innerWidth}" height="${innerHeight}" style="position:absolute;left:0;top:0;overflow:visible">${pennant(p.x, p.y, clock / 0.26)}</svg>` : '';
    },
  };
}

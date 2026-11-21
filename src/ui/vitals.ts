// The vitals slip (hud.ts, top left): her shield and hull as ruled bars, each
// with its numeral (the hull's large, the shield's small), and beside them her
// ship from above, inked as telemetry, bow up:
//   rigging    her masts and canvas, three yards across her middle
//   rudder     her stern: the quarterdeck and the rudder under it
//   waterline  her sides, a band round her
//   deck       her deck, from the bow aft to the quarterdeck
// Each zone washed from paper through ochre to vermilion by its share of the
// hull damage taken (player.ts Status zones); a faulted zone outlined rubric,
// the chart's danger mark beside it (a ringed cross: drawn for a minor fault,
// filled for a major). Mending, a slow gold shimmer over her and over her
// hull's bar, and the repair mark under it.
//
// Redrawn only when what it shows changes. A zone whose share rises (a blow
// on her hull there) flashes once, on a layer of its own over the drawing, so
// a redraw does not cut it short; a fault coming on pops the slip.

import { worsened, type Faults, type Status } from '../player.ts';
import { clamp } from '../world/scalar.ts';
import {
  INK,
  LIGHT,
  PAPER,
  WASH,
  bar,
  blend,
  figure,
  glyph,
  slip,
  svg,
  svgNode,
} from './ink.ts';

/** The slip's size, drawn units. */
const VITALS = { w: 226, h: 92 } as const;

/**
 * Each zone's shape, bow up in a column 84 across (ZONES' order): the rigging's
 * three yards of canvas bellied forward, the stern's quarterdeck and rudder,
 * her hull whole (the waterline: the deck is laid over it, leaving a band
 * round her), her deck.
 */
const sail = (y: number, half: number) =>
  `M${42 - half} ${y + 3}Q42 ${y - 7} ${42 + half} ${y + 3}L${42 + half} ${y - 1.5}Q42 ${y - 11.5} ${42 - half} ${y - 1.5}Z`;
const ZONE_PATHS = [
  sail(29, 19) + sail(45, 24) + sail(60, 20),
  'M32.5 64L51.5 64L51 75L33 75ZM39.5 79L44.5 79L44 87L40 87Z',
  'M42 6C46 11 52 19 55 30C58 45 58 62 55 79L29 79C26 62 26 45 29 30C32 19 38 11 42 6Z',
  'M42 13C45 17 49 24 51 32C53.5 45 53.5 55 52 63L32 63C30.5 55 30.5 45 33 32C35 24 39 17 42 13Z',
] as const;
/** The order they are laid: hull (waterline), deck, stern, canvas over all. */
const LAID = [2, 3, 1, 0] as const;
/** Where each zone's fault mark stands, beside it (ZONES' order); its radius. */
const MARKS = [
  [74, 45],
  [66, 80],
  [11, 54],
  [21, 17],
] as const;
const MARK_R = 5.6;
/** The bars: their left, width, and the shield's and the hull's middle and height; the numerals' left. */
const BARS = { x: 90, w: 82, shield: [26, 12], hull: [56, 18], figures: 178 };

/** The wash's stops: paper at no share, ochre at OCHRE, vermilion from VERMILION. */
const OCHRE = 0.3,
  VERMILION = 0.6;

/**
 * A zone's wash for its share of the damage (0…1): paper, through ochre at
 * OCHRE, to vermilion from VERMILION on.
 */
export function washOf(share: number): string {
  const s = clamp(share);
  return s <= OCHRE
    ? blend(PAPER, WASH.ochre, s / OCHRE)
    : blend(
        WASH.ochre,
        WASH.vermilion,
        Math.min(1, (s - OCHRE) / (VERMILION - OCHRE))
      );
}

/** A share as the slip draws it: in 20ths. */
const step = (share: number) => Math.round(clamp(share) * 20);

/**
 * The zone a blow just struck, from her zones' shares as last drawn to as they
 * are now: the one whose share rose most (by a 20th at least), or −1.
 */
export function struckZone(
  was: readonly number[],
  now: readonly number[]
): number {
  let best = -1,
    most = 0;
  for (let i = 0; i < now.length; i++) {
    const rose = step(now[i]) - step(was[i]);
    if (rose > most) [best, most] = [i, rose];
  }
  return best;
}

/** The chart's danger mark at (x, y): a ringed cross, drawn (minor) or filled (major). */
const danger = (x: number, y: number, major: boolean) => {
  const r = MARK_R,
    a = r * 0.56,
    cross = `M${x - a} ${y - a}L${x + a} ${y + a}M${x + a} ${y - a}L${x - a} ${y + a}`;
  return (
    `<circle cx="${x}" cy="${y}" r="${r}" fill="${major ? INK.rubric : PAPER}" stroke="${major ? INK.iron : INK.rubric}" stroke-width="${major ? 0.9 : 1.6}"/>` +
    `<path d="${cross}" stroke="${major ? PAPER : INK.rubric}" stroke-width="1.7" stroke-linecap="round"/>`
  );
};

/** Her ship from above, each zone washed by its share and outlined rubric if faulted; her marks beside her. */
function ship(zones: readonly number[], faults: Faults, mending: boolean) {
  let body = `<path d="M42 6V0.5" stroke="${INK.iron}" stroke-width="1.6" stroke-linecap="round"/>`;
  for (const i of LAID) {
    const faulted = faults[i] > 0;
    body += `<path d="${ZONE_PATHS[i]}" fill="${washOf(zones[i])}" stroke="${faulted ? INK.rubric : INK.iron}" stroke-width="${faulted ? 1.9 : 1}" stroke-linejoin="round"/>`;
  }
  // her masts, through her canvas
  body += [29, 45, 60]
    .map((y) => `<circle cx="42" cy="${y - 3.4}" r="1.9" fill="${INK.iron}"/>`)
    .join('');
  if (mending)
    body +=
      `<path d="${ZONE_PATHS[2]}" fill="${WASH.gold}" opacity="0">` +
      '<animate attributeName="opacity" values="0;.55;0" dur="2.4s" repeatCount="indefinite"/></path>';
  for (let i = 0; i < faults.length; i++)
    if (faults[i] > 0)
      body += danger(MARKS[i][0], MARKS[i][1], faults[i] === 2);
  return body;
}

/** Draws into `face` (the piece juice.ts knocks): the slip, and over it the layer the struck zone flashes on. */
export function createVitals(face: HTMLElement) {
  face.style.position = 'relative';
  const drawn = document.createElement('div'),
    flashes = svgNode(
      VITALS.w,
      VITALS.h,
      ZONE_PATHS.map(
        (d) =>
          `<path d="${d}" fill="${LIGHT.white}" stroke="${LIGHT.red}" stroke-width="2" opacity="0"/>`
      ).join('')
    );
  flashes.style.cssText = 'position:absolute;left:0;top:0;pointer-events:none';
  face.append(drawn, flashes);
  /** What was last drawn: the numbers, her zones' shares in 20ths (packed), her faults (packed), her mending. */
  const was = [NaN, NaN, NaN, NaN, NaN, NaN];
  let shares: readonly number[] = [0, 0, 0, 0],
    faulted: Faults = [0, 0, 0, 0];

  return {
    update(s: Status) {
      const shield = Math.round(s.shield),
        hull = Math.round(s.hull),
        z = s.zones,
        zones =
          step(z[0]) + 21 * step(z[1]) + 441 * step(z[2]) + 9261 * step(z[3]),
        f = s.faults,
        faults = f[0] + 3 * f[1] + 9 * f[2] + 27 * f[3],
        mending = s.mending ? 1 : 0;
      const now = [
        shield,
        hull,
        s.shieldMax * 1000 + s.hullMax,
        zones,
        faults,
        mending,
      ];
      if (now.every((v, i) => v === was[i])) return;
      // a blow on her hull: the zone it struck flashes; a fault come on: the slip pops
      const hit = struckZone(shares, z);
      if (hit >= 0 && !Number.isNaN(was[0]))
        flashes.children[hit].animate([{ opacity: 0.95 }, { opacity: 0 }], {
          duration: 420,
          easing: 'ease-out',
        });
      if (worsened(faulted, f) && !Number.isNaN(was[0]))
        face.animate(
          [{ scale: '1' }, { scale: '1.12', offset: 0.3 }, { scale: '1' }],
          { duration: 380, easing: 'cubic-bezier(.3,1.6,.5,1)' }
        );
      now.forEach((v, i) => (was[i] = v));
      shares = [z[0], z[1], z[2], z[3]];
      faulted = f;
      const low = hull <= 25,
        sheen = s.mending
          ? `<rect x="${BARS.x + 1.5}" y="${BARS.hull[0] - BARS.hull[1] / 2 + 1.5}" width="${((BARS.w - 3) * hull) / s.hullMax}" height="${BARS.hull[1] - 3}" fill="${WASH.gold}" opacity="0">` +
            '<animate attributeName="opacity" values="0;.6;0" dur="2.4s" repeatCount="indefinite"/></rect>' +
            glyph('item.repairKit', BARS.x + 10, 79, 20, { ink: 'gold' })
          : '';
      drawn.innerHTML = svg(
        VITALS.w,
        VITALS.h,
        slip(1, 1, VITALS.w - 2, VITALS.h - 2) +
          ship(z, f, s.mending) +
          `<path d="M84 10V82" stroke="${INK.iron}" stroke-width=".6" opacity=".45"/>` +
          bar(
            BARS.x,
            BARS.shield[0],
            BARS.w,
            BARS.shield[1],
            shield / s.shieldMax,
            WASH.azure
          ) +
          figure(BARS.figures, BARS.shield[0], shield, 16, {
            anchor: 'start',
            fill: INK.blue,
          }) +
          bar(
            BARS.x,
            BARS.hull[0],
            BARS.w,
            BARS.hull[1],
            hull / s.hullMax,
            WASH.umber
          ) +
          sheen +
          figure(BARS.figures, BARS.hull[0], hull, 25, {
            anchor: 'start',
            fill: low ? INK.rubric : INK.iron,
          })
      );
    },
  };
}

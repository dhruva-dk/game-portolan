// The vitals slip (hud.ts, top left): her shield and hull as ruled bars, each
// with its numeral (the hull's large, the shield's small), and beside them her
// ship from above, inked as telemetry, bow up:
//   rigging    her masts and canvas, three yards across her middle
//   rudder     her stern: the quarterdeck and the rudder under it
//   waterline  her sides, a band round her
//   deck       her deck, from the bow aft to the quarterdeck
// Each zone washed from paper through ochre to vermilion by its share of the
// hull damage taken (player.ts Status zones), and told apart by more than its
// shape: her sides hatched, her deck planked, her quarterdeck railed; a faulted
// zone outlined rubric, the chart's danger mark on it (a ringed cross: drawn
// for a minor fault, filled for a major). Mending, a slow gold shimmer over her
// and over her hull's bar, and the repair mark under it.
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
  uid,
} from './ink.ts';

/** The slip's size, drawn units. */
const VITALS = { w: 226, h: 92 } as const;

/**
 * Her ship from above, bow up in a column 84 across: her hull's outline, and
 * inside it what its sides leave, her deck and quarterdeck. Each zone's shape
 * (ZONES' order), drawn even-odd: the rigging's three yards of canvas bellied
 * forward, at `SAILS` (their middles and half-widths); the stern's quarterdeck
 * and the rudder under it; the waterline, her sides, a band round her (her
 * hull less what is inside it); her deck, from the bow to the quarterdeck.
 */
const HULL =
  'M42 4C47 9 56 18 59 30C62 44 62 62 59 80L25 80C22 62 22 44 25 30C28 18 37 9 42 4Z';
const INSIDE =
  'M42 12C46 16 52 24 54 33C56.5 46 56.5 62 54.5 77L29.5 77C27.5 62 27.5 46 30 33C32 24 38 16 42 12Z';
const SAILS = [
  [31, 20],
  [45, 26],
  [58, 21],
] as const;
const sail = (y: number, half: number) =>
  `M${42 - half} ${y + 3}Q42 ${y - 7} ${42 + half} ${y + 3}L${42 + half} ${y - 1.5}Q42 ${y - 11.5} ${42 - half} ${y - 1.5}Z`;
const ZONE_PATHS = [
  SAILS.map(([y, half]) => sail(y, half)).join(''),
  'M28.2 66H55.8L54.5 77H29.5ZM39.5 80.5H44.5L44 89H40Z',
  HULL + INSIDE,
  'M42 12C46 16 52 24 54 33C56.5 44 56.6 56 55.8 66L28.2 66C27.4 56 27.5 44 30 33C32 24 38 16 42 12Z',
] as const;
/**
 * What tells each zone apart beyond its shape: the waterline hatched across,
 * the deck's planks fore and aft, the quarterdeck's rail athwart.
 */
const PLANKS = 'M35.5 22V65M42 13V65M48.5 22V65',
  RAIL = 'M30 71.5H54';
/** The order they are laid: her sides, deck, stern, canvas over all. */
const LAID = [2, 3, 1, 0] as const;
/**
 * Where each zone's fault mark stands, on its zone (ZONES' order): the main
 * yard's end, the quarterdeck, her side abeam, the deck at the bow; its radius.
 */
const MARKS = [
  [67, 42],
  [42, 71.5],
  [23.5, 50],
  [42, 16.5],
] as const;
const MARK_R = 5.8;
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

/**
 * Her ship from above, each zone washed by its share and outlined rubric if
 * faulted, her sides hatched with the pattern `hatch` (its id), her deck
 * planked; her marks on their zones.
 */
function ship(zones: readonly number[], faults: Faults, hatch: string) {
  let body = `<path d="M42 4V2.6" stroke="${INK.iron}" stroke-width="1.6" stroke-linecap="round"/>`;
  for (const i of LAID) {
    const faulted = faults[i] > 0,
      edge = `stroke="${faulted ? INK.rubric : INK.iron}" stroke-width="${faulted ? 1.9 : 1}" stroke-linejoin="round"`;
    body += `<path d="${ZONE_PATHS[i]}" fill="${washOf(zones[i])}" fill-rule="evenodd" ${edge}/>`;
    if (i === 2)
      body += `<path d="${ZONE_PATHS[2]}" fill="url(#${hatch})" fill-rule="evenodd"/>`;
    else if (i === 3)
      body += `<path d="${PLANKS}" stroke="${INK.iron}" stroke-width=".6" opacity=".4"/>`;
    else if (i === 1)
      body += `<path d="${RAIL}" stroke="${INK.iron}" stroke-width=".8" opacity=".5"/>`;
  }
  // her masts, through her canvas
  for (const [y] of SAILS)
    body += `<circle cx="42" cy="${y - 3.4}" r="1.9" fill="${INK.iron}"/>`;
  for (let i = 0; i < faults.length; i++)
    if (faults[i] > 0)
      body += danger(MARKS[i][0], MARKS[i][1], faults[i] === 2);
  return body;
}

/**
 * The mending shimmer's animation, from the one running (or none) and whether
 * she is mending: `start`ed as she begins, the same one kept while she goes on,
 * cancelled as she stops.
 */
export function shimmer<A extends { cancel(): void }>(
  running: A | null,
  mending: boolean,
  start: () => A
): A | null {
  if (mending) return running ?? start();
  running?.cancel();
  return null;
}

/** Draws into `face` (the piece juice.ts knocks): the slip, and over it the layer the struck zone flashes on. */
export function createVitals(face: HTMLElement) {
  face.style.position = 'relative';
  const over = 'position:absolute;left:0;top:0;pointer-events:none';
  const drawn = document.createElement('div'),
    flashes = svgNode(
      VITALS.w,
      VITALS.h,
      ZONE_PATHS.map(
        (d) =>
          `<path d="${d}" fill="${LIGHT.white}" fill-rule="evenodd" stroke="${LIGHT.red}" stroke-width="2" opacity="0"/>`
      ).join('')
    ),
    // mending: a slow gold shimmer over her and over her hull's bar, a layer of
    // its own (its opacity animated as a whole, so on the compositor) that a
    // redraw leaves running
    shine = svgNode(
      VITALS.w,
      VITALS.h,
      `<path d="${HULL}" fill="${WASH.gold}" opacity=".55"/>` +
        `<rect x="${BARS.x + 1.5}" y="${BARS.hull[0] - BARS.hull[1] / 2 + 1.5}" width="0" height="${BARS.hull[1] - 3}" fill="${WASH.gold}" opacity=".6"/>`
    );
  flashes.style.cssText = over;
  shine.style.cssText = `${over};opacity:0`;
  face.append(drawn, shine, flashes);
  const sheen = shine.querySelector('rect'),
    hatch = uid('hatch'),
    hatching =
      `<defs><pattern id="${hatch}" patternUnits="userSpaceOnUse" width="2.6" height="2.6" patternTransform="rotate(45)">` +
      `<path d="M0 0V2.6" stroke="${INK.iron}" stroke-width=".7" opacity=".55"/></pattern></defs>`;
  /** What was last drawn: the numbers, her zones' shares in 20ths (packed), her faults (packed), her mending. */
  const was = [NaN, NaN, NaN, NaN, NaN, NaN],
    shares = [0, 0, 0, 0];
  let faulted: Faults = [0, 0, 0, 0],
    shimmering: Animation | null = null;

  return {
    update(s: Status) {
      const shield = Math.round(s.shield),
        hull = Math.round(s.hull),
        most = s.shieldMax * 1000 + s.hullMax,
        z = s.zones,
        zones =
          step(z[0]) + 21 * step(z[1]) + 441 * step(z[2]) + 9261 * step(z[3]),
        f = s.faults,
        faults = f[0] + 3 * f[1] + 9 * f[2] + 27 * f[3],
        mending = s.mending ? 1 : 0;
      if (
        shield === was[0] &&
        hull === was[1] &&
        most === was[2] &&
        zones === was[3] &&
        faults === was[4] &&
        mending === was[5]
      )
        return;
      // a blow on her hull: the zone it struck flashes; a fault come on: the slip pops
      const first = Number.isNaN(was[0]),
        hit = struckZone(shares, z);
      if (hit >= 0 && !first)
        flashes.children[hit].animate([{ opacity: 0.95 }, { opacity: 0 }], {
          duration: 420,
          easing: 'ease-out',
        });
      if (worsened(faulted, f) && !first)
        face.animate(
          [{ scale: '1' }, { scale: '1.12', offset: 0.3 }, { scale: '1' }],
          { duration: 380, easing: 'cubic-bezier(.3,1.6,.5,1)' }
        );
      was[0] = shield;
      was[1] = hull;
      was[2] = most;
      was[3] = zones;
      was[4] = faults;
      was[5] = mending;
      for (let i = 0; i < 4; i++) shares[i] = z[i];
      faulted = f;
      sheen?.setAttribute(
        'width',
        ((BARS.w - 3) * clamp(hull / s.hullMax)).toFixed(1)
      );
      shimmering = shimmer(shimmering, s.mending, () =>
        shine.animate([{ opacity: 0 }, { opacity: 1 }, { opacity: 0 }], {
          duration: 2400,
          iterations: Infinity,
          easing: 'ease-in-out',
        })
      );
      const low = hull <= 25,
        kit = s.mending
          ? glyph('item.repairKit', BARS.x + 10, 79, 20, { ink: 'gold' })
          : '';
      drawn.innerHTML = svg(
        VITALS.w,
        VITALS.h,
        hatching +
          slip(1, 1, VITALS.w - 2, VITALS.h - 2) +
          ship(z, f, hatch) +
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
          kit +
          figure(BARS.figures, BARS.hull[0], hull, 25, {
            anchor: 'start',
            fill: low ? INK.rubric : INK.iron,
          })
      );
    },
  };
}

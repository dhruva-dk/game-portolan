// The chart's larger marks: the compass rose and its rhumb lines, the laurel
// for a place, and the marks more than one screen draws (the spyglass, the
// seed, a ram).

import { INK, PAPER, WASH, alpha, arcPath } from './ink.ts';

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * The rhumb lines' inks, round the 32 winds: principal iron, half green,
 * quarter vermilion.
 */
const WINDS = [INK.iron, WASH.vermilion, INK.green, WASH.vermilion] as const;

/**
 * 32 rhumb lines from (cx, cy), `reach` long: principal winds iron, half green,
 * quarter vermilion.
 */
export function rhumbs(cx: number, cy: number, reach: number, opacity = 0.3) {
  let s = '';
  for (let i = 0; i < 32; i++) {
    const a = (i * Math.PI) / 16;
    s += `<line x1="${cx}" y1="${cy}" x2="${r2(cx + Math.cos(a) * reach)}" y2="${r2(cy + Math.sin(a) * reach)}" stroke="${WINDS[i % 4]}" stroke-width=".6"/>`;
  }
  return `<g opacity="${opacity}">${s}</g>`;
}

/**
 * A rose's inks: its face, its lines and its ring (and how heavy its lines are
 * drawn, how broad its points and how wide its ring's chequer, a share of R),
 * the dark and light halves of each rank of point, the fleur-de-lis, the needle
 * (null: none) and the hub.
 */
export interface RoseInks {
  face: string;
  line: string;
  ring: string;
  weight: number;
  breadth: number;
  chequer: number;
  quarter: readonly [string, string];
  half: readonly [string, string];
  ordinal: readonly [string, string];
  cardinal: readonly [string, string];
  fleur: string;
  needle: string | null;
  hub: string;
}
/** The chart's rose, as the screens draw it. */
export const ROSE: RoseInks = {
  face: alpha(PAPER, 0.55),
  line: INK.iron,
  ring: INK.iron,
  weight: 1,
  breadth: 1,
  chequer: 0.035,
  quarter: [WASH.vermilion, PAPER],
  half: [INK.green, PAPER],
  ordinal: [INK.iron, PAPER],
  cardinal: [INK.iron, PAPER],
  fleur: WASH.gold,
  needle: INK.blue,
  hub: WASH.gold,
};

/**
 * The 32-point rose, radius R: iron principal points, green half winds, rubric
 * quarter winds, a gilt fleur-de-lis at north and a blue needle turned `needle`
 * degrees (in a group with id "needle" so it can be swung); `inks` recolours it
 * (the app's icon, tools/appicon.ts).
 */
export function rose(
  cx: number,
  cy: number,
  R: number,
  needle = 0,
  inks: RoseInks = ROSE
) {
  const o = inks,
    w = (v: number) => r2(v * o.weight),
    line = (v: number) => `stroke="${o.line}" stroke-width="${w(v)}"`;
  let s =
    `<circle cx="${cx}" cy="${cy}" r="${R}" fill="${o.face}" stroke="${o.ring}" stroke-width="${w(2)}"/>` +
    `<circle cx="${cx}" cy="${cy}" r="${r2(R * 0.93)}" fill="none" stroke="${o.ring}" stroke-width="${w(1)}"/>` +
    `<circle cx="${cx}" cy="${cy}" r="${r2(R * 0.965)}" fill="none" stroke="${o.ring}" stroke-width="${r2(R * o.chequer)}" stroke-dasharray="${r2((R * 0.9651 * Math.PI * 2) / 64)}"/>`;
  const point = (
    a: number,
    L: number,
    hw: number,
    [dark, light]: readonly [string, string]
  ) => {
    const tx = cx + Math.cos(a) * L,
      ty = cy + Math.sin(a) * L;
    const lx = cx + Math.cos(a - Math.PI / 2) * hw,
      ly = cy + Math.sin(a - Math.PI / 2) * hw;
    const rx = cx + Math.cos(a + Math.PI / 2) * hw,
      ry = cy + Math.sin(a + Math.PI / 2) * hw;
    return (
      `<path d="M${cx} ${cy}L${r2(lx)} ${r2(ly)}L${r2(tx)} ${r2(ty)}Z" fill="${dark}" ${line(0.6)}/>` +
      `<path d="M${cx} ${cy}L${r2(rx)} ${r2(ry)}L${r2(tx)} ${r2(ty)}Z" fill="${light}" ${line(0.6)}/>`
    );
  };
  const b = R * o.breadth;
  for (let i = 1; i < 32; i += 2)
    s += point(
      -Math.PI / 2 + (i * Math.PI) / 16,
      R * 0.58,
      b * 0.045,
      o.quarter
    );
  for (let i = 1; i < 16; i += 2)
    s += point(-Math.PI / 2 + (i * Math.PI) / 8, R * 0.72, b * 0.065, o.half);
  for (let i = 0; i < 8; i++)
    s += point(
      -Math.PI / 2 + (i * Math.PI) / 4,
      i % 2 ? R * 0.8 : R * 0.92,
      b * 0.09,
      i % 2 ? o.ordinal : o.cardinal
    );
  const fy = cy - R * 0.92,
    k = (v: number) => r2(R * v);
  s +=
    `<path d="M${cx} ${r2(fy - k(0.2))}C${r2(cx + k(0.05))} ${r2(fy - k(0.12))} ${r2(cx + k(0.05))} ${r2(fy - k(0.05))} ${cx} ${r2(fy)}` +
    `C${r2(cx - k(0.05))} ${r2(fy - k(0.05))} ${r2(cx - k(0.05))} ${r2(fy - k(0.12))} ${cx} ${r2(fy - k(0.2))}Z` +
    `M${r2(cx - k(0.02))} ${r2(fy - k(0.05))}C${r2(cx - k(0.12))} ${r2(fy - k(0.14))} ${r2(cx - k(0.14))} ${r2(fy - k(0.02))} ${r2(cx - k(0.08))} ${r2(fy + k(0.01))}Z` +
    `M${r2(cx + k(0.02))} ${r2(fy - k(0.05))}C${r2(cx + k(0.12))} ${r2(fy - k(0.14))} ${r2(cx + k(0.14))} ${r2(fy - k(0.02))} ${r2(cx + k(0.08))} ${r2(fy + k(0.01))}Z"` +
    ` fill="${o.fleur}" ${line(0.8)}/>`;
  if (o.needle)
    s += `<g class="needle" style="transform-origin:${cx}px ${cy}px;transform:rotate(${needle}deg)"><path d="M${cx} ${r2(cy - R * 0.66)}L${r2(cx + R * 0.03)} ${cy}L${cx} ${r2(cy + R * 0.5)}L${r2(cx - R * 0.03)} ${cy}Z" fill="${o.needle}" ${line(0.6)}/></g>`;
  s += `<circle cx="${cx}" cy="${cy}" r="${r2(R * 0.055)}" fill="${o.hub}" ${line(0.8)}/>`;
  return s;
}

/** A laurel of radius r round (cx, cy), open at the top. */
export function laurel(cx: number, cy: number, r: number, colour: string) {
  let s = '';
  for (const side of [-1, 1]) {
    s += `<path d="${side < 0 ? arcPath(cx, cy, r, Math.PI * 0.58, Math.PI * 1.32) : arcPath(cx, cy, r, -Math.PI * 0.32, Math.PI * 0.42)}" fill="none" stroke="${colour}" stroke-width="2"/>`;
    for (let i = 0; i < 12; i++) {
      const a =
        side < 0 ? Math.PI * (0.6 + i * 0.06) : Math.PI * (0.4 - i * 0.06);
      const px = cx + Math.cos(a) * r,
        py = cy + Math.sin(a) * r,
        deg = (a * 180) / Math.PI + (side < 0 ? 90 : -90);
      for (const o of [-1, 1]) {
        const ex = r2(px + Math.cos(a) * o * 7),
          ey = r2(py + Math.sin(a) * o * 7);
        s += `<ellipse cx="${ex}" cy="${ey}" rx="3.4" ry="8" transform="rotate(${r2(deg + o * 28 * side)} ${ex} ${ey})" fill="${colour}" stroke="${INK.iron}" stroke-width=".5" opacity=".95"/>`;
      }
    }
  }
  return s;
}

/** The spyglass: a brass glass of three draws, its eye end at the left, tilted up to the right; `s` its length. */
export const spyglass = (x: number, y: number, s: number) => {
  const k = s / 80;
  const tube = (x0: number, w: number, h: number) =>
    `<rect x="${x0}" y="${-h / 2}" width="${w}" height="${h}" rx="1.5" fill="url(#h-gold-d)" stroke="${INK.iron}" stroke-width="1.6"/>` +
    `<rect x="${x0}" y="${-h / 2}" width="${w}" height="${h}" rx="1.5" fill="${WASH.gold}" opacity=".55"/>`;
  return (
    `<g transform="translate(${x} ${y}) rotate(-16) scale(${k})" stroke-linejoin="round">` +
    tube(-40, 18, 10) +
    tube(-23, 22, 14) +
    tube(-2, 32, 19) +
    `<rect x="29" y="-12.5" width="9" height="25" rx="2" fill="${INK.iron}" stroke="${INK.iron}" stroke-width="1.2"/>` +
    `<path d="M-40 -5v10M-23 -7v14M-2 -9.5v19M12 -9.5v19" stroke="${INK.iron}" stroke-width="1.2"/>` +
    `<circle cx="-42" cy="0" r="3" fill="${INK.iron}"/></g>`
  );
};

/** The seed (a new seed, a new world): an almond-shaped seed, its seam inked, a shoot curling from its top; `s` its
 *  height. */
export const seed = (x: number, y: number, s: number) => {
  const k = s / 64;
  return (
    `<g transform="translate(${x} ${y}) scale(${k})" stroke="${INK.iron}" stroke-linecap="round" stroke-linejoin="round">` +
    `<path d="M0 -14C15 -8 18 14 0 28C-18 14 -15 -8 0 -14Z" fill="${WASH.ochre}" stroke-width="3"/>` +
    `<path d="M0 -14C15 -8 18 14 0 28C-18 14 -15 -8 0 -14Z" fill="${WASH.umber}" opacity=".45" stroke="none"/>` +
    `<path d="M0 -8Q5 8 0 22" fill="none" stroke-width="1.6"/>` +
    `<path d="M0 -14Q-1 -24 7 -29" fill="none" stroke="${INK.green}" stroke-width="3"/>` +
    `<path d="M7 -29Q15 -31 17 -24Q10 -21 7 -29Z" fill="${WASH.viridian}" stroke="${INK.green}" stroke-width="1.6"/></g>`
  );
};

/** A ram: two hulls met bow to bow, a rubric spark between them; about 34 across at `s` 1. */
export const ram = (x: number, y: number, s = 1) =>
  `<g transform="translate(${x} ${y}) scale(${s})" stroke="${INK.iron}" stroke-width="1.4" stroke-linejoin="round">` +
  `<path d="M-17 -2L-3 -2L1 2L-3 7L-15 7Z" fill="url(#h-iron)"/><path d="M17 -2L3 -2L-1 2L3 7L15 7Z" fill="url(#h-iron)" transform="scale(1 -1) translate(0 -5)"/>` +
  `<path d="M0 -12l2 6l5 -4l-2 6l6 1l-6 2l3 5" fill="none" stroke="${INK.rubric}" stroke-width="1.6"/></g>`;

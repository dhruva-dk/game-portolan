// Her livery (player.ts Livery), chosen in the lobby: a slim folio docked at
// the foot of the screen, opened from the dye pot at the lobby's foot,
// her ship at anchor turned broadside above it (play/anchorage.ts BROADSIDE),
// changing as she taps. At its left the set's dyes, two rows of eight daubs
// (bright and light over deep and dull); at its right three small sails in the
// dye she has chosen, one a pattern (plain, a band, stripes), each with her
// cross, the dye and the marks on it as her canvas has them (ship/materials.ts:
// a dye's marks on its own canvas are cream). The chosen daub and the chosen
// sail are gilt-ringed. Every target a cell of its own, nothing moving as she
// taps; no words.
//
// Hers is kept on the device (KEY), never required: a private window may
// refuse it, and she sails vermilion, plain.

import { LIVERY, PATTERNS, type Livery, type Wardrobe } from '../player.ts';
import { CUT, INK, roughCircle } from './ink.ts';
import { folio } from './screens.ts';
import { region } from './touch.ts';

const KEY = 'portolan.livery';

/** Hers as the device keeps it, or hers by default; the game holds it to the set (Wardrobe wear). */
function keptLivery(): Livery {
  try {
    const k: unknown = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (k && typeof k === 'object' && 'dye' in k && 'pattern' in k)
      return { dye: Number(k.dye), pattern: Number(k.pattern) };
  } catch {
    // kept nowhere: hers by default
  }
  return { ...LIVERY };
}
function keep(l: Livery) {
  try {
    localStorage.setItem(KEY, JSON.stringify(l));
  } catch {
    // kept for this page only
  }
}

/** A dye's daubs a row; a daub's cell, a sail's cell (drawn units, square for the daubs). */
const ROW = 8,
  CELL = 36,
  SAIL = { w: 68, h: 72 };
/** The folio's inner margin, and the gap the rule between the daubs and the sails stands in. */
const PAD = 24,
  GAP = 28;
/** The folio on the drawn page, docked at its foot, centred (screens.ts folio). */
const BOX = (() => {
  const w = PAD * 2 + ROW * CELL + GAP + PATTERNS.length * SAIL.w,
    h = PAD * 2 + 2 * CELL;
  return { x: 478 - w / 2, y: 418 - h, w, h };
})();

const r2 = (n: number) => Math.round(n * 100) / 100;

/** A daub of `dye` about (x, y): a blot of it, inked round, a glint of light on it. */
const daub = (x: number, y: number, dye: string, seed: number) =>
  `<path d="${roughCircle(x, y, 12.5, seed, 2.2)}" fill="${dye}" stroke="${INK.iron}" stroke-width="1"/>` +
  `<path d="M${x - 7} ${y - 3}Q${x - 6} ${y - 8} ${x - 1} ${y - 9}" fill="none" stroke="${INK.white}" stroke-width="1.6" stroke-linecap="round" opacity=".55"/>`;

/** The gilt ring round the chosen, `r` across its half. */
const chosen = (x: number, y: number, r: number) =>
  `<circle cx="${x}" cy="${y}" r="${r + 1.6}" fill="none" stroke="${INK.iron}" stroke-width=".7"/>` +
  `<circle cx="${x}" cy="${y}" r="${r}" fill="none" stroke="${INK.gold}" stroke-width="2.8"/>`;

/**
 * Her cross on a sail `w` × `h` about (x, y), as her canvas has it
 * (ship/materials.ts): four arms flaring from `ARM` at the middle to `FLARE` at
 * their ends, reaching `REACH` of the way to the sail's edges; grown by `d`.
 */
const ARM = 0.13,
  FLARE = 0.34,
  REACH = 0.66;
function cross(x: number, y: number, w: number, h: number, d: number) {
  const ax = (REACH * w) / 2,
    ay = (REACH * h) / 2;
  const reach = 1 + d,
    narrow = ARM + d,
    wide = FLARE + d;
  // each arm a trapeze from the middle out, narrow there and flaring at its end
  const arm = (ux: number, uy: number, along: number, across: number) => {
    const [px, py] = [-uy, ux];
    const p = (t: number, s: number) =>
      `${r2(x + ux * along * t + px * across * s)} ${r2(y + uy * along * t + py * across * s)}`;
    return `M${p(0, narrow)}L${p(reach, wide)}L${p(reach, -wide)}L${p(0, -narrow)}Z`;
  };
  return (
    arm(1, 0, ax, ay) +
    arm(-1, 0, ax, ay) +
    arm(0, 1, ay, ax) +
    arm(0, -1, ay, ax)
  );
}

/** The marks of each pattern but the cross: none; a band across the middle; three upright stripes. */
function marks(pattern: number, l: number, t: number, w: number, h: number) {
  if (pattern === 1)
    return `<rect x="${l}" y="${r2(t + h * 0.36)}" width="${w}" height="${r2(h * 0.28)}"/>`;
  if (pattern !== 2) return '';
  return [0, 0.4, 0.8]
    .map(
      (u) =>
        `<rect x="${r2(l + u * w)}" y="${t}" width="${r2(w * 0.2)}" height="${h}"/>`
    )
    .join('');
}

/**
 * A small square sail in `dye` with `pattern` on it, about (x, y): bellied a
 * little, hung from its yard; the marks in cream, the stripes parted from the
 * cross by a fringe of the dye (as her canvas has them).
 */
function sail(x: number, y: number, dye: string, pattern: number) {
  const w = 40,
    h = 38,
    l = x - w / 2,
    t = y - h / 2 + 3;
  const shape = `M${l} ${t}Q${x} ${t + 3} ${l + w} ${t}Q${l + w + 2.5} ${y + 3} ${l + w} ${t + h}Q${x} ${t + h + 4} ${l} ${t + h}Q${l - 2.5} ${y + 3} ${l} ${t}Z`;
  const cy = t + h / 2;
  return (
    `<path d="M${l - 6} ${t - 1}H${l + w + 6}" stroke="${INK.iron}" stroke-width="2.4" stroke-linecap="round"/>` +
    `<path d="${shape}" fill="${dye}"/>` +
    `<g fill="${CUT}">${marks(pattern, l, t, w, h)}</g>` +
    (pattern === 2
      ? `<path d="${cross(x, cy, w, h, 0.2)}" fill="${dye}"/>`
      : '') +
    `<path d="${cross(x, cy, w, h, 0)}" fill="${CUT}"/>` +
    `<path d="${shape}" fill="none" stroke="${INK.iron}" stroke-width="1.2" stroke-linejoin="round"/>`
  );
}

/**
 * Her livery's folio over the lobby: `wardrobe` the game's (her livery worn as
 * she taps, the camera turned broadside while it is open), `close` the way back
 * to the lobby. Hers as the device keeps it is worn as it is made.
 */
export function createLivery(wardrobe: Wardrobe, close: () => void) {
  wardrobe.wear(keptLivery());
  const f = folio(BOX, ['centre', 'bottom'], close, false);
  const x0 = BOX.x + PAD,
    y0 = BOX.y + PAD,
    rule = x0 + ROW * CELL + GAP / 2,
    s0 = x0 + ROW * CELL + GAP;
  const draw = () => {
    const hers = wardrobe.worn(),
      dye = wardrobe.dyes[hers.dye];
    let body = `<path d="M${rule} ${y0 + 4}V${y0 + 2 * CELL - 4}" stroke="${INK.iron}" stroke-width=".8" opacity=".6"/>`;
    wardrobe.dyes.forEach((d, i) => {
      const cx = x0 + (i % ROW) * CELL + CELL / 2,
        cy = y0 + Math.floor(i / ROW) * CELL + CELL / 2;
      body +=
        `<g id="dye-${i}"><rect x="${cx - CELL / 2}" y="${cy - CELL / 2}" width="${CELL}" height="${CELL}" fill="transparent"/>` +
        `${daub(cx, cy, d, i * 7 + 3)}${i === hers.dye ? chosen(cx, cy, 15.5) : ''}</g>`;
    });
    PATTERNS.forEach((_, i) => {
      const cx = s0 + i * SAIL.w + SAIL.w / 2,
        cy = y0 + CELL;
      body +=
        `<g id="pattern-${i}"><rect x="${cx - SAIL.w / 2}" y="${y0}" width="${SAIL.w}" height="${2 * CELL}" fill="transparent"/>` +
        `${sail(cx, cy, dye, i)}${i === hers.pattern ? chosen(cx, cy + 2, 30) : ''}</g>`;
    });
    f.draw(body, (el) => {
      const choose = (l: Livery) => () => {
        keep(wardrobe.wear(l));
        draw();
      };
      wardrobe.dyes.forEach((_, i) =>
        region(el, `dye-${i}`, choose({ ...hers, dye: i }))
      );
      PATTERNS.forEach((_, i) =>
        region(el, `pattern-${i}`, choose({ ...hers, pattern: i }))
      );
    });
  };
  return {
    /** Her dye now, as the display shows it (the lobby's dye pot). */
    dye: () => wardrobe.dyes[wardrobe.worn().dye],
    /** Opens it, the camera coming round to her broadside; or closes it, the camera going back. */
    show(on: boolean) {
      if (on) draw();
      f.show(on);
      wardrobe.broadside(on);
    },
  };
}

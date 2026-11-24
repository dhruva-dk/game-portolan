import { PATTERNS, type Livery, type Wardrobe } from '../play/player.ts';
import { SAIL_MARKS } from '../render/snapshot.ts';
import { INK, roughCircle } from './ink.ts';
import { folio } from './screens.ts';
import { region } from './touch.ts';

const ROW = 8,
  CELL = 32,
  SAIL = { w: 62, h: 64 };
const PAD = 24,
  GAP = 28;
const BOX = (() => {
  const w = PAD * 2 + ROW * CELL + GAP + PATTERNS.length * SAIL.w,
    h = PAD * 2 + 2 * CELL;
  return { x: 876 - w, y: 418 - h, w, h };
})();

const r2 = (n: number) => Math.round(n * 100) / 100;

const daub = (x: number, y: number, dye: string, seed: number) =>
  `<path d="${roughCircle(x, y, 12.5, seed, 2.2)}" fill="${dye}" stroke="${INK.iron}" stroke-width="1"/>` +
  `<path d="M${x - 7} ${y - 3}Q${x - 6} ${y - 8} ${x - 1} ${y - 9}" fill="none" stroke="${INK.white}" stroke-width="1.6" stroke-linecap="round" opacity=".55"/>`;

const chosen = (x: number, y: number, r: number) =>
  `<circle cx="${x}" cy="${y}" r="${r + 1.6}" fill="none" stroke="${INK.iron}" stroke-width=".7"/>` +
  `<circle cx="${x}" cy="${y}" r="${r}" fill="none" stroke="${INK.gold}" stroke-width="2.8"/>`;

function cross(x: number, y: number, w: number, h: number, d: number) {
  const { arm, flare, reach } = SAIL_MARKS;
  const limb = (ux: number, uy: number, along: number, across: number) => {
    const p = (t: number, s: number) =>
      `${r2(x + ux * along * t - uy * across * s)} ${r2(y + uy * along * t + ux * across * s)}`;
    return `M${p(0, arm + d)}L${p(1 + d, flare + d)}L${p(1 + d, -flare - d)}L${p(0, -arm - d)}Z`;
  };
  const ax = (reach * w) / 2,
    ay = (reach * h) / 2;
  return (
    limb(1, 0, ax, ay) +
    limb(-1, 0, ax, ay) +
    limb(0, 1, ay, ax) +
    limb(0, -1, ay, ax)
  );
}

function marks(pattern: number, l: number, t: number, w: number, h: number) {
  const { band, stripes } = SAIL_MARKS;
  if (pattern === 1)
    return `<rect x="${l}" y="${r2(t + h * band[0])}" width="${w}" height="${r2(h * (band[1] - band[0]))}"/>`;
  if (pattern !== 2) return '';
  let s = '';
  for (let k = -stripes; k <= stripes; k++) {
    const a = Math.max(0, 0.5 + (2 * k - 0.5) / stripes),
      b = Math.min(1, 0.5 + (2 * k + 0.5) / stripes);
    if (b > a)
      s += `<rect x="${r2(l + a * w)}" y="${t}" width="${r2((b - a) * w)}" height="${h}"/>`;
  }
  return s;
}

function sail(
  x: number,
  y: number,
  dye: string,
  mark: string,
  pattern: number
) {
  const w = 40,
    h = 38,
    l = x - w / 2,
    t = y - h / 2 + 3,
    cy = t + h / 2;
  const shape = `M${l} ${t}Q${x} ${t + 3} ${l + w} ${t}Q${l + w + 2.5} ${y + 3} ${l + w} ${t + h}Q${x} ${t + h + 4} ${l} ${t + h}Q${l - 2.5} ${y + 3} ${l} ${t}Z`;
  return (
    `<path d="M${l - 6} ${t - 1}H${l + w + 6}" stroke="${INK.iron}" stroke-width="2.4" stroke-linecap="round"/>` +
    `<path d="${shape}" fill="${dye}"/>` +
    `<g fill="${mark}">${marks(pattern, l, t, w, h)}</g>` +
    (pattern === 2
      ? `<path d="${cross(x, cy, w, h, SAIL_MARKS.fringe)}" fill="${dye}"/>`
      : '') +
    `<path d="${cross(x, cy, w, h, 0)}" fill="${mark}"/>` +
    `<path d="${shape}" fill="none" stroke="${INK.iron}" stroke-width="1.2" stroke-linejoin="round"/>`
  );
}

export function createLivery(
  wardrobe: Wardrobe,
  keep: (l: Livery) => void,
  close: () => void
) {
  const f = folio(BOX, ['right', 'bottom'], close, false);
  const x0 = BOX.x + PAD,
    y0 = BOX.y + PAD,
    rule = x0 + ROW * CELL + GAP / 2,
    s0 = x0 + ROW * CELL + GAP;
  const draw = () => {
    const worn = wardrobe.worn(),
      { dye, mark } = wardrobe.dyes[worn.dye] ?? { dye: '', mark: '' };
    let body = `<path d="M${rule} ${y0 + 4}V${y0 + 2 * CELL - 4}" stroke="${INK.iron}" stroke-width=".8" opacity=".6"/>`;
    wardrobe.dyes.forEach((d, i) => {
      const cx = x0 + (i % ROW) * CELL + CELL / 2,
        cy = y0 + Math.floor(i / ROW) * CELL + CELL / 2;
      body +=
        `<g id="dye-${i}"><rect x="${cx - CELL / 2}" y="${cy - CELL / 2}" width="${CELL}" height="${CELL}" fill="transparent"/>` +
        `${daub(cx, cy, d.dye, i * 7 + 3)}${i === worn.dye ? chosen(cx, cy, 15.5) : ''}</g>`;
    });
    PATTERNS.forEach((_, i) => {
      const cx = s0 + i * SAIL.w + SAIL.w / 2,
        cy = y0 + CELL;
      body +=
        `<g id="pattern-${i}"><rect x="${cx - SAIL.w / 2}" y="${y0}" width="${SAIL.w}" height="${2 * CELL}" fill="transparent"/>` +
        `${sail(cx, cy, dye, mark, i)}${i === worn.pattern ? chosen(cx, cy + 2, 28) : ''}</g>`;
    });
    f.draw(body, (el) => {
      const choose = (l: Livery) => () => {
        keep(wardrobe.wear(l));
        draw();
      };
      wardrobe.dyes.forEach((_, i) =>
        region(el, `dye-${i}`, choose({ ...wardrobe.worn(), dye: i }))
      );
      PATTERNS.forEach((_, i) =>
        region(el, `pattern-${i}`, choose({ ...wardrobe.worn(), pattern: i }))
      );
    });
  };
  return {
    show(on: boolean) {
      if (on) draw();
      f.show(on);
      wardrobe.broadside(on);
    },
  };
}

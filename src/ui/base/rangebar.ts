import { INK, PAPER, WASH, r2 } from './ink.ts';

export type Scale = { least: number; most: number };

export const LEVELS: Scale = { least: 0, most: 100 };
export const STATS: Scale = { least: 1, most: 20 };

interface RangeStyle {
  scale: Scale;
  lo: number;
  hi: number;
  tick?: number | null;
  wash?: string;
  notches?: number;
}

export function rangeBar(
  x: number,
  y: number,
  w: number,
  h: number,
  o: RangeStyle
) {
  const { least, most } = o.scale,
    inset = 1.4,
    inner = w - 2 * inset;
  const at = (v: number) =>
    x +
    inset +
    (inner * (Math.min(most, Math.max(least, v)) - least)) / (most - least);
  const top = y - h / 2,
    wash = o.wash ?? WASH.ochre;
  let s = `<rect x="${r2(x)}" y="${r2(top)}" width="${r2(w)}" height="${r2(h)}" fill="${PAPER}" stroke="${INK.iron}" stroke-width=".9"/>`;
  const exact = o.lo === o.hi;
  const from = exact ? x + inset : at(o.lo),
    to = at(o.hi);
  if (!exact)
    s += `<rect x="${r2(x + inset)}" y="${r2(top + inset)}" width="${r2(from - x - inset)}" height="${r2(h - 2 * inset)}" fill="${wash}" opacity=".85"/>`;
  s +=
    `<rect x="${r2(from)}" y="${r2(top + inset)}" width="${r2(Math.max(0, to - from))}" height="${r2(h - 2 * inset)}"` +
    ` fill="${exact ? wash : 'url(#h-iron)'}" opacity="${exact ? 0.85 : 0.7}"/>`;
  const notches = o.notches ?? 0;
  for (let i = 1; i < notches; i++) {
    const nx = x + (w * i) / notches;
    s += `<path d="M${r2(nx)} ${r2(top)}v${r2(h * 0.3)}M${r2(nx)} ${r2(top + h)}v${r2(-h * 0.3)}" stroke="${INK.iron}" stroke-width=".6" opacity=".5"/>`;
  }
  if (o.tick != null) {
    const tx = at(o.tick);
    s += `<path d="M${r2(tx)} ${r2(top - 2.5)}V${r2(top + h + 2.5)}" stroke="${INK.iron}" stroke-width="1.8" stroke-linecap="round"/>`;
  }
  return s;
}

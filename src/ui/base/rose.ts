import { figure, glyph, INK, WASH } from './ink.ts';
import type { Glyph } from './glyphs.ts';
import { measured } from './word.ts';

export type RosePoint = { glyph: Glyph; lo: number; hi: number; ink?: string };

interface RoseStyle {
  glyph: number;
  numerals?: boolean;
  compare?: readonly number[] | null;
  wash?: string;
  was?: readonly number[] | null;
  cue?: (part: 'was' | 'now') => string;
}

const TOP = 20,
  RINGS = [5, 10, 15, 20];

const r2 = (n: number) => Math.round(n * 100) / 100;

const turnOf = (i: number, n: number) => -Math.PI / 2 + (i * 2 * Math.PI) / n;

const TIP = { out: 0.4, numeral: 0.62, lift: 1 } as const;

const upper = (a: number) => Math.sin(a) < 0;

function tipAt(a: number, R: number, g: number) {
  const out = R + g * TIP.out,
    gx = Math.cos(a) * out,
    gy = Math.sin(a) * out,
    nh = g * TIP.numeral,
    ny = upper(a)
      ? gy - g / 2 - nh / 2 - TIP.lift
      : gy + g / 2 + nh / 2 + TIP.lift;
  return { gx, gy, ny, nh };
}

export type Reach = { left: number; right: number; up: number; down: number };

export function roseReach(
  n: number,
  R: number,
  g: number,
  numerals: boolean,
  widest = `${TOP}`
): Reach {
  const wide = numerals
    ? measured(widest, g * TIP.numeral, { italic: true, weight: 600 })
    : 0;
  const reach = { left: 0, right: 0, up: 0, down: 0 };
  for (let i = 0; i < n; i++) {
    const a = turnOf(i, n),
      { gx, gy, ny, nh } = tipAt(a, R, g),
      half = Math.max(g, wide) / 2;
    reach.right = Math.max(reach.right, gx + (numerals ? half : g / 2));
    reach.left = Math.max(reach.left, -gx + (numerals ? half : g / 2));
    reach.up = Math.max(reach.up, -gy + g / 2, numerals ? -ny + nh / 2 : 0);
    reach.down = Math.max(reach.down, gy + g / 2, numerals ? ny + nh / 2 : 0);
  }
  return reach;
}

export function roseShape(
  cx: number,
  cy: number,
  R: number,
  values: readonly number[]
) {
  const n = values.length;
  return (
    values
      .map((v, i) => {
        const a = turnOf(i, n),
          k = R * (Math.max(0.6, v) / TOP);
        return `${i ? 'L' : 'M'}${r2(cx + Math.cos(a) * k)} ${r2(cy + Math.sin(a) * k)}`;
      })
      .join('') + 'Z'
  );
}

export function statRose(
  cx: number,
  cy: number,
  R: number,
  points: readonly RosePoint[],
  o: RoseStyle
) {
  const n = points.length,
    wash = o.wash ?? WASH.ochre;
  const angle = (i: number) => turnOf(i, n);
  const at = (i: number, v: number): [number, number] => [
    cx + Math.cos(angle(i)) * R * (v / TOP),
    cy + Math.sin(angle(i)) * R * (v / TOP),
  ];
  const shape = (vs: readonly number[]) => roseShape(cx, cy, R, vs),
    cue = o.cue ?? (() => '');
  let s = '';
  for (const ring of RINGS) {
    const d = points.map((_, i) => {
      const [x, y] = at(i, ring);
      return `${i ? 'L' : 'M'}${r2(x)} ${r2(y)}`;
    });
    s += `<path d="${d.join('')}Z" fill="${ring === TOP ? 'rgba(255,250,235,.45)' : 'none'}" stroke="${INK.iron}" stroke-width="${ring === TOP ? 0.9 : 0.5}" opacity="${ring === TOP ? 0.55 : 0.3}"/>`;
  }
  for (let i = 0; i < n; i++) {
    const [x, y] = at(i, TOP);
    s += `<path d="M${cx} ${cy}L${r2(x)} ${r2(y)}" stroke="${INK.iron}" stroke-width=".5" opacity=".3"/>`;
  }
  const lo = points.map((p) => p.lo),
    hi = points.map((p) => p.hi),
    exact = points.every((p) => p.lo === p.hi);
  if (!exact)
    s +=
      `<path d="${shape(hi)}${shape(lo)}" fill="${wash}" fill-opacity=".3" fill-rule="evenodd"/>` +
      `<path d="${shape(hi)}${shape(lo)}" fill="url(#h-open)" fill-rule="evenodd" stroke="${INK.iron}" stroke-width=".7" stroke-linejoin="round"/>`;
  if (o.was)
    s += `<path${cue('was')} d="${shape(o.was)}" fill="none" stroke="${INK.iron}" stroke-width="1.1" stroke-linejoin="round" opacity=".8"/>`;
  s += `<path${cue('now')} d="${shape(lo)}" fill="${wash}" fill-opacity=".62" stroke="${INK.iron}" stroke-width="1.3" stroke-linejoin="round"/>`;
  if (!o.was)
    for (let i = 0; i < n; i++) {
      const [x, y] = at(i, Math.max(0.6, lo[i]));
      s += `<circle cx="${r2(x)}" cy="${r2(y)}" r="1.5" fill="${INK.iron}"/>`;
    }
  if (o.compare)
    s += `<path d="${shape(o.compare)}" fill="none" stroke="${INK.blue}" stroke-width="1.6" stroke-linejoin="round"/>`;
  points.forEach((p, i) => {
    const { gx, gy, ny } = tipAt(angle(i), R, o.glyph);
    s += glyph(p.glyph, cx + gx, cy + gy, o.glyph);
    if (o.numerals) {
      const lo = Math.round(p.lo),
        hi = Math.round(p.hi);
      s += figure(
        cx + gx,
        cy + ny,
        lo === hi ? `${lo}` : `${lo}–${hi}`,
        o.glyph * TIP.numeral,
        { weight: 600, fill: p.ink }
      );
    }
  });
  return s;
}

import { figure, glyph, INK, WASH } from './ink.ts';
import type { Glyph } from './glyphs.ts';

export type RosePoint = { glyph: Glyph; lo: number; hi: number };

interface RoseStyle {
  glyph: number;
  numerals?: boolean;
  compare?: readonly number[] | null;
  wash?: string;
}

const TOP = 20,
  RINGS = [5, 10, 15, 20];

const r2 = (n: number) => Math.round(n * 100) / 100;

export function statRose(
  cx: number,
  cy: number,
  R: number,
  points: readonly RosePoint[],
  o: RoseStyle
) {
  const n = points.length,
    wash = o.wash ?? WASH.ochre;
  const angle = (i: number) => -Math.PI / 2 + (i * 2 * Math.PI) / n;
  const at = (i: number, v: number): [number, number] => [
    cx + Math.cos(angle(i)) * R * (v / TOP),
    cy + Math.sin(angle(i)) * R * (v / TOP),
  ];
  const shape = (vs: readonly number[]) =>
    vs
      .map((v, i) => {
        const [x, y] = at(i, Math.max(0.6, v));
        return `${i ? 'L' : 'M'}${r2(x)} ${r2(y)}`;
      })
      .join('') + 'Z';
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
    s += `<path d="${shape(hi)}" fill="url(#h-iron)" opacity=".55" stroke="${INK.iron}" stroke-width=".8" stroke-dasharray="2 1.6" stroke-linejoin="round"/>`;
  s += `<path d="${shape(lo)}" fill="${wash}" fill-opacity=".62" stroke="${INK.iron}" stroke-width="1.3" stroke-linejoin="round"/>`;
  for (let i = 0; i < n; i++) {
    const [x, y] = at(i, Math.max(0.6, lo[i]));
    s += `<circle cx="${r2(x)}" cy="${r2(y)}" r="1.5" fill="${INK.iron}"/>`;
  }
  if (o.compare)
    s += `<path d="${shape(o.compare)}" fill="none" stroke="${INK.blue}" stroke-width="1.2" stroke-linejoin="round"/>`;
  const out = R + o.glyph * 0.62;
  points.forEach((p, i) => {
    const a = angle(i),
      gx = cx + Math.cos(a) * out,
      gy = cy + Math.sin(a) * out;
    s += glyph(p.glyph, gx, gy, o.glyph);
    if (o.numerals) {
      const side = Math.abs(Math.cos(a)) < 0.2 ? 1 : Math.sign(Math.cos(a));
      const nx = gx + side * o.glyph * 0.78,
        ny = gy + (Math.abs(Math.cos(a)) < 0.2 ? 0 : o.glyph * 0.05);
      const value = p.lo === p.hi ? `${p.lo}` : `${p.lo}–${p.hi}`;
      s += figure(nx, ny, value, o.glyph * 0.62, {
        anchor: side > 0 ? 'start' : 'end',
        weight: 600,
      });
    }
  });
  return s;
}

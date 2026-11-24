// A trail over a season: a figure out of 100 race by race (a chairman's
// confidence), a chart as wide as its place. Its rules across at the quarters,
// a line in harm at `under` (said in `warn`), the season's rounds along its
// foot, the races sailed as a line with a dot each and the last one's figure
// beside it; the rest of the season left open.

import { alpha, figure, svgNode } from '../ink.ts';
import { TONE } from './tokens.ts';

/** The trail's drawing, in its own units: its size, and the plot's edges inside it. */
const T = { w: 400, h: 160, l: 26, r: 388, t: 10, b: 140 } as const;

/** A season of `rounds`, its `marks` (by round, 0 the first; each 0…100), a line in harm at `under`. */
export function trail(
  rounds: number,
  marks: readonly { round: number; value: number }[],
  under: { at: number; warn: string }
) {
  const x = (round: number) =>
      T.l + ((round + 0.5) / Math.max(1, rounds)) * (T.r - T.l),
    y = (v: number) =>
      T.b - (Math.min(100, Math.max(0, v)) / 100) * (T.b - T.t);
  const said = (
    at: number,
    v: number,
    s: string | number,
    anchor: 'start' | 'middle' | 'end' = 'end'
  ) => figure(at, v, s, 9, { fill: TONE.label, anchor });
  let body = '';
  for (const v of [0, 25, 50, 75, 100])
    body +=
      `<line x1="${T.l}" x2="${T.r}" y1="${y(v)}" y2="${y(v)}" stroke="${alpha(TONE.ink, v === 0 ? 0.9 : 0.14)}" stroke-width="${v === 0 ? 0.9 : 0.7}"/>` +
      said(T.l - 4, y(v), v);
  body +=
    `<line x1="${T.l}" x2="${T.r}" y1="${y(under.at)}" y2="${y(under.at)}" stroke="${TONE.harm}" stroke-width="1.1" stroke-dasharray="5 3"/>` +
    figure(T.r, y(under.at) + 8, under.warn, 9, {
      fill: TONE.harm,
      anchor: 'end',
    });
  for (let r = 0; r < rounds; r++)
    body += said(x(r), T.b + 10, r + 1, 'middle');
  const line = marks
    .map(
      (m, i) =>
        `${i ? 'L' : 'M'}${x(m.round).toFixed(1)} ${y(m.value).toFixed(1)}`
    )
    .join('');
  if (line)
    body += `<path d="${line}" fill="none" stroke="${TONE.ink}" stroke-width="2" stroke-linejoin="round"/>`;
  for (const m of marks)
    body += `<circle cx="${x(m.round)}" cy="${y(m.value)}" r="4" fill="${TONE.ink}" stroke="${TONE.paper}" stroke-width="1.5"/>`;
  const last = marks.at(-1);
  if (last)
    body += figure(x(last.round) + 8, y(last.value) - 10, last.value, 11, {
      fill: TONE.ink,
      anchor: 'start',
      weight: 600,
    });
  const s = svgNode(T.w, T.h, body);
  s.removeAttribute('width');
  s.removeAttribute('height');
  s.setAttribute('class', 'cr-course');
  return s;
}

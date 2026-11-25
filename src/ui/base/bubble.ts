import { SIZE, SPACE, TYPE } from './house.ts';
import { INK, PAPER, uid } from './ink.ts';
import { uncle } from './gull.ts';
import { measured, spoken } from './word.ts';

export const LINES: Readonly<Record<string, string>> = {
  steer: 'Thumb here. Point where you want to go.',
  fire: 'Hold to fire. Drag to aim.',
  gust: 'Tap for a sprint.',
  heal: "That's a heal. Tap it when you're hurt.",
  home: "That's our water. More water, faster shield.",
  storm: "Storm's closing. Stay inside the ring.",
  sunk: 'Happens to everyone. Mostly me.',
  team: "Hire somebody. I can't do everything.",
  ship: 'A designer makes the ship less bad.',
  sponsors: 'Sponsors pay. Take the money.',
  opponents: "That's everyone better than us.",
};

export type Bubble = {
  svg: string;
  w: number;
  h: number;
  tip: [number, number];
};

const PORTRAIT = 40,
  POINTER = 11,
  LONGEST = 220;

const r2 = (n: number) => Math.round(n * 100) / 100;

function broken(line: string): string[] {
  if (measured(line, TYPE.speech, { italic: true }) <= LONGEST) return [line];
  const words = line.split(' ');
  let best = [line],
    worst = Infinity;
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(' '),
      b = words.slice(i).join(' ');
    const wide = Math.max(
      measured(a, TYPE.speech, { italic: true }),
      measured(b, TYPE.speech, { italic: true })
    );
    if (wide < worst) [best, worst] = [[a, b], wide];
  }
  return best;
}

export function bubble(line: string, aim: number): Bubble {
  const lines = broken(line.replace(/'/g, '\u2019')),
    leading = TYPE.speech * 1.3;
  const textW = Math.max(
    ...lines.map((l) => measured(l, TYPE.speech, { italic: true }))
  );
  const pad = SPACE.pad,
    left = PORTRAIT * 0.62;
  const w = Math.ceil(left + pad + textW + pad),
    h = Math.ceil(
      Math.max(PORTRAIT * 0.86, lines.length * leading + 2 * pad - 4)
    );
  const ox = PORTRAIT * 0.38,
    oy = 4;
  const tipX =
      ox +
      Math.min(
        w - SIZE.corner - POINTER,
        Math.max(SIZE.corner + POINTER, aim * w)
      ),
    tipY = oy + h + POINTER;
  const x0 = ox,
    y0 = oy,
    c = SIZE.corner,
    b = y0 + h;
  const body =
    `M${x0 + c} ${y0}H${x0 + w - c}Q${x0 + w} ${y0} ${x0 + w} ${y0 + c}V${b - c}Q${x0 + w} ${b} ${x0 + w - c} ${b}` +
    `H${r2(tipX + POINTER * 0.7)}L${r2(tipX)} ${r2(tipY)}L${r2(tipX - POINTER * 0.5)} ${b}` +
    `H${x0 + c}Q${x0} ${b} ${x0} ${b - c}V${y0 + c}Q${x0} ${y0} ${x0 + c} ${y0}Z`;
  const tx = x0 + left + pad,
    ty = y0 + h / 2 - ((lines.length - 1) * leading) / 2;
  const words = lines
    .map((l, i) =>
      spoken(tx, ty + i * leading, l, TYPE.speech, { anchor: 'start' })
    )
    .join('');
  const px = 0,
    py = y0 + h / 2 - PORTRAIT / 2;
  const clip = uid('uncle');
  const face =
    `<clipPath id="${clip}"><circle cx="${PORTRAIT / 2}" cy="${PORTRAIT / 2}" r="${PORTRAIT / 2 - 1.2}"/></clipPath>` +
    `<circle cx="${px + PORTRAIT / 2}" cy="${r2(py + PORTRAIT / 2)}" r="${PORTRAIT / 2}" fill="${PAPER}" stroke="${INK.iron}" stroke-width="1.4" filter="url(#sh)"/>` +
    `<g transform="translate(${px} ${r2(py)})"><g clip-path="url(#${clip})">${uncle(PORTRAIT)}</g></g>` +
    `<circle cx="${px + PORTRAIT / 2}" cy="${r2(py + PORTRAIT / 2)}" r="${PORTRAIT / 2}" fill="none" stroke="${INK.iron}" stroke-width="1.4"/>`;
  return {
    svg:
      `<path d="${body}" fill="${PAPER}" stroke="${INK.iron}" stroke-width="1.2" stroke-linejoin="round" filter="url(#sh)"/>` +
      words +
      face,
    w: ox + w + 2,
    h: tipY + 2,
    tip: [tipX, tipY],
  };
}

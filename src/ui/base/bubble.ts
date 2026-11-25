import { SIZE, SPACE, TYPE } from './house.ts';
import { INK, PAPER, r2, uid } from './ink.ts';
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

type Bubble = { svg: string; w: number; h: number; tip: [number, number] };

const PORTRAIT = 40,
  POINTER = 11,
  LONGEST = 220;

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

export function uncleFace(x: number, y: number, size: number): string {
  const clip = uid('uncle'),
    r = size / 2,
    cx = r2(x + r),
    cy = r2(y + r);
  return (
    `<clipPath id="${clip}"><circle cx="${r}" cy="${r}" r="${r - 1.2}"/></clipPath>` +
    `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${PAPER}" stroke="${INK.iron}" stroke-width="1.4" filter="url(#sh)"/>` +
    `<g transform="translate(${r2(x)} ${r2(y)})"><g clip-path="url(#${clip})"><g class="tilt">${uncle(size)}</g></g></g>` +
    `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${INK.iron}" stroke-width="1.4"/>`
  );
}

export type Side = 'down' | 'up' | 'left' | 'right';

export function bubble(
  line: string,
  aim: number,
  side: Side = 'down',
  facing: 'left' | 'right' = side === 'left' ? 'right' : 'left'
): Bubble {
  const lines = broken(line.replace(/'/g, '\u2019')),
    leading = TYPE.speech * 1.3;
  const textW = Math.max(
    ...lines.map((l) => measured(l, TYPE.speech, { italic: true }))
  );
  const pad = SPACE.pad,
    left = PORTRAIT * 0.62,
    over = PORTRAIT * 0.38;
  const w = Math.ceil(left + pad + textW + pad),
    h = Math.ceil(
      Math.max(PORTRAIT * 0.86, lines.length * leading + 2 * pad - 4)
    );
  const x0 = (facing === 'left' ? over : 0) + (side === 'left' ? POINTER : 0),
    y0 = 4 + (side === 'up' ? POINTER : 0),
    c = SIZE.corner,
    b = y0 + h,
    r = x0 + w;
  const along = (span: number, room: number) =>
    Math.min(span - c - room, Math.max(c + room, aim * span));
  const tipX = x0 + along(w, POINTER),
    tipY = y0 + along(h, POINTER * 0.5);
  const tip: [number, number] =
    side === 'down'
      ? [tipX, b + POINTER]
      : side === 'up'
        ? [tipX, y0 - POINTER]
        : side === 'right'
          ? [r + POINTER, tipY]
          : [x0 - POINTER, tipY];
  const top =
    side === 'up'
      ? `H${r2(tipX - POINTER * 0.5)}L${r2(tip[0])} ${r2(tip[1])}L${r2(tipX + POINTER * 0.7)} ${y0}H${r - c}`
      : `H${r - c}`;
  const right =
    side === 'right'
      ? `V${r2(tipY - POINTER * 0.5)}L${r2(tip[0])} ${r2(tip[1])}L${r} ${r2(tipY + POINTER * 0.6)}V${b - c}`
      : `V${b - c}`;
  const bottom =
    side === 'down'
      ? `H${r2(tipX + POINTER * 0.7)}L${r2(tip[0])} ${r2(tip[1])}L${r2(tipX - POINTER * 0.5)} ${b}H${x0 + c}`
      : `H${x0 + c}`;
  const leftEdge =
    side === 'left'
      ? `V${r2(tipY + POINTER * 0.6)}L${r2(tip[0])} ${r2(tip[1])}L${x0} ${r2(tipY - POINTER * 0.5)}V${y0 + c}`
      : `V${y0 + c}`;
  const body =
    `M${x0 + c} ${y0}${top}Q${r} ${y0} ${r} ${y0 + c}${right}` +
    `Q${r} ${b} ${r - c} ${b}${bottom}Q${x0} ${b} ${x0} ${b - c}${leftEdge}Q${x0} ${y0} ${x0 + c} ${y0}Z`;
  const tx = facing === 'left' ? x0 + left + pad : x0 + pad,
    ty = y0 + h / 2 - ((lines.length - 1) * leading) / 2;
  const words = lines
    .map((l, i) =>
      spoken(tx, ty + i * leading, l, TYPE.speech, { anchor: 'start' })
    )
    .join('');
  const px = facing === 'left' ? x0 - over : r - left,
    py = y0 + h / 2 - PORTRAIT / 2;
  const face = uncleFace(px, py, PORTRAIT);
  return {
    svg:
      `<g class="said ${facing}"><g class="scroll"><path d="${body}" fill="${PAPER}" stroke="${INK.iron}" stroke-width="1.2" stroke-linejoin="round" filter="url(#sh)"/>` +
      `<g class="words">${words}</g></g><g class="sitter">${face}</g></g>`,
    w:
      r +
      (facing === 'right' ? over : 0) +
      (side === 'right' ? POINTER : 0) +
      2,
    h: b + (side === 'down' ? POINTER + 2 : 4),
    tip,
  };
}

import { SMALLEST, type Glyph } from '../ui/base/glyphs.ts';
import {
  INK,
  figure,
  glyph,
  parchment,
  slip,
  svgNode,
} from '../ui/base/ink.ts';
import { random } from '../world/random.ts';
import { JACKETS, SHADES, lookOf, portrait, uncle } from '../ui/base/gull.ts';
import { die, dyePot, laurel, spyglass } from '../ui/base/marks.ts';
import { uiLayer } from '../ui/base/ui.ts';

const W = 1180,
  H = 820,
  EDGE = 14,
  GAP = 8,
  SPLIT = 18,
  APART = 22,
  ROW = 64 + 22,
  FAINT = 0.35;

interface Entry {
  name: string;
  sizes: readonly number[];
  draw(x: number, y: number, size: number, opacity: number): string;
}

const sizesFrom = (smallest: number) =>
  [...new Set([smallest, Math.max(40, smallest), 64])].sort((a, b) => a - b);

const named = (
  name: Glyph,
  smallest: number,
  label: string = name,
  ink?: 'rubric'
): Entry => ({
  name: label,
  sizes: sizesFrom(smallest),
  draw: (x, y, size, opacity) => glyph(name, x, y, size, { opacity, ink }),
});

const mark = (
  name: string,
  draw: (x: number, y: number, size: number) => string
): Entry => ({
  name,
  sizes: sizesFrom(24),
  draw: (x, y, size, opacity) =>
    `<g opacity="${opacity}">${draw(x, y, size)}</g>`,
});

const ENTRIES: readonly Entry[] = [
  ...SMALLEST.flatMap(([name, smallest]) =>
    name === 'cross'
      ? [
          named(name, smallest, 'cross (close)'),
          named(name, smallest, 'cross (refusal)', 'rubric'),
        ]
      : [named(name, smallest)]
  ),
  mark('spyglass', (x, y, s) => spyglass(x, y, s)),
  mark('die', (x, y, s) => die(x, y, s)),
  mark('dye pot', (x, y, s) => dyePot(x, y, s, '#3d5f9e')),
  mark('laurel', (x, y, s) => laurel(x, y, s * 0.38)),
];

const widthOf = (e: Entry) => {
  const one = e.sizes.reduce((a, b) => a + b, 0) + GAP * (e.sizes.length - 1);
  return one * 2 + SPLIT;
};

function cell(e: Entry, x: number, y: number) {
  let s = '',
    at = x;
  for (const opacity of [1, FAINT]) {
    for (const size of e.sizes) {
      s += e.draw(at + size / 2, y + 32, size, opacity);
      at += size + GAP;
    }
    at += SPLIT - GAP;
  }
  return (
    s + figure(x + widthOf(e) / 2, y + 64 + 10, e.name, 11, { fill: INK.iron })
  );
}

function pages() {
  const out: string[][] = [[]];
  let x = EDGE,
    y = EDGE;
  for (const e of ENTRIES) {
    const w = widthOf(e);
    if (x + w > W - EDGE) {
      x = EDGE;
      y += ROW;
    }
    if (y + ROW > H - EDGE) {
      out.push([]);
      y = EDGE;
    }
    out[out.length - 1].push(cell(e, x, y));
    x += w + APART;
  }
  return out;
}

const UNIT = W / 680,
  SMALL = 28,
  CARD = 80,
  SEEDS = 2026;

const seedFor = (jacket: number, shades: number) => {
  for (let seed = 0; ; seed++) {
    const look = lookOf(seed);
    if (look.jacket === JACKETS[jacket] && look.shades === SHADES[shades])
      return seed;
  }
};

const placed = (markup: string, x: number, y: number) =>
  `<g transform="translate(${x} ${y})">${markup}</g>`;

function portraits() {
  let s = figure(14, 12, `small, ${SMALL} units`, 9, { anchor: 'start' });
  SHADES.forEach((shades, row) => {
    const y = 20 + row * (SMALL + 4);
    s += figure(14, y + SMALL / 2, shades, 8, { anchor: 'start' });
    JACKETS.forEach((_, col) => {
      s += placed(
        portrait(seedFor(col, row), SMALL),
        56 + col * (SMALL + 4),
        y
      );
    });
  });
  s += figure(14, 222, `card, ${CARD} units`, 9, { anchor: 'start' });
  SHADES.forEach((shades, i) => {
    for (const [row, jacket] of [0, 7].entries()) {
      const x = 14 + i * (CARD + 6),
        y = 230 + row * (CARD + 4);
      s += placed(
        portrait(seedFor((jacket + i) % JACKETS.length, i), CARD),
        x,
        y
      );
    }
    s += figure(
      14 + i * (CARD + 6) + CARD / 2,
      230 + 2 * (CARD + 4) + 4,
      shades,
      8
    );
  });
  s += figure(540, 222, 'Uncle', 9, { anchor: 'start' });
  s += placed(uncle(CARD), 540, 230);
  s += slip(540, 316, 34, 34) + placed(uncle(SMALL), 543, 319);
  s += placed(uncle(SMALL), 590, 319);
  s += figure(480, 12, 'twelve seeds', 9, { anchor: 'start' });
  const draw = random(SEEDS);
  for (let i = 0; i < 12; i++) {
    const seed = Math.floor(draw() * 2 ** 32),
      x = 480 + (i % 4) * 46,
      y = 20 + Math.floor(i / 4) * 60;
    s += slip(x, y, 36, 36) + placed(portrait(seed, SMALL), x + 4, y + 4);
    s += figure(x + 18, y + 44, seed, 6);
  }
  s += figure(14, 433, 'Uncle among the hired', 9, { anchor: 'start' });
  for (let i = 0; i < 9; i++) {
    const x = 120 + i * 42;
    s +=
      slip(x, 416, 34, 34) +
      placed(i === 4 ? uncle(SMALL) : portrait(i * 7 + 3, SMALL), x + 3, 419);
  }
  return `<g transform="scale(${UNIT.toFixed(4)})">${s}</g>`;
}

export function specimen(page: number) {
  const all = [...pages(), [portraits()]],
    shown = all[Math.min(Math.max(page, 1), all.length) - 1];
  const el = document.createElement('div');
  el.style.cssText = `position:fixed;inset:0;z-index:5;background:${parchment}`;
  el.append(
    svgNode(
      W,
      H,
      shown.join('') +
        figure(W - EDGE, H - 8, `page ${page} of ${all.length}`, 11, {
          anchor: 'end',
        })
    )
  );
  uiLayer().append(el);
  const meter = document.getElementById('meter');
  if (meter) meter.dataset.line = `glyphs, page ${page} of ${all.length}`;
}

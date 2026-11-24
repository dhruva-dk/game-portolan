import { SMALLEST, type Glyph } from '../ui/base/glyphs.ts';
import { INK, figure, glyph, parchment, svgNode } from '../ui/base/ink.ts';
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

export function specimen(page: number) {
  const all = pages(),
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

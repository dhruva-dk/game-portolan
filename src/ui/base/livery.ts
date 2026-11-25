import { SAIL_MARKS } from '../../render/snapshot.ts';
import {
  DEVICES,
  DEVICE_BOX,
  DYES,
  EMBLEMS,
  PATTERNS,
  deviceOf,
  type Livery,
} from '../../world/livery.ts';
import { pressable } from './button.ts';
import { emblemAt, liveryColors } from './emblem.ts';
import { FAINT, SPACE } from './house.ts';
import { GILT, INK, r2, roughCircle, slip } from './ink.ts';

export type Swatch = { chosen: boolean; faint: boolean };

type LiveryChoices = {
  dyes: readonly Swatch[];
  patterns: readonly Swatch[];
  emblems: readonly Swatch[];
  livery: Livery;
  emblem: number;
};

export type LiveryPick = 'dye' | 'pattern' | 'emblem';

const ROWS = {
  dye: { cols: 8, h: 30, r: 11.5 },
  pattern: { cols: PATTERNS.length, h: 46 },
  emblem: { cols: 6, h: 30, size: 25 },
} as const;

const KINDS: readonly LiveryPick[] = ['dye', 'pattern', 'emblem'];

const countOf = (kind: LiveryPick) =>
  kind === 'dye' ? DYES.length : kind === 'pattern' ? PATTERNS.length : EMBLEMS;

const rowsOf = (kind: LiveryPick) => Math.ceil(countOf(kind) / ROWS[kind].cols);

const tops = (() => {
  let y = 0;
  const at: Record<LiveryPick, number> = { dye: 0, pattern: 0, emblem: 0 };
  for (const kind of KINDS) {
    at[kind] = y;
    y += rowsOf(kind) * ROWS[kind].h + SPACE.gap;
  }
  return { at, h: y - SPACE.gap };
})();

export const LIVERY_HEIGHT = tops.h;

function cell(kind: LiveryPick, w: number, i: number) {
  const { cols, h } = ROWS[kind],
    cw = w / cols;
  return {
    x: (i % cols) * cw,
    y: tops.at[kind] + Math.floor(i / cols) * h,
    w: cw,
    h,
  };
}

const centerOf = (kind: LiveryPick, w: number, i: number) => {
  const c = cell(kind, w, i);
  return { x: c.x + c.w / 2, y: c.y + c.h / 2 };
};

const dyeHex = (dye: number) => liveryColors({ dye, pattern: 0 });

const daub = (x: number, y: number, fill: string, seed: number) =>
  `<path d="${roughCircle(x, y, ROWS.dye.r, seed, 2.2)}" style="fill:${fill}" stroke="${INK.iron}" stroke-width="1"/>` +
  `<path d="M${r2(x - 6.5)} ${r2(y - 3)}Q${r2(x - 5.5)} ${r2(y - 7.5)} ${r2(x - 1)} ${r2(y - 8.5)}" fill="none" stroke="${INK.white}" stroke-width="1.6" stroke-linecap="round" opacity=".55"/>`;

function marks(pattern: number, l: number, t: number, w: number, h: number) {
  const { band, stripes } = SAIL_MARKS;
  if (pattern === 1)
    return `<rect x="${r2(l)}" y="${r2(t + h * band[0])}" width="${r2(w)}" height="${r2(h * (band[1] - band[0]))}"/>`;
  if (pattern !== 2) return '';
  let s = '';
  for (let k = -stripes; k <= stripes; k++) {
    const a = Math.max(0, 0.5 + (2 * k - 0.5) / stripes),
      b = Math.min(1, 0.5 + (2 * k + 0.5) / stripes);
    if (b > a)
      s += `<rect x="${r2(l + a * w)}" y="${r2(t)}" width="${r2((b - a) * w)}" height="${r2(h)}"/>`;
  }
  return s;
}

function device(
  x: number,
  y: number,
  h: number,
  emblem: number,
  style: string
) {
  const k = (SAIL_MARKS.device * h) / 2 / DEVICE_BOX.half;
  return (
    `<g transform="translate(${r2(x - DEVICE_BOX.x * k)} ${r2(y - DEVICE_BOX.y * k)}) scale(${r2(k * 100) / 100})">` +
    `<path class="sw-device" d="${DEVICES[deviceOf(emblem)]}" ${style}/></g>`
  );
}

function sailSwatch(
  x: number,
  y: number,
  dye: string,
  mark: string,
  pattern: number,
  scale = 1,
  emblem = 0,
  clip = `sw-${pattern}`
) {
  const w = 40 * scale,
    h = 34 * scale,
    l = x - w / 2,
    t = y - h / 2 + 2,
    cy = t + h / 2,
    bow = 2.5 * scale;
  const shape = `M${r2(l)} ${r2(t)}Q${r2(x)} ${r2(t + 3)} ${r2(l + w)} ${r2(t)}Q${r2(l + w + bow)} ${r2(cy)} ${r2(l + w)} ${r2(t + h)}Q${r2(x)} ${r2(t + h + 4)} ${r2(l)} ${r2(t + h)}Q${r2(l - bow)} ${r2(cy)} ${r2(l)} ${r2(t)}Z`;
  const { band } = SAIL_MARKS,
    fringe = 2 * SAIL_MARKS.fringe * DEVICE_BOX.half;
  return (
    `<path d="M${r2(l - 6)} ${r2(t - 1)}H${r2(l + w + 6)}" stroke="${INK.iron}" stroke-width="2.4" stroke-linecap="round"/>` +
    `<path d="${shape}" style="fill:${dye}"/>` +
    `<g style="fill:${mark}">${marks(pattern, l, t, w, h)}</g>` +
    (pattern === 2
      ? device(
          x,
          cy,
          h,
          emblem,
          `style="fill:${dye};stroke:${dye}" stroke-width="${fringe}" stroke-linejoin="round"`
        )
      : '') +
    device(x, cy, h, emblem, `style="fill:${mark}"`) +
    (pattern === 1
      ? `<clipPath id="${clip}"><rect x="${r2(l)}" y="${r2(t + h * band[0])}" width="${r2(w)}" height="${r2(h * (band[1] - band[0]))}"/></clipPath>` +
        `<g clip-path="url(#${clip})">${device(x, cy, h, emblem, `style="fill:${dye}"`)}</g>`
      : '') +
    `<path d="${shape}" fill="none" stroke="${INK.iron}" stroke-width="1.2" stroke-linejoin="round"/>`
  );
}

const ring = (r: number) =>
  `<circle r="${r2(r + 1.8)}" fill="none" stroke="${INK.iron}" stroke-width=".8"/>` +
  `<circle r="${r2(r)}" fill="none" stroke="${INK.gold}" stroke-width="3"/>`;

const at = (p: { x: number; y: number }) =>
  `translate(${r2(p.x)}px, ${r2(p.y)}px)`;

const swatchOf = (c: LiveryChoices, kind: LiveryPick) =>
  kind === 'dye' ? c.dyes : kind === 'pattern' ? c.patterns : c.emblems;

const chosenOf = (c: LiveryChoices, kind: LiveryPick) =>
  kind === 'dye'
    ? c.livery.dye
    : kind === 'pattern'
      ? c.livery.pattern
      : c.emblem;

const faintness = (s: Swatch | undefined) =>
  s?.faint ? String(FAINT + 0.1) : '1';

function underlay(kind: LiveryPick, w: number) {
  const c = cell(kind, w, 0),
    inset = 2;
  return slip(inset, c.y + inset, c.w - 2 * inset, c.h - 2 * inset, {
    fill: GILT,
    bold: true,
    flat: true,
  });
}

export function liveryFace(id: string, w: number, c: LiveryChoices) {
  const [dye, mark] = liveryColors(c.livery);
  let s = `<g id="${id}" style="--dye:${dye};--mark:${mark}">`;
  for (const kind of ['pattern', 'emblem'] as const) {
    const first = cell(kind, w, 0),
      to = cell(kind, w, chosenOf(c, kind));
    s += `<g id="${id}-${kind}-mark" class="picked" style="transform:${at({ x: to.x - first.x, y: to.y - first.y })}">${underlay(kind, w)}</g>`;
  }
  DYES.forEach((_, i) => {
    const { x, y, w: cw, h } = cell('dye', w, i),
      mid = centerOf('dye', w, i);
    s +=
      `<g id="${id}-dye-${i}" opacity="${faintness(c.dyes[i])}"><rect x="${r2(x)}" y="${r2(y)}" width="${r2(cw)}" height="${h}" fill="transparent"/>` +
      `<g class="face">${daub(mid.x, mid.y, dyeHex(i)[0], i * 7 + 3)}</g></g>`;
  });
  PATTERNS.forEach((_, i) => {
    const { x, y, w: cw, h } = cell('pattern', w, i),
      mid = centerOf('pattern', w, i);
    s +=
      `<g id="${id}-pattern-${i}" opacity="${faintness(c.patterns[i])}"><rect x="${r2(x)}" y="${r2(y)}" width="${r2(cw)}" height="${h}" fill="transparent"/>` +
      `<g class="face dyed">${sailSwatch(mid.x, mid.y, 'var(--dye)', 'var(--mark)', i, 0.95, c.emblem, `${id}-band-${i}`)}</g></g>`;
  });
  for (let i = 0; i < EMBLEMS; i++) {
    const { x, y, w: cw, h } = cell('emblem', w, i),
      mid = centerOf('emblem', w, i);
    s +=
      `<g id="${id}-emblem-${i}" opacity="${faintness(c.emblems[i])}"><rect x="${r2(x)}" y="${r2(y)}" width="${r2(cw)}" height="${h}" fill="transparent"/>` +
      `<g class="face dyed">${emblemAt(i, ['var(--dye)', 'var(--mark)'], mid.x, mid.y, ROWS.emblem.size)}</g></g>`;
  }
  s += `<g id="${id}-dye-mark" class="picked" style="transform:${at(centerOf('dye', w, c.livery.dye))}"><g class="ringed">${ring(ROWS.dye.r + 3.5)}</g></g>`;
  return s + '</g>';
}

export function setLivery(
  svg: SVGSVGElement,
  id: string,
  w: number,
  c: LiveryChoices
) {
  const root = svg.querySelector<SVGGElement>(`#${id}`);
  if (!root) return;
  const [dye, mark] = liveryColors(c.livery);
  root.style.setProperty('--dye', dye);
  root.style.setProperty('--mark', mark);
  const outline = DEVICES[deviceOf(c.emblem)];
  root.querySelectorAll('.sw-device').forEach((path) => {
    if (path.getAttribute('d') !== outline) path.setAttribute('d', outline);
  });
  for (const kind of KINDS) {
    swatchOf(c, kind).forEach((s, i) =>
      svg
        .querySelector(`#${id}-${kind}-${i}`)
        ?.setAttribute('opacity', faintness(s))
    );
    const markEl = svg.querySelector<SVGElement>(`#${id}-${kind}-mark`);
    if (!markEl) continue;
    if (kind === 'dye') {
      markEl.style.transform = at(centerOf('dye', w, c.livery.dye));
      continue;
    }
    const first = cell(kind, w, 0),
      to = cell(kind, w, chosenOf(c, kind));
    markEl.style.transform = at({ x: to.x - first.x, y: to.y - first.y });
  }
}

export function bindLivery(
  svg: SVGSVGElement,
  id: string,
  pick: (kind: LiveryPick, index: number) => boolean | void
) {
  for (const kind of KINDS)
    for (let i = 0; i < countOf(kind); i++) {
      const el = svg.querySelector<SVGElement>(`#${id}-${kind}-${i}`);
      pressable(
        el,
        () => {
          const face = el?.querySelector<SVGElement>('.face'),
            answer = pick(kind, i) === false ? 'refuse' : 'answer';
          face?.classList.remove('answer', 'refuse');
          void face?.getBoundingClientRect();
          face?.classList.add(answer);
        },
        `${kind}-${i}`
      );
    }
}

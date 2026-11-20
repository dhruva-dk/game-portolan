// The page side of tools/appicon.ts: loaded into headless Chromium by Vite, it draws the app's icon from the chart's
// own rose (src/ui/marks.ts rose, recoloured through its inks) on a ground, rasterises it opaque at 1024 px and steps it
// down to any smaller size, and hands back the pixels as base64 RGB, three bytes a pixel.

import { INK, WASH, svg } from '../src/ui/ink.ts';
import { ROSE, rose, type RoseInks } from '../src/ui/marks.ts';

export const SIZE = 1024;
/** The rose's radius: its ring some 80% of the square, inside the corners iOS rounds away. */
const RADIUS = SIZE * 0.4;

interface Icon { what: string; ground: string; inks: RoseInks }

const CREAM = '#fbf4e2';
/** The icon's rose: the screens' lines five times as heavy, its points half again as broad, its chequer filling the band
 * between its rings, and no needle. */
const BOLD = { ...ROSE, weight: 5, breadth: 1.5, chequer: 0.07, needle: null } as const;
/** A ground of two stops, `inner` at the middle to `outer` at the corners. */
const ground = (inner: string, outer: string) =>
  `<defs><radialGradient id="g" cx="50%" cy="46%" r="72%">`
  + `<stop offset="0" stop-color="${inner}"/><stop offset="1" stop-color="${outer}"/></radialGradient></defs>`
  + `<rect width="${SIZE}" height="${SIZE}" fill="url(#g)"/>`;

/** The points in colour: blue cardinals, rubric half-cardinals, green half winds, gilt quarter winds. */
const COLOURED = {
  cardinal: [INK.blue, CREAM], ordinal: [WASH.vermilion, CREAM], half: ['#3f7d4a', CREAM], quarter: [WASH.gold, CREAM],
} as const;

export const ICONS: Record<string, Icon> = {
  parchment: {
    what: 'the rose in colour on bright, clean parchment',
    ground: ground('#f9efd6', '#e6cf9c'),
    inks: { ...BOLD, ...COLOURED, face: '#fdf8ea' },
  },
  sea: {
    what: 'the rose in cream, gold and colour on deep sea blue',
    ground: ground('#2b5d93', '#10264a'),
    inks: {
      ...BOLD, face: 'rgba(255,255,255,.05)', line: '#0c1a30', ring: WASH.gold,
      cardinal: [WASH.gold, CREAM], ordinal: [WASH.vermilion, CREAM], half: ['#5aa48c', CREAM], quarter: ['#e7d39e', CREAM],
    },
  },
  card: {
    what: 'the rose on its parchment card, set on deep sea blue',
    ground: ground('#2b5d93', '#10264a'),
    inks: { ...BOLD, ...COLOURED, face: '#fbf3df' },
  },
};

/** The icon's markup: the ground, and the rose a little below the middle, so its fleur-de-lis and ring sit even. */
export const markup = (name: string) => {
  const icon = ICONS[name];
  if (!icon) throw new Error(`no icon '${name}': ${Object.keys(ICONS).join(', ')}`);
  return svg(SIZE, SIZE, icon.ground + rose(SIZE / 2, SIZE / 2 + RADIUS * 0.06, RADIUS, 0, icon.inks));
};

const canvas = (size: number) => {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d', { alpha: false });
  if (!g) throw new Error('no 2d context');
  g.imageSmoothingQuality = 'high';
  return { c, g };
};

/** The icon `name` at `size` px square, opaque, as base64 RGB: drawn at 1024 and halved down toward the size. */
export async function pixels(name: string, size: number): Promise<string> {
  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup(name))}`;
  await img.decode();
  let at = canvas(SIZE);
  at.g.drawImage(img, 0, 0, SIZE, SIZE);
  while (at.c.width / 2 >= size && at.c.width / 2 >= 1) {
    const next = canvas(at.c.width / 2);
    next.g.drawImage(at.c, 0, 0, next.c.width, next.c.width);
    at = next;
  }
  if (at.c.width !== size) {
    const last = canvas(size);
    last.g.drawImage(at.c, 0, 0, size, size);
    at = last;
  }
  const rgba = at.g.getImageData(0, 0, size, size).data, rgb = new Uint8Array(size * size * 3);
  for (let i = 0, j = 0; i < rgba.length; i += 4, j += 3) rgb.set(rgba.subarray(i, i + 3), j);
  let s = '';
  for (let i = 0; i < rgb.length; i += 0x8000) s += String.fromCharCode(...rgb.subarray(i, i + 0x8000));
  return btoa(s);
}

import { clamp } from '../../world/scalar.ts';
import {
  GILT,
  INK,
  PAPER,
  SHADOW,
  WASH,
  alpha,
  bar,
  figure,
  galleon,
  glyph,
  paperDisc,
  parchment,
  roughRect,
  slip,
  svgNode,
} from './ink.ts';
import { dyePot, pencil, rhumbs, rose } from './marks.ts';
import { keep, onTap, region } from './touch.ts';
import { at, boxOf, fade, onResize, page, screen, type Page } from './ui.ts';

export interface Folio {
  sound: number;
  stats: boolean;
}

export function sheet(opaque: boolean, press = true) {
  const root = screen(press);
  if (opaque) root.style.background = parchment;
  let last: (() => SVGSVGElement) | null = null;
  const set = (
    body: (p: Page) => string,
    bind?: (el: SVGSVGElement) => void
  ) => {
    last = () => {
      const p = page(),
        el = svgNode(p.w, p.h, body(p));
      el.setAttribute('width', '100%');
      el.setAttribute('height', '100%');
      root.replaceChildren(el);
      bind?.(el);
      return el;
    };
    return last();
  };
  onResize(() => {
    if (last && !root.hidden) last();
  });
  return { root, set, show: (on: boolean, ms?: number) => fade(root, on, ms) };
}

export function banner(
  x: number,
  y: number,
  w: number,
  mark: string,
  gilt = false
) {
  const k = w / 210,
    l = x - w / 2,
    r = x + w / 2,
    t = y - 40 * k,
    b = y + 42 * k;
  const d = `M${l} ${t + 4 * k}Q${x} ${t - 8 * k} ${r} ${t}L${r - 26 * k} ${y}L${r} ${b}Q${x} ${b - 6 * k} ${l} ${b + 2 * k}L${l + 26 * k} ${y}Z`;
  return (
    `<path d="${d}" fill="${gilt ? GILT : 'url(#pg)'}" stroke="${INK.iron}" stroke-width="1.6" filter="url(#sh)"/>` +
    `<path d="${d}" fill="none" stroke="${INK.iron}" stroke-width=".5" opacity=".5" transform="translate(${x} ${y}) scale(.93) translate(${-x} ${-y})"/>` +
    mark
  );
}

const SWING = 'needle 1.6s ease-in-out infinite alternate';

export function createTitle() {
  const s = sheet(true);
  s.root.style.zIndex = '3';
  let needle!: SVGGElement,
    settled = false;
  s.set(
    (p) =>
      at(
        p,
        'center',
        'middle',
        rhumbs(478, 182, 1100, 0.3) +
          rose(478, 182, 126, 0) +
          galleon(478, 352, 74, { hull: 'url(#h-gold)' })
      ),
    (el) => {
      needle = el.querySelector<SVGGElement>('.needle')!;
      needle.style.animation = settled ? 'none' : SWING;
    }
  );
  return {
    root: s.root,
    show: s.show,
    swing() {
      settled = false;
      needle.style.transition = 'none';
      needle.style.transform = '';
      needle.style.animation = SWING;
    },
    ready() {
      settled = true;
      needle.style.animation = 'none';
      needle.style.transition = 'transform 0.9s cubic-bezier(.3,1.6,.5,1)';
      needle.style.transform = 'rotate(0deg)';
    },
  };
}

export type Title = ReturnType<typeof createTitle>;

function seedChip(x: number, y: number, name: string) {
  const w = 56 + Math.max(2, name.length) * 10.5;
  return (
    `<g id="seed">${slip(x, y, w, 44, { bold: true })}` +
    `${figure(x + 16, y + 22, name, 21, { anchor: 'start' })}${pencil(x + w - 22, y + 22, 22)}</g>`
  );
}

export function createLobby(
  name: string,
  dye: () => string,
  act: { play(): void; settings(): void; seed(): void; livery(): void }
) {
  const s = sheet(false, false);
  let drawn: string | null = null;
  return {
    show(on: boolean) {
      if (on && drawn !== dye()) {
        drawn = dye();
        const pot = drawn;
        s.set(
          (p) =>
            at(p, 'left', 'top', seedChip(66, 18, name)) +
            at(
              p,
              'right',
              'top',
              `<g id="wheel"><circle cx="866" cy="40" r="26" fill="url(#pg)" stroke="${INK.iron}" stroke-width="1.6" filter="url(#sh)"/>${glyph('wheel', 866, 40, 34)}</g>` +
                `<g id="livery"><circle cx="802" cy="40" r="26" fill="url(#pg)" stroke="${INK.iron}" stroke-width="1.6" filter="url(#sh)"/>${dyePot(801, 42, 36, pot)}</g>`
            ) +
            at(
              p,
              'right',
              'bottom',
              `<g id="play">${banner(777, 318, 210, galleon(777, 314, 78, { waves: true }))}</g>`
            ),
          (el) => {
            region(el, 'wheel', act.settings);
            region(el, 'play', act.play);
            region(el, 'seed', act.seed);
            region(el, 'livery', act.livery);
          }
        );
      }
      s.show(on);
    },
  };
}

export function folio(
  { x, y, w, h }: { x: number; y: number; w: number; h: number },
  place: [Parameters<typeof at>[1], Parameters<typeof at>[2]],
  close: () => void,
  shade = true
) {
  const s = sheet(false);
  s.root.style.zIndex = '1';
  if (shade) s.root.style.background = alpha(SHADOW, 0.25);
  onTap(s.root, close);
  return {
    ...s,
    draw(body: string, bind?: (el: SVGSVGElement) => void) {
      return s.set(
        (p) =>
          at(
            p,
            ...place,
            `<g id="folio">` +
              `<path d="${roughRect(x, y, w, h, 9)}" fill="url(#pg)" stroke="${INK.iron}" stroke-width="1" filter="url(#sh)"/>` +
              `<rect x="${x + 10}" y="${y + 10}" width="${w - 20}" height="${h - 20}" fill="none" stroke="${INK.iron}" stroke-width="1.2"/>` +
              `<rect x="${x + 14}" y="${y + 14}" width="${w - 28}" height="${h - 28}" fill="none" stroke="${INK.iron}" stroke-width=".5"/>${body}</g>` +
              `<g id="close">${paperDisc(x + w - 4, y + 4, 19)}${glyph('cross', x + w - 4, y + 4, 20)}</g>`
          ),
        (el) => {
          const inner = el.querySelector<SVGGElement>('#folio')!;
          inner.style.pointerEvents = 'auto';
          keep(inner);
          region(el, 'close', close);
          bind?.(el);
        }
      );
    },
  };
}

export function createSettings(
  get: () => Folio,
  set: (s: Folio) => void,
  close: () => void
) {
  const x = 540,
    y = 86,
    w = 332,
    h = 150;
  const f = folio({ x, y, w, h }, ['right', 'top'], close);
  const draw = () => {
    const v = get();
    const row = (
      id: string,
      cy: number,
      icon: string,
      value: number,
      wash: string
    ) =>
      `<g id="${id}">${icon}<rect x="${x + 90}" y="${cy - 22}" width="214" height="44" fill="transparent"/>${bar(x + 96, cy, 200, 22, value, wash)}</g>`;
    const graph = (cy: number) => {
      const l = x + 42,
        b = cy + 13;
      return (
        `<g stroke="${INK.iron}" stroke-linejoin="round" stroke-linecap="round" fill="none">` +
        `<path d="M${l + 5} ${b}V${b - 9}M${l + 12} ${b}V${b - 16}M${l + 19} ${b}V${b - 12}" stroke="${WASH.ochre}" stroke-width="4.5" stroke-linecap="butt"/>` +
        `<path d="M${l} ${cy - 14}V${b}H${l + 25}" stroke-width="1.6"/>` +
        `<path d="M${l + 3} ${b - 13}L${l + 10} ${b - 21}L${l + 17} ${b - 17}L${l + 24} ${b - 25}" stroke="${INK.rubric}" stroke-width="1.6"/></g>`
      );
    };
    const box = (cy: number, on: boolean) =>
      `<path d="${roughRect(x + 96, cy - 14, 28, 28, 5)}" fill="${on ? WASH.viridian : PAPER}" fill-opacity="${on ? 0.85 : 1}" stroke="${INK.iron}" stroke-width=".9"/>` +
      (on
        ? `<path d="M${x + 102} ${cy}L${x + 108} ${cy + 7}L${x + 119} ${cy - 7}" fill="none" stroke="${INK.white}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`
        : '');
    const stats = `<g id="stats">${graph(176)}<rect x="${x + 30}" y="${176 - 24}" width="${w - 60}" height="48" fill="transparent"/>${box(176, v.stats)}</g>`;
    f.draw(
      row(
        'sound',
        118,
        glyph('menu.speaker', x + 54, 118, 30),
        v.sound,
        WASH.azure
      ) + stats,
      (el) => {
        region(el, 'stats', () => {
          set({ ...get(), stats: !get().stats });
          draw();
        });
        for (const id of ['sound'] as const) {
          const row = region(el, id, (e) => {
            const bar = boxOf(row!),
              bx = 6 / 214;
            const t = clamp(
              ((e.clientX - bar.left) / bar.width - bx) / (200 / 214)
            );
            set({ ...get(), [id]: Math.round(t * 20) / 20 });
            draw();
          });
        }
      }
    );
  };
  return {
    show(on: boolean) {
      if (on) draw();
      f.show(on);
    },
  };
}

// The screens round the lobby. Each was drawn on the drawn page (ui.ts DRAWN:
// 956 × 440 with its own safe insets); on any screen the page is scaled by the
// UI's size (ui.ts size: the iPad's 1180 × 820 takes it 1.74×, as the HUD) and
// grows or shrinks to the screen's own shape, and each of its pieces keeps to
// the edge it was drawn against, the screen's safe area there or the gutter
// (ui.ts at): no shape of screen letterboxes it. Each fades in and out (ways.ts
// FADE), never cut to.
//   title   an opaque sheet over the world loading: rhumb lines, the rose whose needle swings while the world loads and
//           settles north when it is ready, her galleon gilt below; it moves on by itself (flow.ts)
//   lobby   over her ship at anchor: the wheel (tap: settings), the PLAY banner with her galleon on it, the seed's
//           chip at the top left, its name (tap: the seed panel, panel.ts), and the dye pot at the bottom left in her
//           dye (tap: her livery, livery.ts). No tabs. Elsewhere a drag reaches the world: it turns the camera round
//           her.
//   settings a small folio: sound and look speed, each a bar set by a tap along it; the stats (the frame's cost in
//           the bottom-left corner: meter.ts), a box ticked by a tap
// Each folio has its close mark at its corner; a tap outside it closes it too.
// Her match's end is ends.ts's. No words anywhere; numerals only (but the seed's name, which is hers to give).

import { clamp } from '../world/scalar.ts';
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
import { rhumbs, rose, seed } from './marks.ts';
import { keep, onTap, region } from './touch.ts';
import { at, boxOf, fade, onResize, page, screen, type Page } from './ui.ts';

/**
 * Sound and look speed, each 0–1; whether the frame's cost shows in its corner
 * (meter.ts).
 */
export interface Settings {
  sound: number;
  look: number;
  stats: boolean;
}

/**
 * A full-screen sheet: an <svg> of the page on this screen. `opaque` lays
 * parchment under it; `press` makes the whole sheet take touches (else only its
 * regions do, and the rest reach the world under it).
 */
export function sheet(opaque: boolean, press = true) {
  const root = screen(press);
  if (opaque) root.style.background = parchment;
  /**
   * The last drawing, made again when the screen changes shape while it shows.
   */
  let last: (() => SVGSVGElement) | null = null;
  /**
   * Draws `body` on the page as it is on this screen, then `bind`s what takes
   * touches in it.
   */
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

/**
 * The banner every way on is drawn on (the lobby's PLAY): a pennant `w` wide
 * centred on (x, y), its swallowtail at the left and its point at the right,
 * with `mark` laid on it. `gilt` washes it gold.
 */
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

/** The needle's swing (its keyframes: ui.ts). */
const SWING = 'needle 1.6s ease-in-out infinite alternate';

/** The title, the one loading screen, made once (main.ts): shown while the world is made, and again over the way home
 *  while the lobby is made under it (passage.ts), over every other screen; its needle swinging until then. It takes no
 *  tap: the flow moves on to the lobby as the world is ready (flow.ts). */
export function createTitle() {
  const s = sheet(true);
  s.root.style.zIndex = '3';
  let needle!: SVGGElement,
    settled = false;
  s.set(
    (p) =>
      at(
        p,
        'centre',
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
    /** Loading again: the needle swings. */
    swing() {
      settled = false;
      needle.style.transition = 'none';
      needle.style.transform = '';
      needle.style.animation = SWING;
    },
    /** The world is ready: the needle settles north, with one small overshoot, as the title fades. */
    ready() {
      settled = true;
      needle.style.animation = 'none';
      needle.style.transition = 'transform 0.9s cubic-bezier(.3,1.6,.5,1)';
      needle.style.transform = 'rotate(0deg)';
    },
  };
}

export type Title = ReturnType<typeof createTitle>;

/** The seed's chip: a slip at the lobby's top left, the seed's mark and its name (the one piece of text the screens
 *  set down, as a seed is any text she gives it), sized to the name. */
function seedChip(x: number, y: number, name: string) {
  const w = 52 + Math.max(2, name.length) * 10.5;
  return (
    `<g id="seed">${slip(x, y, w, 44, { bold: true })}${seed(x + 22, y + 24, 32)}` +
    `${figure(x + 42, y + 22, name, 21, { anchor: 'start' })}</g>`
  );
}

/** The dye pot (her livery's folio: livery.ts), `s` across, about (x, y): an earthen pot brimming with her dye, a
 *  dribble of it down its lip, a brush standing in it. */
const dyePot = (x: number, y: number, s: number, dye: string) =>
  `<g transform="translate(${x} ${y}) scale(${s / 24})" stroke="${INK.iron}" stroke-linejoin="round" stroke-linecap="round">` +
  `<path d="M3 -3L10 -12" stroke="${INK.sepia}" stroke-width="2.2"/>` +
  `<path d="M9 -11L11.5 -14L13 -12.5L10.5 -10Z" fill="${dye}" stroke-width=".8"/>` +
  `<path d="M-9 -3Q-11.5 7 -6 10.5H6Q11.5 7 9 -3Z" fill="url(#h-sepia)" stroke-width="1.3"/>` +
  `<path d="M-9.5 3.5H9.5" stroke-width=".6" fill="none"/>` +
  `<ellipse cx="0" cy="-3.5" rx="10" ry="3" fill="${PAPER}" stroke-width="1.2"/>` +
  `<ellipse cx="0" cy="-3.4" rx="7.6" ry="1.9" fill="${dye}" stroke-width=".7"/>` +
  `<path d="M-6.5 -2.4Q-7.4 1 -6.6 3.2Q-5.6 1 -5.6 -2.2Z" fill="${dye}" stroke-width=".6"/></g>`;

/** The lobby over her ship at anchor: `dye` her livery's dye now, for the pot. */
export function createLobby(
  name: string,
  dye: () => string,
  act: { play(): void; settings(): void; seed(): void; livery(): void }
) {
  // a drag anywhere off its controls turns the camera round her (play/anchorage.ts)
  const s = sheet(false, false);
  /** The dye its pot was last drawn in (null: not yet drawn). */
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
              `<g id="wheel"><circle cx="866" cy="40" r="26" fill="url(#pg)" stroke="${INK.iron}" stroke-width="1.6" filter="url(#sh)"/>${glyph('menu.wheel', 866, 40, 34)}</g>`
            ) +
            at(
              p,
              'left',
              'bottom',
              `<g id="livery"><circle cx="92" cy="392" r="26" fill="url(#pg)" stroke="${INK.iron}" stroke-width="1.6" filter="url(#sh)"/>${dyePot(91, 394, 36, pot)}</g>`
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

/** A folio laid over the lobby, its box drawn at (x, y) on the phone's page and kept to the page's edges as `place`
 *  says (at); its close mark at its top right corner; a tap outside it closes it too. `shade` dims the world round it
 *  (not round her livery's, which shows her ship as she is dyed). */
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
    /** Draws it with `body` inside, then `bind`s what takes touches in it. */
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
              `<g id="close">${paperDisc(x + w - 4, y + 4, 19)}${glyph('menu.close', x + w - 4, y + 4, 20)}</g>`
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

/** Settings, lean: sound and look speed, each a bar, a tap along a bar sets it; and the stats, a box ticked or not
 *  beside an hourglass, a tap on the row turns them on or off. */
export function createSettings(
  get: () => Settings,
  set: (s: Settings) => void,
  close: () => void
) {
  // (its close mark, standing out past its corner, kept clear of the screen's edge)
  const x = 540,
    y = 86,
    w = 332,
    h = 208;
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
    /** Look speed's mark: a cross-staff's sight. */
    const look = (cy: number) =>
      `<g stroke="${INK.iron}" fill="none" stroke-width="1.6"><circle cx="${x + 54}" cy="${cy}" r="11"/>` +
      `<path d="M${x + 54} ${cy - 17}v8M${x + 54} ${cy + 9}v8M${x + 37} ${cy}h8M${x + 63} ${cy}h8"/></g>`;
    /** The stats' mark: an hourglass, the frame's time. */
    const glass = (cy: number) =>
      `<g stroke="${INK.iron}" stroke-width="1.6" stroke-linejoin="round"><path d="M${x + 43} ${cy - 15}h22M${x + 43} ${cy + 15}h22" stroke-linecap="round" fill="none"/>` +
      `<path d="M${x + 46} ${cy - 15}C${x + 46} ${cy - 5} ${x + 52} ${cy - 3} ${x + 52} ${cy}C${x + 52} ${cy + 3} ${x + 46} ${cy + 5} ${x + 46} ${cy + 15}` +
      `H${x + 62}C${x + 62} ${cy + 5} ${x + 56} ${cy + 3} ${x + 56} ${cy}C${x + 56} ${cy - 3} ${x + 62} ${cy - 5} ${x + 62} ${cy - 15}Z" fill="url(#h-iron)"/>` +
      `<path d="M${x + 49} ${cy + 13}L${x + 54} ${cy + 6}L${x + 59} ${cy + 13}Z" fill="${WASH.ochre}" stroke="none"/></g>`;
    /** The stats' box, 28 across, ticked when they show. */
    const box = (cy: number, on: boolean) =>
      `<path d="${roughRect(x + 96, cy - 14, 28, 28, 5)}" fill="${on ? WASH.viridian : PAPER}" fill-opacity="${on ? 0.85 : 1}" stroke="${INK.iron}" stroke-width=".9"/>` +
      (on
        ? `<path d="M${x + 102} ${cy}L${x + 108} ${cy + 7}L${x + 119} ${cy - 7}" fill="none" stroke="${INK.white}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`
        : '');
    const stats = `<g id="stats">${glass(234)}<rect x="${x + 30}" y="${234 - 24}" width="${w - 60}" height="48" fill="transparent"/>${box(234, v.stats)}</g>`;
    f.draw(
      row(
        'sound',
        118,
        glyph('menu.speaker', x + 54, 118, 30),
        v.sound,
        WASH.azure
      ) +
        row('look', 176, look(176), v.look, WASH.ochre) +
        stats,
      (el) => {
        region(el, 'stats', () => {
          set({ ...get(), stats: !get().stats });
          draw();
        });
        for (const id of ['sound', 'look'] as const) {
          const row = region(el, id, (e) => {
            // where along the bar: its hit box runs 6 units before the bar's 200 and 8 past it
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

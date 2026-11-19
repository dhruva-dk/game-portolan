// The screens round the lobby, after the UI sheet as the owner reworked it. Each was drawn on the sheet's page, 956 ×
// 440 units with a phone's safe insets (62 each end, 20 at the bottom); on any screen the page is scaled by the UI's
// size (ui.ts size: the iPad's 1180 × 820 takes it 1.74×, as the HUD) and grows or shrinks to the screen's own shape,
// and each of its pieces keeps to the edge it was drawn against, the screen's safe area there or the gutter (Page,
// at): no shape of screen letterboxes it.
// Each fades in and out (ways.ts FADE), never cut to.
//   title   an opaque sheet over the world loading: rhumb lines, the rose whose needle swings while the world loads and
//           settles north when it is ready, her galleon gilt below; it moves on by itself (flow.ts)
//   lobby   over her ship at anchor: the wheel (tap: settings) and the PLAY banner with her galleon on it. No tabs.
//           Elsewhere a drag reaches the world: it turns the camera round her.
//   settings a small folio: sound and look speed, each a bar set by a tap along it; the stats (the frame's cost in
//           the bottom-left corner: meter.ts), a box ticked by a tap
// Each folio has its close mark at its corner; a tap outside it closes it too. Her match's end is ends.ts's.
// No words anywhere; numerals only.

import { INK, PAPER, WASH, bar, galleon, glyph, paperDisc, roughRect, svg } from './ink';
import { rhumbs, rose } from './marks';
import { GUTTER, INSET, fade, onTap, size, uiLayer } from './ui';

export const W = 956, H = 440;

/** Sound and look speed, each 0–1; whether the frame's cost shows in its corner (meter.ts). */
export interface Settings { sound: number; look: number; stats: boolean }

/** The page on this screen, in the page's units: its size, and the safe area's edges with a margin inside them. */
export interface Page { w: number; h: number; left: number; top: number; right: number; bottom: number }

/** The edges the screens were drawn against: the phone's safe insets (62, 0, 62, 20) and 2 more. */
const DRAWN = { left: 64, top: 16, right: W - 64, bottom: H - 22 } as const;

/** The safe area's insets, as the page has them (--safe-* stand in for them off the device: ui.ts), read off an unseen
 *  element's padding. */
let probe: HTMLElement | null = null;
function insets() {
  if (!probe) {
    probe = document.createElement('div');
    probe.style.cssText = 'position:absolute;visibility:hidden;padding:var(--safe-top, env(safe-area-inset-top)) '
      + 'var(--safe-right, env(safe-area-inset-right)) var(--safe-bottom, env(safe-area-inset-bottom)) var(--safe-left, env(safe-area-inset-left))';
    uiLayer().appendChild(probe);
  }
  const s = getComputedStyle(probe), px = (v: string) => parseFloat(v) || 0;
  return { top: px(s.paddingTop), right: px(s.paddingRight), bottom: px(s.paddingBottom), left: px(s.paddingLeft) };
}

/** The page on a screen `width` × `height` CSS px with the given safe insets: scaled as the drawn page fits it, grown
 *  to its shape. */
export function pageFor(width: number, height: number, safe: { top: number; right: number; bottom: number; left: number }): Page {
  const k = size(width, height), w = width / k, h = height / k;
  const edge = (px: number) => Math.max(px / k + INSET, GUTTER);
  return { w, h, left: edge(safe.left), top: edge(safe.top), right: w - edge(safe.right), bottom: h - edge(safe.bottom) };
}

/** `body`, drawn on the phone's page, kept to the page's edges here: `x` to its left or right, or centred between them,
 *  and `y` to its top or bottom, or centred between them. */
export function at(p: Page, x: 'left' | 'centre' | 'right', y: 'top' | 'middle' | 'bottom', body: string) {
  const dx = x === 'left' ? p.left - DRAWN.left : x === 'right' ? p.right - DRAWN.right : (p.left + p.right - DRAWN.left - DRAWN.right) / 2;
  const dy = y === 'top' ? p.top - DRAWN.top : y === 'bottom' ? p.bottom - DRAWN.bottom : (p.top + p.bottom - DRAWN.top - DRAWN.bottom) / 2;
  return dx === 0 && dy === 0 ? body : `<g transform="translate(${dx.toFixed(1)} ${dy.toFixed(1)})">${body}</g>`;
}

/** A full-screen sheet: an <svg> of the page on this screen. `opaque` lays parchment under it; `press` makes the whole
 *  sheet take touches (else only its regions do, and the rest reach the world under it). */
export function sheet(opaque: boolean, press = true) {
  const root = document.createElement('div');
  root.className = press ? 'screen press' : 'screen';
  root.style.display = 'none';
  if (opaque) root.style.background = 'radial-gradient(ellipse at 50% 45%, #f7eedb 0%, #f0e2c4 60%, #d8bf90 100%)';
  uiLayer().appendChild(root);
  /** The last drawing, made again when the screen changes shape while it shows. */
  let last: (() => SVGSVGElement) | null = null;
  /** Draws `body` on the page as it is on this screen, then `bind`s what takes touches in it. */
  const set = (body: (p: Page) => string, bind?: (el: SVGSVGElement) => void) => {
    last = () => {
      const p = pageFor(innerWidth, innerHeight, insets());
      root.innerHTML = svg(p.w, p.h, body(p));
      const el = root.firstElementChild as SVGSVGElement;
      el.setAttribute('width', '100%');
      el.setAttribute('height', '100%');
      bind?.(el);
      return el;
    };
    return last();
  };
  addEventListener('resize', () => {
    if (last && root.style.display !== 'none') last();
  });
  return { root, set, show: (on: boolean, ms?: number) => fade(root, on, ms) };
}

/** A press-able region of a sheet, by its id: taken by a touch that comes down on it and lifts on it. */
export const region = (el: SVGSVGElement, id: string, act: () => void) => {
  const r = el.querySelector<SVGGElement>(`#${id}`);
  if (!r) return;
  // the class, not a style on the group: a touch lands on the shapes inside it, which the layer's rule would
  // otherwise leave untouchable (ui.ts)
  r.classList.add('press');
  let down = -1;
  r.addEventListener('pointerdown', (e) => {
    down = e.pointerId;
    e.stopPropagation();
  });
  r.addEventListener('pointerup', (e) => {
    e.stopPropagation();
    if (e.pointerId === down) act();
    down = -1;
  });
};

/** The banner every way on is drawn on (the lobby's PLAY): a pennant `w` wide centred on (x, y), its swallowtail at
 *  the left and its point at the right, with `mark` laid on it. `gilt` washes it gold. */
export function banner(x: number, y: number, w: number, mark: string, gilt = false) {
  const k = w / 210, l = x - w / 2, r = x + w / 2, t = y - 40 * k, b = y + 42 * k;
  const d = `M${l} ${t + 4 * k}Q${x} ${t - 8 * k} ${r} ${t}L${r - 26 * k} ${y}L${r} ${b}Q${x} ${b - 6 * k} ${l} ${b + 2 * k}L${l + 26 * k} ${y}Z`;
  return `<path d="${d}" fill="${gilt ? '#efd79a' : 'url(#pg)'}" stroke="${INK.iron}" stroke-width="1.6" filter="url(#sh)"/>`
    + `<path d="${d}" fill="none" stroke="${INK.iron}" stroke-width=".5" opacity=".5" transform="translate(${x} ${y}) scale(.93) translate(${-x} ${-y})"/>`
    + mark;
}

/** The title, shown while the world is made: its needle swinging until then. It takes no tap: the flow moves on to the
 *  lobby as the world is ready (flow.ts). */
export function createTitle() {
  const s = sheet(true);
  let needle!: SVGGElement, settled = false;
  s.set((p) => at(p, 'centre', 'middle', rhumbs(478, 182, 1100, 0.3) + rose(478, 182, 126, 0) + galleon(478, 352, 74, { hull: 'url(#h-gold)' })), (el) => {
    needle = el.querySelector<SVGGElement>('.needle')!;
    needle.style.animation = settled ? 'none' : 'needle 1.6s ease-in-out infinite alternate';
  });
  const style = document.createElement('style');
  style.textContent = '@keyframes needle { from { transform: rotate(-38deg) } to { transform: rotate(52deg) } }';
  document.head.appendChild(style);
  return {
    show: s.show,
    /** The world is ready: the needle settles north, with one small overshoot, as the title fades. */
    ready() {
      settled = true;
      needle.style.animation = 'none';
      needle.style.transition = 'transform 0.9s cubic-bezier(.3,1.6,.5,1)';
      needle.style.transform = 'rotate(0deg)';
    },
  };
}

export function createLobby(act: { play(): void; settings(): void }) {
  // a drag anywhere off its controls turns the camera round her (play/anchorage.ts)
  const s = sheet(false, false);
  let drawn = false;
  return {
    show(on: boolean) {
      if (on && !drawn) {
        drawn = true;
        s.set((p) => at(p, 'right', 'top', `<g id="wheel"><circle cx="866" cy="40" r="26" fill="url(#pg)" stroke="${INK.iron}" stroke-width="1.6" filter="url(#sh)"/>${glyph('menu.wheel', 866, 40, 34)}</g>`)
          + at(p, 'right', 'bottom', `<g id="play">${banner(777, 318, 210, galleon(777, 314, 78, { waves: true }))}</g>`), (el) => {
          region(el, 'wheel', act.settings);
          region(el, 'play', act.play);
        });
      }
      s.show(on);
    },
  };
}

/** A folio laid over the lobby, drawn at (x, y) on the phone's page and kept to the page's edges as `place` says (at);
 *  its close mark at its top right corner; a tap outside it closes it too. */
function folio(x: number, y: number, w: number, h: number, place: [Parameters<typeof at>[1], Parameters<typeof at>[2]], close: () => void) {
  const s = sheet(false);
  s.root.style.zIndex = '1';
  s.root.style.background = 'rgba(26,16,8,.25)';
  onTap(s.root, close);
  return {
    ...s,
    /** Draws it with `body` inside, then `bind`s what takes touches in it. */
    draw(body: string, bind?: (el: SVGSVGElement) => void) {
      return s.set((p) => at(p, ...place, `<g id="folio">`
        + `<path d="${roughRect(x, y, w, h, 9)}" fill="url(#pg)" stroke="${INK.iron}" stroke-width="1" filter="url(#sh)"/>`
        + `<rect x="${x + 10}" y="${y + 10}" width="${w - 20}" height="${h - 20}" fill="none" stroke="${INK.iron}" stroke-width="1.2"/>`
        + `<rect x="${x + 14}" y="${y + 14}" width="${w - 28}" height="${h - 28}" fill="none" stroke="${INK.iron}" stroke-width=".5"/>${body}</g>`
        + `<g id="close">${paperDisc(x + w - 4, y + 4, 19)}${glyph('menu.close', x + w - 4, y + 4, 20)}</g>`), (el) => {
        const inner = el.querySelector<SVGGElement>('#folio')!;
        inner.style.pointerEvents = 'auto';
        inner.addEventListener('pointerdown', (e) => e.stopPropagation());
        region(el, 'close', close);
        bind?.(el);
      });
    },
  };
}

/** Settings, lean: sound and look speed, each a bar, a tap along a bar sets it; and the stats, a box ticked or not
 *  beside an hourglass, a tap on the row turns them on or off. */
export function createSettings(get: () => Settings, set: (s: Settings) => void, close: () => void) {
  // (its close mark, standing out past its corner, kept clear of the screen's edge)
  const x = 540, y = 86, w = 332, h = 208;
  const f = folio(x, y, w, h, ['right', 'top'], close);
  const draw = () => {
    const v = get();
    const row = (id: string, cy: number, icon: string, value: number, wash: string) =>
      `<g id="${id}">${icon}<rect x="${x + 90}" y="${cy - 22}" width="214" height="44" fill="transparent"/>${bar(x + 96, cy, 200, 22, value, wash)}</g>`;
    /** Look speed's mark: a cross-staff's sight. */
    const look = (cy: number) => `<g stroke="${INK.iron}" fill="none" stroke-width="1.6"><circle cx="${x + 54}" cy="${cy}" r="11"/>`
      + `<path d="M${x + 54} ${cy - 17}v8M${x + 54} ${cy + 9}v8M${x + 37} ${cy}h8M${x + 63} ${cy}h8"/></g>`;
    /** The stats' mark: an hourglass, the frame's time. */
    const glass = (cy: number) => `<g stroke="${INK.iron}" stroke-width="1.6" stroke-linejoin="round"><path d="M${x + 43} ${cy - 15}h22M${x + 43} ${cy + 15}h22" stroke-linecap="round" fill="none"/>`
      + `<path d="M${x + 46} ${cy - 15}C${x + 46} ${cy - 5} ${x + 52} ${cy - 3} ${x + 52} ${cy}C${x + 52} ${cy + 3} ${x + 46} ${cy + 5} ${x + 46} ${cy + 15}`
      + `H${x + 62}C${x + 62} ${cy + 5} ${x + 56} ${cy + 3} ${x + 56} ${cy}C${x + 56} ${cy - 3} ${x + 62} ${cy - 5} ${x + 62} ${cy - 15}Z" fill="url(#h-iron)"/>`
      + `<path d="M${x + 49} ${cy + 13}L${x + 54} ${cy + 6}L${x + 59} ${cy + 13}Z" fill="${WASH.ochre}" stroke="none"/></g>`;
    /** The stats' box, 28 across, ticked when they show. */
    const box = (cy: number, on: boolean) => `<path d="${roughRect(x + 96, cy - 14, 28, 28, 5)}" fill="${on ? WASH.viridian : PAPER}" fill-opacity="${on ? 0.85 : 1}" stroke="${INK.iron}" stroke-width=".9"/>`
      + (on ? `<path d="M${x + 102} ${cy}L${x + 108} ${cy + 7}L${x + 119} ${cy - 7}" fill="none" stroke="${INK.white}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>` : '');
    const stats = `<g id="stats">${glass(234)}<rect x="${x + 30}" y="${234 - 24}" width="${w - 60}" height="48" fill="transparent"/>${box(234, v.stats)}</g>`;
    f.draw(row('sound', 118, glyph('menu.speaker', x + 54, 118, 30), v.sound, WASH.azure) + row('look', 176, look(176), v.look, WASH.ochre) + stats, (el) => {
      const toggle = el.querySelector<SVGGElement>('#stats')!;
      toggle.style.pointerEvents = 'auto';
      toggle.addEventListener('pointerup', () => {
        set({ ...get(), stats: !get().stats });
        draw();
      });
      for (const id of ['sound', 'look'] as const) {
        const g = el.querySelector<SVGGElement>(`#${id}`)!;
        g.style.pointerEvents = 'auto';
        g.addEventListener('pointerup', (e) => {
          const box = g.getBoundingClientRect(), bx = (x + 96 - (x + 90)) / 214;
          const t = Math.min(Math.max(((e.clientX - box.left) / box.width - bx) / (200 / 214), 0), 1);
          set({ ...get(), [id]: Math.round(t * 20) / 20 });
          draw();
        });
      }
    });
  };
  return {
    show(on: boolean) {
      if (on) draw();
      f.show(on);
    },
  };
}

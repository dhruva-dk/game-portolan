// The screens round the lobby, after the UI sheet as the owner reworked it. Each is laid out in the phone's own page,
// 956 × 440 CSS px with the sheet's safe insets (62 each end, 20 at the bottom), and scaled to fit any other screen;
// each fades in and out (ways.ts FADE), never cut to.
//   title   an opaque sheet over the world loading: rhumb lines, the rose whose needle swings while the world loads and
//           settles north when it is ready, her galleon gilt below; once ready, a gilt ring breathes round the rose
//           (what to tap) and a tap anywhere goes on
//   lobby   over her ship at anchor: the career plate (tap: the rank folio), the wheel (tap: settings), the PLAY
//           banner with her galleon on it. No tabs. Elsewhere a drag reaches the world: it turns the camera round her.
//   rank    a folio: her rank's seal and her level's ring, drawn large, and the ladder of ranks
//   settings a small folio: sound and look speed, each a bar set by a tap along it
// Each folio has its close mark at its corner; a tap outside it closes it too. Her match's end is ends.ts's.
// No words anywhere; numerals only.

import type { Career } from '../player';
import { INK, WASH, bar, galleon, glyph, paperDisc, roughRect, svg } from './ink';
import { TIERS, levelRing, plate, rhumbs, rose, seal } from './marks';
import { fade, onTap, uiLayer } from './ui';

export const W = 956, H = 440;

export interface Settings { sound: number; look: number }

/** A full-screen sheet: an <svg> of the phone's page scaled to the screen. `opaque` lays parchment under it; `press`
 *  makes the whole sheet take touches (else only its regions do, and the rest reach the world under it). */
export function sheet(opaque: boolean, press = true) {
  const root = document.createElement('div');
  root.className = press ? 'screen press' : 'screen';
  root.style.display = 'none';
  if (opaque) root.style.background = 'radial-gradient(ellipse at 50% 45%, #f7eedb 0%, #f0e2c4 60%, #d8bf90 100%)';
  uiLayer().appendChild(root);
  const set = (body: string) => {
    root.innerHTML = svg(W, H, body);
    const el = root.firstElementChild as SVGSVGElement;
    el.setAttribute('width', '100%');
    el.setAttribute('height', '100%');
    el.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    return el;
  };
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

export function createTitle(go: () => void) {
  const s = sheet(true);
  // the cue, once ready: a gilt ring breathing out from the rose, over and over
  const cue = `<g id="cue" opacity="0"><circle cx="478" cy="182" r="132" fill="none" stroke="${WASH.gold}" stroke-width="3">`
    + '<animate attributeName="r" values="132;150" dur="1.8s" repeatCount="indefinite"/>'
    + '<animate attributeName="stroke-opacity" values=".9;0" dur="1.8s" repeatCount="indefinite"/></circle>'
    + `<circle cx="478" cy="182" r="131" fill="none" stroke="${WASH.gold}" stroke-width="2.4" opacity=".85"/></g>`;
  s.set(rhumbs(478, 182, 1100, 0.3) + cue + rose(478, 182, 126, 0) + galleon(478, 352, 74, { hull: 'url(#h-gold)' }));
  const needle = s.root.querySelector<SVGGElement>('.needle')!, ring = s.root.querySelector<SVGGElement>('#cue')!;
  needle.style.animation = 'needle 1.6s ease-in-out infinite alternate';
  ring.style.transition = 'opacity 0.6s ease 0.6s';
  const style = document.createElement('style');
  style.textContent = '@keyframes needle { from { transform: rotate(-38deg) } to { transform: rotate(52deg) } }';
  document.head.appendChild(style);
  let ready = false;
  onTap(s.root, () => ready && go());
  return {
    show: s.show,
    /** The world is ready: the needle settles north, with one small overshoot, and the cue begins. */
    ready() {
      ready = true;
      needle.style.animation = 'none';
      needle.style.transition = 'transform 0.9s cubic-bezier(.3,1.6,.5,1)';
      needle.style.transform = 'rotate(0deg)';
      ring.style.opacity = '1';
    },
  };
}

export function createLobby(act: { play(): void; rank(): void; settings(): void }) {
  // a drag anywhere off its controls turns the camera round her (play/anchorage.ts)
  const s = sheet(false, false);
  return {
    show(on: boolean, career?: Career) {
      if (on && career) {
        const el = s.set(
          `<g id="plate">${plate(64, 12, 132, career.level, career.progress, career.tier)}</g>`
          + `<g id="wheel"><circle cx="866" cy="40" r="26" fill="url(#pg)" stroke="${INK.iron}" stroke-width="1.6" filter="url(#sh)"/>${glyph('menu.wheel', 866, 40, 34)}</g>`
          + `<g id="play">${banner(777, 318, 210, galleon(777, 314, 78, { waves: true }))}</g>`);
        region(el, 'plate', act.rank);
        region(el, 'wheel', act.settings);
        region(el, 'play', act.play);
      }
      s.show(on);
    },
  };
}

/** A folio laid over the lobby, its close mark at its top right corner; a tap outside it closes it too. */
function folio(x: number, y: number, w: number, h: number, close: () => void) {
  const s = sheet(false);
  s.root.style.zIndex = '1';
  onTap(s.root, close);
  return {
    ...s,
    /** Draws it with `body` inside. */
    draw(body: string) {
      const el = s.set(`<rect width="${W}" height="${H}" fill="rgba(26,16,8,.25)"/><g id="folio">`
        + `<path d="${roughRect(x, y, w, h, 9)}" fill="url(#pg)" stroke="${INK.iron}" stroke-width="1" filter="url(#sh)"/>`
        + `<rect x="${x + 10}" y="${y + 10}" width="${w - 20}" height="${h - 20}" fill="none" stroke="${INK.iron}" stroke-width="1.2"/>`
        + `<rect x="${x + 14}" y="${y + 14}" width="${w - 28}" height="${h - 28}" fill="none" stroke="${INK.iron}" stroke-width=".5"/>${body}</g>`
        + `<g id="close">${paperDisc(x + w - 4, y + 4, 19)}${glyph('menu.close', x + w - 4, y + 4, 20)}</g>`);
      const inner = el.querySelector<SVGGElement>('#folio')!;
      inner.style.pointerEvents = 'auto';
      inner.addEventListener('pointerdown', (e) => e.stopPropagation());
      region(el, 'close', close);
      return el;
    },
  };
}

/** The rank folio: her rank's seal and her level, large, and the ladder of ranks with hers marked. */
export function createRank(close: () => void) {
  const x = 230, y = 50, w = 496, h = 330;
  const f = folio(x, y, w, h, close);
  return {
    show(on: boolean, career?: Career) {
      if (on && career) {
        let body = seal(380, 180, 74, career.tier) + levelRing(580, 180, 74, career.level, career.progress);
        TIERS.forEach((_, t) => {
          const cx = x + 64 + t * 52.5, here = t === career.tier;
          body += seal(cx, 316, here ? 20 : 14, t) + (here ? `<path d="M${cx - 6} 286L${cx} 294L${cx + 6} 286Z" fill="${WASH.gold}" stroke="${INK.iron}" stroke-width=".8"/>` : '');
        });
        f.draw(body + `<line x1="${x + 40}" y1="316" x2="${x + w - 40}" y2="316" stroke="${INK.iron}" stroke-width=".8" opacity=".5"/>`);
      }
      f.show(on);
    },
  };
}

/** Settings, lean: sound and look speed, each a bar; a tap along a bar sets it. */
export function createSettings(get: () => Settings, set: (s: Settings) => void, close: () => void) {
  const x = 560, y = 74, w = 332, h = 168;
  const f = folio(x, y, w, h, close);
  const draw = () => {
    const v = get();
    const row = (id: string, cy: number, icon: string, value: number, wash: string) =>
      `<g id="${id}">${icon}<rect x="${x + 90}" y="${cy - 22}" width="214" height="44" fill="transparent"/>${bar(x + 96, cy, 200, 22, value, wash)}</g>`;
    /** Look speed's mark: a cross-staff's sight. */
    const look = (cy: number) => `<g stroke="${INK.iron}" fill="none" stroke-width="1.6"><circle cx="${x + 54}" cy="${cy}" r="11"/>`
      + `<path d="M${x + 54} ${cy - 17}v8M${x + 54} ${cy + 9}v8M${x + 37} ${cy}h8M${x + 63} ${cy}h8"/></g>`;
    const el = f.draw(row('sound', 124, glyph('menu.speaker', x + 54, 124, 30), v.sound, WASH.azure) + row('look', 192, look(192), v.look, WASH.ochre));
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
  };
  return {
    show(on: boolean) {
      if (on) draw();
      f.show(on);
    },
  };
}

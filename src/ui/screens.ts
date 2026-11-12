// The screens round a match, after the UI sheet as the owner reworked it. Each is laid out in the phone's own page,
// 956 × 440 CSS px with the sheet's safe insets (62 each end, 20 at the bottom), and scaled to fit any other screen.
//   title   an opaque sheet: rhumb lines, the rose whose needle swings while the world loads and settles north when it
//           is ready, her galleon gilt below; a tap, once ready, goes on
//   lobby   over her ship at anchor: the career plate (tap: the rank folio), the wheel (tap: settings), the PLAY
//           banner with her galleon on it. No tabs.
//   rank    a folio: her rank's seal and her level's ring, drawn large, and the ladder of ranks
//   settings a small folio: sound and look speed, each a bar set by a tap along it
// (The drop's own screen is gale.ts.)
//   result  an opaque sheet: her place in a laurel, her ship, how long she lasted, her plate
// No words anywhere; numerals only.

import { CUT, INK, PAPER, WASH, bar, figure, galleon, glyph, roughRect, svg } from './ink';
import { TIERS, laurel, levelRing, plate, rhumbs, rose, seal } from './marks';
import { onTap, uiLayer } from './ui';

const W = 956, H = 440;

/** What the lobby and the result show of her career. */
export interface Career { level: number; progress: number; tier: number }
export interface Settings { sound: number; look: number }

/** A full-screen sheet: an <svg> of the phone's page scaled to the screen. `opaque` lays parchment under it. */
function sheet(opaque: boolean) {
  const root = document.createElement('div');
  root.className = 'screen press';
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
  return {
    root, set,
    show: (on: boolean) => {
      root.style.display = on ? 'block' : 'none';
    },
  };
}

/** A press-able region of a sheet, by its id. */
const region = (el: SVGSVGElement, id: string, act: () => void) => {
  const r = el.querySelector<SVGGElement>(`#${id}`);
  if (!r) return;
  r.style.pointerEvents = 'auto';
  r.style.cursor = 'pointer';
  r.addEventListener('pointerdown', (e) => e.stopPropagation());
  r.addEventListener('pointerup', (e) => {
    e.stopPropagation();
    act();
  });
};

export function createTitle(go: () => void) {
  const s = sheet(true);
  s.set(rhumbs(478, 182, 1100, 0.3) + rose(478, 182, 126, 0) + galleon(478, 352, 74, { hull: 'url(#h-gold)' }));
  const needle = s.root.querySelector<SVGGElement>('.needle')!;
  needle.style.animation = 'needle 1.6s ease-in-out infinite alternate';
  const style = document.createElement('style');
  style.textContent = '@keyframes needle { from { transform: rotate(-38deg) } to { transform: rotate(52deg) } }';
  document.head.appendChild(style);
  let ready = false;
  onTap(s.root, () => ready && go());
  return {
    show: s.show,
    /** The world is ready: the needle settles north, with one small overshoot. */
    ready() {
      ready = true;
      needle.style.animation = 'none';
      needle.style.transition = 'transform 0.9s cubic-bezier(.3,1.6,.5,1)';
      needle.style.transform = 'rotate(0deg)';
    },
  };
}

export function createLobby(act: { play(): void; rank(): void; settings(): void }) {
  const s = sheet(false);
  return {
    show(on: boolean, career?: Career) {
      if (on && career) {
        const banner = 'M672 282Q777 270 882 278L856 318L882 362Q777 356 672 364L698 318Z';
        const el = s.set(
          `<g id="plate">${plate(64, 12, 132, career.level, career.progress, career.tier)}</g>`
          + `<g id="wheel"><circle cx="866" cy="40" r="26" fill="url(#pg)" stroke="${INK.iron}" stroke-width="1.6" filter="url(#sh)"/>${glyph('menu.wheel', 866, 40, 34)}</g>`
          + `<g id="play"><path d="${banner}" fill="url(#pg)" stroke="${INK.iron}" stroke-width="1.6" filter="url(#sh)"/>`
          + `<path d="${banner}" fill="none" stroke="${INK.iron}" stroke-width=".5" opacity=".5" transform="translate(777 318) scale(.93) translate(-777 -318)"/>`
          + `${galleon(777, 314, 78, { waves: true })}</g>`);
        region(el, 'plate', act.rank);
        region(el, 'wheel', act.settings);
        region(el, 'play', act.play);
      }
      s.show(on);
    },
  };
}

/** A folio laid over the lobby: closed by a tap outside it. */
function folio(x: number, y: number, w: number, h: number, body: string, close: () => void) {
  const s = sheet(false);
  s.root.style.zIndex = '1';
  const el = s.set(`<rect width="${W}" height="${H}" fill="rgba(26,16,8,.25)"/><g id="folio">`
    + `<path d="${roughRect(x, y, w, h, 9)}" fill="url(#pg)" stroke="${INK.iron}" stroke-width="1" filter="url(#sh)"/>`
    + `<rect x="${x + 10}" y="${y + 10}" width="${w - 20}" height="${h - 20}" fill="none" stroke="${INK.iron}" stroke-width="1.2"/>`
    + `<rect x="${x + 14}" y="${y + 14}" width="${w - 28}" height="${h - 28}" fill="none" stroke="${INK.iron}" stroke-width=".5"/>${body}</g>`);
  const inner = el.querySelector<SVGGElement>('#folio')!;
  inner.style.pointerEvents = 'auto';
  inner.addEventListener('pointerdown', (e) => e.stopPropagation());
  onTap(s.root, close);
  return { ...s, el };
}

/** The rank folio: her rank's seal and her level, large, and the ladder of ranks with hers marked. */
export function createRank(career: Career, close: () => void) {
  const x = 230, y = 50, w = 496, h = 330;
  let body = seal(380, 180, 74, career.tier) + levelRing(580, 180, 74, career.level, career.progress);
  TIERS.forEach((_, t) => {
    const cx = x + 64 + t * 52.5, on = t === career.tier;
    body += seal(cx, 316, on ? 20 : 14, t) + (on ? `<path d="M${cx - 6} 286L${cx} 294L${cx + 6} 286Z" fill="${WASH.gold}" stroke="${INK.iron}" stroke-width=".8"/>` : '');
  });
  body += `<line x1="${x + 40}" y1="316" x2="${x + w - 40}" y2="316" stroke="${INK.iron}" stroke-width=".8" opacity=".5"/>`;
  const f = folio(x, y, w, h, body, () => close());
  return f;
}

/** Settings, lean: sound and look speed, each a bar; a tap along a bar sets it. */
export function createSettings(get: () => Settings, set: (s: Settings) => void, close: () => void) {
  const x = 560, y = 74, w = 332, h = 168;
  let f: ReturnType<typeof folio> | null = null;
  const draw = () => {
    const v = get();
    const row = (id: string, cy: number, icon: string, value: number, wash: string) =>
      `<g id="${id}">${icon}<rect x="${x + 90}" y="${cy - 22}" width="214" height="44" fill="transparent"/>${bar(x + 96, cy, 200, 22, value, wash)}</g>`;
    /** Look speed's mark: a cross-staff's sight. */
    const look = (cy: number) => `<g stroke="${INK.iron}" fill="none" stroke-width="1.6"><circle cx="${x + 54}" cy="${cy}" r="11"/>`
      + `<path d="M${x + 54} ${cy - 17}v8M${x + 54} ${cy + 9}v8M${x + 37} ${cy}h8M${x + 63} ${cy}h8"/></g>`;
    f?.root.remove();
    f = folio(x, y, w, h, row('sound', 124, glyph('menu.speaker', x + 54, 124, 30), v.sound, WASH.azure) + row('look', 192, look(192), v.look, WASH.ochre), close);
    f.show(true);
    for (const id of ['sound', 'look'] as const) {
      const g = f.el.querySelector<SVGGElement>(`#${id}`)!;
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
      else {
        f?.root.remove();
        f = null;
      }
    },
  };
}

/** The result: an opaque sheet with her place, her ship, how long she lasted and her plate; a tap goes on. */
export function createResult(go: () => void) {
  const s = sheet(true);
  onTap(s.root, go);
  return {
    show(on: boolean, r?: { place: number; afloat: string; career: Career }) {
      if (on && r) {
        const [wreath, numeral] = r.place === 1 ? [WASH.gold, WASH.gold] : r.place <= 5 ? ['#b4b8c2', '#7f848b'] : r.place <= 10 ? [WASH.vermilion, INK.rubric] : ['#6b5a4a', INK.iron];
        s.set(`<circle cx="271" cy="150" r="78" fill="${PAPER}" stroke="${INK.iron}" stroke-width="1.6"/><circle cx="271" cy="150" r="72" fill="none" stroke="${INK.iron}" stroke-width=".6"/>`
          + galleon(271, 150, 120, { sail: CUT, hull: r.place === 1 ? WASH.gold : 'url(#h-iron)', waves: true })
          + laurel(560, 150, 82, wreath) + figure(560, 150, r.place, 108, { fill: numeral })
          + glyph('hud.shipsLeft', 690, 150, 34) + figure(716, 150, r.afloat, 32, { anchor: 'start' })
          + `<g transform="translate(406 300)">${plate(0, 0, 144, r.career.level, r.career.progress, r.career.tier)}</g>`);
      }
      s.show(on);
    },
  };
}

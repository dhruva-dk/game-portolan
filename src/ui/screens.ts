// The screens round a match, after the UI sheet as the owner reworked it. Each is laid out in the phone's own page,
// 956 × 440 CSS px with the sheet's safe insets (62 each end, 20 at the bottom), and scaled to fit any other screen.
//   title   an opaque sheet: rhumb lines, the rose whose needle swings while the world loads and settles north when it
//           is ready, her galleon gilt below; a tap, once ready, goes on
//   lobby   over her ship at anchor: the career plate (tap: the rank folio), the wheel (tap: settings), the PLAY
//           banner with her galleon on it. No tabs. Elsewhere a drag reaches the world: it turns the camera round her.
//   rank    a folio: her rank's seal and her level's ring, drawn large, and the ladder of ranks
//   settings a small folio: sound and look speed, each a bar set by a tap along it
//   sunk    over the match she watches once she has sunk: her galleon going down and her place in its laurel
//   result  an opaque sheet: her place in a laurel, her ship, how long she lasted, the sea she held, her plate
// No words anywhere; numerals only.

import type { Career } from '../player';
import { CUT, INK, PAPER, WASH, bar, figure, galleon, glyph, roughCircle, roughRect, slip, svg } from './ink';
import { TIERS, laurel, levelRing, plate, rhumbs, rose, seal } from './marks';
import { onTap, uiLayer } from './ui';

const W = 956, H = 440;

export interface Settings { sound: number; look: number }

/** A full-screen sheet: an <svg> of the phone's page scaled to the screen. `opaque` lays parchment under it; `press`
 *  makes the whole sheet take touches (else only its regions do, and the rest reach the world under it). */
function sheet(opaque: boolean, press = true) {
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
  // the class, not a style on the group: a touch lands on the shapes inside it, which the layer's rule would
  // otherwise leave untouchable (ui.ts)
  r.classList.add('press');
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
  // a drag anywhere off its controls turns the camera round her (play/anchorage.ts)
  const s = sheet(false, false);
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

/** A place's laurel and numeral: gold for the first, silver for the top five, red for the top ten, ink below. */
const placed = (place: number) =>
  place === 1 ? [WASH.gold, WASH.gold] : place <= 5 ? ['#b4b8c2', '#7f848b'] : place <= 10 ? [WASH.vermilion, INK.rubric] : ['#6b5a4a', INK.iron];

/** She has sunk: over the match she now watches, a slip at the foot of the screen with her galleon going down in a
 *  paper disc and her place in its laurel. It takes no touch: a tap goes on as spectating's does (flow.ts). */
export function createSunk() {
  const s = sheet(false, false);
  const x = 478, y = 352, cx = x - 72, r = 44;
  return {
    show(on: boolean, place?: number) {
      if (on && place !== undefined) {
        const [wreath, numeral] = placed(place);
        const swell = `M${cx - r} ${y + 14}q11 -7 22 0t22 0t22 0t22 0V${y + r}H${cx - r}Z`;
        s.set(slip(x - 150, y - 58, 300, 116, { bold: true })
          + `<clipPath id="sunk-c"><circle cx="${cx}" cy="${y}" r="${r}"/></clipPath>`
          + `<circle cx="${cx}" cy="${y}" r="${r}" fill="${PAPER}" stroke="${INK.iron}" stroke-width="1.6"/>`
          + `<g clip-path="url(#sunk-c)"><g transform="rotate(-26 ${cx} ${y + 8})">${galleon(cx, y + 8, 74, { sail: CUT })}</g>`
          + `<path d="${swell}" fill="${WASH.sea}" stroke="${INK.iron}" stroke-width="1.2"/>`
          + `<path d="M${cx - 30} ${y + 26}q7 -5 14 0t14 0M${cx + 2} ${y + 34}q7 -5 14 0t14 0" fill="none" stroke="${INK.blue}" stroke-width="1"/></g>`
          + `<circle cx="${cx}" cy="${y}" r="${r - 5}" fill="none" stroke="${INK.iron}" stroke-width=".6"/>`
          + laurel(x + 68, y, 46, wreath) + figure(x + 68, y, place, 62, { fill: numeral }));
      }
      s.show(on);
    },
  };
}

/** The sea held's mark: a disc of the chart's sea with a patch of her water washed on it in her scarlet, its border
 *  inked (the territory's own look on the sea), `r` across its half. */
const held = (x: number, y: number, r: number) => `<clipPath id="held-c"><circle cx="${x}" cy="${y}" r="${r}"/></clipPath>`
  + `<circle cx="${x}" cy="${y}" r="${r}" fill="#c3d8cf"/>`
  + `<path d="${roughCircle(x + r * 0.22, y + r * 0.12, r * 0.62, 7, r * 0.18)}" fill="rgba(196,40,46,.42)" stroke="rgb(176,28,36)" stroke-width="1.8" clip-path="url(#held-c)"/>`
  + `<circle cx="${x}" cy="${y}" r="${r}" fill="none" stroke="${INK.iron}" stroke-width="1.4"/>`;

/** A share of the planet as per cent: to a tenth under ten. */
const percent = (share: number) => {
  const p = Math.max(0, share) * 100;
  return `${p > 0 && p < 10 ? p.toFixed(1) : Math.round(p)}%`;
};

/** The result: an opaque sheet with her place, her ship, how long she lasted, the sea she held (her share of the
 *  planet's water) and her plate; a tap goes on. */
export function createResult(go: () => void) {
  const s = sheet(true);
  onTap(s.root, go);
  return {
    show(on: boolean, r?: { place: number; share: number; afloat: string; career: Career }) {
      if (on && r) {
        const [wreath, numeral] = placed(r.place);
        s.set(`<circle cx="271" cy="150" r="78" fill="${PAPER}" stroke="${INK.iron}" stroke-width="1.6"/><circle cx="271" cy="150" r="72" fill="none" stroke="${INK.iron}" stroke-width=".6"/>`
          + galleon(271, 150, 120, { sail: CUT, hull: r.place === 1 ? WASH.gold : 'url(#h-iron)', waves: true })
          + laurel(560, 150, 82, wreath) + figure(560, 150, r.place, 108, { fill: numeral })
          + glyph('hud.shipsLeft', 690, 118, 34) + figure(716, 118, r.afloat, 32, { anchor: 'start' })
          + held(690, 182, 15) + figure(716, 182, percent(r.share), 32, { anchor: 'start' })
          + `<g transform="translate(406 300)">${plate(0, 0, 144, r.career.level, r.career.progress, r.career.tier)}</g>`);
      }
      s.show(on);
    },
  };
}

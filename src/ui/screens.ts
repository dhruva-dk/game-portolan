// The screens round the lobby, after the UI sheet as the owner reworked it. Each is laid out in the iPad's page,
// 1180 × 820 CSS px (the iPad Air's in landscape), clear of its home bar at the foot (20 px), and scaled to fit any
// other screen; each fades in and out (ways.ts FADE), never cut to.
//   title   an opaque sheet over the world loading: rhumb lines, the rose whose needle swings while the world loads and
//           settles north when it is ready, her galleon gilt below; once ready, a gilt ring breathes round the rose
//           (what to tap) and a tap anywhere goes on
//   lobby   over her ship at anchor: the wheel (tap: settings) at the top right, the PLAY banner with her galleon on it
//           at the bottom right. No tabs. Elsewhere a drag reaches the world: it turns the camera round her.
//   settings a small folio under the wheel: sound and look speed, each a bar set by a tap along it
// The folio has its close mark at its corner; a tap outside it closes it too. Her match's end is ends.ts's.
// No words anywhere; numerals only.

import { INK, WASH, bar, galleon, glyph, paperDisc, roughRect, svg } from './ink';
import { rhumbs, rose } from './marks';
import { fade, onTap, uiLayer } from './ui';

/** The layout page, CSS px: every sheet is drawn in it and scaled to fit the screen. */
export const W = 1180, H = 820;

export interface Settings { sound: number; look: number }

/** A full-screen sheet: an <svg> of the page scaled to the screen. `opaque` lays parchment under it; `press`
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

/** The title's rose: its centre and radius in the page, and her galleon's centre and size under it. */
const TITLE = { x: W / 2, y: 330, r: 190, ship: 590, size: 112 } as const;

export function createTitle(go: () => void) {
  const s = sheet(true);
  const { x, y, r } = TITLE;
  // the cue, once ready: a gilt ring breathing out from the rose, over and over
  const cue = `<g id="cue" opacity="0"><circle cx="${x}" cy="${y}" r="${r + 8}" fill="none" stroke="${WASH.gold}" stroke-width="3">`
    + `<animate attributeName="r" values="${r + 8};${r + 34}" dur="1.8s" repeatCount="indefinite"/>`
    + '<animate attributeName="stroke-opacity" values=".9;0" dur="1.8s" repeatCount="indefinite"/></circle>'
    + `<circle cx="${x}" cy="${y}" r="${r + 7}" fill="none" stroke="${WASH.gold}" stroke-width="2.4" opacity=".85"/></g>`;
  s.set(rhumbs(x, y, 1100, 0.3) + cue + rose(x, y, r, 0) + galleon(x, TITLE.ship, TITLE.size, { hull: 'url(#h-gold)' }));
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

/** The lobby's wheel (its centre, top right) and its PLAY banner (centre and width, bottom right), in the page. */
const LOBBY = { wheel: { x: W - 64, y: 52 }, play: { x: W - 200, y: H - 130, w: 210 } } as const;

export function createLobby(act: { play(): void; settings(): void }) {
  // a drag anywhere off its controls turns the camera round her (play/anchorage.ts)
  const s = sheet(false, false);
  const { wheel, play } = LOBBY;
  return {
    show(on: boolean) {
      if (on) {
        const el = s.set(
          `<g id="wheel"><circle cx="${wheel.x}" cy="${wheel.y}" r="26" fill="url(#pg)" stroke="${INK.iron}" stroke-width="1.6" filter="url(#sh)"/>${glyph('menu.wheel', wheel.x, wheel.y, 34)}</g>`
          + `<g id="play">${banner(play.x, play.y, play.w, galleon(play.x, play.y - 4, 78, { waves: true }))}</g>`);
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

/** Settings, lean: sound and look speed, each a bar; a tap along a bar sets it. Under the lobby's wheel. */
export function createSettings(get: () => Settings, set: (s: Settings) => void, close: () => void) {
  const w = 332, h = 168, x = W - 64 - w, y = 96;
  const f = folio(x, y, w, h, close);
  const draw = () => {
    const v = get();
    const row = (id: string, cy: number, icon: string, value: number, wash: string) =>
      `<g id="${id}">${icon}<rect x="${x + 90}" y="${cy - 22}" width="214" height="44" fill="transparent"/>${bar(x + 96, cy, 200, 22, value, wash)}</g>`;
    /** Look speed's mark: a cross-staff's sight. */
    const look = (cy: number) => `<g stroke="${INK.iron}" fill="none" stroke-width="1.6"><circle cx="${x + 54}" cy="${cy}" r="11"/>`
      + `<path d="M${x + 54} ${cy - 17}v8M${x + 54} ${cy + 9}v8M${x + 37} ${cy}h8M${x + 63} ${cy}h8"/></g>`;
    const el = f.draw(row('sound', y + 50, glyph('menu.speaker', x + 54, y + 50, 30), v.sound, WASH.azure) + row('look', y + 118, look(y + 118), v.look, WASH.ochre));
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

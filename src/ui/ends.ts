// Her match's end, laid over the world as it goes on (never an opaque sheet), after the camera's beat on it:
//   result   sunk, a band across the top: her place in its laurel over how many began (17 over 80), what sank her (a
//            ball, a ram, the Storm) in a paper disc, and the sea she held (her share of the planet's water); the
//            middle of the screen, her ship going down, left clear. Won, her place gilt in a sunburst beside the sea
//            she held. At the foot her ways on, each a banner: the spyglass (watch the match on: spectate) and the
//            skip's chevrons (the race run on to its end) while ships still fight, and the anchor (home)
//   watching small marks at the edges while she watches another ship: the anchor's disc at the top left (home), the
//            skip's beside it, and at the foot the spyglass between the arrows that turn her to the next ship or the one before
// No words; numerals only.

import type { End } from '../player';
import { INK, PAPER, WASH, figure, glyph, paperDisc, roughCircle, slip, svg } from './ink';
import { laurel } from './marks';
import { H, W, banner, region, sheet } from './screens';
import { fade, onTap, piece, uiLayer } from './ui';

/** A place's laurel and numeral: gold for the first, silver for the top five, red for the top ten, ink below. */
const placed = (place: number) =>
  place === 1 ? [WASH.gold, INK.gold] : place <= 5 ? ['#b4b8c2', '#7f848b'] : place <= 10 ? [WASH.vermilion, INK.rubric] : ['#6b5a4a', INK.iron];

/** A share of the planet as per cent: to a tenth under ten. */
const percent = (share: number) => {
  const p = Math.max(0, share) * 100;
  return `${p > 0 && p < 10 ? p.toFixed(1) : Math.round(p)}%`;
};

/** The sea held's mark: a disc of the chart's sea with a patch of her water washed on it in her scarlet, its border
 *  inked (the territory's own look on the sea), `r` across its half. */
const held = (x: number, y: number, r: number) => `<clipPath id="held-c"><circle cx="${x}" cy="${y}" r="${r}"/></clipPath>`
  + `<circle cx="${x}" cy="${y}" r="${r}" fill="#c3d8cf"/>`
  + `<path d="${roughCircle(x + r * 0.22, y + r * 0.12, r * 0.62, 7, r * 0.18)}" fill="rgba(196,40,46,.42)" stroke="rgb(176,28,36)" stroke-width="1.8" clip-path="url(#held-c)"/>`
  + `<circle cx="${x}" cy="${y}" r="${r}" fill="none" stroke="${INK.iron}" stroke-width="1.4"/>`;

/** The spyglass: a brass glass of three draws, its eye end at the left, tilted up to the right; `s` its length. */
export const spyglass = (x: number, y: number, s: number) => {
  const k = s / 80;
  const tube = (x0: number, w: number, h: number) => `<rect x="${x0}" y="${-h / 2}" width="${w}" height="${h}" rx="1.5" fill="url(#h-gold-d)" stroke="${INK.iron}" stroke-width="1.6"/>`
    + `<rect x="${x0}" y="${-h / 2}" width="${w}" height="${h}" rx="1.5" fill="${WASH.gold}" opacity=".55"/>`;
  return `<g transform="translate(${x} ${y}) rotate(-16) scale(${k})" stroke-linejoin="round">`
    + tube(-40, 18, 10) + tube(-23, 22, 14) + tube(-2, 32, 19)
    + `<rect x="29" y="-12.5" width="9" height="25" rx="2" fill="${INK.iron}" stroke="${INK.iron}" stroke-width="1.2"/>`
    + `<path d="M-40 -5v10M-23 -7v14M-2 -9.5v19M12 -9.5v19" stroke="${INK.iron}" stroke-width="1.2"/>`
    + `<circle cx="-42" cy="0" r="3" fill="${INK.iron}"/></g>`;
};

/** The anchor: its ring, stock and shank, and its arms with their flukes; `s` its height. */
export const anchor = (x: number, y: number, s: number) => {
  const k = s / 64;
  const fluke = (side: number) => `<path d="M${side * 23} 4l${side * 7} -9l${side * -1} 13z" fill="${INK.iron}"/>`;
  return `<g transform="translate(${x} ${y}) scale(${k})" stroke="${INK.iron}" fill="none" stroke-linecap="round" stroke-linejoin="round">`
    + `<circle cx="0" cy="-25" r="5.5" stroke-width="3"/><path d="M0 -19.5V26" stroke-width="4.4"/>`
    + `<path d="M-15 -12H15" stroke-width="4"/><circle cx="-16" cy="-12" r="2.4" fill="${INK.iron}"/><circle cx="16" cy="-12" r="2.4" fill="${INK.iron}"/>`
    + `<path d="M-23 4Q-22 26 0 27Q22 26 23 4" stroke-width="3.6"/>${fluke(-1)}${fluke(1)}</g>`;
};

/** A chevron pointing `side` (−1 left, +1 right). */
const chevron = (x: number, y: number, side: number) =>
  `<path d="M${x - 6 * side} ${y - 11}L${x + 6 * side} ${y}L${x - 6 * side} ${y + 11}" fill="none" stroke="${INK.iron}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`;

/** Skip to the result: two chevrons to the right, run together, and a bar at their head; `s` its width. */
export const skipMark = (x: number, y: number, s: number) => {
  const k = s / 40, line = `fill="none" stroke="${INK.iron}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"`;
  return `<g transform="translate(${x} ${y}) scale(${k})"><path d="M-18 -12L-4 0L-18 12M-4 -12L10 0L-4 12" ${line}/>`
    + `<path d="M17 -12V12" ${line}/></g>`;
};

/** What sank her, in a paper disc: a gun for a ball, two hulls met for a ram, the Storm's whirl; nothing, forfeit. */
const cause = (x: number, y: number, how: End['how']) => {
  const r = 22;
  const mark = how === 'forfeit' ? '' : how === 'shot' ? glyph('weapon.cannon', x, y, 32)
    : how === 'storm' ? glyph('hud.storm', x, y, 32, { ink: 'storm' })
      : `<g transform="translate(${x} ${y})" stroke="${INK.iron}" stroke-width="1.4" stroke-linejoin="round">`
        + `<path d="M-17 -2L-3 -2L1 2L-3 7L-15 7Z" fill="url(#h-iron)"/><path d="M17 -2L3 -2L-1 2L3 7L15 7Z" fill="url(#h-iron)" transform="scale(1 -1) translate(0 -5)"/>`
        + `<path d="M0 -12l2 6l5 -4l-2 6l6 1l-6 2l3 5" fill="none" stroke="${INK.rubric}" stroke-width="1.6"/></g>`;
  return paperDisc(x, y, r, how === 'storm' ? INK.storm : INK.iron) + mark;
};

/** The sunburst behind a win's laurel: straight rays and flames by turns, gilt, turning slowly. */
const sunburst = (x: number, y: number, r: number) => {
  let rays = '';
  for (let i = 0; i < 32; i++) {
    const a = (i / 32) * Math.PI * 2, w = 0.07, long = i % 2 === 0;
    const reach = long ? r * 1.62 : r * 1.4, base = r * 1.04;
    const p = (rad: number, da: number) => `${(x + Math.cos(a + da) * rad).toFixed(1)} ${(y + Math.sin(a + da) * rad).toFixed(1)}`;
    rays += long
      ? `<path d="M${p(base, -w)}L${p(reach, 0)}L${p(base, w)}Z"/>`
      : `<path d="M${p(base, -w)}Q${p(r * 1.22, w * 1.4)} ${p(reach, 0)}Q${p(r * 1.22, -w * 1.4)} ${p(base, w)}Z"/>`;
  }
  return `<g fill="${WASH.gold}" stroke="${INK.iron}" stroke-width=".9" opacity=".95">${rays}`
    + `<animateTransform attributeName="transform" type="rotate" from="0 ${x} ${y}" to="360 ${x} ${y}" dur="90s" repeatCount="indefinite"/></g>`
    + `<circle cx="${x}" cy="${y}" r="${r * 1.04}" fill="${PAPER}" stroke="${INK.iron}" stroke-width="1.2"/>`
    + `<circle cx="${x}" cy="${y}" r="${r * 0.97}" fill="none" stroke="${INK.gold}" stroke-width="1.6"/>`;
};

/** Where her result stands in the page: the middle (x), the band's top and its marks' line (sunk), the sunburst's
 *  centre (won), and the line of her ways on at the foot, clear of the home bar. */
const AT = { x: W / 2, band: 30, line: 88, sun: 116, foot: H - 100 } as const;

/** Her result over the world: what it shows, and its ways on (watch: null while there is no match on to watch). */
export function createResult(act: { watch(): void; skip(): void; leave(): void }) {
  const s = sheet(false, false);
  // shade at the top and the foot, under the band and the ways on; the middle, where her ship is, left clear
  s.root.style.background = 'linear-gradient(to bottom, rgba(20,12,6,.42), rgba(20,12,6,0) 30%, rgba(20,12,6,0) 76%, rgba(20,12,6,.42))';
  /** Whether it is shown, and with its way to watch. */
  let shown = false, watching = false;
  /** Her place over how many began, in its laurel, `r` across, at (x, y). */
  const place = (x: number, y: number, r: number, end: End) => {
    const [wreath, numeral] = placed(end.place), k = r / 48;
    return laurel(x, y, r, wreath) + figure(x, y - 8 * k, end.place, 50 * k, { fill: numeral })
      + `<path d="M${x - 15 * k} ${y + 16 * k}H${x + 15 * k}" stroke="${INK.iron}" stroke-width="1.4"/>` + figure(x, y + 29 * k, end.of, 17 * k);
  };
  /** Draws her end afresh: sunk, a band across the top of the screen, so the world under it, her ship going down,
   *  shows whole; won, her place gilt in its sunburst beside the sea she held. Her ways on at the foot. */
  const draw = (end: End) => {
    const won = end.how === 'won', { x, line: y, sun, foot } = AT, l = x - 170;
    watching = !end.over;
    const body = won
      ? sunburst(x, sun, 56) + place(x, sun, 66, end)
        + slip(x - 264, sun - 26, 158, 56) + held(x - 234, sun + 2, 16) + figure(x - 212, sun + 2, percent(end.share), 26, { anchor: 'start' })
      : slip(l, AT.band, 340, 116, { bold: true }) + place(l + 68, y, 46, end)
        + `<path d="M${l + 130} ${AT.band + 16}V${AT.band + 100}" stroke="${INK.iron}" stroke-width=".8" opacity=".6"/>`
        + cause(l + 166, y, end.how) + held(l + 220, y, 16) + figure(l + 242, y, percent(end.share), 26, { anchor: 'start' });
    const ways = watching
      ? `<g id="watch">${banner(x - 184, foot, 166, spyglass(x - 188, foot - 4, 64))}</g>`
        + `<g id="skip">${banner(x, foot, 166, skipMark(x - 4, foot - 4, 46))}</g>`
        + `<g id="leave">${banner(x + 184, foot, 166, anchor(x + 180, foot - 4, 50))}</g>`
      : `<g id="leave">${banner(x, foot, 196, anchor(x - 4, foot - 4, 56), won)}</g>`;
    const el = s.set(body + ways);
    region(el, 'leave', act.leave);
    if (watching) {
      region(el, 'watch', act.watch);
      region(el, 'skip', act.skip);
    }
  };
  return {
    /** Shows her end, with WATCH while the match goes on; or hides it. Shown already, it only loses WATCH once the
     *  match is over. */
    show(on: boolean, end?: End) {
      if (on && end && !shown) draw(end);
      else if (on && end?.over && watching) {
        // the match ended under it: WATCH and SKIP fade, LEAVE stays where it is
        s.root.querySelectorAll<SVGGElement>('#watch, #skip').forEach((w) => {
          w.classList.remove('press');
          w.setAttribute('style', 'transition: opacity .3s; opacity: 0');
        });
        watching = false;
      }
      shown = on;
      s.show(on);
    },
    /** Hides it over `ms`. */
    hide(ms: number) {
      shown = false;
      s.show(false, ms);
    },
  };
}

/** While she watches: the anchor's disc (home) at the top left and the skip's disc beside it (the race run on to its
 *  end), and at the foot the spyglass between the arrows that turn her to the ship before (−1) or the next (+1). */
export function createWatching(act: { leave(): void; switch(by: number): void; skip(): void }) {
  const root = document.createElement('div');
  root.className = 'screen';
  root.style.display = 'none';
  uiLayer().appendChild(root);
  const leave = piece(root, 'top left', true);
  leave.innerHTML = svg(56, 56, paperDisc(28, 28, 25) + anchor(28, 28, 36));
  onTap(leave, act.leave);
  const skip = piece(root, 'top left', true);
  skip.style.marginLeft = '62px';
  skip.innerHTML = svg(56, 56, paperDisc(28, 28, 25) + skipMark(28, 28, 30));
  onTap(skip, act.skip);
  const foot = piece(root, 'bottom centre');
  foot.innerHTML = svg(196, 60, slip(64, 10, 68, 42) + spyglass(98, 31, 52));
  for (const by of [-1, 1]) {
    const arrow = piece(foot, '', true);
    arrow.style.cssText = `top:2px;${by < 0 ? 'left' : 'right'}:0;width:56px;height:56px`;
    arrow.innerHTML = svg(56, 56, paperDisc(28, 28, 25) + chevron(28 + by * 2, 28, by));
    onTap(arrow, () => act.switch(by));
  }
  return { root, show: (on: boolean, ms?: number) => fade(root, on, ms) };
}

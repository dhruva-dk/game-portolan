// Her match's end, laid over the world as it goes on (never an opaque sheet),
// after the camera's beat on it:
//   result   sunk, a band across the top: her place in its laurel over how many began (17 over 80), what sank her (a
//            ball, a ram, the Storm) in a paper disc, the sea she held (her share of the planet's water); the middle of
//            the screen, her ship going down, left clear.
//            Won, her place gilt in a sunburst beside the sea she held. At the foot her ways on, each
//            a banner: the spyglass (watch the match on: spectate) while ships still fight, the tree (home, this seed
//            sailed again) and the seed (home, a new seed)
//   watching small marks at the edges while she watches another ship: the seed's disc at the top left (home, a new
//            seed), and
//            at the foot the spyglass between the arrows that turn her to the next ship or the one before
// No words; numerals only.

import type { End } from '../player.ts';
import {
  INK,
  PAPER,
  SHADOW,
  WASH,
  alpha,
  figure,
  glyph,
  paperDisc,
  roughCircle,
  slip,
  svg,
  uid,
} from './ink.ts';
import { laurel, ram, seed, spyglass } from './marks.ts';
import { banner, sheet } from './screens.ts';
import { onTap, region } from './touch.ts';
import { at, fade, piece, screen } from './ui.ts';

/**
 * A place's laurel and numeral: gold for the first, silver for the top five,
 * red for the top ten, ink below.
 */
const placed = (place: number) =>
  place === 1
    ? [WASH.gold, INK.gold]
    : place <= 5
      ? [WASH.silver, INK.silver]
      : place <= 10
        ? [WASH.vermilion, INK.rubric]
        : [WASH.umber, INK.iron];

/** A share of the planet as per cent: to a tenth under ten. */
const percent = (share: number) => {
  const p = Math.max(0, share) * 100;
  return `${p > 0 && p < 10 ? p.toFixed(1) : Math.round(p)}%`;
};

/** The sea held's mark: a disc of the chart's sea with a patch of her water washed on it in her scarlet, its border
 *  inked (the territory's own look on the sea), `r` across its half. */
const held = (x: number, y: number, r: number) => {
  const clip = uid('held');
  return (
    `<clipPath id="${clip}"><circle cx="${x}" cy="${y}" r="${r}"/></clipPath>` +
    `<circle cx="${x}" cy="${y}" r="${r}" fill="${WASH.sea}"/>` +
    `<path d="${roughCircle(x + r * 0.22, y + r * 0.12, r * 0.62, 7, r * 0.18)}" fill="${alpha(INK.scarlet, 0.42)}" stroke="${INK.scarlet}" stroke-width="1.8" clip-path="url(#${clip})"/>` +
    `<circle cx="${x}" cy="${y}" r="${r}" fill="none" stroke="${INK.iron}" stroke-width="1.4"/>`
  );
};

/** The tree (this seed sailed again: the same world grown): a palm, its trunk leaning and ringed, five fronds from its
 *  crown; `s` its height. */
const tree = (x: number, y: number, s: number) => {
  const k = s / 64;
  const frond = (dx: number, dy: number, bend: number) =>
    `<path d="M4 -16Q${4 + dx / 2} ${-16 + dy / 2 - bend} ${4 + dx} ${-16 + dy}Q${4 + dx / 2} ${-16 + dy / 2 + bend / 3} 4 -16Z" fill="${WASH.viridian}" stroke="${INK.green}" stroke-width="1.6"/>`;
  return (
    `<g transform="translate(${x} ${y}) scale(${k})" stroke="${INK.iron}" stroke-linecap="round" stroke-linejoin="round">` +
    `<path d="M-14 28H14" stroke="${INK.sepia}" stroke-width="3"/>` +
    `<path d="M-2 28Q-4 6 4 -16" fill="none" stroke-width="5"/>` +
    `<path d="M-3 18h4M-3 8h4M-1 -2h4M1 -10h4" stroke="${WASH.umber}" stroke-width="1.4"/>` +
    frond(-24, 2, 10) +
    frond(24, 4, 10) +
    frond(-16, -14, 6) +
    frond(18, -12, 6) +
    frond(2, -22, 4) +
    `<circle cx="2" cy="-13" r="2.6" fill="${INK.sepia}" stroke="none"/><circle cx="7" cy="-12" r="2.6" fill="${INK.sepia}" stroke="none"/></g>`
  );
};

/** A chevron pointing `side` (−1 left, +1 right). */
const chevron = (x: number, y: number, side: number) =>
  `<path d="M${x - 6 * side} ${y - 11}L${x + 6 * side} ${y}L${x - 6 * side} ${y + 11}" fill="none" stroke="${INK.iron}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`;

/** What sank her, in a paper disc: for a ball the gun it came from (a cannon, not known), two hulls met for a ram,
 *  the Storm's whirl. */
const cause = (x: number, y: number, { how, gun }: End) => {
  const r = 22;
  const mark =
    how === 'shot'
      ? glyph(`weapon.${gun ?? 'cannon'}`, x, y, 32)
      : how === 'storm'
        ? glyph('hud.storm', x, y, 32, { ink: 'storm' })
        : ram(x, y);
  return paperDisc(x, y, r, how === 'storm' ? INK.storm : INK.iron) + mark;
};

/** The sunburst behind a win's laurel: straight rays and flames by turns, gilt, turning slowly. */
const sunburst = (x: number, y: number, r: number) => {
  let rays = '';
  for (let i = 0; i < 32; i++) {
    const a = (i / 32) * Math.PI * 2,
      w = 0.07,
      long = i % 2 === 0;
    const reach = long ? r * 1.62 : r * 1.4,
      base = r * 1.04;
    const p = (rad: number, da: number) =>
      `${(x + Math.cos(a + da) * rad).toFixed(1)} ${(y + Math.sin(a + da) * rad).toFixed(1)}`;
    rays += long
      ? `<path d="M${p(base, -w)}L${p(reach, 0)}L${p(base, w)}Z"/>`
      : `<path d="M${p(base, -w)}Q${p(r * 1.22, w * 1.4)} ${p(reach, 0)}Q${p(r * 1.22, -w * 1.4)} ${p(base, w)}Z"/>`;
  }
  return (
    `<g fill="${WASH.gold}" stroke="${INK.iron}" stroke-width=".9" opacity=".95">${rays}` +
    `<animateTransform attributeName="transform" type="rotate" from="0 ${x} ${y}" to="360 ${x} ${y}" dur="90s" repeatCount="indefinite"/></g>` +
    `<circle cx="${x}" cy="${y}" r="${r * 1.04}" fill="${PAPER}" stroke="${INK.iron}" stroke-width="1.2"/>` +
    `<circle cx="${x}" cy="${y}" r="${r * 0.97}" fill="none" stroke="${INK.gold}" stroke-width="1.6"/>`
  );
};

/** Her result over the world: what it shows, and its ways on (watch: null while there is no match on to watch). */
export function createResult(act: {
  watch(): void;
  leave(): void;
  again(): void;
}) {
  const s = sheet(false, false);
  // shade at the top and the foot, under the band and the ways on; the middle, where her ship is, left clear
  const shade = alpha(SHADOW, 0.42),
    clear = alpha(SHADOW, 0);
  s.root.style.background = `linear-gradient(to bottom, ${shade}, ${clear} 40%, ${clear} 66%, ${shade})`;
  /** Whether it is shown, and with its way to watch. */
  let shown = false,
    watching = false;
  /** Her place over how many began, in its laurel, `r` across, at (x, y). */
  const place = (x: number, y: number, r: number, end: End) => {
    const [wreath, numeral] = placed(end.place),
      k = r / 48;
    return (
      laurel(x, y, r, wreath) +
      figure(x, y - 8 * k, end.place, 50 * k, { fill: numeral }) +
      `<path d="M${x - 15 * k} ${y + 16 * k}H${x + 15 * k}" stroke="${INK.iron}" stroke-width="1.4"/>` +
      figure(x, y + 29 * k, end.of, 17 * k)
    );
  };
  /** Draws her end afresh: sunk, a band across the top of the screen, so the world under it, her ship going down,
   *  shows whole; won, her place gilt in its sunburst beside the sea she held. Her ways on at the foot. */
  const draw = (end: End) => {
    const won = end.how === 'won',
      y = 72;
    watching = !end.over;
    const body = won
      ? sunburst(478, 100, 56) +
        place(478, 100, 66, end) +
        slip(214, 74, 158, 56) +
        held(244, 102, 16) +
        figure(266, 102, percent(end.share), 26, { anchor: 'start' })
      : slip(310, 14, 336, 116, { bold: true }) +
        place(378, y, 46, end) +
        `<path d="M440 30V114" stroke="${INK.iron}" stroke-width=".8" opacity=".6"/>` +
        cause(476, y, end) +
        held(530, y, 16) +
        figure(552, y, percent(end.share), 26, { anchor: 'start' });
    // the tree (this seed again) and the seed (a new one), the spyglass before them while ships still fight
    const homes = (x: number, w: number, gilt = false) =>
      `<g id="again">${banner(x, 370, w, tree(x - 4, 366, 58), gilt)}</g>` +
      `<g id="leave">${banner(x + w + 20, 370, w, seed(x + w + 16, 366, 54), gilt)}</g>`;
    const ways = watching
      ? `<g id="watch">${banner(282, 370, 176, spyglass(278, 366, 68))}</g>${homes(478, 176)}`
      : homes(380, 176, won);
    // the band at the top of the screen, the ways on at its foot (on another shape of screen, each kept to its edge)
    s.set(
      (p) => at(p, 'centre', 'top', body) + at(p, 'centre', 'bottom', ways),
      (el) => {
        region(el, 'leave', act.leave);
        region(el, 'again', act.again);
        if (watching) region(el, 'watch', act.watch);
      }
    );
  };
  return {
    /** Shows her end, with WATCH while the match goes on; or hides it. Shown already, it only loses WATCH once the
     *  match is over. */
    show(on: boolean, end?: End) {
      if (on && end && !shown) draw(end);
      else if (on && end?.over && watching) {
        // the match ended under it: WATCH fades, LEAVE stays where it is
        const w = s.root.querySelector<SVGGElement>('#watch');
        if (w) {
          w.classList.remove('press');
          w.style.transition = 'opacity .3s';
          w.style.opacity = '0';
        }
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

/** While she watches: the anchor's disc (home) at the top left, and at the foot the spyglass between the arrows that
 *  turn her to the ship before (−1) or the next (+1). */
export function createWatching(act: {
  leave(): void;
  switch(by: number): void;
}) {
  const root = screen();
  const leave = piece(root, 'top left', true, true);
  leave.innerHTML = svg(56, 56, paperDisc(28, 28, 25) + seed(28, 30, 34));
  onTap(leave, act.leave);
  const foot = piece(root, 'bottom centre', false, true);
  foot.innerHTML = svg(196, 60, slip(64, 10, 68, 42) + spyglass(98, 31, 52));
  for (const by of [-1, 1]) {
    const arrow = piece(foot, '', true);
    arrow.style.cssText = `top:2px;${by < 0 ? 'left' : 'right'}:0;width:56px;height:56px`;
    arrow.innerHTML = svg(
      56,
      56,
      paperDisc(28, 28, 25) + chevron(28 + by * 2, 28, by)
    );
    onTap(arrow, () => act.switch(by));
  }
  return { root, show: (on: boolean, ms?: number) => fade(root, on, ms) };
}

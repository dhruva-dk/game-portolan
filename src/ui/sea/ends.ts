import type { End } from '../../play/player.ts';
import {
  INK,
  PAPER,
  SHADOW,
  WASH,
  alpha,
  figure,
  glyph,
  paperDisc,
  percent,
  roughCircle,
  slip,
  svg,
  uid,
} from '../base/ink.ts';
import { again, anchor, die, laurel, ram, spyglass } from '../base/marks.ts';
import { banner, sheet } from '../base/screens.ts';
import { onTap, region } from '../base/touch.ts';
import { at, fade, piece, screen } from '../base/ui.ts';

const placed = (place: number) =>
  place === 1
    ? [WASH.gold, INK.gold]
    : place <= 5
      ? [WASH.silver, INK.silver]
      : place <= 10
        ? [WASH.vermilion, INK.rubric]
        : [WASH.umber, INK.iron];

const r2 = (n: number) => Math.round(n * 100) / 100;

const held = (x: number, y: number, r: number, dye: string) => {
  const clip = uid('held'),
    wave = (wy: number) =>
      `M${r2(x - r)} ${r2(wy)}q${r2(r / 4)} ${r2(-r / 5)} ${r2(r / 2)} 0t${r2(r / 2)} 0t${r2(r / 2)} 0t${r2(r / 2)} 0`;
  return (
    `<clipPath id="${clip}"><circle cx="${x}" cy="${y}" r="${r}"/></clipPath>` +
    `<circle cx="${x}" cy="${y}" r="${r}" fill="${WASH.sea}"/>` +
    `<g clip-path="url(#${clip})"><path d="${roughCircle(x + r * 0.22, y + r * 0.12, r * 0.62, 7, r * 0.18)}" fill="${alpha(dye, 0.55)}" stroke="${dye}" stroke-width="1.8"/>` +
    `<path d="${wave(y - r * 0.35)}${wave(y + r * 0.1)}${wave(y + r * 0.55)}" fill="none" stroke="${INK.white}" stroke-width="1.1" stroke-linecap="round" opacity=".8"/></g>` +
    `<circle cx="${x}" cy="${y}" r="${r}" fill="none" stroke="${INK.iron}" stroke-width="1.4"/>`
  );
};

const chevron = (x: number, y: number, side: number) =>
  `<path d="M${x - 6 * side} ${y - 11}L${x + 6 * side} ${y}L${x - 6 * side} ${y + 11}" fill="none" stroke="${INK.iron}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`;

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

export function createResult(
  dye: () => string,
  act: { watch(): void; leave(): void; again(): void }
) {
  const s = sheet(false, false);
  const shade = alpha(SHADOW, 0.42),
    clear = alpha(SHADOW, 0);
  s.root.style.background = `linear-gradient(to bottom, ${shade}, ${clear} 40%, ${clear} 66%, ${shade})`;
  let shown = false,
    watching = false;
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
  const draw = (end: End) => {
    const won = end.how === 'won',
      y = 72;
    watching = !end.over;
    const body = won
      ? sunburst(478, 100, 56) +
        place(478, 100, 66, end) +
        slip(214, 74, 158, 56) +
        held(244, 102, 16, dye()) +
        figure(266, 102, percent(end.share), 26, { anchor: 'start' })
      : slip(310, 14, 336, 116, { bold: true }) +
        place(378, y, 46, end) +
        `<path d="M440 30V114" stroke="${INK.iron}" stroke-width=".8" opacity=".6"/>` +
        cause(476, y, end) +
        held(530, y, 16, dye()) +
        figure(552, y, percent(end.share), 26, { anchor: 'start' });
    const homes = (x: number, w: number, gilt = false) =>
      `<g id="again">${banner(x, 370, w, again(x - 4, 366, 50), gilt)}</g>` +
      `<g id="leave">${banner(x + w + 20, 370, w, die(x + w + 16, 366, 50), gilt)}</g>`;
    const ways = watching
      ? `<g id="watch">${banner(282, 370, 176, spyglass(278, 366, 68))}</g>${homes(478, 176)}`
      : homes(380, 176, won);
    s.set(
      (p) => at(p, 'center', 'top', body) + at(p, 'center', 'bottom', ways),
      (el) => {
        region(el, 'leave', act.leave);
        region(el, 'again', act.again);
        if (watching) region(el, 'watch', act.watch);
      }
    );
  };
  return {
    show(on: boolean, end?: End) {
      if (on && end && !shown) draw(end);
      else if (on && end?.over && watching) {
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
    hide(ms: number) {
      shown = false;
      s.show(false, ms);
    },
  };
}

export function createWatching(act: {
  leave(): void;
  switch(by: number): void;
}) {
  const root = screen();
  const leave = piece(root, 'top left', true, true);
  leave.dataset.way = 'leave';
  leave.innerHTML = svg(56, 56, paperDisc(28, 28, 25) + anchor(28, 29, 32));
  onTap(leave, act.leave);
  const foot = piece(root, 'bottom center', false, true);
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

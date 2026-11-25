import type { Status } from '../../play/player.ts';
import { clamp } from '../../world/scalar.ts';
import { MOTION } from '../base/house.ts';
import {
  INK,
  PAPER,
  WASH,
  figure,
  glyph,
  r2,
  slip,
  svgNode,
} from '../base/ink.ts';

export const VITALS = { w: 116, h: 60 } as const;

const BAR = { x: 11, w: 57 },
  ROWS = {
    shield: { cy: 20, h: 9, size: 15, ink: INK.blue, wash: WASH.azure },
    hull: { cy: 41, h: 14, size: 21, ink: INK.iron, wash: WASH.umber },
  },
  FIGURES = 74,
  PLUS = { x: 106, size: 13 },
  LOW = 0.25;

type Vitals = {
  shield: number;
  hull: number;
  shieldShare: number;
  hullShare: number;
  low: boolean;
  refilling: boolean;
  broken: boolean;
};

export function vitalsOf(s: Status): Vitals {
  const shield = Math.round(s.shield),
    hull = Math.round(s.hull),
    hullShare = s.hullMax > 0 ? clamp(hull / s.hullMax) : 0;
  return {
    shield,
    hull,
    shieldShare: s.shieldMax > 0 ? clamp(shield / s.shieldMax) : 0,
    hullShare,
    low: hull > 0 && hullShare <= LOW,
    refilling: s.refilling,
    broken: shield <= 0,
  };
}

type Row = keyof typeof ROWS;

function barFace(row: Row) {
  const { cy, h, size, ink, wash } = ROWS[row],
    top = r2(cy - h / 2),
    inner = BAR.w - 3;
  const sheen =
    row === 'shield'
      ? `<clipPath id="v-clip"><rect x="${BAR.x + 1.5}" y="${r2(top + 1.5)}" width="${inner}" height="${h - 3}"/></clipPath>` +
        `<g clip-path="url(#v-clip)"><rect class="sheen" x="${BAR.x + 1.5}" y="${r2(top + 1.5)}" width="${r2(inner * MOTION.vitals.shimmer.band)}" height="${h - 3}" fill="url(#v-sheen)"/></g>`
      : '';
  const crack =
    row === 'shield'
      ? `<path class="crack" d="M${BAR.x - 2} ${cy + 1}l9 -4l6 5l8 -6l7 6l9 -5l6 4l8 -5l9 5" fill="none" stroke="${INK.white}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round" pathLength="1"/>`
      : '';
  return (
    `<g id="v-${row}" class="vbar">` +
    `<rect x="${BAR.x}" y="${top}" width="${BAR.w}" height="${h}" fill="${PAPER}" stroke="${INK.iron}" stroke-width=".9"/>` +
    `<rect x="${BAR.x + 1.5}" y="${r2(top + 1.5)}" width="${inner}" height="${h - 3}" fill="${INK.iron}" opacity=".16"/>` +
    `<rect class="lost" x="${BAR.x + 1.5}" y="${r2(top + 1.5)}" width="${inner}" height="${h - 3}" fill="${INK.white}"/>` +
    `<rect class="fill" x="${BAR.x + 1.5}" y="${r2(top + 1.5)}" width="${inner}" height="${h - 3}" fill="${wash}" opacity=".88"/>` +
    sheen +
    crack +
    `<g class="figure">${figure(FIGURES, cy, '', size, { anchor: 'start', fill: ink })}</g>` +
    '</g>'
  );
}

const DEFS =
  `<defs><linearGradient id="v-sheen" x1="0" x2="1" y1="0" y2="0">` +
  `<stop offset="0" stop-color="${INK.white}" stop-opacity="0"/>` +
  `<stop offset=".5" stop-color="${INK.white}" stop-opacity=".75"/>` +
  `<stop offset="1" stop-color="${INK.white}" stop-opacity="0"/>` +
  '</linearGradient></defs>';

type Bar = {
  g: SVGGElement;
  fill: SVGRectElement;
  lost: SVGRectElement;
  text: SVGTextElement;
  shown: number;
  from: number;
  to: number;
  since: number;
  share: number;
  top: number;
  until: number;
};

export function createVitals(face: HTMLElement) {
  const svg = svgNode(
    VITALS.w,
    VITALS.h,
    DEFS +
      `<g class="throb">${slip(1, 1, VITALS.w - 2, VITALS.h - 2)}` +
      `<path class="alarm" d="M3 3H${VITALS.w - 3}V${VITALS.h - 3}H3Z" fill="none" stroke="${INK.rubric}" stroke-width="2.2"/></g>` +
      barFace('shield') +
      barFace('hull') +
      `<g class="plus">${glyph('plus', PLUS.x, ROWS.shield.cy, PLUS.size)}</g>`
  );
  svg.classList.add('vitals');
  face.replaceChildren(svg);
  const bar = (row: Row): Bar => {
    const g = svg.querySelector<SVGGElement>(`#v-${row}`)!;
    return {
      g,
      fill: g.querySelector<SVGRectElement>('.fill')!,
      lost: g.querySelector<SVGRectElement>('.lost')!,
      text: g.querySelector<SVGTextElement>('text')!,
      shown: NaN,
      from: 0,
      to: 0,
      since: 0,
      share: -1,
      top: 0,
      until: 0,
    };
  };
  const bars = { shield: bar('shield'), hull: bar('hull') };
  let low = false,
    refilling = false,
    broken = true;

  const scale = (el: SVGElement, share: number) => {
    el.style.transform = `scaleX(${share.toFixed(4)})`;
  };

  const set = (b: Bar, value: number, share: number, now: number) => {
    if (Number.isNaN(b.shown)) {
      b.shown = b.from = b.to = value;
      b.text.textContent = String(value);
      b.share = share;
      scale(b.fill, share);
      scale(b.lost, share);
      return;
    }
    if (value !== b.to) {
      b.from = b.shown;
      b.to = value;
      b.since = now;
    }
    if (share === b.share) return;
    const { hold, ms, ease } = MOTION.vitals.lost;
    if (share < b.share) {
      const top = now < b.until ? Math.max(b.top, b.share) : b.share;
      b.top = top;
      b.until = now + hold + ms;
      b.fill.style.transition = 'none';
      scale(b.fill, share);
      b.lost.getAnimations().forEach((a) => a.cancel());
      scale(b.lost, share);
      b.lost.animate(
        [
          { transform: `scaleX(${top.toFixed(4)})`, opacity: 1 },
          {
            transform: `scaleX(${top.toFixed(4)})`,
            opacity: 1,
            offset: hold / (hold + ms),
          },
          { transform: `scaleX(${share.toFixed(4)})`, opacity: 0.6 },
        ],
        { duration: hold + ms, easing: ease }
      );
    } else {
      b.fill.style.transition = '';
      scale(b.fill, share);
      scale(b.lost, share);
    }
    b.share = share;
  };

  const roll = (b: Bar, now: number) => {
    if (b.shown === b.to) return;
    const k = clamp((now - b.since) / MOTION.vitals.roll.ms),
      next = Math.round(b.from + (b.to - b.from) * (1 - (1 - k) ** 3));
    if (next === b.shown) return;
    b.shown = next;
    b.text.textContent = String(next);
  };

  const restart = (el: Element, name: string) => {
    el.classList.remove(name);
    void el.getBoundingClientRect();
    el.classList.add(name);
  };

  return {
    el: svg,
    update(s: Status) {
      const v = vitalsOf(s),
        now = performance.now();
      set(bars.shield, v.shield, v.shieldShare, now);
      set(bars.hull, v.hull, v.hullShare, now);
      roll(bars.shield, now);
      roll(bars.hull, now);
      if (v.broken !== broken) {
        if (v.broken && !Number.isNaN(bars.shield.shown) && !s.sunk)
          restart(bars.shield.g, 'cracked');
        broken = v.broken;
      }
      if (v.low !== low) {
        low = v.low;
        svg.classList.toggle('low', low);
        bars.hull.text.setAttribute('fill', low ? INK.rubric : INK.iron);
      }
      if (v.refilling !== refilling) {
        refilling = v.refilling;
        svg.classList.toggle('refilling', refilling);
      }
    },
  };
}

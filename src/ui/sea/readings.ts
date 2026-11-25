import type { Race, Status } from '../../play/player.ts';
import { clamp } from '../../world/scalar.ts';
import { pressable } from '../base/button.ts';
import { clock } from '../base/clock.ts';
import { stormMark } from '../base/glyphs.ts';
import { portrait, uncle } from '../base/gull.ts';
import { MOTION } from '../base/house.ts';
import {
  INK,
  PAPER,
  WASH,
  figure,
  glyph,
  paperDisc,
  r2,
  slip,
  svgNode,
} from '../base/ink.ts';

export const READINGS = {
  h: 34,
  gap: 5,
  clock: 66,
  afloat: 52,
  sea: 70,
  wing: 64,
  pause: 15,
  glyph: 18,
  figure: 20,
  at: 13,
  text: 25,
} as const;

export const seaShown = (share: number) => {
  const p = clamp(share) * 100;
  return p < 10 ? `${p.toFixed(1)}%` : `${Math.round(p)}%`;
};

export const seaTenths = (share: number) => Math.round(clamp(share) * 1000);

export type Wingman = { id: number; share: number; sunk: boolean };

export function wingmanOf(race: Race | null): Wingman | null {
  const m = race?.mates[0];
  if (!m) return null;
  return {
    id: m.id,
    share: m.hullMax > 0 ? clamp(m.hull / m.hullMax) : 0,
    sunk: m.hull <= 0,
  };
}

function layout(wing: boolean) {
  const { gap, clock: c, afloat, sea, wing: w, pause } = READINGS;
  const x = { clock: 0, afloat: c + gap, sea: c + afloat + 2 * gap, wing: 0 };
  x.wing = x.sea + sea + gap;
  const button = (wing ? x.wing + w : x.wing - gap) + gap + pause + 1;
  return { x, button, width: button + pause + 2 };
}

export function createReadings(
  host: HTMLElement,
  face: { portrait: number | null },
  act: { pause(): void }
) {
  let svg: SVGSVGElement | null = null,
    wing: boolean | null = null,
    second = -1,
    afloat = -1,
    closing: boolean | null = null,
    percent = -1,
    popped = -Infinity,
    wingShare = -1,
    wingSunk: boolean | null = null,
    heard = 0,
    mate = -1;

  const part = <T extends Element>(id: string) =>
    svg?.querySelector<T>(`#${id}`) ?? null;

  function build(withWing: boolean) {
    const { x, button, width } = layout(withWing),
      R = READINGS,
      cy = R.h / 2,
      h = R.h - 4;
    const { wing: wx } = x,
      r = 12,
      fx = wx + 16,
      size = 2 * r + 2,
      bar = { x: wx + 32, w: R.wing - 38 };
    const chip = withWing
      ? `<g id="r-wing">${slip(wx, 2, R.wing, h)}` +
        `<clipPath id="r-wing-clip"><circle cx="${fx}" cy="${cy}" r="${r}"/></clipPath>` +
        `<g id="r-wing-face" class="face"><circle cx="${fx}" cy="${cy}" r="${r}" fill="${WASH.sea}"/>` +
        `<g clip-path="url(#r-wing-clip)"><g transform="translate(${fx - size / 2} ${cy - size / 2 + 1})">${face.portrait === null ? uncle(size) : portrait(face.portrait, size)}</g></g>` +
        `<circle cx="${fx}" cy="${cy}" r="${r}" fill="none" stroke="${INK.iron}" stroke-width="1.2"/></g>` +
        `<rect x="${bar.x}" y="${cy - 4.5}" width="${bar.w}" height="9" fill="${PAPER}" stroke="${INK.iron}" stroke-width=".9"/>` +
        `<rect id="r-wing-fill" class="wing-fill" x="${bar.x + 1.5}" y="${cy - 3}" width="${bar.w - 3}" height="6" fill="${WASH.umber}" opacity=".88"/>` +
        `<g id="r-wing-cross" class="cross">${glyph('cross', fx, cy, 24, { ink: 'rubric' })}</g>` +
        '</g>'
      : '';
    const reading = (at: number, w: number, mark: string, id: string) =>
      slip(at + 1, 2, w, h) +
      mark +
      `<g id="${id}">${figure(at + R.text, cy, '', R.figure, { anchor: 'start' })}</g>`;
    svg = svgNode(
      width,
      R.h,
      reading(x.clock, R.clock, '<g id="r-storm"></g>', 'r-time') +
        reading(
          x.afloat,
          R.afloat,
          glyph('ship', x.afloat + R.at, cy, R.glyph),
          'r-afloat'
        ) +
        reading(
          x.sea,
          R.sea,
          glyph('territory', x.sea + R.at, cy, R.glyph + 1),
          'r-sea'
        ) +
        chip +
        `<g id="r-pause">${paperDisc(button, cy, R.pause)}${glyph('pause', button, cy, 14)}</g>`
    );
    host.replaceChildren(svg);
    host.style.width = `${width}px`;
    host.style.height = `${READINGS.h}px`;
    pressable(part<SVGGElement>('r-pause'), () => act.pause(), 'pause');
    wing = withWing;
    second = afloat = percent = wingShare = -1;
    closing = wingSunk = null;
  }

  const text = (id: string, value: string, fill?: string) => {
    const t = part<SVGTextElement>(id)?.querySelector('text');
    if (!t) return;
    t.textContent = value;
    if (fill) t.setAttribute('fill', fill);
  };

  const flinch = () => {
    const { ms, turn, shift } = MOTION.flinch;
    part<SVGGElement>('r-wing-face')?.animate(
      [
        { transform: 'none' },
        {
          transform: `translate(${-shift}px, ${shift / 2}px) rotate(${-turn}deg)`,
          offset: 0.2,
        },
        {
          transform: `translate(${shift / 2}px, 0) rotate(${turn / 2}deg)`,
          offset: 0.55,
        },
        { transform: 'none' },
      ],
      { duration: ms, easing: 'ease-out' }
    );
  };

  return {
    portrait(seed: number | null) {
      if (seed === face.portrait) return;
      face.portrait = seed;
      if (wing !== null) build(wing);
    },
    update(s: Status) {
      const w = wingmanOf(s.race);
      if (svg === null || (w !== null) !== wing) build(w !== null);
      const t = Math.ceil(s.storm),
        near = s.closing || s.storm < 30;
      if (near !== closing || t !== second) {
        if (near !== closing) {
          const g = part<SVGGElement>('r-storm');
          if (g)
            g.innerHTML = glyph(
              stormMark(s.closing),
              READINGS.at + 1,
              READINGS.h / 2,
              READINGS.glyph + 2,
              { ink: near ? 'storm' : 'iron' }
            );
        }
        text('r-time', clock(s.storm), near ? INK.storm : INK.iron);
        closing = near;
        second = t;
      }
      if (s.afloat !== afloat) {
        afloat = s.afloat;
        text('r-afloat', String(afloat));
      }
      const p = seaTenths(s.sea);
      if (p !== percent) {
        const now = performance.now(),
          gained = percent >= 0 && p > percent;
        percent = p;
        text('r-sea', seaShown(s.sea));
        if (gained && now - popped > MOTION.sea.apart) {
          popped = now;
          part<SVGGElement>('r-sea')?.animate(
            [
              { transform: 'scale(1)' },
              { transform: `scale(${MOTION.sea.pop})`, fill: INK.green },
              { transform: 'scale(1)' },
            ],
            { duration: MOTION.sea.ms, easing: MOTION.sea.ease }
          );
        }
      }
      for (const m of s.moments) {
        if (m.seq <= heard) continue;
        heard = m.seq;
        if (
          w &&
          m.kind === 'struck' &&
          m.ship === w.id &&
          m.shield + m.hull > 0
        )
          flinch();
      }
      if (!w) return;
      if (w.id !== mate) {
        mate = w.id;
        wingSunk = null;
      }
      const share = r2(w.share);
      if (share !== wingShare) {
        wingShare = share;
        const fill = part<SVGRectElement>('r-wing-fill');
        if (fill) fill.style.transform = `scaleX(${share})`;
      }
      if (w.sunk !== wingSunk) {
        part<SVGGElement>('r-wing')?.classList.toggle('sunk', w.sunk);
        wingSunk = w.sunk;
      }
    },
  };
}

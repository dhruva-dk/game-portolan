// The marks of a blow, laid on the HUD: a cross, figures and arcs.
//   cross    her ball home: four ticks round the reticle in the middle of the screen, popping out and gone in a
//            moment; white on a hull, azure brackets on a shield, the brackets thrown wide with shards where it
//            broke; a gold cross turned a quarter and ringed where she sank the ship
//   figure   the hit points the blow took, a numeral rising from the struck ship and fading: rubric off a hull, azure
//            off a shield; blows on one ship close together summed in one figure; gold and bigger for the last
//   ring     a ring of eight sectors round the reticle, faint at rest: a blow on her from a ship lights the sector
//            toward it rubric, brighter the heavier, held and fading over 2 s
// No words; numerals only. Its own layer, over the world and under the HUD's
// pieces; it runs on the page's clock.

import { FIGURES, INK, LIGHT, svgNode } from './ink.ts';

/**
 * How long each lasts, s; how close together blows on one ship sum, s; the most
 * figures at once.
 */
const MARK = { cross: 0.28, kill: 0.8, figure: 0.9 } as const;
const MERGE = 0.35,
  MOST = 12;
/**
 * The cross's ticks: length, width and gap from the middle (px), and its pop.
 */
const TICK = 13,
  WIDE = 3.5,
  GAP = 8,
  POP = 1.55;
/**
 * The ring round the reticle: its radius (px at the drawn size, clear of the
 * reticle at its widest, hud.ts SPREAD), its sectors and the gap between them
 * (radians), its look at rest, and lit: the least and most brightness (by the
 * blow's weight) and how long it is held fading, s.
 */
export const RING = {
  radius: 66,
  sectors: 8,
  gap: 0.16,
  rest: 0.16,
  lit: [0.45, 1],
  held: 2,
} as const;
/** The shield's azure, and the gold of a sinking. */
const AZURE = LIGHT.azure,
  GOLD = LIGHT.gold;

/**
 * A figure's size for a blow of `points`, by how heavy it was; ×1.6 for the
 * last.
 */
const figureSize = (points: number, last: boolean) =>
  (points < 15 ? 15 : points < 40 ? 19 : 25) * (last ? 1.6 : 1);

/**
 * The ring's sector a blow from `bearing` (radians clockwise from ahead) lights:
 * 0 ahead, at the top, and on clockwise; each from half a sector before its
 * middle up to, not including, half a sector after.
 */
export function sectorOf(bearing: number) {
  const n = RING.sectors,
    // (a hair over, so a boundary's rounding never drops it to the sector before)
    s = Math.floor((bearing / (2 * Math.PI)) * n + 0.5 + 1e-9);
  return ((s % n) + n) % n;
}

/**
 * A sector's light for a blow felt `weight` (player.ts felt; 1 and over the
 * heaviest): its brightness over the time it is held, struck at once and fading
 * out, and how long, ms.
 */
export function glow(weight: number) {
  const w = Math.min(1, Math.max(0, weight)),
    top = RING.lit[0] + (RING.lit[1] - RING.lit[0]) * w;
  return {
    frames: [
      { opacity: top },
      { opacity: top, offset: 0.12 },
      { opacity: top * 0.6, offset: 0.5 },
      { opacity: 0 },
    ],
    ms: RING.held * 1000,
  };
}

/** The ring's sector `i` as an arc round (c, c), radius r, its gap left. */
const sectorArc = (i: number, c: number, r: number) => {
  const step = (2 * Math.PI) / RING.sectors,
    a = i * step - step / 2 + RING.gap / 2,
    b = a + step - RING.gap,
    at = (t: number) =>
      `${(c + Math.sin(t) * r).toFixed(2)} ${(c - Math.cos(t) * r).toFixed(2)}`;
  return `M${at(a)}A${r} ${r} 0 0 1 ${at(b)}`;
};

type Kind = 'hit' | 'shield' | 'break' | 'kill';

export function createHits(parent: HTMLElement) {
  const layer = document.createElement('div');
  layer.style.cssText =
    'position:absolute;inset:0;pointer-events:none;overflow:hidden';
  parent.prepend(layer);
  const now = () => performance.now() / 1000;
  /**
   * The figures showing: on which ship, its total, when it began and was last
   * added to, and its element.
   */
  let figures: {
    ship: number;
    total: number;
    last: number;
    el: HTMLDivElement;
    kill: boolean;
  }[] = [];

  // the ring round the reticle: its sectors faint at rest, and over each its
  // light, a rubric arc on iron in a rubric glow, unseen till a blow lights it
  const c = RING.radius + 10,
    rests: string[] = [],
    lights: string[] = [];
  for (let i = 0; i < RING.sectors; i++) {
    const d = sectorArc(i, c, RING.radius);
    rests.push(d);
    lights.push(
      `<g opacity="0">` +
        `<path d="${d}" stroke="${INK.rubric}" stroke-width="12" opacity=".4"/>` +
        `<path d="${d}" stroke="${INK.iron}" stroke-width="6" opacity=".45"/>` +
        `<path d="${d}" stroke="${INK.rubric}" stroke-width="3.6"/></g>`
    );
  }
  const ring = svgNode(
    2 * c,
    2 * c,
    `<g fill="none" stroke-linecap="round"><path d="${rests.join('')}" stroke="${INK.white}" stroke-width="1.4" opacity="${RING.rest}"/>${lights.join('')}</g>`
  );
  const ringAt = document.createElement('div');
  ringAt.className = 'mark';
  ringAt.style.cssText = 'left:50%;top:50%';
  ringAt.append(ring);
  parent.prepend(ringAt);
  const lit = Array.from(ring.querySelectorAll<SVGGElement>('g > g')),
    lighting: (Animation | null)[] = lit.map(() => null);
  let showing = true;

  /**
   * A mark at (x, y) CSS px, drawn at the drawn size and grown by the UI's size
   * about its place (ui.ts .mark): what holds it, and what is drawn in it,
   * which moves.
   */
  const placed = (x: number, y: number, el: HTMLElement | SVGSVGElement) => {
    const at = document.createElement('div');
    at.className = 'mark';
    at.style.left = `${x.toFixed(1)}px`;
    at.style.top = `${y.toFixed(1)}px`;
    at.append(el);
    layer.appendChild(at);
    return at;
  };
  const gone = (el: HTMLElement, a: Animation) =>
    (a.onfinish = () => el.remove());

  return {
    /** The cross round the reticle, at `x`, `y`. */
    cross(kind: Kind, x: number, y: number) {
      const s = 72,
        c = s / 2,
        kill = kind === 'kill';
      const ink = kind === 'hit' ? INK.white : kill ? GOLD : AZURE,
        len = kill ? TICK * 1.4 : TICK,
        gap = kind === 'break' ? GAP + 6 : GAP;
      let path = '';
      for (const [dx, dy] of [
        [1, 1],
        [1, -1],
        [-1, 1],
        [-1, -1],
      ]) {
        if (kind === 'shield' || kind === 'break') {
          // brackets: a corner at each diagonal
          const ox = c + dx * (gap + 4),
            oy = c + dy * (gap + 4);
          path += `M${ox} ${oy - dy * len * 0.7}L${ox} ${oy}L${ox - dx * len * 0.7} ${oy}`;
        } else
          path += `M${c + dx * gap * 0.7} ${c + dy * gap * 0.7}L${c + dx * (gap + len) * 0.7} ${c + dy * (gap + len) * 0.7}`;
      }
      let body =
        `<path d="${path}" fill="none" stroke="${INK.iron}" stroke-width="${WIDE + 2.4}" stroke-linecap="round" opacity=".55"/>` +
        `<path d="${path}" fill="none" stroke="${ink}" stroke-width="${WIDE}" stroke-linecap="round"/>`;
      if (kill)
        body += `<circle cx="${c}" cy="${c}" r="${gap + len}" fill="none" stroke="${GOLD}" stroke-width="2" opacity=".8"/>`;
      if (kind === 'break') {
        for (let i = 0; i < 10; i++) {
          const a = (i / 10) * Math.PI * 2 + 0.3,
            r = gap + len;
          body += `<path d="M${c + Math.cos(a) * r} ${c + Math.sin(a) * r}l${Math.cos(a) * 5} ${Math.sin(a) * 5}" stroke="${AZURE}" stroke-width="2" stroke-linecap="round"/>`;
        }
      }
      const drawn = svgNode(s, s, body),
        life = (kill ? MARK.kill : kind === 'break' ? 0.6 : MARK.cross) * 1000;
      gone(
        placed(x, y, drawn),
        drawn.animate(
          kill
            ? [
                { transform: 'scale(1.6) rotate(0deg)', opacity: 1 },
                {
                  transform: 'scale(1) rotate(45deg)',
                  opacity: 1,
                  offset: 0.3,
                },
                { transform: 'scale(1) rotate(45deg)', opacity: 0 },
              ]
            : [
                { transform: `scale(${POP})`, opacity: 1 },
                { transform: 'scale(1)', opacity: 1, offset: 0.35 },
                {
                  transform: kind === 'break' ? 'scale(1.5)' : 'scale(1)',
                  opacity: 0,
                },
              ],
          { duration: life, easing: 'cubic-bezier(.2,.8,.3,1)' }
        )
      );
    },
    /** The figure for `points` off `ship` (`shield` all of it off her shield; `kill` her last), rising from `x`, `y`. */
    figure(
      ship: number,
      points: number,
      shield: boolean,
      kill: boolean,
      x: number,
      y: number
    ) {
      const t = now(),
        same = figures.find((f) => f.ship === ship && t - f.last < MERGE);
      const total = Math.round((same?.total ?? 0) + points);
      if (total <= 0) return;
      if (same) same.el.remove();
      figures = figures
        .filter((f) => f !== same && f.el.isConnected)
        .slice(-(MOST - 1));
      const last = kill || !!same?.kill,
        size = figureSize(total, last),
        fill = last ? GOLD : shield ? AZURE : INK.rubric;
      const text = document.createElement('div');
      text.textContent = String(total);
      text.style.cssText =
        `font:italic 700 ${size.toFixed(0)}px ${FIGURES};color:${fill};` +
        `-webkit-text-stroke:${(size / 9).toFixed(1)}px ${INK.iron};paint-order:stroke;white-space:nowrap`;
      const el = placed(x, y, text);
      figures.push({ ship, total, last: t, el, kill: last });
      // rising from its place (the mark centres it there), drifting aside
      const drift = (ship % 2 ? 1 : -1) * 10;
      gone(
        el,
        text.animate(
          [
            { transform: 'translateY(0) scale(1.35)', opacity: 1 },
            {
              transform: 'translateY(-40%) scale(1)',
              opacity: 1,
              offset: 0.25,
            },
            { transform: `translate(${drift}px,-210%) scale(.9)`, opacity: 0 },
          ],
          {
            duration: MARK.figure * 1000 * (last ? 1.4 : 1),
            easing: 'ease-out',
          }
        )
      );
    },
    /** A blow on her from a ship at `bearing` (radians clockwise from ahead), felt `weight` (player.ts felt): its
     *  sector of the ring lit, held and fading (a blow again on it lights it afresh). */
    struck(bearing: number, weight: number) {
      const i = sectorOf(bearing),
        { frames, ms } = glow(weight);
      lighting[i]?.cancel();
      const a = lit[i].animate(frames, { duration: ms, easing: 'linear' });
      lighting[i] = a;
      a.onfinish = () => {
        if (lighting[i] === a) lighting[i] = null;
      };
    },
    /** The ring shown, or not (she is watching another ship, or arriving). */
    show(on: boolean) {
      if (on === showing) return;
      showing = on;
      ringAt.style.display = on ? '' : 'none';
    },
    /** Every mark taken off, the ring dark (a new match, or she is watching another ship). */
    clear() {
      layer.replaceChildren();
      figures = [];
      for (let i = 0; i < lighting.length; i++) {
        lighting[i]?.cancel();
        lighting[i] = null;
      }
    },
  };
}

// The marks of a blow, laid on the HUD: a cross, figures and arcs.
//   cross    her ball home: four ticks round the reticle in the middle of the screen, popping out and gone in a
//            moment; white on a hull, azure brackets on a shield, the brackets thrown wide with shards where it
//            broke; a gold cross turned a quarter and ringed where she sank the ship
//   figure   the hit points the blow took, a numeral rising from the struck ship and fading: rubric off a hull, azure
//            off a shield; blows on one ship close together summed in one figure; gold and bigger for the last
//   edge     a blow on her from a ship off the screen or behind her: a rubric arc at the screen's edge toward it
//            (azure on her shield), as heavy as the blow, held and fading over 2 s
// No words; numerals only. Its own layer, over the world and under the HUD's
// pieces; it runs on the page's clock.

import { FIGURES, INK, LIGHT, svgNode } from './ink.ts';

/**
 * How long each lasts, s; how close together blows on one ship sum, s; the most
 * figures and arcs at once.
 */
const MARK = { cross: 0.28, kill: 0.8, figure: 0.9, arc: 2 } as const;
const MERGE = 0.35,
  MOST = 12,
  ARCS = 6;
/**
 * The cross's ticks: length, width and gap from the middle (px), and its pop.
 */
const TICK = 13,
  WIDE = 3.5,
  GAP = 8,
  POP = 1.55;
/**
 * The arc at the screen's edge: how far in from it (px at the drawn size), its
 * half-angle (radians: the least, and more by the blow's weight), its width at
 * the middle (px at the drawn size, the same), and the steps it is drawn in.
 */
const EDGE = { inset: 14, half: [0.06, 0.1], wide: [6, 9], steps: 16 } as const;
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
 * Where a blow from `bearing` (radians clockwise from ahead) shows on a `w` ×
 * `h` screen: where the line from its middle that way meets the edge, `inset`
 * px in from it (ahead at the top, behind at the foot).
 */
export function edgeAt(bearing: number, w: number, h: number, inset: number) {
  const dx = Math.sin(bearing),
    dy = -Math.cos(bearing),
    hx = w / 2 - inset,
    hy = h / 2 - inset;
  const t = Math.min(
    Math.abs(dx) > 1e-9 ? hx / Math.abs(dx) : Infinity,
    Math.abs(dy) > 1e-9 ? hy / Math.abs(dy) : Infinity
  );
  return { x: w / 2 + dx * t, y: h / 2 + dy * t };
}

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
  let arcs = 0;

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
    /** A blow on her from a ship off the screen or behind her, at `bearing` (radians clockwise from ahead), felt
     *  `weight` (player.ts felt), on a `w` × `h` screen whose UI's size is `k` (ui.ts size); `shield` azure. */
    edge(
      bearing: number,
      weight: number,
      w: number,
      h: number,
      k: number,
      shield: boolean
    ) {
      if (arcs >= ARCS) return;
      // a stretch of the circle about the middle through where the bearing meets the screen's edge
      const cx = w / 2,
        cy = h / 2,
        p = edgeAt(bearing, w, h, EDGE.inset * k),
        r = Math.hypot(p.x - cx, p.y - cy),
        half = EDGE.half[0] + EDGE.half[1] * weight,
        wide = (EDGE.wide[0] + EDGE.wide[1] * weight) * k;
      // a crescent: the circle along its outside, its inside drawn in by its width at the middle, to points at the ends
      const at = (a: number, at: number) =>
        `${(cx + Math.sin(a) * at).toFixed(1)} ${(cy - Math.cos(a) * at).toFixed(1)}`;
      let d = `M${at(bearing - half, r)}`;
      for (let i = 1; i <= EDGE.steps; i++)
        d += `L${at(bearing - half + (2 * half * i) / EDGE.steps, r)}`;
      for (let i = EDGE.steps - 1; i > 0; i--) {
        const s = i / EDGE.steps;
        d += `L${at(bearing - half + 2 * half * s, r - wide * Math.sin(Math.PI * s))}`;
      }
      d += 'Z';
      const ink = shield ? AZURE : INK.rubric;
      const drawn = svgNode(
        w,
        h,
        `<path d="${d}" fill="${ink}" stroke="${INK.iron}" stroke-width="${(1.6 * k).toFixed(1)}" stroke-linejoin="round" stroke-opacity=".6"/>`
      );
      drawn.style.cssText = 'position:absolute;left:0;top:0';
      drawn.style.transformOrigin = `${cx}px ${cy}px`;
      layer.appendChild(drawn);
      arcs++;
      const a = drawn.animate(
        [
          { opacity: 1, transform: 'scale(0.97)' },
          { opacity: 1, transform: 'scale(1)', offset: 0.08 },
          { opacity: 0.85, offset: 0.35 },
          { opacity: 0, transform: 'scale(1)' },
        ],
        { duration: MARK.arc * 1000, easing: 'ease-in' }
      );
      a.onfinish = () => {
        drawn.remove();
        arcs--;
      };
    },
    /** Every mark taken off (a new match, or she is watching another ship). */
    clear() {
      layer.replaceChildren();
      figures = [];
      arcs = 0;
    },
  };
}

// The teaching scraps (issue #54): the first time a mechanic matters a drawn scrap pins to the edge of the screen for a
// few seconds and dries out, and src/app/tips.ts remembers it for the career. Each is a slip of paper in the instruments'
// hand with its lesson cut on it and not a word: a dotted course through the wind for a ship in irons, a hull and a shot
// at the first fight, the spiral with a hand tracing it when the Storm first closes. The hand at DIVE on the first drop
// is pinned by the Gale's own screen, from the pieces here. A scrap is drawn and no more: it is no pressable, so the sea
// and the controls under it feel nothing, and nothing in play waits on it.
import { drawSprite, dryAlpha, ease, hand, prims, woodcut, type Box, type ChartLayer, type Pen, type Pts, type Sprite } from '../chart/index.ts';
import { smooth } from '../chart/noise.ts';
import { ball, px, py } from '../icons/draw.ts';
import { stormSpiral } from '../icons/sets/hud.ts';
import { paper, slipPath } from './instruments.ts';

export type ScrapId = 'wind' | 'fight' | 'closing';

/** Seconds: a scrap inking in, when it starts to dry, and how long the drying takes. */
export const SCRAP = { ink: 0.5, stand: 5.5, dry: 0.9 } as const;
/** Seconds a scrap is up, from going up to gone. */
export const SCRAP_TOTAL = SCRAP.stand + SCRAP.dry;
/** How much of a scrap shows `s` seconds after it went up. */
export const scrapAlpha = (s: number): number => (s < SCRAP.ink ? ease.out(s / SCRAP.ink) : s < SCRAP.stand ? 1 : dryAlpha((s - SCRAP.stand) / SCRAP.dry));

/** Room round a slip for its shadow. */
const PAD = 14;
/** The spiral's own measures on its 24-unit grid (src/icons/sets/hud.ts), for the finger to follow it. */
const SPIRAL = { r0: 10.6, r1: 1.6, turns: 2.5, a0: -90 } as const;
/** Seconds: the first tracing's wait after the scrap goes up, one tracing, the rest before the next. */
const TRACE = { lead: 0.7, pass: 2.4, rest: 0.5 } as const;

/** The pointing hand baked with its fingertip at the anchor, pointing along +x: drawSprite's `rot` turns it where wanted. */
export function handSprite(layer: ChartLayer, size: number): Sprite {
  const w = Math.ceil(size * 1.12), h = Math.ceil(size * 0.66), tip = w - Math.ceil(size * 0.06);
  return layer.sprite(`scrap|hand|${size}`, w, h, tip, h / 2, (p) => hand(p, tip, h / 2, size));
}

/** A bare slip for a hand to rest on: the Gale's, and what every scrap's drawing lies on. */
export function slipSprite(layer: ChartLayer, name: string, w: number, h: number, seed: number, draw?: (p: Pen, cx: number, cy: number) => void): Sprite {
  const W = w + PAD * 2, H = h + PAD * 2, cx = W / 2, cy = H / 2;
  return layer.sprite(`scrap|${name}|${w}|${h}`, W, H, cx, cy, (p) => {
    paper(p, slipPath(cx, cy, w, h, seed), { burn: 5 });
    // the pin that holds it to the edge, with its glint
    const x = cx - w / 2 + 10, y = cy - h / 2 + 10;
    p.dot(x, y, 3.2, 'iron');
    p.dot(x - 1, y - 1, 1.1, 'white', 0.85);
    draw?.(p, cx, cy);
  });
}

/** A dotted red line, as the chart draws a course. */
const dotted = (p: Pen, pts: Pts, gap: number, seed: number) => p.rule([pts], { w: 2.6, ink: 'rubric', alpha: 0.95, wobble: 0.2, seed }, 1, [0, gap]);

/** A ship head to wind and the way out of it: the wind blowing down the slip, her course tacking up through it. */
function windCut(p: Pen, cx: number, cy: number, h: number): void {
  const u = h / 132, size = Math.round(46 * u), wy = cy - h * 0.3, sy = cy + h * 0.31, g = p.g;
  g.save();
  g.translate(cx, wy);
  g.rotate(Math.PI / 2);
  woodcut(p, prims('hud.gust'), 0, 0, size);
  g.restore();
  woodcut(p, prims('hud.shipsLeft'), cx, sy, size);
  const bottom = sy - size * 0.5, top = wy + size * 0.56, dx = 44 * u, leg = (bottom - top) / 3;
  const course: Pts = [cx, bottom, cx + dx, bottom - leg, cx - dx, bottom - 2 * leg, cx, top];
  dotted(p, course, 8 * u, 71);
  // its head, up into the wind
  const a = Math.atan2(top - (bottom - 2 * leg), dx), L = 11 * u;
  p.rule([[cx - Math.cos(a - 0.5) * L, top - Math.sin(a - 0.5) * L, cx, top, cx - Math.cos(a + 0.5) * L, top - Math.sin(a + 0.5) * L]], { w: 'bold', ink: 'rubric', alpha: 0.95, wobble: 0.15, seed: 72 });
}

/** A hull and the shot flying at it, its dotted arc coming in from the left. */
function fightCut(p: Pen, cx: number, cy: number, w: number, h: number): void {
  const u = h / 132, hull = Math.round(92 * u), shot = Math.round(40 * u), hx = cx + w * 0.2, sx = cx - w * 0.33;
  woodcut(p, prims('hud.hull'), hx, cy + h * 0.1, hull);
  woodcut(p, ball(12, 12, 8), sx, cy + h * 0.06, shot);
  const x0 = sx + shot * 0.42, y0 = cy - h * 0.02, x1 = hx - hull * 0.42, y1 = cy + h * 0.06, top = cy - h * 0.34, pts: Pts = [];
  for (let i = 0; i <= 16; i++) {
    const t = i / 16, q = 1 - t;
    pts.push(q * q * x0 + 2 * q * t * ((x0 + x1) / 2) + t * t * x1, q * q * y0 + 2 * q * t * top + t * t * y1);
  }
  dotted(p, pts, 7 * u, 73);
}

/** The spiral, for a hand to trace. */
function closingCut(p: Pen, cx: number, cy: number, h: number): void {
  woodcut(p, stormSpiral(SPIRAL.turns), cx, cy, Math.round(h * 0.82));
}

/** A hand's fingertip tracing the spiral inward, over and over, its body lying off to the lower right. */
function traceHand(g: CanvasRenderingContext2D, layer: ChartLayer, b: Box, s: number, a: number): void {
  const since = s - TRACE.lead;
  if (since <= 0) return;
  const cycle = TRACE.pass + TRACE.rest, into = since % cycle, u = smooth(0, 1, Math.min(1, into / TRACE.pass));
  const size = Math.round(b.h * 0.82), k = size / 24, r = SPIRAL.r0 + (SPIRAL.r1 - SPIRAL.r0) * u, ang = SPIRAL.a0 + u * SPIRAL.turns * 360;
  const x = b.x + (px(12, r, ang) - 12) * k, y = b.y + (py(12, r, ang) - 12) * k;
  drawSprite(g, handSprite(layer, Math.round(b.h * 0.44)), x, y, { rot: -Math.PI * 0.75, alpha: a * Math.min(1, since / 0.3) });
}

/** Draws scrap `id` in its box `s` seconds after it went up, at `a` of its full ink: its slip baked once, the tracing hand
 *  the only thing moving. */
export function drawScrap(g: CanvasRenderingContext2D, layer: ChartLayer, id: ScrapId, b: Box, s: number, a: number): void {
  const sprite = slipSprite(layer, id, b.w, b.h, id.length * 7, (p, cx, cy) => {
    if (id === 'wind') windCut(p, cx, cy, b.h);
    else if (id === 'fight') fightCut(p, cx, cy, b.w, b.h);
    else closingCut(p, cx, cy, b.h);
  });
  drawSprite(g, sprite, b.x, b.y, { alpha: a });
  if (id === 'closing') traceHand(g, layer, b, s, a);
}

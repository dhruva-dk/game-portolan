// Turns a list of prims into SVG markup. A glyph draws its prims in the ink colour, with its cuts as a mask; an
// outlined glyph first draws every prim again, fattened, in the outline colour, so the cuts read as ink lines on a
// light glyph (the sticker look used over the sea and inside frames). Ids for masks and gradients are unique per call.
import { f, type Colour, type Grad, type Prim } from './draw.ts';

let next = 0;

/** Collects the <defs> one icon needs, with ids no other icon on the page shares. */
export class Defs {
  private readonly base = 'pi' + (next++).toString(36);
  private n = 0;
  private readonly out: string[] = [];

  id(): string {
    return `${this.base}-${this.n++}`;
  }

  add(markup: string): void {
    this.out.push(markup);
  }

  grad(g: Grad): string {
    const id = this.id(), k = g.stops.length - 1;
    const stops = g.stops.map((c, i) => `<stop offset="${f(k ? i / k : 0)}" stop-color="${c}"/>`).join('');
    this.out.push(
      `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${f(g.x1 ?? 0)}" y1="${f(g.y1 ?? 2)}" x2="${f(g.x2 ?? 0)}" y2="${f(g.y2 ?? 22)}">${stops}</linearGradient>`,
    );
    return `url(#${id})`;
  }

  radial(cx: number, cy: number, r: number, stops: readonly [number, string, number][]): string {
    const id = this.id();
    const s = stops.map(([o, c, a]) => `<stop offset="${f(o)}" stop-color="${c}" stop-opacity="${f(a)}"/>`).join('');
    this.out.push(`<radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}">${s}</radialGradient>`);
    return `url(#${id})`;
  }

  colour(c: Colour): string {
    return typeof c === 'string' ? c : this.grad(c);
  }

  mask(cuts: readonly Prim[]): string {
    const id = this.id();
    this.out.push(
      `<mask id="${id}" maskUnits="userSpaceOnUse" x="-6" y="-6" width="36" height="36">` +
        `<rect x="-6" y="-6" width="36" height="36" fill="#fff"/>${cuts.map((p) => prim(p, '#000')).join('')}</mask>`,
    );
    return id;
  }

  clip(d: string): string {
    const id = this.id();
    this.out.push(`<clipPath id="${id}"><path d="${d}"/></clipPath>`);
    return id;
  }

  markup(): string {
    return this.out.length ? `<defs>${this.out.join('')}</defs>` : '';
  }
}

/** One prim as a <path>. grow fattens it by that much on every side (for outlines); rim strokes a filled prim. */
export function prim(p: Prim, colour: string, grow = 0, rim?: string, rw = 0): string {
  let a = `d="${p.d}"`;
  if (p.k === 'f') {
    a += ` fill="${colour}"`;
    if (grow > 0) a += ` stroke="${colour}" stroke-width="${f(grow * 2)}" stroke-linejoin="round"`;
    else if (rim) a += ` stroke="${rim}" stroke-width="${f(rw)}" stroke-linejoin="round"`;
    if (p.evenodd) a += ' fill-rule="evenodd"';
  } else {
    a += ` fill="none" stroke="${colour}" stroke-width="${f((p.w ?? 2) + grow * 2)}" stroke-linecap="${p.cap ?? 'round'}" stroke-linejoin="round"`;
    if (p.dash && grow === 0) a += ` stroke-dasharray="${p.dash}"`;
  }
  if (p.op !== undefined) a += ` opacity="${f(p.op)}"`;
  if (p.tr) a += ` transform="${p.tr}"`;
  return `<path ${a}/>`;
}

export interface Paint {
  /** The ink colour of the glyph. */
  ink: string;
  /** The colour of prims marked tint. */
  tint: string;
  /** Draw full-colour prims in the ink too. */
  mono: boolean;
  /** Show fine detail (large sizes) instead of the bold stand-ins. */
  fine: boolean;
  /** Outline colour and how far it reaches past the glyph, in grid units. */
  outline?: { colour: string; w: number };
  /** A soft drop shadow under the outline, as an offset in grid units. */
  shadow?: number;
}

/** Draws a glyph's prims; the caller wraps it in an <svg> or a frame. */
export function glyph(prims: readonly Prim[], paint: Paint, defs: Defs): string {
  const shown = prims
    .filter((p) => (p.fine ? paint.fine : p.bold ? !paint.fine : true))
    .map((p) => (p.knock && paint.mono ? { ...p, cut: true, top: false } : p));
  const cuts = shown.filter((p) => p.cut);
  const body = shown.filter((p) => !p.cut && !p.top);
  const top = shown.filter((p) => !p.cut && p.top);
  const solid = [...body, ...top].filter((p) => (p.op ?? 1) > 0.6);
  const colour = (p: Prim): string => (p.col && !paint.mono ? defs.colour(p.col) : p.tint ? paint.tint : paint.ink);
  const draw = (p: Prim): string =>
    p.rim && !paint.mono ? prim(p, colour(p), 0, defs.colour(p.rim), p.rw ?? 0.8) : prim(p, colour(p));

  let out = '';
  const o = paint.outline;
  if (o) {
    const ring = solid.map((p) => prim({ ...p, op: undefined }, o.colour, o.w)).join('');
    if (paint.shadow) out += `<g transform="translate(0 ${f(paint.shadow)})" opacity="0.4">${ring}</g>`;
    out += ring;
  }
  let main = body.map(draw).join('');
  if (cuts.length && main) main = `<g mask="url(#${defs.mask(cuts)})">${main}</g>`;
  return out + main + top.map(draw).join('');
}

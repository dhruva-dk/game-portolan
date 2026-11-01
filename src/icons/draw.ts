// Drawing primitives for the icon set. Every icon is drawn on a 24-unit grid as a list of prims: filled shapes and
// stroked lines in the ink colour, cuts that knock holes through them, and a few that show only at large sizes.
// The helpers below return SVG path data, so an icon reads as a short list of shapes.

/** A linear gradient, top to bottom unless the ends are given (in grid units). */
export interface Grad {
  stops: readonly string[];
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
}

export type Colour = string | Grad;

export interface Prim {
  /** 'f' fills the path, 's' strokes it with round ends. */
  k: 'f' | 's';
  d: string;
  /** Stroke width, in grid units. */
  w?: number;
  /** Knocks the shape out of every non-top prim instead of drawing it. */
  cut?: boolean;
  /** Drawn above the cuts, so a cut ring can frame it. */
  top?: boolean;
  /** Drawn in the tint colour when the icon is tinted. */
  tint?: boolean;
  /** Only at large sizes (about 40 px and up). */
  fine?: boolean;
  /** Only at small sizes: a bolder stand-in for fine detail. */
  bold?: boolean;
  /** A fixed colour, for full-colour icons such as the rank insignia. Mono rendering ignores it. */
  col?: Colour;
  /** Stroke colour for a filled prim of a full-colour icon (a rim). */
  rim?: Colour;
  /** Rim width. */
  rw?: number;
  /** In mono rendering this prim is cut out instead of drawn: a coloured emblem or rim becomes a knocked-out line. */
  knock?: boolean;
  op?: number;
  tr?: string;
  dash?: string;
  evenodd?: boolean;
  cap?: 'round' | 'butt';
}

type Opt = Omit<Partial<Prim>, 'k' | 'd'>;

export const fill = (d: string, o: Opt = {}): Prim => ({ k: 'f', d, ...o });
export const line = (d: string, w = 2, o: Opt = {}): Prim => ({ k: 's', d, w, ...o });
export const cut = (d: string, o: Opt = {}): Prim => ({ k: 'f', d, cut: true, ...o });
export const cutLine = (d: string, w = 1.2, o: Opt = {}): Prim => ({ k: 's', d, w, cut: true, ...o });

/** Adds the same options to a list of prims (a transform for a group, say). */
export const all = (prims: readonly Prim[], o: Opt): Prim[] =>
  prims.map((p) => ({ ...p, ...o, tr: o.tr && p.tr ? `${o.tr} ${p.tr}` : (o.tr ?? p.tr) }));

// ---------------------------------------------------------------- numbers and points

export const f = (v: number): string => {
  const r = Math.round(v * 100) / 100;
  return Object.is(r, -0) ? '0' : String(r);
};

const DEG = Math.PI / 180;
export const px = (cx: number, r: number, a: number): number => cx + r * Math.cos(a * DEG);
export const py = (cy: number, r: number, a: number): number => cy + r * Math.sin(a * DEG);

// ---------------------------------------------------------------- shapes (angles in degrees, 0 is +x, 90 is down)

/** A circle; ccw winds it the other way, to punch a hole in a nonzero fill. */
export const circle = (cx: number, cy: number, r: number, ccw = false): string => {
  const s = ccw ? 0 : 1;
  return `M${f(cx - r)} ${f(cy)}a${f(r)} ${f(r)} 0 1 ${s} ${f(2 * r)} 0a${f(r)} ${f(r)} 0 1 ${s} ${f(-2 * r)} 0Z`;
};

export const ellipse = (cx: number, cy: number, rx: number, ry: number, ccw = false): string => {
  const s = ccw ? 0 : 1;
  return `M${f(cx - rx)} ${f(cy)}a${f(rx)} ${f(ry)} 0 1 ${s} ${f(2 * rx)} 0a${f(rx)} ${f(ry)} 0 1 ${s} ${f(-2 * rx)} 0Z`;
};

/** A donut, for a nonzero fill. */
export const ring = (cx: number, cy: number, r1: number, r2: number): string => circle(cx, cy, r1) + circle(cx, cy, r2, true);

export const rect = (x: number, y: number, w: number, h: number, r = 0): string => {
  if (r <= 0) return `M${f(x)} ${f(y)}h${f(w)}v${f(h)}h${f(-w)}Z`;
  r = Math.min(r, w / 2, h / 2);
  return (
    `M${f(x + r)} ${f(y)}h${f(w - 2 * r)}a${f(r)} ${f(r)} 0 0 1 ${f(r)} ${f(r)}v${f(h - 2 * r)}` +
    `a${f(r)} ${f(r)} 0 0 1 ${f(-r)} ${f(r)}h${f(2 * r - w)}a${f(r)} ${f(r)} 0 0 1 ${f(-r)} ${f(-r)}v${f(2 * r - h)}` +
    `a${f(r)} ${f(r)} 0 0 1 ${f(r)} ${f(-r)}Z`
  );
};

/** A closed polygon through x,y pairs. */
export const poly = (...p: number[]): string => {
  let d = '';
  for (let i = 0; i < p.length; i += 2) d += (i ? 'L' : 'M') + f(p[i]) + ' ' + f(p[i + 1]);
  return d + 'Z';
};

/** An open polyline through x,y pairs. */
export const path = (...p: number[]): string => poly(...p).slice(0, -1);

/** A star with n points between radii ro and ri, the first point at angle a. */
export const star = (cx: number, cy: number, n: number, ro: number, ri: number, a = -90): string => {
  const p: number[] = [];
  for (let i = 0; i < 2 * n; i++) {
    const r = i % 2 ? ri : ro, t = a + (i * 180) / n;
    p.push(px(cx, r, t), py(cy, r, t));
  }
  return poly(...p);
};

/** A regular polygon. */
export const regular = (cx: number, cy: number, n: number, r: number, a = -90): string => {
  const p: number[] = [];
  for (let i = 0; i < n; i++) p.push(px(cx, r, a + (i * 360) / n), py(cy, r, a + (i * 360) / n));
  return poly(...p);
};

/** A four-point sparkle with curved sides. */
export const sparkle = (cx: number, cy: number, r: number, waist = 0.18): string => {
  const k = r * waist;
  return (
    `M${f(cx)} ${f(cy - r)}Q${f(cx + k)} ${f(cy - k)} ${f(cx + r)} ${f(cy)}Q${f(cx + k)} ${f(cy + k)} ${f(cx)} ${f(cy + r)}` +
    `Q${f(cx - k)} ${f(cy + k)} ${f(cx - r)} ${f(cy)}Q${f(cx - k)} ${f(cy - k)} ${f(cx)} ${f(cy - r)}Z`
  );
};

/** An open arc from angle a0 to a1, clockwise on screen when a1 > a0. */
export const arc = (cx: number, cy: number, r: number, a0: number, a1: number): string => {
  const large = Math.abs(a1 - a0) > 180 ? 1 : 0, sweep = a1 > a0 ? 1 : 0;
  return `M${f(px(cx, r, a0))} ${f(py(cy, r, a0))}A${f(r)} ${f(r)} 0 ${large} ${sweep} ${f(px(cx, r, a1))} ${f(py(cy, r, a1))}`;
};

/** A filled wedge (pie slice) from a0 to a1. */
export const wedge = (cx: number, cy: number, r: number, a0: number, a1: number): string =>
  `M${f(cx)} ${f(cy)}L${arc(cx, cy, r, a0, a1).slice(1)}Z`;

/** A triangle arrowhead with its tip at x,y, pointing along angle a. */
export const head = (x: number, y: number, a: number, len = 4.4, half = 3): string => {
  const bx = px(x, -len, a), by = py(y, -len, a);
  return poly(x, y, px(bx, half, a + 90), py(by, half, a + 90), px(bx, half, a - 90), py(by, half, a - 90));
};

/** An arc with an arrowhead at its end, for reload and recharge rings. The head's base sits on the arc's end. */
export const arcArrow = (cx: number, cy: number, r: number, a0: number, a1: number, w: number, o: Opt = {}): Prim[] => {
  const dir = a1 > a0 ? 1 : -1, hl = w * 2.1, hw = w * 1.55;
  const bx = px(cx, r, a1), by = py(cy, r, a1);
  const ta = a1 + (hl / r) * (180 / Math.PI) * dir, tx = px(cx, r, ta), ty = py(cy, r, ta);
  const ang = Math.atan2(ty - by, tx - bx) / DEG;
  const head = poly(tx, ty, px(bx, hw, ang + 90), py(by, hw, ang + 90), px(bx, hw, ang - 90), py(by, hw, ang - 90));
  return [line(arc(cx, cy, r, a0, a1 - dir * ((w * 0.5) / r) * (180 / Math.PI)), w, o), fill(head, o)];
};

/** A leaf or blade from x,y out along angle a: len long, wid wide at its middle. */
export const leaf = (x: number, y: number, a: number, len: number, wid: number): string => {
  const tx = px(x, len, a), ty = py(y, len, a), mx = px(x, len * 0.5, a), my = py(y, len * 0.5, a);
  return `M${f(x)} ${f(y)}Q${f(px(mx, wid, a + 90))} ${f(py(my, wid, a + 90))} ${f(tx)} ${f(ty)}Q${f(px(mx, wid, a - 90))} ${f(py(my, wid, a - 90))} ${f(x)} ${f(y)}Z`;
};

/** A smooth wave from x0 to x1 about y, with n crests. */
export const wave = (x0: number, x1: number, y: number, amp: number, n: number): string => {
  const step = (x1 - x0) / (n * 2), k = step * 0.5;
  let d = `M${f(x0)} ${f(y)}`;
  for (let i = 0; i < n * 2; i++) {
    const a = x0 + i * step, s = i % 2 ? amp : -amp;
    d += `C${f(a + k)} ${f(y + s)} ${f(a + step - k)} ${f(y + s)} ${f(a + step)} ${f(y)}`;
  }
  return d;
};

/** A plus sign as one filled outline: arm length l from the centre, thickness t. */
export const plus = (cx: number, cy: number, l: number, t: number): string => {
  const h = t / 2;
  return poly(
    cx - h, cy - l, cx + h, cy - l, cx + h, cy - h, cx + l, cy - h, cx + l, cy + h, cx + h, cy + h,
    cx + h, cy + l, cx - h, cy + l, cx - h, cy + h, cx - l, cy + h, cx - l, cy - h, cx - h, cy - h,
  );
};

/** A heater shield, w wide and h tall, centred on cx,cy. */
export const shield = (cx: number, cy: number, w: number, h: number): string => {
  const x0 = cx - w / 2, x1 = cx + w / 2, y0 = cy - h / 2, y1 = cy + h / 2;
  return (
    `M${f(x0)} ${f(y0 + h * 0.1)}Q${f(cx)} ${f(y0 - h * 0.06)} ${f(x1)} ${f(y0 + h * 0.1)}` +
    `V${f(y0 + h * 0.48)}C${f(x1)} ${f(y0 + h * 0.76)} ${f(cx + w * 0.22)} ${f(y1 - h * 0.06)} ${f(cx)} ${f(y1)}` +
    `C${f(cx - w * 0.22)} ${f(y1 - h * 0.06)} ${f(x0)} ${f(y0 + h * 0.76)} ${f(x0)} ${f(y0 + h * 0.48)}Z`
  );
};

/** A lightning bolt in a box w by h, top-left at x,y. */
export const bolt = (x: number, y: number, w: number, h: number): string =>
  poly(x + w * 0.62, y, x + w * 0.08, y + h * 0.56, x + w * 0.46, y + h * 0.56, x + w * 0.3, y + h, x + w * 0.92, y + h * 0.4,
    x + w * 0.54, y + h * 0.4, x + w * 0.78, y);

/** A flame tongue standing on cx, base at y, h tall. */
export const flame = (cx: number, y: number, w: number, h: number): string =>
  `M${f(cx)} ${f(y - h)}C${f(cx + w * 0.18)} ${f(y - h * 0.7)} ${f(cx + w * 0.5)} ${f(y - h * 0.52)} ${f(cx + w * 0.5)} ${f(y - h * 0.26)}` +
  `C${f(cx + w * 0.5)} ${f(y - h * 0.08)} ${f(cx + w * 0.28)} ${f(y)} ${f(cx)} ${f(y)}` +
  `C${f(cx - w * 0.28)} ${f(y)} ${f(cx - w * 0.5)} ${f(y - h * 0.08)} ${f(cx - w * 0.5)} ${f(y - h * 0.26)}` +
  `C${f(cx - w * 0.5)} ${f(y - h * 0.5)} ${f(cx - w * 0.2)} ${f(y - h * 0.62)} ${f(cx)} ${f(y - h)}Z`;

/** A gear with n teeth. */
export const gear = (cx: number, cy: number, n: number, ro: number, ri: number, hole: number): string => {
  const p: number[] = [], tooth = 360 / n;
  for (let i = 0; i < n; i++) {
    const a = -90 + i * tooth;
    for (const [r, da] of [[ri, -0.5], [ro, -0.3], [ro, 0.06], [ri, 0.24]] as const) p.push(px(cx, r, a + da * tooth), py(cy, r, a + da * tooth));
  }
  return poly(...p) + circle(cx, cy, hole, true);
};

// ---------------------------------------------------------------- recurring things

/** The gull in flight, wings in an M, spanning about 21.6 units, centred on cx,cy. */
export const gull = (cx: number, cy: number, s = 1): string => {
  const x = (v: number) => f(cx + v * s), y = (v: number) => f(cy + v * s);
  return (
    `M${x(0)} ${y(-0.6)}C${x(-1.6)} ${y(-3.6)} ${x(-3.6)} ${y(-4.8)} ${x(-5.6)} ${y(-4.8)}` +
    `C${x(-7.8)} ${y(-4.8)} ${x(-9.6)} ${y(-3)} ${x(-10.8)} ${y(-0.2)}` +
    `C${x(-8.8)} ${y(-1.8)} ${x(-7)} ${y(-2)} ${x(-5.6)} ${y(-1.6)}` +
    `C${x(-3.6)} ${y(-1)} ${x(-1.8)} ${y(0.8)} ${x(0)} ${y(3)}` +
    `C${x(1.8)} ${y(0.8)} ${x(3.6)} ${y(-1)} ${x(5.6)} ${y(-1.6)}` +
    `C${x(7)} ${y(-2)} ${x(8.8)} ${y(-1.8)} ${x(10.8)} ${y(-0.2)}` +
    `C${x(9.6)} ${y(-3)} ${x(7.8)} ${y(-4.8)} ${x(5.6)} ${y(-4.8)}` +
    `C${x(3.6)} ${y(-4.8)} ${x(1.6)} ${y(-3.6)} ${x(0)} ${y(-0.6)}Z`
  );
};

/** A sea chest: domed lid over a box, w wide, h tall, base centred on cx at y. Returns the lid and box as one path. */
export const chest = (cx: number, y: number, w: number, h: number): string => {
  const x0 = cx - w / 2, lid = h * 0.38, r = Math.min(1.2, w * 0.08);
  return (
    rect(x0, y - h + lid, w, h - lid, r) +
    `M${f(x0)} ${f(y - h + lid - 0.01)}V${f(y - h + lid * 0.7)}C${f(x0)} ${f(y - h)} ${f(x0 + w)} ${f(y - h)} ${f(x0 + w)} ${f(y - h + lid * 0.7)}V${f(y - h + lid - 0.01)}Z`
  );
};

/** A small ship in profile, bow to the right: hull, mast and two sails. Base of the hull at y. */
export const ship = (cx: number, y: number, s = 1): Prim[] => {
  const X = (v: number) => f(cx + v * s), Y = (v: number) => f(y + v * s);
  return [
    fill(`M${X(-9.6)} ${Y(-5.6)}H${X(9.6)}L${X(7.4)} ${Y(-1.2)}C${X(7)} ${Y(-0.4)} ${X(6.2)} ${Y(0)} ${X(5.4)} ${Y(0)}H${X(-5.4)}C${X(-6.2)} ${Y(0)} ${X(-7)} ${Y(-0.4)} ${X(-7.4)} ${Y(-1.2)}Z`),
    fill(`M${X(-0.9)} ${Y(-18.6)}V${Y(-6.8)}H${X(-8.4)}C${X(-6.6)} ${Y(-10.6)} ${X(-5.6)} ${Y(-14.6)} ${X(-0.9)} ${Y(-18.6)}Z`),
    fill(`M${X(0.9)} ${Y(-16.4)}C${X(4.6)} ${Y(-13.6)} ${X(6.6)} ${Y(-10.2)} ${X(7.8)} ${Y(-6.8)}H${X(0.9)}Z`),
    fill(`M${X(-0.9)} ${Y(-19.6)}L${X(3)} ${Y(-18.6)}L${X(-0.9)} ${Y(-17.6)}Z`),
  ];
};

/** A cannonball with a glint at large sizes. */
export const ball = (cx: number, cy: number, r: number, o: Opt = {}): Prim[] => [
  fill(circle(cx, cy, r), o),
  cutLine(arc(cx, cy, r * 0.62, 200, 250), Math.max(0.8, r * 0.2), { fine: true }),
];

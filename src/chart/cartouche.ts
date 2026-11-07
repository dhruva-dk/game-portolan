// The cartouche: an oval field in a strapwork frame, as a chartmaker framed a title or a scale, here framing a woodcut
// (an ability) or the career's marks. The strap is a band of paper round the field, its ends rolled into volutes at
// either side, one curling up and one down; a scallop shell crowns it and a leaf hangs below. The strap is washed in
// ochre (or laid in gold leaf for the illuminated one), lined in ink, and hatched on its shadowed side, so the frame
// stands off the sheet. It inks in from the field outward: the oval, the band, the volutes curling out, the shell.
import { clamp, smooth } from './noise.ts';
import { arcPts, cubic, shape, type Pen, type Pts } from './pen.ts';

const TAU = Math.PI * 2;
const span = (t: number, a: number, b: number) => (t >= 1 ? 1 : clamp((t - a) / (b - a)));

export interface CartoucheOptions {
  /** How the strap is laid: ochre wash, or gold leaf. */
  strap?: 'ochre' | 'gold';
  /** A wash over the field. */
  field?: string;
  seed?: number;
}

/** Where a cartouche's field lies, for what goes inside it. */
export interface Field {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}

/** A ribbon along a centreline, its width from w0 to w1: the outline as points. */
function ribbon(mid: Pts, w0: number, w1: number): { outline: Pts; left: Pts; right: Pts } {
  const m = mid.length / 2, left: Pts = [], right: Pts = [];
  for (let i = 0; i < m; i++) {
    const a = Math.max(0, i - 1), b = Math.min(m - 1, i + 1);
    const tx = mid[2 * b] - mid[2 * a], ty = mid[2 * b + 1] - mid[2 * a + 1], tl = Math.hypot(tx, ty) || 1;
    const w = (w0 + (w1 - w0) * (i / (m - 1))) / 2;
    left.push(mid[2 * i] - (ty / tl) * w, mid[2 * i + 1] + (tx / tl) * w);
    right.push(mid[2 * i] + (ty / tl) * w, mid[2 * i + 1] - (tx / tl) * w);
  }
  const outline: Pts = [...left];
  for (let i = m - 1; i >= 0; i--) outline.push(right[2 * i], right[2 * i + 1]);
  outline.push(left[0], left[1]);
  return { outline, left, right };
}

/** A volute's centreline: from (sx, sy) heading along `dir`, curling `turn` (+1 clockwise on screen) into a spiral. */
function volute(sx: number, sy: number, dir: number, size: number, turn: 1 | -1): Pts {
  const out: Pts = [];
  // a short straight lead, then a logarithmic spiral tightening to a quarter of its start
  const lead = size * 0.35;
  out.push(sx, sy, sx + Math.cos(dir) * lead, sy + Math.sin(dir) * lead);
  const R0 = size * 0.42, n = 44, turns = 1.12;
  // the spiral's centre sits to the side the strap turns toward
  const nx = Math.cos(dir + (turn * Math.PI) / 2), ny = Math.sin(dir + (turn * Math.PI) / 2);
  const cx = sx + Math.cos(dir) * lead + nx * R0, cy = sy + Math.sin(dir) * lead + ny * R0;
  const a0 = Math.atan2(-ny, -nx);
  for (let i = 1; i <= n; i++) {
    const u = i / n, a = a0 + turn * u * turns * TAU, r = R0 * Math.exp(-u * 1.05);
    out.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
  return out;
}

/** Draws a cartouche centred at (x, y), w × h; returns its field. `press` sinks and darkens it. */
export function cartouche(pen: Pen, x: number, y: number, w: number, h: number, o: CartoucheOptions = {}, t = 1, press = 0): Field {
  const k = 1 - 0.035 * press;
  w *= k; h *= k; y += 1.2 * press;
  const field: Field = { cx: x, cy: y, rx: w * 0.3, ry: h * 0.31 };
  if (t <= 0) return field;
  const seed = o.seed ?? 17, b = Math.min(w, h) * 0.075;
  const strapWash = o.strap === 'gold' ? null : '#c49a52';
  const lay = (p: Path2D, cx: number, cy: number, r: number, a: number) => {
    pen.paperFill(p, a);
    if (strapWash) pen.wash(p, strapWash, { alpha: 0.55, edge: 0.6, gran: 0.7, shift: [0, 0] }, a);
    else pen.gilt(p, 'gold', cx, cy, r, a);
  };
  pen.mood({ dark: press }, () => {
    const ft = span(t, 0, 0.35), bt = span(t, 0.15, 0.55), vt = span(t, 0.35, 0.85), st = span(t, 0.6, 1);
    // the scrolls behind the band, so the band covers where they meet it
    const ends: { mid: Pts; w0: number; w1: number }[] = [];
    for (const side of [-1, 1]) for (const up of [-1, 1]) {
      const sx = x + side * (field.rx + b * 0.2), sy = y + up * field.ry * 0.5;
      ends.push({ mid: volute(sx, sy, side > 0 ? up * 0.9 : Math.PI - up * 0.9, h * 0.32, (-side * up) as 1 | -1), w0: b * 0.95, w1: b * 0.28 });
    }
    ends.forEach((e, i) => {
      const lt = span(vt, i * 0.12, i * 0.12 + 0.64);
      if (lt <= 0) return;
      const r = ribbon(e.mid, e.w0, e.w1), p = shape(r.outline);
      lay(p, e.mid[0], e.mid[1], h * 0.3, smooth(0.3, 1, lt));
      const xs = e.mid.filter((_, q) => q % 2 === 0), ys = e.mid.filter((_, q) => q % 2 === 1);
      const bx = Math.min(...xs) - b, by = Math.min(...ys) - b, bw = Math.max(...xs) - bx + b, bh = Math.max(...ys) - by + b;
      pen.hatch(p, bx, by + bh * 0.45, bw, bh * 0.6, 0.9, Math.max(1.6, b * 0.32), { alpha: 0.5, seed: seed + i }, lt);
      pen.stroke(r.left, { w: 'fine', nib: 0.3, pool: 0.4, seed: seed + 10 + i }, lt);
      pen.stroke(r.right, { w: 'hair', nib: 0.3, pool: 0.3, seed: seed + 20 + i }, lt);
    });
    // the band round the field
    const outer = new Path2D(), inner = new Path2D();
    outer.ellipse(x, y, field.rx + b, field.ry + b, 0, 0, TAU);
    inner.ellipse(x, y, field.rx, field.ry, 0, 0, TAU);
    const band = new Path2D();
    band.addPath(outer);
    band.addPath(inner);
    if (bt > 0) {
      const g = pen.g;
      g.save();
      const clip = new Path2D();
      clip.rect(x - w, y - h, w * 2, h * 2);
      clip.addPath(inner);
      g.clip(clip, 'evenodd');
      lay(outer, x, y - field.ry, field.rx + b, smooth(0.2, 1, bt));
      pen.hatch(outer, x - field.rx - b, y + field.ry * 0.2, (field.rx + b) * 2, field.ry + b, -0.5, Math.max(1.6, b * 0.3), { alpha: 0.45, seed: seed + 30 }, bt);
      g.restore();
    }
    // the field: bare paper, a faint wash, a double rule inside the band
    if (ft > 0) {
      pen.paperFill(inner, ft);
      if (o.field) pen.wash(inner, o.field, { alpha: 0.35, edge: 0.5, gran: 0.6, shift: [0, 0] }, ft);
    }
    const ellipse = (rx: number, ry: number, tt: number) => {
      const pts: Pts = [];
      const n = 72;
      for (let i = 0; i <= Math.ceil(n * tt); i++) {
        const a = -Math.PI / 2 + (Math.min(i, n * tt) / n) * TAU;
        pts.push(x + Math.cos(a) * rx, y + Math.sin(a) * ry);
      }
      return pts;
    };
    if (ft > 0) {
      pen.stroke(ellipse(field.rx, field.ry, ft), { w: 'fine', nib: 0.2, pool: 0.3, seed: seed + 40 }, 1);
      pen.rule([ellipse(field.rx - b * 0.3, field.ry - b * 0.3, ft)], { w: 'hair', seed: seed + 41 });
    }
    if (bt > 0) pen.stroke(ellipse(field.rx + b, field.ry + b, bt), { w: 'fine', nib: 0.2, pool: 0.4, seed: seed + 42 }, 1);
    // the shell that crowns it, ribbed, and the leaf that hangs below
    if (st > 0) {
      const sx = x, sy = y - field.ry - b * 0.6, sr = Math.min(w * 0.12, h * 0.2);
      const fan: Pts = [sx, sy];
      for (let i = 0; i <= 18; i++) {
        const a = Math.PI + (i / 18) * Math.PI, rr = sr * (1 + 0.08 * Math.cos(i * Math.PI));
        fan.push(sx + Math.cos(a) * rr, sy + Math.sin(a) * rr * 0.85);
      }
      fan.push(sx, sy);
      const fp = shape(fan);
      lay(fp, sx, sy - sr * 0.5, sr, smooth(0.2, 1, st));
      const ribs: Pts[] = [];
      for (let i = 1; i < 9; i++) {
        const a = Math.PI + (i / 9) * Math.PI;
        ribs.push([sx, sy, sx + Math.cos(a) * sr * 0.95, sy + Math.sin(a) * sr * 0.8]);
      }
      pen.rule(ribs, { w: 'hair', seed: seed + 50 }, st);
      pen.stroke(fan, { w: 'fine', nib: 0.3, pool: 0.3, seed: seed + 51 }, st);
      const lx = x, ly = y + field.ry + b * 0.7, lh = Math.min(h * 0.2, sr * 1.2);
      const leaf: Pts = [lx, ly];
      cubic(leaf, lx, ly, lx + lh * 0.5, ly + lh * 0.25, lx + lh * 0.28, ly + lh * 0.75, lx, ly + lh, 10);
      cubic(leaf, lx, ly + lh, lx - lh * 0.28, ly + lh * 0.75, lx - lh * 0.5, ly + lh * 0.25, lx, ly, 10);
      const lp = shape(leaf);
      lay(lp, lx, ly, lh, smooth(0.2, 1, st));
      pen.rule([[lx, ly + lh * 0.05, lx, ly + lh * 0.9]], { w: 'hair', seed: seed + 52 }, st);
      pen.stroke(leaf, { w: 'fine', nib: 0.3, pool: 0.3, seed: seed + 53 }, st);
    }
  });
  return field;
}

/** A ring inked round a point, for a level: n of `of` rings, inside out, the newest inking in as t runs. */
export function rings(pen: Pen, x: number, y: number, r0: number, gap: number, n: number, t = 1): void {
  for (let i = 0; i < n; i++) {
    const lt = i < n - 1 ? 1 : t;
    pen.stroke(arcPts(x, y, r0 + i * gap, -Math.PI / 2, -Math.PI / 2 + TAU * lt, 60), { w: i % 4 === 3 ? 'fine' : 'hair', nib: 0.15, pool: 0.4, seed: 70 + i }, 1);
  }
}

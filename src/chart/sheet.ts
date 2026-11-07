// The sheets, baked once per size: a full folio, a half-sheet, a scrap, and the HUD's round disc.
//
// Each is the parchment painter's paper cut to its outline, aged, and laid on the world with its shadow:
// - a folio's edges are the mould's deckle, soft and a little wavy, thinning to translucence at the very edge; it is
//   folded once each way, browned toward its margins, foxed and water-stained, and ruled with a quill frame;
// - a half-sheet was torn from a folio along one side, so that side is ragged and whiter where the tear opened the
//   fibres; it has one fold;
// - a scrap is torn all round, small, and more handled;
// - the disc is a round of papyrus with a frayed, darkened rim, fibre ends standing out from it.
// The sheet canvas holds a margin round the sheet for its shadow and the fibres that stand past its edge.
import { fbm1, noise1, rng } from './noise.ts';
import { canvas, ctx, type Paper } from './paper.ts';
import { Pen, type Widths } from './pen.ts';

export type SheetWeight = 'folio' | 'half' | 'scrap';
export type Side = 'top' | 'right' | 'bottom' | 'left';

export interface SheetOptions {
  weight: SheetWeight;
  /** Size in CSS pixels. */
  w: number;
  h: number;
  dpr: number;
  seed?: number;
  /** Sides torn rather than deckled. A scrap is torn all round; a half-sheet on its right unless told. */
  torn?: readonly Side[];
  /** The quill-ruled frame: on by default for a folio and a half-sheet. */
  rule?: boolean;
  /** Folds: on by default for a folio (both ways) and a half-sheet (one). */
  folds?: boolean;
}

/** A baked sheet: its canvas (device pixels), the margin round the sheet in it, its size and outline (CSS pixels,
 *  from the sheet's top left). */
export interface Baked {
  canvas: HTMLCanvasElement;
  pad: number;
  w: number;
  h: number;
  dpr: number;
  outline: Path2D;
}

const PAD = 28;

/** The sheet's edge, as points round it (CSS pixels, from its top left), deckled or torn side by side. */
export function edgePoints(w: number, h: number, torn: readonly Side[], seed: number, roughness = 1): number[] {
  const out: number[] = [];
  const sides: [Side, number, number, number, number][] = [
    ['top', 0, 0, w, 0], ['right', w, 0, w, h], ['bottom', w, h, 0, h], ['left', 0, h, 0, 0],
  ];
  let k = 0;
  for (const [side, x0, y0, x1, y1] of sides) {
    const L = Math.hypot(x1 - x0, y1 - y0), nx = (y1 - y0) / L, ny = -(x1 - x0) / L; // outward
    const isTorn = torn.includes(side);
    const step = isTorn ? 1.6 : 2.4, sd = seed + k * 101;
    for (let s = 0; s < L; s += step) {
      const f = s / L;
      // ease into the corners so they meet
      const corner = Math.min(1, s / 18, (L - s) / 18);
      let d: number;
      if (isTorn) {
        d = (-3.2 + 3.8 * fbm1(s / 60, sd) + 1.9 * noise1(s / 11, sd + 1) + 1.1 * noise1(s / 3.4, sd + 2) + 0.55 * noise1(s / 1.2, sd + 3)) * roughness;
        d = d * (0.35 + 0.65 * corner) - 1.2 * (1 - corner);
      } else {
        d = (1.1 * fbm1(s / 40, sd) + 0.42 * noise1(s / 5.5, sd + 1) + 0.22 * noise1(s / 1.9, sd + 2)) * roughness;
        d = d * corner - 0.8 * (1 - corner) * (1 - corner);
      }
      out.push(x0 + (x1 - x0) * f + nx * d, y0 + (y1 - y0) * f + ny * d);
    }
    k++;
  }
  return out;
}

const pathOf = (pts: readonly number[]): Path2D => {
  const p = new Path2D();
  p.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) p.lineTo(pts[i], pts[i + 1]);
  p.closePath();
  return p;
};

/** Shadow under a shape on the world: a broad soft one and a close dark one. */
function shadow(g: CanvasRenderingContext2D, outline: Path2D, dpr: number, lift = 1): void {
  g.save();
  g.fillStyle = '#000';
  for (const [blur, dy, a] of [[22 * lift, 9 * lift, 0.3], [5, 1.5, 0.42]] as const) {
    g.shadowColor = `rgba(16,9,3,${a})`;
    g.shadowBlur = blur * dpr;
    g.shadowOffsetX = dy * 0.35 * dpr;
    g.shadowOffsetY = dy * dpr;
    g.fill(outline);
  }
  g.restore();
}

/** Darkens a shape inward from its edge, by a soft shadow cast from outside it. */
function innerBurn(g: CanvasRenderingContext2D, outline: Path2D, w: number, h: number, dpr: number, colour: string, blur: number): void {
  g.save();
  g.clip(outline);
  const frame = new Path2D();
  frame.rect(-w, -h, w * 3, h * 3);
  frame.addPath(outline);
  g.shadowColor = colour;
  g.shadowBlur = blur * dpr;
  g.fillStyle = '#000';
  g.globalCompositeOperation = 'multiply';
  g.fill(frame, 'evenodd');
  g.restore();
}

/** Fibres standing out past an edge: fine pale hairs. */
function fringe(g: CanvasRenderingContext2D, pts: readonly number[], seed: number, density: number, reach: number, colour: string): void {
  const r = rng(seed), n = pts.length >> 1;
  g.save();
  g.strokeStyle = colour;
  g.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    if (r() > density) continue;
    const a = (i + n - 1) % n, b = (i + 1) % n;
    const tx = pts[2 * b] - pts[2 * a], ty = pts[2 * b + 1] - pts[2 * a + 1], tl = Math.hypot(tx, ty) || 1;
    // outward is to the left of travel round the outline (clockwise on screen)
    const nx = ty / tl, ny = -tx / tl, len = reach * (0.3 + r() * r()), lean = (r() - 0.5) * 1.6;
    const x = pts[2 * i], y = pts[2 * i + 1];
    g.globalAlpha = 0.3 + r() * 0.4;
    g.lineWidth = 0.3 + r() * 0.3;
    g.beginPath();
    g.moveTo(x - nx * 0.8, y - ny * 0.8);
    g.quadraticCurveTo(x + nx * len * 0.5 + tx / tl * lean * len * 0.3, y + ny * len * 0.5 + ty / tl * lean * len * 0.3,
      x + nx * len + (tx / tl) * lean * len, y + ny * len + (ty / tl) * lean * len);
    g.stroke();
  }
  g.restore();
}

/** Age on a sheet: foxing freckles, a water stain or two, dark inclusions in the pulp. */
function age(g: CanvasRenderingContext2D, w: number, h: number, seed: number, amount: number): void {
  const r = rng(seed);
  g.save();
  g.globalCompositeOperation = 'multiply';
  // water stains: a pale tide with a darker line where it stopped
  const stains = Math.round(amount * (1 + r() * 2));
  for (let k = 0; k < stains; k++) {
    const cx = r() * w, cy = r() * h, R = (0.08 + r() * 0.18) * Math.min(w, h), sk = seed + k * 7;
    const p = new Path2D();
    for (let i = 0; i <= 72; i++) {
      const a = (i / 72) * Math.PI * 2, rr = R * (1 + 0.28 * fbm1(Math.cos(a) * 1.5 + 3 + Math.sin(a) * 1.5, sk));
      if (i === 0) p.moveTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.8);
      else p.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.8);
    }
    p.closePath();
    g.fillStyle = 'rgba(176,138,92,0.07)';
    g.fill(p);
    g.strokeStyle = 'rgba(140,96,52,0.16)';
    g.lineWidth = 1.4;
    g.stroke(p);
    g.strokeStyle = 'rgba(160,116,70,0.08)';
    g.lineWidth = 5;
    g.stroke(p);
  }
  // foxing: rust freckles in loose clusters, each a darker core in a soft halo
  const clusters = Math.round(amount * (3 + r() * 4));
  for (let c = 0; c < clusters; c++) {
    const cx = r() * w, cy = r() * h, spread = 6 + r() * 26, count = 2 + Math.floor(r() * 7);
    for (let i = 0; i < count; i++) {
      const x = cx + (r() - 0.5) * spread * 2, y = cy + (r() - 0.5) * spread * 2, rad = 0.5 + r() * r() * 3.2;
      g.fillStyle = `rgba(168,104,46,${0.06 + r() * 0.06})`;
      g.beginPath();
      g.arc(x, y, rad * 2.4, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = `rgba(140,74,26,${0.18 + r() * 0.28})`;
      g.beginPath();
      g.ellipse(x, y, rad, rad * (0.7 + r() * 0.5), r() * 3, 0, Math.PI * 2);
      g.fill();
    }
  }
  // inclusions: a dark fibre or a fleck of bark caught in the pulp
  const flecks = Math.round(amount * (w * h) / 9000);
  g.strokeStyle = 'rgba(70,46,26,0.45)';
  g.lineCap = 'round';
  for (let i = 0; i < flecks; i++) {
    const x = r() * w, y = r() * h, a = r() * Math.PI, l = 1 + r() * r() * 9;
    g.lineWidth = 0.3 + r() * 0.5;
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(x + Math.cos(a) * l * 0.5 + (r() - 0.5) * 2, y + Math.sin(a) * l * 0.5 + (r() - 0.5) * 2, x + Math.cos(a) * l, y + Math.sin(a) * l);
    g.stroke();
  }
  g.restore();
}

/** A fold: a soft valley, lighter on the side that faces the light, with the crease itself a fine dark line. */
function fold(g: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, seed: number): void {
  const L = Math.hypot(x1 - x0, y1 - y0), nx = -(y1 - y0) / L, ny = (x1 - x0) / L;
  g.save();
  const grad = g.createLinearGradient(x0 - nx * 14, y0 - ny * 14, x0 + nx * 14, y0 + ny * 14);
  grad.addColorStop(0, 'rgba(255,255,255,0)');
  grad.addColorStop(0.42, 'rgba(120,84,48,0.13)');
  grad.addColorStop(0.5, 'rgba(90,60,30,0.2)');
  grad.addColorStop(0.53, 'rgba(255,250,235,0.0)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.globalCompositeOperation = 'multiply';
  g.fillStyle = grad;
  g.beginPath();
  g.moveTo(x0 - nx * 14, y0 - ny * 14);
  g.lineTo(x1 - nx * 14, y1 - ny * 14);
  g.lineTo(x1 + nx * 14, y1 + ny * 14);
  g.lineTo(x0 + nx * 14, y0 + ny * 14);
  g.fill();
  // the lit flank
  g.globalCompositeOperation = 'screen';
  g.strokeStyle = 'rgba(255,246,222,0.22)';
  g.lineWidth = 3;
  g.beginPath();
  for (let s = 0; s <= L; s += 6) {
    const o = 2.2 + 0.4 * noise1(s / 30, seed);
    const x = x0 + ((x1 - x0) * s) / L + nx * o, y = y0 + ((y1 - y0) * s) / L + ny * o;
    if (s === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.stroke();
  g.globalCompositeOperation = 'multiply';
  g.strokeStyle = 'rgba(96,64,36,0.35)';
  g.lineWidth = 0.6;
  g.beginPath();
  for (let s = 0; s <= L; s += 5) {
    const o = 0.3 * noise1(s / 14, seed + 1);
    const x = x0 + ((x1 - x0) * s) / L + nx * o, y = y0 + ((y1 - y0) * s) / L + ny * o;
    if (s === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.stroke();
  g.restore();
}

/** A quill-ruled double frame inset from the sheet's edge, overshooting at the corners. */
export function ruledFrame(pen: Pen, x: number, y: number, w: number, h: number, gap: number, seed: number, t = 1): void {
  const over = 4;
  const lines = (inset: number) => [
    [x + inset - over, y + inset, x + w - inset + over, y + inset],
    [x + w - inset, y + inset - over, x + w - inset, y + h - inset + over],
    [x + w - inset + over, y + h - inset, x + inset - over, y + h - inset],
    [x + inset, y + h - inset + over, x + inset, y + inset - over],
  ];
  const outer = lines(0), inner = lines(gap);
  for (let i = 0; i < 4; i++) {
    const lt = t >= 1 ? 1 : Math.min(1, Math.max(0, t * 4 - i * 0.8));
    pen.stroke(outer[i], { w: 'bold', nib: 0.15, seed: seed + i, pool: 0.8, taper: 3 }, lt);
    pen.stroke(inner[i], { w: 'hair', nib: 0.1, seed: seed + 10 + i, pool: 0.5, taper: 2 }, Math.max(0, lt * 1.15 - 0.15));
  }
}

/** Bakes a sheet. */
export function bakeSheet(paper: Paper, widths: Widths, o: SheetOptions): Baked {
  const { w, h, dpr, weight } = o;
  const seed = o.seed ?? 1;
  const torn = o.torn ?? (weight === 'scrap' ? ['top', 'right', 'bottom', 'left'] : weight === 'half' ? ['right'] : []);
  const c = canvas((w + PAD * 2) * dpr, (h + PAD * 2) * dpr), g = ctx(c);
  g.setTransform(dpr, 0, 0, dpr, PAD * dpr, PAD * dpr);
  const pts = edgePoints(w, h, torn, seed, weight === 'scrap' ? 1.15 : 1);
  const outline = pathOf(pts);
  shadow(g, outline, dpr, weight === 'folio' ? 1 : weight === 'half' ? 0.8 : 0.6);
  const r = rng(seed);
  const ox = (PAD + r() * 256) * dpr, oy = (PAD + r() * 256) * dpr;
  const pen = new Pen(paper, dpr, widths).on(g, ox, oy);
  g.save();
  g.clip(outline);
  g.fillStyle = paper.anchor(g, paper.surface, ox, oy, dpr);
  g.fillRect(-2, -2, w + 4, h + 4);
  // the sheet's tone and the light on it: a folio darker with age, a scrap handled
  g.globalCompositeOperation = 'multiply';
  g.fillStyle = weight === 'folio' ? 'rgb(246,236,220)' : weight === 'half' ? 'rgb(250,243,230)' : 'rgb(244,230,208)';
  g.fillRect(0, 0, w, h);
  const R = Math.hypot(w, h) / 2;
  const vig = g.createRadialGradient(w * 0.42, h * 0.4, R * 0.25, w / 2, h / 2, R * 1.05);
  vig.addColorStop(0, 'rgba(255,255,255,0)');
  vig.addColorStop(0.65, 'rgba(214,180,136,0.25)');
  vig.addColorStop(1, 'rgba(150,100,56,0.55)');
  g.fillStyle = vig;
  g.fillRect(0, 0, w, h);
  g.globalCompositeOperation = 'soft-light';
  const light = g.createLinearGradient(0, 0, w, h);
  light.addColorStop(0, 'rgba(255,250,232,0.45)');
  light.addColorStop(0.6, 'rgba(255,250,232,0)');
  light.addColorStop(1, 'rgba(60,36,14,0.25)');
  g.fillStyle = light;
  g.fillRect(0, 0, w, h);
  g.globalCompositeOperation = 'source-over';
  age(g, w, h, seed + 3, weight === 'folio' ? 1.2 : weight === 'half' ? 0.8 : 1);
  if (o.folds ?? weight !== 'scrap') {
    fold(g, w / 2 + (r() - 0.5) * 6, -4, w / 2 + (r() - 0.5) * 6, h + 4, seed + 5);
    if (weight === 'folio') fold(g, -4, h / 2 + (r() - 0.5) * 6, w + 4, h / 2 + (r() - 0.5) * 6, seed + 6);
  }
  // browned in from the edge, deeper where it was torn
  innerBurn(g, outline, w, h, dpr, 'rgba(120,70,28,0.55)', weight === 'scrap' ? 10 : 16);
  innerBurn(g, outline, w, h, dpr, 'rgba(90,50,18,0.35)', 3);
  // the very edge thins to translucence; a tear shows the whiter fibres inside the sheet
  g.globalCompositeOperation = 'source-over';
  g.strokeStyle = 'rgba(252,244,224,0.32)';
  g.lineWidth = 1.6;
  g.stroke(outline);
  if (torn.length) {
    const rag = edgePoints(w, h, torn, seed + 77, 0.6);
    g.strokeStyle = 'rgba(255,249,234,0.5)';
    g.lineWidth = torn.length === 4 ? 4 : 3;
    // only along torn sides: everything else of this inner line is clipped away by the deckled sides' own darkening
    g.save();
    const keep = new Path2D();
    for (const s of torn) {
      if (s === 'top') keep.rect(-10, -10, w + 20, 14);
      if (s === 'bottom') keep.rect(-10, h - 4, w + 20, 14);
      if (s === 'left') keep.rect(-10, -10, 14, h + 20);
      if (s === 'right') keep.rect(w - 4, -10, 14, h + 20);
    }
    g.clip(keep);
    g.stroke(pathOf(rag));
    g.restore();
  }
  g.restore();
  fringe(g, pts, seed + 9, torn.length ? 0.16 : 0.06, torn.length ? 3.2 : 2, 'rgb(214,196,160)');
  if (o.rule ?? weight !== 'scrap') {
    const inset = weight === 'folio' ? Math.min(26, Math.min(w, h) * 0.05) : Math.min(18, Math.min(w, h) * 0.05);
    ruledFrame(pen, inset, inset, w - inset * 2, h - inset * 2, weight === 'folio' ? 6 : 4.5, seed + 20);
  }
  return { canvas: c, pad: PAD, w, h, dpr, outline };
}

/** The HUD's disc: papyrus cut round, its rim frayed and browned, fibre ends standing out from it. */
export function bakeDisc(paper: Paper, r: number, dpr: number, seed = 3): Baked {
  const size = r * 2;
  const c = canvas((size + PAD * 2) * dpr, (size + PAD * 2) * dpr), g = ctx(c);
  g.setTransform(dpr, 0, 0, dpr, PAD * dpr, PAD * dpr);
  const pts: number[] = [], n = Math.ceil((Math.PI * 2 * r) / 1.4);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2, s = a * r;
    const rr = r * (1 - 0.016 + 0.02 * fbm1(s / (r * 0.6), seed)) + 2 * fbm1(s / 16, seed + 5) + 1.3 * noise1(s / 6, seed + 1) + 0.8 * noise1(s / 2.2, seed + 2) + 0.4 * noise1(s / 0.9, seed + 3);
    pts.push(r + Math.cos(a) * rr, r + Math.sin(a) * rr);
  }
  const outline = pathOf(pts);
  shadow(g, outline, dpr, 0.55);
  const ox = (PAD + 90) * dpr, oy = (PAD + 40) * dpr;
  g.save();
  g.clip(outline);
  g.fillStyle = paper.anchor(g, paper.surface, ox, oy, dpr);
  g.fillRect(-2, -2, size + 4, size + 4);
  g.globalCompositeOperation = 'multiply';
  g.fillStyle = 'rgb(248,238,220)';
  g.fillRect(0, 0, size, size);
  const vig = g.createRadialGradient(r * 0.85, r * 0.8, r * 0.2, r, r, r * 1.02);
  vig.addColorStop(0, 'rgba(255,255,255,0)');
  vig.addColorStop(0.7, 'rgba(220,186,140,0.25)');
  vig.addColorStop(1, 'rgba(140,90,46,0.5)');
  g.fillStyle = vig;
  g.fillRect(0, 0, size, size);
  g.globalCompositeOperation = 'soft-light';
  const light = g.createLinearGradient(0, 0, size, size);
  light.addColorStop(0, 'rgba(255,250,232,0.5)');
  light.addColorStop(0.55, 'rgba(255,250,232,0)');
  light.addColorStop(1, 'rgba(60,36,14,0.3)');
  g.fillStyle = light;
  g.fillRect(0, 0, size, size);
  g.globalCompositeOperation = 'source-over';
  age(g, size, size, seed + 4, 0.5);
  innerBurn(g, outline, size, size, dpr, 'rgba(120,64,22,0.75)', r * 0.12);
  innerBurn(g, outline, size, size, dpr, 'rgba(84,42,12,0.7)', 4);
  innerBurn(g, outline, size, size, dpr, 'rgba(60,28,8,0.5)', 1.2);
  g.strokeStyle = 'rgba(252,244,224,0.3)';
  g.lineWidth = 1.4;
  g.stroke(outline);
  g.restore();
  fringe(g, pts, seed + 9, 0.22, 3.2, 'rgb(206,184,146)');
  return { canvas: c, pad: PAD, w: size, h: size, dpr, outline };
}

/** Draws a baked sheet with its top left at (x, y), CSS pixels. */
export function drawBaked(g: CanvasRenderingContext2D, b: Baked, x: number, y: number, alpha = 1): void {
  if (alpha <= 0) return;
  const was = g.globalAlpha;
  g.globalAlpha = was * alpha;
  g.drawImage(b.canvas, x - b.pad, y - b.pad, b.w + b.pad * 2, b.h + b.pad * 2);
  g.globalAlpha = was;
}

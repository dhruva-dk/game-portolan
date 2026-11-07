// Wax seals with real relief, in the five illuminations rarity is drawn in: plain ink (black wax), red rubric
// (vermilion wax), red and blue (vermilion wax on blue silk ribbons, with the scribe's blue penwork round it), silver
// leaf and gold leaf (the leaf laid over the wax and cracked where the wax flexed, the wax showing in the cracks).
//
// A seal is a height field, shaded here pixel by pixel once at bake time: the puddle of wax with its outline pushed out
// where it ran; the wax the matrix squeezed out standing as a raised ring; the matrix's impression pressed below it,
// with a lip where its edge bit, a beaded border and a fine ring; and the device raised in the middle of it (an
// emblem, a figure, a star). It is lit from the top left: wax by a wrapped diffuse with light glowing through where it
// is thin, a soft highlight and a sharp one on its glossy skin; leaf as a metal, mirroring a warm sky and crinkled.
// A metal seal is baked under a light swung through a small arc, frame by frame, so the live layer can crossfade a
// slow sheen across its relief. Pressing one sinks it and darkens it.
import { emblemField } from './emblem.ts';
import { clamp, hash, noise2, smooth } from './noise.ts';
import { canvas, ctx, type Paper } from './paper.ts';
import { Pen, cubic, shape, type Pts, type Widths } from './pen.ts';
import { figureStrokes, figureWidth } from './numerals.ts';

export type Illumination = 'ink' | 'rubric' | 'redBlue' | 'silver' | 'gold';

/** Rarity's ladder, plainest first. */
export const ILLUMINATIONS: readonly Illumination[] = ['ink', 'rubric', 'redBlue', 'silver', 'gold'];

/** What the matrix presses into the wax: a captain's emblem, figures, a star, or anything drawn white on a canvas
 *  round the origin within radius r. */
export type Device = { emblem: string } | { figure: string } | 'star' | 'rose' | ((g: CanvasRenderingContext2D, r: number) => void);

export interface SealOptions {
  /** Diameter of the wax, CSS pixels. */
  size: number;
  dpr: number;
  device?: Device;
  seed?: number;
}

export interface Seal {
  /** Frames under the light's swing (one for wax, several for leaf), device pixels. */
  frames: HTMLCanvasElement[];
  /** CSS size of each frame, the wax centred in it. */
  box: number;
  size: number;
  illumination: Illumination;
}

const WAX: Record<Illumination, [number, number, number]> = {
  ink: [0.022, 0.017, 0.014],
  rubric: [0.5, 0.045, 0.022],
  redBlue: [0.46, 0.04, 0.02],
  silver: [0.04, 0.035, 0.034],
  gold: [0.36, 0.035, 0.018],
};
const METAL: Partial<Record<Illumination, [number, number, number]>> = {
  silver: [0.93, 0.92, 0.9],
  gold: [1.0, 0.68, 0.26],
};

const toSrgb = (c: number) => {
  c = clamp(c);
  return 255 * (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
};

/** The device as a coverage mask, n × n device pixels, centred, within radius r (device pixels). */
function deviceMask(device: Device, n: number, r: number): Float32Array {
  const out = new Float32Array(n * n);
  if (typeof device === 'object' && 'emblem' in device) {
    const px = Math.round(r * 2), f = emblemField(device.emblem, px), o = Math.round(n / 2 - r);
    for (let j = 0; j < px; j++) for (let i = 0; i < px; i++) {
      const x = i + o, y = j + o;
      if (x >= 0 && y >= 0 && x < n && y < n) out[y * n + x] = clamp(0.5 - f[j * px + i]);
    }
    return out;
  }
  const c = canvas(n, n), g = ctx(c);
  g.translate(n / 2, n / 2);
  g.fillStyle = g.strokeStyle = '#fff';
  g.lineCap = g.lineJoin = 'round';
  if (device === 'star') {
    g.beginPath();
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2 - Math.PI / 2, rr = k % 2 ? r * 0.36 : k % 4 === 0 ? r * 0.95 : r * 0.62;
      g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    g.closePath();
    g.fill();
  } else if (device === 'rose') {
    g.lineWidth = r * 0.07;
    g.beginPath();
    g.arc(0, 0, r * 0.88, 0, Math.PI * 2);
    g.stroke();
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2, len = k % 2 ? r * 0.6 : r * 0.92, w = r * 0.13;
      g.beginPath();
      g.moveTo(Math.cos(a) * len, Math.sin(a) * len);
      g.lineTo(Math.cos(a + Math.PI / 2) * w, Math.sin(a + Math.PI / 2) * w);
      g.lineTo(0, 0);
      g.closePath();
      g.fill();
    }
  } else if (typeof device === 'object' && 'figure' in device) {
    // the figures cut in the matrix: the numeral hand's strokes at an even width
    const size = Math.min(r * 1.05, (r * 1.7) / Math.max(0.6, figureWidth(device.figure, 1)));
    g.lineWidth = size * 0.17;
    for (const s of figureStrokes(device.figure, -figureWidth(device.figure, size) / 2, size * 0.42, size)) {
      g.beginPath();
      g.moveTo(s[0], s[1]);
      for (let q = 2; q < s.length; q += 2) g.lineTo(s[q], s[q + 1]);
      g.stroke();
    }
  } else if (typeof device === 'function') {
    device(g, r);
  }
  const px = g.getImageData(0, 0, n, n).data;
  for (let k = 0; k < n * n; k++) out[k] = px[k * 4 + 3] / 255;
  return out;
}

/** A box blur of a mask, in place, radius r pixels, twice (near a gaussian). */
function blur(m: Float32Array, n: number, r: number): Float32Array {
  const tmp = new Float32Array(n * n), out = new Float32Array(m);
  for (let pass = 0; pass < 2; pass++) {
    for (let j = 0; j < n; j++) {
      let acc = 0;
      for (let i = -r; i <= r; i++) acc += out[j * n + clamp(i, 0, n - 1)];
      for (let i = 0; i < n; i++) {
        tmp[j * n + i] = acc / (2 * r + 1);
        acc += out[j * n + Math.min(n - 1, i + r + 1)] - out[j * n + Math.max(0, i - r)];
      }
    }
    for (let i = 0; i < n; i++) {
      let acc = 0;
      for (let j = -r; j <= r; j++) acc += tmp[clamp(j, 0, n - 1) * n + i];
      for (let j = 0; j < n; j++) {
        out[j * n + i] = acc / (2 * r + 1);
        acc += tmp[Math.min(n - 1, j + r + 1) * n + i] - tmp[Math.max(0, j - r) * n + i];
      }
    }
  }
  return out;
}

/** GGX normal distribution. */
const ggx = (nh: number, rough: number) => {
  const a2 = rough * rough * rough * rough, d = nh * nh * (a2 - 1) + 1;
  return a2 / (Math.PI * d * d);
};

/** Bakes a seal: its relief once, then each frame of its light. */
export function bakeSeal(paper: Paper, widths: Widths, ill: Illumination, o: SealOptions): Seal {
  const { size, dpr } = o, seed = o.seed ?? 7;
  // the box holds the wax, its shadow, and for red-and-blue its ribbons and penwork
  const box = size * (ill === 'redBlue' ? 1.9 : 1.24);
  const n = Math.ceil(box * dpr), R = (size / 2) * dpr, c0 = n / 2;
  const H = new Float32Array(n * n), S = new Float32Array(n * n), A = new Float32Array(n * n), shadowA = new Float32Array(n * n);
  const sharp = o.device ? deviceMask(o.device, n, R * 0.47) : null;
  const mask = sharp ? blur(sharp, n, Math.max(1, Math.round(dpr * 0.9))) : null;
  // the puddle's outline: pushed out where the wax ran, in one or two drips
  const drips = [hash(1, 2, seed) * Math.PI * 2, hash(3, 4, seed) * Math.PI * 2];
  const rimAt = (a: number) => {
    const cx = Math.cos(a), sy = Math.sin(a);
    let rr = 0.93 + 0.035 * noise2(cx * 1.6 + 3, sy * 1.6, seed) + 0.016 * noise2(cx * 4.5, sy * 4.5 + 7, seed + 1) + 0.006 * noise2(cx * 12, sy * 12, seed + 2);
    for (const d of drips) {
      const da = Math.atan2(Math.sin(a - d), Math.cos(a - d));
      rr += 0.07 * Math.exp(-(da * da) / 0.025);
    }
    return rr;
  };
  const Ri = 0.66, beads = 36;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const x = (i + 0.5 - c0) / R, y = (j + 0.5 - c0) / R, r = Math.hypot(x, y), a = Math.atan2(y, x);
    const rim = rimAt(a), s = r / rim, k = j * n + i;
    // the shadow it casts down and to the right
    const sx = x - 0.05, sy = y - 0.08, sr = Math.hypot(sx, sy) / rimAt(Math.atan2(sy, sx));
    shadowA[k] = 0.5 * smooth(1.16, 0.86, sr);
    A[k] = clamp((1 - s) * rim * R / 1.1 + 0.5);
    if (s >= 1.02) continue;
    const sc = Math.min(s, 1);
    let h = Math.sqrt(Math.max(0, 1 - Math.pow(sc, 7))) * 0.3;
    h += 0.075 * Math.exp(-(((s - 0.83) / 0.085) ** 2));
    // the impression: its floor, its wall, the lip it squeezed up
    h -= 0.115 * smooth(Ri + 0.02, Ri - 0.025, r);
    h += 0.04 * Math.exp(-(((r - Ri - 0.035) / 0.028) ** 2));
    // the matrix's border: beads and a fine ring
    const ba = ((a / (Math.PI * 2)) * beads + beads) % 1 - 0.5;
    h += 0.032 * smooth(0.024, 0.012, Math.hypot((ba * 2 * Math.PI * 0.595) / beads, r - 0.595));
    h += 0.022 * smooth(0.012, 0.004, Math.abs(r - 0.535));
    if (mask && sharp) h += 0.11 * (mask[k] * 0.65 + sharp[k] * 0.35) * smooth(0.52, 0.48, r);
    h += 0.004 * noise2(x * 30, y * 30, seed + 5) + 0.002 * noise2(x * 90, y * 90, seed + 6);
    // a few bubbles that burst in the skin as it cooled
    const bi = Math.floor((x + 2) * 9), bj = Math.floor((y + 2) * 9);
    if (hash(bi, bj, seed + 9) > 0.86) {
      const bx = (bi + hash(bi, bj, seed + 10)) / 9 - 2, by = (bj + hash(bi, bj, seed + 11)) / 9 - 2;
      h -= 0.012 * smooth(0.016, 0.004, Math.hypot(x - bx, y - by));
    }
    H[k] = h * R;
    S[k] = s;
  }
  const metal = METAL[ill];
  const frames: HTMLCanvasElement[] = [];
  const swing = metal ? [-0.55, -0.35, -0.15, 0.05, 0.25, 0.45] : [0];
  const wax = WAX[ill];
  for (const az of swing) {
    const c = canvas(n, n), g = ctx(c);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (ill === 'redBlue') ribbons(paper, widths, g, box / 2, box / 2, size, dpr, seed);
    const img = g.getImageData(0, 0, n, n), d = img.data;
    const ca = Math.cos(az), sa = Math.sin(az);
    let Lx = -0.5, Ly = -0.6;
    [Lx, Ly] = [Lx * ca - Ly * sa, Lx * sa + Ly * ca];
    const Lz = 0.62, ll = Math.hypot(Lx, Ly, Lz);
    const L = [Lx / ll, Ly / ll, Lz / ll], Hv = [L[0], L[1], L[2] + 1], hl = Math.hypot(Hv[0], Hv[1], Hv[2]);
    Hv[0] /= hl; Hv[1] /= hl; Hv[2] /= hl;
    for (let j = 1; j < n - 1; j++) for (let i = 1; i < n - 1; i++) {
      const k = j * n + i, o4 = k * 4;
      const under = [d[o4], d[o4 + 1], d[o4 + 2], d[o4 + 3] / 255];
      const sa0 = shadowA[k] * (1 - A[k]);
      let outR = 0, outG = 0, outB = 0;
      if (A[k] > 0) {
        let nx = -(H[k + 1] - H[k - 1]) * 0.5, ny = -(H[k + n] - H[k - n]) * 0.5, nz = 1;
        const x = (i - c0) / R, y = (j - c0) / R;
        let leaf = 0;
        if (metal) {
          // leaf: crinkled, and cracked along a net of cells where the wax flexed under it
          nx += 0.12 * noise2(x * 18, y * 18, seed + 20) + 0.05 * noise2(x * 50, y * 50, seed + 22);
          ny += 0.12 * noise2(x * 18 + 9, y * 18, seed + 21) + 0.05 * noise2(x * 50 + 9, y * 50, seed + 23);
          leaf = 1;
          const cx = x * 4.5, cy = y * 4.5, ci = Math.floor(cx), cj = Math.floor(cy);
          let d1 = 9, d2 = 9;
          for (let q = -1; q <= 1; q++) for (let p = -1; p <= 1; p++) {
            const px = ci + p + hash(ci + p, cj + q, seed + 30), py = cj + q + hash(ci + p, cj + q, seed + 31);
            const dd = Math.hypot(cx - px, cy - py);
            if (dd < d1) { d2 = d1; d1 = dd; } else if (dd < d2) d2 = dd;
          }
          const crack = smooth(0.035, 0.0, d2 - d1) * (0.4 + 0.6 * smooth(0.3, 0.8, S[k]));
          leaf = 1 - crack * 0.9;
          // the leaf rubbed through on the highest wax, round the rim
          leaf *= 1 - 0.7 * smooth(0.9, 0.99, S[k]);
        }
        const nl0 = Math.hypot(nx, ny, nz);
        nx /= nl0; ny /= nl0; nz /= nl0;
        const ndl = nx * L[0] + ny * L[1] + nz * L[2], ndh = Math.max(0, nx * Hv[0] + ny * Hv[1] + nz * Hv[2]);
        // wax
        const diff = clamp((ndl + 0.4) / 1.4);
        const thin = 1 - smooth(0.0, 0.18 * R, H[k]);
        const spec = ggx(ndh, 0.34) * 0.09 + ggx(ndh, 0.13) * 0.02;
        const fres = Math.pow(1 - nz, 3) * 0.12;
        let wr = wax[0] * (0.16 + 1.05 * diff) + wax[0] * 1.6 * thin * 0.35 + spec + fres * 0.5;
        let wg = wax[1] * (0.16 + 1.05 * diff) + wax[1] * 1.6 * thin * 0.35 + spec + fres * 0.45;
        let wb = wax[2] * (0.16 + 1.05 * diff) + wax[2] * 1.6 * thin * 0.35 + spec + fres * 0.4;
        if (metal && leaf > 0) {
          // the leaf mirrors a warm sky: bright up and to the left, dark below
          const rx = 2 * nz * nx, ry = 2 * nz * ny, rz = 2 * nz * nz - 1;
          const sky = smooth(-0.55, 0.8, -ry * 0.75 - rx * 0.45 + rz * 0.3);
          const env = 0.1 + 1.1 * sky * sky;
          const ms = ggx(ndh, 0.24) * 0.5;
          const mr = metal[0] * (env + ms) + metal[0] * 0.08 * diff;
          const mg = metal[1] * (env + ms) + metal[1] * 0.08 * diff;
          const mb = metal[2] * (env + ms) + metal[2] * 0.08 * diff;
          wr += (mr - wr) * leaf; wg += (mg - wg) * leaf; wb += (mb - wb) * leaf;
        }
        // a gentle shoulder, so the highlight rolls off
        wr = wr / (1 + wr * 0.35); wg = wg / (1 + wg * 0.35); wb = wb / (1 + wb * 0.35);
        outR = toSrgb(wr); outG = toSrgb(wg); outB = toSrgb(wb);
      }
      // wax over its shadow over whatever was drawn beneath (the ribbons)
      const a = A[k];
      const ua = under[3], shA = sa0;
      const baseA = shA + ua * (1 - shA);
      const bR = baseA > 0 ? (under[0] * ua * (1 - shA) + 20 * shA) / baseA : 0;
      const bG = baseA > 0 ? (under[1] * ua * (1 - shA) + 12 * shA) / baseA : 0;
      const bB = baseA > 0 ? (under[2] * ua * (1 - shA) + 6 * shA) / baseA : 0;
      const fa = a + baseA * (1 - a);
      d[o4] = fa > 0 ? (outR * a + bR * baseA * (1 - a)) / fa : 0;
      d[o4 + 1] = fa > 0 ? (outG * a + bG * baseA * (1 - a)) / fa : 0;
      d[o4 + 2] = fa > 0 ? (outB * a + bB * baseA * (1 - a)) / fa : 0;
      d[o4 + 3] = Math.round(255 * fa);
    }
    g.putImageData(img, 0, 0);
    if (ill === 'redBlue') penwork(paper, widths, g, box / 2, box / 2, size, dpr, seed);
    frames.push(c);
  }
  return { frames, box, size, illumination: ill };
}

/** Blue silk ribbons the red seal hangs on, their ends cut in a swallowtail. */
function ribbons(paper: Paper, widths: Widths, g: CanvasRenderingContext2D, cx: number, cy: number, size: number, dpr: number, seed: number): void {
  const pen = new Pen(paper, dpr, widths).on(g);
  const r = size / 2;
  for (const sgn of [-1, 1]) {
    const x0 = cx - sgn * r * 0.2, y0 = cy - r * 0.1;
    const x1 = cx + sgn * r * 0.58, y1 = cy + r * 1.62, w = r * 0.21;
    const mid: Pts = cubic([], x0, y0, x0 + sgn * r * 0.35, y0 + r * 0.55, x1 - sgn * r * 0.05, y1 - r * 0.7, x1, y1, 22);
    const left: Pts = [], right: Pts = [];
    const m = mid.length / 2;
    for (let i = 0; i < m; i++) {
      const a = Math.max(0, i - 1), b = Math.min(m - 1, i + 1);
      const tx = mid[2 * b] - mid[2 * a], ty = mid[2 * b + 1] - mid[2 * a + 1], tl = Math.hypot(tx, ty) || 1;
      // the silk twists once on its way down: narrower where it turns
      const ww = w * (0.62 + 0.38 * Math.abs(Math.cos((i / m) * Math.PI * 1.1 + sgn * 0.4)));
      left.push(mid[2 * i] - (ty / tl) * ww, mid[2 * i + 1] + (tx / tl) * ww);
      right.push(mid[2 * i] + (ty / tl) * ww, mid[2 * i + 1] - (tx / tl) * ww);
    }
    // the swallowtail cut
    const ex = mid[2 * (m - 1)], ey = mid[2 * (m - 1) + 1], px = mid[2 * (m - 4)], py = mid[2 * (m - 4) + 1];
    const outline: Pts = [...left];
    outline.push(px + (ex - px) * 0.15, py + (ey - py) * 0.15);
    for (let i = m - 1; i >= 0; i--) outline.push(right[2 * i], right[2 * i + 1]);
    const p = shape(outline);
    pen.wash(p, '#2d5aa6', { alpha: 0.92, edge: 0.75, gran: 0.6, shift: [0, 0] });
    // the shadow of its fold, hatched
    pen.hatch(p, Math.min(x0, x1) - w * 2, y0, Math.abs(x1 - x0) + w * 4, y1 - y0 + w, sgn > 0 ? 0.35 : -0.35, 2.4, { ink: 'blue', alpha: 0.45, seed: seed + sgn });
    pen.stroke(outline, { w: 'hair', ink: 'iron', nib: 0.2, pool: 0.3, seed: seed + 3 + sgn });
  }
}

/**
 * The scribe's penwork in blue round a red seal, as round a lombard capital: a ring of hairline scallops hugging the
 * wax, tendrils curling out from between them, each ending in a dot.
 */
function penwork(paper: Paper, widths: Widths, g: CanvasRenderingContext2D, cx: number, cy: number, size: number, dpr: number, seed: number): void {
  const pen = new Pen(paper, dpr, widths).on(g);
  const r = size / 2, n = 22;
  g.save();
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  for (let k = 0; k < n; k++) {
    const a0 = (k / n) * Math.PI * 2 - Math.PI / 2, a1 = ((k + 1) / n) * Math.PI * 2 - Math.PI / 2, am = (a0 + a1) / 2;
    // clear of the ribbons below
    if (Math.sin(am) > 0.5) continue;
    const r0 = r * 1.1, bulge = r * 1.24;
    pen.stroke(cubic([], cx + Math.cos(a0) * r0, cy + Math.sin(a0) * r0, cx + Math.cos(a0 + 0.05) * bulge, cy + Math.sin(a0 + 0.05) * bulge,
      cx + Math.cos(a1 - 0.05) * bulge, cy + Math.sin(a1 - 0.05) * bulge, cx + Math.cos(a1) * r0, cy + Math.sin(a1) * r0, 10),
    { w: 'hair', ink: 'blue', nib: 0.2, pool: 0.2, seed: seed + k });
    if (Math.sin(a1) > 0.5) continue;
    const c = Math.cos(a1), s = Math.sin(a1), long = k % 2 ? 1.62 : 1.42, curl = (k % 2 ? 1 : -1) * r * 0.1;
    const ex = cx + c * r * long, ey = cy + s * r * long;
    pen.stroke(cubic([], cx + c * r0, cy + s * r0, cx + c * r * 1.3 - s * curl, cy + s * r * 1.3 + c * curl,
      ex + s * curl * 1.4, ey - c * curl * 1.4, ex, ey, 12), { w: 'hair', ink: 'blue', nib: 0.3, pool: 0.5, seed: seed + 50 + k });
    pen.dot(ex + c * 2.2, ey + s * 2.2, k % 2 ? 1.1 : 0.8, 'blue', 0.85);
  }
  g.restore();
}

/**
 * Draws a seal centred at (x, y): its sheen at `phase` (0..1 through the light's swing), sunk and darkened by `press`
 * (0..1), scaled by `scale`.
 */
export function drawSeal(g: CanvasRenderingContext2D, s: Seal, x: number, y: number, o: { phase?: number; press?: number; scale?: number; alpha?: number } = {}): void {
  const press = o.press ?? 0, alpha = o.alpha ?? 1;
  if (alpha <= 0) return;
  const k = (o.scale ?? 1) * (1 - 0.045 * press), b = s.box * k;
  const dx = x - b / 2, dy = y - b / 2 + 1.4 * press;
  g.save();
  g.globalAlpha *= alpha;
  if (s.frames.length === 1) g.drawImage(s.frames[0], dx, dy, b, b);
  else {
    const f = clamp(o.phase ?? 0.5) * (s.frames.length - 1), i = Math.min(s.frames.length - 2, Math.floor(f)), u = f - i;
    g.drawImage(s.frames[i], dx, dy, b, b);
    if (u > 0.002) {
      g.globalAlpha *= u;
      g.drawImage(s.frames[i + 1], dx, dy, b, b);
      g.globalAlpha /= u;
    }
  }
  if (press > 0.01) {
    // pressed, its colour deepens: the seal multiplied by itself
    g.globalCompositeOperation = 'multiply';
    g.globalAlpha *= 0.5 * press;
    g.drawImage(s.frames[0], dx, dy, b, b);
  }
  g.restore();
}

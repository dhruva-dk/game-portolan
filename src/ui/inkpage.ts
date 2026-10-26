import { layoutText, rasterizeText, type TextLayout, type TextOptions, type TextRaster } from '../lettering/text.ts';
import { INK, nib } from './icons.ts';
import type { Rect, View } from './safeArea.ts';

export type G = CanvasRenderingContext2D;
export type Pt = [number, number];

export const PAPER = '#f1e4c6', PAPER_DEEP = '#dcc79c', SEPIA = '#6b4f36', VERMILION = '#d9472b', VERDIGRIS = '#5aa394';
export const OCHRE = '#d4a656', ULTRAMARINE = '#4566b0';
export const GOLD = '#d4a64a', GOLD_DARK = '#93691c', GOLD_LIGHT = '#f6e3a2';
export const MIN_TARGET = 44;
export const MIN_LETTER = 11;
export const ORDINALS = ['First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth', 'Ninth', 'Tenth'];

export const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
export const ease = (x: number): number => { const t = clamp01(x); return t * t * (3 - 2 * t); };
export const inset = (r: Rect, d: number): Rect => ({ x: r.x + d, y: r.y + d, width: r.width - 2 * d, height: r.height - 2 * d });
export const inside = (r: Rect, x: number, y: number): boolean => x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height;
export const within = (r: Rect, outer: Rect): boolean =>
  r.x >= outer.x - 0.5 && r.y >= outer.y - 0.5 && r.x + r.width <= outer.x + outer.width + 0.5 && r.y + r.height <= outer.y + outer.height + 0.5;
export const safeOf = (v: View): Rect => ({ x: v.safe.left, y: v.safe.top, width: v.width - v.safe.left - v.safe.right, height: v.height - v.safe.top - v.safe.bottom });
export function clampRect(r: Rect, outer: Rect): Rect {
  const x = Math.min(Math.max(r.x, outer.x), outer.x + outer.width - r.width), y = Math.min(Math.max(r.y, outer.y), outer.y + outer.height - r.height);
  return { x, y, width: r.width, height: r.height };
}

export function rand(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

export function rgb(hex: string): [number, number, number] {
  const h = hex.replace('#', ''), n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h.slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export const rgba = (hex: string, a: number): string => { const [r, g, b] = rgb(hex); return `rgba(${r},${g},${b},${a.toFixed(3)})`; };


interface Written { readonly r: TextRaster; readonly rgb: [number, number, number]; readonly steps: Map<number, HTMLCanvasElement> }
const written = new Map<string, Written>();
const layouts = new Map<string, TextLayout>();
const STEPS = 20;
const keyOf = (text: string, o: TextOptions): string =>
  `${text}\u0001${o.size.toFixed(2)}|${o.align ?? ''}|${o.valign ?? ''}|${o.maxWidth === undefined ? '' : o.maxWidth.toFixed(1)}|${o.lineHeight ?? ''}|${o.swash ? 1 : 0}`;

export function layoutOf(text: string, o: TextOptions): TextLayout {
  const key = keyOf(text, o);
  let l = layouts.get(key);
  if (!l) {
    l = layoutText(text, o);
    if (layouts.size > 600) layouts.delete(layouts.keys().next().value as string);
    layouts.set(key, l);
  }
  return l;
}
export const widthOf = (text: string, o: TextOptions): number => { const b = layoutOf(text, o).box; return b.right - b.left; };
export function fitSize(text: string, size: number, w: number, min = MIN_LETTER): number {
  const least = Math.max(MIN_LETTER, Math.min(size, min));
  for (let s = size; s > least; s -= 0.25) if (widthOf(text, { size: s }) <= w) return s;
  return least;
}

export function letter(g: G, text: string, x: number, y: number, o: TextOptions, colour: string = INK, p = 1, alpha = 1): void {
  if (text === '' || p <= 0 || alpha <= 0) return;
  const m = g.getTransform(), ratio = Math.max(1, Math.min(3, Math.round(Math.hypot(m.a, m.b) * 4) / 4));
  const key = `${keyOf(text, o)}|${colour}|${ratio}`;
  let w = written.get(key);
  if (!w) {
    w = { r: rasterizeText(layoutOf(text, o), ratio), rgb: rgb(colour), steps: new Map() };
    if (written.size > 320) written.delete(written.keys().next().value as string);
    written.set(key, w);
  }
  const step = p >= 1 ? STEPS : Math.max(1, Math.floor(p * STEPS));
  let c = w.steps.get(step);
  if (!c) {
    c = paint(w, step);
    w.steps.set(step, c);
  }
  g.save();
  g.globalAlpha *= alpha;
  g.drawImage(c, x + w.r.left, y + w.r.top, w.r.width / w.r.pixelRatio, w.r.height / w.r.pixelRatio);
  g.restore();
}

function paint(w: Written, step: number): HTMLCanvasElement {
  const { r } = w, c = document.createElement('canvas');
  c.width = Math.max(1, r.width);
  c.height = Math.max(1, r.height);
  const cx = c.getContext('2d')!, img = cx.createImageData(c.width, c.height), d = img.data, s = r.data;
  const lim = step >= STEPS ? 256 : (step / STEPS) * 255;
  for (let i = 0, n = r.width * r.height * 4; i < n; i += 4) {
    if (s[i + 2] > lim) continue;
    const a = Math.min(1, (s[i] / 255) * (0.82 + 0.18 * (s[i + 3] / 255)) + (s[i + 1] / 255) * 0.28);
    if (a <= 0) continue;
    d[i] = w.rgb[0];
    d[i + 1] = w.rgb[1];
    d[i + 2] = w.rgb[2];
    d[i + 3] = Math.round(a * 255);
  }
  cx.putImageData(img, 0, 0);
  return c;
}

function trace(g: G, pts: readonly Pt[]): void {
  g.beginPath();
  pts.forEach(([x, y], i) => (i === 0 ? g.moveTo(x, y) : g.lineTo(x, y)));
  g.closePath();
}

function deckle(r: Rect, rnd: () => number, amp = 2.2, step = 8): Pt[] {
  const pts: Pt[] = [], j = () => (rnd() - 0.5) * amp, { x, y, width: w, height: h } = r;
  for (let i = 0; i < w; i += step) pts.push([x + i, y + j()]);
  for (let i = 0; i < h; i += step) pts.push([x + w + j(), y + i]);
  for (let i = w; i > 0; i -= step) pts.push([x + i, y + h + j()]);
  for (let i = h; i > 0; i -= step) pts.push([x + j(), y + i]);
  return pts;
}

export function scrap(g: G, r: Rect, seed: number, o: { tint?: string; deep?: string; alpha?: number; shadow?: boolean } = {}): void {
  const rnd = rand(seed), pts = deckle(r, rnd);
  g.save();
  g.globalAlpha *= o.alpha ?? 1;
  if (o.shadow !== false) {
    g.save();
    g.translate(1.5, 3);
    trace(g, pts);
    g.fillStyle = 'rgba(52,36,20,0.22)';
    g.fill();
    g.restore();
  }
  trace(g, pts);
  const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
  const grd = g.createRadialGradient(cx, cy - r.height * 0.1, Math.min(r.width, r.height) * 0.15, cx, cy, Math.hypot(r.width, r.height) * 0.62);
  grd.addColorStop(0, o.tint ?? PAPER);
  grd.addColorStop(1, o.deep ?? PAPER_DEEP);
  g.fillStyle = grd;
  g.fill();
  g.clip();
  const n = Math.round((r.width * r.height) / 7000);
  for (let i = 0; i < n; i++) {
    g.fillStyle = `rgba(128,90,44,${(0.03 + rnd() * 0.05).toFixed(3)})`;
    g.beginPath();
    g.arc(r.x + rnd() * r.width, r.y + rnd() * r.height, 1 + rnd() * 6, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
}

export function inkRect(g: G, r: Rect, seed: number, p = 1, colour: string = INK, w = 1.4): void {
  if (p <= 0) return;
  const rnd = rand(seed), j = () => (rnd() - 0.5) * 1.6, { x, y, width: W, height: H } = r;
  const sides: Pt[][] = [
    [[x + j(), y + j()], [x + W / 2, y + j()], [x + W + j(), y + j()]],
    [[x + W + j(), y], [x + W + j(), y + H / 2], [x + W + j(), y + H + j()]],
    [[x + W, y + H + j()], [x + W / 2, y + H + j()], [x + j(), y + H + j()]],
    [[x + j(), y + H], [x + j(), y + H / 2], [x + j(), y + j()]],
  ];
  sides.forEach((pts, i) => nib(g, pts, w, clamp01(p * 4 - i), colour));
}

function around(x: number, y: number, w: number, h: number, s: number): Pt {
  const per = 2 * (w + h);
  s = ((s % per) + per) % per;
  if (s < w) return [x + s, y];
  if (s < w + h) return [x + w, y + s - w];
  if (s < 2 * w + h) return [x + w - (s - w - h), y + h];
  return [x, y + h - (s - 2 * w - h)];
}

export function goldLeaf(g: G, r: Rect, seed: number, p = 1, band = Math.max(6, Math.min(r.width, r.height) * 0.045)): void {
  if (p <= 0) return;
  const rnd = rand(seed), { x, y, width: w, height: h } = r;
  g.save();
  g.globalAlpha *= clamp01(p * 1.6);
  const grd = g.createLinearGradient(x, y, x + w, y + h);
  [[0, GOLD_DARK], [0.2, GOLD], [0.36, GOLD_LIGHT], [0.5, GOLD], [0.76, GOLD_DARK], [0.9, GOLD_LIGHT], [1, GOLD]].forEach(([at, c]) => grd.addColorStop(at as number, c as string));
  g.beginPath();
  g.rect(x, y, w, h);
  g.rect(x + band, y + band, w - 2 * band, h - 2 * band);
  g.fillStyle = grd;
  g.fill('evenodd');
  g.strokeStyle = rgba(GOLD_DARK, 0.9);
  g.lineWidth = 0.8;
  g.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  g.strokeRect(x + band - 0.5, y + band - 0.5, w - 2 * band + 1, h - 2 * band + 1);
  const m = band / 2, per = 2 * (w + h - 4 * m), step = Math.max(5, band * 0.9);
  g.fillStyle = 'rgba(90,61,12,0.45)';
  for (let s = 0; s < per * clamp01(p); s += step) {
    const [px, py] = around(x + m, y + m, w - 2 * m, h - 2 * m, s);
    g.beginPath();
    g.arc(px, py, Math.max(0.7, band * 0.11), 0, Math.PI * 2);
    g.fill();
  }
  for (let i = 0; i < 6; i++) {
    const [px, py] = around(x + m, y + m, w - 2 * m, h - 2 * m, rnd() * per), gl = g.createRadialGradient(px, py, 0, px, py, band * 1.8);
    gl.addColorStop(0, 'rgba(255,250,225,0.85)');
    gl.addColorStop(1, 'rgba(255,250,225,0)');
    g.fillStyle = gl;
    g.beginPath();
    g.arc(px, py, band * 1.8, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
}

export function inkButton(g: G, r: Rect, label: string, k: number, p = 1, colour: string = INK, seed = 4242): void {
  if (p <= 0) return;
  g.save();
  g.globalAlpha *= clamp01(p * 2);
  scrap(g, r, seed, { tint: '#f6ecd4' });
  inkRect(g, inset(r, 3), seed + 1, p, colour, 1.3 * k);
  letter(g, label, r.x + r.width / 2, r.y + r.height / 2, { size: 21 * k, align: 'center', valign: 'middle' }, colour, clamp01(p * 1.4));
  g.restore();
}

export function quad(a: Pt, c: Pt, b: Pt, n = 16): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    out.push([u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]]);
  }
  return out;
}

export function kite(g: G, cx: number, cy: number, an: number, len: number, wid: number, dark: string, light: string, k: number): void {
  const tip: [number, number] = [cx + Math.sin(an) * len, cy - Math.cos(an) * len];
  const l: [number, number] = [cx + Math.sin(an - Math.PI / 2) * wid, cy - Math.cos(an - Math.PI / 2) * wid];
  const r: [number, number] = [cx + Math.sin(an + Math.PI / 2) * wid, cy - Math.cos(an + Math.PI / 2) * wid];
  g.beginPath(); g.moveTo(cx, cy); g.lineTo(...l); g.lineTo(...tip); g.closePath(); g.fillStyle = dark; g.fill();
  g.beginPath(); g.moveTo(cx, cy); g.lineTo(...r); g.lineTo(...tip); g.closePath(); g.fillStyle = light; g.fill();
  g.beginPath(); g.moveTo(...l); g.lineTo(...tip); g.lineTo(...r); g.strokeStyle = rgba(INK, 0.85); g.lineWidth = 0.7 * k; g.stroke();
}

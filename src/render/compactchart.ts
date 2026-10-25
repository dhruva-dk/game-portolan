// WP24 part D: the compact chart, WP25's always-on round inset: your waters round the player (north up, the player at
// the centre, COMPACT.reach u to the rim), the coasts as a wash, rivals in sight with heading ticks (hull-down hollow),
// the storm's wall and its next shrink, the gull-marked loot. A 2D canvas overlay WP25 mounts in its HUD slot: no draw
// call on the GPU; redrawn at most COMPACT.hz a second, its land and waters re-sampled on a COMPACT.grid² lattice.
import type { World } from '../app/worldWorker.ts';
import { gullMarks } from '../sim/gull.ts';
import { cellOf, localFrame, R, TERRITORY } from '../sim/sphere.ts';
import { PHASE, SHIPS, type MatchState } from '../sim/state.ts';
import { newStormView, stormView, type Calm } from '../sim/storm.ts';
import type { Sight } from '../sim/visibility.ts';
import { linearVec } from '../style/glsl.ts';
import { PIGMENTS } from '../style/palette.ts';
import { chartShips, groundOf } from './chart.ts';
import { watersFor } from './chartmarks.ts';

export const COMPACT = { reach: 64, px: 116, grid: 44, hz: 15 } as const;

type P = { x: number; y: number; z: number };
export interface CompactShip { i: number; x: number; y: number; hx: number; hy: number; hull: boolean }
/** Disc coordinates: −1..1, x east, y north. Rings and loot as flat x, y pairs. */
export interface CompactMarks { ships: CompactShip[]; shown: number; head: { x: number; y: number }; calm: number[][]; next: number[][]; finds: number[]; chests: number[] }

const dot = (a: P, b: P) => a.x * b.x + a.y * b.y + a.z * b.z;
const unit = (a: P): P => { const l = Math.hypot(a.x, a.y, a.z) || 1; return { x: a.x / l, y: a.y / l, z: a.z / l }; };

/** Where q falls on the disc round p (east e, north n): into out; false past the rim. */
function onDisc(q: P, p: P, e: P, n: P, reach: number, out: { x: number; y: number }): boolean {
  const c = dot(q, p) / (Math.hypot(q.x, q.y, q.z) || 1), d = (Math.acos(Math.max(-1, Math.min(1, c))) * R) / reach;
  const x = dot(q, e), y = dot(q, n), l = Math.hypot(x, y);
  if (l < 1e-12) { out.x = out.y = 0; return true; }
  out.x = (x / l) * d; out.y = (y / l) * d;
  return d <= 1;
}

function ring(calm: Calm, p: P, e: P, n: P, reach: number): number[][] {
  const a = unit(calm.at), ax = Math.abs(a.y) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
  const e1 = unit({ x: a.y * ax.z - a.z * ax.y, y: a.z * ax.x - a.x * ax.z, z: a.x * ax.y - a.y * ax.x });
  const e2 = { x: a.y * e1.z - a.z * e1.y, y: a.z * e1.x - a.x * e1.z, z: a.x * e1.y - a.y * e1.x };
  const cr = Math.cos(calm.r), sr = Math.sin(calm.r), out: number[][] = [], at = { x: 0, y: 0 };
  let cur: number[] = [];
  for (let i = 0; i <= 160; i++) {
    const th = (i / 160) * Math.PI * 2, ct = Math.cos(th), st = Math.sin(th);
    const q = { x: a.x * cr + (e1.x * ct + e2.x * st) * sr, y: a.y * cr + (e1.y * ct + e2.y * st) * sr, z: a.z * cr + (e1.z * ct + e2.z * st) * sr };
    if (onDisc(q, p, e, n, reach, at) || Math.hypot(at.x, at.y) < 1.08) cur.push(at.x, at.y);
    else if (cur.length) { if (cur.length > 2) out.push(cur); cur = []; }
  }
  if (cur.length > 2) out.push(cur);
  return out;
}

const stormV = newStormView();
/** What the compact chart shows (pure; the test holds its ships to the player's sight). */
export function compactMarks(state: MatchState, world: World | null, sight: Sight | null, reach: number = COMPACT.reach): CompactMarks {
  const me = state.ships[0], p = unit(me.pos), e = { x: 0, y: 0, z: 0 }, n = { x: 0, y: 0, z: 0 };
  localFrame(p, e, n);
  const hx = dot(me.head, e), hy = dot(me.head, n), hl = Math.hypot(hx, hy) || 1;
  const out: CompactMarks = { ships: [], shown: 0, head: { x: hx / hl, y: hy / hl }, calm: [], next: [], finds: [], chests: [] };
  const mask = chartShips(state, sight), at = { x: 0, y: 0 };
  for (let i = 1; i < SHIPS && i < state.ships.length; i++) {
    if (!(mask & (1 << i))) continue;
    const s = state.ships[i];
    if (s.phase === PHASE.sunk || !onDisc(s.pos, p, e, n, reach, at)) continue;
    let h: P = s.captain.intent;
    if (Math.hypot(h.x, h.y, h.z) < 1e-9) h = s.head;
    const x = dot(h, e), y = dot(h, n), l = Math.hypot(x, y) || 1;
    out.ships.push({ i, x: at.x, y: at.y, hx: x / l, hy: y / l, hull: !!(sight && sight.hulls & (1 << i)) });
    out.shown |= 1 << i;
  }
  const v = stormView(state, stormV);
  if (v.calm.r < Math.PI - 1e-3) out.calm = ring(v.calm, p, e, n, reach);
  if (v.announced && v.next.r < v.calm.r - 1e-4) out.next = ring(v.next, p, e, n, reach);
  if (world) {
    const sea = watersFor(world, state.seed), f: number[] = [], c: number[] = [];
    gullMarks(sea, state, 0, f, c);
    for (const k of f) if (onDisc(sea.geo.finds[k].pos, p, e, n, reach, at)) out.finds.push(at.x, at.y);
    for (const k of c) if (onDisc(state.chests[k].at, p, e, n, reach, at)) out.chests.push(at.x, at.y);
  }
  return out;
}

/** A palette entry as CSS (PIGMENTS hold THREE colours). */
function css(c: Parameters<typeof linearVec>[0], a = 1): string {
  const [r, g, b] = linearVec(c).toArray().map((v) => Math.round(255 * Math.min(1, Math.max(0, v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055))));
  return `rgba(${r},${g},${b},${a})`;
}
/** The chart's parchment (chart.ts uCParch's hue). */
const PAPER = '#efe3c6';

/** The compact chart: WP25 mounts `canvas` (mount(host)), calls draw() each frame and onTap(() => rig.zoom.open()). */
export class CompactChart {
  readonly canvas: HTMLCanvasElement;
  /** The rivals drawn on the last draw (bits, Sight.ships order). */
  shown = 0;
  private readonly land: HTMLCanvasElement;
  private last = -Infinity;
  private ground: ((d: P) => number) | null = null;
  private groundWorld: World | null = null;
  readonly px: number;
  constructor(px: number = COMPACT.px, doc: Document = document) {
    this.px = px;
    this.canvas = doc.createElement('canvas');
    this.canvas.className = 'compact-chart';
    Object.assign(this.canvas.style, { width: `${px}px`, height: `${px}px`, borderRadius: '50%', touchAction: 'none', display: 'block' });
    this.land = doc.createElement('canvas');
    this.land.width = this.land.height = COMPACT.grid;
  }
  mount(host: HTMLElement): this { host.appendChild(this.canvas); return this; }
  onTap(open: () => void): void { this.canvas.addEventListener('pointerup', (ev) => { ev.stopPropagation(); open(); }); }
  dispose(): void { this.canvas.remove(); }

  /** Land, the player's waters and rivals' waters on the lattice, into the small canvas. */
  private sample(state: MatchState, world: World | null): void {
    const G = COMPACT.grid, g = this.land.getContext('2d')!, img = g.createImageData(G, G);
    if (world && this.groundWorld !== world) { this.ground = groundOf(world); this.groundWorld = world; }
    const me = unit(state.ships[0].pos), e = { x: 0, y: 0, z: 0 }, n = { x: 0, y: 0, z: 0 }, d = { x: 0, y: 0, z: 0 };
    localFrame(me, e, n);
    for (let iy = 0; iy < G; iy++) for (let ix = 0; ix < G; ix++) {
      const x = ((ix + 0.5) / G) * 2 - 1, y = 1 - ((iy + 0.5) / G) * 2, r = Math.hypot(x, y);
      if (r > 1.02) continue;
      const ang = (r * COMPACT.reach) / R, cs = Math.cos(ang), sn = r > 1e-9 ? Math.sin(ang) / r : 0;
      d.x = me.x * cs + (e.x * x + n.x * y) * sn; d.y = me.y * cs + (e.y * x + n.y * y) * sn; d.z = me.z * cs + (e.z * x + n.z * y) * sn;
      const o = 4 * (iy * G + ix), own = state.owner[cellOf(TERRITORY, d)];
      if (this.ground && this.ground(d) > 0) { img.data[o] = 141; img.data[o + 1] = 106; img.data[o + 2] = 69; img.data[o + 3] = 150; }
      else if (own === 1) { img.data[o] = 200; img.data[o + 1] = 70; img.data[o + 2] = 45; img.data[o + 3] = 95; }
      else if (own > 1) { img.data[o] = 42; img.data[o + 1] = 33; img.data[o + 2] = 28; img.data[o + 3] = 34; }
    }
    g.putImageData(img, 0, 0);
  }

  draw(state: MatchState, world: World | null, sight: Sight | null, clock: number, dpr: number = globalThis.devicePixelRatio ?? 1): void {
    if (clock >= this.last && clock - this.last < 1 / COMPACT.hz) return;
    this.last = clock;
    const cv = this.canvas, W = Math.round(this.px * dpr);
    if (cv.width !== W) cv.width = cv.height = W;
    const g = cv.getContext('2d')!, r = W / 2, m = compactMarks(state, world, sight), k = r - 2 * dpr;
    const X = (x: number) => r + x * k, Y = (y: number) => r - y * k;
    const INK = css(PIGMENTS.ironGall), VERM = css(PIGMENTS.vermilion), GOLD = css(PIGMENTS.goldLeaf);
    this.shown = m.shown;
    g.clearRect(0, 0, W, W);
    g.save();
    g.beginPath(); g.arc(r, r, r - dpr, 0, Math.PI * 2); g.clip();
    g.fillStyle = PAPER; g.fillRect(0, 0, W, W);
    const wash = g.createRadialGradient(r, r, r * 0.15, r, r, r);
    wash.addColorStop(0, css(PIGMENTS.ultramarine, 0.06)); wash.addColorStop(1, css(PIGMENTS.ultramarine, 0.22));
    g.fillStyle = wash; g.fillRect(0, 0, W, W);
    this.sample(state, world);
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    g.drawImage(this.land, 0, 0, W, W);
    // a light rhumb cross through the player
    g.strokeStyle = css(PIGMENTS.ironGall, 0.18); g.lineWidth = 0.6 * dpr;
    for (let a = 0; a < 4; a++) { const t = (a * Math.PI) / 4; g.beginPath(); g.moveTo(X(-Math.cos(t)), Y(-Math.sin(t))); g.lineTo(X(Math.cos(t)), Y(Math.sin(t))); g.stroke(); }
    const line = (pts: number[], w: number, col: string, dash: number[] = []) => {
      g.beginPath(); g.setLineDash(dash.map((v) => v * dpr)); g.strokeStyle = col; g.lineWidth = w * dpr;
      for (let i = 0; i < pts.length; i += 2) (i ? g.lineTo : g.moveTo).call(g, X(pts[i]), Y(pts[i + 1]));
      g.stroke(); g.setLineDash([]);
    };
    for (const pl of m.calm) line(pl, 2, INK);
    for (const pl of m.next) line(pl, 1.3, VERM, [4, 3]);
    for (let i = 0; i < m.finds.length; i += 2) {
      const x = X(m.finds[i]), y = Y(m.finds[i + 1]), s = 3 * dpr;
      g.fillStyle = GOLD; g.beginPath(); g.arc(x, y, s, 0, Math.PI * 2); g.fill();
      g.strokeStyle = INK; g.lineWidth = 1 * dpr; g.beginPath(); g.moveTo(x - s, y - s); g.lineTo(x + s, y + s); g.moveTo(x - s, y + s); g.lineTo(x + s, y - s); g.stroke();
    }
    for (let i = 0; i < m.chests.length; i += 2) {
      const x = X(m.chests[i]), y = Y(m.chests[i + 1]), s = 3.4 * dpr;
      g.fillStyle = GOLD; g.strokeStyle = INK; g.lineWidth = 1 * dpr;
      g.beginPath(); g.moveTo(x, y - s); g.lineTo(x + s, y); g.lineTo(x, y + s); g.lineTo(x - s, y); g.closePath(); g.fill(); g.stroke();
    }
    const mark = (x: number, y: number, hx: number, hy: number, s: number, col: string, fill: boolean) => {
      const px = X(x), py = Y(y), fx = hx, fy = -hy, sx = -fy, sy = fx;
      g.beginPath();
      g.moveTo(px + fx * s * 1.4, py + fy * s * 1.4);
      g.lineTo(px - fx * s + sx * s * 0.8, py - fy * s + sy * s * 0.8);
      g.lineTo(px - fx * s * 0.5, py - fy * s * 0.5);
      g.lineTo(px - fx * s - sx * s * 0.8, py - fy * s - sy * s * 0.8);
      g.closePath();
      g.lineWidth = 1.1 * dpr; g.strokeStyle = col; g.fillStyle = col;
      if (fill) g.fill(); g.stroke();
    };
    for (const s of m.ships) mark(s.x, s.y, s.hx, s.hy, 3.6 * dpr, INK, s.hull);
    mark(0, 0, m.head.x, m.head.y, 4.4 * dpr, VERM, true);
    g.restore();
    // the rim and its north tick
    g.strokeStyle = INK; g.lineWidth = 1.6 * dpr;
    g.beginPath(); g.arc(r, r, r - 1.2 * dpr, 0, Math.PI * 2); g.stroke();
    g.fillStyle = INK; g.beginPath(); g.moveTo(r, 1.5 * dpr); g.lineTo(r + 3.2 * dpr, 8 * dpr); g.lineTo(r - 3.2 * dpr, 8 * dpr); g.closePath(); g.fill();
  }
}

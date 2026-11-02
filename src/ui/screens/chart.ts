// The charts: the career's parchment map of the sixteen seas, inked in as you sail them, and the Gale's globe with
// the day side, the seas in glide reach, the road ahead and where you are. Both are drawn on canvases from one
// mask of the world, sampled once: which region each cell lies in, and how high its ground stands. The HUD's map
// samples the land round the ship itself, finer, as she sails.
import { DRAFT, REGIONS, REGION_COUNT, heightExact, regionAt } from '../../sim/world/index.ts';
import { R, fromLatLon, localFrame } from '../../sim/sphere.ts';
import { v3, type V3 } from '../../sim/math.ts';
import { FONT } from '../parts/tokens.ts';
import type { ChartRegionView, GaleModel } from '../model.ts';

const DEG = Math.PI / 180;
/** The mask: an equirectangular grid, west to east and north to south. */
const MW = 384, MH = 192;

interface Mask { region: Uint8Array; height: Float32Array }
let MASK: Mask | null = null;

function mask(): Mask {
  if (MASK) return MASK;
  const region = new Uint8Array(MW * MH), height = new Float32Array(MW * MH), p = v3();
  for (let j = 0; j < MH; j++) {
    const lat = 90 - ((j + 0.5) * 180) / MH;
    for (let i = 0; i < MW; i++) {
      fromLatLon(lat * DEG, (-180 + ((i + 0.5) * 360) / MW) * DEG, p);
      region[j * MW + i] = regionAt(p);
      height[j * MW + i] = heightExact(p);
    }
  }
  return (MASK = { region, height });
}

/** Samples the world for the charts ahead of the first one, off the frame that asked. */
export function warmChart(): void {
  if (!MASK) setTimeout(mask, 0);
}

const cell = (lat: number, lon: number): number => {
  const j = Math.min(MH - 1, Math.max(0, Math.floor(((90 - lat) / 180) * MH)));
  const i = ((Math.floor(((lon + 180) / 360) * MW) % MW) + MW) % MW;
  return j * MW + i;
};

type RGB = readonly [number, number, number];
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

const PAPER: RGB = [233, 217, 180], INK: RGB = [58, 36, 20], SEA: RGB = [150, 182, 164], DEEP: RGB = [96, 138, 136];
const LAND: RGB = [201, 167, 106], HIGH: RGB = [164, 124, 72];

/** A ground height as chart colour: washed sea deepening offshore, ochre land browning with height. */
function ground(h: number): RGB {
  return h < 0 ? mix(SEA, DEEP, Math.min(1, -h / 14)) : mix(LAND, HIGH, Math.min(1, h / 40));
}

/** Fits a canvas's backing store to its laid-out size; false while it has none. */
function fit(c: HTMLCanvasElement): boolean {
  const r = c.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1);
  if (r.width < 4 || r.height < 4) return false;
  const w = Math.round(r.width * dpr), h = Math.round(r.height * dpr);
  if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
  return true;
}

const label = (g: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, colour: string, halo: string) => {
  g.font = `700 ${size}px ${FONT.display}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineWidth = size * 0.28;
  g.strokeStyle = halo;
  g.strokeText(text, x, y);
  g.fillStyle = colour;
  g.fillText(text, x, y);
};

interface Box { x0: number; y0: number; x1: number; y1: number }

/** A label block's middle (x, y), `half` wide each way, `up` above and `down` below, moved toward the centre (cx, cy)
 *  until all its corners lie within `limit` of it. */
function inside(x: number, y: number, half: number, up: number, down: number, cx: number, cy: number, limit: number): { x: number; y: number } {
  for (let i = 0; i < 8; i++) {
    let worst = 0;
    for (const [dx, dy] of [[-half, -up], [half, -up], [-half, down], [half, down]]) worst = Math.max(worst, Math.hypot(x + dx - cx, y + dy - cy));
    if (worst <= limit) break;
    // step in by the overshoot, along the line to the centre
    const d = Math.hypot(x - cx, y - cy) || 1, k = Math.min(1, (worst - limit + 1) / d);
    x -= (x - cx) * k;
    y -= (y - cy) * k;
  }
  return { x, y };
}

// ── the career's chart ──

/** The whole world on parchment: the seas you have sailed inked in with their coasts, the rest left blank. */
export function drawChart(c: HTMLCanvasElement, chart: readonly ChartRegionView[]): void {
  if (!fit(c)) return;
  const m = mask(), sailed = new Uint8Array(REGION_COUNT);
  for (const r of chart) sailed[r.index] = r.sailed > 0 ? 1 : 0;
  const img = new ImageData(MW, MH), d = img.data;
  for (let k = 0; k < MW * MH; k++) {
    const r = m.region[k], i = k % MW, j = (k / MW) | 0, h = m.height[k];
    const east = m.region[j * MW + ((i + 1) % MW)], south = j + 1 < MH ? m.region[k + MW] : r;
    let col: RGB = PAPER;
    if (sailed[r]) {
      col = ground(h);
      const he = m.height[j * MW + ((i + 1) % MW)], hs = j + 1 < MH ? m.height[k + MW] : h;
      if ((h >= 0) !== (he >= 0) || (h >= 0) !== (hs >= 0)) col = mix(col, INK, 0.75);
    }
    if (r !== east || r !== south) col = mix(col, INK, sailed[r] || sailed[east] || sailed[south] ? 0.5 : 0.22);
    // the paper's grain
    const n = ((i * 73856093) ^ (j * 19349663)) & 15;
    d[k * 4] = col[0] - n * 0.6;
    d[k * 4 + 1] = col[1] - n * 0.6;
    d[k * 4 + 2] = col[2] - n * 0.6;
    d[k * 4 + 3] = 255;
  }
  const off = document.createElement('canvas');
  off.width = MW;
  off.height = MH;
  off.getContext('2d')!.putImageData(img, 0, 0);
  // the chart keeps its 2:1 in whatever box it gets, centred
  const g = c.getContext('2d')!, W = Math.min(c.width, c.height * 2), H = W / 2;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, c.width, c.height);
  g.translate((c.width - W) / 2, (c.height - H) / 2);
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = 'high';
  g.drawImage(off, 0, 0, W, H);
  g.save();
  g.beginPath();
  g.rect(0, 0, W, H);
  g.clip();
  // rhumb lines from two wind roses, as old charts have them
  g.save();
  g.strokeStyle = 'rgba(120, 60, 30, 0.22)';
  g.lineWidth = Math.max(1, W / 900);
  for (const [cx, cy] of [[0.27, 0.62], [0.74, 0.36]]) {
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      g.beginPath();
      g.moveTo(cx * W, cy * H);
      g.lineTo(cx * W + Math.cos(a) * W, cy * H + Math.sin(a) * W);
      g.stroke();
    }
  }
  g.restore();
  g.restore();
  // names: the seas you know in ink, the rest faint
  const size = Math.max(9, W / 64);
  for (let ri = 0; ri < REGIONS.length; ri++) {
    const r = REGIONS[ri], known = sailed[ri];
    const x = ((r.lon + 180) / 360) * W, y = ((90 - r.lat) / 180) * H;
    label(g, r.name, x, y, size, known ? 'rgb(58, 36, 20)' : 'rgba(58, 36, 20, 0.38)', known ? 'rgba(240, 226, 192, 0.85)' : 'rgba(240, 226, 192, 0.4)');
  }
  g.strokeStyle = 'rgba(58, 36, 20, 0.8)';
  g.lineWidth = Math.max(1.5, W / 420);
  g.strokeRect(g.lineWidth / 2, g.lineWidth / 2, W - g.lineWidth, H - g.lineWidth);
  g.setTransform(1, 0, 0, 1, 0, 0);
}

// ── the Gale's globe ──

const GLOBE = 220;

export interface Globe {
  el: HTMLCanvasElement;
  set(m: GaleModel): void;
}

/** The planet as a globe turned to where you ride. Tapping a sea in reach marks it; tapping it again clears it. */
export function galeGlobe(onPick: (region: number) => void, className = ''): Globe {
  const c = document.createElement('canvas');
  c.className = `s-globe${className ? ' ' + className : ''}`;
  const off = document.createElement('canvas');
  off.width = off.height = GLOBE;
  const img = new ImageData(GLOBE, GLOBE);
  const C = v3(), E = v3(), N = v3(), SUN = v3(), P = v3();
  let model: GaleModel | null = null, drawn = '';

  /** The basis the globe is seen in: C toward the viewer, E right, N up. */
  const basis = (lat: number, lon: number) => {
    fromLatLon(lat * DEG, lon * DEG, C);
    // east, the sim's way round: longitude grows toward −z; north is C × E
    E.x = -Math.sin(lon * DEG); E.y = 0; E.z = -Math.cos(lon * DEG);
    N.x = C.y * E.z - C.z * E.y; N.y = C.z * E.x - C.x * E.z; N.z = C.x * E.y - C.y * E.x;
  };

  /** A point on the planet in globe space: x right, y up, z toward the viewer. */
  const project = (lat: number, lon: number) => {
    fromLatLon(lat * DEG, lon * DEG, P);
    return { x: P.x * E.x + P.y * E.y + P.z * E.z, y: P.x * N.x + P.y * N.y + P.z * N.z, z: P.x * C.x + P.y * C.y + P.z * C.z };
  };

  const paint = (mm: GaleModel) => {
    const msk = mask(), d = img.data, open = mm.regions.map((r) => r.open);
    fromLatLon(mm.sun.lat * DEG, mm.sun.lon * DEG, SUN);
    for (let py = 0; py < GLOBE; py++) {
      const y = 1 - ((py + 0.5) / GLOBE) * 2;
      for (let px = 0; px < GLOBE; px++) {
        const x = ((px + 0.5) / GLOBE) * 2 - 1, rr = x * x + y * y, o = (py * GLOBE + px) * 4;
        if (rr > 1) { d[o + 3] = 0; continue; }
        const z = Math.sqrt(1 - rr);
        const wx = C.x * z + E.x * x + N.x * y, wy = C.y * z + E.y * x + N.y * y, wz = C.z * z + E.z * x + N.z * y;
        const lat = Math.asin(Math.max(-1, Math.min(1, wy))) / DEG, lon = Math.atan2(-wz, wx) / DEG;
        const k = cell(lat, lon), r = msk.region[k];
        let col = ground(msk.height[k]);
        if (!open[r]) col = mix(col, [70, 70, 74], 0.55);
        if (r === mm.pick) col = mix(col, [255, 210, 110], 0.35);
        const k2 = cell(lat + 180 / MH, lon), k3 = cell(lat, lon + 360 / MW);
        if (msk.region[k2] !== r || msk.region[k3] !== r) col = mix(col, INK, open[r] ? 0.7 : 0.4);
        // day and night, with a soft dusk, and the limb darkening
        const sun = wx * SUN.x + wy * SUN.y + wz * SUN.z, light = 0.32 + 0.68 * Math.min(1, Math.max(0, sun * 3 + 0.35));
        const limb = 0.75 + 0.25 * z, f = light * limb;
        d[o] = col[0] * f; d[o + 1] = col[1] * f; d[o + 2] = col[2] * (f * 0.92 + (1 - light) * 0.25);
        d[o + 3] = 255;
      }
    }
    off.getContext('2d')!.putImageData(img, 0, 0);
  };

  const draw = () => {
    const mm = model;
    if (!mm || !fit(c)) return;
    basis(mm.at.lat, mm.at.lon);
    const key = `${mm.at.lat.toFixed(1)},${mm.at.lon.toFixed(1)},${mm.pick},${mm.sun.lon.toFixed(0)},${mm.regions.map((r) => (r.open ? 1 : 0)).join('')}`;
    if (key !== drawn) { paint(mm); drawn = key; }
    const g = c.getContext('2d')!, S = Math.min(c.width, c.height), cx = c.width / 2, cy = c.height / 2, rad = S * 0.46;
    g.clearRect(0, 0, c.width, c.height);
    // the air round the planet
    const air = g.createRadialGradient(cx, cy, rad * 0.96, cx, cy, rad * 1.08);
    air.addColorStop(0, 'rgba(255, 236, 196, 0.5)');
    air.addColorStop(1, 'rgba(255, 236, 196, 0)');
    g.fillStyle = air;
    g.beginPath();
    g.arc(cx, cy, rad * 1.08, 0, Math.PI * 2);
    g.fill();
    g.imageSmoothingEnabled = true;
    g.drawImage(off, cx - rad, cy - rad, rad * 2, rad * 2);
    g.strokeStyle = 'rgba(42, 26, 13, 0.9)';
    g.lineWidth = Math.max(1.5, S / 160);
    g.beginPath();
    g.arc(cx, cy, rad, 0, Math.PI * 2);
    g.stroke();
    // the road ahead, dashed, on the near side only
    g.save();
    g.setLineDash([S / 40, S / 60]);
    g.strokeStyle = 'rgba(255, 214, 120, 0.95)';
    g.lineWidth = Math.max(2, S / 90);
    g.lineCap = 'round';
    g.beginPath();
    let pen = false;
    for (const q of mm.path) {
      const p = project(q.lat, q.lon);
      if (p.z < 0.02) { pen = false; continue; }
      const sx = cx + p.x * rad, sy = cy - p.y * rad;
      if (pen) g.lineTo(sx, sy); else g.moveTo(sx, sy);
      pen = true;
    }
    g.stroke();
    g.restore();
    // the seas' names, and the captains heading for each: the pick first, then the nearest the middle, each kept
    // inside the globe and clear of those already down, nudged a line up or down, or left out if no nudge clears it
    const size = Math.max(9, S / 24), placed: Box[] = [];
    const seas = mm.regions.map((r) => ({ r, p: project(REGIONS[r.index].lat, REGIONS[r.index].lon) })).filter((q) => q.p.z >= 0.2)
      .sort((a, b) => Number(b.r.index === mm.pick) - Number(a.r.index === mm.pick) || b.p.z - a.p.z);
    for (const { r, p } of seas) {
      const info = REGIONS[r.index], on = r.index === mm.pick, fs = size * (on ? 1.15 : 1), ships = r.heading > 0 && r.open;
      g.font = `700 ${fs}px ${FONT.display}`;
      // the block round the name (and the ships line under it), from the name's middle
      const half = g.measureText(info.name).width / 2 + fs * 0.2, up = fs * 0.62, down = ships ? size * 1.15 + size * 0.55 : fs * 0.62;
      let spot: { x: number; y: number } | null = null;
      for (const nudge of [0, -1, 1, -2, 2]) {
        const q = inside(cx + p.x * rad, cy - p.y * rad + nudge * (up + down) * 0.6, half, up, down, cx, cy, rad * 0.97);
        if (!placed.some((b) => q.x + half > b.x0 && q.x - half < b.x1 && q.y + down > b.y0 && q.y - up < b.y1)) { spot = q; break; }
      }
      if (!spot && !on) continue;
      const { x: sx, y: sy } = spot ?? inside(cx + p.x * rad, cy - p.y * rad, half, up, down, cx, cy, rad * 0.97);
      placed.push({ x0: sx - half, x1: sx + half, y0: sy - up, y1: sy + down });
      const ink = on ? 'rgb(255, 222, 140)' : r.open ? 'rgb(255, 246, 226)' : 'rgba(255, 246, 226, 0.45)';
      label(g, info.name, sx, sy, fs, ink, 'rgba(26, 16, 8, 0.85)');
      if (ships) label(g, `${r.heading} ${r.heading === 1 ? 'ship' : 'ships'}`, sx, sy + size * 1.15, size * 0.85, 'rgba(255, 246, 226, 0.85)', 'rgba(26, 16, 8, 0.85)');
    }
    // you, at the centre, pointing along the road
    const next = mm.path[1] ? project(mm.path[1].lat, mm.path[1].lon) : { x: 0, y: 1, z: 1 };
    const a = Math.atan2(-next.y, next.x);
    g.save();
    g.translate(cx, cy);
    g.rotate(a);
    const u = S / 26;
    g.fillStyle = 'rgb(255, 214, 120)';
    g.strokeStyle = 'rgb(42, 26, 13)';
    g.lineWidth = Math.max(1.5, S / 200);
    g.beginPath();
    g.moveTo(u * 1.2, 0);
    g.lineTo(-u * 0.8, u * 0.7);
    g.lineTo(-u * 0.4, 0);
    g.lineTo(-u * 0.8, -u * 0.7);
    g.closePath();
    g.fill();
    g.stroke();
    g.restore();
  };

  c.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    const mm = model;
    if (!mm) return;
    const r = c.getBoundingClientRect(), S = Math.min(r.width, r.height), rad = S * 0.46;
    const x = (e.clientX - r.left - r.width / 2) / rad, y = -(e.clientY - r.top - r.height / 2) / rad, rr = x * x + y * y;
    if (rr > 1) return;
    basis(mm.at.lat, mm.at.lon);
    const z = Math.sqrt(1 - rr);
    P.x = C.x * z + E.x * x + N.x * y; P.y = C.y * z + E.y * x + N.y * y; P.z = C.z * z + E.z * x + N.z * y;
    const hit = regionAt(P);
    if (!mm.regions[hit]?.open) return;
    onPick(hit === mm.pick ? -1 : hit);
  });

  return {
    el: c,
    set(m: GaleModel) {
      model = m;
      draw();
    },
  };
}

// ── the HUD's map ──

/** Samples across the land once settled, and on the first draw, which takes them all at once. */
const LAND_N = 144, LAND_FIRST = 56;
/** How far the samples reach, as a share of the map's range, and how far the ship may sail, as a share, before they
 *  are taken afresh round her. The reach covers the map's circle however far she has sailed in that time. */
const LAND_OVER = 1.25, LAND_MOVE = 0.12;
/** Milliseconds each draw may spend sampling while fresh land is on the way. */
const LAND_BUDGET = 4;
const SHOAL: RGB = [190, 198, 150], COAST: RGB = [108, 74, 40];

interface LandGrid { n: number; span: number; at: V3; east: V3; north: V3; h: Float32Array; row: number }

const dot3 = (a: V3, b: V3): number => a.x * b.x + a.y * b.y + a.z * b.z;

/** The land round the ship for the HUD's map, north up: sampled from the world's heights a few rows a draw and kept
 *  until she has sailed a way off, then coloured against the tide, the shoals no keel can cross shown apart and the
 *  coast inked. */
export class LandLayer {
  private readonly canvas = document.createElement('canvas');
  private shown: LandGrid | null = null;
  private job: LandGrid | null = null;
  /** The grid on the canvas and the sea level it was coloured for. */
  private painted: LandGrid | null = null;
  private tide = 0;
  private readonly p = v3();
  private readonly e = v3();
  private readonly n = v3();
  private readonly q = v3();

  /** Draws the land into g's circle of radius c pixels, which shows `range` metres round lat, lon (degrees). */
  draw(g: CanvasRenderingContext2D, c: number, lat: number, lon: number, range: number, tide: number): void {
    const p = fromLatLon(lat * DEG, lon * DEG, this.p), e = this.e, n = this.n;
    localFrame(p, e, n);
    if (!this.shown) {
      this.start(LAND_FIRST, range);
      this.work(Infinity);
    }
    const s = this.shown!;
    const dx = R * (dot3(s.at, e) - dot3(p, e)), dy = R * (dot3(s.at, n) - dot3(p, n));
    if (this.job) this.work(LAND_BUDGET);
    else if (s.n < LAND_N || Math.hypot(dx, dy) > range * LAND_MOVE || Math.abs(s.span - range * LAND_OVER) > 1) this.start(LAND_N, range);
    const now = this.shown!;
    if (now !== this.painted || Math.abs(tide - this.tide) > 0.02) this.paint(tide);
    const k = c / range, w = 2 * now.span * k;
    const ox = R * (dot3(now.at, e) - dot3(p, e)), oy = R * (dot3(now.at, n) - dot3(p, n));
    g.save();
    g.translate(c + ox * k, c - oy * k);
    // the samples' north, as it lies here: near the poles it swings as she sails
    g.rotate(Math.atan2(dot3(now.north, e), dot3(now.north, n)));
    g.imageSmoothingEnabled = true;
    g.drawImage(this.canvas, -w / 2, -w / 2, w, w);
    g.restore();
  }

  /** Begins sampling n × n heights round the ship as she is now. */
  private start(n: number, range: number): void {
    this.job = { n, span: range * LAND_OVER, at: { ...this.p }, east: { ...this.e }, north: { ...this.n }, h: new Float32Array(n * n), row: 0 };
  }

  /** Samples rows until `ms` milliseconds are spent; the grid shows once its last row is in. */
  private work(ms: number): void {
    const j = this.job!, end = performance.now() + ms, q = this.q;
    while (j.row < j.n) {
      const y = j.span * (1 - (2 * (j.row + 0.5)) / j.n);
      for (let i = 0; i < j.n; i++) {
        // straight down onto the sphere from the plane the map is drawn on, as the map places everything else
        const x = j.span * ((2 * (i + 0.5)) / j.n - 1), z = Math.sqrt(Math.max(0, 1 - (x * x + y * y) / (R * R)));
        q.x = j.east.x * (x / R) + j.north.x * (y / R) + j.at.x * z;
        q.y = j.east.y * (x / R) + j.north.y * (y / R) + j.at.y * z;
        q.z = j.east.z * (x / R) + j.north.z * (y / R) + j.at.z * z;
        j.h[j.row * j.n + i] = heightExact(q);
      }
      j.row++;
      if (performance.now() > end) break;
    }
    if (j.row < j.n) return;
    this.shown = j;
    this.job = null;
  }

  /** Colours the shown heights against the sea level `tide`. */
  private paint(tide: number): void {
    const s = this.shown!, n = s.n, h = s.h;
    this.painted = s;
    this.tide = tide;
    if (this.canvas.width !== n) this.canvas.width = this.canvas.height = n;
    const g = this.canvas.getContext('2d');
    if (!g) return;
    const img = g.createImageData(n, n), d = img.data;
    const land = (i: number, j: number) => i < 0 || j < 0 || i >= n || j >= n || h[j * n + i] >= tide;
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const v = h[j * n + i] - tide;
        let c: RGB;
        if (v >= 0) c = land(i - 1, j) && land(i + 1, j) && land(i, j - 1) && land(i, j + 1) ? mix(LAND, HIGH, Math.min(1, v / 40)) : COAST;
        else if (v > -DRAFT) c = SHOAL;
        else c = mix(SEA, DEEP, Math.min(1, (-v - DRAFT) / 14));
        const o = (j * n + i) * 4;
        d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
  }
}

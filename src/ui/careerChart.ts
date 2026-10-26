import * as THREE from 'three';
import { FIND_SITES, RANK, type Career } from '../career/state.ts';
import { CHART_GRID, chartInked, chartSeen, toLetter, type Voyage } from '../career/voyage.ts';
import { sheet, sheetMesh } from '../render/harbourScene.ts';
import { v3, type V3 } from '../sim/math.ts';
import { cellDir } from '../sim/sphere.ts';
import { coastAt, heightAt, regionOf, type Geography } from '../sim/world/geography.ts';
import { REGIONS } from '../sim/world/regions.ts';
import type { ChartPage } from './harbour.ts';
import { INK, anchorIcon, nib, ring, shipGlyph } from './icons.ts';
import { settings } from './settings.ts';
import { GOLD, GOLD_DARK, PAPER, PAPER_DEEP, SEPIA, VERDIGRIS, VERMILION, clamp01, goldLeaf, inkRect, kite, letter, rand, rgb, rgba, scrap, type G } from './inkpage.ts';
import type { Rect } from './safeArea.ts';

const WASH = ['#8fb8c9', '#d4a656', '#5aa394', '#c98a5a', '#7f9a5b', '#b0694e', '#6f86a8', '#c4a24a', '#8e6fa0', '#5f8f86', '#d9b26a', '#9a6a4a', '#4f7a94', '#b47a6a'];
const BW = 360, BH = 180;
const LW = 2 * BW, LH = 2 * BH;

interface Geo { lat: Float32Array; lon: Float32Array; region: Uint8Array; centroids: { lat: number; lon: number; cells: number }[] }
let geo: Geo | null = null;

function geometry(): Geo {
  if (geo) return geo;
  const n = CHART_GRID.cells, lat = new Float32Array(n), lon = new Float32Array(n), region = new Uint8Array(n), d = v3();
  const sum = REGIONS.map(() => ({ x: 0, y: 0, z: 0, n: 0 }));
  for (let c = 0; c < n; c++) {
    cellDir(CHART_GRID, c, d);
    const len = Math.hypot(d.x, d.y, d.z) || 1, r = region[c] = regionOf(d), s = sum[r];
    lat[c] = Math.asin(d.y / len);
    lon[c] = Math.atan2(d.z, d.x);
    s.x += d.x / len;
    s.y += d.y / len;
    s.z += d.z / len;
    s.n++;
  }
  const centroids = sum.map((s) => { const len = Math.hypot(s.x, s.y, s.z) || 1; return { lat: Math.asin(s.y / len), lon: Math.atan2(s.z, s.x), cells: s.n }; });
  return (geo = { lat, lon, region, centroids });
}

export const regionCells = (): Uint8Array => geometry().region;

export interface ChartRegion { region: number; name: string; lat: number; lon: number; cells: number; inked: number; named: number; breakOffs: number }
export interface CareerChartData {
  regions: ChartRegion[];
  inked: number;
  named: number;
  matches: number;
  tier: number;
  wind: string;
  found: number;
  finds: number;
}

export function careerChartData(c: Career): CareerChartData {
  const g = geometry(), inked = chartInked(c);
  let seen = 0, found = 0;
  for (let i = 0; i < CHART_GRID.cells; i++) if (chartSeen(c.chart.seen, i)) seen++;
  for (let i = 0; i < c.chart.found.length; i++) if (c.chart.found[i]) found++;
  const regions = REGIONS.map((r, i) => ({
    region: i, name: r.name, lat: g.centroids[i].lat, lon: g.centroids[i].lon, cells: g.centroids[i].cells, inked: inked[i],
    named: c.chart.named[i].match, breakOffs: c.profile.breakOff[i] ?? 0,
  }));
  return {
    regions, inked: Math.floor((1000 * seen) / CHART_GRID.cells), named: regions.filter((r) => r.named >= 0).length, matches: c.match,
    tier: c.player.tier, wind: RANK.winds[Math.max(0, Math.min(RANK.winds.length, c.player.tier) - 1)], found, finds: FIND_SITES,
  };
}

export function inkedWords(permille: number): string {
  const w = permille <= 0 ? 'Nothing yet' : permille < 80 ? 'A sliver' : permille < 200 ? 'A tenth' : permille < 290 ? 'A quarter' : permille < 420 ? 'A third'
    : permille < 580 ? 'Half' : permille < 720 ? 'Two thirds' : permille < 850 ? 'Three quarters' : permille < 1000 ? 'Nearly all' : 'All the sea';
  return `${w} inked`;
}

const canvas = (w: number, h: number): HTMLCanvasElement => {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
};

interface Bins { region: Int16Array; seen: Uint8Array }
function binned(c: Career, g: Geo): Bins {
  const region = new Int16Array(BW * BH).fill(-1), seen = new Uint8Array(BW * BH);
  for (let i = 0; i < CHART_GRID.cells; i++) {
    const bx = Math.floor(((g.lon[i] + Math.PI) / (2 * Math.PI)) * BW), by = Math.min(BH - 1, Math.floor(((Math.PI / 2 - g.lat[i]) / Math.PI) * BH));
    const hw = Math.min(BW / 2, Math.ceil(0.75 / Math.max(0.02, Math.cos(g.lat[i])))), s = chartSeen(c.chart.seen, i);
    for (let dy = -1; dy <= 1; dy++) {
      const y = by + dy;
      if (y < 0 || y >= BH) continue;
      for (let dx = -hw; dx <= hw; dx++) {
        const j = y * BW + ((((bx + dx) % BW) + BW) % BW);
        if (region[j] < 0 || dy === 0) region[j] = g.region[i];
        if (s) seen[j] = 1;
      }
    }
  }
  return { region, seen };
}

interface Land { geo: Geography; height: Float32Array; shoal: Uint8Array }
let land: Land | null = null;

function landOf(geo: Geography): Land {
  if (land?.geo === geo) return land;
  const height = new Float32Array(LW * LH), shoal = new Uint8Array(LW * LH), d = v3();
  for (let y = 0; y < LH; y++) {
    const lat = Math.PI / 2 - ((y + 0.5) / LH) * Math.PI, cl = Math.cos(lat);
    for (let x = 0; x < LW; x++) {
      const lon = ((x + 0.5) / LW) * 2 * Math.PI - Math.PI, j = y * LW + x;
      d.x = cl * Math.cos(lon);
      d.y = Math.sin(lat);
      d.z = cl * Math.sin(lon);
      height[j] = heightAt(geo, d);
      if (height[j] <= 0 && coastAt(geo, d) < 0) shoal[j] = 1;
    }
  }
  return (land = { geo, height, shoal });
}

const SEGMENTS: readonly (readonly [number, number])[][] = [
  [], [[3, 0]], [[0, 1]], [[3, 1]], [[1, 2]], [[3, 0], [1, 2]], [[0, 2]], [[3, 2]], [[2, 3]], [[0, 2]], [[0, 1], [2, 3]], [[1, 2]], [[1, 3]], [[0, 1]], [[3, 0]], [],
];

function drawLand(g: G, M: Rect, bins: Bins, ld: Land, k: number, p: number): void {
  if (p <= 0) return;
  const { height: h, shoal } = ld, sx = M.width / LW, sy = M.height / LH;
  const seen = (x: number, y: number): boolean => bins.seen[(y >> 1) * BW + (x >> 1)] === 1;
  const lc = canvas(LW, LH), lx = lc.getContext('2d')!, img = lx.createImageData(LW, LH), [lr, lg, lb] = rgb('#c4a06a');
  for (let y = 0; y < LH; y++) {
    for (let x = 0; x < LW; x++) {
      const j = y * LW + x;
      if (h[j] <= 0 || !seen(x, y)) continue;
      img.data[j * 4] = lr;
      img.data[j * 4 + 1] = lg;
      img.data[j * 4 + 2] = lb;
      img.data[j * 4 + 3] = Math.min(220, 120 + h[j] * 2.2);
    }
  }
  lx.putImageData(img, 0, 0);
  g.save();
  g.globalAlpha *= p;
  g.imageSmoothingEnabled = true;
  g.drawImage(lc, M.x, M.y, M.width, M.height);
  const inked = new Path2D(), faint = new Path2D(), dots = new Path2D(), r = 0.55 * k;
  const X = (x: number): number => M.x + (x + 0.5) * sx, Y = (y: number): number => M.y + (y + 0.5) * sy;
  const t = (a: number, b: number): number => Math.max(0, Math.min(1, a / (a - b || 1e-6)));
  for (let y = 0; y < LH - 1; y++) {
    for (let x = 0; x < LW; x++) {
      const x1 = (x + 1) % LW, a = h[y * LW + x], b = h[y * LW + x1], c = h[(y + 1) * LW + x1], d = h[(y + 1) * LW + x];
      const look = seen(x, y);
      if (look && shoal[y * LW + x] && (x + 2 * y) % 3 === 0) { dots.moveTo(X(x) + r, Y(y)); dots.arc(X(x), Y(y), r, 0, Math.PI * 2); }
      const kase = (a > 0 ? 1 : 0) | (b > 0 ? 2 : 0) | (c > 0 ? 4 : 0) | (d > 0 ? 8 : 0);
      if (kase === 0 || kase === 15) continue;
      const edge = (e: number): [number, number] =>
        e === 0 ? [X(x + t(a, b)), Y(y)] : e === 1 ? [X(x + 1), Y(y + t(b, c))] : e === 2 ? [X(x + t(d, c)), Y(y + 1)] : [X(x), Y(y + t(a, d))];
      const path = look ? inked : faint;
      for (const [e0, e1] of SEGMENTS[kase]) { path.moveTo(...edge(e0)); path.lineTo(...edge(e1)); }
    }
  }
  g.lineCap = 'round';
  g.setLineDash([1.6 * k, 2.6 * k]);
  g.strokeStyle = rgba(SEPIA, 0.42);
  g.lineWidth = 0.75 * k;
  g.stroke(faint);
  g.setLineDash([]);
  g.fillStyle = rgba(SEPIA, 0.5);
  g.fill(dots);
  g.strokeStyle = rgba(SEPIA, 0.22);
  g.lineWidth = 3.2 * k;
  g.stroke(inked);
  g.strokeStyle = rgba(INK, 0.88);
  g.lineWidth = 1.05 * k;
  g.stroke(inked);
  g.restore();
}

function onPlate(pos: V3, M: Rect, bins: Bins): { x: number; y: number; seen: boolean } {
  const len = Math.hypot(pos.x, pos.y, pos.z) || 1, lat = Math.asin(pos.y / len), lon = Math.atan2(pos.z, pos.x);
  const fx = (lon + Math.PI) / (2 * Math.PI), fy = (Math.PI / 2 - lat) / Math.PI;
  const bx = Math.min(BW - 1, Math.floor(fx * BW)), by = Math.min(BH - 1, Math.floor(fy * BH));
  return { x: M.x + fx * M.width, y: M.y + fy * M.height, seen: bins.seen[by * BW + bx] === 1 };
}

function drawSites(g: G, career: Career, geo: Geography, M: Rect, bins: Bins, k: number, p: number): void {
  if (p <= 0) return;
  for (const l of geo.lights) {
    const q = onPlate(l.pos, M, bins);
    if (!q.seen) continue;
    nib(g, [[q.x - 1.6 * k, q.y + 3.5 * k], [q.x - 0.8 * k, q.y - 3.5 * k], [q.x + 0.8 * k, q.y - 3.5 * k], [q.x + 1.6 * k, q.y + 3.5 * k]], 1 * k, p, INK);
    g.beginPath();
    g.arc(q.x, q.y - 4.6 * k, 1.5 * k, 0, Math.PI * 2);
    g.fillStyle = rgba(GOLD, p);
    g.fill();
    for (const an of [-0.5, 0.5]) nib(g, [[q.x + Math.sin(an) * 2.5 * k, q.y - 4.6 * k - Math.cos(an) * 1.2 * k], [q.x + Math.sin(an) * 7 * k, q.y - 4.6 * k - Math.cos(an) * 2.5 * k]], 0.6 * k, p, GOLD_DARK);
  }
  for (const hb of geo.harbours) {
    const q = onPlate(hb.pos, M, bins);
    if (!q.seen) continue;
    nib(g, ring(q.x, q.y, 3.4 * k, 61), 1 * k, p, VERMILION);
    g.beginPath();
    g.arc(q.x, q.y, 1.2 * k, 0, Math.PI * 2);
    g.fillStyle = rgba(VERMILION, p);
    g.fill();
  }
  geo.finds.forEach((f, i) => {
    if (!career.chart.found[i]) return;
    const q = onPlate(f.pos, M, bins), s = 4 * k;
    if (f.kind === 'wreck') shipGlyph(g, q.x, q.y, s * 1.3, p);
    else {
      nib(g, [[q.x - s, q.y - s], [q.x + s, q.y + s]], 1.6 * k, p, VERMILION);
      nib(g, [[q.x + s, q.y - s], [q.x - s, q.y + s]], 1.6 * k, p, VERMILION);
    }
  });
}

export function compassRose(g: G, cx: number, cy: number, R: number, k: number, p = 1): void {
  if (p <= 0) return;
  g.save();
  g.globalAlpha *= clamp01(p);
  nib(g, ring(cx, cy, R * 1.06, 91), 1.4 * k, 1, INK);
  nib(g, ring(cx, cy, R * 0.98, 92), 0.8 * k, 1, SEPIA);
  for (let i = 0; i < 32; i++) {
    const an = (i / 32) * Math.PI * 2, a = R * 0.98, b = R * (i % 2 ? 1.02 : 1.06);
    nib(g, [[cx + Math.sin(an) * a, cy - Math.cos(an) * a], [cx + Math.sin(an) * b, cy - Math.cos(an) * b]], 0.7 * k, 1, INK);
  }
  for (const lvl of [2, 1, 0]) {
    for (let i = 0; i < 16; i++) {
      const l = i % 4 === 0 ? 0 : i % 2 === 0 ? 1 : 2;
      if (l !== lvl) continue;
      const an = (i / 16) * Math.PI * 2;
      kite(g, cx, cy, an, R * [0.95, 0.7, 0.48][l], R * [0.13, 0.1, 0.075][l], [rgba(INK, 0.85), rgba(VERMILION, 0.85), rgba(VERDIGRIS, 0.9)][l], PAPER, k);
    }
  }
  const ty = cy - R * 0.95;
  nib(g, [[cx, ty], [cx - R * 0.03, ty - R * 0.12], [cx, ty - R * 0.24]], 1.6 * k, 1, VERMILION);
  nib(g, [[cx, ty], [cx + R * 0.03, ty - R * 0.12], [cx, ty - R * 0.24]], 1.6 * k, 1, VERMILION);
  nib(g, [[cx, ty - R * 0.04], [cx - R * 0.12, ty - R * 0.1], [cx - R * 0.15, ty - R * 0.2], [cx - R * 0.08, ty - R * 0.18]], 1.4 * k, 1, VERMILION);
  nib(g, [[cx, ty - R * 0.04], [cx + R * 0.12, ty - R * 0.1], [cx + R * 0.15, ty - R * 0.2], [cx + R * 0.08, ty - R * 0.18]], 1.4 * k, 1, VERMILION);
  g.beginPath();
  g.arc(cx, cy, R * 0.07, 0, Math.PI * 2);
  g.fillStyle = GOLD;
  g.fill();
  nib(g, ring(cx, cy, R * 0.07, 93), 0.8 * k, 1, GOLD_DARK);
  g.restore();
}

function plate(w: number, h: number): { k: number; frame: number; M: Rect; X: (lon: number) => number; Y: (lat: number) => number } {
  const k = Math.max(0.8, Math.min(1.6, Math.min(w / 900, h / 450))), frame = Math.max(10, Math.min(w, h) * 0.035);
  const M: Rect = { x: frame * 1.8, y: frame * 1.8, width: w - frame * 3.6, height: h - frame * 3.6 };
  return { k, frame, M, X: (lon) => M.x + ((lon + Math.PI) / (2 * Math.PI)) * M.width, Y: (lat) => M.y + ((Math.PI / 2 - lat) / Math.PI) * M.height };
}

function letterName(g: G, r: ChartRegion, w: number, h: number, p: number): void {
  const { k, M, X, Y } = plate(w, h), size = Math.max(12, Math.min(28, 9 + Math.sqrt(r.cells) * 0.16)) * k;
  const y = Math.max(M.y + size * 0.8, Math.min(M.y + M.height - size * 0.8, Y(r.lat))), o = { size, align: 'center', valign: 'middle', swash: true } as const;
  const sc = Math.hypot(g.getTransform().a, g.getTransform().b), away = 8192;
  g.save();
  g.shadowColor = rgba(PAPER, 1);
  g.shadowOffsetX = away * sc;
  for (const blur of [2.5, 7]) {
    g.shadowBlur = blur * k * sc;
    letter(g, r.name, X(r.lon) - away, y, o, PAPER, p);
  }
  g.restore();
  letter(g, r.name, X(r.lon), y, o, INK, p, 0.92);
}

export interface ChartDraw { geo?: Geography | null; unnamed?: readonly number[] }

export function drawCareerChart(g: G, career: Career, w: number, h: number, p = 1, o: ChartDraw = {}): void {
  const gm = geometry(), data = careerChartData(career), { k, frame, M, X, Y } = plate(w, h);
  const grd = g.createRadialGradient(w / 2, h * 0.45, Math.min(w, h) * 0.2, w / 2, h / 2, Math.hypot(w, h) * 0.6);
  grd.addColorStop(0, PAPER);
  grd.addColorStop(1, PAPER_DEEP);
  g.fillStyle = grd;
  g.fillRect(0, 0, w, h);
  const rnd = rand(2718);
  for (let i = 0; i < (w * h) / 6000; i++) {
    g.fillStyle = `rgba(128,90,44,${(0.025 + rnd() * 0.045).toFixed(3)})`;
    g.beginPath();
    g.arc(rnd() * w, rnd() * h, 1 + rnd() * 9, 0, Math.PI * 2);
    g.fill();
  }
  const b0 = frame * 1.2, t = frame * 0.6;
  g.strokeStyle = INK;
  g.lineWidth = 1.6 * k;
  g.strokeRect(frame * 0.6, frame * 0.6, w - frame * 1.2, h - frame * 1.2);
  g.lineWidth = 0.8 * k;
  g.strokeRect(b0, b0, w - 2 * b0, h - 2 * b0);
  g.strokeRect(M.x, M.y, M.width, M.height);
  g.fillStyle = rgba(INK, 0.75);
  for (let i = 0; i < 24; i += 2) {
    const x = M.x + (i / 24) * M.width;
    g.fillRect(x, b0, M.width / 24, t);
    g.fillRect(x, h - b0 - t, M.width / 24, t);
  }
  for (let i = 0; i < 12; i += 2) {
    const y = M.y + (i / 12) * M.height;
    g.fillRect(b0, y, t, M.height / 12);
    g.fillRect(w - b0 - t, y, t, M.height / 12);
  }
  g.save();
  g.beginPath();
  g.rect(M.x, M.y, M.width, M.height);
  g.clip();
  const pw = clamp01(p * 2.5), reach = Math.hypot(M.width, M.height) * pw, ccx = M.x + M.width / 2, ccy = M.y + M.height / 2;
  const centres: [number, number][] = [[ccx, ccy]];
  for (let i = 0; i < 8; i++) centres.push([ccx + Math.sin((i * Math.PI) / 4) * M.width * 0.3, ccy - Math.cos((i * Math.PI) / 4) * M.height * 0.42]);
  centres.forEach(([cx, cy], ci) => {
    for (let i = 0; i < 32; i++) {
      const an = (i / 32) * Math.PI * 2, a = ci === 0 ? 1 : 0.65;
      g.strokeStyle = i % 4 === 0 ? rgba(INK, 0.2 * a) : i % 2 === 0 ? rgba(VERDIGRIS, 0.28 * a) : rgba(VERMILION, 0.2 * a);
      g.lineWidth = (i % 4 === 0 ? 0.8 : 0.5) * k;
      g.beginPath();
      g.moveTo(cx, cy);
      g.lineTo(cx + Math.sin(an) * reach, cy - Math.cos(an) * reach);
      g.stroke();
    }
  });
  const bins = binned(career, gm), pa = clamp01((p - 0.15) * 2);
  if (pa > 0) {
    const wc = canvas(BW, BH), wx = wc.getContext('2d')!, img = wx.createImageData(BW, BH), mc = canvas(BW, BH), mx = mc.getContext('2d')!, mimg = mx.createImageData(BW, BH);
    for (let j = 0; j < BW * BH; j++) {
      if (!bins.seen[j] || bins.region[j] < 0) continue;
      const [r, gg, bb] = rgb(WASH[bins.region[j] % WASH.length]), i = j * 4;
      img.data[i] = r;
      img.data[i + 1] = gg;
      img.data[i + 2] = bb;
      img.data[i + 3] = 118;
      mimg.data[i + 3] = 255;
    }
    wx.putImageData(img, 0, 0);
    mx.putImageData(mimg, 0, 0);
    g.save();
    g.globalAlpha *= pa;
    g.imageSmoothingEnabled = true;
    g.drawImage(wc, M.x, M.y, M.width, M.height);
    const hc = canvas(M.width, M.height), hx = hc.getContext('2d')!;
    hx.strokeStyle = rgba(SEPIA, 0.3);
    hx.lineWidth = 0.7;
    for (let s = -hc.height; s < hc.width; s += 5) {
      hx.beginPath();
      hx.moveTo(s, hc.height);
      hx.lineTo(s + hc.height, 0);
      hx.stroke();
    }
    hx.globalCompositeOperation = 'destination-in';
    hx.imageSmoothingEnabled = true;
    hx.drawImage(mc, 0, 0, hc.width, hc.height);
    g.drawImage(hc, M.x, M.y, M.width, M.height);
    g.restore();
  }
  if (o.geo) drawLand(g, M, bins, landOf(o.geo), k, clamp01((p - 0.2) * 2));
  const pb = clamp01((p - 0.3) * 2), sx = M.width / BW, sy = M.height / BH;
  if (pb > 0) {
    g.save();
    g.globalAlpha *= pb;
    const sketch = new Path2D(), inked = new Path2D(), front = new Path2D(), dot = 0.75 * k;
    for (let y = 0; y < BH; y++) {
      for (let x = 0; x < BW; x++) {
        const j = y * BW + x, r = bins.region[j];
        if (r < 0) continue;
        const jr = y * BW + ((x + 1) % BW), jd = y + 1 < BH ? j + BW : j;
        const edge = (bins.region[jr] >= 0 && bins.region[jr] !== r) || (bins.region[jd] >= 0 && bins.region[jd] !== r);
        const px = M.x + (x + 0.5) * sx, py = M.y + (y + 0.5) * sy;
        if (edge && (bins.seen[j] || bins.seen[jr] || bins.seen[jd])) { inked.moveTo(px + dot, py); inked.arc(px, py, dot, 0, Math.PI * 2); }
        else if (edge && (x + y) % 2 === 0) sketch.rect(px - 0.6, py - 0.6, 1.2, 1.2);
        else if (bins.seen[j] !== bins.seen[jr] || bins.seen[j] !== bins.seen[jd]) { front.moveTo(px + dot * 0.7, py); front.arc(px, py, dot * 0.7, 0, Math.PI * 2); }
      }
    }
    g.fillStyle = rgba(SEPIA, 0.3);
    g.fill(sketch);
    g.fillStyle = rgba(SEPIA, 0.55);
    g.fill(front);
    g.fillStyle = o.geo ? rgba(SEPIA, 0.5) : rgba(INK, 0.78);
    g.fill(inked);
    g.restore();
  }
  if (o.geo) drawSites(g, career, o.geo, M, bins, k, clamp01((p - 0.4) * 2));
  g.restore();
  compassRose(g, M.x + M.width * 0.88, M.y + M.height * 0.74, Math.min(M.height * 0.17, 92 * k), k, clamp01(p * 2));
  const pn = clamp01((p - 0.5) * 2.5);
  for (const r of data.regions) {
    if (r.named >= 0 && !o.unnamed?.includes(r.region)) letterName(g, r, w, h, pn);
    if (r.breakOffs > 0) {
      const x = Math.max(M.x + 12 * k, Math.min(M.x + M.width - 26 * k, X(r.lon))), y = Math.min(M.y + M.height - 16 * k, Y(r.lat) + 22 * k);
      anchorIcon(g, x, y, 14 * k, pn);
      if (r.breakOffs > 1) letter(g, String(r.breakOffs), x + 13 * k, y + 6 * k, { size: 11 * k, valign: 'middle' }, SEPIA, pn);
    }
  }
  const cw = 240 * k, ch = 92 * k, cr: Rect = { x: M.x + 14 * k, y: M.y + M.height - ch - 14 * k, width: cw, height: ch };
  scrap(g, cr, 2719, { tint: '#f6ecd4' });
  if (data.inked >= 1000) goldLeaf(g, cr, 2720, 1, 4 * k);
  else inkRect(g, { x: cr.x + 4 * k, y: cr.y + 4 * k, width: cr.width - 8 * k, height: cr.height - 8 * k }, 2721, 1, SEPIA, 1.2 * k);
  letter(g, 'Portolan', cr.x + cw / 2, cr.y + 24 * k, { size: 25 * k, align: 'center', valign: 'middle', swash: true }, INK);
  letter(g, `${data.matches} ${data.matches === 1 ? 'voyage' : 'voyages'}, ${inkedWords(data.inked).toLowerCase()}`, cr.x + cw / 2, cr.y + 52 * k, { size: 13.5 * k, align: 'center', valign: 'middle', maxWidth: cw - 16 * k }, SEPIA);
  letter(g, `${data.wind}, ${data.named} of ${REGIONS.length} seas named`, cr.x + cw / 2, cr.y + 72 * k, { size: 13.5 * k, align: 'center', valign: 'middle', maxWidth: cw - 16 * k }, VERMILION);
}

export const UNROLL = { ink: 2.8, names: 1, name: 1.1, every: 0.8 } as const;

export interface Unroll {
  was: HTMLCanvasElement;
  now: HTMLCanvasElement;
  mask: Float32Array;
  names: ChartRegion[];
  w: number;
  h: number;
  end: number;
  bins: HTMLCanvasElement;
  blend: HTMLCanvasElement;
}

export function unrollOf(before: Career, after: Career, voyage: Voyage, geo: Geography | null, w: number, h: number, dpr: number): Unroll {
  const letters = toLetter(before, voyage).map((n) => n.region), data = careerChartData(after);
  const layer = (c: Career, unnamed: readonly number[] = []): HTMLCanvasElement => { const l = sheet(w, h, 2_600_000, dpr); drawCareerChart(l.g, c, w, h, 1, { geo, unnamed }); return l.canvas; };
  const was = layer(before), now = layer(after, letters), names = letters.map((r) => data.regions[r]);
  return {
    was, now, mask: unrollMask(voyage.entered), names, w, h, end: Math.max(UNROLL.ink, UNROLL.names + (names.length - 1) * UNROLL.every + UNROLL.name) + 0.2,
    bins: canvas(BW, BH), blend: canvas(was.width, was.height),
  };
}

export function drawUnroll(g: G, u: Unroll, t: number): void {
  const { w, h } = u, { k, M } = plate(w, h), q = (t / UNROLL.ink) * 1.15, mx = u.bins.getContext('2d')!, img = mx.createImageData(BW, BH);
  for (let j = 0; j < BW * BH; j++) img.data[j * 4 + 3] = Math.round(255 * clamp01((q - u.mask[j]) * 5));
  mx.putImageData(img, 0, 0);
  const tx = u.blend.getContext('2d')!, sx = u.blend.width / w, sy = u.blend.height / h, cw = 240 * k, ch = 92 * k, cy = M.y + M.height - ch - 14 * k;
  tx.globalCompositeOperation = 'copy';
  tx.fillStyle = rgba(INK, q < 0.5 ? 0 : 1);
  tx.fillRect(0, 0, u.blend.width, u.blend.height);
  tx.imageSmoothingEnabled = true;
  tx.save();
  tx.beginPath();
  tx.rect(M.x * sx, M.y * sy, M.width * sx, M.height * sy);
  tx.rect((M.x + 14 * k + cw) * sx, cy * sy, -cw * sx, ch * sy);
  tx.clip();
  tx.drawImage(u.bins, M.x * sx, M.y * sy, M.width * sx, M.height * sy);
  tx.restore();
  tx.globalCompositeOperation = 'source-in';
  tx.drawImage(u.now, 0, 0);
  g.clearRect(0, 0, w, h);
  g.drawImage(u.was, 0, 0, w, h);
  g.drawImage(u.blend, 0, 0, w, h);
  u.names.forEach((r, i) => letterName(g, r, w, h, clamp01((t - UNROLL.names - i * UNROLL.every) / UNROLL.name)));
}

export function unrollMask(entered: readonly number[]): Float32Array {
  const g = geometry(), mask = new Float32Array(BW * BH), first = new Int16Array(BW * BH).fill(-1);
  for (let i = 0; i < CHART_GRID.cells; i++) {
    const bx = Math.floor(((g.lon[i] + Math.PI) / (2 * Math.PI)) * BW), by = Math.min(BH - 1, Math.floor(((Math.PI / 2 - g.lat[i]) / Math.PI) * BH));
    first[by * BW + Math.min(BW - 1, bx)] = g.region[i];
  }
  const order = entered.map((tick, r) => ({ tick: tick < 0 ? Infinity : tick, r })).sort((a, b) => a.tick - b.tick).map((e) => e.r), rank = new Float32Array(REGIONS.length);
  order.forEach((r, i) => { rank[r] = i / Math.max(1, order.length - 1); });
  const n = bloom();
  let r = -1;
  for (let y = 0; y < BH; y++) {
    for (let x = 0; x < BW; x++) {
      const j = y * BW + x;
      if (first[j] >= 0) r = first[j];
      mask[j] = 0.62 * (r >= 0 ? rank[r] : 1) + 0.38 * clamp01((n[j] - 0.5) * 1.8 + 0.5);
    }
  }
  return mask;
}

function bloom(): Float32Array {
  const out = new Float32Array(BW * BH), next = rand(4127), smooth = (t: number): number => t * t * (3 - 2 * t);
  for (const [cell, amp] of [[30, 0.5], [12, 0.3], [5, 0.2]] as const) {
    const gw = BW / cell, gh = Math.ceil(BH / cell) + 1, at = Float32Array.from({ length: gw * gh }, next);
    const v = (i: number, j: number): number => at[j * gw + (i % gw)];
    for (let y = 0; y < BH; y++) {
      const fy = y / cell, y0 = Math.floor(fy), b = smooth(fy - y0);
      for (let x = 0; x < BW; x++) {
        const fx = x / cell, x0 = Math.floor(fx), a = smooth(fx - x0);
        out[y * BW + x] += amp * ((v(x0, y0) * (1 - a) + v(x0 + 1, y0) * a) * (1 - b) + (v(x0, y0 + 1) * (1 - a) + v(x0 + 1, y0 + 1) * a) * b);
      }
    }
  }
  return out;
}

export const careerChartPage: ChartPage = (ctx, body, career) => {
  const group: THREE.Group & { frame?(dt: number): void } = new THREE.Group(), dpr = typeof window === 'undefined' ? 2 : Math.min(3, window.devicePixelRatio || 2);
  const geo = ctx.runtime.world?.geo ?? null, o = ctx.runtime.outcome, s = sheet(body.width, body.height, 2_600_000, dpr);
  const mesh = sheetMesh(s);
  mesh.position.set(body.x + body.width / 2, body.y + body.height / 2, 0);
  mesh.renderOrder = 8;
  group.add(mesh);
  const fresh = o && !o.charted && o.after.match === career.match ? o : null;
  if (!fresh || settings().reducedMotion) {
    drawCareerChart(s.g, career, s.w, s.h, 1, { geo });
    if (fresh) fresh.charted = true;
    return group;
  }
  const u = unrollOf(fresh.before, career, fresh.voyage, geo, s.w, s.h, dpr);
  let t = 0, acc = 1, quill = 0;
  drawUnroll(s.g, u, 0);
  group.frame = (dt) => {
    if (fresh.charted) return;
    t += dt;
    acc += dt;
    if (t >= UNROLL.names + quill * UNROLL.every && quill < u.names.length) { quill++; ctx.runtime.audio?.engine.ui('quill'); }
    if (acc < 1 / 20 && t < u.end) return;
    acc = 0;
    drawUnroll(s.g, u, Math.min(t, u.end));
    if (mesh.material.map) mesh.material.map.needsUpdate = true;
    if (t >= u.end) fresh.charted = true;
  };
  return group;
};

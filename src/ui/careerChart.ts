// WP27: the career chart (PROMPT.md, The career chart): the player's life at sea as a portolan that grows. A new career
// is bare vellum with the rhumb-line web of the old charts and the regions' bounds barely sketched in sepia; every sea
// the player has seen (Career.chart.seen, WP10's Voyage) is laid in transparent watercolour, hatched, its bounds inked;
// each region's name is lettered in swash capitals the match it was first entered (Career.chart.named); an anchor marks
// where the player has broken off the Great Current (its learned habits); a compass rose with its fleur-de-lis and a
// cartouche carry the voyages sailed, how much is inked and the wind rank reached. A finished chart is gilded. Drawn
// as an equirectangular plate into the harbour ledger's body through WP26's seam (main.ts: setChartPage).
import * as THREE from 'three';
import { FIND_SITES, RANK, type Career } from '../career/state.ts';
import { CHART_GRID, chartInked, chartSeen } from '../career/voyage.ts';
import { sheet, sheetMesh } from '../render/harbourScene.ts';
import { v3 } from '../sim/math.ts';
import { cellDir } from '../sim/sphere.ts';
import { regionOf } from '../sim/world/geography.ts';
import { REGIONS } from '../sim/world/regions.ts';
import type { ChartPage } from './harbour.ts';
import { INK, anchorIcon, nib, ring } from './icons.ts';
import { GOLD, GOLD_DARK, PAPER, PAPER_DEEP, SEPIA, VERDIGRIS, VERMILION, clamp01, goldLeaf, inkRect, letter, rand, rgb, rgba, scrap, type G } from './inkpage.ts';
import type { Rect } from './safeArea.ts';

/** The watercolour each region is laid in, by REGIONS index. */
const WASH = ['#8fb8c9', '#d4a656', '#5aa394', '#c98a5a', '#7f9a5b', '#b0694e', '#6f86a8', '#c4a24a', '#8e6fa0', '#5f8f86', '#d9b26a', '#9a6a4a', '#4f7a94', '#b47a6a'];
const BW = 360, BH = 180;

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

/** By chart cell (state.ts CHART), its region. */
export const regionCells = (): Uint8Array => geometry().region;

export interface ChartRegion { region: number; name: string; lat: number; lon: number; cells: number; inked: number; named: number; breakOffs: number }
export interface CareerChartData {
  regions: ChartRegion[];
  /** Permille of the whole chart inked. */
  inked: number;
  named: number;
  matches: number;
  tier: number;
  wind: string;
  found: number;
  finds: number;
}

/** What the chart shows, from the career alone. */
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

/** How much is inked, in words. */
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

/** A compass point: a kite from the centre, one half dark and one light, as the rose painters shaded them. */
export function kite(g: G, cx: number, cy: number, an: number, len: number, wid: number, dark: string, light: string, k: number): void {
  const tip: [number, number] = [cx + Math.sin(an) * len, cy - Math.cos(an) * len];
  const l: [number, number] = [cx + Math.sin(an - Math.PI / 2) * wid, cy - Math.cos(an - Math.PI / 2) * wid];
  const r: [number, number] = [cx + Math.sin(an + Math.PI / 2) * wid, cy - Math.cos(an + Math.PI / 2) * wid];
  g.beginPath(); g.moveTo(cx, cy); g.lineTo(...l); g.lineTo(...tip); g.closePath(); g.fillStyle = dark; g.fill();
  g.beginPath(); g.moveTo(cx, cy); g.lineTo(...r); g.lineTo(...tip); g.closePath(); g.fillStyle = light; g.fill();
  g.beginPath(); g.moveTo(...l); g.lineTo(...tip); g.lineTo(...r); g.strokeStyle = rgba(INK, 0.85); g.lineWidth = 0.7 * k; g.stroke();
}

/** The sixteen-point rose with its fleur-de-lis at the north. */
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
  const ty = cy - R * 0.95; // the fleur-de-lis on the north point
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

/** The whole chart at w × h CSS px, drawn up to `p` (0–1): the web, then the washes, the bounds, the names. */
export function drawCareerChart(g: G, career: Career, w: number, h: number, p = 1): void {
  const gm = geometry(), data = careerChartData(career), k = Math.max(0.8, Math.min(1.6, Math.min(w / 900, h / 450)));
  const frame = Math.max(10, Math.min(w, h) * 0.035), M: Rect = { x: frame * 1.8, y: frame * 1.8, width: w - frame * 3.6, height: h - frame * 3.6 };
  const X = (lon: number): number => M.x + ((lon + Math.PI) / (2 * Math.PI)) * M.width, Y = (lat: number): number => M.y + ((Math.PI / 2 - lat) / Math.PI) * M.height;
  // vellum
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
  // the neatline and its scale band
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
  // the rhumb-line web: a central rose and eight about it, 32 winds each (black the winds, green the half-winds, red the quarters)
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
  // the washes of the seen sea, hatched through its mask
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
  // the bounds: sketched faintly where unseen, inked where seen, the frontier of the known dotted
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
    g.fillStyle = rgba(INK, 0.78);
    g.fill(inked);
    g.restore();
  }
  g.restore();
  // the names, lettered as first entered, and the anchors of the break-offs
  const pn = clamp01((p - 0.5) * 2.5);
  for (const r of data.regions) {
    const x = X(r.lon), y = Y(r.lat);
    if (r.named >= 0) letter(g, r.name, x, y, { size: Math.max(12, Math.min(28, 9 + Math.sqrt(r.cells) * 0.16)) * k, align: 'center', valign: 'middle', swash: true }, INK, pn, 0.92);
    if (r.breakOffs > 0) {
      anchorIcon(g, x, y + 22 * k, 14 * k, pn);
      if (r.breakOffs > 1) letter(g, String(r.breakOffs), x + 13 * k, y + 28 * k, { size: 11 * k, valign: 'middle' }, SEPIA, pn);
    }
  }
  compassRose(g, M.x + M.width * 0.88, M.y + M.height * 0.74, Math.min(M.height * 0.17, 92 * k), k, clamp01(p * 2));
  // the cartouche
  const cw = 240 * k, ch = 92 * k, cr: Rect = { x: M.x + 14 * k, y: M.y + M.height - ch - 14 * k, width: cw, height: ch };
  scrap(g, cr, 2719, { tint: '#f6ecd4' });
  if (data.inked >= 1000) goldLeaf(g, cr, 2720, 1, 4 * k);
  else inkRect(g, { x: cr.x + 4 * k, y: cr.y + 4 * k, width: cr.width - 8 * k, height: cr.height - 8 * k }, 2721, 1, SEPIA, 1.2 * k);
  letter(g, 'Portolan', cr.x + cw / 2, cr.y + 24 * k, { size: 25 * k, align: 'center', valign: 'middle', swash: true }, INK);
  letter(g, `${data.matches} ${data.matches === 1 ? 'voyage' : 'voyages'}, ${inkedWords(data.inked).toLowerCase()}`, cr.x + cw / 2, cr.y + 52 * k, { size: 13.5 * k, align: 'center', valign: 'middle', maxWidth: cw - 16 * k }, SEPIA);
  letter(g, `${data.wind}, ${data.named} of ${REGIONS.length} seas named`, cr.x + cw / 2, cr.y + 72 * k, { size: 13.5 * k, align: 'center', valign: 'middle', maxWidth: cw - 16 * k }, VERMILION);
}

/** WP26's seam: the chart drawn into the ledger's body. */
export const careerChartPage: ChartPage = (_ctx, body, career) => {
  const group = new THREE.Group(), dpr = typeof window === 'undefined' ? 2 : Math.min(3, window.devicePixelRatio || 2);
  const s = sheet(body.width, body.height, 2_600_000, dpr);
  drawCareerChart(s.g, career, s.w, s.h, 1);
  const mesh = sheetMesh(s);
  mesh.position.set(body.x + body.width / 2, body.y + body.height / 2, 0);
  mesh.renderOrder = 8;
  group.add(mesh);
  return group;
};

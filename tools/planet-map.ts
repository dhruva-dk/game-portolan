// A look at the planet's ground, no browser needed.
//   node tools/planet-map.ts [seed]      (the game's, SEED, by default)
// Writes captures/planet-<seed>.ppm (equirectangular, coloured by depth band: land, too shallow for a ship (SHIP.draught),
// to 4, 8, 15, 30 and deeper, hill-shaded) and captures/planet-<seed>-island.ppm (the largest island on its own chart,
// 0.5 m a pixel), and prints the area shares (with the water too shallow for a ship, and the clear water over the
// islands' aprons: sailable, 8 m deep at most), the islands of each kind, and each. Convert with:
// sips -s format png captures/planet-1.ppm --out captures/planet-1.png

import { mkdirSync, writeFileSync } from 'node:fs';
import { R, distance, fromChart, fromLatLon } from '../src/world/sphere.ts';
import { SEED, bakeFaces, createPlanet } from '../src/world/planet.ts';
import { SHIP } from '../src/sim/handling.ts';

const seed = Number(process.argv[2] ?? SEED);
const t0 = performance.now();
const planet = createPlanet(seed);
console.log(`created in ${(performance.now() - t0).toFixed(0)} ms`);

type RGB = [number, number, number];
const BANDS: [number, RGB][] = [[SHIP.draught, [235, 245, 225]], [4, [150, 230, 220]], [8, [80, 200, 205]], [15, [40, 160, 190]], [30, [25, 100, 150]], [Infinity, [15, 45, 95]]];
const colour = (h: number): RGB => {
  if (h > 0) { const k = Math.min(h / 12, 1); return [235 - 60 * k, 215 - 70 * k, 165 - 70 * k]; }
  return BANDS.find(([d]) => -h < d)![1];
};

function write(path: string, w: number, h: number, height: (i: number, j: number) => number, metresPerPixel: number) {
  const hs = new Float32Array(w * h);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) hs[j * w + i] = height(i, j);
  const out = Buffer.alloc(w * h * 3);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const k = j * w + i, c = colour(hs[k]);
    // light from the north-west, on the slope in metres
    const dx = (hs[j * w + Math.min(i + 1, w - 1)] - hs[j * w + Math.max(i - 1, 0)]) / (2 * metresPerPixel);
    const dz = (hs[Math.min(j + 1, h - 1) * w + i] - hs[Math.max(j - 1, 0) * w + i]) / (2 * metresPerPixel);
    const shade = Math.min(Math.max(1 + (-dx - dz) * 0.6, 0.55), 1.3);
    for (let ch = 0; ch < 3; ch++) out[k * 3 + ch] = Math.min(255, Math.round(c[ch] * shade));
  }
  writeFileSync(path, Buffer.concat([Buffer.from(`P6\n${w} ${h}\n255\n`), out]));
}

mkdirSync('captures', { recursive: true });
const W = 1440, H = 720;
const lat = (j: number) => Math.PI / 2 - ((j + 0.5) / H) * Math.PI, lon = (i: number) => ((i + 0.5) / W) * 2 * Math.PI - Math.PI;
const t1 = performance.now();
write(`captures/planet-${seed}.ppm`, W, H, (i, j) => planet.height(fromLatLon(lat(j), lon(i))), (2 * Math.PI * R) / W);
console.log(`map in ${(performance.now() - t1).toFixed(0)} ms`);

// area shares, weighted by each row's true area
let total = 0, deep = 0, shallow = 0, land = 0, aground = 0, apron = 0, sea = 0, top = -Infinity;
for (let j = 0; j < H; j += 2) for (let i = 0; i < W; i += 2) {
  const p = fromLatLon(lat(j), lon(i)), a = Math.cos(lat(j)), h = planet.height(p);
  total += a;
  if (h <= 0) sea += a;
  if (h <= -SHIP.draught && h > -8 && planet.islands.some((s) => distance(s.chart.at, p) < s.shelf)) apron += a;
  if (h < -30) deep += a;
  if (h > -15 && h <= 0) shallow += a;
  if (h > 0) land += a;
  if (h > -SHIP.draught) aground += a;
  top = Math.max(top, h);
}
const pc = (x: number) => `${((100 * x) / total).toFixed(1)}%`;
console.log(`deeper than 30 m ${pc(deep)}, water shallower than 15 m ${pc(shallow)}, land ${pc(land)}, too shallow to sail (land too) ${pc(aground)}, highest ${top.toFixed(1)} m`);
console.log(`the clear water over the aprons (sailable, 8 m deep at most): ${((100 * apron) / sea).toFixed(1)}% of the sea`);
const kinds = new Map<string, number>();
for (const s of planet.islands) kinds.set(s.kind, (kinds.get(s.kind) ?? 0) + 1);
console.log(`${planet.islands.length} in all: ${[...kinds].map(([k, n]) => `${n} ${k}`).join(', ')}`);
for (const s of planet.islands) {
  const [x, y, z] = s.chart.at;
  console.log(`${s.kind} lat ${((Math.asin(y) * 180) / Math.PI).toFixed(1)} lon ${((Math.atan2(-z, x) * 180) / Math.PI).toFixed(1)}: radius ${s.radius.toFixed(0)} m, apron to ${s.shelf.toFixed(0)} m, reach ${s.reach.toFixed(0)} m, summit ${s.summit.toFixed(1)} m${s.offshore.length ? `, ${s.offshore.length} offshore` : ''}`);
}

// the largest island on its own chart
const big = planet.islands[0];
if (big) {
  const N = 640, span = 0.5;
  write(`captures/planet-${seed}-island.ppm`, N, N, (i, j) => planet.height(fromChart(big.chart, (i - N / 2) * span, (j - N / 2) * span)), span);
}

const t2 = performance.now();
bakeFaces(planet, 768);
console.log(`bakeFaces(768) in ${(performance.now() - t2).toFixed(0)} ms`);

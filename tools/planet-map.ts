// A look at the planet's ground, no browser needed.
//   node tools/planet-map.ts [seed]
// Writes captures/planet-<seed>.ppm (equirectangular, coloured by depth band: land, 0–3, 3–8, 8–15, 15–30, 30+ m,
// hill-shaded) and captures/planet-<seed>-island.ppm (the largest island on its own chart, 0.5 m a pixel), and
// prints the area shares and the islands. Convert with: sips -s format png captures/planet-1.ppm --out captures/planet-1.png

import { mkdirSync, writeFileSync } from 'node:fs';
import { R, fromChart, fromLatLon } from '../src/world/sphere.ts';
import { bakeFaces, createPlanet } from '../src/world/planet.ts';

const seed = Number(process.argv[2] ?? 1);
const t0 = performance.now();
const planet = createPlanet(seed);
console.log(`created in ${(performance.now() - t0).toFixed(0)} ms`);

type RGB = [number, number, number];
const BANDS: [number, RGB][] = [[3, [150, 230, 220]], [8, [80, 200, 205]], [15, [40, 160, 190]], [30, [25, 100, 150]], [Infinity, [15, 45, 95]]];
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
let total = 0, deep = 0, shallow = 0, land = 0, top = -Infinity;
for (let j = 0; j < H; j += 2) for (let i = 0; i < W; i += 2) {
  const a = Math.cos(lat(j)), h = planet.height(fromLatLon(lat(j), lon(i)));
  total += a;
  if (h < -30) deep += a;
  if (h > -15 && h <= 0) shallow += a;
  if (h > 0) land += a;
  top = Math.max(top, h);
}
const pc = (x: number) => `${((100 * x) / total).toFixed(1)}%`;
console.log(`deeper than 30 m ${pc(deep)}, water shallower than 15 m ${pc(shallow)}, land ${pc(land)}, highest ${top.toFixed(1)} m`);
for (const s of planet.islands) {
  const [x, y, z] = s.chart.at;
  console.log(`island lat ${((Math.asin(y) * 180) / Math.PI).toFixed(1)} lon ${((Math.atan2(-z, x) * 180) / Math.PI).toFixed(1)}: radius ${s.radius.toFixed(0)} m, apron to ${s.shelf.toFixed(0)} m, reach ${s.reach.toFixed(0)} m, summit ${s.summit.toFixed(1)} m`);
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

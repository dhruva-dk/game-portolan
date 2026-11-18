// A look at the planet-wide terrain prototype (src/world/terrain.ts), no browser needed.
//   node tools/terrain-map.ts [seeds=1,2,3,4,5,6] [land shares=0.4,0.45,0.5] [feature size, metres=TERRAIN.size]
// Writes captures/terrain/size<size>/s<seed>-l<share>.png (the planet from two sides, hill-shaded), the same with -marks (the
// channels the repair dug in red, the water it filled in violet), and sheet.png beside them (a row a seed, a
// column a share); prints each one's stats, and fails if any is left with more than one sailable body of water.

import { mkdirSync, writeFileSync } from 'node:fs';
import { R, normalize, type Vec3 } from '../src/world/sphere.ts';
import { cellOf } from '../src/world/cells.ts';
import { TERRAIN, createTerrain, heightAt, type Terrain } from '../src/world/terrain.ts';
import { png } from './png.ts';

const seeds = (process.argv[2] ?? '1,2,3,4,5,6').split(',').map(Number);
const shares = (process.argv[3] ?? '0.4,0.45,0.5').split(',').map(Number);
const size = Number(process.argv[4] ?? TERRAIN.size);
const OUT = `captures/terrain/size${size}`;
mkdirSync(OUT, { recursive: true });

type RGB = [number, number, number];
const lerp = (a: RGB, b: RGB, t: number): RGB => [0, 1, 2].map((i) => a[i] + (b[i] - a[i]) * Math.min(Math.max(t, 0), 1)) as RGB;
const SEA: [number, RGB][] = [[2.2, [225, 240, 220]], [4, [150, 228, 218]], [8, [80, 200, 205]], [12, [45, 160, 190]], [Infinity, [25, 105, 155]]];
function colour(h: number): RGB {
  if (h <= 0) return SEA.find(([d]) => -h < d)![1];
  if (h < 2) return [232, 214, 165];
  if (h < 18) return lerp([128, 165, 92], [86, 124, 70], (h - 2) / 16);
  if (h < 34) return lerp([86, 124, 70], [138, 118, 92], (h - 18) / 16);
  return lerp([138, 118, 92], [196, 192, 186], (h - 34) / 14);
}

/** The planet from the front and the back, tilted 25° to show a pole, `size` pixels a globe. */
function globes(t: Terrain, size: number, marks: boolean): Uint8Array {
  const W = size * 2, H = size, r = size / 2 - 2, tilt = (25 * Math.PI) / 180;
  const hs = new Float32Array(W * H).fill(NaN), cs = new Int32Array(W * H).fill(-1), zs = new Float32Array(W * H), h = heightAt(t);
  for (let g = 0; g < 2; g++) {
    for (let j = 0; j < H; j++) for (let i = 0; i < size; i++) {
      const x = (i - size / 2) / r, y = (size / 2 - j) / r, d = x * x + y * y;
      if (d > 1) continue;
      const z = Math.sqrt(1 - d);
      // tilted toward the viewer, then the far side turned round
      const y1 = y * Math.cos(tilt) + z * Math.sin(tilt), z1 = -y * Math.sin(tilt) + z * Math.cos(tilt);
      const p: Vec3 = g === 0 ? [x, y1, z1] : [-x, y1, -z1];
      const u = normalize(p), k = j * W + g * size + i;
      hs[k] = h(u); cs[k] = cellOf(u); zs[k] = z;
    }
  }
  const rgb = new Uint8Array(W * H * 3).fill(18), mpp = R / r;
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const k = j * W + i;
    if (Number.isNaN(hs[k])) continue;
    const at = (a: number, b: number) => (Number.isNaN(hs[b * W + a]) ? hs[k] : hs[b * W + a]);
    const dx = (at(Math.min(i + 1, W - 1), j) - at(Math.max(i - 1, 0), j)) / (2 * mpp);
    const dz = (at(i, Math.min(j + 1, H - 1)) - at(i, Math.max(j - 1, 0))) / (2 * mpp);
    const shade = Math.min(Math.max(1 + (-dx + dz) * 0.5, 0.5), 1.35) * (0.7 + 0.3 * zs[k]);
    let c = colour(hs[k]);
    if (marks && t.changed[cs[k]] === 1) c = lerp(c, [230, 40, 40], 0.75);
    if (marks && t.changed[cs[k]] === 2) c = lerp(c, [150, 60, 210], 0.75);
    for (let ch = 0; ch < 3; ch++) rgb[k * 3 + ch] = Math.min(255, Math.round(c[ch] * shade));
  }
  return rgb;
}

const pct = (x: number) => `${(100 * x).toFixed(1)}%`;
const CELL = 200, sheet = new Uint8Array(shares.length * CELL * 2 * seeds.length * CELL * 3), sheetW = shares.length * CELL * 2;
let bad = 0;
console.log('seed land  | before→after land | sailable before→after | water bodies | channels dug (m²) | ponds filled (m²) | landmasses, largest | summit | ms');
for (const [row, seed] of seeds.entries()) {
  for (const [col, land] of shares.entries()) {
    const t0 = performance.now();
    const t = createTerrain(seed, { ...TERRAIN, land, size });
    const ms = performance.now() - t0, s = t.stats;
    if (s.sailableAfter !== 1) bad++;
    console.log(`${String(seed).padStart(4)} ${land.toFixed(2)} | ${pct(s.landBefore)}→${pct(s.landAfter)} | ${s.sailableBefore}→${s.sailableAfter} | ${s.waterBodies} | ${s.channels} (${s.dugArea.toFixed(0)}) | ${s.filled} (${s.filledArea.toFixed(0)}) | ${s.landmasses}, ${pct(s.largestLand)} | ${s.summit.toFixed(1)} m | ${ms.toFixed(0)}`);
    const name = `${OUT}/s${seed}-l${land}`;
    writeFileSync(`${name}.png`, png(1024, 512, globes(t, 512, false)));
    writeFileSync(`${name}-marks.png`, png(1024, 512, globes(t, 512, true)));
    const small = globes(t, CELL, true);
    for (let j = 0; j < CELL; j++) sheet.set(small.subarray(j * CELL * 2 * 3, (j + 1) * CELL * 2 * 3), ((row * CELL + j) * sheetW + col * CELL * 2) * 3);
  }
}
writeFileSync(`${OUT}/sheet.png`, png(sheetW, seeds.length * CELL, sheet));
console.log(`wrote ${OUT}/`);
if (bad) {
  console.error(`${bad} left with more than one sailable body`);
  process.exit(1);
}

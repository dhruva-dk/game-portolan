// A look at the planet-wide terrain (src/world/terrain.ts), no browser needed.
//   node tools/terrain-map.ts [seeds=1,2,3,4,5,6] [land shares=0.4,0.45,0.5] [feature size, metres=TERRAIN.size]
// Writes captures/terrain/size<size>/s<seed>-l<share>.png (the planet from two sides, hill-shaded), the same with -marks (the
// channels the repair dug in red, the water it filled in violet), and sheet.png beside them (a row a seed, a
// column a share); prints each one's stats, and fails if any is left with more than one sailable body of water.
//
// The land in the game's own tones (palette.ts) where the game lays them (world/planet-terrain.ts BANDS, as land/sand.ts
// lays them from the ground's height and cover), lit toward the upper left; the sea by its depth in the palette's blues.
// Not drawn: what the shader adds at a metre's scale (stones and weed on the floor, strata, a cliff's rock).

import { mkdirSync, writeFileSync } from 'node:fs';
import { R, normalize, type Vec3 } from '../src/world/sphere.ts';
import { cellOf } from '../src/world/cells.ts';
import type { Cover } from '../src/world/planet.ts';
import { BANDS, duneHeight, terrainPlanet } from '../src/world/planet-terrain.ts';
import { clamp, lerp as mix } from '../src/world/scalar.ts';
import { TERRAIN, createTerrain, type Terrain } from '../src/world/terrain.ts';
import { linearToSrgb } from '../src/colour.ts';
import {
  ROCK, SAND, SAND_DRY, SAND_DUNE, SAND_LOAM, SAND_SHORE, SEABED_SAND, SEA_DEEP, SEA_MIDDLE, SEA_SHALLOW, type Rgb, type Tones,
} from '../src/palette.ts';
import { png } from './png.ts';

const seeds = (process.argv[2] ?? '1,2,3,4,5,6').split(',').map(Number);
const shares = (process.argv[3] ?? '0.4,0.45,0.5').split(',').map(Number);
const size = Number(process.argv[4] ?? TERRAIN.size);
const OUT = `captures/terrain/size${size}`;
mkdirSync(OUT, { recursive: true });

/** t of the way from colour a to colour b, t held within 0…1. */
const lerp = (a: Rgb, b: Rgb, t: number): Rgb => {
  const k = clamp(t);
  return [mix(a[0], b[0], k), mix(a[1], b[1], k), mix(a[2], b[2], k)];
};
const step = (v: number, at: number) => (v >= at ? 1 : 0);
/** Linear to the display's sRGB, 0…255. */
const srgb = (v: number) => Math.round(255 * linearToSrgb(Math.min(v, 1)));

/** The land's two tones at height h over its cover, laid in land/sand.ts's order; dunes past `dune` metres. */
function land(h: number, c: Cover, dune: number): Tones {
  const mottle = c.mottle - 0.5, level = h + mottle * BANDS.ragged;
  let lit = SAND_SHORE.lit, shadow = SAND_SHORE.shadow;
  const lay = (t: Tones, share: number) => {
    lit = lerp(lit, t.lit, share);
    shadow = lerp(shadow, t.shadow, share);
  };
  lay(SAND, step(level, BANDS.beach));
  lay(SAND_DRY, step(level, BANDS.dry));
  lay(SAND_LOAM, step(c.grass + (c.clump - 0.5) * 0.25, BANDS.loam) * step(level, BANDS.dry));
  lay(SAND_DUNE, step(level + mottle * BANDS.ragged * 6, dune));
  lay(ROCK, step(c.rubble + mottle * 0.3, BANDS.rubble) * step(level, BANDS.dry));
  return { lit, shadow };
}
/** The sea at depth d: its floor's sand through the clear shallows, deepening to the palette's blues. */
const sea = (d: number): Rgb => (d < 3 ? lerp(SEABED_SAND.lit, SEA_SHALLOW, 0.35 + 0.65 * (d / 3))
  : d < 12 ? lerp(SEA_SHALLOW, SEA_MIDDLE, (d - 3) / 9) : lerp(SEA_MIDDLE, SEA_DEEP, (d - 12) / 18));

/** The planet from the front and the back, tilted 25° to show a pole, `size` pixels a globe. */
function globes(t: Terrain, seed: number, size: number, marks: boolean): Uint8Array {
  const W = size * 2, H = size, r = size / 2 - 2, tilt = (25 * Math.PI) / 180;
  const hs = new Float32Array(W * H).fill(NaN), cs = new Int32Array(W * H).fill(-1), zs = new Float32Array(W * H);
  const planet = terrainPlanet(t, seed), cover: Cover = { grass: 0, rubble: 0, mottle: 0, clump: 0 }, tones: Tones[] = [];
  for (let g = 0; g < 2; g++) {
    for (let j = 0; j < H; j++) for (let i = 0; i < size; i++) {
      const x = (i - size / 2) / r, y = (size / 2 - j) / r, d = x * x + y * y;
      if (d > 1) continue;
      const z = Math.sqrt(1 - d);
      // tilted toward the viewer, then the far side turned round
      const y1 = y * Math.cos(tilt) + z * Math.sin(tilt), z1 = -y * Math.sin(tilt) + z * Math.cos(tilt);
      const p: Vec3 = g === 0 ? [x, y1, z1] : [-x, y1, -z1];
      const u = normalize(p), k = j * W + g * size + i;
      hs[k] = planet.sample(u, cover); cs[k] = cellOf(u); zs[k] = z;
      tones[k] = land(hs[k], cover, duneHeight(t.stats.summit));
    }
  }
  const rgb = new Uint8Array(W * H * 3).fill(18), mpp = R / r;
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const k = j * W + i;
    if (Number.isNaN(hs[k])) continue;
    const at = (a: number, b: number) => (Number.isNaN(hs[b * W + a]) ? hs[k] : hs[b * W + a]);
    const dx = (at(Math.min(i + 1, W - 1), j) - at(Math.max(i - 1, 0), j)) / (2 * mpp);
    const dz = (at(i, Math.min(j + 1, H - 1)) - at(i, Math.max(j - 1, 0))) / (2 * mpp);
    // land: its shadow tone turning to its lit as the slope faces the light; the sea flat; both darkening to the limb
    const light = clamp(0.75 + (-dx + dz) * 1.5), limb = 0.6 + 0.4 * zs[k];
    let c = hs[k] > 0 ? lerp(tones[k].shadow, tones[k].lit, light) : sea(-hs[k]);
    if (marks && t.changed[cs[k]] === 1) c = lerp(c, [0.8, 0.02, 0.02], 0.75);
    if (marks && t.changed[cs[k]] === 2) c = lerp(c, [0.3, 0.05, 0.65], 0.75);
    for (let ch = 0; ch < 3; ch++) rgb[k * 3 + ch] = srgb(c[ch] * limb);
  }
  return rgb;
}

const pct = (x: number) => `${(100 * x).toFixed(1)}%`;
const CELL = 200, sheet = new Uint8Array(shares.length * CELL * 2 * seeds.length * CELL * 3), sheetW = shares.length * CELL * 2;
let bad = 0;
console.log('seed land  | before→after land | sailable before→after | water bodies | channels dug (m²) | ponds filled (m²)'
  + ' | landmasses, largest | summit | ms');
for (const [row, seed] of seeds.entries()) {
  for (const [col, land] of shares.entries()) {
    const t0 = performance.now();
    const t = createTerrain(seed, { ...TERRAIN, land, size });
    const ms = performance.now() - t0, s = t.stats;
    if (s.sailableAfter !== 1) bad++;
    console.log(`${String(seed).padStart(4)} ${land.toFixed(2)} | ${pct(s.landBefore)}→${pct(s.landAfter)}`
      + ` | ${s.sailableBefore}→${s.sailableAfter} | ${s.waterBodies} | ${s.channels} (${s.dugArea.toFixed(0)})`
      + ` | ${s.filled} (${s.filledArea.toFixed(0)}) | ${s.landmasses}, ${pct(s.largestLand)} | ${s.summit.toFixed(1)} m`
      + ` | ${ms.toFixed(0)}`);
    const name = `${OUT}/s${seed}-l${land}`;
    writeFileSync(`${name}.png`, png(1024, 512, globes(t, seed, 512, false)));
    writeFileSync(`${name}-marks.png`, png(1024, 512, globes(t, seed, 512, true)));
    const small = globes(t, seed, CELL, true);
    for (let j = 0; j < CELL; j++) {
      sheet.set(small.subarray(j * CELL * 2 * 3, (j + 1) * CELL * 2 * 3), ((row * CELL + j) * sheetW + col * CELL * 2) * 3);
    }
  }
}
writeFileSync(`${OUT}/sheet.png`, png(sheetW, seeds.length * CELL, sheet));
console.log(`wrote ${OUT}/`);
if (bad) {
  console.error(`${bad} left with more than one sailable body`);
  process.exit(1);
}

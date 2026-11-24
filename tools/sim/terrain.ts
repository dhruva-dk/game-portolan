import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { lines, writeJson } from '../out.ts';
import { R, normalize, type Vec3 } from '../../src/world/sphere.ts';
import { cellOf } from '../../src/world/cells.ts';
import type { Cover } from '../../src/world/planet.ts';
import {
  BANDS,
  duneHeight,
  terrainPlanet,
} from '../../src/world/planet-terrain.ts';
import { clamp, lerp as mix } from '../../src/world/scalar.ts';
import {
  TERRAIN,
  createTerrain,
  type Terrain,
} from '../../src/world/terrain.ts';
import { linearToSrgb } from '../../src/world/color.ts';
import {
  ROCK,
  SAND,
  SAND_DRY,
  SAND_DUNE,
  SAND_LOAM,
  SAND_SHORE,
  SEABED_SAND,
  SEA_DEEP,
  SEA_MIDDLE,
  SEA_SHALLOW,
  type Rgb,
  type Tones,
} from '../../src/render/palette.ts';
import { png } from './png.ts';

export interface TerrainScenario {
  kind: 'terrain';
  seeds: number[];
  shares: number[];
  size?: number;
}

const lerp = (a: Rgb, b: Rgb, t: number): Rgb => {
  const k = clamp(t);
  return [mix(a[0], b[0], k), mix(a[1], b[1], k), mix(a[2], b[2], k)];
};
const step = (v: number, at: number) => (v >= at ? 1 : 0);
const srgb = (v: number) => Math.round(255 * linearToSrgb(Math.min(v, 1)));

function land(h: number, c: Cover, dune: number): Tones {
  const mottle = c.mottle - 0.5,
    level = h + mottle * BANDS.ragged;
  let lit = SAND_SHORE.lit,
    shadow = SAND_SHORE.shadow;
  const lay = (t: Tones, share: number) => {
    lit = lerp(lit, t.lit, share);
    shadow = lerp(shadow, t.shadow, share);
  };
  lay(SAND, step(level, BANDS.beach));
  lay(SAND_DRY, step(level, BANDS.dry));
  lay(
    SAND_LOAM,
    step(c.grass + (c.clump - 0.5) * 0.25, BANDS.loam) * step(level, BANDS.dry)
  );
  lay(SAND_DUNE, step(level + mottle * BANDS.ragged * 6, dune));
  lay(
    ROCK,
    step(c.rubble + mottle * 0.3, BANDS.rubble) * step(level, BANDS.dry)
  );
  return { lit, shadow };
}
const sea = (d: number): Rgb =>
  d < 3
    ? lerp(SEABED_SAND.lit, SEA_SHALLOW, 0.35 + 0.65 * (d / 3))
    : d < 12
      ? lerp(SEA_SHALLOW, SEA_MIDDLE, (d - 3) / 9)
      : lerp(SEA_MIDDLE, SEA_DEEP, (d - 12) / 18);

function globes(
  t: Terrain,
  seed: number,
  size: number,
  marks: boolean
): Uint8Array {
  const W = size * 2,
    H = size,
    r = size / 2 - 2,
    tilt = (25 * Math.PI) / 180;
  const hs = new Float32Array(W * H).fill(NaN),
    cs = new Int32Array(W * H).fill(-1),
    zs = new Float32Array(W * H);
  const planet = terrainPlanet(t, seed),
    cover: Cover = { grass: 0, rubble: 0, mottle: 0, clump: 0 },
    tones: Tones[] = [];
  for (let g = 0; g < 2; g++) {
    for (let j = 0; j < H; j++)
      for (let i = 0; i < size; i++) {
        const x = (i - size / 2) / r,
          y = (size / 2 - j) / r,
          d = x * x + y * y;
        if (d > 1) continue;
        const z = Math.sqrt(1 - d);
        const y1 = y * Math.cos(tilt) + z * Math.sin(tilt),
          z1 = -y * Math.sin(tilt) + z * Math.cos(tilt);
        const p: Vec3 = g === 0 ? [x, y1, z1] : [-x, y1, -z1];
        const u = normalize(p),
          k = j * W + g * size + i;
        hs[k] = planet.sample(u, cover);
        cs[k] = cellOf(u);
        zs[k] = z;
        tones[k] = land(hs[k], cover, duneHeight(t.stats.summit));
      }
  }
  const rgb = new Uint8Array(W * H * 3).fill(18),
    mpp = R / r;
  for (let j = 0; j < H; j++)
    for (let i = 0; i < W; i++) {
      const k = j * W + i;
      if (Number.isNaN(hs[k])) continue;
      const at = (a: number, b: number) =>
        Number.isNaN(hs[b * W + a]) ? hs[k] : hs[b * W + a];
      const dx =
        (at(Math.min(i + 1, W - 1), j) - at(Math.max(i - 1, 0), j)) / (2 * mpp);
      const dz =
        (at(i, Math.min(j + 1, H - 1)) - at(i, Math.max(j - 1, 0))) / (2 * mpp);
      const light = clamp(0.75 + (-dx + dz) * 1.5),
        limb = 0.6 + 0.4 * zs[k];
      let c =
        hs[k] > 0 ? lerp(tones[k].shadow, tones[k].lit, light) : sea(-hs[k]);
      if (marks && t.changed[cs[k]] === 1) c = lerp(c, [0.8, 0.02, 0.02], 0.75);
      if (marks && t.changed[cs[k]] === 2) c = lerp(c, [0.3, 0.05, 0.65], 0.75);
      for (let ch = 0; ch < 3; ch++) rgb[k * 3 + ch] = srgb(c[ch] * limb);
    }
  return rgb;
}

const pct = (x: number) => `${(100 * x).toFixed(1)}%`;
const CELL = 200;

export function runTerrain(sc: TerrainScenario, dir: string): boolean {
  const { seeds, shares } = sc,
    size = sc.size ?? TERRAIN.size;
  const sheetW = shares.length * CELL * 2,
    sheet = new Uint8Array(sheetW * seeds.length * CELL * 3),
    stats = lines(join(dir, 'stats.jsonl')),
    bad: string[] = [];
  console.log(
    'seed land  | before→after land | sailable before→after | water bodies | channels dug (m²) | ponds filled (m²)' +
      ' | landmasses, largest | summit | ms'
  );
  for (const [row, seed] of seeds.entries()) {
    for (const [col, land] of shares.entries()) {
      const t0 = performance.now();
      const t = createTerrain(seed, { ...TERRAIN, land, size });
      const ms = performance.now() - t0,
        s = t.stats;
      if (s.sailableAfter !== 1)
        bad.push(
          `seed ${seed} land ${land}: ${s.sailableAfter} sailable bodies`
        );
      stats.write({ seed, land, size, ms: Math.round(ms), ...s });
      console.log(
        `${String(seed).padStart(4)} ${land.toFixed(2)} | ${pct(s.landBefore)}→${pct(s.landAfter)}` +
          ` | ${s.sailableBefore}→${s.sailableAfter} | ${s.waterBodies} | ${s.channels} (${s.dugArea.toFixed(0)})` +
          ` | ${s.filled} (${s.filledArea.toFixed(0)}) | ${s.landmasses}, ${pct(s.largestLand)} | ${s.summit.toFixed(1)} m` +
          ` | ${ms.toFixed(0)}`
      );
      const name = join(dir, `s${seed}-l${land}`);
      writeFileSync(`${name}.png`, png(1024, 512, globes(t, seed, 512, false)));
      writeFileSync(
        `${name}-marks.png`,
        png(1024, 512, globes(t, seed, 512, true))
      );
      const small = globes(t, seed, CELL, true);
      for (let j = 0; j < CELL; j++)
        sheet.set(
          small.subarray(j * CELL * 2 * 3, (j + 1) * CELL * 2 * 3),
          ((row * CELL + j) * sheetW + col * CELL * 2) * 3
        );
    }
  }
  stats.close();
  writeFileSync(
    join(dir, 'sheet.png'),
    png(sheetW, seeds.length * CELL, sheet)
  );
  writeJson(join(dir, 'summary.json'), {
    scenario: sc,
    maps: seeds.length * shares.length,
    bad,
  });
  for (const b of bad) console.log(`MORE THAN ONE SAILABLE BODY: ${b}`);
  console.log(
    `→ ${dir}  (summary.json; stats.jsonl; s<seed>-l<share>.png and -marks.png; sheet.png)`
  );
  return bad.length === 0;
}

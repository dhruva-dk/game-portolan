import { N } from './cells.ts';
import { createNoise3 } from './noise3.ts';
import type { Cover, Planet } from './planet.ts';
import { STRIDE, hash, random } from './random.ts';
import { clamp, smoothstep } from './scalar.ts';
import {
  R,
  add,
  distance,
  dot,
  faceDir,
  fromChart,
  normalize,
  toChart,
  type Chart,
  type Vec3,
} from './sphere.ts';
import { CELL, between, locate, taps } from './terrain-grid.ts';
import { heightBounds, type Terrain } from './terrain.ts';

const BLOCK = 16;

export const WADE = 7;

export interface Rock {
  x: number;
  y: number;
  z: number;
  size: number;
  yaw: number;
  big: boolean;
  shape: number;
}

export interface Palm {
  x: number;
  y: number;
  z: number;
  height: number;
  lean: number;
  heading: number;
}

export interface Shrub {
  x: number;
  y: number;
  z: number;
  size: number;
  yaw: number;
  shape: number;
  tint: number;
}

export const onRock = (rocks: Rock[], x: number, z: number, margin: number) =>
  rocks.some((r) => Math.hypot(r.x - x, r.z - z) < r.size * 1.05 + margin);

export interface Tile {
  chart: Chart;
  reach: number;
  top: number;
  palms: Palm[];
  shrubs: Shrub[];
  rocks: Rock[];
}

interface Shapes {
  shrubs: number;
  big: number;
  boulders: number;
}

const LOWEST = 0.5;
const BEACH_TOP = -4,
  PALM_RATE = 0.35,
  SPACING = 3.5,
  INLAND = 25,
  PALM_UP = [0.4, 0.75] as const;
const HEDGE = [-14, -5] as const,
  SHRUB_RATE = 0.3,
  BARE = 0.7;
const TOP = 0.6,
  TOP_OUTCROP = 0.03,
  TOP_OUTCROPS = 2,
  COAST_OUTCROP = 0.3;
const BIG = [2.5, 5.5] as const,
  BIG_COUNT = [3, 6] as const,
  HEAPED = 0.6;
const BOULDER = [0.3, 1.6] as const,
  BOULDERS = [4, 10] as const,
  SUNK = { big: 0.15, boulder: 0.3 },
  FOOT = 0.8;

export function scatterTerrain(
  t: Terrain,
  planet: Planet,
  seed: number,
  shapes: Shapes
): Tile[] {
  const blocks = N / BLOCK,
    tops = heightBounds(t, blocks).hi,
    summit = t.options.summit;
  const noise = createNoise3(seed + STRIDE),
    at = taps(),
    cover: Cover = { grass: 0, rubble: 0, mottle: 0, clump: 0 };
  const read = (p: Vec3, size: number, shift: number) =>
    noise.value(
      (p[0] * R) / size + shift,
      (p[1] * R) / size,
      (p[2] * R) / size
    );
  const shoreAt = (p: Vec3) => {
    locate(p, at);
    return between(t.shore, at);
  };
  const tiles: Tile[] = [];

  for (let face = 0; face < 6; face++)
    for (let bj = 0; bj < blocks; bj++)
      for (let bi = 0; bi < blocks; bi++) {
        const k = (face * blocks + bj) * blocks + bi,
          top = tops[k];
        if (top < LOWEST) continue;
        const rand = random(hash(seed, k + 1));
        const uv = (i: number) => -1 + (2 * i) / N;
        const [u0, v0, u1, v1] = [
          uv(bi * BLOCK),
          uv(bj * BLOCK),
          uv((bi + 1) * BLOCK),
          uv((bj + 1) * BLOCK),
        ];
        const middle = faceDir(face, (u0 + u1) / 2, (v0 + v1) / 2),
          ahead = faceDir(face, (u0 + u1) / 2 + 1e-3, (v0 + v1) / 2);
        const chart: Chart = {
          at: middle,
          axis: normalize(add(ahead, middle, -dot(ahead, middle))),
        };
        const reach = Math.max(
          ...[
            [u0, v0],
            [u1, v0],
            [u0, v1],
            [u1, v1],
          ].map(([u, v]) => distance(middle, faceDir(face, u, v)))
        );
        const groundAt = (x: number, z: number) =>
          planet.height(fromChart(chart, x, z));
        const within = (i: number, j: number): Vec3 =>
          faceDir(
            face,
            uv(bi * BLOCK + i + rand()),
            uv(bj * BLOCK + j + rand())
          );
        const cells = (visit: (c: number, i: number, j: number) => void) => {
          for (let j = 0; j < BLOCK; j++)
            for (let i = 0; i < BLOCK; i++)
              visit(face * N * N + (bj * BLOCK + j) * N + bi * BLOCK + i, i, j);
        };
        const slack = CELL * 0.75;

        const rocks: Rock[] = [];
        const clear = (x: number, z: number, size: number, big: boolean) =>
          rocks.every(
            (r) =>
              Math.hypot(r.x - x, r.z - z) >
              (r.size + size) * (r.big && big ? HEAPED : 0.85)
          );
        const seat = (x: number, z: number, size: number, sunk: number) => {
          let low = groundAt(x, z);
          for (let a = 0; a < 6; a++)
            low = Math.min(
              low,
              groundAt(
                x + Math.cos(a) * size * 0.7,
                z + Math.sin(a) * size * 0.7
              )
            );
          return low - sunk * size;
        };
        const outcrop = (p: Vec3, most: number) => {
          const [cx, cz] = toChart(chart, p),
            masses: Rock[] = [];
          const count =
            BIG_COUNT[0] +
            Math.floor(rand() * (BIG_COUNT[1] - BIG_COUNT[0] + 1));
          for (let n = 0, tries = 0; n < count && tries < 40; tries++) {
            const size =
              BIG[0] +
              (most - BIG[0]) * (n === 0 ? 0.6 + 0.4 * rand() : rand() ** 0.8);
            let x = cx,
              z = cz;
            if (n > 0) {
              const m = masses[Math.floor(rand() * masses.length)],
                a = rand() * 2 * Math.PI;
              const out = (m.size + size) * (HEAPED + 0.02 + 0.15 * rand());
              x = m.x + Math.cos(a) * out;
              z = m.z + Math.sin(a) * out;
            }
            if (
              shoreAt(fromChart(chart, x, z)) + FOOT * size > WADE - 1 ||
              !clear(x, z, size, true)
            )
              continue;
            const r: Rock = {
              x,
              z,
              y: seat(x, z, size, SUNK.big),
              size,
              yaw: rand() * 2 * Math.PI,
              big: true,
              shape: Math.floor(rand() * shapes.big),
            };
            rocks.push(r);
            masses.push(r);
            n++;
          }
          const boulders =
            BOULDERS[0] + Math.floor(rand() * (BOULDERS[1] - BOULDERS[0] + 1));
          for (
            let n = 0, tries = 0;
            n < boulders && masses.length && tries < boulders * 20;
            tries++
          ) {
            const m = masses[Math.floor(rand() * masses.length)],
              size = BOULDER[0] + (BOULDER[1] - BOULDER[0]) * rand() ** 2.5;
            const a = rand() * 2 * Math.PI,
              out = m.size * (0.9 + 0.5 * rand()) + size + rand() * 4;
            const x = m.x + Math.cos(a) * out,
              z = m.z + Math.sin(a) * out;
            if (
              !clear(x, z, size, false) ||
              shoreAt(fromChart(chart, x, z)) + FOOT * size > WADE - 1
            )
              continue;
            rocks.push({
              x,
              z,
              y: seat(x, z, size, SUNK.boulder),
              size,
              yaw: rand() * 2 * Math.PI,
              big: false,
              shape: Math.floor(rand() * shapes.boulders),
            });
            n++;
          }
        };
        let crowned = 0;
        const shoulders: [number, number][] = [];
        cells((c, i, j) => {
          if (
            t.height[c] > TOP * summit &&
            crowned < TOP_OUTCROPS &&
            rand() < TOP_OUTCROP
          ) {
            outcrop(within(i, j), BIG[1]);
            crowned++;
          }
          if (t.shore[c] > HEDGE[0] && t.shore[c] < HEDGE[1])
            shoulders.push([i, j]);
        });
        if (shoulders.length > 0 && rand() < COAST_OUTCROP) {
          const [i, j] = shoulders[Math.floor(rand() * shoulders.length)];
          outcrop(within(i, j), BIG[1] * 0.8);
        }

        const palms: Palm[] = [];
        cells((c, i, j) => {
          if (t.shore[c] - slack > BEACH_TOP) return;
          const p = within(i, j),
            s = shoreAt(p);
          if (s > BEACH_TOP) return;
          const grove =
            clamp((read(p, 16, 0.5) + 0.5 * read(p, 8, 9.1) - 0.1) / 0.3) ** 2;
          const coastal = Math.exp((s - BEACH_TOP) / INLAND),
            up = clamp(t.height[c] / summit);
          if (
            rand() >
            PALM_RATE *
              grove *
              (0.12 + 0.88 * coastal) *
              (1 - smoothstep(PALM_UP[0], PALM_UP[1], up))
          )
            return;
          const [x, z] = toChart(chart, p),
            y = planet.height(p);
          if (
            y < LOWEST ||
            palms.some((q) => Math.hypot(q.x - x, q.z - z) < SPACING) ||
            onRock(rocks, x, z, 1)
          )
            return;
          const gx = shoreAt(fromChart(chart, x + 1, z)) - s,
            gz = shoreAt(fromChart(chart, x, z + 1)) - s;
          palms.push({
            x,
            z,
            y: y - 0.2,
            height: 7 + rand() * 6,
            lean: 0.06 + (0.1 + 0.35 * coastal) * rand(),
            heading: Math.atan2(gz, gx) + (rand() * 2 - 1) * 0.7,
          });
        });

        const shrubs: Shrub[] = [];
        cells((c, i, j) => {
          if (t.shore[c] - slack > HEDGE[1]) return;
          for (let n = 0; n < 2; n++) {
            const p = within(i, j),
              s = shoreAt(p);
            if (s > HEDGE[1]) continue;
            const hedge =
              s > HEDGE[0] ? clamp((read(p, 14, 3.3) + 0.2) / 0.3) : 0;
            const clump = clamp((read(p, 10, 5.5) - 0.05) / 0.25) * 0.6;
            if (rand() > SHRUB_RATE * Math.max(hedge, clump)) continue;
            const y = planet.sample(p, cover);
            if (
              y < 0.6 ||
              cover.rubble > BARE ||
              (hedge < clump && rand() > 0.2 + 0.8 * cover.grass)
            )
              continue;
            const up = clamp(y / summit),
              size = (1.8 + 3.2 * rand() ** 2) * (1 - 0.45 * up);
            const [x, z] = toChart(chart, p);
            if (
              shrubs.some(
                (b) => Math.hypot(b.x - x, b.z - z) < (b.size + size) * 0.35
              ) ||
              onRock(rocks, x, z, size * 0.3)
            )
              continue;
            if (
              palms.some((q) => Math.hypot(q.x - x, q.z - z) < 0.6 + size * 0.3)
            )
              continue;
            shrubs.push({
              x,
              z,
              y,
              size,
              yaw: rand() * 2 * Math.PI,
              shape: Math.floor(rand() * shapes.shrubs),
              tint: rand(),
            });
          }
        });

        if (palms.length + shrubs.length + rocks.length > 0)
          tiles.push({ chart, reach, top, palms, shrubs, rocks });
      }
  return tiles;
}

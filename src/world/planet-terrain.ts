import { CELLS, N, centreOf } from './cells.ts';
import { createNoise3 } from './noise3.ts';
import { START, type Cover, type Planet, type Rise } from './planet.ts';
import { clamp, smoothstep } from './scalar.ts';
import {
  R,
  add,
  distance,
  dot,
  frameAt,
  normalize,
  type Vec3,
} from './sphere.ts';
import { CELL, between, locate, taps } from './terrain-grid.ts';
import { heightBounds, profile, type Terrain } from './terrain.ts';

const GRASS_IN = [20, 45] as const,
  FOOT = [2, 5, 15, 35] as const;
export const BANDS = {
  shore: -0.15,
  beach: 0.45,
  dry: 2.6,
  dunes: 0.5,
  loam: 0.5,
  rubble: 0.7,
  ragged: 0.5,
} as const;
export const duneHeight = (summit: number) => BANDS.dunes * summit;
const BLOCK = 16;

function risesOf(t: Terrain): Rise[] {
  const rises: Rise[] = [],
    blocks = N / BLOCK,
    tops = heightBounds(t, blocks).hi;
  for (let face = 0; face < 6; face++)
    for (let bj = 0; bj < blocks; bj++)
      for (let bi = 0; bi < blocks; bi++) {
        const top = tops[(face * blocks + bj) * blocks + bi];
        if (top < 0) continue;
        const corner = (i: number, j: number) =>
          centreOf(face * N * N + j * N + i);
        const lo = bi * BLOCK,
          hi = lo + BLOCK - 1,
          low = bj * BLOCK,
          high = low + BLOCK - 1;
        const at = normalize(
          [lo, hi]
            .flatMap((i) => [low, high].map((j) => corner(i, j)))
            .reduce<Vec3>((a, b) => add(a, b), [0, 0, 0])
        );
        const reach =
          Math.max(
            ...[
              [lo, low],
              [hi, low],
              [lo, high],
              [hi, high],
            ].map(([i, j]) => distance(at, corner(i, j)))
          ) +
          2 * CELL;
        rises.push({ at, reach, top });
      }
  return rises;
}

function startOf(t: Terrain): { at: Vec3; bearing: number } {
  let summit = 0;
  for (let c = 0; c < CELLS; c++)
    if (t.height[c] > t.height[summit]) summit = c;
  const top = centreOf(summit);
  let best = -1,
    near = Infinity;
  for (let c = 0; c < CELLS; c++) {
    if (!t.water[c] || Math.abs(t.shore[c] - START) > CELL) continue;
    const d = distance(centreOf(c), top);
    if (d < near) [best, near] = [c, d];
  }
  const at = centreOf(best),
    f = frameAt(at),
    toward = add(top, at, -dot(top, at));
  return { at, bearing: Math.atan2(dot(toward, f.east), dot(toward, f.north)) };
}

function heartOf(t: Terrain, from: Vec3): Vec3 {
  let best = -1;
  for (let c = 0; c < CELLS; c++) {
    if (
      t.water[c] ||
      (best >= 0 && t.shore[c] >= t.shore[best]) ||
      dot(centreOf(c), from) > 0
    )
      continue;
    best = c;
  }
  if (best < 0)
    throw new Error('no land on the far side of the planet from the start');
  return centreOf(best);
}

export function terrainPlanet(t: Terrain, seed: number): Planet {
  const noise = createNoise3(seed + 104729),
    at = taps();
  const o = t.options;
  let qx = 0,
    qy = 0,
    qz = 0;
  const read = (size: number, shift: number) =>
    noise.value(qx / size + shift, qy / size, qz / size);

  const ground = (p: Vec3, cover: Cover | null): number => {
    locate(p, at);
    const s = between(t.shore, at),
      h = profile(t, between(t.relief, at), s);
    if (!cover) return h;
    const k = R / Math.hypot(p[0], p[1], p[2]);
    qx = p[0] * k;
    qy = p[1] * k;
    qz = p[2] * k;
    if (s < 0) {
      const up = clamp(h / o.summit);
      const patch = read(9, 11.3) + 0.5 * read(40, 23.9);
      cover.grass =
        smoothstep(GRASS_IN[0], GRASS_IN[1], -s) *
        smoothstep(-0.15, 0.15, patch + 0.15 - 0.6 * up);
      cover.rubble = smoothstep(0.55, 0.8, up + 0.35 * read(25, 37.1));
    } else {
      const depth = -h;
      const where = smoothstep(1.5, 3, depth) * (1 - smoothstep(14, 22, depth));
      cover.grass =
        where > 0
          ? where * smoothstep(0.1, 0.35, read(9, 51.7) + 0.5 * read(60, 67.3))
          : 0;
      const foot =
        smoothstep(FOOT[0], FOOT[1], s) * (1 - smoothstep(FOOT[2], FOOT[3], s));
      const rubble =
        Math.max(foot, smoothstep(0.45, 0.65, read(30, 79.9))) *
        smoothstep(0, 0.5, depth);
      cover.rubble =
        rubble > 0 ? rubble * smoothstep(-0.1, 0.25, read(7, 91.1)) : 0;
    }
    cover.mottle = clamp(0.5 + 1.1 * read(12, 103.7));
    cover.clump = clamp(0.5 + 0.9 * read(2.6, 117.5));
    return h;
  };

  const start = startOf(t);
  return {
    rises: risesOf(t),
    start,
    heart: heartOf(t, start.at),
    height: (p) => ground(p, null),
    cover: (p) => {
      const c: Cover = { grass: 0, rubble: 0, mottle: 0, clump: 0 };
      ground(p, c);
      return c;
    },
    sample: ground,
  };
}

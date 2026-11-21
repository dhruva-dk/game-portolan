// A module Worker: surveys a seed's planet for the seed panel (ui/panel.ts),
// off the main thread, as she types it: its land made (world/land.ts landOf,
// a second or two), its coasts traced (world/coastline.ts), points on its land
// to stipple, and where she would lie at the start; handed back as plain
// arrays. Nothing is built on the GPU, and the storm is not worked out at all:
// the panel never shows it. One seed at a time; an ask overtaken by a later
// one is cut off by the page ending the worker (preview.ts).
//   in:  { name } (a seed's text)   out: player.ts Chart

import type { Chart } from '../player.ts';
import { cellOf } from '../world/cells.ts';
import { coastLines } from '../world/coastline.ts';
import { landOf, planetOf } from '../world/land.ts';
import { seedOf } from '../world/seeds.ts';

/**
 * A coast's points kept, one in so many (its last always): the panel's globe
 * is a few hundred pixels across, and a coast's points are about a cell apart.
 */
const EVERY = 2;
/** Points laid evenly over the sphere (a Fibonacci lattice), to stipple the land. */
const DOTS = 14000;

self.onmessage = (e: MessageEvent<{ name: string }>) => {
  const t = performance.now(),
    { name } = e.data,
    seed = seedOf(name);
  const land = landOf(seed);
  const lines = coastLines(land.shore);
  const kept: number[] = [],
    runs: number[] = [0];
  for (const line of lines) {
    line.forEach((p, i) => {
      if (i % EVERY === 0 || i === line.length - 1) kept.push(p[0], p[1], p[2]);
    });
    runs.push(kept.length / 3);
  }
  const dots: number[] = [];
  for (let i = 0; i < DOTS; i++) {
    const y = 1 - (2 * (i + 0.5)) / DOTS,
      r = Math.sqrt(1 - y * y),
      a = i * Math.PI * (3 - Math.sqrt(5));
    const x = r * Math.cos(a),
      z = r * Math.sin(a);
    if ((land.shore[cellOf([x, y, z])] ?? 0) < 0) dots.push(x, y, z);
  }
  const chart: Chart = {
    name,
    points: Float32Array.from(kept),
    runs: Uint32Array.from(runs),
    land: Float32Array.from(dots),
    start: planetOf(seed, land).start.at,
    ms: performance.now() - t,
  };
  self.postMessage(chart, {
    transfer: [chart.points.buffer, chart.runs.buffer, chart.land.buffer],
  });
};

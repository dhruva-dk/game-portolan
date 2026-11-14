// Where the islands (planet-islands.ts) lie: spread evenly over the whole planet, as many of each kind as its area
// holds at its density, the largest first, each where the most water is left between its apron and every other's (the
// farthest point, a little shaken by the seed so they don't fall in rows), on the banks clear of the deeps, and never
// nearer another's apron than `gap`. Each kind's radii are drawn more small than large.
//
// Pure arithmetic: no three, so it runs in node for the tests.

import { R, add, cross, dot, frameAt, scale, type Chart, type Vec3 } from './sphere.ts';
import { random } from './random.ts';
import type { Noise3 } from './noise3.ts';
import { ISLANDS, KINDS, ORDER, createIslandSite, type IslandSite } from './planet-islands.ts';

/** The sea floor at unit direction p before any island: how far from the deep water's edge (negative inside it), metres. */
export type Ground = (p: Vec3) => { clearance: number };

/** Points spread evenly over the sphere, `count` of them (a Fibonacci lattice). */
function lattice(count: number): Vec3[] {
  const golden = Math.PI * (3 - Math.sqrt(5));
  return Array.from({ length: count }, (_, i) => {
    const y = 1 - (2 * (i + 0.5)) / count, s = Math.sqrt(1 - y * y), a = i * golden;
    return [Math.cos(a) * s, y, Math.sin(a) * s] as Vec3;
  });
}

/** Metres between the places looked at for an island, and how much the seed shakes each one's water left, metres. */
const SPACING = 20, SHAKE = 30;

/** The islands for a planet whose deeps are `ground`, its floor nowhere deeper than `deepest` metres: every kind's in
 *  ORDER, each kind's largest first, spread evenly. */
export function placeIslands(ground: Ground, noise: Noise3, seed: number, deepest: number): IslandSite[] {
  const rand = random(seed * 15485863 + 7);
  const area = 4 * Math.PI * R * R;
  const candidates = lattice(Math.ceil(area / (SPACING * SPACING))).map((p) => ({ p, clear: ground(p).clearance }));
  /** For each candidate, the water between it and the nearest apron placed, metres. */
  const room = new Float64Array(candidates.length).fill(Infinity);
  const placed: IslandSite[] = [];
  let n = 0;
  for (const kind of ORDER) {
    const K = KINDS[kind], count = Math.max(kind === 'island' ? 1 : 0, Math.round(area * K.density));
    const radii = Array.from({ length: count }, () => K.radius[0] + (K.radius[1] - K.radius[0]) * rand() ** K.skew).sort((a, b) => b - a);
    for (const radius of radii) {
      // the island's shape is its own; only its chart says where it lies
      const shape = createIslandSite(kind, { at: [0, 1, 0], axis: [1, 0, 0] }, radius, noise, seed * 31 + ++n, deepest);
      let best = -1, most = -Infinity;
      candidates.forEach((c, i) => {
        const shaken = rand() * SHAKE;
        if (c.clear <= shape.shelf + K.clearance) return;
        const water = (placed.length ? room[i] - shape.shelf : 0) + shaken;
        if (water > most) [best, most] = [i, water];
      });
      if (best < 0 || (placed.length && most - SHAKE < ISLANDS.gap)) continue;
      const spot = candidates[best].p, { up, east, north } = frameAt(spot), turn = rand() * 2 * Math.PI;
      placed.push({ ...shape, chart: { at: up, axis: add(scale(east, Math.cos(turn)), north, Math.sin(turn)) } });
      candidates.forEach((c, i) => {
        room[i] = Math.min(room[i], Math.acos(Math.min(1, Math.max(-1, dot(c.p, spot)))) * R - shape.shelf);
      });
    }
  }
  return placed;
}

/**
 * sphere.ts toChart for one chart, without its allocations: where unit vector p lies on the chart, and how far
 * from its centre, metres, written into `out` as x, z, r.
 */
export function charter(chart: Chart): (p: Vec3, out: Float64Array) => void {
  const [ax, ay, az] = chart.at, [ex, ey, ez] = chart.axis, [fx, fy, fz] = cross(chart.axis, chart.at);
  return (p, out) => {
    const c = p[0] * ax + p[1] * ay + p[2] * az;
    const dx = p[0] - ax * c, dy = p[1] - ay * c, dz = p[2] - az * c;
    const s = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (s < 1e-12) { out[0] = out[1] = out[2] = 0; return; }
    const k = (Math.atan2(s, c) * R) / s;
    out[0] = (dx * ex + dy * ey + dz * ez) * k;
    out[1] = (dx * fx + dy * fy + dz * fz) * k;
    out[2] = s * k;
  };
}

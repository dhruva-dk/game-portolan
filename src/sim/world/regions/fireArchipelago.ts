// The Fire Archipelago. Cinder Peak, a black cone 135 m high and 340 m across, with a flooded caldera at its
// summit that you sail into through a breach in its south-west wall. Gullies score its flanks; fresh flows
// reach the sea in hot water. Around it, smaller black cones and lava skerries on near-black water.
// Chart: x east, y north (toward the equator); the Maelstrom lies south.
import { R } from '../../sphere.ts';
import { fbm, fromEquator, hyp, noise, polyDist, ridged, scatter, shore, smax, smin, smoothstep, snapWet } from '../kit.ts';
import type { RegionSpec } from '../spec.ts';

const S = 0xf12e;
const PEAK = { x: 0, y: 25, base: 165, rim: 64, lake: 42, top: 135 };
// The breach: a gash from the caldera lake out to the sea, south-south-west.
const BREACH = [PEAK.x, PEAK.y, -50, -105, -66, -170];
const LANE = [-250, -150, -120, -205, 30, -200, 150, -150, 265, -95];

function cone(x: number, y: number): number {
  const dx = x - PEAK.x, dy = y - PEAK.y, rho = hyp(dx, dy);
  const base = PEAK.base * (1 + 0.07 * noise(dx * 0.012, dy * 0.012, S));
  if (rho > base + 40) return -1e9;
  let h: number;
  if (rho > PEAK.rim) {
    // The flank: concave, scored by gullies running down it.
    const v = Math.max(0, (base - rho) / (base - PEAK.rim)), flank = PEAK.top * v * v * (0.35 + 0.65 * v);
    const gully = rho > 1e-6 ? ridged((dx / rho) * 6, (dy / rho) * 6 + rho * 0.02, S + 1) : 0;
    h = rho < base ? flank * (1 - 0.12 * gully * smoothstep(PEAK.rim, PEAK.rim * 2, rho)) : -60 * smoothstep(0, 30, rho - base);
  } else {
    // The caldera's inner wall drops sheer to the lake.
    h = -12 + (PEAK.top + 12) * smoothstep(PEAK.lake, PEAK.rim, rho);
  }
  // The breach cuts through the wall to the lake's level and below.
  const db = polyDist(x, y, BREACH);
  return smin(h, -6 + 9 * Math.max(0, db - 9), 4);
}

function height(x: number, y: number): number {
  // Near-black water over black sand and ash.
  let h = -24 + 5 * fbm(x * 0.009, y * 0.009, S + 2, 3);
  h = smin(h, -60 + 1.3 * fromEquator(x, y, R, true), 4);
  const c = cone(x, y);
  if (c > -1e8) h = smax(h, c, 3);
  // Smaller black cones and lava skerries.
  h = scatter(x, y, 64, S + 10, 0.55, h, (s) => {
    const r = 12 + 22 * s.a, rho = hyp(s.dx, s.dy), d = rho - r;
    if (d > 30) return -1e9;
    const top = 6 + 26 * s.b * s.b, v = Math.max(0, 1 - rho / r);
    return d < 0 ? Math.max(shore(d, 1.5, 4, 0, 1), top * v * v * (0.4 + 0.6 * v) + 1.5 * smoothstep(0, 4, -d)) : shore(d, 0, 1, 2, 6);
  }, (cx, cy) => hyp(cx - PEAK.x, cy - PEAK.y) < PEAK.base + 55 || polyDist(cx, cy, LANE) < 40 || fromEquator(cx, cy, R, true) < 54);
  return h;
}

export const fireArchipelago: RegionSpec = {
  height,
  landmark: { x: PEAK.x, y: PEAK.y, r: PEAK.rim, height: PEAK.top, bearing: 200 },
  // The lava's glow in the caldera, lighting the plume from below.
  beacon: { x: PEAK.x, y: PEAK.y, height: PEAK.top + 10 },
  loot: snapWet(height, [PEAK.x, PEAK.y, -60, -150, -200, 120, 190, 120, 200, -120, -190, -60, 70, 230, -90, 230], 3),
  lanes: [
    // A hot current round the cone's southern foot and east into the Weeping Isle's water.
    { name: 'the Ash current', pts: LANE, width: 22, speed: 2.8 },
  ],
  obstacles: [],
  zones: [
    { kind: 'hot', x: PEAK.x, y: PEAK.y, r: PEAK.lake },
    { kind: 'hot', x: 150, y: -60, r: 26 }, { kind: 'hot', x: -150, y: 70, r: 24 },
    { kind: 'sulphur', x: -60, y: -150, r: 30 }, { kind: 'sulphur', x: 120, y: 160, r: 28 },
  ],
  tidal: [],
  props: [],
};

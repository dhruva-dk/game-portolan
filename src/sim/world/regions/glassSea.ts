// The Glass Sea. Almost no skyline, on purpose: a wide, mirror-calm sea over white sand banks, shallow enough
// that the floor shows, with a handful of low sand isles under palms. At its heart Glasswater, a crystal pool
// inside a ring of sand with three gaps, whose light rises in a pale pillar. The whale road runs through it.
// Chart: x east, y north (toward the equator); the Maelstrom lies south.
import { dcos, dsin } from '../../math.ts';
import { R } from '../../sphere.ts';
import { fbm, fromEquator, hash01, hyp, noise, plant, ridged, ringBand, shoals, shore, smax, smin, smoothstep, snapWet } from '../kit.ts';
import type { ObstacleSpec, RegionSpec } from '../spec.ts';

const S = 0x6a55;
const POOL = { x: 0, y: -10, r: 40 };
const GAPS = [0, 135, 250];
const ISLES = [[-150, 150, 15], [165, 165, 19], [-170, -120, 16], [150, -150, 12], [55, 225, 10], [-60, -215, 13], [-215, 30, 9]];
const LANE = [95, -300, 112, -80, 100, 110, 160, 255, 230, 340];

function height(x: number, y: number): number {
  // White sand banks in long, low swells, mostly 3–9 m down, a few shoaling to 2.
  let h = -6.5 + 2.6 * fbm(x * 0.006, y * 0.006, S, 3) + 2.2 * ridged(x * 0.011, y * 0.011, S + 1);
  // Deeper toward the Great Current and the Maelstrom.
  h = smin(h, -60 + 1.3 * fromEquator(x, y, R, true), 4);
  // Glasswater: a ring of sand just above the water, three gaps, a deep clear pool inside.
  const dp = hyp(x - POOL.x, y - POOL.y);
  if (dp < POOL.r + 40) {
    let b = 0;
    if (dp > 1e-6) {
      const ux = (x - POOL.x) / dp, uy = (y - POOL.y) / dp;
      for (const g of GAPS) {
        const a = (g * 3.141592653589793) / 180, along = dp * Math.abs(ux * dcos(a) - uy * dsin(a)), facing = ux * dsin(a) + uy * dcos(a);
        if (facing > 0) b = Math.max(b, 1 - smoothstep(7, 11, along));
      }
    }
    // Inside the ring the floor drops to a clean 7.5 m.
    const w = 1 - smoothstep(POOL.r - 14, POOL.r - 2, dp);
    h = h * (1 - w) - 7.5 * w;
    const rim = ringBand(dp + 1.5 * noise(x * 0.1, y * 0.1, S + 2), POOL.r, 8, 0.8 - 4.8 * b, -60);
    h = smax(h, rim, 1.5);
  }
  // Low sand isles.
  for (const [ix, iy, r] of ISLES) {
    const d = hyp(x - ix, y - iy) - r * (1 + 0.25 * noise(x * 0.06, y * 0.06, S + 3));
    if (d < 60) h = smax(h, shore(d, 2.4, 12, 3, 22), 2);
  }
  // Shoals across the open water, so no straight course runs empty for long.
  return shoals(x, y, h, 140, S + 40);
}

// The shards of natural glass round the rim of the pool, every seventh left out for a way in. Each is a solid
// column at the waterline, so what a ship runs into is what she sees; r is its girth there.
const SHARDS: ObstacleSpec[] = [];
for (let i = 0; i < 14; i++) {
  if (i % 7 === 0) continue;
  const a = (i / 14) * 6.283185307179586;
  SHARDS.push({ kind: 'trunk', x: POOL.x - 42 * dsin(a), y: POOL.y + 42 * dcos(a), bearing: 0, r: 0.8 * (3 + 3 * hash01(i, 3, S)),
    height: 14 + 56 * hash01(i, 2, S) * (i % 3 === 1 ? 1 : 0.5) });
}

export const glassSea: RegionSpec = {
  height,
  // Glasswater is low; its light pillar is what neighbours see.
  landmark: { x: POOL.x, y: POOL.y, r: POOL.r, height: 70, bearing: 0 },
  beacon: { x: POOL.x, y: POOL.y, height: 70 },
  loot: snapWet(height, [POOL.x, POOL.y, -150, 120, 165, 130, -170, -90, 150, -120, 55, 195, -60, -185, -197, 66], 3),
  lanes: [
    // The whale road: from the Maelstrom's edge north past Glasswater and across the Great Current.
    { name: 'the Whale road', pts: LANE, width: 26, speed: 2.6 },
  ],
  obstacles: SHARDS,
  zones: [{ kind: 'lagoon', x: POOL.x, y: POOL.y, r: POOL.r - 4 }],
  tidal: [],
  props: plant(height, 'palm', [-260, -260, 260, 300], 7, S + 20, 0.6, 0.8, 4, 0.3, 9),
};

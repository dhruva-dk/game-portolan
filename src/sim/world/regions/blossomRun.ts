// Blossom Run. Rolling hills of meadow and blossom, 15–50 m high, cut north to south by a wide river valley
// you can sail the length of, with side streams crossing to east and west. The Great Cherry stands on the
// round hill beside the river, its pink crown 116 m up. River stones and meadow islets dot the outer water.
// Chart: x east, y north; the Ice Crown lies north, the Great Current along the south edge.
import { R } from '../../sphere.ts';
import { fbm, fromEquator, hyp, noise, plant, scatter, shoals, shore, smax, smin, smoothstep, snapWet, strokeDist } from '../kit.ts';
import type { RegionSpec } from '../spec.ts';

const S = 0xb105;
// The river, as a tapered stroke (x, y, half-width), widening toward its mouth.
const RIVER = [-22, 330, 30, -8, 220, 30, -32, 130, 32, 8, 40, 33, -14, -50, 34, 10, -140, 36, 30, -230, 42];
const WEST_STREAM = [-330, 92, 17, -160, 76, 16, -30, 68, 17];
const EAST_STREAM = [10, -62, 17, 150, -84, 16, 330, -70, 17];
const CHERRY = { x: 58, y: 44, hill: 52, r: 62 };
const LANE = [-20, 300, -8, 220, -30, 130, 6, 40, -12, -50, 10, -140, 30, -230, 60, -340];

/** Signed distance to the outer coast of the hill country (negative inland). */
function country(x: number, y: number): number {
  const wx = x + 14 * noise(x * 0.01, y * 0.01, S), wy = y + 14 * noise(x * 0.01 + 5, y * 0.01, S + 1);
  const qx = Math.abs(wx) - 150, qy = Math.abs(wy - 40) - 175;
  return hyp(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - 30;
}

function height(x: number, y: number): number {
  // Clear, soft blue water over sand and river stones.
  let h = -16 + 4 * fbm(x * 0.01, y * 0.01, S + 2, 3);
  // The hills: land inside the country, away from the river and streams.
  let water = strokeDist(x, y, RIVER);
  water = smin(water, strokeDist(x, y, WEST_STREAM), 10);
  water = smin(water, strokeDist(x, y, EAST_STREAM), 10);
  const sd = smax(country(x, y), -water, 12);
  // Rolling: long swells with softer knolls on them.
  const roll = 20 + 16 * fbm(x * 0.006, y * 0.006, S + 3, 3) + 6 * noise(x * 0.025, y * 0.025, S + 4);
  // The Great Cherry's hill.
  const dc = hyp(x - CHERRY.x, y - CHERRY.y);
  const top = Math.max(roll, CHERRY.hill * (1 - smoothstep(0, CHERRY.r, dc) * smoothstep(0, CHERRY.r, dc)));
  // Meadow banks: a gentle rise over 40 m from the water; a sandy shelf off the shore.
  h = smax(h, shore(sd, top, 42, 2.8, 14), 3);
  // River stones and meadow islets in the outer water.
  h = scatter(x, y, 50, S + 10, 0.5, h, (s) => {
    const r = 4 + 10 * s.a, d = hyp(s.dx, s.dy) - r * (1 + 0.3 * noise(s.dx * 0.1, s.dy * 0.1, S + 5));
    return d > 30 ? -1e9 : shore(d, 1 + 5 * s.b, 8, 2.2, 10);
  }, (cx, cy) => country(cx, cy) < 30 || fromEquator(cx, cy, R, false) < 48);
  // Shoals across the open water, so no straight course runs empty for long.
  return shoals(x, y, h, 140, S + 40);
}

export const blossomRun: RegionSpec = {
  height,
  landmark: { x: CHERRY.x, y: CHERRY.y, r: 30, height: CHERRY.hill + 66, bearing: 0 },
  // Fireflies in the cherry's crown.
  beacon: { x: CHERRY.x, y: CHERRY.y, height: CHERRY.hill + 18 },
  loot: snapWet(height, [-10, 250, -26, 130, 6, 0, 8, -150, -80, 71, 160, -80, -200, -190, 80, 260, -90, 260], 4),
  lanes: [
    // The river runs down the valley and out across the Great Current into the Glass Sea.
    { name: 'the Blossom river', pts: LANE, width: 30, speed: 3.2 },
  ],
  obstacles: [],
  zones: [
    { kind: 'petals', x: -10, y: 200, r: 60 }, { kind: 'petals', x: -10, y: 60, r: 60 },
    { kind: 'petals', x: 0, y: -80, r: 60 }, { kind: 'petals', x: 30, y: -210, r: 60 },
  ],
  tidal: [],
  props: [
    { kind: 'cherry' as const, x: CHERRY.x, y: CHERRY.y, r: 2.5, height: CHERRY.hill + 66 },
    ...plant(height, 'cherry', [-250, -220, 250, 300], 18, S + 20, 0.55, 3, 60, 0.6, 10),
  ].filter((p, i) => i === 0 || hyp(p.x - CHERRY.x, p.y - CHERRY.y) > 14),
};

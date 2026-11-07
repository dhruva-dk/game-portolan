// The Jade Shoals. Long amber sandbars running north-east, a metre or two above the water with dunes on the
// wider ones, rippled flats either side and channels of darker blue between. The bars are broken by gaps,
// some deep and some floored by sills that the tide covers and uncovers. One great dune, 72 m high, carries
// the Sandbar Light, a natural beacon of glowing glass sand.
// Chart: x east, y north (toward the equator); the Maelstrom lies south.
import { R } from '../../sphere.ts';
import { blobDist, fbm, fromEquator, hash01, noise, over, plant, shoals, smin, smoothstep, snapWet } from '../kit.ts';
import type { RegionSpec } from '../spec.ts';

const S = 0x7ade;
// The bars run along bearing 60: u along them, v across (positive to the south-east).
const SU = 0.8660254037844387, CU = 0.5;
const SP = 52, GAP = 95;
const DUNE = { x: 10, y: -10, along: 75, across: 42, h: 72 };
const LANE_V = 1.5 * SP;

const offset = (u: number) => 8 * noise(u * 0.01, 0.5, S);

/** Gap j along bar k: its centre along the bar, and whether its floor is a tidal sill. */
const gapAt = (k: number, j: number) => ({ u: (j + 0.5 + 0.3 * (hash01(k, j, S + 1) - 0.5)) * GAP, tidal: hash01(k, j, S + 2) < 0.45 });

function height(x: number, y: number): number {
  const u = x * SU + y * CU, v = x * CU - y * SU;
  const vv = v - offset(u), k = Math.round(vv / SP), across = Math.abs(vv - k * SP);
  // Bar profile across: crest, rippled flats, then the channel.
  const hw = 8 + 3 * noise(u * 0.02, k * 1.7, S + 3);
  const crest = 0.6 + 1.6 * (0.5 + 0.5 * noise(u * 0.015, k * 2.3, S + 4)) + 4 * smoothstep(0.55, 0.9, noise(u * 0.008, k * 3.1, S + 5));
  const ripple = 0.15 * noise(x * 0.5, y * 0.5, S + 6) * smoothstep(hw, hw + 4, across);
  let h = across < hw
    ? -0.3 + (crest + 0.3) * (1 - smoothstep(0, hw, across) * smoothstep(0, hw, across))
    : -0.3 - 1.7 * smoothstep(hw, hw + 8, across) - (4.5 + 1.5 * fbm(x * 0.01, y * 0.01, S + 7, 2)) * smoothstep(hw + 8, SP / 2, across) + ripple;
  // Gaps through the bars: deep, or tidal sills at -1.5 m.
  const j = Math.floor(u / GAP);
  for (let jj = j - 1; jj <= j + 1; jj++) {
    const g = gapAt(k, jj), m = 1 - smoothstep(9, 14, Math.abs(u - g.u));
    if (m > 0) h = h + (Math.min(h, g.tidal ? -1.5 : -5.5) - h) * m * (1 - smoothstep(hw + 6, hw + 14, across));
  }
  // The channels deepen toward the Great Current and the Maelstrom.
  h = smin(h, -60 + 1.3 * fromEquator(x, y, R, true), 4);
  // The great dune.
  const dd = blobDist(x, y, DUNE.x, DUNE.y, DUNE.across, DUNE.along, SU, CU) / DUNE.across + 1;
  if (dd < 1.6) {
    const q = Math.min(1, dd), dune = DUNE.h * (1 - q * q) * (1 - q * q) - 60 * smoothstep(1, 1.6, dd);
    h = over(h, dune, 3);
  }
  // Shoals across the open water, so no straight course runs empty for long.
  return shoals(x, y, h, 140, S + 40);
}

// The tidal gaps inside the region whose middle the dune or a shoal has not buried, for the simulation and the tests.
const TIDAL: number[] = [];
for (let k = -7; k <= 7; k++) {
  for (let j = -4; j <= 3; j++) {
    const g = gapAt(k, j);
    if (!g.tidal) continue;
    // A point on the bar's centre line at the gap (the offset is a function of u alone).
    const v = k * SP + offset(g.u), x = g.u * SU + v * CU, y = g.u * CU - v * SU;
    if (Math.abs(x) < 190 && y > -230 && y < 230 && fromEquator(x, y, R, true) > 50 && Math.abs(height(x, y) + 1.5) < 0.4) TIDAL.push(x, y);
  }
}

const LANE: number[] = [];
for (let u = -260; u <= 270; u += 53) {
  const v = LANE_V + offset(u);
  LANE.push(u * SU + v * CU, u * CU - v * SU);
}

export const jadeShoals: RegionSpec = {
  height,
  landmark: { x: DUNE.x, y: DUNE.y, r: 40, height: DUNE.h + 6, bearing: 60 },
  beacon: { x: DUNE.x, y: DUNE.y, height: DUNE.h + 6 },
  loot: snapWet(height, [-150, 60, 120, -120, -60, 170, 160, 130, 60, -200, -93, -149, 90, 60, -90, -60], 3),
  lanes: [
    // A tidal stream along the channel south of the great dune, running out north-east into the Coral Atolls.
    { name: 'the Shoal stream', pts: LANE, width: 22, speed: 2.8 },
  ],
  obstacles: [],
  zones: [],
  tidal: TIDAL,
  props: plant(height, 'palm', [-250, -260, 250, 300], 9, S + 20, 0.25, 1.5, 10, 0.3, 7),
};

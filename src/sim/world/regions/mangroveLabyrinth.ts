// The Mangrove Labyrinth. A maze of low root islands, a metre proud of tea-brown water, split by narrow channels
// along the edges of Voronoi cells, all under a low canopy. Some channels are root-choked: their floors sit at
// the tide's reach, opening and closing as it rises and falls. A few wider main channels are always open: a
// ring round the heart and spokes out to every side. At the heart the Root Gate, a great arch of tangled roots
// over the north–south channel.
// Chart: x east, y north (toward the equator); the Maelstrom lies south.
import { R } from '../../sphere.ts';
import { cells, fromEquator, hyp, needle, noise, plant, polyDist, smax, smin, smoothstep, snapWet } from '../kit.ts';
import type { RegionSpec } from '../spec.ts';

const S = 0x3a46;
const GATE = { x: 0, y: 0, half: 17, top: 50, clear: 24 };
const RING = 62;
// The main channels: always open.
const SPOKES: number[][] = [
  [0, -330, 0, 0],
  [0, 0, 0, 62, 40, 180, 110, 340],
  [RING, 0, 330, 12],
  [-RING, 0, -330, -14],
  [-44, 44, -220, 300],
  [44, -44, 230, -260],
];
const LANE = [0, -290, 0, -60, 0, 60, 40, 180, 110, 340];

/** Distance to the nearest main channel's centre line. */
function mainChannel(x: number, y: number): number {
  let d = Math.abs(hyp(x - GATE.x, y - GATE.y) - RING);
  for (const s of SPOKES) d = Math.min(d, polyDist(x, y, s));
  return d;
}

function height(x: number, y: number): number {
  const wx = x + 4 * noise(x * 0.04, y * 0.04, S), wy = y + 4 * noise(x * 0.04 + 6, y * 0.04, S + 1);
  const c = cells(wx, wy, 44, S + 2, 0.9), edge = (c.f2 - c.f1) / 2;
  const half = 6.5 + 2.5 * noise(x * 0.02, y * 0.02, S + 3);
  let sd = half - edge;
  // The main channels, 20 m wide.
  sd = smax(sd, 10 - mainChannel(x, y), 3);
  // Open water toward the Great Current.
  sd += Math.max(0, 60 - fromEquator(x, y, R, true)) * 0.8;
  // Root-choked channels: where this noise is high the floor rises to a tidal sill.
  const choked = smoothstep(0.15, 0.35, noise(x * 0.018, y * 0.018, S + 4)) * smoothstep(12, 6, mainChannel(x, y));
  const floor = -3.6 + 2.1 * choked;
  // One cell in seven is a mud flat awash, not a root island.
  const top = (c.id & 1023) < 150 ? -0.6 : 1.1 + 0.4 * noise(x * 0.08, y * 0.08, S + 5);
  let h = sd < 0 ? top * smoothstep(0, 5, -sd) : floor * smoothstep(0, 4, sd);
  // Deeper in the main channels and out toward the Great Current.
  h = smin(h, -4.5 + 3 * smoothstep(4, 10, mainChannel(x, y)), 1);
  h = smin(h, -60 + 1.2 * fromEquator(x, y, R, true), 3);
  // The Root Gate's feet: two tangled mounds either side of the channel.
  for (const s of [-1, 1]) {
    const d = hyp(x - GATE.x - s * GATE.half, y - GATE.y);
    if (d < 24) h = smax(h, needle(d, 7, 7), 1);
  }
  return h;
}

// The root-choked channels' sills, found by walking the maze: channel middles where the floor is at the sill.
const SILLS: number[] = [];
for (let y = -230; y <= 230 && SILLS.length < 16; y += 9) {
  for (let x = -200; x <= 200 && SILLS.length < 16; x += 9) {
    const h = height(x, y);
    if (h < -1.7 || h > -1.3 || mainChannel(x, y) < 20) continue;
    let near = false;
    for (let k = 0; k < SILLS.length; k += 2) if (hyp(SILLS[k] - x, SILLS[k + 1] - y) < 70) near = true;
    if (!near) SILLS.push(x, y);
  }
}

export const mangroveLabyrinth: RegionSpec = {
  height,
  landmark: { x: GATE.x, y: GATE.y, r: 24, height: GATE.top + 2, bearing: 0 },
  // Foxfire in the tangle of the Gate.
  beacon: { x: GATE.x, y: GATE.y, height: GATE.top - 10 },
  loot: snapWet(height, [0, -30, 0, 120, 120, 6, -120, -6, -130, 170, 140, -160, -60, -200, 160, 150], 3),
  lanes: [
    // In from the Maelstrom's edge, under the Root Gate, and out north-east to Blossom Run.
    { name: 'the Gate run', pts: LANE, width: 16, speed: 2.6 },
  ],
  obstacles: [
    { kind: 'arch', x: GATE.x, y: GATE.y, bearing: 90, r: GATE.half, height: GATE.top, inner: GATE.clear },
  ],
  zones: [{ kind: 'canopy', x: 0, y: 0, r: 240 }],
  tidal: SILLS,
  props: plant(height, 'mangrove', [-260, -280, 260, 300], 19, S + 20, 0.6, 0.4, 3, 0.6, 9),
};

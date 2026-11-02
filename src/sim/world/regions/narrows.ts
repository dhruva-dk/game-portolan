// The Narrows. Two long walls of banded ochre sandstone, 70–90 m high and unbroken for 440 m, with a dark slot
// of water between them: the Gorge, one way in at the north and one way out at the south. Outside the walls the
// water is strewn with flat-topped buttes and ledges; scree fans spill into the sea at both mouths.
// Chart: x east, y north; the Ice Crown lies north, the Great Current along the south edge.
import { dsin } from '../../math.ts';
import { R } from '../../sphere.ts';
import { fbm, fromEquator, hyp, noise, over, polyDist, scatter, shore, smoothstep, snapWet } from '../kit.ts';
import type { RegionSpec } from '../spec.ts';

const S = 0x7a77;
const NORTH = 238, SOUTH = -208;

/** The Gorge's centre line, wandering a little. */
const axis = (y: number) => 16 * dsin(y * 0.011) + 6 * dsin(y * 0.027 + 1);

const SLOT = 12, WALL = 46;
const LANE: number[] = [];
for (let y = 330; y >= -230; y -= 40) LANE.push(axis(y), y);
LANE.push(50, -340);

function walls(x: number, y: number): number {
  const q = Math.abs(x - axis(y));
  // Past the ends (positive) the walls round off into buttresses.
  const past = Math.max(y - NORTH, SOUTH - y);
  const slot = SLOT + 1.5 * noise(y * 0.05, 0, S), edge = slot + WALL + 6 * noise(y * 0.02, 3, S + 1);
  // Signed distance into the rock of either wall (negative inside).
  const sd = Math.max(slot - q, q - edge, past);
  if (sd > 60) return -1e9;
  if (sd < 0) {
    const top = 74 + 10 * fbm(x * 0.01, y * 0.01, S + 2, 2);
    // Sheer inner faces; the outer faces step down in ledges, the sandstone's bands.
    const step = Math.floor(Math.min(edge - q, 30) / 6) / 5;
    const face = Math.min(smoothstep(0, 2.5, q - slot), 0.55 + 0.45 * step);
    return top * face * smoothstep(0, 3, -sd);
  }
  // Under water the faces carry straight down; at the mouths, scree fans spread out from the wall ends.
  const fan = smoothstep(-10, 10, past);
  return -60 * smoothstep(0, 8 + 16 * fan, sd) + 2.5 * fan * smoothstep(0, 6, sd) * (1 - smoothstep(6, 40, sd));
}

function height(x: number, y: number): number {
  // Deep bottle-green water.
  let h = -22 + 5 * fbm(x * 0.008, y * 0.008, S + 3, 3);
  h = over(h, walls(x, y), 2);
  // Buttes and mesas outside the walls: flat tops, sheer sides, a ledge at the waterline.
  h = scatter(x, y, 66, S + 10, 0.55, h, (s) => {
    const r = 9 + 15 * s.a, d = hyp(s.dx, s.dy) - r * (1 + 0.2 * noise(s.dx * 0.1, s.dy * 0.1, S + 4));
    if (d > 32) return -1e9;
    const top = s.b > 0.6 ? 18 + 26 * s.c : 3 + 6 * s.c;
    return d < 0 ? top * smoothstep(0, 3, -d) : shore(d, 0, 1, 1.8, 6);
  }, (cx, cy) => Math.abs(cx - axis(cy)) < SLOT + WALL + 40 && cy < NORTH + 40 && cy > SOUTH - 40
    || polyDist(cx, cy, LANE) < 40 || fromEquator(cx, cy, R, false) < 62);
  return h;
}

export const narrows: RegionSpec = {
  height,
  landmark: { x: axis(15), y: 15, r: 30, height: 82, bearing: 180 },
  beacon: { x: axis(NORTH) + SLOT + WALL / 2, y: NORTH, height: 70 },
  loot: snapWet(height, [axis(120), 120, axis(-90), -90, -150, 60, 150, -40, -120, -170, 140, 180, -134, 188, 160, -190], 4),
  lanes: [
    // The cold stream from the Crown runs on through the Gorge and out to the south-east.
    { name: 'the Gorge race', pts: LANE, width: 14, speed: 3.2 },
  ],
  obstacles: [],
  zones: [],
  tidal: [],
  props: [],
};

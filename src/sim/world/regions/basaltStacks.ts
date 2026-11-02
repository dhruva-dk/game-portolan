// The Basalt Stacks. Black columnar basalt: plateau islands with flat green turf tops and cliffs that step down
// into the sea in hexagonal columns, sea stacks standing off them, and Moonbow Arch, a span of rock 86 m high
// between two pillars, that you sail under. Behind the arch a narrow cut through the arch-head is floored by a
// sill: it opens at high tide and closes at low. Across the cut, east to west, runs a tunnel under the turf that only
// the Stacks' event, drawing the sea down below its rock roofs, lets a ship through.
// Chart: x east, y north; the Ice Crown lies north, the Great Current along the south edge.
import { dcos, dsin } from '../../math.ts';
import { R } from '../../sphere.ts';
import { blobDist, fbm, fromEquator, hexCell, hyp, needle, noise, over, polyDist, scatter, segDist, shoals, smax, smoothstep, snapWet } from '../kit.ts';
import type { RegionSpec } from '../spec.ts';

const S = 0xba5a;
const DEG = 3.141592653589793 / 180;

// Plateaus: centre, radii, bearing of the long axis, turf height.
const PLATEAUS: number[][] = [
  [-125, 60, 78, 52, 20, 34],
  [112, 150, 70, 42, -15, 30],
  [-40, -150, 82, 36, 100, 26],
  [112, -2, 36, 24, 0, 28],
  [-170, -60, 40, 28, 60, 22],
];
const SINCOS = PLATEAUS.map((p) => [dsin(p[4] * DEG), dcos(p[4] * DEG)]);

// Moonbow Arch: two pillars either side of a channel, the span running east–west.
const ARCH = { x: 60, y: -40, half: 28, top: 86, clear: 40 };
// The hidden passage: a cut north through the arch-head plateau, floored by a sill at -1.5 m.
const PASSAGE = [112, -40, 112, 40];
const LANE = [-10, 300, -8, 140, 12, 50, 48, 0, 60, -40, 82, -100, 130, -200, 196, -340];
// The hidden tunnel, floored 7 m down, and the middles of its two rock roofs, either side of the cut.
const TUNNEL = { x0: 66, x1: 158, y: 14, half: 6.5 };
const ROOFS = [96, 128];

/** Columns: quantises the ground into hexagonal basalt columns, each with its own height jitter. */
function columns(x: number, y: number, f: (x: number, y: number) => number): number {
  const c = hexCell(x, y, 2.2);
  return f(c.x, c.y) + 0.35 * ((c.id & 255) / 255 - 0.5);
}

function plateau(x: number, y: number): number {
  let sd = 1e9, top = 0;
  for (let i = 0; i < PLATEAUS.length; i++) {
    const p = PLATEAUS[i], d = blobDist(x, y, p[0], p[1], p[2], p[3], SINCOS[i][0], SINCOS[i][1]);
    if (d < sd) { sd = d; top = p[5]; }
  }
  sd += 6 * noise(x * 0.025, y * 0.025, S);
  // The hidden passage, cut through the arch-head.
  sd = smax(sd, 7 - segDist(x, y, PASSAGE[0], PASSAGE[1], PASSAGE[2], PASSAGE[3]), 2);
  if (sd > 0) {
    // A ledge of drowned column tops 1.5 m down (which is also the passage's sill), then the sea bed.
    return -1.5 * smoothstep(0, 3, sd) - 58.5 * smoothstep(7, 27, sd);
  }
  // Cliff faces of columns; the turf top rolls a little.
  const t = -sd;
  return (top + 3 * fbm(x * 0.02, y * 0.02, S + 1, 2)) * (0.15 * smoothstep(0, 1.5, t) + 0.85 * smoothstep(1.5, 5, t));
}

function height(x: number, y: number): number {
  // Slate-green sea, heavy swell.
  let h = -24 + 5 * fbm(x * 0.008, y * 0.008, S + 2, 3);
  h = over(h, columns(x, y, plateau), 1);
  // The arch's pillars.
  for (const s of [-1, 1]) {
    const d = hyp(x - ARCH.x - s * ARCH.half, y - ARCH.y);
    if (d < 30) h = over(h, columns(x, y, (cx, cy) => needle(hyp(cx - ARCH.x - s * ARCH.half, cy - ARCH.y), 10, ARCH.top - 6)), 1);
  }
  // Sea stacks.
  h = scatter(x, y, 52, S + 10, 0.55, h, (s) => {
    const r = 5 + 7 * s.a, rho = hyp(s.dx, s.dy);
    return rho > r + 10 ? -1e9 : needle(rho, r, 16 + 34 * s.b);
  }, (cx, cy) => fromEquator(cx, cy, R, false) < 40 || polyDist(cx, cy, LANE) < 26 || hyp(cx - ARCH.x, cy - ARCH.y) < 60);
  // Boulder beaches: low bars of rounded stones along the plateau feet.
  h = scatter(x, y, 30, S + 20, 0.3, h, (s) => {
    const d = hyp(s.dx, s.dy) - 3 - 4 * s.a;
    return d > 10 ? -1e9 : d < 0 ? 1.2 * smoothstep(0, 3, -d) : -60 * smoothstep(0, 10, d);
  }, (cx, cy) => fromEquator(cx, cy, R, false) < 30 || polyDist(cx, cy, LANE) < 16);
  // Shoals across the open water, so no straight course runs empty for long.
  h = shoals(x, y, h, 140, S + 40);
  // The tunnel, cut last so nothing stands in it.
  const dt = segDist(x, y, TUNNEL.x0, TUNNEL.y, TUNNEL.x1, TUNNEL.y);
  return dt < TUNNEL.half + 3 ? Math.min(h, -7 + 45 * smoothstep(TUNNEL.half, TUNNEL.half + 3, dt)) : h;
}

export const basaltStacks: RegionSpec = {
  height,
  landmark: { x: ARCH.x, y: ARCH.y, r: 36, height: ARCH.top, bearing: 0 },
  // The moonbow's glow in the spray under the arch.
  beacon: { x: ARCH.x, y: ARCH.y, height: 30 },
  loot: snapWet(height, [ARCH.x, ARCH.y - 30, 112, 55, -20, 60, -160, 150, 160, 60, -130, -110, 40, -230, -129, 176, 30, 220], 4),
  lanes: [
    // Down from the north, under Moonbow Arch, and away south-east across the Great Current.
    { name: 'the Arch run', pts: LANE, width: 22, speed: 3 },
  ],
  obstacles: [
    { kind: 'arch', x: ARCH.x, y: ARCH.y, bearing: 90, r: ARCH.half, height: ARCH.top, inner: ARCH.clear },
  ],
  zones: [{ kind: 'spray', x: ARCH.x, y: ARCH.y, r: 30 }],
  tidal: [PASSAGE[0], (PASSAGE[1] + PASSAGE[3]) / 2],
  props: [],
  // The sea draws back from the arch-head and opens the hidden tunnel under it, east to west.
  event: {
    spots: [112, TUNNEL.y], r: 50,
    lift: [{ x: 112, y: TUNNEL.y, r: 45, fade: 30, by: -3 }],
    roofs: ROOFS.map((x) => ({ x, y: TUNNEL.y, bearing: 90, length: 22, width: 16, under: 8 })),
  },
};

// The Spires. A forest of pale limestone needles rising sheer from teal water, tallest in the cluster around the
// Needle and thinning toward the borders, each with a ledge of white-washed rubble at its foot and a crown of
// dark pines. The Needle itself is 150 m, seen from far across the north.
// Chart: x east, y north; the Ice Crown lies north, the Great Current along the south edge.
import { PI, datan2 } from '../../math.ts';
import { R } from '../../sphere.ts';
import { fbm, fromEquator, hyp, needle, over, polyDist, scatter, scatterPoints, shoals, smoothstep, snapWet, type Scattered } from '../kit.ts';
import type { PropSpec, RegionSpec } from '../spec.ts';

const S = 0x5b1e;
const NEEDLE = { x: 0, y: 50, r: 15, h: 150 };
// The race swings east round the Needle, clear of the carve's reach (about 50 m), then back west to the Great Current.
const LANE = [40, 290, 70, 150, 85, 50, 30, -60, -80, -110, -150, -230, -200, -340];
// Where a spire can fall across the run: the middle of each of its three central reaches, lying square to it.
const FALLS = [1, 2, 3].map((k) => {
  const ax = LANE[2 * k], ay = LANE[2 * k + 1], bx = LANE[2 * k + 2], by = LANE[2 * k + 3];
  return { x: (ax + bx) / 2, y: (ay + by) / 2, bearing: (datan2(bx - ax, by - ay) * 180) / PI + 90 };
});

// Where needles may not stand: too near the Needle, the Great Current or the lane.
function clear(cx: number, cy: number, pad: number): boolean {
  return hyp(cx - NEEDLE.x, cy - NEEDLE.y) < 40 || fromEquator(cx, cy, R, false) < 34 + pad || polyDist(cx, cy, LANE) < 26 + pad;
}

// How tall the needles grow: highest in the cluster round the Needle.
const cluster = (x: number, y: number) => 1 - smoothstep(50, 300, hyp(x - NEEDLE.x, y - NEEDLE.y));

let PX = 0, PY = 0;
const big = (s: Scattered) => {
  const r = 6 + 9 * s.a, rho = hyp(s.dx, s.dy);
  if (rho > r + 18) return -1e9;
  const top = 20 + (35 + 55 * s.b) * (0.35 + 0.65 * cluster(PX - s.dx, PY - s.dy));
  // A rubble ledge at the foot, just awash.
  const ledge = rho < r + 4 ? -1.6 : -1.6 - 58.4 * smoothstep(0, 10, rho - r - 4);
  return over(needle(rho, r, top), ledge, 1);
};
const small = (s: Scattered) => {
  const r = 2.5 + 4 * s.a, rho = hyp(s.dx, s.dy);
  return rho > r + 8 ? -1e9 : needle(rho, r, 8 + 26 * s.b);
};

function height(x: number, y: number): number {
  // Teal water over pale rock, shoaling in places.
  let h = -15 + 5 * fbm(x * 0.009, y * 0.009, S, 3);
  PX = x;
  PY = y;
  h = scatter(x, y, 42, S + 10, 0.72, h, big, (cx, cy) => clear(cx, cy, 6));
  h = scatter(x, y, 26, S + 20, 0.3, h, small, (cx, cy) => clear(cx, cy, 0));
  const dn = hyp(x - NEEDLE.x, y - NEEDLE.y);
  if (dn < 50) h = over(h, over(needle(dn, NEEDLE.r, NEEDLE.h), dn < NEEDLE.r + 6 ? -1.4 : -1.4 - 58.6 * smoothstep(0, 12, dn - NEEDLE.r - 6), 1), 1);
  // Shoals across the open water, so no straight course runs empty for long.
  return shoals(x, y, h, 140, S + 40);
}

// Pines crowning every big needle (the small ones are bare).
const CROWN = [0, 0, 0.5, 0.3, -0.45, 0.35, 0.2, -0.5, -0.5, -0.25];
const PINES: PropSpec[] = [];
const crown = (x: number, y: number, r: number, top: number, n: number, c: number) => {
  for (let k = 0; k < n; k++) {
    PINES.push({ kind: 'pine', x: x + CROWN[2 * k] * r, y: y + CROWN[2 * k + 1] * r, r: 0.7, height: top + 8 + 6 * c });
  }
};
for (const s of scatterPoints(-320, -340, 320, 330, 42, S + 10, 0.72, (cx, cy) => clear(cx, cy, 6))) {
  const r = 6 + 9 * s.a;
  crown(s.x, s.y, r, 20 + (35 + 55 * s.b) * (0.35 + 0.65 * cluster(s.x, s.y)), 1 + Math.floor(r / 4), s.c);
}
crown(NEEDLE.x, NEEDLE.y, NEEDLE.r, NEEDLE.h, 5, 0.5);

export const spires: RegionSpec = {
  height,
  landmark: { x: NEEDLE.x, y: NEEDLE.y, r: 26, height: NEEDLE.h, bearing: 0 },
  // Four lesser needles standing in the sea at the Needle's foot, their crowns burning with corona fire.
  beacon: { x: NEEDLE.x + 8, y: NEEDLE.y - 30, height: 66 },
  loot: snapWet(height, [-60, 60, 70, 80, 140, -60, -150, 20, 30, -120, -40, 200, 120, 190, -170, -170], 4),
  lanes: [
    // A slalom stream down through the towers and out across the Great Current to the Coral Atolls.
    { name: 'the Spire race', pts: LANE, width: 22, speed: 3 },
  ],
  obstacles: [],
  zones: [],
  tidal: [],
  props: PINES,
  // A spire breaks and falls across the run, at the middle of one of its three central reaches, and lies there.
  event: { spots: FALLS.flatMap((f) => [f.x, f.y]), bearings: FALLS.map((f) => f.bearing), r: 44, block: { length: 64, width: 14, stays: true } },
};

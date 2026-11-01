// The Kelp Shallows. Wide olive shallows three or four metres deep, cut by deeper winding channels, with low
// grassy islets and rock flats awash at low tide. The drama is under water: kelp beds everywhere, and at the
// heart the Kelp Cathedral, a deep round nave where giant kelp grows in columns 50–70 m above the surface.
// Chart: x east, y north; the Ice Crown lies north, the Great Current along the south edge.
import { dcos, dsin } from '../../math.ts';
import { R } from '../../sphere.ts';
import { fbm, fromEquator, hash01, hyp, noise, polyDist, ridged, scatter, shore, smin, smoothstep, snapWet } from '../kit.ts';
import type { ObstacleSpec, RegionSpec, ZoneSpec } from '../spec.ts';

const S = 0x4e19;
const NAVE = { x: 0, y: 30, r: 62 };
const LANE = [-60, 300, -85, 150, -105, 40, -40, -110, 70, -215, 150, -340];

function height(x: number, y: number): number {
  // The shallows: a sandy, weedy floor 3–4.5 m down.
  let h = -3.9 + 0.9 * fbm(x * 0.012, y * 0.012, S, 3);
  // Deeper channels winding through them.
  const ch = ridged(x * 0.0045 + 0.3 * noise(x * 0.01, y * 0.01, S + 1), y * 0.0045, S + 2);
  h = smin(h, -3.9 - 9 * smoothstep(0.78, 0.95, ch), 1);
  // Toward the Great Current the shallows shelve off into deep water.
  h = smin(h, -60 + 1.2 * fromEquator(x, y, R, false), 4);
  // The Cathedral's nave: a deep round basin where the giant kelp roots.
  const dn = hyp(x - NAVE.x, y - NAVE.y);
  if (dn < NAVE.r + 30) h = smin(h, -14 + 24 * smoothstep(NAVE.r - 20, NAVE.r + 25, dn), 3);
  // Low grassy islets.
  h = scatter(x, y, 58, S + 10, 0.55, h, (s) => {
    const r = 7 + 13 * s.a, d = hyp(s.dx, s.dy) - r * (1 + 0.3 * noise(s.dx * 0.07, s.dy * 0.07, S + 3));
    return d > 30 ? -1e9 : shore(d, 1.5 + 3.5 * s.b, 10, 3.6, 10);
  }, (cx, cy) => hyp(cx - NAVE.x, cy - NAVE.y) < NAVE.r + 30 || polyDist(cx, cy, LANE) < 40 || fromEquator(cx, cy, R, false) < 50);
  // Rock flats and tide pools, awash at low water.
  h = scatter(x, y, 33, S + 20, 0.4, h, (s) => {
    const r = 3 + 6 * s.a, d = hyp(s.dx, s.dy) - r;
    return d > 22 ? -1e9 : d < 0 ? -0.7 + 1.1 * s.b * smoothstep(0, 3, -d) : -0.7 - 59.3 * smoothstep(0, 22, d);
  }, (cx, cy) => hyp(cx - NAVE.x, cy - NAVE.y) < NAVE.r + 15 || polyDist(cx, cy, LANE) < 26);
  return h;
}

// The Cathedral's columns: a ring of eighteen, an inner ring of seven, and one at the heart.
const COLUMNS: ObstacleSpec[] = [];
const ring = (n: number, r: number, k0: number) => {
  for (let k = 0; k < n; k++) {
    const a = ((k + 0.3 * hash01(k, n, S)) / n) * 6.283185307179586, rr = r + 6 * (hash01(k, n, S + 1) - 0.5);
    COLUMNS.push({ kind: 'trunk', x: NAVE.x + rr * dsin(a), y: NAVE.y + rr * dcos(a), bearing: 0, r: 2.2,
      height: 50 + 20 * hash01(k + k0, n, S + 2) });
  }
};
ring(18, 47, 0);
ring(7, 22, 40);
COLUMNS.push({ kind: 'trunk', x: NAVE.x, y: NAVE.y, bearing: 0, r: 2.6, height: 72 });

// Kelp beds across the shallows, and the Cathedral's own.
const BEDS: ZoneSpec[] = [{ kind: 'kelp', x: NAVE.x, y: NAVE.y, r: NAVE.r + 10 }];
for (const [x, y, r] of [[-150, 170, 55], [120, 160, 60], [150, -60, 50], [-170, -60, 55], [-20, -170, 50], [90, -200, 40], [-200, 60, 40]]) {
  BEDS.push({ kind: 'kelp', x, y, r });
}

export const kelpShallows: RegionSpec = {
  height,
  landmark: { x: NAVE.x, y: NAVE.y, r: NAVE.r, height: 72, bearing: 0 },
  // The kelp glows at the heart of the nave.
  beacon: { x: NAVE.x, y: NAVE.y, height: 40 },
  loot: snapWet(height, [NAVE.x + 30, NAVE.y - 10, -150, 170, 120, 160, 150, -60, -170, -60, -20, -170, 190, 60, -60, 230], 3),
  lanes: [
    // A cold stream off the Crown runs down the western channels and away south-east to the mangroves.
    { name: 'the Kelp stream', pts: LANE, width: 24, speed: 2.8 },
  ],
  obstacles: COLUMNS,
  zones: BEDS,
  tidal: [],
  props: [],
};

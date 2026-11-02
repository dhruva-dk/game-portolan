// The Maelstrom, the south pole cap. A ring of dark, storm-beaten slate cliffs 30–45 m tall, 360 m across,
// broken by five gaps, around a wide whirlpool basin that drops to 60 m. At its calm centre stands the Eye, a
// spire of rock 100 m tall. Outside the ring, boulder shelves at the cliff feet and skerries out to the border.
// The whirlpool itself is a current (VORTEX_SPEC, read by index.ts), not terrain.
// Chart: the pole at the origin; the Glass Sea lies at bearing 334, and the south ring runs clockwise from it,
// one region every 51.4 degrees.
import { dcos, dsin } from '../../math.ts';
import { fbm, hyp, mix, needle, noise, over, polyDist, ridged, scatter, shoals, shore, smoothstep, snapWet } from '../kit.ts';
import type { RegionSpec } from '../spec.ts';

const S = 0x3a1e;
const DEG = 3.141592653589793 / 180;
const RING = { r: 178, w: 24, top: 42 };
const EYE = { x: 0, y: 0, r: 14, top: 100 };
// The gaps in the ring, by bearing: one toward the Glass Sea, the rest every 72 degrees.
const GAPS = [340, 52, 124, 196, 268];
const GAP_HALF = 20;

/** The whirlpool, for index.ts: radius of the basin, of the calm eye, and peak swirl and inflow (m/s). */
export const VORTEX_SPEC = { x: EYE.x, y: EYE.y, r: 165, eye: 24, swirl: 5, inflow: 1.1 };

// The spill: out of the basin through the Glass Sea gap and away north past the border.
const LANE: number[] = [];
for (const [r, b] of [[150, 344], [200, 340], [260, 337], [345, 334]]) LANE.push(r * dsin(b * DEG), r * dcos(b * DEG));

/** Distance across the nearest gap's axis, and whether (x, y) faces that gap. */
function gapDist(x: number, y: number, rho: number): number {
  if (rho < 1e-6) return 1e9;
  const ux = x / rho, uy = y / rho;
  let d = 1e9;
  for (const g of GAPS) {
    const sb = dsin(g * DEG), cb = dcos(g * DEG);
    if (ux * sb + uy * cb <= 0) continue;
    d = Math.min(d, rho * Math.abs(ux * cb - uy * sb));
  }
  return d;
}

function height(x: number, y: number): number {
  const rho = hyp(x, y);
  // Dark navy water outside the ring, 25–35 m down; the basin inside bowls down toward the Eye.
  const sea = -30 + 6 * fbm(x * 0.008, y * 0.008, S, 3);
  const bowl = -60 + 20 * smoothstep(EYE.r + 20, RING.r - 20, rho);
  let h = mix(bowl, sea, smoothstep(RING.r - 30, RING.r + 10, rho));
  // The cliff ring: slate walls, storm-cut, highest between the gaps.
  const wob = RING.r * (1 + 0.03 * noise(x * 0.012, y * 0.012, S + 1));
  const across = Math.abs(rho - wob) - RING.w * (0.8 + 0.3 * noise(x * 0.03, y * 0.03, S + 2));
  if (across < 60) {
    const g = gapDist(x, y, rho), open = 1 - smoothstep(GAP_HALF - 4, GAP_HALF + 10, g);
    const top = RING.top * (0.72 + 0.28 * smoothstep(GAP_HALF, GAP_HALF + 70, g)) - 6 * ridged(x * 0.04, y * 0.04, S + 3);
    // Inside the wall, a sheer face into the basin; outside, a boulder shelf awash at the foot, then deep.
    const sd = across;
    let wall = sd < 0
      ? top * smoothstep(0, 4, -sd)
      : rho < wob ? -60 * smoothstep(0, 18, sd) : -1.2 - 0.8 * smoothstep(4, 16, sd) - 58 * smoothstep(16, 40, sd);
    // The gaps cut the ring to a floor 14 m deep, always open.
    wall = mix(wall, Math.min(wall, -14), open);
    h = sd < 0 ? wall : over(h, wall, 3);
  }
  // The Eye: a spire of rock on a low skirt of boulders, standing in the calm centre.
  if (rho < 60) {
    h = over(h, needle(rho, EYE.r * (1 + 0.12 * noise(x * 0.15, y * 0.15, S + 4)), EYE.top), 2);
    h = over(h, shore(rho - EYE.r - 9, 3, 6, 6, 10), 2);
  }
  // Skerries and boulder heaps out to the border, clear of the spill and the gaps.
  if (rho > RING.r + 20) {
    h = scatter(x, y, 46, S + 10, 0.6, h, (s) => {
      const r = 3 + 8 * s.a, d = hyp(s.dx, s.dy) - r * (1 + 0.3 * noise(s.dx * 0.1, s.dy * 0.1, S + 5));
      return d > 34 ? -1e9 : d < 0 ? needle(d + r, r, 2 + (s.b > 0.7 ? 18 : 6) * s.c) : shore(d, 0, 1, 1.5, 6);
    }, (cx, cy) => hyp(cx, cy) < RING.r + 48 || polyDist(cx, cy, LANE) < 30);
  }
  // Shoals across the open water, so no straight course runs empty for long.
  return shoals(x, y, h, 140, S + 40);
}

export const maelstrom: RegionSpec = {
  height,
  landmark: { x: EYE.x, y: EYE.y, r: EYE.r, height: EYE.top, bearing: 0 },
  // A storm-light that hangs on the Eye's tip.
  beacon: { x: EYE.x, y: EYE.y, height: EYE.top + 6 },
  loot: snapWet(height, [
    40, 40, -60, 70, 90, -60, -100, -110, 0, -140, 130, 90,
    -230, 60, 240, -50, 80, 240, -120, -240, 170, -210,
  ], 4),
  lanes: [{ name: 'the Spill', pts: LANE, width: 24, speed: 3 }],
  obstacles: [],
  zones: [{ kind: 'spray', x: 0, y: 0, r: RING.r + 40 }],
  tidal: [],
  // Storm-flattened grass and sea kale only: nothing tree-sized.
  props: [],
};

// The Maelstrom, the south pole cap. A ring of dark, storm-beaten slate cliffs 30–45 m tall, 360 m across,
// broken by five gaps, around a wide whirlpool basin that drops to 60 m. At its calm centre stands the Eye, a
// crag of storm-fluted spires grown together, the tallest 100 m. Outside the ring, boulder shelves at the cliff feet and skerries out to the border.
// The whirlpool itself is a current (VORTEX_SPEC, read by index.ts), not terrain.
// Chart: the pole at the origin; the Glass Sea lies at bearing 334, and the south ring runs clockwise from it,
// one region every 51.4 degrees.
import { datan2, dcos, dsin } from '../../math.ts';
import { DEEP, fbm, hyp, mix, needle, noise, over, polyDist, ridged, scatter, shoals, shore, smoothstep, snapWet } from '../kit.ts';
import type { RegionSpec } from '../spec.ts';

const S = 0x3a1e;
const DEG = 3.141592653589793 / 180;
const RING = { r: 178, w: 24, top: 42 };
const EYE = { x: 0, y: 0, r: 14, top: 100 };
// The Eye's spires, grown together: a broad shoulder, the tallest spire on it with its top broken off flat for the
// storm-light to cling to, a second horn beside it across a notch, and two lower spires on the flanks. `cap` is the
// share of the taper at which a top breaks off.
const SPIRES = [
  { x: EYE.x - 5, y: EYE.y - 3, r: 18, top: 56, cap: 0.92 },
  { x: EYE.x, y: EYE.y, r: 11, top: EYE.top, cap: 0.85 },
  { x: EYE.x + 9, y: EYE.y + 5, r: 8, top: 82, cap: 0.9 },
  { x: EYE.x + 17, y: EYE.y - 11, r: 9, top: 58, cap: 0.95 },
  { x: EYE.x - 15, y: EYE.y + 12, r: 8, top: 40, cap: 0.95 },
];
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

/**
 * One of the Eye's spires at (x, y): out of round, fluted by the storms, steep at the foot and tapering to its top,
 * and stepped every 9 m where harder beds of rock stand out as ledges.
 */
function spire(x: number, y: number, s: (typeof SPIRES)[number], k: number): number {
  const dx = x - s.x, dy = y - s.y, d = hyp(dx, dy), a = datan2(dy, dx);
  const r = s.r * (1 + 0.2 * dcos(2 * a + 1.7 * k) + 0.14 * dcos(5 * a + 2 * k) + 0.12 * noise(x * 0.15, y * 0.15, S + 4 + k));
  if (d >= r) return -DEEP * smoothstep(0, 5 + 0.3 * r, d - r);
  const t = 1 - d / r, z = s.top * Math.min(1, (t * (1.6 - 0.6 * t)) / s.cap) * (1 - 0.04 * ridged(x * 0.2, y * 0.2, S + 7 + k));
  const q = z / 9, ledged = (Math.floor(q) + smoothstep(0.25, 0.75, q - Math.floor(q))) * 9;
  return z + 0.55 * (ledged - z);
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
  // The Eye: its spires on a low skirt of boulders, standing in the calm centre.
  if (rho < 60) {
    for (let k = 0; k < SPIRES.length; k++) h = over(h, spire(x, y, SPIRES[k], k), 3);
    h = over(h, shore(rho - EYE.r - 9, 3, 6, 6, 10), 2);
  }
  // Skerries and boulder heaps out to the border, clear of the spill and the gaps.
  if (rho > RING.r + 20) {
    h = scatter(x, y, 46, S + 10, 0.6, h, (s) => {
      const r = 3 + 8 * s.a, d = hyp(s.dx, s.dy) - r * (1 + 0.3 * noise(s.dx * 0.1, s.dy * 0.1, S + 5));
      return d > 34 ? -1e9 : d < 0 ? needle(d + r, r, 2 + (s.b > 0.7 ? 18 : 6) * s.c) : shore(d, 0, 1, 1.5, 6);
    }, (cx, cy) => hyp(cx, cy) < RING.r + 48 || polyDist(cx, cy, LANE) < 30);
  }
  // Shoals across the open water outside the ring, so no straight course runs empty for long. The basin stays a
  // clean bowl, and its current is something to meet anyway.
  return mix(h, shoals(x, y, h, 140, S + 40), smoothstep(RING.r + 10, RING.r + 40, rho));
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
  // The whirlpool wakes: the vortex spins up to more than twice its strength.
  event: { spots: [EYE.x, EYE.y], r: 120 },
};

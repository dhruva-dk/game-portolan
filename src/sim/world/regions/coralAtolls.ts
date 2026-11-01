// The Coral Atolls. Rings of reef awash at low water, with low palm islets (motu) strung along them, around
// lagoons of turquoise 4–6 m deep; ultramarine water outside drops away fast. The Great Reef is the largest
// ring, broken by four gaps: two deep, two floored by sills the tide opens and closes. Coral heads stud the
// open water between the atolls.
// Chart: x east, y north (toward the equator); the Maelstrom lies south.
import { dcos, dsin } from '../../math.ts';
import { R } from '../../sphere.ts';
import { fbm, fromEquator, hyp, noise, plant, polyDist, scatter, smax, smin, smoothstep, snapWet } from '../kit.ts';
import type { RegionSpec } from '../spec.ts';

const S = 0xc0a1;
const DEG = 3.141592653589793 / 180;

interface Atoll { x: number; y: number; r: number; w: number; lagoon: number; gaps: [number, number][] }

// Each gap is [bearing, floor]: -6 is a deep pass, -1.5 a tidal sill.
const GREAT: Atoll = { x: -20, y: -25, r: 100, w: 12, lagoon: -5.5, gaps: [[20, -6], [140, -1.5], [215, -6], [300, -1.5]] };
const ATOLLS: Atoll[] = [
  GREAT,
  { x: -165, y: 170, r: 40, w: 9, lagoon: -4.5, gaps: [[120, -6], [300, -1.5]] },
  { x: 60, y: 215, r: 34, w: 8, lagoon: -4, gaps: [[200, -6]] },
  { x: -175, y: -165, r: 42, w: 9, lagoon: -4.5, gaps: [[60, -6], [250, -1.5]] },
  { x: 110, y: -200, r: 30, w: 8, lagoon: -4, gaps: [[320, -6]] },
  { x: -220, y: 15, r: 26, w: 7, lagoon: -3.5, gaps: [[90, -6]] },
];
const LANE = [175, -260, 168, -80, 150, 90, 175, 210, 205, 330];

function reef(a: Atoll, x: number, y: number): number {
  const dx = x - a.x, dy = y - a.y, rho = hyp(dx, dy);
  if (rho > a.r + a.w + 40) return -1e9;
  const r = a.r * (1 + 0.06 * noise(dx * 0.02, dy * 0.02, S + a.x));
  const t = rho - r;
  // Inside: the lagoon floor rising to the reef flat; outside: a steep reef front.
  let h = t < 0
    ? a.lagoon + (0.35 - a.lagoon) * smoothstep(-a.w - 10, -a.w * 0.3, t)
    : 0.35 - 2 * smoothstep(a.w * 0.3, a.w, t) - 58 * smoothstep(a.w, a.w + 34, t);
  h += 0.25 * noise(x * 0.3, y * 0.3, S + 1) * smoothstep(-a.w - 4, 0, t) * (1 - smoothstep(0, a.w, t));
  // Motu: palm islets on the reef, wherever the rim's noise is high.
  const motu = smoothstep(0.15, 0.45, noise(dx * 0.025 + a.y, dy * 0.025, S + 2));
  if (motu > 0) h += (2.2 + 0.8 * noise(x * 0.1, y * 0.1, S + 3)) * motu * (1 - smoothstep(0, a.w * 0.8, Math.abs(t)));
  // The gaps.
  if (rho > 1e-6) {
    const ux = dx / rho, uy = dy / rho;
    for (const [b, floor] of a.gaps) {
      const sb = dsin(b * DEG), cb = dcos(b * DEG), along = rho * Math.abs(ux * cb - uy * sb);
      if (ux * sb + uy * cb <= 0) continue;
      const m = (1 - smoothstep(9, 14, along)) * (1 - smoothstep(a.w + 4, a.w + 14, Math.abs(t)));
      if (m > 0) h += (Math.min(h, floor) - h) * m;
    }
  }
  return h;
}

function height(x: number, y: number): number {
  // Ultramarine deep water outside the reefs.
  let h = -30 + 6 * fbm(x * 0.008, y * 0.008, S + 4, 3);
  h = smin(h, -60 + 1.3 * fromEquator(x, y, R, true), 4);
  for (const a of ATOLLS) {
    const r = reef(a, x, y);
    if (r > -1e8) h = hyp(x - a.x, y - a.y) < a.r ? r : smax(h, r, 2);
  }
  // Coral heads: knolls rising from the deep almost to the surface.
  h = scatter(x, y, 40, S + 10, 0.42, h, (s) => {
    const r = 3 + 5 * s.a, d = hyp(s.dx, s.dy) - r * (1 + 0.3 * noise(s.dx * 0.2, s.dy * 0.2, S + 5));
    return d > 24 ? -1e9 : d < 0 ? -0.9 + 1.1 * s.b * smoothstep(0, 2, -d) : -0.9 - 59.1 * smoothstep(0, 24, d);
  }, (cx, cy) => {
    for (const a of ATOLLS) if (hyp(cx - a.x, cy - a.y) < a.r + a.w + 26) return true;
    return polyDist(cx, cy, LANE) < 30 || fromEquator(cx, cy, R, true) < 46;
  });
  return h;
}

// The tidal gaps: on the rim at each sill's bearing.
const TIDAL: number[] = [];
for (const a of ATOLLS) for (const [b, floor] of a.gaps) if (floor > -2.5) TIDAL.push(a.x + a.r * dsin(b * DEG), a.y + a.r * dcos(b * DEG));

export const coralAtolls: RegionSpec = {
  height,
  // The Great Reef is low; a glow of bioluminescence rising from its lagoon is what neighbours see.
  landmark: { x: GREAT.x, y: GREAT.y, r: GREAT.r, height: 62, bearing: 0 },
  beacon: { x: GREAT.x, y: GREAT.y, height: 62 },
  loot: snapWet(height, [GREAT.x, GREAT.y, GREAT.x + 50, GREAT.y + 40, -165, 170, -175, -165, 60, 215, 110, -200, 190, 40, -100, 140, 40, -150], 3),
  lanes: [
    // Up the eastern side from the Maelstrom's edge and across the Great Current to the Spires.
    { name: 'the Reef current', pts: LANE, width: 24, speed: 3 },
  ],
  obstacles: [],
  zones: ATOLLS.map((a) => ({ kind: 'lagoon' as const, x: a.x, y: a.y, r: a.r - a.w })),
  tidal: TIDAL,
  props: plant(height, 'palm', [-260, -260, 260, 300], 7, S + 20, 0.65, 0.8, 4, 0.3, 11),
};

// The Ice Crown, the north pole cap. A crown of blue-white ice spires stands on a shelf at the pole. Around it
// the floes ride three rings (they move, so they live in FLOE_RINGS, not the heightfield), with static pressure
// ridges between the rings and bergs adrift everywhere; snow-fir rocks stand at the outer edge.
// Chart: the pole at the origin; the Fjords lie toward -y, the Narrows toward +y.
import { arcPts, fbm, hash01, hyp, needle, noise, over, plant, scatter, shore, smoothstep, snapWet, strokeDist } from '../kit.ts';
import type { RegionSpec } from '../spec.ts';
import { dcos, dsin } from '../../math.ts';

const S = 0x1ce0;
const DEG = 3.141592653589793 / 180;

// The crown: a central spire and a ring of seven lesser ones on a shelf of ice.
const CROWN: number[][] = [[0, 0, 11, 96]];
for (let k = 0; k < 7; k++) {
  const a = (k * 360 / 7 + 10) * DEG, r = 23 + 4 * hash01(k, 1, S);
  CROWN.push([r * dsin(a), r * dcos(a), 5 + 2.5 * hash01(k, 2, S), 38 + 26 * hash01(k, 3, S)]);
}

// Pressure ridges: broken arcs of piled ice between the floe rings, with lanes left open between them.
const RIDGES: number[][] = [];
for (const [r, n, len, off] of [[108, 5, 34, 20], [168, 7, 26, 0], [238, 9, 18, 12]]) {
  for (let k = 0; k < n; k++) {
    const b = off + (k * 360) / n, pts = arcPts(0, 0, r + 6 * (hash01(k, r, S) - 0.5), b, b + len, 4), out: number[] = [];
    for (let i = 0; i < pts.length; i += 2) out.push(pts[i], pts[i + 1], 3 + 4 * (1 - Math.abs(i / (pts.length - 2) - 0.5) * 2));
    RIDGES.push(out);
  }
}

function height(x: number, y: number): number {
  const rho = hyp(x, y);
  // Steel-grey sea floor, shoaling toward the crown's shelf.
  let h = -26 + 5 * fbm(x * 0.008, y * 0.008, S, 3) + 10 * (1 - smoothstep(40, 110, rho));
  // The shelf under the crown: blue ice, a few metres proud of the water.
  if (rho < 90) h = over(h, shore(rho - 44 - 4 * noise(x * 0.05, y * 0.05, S + 1), 6, 12, 10, 18), 3);
  if (rho < 60) {
    for (const [cx, cy, r, top] of CROWN) h = over(h, needle(hyp(x - cx, y - cy), r, top), 2);
  }
  // Pressure ridges: low, jagged walls of ice.
  for (const pts of RIDGES) {
    const d = strokeDist(x, y, pts);
    if (d < 36) h = over(h, shore(d + 1.2 * noise(x * 0.2, y * 0.2, S + 2), 4 + 2 * noise(x * 0.1, y * 0.1, S + 3), 4, 10, 14), 2);
  }
  // Bergs adrift between the rings: blocky, cliffed, a few metres to a dozen tall.
  if (rho > 70) {
    h = scatter(x, y, 62, S + 10, 0.42, h, (s) => {
      const r = 5 + 7 * s.a, d = hyp(s.dx, s.dy) - r * (1 + 0.25 * noise(s.dx * 0.15, s.dy * 0.15, S + 4));
      return d > 30 ? -1e9 : shore(d, 4 + 10 * s.b, 2.5, 12, 10);
    }, (cx, cy) => {
      const r = hyp(cx, cy);
      return r < 80 || (r > 70 && r < 85) || (r > 125 && r < 150) || (r > 185 && r < 215);
    });
  }
  // The outer edge: dark rock isles under snow firs, where the cap meets the ring.
  if (rho > 220) {
    h = scatter(x, y, 58, S + 20, 0.55, h, (s) => {
      const r = 9 + 12 * s.a, d = hyp(s.dx, s.dy) - r * (1 + 0.3 * noise(s.dx * 0.08, s.dy * 0.08, S + 5));
      return d > 36 ? -1e9 : shore(d, 7 + 12 * s.b, 10, 14, 16);
    }, (cx, cy) => hyp(cx, cy) < 250);
  }
  return h;
}

/** The floe rings: radius, angular speed (rad/s; alternate rings turn opposite ways), and each floe's place. */
export const FLOE_RINGS: readonly { r: number; speed: number; floes: { angle: number; dr: number; size: number }[] }[] = [
  [76, 0.012, 11], [137, -0.0075, 17], [200, 0.005, 23],
].map(([r, speed, n], k) => {
  const floes: { angle: number; dr: number; size: number }[] = [];
  for (let i = 0; i < n; i++) {
    // Clumped: every fourth slot is left empty, which is the lane through that ring.
    if (i % 4 === 3) continue;
    floes.push({ angle: ((i + 0.3 * hash01(i, k, S + 30)) / n) * 2 * 3.141592653589793, dr: 8 * (hash01(i, k, S + 31) - 0.5),
      size: 7 + 5 * hash01(i, k, S + 32) });
  }
  return { r, speed, floes };
});

// Polar coordinates in the chart to x, y.
const at = (r: number, b: number): [number, number] => [r * dsin(b * DEG), r * dcos(b * DEG)];

export const iceCrown: RegionSpec = {
  height,
  landmark: { x: 0, y: 0, r: 40, height: 96, bearing: 0 },
  beacon: { x: 0, y: 0, height: 34 },
  loot: snapWet(height, [...at(100, 75), ...at(102, 250), ...at(160, 15), ...at(165, 140), ...at(170, 300), ...at(232, 95), ...at(228, 205), ...at(240, 330)], 4),
  lanes: [
    // Meltwater pours off the shelf and out between the rings, into the head of the Narrows.
    { name: 'the Crown outflow', pts: [0, 70, 6, 150, -4, 230, 0, 330], width: 24, speed: 3 },
  ],
  obstacles: [],
  zones: [{ kind: 'slush', x: 0, y: 0, r: 300 }],
  tidal: [],
  // Snow firs on the rock isles at the rim.
  props: plant(height, 'fir', [-320, -320, 320, 320], 9, S + 40, 0.7, 2.5, 30, 1.2, 12).filter((p) => hyp(p.x, p.y) > 215),
};

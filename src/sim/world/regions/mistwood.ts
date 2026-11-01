// Mistwood. Low, flat islands of moss and roots, a few metres proud of a still black-green water, cut apart by
// a net of channels along the edges of Voronoi cells. Giant cedars rise from every island far above the fog;
// a straight reach through the middle holds the Hollow Cedar, a fallen giant lying in the water that you can
// sail through, its broken stump standing beside it with foxfire at its top.
// Chart: x east, y north; the Ice Crown lies north, the Great Current along the south edge.
import { R } from '../../sphere.ts';
import { cells, fbm, fromEquator, hyp, noise, scatterPoints, segDist, shore, smax, smoothstep, snapWet } from '../kit.ts';
import type { PropSpec, RegionSpec } from '../spec.ts';

const S = 0x3157;
const CELL = 82;

// The Hollow Cedar's reach: a straight channel, and the log lying along it.
const REACH_A = [-140, 52], REACH_B = [140, -2];
const LOG = { x: 0, y: 25, bearing: 100.9, length: 96, r: 9, inner: 6.5 };
const SNAG = { x: -72, y: 70 };

function islandDist(x: number, y: number): number {
  const wx = x + 7 * noise(x * 0.03, y * 0.03, S), wy = y + 7 * noise(x * 0.03 + 4.4, y * 0.03, S + 1);
  const c = cells(wx, wy, CELL, S + 2, 0.85), edge = (c.f2 - c.f1) / 2;
  // Channels wander between 9 and 20 m half-width.
  const half = 14 + 6 * noise(x * 0.012, y * 0.012, S + 3);
  // About one cell in six is open water: a still pool among the islands.
  const open = (c.id & 1023) < 170;
  let sd = open ? half + edge : half - edge;
  // The Hollow Cedar's straight reach.
  sd = smax(sd, 18 - segDist(x, y, REACH_A[0], REACH_A[1], REACH_B[0], REACH_B[1]), 6);
  // Islands give way to open water near the Great Current.
  sd += Math.max(0, 70 - fromEquator(x, y, R, false)) * 0.8;
  return sd;
}

function height(x: number, y: number): number {
  const sd = islandDist(x, y);
  // Flat islands, 2–4 m, edged with a tangle of roots; deep, still channels between.
  const top = 3 + 1.2 * fbm(x * 0.02, y * 0.02, S + 4, 2);
  const floor = -9 + 3 * fbm(x * 0.01, y * 0.01, S + 5, 2);
  const roots = sd > -3 && sd < 4 ? 0.8 * (1 - Math.abs(noise(x * 0.4, y * 0.4, S + 6))) * (1 - smoothstep(-3, 4, sd)) : 0;
  return smax(shore(sd, top, 6, 4, 8), floor, 3) + roots;
}

// The cedars: one or two giants on every island, at the cell's heart where the ground is widest.
const CEDARS: PropSpec[] = [];
for (const s of scatterPoints(-300, -340, 300, 320, CELL / 2, S + 7, 0.9)) {
  if (islandDist(s.x, s.y) > -14 || hyp(s.x - LOG.x, s.y - LOG.y) < 30) continue;
  CEDARS.push({ kind: 'cedar', x: s.x, y: s.y, r: 3.5 + 2 * s.a, height: 3 + 55 + 30 * s.b });
}

export const mistwood: RegionSpec = {
  height,
  // The landmark is seen by its stump's light, 62 m up.
  landmark: { x: LOG.x, y: LOG.y, r: 50, height: 62, bearing: LOG.bearing },
  beacon: { x: SNAG.x, y: SNAG.y, height: 62 },
  loot: snapWet(height, [-150, -110, 120, 160, -60, 190, 160, -90, -10, -170, 90, 90, -180, 60, 40, -40], 4),
  lanes: [
    // A slow drain out of the south-east channels and across the Great Current into the Coral Atolls.
    { name: 'the Cedar drain', pts: [110, -140, 160, -220, 200, -280, 236, -340], width: 22, speed: 2.6 },
  ],
  obstacles: [
    { kind: 'log', x: LOG.x, y: LOG.y, bearing: LOG.bearing, r: LOG.r, inner: LOG.inner, length: LOG.length, height: 14 },
  ],
  zones: [{ kind: 'mist', x: 0, y: 0, r: 330 }],
  tidal: [],
  props: [
    ...CEDARS,
    { kind: 'snag', x: SNAG.x, y: SNAG.y, r: 9, height: 62 },
  ],
};

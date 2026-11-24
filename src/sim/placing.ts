import {
  R,
  along,
  distance,
  dot,
  tangentAt,
  type Vec3,
} from '../world/sphere.ts';
import { knownNear, shunned } from './logbook.ts';
import { fieldAt, openAt } from './route.ts';
import { toEdge, type Cap } from './storm.ts';
import { open, rotate, unitHash, type Ctx } from './captain.ts';

export const PLACING = {
  looks: 12,
  each: 2,
  keep: 1.2,
  round: 50,
  loot: 90,
  plenty: 4,
  deep: 1,
  near: 0.6,
  cover: 0,
  strait: 0,
  open: 0.2,
  plunder: 0,
  foes: 0,
  crowd: 2,
  shun: 1,
  early: 30,
} as const;

export interface PlaceMemory {
  place: Vec3 | null;
  placeFor: number;
  placeWorth: number;
  placeLook: number;
}

export const placeMemory = (): PlaceMemory => ({
  place: null,
  placeFor: -1,
  placeWorth: 0,
  placeLook: 0,
});

function candidate(c: Ctx, cap: Cap, k: number): Vec3 | null {
  const key = (c.seed ^ Math.floor(cap.radius * 1e7)) >>> 0,
    a = 2 * Math.PI * unitHash(key, 2 * k + 1),
    r = Math.sqrt(unitHash(key, 2 * k + 2)) * (cap.radius * R - c.t.margin);
  if (r <= 0) return cap.center;
  const q = along(cap.center, tangentAt(cap.center, a), r).p;
  return water(c, q) ? q : null;
}

const water = (c: Ctx, q: Vec3) =>
  c.sea.chart ? openAt(c.sea.chart, q) : open(c, q);

function worth(c: Ctx, cap: Cap, q: Vec3): number {
  const pl = c.b.placing,
    reach = cap.radius * R,
    k = c.sea.calm,
    ch = c.sea.chart;
  const ofCap = k && ch && k.cap.radius === cap.radius;
  const deep = ofCap
    ? Math.max(0, 1 - fieldAt(ch, k.field, q) / Math.max(1, reach - k.heart))
    : Math.max(0, toEdge(q, cap) / reach);
  const near = 1 - Math.min(1, distance(c.own.ship.at, q) / (2 * reach));
  const ways: boolean[] = [];
  const t = tangentAt(q, 0);
  for (let i = 0; i < 8; i++)
    ways.push(water(c, along(q, rotate(q, t, (i * Math.PI) / 4), pl.round).p));
  const land = ways.filter((w) => !w).length;
  const cover = land > 0 && land <= 5 ? Math.min(1, land / 2.5) : 0;
  let strait = 0;
  for (let i = 0; i < 4; i++)
    if (!ways[i] && !ways[i + 4] && ways[(i + 2) % 8] && ways[(i + 6) % 8])
      strait = 1;
  let pieces = 0;
  if (pl.plunder > 0 && c.sea.loot) {
    const within = Math.cos(pl.loot / R);
    for (const l of c.sea.loot) if (dot(q, l.at) > within) pieces++;
  }
  return (
    pl.deep * deep +
    pl.near * near +
    pl.cover * cover +
    pl.strait * strait +
    pl.open * (1 - land / 8) +
    pl.plunder * Math.min(1, pieces / pl.plenty) +
    pl.foes * Math.min(1, knownNear(c, q, 4 * pl.round) / pl.crowd) -
    (shunned(c, q) ? pl.shun : 0)
  );
}

export function survey(c: Ctx): void {
  const s = c.sea.storm,
    { m } = c,
    pl = c.b.placing;
  if (!s) return;
  const cap = s.next;
  if (m.placeFor !== cap.radius)
    [m.place, m.placeFor, m.placeWorth, m.placeLook] = [null, cap.radius, 0, 0];
  for (let i = 0; i < pl.each; i++) {
    if (m.placeLook === 0 && m.place) m.placeWorth = worth(c, cap, m.place);
    const q = candidate(c, cap, m.placeLook);
    m.placeLook = (m.placeLook + 1) % pl.looks;
    if (!q) continue;
    const w = worth(c, cap, q);
    if (!m.place || w > m.placeWorth * pl.keep)
      [m.place, m.placeWorth] = [q, w];
  }
}

export function placeNow(c: Ctx): Vec3 | null {
  const s = c.sea.storm,
    { m } = c;
  if (!s || !m.place || m.placeFor !== s.next.radius) return null;
  return s.closing || s.secondsToNext <= c.b.placing.early ? m.place : null;
}

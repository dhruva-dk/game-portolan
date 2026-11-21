// A bot's place for a phase of the storm (PLAN layer 2): as each cap is set,
// she looks over a handful of places inside it, a few at a think, and keeps the
// best, a new one only if it is clearly better (each is looked at again in
// turn, as the loot and the ships about her change). A place is weighed, by her
// persona's weights, by:
// - deep: how far in by water (the chart's way into the cap's heart: Sea calm),
//   so a bay far round by sea is no place to be when the next cap is set;
// - near: how near her;
// - cover: land round it on some sides, with water open on most (a way out);
// - strait: land on two sides facing, water open across them: a narrows ships
//   must pass;
// - open: water open all round;
// - loot: pieces lying near it.
// She makes for it, when nothing better calls, from her persona's time before
// the cap is due on (roaming.ts): a turtle sits in her cove early, a scavenger
// comes late.
//
// Pure arithmetic: no three, so it runs in node for the tests; deterministic
// for the same inputs, to the bit.

import {
  R,
  along,
  distance,
  dot,
  tangentAt,
  type Vec3,
} from '../world/sphere.ts';
import { fieldAt, openAt } from './route.ts';
import { toEdge, type Cap } from './storm.ts';
import { open, rotate, unitHash, type Ctx } from './captain.ts';

/** Everything her place is tuned by. Metres and seconds. */
export const PLACING = {
  /** Places looked at a cap, a round; at a think. */
  looks: 12,
  each: 2,
  /** A new place must be worth this many times the one she keeps. */
  keep: 1.2,
  /**
   * The land round a place looked for `round` m off it, eight ways; loot
   * counted within `loot` m, `plenty` pieces all it wants.
   */
  round: 50,
  loot: 90,
  plenty: 4,
  /** Her weights (her persona's: persona.ts). */
  deep: 1,
  near: 0.6,
  cover: 0,
  strait: 0,
  open: 0.2,
  plunder: 0,
  /**
   * She makes for her place this many seconds before the cap is due to begin
   * closing, and while it closes.
   */
  early: 30,
} as const;

/**
 * What her place keeps: where (null: none yet), the cap it is for (its
 * radius), what it was worth when last weighed, and the next place to look at.
 */
export interface PlaceMemory {
  place: Vec3 | null;
  placeFor: number;
  placeWorth: number;
  placeLook: number;
}

/** A place's memory as she puts to sea. */
export const placeMemory = (): PlaceMemory => ({
  place: null,
  placeFor: -1,
  placeWorth: 0,
  placeLook: 0,
});

/** The k-th place she looks at in a cap: open water her margin inside it. */
function candidate(c: Ctx, cap: Cap, k: number): Vec3 | null {
  const key = (c.seed ^ Math.floor(cap.radius * 1e7)) >>> 0,
    a = 2 * Math.PI * unitHash(key, 2 * k + 1),
    r = Math.sqrt(unitHash(key, 2 * k + 2)) * (cap.radius * R - c.t.margin);
  if (r <= 0) return cap.centre;
  const q = along(cap.centre, tangentAt(cap.centre, a), r).p;
  return water(c, q) ? q : null;
}

/** Whether q is open water, by her chart if she has one. */
const water = (c: Ctx, q: Vec3) =>
  c.sea.chart ? openAt(c.sea.chart, q) : open(c, q);

/** What a place is worth to her, by her weights. */
function worth(c: Ctx, cap: Cap, q: Vec3): number {
  const pl = c.b.placing,
    reach = cap.radius * R,
    k = c.sea.calm,
    ch = c.sea.chart;
  // how far in by water, else as the crow flies
  const ofCap = k && ch && k.cap.radius === cap.radius;
  const deep = ofCap
    ? Math.max(0, 1 - fieldAt(ch, k.field, q) / Math.max(1, reach - k.heart))
    : Math.max(0, toEdge(q, cap) / reach);
  const near = 1 - Math.min(1, distance(c.own.ship.at, q) / (2 * reach));
  // the land round it, eight ways
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
    pl.plunder * Math.min(1, pieces / pl.plenty)
  );
}

/**
 * Her look at places in the cap the storm closes to next, a few a think: a new
 * cap, she starts afresh; each round she weighs the one she keeps again first.
 */
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

/**
 * Her place, if it is time she was there (her `early` s before the next cap
 * begins to close, and while it does); else null.
 */
export function placeNow(c: Ctx): Vec3 | null {
  const s = c.sea.storm,
    { m } = c;
  if (!s || !m.place || m.placeFor !== s.next.radius) return null;
  return s.closing || s.secondsToNext <= c.b.placing.early ? m.place : null;
}

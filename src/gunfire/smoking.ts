// Which ships smoke, and how much: the plan puffs.ts worn lays each frame. A
// worn ship (ShipDraw.wear) trails smoke off her waist; one holed at her
// waterline throws spray off her side; one whose deck is afire smokes from her
// gun ports (ShipDraw.faults). Only the nearest SMOKING.most afloat within
// sight smoke, fewer puffs the farther; one close by the eye (her own, under
// the chase camera) thinner and lower, so her smoke does not wall off the view;
// and all of it together lays no more than keeps SMOKING.alive puffs alive.
//
// Pure: no three; the same inputs, the same plan.

import { SOOT, WISP } from '../palette.ts';
import type { ShipDraw } from '../snapshot.ts';
import * as sphere from '../world/sphere.ts';
import { clamp } from '../world/scalar.ts';

type Vec3 = sphere.Vec3;

/**
 * A worn ship's smoke, wear 1's and 2's: puffs a second near her, their size
 * (m), growth (m/s), rise (m/s), drag (per s), lift (m/s² up), life (s; the
 * most a puff lives is LIFE_SPREAD of it), opacity and ink; thin grey wisps
 * past her tops, then a sooty column a little over her masts, thin enough to
 * see through in part.
 */
export const WORN = [
  null,
  {
    rate: 5,
    size: 0.4,
    grow: 0.6,
    rise: 4.5,
    drag: 0.45,
    lift: 0.4,
    life: 4,
    opacity: 0.4,
    ink: WISP,
  },
  {
    rate: 8,
    size: 0.7,
    grow: 0.8,
    rise: 5.5,
    drag: 0.4,
    lift: 0.5,
    life: 5,
    opacity: 0.55,
    ink: SOOT,
  },
] as const;
export const LIFE_SPREAD = 1.1;
/**
 * A ship holed at her waterline (her faults, kinds.ts ZONES): spray thrown off
 * her side, puffs a second near by fault (none, minor, major), from half her
 * beam out and along her length's middle (metres, ship/lines.ts at her SCALE),
 * and its most life (s).
 */
export const HOLED = {
  rate: [0, 7, 16],
  beam: 2.7,
  length: 5,
  life: 1.4,
} as const;
/**
 * Her deck afire: smoke from her gun ports, puffs a second near by fault, from
 * how high over her waterline, along how much of her, how dense, and its most
 * life (s).
 */
export const PORTS = {
  rate: [0, 5, 12],
  over: 1.3,
  length: 6,
  opacity: 0.75,
  life: 3.2,
} as const;
/**
 * The smoking ships: the most at once (the nearest), how near the eye she
 * smokes in full (metres; farther, fewer puffs and bigger), and past how far
 * none; where on her it rises (metres over her waterline and aft of her
 * middle: her waist); within what of the eye she is close (metres: at the
 * first, her smoke at its thinnest and lowest, CLOSE; in full from the second);
 * and the most puffs all of it keeps alive at once (of the ring's 4096, which
 * the guns' smoke shares).
 */
export const SMOKING = {
  most: 8,
  near: 50,
  far: 360,
  over: 2.5,
  aft: 1.5,
  close: [14, 45],
  alive: 900,
} as const;
/**
 * A ship close by the eye, at her closest: her puffs a second, and her smoke's
 * rise, lift and size, as shares of what they would be.
 */
export const CLOSE = { rate: 0.4, rise: 0.5, size: 0.7 } as const;

/** The longest any of it lives, s. */
const LONGEST = Math.max(
  (WORN[2]?.life ?? 0) * LIFE_SPREAD,
  (WORN[1]?.life ?? 0) * LIFE_SPREAD,
  HOLED.life,
  PORTS.life
);
/** The most puffs a second all of it lays: as many as keep SMOKING.alive alive. */
export const MOST_RATE = SMOKING.alive / LONGEST;

/**
 * A smoking ship this frame: her, how far from the eye (m), her puffs a second
 * of smoke (wear), spray (holed) and ports' smoke (afire), and how close she is
 * (0 at SMOKING.close's first, 1 from its second on).
 */
export interface Smoker {
  ship: ShipDraw;
  away: number;
  wear: number;
  spray: number;
  ports: number;
  close: number;
}

/**
 * Whether a ship at `p` (metres) shows from `eye` over the horizon: the line to
 * a point SMOKING.over and some more above her stays over the sea.
 */
function overHorizon(eye: Vec3, p: Vec3) {
  const k = (sphere.R + SMOKING.over + 6) / Math.max(1e-6, sphere.length(p));
  const dx = p[0] * k - eye[0],
    dy = p[1] * k - eye[1],
    dz = p[2] * k - eye[2];
  const t =
    -(eye[0] * dx + eye[1] * dy + eye[2] * dz) / (dx * dx + dy * dy + dz * dz);
  if (t <= 0 || t >= 1) return true;
  const x = eye[0] + dx * t,
    y = eye[1] + dy * t,
    z = eye[2] + dz * t;
  return x * x + y * y + z * z >= sphere.R * sphere.R;
}

/** A ship's share of the full rate at `close` (Smoker.close). */
const closeShare = (close: number) => CLOSE.rate + (1 - CLOSE.rate) * close;

/**
 * The smoking among `ships` as seen from `eye` (metres), into `out` (its
 * entries reused, filled from the first): of those afloat, worn, holed or
 * afire, within SMOKING.far and over the horizon, the nearest SMOKING.most,
 * nearest first; each her rates thinned by distance and, close by the eye, by
 * CLOSE; all of them scaled down together where their sum is over MOST_RATE.
 * How many.
 */
export function smokers(
  ships: readonly ShipDraw[],
  eye: Vec3,
  out: Smoker[]
): number {
  let n = 0;
  for (const s of ships) {
    if (!s.afloat || !(s.wear || s.faults[2] || s.faults[3])) continue;
    const p = s.pose.position,
      d = Math.hypot(p[0] - eye[0], p[1] - eye[1], p[2] - eye[2]);
    if (d > SMOKING.far || !overHorizon(eye, p)) continue;
    // kept the nearest SMOKING.most, in order: an insertion, being few; full,
    // the farthest gives up her entry
    const full = n === SMOKING.most;
    let i = full ? n - 1 : n;
    if (full && d >= (out[i]?.away ?? 0)) continue;
    const spare =
      out[i] ??
      (out[i] = { ship: s, away: 0, wear: 0, spray: 0, ports: 0, close: 1 });
    for (; i > 0 && (out[i - 1]?.away ?? 0) > d; i--)
      out[i] = out[i - 1] ?? spare;
    out[i] = spare;
    spare.ship = s;
    spare.away = d;
    if (!full) n++;
  }
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const m = out[i];
    if (!m) continue;
    const s = m.ship,
      far = Math.max(1, m.away / SMOKING.near),
      close = clamp(
        (m.away - SMOKING.close[0]) / (SMOKING.close[1] - SMOKING.close[0])
      ),
      share = closeShare(close) / far;
    m.close = close;
    m.wear = (WORN[s.wear]?.rate ?? 0) * share;
    m.spray = (HOLED.rate[s.faults[2]] ?? 0) / far;
    m.ports = (PORTS.rate[s.faults[3]] ?? 0) * share;
    sum += m.wear + m.spray + m.ports;
  }
  if (sum > MOST_RATE) {
    const k = MOST_RATE / sum;
    for (let i = 0; i < n; i++) {
      const m = out[i];
      if (!m) continue;
      m.wear *= k;
      m.spray *= k;
      m.ports *= k;
    }
  }
  return n;
}

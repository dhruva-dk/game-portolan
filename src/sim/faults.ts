// A ship's faults (DEPTH.md A): where her blows land on her, and what they
// cost her once her hull is low.
//
// Every blow that reaches her hull (past her shield: while it holds, no zone is
// harmed) is put down to one of her four zones (kinds.ts ZONES) by where it
// struck her. A ram, on her waterline. The sim has no height for a blow above
// her freeboard (shot.ts strikes a hull only up to it), so the gun's kind leans
// it: a scatter's grape, flying high, in her rigging; a mortar's shell,
// plunging, on her deck (its burst too). Any other ball: in her after third, on
// her rudder; raking along her (within FAULTS.rake of her line), on her deck;
// else low in her side, on her waterline. Her tallies are the hull each zone
// has taken since she was last mended above FAULTS.minor, or put to sea.
//
// Her faults are her hull and her tallies, not a state of their own (faultsOf):
// above FAULTS.minor none; at or under it her most-hit zone minor; under
// FAULTS.major that zone major and the next most-hit minor (ties to the first
// in ZONES). Each costs her handling (fitOf: FAULTS.cost); a major fault on her
// waterline leaks besides, FAULTS.leak hull a second past her shield, never
// below FAULTS.floor.
//
// Her water mends her (tended): MEND.quiet seconds without taking or dealing a
// blow, in her own water (territory.ts), her hull comes back MEND.rate a second
// up to MEND.cap, never past it, so out of a major fault but not a minor; her
// leak stops while she mends. Her stores mend past it (hold.ts).
//
// Pure arithmetic: no three, so it runs in node for the tests; deterministic
// for the same inputs, to the bit.

import { ZONES, type Fault, type GunKind, type Zone } from '../kinds.ts';
import { R, add, dot, length, type Vec3 } from '../world/sphere.ts';
import type { Crew } from './battle.ts';
import { SHIP, SPEC, type Handling } from './handling.ts';
import { harmed, healed, sunk } from './health.ts';
import type { ShipState } from './ship.ts';

/** What her faults are tuned by. Hull in hit points (HEALTH), seconds. */
export const FAULTS = {
  /** At or under `minor` hull, her most-hit zone is faulted; under `major`, majorly. */
  minor: 40,
  major: 25,
  /**
   * What each zone's fault costs her, none, minor and major: a share of her
   * top speed, her fastest turn, or (times) her gun's reload. Her waterline's
   * major fault costs her its minor's speed and leaks besides.
   */
  cost: {
    rigging: { of: 'top', by: [1, 0.85, 0.7] },
    rudder: { of: 'turn', by: [1, 0.8, 0.6] },
    waterline: { of: 'top', by: [1, 0.92, 0.92] },
    deck: { of: 'reload', by: [1, 1.2, 1.5] },
  } satisfies Record<
    Zone,
    { of: keyof Handling; by: readonly [1, number, number] }
  >,
  /** Her leak, hull a second, and the hull it never takes her below. */
  leak: 0.5,
  floor: 15,
  /** A ball within this many radians of her line rakes her. */
  rake: (25 * Math.PI) / 180,
  /** The share of her length abaft that is her after third. */
  after: 1 / 3,
} as const;

/** Her water's mending: after `quiet` s, `rate` hull a second, up to `cap`. */
export const MEND = { quiet: 5, rate: 2, cap: 25 } as const;

/** The zones, by their place in ZONES. */
const RIGGING = ZONES.indexOf('rigging'),
  RUDDER = ZONES.indexOf('rudder'),
  WATERLINE = ZONES.indexOf('waterline'),
  DECK = ZONES.indexOf('deck');

/** One number for each zone, in ZONES' order. */
type Zones<T> = readonly [T, T, T, T];

/**
 * What her blows have done to her (battle.ts Crew): the hull each zone has
 * taken since she was last mended above FAULTS.minor (or put to sea), seconds
 * since she last took or dealt a blow, and whether her water mends her now.
 */
export interface Wear {
  zones: Zones<number>;
  quiet: number;
  mending: boolean;
}

/** A ship as she puts to sea: no blow on her. */
export const UNWORN: Wear = { zones: [0, 0, 0, 0], quiet: 0, mending: false };

/**
 * The zone (its place in ZONES) a blow on `ship` lands on: struck at `at` (a
 * unit vector) by a ball of `gun` coming along `way` (its velocity), or a ram
 * (gun null).
 */
export function zoneOf(
  ship: ShipState,
  at: Vec3,
  way: Vec3,
  gun: GunKind | null
): number {
  if (gun === null) return WATERLINE;
  if (gun === 'mortar') return DECK;
  if (gun === 'scatter') return RIGGING;
  // (her heading is square to where she is: along it, `at` is that far ahead)
  if (R * dot(at, ship.heading) < -SHIP.length * (0.5 - FAULTS.after))
    return RUDDER;
  const level = add(way, at, -dot(way, at)),
    l = length(level);
  return l > 0 && Math.abs(dot(level, ship.heading)) > l * Math.cos(FAULTS.rake)
    ? DECK
    : WATERLINE;
}

/** Her wear after a blow taken that took `hull` off her hull, on `zone`. */
export function struck(w: Wear, zone: number, hull: number): Wear {
  if (!(hull > 0)) return { ...w, quiet: 0 };
  const z = w.zones,
    on = (t: number, i: number) => (i === zone ? t + hull : t);
  return {
    ...w,
    zones: [on(z[0], 0), on(z[1], 1), on(z[2], 2), on(z[3], 3)],
    quiet: 0,
  };
}

/** Her wear after a blow she dealt. */
export const dealt = (w: Wear): Wear =>
  w.quiet === 0 ? w : { ...w, quiet: 0 };

/**
 * Her wear after her hull went from `from` to `to` by her stores: mended above
 * FAULTS.minor, her tallies cleared.
 */
export const rose = (w: Wear, from: number, to: number): Wear =>
  to > from && to > FAULTS.minor ? { ...w, zones: UNWORN.zones } : w;

/** Her hull's band: 0 above FAULTS.minor, 1 down to FAULTS.major, 2 under it. */
const wearOf = (hull: number): Fault =>
  hull > FAULTS.minor ? 0 : hull >= FAULTS.major ? 1 : 2;

const NONE: Zones<Fault> = [0, 0, 0, 0];

/** Her faults (ZONES' order), by her hull and her tallies. */
export function faultsOf(hull: number, w: Wear): Zones<Fault> {
  const band = wearOf(hull);
  if (band === 0) return NONE;
  // the most-hit zone and the next (ties to the first in ZONES)
  let first = -1,
    second = -1,
    most = 0,
    next = 0;
  w.zones.forEach((t, i) => {
    if (t > most) [first, second, most, next] = [i, first, t, most];
    else if (t > next) [second, next] = [i, t];
  });
  if (first < 0) return NONE;
  const of = (i: number): Fault =>
    i === first ? band : band === 2 && i === second ? 1 : 0;
  return [of(0), of(1), of(2), of(3)];
}

/** Her handling as she is now: the tables' with each fault's cost. */
export function fitOf(c: Crew | undefined): Handling {
  if (!c) return SPEC;
  const f = faultsOf(c.health.hull, c.wear);
  if (f === NONE) return SPEC;
  const fit = { ...SPEC };
  f.forEach((fault, i) => {
    const z = ZONES[i];
    if (!z) return;
    const k = FAULTS.cost[z];
    fit[k.of] *= k.by[fault];
  });
  return fit;
}

/**
 * Every crew afloat dt seconds on: her quiet kept; mending, MEND.quiet s quiet
 * and under MEND.cap in her own water (`home`, by id); else her leak, if her
 * waterline is majorly faulted.
 */
export function tended(
  crews: readonly Crew[],
  home: (id: number) => boolean,
  dt: number
): Crew[] {
  return crews.map((c) => {
    if (sunk(c.health)) return c;
    const quiet = c.wear.quiet + dt,
      mending =
        quiet >= MEND.quiet - 1e-9 && c.health.hull < MEND.cap && home(c.id);
    let health = c.health;
    if (mending) health = healed(health, MEND.rate * dt, 'hull', MEND.cap);
    else if (
      health.hull > FAULTS.floor &&
      faultsOf(health.hull, c.wear)[WATERLINE] === 2
    )
      health = harmed(
        health,
        Math.min(FAULTS.leak * dt, health.hull - FAULTS.floor),
        true
      ).health;
    return { ...c, health, wear: { ...c.wear, quiet, mending } };
  });
}

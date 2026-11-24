// Stars, age, growth and retirement.

import type { Building, Role } from '../office/command.ts';
import { seeded, type Rand } from './dice.ts';
import { stat, withStats, type Person } from './roles.ts';
import { TUNING } from './tuning.ts';

/** Days a season lasts: a person ages a year a season. */
export const YEAR =
  TUNING.calendar.rounds * TUNING.calendar.gap + TUNING.calendar.off;

/** Stars of each stats object already read: states are immutable, so a stats object's stars never change (the rivals'
 *  reviews read the same people' stars many times a week). */
const read = new WeakMap<object, number>();

/** Stars, 0 to 5 in halves, from a set of role stats: their mean / 4. */
export function starsOf(stats: Readonly<Record<string, number>>): number {
  const hit = read.get(stats);
  if (hit !== undefined) return hit;
  // summed in key order, so a state loaded from a save (its keys sorted) sums the same floats in the same order
  const values = Object.keys(stats)
    .sort()
    .map((k) => stats[k]);
  const mean =
    values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length;
  const out = Math.min(5, Math.max(0, Math.round((mean / 4) * 2) / 2));
  read.set(stats, out);
  return out;
}

/** A person's stars now. */
export const stars = (g: Person): number => starsOf(g.stats);

/** A person's potential: their stars at their projected peak (hidden from teams that have not scouted them). */
export const potential = (g: Person): number => starsOf(g.ceiling);

/** A person's age in whole years on a day. */
export const age = (g: { born: number }, day: number): number =>
  Math.floor((day - g.born) / YEAR);

/** A role's peak age range, retirement ages. */
export const peakRange = (role: Role): readonly [number, number] =>
  TUNING.ages.peak[role];
export const retireRange = (role: Role): readonly [number, number] =>
  TUNING.ages.retire[role];

/** A stat's share of a season's change, by the person's seed, the season and the stat: 1 ± spread. */
function share(g: Person, season: number, i: number): number {
  const r = seeded(g.seed ^ (season * 7919), i);
  return 1 + (r() * 2 - 1) * TUNING.growth.spread;
}

/** What a person's growth reads of their team: the role's building as rated (hq.ts rated, 0..3; a free agent 1),
 *  whether a Mentor is on their team, and the driver simulator's rating for a driver's Stamina. */
export interface Schooling {
  school: number;
  mentor: boolean;
  simulator: number;
}

/** The building whose level schools each role; managers and chairmen have none. */
export const SCHOOL: Readonly<Record<Role, Building | null>> = {
  driver: 'simulator',
  pit: 'pitCentre',
  mechanic: 'factory',
  designer: 'designCentre',
  scout: 'scoutingCentre',
  manager: null,
  chairman: null,
};

/** A person grown (or declined) by a season's end, at their age then. Below peak each stat moves toward its ceiling by
 *  0.35 × improvability × school × gap; past it each loses 0.3 + 0.2 × years past peak; each spread by seed. */
export function grown<G extends Person>(
  g: G,
  years: number,
  season: number,
  schooling: Schooling
): G {
  const out: Record<string, number> = {};
  const ceiling: Readonly<Record<string, number>> = g.ceiling;
  const keys = Object.keys(g.stats);
  const now: Readonly<Record<string, number>> = g.stats;
  const school =
    1 + TUNING.growth.school * (Math.min(3, Math.max(1, schooling.school)) - 1);
  const mentor =
    schooling.mentor && g.role === 'driver' && years < TUNING.growth.mentorAge
      ? 1 + TUNING.growth.mentor
      : 1;
  keys.forEach((k, i) => {
    const s = now[k];
    if (years < g.peak) {
      const gap = Math.max(0, ceiling[k] - s);
      const stamina =
        g.role === 'driver' && k === 'stamina'
          ? TUNING.growth.stamina * schooling.simulator
          : 0;
      out[k] = stat(
        s +
          TUNING.growth.rate *
            g.improvability *
            school *
            mentor *
            gap *
            share(g, season, i) +
          stamina
      );
    } else {
      out[k] = stat(
        s -
          (TUNING.growth.decline +
            TUNING.growth.declineYear * (years - g.peak)) *
            share(g, season, i)
      );
    }
  });
  return withStats(g, out) as G;
}

/** The chance a person of an age retires at a season's end: 0 at the role's first retirement age, rising to 1 at its last. */
export function retireChance(role: Role, years: number): number {
  const [first, last] = retireRange(role);
  return Math.min(1, Math.max(0, (years - first) / (last - first)));
}

/** Whether a person retires at this season's end, on a roll of the 'retire' stream. */
export const retires = (role: Role, years: number, rand: Rand): boolean =>
  rand() < retireChance(role, years);

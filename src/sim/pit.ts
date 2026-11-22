// The pit stop, in a race sailed by a card. In her
// team's water a ship may pit: she asks for a stop, a list of jobs chosen up
// front (stores.ts Ask.pit), and her team's pit crew (race.ts PitCrew) does
// them one at a time, in the order asked, while she stays in team water:
// - a zone repaired: its tally cleared (faults.ts Wear), and the hull it took
//   given back, up to her most;
// - her gust: its charges all taken on;
// - a repair kit taken on, where her hold has room for one.
// Each takes its seconds on PIT, times her crew's pace. As a job is taken up it
// may slip, by her crew's chance, one seeded draw (the race's seed, her id, the
// step and the job): a slip adds PIT.slip seconds and harms nothing. A job
// with nothing to do as its turn comes is passed over, taking no time. She
// sails on meanwhile: nothing is paused, nothing shields her. Leaving team
// water (or losing it under her) ends the stop, what is done kept; so does
// asking for a stop of no jobs; and sinking.
//
// In a race sailed by a card this takes the place of her water's own mending
// (faults.ts MEND); a match with no card has no pit.
//
// Pure arithmetic: no three, so it runs in node for the tests; deterministic
// for the same inputs, to the bit.

import { ZONES, type Job } from '../kinds.ts';
import type { PitCrew } from '../race.ts';
import { STRIDE, hash, hash01 } from '../world/random.ts';
import type { Crew } from './battle.ts';
import { GUST } from './handling.ts';
import { healed, sunk } from './health.ts';
import { roomFor, stowed } from './hold.ts';
import type { Ask } from './stores.ts';

/** What the pit is tuned by: seconds. */
export const PIT = {
  /**
   * A job's time with a spec crew: a zone repaired, her gust's charges taken
   * on, a repair kit taken on.
   */
  zone: 6,
  gust: 3,
  kit: 5,
  /** What a slip adds to its job. */
  slip: 3,
} as const;

/**
 * A stop as it stands (battle.ts Crew.pit, while she is served): the jobs
 * asked, the one in hand (its place among them) and the seconds left of it (0:
 * not taken up yet), the jobs done and the slips so far, and the seconds since
 * it began.
 */
export interface Stop {
  jobs: readonly Job[];
  at: number;
  left: number;
  done: number;
  slips: number;
  spent: number;
}

/** A stop ended: whose, how long it took, the jobs done and the slips. */
interface Stopped {
  id: number;
  seconds: number;
  jobs: number;
  slips: number;
}

/**
 * The race as the pit reads it: its seed, the step it is at, and each ship's
 * pit crew.
 */
interface Lane {
  seed: number;
  tick: number;
  crew(id: number): PitCrew;
}

/** A job's zone (its place in ZONES), or -1 if it repairs none. */
const zoneOf = (job: Job) => ZONES.findIndex((z) => z === job);

/** A job's seconds with a spec crew. */
const timeOf = (job: Job) =>
  job === 'gust' ? PIT.gust : job === 'kit' ? PIT.kit : PIT.zone;

/** Whether `job` would do something for her now. */
function due(c: Crew, job: Job): boolean {
  if (job === 'gust') return c.gust.charges < GUST.charges;
  if (job === 'kit') return roomFor(c.hold, 'repairKit') >= 0;
  return c.wear.zones[zoneOf(job)] > 0;
}

/**
 * The seconds `job` would take her now, her crew working at `pace` and not
 * slipping: none with nothing for it to do.
 */
export const jobTime = (c: Crew, job: Job, pace: number) =>
  due(c, job) ? timeOf(job) * pace : 0;

/** Her crew with `job` done. */
function worked(c: Crew, job: Job): Crew {
  if (job === 'gust')
    return { ...c, gust: { ...c.gust, charges: GUST.charges, recharge: 0 } };
  if (job === 'kit') return { ...c, hold: stowed(c.hold, 'repairKit', 1).hold };
  const zone = zoneOf(job),
    z = c.wear.zones,
    left = (i: number) => (i === zone ? 0 : z[i]);
  return {
    ...c,
    health: healed(c.health, z[zone], 'hull'),
    wear: { ...c.wear, zones: [left(0), left(1), left(2), left(3)] },
  };
}

/**
 * dt seconds of the pit: every stop asked for begun (`asks`, by id, of a ship
 * in team water, `home`, and not being served), every stop under way worked
 * on, and those ended told (`stops`).
 */
export function pitted(
  crews: readonly Crew[],
  asks: ReadonlyMap<number, Ask>,
  home: (id: number) => boolean,
  lane: Lane,
  dt: number
): { crews: Crew[]; stops: Stopped[] } {
  const stops: Stopped[] = [];
  /** Her crew, her stop ended: told, if it took her time. */
  const ended = (c: Crew): Crew => {
    const { pit, ...rest } = c;
    if (pit && pit.spent > 0)
      stops.push({
        id: c.id,
        seconds: pit.spent,
        jobs: pit.done,
        slips: pit.slips,
      });
    return rest;
  };
  const after = crews.map((c): Crew => {
    const jobs = asks.get(c.id)?.pit;
    if (!c.pit && !jobs) return c;
    if (sunk(c.health) || !home(c.id) || jobs?.length === 0) return ended(c);
    let s = c.pit ?? {
      jobs: jobs ?? [],
      at: 0,
      left: 0,
      done: 0,
      slips: 0,
      spent: 0,
    };
    if (s.left <= 0) {
      // the next job with something to do taken up, and whether it slips
      let at = s.at;
      while (at < s.jobs.length && !due(c, s.jobs[at])) at++;
      if (at >= s.jobs.length) return ended({ ...c, pit: s });
      const crew = lane.crew(c.id),
        slip =
          hash01(hash(lane.seed, c.id), lane.tick * STRIDE + at) < crew.slip;
      s = {
        ...s,
        at,
        left: timeOf(s.jobs[at]) * crew.pace + (slip ? PIT.slip : 0),
        slips: s.slips + (slip ? 1 : 0),
      };
    }
    s = { ...s, left: s.left - dt, spent: s.spent + dt };
    if (s.left > 1e-9) return { ...c, pit: s };
    const done = worked(c, s.jobs[s.at]);
    s = { ...s, at: s.at + 1, left: 0, done: s.done + 1 };
    return s.at < s.jobs.length
      ? { ...done, pit: s }
      : ended({ ...done, pit: s });
  });
  return { crews: after, stops };
}

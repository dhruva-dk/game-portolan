// A bot's pit stops (bot.ts weighs the pit with her mending), in a race sailed
// in teams (pit.ts: a match with no teams has no pit, and the option scores
// nothing). Hurt enough, with a zone worth repairing and no foe close, she
// makes for her team's water near her and asks her stop there: the zones that
// have taken `worth` hull or more, the most-hit first; a repair kit if she
// carries fewer than `kits`; her gust if she has spent it all. Being served she
// stays where she is, while no foe presses her. She decides her own stops:
// her team's call (called.ts) has no say in them.
//
// Pure arithmetic: no three, so it runs in node for the tests; deterministic
// for the same inputs, to the bit.

import { ZONES, type Job } from '../kinds.ts';
import { along, type Vec3 } from '../world/sphere.ts';
import type { Crew } from './battle.ts';
import { rotate, waterNear, type Ctx } from './captain.ts';
import { faultsIn } from './faults.ts';
import { hullCap } from './health.ts';
import { roomFor } from './hold.ts';
import type { Ask } from './stores.ts';
import { ramp, utility } from './utility.ts';

/** Everything a bot's pit stops are tuned by. */
export const PITTING = {
  /**
   * Her hull under this share of her most she wants the pit, wholly `band`
   * under it; faulted, at least `faulted` by her worst fault (none, minor,
   * major).
   */
  hull: 0.6,
  band: 0.25,
  faulted: [0, 0.7, 1] as const,
  /** A zone that has taken this much hull is worth a job. */
  worth: 8,
  /** A repair kit taken on while she carries fewer than this. */
  kits: 1,
  /**
   * Team water she makes for: within this many m of her, with her team's
   * `room` m all round it if there is such, so she lies well inside. She asks her stop
   * once she lies in it making no more than `slow` m/s (a bot keeps some
   * way on: helmsman.ts HELM.leastWay).
   */
  reach: 150,
  slow: 7,
  room: 20,
  /**
   * A foe nearer than `close` m and she will not pit; wholly willing with none
   * within `clear`.
   */
  close: 55,
  clear: 90,
} as const;

/** The repair kits she carries. */
const kits = (c: Crew) =>
  c.hold.items.reduce(
    (n, s) => n + (s && s.kind === 'repairKit' ? s.count : 0),
    0
  );

/**
 * The stop she would ask now: its jobs in her order; none with no zone worth
 * repairing.
 */
function stopFor(c: Ctx, crew: Crew): Job[] {
  const b = c.b.pitting;
  const jobs: Job[] = ZONES.map((zone, i) => ({
    zone,
    took: crew.wear.zones[i],
  }))
    .filter((z) => z.took >= b.worth)
    .sort((x, y) => y.took - x.took)
    .map((z) => z.zone);
  if (jobs.length === 0) return jobs;
  if (kits(crew) < b.kits && roomFor(crew.hold, 'repairKit') >= 0)
    jobs.push('kit');
  if (crew.gust.charges === 0) jobs.push('gust');
  return jobs;
}

/**
 * Her team's water near her (captain.ts waterNear), or null: for choice, water
 * with her team's `room` m all round it, where she may lie keeping her way on.
 */
function teamWater(c: Ctx): Vec3 | null {
  const h = c.sea.holdings,
    { team, ship } = c.own,
    b = c.b.pitting;
  if (!h || team === undefined) return null;
  const ours = (p: Vec3) => h.teamAt(p) === team,
    round = (p: Vec3, k: number) =>
      along(p, rotate(p, ship.heading, (k * Math.PI) / 2), b.room).p,
    roomy = (p: Vec3) =>
      ours(p) && [0, 1, 2, 3].every((k) => ours(round(p, k)));
  return waterNear(c, b.reach, roomy) ?? waterNear(c, b.reach, ours);
}

/**
 * The pit option's score: in a race sailed in teams, her need of a stop, her
 * team's water near, and no foe close; served, she stays while none is.
 */
export const pitUrge = (c: Ctx): number => {
  const crew = c.own.crew,
    b = c.b.pitting;
  if (!crew || c.own.team === undefined) return 0;
  const clear = ramp(c.foeD, b.close, b.clear);
  if (crew.pit) return clear;
  if (stopFor(c, crew).length === 0 || !teamWater(c)) return 0;
  const hull = crew.health.hull / hullCap(crew.health),
    need = Math.max(
      ramp(hull, b.hull, b.hull - b.band),
      b.faulted[Math.max(...faultsIn(crew))]
    );
  return utility(need, clear);
};

/** Pitting: to her team's water near her, and there where she is. */
export const pitAct = (c: Ctx): Vec3 => teamWater(c) ?? c.own.ship.at;

/**
 * What she asks this step (`ask`, her purser's), and her stop besides: making
 * for the pit, come to her team's water and not yet served.
 */
export function pitAsk(c: Ctx, ask: Ask): Ask {
  const crew = c.own.crew,
    h = c.sea.holdings;
  if (c.m.mode !== 'pit' || !crew || crew.pit || !h) return ask;
  const { ship } = c.own;
  if (ship.speed > c.b.pitting.slow || h.teamAt(ship.at) !== c.own.team)
    return ask;
  const pit = stopFor(c, crew);
  return pit.length === 0 ? ask : { ...ask, pit };
}

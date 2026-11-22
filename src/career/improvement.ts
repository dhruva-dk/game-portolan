// The improvement (Phase B section 8.4): work points a day, the factory's 10, 20 or 30 plus each mechanic's
// (Reliability + Performance) / 4. First each day the points restore fitted parts' condition (a point, 0.01) up to 1;
// the rest go as the team split them: per fitted non-spec part, a share to performance (1 a point, × her ship's
// mechanic's Performance factor) and a share to reliability (0.002 a point, × her Reliability factor), each up to its
// maximum, × the part's supplier's improvement terms.
//
// Worked out in closed form over the days since the team's improvementDay (D41): condition only rises between races, so over
// n days the first points restore it (the most worn part first) and the rest split; caps are per part. `improvementTo` brings
// a team's parts to today; anything that reads or changes them first calls it.

import type { ImprovementShare } from '../office/command.ts';
import { accept, refuse, why, type Check, type Handlers } from './command.ts';
import { effective } from './effective.ts';
import { within } from './flags.ts';
import { mine } from './post.ts';
import { hasRole, type PersonOf } from './roles.ts';
import { factoryPoints } from './hq.ts';
import { perfImprovement, reliabilityImprovement } from './pit.ts';
import {
  teamOf,
  withTeam,
  type CareerState,
  type Team,
  type Part,
} from './state.ts';
import { termsFor } from './suppliers.ts';
import { TUNING } from './tuning.ts';

const Y = TUNING.improvement;

/** Each ship's mechanic's effective stats (null: she has none), by ship. */
export function mechanicsOf(
  s: CareerState,
  c: Team
): (PersonOf<'mechanic'>['stats'] | null)[] {
  return c.staff.ships.map((h) => {
    const g = h.mechanic === null ? undefined : s.people[h.mechanic];
    return g && hasRole(g, 'mechanic') ? effective(g, null) : null;
  });
}

/** A team's improvement points a day: the factory's, plus each mechanic's (Reliability + Performance) / 4. */
export function improvementPoints(s: CareerState, team: number): number {
  const c = teamOf(s, team);
  return mechanicsOf(s, c).reduce(
    (points, b) => points + (b ? (b.reliability + b.perf) * Y.mechanic : 0),
    factoryPoints(c)
  );
}

/** A team's improvement points over the days [from, to): each day's points, the factory's at × slow on the days storm damage
 *  is mended slowly, and all × (1 + exempt) on the days of a testing exemption (career/events.ts). */
export function improvementWork(
  s: CareerState,
  team: number,
  from: number,
  to: number
): number {
  const D = TUNING.dilemmas;
  const daily = improvementPoints(s, team);
  const slow = within(s, `slow:${team}`, D.slowDays, from, to),
    exempt = within(s, `exempt:${team}`, D.exemptDays, from, to);
  return (
    (to - from) * daily -
    slow * factoryPoints(teamOf(s, team)) * (1 - D.slow) +
    exempt * daily * D.exempt
  );
}

/** Parts after some points of work: condition restored first (most worn first), then the rest by the shares. */
export function worked(
  parts: readonly Part[],
  points: number,
  shares: readonly ImprovementShare[],
  factors: (p: Part) => { perf: number; reliability: number }
): Part[] {
  let left = points;
  const out = parts.map((p) => ({ ...p }));
  for (const p of [...out]
    .filter((x) => x.ship !== null && x.condition < 1)
    .sort((a, b) => a.condition - b.condition || a.id - b.id)) {
    const need = (1 - p.condition) / Y.condition;
    const used = Math.min(left, need);
    p.condition = Math.min(
      1,
      Math.round((p.condition + used * Y.condition) * 1000) / 1000
    );
    left -= used;
    if (left <= 0) break;
  }
  if (left <= 0) return out;
  for (const sh of shares) {
    const p = out.find((x) => x.id === sh.part);
    if (!p || p.ship === null || p.spec) continue;
    const f = factors(p);
    p.perf = Math.min(
      p.perfMax,
      Math.round((p.perf + left * sh.perf * Y.perf * f.perf) * 10) / 10
    );
    p.reliability = Math.min(
      p.reliabilityMax,
      Math.round(
        (p.reliability +
          left * sh.reliability * Y.reliability * f.reliability) *
          1000
      ) / 1000
    );
  }
  return out;
}

/** A state with a team's improvement work reckoned from its improvementDay to today. */
export function improvementTo(s: CareerState, team: number): CareerState {
  const c = teamOf(s, team);
  const days = s.day - c.improvementDay;
  if (days <= 0) return s;
  const mechanics = mechanicsOf(s, c);
  const factors = (p: Part) => {
    const b = p.ship === null ? null : mechanics[p.ship];
    const improvement = termsFor(c.suppliers, p.type).improvement;
    return {
      perf: perfImprovement(b?.perf ?? 0) * improvement,
      reliability: reliabilityImprovement(b?.reliability ?? 0) * improvement,
    };
  };
  const parts = worked(
    c.parts,
    improvementWork(s, team, c.improvementDay, s.day),
    c.improvement,
    factors
  );
  return withTeam(s, { ...c, parts, improvementDay: s.day });
}

/** Every team's improvement brought to today (section 13 calls it before race cards are made). */
export const improvementsTo = (s: CareerState): CareerState =>
  s.teams.reduce((acc, c) => improvementTo(acc, c.id), s);

/** Whether a split of the improvement's points is one the team may set: its own fitted non-spec parts, each named once, each
 *  share 0..1, all the shares together at most 1. */
export function improvementCheck(
  s: CareerState,
  team: number,
  shares: readonly ImprovementShare[]
): Check {
  if (!Array.isArray(shares))
    return why('shares', 'The improvement needs a split.');
  const c = teamOf(s, team);
  const seen = new Set<number>();
  let total = 0;
  for (const sh of shares) {
    const ok = (x: unknown) =>
      typeof x === 'number' && Number.isFinite(x) && x >= 0 && x <= 1;
    if (!sh || !ok(sh.perf) || !ok(sh.reliability))
      return why('shares', 'Each share is between none and all of the points.');
    const p = c.parts.find((x) => x.id === sh.part);
    if (!p || p.ship === null)
      return why('part', 'The improvement works only on your fitted parts.');
    if (p.spec) return why('spec', 'A standard part is never improved.');
    if (seen.has(sh.part)) return why('twice', 'Name each part once.');
    seen.add(sh.part);
    total += sh.perf + sh.reliability;
  }
  if (total > 1 + 1e-9)
    return why(
      'over',
      "The shares come to more than the improvement's points."
    );
  return null;
}

/** A state with a team's split set (checked first): the work so far reckoned on the old split. */
export function improvementSet(
  s: CareerState,
  team: number,
  shares: readonly ImprovementShare[]
): CareerState {
  const out = improvementTo(s, team);
  return withTeam(out, {
    ...teamOf(out, team),
    improvement: shares.map((x) => ({
      part: x.part,
      perf: x.perf,
      reliability: x.reliability,
    })),
  });
}

export const IMPROVEMENT: Handlers = {
  SetImprovement: (s, c) => {
    const me = mine(s);
    if (me === null)
      return refuse(
        'sacked',
        'You have no team: take one of the posts offered.'
      );
    const no = improvementCheck(s, me, c.shares);
    return no
      ? refuse(no.code, no.sentence)
      : accept(improvementSet(s, me, c.shares));
  },
};

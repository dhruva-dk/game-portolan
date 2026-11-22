// A rival team's measure of an Admiralty proposal (Phase B section 11): how far its own state leans it for (+1) or
// against (−1). Strong in a part type, against making it spec; short of balance, for a flatter prize spread; poor gunners,
// for banning a gun kind (a result names no gun, so its drivers' Gunnery stands for being sunk by guns); good drivers
// in Stormcraft, for a faster storm; good gunners with Nerve, for more points a sinking; homesteading drivers, for the
// sea-held point; a team sailing risky parts, against more inspection.

import type { PartType } from '../race.ts';
import type { Change } from '../office/command.ts';
import { effective } from './effective.ts';
import { unit, type PersonOf, inRole } from './roles.ts';
import type { CareerState, Team } from './state.ts';

const clamp1 = (x: number) => Math.min(1, Math.max(-1, x));

/** A team's sailing drivers' effective stats. */
function drivers(s: CareerState, c: Team): PersonOf<'driver'>['stats'][] {
  return c.staff.ships
    .map((h) => h.driver)
    .filter((id): id is number => id !== null)
    .map((id) => effective(inRole(s.people[id], 'driver'), null));
}

const meanU = (xs: readonly number[]): number =>
  xs.length === 0 ? 0.5 : xs.reduce((a, x) => a + unit(x), 0) / xs.length;

/** Where a team's best part of a type ranks in its tier, 0 best .. 1 worst. */
export function rankShare(
  s: CareerState,
  team: number,
  type: PartType
): number {
  const best = (c: Team) =>
    c.parts.reduce((a, p) => (p.type === type ? Math.max(a, p.perf) : a), 0);
  const l = s.championships[s.teams[team].tier];
  const mine = best(s.teams[team]);
  const better = l.teams.filter((id) => best(s.teams[id]) > mine).length;
  return l.teams.length <= 1 ? 0.5 : better / (l.teams.length - 1);
}

/** A team's lean on a change, −1..1. */
export function lean(s: CareerState, team: number, change: Change): number {
  const c = s.teams[team];
  const l = s.championships[c.tier];
  const caps = drivers(s, c);
  switch (change.measure) {
    case 'spec':
      return clamp1(
        (rankShare(s, team, change.type) - 0.5) * 2 * (change.spec ? 1 : -1)
      );
    case 'storm':
      return clamp1(
        (meanU(caps.map((x) => x.stormcraft)) - 0.5) *
          2 *
          (change.pace < l.next.storm ? 1 : -1)
      );
    case 'ban':
      return clamp1((0.5 - meanU(caps.map((x) => x.gunnery))) * 2);
    case 'pointsPerSinking': {
      const u =
        (meanU(caps.map((x) => x.gunnery)) + meanU(caps.map((x) => x.nerve))) /
        2;
      return clamp1(
        (u - 0.5) * 2 * (change.points > l.next.pointsPerSinking ? 1 : -1)
      );
    }
    case 'seaHeldPoint': {
      const ids = c.staff.ships
        .map((h) => h.driver)
        .filter((id): id is number => id !== null);
      const share =
        ids.length === 0
          ? 0.5
          : ids.filter((id) =>
              ['homesteader', 'turtle'].includes(s.people[id].persona ?? '')
            ).length / ids.length;
      return clamp1((share - 0.5) * 2 * (change.on ? 1 : -1));
    }
    case 'prizeSpread': {
      const half = Math.max(1, c.budget / 2);
      return clamp1(
        ((half - c.balance) / half) *
          (change.spread < l.next.prizeSpread ? 1 : -1)
      );
    }
    case 'inspection': {
      const risk = c.parts.reduce(
        (a, p) => a + (p.ship !== null ? p.risk : 0),
        0
      );
      return clamp1(
        (0.5 - Math.min(1, 4 * risk)) *
          2 *
          (change.share > l.next.inspection ? 1 : -1)
      );
    }
  }
}

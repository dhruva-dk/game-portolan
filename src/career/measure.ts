// A rival crew's measure of an Admiralty proposal (Phase B section 11): how far its own state leans it for (+1) or
// against (−1). Strong in a part type, against making it spec; short of coin, for a flatter prize spread; poor gunners,
// for banning a gun kind (a result names no gun, so its captains' Gunnery stands for being sunk by guns); good captains
// in Stormcraft, for a faster storm; good gunners with Nerve, for more points a sinking; homesteading captains, for the
// sea-held point; a crew sailing risky parts, against more inspection.

import type { PartType } from '../race.ts';
import type { Change } from '../office.ts';
import { effective } from './effective.ts';
import { unit, type GullOf } from './roles.ts';
import type { CareerState, Crew } from './state.ts';

const clamp1 = (x: number) => Math.min(1, Math.max(-1, x));

/** A crew's sailing captains' effective stats. */
function captains(s: CareerState, c: Crew): GullOf<'captain'>['stats'][] {
  return c.staff.ships.map((h) => h.captain).filter((id): id is number => id !== null).map((id) => effective(s.gulls[id] as GullOf<'captain'>, null));
}

const meanU = (xs: readonly number[]): number => (xs.length === 0 ? 0.5 : xs.reduce((a, x) => a + unit(x), 0) / xs.length);

/** Where a crew's best part of a type ranks in its league, 0 best .. 1 worst. */
export function rankShare(s: CareerState, crew: number, type: PartType): number {
  const best = (c: Crew) => c.parts.reduce((a, p) => (p.type === type ? Math.max(a, p.perf) : a), 0);
  const l = s.leagues[s.crews[crew].league];
  const mine = best(s.crews[crew]);
  const better = l.crews.filter((id) => best(s.crews[id]) > mine).length;
  return l.crews.length <= 1 ? 0.5 : better / (l.crews.length - 1);
}

/** A crew's lean on a change, −1..1. */
export function lean(s: CareerState, crew: number, change: Change): number {
  const c = s.crews[crew];
  const l = s.leagues[c.league];
  const caps = captains(s, c);
  switch (change.measure) {
    case 'spec': return clamp1((rankShare(s, crew, change.type) - 0.5) * 2 * (change.spec ? 1 : -1));
    case 'storm': return clamp1((meanU(caps.map((x) => x.stormcraft)) - 0.5) * 2 * (change.pace < l.next.storm.pace ? 1 : -1));
    case 'ban': return clamp1((0.5 - meanU(caps.map((x) => x.gunnery))) * 2);
    case 'pointsPerSinking': {
      const u = (meanU(caps.map((x) => x.gunnery)) + meanU(caps.map((x) => x.nerve))) / 2;
      return clamp1((u - 0.5) * 2 * (change.points > l.next.pointsPerSinking ? 1 : -1));
    }
    case 'seaHeldPoint': {
      const ids = c.staff.ships.map((h) => h.captain).filter((id): id is number => id !== null);
      const share = ids.length === 0 ? 0.5 : ids.filter((id) => ['homesteader', 'turtle'].includes(s.gulls[id].style ?? '')).length / ids.length;
      return clamp1((share - 0.5) * 2 * (change.on ? 1 : -1));
    }
    case 'prizeSpread': {
      const half = Math.max(1, c.budget / 2);
      return clamp1(((half - c.coin) / half) * (change.spread < l.next.prizeSpread ? 1 : -1));
    }
    case 'inspection': {
      const risk = c.parts.reduce((a, p) => a + (p.ship !== null ? p.risk : 0), 0);
      return clamp1((0.5 - Math.min(1, 4 * risk)) * 2 * (change.share > l.next.inspection ? 1 : -1));
    }
  }
}

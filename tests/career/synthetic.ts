// Synthetic matches for the career tests: a player of a given true skill against the plan's captains,
// played with the rating's own model (src/career/synthetic.ts), turned into a MatchReport.
import type { MatchPlan, MatchReport, ShipReport } from '../../src/career/contract.ts';
import { NO_HABITS, type PlayerHabits } from '../../src/career/habits.ts';
import { playSynthetic } from '../../src/career/synthetic.ts';
import { rngInt, type Rng } from '../../src/sim/math.ts';
import { REGION_COUNT } from '../../src/sim/world/index.ts';

export const MATCH_SECONDS = 660;

export function syntheticReport(rng: Rng, plan: MatchPlan, skill: number, habits: PlayerHabits | null = NO_HABITS): MatchReport {
  const skills = [skill, ...plan.fleet.map((f) => f.rating)], res = playSynthetic(rng, skills), n = skills.length;
  const ships = skills.map((_, i): ShipReport => {
    const drop = rngInt(rng, REGION_COUNT), regions = [drop];
    for (let k = rngInt(rng, 3); k > 0; k--) regions.push(rngInt(rng, REGION_COUNT));
    return {
      place: res.place[i],
      kills: res.kills[i],
      damage: res.kills[i] * 150 + rngInt(rng, 200),
      survived: Math.round((MATCH_SECONDS * (n + 1 - res.place[i])) / n),
      regions,
      sunkBy: res.sunkBy[i],
    };
  });
  return { captains: plan.fleet.map((f) => f.captain), ships, habits };
}

/** A report where the player finishes `place`, with the given sinkings (ship -> sunk by), everyone else in order. */
export function scriptedReport(plan: MatchPlan, place: number, sinks: Record<number, number> = {}, habits: PlayerHabits | null = NO_HABITS, regions: number[] = [1]): MatchReport {
  const n = plan.fleet.length + 1, order = Array.from({ length: n - 1 }, (_, k) => k + 1);
  order.splice(place - 1, 0, 0);
  const ships = Array.from({ length: n }, (_, ship): ShipReport => ({
    place: order.indexOf(ship) + 1, kills: 0, damage: 0, survived: 300, regions: ship === 0 ? regions : [2], sunkBy: sinks[ship] ?? -1,
  }));
  for (const [, by] of Object.entries(sinks)) ships[by].kills++;
  return { captains: plan.fleet.map((f) => f.captain), ships, habits };
}

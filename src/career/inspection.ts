// Inspection and risk: after each race, `rules.inspection` of a tier's teams (a third), drawn by
// seed, are inspected. Each fitted part with risk is found with a chance equal to its risk. Found, it is confiscated,
// the team is fined (1 + risk) × 20% of its design cost, and that race's points are struck from the team. Mail tells
// the team, and the tier.
//
// A ship whose part is confiscated fits the team's best spare of the type, or sails a stand-in (parts.ts sparePart).

import { known } from './canon.ts';
import { paid } from './balance.ts';
import { shuffled, type Dice } from './dice.ts';
import { sparePart } from './parts.ts';
import { mine, post } from './post.ts';
import type { CareerState, Part } from './state.ts';
import { TUNING } from './tuning.ts';
import { improvementTo } from './improvement.ts';

/** A team's finding: the parts confiscated, the fine, the points struck. */
interface Finding {
  team: number;
  parts: readonly number[];
  fine: number;
  struck: number;
}

/** The fine for a part found: (1 + risk) × 20% of its design cost. */
export const fineFor = (p: Part): number =>
  Math.round((1 + p.risk) * TUNING.parts.fine * p.cost);

/** How many of a tier's teams are inspected under a share. */
export const inspectedCount = (teams: number, share: number): number =>
  Math.round(Math.max(0, Math.min(1, share)) * teams);

/** A state after a tier's inspection, with what was found. `points` gives each team's points from this race (struck
 *  if a part of theirs is found); section 13 calls it as the round closes, after the standings, and strikes the ships'
 *  own points (drivers' records) from `found`. */
export function inspected(
  s: CareerState,
  tier: number,
  points: (team: number) => number,
  roll: Dice
): { state: CareerState; found: Finding[] } {
  const rand = roll.roll(`inspection:${tier}`);
  const l = s.championships[tier];
  const chosen = shuffled(rand, l.teams)
    .slice(0, inspectedCount(l.teams.length, l.rules.inspection))
    .sort((a, b) => a - b);
  let out = s;
  const found: Finding[] = [];
  for (const team of chosen) {
    out = improvementTo(out, team);
    const c = out.teams[team];
    const caught = c.parts.filter(
      (p) => p.ship !== null && p.risk > 0 && rand() < p.risk
    );
    if (caught.length === 0) {
      out = post(out, {
        team,
        category: 'tier',
        sender: null,
        kind: 'inspectionClean',
        slots: { team },
        links: [],
      });
      continue;
    }
    const fine = caught.reduce((a, p) => a + fineFor(p), 0);
    const struck = points(team);
    let parts = c.parts.filter((p) => !caught.includes(p));
    let id = out.ids.part;
    for (const p of caught) {
      const ship = known(p.ship);
      const spare = parts
        .filter((x) => x.type === p.type && x.ship === null && !x.forNext)
        .sort((a, b) => b.perf - a.perf || a.id - b.id)[0];
      parts = spare
        ? parts.map((x) => (x.id === spare.id ? { ...x, ship } : x))
        : [...parts, sparePart(id++, p.type, ship)];
    }
    const teams = [...out.teams];
    teams[team] = { ...c, parts };
    const standings = out.championships[tier].standings.map((x) =>
      x.team === team ? { ...x, points: x.points - struck } : x
    );
    const championships = [...out.championships];
    championships[tier] = { ...out.championships[tier], standings };
    out = { ...out, teams, championships, ids: { ...out.ids, part: id } };
    out = paid(out, team, fine, {
      kind: 'fine',
      what: "the Federation's inspection",
    });
    out = post(out, {
      team,
      category: 'tier',
      sender: null,
      kind: 'inspectionFound',
      slots: { team, parts: caught.length, fine, struck },
      links: [],
    });
    found.push({ team, parts: caught.map((p) => p.id), fine, struck });
  }
  const me = mine(out);
  if (me !== null && out.teams[me].tier === tier) {
    out = post(out, {
      team: null,
      category: 'tier',
      sender: null,
      kind: 'inspectionTier',
      slots: {
        tier,
        inspected: chosen.length,
        found: found.map((f) => f.team).join(','),
      },
      links: found.map((f) => ({ to: 'team' as const, id: f.team })),
    });
  }
  return { state: out, found };
}

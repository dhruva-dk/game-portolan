// Inspection and risk (Phase B section 8.5): after each race, `rules.inspection` of a league's crews (a third), drawn by
// seed, are inspected. Each fitted part with risk is found with a chance equal to its risk. Found, it is confiscated,
// the crew is fined (1 + risk) × 20% of its design cost, and that race's points are struck from the crew. Mail tells
// the crew, and the league.
//
// A ship whose part is confiscated fits the crew's best spare of the type, or sails a stand-in (parts.ts sparePart).

import { paid } from './coin.ts';
import { shuffled, type Dice } from './dice.ts';
import { sparePart } from './parts.ts';
import { mine, post } from './post.ts';
import type { CareerState, Part } from './state.ts';
import { TUNING } from './tuning.ts';
import { yardTo } from './yard.ts';

/** A crew's finding: the parts confiscated, the fine, the points struck. */
export interface Finding {
  crew: number;
  parts: readonly number[];
  fine: number;
  struck: number;
}

/** The fine for a part found: (1 + risk) × 20% of its design cost. */
export const fineFor = (p: Part): number =>
  Math.round((1 + p.risk) * TUNING.parts.fine * p.cost);

/** How many of a league's crews are inspected under a share. */
export const inspectedCount = (crews: number, share: number): number =>
  Math.round(Math.max(0, Math.min(1, share)) * crews);

/** A state after a league's inspection, with what was found. `points` gives each crew's points from this race (struck
 *  if a part of theirs is found); section 13 calls it as the round closes, after the standings, and strikes the ships'
 *  own points (captains' records) from `found`. */
export function inspected(
  s: CareerState,
  league: number,
  points: (crew: number) => number,
  roll: Dice
): { state: CareerState; found: Finding[] } {
  const rand = roll.roll(`inspection:${league}`);
  const l = s.leagues[league];
  const chosen = shuffled(rand, l.crews)
    .slice(0, inspectedCount(l.crews.length, l.rules.inspection))
    .sort((a, b) => a - b);
  let out = s;
  const found: Finding[] = [];
  for (const crew of chosen) {
    out = yardTo(out, crew);
    const c = out.crews[crew];
    const caught = c.parts.filter(
      (p) => p.ship !== null && p.risk > 0 && rand() < p.risk
    );
    if (caught.length === 0) {
      out = post(out, {
        crew,
        category: 'league',
        sender: null,
        kind: 'inspectionClean',
        slots: { crew },
        links: [],
      });
      continue;
    }
    const fine = caught.reduce((a, p) => a + fineFor(p), 0);
    const struck = points(crew);
    let parts = c.parts.filter((p) => !caught.includes(p));
    let id = out.ids.part;
    for (const p of caught) {
      const ship = p.ship!;
      const spare = parts
        .filter((x) => x.type === p.type && x.ship === null && !x.forNext)
        .sort((a, b) => b.perf - a.perf || a.id - b.id)[0];
      parts = spare
        ? parts.map((x) => (x.id === spare.id ? { ...x, ship } : x))
        : [...parts, sparePart(id++, p.type, ship)];
    }
    const crews = [...out.crews];
    crews[crew] = { ...c, parts };
    const standings = out.leagues[league].standings.map((x) =>
      x.crew === crew ? { ...x, points: x.points - struck } : x
    );
    const leagues = [...out.leagues];
    leagues[league] = { ...out.leagues[league], standings };
    out = { ...out, crews, leagues, ids: { ...out.ids, part: id } };
    out = paid(out, crew, fine, {
      kind: 'fine',
      what: "the Admiralty's inspection",
    });
    out = post(out, {
      crew,
      category: 'league',
      sender: null,
      kind: 'inspectionFound',
      slots: { crew, parts: caught.length, fine, struck },
      links: [],
    });
    found.push({ crew, parts: caught.map((p) => p.id), fine, struck });
  }
  const me = mine(out);
  if (me !== null && out.crews[me].league === league) {
    out = post(out, {
      crew: null,
      category: 'league',
      sender: null,
      kind: 'inspectionLeague',
      slots: {
        league,
        inspected: chosen.length,
        found: found.map((f) => f.crew).join(','),
      },
      links: found.map((f) => ({ to: 'crew' as const, id: f.crew })),
    });
  }
  return { state: out, found };
}

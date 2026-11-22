// What a team knows of a person (Phase B section 4, D16). Knowledge is per team: a team knows its own staff and every
// person its scouts have reported on, exactly; of the rest it sees ranges, as wide as its best scout's Judgement
// (stars) and Insight (potential) among those with the person in Reach allow, the stars' centre off by a seeded amount
// fixed for that team and person. The player's screens and the rivals' choices read the same view.

import { seeded } from './dice.ts';
import { effective } from './effective.ts';
import type { Person } from './roles.ts';
import {
  centreOff,
  inReach,
  potentialWidth,
  shownRange,
  starWidth,
  traitShows,
} from './staff.ts';
import { potential, stars } from './stars.ts';
import { inRole } from './roles.ts';
import type { CareerState } from './state.ts';

/** What a team sees of a person: exact once known; ranges otherwise. `arrow` is the change in stars since the last
 *  season's end, for a known person. */
interface View {
  known: boolean;
  stars: readonly [number, number];
  potential: readonly [number, number];
  trait: string | null;
  arrow: number | null;
}

/** The tier a person is seen in: their team's, or null for a free agent. */
export const tierOf = (s: CareerState, g: Person): number | null =>
  g.contract ? s.teams[g.contract.team].tier : null;

/** Whether a team knows a person exactly: its own, or scouted. */
export const knows = (team: number, g: Person): boolean =>
  g.contract?.team === team || g.known[team] !== undefined;

/** The ids of the people with an entry for each team in their `known`, for the last people list read. States share every
 *  person they did not change, so a new list is brought up to date by comparing it with that one and reading again only
 *  the people that differ: a team's reviews then look over the few dozen people it knows, not every person there is. */
let indexed: readonly Person[] = [];
const byTeam = new Map<string, Set<number>>();

function reindexed(people: readonly Person[]): void {
  if (people === indexed) return;
  const both = Math.min(people.length, indexed.length);
  for (let i = 0; i < both; i++) {
    const was = indexed[i],
      now = people[i];
    if (was === now || was.known === now.known) continue;
    for (const k of Object.keys(was.known)) byTeam.get(k)?.delete(i);
    entered(now);
  }
  for (let i = both; i < indexed.length; i++)
    for (const k of Object.keys(indexed[i].known)) byTeam.get(k)?.delete(i);
  for (let i = both; i < people.length; i++) entered(people[i]);
  indexed = people;
}

function entered(g: Person): void {
  for (const k of Object.keys(g.known)) {
    const ids = byTeam.get(k) ?? new Set<number>();
    byTeam.set(k, ids.add(g.id));
  }
}

/** The ids of the people a team has an entry for (its scouts' reports, its signings), in id order. */
export function knownTo(s: CareerState, team: number): number[] {
  reindexed(s.people);
  return [...(byTeam.get(String(team)) ?? [])].sort((a, b) => a - b);
}

/** A team's eyes: the best Judgement and Insight among its scouts with a tier (null: the free agents) in Reach. */
export type Sight = (tier: number | null) => {
  judgement: number;
  insight: number;
};

/** A team's sight, its scouts' effective stats read once. */
export function sightOf(s: CareerState, team: number): Sight {
  const c = s.teams[team];
  const scouts = c.staff.scouts
    .map((id) => s.people[id])
    .filter((g) => g.role === 'scout')
    .map((g) => effective(inRole(g, 'scout'), null));
  const by = new Map<number | null, { judgement: number; insight: number }>();
  return (tier) => {
    const hit = by.get(tier);
    if (hit) return hit;
    let judgement = 0,
      insight = 0;
    for (const st of scouts) {
      if (!inReach(st.reach, c.tier, tier)) continue;
      judgement = Math.max(judgement, st.judgement);
      insight = Math.max(insight, st.insight);
    }
    const out = { judgement, insight };
    by.set(tier, out);
    return out;
  };
}

/** What a team sees of a person (its sight passed in when many people are viewed at once). */
export function view(
  s: CareerState,
  team: number,
  person: number,
  sight: Sight = sightOf(s, team)
): View {
  const g = s.people[person];
  const st = stars(g),
    pot = potential(g);
  const k = g.known[team];
  const e = sight(tierOf(s, g));
  if (knows(team, g)) {
    return {
      known: true,
      stars: [st, st],
      potential: shownRange(pot, potentialWidth(e.insight, true)),
      trait: g.traits[0] ?? null,
      arrow: k ? st - k.last : null,
    };
  }
  const off = centreOff(e.judgement, seeded(g.seed, team + 1));
  return {
    known: false,
    stars: shownRange(st + off, starWidth(e.judgement)),
    potential: shownRange(pot + off, potentialWidth(e.insight, false)),
    trait: traitShows(e.insight) ? (g.traits[0] ?? null) : null,
    arrow: null,
  };
}

/** The middle of a range. */
export const middle = (r: readonly [number, number]): number =>
  (r[0] + r[1]) / 2;

/** A state with a person known to a team from a report today. */
export function learned(
  s: CareerState,
  team: number,
  person: number,
  scout: number | null
): CareerState {
  const g = s.people[person];
  const people = [...s.people];
  people[person] = {
    ...g,
    known: {
      ...g.known,
      [team]: { day: s.day, last: stars(g), by: scout, used: false },
    },
  };
  return { ...s, people };
}

/** A state with every team's knowledge marked at this season's end (each known person's stars now), so next season's
 *  screens show the change as an arrow. Section 13 calls it at the season's end before growth. */
export function knowledgeTurned(s: CareerState): CareerState {
  const people = s.people.map((g) => {
    const teams = Object.keys(g.known);
    if (teams.length === 0 || g.retired !== null) return g;
    const st = stars(g);
    const known = Object.fromEntries(
      teams.map((c) => [c, { ...g.known[c], last: st }])
    );
    return { ...g, known };
  });
  return { ...s, people };
}

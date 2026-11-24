// A season's end for every person: growth (or decline) by age, retirement, and traits
// gained or lost. Season's end calls them in its order (section 13): retirements, then growth, then traits. Each is
// one pass over the people a season, never a day; draws are one roll of the 'retire' and 'traits' streams a season,
// taken in person id order.

import type { Dice } from './dice.ts';
import { mentors } from './effective.ts';
import { rated } from './hq.ts';
import type { Person } from './roles.ts';
import { SCHOOL, age, grown, retires, stars, type Schooling } from './stars.ts';
import type { CareerState, Hands, Staff } from './state.ts';
import { staffOf } from './state.ts';
import { turned } from './traits.ts';

/** What a person's growth reads of their team: their role's building, a Mentor aboard, the sailing school. A free
 *  agent grows as at level 1, with no Mentor. */
export function schoolingOf(s: CareerState, g: Person): Schooling {
  const team = g.contract ? s.teams[g.contract.team] : null;
  if (!team) return { school: 1, mentor: false, simulator: 0 };
  const building = SCHOOL[g.role];
  return {
    school: building ? rated(team.buildings[building].level) : 1,
    mentor: mentors(
      staffOf(team)
        .filter((id) => id !== g.id)
        .map((id) => s.people[id])
    ),
    simulator: rated(team.buildings.simulator.level),
  };
}

const living = (g: Person) => g.retired === null && !g.player;

/** Every living person grown by a season's end, by their age that day. */
export function seasonGrowth(s: CareerState): CareerState {
  const people = s.people.map((g) =>
    living(g) ? grown(g, age(g, s.day), s.season, schoolingOf(s, g)) : g
  );
  return { ...s, people };
}

/** A team's staff with a person taken off it (their place left empty for the team to fill). */
export function without(staff: Staff, id: number): Staff {
  const hand = (h: Hands): Hands => ({
    driver: h.driver === id ? null : h.driver,
    mechanic: h.mechanic === id ? null : h.mechanic,
  });
  return {
    ...staff,
    ships: staff.ships.map(hand),
    reserve: staff.reserve === id ? null : staff.reserve,
    designer: staff.designer === id ? null : staff.designer,
    scouts: staff.scouts.filter((x) => x !== id),
    pit: staff.pit.filter((x) => x !== id),
  };
}

/** Whether a person's retirement is news to the player: on the player's team, or a star (4 stars or more). */
export const newsworthy = (s: CareerState, g: Person): boolean =>
  g.contract?.team === s.player?.team || stars(g) >= 4;

/** The people who retire at this season's end, out of their teams (the manager's and chairman's posts stay theirs until
 *  the team replaces them: section 7), with the ids of those retired. */
export function retirements(
  s: CareerState,
  roll: Dice
): { state: CareerState; retired: number[] } {
  const rand = roll.roll('retire');
  const people = [...s.people];
  const teams = [...s.teams];
  const retired: number[] = [];
  for (const g of s.people) {
    if (!living(g) || !retires(g.role, age(g, s.day), rand)) continue;
    retired.push(g.id);
    if (g.contract && g.role !== 'manager' && g.role !== 'chairman') {
      const c = teams[g.contract.team];
      teams[c.id] = { ...c, staff: without(c.staff, g.id) };
    }
    people[g.id] = {
      ...g,
      retired: s.day,
      contract:
        g.role === 'manager' || g.role === 'chairman' ? g.contract : null,
    };
  }
  return { state: { ...s, people, teams }, retired };
}

/** Every living person's traits turned by a season's end, with what changed. */
export function traitTurns(
  s: CareerState,
  roll: Dice
): {
  state: CareerState;
  changes: { person: number; gained: string[]; lost: string[] }[];
} {
  const rand = roll.roll('traits');
  const changes: { person: number; gained: string[]; lost: string[] }[] = [];
  const people = s.people.map((g) => {
    if (!living(g)) return g;
    const next = turned(g.role, g.traits, rand);
    const gained = next.filter((t) => !g.traits.includes(t)),
      lost = g.traits.filter((t) => !next.includes(t));
    if (gained.length === 0 && lost.length === 0) return g;
    changes.push({ person: g.id, gained, lost });
    return { ...g, traits: next };
  });
  return { state: { ...s, people }, changes };
}

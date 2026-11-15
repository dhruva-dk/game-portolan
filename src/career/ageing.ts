// A season's end for every gull (Phase B sections 2.2 and 2.3): growth (or decline) by age, retirement, and traits
// gained or lost. Season's end calls them in its order (section 13): retirements, then growth, then traits. Each is
// one pass over the gulls a season, never a day; draws are one roll of the 'retire' and 'traits' streams a season,
// taken in gull id order.

import type { Dice } from './dice.ts';
import { mentors } from './effective.ts';
import type { Gull } from './roles.ts';
import { SCHOOL, age, grown, retires, stars, type Schooling } from './stars.ts';
import type { CareerState, Hands, Staff } from './state.ts';
import { staffOf } from './state.ts';
import { turned } from './traits.ts';

/** What a gull's growth reads of their crew: their role's building, a Mentor aboard, the sailing school. A free
 *  agent grows as at level 1, with no Mentor. */
export function schoolingOf(s: CareerState, g: Gull): Schooling {
  const crew = g.contract ? s.crews[g.contract.crew] : null;
  if (!crew) return { school: 1, mentor: false, sailingSchool: 0 };
  const building = SCHOOL[g.role];
  const level = building ? crew.buildings[building].level : 1;
  return {
    school: level,
    mentor: mentors(staffOf(crew).filter((id) => id !== g.id).map((id) => s.gulls[id])),
    sailingSchool: crew.buildings.sailingSchool.level,
  };
}

const living = (g: Gull) => g.retired === null && !g.player;

/** Every living gull grown by a season's end, by their age that day. */
export function seasonGrowth(s: CareerState): CareerState {
  const gulls = s.gulls.map((g) => (living(g) ? grown(g, age(g, s.day), s.season, schoolingOf(s, g)) : g));
  return { ...s, gulls };
}

/** A crew's staff with a gull taken off it (their place left empty for the crew to fill). */
export function without(staff: Staff, id: number): Staff {
  const hand = (h: Hands): Hands => ({ captain: h.captain === id ? null : h.captain, bosun: h.bosun === id ? null : h.bosun });
  return {
    ...staff,
    ships: [hand(staff.ships[0]), hand(staff.ships[1])],
    reserve: staff.reserve === id ? null : staff.reserve,
    shipwright: staff.shipwright === id ? null : staff.shipwright,
    scouts: staff.scouts.filter((x) => x !== id),
    flight: staff.flight.filter((x) => x !== id),
  };
}

/** Whether a gull's retirement is news to the player: on the player's crew, or a star (4 stars or more). */
export const newsworthy = (s: CareerState, g: Gull): boolean => g.contract?.crew === s.player?.crew || stars(g) >= 4;

/** The gulls who retire at this season's end, out of their crews (the manager's and elder's posts stay theirs until
 *  the crew replaces them: section 7), with the ids of those retired. */
export function retirements(s: CareerState, roll: Dice): { state: CareerState; retired: number[] } {
  const rand = roll.roll('retire');
  const gulls = [...s.gulls];
  const crews = [...s.crews];
  const retired: number[] = [];
  for (const g of s.gulls) {
    if (!living(g) || !retires(g.role, age(g, s.day), rand)) continue;
    retired.push(g.id);
    if (g.contract && g.role !== 'manager' && g.role !== 'elder') {
      const c = crews[g.contract.crew];
      crews[c.id] = { ...c, staff: without(c.staff, g.id) };
    }
    gulls[g.id] = { ...g, retired: s.day, contract: g.role === 'manager' || g.role === 'elder' ? g.contract : null };
  }
  return { state: { ...s, gulls, crews }, retired };
}

/** Every living gull's traits turned by a season's end, with what changed. */
export function traitTurns(s: CareerState, roll: Dice): { state: CareerState; changes: { gull: number; gained: string[]; lost: string[] }[] } {
  const rand = roll.roll('traits');
  const changes: { gull: number; gained: string[]; lost: string[] }[] = [];
  const gulls = s.gulls.map((g) => {
    if (!living(g)) return g;
    const next = turned(g.role, g.traits, rand);
    const gained = next.filter((t) => !g.traits.includes(t)), lost = g.traits.filter((t) => !next.includes(t));
    if (gained.length === 0 && lost.length === 0) return g;
    changes.push({ gull: g.id, gained, lost });
    return { ...g, traits: next };
  });
  return { state: { ...s, gulls }, changes };
}

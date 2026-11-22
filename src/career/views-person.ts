// What the people views (views-team, -profile, -offer, -market, -career) say of any person: their stars as the player's
// team sees them, their post, their contract, their stats and which way they head. Pure, read-side.

import type { Role, Status, Want } from '../office/command.ts';
import type { Range } from '../office/people.ts';
import { racesLeft } from './contracts.ts';
import { view, type Sight } from './knowledge.ts';
import type { Person } from './roles.ts';
import { age } from './stars.ts';
import type { CareerState, Team } from './state.ts';
import { TUNING } from './tuning.ts';
import { TIERS } from './views.ts';
import { moneyText } from './names.ts';

/** A ship of a team, as a line names her ("Ship 1" the first). */
export const shipName = (ship: number): string => `Ship ${ship + 1}`;

/** Each role's name, as a heading or a line says it. */
export const ROLE_NAMES: Readonly<Record<Role, string>> = {
  manager: 'Manager',
  driver: 'Driver',
  mechanic: 'Mechanic',
  designer: 'Designer',
  scout: 'Scout',
  pit: 'Pit crew',
  chairman: 'Chairman',
};
/** Each want, in words. */
export const WANT_NAMES: Readonly<Record<Want, string>> = {
  money: 'Money',
  status: 'Status',
  tier: 'A better tier',
  ambition: 'Ambition',
  security: 'Security',
  facilities: 'Facilities',
  home: 'Home colony',
};
/** Each stat's name ("talentEye" → "Talent eye"). */
export const statName = (k: string) =>
  k
    .replace(/([A-Z])/g, ' $1')
    .toLowerCase()
    .replace(/^./, (c) => c.toUpperCase());

/** A person's stars and potential as a team sees them, rounded to the half star. */
export function seen(
  s: CareerState,
  team: number,
  person: number,
  sight?: Sight
): { stars: Range; potential: Range; known: boolean; trait: string | null } {
  const v = view(s, team, person, sight);
  const half = (x: number) => Math.round(x * 2) / 2;
  const r = (x: readonly [number, number]): Range => ({
    lo: half(x[0]),
    hi: half(x[1]),
    known: v.known,
  });
  return {
    stars: r(v.stars),
    potential: r(v.potential),
    known: v.known,
    trait: v.trait,
  };
}
/** The post a person holds on their team ("Ship 2", "Reserve"), or what they are. */
export function postOf(s: CareerState, g: Person): string {
  const c = g.contract ? s.teams[g.contract.team] : null;
  if (!c) return g.retired !== null ? 'Retired' : 'Free agent';
  const ship = c.staff.ships.findIndex(
    (h) => h.driver === g.id || h.mechanic === g.id
  );
  if (ship >= 0) return shipName(ship);
  if (c.staff.reserve === g.id) return 'Reserve';
  return ROLE_NAMES[g.role];
}
/** When a contract ends, in words. */
export function endsText(s: CareerState, g: Person): string {
  const c = g.contract;
  if (!c) return '—';
  if (c.ends === null) return 'Open-ended';
  return c.ends <= s.season
    ? `This season (${racesLeft(s)} races)`
    : `Season ${c.ends + 1}`;
}
/** A person's team and tier in words. */
export function whereText(
  s: CareerState,
  g: Person
): { team: string; tier: string } {
  const c = g.contract ? s.teams[g.contract.team] : null;
  return c
    ? { team: c.name, tier: TIERS[c.tier] }
    : { team: 'Free agent', tier: 'No tier' };
}
/** A wage a race in words. */
export const wageText = (n: number) => `${moneyText(n)} a race`;
/** A day of the season in words ("Day 12"). */
export const dayText = (s: CareerState, day: number) =>
  `Day ${day - (s.calendar?.start ?? 0) + 1}`;
/** Years old. */
export const ageOf = (s: CareerState, g: Person) => age(g, s.day);

/** Which way a stat heads: up while they are short of their peak with room under their ceiling, down past it. */
export function heading(
  s: CareerState,
  g: Person,
  value: number,
  ceiling: number
): -1 | 0 | 1 {
  const years = age(g, s.day);
  if (years > g.peak) return -1;
  return ceiling > value + 0.5 ? 1 : 0;
}

/** The roles and the post a team holds open of each: the market's filter for each empty place. */
export function openPosts(
  c: Team
): { role: Role; status: Status; label: string }[] {
  const out: { role: Role; status: Status; label: string }[] = [];
  c.staff.ships.forEach((h, i) => {
    if (h.driver === null && !(c.player && i === 0))
      out.push({
        role: 'driver',
        status: 'ship',
        label: `A driver for ${shipName(i).toLowerCase()}`,
      });
  });
  if (c.staff.reserve === null)
    out.push({ role: 'driver', status: 'reserve', label: 'A reserve driver' });
  c.staff.ships.forEach((h, i) => {
    if (h.mechanic === null)
      out.push({
        role: 'mechanic',
        status: 'staff',
        label: `A mechanic for ${shipName(i).toLowerCase()}`,
      });
  });
  if (c.staff.designer === null)
    out.push({ role: 'designer', status: 'staff', label: 'A designer' });
  const nest = c.buildings.crowsNest.level;
  if (c.staff.scouts.length < nest)
    out.push({
      role: 'scout',
      status: 'staff',
      label: `A scout (${nest - c.staff.scouts.length} places)`,
    });
  const pit = TUNING.world.pit;
  if (c.staff.pit.length < pit)
    out.push({
      role: 'pit',
      status: 'staff',
      label: `Pit crew (${pit - c.staff.pit.length} short)`,
    });
  return out;
}

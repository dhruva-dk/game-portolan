// What the people views (views-crew, -profile, -offer, -market, -career) say of any gull: their stars as the player's
// crew sees them, their post, their contract, their stats and which way they head. Pure, read-side.

import type { Role, Status, Want } from '../office.ts';
import type { Range } from '../office-people.ts';
import { racesLeft } from './contracts.ts';
import { view, type Sight } from './knowledge.ts';
import type { Gull } from './roles.ts';
import { age } from './stars.ts';
import type { CareerState, Crew } from './state.ts';
import { TUNING } from './tuning.ts';
import { LEAGUES, coinText } from './views.ts';
import type { Job } from '../race.ts';

/** Each flight job's name. */
export const JOB_NAMES: Readonly<Record<Job, string>> = {
  mend: 'Mend',
  gust: 'Gust',
  stores: 'Stores',
  part: 'Part',
};

/** Each role's name, as a heading or a line says it. */
export const ROLE_NAMES: Readonly<Record<Role, string>> = {
  manager: 'Manager',
  captain: 'Captain',
  bosun: 'Bosun',
  shipwright: 'Shipwright',
  scout: 'Scout',
  flight: 'Flight',
  elder: 'Elder',
};
/** Each want, in words. */
export const WANT_NAMES: Readonly<Record<Want, string>> = {
  money: 'Money',
  status: 'Status',
  league: 'A better league',
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

/** A gull's stars and potential as a crew sees them, rounded to the half star. */
export function seen(
  s: CareerState,
  crew: number,
  gull: number,
  sight?: Sight
): { stars: Range; potential: Range; known: boolean; trait: string | null } {
  const v = view(s, crew, gull, sight);
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
/** Stars in words: "3.5" or "2–3.5". */
export const rangeText = (r: Range) =>
  r.lo === r.hi ? `${r.lo}` : `${r.lo}–${r.hi}`;

/** The post a gull holds on their crew ("Ship two", "Reserve", "Mend"), or what they are. */
export function postOf(s: CareerState, g: Gull): string {
  const c = g.contract ? s.crews[g.contract.crew] : null;
  if (!c) return g.retired !== null ? 'Retired' : 'Free agent';
  const ship = c.staff.ships.findIndex(
    (h) => h.captain === g.id || h.bosun === g.id
  );
  if (ship >= 0) return ship === 0 ? 'Ship one' : 'Ship two';
  if (c.staff.reserve === g.id) return 'Reserve';
  if (g.role === 'flight' && g.job) return JOB_NAMES[g.job];
  return ROLE_NAMES[g.role];
}
/** When a contract ends, in words. */
export function endsText(s: CareerState, g: Gull): string {
  const c = g.contract;
  if (!c) return '—';
  if (c.ends === null) return 'Open-ended';
  return c.ends <= s.season
    ? `This season (${racesLeft(s)} races)`
    : `Season ${c.ends + 1}`;
}
/** A gull's crew and league in words. */
export function whereText(
  s: CareerState,
  g: Gull
): { crew: string; league: string } {
  const c = g.contract ? s.crews[g.contract.crew] : null;
  return c
    ? { crew: c.name, league: LEAGUES[c.league] }
    : { crew: 'Free agent', league: 'No league' };
}
/** A wage a race in words. */
export const wageText = (n: number) => `${coinText(n)} a race`;
/** A day of the season in words ("Day 12"). */
export const dayText = (s: CareerState, day: number) =>
  `Day ${day - (s.calendar?.start ?? 0) + 1}`;
/** Years old. */
export const ageOf = (s: CareerState, g: Gull) => age(g, s.day);

/** Which way a stat heads: up while they are short of their peak with room under their ceiling, down past it. */
export function heading(
  s: CareerState,
  g: Gull,
  value: number,
  ceiling: number
): -1 | 0 | 1 {
  const years = age(g, s.day);
  if (years > g.peak) return -1;
  return ceiling > value + 0.5 ? 1 : 0;
}

/** The roles and the post a crew holds open of each: the market's filter for each empty place. */
export function openPosts(
  s: CareerState,
  c: Crew
): { role: Role; status: Status; label: string }[] {
  const out: { role: Role; status: Status; label: string }[] = [];
  if (c.staff.ships[1].captain === null)
    out.push({
      role: 'captain',
      status: 'ship',
      label: 'A captain for ship two',
    });
  if (c.staff.reserve === null)
    out.push({
      role: 'captain',
      status: 'reserve',
      label: 'A reserve captain',
    });
  c.staff.ships.forEach((h, i) => {
    if (h.bosun === null)
      out.push({
        role: 'bosun',
        status: 'staff',
        label: `A bosun for ship ${i === 0 ? 'one' : 'two'}`,
      });
  });
  if (c.staff.shipwright === null)
    out.push({ role: 'shipwright', status: 'staff', label: 'A shipwright' });
  const nest = c.buildings.crowsNest.level;
  if (c.staff.scouts.length < nest)
    out.push({
      role: 'scout',
      status: 'staff',
      label: `A scout (${nest - c.staff.scouts.length} places)`,
    });
  const flight = TUNING.world.flight;
  if (c.staff.flight.length < flight)
    out.push({
      role: 'flight',
      status: 'staff',
      label: `Flight (${flight - c.staff.flight.length} short)`,
    });
  return out;
}

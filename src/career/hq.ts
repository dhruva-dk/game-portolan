// The headquarters (Phase B section 9, D29): nine buildings, levels 1 to 3 (every team holds each at level 1 at least), any
// number under way at once. Each level has a cost, days to build and an upkeep a race (TUNING.hq). What each
// level gives is read where it acts, through the functions here: the factory's improvement points and build days, the
// drawing loft's slots, design days and designers' growth (stars.ts SCHOOL), the test tank's and the foundry's
// component tiers (components.ts), the sailing school's drivers' growth, the pit crew loft's fatigue recovery
// (pit.ts recovery), the crow's nest's scouts and scouting days (staff.ts scoutDays), the fish market's money and
// the landing pad's sponsor tiers.

import type { Building } from '../office/command.ts';
import { canSpend, paid } from './balance.ts';
import { accept, refuse, why, type Check, type Handlers } from './command.ts';
import { mine, post } from './post.ts';
import { schedule, type Event } from './queue.ts';
import type { CareerState, Team } from './state.ts';
import { TUNING } from './tuning.ts';
import { BUILDINGS } from './world.ts';

const K = TUNING.hq;
export const TOP = 3;

/** A level's index into a by-level table (level 1 → 0), kept to the table. */
const at = (level: number): number => Math.min(TOP - 1, Math.max(0, level - 1));

/** What raising a building to a level costs, how many days it takes, and its upkeep a race at that level. */
export const buildCost = (b: Building, level: number): number =>
  K.works[b].cost[at(level)];
export const buildDays = (b: Building, level: number): number =>
  K.works[b].days[at(level)];
export const upkeepAt = (b: Building, level: number): number =>
  K.works[b].upkeep[at(level)];

/** A team's upkeep a race: every building at its level. */
export const upkeep = (c: Team): number =>
  BUILDINGS.reduce((a, b) => a + upkeepAt(b, c.buildings[b].level), 0);

/** The factory: improvement points a day. */
export const factoryPoints = (c: Team): number =>
  K.points[at(c.buildings.factory.level)];
/** The factory: days to build a designed part (7 − level, at least 1). */
export const partBuildDays = (c: Team): number =>
  Math.max(1, TUNING.design.build - c.buildings.factory.level);
/** The drawing loft: design slots, and design days ×. */
export const designSlots = (c: Team): number =>
  K.slots[at(c.buildings.drawingLoft.level)];
export const loftFactor = (c: Team): number =>
  K.loft[at(c.buildings.drawingLoft.level)];
/** The fish market: money a race, by tier. */
export const fishIncome = (c: Team): number =>
  Math.round(
    K.fish[Math.min(K.fish.length - 1, c.tier)] *
      K.fishLevel[at(c.buildings.fishMarket.level)]
  );
/** The landing pad: the highest sponsor tier a team may sign. */
export const sponsorGrade = (c: Team): number => c.buildings.landingPad.level;

/** Whether a team may raise a building a level now. */
export function buildCheck(s: CareerState, team: number, b: Building): Check {
  if (!BUILDINGS.includes(b)) return why('building', 'No such building.');
  const w = s.teams[team].buildings[b];
  if (w.next !== null)
    return why('underWay', 'That building is already under way.');
  if (w.level >= TOP)
    return why('top', 'That building is at its highest level.');
  if (!canSpend(s.teams[team], buildCost(b, w.level + 1)))
    return why(
      'balance',
      'The chairman will not let the balance fall that far.'
    );
  return null;
}

/** A state with a building's next level begun (checked first): paid, and its finishing scheduled. */
export function begun(s: CareerState, team: number, b: Building): CareerState {
  const c = s.teams[team];
  const level = c.buildings[b].level + 1;
  const done = s.day + buildDays(b, level);
  const teams = [...s.teams];
  teams[team] = {
    ...c,
    buildings: {
      ...c.buildings,
      [b]: { level: c.buildings[b].level, next: { level, done } },
    },
  };
  const out = paid({ ...s, teams }, team, buildCost(b, level), {
    kind: 'building',
    what: `${b} to level ${level}`,
  });
  return schedule(out, done, { kind: 'building', team, building: b });
}

/** A building's works finish: its level rises, and the player is mailed. */
export function finished(
  s: CareerState,
  e: Extract<Event, { kind: 'building' }>
): CareerState {
  const c = s.teams[e.team];
  const b = e.building as Building;
  const w = c.buildings[b];
  if (!w?.next) return s;
  const teams = [...s.teams];
  teams[e.team] = {
    ...c,
    buildings: { ...c.buildings, [b]: { level: w.next.level, next: null } },
  };
  return post(
    { ...s, teams },
    {
      team: e.team,
      category: 'hq',
      sender: null,
      kind: 'buildingFinished',
      slots: { building: b, level: w.next.level },
      links: [{ to: 'building', id: b }],
    }
  );
}

export const BUILDING: Handlers = {
  Build: (s, c) => {
    const me = mine(s);
    if (me === null)
      return refuse(
        'sacked',
        'You have no team: take one of the posts offered.'
      );
    const no = buildCheck(s, me, c.building);
    return no ? refuse(no.code, no.sentence) : accept(begun(s, me, c.building));
  },
};

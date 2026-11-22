// The rookery (Phase B section 9, D29): nine buildings, levels 1 to 3 (every crew holds each at level 1 at least), any
// number under way at once. Each level has a cost, days to build and an upkeep a race (TUNING.rookery). What each
// level gives is read where it acts, through the functions here: the factory's yard points and build days, the
// drawing loft's slots, design days and shipwrights' growth (stars.ts SCHOOL), the test tank's and the foundry's
// component tiers (components.ts), the sailing school's captains' growth, the flight loft's fatigue recovery
// (service.ts recovery), the crow's nest's scouts and scouting days (staff.ts scoutDays), the fish market's Coin and
// the landing pad's patron tiers.

import type { Building } from '../office.ts';
import { canSpend, paid } from './coin.ts';
import { accept, refuse, why, type Check, type Handlers } from './command.ts';
import { mine, post } from './post.ts';
import { schedule, type Event } from './queue.ts';
import type { CareerState, Crew } from './state.ts';
import { TUNING } from './tuning.ts';
import { BUILDINGS } from './world.ts';

const K = TUNING.rookery;
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

/** A crew's upkeep a race: every building at its level. */
export const upkeep = (c: Crew): number =>
  BUILDINGS.reduce((a, b) => a + upkeepAt(b, c.buildings[b].level), 0);

/** The factory: yard points a day. */
export const factoryPoints = (c: Crew): number =>
  K.points[at(c.buildings.factory.level)];
/** The factory: days to build a designed part (7 − level, at least 1). */
export const partBuildDays = (c: Crew): number =>
  Math.max(1, TUNING.design.build - c.buildings.factory.level);
/** The drawing loft: design slots, and design days ×. */
export const designSlots = (c: Crew): number =>
  K.slots[at(c.buildings.drawingLoft.level)];
export const loftFactor = (c: Crew): number =>
  K.loft[at(c.buildings.drawingLoft.level)];
/** The fish market: Coin a race, by league. */
export const fishCoin = (c: Crew): number =>
  Math.round(
    K.fish[Math.min(K.fish.length - 1, c.league)] *
      K.fishLevel[at(c.buildings.fishMarket.level)]
  );
/** The landing pad: the highest patron tier a crew may sign. */
export const patronTier = (c: Crew): number => c.buildings.landingPad.level;

/** Whether a crew may raise a building a level now. */
export function buildCheck(s: CareerState, crew: number, b: Building): Check {
  if (!BUILDINGS.includes(b)) return why('building', 'No such building.');
  const w = s.crews[crew].buildings[b];
  if (w.next !== null)
    return why('underWay', 'That building is already under way.');
  if (w.level >= TOP)
    return why('top', 'That building is at its highest level.');
  if (!canSpend(s.crews[crew], buildCost(b, w.level + 1)))
    return why('coin', 'The elder will not let the coin fall that far.');
  return null;
}

/** A state with a building's next level begun (checked first): paid, and its finishing scheduled. */
export function begun(s: CareerState, crew: number, b: Building): CareerState {
  const c = s.crews[crew];
  const level = c.buildings[b].level + 1;
  const done = s.day + buildDays(b, level);
  const crews = [...s.crews];
  crews[crew] = {
    ...c,
    buildings: {
      ...c.buildings,
      [b]: { level: c.buildings[b].level, next: { level, done } },
    },
  };
  const out = paid({ ...s, crews }, crew, buildCost(b, level), {
    kind: 'building',
    what: `${b} to level ${level}`,
  });
  return schedule(out, done, { kind: 'building', crew, building: b });
}

/** A building's works finish: its level rises, and the player is mailed. */
export function finished(
  s: CareerState,
  e: Extract<Event, { kind: 'building' }>
): CareerState {
  const c = s.crews[e.crew];
  const b = e.building as Building;
  const w = c.buildings[b];
  if (!w?.next) return s;
  const crews = [...s.crews];
  crews[e.crew] = {
    ...c,
    buildings: { ...c.buildings, [b]: { level: w.next.level, next: null } },
  };
  return post(
    { ...s, crews },
    {
      crew: e.crew,
      category: 'rookery',
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
        'You have no crew: take one of the posts offered.'
      );
    const no = buildCheck(s, me, c.building);
    return no ? refuse(no.code, no.sentence) : accept(begun(s, me, c.building));
  },
};

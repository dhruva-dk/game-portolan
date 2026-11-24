// The headquarters, a modern campus after MM's: nine buildings, levels 0 (not built) to 5. The core five (TUNING.hq
// core) stand at level 1 at least on every team; the rest may be built from nothing. A championship caps how high a
// building may rise (TUNING.hq.cap), a building may need another at the level below it first (TUNING.hq.requires),
// only so many projects are under way at once (crews, by championship), and one dearer than a share of the season's
// budget wants the chairman's confidence (approve). Each level has a cost, days to build and an upkeep a race, and
// what it gives is read where it acts, through the functions here (each table indexed by level 0..5): the factory's
// improvement points and build days, the design centre's slots, design days and designers' growth (stars.ts SCHOOL),
// the towing tank's and the composites plant's component tiers (components.ts), the driver simulator's drivers'
// growth, the pit crew centre's fatigue recovery (pit.ts recovery), the scouting department's scouts and scouting
// days (staff.ts scoutDays), the commercial centre's money and the hospitality suite's sponsor grades and their pay.

import type { Building } from '../office/command.ts';
import { canSpend, paid } from './balance.ts';
import { accept, refuse, why, type Check, type Handlers } from './command.ts';
import { mine, post } from './post.ts';
import { schedule, type Event } from './queue.ts';
import type { CareerState, Team } from './state.ts';
import { TUNING } from './tuning.ts';
import { BUILDINGS } from './world.ts';

const K = TUNING.hq;

/** Each building's name. */
export const BUILT: Readonly<Record<Building, string>> = {
  factory: 'Factory',
  designCentre: 'Design Centre',
  towingTank: 'Towing Tank',
  compositesPlant: 'Composites Plant',
  simulator: 'Driver Simulator',
  pitCentre: 'Pit Crew Training Centre',
  scoutingCentre: 'Scouting Department',
  commercialCentre: 'Commercial Centre',
  hospitality: 'Hospitality Suite',
};

/** A level kept to the tables (0..5). */
const lv = (level: number): number => Math.min(K.top, Math.max(0, level));

/** A level as a building's growth, recovery and draw read it: 0..5 onto the scale 0..3 they were tuned on. */
export const rated = (level: number): number => K.scale[lv(level)];

/** What raising a building to a level costs, how many days it takes, and its upkeep a race at that level. */
export const buildCost = (b: Building, level: number): number =>
  K.works[b].cost[lv(level)];
export const buildDays = (b: Building, level: number): number =>
  K.works[b].days[lv(level)];
export const upkeepAt = (b: Building, level: number): number =>
  K.works[b].upkeep[lv(level)];

/** A team's upkeep a race: every building at its level. */
export const upkeep = (c: Team): number =>
  BUILDINGS.reduce((a, b) => a + upkeepAt(b, c.buildings[b].level), 0);

/** The highest level a team's championship lets a building rise to. */
export const capOf = (c: Team): number =>
  Math.min(K.top, K.cap[Math.min(K.cap.length - 1, c.tier)]);
/** How many projects a team may have under way at once, by its championship. */
const crewsOf = (c: Team): number =>
  K.crews[Math.min(K.crews.length - 1, c.tier)];
/** A team's projects under way. */
const underWay = (c: Team): number =>
  BUILDINGS.filter((b) => c.buildings[b].next !== null).length;
/** The building a building needs a level below it first, if any. */
export const needs = (b: Building): Building | null => K.requires[b];

/** The factory: improvement points a day. */
export const factoryPoints = (c: Team): number =>
  K.points[lv(c.buildings.factory.level)];
/** The factory: days to build a designed part (7 − level, at least 1). */
export const partBuildDays = (c: Team): number =>
  Math.max(1, TUNING.design.build - c.buildings.factory.level);
/** The design centre: design slots, and design days ×. */
export const designSlots = (c: Team): number =>
  K.slots[lv(c.buildings.designCentre.level)];
export const loftFactor = (c: Team): number =>
  K.loft[lv(c.buildings.designCentre.level)];
/** The commercial centre: money a race, by tier. */
export const fishIncome = (c: Team): number =>
  Math.round(
    K.fish[Math.min(K.fish.length - 1, c.tier)] *
      K.fishLevel[lv(c.buildings.commercialCentre.level)]
  );
/** The hospitality suite: the highest sponsor grade a team may sign, and its sponsors' pay ×. */
export const sponsorGrade = (c: Team): number =>
  K.grade[lv(c.buildings.hospitality.level)];
export const hosted = (c: Team): number =>
  K.hosted[lv(c.buildings.hospitality.level)];
/** The scouting department: scouts a team may keep. */
export const scoutsOf = (c: Team): number =>
  K.scouts[lv(c.buildings.scoutingCentre.level)];

/** Whether a team may raise a building a level now. */
export function buildCheck(s: CareerState, team: number, b: Building): Check {
  if (!BUILDINGS.includes(b)) return why('building', 'No such building.');
  const c = s.teams[team],
    w = c.buildings[b],
    level = w.level + 1;
  if (w.next !== null)
    return why('underWay', 'That building is already under way.');
  if (w.level >= K.top)
    return why('top', 'That building is at its highest level.');
  if (w.level >= capOf(c))
    return why(
      'cap',
      `In this championship no building rises above level ${capOf(c)}.`
    );
  const parent = needs(b);
  if (parent && c.buildings[parent].level < level - 1)
    return why(
      'requires',
      `The ${BUILT[b]} needs the ${BUILT[parent]} at level ${level - 1} first.`
    );
  if (underWay(c) >= crewsOf(c))
    return why(
      'crews',
      `The contractors are busy: ${crewsOf(c)} projects under way at once at most.`
    );
  const cost = buildCost(b, level);
  if (cost > c.budget * K.approve.share && c.confidence < K.approve.confidence)
    return why(
      'approve',
      `The chairman will not approve a project this size with confidence under ${K.approve.confidence}.`
    );
  if (!canSpend(c, cost))
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
  const b = e.building;
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

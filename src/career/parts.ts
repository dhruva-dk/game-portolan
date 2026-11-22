// A team's parts: what a part gives a race card, fitting a part to a ship and
// the ships' politics, wear and Feedback after a race, spec parts, and the
// season's carry-over.
//
// Every ship carries one part of each of the six types. A part fitted to a ship
// when it is better than every other ship's of that type is a new part; each
// team tracks who got the last new part of each type, and a second in a row to
// the same ship costs the other ships' drivers morale.

import { PARTS, type Fitted, type PartType, type RaceResult } from '../race.ts';
import { ZONES, type Zone } from '../kinds.ts';
import { SHIPS, type Ship } from '../office/command.ts';
import {
  accept,
  refuse,
  whole,
  why,
  type Check,
  type Handlers,
} from './command.ts';
import { effective } from './effective.ts';
import { improvementTo } from './improvement.ts';
import { moraleIn } from './morale.ts';
import { mine } from './post.ts';
import { hasRole } from './roles.ts';
import { feedbackPoints, feedbackTarget } from './staff.ts';
import {
  teamOf,
  withPeople,
  withTeam,
  type CareerState,
  type Part,
  type Team,
} from './state.ts';
import { termsFor } from './suppliers.ts';
import { TUNING } from './tuning.ts';

const P = TUNING.parts;

/**
 * A part's performance as fitted (race.ts Fitted): so many times the spec
 * part's, 1 at the standard part's perf, ± TUNING.parts.handling over the
 * whole of perf's 0 to 1000.
 */
export const performanceOf = (perf: number): number =>
  1 + (P.handling * (perf - P.standard.perf)) / 1000;

/** What a ship sails with of a type she has no part of: nothing fitted. */
const BARE: Fitted = { performance: performanceOf(0), reliability: 0 };

/** A part as the race card carries it: its performance, and its reliability as worn (× its condition). */
export const fittedOf = (p: Part): Fitted => ({
  performance: performanceOf(p.perf),
  reliability: p.reliability * p.condition,
});

/** A ship's six parts as the race card carries them. */
export function fittedParts(
  c: Team,
  ship: Ship
): Readonly<Record<PartType, Fitted>> {
  const of = (t: PartType): Fitted => {
    const p = c.parts.find((x) => x.ship === ship && x.type === t);
    return p ? fittedOf(p) : BARE;
  };
  return {
    sails: of('sails'),
    rigging: of('rigging'),
    rudder: of('rudder'),
    hull: of('hull'),
    keel: of('keel'),
    mounts: of('mounts'),
  };
}

/** The zone of a ship each part's wear shows in (kinds.ts ZONES): a fault there wears the parts that make it. */
const ZONE: Readonly<Record<PartType, Zone>> = {
  sails: 'rigging',
  rigging: 'rigging',
  rudder: 'rudder',
  hull: 'waterline',
  keel: 'waterline',
  mounts: 'deck',
};

/** A standard part of a spec type (never designed or improved). */
export const standardPart = (
  id: number,
  type: PartType,
  ship: Ship | null
): Part => ({
  id,
  type,
  perf: P.standard.perf,
  perfMax: P.standard.perf,
  reliability: P.standard.reliability,
  reliabilityMax: P.standard.reliability,
  risk: 0,
  condition: 1,
  components: [],
  ship,
  forNext: false,
  spec: true,
  cost: 0,
});

/** The stand-in a ship sails with when her part of a type is gone and the team has no spare. */
export const sparePart = (id: number, type: PartType, ship: Ship): Part => ({
  ...standardPart(id, type, ship),
  perf: P.spare.perf,
  perfMax: P.spare.perf + TUNING.design.headroom,
  reliability: P.spare.reliability,
  reliabilityMax: P.spare.reliability + 0.1,
  spec: false,
});

const NO_BARE = why(
  'bare',
  'A ship sails with one part of each type: fit another in its place instead.'
);

/** Whether the player's team may fit a part to a ship. */
export function fitCheck(
  s: CareerState,
  team: number,
  part: number,
  ship: Ship | null
): Check {
  const p = s.teams[team]?.parts.find((x) => x.id === part);
  if (!p) return why('part', "That part is not your team's.");
  if (ship === null) return NO_BARE;
  if (!whole(ship, 0, SHIPS.length - 1)) return why('ship', 'No such ship.');
  if (s.race?.started) return why('racing', 'The race has begun.');
  if (p.forNext) return why('forNext', 'That part is built for next season.');
  if (p.ship === ship)
    return why('fitted', 'That part is fitted to that ship already.');
  return null;
}

/**
 * A state with a part fitted to a ship (checked first). Her old part of the
 * type goes to where the fitted one came from (another ship, a swap), or to
 * the spares. A new part (from the spares, better than every other ship's) is
 * recorded, and a second in a row to the same ship costs the other ships'
 * drivers morale.
 */
export function fitted(
  s: CareerState,
  team: number,
  part: number,
  ship: Ship
): CareerState {
  let out = improvementTo(s, team);
  const c = teamOf(out, team);
  const p = c.parts.find((x) => x.id === part);
  if (!p) return s;
  const old = c.parts.find((x) => x.ship === ship && x.type === p.type) ?? null;
  const others = c.parts.filter(
    (x) => x.ship !== null && x.ship !== ship && x.type === p.type
  );
  const parts = c.parts.map((x) =>
    x.id === p.id
      ? { ...x, ship }
      : old && x.id === old.id
        ? { ...x, ship: p.ship }
        : x
  );
  const isNew = p.ship === null && others.every((x) => p.perf > x.perf);
  let next: Team = { ...c, parts };
  if (isNew) {
    const twice = c.lastNew[p.type] === ship;
    next = { ...next, lastNew: { ...c.lastNew, [p.type]: ship } };
    if (twice)
      out = withPeople(
        out,
        c.staff.ships.flatMap((h, k) => {
          const g =
            k === ship || h.driver === null ? null : out.people[h.driver];
          return g
            ? [{ ...g, morale: moraleIn(g.morale - P.newPartMorale) }]
            : [];
        })
      );
    out = { ...out, flags: { ...out.flags, [`newPart:${team}`]: out.day } };
  }
  return withTeam(out, next);
}

/** A part's condition after a race: 0.1 lost for sailing it and 0.05 a fault's level, × its supplier's wear. */
export const worn = (condition: number, faults: number, wear: number): number =>
  Math.max(
    0,
    Math.round((condition - (P.wear + P.faultWear * faults) * wear) * 1000) /
      1000
  );

/**
 * A state after a race for one team's parts: each ship that sailed (`ids`: her
 * id in the result, by ship; null: she did not sail) wears her fitted parts by
 * the race and by the faults of the zone each part makes, and her driver's
 * Feedback goes to her part furthest below its maximum. Called for every team
 * as the round closes.
 */
export function partsAfterRace(
  s: CareerState,
  team: number,
  ids: readonly (number | null)[],
  result: RaceResult
): CareerState {
  const out = improvementTo(s, team);
  const c = teamOf(out, team);
  let parts = c.parts;
  for (const ship of SHIPS) {
    const id = ids[ship] ?? null;
    if (id === null) continue;
    const faults = (t: PartType) =>
      result.faults
        .filter((f) => f.id === id && ZONES[f.zone] === ZONE[t])
        .reduce((a, f) => a + f.level, 0);
    parts = parts.map((p) =>
      p.ship === ship
        ? {
            ...p,
            condition: worn(
              p.condition,
              faults(p.type),
              termsFor(c.suppliers, p.type).wear
            ),
          }
        : p
    );
    const driver = c.staff.ships[ship]?.driver ?? null;
    const g = driver === null ? undefined : out.people[driver];
    const target = feedbackTarget(parts.filter((p) => p.ship === ship));
    if (!g || !hasRole(g, 'driver') || !target) continue;
    const points = feedbackPoints(effective(g, null).feedback);
    parts = parts.map((p) =>
      p.id === target.id
        ? {
            ...p,
            perf: Math.min(p.perfMax, Math.round((p.perf + points) * 10) / 10),
          }
        : p
    );
  }
  return withTeam(out, { ...c, parts });
}

/**
 * A team's parts carried into the next season under its championship's next
 * rules: designs for next season in full; the rest at TUNING.parts.carry of
 * performance and maximum with risk stripped; fitted parts and the best spare
 * of each type kept; spec types' parts replaced by standard ones, and standard
 * ones of a type no longer spec made ordinary. Called for every team at the
 * season's end, after the rules turn. A rival fits its best part of each type.
 */
export function carried(s: CareerState, team: number): CareerState {
  const out = improvementTo(s, team);
  const c = teamOf(out, team);
  const spec = new Set(out.championships[c.tier]?.rules.spec ?? []);
  let id = out.ids.part;
  const kept: Part[] = [];
  for (const type of PARTS) {
    const mineOf = c.parts.filter((p) => p.type === type);
    if (spec.has(type)) {
      for (const ship of SHIPS) kept.push(standardPart(id++, type, ship));
      continue;
    }
    const designed = mineOf
      .filter((p) => p.forNext)
      .map((p): Part => ({ ...p, forNext: false }));
    const turned = mineOf
      .filter((p) => !p.forNext)
      .map(
        (p): Part =>
          p.spec
            ? {
                ...p,
                spec: false,
                perfMax: p.perf,
                reliabilityMax: p.reliability,
              }
            : {
                ...p,
                perf: Math.round(p.perf * P.carry),
                perfMax: Math.round(p.perfMax * P.carry),
                risk: 0,
                condition: 1,
              }
      );
    const spares = turned
      .filter((p) => p.ship === null)
      .sort((a, b) => b.perf - a.perf || a.id - b.id);
    kept.push(
      ...turned.filter((p) => p.ship !== null),
      ...spares.slice(0, P.spares),
      ...designed
    );
  }
  const next: Team = {
    ...c,
    parts: kept.sort((a, b) => a.id - b.id),
    improvement: c.improvement.filter((y) =>
      kept.some((p) => p.id === y.part && p.ship !== null)
    ),
  };
  return {
    ...withTeam(out, c.player ? next : bestFitted(next)),
    ids: { ...out.ids, part: id },
  };
}

/**
 * A team with its best part of each type on its first ship, the next best on
 * its second, and so on (a rival's allocation: better parts to its first
 * drivers), parts built for next season aside.
 */
export function bestFitted(c: Team): Team {
  const ship = new Map<number, Ship | null>();
  for (const type of PARTS)
    c.parts
      .filter((p) => p.type === type && !p.forNext)
      .sort((a, b) => b.perf - a.perf || a.id - b.id)
      .forEach((p, k) => ship.set(p.id, SHIPS[k] ?? null));
  return {
    ...c,
    parts: c.parts.map((p) =>
      ship.has(p.id) ? { ...p, ship: ship.get(p.id) ?? null } : p
    ),
  };
}

export const FITTING: Handlers = {
  FitPart: (s, c) => {
    const me = mine(s);
    if (me === null)
      return refuse(
        'sacked',
        'You have no team: take one of the posts offered.'
      );
    if (!whole(c.part, 0, Number.MAX_SAFE_INTEGER))
      return refuse('part', "That part is not your team's.");
    const no = fitCheck(s, me, c.part, c.ship);
    if (no) return refuse(no.code, no.sentence);
    return c.ship === null
      ? refuse(NO_BARE.code, NO_BARE.sentence)
      : accept(fitted(s, me, c.part, c.ship));
  },
};

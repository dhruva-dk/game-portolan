// A crew's parts (Phase B sections 8.1, 8.4, 8.6, 8.7, D11): what a part gives a race card, fitting a part to a ship
// and the two ships' politics, wear and Feedback after a race, spec parts, and the season's carry-over.
//
// Every ship carries one part of each of the six types. A part fitted to one ship when it is better than the other
// ship's of that type is a new part; each crew tracks who got the last new part of each type, and a second in a row
// to ship one costs ship two's captain morale.

import type { Fitted, Handling, PartType, RaceResult } from '../race.ts';
import type { Ship } from '../office.ts';
import {
  accept,
  refuse,
  whole,
  why,
  type Check,
  type Handlers,
} from './command.ts';
import { TYPES } from './components.ts';
import { effective } from './effective.ts';
import { moraleIn } from './morale.ts';
import { mine } from './post.ts';
import type { GullOf } from './roles.ts';
import { feedbackPoints, feedbackTarget } from './staff.ts';
import type { CareerState, Crew, Part } from './state.ts';
import { termsFor } from './suppliers.ts';
import { TUNING } from './tuning.ts';
import { yardTo } from './yard.ts';

const P = TUNING.parts;

/** A part's Handling factor: 1 + 0.15 × perf / 1000 (spread and reload fall: 1 − …). */
export const handlingFactor = (perf: number): number =>
  1 + (P.handling * perf) / 1000;

/** A ship's Handling from the spec ship's and her fitted parts (Phase A section 7): sails top, rigging gather, rudder
 *  turn and answer, hull hull, keel spread, mounts reload. A type she lacks counts as performance 0. */
export function handlingFrom(spec: Handling, parts: readonly Part[]): Handling {
  const perf = (t: PartType) => parts.find((p) => p.type === t)?.perf ?? 0;
  const up = (t: PartType) => handlingFactor(perf(t));
  const down = (t: PartType) => 1 - (P.handling * perf(t)) / 1000;
  return {
    top: spec.top * up('sails'),
    gather: spec.gather * up('rigging'),
    turn: spec.turn * up('rudder'),
    answer: spec.answer * up('rudder'),
    hull: spec.hull * up('hull'),
    spread: spec.spread * down('keel'),
    reload: spec.reload * down('mounts'),
  };
}

/** A part as the race card carries it. */
export const fittedOf = (p: Part): Fitted => ({
  type: p.type,
  reliability: p.reliability,
  condition: p.condition,
});

/** A ship's fitted parts, in TYPES order. */
export const shipParts = (c: Crew, ship: Ship): Part[] =>
  TYPES.map((t) => c.parts.find((p) => p.ship === ship && p.type === t)).filter(
    (p): p is Part => !!p
  );

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

/** The stand-in a ship sails with when her part of a type is gone and the crew has no spare. */
export const sparePart = (id: number, type: PartType, ship: Ship): Part => ({
  ...standardPart(id, type, ship),
  perf: P.spare.perf,
  perfMax: P.spare.perf + TUNING.design.headroom,
  reliability: P.spare.reliability,
  reliabilityMax: P.spare.reliability + 0.1,
  spec: false,
});

/** Whether the player's crew may fit a part to a ship. */
export function fitCheck(
  s: CareerState,
  crew: number,
  part: number,
  ship: Ship | null
): Check {
  const c = s.crews[crew];
  const p = c.parts.find((x) => x.id === part);
  if (!p) return why('part', "That part is not your crew's.");
  if (ship === null)
    return why(
      'bare',
      'A ship sails with one part of each type: fit another in its place instead.'
    );
  if (ship !== 0 && ship !== 1) return why('ship', 'No such ship.');
  if (s.race?.started) return why('racing', 'The race has begun.');
  if (p.forNext) return why('forNext', 'That part is built for next season.');
  if (p.ship === ship)
    return why('fitted', 'That part is fitted to that ship already.');
  return null;
}

/** A state with a part fitted to a ship (checked first). Her old part of the type goes to where the fitted one came
 *  from (the other ship, a swap), or to the spares. A new part (better than the other ship's) is recorded, and a second
 *  in a row to ship one costs ship two's captain morale. */
export function fitted(
  s: CareerState,
  crew: number,
  part: number,
  ship: Ship
): CareerState {
  let out = yardTo(s, crew);
  const c = out.crews[crew];
  const p = c.parts.find((x) => x.id === part)!;
  const old = c.parts.find((x) => x.ship === ship && x.type === p.type) ?? null;
  const other =
    c.parts.find(
      (x) => x.ship === 1 - ship && x.type === p.type && x.id !== p.id
    ) ?? null;
  const parts = c.parts.map((x) =>
    x.id === p.id
      ? { ...x, ship }
      : old && x.id === old.id
        ? { ...x, ship: p.ship }
        : x
  );
  const isNew = p.ship === null && (other === null || p.perf > other.perf);
  let next: Crew = { ...c, parts };
  if (isNew) {
    const twice = ship === 0 && c.lastNew[p.type] === 0;
    next = { ...next, lastNew: { ...c.lastNew, [p.type]: ship } };
    const captain = c.staff.ships[1].captain;
    if (twice && captain !== null) {
      const g = out.gulls[captain];
      const gulls = [...out.gulls];
      gulls[captain] = { ...g, morale: moraleIn(g.morale - P.newPartMorale) };
      out = { ...out, gulls };
    }
    out = { ...out, flags: { ...out.flags, [`newPart:${crew}`]: out.day } };
  }
  const crews = [...out.crews];
  crews[crew] = next;
  return { ...out, crews };
}

/** A part's condition after a race: 0.1 lost for sailing it and 0.05 a fault, × its supplier's wear. */
export const worn = (condition: number, faults: number, wear: number): number =>
  Math.max(
    0,
    Math.round((condition - (P.wear + P.faultWear * faults) * wear) * 1000) /
      1000
  );

/** A state after a race for one crew's parts: each ship that sailed (`ids`: her id in the result, by ship) wears her
 *  fitted parts by the race and their faults, and her captain's Feedback goes to her part furthest below its maximum.
 *  Section 13 calls it for every crew as the round closes. */
export function partsAfterRace(
  s: CareerState,
  crew: number,
  ids: readonly [number | null, number | null],
  result: RaceResult
): CareerState {
  const out = yardTo(s, crew);
  const c = out.crews[crew];
  let parts = c.parts;
  ([0, 1] as const).forEach((ship) => {
    const id = ids[ship];
    if (id === null) return;
    const faults = (t: PartType) =>
      result.faults.filter((f) => f.id === id && f.type === t).length;
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
    const captain = c.staff.ships[ship].captain;
    if (captain === null) return;
    const target = feedbackTarget(parts.filter((p) => p.ship === ship));
    if (!target) return;
    const points = feedbackPoints(
      effective(out.gulls[captain] as GullOf<'captain'>, null).feedback
    );
    parts = parts.map((p) =>
      p.id === target.id
        ? {
            ...p,
            perf: Math.min(p.perfMax, Math.round((p.perf + points) * 10) / 10),
          }
        : p
    );
  });
  const crews = [...out.crews];
  crews[crew] = { ...c, parts };
  return { ...out, crews };
}

/** A crew's parts carried into the next season under its league's next rules: designs for next season in full; the
 *  rest at 0.6 of performance and maximum with risk stripped; fitted parts and the best spare of each type kept; spec
 *  types' parts replaced by standard ones, and standard ones of a type no longer spec made ordinary. Section 13 calls
 *  it for every crew at the season's end, after the rules turn. A rival fits its best part of each type. */
export function carried(s: CareerState, crew: number): CareerState {
  const out = yardTo(s, crew);
  const c = out.crews[crew];
  const spec = new Set(out.leagues[c.league].rules.spec);
  let id = out.ids.part;
  const kept: Part[] = [];
  for (const type of TYPES) {
    const mineOf = c.parts.filter((p) => p.type === type);
    if (spec.has(type)) {
      for (const ship of [0, 1] as const)
        kept.push(standardPart(id++, type, ship));
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
  let next: Crew = {
    ...c,
    parts: kept.sort((a, b) => a.id - b.id),
    yard: c.yard.filter((y) =>
      kept.some((p) => p.id === y.part && p.ship !== null)
    ),
  };
  if (!c.player) next = bestFitted(next);
  const crews = [...out.crews];
  crews[crew] = next;
  return { ...out, crews, ids: { ...out.ids, part: id } };
}

/** A crew with its best part of each type on ship one and the next best on ship two (a rival's allocation: better
 *  parts to ship one's captain, who is the crew's first), forNext parts aside. */
export function bestFitted(c: Crew): Crew {
  const parts = c.parts.map((p) => ({ ...p }));
  for (const type of TYPES) {
    const ranked = parts
      .filter((p) => p.type === type && !p.forNext)
      .sort((a, b) => b.perf - a.perf || a.id - b.id);
    for (const p of ranked) p.ship = null;
    if (ranked[0]) ranked[0].ship = 0;
    if (ranked[1]) ranked[1].ship = 1;
  }
  return { ...c, parts };
}

/** Whether every ship of a crew carries one part of each type (an invariant). */
export const fullyFitted = (c: Crew): boolean =>
  ([0, 1] as const).every((ship) =>
    TYPES.every(
      (t) => c.parts.filter((p) => p.ship === ship && p.type === t).length === 1
    )
  );

export const FITTING: Handlers = {
  FitPart: (s, c) => {
    const me = mine(s);
    if (me === null)
      return refuse(
        'sacked',
        'You have no crew: take one of the posts offered.'
      );
    if (!whole(c.part, 0, Number.MAX_SAFE_INTEGER))
      return refuse('part', "That part is not your crew's.");
    const no = fitCheck(s, me, c.part, c.ship);
    return no
      ? refuse(no.code, no.sentence)
      : accept(fitted(s, me, c.part, c.ship as Ship));
  },
};

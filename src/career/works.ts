// The rows of a rival manager's review for parts, buildings, patrons, suppliers and the vote (Phase B section 6):
//
// - yard: splits the points toward its parts ranked worst in its league, weighted by their worth (the room left to
//   improve them); a low Development splits more evenly (leadership.ts yardSplit);
// - design: picks the type it ranks worst in, and from each slot's dealt cards the component of most worth per Coin,
//   accepting risk by personality; late in the season it designs for the next;
// - build: buildings in its personality's order, when the coin it commits allows;
// - patrons: signs the best offers standing, and replaces a weaker patron for one worth enough more (Finance);
// - suppliers: in the window, the card its personality weighs best;
// - vote: by its measure (admiralty.ts rivalSide).
//
// Each acts only through the player's own checks and functions, and spends from the Mind's room.

import type { PartType } from '../race.ts';
import type { Building } from '../office.ts';
import { cast, rivalSide } from './admiralty.ts';
import { canSpend } from './coin.ts';
import { TYPES, component } from './components.ts';
import {
  dealSlot,
  designCheck,
  forNextOpen,
  projection,
  started,
} from './design.ts';
import { yardSplit } from './leadership.ts';
import { patronWorth, signCheck, signedPatron } from './patrons.ts';
import type { Decide } from './rivals.ts';
import { unit } from './roles.ts';
import { begun, buildCheck, buildCost, designSlots } from './rookery.ts';
import type { CareerState, Crew, Part } from './state.ts';
import {
  TRADES,
  supplierCards,
  supplierCheck,
  supplierWindow,
  supplierWorth,
  chosen,
} from './suppliers.ts';
import { TUNING } from './tuning.ts';
import { yardCheck, yardSet } from './yard.ts';

const W = TUNING.works;

/** The league's fitted parts' perf by type (one pass, for many ranks). */
function fittedPerf(s: CareerState, c: Crew): Map<PartType, number[]> {
  const by = new Map<PartType, number[]>();
  for (const id of s.leagues[c.league].crews) {
    for (const q of s.crews[id].parts) {
      if (q.ship === null) continue;
      const xs = by.get(q.type);
      if (xs) xs.push(q.perf);
      else by.set(q.type, [q.perf]);
    }
  }
  return by;
}

/** How a part ranks among the league's fitted parts of its type: 0 the best .. 1 the worst. */
function rankAmong(fitted: Map<PartType, number[]>, p: Part): number {
  const all = fitted.get(p.type) ?? [];
  let better = 0;
  for (const perf of all) if (perf > p.perf) better++;
  return all.length <= 1 ? 0.5 : better / (all.length - 1);
}

/** Yard: the split toward the parts ranked worst, by the room left in them. */
export const yard: Decide = (s, mind) => {
  const c = s.crews[mind.crew];
  const parts = c.parts.filter((p) => p.ship !== null && !p.spec);
  if (parts.length === 0) return { state: s, mind };
  const fitted = fittedPerf(s, c);
  const needs = parts.map(
    (p) =>
      (0.25 + rankAmong(fitted, p)) *
      Math.max(0, p.perfMax - p.perf + 500 * (p.reliabilityMax - p.reliability))
  );
  const split = yardSplit(mind.stats.development, needs);
  const shares = parts
    .map((p, i) => {
      const rel =
        p.reliability < W.reliabilityBelow && p.reliability < p.reliabilityMax
          ? 0.3
          : 0;
      const k = Math.floor(split[i] * 1000) / 1000;
      return {
        part: p.id,
        perf: Math.floor(k * (1 - rel) * 1000) / 1000,
        reliability: Math.floor(k * rel * 1000) / 1000,
      };
    })
    .filter((x) => x.perf + x.reliability > 0);
  if (yardCheck(s, mind.crew, shares) !== null) return { state: s, mind };
  return { state: yardSet(s, mind.crew, shares), mind };
};

/** A component's worth to a design, or null if its risk is more than the personality accepts. */
function cardWorth(id: string, riskMost: number): number | null {
  const k = component(id);
  if (!k || k.effects.risk > riskMost) return null;
  const e = k.effects;
  return (
    (e.perf +
      0.5 * e.perfMax +
      400 * (e.reliability + e.reliabilityMax) -
      3 * (e.designDays + e.buildDays)) /
    Math.max(20, e.coin)
  );
}

/** The type a crew ranks worst in (its best part of the type against the league's), of those not spec. */
function worstType(s: CareerState, c: Crew): PartType | null {
  const spec = s.leagues[c.league].rules.spec;
  let worst: PartType | null = null,
    at = -1;
  const fitted = fittedPerf(s, c);
  for (const type of TYPES) {
    if (spec.includes(type)) continue;
    const best = c.parts
      .filter((p) => p.type === type && p.ship !== null)
      .sort((a, b) => b.perf - a.perf)[0];
    const r = best ? rankAmong(fitted, best) : 1;
    if (r > at) [worst, at] = [type, r];
  }
  return worst;
}

/** Design: the worst-ranked type, each slot's best card by worth per Coin (risk by personality). */
export const design: Decide = (s, mind) => {
  const c = s.crews[mind.crew];
  if (c.design || c.staff.shipwright === null) return { state: s, mind };
  const type = worstType(s, c);
  if (!type) return { state: s, mind };
  const forNext = forNextOpen(s) && s.round >= TUNING.calendar.rounds - 3;
  let out = s;
  const picked: string[] = [];
  for (let slot = 0; slot < designSlots(c); slot++) {
    out = dealSlot(out, mind.crew, type, slot);
    const cards = out.crews[mind.crew].draft!.deals.find(
      (d) => d.slot === slot
    )!.cards;
    const best = cards
      .filter((id) => !picked.includes(id))
      .map((id) => ({ id, w: cardWorth(id, W.risk[mind.personality]) }))
      .filter((x): x is { id: string; w: number } => x.w !== null && x.w > 0)
      .sort((a, b) => b.w - a.w || (a.id < b.id ? -1 : 1))[0];
    if (best) picked.push(best.id);
  }
  const cost = projection(out, mind.crew, type, picked).cost;
  if (
    cost > mind.room * W.designShare ||
    designCheck(out, mind.crew, type, picked, forNext) !== null
  )
    return { state: s, mind };
  return {
    state: started(out, mind.crew, type, picked, forNext),
    mind: { ...mind, room: mind.room - cost },
  };
};

/** Build: the first building of the personality's order that may rise and costs at most its share of the room. */
export const build: Decide = (s, mind) => {
  const c = s.crews[mind.crew];
  const order: readonly Building[] = W.build[mind.personality];
  for (const b of order) {
    const cost = buildCost(b, c.buildings[b].level + 1);
    if (cost > mind.room * W.buildShare || buildCheck(s, mind.crew, b) !== null)
      continue;
    return {
      state: begun(s, mind.crew, b),
      mind: { ...mind, room: mind.room - cost },
    };
  }
  return { state: s, mind };
};

/** Patrons: the best offers into empty slots; a weaker patron replaced for one worth enough more (Finance). */
export const patrons: Decide = (s, mind) => {
  let out = s;
  const bar =
    TUNING.patrons.better[0] +
    TUNING.patrons.better[1] * unit(mind.stats.finance);
  for (;;) {
    const c = out.crews[mind.crew];
    const offers = c.offers
      .filter(
        (o) =>
          o.expires >= out.day &&
          signCheck(out, mind.crew, o.patron.id, 0) === null
      )
      .sort(
        (a, b) =>
          patronWorth(b.patron) - patronWorth(a.patron) ||
          a.patron.id - b.patron.id
      );
    const best = offers[0];
    if (!best) break;
    const empty = c.patrons.findIndex((p) => p === null);
    if (empty >= 0) {
      out = signedPatron(out, mind.crew, best.patron.id, empty);
      continue;
    }
    const worst = c.patrons
      .map((p, slot) => ({ slot, w: p ? patronWorth(p) : 0 }))
      .sort((a, b) => a.w - b.w)[0];
    if (patronWorth(best.patron) <= worst.w * bar) break;
    out = signedPatron(out, mind.crew, best.patron.id, worst.slot);
  }
  return { state: out, mind };
};

/** Suppliers: in the window, each trade's card its personality weighs best, if the room allows. */
export const suppliers: Decide = (s, mind0) => {
  if (!supplierWindow(s)) return { state: s, mind: mind0 };
  let out = s,
    mind = mind0;
  for (const trade of TRADES) {
    if (out.crews[mind.crew].suppliers[trade] !== null) continue;
    const pick = supplierCards(out.seed, mind.crew, out.season, trade)
      .filter(
        (x) =>
          x.coin <= mind.room &&
          supplierCheck(out, mind.crew, trade, x.id) === null
      )
      .sort(
        (a, b) =>
          supplierWorth(mind.personality, b) -
            supplierWorth(mind.personality, a) || (a.id < b.id ? -1 : 1)
      )[0];
    if (!pick || !canSpend(out.crews[mind.crew], pick.coin)) continue;
    out = chosen(out, mind.crew, trade, pick.id);
    mind = { ...mind, room: mind.room - pick.coin };
  }
  return { state: out, mind };
};

/** Vote: every open proposal of its league it has not voted on, by its measure. */
export const vote: Decide = (s, mind) => {
  let out = s;
  const league = s.crews[mind.crew].league;
  for (const p of s.leagues[league].proposals) {
    if (
      p.decided !== null ||
      out.day > p.closes ||
      p.votes[mind.crew] !== undefined
    )
      continue;
    const now = out.leagues[league].proposals.find((x) => x.id === p.id)!;
    out = cast(
      out,
      league,
      now,
      mind.crew,
      rivalSide(out, mind.crew, p.change)
    );
  }
  return { state: out, mind };
};

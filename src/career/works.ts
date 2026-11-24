// The rows of a rival manager's review for parts, buildings, sponsors, suppliers and the vote:
//
// - improvement: splits the points toward its parts ranked worst in its tier, weighted by their worth (the room left to
//   improve them); a low Development splits more evenly (leadership.ts improvementSplit);
// - design: picks the type it ranks worst in, and from each slot's dealt cards the component of most worth per money,
//   accepting risk by personality; late in the season it designs for the next;
// - build: buildings in its personality's order, when the balance it commits allows;
// - sponsors: signs the best offers standing, and replaces a weaker sponsor for one worth enough more (Finance);
// - suppliers: in the window, the card its personality weighs best;
// - vote: by its measure (regulations.ts rivalSide).
//
// Each acts only through the player's own checks and functions, and spends from the Mind's room.

import { known } from './canon.ts';
import type { PartType } from '../race.ts';
import type { Building } from '../office/command.ts';
import { cast, rivalSide } from './regulations.ts';
import { canSpend } from './balance.ts';
import { TYPES, component } from './components.ts';
import {
  dealSlot,
  designCheck,
  forNextOpen,
  projection,
  started,
} from './design.ts';
import { improvementSplit } from './leadership.ts';
import { sponsorWorth, signCheck, signedSponsor } from './sponsors.ts';
import type { Decide } from './rivals.ts';
import { unit } from './roles.ts';
import { begun, buildCheck, buildCost, designSlots } from './hq.ts';
import type { CareerState, Team, Part } from './state.ts';
import {
  TRADES,
  supplierCards,
  supplierCheck,
  supplierWindow,
  supplierWorth,
  chosen,
} from './suppliers.ts';
import { TUNING } from './tuning.ts';
import { improvementCheck, improvementSet } from './improvement.ts';

const W = TUNING.works;

/** The tier's fitted parts' perf by type (one pass, for many ranks). */
function fittedPerf(s: CareerState, c: Team): Map<PartType, number[]> {
  const by = new Map<PartType, number[]>();
  for (const id of s.championships[c.tier].teams) {
    for (const q of s.teams[id].parts) {
      if (q.ship === null) continue;
      const xs = by.get(q.type);
      if (xs) xs.push(q.perf);
      else by.set(q.type, [q.perf]);
    }
  }
  return by;
}

/** How a part ranks among the tier's fitted parts of its type: 0 the best .. 1 the worst. */
function rankAmong(fitted: Map<PartType, number[]>, p: Part): number {
  const all = fitted.get(p.type) ?? [];
  let better = 0;
  for (const perf of all) if (perf > p.perf) better++;
  return all.length <= 1 ? 0.5 : better / (all.length - 1);
}

/** Improvement: the split toward the parts ranked worst, by the room left in them. */
export const improvement: Decide = (s, mind) => {
  const c = s.teams[mind.team];
  const parts = c.parts.filter((p) => p.ship !== null && !p.spec);
  if (parts.length === 0) return { state: s, mind };
  const fitted = fittedPerf(s, c);
  const needs = parts.map(
    (p) =>
      (0.25 + rankAmong(fitted, p)) *
      Math.max(0, p.perfMax - p.perf + 500 * (p.reliabilityMax - p.reliability))
  );
  const split = improvementSplit(mind.stats.development, needs);
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
  if (improvementCheck(s, mind.team, shares) !== null)
    return { state: s, mind };
  return { state: improvementSet(s, mind.team, shares), mind };
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
    Math.max(20, e.balance)
  );
}

/** The type a team ranks worst in (its best part of the type against the tier's), of those not spec. */
function worstType(s: CareerState, c: Team): PartType | null {
  const spec = s.championships[c.tier].rules.spec;
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

/** Design: the worst-ranked type, each slot's best card by worth per money (risk by personality). */
export const design: Decide = (s, mind) => {
  const c = s.teams[mind.team];
  if (c.design || c.staff.designer === null) return { state: s, mind };
  const type = worstType(s, c);
  if (!type) return { state: s, mind };
  const forNext = forNextOpen(s) && s.round >= TUNING.calendar.rounds - 3;
  let out = s;
  const picked: string[] = [];
  for (let slot = 0; slot < designSlots(c); slot++) {
    out = dealSlot(out, mind.team, type, slot);
    const cards = known(
      known(out.teams[mind.team].draft).deals.find((d) => d.slot === slot)
    ).cards;
    const best = cards
      .filter((id) => !picked.includes(id))
      .map((id) => ({ id, w: cardWorth(id, W.risk[mind.personality]) }))
      .filter((x): x is { id: string; w: number } => x.w !== null && x.w > 0)
      .sort((a, b) => b.w - a.w || (a.id < b.id ? -1 : 1))[0];
    if (best) picked.push(best.id);
  }
  const cost = projection(out, mind.team, type, picked).cost;
  if (
    cost > mind.room * W.designShare ||
    designCheck(out, mind.team, type, picked, forNext) !== null
  )
    return { state: s, mind };
  return {
    state: started(out, mind.team, type, picked, forNext),
    mind: { ...mind, room: mind.room - cost },
  };
};

/** Build: the first building of the personality's order that may rise and costs at most its share of the room. */
export const build: Decide = (s, mind) => {
  const c = s.teams[mind.team];
  const order: readonly Building[] = W.build[mind.personality];
  for (const b of order) {
    const cost = buildCost(b, c.buildings[b].level + 1);
    if (cost > mind.room * W.buildShare || buildCheck(s, mind.team, b) !== null)
      continue;
    return {
      state: begun(s, mind.team, b),
      mind: { ...mind, room: mind.room - cost },
    };
  }
  return { state: s, mind };
};

/** Sponsors: the best offers into empty slots; a weaker sponsor replaced for one worth enough more (Finance). */
export const sponsors: Decide = (s, mind) => {
  let out = s;
  const bar =
    TUNING.sponsors.better[0] +
    TUNING.sponsors.better[1] * unit(mind.stats.finance);
  for (;;) {
    const c = out.teams[mind.team];
    const offers = c.offers
      .filter(
        (o) =>
          o.expires >= out.day &&
          signCheck(out, mind.team, o.sponsor.id, 0) === null
      )
      .sort(
        (a, b) =>
          sponsorWorth(b.sponsor) - sponsorWorth(a.sponsor) ||
          a.sponsor.id - b.sponsor.id
      );
    const best = offers[0];
    if (!best) break;
    const empty = c.sponsors.findIndex((p) => p === null);
    if (empty >= 0) {
      out = signedSponsor(out, mind.team, best.sponsor.id, empty);
      continue;
    }
    const worst = c.sponsors
      .map((p, slot) => ({ slot, w: p ? sponsorWorth(p) : 0 }))
      .sort((a, b) => a.w - b.w)[0];
    if (sponsorWorth(best.sponsor) <= worst.w * bar) break;
    out = signedSponsor(out, mind.team, best.sponsor.id, worst.slot);
  }
  return { state: out, mind };
};

/** Suppliers: in the window, each trade's card its personality weighs best, if the room allows. */
export const suppliers: Decide = (s, mind0) => {
  if (!supplierWindow(s)) return { state: s, mind: mind0 };
  let out = s,
    mind = mind0;
  for (const trade of TRADES) {
    if (out.teams[mind.team].suppliers[trade] !== null) continue;
    const pick = supplierCards(out.seed, mind.team, out.season, trade)
      .filter(
        (x) =>
          x.balance <= mind.room &&
          supplierCheck(out, mind.team, trade, x.id) === null
      )
      .sort(
        (a, b) =>
          supplierWorth(mind.personality, b) -
            supplierWorth(mind.personality, a) || (a.id < b.id ? -1 : 1)
      )[0];
    if (!pick || !canSpend(out.teams[mind.team], pick.balance)) continue;
    out = chosen(out, mind.team, trade, pick.id);
    mind = { ...mind, room: mind.room - pick.balance };
  }
  return { state: out, mind };
};

/** Vote: every open proposal of its tier it has not voted on, by its measure. */
export const vote: Decide = (s, mind) => {
  let out = s;
  const tier = s.teams[mind.team].tier;
  for (const p of s.championships[tier].proposals) {
    if (
      p.decided !== null ||
      out.day > p.closes ||
      p.votes[mind.team] !== undefined
    )
      continue;
    const now = known(
      out.championships[tier].proposals.find((x) => x.id === p.id)
    );
    out = cast(out, tier, now, mind.team, rivalSide(out, mind.team, p.change));
  }
  return { state: out, mind };
};

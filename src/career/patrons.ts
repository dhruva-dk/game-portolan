// Patrons (Phase B section 10): three slots a crew. Offers come every few rounds (a `patronOffer` event a crew, every
// 42 days), their size by the crew's marketability and their tier (at most the landing pad's level). A patron pays a
// fixed sum a race (career/money.ts raceMoney), or a bonus for the objective chosen in each race plan from their list
// (finish top 10; sink two ships; both ships afloat at the end; hold the most sea in the crew's league), harder paying
// more, for a number of races. SignPatron. Rivals sign by Finance (career/works.ts).

import type { Objective, Patron, PatronOffer } from './state.ts';
import { paid } from './coin.ts';
import { accept, refuse, whole, why, type Check, type Handlers } from './command.ts';
import { between, shuffled, type Dice } from './dice.ts';
import { patron as patronName } from './names.ts';
import { mine, post } from './post.ts';
import { schedule, type Event } from './queue.ts';
import { crewMarketability } from './reputation.ts';
import { patronTier } from './rookery.ts';
import type { CareerState, Crew } from './state.ts';
import { TUNING } from './tuning.ts';

const P = TUNING.patrons;
export const OBJECTIVES: readonly Objective[] = ['top10', 'sinkTwo', 'afloat', 'mostSea'];

/** A patron's worth a race to a crew: its fixed sum, or its bonus × the mean weight of its objectives × an even chance. */
export const patronWorth = (p: Patron): number =>
  p.objectives.length === 0 ? p.perRace : p.bonus * p.objectives.reduce((a, o) => a + P.objectives[o], 0) / p.objectives.length / 2;

/** A patron's offers made to a crew today: `count` of them, drawn. */
export function patronOffers(s: CareerState, c: Crew, rand: () => number, count: number): { offers: PatronOffer[]; next: number } {
  let id = s.ids.patron;
  const market = crewMarketability(s, c);
  const offers: PatronOffer[] = [];
  for (let i = 0; i < count; i++) {
    const tier = between(rand, 1, Math.max(1, patronTier(c)));
    const scale = market * P.tier[tier - 1];
    const races = between(rand, P.races[0], P.races[1]);
    const objective = rand() < P.objectiveShare;
    const objectives = objective ? shuffled(rand, OBJECTIVES).slice(0, between(rand, 2, 3)).sort((a, b) => OBJECTIVES.indexOf(a) - OBJECTIVES.indexOf(b)) : [];
    const patron: Patron = { id: id++, name: patronName(rand), perRace: objective ? 0 : Math.round(P.perRace * scale), objectives,
      bonus: objective ? Math.round(P.bonus * scale) : 0, races, tier };
    offers.push({ patron, expires: s.day + P.stand });
  }
  return { offers, next: id };
}

/** A crew's offers come: the lapsed ones dropped, new ones dealt; the player is mailed; the next scheduled. */
export function offersCome(s: CareerState, e: Extract<Event, { kind: 'patronOffer' }>, roll: Dice): CareerState {
  const c = s.crews[e.crew];
  const { offers, next } = patronOffers(s, c, roll.roll('patrons'), P.offers);
  const crews = [...s.crews];
  crews[e.crew] = { ...c, offers: [...c.offers.filter((o) => o.expires >= s.day), ...offers] };
  let out: CareerState = { ...s, crews, ids: { ...s.ids, patron: next } };
  for (const o of offers) {
    out = post(out, { crew: e.crew, category: 'finance', sender: null, kind: 'patronOffer', slots: { patron: o.patron.id, name: o.patron.name, expires: o.expires }, links: [] });
  }
  return schedule(out, s.day + P.every, { kind: 'patronOffer', crew: e.crew });
}

/** Whether a crew may sign an offered patron into a slot (a patron there already is replaced). */
export function signCheck(s: CareerState, crew: number, offer: number, slot: number): Check {
  const c = s.crews[crew];
  if (!whole(slot, 0, P.slots - 1)) return why('slot', 'A crew has three patron slots.');
  const o = c.offers.find((x) => x.patron.id === offer);
  if (!o) return why('offer', 'No such offer stands.');
  if (o.expires < s.day) return why('lapsed', 'That offer has lapsed.');
  if (o.patron.tier > patronTier(c)) return why('tier', 'The landing pad cannot receive a patron of that standing.');
  return null;
}

/** A state with a patron signed into a slot (checked first). */
export function signedPatron(s: CareerState, crew: number, offer: number, slot: number): CareerState {
  const c = s.crews[crew];
  const o = c.offers.find((x) => x.patron.id === offer)!;
  const patrons = [0, 1, 2].map((i) => (i === slot ? o.patron : c.patrons[i] ?? null));
  const crews = [...s.crews];
  crews[crew] = { ...c, patrons, offers: c.offers.filter((x) => x !== o) };
  return { ...s, crews };
}

/** How a crew's race went, for its patrons' objectives. */
export interface Outcome { best: number | null; sinkings: number; afloat: number; mostSea: boolean }

/** Whether an objective was met. */
export function objectiveMet(o: Objective, r: Outcome): boolean {
  switch (o) {
    case 'top10': return r.best !== null && r.best <= 10;
    case 'sinkTwo': return r.sinkings >= 2;
    case 'afloat': return r.afloat >= 2;
    case 'mostSea': return r.mostSea;
  }
}

/** A state after a race for a crew's patrons: each objective patron pays its bonus × the objective's weight if the one
 *  chosen (`chosen[slot]`, an index into its list; the first if none) was met, and mail says met or missed; every
 *  patron has a race fewer, and leaves at none. Section 13 calls it as the round closes. */
export function patronsAfterRace(s: CareerState, crew: number, r: Outcome, chosen: readonly (number | null)[]): CareerState {
  let out = s;
  const c = s.crews[crew];
  const patrons = c.patrons.map((p, slot) => {
    if (!p) return null;
    if (p.objectives.length > 0) {
      const o = p.objectives[Math.min(p.objectives.length - 1, Math.max(0, chosen[slot] ?? 0))];
      const met = objectiveMet(o, r);
      if (met) out = paid(out, crew, -Math.round(p.bonus * P.objectives[o]), { kind: 'patron', what: `${p.name}'s bonus` });
      out = post(out, { crew, category: 'finance', sender: null, kind: met ? 'objectiveMet' : 'objectiveMissed', slots: { patron: p.id, objective: o }, links: [] });
    }
    if (p.races <= 1) {
      out = post(out, { crew, category: 'finance', sender: null, kind: 'patronLeft', slots: { patron: p.id, name: p.name }, links: [] });
      return null;
    }
    return { ...p, races: p.races - 1 };
  });
  const crews = [...out.crews];
  crews[crew] = { ...out.crews[crew], patrons };
  return { ...out, crews };
}

export const PATRONS: Handlers = {
  SignPatron: (s, c) => {
    const me = mine(s);
    if (me === null) return refuse('sacked', 'You have no crew: take one of the posts offered.');
    const no = signCheck(s, me, c.offer, c.slot);
    return no ? refuse(no.code, no.sentence) : accept(signedPatron(s, me, c.offer, c.slot));
  },
};

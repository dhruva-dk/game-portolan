// The market's rules (Phase B section 5, D16, D28): what a gull asks of a crew, how an offer scores against their
// three wants, and their answer: accept at 1.0, counter from 0.85 (raising the money, then status, then length, to
// reach 1.0), refuse below. Pure functions of the state, which the player's offers, the rivals' bids and the screens
// all call.

import type { Offer, Want } from '../office.ts';
import { askFee, askSeasons, askWage } from './asks.ts';
import { renewalAsk } from './morale.ts';
import type { Gull } from './roles.ts';
import { SCHOOL, age } from './stars.ts';
import type { CareerState, Crew } from './state.ts';
import { levelOf } from './contracts.ts';
import { TUNING } from './tuning.ts';

const M = TUNING.market;
const ROUNDS = TUNING.calendar.rounds;

/** What a gull asks of a crew: wage a race at its league (less for a content gull's renewal), fee, length. */
export interface Ask {
  wage: number;
  fee: number;
  seasons: 1 | 2 | 3;
}

export function askOf(s: CareerState, g: Gull, crew: Crew): Ask {
  const renewal = g.contract?.crew === crew.id;
  const wage = Math.round(
    askWage(g, crew.league) * (renewal ? renewalAsk(g.morale) : 1)
  );
  return { wage, fee: askFee(wage), seasons: askSeasons(age(g, s.day)) };
}

/** A gull's standing against which a crew's reputation is weighed (ambition): a manager's reputation, else their
 *  marketability. */
const standing = (g: Gull): number =>
  g.role === 'manager' ? g.reputation : g.marketability;

const cap = (x: number): number => Math.min(M.most, Math.max(0, x));

/** How well an offer from a crew meets each of the gull's wants, 0 to 1.2. */
export function satisfied(
  s: CareerState,
  g: Gull,
  crew: Crew,
  offer: Offer
): Readonly<Record<Want, number>> {
  const ask = askOf(s, g, crew);
  const races = offer.seasons * ROUNDS;
  const bonuses =
    offer.podium * M.expect.podium + offer.sinking * M.expect.sinking;
  const money =
    ask.wage <= 0
      ? M.most
      : cap((offer.wage + offer.fee / races + bonuses) / ask.wage);
  const status =
    g.role !== 'captain' || offer.status !== 'reserve' ? 1 : M.reserve;
  const below = crew.league - levelOf(s, g);
  const league =
    below <= 0
      ? 1
      : below === 1
        ? M.leagueBelow
        : g.contract === null
          ? M.leagueFree
          : 0;
  const ambition = cap(1 + (crew.reputation - standing(g)) / M.ambitionSpan);
  const security = cap(
    1 - M.securityStep * Math.abs(offer.seasons - ask.seasons)
  );
  const building = SCHOOL[g.role];
  const facilities = building ? cap(crew.buildings[building].level / 3) : 1;
  const home = crew.colony === g.colony ? 1 : M.away;
  return { money, status, league, ambition, security, facilities, home };
}

/** An offer's score: the weighted sum of the gull's three wants met (0.5, 0.3, 0.2). */
export function score(
  s: CareerState,
  g: Gull,
  crew: Crew,
  offer: Offer
): number {
  const met = satisfied(s, g, crew, offer);
  return g.wants.reduce((a, w, i) => a + (M.weights[i] ?? 0) * met[w], 0);
}

/** The gull's answer to an offer: accept, a counter (the offer they would accept), or refuse. */
export type Answer =
  | { kind: 'accept' }
  | { kind: 'counter'; offer: Offer }
  | { kind: 'refuse' };

/** The wage that brings the money want to its most. */
function fullWage(s: CareerState, g: Gull, crew: Crew, offer: Offer): number {
  const ask = askOf(s, g, crew);
  const races = offer.seasons * ROUNDS;
  return Math.ceil(
    M.most * ask.wage -
      offer.fee / races -
      offer.podium * M.expect.podium -
      offer.sinking * M.expect.sinking
  );
}

/** The least wage at or above the offer's that brings the score to 1, or null if even the most money does not. */
function wageToAccept(
  s: CareerState,
  g: Gull,
  crew: Crew,
  offer: Offer
): number | null {
  const most = Math.max(offer.wage, fullWage(s, g, crew, offer));
  if (score(s, g, crew, { ...offer, wage: most }) < M.accept) return null;
  let lo = offer.wage,
    hi = most;
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (score(s, g, crew, { ...offer, wage: mid }) >= M.accept) hi = mid;
    else lo = mid;
  }
  return score(s, g, crew, { ...offer, wage: lo }) >= M.accept ? lo : hi;
}

/** The counter a gull makes to an offer that scores from 0.85: the money raised first; if that is not enough, at the
 *  most money, a captain's status raised to a ship, then the length made the one they ask. Null if nothing reaches 1. */
export function counterTo(
  s: CareerState,
  g: Gull,
  crew: Crew,
  offer: Offer
): Offer | null {
  const steps: ((o: Offer) => Offer)[] = [
    (o) => o,
    (o) => (g.role === 'captain' ? { ...o, status: 'ship' } : o),
    (o) => ({ ...o, seasons: askOf(s, g, crew).seasons }),
  ];
  let o = offer;
  for (const step of steps) {
    o = step(o);
    const wage = wageToAccept(s, g, crew, o);
    if (wage !== null) return { ...o, wage };
    o = { ...o, wage: Math.max(o.wage, fullWage(s, g, crew, o)) };
  }
  return null;
}

/** A gull's answer to an offer. */
export function answer(
  s: CareerState,
  g: Gull,
  crew: Crew,
  offer: Offer
): Answer {
  const sc = score(s, g, crew, offer);
  if (sc >= M.accept) return { kind: 'accept' };
  if (sc < M.counterFrom) return { kind: 'refuse' };
  const counter = counterTo(s, g, crew, offer);
  return counter ? { kind: 'counter', offer: counter } : { kind: 'refuse' };
}

/** Whether an offer's wage is low enough to cost the gull a patience. */
export const lowball = (
  s: CareerState,
  g: Gull,
  crew: Crew,
  offer: Offer
): boolean => offer.wage < M.lowball * askOf(s, g, crew).wage;

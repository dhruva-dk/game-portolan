// The market's rules (Phase B section 5, D16, D28): what a person asks of a team, how an offer scores against their
// three wants, and their answer: accept at 1.0, counter from 0.85 (raising the money, then status, then length, to
// reach 1.0), refuse below. Pure functions of the state, which the player's offers, the rivals' bids and the screens
// all call.

import type { Offer, Want } from '../office/command.ts';
import { askFee, askSeasons, askWage } from './asks.ts';
import { renewalAsk } from './morale.ts';
import type { Person } from './roles.ts';
import { SCHOOL, age } from './stars.ts';
import type { CareerState, Team } from './state.ts';
import { levelOf } from './contracts.ts';
import { TUNING } from './tuning.ts';

const M = TUNING.market;
const ROUNDS = TUNING.calendar.rounds;

/** What a person asks of a team: wage a race at its tier (less for a content person's renewal), fee, length. */
interface Ask {
  wage: number;
  fee: number;
  seasons: 1 | 2 | 3;
}

export function askOf(s: CareerState, g: Person, team: Team): Ask {
  const renewal = g.contract?.team === team.id;
  const wage = Math.round(
    askWage(g, team.tier) * (renewal ? renewalAsk(g.morale) : 1)
  );
  return { wage, fee: askFee(wage), seasons: askSeasons(age(g, s.day)) };
}

/** A person's standing against which a team's reputation is weighed (ambition): a manager's reputation, else their
 *  marketability. */
const standing = (g: Person): number =>
  g.role === 'manager' ? g.reputation : g.marketability;

const cap = (x: number): number => Math.min(M.most, Math.max(0, x));

/** How well an offer from a team meets each of the person's wants, 0 to 1.2. */
export function satisfied(
  s: CareerState,
  g: Person,
  team: Team,
  offer: Offer
): Readonly<Record<Want, number>> {
  const ask = askOf(s, g, team);
  const races = offer.seasons * ROUNDS;
  const bonuses =
    offer.podium * M.expect.podium + offer.sinking * M.expect.sinking;
  const money =
    ask.wage <= 0
      ? M.most
      : cap((offer.wage + offer.fee / races + bonuses) / ask.wage);
  const status =
    g.role !== 'driver' || offer.status !== 'reserve' ? 1 : M.reserve;
  const below = team.tier - levelOf(s, g);
  const tier =
    below <= 0
      ? 1
      : below === 1
        ? M.tierBelow
        : g.contract === null
          ? M.tierFree
          : 0;
  const ambition = cap(1 + (team.reputation - standing(g)) / M.ambitionSpan);
  const security = cap(
    1 - M.securityStep * Math.abs(offer.seasons - ask.seasons)
  );
  const building = SCHOOL[g.role];
  const facilities = building ? cap(team.buildings[building].level / 3) : 1;
  const home = team.colony === g.colony ? 1 : M.away;
  return { money, status, tier, ambition, security, facilities, home };
}

/** An offer's score: the weighted sum of the person's three wants met (0.5, 0.3, 0.2). */
export function score(
  s: CareerState,
  g: Person,
  team: Team,
  offer: Offer
): number {
  const met = satisfied(s, g, team, offer);
  return g.wants.reduce((a, w, i) => a + (M.weights[i] ?? 0) * met[w], 0);
}

/** The person's answer to an offer: accept, a counter (the offer they would accept), or refuse. */
type Answer =
  | { kind: 'accept' }
  | { kind: 'counter'; offer: Offer }
  | { kind: 'refuse' };

/** The wage that brings the money want to its most. */
function fullWage(s: CareerState, g: Person, team: Team, offer: Offer): number {
  const ask = askOf(s, g, team);
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
  g: Person,
  team: Team,
  offer: Offer
): number | null {
  const most = Math.max(offer.wage, fullWage(s, g, team, offer));
  if (score(s, g, team, { ...offer, wage: most }) < M.accept) return null;
  let lo = offer.wage,
    hi = most;
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (score(s, g, team, { ...offer, wage: mid }) >= M.accept) hi = mid;
    else lo = mid;
  }
  return score(s, g, team, { ...offer, wage: lo }) >= M.accept ? lo : hi;
}

/** The counter a person makes to an offer that scores from 0.85: the money raised first; if that is not enough, at the
 *  most money, a driver's status raised to a ship, then the length made the one they ask. Null if nothing reaches 1. */
export function counterTo(
  s: CareerState,
  g: Person,
  team: Team,
  offer: Offer
): Offer | null {
  const steps: ((o: Offer) => Offer)[] = [
    (o) => o,
    (o) => (g.role === 'driver' ? { ...o, status: 'ship' } : o),
    (o) => ({ ...o, seasons: askOf(s, g, team).seasons }),
  ];
  let o = offer;
  for (const step of steps) {
    o = step(o);
    const wage = wageToAccept(s, g, team, o);
    if (wage !== null) return { ...o, wage };
    o = { ...o, wage: Math.max(o.wage, fullWage(s, g, team, o)) };
  }
  return null;
}

/** A person's answer to an offer. */
export function answer(
  s: CareerState,
  g: Person,
  team: Team,
  offer: Offer
): Answer {
  const sc = score(s, g, team, offer);
  if (sc >= M.accept) return { kind: 'accept' };
  if (sc < M.counterFrom) return { kind: 'refuse' };
  const counter = counterTo(s, g, team, offer);
  return counter ? { kind: 'counter', offer: counter } : { kind: 'refuse' };
}

/** Whether an offer's wage is low enough to cost the person a patience. */
export const lowball = (
  s: CareerState,
  g: Person,
  team: Team,
  offer: Offer
): boolean => offer.wage < M.lowball * askOf(s, g, team).wage;

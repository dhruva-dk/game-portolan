// Money (Phase B section 10, D21): one currency, Coin. Income: patrons (career/patrons.ts), prize money at the
// season's end (by place, spread by rules.prizeSpread), the fish market, pay captains. Costs: wages each race, designs,
// buildings and their upkeep, fines, break clauses and signing fees (each paid where it happens, through coin.ts
// `paid`, which writes the player's ledger). Below the elder's floor no command that spends is accepted
// (coin.ts canSpend); wages and every other payment owed are still paid.
//
// The ledger's projection: coin at the season's end from what is committed (each race's wages, upkeep, fish, fixed
// patrons and pay captains over the races left) and the prize at the crew's present place.

import { paid } from './coin.ts';
import { racesLeft } from './contracts.ts';
import { payCoin } from './effective.ts';
import { standingOf } from './elders.ts';
import { commitment } from './leadership.ts';
import { fishCoin, upkeep } from './rookery.ts';
import { staffOf, type CareerState, type Crew } from './state.ts';
import { TUNING } from './tuning.ts';

/** A crew's wages a race: every contract on its staff. */
export const wages = (s: CareerState, c: Crew): number => staffOf(c).reduce((a, id) => a + (s.gulls[id].contract?.wage ?? 0), 0);

/** What a crew's pay captains bring a race (every captain on its staff with the trait). */
export const payCaptains = (s: CareerState, c: Crew): number =>
  staffOf(c).reduce((a, id) => a + (s.gulls[id].role === 'captain' ? payCoin(s.gulls[id]) : 0), 0);

/** A crew's fixed patrons' Coin a race. */
export const patronCoin = (c: Crew): number => c.patrons.reduce((a, p) => a + (p && p.objectives.length === 0 ? p.perRace : 0), 0);

/** A crew's committed money a race, each line. */
export interface PerRace { wages: number; upkeep: number; fish: number; patrons: number; pay: number; net: number }
export function perRace(s: CareerState, crew: number): PerRace {
  const c = s.crews[crew];
  const lines = { wages: wages(s, c), upkeep: upkeep(c), fish: fishCoin(c), patrons: patronCoin(c), pay: payCaptains(s, c) };
  return { ...lines, net: lines.fish + lines.patrons + lines.pay - lines.wages - lines.upkeep };
}

/** A state with a race's money paid for a crew: wages and upkeep out; fish, fixed patrons and pay captains in.
 *  Section 13 calls it for every crew as each round closes. */
export function raceMoney(s: CareerState, crew: number): CareerState {
  const r = perRace(s, crew);
  let out = paid(s, crew, r.wages, { kind: 'wages', what: 'the crew\'s wages' });
  out = paid(out, crew, r.upkeep, { kind: 'upkeep', what: 'the rookery\'s upkeep' });
  out = paid(out, crew, -r.fish, { kind: 'fish', what: 'the fish market' });
  out = paid(out, crew, -r.patrons, { kind: 'patron', what: 'the patrons\' sums' });
  return paid(out, crew, -r.pay, { kind: 'pay', what: 'pay captains\' purses' });
}

/** A state with a race's bonuses paid: each captain's podium bonus if she made the podium, and her sinking bonus a
 *  ship she sank (section 13 knows the result). */
export function bonusesPaid(s: CareerState, crew: number, earned: readonly { gull: number; podium: boolean; sinkings: number }[]): CareerState {
  let out = s;
  for (const e of earned) {
    const k = s.gulls[e.gull].contract;
    if (!k || k.crew !== crew) continue;
    out = paid(out, crew, (e.podium ? k.podium : 0) + e.sinkings * k.sinking, { kind: 'bonus', what: `${s.gulls[e.gull].given} ${s.gulls[e.gull].family}'s bonuses` });
  }
  return out;
}

/** Each place's share of a league's prize pool (1 first): weight (n + 1 − place)^spread; spread 0 shares evenly. */
export function prizeShares(n: number, spread: number): number[] {
  const w = Array.from({ length: n }, (_, i) => Math.pow(n - i, Math.max(0, spread)));
  const total = w.reduce((a, b) => a + b, 0);
  return w.map((x) => x / total);
}

/** A place's prize in a league under its rules. */
export const prizeAt = (s: CareerState, league: number, place: number): number => {
  const l = s.leagues[league];
  return Math.round(TUNING.money.prize[league] * prizeShares(l.crews.length, l.rules.prizeSpread)[place - 1]);
};

/** A state with every league's prize money paid by the final standings (section 13 calls it first at the season's end). */
export function prizes(s: CareerState): CareerState {
  let out = s;
  for (const l of s.leagues) for (const crew of l.crews) {
    out = paid(out, crew, -prizeAt(s, l.id, standingOf(s, crew)), { kind: 'prize', what: 'the season\'s prize money' });
  }
  return out;
}

/** The Coin a rival manager will commit (Finance's share) of what its crew's season is projected to leave above the
 *  debt floor: wages run on to the season's end, so a manager plans by the projection, not only the coin in hand. */
export const roomOf = (s: CareerState, crew: number, finance: number): number =>
  commitment(finance, projection(s, crew).end, s.crews[crew].debtFloor);

/** The ledger's projection: coin at the season's end from what is committed, with its lines. */
export interface Projection { coin: number; races: number; perRace: PerRace; prize: number; end: number }
export function projection(s: CareerState, crew: number): Projection {
  const c = s.crews[crew];
  const races = racesLeft(s);
  const r = perRace(s, crew);
  const prize = prizeAt(s, c.league, standingOf(s, crew));
  return { coin: c.coin, races, perRace: r, prize, end: Math.round(c.coin + races * r.net + prize) };
}

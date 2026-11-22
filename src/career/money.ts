// Money (Phase B section 10, D21): one currency. Income: sponsors (career/sponsors.ts), prize money at the
// season's end (by place, spread by rules.prizeSpread), the fish market, pay drivers. Costs: wages each race, designs,
// buildings and their upkeep, fines, break clauses and signing fees (each paid where it happens, through balance.ts
// `paid`, which writes the player's ledger). Below the chairman's floor no command that spends is accepted
// (balance.ts canSpend); wages and every other payment owed are still paid.
//
// The ledger's projection: balance at the season's end from what is committed (each race's wages, upkeep, fish, fixed
// sponsors and pay drivers over the races left) and the prize at the team's present place.

import { paid } from './balance.ts';
import { racesLeft } from './contracts.ts';
import { payIncome } from './effective.ts';
import { standingOf } from './standings.ts';
import { commitment } from './leadership.ts';
import { fishIncome, upkeep } from './hq.ts';
import { staffOf, type CareerState, type Team } from './state.ts';
import { TUNING } from './tuning.ts';

/** A team's wages a race: every contract on its staff. */
export const wages = (s: CareerState, c: Team): number =>
  staffOf(c).reduce((a, id) => a + (s.people[id].contract?.wage ?? 0), 0);

/** What a team's pay drivers bring a race (every driver on its staff with the trait). */
const payDrivers = (s: CareerState, c: Team): number =>
  staffOf(c).reduce(
    (a, id) =>
      a + (s.people[id].role === 'driver' ? payIncome(s.people[id]) : 0),
    0
  );

/** A team's fixed sponsors' money a race. */
const sponsorIncome = (c: Team): number =>
  c.sponsors.reduce(
    (a, p) => a + (p && p.objectives.length === 0 ? p.perRace : 0),
    0
  );

/** A team's committed money a race, each line. */
interface PerRace {
  wages: number;
  upkeep: number;
  fish: number;
  sponsors: number;
  pay: number;
  net: number;
}
export function perRace(s: CareerState, team: number): PerRace {
  const c = s.teams[team];
  const lines = {
    wages: wages(s, c),
    upkeep: upkeep(c),
    fish: fishIncome(c),
    sponsors: sponsorIncome(c),
    pay: payDrivers(s, c),
  };
  return {
    ...lines,
    net: lines.fish + lines.sponsors + lines.pay - lines.wages - lines.upkeep,
  };
}

/** A state with a race's money paid for a team: wages and upkeep out; fish, fixed sponsors and pay drivers in.
 *  Section 13 calls it for every team as each round closes. */
export function raceMoney(s: CareerState, team: number): CareerState {
  const r = perRace(s, team);
  let out = paid(s, team, r.wages, { kind: 'wages', what: "the team's wages" });
  out = paid(out, team, r.upkeep, {
    kind: 'upkeep',
    what: "the headquarters's upkeep",
  });
  out = paid(out, team, -r.fish, { kind: 'fish', what: 'the fish market' });
  out = paid(out, team, -r.sponsors, {
    kind: 'sponsor',
    what: "the sponsors' sums",
  });
  return paid(out, team, -r.pay, { kind: 'pay', what: "pay drivers' purses" });
}

/** A state with a race's bonuses paid: each driver's podium bonus if she made the podium, and her sinking bonus a
 *  ship she sank (section 13 knows the result). */
export function bonusesPaid(
  s: CareerState,
  team: number,
  earned: readonly { person: number; podium: boolean; sinkings: number }[]
): CareerState {
  let out = s;
  for (const e of earned) {
    const k = s.people[e.person].contract;
    if (!k || k.team !== team) continue;
    out = paid(out, team, (e.podium ? k.podium : 0) + e.sinkings * k.sinking, {
      kind: 'bonus',
      what: `${s.people[e.person].given} ${s.people[e.person].family}'s bonuses`,
    });
  }
  return out;
}

/** Each place's share of a tier's prize pool (1 first): weight (n + 1 − place)^spread; spread 0 shares evenly. */
export function prizeShares(n: number, spread: number): number[] {
  const w = Array.from({ length: n }, (_, i) =>
    Math.pow(n - i, Math.max(0, spread))
  );
  const total = w.reduce((a, b) => a + b, 0);
  return w.map((x) => x / total);
}

/** A place's prize in a tier under its rules. */
export const prizeAt = (
  s: CareerState,
  tier: number,
  place: number
): number => {
  const l = s.championships[tier];
  return Math.round(
    TUNING.money.prize[tier] *
      prizeShares(l.teams.length, l.rules.prizeSpread)[place - 1]
  );
};

/** A state with every tier's prize money paid by the final standings (section 13 calls it first at the season's end). */
export function prizes(s: CareerState): CareerState {
  let out = s;
  for (const l of s.championships)
    for (const team of l.teams) {
      out = paid(out, team, -prizeAt(s, l.id, standingOf(s, team)), {
        kind: 'prize',
        what: "the season's prize money",
      });
    }
  return out;
}

/** The money a rival manager will commit (Finance's share) of what its team's season is projected to leave above the
 *  debt floor: wages run on to the season's end, so a manager plans by the projection, not only the balance in hand. */
export const roomOf = (s: CareerState, team: number, finance: number): number =>
  commitment(finance, projection(s, team).end, s.teams[team].debtFloor);

/** The ledger's projection: balance at the season's end from what is committed, with its lines. */
interface Projection {
  balance: number;
  races: number;
  perRace: PerRace;
  prize: number;
  end: number;
}
export function projection(s: CareerState, team: number): Projection {
  const c = s.teams[team];
  const races = racesLeft(s);
  const r = perRace(s, team);
  const prize = prizeAt(s, c.tier, standingOf(s, team));
  return {
    balance: c.balance,
    races,
    perRace: r,
    prize,
    end: Math.round(c.balance + races * r.net + prize),
  };
}

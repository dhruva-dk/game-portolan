// Contracts (Phase B section 5): when one runs out, its last days, who a team may sign and what it costs, signing and
// releasing, expiry at the season's end, and the young people who enter the market each season. The player's team and
// every rival sign and release through these same functions.

import type { Offer } from '../office.ts';
import { paid } from './balance.ts';
import { between, within, type Dice } from './dice.ts';
import { fullName } from './names.ts';
import { renewalMove, moraleIn } from './morale.ts';
import { post } from './post.ts';
import { makePerson } from './recruit.ts';
import type { Contract, Person } from './roles.ts';
import { openSeat, seatOf, seated, unseated, type Seat } from './seats.ts';
import { YEAR, stars } from './stars.ts';
import { unscheduled } from './queue.ts';
import type { CareerState, Team } from './state.ts';
import { TUNING } from './tuning.ts';

const M = TUNING.market;
const ROUNDS = TUNING.calendar.rounds;

/** Whether this season's races are all sailed (its off-season). */
export const seasonOver = (s: CareerState): boolean =>
  s.round >= ROUNDS && s.race === null;

/** Races still to sail this season. */
export const racesLeft = (s: CareerState): number =>
  Math.max(0, ROUNDS - s.round);

/** The day a season ends (its last race day). */
export function seasonEndDay(s: CareerState, season: number): number {
  const cal = s.calendar;
  return cal ? cal.end + (season - cal.season) * YEAR : 0;
}

/** The day a contract runs out (none for an chairman's or the player's). */
export const endDay = (s: CareerState, c: Contract): number =>
  c.ends === null ? Number.POSITIVE_INFINITY : seasonEndDay(s, c.ends);

/** The season at whose end a contract of so many seasons signed today runs out: this one counts while races remain. */
export const contractEnds = (s: CareerState, seasons: number): number =>
  s.season + seasons - 1 + (seasonOver(s) ? 1 : 0);

/** Whether a contract is in its last days, when other teams may approach and sign without a break clause. */
export const closing = (s: CareerState, c: Contract): boolean =>
  c.ends !== null &&
  c.ends <= s.season &&
  endDay(s, c) - s.day <= M.closingDays;

/** A person's level, the tier they belong in: their team's, or, out of contract, by their stars. */
export function levelOf(s: CareerState, g: Person): number {
  if (g.contract) return s.teams[g.contract.team].tier;
  const st = stars(g);
  return st >= M.levelStars[0] ? 0 : st >= M.levelStars[1] ? 1 : 2;
}

/** Whether the tier rule bars a person from a team: more than one tier below their level, unless out of contract. */
export const belowThem = (s: CareerState, g: Person, team: Team): boolean =>
  g.contract !== null && team.tier - levelOf(s, g) > 1;

/** What signing costs beyond the fee: the break clause paid to their team (none if free, renewing, or closing). */
export function breakCost(s: CareerState, g: Person, team: number): number {
  const c = g.contract;
  if (!c || c.team === team || closing(s, c)) return 0;
  return c.breakClause ?? 0;
}

/** Dismissing pays the rest of this season's wage. */
export const dismissalCost = (s: CareerState, g: Person): number =>
  g.contract ? g.contract.wage * racesLeft(s) : 0;

/** The jobs a team's pit hold. */
const jobsOf = (s: CareerState, c: Team) =>
  c.staff.pit.map((id) => s.people[id].job);

/** A team's seat for a person it signs: the seat of the person they replace, if still aboard, else an open one. */
export function seatFor(s: CareerState, c: Team, offer: Offer): Seat | null {
  if (offer.replaces !== null) {
    const seat = seatOf(c, offer.replaces, (id) => s.people[id].job);
    if (seat) return seat;
  }
  return openSeat(c, offer.role, offer.status, jobsOf(s, c));
}

/** A state with a team changed. */
const withTeam = (s: CareerState, c: Team): CareerState => {
  const teams = [...s.teams];
  teams[c.id] = c;
  return { ...s, teams };
};

/** A state with a person changed. */
const withPerson = (s: CareerState, g: Person): CareerState => {
  const people = [...s.people];
  people[g.id] = g;
  return { ...s, people };
};

/** Bonds of a team's ships reset where a driver or mechanic changed. */
function rebonded(before: Team, after: Team): Team {
  const same = (k: 0 | 1) =>
    before.staff.ships[k].driver === after.staff.ships[k].driver &&
    before.staff.ships[k].mechanic === after.staff.ships[k].mechanic;
  return {
    ...after,
    bonds: [same(0) ? after.bonds[0] : 0, same(1) ? after.bonds[1] : 0],
  };
}

/** A state with every talk of a person (but one) ended, their counters' lapses taken off the queue. Their answer events
 *  stay, to find the talk gone and do nothing: one that was the player's still stops Advance on its mail. */
export function talksEnded(
  s: CareerState,
  person: number,
  keep: number | null
): CareerState {
  const ending = s.talks.filter((t) => t.person === person && t.id !== keep);
  if (ending.length === 0) return s;
  const ids = new Set(ending.map((t) => t.id));
  const out = unscheduled(s, (e) => e.kind === 'lapse' && ids.has(e.talk));
  return { ...out, talks: s.talks.filter((t) => !ids.has(t.id)) };
}

/** A state with a scout's work stopped (they left, or were cancelled), its report off the queue. */
export function scoutingStopped(s: CareerState, scout: number): CareerState {
  const job = s.scouting.find((x) => x.scout === scout);
  if (!job) return s;
  const out = unscheduled(
    s,
    (e) => e.kind === 'report' && e.scout === scout && e.team === job.team
  );
  return { ...out, scouting: s.scouting.filter((x) => x.scout !== scout) };
}

/** A state with a person out of their team and contract (to the free agents): their seat open, their scouting and their
 *  team's talks with them ended. Pays nothing: the caller pays what the release costs. */
export function released(s: CareerState, person: number): CareerState {
  const g = s.people[person];
  if (!g.contract) return s;
  const c = s.teams[g.contract.team];
  let out = withTeam(
    s,
    rebonded(c, { ...c, staff: unseated(c.staff, person) })
  );
  out = withPerson(out, {
    ...out.people[person],
    contract: null,
    job: g.role === 'pit' ? null : g.job,
  });
  out = scoutingStopped(out, person);
  return talksEnded(out, person, null);
}

/** What a signing writes: the team, the person, the offer agreed. */
export interface Signing {
  team: number;
  person: number;
  offer: Offer;
}

/** A state with a person signed to a team on an offer: a renewal keeps their seat; otherwise they leave their team (the
 *  break clause paid to it), the person they replace is dismissed (the rest of the season's wage paid), and they take
 *  the seat. The fee is paid. Every other talk of theirs ends. The caller has checked it (offerCheck). */
export function signed(s: CareerState, deal: Signing): CareerState {
  const { team, person, offer } = deal;
  const g = s.people[person];
  const renewal = g.contract?.team === team;
  let out = s;
  if (!renewal) {
    const clause = breakCost(out, g, team);
    if (g.contract && clause > 0) {
      out = paid(out, team, clause, {
        kind: 'break',
        what: `${g.given} ${g.family}'s break clause`,
      });
      out = paid(out, g.contract.team, -clause, {
        kind: 'break',
        what: `${g.given} ${g.family}'s break clause`,
      });
    }
    if (g.contract) out = released(out, person);
    const c0 = out.teams[team];
    if (
      offer.replaces !== null &&
      seatOf(c0, offer.replaces, (id) => out.people[id].job)
    ) {
      const seat = seatFor(out, c0, offer)!;
      const leaving = out.people[offer.replaces];
      out = paid(out, team, dismissalCost(out, leaving), {
        kind: 'dismissal',
        what: `${leaving.given} ${leaving.family} released`,
      });
      out = released(out, offer.replaces);
      out = seatedAt(out, team, person, seat);
    } else {
      out = seatedAt(
        out,
        team,
        person,
        seatFor(out, c0, { ...offer, replaces: null })!
      );
    }
  }
  out = paid(out, team, offer.fee, {
    kind: 'fee',
    what: `${g.given} ${g.family}'s signing fee`,
  });
  const now = out.people[person];
  const contract: Contract = {
    team,
    status: offer.status,
    wage: offer.wage,
    fee: offer.fee,
    ends: contractEnds(out, offer.seasons),
    podium: offer.podium,
    sinking: offer.sinking,
    breakClause: offer.breakClause,
    signed: out.day,
  };
  const known = now.known[team]
    ? now.known
    : {
        ...now.known,
        [team]: { day: out.day, last: stars(now), by: null, used: true },
      };
  out = withPerson(out, {
    ...now,
    contract,
    known,
    patience: TUNING.patience,
    silenced: false,
    morale: renewal ? moraleIn(now.morale + renewalMove()) : now.morale,
  });
  return talksEnded(out, person, null);
}

/** A state with a person put in a seat of a team (their pit job the seat's). */
function seatedAt(
  s: CareerState,
  team: number,
  person: number,
  seat: Seat
): CareerState {
  const c = s.teams[team];
  const out = withTeam(
    s,
    rebonded(c, { ...c, staff: seated(c.staff, seat, person) })
  );
  return seat.kind === 'pit'
    ? withPerson(out, { ...out.people[person], job: seat.job })
    : out;
}

/** A state with every contract that runs out at this season's end expired: those people go to the free agents, and the
 *  player is told of theirs. Called at the season's end (section 13), before the season's number moves on. */
export function expired(s: CareerState): CareerState {
  let out = s;
  for (const g of s.people) {
    const c = g.contract;
    if (!c || c.ends === null || c.ends > s.season || g.retired !== null)
      continue;
    out = released(out, g.id);
    out = post(out, {
      team: c.team,
      category: 'market',
      sender: null,
      kind: 'contractEnded',
      slots: { person: g.id },
      links: [{ to: 'person', id: g.id }],
    });
  }
  return out;
}

/** A state with this season's young people (16 to 19, low stars, their potential hidden) among the free agents. */
export function youngPeople(s: CareerState, roll: Dice): CareerState {
  const rand = roll.roll('young');
  const taken = new Set(
    s.people.filter((g) => g.retired === null).map(fullName)
  );
  const roles = [
    'driver',
    'driver',
    'pit',
    'pit',
    'pit',
    'mechanic',
    'designer',
    'scout',
  ] as const;
  const people = [...s.people];
  const [lo, hi] = TUNING.ages.young;
  for (let i = 0; i < M.young.count; i++) {
    const role = roles[i % roles.length];
    const colony = between(rand, 0, Math.max(0, s.colonies.length - 1));
    people.push(
      makePerson(
        {
          id: people.length,
          role,
          stars: within(rand, M.young.stars[0], M.young.stars[1]),
          years: between(rand, lo, hi),
          day: s.day,
          colony,
        },
        rand,
        taken
      )
    );
  }
  return { ...s, people };
}

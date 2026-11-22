// Contracts (Phase B section 5): when one runs out, its last days, who a crew may sign and what it costs, signing and
// releasing, expiry at the season's end, and the young gulls who enter the market each season. The player's crew and
// every rival sign and release through these same functions.

import type { Offer } from '../office.ts';
import { paid } from './coin.ts';
import { between, within, type Dice } from './dice.ts';
import { fullName } from './names.ts';
import { renewalMove, moraleIn } from './morale.ts';
import { post } from './post.ts';
import { makeGull } from './recruit.ts';
import type { Contract, Gull } from './roles.ts';
import { openSeat, seatOf, seated, unseated, type Seat } from './seats.ts';
import { YEAR, stars } from './stars.ts';
import { unscheduled } from './queue.ts';
import type { CareerState, Crew } from './state.ts';
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

/** The day a contract runs out (none for an elder's or the player's). */
export const endDay = (s: CareerState, c: Contract): number =>
  c.ends === null ? Number.POSITIVE_INFINITY : seasonEndDay(s, c.ends);

/** The season at whose end a contract of so many seasons signed today runs out: this one counts while races remain. */
export const contractEnds = (s: CareerState, seasons: number): number =>
  s.season + seasons - 1 + (seasonOver(s) ? 1 : 0);

/** Whether a contract is in its last days, when other crews may approach and sign without a break clause. */
export const closing = (s: CareerState, c: Contract): boolean =>
  c.ends !== null &&
  c.ends <= s.season &&
  endDay(s, c) - s.day <= M.closingDays;

/** A gull's level, the league they belong in: their crew's, or, out of contract, by their stars. */
export function levelOf(s: CareerState, g: Gull): number {
  if (g.contract) return s.crews[g.contract.crew].league;
  const st = stars(g);
  return st >= M.levelStars[0] ? 0 : st >= M.levelStars[1] ? 1 : 2;
}

/** Whether the league rule bars a gull from a crew: more than one league below their level, unless out of contract. */
export const belowThem = (s: CareerState, g: Gull, crew: Crew): boolean =>
  g.contract !== null && crew.league - levelOf(s, g) > 1;

/** What signing costs beyond the fee: the break clause paid to their crew (none if free, renewing, or closing). */
export function breakCost(s: CareerState, g: Gull, crew: number): number {
  const c = g.contract;
  if (!c || c.crew === crew || closing(s, c)) return 0;
  return c.breakClause ?? 0;
}

/** Dismissing pays the rest of this season's wage. */
export const dismissalCost = (s: CareerState, g: Gull): number =>
  g.contract ? g.contract.wage * racesLeft(s) : 0;

/** The jobs a crew's flight hold. */
const jobsOf = (s: CareerState, c: Crew) =>
  c.staff.flight.map((id) => s.gulls[id].job);

/** A crew's seat for a gull it signs: the seat of the gull they replace, if still aboard, else an open one. */
export function seatFor(s: CareerState, c: Crew, offer: Offer): Seat | null {
  if (offer.replaces !== null) {
    const seat = seatOf(c, offer.replaces, (id) => s.gulls[id].job);
    if (seat) return seat;
  }
  return openSeat(c, offer.role, offer.status, jobsOf(s, c));
}

/** A state with a crew changed. */
const withCrew = (s: CareerState, c: Crew): CareerState => {
  const crews = [...s.crews];
  crews[c.id] = c;
  return { ...s, crews };
};

/** A state with a gull changed. */
const withGull = (s: CareerState, g: Gull): CareerState => {
  const gulls = [...s.gulls];
  gulls[g.id] = g;
  return { ...s, gulls };
};

/** Bonds of a crew's ships reset where a captain or bosun changed. */
function rebonded(before: Crew, after: Crew): Crew {
  const same = (k: 0 | 1) =>
    before.staff.ships[k].captain === after.staff.ships[k].captain &&
    before.staff.ships[k].bosun === after.staff.ships[k].bosun;
  return {
    ...after,
    bonds: [same(0) ? after.bonds[0] : 0, same(1) ? after.bonds[1] : 0],
  };
}

/** A state with every talk of a gull (but one) ended, their counters' lapses taken off the queue. Their answer events
 *  stay, to find the talk gone and do nothing: one that was the player's still stops Advance on its mail. */
export function talksEnded(
  s: CareerState,
  gull: number,
  keep: number | null
): CareerState {
  const ending = s.talks.filter((t) => t.gull === gull && t.id !== keep);
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
    (e) => e.kind === 'report' && e.scout === scout && e.crew === job.crew
  );
  return { ...out, scouting: s.scouting.filter((x) => x.scout !== scout) };
}

/** A state with a gull out of their crew and contract (to the free agents): their seat open, their scouting and their
 *  crew's talks with them ended. Pays nothing: the caller pays what the release costs. */
export function released(s: CareerState, gull: number): CareerState {
  const g = s.gulls[gull];
  if (!g.contract) return s;
  const c = s.crews[g.contract.crew];
  let out = withCrew(s, rebonded(c, { ...c, staff: unseated(c.staff, gull) }));
  out = withGull(out, {
    ...out.gulls[gull],
    contract: null,
    job: g.role === 'flight' ? null : g.job,
  });
  out = scoutingStopped(out, gull);
  return talksEnded(out, gull, null);
}

/** What a signing writes: the crew, the gull, the offer agreed. */
export interface Signing {
  crew: number;
  gull: number;
  offer: Offer;
}

/** A state with a gull signed to a crew on an offer: a renewal keeps their seat; otherwise they leave their crew (the
 *  break clause paid to it), the gull they replace is dismissed (the rest of the season's wage paid), and they take
 *  the seat. The fee is paid. Every other talk of theirs ends. The caller has checked it (offerCheck). */
export function signed(s: CareerState, deal: Signing): CareerState {
  const { crew, gull, offer } = deal;
  const g = s.gulls[gull];
  const renewal = g.contract?.crew === crew;
  let out = s;
  if (!renewal) {
    const clause = breakCost(out, g, crew);
    if (g.contract && clause > 0) {
      out = paid(out, crew, clause, {
        kind: 'break',
        what: `${g.given} ${g.family}'s break clause`,
      });
      out = paid(out, g.contract.crew, -clause, {
        kind: 'break',
        what: `${g.given} ${g.family}'s break clause`,
      });
    }
    if (g.contract) out = released(out, gull);
    const c0 = out.crews[crew];
    if (
      offer.replaces !== null &&
      seatOf(c0, offer.replaces, (id) => out.gulls[id].job)
    ) {
      const seat = seatFor(out, c0, offer)!;
      const leaving = out.gulls[offer.replaces];
      out = paid(out, crew, dismissalCost(out, leaving), {
        kind: 'dismissal',
        what: `${leaving.given} ${leaving.family} released`,
      });
      out = released(out, offer.replaces);
      out = seatedAt(out, crew, gull, seat);
    } else {
      out = seatedAt(
        out,
        crew,
        gull,
        seatFor(out, c0, { ...offer, replaces: null })!
      );
    }
  }
  out = paid(out, crew, offer.fee, {
    kind: 'fee',
    what: `${g.given} ${g.family}'s signing fee`,
  });
  const now = out.gulls[gull];
  const contract: Contract = {
    crew,
    status: offer.status,
    wage: offer.wage,
    fee: offer.fee,
    ends: contractEnds(out, offer.seasons),
    podium: offer.podium,
    sinking: offer.sinking,
    breakClause: offer.breakClause,
    signed: out.day,
  };
  const known = now.known[crew]
    ? now.known
    : {
        ...now.known,
        [crew]: { day: out.day, last: stars(now), by: null, used: true },
      };
  out = withGull(out, {
    ...now,
    contract,
    known,
    patience: TUNING.patience,
    silenced: false,
    morale: renewal ? moraleIn(now.morale + renewalMove()) : now.morale,
  });
  return talksEnded(out, gull, null);
}

/** A state with a gull put in a seat of a crew (their flight job the seat's). */
function seatedAt(
  s: CareerState,
  crew: number,
  gull: number,
  seat: Seat
): CareerState {
  const c = s.crews[crew];
  const out = withCrew(
    s,
    rebonded(c, { ...c, staff: seated(c.staff, seat, gull) })
  );
  return seat.kind === 'flight'
    ? withGull(out, { ...out.gulls[gull], job: seat.job })
    : out;
}

/** A state with every contract that runs out at this season's end expired: those gulls go to the free agents, and the
 *  player is told of theirs. Called at the season's end (section 13), before the season's number moves on. */
export function expired(s: CareerState): CareerState {
  let out = s;
  for (const g of s.gulls) {
    const c = g.contract;
    if (!c || c.ends === null || c.ends > s.season || g.retired !== null)
      continue;
    out = released(out, g.id);
    out = post(out, {
      crew: c.crew,
      category: 'market',
      sender: null,
      kind: 'contractEnded',
      slots: { gull: g.id },
      links: [{ to: 'gull', id: g.id }],
    });
  }
  return out;
}

/** A state with this season's young gulls (16 to 19, low stars, their potential hidden) among the free agents. */
export function youngGulls(s: CareerState, roll: Dice): CareerState {
  const rand = roll.roll('young');
  const taken = new Set(
    s.gulls.filter((g) => g.retired === null).map(fullName)
  );
  const roles = [
    'captain',
    'captain',
    'flight',
    'flight',
    'flight',
    'bosun',
    'shipwright',
    'scout',
  ] as const;
  const gulls = [...s.gulls];
  const [lo, hi] = TUNING.ages.young;
  for (let i = 0; i < M.young.count; i++) {
    const role = roles[i % roles.length];
    const colony = between(rand, 0, Math.max(0, s.colonies.length - 1));
    gulls.push(
      makeGull(
        {
          id: gulls.length,
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
  return { ...s, gulls };
}

// The hiring rows of a rival manager's review (Phase B section 6): fill an empty role, replace the weakest, renew,
// poach, scout, and the bid every offer is made at. Each reads the manager's stats (Talent Eye weighs potential over
// stars; Finance sets the coin committed; Negotiation the bid) and personality (the gambler's lower bar and bigger
// bids, the youth builder's eye for potential and long contracts for the young, the poacher's short ones), and acts
// only through the player's own checks: hiring.ts offerCheck and offered, scouting.ts scoutCheck and sent.

import type { Offer, Role, Status } from '../office.ts';
import { askFee } from './asks.ts';
import { breakCost, closing, dismissalCost, racesLeft } from './contracts.ts';
import type { Dice } from './dice.ts';
import { offerCheck, offered } from './hiring.ts';
import { effective } from './effective.ts';
import { knows, leagueOf, middle, sightOf, view } from './knowledge.ts';
import { bidShare, worth } from './leadership.ts';
import { askOf } from './market.ts';
import { wantsOut } from './morale.ts';
import { unit, type Gull, type GullOf } from './roles.ts';
import { inReach } from './staff.ts';
import type { Decide, Mind } from './rivals.ts';
import { openSeat, seatOf, seatRole } from './seats.ts';
import { scoutCheck, sent } from './scouting.ts';
import { age, potential, stars } from './stars.ts';
import { staffOf, type CareerState, type Crew, type Hands } from './state.ts';
import { TUNING } from './tuning.ts';

const R = TUNING.rivals;
const HIRED: readonly Role[] = [
  'captain',
  'bosun',
  'shipwright',
  'scout',
  'flight',
];

/** A gull's worth to a manager from the stars and potential they see: Talent Eye's weight on potential, more for a
 *  youth builder. */
export function worthTo(
  mind: Mind,
  seen: { stars: number; potential: number }
): number {
  const base = worth(mind.stats.talentEye, seen.stars, seen.potential);
  return mind.personality === 'youthBuilder'
    ? base + R.talentYouth * (seen.potential - seen.stars)
    : base;
}

/** A known gull's worth (exact stars and potential). */
const knownWorth = (mind: Mind, g: Gull): number =>
  worthTo(mind, { stars: stars(g), potential: potential(g) });

/** The bid a manager opens with: the ask × (1.1 − 0.3 × Negotiation u), a gambler's × 1.1; a fee of four races; the
 *  length by personality and age; a captain's bonuses as at the start; a break clause unless a good negotiator. */
export function bid(
  s: CareerState,
  mind: Mind,
  g: Gull,
  at: { status: Status; replaces: number | null }
): Offer {
  const ask = askOf(s, g, s.crews[mind.crew]);
  const wage = Math.ceil(
    ask.wage *
      bidShare(mind.stats.negotiation) *
      (mind.personality === 'gambler' ? R.bigBid : 1)
  );
  const p = R.personalities[mind.personality];
  const seasons = (age(g, s.day) < TUNING.wage.young ? p.young : p.other) as
    | 1
    | 2
    | 3;
  const captain = g.role === 'captain';
  const K = TUNING.contracts;
  return {
    role: g.role,
    status: at.status,
    wage,
    fee: askFee(wage),
    seasons,
    podium: captain ? Math.round(wage * K.podium) : 0,
    sinking: captain ? Math.round(wage * K.sinking) : 0,
    breakClause:
      unit(mind.stats.negotiation) >= 0.5 ? null : wage * R.breakRaces,
    replaces: at.replaces,
  };
}

/** What an offer commits of the crew's coin: fee, break clause, the dismissed one's pay, and the season's wages left. */
const cost = (s: CareerState, crew: number, g: Gull, o: Offer): number =>
  o.fee +
  breakCost(s, g, crew) +
  (o.replaces === null ? 0 : dismissalCost(s, s.gulls[o.replaces])) +
  o.wage * Math.max(1, racesLeft(s));

/** A state with an offer made and the Mind's room spent, if the offer is allowed and affordable; else null. */
function tryOffer(
  s: CareerState,
  mind: Mind,
  g: Gull,
  o: Offer,
  roll: Dice
): { state: CareerState; mind: Mind } | null {
  const c = cost(s, mind.crew, g, o);
  if (c > mind.room || offerCheck(s, mind.crew, g.id, o) !== null) return null;
  return {
    state: offered(s, mind.crew, g.id, o, roll),
    mind: { ...mind, room: mind.room - c },
  };
}

/** Whether a crew is already talking with a gull. */
const talking = (s: CareerState, crew: number, gull: number): boolean =>
  s.talks.some((t) => t.crew === crew && t.gull === gull);

/** The gulls a crew is talking with, as a set (a row adds those it makes offers to as it goes). */
const talkingWith = (s: CareerState, crew: number): Set<number> =>
  new Set(s.talks.filter((t) => t.crew === crew).map((t) => t.gull));

/** Gulls a crew knows who are not its own, alive and of a hired role, each with their worth to the manager, best
 *  first: the candidates it may bid for. */
function knownCandidates(
  s: CareerState,
  mind: Mind,
  employed: boolean | null
): { g: Gull; w: number }[] {
  const busy = talkingWith(s, mind.crew);
  return mind
    .known()
    .map((id) => s.gulls[id])
    .filter(
      (g) =>
        g.retired === null &&
        g.contract?.crew !== mind.crew &&
        HIRED.includes(g.role) &&
        (employed === null || (g.contract !== null) === employed) &&
        !busy.has(g.id)
    )
    .map((g) => ({ g, w: knownWorth(mind, g) }))
    .sort((a, b) => b.w - a.w || a.g.id - b.g.id);
}

/** A crew's open seats, less those its talks will fill: each as the role and status an offer names. */
export function openPosts(
  s: CareerState,
  c: Crew
): { role: Role; status: Status }[] {
  const out: { role: Role; status: Status }[] = [];
  let staff = c.staff;
  const pending = s.talks.filter(
    (t) =>
      t.crew === c.id &&
      t.offer.replaces === null &&
      s.gulls[t.gull].contract?.crew !== c.id
  );
  const jobs = staff.flight.map((id) => s.gulls[id].job);
  for (const role of HIRED)
    for (const status of role === 'captain'
      ? (['ship', 'reserve'] as const)
      : (['staff'] as const)) {
      let waiting = pending.filter(
        (t) => t.offer.role === role && t.offer.status === status
      ).length;
      for (
        let seat = openSeat({ ...c, staff }, role, status, jobs);
        seat;
        seat = openSeat({ ...c, staff }, role, status, jobs)
      ) {
        // take the seat (by a stand-in id no gull has) so the next open one is found
        staff = seatedAway(staff, seat);
        if (seat.kind === 'flight') jobs.push(seat.job);
        if (waiting > 0) waiting--;
        else out.push({ role, status });
      }
    }
  return out;
}

/** A staff with a seat taken by no one in particular (−1), to count seats. */
function seatedAway(
  staff: Crew['staff'],
  seat: NonNullable<ReturnType<typeof openSeat>>
): Crew['staff'] {
  switch (seat.kind) {
    case 'captain':
    case 'bosun': {
      const ships: Hands[] = [{ ...staff.ships[0] }, { ...staff.ships[1] }];
      ships[seat.ship] = { ...ships[seat.ship], [seat.kind]: -1 };
      return { ...staff, ships: [ships[0], ships[1]] };
    }
    case 'reserve':
      return { ...staff, reserve: -1 };
    case 'shipwright':
      return { ...staff, shipwright: -1 };
    case 'scout':
      return { ...staff, scouts: [...staff.scouts, -1] };
    case 'flight':
      return { ...staff, flight: [...staff.flight, -1] };
    case 'manager':
      return { ...staff, manager: -1 };
  }
}

/** Fill an empty role: the best affordable known candidate for each open post (scouting first is the scout row's). */
export const fill: Decide = (s, mind0, roll) => {
  let state = s,
    mind = mind0;
  const posts = openPosts(s, s.crews[mind.crew]);
  if (posts.length === 0) return { state, mind };
  const pool = knownCandidates(s, mind, null);
  const busy = talkingWith(s, mind.crew);
  for (const post of posts) {
    for (const { g } of pool) {
      if (g.role !== post.role || busy.has(g.id)) continue;
      const r = tryOffer(
        state,
        mind,
        g,
        bid(state, mind, g, { status: post.status, replaces: null }),
        roll
      );
      if (!r) continue;
      ({ state, mind } = r);
      busy.add(g.id);
      break;
    }
  }
  return { state, mind };
};

/** The bar a candidate must clear over the weakest: 1 star, a gambler's 0.5. */
const bar = (mind: Mind): number =>
  mind.personality === 'gambler' ? R.betterGambler : R.better;

/** A crew's weakest of a role (captains: those sailing), by the manager's worth, with no talk of theirs under way. */
function weakest(s: CareerState, mind: Mind, role: Role): Gull | null {
  const c = s.crews[mind.crew];
  const held = staffOf(c)
    .map((id) => s.gulls[id])
    .filter(
      (g) =>
        g.role === role &&
        !g.player &&
        !talking(s, mind.crew, g.id) &&
        (role !== 'captain' || seatOf(c, g.id, () => null)?.kind === 'captain')
    );
  if (
    s.talks.some(
      (t) =>
        t.crew === mind.crew &&
        t.offer.role === role &&
        t.offer.replaces !== null
    )
  )
    return null;
  return (
    held.sort(
      (a, b) => knownWorth(mind, a) - knownWorth(mind, b) || a.id - b.id
    )[0] ?? null
  );
}

/** Replace the weakest of each role with a known candidate better by the bar: free agents (replace), or another
 *  crew's gulls whose break clause is payable or whose contract is closing (poach). */
function upgrade(employed: boolean): Decide {
  return (s, mind0, roll) => {
    let state = s,
      mind = mind0;
    const pool = knownCandidates(s, mind, employed);
    for (const role of HIRED) {
      const low = weakest(state, mind, role);
      if (!low) continue;
      const seat = seatOf(
        state.crews[mind.crew],
        low.id,
        (id) => state.gulls[id].job
      );
      if (!seat) continue;
      const floor = knownWorth(mind, low) + bar(mind);
      const ranked = pool
        .filter(
          (x) =>
            x.g.role === role &&
            x.w >= floor &&
            !talking(state, mind.crew, x.g.id)
        )
        .map((x) => x.g);
      for (const g of ranked) {
        const r = tryOffer(
          state,
          mind,
          g,
          bid(state, mind, g, {
            status: seatRole(seat).status,
            replaces: low.id,
          }),
          roll
        );
        if (!r) continue;
        ({ state, mind } = r);
        break;
      }
    }
    return { state, mind };
  };
}

export const replace: Decide = upgrade(false);
export const poach: Decide = upgrade(true);

/** Renew the best staff in their contracts' last days: each whose worth is at least renewBelow of the best of their
 *  role on the crew, best first, while the coin allows. */
export const renew: Decide = (s, mind0, roll) => {
  let state = s,
    mind = mind0;
  const c = s.crews[mind.crew];
  const staff = staffOf(c)
    .map((id) => s.gulls[id])
    .filter((g) => HIRED.includes(g.role) && !g.player);
  const best = (role: Role) =>
    Math.max(
      ...staff.filter((g) => g.role === role).map((g) => knownWorth(mind, g))
    );
  const due = staff
    .filter(
      (g) =>
        g.contract &&
        closing(s, g.contract) &&
        !wantsOut(g.morale) &&
        !talking(s, mind.crew, g.id) &&
        knownWorth(mind, g) >= R.renewBelow * best(g.role)
    )
    .sort((a, b) => knownWorth(mind, b) - knownWorth(mind, a) || a.id - b.id);
  for (const g of due) {
    const seat = seatOf(
      state.crews[mind.crew],
      g.id,
      (id) => state.gulls[id].job
    );
    if (!seat) continue;
    const r = tryOffer(
      state,
      mind,
      g,
      bid(state, mind, g, { status: seatRole(seat).status, replaces: null }),
      roll
    );
    if (r) ({ state, mind } = r);
  }
  return { state, mind };
};

/** The candidates a crew's review looks over: all of them, or, in a crowded market (the days off, when contracts have
 *  ended), an evenly spread sample of `scoutLooks` from a drawn offset. */
function looked<T>(pool: readonly T[], roll: Dice): readonly T[] {
  const n = R.scoutLooks;
  if (pool.length <= n) return pool;
  const step = pool.length / n,
    from = roll.roll('scout')() * step;
  return Array.from({ length: n }, (_, i) => pool[Math.floor(from + i * step)]);
}

/** Scout: each free scout is sent to the unknown candidate of highest expected worth (the middle of the ranges the
 *  crew sees) among the roles it needs: open posts first, then any whose weakest the candidate would clear by the bar. */
export const scout: Decide = (s, mind, roll) => {
  const c = s.crews[mind.crew];
  const free = c.staff.scouts.filter(
    (id) => !s.scouting.some((x) => x.scout === id)
  );
  if (free.length === 0) return { state: s, mind };
  const open = new Set(openPosts(s, c).map((p) => p.role));
  const floors = new Map<Role, number>();
  for (const role of HIRED) {
    if (open.has(role)) floors.set(role, Number.NEGATIVE_INFINITY);
    else {
      const low = weakest(s, mind, role);
      if (low) floors.set(role, knownWorth(mind, low) + bar(mind));
    }
  }
  const sight = sightOf(s, mind.crew);
  const scouted = new Set(
    s.scouting.filter((x) => x.crew === mind.crew).map((x) => x.gull)
  );
  const reaches = free.map(
    (id) => effective(s.gulls[id] as GullOf<'scout'>, null).reach
  );
  const reached = new Map<number | null, boolean>();
  const inSome = (league: number | null): boolean => {
    if (!reached.has(league))
      reached.set(
        league,
        reaches.some((r) => inReach(r, c.league, league))
      );
    return reached.get(league)!;
  };
  const pool = s.gulls.filter(
    (g) =>
      floors.has(g.role) &&
      g.retired === null &&
      !g.player &&
      !scouted.has(g.id) &&
      (g.contract === null ||
        g.contract.breakClause !== null ||
        closing(s, g.contract)) &&
      !knows(s, mind.crew, g) &&
      inSome(leagueOf(s, g))
  );
  const ranked = looked(pool, roll)
    .map((g) => {
      const v = view(s, mind.crew, g.id, sight);
      return {
        g,
        w:
          worthTo(mind, {
            stars: middle(v.stars),
            potential: middle(v.potential),
          }) + (open.has(g.role) ? R.openFirst : 0),
      };
    })
    .filter((x) => x.w >= (floors.get(x.g.role) ?? 0))
    .sort((a, b) => b.w - a.w || a.g.id - b.g.id);
  let state = s;
  for (const id of free) {
    const pick = ranked.find(
      (x) =>
        !scouted.has(x.g.id) &&
        scoutCheck(state, mind.crew, id, x.g.id) === null
    );
    if (!pick) continue;
    scouted.add(pick.g.id);
    state = sent(state, mind.crew, id, pick.g.id);
  }
  return { state, mind };
};

// The hiring rows of a rival manager's review (Phase B section 6): fill an empty role, replace the weakest, renew,
// poach, scout, and the bid every offer is made at. Each reads the manager's stats (Talent Eye weighs potential over
// stars; Finance sets the balance committed; Negotiation the bid) and personality (the gambler's lower bar and bigger
// bids, the youth builder's eye for potential and long contracts for the young, the poacher's short ones), and acts
// only through the player's own checks: hiring.ts offerCheck and offered, scouting.ts scoutCheck and sent.

import type { Offer, Role, Status } from '../office.ts';
import { askFee } from './asks.ts';
import { breakCost, closing, dismissalCost, racesLeft } from './contracts.ts';
import type { Dice } from './dice.ts';
import { offerCheck, offered } from './hiring.ts';
import { effective } from './effective.ts';
import { knows, tierOf, middle, sightOf, view } from './knowledge.ts';
import { bidShare, worth } from './leadership.ts';
import { askOf } from './market.ts';
import { wantsOut } from './morale.ts';
import { unit, type Person, type PersonOf } from './roles.ts';
import { inReach } from './staff.ts';
import type { Decide, Mind } from './rivals.ts';
import { openSeat, seatOf, seatRole } from './seats.ts';
import { scoutCheck, sent } from './scouting.ts';
import { age, potential, stars } from './stars.ts';
import { staffOf, type CareerState, type Team, type Hands } from './state.ts';
import { TUNING } from './tuning.ts';

const R = TUNING.rivals;
const HIRED: readonly Role[] = [
  'driver',
  'mechanic',
  'designer',
  'scout',
  'pit',
];

/** A person's worth to a manager from the stars and potential they see: Talent Eye's weight on potential, more for a
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

/** A known person's worth (exact stars and potential). */
const knownWorth = (mind: Mind, g: Person): number =>
  worthTo(mind, { stars: stars(g), potential: potential(g) });

/** The bid a manager opens with: the ask × (1.1 − 0.3 × Negotiation u), a gambler's × 1.1; a fee of four races; the
 *  length by personality and age; a driver's bonuses as at the start; a break clause unless a good negotiator. */
export function bid(
  s: CareerState,
  mind: Mind,
  g: Person,
  at: { status: Status; replaces: number | null }
): Offer {
  const ask = askOf(s, g, s.teams[mind.team]);
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
  const driver = g.role === 'driver';
  const K = TUNING.contracts;
  return {
    role: g.role,
    status: at.status,
    wage,
    fee: askFee(wage),
    seasons,
    podium: driver ? Math.round(wage * K.podium) : 0,
    sinking: driver ? Math.round(wage * K.sinking) : 0,
    breakClause:
      unit(mind.stats.negotiation) >= 0.5 ? null : wage * R.breakRaces,
    replaces: at.replaces,
  };
}

/** What an offer commits of the team's balance: fee, break clause, the dismissed one's pay, and the season's wages left. */
const cost = (s: CareerState, team: number, g: Person, o: Offer): number =>
  o.fee +
  breakCost(s, g, team) +
  (o.replaces === null ? 0 : dismissalCost(s, s.people[o.replaces])) +
  o.wage * Math.max(1, racesLeft(s));

/** A state with an offer made and the Mind's room spent, if the offer is allowed and affordable; else null. */
function tryOffer(
  s: CareerState,
  mind: Mind,
  g: Person,
  o: Offer,
  roll: Dice
): { state: CareerState; mind: Mind } | null {
  const c = cost(s, mind.team, g, o);
  if (c > mind.room || offerCheck(s, mind.team, g.id, o) !== null) return null;
  return {
    state: offered(s, mind.team, g.id, o, roll),
    mind: { ...mind, room: mind.room - c },
  };
}

/** Whether a team is already talking with a person. */
const talking = (s: CareerState, team: number, person: number): boolean =>
  s.talks.some((t) => t.team === team && t.person === person);

/** The people a team is talking with, as a set (a row adds those it makes offers to as it goes). */
const talkingWith = (s: CareerState, team: number): Set<number> =>
  new Set(s.talks.filter((t) => t.team === team).map((t) => t.person));

/** People a team knows who are not its own, alive and of a hired role, each with their worth to the manager, best
 *  first: the candidates it may bid for. */
function knownCandidates(
  s: CareerState,
  mind: Mind,
  employed: boolean | null
): { g: Person; w: number }[] {
  const busy = talkingWith(s, mind.team);
  return mind
    .known()
    .map((id) => s.people[id])
    .filter(
      (g) =>
        g.retired === null &&
        g.contract?.team !== mind.team &&
        HIRED.includes(g.role) &&
        (employed === null || (g.contract !== null) === employed) &&
        !busy.has(g.id)
    )
    .map((g) => ({ g, w: knownWorth(mind, g) }))
    .sort((a, b) => b.w - a.w || a.g.id - b.g.id);
}

/** A team's open seats, less those its talks will fill: each as the role and status an offer names. */
export function openPosts(
  s: CareerState,
  c: Team
): { role: Role; status: Status }[] {
  const out: { role: Role; status: Status }[] = [];
  let staff = c.staff;
  const pending = s.talks.filter(
    (t) =>
      t.team === c.id &&
      t.offer.replaces === null &&
      s.people[t.person].contract?.team !== c.id
  );
  const jobs = staff.pit.map((id) => s.people[id].job);
  for (const role of HIRED)
    for (const status of role === 'driver'
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
        // take the seat (by a stand-in id no person has) so the next open one is found
        staff = seatedAway(staff, seat);
        if (seat.kind === 'pit') jobs.push(seat.job);
        if (waiting > 0) waiting--;
        else out.push({ role, status });
      }
    }
  return out;
}

/** A staff with a seat taken by no one in particular (−1), to count seats. */
function seatedAway(
  staff: Team['staff'],
  seat: NonNullable<ReturnType<typeof openSeat>>
): Team['staff'] {
  switch (seat.kind) {
    case 'driver':
    case 'mechanic': {
      const ships: Hands[] = [{ ...staff.ships[0] }, { ...staff.ships[1] }];
      ships[seat.ship] = { ...ships[seat.ship], [seat.kind]: -1 };
      return { ...staff, ships: [ships[0], ships[1]] };
    }
    case 'reserve':
      return { ...staff, reserve: -1 };
    case 'designer':
      return { ...staff, designer: -1 };
    case 'scout':
      return { ...staff, scouts: [...staff.scouts, -1] };
    case 'pit':
      return { ...staff, pit: [...staff.pit, -1] };
    case 'manager':
      return { ...staff, manager: -1 };
  }
}

/** Fill an empty role: the best affordable known candidate for each open post (scouting first is the scout row's). */
export const fill: Decide = (s, mind0, roll) => {
  let state = s,
    mind = mind0;
  const posts = openPosts(s, s.teams[mind.team]);
  if (posts.length === 0) return { state, mind };
  const pool = knownCandidates(s, mind, null);
  const busy = talkingWith(s, mind.team);
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

/** A team's weakest of a role (drivers: those sailing), by the manager's worth, with no talk of theirs under way. */
function weakest(s: CareerState, mind: Mind, role: Role): Person | null {
  const c = s.teams[mind.team];
  const held = staffOf(c)
    .map((id) => s.people[id])
    .filter(
      (g) =>
        g.role === role &&
        !g.player &&
        !talking(s, mind.team, g.id) &&
        (role !== 'driver' || seatOf(c, g.id, () => null)?.kind === 'driver')
    );
  if (
    s.talks.some(
      (t) =>
        t.team === mind.team &&
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
 *  team's people whose break clause is payable or whose contract is closing (poach). */
function upgrade(employed: boolean): Decide {
  return (s, mind0, roll) => {
    let state = s,
      mind = mind0;
    const pool = knownCandidates(s, mind, employed);
    for (const role of HIRED) {
      const low = weakest(state, mind, role);
      if (!low) continue;
      const seat = seatOf(
        state.teams[mind.team],
        low.id,
        (id) => state.people[id].job
      );
      if (!seat) continue;
      const floor = knownWorth(mind, low) + bar(mind);
      const ranked = pool
        .filter(
          (x) =>
            x.g.role === role &&
            x.w >= floor &&
            !talking(state, mind.team, x.g.id)
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
 *  role on the team, best first, while the balance allows. */
export const renew: Decide = (s, mind0, roll) => {
  let state = s,
    mind = mind0;
  const c = s.teams[mind.team];
  const staff = staffOf(c)
    .map((id) => s.people[id])
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
        !talking(s, mind.team, g.id) &&
        knownWorth(mind, g) >= R.renewBelow * best(g.role)
    )
    .sort((a, b) => knownWorth(mind, b) - knownWorth(mind, a) || a.id - b.id);
  for (const g of due) {
    const seat = seatOf(
      state.teams[mind.team],
      g.id,
      (id) => state.people[id].job
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

/** The candidates a team's review looks over: all of them, or, in a crowded market (the days off, when contracts have
 *  ended), an evenly spread sample of `scoutLooks` from a drawn offset. */
function looked<T>(pool: readonly T[], roll: Dice): readonly T[] {
  const n = R.scoutLooks;
  if (pool.length <= n) return pool;
  const step = pool.length / n,
    from = roll.roll('scout')() * step;
  return Array.from({ length: n }, (_, i) => pool[Math.floor(from + i * step)]);
}

/** Scout: each free scout is sent to the unknown candidate of highest expected worth (the middle of the ranges the
 *  team sees) among the roles it needs: open posts first, then any whose weakest the candidate would clear by the bar. */
export const scout: Decide = (s, mind, roll) => {
  const c = s.teams[mind.team];
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
  const sight = sightOf(s, mind.team);
  const scouted = new Set(
    s.scouting.filter((x) => x.team === mind.team).map((x) => x.person)
  );
  const reaches = free.map(
    (id) => effective(s.people[id] as PersonOf<'scout'>, null).reach
  );
  const reached = new Map<number | null, boolean>();
  const inSome = (tier: number | null): boolean => {
    if (!reached.has(tier))
      reached.set(
        tier,
        reaches.some((r) => inReach(r, c.tier, tier))
      );
    return reached.get(tier)!;
  };
  const pool = s.people.filter(
    (g) =>
      floors.has(g.role) &&
      g.retired === null &&
      !g.player &&
      !scouted.has(g.id) &&
      (g.contract === null ||
        g.contract.breakClause !== null ||
        closing(s, g.contract)) &&
      !knows(s, mind.team, g) &&
      inSome(tierOf(s, g))
  );
  const ranked = looked(pool, roll)
    .map((g) => {
      const v = view(s, mind.team, g.id, sight);
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
        scoutCheck(state, mind.team, id, x.g.id) === null
    );
    if (!pick) continue;
    scouted.add(pick.g.id);
    state = sent(state, mind.team, id, pick.g.id);
  }
  return { state, mind };
};

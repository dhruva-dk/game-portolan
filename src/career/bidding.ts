// The hiring rows of a rival manager's review: fill an empty role, replace the weakest, renew,
// poach, scout, and the bid every offer is made at. Each reads the manager's stats (Talent Eye weighs potential over
// stars; Finance sets the balance committed; Negotiation the bid) and personality (the gambler's lower bar and bigger
// bids, the youth builder's eye for potential and long contracts for the young, the poacher's short ones), and acts
// only through the player's own checks: hiring.ts offerCheck and offered, scouting.ts scoutCheck and sent.

import { known } from './canon.ts';
import type { Offer, Role, Status } from '../office/command.ts';
import { askFee, seasons } from './asks.ts';
import { breakCost, closing, dismissalCost, racesLeft } from './contracts.ts';
import type { Dice } from './dice.ts';
import { offerCheck, offered } from './hiring.ts';
import { effective } from './effective.ts';
import { knows, tierOf, middle, sightOf, view } from './knowledge.ts';
import { bidShare, worth } from './leadership.ts';
import { answer, askOf } from './market.ts';
import { wantsOut } from './morale.ts';
import { unit, type Person, inRole } from './roles.ts';
import { inReach } from './staff.ts';
import type { Decide, Mind } from './rivals.ts';
import { openSeat, seatOf, seatRole } from './seats.ts';
import { scoutCheck, sent } from './scouting.ts';
import { age, potential, stars } from './stars.ts';
import { staffOf, type CareerState, type Team } from './state.ts';
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
function worthTo(
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
function bid(
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
  const length = seasons(age(g, s.day) < TUNING.wage.young ? p.young : p.other);
  const driver = g.role === 'driver';
  const K = TUNING.contracts;
  return {
    role: g.role,
    status: at.status,
    wage,
    fee: askFee(wage),
    seasons: length,
    podium: driver ? Math.round(wage * K.podium) : 0,
    sinking: driver ? Math.round(wage * K.sinking) : 0,
    breakClause:
      unit(mind.stats.negotiation) >= 0.5 ? null : wage * R.breakRaces,
    replaces: at.replaces,
  };
}

/** What an offer commits of the team's balance: fee, break clause, the dismissed one's pay, and the season's wages left
 *  (none for a renewal: its seat is paid already, and its terms are the coming seasons'). */
const cost = (s: CareerState, team: number, g: Person, o: Offer): number =>
  o.fee +
  breakCost(s, g, team) +
  (o.replaces === null ? 0 : dismissalCost(s, s.people[o.replaces])) +
  (g.contract?.team === team ? 0 : o.wage * Math.max(1, racesLeft(s)));

/**
 * The offer a manager makes of a bid, knowing the person (every candidate is
 * scouted, their wants read): the bid itself if they would take it; the
 * counter they would make to it, if its wage is within what the manager
 * meets (the ask × counterMost, by Negotiation: hiring.ts meetsCounter); null
 * if they would refuse whatever the money.
 */
function meant(s: CareerState, mind: Mind, g: Person, o: Offer): Offer | null {
  const team = s.teams[mind.team],
    a = answer(s, g, team, o);
  if (a.kind === 'accept') return o;
  if (a.kind === 'refuse') return null;
  const most =
    askOf(s, g, team).wage *
    R.counterMost *
    (bidShare(mind.stats.negotiation) / bidShare(0));
  return a.offer.wage <= most ? a.offer : null;
}

/** A state with an offer made and the Mind's room spent, if the person would take it and it is allowed and affordable; else null. */
function tryOffer(
  s: CareerState,
  mind: Mind,
  g: Person,
  bidden: Offer,
  roll: Dice
): { state: CareerState; mind: Mind } | null {
  const o = meant(s, mind, g, bidden);
  if (!o) return null;
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
function openPosts(s: CareerState, c: Team): { role: Role; status: Status }[] {
  const out: { role: Role; status: Status }[] = [];
  let staff = c.staff;
  const pending = s.talks.filter(
    (t) =>
      t.team === c.id &&
      t.offer.replaces === null &&
      s.people[t.person].contract?.team !== c.id
  );
  for (const role of HIRED)
    for (const status of role === 'driver'
      ? (['ship', 'reserve'] as const)
      : (['staff'] as const)) {
      let waiting = pending.filter(
        (t) => t.offer.role === role && t.offer.status === status
      ).length;
      for (
        let seat = openSeat({ ...c, staff }, role, status);
        seat;
        seat = openSeat({ ...c, staff }, role, status)
      ) {
        // take the seat (by a stand-in id no person has) so the next open one is found
        staff = seatedAway(staff, seat);
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
      const kind = seat.kind;
      return {
        ...staff,
        ships: staff.ships.map((h, k) =>
          k === seat.ship ? { ...h, [kind]: -1 } : h
        ),
      };
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

/** The free agents of some roles a team does not know, by their worth as it sees them (the middle of each range), best
 *  first: those a post is offered to when no one the team knows will take it. */
function strangers(
  s: CareerState,
  mind: Mind,
  roles: ReadonlySet<Role>,
  roll: Dice
): { g: Person; w: number }[] {
  const sight = sightOf(s, mind.team);
  const pool = s.people.filter(
    (g) =>
      roles.has(g.role) &&
      g.retired === null &&
      !g.player &&
      g.contract === null &&
      !knows(mind.team, g)
  );
  return looked(pool, roll)
    .map((g) => {
      const v = view(s, mind.team, g.id, sight);
      return {
        g,
        w: worthTo(mind, {
          stars: middle(v.stars),
          potential: middle(v.potential),
        }),
      };
    })
    .sort((a, b) => b.w - a.w || a.g.id - b.g.id);
}

/** Fill an empty role: for each open post the best affordable candidate who will come, of those the team knows first,
 *  then of the free agents it does not (an empty seat is not left for want of a scout's report). */
export const fill: Decide = (s, mind0, roll) => {
  let state = s,
    mind = mind0;
  const posts = openPosts(s, s.teams[mind.team]);
  if (posts.length === 0) return { state, mind };
  const pool = [
    ...knownCandidates(s, mind, null),
    ...strangers(s, mind, new Set(posts.map((p) => p.role)), roll),
  ];
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
        (role !== 'driver' || seatOf(c, g.id)?.kind === 'driver')
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
      const seat = seatOf(state.teams[mind.team], low.id);
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
    const seat = seatOf(state.teams[mind.team], g.id);
    if (!seat) continue;
    // no signing fee to one already aboard: a renewal is not held up by the season's low water
    const b = bid(state, mind, g, {
      status: seatRole(seat).status,
      replaces: null,
    });
    const o = {
      ...b,
      fee: 0,
      seasons: askOf(state, g, state.teams[mind.team]).seasons,
    };
    const r = tryOffer(state, mind, g, o, roll);
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
    (id) => effective(inRole(s.people[id], 'scout'), null).reach
  );
  const reached = new Map<number | null, boolean>();
  const inSome = (tier: number | null): boolean => {
    if (!reached.has(tier))
      reached.set(
        tier,
        reaches.some((r) => inReach(r, c.tier, tier))
      );
    return known(reached.get(tier));
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
      !knows(mind.team, g) &&
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

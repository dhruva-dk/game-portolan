import { test } from 'node:test';
import assert from 'node:assert/strict';
import { apply } from '../src/career/apply.ts';
import type { Command } from '../src/career/commands.ts';
import { buildCost } from '../src/career/rules/build-cost.ts';
import { interestOn } from '../src/career/rules/race-money.ts';
import { releaseCost } from '../src/career/rules/release-cost.ts';
import { standings } from '../src/career/rules/standing.ts';
import {
  ROLES,
  type CareerState,
  type Person,
  type Role,
  type Team,
} from '../src/career/state.ts';
import { updateTeam } from '../src/career/teams.ts';
import { CONTRACTS, DOTS, STAND_IN } from '../src/career/tuning.ts';
import { lobbyView, type LobbyButton } from '../src/career/views/lobby.ts';
import { teamView, type SeatView } from '../src/career/views/team.ts';
import { dealView, type CandidateView } from '../src/career/views/deal.ts';
import { negotiationView, type Edit } from '../src/career/views/negotiation.ts';
import { standardClause } from '../src/career/rules/clause.ts';
import { NEGOTIATION } from '../src/career/tuning.ts';
import { askingWage } from '../src/career/rules/ask.ts';
import { reportCost } from '../src/career/rules/report-cost.ts';
import { stars } from '../src/career/rules/stars.ts';
import { SCOUTING } from '../src/career/tuning.ts';
import { dismissed, owing, rehearsed } from '../src/app/rehearse.ts';

const YOURS = 0;
const FRESH = rehearsed('views', 0);
const EARLY = rehearsed('views', 3);
const MID = rehearsed('views', 14);
const STOP = rehearsed('views', 10);

function sent(state: CareerState, command: Command): CareerState {
  const applied = apply(state, command);
  if (!applied.ok) throw new Error(`refused for ${applied.reason}`);
  return applied.state;
}

const mine = (state: CareerState, change: (team: Team) => Team) =>
  updateTeam(state, YOURS, change);

const shown = (state: CareerState): LobbyButton[] =>
  lobbyView(state).buttons.map((b) => b.id);

const dot = (state: CareerState, id: LobbyButton): boolean | undefined =>
  lobbyView(state).buttons.find((b) => b.id === id)?.dot;

const seeing = (state: CareerState, ids: string[]): CareerState => ({
  ...state,
  seen: ids,
});

const seat = (state: CareerState, role: Role): SeatView => {
  const found = teamView(state).seats.find((s) => s.role === role);
  if (found === undefined) throw new Error(`no ${role} seat`);
  return found;
};

function employee(state: CareerState, role: Role): Person {
  const id = state.teams[YOURS].seats[role];
  const person = state.people.find((p) => p.id === id);
  if (person === undefined) throw new Error(`no ${role} hired`);
  return person;
}

const withContract = (
  state: CareerState,
  id: number,
  racesLeft: number
): CareerState => ({
  ...state,
  people: state.people.map((p) =>
    p.id === id && p.contract !== null
      ? { ...p, contract: { ...p.contract, racesLeft } }
      : p
  ),
});

const hiredRole = (state: CareerState): Role => {
  const role = ROLES.find((r) => state.teams[YOURS].seats[r] !== null);
  if (role === undefined) throw new Error('nobody hired');
  return role;
};

const noDeals = (state: CareerState): CareerState =>
  mine(state, (t) => ({
    ...t,
    deals: { driver: null, designer: null, mechanic: null },
  }));

test('a fresh lobby shows Team alone, with its bubble, and race one of ten', () => {
  const view = lobbyView(FRESH);
  assert.deepEqual(shown(FRESH), ['team']);
  assert.equal(view.bubble, 'team');
  assert.deepEqual(view.race, { race: 1, of: 10 });
  assert.equal(view.money.interest, null);
  assert.equal(view.standing.moved, 0);
  assert.equal(view.standing.opens, false);
  assert.equal(view.seed, FRESH.seed);
});

test('lobby buttons follow the seen list and stay once shown', () => {
  const all = seeing(FRESH, ['team', 'ship', 'sponsors', 'opponents']);
  assert.deepEqual(shown(all), ['ship', 'team', 'sponsors', 'opponents']);
  assert.equal(lobbyView(all).bubble, null);
  assert.equal(lobbyView(all).standing.opens, true);
  assert.deepEqual(shown(seeing(FRESH, ['team'])), ['team']);
  assert.deepEqual(shown(seeing(FRESH, ['team', 'sponsors'])), [
    'team',
    'sponsors',
  ]);
});

test('a lobby bubble shows its button in step, one bubble at a time', () => {
  const twoRaces = seeing(rehearsed('views', 2), ['team']);
  const view = lobbyView(twoRaces);
  const designer = twoRaces.teams[YOURS].seats.designer !== null;
  assert.equal(view.bubble, designer ? 'ship' : 'sponsors');
  assert.ok(shown(twoRaces).includes(view.bubble ?? 'team'));
  assert.ok(!shown(twoRaces).includes('opponents'));
  const after = dismissed(twoRaces);
  assert.equal(lobbyView(after).bubble, null);
  assert.ok(shown(after).includes('sponsors'));
});

test('the ship bubble waits for a designer', () => {
  const seen = seeing(FRESH, ['team']);
  assert.equal(lobbyView(seen).bubble, null);
  const role = hiredRole(EARLY);
  const someone = employee(EARLY, role);
  const withDesigner = mine(seeing(FRESH, ['team']), (t) => ({
    ...t,
    seats: { ...t.seats, designer: someone.id },
  }));
  assert.equal(lobbyView(withDesigner).bubble, 'ship');
  assert.ok(shown(withDesigner).includes('ship'));
});

test('the standing arrow counts the places moved since before the last race', () => {
  const place = standings(MID)[YOURS];
  const up = { ...MID, lastStanding: MID.lastStanding.map(() => place + 4) };
  const down = { ...MID, lastStanding: MID.lastStanding.map(() => place - 2) };
  const still = { ...MID, lastStanding: MID.lastStanding.map(() => place) };
  assert.equal(lobbyView(up).standing.moved, 4);
  assert.equal(lobbyView(down).standing.moved, -2);
  assert.equal(lobbyView(still).standing.moved, 0);
  assert.equal(lobbyView(MID).standing.place, place);
});

test('the money slip carries the interest due only while in debt', () => {
  const debt = mine(MID, (t) => ({ ...t, balance: -2345 }));
  assert.equal(lobbyView(debt).money.balance, -2345);
  assert.equal(lobbyView(debt).money.interest, interestOn(-2345));
  assert.ok((lobbyView(debt).money.interest ?? 0) > 0);
  const even = mine(MID, (t) => ({ ...t, balance: 0 }));
  assert.equal(lobbyView(even).money.interest, null);
});

test('the race slip shows the next race, and nothing but winter at the stop', () => {
  assert.equal(STOP.phase, 'offseason');
  assert.equal(lobbyView(STOP).race, null);
  assert.equal(MID.phase, 'lobby');
  assert.deepEqual(lobbyView(MID).race, { race: MID.race, of: 10 });
});

test('the Team dot: an empty seat with candidates, or a contract nearly run', () => {
  const quiet = noDeals(seeing(FRESH, ['team']));
  assert.equal(dot(quiet, 'team'), false);
  const dealt = mine(quiet, (t) => ({
    ...t,
    deals: { ...t.deals, mechanic: { candidates: [1], locked: null } },
  }));
  assert.equal(dot(dealt, 'team'), true);
  const empty = mine(quiet, (t) => ({
    ...t,
    deals: { ...t.deals, mechanic: { candidates: [], locked: null } },
  }));
  assert.equal(dot(empty, 'team'), false);
  const role = hiredRole(MID);
  const hired = noDeals(
    mine(MID, (t) => ({
      ...t,
      seats: {
        driver: null,
        designer: null,
        mechanic: null,
        [role]: t.seats[role],
      },
    }))
  );
  const id = employee(hired, role).id;
  assert.equal(dot(withContract(hired, id, DOTS.racesLeft + 1), 'team'), false);
  assert.equal(dot(withContract(hired, id, DOTS.racesLeft), 'team'), true);
});

test('an employee in a filled seat with a deal for it raises no Team dot', () => {
  const role = hiredRole(MID);
  const id = employee(MID, role).id;
  const filled = withContract(
    mine(noDeals(MID), (t) => ({
      ...t,
      seats: { driver: null, designer: null, mechanic: null, [role]: id },
      deals: {
        driver: null,
        designer: null,
        mechanic: null,
        [role]: { candidates: [1], locked: null },
      },
    })),
    id,
    20
  );
  assert.equal(dot(filled, 'team'), false);
});

test('the Ship dot: a designer and no focus, or a build of 8 or more you can afford', () => {
  const seen = seeing(FRESH, ['team', 'ship']);
  assert.equal(dot(seen, 'ship'), false);
  const designer = employee(MID, 'designer');
  const unfocused = mine(seen, (t) => ({
    ...t,
    focus: null,
    seats: { ...t.seats, designer: designer.id },
  }));
  assert.equal(dot(unfocused, 'ship'), true);
  const focused = mine(unfocused, (t) => ({ ...t, focus: { line: 'hull' } }));
  assert.equal(dot(focused, 'ship'), false);
  const ahead = (gap: number, balance: number) =>
    mine(seen, (t) => ({
      ...t,
      balance,
      design: { ...t.design, keel: t.ships[1].fitted.keel + gap },
    }));
  const fitted = seen.teams[YOURS].ships[1].fitted.keel;
  const cost = buildCost(fitted + DOTS.buildGap, fitted, null);
  assert.equal(dot(ahead(DOTS.buildGap, cost), 'ship'), true);
  assert.equal(dot(ahead(DOTS.buildGap, cost - 1), 'ship'), false);
  assert.equal(dot(ahead(DOTS.buildGap - 1, cost * 10), 'ship'), false);
});

test('the Sponsors dot: an empty slot and an offer waiting', () => {
  const seen = seeing(MID, ['team', 'sponsors']);
  const offer = {
    sponsor: 1,
    fee: 100,
    bonus: 200,
    objective: 'top10',
    racesLeft: 5,
  } as const;
  const open = mine(seen, (t) => ({
    ...t,
    sponsors: [null, t.sponsors[1], t.sponsors[2]],
    offers: [offer],
  }));
  assert.equal(dot(open, 'sponsors'), true);
  const none = mine(open, (t) => ({ ...t, offers: [] }));
  assert.equal(dot(none, 'sponsors'), false);
  const full = mine(open, (t) => ({ ...t, sponsors: [offer, offer, offer] }));
  assert.equal(dot(full, 'sponsors'), false);
});

test('Uncle sits in the empty driver seat with the stand-in stats and no age, wage or contract', () => {
  const driver = seat(FRESH, 'driver');
  assert.equal(driver.card?.who, 'uncle');
  assert.equal(driver.card?.age, null);
  assert.equal(driver.card?.wage, null);
  assert.equal(driver.card?.racesLeft, null);
  assert.equal(driver.card?.portrait, null);
  assert.deepEqual(
    driver.card?.stats.map((s) => [s.stat, s.value.lo, s.value.hi]),
    Object.entries(STAND_IN).map(([stat, v]) => [stat, v, v])
  );
  assert.deepEqual(driver.card?.stars, { lo: 0, hi: 0 });
  assert.equal(driver.renew, null);
  assert.equal(driver.release, null);
});

test('an empty designer or mechanic seat has no card', () => {
  for (const role of ['designer', 'mechanic'] as const) {
    const empty = seat(FRESH, role);
    assert.equal(empty.card, null);
    assert.equal(empty.renew, null);
    assert.equal(empty.release, null);
  }
});

test('an employee card is exact, in the stat order of the role, with its contract in races left', () => {
  const role = hiredRole(MID);
  const person = employee(MID, role);
  const card = seat(MID, role).card;
  assert.equal(card?.who, 'person');
  assert.equal(card?.person, person.id);
  assert.equal(card?.name, person.name);
  assert.equal(card?.age, person.age);
  assert.equal(card?.racesLeft, person.contract?.racesLeft);
  assert.deepEqual(card?.wage, {
    lo: person.contract?.wage,
    hi: person.contract?.wage,
  });
  assert.deepEqual(
    card?.stats.map((s) => s.value.lo),
    person.stats
  );
  assert.ok(card?.stats.every((s) => s.value.lo === s.value.hi));
  assert.equal(card?.stars.lo, card?.stars.hi);
});

test('Renew is faint above ten races left, and Release shows its cost', () => {
  const role = hiredRole(MID);
  const person = employee(MID, role);
  const at = (n: number) => seat(withContract(MID, person.id, n), role);
  assert.deepEqual(at(CONTRACTS.renewWithin + 1).renew, { faint: true });
  assert.deepEqual(at(CONTRACTS.renewWithin).renew, { faint: false });
  assert.deepEqual(at(1).renew, { faint: false });
  for (const n of [1, 30])
    assert.deepEqual(at(n).release, {
      cost: releaseCost(person.contract?.wage ?? 0, n),
    });
  assert.equal(at(30).card?.racesLeft, 30);
});

test('the scouting marker is on one seat and moves with SetScoutSeat', () => {
  const marked = (s: CareerState) =>
    teamView(s)
      .seats.filter((x) => x.scouting)
      .map((x) => x.role);
  assert.deepEqual(marked(FRESH), ['designer']);
  const moved = sent(FRESH, {
    type: 'SetScoutSeat',
    team: YOURS,
    role: 'mechanic',
  });
  assert.deepEqual(marked(moved), ['mechanic']);
});

test('a deal waiting gives the seat its candidates, by portrait', () => {
  const role = ROLES.find(
    (r) => (MID.teams[YOURS].deals[r]?.candidates.length ?? 0) > 0
  );
  assert.ok(role !== undefined);
  const ids = MID.teams[YOURS].deals[role]?.candidates ?? [];
  const portraits = ids.map(
    (id) => MID.people.find((p) => p.id === id)?.portrait
  );
  assert.deepEqual(seat(MID, role).deal, portraits);
  assert.deepEqual(seat(noDeals(MID), role).deal, []);
});

test('Release empties the seat, and an empty driver seat brings Uncle back', () => {
  const role = hiredRole(MID);
  const person = employee(MID, role);
  const released = sent(MID, {
    type: 'Release',
    team: YOURS,
    person: person.id,
  });
  const after = seat(released, role);
  if (role === 'driver') assert.equal(after.card?.who, 'uncle');
  else assert.equal(after.card, null);
});

const DEALT = rehearsed('views', 14, ['mechanic']);

function dealtRole(state: CareerState): Role {
  const role = ROLES.find(
    (r) => (state.teams[YOURS].deals[r]?.candidates.length ?? 0) >= 3
  );
  if (role === undefined) throw new Error('no full deal');
  return role;
}

const personAt = (state: CareerState, id: number | null): Person => {
  const person = state.people.find((p) => p.id === id);
  if (person === undefined) throw new Error(`no person ${id}`);
  return person;
};

const first = (state: CareerState, role: Role): CandidateView => {
  const found = dealView(state, role).candidates[0];
  if (found === undefined) throw new Error(`no ${role} candidate`);
  return found;
};

test('a deal shows its candidates in order, as ranges that hold the true stats', () => {
  const role = dealtRole(DEALT);
  const view = dealView(DEALT, role);
  assert.equal(view.role, role);
  assert.deepEqual(
    view.candidates.map((c) => c.card.person),
    DEALT.teams[YOURS].deals[role]?.candidates
  );
  let ranged = 0;
  for (const c of view.candidates) {
    const person = personAt(DEALT, c.card.person);
    assert.equal(c.exact, false);
    assert.equal(c.card.racesLeft, null);
    assert.equal(c.card.age, person.age);
    c.card.stats.forEach((s, i) => {
      assert.ok(s.value.lo <= person.stats[i] && person.stats[i] <= s.value.hi);
      assert.ok(s.value.lo >= 1 && s.value.hi <= 20);
      if (s.value.lo < s.value.hi) ranged++;
    });
    const lo = stars(c.card.stats.map((s) => s.value.lo)),
      hi = stars(c.card.stats.map((s) => s.value.hi));
    assert.deepEqual(c.card.stars, { lo, hi });
    assert.deepEqual(c.card.wage, {
      lo: askingWage(lo, person.wageFactor),
      hi: askingWage(hi, person.wageFactor),
    });
    assert.deepEqual(c.report, {
      cost: reportCost(hi),
      faint: false,
      why: null,
    });
    assert.deepEqual(c.approach, {
      cost: SCOUTING.approach,
      faint: false,
      why: null,
    });
    assert.deepEqual(c.negotiate, { faint: false, why: null });
    assert.equal(c.pinned, false);
  }
  assert.ok(ranged > 0);
});

test('a report makes one candidate exact, at a cost, and its Report faint', () => {
  const role = dealtRole(DEALT);
  const before = first(DEALT, role);
  const id = before.card.person ?? -1;
  const reported = sent(DEALT, { type: 'BuyReport', team: YOURS, person: id });
  const after = first(reported, role);
  const person = personAt(reported, id);
  assert.equal(
    reported.teams[YOURS].balance,
    DEALT.teams[YOURS].balance - before.report.cost
  );
  assert.equal(after.exact, true);
  assert.deepEqual(
    after.card.stats.map((s) => s.value),
    person.stats.map((v) => ({ lo: v, hi: v }))
  );
  const exactStars = stars(person.stats);
  assert.deepEqual(after.card.stars, { lo: exactStars, hi: exactStars });
  const asked = askingWage(exactStars, person.wageFactor);
  assert.deepEqual(after.card.wage, { lo: asked, hi: asked });
  assert.equal(after.report.faint, true);
  assert.equal(after.report.why, 'held');
  assert.equal(dealView(reported, role).candidates[1]?.exact, false);
});

test('an approach pins the candidate and makes its Approach faint', () => {
  const role = dealtRole(DEALT);
  const id = first(DEALT, role).card.person ?? -1;
  const approached = sent(DEALT, { type: 'Approach', team: YOURS, person: id });
  const after = first(approached, role);
  assert.equal(after.pinned, true);
  assert.deepEqual(after.approach, {
    cost: SCOUTING.approach,
    faint: true,
    why: 'held',
  });
  assert.equal(dealView(approached, role).candidates[1]?.pinned, false);
  assert.equal(
    approached.teams[YOURS].balance,
    DEALT.teams[YOURS].balance - SCOUTING.approach
  );
});

test('an offer locks the deal: Negotiate goes faint for the other candidates', () => {
  const role = dealtRole(DEALT);
  const [one, two] = dealView(DEALT, role).candidates;
  const id = one.card.person ?? -1;
  const offered = sent(DEALT, {
    type: 'Offer',
    team: YOURS,
    person: id,
    terms: { wage: 10, seasons: 1, fee: 0, clause: 0 },
  });
  const after = dealView(offered, role).candidates;
  assert.deepEqual(after[0].negotiate, { faint: false, why: null });
  assert.deepEqual(after[1].negotiate, { faint: true, why: 'locked' });
  assert.equal(two.negotiate.faint, false);
  assert.equal(after[1].report.faint, false);
});

test('a short balance makes Report and Approach faint for funds', () => {
  const role = dealtRole(DEALT);
  const short = owing(DEALT, SCOUTING.leastReport - 1);
  for (const c of dealView(short, role).candidates) {
    assert.deepEqual(
      [c.report.faint, c.report.why, c.approach.faint, c.approach.why],
      [true, 'funds', true, 'funds']
    );
    assert.equal(c.negotiate.faint, false);
  }
  const between = owing(DEALT, SCOUTING.approach - 1);
  const cheap = dealView(between, role).candidates.find(
    (c) => c.report.cost < SCOUTING.approach
  );
  if (cheap !== undefined) {
    assert.equal(cheap.report.faint, false);
    assert.equal(cheap.approach.why, 'funds');
  }
});

test('the holder is the seat holder, Uncle in an empty driver seat, or no one', () => {
  for (const role of ROLES) {
    const holder = dealView(STOP, role).holder;
    const person = employee(STOP, role);
    assert.equal(holder?.person, person.id);
    assert.deepEqual(
      holder?.stats.map((s) => s.value.lo),
      person.stats
    );
    const released = sent(STOP, {
      type: 'Release',
      team: YOURS,
      person: person.id,
    });
    const after = dealView(released, role).holder;
    if (role === 'driver') {
      assert.equal(after?.who, 'uncle');
      assert.deepEqual(
        after?.stats.map((s) => s.value.lo),
        teamView(released).seats[0].card?.stats.map((s) => s.value.lo)
      );
    } else assert.equal(after, null);
    assert.ok(dealView(released, role).candidates.length > 0);
  }
});

test('an approached rival makes a deal of one, with its team and clause', () => {
  const view = dealView(DEALT, 'mechanic');
  assert.equal(view.candidates.length, 1);
  const [only] = view.candidates;
  const person = personAt(DEALT, only.card.person);
  const contract = person.contract;
  assert.ok(contract !== null && contract.team !== YOURS);
  const team = DEALT.teams[contract.team];
  assert.deepEqual(only.rival, {
    team: contract.team,
    name: team.name,
    emblem: team.emblem,
    livery: team.livery,
    clause: contract.clause,
  });
  assert.equal(only.pinned, false);
  assert.equal(only.approach.faint, false);
});

test('a role with no deal, or a deal emptied by the draw, shows no candidates', () => {
  const role = ROLES.find((r) => DEALT.teams[YOURS].deals[r] === null);
  assert.ok(role !== undefined);
  assert.deepEqual(dealView(DEALT, role).candidates, []);
  const emptied = mine(DEALT, (t) => ({
    ...t,
    deals: { ...t.deals, [role]: { candidates: [], locked: null } },
  }));
  assert.deepEqual(dealView(emptied, role).candidates, []);
});

const talking = (state: CareerState, id: number, edit: Edit | null = null) => {
  const view = negotiationView(state, id, edit);
  if (view === null) throw new Error(`no person ${id}`);
  return view;
};

const terms = (wage: number, clause: number | null = null): Edit => ({
  wage,
  seasons: 2,
  fee: 0,
  clause,
});

function wageWhere(
  state: CareerState,
  id: number,
  fits: (score: number) => boolean
): number {
  const { least, most, step } = NEGOTIATION.wage;
  for (let wage = least; wage <= most; wage += step)
    if (fits(talking(state, id, terms(wage)).willingness.lo)) return wage;
  throw new Error('no such wage');
}

function reportedDriver(): { state: CareerState; id: number } {
  const id = first(DEALT, 'driver').card.person ?? -1;
  return {
    state: sent(DEALT, { type: 'BuyReport', team: YOURS, person: id }),
    id,
  };
}

const offering = (state: CareerState, id: number, wage: number) =>
  sent(state, {
    type: 'Offer',
    team: YOURS,
    person: id,
    terms: talking(state, id, terms(wage)).terms,
  });

test('a negotiation starts at the low asking wage, two seasons, no fee and the standard clause', () => {
  const c = first(DEALT, 'driver');
  const view = talking(DEALT, c.card.person ?? -1);
  const wage = c.card.wage?.lo ?? -1;
  assert.deepEqual(view.terms, {
    wage,
    seasons: 2,
    fee: 0,
    clause: standardClause(wage),
  });
  assert.equal(view.clause.following, true);
  assert.deepEqual(view.seasons.choices, [1, 2, 3]);
  assert.deepEqual(
    [view.wage.step, view.fee.step, view.clause.step],
    [NEGOTIATION.wage.step, NEGOTIATION.fee.step, NEGOTIATION.clause.step]
  );
  assert.equal(view.renewal, false);
  assert.deepEqual(view.attempts, { used: 0, most: NEGOTIATION.attempts });
  assert.equal(view.answer, null);
  assert.equal(view.counter, null);
});

test('the clause follows the wage until set by hand, and terms stay within their limits', () => {
  const id = first(DEALT, 'driver').card.person ?? -1;
  assert.equal(
    talking(DEALT, id, terms(1230)).terms.clause,
    standardClause(1230)
  );
  const set = talking(DEALT, id, terms(1230, 2000));
  assert.equal(set.terms.clause, 2000);
  assert.equal(set.clause.following, false);
  const wild = talking(DEALT, id, {
    wage: 99999,
    seasons: 3,
    fee: -5,
    clause: 999999,
  }).terms;
  assert.deepEqual(wild, {
    wage: NEGOTIATION.wage.most,
    seasons: 3,
    fee: 0,
    clause: NEGOTIATION.clause.most,
  });
});

test('willingness is a band without a report and a known score with one', () => {
  const id = first(DEALT, 'driver').card.person ?? -1;
  const band = talking(DEALT, id, terms(400)).willingness;
  assert.equal(band.exact, false);
  assert.ok(band.lo < band.hi);
  const { state } = reportedDriver();
  const known = talking(state, id, terms(400)).willingness;
  assert.equal(known.exact, true);
  assert.equal(known.lo, known.hi);
  assert.ok(band.lo <= known.lo && known.lo <= band.hi);
  assert.deepEqual(
    [known.least, known.most, known.counters, known.signs],
    [
      NEGOTIATION.bar.lo,
      NEGOTIATION.bar.hi,
      NEGOTIATION.counters,
      NEGOTIATION.signs,
    ]
  );
});

test('the three answers: a refusal and a counter use attempts, a signing takes the seat', () => {
  const { state, id } = reportedDriver();
  const refused = offering(
    state,
    id,
    wageWhere(state, id, () => true)
  );
  const after = talking(refused, id);
  assert.equal(after.answer, 'refused');
  assert.equal(after.attempts.used, 1);
  const countering = wageWhere(state, id, (s) => s >= NEGOTIATION.counters);
  const countered = talking(offering(refused, id, countering), id);
  assert.equal(countered.answer, 'countered');
  assert.equal(countered.attempts.used, 2);
  assert.ok(countered.counter !== null && countered.counter.wage > countering);
  assert.equal(countered.counter?.faint, false);
  const signing = wageWhere(state, id, (s) => s >= NEGOTIATION.signs);
  const signed = offering(state, id, signing);
  assert.equal(talking(signed, id).answer, 'signed');
  assert.equal(signed.teams[YOURS].seats.driver, id);
});

test('with three attempts used Offer is faint, and an open counter can still be accepted', () => {
  const { state, id } = reportedDriver();
  const low = wageWhere(state, id, () => true);
  const countering = wageWhere(state, id, (s) => s >= NEGOTIATION.counters);
  const twice = offering(offering(state, id, low), id, low);
  const used = offering(twice, id, countering);
  const view = talking(used, id);
  assert.equal(view.attempts.used, 3);
  assert.deepEqual(view.offer, { faint: true, why: 'attempts' });
  assert.deepEqual([view.counter?.faint, view.counter?.why], [false, null]);
  const accepted = sent(used, {
    type: 'AcceptCounter',
    team: YOURS,
    person: id,
  });
  assert.equal(talking(accepted, id).answer, 'signed');
  assert.equal(accepted.teams[YOURS].seats.driver, id);
});

test('the cost to sign adds the fee, a rival clause and the release of the holder', () => {
  const id = first(DEALT, 'driver').card.person ?? -1;
  const holder = employee(DEALT, 'driver');
  const release = releaseCost(
    holder.contract?.wage ?? 0,
    holder.contract?.racesLeft ?? 0
  );
  const view = talking(DEALT, id, { ...terms(300), fee: 700 });
  assert.equal(view.cost.cost, 700 + release);
  assert.equal(view.cost.after, DEALT.teams[YOURS].balance - view.cost.cost);
  const rival = dealView(DEALT, 'mechanic').candidates[0];
  const rid = rival.card.person ?? -1;
  const buyout = talking(DEALT, rid, terms(3000));
  const mechanic = employee(DEALT, 'mechanic');
  assert.equal(
    buyout.cost.cost,
    (rival.rival?.clause ?? 0) +
      releaseCost(
        mechanic.contract?.wage ?? 0,
        mechanic.contract?.racesLeft ?? 0
      )
  );
  assert.deepEqual(buyout.rival, rival.rival);
});

test('funds: the cost turns red and Offer goes faint, whatever the answer would be', () => {
  const id = first(DEALT, 'driver').card.person ?? -1;
  const poor = owing(DEALT, 50);
  const view = talking(poor, id, terms(300));
  assert.equal(view.cost.funds, true);
  assert.deepEqual(view.offer, { faint: true, why: 'funds' });
  assert.equal(talking(DEALT, id, terms(300)).cost.funds, false);
});

test('a renewal costs the fee alone, and is open only at ten races left or fewer', () => {
  const role = hiredRole(MID);
  const person = employee(MID, role);
  const at = (racesLeft: number) =>
    MID.people.map((p) =>
      p.id === person.id && p.contract
        ? { ...p, contract: { ...p.contract, racesLeft } }
        : p
    );
  const near = { ...MID, people: at(CONTRACTS.renewWithin) };
  const view = talking(near, person.id, { ...terms(500), fee: 1200 });
  assert.equal(view.renewal, true);
  assert.equal(view.card.who, 'person');
  assert.deepEqual(
    view.card.stats,
    teamView(near).seats.find((s) => s.role === role)?.card?.stats
  );
  assert.equal(view.holder, null);
  assert.equal(view.cost.cost, 1200);
  assert.equal(view.willingness.exact, true);
  assert.equal(view.offer.faint, false);
  const far = { ...MID, people: at(CONTRACTS.renewWithin + 1) };
  assert.deepEqual(talking(far, person.id).offer, { faint: true, why: 'seat' });
});

test('a negotiation view is null for no such person', () => {
  assert.equal(negotiationView(DEALT, -1), null);
});

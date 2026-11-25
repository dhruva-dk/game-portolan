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
import { dismissed, rehearsed } from '../src/app/rehearse.ts';

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

test('Uncle sits in the empty driver seat with the stand-in stats and no age, wage or pips', () => {
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

test('an employee card is exact, in the stat order of the role, with pips for races left', () => {
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

test('a deal waiting shows its candidates portraits above the seat', () => {
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

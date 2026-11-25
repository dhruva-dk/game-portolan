import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  apply,
  newCareer,
  runPolicy,
  type Applied,
} from '../src/career/apply.ts';
import type { Command } from '../src/career/commands.ts';
import { matchSetup, planetName } from '../src/career/fit.ts';
import { personOf } from '../src/career/lookup.ts';
import { SPONSOR_ROSTER } from '../src/career/names.ts';
import { minimumTerms } from '../src/career/policy/means.ts';
import { publishNews } from '../src/career/record/race.ts';
import { repossess } from '../src/career/record/pay.ts';
import {
  isStreak,
  lineLeader,
  nextStreak,
  standingOrder,
  standings,
} from '../src/career/rules/standing.ts';
import { standInResult } from '../src/career/standin.ts';
import {
  LINES,
  NEWS_KINDS,
  ROLES,
  type CareerState,
  type Line,
  type NewsEvent,
  type NewsKind,
  type Person,
  type Role,
  type Sponsor,
  type Team,
} from '../src/career/state.ts';
import { LEAGUE, NEWS, UNLOCK } from '../src/career/tuning.ts';
import type { MatchResult } from '../src/sim/result.ts';

const YOURS = 0;
const RIVAL = 9;
const OTHER = 21;
const SEASON = LEAGUE.racesPerSeason;
const RICH = 1000000;

const careerOf = (seed: string): CareerState =>
  newCareer({
    seed,
    name: 'Gull Racing',
    livery: { dye: 3, pattern: 1 },
    emblem: 2,
  });

const BASE = careerOf('herald');

function accepted(applied: Applied): CareerState {
  if (!applied.ok) throw new Error(`refused for ${applied.reason}`);
  assert.deepEqual(applied.refused, []);
  return applied.state;
}

const send = (state: CareerState, command: Command): CareerState =>
  accepted(apply(state, command));

function changeTeam(
  state: CareerState,
  index: number,
  change: (team: Team) => Team
): CareerState {
  return {
    ...state,
    teams: state.teams.map((team, i) => (i === index ? change(team) : team)),
  };
}

const changePerson = (
  state: CareerState,
  id: number,
  change: (person: Person) => Person
): CareerState => ({
  ...state,
  people: state.people.map((p) => (p.id === id ? change(p) : p)),
});

function person(state: CareerState, id: number | null): Person {
  const found = id === null ? null : personOf(state, id);
  if (found === null) throw new Error(`no person ${id}`);
  return found;
}

const racing = (state: CareerState, race = 4): CareerState => ({
  ...state,
  phase: 'racing',
  race,
});

const resultOf = (state: CareerState): MatchResult =>
  standInResult(matchSetup(state, { hands: 'player' }));

function wonBy(result: MatchResult, team: number, slot: number): MatchResult {
  const target = team * LEAGUE.shipsPerTeam + slot;
  const first = result.ships.findIndex((ship) => ship.place === 1);
  const ships = result.ships.map((ship, i) => {
    if (i === target) return result.ships[first];
    return i === first ? result.ships[target] : ship;
  });
  return { ...result, ships };
}

const record = (state: CareerState, result: MatchResult): CareerState =>
  send(state, { type: 'RecordRace', team: YOURS, result });

const pending = (before: CareerState, after: CareerState): NewsEvent[] =>
  after.pendingEvents.slice(before.pendingEvents.length);

const ofKind = (events: readonly NewsEvent[], kind: NewsKind): NewsEvent[] =>
  events.filter((event) => event.kind === kind);

const freeAgents = (state: CareerState, role: Role): Person[] =>
  state.people.filter((p) => p.contract === null && p.role === role);

function withDeal(
  state: CareerState,
  team: number,
  role: Role,
  ids: number[]
): CareerState {
  return changeTeam(state, team, (t) => ({
    ...t,
    balance: RICH,
    deals: { ...t.deals, [role]: { candidates: ids, locked: null } },
  }));
}

function willing(state: CareerState, team: number, people: Person[]): Person {
  const found = people.find((p) => minimumTerms(state, team, p) !== null);
  if (found === undefined) throw new Error('nobody would sign');
  return found;
}

function offerAtMinimum(
  state: CareerState,
  team: number,
  who: Person
): Command {
  const terms = minimumTerms(state, team, who);
  if (terms === null) throw new Error('unwilling');
  return { type: 'Offer', team, person: who.id, terms };
}

const noDesigners = (state: CareerState): CareerState => ({
  ...state,
  teams: state.teams.map((team) => ({
    ...team,
    seats: { ...team.seats, designer: null },
  })),
});

function withLine(
  state: CareerState,
  line: Line,
  levels: Record<number, number>
): CareerState {
  return {
    ...state,
    teams: state.teams.map((team, index) => ({
      ...team,
      design: { ...team.design, [line]: levels[index] ?? 10 },
    })),
  };
}

test('hired: a free agent signing for any team names the team and the person', () => {
  for (const team of [YOURS, RIVAL]) {
    const pool = freeAgents(BASE, 'designer');
    const dealt = withDeal(
      BASE,
      team,
      'designer',
      pool.map((p) => p.id)
    );
    const who = willing(dealt, team, pool);
    const next = send(dealt, offerAtMinimum(dealt, team, who));
    assert.equal(person(next, who.id).contract?.team, team);
    assert.deepEqual(pending(dealt, next), [
      { kind: 'hired', team, person: who.name, personId: who.id },
    ]);
  }
});

test('hired: an offer that is not signed, and a renewal, tell nothing', () => {
  const pool = freeAgents(BASE, 'driver');
  const dealt = withDeal(
    BASE,
    YOURS,
    'driver',
    pool.map((p) => p.id)
  );
  const who = willing(dealt, YOURS, pool);
  const command = offerAtMinimum(dealt, YOURS, who);
  if (command.type !== 'Offer') throw new Error('not an offer');
  const low = send(dealt, {
    ...command,
    terms: { ...command.terms, wage: 10, clause: 300000 },
  });
  assert.equal(person(low, who.id).contract, null);
  assert.deepEqual(low.pendingEvents, []);
  const staff = person(BASE, BASE.teams[RIVAL].seats.mechanic);
  const due = changeTeam(
    changePerson(BASE, staff.id, (p) => ({
      ...p,
      contract: p.contract && { ...p.contract, racesLeft: 2 },
    })),
    RIVAL,
    (t) => ({ ...t, balance: RICH })
  );
  const renewed = send(due, offerAtMinimum(due, RIVAL, person(due, staff.id)));
  assert.ok((person(renewed, staff.id).contract?.racesLeft ?? 0) > 2);
  assert.deepEqual(renewed.pendingEvents, []);
});

test('poached: a signing from another team names the signing team, the team left and the person', () => {
  for (const [team, from] of [
    [RIVAL, OTHER],
    [YOURS, RIVAL],
    [RIVAL, YOURS],
  ]) {
    let state = BASE;
    if (from === YOURS) {
      const pool = freeAgents(BASE, 'designer');
      const hiredBy = withDeal(
        BASE,
        YOURS,
        'designer',
        pool.map((p) => p.id)
      );
      state = send(
        hiredBy,
        offerAtMinimum(hiredBy, YOURS, willing(hiredBy, YOURS, pool))
      );
      state = { ...state, pendingEvents: [] };
    }
    const who = person(state, state.teams[from].seats.designer);
    const dealt = withDeal(state, team, 'designer', [who.id]);
    const next = send(dealt, offerAtMinimum(dealt, team, who));
    assert.equal(person(next, who.id).contract?.team, team);
    assert.equal(next.teams[from].seats.designer, null);
    assert.deepEqual(pending(dealt, next), [
      {
        kind: 'poached',
        team,
        team2: from,
        person: who.name,
        personId: who.id,
      },
    ]);
  }
});

const offerOf = (sponsor: number): Sponsor => ({
  sponsor,
  fee: 500,
  bonus: 1000,
  objective: 'place',
  target: 10,
  racesLeft: 6,
});

test('sponsorSigned: SignSponsor names the team and the sponsor', () => {
  for (const team of [YOURS, RIVAL]) {
    const state = changeTeam(BASE, team, (t) => ({
      ...t,
      sponsors: [null, null, null],
      offers: [offerOf(4), offerOf(17), offerOf(33)],
    }));
    const next = send(state, { type: 'SignSponsor', team, offer: 1, slot: 0 });
    assert.deepEqual(next.pendingEvents, [
      { kind: 'sponsorSigned', team, sponsor: SPONSOR_ROSTER[17].name },
    ]);
  }
});

test('sponsorSigned: the rivals’ starting sponsors and a refused signing tell nothing', () => {
  assert.ok(BASE.teams[RIVAL].sponsors.some((s) => s !== null));
  assert.deepEqual(BASE.pendingEvents, []);
  const full = changeTeam(BASE, RIVAL, (t) => ({
    ...t,
    sponsors: [offerOf(1), offerOf(2), offerOf(3)],
    offers: [offerOf(4)],
  }));
  const refused = apply(full, {
    type: 'SignSponsor',
    team: RIVAL,
    offer: 0,
    slot: 1,
  });
  assert.deepEqual(refused, { ok: false, reason: 'locked' });
});

test('yourFinish: every recorded race tells the better place of your two ships', () => {
  const state = racing(BASE);
  const result = resultOf(state);
  for (const [slot, other] of [
    [0, 1],
    [1, 0],
  ]) {
    const won = wonBy(result, YOURS, slot);
    const next = record(state, won);
    const places = won.ships.slice(0, 2).map((s) => s.place);
    assert.equal(places[slot], 1);
    assert.ok(places[other] > 1);
    assert.deepEqual(ofKind(next.news, 'yourFinish'), [
      { kind: 'yourFinish', team: YOURS, place: 1 },
    ]);
  }
  const next = record(state, result);
  const best = Math.min(result.ships[0].place, result.ships[1].place);
  assert.deepEqual(ofKind(next.news, 'yourFinish'), [
    { kind: 'yourFinish', team: YOURS, place: best },
  ]);
});

test('yourFinish and raceWon: nothing but RecordRace tells them', () => {
  const started = send(BASE, { type: 'StartRace', team: YOURS });
  for (const kind of ['yourFinish', 'raceWon'] as const)
    assert.deepEqual(ofKind(started.pendingEvents, kind), []);
});

test('raceWon: the winning team, its owner or driver by name, and the planet', () => {
  const state = racing(BASE);
  const result = resultOf(state);
  const planet = planetName(state);
  const owner = state.teams[RIVAL].owner;
  assert.ok(owner);
  const driver = person(state, state.teams[RIVAL].seats.driver);
  const cases: [number, number, NewsEvent][] = [
    [
      RIVAL,
      0,
      {
        kind: 'raceWon',
        team: RIVAL,
        person: owner.name,
        personId: owner.id,
        planet,
      },
    ],
    [
      RIVAL,
      1,
      {
        kind: 'raceWon',
        team: RIVAL,
        person: driver.name,
        personId: driver.id,
        planet,
      },
    ],
    [YOURS, 0, { kind: 'raceWon', team: YOURS, planet }],
    [YOURS, 1, { kind: 'raceWon', team: YOURS, planet }],
  ];
  for (const [team, slot, event] of cases)
    assert.deepEqual(
      ofKind(record(state, wonBy(result, team, slot)).news, 'raceWon'),
      [event]
    );
});

test('raceWon: a stand-in at the helm of slot 1 is not named', () => {
  const state = racing(
    changeTeam(BASE, RIVAL, (t) => ({
      ...t,
      seats: { ...t.seats, driver: null },
    }))
  );
  const won = record(state, wonBy(resultOf(state), RIVAL, 1));
  assert.deepEqual(ofKind(won.news, 'raceWon'), [
    { kind: 'raceWon', team: RIVAL, planet: planetName(state) },
  ]);
});

test('streak: the rule counts on for the same winner and starts again for another', () => {
  assert.equal(NEWS.streak, 3);
  assert.deepEqual(nextStreak(null, 4), { team: 4, n: 1 });
  assert.deepEqual(nextStreak({ team: 4, n: 2 }, 4), { team: 4, n: 3 });
  assert.deepEqual(nextStreak({ team: 4, n: 7 }, 5), { team: 5, n: 1 });
  assert.equal(isStreak(2), false);
  assert.equal(isStreak(3), true);
  assert.equal(isStreak(9), true);
});

test('streak: a third win in a row tells the team and n; a second, or another winner, does not', () => {
  const state = racing(BASE);
  const result = wonBy(resultOf(state), RIVAL, 0);
  const third = record({ ...state, winStreak: { team: RIVAL, n: 2 } }, result);
  assert.deepEqual(third.winStreak, { team: RIVAL, n: 3 });
  assert.deepEqual(ofKind(third.news, 'streak'), [
    { kind: 'streak', team: RIVAL, n: 3 },
  ]);
  const fifth = record({ ...state, winStreak: { team: RIVAL, n: 4 } }, result);
  assert.deepEqual(ofKind(fifth.news, 'streak'), [
    { kind: 'streak', team: RIVAL, n: 5 },
  ]);
  const second = record({ ...state, winStreak: { team: RIVAL, n: 1 } }, result);
  assert.deepEqual(second.winStreak, { team: RIVAL, n: 2 });
  assert.deepEqual(ofKind(second.news, 'streak'), []);
  const broken = record({ ...state, winStreak: { team: OTHER, n: 6 } }, result);
  assert.deepEqual(broken.winStreak, { team: RIVAL, n: 1 });
  assert.deepEqual(ofKind(broken.news, 'streak'), []);
  const first = record(state, result);
  assert.deepEqual(first.winStreak, { team: RIVAL, n: 1 });
});

test('streak: winStreak runs across races and across the season’s turn', () => {
  let state: CareerState = { ...BASE, race: SEASON - 1 };
  const win = (s: CareerState): CareerState => {
    const started = send(s, { type: 'StartRace', team: YOURS });
    return record(started, wonBy(resultOf(started), OTHER, 0));
  };
  state = win(state);
  assert.deepEqual(state.winStreak, { team: OTHER, n: 1 });
  state = win(state);
  assert.deepEqual(state.winStreak, { team: OTHER, n: 2 });
  assert.equal(state.phase, 'offseason');
  state = send(state, { type: 'FinishOffseason', team: YOURS });
  assert.equal(state.season, 2);
  assert.deepEqual(state.winStreak, { team: OTHER, n: 2 });
  state = win(state);
  assert.deepEqual(state.winStreak, { team: OTHER, n: 3 });
  assert.deepEqual(ofKind(state.news, 'streak'), [
    { kind: 'streak', team: OTHER, n: 3 },
  ]);
});

test('unlocked: an unlock completed by the race names the team and the kind', () => {
  const kind = BASE.teams[RIVAL].taste.find(
    (k) => !BASE.teams[RIVAL].unlocked.includes(k)
  );
  assert.ok(kind);
  const near = (progress: number) =>
    racing(
      changeTeam(BASE, RIVAL, (t) => ({
        ...t,
        focus: { gun: kind },
        unlockProgress: { ...t.unlockProgress, [kind]: progress },
      }))
    );
  const done = record(near(UNLOCK.needed - 0.01), resultOf(near(0)));
  assert.ok(done.teams[RIVAL].unlocked.includes(kind));
  assert.deepEqual(
    ofKind(done.news, 'unlocked').filter((e) => e.team === RIVAL),
    [{ kind: 'unlocked', team: RIVAL, gun: kind }]
  );
  const short = record(near(0), resultOf(near(0)));
  assert.ok(!short.teams[RIVAL].unlocked.includes(kind));
  assert.deepEqual(
    ofKind(short.news, 'unlocked').filter((e) => e.team === RIVAL),
    []
  );
  const unstaffed = changeTeam(near(UNLOCK.needed - 0.01), RIVAL, (t) => ({
    ...t,
    seats: { ...t.seats, designer: null },
  }));
  assert.deepEqual(
    ofKind(record(unstaffed, resultOf(near(0))).news, 'unlocked').filter(
      (e) => e.team === RIVAL
    ),
    []
  );
});

test('lineLead: a new single leader in a line is told and kept', () => {
  const state = racing(
    withLine(noDesigners(BASE), 'keel', { [RIVAL]: 60, [OTHER]: 80 })
  );
  const kept = { ...state, lineLeaders: { ...state.lineLeaders, keel: RIVAL } };
  const next = record(kept, resultOf(state));
  assert.equal(next.lineLeaders.keel, OTHER);
  assert.deepEqual(ofKind(next.news, 'lineLead'), [
    { kind: 'lineLead', team: OTHER, line: 'keel' },
  ]);
  const unknown = {
    ...state,
    lineLeaders: { ...state.lineLeaders, keel: null },
  };
  assert.deepEqual(ofKind(record(unknown, resultOf(state)).news, 'lineLead'), [
    { kind: 'lineLead', team: OTHER, line: 'keel' },
  ]);
});

test('lineLead: a tie for highest, or the same leader, changes nothing', () => {
  const tied = racing(
    withLine(noDesigners(BASE), 'sails', { [RIVAL]: 70, [OTHER]: 70 })
  );
  assert.equal(lineLeader(tied.teams, 'sails'), null);
  for (const stored of [RIVAL, 5, null]) {
    const state = {
      ...tied,
      lineLeaders: { ...tied.lineLeaders, sails: stored },
    };
    const next = record(state, resultOf(tied));
    assert.equal(next.lineLeaders.sails, stored);
    assert.deepEqual(ofKind(next.news, 'lineLead'), []);
  }
  const same = racing(noDesigners(BASE));
  for (const line of LINES)
    assert.equal(same.lineLeaders[line], lineLeader(same.teams, line));
  const next = record(same, resultOf(same));
  assert.deepEqual(next.lineLeaders, same.lineLeaders);
  assert.deepEqual(ofKind(next.news, 'lineLead'), []);
});

test('repossessed: a team below −10,000 is told; one at −10,000 is not', () => {
  const at = (balance: number) =>
    changeTeam(BASE, RIVAL, (t) => ({ ...t, balance }));
  assert.deepEqual(repossess(at(-10001)).state.pendingEvents, [
    { kind: 'repossessed', team: RIVAL },
  ]);
  assert.deepEqual(repossess(at(-10000)).state.pendingEvents, []);
  const broke = racing(
    changeTeam(at(-1000000), YOURS, (t) => ({ ...t, balance: -2000000 }))
  );
  const next = record(broke, resultOf(broke));
  assert.deepEqual(ofKind(next.news, 'repossessed'), [
    { kind: 'repossessed', team: YOURS },
    { kind: 'repossessed', team: RIVAL },
  ]);
});

test('title and yourSeason: told when race ten is recorded, from the final table', () => {
  const tenth = racing(BASE, SEASON);
  const stop = record(tenth, resultOf(tenth));
  assert.equal(stop.phase, 'offseason');
  assert.deepEqual(ofKind(stop.news, 'title'), [
    { kind: 'title', team: standingOrder(stop)[0] },
  ]);
  assert.deepEqual(ofKind(stop.news, 'yourSeason'), [
    { kind: 'yourSeason', team: YOURS, place: standings(stop)[YOURS] },
  ]);
  const ninth = racing(BASE, SEASON - 1);
  const lobby = record(ninth, resultOf(ninth));
  for (const kind of ['title', 'yourSeason', 'retired', 'rookie'] as const)
    assert.deepEqual(ofKind(lobby.news, kind), []);
});

function youngLeague(state: CareerState): CareerState {
  return {
    ...state,
    people: state.people.map((p) => ({
      ...p,
      age: Math.min(p.age, p.retireAge - 3),
    })),
  };
}

test('retired and rookie: one retirement at the stop tells the person, age and team, and the rookie who replaces them', () => {
  const young = racing(youngLeague(BASE), SEASON);
  for (const role of ROLES) {
    const who = person(young, young.teams[RIVAL].seats[role]);
    const free = freeAgents(young, role)[0];
    for (const leaving of [who, free]) {
      const state = changePerson(young, leaving.id, (p) => ({
        ...p,
        age: p.retireAge - 1,
      }));
      const stop = record(state, resultOf(young));
      const rookie = person(stop, state.nextPersonId);
      assert.equal(rookie.role, role);
      assert.deepEqual(ofKind(stop.news, 'retired'), [
        {
          kind: 'retired',
          ...(leaving.contract === null ? {} : { team: RIVAL }),
          person: leaving.name,
          personId: leaving.id,
          age: leaving.retireAge,
        },
      ]);
      assert.deepEqual(ofKind(stop.news, 'rookie'), [
        {
          kind: 'rookie',
          person: rookie.name,
          personId: rookie.id,
          age: rookie.age,
        },
      ]);
    }
  }
  const nobody = record(young, resultOf(young));
  assert.deepEqual(ofKind(nobody.news, 'retired'), []);
  assert.deepEqual(ofKind(nobody.news, 'rookie'), []);
});

const ORDER_IN_RECORD: readonly NewsKind[] = [
  'repossessed',
  'unlocked',
  'yourFinish',
  'raceWon',
  'streak',
  'lineLead',
  'title',
  'yourSeason',
  'retired',
  'rookie',
];

test('news: the lobby’s events, then RecordRace’s in the order of §2.2.5, and pending is emptied', () => {
  const kind = BASE.teams[OTHER].taste.find(
    (k) => !BASE.teams[OTHER].unlocked.includes(k)
  );
  assert.ok(kind);
  let state = changeTeam(
    youngLeague({ ...BASE, race: SEASON }),
    YOURS,
    (t) => ({
      ...t,
      sponsors: [null, null, null],
      offers: [offerOf(4), offerOf(17), offerOf(33)],
    })
  );
  state = send(state, { type: 'SignSponsor', team: YOURS, offer: 2, slot: 1 });
  let started = send(state, { type: 'StartRace', team: YOURS });
  assert.deepEqual(started.pendingEvents.slice(0, 1), [
    { kind: 'sponsorSigned', team: YOURS, sponsor: SPONSOR_ROSTER[33].name },
  ]);
  started = changeTeam(started, OTHER, (t) => ({
    ...t,
    focus: { gun: kind },
    unlockProgress: { ...t.unlockProgress, [kind]: UNLOCK.needed - 0.01 },
  }));
  const leaving = person(started, started.teams[OTHER].seats.mechanic);
  started = changePerson(started, leaving.id, (p) => ({
    ...p,
    age: p.retireAge - 1,
  }));
  started = {
    ...started,
    winStreak: { team: RIVAL, n: 2 },
    lineLeaders: { ...started.lineLeaders, rudder: YOURS },
  };
  const broke = changeTeam(started, 30, (t) => ({ ...t, balance: -900000 }));
  const stop = record(broke, wonBy(resultOf(broke), RIVAL, 0));
  assert.deepEqual(stop.pendingEvents, []);
  assert.deepEqual(
    stop.news.slice(0, broke.pendingEvents.length),
    broke.pendingEvents
  );
  const told = stop.news.slice(broke.pendingEvents.length);
  const kinds = told.map((e) => e.kind);
  assert.deepEqual(
    [...kinds].sort(
      (a, b) => ORDER_IN_RECORD.indexOf(a) - ORDER_IN_RECORD.indexOf(b)
    ),
    kinds
  );
  for (const k of ORDER_IN_RECORD) assert.ok(kinds.includes(k), `${k} is told`);
  const after = send(stop, { type: 'MarkRead', team: YOURS });
  assert.deepEqual(after.news, stop.news);
  const finished = send(after, { type: 'FinishOffseason', team: YOURS });
  assert.deepEqual(finished.news, stop.news);
  const lobby = finished.pendingEvents;
  const next = send(finished, { type: 'StartRace', team: YOURS });
  const raced = record(next, resultOf(next));
  assert.deepEqual(raced.news.slice(0, lobby.length), lobby);
  assert.ok(!raced.news.some((e) => e.kind === 'title'));
  assert.deepEqual(raced.pendingEvents, []);
});

test('news: step 10 is the only place news changes', () => {
  const event: NewsEvent = {
    kind: 'hired',
    team: 3,
    person: 'A. B',
    personId: 9,
  };
  const state = { ...BASE, news: [event], pendingEvents: [] };
  const started = send(state, { type: 'StartRace', team: YOURS });
  assert.deepEqual(started.news, [event]);
  assert.deepEqual(publishNews(started).news, started.pendingEvents);
});

const KEYS: Record<NewsKind, readonly string[]> = {
  yourFinish: ['kind', 'team', 'place'],
  yourSeason: ['kind', 'team', 'place'],
  raceWon: ['kind', 'team', 'person', 'personId', 'planet'],
  hired: ['kind', 'team', 'person', 'personId'],
  poached: ['kind', 'team', 'team2', 'person', 'personId'],
  retired: ['kind', 'team', 'person', 'personId', 'age'],
  rookie: ['kind', 'person', 'personId', 'age'],
  repossessed: ['kind', 'team'],
  streak: ['kind', 'team', 'n'],
  title: ['kind', 'team'],
  sponsorSigned: ['kind', 'team', 'sponsor'],
  unlocked: ['kind', 'team', 'gun'],
  lineLead: ['kind', 'team', 'line'],
};

test('over three seasons of the policy every event is plain data with its own fields, and no policy command is refused', () => {
  assert.equal(Object.keys(KEYS).length, NEWS_KINDS.length);
  for (const seed of ['test', 'tide', 'squall']) {
    let state = careerOf(seed);
    const yours = (s: CareerState): CareerState => {
      const run = runPolicy(s, YOURS);
      assert.deepEqual(run.refused, []);
      return run.state;
    };
    for (let race = 0; race < 3 * SEASON; race++) {
      if (state.phase === 'offseason')
        state = send(yours(state), { type: 'FinishOffseason', team: YOURS });
      const started = send(yours(state), { type: 'StartRace', team: YOURS });
      state = record(started, resultOf(started));
      assert.deepEqual(state.pendingEvents, []);
      assert.deepEqual(JSON.parse(JSON.stringify(state)), state);
      for (const event of state.news) {
        for (const key of Object.keys(event))
          assert.ok(KEYS[event.kind].includes(key), `${event.kind}.${key}`);
        if (event.team !== undefined)
          assert.ok(event.team >= 0 && event.team < LEAGUE.teams);
      }
      assert.equal(ofKind(state.news, 'yourFinish').length, 1);
      assert.equal(ofKind(state.news, 'raceWon').length, 1);
      state = send(state, { type: 'MarkRead', team: YOURS });
    }
    assert.equal(state.season, 3);
  }
});

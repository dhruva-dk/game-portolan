import { test } from 'node:test';
import assert from 'node:assert/strict';
import { apply, newCareer, type Applied } from '../src/career/apply.ts';
import {
  COMMANDS,
  REASONS,
  type Command,
  type CommandType,
  type Reason,
} from '../src/career/commands.ts';
import {
  BUBBLES,
  LINES,
  PHASES,
  ROLES,
  type CareerState,
  type Phase,
  type Role,
  type Sponsor,
  type Team,
  type Terms,
} from '../src/career/state.ts';
import {
  LEAGUE,
  NEGOTIATION,
  RACE_MONEY,
  SPONSORS,
} from '../src/career/tuning.ts';
import type { MatchResult } from '../src/sim/result.ts';
import { DYES, EMBLEMS, PATTERNS } from '../src/world/livery.ts';
import { random } from '../src/world/random.ts';

const TEAMS = LEAGUE.teams;
const SHIPS = TEAMS * LEAGUE.shipsPerTeam;
const RIVAL = 5;
const TERMS: Terms = { wage: 500, seasons: 2, fee: 0, clause: 5000 };

const BASE = newCareer({
  seed: 'test',
  name: 'Gull Racing',
  livery: { dye: 0, pattern: 0 },
  emblem: 0,
});

function idOf(found: { id: number } | null | undefined): number {
  if (!found) throw new Error('no such person in the new career');
  return found.id;
}

const freeAgent = (role: Role): number =>
  idOf(BASE.people.find((p) => p.contract === null && p.role === role));

function seated(team: number, role: Role): number {
  const id = BASE.teams[team].seats[role];
  if (id === null) throw new Error('an empty seat in the new career');
  return id;
}

const FREE = freeAgent('driver');
const MINE = freeAgent('mechanic');
const THEIRS = seated(RIVAL, 'designer');
const OWNER = idOf(BASE.teams[4].owner);
const UNKNOWN = BASE.nextPersonId;

function unworn(): { dye: number; pattern: number } {
  for (let dye = 0; dye < DYES.length; dye++)
    for (let pattern = 0; pattern < PATTERNS.length; pattern++)
      if (
        !BASE.teams.some(
          (team) => team.livery.dye === dye && team.livery.pattern === pattern
        )
      )
        return { dye, pattern };
  throw new Error('every livery is worn');
}

const UNWORN = unworn();

const OFFER: Sponsor = {
  sponsor: 0,
  fee: 500,
  bonus: 1000,
  objective: 'place',
  target: 10,
  racesLeft: 6,
};

function yours(team: Team): Team {
  return {
    ...team,
    seats: { ...team.seats, mechanic: MINE },
    deals: { ...team.deals, driver: { candidates: [FREE], locked: null } },
    talks: [{ person: FREE, attempts: 1, answer: 'countered', counter: TERMS }],
  };
}

function ready(team: Team): Team {
  const ship = team.ships[1];
  return {
    ...team,
    balance: 1000000,
    focus: null,
    design: { ...team.design, keel: 60 },
    unlocked: ['cannon', 'scatter'],
    ships: [
      { ...team.ships[0], gun: 'cannon' },
      { ...ship, fitted: { ...ship.fitted, keel: 20 } },
    ],
    sponsors: [null, null, null],
    offers: [OFFER],
  };
}

function career(phase: Phase): CareerState {
  const state = structuredClone(BASE);
  return {
    ...state,
    phase,
    race: phase === 'offseason' ? LEAGUE.racesPerSeason : 1,
    teams: state.teams.map((team, t) =>
      t === 0 ? yours(ready(team)) : ready(team)
    ),
    people: state.people.map((p) =>
      p.id === MINE
        ? { ...p, contract: { team: 0, wage: 500, clause: 5000, racesLeft: 5 } }
        : p
    ),
  };
}

function result(): MatchResult {
  return {
    seconds: 300,
    hash: 'abc',
    ships: Array.from({ length: SHIPS }, (_, i) => ({
      place: i + 1,
      sunkAt: i === 0 ? null : 300 - i,
      sunkBy: i === 0 ? null : 0,
      sinkings: i === 0 ? SHIPS - 1 : 0,
      shotsFired: 10,
      shotsLanded: 4,
      damageDealt: 100,
      damageTaken: 50,
      afloatAtPhaseFour: i < 20,
    })),
    sea: Array.from({ length: TEAMS }, () =>
      Array.from({ length: RACE_MONEY.seaSamples }, () => 0.01)
    ),
  };
}

function sample(type: CommandType, team: number): Command {
  switch (type) {
    case 'StartRace':
    case 'FinishOffseason':
    case 'MarkRead':
      return { type, team };
    case 'RecordRace':
      return { type, team, result: result() };
    case 'MarkSeen':
      return { type, team, id: BUBBLES[0] };
    case 'SetFocus':
      return { type, team, focus: { line: 'hull' } };
    case 'Build':
      return { type, team, slot: 1, line: 'keel' };
    case 'FitGun':
      return { type, team, slot: 0, kind: 'scatter' };
    case 'Repaint':
      return { type, team, livery: UNWORN, emblem: 3 };
    case 'SetScoutSeat':
      return { type, team, role: 'driver' };
    case 'BuyReport':
    case 'Approach':
      return { type, team, person: THEIRS };
    case 'Offer':
      return { type, team, person: FREE, terms: TERMS };
    case 'AcceptCounter':
      return { type, team, person: FREE };
    case 'Release':
      return { type, team, person: MINE };
    case 'SignSponsor':
      return { type, team, offer: 0, slot: 0 };
  }
}

const send = (state: CareerState, command: unknown): Applied =>
  Reflect.apply(apply, undefined, [state, command]);

const reasonOf = (applied: Applied): Reason | null =>
  applied.ok ? null : applied.reason;

const ASHORE = ['lobby', 'offseason'];
const TABLE: Record<CommandType, readonly string[]> = {
  StartRace: ['lobby'],
  RecordRace: ['racing'],
  FinishOffseason: ['offseason'],
  MarkRead: ASHORE,
  MarkSeen: ['lobby', 'racing', 'offseason'],
  SetFocus: ASHORE,
  Build: ASHORE,
  FitGun: ASHORE,
  Repaint: ASHORE,
  SetScoutSeat: ASHORE,
  BuyReport: ASHORE,
  Approach: ASHORE,
  Offer: ASHORE,
  AcceptCounter: ASHORE,
  Release: ASHORE,
  SignSponsor: ASHORE,
};
const FIRST_FIVE: readonly CommandType[] = [
  'StartRace',
  'RecordRace',
  'FinishOffseason',
  'MarkRead',
  'MarkSeen',
];

test('there are sixteen commands and eleven reasons in the order of §2.2.3', () => {
  assert.equal(COMMANDS.length, 16);
  assert.deepEqual(Object.keys(TABLE), [...COMMANDS]);
  assert.deepEqual(REASONS, [
    'team',
    'phase',
    'invalid',
    'unknown',
    'fixed',
    'seat',
    'locked',
    'attempts',
    'taken',
    'same',
    'funds',
  ]);
});

test('every command in every phase is accepted or refused for phase as the table says', () => {
  for (const phase of PHASES) {
    const state = career(phase);
    for (const type of COMMANDS) {
      const applied = apply(state, sample(type, 0));
      const expected = TABLE[type].includes(phase) ? null : 'phase';
      assert.equal(reasonOf(applied), expected, `${type} in ${phase}`);
    }
  }
});

const FROM_A_RIVAL: Partial<Record<CommandType, Reason>> = {
  BuyReport: 'same',
  Approach: 'fixed',
  Offer: 'seat',
  AcceptCounter: 'seat',
  Release: 'seat',
};

test('only team 0 may send the first five commands', () => {
  for (const phase of PHASES) {
    const state = career(phase);
    for (const type of COMMANDS) {
      const reason = reasonOf(apply(state, sample(type, RIVAL)));
      if (FIRST_FIVE.includes(type)) assert.equal(reason, 'team', type);
      else
        assert.equal(
          reason,
          TABLE[type].includes(phase) ? (FROM_A_RIVAL[type] ?? null) : 'phase',
          `${type} from a rival in ${phase}`
        );
    }
  }
});

test('a team index out of range is refused for team', () => {
  const state = career('lobby');
  for (const team of [-1, TEAMS, 1.5, '0', null, undefined, NaN])
    for (const type of COMMANDS)
      assert.equal(
        reasonOf(send(state, { ...sample(type, 0), team })),
        'team',
        `${type} from ${String(team)}`
      );
});

const BAD: Partial<Record<CommandType, readonly object[]>> = {
  RecordRace: [
    { result: null },
    { result: { ...result(), ships: result().ships.slice(1) } },
    { result: { ...result(), sea: result().sea.slice(1) } },
    { result: { ...result(), sea: result().sea.map((s) => s.slice(1)) } },
    { result: { ...result(), sea: result().sea.map((s) => s.map(() => 2)) } },
    {
      result: {
        ...result(),
        ships: result().ships.map((s) => ({ ...s, place: 1 })),
      },
    },
    {
      result: {
        ...result(),
        ships: result().ships.map((s) => ({ ...s, sunkBy: SHIPS })),
      },
    },
    {
      result: {
        ...result(),
        ships: result().ships.map((s) => ({ ...s, sinkings: -1 })),
      },
    },
    { result: { ...result(), hash: 1 } },
  ],
  MarkSeen: [{ id: 3 }, { id: null }],
  SetFocus: [
    { focus: { line: 'cannon' } },
    { focus: { gun: 'hull' } },
    { focus: { line: 'hull', gun: 'mortar' } },
    { focus: {} },
    { focus: 'hull' },
  ],
  Build: [{ slot: 2 }, { slot: -1 }, { slot: 0.5 }, { line: 'deck' }],
  FitGun: [{ slot: 2 }, { kind: 'musket' }],
  Repaint: [
    { livery: { dye: DYES.length, pattern: 0 } },
    { livery: { dye: 0, pattern: PATTERNS.length } },
    { livery: null },
    { emblem: EMBLEMS },
    { emblem: -1 },
  ],
  SetScoutSeat: [{ role: 'owner' }],
  BuyReport: [{ person: 'x' }, { person: 1.5 }],
  Approach: [{ person: null }],
  AcceptCounter: [{ person: undefined }],
  Release: [{ person: NaN }],
  Offer: [
    {
      terms: { ...TERMS, wage: NEGOTIATION.wage.least - NEGOTIATION.wage.step },
    },
    {
      terms: { ...TERMS, wage: NEGOTIATION.wage.most + NEGOTIATION.wage.step },
    },
    { terms: { ...TERMS, wage: TERMS.wage + 1 } },
    { terms: { ...TERMS, seasons: NEGOTIATION.seasons.most + 1 } },
    { terms: { ...TERMS, seasons: NEGOTIATION.seasons.least - 1 } },
    { terms: { ...TERMS, fee: NEGOTIATION.fee.most + NEGOTIATION.fee.step } },
    { terms: { ...TERMS, fee: NEGOTIATION.fee.step / 2 } },
    {
      terms: {
        ...TERMS,
        clause: NEGOTIATION.clause.most + NEGOTIATION.clause.step,
      },
    },
    { terms: { ...TERMS, clause: -NEGOTIATION.clause.step } },
    { terms: null },
  ],
  SignSponsor: [{ slot: SPONSORS.slots }, { offer: -1 }, { offer: 'first' }],
};

test('a field out of its range is refused for invalid', () => {
  const state = career('lobby');
  const racing = career('racing');
  for (const type of COMMANDS)
    for (const change of BAD[type] ?? []) {
      const on = TABLE[type].includes('lobby') ? state : racing;
      assert.equal(
        reasonOf(send(on, { ...sample(type, 0), ...change })),
        'invalid',
        `${type} ${JSON.stringify(change)}`
      );
    }
});

test('the ends of each term range are valid', () => {
  const state = career('lobby');
  const keys: ('wage' | 'fee' | 'clause')[] = ['wage', 'fee', 'clause'];
  const ends: ('least' | 'most')[] = ['least', 'most'];
  for (const key of keys)
    for (const end of ends) {
      const terms = { ...TERMS, [key]: NEGOTIATION[key][end] };
      assert.equal(
        reasonOf(apply(state, { type: 'Offer', team: 0, person: FREE, terms })),
        null,
        `${key} ${end}`
      );
    }
});

test('no such person, owner, offer or bubble is refused for unknown', () => {
  const state = career('lobby');
  const people: CommandType[] = [
    'BuyReport',
    'Approach',
    'Offer',
    'AcceptCounter',
    'Release',
  ];
  for (const type of people)
    assert.equal(
      reasonOf(send(state, { ...sample(type, 0), person: UNKNOWN })),
      'unknown',
      type
    );
  assert.equal(
    reasonOf(send(state, { ...sample('SignSponsor', 0), offer: 1 })),
    'unknown'
  );
  assert.equal(
    reasonOf(send(state, { ...sample('MarkSeen', 0), id: 'nope' })),
    'unknown'
  );
  for (const type of people)
    assert.notEqual(
      reasonOf(send(state, { ...sample(type, 0), person: OWNER })),
      'unknown',
      `${type} names an owner`
    );
});

test('when several reasons apply the first in the order of §2.2.3 is given', () => {
  const lobby = career('lobby');
  const racing = career('racing');
  const cases: [CareerState, unknown, Reason][] = [
    [racing, sample('StartRace', RIVAL), 'team'],
    [lobby, { ...sample('MarkSeen', RIVAL), id: 'nope' }, 'team'],
    [racing, { ...sample('Build', TEAMS), slot: 9 }, 'team'],
    [lobby, { ...sample('RecordRace', 0), result: null }, 'phase'],
    [racing, { ...sample('Build', 0), slot: 9 }, 'phase'],
    [racing, { ...sample('BuyReport', 0), person: UNKNOWN }, 'phase'],
    [lobby, { ...sample('Offer', 0), person: UNKNOWN, terms: null }, 'invalid'],
    [lobby, { ...sample('SignSponsor', 0), offer: 9, slot: 9 }, 'invalid'],
    [racing, { ...sample('MarkSeen', 0), id: 7 }, 'invalid'],
    [racing, { ...sample('MarkSeen', 0), id: 'nope' }, 'unknown'],
  ];
  for (const [state, command, reason] of cases)
    assert.equal(
      reasonOf(send(state, command)),
      reason,
      JSON.stringify(command)
    );
});

const GARBAGE: readonly unknown[] = [
  null,
  undefined,
  0,
  1,
  -1,
  2,
  1e9,
  NaN,
  Infinity,
  '',
  'x',
  'hull',
  'cannon',
  'steer',
  true,
  {},
  [],
  [1, 2],
  { dye: 1 },
  { line: 'sails' },
  { gun: 'mortar' },
  { wage: 10, seasons: 1, fee: 0, clause: 0 },
  { ships: [], sea: [] },
];

test('apply never throws on malformed commands', () => {
  const states = PHASES.map(career);
  const keys = [
    'type',
    'team',
    'result',
    'id',
    'focus',
    'slot',
    'line',
    'kind',
    'livery',
    'emblem',
    'role',
    'person',
    'terms',
    'offer',
  ];
  const u = random(7);
  const choose = (list: readonly unknown[]) =>
    list[Math.floor(u() * list.length)];
  const values = [...GARBAGE, ...COMMANDS, 0, 1, 2, 3, result(), TERMS];
  for (const raw of GARBAGE)
    for (const state of states) assert.ok(REASONS.includes(failed(state, raw)));
  const before = states.map((state) => structuredClone(state));
  for (let i = 0; i < 2000; i++) {
    const command: Record<string, unknown> = {};
    for (const key of keys) if (u() < 0.6) command[key] = choose(values);
    if (u() < 0.8) command.type = choose(COMMANDS);
    if (u() < 0.8) command.team = choose([0, 0, 0, RIVAL, -1]);
    for (const state of states) {
      const applied = send(state, command);
      assert.ok(applied.ok || REASONS.includes(applied.reason));
    }
  }
  assert.deepEqual(states, before);
});

function failed(state: CareerState, raw: unknown): Reason {
  const applied = send(state, raw);
  assert.equal(applied.ok, false, JSON.stringify(raw));
  return applied.ok ? 'team' : applied.reason;
}

test('a refused command leaves the state as it was', () => {
  for (const phase of PHASES) {
    const state = career(phase);
    const before = structuredClone(state);
    for (const type of COMMANDS)
      for (const change of [
        { team: RIVAL },
        { team: -1 },
        ...(BAD[type] ?? []),
      ]) {
        const applied = send(state, { ...sample(type, 0), ...change });
        if (!applied.ok) assert.deepEqual(state, before, type);
      }
    assert.deepEqual(state, before);
  }
});

test('an accepted command never changes its input', () => {
  for (const phase of PHASES) {
    const state = career(phase);
    const before = structuredClone(state);
    for (const type of COMMANDS) apply(state, sample(type, 0));
    assert.deepEqual(state, before);
  }
});

test('the state survives a JSON round trip before and after every command', () => {
  for (const phase of PHASES) {
    let state = career(phase);
    assert.deepEqual(JSON.parse(JSON.stringify(state)), state);
    for (const type of COMMANDS) {
      const applied = apply(state, sample(type, 0));
      if (applied.ok) state = applied.state;
      assert.deepEqual(JSON.parse(JSON.stringify(state)), state, type);
    }
  }
});

test('MarkSeen adds a bubble id once, in any phase', () => {
  for (const phase of PHASES) {
    let state = career(phase);
    for (const id of [...BUBBLES, BUBBLES[0]]) {
      const applied = apply(state, { type: 'MarkSeen', team: 0, id });
      assert.ok(applied.ok);
      state = applied.state;
    }
    assert.deepEqual(state.seen, [...BUBBLES]);
  }
});

test('the vocabulary lists are complete and distinct', () => {
  assert.equal(new Set(LINES).size, 7);
  assert.equal(new Set(ROLES).size, 3);
  assert.equal(new Set(PHASES).size, 3);
  assert.equal(new Set(BUBBLES).size, 11);
});

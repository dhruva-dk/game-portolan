// The reducer, time and the dice (Phase B section 1): apply never throws on a bad command, the same state and command
// give the same result, Advance pops the queue to the next event that needs the player.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { random } from '../src/world/random.ts';
import { COMMANDS, EVENTS, apply, start } from '../src/career/career.ts';
import { canonical } from '../src/career/canon.ts';
import { dice } from '../src/career/dice.ts';
import {
  ordered,
  schedule,
  scheduled,
  unscheduled,
  type Event,
} from '../src/career/queue.ts';
import { stopsFor } from '../src/career/advance.ts';
import type { Command } from '../src/office.ts';
import {
  FOUND,
  founded,
  invariants,
  must,
  refused,
  someCommand,
  spendKept,
} from './career-kit.ts';

test('apply never throws on a malformed command, and refuses it', () => {
  const s = founded();
  const junk: unknown[] = [
    null,
    7,
    'Advance',
    {},
    { kind: 4 },
    { kind: 'Nope' },
    { kind: 'MoveFlightJob' },
    { kind: 'MoveFlightJob', gull: -1, job: 'x' },
    { kind: 'MoveFlightJob', gull: 1e9, job: 'mend' },
    { kind: 'Found' },
    { kind: 'DebugCoin' },
  ];
  for (const j of junk) {
    const parsed: Command = JSON.parse(JSON.stringify(j ?? null));
    const r = apply(s, parsed, { debug: true });
    assert.equal(r.ok, false, JSON.stringify(j));
  }
  const unfounded: Command = JSON.parse('{"kind":"Found","seed":1}');
  assert.equal(apply(start(), unfounded).ok, false);
});

test('every command kind has a handler; debug commands are refused unless debug is on', () => {
  const r = apply(founded(), { kind: 'DebugReveal' });
  assert.equal(
    r.ok ? '' : r.reason.code,
    'debug',
    'debug commands are refused unless debug is on'
  );
  const unknown: Command = JSON.parse('{"kind":"Sing"}');
  refused(founded(), unknown, 'unavailable');
});

test('the same state and command give the same result; a refusal changes nothing', () => {
  const s = founded();
  const a = apply(s, { kind: 'Advance' }),
    b = apply(s, { kind: 'Advance' });
  assert.ok(a.ok && b.ok);
  if (a.ok && b.ok) assert.equal(canonical(a.state), canonical(b.state));
  const before = canonical(s);
  apply(s, { kind: 'MoveFlightJob', gull: 0, job: 'mend' });
  assert.equal(canonical(s), before, 'states are never changed in place');
});

test('Advance: from founding to the first race day, which stops it until the race is sailed', () => {
  const s = founded();
  assert.equal(s.day, 0);
  assert.equal(s.race, null);
  // the rivals' reviews and scouting run on the way; none of them needs the player unless it approaches their gulls
  let t = must(s, { kind: 'Advance' });
  while (t.race === null) t = must(t, { kind: 'Advance' });
  assert.equal(t.day, 14);
  assert.deepEqual(t.race, {
    round: 0,
    started: false,
    results: [null, null, null],
  });
  assert.ok(
    !t.queue.some((e) => e.kind === 'race' && e.round === 0),
    'race day is off the queue'
  );
  assert.ok(t.queue.every((e) => e.day >= 14));
  refused(t, { kind: 'Advance' }, 'raceDay');
});

test("the queue: ordered by (day, seq); scheduling keeps the order; the season's race days and end are on it", () => {
  const s = founded();
  assert.ok(ordered(s.queue));
  const races = s.queue.filter((e) => e.kind === 'race');
  assert.equal(races.length, 10);
  assert.deepEqual(
    races.map((e) => e.day),
    [14, 28, 42, 56, 70, 84, 98, 112, 126, 140]
  );
  assert.equal(s.queue[s.queue.length - 1].kind, 'seasonEnd');
  assert.equal(
    s.queue.filter((e) => e.kind === 'review').length,
    120,
    "every crew's first review"
  );
  assert.deepEqual(
    s.queue
      .filter((e) => e.kind === 'closing' || e.kind === 'silence')
      .map((e) => [e.kind, e.day]),
    [
      ['closing', 80],
      ['silence', 110],
    ]
  );
  let t = s;
  const rand = random(3);
  for (let i = 0; i < 200; i++)
    t = schedule(t, Math.floor(rand() * 300), {
      kind: 'review',
      crew: i % 120,
    });
  assert.ok(ordered(t.queue));
  // same day: the earlier seq first
  const q = scheduled(
    scheduled([], { kind: 'review', crew: 1, day: 5, seq: 9 }),
    { kind: 'review', crew: 2, day: 5, seq: 3 }
  );
  assert.deepEqual(
    q.map((e: Event) => e.seq),
    [3, 9]
  );
  const u = unscheduled(t, (e) => e.kind === 'review');
  assert.equal(u.queue.length, s.queue.length - 120);
});

test("stops: race day and a job offer's deadline always; a dilemma or an answer only when it is the player's", () => {
  const s = founded();
  const mine = s.player!.crew;
  assert.equal(stopsFor(s, { kind: 'race', round: 0, day: 1, seq: 0 }), true);
  assert.equal(
    stopsFor(s, { kind: 'jobExpires', crew: 3, day: 1, seq: 0 }),
    true
  );
  // a dilemma stops only once its mail came (its trigger still held when it fell due)
  assert.equal(
    stopsFor(s, { kind: 'dilemma', id: 'x', crew: mine, day: 1, seq: 0 }),
    false
  );
  const waiting = {
    ...s,
    mail: [
      {
        id: 0,
        day: s.day,
        category: 'crew' as const,
        sender: null,
        kind: 'x',
        wording: 0,
        slots: {},
        links: [],
        read: false,
        dilemma: { id: 'x', options: ['a'], answer: null },
      },
    ],
  };
  assert.equal(
    stopsFor(waiting, { kind: 'dilemma', id: 'x', crew: mine, day: 1, seq: 0 }),
    true
  );
  assert.equal(
    stopsFor(waiting, {
      kind: 'dilemma',
      id: 'x',
      crew: (mine + 1) % 120,
      day: 1,
      seq: 0,
    }),
    false
  );
  assert.equal(
    stopsFor(s, { kind: 'review', crew: mine, day: 1, seq: 0 }),
    false
  );
});

test('every event a founded career schedules has a handler; every handled command kind is a Command', () => {
  const s = founded();
  const kinds = new Set(s.queue.map((e) => e.kind));
  for (const k of kinds) assert.ok(EVENTS[k], `no handler for '${k}'`);
  for (const k of [
    'designed',
    'built',
    'building',
    'patronOffer',
    'proposal',
    'vote',
    'dilemma',
    'seasonEnd',
    'seasonStart',
  ] as const)
    assert.ok(EVENTS[k], `no handler for '${k}'`);
  // every Command but Snapshot (the session's own: career/session.ts)
  assert.deepEqual(Object.keys(COMMANDS).sort(), [
    'AcceptCounter',
    'Advance',
    'AnswerDilemma',
    'Build',
    'CancelScout',
    'ChooseSupplier',
    'DealComponents',
    'DebugCoin',
    'DebugReveal',
    'DebugToRaceDay',
    'DebugToSeasonEnd',
    'DeclineJob',
    'Dismiss',
    'FitPart',
    'Forfeit',
    'Found',
    'Lobby',
    'MarkRead',
    'MoveFlightJob',
    'OfferContract',
    'RaceStarted',
    'RecordRace',
    'SetPlan',
    'SetYard',
    'SignPatron',
    'StartDesign',
    'StartScout',
    'TakeJob',
    'Vote',
    'WithdrawOffer',
  ]);
});

test('MoveFlightJob: a flight gull moves to a job, swapping with whoever worked it; each refusal', () => {
  const s = founded();
  const flight = s.crews[s.player!.crew].staff.flight;
  const [a, b] = flight;
  const ja = s.gulls[a].job!,
    jb = s.gulls[b].job!;
  const t = must(s, { kind: 'MoveFlightJob', gull: a, job: jb });
  assert.equal(t.gulls[a].job, jb);
  assert.equal(t.gulls[b].job, ja);
  invariants(t);
  refused(s, { kind: 'MoveFlightJob', gull: a, job: ja }, 'same');
  const other = s.crews[(s.player!.crew + 1) % 120].staff.flight[0];
  refused(s, { kind: 'MoveFlightJob', gull: other, job: 'mend' }, 'notFlight');
  const raceStarted = { ...must(s, { kind: 'Advance' }) };
  refused(
    { ...raceStarted, race: { ...raceStarted.race!, started: true } },
    { kind: 'MoveFlightJob', gull: a, job: jb },
    'racing'
  );
  const badJob: Command = JSON.parse(
    JSON.stringify({ kind: 'MoveFlightJob', gull: a, job: 'sing' })
  );
  refused(s, badJob, 'job');
});

test("the dice: a stream's counter steps once a roll; the same counters give the same numbers; streams are independent", () => {
  const d = dice(5, {});
  const a = d.roll('world')();
  d.roll('world');
  d.roll('form:3');
  assert.deepEqual(d.counters(), { world: 2, 'form:3': 1 });
  assert.equal(dice(5, {}).roll('world')(), a);
  assert.notEqual(dice(5, { world: 1 }).roll('world')(), a);
  assert.notEqual(dice(5, {}).roll('names')(), a);
  assert.notEqual(dice(6, {}).roll('world')(), a);
  assert.deepEqual(founded().streams, { world: 1 });
});

test('a long random session holds every invariant and never faults', () => {
  let s = founded();
  const rand = random(42);
  for (let i = 0; i < 400; i++) {
    const c = someCommand(s, rand);
    const r = apply(s, c, { debug: true });
    if (!r.ok) assert.notEqual(r.reason.code, 'fault', r.reason.sentence);
    else {
      spendKept(s, r.state, c);
      s = r.state;
    }
  }
  invariants(s);
  assert.equal(s.seed, FOUND.seed);
});

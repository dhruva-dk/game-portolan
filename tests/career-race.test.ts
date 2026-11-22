// Phase B sections 13 and 14: race day's lineup and cards, the race plan, RaceStarted, RecordRace and Forfeit with
// their refusals, the round's close (points, standings), the season's end (promotion, relegation, the new calendar),
// and the debug commands.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Plan } from '../src/office.ts';
import { raceCards } from '../src/career/card.ts';
import { apply, type CareerState } from '../src/career/career.ts';
import { lineups } from '../src/career/lineup.ts';
import { placePoints, tally } from '../src/career/round.ts';
import { movesOf } from '../src/career/season.ts';
import { YEAR } from '../src/career/stars.ts';
import { TUNING } from '../src/career/tuning.ts';
import { TEAM, type RaceResult } from '../src/race.ts';
import { standIn } from './career-results.ts';
import {
  founded,
  invariants,
  must,
  refused,
  sailed,
  toRaceDay,
} from './career-kit.ts';

const DAY = toRaceDay(founded());
const ME = DAY.player!.team;

/** A state with people marked unfit for some races. */
const unfitted = (
  s: CareerState,
  ids: readonly number[],
  races = 2
): CareerState => {
  const people = [...s.people];
  for (const id of ids) people[id] = { ...people[id], unfit: races };
  return { ...s, people };
};

/** A sound plan for the player's team. */
function plan(s: CareerState): Plan {
  const c = s.teams[ME];
  return {
    drivers: c.staff.ships.slice(1).map((h) => h.driver!),
    parts: [],
    call: 'hold',
    objectives: c.sponsors.map(() => null),
  };
}

test('race day: the player sails ship one; every other ship has one sailor, none twice, none unfit', () => {
  assert.equal(DAY.race?.round, 0);
  const all = lineups(DAY);
  assert.equal(all[ME].ships[0].driver, null);
  const seen = new Set<number>();
  for (const x of all)
    for (const a of x.ships) {
      if (x.team === ME && a === x.ships[0]) continue;
      assert.ok(a.forfeit || a.driver !== null);
      if (a.driver === null) continue;
      assert.ok(!seen.has(a.driver), `person ${a.driver} sails twice`);
      seen.add(a.driver);
      assert.equal(DAY.people[a.driver].unfit, 0);
    }
  const cards = raceCards(DAY);
  assert.equal(cards.length, DAY.championships.length);
  for (const card of cards)
    assert.equal(
      card.ships.length,
      DAY.championships[card.tier].teams.length * TEAM
    );
  assert.equal(
    cards[DAY.teams[ME].tier].ships[0].driver,
    null,
    "the player's own ship is sailed, not simulated"
  );
});

test('stand-ins: with more of her drivers unfit than the reserve covers, a ship takes the best free driver for the race; with none she is forfeit', () => {
  const c = DAY.teams[ME];
  const own = [...c.staff.ships.map((h) => h.driver), c.staff.reserve].filter(
    (x): x is number => x !== null
  );
  const one = unfitted(DAY, [own[0]]);
  const covered = lineups(one)[ME].ships;
  assert.ok(
    covered.some((a) => a.driver === c.staff.reserve && !a.standIn),
    'the reserve sails for the one unfit'
  );
  const hurt = unfitted(DAY, own);
  for (const a of lineups(hurt)[ME].ships.slice(1))
    assert.ok(
      a.standIn && a.driver !== null && hurt.people[a.driver].contract === null
    );
  const free = DAY.people
    .filter(
      (g) =>
        g.role === 'driver' &&
        g.contract === null &&
        g.retired === null &&
        !g.player
    )
    .map((g) => g.id);
  const none = unfitted(hurt, free);
  assert.ok(lineups(none)[ME].ships[1].forfeit);
  refused(none, { kind: 'RaceStarted', round: 0 }, 'noDriver');
});

test('a rival sails under a call: its first driver\'s, if its manager\'s Tactics holds', () => {
  for (const x of lineups(DAY))
    assert.ok(['free', 'attack', 'hold', 'form'].includes(x.call));
});

test('SetPlan: a sound plan is kept; each wrong part of one is refused with its reason', () => {
  const p = plan(DAY);
  const set = must(DAY, { kind: 'SetPlan', plan: p });
  assert.deepEqual(set.teams[ME].plan?.call, 'hold');
  assert.equal(lineups(set)[ME].call, 'hold', "the plan's call is the team's");
  const swapped = [...p.drivers].reverse();
  const turned = must(DAY, {
    kind: 'SetPlan',
    plan: { ...p, drivers: swapped },
  });
  assert.deepEqual(
    lineups(turned)[ME].ships.slice(1).map((a) => a.driver),
    swapped,
    "the plan's drivers board in its order"
  );
  const other = DAY.teams.find((c) => c.id !== ME)!.staff.ships[0].driver!;
  const with0 = (d: number) => [d, ...p.drivers.slice(1)];
  refused(
    DAY,
    { kind: 'SetPlan', plan: { ...p, drivers: with0(other) } },
    'driver'
  );
  refused(DAY, { kind: 'SetPlan', plan: { ...p, drivers: with0(-1) } }, 'driver');
  refused(
    DAY,
    { kind: 'SetPlan', plan: { ...p, drivers: p.drivers.slice(1) } },
    'driver'
  );
  refused(
    DAY,
    { kind: 'SetPlan', plan: { ...p, drivers: with0(p.drivers[1]) } },
    'driver'
  );
  refused(
    unfitted(DAY, [p.drivers[0]]),
    { kind: 'SetPlan', plan: p },
    'unfit'
  );
  refused(
    DAY,
    { kind: 'SetPlan', plan: { ...p, call: 'sing' as Plan['call'] } },
    'call'
  );
  refused(
    DAY,
    { kind: 'SetPlan', plan: { ...p, objectives: [7, 7, 7, 7] } },
    'objectives'
  );
  const part = DAY.teams[ME].parts[0].id;
  refused(
    DAY,
    {
      kind: 'SetPlan',
      plan: {
        ...p,
        parts: [
          { part, ship: 0 },
          { part, ship: 1 },
        ],
      },
    },
    'parts'
  );
  refused(
    DAY,
    { kind: 'SetPlan', plan: { ...p, parts: [{ part: 99999, ship: 0 }] } },
    'parts'
  );
  const started = must(DAY, { kind: 'RaceStarted', round: 0 });
  refused(started, { kind: 'SetPlan', plan: p }, 'racing');
});

test('RaceStarted, RecordRace and Forfeit: each refusal; while the race is under way only they and MarkRead are taken', () => {
  refused(founded(), { kind: 'RaceStarted', round: 0 }, 'noRace');
  refused(DAY, { kind: 'RaceStarted', round: 1 }, 'round');
  const cards = raceCards(DAY);
  const mineTier = DAY.teams[ME].tier;
  const result = standIn(cards[mineTier]);
  refused(founded(), { kind: 'RecordRace', result }, 'noRace');
  refused(DAY, { kind: 'RecordRace', result }, 'notStarted');
  refused(DAY, { kind: 'Forfeit', round: 0 }, 'notStarted');
  const on = must(DAY, { kind: 'RaceStarted', round: 0 });
  refused(on, { kind: 'RaceStarted', round: 0 }, 'racing');
  refused(on, { kind: 'RecordRace', result: { ...result, tier: 9 } }, 'tier');
  refused(on, { kind: 'RecordRace', result: { ...result, round: 3 } }, 'round');
  refused(
    on,
    { kind: 'RecordRace', result: { ...result, order: result.order.slice(1) } },
    'order'
  );
  refused(
    on,
    {
      kind: 'RecordRace',
      result: {
        ...result,
        hits: [{ id: 999, fired: 0, landed: 0, taken: 0, dealt: 0 }],
      },
    },
    'result'
  );
  refused(on, { kind: 'Forfeit', round: 2 }, 'round');
  refused(on, { kind: 'SetPlan', plan: plan(on) }, 'racing');
  refused(on, { kind: 'Advance' }, 'racing');
  refused(DAY, { kind: 'Advance' }, 'raceDay');
  const once = must(on, { kind: 'RecordRace', result });
  refused(once, { kind: 'RecordRace', result }, 'recorded');
  refused(once, { kind: 'Forfeit', round: 0 }, 'recorded');
  const gone = must(on, { kind: 'Forfeit', round: 0 });
  assert.ok(gone.mail.some((m) => m.kind === 'forfeit'));
  refused(gone, { kind: 'Forfeit', round: 0 }, 'forfeited');
  const forfeitCard = raceCards(gone)[mineTier];
  assert.ok(
    forfeitCard.ships[0].forfeit && !forfeitCard.ships[1].forfeit,
    "the player's ship is forfeit; her team's others sail on"
  );
});

test('points: 25, 18, 15, 12, 10, 8, 6, 4, 2, 1 to the first ten ships; a sinking and the most sea add theirs', () => {
  assert.deepEqual(
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 80].map(placePoints),
    [25, 18, 15, 12, 10, 8, 6, 4, 2, 1, 0, 0]
  );
  // twenty teams of four; the ships home in id order but team 1's first ship, which wins
  const order = [4, ...Array.from({ length: 80 }, (_, i) => i)].filter(
    (id, i) => i === 0 || id !== 4
  );
  const result: RaceResult = {
    seed: 1,
    tier: 0,
    round: 0,
    order,
    sinkings: [{ id: 79, by: 0, cause: 'shot', gun: null, second: 100 }],
    seaHeld: [
      { id: 5, share: 0.35 },
      { id: 6, share: 0.25 },
      { id: 0, share: 0.4 },
    ],
    faults: [],
    pits: [],
    hits: [],
    seconds: 600,
    hash: '00000000',
  };
  const t = tally(result, 20, { pointsPerSinking: 2, seaHeldPoint: true });
  assert.equal(
    t[0].points,
    18 + 15 + 12 + 10 + 2,
    'team 0: second to fifth, and a sinking'
  );
  assert.equal(
    t[1].points,
    25 + 8 + 6 + 4 + 1,
    'team 1: the win, sixth to eighth, and the most sea (its ships together)'
  );
  assert.deepEqual([t[1].wins, t[1].podiums, t[0].podiums], [1, 1, 2]);
  assert.equal(t[0].sank, 1);
  assert.equal(t[19].afloat, 3);
  assert.equal(t[2].points, 2 + 1, 'team 2: ninth and tenth');
});

test('the drivers\' table: each ship\'s points go to who sailed her, the player among them', () => {
  const after = sailed(DAY);
  const l = after.championships[after.teams[ME].tier];
  const teams = new Map(l.standings.map((x) => [x.team, x.points]));
  const byTeam = new Map<number, number>();
  for (const d of l.drivers)
    byTeam.set(d.team, (byTeam.get(d.team) ?? 0) + d.points);
  assert.ok(l.drivers.some((d) => d.person === after.player!.person));
  assert.equal(l.drivers.length, l.teams.length * TEAM);
  for (const [team, points] of teams) {
    const sea = points - (byTeam.get(team) ?? 0);
    assert.ok(sea === 0 || sea === 1, `team ${team}: its ships' points, and at most the sea's one`);
  }
});

test('the round closes when the three results are in: standings by points, the next round, the race cleared', () => {
  const after = sailed(DAY);
  assert.equal(after.race, null);
  assert.equal(after.round, 1);
  for (const l of after.championships) {
    assert.equal(l.standings.length, l.teams.length);
    assert.ok(l.standings.some((x) => x.points > 0));
  }
  assert.ok(after.mail.some((m) => m.kind === 'raceResult'));
  invariants(after);
});

test('the season ends: prizes, two up and two down, standings reset, the next calendar a year on', () => {
  assert.deepEqual(
    [
      ...movesOf([
        [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
        [10, 11, 12, 13, 14, 15, 16, 17, 18, 19],
        [20, 21, 22, 23, 24, 25, 26, 27, 28, 29],
      ]),
    ].sort((a, b) => a[0] - b[0]),
    [
      [8, 1],
      [9, 1],
      [10, -1],
      [11, -1],
      [18, 1],
      [19, 1],
      [20, -1],
      [21, -1],
    ]
  );
  let s = DAY;
  const sizes = s.championships.map((l) => l.teams.length);
  while (s.season === 0) {
    if (s.player?.sacked)
      s = must(s, { kind: 'TakeJob', team: s.player.offers[0].team });
    else if (s.race !== null) s = sailed(s);
    else s = must(s, { kind: 'Advance' });
  }
  assert.equal(s.season, 1);
  assert.deepEqual(
    s.championships.map((l) => l.teams.length),
    sizes
  );
  assert.ok(
    s.championships.every(
      (l) => l.standings.every((x) => x.points === 0) && l.drivers.length === 0
    )
  );
  assert.equal(s.calendar?.start, YEAR);
  assert.ok(s.queue.some((e) => e.kind === 'seasonEnd'));
  // the season opens midway through the off-season, and Advance stops there (or before, for the player)
  const opening = Math.floor(
    (YEAR - TUNING.calendar.off + s.calendar!.rounds[0].day) / 2
  );
  assert.ok(s.day <= opening, "Advance stops at the season's opening");
  const event = s.queue.find((e) => e.kind === 'seasonStart');
  assert.ok(
    s.day === opening ? !event : event?.day === opening,
    'the opening is on the queue until its day'
  );
  assert.ok(s.mail.some((m) => m.kind === 'seasonEnded'));
  invariants(s);
});

test('debug commands: only with debug allowed; DebugBalance takes a whole non-zero sum up to a million; the jumps stop at race day', () => {
  const s = founded();
  refused(s, { kind: 'DebugBalance', balance: 0 }, 'balance');
  refused(s, { kind: 'DebugBalance', balance: 1.5 }, 'balance');
  refused(s, { kind: 'DebugBalance', balance: 2e6 }, 'balance');
  const rich = must(s, { kind: 'DebugBalance', balance: 500 });
  assert.equal(rich.teams[ME].balance, s.teams[ME].balance + 500);
  const day = must(s, { kind: 'DebugToRaceDay' });
  assert.ok(day.race !== null);
  refused(day, { kind: 'DebugToRaceDay' }, 'raceDay');
  refused(day, { kind: 'DebugToSeasonEnd' }, 'raceDay');
  const end = must(sailed(day), { kind: 'DebugToSeasonEnd' });
  assert.ok(
    end.race !== null || end.season === 1 || end.player!.sacked,
    "stops at a race day, the season's end, or a sacking"
  );
  const r = apply(s, { kind: 'DebugBalance', balance: 500 });
  assert.equal(r.ok, false, 'debug commands need debug allowed');
});

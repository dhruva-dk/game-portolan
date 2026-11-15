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
import { synthetic } from '../tools/synthetic.ts';
import { SPEC_SHIP, founded, invariants, must, refused, sailed, toRaceDay } from './career-kit.ts';

const DAY = toRaceDay(founded());
const ME = DAY.player!.crew;

/** A state with gulls marked unfit for some races. */
const unfitted = (s: CareerState, ids: readonly number[], races = 2): CareerState => {
  const gulls = [...s.gulls];
  for (const id of ids) gulls[id] = { ...gulls[id], unfit: races };
  return { ...s, gulls };
};

/** A sound plan for the player's crew. */
function plan(s: CareerState): Plan {
  const c = s.crews[ME];
  const [mend, gust, stores, part] = c.staff.flight;
  return { captain: c.staff.ships[1].captain!, parts: [], stance: 'hold', call: 'withMe', order: ['mend', 'gust', 'stores', 'part'],
    jobs: { mend, gust, stores, part }, objectives: c.patrons.map(() => null) };
}

test('race day: the player sails ship one; every other ship has one sailor, none twice, none unfit', () => {
  assert.equal(DAY.race?.round, 0);
  const all = lineups(DAY);
  assert.equal(all[ME].ships[0].captain, null);
  const seen = new Set<number>();
  for (const x of all) for (const a of x.ships) {
    if (x.crew === ME && a === x.ships[0]) continue;
    assert.ok(a.forfeit || a.captain !== null);
    if (a.captain === null) continue;
    assert.ok(!seen.has(a.captain), `gull ${a.captain} sails twice`);
    seen.add(a.captain);
    assert.equal(DAY.gulls[a.captain].unfit, 0);
  }
  const cards = raceCards(DAY, SPEC_SHIP);
  assert.equal(cards.length, DAY.leagues.length);
  for (const card of cards) assert.equal(card.ships.length, DAY.leagues[card.league].crews.length * 2);
  assert.equal(cards[DAY.crews[ME].league].ships[0].captain, null, 'the player\'s own ship is sailed, not simulated');
});

test('stand-ins: a ship whose captain and reserve are unfit takes the best free captain for the race; with none she is forfeit', () => {
  const c = DAY.crews[ME];
  const own = [c.staff.ships[1].captain, c.staff.reserve].filter((x): x is number => x !== null);
  const hurt = unfitted(DAY, own);
  const two = lineups(hurt)[ME].ships[1];
  assert.ok(two.standIn && two.captain !== null && hurt.gulls[two.captain].contract === null);
  const free = DAY.gulls.filter((g) => g.role === 'captain' && g.contract === null && g.retired === null && !g.player).map((g) => g.id);
  const none = unfitted(hurt, free);
  assert.ok(lineups(none)[ME].ships[1].forfeit);
  refused(none, { kind: 'RaceStarted', round: 0 }, 'shipTwo');
});

test('SetPlan: a sound plan is kept; each wrong part of one is refused with its reason', () => {
  const p = plan(DAY);
  const set = must(DAY, { kind: 'SetPlan', plan: p });
  assert.deepEqual(set.crews[ME].plan?.stance, 'hold');
  const other = DAY.crews.find((c) => c.id !== ME)!.staff.ships[0].captain!;
  refused(DAY, { kind: 'SetPlan', plan: { ...p, captain: other } }, 'captain');
  refused(DAY, { kind: 'SetPlan', plan: { ...p, captain: -1 } }, 'captain');
  refused(unfitted(DAY, [p.captain]), { kind: 'SetPlan', plan: p }, 'unfit');
  refused(DAY, { kind: 'SetPlan', plan: { ...p, stance: 'dance' as Plan['stance'] } }, 'stance');
  refused(DAY, { kind: 'SetPlan', plan: { ...p, call: 'sing' as Plan['call'] } }, 'call');
  refused(DAY, { kind: 'SetPlan', plan: { ...p, order: ['mend', 'mend', 'stores', 'part'] } }, 'order');
  refused(DAY, { kind: 'SetPlan', plan: { ...p, jobs: { ...p.jobs, gust: p.jobs.mend } } }, 'jobs');
  refused(DAY, { kind: 'SetPlan', plan: { ...p, objectives: [7, 7, 7, 7] } }, 'objectives');
  const part = DAY.crews[ME].parts[0].id;
  refused(DAY, { kind: 'SetPlan', plan: { ...p, parts: [{ part, ship: 0 }, { part, ship: 1 }] } }, 'parts');
  refused(DAY, { kind: 'SetPlan', plan: { ...p, parts: [{ part: 99999, ship: 0 }] } }, 'parts');
  const started = must(DAY, { kind: 'RaceStarted', round: 0 });
  refused(started, { kind: 'SetPlan', plan: p }, 'racing');
});

test('RaceStarted, RecordRace and Forfeit: each refusal; while the race is under way only they and MarkRead are taken', () => {
  refused(founded(), { kind: 'RaceStarted', round: 0 }, 'noRace');
  refused(DAY, { kind: 'RaceStarted', round: 1 }, 'round');
  const cards = raceCards(DAY, SPEC_SHIP);
  const mineLeague = DAY.crews[ME].league;
  const result = synthetic(cards[mineLeague]);
  refused(founded(), { kind: 'RecordRace', result }, 'noRace');
  refused(DAY, { kind: 'RecordRace', result }, 'notStarted');
  refused(DAY, { kind: 'Forfeit', round: 0 }, 'notStarted');
  const on = must(DAY, { kind: 'RaceStarted', round: 0 });
  refused(on, { kind: 'RaceStarted', round: 0 }, 'racing');
  refused(on, { kind: 'RecordRace', result: { ...result, league: 9 } }, 'league');
  refused(on, { kind: 'RecordRace', result: { ...result, round: 3 } }, 'round');
  refused(on, { kind: 'RecordRace', result: { ...result, order: result.order.slice(1) } }, 'order');
  refused(on, { kind: 'RecordRace', result: { ...result, hits: [{ id: 999, fired: 0, landed: 0, taken: 0 }] } }, 'result');
  refused(on, { kind: 'Forfeit', round: 2 }, 'round');
  refused(on, { kind: 'MoveFlightJob', gull: on.crews[ME].staff.flight[0], job: 'gust' }, 'racing');
  refused(on, { kind: 'Advance' }, 'racing');
  refused(DAY, { kind: 'Advance' }, 'raceDay');
  const once = must(on, { kind: 'RecordRace', result });
  refused(once, { kind: 'RecordRace', result }, 'recorded');
  refused(once, { kind: 'Forfeit', round: 0 }, 'recorded');
  const gone = must(on, { kind: 'Forfeit', round: 0 });
  assert.ok(gone.mail.some((m) => m.kind === 'forfeit'));
  refused(gone, { kind: 'Forfeit', round: 0 }, 'forfeited');
  const forfeitCard = raceCards(gone, SPEC_SHIP)[mineLeague];
  assert.ok(forfeitCard.ships[0].forfeit && !forfeitCard.ships[1].forfeit, 'the player\'s ship is forfeit; ship two sails on');
});

test('points (D20): 25, 22, 20, 18, 16, then one less a place to 1 at 20th; a sinking and the most sea add theirs', () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6, 19, 20, 21, 40].map(placePoints), [25, 22, 20, 18, 16, 15, 2, 1, 0, 0]);
  const order = Array.from({ length: 40 }, (_, i) => i);
  const result = { seed: 1, league: 0, round: 0, order, sinkings: [{ id: 39, by: 0, cause: 'shot' as const, second: 100 }],
    seaHeld: [{ id: 2, share: 0.6 }, { id: 0, share: 0.4 }], faults: [], stops: [], hits: [], seconds: 600 };
  const t = tally(result, 20, { pointsPerSinking: 2, seaHeldPoint: true });
  assert.equal(t[0].points, 25 + 22 + 2, 'crew 0: first and second, a sinking');
  assert.equal(t[1].points, 20 + 18 + 1, 'crew 1: third and fourth, the most sea');
  assert.equal(t[0].sank, 1);
  assert.equal(t[19].afloat, 1);
});

test('the round closes when the three results are in: standings by points, the next round, the race cleared', () => {
  const after = sailed(DAY);
  assert.equal(after.race, null);
  assert.equal(after.round, 1);
  for (const l of after.leagues) {
    assert.equal(l.standings.length, l.crews.length);
    assert.ok(l.standings.some((x) => x.points > 0));
  }
  assert.ok(after.mail.some((m) => m.kind === 'raceResult'));
  invariants(after);
});

test('the season ends: prizes, four up and four down, standings reset, the next calendar a year on', () => {
  assert.deepEqual([...movesOf([[0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [10, 11, 12, 13, 14, 15, 16, 17, 18, 19], [20, 21, 22, 23, 24, 25, 26, 27, 28, 29]])].sort((a, b) => a[0] - b[0]),
    [[6, 1], [7, 1], [8, 1], [9, 1], [10, -1], [11, -1], [12, -1], [13, -1], [16, 1], [17, 1], [18, 1], [19, 1], [20, -1], [21, -1], [22, -1], [23, -1]]);
  let s = DAY;
  const sizes = s.leagues.map((l) => l.crews.length);
  while (s.season === 0) {
    if (s.player?.sacked) s = must(s, { kind: 'TakeJob', crew: s.player.offers[0].crew });
    else if (s.race !== null) s = sailed(s);
    else s = must(s, { kind: 'Advance' });
  }
  assert.equal(s.season, 1);
  assert.deepEqual(s.leagues.map((l) => l.crews.length), sizes);
  assert.ok(s.leagues.every((l) => l.standings.every((x) => x.points === 0)));
  assert.equal(s.calendar?.start, YEAR);
  assert.ok(s.queue.some((e) => e.kind === 'seasonEnd') && s.queue.some((e) => e.kind === 'seasonStart'));
  assert.ok(s.mail.some((m) => m.kind === 'seasonEnded'));
  invariants(s);
});

test('debug commands: only with debug allowed; DebugCoin takes a whole non-zero sum up to a million; the jumps stop at race day', () => {
  const s = founded();
  refused(s, { kind: 'DebugCoin', coin: 0 }, 'coin');
  refused(s, { kind: 'DebugCoin', coin: 1.5 }, 'coin');
  refused(s, { kind: 'DebugCoin', coin: 2e6 }, 'coin');
  const rich = must(s, { kind: 'DebugCoin', coin: 500 });
  assert.equal(rich.crews[ME].coin, s.crews[ME].coin + 500);
  const day = must(s, { kind: 'DebugToRaceDay' });
  assert.ok(day.race !== null);
  refused(day, { kind: 'DebugToRaceDay' }, 'raceDay');
  refused(day, { kind: 'DebugToSeasonEnd' }, 'raceDay');
  const end = must(sailed(day), { kind: 'DebugToSeasonEnd' });
  assert.ok(end.race !== null || end.season === 1 || end.player!.sacked, 'stops at a race day, the season\'s end, or a sacking');
  const r = apply(s, { kind: 'DebugCoin', coin: 500 });
  assert.equal(r.ok, false, 'debug commands need debug allowed');
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GUNS } from '../src/sim/handling.ts';
import type { MatchResult, ShipResult } from '../src/sim/result.ts';
import {
  bandOf,
  duelFigures,
  duelTally,
  matchFigures,
  median,
  type Fired,
  type Log,
} from '../tools/sim/figures.ts';
import { figureLines } from '../tools/sim/print.ts';

const ship = (place: number, sunkAt: number | null): ShipResult => ({
  place,
  sunkAt,
  sunkBy: null,
  sinkings: 0,
  shotsFired: 0,
  shotsLanded: 0,
  damageDealt: 0,
  damageTaken: 0,
  afloatAtPhaseFour: sunkAt === null,
});

const result = (
  seconds: number,
  ships: ShipResult[],
  sea: number[][]
): MatchResult => ({ seconds, hash: '00000000', ships, sea });

const shot = (ship: number, range: number, landed: boolean): Fired => ({
  ship,
  range,
  landed,
});

const LOG: Log = {
  ships: [
    { team: 0, standing: 3 },
    { team: 0, standing: 3 },
    { team: 1, standing: 15 },
    { team: 1, standing: 15 },
  ],
  result: result(
    120,
    [ship(1, null), ship(3, 90), ship(2, null), ship(4, 60)],
    [
      [0.25, 0.125],
      [0.125, 0.375],
    ]
  ),
  shots: [
    shot(0, 30, true),
    shot(1, 50, false),
    shot(2, 100, true),
    shot(3, 200, false),
  ],
  fights: [9, 2, 4],
  heals: ['rare', 'legendary', 'rare'],
};

test('a range falls in the band its gun ranges bound', () => {
  assert.equal(bandOf(GUNS.scatter.range - 1), 'close');
  assert.equal(bandOf(GUNS.scatter.range), 'mid');
  assert.equal(bandOf(GUNS.repeater.range - 1), 'mid');
  assert.equal(bandOf(GUNS.repeater.range), 'far');
});

test('the median is the middle value, or the mean of the middle two', () => {
  assert.equal(median([9, 2, 4]), 4);
  assert.equal(median([9, 2, 4, 6]), 5);
  assert.equal(median([]), null);
});

test('a match’s figures follow from its log', () => {
  const f = matchFigures(LOG);
  assert.equal(f.length, 120);
  assert.equal(f.timeToSink, 4);
  assert.equal(f.sinkings, 3);
  assert.deepEqual(f.hitRate, { shots: 4, landed: 2, rate: 0.5 });
  assert.deepEqual(f.byRange, {
    close: { shots: 2, landed: 1, rate: 0.5 },
    mid: { shots: 1, landed: 1, rate: 1 },
    far: { shots: 1, landed: 0, rate: 0 },
  });
  assert.deepEqual(f.heals, {
    used: 3,
    by: { common: 0, rare: 2, epic: 0, legendary: 1 },
  });
  assert.deepEqual(f.sea, [
    { claimed: 0.375, top: 0.25 },
    { claimed: 0.5, top: 0.375 },
  ]);
  assert.deepEqual(f.places, [
    { standings: [1, 10], ships: 2, mean: 2, best: 1 },
    { standings: [11, 20], ships: 2, mean: 3, best: 2 },
  ]);
});

test('the printed lines carry each figure', () => {
  const text = figureLines(matchFigures(LOG)).join('\n');
  for (const part of [
    'length: 120 s',
    'time to sink: median 4 s over 3 sinkings',
    'hit rate by range: 50% of 4 shots · close 50% of 2 · mid 100% of 1 · far 0% of 1',
    'heals used: 3 (common 0, rare 2, epic 0, legendary 1)',
    'at each sample: 1 38%/25% · 2 50%/38%',
    'places by standing: 1-10 mean 2 best 1 · 11-20 mean 3 best 2',
  ])
    assert.ok(text.includes(part), `${part}\nin\n${text}`);
});

test('a duel’s figures name the winner, the sinking and each ship’s aim', () => {
  const shot1 = duelFigures(
    result(80, [ship(1, null), ship(2, 80)], [[0.1], [0.2]]),
    [shot(0, 60, true), shot(0, 60, false), shot(1, 60, false)],
    [{ ship: 1, cause: 'shot', fight: 6 }]
  );
  assert.deepEqual(shot1, {
    seconds: 80,
    winner: 0,
    sunk: { ship: 1, cause: 'shot', fight: 6 },
    timeToSink: 6,
    ships: [
      { shots: 2, landed: 1, rate: 0.5 },
      { shots: 1, landed: 0, rate: 0 },
    ],
    unfired: false,
  });
  const storm = duelFigures(
    result(200, [ship(2, 200), ship(1, null)], [[0], [0]]),
    [],
    [{ ship: 0, cause: 'storm', fight: null }]
  );
  assert.equal(storm.winner, 1);
  assert.equal(storm.timeToSink, null);
  assert.equal(storm.unfired, true);
  const t = duelTally(
    [
      { figures: shot1, sides: [0, 1] },
      { figures: shot1, sides: [1, 0] },
      { figures: { ...shot1, timeToSink: 2 }, sides: [0, 1] },
      { figures: storm, sides: [0, 1] },
    ],
    2
  );
  assert.deepEqual(t, {
    duels: 4,
    wins: [2, 2],
    none: 0,
    timeToSink: 6,
    storm: 1,
    stormUnfired: 1,
  });
});

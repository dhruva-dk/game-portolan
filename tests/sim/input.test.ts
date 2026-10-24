// src/sim/input.ts and the runner in src/sim/match.ts: a recording replays exactly the inputs of every tick, from
// any tick, after a trip through JSON; untrusted recordings are checked; the same seed and inputs give the same
// match every time; and a match resumed from a snapshot at any tick ends identical to one never interrupted.
//   node --test tests/sim/input.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FLAG, INPUT_FIELDS, STEER_MAX, applyControls, idleInput, inputAt, parseRecording, record, recorder, replay,
  type Recording, type ShipInput,
} from '../../src/sim/input.ts';
import { rngChance, rngFrom, rngInt, type Rng } from '../../src/sim/math.ts';
import { runMatch, step } from '../../src/sim/match.ts';
import { TERRITORY } from '../../src/sim/sphere.ts';
import { SAIL, TICK, createMatch, decodeMatch, encodeMatch, matchHash } from '../../src/sim/state.ts';

/** A player who acts like a thumb: holds the helm for a while, steps the sails, now and then draws a course. */
function scriptedInputs(seed: number, ticks: number): ShipInput[] {
  const r: Rng = rngFrom(seed), inputs: ShipInput[] = [], held = idleInput();
  for (let t = 0; t < ticks; t++) {
    const input = { ...held, sail: 0, consumable: -1, chestPick: -1, course: null as number[] | null };
    if (rngChance(r, 0.05)) held.steer = input.steer = rngInt(r, 2 * STEER_MAX + 1) - STEER_MAX;
    if (rngChance(r, 0.01)) input.sail = rngChance(r, 0.5) ? 1 : -1;
    if (rngChance(r, 0.01)) held.flags = input.flags = rngInt(r, 32);
    if (rngChance(r, 0.003)) input.consumable = rngInt(r, 3);
    if (rngChance(r, 0.003)) held.aim = input.aim = rngChance(r, 0.5) ? -1 : rngInt(r, TERRITORY.cells);
    if (rngChance(r, 0.002)) input.chestPick = rngInt(r, 3);
    if (rngChance(r, 0.002)) input.course = rngChance(r, 0.2) ? [] : Array.from({ length: 1 + rngInt(r, 40) }, () => rngInt(r, TERRITORY.cells));
    inputs.push(input);
  }
  return inputs;
}

function recordAll(inputs: ShipInput[]): Recording {
  const rec = recorder();
  inputs.forEach((input, t) => record(rec, t, input));
  return rec.recording;
}

test('a recording replays the exact input of every tick, from any tick, through JSON', () => {
  const inputs = scriptedInputs(1, 20_000), recording = recordAll(inputs);
  const changes = recording.events.length;
  assert.ok(changes < inputs.length / 2, `${changes} change events for ${inputs.length} ticks`);

  const json = parseRecording(JSON.parse(JSON.stringify(recording)));
  assert.deepEqual(json, recording);
  for (const rec of [recording, json]) {
    const r = replay(rec);
    inputs.forEach((want, t) => assert.deepEqual(inputAt(r, t), want, `tick ${t}`));
  }
  // A replay can start anywhere: the input at tick t is every event up to t.
  for (const start of [0, 1, 777, 12_345, 19_999]) {
    const r = replay(recording);
    for (let t = start; t < Math.min(start + 500, inputs.length); t++) assert.deepEqual(inputAt(r, t), inputs[t]);
  }
});

test('recording refuses invalid input, and parsing refuses invalid recordings', () => {
  const rec = recorder();
  record(rec, 0, idleInput());
  assert.throws(() => record(rec, 0, idleInput()), /tick 0 after 0/);
  for (const [field, value] of [['steer', 128], ['steer', 0.5], ['sail', 2], ['flags', 32], ['consumable', 3],
    ['aim', TERRITORY.cells], ['chestPick', -2], ['course', [1, -1]]] as const) {
    assert.throws(() => record(rec, 1, { ...idleInput(), [field]: value }), new RegExp(`bad ${field}`));
  }
  assert.equal(rec.lastTick, 0, 'a refused input records nothing');

  const good = { format: 1, events: [[0, 'steer', 5], [3, 'course', [1, 2]], [3, 'flags', FLAG.headHome | FLAG.dive]] };
  assert.equal(parseRecording(good).events.length, 3);
  const bad: unknown[] = [
    null, 5, { events: [] }, { format: 2, events: [] }, { format: 1 },
    { format: 1, events: [[0, 'steer']] },
    { format: 1, events: [[0, 'steer', 5, 6]] },
    { format: 1, events: [[0, 'rudder', 5]] },
    { format: 1, events: [[-1, 'steer', 5]] },
    { format: 1, events: [[0.5, 'steer', 5]] },
    { format: 1, events: [[5, 'steer', 5], [4, 'sail', 1]] },
    { format: 1, events: [[0, 'steer', 200]] },
    { format: 1, events: [[0, 'course', [TERRITORY.cells]]] },
    { format: 1, events: [[0, 'course', 'home']] },
  ];
  for (const data of bad) assert.throws(() => parseRecording(data), TypeError, JSON.stringify(data));
  // Parsing copies: later changes to the source do not reach the recording.
  const src = { format: 1, events: [[0, 'course', [4, 5]]] };
  const parsed = parseRecording(src);
  (src.events[0][2] as number[])[0] = 9;
  assert.deepEqual(parsed.events[0][2], [4, 5]);
  assert.deepEqual(INPUT_FIELDS, Object.keys(idleInput()));
});

test('controls: sail steps stop at reefed and full; a course is set, kept, copied and dropped', () => {
  const s = createMatch({ seed: 1 }), ship = s.ships[0];
  assert.equal(ship.sail, SAIL.plain);
  const at = (patch: Partial<ShipInput>) => applyControls(ship, { ...idleInput(), ...patch });
  at({ sail: 1 });
  at({ sail: 1 });
  assert.equal(ship.sail, SAIL.full);
  for (let i = 0; i < 4; i++) at({ sail: -1 });
  assert.equal(ship.sail, SAIL.reefed);
  const course = [10, 11, 12];
  at({ course });
  course.push(13);
  assert.deepEqual(ship.course, [10, 11, 12]);
  at({ course: null });
  assert.deepEqual(ship.course, [10, 11, 12]);
  at({ course: [] });
  assert.deepEqual(ship.course, []);
});

test('the same seed and inputs give the same match; any difference shows in the hash', () => {
  const recording = recordAll(scriptedInputs(7, 9000));
  const run = (seed: number, rec: Recording) => {
    const s = createMatch({ seed });
    runMatch(s, rec, 9000);
    assert.equal(s.tick, 9000);
    return matchHash(s);
  };
  const h = run(42, recording);
  assert.equal(run(42, recording), h);
  assert.notEqual(run(43, recording), h);
  assert.notEqual(run(42, recordAll(scriptedInputs(8, 9000))), h);
  assert.notEqual(matchHash(createMatch({ seed: 42 })), h, 'the inputs reach the state');
  assert.equal(9000 * TICK, 300, 'five minutes of match');
  for (const seed of [-1, 2 ** 32, 1.5, NaN]) assert.throws(() => createMatch({ seed }), RangeError);
});

test('a match resumed from a snapshot at any tick ends identical to one never interrupted', () => {
  const end = 6000, recording = recordAll(scriptedInputs(3, end));
  const whole = createMatch({ seed: 9 });
  runMatch(whole, recording, end);
  const r = rngFrom(4);
  for (let i = 0; i < 12; i++) {
    const k = i === 0 ? 0 : i === 1 ? end - 1 : rngInt(r, end);
    const s = createMatch({ seed: 9 });
    runMatch(s, recording, k);
    const resumed = decodeMatch(encodeMatch(s));
    runMatch(resumed, recording, end);
    assert.equal(matchHash(resumed), matchHash(whole), `snapshot at tick ${k}`);
  }
  // The runner is the step: stepping by hand with the replayed inputs gives the same state.
  const byHand = createMatch({ seed: 9 }), inputs = replay(recording);
  while (byHand.tick < end) step(byHand, inputAt(inputs, byHand.tick));
  assert.equal(matchHash(byHand), matchHash(whole));
});

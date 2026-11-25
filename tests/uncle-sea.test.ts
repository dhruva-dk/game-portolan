import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PLAYER_SHIP,
  type Kit,
  type Moment,
  type Status,
} from '../src/play/player.ts';
import { UNCLE_AT_SEA, createUncle, type Around } from '../src/play/uncle.ts';

type Now = Status & Kit;

const calm = (over: Partial<Now> = {}): Now =>
  ({
    arriving: 0,
    sunk: false,
    sea: 0,
    closing: false,
    moments: [],
    gust: 0,
    heals: [null, null, null],
    ...over,
  }) as Now;

const sailing: Around = { live: true, rival: null, offered: false };

const took = (ship: number): Moment =>
  ({
    seq: 1,
    time: 0,
    at: [0, 0, 1],
    ship,
    kind: 'took',
    heal: 'common',
    slot: 0,
    seen: null,
    bearing: 0,
    meters: 0,
    whence: null,
  }) as Moment;

const run = (
  uncle: ReturnType<typeof createUncle>,
  seconds: number,
  now: Now = calm(),
  around: Around = sailing
) => {
  let said = null;
  for (let t = 0; t < seconds; t += 0.25)
    said = uncle.update(0.25, now, around);
  return said;
};

test('race one starts with steer, once the ship has arrived and the hands are live', () => {
  const uncle = createUncle([]);
  assert.equal(uncle.update(0.1, calm({ arriving: 0.4 }), sailing), null);
  assert.equal(uncle.update(0.1, calm(), { ...sailing, live: false }), null);
  assert.equal(uncle.update(0.1, calm(), sailing), 'steer');
  assert.equal(run(uncle, 20), 'steer');
});

test('fire follows 6 s after steer is dismissed, and not before', () => {
  const uncle = createUncle([]);
  uncle.update(0.1, calm(), sailing);
  uncle.seen(['steer']);
  assert.equal(run(uncle, UNCLE_AT_SEA.fireAfter - 0.5), null);
  assert.equal(run(uncle, 1), 'fire');
  uncle.seen(['steer', 'fire']);
  assert.equal(run(uncle, 30), null);
});

test('with steer already seen, fire waits 6 s from the start of the race', () => {
  const uncle = createUncle(['steer']);
  assert.equal(run(uncle, UNCLE_AT_SEA.fireAfter - 0.5), null);
  assert.equal(run(uncle, 1), 'fire');
});

test('nothing is shown again once seen', () => {
  const all = ['steer', 'fire', 'gust', 'heal', 'home', 'storm', 'sunk'];
  const uncle = createUncle(all);
  const busy = calm({
    gust: 1,
    sea: 0.2,
    closing: true,
    moments: [took(PLAYER_SHIP)],
  });
  assert.equal(run(uncle, 10, busy, { ...sailing, rival: 40 }), null);
  assert.equal(
    run(uncle, 1, calm({ sunk: true }), { ...sailing, offered: true }),
    null
  );
});

test('gust needs a full meter and a ship of another team within 150 m', () => {
  const seen = ['steer', 'fire'];
  const near = { ...sailing, rival: UNCLE_AT_SEA.near - 1 };
  assert.equal(run(createUncle(seen), 1, calm({ gust: 0.99 }), near), null);
  assert.equal(
    run(createUncle(seen), 1, calm({ gust: 1 }), {
      ...sailing,
      rival: UNCLE_AT_SEA.near + 1,
    }),
    null
  );
  assert.equal(
    run(createUncle(seen), 1, calm({ gust: 1 }), { ...sailing, rival: null }),
    null
  );
  assert.equal(run(createUncle(seen), 1, calm({ gust: 1 }), near), 'gust');
});

test('heal is your own first pickup, not a rival’s', () => {
  const seen = ['steer', 'fire'];
  assert.equal(
    run(createUncle(seen), 1, calm({ moments: [took(PLAYER_SHIP + 3)] })),
    null
  );
  assert.equal(
    run(createUncle(seen), 1, calm({ moments: [took(PLAYER_SHIP)] })),
    'heal'
  );
});

test('home is the first sea your team holds; storm is the first closing', () => {
  const seen = ['steer', 'fire'];
  assert.equal(run(createUncle(seen), 1, calm({ sea: 0.003 })), 'home');
  assert.equal(run(createUncle(seen), 1, calm({ closing: true })), 'storm');
});

test('one at a time: a second waits for the first to be dismissed, in the order they happened', () => {
  const uncle = createUncle(['steer', 'fire']);
  assert.equal(run(uncle, 1, calm({ sea: 0.01 })), 'home');
  assert.equal(run(uncle, 1, calm({ sea: 0.01, closing: true })), 'home');
  assert.equal(
    run(uncle, 1, calm({ sea: 0.01, moments: [took(PLAYER_SHIP)] })),
    'home'
  );
  uncle.seen(['steer', 'fire', 'home']);
  assert.equal(uncle.update(0.1, calm(), sailing), 'storm');
  uncle.seen(['steer', 'fire', 'home', 'storm']);
  assert.equal(uncle.update(0.1, calm(), sailing), 'heal');
  uncle.seen(['steer', 'fire', 'home', 'storm', 'heal']);
  assert.equal(uncle.update(0.1, calm(), sailing), null);
});

test('sunk waits for the Result button, and sinking withdraws a bubble at the controls unseen', () => {
  const uncle = createUncle(['steer', 'fire']);
  assert.equal(run(uncle, 1, calm({ sea: 0.01 })), 'home');
  const down = calm({ sunk: true });
  assert.equal(uncle.update(0.1, down, sailing), null);
  assert.equal(uncle.update(0.1, down, { ...sailing, live: false }), null);
  assert.equal(
    uncle.update(0.1, down, { ...sailing, live: false, offered: true }),
    'sunk'
  );
  uncle.seen(['steer', 'fire', 'sunk']);
  assert.equal(
    run(uncle, 5, down, { ...sailing, live: false, offered: true }),
    null
  );
});

test('nothing is heard before the race begins; steer and fire come first whatever happened since', () => {
  const uncle = createUncle([]);
  const busy = calm({ gust: 1, closing: true });
  const near = { ...sailing, rival: 20 };
  assert.equal(run(uncle, 3, busy, { ...near, live: false }), null);
  assert.equal(uncle.update(0.1, calm({ gust: 1, arriving: 0.5 }), near), null);
  assert.equal(uncle.update(0.1, calm(), near), 'steer');
  uncle.seen(['steer']);
  assert.equal(run(uncle, UNCLE_AT_SEA.fireAfter + 0.5, calm(), near), 'fire');
  uncle.seen(['steer', 'fire']);
  assert.equal(uncle.update(0.1, calm(), near), 'gust');
});

test('a bubble that happened while arriving shows once the ship has arrived', () => {
  const uncle = createUncle(['steer', 'fire']);
  assert.equal(
    uncle.update(0.1, calm({ closing: true, arriving: 0.3 }), sailing),
    null
  );
  assert.equal(uncle.update(0.1, calm(), sailing), 'storm');
});

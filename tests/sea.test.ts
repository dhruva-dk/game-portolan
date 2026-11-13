// Who holds the sea, as the frame follows it (snapshot.ts Sea): a reader's place in its changes (water/cursor.ts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTerritory, type Territory } from '../src/sim/territory.ts';
import type { Cap } from '../src/sim/storm.ts';
import type { Sea } from '../src/snapshot.ts';
import { createCursor } from '../src/water/cursor.ts';
import { R, add, distance, dot, normalize, scale, type Vec3 } from '../src/world/sphere.ts';

const WHOLE: Cap = { centre: [0, 1, 0], radius: Math.PI };

/** The sea as the game hands it to the frame (play/state.ts sea), for match `generation`. */
const seaOf = (t: Territory, generation: number, clock: number): Sea => ({
  generation, owner: t.owner, changes: t.changes(), clock, colours: [],
  trails: t.trails().flatMap((k, id) => (k.points.length ? [{ id, serial: k.serial, points: k.points }] : [])),
});

/** Points along the great circle from a to b, about 0.4 m apart (a step at her top speed). */
function line(a: Vec3, b: Vec3): Vec3[] {
  const d = distance(a, b), n = Math.max(1, Math.ceil(d / 0.4));
  const w = normalize(add(b, a, -dot(a, b))), th = d / R;
  return Array.from({ length: n }, (_, k) => normalize(add(scale(a, Math.cos((th * (k + 1)) / n)), w, Math.sin((th * (k + 1)) / n))));
}

/** The k-th bite out of her home patch at the pole and back: out on a bearing a sixth of a turn round from the last's,
 *  each further out than the last, across 30 m, and home again. */
const bite = (k: number): Vec3[] => {
  const a = (k * Math.PI) / 3, at: Vec3 = [0, 1, 0];
  const out = normalize(add(at, [Math.cos(a), 0, Math.sin(a)], (50 + 10 * k) / R));
  const across = normalize(add(out, [-Math.sin(a), 0, Math.cos(a)], 30 / R));
  return [at, ...line(at, out), ...line(out, across), ...line(across, at)];
};

/** Sails ship 0 of `t` along `path` from `time`, a step a point; returns the clock after. */
function sail(t: Territory, path: readonly Vec3[], time: number): number {
  for (let k = 1; k < path.length; k++) t.step([{ id: 0, from: path[k - 1], to: path[k] }], (time += 1 / 30), WHOLE);
  return time;
}

test('a new match\'s changes are read from its first: its loops closed are not taken for ones already read', () => {
  const home: Vec3 = [0, 1, 0], cursor = createCursor();
  // the first match: many loops closed, each read as it comes
  const first = createTerritory(1);
  let time = 0;
  first.begin([home], time);
  cursor.read(seaOf(first, 1, time));
  for (let k = 0; k < 12; k++) {
    time = sail(first, bite(k), time);
    const sea = seaOf(first, 1, time), { fresh, from } = cursor.read(sea);
    assert.equal(fresh, false);
    assert.ok(sea.changes.slice(from).some((c) => c.kind === 'claim'), `loop ${k} read`);
  }
  assert.ok(first.changes().at(-1)!.seq > 10);
  // the second: a new sea, read whole, then its first loop read as a loop closed
  const second = createTerritory(1);
  second.begin([home], 0);
  assert.equal(cursor.read(seaOf(second, 2, 0)).fresh, true);
  const t = sail(second, bite(0), 0), sea = seaOf(second, 2, t), { fresh, from } = cursor.read(sea);
  assert.equal(fresh, false);
  assert.deepEqual(sea.changes.slice(from).map((c) => c.kind), ['claim']);
  // read again, nothing new; and no sea at all starts over once
  assert.equal(cursor.read(sea).from, sea.changes.length);
  assert.equal(cursor.read(undefined).fresh, true);
  assert.equal(cursor.read(undefined).fresh, false);
});

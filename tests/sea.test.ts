// Who holds the sea, as the frame follows it (snapshot.ts Sea): a reader's
// place in its changes (water/cursor.ts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTerritory, type Territory } from '../src/sim/territory.ts';
import type { Sea } from '../src/snapshot.ts';
import { SLICES, createClaimed } from '../src/water/claimed.ts';
import { createCursor } from '../src/water/cursor.ts';
import { CELLS, type ReadCells } from '../src/world/cells.ts';
import { random } from '../src/world/random.ts';
import {
  R,
  add,
  distance,
  dot,
  normalize,
  scale,
  type Vec3,
} from '../src/world/sphere.ts';
import { WHOLE, halfLoop, match, seaOf } from '../tools/seas.ts';

/**
 * Points along the great circle from a to b, about 0.4 m apart (a step at her
 * top speed).
 */
function line(a: Vec3, b: Vec3): Vec3[] {
  const d = distance(a, b),
    n = Math.max(1, Math.ceil(d / 0.4));
  const w = normalize(add(b, a, -dot(a, b))),
    th = d / R;
  return Array.from({ length: n }, (_, k) =>
    normalize(
      add(
        scale(a, Math.cos((th * (k + 1)) / n)),
        w,
        Math.sin((th * (k + 1)) / n)
      )
    )
  );
}

/**
 * The k-th bite out of her home patch at the pole and back: out on a bearing a
 * sixth of a turn round from the last's, each further out than the last, across
 * 30 m, and home again.
 */
const bite = (k: number): Vec3[] => {
  const a = (k * Math.PI) / 3,
    at: Vec3 = [0, 1, 0];
  const out = normalize(
    add(at, [Math.cos(a), 0, Math.sin(a)], (50 + 10 * k) / R)
  );
  const across = normalize(add(out, [-Math.sin(a), 0, Math.cos(a)], 30 / R));
  return [at, ...line(at, out), ...line(out, across), ...line(across, at)];
};

/**
 * Sails ship 0 of `t` along `path` from `time`, a step a point; returns the
 * clock after.
 */
function sail(t: Territory, path: readonly Vec3[], time: number): number {
  for (let k = 1; k < path.length; k++)
    t.step(
      [{ id: 0, from: path[k - 1], to: path[k] }],
      (time += 1 / 30),
      WHOLE
    );
  return time;
}

test("a new match's changes are read from its first: its loops closed are not taken for ones already read", () => {
  const home: Vec3 = [0, 1, 0],
    cursor = createCursor();
  // the first match: many loops closed, each read as it comes
  const first = createTerritory(1);
  let time = 0;
  first.begin([home], time);
  cursor.read(seaOf(first, 1));
  for (let k = 0; k < 12; k++) {
    time = sail(first, bite(k), time);
    const sea = seaOf(first, 1),
      { fresh, from } = cursor.read(sea);
    assert.equal(fresh, false);
    assert.ok(
      sea.changes.slice(from).some((c) => c.kind === 'claim'),
      `loop ${k} read`
    );
  }
  assert.ok(first.changes().at(-1)!.seq > 10);
  // the second: a new sea, read whole, then its first loop read as a loop
  // closed
  const second = createTerritory(1);
  second.begin([home], 0);
  assert.equal(cursor.read(seaOf(second, 2)).fresh, true);
  sail(second, bite(0), 0);
  const sea = seaOf(second, 2),
    { fresh, from } = cursor.read(sea);
  assert.equal(fresh, false);
  assert.deepEqual(
    sea.changes
      .slice(from)
      .map((c) => c.kind)
      .filter((k) => k !== 'paint'),
    ['claim'],
    'her strips painted, and one loop closed'
  );
  // read again, nothing new; and no sea at all starts over once
  assert.equal(cursor.read(sea).from, sea.changes.length);
  assert.equal(cursor.read(undefined).fresh, true);
  assert.equal(cursor.read(undefined).fresh, false);
});

test("the water's copy of the cells keeps up with the sea: loops, drains, the storm, frames missed and a new match", () => {
  const claimed = createClaimed(),
    draw = random(17);
  let wait = 0,
    frames = 0,
    whole = 0,
    checked = 0,
    clock = 0,
    most = 0;
  const kinds = new Set<string>();
  const same = (owner: ReadCells, label: string) => {
    for (let c = 0; c < CELLS; c++) {
      if (claimed.ownerOf(c) !== owner[c])
        assert.fail(
          `${label}: cell ${c} is ${claimed.ownerOf(c)}, the sea's ${owner[c]}`
        );
    }
    checked++;
  };
  const frame = (sea: Sea | undefined, time = clock) => {
    if (claimed.follow(sea)) whole++;
    claimed.work((clock = time));
    most = Math.max(most, claimed.used());
    frames++;
  };
  for (const generation of [1, 2]) {
    let last: Sea | undefined;
    match(generation * 101, generation, 3600, (sea, time) => {
      for (const k of sea.changes) kinds.add(k.kind);
      last = sea;
      // most frames one step or two apart; now and then none drawn for ten
      // seconds (the changes kept only eight)
      if (wait-- > 0) return;
      wait = draw() < 0.004 ? 300 : draw() < 0.5 ? 1 : 0;
      frame(sea, time);
      // (what is drawn is the sea's once every change read is: a large one
      // takes a few frames)
      if (claimed.idle() && (frames % 8 === 0 || wait === 300))
        same(sea.owner, `match ${generation}, ${time.toFixed(1)} s`);
    });
    // the last steps' changes read, and every change drawn
    frame(last);
    for (let f = 0; f < 600 && !claimed.idle(); f++)
      claimed.work(clock + f / 60);
    same(last!.owner, `match ${generation}'s end`);
    // the lobby between: no sea, all open (once taken, over some frames)
    frame(undefined);
    for (let f = 0; f < 600 && !claimed.idle(); f++) frame(undefined);
    same(new Uint8Array(CELLS), 'the lobby');
  }
  assert.deepEqual([...kinds].sort(), ['claim', 'drain', 'home', 'paint']);
  // whole for each match's first frame and each lobby's, and again after frames
  // missed
  assert.ok(whole > 4, `taken whole ${whole} times`);
  assert.ok(checked > 100);
  // no frame's work over its budget (what that costs, ms: npm run steps)
  assert.ok(most <= SLICES, `${most} slices in a frame`);
});

test('a loop round half the planet is drawn over some frames, none over its budget', () => {
  const { territory: t, before, after, time } = halfLoop();
  assert.ok(t.share(0) > 0.45, `she holds ${t.share(0)}`);
  // the sea taken whole the step before (the loop's water open), and the loop read after
  const claimed = createClaimed();
  claimed.follow(before);
  claimed.follow(after);
  let frames = 0;
  for (; frames < 600 && !claimed.idle(); frames++) {
    claimed.work(time + frames / 60);
    assert.ok(claimed.used() <= SLICES, `${claimed.used()} slices in a frame`);
  }
  for (let c = 0; c < CELLS; c++) {
    if (claimed.ownerOf(c) !== t.owner[c])
      assert.fail(
        `cell ${c} is ${claimed.ownerOf(c)}, the sea's ${t.owner[c]}`
      );
  }
  // spread over a second or so of frames: more than a few, fewer than two
  // seconds' at 30 FPS
  assert.ok(claimed.idle() && frames > 3 && frames < 60, `${frames} frames`);
});

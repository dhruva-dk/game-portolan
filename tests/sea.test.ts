import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTerritory, type Territory } from '../src/sim/territory.ts';
import type { Sea } from '../src/render/snapshot.ts';
import { SLICES, createClaimed } from '../src/render/water/claimed.ts';
import { createCursor } from '../src/render/water/cursor.ts';
import {
  CELLS,
  N,
  columnOf,
  rowOf,
  type ReadCells,
} from '../src/world/cells.ts';
import { random } from '../src/world/random.ts';
import {
  R,
  add,
  cross,
  distance,
  dot,
  normalize,
  scale,
  type Vec3,
} from '../src/world/sphere.ts';
import { WHOLE, halfLoop, match, seaOf } from './seas.ts';

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

const bite = (k: number): Vec3[] => {
  const a = (k * Math.PI) / 3,
    at: Vec3 = [0, 1, 0];
  const out = normalize(
    add(at, [Math.cos(a), 0, Math.sin(a)], (50 + 10 * k) / R)
  );
  const across = normalize(add(out, [-Math.sin(a), 0, Math.cos(a)], 30 / R));
  return [at, ...line(at, out), ...line(out, across), ...line(across, at)];
};

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
    'its strips painted, and one loop closed'
  );
  assert.equal(cursor.read(sea).from, sea.changes.length);
  assert.equal(cursor.read(undefined).fresh, true);
  assert.equal(cursor.read(undefined).fresh, false);
});

test("a match's whole fleet painting is drawn in the frame it is read, every frame past the match's start, within its budget", () => {
  const ships = 80,
    t = createTerritory(ships),
    claimed = createClaimed();
  const homes = Array.from({ length: ships }, (_, i): Vec3 => {
    const y = 1 - (2 * (i + 0.5)) / ships,
      r = Math.sqrt(1 - y * y),
      a = i * 2.39996;
    return [r * Math.cos(a), y, r * Math.sin(a)];
  });
  const ways = homes.map((h, i) =>
    normalize(
      add(
        [Math.cos(i), 0.3, Math.sin(i)],
        h,
        -dot(h, [Math.cos(i), 0.3, Math.sin(i)])
      )
    )
  );
  t.begin(homes, 0);
  const at = homes.slice();
  let most = 0,
    behind = 0;
  for (let s = 1; s <= 300; s++) {
    const moves = at.map((p, id) => {
      const to = normalize(add(p, ways[id], 0.53 / R)),
        turned = add(ways[id], cross(to, ways[id]), id % 2 ? 0.004 : -0.004);
      ways[id] = normalize(add(turned, to, -dot(turned, to)));
      return { id, from: p, to };
    });
    moves.forEach((m) => (at[m.id] = m.to));
    t.step(moves, s / 30, WHOLE);
    claimed.follow(seaOf(t, 1));
    claimed.work(s / 30);
    most = Math.max(most, claimed.used());
    if (s > 45 && !claimed.idle()) behind++;
  }
  assert.ok(
    t.changes().filter((c) => c.kind === 'paint').length > 1000,
    'the fleet painting'
  );
  assert.equal(behind, 0, 'frames that ended with strips left to draw');
  assert.ok(most <= SLICES, `${most} slices in a frame`);
  const fresh = createClaimed();
  fresh.follow(seaOf(t, 2));
  for (let f = 0; f < 600 && !fresh.idle(); f++) fresh.work(10 + f);
  const edge = (c: number) =>
    Math.min(columnOf(c), rowOf(c), N - 1 - columnOf(c), N - 1 - rowOf(c)) < 4;
  let off = 0;
  for (let c = 0; c < CELLS; c++) {
    if (claimed.ownerOf(c) !== t.owner[c])
      assert.fail(
        `cell ${c} is ${claimed.ownerOf(c)}, the sea's ${t.owner[c]}`
      );
    if (edge(c)) continue;
    const d = Math.abs(claimed.shareAt(c) - fresh.shareAt(c));
    if (d > 1)
      assert.fail(
        `cell ${c}'s share ${claimed.shareAt(c)}, counted afresh ${fresh.shareAt(c)}`
      );
    off += d;
  }
  assert.ok(off < 50, `${off} shares off by a rounding`);
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
      if (wait-- > 0) return;
      wait = draw() < 0.004 ? 300 : draw() < 0.5 ? 1 : 0;
      frame(sea, time);
      if (claimed.idle() && (frames % 8 === 0 || wait === 300))
        same(sea.owner, `match ${generation}, ${time.toFixed(1)} s`);
    });
    frame(last);
    for (let f = 0; f < 600 && !claimed.idle(); f++)
      claimed.work(clock + f / 60);
    same(last!.owner, `match ${generation}'s end`);
    frame(undefined);
    for (let f = 0; f < 600 && !claimed.idle(); f++) frame(undefined);
    same(new Uint8Array(CELLS), 'the lobby');
  }
  assert.deepEqual([...kinds].sort(), ['claim', 'drain', 'home', 'paint']);
  assert.ok(whole > 4, `taken whole ${whole} times`);
  assert.ok(checked > 100);
  assert.ok(most <= SLICES, `${most} slices in a frame`);
});

test('a loop round half the planet is drawn over some frames, none over its budget', () => {
  const { territory: t, before, after, time } = halfLoop();
  assert.ok(t.share(0) > 0.45, `it holds ${t.share(0)}`);
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
  assert.ok(claimed.idle() && frames > 3 && frames < 60, `${frames} frames`);
});

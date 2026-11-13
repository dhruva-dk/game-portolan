// Who holds the sea, as the frame follows it (snapshot.ts Sea): a reader's place in its changes (water/cursor.ts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTerritory, type Move, type Territory } from '../src/sim/territory.ts';
import type { Cap } from '../src/sim/storm.ts';
import type { Sea } from '../src/snapshot.ts';
import { createClaimed } from '../src/water/claimed.ts';
import { createCursor } from '../src/water/cursor.ts';
import { CELLS, type ReadCells } from '../src/world/cells.ts';
import { random } from '../src/world/random.ts';
import { R, add, cross, distance, dot, normalize, scale, type Vec3 } from '../src/world/sphere.ts';

const WHOLE: Cap = { centre: [0, 1, 0], radius: Math.PI };

/** The sea as the game hands it to the frame (play/state.ts sea), for match `generation`. */
const seaOf = (t: Territory, generation: number, clock: number): Sea => ({
  generation, owner: t.owner, seq: t.last(), changes: t.changes(), clock, colours: [],
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

/** Ships sailing bites out of their homes near `centre`, crossing each other's trails, some sunk, under a storm that
 *  closes after `calm` s: `steps` steps of a match, each handed to `frame` once its sea is (generation `generation`)
 *  read or not, as the frames fall. */
function match(seed: number, generation: number, steps: number, frame: (sea: Sea) => void) {
  const draw = random(seed), ships = 6, centre = normalize([0.3, 0.9, 0.2]);
  const [e1, e2] = [normalize(cross(centre, [0, 0, 1])), normalize(cross(centre, normalize(cross(centre, [0, 0, 1]))))];
  const homes = Array.from({ length: ships }, (_, i): Vec3 => normalize(add(add(centre, e1, (90 * Math.cos(i)) / R), e2, (90 * Math.sin(i * 1.7)) / R)));
  const t = createTerritory(ships);
  t.begin(homes, 0);
  const at = homes.slice(), plans: Vec3[][] = homes.map(() => []), sunk = new Set<number>();
  for (let s = 1; s <= steps; s++) {
    const time = s / 30, moves: Move[] = [];
    for (let id = 0; id < ships; id++) {
      if (sunk.has(id)) continue;
      if (!plans[id].length) {
        // a bite: out on a bearing drawn, across, and back to her berth
        const a = draw() * 2 * Math.PI, dir = add(scale(e1, Math.cos(a)), e2, Math.sin(a)), side = add(scale(e1, -Math.sin(a)), e2, Math.cos(a));
        const out = normalize(add(at[id], dir, (30 + 80 * draw()) / R)), across = normalize(add(out, side, (20 + 40 * draw()) / R));
        plans[id] = [out, across, homes[id]];
      }
      const goal = plans[id][0], d = distance(at[id], goal);
      const to = d < 0.4 ? goal : normalize(add(at[id], normalize(add(goal, at[id], -1)), 0.4 / R));
      if (d < 0.4) plans[id].shift();
      moves.push({ id, from: at[id], to });
      at[id] = to;
    }
    const radius = time < 40 ? Math.PI : Math.max(60, 400 - (time - 40) * 12) / R;
    t.step(moves, time, { centre, radius });
    if (draw() < 0.0015 && sunk.size < ships - 2) {
      const id = Math.floor(draw() * ships);
      if (!sunk.has(id)) {
        sunk.add(id);
        t.sink(id, time);
      }
    }
    frame(seaOf(t, generation, time));
  }
}

test('the water\'s copy of the cells keeps up with the sea: loops, drains, the storm, frames missed and a new match', () => {
  const claimed = createClaimed(), draw = random(17);
  let wait = 0, frames = 0, whole = 0, worst = 0, spent = 0, checked = 0;
  const kinds = new Set<string>();
  const same = (owner: ReadCells, label: string) => {
    for (let c = 0; c < CELLS; c++) if (claimed.ownerOf(c) !== owner[c]) assert.fail(`${label}: cell ${c} is ${claimed.ownerOf(c)}, the sea's ${owner[c]}`);
    checked++;
  };
  const frame = (sea: Sea | undefined) => {
    const t0 = performance.now();
    if (claimed.follow(sea)) whole++;
    if (sea) claimed.settle(sea.clock);
    claimed.flush();
    const ms = performance.now() - t0;
    [worst, spent, frames] = [Math.max(worst, ms), spent + ms, frames + 1];
  };
  for (const generation of [1, 2]) {
    match(generation * 101, generation, 3600, (sea) => {
      for (const k of sea.changes) kinds.add(k.kind);
      // most frames one step or two apart; now and then none drawn for ten seconds (the changes kept only eight)
      if (wait-- > 0) return;
      wait = draw() < 0.004 ? 300 : draw() < 0.5 ? 1 : 0;
      frame(sea);
      if (frames % 8 === 0 || wait === 300) same(sea.owner, `match ${generation}, ${sea.clock.toFixed(1)} s`);
    });
    // the lobby between: no sea, all open
    frame(undefined);
    same(new Uint8Array(CELLS), 'the lobby');
  }
  assert.deepEqual([...kinds].sort(), ['claim', 'cut', 'drain', 'home']);
  // whole for each match's first frame and each lobby's, and again after frames missed
  assert.ok(whole > 4, `taken whole ${whole} times`);
  assert.ok(checked > 100);
  // what it costs: a few hundredths of a millisecond a frame, a whole copy some tens
  assert.ok(spent / frames < 0.5 && worst < 60, `${(spent / frames).toFixed(3)} ms a frame, the worst ${worst.toFixed(1)} ms`);
});

test('an open trail\'s points only grow at the end while its serial holds, so a copy is kept up by adding the new', () => {
  const copies = new Map<number, { serial: number; points: Vec3[] }>();
  let grown = 0;
  match(5, 1, 2400, (sea) => {
    for (const t of sea.trails) {
      const o = copies.get(t.id);
      if (o && o.serial === t.serial) {
        assert.ok(t.points.length >= o.points.length);
        o.points.forEach((p, k) => assert.equal(t.points[k], p, `trail ${t.serial}, point ${k}`));
        grown += t.points.length - o.points.length;
      }
      copies.set(t.id, { serial: t.serial, points: t.points.slice() });
    }
  });
  assert.ok(grown > 100, `${grown} points added`);
});

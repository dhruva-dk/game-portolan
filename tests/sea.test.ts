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
const seaOf = (t: Territory, generation: number): Sea => ({
  generation, owner: t.owner, seq: t.last(), changes: t.changes(), colours: [],
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
  cursor.read(seaOf(first, 1));
  for (let k = 0; k < 12; k++) {
    time = sail(first, bite(k), time);
    const sea = seaOf(first, 1), { fresh, from } = cursor.read(sea);
    assert.equal(fresh, false);
    assert.ok(sea.changes.slice(from).some((c) => c.kind === 'claim'), `loop ${k} read`);
  }
  assert.ok(first.changes().at(-1)!.seq > 10);
  // the second: a new sea, read whole, then its first loop read as a loop closed
  const second = createTerritory(1);
  second.begin([home], 0);
  assert.equal(cursor.read(seaOf(second, 2)).fresh, true);
  sail(second, bite(0), 0);
  const sea = seaOf(second, 2), { fresh, from } = cursor.read(sea);
  assert.equal(fresh, false);
  assert.deepEqual(sea.changes.slice(from).map((c) => c.kind), ['claim']);
  // read again, nothing new; and no sea at all starts over once
  assert.equal(cursor.read(sea).from, sea.changes.length);
  assert.equal(cursor.read(undefined).fresh, true);
  assert.equal(cursor.read(undefined).fresh, false);
});

/** Ships sailing bites out of their homes near `centre`, crossing each other's trails, some sunk, under a storm that
 *  closes after `calm` s: `steps` steps of a match, each handed to `frame` once its sea is (generation `generation`),
 *  with the clock, read or not, as the frames fall. */
function match(seed: number, generation: number, steps: number, frame: (sea: Sea, time: number) => void) {
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
    frame(seaOf(t, generation), time);
  }
}

test('the water\'s copy of the cells keeps up with the sea: loops, drains, the storm, frames missed and a new match', () => {
  const claimed = createClaimed(), draw = random(17);
  let wait = 0, frames = 0, whole = 0, loads = 0, spent = 0, checked = 0, clock = 0;
  const kinds = new Set<string>();
  const same = (owner: ReadCells, label: string) => {
    for (let c = 0; c < CELLS; c++) if (claimed.ownerOf(c) !== owner[c]) assert.fail(`${label}: cell ${c} is ${claimed.ownerOf(c)}, the sea's ${owner[c]}`);
    checked++;
  };
  const frame = (sea: Sea | undefined, time = clock) => {
    const t0 = performance.now(), taken = claimed.follow(sea);
    claimed.work((clock = time));
    const ms = performance.now() - t0;
    if (taken) [whole, loads] = [whole + 1, Math.max(loads, ms)];
    else [spent, frames] = [spent + ms, frames + 1];
  };
  for (const generation of [1, 2]) {
    let last: Sea | undefined;
    match(generation * 101, generation, 3600, (sea, time) => {
      for (const k of sea.changes) kinds.add(k.kind);
      last = sea;
      // most frames one step or two apart; now and then none drawn for ten seconds (the changes kept only eight)
      if (wait-- > 0) return;
      wait = draw() < 0.004 ? 300 : draw() < 0.5 ? 1 : 0;
      frame(sea, time);
      // (what is drawn is the sea's once every change read is: a large one takes a few frames)
      if (claimed.idle() && (frames % 8 === 0 || wait === 300)) same(sea.owner, `match ${generation}, ${time.toFixed(1)} s`);
    });
    // the last steps' changes read, and every change drawn
    frame(last);
    for (let f = 0; f < 600 && !claimed.idle(); f++) claimed.work(clock + f / 60);
    same(last!.owner, `match ${generation}'s end`);
    // the lobby between: no sea, all open (once taken, over some frames)
    frame(undefined);
    for (let f = 0; f < 600 && !claimed.idle(); f++) frame(undefined);
    same(new Uint8Array(CELLS), 'the lobby');
  }
  assert.deepEqual([...kinds].sort(), ['claim', 'cut', 'drain', 'home']);
  // whole for each match's first frame and each lobby's, and again after frames missed
  assert.ok(whole > 4, `taken whole ${whole} times`);
  assert.ok(checked > 100);
  // what it costs: a few hundredths of a millisecond a frame (no frame over a few: the next test); a whole copy (some
  // tens of milliseconds: a match's first frame paid them all once, a hitch as she put to sea) a few a frame too
  assert.ok(spent / frames < 0.5 && loads < 8, `${(spent / frames).toFixed(3)} ms a frame, a whole copy's frame ${loads.toFixed(1)} ms`);
});

test('a loop round half the planet is drawn over some frames, none paying more than a few milliseconds', () => {
  // her loop just short of a great circle, closed in one step at its end
  const pole: Vec3 = [0, 0, 1], theta = Math.PI / 2 - 0.01, e1: Vec3 = [1, 0, 0], e2: Vec3 = [0, 1, 0];
  const steps = Math.ceil((1.02 * 2 * Math.PI * R * Math.sin(theta)) / 0.4);
  const path = Array.from({ length: steps + 1 }, (_, k) => {
    const phi = (k / steps) * 1.02 * 2 * Math.PI;
    return normalize(add(scale(pole, Math.cos(theta)), add(scale(e1, Math.cos(phi)), e2, Math.sin(phi)), Math.sin(theta)));
  });
  const t = createTerritory(1);
  t.begin([path[0]], 0);
  let time = 0;
  for (let k = 1; k < path.length && !t.changes().some((c) => c.kind === 'claim'); k++) t.step([{ id: 0, from: path[k - 1], to: path[k] }], (time = k / 30), WHOLE);
  assert.ok(t.share(0) > 0.45, `she holds ${t.share(0)}`);
  // the sea the step before (the loop's water open), and after
  const after = seaOf(t, 1), loop = after.changes.at(-1)!, owner = Uint8Array.from(t.owner);
  if (loop.kind !== 'claim') return assert.fail(loop.kind);
  for (let k = 0; k < loop.cells.length; k++) owner[loop.cells[k]] = 0;
  const before: Sea = { ...after, owner, seq: loop.seq - 1, changes: [] };
  // the best of five (the other tests running beside can stall a frame)
  let best = Infinity, count = 0;
  for (let run = 0; run < 5; run++) {
    const claimed = createClaimed(), frames: number[] = [];
    claimed.follow(before);
    claimed.follow(after);
    for (let f = 0; f < 600 && !claimed.idle(); f++) {
      const t0 = performance.now();
      claimed.work(time + f / 60);
      frames.push(performance.now() - t0);
    }
    for (let c = 0; c < CELLS; c++) if (claimed.ownerOf(c) !== t.owner[c]) assert.fail(`cell ${c} is ${claimed.ownerOf(c)}, the sea's ${t.owner[c]}`);
    assert.ok(claimed.idle() && frames.length > 3, `${frames.length} frames`);
    [best, count] = [Math.min(best, Math.max(...frames)), frames.length];
  }
  assert.ok(best < 8, `the worst frame ${best.toFixed(1)} ms, over ${count}`);
});

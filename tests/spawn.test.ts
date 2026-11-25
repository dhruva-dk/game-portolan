import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SHIP } from '../src/sim/handling.ts';
import { SETUP, createMatch } from '../src/sim/engine.ts';
import {
  SPAWN,
  berthing,
  assigned,
  berths,
  byStanding,
  pathOf,
  type Spawn,
} from '../src/sim/spawn.ts';
import { shipAt } from '../src/sim/ship.ts';
import { watersAt } from '../src/sim/waters.ts';
import { setupOf } from './setups.ts';
import { landOf, planetOf } from '../src/world/land.ts';
import { SEED } from '../src/world/environment.ts';
import { R, along, distance, dot, length } from '../src/world/sphere.ts';

function closest(spawns: readonly Spawn[]): number {
  let least = Infinity;
  for (let i = 0; i < spawns.length; i++) {
    for (let j = i + 1; j < spawns.length; j++)
      least = Math.min(least, distance(spawns[i].at, spawns[j].at));
  }
  return least;
}

const planet = planetOf(SEED, landOf(SEED));
const depth = (p: readonly [number, number, number]) => -planet.height(p);
const water = berthing(depth);

test("a match's berths are its seed's alone: the same seed the same berths, to the bit; another seed others", () => {
  const a = berths(water, 1234, SETUP.most, depth),
    b = berths(berthing(depth), 1234, SETUP.most, depth),
    c = berths(water, 1235, SETUP.most, depth);
  assert.deepEqual(a, b);
  assert.notDeepEqual(
    a.map((s) => s.at),
    c.map((s) => s.at)
  );
  assert.equal(a.length, SETUP.most);
});

test('every ship starts afloat in open water, clear of land all round, heading a tangent with open water ahead', () => {
  for (const seed of [1, 2, 3]) {
    for (const s of berths(water, seed, SETUP.most, depth)) {
      assert.ok(
        Math.abs(length(s.at) - 1) < 1e-9 &&
          Math.abs(length(s.heading) - 1) < 1e-9 &&
          Math.abs(dot(s.at, s.heading)) < 1e-9
      );
      assert.ok(
        depth(s.at) >= SHIP.draft + SPAWN.depth,
        `${depth(s.at)} m under it`
      );
      for (let k = 0; k < 24; k++) {
        const t = along(s.at, s.heading, 1).t,
          b = (2 * Math.PI * k) / 24;
        const round = [Math.cos(b), Math.sin(b)] as const,
          port = [
            s.at[1] * t[2] - s.at[2] * t[1],
            s.at[2] * t[0] - s.at[0] * t[2],
            s.at[0] * t[1] - s.at[1] * t[0],
          ] as const;
        const dir = [
          t[0] * round[0] + port[0] * round[1],
          t[1] * round[0] + port[1] * round[1],
          t[2] * round[0] + port[2] * round[1],
        ] as const;
        assert.ok(
          depth(along(s.at, dir, SPAWN.clear).p) >= SHIP.draft,
          'land within its clearance'
        );
      }
      for (let d = 8; d <= 40; d += 8)
        assert.ok(
          depth(along(s.at, s.heading, d).p) >= SHIP.draft + SPAWN.depth,
          `shoal ${d} m ahead`
        );
    }
  }
});

test("the berths spread over all the open water: no two within a few ships' lengths, the nearest pair far apart", () => {
  const open =
    water.points.length /
    Math.round((4 * Math.PI * R * R) / SPAWN.lattice ** 2);
  for (const n of [20, 50, SETUP.most, 100]) {
    const least = closest(berths(water, 7, n, depth)),
      even = Math.sqrt((2 * 4 * Math.PI * R * R * open) / (Math.sqrt(3) * n));
    console.log(
      `# ${n} ships: ${least.toFixed(0)} m apart at least, of an even ${even.toFixed(0)}`
    );
    assert.ok(
      least > 2.5 * SHIP.length,
      `${n} ships: two only ${least.toFixed(0)} m apart`
    );
    assert.ok(
      least > 0.9 * even,
      `${n} ships ${least.toFixed(0)} m apart at least, of an even ${even.toFixed(0)}`
    );
  }
});

test('each match is berthed ahead of its start (off the main thread in the game), so PLAY does not work its berths out', () => {
  const waters = watersAt(planet),
    setup = setupOf(SEED),
    count = setup.ships.length;
  const at = (berthed?: { match: number; spawns: readonly Spawn[] }) =>
    createMatch(setup, { ...waters, berthed })
      .view.vessels()
      .map((v) => v.ship.at);
  const own = berths(water, SEED, count, depth),
    other = berths(water, SEED + 1, count, depth);
  const placed = (spawns: readonly Spawn[]) =>
    assigned(spawns, SEED, setup.ships).map((b) => shipAt(b.at, b.heading).at);
  assert.deepEqual(at(), placed(own), 'worked out at the start without them');
  assert.deepEqual(
    at({ match: SEED, spawns: other }),
    placed(other),
    'the berths handed it are the ones it takes'
  );
  assert.deepEqual(
    at({ match: SEED + 1, spawns: other }),
    placed(own),
    "another match's are not"
  );
});

const SEEDS = [3, 17, 4242];

const shuffledStandings = (seed: number): number[] => {
  const s = Array.from({ length: SETUP.most / 2 }, (_, t) => t + 1);
  let x = seed;
  for (let i = s.length - 1; i > 0; i--) {
    x = (x * 1103515245 + 12345) % 2147483648;
    const j = x % (i + 1);
    [s[i], s[j]] = [s[j], s[i]];
  }
  return s;
};

function started(seed: number) {
  const setup = setupOf(seed, { standings: shuffledStandings(seed) }),
    m = createMatch(setup, watersAt(planet)),
    at = m.view.vessels().map((v) => v.ship.at),
    path = pathOf(berths(water, seed, setup.ships.length, depth), seed).map(
      (b) => shipAt(b.at, b.heading).at
    );
  const onPath = at.map((p) => path.findIndex((q) => distance(p, q) < 1e-9));
  return { setup, at, path, onPath };
}

test('berths go by standing: each ship its own; a team two in a row along the path, slot 0 first; the best team at its start', () => {
  for (const seed of SEEDS) {
    const { setup, onPath } = started(seed);
    assert.ok(
      onPath.every((k) => k >= 0),
      'every ship on a berth'
    );
    assert.equal(new Set(onPath).size, setup.ships.length, 'no two share one');
    const teams = setup.ships.length / 2;
    for (let t = 0; t < teams; t++) {
      const [a, b] = [2 * t, 2 * t + 1];
      assert.equal(setup.ships[a].slot, 0);
      assert.equal(onPath[b], onPath[a] + 1, `team ${t}: in a row`);
      assert.equal(
        onPath[a],
        2 * (setup.ships[a].standing - 1),
        `team ${t}: in the order of standing`
      );
    }
  }
});

test('teams close in standing start nearer each other than teams far apart in it', () => {
  const near: number[] = [],
    far: number[] = [];
  for (const seed of SEEDS) {
    const { setup, at } = started(seed);
    const lead = new Map<number, number>();
    setup.ships.forEach((s, id) => {
      if (s.slot === 0) lead.set(s.standing, id);
    });
    for (const [a, i] of lead)
      for (const [b, j] of lead) {
        if (b <= a) continue;
        const d = distance(at[i], at[j]);
        if (b - a === 1) near.push(d);
        if (b - a >= 20) far.push(d);
      }
  }
  const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
  assert.ok(
    mean(near) < mean(far),
    `${mean(near).toFixed(3)} against ${mean(far).toFixed(3)}`
  );
});

test("a match's seed fixes its path: the same seed the same berths for every ship, another seed starts the path elsewhere", () => {
  const a = started(SEEDS[0]);
  assert.deepEqual(started(SEEDS[0]).at, a.at);
  const spawns = berths(water, SEEDS[0], SETUP.most, depth);
  const starts = new Set(
    [1, 2, 3, 4, 5, 6].map((seed) => pathOf(spawns, seed)[0].at.join())
  );
  assert.ok(starts.size > 1, 'the path starts where the seed says');
  assert.deepEqual(
    [...pathOf(spawns, 1)].sort((x, y) => x.at[0] - y.at[0]),
    [...spawns].sort((x, y) => x.at[0] - y.at[0]),
    'every berth on the path once'
  );
  assert.deepEqual(
    byStanding([
      { team: 1, slot: 1, standing: 4 },
      { team: 0, slot: 0, standing: 9 },
      { team: 1, slot: 0, standing: 4 },
      { team: 0, slot: 1, standing: 9 },
    ]),
    [2, 0, 1, 3]
  );
});

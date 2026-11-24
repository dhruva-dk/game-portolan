import { test } from 'node:test';
import { nature } from '../src/sim/persona.ts';
import assert from 'node:assert/strict';
import { mind, think, type Memory } from '../src/sim/bot.ts';
import { ROAMING } from '../src/sim/roaming.ts';
import { afloat, stepFleet, type Vessel } from '../src/sim/contact.ts';
import { STEP } from '../src/sim/fixed.ts';
import { SHIP } from '../src/sim/handling.ts';
import {
  ROUTE,
  cellCentre,
  chart,
  course,
  findPath,
  openAt,
  type Chart,
} from '../src/sim/route.ts';
import { clearance, type Depth } from '../src/sim/shoal.ts';
import { shipAt } from '../src/sim/ship.ts';
import { landOf, planetOf } from '../src/world/land.ts';
import { SEED } from '../src/environment.ts';
import {
  add,
  along,
  bearingAt,
  distance,
  frameAt,
  fromLatLon,
  normalize,
  scale,
  type Vec3,
} from '../src/world/sphere.ts';
import { random } from '../src/world/random.ts';

const start = fromLatLon(0.2, 0.3);
const { east, north } = frameAt(start);
const at = (x: number, y: number): Vec3 =>
  along(
    start,
    add(
      scale(east, x / Math.hypot(x, y) || 0),
      north,
      y / Math.hypot(x, y) || 0
    ),
    Math.hypot(x, y)
  ).p;

const island = (c: Vec3, r: number) => (p: Vec3) => (distance(p, c) - r) / 3;
const sea =
  (...parts: ((p: Vec3) => number)[]): Depth =>
  (p) =>
    Math.min(30, ...parts.map((f) => f(p)));

const length = (cells: readonly number[]) =>
  cells
    .slice(1)
    .reduce((s, c, i) => s + distance(cellCentre(cells[i]), cellCentre(c)), 0);
const allOpen = (ch: Chart, cells: readonly number[]) =>
  cells.every((c) => ch.open[c] === 1);
const stepsOpen = (ch: Chart, cells: readonly number[]) =>
  cells.slice(1).every((c, i) => {
    const a = cellCentre(cells[i]),
      b = cellCentre(c);
    return distance(a, b) < 12 && openAt(ch, normalize(add(a, b)));
  });

const round = sea(island(start, 70));
const roundChart = chart(round);

test('a route is found round a round island, all open water, not much longer than the way round', () => {
  const a = at(-110, 0),
    b = at(110, 0);
  const r = findPath(roundChart, a, b);
  assert.ok(
    r.found && allOpen(roundChart, r.cells) && stepsOpen(roundChart, r.cells)
  );
  const rc = 77.5,
    tangent = Math.sqrt(110 * 110 - rc * rc),
    arc = rc * (Math.PI - 2 * Math.acos(rc / 110));
  const least = 2 * tangent + arc,
    got = length(r.cells);
  console.log(
    `# round the island: ${got.toFixed(0)} m by the route, ${least.toFixed(0)} m at the least`
  );
  assert.ok(got < 1.15 * least, `${got} m`);
  assert.ok(
    Math.min(...r.cells.map((c) => distance(cellCentre(c), start))) > 77.5
  );
});

test('ships in open water wanting a route in one step look for it over the next few, not all in that step', () => {
  const ships = Array.from({ length: 20 }, (_, i) => at(-130, -95 + 10 * i)),
    mark = at(130, 0);
  const routes = ships.map(() => null as ReturnType<typeof course>['route']);
  const looked: number[] = [];
  for (let step = 0; step < ROUTE.spread; step++) {
    let n = 0;
    ships.forEach((p, i) => {
      const had = routes[i]?.cells.length ?? 0;
      routes[i] = course(roundChart, p, mark, routes[i], STEP).route;
      if (had === 0 && (routes[i]?.cells.length ?? 0) > 0) n++;
    });
    looked.push(n);
  }
  console.log(`# ships finding their route, step by step: ${looked}`);
  assert.ok(routes.every((r) => r && r.cells.length > 0 && r.found));
  assert.ok(Math.max(...looked) <= ships.length / 2, `${looked}`);
});

test('a route goes through a strait rather than round', () => {
  const depth = sea(island(at(-100, 0), 70), island(at(100, 0), 70)),
    ch = chart(depth);
  const r = findPath(ch, at(0, -120), at(0, 120));
  assert.ok(r.found && allOpen(ch, r.cells) && stepsOpen(ch, r.cells));
  const through = Math.min(
    ...r.cells.map((c) => distance(cellCentre(c), start))
  );
  console.log(
    `# through the strait: ${length(r.cells).toFixed(0)} m, ${through.toFixed(1)} m off its middle at the nearest`
  );
  assert.ok(through < 10 && length(r.cells) < 1.2 * 240);
});

test('no route into enclosed water: the route runs to the nearest it can reach', () => {
  const depth = sea((p) => (Math.abs(distance(p, start) - 75) - 15) / 3),
    ch = chart(depth);
  assert.ok(openAt(ch, start));
  const r = findPath(ch, at(0, -200), start);
  assert.equal(r.found, false);
  assert.ok(allOpen(ch, r.cells));
  const end = cellCentre(r.cells.at(-1)!);
  assert.ok(
    distance(end, start) > 90 && distance(end, start) < 110,
    `${distance(end, start)} m`
  );
  assert.equal(findPath(ch, start, at(0, -200)).found, false);
});

function voyage(
  depth: Depth,
  ch: Chart | null,
  from: Vessel,
  mark: Vec3,
  seed: number,
  most = 90
) {
  let fleet = [from],
    m: Memory = mind(seed, from.ship.at),
    least = Infinity;
  for (let n = 1; n <= most / STEP; n++) {
    m = { ...m, goal: mark, since: 0 };
    const r = think(fleet[0], [], { depth, chart: ch }, m, nature(seed));
    m = r.memory;
    fleet = stepFleet(fleet, [r.helm], STEP, depth).fleet;
    least = Math.min(
      least,
      clearance(fleet[0].ship.at, fleet[0].ship.heading, depth).least
    );
    if (distance(fleet[0].ship.at, mark) < ROAMING.arrive)
      return { seconds: n * STEP, least, memory: m };
  }
  return { seconds: Infinity, least, memory: m };
}

test('a bot reaches a mark behind an island in near the least time, which without routes it takes far longer to', () => {
  const mark = at(130, 0),
    rc = 77.5;
  for (const y of [-25, 0, 25]) {
    const from = at(-130, y),
      ship = afloat(1, shipAt(from, east)),
      d = Math.hypot(130, y);
    const tangent = Math.sqrt(d * d - rc * rc),
      arc = rc * (Math.PI - Math.acos(rc / d) - Math.acos(rc / 130));
    const least =
      (tangent + arc + Math.sqrt(130 * 130 - rc * rc) - ROAMING.arrive) /
      SHIP.top;
    const routed = voyage(round, roundChart, ship, mark, 3),
      felt = voyage(round, null, ship, mark, 3);
    console.log(
      `# behind the island from ${y} m: ${routed.seconds.toFixed(1)} s by routes, ${felt.seconds.toFixed(1)} s feeling its way,` +
        ` ${least.toFixed(1)} s at top speed all the way`
    );
    assert.ok(routed.least >= 0);
    assert.ok(routed.seconds < 1.3 * least + 4, `${y}: ${routed.seconds} s`);
    assert.ok(
      felt.seconds > 1.2 * routed.seconds,
      `${y}: ${felt.seconds} s without`
    );
  }
  const bay = at(0, 0),
    mouth = at(-75, 0);
  const depth: Depth = (p) =>
    Math.min(
      30,
      Math.max(
        (Math.abs(distance(p, bay) - 75) - 15) / 3,
        (45 - distance(p, mouth)) / 3
      )
    );
  const ch = chart(depth),
    ship = afloat(1, shipAt(at(-160, 0), east));
  const routed = voyage(depth, ch, ship, at(160, 0), 3),
    felt = voyage(depth, null, ship, at(160, 0), 3);
  console.log(
    `# behind a bay: ${routed.seconds.toFixed(1)} s by routes, ${felt.seconds.toFixed(1)} s feeling its way`
  );
  assert.ok(
    routed.least >= 0 &&
      routed.seconds < 40 &&
      felt.seconds > 2 * routed.seconds
  );
});

test('routed bots sail the same voyage from the same places, to the bit', () => {
  const run = () =>
    [1, 2].map((seed) =>
      voyage(
        round,
        roundChart,
        afloat(1, shipAt(at(-130, 10 * seed), east)),
        at(130, 0),
        seed
      )
    );
  assert.deepEqual(run(), run());
});

test('on the real planet: the chart, a route and 16 routed bots, timed', () => {
  const planet = planetOf(SEED, landOf(SEED)),
    depth: Depth = (p) => -planet.height(p);
  let t = performance.now();
  const ch = chart(depth);
  const bake = performance.now() - t,
    open = ch.open.reduce((s, o) => s + o, 0);
  const rand = random(17),
    pairs: { p: Vec3; q: Vec3; d: number }[] = [];
  while (pairs.length < 300) {
    const z = 2 * rand() - 1,
      a = 2 * Math.PI * rand(),
      s = Math.sqrt(1 - z * z),
      p: Vec3 = [s * Math.cos(a), z, s * Math.sin(a)];
    const bearing = 2 * Math.PI * rand(),
      d = 150 + 250 * rand();
    const q = along(p, bearingAt(p, bearing), d).p,
      n = Math.ceil(d / 6);
    const line = Array.from({ length: n }, (_, k) =>
      normalize(add(scale(p, 1 - k / n), q, k / n))
    );
    if (openAt(ch, p) && openAt(ch, q) && !line.every((x) => openAt(ch, x)))
      pairs.push({ p, q, d });
  }
  const across = pairs.filter((r) => r.d < 250).slice(0, 24);
  findPath(ch, across[0].p, across[0].q);
  const times: number[] = [];
  let found = 0;
  for (const { p: a, q: b } of across) {
    let best = Infinity;
    const r = Array.from({ length: 5 }, () => {
      t = performance.now();
      const found = findPath(ch, a, b);
      best = Math.min(best, performance.now() - t);
      return found;
    })[0];
    times.push(best);
    found += +r.found;
    assert.ok(distance(cellCentre(r.cells.at(-1)!), b) < distance(a, b));
    assert.ok(stepsOpen(ch, r.cells));
  }
  const mean = times.reduce((s, x) => s + x, 0) / times.length;
  console.log(
    `# chart: ${bake.toFixed(0)} ms to bake, ${open} cells of ${ch.open.length} open; a route across the land ` +
      `${mean.toFixed(2)} ms (the most ${Math.max(...times).toFixed(2)}), ${found} of ${across.length} found`
  );
  assert.ok(across.length === 24 && found >= 20);

  const tally = { near: [0, 0], far: [0, 0] };
  for (const { p, q, d } of pairs) {
    const wide = findPath(ch, p, q, ROUTE.work * 4);
    if (!wide.found || length(wide.cells) > 1.5 * d) continue;
    const t = d < 250 ? tally.near : tally.far;
    t[0]++;
    t[1] += +findPath(ch, p, q).found;
  }
  console.log(
    `# blocked routes with a short way round found: ${tally.near[1]} of ${tally.near[0]} 150–250 m off, ` +
      `${tally.far[1]} of ${tally.far[0]} 250–400 m off`
  );
  assert.ok(
    tally.near[1] >= 0.95 * tally.near[0] && tally.far[1] >= 0.8 * tally.far[0]
  );

  const home = planet.start.at;
  const ring = (bearing: number, metres: number) =>
    along(home, bearingAt(home, bearing), metres).p;
  const berthed: Vessel[] = [];
  for (let k = 0; berthed.length < 16; k++) {
    const p = ring(k * 0.7, 20 + 6 * k);
    if (openAt(ch, p) && depth(p) > 6)
      berthed.push(afloat(berthed.length, shipAt(p, frameAt(p).east)));
  }
  const steps = 20 / STEP,
    thinking = new Array<number>(steps).fill(Infinity),
    whole = thinking.slice();
  let fleet = berthed;
  for (let run = 0; run < 2; run++) {
    fleet = berthed;
    const minds = fleet.map((v) => mind(v.id + 1, v.ship.at));
    for (let n = 0; n < steps; n++) {
      const t0 = performance.now();
      const helms = fleet.map((v, i) => {
        const r = think(
          v,
          fleet.filter((o) => o.id !== v.id),
          { depth, chart: ch },
          minds[i],
          nature(v.id + 1)
        );
        minds[i] = r.memory;
        return r.helm;
      });
      const t1 = performance.now();
      fleet = stepFleet(fleet, helms, STEP, depth).fleet;
      thinking[n] = Math.min(thinking[n], t1 - t0);
      whole[n] = Math.min(whole[n], performance.now() - t0);
    }
  }
  const botMs = thinking.reduce((s, x) => s + x, 0),
    all = whole.reduce((s, x) => s + x, 0);
  console.log(
    `# 16 routed bots on the planet: ${(botMs / steps).toFixed(3)} ms a step thinking` +
      ` (the most ${Math.max(...thinking).toFixed(2)}), ${(all / steps).toFixed(3)} ms with the fleet`
  );
  assert.ok(botMs / steps < 1);
  for (const v of fleet)
    assert.ok(clearance(v.ship.at, v.ship.heading, depth).least >= 0);
});

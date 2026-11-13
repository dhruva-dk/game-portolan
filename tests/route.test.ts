import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BOT, mind, think, type Memory } from '../src/sim/bot.ts';
import { afloat, stepFleet, type Vessel } from '../src/sim/contact.ts';
import { STEP } from '../src/sim/fixed.ts';
import { SHIP } from '../src/sim/handling.ts';
import { cellCentre, chart, findPath, openAt, type Chart } from '../src/sim/route.ts';
import { clearance, type Depth } from '../src/sim/shoal.ts';
import { shipAt } from '../src/sim/ship.ts';
import { createPlanet, SEED } from '../src/world/planet.ts';
import { add, along, distance, frameAt, fromLatLon, normalize, scale, type Vec3 } from '../src/world/sphere.ts';
import { random } from '../src/world/random.ts';

const deg = Math.PI / 180;
const start = fromLatLon(0.2, 0.3);
const { east, north } = frameAt(start);
const at = (x: number, y: number): Vec3 => along(start, add(scale(east, x / Math.hypot(x, y) || 0), north, y / Math.hypot(x, y) || 0), Math.hypot(x, y)).p;

/** A round island `r` m across its dry land at c, its floor rising 1 in 3, in water 30 m deep. */
const island = (c: Vec3, r: number) => (p: Vec3) => (distance(p, c) - r) / 3;
const sea = (...parts: ((p: Vec3) => number)[]): Depth => (p) => Math.min(30, ...parts.map((f) => f(p)));

const length = (cells: readonly number[]) => cells.slice(1).reduce((s, c, i) => s + distance(cellCentre(cells[i]), cellCentre(c)), 0);
const allOpen = (ch: Chart, cells: readonly number[]) => cells.every((c) => ch.open[c] === 1);
/** Every step of a route is to a cell beside the last (a diagonal at most, ~9.6 m), over open water all the way: the
 *  middle of each step, a diagonal's corner, lies in an open cell. */
const stepsOpen = (ch: Chart, cells: readonly number[]) => cells.slice(1).every((c, i) => {
  const a = cellCentre(cells[i]), b = cellCentre(c);
  return distance(a, b) < 12 && openAt(ch, normalize(add(a, b)));
});

const round = sea(island(start, 70));
const roundChart = chart(round);

test('a route is found round a round island, all open water, not much longer than the way round', () => {
  const a = at(-110, 0), b = at(110, 0);
  const r = findPath(roundChart, a, b);
  assert.ok(r.found && allOpen(roundChart, r.cells) && stepsOpen(roundChart, r.cells));
  // the shortest way round keeps off the draught's contour (77.5 m): straight to its tangent, round, and out
  const rc = 77.5, tangent = Math.sqrt(110 * 110 - rc * rc), arc = rc * (Math.PI - 2 * Math.acos(rc / 110));
  const least = 2 * tangent + arc, got = length(r.cells);
  console.log(`# round the island: ${got.toFixed(0)} m by the route, ${least.toFixed(0)} m at the least`);
  // (a route of cells, each to one of the eight round it, runs up to 1.08 times as far as a straight line, 0117's of
  // four up to √2; the helm cuts its corners, looking along it as far as the water is clear)
  assert.ok(got < 1.15 * least, `${got} m`);
  assert.ok(Math.min(...r.cells.map((c) => distance(cellCentre(c), start))) > 77.5);
});

test('a route goes through a strait rather than round', () => {
  // two islands 140 m across, their dry land 60 m apart (about 45 m of open water between their draught contours)
  const depth = sea(island(at(-100, 0), 70), island(at(100, 0), 70)), ch = chart(depth);
  const r = findPath(ch, at(0, -120), at(0, 120));
  assert.ok(r.found && allOpen(ch, r.cells) && stepsOpen(ch, r.cells));
  const through = Math.min(...r.cells.map((c) => distance(cellCentre(c), start)));
  console.log(`# through the strait: ${length(r.cells).toFixed(0)} m, ${through.toFixed(1)} m off its middle at the nearest`);
  assert.ok(through < 10 && length(r.cells) < 1.2 * 240);
});

test('no route into enclosed water: the route runs to the nearest it can reach', () => {
  // a ring of land 60–90 m from the start round a lagoon 20 m deep
  const depth = sea((p) => (Math.abs(distance(p, start) - 75) - 15) / 3), ch = chart(depth);
  assert.ok(openAt(ch, start));
  const r = findPath(ch, at(0, -200), start);
  assert.equal(r.found, false);
  assert.ok(allOpen(ch, r.cells));
  const end = cellCentre(r.cells.at(-1)!);
  assert.ok(distance(end, start) > 90 && distance(end, start) < 110, `${distance(end, start)} m`);
  // and none out of it either
  assert.equal(findPath(ch, start, at(0, -200)).found, false);
});

/** A bot told to make for `mark` (a roaming mark, held), sailed until she is there; the seconds it took, and her least
 *  water under her. */
function voyage(depth: Depth, ch: Chart | null, from: Vessel, mark: Vec3, seed: number, most = 90) {
  let fleet = [from], m: Memory = mind(seed, from.ship.at), least = Infinity;
  for (let n = 1; n <= most / STEP; n++) {
    m = { ...m, goal: mark, since: 0 };
    const r = think(fleet[0], [], { depth, chart: ch }, m, seed);
    m = r.memory;
    fleet = stepFleet(fleet, [r.helm], STEP, depth).fleet;
    least = Math.min(least, clearance(fleet[0].ship.at, fleet[0].ship.heading, depth).least);
    if (distance(fleet[0].ship.at, mark) < BOT.arrive) return { seconds: n * STEP, least, memory: m };
  }
  return { seconds: Infinity, least, memory: m };
}

test('a bot reaches a mark behind an island in near the least time, which without routes she takes far longer to', () => {
  const mark = at(130, 0), rc = 77.5;
  for (const y of [-25, 0, 25]) {
    const from = at(-130, y), ship = afloat(1, shipAt(from, east)), d = Math.hypot(130, y);
    const tangent = Math.sqrt(d * d - rc * rc), arc = rc * (Math.PI - Math.acos(rc / d) - Math.acos(rc / 130));
    const least = (tangent + arc + Math.sqrt(130 * 130 - rc * rc) - BOT.arrive) / SHIP.top;
    const routed = voyage(round, roundChart, ship, mark, 3), felt = voyage(round, null, ship, mark, 3);
    console.log(`# behind the island from ${y} m: ${routed.seconds.toFixed(1)} s by routes, ${felt.seconds.toFixed(1)} s feeling her way, ${least.toFixed(1)} s at top speed all the way`);
    assert.ok(routed.least >= 0);
    assert.ok(routed.seconds < 1.3 * least + 4, `${y}: ${routed.seconds} s`);
    assert.ok(felt.seconds > 1.2 * routed.seconds, `${y}: ${felt.seconds} s without`);
  }
  // and behind a bay opening toward her, which feeling her way along the shore leads her into
  const bay = at(0, 0), mouth = at(-75, 0);
  const depth: Depth = (p) => Math.min(30, Math.max((Math.abs(distance(p, bay) - 75) - 15) / 3, (45 - distance(p, mouth)) / 3));
  const ch = chart(depth), ship = afloat(1, shipAt(at(-160, 0), east));
  const routed = voyage(depth, ch, ship, at(160, 0), 3), felt = voyage(depth, null, ship, at(160, 0), 3);
  console.log(`# behind a bay: ${routed.seconds.toFixed(1)} s by routes, ${felt.seconds.toFixed(1)} s feeling her way`);
  // (should her route give out at ROUTE.work cells, short of the way round, she follows it on until her next, 2 s on,
  // finds the whole way)
  assert.ok(routed.least >= 0 && routed.seconds < 40 && felt.seconds > 2 * routed.seconds);
});

test('routed bots sail the same voyage from the same places, to the bit', () => {
  const run = () => [1, 2].map((seed) => voyage(round, roundChart, afloat(1, shipAt(at(-130, 10 * seed), east)), at(130, 0), seed));
  assert.deepEqual(run(), run());
});

test('on the real planet: the chart, a route and 16 routed bots, timed', () => {
  const planet = createPlanet(SEED), depth: Depth = (p) => -planet.height(p);
  let t = performance.now();
  const ch = chart(depth);
  const bake = performance.now() - t, open = ch.open.reduce((s, o) => s + o, 0);
  // round the largest island (its coast `out` metres from its middle, give or take; the rings below were for 69 m)
  const largest = planet.islands[0], isle = largest.chart.at, f = frameAt(isle), out = largest.radius / 69;
  const ring = (bearing: number, metres: number) => along(isle, add(scale(f.north, Math.cos(bearing)), f.east, Math.sin(bearing)), metres).p;
  // across the island from all round it (the first warms the code)
  findPath(ch, ring(0, 150 * out), ring(Math.PI, 150 * out));
  const times: number[] = [];
  let found = 0;
  for (let k = 0; k < 24; k++) {
    const a = ring(k * 0.26, (120 + 4 * k) * out), b = ring(k * 0.26 + Math.PI, 160 * out);
    // timed as the best of three: the search's own cost, not whatever else the machine is doing (the suite runs its
    // files side by side); a search that does more work is slower every time
    let best = Infinity;
    const r = Array.from({ length: 3 }, () => {
      t = performance.now();
      const found = findPath(ch, a, b);
      best = Math.min(best, performance.now() - t);
      return found;
    })[0];
    times.push(best);
    found += +r.found;
    // given out short of the way, a route still runs nearer (the next, from further on, goes on)
    assert.ok(distance(cellCentre(r.cells.at(-1)!), b) < distance(a, b));
    assert.ok(stepsOpen(ch, r.cells));
  }
  const mean = times.reduce((s, x) => s + x, 0) / times.length;
  console.log(`# chart: ${bake.toFixed(0)} ms to bake, ${open} cells of ${ch.open.length} open; a route across the island ${mean.toFixed(2)} ms (the most ${Math.max(...times).toFixed(2)}), ${found} of 24 found`);
  assert.ok(found >= 20 && mean < 2);

  // open water to open water 150–400 m off, with land between, all over the planet: found within ROUTE.work cells
  // (0117's four neighbours a cell found 91% of those 150–250 m off and 50% of those 250–400 m)
  const rand = random(17), tally = { near: [0, 0], far: [0, 0] };
  while (tally.near[0] + tally.far[0] < 300) {
    const z = 2 * rand() - 1, a = 2 * Math.PI * rand(), s = Math.sqrt(1 - z * z), p: Vec3 = [s * Math.cos(a), z, s * Math.sin(a)];
    const g = frameAt(p), bearing = 2 * Math.PI * rand(), d = 150 + 250 * rand();
    const q = along(p, add(scale(g.north, Math.cos(bearing)), g.east, Math.sin(bearing)), d).p;
    if (!openAt(ch, p) || !openAt(ch, q) || Array.from({ length: Math.ceil(d / 6) }, (_, k) => normalize(add(scale(p, 1 - k / Math.ceil(d / 6)), q, k / Math.ceil(d / 6)))).every((x) => openAt(ch, x))) continue;
    const t = d < 250 ? tally.near : tally.far;
    t[0]++;
    t[1] += +findPath(ch, p, q).found;
  }
  console.log(`# blocked routes found: ${tally.near[1]} of ${tally.near[0]} 150–250 m off, ${tally.far[1]} of ${tally.far[0]} 250–400 m off`);
  assert.ok(tally.near[1] >= 0.9 * tally.near[0] && tally.far[1] >= 0.85 * tally.far[0]);

  // 16 bots round the island for 20 s
  let fleet: Vessel[] = [];
  for (let k = 0; fleet.length < 16; k++) {
    const p = ring(k * 0.7, (110 + 9 * k) * out);
    if (openAt(ch, p) && depth(p) > 6) fleet.push(afloat(fleet.length, shipAt(p, frameAt(p).east)));
  }
  const minds = fleet.map((v) => mind(v.id + 1, v.ship.at));
  let botMs = 0, worst = 0, all = 0;
  const steps = 20 / STEP;
  for (let n = 0; n < steps; n++) {
    const t0 = performance.now();
    const helms = fleet.map((v, i) => {
      const r = think(v, fleet.filter((o) => o.id !== v.id), { depth, chart: ch }, minds[i], v.id + 1);
      minds[i] = r.memory;
      return r.helm;
    });
    const t1 = performance.now();
    fleet = stepFleet(fleet, helms, STEP, depth).fleet;
    botMs += t1 - t0;
    worst = Math.max(worst, t1 - t0);
    all += performance.now() - t0;
  }
  console.log(`# 16 routed bots on the planet: ${(botMs / steps).toFixed(3)} ms a step thinking (the most ${worst.toFixed(2)}), ${(all / steps).toFixed(3)} ms with the fleet`);
  assert.ok(botMs / steps < 1);
  for (const v of fleet) assert.ok(clearance(v.ship.at, v.ship.heading, depth).least >= 0);
});

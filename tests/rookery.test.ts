// The rookery's ground (world/rookery.ts): a campus planet of a crew's seed has one main island and three to eight
// islets; its nine plots and the quay ring the main island without meeting, each on its own terrace on land (the
// water's at the waterline), facing the sea; the quay's berths lie in water deep enough for a ship; all of it the same
// for a seed every time, and a race's planet is untouched.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPlanet } from '../src/world/planet.ts';
import { BUILDINGS, FOOTPRINT, QUAY, campusOf, type Building } from '../src/world/rookery.ts';
import { SHIP } from '../src/sim/handling.ts';
import { cross, distance, dot, fromChart } from '../src/world/sphere.ts';

const SEEDS = [1, 7, 42, 1234, 99991];
const planets = new Map(SEEDS.map((s) => [s, createPlanet(s, true)]));

test('a campus planet: one main island and three to eight islets, none of them near another', () => {
  for (const [seed, p] of planets) {
    const [main, ...rest] = p.islands;
    assert.equal(main.kind, 'island', `seed ${seed}`);
    assert.ok(rest.length >= 3 && rest.length <= 8, `seed ${seed}: ${rest.length} islets`);
    assert.ok(rest.every((s) => s.kind === 'islet'));
    assert.equal(main.offshore.length, 0, `seed ${seed}: an offshore rock where a pier may run`);
    for (const s of rest) assert.ok(distance(s.chart.at, main.chart.at) > main.shelf + s.shelf, `seed ${seed}: an islet on the main island's apron`);
  }
});

test('the plots and the quay ring the main island without meeting', () => {
  for (const [seed, p] of planets) {
    const site = p.islands[0];
    assert.equal(site.stands?.length, BUILDINGS.length + 1, `seed ${seed}`);
    const boxes = (site.stands ?? []).map((s) => {
      const f = s.stand === 'quay' ? { half: QUAY.half, back: QUAY.back, front: QUAY.front } : FOOTPRINT[s.stand as Building];
      const along = [-s.out[1], s.out[0]];
      return [[-f.half, -f.back], [f.half, -f.back], [f.half, f.front], [-f.half, f.front]]
        .map(([a, b]) => [s.x + along[0] * a + s.out[0] * b, s.z + along[1] * a + s.out[1] * b]);
    });
    // separating axes of two convex quadrilaterals
    const apart = (a: number[][], b: number[][]) => [a, b].some((q) => q.some((v, i) => {
      const w = q[(i + 1) % 4], n = [w[1] - v[1], v[0] - w[0]];
      const span = (r: number[][]) => r.map((c) => c[0] * n[0] + c[1] * n[1]);
      return Math.max(...span(a)) < Math.min(...span(b)) || Math.max(...span(b)) < Math.min(...span(a));
    }));
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) assert.ok(apart(boxes[i], boxes[j]), `seed ${seed}: plots ${i} and ${j} meet`);
  }
});

test('each plot stands on a terrace on land, facing the sea; the quay\'s berths lie in water she floats in', () => {
  for (const [seed, p] of planets) {
    const c = campusOf(p.islands);
    assert.deepEqual(c.plots.map((k) => k.building), [...BUILDINGS]);
    for (const k of c.plots) {
      // the ground levelled under it, a course under its plinth's top
      for (const [x, z] of [[0, 0], [k.half * 0.9, -k.back * 0.9], [-k.half * 0.9, k.water ? 0 : k.front * 0.9]]) {
        const h = p.height(fromChart(k.chart, x, z));
        assert.ok(Math.abs(h - (k.top - 0.25)) < 0.05, `seed ${seed} ${k.building}: ground ${h} under a terrace at ${k.top}`);
      }
      assert.ok(k.top > 0.5 && k.top >= k.low, `seed ${seed} ${k.building}: terrace ${k.top} over ${k.low}`);
      assert.ok(k.top - k.low < 10,`seed ${seed} ${k.building}: a terrace ${k.top - k.low} m high`);
      const seaward = cross(k.chart.axis, k.chart.at);
      const ahead = fromChart(k.chart, 0, k.front + 6), behind = fromChart(k.chart, 0, -k.back);
      assert.ok(p.height(ahead) < p.height(behind), `seed ${seed} ${k.building}: not facing the sea`);
      assert.ok(Math.abs(dot(seaward, k.chart.at)) < 1e-9);
    }
    for (const b of c.berths) assert.ok(-p.height(b.at) > SHIP.draught, `seed ${seed}: a berth ${-p.height(b.at)} m deep`);
  }
  const [seed, p] = [...planets][0];
  assert.deepEqual(campusOf(createPlanet(seed, true).islands), campusOf(p.islands), 'not the same campus for a seed');
});

test('a race planet is a race planet: its islands spread as before, none cleared', () => {
  const race = createPlanet(SEEDS[0]);
  assert.ok(race.islands.length > 20);
  assert.ok(race.islands.every((s) => s.clearings === undefined));
});

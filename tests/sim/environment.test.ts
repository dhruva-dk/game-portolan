// WP6 part A, the environment: one planetary wind shifting slowly through the match, gusts running downwind, the
// apparent wind a ship's sails and pennants show, and the lanes and the Great Current carrying ships.
//   node --test tests/sim/environment.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LOW_WATER, currentAt, gustAt, newWind, seaFor, seaLevel, windAt } from '../../src/sim/environment.ts';
import { idleInput } from '../../src/sim/input.ts';
import { PI, cross, dot, length, normalize, v3, type V3 } from '../../src/sim/math.ts';
import { step } from '../../src/sim/match.ts';
import { apparentWind } from '../../src/sim/sailing.ts';
import { R } from '../../src/sim/sphere.ts';
import { SAIL, TICK, createMatch, type MatchState } from '../../src/sim/state.ts';
import { FORMS, GREAT_CURRENT, GUSTS, WIND } from '../../src/sim/tables.ts';
import { TIDE } from '../../src/sim/world/regions.ts';
import { world } from './vectors.ts';

const SEED = 20261024;
const sea = seaFor(world(), SEED);

/** n points spread evenly over the planet. */
function spread(n: number): V3[] {
  return Array.from({ length: n }, (_, k) => {
    const z = 1 - (2 * k + 1) / n, r = Math.sqrt(1 - z * z), lon = k * 2.399963229728653;
    return v3(r * Math.cos(lon), r * Math.sin(lon), z);
  });
}

const angle = (a: V3, b: V3) => Math.acos(Math.max(-1, Math.min(1, dot(a, b) / (length(a) * length(b))))) * (180 / PI);

/** The base wind (no gust has spawned before the first tick) everywhere at a match time. */
function field(s: MatchState, seconds: number, points: V3[]): V3[] {
  s.tick = Math.round(seconds / TICK);
  return points.map((p) => ({ ...windAt(sea, s, p, newWind()).v }));
}

test('the wind is one planetary field, tangent and fair, shifting slowly through the match', (t) => {
  const s = createMatch({ seed: SEED }), points = spread(400), w = newWind();
  const now = field(s, 60, points), settled = points.map((p) => windAt(sea, s, p, newWind()).steady >= 0.5);
  const soon = field(s, 61, points), late = field(s, 660, points);
  let unsettled = 0;
  for (let k = 0; k < points.length; k++) {
    windAt(sea, s, points[k], w);
    assert.ok(Math.abs(dot(w.v, points[k])) < 1e-9 * WIND.speed, 'tangent to the sea');
    assert.ok(Math.abs(length(w.v) - WIND.speed) < 1e-9, 'fair strength everywhere outside gusts and weather');
    if (w.steady < 0.5) unsettled++;
  }
  const second = Math.max(...points.map((_, k) => (settled[k] ? angle(now[k], soon[k]) : 0)));
  const match = points.reduce((sum, _, k) => sum + angle(now[k], late[k]), 0) / points.length;
  t.diagnostic(`where settled, the wind turns at most ${second.toFixed(2)}° in a second, ${match.toFixed(1)}° on average over ten minutes; ${unsettled} of 400 points lie in a swirl's unsettled eye`);
  assert.ok(second < 2, 'never a sudden shift');
  assert.ok(match > 20 && match < 120, 'a visible shift over a match');
  assert.ok(unsettled < 60, 'the wind mostly has a settled direction');
  const other = seaFor(world(), SEED + 1), o = newWind();
  const differ = points.reduce((sum, p, k) => sum + angle(windAt(other, s, p, o).v, late[k]), 0) / points.length;
  assert.ok(differ > 45, 'every seed blows its own wind');
});

test('gusts run downwind, rise and die, and cover a fair share of the sea', (t) => {
  const s = createMatch({ seed: SEED }), idle = idleInput(), points = spread(2000), w = newWind();
  for (let k = 0; k < 30 / TICK; k++) step(sea, s, idle);
  assert.ok(s.gusts.every((g) => g.life > 0 && g.age <= g.life + TICK), 'every gust is alive');
  const covered = points.filter((p) => gustAt(s, p) > 0.05).length / points.length;
  t.diagnostic(`${(100 * covered).toFixed(1)} % of the sea lies in a gust`);
  assert.ok(covered > 0.05 && covered < 0.3);
  for (const p of points) {
    windAt(sea, s, p, w);
    assert.ok(Math.abs(w.strength - (1 + GUSTS.strength * w.gust)) < 1e-12, 'a gust adds to the wind\'s strength');
  }
  const g = s.gusts.find((x) => x.age < x.life - 1)!, from = { ...g.at };
  windAt(sea, s, from, w);
  const blow = { ...w.v };
  for (let k = 0; k < 1 / TICK - 1; k++) step(sea, s, idle);
  const moved = v3(g.at.x - from.x, g.at.y - from.y, g.at.z - from.z);
  assert.ok(angle(moved, blow) < 10, 'it runs with the wind');
  assert.ok(Math.abs((length(moved) * R) / (WIND.speed * GUSTS.drift) - 1) < 0.05, 'at its pace');
});

test('the apparent wind: running before it a ship feels less than the true wind, beating into it more', () => {
  const s = createMatch({ seed: SEED }), ship = s.ships[0], w = newWind(), out = v3();
  windAt(sea, s, ship.pos, w);
  const down = normalize({ ...w.v });
  ship.head = { ...down };
  const run = apparentWind(sea, s, 0, out);
  ship.head = v3(-down.x, -down.y, -down.z);
  const beat = apparentWind(sea, s, 0, out);
  assert.ok(run < WIND.speed && beat > WIND.speed, `${run.toFixed(2)} < ${WIND.speed} < ${beat.toFixed(2)}`);
  assert.ok(dot(out, ship.head) < 0, 'beating, it blows from ahead');
});

test('the lanes and the Great Current carry ships along them', (t) => {
  const c = v3(), lane = sea.geo.lanes[0], mid = normalize(v3(lane.a.x + lane.b.x, lane.a.y + lane.b.y, lane.a.z + lane.b.z));
  const along = normalize(cross(v3(), normalize(cross(v3(), lane.a, lane.b)), mid));
  currentAt(sea, mid, c);
  assert.ok(Math.abs(dot(c, along) - lane.speed) < 0.05 && length(c) < lane.speed + 0.05, 'full speed down the lane\'s middle');
  const side = normalize(cross(v3(), mid, along)), off = (u: number) => normalize(v3(mid.x + side.x * u / R, mid.y + side.y * u / R, mid.z + side.z * u / R));
  assert.equal(length(currentAt(sea, off(lane.width / 2 + 0.5), c)), 0, 'nothing beyond its edge');
  assert.ok(length(currentAt(sea, off(lane.width / 4), c)) < lane.speed * 0.6, 'slacker towards it');

  const pts = sea.current.points, k = 3 * Math.floor(pts.length / 6), at = v3(pts[k], pts[k + 1], pts[k + 2]);
  const ahead = normalize(v3(pts[k + 3] - pts[k - 3], pts[k + 4] - pts[k - 2], pts[k + 5] - pts[k - 1]));
  currentAt(sea, at, c);
  t.diagnostic(`the Great Current runs ${dot(c, ahead).toFixed(2)} u/s at its middle`);
  assert.ok(Math.abs(dot(c, ahead) - GREAT_CURRENT.speed) < 0.1, 'the Great Current at full speed');

  // A reefed ship sailing down the lane's middle makes good its own way plus the lane's.
  const s = createMatch({ seed: SEED }), ship = s.ships[0], idle = idleInput();
  ship.pos = { ...mid };
  ship.head = { ...along };
  ship.sail = SAIL.reefed;
  ship.speed = FORMS[ship.form].speed * 0.72;
  const from = { ...mid };
  for (let n = 0; n < 2 / TICK; n++) step(sea, s, idle);
  const made = (R * Math.acos(dot(from, ship.pos))) / 2;
  assert.ok(made > ship.speed + 0.8 * lane.speed, `${made.toFixed(2)} u/s over the ground`);

  // The fleet opens riding the Great Current, faster than sail alone could carry it.
  const r = createMatch({ seed: SEED }), start = { ...r.ships[0].pos };
  for (let n = 0; n < 20 / TICK; n++) step(sea, r, idle);
  const rode = (R * Math.acos(dot(start, r.ships[0].pos))) / 20;
  t.diagnostic(`the player rides the Great Current at ${rode.toFixed(2)} u/s over the first 20 s`);
  assert.ok(rode > FORMS[0].speed * 1.22 * 1.15, 'the current carries the fleet');
});

test('the tide rises and falls on its period', () => {
  assert.equal(seaLevel(0), 0);
  assert.ok(Math.abs(seaLevel(TIDE.period / 4) - TIDE.amp) < 1e-12);
  assert.ok(Math.abs(seaLevel((3 * TIDE.period) / 4) - LOW_WATER) < 1e-12, 'low water is the lowest it falls');
});

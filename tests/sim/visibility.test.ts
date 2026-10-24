// WP8 part C, sight, headless: the curvature horizon (masthead first, then the hull; the crow's nest sees farther),
// checked against the line of sight over the sphere; fog hiding ships inside from outside, trails laid in fog kept off
// rival charts; squalls and the storm shortening sight; kelp hiding; the flare, the fog flask and the gull; the marks
// of rivals in your waters; and the survey's cost.
//   node --test tests/sim/visibility.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seaFor } from '../../src/sim/environment.ts';
import { rngDir, rngFrom, rngInt, set, v3, type V3 } from '../../src/sim/math.ts';
import { R, TERRITORY, advance, cellDir, cellOf, horizonDistance, tangentAt } from '../../src/sim/sphere.ts';
import { PHASE, SHIPS, TICK, createMatch, type MatchState } from '../../src/sim/state.ts';
import { calmNow } from '../../src/sim/storm.ts';
import { FITTING, SIGHT, SLOT, SPELL, STORM, WEATHER } from '../../src/sim/tables.ts';
import { inkHome } from '../../src/sim/territory.ts';
import { eyeReach, newSight, noteFog, survey, trailSeen, type Sight } from '../../src/sim/visibility.ts';
import { ZONE } from '../../src/sim/world/geography.ts';
import { REGIONS } from '../../src/sim/world/regions.ts';
import { world } from './vectors.ts';

const SEED = 20261024, W = world(), sea = seaFor(W, SEED), out: Sight[] = Array.from({ length: SHIPS }, newSight);
const kelp = (p: V3): boolean => (W.geo.zones[cellOf(TERRITORY, p)] & ZONE.kelp) !== 0;
const hidingKelp = (p: V3): boolean => kelp(p) && REGIONS[W.geo.region[cellOf(TERRITORY, p)]].mechanics.kelp?.hide === true;

/** A start and a heading with no kelp for 100 u along it. */
const P = v3(), T = v3();
for (const rng = rngFrom(SEED); ; ) {
  rngDir(rng, P);
  tangentAt(P, 0, T);
  const q = v3(), h = v3();
  let clear = true;
  for (let d = 0; d <= 100 && clear; d += 0.5) {
    advance(P, T, d, q, h);
    clear = !kelp(q);
  }
  if (clear) break;
}

/** A fresh match in fair weather, before the storm, every ship sailing, all but ships 0 and 1 far away. */
function fresh(): MatchState {
  const s = createMatch({ seed: SEED });
  for (const w of s.weather) w.life = w.age = 0;
  s.ships.forEach((ship, i) => {
    ship.phase = PHASE.sailing;
    set(ship.pos, -P.x, -P.y, -P.z);
    if (i < 2) advance(P, T, 0, ship.pos, ship.head);
  });
  return s;
}
const place = (s: MatchState, i: number, d: number): void => advance(P, T, d, s.ships[i].pos, s.ships[i].head);
/** What ship 0 makes of ship 1: 3 the whole ship, 2 its masthead (hull-down), 0 nothing. */
function seen(s: MatchState): number {
  survey(sea, s, out);
  return (out[0].ships & 2 ? 2 : 0) | (out[0].hulls & 2 ? 1 : 0);
}
const marked = (s: MatchState): boolean => (survey(sea, s, out)[0].marks & 2) !== 0;
/** Whether the straight line from h0 u above p0 to h1 u above p1 clears the sea. */
function clears(p0: V3, h0: number, p1: V3, h1: number): boolean {
  const a = v3(p0.x * (R + h0), p0.y * (R + h0), p0.z * (R + h0)), b = v3(p1.x * (R + h1), p1.y * (R + h1), p1.z * (R + h1));
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
  const u = Math.max(0, Math.min(1, -(a.x * dx + a.y * dy + a.z * dz) / (dx * dx + dy * dy + dz * dz)));
  return Math.hypot(a.x + u * dx, a.y + u * dy, a.z + u * dz) >= R;
}
function spell(s: MatchState, kind: number, at: V3, r: number): void {
  Object.assign(s.weather[0], { kind, at: { ...at }, v: v3(), r, age: WEATHER.rise, life: 1e6 });
}

test('a rival shows its masthead over the curve first, then its hull; a crow\'s nest sees farther', () => {
  const s = fresh(), reach = eyeReach(s, 0), eye = SIGHT.eye[0];
  const hull = horizonDistance(SIGHT.hull[0]), mast = horizonDistance(SIGHT.mast[0]);
  for (const [d, want] of [[reach + hull - 0.3, 3], [reach + hull + 0.3, 2], [reach + mast - 0.3, 2], [reach + mast + 0.3, 0]]) {
    place(s, 1, d);
    assert.equal(seen(s), want, `at ${d.toFixed(1)} u`);
    const a = s.ships[0].pos, b = s.ships[1].pos;
    assert.equal(clears(a, eye, b, SIGHT.mast[0]), want >= 2, 'the masthead is up exactly while the line to it clears the sea');
    assert.equal(clears(a, eye, b, SIGHT.hull[0]), want === 3);
  }
  s.ships[0].fittings[SLOT.lookout] = { kind: FITTING.crowsNest, tier: 4 };
  assert.ok(eyeReach(s, 0) > reach && seen(s) > 0);
});

test('fog hides ships inside it from outside, and a trail laid in fog never shows on rival charts', () => {
  const s = fresh();
  place(s, 1, 40);
  spell(s, SPELL.fog, s.ships[1].pos, 30);
  assert.equal(seen(s), 0, 'from outside the fog');
  place(s, 0, 32);
  assert.ok(seen(s) > 0, 'from inside the same fog');
  s.ships[1].laid = [cellOf(TERRITORY, s.ships[1].pos)];
  noteFog(s);
  place(s, 0, 0);
  assert.ok(!trailSeen(sea, s, 0, 1, 0) && trailSeen(sea, s, 1, 1, 0));
  s.weather[0].life = 0; // the fog lifts: the trail laid in it stays off the chart, one laid after shows
  assert.ok(!trailSeen(sea, s, 0, 1, 0));
  s.ships[1].laid.push(cellOf(TERRITORY, s.ships[0].pos));
  noteFog(s);
  assert.ok(trailSeen(sea, s, 0, 1, 1));
  s.ships[1].flask = 5;
  assert.ok(!trailSeen(sea, s, 0, 1, 1), 'a fog flask hides the trail');
});

test('squalls and the storm shorten sight', () => {
  const s = fresh();
  place(s, 1, 45);
  assert.equal(seen(s), 2);
  spell(s, SPELL.squall, s.ships[0].pos, 60);
  assert.equal(seen(s), 0);
  assert.ok(Math.abs(out[0].range - SIGHT.clear * WEATHER.squall.sight) < 1e-9);
  s.weather[0].life = 0;
  s.tick = Math.round((STORM.phases[2].move + STORM.phases[2].sweep) / TICK);
  const c = calmNow(s).at, far = v3(-c.x, -c.y, -c.z), t2 = tangentAt(far, 0, v3());
  advance(far, t2, 0, s.ships[0].pos, v3());
  advance(far, t2, 40, s.ships[1].pos, v3());
  assert.equal(seen(s), 0);
  assert.ok(Math.abs(out[0].range - SIGHT.clear * STORM.sight) < 1e-9);
});

test('hiding kelp hides a ship from outside it, not from inside', () => {
  const s = fresh(), d = v3(), h = v3(), tt = v3();
  let cell = 0;
  while (cell < TERRITORY.cells && !hidingKelp(cellDir(TERRITORY, cell, d))) cell++;
  set(s.ships[1].pos, d.x, d.y, d.z);
  let out_ = false;
  for (let k = 0; k < 64 && !out_; k++) {
    advance(d, tangentAt(d, k * 0.7, tt), 3 + (k % 8) * 1.5, s.ships[0].pos, h);
    out_ = !kelp(s.ships[0].pos);
  }
  assert.ok(out_, 'a spot out of the kelp near it');
  assert.equal(seen(s), 0);
  set(s.ships[0].pos, d.x, d.y, d.z);
  assert.ok(seen(s) > 0);
});

test('a flare marks rivals beyond the horizon, a fog flask hides a ship from everything, a gull sees and dives', () => {
  const s = fresh();
  place(s, 1, 80);
  assert.ok(seen(s) === 0 && !marked(s));
  s.ships[0].flare = 5;
  assert.ok(marked(s));
  s.ships[1].flask = 5;
  assert.ok(!marked(s));
  place(s, 1, 5);
  assert.equal(seen(s), 0, 'under its fog flask even close by');
  s.ships[0].flare = s.ships[1].flask = 0;
  place(s, 1, 80);
  const gull = { at: v3(), height: 15, dive: -1 }, gulls = [gull, null, null, null, null, null, null, null, null, null];
  advance(P, T, 60, gull.at, v3());
  assert.ok((survey(sea, s, out, gulls)[0].ships & 2) !== 0 && (out[0].marks & 2) === 0);
  gull.dive = 1;
  assert.ok((survey(sea, s, out, gulls)[0].marks & 2) !== 0);
});

test('rivals in your waters are marked on your chart', () => {
  const s = fresh();
  place(s, 0, 50);
  inkHome(s, 0);
  place(s, 1, 51);
  assert.ok(marked(s));
  place(s, 1, 90);
  assert.ok(!marked(s));
});

test('the survey of all ten ships is cheap (within A9 beside the step)', (t) => {
  const s = fresh(), rng = rngFrom(7), h = v3();
  s.ships.forEach((ship, i) => {
    tangentAt(P, i, T);
    advance(P, T, 6 * i, ship.pos, h);
  });
  for (let k = 0; k < 12; k++) {
    const at = { ...s.ships[rngInt(rng, SHIPS)].pos };
    Object.assign(s.weather[k], { kind: k % 2 ? SPELL.fog : SPELL.squall, at, v: v3(), r: 30, age: WEATHER.rise, life: 1e6 });
  }
  for (let k = 0; k < 200; k++) survey(sea, s, out);
  const t0 = performance.now(), n = 2000;
  for (let k = 0; k < n; k++) survey(sea, s, out);
  const ms = (performance.now() - t0) / n;
  t.diagnostic(`survey of ${SHIPS} ships × ${SHIPS - 1} rivals: ${(ms * 1000).toFixed(1)} µs`);
  assert.ok(ms < 0.1);
});

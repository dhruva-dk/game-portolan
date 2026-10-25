// WP6 part A, ships under way: the six-minute lap, the point of sail, turning circles and sail steps by form, the
// modifiers, collisions with ships and land, head home and the drawn course — all through the real step.
//   node --test tests/sim/sailing.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { over } from '../../src/sim/end.ts';
import { LOW_WATER, aground, currentAt, seaFor, tideOf, type Sea } from '../../src/sim/environment.ts';
import { FLAG, STEER_MAX, idleInput, type ShipInput } from '../../src/sim/input.ts';
import { PI, length, v3, type V3 } from '../../src/sim/math.ts';
import { PHASE, matchHash } from '../../src/sim/state.ts';
import { step } from '../../src/sim/match.ts';
import { planHome } from '../../src/sim/route.ts';
import { BUMPED, newTrim, pointOfSail, settledSpeed, trim, turningRadius } from '../../src/sim/sailing.ts';
import { R, TERRITORY, advance, cellDir, cellOf, fromLatLon, tangentAt, tangentToward } from '../../src/sim/sphere.ts';
import { SAIL, SHIPS, TICK, createMatch, type MatchState } from '../../src/sim/state.ts';
import { FITTING, FORM, FORMS, PILOT, REFERENCE, SAILS, SLOT } from '../../src/sim/tables.ts';
import { coastAt, heightAt, toWorld } from '../../src/sim/world/geography.ts';
import { DRAFT, REGIONS } from '../../src/sim/world/regions.ts';
import { navCellOf } from '../../src/sim/world/nav.ts';
import { unarmed, world } from './vectors.ts';

const SEED = 20261024;
const sea = seaFor(world(), SEED);
const input = (patch: Partial<ShipInput> = {}): ShipInput => ({ ...idleInput(), ...patch });
const apart = (a: V3, b: V3) => R * Math.sqrt(Math.max(0, (a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2));
const WEEPING = REGIONS.findIndex((r) => r.id === 'weepingIsle');

/** A match in fair weather with ship 0 at p heading along bearing b (radians from north), making way under `sail`. */
function match(forms: number | number[], p: V3, b: number, sail: number = SAIL.plain, seed = SEED): MatchState {
  const s = createMatch({ seed, fleet: (Array.isArray(forms) ? forms : new Array<number>(SHIPS).fill(forms)).map((form) => ({ form })) });
  for (const spell of s.weather) spell.life = 1e9; // no spell is ever sent: the weather's own tests are in environment.test.ts
  for (const ship of s.ships) ship.phase = PHASE.sailing; // the whole fleet at sea, off the Great Current
  put(s, 0, p, tangentAt(p, b, v3()), sail);
  return s;
}

function put(s: MatchState, i: number, p: V3, head: V3, sail: number = SAIL.plain): void {
  const ship = s.ships[i];
  ship.pos = { ...p };
  ship.head = { ...head };
  ship.sail = sail;
  ship.speed = FORMS[ship.form].speed * SAILS[sail].speed;
}

/** Open sea far from land, from every current and from the fleet at the head of the Great Current. */
function openSea(clear: number, waters: Sea = sea): V3 {
  const p = v3(), q = v3(), c = v3(), pts = waters.current.points, start = v3(pts[0], pts[1], pts[2]);
  for (let lon = 0; lon < 2 * PI; lon += 0.02) {
    for (const lat of [0, 0.1, -0.1, 0.2, -0.2]) {
      fromLatLon(lat, lon, p);
      if (coastAt(waters.geo, p) < clear || apart(p, start) < 150) continue;
      let calm = length(currentAt(waters, p, c)) === 0;
      for (let k = 0; k < 8 && calm; k++) {
        calm = length(currentAt(waters, fromLatLon(lat + 0.2 * Math.cos(k * PI / 4), lon + 0.2 * Math.sin(k * PI / 4), q), c)) === 0;
      }
      if (calm) return p;
    }
  }
  throw new Error('no open sea');
}

/** The first point along a bearing (degrees) of a region's chart, 55 u or more out, with `clear` u of water round it. */
function waterOut(ri: number, bearing: number, clear = 10): V3 {
  const b = (bearing * PI) / 180;
  for (let d = 55; d < 130; d++) {
    const p = toWorld(ri, d * Math.sin(b), d * Math.cos(b), v3());
    if (coastAt(sea.geo, p) >= clear) return p;
  }
  throw new Error(`no water out from ${REGIONS[ri].id} at ${bearing}°`);
}

test('a caravel under plain sail in a fair wind rounds the equator in six minutes (± 5 %)', (t) => {
  for (const seed of [SEED, 7, 1234, 99, 0x5eed05]) {
    // The lap sails the seed's wind and the fixed lanes; the seed's Great Current, which may run along the equator
    // and carry the ship or stem it, is ridden in its own test (environment.test.ts).
    const waters: Sea = { ...seaFor(world(), seed), current: { regions: [], points: new Float64Array(0), length: 0 } };
    const course: number[] = [], p = v3();
    for (let k = 0; k <= 680; k++) {
      fromLatLon(0, k * 0.01, p);
      assert.ok(coastAt(waters.geo, p) > 4, `the equator is open sea at longitude ${(k * 0.01).toFixed(2)}`);
      course.push(cellOf(TERRITORY, p));
    }
    const s = match(FORM.caravel, fromLatLon(0, 0, v3()), PI / 2, SAIL.plain, seed), ship = s.ships[0], idle = input();
    unarmed(s, 1); // the rest of the fleet lies off the head of the current, guns struck below: nothing ends the match mid-lap
    for (const calm of s.storm.calms) calm.r = PI; // the storm held off: this is the sails' own pace
    step(waters, s, input({ course }));
    let lon = 0, last = 0;
    while (lon < 2 * PI && s.tick < 450 / TICK) {
      assert.ok(!over(s), `seed ${seed}: the match ended at ${(s.tick * TICK).toFixed(1)} s, mid-lap`); // step() would stand still
      step(waters, s, idle);
      assert.notEqual(ship.bumped, BUMPED.land, 'never touches land');
      const now = Math.atan2(-ship.pos.z, ship.pos.x);
      lon += ((now - last + 3 * PI) % (2 * PI)) - PI;
      last = now;
    }
    const lap = s.tick * TICK;
    t.diagnostic(`seed ${seed}: the lap takes ${lap.toFixed(1)} s`);
    assert.ok(lap > 342 && lap < 378, `seed ${seed}: ${lap.toFixed(1)} s is six minutes ± 5 %`);
  }
});

test('the point of sail moves speed by at most 15 %, averages out over every heading, and the caravel points closest', (t) => {
  const neutral: number[] = [];
  let lowest = Infinity;
  for (let form = 0; form < FORMS.length; form++) {
    let sum = 0, n = 0, first = -1;
    for (let deg = 0; deg <= 180; deg += 0.25) {
      const f = pointOfSail(form, Math.cos((deg * PI) / 180));
      assert.ok(f >= 0.85 - 1e-12 && f <= 1.15 + 1e-12, `${FORMS[form].name} at ${deg}°: ${f}`);
      sum += f;
      n++;
      lowest = Math.min(lowest, f);
      if (first < 0 && f >= 1) first = deg;
    }
    neutral.push(first);
    assert.ok(Math.abs(sum / n - 1) < 2e-3, `${FORMS[form].name} averages the reference speed over every heading`);
    assert.ok(pointOfSail(form, Math.cos(0.6 * PI)) > 1.06, 'a broad reach drives hardest');
  }
  t.diagnostic(`angle off the wind where each rig reaches its reference speed: ${neutral.map((d, f) => `${FORMS[f].name} ${d}°`).join(', ')}`);
  assert.ok(Math.abs(lowest - 0.85) < 1e-12, 'head to wind a square rig loses the full 15 %');
  assert.ok(neutral.every((d, f) => f === FORM.caravel || d > neutral[FORM.caravel] + 5), 'the lateen caravel points closest');
  for (const deg of [30, 45, 60]) {
    const c = Math.cos((deg * PI) / 180);
    for (let f = 0; f < FORMS.length; f++) if (f !== FORM.caravel) assert.ok(pointOfSail(FORM.caravel, c) > pointOfSail(f, c));
  }
});

/** No gusts for the rest of the test: they would blur what it measures. */
function stillAir(s: MatchState): MatchState {
  for (const g of s.gusts) {
    g.life = 1e9;
    g.age = 0;
  }
  return s;
}

/** The diameter of the circle ship 0 sails with the helm hard over, once settled into the turn. */
function circle(form: number, sail: number, p: V3): number {
  const s = stillAir(match(form, p, 0, sail)), ship = s.ships[0], hard = input({ steer: STEER_MAX }), path: V3[] = [];
  for (let k = 0; k < 240; k++) step(sea, s, hard);
  for (let turned = 0; turned < 2 * PI; turned += ship.rate * TICK) {
    step(sea, s, hard);
    assert.notEqual(ship.bumped, BUMPED.land);
    path.push({ ...ship.pos });
  }
  let d = 0;
  for (let i = 0; i < path.length; i += 2) for (let j = i + 1; j < path.length; j += 2) d = Math.max(d, apart(path[i], path[j]));
  return d;
}

test('turning circles widen with every form, and from reefed through plain to full sail', (t) => {
  const p = openSea(60), d = FORMS.map((_, form) => [SAIL.reefed, SAIL.plain, SAIL.full].map((sail) => circle(form, sail, p)));
  for (let form = 0; form < FORMS.length; form++) {
    t.diagnostic(`${FORMS[form].name}: reefed ${d[form][0].toFixed(1)} u, plain ${d[form][1].toFixed(1)} u, full ${d[form][2].toFixed(1)} u across`);
    assert.ok(d[form][0] < d[form][1] && d[form][1] < d[form][2], `${FORMS[form].name}: reefed turns tightest, full widest`);
    assert.ok(Math.abs(d[form][1] / (2 * FORMS[form].radius) - 1) < 0.2, `${FORMS[form].name} sails its table's circle`);
    if (form > 0) for (let sail = 0; sail < 3; sail++) assert.ok(d[form][sail] > d[form - 1][sail], `${FORMS[form].name} turns wider than ${FORMS[form - 1].name}`);
  }
});

test('full sail is fastest and reefed slowest; every form gathers way with its own weight', (t) => {
  const wind = { v: v3(), strength: 1, steady: 0, gust: 0 }, T = newTrim();
  assert.ok(Math.abs(settledSpeed(FORM.caravel, SAIL.plain, 0, wind, T) - REFERENCE) < 1e-12, 'the caravel at plain sail makes the reference speed');
  for (let form = 0; form < FORMS.length; form++) {
    const at = (sail: number) => settledSpeed(form, sail, 0, wind, T);
    assert.ok(at(SAIL.reefed) < at(SAIL.plain) && at(SAIL.plain) < at(SAIL.full));
    if (form > 0) assert.ok(at(SAIL.plain) < settledSpeed(form - 1, SAIL.plain, 0, wind, T), 'every form up is slower');
  }
  const p = openSea(40), rise: number[] = [];
  for (let form = 0; form < FORMS.length; form++) {
    const s = stillAir(match(form, p, 0)), ship = s.ships[0], idle = input(), way: number[] = [];
    ship.speed = 0;
    for (let k = 0; k < 25 / TICK; k++) {
      step(sea, s, idle);
      way.push(ship.speed);
    }
    rise.push((way.findIndex((v) => v >= 0.9 * way[way.length - 1]) + 1) * TICK);
  }
  t.diagnostic(`seconds from a standstill to 90 % of way: ${rise.map((r, f) => `${FORMS[f].name} ${r.toFixed(2)}`).join(', ')}`);
  for (let form = 1; form < FORMS.length; form++) assert.ok(rise[form] > rise[form - 1] * 1.15, 'heavier forms gather way more slowly');
  assert.ok(rise[FORM.pinnace] > 1.5 && rise[FORM.galleon] < 9, 'weighty, never sluggish');
});

test('waters, landmarks, fittings, torn sails, gusts, light airs and gales trim the way', () => {
  const s = createMatch({ seed: SEED }), ship = s.ships[0], T = newTrim(), cell = cellOf(TERRITORY, ship.pos);
  ship.phase = PHASE.sailing; // at sea, off the Great Current
  const mark = (perk: string) => sea.marks[sea.geo.landmarks.findIndex((l) => l.perk === perk)];
  const speed = () => trim(sea, s, 0, T).speed, near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-12, `${a} ≠ ${b}`);
  near(speed(), 1);
  s.owner[cell] = 1;
  near(speed(), 1.1); // own waters
  s.owner[cell] = 2;
  near(speed(), 0.9); // a rival's waters
  s.owner[mark('rootGate')] = 2;
  near(speed(), 0.8); // a rival's waters, the rival holding the Root Gate
  s.owner[cell] = 0;
  s.owner[mark('whaleRoad')] = 1;
  near(speed(), 1.2); // the Whale Road, everywhere
  s.owner[mark('whaleRoad')] = 0;
  ship.fittings[SLOT.rig] = { kind: FITTING.spareCanvas, tier: 4 };
  near(speed(), 1.12);
  ship.fittings[SLOT.hull] = { kind: FITTING.copperSheathing, tier: 0 };
  near(speed(), 1.12 * 1.03);
  ship.fittings[SLOT.hull] = { kind: FITTING.none, tier: 0 };
  ship.fittings[SLOT.rig] = { kind: FITTING.lateenMizzen, tier: 2 };
  near(trim(sea, s, 0, T).turn, 1.16);
  near(turningRadius(ship.form, SAIL.plain, T), FORMS[ship.form].radius / 1.16);
  ship.fittings[SLOT.rig] = { kind: FITTING.none, tier: 0 };
  ship.torn = 1;
  near(speed(), 0.7); // chain shot
  for (let k = 0; k < 31; k++) step(sea, s, input());
  assert.equal(ship.torn, 0, 'torn canvas is mended in its time');
  near(speed(), 1);

  const at = (strength: number, gust: number, stormSails: boolean) =>
    settledSpeed(FORM.caravel, SAIL.plain, 0, { v: v3(), strength, steady: 0, gust }, { speed: 1, turn: 1, stormSails, drive: 0 }) / REFERENCE;
  near(at(1, 1, false), 1.14); // the heart of a gust
  near(at(0.5, 0, false), 0.7); // light airs
  near(at(2.4, 0, false), 0.7); // a gale without storm sails
  near(at(2.4, 0, true), 1); // storm sails lose nothing
});

test('ships collide as hulls: pushed apart by mass, the closing speed reported where each was struck', () => {
  const p = openSea(40), s = match(FORM.caravel, p, 0), a = s.ships[0], b = s.ships[1], idle = input();
  const ahead = v3(), back = v3();
  advance(p, a.head, 12, ahead, back);
  put(s, 1, ahead, v3(-back.x, -back.y, -back.z));
  const speed = a.speed;
  while (a.bump === 0 && s.tick < 300) step(sea, s, idle);
  assert.equal(a.bumped, 1);
  assert.equal(b.bumped, 0);
  assert.ok(a.bumpOn > 0.9 && b.bumpOn > 0.9, 'bow to bow');
  assert.ok(a.bump > 1.6 * speed && a.bump < 2.2 * speed, `closing at ${a.bump.toFixed(2)} u/s`);
  assert.ok(a.speed < 0.3 * speed, 'the blow takes the way off');
  for (let k = 0; k < 90; k++) {
    step(sea, s, idle);
    assert.ok(apart(a.pos, b.pos) > 2 * FORMS[FORM.caravel].beam - 0.05, 'hulls never pass through each other');
  }

  // A galleon rams a pinnace amidships: the bow strikes, the side is struck, and the light hull takes the shove.
  const r = match([FORM.galleon, FORM.pinnace, 0, 0, 0, 0, 0, 0, 0, 0], p, 0), g = r.ships[0], q = r.ships[1];
  advance(p, g.head, 4.5, ahead, back);
  put(r, 1, ahead, tangentAt(ahead, PI / 2, v3()), SAIL.reefed);
  q.speed = 0;
  while (g.bump === 0 && r.tick < 300) step(sea, r, idle);
  assert.ok(g.bumpOn > 0.9 && Math.abs(q.bumpOn) < 0.35, 'the galleon\'s bow in the pinnace\'s side');
  assert.equal(g.bump, q.bump);
  assert.ok(length(q.shove) > 2 * length(g.shove), 'the lighter hull is thrown the harder');
});

test('a ship whose stern lies over the shore (swung there coming about, or left by the ebb) sails off it', () => {
  const half = FORMS[FORM.caravel].half, out = v3(), stern = v3(), tmp = v3(), at = (b: number, r: number, o: V3) =>
    toWorld(WEEPING, r * Math.sin((b * PI) / 180), r * Math.cos((b * PI) / 180), o);
  let tried = 0;
  for (let b = 0; b < 360 && tried < 3; b += 15) {
    for (let r = 40; r < 130; r += 0.25) {
      const p = at(b, r, v3()), s = match(FORM.caravel, p, 0, SAIL.full), ship = s.ships[0];
      tangentToward(p, at(b, r + 5, out), ship.head); // bow out to sea, stern towards the island
      advance(p, ship.head, -half, stern, tmp);
      if (aground(sea, s, p) || !aground(sea, s, stern)) continue;
      advance(p, ship.head, half, stern, tmp);
      if (aground(sea, s, stern)) continue;
      tried++;
      const from = { ...ship.pos };
      for (let k = 0; k < 90; k++) step(sea, s, input());
      assert.ok(apart(ship.pos, from) > 1, `off the Weeping Isle at ${b}°: moved ${apart(ship.pos, from).toFixed(2)} u in 3 s`);
      break;
    }
  }
  assert.equal(tried, 3, 'three such places tried');
});

test('a ship stops at the shore, reports the impact and never sails onto land; it can steer off', () => {
  const p = waterOut(WEEPING, 0), centre = toWorld(WEEPING, 0, 0, v3());
  const s = match(FORM.caravel, p, 0, SAIL.full), ship = s.ships[0], idle = input();
  tangentToward(p, centre, ship.head);
  while (ship.bumped !== BUMPED.land && s.tick < 1800) step(sea, s, idle);
  assert.equal(ship.bumped, BUMPED.land, 'it runs aground on the Weeping Isle');
  assert.ok(ship.bump > 2.5, `struck at ${ship.bump.toFixed(2)} u/s`);
  assert.ok(ship.bumpOn > 0.9, 'bow first');
  assert.ok(ship.speed < 1, 'and stops');
  const hit = { ...ship.pos };
  for (let k = 0; k < 300; k++) {
    step(sea, s, idle);
    assert.ok(!aground(sea, s, ship.pos), 'never on the land');
  }
  const hard = input({ steer: STEER_MAX }), was = { ...ship.head }, until = s.tick + 30 / TICK;
  while (ship.head.x * was.x + ship.head.y * was.y + ship.head.z * was.z > -0.85 && s.tick < until) step(sea, s, hard);
  assert.ok(s.tick < until, 'hard over, it comes about off the shore');
  let far = 0;
  for (let k = 0; k < 180; k++) {
    step(sea, s, idle);
    far = Math.max(far, apart(ship.pos, hit));
  }
  assert.ok(far > 5 && ship.speed > 0.5 * FORMS[FORM.caravel].speed, `free of the shore, ${far.toFixed(1)} u off, making ${ship.speed.toFixed(2)} u/s`);
});

test('head home sails the shortest safe route to the ship\'s own waters, the same route every time', (t) => {
  const home = waterOut(WEEPING, 180, 14), from = waterOut(WEEPING, 0), d = v3();
  const run = () => {
    const s = match(FORM.caravel, from, PI / 2);
    for (let c = 0; c < TERRITORY.cells; c++) if (apart(cellDir(TERRITORY, c, d), home) < 10) s.owner[c] = 1;
    return s;
  };
  const s = run(), ship = s.ships[0], route: number[] = [], again: number[] = [];
  assert.ok(planHome(sea, s, 0, route) && planHome(sea, s, 0, again), 'a route exists');
  assert.deepEqual(again, route, 'planned twice, the same route');
  assert.equal(s.owner[route[route.length - 1]], 1, 'it ends in the ship\'s waters');
  for (const c of route) assert.ok(heightAt(sea.geo, cellDir(TERRITORY, c, d)) < LOW_WATER - DRAFT, 'open at low tide');
  const ownWaters = () => s.owner[cellOf(TERRITORY, ship.pos)] === 1, go = input({ flags: FLAG.headHome });
  step(sea, s, go);
  assert.deepEqual(ship.home, route, 'the ship sails the route anyone can plan for it');
  while (!ownWaters() && s.tick < 150 / TICK) {
    step(sea, s, go);
    assert.notEqual(ship.bumped, BUMPED.land, 'the route keeps off the land');
  }
  t.diagnostic(`round the Weeping Isle: a ${(route.length * 2.5).toFixed(0)} u route sailed in ${(s.tick * TICK).toFixed(1)} s`);
  assert.ok(ownWaters(), 'it reaches its waters');
  step(sea, s, input());
  assert.deepEqual(ship.home, [], 'released, the route is dropped');

  const replay = run();
  for (let k = 0; k <= s.tick - 2; k++) step(sea, replay, go);
  step(sea, replay, input());
  assert.equal(matchHash(replay), matchHash(s), 'the same voyage home every time');

  const lost = run();
  lost.owner.fill(0);
  assert.ok(!planHome(sea, lost, 0, route) && route.length === 0, 'no waters, no route');
  step(sea, lost, go);
  assert.equal(lost.ships[0].rate, 0, 'and the ship holds its course');
  for (let c = 0; c < TERRITORY.cells; c++) if (apart(cellDir(TERRITORY, c, d), home) < 10) lost.owner[c] = 1;
  for (let k = 0; k < PILOT.replan; k++) step(sea, lost, go);
  assert.ok(lost.ships[0].home.length > 0, 'waters again while it is held: it finds its way home at the next replan');
});

test('head home plans from a hull afloat inside the coast\'s clearance, where the nav cell itself is closed', () => {
  const home = waterOut(WEEPING, 180, 14), d = v3(), s = match(FORM.caravel, waterOut(WEEPING, 0), PI / 2), tide = tideOf(s);
  for (let c = 0; c < TERRITORY.cells; c++) if (apart(cellDir(TERRITORY, c, d), home) < 10) s.owner[c] = 1;
  let p: V3 | null = null; // afloat at any tide, yet within CLEAR of the shore, so its nav cell never opens
  for (let b = 0; b < 360 && !p; b += 5) {
    for (let r = 40; r < 130 && !p; r += 0.5) {
      const q = toWorld(WEEPING, r * Math.sin((b * PI) / 180), r * Math.cos((b * PI) / 180), v3());
      if (!(sea.voyage.level[navCellOf(q)] < tide) && heightAt(sea.geo, q) < LOW_WATER - DRAFT && !aground(sea, s, q)) p = q;
    }
  }
  assert.ok(p, 'such a place exists off the Weeping Isle');
  put(s, 0, p, tangentAt(p, 0, v3()));
  const route: number[] = [];
  assert.ok(planHome(sea, s, 0, route) && route.length > 0, 'a route home all the same');
  assert.equal(s.owner[route[route.length - 1]], 1, 'it ends in the ship\'s waters');
  step(sea, s, input({ flags: FLAG.headHome }));
  assert.deepEqual(s.ships[0].home, route, 'and the ship sails it');
});

test('seed 4: held from tick 600, head home never loses its route on a replan and closes the loop', (t) => {
  const sea4 = seaFor(world(), 4), s = createMatch({ seed: 4 }), ship = s.ships[0];
  const ownWaters = () => s.owner[cellOf(TERRITORY, ship.pos)] === 1;
  let off = -1, lost = -1;
  while (s.tick < 600 + 3600 && ship.phase !== PHASE.sunk && !(ship.homing && ownWaters())) {
    const go = idleInput(); // break off at tick 300, steer out for 200 ticks, hold head home from tick 600 (WP27c)
    if (ship.phase === PHASE.riding) go.flags = s.tick >= 300 ? FLAG.breakOff : 0;
    else if ((off = off < 0 ? s.tick : off) + 200 > s.tick) go.steer = 60;
    if (s.tick >= 600 && ship.phase !== PHASE.riding) go.flags |= FLAG.headHome;
    step(sea4, s, go);
    if (ship.homing && lost < 0 && !ship.home.length && !ownWaters() && ship.phase !== PHASE.sunk) lost = s.tick;
  }
  t.diagnostic(`home at tick ${s.tick}`);
  assert.equal(lost, -1, `the route home empty at tick ${lost}, out of her waters and afloat`);
  assert.ok(ownWaters(), 'she reaches her waters on the one hold');
});

test('a drawn course is sailed point by point and dropped when the stick is touched or the course is done', () => {
  const p = openSea(50), s = match(FORM.caravel, p, 0), ship = s.ships[0], a = v3(), b = v3(), tmp = v3();
  advance(p, tangentAt(p, PI / 2, tmp), 25, a, tmp);
  advance(a, tangentAt(a, 0, tmp), 25, b, tmp);
  const course = [cellOf(TERRITORY, a), cellOf(TERRITORY, b)], idle = input();
  step(sea, s, input({ course }));
  assert.deepEqual(ship.course, course);
  while (ship.course.length && s.tick < 60 / TICK) step(sea, s, idle);
  assert.equal(ship.course.length, 0, 'sailed to its end');
  assert.ok(apart(ship.pos, cellDir(TERRITORY, course[1], tmp)) < PILOT.arrive + 0.5, 'and its end reached');
  step(sea, s, input({ course: [course[0]] }));
  step(sea, s, idle);
  assert.equal(ship.course.length, 1, 'a new course holds while the stick rests');
  step(sea, s, input({ steer: 20 }));
  assert.deepEqual(ship.course, [], 'touching the stick takes the helm back');
});

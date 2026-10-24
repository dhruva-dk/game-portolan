// WP8 part B, combat, headless: hull by form and fittings; broadsides bearing only inside a side's arc and range, and
// the carrack's castle astern; reloading, a third faster holding the Arch; a ball's damage by distance and by the angle
// it strikes; rams scaled by closing speed, the rammer hurt a little; fire over time and the ward; rocks struck at
// speed; hot water and copper sheathing, and embers; no fire into the Great Lagoon; fog keeping a rival from the guns;
// aiming by tap and by drag; sinking through sink() with its bounty, twice over for the leader; determinism,
// snapshot/resume with shot in flight, and the tick's cost with all ten ships fighting.
//   node --test tests/sim/combat.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aim, combat, ignite, launch } from '../../src/sim/combat.ts';
import { seaFor } from '../../src/sim/environment.ts';
import { idleInput } from '../../src/sim/input.ts';
import { step } from '../../src/sim/match.ts';
import { addScaled, cross, dcos, dot, dsin, normalize, set, v3, type V3 } from '../../src/sim/math.ts';
import { collide, scald } from '../../src/sim/sailing.ts';
import { R, TERRITORY, advance, cellDir, cellOf } from '../../src/sim/sphere.ts';
import {
  CAUSE, EVENT, PHASE, SHIPS, TICK, createMatch, decodeMatch, encodeMatch, matchHash, type MatchState, type Outfit,
} from '../../src/sim/state.ts';
import {
  BATTERY, DOUBLED_PLANKING, END, FIRE, FITTING, FORM, FORMS, GUNS, RAM, ROCKS, SLOT, SPELL, START_FITTINGS, WEATHER, type Gun,
} from '../../src/sim/tables.ts';
import { newSight, survey } from '../../src/sim/visibility.ts';
import { ZONE } from '../../src/sim/world/geography.ts';
import { world } from './vectors.ts';

const SEED = 20261024, W = world(), sea = seaFor(W, SEED), SIGHT = Array.from({ length: SHIPS }, newSight);
const LIGHT = GUNS[FITTING.lightGuns] as Gun, PINNACE = FORMS[FORM.pinnace].hull, BEAM = Math.PI / 2, DEG = Math.PI / 180;
const S = (seconds: number): number => Math.round(seconds / TICK);
const apart = (a: V3, b: V3): number => R * Math.sqrt(Math.max(0, 2 - 2 * dot(a, b)));
const near = (a: number, b: number, eps = 1e-9): void => assert.ok(Math.abs(a - b) <= eps, `${a} is not ${b}`);
const fitted = (slot: number, kind: number, tier = 0): { kind: number; tier: number }[] =>
  START_FITTINGS.map((k, s) => ({ kind: s === slot ? kind : k, tier }));

/** Ships 0 and 1 at sea where the fleet starts, sailing but dead in the water; the rest out of the fight. */
function duel(fleet: Outfit[] = []): MatchState {
  const s = createMatch({ seed: SEED, fleet: Array.from({ length: SHIPS }, (_, i) => fleet[i] ?? {}) });
  s.ships.forEach((ship, i) => {
    ship.phase = i < 2 ? PHASE.sailing : PHASE.sunk;
    ship.speed = 0;
  });
  return s;
}

/** Guns held: no battery fires. */
const hold = (s: MatchState): void => s.ships.forEach((ship) => ship.reload.fill(1e9));

/** Ship j `d` u from ship 0 at `angle` off its bow (positive to starboard), heading as ship 0 does turned by `facing`. */
function place(s: MatchState, j: number, angle: number, d: number, facing = 0): void {
  const o = s.ships[0], ship = s.ships[j], star = cross(v3(), o.head, o.pos), t = v3();
  const dir = set(v3(), o.head.x * dcos(angle) + star.x * dsin(angle), o.head.y * dcos(angle) + star.y * dsin(angle), o.head.z * dcos(angle) + star.z * dsin(angle));
  advance(o.pos, dir, d, ship.pos, t);
  const h = normalize(addScaled(v3(), o.head, ship.pos, -dot(o.head, ship.pos))), st = cross(v3(), h, ship.pos);
  set(ship.head, h.x * dcos(facing) + st.x * dsin(facing), h.y * dcos(facing) + st.y * dsin(facing), h.z * dcos(facing) + st.z * dsin(facing));
}

/** Puts ship i at p, its heading kept tangent. */
function moveTo(s: MatchState, i: number, p: V3): void {
  const ship = s.ships[i];
  set(ship.pos, p.x, p.y, p.z);
  normalize(addScaled(ship.head, ship.head, ship.pos, -dot(ship.head, ship.pos)));
}

/** One tick of combat alone: sight surveyed, then combat (the ships do not move). */
function fight(s: MatchState): void {
  s.events.length = 0;
  survey(sea, s, SIGHT);
  combat(sea, s, SIGHT);
  s.tick++;
}

const fired = (s: MatchState, i = 0): number[] => s.events.filter((e) => e.kind === EVENT.broadside && e.ship === i).map((e) => e.amount);
const grant = (s: MatchState, perk: string, i: number): void => {
  s.owner[sea.marks[sea.geo.landmarks.findIndex((l) => l.perk === perk)]] = i + 1;
};

test('hull by form, the pinnace lightest to the galleon heaviest, and doubled planking adds to it', () => {
  for (let f = 1; f < FORMS.length; f++) assert.ok(FORMS[f].hull > FORMS[f - 1].hull, FORMS[f].name);
  assert.deepEqual(FORMS.map((f) => f.guns), [1, 2, 3, 4]);
  assert.deepEqual(FORMS.map((f) => f.castle), [false, false, true, false]);
  const s = createMatch({ seed: 1, fleet: [{ form: FORM.galleon, fittings: fitted(SLOT.hull, FITTING.doubledPlanking, 4) }, ...new Array<Outfit>(9).fill({})] });
  near(s.ships[0].hull, FORMS[FORM.galleon].hull * (1 + DOUBLED_PLANKING[4]));
  assert.equal(s.ships[1].hull, PINNACE);
});

test('a broadside bears only on a rival inside its arc and range; the carrack\'s castle bears astern', () => {
  const shoot = (angle: number, d: number, form: number = FORM.pinnace): number[] => {
    const s = duel([{ form, gunnery: 0 }]);
    place(s, 1, angle, d);
    fight(s);
    return fired(s);
  };
  assert.deepEqual(shoot(BEAM, 15), [BATTERY.starboard]);
  assert.deepEqual(shoot(-BEAM, 15), [BATTERY.port]);
  assert.deepEqual(shoot(BEAM - 20 * DEG, 15), [BATTERY.starboard], 'inside the arc');
  assert.deepEqual(shoot(-BEAM - 20 * DEG, 15), [BATTERY.port], 'inside the arc');
  assert.deepEqual(shoot(BEAM + 35 * DEG, 15), [], 'abaft the arc');
  assert.deepEqual(shoot(0, 15), [], 'dead ahead');
  assert.deepEqual(shoot(Math.PI, 15), [], 'dead astern, without a castle');
  assert.deepEqual(shoot(BEAM, LIGHT.range - 1), [BATTERY.starboard]);
  assert.deepEqual(shoot(BEAM, LIGHT.range + 1), [], 'out of range');
  assert.deepEqual(shoot(Math.PI, 15, FORM.carrack), [BATTERY.castle]);
  assert.deepEqual(shoot(BEAM, 15, FORM.carrack), [BATTERY.starboard]);
  const s = duel([{ form: FORM.galleon, gunnery: 0 }]);
  place(s, 1, BEAM, 15);
  fight(s);
  assert.equal(s.shots.filter((shot) => shot.ship === 0).length, FORMS[FORM.galleon].guns, 'a ball for every gun on the side');
});

test('a battery reloads before it fires again, a third faster holding the Arch', () => {
  const gap = (arch: boolean): number => {
    const s = duel([{ gunnery: 0 }]);
    place(s, 1, BEAM, 15);
    if (arch) grant(s, 'arch', 0);
    const at: number[] = [];
    for (let t = 0; t < S(6); t++) {
      fight(s);
      if (fired(s).length > 0) at.push(t);
    }
    return at[1] - at[0];
  };
  assert.ok(Math.abs(gap(false) - LIGHT.reload / TICK) <= 1, `${gap(false)} ticks`);
  assert.ok(Math.abs(gap(true) - (LIGHT.reload * 3) / 4 / TICK) <= 1, `${gap(true)} ticks`);
});

test('a ball strikes harder close in than at long range, and hardest raking a hull from bow or stern', () => {
  const hit = (d: number, facing: number): number => {
    const s = duel();
    hold(s);
    place(s, 1, BEAM, d, facing);
    launch(s, 0, FITTING.lightGuns, s.ships[0].pos, s.ships[1].pos, LIGHT, 2);
    while (s.shots.length > 0) fight(s);
    assert.deepEqual(s.events.filter((e) => e.kind === EVENT.hit).map((e) => [e.ship, e.by]), [[1, 0]]);
    return PINNACE - s.ships[1].hull;
  };
  // A shot flies the chord, a hair short of the arc between the hulls.
  const at = (d: number): number => LIGHT.damage[2] * (1 - (LIGHT.falloff * 2 * R * dsin(d / (2 * R))) / LIGHT.range);
  near(hit(5, 0), at(5), 1e-6);
  near(hit(20, 0), at(20), 1e-6);
  near(hit(10, BEAM), at(10) * 1.5, 1e-3);
  assert.ok(hit(5, 0) > hit(20, 0) && hit(10, BEAM) > hit(10, 0));
});

test('a ram holes the rammed hull by the closing speed, and the rammer takes a little', () => {
  const ram = (v: number): [number, number] => {
    const s = duel(), f = FORMS[FORM.pinnace];
    hold(s);
    place(s, 1, 0, f.half + f.beam - 0.05, BEAM);
    s.ships[0].speed = v;
    collide(s);
    fight(s);
    assert.deepEqual(s.events.filter((e) => e.kind === EVENT.ram).map((e) => [e.ship, e.by]), v > RAM.speed ? [[1, 0]] : []);
    return [PINNACE - s.ships[1].hull, PINNACE - s.ships[0].hull];
  };
  const [slow, slowBack] = ram(2), [fast, fastBack] = ram(4);
  near(slow, RAM.damage * (2 - RAM.speed), 1e-4); // closing along a contact normal bent by the curve
  near(fast, RAM.damage * (4 - RAM.speed), 1e-4);
  near(slowBack, slow * RAM.recoil, 1e-6);
  near(fastBack, fast * RAM.recoil, 1e-6);
  const [nudge] = ram(RAM.speed * 0.9);
  assert.equal(nudge, 0, 'a nudge is no ram');
});

test('fire burns the hull over time for whoever set it, a ward takes the hurt, and a fire that sinks a ship pays its setter', () => {
  const s = duel(), ship = s.ships[1];
  hold(s);
  ignite(s, 1, 2, 0);
  assert.deepEqual(s.events.filter((e) => e.kind === EVENT.ablaze).map((e) => [e.ship, e.by, e.amount]), [[1, 0, 2]]);
  for (let t = 0; t < S(3); t++) fight(s);
  near(PINNACE - ship.hull, FIRE.rate * 2, 1e-9);
  near(ship.harm[0], FIRE.rate * 2, 1e-9);
  assert.equal(ship.fire, 0);
  assert.equal(ship.fireBy, -1);
  ship.ward = 1;
  ignite(s, 1, 1, 0);
  const warded = ship.hull;
  fight(s);
  assert.equal(ship.hull, warded, 'the ward takes it');
  ship.ward = 0;
  ship.hull = 0.01;
  fight(s);
  assert.deepEqual(s.sunk.map((k) => [k.ship, k.by, k.cause]), [[1, 0, CAUSE.fire]]);
  assert.equal(s.ships[0].bank, END.bounty);
});

test('a ship sunk by gunfire goes down through sink(): its sinker\'s bounty, twice over for the leader', () => {
  for (const leader of [false, true]) {
    const s = duel();
    hold(s);
    place(s, 1, BEAM, 8);
    s.ships[1].hull = 1;
    if (leader) s.leader = 1;
    launch(s, 0, FITTING.lightGuns, s.ships[0].pos, s.ships[1].pos, LIGHT, 0);
    while (s.shots.length > 0) fight(s);
    assert.deepEqual(s.sunk.map((k) => [k.ship, k.by, k.cause]), [[1, 0, CAUSE.gun]]);
    assert.equal(s.ships[0].bank, END.bounty * (leader ? 2 : 1));
    assert.ok(s.timeline.some((e) => e.kind === EVENT.engage && e.ship === 1 && e.by === 0 && e.amount === CAUSE.gun), 'the fight is on the timeline');
  }
});

test('striking rocks at speed holes the hull by how much faster than a touch it struck', () => {
  const s = duel(), ship = s.ships[0];
  hold(s);
  ship.bump = ROCKS.speed * 0.8;
  ship.bumped = SHIPS;
  fight(s);
  assert.equal(ship.hull, PINNACE, 'a touch');
  ship.bump = 4;
  fight(s);
  near(PINNACE - ship.hull, ROCKS.damage * (4 - ROCKS.speed), 1e-9);
  assert.deepEqual(s.events.filter((e) => e.kind === EVENT.struck).map((e) => e.ship), [0]);
});

test('the Fire Archipelago\'s hot water scalds a hull unless copper-sheathed, and its embers set any hull alight', () => {
  const z = sea.geo.zones;
  const hot = z.findIndex((zone) => (zone & ZONE.hot) !== 0 && (zone & ZONE.harbour) === 0);
  assert.ok(hot >= 0);
  const s = duel([{}, { fittings: fitted(SLOT.hull, FITTING.copperSheathing) }]), at = cellDir(TERRITORY, hot, v3());
  hold(s);
  moveTo(s, 0, at);
  moveTo(s, 1, at);
  const rate = scald(sea, s, 0);
  assert.ok(rate > 0);
  assert.equal(scald(sea, s, 1), 0, 'copper');
  const alight = [0, 0];
  for (let t = 0; t < S(300); t++) {
    const burning = s.ships.slice(0, 2).map((ship) => ship.fire);
    for (const ship of s.ships.slice(0, 2)) ship.hull = PINNACE;
    fight(s);
    for (let i = 0; i < 2; i++) {
      near(PINNACE - s.ships[i].hull, (i === 0 ? rate * TICK : 0) + FIRE.rate * Math.min(TICK, burning[i]), 1e-9);
      alight[i] += s.events.filter((e) => e.kind === EVENT.ablaze && e.ship === i && e.by === -1).length;
    }
  }
  assert.ok(alight[0] > 0 && alight[1] > 0, `embers lit ${alight}`);
});

test('no rival fires on a ship inside the Great Lagoon while it holds it; it may fire out', () => {
  const lagoon = sea.geo.landmarks.find((l) => l.perk === 'greatLagoon');
  assert.ok(lagoon);
  const shoot = (held: boolean): [number[], number[]] => {
    const s = duel([{ gunnery: 0 }, { gunnery: 0 }]);
    moveTo(s, 0, lagoon.pos);
    place(s, 1, BEAM, Math.min(10, lagoon.r / 2));
    if (held) grant(s, 'greatLagoon', 1);
    fight(s);
    return [fired(s, 0), fired(s, 1)];
  };
  assert.deepEqual(shoot(false), [[BATTERY.starboard], [BATTERY.port]]);
  assert.deepEqual(shoot(true), [[], [BATTERY.port]]);
});

test('a rival hidden in fog cannot be engaged', () => {
  const shoot = (fog: boolean): number[] => {
    const s = duel([{ gunnery: 0 }]);
    place(s, 1, BEAM, 15);
    if (fog) Object.assign(s.weather[0], { kind: SPELL.fog, at: { ...s.ships[1].pos }, v: v3(), r: 8, age: WEATHER.rise, life: 1e6 });
    fight(s);
    return fired(s);
  };
  assert.deepEqual(shoot(false), [BATTERY.starboard]);
  assert.deepEqual(shoot(true), []);
});

test('an aimed fitting aims itself at the nearest rival in sight with a tap, and by hand at a drawn point with a drag', () => {
  const s = duel(), out = v3();
  place(s, 1, 0.3, 12);
  survey(sea, s, SIGHT);
  const seen = SIGHT[0].ships;
  assert.equal(aim(sea, s, 0, seen, -1, 30, Infinity, out), 1);
  near(apart(out, s.ships[1].pos), 0, 1e-5);
  assert.equal(aim(sea, s, 0, seen, -1, 10, Infinity, out), -1, 'beyond reach');
  assert.equal(aim(sea, s, 0, 0, -1, 30, Infinity, out), -1, 'out of sight');
  s.ships[1].speed = 4;
  aim(sea, s, 0, seen, -1, 30, 10, out);
  assert.ok(apart(out, s.ships[1].pos) > 0.5, 'a slow shell is led');
  const cell = cellOf(TERRITORY, s.ships[1].pos);
  assert.equal(aim(sea, s, 0, 0, cell, 30, 10, out), SHIPS);
  near(apart(out, cellDir(TERRITORY, cell, v3())), 0, 1e-5);
  const far = v3(), t = v3();
  advance(s.ships[0].pos, s.ships[0].head, 60, far, t);
  aim(sea, s, 0, 0, cellOf(TERRITORY, far), 30, 10, out);
  near(apart(out, s.ships[0].pos), 30, 0.5);
});

/** All ten ships broken off where they ride abreast, sailing on: each within a rival's broadside. */
function melee(): MatchState {
  const s = createMatch({ seed: SEED });
  for (const ship of s.ships) ship.phase = PHASE.sailing;
  return s;
}

test('a melee is deterministic, and resumes exactly from a snapshot taken with shot in flight', () => {
  const run = (s: MatchState, ticks: number): void => {
    for (let t = 0; t < ticks; t++) step(sea, s, idleInput());
  };
  const a = melee(), b = melee();
  run(a, S(30));
  run(b, S(30));
  assert.equal(matchHash(a), matchHash(b));
  const s = melee();
  let volleys = 0, hits = 0;
  while (s.shots.length === 0 || s.tick < S(4)) {
    step(sea, s, idleInput());
    volleys += s.events.filter((e) => e.kind === EVENT.broadside).length;
    hits += s.events.filter((e) => e.kind === EVENT.hit).length;
  }
  assert.ok(volleys > 0 && hits > 0, `${volleys} broadsides, ${hits} hits`);
  const resumed = decodeMatch(encodeMatch(s));
  assert.ok(resumed.shots.length > 0);
  run(s, S(20));
  run(resumed, S(20));
  assert.equal(matchHash(resumed), matchHash(s));
});

test('the tick\'s cost with ten ships fighting (A9: Node mean ≤ 0.3 ms)', (t) => {
  const s = melee(), cost: number[] = [];
  let shots = 0;
  for (let k = 0; k < S(40); k++) {
    const t0 = performance.now();
    step(sea, s, idleInput());
    cost.push(performance.now() - t0);
    shots = Math.max(shots, s.shots.length);
  }
  const sorted = cost.slice().sort((x, y) => x - y), mean = cost.reduce((x, y) => x + y, 0) / cost.length;
  t.diagnostic(`${cost.length} ticks, up to ${shots} shots in flight, ${s.sunk.length} sunk: mean ${mean.toFixed(3)} ms, p99 ${sorted[Math.floor(0.99 * sorted.length)].toFixed(3)} ms`);
  assert.ok(mean <= 0.3, `mean ${mean.toFixed(3)} ms`);
});

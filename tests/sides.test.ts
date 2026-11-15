// Sides (#58 step 3): ships 2k and 2k + 1 are side k, and do each other no harm. A ball stops on a sidemate's hull, a
// shell's burst spares her, a ram between them does nothing but push them apart, aim assist never lays on her and a
// bot never takes her for a foe. The race the lobby deals (play/deal.ts) and its colours (play/colours.ts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { battleOf, crewOf, stepBattle, type Crew, type Strike } from '../src/sim/battle.ts';
import { byTemper, mind, think } from '../src/sim/bot.ts';
import { afloat, gap, stepFleet, type Vessel } from '../src/sim/contact.ts';
import { STEP } from '../src/sim/fixed.ts';
import { SPEC } from '../src/sim/fit.ts';
import { gunOf, laid } from '../src/sim/gun.ts';
import { HEALTH, SHIP } from '../src/sim/handling.ts';
import { PLAYER } from '../src/sim/match.ts';
import { chart } from '../src/sim/route.ts';
import { loosed, type Ball } from '../src/sim/shot.ts';
import type { Depth } from '../src/sim/shoal.ts';
import { shipAt, turned, type ShipState } from '../src/sim/ship.ts';
import { berthing } from '../src/sim/spawn.ts';
import { calm } from '../src/sim/storm.ts';
import { captainOf, temper } from '../src/sim/temper.ts';
import { lookIn, lookOf } from '../src/play/colours.ts';
import { coloursOf, deal } from '../src/play/deal.ts';
import { startOf } from '../src/play/setup.ts';
import { createState, type Match } from '../src/play/state.ts';
import { CREW } from '../src/palette.ts';
import { SWATCHES } from '../src/race.ts';
import { SEED, createPlanet } from '../src/world/planet.ts';
import { hash } from '../src/world/random.ts';
import { R, add, along, frameAt, fromLatLon, normalize, scale, type Vec3 } from '../src/world/sphere.ts';
import { flat } from '../src/world/swell.ts';

const deep: Depth = () => 30;
const deg = Math.PI / 180;
const centre = fromLatLon(0.2, 0.3);
/** A ship at `c` heading `bearing` (radians to port of east) at `speed`. */
const lying = (c: Vec3, bearing: number, speed = 0): ShipState => {
  const s = shipAt(c, frameAt(c).east);
  return { ...s, heading: turned(s, bearing), speed };
};
/** The point `metres` from `c` on `bearing` (radians to port of east). */
const out = (c: Vec3, bearing: number, metres: number) => along(c, turned(lying(c, 0), bearing), metres).p;
/** Her line of sight from 20 m aloft over `s` onto the sea `metres` off on `bearing`. */
const on = (s: ShipState, bearing: Vec3, metres: number) => {
  const from = scale(s.at, R + 20);
  return { from, dir: normalize(add(scale(along(s.at, bearing, metres).p, R), from, -1)) };
};
const never = (f: readonly Vessel[]) => f.map(() => ({ aim: null, fire: false }));
/** A crew of `id` on `side`. */
const sided = (id: number, side: number): Crew => ({ ...crewOf(id), side });

/** Balls flown among `fleet` (still) until they are all down; every strike. */
function flown(fleet: Vessel[], crews: Crew[], balls: Ball[]) {
  let b = { ...battleOf(crews, 0), balls };
  const strikes: Strike[] = [];
  for (let i = 0; i < 300 && b.balls.length; i++) {
    const r = stepBattle(b, fleet, never(fleet), [], STEP, deep);
    b = r.battle;
    strikes.push(...r.strikes);
  }
  return { strikes, crews: b.crews };
}

test("a ball laid on a ship stops on her hull and does no harm if she is the shooter's sidemate; a foe it strikes", () => {
  const bearing = 30 * deg, metres = 120;
  const shooter = afloat(1, lying(centre, 0), SPEC, 1), target = (side: number) => afloat(2, lying(out(centre, bearing, metres), bearing), SPEC, side);
  // laid on her as a foe (the assist would not lay on a mate), then flown with her of each side
  const lay = laid(shooter, gunOf('cannon', 0), on(shooter.ship, turned(shooter.ship, bearing), metres), [shooter, target(2)], 7, deep, 0);
  assert.equal(lay.target, 2);
  const ball = () => [loosed(1, 'cannon', lay.from, lay.dirs[0], lay.speed, 20)];
  const mate = flown([shooter, target(1)], [sided(1, 1), sided(2, 1)], ball());
  assert.deepEqual(mate.strikes, [], 'no strike on her sidemate');
  assert.deepEqual(mate.crews.map((c) => c.health.hull), [HEALTH.hull, HEALTH.hull]);
  const foe = flown([shooter, target(2)], [sided(1, 1), sided(2, 2)], ball());
  assert.deepEqual(foe.strikes.map((s) => [s.shooter, s.struck]), [[1, 2]]);
});

test("a shell's burst spares the shooter's side: her mate beside the foe it bursts on takes nothing", () => {
  const bearing = 0, metres = 120, at = out(centre, bearing, metres);
  const shooter = afloat(1, lying(centre, 0), SPEC, 1), foe = afloat(2, lying(at, Math.PI / 2), SPEC, 2);
  // her mate lies alongside the foe, 4 m off her beam
  const mate = afloat(3, lying(out(at, 0, SHIP.beam + 4), Math.PI / 2), SPEC, 1);
  const fleet = [shooter, foe, mate], mortar = gunOf('mortar', 0);
  const lay = laid(shooter, mortar, on(shooter.ship, turned(shooter.ship, bearing), metres), fleet, 7, deep, 0);
  assert.equal(lay.target, 2);
  const r = flown(fleet, [sided(1, 1), sided(2, 2), sided(3, 1)], [loosed(1, 'mortar', lay.from, lay.dirs[0], lay.speed, 60)]);
  const hull = new Map(r.crews.map((c) => [c.id, c.health.hull]));
  assert.ok(hull.get(2)! < HEALTH.hull, `the foe took ${HEALTH.hull - hull.get(2)!}`);
  assert.equal(hull.get(3), HEALTH.hull, 'her mate took nothing');
  assert.ok(r.strikes.every((s) => s.struck !== 3));
});

test('aim assist never lays on her own side: with only her mate in the cone it lays on the sea', () => {
  const bearing = 20 * deg, metres = 100;
  const shooter = afloat(1, lying(centre, 0), SPEC, 1);
  for (const [side, target] of [[1, null], [2, 2]] as const) {
    const other = afloat(2, lying(out(centre, bearing, metres), 0), SPEC, side);
    const lay = laid(shooter, gunOf('cannon', 2), on(shooter.ship, turned(shooter.ship, bearing), metres), [shooter, other], 7, deep, 0);
    assert.equal(lay.target, target, `side ${side}`);
  }
});

test('a ram within a side does no damage; the hulls still meet and part', () => {
  for (const [side, rams] of [[1, 0], [2, 1]] as const) {
    const target = lying(centre, 0), from = along(target.at, turned(target, Math.PI / 2), -45 - SHIP.length / 2);
    let fleet = [afloat(1, { ...shipAt(from.p, from.t), speed: SHIP.top }, SPEC, 1), afloat(2, target, SPEC, side)];
    let b = battleOf([sided(1, 1), sided(2, side)], 1), blows = 0, met = false;
    for (let i = 0; i < Math.round(6 / STEP); i++) {
      const r = stepFleet(fleet, [{ course: null, throttle: 1 }, { course: null, throttle: 0 }], STEP, deep);
      fleet = r.fleet;
      blows += r.blows.length;
      met ||= gap(fleet[0].ship, fleet[1].ship) < 0.5;
      b = stepBattle(b, fleet, never(fleet), r.blows, STEP, deep).battle;
      assert.ok(gap(fleet[0].ship, fleet[1].ship) >= 0, 'never through each other');
    }
    assert.equal(blows, rams, `side ${side}`);
    assert.ok(met, 'they met');
    if (!rams) assert.deepEqual(b.crews.map((c) => c.health.hull), [HEALTH.hull, HEALTH.hull]);
  }
});

test('a bot never takes her sidemate for a foe; the same ship of another side she does', () => {
  for (const [side, foe] of [[0, -1], [5, 1]] as const) {
    const own = afloat(0, lying(centre, 0), SPEC, 0), other = afloat(1, lying(out(centre, 0, 60), Math.PI), SPEC, side);
    let m = mind(3, own.ship.at);
    for (let i = 0; i < 60; i++) m = think(own, [other], { depth: deep }, m, byTemper(3)).memory;
    assert.equal(m.foe, foe, `side ${side}`);
  }
});

test('the dealt race: forty sides of two, every ship on SPEC, her side 0 with a bot crewmate, the bots as today', () => {
  const card = deal(1234);
  assert.equal(card.ships.length, 80);
  assert.equal(new Set(card.ships.map((s) => s.side)).size, 40);
  card.ships.forEach((s, id) => {
    assert.equal(s.id, id);
    assert.equal(s.side, id >> 1);
    assert.equal(s.handling, SPEC);
    assert.equal(s.forfeit, false);
  });
  assert.equal(card.ships[PLAYER].captain, null, 'the player sails her own');
  const mate = card.ships[1].captain!;
  assert.equal(mate.seed, hash(1234, 1), "her crewmate's bot is the card-less match's ship 1's");
  assert.equal(mate.style, captainOf(hash(1234, 1)).style);
  assert.ok(Math.abs((0.35 + (0.55 * mate.stats.gunnery) / 20) - temper(mate.seed).skill) < 1e-12);
  assert.deepEqual(deal(1234), card, 'the same seed, the same card');
  // no two sides share colours, and only hers is vermilion
  const pairs = card.ships.filter((s) => s.id % 2 === 0).map((s) => `${s.colours.first}/${s.colours.second}`);
  assert.equal(new Set(pairs).size, 40);
  assert.ok(card.ships.every((s) => s.side === 0 || (s.colours.first !== 0 && s.colours.second !== 0)));
  assert.deepEqual(coloursOf(0), { first: 0, second: 0 });
});

test('colours: a side wears its swatches, its first ship plain and its second banded; a card-less match as today', () => {
  const card = deal(5, 8);
  assert.equal(CREW.length, SWATCHES);
  assert.equal(SWATCHES, 24);
  for (const id of [2, 3]) {
    const look = lookIn(card, id), c = card.ships[id].colours;
    assert.deepEqual(look.paint, [...CREW[c.first].rgb]);
    assert.deepEqual(look.sail, [...CREW[c.second].rgb]);
    assert.equal(look.pattern, id % 2 ? 'band' : 'plain');
  }
  for (const id of [0, 1, 7]) assert.deepEqual(lookIn(undefined, id), lookOf(id));
});

test('a seeded race of eight, armed and close together: blows struck, and none by a ship on her own side', () => {
  const planet = createPlanet(SEED), depth = (p: Vec3) => -planet.height(p);
  const waters = { chart: chart(depth), water: berthing(depth) }, start = startOf(planet);
  const south = scale(frameAt(start.at).north, -1);
  // eight in a line south of her berth, 30 m apart, every other one heading the other way
  const berths = Array.from({ length: 8 }, (_, k) => {
    const at = along(start.at, south, 30 * k).p, f = frameAt(at);
    return { at, heading: k % 2 ? f.east : scale(f.east, -1) };
  });
  const m: Match = { seed: 77, storm: () => calm(start.at), gun: { kind: 'cannon', rarity: 1 }, card: deal(77, 8), berths };
  const state = createState(planet, flat, waters, m);
  state.start(m, false);
  const side = (id: number) => id >> 1, strikes: Strike[] = [];
  for (let k = 0; k < 90 / STEP; k++) strikes.push(...state.advance({ course: null, throttle: 0 }, { aim: null, fire: false }).strikes);
  assert.ok(strikes.length > 10, `${strikes.length} blows struck`);
  const friendly = strikes.filter((s) => s.shooter !== s.struck && side(s.shooter) === side(s.struck));
  assert.deepEqual(friendly, [], 'no blow by her own side');
  assert.ok(state.sinkings().every((s) => s.by === null || side(s.by) !== side(s.id)));
});

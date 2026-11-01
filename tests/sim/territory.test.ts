// Territory, perks, Coins and gull deliveries, measured against PLAN.md's pass 1 lines.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reloadTime } from '../../src/sim/combat.ts';
import { canCall, priceOf } from '../../src/sim/economy.ts';
import { hurt } from '../../src/sim/harm.ts';
import { empty } from '../../src/sim/items.ts';
import { v3, type V3 } from '../../src/sim/math.ts';
import { PERK, hasPerk } from '../../src/sim/perks.ts';
import { RULE } from '../../src/sim/rules.ts';
import { createMatch } from '../../src/sim/setup.ts';
import { TERRITORY, advance, along, angleTo, apart, cellOf, tangentToward } from '../../src/sim/sphere.ts';
import { EVENT, GULL, PHASE, TICK, type MatchState } from '../../src/sim/state.ts';
import { COINS, DELIVERY, INK, ITEM, PARCELS, PERKS, SLOTS, WEAPONS } from '../../src/sim/tables.ts';
import { atHome, inkHome, squareMetres } from '../../src/sim/territory.ts';
import { LANDMARKS, REGIONS, REGION_COUNT } from '../../src/sim/world/index.ts';
import { events, openWater, place, quietMatch, run, sailOn, type Course } from './fixture.ts';

/** The Glass Sea, where no other ship of the quiet match waits within 450 m. */
const G = 8, T = 9;
const COURSE = openWater(G, 160, 60);

function spot(d: number, side = 0): Course {
  const pos = v3(), head = v3(), right = v3();
  advance(COURSE.pos, COURSE.head, d, pos, head);
  right.x = head.y * pos.z - head.z * pos.y;
  right.y = head.z * pos.x - head.x * pos.z;
  right.z = head.x * pos.y - head.y * pos.x;
  if (side !== 0) along(pos, right, side, pos);
  return { pos, head };
}

function at(): MatchState {
  const state = quietMatch();
  place(state, G, COURSE);
  return state;
}

/** Steers for each waypoint in turn, under full sail, moving on within `near` metres of it. */
function pilot(state: MatchState, i: number, points: V3[], near = 12) {
  let k = 0;
  const to = v3();
  return (j: number) => {
    if (j !== i) return null;
    const ship = state.ships[i];
    while (k < points.length - 1 && apart(ship.pos, points[k]) < near) k++;
    tangentToward(ship.pos, points[k], to);
    return sailOn({ steer: Math.max(-1.2, Math.min(1.2, angleTo(ship.head, to, ship.pos))) });
  };
}

/** Holds region r's landmark for ship i, or lets it go. */
const hold = (state: MatchState, r: number, i: number) => {
  state.owner[cellOf(TERRITORY, LANDMARKS[r].pos)] = i + 1;
};

// ---------------------------------------------------------------- territory

test('a ship lands in water of its own, and sailing a loop out of it and home claims what it encloses', (t) => {
  const state = at(), ship = state.ships[G];
  const home = inkHome(state, G);
  t.diagnostic(`home water ${home.toFixed(0)} m² (a ${INK.home} m circle is ${(Math.PI * INK.home * INK.home).toFixed(0)})`);
  assert.ok(Math.abs(home - Math.PI * INK.home * INK.home) < 0.1 * home);
  assert.ok(atHome(state, G));
  const coins = ship.coins;

  // to port: there are shallows 50 m to starboard
  const loop = [spot(120).pos, spot(120, -45).pos, spot(10, -45).pos, spot(0).pos];
  const claims: number[] = [];
  run(state, 40, pilot(state, G, loop), (s) => {
    for (const e of events(s, EVENT.claim)) if (e.ship === G) claims.push(e.amount);
    return claims.length > 0;
  });
  const held = squareMetres(ship.held);
  t.diagnostic(`claimed ${claims.map((c) => c.toFixed(0)).join(', ')} m²; holds ${held.toFixed(0)} m²; coins ${coins} → ${ship.coins}`);
  assert.equal(claims.length, 1, 'coming home closes the loop');
  assert.ok(claims[0] > 3000, 'and takes the water inside');
  assert.ok(Math.abs(held - home - claims[0]) < 1, 'the water held adds up');
  assert.ok(atHome(state, G));
  const claimCoins = Math.floor(claims[0] * INK.claim);
  assert.ok(ship.coins - coins >= claimCoins, 'claiming pays');
  const middle = spot(60, -22).pos;
  assert.equal(state.owner[cellOf(TERRITORY, middle)], G + 1, 'the middle of the loop takes her colour');
});

test('cutting a rival\'s trail costs it hull past the shield, and pays the cutter', (t) => {
  const state = at(), ship = state.ships[G];
  inkHome(state, G);
  ship.shield = 50;
  // G heads out of her home water, laying a trail; T comes across it from the side
  run(state, 5, (i) => (i === G ? sailOn() : null));
  assert.ok(ship.laid.length > 0, 'a ship outside its own water lays a trail');
  const cross = spot(30, -30), right = v3();
  right.x = cross.head.y * cross.pos.z - cross.head.z * cross.pos.y;
  right.y = cross.head.z * cross.pos.x - cross.head.x * cross.pos.z;
  right.z = cross.head.x * cross.pos.y - cross.head.y * cross.pos.x;
  place(state, T, { pos: cross.pos, head: right }, 10);
  const coins = state.ships[T].coins;
  const cuts: { by: number; amount: number }[] = [];
  run(state, 6, (i) => (i === T ? sailOn() : i === G ? sailOn() : null), (s) => {
    for (const e of events(s, EVENT.cut)) cuts.push({ by: e.by, amount: e.amount });
    return cuts.length > 0;
  });
  t.diagnostic(`cut by ${cuts[0]?.by}; G at ${ship.hull} hull, ${ship.shield} shield; T coins ${coins} → ${state.ships[T].coins}`);
  assert.equal(cuts[0]?.by, T, 'sailing across a trail cuts it');
  assert.equal(ship.laid.length, 0, 'and the trail is gone');
  assert.equal(ship.hull, 100 - INK.cut, 'the cut goes to the hull');
  assert.equal(ship.shield, 50, 'past the shield');
  assert.ok(state.ships[T].coins >= coins + INK.cutCoins);
});

test('ships slowly repair in their own water, once nobody has hit them for a while', (t) => {
  const state = at(), ship = state.ships[G];
  inkHome(state, G);
  ship.hull = 50;
  run(state, 4);
  t.diagnostic(`4 s at home: ${ship.hull.toFixed(2)}`);
  assert.ok(Math.abs(ship.hull - (50 + 4 * INK.repair)) < 0.1);

  hurt(state, G, 5, T, ITEM.cannon, null);
  const after = ship.hull;
  run(state, INK.quiet - 0.2);
  assert.equal(ship.hull, after, 'no mending under fire');
  run(state, 2.2);
  assert.ok(ship.hull > after);

  // away from home, nothing
  const away = at();
  away.ships[G].hull = 50;
  run(away, 4);
  assert.equal(away.ships[G].hull, 50);

  // Fast Repair doubles it
  const fast = at();
  inkHome(fast, G);
  hold(fast, PERK.fastRepair, G);
  fast.ships[G].hull = 50;
  run(fast, 4);
  t.diagnostic(`4 s at home with Fast Repair: ${fast.ships[G].hull.toFixed(2)}`);
  assert.ok(Math.abs(fast.ships[G].hull - (50 + 4 * INK.repair * PERKS.fastRepair)) < 0.2);
});

// ---------------------------------------------------------------- perks

test('holding a region\'s landmark gives its perk, for as long as it is held', () => {
  assert.equal(new Set(REGIONS.map((r) => r.perk)).size, REGION_COUNT, 'sixteen regions, sixteen perks');
  for (let r = 0; r < REGION_COUNT; r++) {
    const state = at(), ship = state.ships[G];
    assert.equal(ship.perks, 0);
    hold(state, r, G);
    run(state, TICK);
    assert.ok(hasPerk(ship, REGIONS[r].perk), `${REGIONS[r].perkName} for holding ${REGIONS[r].landmark}`);
    assert.deepEqual(events(state, EVENT.perkGained).map((e) => [e.ship, e.item]), [[G, r]]);
    hold(state, r, T);
    run(state, TICK);
    assert.ok(!hasPerk(ship, REGIONS[r].perk), 'lost with the landmark');
    assert.ok(hasPerk(state.ships[T], REGIONS[r].perk), 'to whoever takes it');
    assert.deepEqual(events(state, EVENT.perkLost).map((e) => [e.ship, e.item]), [[G, r]]);
  }
});

test('the rewrite\'s four perks work in their new regions', () => {
  assert.equal(REGIONS[PERK.fastReload].id, 'basaltStacks');
  assert.equal(REGIONS[PERK.fastRepair].id, 'fjords');
  assert.equal(REGIONS[PERK.cheapDeliveries].id, 'glassSea');
  assert.equal(REGIONS[PERK.fireShot].id, 'fireArchipelago');

  const state = at(), ship = state.ships[G];
  hold(state, PERK.fastReload, G);
  hold(state, PERK.cheapDeliveries, G);
  run(state, TICK);
  assert.ok(Math.abs(reloadTime(ship, ITEM.cannon, 0) - WEAPONS[ITEM.cannon].reload * PERKS.fastReload) < 1e-9, 'Fast Reload: about 30% faster');
  assert.deepEqual(PARCELS.map((_, k) => priceOf(ship, k)), PARCELS.map((p) => Math.round(p.cost * PERKS.cheapDeliveries)), 'Cheap Deliveries: about 30% less');
  // Fast Repair and Fire Shot are measured where they act: mending at home above, and burning in the combat tests
});

// ---------------------------------------------------------------- coins and the gull

test('Coins start at zero every match and are earned in play', (t) => {
  for (const seed of [1, 2, 3]) {
    const fresh = createMatch({ seed, rule: RULE.none, hour: 12, tilt: 0 });
    assert.ok(fresh.ships.every((s) => s.coins === 0), 'no coins carried in');
  }
  const state = at(), ship = state.ships[G];
  run(state, 11, (i) => (i === G ? sailOn() : null));
  t.diagnostic(`sailed ${ship.sailed.toFixed(1)} m for ${ship.coins} coins`);
  assert.equal(ship.coins, Math.floor(ship.sailed / COINS.metres), 'a coin for every 40 m sailed');
  assert.ok(ship.coins >= 3);

  // a kill pays 12
  const kill = at();
  place(kill, T, spot(40));
  kill.ships[T].hull = 5;
  hurt(kill, T, 20, G, ITEM.cannon, null);
  run(kill, TICK);
  assert.equal(kill.ships[T].phase, PHASE.sunk);
  assert.equal(kill.ships[G].coins, COINS.kill);
  assert.deepEqual(events(kill, EVENT.coins).map((e) => [e.ship, e.amount]), [[G, COINS.kill]]);
});

test('coins are spent on a gull delivery, which the gull flies out to the ship', (t) => {
  const state = at(), ship = state.ships[G];
  for (let s = 1; s < SLOTS; s++) ship.slots[s] = empty();
  ship.coins = PARCELS[0].cost - 1;
  run(state, TICK, (i) => (i === G ? sailOn({ throttle: 0, hail: 0 }) : null));
  assert.equal(ship.gull.state, GULL.home, 'not without the coins');
  assert.equal(ship.coins, PARCELS[0].cost - 1);

  ship.coins = 30;
  const called = { tick: 0, from: v3() }, arrived = { tick: -1, at: v3() };
  run(state, TICK, (i) => (i === G ? sailOn({ throttle: 0, hail: 0 }) : null), (s) => {
    const e = events(s, EVENT.deliveryCalled)[0];
    if (e) {
      called.tick = s.tick;
      called.from = { ...e.at };
    }
  });
  assert.equal(ship.coins, 30 - PARCELS[0].cost, 'the parcel is paid for');
  assert.equal(ship.gull.state, GULL.flying);
  assert.ok(!canCall(ship, 0), 'one gull at a time');
  const roost = LANDMARKS.reduce((a, l) => (apart(l.pos, ship.pos) < apart(a.pos, ship.pos) ? l : a));
  assert.ok(apart(called.from, roost.pos) < 1, 'the gull leaves the nearest landmark');

  const far = apart(roost.pos, ship.pos);
  run(state, far / DELIVERY.speed + 2, () => null, (s) => {
    const e = events(s, EVENT.deliveryArrived)[0];
    if (e) {
      arrived.tick = s.tick;
      arrived.at = { ...e.at };
      return true;
    }
  });
  const flight = (arrived.tick - called.tick) * TICK;
  t.diagnostic(`from ${roost.name ?? 'the landmark'} ${far.toFixed(0)} m off: ${flight.toFixed(1)} s`);
  assert.ok(arrived.tick > 0, 'the gull arrives');
  assert.ok(Math.abs(flight - (far - DELIVERY.ahead) / DELIVERY.speed) < 1.5, `at ${DELIVERY.speed} m/s`);
  assert.ok(Math.abs(apart(arrived.at, ship.pos) - DELIVERY.ahead) < 1, 'and drops the parcel just ahead');
  const parcel = state.loot.filter((l) => apart(l.at, arrived.at) < 5);
  assert.deepEqual(parcel.map((l) => l.item.kind).sort(), [ITEM.smallShield, ITEM.repairKit].sort());

  run(state, 3, (i) => (i === G ? sailOn({ throttle: 0.3 }) : null));
  assert.ok(ship.slots.some((s) => s.kind === ITEM.smallShield) && ship.slots.some((s) => s.kind === ITEM.repairKit), 'she picks it up');
  assert.equal(ship.gull.state, GULL.rest);
  run(state, DELIVERY.rest);
  assert.equal(ship.gull.state, GULL.home, 'and the gull is ready again after a rest');
});

// Weapons, the hotbar, the shield and hull, consumables and loot, measured against PLAN.md's pass 1 lines.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { falloff, reloadTime } from '../../src/sim/combat.ts';
import { hurt } from '../../src/sim/harm.ts';
import { empty, give, rollItem, startUse, useItem, weaponItem } from '../../src/sim/items.ts';
import { rngFrom, v3, type V3 } from '../../src/sim/math.ts';
import { PERK } from '../../src/sim/perks.ts';
import { TERRITORY, advance, along, apart, cellOf } from '../../src/sim/sphere.ts';
import { CAUSE, EVENT, FLAG, PHASE, TICK, type MatchState, type Shot } from '../../src/sim/state.ts';
import {
  BURN, EQUIP, ITEM, LOOT, RARITIES, RARITY, SLOTS, USES, WEAPONS, WEAPON_KINDS, isUse, isWeapon,
} from '../../src/sim/tables.ts';
import { LANDMARKS, LOOT_SPOTS, navigable } from '../../src/sim/world/index.ts';
import { events, openWater, place, quietMatch, run, sailOn, type Course } from './fixture.ts';

/** The Glass Sea, where no other ship of the quiet match waits within 450 m: G shoots, T is the target. */
const G = 8, T = 9;
const COURSE = openWater(G, 160, 60);

/** A spot `d` metres along the course, `side` metres abeam to starboard, heading the same way. */
function spot(d: number, side = 0): Course {
  const pos = v3(), head = v3(), right = v3();
  advance(COURSE.pos, COURSE.head, d, pos, head);
  right.x = head.y * pos.z - head.z * pos.y;
  right.y = head.z * pos.x - head.x * pos.z;
  right.z = head.x * pos.y - head.y * pos.x;
  if (side !== 0) along(pos, right, side, pos);
  return { pos, head };
}

/** G at the start of the course with a hotbar holding only `item`, and T placed at `at`. */
function duel(at: Course | null, ...items: ReturnType<typeof empty>[]): MatchState {
  const state = quietMatch();
  place(state, G, COURSE);
  const ship = state.ships[G];
  for (let s = 0; s < SLOTS; s++) ship.slots[s] = items[s] ?? empty();
  if (at) {
    assert.ok(navigable(at.pos), 'the target sits on water');
    place(state, T, at);
  }
  return state;
}

/** G holds still and fires at a point, everyone else holds still. */
const shoot = (aim: V3, aimY = 2, over: Partial<ReturnType<typeof sailOn>> = {}) => (i: number) =>
  i === G ? sailOn({ throttle: 0, fire: true, aim, aimY, ...over }) : null;

type Seen = { tick: number; e: MatchState['events'][number] };

/** Runs the match and gathers every event of these kinds, with the tick it was raised on. */
function watch(state: MatchState, seconds: number, drive: Parameters<typeof run>[2], kinds: number[]): Seen[] {
  const out: Seen[] = [];
  run(state, seconds, drive, (s) => {
    for (const e of s.events) if (kinds.includes(e.kind)) out.push({ tick: s.tick, e });
  });
  return out;
}

// ---------------------------------------------------------------- weapons

test('six weapon classes in five rarities, all aimed, with ranges tuned to the 240 m sightline', (t) => {
  assert.deepEqual([...WEAPON_KINDS].sort(), [ITEM.cannon, ITEM.scatter, ITEM.harpoon, ITEM.mortar, ITEM.repeater, ITEM.broadside].sort());
  assert.equal(RARITIES, 5);
  for (let r = 1; r < RARITIES; r++) {
    assert.ok(RARITY.damage[r] > RARITY.damage[r - 1], 'each rarity hits harder');
    assert.ok(RARITY.reload[r] < RARITY.reload[r - 1], 'and reloads faster');
  }
  const ranges = WEAPON_KINDS.map((k) => WEAPONS[k].range);
  t.diagnostic(`ranges ${ranges.join(', ')} m`);
  assert.ok(Math.max(...ranges) <= 240 && Math.max(...ranges) >= 200, 'the longest reaches the sightline, not past it');
  assert.ok(Math.min(...ranges) >= 60, 'and the shortest is still a fight at a distance');
  assert.ok(WEAPON_KINDS.every((k) => WEAPONS[k].mag >= 1 && WEAPONS[k].reload > 0), 'every class has a magazine and a reload');
});

test('every class fires, flies for a time and hits', (t) => {
  const cases = [
    { kind: ITEM.cannon, d: 100 }, { kind: ITEM.scatter, d: 35 }, { kind: ITEM.harpoon, d: 150 },
    { kind: ITEM.mortar, d: 100 }, { kind: ITEM.repeater, d: 80 }, { kind: ITEM.broadside, d: 40, side: true },
  ];
  for (const c of cases) {
    const target = c.side ? spot(0, c.d) : spot(c.d);
    const state = duel(target, weaponItem(c.kind, 0)), w = WEAPONS[c.kind];
    const seen = watch(state, 0.05, shoot(state.ships[T].pos), [EVENT.fire]);
    const shotsOut = state.shots.length;
    const hits = watch(state, 3, (i) => (i === G ? sailOn({ throttle: 0, aim: state.ships[T].pos, aimY: 2 }) : null), [EVENT.hit]);
    const fired = seen.find((x) => x.e.kind === EVENT.fire)!;
    const onT = hits.filter((x) => x.e.ship === T);
    assert.ok(fired, `${c.kind} fires`);
    assert.ok(onT.length > 0, `${c.kind} hits a ship ${c.d} m off`);
    const flight = (onT[0].tick - fired.tick) * TICK;
    t.diagnostic(`kind ${c.kind}: ${shotsOut} shot(s) out, ${onT.length} hit(s), first after ${flight.toFixed(2)} s, ${onT.map((x) => x.e.amount.toFixed(1)).join('/')}`);
    assert.ok(flight > 0, 'shots take time to arrive');
    if (c.kind === ITEM.broadside) {
      assert.equal(shotsOut, 2 * w.sides, 'the broadside fires from both sides at once');
      assert.equal(fired.e.flag, 3, 'and says so');
      assert.equal(onT.length, w.sides, 'one side all lands on a ship abeam');
    } else if (c.kind === ITEM.scatter) {
      assert.equal(shotsOut, w.pellets, 'the scattergun fires all its pellets');
      assert.ok(onT.length >= w.pellets / 2, 'and most land at half its range');
    } else if (!w.lob) {
      // the shot meets the target's stern, about 12 m short of where it's aimed
      const expect = (c.d - 12) / w.speed;
      assert.ok(Math.abs(flight - expect) <= 2 * TICK, `a ${w.speed} m/s shot takes about ${expect.toFixed(2)} s`);
      assert.ok(Math.abs(onT[0].e.amount - w.damage) < 1e-9 || onT[0].e.flag & FLAG.crit, 'full damage inside 60% of range');
    } else {
      assert.ok(flight >= 0.9 - 1e-9, 'the mortar lobs, and takes its time');
      assert.ok(onT[0].e.amount > 0.4 * w.damage, 'and its burst hurts a ship it lands on');
    }
  }
});

test('rarer weapons hit harder, and the head of the sail takes a critical hit', (t) => {
  const at = spot(100);
  const hitWith = (rarity: number, aimY: number, shield = 50) => {
    const state = duel(at, weaponItem(ITEM.harpoon, rarity));
    state.ships[T].shield = shield;
    const hits = watch(state, 1.2, shoot(state.ships[T].pos, aimY), [EVENT.hit, EVENT.shieldBreak]);
    return { state, hits: hits.filter((x) => x.e.ship === T) };
  };
  const common = hitWith(0, 2).hits[0].e, legend = hitWith(4, 2).hits[0].e;
  t.diagnostic(`harpoon at 100 m: common ${common.amount}, legendary ${legend.amount.toFixed(1)}`);
  assert.equal(common.amount, WEAPONS[ITEM.harpoon].damage);
  assert.ok(Math.abs(legend.amount - WEAPONS[ITEM.harpoon].damage * RARITY.damage[4]) < 1e-9);
  assert.equal(common.flag & FLAG.crit, 0, 'the hull is no weak spot');

  const { state, hits } = hitWith(0, 15, 100);
  const crit = hits.find((x) => x.e.kind === EVENT.hit)!.e;
  const expect = WEAPONS[ITEM.harpoon].damage * WEAPONS[ITEM.harpoon].crit;
  t.diagnostic(`at the head of the sail: ${crit.amount} (${crit.shield} shield, ${crit.hull} hull), flag ${crit.flag}`);
  assert.ok(crit.flag & FLAG.crit, 'the head of the sail is the weak spot');
  assert.ok(Math.abs(crit.amount - expect) < 1e-9);
  assert.equal(crit.shield, 100, 'damage takes the shield first');
  assert.ok(Math.abs(crit.hull - (expect - 100)) < 1e-9, 'and says how much went to the hull');
  assert.ok(crit.flag & FLAG.broke, 'the hit that breaks the shield says so');
  assert.ok(hits.some((x) => x.e.kind === EVENT.shieldBreak), 'and breaking it raises its own event');
  assert.equal(state.ships[T].shield, 0);
});

test('damage holds to 60% of range, then falls to half at full range', () => {
  const s = { travelled: 0, range: 200 } as Shot;
  const at = (k: number) => falloff({ ...s, travelled: k * s.range });
  assert.equal(at(0.3), 1);
  assert.equal(at(0.6), 1);
  assert.ok(Math.abs(at(0.8) - 0.75) < 1e-9);
  assert.equal(at(1), 0.5);
  assert.equal(at(1.1), 0.5);
});

test('magazines empty and reload', (t) => {
  const far = spot(150).pos;
  const state = duel(null, weaponItem(ITEM.cannon, 0)), w = WEAPONS[ITEM.cannon];
  const seen = watch(state, 6.5, shoot(far, 0), [EVENT.fire, EVENT.empty, EVENT.reload]);
  const fires = seen.filter((x) => x.e.kind === EVENT.fire), empt = seen.find((x) => x.e.kind === EVENT.empty)!;
  const reloads = seen.filter((x) => x.e.kind === EVENT.reload);
  const gaps = fires.slice(1).map((x, k) => (x.tick - fires[k].tick) * TICK);
  t.diagnostic(`${fires.length} shots before the reload, every ${gaps[0].toFixed(3)} s; reload ${reloads[0].e.amount} s`);
  assert.equal(fires.filter((x) => x.tick <= empt.tick).length, w.mag, 'a full magazine before it runs dry');
  assert.ok(gaps.slice(0, w.mag - 1).every((g) => Math.abs(g - w.interval) <= TICK), 'shots come at the weapon\'s interval');
  assert.equal(reloads[0].tick, empt.tick, 'running dry starts the reload');
  assert.ok(Math.abs(reloads[0].e.amount - w.reload) < 1e-9);
  const done = reloads.find((x) => x.e.flag & FLAG.done)!;
  assert.ok(done, 'the reload finishes');
  assert.ok(Math.abs((done.tick - reloads[0].tick) * TICK - w.reload) <= TICK, 'after the reload time');
  assert.ok(fires.some((x) => x.tick > done.tick), 'and she fires again');

  // a part-used magazine reloads on asking, and rarer guns reload faster
  const state2 = duel(null, weaponItem(ITEM.cannon, 4));
  run(state2, 1, shoot(far, 0));
  const left = state2.ships[G].slots[0].n;
  const seen2 = watch(state2, 0.05, shoot(far, 0, { fire: false, reload: true }), [EVENT.reload]);
  assert.ok(left < w.mag && left > 0);
  assert.equal(seen2.length, 1);
  assert.ok(Math.abs(seen2[0].e.amount - w.reload * RARITY.reload[4]) < 1e-9, 'a legendary reloads in 80% of the time');
  run(state2, 2);
  assert.equal(state2.ships[G].slots[0].n, w.mag);
  assert.equal(reloadTime(state2.ships[G], ITEM.cannon, 0), w.reload);
});

// ---------------------------------------------------------------- the hotbar

test('the hotbar: 5 slots, and select, swap and drop', (t) => {
  const fresh = quietMatch();
  assert.ok(fresh.ships.every((s) => s.slots.length === 5), 'five slots');
  assert.ok(fresh.ships.every((s) => s.slots[0].kind === ITEM.cannon && s.slots.slice(1).every((x) => x.kind === ITEM.none)), 'a cannon to start');

  // select: the new weapon takes a moment to bring up
  const far = spot(150).pos;
  const a = duel(null, weaponItem(ITEM.cannon, 0), empty(), weaponItem(ITEM.harpoon, 0));
  const seen = watch(a, 1, shoot(far, 0, { select: 2 }), [EVENT.select, EVENT.fire]);
  const sel = seen.find((x) => x.e.kind === EVENT.select)!, first = seen.find((x) => x.e.kind === EVENT.fire)!;
  const ready = (first.tick - sel.tick + 1) * TICK;
  t.diagnostic(`select to slot ${sel.e.amount}; first shot ${ready.toFixed(3)} s on`);
  assert.equal(sel.e.amount, 2);
  assert.equal(sel.e.item, ITEM.harpoon);
  assert.equal(a.ships[G].sel, 2);
  assert.equal(first.e.item, ITEM.harpoon, 'the selected weapon fires');
  assert.ok(ready >= EQUIP - 1e-9 && ready <= EQUIP + 2 * TICK, 'after the equip time');

  // swap: the selected item moves to the other slot, and stays selected
  const b = duel(null, weaponItem(ITEM.cannon, 1), empty(), empty(), weaponItem(ITEM.harpoon, 3));
  const sw = watch(b, TICK, shoot(far, 0, { fire: false, swap: 3 }), [EVENT.select]);
  assert.equal(sw.length, 1);
  assert.equal(sw[0].e.flag, 1, 'a swap says so');
  assert.equal(b.ships[G].sel, 3);
  assert.equal(b.ships[G].slots[3].kind, ITEM.cannon);
  assert.equal(b.ships[G].slots[0].kind, ITEM.harpoon);

  // drop: over the stern, where another ship can take it at once and the dropper only after a moment
  const c = duel(spot(-17), weaponItem(ITEM.mortar, 2));
  const dropped = watch(c, TICK, (i) => (i === G ? sailOn({ throttle: 0, drop: true }) : null), [EVENT.drop, EVENT.pickup]);
  assert.equal(dropped[0].e.kind, EVENT.drop);
  assert.equal(c.ships[G].slots[0].kind, ITEM.none, 'the slot empties');
  const got = dropped.find((x) => x.e.kind === EVENT.pickup);
  assert.ok(got && got.e.ship === T && c.ships[T].slots.some((x) => x.kind === ITEM.mortar && x.rarity === 2), 'the ship astern takes it');

  const d = duel(null, weaponItem(ITEM.mortar, 2));
  watch(d, TICK, (i) => (i === G ? sailOn({ throttle: 0, drop: true }) : null), []);
  const loot = d.loot[0];
  assert.ok(Math.abs(apart(loot.at, d.ships[G].pos) - 8) < 0.2, 'it lands 8 m astern');
  const t0 = d.tick;
  const back = watch(d, 1.5, () => null, [EVENT.pickup]);
  const after = (back[0].tick - t0 + 1) * TICK;
  t.diagnostic(`the dropper takes it back after ${after.toFixed(2)} s`);
  assert.ok(after >= LOOT.settle - 1e-9, 'not caught straight back');
});

test('a full hotbar takes loot only on asking, swapping out the selected item', () => {
  const state = duel(null, ...[ITEM.cannon, ITEM.harpoon, ITEM.mortar, ITEM.repeater, ITEM.scatter].map((k) => weaponItem(k, 0)));
  const ship = state.ships[G];
  state.loot.push({ id: state.nextId++, at: spot(6).pos, v: v3(), item: weaponItem(ITEM.broadside, 4), age: 10, from: -1, spot: -1 });
  run(state, 0.5);
  assert.equal(state.loot.length, 1, 'no room, so it stays on the water');
  const seen = watch(state, TICK, (i) => (i === G ? sailOn({ throttle: 0, take: true }) : null), [EVENT.pickup, EVENT.drop]);
  assert.deepEqual(seen.map((x) => x.e.kind).sort(), [EVENT.pickup, EVENT.drop].sort());
  assert.equal(ship.slots[0].kind, ITEM.broadside);
  assert.equal(state.loot.length, 1);
  assert.equal(state.loot[0].item.kind, ITEM.cannon, 'the cannon goes over the side in its place');
});

// ---------------------------------------------------------------- shield and hull

test('ships start with no shield; the shield takes damage first; the Storm takes only hull', () => {
  const state = quietMatch();
  assert.ok(state.ships.every((s) => s.shield === 0 && s.hull === 100), 'no shield at the start');
  const ship = state.ships[G];
  ship.shield = 30;
  state.events.length = 0;
  hurt(state, G, 50, T, ITEM.cannon, null);
  const hit = events(state, EVENT.hit)[0];
  assert.deepEqual([hit.amount, hit.shield, hit.hull], [50, 30, 20]);
  assert.ok(hit.flag & FLAG.broke);
  assert.equal(events(state, EVENT.shieldBreak).length, 1);
  assert.deepEqual([ship.shield, ship.hull], [0, 80]);

  ship.shield = 50;
  state.events.length = 0;
  hurt(state, G, 10, -1, CAUSE.storm, null);
  const storm = events(state, EVENT.hit)[0];
  assert.deepEqual([storm.shield, storm.hull, ship.shield, ship.hull], [0, 10, 50, 70], 'the Storm goes straight to the hull');
  assert.equal(events(state, EVENT.shieldBreak).length, 0);
});

test('a ship at no hull sinks and spills its hold; the loot is there for the taking', (t) => {
  const state = duel(spot(40), weaponItem(ITEM.harpoon, 3), useItem(ITEM.smallShield, 2), weaponItem(ITEM.cannon, 1));
  state.ships[G].slots[0].n = 0;
  hurt(state, G, 150, T, ITEM.cannon, null);
  run(state, TICK);
  assert.equal(state.ships[G].phase, PHASE.sunk);
  assert.equal(state.ships[G].by, T, 'the sinking is credited');
  const spilt = state.loot.filter((l) => l.from === G);
  t.diagnostic(`spilt ${spilt.map((l) => `${l.item.kind}x${l.item.n}`).join(', ')}`);
  assert.deepEqual(spilt.map((l) => l.item.kind).sort((a, b) => a - b), [ITEM.cannon, ITEM.harpoon, ITEM.smallShield]);
  assert.equal(spilt.find((l) => l.item.kind === ITEM.harpoon)!.item.n, WEAPONS[ITEM.harpoon].mag, 'weapons come up loaded');
  assert.equal(spilt.find((l) => l.item.kind === ITEM.smallShield)!.item.n, 2);
  assert.ok(state.ships[G].slots.every((s) => s.kind === ITEM.none));

  // T comes up over the wreck
  place(state, T, COURSE);
  const coins = state.ships[T].coins;
  const taken = watch(state, 0.2, () => null, [EVENT.pickup]).filter((x) => x.e.ship === T);
  t.diagnostic(`T picked up ${taken.map((x) => x.e.item).join(', ')}`);
  assert.equal(taken.length, spilt.length, 'ships pick items up');
  assert.equal(state.ships[T].coins, coins + taken.length, 'and every pickup pays a coin');
  assert.ok(state.ships[T].slots.some((x) => x.kind === ITEM.smallShield && x.n === 2));
});

// ---------------------------------------------------------------- consumables

test('the four consumables use the values, caps, use times and stacks in PLAN.md', (t) => {
  const plan: Record<number, [number, number, number, number]> = {
    [ITEM.smallShield]: [25, 50, 1.0, 6], [ITEM.bigShield]: [50, 100, 2.6, 3], [ITEM.repairKit]: [15, 75, 1.8, 8], [ITEM.fullRepair]: [100, 100, 5.0, 2],
  };
  for (const kind of [ITEM.smallShield, ITEM.bigShield, ITEM.repairKit, ITEM.fullRepair]) {
    const u = USES[kind], [value, cap, time, stack] = plan[kind];
    assert.deepEqual([u.shield || u.hull, u.cap, u.time, u.stack], [value, cap, time, stack]);

    const state = duel(null, useItem(kind, 3)), ship = state.ships[G];
    ship.hull = u.hull > 0 ? 10 : 100;
    const seen = watch(state, 3 * time + 1, (i) => (i === G ? sailOn({ throttle: 0, fire: true }) : null),
      [EVENT.useStart, EVENT.useDone, EVENT.blocked]);
    const starts = seen.filter((x) => x.e.kind === EVENT.useStart), dones = seen.filter((x) => x.e.kind === EVENT.useDone);
    const took = (dones[0].tick - starts[0].tick + 1) * TICK;
    const gains = dones.map((x) => (u.shield > 0 ? x.e.shield : x.e.hull));
    t.diagnostic(`kind ${kind}: ${dones.length} used, ${took.toFixed(2)} s each, gains ${gains.join(', ')}; shield ${ship.shield}, hull ${ship.hull}; ${seen.filter((x) => x.e.kind === EVENT.blocked).length} blocked`);
    assert.ok(Math.abs(took - time) <= TICK + 1e-9, 'using one takes its time');
    assert.equal(gains[0], Math.min(value, cap - (u.hull > 0 ? 10 : 0)));
    assert.ok((u.shield > 0 ? ship.shield : ship.hull) <= cap, 'never past its cap');
    if (cap < 100 || u.shield > 0) assert.equal(u.shield > 0 ? ship.shield : ship.hull, Math.min(cap, (u.hull > 0 ? 10 : 0) + value * dones.length));

    const hold = duel(null);
    const left = give(hold.ships[G], useItem(kind, 100));
    assert.equal(left, 100 - SLOTS * stack, `a slot holds ${stack}`);
    assert.ok(hold.ships[G].slots.every((s) => s.kind === kind && s.n === stack));
  }
});

test('a consumable is wasted on a full ship, and a hit or a swap interrupts one but the Storm and fire do not', () => {
  const blocked = duel(null, useItem(ITEM.smallShield, 3));
  blocked.ships[G].shield = 50;
  blocked.events.length = 0;
  assert.equal(startUse(blocked, G), false);
  assert.equal(events(blocked, EVENT.blocked).length, 1, 'a shield charge does nothing at its cap, and says so');

  const using = (cause: number | 'swap' | 'select') => {
    const state = duel(null, useItem(ITEM.bigShield, 2), weaponItem(ITEM.cannon, 0)), ship = state.ships[G];
    assert.ok(startUse(state, G));
    run(state, 1);
    let cancels = 0;
    if (typeof cause === 'number') {
      state.events.length = 0;
      hurt(state, G, 1, cause === ITEM.cannon ? T : -1, cause, null);
      cancels = events(state, EVENT.useCancel).length;
    } else {
      const ask = cause === 'swap' ? { swap: 1 } : { select: 1 };
      const seen = watch(state, TICK, (i) => (i === G ? sailOn({ throttle: 0, ...ask }) : null), [EVENT.useCancel]);
      cancels = seen.length;
    }
    run(state, 2);
    return { cancels, shield: ship.shield };
  };
  for (const cause of [ITEM.cannon, 'swap', 'select'] as const) {
    const r = using(cause);
    assert.equal(r.cancels, 1, `${cause} interrupts the use`);
    assert.equal(r.shield, 0, 'and nothing is gained');
  }
  for (const cause of [CAUSE.storm, CAUSE.burn, CAUSE.ash]) {
    const r = using(cause);
    assert.equal(r.cancels, 0, `cause ${cause} wears steadily and does not interrupt`);
    assert.equal(r.shield, 50);
  }
});

// ---------------------------------------------------------------- loot and fire

test('each match fills the loot spots with items, by rarity', (t) => {
  const state = quietMatch({ loot: true });
  const filled = new Set(state.loot.map((l) => l.spot));
  t.diagnostic(`${state.loot.length} items on ${LOOT_SPOTS.length} spots`);
  assert.ok(LOOT_SPOTS.length > 0);
  for (let s = 0; s < LOOT_SPOTS.length; s++) assert.ok(filled.has(s), `spot ${s} has loot`);
  assert.ok(state.loot.length <= 2 * LOOT_SPOTS.length);

  const rng = rngFrom(99), n = 20000, by = new Array(RARITIES).fill(0);
  let weapons = 0;
  for (let k = 0; k < n; k++) {
    const it = rollItem(state, rng);
    if (isWeapon(it.kind)) {
      weapons++;
      by[it.rarity]++;
    } else assert.ok(isUse(it.kind) && it.n === LOOT.counts[it.kind]);
  }
  const total = LOOT.weights.reduce((a, b) => a + b, 0);
  t.diagnostic(`weapons ${(weapons / n).toFixed(3)}; rarities ${by.map((x) => (x / weapons).toFixed(3)).join(', ')}`);
  assert.ok(Math.abs(weapons / n - LOOT.weapon) < 0.02);
  for (let r = 0; r < RARITIES; r++) assert.ok(Math.abs(by[r] / weapons - LOOT.weights[r] / total) < 0.02, `rarity ${r} at its weight`);
});

test('a burning ship loses 3 points a second, through the shield first', () => {
  const state = duel(spot(100), weaponItem(ITEM.harpoon, 0));
  // G holds the landmark that gives Fire Shot
  state.owner[cellOf(TERRITORY, LANDMARKS[PERK.fireShot].pos)] = G + 1;
  let ablaze = 0;
  run(state, 1, shoot(state.ships[T].pos), (s) => (ablaze += events(s, EVENT.ablaze).length) > 0);
  assert.equal(ablaze, 1, 'Fire Shot sets the target ablaze');
  const ship = state.ships[T];
  assert.ok(ship.burn > 0);
  ship.shield = 5;
  const hull = ship.hull;
  run(state, BURN.fireShot + 0.5);
  assert.equal(ship.burn, 0, 'the fire burns out');
  assert.equal(ship.shield, 0);
  const lost = hull - ship.hull + 5;
  assert.ok(Math.abs(lost - BURN.rate * BURN.fireShot) < BURN.rate * 2 * TICK, `about 3 a second for 3 seconds: ${lost.toFixed(2)}`);
});

// WP9 part A, items, headless: every fitting and every consumable at the first and the last pigment tier; chests taken
// by sailing over them, their three offers and the choice; the loot pool by tier, rank and region richness; chests
// dropped by a swap and by a sinking; stacking; the gull's seam (deliver); the starting fittings by rank; the Arch and
// the Great Lagoon; determinism, snapshot/resume with chests, kegs and shells afloat, and the tick's cost.
//   node --test tests/sim/items.test.ts
import { cpuNow } from '../cpu.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { combat, damage } from '../../src/sim/combat.ts';
import { sink } from '../../src/sim/end.ts';
import { seaFor } from '../../src/sim/environment.ts';
import { FLAG, idleInput, type ShipInput } from '../../src/sim/input.ts';
import {
  OFFERS, afloatChest, bestPick, canTake, chestTier, crowsNest, deliver, items, lookout, poolTop, startingFittings, sternGlass, worth,
} from '../../src/sim/items.ts';
import { step } from '../../src/sim/match.ts';
import { addScaled, cross, dot, normalize, v3 } from '../../src/sim/math.ts';
import { newTrim, scald, settledSpeed, trim } from '../../src/sim/sailing.ts';
import { R, TERRITORY, cellDir, cellOf, neighbor } from '../../src/sim/sphere.ts';
import {
  CAUSE, EVENT, PHASE, SAIL, SHIPS, TICK, createMatch, decodeMatch, encodeMatch, fullHull, matchHash, type Happening, type MatchState,
  type Outfit,
} from '../../src/sim/state.ts';
import {
  BATTERY, BOWS, CHASERS, CONSUMABLE, CONSUMABLES, COPPER, DOUBLED_PLANKING, FITTING, FORM, FORMS, GUNS, KEGS, LATEEN_MIZZEN, LOOKOUT, LOOT,
  MORTAR, PERK, PUMPS, RAM, SIGHT, SLOT, SPARE_CANVAS, START_FITTINGS, STERN_GLASS, STORM_SAILS, TRIM, type Gun,
} from '../../src/sim/tables.ts';
import { breakTrail, chart } from '../../src/sim/territory.ts';
import { eyeReach, newSight, survey } from '../../src/sim/visibility.ts';
import { ZONE } from '../../src/sim/world/geography.ts';
import { REGIONS } from '../../src/sim/world/regions.ts';
import { scriptedInputs, world } from './vectors.ts';

const SEED = 20261024, W = world(), sea = seaFor(W, SEED), SIGHTS = Array.from({ length: SHIPS }, newSight);
const FIRST = 0, LAST = 4, TIERS_TESTED = [FIRST, LAST], NONE = { kind: FITTING.none, tier: 0 };
const S = (seconds: number): number => Math.round(seconds / TICK);
const near = (a: number, b: number, eps = 1e-9): void => assert.ok(Math.abs(a - b) <= eps, `${a} is not ${b}`);
const fitted = (slot: number, kind: number, tier = 0): { kind: number; tier: number }[] =>
  START_FITTINGS.map((k, s) => (s === slot ? { kind, tier } : { kind: k, tier: 0 }));
const unarmed = (o: Outfit = {}): Outfit => ({ ...o, fittings: fitted(SLOT.broadside, FITTING.none) });

/** Every ship's input: idle but for the player's and ship 1's changes. */
const inputs = (player: Partial<ShipInput> = {}, rival: Partial<ShipInput> = {}): ShipInput[] =>
  Array.from({ length: SHIPS }, (_, i) => ({ ...idleInput(), ...(i === 0 ? player : i === 1 ? rival : {}) }));
const IDLE = inputs();

/** Ships 0 and 1 at sea where the fleet starts, sailing but dead in the water, ship 1 unarmed unless outfitted; the rest out of the match. */
function duel(fleet: Outfit[] = [], rank = 1): MatchState {
  const s = createMatch({ seed: SEED, fleet: Array.from({ length: SHIPS }, (_, i) => fleet[i] ?? (i === 1 ? unarmed() : {})), rank });
  s.ships.forEach((ship, i) => {
    ship.phase = i < 2 ? PHASE.sailing : PHASE.sunk;
    ship.speed = 0;
  });
  return s;
}

/** Ship j `ahead` u before ship `ref`'s bow and `abeam` u to its starboard, heading as it heads. */
function place(s: MatchState, j: number, ahead: number, abeam: number, ref = 0): void {
  const a = s.ships[ref], b = s.ships[j], star = cross(v3(), a.head, a.pos);
  normalize(addScaled(b.pos, addScaled(b.pos, a.pos, a.head, ahead / R), star, abeam / R));
  normalize(addScaled(b.head, a.head, b.pos, -dot(a.head, b.pos)));
  b.was = { ...b.pos };
  b.wasHead = { ...b.head };
}

/** One tick of what items touch, as the step runs it: sight, combat, items. */
function tick(s: MatchState, ins: ShipInput[] = IDLE): void {
  s.events.length = 0;
  survey(sea, s, SIGHTS);
  combat(sea, s, SIGHTS);
  items(sea, s, ins, SIGHTS);
  s.tick++;
}

/** `seconds` of ticks; the events they raised. */
function run(s: MatchState, seconds: number, ins: ShipInput[] = IDLE): Happening[] {
  const seen: Happening[] = [];
  for (let n = 0; n < S(seconds); n++) {
    tick(s, ins);
    seen.push(...s.events);
  }
  return seen;
}
const once = (s: MatchState, ins: ShipInput[] = IDLE): Happening[] => run(s, TICK, ins);
const count = (ev: Happening[], kind: number, ship = 0): number => ev.filter((e) => e.kind === kind && e.ship === ship).length;

/** A landmark's index by its perk, and its marker cell. */
const landmark = (perk: string): number => sea.geo.landmarks.findIndex((l) => l.perk === perk);

// ---------------------------------------------------------------------------------------------------------------
// Fittings, slot by slot.

test('the bow: the iron ram strikes hardest, the cutwater cuts the trail and stops a new one, each stronger by tier', () => {
  const rammed = (kind: number, tier: number) => {
    const s = duel([{ fittings: fitted(SLOT.bow, kind, tier) }, unarmed()]);
    place(s, 1, 2, 0);
    const a = s.ships[0], b = s.ships[1], c = cellOf(TERRITORY, b.pos), hull = b.hull;
    b.laid = [c];
    s.trail[c] = 2;
    a.bump = 3;
    a.bumped = 1;
    a.bumpOn = 1;
    const ev = once(s);
    return { hurt: hull - b.hull, laid: b.laid.length, cut: b.cut, broken: ev.some((e) => e.kind === EVENT.broken && e.ship === 1 && e.by === 0) };
  };
  for (const tier of TIERS_TESTED) {
    for (const kind of [FITTING.stemPost, FITTING.ironRam, FITTING.cutwater]) {
      const bow = BOWS[kind]!, r = rammed(kind, tier);
      near(r.hurt, RAM.damage * (3 - RAM.speed) * bow.power[tier], 1e-6);
      assert.equal(r.broken, kind === FITTING.cutwater);
      assert.equal(r.laid, kind === FITTING.cutwater ? 0 : 1);
      near(r.cut, Math.max(0, bow.cut[tier] - TICK));
    }
    assert.ok(rammed(FITTING.ironRam, tier).hurt >= 2 * rammed(FITTING.stemPost, tier).hurt - 1e-9);
  }
  assert.ok(rammed(FITTING.ironRam, LAST).hurt > rammed(FITTING.ironRam, FIRST).hurt);
  assert.ok(rammed(FITTING.cutwater, LAST).cut > rammed(FITTING.cutwater, FIRST).cut);

  // Cut, it lays no trail leaving its waters until the cut has passed.
  const s = duel(), b = s.ships[1], c0 = cellOf(TERRITORY, b.pos), c1 = neighbor(TERRITORY, c0, 0);
  s.owner[c0] = 2;
  cellDir(TERRITORY, c0, b.was);
  cellDir(TERRITORY, c1, b.pos);
  b.cut = 2;
  chart(s);
  assert.equal(b.laid.length, 0);
  b.cut = 0;
  chart(s);
  assert.deepEqual(b.laid, [c1]);
});

test('the broadside: long guns reach farthest and reload slowest, swivels fire fastest and shortest, chain shot tears, heated shot burns, all harder by tier', () => {
  const kinds = [FITTING.lightGuns, FITTING.longGuns, FITTING.swivelGuns, FITTING.chainShot, FITTING.heatedShot];
  const battle = (kind: number, tier: number, abeam: number) => {
    const s = duel([{ form: FORM.galleon, gunnery: 0, fittings: fitted(SLOT.broadside, kind, tier) }, unarmed({ form: FORM.galleon })]);
    place(s, 1, 0, abeam);
    return s;
  };
  for (const kind of kinds) {
    const gun = GUNS[kind] as Gun;
    for (const tier of TIERS_TESTED) {
      const s = battle(kind, tier, gun.range * 0.8);
      assert.equal(count(once(s), EVENT.broadside), 1, `fitting ${kind} fires inside its range`);
      assert.ok(s.shots.every((sh) => sh.kind === kind && sh.effect === gun.effect && sh.lasting === gun.lasting[tier]));
      assert.equal(count(run(battle(kind, tier, gun.range + 4), 1), EVENT.broadside), 0, `fitting ${kind} holds fire beyond its range`);
    }
    const lo = battle(kind, FIRST, 8), hi = battle(kind, LAST, 8);
    once(lo);
    once(hi);
    near(hi.shots[0].power / lo.shots[0].power, gun.damage[LAST] / gun.damage[FIRST], 1e-9);
  }
  const fired = (kind: number) => count(run(battle(kind, FIRST, 8), 6), EVENT.broadside);
  assert.ok(fired(FITTING.swivelGuns) > fired(FITTING.lightGuns) && fired(FITTING.lightGuns) > fired(FITTING.longGuns));
  assert.ok(GUNS[FITTING.longGuns]!.range > GUNS[FITTING.lightGuns]!.range && GUNS[FITTING.swivelGuns]!.range < GUNS[FITTING.lightGuns]!.range);

  for (const tier of TIERS_TESTED) {
    const torn = battle(FITTING.chainShot, tier, 6), ev = run(torn, 12);
    assert.ok(count(ev, EVENT.hit, 1) > 0, 'chain shot strikes');
    near(torn.ships[1].torn, GUNS[FITTING.chainShot]!.lasting[tier]);
    const hot = battle(FITTING.heatedShot, tier, 6), lit = run(hot, 12).find((e) => e.kind === EVENT.ablaze && e.ship === 1);
    assert.ok(lit && lit.by === 0, 'heated shot sets the hull afire');
    near(lit.amount, GUNS[FITTING.heatedShot]!.lasting[tier]);
  }
});

test('the stern: chasers fire astern only, kegs drop under pursuers and burst, the mortar lobs a shell by tap or drag, all harder by tier', () => {
  for (const tier of TIERS_TESTED) {
    const chased = (ahead: number) => {
      const s = duel([{ fittings: fitted(SLOT.stern, FITTING.sternChasers, tier) }, unarmed()]);
      place(s, 1, ahead, 0);
      const ev = once(s);
      return { s, ev };
    };
    const astern = chased(-12);
    assert.ok(astern.ev.some((e) => e.kind === EVENT.broadside && e.ship === 0 && e.amount === BATTERY.stern));
    assert.equal(astern.s.shots.length, CHASERS.guns);
    assert.ok(astern.s.shots.every((sh) => sh.kind === FITTING.sternChasers));
    assert.equal(chased(12).s.shots.length, 0, 'nothing astern, the chasers hold fire');

    // Powder kegs: dropped while a rival follows close astern; it bursts under the rival's hull, sparing the dropper.
    const s = duel([{ fittings: fitted(SLOT.stern, FITTING.powderKegs, tier) }, unarmed()]);
    place(s, 1, -6, 0);
    assert.equal(count(once(s), EVENT.keg), 1);
    assert.equal(s.kegs.length, 1);
    s.ships[1].pos = { ...s.kegs[0].at };
    const hull = s.ships[1].hull, mine = s.ships[0].hull, ev = run(s, 1);
    const blast = ev.find((e) => e.kind === EVENT.kegBurst);
    assert.ok(blast && blast.by === 1 && blast.amount === 1);
    near(hull - s.ships[1].hull, KEGS.damage[tier], 1e-6);
    near(s.ships[0].hull, mine, 1e-9);
    assert.equal(s.kegs.length, 0);
    // A keg nobody sails over bursts where it floats when its fuse burns out.
    const lone = duel([{ fittings: fitted(SLOT.stern, FITTING.powderKegs, tier) }, unarmed()]);
    place(lone, 1, -6, 0);
    once(lone);
    place(lone, 1, 30, 0);
    const out = run(lone, KEGS.fuse + 0.2).find((e) => e.kind === EVENT.kegBurst);
    assert.ok(out && out.by === -1 && out.amount === 0 && lone.kegs.length === 0);

    // The mortar: a tap aims itself at the rival and the shell bursts on it; a drag lobs it at a point.
    const m = duel([{ gunnery: 0, fittings: fitted(SLOT.stern, FITTING.mortar, tier) }, unarmed()]);
    place(m, 1, 30, 0);
    const tap = inputs({ flags: FLAG.useAimed, aim: -1 }), before = m.ships[1].hull;
    const fired = once(m, tap).find((e) => e.kind === EVENT.mortar);
    assert.ok(fired && fired.by === 1 && m.shots.length === 1 && m.shots[0].kind === FITTING.mortar);
    const landed = run(m, fired.amount + 0.2);
    assert.ok(landed.some((e) => e.kind === EVENT.shell && e.ship === 0 && e.amount === 1));
    near(before - m.ships[1].hull, MORTAR.damage[tier], 1e-6);
    const point = normalize(addScaled(v3(), m.ships[0].pos, cross(v3(), m.ships[0].head, m.ships[0].pos), 20 / R));
    const drag = inputs({ flags: FLAG.useAimed, aim: cellOf(TERRITORY, point) });
    assert.equal(count(run(m, 1, drag), EVENT.mortar), 0, 'reloading, the mortar holds');
    const reloaded = run(m, MORTAR.reload, drag), by = reloaded.find((e) => e.kind === EVENT.mortar);
    assert.ok(by && by.by === SHIPS, 'reloaded, a drag fires at the point');
    assert.ok([...reloaded, ...run(m, by.amount + 0.2)].some((e) => e.kind === EVENT.shell && e.amount === 0));
  }
});

test('the rig: spare canvas is faster, the lateen mizzen turns tighter, storm sails lose nothing in a gale and gain by tier', () => {
  const s = duel(), ship = s.ships[0], bare = trim(sea, s, 0, newTrim());
  const rigged = (kind: number, tier: number) => {
    ship.fittings[SLOT.rig] = { kind, tier };
    return trim(sea, s, 0, newTrim());
  };
  const gale = { v: v3(), strength: TRIM.gale.to, steady: 0, gust: 0 }, fair = { ...gale, strength: 1 };
  const settled = (t: ReturnType<typeof newTrim>, wind: typeof gale) => settledSpeed(FORM.pinnace, SAIL.plain, 0, wind, { ...t, speed: 1 });
  for (const tier of TIERS_TESTED) {
    near(rigged(FITTING.spareCanvas, tier).speed / bare.speed, 1 + SPARE_CANVAS[tier]);
    near(rigged(FITTING.lateenMizzen, tier).turn / bare.turn, 1 + LATEEN_MIZZEN[tier]);
    const storm = { ...rigged(FITTING.stormSails, tier) };
    near(settled(storm, gale) / settled(storm, fair), 1 + STORM_SAILS[tier]);
  }
  near(settled(bare, gale) / settled(bare, fair), 1 - TRIM.gale.loss);
});

test('the hull: copper is faster and shrugs off hot water, doubled planking adds hull even when fitted at sea, pumps mend anywhere', () => {
  const s = duel(), ship = s.ships[0], bare = trim(sea, s, 0, newTrim()).speed;
  for (const tier of TIERS_TESTED) {
    ship.fittings[SLOT.hull] = { kind: FITTING.copperSheathing, tier };
    near(trim(sea, s, 0, newTrim()).speed / bare, 1 + COPPER[tier]);
  }
  let hot = 0;
  while ((sea.geo.zones[hot] & ZONE.hot) === 0) hot++;
  cellDir(TERRITORY, hot, ship.pos);
  for (const tier of TIERS_TESTED) {
    ship.fittings[SLOT.hull] = NONE;
    assert.ok(scald(sea, s, 0) > 0, 'hot water scalds a bare hull');
    ship.fittings[SLOT.hull] = { kind: FITTING.copperSheathing, tier };
    assert.equal(scald(sea, s, 0), 0);
  }
  for (const tier of TIERS_TESTED) {
    const d = duel(), p = d.ships[0], before = p.hull;
    p.offer = [{ kind: FITTING.doubledPlanking, tier }];
    once(d, inputs({ chestPick: 0 }));
    near(fullHull(p.form, p.fittings), FORMS[p.form].hull * (1 + DOUBLED_PLANKING[tier]));
    near(p.hull, before * (1 + DOUBLED_PLANKING[tier]), 1e-6);
    const mended = (kind: number) => {
      const m = duel([{ fittings: fitted(SLOT.hull, kind, tier) }]), q = m.ships[0];
      q.hull = FORMS[q.form].hull / 2;
      const h = q.hull;
      once(m);
      return q.hull - h;
    };
    near(mended(FITTING.pumps) - mended(FITTING.none), PUMPS[tier] * TICK, 1e-9);
  }
});

test('the lookout: the stern glass reaches astern, the crow\'s nest raises the eye, the lookout points to ships it knows of within its reach', () => {
  const s = duel(), ship = s.ships[0], low = eyeReach(s, 0);
  assert.equal(sternGlass(ship) + crowsNest(ship) + lookout(s, 0, SIGHTS[0]), 0);
  const reach: number[] = [];
  for (const tier of TIERS_TESTED) {
    ship.fittings[SLOT.lookout] = { kind: FITTING.sternGlass, tier };
    assert.equal(sternGlass(ship), STERN_GLASS[tier]);
    ship.fittings[SLOT.lookout] = { kind: FITTING.crowsNest, tier };
    assert.equal(crowsNest(ship), SIGHT.crowsNest[tier]);
    reach.push(eyeReach(s, 0));
  }
  assert.ok(reach[1] > reach[0] && reach[0] > low);
  place(s, 1, (LOOKOUT[FIRST] + LOOKOUT[LAST]) / 2, 0);
  survey(sea, s, SIGHTS);
  assert.ok(((SIGHTS[0].ships | SIGHTS[0].marks) & 2) !== 0, 'the rival is in sight');
  ship.fittings[SLOT.lookout] = { kind: FITTING.lookout, tier: FIRST };
  assert.equal(lookout(s, 0, SIGHTS[0]), 0);
  ship.fittings[SLOT.lookout] = { kind: FITTING.lookout, tier: LAST };
  assert.equal(lookout(s, 0, SIGHTS[0]), 2);
});

// ---------------------------------------------------------------------------------------------------------------
// Consumables.

test('consumables come by the chest\'s tier and stack by kind in three slots; a fourth kind waits on deck', () => {
  for (const kind of [CONSUMABLE.patchKit, CONSUMABLE.ward, CONSUMABLE.gust, CONSUMABLE.fogFlask, CONSUMABLE.flare]) {
    for (const tier of TIERS_TESTED) {
      const s = duel();
      s.ships[0].offer = [{ kind, tier }];
      once(s, inputs({ chestPick: 0 }));
      assert.deepEqual(s.ships[0].consumables[0], { kind, count: LOOT.count[tier] });
    }
  }
  const s = duel(), ship = s.ships[0], pick = inputs({ chestPick: 0 });
  for (const [kind, tier] of [[CONSUMABLE.patchKit, FIRST], [CONSUMABLE.patchKit, LAST], [CONSUMABLE.ward, FIRST], [CONSUMABLE.gust, FIRST]]) {
    ship.offer = [{ kind, tier }];
    once(s, pick);
  }
  assert.deepEqual(ship.consumables, [
    { kind: CONSUMABLE.patchKit, count: LOOT.count[FIRST] + LOOT.count[LAST] }, { kind: CONSUMABLE.ward, count: 1 }, { kind: CONSUMABLE.gust, count: 1 },
  ]);
  ship.offer = [{ kind: CONSUMABLE.flare, tier: FIRST }];
  assert.equal(canTake(ship, ship.offer[0]), false);
  assert.equal(worth(ship, ship.offer[0]), -Infinity);
  once(s, pick);
  assert.equal(ship.offer.length, 1, 'no slot for a fourth kind: it stays on deck');
});

test('each consumable at work: patch kit mends, ward absorbs and holds the trail, gust drives, fog flask hides, flare reveals', () => {
  const stocked = (kind: number, n = 1): MatchState => {
    const s = duel();
    s.ships[0].consumables[0] = { kind, count: n };
    return s;
  };
  const use = inputs({ consumable: 0 });

  // Patch kit: CONSUMABLES.patch of the full hull over its three seconds; the slot empties.
  const p = stocked(CONSUMABLE.patchKit), q = duel(), full = fullHull(p.ships[0].form, p.ships[0].fittings);
  p.ships[0].hull = q.ships[0].hull = full / 2;
  assert.equal(count(once(p, use), EVENT.used), 1);
  once(q);
  run(p, CONSUMABLES.time[0] + 0.5);
  run(q, CONSUMABLES.time[0] + 0.5);
  near(p.ships[0].hull - q.ships[0].hull, CONSUMABLES.patch * full, 1e-6);
  assert.deepEqual(p.ships[0].consumables[0], { kind: 0, count: 0 });

  // Ward: every blow absorbed, the open trail unbreakable, a second ward refused while the first holds; then neither.
  const w = stocked(CONSUMABLE.ward, 2), ship = w.ships[0], c = cellOf(TERRITORY, ship.pos), hull = ship.hull;
  ship.laid = [c];
  w.trail[c] = 1;
  once(w, use);
  damage(w, 0, 10, 1, CAUSE.gun);
  breakTrail(w, 0, 1, c);
  assert.equal(ship.hull, hull);
  assert.equal(ship.laid.length, 1);
  once(w, use);
  assert.equal(ship.consumables[0].count, 1, 'a ward at work is not spent again');
  run(w, CONSUMABLES.time[1] + 0.1);
  damage(w, 0, 10, 1, CAUSE.gun);
  breakTrail(w, 0, 1, c);
  near(ship.hull, hull - 10);
  assert.equal(ship.laid.length, 0);

  // Gust: CONSUMABLES.gust faster while it blows.
  const g = stocked(CONSUMABLE.gust), calm = trim(sea, g, 0, newTrim()).speed;
  once(g, use);
  near(trim(sea, g, 0, newTrim()).speed / calm, 1 + CONSUMABLES.gust);
  run(g, CONSUMABLES.time[2] + 0.1);
  near(trim(sea, g, 0, newTrim()).speed, calm);

  // Fog flask: hidden from the rival's lookout while it lasts.
  const f = stocked(CONSUMABLE.fogFlask);
  place(f, 1, 10, 0);
  once(f);
  assert.ok((SIGHTS[1].ships & 1) !== 0);
  once(f, use);
  once(f);
  assert.equal(SIGHTS[1].ships & 1, 0);
  run(f, CONSUMABLES.time[3] + 0.1);
  assert.ok((SIGHTS[1].ships & 1) !== 0);

  // Flare: every ship within SIGHT.flare marked for its ship alone while it burns.
  const l = stocked(CONSUMABLE.flare);
  place(l, 1, SIGHT.flare - 10, 0);
  once(l);
  assert.equal(SIGHTS[0].marks & 2, 0);
  once(l, use);
  once(l);
  assert.ok((SIGHTS[0].marks & 2) !== 0 && (SIGHTS[1].marks & 1) === 0);
  run(l, CONSUMABLES.time[4] + 0.1);
  assert.equal(SIGHTS[0].marks & 2, 0);
});

// ---------------------------------------------------------------------------------------------------------------
// Chests and loot.

test('the loot pool: brighter pigments enter as the rank rises, and richer regions bring brighter chests', () => {
  for (let rank = 1; rank <= 8; rank++) {
    const s = duel([], rank), seen = new Set<number>();
    for (let k = 0; k < 3000; k++) seen.add(chestTier(sea, s, s.ships[0].pos));
    assert.equal(Math.max(...seen), poolTop(rank), `rank ${rank}`);
    assert.equal(seen.size, poolTop(rank) + 1);
  }
  assert.deepEqual([1, 2, 3, 5, 7].map(poolTop), [0, 1, 2, 3, 4]);
  let rich = 0, poor = 0;
  for (let c = 0; c < TERRITORY.cells; c++) {
    const r = REGIONS[sea.geo.region[c]].richness;
    if (r > REGIONS[sea.geo.region[rich]].richness) rich = c;
    if (r < REGIONS[sea.geo.region[poor]].richness) poor = c;
  }
  const mean = (c: number) => {
    const s = duel([], 8), at = cellDir(TERRITORY, c, v3());
    let sum = 0;
    for (let k = 0; k < 3000; k++) sum += chestTier(sea, s, at);
    return sum / 3000;
  };
  assert.ok(mean(rich) > mean(poor) + 0.1);
  assert.equal(chestTier(sea, duel([], 8), v3(0, 0, 1), 1) <= 1, true, 'the gull\'s talons cap the tier');
});

test('a chest opens under the ship sailing over it, offering three items; a second waits while the deck is full', () => {
  const s = duel([], 8);
  place(s, 1, 10, 0);
  afloatChest(s, s.ships[1].pos, 2, NONE, -1);
  afloatChest(s, s.ships[1].pos, 3, NONE, -1);
  const ev = once(s), offer = s.ships[1].offer;
  assert.equal(count(ev, EVENT.opened, 1), 1);
  assert.equal(offer.length, OFFERS);
  assert.equal(new Set(offer.map((o) => o.kind)).size, OFFERS);
  assert.ok(offer.every((o) => o.tier === 2 && o.kind > FITTING.none && o.kind <= CONSUMABLE.flare));
  assert.equal(s.chests.length, 1);
  once(s, inputs({}, { chestPick: 1 }));
  assert.ok(s.ships[1].offer.every((o) => o.tier === 3), 'chosen, it opens the next');
  assert.equal(s.chests.length, 0);
  assert.ok(s.timeline.some((e) => e.kind === EVENT.chosen && e.ship === 1));

  // A held fitting is offered first, the rest no brighter than the pool at the player's rank.
  const low = duel([], 1);
  place(low, 1, 10, 0);
  afloatChest(low, low.ships[1].pos, 4, { kind: FITTING.longGuns, tier: 4 }, -1);
  once(low);
  assert.deepEqual(low.ships[1].offer[0], { kind: FITTING.longGuns, tier: 4 });
  assert.ok(low.ships[1].offer.slice(1).every((o) => o.tier === 0));
});

test('a swapped fitting floats astern in a chest for anyone else; a sunk ship\'s fitting floats at its wreck', () => {
  const s = duel([], 8), ship = s.ships[0];
  place(s, 1, 10, 0);
  ship.offer = [{ kind: FITTING.longGuns, tier: 3 }];
  const ev = once(s, inputs({ chestPick: 0 }));
  assert.deepEqual(ship.fittings[SLOT.broadside], { kind: FITTING.longGuns, tier: 3 });
  assert.ok(ev.some((e) => e.kind === EVENT.swapped && e.ship === 0 && e.by === FITTING.lightGuns));
  assert.equal(s.chests.length, 1);
  const chest = s.chests[0];
  assert.deepEqual([chest.fitting, chest.from, chest.tier], [{ kind: FITTING.lightGuns, tier: 0 }, 0, 0]);
  assert.ok(dot(chest.at, ship.head) < dot(ship.pos, ship.head), 'astern');
  chest.at = { ...ship.pos };
  once(s);
  assert.equal(s.chests.length, 1, 'the ship that dropped it cannot take it back');
  chest.at = { ...s.ships[1].pos };
  once(s);
  assert.deepEqual(s.ships[1].offer[0], { kind: FITTING.lightGuns, tier: 0 });

  const w = duel([{}, { fittings: START_FITTINGS.map((kind) => ({ kind, tier: 3 })) }], 8);
  place(w, 1, 10, 0);
  sink(w, 1, 0, CAUSE.gun);
  assert.equal(w.chests.length, 1);
  const wreck = w.chests[0];
  assert.ok(wreck.from === 1 && wreck.tier === 3 && START_FITTINGS.includes(wreck.fitting.kind) && wreck.fitting.kind !== FITTING.none);
  w.ships[0].pos = { ...wreck.at };
  once(w);
  assert.deepEqual(w.ships[0].offer[0], wreck.fitting);
  assert.ok(w.ships[0].offer.every((o) => o.tier === 3));
});

test('the gull\'s seam: a chest delivered opens on deck, or floats alongside while the deck is full', () => {
  const s = duel([], 8), ship = s.ships[0];
  deliver(s, 0, 3);
  assert.ok(ship.offer.length === OFFERS && ship.offer.every((o) => o.tier === 3));
  assert.ok(s.events.some((e) => e.kind === EVENT.opened && e.ship === 0 && e.amount === 3));
  deliver(s, 0, 2);
  assert.deepEqual([s.chests.length, s.chests[0].tier, s.chests[0].from], [1, 2, -1]);
  once(s, inputs({ chestPick: 0 }));
  assert.ok(ship.offer.length === OFFERS && ship.offer.every((o) => o.tier === 2) && s.chests.length === 0);
});

test('captains weigh offers by tiers gained, and set out better fitted as their rank rises', () => {
  const s = duel(), ship = s.ships[0];
  ship.offer = [{ kind: CONSUMABLE.patchKit, tier: 0 }, { kind: FITTING.longGuns, tier: 3 }, { kind: FITTING.stemPost, tier: 0 }];
  assert.deepEqual(ship.offer.map((o) => worth(ship, o)), [LOOT.worth, 3, 0]);
  assert.equal(bestPick(ship), 1);
  ship.offer = [];
  assert.equal(bestPick(ship), -1);

  assert.deepEqual(startingFittings(1), START_FITTINGS.map((kind) => ({ kind, tier: 0 })));
  let last = -1;
  for (let rank = 1; rank <= 8; rank++) {
    const fittings = startingFittings(rank), score = fittings.reduce((n, f) => n + (f.kind === FITTING.none ? 0 : f.tier + 1), 0);
    assert.ok(score >= last, `rank ${rank} sets out no worse`);
    last = score;
    createMatch({ seed: SEED, fleet: Array.from({ length: SHIPS }, () => ({ fittings })), rank });
  }
  assert.ok(startingFittings(8).every((f) => f.kind !== FITTING.none && f.tier === LAST));
  assert.throws(() => createMatch({ seed: SEED, fleet: Array.from({ length: SHIPS }, () => ({ fittings: fitted(SLOT.bow, FITTING.mortar) })) }));
});

test('landmarks: the Arch reloads the stern a third faster; nothing aims into the Great Lagoon', () => {
  const left = (arch: boolean) => {
    const s = duel([{ gunnery: 0, fittings: fitted(SLOT.stern, FITTING.mortar) }, unarmed()]);
    if (arch) s.owner[sea.marks[landmark('arch')]] = 1;
    place(s, 1, 30, 0);
    once(s, inputs({ flags: FLAG.useAimed }));
    run(s, 1);
    return s.ships[0].reload[BATTERY.stern];
  };
  near(left(false), MORTAR.reload - 1, 1e-9);
  near(left(true), MORTAR.reload - PERK.arch, 1e-9);

  const lagoon = sea.geo.landmarks[landmark('greatLagoon')];
  const aimed = (held: boolean) => {
    const s = duel([{ gunnery: 0, fittings: fitted(SLOT.stern, FITTING.mortar) }, unarmed()]);
    s.ships[1].pos = { ...lagoon.pos };
    normalize(addScaled(s.ships[1].head, v3(0, 0, 1), lagoon.pos, -lagoon.pos.z));
    place(s, 0, -20, 0, 1);
    if (held) s.owner[sea.marks[landmark('greatLagoon')]] = 2;
    return count(once(s, inputs({ flags: FLAG.useAimed })), EVENT.mortar);
  };
  assert.equal(aimed(false), 1);
  assert.equal(aimed(true), 0);
});

// ---------------------------------------------------------------------------------------------------------------
// Determinism, snapshots and cost.

/** All ten ships sailing from the start, every stern fitting and gun among them, consumables stocked, chests on deck and afloat. */
function brawl(): MatchState {
  const guns = [FITTING.longGuns, FITTING.swivelGuns, FITTING.chainShot, FITTING.heatedShot, FITTING.lightGuns];
  const sterns = [FITTING.mortar, FITTING.powderKegs, FITTING.sternChasers];
  const fleet = Array.from({ length: SHIPS }, (_, i): Outfit => ({
    form: i % 4,
    fittings: [
      { kind: i % 2 ? FITTING.ironRam : FITTING.cutwater, tier: i % 5 }, { kind: guns[i % 5], tier: (i + 1) % 5 },
      { kind: sterns[i % 3], tier: (i + 2) % 5 }, { kind: FITTING.spareCanvas, tier: 0 }, { kind: FITTING.pumps, tier: i % 5 },
      { kind: FITTING.lookout, tier: 0 },
    ],
  }));
  const s = createMatch({ seed: SEED, fleet, rank: 8 });
  s.ships.forEach((ship, i) => {
    ship.phase = PHASE.sailing;
    ship.consumables[0] = { kind: CONSUMABLE.patchKit + (i % 5), count: 2 };
    deliver(s, i, i % 5);
    afloatChest(s, normalize(addScaled(v3(), ship.pos, ship.head, (60 + 5 * i) / R)), i % 5, NONE, -1);
  });
  s.events.length = 0;
  return s;
}

test('determinism: a brawl with every item runs identically, and resumes identically from a snapshot with chests, kegs and a shell afloat', () => {
  const ticks = S(40), script = scriptedInputs(SEED, ticks);
  const play = (s: MatchState, from: number): MatchState => {
    for (let t = from; t < ticks; t++) step(sea, s, script[t]);
    return s;
  };
  const a = play(brawl(), 0);
  assert.equal(matchHash(play(brawl(), 0)), matchHash(a));
  const c = brawl();
  let t = 0;
  while (t < ticks && !(c.kegs.length > 0 && c.chests.length > 0 && c.shots.some((sh) => sh.blast > 0))) step(sea, c, script[t++]);
  assert.ok(t < ticks, 'chests, kegs and a shell are afloat together');
  const d = decodeMatch(encodeMatch(c));
  assert.equal(matchHash(d), matchHash(c));
  assert.equal(matchHash(play(d, t)), matchHash(play(c, t)));
  assert.equal(matchHash(c), matchHash(a));
});

test('the tick\'s cost with ten ships fighting with their items stays within A9 (Node mean ≤ 0.3 ms)', (t) => {
  const s = brawl(), script = scriptedInputs(SEED + 1, S(30)), cost: number[] = [];
  for (const input of script) {
    const t0 = cpuNow();
    step(sea, s, input);
    cost.push(cpuNow() - t0);
  }
  const warm = cost.slice(60).sort((x, y) => x - y), mean = warm.reduce((x, y) => x + y, 0) / warm.length;
  const p99 = warm[Math.floor(warm.length * 0.99)];
  t.diagnostic(`step mean ${mean.toFixed(3)} ms, p99 ${p99.toFixed(3)} ms over ${warm.length} ticks`);
  assert.ok(mean <= 0.3, `mean ${mean} ms`);
});

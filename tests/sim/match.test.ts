// The Gale, the Storm, abilities, the whale, the rotating rules, recordings and whole matches, measured against
// PLAN.md's pass 1 lines.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ABILITIES, STARTER_ACTIVE, STARTER_PASSIVE, type ActiveId, type PassiveId } from '../../src/sim/abilities.ts';
import { fire, reloadTime } from '../../src/sim/combat.ts';
import { hurt } from '../../src/sim/harm.ts';
import { rollItem, stackOf, useTime, weaponItem } from '../../src/sim/items.ts';
import { createMatch, inputAt, parseRecording, record, recorder, replay, result, runMatch, step } from '../../src/sim/match.ts';
import { dacos, dot, hash32, normalize, rngFrom, v3, type V3 } from '../../src/sim/math.ts';
import { openAt } from '../../src/sim/nav.ts';
import { GALE_SPEED, galeEmpty } from '../../src/sim/opening.ts';
import { ACTIVES, PASSIVES, activeIndex, passiveIndex } from '../../src/sim/perks.ts';
import { RULE, dayNumber, ruleFor } from '../../src/sim/rules.ts';
import { settledSpeed, turnRate } from '../../src/sim/sailing.ts';
import { R, advance, along, apart, tangentAt, tangentToward } from '../../src/sim/sphere.ts';
import { isNight, sunDir, sunUp } from '../../src/sim/environment.ts';
import { copyInput, idleInput, type ShipInput } from '../../src/sim/input.ts';
import {
  CAUSE, EVENT, FLAG, PHASE, SHIPS, STREAMS, TICK, WHALE_STATE, decodeMatch, encodeMatch, matchHash, type MatchState,
} from '../../src/sim/state.ts';
import { calmNow, finaleRegion, inside, phaseAt, planStorm, storm } from '../../src/sim/storm.ts';
import { GALE, ITEM, POWERS, SHIP, STORM, WEAPON_KINDS, WHALE, ZONES } from '../../src/sim/tables.ts';
import { squareMetres } from '../../src/sim/territory.ts';
import { SEEN, seen } from '../../src/sim/visibility.ts';
import { WHALE_HOME, callBreach, swim } from '../../src/sim/whale.ts';
import { newWind } from '../../src/sim/wind.ts';
import { CENTRES, REGION_COUNT, heightAt, regionAt } from '../../src/sim/world/index.ts';
import { events, gap, openWater, place, quietMatch, run, sailOn, type Course } from './fixture.ts';

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

/** A quiet match with G at the start of the course, its active and passive set. */
function at(active: ActiveId = STARTER_ACTIVE, passive: PassiveId = STARTER_PASSIVE): MatchState {
  const state = quietMatch();
  place(state, G, COURSE);
  state.ships[G].active = activeIndex(active);
  state.ships[G].passive = passiveIndex(passive);
  return state;
}

type Seen = { tick: number; e: MatchState['events'][number] };

function watch(state: MatchState, seconds: number, drive: Parameters<typeof run>[2], kinds: number[]): Seen[] {
  const out: Seen[] = [];
  run(state, seconds, drive, (s) => {
    for (const e of s.events) if (kinds.includes(e.kind)) out.push({ tick: s.tick, e });
  });
  return out;
}

const nobody = () => Array.from({ length: SHIPS }, () => ({ captain: false }));
const cross = (a: V3, b: V3): V3 => normalize(v3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x));

// ---------------------------------------------------------------- the Gale

test('the Gale carries the fleet abreast, high over the planet, along a great circle from one side to the other', (t) => {
  const state = createMatch({ seed: 5, fleet: nobody() });
  const g = state.gale, n = cross(g.from, g.dir);
  assert.ok(state.ships.every((s) => s.phase === PHASE.gale && s.alt === GALE.height), `the whole fleet aboard at ${GALE.height} m`);
  assert.ok(Math.abs(GALE_SPEED * GALE.time - Math.PI * R) < 1e-6, 'over its time it covers half the circumference');
  const lane = state.ships.map((s) => dot(s.pos, n));
  let closest = Infinity;
  for (let i = 0; i < SHIPS; i++) for (let j = i + 1; j < SHIPS; j++) closest = Math.min(closest, gap(state, i, j));
  assert.ok(closest >= 8.9, `abreast, ${closest.toFixed(1)} m apart at the closest`);

  const from = { ...state.ships[2].pos };
  for (let k = 0; k < 10 / TICK; k++) {
    step(state);
    for (let i = 0; i < SHIPS; i++) {
      const s = state.ships[i];
      assert.equal(s.alt, GALE.height);
      assert.ok(Math.abs(dot(s.pos, n) - lane[i]) < 1e-9, `ship ${i} keeps its lane`);
    }
  }
  const went = R * dacos(Math.min(1, dot(from, state.ships[2].pos)));
  t.diagnostic(`${GALE_SPEED.toFixed(1)} m/s: ${went.toFixed(1)} m in 10 s`);
  assert.ok(Math.abs(went - GALE_SPEED * 10) < 0.5, 'and runs at its speed');
});

test('the player dives where they choose: leaving the Gale at different moments lands in different regions, home water inked', (t) => {
  const regions = new Set<number>();
  for (const when of [4, 12, 20, 28]) {
    const state = createMatch({ seed: 5, fleet: nobody() }), ship = state.ships[0];
    const dive: ShipInput = { ...idleInput(), dive: true };
    let left = -1, landed = -1, region = -1;
    while (landed < 0 && state.tick < 80 / TICK) {
      step(state, state.tick * TICK >= when ? dive : null);
      for (const e of state.events) {
        if (e.kind === EVENT.galeDive && e.ship === 0) left = state.tick;
        if (e.kind === EVENT.landing && e.ship === 0) {
          landed = state.tick;
          region = e.item;
        }
      }
    }
    assert.ok(left >= 0 && Math.abs(left * TICK - when) < 0.1, `left the Gale at ${when} s`);
    assert.ok(landed > 0, 'and landed');
    const fall = (landed - left) * TICK;
    t.diagnostic(`dive at ${when} s: down in ${fall.toFixed(1)} s in region ${region}, ${squareMetres(ship.held).toFixed(0)} m² inked`);
    assert.ok(fall < GALE.height / GALE.dive + 2, 'diving drops fast');
    assert.equal(ship.phase, PHASE.sea);
    assert.ok(openAt(ship.pos), 'onto open water');
    assert.equal(region, regionAt(ship.pos));
    assert.ok(squareMetres(ship.held) > 1500, 'with home water of its own');
    regions.add(region);
  }
  assert.ok(regions.size >= 3, `four moments, ${regions.size} regions`);

  // gliding down rather than diving takes the whole height at the slow fall
  const state = createMatch({ seed: 5, fleet: nobody() });
  let landed = -1;
  while (landed < 0 && state.tick < 120 / TICK) {
    step(state);
    if (events(state, EVENT.landing).some((e) => e.ship === 0)) landed = state.tick;
  }
  assert.ok(galeEmpty(state), 'the Gale throws off whoever rides it to the end');
  const down = landed * TICK - GALE.time;
  t.diagnostic(`thrown off at ${GALE.time} s, gliding down in ${down.toFixed(1)} s`);
  assert.ok(down > GALE.height / GALE.fall - 2, 'a glide comes down slowly');
});

test('each captain picks a region and dives into it', (t) => {
  let hit = 0, all = 0;
  const picked = new Set<number>();
  for (const seed of [3, 11, 29]) {
    const state = createMatch({ seed, fleet: [{ captain: true }] });
    const landing = new Array<number>(SHIPS).fill(-1);
    while (landing.includes(-1) && state.tick < 90 / TICK) {
      step(state);
      for (const e of events(state, EVENT.landing)) landing[e.ship] = e.item;
    }
    for (let i = 0; i < SHIPS; i++) {
      const c = state.ships[i].captain;
      assert.ok(c.region >= 0 && c.region < REGION_COUNT, `captain ${i} picked a region`);
      picked.add(c.region);
      all++;
      if (landing[i] === c.region) hit++;
    }
  }
  t.diagnostic(`${hit} of ${all} captains landed in the region they picked; ${picked.size} regions picked`);
  assert.ok(hit >= all * 0.9, 'captains land where they mean to');
  assert.ok(picked.size >= 6, 'and spread over the planet');
});

// ---------------------------------------------------------------- the Storm

/** The storm plan createMatch makes for a seed, without the rest of the match. */
function plan(seed: number, rule: number = RULE.none): MatchState {
  const state = {
    seed, rule, rng: Array.from({ length: STREAMS }, (_, k) => rngFrom(hash32(seed, k))),
    storm: { region: 0, centres: [], start: 0, phase: 0, shrinking: false, scale: 1 },
  } as unknown as MatchState;
  planStorm(state);
  return state;
}

test('the first safe circle covers half the planet, and seven phases close it, each circle inside the last', () => {
  assert.equal(ZONES[0], (Math.PI * R) / 2, 'a quarter of a great circle out: half the sphere');
  assert.equal(STORM.phases.length, 7);
  assert.equal(ZONES.length, 8);
  for (let k = 1; k < ZONES.length; k++) assert.ok(ZONES[k] < ZONES[k - 1]);
  for (const seed of [1, 99, 4242]) {
    assert.deepEqual(plan(seed).storm.centres, createMatch({ seed }).storm.centres, 'the plan is the match\'s');
  }
  for (let seed = 0; seed < 400; seed++) {
    const c = plan(seed).storm.centres;
    for (let k = 0; k + 1 < ZONES.length; k++) {
      assert.ok(apart(c[k], c[k + 1]) + ZONES[k + 1] <= ZONES[k] + 1e-6, `seed ${seed}: circle ${k + 1} inside circle ${k}`);
    }
  }
});

/** Land anywhere in the circle, looked for every metre: the planner's own check samples it more sparsely. */
function landIn(c: V3, r: number): boolean {
  const dir = v3(), p = v3();
  for (let d = 0; d <= r; d++) {
    const n = Math.max(1, Math.ceil(2 * Math.PI * d));
    for (let k = 0; k < n; k++) if (heightAt(along(c, tangentAt(c, (2 * Math.PI * k) / n, dir), d, p)) > 0) return true;
  }
  return false;
}

test('over 1,600 seeds the final circle lies wholly within one region, takes in some of its land, and every region hosts its share', (t) => {
  const counts = new Array<number>(REGION_COUNT).fill(0), last = ZONES.length - 2, r = ZONES[last];
  let bad = 0;
  for (let seed = 0; seed < 1600; seed++) {
    const s = plan(seed).storm, c = s.centres[last];
    assert.equal(s.region, finaleRegion(seed));
    if (!(inside(c, s.region, r) && landIn(c, r) && openAt(c) && regionAt(c) === s.region)) bad++;
    counts[s.region]++;
  }
  t.diagnostic(`finales per region: ${counts.join(' ')}`);
  assert.equal(bad, 0, 'every final circle is inside its region, on water, with land in it');
  for (const n of counts) assert.ok(n >= 70 && n <= 130, 'each region within ±30% of 1/16');
});

/** Runs only the Storm, tick by tick, gathering what it announces and the circle's radius. */
function stormOnly(state: MatchState, seconds: number) {
  const said: Seen[] = [], radii: number[] = [];
  for (let k = 0; k < seconds / TICK; k++) {
    state.events.length = 0;
    storm(state);
    for (const e of state.events) if (e.kind === EVENT.stormWait || e.kind === EVENT.stormShrink) said.push({ tick: state.tick, e });
    radii.push(calmNow(state).r);
    state.tick++;
  }
  return { said, radii };
}

test('the Storm waits, then closes, phase by phase, announcing each change; the double-speed rule halves every time', () => {
  for (const rule of [RULE.none, RULE.doubleStorm]) {
    const state = quietMatch({ rule }), sc = rule === RULE.doubleStorm ? 0.5 : 1;
    assert.equal(state.storm.scale, sc);
    const { said, radii } = stormOnly(state, STORM.first + 600 * sc);
    assert.equal(said.length, 14, 'a wait and a closing for each of seven phases');
    let at = STORM.first;
    for (let k = 0; k < 7; k++) {
      const p = STORM.phases[k];
      for (const [i, kind, len] of [[2 * k, EVENT.stormWait, p.wait * sc], [2 * k + 1, EVENT.stormShrink, p.shrink * sc]] as const) {
        const s = said[i];
        assert.equal(s.e.kind, kind);
        assert.equal(s.e.item, k);
        assert.ok(Math.abs(s.tick * TICK - at) <= TICK + 1e-9, `phase ${k} ${kind === EVENT.stormWait ? 'waits' : 'closes'} at ${at} s`);
        assert.ok(Math.abs(s.e.amount - len) <= TICK + 1e-9, 'and says for how long');
        at += len;
      }
    }
    for (let k = 1; k < radii.length; k++) assert.ok(radii[k] <= radii[k - 1] + 1e-9, 'the safe circle only ever shrinks');
    assert.equal(radii[radii.length - 1], 0, 'down to nothing');
  }
  const ph = phaseAt(plan(1, RULE.doubleStorm), 60);
  assert.equal(ph.k, 1, 'at 60 s the doubled Storm is in its second phase');
});

test('the Storm wears at the hull alone, only once the first circle starts to close, and Storm Walker takes less of it', (t) => {
  const state = quietMatch(), c0 = state.storm.centres[0];
  const order = Array.from({ length: SHIPS }, (_, i) => i).sort((a, b) => dot(state.ships[a].pos, c0) - dot(state.ships[b].pos, c0));
  const [out, walker] = order, safe = order[SHIPS - 1];
  assert.ok(dot(state.ships[walker].pos, c0) < -0.2 && dot(state.ships[safe].pos, c0) > 0.5, 'two ships well outside, one well in');
  state.ships[out].shield = 50;
  state.ships[walker].passive = passiveIndex('stormWalker');
  run(state, STORM.first + STORM.phases[0].wait - 0.5);
  assert.ok(state.ships.every((s) => s.hull === 100), 'the first circle is only a warning');
  const hits = watch(state, 10.5, () => null, [EVENT.hit]);
  const lost = 100 - state.ships[out].hull, walked = 100 - state.ships[walker].hull;
  t.diagnostic(`10 s in the Storm's first closing: ${lost.toFixed(2)} hull, ${walked.toFixed(2)} with Storm Walker`);
  assert.ok(Math.abs(lost - 10 * STORM.phases[0].damage) < 0.2, `${STORM.phases[0].damage} a second`);
  assert.equal(state.ships[out].shield, 50, 'the shield is no help');
  assert.ok(Math.abs(walked - lost * POWERS.stormWalker) < 0.2, 'Storm Walker takes 60% of it');
  assert.equal(state.ships[safe].hull, 100, 'inside the circle, nothing');
  const mine = hits.filter((h) => h.e.ship === out);
  assert.ok(mine.length > 0 && mine.every((h) => h.e.item === CAUSE.storm && (h.e.flag & FLAG.steady) !== 0 && h.e.shield === 0));
});

// ---------------------------------------------------------------- abilities

test('every ship brings one active and one passive of the sixteen; everyone starts with Repair and Salvage', () => {
  assert.equal(ABILITIES.length, 16);
  assert.equal(ACTIVES.length, 8);
  assert.equal(PASSIVES.length, 8);
  for (const name of ['Smoke Screen', 'Ram', 'Repair', 'Reveal', 'Hard Turn', 'Decoy', 'Wave', 'Quick Reload', 'Salvage', 'Quick Hands',
    'Light Hull', 'Wind Reader', 'Storm Walker']) {
    assert.ok(ABILITIES.some((a) => a.name === name), `${name}, as PLAN names it`);
  }
  for (const a of ABILITIES) assert.ok(a.kind === 'passive' ? a.cooldown === 0 : a.cooldown >= 20, `${a.name}'s cooldown`);
  const state = createMatch({ seed: 2, fleet: [{ captain: false }, { captain: true, active: 'wave', passive: 'lightHull' }] });
  assert.equal(ACTIVES[state.ships[0].active], 'repair');
  assert.equal(PASSIVES[state.ships[0].passive], 'salvage');
  assert.equal(ACTIVES[state.ships[1].active], 'wave');
  assert.equal(PASSIVES[state.ships[1].passive], 'lightHull');
  assert.equal(ACTIVES[state.ships[19].active], 'repair', 'a captain the fleet leaves out gets the starter pair');
});

test('Repair patches 30 hull over three seconds, then waits out its cooldown; Salvage refills shield on a sinking', () => {
  const state = at(), ship = state.ships[G];
  ship.hull = 50;
  const press = (i: number) => (i === G ? sailOn({ throttle: 0, ability: true }) : null);
  const said = watch(state, 3.2, press, [EVENT.ability, EVENT.abilityEnd]);
  assert.ok(Math.abs(ship.hull - 80) < 0.2, `hull ${ship.hull.toFixed(2)}`);
  assert.equal(said.filter((s) => s.e.kind === EVENT.ability).length, 1, 'held down, it fires once');
  assert.equal(said[0].e.amount, POWERS.repair.time);
  assert.ok(said.some((s) => s.e.kind === EVENT.abilityEnd));
  const again = watch(state, 36, press, [EVENT.ability]);
  assert.equal(again.length, 0, 'not again until its cooldown is up');
  const later = watch(state, 1.5, press, [EVENT.ability]);
  assert.equal(later.length, 1, 'then it is ready');

  place(state, T, spot(60));
  hurt(state, T, 500, G, ITEM.cannon, null);
  run(state, TICK);
  assert.equal(state.ships[T].phase, PHASE.sunk);
  assert.equal(ship.shield, POWERS.salvage, 'Salvage: the sinking refills 30 shield');
});

test('Smoke Screen hides the ship and swallows the shots fired into it', () => {
  const state = at('smokeScreen');
  place(state, T, spot(70));
  state.ships[T].head = v3(-COURSE.head.x, -COURSE.head.y, -COURSE.head.z);
  assert.ok((seen(state, T, G) & SEEN.visible) !== 0, 'in sight before');
  run(state, TICK, (i) => (i === G ? sailOn({ throttle: 0, ability: true }) : null));
  assert.equal(state.clouds.length, 1);
  assert.equal(seen(state, T, G) & (SEEN.visible | SEEN.map), 0, 'hidden in the smoke');
  const said = watch(state, 3, (i) => (i === T ? sailOn({ throttle: 0, fire: true, aim: state.ships[G].pos, aimY: 2 }) : null),
    [EVENT.fire, EVENT.blocked, EVENT.hit]);
  assert.ok(said.some((s) => s.e.kind === EVENT.fire), 'T fires into it');
  assert.ok(said.some((s) => s.e.kind === EVENT.blocked), 'the smoke swallows the shot');
  assert.ok(!said.some((s) => s.e.kind === EVENT.hit && s.e.ship === G), 'and G is not hit');
  run(state, POWERS.smokeScreen.time);
  assert.equal(state.clouds.length, 0, 'the smoke clears');
});

test('Ram surges forward and smashes into the ship ahead', (t) => {
  const state = at('ram');
  place(state, G, COURSE, 8);
  place(state, T, spot(26));
  let fastest = 0;
  const said: Seen[] = [];
  run(state, POWERS.ram.time + 0.5, (i) => (i === G ? sailOn({ ability: true }) : null), (s) => {
    fastest = Math.max(fastest, s.ships[G].speed);
    for (const e of s.events) if (e.kind === EVENT.hit || e.kind === EVENT.ram) said.push({ tick: s.tick, e });
  });
  const blow = said.find((s) => s.e.kind === EVENT.hit && s.e.ship === T && s.e.item === CAUSE.ram);
  t.diagnostic(`${fastest.toFixed(1)} m/s at the most; T at ${state.ships[T].hull.toFixed(0)} hull`);
  assert.ok(fastest > SHIP.top, 'faster than she can sail');
  assert.ok(blow, 'the rammed ship takes the blow');
  assert.equal(blow!.e.amount, POWERS.ram.damage);
  assert.ok(!said.some((s) => s.tick === blow!.tick && s.e.kind === EVENT.hit && s.e.ship === G), 'the rammer takes nothing from the blow');
});

test('Reveal shows every ship near you on the map, even one hidden', () => {
  const state = at('reveal');
  place(state, T, spot(150));
  state.clouds.push({ owner: T, at: { ...state.ships[T].pos }, t: 1e6 });
  assert.equal(seen(state, G, T) & SEEN.map, 0, 'hidden in smoke');
  run(state, TICK, (i) => (i === G ? sailOn({ throttle: 0, ability: true }) : null));
  assert.notEqual(seen(state, G, T) & SEEN.map, 0, 'revealed on the map');
  run(state, POWERS.reveal.time);
  assert.equal(seen(state, G, T) & SEEN.map, 0, 'until it wears off');
});

test('Hard Turn spins her round on the spot and she comes out fast', () => {
  const state = at('hardTurn');
  place(state, G, COURSE, 12);
  const before = { ...state.ships[G].head };
  run(state, TICK, (i) => (i === G ? sailOn({ ability: true }) : null));
  const ship = state.ships[G];
  assert.ok(dot(before, ship.head) < -0.95, 'facing the other way');
  assert.ok(ship.boost > 0 && ship.speed >= SHIP.crawl, 'and under way');
});

test('Decoy leaves a ghost that sails on and draws the fire', () => {
  const state = at('decoy');
  place(state, T, spot(110));
  state.ships[T].head = v3(-COURSE.head.x, -COURSE.head.y, -COURSE.head.z);
  run(state, TICK, (i) => (i === G ? sailOn({ throttle: 0, ability: true }) : null));
  assert.equal(state.decoys.length, 1);
  const start = { ...state.decoys[0].pos };
  run(state, 2);
  const went = apart(start, state.decoys[0].pos);
  assert.ok(Math.abs(went - SHIP.top * 0.8 * 2) < 1, `it sails on: ${went.toFixed(1)} m in 2 s`);
  const said = watch(state, 3, (i) => (i === T && state.decoys.length > 0
    ? sailOn({ throttle: 0, fire: true, aim: state.decoys[0].pos, aimY: 2 }) : null), [EVENT.impact, EVENT.hit]);
  assert.ok(said.some((s) => s.e.kind === EVENT.impact && s.e.flag === 8), 'a shot takes the decoy');
  assert.equal(state.decoys.length, 0, 'and it is gone');
  assert.ok(!said.some((s) => s.e.kind === EVENT.hit && s.e.ship === G));
});

test('Wave shoves the ships near you away and grazes them', () => {
  const state = at('wave');
  place(state, T, spot(20));
  const far = 3;
  place(state, far, spot(80));
  run(state, TICK, (i) => (i === G ? sailOn({ throttle: 0, ability: true }) : null));
  run(state, 1);
  assert.ok(gap(state, G, T) > 24, `pushed off to ${gap(state, G, T).toFixed(1)} m`);
  assert.equal(state.ships[T].hull, 100 - POWERS.wave.damage);
  assert.equal(state.ships[far].hull, 100, 'out of reach, untouched');
});

test('Drift Mine drops astern, arms, and bursts when another ship comes close', () => {
  const state = at('driftMine');
  run(state, TICK, (i) => (i === G ? sailOn({ throttle: 0, ability: true }) : null));
  assert.equal(state.mines.length, 1);
  const mine = { ...state.mines[0].at };
  const behind = dot(mine, COURSE.head) < dot(state.ships[G].pos, COURSE.head);
  assert.ok(behind, 'astern');
  run(state, POWERS.driftMine.arm + 1);
  assert.equal(state.mines.length, 1, 'its own ship does not set it off');
  const h = v3();
  tangentToward(mine, state.ships[G].pos, h);
  place(state, T, { pos: v3(mine.x, mine.y, mine.z), head: h });
  const said = watch(state, TICK, () => null, [EVENT.mineBurst, EVENT.hit]);
  assert.ok(said.some((s) => s.e.kind === EVENT.mineBurst));
  const blast = said.find((s) => s.e.kind === EVENT.hit && s.e.ship === T);
  assert.ok(blast && blast.e.item === CAUSE.mine && blast.e.amount > POWERS.driftMine.damage * 0.9);
  assert.equal(state.ships[G].hull, 100, 'clear of the splash');
  assert.equal(state.mines.length, 0);
});

test('the passives: Quick Reload, Quick Hands, Light Hull, Wind Reader, Deep Hold and Steady Aim', () => {
  const state = at(), ship = state.ships[G];
  const as = (p: PassiveId) => {
    ship.passive = passiveIndex(p);
    return ship;
  };
  const base = reloadTime(as('salvage'), ITEM.cannon, 0);
  assert.ok(Math.abs(reloadTime(as('quickReload'), ITEM.cannon, 0) - base * 0.8) < 1e-9, 'Quick Reload: 20% faster');
  const use = useTime(as('salvage'), ITEM.bigShield);
  assert.ok(Math.abs(useTime(as('quickHands'), ITEM.bigShield) - use * 0.75) < 1e-9, 'Quick Hands: 25% faster');
  // a fair, steady breeze blowing along the course
  const h = COURSE.head, wind = { ...newWind(), v: v3(h.x * 8, h.y * 8, h.z * 8), strength: 1, steady: 1 };
  ship.head = cross(COURSE.pos, COURSE.head);
  const plain = settledSpeed(as('salvage'), wind, 1), turn = turnRate(ship);
  assert.ok(settledSpeed(as('lightHull'), wind, 1) > plain * 1.04, 'Light Hull: faster');
  assert.ok(turnRate(ship) > turn * 1.14, 'and sharper in the turn');
  ship.head = v3(-COURSE.head.x, -COURSE.head.y, -COURSE.head.z);
  const upwind = settledSpeed(as('salvage'), wind, 1);
  assert.ok(settledSpeed(as('windReader'), wind, 1) > upwind + 0.5, 'Wind Reader: less lost upwind');
  assert.equal(stackOf(as('deepHold'), ITEM.smallShield), stackOf(as('salvage'), ITEM.smallShield) + 1, 'Deep Hold: one more of each');

  // Steady Aim: fire a cannon many times while hard over, and see how far the shots stray from the aim
  const stray = (p: PassiveId): number => {
    as(p);
    place(state, G, COURSE);
    ship.rate = 1.2;
    ship.captain.on = false;
    along(COURSE.pos, COURSE.head, 120, ship.aim);
    const want = v3();
    let sum = 0;
    for (let k = 0; k < 400; k++) {
      ship.slots[0] = weaponItem(ITEM.cannon, 0);
      ship.sel = 0;
      state.shots.length = 0;
      fire(state, G);
      const s = state.shots[0];
      tangentToward(s.pos, ship.aim, want);
      sum += dacos(Math.max(-1, Math.min(1, dot(want, s.dir))));
    }
    return sum / 400;
  };
  const loose = stray('salvage'), steady = stray('steadyAim');
  assert.ok(steady < loose * 0.75, `Steady Aim: shots stray ${steady.toFixed(4)} rad, not ${loose.toFixed(4)}`);
});

// ---------------------------------------------------------------- the whale

test('the whale swims its route of deep water round the Glass Sea, surfacing and diving as it goes', (t) => {
  const state = quietMatch(), w = state.whale, c = CENTRES[WHALE_HOME];
  assert.ok(w.route.length >= 4, `${w.route.length} waypoints`);
  for (const p of w.route) assert.ok(heightAt(p) < -WHALE.deep && openAt(p) && apart(p, c) <= WHALE.roam + 1);
  const legs = new Set<number>(), said: Seen[] = [];
  let far = 0, shallow = 0;
  for (let k = 0; k < 400 / TICK; k++) {
    state.events.length = 0;
    swim(state);
    for (const e of state.events) said.push({ tick: state.tick, e });
    legs.add(w.leg);
    far = Math.max(far, apart(w.at, c));
    if (heightAt(w.at) > -1) shallow++;
    state.tick++;
  }
  const ups = said.filter((s) => s.e.kind === EVENT.whaleSurface), downs = said.filter((s) => s.e.kind === EVENT.whaleDive);
  t.diagnostic(`${ups.length} surfacings, ${downs.length} dives, ${legs.size} legs, ${far.toFixed(0)} m out at most, ${shallow} ticks over shallows`);
  assert.equal(legs.size, w.route.length, 'it swims the whole route');
  assert.ok(ups.length >= 4 && Math.abs(ups.length - downs.length) <= 1, 'surfacing and diving by turns');
  for (let k = 0; k + 1 < said.length; k++) assert.notEqual(said[k].e.kind, said[k + 1].e.kind);
  const up = ups[1].tick, down = downs.find((d) => d.tick > up)!.tick;
  assert.ok(Math.abs((down - up) * TICK - WHALE.surface) < 0.1, `up for ${WHALE.surface} s`);
  assert.ok(far <= WHALE.roam + 5, 'it keeps to the Glass Sea');
  assert.equal(shallow, 0, 'always in water deep enough');
});

test('the whale breaches under the busiest water: ships over it flip, ships near it are lifted, and loot scatters', () => {
  const state = at();
  place(state, T, spot(0, 22));
  state.whale.at = { ...spot(60).pos };
  const loot = state.loot.length;
  callBreach(state);
  assert.equal(state.whale.state, WHALE_STATE.rising);
  assert.ok(apart(state.whale.spot, state.ships[G].pos) < 1e-6, 'it rises under the ships');
  const said = watch(state, WHALE.rising + 0.1, () => null, [EVENT.whaleBreach, EVENT.flipped, EVENT.hit]);
  assert.ok(said.some((s) => s.e.kind === EVENT.whaleBreach), 'and breaches');
  const g = state.ships[G], o = state.ships[T];
  assert.ok(said.some((s) => s.e.kind === EVENT.flipped && s.e.ship === G), 'right over it, G flips');
  assert.ok(!said.some((s) => s.e.kind === EVENT.flipped && s.e.ship === T), 'T, further off, does not');
  assert.ok(g.alt > 0 && o.alt > 0, `both are lifted: ${g.alt.toFixed(1)} m and ${o.alt.toFixed(1)} m`);
  assert.ok(said.some((s) => s.e.kind === EVENT.hit && s.e.ship === G && s.e.item === CAUSE.whale));
  assert.equal(state.loot.length - loot, WHALE.loot, 'it scatters loot');
  assert.ok(g.flip > 0);
  const way = g.speed, gusts = g.gusts, cooldown = g.cooldown;
  run(state, 1, (i) => (i === G ? sailOn({ steer: 1, gust: true, ability: true }) : null));
  assert.ok(g.speed <= way + 1e-9 && g.gusts === gusts && g.cooldown === cooldown, 'flipped, she can neither sail, gust nor use her ability');
  const later = watch(state, 6, () => null, [EVENT.whaleDive]);
  assert.equal(later.length, 1, 'and it dives again');
  assert.equal(g.flip, 0, 'she rights herself');
});

test('the Storm calls the whale up as it announces its second and fourth phases', () => {
  for (const [k, called] of [[1, true], [2, false], [3, true]] as const) {
    const state = quietMatch();
    let t = STORM.first;
    for (let p = 0; p < k; p++) t += STORM.phases[p].wait + STORM.phases[p].shrink;
    state.tick = Math.round(t / TICK) - 2;
    const said = watch(state, 3 * TICK, () => null, [EVENT.stormWait, EVENT.whaleRising]);
    const wait = said.find((s) => s.e.kind === EVENT.stormWait && s.e.item === k);
    assert.ok(wait, `phase ${k} announced`);
    assert.equal(said.some((s) => s.e.kind === EVENT.whaleRising && s.tick === wait!.tick), called, `phase ${k}: the whale ${called ? 'rises' : 'stays down'}`);
  }
});

// ---------------------------------------------------------------- rules

test('a rule a day, from the date alone, in a rotation that visits every rule each week', () => {
  for (let day = -400; day < 40000; day += 37) {
    const d = new Date(day * 86400000), iso = d.toISOString().slice(0, 10);
    assert.equal(dayNumber(iso), day, iso);
  }
  assert.throws(() => dayNumber('2026-13-01'), RangeError);
  assert.throws(() => dayNumber('1 November'), RangeError);
  assert.equal(ruleFor(undefined), RULE.none);
  const week = new Set<number>();
  for (let k = 0; k < 7; k++) week.add(ruleFor(new Date(Date.UTC(2026, 10, 1 + k)).toISOString().slice(0, 10)));
  assert.deepEqual([...week].sort(), Object.values(RULE).sort(), 'all five in any seven days');
  for (const date of ['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04']) {
    assert.equal(createMatch({ seed: 1, date }).rule, ruleFor(date), 'the match takes the day\'s rule');
  }
});

test('the rules change the match: night only, harpoons only, the double-speed Storm and full shields', () => {
  const sun = v3();
  const day = createMatch({ seed: 4, hour: 12 }), night = createMatch({ seed: 4, hour: 12, rule: RULE.nightOnly });
  sunDir(day, sun);
  assert.ok(sunUp(day) && !isNight(day, sun), 'standard: noon under the sun');
  assert.ok(!sunUp(night) && isNight(night, sun), 'night only: the sun never rises');

  const harpoons = createMatch({ seed: 4, rule: RULE.harpoonsOnly }), rng = rngFrom(17);
  assert.ok(harpoons.ships.every((s) => s.slots[0].kind === ITEM.harpoon), 'every ship starts with a harpoon');
  for (let k = 0; k < 500; k++) {
    const it = rollItem(harpoons, rng);
    if ((WEAPON_KINDS as readonly number[]).includes(it.kind)) assert.equal(it.kind, ITEM.harpoon, 'and every weapon found is one');
  }
  assert.ok(harpoons.loot.every((l) => !(WEAPON_KINDS as readonly number[]).includes(l.item.kind) || l.item.kind === ITEM.harpoon));

  assert.equal(createMatch({ seed: 4, rule: RULE.doubleStorm }).storm.scale, 0.5);
  assert.ok(createMatch({ seed: 4, rule: RULE.fullShields }).ships.every((s) => s.shield === 100), 'full shields from the start');
  assert.ok(createMatch({ seed: 4 }).ships.every((s) => s.shield === 0), 'where the standard rule starts with none');
});

// ---------------------------------------------------------------- recordings and determinism

/** A player who rides, dives at 8 s, then weaves and fires, gusts and calls a gull now and then. */
function scripted(tick: number): ShipInput {
  const t = tick * TICK, input = idleInput();
  input.dive = t >= 8 && t < 30;
  input.steer = Math.round(Math.sin(t * 0.3) * 8) / 8;
  input.throttle = t % 40 < 30 ? 1 : 0.5;
  input.fire = t % 7 < 1;
  input.aim = { x: 0, y: 0.6, z: 0.8 };
  input.aimY = 2;
  input.gust = tick % 600 === 0;
  input.select = tick % 900 === 450 ? 1 : -1;
  input.hail = tick % 1800 === 900 ? 0 : -1;
  input.ability = tick % 1200 === 300;
  return input;
}

test('a recording replays the exact input of every tick, through JSON', () => {
  const rec = recorder(), inputs: ShipInput[] = [];
  for (let tick = 0; tick < 6000; tick++) {
    const input = scripted(tick);
    inputs.push(input);
    record(rec, tick, input);
  }
  assert.ok(rec.recording.events.length < inputs.length, `${rec.recording.events.length} changes for ${inputs.length} ticks`);
  const json = parseRecording(JSON.parse(JSON.stringify(rec.recording)));
  assert.deepEqual(json, rec.recording);
  const r = replay(json);
  // what the sim sees: copyInput turns -0 into 0, as JSON does
  inputs.forEach((want, tick) => assert.deepStrictEqual(copyInput(idleInput(), inputAt(r, tick)), copyInput(idleInput(), want), `tick ${tick}`));
});

test('recording refuses invalid input, and parsing refuses invalid recordings', () => {
  const rec = recorder();
  record(rec, 0, idleInput());
  assert.throws(() => record(rec, 0, idleInput()), RangeError);
  for (const [field, value] of [['steer', 9], ['steer', Number.NaN], ['throttle', 2], ['select', 5], ['select', 1.5], ['hail', 3],
    ['aim', [0, 2, 0]], ['aimY', -100], ['fire', 1]] as const) {
    assert.throws(() => record(rec, 1, { ...idleInput(), [field]: value } as unknown as ShipInput), RangeError, `${field} ${String(value)}`);
  }
  assert.equal(rec.lastTick, 0);
  const good = { format: 2, events: [[0, 'steer', 0.5], [3, 'aim', [0, 1, 0]], [3, 'fire', true]] };
  assert.equal(parseRecording(good).events.length, 3);
  const bad: unknown[] = [
    null, 5, { events: [] }, { format: 1, events: [] }, { format: 2 },
    { format: 2, events: [[0, 'steer']] },
    { format: 2, events: [[0, 'steer', 0.5, 6]] },
    { format: 2, events: [[0, 'rudder', 0.5]] },
    { format: 2, events: [[-1, 'steer', 0.5]] },
    { format: 2, events: [[0.5, 'steer', 0.5]] },
    { format: 2, events: [[5, 'steer', 0.5], [4, 'throttle', 1]] },
    { format: 2, events: [[0, 'steer', 200]] },
    { format: 2, events: [[0, 'aim', [0, 1]]] },
    { format: 2, events: [[0, 'fire', 'yes']] },
  ];
  for (const data of bad) assert.throws(() => parseRecording(data), TypeError, JSON.stringify(data));
});

test('the same seed and inputs give the same match; a match resumed from a snapshot ends identical', () => {
  const rec = recorder(), end = 4000;
  const a = createMatch({ seed: 21, fleet: [{ captain: false }] });
  while (a.tick < end) {
    const input = scripted(a.tick);
    record(rec, a.tick, input);
    step(a, input);
  }
  const recording = parseRecording(JSON.parse(JSON.stringify(rec.recording)));
  const b = createMatch({ seed: 21, fleet: [{ captain: false }] });
  runMatch(b, recording, end);
  assert.equal(matchHash(b), matchHash(a), 'replayed from the recording');

  const c = createMatch({ seed: 21, fleet: [{ captain: false }] });
  runMatch(c, recording, 1777);
  const d = decodeMatch(encodeMatch(c));
  assert.equal(matchHash(d), matchHash(c), 'a snapshot is the state');
  const r = replay(recording);
  while (d.tick < end) step(d, inputAt(r, d.tick));
  assert.equal(matchHash(d), matchHash(a), 'resumed from the snapshot');

  const e = createMatch({ seed: 21, fleet: [{ captain: false }] });
  runMatch(e, recording, end - 1);
  const off = scripted(end - 1);
  off.steer = -off.steer + 0.125;
  step(e, off);
  assert.notEqual(matchHash(e), matchHash(a), 'one different input shows in the hash');
});

// ---------------------------------------------------------------- twenty ships

test('twenty captains sail, loot, fight, use consumables and flee the Storm: headless matches run to a winner (a crash test only)', (t) => {
  for (const seed of [3, 11, 29, 47]) {
    const state = createMatch({ seed, fleet: [{ captain: seed % 2 === 1 }] });
    const seen = new Map<number, number>();
    const t0 = performance.now();
    while (state.winner < 0 && state.tick < 60 * 60 * 30) {
      step(state);
      for (const e of state.events) seen.set(e.kind, (seen.get(e.kind) ?? 0) + 1);
    }
    const ms = (performance.now() - t0) / state.tick, n = (k: number) => seen.get(k) ?? 0;
    t.diagnostic(`seed ${seed}: ship ${state.winner} wins after ${(state.tick * TICK / 60).toFixed(1)} min, ${ms.toFixed(3)} ms a tick; `
      + `${n(EVENT.fire)} shots, ${n(EVENT.pickup)} pickups, ${n(EVENT.useDone)} consumables, ${n(EVENT.ability)} abilities, `
      + `${n(EVENT.deliveryArrived)} deliveries, ${n(EVENT.claim)} claims`);
    assert.ok(state.winner >= 0, 'a winner');
    assert.equal(n(EVENT.landing), SHIPS, 'everyone came down from the Gale');
    assert.equal(n(EVENT.sink), SHIPS - 1);
    for (const kind of [EVENT.fire, EVENT.hit, EVENT.pickup, EVENT.useDone, EVENT.ability, EVENT.stormShrink, EVENT.gust]) {
      assert.ok(n(kind) > 0, `${'' + kind} happened`);
    }
    const r = result(state);
    assert.deepEqual(r.ships.map((s) => s.place).sort((x, y) => x - y), Array.from({ length: SHIPS }, (_, i) => i + 1), 'every place given once');
    assert.equal(r.ships[state.winner].place, 1);
  }
});

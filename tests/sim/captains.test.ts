// WP11 part A, the captains' brain, headless: perception (nothing beyond a captain's sight changes its decision);
// inputs a player could give; each core skill in a scene (a loop drawn and banked, a visible trail broken with the
// strike telegraphed, the storm outrun, a broadside brought to bear and better gunners hitting more, home when a
// rival threatens the purse, a chest taken); rank's reaction time; the first voyage's gentleness; determinism and
// snapshot/resume mid-thought; and nine captains' tick cost against A9.
//   node --test tests/sim/captains.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MODE, helm, intent, think } from '../../src/sim/captains/brain.ts';
import { aground, greatCurrentAt, seaFor } from '../../src/sim/environment.ts';
import { gullEyes } from '../../src/sim/gull.ts';
import { FLAG, idleInput, record, recorder, type ShipInput } from '../../src/sim/input.ts';
import { lastInputs, step } from '../../src/sim/match.ts';
import { dot, set, v3, type V3 } from '../../src/sim/math.ts';
import { R, TERRITORY, advance, cellOf, tangentAt, tangentToward } from '../../src/sim/sphere.ts';
import {
  EVENT, PHASE, SAIL, SHIPS, TICK, createMatch, decodeMatch, encodeMatch, matchHash, type MatchState, type Mind, type Outfit,
} from '../../src/sim/state.ts';
import { FORMS } from '../../src/sim/tables.ts';
import { inkHome } from '../../src/sim/territory.ts';
import { newSight, survey } from '../../src/sim/visibility.ts';
import { ZONE } from '../../src/sim/world/geography.ts';
import { world } from './vectors.ts';

const SEED = 20261024, sea = seaFor(world(), SEED);
const S = (seconds: number): number => Math.round(seconds / TICK);
const IDLE = idleInput();

/** The player and nine captains of a rank tier, each outfit amended by `amend`. */
function fleet(tier = 4, amend: (i: number) => Outfit = () => ({})): Outfit[] {
  return Array.from({ length: SHIPS }, (_, i) => (i === 0 ? {} : { captain: { temperament: (i - 1) % 6, tier }, ...amend(i) }));
}
const NONE = { value: -1, confidence: 0 };
const gentleMind = (): Mind => ({ gentle: true, grudge: 0, breakOff: NONE, loop: NONE, raids: NONE, run: NONE, storm: NONE, fittings: [] });
const nobody = (i: number): Outfit => (i === 1 ? {} : { captain: undefined });

function run(state: MatchState, ticks: number, each?: (s: MatchState) => void): void {
  for (let k = 0; k < ticks; k++) {
    step(sea, state, IDLE);
    each?.(state);
  }
}

const T1 = v3(), T2 = v3();
/** The point d u from p on bearing b. */
function at(p: V3, b: number, d: number): V3 {
  const out = v3();
  tangentAt(p, b, T1);
  advance(p, T1, d, out, T2);
  return out;
}

function clear(state: MatchState, p: V3): boolean {
  const f = greatCurrentAt(sea, p, v3());
  return !aground(sea, state, p) && f.x === 0 && f.y === 0 && f.z === 0
    && (sea.geo.zones[cellOf(TERRITORY, p)] & (ZONE.hot | ZONE.vortex | ZONE.kelp)) === 0;
}

/** Open sea: a point with clear water `r` u every way, off the Great Current, found spiralling out from `from`. */
function openSea(state: MatchState, from: V3, r = 40): V3 {
  for (let k = 0; k < 4000; k++) {
    const p = at(from, k * 2.39996, 6 * Math.sqrt(k));
    let ok = clear(state, p);
    for (let b = 0; ok && b < 12; b++) for (const d of [r / 3, (2 * r) / 3, r]) ok &&= clear(state, at(p, (b * Math.PI) / 6, d));
    if (ok) return p;
  }
  throw new Error('no open sea');
}

/** Ship i at p, sailing on bearing b. */
function place(state: MatchState, i: number, p: V3, b = 0): void {
  const ship = state.ships[i];
  ship.phase = PHASE.sailing;
  set(ship.pos, p.x, p.y, p.z);
  set(ship.was, p.x, p.y, p.z);
  tangentAt(p, b, ship.head);
  set(ship.wasHead, ship.head.x, ship.head.y, ship.head.z);
  ship.speed = 2;
}

/** A scene: only the ships kept stay in the match. */
function scene(outfits: Outfit[], keep: number[], minds?: (Mind | null)[]): MatchState {
  const state = createMatch({ seed: SEED, fleet: outfits, minds });
  for (let j = 0; j < SHIPS; j++) {
    if (keep.includes(j)) continue;
    state.ships[j].phase = PHASE.sunk;
    state.ships[j].hull = 0;
  }
  return state;
}

/** An open trail of ship j, `len` u from `from` on bearing b, laid in clear air. */
function lay(state: MatchState, j: number, from: V3, b: number, len: number): void {
  const ship = state.ships[j];
  for (let d = 0; d <= len; d += 0.5) {
    const c = cellOf(TERRITORY, at(from, b, d));
    if (ship.laid[ship.laid.length - 1] === c) continue;
    ship.laid.push(c);
    ship.fogged.push(false);
    state.trail[c] = j + 1;
  }
}

/** Captain i's decision now, through a fresh survey: its input and its record. */
function decision(state: MatchState, i: number): { input: ShipInput; record: string } {
  const sights = survey(sea, state, Array.from({ length: SHIPS }, newSight), gullEyes(state));
  const input = helm(state, i, idleInput());
  state.ships[i].captain.think = 1;
  think(sea, state, i, sights[i], input);
  return { input, record: JSON.stringify(state.ships[i].captain) };
}

const OPEN = openSea(createMatch({ seed: SEED }), createMatch({ seed: SEED }).ships[1].pos);
const counts = (s: MatchState, kind: number, ship: number, by?: number): number =>
  s.events.filter((e) => e.kind === kind && e.ship === ship && (by === undefined || e.by === by)).length;

test('a captain decides from its sight alone: a ship, a trail or a chest beyond it changes nothing', () => {
  const decide = (hide: (s: MatchState) => void): string => {
    const s = scene(fleet(), [1, 2, 3]);
    place(s, 1, OPEN, 0);
    hide(s);
    return JSON.stringify(decision(s, 1));
  };
  const bare = decide((s) => {
    place(s, 2, at(OPEN, 2, 150), 1);
    place(s, 3, at(OPEN, 4, 150), 1);
  });
  const hidden = decide((s) => {
    place(s, 2, at(OPEN, 1, 110), 3); // over the horizon
    place(s, 3, at(OPEN, 0.6, 12), 2); // close by, under a fog flask, its trail across the bow hidden with it
    s.ships[3].flask = 10;
    lay(s, 3, at(OPEN, -0.4, 15), 1.2, 25);
    s.chests.push({ at: at(OPEN, 0.1, 100), tier: 4, fitting: { kind: 0, tier: 0 }, from: -1 }); // beyond its lookout
  });
  assert.equal(hidden, bare, 'nothing it could not see moved it');
  const seen = decide((s) => {
    place(s, 2, at(OPEN, 2, 150), 1);
    place(s, 3, at(OPEN, 0.6, 12), 2);
    lay(s, 3, at(OPEN, -0.4, 15), 1.2, 25);
  });
  assert.notEqual(seen, bare, 'the same rival and trail in sight do move it');
});

test('captains act only through inputs a player could give; they break off by choice, draw loops and bank them', () => {
  const s = createMatch({ seed: SEED, fleet: fleet(5), rank: 5 });
  const recorders = Array.from({ length: SHIPS }, recorder), off = new Set<number>(), ticks = new Set<number>(), loopers = new Set<number>();
  let acted = 0;
  run(s, S(180), (state) => {
    const inputs = lastInputs();
    for (let i = 1; i < SHIPS; i++) {
      record(recorders[i], state.tick - 1, inputs[i]); // throws on any field a player's touch could not set
      if (inputs[i].flags !== 0 || inputs[i].course !== null || inputs[i].consumable >= 0 || inputs[i].chestPick >= 0) acted++;
    }
    for (const e of state.events) {
      if (e.ship === 0) continue;
      if (e.kind === EVENT.breakOff) {
        off.add(e.ship);
        ticks.add(state.tick);
      }
      if (e.kind === EVENT.loop) loopers.add(e.ship);
    }
  });
  assert.ok(acted > 100, `captains worked their controls (${acted})`);
  assert.ok(off.size >= 6 && ticks.size >= 3, `captains broke off by choice at different moments (${off.size} ships, ${ticks.size} ticks)`);
  assert.ok(loopers.size >= 3, `captains closed loops (${loopers.size})`);
  assert.ok(s.ships.slice(1).filter((ship) => ship.captain.loops > 0 && ship.bank > 0).length >= 3, 'and banked');
});

test('a captain breaks an open trail it can see, telegraphing the strike', () => {
  const s = scene(fleet(6, nobody), [1, 2]);
  place(s, 1, OPEN, 0);
  place(s, 2, at(OPEN, Math.PI, 150), Math.PI); // its owner far out of sight
  const from = at(OPEN, 0.5, 25);
  lay(s, 2, from, 2, 30);
  decision(s, 1);
  const c = s.ships[1].captain, to = tangentToward(s.ships[1].pos, from, v3()), arrow = intent(s, 1, v3());
  assert.equal(c.mode, MODE.hunt);
  assert.ok(c.tell > 0, 'it telegraphs');
  assert.ok(dot(arrow, to) > dot(s.ships[1].head, to) + 0.1, 'its arrow points at the trail before its bow does');
  let broken = 0;
  run(s, S(30), (state) => (broken += counts(state, EVENT.broken, 2, 1)));
  assert.ok(broken > 0, 'the trail broke');
});

test('a captain outruns the storm', () => {
  const s = scene(fleet(6, nobody), [1, 2]);
  s.tick = S(160); // the first phase has swept and holds
  const calm = s.storm.calms[0];
  let p: V3 | null = null;
  for (let b = 0; b < 128 && p === null; b++) {
    const q = at(calm.at, b * 0.37, calm.r * R + 30);
    if ([0, 1, 2, 3, 4, 5].every((k) => clear(s, at(q, k, 12))) && clear(s, q)) p = q;
  }
  assert.ok(p, 'a stretch of open sea in the storm');
  place(s, 1, p, 0);
  inkHome(s, 1); // its home in the storm's path: it must leave it
  place(s, 2, calm.at, 0);
  const before = dot(s.ships[1].pos, calm.at);
  let fled = false;
  run(s, S(25), (state) => (fled ||= state.ships[1].captain.mode === MODE.storm));
  assert.ok(fled, 'it judged the storm');
  assert.ok(dot(s.ships[1].pos, calm.at) > before, 'and made for the calm');
});

test('a captain brings its broadside to bear, and better gunners hit more', () => {
  const duel = (gunnery: number, b: number): { hits: number; fired: number } => {
    const s = scene(fleet(6, (i) => (i === 1 ? { gunnery } : { captain: undefined })), [1, 2]);
    place(s, 1, OPEN, b);
    place(s, 2, at(OPEN, b + 0.5, 16), b + 1.2); // a rival 16 u off, sailing its own way under reefed sails
    s.ships[2].sail = SAIL.reefed;
    let hits = 0, fired = 0;
    run(s, S(40), (state) => {
      hits += counts(state, EVENT.hit, 2, 1);
      fired += counts(state, EVENT.broadside, 1);
    });
    return { hits, fired };
  };
  let sharp = 0, wild = 0, fired = 0;
  for (const b of [0, 2, 4]) {
    const good = duel(1, b), poor = duel(0, b);
    sharp += good.hits;
    wild += poor.hits;
    fired += good.fired;
  }
  assert.ok(fired > 0 && sharp > 0, `it fought (${fired} broadsides, ${sharp} hits)`);
  assert.ok(sharp > wild, `leading gunners hit more (${sharp} against ${wild})`);
});

test('a captain cuts its loop short and heads home when a rival threatens its purse', () => {
  const s = scene(fleet(8, nobody), [1, 2]);
  place(s, 1, OPEN, 0);
  inkHome(s, 1);
  decision(s, 1); // its home's heart noted
  const out = at(OPEN, 0, 26);
  lay(s, 1, at(OPEN, 0, 11), 0, 15);
  place(s, 1, out, 0);
  s.ships[1].purse = 0.6 * FORMS[s.ships[1].form].purse;
  place(s, 2, at(out, 1, 15), 4);
  decision(s, 1);
  assert.equal(s.ships[1].captain.mode, MODE.home);
  assert.ok((helm(s, 1, idleInput()).flags & FLAG.headHome) !== 0, 'head home held');
});

test('a captain sails to a chest it sees and takes its pick', () => {
  const s = scene(fleet(4, nobody), [1, 2]);
  place(s, 1, OPEN, 0);
  place(s, 2, at(OPEN, Math.PI, 150), 0);
  s.chests.push({ at: at(OPEN, 0.4, 14), tier: 2, fitting: { kind: 0, tier: 0 }, from: -1 });
  let opened = 0, chosen = 0;
  run(s, S(30), (state) => {
    opened += counts(state, EVENT.opened, 1);
    chosen += counts(state, EVENT.chosen, 1);
  });
  assert.equal(s.chests.length, 0, 'the chest was taken');
  assert.ok(opened > 0 && chosen > 0, 'opened and chosen from');
});

test('rank: a higher-ranked captain reacts faster', () => {
  const pause = (tier: number): number => {
    const s = scene(fleet(tier, nobody), [1, 2]);
    place(s, 1, OPEN, 0);
    place(s, 2, at(OPEN, 2, 150), 0);
    let sum = 0;
    for (let k = 0; k < 20; k++) {
      decision(s, 1);
      sum += s.ships[1].captain.think;
    }
    return sum / 20;
  };
  assert.ok(pause(8) < pause(1) / 2);
});

test("the first voyage's captains are gentle: they neither raid, fight nor ram the player", () => {
  const sail = (minds: (Mind | null)[] | undefined, tier: number): Set<number> => {
    const s = scene(fleet(tier, nobody), [0, 1], minds);
    s.charm = false;
    place(s, 1, OPEN, 0);
    place(s, 0, at(OPEN, 0.5, 14), 2);
    lay(s, 0, at(OPEN, -0.3, 20), 1.5, 30);
    const modes = new Set<number>();
    run(s, S(30), (state) => {
      const c = state.ships[1].captain;
      if (c.target === 0) modes.add(c.mode);
    });
    return modes;
  };
  const gentle = sail([null, ...Array.from({ length: SHIPS - 1 }, gentleMind)], 1);
  for (const m of [MODE.hunt, MODE.fight, MODE.ram]) assert.ok(!gentle.has(m), `a gentle captain never turns on the player (mode ${m})`);
  const seasoned = sail(undefined, 6);
  assert.ok([MODE.hunt, MODE.fight, MODE.ram].some((m) => seasoned.has(m)), 'a seasoned one does');
});

test('captains are deterministic and resume mid-thought from a snapshot', () => {
  const a = createMatch({ seed: SEED, fleet: fleet(3) }), b = createMatch({ seed: SEED, fleet: fleet(3) });
  run(a, S(75));
  run(b, S(75));
  assert.equal(matchHash(a), matchHash(b));
  assert.ok(a.ships.slice(1).some((ship) => ship.captain.think > 1 && ship.captain.mode > MODE.peel), 'mid-thought');
  const resumed = decodeMatch(encodeMatch(a));
  run(a, S(45));
  run(resumed, S(45));
  assert.equal(matchHash(resumed), matchHash(a));
});

test('nine captains keep the tick within A9 (Node mean ≤ 0.3 ms)', (t) => {
  const cost = (outfits: Outfit[]): { mean: number; p99: number; cpu: number } => {
    const s = createMatch({ seed: SEED, fleet: outfits, rank: 6 });
    run(s, S(120)); // past the break-offs, loops under way, the storm's first phase announced
    const n = S(120), times = new Float64Array(n), cpu0 = process.cpuUsage();
    for (let k = 0; k < n; k++) {
      const t0 = performance.now();
      step(sea, s, IDLE);
      times[k] = performance.now() - t0;
    }
    const cpu = process.cpuUsage(cpu0);
    times.sort();
    return { mean: times.reduce((a, b) => a + b, 0) / n, p99: times[Math.floor(0.99 * n)], cpu: (cpu.user + cpu.system) / 1000 / n };
  };
  const bare = cost(fleet(6, () => ({ captain: undefined }))), crewed = cost(fleet(6));
  t.diagnostic(`tick with nine captains: CPU mean ${crewed.cpu.toFixed(3)} ms, wall mean ${crewed.mean.toFixed(3)} ms, p99 ${crewed.p99.toFixed(3)} ms; without: CPU mean ${bare.cpu.toFixed(3)} ms, p99 ${bare.p99.toFixed(3)} ms`);
  assert.ok(crewed.cpu < 0.3, `CPU mean ${crewed.cpu.toFixed(3)} ms`);
});

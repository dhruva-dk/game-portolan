// WP11 part A, the captains' brain, headless: perception (nothing beyond a captain's sight changes its decision);
// inputs a player could give; each core skill in a scene (a loop drawn and banked, a visible trail broken with the
// strike telegraphed, the storm outrun, a broadside brought to bear and better gunners hitting more, home when a
// rival threatens the purse, a chest taken); rank's reaction time; the first voyage's gentleness; determinism and
// snapshot/resume mid-thought; and nine captains' tick cost against A9.
//   node --test tests/sim/captains.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MODE, helm, intent, think } from '../../src/sim/captains/brain.ts';
import { apart } from '../../src/sim/captains/perception.ts';
import { reachOf, standoff, styleOf } from '../../src/sim/captains/temperaments.ts';
import { aground, greatCurrentAt, seaFor } from '../../src/sim/environment.ts';
import { gullEyes } from '../../src/sim/gull.ts';
import { startingFittings } from '../../src/sim/items.ts';
import { FLAG, idleInput, record, recorder, type ShipInput } from '../../src/sim/input.ts';
import { lastInputs, step } from '../../src/sim/match.ts';
import { dot, set, v3, type V3 } from '../../src/sim/math.ts';
import { R, TERRITORY, advance, cellDir, cellOf, tangentAt, tangentToward } from '../../src/sim/sphere.ts';
import {
  EVENT, PHASE, SAIL, SHIPS, TICK, createMatch, decodeMatch, encodeMatch, matchHash, type MatchState, type Mind, type Outfit,
} from '../../src/sim/state.ts';
import { FITTING, FORMS, HOME, SLOT } from '../../src/sim/tables.ts';
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

// ---------------------------------------------------------------------------------------------------------------
// Temperaments (temperaments.ts): each one's own sailing, shown in a short scene, and every captain's signature.

const T = { hunter: 0, expander: 1, raider: 2, turtle: 3, opportunist: 4, gambler: 5 } as const;
/** Captain 1 of temperament t (tier 6), its outfit amended, and the ships in `keep` without captains. */
const lone = (t: number, keep: number[], amend: Outfit = {}): MatchState =>
  scene(fleet(6, (i) => (i === 1 ? { captain: { temperament: t, tier: 6 }, ...amend } : { captain: undefined })), [1, ...keep]);
/** How nearly ship i's chart arrow points at p (1: dead on). */
const bearing = (s: MatchState, i: number, p: V3): number => dot(intent(s, i, v3()), tangentToward(s.ships[i].pos, p, v3()));
const closing = (mode: number): boolean => mode === MODE.stalk || mode === MODE.fight || mode === MODE.ram;
/** Starting fittings of tier 6 with these FITTING kinds by SLOT. */
function fitted(kinds: Record<number, number>): Outfit {
  return { fittings: startingFittings(6).map((f, slot) => (slot in kinds ? { kind: kinds[slot], tier: 1 } : { ...f })) };
}

test('a hunter stalks a wounded ship from beyond its guns, where an expander lets it be', () => {
  const [hunter, expander] = [T.hunter, T.expander].map((t) => {
    const s = lone(t, [2], fitted({ [SLOT.broadside]: FITTING.none, [SLOT.bow]: FITTING.none })); // no guns, no ram: it can only stalk
    place(s, 1, OPEN, 0);
    place(s, 2, at(OPEN, 0.3, 15), 2);
    s.ships[2].hull *= 0.4;
    decision(s, 1);
    return { mode: s.ships[1].captain.mode, arrow: bearing(s, 1, s.ships[2].pos) };
  });
  assert.equal(hunter.mode, MODE.stalk);
  assert.ok(hunter.arrow > 0.5, 'its arrow toward the wounded ship, led for where it will be');
  assert.ok(!closing(expander.mode), `the expander keeps to its business (mode ${expander.mode})`);
});

test('a turtle turns to face an intruder in its waters, reefed, before it strikes; an expander does not', () => {
  const [s, e] = [T.turtle, T.expander].map((t) => {
    const st = lone(t, [2]);
    place(st, 1, OPEN, 0);
    place(st, 2, at(OPEN, Math.PI / 2, HOME.radius), Math.PI);
    decision(st, 1);
    return st;
  });
  const c = s.ships[1].captain, to = tangentToward(s.ships[1].pos, s.ships[2].pos, v3());
  assert.equal(c.mode, MODE.face);
  assert.equal(c.trim, SAIL.reefed, 'it squares up');
  assert.ok(c.tell > 0 && bearing(s, 1, s.ships[2].pos) > 0.95 && dot(s.ships[1].head, to) < 0.5, 'its arrow swings onto the intruder before its bow');
  let struck = false;
  run(s, S(4), (st) => (struck ||= closing(st.ships[1].captain.mode)));
  assert.ok(struck, 'then it strikes');
  assert.notEqual(e.ships[1].captain.mode, MODE.face);
});

test('a raider breaks trails for the purse and runs for home with it, where a hunter strikes on', () => {
  const after = (t: number, purse: number): number => {
    const s = lone(t, [2]), ship = s.ships[1];
    place(s, 1, OPEN, 0);
    place(s, 2, at(OPEN, Math.PI, 150), Math.PI); // the trail's owner far out of sight
    lay(s, 2, at(OPEN, 0.5, 25), 2, 30);
    decision(s, 1); // its home inks where it stands; the trail draws it
    ship.held = 1000;
    ship.purse = purse * FORMS[ship.form].purse;
    lay(s, 1, OPEN, Math.PI / 2, 6); // its own trail open
    decision(s, 1);
    return ship.captain.mode;
  };
  assert.equal(after(T.raider, 0), MODE.hunt, 'an empty purse: it raids');
  assert.equal(after(T.raider, 0.5), MODE.home, 'a purse worth the raid: it runs for home');
  assert.equal(after(T.hunter, 0.5), MODE.hunt, 'a hunter strikes on');
});

test('an opportunist lies off a fight between others and pounces on the one it weakens', () => {
  const lurker = (t: number): MatchState => {
    const s = lone(t, [2, 3]), mid = at(OPEN, 0.4, 30);
    place(s, 1, OPEN, 0);
    place(s, 2, at(mid, 0.4 + Math.PI, 7), Math.PI / 2);
    place(s, 3, at(mid, 0.4, 7), Math.PI / 2);
    decision(s, 1);
    return s;
  };
  const s = lurker(T.opportunist), c = s.ships[1].captain, off = apart(c.goal, at(OPEN, 0.4, 30));
  assert.equal(c.mode, MODE.lurk);
  assert.ok(off > 25 && off < 45, `it lies ${off.toFixed(1)} u off the fight`);
  s.ships[2].hull *= 0.3;
  decision(s, 1);
  assert.ok(closing(s.ships[1].captain.mode), `it pounces (mode ${s.ships[1].captain.mode})`);
  assert.notEqual(lurker(T.expander).ships[1].captain.mode, MODE.lurk);
});

test('a gambler draws enormous loops and visibly commits to each, swinging round to it before it sets out', () => {
  const s = createMatch({ seed: SEED, fleet: fleet(6, (i) => (i === 1 ? { captain: { temperament: T.gambler, tier: 6 } } : i === 4 ? {} : { captain: undefined })) });
  const far = [0, 0];
  let committed = 0, swung = 0;
  run(s, S(150), (st) => {
    [1, 4].forEach((i, k) => st.ships[i].phase === PHASE.sailing && (far[k] = Math.max(far[k], apart(st.ships[i].pos, st.ships[i].captain.anchor))));
    const c = st.ships[1].captain;
    if (c.plan.length === 0 || c.tell === 0) return;
    committed++;
    if (bearing(st, 1, cellDir(TERRITORY, c.plan[c.plan.length >> 1], v3())) > 0.9) swung++;
  });
  assert.ok(committed > 0 && swung > 0, `it commits (${committed} ticks, arrow on the loop ${swung})`);
  assert.ok(far[0] > 2 * far[1], `its loops reach ${far[0].toFixed(0)} u, a turtle's ${far[1].toFixed(0)} u`);
});

test('a captain aims its mortar by hand, where the rival will be', () => {
  const s = lone(T.hunter, [2], fitted({ [SLOT.stern]: FITTING.mortar }));
  place(s, 1, OPEN, 0);
  place(s, 2, at(OPEN, 0.6, 28), 0.6 + Math.PI / 2);
  s.ships[2].speed = 6;
  const { input } = decision(s, 1);
  assert.ok((input.flags & FLAG.useAimed) !== 0 && input.aim >= 0, 'it fires at a point, as a drag would');
  const lead = apart(cellDir(TERRITORY, input.aim, v3()), s.ships[2].pos);
  assert.ok(lead > 1 && lead < 12, `led ${lead.toFixed(1)} u ahead of the rival`);
});

test('every league captain sails its temperament under its own signature, the same in every match', () => {
  const base = createMatch({ seed: SEED, fleet: fleet(6) }).ships[1];
  const of = (id: number): ReturnType<typeof styleOf> => styleOf({ ...base, pigment: id, captain: { ...base.captain, temperament: Math.floor(id / 5) } });
  const all = Array.from({ length: 30 }, (_, id) => of(id));
  assert.equal(new Set(all.map((x) => JSON.stringify(x))).size, 30, 'thirty signatures');
  assert.equal(new Set(all.map((x) => Math.sign(x.wheel))).size, 2, 'loops wheeling both ways round their homes');
  assert.deepEqual(styleOf(createMatch({ seed: SEED + 1, fleet: fleet(6, () => ({ pigment: 7 })) }).ships[2]), of(7), 'Marea sails the same in another match');
  for (let g = 25; g < 30; g++) for (let t = 15; t < 20; t++) assert.ok(of(g).loop > 2 * of(t).loop, 'every gambler loops wider than every turtle');
  assert.ok(all.every((x, id) => (x.bold >= 0.7) === (id >= 25 || (id >= 10 && id < 15))), 'raiders and gamblers ride the vortex, no one else');
});

test('captains sail by the habits of the player they know: its fittings, its loops, its raids', () => {
  const sure = (value: number): { value: number; confidence: number } => ({ value, confidence: 900 });
  const mind: Mind = { gentle: false, grudge: 0, breakOff: NONE, loop: sure(70), raids: sure(30), run: NONE, storm: NONE, fittings: [FITTING.ironRam] };
  const s = createMatch({ seed: SEED, fleet: fleet(6), minds: Array.from({ length: SHIPS }, (_, i) => (i === 0 ? null : mind)) });
  const naive = createMatch({ seed: SEED, fleet: fleet(6) });
  const [hunter, expander] = [s.ships[1], s.ships[2]];
  assert.deepEqual(hunter.captain.fittings, [FITTING.ironRam]);
  assert.deepEqual(decodeMatch(encodeMatch(s)).ships[1].captain.fittings, [FITTING.ironRam], 'carried through a snapshot');
  assert.ok(standoff(hunter.captain, styleOf(hunter), 0) > standoff(hunter.captain, styleOf(hunter), 3), 'it lies farther off a player who favours the ram');
  assert.ok(reachOf(hunter.captain, styleOf(hunter), HOME.radius) > reachOf(naive.ships[1].captain, styleOf(naive.ships[1]), HOME.radius), 'a hunter patrols beyond the player\'s loops');
  assert.ok(reachOf(expander.captain, styleOf(expander), HOME.radius) < reachOf(naive.ships[2].captain, styleOf(naive.ships[2]), HOME.radius), 'it draws its loops in, guarding its trail from a raider');
});

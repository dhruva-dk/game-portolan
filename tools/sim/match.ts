// One match, sailed headless on the game's own state (play/state.ts start and
// advance), every ship a bot, and recorded: events.jsonl and ships.jsonl as it
// goes (log.ts), summary.json at its end (the account, metrics.ts, with what
// the record kept). The same scenario sails the same match, to the bit,
// wherever it runs: summary.hash says so.
//
// Two kinds of fleet: the match the game deals (SHIPS ships, the brains named
// round them), or a race of `race.teams` teams of `race.ships` spec ships
// (play/race.ts specField: a duel is two teams of one), sailed by its card.
//
// Node only (tools/).

import { join } from 'node:path';
import { RIDE } from '../../src/sim/ride.ts';
import { createMatches } from '../../src/play/setup.ts';
import { raceOf, specField } from '../../src/play/race.ts';
import { createState, debugOf, type Match } from '../../src/play/state.ts';
import type { RaceCard } from '../../src/race.ts';
import { STEP } from '../../src/sim/fixed.ts';
import { SHIPS } from '../../src/sim/match.ts';
import { berths } from '../../src/sim/spawn.ts';
import { CASCADES } from '../../src/world/cascades.ts';
import { FREQUENCY, anchors, icosphere } from '../../src/world/lattice.ts';
import { hash } from '../../src/world/random.ts';
import { createSwell, flat, type Hull } from '../../src/world/swell.ts';
import { distance, type Vec3 } from '../../src/world/sphere.ts';
import { MEAN } from '../../src/world/weather.ts';
import { createWind } from '../../src/world/wind.ts';
import { lines, writeJson } from '../out.ts';
import { brainNamed } from './brains.ts';
import { record } from './log.ts';
import { watch, type MatchResult } from './metrics.ts';
import { standIn, type Thumb } from './player.ts';
import { ruledBy } from './rules.ts';
import { typeNamed } from './types.ts';
import { worldOf } from './world.ts';

/**
 * A match to sail. `planet`: its seed (the game's if not given); `match`: the
 * match dealt on it (1 the first after the lobby's); `race`: sail a race of
 * spec ships on that match's seed instead (`close`: berthed together, the
 * first of the match's berths and those nearest it, so they meet at once). For a dealt match only: `brains`
 * by name (brains.ts; ship id sails brains[(id + match) % length]), `type`
 * (types.ts), `rules` (rules.ts), every `players`-th ship's gun laid by a
 * stand-in for a player with `thumb` (player.ts). `seconds`: the most it runs
 * (the storm's course and two minutes more if not given). `sea`: flat (as the
 * bots are tuned on) or the swell the game draws (slower; its cost shows in
 * the step's `ride`).
 */
export interface MatchScenario {
  kind: 'match';
  planet?: number;
  match?: number;
  race?: { teams: number; ships: number; close?: boolean };
  brains?: string[];
  type?: string;
  rules?: string;
  players?: number;
  thumb?: Thumb;
  seconds?: number;
  sea?: 'flat' | 'swell';
}

export type State = ReturnType<typeof createState>;

/** The swell as play/game.ts builds it, on a planet. */
function swellOf(seed: number, height: (p: Vec3) => number): Hull {
  const sea = anchors(icosphere(FREQUENCY), createWind(seed), CASCADES[0]);
  return createSwell(sea, height, MEAN.wind, { shortest: RIDE.shortest }).hull;
}

/** A race of `teams` teams of `ships` spec ships, numbered afresh. */
function cardOf(seed: number, teams: number, ships: number): RaceCard {
  const full = specField(seed, teams);
  const kept = full.ships.filter(
    (s) => s.id % (full.ships.length / teams) < ships
  );
  return { ...full, ships: kept.map((s, id) => ({ ...s, id })) };
}

/** What sailing a match comes to: its summary (also summary.json, if written). */
export type Summary = ReturnType<typeof summaryOf>;

/** The scenario sailed; its logs and summary written into `dir`, if given. */
export function runMatch(sc: MatchScenario, dir?: string): Summary {
  const w = worldOf(sc.planet),
    n = sc.match ?? 1;
  if (sc.race && (sc.brains || sc.type || sc.rules || sc.players))
    throw new Error(
      'a race is sailed by its card: no brains, type, rules or players'
    );
  const brains = sc.brains ?? ['default'];
  const brainOf = (id: number) =>
    sc.race ? 'card' : brains[(id + n) % brains.length];
  const byName = new Map(brains.map((b) => [b, brainNamed(b)]));
  const matches = createMatches(
    w.seed,
    w.planet,
    null,
    null,
    ruledBy(typeNamed(sc.type), sc.rules)
  );
  let dealt = matches.deal();
  for (let k = 1; k < n; k++) dealt = matches.deal();
  let m: Match = sc.race
    ? raceOf(cardOf(dealt.seed, sc.race.teams, sc.race.ships), w.planet)
    : dealt;
  if (sc.race?.close) {
    const all = berths(w.waters.water, m.seed, SHIPS, w.depth),
      first = all[0].at;
    const near = [...all].sort(
      (x, y) => distance(x.at, first) - distance(y.at, first)
    );
    m = { ...m, berths: near.slice(0, sc.race.teams * sc.race.ships) };
  }
  return sail(m, w, sc, brainOf, (id) => byName.get(brainOf(id))!, dir);
}

function sail(
  m: Match,
  w: ReturnType<typeof worldOf>,
  sc: MatchScenario,
  brainOf: (id: number) => string,
  brain: ((id: number) => ReturnType<typeof brainNamed>) | undefined,
  dir: string | undefined
) {
  const sea = sc.sea === 'swell' ? swellOf(w.seed, w.planet.height) : flat;
  const state = createState(w.planet, sea, w.waters, m, brain);
  state.start(m, false);
  const players = new Set<number>();
  if (sc.players)
    for (const k of state.ships())
      if ((k.id + (sc.match ?? 1)) % sc.players === 0) {
        players.add(k.id);
        debugOf(state).standIn(k.id, standIn(hash(m.seed, k.id), sc.thumb));
      }
  const course = m.type.rules.storm.phases.reduce(
      (t, p) => t + p.wait + p.close,
      0
    ),
    end = sc.seconds ?? course + 120;
  const events = dir ? lines(join(dir, 'events.jsonl')) : null,
    ships = dir ? lines(join(dir, 'ships.jsonl')) : null;
  const seen = watch(state, brainOf, w.depth, m.type.name, players),
    log = record(state, w.planet.height, brainOf, events, ships);
  log.start(m.seed, m.type.name, m.type.rules);
  const idle = { course: null, throttle: 0 },
    still = { aim: null, fire: false },
    each = Math.round(1 / STEP);
  const over = () =>
    m.card ? state.result() !== null : state.alive().length <= 1;
  let steps = 0;
  const began = performance.now();
  log.second();
  while (!over() && state.time() < end) {
    log.before();
    const did = state.advance(idle, still, undefined, log.lap);
    log.after(did);
    seen.step(did);
    if (++steps % each === 0) {
      seen.second(steps / each);
      log.second();
    }
  }
  const ms = performance.now() - began;
  const account = seen.end(steps, ms),
    kept = log.end(),
    why = over() ? (m.card ? 'race decided' : 'one left') : 'out of time';
  const h = fingerprint(numbersOf(state));
  events?.write({
    t: r2(state.time()),
    step: steps,
    type: 'end',
    why,
    left: state.alive(),
    hash: h,
  });
  const summary = summaryOf(sc, m, account, kept, {
    why,
    hash: h,
    wallMs: ms,
    result: state.result(),
  });
  if (dir) {
    events?.close();
    ships?.close();
    writeJson(join(dir, 'summary.json'), {
      ...summary,
      files: { events: events?.count(), ships: ships?.count() },
    });
  }
  return summary;
}

const r2 = (x: number) => Math.round(x * 100) / 100,
  rate = (hits: number, shots: number) => (shots ? r2(hits / shots) : null);

/** The summary of a match sailed: the headline figures first, then the account. */
function summaryOf(
  sc: MatchScenario,
  m: Match,
  a: MatchResult,
  kept: ReturnType<ReturnType<typeof record>['end']>,
  end: {
    why: string;
    hash: string;
    wallMs: number;
    result: ReturnType<State['result']>;
  }
) {
  const ships = a.ships,
    afloat = ships.filter((s) => s.afloat > 0);
  const shots = Object.values(a.shots.band).reduce((n, c) => n + c.shots, 0),
    hits = Object.values(a.shots.band).reduce((n, c) => n + c.hits, 0);
  const dps = afloat
    .map((s) => s.fighting.dealt / s.afloat)
    .sort((x, y) => x - y);
  return {
    scenario: sc,
    seed: m.seed,
    type: a.type,
    end: end.why,
    hash: end.hash,
    seconds: r2(a.seconds),
    steps: a.steps,
    wallMs: Math.round(end.wallMs),
    left: ships.filter((s) => s.sunk === null).map((s) => s.id),
    placements: [...ships]
      .sort((x, y) => x.place - y.place || x.id - y.id)
      .map((s) => ({
        place: s.place,
        id: s.id,
        brain: s.brain,
        persona: s.persona,
        skill: r2(s.skill),
        player: s.player,
        sunk: s.sunk,
        afloat: s.afloat,
        kills: s.fighting.kills,
        dealt: r2(s.fighting.dealt),
        taken: r2(s.fighting.taken),
        shots: Object.values(s.fighting.shots).reduce(
          (n, k) => n + (k ?? 0),
          0
        ),
        hits: s.fighting.hits,
        pinned: s.pinned,
      })),
    combat: {
      shots,
      hits,
      hitRate: rate(hits, shots),
      byRange: Object.fromEntries(
        Object.entries(a.shots.band).map(([b, c]) => [
          b,
          { ...c, rate: rate(c.hits, c.shots) },
        ])
      ),
      byGun: Object.fromEntries(
        Object.entries(a.shots.kind).map(([g, c]) => [
          g,
          {
            shots: c.shots,
            hits: c.hits,
            rate: rate(c.hits, c.shots),
            dealt: r2(c.dealt),
            balls: c.balls,
            short: c.fell,
          },
        ])
      ),
      ttk: kept.ttk,
      dps: {
        median: dps.length ? r2(dps[dps.length >> 1]) : null,
        mean: dps.length
          ? r2(dps.reduce((x, y) => x + y, 0) / dps.length)
          : null,
      },
      causes: a.causes,
      quiet: r2(a.quiet),
      lull: r2(a.lull),
    },
    movement: {
      pinned: ships.reduce((n, s) => n + s.pinned, 0),
      aground: ships.reduce((n, s) => n + s.aground, 0),
      worst: [...ships]
        .sort((x, y) => y.pinned - x.pinned)
        .slice(0, 5)
        .filter((s) => s.pinned > 0)
        .map((s) => ({
          id: s.id,
          pinned: s.pinned,
          why: s.why,
          episodes: s.episodes,
        })),
    },
    loot: a.loot,
    cost: { msPerStep: r2(a.msPerStep), parts: kept.cost },
    invariants: kept.invariants,
    result: end.result,
    account: a,
  };
}

/** FNV-1a over the bits of every number given, as eight hex digits. */
export function fingerprint(numbers: readonly number[]): string {
  const bytes = new Uint8Array(new Float64Array(numbers).buffer);
  let h = 0x811c9dc5;
  for (const b of bytes) h = Math.imul(h ^ b, 0x01000193) >>> 0;
  return h.toString(16).padStart(8, '0');
}

/**
 * What the hash is of: the match's clock, the loot left, and every ship's
 * place, heading, speed, health, share and whether she floats.
 */
export function numbersOf(state: State): number[] {
  const numbers: number[] = [state.time(), state.loot().pieces.length];
  for (const v of state.vessels())
    numbers.push(v.id, ...v.ship.at, ...v.ship.heading, v.ship.speed);
  for (const k of state.ships())
    numbers.push(k.id, k.hull, k.shield, state.share(k.id), k.afloat ? 1 : 0);
  return numbers;
}

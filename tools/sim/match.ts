import { join } from 'node:path';
import { shipValues } from '../../src/career/fit.ts';
import { RIDE } from '../../src/sim/ride.ts';
import {
  SETUP,
  createMatch,
  debugOf,
  type MatchView,
} from '../../src/sim/engine.ts';
import { evenSetup } from '../../src/sim/even.ts';
import { STEP } from '../../src/sim/fixed.ts';
import { STILL } from '../../src/sim/hands.ts';
import { MIXED } from '../../src/sim/persona.ts';
import type { MatchSetup } from '../../src/sim/setup.ts';
import { berths } from '../../src/sim/spawn.ts';
import type { Waters } from '../../src/sim/waters.ts';
import { CASCADES } from '../../src/world/cascades.ts';
import { FREQUENCY, anchors, icosphere } from '../../src/world/lattice.ts';
import { STRIDE, hash } from '../../src/world/random.ts';
import { createSwell, type Hull } from '../../src/world/swell.ts';
import { distance, type Vec3 } from '../../src/world/sphere.ts';
import { MEAN } from '../../src/world/weather.ts';
import { createWind } from '../../src/world/wind.ts';
import { lines, writeJson } from '../out.ts';
import { firstRace } from './career.ts';
import { record } from './log.ts';
import { watch, type MatchResult } from './metrics.ts';
import { standIn, type Thumb } from './player.ts';
import { worldOf } from './world.ts';

export interface MatchScenario {
  kind: 'match';
  planet?: number;
  match?: number;
  teams?: number;
  perTeam?: 1 | 2;
  close?: boolean;
  players?: number;
  thumb?: Thumb;
  seconds?: number;
  sea?: 'flat' | 'swell';
  career?: boolean;
  seed?: string;
}

export type State = MatchView;

const LEVEL = 50,
  STAT = 10,
  RATING = 3;

const EVEN_SHIP = shipValues(
  {
    sails: LEVEL,
    rigging: LEVEL,
    rudder: LEVEL,
    hull: LEVEL,
    keel: LEVEL,
    mounts: LEVEL,
    gun: LEVEL,
  },
  'cannon',
  { shield: STAT, healSpeed: STAT, healAmount: STAT }
);

const EVEN_DRIVER = {
  gunnery: STAT,
  helm: STAT,
  nerve: STAT,
  territory: STAT,
  stormcraft: STAT,
  lookout: STAT,
};

function swellOf(seed: number, height: (p: Vec3) => number): Hull {
  const sea = anchors(icosphere(FREQUENCY), createWind(seed), CASCADES[0]);
  return createSwell(sea, height, MEAN.wind, { shortest: RIDE.shortest }).hull;
}

export type Summary = ReturnType<typeof summaryOf>;

export function runMatch(sc: MatchScenario, dir?: string): Summary {
  if (sc.career) {
    const race = firstRace(sc.seed ?? String(sc.match ?? 1));
    return sail(race.setup, race.waters, sc, dir);
  }
  const w = worldOf(sc.planet),
    n = sc.match ?? 1,
    seed = w.seed + STRIDE * n;
  const setup = evenSetup({
    planet: String(w.seed),
    match: seed,
    storm: RATING,
    heals: RATING,
    teams: sc.teams,
    perTeam: sc.perTeam,
    values: EVEN_SHIP,
    stats: EVEN_DRIVER,
  });
  const count = setup.ships.length;
  let waters: Waters = {
    ...w.waters,
    ...(sc.sea === 'swell' && { sea: swellOf(w.seed, w.planet.height) }),
  };
  if (sc.close) {
    const all = berths(w.waters.water, seed, SETUP.most, w.depth),
      first = all[0].at;
    const near = [...all].sort(
      (x, y) => distance(x.at, first) - distance(y.at, first)
    );
    waters = {
      ...waters,
      berthed: { match: seed, spawns: near.slice(0, count) },
    };
  }
  return sail(setup, waters, sc, dir);
}

function sail(
  setup: MatchSetup,
  waters: Waters,
  sc: MatchScenario,
  dir: string | undefined
) {
  const m = createMatch(setup, waters),
    state = m.view,
    seed = setup.match,
    brainOf = () => 'default';
  const players = new Set<number>();
  if (sc.players)
    for (const k of state.ships())
      if ((k.id + (sc.match ?? 1)) % sc.players === 0) {
        players.add(k.id);
        debugOf(m).standIn(k.id, standIn(hash(seed, k.id), sc.thumb));
      }
  const course = MIXED.rules.storm.phases.reduce(
      (t, p) => t + p.wait + p.close,
      0
    ),
    end = sc.seconds ?? course + 120;
  const events = dir ? lines(join(dir, 'events.jsonl')) : null,
    ships = dir ? lines(join(dir, 'ships.jsonl')) : null;
  const seen = watch(state, brainOf, waters.depth, MIXED.name, players),
    log = record(state, (p) => -waters.depth(p), brainOf, events, ships);
  log.start(seed, MIXED.name, MIXED.rules);
  debugOf(m).lap(log.lap);
  const each = Math.round(1 / STEP);
  let steps = 0;
  const began = performance.now();
  log.second();
  while (!m.done && state.time() < end) {
    log.before();
    m.step(STILL);
    const did = state.last();
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
    why = m.done ? 'race decided' : 'out of time',
    result = m.result();
  events?.write({
    t: r2(state.time()),
    step: steps,
    type: 'end',
    why,
    left: state.alive(),
    hash: result.hash,
  });
  const summary = summaryOf(sc, seed, account, kept, {
    why,
    hash: result.hash,
    wallMs: ms,
    result,
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

function summaryOf(
  sc: MatchScenario,
  seed: number,
  a: MatchResult,
  kept: ReturnType<ReturnType<typeof record>['end']>,
  end: {
    why: string;
    hash: string;
    wallMs: number;
    result: ReturnType<ReturnType<typeof createMatch>['result']>;
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
    seed,
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

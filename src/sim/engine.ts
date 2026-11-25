import {
  battleOf,
  crewOf,
  marksOf,
  stepBattle,
  weathered,
  type Battle,
  type Crew,
  type Order,
  type Shot,
  type Splash,
  type Strike,
} from './battle.ts';
import { bruised, mind, rammed, sank, shot, type Memory } from './bot.ts';
import { DEFAULT_BRAIN, type Brain } from './brain.ts';
import { mates, teamsOf } from './teams.ts';
import { afloat, stepFleet, type Vessel } from './contact.ts';
import { STEP } from './fixed.ts';
import { sunk } from './health.ts';
import { regain, type Regained } from './holding.ts';
import { PLAYER, credited, type Cause, type Sunk } from './match.ts';
import { berths, drawn, type Spawn } from './spawn.ts';
import { hopped, knocked, pose, ride, settled, type Ride } from './ride.ts';
import { laying, overboard, type Flotsam, type Taken } from './loot.ts';
import { asked, crewed, spilled, stored, type Ask } from './stores.ts';
import type { Rarity } from './kinds.ts';
import type { Berthed, Waters } from './waters.ts';
import { shipAt, type Helm, type ShipState } from './ship.ts';
import { calm, closedBy, createStorm, type Storm } from './storm.ts';
import { heard, type Report } from './hunter.ts';
import {
  createTerritory,
  type Move,
  type Outcome,
  type Territory,
} from './territory.ts';
import type { Hands } from './hands.ts';
import type { MatchResult } from './result.ts';
import type { DriverStats, MatchSetup, ShipSpec, ShipValues } from './setup.ts';
import { driver } from './driver.ts';
import { DEFAULT_RULES } from './rules.ts';
import { remembered } from '../world/remembered.ts';
import type { ShipPose } from '../world/pose.ts';
import { hash } from '../world/random.ts';
import { bearingAt, type Vec3 } from '../world/sphere.ts';
import { indexed } from './indexed.ts';
import { createOrders, type Hand, type Sighter } from './orders.ts';
import { createTally, finishing, type Standing, type Tally } from './tally.ts';

const AMIDSHIPS: Helm = { course: null, throttle: 0 };
const MATCH = { loot: true, held: true },
  LOBBY = { loot: false, held: false };

export interface Mooring {
  at: Vec3;
  heading: Vec3;
  lashed: Helm | null;
}

export interface Rig {
  storm?: (seconds: number) => Storm;
}

interface Course {
  seed: number;
  heals: MatchSetup['heals'] | null;
  storm: (seconds: number) => Storm;
}

interface Sinking extends Sunk {
  time: number;
  at: Vec3;
  heading: Vec3;
}

interface Afloat {
  id: number;
  at: Vec3;
  heading: Vec3;
  hull: number;
  shield: number;
  afloat: boolean;
}

interface Held {
  held: Outcome | null;
  regained: readonly Regained[];
}
const UNHELD: Held = { held: null, regained: [] };

export interface Stepped extends Held {
  shots: readonly Shot[];
  strikes: readonly Strike[];
  splashes: readonly Splash[];
  took: readonly Taken[];
}
const BECALMED: Stepped = {
  ...UNHELD,
  shots: [],
  strikes: [],
  splashes: [],
  took: [],
};

export const PARTS = [
  'command',
  'sail',
  'fight',
  'hold',
  'ride',
  'founder',
] as const;
export type Part = (typeof PARTS)[number];

type Met = ReturnType<typeof stepFleet>;
type Wants = ReturnType<typeof asked>;
type Fought = ReturnType<typeof stepBattle>;
type Kept = ReturnType<typeof stored>;

interface Aboard extends Hand {
  top: number;
  ride: Ride;
  before: ShipPose;
  after: ShipPose;
}

interface Happened {
  fought: Fought;
  wants: Wants;
  kept: Kept;
}

export interface Founded {
  id: number;
  by: number | null;
  at: Vec3;
  pose: ShipPose;
}

export const SETUP = { least: 2, most: 80 } as const;

function checked(setup: MatchSetup): MatchSetup {
  const { ships } = setup;
  if (ships.length < SETUP.least || ships.length > SETUP.most)
    throw new RangeError(
      `a match has ${SETUP.least} to ${SETUP.most} ships, not ${ships.length}`
    );
  const sizes: number[] = [];
  ships.forEach((s, id) => {
    if (!Number.isInteger(s.team) || s.team < 0)
      throw new RangeError(`ship ${id}'s team is ${s.team}`);
    sizes[s.team] = (sizes[s.team] ?? 0) + 1;
    if (s.hands === 'player' && id !== PLAYER)
      throw new RangeError(`ship ${id} has the player's hands`);
  });
  for (let t = 0; t < sizes.length; t++)
    if (!(sizes[t] >= 1 && sizes[t] <= 2))
      throw new RangeError(`team ${t} has ${sizes[t] ?? 0} ships`);
  return setup;
}

const courseOf = (setup: MatchSetup, depth: (p: Vec3) => number): Course => ({
  seed: setup.match,
  heals: setup.heals,
  storm: createStorm(setup.match, depth, DEFAULT_RULES.storm),
});

const statsOf = (spec: ShipSpec): DriverStats | null =>
  spec.hands === 'player' ? null : spec.hands;

const helmOf = (h: Hands): Helm => ({ course: h.course, throttle: h.throttle });
const orderOf = (h: Hands): Order => ({ aim: h.aim, fire: h.fire });
const askOf = (h: Hands): Ask => ({ heal: h.heal, gust: h.gust });

function createSea(waters: Waters, first: Course) {
  const { chart, water, sea, rises } = waters;
  const depth = remembered(waters.depth);
  let match = first,
    lay: ReturnType<typeof laying> | null = null;
  let specs: readonly ShipSpec[] | null = null,
    teams: readonly number[] | undefined,
    kept: Berthed | undefined;
  let tally: Tally | null = null,
    loose = false;
  const seedOf = (id: number) => hash(match.seed, id);
  let fleet: Vessel[] = [];
  const aboard = new Map<number, Aboard>();
  let battle: Battle = battleOf([], match.seed);
  const aims = new Map<number, Vec3 | null>();
  const from = new Map<number, Vec3>();
  const born = new Map<number, number>();
  let flotsam: Flotsam = { pieces: [], next: 0 },
    dropped = Infinity;
  let gunfire: Report[] = [];
  const sinkings: Sinking[] = [];
  const struck = new Map<number, { by: number; tick: number }>();
  let tick = 0,
    begun = 0;
  let quiet = false;
  let territory: Territory | null = null;
  const founded: Founded[] = [];
  let happened: Happened | null = null,
    last: Stepped = BECALMED;
  let lap: ((part: Part) => void) | undefined;
  const orders = createOrders(depth, chart);
  const brain: Brain = DEFAULT_BRAIN;

  const byId = indexed<Crew>().of,
    vessels = indexed<Vessel>();
  const vessel = (id: number): Vessel | null =>
    vessels.of(fleet).get(id) ?? null;
  let alive: number[] | null = null;

  const specOf = new Map<number, ShipValues>();
  const valuesOf = (id: number): ShipValues => {
    const v = specOf.get(id);
    if (!v) throw new RangeError(`ship ${id} has no spec`);
    return v;
  };

  const fits: ShipValues[] = [],
    lost: number[] = [],
    sailing: Vessel[] = [],
    moves: Move[] = [],
    ids: number[] = [],
    blown = new Set<number>();

  const launch = (
    id: number,
    ship: ShipState,
    lashed: Helm | null,
    stats: DriverStats | null
  ) => {
    fleet.push(afloat(id, ship));
    vessels.stale();
    const top = valuesOf(id).topSpeed,
      r = settled(ship, top, sea, tick * STEP, id),
      p = pose(ship, r);
    aboard.set(id, {
      top,
      mind: stats && !lashed ? mind(seedOf(id), ship.at) : null,
      bot: stats && { seed: seedOf(id), brain, temper: driver(stats) },
      steady: lashed ?? AMIDSHIPS,
      ride: r,
      before: p,
      after: p,
      ...(teams && { team: teams[id] }),
    });
  };

  const clear = (
    ids: readonly number[],
    { loot, held }: { loot: boolean; held: boolean },
    values: (id: number) => ShipValues,
    by?: readonly number[]
  ) => {
    specOf.clear();
    for (const id of ids) specOf.set(id, values(id));
    teams = by;
    tally = by ? createTally(by, closedBy(DEFAULT_RULES.storm)) : null;
    loose = false;
    lay =
      loot && match.heals !== null
        ? laying(match.seed, depth, match.heals)
        : null;
    flotsam = lay ? lay.strewn() : { pieces: [], next: 0 };
    dropped = lay ? 0 : Infinity;
    gunfire = [];
    fleet = [];
    aboard.clear();
    aims.clear();
    founded.length = 0;
    happened = null;
    last = BECALMED;
    born.clear();
    sinkings.length = 0;
    struck.clear();
    alive = null;
    battle = battleOf(
      ids.map((id) => crewOf(id, valuesOf(id))),
      match.seed,
      teams
    );
    territory = held
      ? createTerritory(by?.length ?? Math.max(...ids) + 1, teams)
      : null;
    begun = tick;
    quiet = false;
  };

  const time = () => (tick - begun) * STEP;
  const stormAt = (seconds: number): Storm =>
    quiet ? calm(match.storm(0).center) : match.storm(seconds);

  const founder = ({ id, by, cause, gun }: Sunk) => {
    alive = null;
    const a = aboard.get(id),
      v = vessel(id);
    if (!a || !v) return;
    sinkings.push({
      id,
      by,
      cause,
      gun,
      time: time(),
      at: v.ship.at,
      heading: v.ship.heading,
    });
    founded.push({ id, by, at: v.ship.at, pose: a.after });
    const victor = by === null ? undefined : aboard.get(by);
    if (victor?.mind) victor.mind = sank(victor.mind);
    territory?.sink(id, tick * STEP);
    aboard.delete(id);
    fleet.splice(fleet.indexOf(v), 1);
    vessels.stale();
  };

  const clock = (between: number) => (tick - 1 + between) * STEP;

  const sail = (helms: Helm[], asks: ReadonlyMap<number, Ask>) => {
    const wants = asked(battle.crews, asks);
    battle.crews = wants.crews;
    const manned = byId(wants.crews);
    for (let i = 0; i < fleet.length; i++) {
      helms[i] = crewed(helms[i], manned.get(fleet[i].id));
      fits[i] = valuesOf(fleet[i].id);
    }
    fits.length = fleet.length;
    from.clear();
    for (const v of fleet) from.set(v.id, v.ship.at);
    const met = stepFleet(fleet, helms, STEP, depth, fits);
    fleet = met.fleet;
    for (const b of met.blows) {
      const a = aboard.get(b.struck.id);
      if (a?.mind && !mates(teams, b.struck.id, b.striker.id))
        a.mind = rammed(a.mind, b.striker.id);
    }
    return { wants, met };
  };

  const fight = (orders: readonly Order[], met: Met, storm: Storm) => {
    const fought = stepBattle(
      battle,
      fleet,
      orders,
      met.blows,
      STEP,
      depth,
      rises
    );
    for (const s of fought.strikes) {
      struck.set(s.struck, { by: s.shooter, tick });
      const a = aboard.get(s.struck);
      if (a?.mind)
        a.mind = s.ram
          ? bruised(a.mind, s.damage)
          : shot(a.mind, s.shooter, s.damage);
    }
    const worn = weathered(fought.battle, fleet, storm, STEP);
    lost.length = 0;
    for (const id of fought.sunk) lost.push(id);
    for (const id of worn.sunk) lost.push(id);
    const before = flotsam.next;
    const kept = stored(
      worn.battle.crews,
      flotsam,
      fleet,
      lost,
      STEP,
      depth,
      match.seed
    );
    battle = worn.battle;
    battle.crews = kept.crews;
    flotsam = kept.flotsam;
    for (let id = before; id < flotsam.next; id++) born.set(id, tick * STEP);
    return { fought, kept };
  };

  const pooled = { share: (id: number) => territory?.teamShare(id) ?? 0 };

  const hold = (storm: Storm): Held => {
    if (!territory) return UNHELD;
    sailing.length = 0;
    for (const v of fleet) if (!lost.includes(v.id)) sailing.push(v);
    for (let i = 0; i < sailing.length; i++) {
      const v = sailing[i],
        m = (moves[i] ??= { id: 0, from: v.ship.at, to: v.ship.at });
      m.id = v.id;
      m.from = from.get(v.id) ?? v.ship.at;
      m.to = v.ship.at;
      ids[i] = v.id;
    }
    moves.length = ids.length = sailing.length;
    const did = territory.step(moves, tick * STEP, storm);
    const back = regain(
      battle.crews,
      ids,
      teams ? pooled : territory,
      storm,
      STEP
    );
    battle.crews = back.crews;
    return { held: did, regained: back.regained };
  };

  const rideOn = (met: Met, blew: readonly number[]) => {
    blown.clear();
    for (const id of blew) blown.add(id);
    for (let i = 0; i < fleet.length; i++) {
      const v = fleet[i],
        a = aboard.get(v.id)!;
      if (blown.has(v.id)) a.ride = hopped(a.ride);
      a.ride = ride(
        knocked(a.ride, v.ship, met.jolts[i]),
        v.ship,
        a.top,
        sea,
        tick * STEP,
        STEP
      );
      a.before = a.after;
      a.after = pose(v.ship, a.ride);
    }
  };

  const founderAll = (fought: Fought) => {
    for (const id of lost) {
      const blow = fought.sunk.includes(id)
        ? fought.strikes.findLast((s) => s.struck === id)
        : undefined;
      const cause: Cause = blow ? (blow.ram ? 'ram' : 'shot') : 'storm',
        last = struck.get(id);
      founder({
        id,
        by: credited(
          cause,
          last ? { by: last.by, ago: (tick - last.tick) * STEP } : null
        ),
        cause,
        gun: blow?.gun ?? null,
      });
    }
  };

  const standing = (): Standing => ({
    seconds: time(),
    alive: view.alive(),
    fleet,
    crews: battle.crews,
    sunk: sinkings,
    loot: flotsam.pieces.length,
    share: view.share,
  });

  const advance = (helm: Helm, gun: Order, ask: Ask): Stepped => {
    founded.length = 0;
    const storm = stormAt(time());
    if (lay && storm.phase > dropped && !storm.final) {
      const before = flotsam.next;
      flotsam = lay.cached(flotsam, storm.next, storm.phase);
      for (let id = before; id < flotsam.next; id++) born.set(id, tick * STEP);
      dropped = storm.phase;
    }
    const told = orders(
      fleet,
      byId(battle.crews),
      aboard,
      { helm, gun, ask },
      { storm, loot: flotsam, holdings: territory, gunfire }
    );
    for (let i = 0; i < fleet.length; i++)
      aims.set(fleet[i].id, told.orders[i]?.aim?.dir ?? null);
    lap?.('command');
    const { wants, met } = sail(told.helms, told.asks);
    lap?.('sail');
    const { fought, kept } = fight(told.orders, met, storm);
    if (fought.shots.length > 0 || gunfire.length > 0)
      gunfire = heard(gunfire, fought.shots, time());
    lap?.('fight');
    tick++;
    const did = hold(storm);
    lap?.('hold');
    rideOn(met, wants.blew);
    lap?.('ride');
    founderAll(fought);
    tally?.settle(
      fought.shots,
      fought.strikes,
      standing,
      !loose || sinkings.length > 0
    );
    lap?.('founder');
    happened = { fought, wants, kept };
    return {
      ...did,
      shots: fought.shots,
      strikes: fought.strikes,
      splashes: fought.splashes,
      took: kept.took,
    };
  };

  const view = {
    time,
    clock,
    storm(between: number): Storm {
      return stormAt(Math.max(0, clock(between) - begun * STEP));
    },
    after: (id: number): ShipPose | null => aboard.get(id)?.after ?? null,
    poses: (
      id: number
    ): { readonly before: ShipPose; readonly after: ShipPose } | null =>
      aboard.get(id) ?? null,
    aim: (id: number): Vec3 | null | undefined => aims.get(id),
    balls: (): Battle['balls'] => battle.balls,
    loot: (): Flotsam => flotsam,
    born: (id: number): number | undefined => born.get(id),
    territory: (): Territory | null => territory,
    share: (id: number) => territory?.share(id) ?? 0,
    founded: (): readonly Founded[] => founded,
    happened: (): Happened | null => happened,
    last: (): Stepped => last,
    seed: (): number => match.seed,
    standing,
    order: (): number[] => finishing(view.alive(), sinkings, view.share),
    teams: (): readonly number[] | undefined => teams,
    marks: (id: number): readonly Vessel[] => marksOf(battle, id, fleet),
    vessels: (): readonly Vessel[] => fleet,
    vessel,
    crew: (id: number): Crew => byId(battle.crews).get(id)!,
    crews: (): readonly Crew[] => battle.crews,
    mine: () => vessel(PLAYER),
    alive: (): readonly number[] => {
      if (alive) return alive;
      alive = [];
      for (const c of battle.crews) if (!sunk(c.health)) alive.push(c.id);
      return alive;
    },
    sinkings: (): readonly Sinking[] => sinkings,
    sinking: (id: number): Sinking | null => {
      for (const k of sinkings) if (k.id === id) return k;
      return null;
    },
    ships: (): Afloat[] =>
      battle.crews.map((c) => {
        const s = vessel(c.id)?.ship ?? sinkings.find((k) => k.id === c.id)!;
        const { hull, shield } = c.health;
        return {
          id: c.id,
          at: s.at,
          heading: s.heading,
          hull,
          shield,
          afloat: !sunk(c.health),
        };
      }),
  };

  const start = (ships: readonly ShipSpec[], berthed?: Berthed) => {
    specs = ships;
    kept = berthed;
    const count = specs.length,
      ids = specs.map((_, id) => id);
    clear(ids, MATCH, (id) => ships[id], teamsOf(specs));
    const open =
      berthed?.match === match.seed && berthed.spawns.length === count
        ? berthed.spawns
        : berths(water, match.seed, count, depth);
    const at: Spawn[] = drawn(open, match.seed);
    for (const id of ids)
      launch(id, shipAt(at[id].at, at[id].heading), null, statsOf(specs[id]));
    territory?.begin(
      at.map((b, id) => (aboard.has(id) ? b.at : null)),
      tick * STEP
    );
  };

  const played = {
    step(hands: Hands) {
      last = advance(helmOf(hands), orderOf(hands), askOf(hands));
    },
    get done() {
      return tally?.made() != null;
    },
    result(): MatchResult {
      const by = teams ?? [PLAYER];
      return (tally ?? createTally(by, Infinity)).result(standing());
    },
    view,
  };

  const debug: Debug = {
    atSea(start: { at: Vec3; bearing: number }, others: readonly Mooring[]) {
      const ids = [PLAYER, ...others.map((_, i) => i + 1)],
        given = specs;
      if (!given || given.length < ids.length)
        throw new RangeError(`${ids.length} ships at sea need as many specs`);
      clear(ids, MATCH, (id) => given[id], teamsOf(given.slice(0, ids.length)));
      loose = true;
      launch(
        PLAYER,
        shipAt(start.at, bearingAt(start.at, start.bearing)),
        null,
        statsOf(given[PLAYER])
      );
      others.forEach((o, i) => {
        const way = (o.lashed?.throttle ?? 0) * valuesOf(i + 1).topSpeed;
        launch(
          i + 1,
          { ...shipAt(o.at, o.heading), speed: way },
          o.lashed,
          statsOf(given[i + 1])
        );
      });
      territory?.begin(
        fleet.map((v) => v.ship.at),
        tick * STEP
      );
    },
    rig({ storm }: Rig) {
      match = { ...match, ...(storm && { storm }) };
      if (specs) start(specs, kept);
    },
    strew(at: Vec3, heals: readonly Rarity[]) {
      const n = flotsam.pieces.length;
      const f = overboard(flotsam, at, heals, match.seed);
      const still = (l: Flotsam['pieces'][number], i: number): typeof l =>
        i < n ? l : { ...l, way: [0, 0, 0], age: 10 };
      flotsam = { ...f, pieces: f.pieces.map(still) };
    },
    sink(id: number, by: number | null) {
      if (!aboard.has(id)) return;
      founded.length = 0;
      const before = flotsam.next,
        s = spilled(battle.crews, flotsam, fleet, [id], match.seed);
      for (let n = before; n < s.flotsam.next; n++) born.set(n, tick * STEP);
      flotsam = s.flotsam;
      const gone = (c: Crew): Crew =>
        c.id === id ? { ...c, health: { ...c.health, hull: 0, shield: 0 } } : c;
      battle = { ...battle, crews: s.crews.map(gone) };
      const held = battle.crews.find((c) => c.id === by);
      founder({
        id,
        by,
        cause: by === null ? 'storm' : 'shot',
        gun: held ? held.gun.kind : null,
      });
    },
    mindOf: (id: number): Readonly<Memory> | null =>
      aboard.get(id)?.mind ?? null,
    standIn: (id: number, sights: Sighter) => {
      const a = aboard.get(id);
      if (a?.mind) a.sights = sights;
    },
    lap(on: ((part: Part) => void) | undefined) {
      lap = on;
    },
  };
  DEBUG.set(played, debug);
  DEBUG.set(view, debug);

  return {
    view,
    played,
    start,
    anchor(at: { at: Vec3; bearing: number }, values: ShipValues) {
      clear([PLAYER], LOBBY, () => values);
      quiet = true;
      launch(PLAYER, shipAt(at.at, bearingAt(at.at, at.bearing)), null, null);
    },
  };
}

export type MatchView = ReturnType<typeof createSea>['view'];

export type Match = {
  step(hands: Hands): void;
  readonly done: boolean;
  result(): MatchResult;
  readonly view: MatchView;
};

export function createMatch(setup: MatchSetup, waters: Waters): Match {
  const { ships } = checked(setup),
    sea = createSea(waters, courseOf(setup, waters.depth));
  sea.start(ships, waters.berthed);
  return sea.played;
}

export function createMooring(
  waters: Waters,
  at: { at: Vec3; bearing: number },
  values: ShipValues
): Match {
  const sea = createSea(waters, {
    seed: 0,
    heals: null,
    storm: () => calm(at.at),
  });
  sea.anchor(at, values);
  return sea.played;
}

interface Debug {
  atSea(start: { at: Vec3; bearing: number }, others: readonly Mooring[]): void;
  rig(rig: Rig): void;
  strew(at: Vec3, heals: readonly Rarity[]): void;
  sink(id: number, by: number | null): void;
  mindOf(id: number): Readonly<Memory> | null;
  standIn(id: number, sights: Sighter): void;
  lap(on: ((part: Part) => void) | undefined): void;
}

const DEBUG = new WeakMap<object, Debug>();

export function debugOf(of: Match | MatchView): Debug {
  const d = DEBUG.get(of);
  if (!d) throw new Error('not a match');
  return d;
}

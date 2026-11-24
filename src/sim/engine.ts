import {
  armed,
  battleOf,
  crewOf,
  fitOf,
  inHand,
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
import { checked, entered, mates } from './carded.ts';
import { nature, natureOf, type MatchType, type Nature } from './persona.ts';
import { afloat, stepFleet, type Vessel } from './contact.ts';
import { STEP } from './fixed.ts';
import { gunOf } from './gun.ts';
import { fitted } from './fitted.ts';
import { SHIP, type Handling } from './handling.ts';
import { sunk } from './health.ts';
import { regain, type Regained } from './holding.ts';
import { PLAYER, SHIPS, credited, type Cause, type Sunk } from './match.ts';
import { berths, drawn, type Spawn } from './spawn.ts';
import { hopped, knocked, pose, ride, settled, type Ride } from './ride.ts';
import {
  laying,
  overboard,
  type Arms,
  type Flotsam,
  type Goods,
  type Taken,
} from './loot.ts';
import { asked, crewed, NOTHING, spilled, stored, type Ask } from './stores.ts';
import type { Waters } from './waters.ts';
import { shipAt, type Helm, type ShipState } from './ship.ts';
import { calm, closedBy, type Storm } from './storm.ts';
import { heard, type Report } from './hunter.ts';
import {
  createTerritory,
  type Move,
  type Outcome,
  type Territory,
} from './territory.ts';
import type { RaceCard, RaceResult } from './race.ts';
import type { Hull } from '../world/swell.ts';
import type { Planet } from '../world/planet.ts';
import { remembered } from '../world/remembered.ts';
import type { ShipPose } from '../world/pose.ts';
import { hash } from '../world/random.ts';
import { bearingAt, type Vec3 } from '../world/sphere.ts';
import { indexed } from './indexed.ts';
import { createOrders, type Hand, type Sighter } from './orders.ts';
import { createTally, finishing, type Tally } from './tally.ts';

const AMIDSHIPS: Helm = { course: null, throttle: 0 };
const MATCH = { loot: true, held: true },
  LOBBY = { loot: false, held: false };

export interface Mooring {
  at: Vec3;
  heading: Vec3;
  lashed: Helm | null;
}

export interface Match {
  seed: number;
  type: MatchType;
  storm: (seconds: number) => Storm;
  gun: Arms | null;
  berths?: readonly Spawn[];
  card?: RaceCard;
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
  armed: boolean;
  afloat: boolean;
}

interface Held {
  held: Outcome | null;
  regained: readonly Regained[];
}
const UNHELD: Held = { held: null, regained: [] };

interface Stepped extends Held {
  shots: readonly Shot[];
  strikes: readonly Strike[];
  splashes: readonly Splash[];
  took: readonly Taken[];
}

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

export function createMatch(
  planet: Planet,
  sea: Hull,
  { chart, water }: Waters,
  first: Match,
  brainOf: (id: number) => Brain = () => DEFAULT_BRAIN
) {
  const depth = remembered((p: Vec3) => -planet.height(p)),
    rises = planet.rises;
  let match = first,
    lay = laying(match.seed, depth, match.type.rules.loot);
  let card: RaceCard | undefined, teams: readonly number[] | undefined;
  let tally: Tally | null = null;
  const seedOf = (id: number) => hash(match.seed, id);
  let fleet: Vessel[] = [];
  const aboard = new Map<number, Aboard>();
  let battle: Battle = battleOf([], match.seed, match.type.rules.aim.assist);
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
  let happened: Happened | null = null;
  const orders = createOrders(depth, chart);

  const byId = indexed<Crew>().of,
    vessels = indexed<Vessel>();
  const vessel = (id: number): Vessel | null =>
    vessels.of(fleet).get(id) ?? null;
  let alive: number[] | null = null;

  const fits: Handling[] = [],
    lost: number[] = [],
    sailing: Vessel[] = [],
    moves: Move[] = [],
    ids: number[] = [],
    blown = new Set<number>();

  const launch = (
    id: number,
    ship: ShipState,
    lashed: Helm | null = null,
    manned = true
  ) => {
    fleet.push(afloat(id, ship));
    vessels.stale();
    const r = settled(ship, sea, tick * STEP, id),
      p = pose(ship, r);
    const bot = (id !== PLAYER || !manned) && !lashed,
      carded = card?.ships[id],
      driver = carded?.driver;
    aboard.set(id, {
      mind: bot ? mind(driver?.seed ?? seedOf(id), ship.at) : null,
      nature: driver
        ? natureOf(driver, closedBy(match.type.rules.storm), brainOf(id))
        : nature(seedOf(id), brainOf(id), match.type.mix),
      steady: lashed ?? AMIDSHIPS,
      ride: r,
      before: p,
      after: p,
      ...(teams && { team: teams[id] }),
    });
  };

  const clear = (
    m: Match,
    ids: readonly number[],
    { loot, held }: { loot: boolean; held: boolean },
    by?: RaceCard
  ) => {
    match = m;
    card = by && checked(by);
    tally = card ? createTally(card, closedBy(m.type.rules.storm)) : null;
    teams = tally?.teams;
    lay = laying(m.seed, depth, m.type.rules.loot);
    flotsam = loot ? lay.strewn() : { pieces: [], next: 0 };
    dropped = loot ? 0 : Infinity;
    gunfire = [];
    fleet = [];
    aboard.clear();
    aims.clear();
    founded.length = 0;
    happened = null;
    born.clear();
    sinkings.length = 0;
    struck.clear();
    alive = null;
    const gun = match.gun;
    battle = battleOf(
      ids.map((id) =>
        fitted(
          gun ? crewOf(id, gunOf(gun.kind, gun.rarity)) : crewOf(id),
          card?.ships[id]
        )
      ),
      match.seed,
      match.type.rules.aim.assist,
      teams
    );
    territory = held
      ? createTerritory(card?.ships.length ?? Math.max(...ids) + 1, teams)
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
    tally?.holds(id, territory?.share(id) ?? 0);
    territory?.sink(id, tick * STEP);
    aboard.delete(id);
    fleet.splice(fleet.indexOf(v), 1);
    vessels.stale();
  };

  const clock = (between: number) => (tick - 1 + between) * STEP;

  const sail = (helms: Helm[], asks: ReadonlyMap<number, Ask>) => {
    const wants = asked(battle.crews, fleet, flotsam, asks);
    battle.crews = wants.crews;
    const manned = byId(wants.crews);
    for (let i = 0; i < fleet.length; i++) {
      const c = manned.get(fleet[i].id);
      helms[i] = crewed(helms[i], c);
      fits[i] = fitOf(c);
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

  const fight = (
    orders: readonly Order[],
    met: Met,
    storm: Storm,
    wants: Wants
  ) => {
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
      wants.takes,
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

  const standing = () => ({
    seconds: time(),
    alive: engine.alive(),
    fleet,
    crews: battle.crews,
    sunk: sinkings,
    loot: flotsam.pieces.length,
    share: engine.share,
  });

  const engine = {
    advance(
      helm: Helm,
      gun: Order,
      ask: Ask = NOTHING,
      lap?: (part: Part) => void
    ): Stepped {
      founded.length = 0;
      const storm = stormAt(time());
      if (storm.phase > dropped && !storm.final) {
        const before = flotsam.next;
        flotsam = lay.cached(flotsam, storm.next, storm.phase);
        for (let id = before; id < flotsam.next; id++)
          born.set(id, tick * STEP);
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
      const { fought, kept } = fight(told.orders, met, storm, wants);
      if (fought.shots.length > 0 || gunfire.length > 0)
        gunfire = heard(gunfire, fought.shots, time());
      lap?.('fight');
      tick++;
      const did = hold(storm);
      lap?.('hold');
      rideOn(met, wants.blew);
      lap?.('ride');
      founderAll(fought);
      tally?.settle(fought.shots, fought.strikes, standing);
      lap?.('founder');
      happened = { fought, wants, kept };
      return {
        ...did,
        shots: fought.shots,
        strikes: fought.strikes,
        splashes: fought.splashes,
        took: kept.took,
      };
    },

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
    seed: (): number => match.seed,
    card: (): RaceCard | undefined => card,
    standing,
    mode: (id: number) => aboard.get(id)?.mind?.mode,

    result: (): RaceResult | null => tally?.result() ?? null,
    order: (): number[] =>
      finishing(engine.alive(), sinkings, engine.share, tally?.forfeit),
    teams: (): readonly number[] | undefined => teams,
    marks: (id: number): readonly Vessel[] => marksOf(battle, id, fleet),

    vessels: (): readonly Vessel[] => fleet,
    vessel,
    crew: (id: number): Crew => byId(battle.crews).get(id)!,
    crews: (): readonly Crew[] => battle.crews,
    assist: (): readonly number[] => battle.assist,
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
          armed: armed(c),
          afloat: !sunk(c.health),
        };
      }),
    start(m: Match, manned = true): ShipPose {
      const by = m.card,
        count = by ? by.ships.length : SHIPS;
      const ids = by ? entered(by) : Array.from({ length: count }, (_, i) => i);
      clear(m, ids, MATCH, by);
      const open = m.berths ?? berths(water, m.seed, count, depth);
      flotsam = lay.berthed(
        flotsam,
        open.map((b) => b.at)
      );
      const at = by ? drawn(open, m.seed) : open;
      for (const id of ids) {
        const b = at[id],
          entry = by?.ships[id];
        launch(
          id,
          shipAt(b.at, b.heading),
          null,
          manned && (!entry || !entry.driver)
        );
      }
      territory?.begin(
        at.map((b, id) => (aboard.has(id) ? b.at : null)),
        tick * STEP
      );
      const own = aboard.get(PLAYER);
      if (own) return own.after;
      const ashore = shipAt(at[PLAYER].at, at[PLAYER].heading);
      return pose(ashore, settled(ashore, sea, tick * STEP, PLAYER));
    },
    anchor(start: { at: Vec3; bearing: number }): ShipPose {
      clear(match, [PLAYER], LOBBY);
      quiet = true;
      launch(PLAYER, shipAt(start.at, bearingAt(start.at, start.bearing)));
      return aboard.get(PLAYER)!.after;
    },
  };
  DEBUG.set(engine, {
    atSea(
      start: { at: Vec3; bearing: number },
      others: readonly Mooring[]
    ): ShipPose {
      clear(match, [PLAYER, ...others.map((_, i) => i + 1)], MATCH);
      launch(PLAYER, shipAt(start.at, bearingAt(start.at, start.bearing)));
      others.forEach((o, i) => {
        const way = (o.lashed?.throttle ?? 0) * SHIP.top;
        launch(i + 1, { ...shipAt(o.at, o.heading), speed: way }, o.lashed);
      });
      territory?.begin(
        fleet.map((v) => v.ship.at),
        tick * STEP
      );
      return aboard.get(PLAYER)!.after;
    },
    strew(at: Vec3, goods: readonly Goods[]) {
      const n = flotsam.pieces.length;
      const f = overboard(flotsam, at, goods, -1, match.seed);
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
      const held = battle.crews.find((c) => c.id === by),
        g = held && inHand(held);
      founder({
        id,
        by,
        cause: by === null ? 'storm' : 'shot',
        gun: g ? g.kind : null,
      });
    },
    mindOf: (id: number): Readonly<Memory> | null =>
      aboard.get(id)?.mind ?? null,
    natureOf: (id: number): Nature | null => aboard.get(id)?.nature ?? null,
    standIn: (id: number, sights: Sighter) => {
      const a = aboard.get(id);
      if (a?.mind) a.sights = sights;
    },
  });
  return engine;
}

interface Debug {
  atSea(
    start: { at: Vec3; bearing: number },
    others: readonly Mooring[]
  ): ShipPose;
  strew(at: Vec3, goods: readonly Goods[]): void;
  sink(id: number, by: number | null): void;
  mindOf(id: number): Readonly<Memory> | null;
  natureOf(id: number): Nature | null;
  standIn(id: number, sights: Sighter): void;
}

const DEBUG = new WeakMap<object, Debug>();

export type Engine = ReturnType<typeof createMatch>;

export function debugOf(engine: Engine): Debug {
  const d = DEBUG.get(engine);
  if (!d) throw new Error('not a match state');
  return d;
}

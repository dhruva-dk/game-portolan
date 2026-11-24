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
} from '../sim/battle.ts';
import { bruised, mind, rammed, sank, shot, type Memory } from '../sim/bot.ts';
import { DEFAULT_BRAIN, type Brain } from '../sim/brain.ts';
import { checked, entered, mates } from '../sim/carded.ts';
import {
  nature,
  natureOf,
  type MatchType,
  type Nature,
} from '../sim/persona.ts';
import { afloat, stepFleet, type Vessel } from '../sim/contact.ts';
import { STEP, blendPose } from '../sim/fixed.ts';
import { gunOf } from '../sim/gun.ts';
import { fitted } from './fitted.ts';
import { SHIP, type Handling } from '../sim/handling.ts';
import { sunk, wearOf } from '../sim/health.ts';
import { regain, type Regained } from '../sim/holding.ts';
import {
  PLAYER,
  SHIPS,
  credited,
  type Cause,
  type Sunk,
} from '../sim/match.ts';
import { berths, drawn, type Berthing, type Spawn } from '../sim/spawn.ts';
import {
  hopped,
  knocked,
  pose,
  ride,
  settled,
  type Ride,
} from '../sim/ride.ts';
import {
  laying,
  overboard,
  type Arms,
  type Flotsam,
  type Goods,
  type Taken,
} from '../sim/loot.ts';
import {
  asked,
  crewed,
  NOTHING,
  spilled,
  stored,
  type Ask,
} from '../sim/stores.ts';
import type { Chart } from '../sim/route.ts';
import { shipAt, type Helm, type ShipState } from '../sim/ship.ts';
import { calm, closedBy, type Storm } from '../sim/storm.ts';
import { heard, type Report } from '../sim/hunter.ts';
import {
  createTerritory,
  type Move,
  type Outcome,
  type Territory,
} from '../sim/territory.ts';
import type { RaceCard, RaceResult } from '../sim/race.ts';
import type { BallDraw, Look, Sea, ShipDraw } from '../render/snapshot.ts';
import type { Hull } from '../world/swell.ts';
import type { Planet } from '../world/planet.ts';
import { remembered } from '../world/remembered.ts';
import type { PoseOut, ShipPose } from '../world/pose.ts';
import { hash } from '../world/random.ts';
import { add, bearingAt, scale, type Vec3 } from '../world/sphere.ts';
import { LIVERY, type Livery } from '../world/livery.ts';
import type { Race } from './player.ts';
import { dealt, lookOf, worn } from './colors.ts';
import { createDrawing } from './drawing.ts';
import { createHeld } from './held.ts';
import { indexed } from './indexed.ts';
import { createLog, NOTHING_DONE } from './moments.ts';
import { createOrders, type Hand, type Sighter } from './orders.ts';
import { createTally, finishing, type Tally } from './result.ts';
import { sinking } from './sinking.ts';

const AMIDSHIPS: Helm = { course: null, throttle: 0 };
const MATCH = { loot: true, held: true },
  LOBBY = { loot: false, held: false };

export interface Berth {
  at: Vec3;
  heading: Vec3;
  look: Look;
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
  'keep',
] as const;
export type Part = (typeof PARTS)[number];

type Met = ReturnType<typeof stepFleet>;
type Wants = ReturnType<typeof asked>;
type Fought = ReturnType<typeof stepBattle>;

interface Aboard extends Hand {
  look: Look;
  ride: Ride;
  before: ShipPose;
  after: ShipPose;
}
interface Wreck {
  id: number;
  look: Look;
  pose: ShipPose;
  tick: number;
  side: number;
}

export interface Waters {
  chart: Chart;
  water: Berthing;
}

export function createState(
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
  let wrecks: Wreck[] = [];
  const aims = new Map<number, Vec3 | null>();
  const from = new Map<number, Vec3>();
  const log = createLog(PLAYER),
    born = new Map<number, number>();
  let flotsam: Flotsam = { pieces: [], next: 0 },
    dropped = Infinity;
  let gunfire: Report[] = [];
  const sinkings: Sinking[] = [];
  const struck = new Map<number, { by: number; tick: number }>();
  let tick = 0,
    begun = 0;
  let quiet = false;
  let territory: Territory | null = null;
  const held = createHeld();
  let livery: Livery = LIVERY;
  const colors: Vec3[] = [];
  let generation = 0;
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
    look: Look,
    lashed: Helm | null = null,
    manned = true
  ) => {
    fleet.push(afloat(id, ship));
    vessels.stale();
    colors[id] = look.sail;
    const r = settled(ship, sea, tick * STEP, id),
      p = pose(ship, r);
    const bot = (id !== PLAYER || !manned) && !lashed,
      carded = card?.ships[id],
      driver = carded?.driver;
    aboard.set(id, {
      look,
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
    colors.length = 0;
    aims.clear();
    wrecks = [];
    log.clear();
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
    generation++;
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
    log.sank(id, by, v.ship.at);
    const victor = by === null ? undefined : aboard.get(by);
    if (victor?.mind) victor.mind = sank(victor.mind);
    tally?.holds(id, territory?.share(id) ?? 0);
    territory?.sink(id, tick * STEP);
    wrecks.push({
      id,
      look: a.look,
      pose: a.after,
      tick,
      side: seedOf(id) & 1 ? 1 : -1,
    });
    aboard.delete(id);
    fleet.splice(fleet.indexOf(v), 1);
    vessels.stale();
  };

  const clock = (between: number) => (tick - 1 + between) * STEP;

  const wreckAt = (w: Wreck, now: number, out?: PoseOut) =>
    sinking(w.pose, now - w.tick * STEP, w.side, out);
  const drawing = createDrawing();

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
    while (wrecks.length && !wreckAt(wrecks[0], clock(0))) wrecks.shift();
  };

  const standing = () => ({
    seconds: time(),
    alive: state.alive(),
    fleet,
    crews: battle.crews,
    sunk: sinkings,
    loot: flotsam.pieces.length,
    share: state.share,
  });

  const state = {
    advance(
      helm: Helm,
      gun: Order,
      ask: Ask = NOTHING,
      lap?: (part: Part) => void
    ): Stepped {
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
      log.keep(
        fought,
        wants,
        kept,
        vessel(PLAYER)?.ship.at ?? null,
        tick * STEP
      );
      lap?.('keep');
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
    drawn(between: number): readonly ShipDraw[] {
      const now = clock(between),
        crews = byId(battle.crews);
      let n = 0;
      for (let i = 0; i < fleet.length; i++) {
        const { id, ship, shove } = fleet[i],
          a = aboard.get(id)!,
          c = crews.get(id),
          g = c && inHand(c);
        const d = drawing.slot(n++, id, a.look, true);
        blendPose(a.before, a.after, between, d.pose);
        add(scale(ship.heading, ship.speed, d.velocity), shove, 1, d.velocity);
        if (g) d.gun = drawing.armed(d, g, aims.get(id) ?? ship.heading);
        if (c) d.wear = wearOf(c.health);
      }
      for (const w of wrecks)
        if (wreckAt(w, now, drawing.slot(n, w.id, w.look, false).pose)) n++;
      return drawing.ships(n);
    },
    poseOf(id: number, between: number): ShipPose | null {
      const a = aboard.get(id);
      if (a) return blendPose(a.before, a.after, between);
      for (const w of wrecks)
        if (w.id === id) return wreckAt(w, clock(between));
      return null;
    },
    after: (id: number): ShipPose | null => aboard.get(id)?.after ?? null,
    balls: (between: number): readonly BallDraw[] =>
      drawing.balls(battle.balls, (between - 1) * STEP),
    blasts: log.blasts,
    loot: (): Flotsam => flotsam,
    born: (id: number): number | undefined => born.get(id),
    deeds: log.deeds,
    sea: (_between = 1): Sea | undefined =>
      territory ? held(territory, generation, colors) : undefined,
    share: (id: number) => territory?.share(id) ?? 0,

    result: (): RaceResult | null => tally?.result() ?? null,
    race: (id: number): Race | null =>
      tally?.view(id, standing(), { mode: (k) => aboard.get(k)?.mind?.mode }) ??
      null,
    order: (): number[] =>
      finishing(state.alive(), sinkings, state.share, tally?.forfeit),
    teams: (): readonly number[] | undefined => teams,
    marks: (id: number): readonly Vessel[] => marksOf(battle, id, fleet),

    vessels: (): readonly Vessel[] => fleet,
    vessel,
    crew: (id: number): Crew => byId(battle.crews).get(id)!,
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
          lookOf(
            entry
              ? entry.colors
              : id === PLAYER
                ? livery
                : dealt(m.seed, id, livery)
          ),
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
      launch(
        PLAYER,
        shipAt(start.at, bearingAt(start.at, start.bearing)),
        lookOf(livery)
      );
      return aboard.get(PLAYER)!.after;
    },
    wear(l: Livery): Livery {
      livery = worn(l);
      const own = aboard.get(PLAYER);
      if (quiet && own) own.look = lookOf(livery);
      return livery;
    },
    worn: (): Livery => livery,
  };
  DEBUG.set(state, {
    atSea(
      start: { at: Vec3; bearing: number },
      others: readonly Berth[]
    ): ShipPose {
      clear(match, [PLAYER, ...others.map((_, i) => i + 1)], MATCH);
      launch(
        PLAYER,
        shipAt(start.at, bearingAt(start.at, start.bearing)),
        lookOf(livery)
      );
      others.forEach((o, i) => {
        const way = (o.lashed?.throttle ?? 0) * SHIP.top;
        launch(
          i + 1,
          { ...shipAt(o.at, o.heading), speed: way },
          o.look,
          o.lashed
        );
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
      log.keep(NOTHING_DONE, NOTHING_DONE, NOTHING_DONE, null, tick * STEP);
    },
    mindOf: (id: number): Readonly<Memory> | null =>
      aboard.get(id)?.mind ?? null,
    natureOf: (id: number): Nature | null => aboard.get(id)?.nature ?? null,
    standIn: (id: number, sights: Sighter) => {
      const a = aboard.get(id);
      if (a?.mind) a.sights = sights;
    },
  });
  return state;
}

interface Debug {
  atSea(
    start: { at: Vec3; bearing: number },
    others: readonly Berth[]
  ): ShipPose;
  strew(at: Vec3, goods: readonly Goods[]): void;
  sink(id: number, by: number | null): void;
  mindOf(id: number): Readonly<Memory> | null;
  natureOf(id: number): Nature | null;
  standIn(id: number, sights: Sighter): void;
}

const DEBUG = new WeakMap<object, Debug>();

export function debugOf(state: ReturnType<typeof createState>): Debug {
  const d = DEBUG.get(state);
  if (!d) throw new Error('not a match state');
  return d;
}

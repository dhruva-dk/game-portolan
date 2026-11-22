// The match afloat: every ship on the sea, the bots that sail them, the
// fighting, and the ships going down, stepped at fixed steps (sim/fixed.ts).
// What the game reads of it, and what the frame draws of it at a moment between
// two steps, are plain data.
//
// She sails among others as one fleet (sim/contact.ts): hulls that meet shove
// apart, and a ram knocks the struck ship over a little (sim/ride.ts knocked).
// After the fleet's step comes the fighting's (sim/battle.ts): rams and balls
// take off hit points, the storm (sim/storm.ts, on the match's clock: the steps
// sailed) wears at ships outside its cap, and a ship sunk is taken off the sea
// and drawn going down (sinking.ts) until she is gone. What the fighting did is
// kept a few seconds as Blasts, for the frame to draw (moments.ts,
// gunfire/gunfire.ts). The others are bots (sim/bot.ts, their orders
// orders.ts), each seeded by the match and her slot, unless put to sea with her
// helm lashed, when she holds it and nobody steers her. Ships put to sea
// gunless, unless the match arms them all, and with no shield; loot is strewn
// over the sea for them (sim/loot.ts), and what each carries, her hold and her
// gust, is stepped round the fleet's step and the fighting's (sim/stores.ts):
// what she asks of them first (the player's from her hands, a bot's from her
// mind), then her helm as they sail her, then her mending, the loot swept up
// and the sunk's spilled.
//
// A match begun with start() opens with every ship already afloat at her berth
// (sim/spawn.ts), spread over the whole planet, hers the first; the match's
// clock (the storm's) starts then.
//
// A step makes no lists of its own: what it hands from part to part, and what
// the game reads of it each frame (who holds the sea: held.ts; a ship or a crew
// by id; the ships afloat), is kept and refilled, or indexed by id.

import {
  armed,
  battleOf,
  crewOf,
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
import { faultsIn, fitOf, tended, wearOf } from '../sim/faults.ts';
import { fitted } from './fitted.ts';
import { SHIP, type Handling } from '../sim/handling.ts';
import { sunk } from '../sim/health.ts';
import { regain, type Regained } from '../sim/holding.ts';
import {
  PLAYER,
  SHIPS,
  credited,
  type Cause,
  type Sunk,
} from '../sim/match.ts';
import { berths, type Berthing, type Spawn } from '../sim/spawn.ts';
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
import type { RaceCard, RaceResult } from '../race.ts';
import type { BallDraw, Look, Sea, ShipDraw } from '../snapshot.ts';
import type { Hull } from '../world/swell.ts';
import type { Planet } from '../world/planet.ts';
import { remembered } from '../world/remembered.ts';
import type { PoseOut, ShipPose } from '../world/pose.ts';
import { hash } from '../world/random.ts';
import { add, bearingAt, scale, type Vec3 } from '../world/sphere.ts';
import { LIVERY, type Livery } from '../player.ts';
import { dealt, lookOf, worn } from './colours.ts';
import { createDrawing } from './drawing.ts';
import { createHeld } from './held.ts';
import { indexed } from './indexed.ts';
import { createLog, NOTHING_DONE } from './moments.ts';
import { createOrders, type Hand, type Sighter } from './orders.ts';
import { createTally, finishing, type Tally } from './result.ts';
import { sinking } from './sinking.ts';

/** No way on and the rudder amidships. */
const AMIDSHIPS: Helm = { course: null, throttle: 0 };
/**
 * What a sea is cleared for: a match's, with loot strewn over it and who holds
 * it kept; the lobby's, neither.
 */
const MATCH = { loot: true, held: true },
  LOBBY = { loot: false, held: false };

/**
 * A ship put to sea about her in a match at sea: where she lies and heads, her
 * colours, and her helm lashed (she holds it from the start, making the way its
 * throttle asks, and nobody steers her), or null for a bot at it.
 */
export interface Berth {
  at: Vec3;
  heading: Vec3;
  look: Look;
  lashed: Helm | null;
}

/**
 * The match: its seed (each bot's mind comes from it and her slot), its type
 * (the mix of personas it is sailed by, and its rules: what loot it lays, how
 * its storm closes; sim/persona.ts), its storm by the match's clock (s),
 * planned by its rules, and the gun every ship is armed with, or null for none
 * (as every ship puts to sea in a match).
 */
export interface Match {
  seed: number;
  type: MatchType;
  storm: (seconds: number) => Storm;
  gun: Arms | null;
  /**
   * Its ships' berths (sim/spawn.ts berths, one a ship), when worked out ahead
   * of its start (play/setup.ts).
   */
  berths?: readonly Spawn[];
  /**
   * The card it is sailed by, a race of teams (race.ts); none: a Single Race,
   * SHIPS ships each for herself.
   */
  card?: RaceCard;
}

/**
 * A ship sunk: who she was, who sank her (the ship whose ball or ram dealt the
 * last blow; null for the storm), how and by a ball the gun's kind, when, on
 * the match's clock (s), and where she went down and the way she headed.
 */
interface Sinking extends Sunk {
  time: number;
  at: Vec3;
  heading: Vec3;
}

/**
 * A ship as the match's flow reads her: who she is (0 the player's), where she
 * is and heads, her hit points, whether she carries a gun, and whether she is
 * still afloat.
 */
interface Afloat {
  id: number;
  at: Vec3;
  heading: Vec3;
  hull: number;
  shield: number;
  armed: boolean;
  afloat: boolean;
}

/**
 * What a step did to who holds the sea: its loops closed (sim/territory.ts;
 * null outside a match), and the shield each ship's water gave back
 * (sim/holding.ts).
 */
interface Held {
  held: Outcome | null;
  regained: readonly Regained[];
}
/** A step outside a match. */
const UNHELD: Held = { held: null, regained: [] };

/**
 * What a step did: to who holds the sea (Held); and the shots fired in it, the
 * blows struck home (balls and rams, by whom on whom, and what they took), the
 * balls come down short, and the loot taken up (sim/battle.ts, sim/loot.ts),
 * for whoever keeps count (the harness: the frame reads what is kept for it
 * instead, moments.ts).
 */
interface Stepped extends Held {
  shots: readonly Shot[];
  strikes: readonly Strike[];
  splashes: readonly Splash[];
  took: readonly Taken[];
}

/**
 * A step's parts, in the order they run: the orders (the bots' thinking), the
 * fleet sailed, the fighting, who holds the sea, the ships riding the swell,
 * the sunk taken off, and what it all did kept (advance's `lap`).
 */
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

/** What the fleet's step and the stores' hand on within a step. */
type Met = ReturnType<typeof stepFleet>;
type Wants = ReturnType<typeof asked>;
type Fought = ReturnType<typeof stepBattle>;

/**
 * What is kept of a ship afloat beside her Vessel: her colours, her bot (null:
 * the player's, or a lashed ship's), the helm a lashed ship holds, how she
 * rides the sea, and her last two poses.
 */
interface Aboard extends Hand {
  look: Look;
  ride: Ride;
  before: ShipPose;
  after: ShipPose;
}
/**
 * A ship going down: her pose when she sank and the step she sank at, listing
 * to `side`.
 */
interface Wreck {
  id: number;
  look: Look;
  pose: ShipPose;
  tick: number;
  side: number;
}

/**
 * The planet's water as the match reads it, sounded once (play/sounding.ts):
 * the bots' chart of open water for their routes (sim/route.ts), and the open
 * water ships are berthed in at a match's start (sim/spawn.ts).
 */
export interface Waters {
  chart: Chart;
  water: Berthing;
}

/**
 * planet: the world's; sea: its waves, which the ships ride; waters: its water,
 * sounded; brainOf: the brain each bot by id sails with (the game's own if not
 * given: sim/brain.ts; the harness gives others).
 */
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
  /**
   * The card the sea is sailed by, in a race of teams, and each ship's team by
   * her id; neither on any other sea.
   */
  let card: RaceCard | undefined, teams: readonly number[] | undefined;
  /** A race's tally as it is sailed, and its result once over (result.ts). */
  let tally: Tally | null = null;
  const seedOf = (id: number) => hash(match.seed, id);
  let fleet: Vessel[] = [];
  const aboard = new Map<number, Aboard>();
  let battle: Battle = battleOf([], match.seed, match.type.rules.aim.assist);
  let wrecks: Wreck[] = [];
  /**
   * The line of sight each ship's gun was last laid along (a unit vector; null:
   * her heading), for it to be drawn so.
   */
  const aims = new Map<number, Vec3 | null>();
  /** Where each ship lay before the step under way. */
  const from = new Map<number, Vec3>();
  /**
   * What happened in the last second or so, and what the guns did (moments.ts);
   * when each piece put on the water since the match began came onto it (the
   * world's clock).
   */
  const log = createLog(PLAYER),
    born = new Map<number, number>();
  /**
   * The loot on the water; the storm's phase whose cache was dropped last
   * (Infinity: none to drop, the sea strewn with no loot).
   */
  let flotsam: Flotsam = { pieces: [], next: 0 },
    dropped = Infinity;
  /** The guns ringing out: each ship's last shot, for a few seconds. */
  let gunfire: Report[] = [];
  const sinkings: Sinking[] = [];
  /**
   * Each ship's last blow taken: its striker, and the step it landed on (for
   * the Storm's sinkings, sim/match.ts credited).
   */
  const struck = new Map<number, { by: number; tick: number }>();
  /**
   * The world's steps (the sea's clock), and the step the match's clock started
   * at.
   */
  let tick = 0,
    begun = 0;
  /**
   * Whether the sea is the lobby's, no match running: no storm then, however
   * long she lies there.
   */
  let quiet = false;
  /**
   * Who holds the sea (sim/territory.ts), in a match; and as the frame reads
   * it.
   */
  let territory: Territory | null = null;
  const held = createHeld();
  /**
   * Her livery, as she last chose it (wear); each ship's colour on the sea by
   * id, as she was put to sea this match (her canvas's dye).
   */
  let hers: Livery = LIVERY;
  const colours: Vec3[] = [];
  /**
   * Which match's sea it is (snapshot.ts Sea generation): one more for each sea
   * cleared.
   */
  let generation = 0;
  const orders = createOrders(depth, chart);

  /**
   * The crews by id (a step hands on new lists of them), and the ships afloat.
   */
  const byId = indexed<Crew>().of,
    vessels = indexed<Vessel>();
  const vessel = (id: number): Vessel | null =>
    vessels.of(fleet).get(id) ?? null;
  /**
   * The ids of every ship not sunk, worked out again only once one sinks (null)
   * or the sea is cleared.
   */
  let alive: number[] | null = null;

  /**
   * What a step hands from part to part, kept and refilled: the ships sunk in
   * it, the ships still sailing, their moves and their ids, the ships that
   * blew a gust, and each ship's handling as she sails the step.
   */
  const fits: Handling[] = [],
    lost: number[] = [],
    sailing: Vessel[] = [],
    moves: Move[] = [],
    ids: number[] = [],
    blown = new Set<number>();

  /**
   * Puts a ship to sea: a bot's unless she is the player's (and `manned`) or
   * her helm is lashed.
   */
  const launch = (
    id: number,
    ship: ShipState,
    look: Look,
    lashed: Helm | null = null,
    manned = true
  ) => {
    fleet.push(afloat(id, ship));
    vessels.stale();
    colours[id] = look.sail;
    const r = settled(ship, sea, tick * STEP, id),
      p = pose(ship, r);
    const bot = (id !== PLAYER || !manned) && !lashed,
      carded = card?.ships[id],
      driver = carded?.driver;
    aboard.set(id, {
      look,
      mind: bot ? mind(driver?.seed ?? seedOf(id), ship.at) : null,
      // (a card's driver is her own bot, under her team's call; else the bot
      // her berth's seed deals)
      nature: driver
        ? natureOf(
            driver,
            closedBy(match.type.rules.storm),
            brainOf(id),
            carded?.call
          )
        : nature(seedOf(id), brainOf(id), match.type.mix),
      steady: lashed ?? AMIDSHIPS,
      ride: r,
      before: p,
      after: p,
      ...(teams && { team: teams[id] }),
    });
  };

  /**
   * Clears the sea for a new match of the ships `ids`: its loot strewn over it
   * if `loot`, who holds it kept if `held`; sailed by the card `by`, if given.
   */
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
    colours.length = 0;
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

  /** The match's clock: seconds since it began. */
  const time = () => (tick - begun) * STEP;
  /** The storm at `seconds` on the match's clock: none on the lobby's sea. */
  const stormAt = (seconds: number): Storm =>
    quiet ? calm(match.storm(0).centre) : match.storm(seconds);

  /** A ship sinks now, at the hand of `by` (null: the storm). */
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
    // the bot she was sunk by is told: her mood warms (sim/fighting.ts)
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

  /**
   * The world's clock at the moment drawn, `between` of the way from the step
   * before last to the last.
   */
  const clock = (between: number) => (tick - 1 + between) * STEP;

  /**
   * A wreck as drawn at the world's clock `now` (into `out`), or null once she
   * is gone.
   */
  const wreckAt = (w: Wreck, now: number, out?: PoseOut) =>
    sinking(w.pose, now - w.tick * STEP, w.side, out);
  /**
   * The ships and balls as the frame is handed them, written over each frame.
   */
  const drawing = createDrawing();

  /**
   * The fleet sailed a step: each helm as her stores and her water have it; a
   * bot rammed knows who rammed her. Returns what her stores were asked and the
   * fleet's meeting; `from` holds where each ship lay before.
   */
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
    // (a mate's hull against hers is no ram to her: sim/battle.ts)
    for (const b of met.blows) {
      const a = aboard.get(b.struck.id);
      if (a?.mind && !mates(teams, b.struck.id, b.striker.id))
        a.mind = rammed(a.mind, b.striker.id);
    }
    return { wants, met };
  };

  /**
   * The fighting's step, the storm's wear and the stores' (mending, the loot
   * swept up, the sunk's spilled); a bot struck by a ball knows who shot her
   * (and fires back, though she holds her fire otherwise). Returns what the
   * guns did and what the stores did; `lost` holds the ships sunk.
   */
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

  /**
   * Whether ship `id` lies in her own water: in a race of teams, in any of her
   * team's.
   */
  const home = (id: number) => {
    const v = vessel(id);
    if (!v || !territory) return false;
    return teams
      ? territory.teamAt(v.ship.at) === teams[id]
      : territory.ownerAt(v.ship.at) === id;
  };

  /** The sea as a team holds it: a ship's share her team's, pooled. */
  const pooled = { share: (id: number) => territory?.teamShare(id) ?? 0 };

  /**
   * Who holds the sea after the step (each strip painted, each loop closed),
   * and each ship's shield coming back by her share of it (in a race of teams,
   * her team's water together: a team's water is shared): of the ships still
   * afloat, those sunk in the step (`lost`) painting and closing nothing in it.
   * Then every ship's hull mended in her own water, or leaking
   * (sim/faults.ts tended).
   */
  const hold = (storm: Storm): Held => {
    if (!territory) {
      battle.crews = tended(battle.crews, () => false, STEP);
      return UNHELD;
    }
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
    // (in a race sailed by a card her water mends no one: the pit does)
    battle.crews = tended(back.crews, tally ? () => false : home, STEP);
    return { held: did, regained: back.regained };
  };

  /**
   * Each ship afloat riding the sea through the step (hopped if she blew a
   * gust, knocked by a ram), and posed.
   */
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

  /**
   * The sunk taken off the sea, to go down, each credited to who sank her;
   * those gone down by the step before last no longer drawn.
   */
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
    // (each goes down as long as the others, so the first sunk is the first
    // gone)
    while (wrecks.length && !wreckAt(wrecks[0], clock(0))) wrecks.shift();
  };

  /** The sea as a step left it, as a race's tally reads it (result.ts). */
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
    /**
     * One step: the player's helm, gun and stores, everyone else's from her bot
     * or her lashed helm; then the fleet's step and the fighting's, who holds
     * the sea, and what it all did kept to be drawn. Returns what it did
     * (Stepped). `lap`, if given, is told as each of its parts is done
     * (tools/steps.ts times them).
     */
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
      if (tally)
        battle.crews = tally.tend(battle.crews, told.asks, {
          home,
          tick,
          aboard,
        });
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

    /** The match's clock: seconds since it began. */
    time,
    /**
     * The world's clock at the moment drawn, `between` of the way through the
     * last step.
     */
    clock,
    /** The storm at the moment drawn, on the match's clock. */
    storm(between: number): Storm {
      return stormAt(Math.max(0, clock(between) - begun * STEP));
    },
    /**
     * Every ship drawn at the moment `between` of the way through the last
     * step: afloat, her wear and faults hers (sim/faults.ts), or going down.
     */
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
        if (c) {
          d.wear = wearOf(c.health.hull);
          d.faults = faultsIn(c);
        }
      }
      for (const w of wrecks)
        if (wreckAt(w, now, drawing.slot(n, w.id, w.look, false).pose)) n++;
      return drawing.ships(n);
    },
    /**
     * Where a ship is drawn at the moment `between` of the way through the last
     * step, or null if she is not.
     */
    poseOf(id: number, between: number): ShipPose | null {
      const a = aboard.get(id);
      if (a) return blendPose(a.before, a.after, between);
      for (const w of wrecks)
        if (w.id === id) return wreckAt(w, clock(between));
      return null;
    },
    /** A ship's pose after the last step, if she is afloat. */
    after: (id: number): ShipPose | null => aboard.get(id)?.after ?? null,
    /**
     * Every ball in flight at the moment `between` of the way through the last
     * step (world metres), and its way.
     */
    balls: (between: number): readonly BallDraw[] =>
      drawing.balls(battle.balls, (between - 1) * STEP),
    /** What the guns did in the last KEPT seconds, oldest first. */
    blasts: log.blasts,
    /** The loot on the water. */
    loot: (): Flotsam => flotsam,
    /**
     * When a piece came onto the water (the world's clock, s), if it did after
     * the match began.
     */
    born: (id: number): number | undefined => born.get(id),
    /** What happened in about the last second, oldest first (moments.ts). */
    deeds: log.deeds,
    /**
     * Who holds the sea, as drawn at the moment `between` of the way through
     * the last step (as it stands after it: it changes only on a step), the
     * same object each time, refilled (held.ts); none outside a match.
     */
    sea: (_between = 1): Sea | undefined =>
      territory ? held(territory, generation, colours) : undefined,
    /** A ship's share of the planet's water now, 0…1 (none outside a match). */
    share: (id: number) => territory?.share(id) ?? 0,

    /**
     * A race's result, once it is over (race.ts RaceResult): null while it is
     * on, and on any sea but a carded race's.
     */
    result: (): RaceResult | null => tally?.result() ?? null,
    /**
     * Every ship of the match in the order she would finish as it stands
     * (result.ts finishing), first place first; a race's forfeits last.
     */
    order: (): number[] =>
      finishing(state.alive(), sinkings, state.share, tally?.forfeit),
    /** Each ship's team by her id, in a race of teams; else none. */
    teams: (): readonly number[] | undefined => teams,
    /**
     * The ships ship `id`'s gun may be laid on by its assist: every one afloat
     * but her own team's (sim/battle.ts marksOf).
     */
    marks: (id: number): readonly Vessel[] => marksOf(battle, id, fleet),

    /** The ships on the sea, as the sim has them. */
    vessels: (): readonly Vessel[] => fleet,
    /** A ship on the sea by id, or null once sunk. */
    vessel,
    /** A ship's crew: her health and her gun (sim/battle.ts). */
    crew: (id: number): Crew => byId(battle.crews).get(id)!,
    /** The guns' assist this match: its cone, radians, by rarity (rules.ts). */
    assist: (): readonly number[] => battle.assist,
    /** Her ship on the sea, or null once sunk. */
    mine: () => vessel(PLAYER),
    /** The ids of every ship not sunk (the same list until one sinks). */
    alive: (): readonly number[] => {
      if (alive) return alive;
      alive = [];
      for (const c of battle.crews) if (!sunk(c.health)) alive.push(c.id);
      return alive;
    },
    /**
     * Every ship sunk so far, in the order they went down (a new entry is a
     * ship just sunk).
     */
    sinkings: (): readonly Sinking[] => sinkings,
    /** A ship sunk by id, or null if she is not. */
    sinking: (id: number): Sinking | null => {
      for (const k of sinkings) if (k.id === id) return k;
      return null;
    },
    /**
     * Every ship of the match, afloat or sunk, as she stands now, in order of
     * her id.
     */
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
    /**
     * A new match: SHIPS ships, hers the first, the rest bots, every one afloat
     * at her berth (sim/spawn.ts) with a gun in reach of it (sim/loot.ts
     * berthed). Returns her pose. manned: false puts a bot at her helm too (for
     * tools/harness, whole matches of bots).
     */
    start(m: Match, manned = true): ShipPose {
      const by = m.card,
        count = by ? by.ships.length : SHIPS;
      const ids = by ? entered(by) : Array.from({ length: count }, (_, i) => i);
      clear(m, ids, MATCH, by);
      const at = m.berths ?? berths(water, m.seed, count, depth);
      flotsam = lay.berthed(
        flotsam,
        at.map((b) => b.at)
      );
      // hers as she chose it, the bots' dealt by the race's seed round it; in
      // a race, each as her card has her (her hands on her ship only if it
      // names no driver for her)
      for (const id of ids) {
        const b = at[id],
          entry = by?.ships[id];
        launch(
          id,
          shipAt(b.at, b.heading),
          lookOf(
            entry
              ? entry.colours
              : id === PLAYER
                ? hers
                : dealt(m.seed, id, hers)
          ),
          null,
          manned && (!entry || !entry.driver)
        );
      }
      territory?.begin(
        at.map((b, id) => (aboard.has(id) ? b.at : null)),
        tick * STEP
      );
      // (her ship kept ashore by a forfeit: her berth, as she would have lain)
      const her = aboard.get(PLAYER);
      if (her) return her.after;
      const ashore = shipAt(at[PLAYER].at, at[PLAYER].heading);
      return pose(ashore, settled(ashore, sea, tick * STEP, PLAYER));
    },
    /**
     * A quiet sea for the lobby: her ship alone at `start`. Returns her pose.
     */
    anchor(start: { at: Vec3; bearing: number }): ShipPose {
      clear(match, [PLAYER], LOBBY);
      quiet = true;
      launch(
        PLAYER,
        shipAt(start.at, bearingAt(start.at, start.bearing)),
        lookOf(hers)
      );
      return aboard.get(PLAYER)!.after;
    },
    /**
     * Her livery as she chooses it (held to the set): her ship at anchor in it
     * at once, and hers in every match after, the bots dealt round it. A match
     * under way keeps the colours it was put to sea in. Returns hers as worn.
     */
    wear(l: Livery): Livery {
      hers = worn(l);
      const her = aboard.get(PLAYER);
      if (quiet && her) her.look = lookOf(hers);
      return hers;
    },
    /** Her livery, as she last chose it. */
    worn: (): Livery => hers,
  };
  // what only the debug switches (src/debug.ts) and the tools ask of the
  // match: kept off the state the game plays, had by debugOf
  DEBUG.set(state, {
    /**
     * A match at sea about her: hers at `start`, heading `bearing` (radians),
     * and the others. Returns her pose.
     */
    atSea(
      start: { at: Vec3; bearing: number },
      others: readonly Berth[]
    ): ShipPose {
      clear(match, [PLAYER, ...others.map((_, i) => i + 1)], MATCH);
      launch(
        PLAYER,
        shipAt(start.at, bearingAt(start.at, start.bearing)),
        lookOf(hers)
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
    /**
     * Puts goods on the water at `at` (a unit vector), lying still and no
     * ship's, as if long spilt.
     */
    strew(at: Vec3, goods: readonly Goods[]) {
      const n = flotsam.pieces.length;
      const f = overboard(flotsam, at, goods, -1, match.seed);
      const still = (l: Flotsam['pieces'][number], i: number): typeof l =>
        i < n ? l : { ...l, way: [0, 0, 0], age: 10 };
      flotsam = { ...f, pieces: f.pieces.map(still) };
    },
    /**
     * Sends a ship afloat to the bottom at once, the last blow `by`'s (null:
     * the storm's), spilling what she carries.
     */
    sink(id: number, by: number | null) {
      if (!aboard.has(id)) return;
      const before = flotsam.next,
        s = spilled(battle.crews, flotsam, fleet, [id], match.seed);
      for (let n = before; n < s.flotsam.next; n++) born.set(n, tick * STEP);
      flotsam = s.flotsam;
      const gone = (c: Crew): Crew =>
        c.id === id ? { ...c, health: { ...c.health, hull: 0, shield: 0 } } : c;
      battle = { ...battle, crews: s.crews.map(gone) };
      // by a ball from the gun `by` has in hand
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
    /**
     * A bot's mind as it stands after the last step (what she is about, her
     * goal, her route), or null for a ship no bot sails or one sunk: to be
     * read, never written (tools/harness watches the bots by it).
     */
    mindOf: (id: number): Readonly<Memory> | null =>
      aboard.get(id)?.mind ?? null,
    /**
     * A ship's nature (her persona, her crew's brain, her temperament), or
     * null for one sunk (tools/harness tells the bots apart by it).
     */
    natureOf: (id: number): Nature | null => aboard.get(id)?.nature ?? null,
    /**
     * Makes a bot of this match a stand-in for a player (orders.ts Hand):
     * `sights` lays her gun, her bot the rest (tools/harness/player.ts). For
     * this match only: the next start puts a bot at every helm again.
     */
    standIn: (id: number, sights: Sighter) => {
      const a = aboard.get(id);
      if (a?.mind) a.sights = sights;
    },
  });
  return state;
}

/** What only the debug switches and the tools ask of a match (debugOf). */
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

/** Each state's debug face, set as it is made. */
const DEBUG = new WeakMap<object, Debug>();

/**
 * What only the debug switches (src/debug.ts) and the tools ask of a match: a
 * match laid out at sea, goods strewn, a ship sunk at once; a bot's mind and
 * nature, to be read. Kept off the state itself, so the game plays a state
 * without them.
 */
export function debugOf(state: ReturnType<typeof createState>): Debug {
  const d = DEBUG.get(state);
  if (!d) throw new Error('not a match state');
  return d;
}

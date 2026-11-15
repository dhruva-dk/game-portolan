// The match afloat: every ship on the sea, the bots that sail them, the fighting, and the ships going
// down, stepped at fixed steps (sim/fixed.ts). What the game reads of it, and what the frame draws of it at a moment
// between two steps, are plain data.
//
// She sails among others as one fleet (sim/contact.ts): hulls that meet shove apart, and a ram knocks the struck ship
// over a little (sim/ride.ts knocked). After the fleet's step comes the fighting's (sim/battle.ts): rams and balls
// take off hit points, the storm (sim/storm.ts, on the match's clock: the steps sailed) wears at ships outside its
// cap, and a ship sunk is taken off the sea and drawn going down (sinking.ts) until she is gone. What the fighting did
// is kept a few seconds as Blasts, for the frame to draw (moments.ts, gunfire/gunfire.ts). The others are bots (sim/bot.ts), each
// seeded by the match and her slot, unless put to sea with her helm lashed, when she holds it and nobody steers her.
// Ships put to sea gunless, unless the match arms them all, and with no shield; loot is strewn over the sea for them
// (sim/loot.ts), and what each carries, her hold and her gust, is stepped round the fleet's step and the fighting's
// (sim/stores.ts): what she asks of them first (the player's from her hands, a bot's from her mind), then her helm as
// they sail her, then her mending, the loot swept up and the sunk's spilled.
//
// A match begun with start() opens with every ship already afloat at her berth (sim/spawn.ts), spread over the whole
// planet, hers the first; the match's clock (the storm's) starts then.

import { armed, battleOf, crewOf, stepBattle, weathered, type Battle, type Crew, type Order } from '../sim/battle.ts';
import { mind, rammed, shot } from '../sim/bot.ts';
import { afloat, stepFleet, type Vessel } from '../sim/contact.ts';
import { STEP } from '../sim/fixed.ts';
import { gunOf } from '../sim/gun.ts';
import { SPEC, type Handling } from '../sim/fit.ts';
import { SHIP } from '../sim/handling.ts';
import { sunk, whole } from '../sim/health.ts';
import { homed, regain } from '../sim/holding.ts';
import { PLAYER, credited, oneSide, type Cause } from '../sim/match.ts';
import { berths } from '../sim/spawn.ts';
import { hopped, knocked, pose, ride, settled } from '../sim/ride.ts';
import { berthed, overboard, strewn, type Flotsam, type Goods } from '../sim/loot.ts';
import { asked, crewed, NOTHING, spilled, stored, type Ask } from '../sim/stores.ts';
import { shipAt, type Helm, type ShipState } from '../sim/ship.ts';
import { calm, type Storm } from '../sim/storm.ts';
import { createTerritory, type Move, type Territory } from '../sim/territory.ts';
import type { BallDraw, Blast, Look, Sea, ShipDraw } from '../snapshot.ts';
import type { Deed } from '../player.ts';
import type { Hull } from '../world/swell.ts';
import { remembered, risesOf, type Planet } from '../world/planet.ts';
import type { ShipPose } from '../world/pose.ts';
import { add, type Vec3 } from '../world/sphere.ts';
import { drawnPose, drawnShips, seaColours, wreckAt, type Aboard, type Wreck } from './aboard.ts';
import { LOOK, lookIn } from './colours.ts';
import { bearing, fitIn, fleetOf, lengthIn, seedIn, sideIn, type Afloat, type Berth, type Match, type Sinking, type Stepped, type Part, type Waters } from './match.ts';
import { blastsOf, deedsOf, kept as keptDeeds } from './moments.ts';
import { createTally } from './result.ts';
import type { RaceResult } from '../race.ts';
import { botOf, command } from './orders.ts';

export { PARTS, bearing, fleetOf, type Afloat, type Berth, type Match, type Part, type Sinking, type Stepped, type Waters } from './match.ts';

/** No way on and the rudder amidships. */
const AMIDSHIPS: Helm = { course: null, throttle: 0 };
/** What a sea is cleared for: a match's, with loot strewn over it and who holds it kept; the lobby's, neither. */
const MATCH = { loot: true, held: true }, LOBBY = { loot: false, held: false };

/** What the fleet's step, the stores' and the fighting's hand on within a step. */
type Met = ReturnType<typeof stepFleet>;
type Wants = ReturnType<typeof asked>;
type Fought = ReturnType<typeof stepBattle>;

/** planet: the world's; sea: its waves, which the ships ride; waters: its water, sounded. */
export function createState(planet: Planet, sea: Hull, { chart, water }: Waters, first: Match) {
  const depth = remembered((p: Vec3) => -planet.height(p)), rises = risesOf(planet.islands);
  let match = first;
  const seedOf = (id: number) => seedIn(match, id);
  let fleet: Vessel[] = [];
  const aboard = new Map<number, Aboard>();
  let battle: Battle = battleOf([], match.seed);
  let wrecks: Wreck[] = [], blasts: Blast[] = [];
  /** The line of sight each ship's gun was last laid along (a unit vector; null: her heading), for it to be drawn so. */
  const aims = new Map<number, Vec3 | null>();
  /** Crews by id, what each ship asks of her stores in the step under way and where she lay before it: refilled in
   *  place, not made anew each time. */
  const crewsById = new Map<number, Crew>(), asks = new Map<number, Ask>(), from = new Map<number, Vec3>();
  const byId = (crews: readonly Crew[]) => {
    crewsById.clear();
    for (const c of crews) crewsById.set(c.id, c);
    return crewsById;
  };
  /** What happened in the last second or so (moments.ts), and the last one's number (never reset: a reader keeps its
   *  place across matches); when each piece put on the water since the match began came onto it (the world's clock). */
  let deeds: Deed[] = [], seq = 0;
  const born = new Map<number, number>();
  /** The ships sunk in the step under way, for its deeds. */
  const lostNow: { id: number; by: number | null; at: Vec3 }[] = [];
  /** The loot on the water. */
  let flotsam: Flotsam = { pieces: [], next: 0 };
  const sinkings: Sinking[] = [];
  /** Each ship's last blow taken: its striker, and the step it landed on (for the Storm's sinkings, sim/match.ts credited). */
  const struck = new Map<number, { by: number; tick: number }>();
  /** The world's steps (the sea's clock), and the step the match's clock started at. */
  let tick = 0, begun = 0;
  /** Whether the sea is the lobby's, no match running: no storm then, however long she lies there. */
  let quiet = false;
  /** Who holds the sea (sim/territory.ts), in a match. */
  let territory: Territory | null = null;
  /** Which match's sea it is (snapshot.ts Sea generation): one more for each sea cleared. */
  let generation = 0;
  /** The race's tally (result.ts), and its result once it is over (every ship afloat of one side, or none). */
  let tally = createTally(0), ended: RaceResult | null = null;

  /** Puts a ship to sea: a bot's unless she is the player's (and `manned`) or her helm is lashed. */
  const launch = (id: number, ship: ShipState, look: Look, lashed: Helm | null = null, manned = true) => {
    const v = afloat(id, ship, fitIn(match, id), sideIn(match, id));
    fleet.push(v);
    const r = settled(v, sea, tick * STEP, id), p = pose(ship, r);
    const bot = (id !== PLAYER || !manned) && !lashed;
    const b = bot ? botOf(match, id) : null;
    aboard.set(id, { look, mind: b && mind(b.seed, ship.at), bot: b, steady: lashed ?? AMIDSHIPS, ride: r, before: p, after: p });
  };

  /** Clears the sea for a new match: its loot strewn over it if `loot`, who holds it kept if `held`. */
  const clear = (m: Match, ids: readonly number[], { loot, held }: { loot: boolean; held: boolean }) => {
    match = m;
    flotsam = loot ? strewn(m.seed, depth) : { pieces: [], next: 0 };
    fleet = [];
    aboard.clear();
    aims.clear();
    wrecks = [];
    blasts = [];
    born.clear();
    sinkings.length = 0;
    struck.clear();
    const gun = match.gun;
    const crew = (id: number) => (gun ? crewOf(id, gunOf(gun.kind, gun.rarity)) : crewOf(id));
    battle = battleOf(ids.map((id) => ({ ...crew(id), side: sideIn(m, id), health: whole(fitIn(m, id).hull) })), match.seed);
    const count = Math.max(...ids) + 1;
    territory = held ? createTerritory(count, Array.from({ length: count }, (_, id) => sideIn(m, id))) : null;
    [tally, ended] = [createTally(count), null];
    generation++;
    begun = tick;
    quiet = false;
  };

  /** The match's clock: seconds since it began. */
  const time = () => (tick - begun) * STEP;
  /** The storm at `seconds` on the match's clock: none on the lobby's sea. */
  const stormAt = (seconds: number): Storm => (quiet ? calm(match.storm(0).centre) : match.storm(seconds));

  /** A ship sinks now, at the hand of `by` (null: the storm). */
  const founder = (id: number, by: number | null, cause: Sinking['cause']) => {
    const a = aboard.get(id), v = fleet.find((o) => o.id === id);
    if (!a || !v) return;
    sinkings.push({ id, by, cause, time: time(), at: v.ship.at, heading: v.ship.heading });
    lostNow.push({ id, by, at: v.ship.at });
    tally.sank(id, territory?.share(id) ?? 0);
    territory?.sink(id, tick * STEP);
    wrecks.push({ id, look: a.look, pose: a.after, at: tick * STEP, side: seedOf(id) & 1 ? 1 : -1 });
    aboard.delete(id);
    fleet = fleet.filter((o) => o.id !== id);
  };

  /** The world's clock at the moment drawn, `between` of the way from the step before last to the last. */
  const clock = (between: number) => (tick - 1 + between) * STEP;

  /** What the ships are drawn from now (aboard.ts). */
  const drawing = () => ({ fleet, aboard, crews: byId(battle.crews), aims, wrecks });

  /** The fleet sailed a step: each helm as her stores and her water have it; a bot rammed knows who rammed her.
   *  Returns what her stores were asked, the fleet's meeting, and where each ship lay before. */
  const sail = (helms: Helm[], asks: ReadonlyMap<number, Ask>) => {
    const wants = asked(battle.crews, fleet, flotsam, asks);
    battle = { ...battle, crews: wants.crews };
    const manned = byId(wants.crews);
    fleet.forEach((v, i) => { helms[i] = homed(crewed(helms[i], manned.get(v.id)), territory, v); });
    from.clear();
    for (const v of fleet) from.set(v.id, v.ship.at);
    const met = stepFleet(fleet, helms, STEP, depth);
    fleet = met.fleet;
    for (const b of met.blows) {
      const a = aboard.get(b.struck.id);
      if (a?.mind) a.mind = rammed(a.mind, b.striker.id);
    }
    return { wants, met, from };
  };

  /** The fighting's step, the storm's wear and the stores' (mending, the loot swept up, the sunk's spilled); a bot
   *  struck by a ball knows who shot her (and fires back, though she holds her fire otherwise). Returns what the guns
   *  did and the ships sunk. */
  const fight = (orders: Order[], met: Met, storm: Storm, wants: Wants) => {
    const fought = stepBattle(battle, fleet, orders, met.blows, STEP, depth, rises);
    for (const s of fought.strikes) {
      struck.set(s.struck, { by: s.shooter, tick });
      const a = aboard.get(s.struck);
      if (a?.mind && !s.ram) a.mind = shot(a.mind, s.shooter);
    }
    const worn = weathered(fought.battle, fleet, storm, STEP);
    const lost = [...fought.sunk, ...worn.sunk];
    const before = flotsam.next;
    const kept = stored(worn.battle.crews, flotsam, fleet, wants.takes, lost, STEP, depth, match.seed);
    battle = { ...worn.battle, crews: kept.crews };
    flotsam = kept.flotsam;
    for (let id = before; id < flotsam.next; id++) born.set(id, tick * STEP);
    return { fought, lost, kept };
  };

  /** Who holds the sea after the step (each trail laid, each loop closed), and in her own water her shield coming
   *  back: of the ships still afloat, those sunk in the step (`lost`) laying, closing and cutting nothing in it. */
  const hold = (from: ReadonlyMap<number, Vec3>, storm: Storm, lost: readonly number[]): Pick<Stepped, 'held' | 'regained'> => {
    if (!territory) return { held: null, regained: [] };
    const sailing = lost.length ? fleet.filter((v) => !lost.includes(v.id)) : fleet;
    const held = territory.step(sailing.map((v): Move => ({ id: v.id, from: from.get(v.id) ?? v.ship.at, to: v.ship.at })), tick * STEP, storm);
    const back = regain(battle.crews, sailing, territory, STEP);
    battle = { ...battle, crews: back.crews };
    return { held, regained: back.regained };
  };

  /** Each ship afloat riding the sea through the step (hopped if she blew a gust, knocked by a ram), and posed. */
  const rideOn = (met: Met, blew: readonly number[]) => {
    fleet.forEach((v, i) => {
      const a = aboard.get(v.id)!;
      if (blew.includes(v.id)) a.ride = hopped(a.ride);
      a.ride = ride(knocked(a.ride, v.ship, met.jolts[i]), v, sea, tick * STEP, STEP);
      [a.before, a.after] = [a.after, pose(v.ship, a.ride)];
    });
  };

  /** The sunk taken off the sea, to go down, each credited to who sank her; those gone down by the step before last
   *  no longer drawn. */
  const founderAll = (lost: readonly number[], fought: Fought) => {
    for (const id of lost) {
      const blow = fought.sunk.includes(id) ? fought.strikes.findLast((s) => s.struck === id) : undefined;
      const cause: Cause = blow ? (blow.ram ? 'ram' : 'shot') : 'storm', last = struck.get(id);
      founder(id, credited(cause, last ? { by: last.by, ago: (tick - last.tick) * STEP } : null), cause);
    }
    wrecks = wrecks.filter((w) => wreckAt(w, clock(0)));
  };

  /** A ship sunk where she lies, with nothing spilled: hers at no one's hand, by `cause`. */
  const scuttle = (id: number, by: number | null, cause: Cause) => {
    battle = { ...battle, crews: battle.crews.map((c) => (c.id === id ? { ...c, health: { ...c.health, hull: 0, shield: 0 } } : c)) };
    founder(id, by, cause);
  };

  /** The race's result kept the step it ends: every ship afloat of one side, or none (a match's sea only). */
  const settle = () => {
    const alive = battle.crews.filter((c) => !sunk(c.health)).map((c) => c.id);
    if (ended || !territory || !oneSide(alive, (id) => sideIn(match, id))) return;
    ended = tally.result(match, alive, sinkings, (id) => territory?.share(id) ?? 0, time());
  };

  /** What the step did kept (moments.ts), with any ship sunk in it: its deeds, numbered on, and what the guns did, to
   *  be drawn from this step on. */
  const record = (done: Parameters<typeof deedsOf>[0]) => {
    deeds = keptDeeds(deeds, deedsOf(done, PLAYER, () => ++seq, tick * STEP), tick * STEP);
    blasts = blastsOf(blasts, done, tick * STEP);
    lostNow.length = 0;
  };

  return {
    /** One step: the player's helm, gun and stores, everyone else's from her bot or her lashed helm; then the fleet's
     *  step and the fighting's, who holds the sea, and what it all did kept to be drawn. Returns what it did to who
     *  holds the sea and the guns' shots and strikes. `lap`, if given, is told as each of its parts is done (tools/steps.ts times them). */
    advance(helm: Helm, gun: Order, ask: Ask = NOTHING, lap?: (part: Part) => void): Stepped {
      const storm = stormAt(time());
      const sea = { depth, chart, storm, loot: flotsam.pieces, holdings: territory };
      const { helms, orders } = command({ fleet, aboard, crews: byId(battle.crews), sea, hers: { helm, gun, ask }, clock: time(), length: lengthIn(match) }, asks);
      fleet.forEach((v, i) => aims.set(v.id, orders[i]?.aim?.dir ?? null));
      lap?.('command');
      const { wants, met, from } = sail(helms, asks);
      lap?.('sail');
      const { fought, lost, kept } = fight(orders, met, storm, wants);
      lap?.('fight');
      tick++;
      const did = hold(from, storm, lost);
      lap?.('hold');
      rideOn(met, wants.blew);
      lap?.('ride');
      founderAll(lost, fought);
      tally.step(fought.shots, fought.strikes);
      settle();
      lap?.('founder');
      record({ ...fought, cues: [...wants.cues, ...fought.cues], sunk: lostNow, took: kept.took, mended: kept.mended, blew: wants.blew, her: fleet.find((v) => v.id === PLAYER)?.ship.at ?? null });
      lap?.('keep');
      return { ...did, shots: fought.shots, strikes: fought.strikes };
    },

    /** The match's clock: seconds since it began. */
    time,
    /** The world's clock at the moment drawn, `between` of the way through the last step. */
    clock,
    /** The storm at the moment drawn, on the match's clock. */
    storm(between: number): Storm {
      return stormAt(Math.max(0, clock(between) - begun * STEP));
    },
    /** Every ship drawn at the moment `between` of the way through the last step: afloat, or going down. */
    drawn: (between: number): ShipDraw[] => drawnShips(drawing(), between, clock(between)),
    /** Where a ship is drawn at the moment `between` of the way through the last step, or null if she is not. */
    poseOf: (id: number, between: number): ShipPose | null => drawnPose({ aboard, wrecks }, id, between, clock(between)),
    /** A ship's pose after the last step, if she is afloat. */
    after: (id: number): ShipPose | null => aboard.get(id)?.after ?? null,
    /** Every ball in flight at the moment `between` of the way through the last step (world metres), and its way. */
    balls: (between: number): BallDraw[] => battle.balls.map((b) => ({ at: add(b.p, b.v, (between - 1) * STEP), way: b.v, gun: b.kind, to: b.to })),
    /** What the guns did in the last KEPT seconds, oldest first. */
    blasts: (): readonly Blast[] => blasts,
    /** The loot on the water. */
    loot: (): Flotsam => flotsam,
    /** When a piece came onto the water (the world's clock, s), if it did after the match began. */
    born: (id: number): number | undefined => born.get(id),
    /** What happened in about the last second, oldest first (moments.ts). */
    deeds: (): readonly Deed[] => deeds,
    /** Who holds the sea, as drawn at the moment `between` of the way through the last step; none outside a match. */
    sea(between: number): Sea | undefined {
      if (!territory) return undefined;
      const trails = territory.trails().flatMap((t, id) => (t.points.length ? [{ id, serial: t.serial, points: t.points }] : []));
      return { generation, owner: territory.owner, seq: territory.last(), changes: territory.changes(), trails, colours: seaColours(territory.trails().length, match.card) };
    },
    /** A ship's share of the planet's water now, 0…1 (none outside a match). */
    share: (id: number) => territory?.share(id) ?? 0,

    /** The ships on the sea, as the sim has them. */
    vessels: (): readonly Vessel[] => fleet,
    /** A ship's crew: her health and her gun (sim/battle.ts). */
    crew: (id: number) => battle.crews.find((k) => k.id === id)!,
    /** A ship's handling (sim/fit.ts): her own afloat, the tables' once sunk. */
    handling: (id: number): Handling => fleet.find((v) => v.id === id)?.fit ?? SPEC,
    /** Her ship on the sea, or null once sunk. */
    mine: () => fleet.find((v) => v.id === PLAYER) ?? null,
    /** The ids of every ship not sunk. */
    alive: () => battle.crews.filter((c) => !sunk(c.health)).map((c) => c.id),
    /** Every ship sunk so far, in the order they went down (a new entry is a ship just sunk). */
    sinkings: (): readonly Sinking[] => sinkings,
    /** A ship's side (race.ts RaceShip; her id in a card-less match). */
    sideOf: (id: number) => sideIn(match, id),
    /** The race's result (result.ts), once it is over: as it stood the step it ended; else null. */
    result: (): RaceResult | null => ended,
    /** Every ship of the match, afloat or sunk, as she stands now, in order of her id. */
    ships: (): Afloat[] => {
      const afloatNow = new Map(fleet.map((v) => [v.id, v.ship]));
      return battle.crews.map((c) => {
        const s = afloatNow.get(c.id) ?? sinkings.find((k) => k.id === c.id)!;
        return { id: c.id, at: s.at, heading: s.heading, hull: c.health.hull, shield: c.health.shield, armed: armed(c), afloat: !sunk(c.health) };
      });
    },
    /** A new match: its ships (fleetOf), hers the first, the rest bots, every one afloat at her berth (sim/spawn.ts)
     *  with a gun in reach of it (sim/loot.ts berthed). Returns her pose. manned: false puts a bot at her helm too (for
     *  tools/matches.ts, whole matches of bots). */
    start(m: Match, manned = true): ShipPose {
      const count = fleetOf(m), ids = Array.from({ length: count }, (_, i) => i);
      clear(m, ids, MATCH);
      const at = m.berths?.length === count ? m.berths : berths(water, m.seed, count, depth);
      flotsam = berthed(flotsam, at.map((b) => b.at), m.seed, depth);
      at.forEach((b, id) => launch(id, shipAt(b.at, b.heading), lookIn(m.card, id), null, manned));
      territory?.begin(at.map((b) => b.at), tick * STEP);
      // her ship forfeit (race.ts RaceShip; only hers is ever): sunk at second 0, at no one's hand
      const her = aboard.get(PLAYER)!.after;
      if (m.card?.ships[PLAYER]?.forfeit) scuttle(PLAYER, null, 'forfeit');
      return her;
    },
    /** A quiet sea for the lobby: her ship alone at `start`. Returns her pose. */
    anchor(start: { at: Vec3; bearing: number }): ShipPose {
      clear(match, [PLAYER], LOBBY);
      quiet = true;
      launch(PLAYER, shipAt(start.at, bearing(start.at, start.bearing)), LOOK);
      return aboard.get(PLAYER)!.after;
    },
    /** What only the debug switches (src/debug.ts) and the tools ask of the match. */
    debug: {
      /** A match at sea about her: hers at `start`, heading `bearing` (radians), and the others. Returns her pose. */
      atSea(start: { at: Vec3; bearing: number }, others: readonly Berth[]): ShipPose {
        // (card-less: each a side of her own, so every one is hers to shoot)
        clear({ ...match, card: undefined }, [PLAYER, ...others.map((_, i) => i + 1)], MATCH);
        launch(PLAYER, shipAt(start.at, bearing(start.at, start.bearing)), LOOK);
        others.forEach((o, i) => launch(i + 1, { ...shipAt(o.at, o.heading), speed: (o.lashed?.throttle ?? 0) * SHIP.top }, o.look, o.lashed));
        territory?.begin(fleet.map((v) => v.ship.at), tick * STEP);
        return aboard.get(PLAYER)!.after;
      },
      /** Puts goods on the water at `at` (a unit vector), lying still and no ship's, as if long spilt. */
      strew(at: Vec3, goods: readonly Goods[]) {
        const n = flotsam.pieces.length;
        const f = overboard(flotsam, at, goods, -1, match.seed);
        flotsam = { ...f, pieces: f.pieces.map((l, i): typeof l => (i < n ? l : { ...l, way: [0, 0, 0], age: 10 })) };
      },
      /** Sends a ship afloat to the bottom at once, the last blow `by`'s (null: the storm's), spilling what she carries. */
      sink(id: number, by: number | null) {
        if (!aboard.has(id)) return;
        const before = flotsam.next, s = spilled(battle.crews, flotsam, fleet, [id], match.seed);
        for (let n = before; n < s.flotsam.next; n++) born.set(n, tick * STEP);
        [flotsam, battle] = [s.flotsam, { ...battle, crews: s.crews }];
        scuttle(id, by, by === null ? 'storm' : 'shot');
        record({ shots: [], splashes: [], strikes: [], cues: [], sunk: lostNow, took: [], mended: [], blew: [], her: null });
      },
    },
  };
}

export type State = ReturnType<typeof createState>;

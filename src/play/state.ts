// The match afloat: every ship on the sea, the bots that sail them, the fighting, and the ships going
// down, stepped at fixed steps (sim/fixed.ts). What the game reads of it, and what the frame draws of it at a moment
// between two steps, are plain data.
//
// She sails among others as one fleet (sim/contact.ts): hulls that meet shove apart, and a ram knocks the struck ship
// over a little (sim/ride.ts knocked). After the fleet's step comes the fighting's (sim/battle.ts): rams and balls
// take off hit points, the storm (sim/storm.ts, on the match's clock: the steps sailed) wears at ships outside its
// cap, and a ship sunk is taken off the sea and drawn going down (sinking.ts) until she is gone. What the fighting did
// is kept a few seconds as Blasts, for the frame to draw (gunfire/gunfire.ts). The others are bots (sim/bot.ts), each
// seeded by the match and her slot, unless put to sea with her helm lashed, when she holds it and nobody steers her.
// Ships put to sea gunless, unless the match arms them all, and with no shield; loot is strewn over the sea for them
// (sim/loot.ts), and what each carries, her hold and her gust, is stepped round the fleet's step and the fighting's
// (sim/stores.ts): what she asks of them first (the player's from her hands, a bot's from her mind), then her helm as
// they sail her, then her mending, the loot swept up and the sunk's spilled.
//
// A match begun with start() opens with every ship already afloat at her berth (sim/spawn.ts), spread over the whole
// planet, hers the first; the match's clock (the storm's) starts then.

import { battleOf, crewOf, stepBattle, weathered, type Battle, type Order } from '../sim/battle.ts';
import { mind, rammed, shot, think, type Memory, type Seen } from '../sim/bot.ts';
import { afloat, stepFleet, type Vessel } from '../sim/contact.ts';
import { STEP, blendPose } from '../sim/fixed.ts';
import { gunOf } from '../sim/gun.ts';
import { SHIP } from '../sim/handling.ts';
import { sunk } from '../sim/health.ts';
import { PLAYER, SHIPS, credited, type Cause } from '../sim/match.ts';
import { berths, type Berthing } from '../sim/spawn.ts';
import { hopped, knocked, pose, ride, settled, type Ride } from '../sim/ride.ts';
import { berthed, overboard, strewn, type Flotsam, type Goods } from '../sim/loot.ts';
import { asked, crewed, NOTHING, stored, type Ask } from '../sim/stores.ts';
import type { Chart } from '../sim/route.ts';
import { shipAt, type Helm, type ShipState } from '../sim/ship.ts';
import { calm, type Storm } from '../sim/storm.ts';
import type { BallDraw, Blast, Look, ShipDraw } from '../snapshot.ts';
import type { Surface } from '../world/swell.ts';
import type { Planet } from '../world/planet.ts';
import type { ShipPose } from '../world/pose.ts';
import { hash } from '../world/random.ts';
import { add, frameAt, scale, type Vec3 } from '../world/sphere.ts';
import { LOOK, lookOf } from './colours.ts';
import { sinking } from './sinking.ts';

/** How long what the guns did is kept for the frame, seconds: past the last of its smoke (gunfire/gunfire.ts). */
const KEPT = 5;
/** No way on and the rudder amidships. */
const AMIDSHIPS: Helm = { course: null, throttle: 0 };

/** A bearing (radians clockwise from north at a point) as a direction there. */
export const bearing = (at: Vec3, b: number): Vec3 => {
  const f = frameAt(at);
  return add(scale(f.north, Math.cos(b)), f.east, Math.sin(b));
};

/** A ship put to sea about her in a match at sea: where she lies and heads, her colours, and her helm lashed (she holds
 * it from the start, making the way its throttle asks, and nobody steers her), or null for a bot at it. */
export interface Berth { at: Vec3; heading: Vec3; look: Look; lashed: Helm | null }

/** The match: its seed (each bot's mind comes from it and her slot), its storm by the match's clock (s), and the
 * rarity of gun every ship is armed with, or null for none. */
export interface Match { seed: number; storm: (seconds: number) => Storm; gun: number | null }

/** A ship sunk: who she was, who sank her (the ship whose ball or ram dealt the last blow; null for the storm), how,
 * when, on the match's clock (s), and where she went down and the way she headed. */
export interface Sinking { id: number; by: number | null; cause: Cause; time: number; at: Vec3; heading: Vec3 }

/** A ship as the match's flow reads her: who she is (0 the player's), where she is and heads, her hit points, whether
 * she carries a gun, and whether she is still afloat. */
export interface Afloat { id: number; at: Vec3; heading: Vec3; hull: number; shield: number; armed: boolean; afloat: boolean }

/** What is kept of a ship afloat beside her Vessel: her colours, her bot (null: the player's, or a lashed ship's),
 * the helm a lashed ship holds, how she rides the sea, and her last two poses. */
interface Aboard { look: Look; mind: Memory | null; steady: Helm; ride: Ride; before: ShipPose; after: ShipPose }
/** A ship going down: her pose when she sank and the step she sank at, listing to `side`. */
interface Wreck { id: number; look: Look; pose: ShipPose; tick: number; side: number }

/** The planet's water as the match reads it, sounded once (play/sounding.ts): the bots' chart of open water for their
 *  routes (sim/route.ts), and the open water ships are berthed in at a match's start (sim/spawn.ts). */
export interface Waters { chart: Chart; water: Berthing }

/** planet: the world's; sea: its waves, which the ships ride; waters: its water, sounded. */
export function createState(planet: Planet, sea: Surface, { chart, water }: Waters, first: Match) {
  const depth = (p: Vec3) => -planet.height(p);
  let match = first;
  const seedOf = (id: number) => hash(match.seed, id);
  let fleet: Vessel[] = [];
  const aboard = new Map<number, Aboard>();
  let battle: Battle = battleOf([], match.seed);
  let wrecks: Wreck[] = [], blasts: Blast[] = [];
  /** The loot on the water. */
  let flotsam: Flotsam = { pieces: [], next: 0 };
  const sinkings: Sinking[] = [];
  /** Each ship's last blow taken: its striker, and the step it landed on (for the Storm's sinkings, sim/match.ts credited). */
  const struck = new Map<number, { by: number; tick: number }>();
  /** The world's steps (the sea's clock), and the step the match's clock started at. */
  let tick = 0, begun = 0;
  /** Whether the sea is the lobby's, no match running: no storm then, however long she lies there. */
  let quiet = false;

  /** Puts a ship to sea: a bot's unless she is the player's (and `manned`) or her helm is lashed. */
  const launch = (id: number, ship: ShipState, look: Look, lashed: Helm | null = null, manned = true) => {
    fleet.push(afloat(id, ship));
    const r = settled(ship, sea, tick * STEP), p = pose(ship, r);
    const bot = (id !== PLAYER || !manned) && !lashed;
    aboard.set(id, { look, mind: bot ? mind(seedOf(id), ship.at) : null, steady: lashed ?? AMIDSHIPS, ride: r, before: p, after: p });
  };

  /** Clears the sea for a new match, strewing its loot (none on the lobby's sea). */
  const clear = (m: Match, ids: readonly number[], loot = true) => {
    match = m;
    flotsam = loot ? strewn(m.seed, depth) : { pieces: [], next: 0 };
    fleet = [];
    aboard.clear();
    wrecks = [];
    blasts = [];
    sinkings.length = 0;
    struck.clear();
    battle = battleOf(ids.map((id) => crewOf(id, match.gun === null ? null : gunOf(match.gun))), match.seed);
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
    wrecks.push({ id, look: a.look, pose: a.after, tick, side: seedOf(id) & 1 ? 1 : -1 });
    aboard.delete(id);
    fleet = fleet.filter((o) => o.id !== id);
  };

  /** The world's clock at the moment drawn, `between` of the way from the step before last to the last. */
  const clock = (between: number) => (tick - 1 + between) * STEP;

  /** A wreck as drawn at the world's clock `now`, or null once she is gone. */
  const wreckAt = (w: Wreck, now: number) => sinking(w.pose, now - w.tick * STEP, w.side);

  return {
    /** One step: the player's helm, gun and stores, everyone else's from her bot or her lashed helm; then the fleet's
     *  step and the fighting's, and what it did kept to be drawn. */
    advance(helm: Helm, gun: Order, ask: Ask = NOTHING) {
      const crews = new Map(battle.crews.map((c) => [c.id, c]));
      const seen: Seen[] = fleet.map((v) => {
        const c = crews.get(v.id)!;
        return { ...v, hull: c.health.hull, shield: c.health.shield, armed: !!c.gun, crew: c };
      });
      const helms: Helm[] = [], orders: Order[] = [], storm = stormAt(time()), asks = new Map<number, Ask>();
      fleet.forEach((v, i) => {
        const a = aboard.get(v.id)!;
        if (v.id === PLAYER && !a.mind) {
          [helms[i], orders[i]] = [helm, gun];
          asks.set(v.id, ask);
        } else if (!a.mind) [helms[i], orders[i]] = [a.steady, { aim: null, fire: false }];
        else {
          const r = think(seen[i], seen.filter((o) => o.id !== v.id), { depth, chart, storm, loot: flotsam.pieces }, a.mind, seedOf(v.id));
          [a.mind, helms[i], orders[i]] = [r.memory, r.helm, r.order];
          if (r.ask !== NOTHING) asks.set(v.id, r.ask);
        }
      });
      // what each asks of her stores, and her helm as they sail her
      const wants = asked(battle.crews, fleet, flotsam, asks);
      battle = { ...battle, crews: wants.crews };
      const manned = new Map(wants.crews.map((c) => [c.id, c]));
      fleet.forEach((v, i) => { helms[i] = crewed(helms[i], manned.get(v.id)); });
      const met = stepFleet(fleet, helms, STEP, depth);
      fleet = met.fleet;
      for (const b of met.blows) {
        const a = aboard.get(b.struck.id);
        if (a?.mind) a.mind = rammed(a.mind, b.striker.id);
      }
      const fought = stepBattle(battle, fleet, orders, met.blows, STEP, depth);
      // a bot struck by a ball knows who shot her (and fires back, though she holds her fire otherwise)
      for (const s of fought.strikes) {
        struck.set(s.struck, { by: s.shooter, tick });
        const a = aboard.get(s.struck);
        if (a?.mind && !s.ram) a.mind = shot(a.mind, s.shooter);
      }
      const worn = weathered(fought.battle, fleet, storm, STEP);
      const kept = stored(worn.battle.crews, flotsam, fleet, wants.takes, [...fought.sunk, ...worn.sunk], STEP, depth, match.seed);
      battle = { ...worn.battle, crews: kept.crews };
      flotsam = kept.flotsam;
      tick++;
      fleet.forEach((v, i) => {
        const a = aboard.get(v.id)!;
        if (wants.blew.includes(v.id)) a.ride = hopped(a.ride);
        a.ride = ride(knocked(a.ride, v.ship, met.jolts[i]), v.ship, sea, tick * STEP, STEP);
        [a.before, a.after] = [a.after, pose(v.ship, a.ride)];
      });
      // what the fighting did, kept to be drawn from this step on
      const t = tick * STEP;
      blasts = [
        ...blasts.filter((b) => b.time > t - KEPT),
        ...fought.shots.map((s): Blast => ({ kind: 'shot', time: t, from: s.from, dir: s.dir })),
        ...fought.splashes.map((s): Blast => ({ kind: 'splash', time: t, at: s.at, land: s.land })),
        ...fought.strikes.map((s): Blast => ({ kind: 'strike', time: t, at: s.at, ram: s.ram })),
      ];
      // the sunk taken off the sea, to go down; those gone down by the step before last no longer drawn
      for (const id of [...fought.sunk, ...worn.sunk]) {
        const blow = fought.sunk.includes(id) ? fought.strikes.findLast((s) => s.struck === id) : undefined;
        const cause: Cause = blow ? (blow.ram ? 'ram' : 'shot') : 'storm', last = struck.get(id);
        founder(id, credited(cause, last ? { by: last.by, ago: (tick - last.tick) * STEP } : null), cause);
      }
      wrecks = wrecks.filter((w) => wreckAt(w, clock(0)));
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
    drawn(between: number): ShipDraw[] {
      const now = clock(between), still: Vec3 = [0, 0, 0];
      const ships: ShipDraw[] = fleet.map(({ id, ship, shove }) => {
        const a = aboard.get(id)!;
        return { id, pose: blendPose(a.before, a.after, between), look: a.look, velocity: add(scale(ship.heading, ship.speed), shove), afloat: true };
      });
      for (const w of wrecks) {
        const p = wreckAt(w, now);
        if (p) ships.push({ id: w.id, pose: p, look: w.look, velocity: still, afloat: false });
      }
      return ships;
    },
    /** Where a ship is drawn at the moment `between` of the way through the last step, or null if she is not. */
    poseOf(id: number, between: number): ShipPose | null {
      const a = aboard.get(id);
      if (a) return blendPose(a.before, a.after, between);
      const w = wrecks.find((k) => k.id === id);
      return w ? wreckAt(w, clock(between)) : null;
    },
    /** A ship's pose after the last step, if she is afloat. */
    after: (id: number): ShipPose | null => aboard.get(id)?.after ?? null,
    /** Every ball in flight at the moment `between` of the way through the last step (world metres), and its way. */
    balls: (between: number): BallDraw[] => battle.balls.map((b) => ({ at: add(b.p, b.v, (between - 1) * STEP), way: b.v })),
    /** What the guns did in the last KEPT seconds, oldest first. */
    blasts: (): readonly Blast[] => blasts,
    /** The loot on the water. */
    loot: (): Flotsam => flotsam,

    /** The ships on the sea, as the sim has them. */
    vessels: (): readonly Vessel[] => fleet,
    /** A ship's crew: her health and her gun (sim/battle.ts). */
    crew: (id: number) => battle.crews.find((k) => k.id === id)!,
    /** Her ship on the sea, or null once sunk. */
    mine: () => fleet.find((v) => v.id === PLAYER) ?? null,
    /** The ids of every ship not sunk. */
    alive: () => battle.crews.filter((c) => !sunk(c.health)).map((c) => c.id),
    /** Every ship sunk so far, in the order they went down (a new entry is a ship just sunk). */
    sinkings: (): readonly Sinking[] => sinkings,
    /** Every ship of the match, afloat or sunk, as she stands now, in order of her id. */
    ships: (): Afloat[] => {
      const afloatNow = new Map(fleet.map((v) => [v.id, v.ship]));
      return battle.crews.map((c) => {
        const s = afloatNow.get(c.id) ?? sinkings.find((k) => k.id === c.id)!;
        return { id: c.id, at: s.at, heading: s.heading, hull: c.health.hull, shield: c.health.shield, armed: !!c.gun, afloat: !sunk(c.health) };
      });
    },
    /** A match at sea about her: hers at `start`, heading `bearing` (radians), and the others. Returns her pose. */
    begin(start: { at: Vec3; bearing: number }, others: readonly Berth[]): ShipPose {
      clear(match, [PLAYER, ...others.map((_, i) => i + 1)]);
      launch(PLAYER, shipAt(start.at, bearing(start.at, start.bearing)), LOOK);
      others.forEach((o, i) => launch(i + 1, { ...shipAt(o.at, o.heading), speed: (o.lashed?.throttle ?? 0) * SHIP.top }, o.look, o.lashed));
      return aboard.get(PLAYER)!.after;
    },
    /** A new match: SHIPS ships, hers the first, the rest bots, every one afloat at her berth (sim/spawn.ts) with a
     *  gun in reach of it (sim/loot.ts berthed). Returns her pose. manned: false puts a bot at her helm too (for
     *  tools/matches.ts, whole matches of bots). */
    start(m: Match, manned = true): ShipPose {
      const ids = Array.from({ length: SHIPS }, (_, i) => i);
      clear(m, ids);
      const at = berths(water, m.seed, SHIPS, depth);
      flotsam = berthed(flotsam, at.map((b) => b.at), m.seed, depth);
      at.forEach((b, id) => launch(id, shipAt(b.at, b.heading), lookOf(id), null, manned));
      return aboard.get(PLAYER)!.after;
    },
    /** A quiet sea for the lobby: her ship alone at `start`. Returns her pose. */
    anchor(start: { at: Vec3; bearing: number }): ShipPose {
      clear(match, [PLAYER], false);
      quiet = true;
      launch(PLAYER, shipAt(start.at, bearing(start.at, start.bearing)), LOOK);
      return aboard.get(PLAYER)!.after;
    },
    /** Puts goods on the water at `at` (a unit vector), lying still and no ship's, as if long spilt. */
    strew(at: Vec3, goods: readonly Goods[]) {
      const n = flotsam.pieces.length;
      const f = overboard(flotsam, at, goods, -1, match.seed);
      flotsam = { ...f, pieces: f.pieces.map((l, i): typeof l => (i < n ? l : { ...l, way: [0, 0, 0], age: 10 })) };
    },
    /** Sends a ship afloat to the bottom at once, the last blow `by`'s (null: the storm's). */
    sink(id: number, by: number | null) {
      if (!aboard.has(id)) return;
      battle = { ...battle, crews: battle.crews.map((c) => (c.id === id ? { ...c, health: { ...c.health, hull: 0, shield: 0 } } : c)) };
      founder(id, by, by === null ? 'storm' : 'shot');
    },
  };
}

export type State = ReturnType<typeof createState>;

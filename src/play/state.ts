// The match afloat: every ship on the sea or in the Gale, the bots that sail them, the fighting, and the ships going
// down, stepped at fixed steps (sim/fixed.ts). What the game reads of it, and what the frame draws of it at a moment
// between two steps, are plain data.
//
// She sails among others as one fleet (sim/contact.ts): hulls that meet shove apart, and a ram knocks the struck ship
// over a little (sim/ride.ts knocked). After the fleet's step comes the fighting's (sim/battle.ts): rams and balls
// take off hit points, the storm (sim/storm.ts, on the match's clock: the steps sailed) wears at ships outside its
// cap, and a ship sunk is taken off the sea and drawn going down (sinking.ts) until she is gone. What the fighting did
// is kept a few seconds as Blasts, for the frame to draw (gunfire/gunfire.ts). The others are bots (sim/bot.ts), each
// seeded by the match and her slot, unless put to sea with her helm lashed, when she holds it and nobody steers her.
// Ships put to sea gunless, unless the match arms them all.
//
// A match begun with drop() opens with the Gale (sim/drop.ts): the whole fleet carried high over the planet; she
// leaves it by dive(), the bots when they choose, and each glides down and puts to sea where she touches the water.
// The match's clock (the storm's) starts once the last ship is down.

import { battleOf, crewOf, stepBattle, weathered, type Battle, type Order } from '../sim/battle';
import { mind, rammed, shot, think, type Memory, type Seen } from '../sim/bot';
import { afloat, stepFleet, type Vessel } from '../sim/contact';
import { GALE, HOLD, botLeaps, course, markLeap, startDrop, stepDrop, type Drop, type Leap } from '../sim/drop';
import { STEP, blendPose } from '../sim/fixed';
import { gunOf } from '../sim/gun';
import { SHIP } from '../sim/handling';
import { sunk } from '../sim/health';
import { PLAYER, SHIPS } from '../sim/match';
import { knocked, pose, ride, settled, type Ride } from '../sim/ride';
import type { Chart } from '../sim/route';
import { shipAt, type Helm, type ShipState } from '../sim/ship';
import { calm, type Cap, type Storm } from '../sim/storm';
import type { Blast, Look, ShipDraw } from '../snapshot';
import type { Surface } from '../world/swell';
import type { Planet } from '../world/planet';
import type { ShipPose } from '../world/pose';
import { hash } from '../world/random';
import { add, frameAt, scale, type Vec3 } from '../world/sphere';
import { LOOK, lookOf } from './colours';
import { flown } from './shots';
import { sinking } from './sinking';

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
export interface Sinking { id: number; by: number | null; cause: 'shot' | 'ram' | 'storm'; time: number; at: Vec3; heading: Vec3 }

/** A ship as the match's flow reads her: who she is (0 the player's), where she is and heads, her hit points, whether
 * she carries a gun, and whether she is still afloat (in the drop or on the sea). */
export interface Afloat { id: number; at: Vec3; heading: Vec3; hull: number; shield: number; armed: boolean; afloat: boolean }

/** The drop as its screen reads it (ui/gale.ts), but for where her mark stands on the screen: seconds the Gale has
 * left to carry her; whether she may leave it yet and whether she has; the Gale's course, the fleet still in the air
 * and the cap the storm first closes to, for the disc; her mark. */
export interface Dropping {
  left: number; ready: boolean; gone: boolean;
  course: readonly Vec3[]; fleet: readonly Vec3[]; first: Cap; mark: Vec3 | null;
}

/** What is kept of a ship afloat beside her Vessel: her colours, her bot (null: the player's, or a lashed ship's),
 * the helm a lashed ship holds, how she rides the sea, and her last two poses. */
interface Aboard { look: Look; mind: Memory | null; steady: Helm; ride: Ride; before: ShipPose; after: ShipPose }
/** A ship going down: her pose when she sank and the step she sank at, listing to `side`. */
interface Wreck { id: number; look: Look; pose: ShipPose; tick: number; side: number }

/** planet: the world's; sea: its waves, which the ships ride; chart: the bots' chart of open water (sim/route.ts). */
export function createState(planet: Planet, sea: Surface, chart: Chart, first: Match) {
  const depth = (p: Vec3) => -planet.height(p);
  /** The islands' middles: where the bots mean to come down in a drop. */
  const sites = planet.islands.map((i) => i.chart.at);
  let match = first;
  const seedOf = (id: number) => hash(match.seed, id);
  let fleet: Vessel[] = [];
  const aboard = new Map<number, Aboard>();
  let battle: Battle = battleOf([], match.seed);
  let wrecks: Wreck[] = [], blasts: Blast[] = [];
  const sinkings: Sinking[] = [];
  /** The world's steps (the sea's clock), and the step the match's clock started at (null: in the drop). */
  let tick = 0, begun: number | null = 0;
  /** Whether the sea is the lobby's, no match running: no storm then, however long she lies there. */
  let quiet = false;
  /** The drop while a ship is still in it, whether she has pressed DIVE, her mark, the Gale's course; each flying
   *  ship's last two poses. */
  let drop: Drop | null = null, dived = false, mark: Vec3 | null = null, lane: Vec3[] = [];
  const flying = new Map<number, { before: ShipPose; after: ShipPose }>();

  /** Puts a ship to sea: a bot's unless she is the player's or her helm is lashed. */
  const launch = (id: number, ship: ShipState, look: Look, lashed: Helm | null = null) => {
    fleet.push(afloat(id, ship));
    const r = settled(ship, sea, tick * STEP), p = pose(ship, r);
    const bot = id !== PLAYER && !lashed;
    aboard.set(id, { look, mind: bot ? mind(seedOf(id), ship.at) : null, steady: lashed ?? AMIDSHIPS, ride: r, before: p, after: p });
  };

  /** Clears the sea and the drop for a new match. */
  const clear = (m: Match, ids: readonly number[]) => {
    match = m;
    fleet = [];
    aboard.clear();
    flying.clear();
    wrecks = [];
    blasts = [];
    sinkings.length = 0;
    battle = battleOf(ids.map((id) => crewOf(id, match.gun === null ? null : gunOf(match.gun))), match.seed);
    drop = null;
    dived = false;
    mark = null;
    begun = tick;
    quiet = false;
  };

  /** The match's clock: seconds since the last ship came down (0 till then). */
  const time = () => (begun === null ? 0 : (tick - begun) * STEP);
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

  const herFlyer = () => drop?.flyers.find((f) => f.id === PLAYER) ?? null;

  /** The world's clock at the moment drawn, `between` of the way from the step before last to the last. */
  const clock = (between: number) => (tick - 1 + between) * STEP;

  /** A wreck as drawn at the world's clock `now`, or null once she is gone. */
  const wreckAt = (w: Wreck, now: number) => sinking(w.pose, now - w.tick * STEP, w.side);

  return {
    /** One step: the drop's, then the player's helm and gun, everyone else's from her bot or her lashed helm; then the
     *  fleet's step and the fighting's, and what it did kept to be drawn. */
    advance(helm: Helm, gun: Order, leap: Leap) {
      if (drop) {
        const bots = botLeaps(drop);
        bots.leaps.set(PLAYER, leap);
        const r = stepDrop(bots.drop, bots.leaps, STEP, depth, fleet.map((v) => v.ship.at));
        for (const f of r.landed) {
          launch(f.id, { ...shipAt(f.at, f.heading), speed: f.speed }, lookOf(f.id));
          flying.delete(f.id);
        }
        drop = r.drop.flyers.length ? r.drop : null;
        for (const f of drop?.flyers ?? []) {
          const was = flying.get(f.id), p = flown(f);
          flying.set(f.id, { before: was?.after ?? p, after: p });
        }
        if (!drop) begun = tick;
      }
      const crews = new Map(battle.crews.map((c) => [c.id, c]));
      const seen: Seen[] = fleet.map((v) => {
        const c = crews.get(v.id)!;
        return { ...v, hull: c.health.hull, shield: c.health.shield, armed: !!c.gun };
      });
      const helms: Helm[] = [], orders: Order[] = [], storm = stormAt(time());
      fleet.forEach((v, i) => {
        const a = aboard.get(v.id)!;
        if (v.id === PLAYER) [helms[i], orders[i]] = [helm, gun];
        else if (!a.mind) [helms[i], orders[i]] = [a.steady, { aim: null, fire: false }];
        else {
          const r = think(seen[i], seen.filter((o) => o.id !== v.id), { depth, chart, storm }, a.mind, seedOf(v.id));
          [a.mind, helms[i], orders[i]] = [r.memory, r.helm, r.order];
        }
      });
      const met = stepFleet(fleet, helms, STEP, depth);
      fleet = met.fleet;
      for (const b of met.blows) {
        const a = aboard.get(b.struck.id);
        if (a?.mind) a.mind = rammed(a.mind, b.striker.id);
      }
      const fought = stepBattle(battle, fleet, orders, met.blows, STEP, depth);
      // a bot struck by a ball knows who shot her (and fires back, though she holds her fire otherwise)
      for (const s of fought.strikes) {
        const a = aboard.get(s.struck);
        if (a?.mind && !s.ram) a.mind = shot(a.mind, s.shooter);
      }
      const worn = weathered(fought.battle, fleet, storm, STEP);
      battle = worn.battle;
      tick++;
      fleet.forEach((v, i) => {
        const a = aboard.get(v.id)!;
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
        founder(id, blow?.shooter ?? null, blow ? (blow.ram ? 'ram' : 'shot') : 'storm');
      }
      wrecks = wrecks.filter((w) => wreckAt(w, clock(0)));
    },

    /** The match's clock: seconds since the drop ended (0 through it). */
    time,
    /** The world's clock at the moment drawn, `between` of the way through the last step. */
    clock,
    /** The storm at the moment drawn: on the match's clock, which stands at 0 through the drop. */
    storm(between: number): Storm {
      return stormAt(begun === null ? 0 : Math.max(0, clock(between) - begun * STEP));
    },
    /** Every ship drawn at the moment `between` of the way through the last step: afloat, in the drop, or going down. */
    drawn(between: number): ShipDraw[] {
      const now = clock(between), still: Vec3 = [0, 0, 0];
      const ships: ShipDraw[] = fleet.map(({ id, ship, shove }) => {
        const a = aboard.get(id)!;
        return { id, pose: blendPose(a.before, a.after, between), look: a.look, velocity: add(scale(ship.heading, ship.speed), shove), afloat: true };
      });
      for (const [id, f] of flying) ships.push({ id, pose: blendPose(f.before, f.after, between), look: lookOf(id), velocity: still, afloat: false });
      for (const w of wrecks) {
        const p = wreckAt(w, now);
        if (p) ships.push({ id: w.id, pose: p, look: w.look, velocity: still, afloat: false });
      }
      return ships;
    },
    /** Where a ship is drawn at the moment `between` of the way through the last step, or null if she is not. */
    poseOf(id: number, between: number): ShipPose | null {
      const a = aboard.get(id), f = flying.get(id);
      if (a) return blendPose(a.before, a.after, between);
      if (f) return blendPose(f.before, f.after, between);
      const w = wrecks.find((k) => k.id === id);
      return w ? wreckAt(w, clock(between)) : null;
    },
    /** A ship's pose after the last step, if she is afloat. */
    after: (id: number): ShipPose | null => aboard.get(id)?.after ?? null,
    /** Every ball in flight at the moment `between` of the way through the last step (world metres). */
    balls: (between: number): Vec3[] => battle.balls.map((b) => add(b.p, b.v, (between - 1) * STEP)),
    /** What the guns did in the last KEPT seconds, oldest first. */
    blasts: (): readonly Blast[] => blasts,

    /** The ships on the sea, as the sim has them. */
    vessels: (): readonly Vessel[] => fleet,
    /** A ship's crew: her health and her gun (sim/battle.ts). */
    crew: (id: number) => battle.crews.find((k) => k.id === id)!,
    /** Her ship on the sea, or null (in the drop, or sunk). */
    mine: () => fleet.find((v) => v.id === PLAYER) ?? null,
    herFlyer,
    /** The drop while a ship is still in it, or null. */
    gale: (): Drop | null => drop,
    /** The ids of every ship not sunk. */
    alive: () => battle.crews.filter((c) => !sunk(c.health)).map((c) => c.id),
    /** Every ship sunk so far, in the order they went down (a new entry is a ship just sunk). */
    sinkings: (): readonly Sinking[] => sinkings,
    /** Every ship of the match, afloat, in the drop or sunk, as she stands now, in order of her id. */
    ships: (): Afloat[] => {
      const afloatNow = new Map(fleet.map((v) => [v.id, v.ship])), up = new Map((drop?.flyers ?? []).map((f) => [f.id, f]));
      return battle.crews.map((c) => {
        const s = afloatNow.get(c.id) ?? up.get(c.id) ?? sinkings.find((k) => k.id === c.id)!;
        return { id: c.id, at: s.at, heading: s.heading, hull: c.health.hull, shield: c.health.shield, armed: !!c.gun, afloat: !sunk(c.health) };
      });
    },
    /** Whether she is down on the sea (or sunk), out of the drop. */
    landed: () => !herFlyer() && !flying.has(PLAYER),
    /** What the drop's screen shows, or null once she is down. */
    dropping(): Dropping | null {
      const f = herFlyer();
      if (!drop || !f) return null;
      return {
        left: Math.max(0, GALE.time - drop.t), ready: drop.t >= GALE.allowed, gone: f.stage !== 'gale',
        course: lane, fleet: drop.flyers.map((o) => o.at), first: match.storm(0).next, mark,
      };
    },
    /** Her orders in the drop: leave the Gale once DIVE is pressed; gliding, `course` if the hands give one, or else
     *  her mark's. */
    leap(course: Vec3 | null): Leap {
      const f = herFlyer();
      if (!f) return HOLD;
      if (f.stage === 'gale') return { ...HOLD, leave: dived };
      if (course) return { ...HOLD, course };
      return mark ? markLeap(f, mark) : HOLD;
    },

    /** A match at sea, with no drop: hers at `start`, heading `bearing` (radians), and the others. Returns her pose. */
    begin(start: { at: Vec3; bearing: number }, others: readonly Berth[]): ShipPose {
      clear(match, [PLAYER, ...others.map((_, i) => i + 1)]);
      launch(PLAYER, shipAt(start.at, bearing(start.at, start.bearing)), LOOK);
      others.forEach((o, i) => launch(i + 1, { ...shipAt(o.at, o.heading), speed: (o.lashed?.throttle ?? 0) * SHIP.top }, o.look, o.lashed));
      return aboard.get(PLAYER)!.after;
    },
    /** A new match opening with the Gale: SHIPS ships, hers the first, the rest bots, every one in the air. Returns
     *  her pose. */
    drop(m: Match): ShipPose {
      const ids = Array.from({ length: SHIPS }, (_, i) => i);
      clear(m, ids);
      begun = null;
      drop = startDrop(m.seed, ids, ids.slice(1), sites, m.storm(0).next, depth);
      lane = course(drop.gale);
      for (const f of drop.flyers) flying.set(f.id, { before: flown(f), after: flown(f) });
      return flown(drop.flyers[0]);
    },
    /** A quiet sea for the lobby: her ship alone at `start`. Returns her pose. */
    anchor(start: { at: Vec3; bearing: number }): ShipPose {
      clear(match, [PLAYER]);
      quiet = true;
      launch(PLAYER, shipAt(start.at, bearing(start.at, start.bearing)), LOOK);
      return aboard.get(PLAYER)!.after;
    },
    /** She leaves the Gale (DIVE), as soon as it allows. */
    dive() { dived = true; },
    /** Marks where she means to come down (a unit vector), or clears it. */
    mark(p: Vec3 | null) { mark = p; },
    /** Sends a ship afloat to the bottom at once, the last blow `by`'s (null: the storm's). */
    sink(id: number, by: number | null) {
      if (!aboard.has(id)) return;
      battle = { ...battle, crews: battle.crews.map((c) => (c.id === id ? { ...c, health: { ...c.health, hull: 0, shield: 0 } } : c)) };
      founder(id, by, by === null ? 'storm' : 'shot');
    },
  };
}

export type State = ReturnType<typeof createState>;

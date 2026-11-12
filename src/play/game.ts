// The game view: the player's ship on the sea, sailed by the stick, watched by the chase camera, among the others
// she fights.
//
// Each frame: the hands are read and turned into the helm's and the gun's orders, the simulation takes as many fixed
// steps as the frame has time for (sim/fixed.ts), the ships are drawn blended between the last two, and the world's
// clock (the sea's) is set to the moment drawn, so the hulls and the waves under them are the same instant.
//
// The stick steers by the screen: pushed toward a direction on the screen, she heads that way across the sea as the
// camera looks at it, as fast as it is pushed. Let go, she coasts. Her gun is aimed where the camera looks along the
// sea (the gun's assist lays it on a ship near that bearing: sim/gun.ts), and fired by fire() (the HUD's button) or,
// for now, Space.
//
// She sails among others as one fleet (sim/contact.ts): hulls that meet shove apart, and a ram knocks the struck ship
// over a little (sim/ride.ts knocked). After the fleet's step comes the fighting's (sim/battle.ts): rams and balls
// take off hit points, the storm (sim/storm.ts, on the match's clock: the steps sailed) wears at ships outside its
// cap, and a ship sunk is taken off the sea and drawn going down (sinking.ts) until she is gone. What the fighting did
// is drawn as it happens (gunfire/gunfire.ts). The others are bots (sim/bot.ts), each seeded by the match and her
// slot, unless main.ts sets them a way to make (?way=), when they hold a straight course as scripted ships for
// captures. Ships put to sea gunless, unless ?gun= arms them all (debug.ts).
//
// A match begun with drop() opens with the Gale (sim/drop.ts): the whole fleet carried high over the planet, the
// camera riding behind and above its middle; she leaves it by dive(), the bots when they choose, and each glides down,
// steered by the stick (or for her mark), and puts to sea where she touches the water. The match's clock (the
// storm's) starts once the last ship is down.
//
// The camera follows the ship the match's flow sets (view): hers, or after she sinks the one she watches, cut to or
// flown to; its shots on the Gale, coming down and on a win are shots.ts's.
//
// Debug: a drive, `legs` as "bearing,throttle,seconds;…" (bearings in degrees clockwise from north where she is),
// is sailed before the first frame; she holds its last order until a hand takes the helm.

import type { Environment } from '../environment';
import type { createFrame } from '../frame';
import type { Look } from '../ship/fleet';
import { battleOf, crewOf, stepBattle, weathered, type Battle, type Order } from '../sim/battle';
import { mind, rammed, think, type Memory, type Seen } from '../sim/bot';
import { afloat, stepFleet, type Vessel } from '../sim/contact';
import { GALE, HOLD, botLeaps, course, markLeap, startDrop, stepDrop, type Drop, type Leap } from '../sim/drop';
import { STEP, blendPose, fixedClock } from '../sim/fixed';
import { chosen, gunOf, lead, muzzle } from '../sim/gun';
import { GUN, HEALTH, SHIP } from '../sim/handling';
import { sunk } from '../sim/health';
import { knocked, pose, ride, settled, type Ride } from '../sim/ride';
import { chart as bakeChart } from '../sim/route';
import { shipAt, type Helm, type ShipState } from '../sim/ship';
import type { Cap, Storm } from '../sim/storm';
import { createSwell } from '../water/swell';
import type { ShipPose } from '../world/pose';
import { hash } from '../world/random';
import { R, add, frameAt, normalize, scale, type Vec3 } from '../world/sphere';
import { createChase } from './chase';
import { LOOK, lookOf } from './colours';
import { createInput, type Hands } from './input';
import { createShots, flown } from './shots';
import { sinking } from './sinking';
import { createStickView } from './stick';

/** How little of the stick's push counts as none. */
const DEAD = 0.15;
/** The player's ship's id (and her slot in the drawn fleet, as every ship's id is hers). */
const PLAYER = 0;
/** The ships in a match with a drop: the player's and the bots' (0117 MATCH.ships). */
export const SHIPS = 20;

type Frame = ReturnType<typeof createFrame>;

/** A bearing (radians clockwise from north at a point) as a direction there. */
const bearing = (at: Vec3, b: number): Vec3 => {
  const f = frameAt(at);
  return add(scale(f.north, Math.cos(b)), f.east, Math.sin(b));
};

/** SCAFFOLDING (main.ts ?ships=, until ships are placed for real): a ship on the sea in her own colours, sailed by a
 * bot; or, given a `way` (m/s), on a straight course at that speed, her rudder amidships. */
export interface Other { at: Vec3; heading: Vec3; look: Look; way: number }

/** The match as the HUD reads it (ui/hud.ts HudState): a plain snapshot, made fresh each time it is asked for. */
export interface Status {
  /** Where she is (unit sphere) and the way she heads (unit tangent). */
  at: Vec3; heading: Vec3;
  /** Her hit points, and their most. */
  hull: number; hullMax: number; shield: number; shieldMax: number;
  /** Her gun: its rarity (0–4, sim/handling.ts GUN.rarities), how far loaded (0…1, 1 ready), and whether its assist
   * has a ship to lay on where she is aimed (sim/gun.ts); null with none. */
  gun: { rarity: number; ready: number; locked: boolean } | null;
  /** Ships still afloat (in the drop or on the sea), hers among them; whether hers is sunk. */
  afloat: number; sunk: boolean;
  /** Seconds till the storm next holds or closes (0 once it has closed for good), and its calm (radius in metres). */
  storm: number; eye: { centre: Vec3; radius: number };
}

/** The drop as its screen reads it (ui/gale.ts): seconds the Gale has left to carry her; whether she may leave it yet
 * and whether she has; the Gale's course, the fleet still in the air and the cap the storm first closes to, for the
 * disc; her mark, and where it stands on the screen (CSS px) if in sight. */
export interface DropView {
  left: number; ready: boolean; gone: boolean;
  course: readonly Vec3[]; fleet: readonly Vec3[]; first: Cap;
  mark: Vec3 | null; pennant: { x: number; y: number } | null;
}

/** The match: its seed (each bot's mind comes from it and her slot), its storm by the match's clock (s), and the
 * rarity of gun every ship is armed with (?gun=), or null for none. */
export interface Match { seed: number; storm: (seconds: number) => Storm; gun: number | null }

/** A ship sunk: who she was, who sank her (the ship whose ball or ram dealt the last blow; null for the storm), how,
 * when, on the match's clock (s), and where she went down and the way she headed. */
export interface Sinking { id: number; by: number | null; cause: 'shot' | 'ram' | 'storm'; time: number; at: Vec3; heading: Vec3 }

/** A ship as the match's flow reads her: who she is (0 the player's), where she is and heads, her hit points, whether
 * she carries a gun, and whether she is still afloat (in the drop or on the sea). */
export interface Afloat { id: number; at: Vec3; heading: Vec3; hull: number; shield: number; armed: boolean; afloat: boolean }

/** What the camera does, as the match's flow sets it (sim/match.ts): the ship it follows, and whether it cut or flew
 * to her; whether the hands steer and look; whether it circles her (the win). */
export interface View { watch: number; move: 'cut' | 'fly'; hands: boolean; circle: boolean }

/** What the game keeps of a ship afloat beside her Vessel: her colours, her bot (null: the player's, or a scripted
 * ship's), the orders a scripted ship holds, how she rides the sea, and her last two poses. */
interface Aboard { look: Look; mind: Memory | null; steady: Helm; ride: Ride; before: ShipPose; after: ShipPose }
/** A ship going down: her pose when she sank and the step she sank at, listing to `side`. */
interface Wreck { id: number; look: Look; pose: ShipPose; tick: number; side: number }

const idleLook = { x: 0, y: 0, held: false };

/** start: where she lies and the bearing she heads (radians); legs: a debug drive, or ''; others: the others afloat;
 *  sites: the islands' middles (where the bots mean to come down in a drop). */
export function createGame(
  frame: Frame, env: Environment, element: HTMLElement, start: { at: Vec3; bearing: number }, legs: string, others: readonly Other[], first: Match,
  sites: readonly Vec3[] = [],
) {
  const ground = frame.planet.height;
  const depth = (p: Vec3) => -ground(p);
  const sea = createSwell(frame.anchors, ground, env.seaWind);
  const input = createInput(element);
  const drawStick = createStickView();
  const chase = createChase(frame.camera, ground, sea);
  const clock = fixedClock();
  // the bots' chart of open water, for routes round land (sim/route.ts): baked here while the ground's worker bakes
  // (frame.ready), in about a fifth of its time, so it holds back no frame
  const charted = performance.now(), chart = bakeChart(depth);
  console.info(`chart baked in ${(performance.now() - charted).toFixed(0)} ms`);

  // (always drawn whole: the chase camera holds her at the finest level's edge)
  frame.fleet.own(PLAYER);
  let match = first;
  const seedOf = (id: number) => hash(match.seed, id);
  let fleet: Vessel[] = [];
  const aboard = new Map<number, Aboard>();
  let battle: Battle = battleOf([], match.seed);
  const wrecks: Wreck[] = [], sinkings: Sinking[] = [];
  /** The world's steps (the sea's clock), and the step the match's clock started at (null: in the drop). */
  let tick = 0, begun: number | null = 0, pulled = false;
  /** The drop while a ship is still in it, whether she has pressed DIVE, her mark, the Gale's course; each flying
   *  ship's last two poses. */
  let drop: Drop | null = null, dived = false, mark: Vec3 | null = null, lane: Vec3[] = [];
  const flying = new Map<number, { before: ShipPose; after: ShipPose }>();
  /** The camera: what the flow sets, and its shots. */
  let view: View = { watch: PLAYER, move: 'cut', hands: true, circle: false };
  const shots = createShots();
  let last: ShipPose = flown({ id: PLAYER, seat: 0, stage: 'sea', at: start.at, heading: bearing(start.at, start.bearing), height: 0, speed: 0, climb: 0 });

  /** Puts a ship to sea: a bot unless she is the player's or holds a straight course (`way`). */
  const launch = (id: number, ship: ShipState, look: Look, bot: boolean, way = 0) => {
    fleet.push(afloat(id, ship));
    const r = settled(ship, sea, tick * STEP), p = pose(ship, r);
    aboard.set(id, { look, mind: bot ? mind(seedOf(id), ship.at) : null, steady: { course: null, throttle: way / SHIP.top }, ride: r, before: p, after: p });
  };

  /** Clears the sea and the drop for a new match. */
  const clear = (m: Match, ids: readonly number[]) => {
    for (const id of new Set([...aboard.keys(), ...wrecks.map((w) => w.id), ...flying.keys()])) frame.fleet.drop(id);
    match = m;
    fleet = [];
    aboard.clear();
    flying.clear();
    wrecks.length = sinkings.length = 0;
    battle = battleOf(ids.map((id) => crewOf(id, match.gun === null ? null : gunOf(match.gun))), match.seed);
    drop = null;
    dived = false;
    mark = null;
    begun = tick;
    view = { watch: PLAYER, move: 'cut', hands: true, circle: false };
    shots.reset();
  };

  /** The match's clock: seconds since the last ship came down (0 till then). */
  const time = () => (begun === null ? 0 : (tick - begun) * STEP);

  /** A ship sinks now, at the hand of `by` (null: the storm). */
  const founder = (id: number, by: number | null, cause: Sinking['cause']) => {
    const a = aboard.get(id), v = fleet.find((o) => o.id === id);
    if (!a || !v) return;
    sinkings.push({ id, by, cause, time: time(), at: v.ship.at, heading: v.ship.heading });
    wrecks.push({ id, look: a.look, pose: a.after, tick, side: seedOf(id) & 1 ? 1 : -1 });
    aboard.delete(id);
    fleet = fleet.filter((o) => o.id !== id);
  };

  /** One step: the drop's, then the player's helm and gun, everyone else's from her bot or her script; then the
   * fleet's step and the fighting's, and what it did set to be drawn. */
  const advance = (helm: Helm, gun: Order, leap: Leap) => {
    if (drop) {
      const bots = botLeaps(drop);
      bots.leaps.set(PLAYER, leap);
      const r = stepDrop(bots.drop, bots.leaps, STEP, depth, fleet.map((v) => v.ship.at));
      for (const f of r.landed) {
        launch(f.id, { ...shipAt(f.at, f.heading), speed: f.speed }, lookOf(f.id), f.id !== PLAYER);
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
    const helms: Helm[] = [], orders: Order[] = [];
    fleet.forEach((v, i) => {
      const a = aboard.get(v.id)!;
      if (v.id === PLAYER) [helms[i], orders[i]] = [helm, gun];
      else if (!a.mind) [helms[i], orders[i]] = [a.steady, { aim: null, fire: false }];
      else {
        const r = think(seen[i], seen.filter((o) => o.id !== v.id), depth, a.mind, seedOf(v.id), STEP, chart);
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
    const worn = weathered(fought.battle, fleet, match.storm(time()), STEP);
    battle = worn.battle;
    tick++;
    fleet.forEach((v, i) => {
      const a = aboard.get(v.id)!;
      a.ride = ride(knocked(a.ride, v.ship, met.jolts[i]), v.ship, sea, tick * STEP, STEP);
      [a.before, a.after] = [a.after, pose(v.ship, a.ride)];
    });
    // what the fighting did, drawn from this step on
    const t = tick * STEP;
    for (const s of fought.shots) frame.gunfire.shot(t, s.from, s.dir);
    for (const s of fought.splashes) frame.gunfire.splash(t, s.at, s.land);
    for (const s of fought.strikes) frame.gunfire.strike(t, s.at, s.ram);
    // the sunk taken off the sea, to go down
    for (const id of [...fought.sunk, ...worn.sunk]) {
      const blow = fought.sunk.includes(id) ? fought.strikes.findLast((s) => s.struck === id) : undefined;
      founder(id, blow?.shooter ?? null, blow ? (blow.ram ? 'ram' : 'shot') : 'storm');
    }
  };

  const mine = () => fleet.find((v) => v.id === PLAYER) ?? null;
  const herFlyer = () => drop?.flyers.find((f) => f.id === PLAYER) ?? null;

  // the ships she starts among, and the drive, sailed now
  clear(first, [PLAYER, ...others.map((_, i) => i + 1)]);
  launch(PLAYER, shipAt(start.at, bearing(start.at, start.bearing)), LOOK, false);
  others.forEach((o, i) => launch(i + 1, { ...shipAt(o.at, o.heading), speed: o.way }, o.look, o.way <= 0, o.way));
  let held: ((s: ShipState) => Helm) | null = null;
  const still: Order = { aim: null, fire: false };
  for (const leg of legs.split(';').filter(Boolean)) {
    const [b, throttle, seconds] = leg.split(',').map(Number);
    held = (s) => ({ course: bearing(s.at, (b * Math.PI) / 180), throttle });
    for (let i = 0; i < Math.round(seconds / STEP) && mine(); i++) advance(held(mine()!.ship), still, HOLD);
  }
  last = aboard.get(PLAYER)?.after ?? last;
  chase.reset(last, tick * STEP);

  /** The hands' orders: the stick's push as a heading across the sea as the camera sees it. */
  const orders = (stick: Hands['stick']): Helm => {
    const push = stick ? Math.hypot(stick.x, stick.y) : 0;
    if (!stick || push < DEAD) return { course: null, throttle: 0 };
    const { ahead, right } = chase.axes();
    return { course: add(scale(ahead, stick.y), right, stick.x), throttle: Math.min(1, (push - DEAD) / (1 - DEAD)) };
  };

  /** Her orders in the drop: leave the Gale once DIVE is pressed; gliding, the stick's course, or else her mark's. */
  const leapOf = (stick: Hands['stick']): Leap => {
    const f = herFlyer();
    if (!f) return HOLD;
    if (f.stage === 'gale') return { ...HOLD, leave: dived };
    const helm = orders(stick);
    if (helm.course) return { ...HOLD, course: helm.course };
    return mark ? markLeap(f, mark) : HOLD;
  };

  /** The storm as drawn: on the match's clock, at the moment drawn. */
  let drawn = 0, eye = { centre: [0, 0, 1] as Vec3, radius: -1 };
  const storm = () => match.storm(drawn);

  /** Whether her gun's assist, aimed where the camera looks, has a ship it can lay on. */
  const locked = (v: Vessel, rarity: number) => {
    const from = muzzle(v), mark = chosen(from, chase.axes().ahead, GUN.assist[rarity], fleet.filter((o) => o.id !== v.id));
    return !!mark && lead(from, mark) !== null;
  };

  /** The ships not sunk: those in the drop and those on the sea. */
  const alive = () => battle.crews.filter((c) => !sunk(c.health)).map((c) => c.id);

  /** What the HUD reads of the match. (Its calm is a new object only when it has moved or changed by a metre.) */
  const status = (): Status => {
    const c = battle.crews.find((k) => k.id === PLAYER)!, v = mine(), f = herFlyer(), s = storm();
    const radius = Math.round(s.radius * R);
    if (radius !== eye.radius || s.centre.some((x, i) => Math.abs(x - eye.centre[i]) * R > 1)) eye = { centre: s.centre, radius };
    const full = c.gun ? GUN.reload * GUN.reloadBy[c.gun.rarity] : 1;
    return {
      at: v?.ship.at ?? f?.at ?? normalize(last.position), heading: v?.ship.heading ?? f?.heading ?? last.forward,
      hull: c.health.hull, hullMax: HEALTH.hull, shield: c.health.shield, shieldMax: HEALTH.shield,
      gun: c.gun ? { rarity: c.gun.rarity, ready: 1 - c.gun.loading / full, locked: !!v && locked(v, c.gun.rarity) } : null,
      afloat: alive().length, sunk: sunk(c.health),
      storm: Number.isFinite(s.secondsToNext) ? s.secondsToNext : 0, eye,
    };
  };

  /** Where a ship is drawn now (`between` of the way through the last step): afloat, in the drop, or going down. */
  const poseOf = (id: number, between: number): ShipPose | null => {
    const a = aboard.get(id), f = flying.get(id);
    if (a) return blendPose(a.before, a.after, between);
    if (f) return blendPose(f.before, f.after, between);
    const w = wrecks.find((k) => k.id === id);
    return w ? sinking(w.pose, (tick - 1 + between) * STEP - w.tick * STEP, w.side) ?? w.pose : null;
  };

  /** The camera's shot of the ship it follows (shots.ts). */
  const shoot = (pose: ShipPose, dt: number) => shots.take({ pose, drop, flyer: view.watch === PLAYER ? herFlyer() : null, circle: view.circle, ships: SHIPS }, dt);

  return Object.assign((dt: number) => {
    const read = input.read(), hands = view.hands ? read : { stick: null, look: idleLook, fire: false };
    drawStick(hands.stick);
    if (hands.stick || hands.look.held) held = null;
    const { steps, between } = clock(dt);
    for (let i = 0; i < steps; i++) {
      const v = mine();
      const helm = !v ? { course: null, throttle: 0 } : held ? held(v.ship) : orders(hands.stick);
      advance(helm, { aim: chase.axes().ahead, fire: !!v && (pulled || hands.fire) }, leapOf(hands.stick));
      pulled = false;
    }
    // what is drawn is `between` of the way from the step before last to the last
    const now = (tick - 1 + between) * STEP;
    env.clock = now;
    drawn = begun === null ? 0 : Math.max(0, now - begun * STEP);
    for (const { id, ship, shove } of fleet) {
      const a = aboard.get(id)!, p = blendPose(a.before, a.after, between);
      frame.fleet.set(id, p, a.look, add(scale(ship.heading, ship.speed), shove));
      if (id === PLAYER) last = p;
    }
    for (const [id, f] of flying) {
      const p = blendPose(f.before, f.after, between);
      frame.fleet.set(id, p, lookOf(id), [0, 0, 0], false);
      if (id === PLAYER) last = p;
    }
    for (let k = wrecks.length - 1; k >= 0; k--) {
      const w = wrecks[k], p = sinking(w.pose, now - w.tick * STEP, w.side);
      if (p) frame.fleet.set(w.id, p, w.look, [0, 0, 0], false);
      else {
        frame.fleet.drop(w.id);
        wrecks.splice(k, 1);
      }
      if (w.id === PLAYER && p) last = p;
    }
    frame.gunfire.draw(now, battle.balls.map((b) => add(b.p, b.v, (between - 1) * STEP)));
    const followed = view.watch === PLAYER ? last : poseOf(view.watch, between) ?? last;
    const { pose: at, shot } = shoot(followed, dt);
    chase.update(at, hands.look, dt, tick * STEP, shot);
  }, {
    status,
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
    /** The match's clock: seconds since the drop ended (0 through it). */
    time,
    /** The storm at the moment drawn, for the frame (sim/storm.ts). */
    storm,
    /** Fire her gun at the next step, if it is loaded then (the HUD's button). */
    fire() { pulled = true; },

    /** A new match opening with the Gale: SHIPS ships, hers the first, the rest bots, every one in the air. */
    drop(m: Match) {
      const ids = Array.from({ length: SHIPS }, (_, i) => i);
      clear(m, ids);
      begun = null;
      drop = startDrop(m.seed, ids, ids.slice(1), sites, m.storm(0).next, depth);
      lane = course(drop.gale);
      for (const f of drop.flyers) flying.set(f.id, { before: flown(f), after: flown(f) });
      last = flown(drop.flyers[0]);
      chase.reset(last, tick * STEP, shoot(last, 0).shot);
    },
    /** A quiet sea for the lobby: her ship alone where she lies at the start. */
    anchor() {
      clear(match, [PLAYER]);
      launch(PLAYER, shipAt(start.at, bearing(start.at, start.bearing)), LOOK, false);
      last = aboard.get(PLAYER)!.after;
      chase.reset(last, tick * STEP);
    },
    /** She leaves the Gale (DIVE), as soon as it allows. */
    dive() { dived = true; },
    /** Marks where she means to come down (a unit vector), or clears it: gliding with the stick let go, she makes for it. */
    mark(p: Vec3 | null) { mark = p; },
    /** Whether she is down on the sea (or sunk), out of the drop. */
    landed: () => !herFlyer() && !flying.has(PLAYER),
    /** The ids of every ship not sunk. */
    alive,
    /** What the drop's screen shows, or null once she is down. */
    dropping(): DropView | null {
      const f = herFlyer();
      if (!drop || !f) return null;
      return {
        left: Math.max(0, GALE.time - drop.t), ready: drop.t >= GALE.allowed, gone: f.stage !== 'gale',
        course: lane, fleet: drop.flyers.map((o) => o.at), first: match.storm(0).next, mark, pennant: mark ? chase.onScreen(mark, element.clientWidth, element.clientHeight) : null,
      };
    },
    /** The camera's orders from the match's flow: a new ship to follow is cut or flown to. */
    view(next: View) {
      if (next.watch !== view.watch) {
        if (next.move === 'fly') chase.fly();
        else {
          const p = poseOf(next.watch, 1);
          if (p) chase.reset(p, tick * STEP);
        }
      }
      view = next;
    },
    /** DEBUG (?screen=spectate, ?screen=won): sinks a ship at once, as if by `by`. */
    scuttle(id: number, by: number | null) {
      if (!aboard.has(id)) return;
      battle = { ...battle, crews: battle.crews.map((c) => (c.id === id ? { ...c, health: { ...c.health, hull: 0, shield: 0 } } : c)) };
      founder(id, by, by === null ? 'storm' : 'shot');
    },
  });
}

export type Game = ReturnType<typeof createGame>;

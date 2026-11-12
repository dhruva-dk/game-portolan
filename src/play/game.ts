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
// Debug: a drive, `legs` as "bearing,throttle,seconds;…" (bearings in degrees clockwise from north where she is),
// is sailed before the first frame; she holds its last order until a hand takes the helm.

import type { Environment } from '../environment';
import type { createFrame } from '../frame';
import type { Look } from '../ship/fleet';
import { battleOf, crewOf, stepBattle, weathered, type Battle, type Order } from '../sim/battle';
import { mind, rammed, think, type Memory, type Seen } from '../sim/bot';
import { afloat, stepFleet, type Vessel } from '../sim/contact';
import { STEP, blendPose, fixedClock } from '../sim/fixed';
import { chosen, gunOf, lead, muzzle } from '../sim/gun';
import { GUN, HEALTH, SHIP } from '../sim/handling';
import { sunk } from '../sim/health';
import { knocked, pose, ride, settled, type Ride } from '../sim/ride';
import { chart as bakeChart } from '../sim/route';
import { shipAt, type Helm, type ShipState } from '../sim/ship';
import type { Storm } from '../sim/storm';
import { createSwell } from '../water/swell';
import type { ShipPose } from '../world/pose';
import { hash } from '../world/random';
import { R, add, frameAt, scale, type Vec3 } from '../world/sphere';
import { createChase } from './chase';
import { createInput, type Hands } from './input';
import { sinking } from './sinking';
import { createStickView } from './stick';

/** How little of the stick's push counts as none. */
const DEAD = 0.15;
/** The player's colours (ship/fleet.ts): a red hull under weathered canvas. */
const LOOK: Look = { paint: [0.3, 0.03, 0.02], sail: [0.62, 0.57, 0.46], band: false };
/** The player's ship's id (and her slot in the drawn fleet, as every ship's id is hers). */
const PLAYER = 0;

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
  /** Ships still afloat, hers among them; whether hers is sunk. */
  afloat: number; sunk: boolean;
  /** Seconds till the storm next holds or closes (0 once it has closed for good), and its calm (radius in metres). */
  storm: number; eye: { centre: Vec3; radius: number };
}

/** The match: its seed (each bot's mind comes from it and her slot), its storm by the match's clock (s), and the
 * rarity of gun every ship is armed with (?gun=), or null for none. */
export interface Match { seed: number; storm: (seconds: number) => Storm; gun: number | null }

/** A ship sunk: who she was, who sank her (the ship whose ball or ram dealt the last blow; null for the storm), how,
 * when, on the match's clock (s), and where she went down and the way she headed. */
export interface Sinking { id: number; by: number | null; cause: 'shot' | 'ram' | 'storm'; time: number; at: Vec3; heading: Vec3 }

/** A ship as the match's flow reads her: who she is (0 the player's), where she is and heads, her hit points, whether
 * she carries a gun, and whether she is still afloat. */
export interface Afloat { id: number; at: Vec3; heading: Vec3; hull: number; shield: number; armed: boolean; afloat: boolean }

/** What the game keeps of a ship afloat beside her Vessel: her colours, her bot (null: the player's, or a scripted
 * ship's), the orders a scripted ship holds, how she rides the sea, and her last two poses. */
interface Aboard { look: Look; mind: Memory | null; steady: Helm; ride: Ride; before: ShipPose; after: ShipPose }
/** A ship going down: her pose when she sank and the step she sank at, listing to `side`. */
interface Wreck { id: number; look: Look; pose: ShipPose; tick: number; side: number }

/** start: where she lies and the bearing she heads (radians); legs: a debug drive, or ''; others: the others afloat. */
export function createGame(
  frame: Frame, env: Environment, element: HTMLElement, start: { at: Vec3; bearing: number }, legs: string, others: readonly Other[], match: Match,
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
  let fleet: Vessel[] = [
    afloat(PLAYER, shipAt(start.at, bearing(start.at, start.bearing))),
    ...others.map((o, i) => afloat(i + 1, { ...shipAt(o.at, o.heading), speed: o.way })),
  ];
  const seedOf = (id: number) => hash(match.seed, id);
  const aboard = new Map<number, Aboard>(fleet.map((v, i) => {
    const o = i > 0 ? others[i - 1] : null, r = settled(v.ship, sea, 0), p = pose(v.ship, r);
    return [v.id, {
      look: o?.look ?? LOOK, mind: o && o.way <= 0 ? mind(seedOf(v.id), v.ship.at) : null,
      steady: { course: null, throttle: (o?.way ?? 0) / SHIP.top }, ride: r, before: p, after: p,
    }];
  }));
  let battle: Battle = battleOf(fleet.map((v) => crewOf(v.id, match.gun === null ? null : gunOf(match.gun))), match.seed);
  const wrecks: Wreck[] = [], sinkings: Sinking[] = [];
  let tick = 0, pulled = false, last = aboard.get(PLAYER)!.after;

  /** One step: the player's helm and gun, everyone else's from her bot or her script; then the fleet's step and the
   * fighting's, and what it did set to be drawn. */
  const advance = (helm: Helm, gun: Order) => {
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
    const worn = weathered(fought.battle, fleet, match.storm(tick * STEP), STEP);
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
    const where = (id: number) => {
      const v = fleet.find((o) => o.id === id)!;
      return { at: v.ship.at, heading: v.ship.heading };
    };
    // the sunk taken off the sea, to go down
    for (const id of [...fought.sunk, ...worn.sunk]) {
      const a = aboard.get(id);
      if (!a) continue;
      const blow = fought.sunk.includes(id) ? fought.strikes.findLast((s) => s.struck === id) : undefined;
      sinkings.push({ id, by: blow?.shooter ?? null, cause: blow ? (blow.ram ? 'ram' : 'shot') : 'storm', time: t, ...where(id) });
      wrecks.push({ id, look: a.look, pose: a.after, tick, side: seedOf(id) & 1 ? 1 : -1 });
      aboard.delete(id);
    }
    fleet = fleet.filter((v) => aboard.has(v.id));
  };

  const mine = () => fleet.find((v) => v.id === PLAYER) ?? null;

  // the drive, sailed now
  let held: ((s: ShipState) => Helm) | null = null;
  const still: Order = { aim: null, fire: false };
  for (const leg of legs.split(';').filter(Boolean)) {
    const [b, throttle, seconds] = leg.split(',').map(Number);
    held = (s) => ({ course: bearing(s.at, (b * Math.PI) / 180), throttle });
    for (let i = 0; i < Math.round(seconds / STEP) && mine(); i++) advance(held(mine()!.ship), still);
  }
  chase.reset(aboard.get(PLAYER)?.after ?? last, tick * STEP);

  /** The hands' orders: the stick's push as a heading across the sea as the camera sees it. */
  const orders = (stick: Hands['stick']): Helm => {
    const push = stick ? Math.hypot(stick.x, stick.y) : 0;
    if (!stick || push < DEAD) return { course: null, throttle: 0 };
    const { ahead, right } = chase.axes();
    return { course: add(scale(ahead, stick.y), right, stick.x), throttle: Math.min(1, (push - DEAD) / (1 - DEAD)) };
  };

  /** The storm as drawn: on the match's clock, at the moment drawn. */
  let drawn = 0, eye = { centre: [0, 0, 1] as Vec3, radius: -1 };
  const storm = () => match.storm(drawn);

  /** Whether her gun's assist, aimed where the camera looks, has a ship it can lay on. */
  const locked = (v: Vessel, rarity: number) => {
    const from = muzzle(v), mark = chosen(from, chase.axes().ahead, GUN.assist[rarity], fleet.filter((o) => o.id !== v.id));
    return !!mark && lead(from, mark) !== null;
  };

  /** What the HUD reads of the match. (Its calm is a new object only when it has moved or changed by a metre.) */
  const status = (): Status => {
    const c = battle.crews.find((k) => k.id === PLAYER)!, v = mine(), s = storm();
    const radius = Math.round(s.radius * R);
    if (radius !== eye.radius || s.centre.some((x, i) => Math.abs(x - eye.centre[i]) * R > 1)) eye = { centre: s.centre, radius };
    const full = c.gun ? GUN.reload * GUN.reloadBy[c.gun.rarity] : 1;
    return {
      at: v?.ship.at ?? last.up, heading: v?.ship.heading ?? last.forward,
      hull: c.health.hull, hullMax: HEALTH.hull, shield: c.health.shield, shieldMax: HEALTH.shield,
      gun: c.gun ? { rarity: c.gun.rarity, ready: 1 - c.gun.loading / full, locked: !!v && locked(v, c.gun.rarity) } : null,
      afloat: fleet.length, sunk: sunk(c.health),
      storm: Number.isFinite(s.secondsToNext) ? s.secondsToNext : 0, eye,
    };
  };

  return Object.assign((dt: number) => {
    const hands = input.read();
    drawStick(hands.stick);
    if (hands.stick || hands.look.held) held = null;
    const { steps, between } = clock(dt);
    for (let i = 0; i < steps; i++) {
      const v = mine();
      const helm = !v ? { course: null, throttle: 0 } : held ? held(v.ship) : orders(hands.stick);
      advance(helm, { aim: chase.axes().ahead, fire: pulled || hands.fire });
      pulled = false;
    }
    // what is drawn is `between` of the way from the step before last to the last
    const now = (tick - 1 + between) * STEP;
    env.clock = drawn = now;
    for (const { id, ship, shove } of fleet) {
      const a = aboard.get(id)!, p = blendPose(a.before, a.after, between);
      frame.fleet.set(id, p, a.look, add(scale(ship.heading, ship.speed), shove));
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
    chase.update(last, hands.look, dt, tick * STEP);
  }, {
    status,
    /** Every ship sunk so far, in the order they went down (a new entry is a ship just sunk). */
    sinkings: (): readonly Sinking[] => sinkings,
    /** Every ship of the match, afloat or sunk, as she stands now, in order of her id. */
    ships: (): Afloat[] => {
      const afloatNow = new Map(fleet.map((v) => [v.id, v]));
      return battle.crews.map((c) => {
        const v = afloatNow.get(c.id), gone = sinkings.find((k) => k.id === c.id)!;
        return { id: c.id, at: v?.ship.at ?? gone.at, heading: v?.ship.heading ?? gone.heading, hull: c.health.hull, shield: c.health.shield, armed: !!c.gun, afloat: !!v };
      });
    },
    /** The match's clock: seconds sailed. */
    time: () => tick * STEP,
    /** The storm at the moment drawn, for the frame (sim/storm.ts). */
    storm,
    /** Fire her gun at the next step, if it is loaded then (the HUD's button). */
    fire() { pulled = true; },
  });
}

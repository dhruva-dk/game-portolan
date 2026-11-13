// The game view: the player's ship on the sea, sailed by the stick, watched by the chase camera, among the others
// she fights (the match itself, its ships, bots and fighting, is state.ts's).
//
// Each frame (step): the hands are read and turned into the helm's and the gun's orders, the match takes as many
// fixed steps as the frame has time for (sim/fixed.ts), and the camera follows the ship drawn blended between the
// last two. What is drawn (snapshot) is that moment: the ships, the balls, the camera's eye, and the world's clock (the
// sea's) set to it, so the hulls and the waves under them are the same instant.
//
// The stick steers by the screen: pushed toward a direction on the screen, she heads that way across the sea as the
// camera looks at it, as fast as it is pushed. Let go, she coasts. Her gun is aimed where the camera looks along the
// sea (the gun's assist lays it on a ship near that bearing: sim/gun.ts), and fired by fire() (the HUD's button) or,
// for now, Space. In the drop, the stick steers her glide (state.ts leap).
//
// The camera follows the ship the match's flow sets (view): hers, or after she sinks the one she watches, cut to or
// flown to; its shots on the Gale, coming down and on a win are shots.ts's.
//
// Debug: a drive, `legs` as "bearing,throttle,seconds;…" (bearings in degrees clockwise from north where she is),
// is sailed before the first frame; she holds its last order until a hand takes the helm.

import type { World } from '../environment';
import type { Order } from '../sim/battle';
import { HOLD } from '../sim/drop';
import { STEP, fixedClock } from '../sim/fixed';
import { chosen, lead, muzzle } from '../sim/gun';
import { GUN, HEALTH } from '../sim/handling';
import { sunk } from '../sim/health';
import { PLAYER, SHIPS } from '../sim/match';
import type { Chart } from '../sim/route';
import type { Helm, ShipState } from '../sim/ship';
import type { Snapshot } from '../snapshot';
import { createSwell } from '../water/swell';
import type { Anchor } from '../world/lattice';
import type { ShipPose } from '../world/pose';
import { R, add, normalize, scale, type Vec3 } from '../world/sphere';
import { createChase } from './chase';
import { createInput, type Hands } from './input';
import { createShots, flown } from './shots';
import { bearing, createState, type Dropping, type Match, type Other } from './state';
import { createStickView } from './stick';

/** How little of the stick's push counts as none. */
const DEAD = 0.15;

/** The match as the HUD reads it (ui/hud.ts HudState): a plain snapshot, made fresh each time it is asked for. */
export interface Status {
  /** Where the ship the camera follows is (unit sphere) and the way she heads (unit tangent): hers, or once she has
   *  sunk the one she watches. */
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

/** The drop as its screen reads it (ui/gale.ts): state.ts's Dropping, and where her mark stands on the screen (CSS px)
 *  if in sight. */
export interface DropView extends Dropping { pennant: { x: number; y: number } | null }

/** What the camera does, as the match's flow sets it (sim/match.ts): the ship it follows, and whether it cut or flew
 * to her; whether the hands steer and look; whether it circles her (the win). */
export interface View { watch: number; move: 'cut' | 'fly'; hands: boolean; circle: boolean }

const idleLook = { x: 0, y: 0, held: false };

/** world: the planet and its climate; anchors: the sea's (frame.ts), for the waves' CPU copy; chart: the bots' chart
 *  of open water (sim/route.ts); start: where she lies and the bearing she heads (radians); legs: a debug drive, or
 *  ''; others: the others afloat. */
export function createGame(
  world: World, anchors: readonly Anchor[], chart: Chart, element: HTMLElement, start: { at: Vec3; bearing: number }, legs: string,
  others: readonly Other[], first: Match,
) {
  const ground = world.planet.height;
  const sea = createSwell(anchors, ground, world.climate.seaWind);
  const state = createState(world.planet, sea, chart, first);
  const input = createInput(element);
  const drawStick = createStickView();
  const chase = createChase(ground, sea);
  const clock = fixedClock();
  /** Whether Fire was pressed since the last step; how far the moment drawn is through the last step. */
  let pulled = false, between = 0;
  /** The camera: what the flow sets, and its shots. */
  let view: View = { watch: PLAYER, move: 'cut', hands: true, circle: false };
  const shots = createShots();
  /** Her pose as last drawn. */
  let last: ShipPose = flown({ id: PLAYER, seat: 0, stage: 'sea', at: start.at, heading: bearing(start.at, start.bearing), height: 0, speed: 0, climb: 0 });

  // the ships she starts among, and the drive, sailed now
  last = state.begin(start, others);
  let held: ((s: ShipState) => Helm) | null = null;
  const still: Order = { aim: null, fire: false };
  for (const leg of legs.split(';').filter(Boolean)) {
    const [b, throttle, seconds] = leg.split(',').map(Number);
    held = (s) => ({ course: bearing(s.at, (b * Math.PI) / 180), throttle });
    for (let i = 0; i < Math.round(seconds / STEP) && state.mine(); i++) state.advance(held(state.mine()!.ship), still, HOLD);
  }
  last = state.after(PLAYER) ?? last;
  chase.reset(last, state.clock(1));

  /** The hands' orders: the stick's push as a heading across the sea as the camera sees it. */
  const orders = (stick: Hands['stick']): Helm => {
    const push = stick ? Math.hypot(stick.x, stick.y) : 0;
    if (!stick || push < DEAD) return { course: null, throttle: 0 };
    const { ahead, right } = chase.axes();
    return { course: add(scale(ahead, stick.y), right, stick.x), throttle: Math.min(1, (push - DEAD) / (1 - DEAD)) };
  };

  /** The storm's calm as the HUD last read it (a new object only when it has moved or changed by a metre). */
  let calm = { centre: [0, 0, 1] as Vec3, radius: -1 };

  /** Whether her gun's assist, aimed where the camera looks, has a ship it can lay on. */
  const locked = (rarity: number) => {
    const fleet = state.vessels(), v = state.mine();
    if (!v) return false;
    const from = muzzle(v), mark = chosen(from, chase.axes().ahead, GUN.assist[rarity], fleet.filter((o) => o.id !== v.id));
    return !!mark && lead(from, mark) !== null;
  };

  /** The camera's shot of the ship it follows (shots.ts). */
  const shoot = (pose: ShipPose, dt: number) =>
    shots.take({ pose, drop: state.gale(), flyer: view.watch === PLAYER ? state.herFlyer() : null, circle: view.circle, ships: SHIPS }, dt);

  /** A new match or sea: the camera behind her, its shots and orders as at the start. */
  const restart = (her: ShipPose, shot = false) => {
    view = { watch: PLAYER, move: 'cut', hands: true, circle: false };
    shots.reset();
    last = her;
    chase.reset(last, state.clock(1), shot ? shoot(last, 0).shot : undefined);
  };

  return {
    /** A frame of dt seconds: the hands read, the match stepped on, the camera moved after the ship it follows. */
    step(dt: number) {
      const read = input.read(), hands = view.hands ? read : { stick: null, look: idleLook, fire: false };
      drawStick(hands.stick);
      if (hands.stick || hands.look.held) held = null;
      const time = clock(dt);
      for (let i = 0; i < time.steps; i++) {
        const v = state.mine();
        const helm = !v ? { course: null, throttle: 0 } : held ? held(v.ship) : orders(hands.stick);
        state.advance(helm, { aim: chase.axes().ahead, fire: !!v && (pulled || hands.fire) }, state.leap(orders(hands.stick).course));
        pulled = false;
      }
      between = time.between;
      last = state.drawn(between).find((s) => s.id === PLAYER)?.pose ?? last;
      const followed = view.watch === PLAYER ? last : state.poseOf(view.watch, between) ?? last;
      const { pose: at, shot } = shoot(followed, dt);
      chase.update(at, hands.look, dt, state.clock(1), shot);
    },
    /** What is drawn now (snapshot.ts). */
    snapshot(): Snapshot {
      return {
        eye: chase.eye(), clock: state.clock(between), storm: state.storm(between),
        ships: state.drawn(between), own: PLAYER, balls: state.balls(between), blasts: state.blasts(),
      };
    },
    /** What the HUD reads of the match. */
    status(): Status {
      const c = state.crew(PLAYER), v = state.mine(), f = state.herFlyer(), s = state.storm(between);
      const radius = Math.round(s.radius * R);
      if (radius !== calm.radius || s.centre.some((x, i) => Math.abs(x - calm.centre[i]) * R > 1)) calm = { centre: s.centre, radius };
      const full = c.gun ? GUN.reload * GUN.reloadBy[c.gun.rarity] : 1;
      // once she has sunk, the disc is the watched ship's (ui/hud.ts watch)
      const watched = view.watch !== PLAYER || sunk(c.health) ? state.ships().find((k) => k.id === view.watch) : undefined;
      return {
        at: watched?.at ?? v?.ship.at ?? f?.at ?? normalize(last.position), heading: watched?.heading ?? v?.ship.heading ?? f?.heading ?? last.forward,
        hull: c.health.hull, hullMax: HEALTH.hull, shield: c.health.shield, shieldMax: HEALTH.shield,
        gun: c.gun ? { rarity: c.gun.rarity, ready: 1 - c.gun.loading / full, locked: locked(c.gun.rarity) } : null,
        afloat: state.alive().length, sunk: sunk(c.health),
        storm: Number.isFinite(s.secondsToNext) ? s.secondsToNext : 0, eye: calm,
      };
    },
    sinkings: state.sinkings,
    ships: state.ships,
    time: state.time,
    landed: state.landed,
    alive: state.alive,
    /** Fire her gun at the next step, if it is loaded then (the HUD's button). */
    fire() { pulled = true; },
    /** A new match opening with the Gale: every ship in the air, hers the first. */
    drop(m: Match) {
      restart(state.drop(m), true);
    },
    /** A quiet sea for the lobby: her ship alone where she lies at the start. */
    anchor() {
      restart(state.anchor(start));
    },
    dive: state.dive,
    mark: state.mark,
    /** What the drop's screen shows, or null once she is down. */
    dropping(): DropView | null {
      const d = state.dropping();
      return d && { ...d, pennant: d.mark ? chase.onScreen(d.mark, element.clientWidth, element.clientHeight) : null };
    },
    /** The camera's orders from the match's flow: a new ship to follow is cut or flown to. */
    view(next: View) {
      if (next.watch !== view.watch) {
        if (next.move === 'fly') chase.fly();
        else {
          const p = state.poseOf(next.watch, 1);
          if (p) chase.reset(p, state.clock(1));
        }
      }
      view = next;
    },
    scuttle: state.scuttle,
  };
}

export type Game = ReturnType<typeof createGame>;

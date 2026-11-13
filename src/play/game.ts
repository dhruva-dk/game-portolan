// The game view: the player's ship on the sea, sailed by the stick, watched by the chase camera, among the others
// she fights (the match itself, its ships, bots and fighting, is state.ts's).
//
// Each frame (step): her hands, as read for it (player.ts Hands), are turned into the helm's and the gun's orders, the
// match takes as many fixed steps as the frame has time for (sim/fixed.ts), and the camera follows the ship drawn
// blended between the last two. What is drawn (snapshot) is that moment: the ships, the balls, the camera's eye, and the world's clock (the
// sea's) set to it, so the hulls and the waves under them are the same instant.
//
// The stick steers by the screen: pushed toward a direction on the screen, she heads that way across the sea as the
// camera looks at it, as fast as it is pushed. Let go, she coasts. Her gun is aimed where the camera looks along the
// sea (the gun's assist lays it on a ship near that bearing: sim/gun.ts), and fired at the next step once her hands
// order it (the HUD's button).
//
// The camera follows the ship the match's flow sets (view): hers, or after she sinks the one she watches, cut to or
// flown to; its shot on a win is shots.ts's.
//
// It opens on the lobby's quiet sea (anchor), where the camera stands off her bow and a drag turns it round her
// (anchorage.ts) and her hands do not sail her; a match then opens with every ship afloat at her berth (start), the
// eye coming down from space onto her (arrival.ts), her hands on her ship once it is there; or, debugging, at sea
// among others (atSea). Her helm may be lashed (lash): she holds it until a hand takes the helm.

import type { World } from '../environment';
import { fixedClock } from '../sim/fixed';
import { chosen, lead, muzzle } from '../sim/gun';
import { GUN, HEALTH } from '../sim/handling';
import { sunk } from '../sim/health';
import { PLAYER } from '../sim/match';
import type { Helm, ShipState } from '../sim/ship';
import type { Eye, Snapshot } from '../snapshot';
import { createSwell } from '../world/swell';
import type { Anchor } from '../world/lattice';
import type { ShipPose } from '../world/pose';
import { R, add, normalize, scale, type Vec3 } from '../world/sphere';
import { IDLE, type Hands, type Status } from '../player';
import { REST, anchorageEye, dragged, relaxed, type Orbit } from './anchorage';
import { arriving } from './arrival';
import { createChase } from './chase';
import { createShots } from './shots';
import { bearing, createState, type Berth, type Match, type Waters } from './state';

/** How little of the stick's push counts as none. */
const DEAD = 0.15;

/** What the camera does, as the match's flow sets it (sim/match.ts): the ship it follows, and whether it cut or flew
 * to her; whether the hands steer and look; whether it circles her (the win). */
export interface View { watch: number; move: 'cut' | 'fly'; hands: boolean; circle: boolean }

/** world: the planet and its climate; anchors: the sea's (frame.ts), for the waves' CPU copy; waters: the planet's
 *  water sounded (state.ts); start: where she lies in the lobby and the bearing she heads (radians); first: the match
 *  in hand until another is dealt. */
export function createGame(world: World, anchors: readonly Anchor[], waters: Waters, start: { at: Vec3; bearing: number }, first: Match) {
  const ground = world.planet.height;
  const sea = createSwell(anchors, ground, world.climate.seaWind);
  const state = createState(world.planet, sea, waters, first);
  const chase = createChase(ground, sea);
  const clock = fixedClock();
  /** Whether her gun was ordered fired since the last step; how far the moment drawn is through the last step. */
  let pulled = false, between = 0;
  /** The camera: what the flow sets, and its shots. */
  let view: View = { watch: PLAYER, move: 'cut', hands: true, circle: false };
  const shots = createShots();
  /** Her pose as last drawn. */
  let last: ShipPose = { position: scale(start.at, R), forward: bearing(start.at, start.bearing), up: start.at };
  /** Seconds since the match began while the eye is still coming down onto her (arrival.ts), else null. */
  let arrival: number | null = null;
  /** Her helm while lashed, until a hand takes it. */
  let held: ((s: ShipState) => Helm) | null = null;
  /** Whether she lies at anchor in the lobby, where the camera has been dragged round her, and its eye as last placed. */
  let anchored = false, orbit: Orbit = REST, berth: Eye | null = null;

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

  /** A new match or sea: the camera behind her, its shots and orders as at the start, her helm free. */
  const restart = (her: ShipPose, anchor = false) => {
    view = { watch: PLAYER, move: 'cut', hands: true, circle: false };
    anchored = anchor;
    orbit = REST;
    berth = null;
    shots.reset();
    held = null;
    arrival = null;
    last = her;
    chase.reset(last, state.clock(1));
  };
  /** Whether her hands are on her ship: the flow gives them (view), she is not at anchor, and the eye is down with her. */
  const steering = () => view.hands && !anchored && arrival === null;
  restart(state.anchor(start), true);

  return {
    /** Whether her hands are on her ship (steering and looking), or the match's flow, the lobby or the arrival has them. */
    steering,
    /** A frame of dt seconds, her hands as read for it (none while the match's flow, the lobby or the arrival has
     *  them): the match stepped on, the camera moved after the ship it follows. */
    step(dt: number, read: Hands) {
      const hands = steering() ? read : IDLE;
      if (hands.stick || hands.look.held) held = null;
      pulled ||= hands.fire;
      const time = clock(dt);
      for (let i = 0; i < time.steps; i++) {
        const v = state.mine();
        const helm = !v ? { course: null, throttle: 0 } : held ? held(v.ship) : orders(hands.stick);
        state.advance(helm, { aim: chase.axes().ahead, fire: !!v && pulled });
        pulled = false;
      }
      between = time.between;
      last = state.drawn(between).find((s) => s.id === PLAYER)?.pose ?? last;
      if (anchored) {
        // at anchor, the look's drag turns the camera round her; let go, it eases home
        orbit = dragged(orbit, read.look);
        if (!read.look.held) orbit = relaxed(orbit, dt);
        const now = state.clock(between);
        berth = anchorageEye(last, orbit, now, (p) => Math.max(ground(p), sea(p, now)));
        return;
      }
      const followed = view.watch === PLAYER ? last : state.poseOf(view.watch, between) ?? last;
      chase.update(followed, hands.look, dt, state.clock(1), shots.take(view.circle, dt));
      if (arrival !== null && !arriving((arrival += dt), last, chase.eye())) arrival = null;
    },
    /** What is drawn now (snapshot.ts). */
    snapshot(): Snapshot {
      const eye = chase.eye();
      return {
        eye: anchored ? berth ?? anchorageEye(last, orbit, state.clock(between), ground) : (arrival !== null && arriving(arrival, last, eye)) || eye,
        clock: state.clock(between), storm: state.storm(between),
        ships: state.drawn(between), own: PLAYER, balls: state.balls(between), blasts: state.blasts(),
      };
    },
    /** What the HUD reads of the match. */
    status(): Status {
      const c = state.crew(PLAYER), v = state.mine(), s = state.storm(between);
      const radius = Math.round(s.radius * R);
      if (radius !== calm.radius || s.centre.some((x, i) => Math.abs(x - calm.centre[i]) * R > 1)) calm = { centre: s.centre, radius };
      const full = c.gun ? GUN.reload * GUN.reloadBy[c.gun.rarity] : 1;
      // once she has sunk, the disc is the watched ship's (ui/hud.ts watch)
      const watched = view.watch !== PLAYER || sunk(c.health) ? state.ships().find((k) => k.id === view.watch) : undefined;
      return {
        at: watched?.at ?? v?.ship.at ?? normalize(last.position), heading: watched?.heading ?? v?.ship.heading ?? last.forward,
        hull: c.health.hull, hullMax: HEALTH.hull, shield: c.health.shield, shieldMax: HEALTH.shield,
        gun: c.gun ? { rarity: c.gun.rarity, ready: 1 - c.gun.loading / full, locked: locked(c.gun.rarity) } : null,
        afloat: state.alive().length, sunk: sunk(c.health),
        storm: Number.isFinite(s.secondsToNext) ? s.secondsToNext : 0, eye: calm,
      };
    },
    sinkings: state.sinkings,
    ships: state.ships,
    alive: state.alive,
    /** A new match: every ship afloat at her berth, hers the first, and the eye coming down onto her from space. */
    start(m: Match) {
      restart(state.start(m));
      arrival = 0;
    },
    /** A quiet sea for the lobby: her ship alone where she lies at the start. */
    anchor() {
      restart(state.anchor(start), true);
    },
    /** A match at sea about her: her ship where she lies in the lobby, the others about her. */
    atSea(others: readonly Berth[]) {
      restart(state.begin(start, others));
    },
    /** Lashes her helm: from the next step she sails by `helm` (given her ship as she lies) until a hand takes the
     *  helm (the stick pushed or the look dragged). */
    lash(helm: (s: ShipState) => Helm) {
      held = helm;
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
    sink: state.sink,
  };
}

export type Game = ReturnType<typeof createGame>;

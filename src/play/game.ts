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
// order it (the HUD's button). In the drop, the stick steers her glide (state.ts leap).
//
// The camera follows the ship the match's flow sets (view): hers, or after she sinks the one she watches, cut to or
// flown to; its shots on the Gale, coming down and on a win are shots.ts's.
//
// It opens on the lobby's quiet sea (anchor); a match then opens with the Gale (drop), or at sea among others (atSea).
// Her helm may be lashed (lash): she holds it until a hand takes the helm.

import type { World } from '../environment';
import { fixedClock } from '../sim/fixed';
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
import { IDLE, type Hands, type Status } from '../player';
import { createChase } from './chase';
import { createShots, flown } from './shots';
import { bearing, createState, type Berth, type Dropping, type Match } from './state';

/** How little of the stick's push counts as none. */
const DEAD = 0.15;

/** The drop as its screen reads it (ui/gale.ts): state.ts's Dropping, and where her mark stands on the screen (CSS px)
 *  if in sight. */
export interface DropView extends Dropping { pennant: { x: number; y: number } | null }

/** What the camera does, as the match's flow sets it (sim/match.ts): the ship it follows, and whether it cut or flew
 * to her; whether the hands steer and look; whether it circles her (the win). */
export interface View { watch: number; move: 'cut' | 'fly'; hands: boolean; circle: boolean }

/** world: the planet and its climate; anchors: the sea's (frame.ts), for the waves' CPU copy; chart: the bots' chart
 *  of open water (sim/route.ts); start: where she lies and the bearing she heads (radians); first: the match in hand
 *  until another is dealt. */
export function createGame(world: World, anchors: readonly Anchor[], chart: Chart, start: { at: Vec3; bearing: number }, first: Match) {
  const ground = world.planet.height;
  const sea = createSwell(anchors, ground, world.climate.seaWind);
  const state = createState(world.planet, sea, chart, first);
  const chase = createChase(ground, sea);
  const clock = fixedClock();
  /** Whether her gun was ordered fired since the last step; how far the moment drawn is through the last step. */
  let pulled = false, between = 0;
  /** The camera: what the flow sets, and its shots. */
  let view: View = { watch: PLAYER, move: 'cut', hands: true, circle: false };
  const shots = createShots();
  /** Her pose as last drawn. */
  let last: ShipPose = flown({ id: PLAYER, seat: 0, stage: 'sea', at: start.at, heading: bearing(start.at, start.bearing), height: 0, speed: 0, climb: 0 });
  /** Her helm while lashed, until a hand takes it. */
  let held: ((s: ShipState) => Helm) | null = null;

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

  /** A new match or sea: the camera behind her, its shots and orders as at the start, her helm free. */
  const restart = (her: ShipPose, shot = false) => {
    view = { watch: PLAYER, move: 'cut', hands: true, circle: false };
    shots.reset();
    held = null;
    last = her;
    chase.reset(last, state.clock(1), shot ? shoot(last, 0).shot : undefined);
  };
  restart(state.anchor(start));

  return {
    /** Whether her hands are on her ship (steering and looking), or the match's flow has taken them. */
    steering: () => view.hands,
    /** A frame of dt seconds, her hands as read for it (none while the match's flow takes them: view): the match
     *  stepped on, the camera moved after the ship it follows. */
    step(dt: number, read: Hands) {
      const hands = view.hands ? read : IDLE;
      if (hands.stick || hands.look.held) held = null;
      pulled ||= hands.fire;
      const time = clock(dt);
      for (let i = 0; i < time.steps; i++) {
        const v = state.mine();
        const helm = !v ? { course: null, throttle: 0 } : held ? held(v.ship) : orders(hands.stick);
        state.advance(helm, { aim: chase.axes().ahead, fire: !!v && pulled }, state.leap(orders(hands.stick).course));
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
    landed: state.landed,
    alive: state.alive,
    /** A new match opening with the Gale: every ship in the air, hers the first. */
    drop(m: Match) {
      restart(state.drop(m), true);
    },
    /** A quiet sea for the lobby: her ship alone where she lies at the start. */
    anchor() {
      restart(state.anchor(start));
    },
    /** A match at sea with no drop: her ship where she lies at the start, the others about her. */
    atSea(others: readonly Berth[]) {
      restart(state.begin(start, others));
    },
    /** Lashes her helm: from the next step she sails by `helm` (given her ship as she lies) until a hand takes the
     *  helm (the stick pushed or the look dragged). */
    lash(helm: (s: ShipState) => Helm) {
      held = helm;
    },
    dive: state.dive,
    mark: state.mark,
    /** What the drop's screen shows, on a view `width` × `height` CSS px, or null once she is down. */
    dropping(width: number, height: number): DropView | null {
      const d = state.dropping();
      return d && { ...d, pennant: d.mark ? chase.onScreen(d.mark, width, height) : null };
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

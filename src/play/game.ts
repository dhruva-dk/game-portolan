// The game view: the player's ship (the fleet's first) on the sea, sailed by the stick, watched by the chase camera.
//
// Each frame: the hands are read and turned into the helm's orders, the simulation takes as many fixed steps as the
// frame has time for (sim/fixed.ts), the ship is drawn blended between the last two, and the world's clock (the
// sea's) is set to the moment drawn, so the hull and the waves under her are the same instant.
//
// The stick steers by the screen: pushed toward a direction on the screen, she heads that way across the sea as the
// camera looks at it, as fast as it is pushed. Let go, she coasts.
//
// Debug: a drive, `legs` as "bearing,throttle,seconds;…" (bearings in degrees clockwise from north where she is),
// is sailed before the first frame; she holds its last order until a hand takes the helm.

import type { Environment } from '../environment';
import type { createFrame } from '../frame';
import type { Look } from '../ship/fleet';
import { STEP, blendPose, fixedClock } from '../sim/fixed';
import { pose, ride, settled } from '../sim/ride';
import { shipAt, step, type Helm, type ShipState } from '../sim/ship';
import { createSwell } from '../water/swell';
import { add, frameAt, scale, type Vec3 } from '../world/sphere';
import { createChase } from './chase';
import { createInput, type Hands } from './input';
import { createStickView } from './stick';

/** How little of the stick's push counts as none. */
const DEAD = 0.15;
/** The player's colours (ship/fleet.ts): a red hull under weathered canvas. */
const LOOK: Look = { paint: [0.3, 0.03, 0.02], sail: [0.62, 0.57, 0.46], band: false, brace: 0 };

type Frame = ReturnType<typeof createFrame>;

/** A bearing (radians clockwise from north at a point) as a direction there. */
const bearing = (at: Vec3, b: number): Vec3 => {
  const f = frameAt(at);
  return add(scale(f.north, Math.cos(b)), f.east, Math.sin(b));
};

/** start: where she lies and the bearing she heads (radians); legs: a debug drive, or ''. */
export function createGame(frame: Frame, env: Environment, element: HTMLElement, start: { at: Vec3; bearing: number }, legs: string) {
  const ground = frame.planet.height;
  const depth = (p: Vec3) => -ground(p);
  const sea = createSwell(frame.anchors, ground, env.windSpeed);
  const input = createInput(element);
  const drawStick = createStickView();
  const chase = createChase(frame.camera, ground, sea);
  const clock = fixedClock();

  // her sails keep the screen's middle, where the chase camera aims, clear
  frame.fleet.own(0);
  let ship = shipAt(start.at, bearing(start.at, start.bearing));
  let tick = 0;
  let motion = settled(ship, sea, 0);
  let before = pose(ship, motion), after = before;
  const advance = (helm: Helm) => {
    ship = step(ship, helm, STEP, depth);
    tick++;
    motion = ride(motion, ship, sea, tick * STEP, STEP);
    before = after;
    after = pose(ship, motion);
  };

  // the drive, sailed now
  let held: ((s: ShipState) => Helm) | null = null;
  for (const leg of legs.split(';').filter(Boolean)) {
    const [b, throttle, seconds] = leg.split(',').map(Number);
    held = (s) => ({ course: bearing(s.at, (b * Math.PI) / 180), throttle });
    for (let i = 0; i < Math.round(seconds / STEP); i++) advance(held(ship));
  }
  chase.reset(after, tick * STEP);

  /** The hands' orders: the stick's push as a heading across the sea as the camera sees it. */
  const orders = (stick: Hands['stick']): Helm => {
    const push = stick ? Math.hypot(stick.x, stick.y) : 0;
    if (!stick || push < DEAD) return { course: null, throttle: 0 };
    const { ahead, right } = chase.axes();
    return { course: add(scale(ahead, stick.y), right, stick.x), throttle: Math.min(1, (push - DEAD) / (1 - DEAD)) };
  };

  return (dt: number) => {
    const hands = input.read();
    drawStick(hands.stick);
    if (hands.stick || hands.look.held) held = null;
    const { steps, between } = clock(dt);
    for (let i = 0; i < steps; i++) advance(held ? held(ship) : orders(hands.stick));
    // what is drawn is `between` of the way from the step before last to the last
    env.clock = (tick - 1 + between) * STEP;
    const drawn = blendPose(before, after, between);
    frame.fleet.set(0, drawn, LOOK, scale(ship.heading, ship.speed));
    chase.update(drawn, hands.look, dt, tick * STEP);
  };
}

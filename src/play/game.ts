// The game view: the player's ship (the fleet's first) on the sea, sailed by the stick, watched by the chase camera.
//
// Each frame: the hands are read and turned into the helm's orders, the simulation takes as many fixed steps as the
// frame has time for (sim/fixed.ts), the ship is drawn blended between the last two, and the world's clock (the
// sea's) is set to the moment drawn, so the hull and the waves under her are the same instant.
//
// The stick steers by the screen: pushed toward a direction on the screen, she heads that way across the sea as the
// camera looks at it, as fast as it is pushed. Let go, she coasts.
//
// She sails among others as one fleet (sim/contact.ts): hulls that meet shove apart, and a ram knocks the struck ship
// over a little (sim/ride.ts knocked). The others are bots (sim/bot.ts), each seeded by her place in the fleet, unless
// main.ts sets them a way to make (?way=), when they hold a straight course as scripted ships for captures.
//
// Debug: a drive, `legs` as "bearing,throttle,seconds;…" (bearings in degrees clockwise from north where she is),
// is sailed before the first frame; she holds its last order until a hand takes the helm.

import type { Environment } from '../environment';
import type { createFrame } from '../frame';
import type { Look } from '../ship/fleet';
import { mind, rammed, think, type Memory } from '../sim/bot';
import { afloat, stepFleet, type Vessel } from '../sim/contact';
import { STEP, blendPose, fixedClock } from '../sim/fixed';
import { SHIP } from '../sim/handling';
import { knocked, pose, ride, settled } from '../sim/ride';
import { shipAt, type Helm, type ShipState } from '../sim/ship';
import { createSwell } from '../water/swell';
import { add, frameAt, scale, type Vec3 } from '../world/sphere';
import { createChase } from './chase';
import { createInput, type Hands } from './input';
import { createStickView } from './stick';

/** How little of the stick's push counts as none. */
const DEAD = 0.15;
/** The player's colours (ship/fleet.ts): a red hull under weathered canvas. */
const LOOK: Look = { paint: [0.3, 0.03, 0.02], sail: [0.62, 0.57, 0.46], band: false };

type Frame = ReturnType<typeof createFrame>;

/** A bearing (radians clockwise from north at a point) as a direction there. */
const bearing = (at: Vec3, b: number): Vec3 => {
  const f = frameAt(at);
  return add(scale(f.north, Math.cos(b)), f.east, Math.sin(b));
};

/** SCAFFOLDING (main.ts ?ships=, until ships are placed for real): a ship on the sea in her own colours, sailed by a
 * bot; or, given a `way` (m/s), on a straight course at that speed, her rudder amidships. */
export interface Other { at: Vec3; heading: Vec3; look: Look; way: number }

/** The match as the HUD reads it (ui/hud.ts). */
export interface Status { at: Vec3; heading: Vec3; afloat: number }

/** start: where she lies and the bearing she heads (radians); legs: a debug drive, or ''; others: the others afloat. */
export function createGame(
  frame: Frame, env: Environment, element: HTMLElement, start: { at: Vec3; bearing: number }, legs: string, others: readonly Other[] = [],
) {
  const ground = frame.planet.height;
  const depth = (p: Vec3) => -ground(p);
  const sea = createSwell(frame.anchors, ground, env.seaWind);
  const input = createInput(element);
  const drawStick = createStickView();
  const chase = createChase(frame.camera, ground, sea);
  const clock = fixedClock();

  // (always drawn whole: the chase camera holds her at the finest level's edge)
  frame.fleet.own(0);
  let fleet: Vessel[] = [
    afloat(0, shipAt(start.at, bearing(start.at, start.bearing))),
    ...others.map((o, i) => afloat(i + 1, { ...shipAt(o.at, o.heading), speed: o.way })),
  ];
  const looks = [LOOK, ...others.map((o) => o.look)];
  const steady: Helm[] = others.map((o) => ({ course: null, throttle: o.way / SHIP.top }));
  let minds: (Memory | null)[] = fleet.map((v, i) => (i > 0 && others[i - 1].way <= 0 ? mind(i, v.ship.at) : null));
  /** Each other ship's orders: her bot's, or her straight course. */
  const theirs = () => fleet.slice(1).map((v, k) => {
    const m = minds[k + 1];
    if (!m) return steady[k];
    const r = think(v, fleet.filter((o) => o.id !== v.id), depth, m, v.id);
    minds[k + 1] = r.memory;
    return r.helm;
  });
  let tick = 0;
  let motions = fleet.map((v) => settled(v.ship, sea, 0));
  let before = fleet.map((v, i) => pose(v.ship, motions[i])), after = before;
  const advance = (helm: Helm) => {
    const met = stepFleet(fleet, [helm, ...theirs()], STEP, depth);
    fleet = met.fleet;
    for (const b of met.blows) minds = minds.map((m, i) => (m && fleet[i].id === b.struck.id ? rammed(m, b.striker.id) : m));
    tick++;
    motions = motions.map((m, i) => ride(knocked(m, fleet[i].ship, met.jolts[i]), fleet[i].ship, sea, tick * STEP, STEP));
    before = after;
    after = fleet.map((v, i) => pose(v.ship, motions[i]));
  };

  // the drive, sailed now
  let held: ((s: ShipState) => Helm) | null = null;
  for (const leg of legs.split(';').filter(Boolean)) {
    const [b, throttle, seconds] = leg.split(',').map(Number);
    held = (s) => ({ course: bearing(s.at, (b * Math.PI) / 180), throttle });
    for (let i = 0; i < Math.round(seconds / STEP); i++) advance(held(fleet[0].ship));
  }
  chase.reset(after[0], tick * STEP);

  /** The hands' orders: the stick's push as a heading across the sea as the camera sees it. */
  const orders = (stick: Hands['stick']): Helm => {
    const push = stick ? Math.hypot(stick.x, stick.y) : 0;
    if (!stick || push < DEAD) return { course: null, throttle: 0 };
    const { ahead, right } = chase.axes();
    return { course: add(scale(ahead, stick.y), right, stick.x), throttle: Math.min(1, (push - DEAD) / (1 - DEAD)) };
  };

  /** What the HUD reads of the match: where she is, the way she heads, and how many ships are afloat. */
  const status = (): Status => ({ at: fleet[0].ship.at, heading: fleet[0].ship.heading, afloat: fleet.length });

  return Object.assign((dt: number) => {
    const hands = input.read();
    drawStick(hands.stick);
    if (hands.stick || hands.look.held) held = null;
    const { steps, between } = clock(dt);
    for (let i = 0; i < steps; i++) advance(held ? held(fleet[0].ship) : orders(hands.stick));
    // what is drawn is `between` of the way from the step before last to the last
    env.clock = (tick - 1 + between) * STEP;
    fleet.forEach(({ ship, shove }, i) => {
      frame.fleet.set(i, blendPose(before[i], after[i], between), looks[i], add(scale(ship.heading, ship.speed), shove));
    });
    chase.update(blendPose(before[0], after[0], between), hands.look, dt, tick * STEP);
  }, { status });
}

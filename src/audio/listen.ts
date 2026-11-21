// What is heard from what she sees and holds as it changes, frame to frame (the
// deeds on the sea are the match's moments: status.moments, her guns' among
// them): a slot of her stores taken in hand, a ball passing near the eye, her
// water (a loop closed), the storm beginning to close (its thunder, then its
// wind), a fault coming on her, and the screens
// (a folio opened and closed, PLAY, her end); and what the bed follows (Bed):
// her speed, the wind in her rig, her heave and roll, the nearest coast, the
// storm's wall, her hull, and how much of the sea is heard at all (and how much
// the screens cover it).
//
// Pure: plain data in, cues and the bed out; what it keeps between frames is
// its own, and a frame makes nothing but the cues it calls. The coast is found
// by sounding the ground in a ring round her, a few points a frame.

import {
  HOTBAR,
  SOUND,
  worsened,
  type Faults,
  type GunKind,
  type Kit,
  type Screen,
  type Status,
} from '../player.ts';
import type { ShipDraw, Snapshot } from '../snapshot.ts';
import { clamp } from '../world/scalar.ts';
import { R, distance, dot, type Vec3 } from '../world/sphere.ts';
import type { Cue } from './cues.ts';

/**
 * What the sound is given each frame: the world drawn, what the HUD reads, the
 * screen shown, whether the full map is open, and how much of the world the
 * screens cover, 0…1 (the parchment on the way home from a match).
 */
export interface Hearing {
  scene: Snapshot;
  status: Status & Kit;
  screen: Screen;
  map: boolean;
  covered: number;
}

/**
 * A cue to play: placed at `at` (world metres) or hers (null), `gain` a factor
 * on its level; `gun` the kind of gun it is of, if it is a gun's (its report is
 * that kind's).
 */
export interface Call {
  cue: Cue;
  at: Vec3 | null;
  gain: number;
  gun?: GunKind;
}

/**
 * What the bed follows (bed.ts):
 *   speed     her speed, a share of her top (1 at 16 m/s)
 *   wind      the wind in her rig, 0…1 (her way through the air, and a gust)
 *   heave     her rise and fall, m/s (up +)
 *   roll      her roll, radians
 *   coast     metres to the nearest land sounded round her (Infinity: none within the ring)
 *   wall      metres to the storm's wall: + inside the calm, − out in the storm
 *   hull      her hull left, 0…1
 *   presence  how much of the sea is heard, 0…1 (none from space; less over the title)
 *   muffle    how muffled, 0…1 (the full map open; her end)
 *   covered   how much of the world the screens cover, 0…1: the sea goes with it, and comes back as it lifts
 *   clock     the world's clock, s
 */
export interface Bed {
  speed: number;
  wind: number;
  heave: number;
  roll: number;
  coast: number;
  wall: number;
  hull: number;
  presence: number;
  muffle: number;
  covered: number;
  clock: number;
}

/**
 * Her top speed, m/s: sim/handling.ts SHIP.top, which the sound may not import
 * (tests/audio.test.ts holds them equal).
 */
export const TOP = 16;
/** The ring the coast is sounded on: metres out, and how many ways round. */
const RING = [25, 60, 110, 200] as const,
  WAYS = 8;
/**
 * A ball passing within this many metres of the eye is heard, its whistle at
 * its closest WHISTLE s into it; one whistle stands for all within APART s of
 * it.
 */
const PASS = 30,
  WHISTLE = 0.3,
  APART = 0.12;
/**
 * What a screen shown says, by the screen it came from: a folio opened, closed;
 * PLAY; her end.
 */
function screenCue(from: Screen, to: Screen): Cue | null {
  if (to === 'settings' || to === 'livery') return 'open';
  if ((from === 'settings' || from === 'livery') && to === 'lobby')
    return 'close';
  if (from === 'lobby' && to === 'match') return 'launch';
  if (to === 'sunk' && from === 'sinking') return 'lost';
  if (to === 'won') return 'salute';
  return null;
}
/** A cue called onto `out`. */
const call = (out: Call[], cue: Cue, at: Vec3 | null = null, gain = 1) =>
  out.push({ cue, at, gain });

export function createListen(ground: (p: Vec3) => number) {
  const bed: Bed = {
    speed: 0,
    wind: 0,
    heave: 0,
    roll: 0,
    coast: Infinity,
    wall: Infinity,
    hull: 1,
    presence: 0,
    muffle: 0,
    covered: 0,
    clock: 0,
  };
  let screen: Screen | null = null,
    map = false,
    generation = -1,
    seq = 0,
    closing = false;
  /** Her hotbar's slot in hand; the faults last heard, and whose (Status of). */
  let chosen = 0,
    faulted: Faults = SOUND,
    faultsOf = NaN;
  let lift = NaN,
    roll = 0,
    whistled = -Infinity;
  /**
   * Land found on the ring (1) or not (0), each way and distance; the next to
   * sound.
   */
  const land = new Uint8Array(RING.length * WAYS);
  let sounding = 0;
  const probe: [number, number, number] = [0, 0, 1];

  /**
   * Sounds the next way round the ring about `at` (a unit vector), each of its
   * distances. The tangent and the steps along the great circle are sphere.ts's
   * (tangent, rotateAbout, along) written out on plain numbers, so a frame's
   * sounding makes nothing.
   */
  const sound = (at: Vec3) => {
    const w = sounding % WAYS,
      phi = (2 * Math.PI * w) / WAYS;
    // a tangent at `at`: off the axis it is least along
    const off = Math.abs(at[0]) < 0.9,
      k = off ? at[0] : at[1];
    const e1x = (off ? 1 : 0) - k * at[0],
      e1y = (off ? 0 : 1) - k * at[1],
      e1z = -k * at[2];
    const l = Math.sqrt(e1x * e1x + e1y * e1y + e1z * e1z);
    const ux = e1x / l,
      uy = e1y / l,
      uz = e1z / l;
    const vx = at[1] * uz - at[2] * uy,
      vy = at[2] * ux - at[0] * uz,
      vz = at[0] * uy - at[1] * ux;
    const cp = Math.cos(phi),
      sp = Math.sin(phi),
      tx = ux * cp + vx * sp,
      ty = uy * cp + vy * sp,
      tz = uz * cp + vz * sp;
    for (let r = 0; r < RING.length; r++) {
      const c = Math.cos(RING[r] / R),
        s = Math.sin(RING[r] / R);
      probe[0] = at[0] * c + tx * s;
      probe[1] = at[1] * c + ty * s;
      probe[2] = at[2] * c + tz * s;
      land[r * WAYS + w] = ground(probe) > 0 ? 1 : 0;
    }
    sounding++;
    bed.coast = Infinity;
    for (let i = 0; i < land.length; i++)
      if (land[i]) bed.coast = Math.min(bed.coast, RING[Math.floor(i / WAYS)]);
  };

  return {
    /**
     * A frame of `dt` s: the cues heard, appended to `out`; the bed, as it now
     * is.
     */
    listen(
      { scene, status: s, screen: shown, map: open, covered }: Hearing,
      dt: number,
      out: Call[]
    ): Bed {
      // the screens, and the full map
      if (screen !== null && shown !== screen) {
        const cue = screenCue(screen, shown);
        if (cue) call(out, cue);
      }
      if (open !== map) call(out, open ? 'open' : 'close');
      screen = shown;
      map = open;

      let own: ShipDraw | null = null;
      for (const sh of scene.ships)
        if (sh.id === scene.own && sh.afloat) own = sh;
      const sea = scene.sea,
        fresh = (sea?.generation ?? 0) !== generation;
      if (fresh) {
        generation = sea?.generation ?? 0;
        seq = sea?.seq ?? 0;
        closing = s.closing;
        lift = NaN;
      }

      // a slot of her stores taken in hand (a gun taken in hand is her deed:
      // swapped)
      if (!fresh && s.chosen !== chosen && s.chosen >= HOTBAR.guns)
        call(out, 'select');
      chosen = s.chosen;

      // her water: a loop closed
      if (sea && scene.own !== null) {
        for (const c of sea.changes)
          if (c.seq > seq && c.ship === scene.own && c.kind === 'claim')
            call(out, 'claim');
        seq = sea.seq;
      }
      // the storm beginning to close: its bolt's thunder at the edge (sky/storm-bolt.ts), the wind rising after
      if (s.closing && !closing && FOUGHT(shown)) {
        call(out, 'thunder');
        call(out, 'closing');
      }
      closing = s.closing;
      // a fault come on her, or worsened: a beam giving way (not another
      // ship's, watched in her place)
      if (!fresh && s.of === faultsOf && worsened(faulted, s.faults) && !s.sunk)
        call(out, 'fault');
      faulted = s.faults;
      faultsOf = s.of;

      // a ball passing near the eye: its whistle begun WHISTLE s before its
      // closest
      const eye = scene.eye.position;
      for (const b of scene.balls) {
        const rx = b.at[0] - eye[0],
          ry = b.at[1] - eye[1],
          rz = b.at[2] - eye[2],
          v2 = dot(b.way, b.way);
        const tc =
          -(rx * b.way[0] + ry * b.way[1] + rz * b.way[2]) / Math.max(1e-6, v2);
        if (!(tc <= WHISTLE && tc > WHISTLE - dt)) continue;
        const cx = rx + b.way[0] * tc,
          cy = ry + b.way[1] * tc,
          cz = rz + b.way[2] * tc;
        if (
          cx * cx + cy * cy + cz * cz >= PASS * PASS ||
          Math.abs(scene.clock - whistled) < APART
        )
          continue;
        call(out, 'whistle', [eye[0] + cx, eye[1] + cy, eye[2] + cz]);
        whistled = scene.clock;
      }

      // her heave and roll
      if (own) {
        const p = own.pose.position,
          r = Math.sqrt(dot(p, p)),
          f = own.pose.forward;
        const sx = (f[1] * p[2] - f[2] * p[1]) / r,
          sy = (f[2] * p[0] - f[0] * p[2]) / r,
          sz = (f[0] * p[1] - f[1] * p[0]) / r;
        const sl = Math.sqrt(sx * sx + sy * sy + sz * sz) || 1,
          u = own.pose.up;
        const now = Math.asin(
          clamp((u[0] * sx + u[1] * sy + u[2] * sz) / sl, -1, 1)
        );
        roll = now;
        const height = r - R;
        bed.heave =
          dt > 0 && Number.isFinite(lift)
            ? bed.heave +
              ((height - lift) / dt - bed.heave) * Math.min(1, dt * 6)
            : 0;
        lift = height;
        bed.speed = Math.sqrt(dot(own.velocity, own.velocity)) / TOP;
      } else {
        bed.heave = 0;
        bed.speed = 0;
        lift = NaN;
      }
      bed.roll = roll;
      bed.wind = Math.min(1, 0.22 + 0.5 * bed.speed + (s.blowing ? 0.5 : 0));
      sound(s.at);
      bed.wall = s.eye.radius - distance(s.at, s.eye.centre);
      bed.hull = s.hullMax > 0 ? s.hull / s.hullMax : 1;
      bed.presence = (1 - s.arriving) * (shown === 'title' ? 0.6 : 1);
      bed.muffle = open
        ? 1
        : shown === 'sinking' || shown === 'sunk'
          ? 0.45
          : 0;
      bed.covered = clamp(covered);
      bed.clock = scene.clock;
      return bed;
    },
  };
}

/**
 * The screens where the storm is heard closing: a match still being fought. Not
 * ui/ways.ts IN_MATCH, which holds won and result too: once the match is won or
 * over its storm is no news.
 */
const FOUGHT = (s: Screen) =>
  s === 'match' || s === 'spectate' || s === 'sinking' || s === 'sunk';

import {
  type GunKind,
  type Kit,
  type Screen,
  type Status,
} from '../play/player.ts';
import type { ShipDraw, Snapshot } from '../render/snapshot.ts';
import { clamp } from '../world/scalar.ts';
import { R, distance, dot, type Vec3 } from '../world/sphere.ts';
import type { Cue } from './cues.ts';

export interface Hearing {
  scene: Snapshot;
  status: Status & Kit;
  screen: Screen;
  map: boolean;
  covered: number;
}

export interface Call {
  cue: Cue;
  at: Vec3 | null;
  gain: number;
  gun?: GunKind;
}

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

const RING = [25, 60, 110, 200] as const,
  WAYS = 8;
const PASS = 30,
  WHISTLE = 0.3,
  APART = 0.12;
function screenCue(from: Screen, to: Screen): Cue | null {
  if (to === 'settings') return 'open';
  if (from === 'settings' && to === 'lobby') return 'close';
  if (from === 'lobby' && to === 'match') return 'launch';
  if (to === 'sunk' && from === 'sinking') return 'lost';
  if (to === 'won') return 'salute';
  return null;
}
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
  let using: number | null = null;
  let lift = NaN,
    roll = 0,
    whistled = -Infinity;
  const land = new Uint8Array(RING.length * WAYS);
  let sounding = 0;
  const probe: [number, number, number] = [0, 0, 1];

  const sound = (at: Vec3) => {
    const w = sounding % WAYS,
      phi = (2 * Math.PI * w) / WAYS;
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
    listen(
      { scene, status: s, screen: shown, map: open, covered }: Hearing,
      dt: number,
      out: Call[]
    ): Bed {
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

      const slot = s.using?.slot ?? null;
      if (!fresh && slot !== using && slot !== null) call(out, 'select');
      using = slot;

      if (sea && scene.own !== null) {
        for (const c of sea.changes)
          if (c.seq > seq && c.ship === scene.own && c.kind === 'claim')
            call(out, 'claim');
        seq = sea.seq;
      }
      if (s.closing && !closing && FOUGHT(shown)) {
        call(out, 'thunder');
        call(out, 'closing');
      }
      closing = s.closing;

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
        bed.speed =
          s.top > 0 ? Math.sqrt(dot(own.velocity, own.velocity)) / s.top : 0;
      } else {
        bed.heave = 0;
        bed.speed = 0;
        lift = NaN;
      }
      bed.roll = roll;
      bed.wind = Math.min(1, 0.22 + 0.5 * bed.speed + (s.blowing ? 0.5 : 0));
      sound(s.at);
      bed.wall = s.eye.radius - distance(s.at, s.eye.center);
      bed.hull = s.hullMax > 0 ? s.hull / s.hullMax : 1;
      bed.presence = 1 - s.arriving;
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

const FOUGHT = (s: Screen) =>
  s === 'match' || s === 'spectate' || s === 'sinking' || s === 'sunk';

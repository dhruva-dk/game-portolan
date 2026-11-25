import { AIR_FOV, type Eye } from '../render/snapshot.ts';
import type { ShipPose } from '../world/pose.ts';
import { clamp, lerp, smoother, wrapAngle } from '../world/scalar.ts';
import {
  along,
  dot,
  frameAt,
  normalize,
  place,
  rotateAbout,
  scale,
  tangent,
  type CourseOut,
  type Out3,
  type Vec3,
} from '../world/sphere.ts';
import { lookAt, type Out4 } from '../world/turn.ts';

export const LOBBY = {
  quarter: 0.95,
  boom: 30,
  pitch: 0.1,
  height: 7,
  drift: 0.26,
  period: 90,
} as const;

export const BROADSIDE = {
  quarter: Math.PI / 2,
  boom: 44,
  height: 4,
  ease: 2.4,
} as const;

const VIEWPORT = { width: 1180, height: 820 } as const;

export const ORBIT = {
  pitch: [-0.07, 0.42],
  turn: (Math.PI * 1.5) / VIEWPORT.width,
  tilt: 1.2 / VIEWPORT.height,
  back: 0.9,
} as const;

const CLEAR = 1.5;

interface Focus {
  ahead: number;
  height: number;
  quarter: number;
  boom: number;
  pitch: number;
  drift: number;
}
export const LOOSE: Readonly<Focus> = {
  ahead: 0,
  height: LOBBY.height,
  quarter: LOBBY.quarter,
  boom: LOBBY.boom,
  pitch: LOBBY.pitch,
  drift: LOBBY.drift,
};
export const PARTS = [
  'sails',
  'rigging',
  'rudder',
  'hull',
  'keel',
  'mounts',
] as const;
export type PartType = (typeof PARTS)[number];

export const FOCI: Readonly<Record<PartType, Readonly<Focus>>> = {
  sails: {
    ahead: 0.5,
    height: 12,
    quarter: 1.25,
    boom: 29,
    pitch: 0.12,
    drift: 0,
  },
  rigging: {
    ahead: 4,
    height: 12,
    quarter: 0.55,
    boom: 24,
    pitch: 0.3,
    drift: 0,
  },
  rudder: {
    ahead: -9,
    height: 1.2,
    quarter: 2.55,
    boom: 13,
    pitch: 0.18,
    drift: 0,
  },
  hull: {
    ahead: 0,
    height: 2,
    quarter: Math.PI / 2,
    boom: 30,
    pitch: 0.06,
    drift: 0,
  },
  keel: {
    ahead: 1,
    height: 0.2,
    quarter: 1.9,
    boom: 16,
    pitch: 0.02,
    drift: 0,
  },
  mounts: {
    ahead: -1.4,
    height: 2.6,
    quarter: 1.2,
    boom: 11,
    pitch: 0.55,
    drift: 0,
  },
};
const FOCUSED = 3;

export function focused(a: Focus, to: Readonly<Focus>, dt: number): Focus {
  const k = 1 - Math.exp(-FOCUSED * dt);
  a.ahead += (to.ahead - a.ahead) * k;
  a.height += (to.height - a.height) * k;
  a.quarter += (to.quarter - a.quarter) * k;
  a.boom += (to.boom - a.boom) * k;
  a.pitch += (to.pitch - a.pitch) * k;
  a.drift += (to.drift - a.drift) * k;
  return a;
}

export interface Orbit {
  yaw: number;
  pitch: number;
  broadside: number;
}

export const REST: Orbit = { yaw: 0, pitch: 0, broadside: 0 };

export const dragged = (
  o: Orbit,
  look: { x: number; y: number },
  out: Orbit = { ...o }
): Orbit => {
  out.yaw = wrapAngle(o.yaw - look.x * ORBIT.turn);
  out.pitch = clamp(
    o.pitch + look.y * ORBIT.tilt,
    ORBIT.pitch[0],
    ORBIT.pitch[1]
  );
  return out;
};

export const relaxed = (o: Orbit, dt: number, out: Orbit = { ...o }): Orbit => {
  const k = Math.exp(-ORBIT.back * dt);
  out.yaw = o.yaw * k;
  out.pitch = o.pitch * k;
  out.broadside = o.broadside;
  return out;
};

export const turned = (
  o: Orbit,
  on: boolean,
  dt: number,
  out: Orbit = { ...o }
): Orbit => {
  out.yaw = o.yaw;
  out.pitch = o.pitch;
  const to = on ? 1 : 0;
  out.broadside = to + (o.broadside - to) * Math.exp(-BROADSIDE.ease * dt);
  if (Math.abs(out.broadside - to) < 1e-4) out.broadside = to;
  return out;
};

export interface Framing {
  center: [number, number];
  size: number;
}
export const WHOLE: Readonly<Framing> = { center: [0, 0], size: 1 };
const FRAMED = 5;

export function framed(f: Framing, to: Readonly<Framing>, dt: number): Framing {
  const k = 1 - Math.exp(-FRAMED * dt);
  f.center[0] += (to.center[0] - f.center[0]) * k;
  f.center[1] += (to.center[1] - f.center[1]) * k;
  f.size += (to.size - f.size) * k;
  return f;
}

type EyeOut = Eye & {
  position: Out3;
  orientation: Out4;
  center: [number, number];
  size: number;
};
export const eyeOut = (): EyeOut => ({
  kind: 'air',
  position: [0, 0, 0],
  orientation: [0, 0, 0, 1],
  fov: AIR_FOV,
  center: [0, 0],
  size: 1,
});

const up: Out3 = [0, 0, 0],
  ahead: Out3 = [0, 0, 0],
  way: Out3 = [0, 0, 0],
  at: Out3 = [0, 0, 0];
const end: CourseOut = { p: [0, 0, 0], t: [0, 0, 0] },
  pivot: CourseOut = { p: [0, 0, 0], t: [0, 0, 0] };

export function anchorageEye(
  pose: ShipPose,
  on: { orbit: Readonly<Orbit>; focus: Readonly<Focus> },
  clock: number,
  floor: (p: Vec3) => number,
  out = eyeOut()
): Eye {
  const { orbit: o, focus } = on;
  normalize(pose.position, up);
  normalize(tangent(pose.forward, up, ahead), ahead);
  const b = smoother(clamp(o.broadside));
  const yaw =
    Math.PI -
    lerp(focus.quarter, BROADSIDE.quarter, b) +
    (1 - b) * focus.drift * Math.sin((clock / LOBBY.period) * Math.PI * 2) +
    o.yaw;
  const pitch = focus.pitch + o.pitch,
    boom = lerp(focus.boom, BROADSIDE.boom, b),
    height = lerp(focus.height, BROADSIDE.height, b);
  const middle = along(up, ahead, focus.ahead, pivot).p;
  const under = along(
    middle,
    scale(rotateAbout(ahead, up, yaw, way), -1, way),
    boom * Math.cos(pitch),
    end
  ).p;
  const position = place(
    under,
    Math.max(focus.height + boom * Math.sin(pitch), floor(under) + CLEAR),
    out.position
  );
  lookAt(
    position,
    place(middle, height, at),
    normalize(position, way),
    out.orientation
  );
  out.kind = 'air';
  out.fov = AIR_FOV;
  return out;
}

export const CONSORT = {
  id: 1,
  berths: [
    [-78, 34],
    [-96, 42],
    [-62, 26],
    [-116, 50],
    [-50, 20],
  ],
  turn: 0.4,
  depth: 3,
  reach: 16,
} as const;

export const LIT = { behind: 0.6 } as const;

export function litBearing(sun: Vec3, at: Vec3): number {
  const f = frameAt(at);
  const sunward = Math.atan2(dot(sun, f.east), dot(sun, f.north));
  return wrapAngle(sunward + LIT.behind - LOBBY.quarter);
}

export function consortBerth(
  at: Vec3,
  heading: Vec3,
  depth: (p: Vec3) => number
): { at: Vec3; heading: Vec3 } | null {
  const up = normalize(at),
    ahead = normalize(tangent(heading, up));
  const deep = (p: Vec3, t: Vec3) =>
    [0, CONSORT.reach, -CONSORT.reach].every(
      (m) => depth(along(p, t, m).p) > CONSORT.depth
    );
  for (const [astern, abeam] of CONSORT.berths) {
    const fore = along(up, ahead, astern);
    const abeamWay = normalize(rotateAbout(fore.t, fore.p, Math.PI / 2));
    const side = along(fore.p, abeamWay, abeam);
    const t = normalize(tangent(ahead, side.p));
    if (deep(side.p, t))
      return {
        at: side.p,
        heading: normalize(rotateAbout(t, side.p, CONSORT.turn)),
      };
  }
  return null;
}

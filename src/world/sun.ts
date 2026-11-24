import {
  add,
  dot,
  frameAt,
  normalize,
  put,
  scale,
  transport,
  type FrameOut,
  type Out3,
  type Vec3,
} from './sphere.ts';

const LATITUDE = (10 * Math.PI) / 180;
const DECLINATION = (23.44 * Math.PI) / 180;

export interface SunPlaces {
  anchor: Vec3;
  origin: Vec3;
}

export const sunPlaces = (start: Vec3, heart: Vec3): SunPlaces => ({
  anchor: start,
  origin: scale(normalize(heart), -1),
});

export function sunInSky(hours: number, out?: Out3): Vec3 {
  const h = ((hours - 12) / 12) * Math.PI;
  const sl = Math.sin(LATITUDE),
    cl = Math.cos(LATITUDE),
    sd = Math.sin(DECLINATION),
    cd = Math.cos(DECLINATION);
  return put(
    out,
    -cd * Math.sin(h),
    sl * sd + cl * cd * Math.cos(h),
    cl * sd - sl * cd * Math.cos(h)
  );
}

const frame: FrameOut = { up: [0, 0, 0], east: [0, 0, 0], north: [0, 0, 0] };
const sky: Out3 = [0, 0, 0],
  here: Out3 = [0, 0, 0],
  ca: Out3 = [0, 0, 0],
  cb: Out3 = [0, 0, 0],
  level: Out3 = [0, 0, 0];

const inFrame = (p: Vec3, a: Vec3, out?: Out3): Vec3 => {
  const f = frameAt(p, frame);
  return add(
    add(scale(f.east, a[0], out), f.up, a[1], out),
    f.north,
    a[2],
    out
  );
};

export function sunAtOrigin(
  places: SunPlaces,
  hours: number,
  out?: Out3
): Vec3 {
  return carry(
    inFrame(places.anchor, sunInSky(hours, sky), here),
    places.anchor,
    places.origin,
    out
  );
}

function carry(s: Vec3, from: Vec3, to: Vec3, out?: Out3): Vec3 {
  const a = normalize(from, ca),
    b = normalize(to, cb),
    y = dot(s, a);
  add(s, a, -y, level);
  return normalize(add(transport(level, a, b, level), b, y, level), out);
}

export function sunAt(
  places: SunPlaces,
  hours: number,
  p: Vec3,
  out?: Out3
): Vec3 {
  return carry(sunAtOrigin(places, hours, here), places.origin, p, out);
}

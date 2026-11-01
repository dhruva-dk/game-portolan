// Fixed scenes for looking at the world: a spot on the sea, a heading, an hour, a tilt, weather and a camera. The test
// hook jumps to these, and the capture tools use the region views and lap paths defined here, so every run frames
// the same places. This is app code, not simulation code: it may use Math freely, since nothing here is replayed.
import { R, fromLatLon } from '../sim/sphere.ts';
import { BEACONS, LANDMARKS, REGIONS, heightAt, regionAt, type RegionId, type WeatherKind } from '../sim/world/index.ts';
import type { V3 } from '../sim/math.ts';

export type CameraMode = 'chase' | 'eye' | 'orbit' | 'high';

export interface SceneSpec {
  /** Unit vector from the planet's centre. */
  pos: V3;
  /** Unit tangent the camera (and the player's ship) faces. */
  heading: V3;
  /** Local solar hour at pos, 0…24. */
  hour: number;
  /** Planet tilt in degrees: the sun's latitude at noon. */
  tilt: number;
  weather: WeatherKind | 'clear';
  camera: CameraMode;
  /** Sea level offset in metres, -1…1. */
  tide: number;
  /** Whether to put the player's ship there. */
  ship: boolean;
  region?: string;
  regionName?: string;
}

export interface SceneInput {
  pos?: V3 | [number, number, number];
  lat?: number;
  lon?: number;
  heading?: V3 | [number, number, number] | number;
  region?: RegionId | number;
  hour?: number;
  tilt?: number;
  weather?: WeatherKind | 'clear';
  camera?: CameraMode;
  tide?: number;
  ship?: boolean;
}

const DEG = Math.PI / 180;

const vec = (x: number, y: number, z: number): V3 => ({ x, y, z });
const norm = (v: V3): V3 => {
  const l = Math.hypot(v.x, v.y, v.z) || 1;
  return vec(v.x / l, v.y / l, v.z / l);
};
const dot = (a: V3, b: V3) => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a: V3, b: V3): V3 => vec(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
const asVec = (v: V3 | [number, number, number]): V3 => (Array.isArray(v) ? vec(v[0], v[1], v[2]) : v);

/** East and north at p. */
export function frameAt(p: V3): { east: V3; north: V3 } {
  let east = cross(vec(0, 1, 0), p);
  east = Math.hypot(east.x, east.y, east.z) > 1e-6 ? norm(east) : vec(0, 0, -1);
  return { east, north: cross(p, east) };
}

/** The tangent at p on compass bearing b (radians, 0 north, clockwise). */
export function bearingTangent(p: V3, b: number): V3 {
  const { east, north } = frameAt(p);
  return norm(vec(north.x * Math.cos(b) + east.x * Math.sin(b), north.y * Math.cos(b) + east.y * Math.sin(b), north.z * Math.cos(b) + east.z * Math.sin(b)));
}

/** Moves `dist` metres from p along tangent t (a great circle). */
export function travel(p: V3, t: V3, dist: number): { pos: V3; heading: V3 } {
  const a = dist / R, c = Math.cos(a), s = Math.sin(a);
  const pos = norm(vec(p.x * c + t.x * s, p.y * c + t.y * s, p.z * c + t.z * s));
  const h = vec(t.x * c - p.x * s, t.y * c - p.y * s, t.z * c - p.z * s);
  const d = dot(h, pos);
  return { pos, heading: norm(vec(h.x - pos.x * d, h.y - pos.y * d, h.z - pos.z * d)) };
}

export function towards(p: V3, q: V3): V3 {
  const d = dot(p, q);
  return norm(vec(q.x - p.x * d, q.y - p.y * d, q.z - p.z * d));
}

export const latLonOf = (p: V3): { lat: number; lon: number } => ({
  lat: Math.asin(Math.max(-1, Math.min(1, p.y))) / DEG,
  lon: Math.atan2(-p.z, p.x) / DEG,
});

/**
 * The sun's direction for a local hour at p and a tilt (the sun's latitude), in the planet's frame. The subsolar
 * point sits where the local hour is noon.
 */
export function sunFor(p: V3, hour: number, tilt: number): V3 {
  const { lon } = latLonOf(p);
  const sunLon = lon - (hour - 12) * 15;
  const out = vec(0, 0, 0);
  fromLatLon(tilt * DEG, sunLon * DEG, out);
  return out;
}

const isWater = (p: V3): boolean => heightAt(p) < -2;

/**
 * A fixed spot on open water near a region's landmark, looking at it. Spot 0 stands off the landmark's face; spots 1
 * and 2 come in from a third of the way round on either side, further out, for the blind test.
 */
export function regionView(region: RegionId | number, k = 0): SceneSpec {
  const i = typeof region === 'number' ? region : REGIONS.findIndex((r) => r.id === region);
  if (i < 0 || i >= REGIONS.length) throw new RangeError(`regionView: no region ${region}`);
  const lm = LANDMARKS[i], { east, north } = frameAt(lm.pos);
  // the landmark's facing as a bearing, then turned for each spot
  const face = Math.atan2(dot(lm.facing, east), dot(lm.facing, north)) + [0, 2.1, -2.1][k % 3] + Math.floor(k / 3) * 0.6;
  const out = bearingTangent(lm.pos, face);
  const start = lm.r + 90 + (k % 3) * 40;
  let spot = travel(lm.pos, out, start).pos;
  for (let d = start; d < start + 260; d += 10) {
    const p = travel(lm.pos, out, d).pos;
    if (isWater(p)) { spot = p; break; }
  }
  const r = REGIONS[i];
  return {
    pos: spot, heading: towards(spot, lm.pos), hour: 12, tilt: 0, weather: 'clear', camera: 'eye', tide: 0, ship: false,
    region: r.id, regionName: r.name,
  };
}

/**
 * Points every `every` seconds of sailing at top speed along a full circuit: the equator, or a ring's latitude. On a
 * latitude the path is a small circle, so the heading is due east.
 */
export function lapPath(ring: 'equator' | 'north' | 'south', every: number, speed = 14.5): SceneSpec[] {
  const lat = ring === 'equator' ? 0 : (ring === 'north' ? 1 : -1) * Math.abs(REGIONS[1].lat);
  const circumference = 2 * Math.PI * R * Math.cos(lat * DEG), step = speed * every;
  const out: SceneSpec[] = [];
  for (let s = 0; s < circumference - step / 2; s += step) {
    const lon = (s / circumference) * 360;
    const pos = vec(0, 0, 0);
    fromLatLon(lat * DEG, lon * DEG, pos);
    // heading east means increasing longitude: the derivative of fromLatLon along lon
    const heading = norm(vec(-Math.sin(lon * DEG), 0, -Math.cos(lon * DEG)));
    const reg = REGIONS[regionAt(pos)];
    out.push({ pos, heading, hour: 11, tilt: 0, weather: 'clear', camera: 'chase', tide: 0, ship: true, region: reg.id, regionName: reg.name });
  }
  return out;
}

/** Fills in a scene from what was given: a region, a lat/lon, or a raw position, plus defaults. */
export function sceneFrom(s: SceneInput): SceneSpec {
  let base: SceneSpec;
  if (s.pos) base = { ...regionView(regionAt(norm(asVec(s.pos)))), pos: norm(asVec(s.pos)) };
  else if (s.lat !== undefined && s.lon !== undefined) {
    const p = vec(0, 0, 0);
    fromLatLon(s.lat * DEG, s.lon * DEG, p);
    base = { ...regionView(regionAt(p)), pos: p };
  } else base = regionView(s.region ?? 0);
  if (s.pos || s.lat !== undefined) base.heading = bearingTangent(base.pos, 0);
  if (s.heading !== undefined) {
    base.heading = typeof s.heading === 'number' ? bearingTangent(base.pos, s.heading * DEG) : towards(base.pos, norm(vec(
      base.pos.x + asVec(s.heading).x, base.pos.y + asVec(s.heading).y, base.pos.z + asVec(s.heading).z)));
  }
  const reg = REGIONS[regionAt(base.pos)];
  return {
    ...base,
    hour: s.hour ?? base.hour, tilt: s.tilt ?? base.tilt, weather: s.weather ?? base.weather,
    camera: s.camera ?? base.camera, tide: s.tide ?? 0, ship: s.ship ?? base.ship, region: reg.id, regionName: reg.name,
  };
}

/** Where the lobby sits: your ship on open water off the Spice Isles' cove, in the late afternoon, with the low sun
 * over the camera's shoulder so the hull shows its paint rather than its silhouette. */
export const lobbyScene = (): SceneSpec => sceneFrom({ region: 'spiceIsles', hour: 16.5, tilt: 12, camera: 'chase', ship: true, heading: 120 });

/** The title: the same spot seen from orbit, so tapping in flies down to the lobby. */
export const titleScene = (): SceneSpec => ({ ...lobbyScene(), camera: 'orbit' });

/** Every region with its beacon, for the hook's listings. */
export const regionList = () => REGIONS.map((r, i) => ({ id: r.id, name: r.name, beacon: BEACONS[i]?.pos ?? null }));

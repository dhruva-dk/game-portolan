// Fixed scenes for looking at the world: a spot on the sea, a heading, an hour, a tilt, weather and a camera. The test
// hook jumps to these, and the capture tools use the region views and lap paths defined here, so every run frames
// the same places. This is app code, not simulation code: it may use Math freely, since nothing here is replayed.
import { R, fromLatLon } from '../sim/sphere.ts';
import { BEACONS, CENTRES, LANDMARKS, REGIONS, heightAt, regionAt, type RegionId, type WeatherKind } from '../sim/world/index.ts';
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
  /** How far above the water a falling tide has left the shore wet, metres; none if not given. */
  ebb?: number;
  /** Whether to put the player's ship there. */
  ship: boolean;
  /** Other ships sailing on open water ahead, spread from 60 to 220 m out: their lanterns show at night. */
  fleet?: number;
  /** The camera's target over the sea, in metres, if not the ship's deck or the water. */
  height?: number;
  region?: string;
  regionName?: string;
  /** Weather standing off the spot rather than over it: its kind, how far ahead along the heading and to starboard
   *  it stands (metres along the surface), its radius and strength. */
  systems?: readonly SceneSystem[];
}

export interface SceneSystem {
  kind: WeatherKind;
  ahead: number;
  side?: number;
  radius?: number;
  strength?: number;
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
  ebb?: number;
  ship?: boolean;
  fleet?: number;
  height?: number;
  systems?: readonly SceneSystem[];
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
 * and 2 come in from a third of the way round on either side, further out.
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

const clampLat = (lat: number, most: number) => Math.max(-most, Math.min(most, lat));

/** A tilt that keeps midnight dark at p: none in the tropics, and toward the poles the sun far enough over the other
 *  hemisphere to stand 70° under the horizon at midnight, as at the equator. On a planet this small anything less
 *  leaves the sunset a few hundred metres off and clouds high enough to catch it, glowing red over the horizon. */
export const nightTilt = (p: V3): number => {
  const { lat } = latLonOf(p);
  return -Math.sign(lat) * Math.max(0, Math.abs(lat) - 20);
};

/**
 * A region from orbit at its noon, under a low sun on its equator side: the relief casts shadows, and the sun's glint
 * on the sea falls at the region's edge rather than over its middle.
 */
export function orbitView(region: RegionId | number): SceneSpec {
  const v = regionView(region), i = REGIONS.findIndex((r) => r.id === v.region), pos = LANDMARKS[i].pos, lat = latLonOf(pos).lat;
  return { ...v, pos, heading: bearingTangent(pos, 0), hour: 12, tilt: lat - Math.sign(lat || 1) * 67.5, camera: 'orbit' };
}

/**
 * A region's beacon from the sea, 8 m up, at midnight: about as far off as puts its light 17° up the frame once the sea
 * has fallen away over the curve, from the spot where the least land stands in the line of sight to it: bearings are
 * tried round from straight off the beacon's face.
 * `top` is how high over the sea the light shows, if not the height the simulation gives the beacon.
 */
export function beaconView(region: RegionId | number, top?: number): SceneSpec {
  const v = regionView(region), i = REGIONS.findIndex((r) => r.id === v.region), b = BEACONS[i], h = (top ?? b.height) - EYE;
  // the light, h over the eye and d out, stands (h - d² / 2R) / d up: 0.3 is about 17°
  const best = Math.max(110, R * (Math.sqrt(0.09 + (2 * h) / R) - 0.3));
  const { east, north } = frameAt(b.pos), face = Math.atan2(dot(b.facing, east), dot(b.facing, north));
  let pick = { pos: v.pos, miss: Infinity };
  for (let k = 0; k < 24; k++) {
    const out = bearingTangent(b.pos, face + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (Math.PI / 12));
    for (let d = best - 60; d < best + 160; d += 10) {
      const p = travel(b.pos, out, d).pos;
      if (d < 90 || (h - (d * d) / (2 * R)) / d > 0.45 || !isWater(p)) continue;
      // metres of land over the line of sight, then a little for straying from the best distance
      const miss = hidden(p, b.pos, d, h) + Math.abs(d - best) * 0.01;
      if (miss < pick.miss) pick = { pos: p, miss };
    }
  }
  return { ...v, pos: pick.pos, heading: towards(pick.pos, b.pos), hour: 23.5, tilt: nightTilt(pick.pos), height: BORDER_EYE };
}

/** A region's view at midnight from 8 m up, where a captain's eye is, with the poles tilted into the dark. */
export function nightView(region: RegionId | number): SceneSpec {
  const v = regionView(region);
  return { ...v, hour: 23.5, tilt: nightTilt(v.pos), height: BORDER_EYE };
}

/** How far the land stands over the line of sight from an eye at p to a light `h` m over it at q, `d` m off: 0 if clear. */
function hidden(p: V3, q: V3, d: number, h: number): number {
  const dir = towards(p, q);
  let most = 0;
  for (let x = 10; x < d - 20; x += 10) {
    most = Math.max(most, heightAt(travel(p, dir, x).pos) - (EYE + (h * x) / d - (x * (d - x)) / (2 * R) - 2));
  }
  return most;
}

/** Water at p, and on eight bearings `r` metres round it. */
function openWater(p: V3, r: number): boolean {
  if (!isWater(p)) return false;
  for (let k = 0; k < 8; k++) if (!isWater(travel(p, bearingTangent(p, (k * Math.PI) / 4), r).pos)) return false;
  return true;
}

/** Water every 15 m from p for `far` metres towards `to`. */
function clearTowards(p: V3, to: V3, far: number): boolean {
  const dir = towards(p, to);
  for (let d = 15; d <= far; d += 15) if (!isWater(travel(p, dir, d).pos)) return false;
  return true;
}

/** The eye camera stands 0.8 m over its target: this puts it 8 m over the sea. */
const BORDER_EYE = 7.2;
const EYE = BORDER_EYE + 0.8;

/**
 * A spot on the sea on the border between each pair of neighbours, 8 m up, once looking at the first region's landmark
 * and once at the second's, in the mid-morning. Each view stands on the line where the two regions meet, as near the
 * middle of their shared border as there is open water with 150 m of sea ahead, so it isn't a cliff face a few metres
 * off; failing that, open water, then any water.
 */
export function borderViews(): (SceneSpec & { a: string; b: string; facing: string; facingName: string; onWater: boolean })[] {
  const out: (SceneSpec & { a: string; b: string; facing: string; facingName: string; onWater: boolean })[] = [];
  for (let a = 0; a < REGIONS.length; a++) {
    for (const b of REGIONS[a].neighbours) {
      if (b < a) continue;
      // the middle of the two centres is on the border; walking across the a-b line keeps to it
      const ca = CENTRES[a], cb = CENTRES[b], mid = norm(vec(ca.x + cb.x, ca.y + cb.y, ca.z + cb.z));
      const along = norm(cross(mid, towards(mid, cb)));
      for (const f of [a, b]) {
        const tests = [(p: V3) => openWater(p, 25) && clearTowards(p, LANDMARKS[f].pos, 150), (p: V3) => openWater(p, 25), isWater];
        let spot = mid, onWater = false;
        for (const ok of tests) {
          for (let k = 0; k <= 40 && !onWater; k++) {
            const p = travel(mid, along, (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 12).pos, r = regionAt(p);
            if ((r === a || r === b) && ok(p)) { spot = p; onWater = true; }
          }
        }
        out.push({
          pos: spot, heading: towards(spot, LANDMARKS[f].pos), hour: 10.5, tilt: clampLat(latLonOf(spot).lat, 40), weather: 'clear',
          camera: 'eye', tide: 0, ship: false, height: BORDER_EYE, region: REGIONS[regionAt(spot)].id, regionName: REGIONS[regionAt(spot)].name,
          a: REGIONS[a].id, b: REGIONS[b].id, facing: REGIONS[f].id, facingName: REGIONS[f].name, onWater,
        });
      }
    }
  }
  return out;
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
    ...(s.ebb !== undefined && { ebb: s.ebb }),
    ...(s.height !== undefined && { height: s.height }),
    ...(s.fleet !== undefined && { fleet: s.fleet }),
    ...(s.systems && { systems: s.systems }),
  };
}

/** Where the lobby sits: your ship on open water off the Spice Isles' cove, in the late afternoon, with the low sun
 * over the camera's shoulder so the hull shows its paint rather than its silhouette. */
export const lobbyScene = (): SceneSpec => sceneFrom({ region: 'spiceIsles', hour: 16.5, tilt: 12, camera: 'chase', ship: true, heading: 120 });

/** The title: the same spot seen from orbit, so tapping in flies down to the lobby. */
export const titleScene = (): SceneSpec => ({ ...lobbyScene(), camera: 'orbit' });

/** Every region with its beacon, for the hook's listings. */
export const regionList = () => REGIONS.map((r, i) => ({ id: r.id, name: r.name, beacon: BEACONS[i]?.pos ?? null }));

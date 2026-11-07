// The planet's moving parts that aren't weather: the tide, the ground under the keel, the currents, and the sun.
import { PI, addScaled, datan2, dot, dsin, length, normalize, set, v3, type V3 } from './math.ts';
import { R, fromLatLon } from './sphere.ts';
import { TICK, type MatchState } from './state.ts';
import { DAY, TIDE } from './tables.ts';
import { DRAFT, FLOES, OBSTACLES, TIDE_AMPLITUDE, floeAt, floePos, heightAt, obstacleAt } from './world/index.ts';

/** The sea level in metres above mean, t seconds into the match. */
export const seaLevelAt = (t: number): number => TIDE_AMPLITUDE * dsin((2 * PI * t) / TIDE.period);

export const seaLevel = (state: MatchState): number => seaLevelAt(state.tick * TICK);

/** Too shallow for a keel drawing `draft` metres at the sea level `level`. */
export const shoal = (p: V3, level: number, draft = DRAFT): boolean => heightAt(p) > level - draft;

export const aground = (state: MatchState, p: V3, draft = DRAFT): boolean => shoal(p, seaLevel(state), draft);

// ---------------------------------------------------------------- what stands out of the water

const C = v3();

/** How far round their rings the Ice Crown's floes have ridden, in seconds of their drift. */
export const floeTime = (state: MatchState): number => state.tick * TICK;

/** Something standing out of the water at p that no hull passes through: a column, a log's wall, a floe. */
export const solidAt = (state: MatchState, p: V3): boolean => obstacleAt(p) >= 0 || floeAt(p, floeTime(state)) >= 0;

/** The way out of whatever solid stands at p, tangent to the sphere, or false if nothing does. */
export function solidNormal(state: MatchState, p: V3, out: V3): boolean {
  const o = obstacleAt(p);
  if (o >= 0) {
    const ob = OBSTACLES[o];
    set(out, p.x - ob.pos.x, p.y - ob.pos.y, p.z - ob.pos.z);
    if (ob.kind === 'log') {
      // off the wall: out of the side of the log, or back into the bore from inside it
      addScaled(out, out, ob.facing, -dot(out, ob.facing));
      if (length(out) * R < (ob.inner + ob.r) / 2) set(out, -out.x, -out.y, -out.z);
    }
  } else {
    const f = floeAt(p, floeTime(state));
    if (f < 0) return false;
    floePos(FLOES[f], floeTime(state), C);
    set(out, p.x - C.x, p.y - C.y, p.z - C.z);
  }
  addScaled(out, out, p, -dot(out, p));
  if (length(out) < 1e-12) return false;
  normalize(out);
  return true;
}

// ---------------------------------------------------------------- day and night

/** The hour at longitude 0. */
export const hourOf = (state: MatchState): number => (((state.hour + state.tick * TICK * DAY.rate) % 24) + 24) % 24;

/** The direction to the sun from the planet's centre. The tilt is the latitude the sun stands over. */
export function sunDir(state: MatchState, out: V3): V3 {
  return fromLatLon(state.tilt, ((12 - hourOf(state)) / 24) * 2 * PI, out);
}

const SUN = { x: 0, y: 0, z: 1 };
let sunTick = -1, sunOf: MatchState | null = null;

/** How high the sun stands over p: 1 overhead, 0 on the horizon, below 0 at night. */
export function sunHeight(state: MatchState, p: V3): number {
  if (sunOf !== state || sunTick !== state.tick) {
    sunDir(state, SUN);
    sunOf = state;
    sunTick = state.tick;
  }
  return dot(p, SUN);
}

export const isNight = (state: MatchState, p: V3): boolean => sunHeight(state, p) < DAY.dusk;

/** The local hour at p, for the interface: the hour at longitude 0, plus an hour for every 15 degrees east. */
export function localHour(state: MatchState, p: V3): number {
  const lon = datan2(-p.z, p.x);
  return (((hourOf(state) + (lon * 24) / (2 * PI)) % 24) + 24) % 24;
}

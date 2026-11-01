// The planet's moving parts that aren't weather: the tide, the ground under the keel, the currents, and the sun.
import { PI, datan2, dot, dsin, type V3 } from './math.ts';
import { fromLatLon } from './sphere.ts';
import { RULE } from './rules.ts';
import { TICK, type MatchState } from './state.ts';
import { DAY, TIDE } from './tables.ts';
import { DRAFT, TIDE_AMPLITUDE, currentAt as worldCurrent, heightAt } from './world/index.ts';

/** The sea level in metres above mean, t seconds into the match. */
export const seaLevelAt = (t: number): number => TIDE_AMPLITUDE * dsin((2 * PI * t) / TIDE.period);

export const seaLevel = (state: MatchState): number => seaLevelAt(state.tick * TICK);

/** Too shallow for a keel drawing `draft` metres at the sea level `level`. */
export const shoal = (p: V3, level: number, draft = DRAFT): boolean => heightAt(p) > level - draft;

export const aground = (state: MatchState, p: V3, draft = DRAFT): boolean => shoal(p, seaLevel(state), draft);

/** The surface current at p, m/s, tangent to the sphere. */
export const currentAt = (p: V3, out: V3): V3 => worldCurrent(p, out);

// ---------------------------------------------------------------- day and night

/** The hour at longitude 0. */
export const hourOf = (state: MatchState): number => (((state.hour + state.tick * TICK * DAY.rate) % 24) + 24) % 24;

/** The direction to the sun from the planet's centre. The tilt is the latitude the sun stands over. */
export function sunDir(state: MatchState, out: V3): V3 {
  return fromLatLon(state.tilt, ((12 - hourOf(state)) / 24) * 2 * PI, out);
}

/** False under the night-only rule: the sun never rises. */
export const sunUp = (state: MatchState): boolean => state.rule !== RULE.nightOnly;

const SUN = { x: 0, y: 0, z: 1 };
let sunTick = -1, sunOf: MatchState | null = null;

/** How high the sun stands over p: 1 overhead, 0 on the horizon, below 0 at night. */
export function sunHeight(state: MatchState, p: V3): number {
  if (!sunUp(state)) return -1;
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

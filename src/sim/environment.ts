// The planet's moving parts that aren't weather: the tide, the ground under the keel, the currents, and the sun.
import { PI, addScaled, datan2, dot, dsin, length, normalize, set, v3, type V3 } from './math.ts';
import { R, apart, fromLatLon } from './sphere.ts';
import { RULE } from './rules.ts';
import { EVENT_STATE, TICK, type MatchState } from './state.ts';
import { DAY, REGION_EVENT, TIDE, WEATHER } from './tables.ts';
import {
  CURRENTS, DRAFT, FLOES, OBSTACLES, REGION_EVENTS, TIDE_AMPLITUDE, blockAt, currentAt as worldCurrent, floeAt, floePos, heightAt, liftOf,
  obstacleAt, regionIndex, roofAt,
} from './world/index.ts';

/** The sea level in metres above mean, t seconds into the match. */
export const seaLevelAt = (t: number): number => TIDE_AMPLITUDE * dsin((2 * PI * t) / TIDE.period);

export const seaLevel = (state: MatchState): number => seaLevelAt(state.tick * TICK);

/** Too shallow for a keel drawing `draft` metres at the sea level `level`. */
export const shoal = (p: V3, level: number, draft = DRAFT): boolean => heightAt(p) > level - draft;

// ---------------------------------------------------------------- the regions' events, as the sea feels them

/** The regions whose events the rest of the simulation reaches for by name. */
export const EVENT_REGION = {
  ice: regionIndex('iceCrown'), fjords: regionIndex('fjords'), mist: regionIndex('mistwood'), spires: regionIndex('spires'),
  narrows: regionIndex('narrows'), basalt: regionIndex('basaltStacks'), kelp: regionIndex('kelpShallows'), blossom: regionIndex('blossomRun'),
  glass: regionIndex('glassSea'), jade: regionIndex('jadeShoals'), coral: regionIndex('coralAtolls'), spice: regionIndex('spiceIsles'),
  fire: regionIndex('fireArchipelago'), weeping: regionIndex('weepingIsle'), mangrove: regionIndex('mangroveLabyrinth'),
  maelstrom: regionIndex('maelstrom'),
} as const;

const smooth = (a: number, b: number, x: number): number => {
  const t = x <= a ? 0 : x >= b ? 1 : (x - a) / (b - a);
  return t * t * (3 - 2 * t);
};

/** How strongly region ri's event acts at match time `time` (seconds): nothing before or after its run, and it builds up and dies down. */
export function strengthAt(state: MatchState, ri: number, time: number): number {
  const ev = state.regionEvents[ri];
  if (ev === undefined) return 0;
  const e = time - ev.at;
  if (e < 0 || e >= ev.run) return 0;
  const ramp = REGION_EVENT.ramp[ri];
  return ramp > 0 ? smooth(0, ramp, e) * smooth(0, ramp, ev.run - e) : 1;
}

export const eventStrength = (state: MatchState, ri: number): number => strengthAt(state, ri, state.tick * TICK);

const LIFTERS = REGION_EVENTS.filter((e) => e.lift.length > 0).map((e) => e.region);
const BLOCKERS = REGION_EVENTS.filter((e) => e.block !== null).map((e) => e.region);
const ROOFED = REGION_EVENTS.filter((e) => e.roofs.length > 0).map((e) => e.region);

/** How far the regions' events have raised the sea at p, metres; negative where they draw it down. */
export function liftAt(state: MatchState, p: V3): number {
  let h = 0;
  for (const ri of LIFTERS) {
    const s = eventStrength(state, ri);
    if (s > 0) h += s * liftOf(ri, state.regionEvents[ri].k, p);
  }
  return h;
}

/** The sea level at p: the tide, and whatever the regions' events have done to the water there. */
export const levelAt = (state: MatchState, p: V3): number => seaLevel(state) + liftAt(state, p);

export const aground = (state: MatchState, p: V3, draft = DRAFT): boolean => shoal(p, levelAt(state, p), draft);

/** Whether what region ri's event drops across the water lies there now: while it runs, or for good once it has fallen if it stays. */
export function blockDown(state: MatchState, ri: number): boolean {
  const ev = state.regionEvents[ri], b = REGION_EVENTS[ri].block;
  if (ev === undefined || b === null) return false;
  return ev.state === EVENT_STATE.running || (b.stays && ev.state === EVENT_STATE.over);
}

/** Whether region ri's roof `o` stands too low over the sea at p for a ship to pass under it. */
const roofShut = (state: MatchState, ri: number, o: number, p: V3): boolean =>
  levelAt(state, p) > REGION_EVENTS[ri].roofs[o].under - REGION_EVENT.air;

/** What the regions' events stand in the water at p: the region whose fallen rock or roof is there, or -1. */
export function eventSolidAt(state: MatchState, p: V3): number {
  for (const ri of BLOCKERS) if (blockDown(state, ri) && blockAt(ri, state.regionEvents[ri].k, p)) return ri;
  for (const ri of ROOFED) {
    const o = roofAt(ri, p);
    if (o >= 0 && roofShut(state, ri, o, p)) return ri;
  }
  return -1;
}

const C = v3();

/** The way out from under an event's rock at p, along the surface: square off a fallen bar, out of a disc, or along a roof to its nearer end. */
function eventNormal(state: MatchState, ri: number, p: V3, out: V3): void {
  const e = REGION_EVENTS[ri], o = roofAt(ri, p);
  if (o >= 0 && roofShut(state, ri, o, p)) {
    const roof = e.roofs[o], t = dot(set(C, p.x - roof.pos.x, p.y - roof.pos.y, p.z - roof.pos.z), roof.facing);
    set(out, roof.facing.x, roof.facing.y, roof.facing.z);
    if (t < 0) set(out, -out.x, -out.y, -out.z);
    return;
  }
  // off the nearest point of the fallen bar's spine (a disc's spine is its centre)
  const k = state.regionEvents[ri].k, c = e.spots[k], f = e.facings[k], half = (e.block?.length ?? 0) / 2 / R;
  set(out, p.x - c.x, p.y - c.y, p.z - c.z);
  const t = dot(out, f);
  addScaled(out, out, f, -(t < -half ? -half : t > half ? half : t));
}

// ---------------------------------------------------------------- what stands out of the water

/** How far round their rings the Ice Crown's floes have ridden, in seconds of their ordinary drift. */
export const floeTime = (state: MatchState): number => state.tick * TICK + state.floeT;

/** Something standing out of the water at p that no hull passes through: a column, a log's wall, a floe, an event's rock. */
export const solidAt = (state: MatchState, p: V3): boolean =>
  obstacleAt(p) >= 0 || floeAt(p, floeTime(state)) >= 0 || eventSolidAt(state, p) >= 0;

/** The way out of whatever solid stands at p, tangent to the sphere, or false if nothing does. */
export function solidNormal(state: MatchState, p: V3, out: V3): boolean {
  const o = obstacleAt(p), ev = o >= 0 ? -1 : eventSolidAt(state, p);
  if (ev >= 0) eventNormal(state, ev, p, out);
  else if (o >= 0) {
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

const LANE_SCALE = new Float64Array(CURRENTS.length).fill(1);
const SURGING = CURRENTS.map((l, i) => (l.region === EVENT_REGION.fjords || l.region === EVENT_REGION.blossom ? i : -1)).filter((i) => i >= 0);

/** The surface current at p, m/s, tangent to the sphere, with the lanes in spate and the vortex wound up by their regions' events. */
export function currentAt(state: MatchState, p: V3, out: V3): V3 {
  for (const i of SURGING) LANE_SCALE[i] = 1 + (REGION_EVENT.surge - 1) * eventStrength(state, CURRENTS[i].region);
  return worldCurrent(p, out, LANE_SCALE, 1 + (REGION_EVENT.vortex - 1) * eventStrength(state, EVENT_REGION.maelstrom));
}

/** How deep p sits in a bank of radius r round `at`: 1 in its core, falling to 0 at its edge. */
function bank(p: V3, at: V3, r: number): number {
  const d = apart(p, at);
  return d >= r ? 0 : Math.min(1, (1 - d / r) / (1 - WEATHER.core));
}

/** The regions' events' weather at p, folded into a sky's fog, rain and ash (each the deeper of the two). */
export function eventSky(state: MatchState, p: V3, out: { fog: number; rain: number; ash: number }): void {
  const { mist, cloudburst, eruption } = REGION_EVENT, ev = state.regionEvents;
  let s = eventStrength(state, EVENT_REGION.mist);
  if (s > 0) out.fog = Math.max(out.fog, s * bank(p, ev[EVENT_REGION.mist].spot, mist.from + (mist.r - mist.from) * s));
  s = eventStrength(state, EVENT_REGION.weeping);
  if (s > 0) {
    out.fog = Math.max(out.fog, s * bank(p, ev[EVENT_REGION.weeping].spot, cloudburst.fog));
    out.rain = Math.max(out.rain, s * bank(p, ev[EVENT_REGION.weeping].spot, cloudburst.rain));
  }
  s = eventStrength(state, EVENT_REGION.fire);
  if (s > 0) out.ash = Math.max(out.ash, s * bank(p, ev[EVENT_REGION.fire].spot, eruption.ash.r));
}

/** The share of her speed the kelp bloom leaves a ship at p: 1 outside it. */
export function bloomAt(state: MatchState, p: V3): number {
  const s = eventStrength(state, EVENT_REGION.kelp);
  if (s <= 0) return 1;
  const r = REGION_EVENT.bloom.r * s, d = apart(p, state.regionEvents[EVENT_REGION.kelp].spot);
  return 1 - (1 - REGION_EVENT.bloom.slow) * (1 - smooth(r - 10, r, d));
}

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

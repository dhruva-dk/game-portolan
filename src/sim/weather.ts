// The sky over a match: the weather the seed sends drifting across the planet with the wind — fog banks, rain
// squalls and calms, fair between — what it does wherever it lies (to the wind, the sea and sight), what it hides,
// and the hour, with the sun it sets in the sky. The spells live in the match state; environment.ts brews them.
import { PI, dcos, dot, dsin, set, type V3 } from './math.ts';
import { R, TERRITORY, cellOf } from './sphere.ts';
import { TICK, type MatchState, type Spell } from './state.ts';
import { DAY, SPELL, WEATHER } from './tables.ts';
import { ZONE, type Geography } from './world/geography.ts';
import { REGIONS } from './world/regions.ts';

/** How far through its life a spell stands, 0…1: rising from nothing, full, then fading away; 0 for a fair spell. */
export function vigour(spell: Spell): number {
  if (spell.kind === SPELL.fair) return 0;
  const x = Math.max(0, Math.min(1, spell.age / WEATHER.rise, (spell.life - spell.age) / WEATHER.rise));
  return x * x * (3 - 2 * x);
}

/** How deep p lies in a spell, 0…1: its vigour over its core, thinning to nothing at its edge (spell.r, u). */
export function depthIn(spell: Spell, p: V3): number {
  if (spell.kind === SPELL.fair) return 0;
  const q = 1 - (R * R * (2 - 2 * dot(p, spell.at))) / (spell.r * spell.r);
  return q > 0 ? vigour(spell) * Math.min(1, q * WEATHER.core) : 0;
}

/** The weather at a point: what skyAt fills. */
export interface Sky {
  /** 0…1: how deep the point lies in the deepest fog bank, squall and calm over it. */
  fog: number;
  squall: number;
  calm: number;
  /** Factor on the wind's strength: up in a squall, down in a calm. */
  wind: number;
  /** Factor on how far a lookout sees: short in fog, shorter in a squall. */
  sight: number;
  /** The sea's roughness: 1 fair, rougher in a squall, 0 in a dead calm — flat as a mirror. */
  rough: number;
}

export const newSky = (): Sky => ({ fog: 0, squall: 0, calm: 0, wind: 1, sight: 1, rough: 1 });

/** The weather at p now: the renderer's sea and sky, the wind (windAt) and the lookouts' sight (WP8) read it. */
export function skyAt(state: MatchState, p: V3, out: Sky): Sky {
  let fog = 0, squall = 0, calm = 0;
  for (const spell of state.weather) {
    const d = depthIn(spell, p);
    if (d === 0) continue;
    if (spell.kind === SPELL.fog) fog = Math.max(fog, d);
    else if (spell.kind === SPELL.squall) squall = Math.max(squall, d);
    else calm = Math.max(calm, d);
  }
  const { fog: f, squall: s, calm: c } = WEATHER;
  out.fog = fog;
  out.squall = squall;
  out.calm = calm;
  out.wind = (1 + s.wind * squall) * (1 - c.drop * calm);
  out.sight = (1 - (1 - f.sight) * fog) * (1 - (1 - s.sight) * squall);
  out.rough = (1 + (s.rough - 1) * squall) * (1 - calm);
  return out;
}

/** Whether p lies in fog deep enough to hide what is there; a trail laid there never shows on rival charts (WP7). */
export function inFog(state: MatchState, p: V3): boolean {
  for (const spell of state.weather) if (spell.kind === SPELL.fog && depthIn(spell, p) >= WEATHER.veil) return true;
  return false;
}

/** Whether p lies in kelp that hides a ship (the Kelp Shallows). */
function inHidingKelp(geo: Geography, p: V3): boolean {
  const c = cellOf(TERRITORY, p);
  return (geo.zones[c] & ZONE.kelp) !== 0 && REGIONS[geo.region[c]].mechanics.kelp?.hide === true;
}

/**
 * Whether a ship or trail at `at` is hidden from a lookout at `from` (the sight system's test, WP8): it lies deep in a
 * fog bank the lookout is not inside, or in hiding kelp while the lookout is out of the kelp. From inside, both see out.
 */
export function veiled(geo: Geography, state: MatchState, from: V3, at: V3): boolean {
  for (const spell of state.weather) {
    if (spell.kind === SPELL.fog && depthIn(spell, at) >= WEATHER.veil && depthIn(spell, from) < WEATHER.veil) return true;
  }
  return inHidingKelp(geo, at) && (geo.zones[cellOf(TERRITORY, from)] & ZONE.kelp) === 0;
}

// ---------------------------------------------------------------------------------------------------------------
// The hour

/** The hour now, 0 ≤ h < 24: the hour the match started at and the sun's steady advance. */
export const hourOf = (state: MatchState): number => (state.hour + state.tick * TICK * DAY.rate) % 24;

const LEAN_UP = dcos(DAY.tilt), LEAN_SOUTH = dsin(DAY.tilt);

/**
 * The sun's direction at an hour in a local sky frame (x east, y north, z up), into `out`: rising due east at
 * DAY.sunrise, standing at noon 90° − DAY.tilt high toward the south, setting due west, below the horizon at night.
 */
export function sunDir(hour: number, out: V3): V3 {
  const a = (2 * PI * (hour - DAY.sunrise)) / 24, up = dsin(a);
  return set(out, dcos(a), -up * LEAN_SOUTH, up * LEAN_UP);
}

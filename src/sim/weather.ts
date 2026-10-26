import { PI, dcos, dot, dsin, set, type V3 } from './math.ts';
import { R, TERRITORY, cellOf } from './sphere.ts';
import { TICK, type MatchState, type Spell } from './state.ts';
import { DAY, SPELL, WEATHER } from './tables.ts';
import { ZONE, type Geography } from './world/geography.ts';
import { REGIONS } from './world/regions.ts';

export function vigour(spell: Spell): number {
  if (spell.kind === SPELL.fair) return 0;
  const x = Math.max(0, Math.min(1, spell.age / WEATHER.rise, (spell.life - spell.age) / WEATHER.rise));
  return x * x * (3 - 2 * x);
}

export function depthIn(spell: Spell, p: V3): number {
  if (spell.kind === SPELL.fair) return 0;
  const q = 1 - (R * R * (2 - 2 * dot(p, spell.at))) / (spell.r * spell.r);
  return q > 0 ? vigour(spell) * Math.min(1, q * WEATHER.core) : 0;
}

export interface Sky {
  fog: number;
  squall: number;
  calm: number;
  wind: number;
  sight: number;
  rough: number;
}

export const newSky = (): Sky => ({ fog: 0, squall: 0, calm: 0, wind: 1, sight: 1, rough: 1 });

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

export function inFog(state: MatchState, p: V3): boolean {
  for (const spell of state.weather) if (spell.kind === SPELL.fog && depthIn(spell, p) >= WEATHER.veil) return true;
  return false;
}

function inHidingKelp(geo: Geography, p: V3): boolean {
  const c = cellOf(TERRITORY, p);
  return (geo.zones[c] & ZONE.kelp) !== 0 && REGIONS[geo.region[c]].mechanics.kelp?.hide === true;
}

export function veiled(geo: Geography, state: MatchState, from: V3, at: V3): boolean {
  for (const spell of state.weather) {
    if (spell.kind === SPELL.fog && depthIn(spell, at) >= WEATHER.veil && depthIn(spell, from) < WEATHER.veil) return true;
  }
  return inHidingKelp(geo, at) && (geo.zones[cellOf(TERRITORY, from)] & ZONE.kelp) === 0;
}

export const hourOf = (state: MatchState): number => (state.hour + state.tick * TICK * DAY.rate) % 24;

const LEAN_UP = dcos(DAY.tilt), LEAN_SOUTH = dsin(DAY.tilt);

export function sunDir(hour: number, out: V3): V3 {
  const a = (2 * PI * (hour - DAY.sunrise)) / 24, up = dsin(a);
  return set(out, dcos(a), -up * LEAN_SOUTH, up * LEAN_UP);
}

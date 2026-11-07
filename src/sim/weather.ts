// Weather: 3–5 systems drift over the planet, each one of six kinds with one clear effect.
// Fog shortens the sightline, rain makes the wind gusty and the water rough, thunder throws lightning at ships
// in the open, a calm kills the wind, snow (only near the Ice Crown) ices the rigging, and ash (only downwind of
// the Fire Archipelago) burns ships that stay in it. Systems form over a region mostly as that region's own kinds.
import { hurt } from './harm.ts';
import { mastHeight, struckMast } from './parts.ts';
import { PI, addScaled, dot, dsin, normalize, rngDir, rngFloat, rngInt, rngRange, set, v3, type Rng, type V3 } from './math.ts';
import { nav, navCell } from './nav.ts';
import { apart, along, tangentAt } from './sphere.ts';
import { CAUSE, EVENT, PHASE, SHIPS, STREAM, TICK, emit, elapse, type MatchState, type WeatherSystem } from './state.ts';
import { calmNow } from './storm.ts';
import { WEATHER, WEATHER_KIND, WEATHER_NAMES } from './tables.ts';
import { breeze, spinAround } from './wind.ts';
import { CENTRES, REGIONS, regionAt, type WeatherKind } from './world/index.ts';

const ICE_CROWN = REGIONS.findIndex((r) => r.id === 'iceCrown');
const FIRE = REGIONS.findIndex((r) => r.id === 'fireArchipelago');
const FIRE_AT = CENTRES[FIRE];
/** How far ash can drift from the Fire Archipelago before it settles. */
const ASH_REACH = 360;

/** Each region's own kinds, as indices; 'clear' means no system. */
const OWN: readonly number[][] = REGIONS.map((r) => r.weather.filter((w): w is Exclude<WeatherKind, 'clear'> => w !== 'clear').map((w) => WEATHER_KIND[w]));
const OPEN_KINDS = [WEATHER_KIND.fog, WEATHER_KIND.rain, WEATHER_KIND.thunder, WEATHER_KIND.calm];

export function newWeather(): WeatherSystem[] {
  return Array.from({ length: WEATHER.slots }, () => ({
    kind: -1, at: v3(0, 0, 1), v: v3(), r: 0, age: 0, life: 0, gap: 0, strike: 0, bolt: v3(0, 0, 1), target: -1,
  }));
}

const smooth = (x: number): number => x * x * (3 - 2 * x);

/** How fully a system has formed: it grows in and fades out. */
export function vigour(s: WeatherSystem): number {
  if (s.kind < 0) return 0;
  return smooth(Math.max(0, Math.min(1, s.age / WEATHER.rise, (s.life - s.age) / WEATHER.rise)));
}

/** How deep p sits inside a system: 1 in its core, falling to 0 at its edge. */
export function depthIn(s: WeatherSystem, p: V3): number {
  if (s.kind < 0) return 0;
  const d = apart(p, s.at);
  if (d >= s.r) return 0;
  return vigour(s) * Math.min(1, (1 - d / s.r) / (1 - WEATHER.core));
}

export interface Sky {
  fog: number;
  rain: number;
  thunder: number;
  calm: number;
  snow: number;
  ash: number;
  /** Multipliers: sightline, wind and how rough the water is. */
  sight: number;
  wind: number;
  rough: number;
}

export function newSky(): Sky {
  return { fog: 0, rain: 0, thunder: 0, calm: 0, snow: 0, ash: 0, sight: 1, wind: 1, rough: 1 };
}

export function skyAt(state: MatchState, p: V3, out: Sky): Sky {
  out.fog = out.rain = out.thunder = out.calm = out.snow = out.ash = 0;
  for (const s of state.weather) {
    const d = depthIn(s, p);
    if (d === 0) continue;
    switch (s.kind) {
      case WEATHER_KIND.fog: out.fog = Math.max(out.fog, d); break;
      case WEATHER_KIND.rain: out.rain = Math.max(out.rain, d); break;
      case WEATHER_KIND.thunder: out.thunder = Math.max(out.thunder, d); break;
      case WEATHER_KIND.calm: out.calm = Math.max(out.calm, d); break;
      case WEATHER_KIND.snow: out.snow = Math.max(out.snow, d); break;
      default: out.ash = Math.max(out.ash, d);
    }
  }
  const wet = Math.max(out.rain, out.thunder), { fog, rain, calm } = WEATHER;
  out.sight = 1 - (1 - fog.sight) * out.fog;
  out.wind = (1 + (rain.wind - 1) * wet) * (1 - (1 - calm.wind) * out.calm);
  out.rough = 1 + (rain.rough - 1) * wet;
  return out;
}

const SPIN = v3();

/** Rain and thunder spin the wind round their centres. */
export function bend(state: MatchState, p: V3, v: V3): void {
  for (const s of state.weather) {
    if (s.kind !== WEATHER_KIND.rain && s.kind !== WEATHER_KIND.thunder) continue;
    const d = depthIn(s, p);
    if (d > 0) addScaled(v, v, spinAround(s.at, p, SPIN), WEATHER.rain.swirl * d);
  }
}

/** Ships inside a fog bank deep enough drop off the map. */
export function inFog(state: MatchState, p: V3): boolean {
  for (const s of state.weather) if (s.kind === WEATHER_KIND.fog && depthIn(s, p) >= 0.5) return true;
  return false;
}

// ---------------------------------------------------------------- forming and drifting

const DRIFT = v3(), T = v3();

export function brew(state: MatchState): void {
  const rng = state.rng[STREAM.weather];
  let active = 0;
  for (const s of state.weather) if (s.kind >= 0) active++;
  for (let k = 0; k < state.weather.length; k++) {
    const s = state.weather[k];
    if (s.kind < 0) {
      s.gap -= TICK;
      if (s.gap <= 0 || active < WEATHER.least) {
        form(state, rng, s);
        active++;
      }
      continue;
    }
    s.age += TICK;
    if (s.age >= s.life) {
      emit(state, EVENT.weatherEnds, -1, -1, s.at, { item: s.kind, amount: k });
      s.kind = -1;
      s.gap = rngRange(rng, WEATHER.gap[0], WEATHER.gap[1]);
      active--;
      continue;
    }
    if ((state.tick + k) % 30 === 0) drift(state, s);
    const v = Math.sqrt(dot(s.v, s.v));
    if (v > 0) {
      normalize(set(T, s.v.x / v, s.v.y / v, s.v.z / v));
      along(s.at, T, v * TICK, s.at);
      normalize(addScaled(s.v, s.v, s.at, -dot(s.v, s.at)));
      set(s.v, s.v.x * v, s.v.y * v, s.v.z * v);
    }
    // snow lives only near the Ice Crown, ash only near the Fire Archipelago: outside, they fade
    const strays = (s.kind === WEATHER_KIND.snow && s.at.y < snowLine()) || (s.kind === WEATHER_KIND.ash && apart(s.at, FIRE_AT) > ASH_REACH);
    if (strays && s.life - s.age > WEATHER.rise) s.life = s.age + WEATHER.rise;
    if (s.kind === WEATHER_KIND.thunder) thunder(state, rng, s);
  }
  // one that ended this tick is replaced at once when it leaves fewer than the least
  for (let k = 0; k < state.weather.length && active < WEATHER.least; k++) {
    if (state.weather[k].kind >= 0) continue;
    form(state, rng, state.weather[k]);
    active++;
  }
}

const SNOW_LINE = dsin(WEATHER.snow.lat);
const snowLine = (): number => SNOW_LINE;

function form(state: MatchState, rng: Rng, s: WeatherSystem): void {
  const first = state.tick === 0;
  rngDir(rng, s.at);
  // later ones form over the calm this often, where the fleet is, so weather comes to the ships and doesn't only pass
  // over empty sea (with them all over the planet, a ship spent under 5% of a match in any)
  if (!first && rngFloat(rng) < WEATHER.gather) {
    const calm = calmNow(state);
    tangentAt(calm.at, rngRange(rng, -PI, PI), T);
    along(calm.at, T, 0.85 * calm.r * Math.sqrt(rngFloat(rng)), s.at);
  }
  const region = regionAt(s.at), own = OWN[region];
  let kind: number;
  if (own.length > 0 && rngFloat(rng) < WEATHER.own) kind = own[rngInt(rng, own.length)];
  else kind = OPEN_KINDS[rngInt(rng, OPEN_KINDS.length)];
  if (own.length === 0 && region !== ICE_CROWN && region !== FIRE && rngFloat(rng) < WEATHER.own) {
    // a clear region mostly stays clear: put this system over another region's sea instead
    rngDir(rng, s.at);
    const other = OWN[regionAt(s.at)];
    if (other.length > 0) kind = other[rngInt(rng, other.length)];
  }
  if (kind === WEATHER_KIND.ash) {
    // ash rises from Cinder Peak and drifts off downwind from there
    normalize(addScaled(T, s.at, FIRE_AT, -dot(s.at, FIRE_AT)));
    along(FIRE_AT, T, rngRange(rng, 0, 60), s.at);
  } else if (kind === WEATHER_KIND.snow && s.at.y < snowLine()) {
    set(s.at, s.at.x * 0.2, 1, s.at.z * 0.2);
    normalize(s.at);
  }
  s.kind = kind;
  s.r = rngRange(rng, WEATHER.r[0], WEATHER.r[1]);
  s.life = rngRange(rng, WEATHER.life[0], WEATHER.life[1]);
  s.age = first ? rngRange(rng, WEATHER.rise, s.life - WEATHER.rise) : 0;
  s.strike = rngRange(rng, WEATHER.thunder.every[0], WEATHER.thunder.every[1]);
  s.target = -1;
  drift(state, s);
  emit(state, EVENT.weatherForms, -1, -1, s.at, { item: kind, amount: s.r });
}

function drift(state: MatchState, s: WeatherSystem): void {
  breeze(state, s.at, DRIFT);
  set(s.v, DRIFT.x * WEATHER.drift, DRIFT.y * WEATHER.drift, DRIFT.z * WEATHER.drift);
}

/** Lightning: a warning glow over a ship in the open, then the strike where the glow was. */
function thunder(state: MatchState, rng: Rng, s: WeatherSystem): void {
  s.strike -= TICK;
  if (s.strike > 0) return;
  const { thunder: t } = WEATHER;
  if (s.target >= 0) {
    emit(state, EVENT.lightning, s.target, -1, s.bolt, { amount: t.damage });
    for (let j = 0; j < SHIPS; j++) {
      const ship = state.ships[j];
      if (ship.phase !== PHASE.sea || apart(ship.pos, s.bolt) >= t.reach) continue;
      hurt(state, j, t.damage, -1, CAUSE.lightning, ship.pos, 10);
      if (j === s.target) struckMast(state, j);
    }
    s.target = -1;
    s.strike = rngRange(rng, t.every[0], t.every[1]);
    return;
  }
  // it finds the tallest mast: a jury mast draws it less often, and a ship with hers down not at all
  const n = nav();
  let pick = -1, seen = 0;
  for (let j = 0; j < SHIPS; j++) {
    const ship = state.ships[j], tall = mastHeight(ship);
    if (ship.phase !== PHASE.sea || tall <= 0 || depthIn(s, ship.pos) < 0.3 || n.clear[navCell(ship.pos)] < 4) continue;
    const weight = Math.round(tall * 4);
    seen += weight;
    if (rngInt(rng, seen) < weight) pick = j;
  }
  if (pick < 0) {
    s.strike = 1;
    return;
  }
  s.target = pick;
  set(s.bolt, state.ships[pick].pos.x, state.ships[pick].pos.y, state.ships[pick].pos.z);
  s.strike = t.warn;
  emit(state, EVENT.lightningWarn, pick, -1, s.bolt, { amount: t.warn });
}

// ---------------------------------------------------------------- what weather does to ships

const SKY = newSky();

/** Ice builds in the snow and melts out of it; embers burn ships that stay in the ash. */
export function weatherOnShips(state: MatchState): void {
  const { snow, ash } = WEATHER;
  for (let i = 0; i < SHIPS; i++) {
    const ship = state.ships[i];
    if (ship.phase !== PHASE.sea) continue;
    skyAt(state, ship.pos, SKY);
    if (SKY.snow > 0.3) ship.ice = Math.min(1, ship.ice + (SKY.snow * TICK) / snow.build);
    else ship.ice = Math.max(0, ship.ice - TICK / snow.melt);
    if (SKY.ash > 0.3) {
      ship.ash += TICK;
      if (ship.ash >= ash.after) hurt(state, i, ash.rate * TICK, -1, CAUSE.ash, ship.pos, 2);
    } else ship.ash = elapse(ship.ash);
  }
}

export const weatherName = (kind: number): string => WEATHER_NAMES[kind] ?? 'clear';


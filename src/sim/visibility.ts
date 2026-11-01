import type { Sea } from './environment.ts';
import { dcos, dot, v3, type V3 } from './math.ts';
import { R, TERRITORY, cellDir, horizonDistance } from './sphere.ts';
import { EVENT, SHIPS, afloat, type MatchState } from './state.ts';
import { calmNow } from './storm.ts';
import { FITTING, FORMS, SIGHT, SLOT, STORM, TIERS } from './tables.ts';
import { beamMarks, intruders, unseen } from './territory.ts';
import { inFog, newSky, skyAt, veiled } from './weather.ts';

export interface Eye {
  at: V3;
  height: number;
  dive: number;
  scouts: boolean;
}

export interface Sight {
  ships: number;
  hulls: number;
  marks: number;
  range: number;
  gulls: number;
}

export const newSight = (): Sight => ({ ships: 0, hulls: 0, marks: 0, range: 0, gulls: 0 });

const EYE = FORMS.map((_, f) => Array.from({ length: TIERS + 1 }, (_, k) => horizonDistance(SIGHT.eye[f] + (k > 0 ? SIGHT.crowsNest[k - 1] : 0))));
const MAST = FORMS.map((_, f) => horizonDistance(SIGHT.mast[f]));
const HULL = FORMS.map((_, f) => horizonDistance(SIGHT.hull[f]));
const FLARE_COS = dcos(SIGHT.flare / R);

export function eyeReach(state: MatchState, i: number): number {
  const ship = state.ships[i], look = ship.fittings[SLOT.lookout];
  return EYE[ship.form][look.kind === FITTING.crowsNest ? 1 + look.tier : 0];
}

const SKY = newSky(), AIR = new Float64Array(SHIPS), REACH = new Float64Array(SHIPS), WING = new Float64Array(SHIPS), CELL = v3();

function spot(sea: Sea, state: MatchState, from: V3, reach: number, air: number, j: number): number {
  const ship = state.ships[j], c = dot(from, ship.pos);
  if (c < dcos(Math.min(air, reach + MAST[ship.form]) / R) || veiled(sea.geo, state, from, ship.pos)) return 0;
  return c >= dcos(Math.min(air, reach + HULL[ship.form]) / R) ? 3 : 2;
}

export function survey(sea: Sea, state: MatchState, out: Sight[], gulls?: readonly (Eye | null)[]): Sight[] {
  const calm = calmNow(state);
  let hidden = 0;
  for (let i = 0; i < SHIPS; i++) {
    const ship = state.ships[i];
    if (!afloat(ship) || ship.flask > 0 || unseen(sea, state, i)) hidden |= 1 << i;
    AIR[i] = SIGHT.clear * skyAt(state, ship.pos, SKY).sight * (dot(ship.pos, calm.at) < calm.cos ? STORM.sight : 1);
    REACH[i] = eyeReach(state, i);
    const gull = gulls?.[i];
    WING[i] = gull ? horizonDistance(gull.height) : 0;
  }
  for (let i = 0; i < SHIPS; i++) {
    const o = out[i], ship = state.ships[i], gull = gulls?.[i] ?? null;
    o.ships = o.hulls = o.marks = o.gulls = 0;
    o.range = AIR[i];
    if (!afloat(ship)) {
      o.range = 0;
      continue;
    }
    const scout = gull?.scouts ? gull : null, scoutReach = scout ? horizonDistance(scout.height) : 0;
    for (let j = 0; j < SHIPS; j++) {
      if (j === i || (hidden & (1 << j)) !== 0) continue;
      const air = Math.min(AIR[i], AIR[j]);
      const seen = spot(sea, state, ship.pos, REACH[i], air, j) | (scout ? spot(sea, state, scout.at, scoutReach, air, j) : 0);
      if (seen !== 0) o.ships |= 1 << j;
      if (seen === 3) o.hulls |= 1 << j;
      if (ship.flare > 0 && dot(ship.pos, state.ships[j].pos) >= FLARE_COS) o.marks |= 1 << j;
    }
    for (let j = 0; j < SHIPS; j++) {
      const g = j === i ? null : gulls?.[j];
      if (g && dot(ship.pos, g.at) >= dcos(Math.min(AIR[i], REACH[i] + WING[j]) / R) && !veiled(sea.geo, state, ship.pos, g.at)) o.gulls |= 1 << j;
    }
    if (gull && gull.dive >= 0 && gull.dive !== i) o.marks |= 1 << gull.dive;
    o.marks = (o.marks | intruders(state, i) | beamMarks(sea, state, i)) & ~hidden;
  }
  return out;
}

export function trailSeen(sea: Sea, state: MatchState, viewer: number, owner: number, k: number): boolean {
  if (viewer === owner) return true;
  const ship = state.ships[owner];
  if (ship.fogged[k] || ship.flask > 0) return false;
  return !veiled(sea.geo, state, state.ships[viewer].pos, cellDir(TERRITORY, ship.laid[k], CELL));
}

export function noteFog(state: MatchState): void {
  for (const e of state.events) if (e.kind === EVENT.loop || e.kind === EVENT.broken) state.ships[e.ship].fogged.length = 0;
  for (const ship of state.ships) {
    const laid = ship.laid.length, fogged = ship.fogged;
    if (fogged.length > laid) fogged.length = 0;
    if (fogged.length === laid) continue;
    const fog = inFog(state, ship.pos);
    while (fogged.length < laid) fogged.push(fog);
  }
}

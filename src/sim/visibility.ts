// Sight (PROMPT.md: Wind, currents, tides, and time — Weather; Fittings — the crow's nest; Consumables — the fog flask
// and the flare; How captains think). What each ship can see: rivals over the curve of the sea by the lookout's eye
// height and theirs (the masthead shows first, then the hull), through the air the weather and the storm leave, unless
// fog or kelp hides them from outside, a fog flask or the Kelp Cathedral keeps them off its charts; and the rivals its
// chart marks out of sight (in its waters, in the Crown Light's beam, under its flare, under its gull's dive). One
// survey a tick serves the captains, which see only what their ship and gull could see, and the player's chart and HUD.
import type { Sea } from './environment.ts';
import { dcos, dot, v3, type V3 } from './math.ts';
import { R, TERRITORY, cellDir, horizonDistance } from './sphere.ts';
import { EVENT, SHIPS, afloat, type MatchState } from './state.ts';
import { calmNow } from './storm.ts';
import { FITTING, FORMS, SIGHT, SLOT, STORM, TIERS } from './tables.ts';
import { beamMarks, intruders, unseen } from './territory.ts';
import { inFog, newSky, skyAt, veiled } from './weather.ts';

/** A lookout aloft besides the ship's own (WP9's gull): where it flies, how high (u), and the rival it dives on (−1 none). */
export interface Eye {
  at: V3;
  height: number;
  dive: number;
}

/** What one ship sees this tick, as bitmasks by ship index (never its own bit). */
export interface Sight {
  /** Rivals in sight from its deck or its gull: at least their mastheads over the curve. */
  ships: number;
  /** Of those, the ones whose hulls are up; the rest are hull-down. */
  hulls: number;
  /** Rivals its chart marks wherever they are: in its waters, in the Crown Light's beam, under its flare or its gull's dive. */
  marks: number;
  /** How far it sees through the air now, u. */
  range: number;
}

export const newSight = (): Sight => ({ ships: 0, hulls: 0, marks: 0, range: 0 });

/** Horizon distances (u) of the lookout's eye by form and crow's nest (index 0 none, 1 + tier), of mastheads and of hulls by form. */
const EYE = FORMS.map((_, f) => Array.from({ length: TIERS + 1 }, (_, k) => horizonDistance(SIGHT.eye[f] + (k > 0 ? SIGHT.crowsNest[k - 1] : 0))));
const MAST = FORMS.map((_, f) => horizonDistance(SIGHT.mast[f]));
const HULL = FORMS.map((_, f) => horizonDistance(SIGHT.hull[f]));
const FLARE_COS = dcos(SIGHT.flare / R);

/** The horizon distance of ship i's lookout: its form's eye, raised by a crow's nest. */
export function eyeReach(state: MatchState, i: number): number {
  const ship = state.ships[i], look = ship.fittings[SLOT.lookout];
  return EYE[ship.form][look.kind === FITTING.crowsNest ? 1 + look.tier : 0];
}

const SKY = newSky(), AIR = new Float64Array(SHIPS), REACH = new Float64Array(SHIPS), CELL = v3();

/**
 * Whether a lookout at `from`, its eye's horizon `reach` u, sees ship j through `air` u of air: its masthead (2), its
 * hull too (3), or nothing (0). A target is up while the line from the eye to it clears the sea: within the sum of the
 * two horizon distances.
 */
function spot(sea: Sea, state: MatchState, from: V3, reach: number, air: number, j: number): number {
  const ship = state.ships[j], c = dot(from, ship.pos);
  if (c < dcos(Math.min(air, reach + MAST[ship.form]) / R) || veiled(sea.geo, state, from, ship.pos)) return 0;
  return c >= dcos(Math.min(air, reach + HULL[ship.form]) / R) ? 3 : 2;
}

/**
 * What every ship sees now, into out[i] (zero for a ship that has sunk). gulls[i], when given, is ship i's gull aloft,
 * a second lookout (WP9). A rival under a fog flask or kept off charts by the Kelp Cathedral is never seen or marked.
 */
export function survey(sea: Sea, state: MatchState, out: Sight[], gulls?: readonly (Eye | null)[]): Sight[] {
  const calm = calmNow(state);
  let hidden = 0;
  for (let i = 0; i < SHIPS; i++) {
    const ship = state.ships[i];
    if (!afloat(ship) || ship.flask > 0 || unseen(sea, state, i)) hidden |= 1 << i;
    AIR[i] = SIGHT.clear * skyAt(state, ship.pos, SKY).sight * (dot(ship.pos, calm.at) < calm.cos ? STORM.sight : 1);
    REACH[i] = eyeReach(state, i);
  }
  for (let i = 0; i < SHIPS; i++) {
    const o = out[i], ship = state.ships[i], gull = gulls?.[i] ?? null;
    o.ships = o.hulls = o.marks = 0;
    o.range = AIR[i];
    if (!afloat(ship)) {
      o.range = 0;
      continue;
    }
    const gullReach = gull ? horizonDistance(gull.height) : 0;
    for (let j = 0; j < SHIPS; j++) {
      if (j === i || (hidden & (1 << j)) !== 0) continue;
      const air = Math.min(AIR[i], AIR[j]);
      const seen = spot(sea, state, ship.pos, REACH[i], air, j) | (gull ? spot(sea, state, gull.at, gullReach, air, j) : 0);
      if (seen !== 0) o.ships |= 1 << j;
      if (seen === 3) o.hulls |= 1 << j;
      if (ship.flare > 0 && dot(ship.pos, state.ships[j].pos) >= FLARE_COS) o.marks |= 1 << j;
    }
    if (gull && gull.dive >= 0 && gull.dive !== i) o.marks |= 1 << gull.dive;
    o.marks = (o.marks | intruders(state, i) | beamMarks(sea, state, i)) & ~hidden;
  }
  return out;
}

/**
 * Whether ship `viewer`'s chart shows the k-th cell of ship `owner`'s open trail: its own always; a rival's unless it
 * was laid in fog, a fog flask hides it, or it lies in fog or kelp the viewer is outside of.
 */
export function trailSeen(sea: Sea, state: MatchState, viewer: number, owner: number, k: number): boolean {
  if (viewer === owner) return true;
  const ship = state.ships[owner];
  if (ship.fogged[k] || ship.flask > 0) return false;
  return !veiled(sea.geo, state, state.ships[viewer].pos, cellDir(TERRITORY, ship.laid[k], CELL));
}

/**
 * The step's note of fog on the trails, after they are charted: each cell a ship lays is marked if it was laid in fog
 * (Ship.fogged, beside Ship.laid), so it never shows on rival charts.
 */
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

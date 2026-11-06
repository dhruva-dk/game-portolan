// A ship's parts: the canvas, the mainmast, the rudder and the hull below the waterline. Hits land where they land:
// shot aloft tears the canvas and weakens the mast until it falls, shot at the waterline lets the sea in so she lists
// and slows, and shot into the stern shoots the rudder about so she steers like a barge. Only what reaches the hull
// does any of this; the shield is an aura round her and keeps every part whole while it holds.
//
// Each part costs her something she can feel: torn canvas costs drive, a fallen mast leaves her to the fore and mizzen
// until a jury mast is rigged, water in her drags and, past a point, sinks her, and a shot-up rudder slows her turns.
// Quiet for a few seconds, her crew pumps and mends; a repair kit mends half of every part, a full repair all of it.
//
// Fire and the weather meet here too: a burning ship's canvas burns away, the fire leaps to a ship close downwind,
// stronger wind feeds it, and rain, thunder or snow put it out. Lightning goes for the mast, and a breaching whale's
// wave swamps whatever is near.
import { hurt } from './harm.ts';
import { dot, length, set, v3, type V3 } from './math.ts';
import { R, apart } from './sphere.ts';
import { CAUSE, EVENT, FLAG, PHASE, SHIPS, TICK, emit, type MatchState, type Ship } from './state.ts';
import { BLANKET, FIRE, PARTS, RAKE, WEAPONS } from './tables.ts';
import { atHome } from './territory.ts';
import { newSky, skyAt } from './weather.ts';
import { newWind, windAt, type Wind } from './wind.ts';

const NONE = { sail: 1, mast: 1, flood: 1, rudder: 1 } as const;

/** The share of her drive she keeps, from her canvas, her mainmast and the water in her. */
export function drive(ship: Ship): number {
  const rig = ship.fallen > 0 ? PARTS.bare : ship.jury ? PARTS.jury : 1;
  return rig * (1 - PARTS.drive * ship.torn) * (1 - PARTS.drag * ship.flood);
}

/** The share of her turning she keeps, from her rudder and the water in her. */
export const steering = (ship: Ship): number => (1 - PARTS.steer * ship.rudder) * (1 - PARTS.heavy * ship.flood);

/** Whether any part of her is hurt enough for a repair to be worth it. */
export const damaged = (ship: Ship): boolean =>
  ship.torn > 0.08 || ship.rudder > 0.08 || ship.flood > 0.08 || ship.fallen > 0 || ship.mast > 0.3;

/**
 * Raking: a shot travelling within RAKE.cos of her length that lands toward her bow or stern, so it runs the length of
 * her decks. `dir` is the shot's heading, `z` where it landed in metres along her (bow positive).
 */
export const raking = (ship: Ship, dir: V3, z: number): boolean =>
  Math.abs(dot(dir, ship.head)) > RAKE.cos && Math.abs(z) > RAKE.ends;

/**
 * What a hit does to her parts. `hull` is the hull points it took, and x (across, starboard positive), y (up from the
 * waterline) and z (along, bow positive) where it landed, in metres in her own frame. Returns the FLAG bits of the
 * parts it struck.
 */
export function wound(state: MatchState, i: number, by: number, kind: number, hull: number, x: number, y: number, z: number): number {
  const ship = state.ships[i];
  if (!(hull > 0) || ship.phase !== PHASE.sea) return 0;
  const bias = WEAPONS[kind]?.parts ?? NONE;
  let f = 0;
  if (y > PARTS.aloft) {
    ship.torn = Math.min(1, ship.torn + hull * PARTS.sail * bias.sail);
    f |= FLAG.sail;
    if (ship.fallen <= 0) {
      ship.mast += hull * PARTS.mast * bias.mast * (Math.abs(x) < PARTS.mid ? PARTS.spar : 1);
      if (ship.mast >= 1) fall(state, i, by, x >= 0 ? 1 : -1);
    }
  } else if (y < PARTS.waterline) {
    const was = ship.flood;
    ship.flood = Math.min(1, ship.flood + hull * PARTS.flood * bias.flood);
    // she lists to the side the sea came in, or keeps the list she has
    if (was < 0.05) ship.listTo = x >= 0 ? 1 : -1;
    f |= FLAG.waterline;
  }
  if (z < PARTS.stern && y <= PARTS.aloft) {
    ship.rudder = Math.min(1, ship.rudder + hull * PARTS.rudder * bias.rudder);
    f |= FLAG.rudder;
  }
  return f;
}

/** The mainmast goes over the side, toward `side` (+1 starboard). A jury mast is rigged in PARTS.rig seconds. */
export function fall(state: MatchState, i: number, by: number, side: number): void {
  const ship = state.ships[i];
  ship.mast = 1;
  ship.fallen = PARTS.rig;
  ship.jury = false;
  ship.torn = Math.max(ship.torn, 0.25);
  emit(state, EVENT.mastFall, i, by, ship.pos, { amount: side });
}

/** Mends a share `k` of every part (a repair kit); with `all`, every part and a jury mast at once (a full repair). */
export function mendParts(state: MatchState, i: number, k: number, all = false): void {
  const ship = state.ships[i];
  const keep = all ? 0 : 1 - k;
  ship.torn *= keep;
  ship.rudder *= keep;
  ship.flood *= keep;
  ship.mast *= keep;
  if (ship.fallen > 0 && all) rig(state, i);
}

function rig(state: MatchState, i: number): void {
  const ship = state.ships[i];
  ship.fallen = 0;
  ship.jury = true;
  ship.mast = PARTS.rigged;
  emit(state, EVENT.juryRig, i, -1, ship.pos);
}

const W: Wind = newWind(), SKY = newSky(), D = v3();

/** One tick of every ship's parts: the jury mast, pumping and mending, the water that sinks her, and fire. */
export function partsTick(state: MatchState): void {
  const quiet = Math.round(PARTS.quiet / TICK);
  for (let i = 0; i < SHIPS; i++) {
    const ship = state.ships[i];
    if (ship.phase !== PHASE.sea) continue;
    if (ship.fallen > 0) {
      ship.fallen -= TICK;
      if (ship.fallen <= 0) rig(state, i);
    }
    if (state.tick - ship.lastHit >= quiet) {
      const home = atHome(state, i) ? 2 : 1;
      ship.flood = Math.max(0, ship.flood - PARTS.pump * home * TICK);
      ship.torn = Math.max(0, ship.torn - PARTS.mend * home * TICK);
      ship.rudder = Math.max(0, ship.rudder - PARTS.mend * home * TICK);
    }
    if (ship.flood > PARTS.sinks) {
      const k = (ship.flood - PARTS.sinks) / (1 - PARTS.sinks);
      hurt(state, i, PARTS.rate * k * TICK, ship.lastBy, CAUSE.flood, ship.pos, 0);
    }
    if (ship.burn > 0) burning(state, i);
  }
}

/** A burning ship: her canvas burns, the rain may put her out, and the fire leaps downwind. */
function burning(state: MatchState, i: number): void {
  const ship = state.ships[i];
  skyAt(state, ship.pos, SKY);
  if (wet(SKY)) {
    ship.burn = Math.max(0, ship.burn - FIRE.quench * TICK);
    if (ship.burn <= 0) {
      emit(state, EVENT.quench, i, -1, ship.pos);
      return;
    }
  }
  windAt(state, ship.pos, W);
  const blow = length(W.v);
  ship.torn = Math.min(1, ship.torn + FIRE.sail * (1 + blow * FIRE.wind) * TICK);
  if (blow < 1e-6 || (state.tick + i) % 6 !== 0) return;
  for (let j = 0; j < SHIPS; j++) {
    const t = state.ships[j];
    if (j === i || t.phase !== PHASE.sea || t.burn > 0) continue;
    const d = apart(ship.pos, t.pos);
    if (d > FIRE.spread * (1 + blow * FIRE.wind) || d < 1e-6) continue;
    set(D, (t.pos.x - ship.pos.x) * R, (t.pos.y - ship.pos.y) * R, (t.pos.z - ship.pos.z) * R);
    if (dot(D, W.v) / (length(D) * blow) < FIRE.cone) continue;
    skyAt(state, t.pos, SKY);
    if (wet(SKY)) continue;
    t.burn = FIRE.catch;
    t.burnBy = ship.burnBy >= 0 && ship.burnBy !== j ? ship.burnBy : -1;
    emit(state, EVENT.ablaze, j, t.burnBy, t.pos, { amount: FIRE.catch, flag: 1 });
  }
}

/** Rain, thunder or snow overhead: what puts a fire out. */
export const wet = (sky: { rain: number; thunder: number; snow: number }): boolean => sky.rain > 0.3 || sky.thunder > 0.3 || sky.snow > 0.3;

/** Sets her burning for `time` seconds from a heated shot, unless the weather quenches it. Returns whether it took. */
export function ignite(state: MatchState, i: number, by: number, time: number): boolean {
  const ship = state.ships[i];
  skyAt(state, ship.pos, SKY);
  if (wet(SKY)) {
    emit(state, EVENT.quench, i, by, ship.pos, { flag: 1 });
    return false;
  }
  if (ship.burn <= 0) emit(state, EVENT.ablaze, i, by, ship.pos, { amount: time });
  ship.burn = Math.max(ship.burn, time);
  ship.burnBy = by;
  return true;
}

/**
 * The share of the wind ship i keeps when other ships stand upwind of her: each within BLANKET.reach of dead upwind
 * takes some, the more the closer and the straighter upwind it is, and one with its mainmast down takes half as much.
 * The worst one counts. `wind` is the wind where she is.
 */
export function blanket(state: MatchState, i: number, wind: Wind): number {
  const ship = state.ships[i], w = length(wind.v);
  if (w < 1e-6) return 1;
  let keep = 1;
  for (let j = 0; j < SHIPS; j++) {
    const o = state.ships[j];
    if (j === i || o.phase !== PHASE.sea || o.alt > 3) continue;
    const d = apart(ship.pos, o.pos);
    if (d > BLANKET.reach || d < 1e-6) continue;
    set(D, (o.pos.x - ship.pos.x) * R, (o.pos.y - ship.pos.y) * R, (o.pos.z - ship.pos.z) * R);
    // upwind is against the way the wind blows
    const up = -dot(D, wind.v) / (length(D) * w);
    if (up < BLANKET.cone) continue;
    const k = BLANKET.most * (1 - d / BLANKET.reach) * ((up - BLANKET.cone) / (1 - BLANKET.cone)) * (o.fallen > 0 ? 0.5 : 1);
    keep = Math.min(keep, 1 - k);
  }
  return keep;
}

/** Lightning down her mast: it weakens it (and may bring it down) and sets her canvas alight. */
export function struckMast(state: MatchState, i: number): void {
  const ship = state.ships[i];
  if (ship.phase !== PHASE.sea || ship.fallen > 0) return;
  ship.mast += PARTS.bolt;
  if (ship.mast >= 1) fall(state, i, -1, ship.listTo);
  ship.torn = Math.min(1, ship.torn + 0.15);
}

/** How tall her mast stands to draw lightning: 0 with it down, less under a jury rig. */
export const mastHeight = (ship: Ship): number => (ship.fallen > 0 ? 0 : ship.jury ? 0.55 : 1);

/** The whale's wave sweeps over her: she ships water. */
export function swamp(state: MatchState, i: number, k: number): void {
  const ship = state.ships[i];
  if (ship.phase !== PHASE.sea) return;
  ship.flood = Math.min(1, ship.flood + PARTS.swamp * k);
}

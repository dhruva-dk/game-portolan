// The Gale: a high wind that carries the whole fleet over the planet along a great circle. Each captain picks a
// region, leaves the Gale and glides down into it; diving drops faster. Ships coming down over land drift out to
// open water, and land with a little way on, inking their home water.
import type { ShipInput } from './input.ts';
import { PI, addScaled, dot, normalize, rngDir, rngRange, set, v3, type V3 } from './math.ts';
import { nearestOpen, openAt } from './nav.ts';
import { R, advance, along, tangentAt, tangentToward, turned } from './sphere.ts';
import { EVENT, PHASE, SHIPS, STREAM, TICK, copy, emit, type MatchState } from './state.ts';
import { GALE } from './tables.ts';
import { inkHome } from './territory.ts';
import { regionAt } from './world/index.ts';

/** The Gale's speed along its path, m/s. */
export const GALE_SPEED = (GALE.arc * R) / GALE.time;

/** Spreads the fleet across the Gale: ship i rides this many metres to the side of its path. */
const lane = (i: number): number => ((i % 5) - 2) * 9;
const rank = (i: number): number => -Math.floor(i / 5) * 9;

/** Chooses the Gale's path for the match. */
export function planGale(state: MatchState): void {
  const rng = state.rng[STREAM.world], g = state.gale;
  rngDir(rng, g.from);
  tangentAt(g.from, rngRange(rng, -PI, PI), g.dir);
  copy(g.at, g.from);
  copy(g.head, g.dir);
  g.t = 0;
  g.done = false;
}

const SIDE = v3(), T = v3(), P = v3();

/** Where ship i rides at Gale time t. */
export function galeSeat(state: MatchState, i: number, t: number, pos: V3, head: V3): void {
  const g = state.gale;
  advance(g.from, g.dir, GALE_SPEED * Math.min(t, GALE.time) + rank(i), pos, head);
  set(SIDE, head.y * pos.z - head.z * pos.y, head.z * pos.x - head.x * pos.z, head.x * pos.y - head.y * pos.x);
  along(pos, SIDE, lane(i), pos);
  normalize(addScaled(head, head, pos, -dot(head, pos)));
}

/** Moves the Gale on. Everyone still aboard when it blows out is thrown off. */
export function blow(state: MatchState): void {
  const g = state.gale;
  if (g.done) return;
  g.t += TICK;
  advance(g.from, g.dir, GALE_SPEED * Math.min(g.t, GALE.time), g.at, g.head);
  if (g.t >= GALE.time) g.done = true;
}

/** One tick for a ship riding the Gale. */
export function ride(state: MatchState, i: number, input: ShipInput): void {
  const ship = state.ships[i];
  copy(ship.was, ship.pos);
  galeSeat(state, i, state.gale.t, ship.pos, ship.head);
  ship.alt = GALE.height;
  ship.speed = GALE_SPEED;
  ship.vy = 0;
  if (input.dive || state.gale.done) leave(state, i);
}

/** Leaves the Gale and starts down. */
export function leave(state: MatchState, i: number): void {
  const ship = state.ships[i];
  ship.phase = PHASE.glide;
  ship.speed = GALE.glide;
  ship.vy = -GALE.fall;
  emit(state, EVENT.galeDive, i, regionAt(ship.pos), ship.pos, { y: ship.alt, item: regionAt(ship.pos) });
}

/** One tick of the glide down: steer, glide or dive, keep off the land, and land. */
export function glide(state: MatchState, i: number, input: ShipInput): void {
  const ship = state.ships[i];
  copy(ship.was, ship.pos);
  const steer = Math.max(-1, Math.min(1, input.steer / 0.5));
  turned(ship.head, ship.pos, steer * GALE.turn * TICK, ship.head);
  normalize(addScaled(ship.head, ship.head, ship.pos, -dot(ship.head, ship.pos)));
  const diving = input.dive;
  const speed = diving ? GALE.slow : GALE.glide, fall = diving ? GALE.dive : GALE.fall;
  ship.speed += (speed - ship.speed) * Math.min(1, TICK * 2);
  ship.vy += (-fall - ship.vy) * Math.min(1, TICK * 3);
  // close to the water over land, she is steered out to open water
  if (ship.alt < GALE.steer && !openAt(ship.pos) && nearestOpen(ship.pos, P, 30)) {
    tangentToward(ship.pos, P, T);
    const k = Math.min(1, TICK * 4);
    normalize(set(ship.head, ship.head.x + (T.x - ship.head.x) * k, ship.head.y + (T.y - ship.head.y) * k, ship.head.z + (T.z - ship.head.z) * k));
    normalize(addScaled(ship.head, ship.head, ship.pos, -dot(ship.head, ship.pos)));
  }
  advance(ship.pos, ship.head, ship.speed * TICK, ship.pos, ship.head);
  ship.alt += ship.vy * TICK;
  if (ship.alt <= 0) land(state, i);
}

/** Touches down: onto open water, with a little way on. */
export function land(state: MatchState, i: number): void {
  const ship = state.ships[i];
  if (!openAt(ship.pos) && nearestOpen(ship.pos, P, 60)) copy(ship.pos, P);
  normalize(addScaled(ship.head, ship.head, ship.pos, -dot(ship.head, ship.pos)));
  ship.alt = 0;
  ship.vy = 0;
  ship.speed = GALE.land;
  ship.phase = PHASE.sea;
  ship.landed = state.tick;
  copy(ship.was, ship.pos);
  ship.regions |= 1 << regionAt(ship.pos);
  emit(state, EVENT.landing, i, regionAt(ship.pos), ship.pos, { item: regionAt(ship.pos) });
  inkHome(state, i);
  // a captain keeps the spot it landed on, the middle of its home water, to set out from
  copy(ship.captain.drop, ship.pos);
}

/** True once every ship has left the Gale. */
export function galeEmpty(state: MatchState): boolean {
  for (let i = 0; i < SHIPS; i++) if (state.ships[i].phase === PHASE.gale) return false;
  return true;
}


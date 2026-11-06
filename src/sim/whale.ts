// The whale: a giant that swims a loop of deep water in the Glass Sea, surfacing and diving as it goes.
// As the Storm calls certain phases it rises under the busiest water near it and breaches: ships near it are
// lifted, those right over it are flipped, and it scatters loot.
import { PI, rngInt, rngRange, set, v3, type V3 } from './math.ts';
import { openAt } from './nav.ts';
import { advance, along, apart, tangentAt, tangentToward } from './sphere.ts';
import { hurt } from './harm.ts';
import { swamp } from './parts.ts';
import { rollItem, spawnLoot } from './items.ts';
import { CAUSE, EVENT, PHASE, SHIPS, STREAM, TICK, WHALE_STATE, copy, emit, type MatchState } from './state.ts';
import { WHALE } from './tables.ts';
import { CENTRES, heightAt, regionIndex } from './world/index.ts';

export const WHALE_HOME = regionIndex('glassSea');

const T = v3(), P = v3();

/** Lays out the whale's route: deep, open water around the Glass Sea. */
export function planWhale(state: MatchState): void {
  const rng = state.rng[STREAM.whale], w = state.whale, c = CENTRES[WHALE_HOME];
  w.route = [];
  for (let k = 0; k < WHALE.waypoints; k++) {
    let placed = false;
    for (let tries = 0; tries < 40 && !placed; tries++) {
      tangentAt(c, (2 * PI * k) / WHALE.waypoints + rngRange(rng, -0.4, 0.4), T);
      along(c, T, rngRange(rng, 80, WHALE.roam), P);
      if (heightAt(P) < -WHALE.deep && openAt(P)) placed = true;
    }
    if (placed) w.route.push({ x: P.x, y: P.y, z: P.z });
  }
  if (w.route.length === 0) {
    tangentAt(c, 0, T);
    w.route.push({ ...along(c, T, 120, v3()) });
  }
  copy(w.at, w.route[0]);
  tangentToward(w.at, w.route[1 % w.route.length], w.head);
  w.leg = 1 % w.route.length;
  w.state = WHALE_STATE.under;
  w.t = rngRange(rng, 5, WHALE.under);
  w.breaches = 0;
}

/** Whether the whale is free to be called: not already rising or breaching. */
export const whaleFree = (state: MatchState): boolean => state.whale.state !== WHALE_STATE.rising && state.whale.state !== WHALE_STATE.breach;

/** Calls the breach: the whale rises under the busiest water within reach, or under `at` when the Glass Sea calls it
 *  there or a ship calls it (`by`, with Whale Call). */
export function callBreach(state: MatchState, at: V3 | null = null, by = -1): void {
  const w = state.whale;
  if (!whaleFree(state)) return;
  if (at !== null) {
    copy(w.spot, at);
    w.state = WHALE_STATE.rising;
    w.t = WHALE.rising;
    emit(state, EVENT.whaleRising, -1, by, w.spot, { amount: WHALE.rising, y: WHALE.lift });
    return;
  }
  let best = -1, bestN = 0;
  for (let i = 0; i < SHIPS; i++) {
    const s = state.ships[i];
    if (s.phase !== PHASE.sea || apart(s.pos, w.at) > WHALE.roam * 1.5) continue;
    let n = 0;
    for (let j = 0; j < SHIPS; j++) if (state.ships[j].phase === PHASE.sea && apart(state.ships[j].pos, s.pos) < WHALE.lift) n++;
    if (n > bestN) {
      bestN = n;
      best = i;
    }
  }
  if (best >= 0 && openAt(state.ships[best].pos)) copy(w.spot, state.ships[best].pos);
  else copy(w.spot, w.at);
  w.state = WHALE_STATE.rising;
  w.t = WHALE.rising;
  emit(state, EVENT.whaleRising, -1, -1, w.spot, { amount: WHALE.rising, y: WHALE.lift });
}

/** One tick of the whale. */
export function swim(state: MatchState): void {
  const w = state.whale;
  if (w.route.length === 0) return;
  w.t -= TICK;
  if (w.state === WHALE_STATE.rising) {
    // it closes on the spot it will breach at
    const d = apart(w.at, w.spot);
    if (d > 1) {
      tangentToward(w.at, w.spot, w.head);
      advance(w.at, w.head, Math.min(d, (d / Math.max(0.5, w.t)) * TICK), w.at, T);
    }
    if (w.t <= 0) breach(state);
    return;
  }
  if (w.state === WHALE_STATE.breach) {
    if (w.t <= 0) {
      w.state = WHALE_STATE.under;
      w.t = WHALE.under;
      emit(state, EVENT.whaleDive, -1, -1, w.at, {});
    }
    return;
  }
  const to = w.route[w.leg];
  const d = apart(w.at, to);
  if (d < 4) {
    w.leg = (w.leg + 1) % w.route.length;
  } else {
    tangentToward(w.at, to, w.head);
    advance(w.at, w.head, Math.min(d, WHALE.speed * TICK), w.at, T);
  }
  if (w.t > 0) return;
  if (w.state === WHALE_STATE.under) {
    w.state = WHALE_STATE.surfaced;
    w.t = WHALE.surface;
    emit(state, EVENT.whaleSurface, -1, -1, w.at, {});
  } else {
    w.state = WHALE_STATE.under;
    w.t = WHALE.under;
    emit(state, EVENT.whaleDive, -1, -1, w.at, {});
  }
}

function breach(state: MatchState): void {
  const w = state.whale, rng = state.rng[STREAM.whale];
  copy(w.at, w.spot);
  w.state = WHALE_STATE.breach;
  w.t = 4;
  w.breaches++;
  emit(state, EVENT.whaleBreach, -1, -1, w.at, { amount: WHALE.lift, y: WHALE.flip });
  for (let i = 0; i < SHIPS; i++) {
    const s = state.ships[i];
    if (s.phase !== PHASE.sea) continue;
    const d = apart(s.pos, w.at);
    if (d > WHALE.lift) continue;
    s.vy = Math.max(s.vy, WHALE.up * (1 - (0.5 * d) / WHALE.lift));
    if (s.alt <= 0) s.alt = 1e-3;
    tangentToward(w.at, s.pos, T);
    if (d > 0.5) set(s.shove, s.shove.x + T.x * 6, s.shove.y + T.y * 6, s.shove.z + T.z * 6);
    // the wave it throws sweeps over whatever is near, and she ships water
    swamp(state, i, 1 - d / WHALE.lift);
    if (d <= WHALE.flip) {
      s.flip = WHALE.flipped;
      hurt(state, i, 10, -1, CAUSE.whale, s.pos, 0);
      emit(state, EVENT.flipped, i, -1, s.pos, { amount: WHALE.flipped });
    }
  }
  for (let k = 0; k < WHALE.loot; k++) spawnLoot(state, w.at, rollItem(state, rng, rngInt(rng, 2)), -1, -1, 6 + k);
}

export function whaleNear(state: MatchState, p: V3, r: number): boolean {
  return state.whale.state !== WHALE_STATE.under && apart(state.whale.at, p) < r;
}

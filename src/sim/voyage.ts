// The free voyage: the same planet with no Storm and no end. A few captains sail it with you. The sun goes round, the
// weather comes and goes, and each region's event comes round again after a rest. The whale breaches every few
// minutes. Loot is laid again on empty spots, and a hidden cache is filled again a while after it is taken. A wreck is
// not the end: she refits and sails again, the player's near where she went down and a captain's far out of sight.
// Nothing here runs in a match.
import { starter, empty, rollItem, spawnLoot, lootSpots } from './items.ts';
import { PI, addScaled, dot, normalize, rngFloat, rngInt, rngRange, set, v3 } from './math.ts';
import { openAt } from './nav.ts';
import { apart, tangentAt } from './sphere.ts';
import { CACHE_PLACES, cacheOf, fillCache } from './secrets.ts';
import { EVENT, EVENT_STATE, GULL, MODE, PHASE, PLAYER, SHIPS, STREAM, TICK, emit, type MatchState, type Ship } from './state.ts';
import { GUST, REGION_EVENT, SLOTS, VOYAGE, WHALE } from './tables.ts';
import { callBreach, whaleFree } from './whale.ts';
import { REGION_EVENTS, regionAt } from './world/index.ts';

export const isVoyage = (state: MatchState): boolean => state.mode === MODE.voyage;

/** A ship that never put to sea on this voyage: the fleet's spare berths. */
export const ashore = (ship: Ship): boolean => ship.phase === PHASE.sunk && ship.sunk < 0;

/** Sets a new voyage going: the spare berths stay ashore, and the clocks start. */
export function planVoyage(state: MatchState, captains: number): void {
  for (let i = 1 + captains; i < SHIPS; i++) {
    const s = state.ships[i];
    s.phase = PHASE.sunk;
    s.sunk = -1;
    s.place = 0;
  }
  const rng = state.rng[STREAM.world];
  state.voyage.lootT = VOYAGE.loot;
  state.voyage.whaleT = rngRange(rng, VOYAGE.whale[0], VOYAGE.whale[1]) * 0.5;
  state.voyage.caches = CACHE_PLACES.map(() => 0);
}

/** One tick of the voyage, after the ships have moved and the wrecks have gone down. */
export function voyageTick(state: MatchState): void {
  const v = state.voyage, rng = state.rng[STREAM.world], now = state.tick;
  // wrecks refit
  for (let i = 0; i < SHIPS; i++) {
    const s = state.ships[i];
    if (s.phase !== PHASE.sunk || s.sunk < 0) continue;
    const wait = i === PLAYER && !s.captain.on ? VOYAGE.refit : VOYAGE.refitCaptain;
    if ((now - s.sunk) * TICK >= wait) refit(state, i);
  }
  // the regions' events come round again
  for (let ri = 0; ri < state.regionEvents.length; ri++) {
    const ev = state.regionEvents[ri];
    if (ev.state !== EVENT_STATE.over) continue;
    ev.state = EVENT_STATE.waiting;
    ev.at = now * TICK + rngRange(rng, VOYAGE.rest[0], VOYAGE.rest[1]);
    ev.t = 0;
    ev.n = 0;
    ev.marks = [];
    const e = REGION_EVENTS[ri];
    ev.k = rngInt(rng, e.spots.length);
    const sp = e.spots[ev.k];
    set(ev.spot, sp.x, sp.y, sp.z);
    ev.run = REGION_EVENT.run[ri];
  }
  // the whale
  v.whaleT -= TICK;
  if (v.whaleT <= 0 && whaleFree(state)) {
    callBreach(state);
    v.whaleT = rngRange(rng, VOYAGE.whale[0], VOYAGE.whale[1]) + WHALE.rising;
  }
  // what wrecks spilled goes down after a while, so the sea doesn't fill with it
  for (let k = state.loot.length - 1; k >= 0; k--) {
    const l = state.loot[k];
    if (l.spot === -1 && l.age > VOYAGE.spill) state.loot.splice(k, 1);
  }
  // loot laid again on one empty spot every few seconds
  v.lootT -= TICK;
  if (v.lootT <= 0) {
    v.lootT = VOYAGE.loot;
    relay(state);
  }
  // caches filled again a while after they are taken
  for (let c = 0; c < v.caches.length; c++) {
    if (v.caches[c] > 0) {
      v.caches[c] -= TICK;
      if (v.caches[c] <= 0) fillCache(state, c);
      continue;
    }
    let there = false;
    for (const l of state.loot) if (cacheOf(l.spot) === c) there = true;
    if (!there) v.caches[c] = VOYAGE.cache;
  }
}

/** Lays an item on one loot spot that has none and no ship near. */
function relay(state: MatchState): void {
  const rng = state.rng[STREAM.loot], spots = lootSpots();
  for (let tries = 0; tries < 6; tries++) {
    const k = rngInt(rng, spots.length), p = spots[k].pos;
    let taken = false;
    for (const l of state.loot) if (l.spot === k || apart(l.at, p) < 12) taken = true;
    for (let i = 0; i < SHIPS && !taken; i++) {
      const s = state.ships[i];
      if (s.phase === PHASE.sea && apart(s.pos, p) < 90) taken = true;
    }
    if (taken) continue;
    spawnLoot(state, p, rollItem(state, rng), -1, k);
    return;
  }
}

const T = v3();

/** A wreck sails again: a fresh hull, no shield, the starting gun, her parts whole, somewhere clear. */
export function refit(state: MatchState, i: number): void {
  const s = state.ships[i], rng = state.rng[STREAM.world], spots = lootSpots();
  const mine = i === PLAYER && !s.captain.on, home = regionAt(s.pos), me = state.ships[PLAYER];
  // the player comes back in the waters she went down in; a captain, far out of the player's sight
  let best = -1, bestScore = -Infinity;
  for (let tries = 0; tries < 40; tries++) {
    const k = rngInt(rng, spots.length), p = spots[k].pos;
    if (!openAt(p)) continue;
    let clear = Infinity;
    for (let j = 0; j < SHIPS; j++) {
      const o = state.ships[j];
      if (j !== i && o.phase === PHASE.sea) clear = Math.min(clear, apart(o.pos, p));
    }
    let score = Math.min(clear, VOYAGE.clear) + rngFloat(rng);
    if (mine) score += spots[k].region === home ? 400 : 0;
    else if (me.phase === PHASE.sea) score += Math.min(apart(me.pos, p), VOYAGE.clearYou) * 2;
    if (score > bestScore) {
      bestScore = score;
      best = k;
    }
  }
  if (best < 0) best = rngInt(rng, spots.length);
  const p = spots[best].pos;
  set(s.pos, p.x, p.y, p.z);
  set(s.was, p.x, p.y, p.z);
  tangentAt(s.pos, rngRange(rng, -PI, PI), T);
  normalize(addScaled(s.head, T, s.pos, -dot(T, s.pos)));
  s.phase = PHASE.sea;
  s.alt = 0;
  s.vy = 0;
  s.speed = s.drift = s.rate = s.turn = 0;
  set(s.shove, 0, 0, 0);
  set(s.vel, 0, 0, 0);
  s.hull = 100;
  s.shield = 0;
  s.slots = Array.from({ length: SLOTS }, empty);
  s.slots[0] = starter(state);
  s.sel = 0;
  s.cool = s.reload = s.equip = s.windup = s.useT = 0;
  s.use = -1;
  s.gusts = GUST.charges;
  s.gustT = s.boost = s.cooldown = s.power = 0;
  s.burn = 0;
  s.burnBy = -1;
  s.slow = s.spotted = s.revealed = s.ice = s.ash = s.flip = s.scrape = 0;
  s.board = 0;
  s.nogo = s.irons = s.fill = s.lurch = 0;
  s.torn = s.mast = s.fallen = s.rudder = s.flood = 0;
  s.jury = false;
  s.listTo = 1;
  s.by = s.cause = s.lastBy = -1;
  s.lastHit = -100000;
  s.place = 0;
  s.gull = { state: GULL.home, t: 0, tier: 0, at: { x: 0, y: 0, z: 1 }, alt: 0 };
  // the captain starts its thinking afresh
  const c = s.captain;
  c.mode = 0;
  c.foe = -1;
  c.target = -1;
  c.since = 0;
  c.path = [];
  c.leg = 0;
  c.repath = 0;
  c.stuckT = c.backT = c.burst = 0;
  c.region = -1;
  emit(state, EVENT.refit, i, -1, s.pos, {});
}

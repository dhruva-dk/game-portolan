// Coins and gull deliveries. Coins come from sailing, loot, kills, claims, cuts and rent (see where each is
// paid); they belong to the match and start at zero every match. A ship spends them on a parcel: the gull
// leaves the nearest landmark, flies the parcel out and drops it just ahead of the ship.
import type { ShipInput } from './input.ts';
import { rngFloat, set, v3, type V3 } from './math.ts';
import { hasPerk } from './perks.ts';
import { advance, apart, along, tangentToward } from './sphere.ts';
import { EVENT, GULL, PHASE, SHIPS, STREAM, TICK, copy, emit, type Item, type MatchState, type Ship } from './state.ts';
import { DELIVERY, ITEM, PARCELS, PERKS, WEAPON_KINDS } from './tables.ts';
import { spawnLoot, useItem, weaponItem } from './items.ts';
import { LANDMARKS } from './world/index.ts';

/** What a parcel costs this ship. */
export const priceOf = (ship: Ship, tier: number): number =>
  Math.round(PARCELS[tier].cost * (hasPerk(ship, 'cheapDeliveries') ? PERKS.cheapDeliveries : 1));

export const canCall = (ship: Ship, tier: number): boolean =>
  tier >= 0 && tier < PARCELS.length && ship.phase === PHASE.sea && ship.gull.state === GULL.home && ship.coins >= priceOf(ship, tier);

/** The landmark the gull flies from: the nearest one. */
function roost(p: V3): V3 {
  let best = LANDMARKS[0].pos, bd = 1e9;
  for (const l of LANDMARKS) {
    const d = apart(p, l.pos);
    if (d < bd) {
      bd = d;
      best = l.pos;
    }
  }
  return best;
}

export function call(state: MatchState, i: number, tier: number): boolean {
  const ship = state.ships[i];
  if (!canCall(ship, tier)) return false;
  const price = priceOf(ship, tier);
  ship.coins -= price;
  const g = ship.gull;
  g.state = GULL.flying;
  g.tier = tier;
  g.t = 0;
  g.alt = DELIVERY.height;
  copy(g.at, roost(ship.pos));
  emit(state, EVENT.deliveryCalled, i, -1, g.at, { item: tier, amount: price });
  return true;
}

const AHEAD = v3(), T = v3();

/** Calls, flies and rests every ship's gull. */
export function gulls(state: MatchState, inputs: readonly ShipInput[]): void {
  for (let i = 0; i < SHIPS; i++) {
    const ship = state.ships[i], g = ship.gull;
    if (inputs[i].hail >= 0 && g.state === GULL.home) call(state, i, inputs[i].hail);
    if (g.state === GULL.rest) {
      g.t -= TICK;
      if (g.t <= 0) g.state = GULL.home;
      continue;
    }
    if (g.state !== GULL.flying) continue;
    if (ship.phase === PHASE.sunk) {
      g.state = GULL.rest;
      g.t = DELIVERY.rest;
      continue;
    }
    g.t += TICK;
    along(ship.pos, ship.head, DELIVERY.ahead, AHEAD);
    const d = apart(g.at, AHEAD);
    if (d <= DELIVERY.drop || d <= DELIVERY.speed * TICK) {
      deliver(state, i, AHEAD);
      continue;
    }
    tangentToward(g.at, AHEAD, T);
    advance(g.at, T, DELIVERY.speed * TICK, g.at, T);
    g.alt = Math.max(DELIVERY.drop, Math.min(DELIVERY.height, d * 0.4));
  }
}

function deliver(state: MatchState, i: number, at: V3): void {
  const ship = state.ships[i], g = ship.gull;
  for (const item of parcel(state, g.tier)) spawnLoot(state, at, item, -1, -1, 1.5).age = 1;
  emit(state, EVENT.deliveryArrived, i, -1, at, { item: g.tier });
  set(g.at, at.x, at.y, at.z);
  g.state = GULL.rest;
  g.t = DELIVERY.rest;
}

/** What's in each parcel. */
export function parcel(state: MatchState, tier: number): Item[] {
  const rng = state.rng[STREAM.loot];
  const weapon = (lo: number, hi: number): Item => {
    const kind = WEAPON_KINDS[Math.floor(rngFloat(rng) * WEAPON_KINDS.length)];
    return weaponItem(kind, lo + Math.floor(rngFloat(rng) * (hi - lo + 1)));
  };
  if (tier === 0) return [useItem(ITEM.smallShield, 3), useItem(ITEM.repairKit, 3)];
  if (tier === 1) return [weapon(1, 3), useItem(ITEM.bigShield, 1), useItem(ITEM.smallShield, 2)];
  return [weapon(3, 4), useItem(ITEM.bigShield, 2), useItem(ITEM.fullRepair, 1)];
}

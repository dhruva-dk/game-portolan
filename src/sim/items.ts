// Items: the 5-slot hotbar (select, swap, drop), loot on the water (the loot spots filled by rarity at the
// start, drops from sinking ships, parcels and the whale), picking it up, and using consumables.
import { interrupt, mend, shore, standDown } from './harm.ts';
import { damaged, mendParts } from './parts.ts';
import type { ShipInput } from './input.ts';
import { addScaled, dot, normalize, rngFloat, rngInt, rngRange, set, v3, type Rng, type V3 } from './math.ts';
import { openAt, nearestOpen } from './nav.ts';
import { hasPassive, hasPerk } from './perks.ts';
import { apart, along, tangentAt } from './sphere.ts';
import { EVENT, PHASE, SHIPS, STREAM, TICK, copy, emit, type Item, type Loot, type MatchState, type Ship } from './state.ts';
import { COINS, EQUIP, ITEM, LOOT, PARTS, PERKS, POWERS, RARITIES, SLOTS, USES, WEAPONS, WEAPON_KINDS, isUse, isWeapon } from './tables.ts';
import { CENTRES, LOOT_SPOTS, REGIONS, regionAt } from './world/index.ts';

export function empty(): Item {
  return { kind: ITEM.none, rarity: 0, n: 0 };
}

export const weaponItem = (kind: number, rarity: number): Item => ({ kind, rarity, n: WEAPONS[kind].mag });

export const useItem = (kind: number, n = LOOT.counts[kind] ?? 1): Item => ({ kind, rarity: LOOT.rarity[kind] ?? 0, n });

/** How many of a consumable fit in one slot. */
export const stackOf = (ship: Ship, kind: number): number =>
  (USES[kind]?.stack ?? 1) + (hasPassive(ship, 'deepHold') ? POWERS.deepHold : 0);

function rollRarity(rng: Rng, boost: number): number {
  const w = LOOT.weights;
  let total = 0;
  for (const x of w) total += x;
  let r = rngFloat(rng) * total, k = 0;
  while (k < w.length - 1 && r >= w[k]) r -= w[k++];
  return Math.min(RARITIES - 1, k + boost);
}

/** A random item, by rarity. */
export function rollItem(rng: Rng, boost = 0): Item {
  if (rngFloat(rng) < LOOT.weapon) {
    const kind = WEAPON_KINDS[rngInt(rng, WEAPON_KINDS.length)];
    return weaponItem(kind, rollRarity(rng, boost));
  }
  const r = rngFloat(rng);
  const kind = r < 0.36 ? ITEM.smallShield : r < 0.58 ? ITEM.repairKit : r < 0.86 ? ITEM.bigShield : ITEM.fullRepair;
  return useItem(kind);
}

/** The weapon every ship starts with in slot 0. */
export const starter = (): Item => weaponItem(ITEM.cannon, 0);

// ---------------------------------------------------------------- loot on the water

const T = v3(), P = v3();

export function spawnLoot(state: MatchState, at: V3, item: Item, from: number, spot = -1, kick = 0): Loot {
  const rng = state.rng[STREAM.loot];
  const loot: Loot = {
    id: state.nextId++, at: { x: at.x, y: at.y, z: at.z }, v: { x: 0, y: 0, z: 0 },
    item: { kind: item.kind, rarity: item.rarity, n: item.n }, age: 0, from, spot,
  };
  if (kick > 0) {
    tangentAt(loot.at, rngRange(rng, -3.14159, 3.14159), T);
    set(loot.v, T.x * kick, T.y * kick, T.z * kick);
  }
  state.loot.push(loot);
  return loot;
}

/** The loot spots: the world's, or, until the world has placed them, six on open water around each region's landmark. */
export function lootSpots(): readonly { pos: V3; region: number }[] {
  if (LOOT_SPOTS.length > 0) return LOOT_SPOTS;
  return FALLBACK;
}

const FALLBACK: { pos: V3; region: number }[] = [];
let fellBack = false;

function fallback(): void {
  if (fellBack) return;
  fellBack = true;
  for (let r = 0; r < REGIONS.length; r++) {
    for (let k = 0; k < LOOT.fallback; k++) {
      const p = v3();
      tangentAt(CENTRES[r], (k / LOOT.fallback) * 6.283185307179586 + r, T);
      for (let d = 70; d < 260; d += 15) {
        along(CENTRES[r], T, d + 20 * (k % 3), p);
        if (openAt(p) && regionAt(p) === r) break;
      }
      if (!openAt(p) && !nearestOpen(p, p, 12)) continue;
      FALLBACK.push({ pos: p, region: r });
    }
  }
}

/** Fills every loot spot with an item, and some with a second. */
export function seedLoot(state: MatchState): void {
  fallback();
  const rng = state.rng[STREAM.loot], spots = lootSpots();
  for (let s = 0; s < spots.length; s++) {
    spawnLoot(state, spots[s].pos, rollItem(rng), -1, s);
    if (rngFloat(rng) < LOOT.second) {
      const l = spawnLoot(state, spots[s].pos, rollItem(rng), -1, s);
      tangentAt(l.at, rngRange(rng, -3.14159, 3.14159), T);
      along(l.at, T, 4, l.at);
    }
  }
}

/** Drifts and settles loot that is moving. */
export function driftLoot(state: MatchState): void {
  const k = Math.max(0, 1 - TICK * LOOT.drift);
  for (const l of state.loot) {
    l.age += TICK;
    const v = Math.sqrt(dot(l.v, l.v));
    if (v < 1e-3) continue;
    set(T, l.v.x / v, l.v.y / v, l.v.z / v);
    along(l.at, T, v * TICK, P);
    if (openAt(P)) copy(l.at, P);
    else set(l.v, 0, 0, 0);
    normalize(addScaled(l.v, l.v, l.at, -dot(l.v, l.at)));
    set(l.v, l.v.x * v * k, l.v.y * v * k, l.v.z * v * k);
  }
}

/** Everything in a sinking ship's hold goes over the side. */
export function spill(state: MatchState, i: number): void {
  const ship = state.ships[i];
  for (let s = 0; s < SLOTS; s++) {
    const it = ship.slots[s];
    if (it.kind === ITEM.none) continue;
    const item = isWeapon(it.kind) ? weaponItem(it.kind, it.rarity) : it;
    spawnLoot(state, ship.pos, item, i, -1, 3 + s);
    ship.slots[s] = empty();
  }
}

// ---------------------------------------------------------------- the hotbar

/** Where an item would go: a stack with room, else an empty slot; -1 if neither. */
export function roomFor(ship: Ship, item: Item): number {
  if (isUse(item.kind)) {
    for (let s = 0; s < SLOTS; s++) if (ship.slots[s].kind === item.kind && ship.slots[s].n < stackOf(ship, item.kind)) return s;
  }
  for (let s = 0; s < SLOTS; s++) if (ship.slots[s].kind === ITEM.none) return s;
  return -1;
}

/** Puts an item in the hotbar. Returns how many of it are left over. */
export function give(ship: Ship, item: Item): number {
  let n = isUse(item.kind) ? item.n : 1;
  while (n > 0) {
    const s = roomFor(ship, item);
    if (s < 0) break;
    const slot = ship.slots[s];
    if (slot.kind === ITEM.none) {
      if (isWeapon(item.kind)) {
        ship.slots[s] = { kind: item.kind, rarity: item.rarity, n: item.n };
        return 0;
      }
      ship.slots[s] = { kind: item.kind, rarity: item.rarity, n: 0 };
    }
    const take = Math.min(n, stackOf(ship, item.kind) - ship.slots[s].n);
    ship.slots[s].n += take;
    n -= take;
  }
  return n;
}

export function select(state: MatchState, i: number, s: number): void {
  const ship = state.ships[i];
  if (s < 0 || s >= SLOTS || s === ship.sel) return;
  interrupt(state, i);
  standDown(state, i);
  ship.sel = s;
  ship.reload = 0;
  ship.equip = EQUIP;
  emit(state, EVENT.select, i, -1, ship.pos, { item: ship.slots[s].kind, amount: s });
}

export function swap(state: MatchState, i: number, s: number): void {
  const ship = state.ships[i];
  if (s < 0 || s >= SLOTS || s === ship.sel) return;
  interrupt(state, i);
  standDown(state, i);
  const a = ship.slots[ship.sel];
  ship.slots[ship.sel] = ship.slots[s];
  ship.slots[s] = a;
  ship.reload = 0;
  ship.sel = s;
  emit(state, EVENT.select, i, -1, ship.pos, { item: ship.slots[s].kind, amount: s, flag: 1 });
}

export function drop(state: MatchState, i: number): void {
  const ship = state.ships[i], it = ship.slots[ship.sel];
  if (it.kind === ITEM.none) return;
  interrupt(state, i);
  standDown(state, i);
  set(T, -ship.head.x, -ship.head.y, -ship.head.z);
  along(ship.pos, T, 8, P);
  const l = spawnLoot(state, P, it, i);
  set(l.v, T.x * 1.5, T.y * 1.5, T.z * 1.5);
  ship.slots[ship.sel] = empty();
  ship.reload = 0;
  emit(state, EVENT.drop, i, -1, ship.pos, { item: it.kind, amount: it.n, y: it.rarity });
}

/** Ships sweep up loot in reach that fits; `take` swaps the nearest for the selected slot when full. */
export function pickups(state: MatchState, inputs: readonly ShipInput[]): void {
  for (let i = 0; i < SHIPS; i++) {
    const ship = state.ships[i];
    if (ship.phase !== PHASE.sea || ship.flip > 0) continue;
    let nearest = -1, nd: number = LOOT.reach;
    for (let k = state.loot.length - 1; k >= 0; k--) {
      const l = state.loot[k];
      if (l.age < LOOT.settle && l.from === i) continue;
      const d = apart(ship.pos, l.at);
      if (d > LOOT.reach) continue;
      if (roomFor(ship, l.item) >= 0) {
        take(state, i, k);
        continue;
      }
      if (d < nd) {
        nd = d;
        nearest = l.id;
      }
    }
    if (nearest >= 0 && inputs[i].take) {
      const k = state.loot.findIndex((l) => l.id === nearest);
      const old = ship.slots[ship.sel];
      ship.slots[ship.sel] = empty();
      if (old.kind !== ITEM.none) {
        const l = spawnLoot(state, ship.pos, old, i);
        emit(state, EVENT.drop, i, -1, ship.pos, { item: old.kind, amount: old.n, y: old.rarity });
        l.age = 0;
      }
      if (k >= 0) take(state, i, k);
    }
  }
}

function take(state: MatchState, i: number, k: number): void {
  const ship = state.ships[i], l = state.loot[k];
  // Better Loot: what you open at a loot spot rolls a rarity higher
  if (l.spot >= 0 && isWeapon(l.item.kind) && hasPerk(ship, 'betterLoot')) l.item.rarity = Math.min(RARITIES - 1, l.item.rarity + 1);
  const left = give(ship, l.item);
  emit(state, EVENT.pickup, i, l.id, l.at, { item: l.item.kind, amount: l.item.n - left, y: l.item.rarity });
  ship.coins += COINS.loot;
  if (left > 0) l.item.n = left;
  else state.loot.splice(k, 1);
}

// ---------------------------------------------------------------- consumables

/** How long a consumable takes for this ship. */
export function useTime(ship: Ship, kind: number): number {
  let t = USES[kind].time;
  if (hasPerk(ship, 'fastRefill')) t *= PERKS.fastRefill;
  if (hasPassive(ship, 'quickHands')) t *= POWERS.quickHands;
  return t;
}

/** Would it do anything? A shield charge does nothing at its cap, a repair nothing to a whole ship at full. */
export function useful(ship: Ship, kind: number): boolean {
  const u = USES[kind];
  return u.shield > 0 ? ship.shield < u.cap : ship.hull < u.cap || damaged(ship);
}

export function startUse(state: MatchState, i: number): boolean {
  const ship = state.ships[i], it = ship.slots[ship.sel];
  if (!isUse(it.kind) || it.n <= 0 || ship.use >= 0 || ship.phase !== PHASE.sea) return false;
  if (!useful(ship, it.kind)) {
    emit(state, EVENT.blocked, i, -1, ship.pos, { item: it.kind });
    return false;
  }
  ship.use = ship.sel;
  ship.useT = useTime(ship, it.kind);
  emit(state, EVENT.useStart, i, -1, ship.pos, { item: it.kind, amount: ship.useT });
  return true;
}

export function useTick(state: MatchState, i: number): void {
  const ship = state.ships[i];
  if (ship.use < 0) return;
  ship.useT -= TICK;
  if (ship.useT > 1e-9) return;
  const it = ship.slots[ship.use], u = USES[it.kind];
  const shield = u.shield > 0 ? shore(state, i, u.shield, u.cap) : 0;
  const hull = u.hull > 0 ? mend(state, i, u.hull, u.cap) : 0;
  if (u.hull > 0) mendParts(state, i, PARTS.kit, it.kind === ITEM.fullRepair);
  it.n--;
  emit(state, EVENT.useDone, i, -1, ship.pos, { item: it.kind, shield, hull, amount: it.n });
  if (it.n <= 0) ship.slots[ship.use] = empty();
  ship.use = -1;
  ship.useT = 0;
}

export { isUse, isWeapon };

import { aim, burst, fights, launch, targets, touches } from './combat.ts';
import type { Sea } from './environment.ts';
import { FLAG, type ShipInput } from './input.ts';
import { addScaled, dcos, dot, normalize, rngFloat, rngInt, set, v3, type V3 } from './math.ts';
import { R, TERRITORY, cellOf } from './sphere.ts';
import { EVENT, SHIPS, STREAM, TICK, afloat, chronicle, emit, fullHull, type MatchState, type Ship } from './state.ts';
import {
  BATTERY, CONSUMABLE, CONSUMABLES, EFFECT, FITTING, FITTING_SLOT, FORMS, KEGS, KITS, LOOKOUT, LOOT, MORTAR, OUTFIT, SIGHT,
  SLOT, STERN_GLASS, TIERS,
} from './tables.ts';
import type { Sight } from './visibility.ts';
import { REGIONS } from './world/regions.ts';

export interface Item {
  kind: number;
  tier: number;
}

export const OFFERS = 3;

export const isConsumable = (kind: number): boolean => kind >= CONSUMABLE.patchKit;

const LIT = ['patch', 'ward', 'boost', 'flask', 'flare'] as const;

const NONE: Item = { kind: FITTING.none, tier: 0 };
const KEG_COS = dcos(KEGS.arc), LOOKOUT_COS = LOOKOUT.map((u) => dcos(u / R)), WEIGHT = new Array<number>(TIERS).fill(0);
const A = v3(), D = v3(), P = v3();

export function items(sea: Sea, state: MatchState, inputs: readonly ShipInput[], sights: readonly Sight[]): void {
  const open = targets(sea, state);
  for (let i = 0; i < SHIPS; i++) {
    const ship = state.ships[i], input = inputs[i];
    if (!afloat(ship)) continue;
    burn(ship);
    if (input.chestPick >= 0) choose(state, i, input.chestPick);
    if (!fights(ship)) continue;
    if (input.consumable >= 0) use(state, i, input.consumable);
    astern(sea, state, i, input, sights[i].ships & open);
  }
  pickUp(state);
  kegs(state, open);
}

export function afloatChest(state: MatchState, at: V3, tier: number, fitting: Item, from: number): void {
  state.chests.push({ at: { x: at.x, y: at.y, z: at.z }, tier, fitting: { kind: fitting.kind, tier: fitting.tier }, from });
  emit(state, EVENT.chest, from, fitting.kind, at, tier);
}

export function deliver(state: MatchState, i: number, tier: number): void {
  if (state.ships[i].offer.length > 0) afloatChest(state, state.ships[i].pos, tier, NONE, -1);
  else open(state, i, tier, NONE, -1);
}

export function poolTop(rank: number): number {
  let top = 0;
  while (top + 1 < TIERS && LOOT.enters[top + 1] <= rank) top++;
  return top;
}

export function chestTier(sea: Sea, state: MatchState, at: V3, most = TIERS - 1): number {
  const rich = REGIONS[sea.geo.region[cellOf(TERRITORY, at)]].richness, top = Math.min(most, poolTop(state.rank));
  let total = 0;
  for (let t = 0, r = 1; t <= top; t++, r *= rich) {
    WEIGHT[t] = LOOT.weight[t] * (1 + LOOT.climb * (state.rank - LOOT.enters[t])) * r;
    total += WEIGHT[t];
  }
  let x = rngFloat(state.rng[STREAM.loot]) * total, t = 0;
  while (t < top && (x -= WEIGHT[t]) >= 0) t++;
  return t;
}

function open(state: MatchState, i: number, tier: number, held: Item, from: number): void {
  const ship = state.ships[i], rng = state.rng[STREAM.loot], t = Math.min(tier, poolTop(state.rank));
  if (held.kind !== FITTING.none) ship.offer.push({ kind: held.kind, tier: held.tier });
  while (ship.offer.length < OFFERS) {
    const kind = rngFloat(rng) < LOOT.consumable[t] ? CONSUMABLE.patchKit + rngInt(rng, LIT.length) : 1 + rngInt(rng, FITTING_SLOT.length - 1);
    if (ship.offer.every((o) => o.kind !== kind)) ship.offer.push({ kind, tier: t });
  }
  emit(state, EVENT.opened, i, from, ship.pos, tier);
}

function pickUp(state: MatchState): void {
  const chests = state.chests;
  let kept = 0;
  for (let c = 0; c < chests.length; c++) {
    const chest = chests[c];
    let taker = -1;
    for (let i = 0; i < SHIPS && taker < 0; i++) {
      const ship = state.ships[i];
      if (i !== chest.from && fights(ship) && ship.offer.length === 0 && touches(ship, chest.at, LOOT.reach)) taker = i;
    }
    if (taker >= 0) open(state, taker, chest.tier, chest.fitting, chest.from);
    else chests[kept++] = chest;
  }
  chests.length = kept;
}

export function canTake(ship: Ship, item: Item): boolean {
  return !isConsumable(item.kind) || ship.consumables.some((s) => s.kind === item.kind || s.count === 0);
}

function choose(state: MatchState, i: number, k: number): void {
  const ship = state.ships[i], item = ship.offer[k];
  if (item === undefined || !canTake(ship, item)) return;
  if (isConsumable(item.kind)) stow(ship, item.kind, LOOT.count[item.tier]);
  else fit(state, i, item);
  emit(state, EVENT.chosen, i, item.kind, ship.pos, item.tier);
  chronicle(state, EVENT.chosen, i, item.kind, item.tier);
  ship.offer.length = 0;
}

function stow(ship: Ship, kind: number, count: number): void {
  let k = ship.consumables.findIndex((s) => s.kind === kind);
  if (k < 0) k = ship.consumables.findIndex((s) => s.count === 0);
  ship.consumables[k].kind = kind;
  ship.consumables[k].count += count;
}

function fit(state: MatchState, i: number, item: Item): void {
  const ship = state.ships[i], slot = FITTING_SLOT[item.kind], old = ship.fittings[slot], was = fullHull(ship.form, ship.fittings);
  if (old.kind !== FITTING.none) {
    normalize(addScaled(A, ship.pos, ship.head, -(FORMS[ship.form].half + LOOT.astern) / R));
    afloatChest(state, A, old.tier, old, i);
    emit(state, EVENT.swapped, i, old.kind, ship.pos, old.tier);
  }
  ship.fittings[slot] = { kind: item.kind, tier: item.tier };
  const full = fullHull(ship.form, ship.fittings);
  ship.hull = Math.min(full, ship.hull + Math.max(0, full - was));
}

function burn(ship: Ship): void {
  if (ship.patch > 0) {
    const full = fullHull(ship.form, ship.fittings);
    ship.hull = Math.min(full, ship.hull + (CONSUMABLES.patch * full * Math.min(TICK, ship.patch)) / CONSUMABLES.time[0]);
  }
  for (const key of LIT) ship[key] = Math.max(0, ship[key] - TICK);
  ship.cut = Math.max(0, ship.cut - TICK);
}

function use(state: MatchState, i: number, k: number): void {
  const ship = state.ships[i], slot = ship.consumables[k];
  if (slot === undefined || slot.count === 0) return;
  const c = slot.kind - CONSUMABLE.patchKit, key = LIT[c];
  if (ship[key] > 0) return;
  ship[key] = CONSUMABLES.time[c];
  slot.count--;
  emit(state, EVENT.used, i, slot.kind, ship.pos, slot.count);
  if (slot.count === 0) slot.kind = 0;
}

function astern(sea: Sea, state: MatchState, i: number, input: ShipInput, seen: number): void {
  const ship = state.ships[i], fitting = ship.fittings[SLOT.stern];
  if (ship.reload[BATTERY.stern] > 0) return;
  if (fitting.kind === FITTING.mortar && (input.flags & FLAG.useAimed) !== 0) {
    const j = aim(sea, state, i, seen, input.aim, MORTAR.range, MORTAR.speed, P);
    if (j < 0) return;
    launch(state, i, FITTING.mortar, ship.pos, P, MORTAR, fitting.tier);
    ship.reload[BATTERY.stern] = MORTAR.reload;
    emit(state, EVENT.mortar, i, j, P, state.shots[state.shots.length - 1].time);
  } else if (fitting.kind === FITTING.powderKegs && pursued(state, i, seen)) {
    normalize(addScaled(A, ship.pos, ship.head, -(FORMS[ship.form].half + KEGS.trigger) / R));
    state.kegs.push({ ship: i, at: { x: A.x, y: A.y, z: A.z }, age: 0, tier: fitting.tier });
    ship.reload[BATTERY.stern] = KEGS.reload;
    emit(state, EVENT.keg, i, -1, A, fitting.tier);
  }
}

function pursued(state: MatchState, i: number, seen: number): boolean {
  const ship = state.ships[i];
  for (let j = 0; j < SHIPS; j++) {
    if (j === i || (seen & (1 << j)) === 0) continue;
    const q = state.ships[j].pos;
    set(D, q.x - ship.pos.x, q.y - ship.pos.y, q.z - ship.pos.z);
    const d = Math.sqrt(dot(D, D));
    if (d * R <= KEGS.range && -dot(D, ship.head) >= KEG_COS * d) return true;
  }
  return false;
}

function kegs(state: MatchState, open: number): void {
  const all = state.kegs;
  let kept = 0;
  for (let k = 0; k < all.length; k++) {
    const keg = all[k];
    keg.age += TICK;
    let by = -1;
    for (let j = 0; j < SHIPS && by < 0 && keg.age >= KEGS.arm; j++) {
      if (j !== keg.ship && (open & (1 << j)) !== 0 && fights(state.ships[j]) && touches(state.ships[j], keg.at, KEGS.trigger)) by = j;
    }
    if (by < 0 && keg.age < KEGS.fuse) {
      all[kept++] = keg;
      continue;
    }
    const struck = burst(state, keg.ship, keg.at, KEGS.blast, KEGS.damage[keg.tier], EFFECT.none, 0, open);
    emit(state, EVENT.kegBurst, keg.ship, by, keg.at, struck);
  }
  all.length = kept;
}

export function worth(ship: Ship, item: Item): number {
  if (!canTake(ship, item)) return -Infinity;
  if (isConsumable(item.kind)) return LOOT.count[item.tier] * LOOT.worth;
  const held = ship.fittings[FITTING_SLOT[item.kind]];
  return item.tier + 1 - (held.kind === FITTING.none ? 0 : held.tier + 1);
}

export function bestPick(ship: Ship): number {
  let best = -1, most = -Infinity;
  for (let k = 0; k < ship.offer.length; k++) {
    const w = worth(ship, ship.offer[k]) + (KITS[ship.captain.temperament]?.includes(ship.offer[k].kind) ? 0.5 : 0);
    if (w > most) {
      most = w;
      best = k;
    }
  }
  return best;
}

export function startingFittings(rank: number, temperament = -1): Item[] {
  const tier = poolTop(rank - 1), kit = KITS[temperament];
  return OUTFIT.map(({ at, kind }, s) => (rank >= at ? { kind: kit ? kit[s] : kind, tier } : { kind: FITTING.none, tier: 0 }));
}

const rated = (fitting: Item, kind: number, table: readonly number[]): number => (fitting.kind === kind ? table[fitting.tier] : 0);

export const sternGlass = (ship: Ship): number => rated(ship.fittings[SLOT.lookout], FITTING.sternGlass, STERN_GLASS);

export const crowsNest = (ship: Ship): number => rated(ship.fittings[SLOT.lookout], FITTING.crowsNest, SIGHT.crowsNest);

export function lookout(state: MatchState, i: number, sight: Sight): number {
  const ship = state.ships[i], look = ship.fittings[SLOT.lookout], known = sight.ships | sight.marks;
  if (look.kind !== FITTING.lookout) return 0;
  let mask = 0;
  for (let j = 0; j < SHIPS; j++) {
    if (j !== i && (known & (1 << j)) !== 0 && dot(ship.pos, state.ships[j].pos) >= LOOKOUT_COS[look.tier]) mask |= 1 << j;
  }
  return mask;
}

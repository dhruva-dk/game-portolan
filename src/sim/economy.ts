// Doubloons in a match (WP7): the purse that sailing an open trail fills and a closed loop banks (territory.ts), the
// income held sea pays straight into the bank, and the coins a broken trail spills (WP8: and a sunk ship) for any hull
// to scoop. Part B adds the finds here: wrecks, flotsam, drifting bottles, island caches and the Caldera's rain.
import { cross, dcos, dsin, normalize, set, v3, type V3 } from './math.ts';
import { AREA_Q, R } from './sphere.ts';
import { EVENT, SHIPS, TICK, emit, type Coin, type MatchState } from './state.ts';
import { COINS, ECONOMY, FORMS } from './tables.ts';

/** The golden angle, radians: a spill's coins spiral out from the break without bunching. */
const GOLDEN = 2.399963229728653;
/** COINS.reach as a squared chord of the unit sphere. */
const REACH = (COINS.reach / R) * (COINS.reach / R);
const AXIS_Y = v3(0, 1, 0), AXIS_X = v3(1, 0, 0), E = v3(), N = v3();

/** Ship i sailed `dist` u on its open trail: the purse fills, up to its form's capacity. */
export function fill(state: MatchState, i: number, dist: number): void {
  const ship = state.ships[i];
  ship.purse = Math.min(FORMS[ship.form].purse, ship.purse + dist * ECONOMY.trail);
}

/** Ship i's purse goes into its bank: the loop it was sailing has closed. */
export function bankPurse(state: MatchState, i: number): void {
  const ship = state.ships[i], amount = ship.purse;
  if (amount === 0) return;
  ship.bank += amount;
  ship.purse = 0;
  emit(state, EVENT.bank, i, -1, ship.pos, amount);
}

/** One tick of income: the sea each ship holds (ship.held, kept by territory.ts) pays straight into its bank. */
export function earn(state: MatchState): void {
  for (let i = 0; i < SHIPS; i++) {
    const ship = state.ships[i];
    ship.bank += (ship.held / AREA_Q) * ECONOMY.income * TICK;
  }
}

/**
 * `amount` doubloons spill into the sea at `at` as floating coins spiralling out from it; `from` is the ship whose they
 * were. A full sea gives the oldest coins' places to the new ones.
 */
export function spill(state: MatchState, at: V3, amount: number, from: number): void {
  const n = Math.max(1, Math.min(COINS.most, Math.ceil(amount / COINS.each)));
  normalize(cross(E, Math.abs(at.y) < 0.9 ? AXIS_Y : AXIS_X, at));
  cross(N, at, E);
  for (let k = 0; k < n; k++) {
    const coin = state.coins[slot(state)], r = (COINS.scatter / R) * Math.sqrt((k + 0.5) / n);
    const c = dcos(k * GOLDEN) * r, s = dsin(k * GOLDEN) * r;
    normalize(set(coin.at, at.x + E.x * c + N.x * s, at.y + E.y * c + N.y * s, at.z + E.z * c + N.z * s));
    coin.value = amount / n;
    coin.age = 0;
  }
  emit(state, EVENT.spill, from, -1, at, amount);
}

/** A free coin's place, or the oldest coin's when the sea is full (the lowest index among equals). */
function slot(state: MatchState): number {
  let oldest = 0;
  for (let k = 0; k < COINS.count; k++) {
    const coin = state.coins[k];
    if (coin.value === 0) return k;
    if (coin.age > state.coins[oldest].age) oldest = k;
  }
  return oldest;
}

/**
 * One tick of the coins afloat: each ages and sinks at the end of its life, and the hulls within reach scoop it, the
 * lowest index first: into the purse while that ship sails an open trail (as much as the purse has room for; the rest
 * stays afloat), otherwise straight into the bank.
 */
export function scoop(state: MatchState): void {
  for (const coin of state.coins) {
    if (coin.value === 0) continue;
    coin.age += TICK;
    if (coin.age >= COINS.life) {
      coin.value = 0;
      continue;
    }
    for (let i = 0; i < SHIPS && coin.value > 0; i++) {
      const p = state.ships[i].pos, dx = p.x - coin.at.x, dy = p.y - coin.at.y, dz = p.z - coin.at.z;
      if (dx * dx + dy * dy + dz * dz <= REACH) take(state, i, coin);
    }
  }
}

function take(state: MatchState, i: number, coin: Coin): void {
  const ship = state.ships[i], cap = FORMS[ship.form].purse, trail = ship.laid.length > 0;
  const amount = trail ? Math.min(coin.value, cap - ship.purse) : coin.value;
  if (amount <= 0) return;
  if (trail) ship.purse = amount < coin.value ? cap : ship.purse + amount;
  else ship.bank += amount;
  coin.value = amount < coin.value ? coin.value - amount : 0;
  emit(state, EVENT.scoop, i, -1, coin.at, amount);
}

import { aground, currentAt, type Sea } from './environment.ts';
import { addScaled, cross, dcos, dot, dsin, hash32, normalize, rngInt, rngRange, set, v3, type V3 } from './math.ts';
import { AREA_Q, R, TERRITORY, advance, cellOf } from './sphere.ts';
import { AFLOAT, EVENT, SHIPS, STREAM, TICK, afloat, chronicle, emit, type Coin, type MatchState } from './state.ts';
import { CALDERA, COINS, ECONOMY, FINDS, FORMS, PERK } from './tables.ts';
import { holder } from './territory.ts';
import { REGIONS } from './world/regions.ts';

const GOLDEN = 2.399963229728653;
const REACH = (COINS.reach / R) * (COINS.reach / R);
const AXIS_Y = v3(0, 1, 0), AXIS_X = v3(1, 0, 0), E = v3(), N = v3(), P = v3(), V = v3(), DIR = v3();
const LIFE = [COINS.life, FINDS.flotsam.life, FINDS.bottle.life];
const BESIDE = { wreck: dcos(FINDS.wreck.reach / R), cache: dcos(FINDS.cache.reach / R) };
const FLOTSAM_EVERY = Math.round(FINDS.flotsam.every / TICK), BOTTLE_EVERY = Math.round(FINDS.bottle.every / TICK);
const PERIOD = Math.round(REGIONS.find((r) => r.mechanics.eruption)!.mechanics.eruption! / TICK);
const BURST = Math.round(CALDERA.burst / TICK), DROP = Math.round(CALDERA.drop / TICK), PHASE = 0xca1de7a;

export function fill(state: MatchState, i: number, dist: number): void {
  const ship = state.ships[i];
  ship.purse = Math.min(FORMS[ship.form].purse, ship.purse + dist * ECONOMY.trail);
}

export function bankPurse(state: MatchState, i: number): void {
  const ship = state.ships[i], amount = ship.purse;
  if (amount === 0) return;
  ship.bank += amount;
  ship.purse = 0;
  emit(state, EVENT.bank, i, -1, ship.pos, amount);
}

export function earn(sea: Sea, state: MatchState): void {
  const weeping = holder(sea, state, 'weepingIsle');
  for (let i = 0; i < SHIPS; i++) {
    const ship = state.ships[i];
    ship.bank += (ship.held / AREA_Q) * ECONOMY.income * TICK * (i === weeping ? PERK.weepingIsle : 1);
  }
}

export function spill(state: MatchState, at: V3, amount: number, from: number): void {
  const n = Math.max(1, Math.min(COINS.most, Math.ceil(amount / COINS.each)));
  scatter(state, at, amount, n, COINS.scatter, AFLOAT.coin);
  emit(state, EVENT.spill, from, -1, at, amount);
}

function scatter(state: MatchState, at: V3, amount: number, n: number, radius: number, kind: number): void {
  normalize(cross(E, Math.abs(at.y) < 0.9 ? AXIS_Y : AXIS_X, at));
  cross(N, at, E);
  for (let k = 0; k < n; k++) {
    const r = (radius / R) * Math.sqrt((k + 0.5) / n), c = dcos(k * GOLDEN) * r, s = dsin(k * GOLDEN) * r;
    normalize(set(P, at.x + E.x * c + N.x * s, at.y + E.y * c + N.y * s, at.z + E.z * c + N.z * s));
    float(state, P, amount / n, kind);
  }
}

function float(state: MatchState, at: V3, value: number, kind: number): void {
  const thing = state.coins[slot(state)];
  set(thing.at, at.x, at.y, at.z);
  thing.kind = kind;
  thing.value = value;
  thing.age = 0;
}

function slot(state: MatchState): number {
  let oldest = 0;
  for (let k = 0; k < COINS.count; k++) {
    const coin = state.coins[k];
    if (coin.value === 0) return k;
    if (coin.age > state.coins[oldest].age) oldest = k;
  }
  return oldest;
}

export function scoop(state: MatchState): void {
  for (const coin of state.coins) {
    if (coin.value === 0) continue;
    coin.age += TICK;
    if (coin.age >= LIFE[coin.kind]) {
      coin.value = 0;
      continue;
    }
    for (let i = 0; i < SHIPS && coin.value > 0; i++) {
      if (!afloat(state.ships[i])) continue;
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
  emit(state, EVENT.scoop, i, coin.kind, coin.at, amount);
}

export const siteValue = (sea: Sea, k: number): number => FINDS[sea.geo.finds[k].kind].value * sea.geo.finds[k].richness;

export function forage(sea: Sea, state: MatchState): void {
  drift(sea, state);
  if (state.tick > 0 && state.tick % FLOTSAM_EVERY === 0) shed(sea, state);
  if (state.tick > 0 && state.tick % BOTTLE_EVERY === 0) castBottle(sea, state);
  rain(sea, state);
  for (let k = 0; k < state.finds.length; k++) state.finds[k] = Math.max(0, state.finds[k] - TICK);
  for (let i = 0; i < SHIPS; i++) if (afloat(state.ships[i])) hold(sea, state, i);
}

function hold(sea: Sea, state: MatchState, i: number): void {
  const ship = state.ships[i], sites = sea.geo.finds;
  let best = -1, nearest = -1;
  for (let k = 0; k < sites.length; k++) {
    const d = dot(ship.pos, sites[k].pos);
    if (state.finds[k] === 0 && d >= BESIDE[sites[k].kind] && d > nearest) {
      best = k;
      nearest = d;
    }
  }
  if (best !== ship.prize) {
    ship.prize = best;
    ship.holding = 0;
  }
  if (best < 0) return;
  ship.holding += TICK;
  const kind = FINDS[sites[best].kind];
  if (ship.holding < kind.hold - TICK / 2) return;
  const amount = siteValue(sea, best);
  ship.bank += amount;
  ship.prize = -1;
  ship.holding = 0;
  state.finds[best] = kind.refill * rngRange(state.rng[STREAM.loot], 1 - FINDS.jitter, 1 + FINDS.jitter);
  emit(state, EVENT.find, i, best, sites[best].pos, amount);
  chronicle(state, EVENT.find, i, best, amount);
}

function shed(sea: Sea, state: MatchState): void {
  const sites = sea.geo.finds, wrecks: number[] = [];
  for (let k = 0; k < sites.length; k++) if (sites[k].kind === 'wreck' && state.finds[k] === 0) wrecks.push(k);
  if (wrecks.length === 0) return;
  const site = sites[wrecks[rngInt(state.rng[STREAM.loot], wrecks.length)]], { value, pieces } = FINDS.flotsam;
  scatter(state, site.pos, value * site.richness * pieces, pieces, FINDS.flotsam.scatter, AFLOAT.flotsam);
  emit(state, EVENT.afloat, -1, AFLOAT.flotsam, site.pos, value * site.richness * pieces);
}

function castBottle(sea: Sea, state: MatchState): void {
  const rng = state.rng[STREAM.loot];
  for (let t = 0; t < FINDS.bottle.tries; t++) {
    const z = rngRange(rng, -1, 1), a = rngRange(rng, 0, 2 * Math.PI), s = Math.sqrt(1 - z * z);
    set(P, s * dcos(a), s * dsin(a), z);
    if (aground(sea, state, P)) continue;
    const amount = FINDS.bottle.value * REGIONS[sea.geo.region[cellOf(TERRITORY, P)]].richness;
    float(state, P, amount, AFLOAT.bottle);
    emit(state, EVENT.afloat, -1, AFLOAT.bottle, P, amount);
    return;
  }
}

function drift(sea: Sea, state: MatchState): void {
  for (const thing of state.coins) {
    if (thing.value === 0 || thing.kind === AFLOAT.coin) continue;
    normalize(addScaled(P, thing.at, currentAt(sea, thing.at, V), TICK / R));
    if (!aground(sea, state, P)) set(thing.at, P.x, P.y, P.z);
  }
}

const cycle = (state: MatchState): number => (state.tick + ((hash32(state.seed, PHASE) >>> 0) % PERIOD)) % PERIOD;

export function eruption(state: MatchState): number {
  const u = cycle(state);
  return u < BURST ? u / BURST : -1;
}

export function untilEruption(state: MatchState): number {
  const u = cycle(state);
  return u < BURST ? 0 : (PERIOD - u) * TICK;
}

function rain(sea: Sea, state: MatchState): void {
  const u = cycle(state);
  if (u >= BURST || u % DROP !== 0) return;
  const mark = sea.geo.landmarks.find((l) => l.perk === 'caldera')!, who = holder(sea, state, 'caldera');
  const rng = state.rng[STREAM.loot], e = mark.facing, r0 = mark.r, r1 = mark.r + CALDERA.spread;
  if (u === 0) emit(state, EVENT.erupt, who, -1, mark.pos, CALDERA.value);
  cross(N, e, mark.pos);
  for (let t = 0; t < CALDERA.tries; t++) {
    const a = rngRange(rng, 0, 2 * Math.PI), d = Math.sqrt(r0 * r0 + rngRange(rng, 0, 1) * (r1 * r1 - r0 * r0));
    const c = dcos(a), s = dsin(a);
    advance(mark.pos, set(DIR, e.x * c + N.x * s, e.y * c + N.y * s, e.z * c + N.z * s), d, P, V);
    if (aground(sea, state, P) || (who >= 0 && state.owner[cellOf(TERRITORY, P)] !== who + 1)) continue;
    float(state, P, CALDERA.value / (BURST / DROP), AFLOAT.coin);
    return;
  }
}

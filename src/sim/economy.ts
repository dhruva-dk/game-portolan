// Doubloons in a match (WP7): the purse that sailing an open trail fills and a closed loop banks (territory.ts), the
// income held sea pays straight into the bank, and the coins a broken trail spills (WP8: and a sunk ship) for any hull
// to scoop; and the finds: wrecks and island caches taken by holding beside them, flotsam and drifting bottles scooped
// like coins, and the Caldera's rain into its holder's waters.
import { aground, currentAt, type Sea } from './environment.ts';
import { addScaled, cross, dcos, dot, dsin, hash32, normalize, rngInt, rngRange, set, v3, type V3 } from './math.ts';
import { AREA_Q, R, TERRITORY, advance, cellOf } from './sphere.ts';
import { AFLOAT, EVENT, SHIPS, STREAM, TICK, afloat, chronicle, emit, type Coin, type MatchState } from './state.ts';
import { CALDERA, COINS, ECONOMY, FINDS, FORMS, PERK } from './tables.ts';
import { holder } from './territory.ts';
import { REGIONS } from './world/regions.ts';

/** The golden angle, radians: a spill's coins spiral out from the break without bunching. */
const GOLDEN = 2.399963229728653;
/** COINS.reach as a squared chord of the unit sphere. */
const REACH = (COINS.reach / R) * (COINS.reach / R);
const AXIS_Y = v3(0, 1, 0), AXIS_X = v3(1, 0, 0), E = v3(), N = v3(), P = v3(), V = v3(), DIR = v3();
/** How long each AFLOAT kind floats, s. */
const LIFE = [COINS.life, FINDS.flotsam.life, FINDS.bottle.life];
/** Each find kind's reach as the cosine of its angle. */
const BESIDE = { wreck: dcos(FINDS.wreck.reach / R), cache: dcos(FINDS.cache.reach / R) };
/** The finds' and the Caldera's rhythms, in ticks; PHASE keys the seed's offset of the Caldera's cycle. */
const FLOTSAM_EVERY = Math.round(FINDS.flotsam.every / TICK), BOTTLE_EVERY = Math.round(FINDS.bottle.every / TICK);
const PERIOD = Math.round(REGIONS.find((r) => r.mechanics.eruption)!.mechanics.eruption! / TICK);
const BURST = Math.round(CALDERA.burst / TICK), DROP = Math.round(CALDERA.drop / TICK), PHASE = 0xca1de7a;

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

/**
 * One tick of income: the sea each ship holds (ship.held, kept by territory.ts) pays straight into its bank, twice over
 * for the holder of the Weeping Isle.
 */
export function earn(sea: Sea, state: MatchState): void {
  const weeping = holder(sea, state, 'weepingIsle');
  for (let i = 0; i < SHIPS; i++) {
    const ship = state.ships[i];
    ship.bank += (ship.held / AREA_Q) * ECONOMY.income * TICK * (i === weeping ? PERK.weepingIsle : 1);
  }
}

/**
 * `amount` doubloons spill into the sea at `at` as floating coins spiralling out from it; `from` is the ship whose they
 * were. A full sea gives the oldest coins' places to the new ones.
 */
export function spill(state: MatchState, at: V3, amount: number, from: number): void {
  const n = Math.max(1, Math.min(COINS.most, Math.ceil(amount / COINS.each)));
  scatter(state, at, amount, n, COINS.scatter, AFLOAT.coin);
  emit(state, EVENT.spill, from, -1, at, amount);
}

/** `amount` doubloons come afloat at `at` as n things of an AFLOAT kind, spiralling out from it within `radius` u. */
function scatter(state: MatchState, at: V3, amount: number, n: number, radius: number, kind: number): void {
  normalize(cross(E, Math.abs(at.y) < 0.9 ? AXIS_Y : AXIS_X, at));
  cross(N, at, E);
  for (let k = 0; k < n; k++) {
    const r = (radius / R) * Math.sqrt((k + 0.5) / n), c = dcos(k * GOLDEN) * r, s = dsin(k * GOLDEN) * r;
    normalize(set(P, at.x + E.x * c + N.x * s, at.y + E.y * c + N.y * s, at.z + E.z * c + N.z * s));
    float(state, P, amount / n, kind);
  }
}

/** One thing of an AFLOAT kind comes afloat at `at`, worth `value`. */
function float(state: MatchState, at: V3, value: number, kind: number): void {
  const thing = state.coins[slot(state)];
  set(thing.at, at.x, at.y, at.z);
  thing.kind = kind;
  thing.value = value;
  thing.age = 0;
}

/** A free place afloat, or the oldest thing's when the sea is full (the lowest index among equals). */
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
 * One tick of what floats: each ages and is gone at the end of its kind's life, and the hulls within reach scoop it, the
 * lowest index first: into the purse while that ship sails an open trail (as much as the purse has room for; the rest
 * stays afloat), otherwise straight into the bank.
 */
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

// ---------------------------------------------------------------------------------------------------------------
// Finds (PROMPT.md, Doubloons): the wrecks and island caches at the world's find sites, taken by holding beside them;
// the flotsam wrecks shed and the bottles adrift at sea, scooped like coins; and the Caldera's rain.

/** A find site's worth while it is there to take (Geography.finds order): its kind's value by its region's richness. */
export const siteValue = (sea: Sea, k: number): number => FINDS[sea.geo.finds[k].kind].value * sea.geo.finds[k].richness;

/**
 * One tick of finds, after the ships have moved: what floats drifts, a wreck sheds flotsam and a bottle comes afloat on
 * their rhythms, the Caldera rains on its own, emptied sites come back nearer, and each ship holds beside a find.
 */
export function forage(sea: Sea, state: MatchState): void {
  drift(sea, state);
  if (state.tick > 0 && state.tick % FLOTSAM_EVERY === 0) shed(sea, state);
  if (state.tick > 0 && state.tick % BOTTLE_EVERY === 0) castBottle(sea, state);
  rain(sea, state);
  for (let k = 0; k < state.finds.length; k++) state.finds[k] = Math.max(0, state.finds[k] - TICK);
  for (let i = 0; i < SHIPS; i++) if (afloat(state.ships[i])) hold(sea, state, i);
}

/**
 * Ship i beside the find sites: the nearest one there to take within its kind's reach is the prize it holds for; held
 * long enough, it goes into the bank and the site comes back after its kind's refill (give or take FINDS.jitter, by the
 * loot stream). Moving out of reach, or beside another, starts the hold again; a rival taking it first ends it.
 */
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

/** A wreck there to take, picked by the loot stream, sheds flotsam round it, worth its region's richness. */
function shed(sea: Sea, state: MatchState): void {
  const sites = sea.geo.finds, wrecks: number[] = [];
  for (let k = 0; k < sites.length; k++) if (sites[k].kind === 'wreck' && state.finds[k] === 0) wrecks.push(k);
  if (wrecks.length === 0) return;
  const site = sites[wrecks[rngInt(state.rng[STREAM.loot], wrecks.length)]], { value, pieces } = FINDS.flotsam;
  scatter(state, site.pos, value * site.richness * pieces, pieces, FINDS.flotsam.scatter, AFLOAT.flotsam);
  emit(state, EVENT.afloat, -1, AFLOAT.flotsam, site.pos, value * site.richness * pieces);
}

/** A bottle comes afloat at sea where the loot stream picks, uniformly over the planet, worth its region's richness. */
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

/** Flotsam and bottles drift on the currents, never onto the shore; coins lie where they fell. */
function drift(sea: Sea, state: MatchState): void {
  for (const thing of state.coins) {
    if (thing.value === 0 || thing.kind === AFLOAT.coin) continue;
    normalize(addScaled(P, thing.at, currentAt(sea, thing.at, V), TICK / R));
    if (!aground(sea, state, P)) set(thing.at, P.x, P.y, P.z);
  }
}

/** Ticks into the Caldera's cycle: it erupts at 0 and rains for BURST ticks of every PERIOD; the seed sets its phase. */
const cycle = (state: MatchState): number => (state.tick + ((hash32(state.seed, PHASE) >>> 0) % PERIOD)) % PERIOD;

/** How far the Caldera is through an eruption, 0…1, or −1 while it sleeps: for the renderer's fire, ash and gold. */
export function eruption(state: MatchState): number {
  const u = cycle(state);
  return u < BURST ? u / BURST : -1;
}

/** Seconds until the Caldera next erupts, 0 while it erupts: for the captains and the interface. */
export function untilEruption(state: MatchState): number {
  const u = cycle(state);
  return u < BURST ? 0 : (PERIOD - u) * TICK;
}

/**
 * The Caldera's rain, every DROP ticks of an eruption: a coin worth its share of CALDERA.value falls where the loot
 * stream picks within CALDERA.spread u of its shore (the landmark's radius), in its holder's waters (CALDERA.tries
 * points, else into the crater, lost), or anywhere at sea round it while nobody holds it.
 */
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

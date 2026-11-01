import { aim, fights } from './combat.ts';
import type { Sea } from './environment.ts';
import { FLAG, type ShipInput } from './input.ts';
import { afloatChest, chestTier, deliver } from './items.ts';
import { PI, addScaled, dcos, dot, normalize, set, v3, type V3 } from './math.ts';
import { R, horizonDistance, tangentAt } from './sphere.ts';
import { AFLOAT, EVENT, FLIGHT, SHIPS, TICK, afloat, emit, fullHull, type Gull, type MatchState, type Ship } from './state.ts';
import { calmNow } from './storm.ts';
import { COINS, FITTING, GULL } from './tables.ts';
import { chestSpeed, gullPrice } from './territory.ts';
import type { Eye, Sight } from './visibility.ts';

const LOOT_ONLY = { kind: FITTING.none, tier: 0 };

const LEGS = [GULL.legs.out, GULL.legs.away, GULL.legs.back, GULL.legs.circle];

const MARK_COS = GULL.eye.height.map((h) => dcos(horizonDistance(h) / R));
const NEAR_COS = dcos(GULL.danger.near / R), DIVE_COS = dcos(GULL.dive.near / R), SPILL_COS = dcos((COINS.scatter + 0.5) / R);

const T = v3(), POINT = v3(), FINDS: number[] = [], CHESTS: number[] = [];
const EYE: Eye[] = Array.from({ length: SHIPS }, () => ({ at: v3(), height: 0, dive: -1, scouts: false }));
const EYES: (Eye | null)[] = Array.from({ length: SHIPS }, (): Eye | null => null);

export const perched = (gull: Gull): boolean => gull.flight <= FLIGHT.wheel;

export const callPrice = (sea: Sea, state: MatchState, i: number): number => gullPrice(sea, state, i, GULL.price);

export function scout(ship: Ship, out: V3): V3 {
  return normalize(addScaled(out, ship.pos, ship.head, GULL.eye.ahead[ship.gull.eye] / R));
}

export function bound(state: MatchState, j: number): V3 | null {
  const g = state.ships[j].gull;
  if (g.flight === FLIGHT.back || g.flight === FLIGHT.circle) return state.ships[j].pos;
  return g.flight === FLIGHT.dive ? state.ships[g.prey].pos : null;
}

export function gullEyes(state: MatchState): readonly (Eye | null)[] {
  for (let i = 0; i < SHIPS; i++) {
    const ship = state.ships[i], g = ship.gull, eye = EYE[i];
    EYES[i] = null;
    eye.height = GULL.fly;
    eye.scouts = false;
    eye.dive = g.flight === FLIGHT.dive ? g.prey : -1;
    if (g.flight === FLIGHT.out || g.flight >= FLIGHT.back) set(eye.at, g.at.x, g.at.y, g.at.z);
    else if (g.flight === FLIGHT.away || g.eye === 0 || !afloat(ship)) continue;
    else {
      scout(ship, eye.at);
      eye.height = GULL.eye.height[g.eye];
      eye.scouts = true;
    }
    EYES[i] = eye;
  }
  return EYES;
}

export function gulls(sea: Sea, state: MatchState, inputs: readonly ShipInput[], sights: readonly Sight[]): void {
  beak(state);
  const calm = calmNow(state), edge = dcos(Math.max(0, calm.r - GULL.danger.storm / R));
  for (let i = 0; i < SHIPS; i++) {
    const ship = state.ships[i], g = ship.gull, input = inputs[i], seen = sights[i].ships;
    if (g.flight >= FLIGHT.out && g.flight <= FLIGHT.circle) fly(state, i);
    if (!afloat(ship)) {
      if (g.flight === FLIGHT.dive) g.flight = FLIGHT.mast;
      continue;
    }
    g.cool = Math.max(0, g.cool - TICK);
    if (g.flight === FLIGHT.dive) hold(state, i);
    if (fights(ship) && perched(g)) {
      if ((input.flags & FLAG.callGull) !== 0) call(sea, state, i);
      else if ((input.flags & FLAG.dive) !== 0) dive(sea, state, i, input.aim, seen);
    }
    if (perched(g)) {
      g.flight = danger(state, i, seen, calm.at, edge) ? FLIGHT.wheel : FLIGHT.mast;
      set(g.at, ship.pos.x, ship.pos.y, ship.pos.z);
    }
    spot(sea, state, i, seen);
  }
}

function call(sea: Sea, state: MatchState, i: number): void {
  const ship = state.ships[i], g = ship.gull, price = callPrice(sea, state, i);
  if (ship.bank + ship.purse < price) return;
  const banked = Math.min(ship.bank, price);
  ship.bank -= banked;
  ship.purse -= price - banked;
  g.tier = chestTier(sea, state, ship.pos, g.talons);
  g.span = GULL.flight[g.wings] / chestSpeed(sea, state, i);
  g.flight = FLIGHT.out;
  g.time = g.span * GULL.legs.out;
  set(g.dir, ship.head.x, ship.head.y, ship.head.z);
  emit(state, EVENT.called, i, -1, ship.pos, price);
}

function fly(state: MatchState, i: number): void {
  const ship = state.ships[i], g = ship.gull, leg = g.span * LEGS[g.flight - FLIGHT.out], done = Math.min(1, 1 - (g.time - TICK) / leg);
  g.time -= TICK;
  if (g.flight === FLIGHT.out) normalize(addScaled(g.at, ship.pos, g.dir, (GULL.far / R) * done));
  else if (g.flight === FLIGHT.back) {
    const k = g.time > 0 ? TICK / (g.time + TICK) : 1;
    normalize(addScaled(g.at, g.at, set(T, ship.pos.x - g.at.x, ship.pos.y - g.at.y, ship.pos.z - g.at.z), k));
  } else if (g.flight === FLIGHT.circle) normalize(addScaled(g.at, ship.pos, tangentAt(ship.pos, 2 * PI * done, T), GULL.circle / R));
  if (g.time > 0) return;
  if (g.flight === FLIGHT.circle) {
    land(state, i);
    return;
  }
  g.flight++;
  g.time += g.span * LEGS[g.flight - FLIGHT.out];
  if (g.flight === FLIGHT.away) emit(state, EVENT.departed, i, -1, g.at, g.tier);
  else if (g.flight === FLIGHT.back) emit(state, EVENT.returning, i, -1, g.at, g.tier);
}

function land(state: MatchState, i: number): void {
  const ship = state.ships[i], g = ship.gull;
  if (afloat(ship)) {
    deliver(state, i, g.tier);
    emit(state, EVENT.landed, i, -1, ship.pos, g.tier);
  } else {
    afloatChest(state, ship.pos, g.tier, LOOT_ONLY, -1);
    emit(state, EVENT.chestLost, i, -1, ship.pos, g.tier);
  }
  g.flight = FLIGHT.mast;
  g.tier = -1;
  set(g.at, ship.pos.x, ship.pos.y, ship.pos.z);
}

function dive(sea: Sea, state: MatchState, i: number, cell: number, seen: number): void {
  const g = state.ships[i].gull;
  if (g.dive === 0 || g.cool > 0) return;
  let j = aim(sea, state, i, seen, cell, GULL.dive.reach, Infinity, POINT);
  if (j === SHIPS) j = nearest(state, i, seen, POINT);
  if (j < 0) return;
  const prey = state.ships[j];
  prey.speed *= GULL.dive.check;
  g.flight = FLIGHT.dive;
  g.prey = j;
  g.time = GULL.dive.hold;
  g.cool = GULL.dive.cool[g.dive];
  set(g.at, prey.pos.x, prey.pos.y, prey.pos.z);
  emit(state, EVENT.dive, i, j, prey.pos, GULL.dive.hold);
}

function nearest(state: MatchState, i: number, seen: number, at: V3): number {
  let best = -1, most = DIVE_COS;
  for (let j = 0; j < SHIPS; j++) {
    const c = j === i || (seen & (1 << j)) === 0 ? -2 : dot(state.ships[j].pos, at);
    if (c >= most) {
      most = c;
      best = j;
    }
  }
  return best;
}

function hold(state: MatchState, i: number): void {
  const g = state.ships[i].gull, prey = state.ships[g.prey];
  g.time -= TICK;
  if (g.time > 0 && afloat(prey)) set(g.at, prey.pos.x, prey.pos.y, prey.pos.z);
  else {
    g.flight = FLIGHT.mast;
    g.prey = -1;
  }
}

function danger(state: MatchState, i: number, seen: number, calm: V3, edge: number): boolean {
  const ship = state.ships[i];
  if (ship.hull < GULL.danger.hull * fullHull(ship.form, ship.fittings) || dot(ship.pos, calm) < edge) return true;
  for (let j = 0; j < SHIPS; j++) if ((seen & (1 << j)) !== 0 && dot(ship.pos, state.ships[j].pos) >= NEAR_COS) return true;
  return false;
}

function spot(sea: Sea, state: MatchState, i: number, seen: number): void {
  const g = state.ships[i].gull, fresh = seen & ~g.spied, was = g.site;
  g.spied = seen;
  g.site = gullMarks(sea, state, i, FINDS, CHESTS);
  if (!fights(state.ships[i])) return;
  if (fresh !== 0) {
    const j = 31 - Math.clz32(fresh & -fresh);
    emit(state, EVENT.spotted, i, j, state.ships[j].pos, -1);
  } else if (g.site >= 0 && g.site !== was) emit(state, EVENT.spotted, i, -1, sea.geo.finds[g.site].pos, g.site);
}

export function gullMarks(sea: Sea, state: MatchState, i: number, finds: number[], chests: number[]): number {
  const ship = state.ships[i], g = ship.gull, sites = sea.geo.finds;
  finds.length = chests.length = 0;
  if (!afloat(ship) || g.eye === 0 || !perched(g)) return -1;
  const at = scout(ship, POINT), reach = MARK_COS[g.eye];
  let best = -1, most = -2;
  for (let k = 0; k < sites.length; k++) {
    if (state.finds[k] !== 0 || dot(sites[k].pos, at) < reach) continue;
    finds.push(k);
    const c = dot(sites[k].pos, ship.pos);
    if (c > most) {
      most = c;
      best = k;
    }
  }
  for (let c = 0; c < state.chests.length; c++) if (dot(state.chests[c].at, at) >= reach) chests.push(c);
  return best;
}

function beak(state: MatchState): void {
  for (let e = 0, n = state.events.length; e < n; e++) {
    const happening = state.events[e];
    if (happening.kind !== EVENT.broken || happening.amount <= 0) continue;
    const ship = state.ships[happening.ship], share = GULL.beak[ship.gull.beak];
    let got = 0;
    for (const coin of state.coins) {
      if (share === 0 || coin.value === 0 || coin.age !== 0 || coin.kind !== AFLOAT.coin || dot(coin.at, happening.at) < SPILL_COS) continue;
      const take = coin.value * share;
      coin.value -= take;
      got += take;
    }
    if (got === 0) continue;
    ship.bank += got;
    emit(state, EVENT.snatch, happening.ship, happening.by, happening.at, got);
  }
}

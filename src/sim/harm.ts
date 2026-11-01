// Damage: the shield takes it first, then the hull. The Storm and trail cuts go straight to the hull.
// Ships that reach zero hull are sunk by end.ts at the end of the tick.
import type { V3 } from './math.ts';
import { hasPassive } from './perks.ts';
import { CAUSE, EVENT, FLAG, PHASE, TICK, emit, type MatchState } from './state.ts';
import { POWERS, SPAR } from './tables.ts';

/** Causes that skip the shield. */
export const hullOnly = (cause: number): boolean => cause === CAUSE.storm || cause === CAUSE.ink;

/** Causes that wear steadily, tick by tick, rather than strike. They don't interrupt a consumable. */
export const steady = (cause: number): boolean =>
  cause === CAUSE.storm || cause === CAUSE.burn || cause === CAUSE.ash;

/**
 * Bot captains spar gently: with each other, and with a player who has just come down off the Gale.
 * The player always hits at full strength.
 */
export function spar(state: MatchState, target: number, by: number): number {
  if (by < 0 || by === target) return 1;
  const a = state.ships[by], t = state.ships[target];
  if (!a.captain.on) return 1;
  let f: number;
  if (t.captain.on) f = SPAR.bots;
  else {
    const since = t.landed >= 0 ? (state.tick - t.landed) * TICK : 0;
    f = since < SPAR.from ? SPAR.grace : SPAR.grace + (SPAR.player - SPAR.grace) * Math.min(1, (since - SPAR.from) / SPAR.over);
  }
  return a.captain.gentle ? f * 0.6 : f;
}

/**
 * Deals `amount` to ship `target`. `by` is the ship responsible (-1 for none), `cause` a weapon kind or a CAUSE,
 * `at` where it landed and `y` how high. Returns what it actually took off, shield plus hull.
 */
export function hurt(state: MatchState, target: number, amount: number, by: number, cause: number, at: V3 | null, y = 0, flag = 0): number {
  const ship = state.ships[target];
  if (ship.phase !== PHASE.sea || !(amount > 0) || ship.hull <= 0) return 0;
  let a = amount * spar(state, target, by);
  if (cause === CAUSE.storm && hasPassive(ship, 'stormWalker')) a *= POWERS.stormWalker;
  const wasShield = ship.shield;
  const toShield = hullOnly(cause) ? 0 : Math.min(ship.shield, a);
  ship.shield -= toShield;
  const toHull = Math.min(ship.hull, a - toShield);
  ship.hull -= toHull;
  const broke = wasShield > 0 && ship.shield <= 1e-9;
  if (broke) ship.shield = 0;
  const dealt = toShield + toHull;
  if (by >= 0 && by !== target) {
    state.ships[by].dealt += dealt;
    ship.lastBy = by;
  }
  ship.lastHit = state.tick;
  ship.cause = cause;
  const f = flag | (broke ? FLAG.broke : 0) | (steady(cause) ? FLAG.steady : 0);
  emit(state, EVENT.hit, target, by, at ?? ship.pos, { y, amount: dealt, shield: toShield, hull: toHull, item: cause, flag: f });
  if (broke) emit(state, EVENT.shieldBreak, target, by, ship.pos, { item: cause });
  if (!steady(cause)) interrupt(state, target);
  return dealt;
}

/** A hit, a swap or a dive breaks off a consumable being used. */
export function interrupt(state: MatchState, i: number): void {
  const ship = state.ships[i];
  if (ship.use < 0) return;
  emit(state, EVENT.useCancel, i, -1, ship.pos, { item: ship.slots[ship.use].kind, amount: ship.useT });
  ship.use = -1;
  ship.useT = 0;
}

/** Mends the hull, up to `cap`. Returns what it mended. */
export function mend(state: MatchState, i: number, amount: number, cap = 100): number {
  const ship = state.ships[i];
  if (ship.phase !== PHASE.sea || ship.hull >= cap) return 0;
  const was = ship.hull;
  ship.hull = Math.min(cap, ship.hull + amount);
  return ship.hull - was;
}

/** Tops up the shield, up to `cap`. */
export function shore(state: MatchState, i: number, amount: number, cap = 100): number {
  const ship = state.ships[i];
  if (ship.phase === PHASE.sunk || ship.shield >= cap) return 0;
  const was = ship.shield;
  ship.shield = Math.min(cap, ship.shield + amount);
  return ship.shield - was;
}

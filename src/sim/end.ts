// Sinking and the end of the match: a ship at zero hull sinks and spills its hold; the last ship afloat wins.
// The result is what the career, the interface and the captains' learning read afterwards.
import { spill } from './items.ts';
import { hasPassive } from './perks.ts';
import { CAUSE, EVENT, MODE, PHASE, SHIPS, TICK, emit, type Expect, type MatchState } from './state.ts';
import { COINS, POWERS } from './tables.ts';
import { founder, squareMetres } from './territory.ts';

/** Sinks ship i. `by` is the ship credited with it (-1 for none). */
export function sink(state: MatchState, i: number, by: number, cause: number): void {
  const ship = state.ships[i];
  if (ship.phase === PHASE.sunk) return;
  let left = 0;
  for (let j = 0; j < SHIPS; j++) if (state.ships[j].phase !== PHASE.sunk) left++;
  ship.place = left;
  ship.hull = 0;
  ship.shield = 0;
  ship.by = by;
  ship.cause = cause;
  ship.sunk = state.tick;
  ship.use = -1;
  ship.burn = 0;
  spill(state, i);
  founder(state, i);
  ship.phase = PHASE.sunk;
  state.sunk.push({ ship: i, by, cause, tick: state.tick });
  emit(state, EVENT.sink, i, by, ship.pos, { item: cause, amount: ship.place });
  if (by >= 0 && by !== i) {
    const k = state.ships[by];
    k.kills++;
    k.coins += COINS.kill;
    emit(state, EVENT.coins, by, i, k.pos, { amount: COINS.kill, item: 4 });
    if (hasPassive(k, 'salvage') && k.phase !== PHASE.sunk) k.shield = Math.min(100, k.shield + POWERS.salvage);
  }
}

/** Sinks every ship at zero hull, then sees whether the match is won. */
export function settle(state: MatchState): void {
  for (let i = 0; i < SHIPS; i++) {
    const ship = state.ships[i];
    if (ship.phase !== PHASE.sea || ship.hull > 0) continue;
    // the Storm and the elements take the credit away from a hitter who is long gone
    const recent = state.tick - ship.lastHit < Math.round(8 / TICK);
    const by = ship.lastBy >= 0 && (recent || ship.cause < CAUSE.storm) ? ship.lastBy : -1;
    sink(state, i, by, ship.cause);
  }
  // a voyage has no winner: its wrecks refit (voyage.ts)
  if (state.winner >= 0 || state.mode === MODE.voyage) return;
  let alive = 0, last = -1;
  for (let i = 0; i < SHIPS; i++) {
    if (state.ships[i].phase !== PHASE.sunk) {
      alive++;
      last = i;
    }
  }
  if (alive <= 1) {
    const w = last >= 0 ? last : state.sunk.length > 0 ? state.sunk[state.sunk.length - 1].ship : 0;
    state.winner = w;
    state.ships[w].place = 1;
    emit(state, EVENT.win, w, -1, state.ships[w].pos, {});
  }
}

export interface ShipResult {
  /** 1 is the winner. */
  place: number;
  kills: number;
  /** Damage dealt, shield and hull. */
  dealt: number;
  /** Indices of the regions sailed through, in REGIONS order. */
  regions: number[];
  /** Seconds afloat from the start. */
  survived: number;
  /** Who sank this ship (-1: the sea, the Storm, or nobody), and what with: a weapon kind or a CAUSE. */
  by: number;
  cause: number;
  coins: number;
  /** Square metres held at the end. A sunk ship's water goes free, so it holds none. */
  held: number;
  captain: boolean;
}

/** What a captain learnt of the player this match, carried back to the career. */
export interface LearntMind {
  dive: Expect;
  loop: Expect;
  raids: Expect;
  run: Expect;
  storm: Expect;
}

export interface MatchResult {
  seed: number;
  rule: number;
  ticks: number;
  winner: number;
  ships: ShipResult[];
  /** For each ship, what its captain learnt of the player (null for the player's own ship). */
  minds: (LearntMind | null)[];
}

const bits = (mask: number): number[] => {
  const out: number[] = [];
  for (let r = 0; r < 16; r++) if ((mask & (1 << r)) !== 0) out.push(r);
  return out;
};

export function result(state: MatchState): MatchResult {
  return {
    seed: state.seed,
    rule: state.rule,
    ticks: state.tick,
    winner: state.winner,
    ships: state.ships.map((s) => ({
      place: s.phase === PHASE.sunk ? s.place : state.winner >= 0 && state.winner !== state.ships.indexOf(s) ? s.place : 1,
      kills: s.kills,
      dealt: Math.round(s.dealt),
      regions: bits(s.regions),
      survived: (s.phase === PHASE.sunk ? s.sunk : state.tick) * TICK,
      by: s.by,
      cause: s.cause,
      coins: s.coins,
      held: squareMetres(s.held),
      captain: s.captain.on,
    })),
    minds: state.ships.map((s) => (s.captain.on ? {
      dive: { ...s.captain.dive }, loop: { ...s.captain.loop }, raids: { ...s.captain.raids }, run: { ...s.captain.run },
      storm: { ...s.captain.storm },
    } : null)),
  };
}

export const over = (state: MatchState): boolean => state.winner >= 0;

// Coin moving between crews (Phase B section 10): what the market pays and takes (signing fees, break clauses,
// dismissals). A spend is refused below the elder's debt floor; a payment owed (wages, a break clause received) is
// never refused. The player's crew's moves are written to the ledger.

import type { CareerState, Crew } from './state.ts';

/** Whether a crew may spend an amount: its coin after stays at or above its debt floor. */
export const canSpend = (c: Crew, amount: number): boolean => amount <= 0 || c.coin - amount >= c.debtFloor;

/** A state with an amount taken from a crew (negative: given), a ledger line if it is the player's. */
export function paid(s: CareerState, crew: number, amount: number, line: { kind: string; what: string }): CareerState {
  if (amount === 0) return s;
  const c = s.crews[crew];
  const coin = c.coin - amount;
  const crews = [...s.crews];
  crews[crew] = { ...c, coin };
  const ledger = c.player ? [...s.ledger, { day: s.day, kind: line.kind, what: line.what, amount: -amount, balance: coin }] : s.ledger;
  return { ...s, crews, ledger };
}

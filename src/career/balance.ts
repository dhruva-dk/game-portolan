// money moving between teams (Phase B section 10): what the market pays and takes (signing fees, break clauses,
// dismissals). A spend is refused below the chairman's debt floor; a payment owed (wages, a break clause received) is
// never refused. The player's team's moves are written to the ledger.

import type { CareerState, Team } from './state.ts';

/** Whether a team may spend an amount: its balance after stays at or above its debt floor. */
export const canSpend = (c: Team, amount: number): boolean =>
  amount <= 0 || c.balance - amount >= c.debtFloor;

/** A state with an amount taken from a team (negative: given), a ledger line if it is the player's. */
export function paid(
  s: CareerState,
  team: number,
  amount: number,
  line: { kind: string; what: string }
): CareerState {
  if (amount === 0) return s;
  const c = s.teams[team];
  const balance = c.balance - amount;
  const teams = [...s.teams];
  teams[team] = { ...c, balance };
  const ledger = c.player
    ? [
        ...s.ledger,
        {
          day: s.day,
          kind: line.kind,
          what: line.what,
          amount: -amount,
          balance: balance,
        },
      ]
    : s.ledger;
  return { ...s, teams, ledger };
}

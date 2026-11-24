import { NEGOTIATION } from '../tuning.ts';

export const standardClause = (wage: number): number =>
  Math.ceil(
    (NEGOTIATION.standardClauseRaces * wage) / NEGOTIATION.clause.step
  ) * NEGOTIATION.clause.step;

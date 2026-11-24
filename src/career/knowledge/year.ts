import type { CareerState } from '../state.ts';
import { discardReports } from './report.ts';
import { redrawShipLines } from './ships.ts';

export const redrawKnowledge = (state: CareerState): CareerState =>
  redrawShipLines(discardReports(state));

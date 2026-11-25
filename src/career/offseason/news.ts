import { announce } from '../announce.ts';
import { standingOrder, standings } from '../rules/standing.ts';
import { YOURS, type CareerState } from '../state.ts';

export const seasonEvents = (state: CareerState): CareerState =>
  announce(
    state,
    { kind: 'title', team: standingOrder(state)[0] },
    { kind: 'yourSeason', team: YOURS, place: standings(state)[YOURS] }
  );

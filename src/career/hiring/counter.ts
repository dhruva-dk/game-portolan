import type { Reason } from '../commands.ts';
import { personOf } from '../lookup.ts';
import type { CareerState } from '../state.ts';
import { signingFunds } from './cost.ts';
import { isOfferable } from './offer.ts';
import { sign } from './sign.ts';
import { talkWith } from './talks.ts';

export function counterRefusal(
  state: CareerState,
  team: number,
  id: number
): Reason | null {
  const person = personOf(state, id);
  if (person === null || !isOfferable(state, team, person)) return 'seat';
  const { counter } = talkWith(state.teams[team], id);
  if (counter === null) return 'seat';
  return signingFunds(state, team, person, counter);
}

export function acceptCounter(
  state: CareerState,
  team: number,
  id: number
): CareerState {
  const person = personOf(state, id);
  const { counter } = talkWith(state.teams[team], id);
  return person === null || counter === null
    ? state
    : sign(state, team, person, counter);
}

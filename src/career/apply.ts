import {
  COMMANDS,
  VALID_IN,
  YOURS_ONLY,
  type Command,
  type Reason,
} from './commands.ts';
import { fieldsValid, isIndex } from './fields.ts';
import { known } from './lookup.ts';
import type { CareerState } from './state.ts';

export { newCareer, type CareerOptions } from './start.ts';

export type Applied =
  | { ok: true; state: CareerState }
  | { ok: false; reason: Reason };

export function apply(state: CareerState, command: Command): Applied {
  const reason = refusal(state, command);
  return reason === null ? effect(state, command) : { ok: false, reason };
}

function refusal(state: CareerState, command: Command): Reason | null {
  if (typeof command !== 'object' || command === null) return 'invalid';
  if (!COMMANDS.includes(command.type)) return 'invalid';
  if (!isIndex(command.team, state.teams.length)) return 'team';
  if (command.team !== 0 && YOURS_ONLY.includes(command.type)) return 'team';
  if (!VALID_IN[command.type].includes(state.phase)) return 'phase';
  if (!fieldsValid(state, command)) return 'invalid';
  if (!known(state, command)) return 'unknown';
  return null;
}

const notYet = (state: CareerState): Applied => ({ ok: true, state });

function effect(state: CareerState, command: Command): Applied {
  switch (command.type) {
    case 'StartRace':
      return notYet(state);
    case 'RecordRace':
      return notYet(state);
    case 'FinishOffseason':
      return notYet(state);
    case 'MarkRead':
      return notYet(state);
    case 'MarkSeen':
      return markSeen(state, command.id);
    case 'SetFocus':
      return notYet(state);
    case 'Build':
      return notYet(state);
    case 'FitGun':
      return notYet(state);
    case 'Repaint':
      return notYet(state);
    case 'SetScoutSeat':
      return notYet(state);
    case 'BuyReport':
      return notYet(state);
    case 'Approach':
      return notYet(state);
    case 'Offer':
      return notYet(state);
    case 'AcceptCounter':
      return notYet(state);
    case 'Release':
      return notYet(state);
    case 'SignSponsor':
      return notYet(state);
  }
}

const markSeen = (state: CareerState, id: string): Applied => ({
  ok: true,
  state: state.seen.includes(id)
    ? state
    : { ...state, seen: [...state.seen, id] },
});

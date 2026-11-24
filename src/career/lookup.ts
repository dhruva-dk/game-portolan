import type { Command } from './commands.ts';
import { BUBBLES, type CareerState, type Owner, type Person } from './state.ts';

export const personOf = (state: CareerState, id: number): Person | null =>
  state.people.find((person) => person.id === id) ?? null;

export function ownerOf(state: CareerState, id: number): Owner | null {
  for (const { owner } of state.teams)
    if (owner !== null && owner.id === id) return owner;
  return null;
}

export const isId = (state: CareerState, id: number): boolean =>
  personOf(state, id) !== null || ownerOf(state, id) !== null;

export function known(state: CareerState, command: Command): boolean {
  switch (command.type) {
    case 'MarkSeen':
      return BUBBLES.includes(command.id);
    case 'BuyReport':
    case 'Approach':
    case 'Offer':
    case 'AcceptCounter':
    case 'Release':
      return isId(state, command.person);
    case 'SignSponsor':
      return command.offer < state.teams[command.team].offers.length;
    default:
      return true;
  }
}

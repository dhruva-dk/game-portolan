import type { CareerState, NewsEvent, Person } from './state.ts';

export const announce = (
  state: CareerState,
  ...events: readonly NewsEvent[]
): CareerState =>
  events.length === 0
    ? state
    : { ...state, pendingEvents: [...state.pendingEvents, ...events] };

export const named = (
  person: Pick<Person, 'id' | 'name'>
): Pick<NewsEvent, 'person' | 'personId'> => ({
  person: person.name,
  personId: person.id,
});

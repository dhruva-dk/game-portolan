import type { CareerState } from '../state.ts';

export const publishNews = (state: CareerState): CareerState => ({
  ...state,
  news: state.pendingEvents,
  pendingEvents: [],
});

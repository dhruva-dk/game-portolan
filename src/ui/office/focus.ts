// What the people screens hand each other between taps: the gull a profile or an offer opens on, the way back from
// it, the market's filter and the session's shortlist, and an offer's draft as it is set. UI state only, never the
// career's: a screen sets it, then taps on (send.tap); the screens' views (screens.ts) read it. debug.ts may set it
// for a fixture.

import type { Offer } from '../../office';
import type { MarketFilter } from '../../office-people';
import type { Tap } from '../ways';

export interface Focus {
  gull: number | null;
  back: Tap;
  filter: MarketFilter | null;
  shortlist: number[];
  draft: Offer | null;
  /** The sub-tab a screen opens on (crew: roster, flight; market: gulls, scouts). */
  tab: string;
}

export const FOCUS: Focus = { gull: null, back: 'crew', filter: null, shortlist: [], draft: null, tab: '' };

/** Opens a gull's profile from `back`. */
export function openProfile(tap: (t: Tap) => void, gull: number, back: Tap) {
  FOCUS.gull = gull;
  FOCUS.back = back;
  FOCUS.draft = null;
  tap('profile');
}

// The ways a screen opens a named thing's page (OFFICE-SCREENS.md, Links):
// each gives what a tap calls, or null where the thing has no page yet (an
// empty berth). A name so opened is drawn as a link (src/ui/chartroom/controls.ts).

import type { Office } from './office.ts';

/** A person's profile. */
export const toPerson =
  (office: Office) =>
  (id: number | null): (() => void) | null =>
    id === null
      ? null
      : () => office.ask({ kind: 'person', id, screen: 'profile' });

/** A team's page. */
export const toTeam =
  (office: Office) =>
  (id: number | null): (() => void) | null =>
    id === null ? null : () => office.ask({ kind: 'team', id });

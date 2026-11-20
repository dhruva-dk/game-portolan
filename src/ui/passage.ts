// The way home from a match (LEAVE: ways.ts HOME, wayHome): the title, the one
// loading screen (screens.ts), comes over the match, its needle swinging; it is
// held while the match is put away and the lobby made and drawn unseen under
// it, and lifts off the lobby settled, her ship at anchor and its pieces in
// place, the needle settling north as it goes. The title is the one the page
// painted first (main.ts), over every screen; while the way home is under way
// it is the passage's to show and hide, not the flow's. What it covers of the
// world, the sound follows (main.ts: the bed fades under it).

import type { Title } from './screens.ts';
import { HOME, wayHome } from './ways.ts';

export function createPassage(title: Title) {
  /**
   * The way home under way (null: none), and the change it makes once the match
   * is covered.
   */
  let way: ReturnType<typeof wayHome> | null = null,
    change: (() => void) | null = null;

  return {
    /** Whether the way home is under way. */
    get going() {
      return way !== null;
    },
    /** How much of the world the parchment covers now, 0…1. */
    get covered() {
      return way?.covered(performance.now()) ?? 0;
    },
    /**
     * Brings the title over the match; once it is covered, makes the change
     * (`act`) under it.
     */
    cover(act: () => void) {
      way = wayHome(performance.now());
      change = act;
      title.swing();
      title.show(true, HOME.cover);
    },
    /** A frame just drawn: the way home moved on by it. */
    drawn() {
      const leg = way?.drawn(performance.now());
      if (leg === 'hold') {
        change?.();
        change = null;
      } else if (leg === 'lift') {
        title.ready();
        title.show(false, HOME.lift);
      } else if (leg === 'home') way = null;
    },
  };
}

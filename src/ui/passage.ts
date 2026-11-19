// The way home from a match (LEAVE: ways.ts HOME, wayHome): the title, the one loading screen (screens.ts), comes over
// the match, its needle swinging; it is held while the match is put away and the lobby made and drawn unseen under it,
// and lifts off the lobby settled, her ship at anchor and its pieces in place, the needle settling north as it goes.
// Over every screen. What it covers of the world, the sound follows (main.ts: the bed fades under it).

import { createTitle } from './screens';
import { HOME, wayHome } from './ways';

export function createPassage() {
  const title = createTitle();
  title.root.style.zIndex = '3';

  /** The way home under way (null: none), and the change it makes once the match is covered. */
  let way: ReturnType<typeof wayHome> | null = null, change: (() => void) | null = null;

  return {
    /** Whether the way home is under way. */
    get going() {
      return way !== null;
    },
    /** How much of the world the parchment covers now, 0…1. */
    get covered() {
      return way?.covered(performance.now()) ?? 0;
    },
    /** Brings the title over the match; once it is covered, makes the change (`act`) under it. */
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

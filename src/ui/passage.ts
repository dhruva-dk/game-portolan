// The way home from a match (LEAVE or AGAIN: ways.ts HOME, wayHome): the
// title, the one loading screen (screens.ts), comes over the match, its needle
// swinging; once it covers it, the change is made under it, and that change is
// the page going (main.ts: home is a new page, a seed being one race), so the
// title stays over it till it does, and the next page paints it first. The
// title is the one the page painted first (main.ts), over every screen; while
// the way home is under way it is the passage's to show, not the flow's. What
// it covers of the world, the sound follows (main.ts: the bed fades under it).

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
     * (`act`) under it, and holds it there.
     */
    cover(act: () => void) {
      way = wayHome(performance.now());
      change = act;
      title.swing();
      title.show(true, HOME.cover);
    },
    /** A frame just drawn: the way home moved on by it, till it is covered. */
    drawn() {
      if (way?.leg !== 'cover') return;
      if (way.drawn(performance.now()) === 'hold') {
        change?.();
        change = null;
      }
    },
  };
}

// A reader's place in who holds the sea (snapshot.ts Sea): which match's sea it last read (its generation) and the
// last change it read there. The water (claimed.ts) and the trails (trails.ts) each keep one, so each reads every change
// once, starts over with each new match whatever its changes are numbered, and knows when it has missed some (gone
// from the log before it read them: frames not drawn for longer than the changes are kept).
//
// Pure: no three, so it runs in node for the tests.

import type { Sea } from '../snapshot';

/** No sea read (outside a match). */
const NONE = -1;

/** What a read found: whether to start over (a new match's sea, or none where there was one), whether changes were
 *  missed (the reader's copy of the cells is behind: it must take them whole from the sea's), and the index in the
 *  sea's changes of the first not read before. */
export interface Reading { fresh: boolean; missed: boolean; from: number }

export function createCursor() {
  let generation = NONE, seq = 0;
  return {
    /** Reads `sea` (none outside a match): from now on its changes up to its last count as read. */
    read(sea: Sea | undefined): Reading {
      if (!sea) {
        const fresh = generation !== NONE;
        [generation, seq] = [NONE, 0];
        return { fresh, missed: false, from: 0 };
      }
      const fresh = sea.generation !== generation;
      if (fresh) [generation, seq] = [sea.generation, 0];
      const log = sea.changes;
      let from = log.length;
      while (from > 0 && log[from - 1].seq > seq) from--;
      const missed = !fresh && sea.seq > seq && (from === log.length || log[from].seq !== seq + 1);
      seq = sea.seq;
      return { fresh, missed, from };
    },
  };
}

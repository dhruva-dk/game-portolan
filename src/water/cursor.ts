import type { Sea } from '../snapshot.ts';

const NONE = -1;

interface Reading {
  fresh: boolean;
  missed: boolean;
  from: number;
}

export function createCursor() {
  let generation = NONE,
    seq = 0;
  const reading: Reading = { fresh: false, missed: false, from: 0 };
  return {
    read(sea: Sea | undefined): Readonly<Reading> {
      if (!sea) {
        reading.fresh = generation !== NONE;
        reading.missed = false;
        reading.from = 0;
        generation = NONE;
        seq = 0;
        return reading;
      }
      const fresh = sea.generation !== generation;
      if (fresh) {
        generation = sea.generation;
        seq = 0;
      }
      const log = sea.changes;
      let from = log.length;
      while (from > 0 && log[from - 1].seq > seq) from--;
      reading.fresh = fresh;
      reading.missed =
        !fresh &&
        sea.seq > seq &&
        (from === log.length || log[from].seq !== seq + 1);
      reading.from = from;
      seq = sea.seq;
      return reading;
    },
  };
}

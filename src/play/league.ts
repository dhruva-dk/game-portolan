// The league's races, run whole off the main thread (racing.ts, a module Worker) on the planet of `seed`: one at a
// time, each asked for waiting on the one before. A race's result is runRace's (race.ts), the same as in node.

import type { RaceCard, RaceResult } from '../race';

export function createLeague(seed: number) {
  const worker = new Worker(new URL('./racing.ts', import.meta.url), { type: 'module' });
  worker.postMessage({ seed });
  const waiting = new Map<number, { resolve(r: RaceResult): void; reject(e: Error): void }>();
  worker.onmessage = (e: MessageEvent<{ race: number; result?: RaceResult; error?: string }>) => {
    const w = waiting.get(e.data.race);
    waiting.delete(e.data.race);
    if (e.data.result) w?.resolve(e.data.result);
    else w?.reject(new Error(e.data.error));
  };
  let asked = 0, last: Promise<unknown> = Promise.resolve();
  return {
    /** The race dealt `card`, run whole once those asked before it are done. */
    run(card: RaceCard): Promise<RaceResult> {
      const race = ++asked;
      const done = last.catch(() => undefined).then(() => new Promise<RaceResult>((resolve, reject) => {
        waiting.set(race, { resolve, reject });
        worker.postMessage({ race, card });
      }));
      last = done;
      return done;
    },
    /** The worker put away. */
    close: () => worker.terminate(),
  };
}

export type League = ReturnType<typeof createLeague>;

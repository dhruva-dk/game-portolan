// Runs whole matches headless and prints what happened: `node tests/tools/headless.ts [seed] [count]`.
import { createMatch, resolve, result, EVENT, EVENT_NAMES, step, over, PHASE } from '../../src/sim/match.ts';
import { modeName } from '../../src/sim/captains/brain.ts';

const seed = Number(process.argv[2] ?? 1), count = Number(process.argv[3] ?? 1), verbose = process.argv.includes('-v');

for (let s = seed; s < seed + count; s++) {
  const t0 = performance.now();
  const state = createMatch({ seed: s, fleet: Array.from({ length: 20 }, () => ({ captain: true })) });
  const tally = new Map<string, number>();
  if (verbose) {
    while (!over(state) && state.tick < 60 * 60 * 30) {
      step(state);
      for (const e of state.events) tally.set(EVENT_NAMES[e.kind], (tally.get(EVENT_NAMES[e.kind]) ?? 0) + 1);
      if (state.tick % 900 === 0) {
        const alive = state.ships.filter((x) => x.phase !== PHASE.sunk);
        const modes = new Map<string, number>();
        for (const x of alive) modes.set(modeName(x.captain.mode), (modes.get(modeName(x.captain.mode)) ?? 0) + 1);
        console.log(`t=${(state.tick / 30).toFixed(0)}s alive=${alive.length} shots=${state.shots.length} loot=${state.loot.length}`,
          [...modes].map(([k, v]) => `${k}:${v}`).join(' '),
          'hull', alive.map((x) => Math.round(x.hull)).join(','));
      }
    }
  } else resolve(state);
  const r = result(state);
  const ms = performance.now() - t0;
  console.log(`seed ${s}: winner ${r.winner} after ${(r.ticks / 30).toFixed(0)} s, ${ms.toFixed(0)} ms;`,
    'kills', r.ships.map((x) => x.kills).join(','), '| causes', state.ships.map((x) => x.cause).join(','));
  if (verbose) console.log([...tally].map(([k, v]) => `${k}:${v}`).join(' '));
  void EVENT;
}

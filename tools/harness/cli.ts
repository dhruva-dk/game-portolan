// The bot harness: whole matches of bots, headless, on a pool of workers; each
// brain named sails every match given, the same matches for every brain (so
// they are compared pair by pair), or one fleet of them all mixed. Writes each
// match's result as a line of JSON and prints each brain's summary.
//   node tools/harness/cli.ts [--brains default,keen] [--matches 8] [--from 1]
//     [--mix] [--seconds 300] [--planet seed] [--workers n] [--out file]
// --matches: how many matches (dealt --from on); --mix: one fleet, the brains
// dealt round it by id, not a fleet of each; --out: the JSONL (else
// .cache/harness/<time>.jsonl).
//
// Node only (tools/).

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { parseArgs } from 'node:util';
import { CORES, runPool } from './pool.ts';
import type { Result, Spec } from './run.ts';
import { summary } from './summary.ts';

const { values: a } = parseArgs({
  options: {
    brains: { type: 'string', default: 'default' },
    matches: { type: 'string', default: '8' },
    from: { type: 'string', default: '1' },
    mix: { type: 'boolean', default: false },
    seconds: { type: 'string' },
    planet: { type: 'string' },
    workers: { type: 'string', default: String(CORES) },
    out: { type: 'string' },
  },
});

const brains = a.brains.split(','),
  from = Number(a.from),
  count = Number(a.matches);
const base = {
  ...(a.planet ? { planet: Number(a.planet) } : {}),
  ...(a.seconds ? { seconds: Number(a.seconds) } : {}),
};
const specs: Spec[] = [];
for (let k = from; k < from + count; k++)
  if (a.mix) specs.push({ ...base, match: k, brains });
  else for (const b of brains) specs.push({ ...base, match: k, brains: [b] });

const out =
  a.out ??
  `.cache/harness/${new Date().toISOString().replace(/[:.]/g, '-')}.jsonl`;
const t = performance.now();
console.log(
  `${specs.length} matches on ${Math.min(Number(a.workers), specs.length)} workers`
);
const results: Result[] = await runPool(specs, {
  workers: Number(a.workers),
  done: (r, n) =>
    console.log(
      `  ${n}/${specs.length} match ${r.spec.match} [${r.spec.brains.join(',')}]: ` +
        `${r.left} left at ${r.seconds.toFixed(0)} s, ${r.msPerStep.toFixed(2)} ms a step`
    ),
});
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, results.map((r) => JSON.stringify(r)).join('\n') + '\n');
console.log(
  `${((performance.now() - t) / 1000).toFixed(1)} s; results in ${out}`
);
console.log(summary(results));

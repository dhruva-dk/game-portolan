// The bot harness: whole matches of bots, headless, on a pool of workers; each
// brain named sails every match given, the same matches for every brain (so
// they are compared pair by pair), or one fleet of them all mixed. Writes each
// match's result as a line of JSON and prints each brain's summary.
//   node tools/harness/cli.ts [--brains default,keen] [--matches 8] [--from 1]
//     [--mix] [--type name] [--rules name] [--players k] [--seconds 300]
//     [--planet seed | --pool tune|held|all] [--workers n] [--out file]
// --matches: how many matches (dealt --from on), on each planet of --pool if
// one is named (tools/harness/planets.ts); --mix: one fleet, the brains
// dealt round it by id, not a fleet of each; --type: every match of that type
// (tools/harness/types.ts; else each of the type the game deals it); --rules:
// each match's rules changed so (tools/harness/rules.ts); --players: every
// k-th ship's gun laid by a stand-in for a player (tools/harness/player.ts;
// what each hits, tools/harness/aim.ts), with --thumb (steady, or sloppy);
// --out: the JSONL (else
// .cache/harness/<time>.jsonl).
//
// Node only (tools/).

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { parseArgs } from 'node:util';
import { planetsOf } from './planets.ts';
import { thumbNamed } from './player.ts';
import { CORES, runPool } from './pool.ts';
import type { Result, Spec } from './run.ts';
import { summary } from './summary.ts';

const { values: a } = parseArgs({
  options: {
    brains: { type: 'string', default: 'default' },
    matches: { type: 'string', default: '8' },
    from: { type: 'string', default: '1' },
    mix: { type: 'boolean', default: false },
    type: { type: 'string' },
    rules: { type: 'string' },
    players: { type: 'string' },
    thumb: { type: 'string' },
    seconds: { type: 'string' },
    planet: { type: 'string' },
    pool: { type: 'string' },
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
  ...(a.type ? { type: a.type } : {}),
  ...(a.rules ? { rules: a.rules } : {}),
  ...(a.players ? { players: Number(a.players) } : {}),
  ...(a.thumb ? { thumb: thumbNamed(a.thumb) } : {}),
};
const specs: Spec[] = [];
for (const planet of a.pool ? planetsOf(a.pool) : [undefined])
  for (let k = from; k < from + count; k++) {
    const on = planet === undefined ? base : { ...base, planet };
    if (a.mix) specs.push({ ...on, match: k, brains });
    else for (const b of brains) specs.push({ ...on, match: k, brains: [b] });
  }

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
      `  ${n}/${specs.length}${r.spec.planet === undefined ? '' : ` planet ${r.spec.planet}`} match ${r.spec.match} [${r.spec.brains.join(',')}]: ` +
        `${r.left} left at ${r.seconds.toFixed(0)} s, ${r.msPerStep.toFixed(2)} ms a step`
    ),
});
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, results.map((r) => JSON.stringify(r)).join('\n') + '\n');
console.log(
  `${((performance.now() - t) / 1000).toFixed(1)} s; results in ${out}`
);
console.log(summary(results));

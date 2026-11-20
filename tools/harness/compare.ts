// Two harness runs of the same matches set side by side, for a change the
// brains can't carry (the game's own tuning: the loot laid, the storm): run the
// harness before it and after, then
//   node tools/harness/compare.ts before.jsonl after.jsonl
// Each run's brains are named for its file (before:default, after:default),
// and summed up as the harness sums them, the second against the first match
// by match.
//
// Node only (tools/).

import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { summary } from './summary.ts';
import type { Result } from './run.ts';

/** A run's results, each brain named `label:brain`. */
function labelled(file: string): Result[] {
  const label = basename(file, '.jsonl');
  return readFileSync(file, 'utf8')
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => {
      const r = JSON.parse(l) as Result;
      const named = (b: string) => `${label}:${b}`;
      return {
        ...r,
        spec: { ...r.spec, brains: r.spec.brains.map(named) },
        ships: r.ships.map((s) => ({ ...s, brain: named(s.brain) })),
      };
    });
}

const files = process.argv.slice(2);
if (files.length < 2) {
  console.error('node tools/harness/compare.ts before.jsonl after.jsonl');
  process.exit(1);
}
console.log(summary(files.flatMap(labelled)));

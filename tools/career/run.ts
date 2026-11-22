// One whole career sailed headless on real races (sail.ts), from the command line: one process is one career.
//
//   node tools/career/run.ts <idle|sensible|shrewd> [seed] [seasons] [out.json]
//
// seed: the world's (7 if not given); seasons: how many (5 if not given); out.json: where the report goes (stdout if
// not given). The report: sail.ts Report. A line a season is told on stderr.
//
// Node only (tools/): no three, no browser.

import { writeFileSync } from 'node:fs';
import { MANAGERS } from './managers.ts';
import { sail } from './sail.ts';

const [who = '', seedArg = '7', seasonsArg = '5', outPath] =
  process.argv.slice(2);
const manager = MANAGERS.find((m) => m === who);
const seed = Number(seedArg),
  seasons = Number(seasonsArg);
if (
  !manager ||
  !Number.isInteger(seed) ||
  !Number.isInteger(seasons) ||
  seasons < 1
)
  throw new Error(
    'usage: node tools/career/run.ts <idle|sensible|shrewd> [seed] [seasons] [out.json]'
  );

const report = await sail(manager, seed, seasons, (line) =>
  process.stderr.write(line + '\n')
);
const text = JSON.stringify(report);
if (outPath) writeFileSync(outPath, text + '\n');
else console.log(text);

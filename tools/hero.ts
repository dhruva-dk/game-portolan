// The art direction's hero shots (docs/art-direction.md), captured together for judging the look round by round.
//   node tools/hero.ts <dir> [query] [--dpr=3]      e.g. node tools/hero.ts captures/round1 mood=warm
// Writes <dir>/1.png … <dir>/7.png: 1 the chase in open sea, the sun over her quarter; 2 the same sailing into the sun;
// 3 near the start's island; 4 a crowd of ships; 5 at the storm's edge; 6 the lobby; 7 the planet from space. The
// query is added to each (a mood, a seed); the islands and weather follow the seed, so the shots are of kinds of
// view, not of one island.

import { execFileSync } from 'node:child_process';
import { mkdirSync, renameSync } from 'node:fs';

const [dir = 'captures/hero', extra = ''] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const flags = process.argv.slice(2).filter((a) => a.startsWith('--'));
const and = extra ? `&${extra}` : '';
const SHOTS = [
  'screen=match&drive=150,1,14',
  'screen=match&drive=291,1,14',
  'screen=match',
  'screen=match&ships=14&drive=0,0.3,2',
  'screen=match&storm=370',
  'screen=lobby',
  'screen=map',
].map((q) => q + and);

mkdirSync(dir, { recursive: true });
execFileSync('node', ['tools/capture.ts', `--out=${dir}`, ...flags, ...SHOTS], { stdio: 'inherit' });
SHOTS.forEach((q, i) => renameSync(`${dir}/${q.replace(/[^\w.=-]+/g, '_')}.png`, `${dir}/${i + 1}.png`));

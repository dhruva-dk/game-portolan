import { mkdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { parseArgs } from 'node:util';
import { outDir, writeJson } from '../out.ts';
import type { CareerScenario } from './career.ts';
import { runCareerScenario } from './careers.ts';
import { runMatch, type MatchScenario, type Summary } from './match.ts';
import { CORES, runPool } from './pool.ts';
import { pooled, printMatch, printPooled } from './print.ts';
import { runTerrain, type TerrainScenario } from './terrain.ts';

type Scenario = MatchScenario | TerrainScenario | CareerScenario;

const { values: a, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    seed: { type: 'string' },
    planet: { type: 'string' },
    runs: { type: 'string', default: '1' },
    seconds: { type: 'string' },
    workers: { type: 'string', default: String(CORES) },
    subject: { type: 'string' },
    seasons: { type: 'string' },
    standin: { type: 'boolean', default: false },
  },
});

const named = positionals[0];
if (!named) {
  console.error(
    'usage: npm run sim -- <scenario | file.json> [--seed n] [--planet n] [--runs n] [--seconds n] [--seasons n] [--workers n] [--standin] [--subject name]'
  );
  process.exit(2);
}
const path = named.endsWith('.json')
  ? named
  : join(import.meta.dirname, 'scenarios', `${named}.json`);
const sc: Scenario = JSON.parse(readFileSync(path, 'utf8'));
const num = (s: string | undefined) =>
  s === undefined ? undefined : Number(s);
const seed = num(a.seed),
  runs = Number(a.runs);
const subject = a.subject ?? basename(named, '.json');

let failed = false;
if (sc.kind === 'match') {
  const one: MatchScenario = {
    ...sc,
    ...(seed !== undefined && { match: seed }),
    ...(a.planet !== undefined && { planet: Number(a.planet) }),
    ...(a.seconds !== undefined && { seconds: Number(a.seconds) }),
  };
  const dir = outDir(subject, { scenario: one, runs });
  if (runs <= 1) {
    const s = runMatch(one, dir);
    printMatch(s, dir);
    failed = s.invariants.broken > 0;
  } else {
    const from = one.match ?? 1;
    const jobs = Array.from({ length: runs }, (_, k) => {
      const sub = join(
        dir,
        `run-${String(k + 1).padStart(2, '0')}-match-${from + k}`
      );
      mkdirSync(sub);
      return { scenario: { ...one, match: from + k }, dir: sub };
    });
    console.log(
      `${runs} matches on ${Math.min(Number(a.workers), runs)} workers`
    );
    const all: Summary[] = await runPool(jobs, {
      workers: Number(a.workers),
      done: (s, job, n) =>
        console.log(
          `  ${n}/${runs} match ${job.scenario.match}: ${s.end} at ${s.seconds} s, ${s.left.length} left, hash ${s.hash}, ` +
            `${s.cost.msPerStep} ms/step, ${s.invariants.broken} broken  ${job.dir}`
        ),
    });
    const p = pooled(all);
    writeJson(join(dir, 'pooled.json'), p);
    printPooled(p, dir);
    failed = all.some((s) => s.invariants.broken > 0);
  }
} else if (sc.kind === 'season' || sc.kind === 'career') {
  await runCareerScenario(sc, {
    seed: a.seed,
    runs,
    seasons: num(a.seasons),
    workers: Number(a.workers),
    standin: a.standin,
    subject,
  });
} else if (sc.kind === 'terrain') {
  const one: TerrainScenario = {
    ...sc,
    ...(seed !== undefined && { seeds: [seed] }),
  };
  const dir = outDir(subject, { scenario: one });
  failed = !runTerrain(one, dir);
} else {
  console.error(`${path}: no kind (match or terrain)`);
  process.exit(2);
}
process.exit(failed ? 1 : 0);

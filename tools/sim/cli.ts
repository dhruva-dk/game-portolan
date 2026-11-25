import { mkdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { parseArgs } from 'node:util';
import { outDir, writeJson } from '../out.ts';
import type { CareerScenario } from './career.ts';
import { runCareerScenario } from './careers.ts';
import { runDuels, type DuelScenario } from './duel.ts';
import { joinedHash } from './figures.ts';
import { runMatch, type MatchScenario, type Summary } from './match.ts';
import { CORES, runPool } from './pool.ts';
import {
  pooled,
  printDuel,
  printDuelStart,
  printDuelTally,
  printMatch,
  printPooled,
} from './print.ts';
import { runTerrain, type TerrainScenario } from './terrain.ts';

type Scenario = MatchScenario | DuelScenario | TerrainScenario | CareerScenario;

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
    levels: { type: 'string' },
    stats: { type: 'string' },
    gunnery: { type: 'string' },
  },
});

const named = positionals[0];
if (!named) {
  console.error(
    'usage: npm run sim -- <scenario | file.json> [--seed n] [--planet n] [--runs n] [--seconds n] [--seasons n] [--workers n] [--standin] [--subject name] [--levels a,b] [--stats a,b] [--gunnery a,b]'
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
const word = seed !== undefined && !Number.isFinite(seed) ? a.seed : undefined;
const subject = a.subject ?? basename(named, '.json');

let failed = false;
if (sc.kind === 'match') {
  const one: MatchScenario = {
    ...sc,
    ...(seed !== undefined && word === undefined && { match: seed }),
    ...(word !== undefined && { seed: word }),
    ...(a.planet !== undefined && { planet: Number(a.planet) }),
    ...(a.seconds !== undefined && { seconds: Number(a.seconds) }),
    ...(a.gunnery !== undefined && {
      career: false,
      gunnery: a.gunnery.split(',').map(Number) as [number, number],
    }),
  };
  const dir = outDir(subject, { scenario: one, runs });
  if (runs <= 1) {
    const s = runMatch(one, dir);
    printMatch(one, s, dir);
    failed = s.invariants.broken > 0;
  } else {
    const from = one.match ?? 1;
    const jobs = Array.from({ length: runs }, (_, k) => {
      const sub = join(
        dir,
        `run-${String(k + 1).padStart(2, '0')}-match-${from + k}`
      );
      mkdirSync(sub);
      const scenario =
        word === undefined
          ? { ...one, match: from + k }
          : {
              ...one,
              match: from + k,
              seed: k === 0 ? word : `${word}-${k + 1}`,
            };
      return { scenario, dir: sub };
    });
    console.log(
      `${runs} matches on ${Math.min(Number(a.workers), runs)} workers`
    );
    const began = performance.now();
    const all: Summary[] = await runPool(jobs, {
      workers: Number(a.workers),
      done: (s, job, n) =>
        console.log(
          `  ${n}/${runs} match ${job.scenario.match}: ${s.end} at ${s.seconds} s, ${s.left.length} left, hash ${s.hash}, ` +
            `${s.invariants.broken} broken  ${job.dir}`
        ),
    });
    const p = pooled(all);
    writeJson(join(dir, 'pooled.json'), p);
    printPooled(p, joinedHash(p.hashes), performance.now() - began, dir);
    failed = all.some((s) => s.invariants.broken > 0);
  }
} else if (sc.kind === 'duel') {
  const levels = a.levels?.split(',').map(Number),
    stats = a.stats?.split(',').map(Number);
  const ship = (i: number) => ({
    ...sc.ships[i],
    ...(levels && { levels: levels[i] }),
    ...(stats && { stats: stats[i] }),
  });
  const one: DuelScenario = {
    ...sc,
    ...(seed !== undefined && { match: seed }),
    ...(a.planet !== undefined && { planet: Number(a.planet) }),
    ships: [ship(0), ship(1)],
  };
  const dir = outDir(subject, { scenario: one, runs });
  printDuelStart(one, runs);
  const began = performance.now();
  const { duels, tally } = runDuels(one, runs, dir, printDuel);
  writeJson(join(dir, 'duels.json'), { tally, duels });
  printDuelTally(
    one,
    tally,
    joinedHash(duels.map((d) => d.hash)),
    performance.now() - began,
    dir
  );
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
  console.error(`${path}: no kind (match, duel, season, career or terrain)`);
  process.exit(2);
}
process.exit(failed ? 1 : 0);

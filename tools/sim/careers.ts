import { join } from 'node:path';
import type { CareerState } from '../../src/career/state.ts';
import { outDir, writeJson } from '../out.ts';
import {
  SEED,
  YOU,
  racesOf,
  runCareer,
  stateHash,
  table,
  type CareerRun,
  type CareerScenario,
  type RaceLine,
  type SeasonFigures,
  type Spread,
  type Told,
} from './career.ts';
import { runCareers } from './career-pool.ts';

export type CareerFlags = {
  seed?: string;
  runs: number;
  seasons?: number;
  workers: number;
  standin: boolean;
  subject: string;
};

const coins = (x: number) => Math.round(x).toLocaleString('en-US');
const one = (x: number) => x.toFixed(1);
const ordinal = (n: number) =>
  `${n}${n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th'}`;
const spreadOf = (s: Spread, f: (x: number) => string) =>
  `${f(s.least)} / ${f(s.median)} / ${f(s.most)}`;

const raceText = (l: RaceLine) =>
  `season ${l.season} race ${String(l.race).padStart(2)} · ${l.planet.padEnd(24)} · places ${l.places.map((p) => String(p).padStart(2)).join(', ')} · balance ${coins(l.balance).padStart(8)} · standing ${String(l.standing).padStart(2)}   (${one(l.ms / 1000)} s)`;

const seasonText = (f: SeasonFigures) =>
  [
    `season ${f.season}: you ${ordinal(f.standing)} · balance ${coins(f.balance)} · mean design level ${one(f.level)} · staff stars ${f.stars.map((s) => (s === null ? '-' : String(s))).join(', ')}`,
    `  league (least / median / most): balances ${spreadOf(f.balances, coins)} · design levels ${spreadOf(f.levels, one)} · staff stars ${spreadOf(f.staff, one)} · repossessions ${f.repossessions}`,
  ].join('\n');

function printTable(state: CareerState) {
  console.log(' pos  team                            points   balance  level');
  for (const row of table(state))
    console.log(
      `${String(row.standing).padStart(4)}  ${(row.name + (row.team === 0 ? ' *' : '')).padEnd(30)}  ${String(row.points).padStart(6)}  ${coins(row.balance).padStart(8)}  ${one(row.level).padStart(5)}`
    );
}

const seedsOf = (seed: string, runs: number): string[] =>
  Array.from({ length: runs }, (_, k) => (k === 0 ? seed : `${seed}-${k + 1}`));

export async function runCareerScenario(
  sc: CareerScenario,
  flags: CareerFlags
): Promise<void> {
  const seasons = sc.kind === 'season' ? 1 : (flags.seasons ?? sc.seasons ?? 1);
  const seeds = seedsOf(flags.seed ?? sc.seed ?? SEED, Math.max(1, flags.runs));
  const runs: CareerRun[] = seeds.map((seed) => ({
    seed,
    races: racesOf(seasons),
    standin: flags.standin,
    you: sc.you ?? YOU,
  }));
  const workers = flags.standin ? 0 : Math.min(flags.workers, runs.length);
  const dir = outDir(flags.subject, {
    scenario: sc,
    seasons,
    seeds,
    standin: flags.standin,
    workers,
  });
  const told: Told[][] = runs.map(() => []);
  const tell = (k: number, t: Told) => {
    told[k].push(t);
    const prefix = runs.length > 1 ? `[${seeds[k]}] ` : '';
    if (t.kind === 'race') console.log(prefix + raceText(t.line));
    else if (sc.kind === 'career')
      console.log(
        seasonText(t.figures)
          .split('\n')
          .map((l) => prefix + l)
          .join('\n')
      );
  };
  console.log(
    `${sc.kind}: ${seasons} season${seasons === 1 ? '' : 's'} from seed ${seeds.join(', ')}, ${flags.standin ? 'stand-in results' : `real matches on ${workers} worker${workers === 1 ? '' : 's'}`}`
  );
  const began = performance.now();
  const states = flags.standin
    ? runs.map((run, k) => runCareer(run, (t) => tell(k, t)))
    : await runCareers(runs, workers, tell);
  const wall = performance.now() - began;
  states.forEach((state, k) => {
    const hash = stateHash(state);
    if (sc.kind === 'season') {
      console.log(runs.length > 1 ? `table for ${seeds[k]}:` : 'table:');
      printTable(state);
    }
    writeJson(join(dir, `career-${k + 1}.json`), {
      seed: seeds[k],
      hash,
      told: told[k],
      table: table(state),
    });
    writeJson(join(dir, `state-${k + 1}.json`), state);
    console.log(`final state hash ${hash}  (seed ${seeds[k]})`);
  });
  console.log(`wall: ${one(wall / 1000)} s  ${dir}`);
}

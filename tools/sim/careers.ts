import { join } from 'node:path';
import type { CareerState } from '../../src/career/state.ts';
import { LEAGUE } from '../../src/career/tuning.ts';
import { outDir, writeJson } from '../out.ts';
import {
  SEED,
  YOU,
  racesOf,
  runCareer,
  stateHash,
  table,
  type TableRow,
  type CareerRun,
  type CareerScenario,
  type RaceLine,
  type SeasonFigures,
  type Spread,
  type Told,
} from './career.ts';
import { runCareers } from './career-pool.ts';
import { targets, type Targets } from './targets.ts';

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
    `  teams that have hired / built / signed a sponsor: ${f.acted.hired} / ${f.acted.built} / ${f.acted.signed} of ${LEAGUE.teams} · policy commands refused: 0`,
  ].join('\n');

const targetLines = (t: Targets) => [
  `figures over ${t.careers} career${t.careers === 1 ? '' : 's'} of ${t.seasons} season${t.seasons === 1 ? '' : 's'}:`,
  `  seasons to reach the top 10: ${t.top10.each.map((s) => s ?? 'never').join(', ')} · median ${t.top10.median ?? 'never'}`,
  `  your standing after each season: ${t.standing.map((s) => `${s.season}: ${s.each.join(' ')}`).join(' · ')}`,
  `  your lowest balance in the first ${t.lowest.races} races: ${t.lowest.each.map(coins).join(', ')} · least ${coins(t.lowest.least)}`,
  `  rival teams repossessed a season: ${t.rivals.toFixed(2)}`,
  `  richest team's balance: ${t.richest.each.map(coins).join(', ')} · most ${coins(t.richest.most)}`,
  `  mean design level: top five ${one(t.levels.top)} · bottom five ${one(t.levels.bottom)}`,
  `  mean staff stars: top five ${t.stars.top.toFixed(2)}`,
];

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
    policy: sc.policy ?? true,
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
  const tables: TableRow[][] = [];
  states.forEach((state, k) => {
    const hash = stateHash(state);
    tables.push(table(state));
    if (sc.kind === 'season') {
      console.log(runs.length > 1 ? `table for ${seeds[k]}:` : 'table:');
      printTable(state);
    }
    writeJson(join(dir, `career-${k + 1}.json`), {
      seed: seeds[k],
      hash,
      told: told[k],
      table: tables[k],
    });
    writeJson(join(dir, `state-${k + 1}.json`), state);
    console.log(`final state hash ${hash}  (seed ${seeds[k]})`);
  });
  if (sc.kind === 'career') {
    const t = targets(
      told.map((lines, k) => ({ told: lines, table: tables[k] }))
    );
    writeJson(join(dir, 'targets.json'), t);
    for (const line of targetLines(t)) console.log(line);
  }
  console.log(`wall: ${one(wall / 1000)} s  ${dir}`);
}

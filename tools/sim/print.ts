import { EVEN } from '../../src/sim/even.ts';
import { RARITIES } from '../../src/sim/kinds.ts';
import type { Duel, DuelScenario } from './duel.ts';
import {
  BANDS,
  aimOf,
  bandOf,
  median as middle,
  type Aim,
  type DuelTally,
  type MatchFigures,
} from './figures.ts';
import type { MatchScenario, Summary } from './match.ts';

const pc = (x: number | null) => (x === null ? '-' : `${Math.round(100 * x)}%`);
const r2 = (x: number) => Math.round(x * 100) / 100;
const mean = (xs: readonly number[]) =>
  xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
const median = (xs: readonly number[]) => middle(xs) ?? 0;

const parts = (s: Summary) =>
  Object.entries(s.cost.parts)
    .filter(([k]) => k !== 'step')
    .sort((a, b) => b[1].mean - a[1].mean)
    .map(([k, c]) => `${k} ${c.mean}`)
    .join(' · ');

const decimal = (x: number | null, unit = '') =>
  x === null ? '-' : `${Math.round(x * 100) / 100}${unit}`;

type Side = Aim & { gunnery: number };

function sidesLine(sides: readonly Side[]) {
  const [a, b] = sides,
    ratio = a.rate !== null && b.rate ? `${r2(a.rate / b.rate)}×` : 'no ratio';
  return (
    `hit rate by Gunnery: ` +
    sides
      .map((k) => `Gunnery ${k.gunnery} ${pc(k.rate)} of ${k.shots}`)
      .join(' · ') +
    ` · ${ratio}`
  );
}

export function figureLines(f: MatchFigures): string[] {
  const aim = (a: Aim) => `${pc(a.rate)} of ${a.shots}`;
  const heals = RARITIES.map((r) => `${r} ${f.heals.by[r]}`).join(', ');
  return [
    `length: ${decimal(f.length, ' s')}`,
    `time to sink: median ${decimal(f.timeToSink, ' s')} over ${f.sinkings} sinkings by a ship`,
    `hit rate by range: ${aim(f.hitRate)} shots · ` +
      BANDS.map((b) => `${b} ${aim(f.byRange[b])}`).join(' · '),
    `heals used: ${f.heals.used} (${heals})`,
    `sea shares, all teams / the top team, at each sample: ` +
      f.sea.map((k, i) => `${i + 1} ${pc(k.claimed)}/${pc(k.top)}`).join(' · '),
    `places by standing: ` +
      f.places
        .map(
          (g) =>
            `${g.standings[0]}-${g.standings[1]} mean ${decimal(g.mean)} best ${g.best}`
        )
        .join(' · '),
  ];
}

export function printMatch(sc: MatchScenario, s: Summary, dir: string) {
  const fleet = sc.career
    ? 'race one of a career'
    : `even race of ${sc.teams ?? EVEN.teams.most}×${sc.perTeam ?? 2}`;
  console.log(
    `match ${sc.match ?? 1} on planet ${sc.planet ?? 'default'} · ${fleet} · ${sc.sea ?? 'flat'} sea · seed ${s.seed}`
  );
  console.log(`ended: ${s.end} at ${s.seconds} s (${s.steps} steps)`);
  for (const line of figureLines(s.figures)) console.log(line);
  if (s.sides) console.log(sidesLine(s.sides));
  const c = s.combat;
  console.log(
    `  sunk by ${
      Object.entries(c.causes)
        .map(([k, n]) => `${k} ${n}`)
        .join(', ') || 'none'
    } · dps median ${c.dps.median ?? '-'} · quiet ${c.quiet} s, lull ${c.lull} s`
  );
  const m = s.movement;
  console.log(
    `  movement: ${m.pinned} ship-seconds pinned, ${m.aground} aground${m.worst.length ? ` · worst ${m.worst.map((w) => `#${w.id} ${w.pinned} s`).join(', ')}` : ''}`
  );
  const step = s.cost.parts.step;
  console.log(
    `  cost: ${step.mean} ms a step (median ${step.median}, p95 ${step.p95}, worst ${step.worst}) · ${parts(s)}`
  );
  const inv = s.invariants;
  console.log(
    inv.broken
      ? `INVARIANTS: ${inv.broken} broken · first: ${inv.first
          .slice(0, 3)
          .map(
            (b) =>
              `${b.what} ${b.ship === null ? '' : `#${b.ship} `}at ${b.t} s (${b.detail})`
          )
          .join('; ')} · all in events.jsonl (type "invariant")`
      : 'invariants: none broken'
  );
  console.log(`hash ${s.hash}`);
  console.log(`wall ${(s.wallMs / 1000).toFixed(1)} s`);
  console.log(
    `→ ${dir}  (summary.json; events.jsonl; ships.jsonl, each ship each second)`
  );
}

const named = (sc: DuelScenario, i: number) => {
  const k = sc.ships[i],
    levels =
      typeof k.levels === 'object'
        ? JSON.stringify(k.levels)
        : (k.levels ?? 50),
    stats =
      typeof k.stats === 'object' ? JSON.stringify(k.stats) : (k.stats ?? 10);
  return `${'AB'[i]} (level ${levels}, stats ${stats}${k.gun ? `, ${k.gun}` : ''})`;
};

export function printDuelStart(sc: DuelScenario, runs: number) {
  console.log(
    `duel on planet ${sc.planet ?? 'default'} · ${named(sc, 0)} against ${named(sc, 1)} · ${runs} seed${runs === 1 ? '' : 's'}, each sailed from both berths`
  );
}

export function printDuel(d: Duel) {
  const f = d.figures,
    who = (id: number) => 'AB'[d.sides[id]];
  const shots = f.ships
    .map((a, id) => `${who(id)} ${a.shots} shots, ${pc(a.rate)} hit`)
    .join(' · ');
  console.log(
    `  match ${d.match} ${who(0)}${who(1)}: ${f.winner === null ? 'no winner' : `${who(f.winner)} wins`} at ${decimal(f.seconds, ' s')} · ` +
      `${f.sunk ? `${who(f.sunk.ship)} sunk by ${f.sunk.cause}` : 'none sunk'} · time to sink ${decimal(f.timeToSink, ' s')} · ${shots} · hash ${d.hash}`
  );
}

export function printDuelTally(
  sc: DuelScenario,
  t: DuelTally,
  hash: string,
  wallMs: number,
  dir: string
) {
  console.log(
    `wins: ${t.wins.map((n, i) => `${'AB'[i]} ${n}`).join(' · ')} of ${t.duels}${t.none ? ` · ${t.none} with no winner` : ''}`
  );
  console.log(
    `time to sink: median ${decimal(t.timeToSink, ' s')} · ended in the storm ${t.storm}, ${t.stormUnfired} of them with no shot fired`
  );
  console.log(`${named(sc, 0)} against ${named(sc, 1)}`);
  console.log(`hash ${hash}`);
  console.log(`wall ${(wallMs / 1000).toFixed(1)} s`);
  console.log(`→ ${dir}  (duels.json; match-*/ each duel's summary and logs)`);
}

export function pooled(all: readonly Summary[]) {
  const shots = all.flatMap((s) => s.account.fired);
  return {
    matches: all.length,
    length: {
      median: median(all.map((s) => s.seconds)),
      mean: r2(mean(all.map((s) => s.seconds))),
    },
    ends: Object.fromEntries(
      [...new Set(all.map((s) => s.end))].map((e) => [
        e,
        all.filter((s) => s.end === e).length,
      ])
    ),
    timeToSink: middle(
      all.flatMap((s) =>
        s.account.sunk.flatMap((k) => (k.fight === null ? [] : [k.fight]))
      )
    ),
    hitRate: aimOf(shots),
    byRange: Object.fromEntries(
      BANDS.map((b) => [b, aimOf(shots.filter((k) => bandOf(k.range) === b))])
    ),
    heals: r2(mean(all.map((s) => s.figures.heals.used))),
    sides: all[0]?.sides
      ? all[0].sides.map((side, i) => {
          const each = all.flatMap((s) => (s.sides ? [s.sides[i]] : [])),
            shots = each.reduce((n, k) => n + k.shots, 0),
            landed = each.reduce((n, k) => n + k.landed, 0);
          return {
            gunnery: side.gunnery,
            shots,
            landed,
            rate: shots ? r2(landed / shots) : null,
          };
        })
      : null,
    msPerStep: r2(mean(all.map((s) => s.cost.parts.step.mean))),
    invariants: all.reduce((n, s) => n + s.invariants.broken, 0),
    hashes: all.map((s) => s.hash),
  };
}

export function printPooled(
  p: ReturnType<typeof pooled>,
  hash: string,
  wallMs: number,
  dir: string
) {
  console.log(
    `pooled over ${p.matches} matches: length median ${p.length.median} s · ends ${JSON.stringify(p.ends)}`
  );
  console.log(
    `time to sink: median ${decimal(p.timeToSink, ' s')} · hit rate by range: ${pc(p.hitRate.rate)} of ${p.hitRate.shots} · ${Object.entries(
      p.byRange
    )
      .map(([b, k]) => `${b} ${pc(k.rate)} of ${k.shots}`)
      .join(' · ')} · heals used ${p.heals} a match`
  );
  if (p.sides) console.log(sidesLine(p.sides));
  console.log(
    `cost: ${p.msPerStep} ms a step · invariants: ${p.invariants ? `${p.invariants} BROKEN` : 'none broken'}`
  );
  console.log(`hash ${hash}`);
  console.log(`wall ${(wallMs / 1000).toFixed(1)} s`);
  console.log(
    `→ ${dir}  (pooled.json; run-*/ each a match's summary.json, events.jsonl, ships.jsonl)`
  );
}

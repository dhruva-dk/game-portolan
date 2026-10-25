// Acceptance check 4 (PROMPT.md, Pacing): across 200 seeded matches (tests/tools/tournament.ts, on worker_threads),
//   - matches end in nine to eleven minutes: every one of the 200;
//   - every region is chosen as a break-off point by someone: a captain swiping off the Great Current into it (riding
//     to the current's end and being thrown off is no choice);
//   - the storm's final calm falls in every region with roughly equal frequency: in every region at least once, and
//     Pearson's χ² of the regions' counts against equal shares (the twelve regions are equal in area) under the 0.1 %
//     upper tail on 11 degrees of freedom, the bound WP8 part C set for the plan over 10 000 seeds (storm.test.ts).
// The stated bounds are BOUND's. The numbers are recorded in progress/checks/check4.json before anything is asserted,
// with how each match paces out: its first sinking (the calm), the captains afloat when the final calm holds (the
// tension the storm gathers), and whether a rival or the storm sinks the last to fall (the payoff).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { CAUSE } from '../../src/sim/state.ts';
import { STORM } from '../../src/sim/tables.ts';
import { REGIONS } from '../../src/sim/world/regions.ts';
import { mean, tournament } from '../tools/tournament.ts';

/** The stated bounds. */
export const BOUND = {
  /** Every match ends within [minutes[0], minutes[1]] min. */
  minutes: [9, 11],
  /** Every region is chosen for a break-off at least `breakOff` times, and the final calm falls in it at least `calm` times. */
  breakOff: 1, calm: 1,
  /** The final calm's χ² against equal shares stays under the upper tail of probability `p`. */
  p: 0.001,
} as const;
const N = 200, Z = 3.09; // Z: the normal deviate of BOUND.p's upper tail

test('check 4: pacing — 200 matches end in 9–11 min, every region chosen for break-off, the final calm in every region alike', { timeout: 1_200_000 }, async (t) => {
  const run = await tournament(N), k = REGIONS.length, last = STORM.phases.length - 2;
  const minutes = run.matches.map((m) => m.minutes), sorted = [...minutes].sort((a, b) => a - b);
  const quantile = (q: number): number => sorted[Math.round(q * (N - 1))];
  const breakOff = new Array<number>(k).fill(0), calm = new Array<number>(k).fill(0);
  for (const r of run.rows) if (r.region >= 0) breakOff[r.region]++;
  for (const m of run.matches) calm[m.calm]++;
  const e = N / k, chi = calm.reduce((a, o) => a + (o - e) ** 2 / e, 0), df = k - 1, h = 2 / (9 * df), critical = df * (1 - h + Z * Math.sqrt(h)) ** 3;
  // How the matches pace out: the first sinking; captains afloat when the final calm holds; whether the storm or a rival sank the last ship to fall.
  const held = (STORM.phases[last].move + STORM.phases[last].sweep) / 60;
  const pace = run.matches.map((m) => {
    const sank = m.rows.filter((r) => r.fate >= 0).sort((a, b) => a.at - b.at);
    return { first: sank[0]?.at ?? m.minutes, afloat: m.rows.filter((r) => r.fate < 0 || r.at >= held).length, stormLast: sank.at(-1)?.fate === CAUSE.storm };
  });
  const record = {
    date: new Date().toISOString().slice(0, 10), matches: N, wall: run.wall, workerSeconds: run.workerSeconds, bounds: BOUND,
    minutes: { min: sorted[0], q1: quantile(0.25), median: quantile(0.5), q3: quantile(0.75), max: sorted[N - 1], mean: mean(minutes), inBounds: minutes.filter((x) => x >= BOUND.minutes[0] && x <= BOUND.minutes[1]).length },
    breakOff: Object.fromEntries(REGIONS.map((r, j) => [r.name, breakOff[j]])),
    calm: { byRegion: Object.fromEntries(REGIONS.map((r, j) => [r.name, calm[j]])), expected: e, chi, df, critical },
    pace: { firstSinking: mean(pace.map((x) => x.first)), firstSinkingMin: Math.min(...pace.map((x) => x.first)), captainsAtFinalCalm: mean(pace.map((x) => x.afloat)), finalCalmHeld: held, lastSunkByStorm: pace.filter((x) => x.stormLast).length },
  };
  mkdirSync('progress/checks', { recursive: true });
  writeFileSync('progress/checks/check4.json', `${JSON.stringify(record, null, 1)}\n`);
  const m = record.minutes;
  t.diagnostic(`${N} matches: ${run.wall.toFixed(1)} s wall, ${run.workerSeconds.toFixed(0)} worker-s`);
  t.diagnostic(`match length min ${m.min.toFixed(2)}, q1 ${m.q1.toFixed(2)}, median ${m.median.toFixed(2)}, q3 ${m.q3.toFixed(2)}, max ${m.max.toFixed(2)}, mean ${m.mean.toFixed(2)} min; ${m.inBounds} of ${N} in ${BOUND.minutes.join('–')} min`);
  t.diagnostic(`break-offs by region: ${REGIONS.map((r, j) => `${r.name} ${breakOff[j]}`).join(', ')}`);
  t.diagnostic(`final calm by region (expected ${e.toFixed(1)}): ${REGIONS.map((r, j) => `${r.name} ${calm[j]}`).join(', ')}; χ² ${chi.toFixed(2)} on ${df} df, bound ${critical.toFixed(2)} (p = ${BOUND.p})`);
  t.diagnostic(`pace: first sinking at ${record.pace.firstSinking.toFixed(2)} min (earliest ${record.pace.firstSinkingMin.toFixed(2)}); ${record.pace.captainsAtFinalCalm.toFixed(1)} captains afloat when the final calm holds at ${held.toFixed(2)} min; the storm sank the last to fall in ${record.pace.lastSunkByStorm} of ${N}`);

  assert.ok(m.min >= BOUND.minutes[0] && m.max <= BOUND.minutes[1], `matches end in ${m.min.toFixed(2)}–${m.max.toFixed(2)} min (${N - m.inBounds} outside ${BOUND.minutes.join('–')})`);
  for (let j = 0; j < k; j++) assert.ok(breakOff[j] >= BOUND.breakOff, `nobody chose ${REGIONS[j].name} to break off into`);
  for (let j = 0; j < k; j++) assert.ok(calm[j] >= BOUND.calm, `the final calm never fell in ${REGIONS[j].name}`);
  assert.ok(chi < critical, `the final calm falls unevenly: χ² ${chi.toFixed(2)} ≥ ${critical.toFixed(2)}`);
});

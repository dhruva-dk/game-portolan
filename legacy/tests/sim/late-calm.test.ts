import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tournamentMatch } from '../tools/tournament.ts';
import { cpuNow } from '../cpu.ts';

const MATCH = 43, BOUND = 1000;

test('the last calms: tournament match 43 runs to its end with no tick over the CPU bound', { timeout: 600_000 }, () => {
  let last = 0, worst = 0, at = -1, ticks = 0;
  const out = tournamentMatch(MATCH, (s) => {
    const now = cpuNow();
    if (ticks > 0 && now - last > worst) [worst, at] = [now - last, s.tick];
    last = now;
    ticks++;
  });
  assert.ok(out.minutes > 5 && ticks > 0, `match ${MATCH} played to its end (${out.minutes.toFixed(2)} min)`);
  assert.ok(worst < BOUND, `slowest tick ${worst.toFixed(0)} ms of CPU at tick ${at}, over the bound ${BOUND} ms`);
});

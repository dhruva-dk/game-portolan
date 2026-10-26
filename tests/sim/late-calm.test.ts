// The last calms' cost (S-026, WP12 part E fix pass 6): tournament match 43 (seed 12043, tests/tools/tournament.ts)
// run to its end, every tick under a generous CPU bound. In it, captains in storm mode chart for a last calm they can
// find no sea route to. Uncapped, each failed search (nav.ts findRoute) reopened the open water's cells many times over
// with the chart's greed, and a captain charted again on every beat: single ticks of 4–109 s near tick 18,300. The cap
// on a search's work and the captain's holding its course after a failed chart (brain.ts stormGoal) bound them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tournamentMatch } from '../tools/tournament.ts';
import { cpuNow } from '../cpu.ts';

// ms of CPU a tick may take: five times the slowest tick of all 200 matches (199 ms, wall), and far under the 4–109 s
const MATCH = 43, BOUND = 1000;

test('the last calms: tournament match 43 runs to its end with no tick over the CPU bound', { timeout: 600_000 }, () => {
  let last = 0, worst = 0, at = -1, ticks = 0;
  const out = tournamentMatch(MATCH, (s) => {
    const now = cpuNow();
    if (ticks > 0 && now - last > worst) [worst, at] = [now - last, s.tick]; // from the first tick on: not the sea's making
    last = now;
    ticks++;
  });
  assert.ok(out.minutes > 5 && ticks > 0, `match ${MATCH} played to its end (${out.minutes.toFixed(2)} min)`);
  assert.ok(worst < BOUND, `slowest tick ${worst.toFixed(0)} ms of CPU at tick ${at}, over the bound ${BOUND} ms`);
});

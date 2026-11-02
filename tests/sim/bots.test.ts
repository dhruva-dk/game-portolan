// The captains' behaviours, counted over whole headless matches of league captains (tests/tools/bots.ts): every one
// the plan asks of the bots happens, the captains who hold territory hold landmarks longest, and skill shows.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HOLDER, botReport } from '../tools/bots.ts';
import { STYLE_NAMES } from '../../src/sim/captains/temperaments.ts';

test('over 20 matches the captains do everything the plan asks of them, hold every landmark, and finish by skill', (t) => {
  const report = botReport(1, 20);
  const missing = Object.entries(report.counts).filter(([, n]) => n === 0).map(([k]) => k);
  for (const [k, n] of Object.entries(report.counts)) t.diagnostic(`${String(n).padStart(7)}  ${k}`);
  assert.deepEqual(missing, [], `behaviours never seen: ${missing.join(', ')}`);
  const others = report.holding.filter((_, k) => k !== HOLDER);
  const mean = others.reduce((a, b) => a + b, 0) / others.length;
  t.diagnostic(`seconds holding a landmark, per captain: ${report.holding.map((h, k) => `${STYLE_NAMES[k]} ${h.toFixed(0)}`).join(', ')}`);
  assert.ok(report.holding[HOLDER] > mean, `territory holders hold landmarks longer (${report.holding[HOLDER].toFixed(0)} s) than the others on average (${mean.toFixed(0)} s)`);
  const { high, low } = report.placed;
  assert.ok(high < low, `captains drawn at a higher skill finish higher on average (place ${high.toFixed(1)}) than those drawn lower (${low.toFixed(1)})`);
});

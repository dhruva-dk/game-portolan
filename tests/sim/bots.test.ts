// The captains' behaviours, counted over whole headless matches of league captains (tests/tools/bots.ts): every one
// the plan asks of the bots happens and none targets a ship hidden from it, the captains who hold territory hold
// landmarks longest, and skill shows.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HOLDER, NEVER, botReport } from '../tools/bots.ts';
import { STYLE_NAMES } from '../../src/sim/captains/temperaments.ts';

test('over 20 matches the captains do everything the plan asks of them, hold every landmark, and finish by skill', (t) => {
  const report = botReport(1, 20);
  const missing = Object.entries(report.counts).filter(([k, n]) => n === 0 && !NEVER.includes(k)).map(([k]) => k);
  for (const [k, n] of Object.entries(report.counts)) t.diagnostic(`${String(n).padStart(7)}  ${k}`);
  assert.deepEqual(missing, [], `behaviours never seen: ${missing.join(', ')}`);
  for (const k of NEVER) assert.equal(report.counts[k], 0, `a captain ${k}`);
  // the fleet spreads out over the regions in every match, not just in some
  assert.equal(report.counts['spreads its Gale picks'], report.matches, 'no region gets more than a quarter of the picks');
  const others = report.holding.filter((_, k) => k !== HOLDER);
  t.diagnostic(`seconds holding a landmark, per captain: ${report.holding.map((h, k) => `${STYLE_NAMES[k]} ${h.toFixed(0)}`).join(', ')}`);
  assert.ok(report.holding[HOLDER] > Math.max(...others), `territory holders hold landmarks longest (${report.holding[HOLDER].toFixed(0)} s, the next ${Math.max(...others).toFixed(0)} s)`);
  const { high, low } = report.placed;
  assert.ok(high < low, `captains drawn at a higher skill finish higher on average (place ${high.toFixed(1)}) than those drawn lower (${low.toFixed(1)})`);
});

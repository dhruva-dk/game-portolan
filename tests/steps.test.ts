import { test } from 'node:test';
import assert from 'node:assert/strict';
import { steps, world } from '../tools/steps.ts';

// a guard, not the measure (npm run steps is): wide enough that a busy machine passes, narrow enough that the ride's
// cost coming back (8 ms and more a step) or anything like it fails
test("a step of a full match of bots on the real swell costs under 5 ms (the median, best of three)", () => {
  const w = world();
  let best = Infinity;
  for (let run = 0; run < 3 && best >= 5; run++) {
    const r = steps(w, 20);
    const step = r.parts.find(([k]) => k === 'step')![1];
    best = Math.min(best, step.median);
  }
  console.log(`# a step: ${best.toFixed(2)} ms (median)`);
  assert.ok(best < 5, `${best} ms a step`);
});

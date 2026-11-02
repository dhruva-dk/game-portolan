// The player's habits as the app measures them for the career, and what the career's captains carry into a match.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MatchTally } from '../../src/app/career.ts';
import { setupFrom } from '../../src/app/session.ts';
import { newCareer } from '../../src/career/career.ts';
import { planMatch } from '../../src/career/fleet.ts';
import { LEARNING } from '../../src/career/habits.ts';
import { v3 } from '../../src/sim/math.ts';

const ships = (n: number, afloat = true) => Array.from({ length: n }, () => ({ pos: v3(0, 0, 1), afloat }));

/** A tally of one player's match, second by second: '.' calm, 'c' calm with the Storm closing, 'o' out in the Storm. */
function tallied(seconds: string, sinks = false): number | null {
  const t = new MatchTally(20);
  [...seconds].forEach((s, k) => t.sample(k + 1, ships(20, !(sinks && k === seconds.length - 1)), { closing: s !== '.', outside: s === 'o' }));
  return t.report([], () => 0).habits!.storm;
}

test('the tally keeps the Storm habit as seconds out in it each time it caught the player', () => {
  assert.equal(tallied('.'.repeat(30)), null, 'no habit before the Storm closes in');
  assert.equal(tallied('c'.repeat(90)), 0, 'a minute of the Storm closing without catching them: they run early');
  assert.equal(tallied(`cc${'o'.repeat(4)}cc${'o'.repeat(8)}cc`), 6, 'two stretches, of 4 and 8 seconds');
  assert.equal(tallied(`cc${'o'.repeat(13)}`, true), 12, 'a stretch that ends in sinking counts, to the last second afloat');
});

test('the tally keeps the run habit as the hull the player turned to mend at, or 0 when they fought to the sinking', () => {
  const at = (hulls: number[], sunkBy = -1): number | null => {
    const t = new MatchTally(20);
    for (const h of hulls) t.observe({ k: 'useStart', ship: 0, item: 'repairKit', seconds: 3 }, () => v3(), () => h);
    if (sunkBy >= 0) t.observe({ k: 'sink', ship: 0, by: sunkBy, cause: 'cannon', pos: v3() }, () => v3());
    return t.report([], () => 0).habits!.runAt;
  };
  assert.equal(at([]), null, 'nothing to go on');
  assert.equal(at([95]), null, 'topping up a scratched hull is not breaking off');
  assert.equal(at([40, 60]), 50);
  assert.equal(at([], 3), 0, 'sunk by a ship without once turning to mend: stands and fights');
});

test('a captain carries what it knows of the player into the match, on the simulation\'s scale', () => {
  const plan = planMatch(newCareer(3));
  plan.fleet[0].knows = {
    ...plan.fleet[0].knows,
    drop: { value: 4, confidence: LEARNING.full },
    runAt: { value: 40, confidence: LEARNING.known },
    storm: { value: 9, confidence: 800 },
  };
  const mind = setupFrom(plan).fleet![1].mind!;
  assert.deepEqual(mind.dive, { value: 4, confidence: 1 });
  assert.deepEqual(mind.run, { value: 40, confidence: 0.5 });
  assert.deepEqual(mind.storm, { value: 9, confidence: 0.8 });
  const stranger = setupFrom(planMatch(newCareer(3))).fleet![1].mind!;
  assert.equal(stranger.storm, undefined, 'a stranger knows nothing of it');
});

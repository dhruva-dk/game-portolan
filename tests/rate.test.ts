// The harness's ratings (tools/harness/rate.ts): matches made up with groups of
// known strength, sunk in the order the model says, fit back to them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { random } from '../src/world/random.ts';
import type { ShipResult } from '../tools/harness/metrics.ts';
import { GROUPINGS, rate } from '../tools/harness/rate.ts';
import type { Result } from '../tools/harness/run.ts';

/** `n` matches of `ships` ships, the groups' θ given, sunk worst first by e^−θ; the last afloat left. */
function made(theta: Record<string, number>, n: number, ships: number) {
  const u = random(91),
    names = Object.keys(theta);
  const out: Result[] = [];
  for (let m = 0; m < n; m++) {
    const fleet = Array.from({ length: ships }, (_, id) => ({
      id,
      persona: names[id % names.length],
    }));
    const afloat = [...fleet],
      place = new Map<number, number>();
    while (afloat.length > 1) {
      const w = afloat.map((s) => Math.exp(-theta[s.persona])),
        total = w.reduce((a, b) => a + b, 0);
      let r = u() * total,
        k = 0;
      while (k < w.length - 1 && r >= w[k]) r -= w[k++];
      place.set(afloat[k].id, afloat.length);
      afloat.splice(k, 1);
    }
    const ship = (s: (typeof fleet)[number]): ShipResult =>
      ({
        id: s.id,
        persona: s.persona,
        place: place.get(s.id) ?? 1,
        sunk: place.has(s.id) ? { time: 0, cause: 'shot', by: null } : null,
      }) as ShipResult;
    out.push({ ships: fleet.map(ship), type: 'mixed' } as Result);
  }
  return out;
}

test('the ratings find the strengths the matches were sunk by, centred, each within a few of its errors', () => {
  const truth = { a: 0.4, b: 0.1, c: -0.1, d: -0.4 };
  const rs = rate(made(truth, 40, 40), GROUPINGS.persona, 60);
  assert.deepEqual(
    rs.map((r) => r.group),
    ['a', 'b', 'c', 'd']
  );
  for (const r of rs) {
    const want = truth[r.group as keyof typeof truth];
    assert.ok(r.se > 0 && r.se < 0.15, `${r.group} se ${r.se}`);
    assert.ok(
      Math.abs(r.theta - want) < 3 * r.se,
      `${r.group}: ${r.theta.toFixed(3)} for ${want} ± ${r.se.toFixed(3)}`
    );
  }
  assert.ok(Math.abs(rs.reduce((a, r) => a + r.theta, 0)) < 1e-9);
});

test('groups alike rate alike', () => {
  const rs = rate(made({ a: 0, b: 0, c: 0 }, 40, 30), GROUPINGS.persona, 60);
  for (const r of rs)
    assert.ok(Math.abs(r.theta) < 3 * r.se, `${r.group} ${r.theta}`);
});

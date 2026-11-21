// The harness report (tools/harness/report.ts, pooled.ts): a short run over a
// planet of each set measures every metric, planet by planet, pooled and the
// worst, each a finite figure with a finite error; the page holds them all,
// and a run set against itself as a baseline has changed in nothing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PLANETS, poolSpecs } from '../tools/harness/planets.ts';
import { METRICS, measured } from '../tools/harness/pooled.ts';
import { against, page } from '../tools/harness/report.ts';
import { runMatch } from '../tools/harness/run.ts';

test('a short pooled run measures every metric, finite, per planet and pooled', () => {
  const specs = poolSpecs([PLANETS.tune[0], PLANETS.held[0]], 2, {
    seconds: 40,
  });
  const results = specs.map(runMatch);
  const m = measured(results);
  assert.equal(m.planets.length, 2);
  const all = [
    ...m.planets.map((p) => p.values),
    m.pooled.tune!,
    m.pooled.held!,
    m.worst.tune!,
    m.worst.held!,
  ];
  for (const values of all)
    for (const x of METRICS) {
      const v = values[x.key];
      assert.ok(Number.isFinite(v.v), `${x.key} ${v.v}`);
      assert.ok(Number.isFinite(v.se) && v.se >= 0, `${x.key} se ${v.se}`);
    }
  assert.ok(m.pooled.tune!.dealt.v > 0, 'blows were dealt');
  assert.ok(m.pooled.held!.distinct.v > 0, 'the personas sail apart');
  for (const r of results)
    assert.ok(r.lull >= 0 && r.lull <= r.seconds, 'the lull is in the match');
  const html = page(m, { matches: 2, from: 1, seconds: 1 }, true);
  for (const x of METRICS) assert.ok(html.includes(x.label), x.key);
  assert.ok(html.includes(`replay-${PLANETS.held[0]}.html`));
  const same = against(m, {
    matches: 2,
    from: 1,
    planets: PLANETS,
    measured: m,
  });
  assert.ok(!same.slice(1).some((l) => l.includes('WORSE')), same.join('\n'));
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BOOM } from '../src/play/chase.ts';
import { FINALE, finale } from '../src/play/finale.ts';

test('no end, no shot: the chase as it is', () => {
  assert.deepEqual(finale(null, 3), {});
});

for (const end of ['sunk', 'won'] as const) {
  const f = FINALE[end];
  test(`${end}: it starts on the chase's own boom and eases out to its own, still turning`, () => {
    const at = (t: number) => finale(end, t);
    assert.deepEqual([at(0).boom, at(0).tilt, at(0).spin], [BOOM, 0, 0]);
    assert.ok(Math.abs(at(f.rise).boom! - (BOOM + f.back)) < 1e-9);
    assert.ok(Math.abs(at(f.rise * 4).boom! - (BOOM + f.back)) < 1e-9);
    assert.ok(Math.abs(at(f.rise).tilt! - f.tilt) < 1e-9);
    const rate = (at(f.rise + 2).spin! - at(f.rise + 1).spin!) / 1;
    assert.ok(Math.abs(rate - f.turn) < 1e-9, `${rate}`);
  });

  test(`${end}: never a jump: the boom, tilt and turn move smoothly frame to frame, the turn only ever onward`, () => {
    const dt = 1 / 30;
    let last = finale(end, 0);
    for (let t = dt; t < f.rise * 3; t += dt) {
      const s = finale(end, t);
      assert.ok(
        Math.abs(s.boom! - last.boom!) < f.back * dt * 2,
        `boom at ${t.toFixed(2)}`
      );
      assert.ok(
        Math.abs(s.tilt! - last.tilt!) < f.tilt * dt * 2,
        `tilt at ${t.toFixed(2)}`
      );
      const turned = s.spin! - last.spin!;
      assert.ok(
        turned >= 0 && turned <= f.turn * dt + 1e-9,
        `turn at ${t.toFixed(2)}`
      );
      last = s;
    }
  });
}

test('the beat ends before the shot has eased all the way out, so the result comes over a camera still moving', () => {
  for (const end of ['sunk', 'won'] as const)
    assert.ok(
      FINALE[end].beat > 1.5 && FINALE[end].beat <= FINALE[end].rise,
      end
    );
});

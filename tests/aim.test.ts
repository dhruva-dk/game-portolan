import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AIM, aimDistance, clear } from '../src/play/aim.ts';

test("the aim's distance along the look: near looking down steeply, far looking along the sea (0117's)", () => {
  assert.equal(aimDistance(AIM.pitch[1]), AIM.near);
  assert.equal(aimDistance(1.2), AIM.near);
  assert.equal(aimDistance(AIM.pitch[0]), AIM.far);
  assert.equal(aimDistance(-0.3), AIM.far);
  assert.ok(aimDistance(0.3) > aimDistance(0.4));
});

test('the reticle never sits on her: lifted clear above her outline, or below it with no room above, at its bearing', () => {
  const her = [{ x: 440, y: 200 }, { x: 520, y: 200 }, { x: 480, y: 120 }, { x: 470, y: 230 }];
  assert.deepEqual(clear({ x: 300, y: 180 }, her, 16, 440), { x: 300, y: 180 }, 'clear of her, where it falls');
  assert.deepEqual(clear({ x: 480, y: 180 }, her, 16, 440), { x: 480, y: 104 }, 'on her: above her');
  assert.deepEqual(clear({ x: 480, y: 128 }, [{ x: 440, y: 10 }, { x: 520, y: 230 }], 16, 440), { x: 480, y: 246 }, 'no room above: below');
  assert.deepEqual(clear({ x: 430, y: 180 }, her, 16, 440), { x: 430, y: 104 }, 'within the pad counts as on her');
  assert.deepEqual(clear({ x: 480, y: 180 }, her, 16, 440, 110), { x: 480, y: 246 }, 'under the HUD at the top: below');
});

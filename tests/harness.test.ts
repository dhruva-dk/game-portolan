import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { serve, launch, openGame, DEVICES, type DeviceName } from './harness.ts';

const shots = process.env.SHOTS ?? join(tmpdir(), 'portolan-harness');

test('the harness drives the game on every device', async (t) => {
  const server = await serve();
  const { browser, renderer, gpu } = await launch();
  t.after(async () => {
    await browser.close();
    await server.close();
  });
  t.diagnostic(`WebGL: ${renderer}`);
  assert.ok(gpu, `WebGL is on the GPU (${renderer})`);

  for (const name of Object.keys(DEVICES) as DeviceName[]) {
    await t.test(name, async () => {
      const game = await openGame(browser, server.url, { device: name, query: { seed: 1 } });
      const { device, page } = game;
      await page.waitForFunction(() => document.querySelector('canvas'), null, { timeout: 120_000 });
      await page.evaluate(() => new Promise((done) => setTimeout(done, 3000)));

      const env = await page.evaluate(() => {
        const probe = document.createElement('div');
        probe.style.cssText = 'position:fixed;padding:env(safe-area-inset-top) env(safe-area-inset-right)'
          + ' env(safe-area-inset-bottom) env(safe-area-inset-left)';
        document.body.append(probe);
        const s = getComputedStyle(probe);
        const insets = { top: s.paddingTop, right: s.paddingRight, bottom: s.paddingBottom, left: s.paddingLeft };
        probe.remove();
        return {
          insets: Object.fromEntries(Object.entries(insets).map(([k, v]) => [k, parseFloat(v)])),
          size: [innerWidth, innerHeight, devicePixelRatio],
          touch: matchMedia('(pointer: coarse)').matches && navigator.maxTouchPoints > 0,
          landscape: screen.orientation.type.startsWith('landscape'),
        };
      });
      assert.deepEqual(env.insets, device.safeArea, 'env(safe-area-inset-*)');
      assert.deepEqual(env.size, [device.width, device.height, device.dpr], 'viewport and pixel ratio');
      assert.ok(env.touch && env.landscape, 'a landscape touch screen');

      await page.evaluate(() => {
        const seen = ((window as any).__touches = { start: 0, move: 0, end: 0, most: 0 });
        for (const type of ['touchstart', 'touchmove', 'touchend'] as const) {
          addEventListener(type, (e) => {
            seen[type.slice(5) as 'start' | 'move' | 'end']++;
            seen.most = Math.max(seen.most, e.touches.length);
          }, { capture: true });
        }
      });
      const mid = { x: device.width / 2, y: device.height / 2 };
      await game.tap(mid);
      await game.drag({ x: 120, y: mid.y }, { x: 120, y: mid.y - 80 });
      await game.touch([{ id: 1, x: 100, y: mid.y }]);
      await game.pinch(mid, 300, 120);
      await game.touch([]);
      const seen = await page.evaluate(() => (window as any).__touches);
      t.diagnostic(`${name} touches: ${JSON.stringify(seen)}`);
      assert.equal(seen.most, 3, 'stick thumb plus two pinching fingers');
      assert.equal(seen.start, 5, 'tap, drag, thumb, and two pinch fingers land');
      assert.equal(seen.end, 5, 'and all lift');
      assert.ok(seen.move > 20, 'fingers move across frames');

      const png = await game.screenshot(join(shots, `harness-${name}.png`));
      assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [device.width * device.dpr, device.height * device.dpr]);
      t.diagnostic(`${name}: ${join(shots, `harness-${name}.png`)}`);

      await game.throttleCPU(4);
      await game.throttleCPU(1);

      const problems = game.problems();
      for (const p of problems) t.diagnostic(p.slice(0, 300));
      await game.close();
      assert.deepEqual(problems, [], 'no console errors, warnings, or stray requests');
    });
  }
});

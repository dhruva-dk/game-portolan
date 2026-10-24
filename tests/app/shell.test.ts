// The app on each device: it boots to the title inside the startup budget (A9) with no text in the DOM, moves
// title → harbour → match by touch alone, and pausing stops both the match and the render clock. On the iPad the
// relaunch is also timed with the CPU throttled 4× and the world read back from the device cache. Screenshots go to
// $SHOTS (default: a temp dir).
//   node --test tests/app/shell.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { serve, launch, openGame, DEVICES, type DeviceName, type Game } from '../harness.ts';

const shots = process.env.SHOTS ?? join(tmpdir(), 'portolan-app');
const wait = (ms: number) => new Promise((done) => setTimeout(done, ms));

interface Perf { startup: number; worldMs: number; worldCached: boolean }
const perf = (game: Game) => game.hook((g): Perf => g.perf);

test('the app boots, moves through its screens by touch and pauses', async (t) => {
  const server = await serve();
  const { browser } = await launch();
  t.after(async () => {
    await browser.close();
    await server.close();
  });

  for (const name of Object.keys(DEVICES) as DeviceName[]) {
    await t.test(name, async () => {
      const game = await openGame(browser, server.url, { device: name });
      const { device, page } = game;
      await game.until((g) => g.ready);
      const boot = await perf(game);
      t.diagnostic(`${name}: title after ${boot.startup.toFixed(0)} ms, world ${boot.worldMs.toFixed(0)} ms (cached ${boot.worldCached})`);
      assert.ok(boot.startup < 1500, `title within the unthrottled startup budget (${boot.startup.toFixed(0)} ms)`);
      assert.equal(await game.hook((g) => g.screen), 'title');
      assert.equal(await page.evaluate(() => document.body.innerText.trim()), '', 'no text in the DOM');

      await wait(3500); // Portolan letters itself in
      await game.screenshot(join(shots, `wp05-title-${name}.png`));
      await game.tap({ x: device.width / 2, y: device.height / 2 });
      await game.until((g) => g.screen === 'harbour');
      await wait(300);
      await game.screenshot(join(shots, `wp05-harbour-${name}.png`));

      // The set-sail button sits in the middle of the safe area, 0.42 of the way down.
      const { top, right, bottom, left } = device.safeArea;
      await game.tap({ x: left + (device.width - left - right) / 2, y: top + (device.height - top - bottom) * 0.42 });
      await game.until((g) => g.screen === 'match' && g.tick > 15);

      await game.hook((g) => g.setPaused(true));
      const before = await game.hook((g): [number, number] => [g.tick, g.clock]);
      await wait(500);
      assert.deepEqual(await game.hook((g): [number, number] => [g.tick, g.clock]), before, 'paused: no ticks, the render clock stands');
      await game.hook((g) => g.setPaused(false));
      await game.until((g, [tick, clock]) => g.tick > tick && g.clock > clock, before);

      if (name === 'ipad') {
        await game.hook((g) => g.show('title'));
        await game.throttleCPU(4);
        await page.reload();
        await game.until((g) => g.ready);
        const relaunch = await perf(game);
        await game.throttleCPU(1);
        t.diagnostic(`ipad, CPU 4× slower: title after ${relaunch.startup.toFixed(0)} ms, world ${relaunch.worldMs.toFixed(0)} ms (cached ${relaunch.worldCached})`);
        assert.ok(relaunch.startup <= 5000, `title within the throttled startup budget (${relaunch.startup.toFixed(0)} ms)`);
        assert.ok(relaunch.worldCached, 'the relaunch reads the world from the device cache');
      }
      game.assertClean();
      await game.close();
    });
  }
});

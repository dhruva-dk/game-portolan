// Everything you can do in a match, done with a thumb on the smallest iPhone: the app's page in headless Chromium,
// touched where the HUD draws its controls, and the simulation read back to see each touch land.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { launch, openGame, serve, type Game } from '../harness.ts';

/** The centre of the HUD control named by its data-what, in CSS pixels. */
async function at(game: Game, what: string): Promise<{ x: number; y: number }> {
  const p = await game.page.evaluate((w) => {
    const e = document.querySelector(`[data-what="${w}"], [data-part="${w}"]`);
    if (!e) return null;
    const r = e.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, what);
  assert.ok(p, `the HUD has ${what}`);
  return p;
}

const slotAt = (game: Game, k: number) => game.page.evaluate((i) => {
  const r = document.querySelector(`.s-hud__slot[data-slot="${i}"]`)!.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}, k);

const me = (game: Game) => game.hook((h) => {
  const s = h.sim.ships[0];
  return { speed: s.speed, sel: s.sel, slots: s.slots.map((x: { kind: number }) => x.kind), coins: s.coins, gull: s.gull.state };
});

test('a thumb sets the sails, trades and drops hotbar items, and calls a gull', async (t) => {
  const server = await serve();
  const { browser } = await launch();
  t.after(async () => { await browser.close(); await server.close(); });
  const game = await openGame(browser, server.url, { device: 'iphoneSmall', dpr: 1, path: 'dev/game.html', query: { capture: 1 } });
  await game.until((h) => h.ready, undefined, 180_000);
  await game.hook((h) => { h.play({ seed: 11, skipGale: true }); });
  await game.hook((h) => h.run(8));
  const sailing = await me(game);
  assert.ok(sailing.speed > 2, `under full sail she makes way (${sailing.speed.toFixed(2)} m/s)`);

  // furled, she comes to a stop; full again, she picks up
  await game.tap(await at(game, 'hud:sailsstop'));
  await game.hook((h) => h.run(10));
  const stopped = await me(game);
  assert.ok(stopped.speed < 0.6, `furled, she stops (${stopped.speed.toFixed(2)} m/s)`);
  await game.tap(await at(game, 'hud:sailshalf'));
  await game.hook((h) => h.run(10));
  const half = await me(game);
  assert.ok(half.speed > stopped.speed + 0.5 && half.speed < sailing.speed, `at half sail she makes some way (${half.speed.toFixed(2)} m/s)`);

  // slot 0 dragged onto slot 3: they trade places, and slot 3 is selected
  const before = await me(game);
  await game.drag(await slotAt(game, 0), await slotAt(game, 3), 300);
  await game.hook((h) => h.run(0.2));
  const traded = await me(game);
  assert.equal(traded.slots[3], before.slots[0], 'what was in slot 0 is now in slot 3');
  assert.equal(traded.slots[0], before.slots[3], 'and slot 3’s in slot 0');
  assert.equal(traded.sel, 3, 'the dragged item stays selected');

  // the drop button lets go of the selected item
  await game.tap(await at(game, 'hud:drop'));
  await game.hook((h) => h.run(0.2));
  const dropped = await me(game);
  assert.equal(dropped.slots[3], 0, 'the selected slot is empty');

  // with coins in the hold, the gull button opens the parcels and one calls a gull
  await game.hook((h) => { h.sim.ships[0].coins = 100; });
  await game.hook((h) => h.run(0.2));
  await game.tap(await at(game, 'hud:gull'));
  await game.hook((h) => h.run(0.1));
  await game.tap(await at(game, 'hud:parcel0'));
  await game.hook((h) => h.run(0.2));
  const called = await me(game);
  assert.ok(called.coins < 100, `the parcel is paid for (${called.coins} coins left)`);
  assert.notEqual(called.gull, 0, 'the gull is on its way');
  assert.deepEqual(game.problems(), []);
});

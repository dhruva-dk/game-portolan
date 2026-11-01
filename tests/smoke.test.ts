// The whole game, twice over: a match of bots sailed to its end in plain Node, then the real page booted in headless
// Chromium, a match sailed and skipped through, the chart opened, and the results reached, with no errors on the way.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildWorld, flowAt, FLOW, PLAY_R } from '../src/world.ts';
import { Match, pointOfSail } from '../src/game.ts';
import { Bots } from '../src/bots.ts';
import { launch, openGame, serve } from './harness.ts';

const world = buildWorld();

test('the currents run through open water, strongest at their middles', () => {
  assert.ok(world.currents.length >= 8, `${world.currents.length} currents`);
  for (const line of world.currents) {
    const dry = line.filter(([x, z]) => !world.nav.pass[world.nav.cell(x, z)]).length;
    assert.equal(dry, 0, 'never over water too shoal to sail');
    const [x, z] = line[Math.floor(line.length / 2)], [x2, z2] = line[Math.floor(line.length / 2) + 2];
    const [fx, fz] = flowAt(world, x, z), d = Math.hypot(x2 - x, z2 - z);
    assert.ok(Math.hypot(x, z) < PLAY_R, 'inside the sailable sea');
    assert.ok(world.nav.open(x, z), 'over open water');
    assert.ok((fx * (x2 - x) + fz * (z2 - z)) / d > FLOW.speed * 0.6, 'running along its line');
  }
  assert.deepEqual(flowAt(world, 0, 5000), [0, 0], 'still water off the grid');
});

test('lateens like the wind on the beam, and stall head to wind', () => {
  assert.ok(pointOfSail(Math.PI / 2) > pointOfSail(0));
  assert.ok(pointOfSail(0) > pointOfSail(Math.PI));
  assert.ok(pointOfSail(Math.PI) > 0.5);
});

test('a match of bots sails to its end', () => {
  const m = new Match(world, { seed: 3, count: 24, playerName: 'Test', playerLook: 1 });
  const bots = new Bots(m, 3, true);
  for (let i = 0; i < 30 * 60 * 20 && !m.over; i++) {
    bots.update(1 / 30);
    m.step(1 / 30);
    m.events.length = 0;
  }
  assert.ok(m.over, `over by ${m.time.toFixed(0)} s, ${m.alive} afloat`);
  assert.equal(m.alive, 1);
  for (const s of m.ships) assert.ok(Number.isFinite(s.x) && Number.isFinite(s.z), `${s.name} has a position`);
});

test('the page boots, sails, charts and comes home without an error', async (t) => {
  const server = await serve();
  const { browser } = await launch();
  t.after(async () => { await browser.close(); await server.close(); });
  const game = await openGame(browser, server.url, { device: 'ipad', query: {} });
  await game.until((h) => h.ready, undefined, 120_000);
  await game.hook((h) => h.sail(5, true));
  await game.hook((h) => h.skip(70));
  await game.until((h) => h.match.time > 72, undefined, 30_000);
  const at = await game.hook((h) => ({ phase: h.match.me.phase, fps: h.stage.engine.stats.fps, tris: h.stage.engine.stats.tris }));
  assert.equal(at.phase, 'sea');
  assert.ok(at.tris > 0, 'drawing');
  await game.hook((h) => h.ui.showMap(true));
  await game.page.waitForTimeout(300);
  await game.hook((h) => { h.ui.showMap(false); h.finish(); });
  await game.until((h) => h.state === 'results', undefined, 10_000);
  assert.deepEqual(game.problems(), []);
});

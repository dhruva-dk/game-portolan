// Acceptance check 2: one seed and one recorded set of player inputs give the same match headless in
// Node and in the browser with full rendering at other frame rates, across a pause in the globe menu.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Sim, type SimEvent } from '../src/sim.ts';
import { createWorld } from '../src/world.ts';
import { Bots } from '../src/bots.ts';
import { serve, launch, open, loopPilot } from './shot.ts';

const SEED = 7;
const TICKS = 2700; // 90 s of match time

test('a headless run and a rendered run end with the same territory hash', async (t) => {
  // Headless: a scripted captain sails loops; its rudder is recorded per tick as int8, as main.ts records the player.
  const sim = new Sim({ seed: SEED, world: createWorld(SEED) });
  const bots = new Bots(sim);
  const inputs = new Float32Array(sim.ships.length);
  const seen: Partial<Record<SimEvent['type'], number>> = {};
  const step = (rudder: number) => {
    inputs[0] = rudder / 127;
    bots.decide(sim, inputs);
    sim.step(inputs);
    for (const e of sim.events) seen[e.type] = (seen[e.type] ?? 0) + 1;
    sim.events = [];
  };
  const pilot = loopPilot(), recorded: number[] = [];
  while (sim.tick < TICKS) {
    recorded.push(Math.round(Math.max(-1, Math.min(1, pilot(sim))) * 127) | 0); // | 0: no negative zero
    step(recorded[recorded.length - 1]);
  }
  t.diagnostic(`headless events: ${JSON.stringify(seen)}`);
  assert.ok(seen.trail && seen.claim && seen.sink, 'the run should open trails, close loops and sink ships');

  // Rendered: the page replays the recording from its first tick, at 30 fps, paused, then at 20 fps.
  const server = await serve();
  const browser = await launch();
  try {
    const { page, errors } = await open(browser, server.url, { seed: SEED, w: 1280, h: 800, dpr: 1, ready: false });
    const startTick = await page.evaluate((rec) => {
      const g = (window as any).__game;
      g.setPilot((s: Sim) => (rec[s.tick] ?? 0) / 127);
      return g.sim.tick;
    }, recorded);
    assert.equal(startTick, 0, 'the replay must be in place before the first tick');
    await page.waitForFunction(() => (window as any).__game.ready, null, { timeout: 180_000 });
    const tickAt = () => page.evaluate(() => (window as any).__game.sim.tick as number);
    const runTo = (tick: number, frameStep: number) => page
      .evaluate((n) => (window as any).__game.setFrameStep(n), frameStep)
      .then(() => page.waitForFunction((n) => (window as any).__game.sim.tick >= n, tick, { timeout: 600_000, polling: 250 }));

    await runTo(TICKS / 2, 2);
    const rate30 = await page.evaluate(() => (window as any).__game.fps() as number);
    await page.keyboard.press('KeyM');
    const held = await tickAt();
    await page.waitForTimeout(1500);
    assert.equal(await tickAt(), held, 'the globe menu must hold the match still');
    await page.keyboard.press('KeyM');
    await runTo(TICKS, 3);
    await page.keyboard.press('KeyM');
    const end = await page.evaluate(() => {
      const g = (window as any).__game;
      return { tick: g.sim.tick as number, hash: g.sim.hash() as string, inputs: g.recording() as number[], fps: g.fps() as number };
    });
    t.diagnostic(`browser: ${rate30.toFixed(1)} fps then ${end.fps.toFixed(1)} fps, stopped at tick ${end.tick}`);
    assert.ok(rate30 < 45 && end.fps < 45, 'the browser should have run at a different frame rate than 60 fps');

    // Past the recording both sides hold the helm amidships; catch the headless run up to the same tick.
    while (sim.tick < end.tick) step(0);
    assert.deepEqual(end.inputs, [...recorded, ...Array(end.tick - TICKS).fill(0)], 'the page must apply exactly the recorded inputs');
    assert.equal(end.hash, sim.hash());
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await server.close();
  }
});

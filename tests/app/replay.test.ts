// The browser half of acceptance check 2 on the app runtime: a recording replayed in Chromium with full rendering,
// at 60 and at 20 frames a second and time-accelerated, sent to the background mid-match and brought back (by a
// reload, as a relaunched app, or in place), resumes on the tick it stopped and ends on the hash the same recording
// gives headless in Node.
//   node --test tests/app/replay.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seaFor } from '../../src/sim/environment.ts';
import { runMatch } from '../../src/sim/match.ts';
import { createMatch, matchHash } from '../../src/sim/state.ts';
import { serve, launch, openGame } from '../harness.ts';
import { recordInputs, scriptedInputs, world } from '../sim/vectors.ts';

const SEED = 0x5eed05;
const TICKS = 450;
const wait = (ms: number) => new Promise((done) => setTimeout(done, ms));

interface Run { name: string; fps: number; speed: number | null; at: number; relaunch: boolean }
const RUNS: Run[] = [
  { name: '60 fps, relaunched', fps: 60, speed: null, at: 170, relaunch: true },
  { name: '20 fps, relaunched', fps: 20, speed: null, at: 230, relaunch: true },
  { name: '20 fps at 5 ticks a frame, resumed in place', fps: 20, speed: 5, at: 200, relaunch: false },
];

test('a replay ends on the headless hash at any frame rate across background and resume', async (t) => {
  const recording = recordInputs(scriptedInputs(SEED, TICKS));
  const headless = createMatch({ seed: SEED });
  runMatch(seaFor(world(), SEED), headless, recording, TICKS);
  const expected = matchHash(headless);
  t.diagnostic(`Node: ${expected} after ${TICKS} ticks`);

  const server = await serve();
  const { browser } = await launch();
  t.after(async () => {
    await browser.close();
    await server.close();
  });

  for (const run of RUNS) {
    await t.test(run.name, async () => {
      const game = await openGame(browser, server.url, { device: 'ipad' });
      const pace = () => game.hook((g, r: Run) => {
        g.setFrameRate(r.fps);
        g.setSpeed(r.speed);
      }, run);
      await game.until((g) => g.ready);
      await pace();
      await game.hook((g, a) => g.startMatch(a), { seed: SEED, recording, stopAt: TICKS });
      const frames = await game.hook(async (g): Promise<number> => {
        const f0 = g.perf.frames;
        await new Promise((done) => setTimeout(done, 1000));
        return g.perf.frames - f0;
      });
      assert.ok(Math.abs(frames - run.fps) <= run.fps * 0.2, `${frames} frames a second at ${run.fps} fps`);
      await game.until((g, at) => g.tick >= at, run.at);
      const stopped = await game.hook(async (g): Promise<number> => {
        await g.background();
        return g.tick;
      });
      await wait(300);
      assert.equal(await game.hook((g) => g.tick), stopped, 'no ticks in the background');

      if (run.relaunch) {
        await game.page.reload();
        await game.until((g) => g.ready);
        await pace();
        const [screen, resumedFrom] = await game.hook((g): [string, number] => [g.screen, g.tick - g.perf.ticks]);
        assert.equal(screen, 'match', 'the relaunched app goes straight back to the match');
        assert.equal(resumedFrom, stopped, 'and resumes on the tick it stopped');
      } else {
        await game.hook((g) => g.resume());
      }
      await game.until((g, n) => g.tick === n, TICKS, 120_000);
      const hash = await game.hook((g): string => g.matchHash());
      t.diagnostic(`${run.name}: background at tick ${stopped}, ${hash}`);
      assert.equal(hash, expected, 'the same hash as headless in Node');
      game.assertClean();
      await game.close();
    });
  }
});

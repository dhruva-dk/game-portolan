// Preparation's misses headless: once the stage says everything is prepared, each screen is visited and drawn, and
// every pipeline or shader module the device is asked to create from then on is counted against it. A miss is a
// pipeline built in the middle of a frame: a hitch on the device. Written to captures/prepare/prepare.json, which
// `node tools/profile.ts diff` compares with tools/baselines/prepare.json.
import { log, openApp, Shots, type Rig } from './common.ts';

interface Counts { render: number; compute: number; shaders: number }

export async function prepare(r: Rig, o: { dpr: number }): Promise<void> {
  const shots = await Shots.create('prepare');
  const game = await openApp(r, { dpr: o.dpr });
  await game.hook((h) => h.settle(4));
  const t0 = Date.now();
  await game.hook((h) => h.settled());
  log(`prepare: settled ${((Date.now() - t0) / 1000).toFixed(1)} s after the page was ready`);
  const rows: ({ screen: string } & Counts)[] = [];
  let before: Counts = await game.hook((h) => h.pipelines());
  const visit = async (screen: string, go: () => Promise<unknown>) => {
    await go();
    await game.hook((h) => h.settle(20));
    await game.hook((h) => h.run(4));
    await game.hook((h) => h.settle(4));
    const after: Counts = await game.hook((h) => h.pipelines());
    rows.push({ screen, render: after.render - before.render, compute: after.compute - before.compute, shaders: after.shaders - before.shaders });
    before = after;
    await shots.shot(game, screen);
  };
  await visit('title', () => game.hook((h) => h.go('title')));
  await visit('lobby', () => game.hook((h) => h.go('lobby')));
  await visit('match', () => game.hook((h) => h.play({ seed: 5, skipGale: true, autopilot: true })));
  await visit('full map', () => game.hook((h) => h.press('hud:map')));
  await visit('fight', () => game.hook((h) => h.fight()));
  console.table(rows);
  await shots.json('prepare.json', { kind: 'prepare', renderer: r.renderer, rows });
  await shots.sheet(r.browser, 5);
  game.assertClean();
  log(`prepare: ${shots.dir}/prepare.json`);
}

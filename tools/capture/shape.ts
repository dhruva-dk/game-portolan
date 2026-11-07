// The frame's shape headless: the title, the lobby and a match, each as the frame log prints it on the device
// (src/render/gpu/shape.ts), against the committed run. With --save this run becomes the committed one: shape.json
// holds each screen's steady frame's passes and submissions, which the device's log flags any frame for exceeding.
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { root } from '../harness.ts';
import { log, openApp, type Rig } from './common.ts';

const FILE = join(root, 'src/render/gpu/shape.json');

export async function shapes(r: Rig, o: { dpr: number; save: boolean }): Promise<void> {
  const game = await openApp(r, { dpr: o.dpr });
  const steady: Record<string, { passes: number; submits: number }> = {};
  const look = async () => {
    await game.hook((h) => h.settle(10));
    for (let i = 0; i < 60; i++) await game.hook((h) => h.draw(1 / 30));
    // the last timed frame's times come back a frame or two after it
    await game.page.waitForTimeout(500);
    await game.hook((h) => h.draw(1 / 30));
    const screen: string = await game.hook((h) => h.screen);
    console.log(await game.hook((h) => h.shape(true)));
    steady[screen] = await game.hook((h) => h.shapeSteady());
  };
  await game.hook((h) => h.go('title'));
  await look();
  await game.hook((h) => h.go('lobby'));
  await look();
  await game.hook((h) => h.play({ seed: 5, skipGale: true, autopilot: true }));
  await look();
  console.table(steady);
  if (o.save) {
    await writeFile(FILE, JSON.stringify(steady, null, 2) + '\n');
    log(`shape: committed run written to ${FILE}`);
  }
  game.assertClean();
}

// Every material's WGSL, as three generates it, in a match and in the fight, checked (tools/shaders.ts) for values a
// branch sets and three declares again before they are read. Writes captures/shaders/<screen>.json and fails on any.
import { log, openApp, Shots, type Rig } from './common.ts';
import { check } from '../shaders.ts';

export async function shaders(r: Rig, o: { dpr: number }): Promise<void> {
  const shots = await Shots.create('shaders');
  const game = await openApp(r, { dpr: o.dpr });
  let lost = 0;
  for (const [screen, go] of [
    ['match', () => game.hook((h) => h.play({ seed: 5, skipGale: true, autopilot: true }))],
    ['fight', () => game.hook((h) => h.fight())],
  ] as const) {
    await go();
    await game.hook((h) => h.settle(20));
    const all = await game.hook((h) => h.shaders());
    await shots.json(`${screen}.json`, all);
    const found = check(all);
    log(`shaders ${screen}: ${Object.keys(all).length} materials, ${Object.keys(found).length} losing values`);
    for (const [where, resets] of Object.entries(found)) {
      for (const x of resets) log(`  ${where}: ${x.name} declared again at line ${x.line}, then read: ${x.read}`);
      lost += resets.length;
    }
  }
  game.assertClean();
  if (lost) throw new Error(`shaders: ${lost} value(s) lost to a second declaration`);
}

// The lap test: a frame every 4 s of sailing at top speed (14.5 m/s) along a full lap of the equator, and along each
// ring's latitude, from the chase camera. Each ring gets its own folder and contact sheet.
import { log, openApp, Shots, type Rig } from './common.ts';

const RINGS = ['equator', 'north', 'south'] as const;

export async function lap(r: Rig, o: { dpr: number; every: number; ring?: string }): Promise<void> {
  const rings = o.ring ? RINGS.filter((x) => x === o.ring) : RINGS;
  if (!rings.length) throw new Error(`--ring must be one of ${RINGS.join(', ')}`);
  const game = await openApp(r, { dpr: o.dpr });
  for (const ring of rings) {
    const shots = await Shots.create(`lap-${ring}`);
    const path: { region: string; regionName: string; [k: string]: unknown }[] = await game.hook(
      (h, a) => h.lapPath(a.ring, a.every), { ring, every: o.every },
    );
    for (let i = 0; i < path.length; i++) {
      const spec = { ...path[i], hour: 11, weather: 'clear', tilt: 0 };
      await game.hook((h, s) => h.scene(s), spec);
      await game.hook((h) => h.settle(4));
      await shots.shot(game, `${(i * o.every).toFixed(0)} s, ${path[i].regionName}`);
    }
    await shots.json('path.json', path);
    await shots.sheet(r.browser, 6);
    log(`lap ${ring}: ${path.length} frames in ${shots.dir}`);
  }
  game.assertClean();
}

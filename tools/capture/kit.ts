// The chart's drawing kit, specimen plates at each iPad's size (dev/kit.html): paper, ink, objects,
// seals and figures, galleon marks, every motion as a frame strip, press and release, and the HUD laid out on each
// device with its live layer's CPU cost per frame measured.
import { log, Shots, type Rig } from './common.ts';
import { DEVICES, openGame, type DeviceName } from '../harness.ts';

export async function kit(r: Rig, o: { dpr?: number; device?: string; only?: string }): Promise<void> {
  const devices = (o.device ? o.device.split(',') : ['ipad', 'ipadSmall']) as DeviceName[];
  const shots = await Shots.create('kit');
  const costs: Record<string, unknown> = {};
  for (const device of devices) {
    if (!(device in DEVICES)) throw new Error(`--device must be among ${Object.keys(DEVICES).join(', ')}`);
    const game = await openGame(r.browser, r.server.url, { device, dpr: o.dpr ?? DEVICES[device].dpr, path: 'dev/kit.html', hook: '__kit' });
    await game.until((h) => h.ready, undefined, 120_000);
    const plates: string[] = await game.hook((h) => h.plates);
    const only = o.only?.split(',');
    for (const p of plates) {
      if (only && !only.includes(p)) continue;
      await game.hook((h, name) => h.plate(name), p);
      await shots.shot(game, `${device} ${p}`, `${device}-${p}.png`);
      log(`kit ${device}: ${p}`);
    }
    if (plates.includes('hud') && (!only || only.includes('hud'))) {
      costs[device] = await game.hook((h) => h.measure(240));
      log(`kit ${device}: live layer ${JSON.stringify(costs[device])}`);
    }
    game.assertClean();
    await game.close();
  }
  if (Object.keys(costs).length) await shots.json('live-cost.json', costs);
  await shots.sheet(r.browser, 2);
}

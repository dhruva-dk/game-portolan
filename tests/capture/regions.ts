// Fixed scenes in each region at dawn, midday, dusk and night, at iPad size, then the region's beacon at midnight from
// where its light stands well up in the frame: one row per region in the contact sheet. The night scenes have three
// ships sailing 60 to 220 m out, so the captures show whether their lanterns read.
import { log, openApp, Shots, type Rig } from './common.ts';

export const HOURS = [
  { name: 'dawn', hour: 6.2 },
  { name: 'midday', hour: 12 },
  { name: 'dusk', hour: 18.4 },
  { name: 'night', hour: 23.5 },
] as const;

export async function regions(r: Rig, o: { dpr: number; region?: string }): Promise<void> {
  const shots = await Shots.create('regions');
  const game = await openApp(r, { dpr: o.dpr });
  const all: { id: string; name: string }[] = await game.hook((h) => h.regions());
  const list = o.region ? all.filter((x) => x.id === o.region) : all;
  if (!list.length) throw new Error(`no region "${o.region}"; there are ${all.map((x) => x.id).join(', ')}`);
  const key: unknown[] = [];
  for (const reg of list) {
    for (const { name, hour } of HOURS) {
      const spec = await game.hook((h, a) => ({ ...h.regionView(a.id, 0), hour: a.hour, weather: 'clear', tilt: 0, fleet: a.fleet }),
        { id: reg.id, hour, fleet: name === 'night' ? 3 : 0 });
      await game.hook((h, s) => h.scene(s), spec);
      await game.hook((h) => h.settle(6));
      await shots.shot(game, `${reg.name}, ${name}`, `${reg.id}-${name}.png`);
      key.push({ region: reg.id, time: name, ...spec });
    }
    const spec = await game.hook((h, a) => ({ ...h.beaconView(a.id), weather: 'clear', tilt: 0, fleet: 3 }), { id: reg.id });
    await game.hook((h, s) => h.scene(s), spec);
    await game.hook((h) => h.settle(6));
    await shots.shot(game, `${reg.name}, its beacon`, `${reg.id}-beacon.png`);
    key.push({ region: reg.id, time: 'beacon', ...spec });
    log(`regions: ${reg.name}`);
  }
  await shots.json('scenes.json', key);
  await shots.sheet(r.browser, 5);
  game.assertClean();
  log(`regions: ${shots.frames.length} frames in ${shots.dir}`);
}

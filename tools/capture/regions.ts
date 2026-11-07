// Fixed scenes in each region at dawn, midday, dusk and night, at iPad size, then the region's beacon at midnight from
// where its light stands well up in the frame: one row per region in the contact sheet. The night scenes look from 8 m
// up and have three ships sailing 60 to 220 m out where the eye can see their mastheads, so the captures show whether
// their lights read. With tides (seconds into a match), each region is shot again at the tide of each: its level and
// the wet band a falling tide leaves.
import { log, openApp, Shots, type Rig } from './common.ts';

export const HOURS = [
  { name: 'dawn', hour: 6.2 },
  { name: 'midday', hour: 12 },
  { name: 'dusk', hour: 18.4 },
  { name: 'night', hour: 23.5 },
] as const;

export async function regions(r: Rig, o: { dpr: number; region?: string; tide?: string }): Promise<void> {
  const shots = await Shots.create('regions');
  const game = await openApp(r, { dpr: o.dpr });
  const all: { id: string; name: string }[] = await game.hook((h) => h.regions());
  const ids = o.region?.split(',');
  const list = ids ? all.filter((x) => ids.includes(x.id)) : all;
  if (!list.length) throw new Error(`no region "${o.region}"; there are ${all.map((x) => x.id).join(', ')}`);
  const tides = o.tide ? o.tide.split(',').map(Number) : [null];
  const key: unknown[] = [];
  for (const reg of list) {
    for (const t of tides) {
      const at = t === null ? '' : ` at ${t} s`, tag = t === null ? '' : `-t${t}`;
      for (const { name, hour } of HOURS) {
        // the night looks from a captain's eye, with the poles tilted into the dark, so the fleet's lights show as in play
        const spec = await game.hook((h, a) => ({
          ...(a.night ? h.nightView(a.id) : { ...h.regionView(a.id, 0), hour: a.hour, tilt: 0 }), weather: 'clear', fleet: a.night ? 3 : 0,
          ...(a.t !== null && h.tide(a.t)),
        }), { id: reg.id, hour, night: name === 'night', t });
        await game.hook((h, s) => h.scene(s), spec);
        await game.hook((h) => h.settle(6));
        await shots.shot(game, `${reg.name}, ${name}${at}`, `${reg.id}-${name}${tag}.png`);
        key.push({ region: reg.id, time: name, ...spec });
      }
      const spec = await game.hook((h, a) => ({ ...h.beaconView(a.id), weather: 'clear', fleet: 3, ...(a.t !== null && h.tide(a.t)) }), { id: reg.id, t });
      await game.hook((h, s) => h.scene(s), spec);
      await game.hook((h) => h.settle(6));
      await shots.shot(game, `${reg.name}, its beacon${at}`, `${reg.id}-beacon${tag}.png`);
      key.push({ region: reg.id, time: 'beacon', ...spec });
    }
    log(`regions: ${reg.name}`);
  }
  await shots.json('scenes.json', key);
  await shots.sheet(r.browser, 5);
  game.assertClean();
  log(`regions: ${shots.frames.length} frames in ${shots.dir}`);
}

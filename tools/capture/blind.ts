// The blind test: unlabelled shots from fixed spots in every region, in a shuffled order, with no HUD. The key that
// says which region each shot shows is written to key.json, which the reviewer must not open until they have named them.
import { log, openApp, shuffle, Shots, type Rig } from './common.ts';

/** Spots per region: the landmark view plus two looking in from other bearings. */
const SPOTS = 3;

export async function blind(r: Rig, o: { dpr: number; seed: number }): Promise<void> {
  const shots = await Shots.create('blind');
  const game = await openApp(r, { dpr: o.dpr });
  const all: { id: string; name: string }[] = await game.hook((h) => h.regions());
  const jobs: { id: string; k: number; hour: number }[] = [];
  for (const reg of all) for (let k = 0; k < SPOTS; k++) jobs.push({ id: reg.id, k, hour: [9, 12.5, 16][k] });
  const order = shuffle(jobs, o.seed);
  const key: unknown[] = [];
  for (let n = 0; n < order.length; n++) {
    const j = order[n];
    const spec = await game.hook((h, a) => ({ ...h.regionView(a.id, a.k), hour: a.hour, weather: 'clear', tilt: 0 }), j);
    await game.hook((h, s) => h.scene(s), spec);
    await game.hook((h) => h.settle(6));
    const file = `${String(n + 1).padStart(2, '0')}.png`;
    await shots.shot(game, `#${n + 1}`, file);
    key.push({ shot: file, region: j.id, spot: j.k, ...spec });
  }
  await shots.json('key.json', key);
  await shots.sheet(r.browser, 6);
  game.assertClean();
  log(`blind: ${order.length} shots in ${shots.dir}; the key is key.json`);
}

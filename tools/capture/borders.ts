// The skyline check: each region from orbit at its noon, then a spot on the sea at every border two regions share,
// 8 m up, looking once at each one's landmark. One folder and one contact sheet: the orbits first, then two frames
// per border.
import { log, openApp, Shots, type Rig } from './common.ts';

export async function borders(r: Rig, o: { dpr: number }): Promise<void> {
  const shots = await Shots.create('borders');
  const game = await openApp(r, { dpr: o.dpr });
  const all: { id: string; name: string }[] = await game.hook((h) => h.regions());
  const orbits: unknown[] = [];
  for (const reg of all) {
    const spec = await game.hook((h, id) => h.orbitView(id), reg.id);
    await game.hook((h, s) => h.scene(s), spec);
    await game.hook((h) => h.settle(6));
    await shots.shot(game, `${reg.name} from orbit`, `orbit-${reg.id}.png`);
    orbits.push(spec);
  }
  const views: { a: string; b: string; facing: string; facingName: string; onWater: boolean }[] = await game.hook((h) => h.borderViews());
  const name = (id: string) => all.find((x) => x.id === id)?.name ?? id;
  for (const v of views) {
    await game.hook((h, s) => h.scene(s), v);
    await game.hook((h) => h.settle(6));
    await shots.shot(game, `${name(v.a)} | ${name(v.b)}: facing ${v.facingName}${v.onWater ? '' : ' (no water found)'}`,
      `border-${v.a}-${v.b}-facing-${v.facing}.png`);
  }
  await shots.json('views.json', { orbits, borders: views });
  await shots.sheet(r.browser, 6);
  game.assertClean();
  const dry = views.filter((v) => !v.onWater).length / 2;
  log(`borders: ${all.length} orbits and ${views.length / 2} borders${dry ? ` (${dry} with no water near the middle)` : ''} in ${shots.dir}`);
}

// Performance in Chromium: for each region, the landmark scene at midday, then a few seconds of drawing, recording the
// mean and worst frame time, triangles and draw calls. Also a stretch of a live match. Results go to
// captures/perf/perf.json and a table on stdout. (Headless Chromium on a Mac is a stand-in for the device.)
import { log, openApp, Shots, type Rig } from './common.ts';

export async function perf(r: Rig, o: { dpr: number }): Promise<void> {
  const shots = await Shots.create('perf');
  const game = await openApp(r, { dpr: o.dpr });
  const all: { id: string; name: string }[] = await game.hook((h) => h.regions());
  const rows: Record<string, unknown>[] = [];
  for (const reg of all) {
    const spec = await game.hook((h, id) => ({ ...h.regionView(id, 0), hour: 12, weather: 'clear', tilt: 0 }), reg.id);
    await game.hook((h, s) => h.scene(s), spec);
    await game.hook((h) => h.settle(10));
    const m = await game.hook((h) => h.measure(90));
    rows.push({ region: reg.id, ...m });
  }
  await game.hook((h) => h.play({ seed: 5, skipGale: true, autopilot: true }));
  await game.hook((h) => h.settle(10));
  rows.push({ region: 'match', ...(await game.hook((h) => h.measure(150))) });
  await shots.json('perf.json', { renderer: r.renderer, dpr: o.dpr, rows });
  console.table(rows);
  game.assertClean();
  log(`perf: ${shots.dir}/perf.json`);
}

// Performance in Chromium: for each region, the landmark scene at midday, then a few seconds of drawing, recording the
// mean and worst frame time, triangles and draw calls. Also a stretch of a live match, and a scripted fast zoom in and
// out of the full map open over it. Results go to captures/perf/perf.json and a table on stdout. (Headless Chromium on
// a Mac is a stand-in for the device.)
import { log, openApp, Shots, type Rig } from './common.ts';
import type { Game } from '../harness.ts';

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
  rows.push(await fullMapZoom(game));
  await shots.json('perf.json', { renderer: r.renderer, dpr: o.dpr, rows });
  console.table(rows);
  game.assertClean();
  log(`perf: ${shots.dir}/perf.json`);
}

/** A frame longer than this misses the iPad's 30 FPS, milliseconds. */
const BUDGET = 1000 / 30;
/** Frames a sweep of the fingers takes one way: a second apart at the target rate, a fast pinch. */
const SWEEP = 30;
/** The fingers' span at the ends of the sweep, pixels: wide enough apart to reach the closest zoom and the whole planet. */
const SPAN: [number, number] = [120, 1320];

/** Opens the full map over the running match and sweeps two fingers on its drag surface, all the way in and out, four
 *  times at a fast pinch, then lets go and measures the frames until the land has caught up. */
async function fullMapZoom(game: Game): Promise<Record<string, unknown>> {
  await game.hook((h) => h.press('hud:map'));
  await game.hook((h) => h.settle(10));
  const result = await game.hook(async (h, o: { budget: number; sweep: number; span: [number, number] }) => {
    const app = h.app, layer = app.chart, stage = app.stage, w = h.mapWindow, drag = layer.drag, cost = layer.cost;
    if (!drag || !w) throw new Error('perf: the full map did not open');
    cost.frames = 0; cost.mean = 0; cost.worst = 0;
    const times: number[] = [];
    let tris = 0, calls = 0, pending = 0;
    const draw = async () => {
      const t0 = performance.now();
      app.loop.drawNow(1 / 30);
      // until the GPU has finished it, not the display's next refresh (App.measure)
      await stage.gpuDone();
      times.push(performance.now() - t0);
      const st = stage.stats();
      tris = Math.max(tris, st.tris);
      calls = Math.max(calls, st.calls);
      pending = Math.max(pending, st.pending);
    };
    const at = (span: number) => {
      drag.move(1, w.x - span / 2, w.y);
      drag.move(2, w.x + span / 2, w.y);
    };
    drag.down(1, w.x - o.span[0] / 2, w.y);
    drag.down(2, w.x + o.span[0] / 2, w.y);
    for (let c = 0; c < 4; c++) {
      for (let i = 1; i <= o.sweep; i++) {
        const t = i / o.sweep;
        at(o.span[0] * Math.pow(o.span[1] / o.span[0], c % 2 ? 1 - t : t));
        await draw();
      }
    }
    drag.up(1, w.x, w.y);
    drag.up(2, w.x, w.y);
    const zoomFrames = times.length;
    // let go, the land catches up
    const restAt = performance.now();
    for (let n = 0; n < 300 && (stage.terrain.busy || times.length === zoomFrames); n++) await draw();
    const restMs = performance.now() - restAt;
    const during = times.slice(0, zoomFrames).sort((a, b) => a - b);
    const mean = during.reduce((a, b) => a + b, 0) / during.length;
    return {
      region: 'full map zoom',
      frameMs: +mean.toFixed(2),
      p95Ms: +during[Math.floor(during.length * 0.95)].toFixed(2),
      worstMs: +during[during.length - 1].toFixed(2),
      over33: during.filter((d) => d > o.budget).length,
      frames: zoomFrames,
      tris, calls,
      chartMs: +cost.mean.toFixed(2),
      chartWorstMs: +cost.worst.toFixed(2),
      mostPending: pending,
      restMs: Math.round(restMs),
    };
  }, { budget: BUDGET, sweep: SWEEP, span: SPAN });
  return result as Record<string, unknown>;
}

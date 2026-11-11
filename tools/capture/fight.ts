// #8's frozen fight headless: the fixture loaded, a few seconds drawn, then every timed frame's GPU milliseconds by
// pass for `seconds` more, printed as the median of each pass and system, with a frame of the fixture saved beside
// them. The two scene passes are told apart by order: the opaque scene, then the sea and the rest after the copy.
import { log, openApp, Shots, type Rig } from './common.ts';
import { look } from './look.ts';

export async function fight(r: Rig, o: { dpr: number; seconds: number; save?: boolean }): Promise<void> {
  const shots = await Shots.create('fight');
  const game = await openApp(r, { dpr: o.dpr });
  await game.hook((h) => h.fight());
  await game.hook((h) => h.settle(30));
  const frames: { label: string; system: string; gpu: number }[][] = [];
  let last: unknown = null;
  const t0 = Date.now();
  while (Date.now() - t0 < o.seconds * 1000) {
    await game.hook((h) => h.draw(1 / 30));
    const t = await game.hook((h) => h.timed());
    if (t && t !== last && JSON.stringify(t) !== JSON.stringify(last)) frames.push(t);
    last = t;
  }
  const seen = await look(r.browser, await shots.shot(game, 'fight'), 'fight', o.save);
  const median = (xs: number[]) => xs.sort((a, b) => a - b)[xs.length >> 1] ?? 0;
  const name = (p: { label: string; system: string }, k: number) => `${String(k).padStart(2)} ${p.system}/${p.label}`;
  const rows: Record<string, { gpu: number }> = {}, systems: Record<string, { gpu: number }> = {};
  const n = frames[0]?.length ?? 0;
  for (let k = 0; k < n; k++) {
    const p = frames[0][k];
    rows[name(p, k)] = { gpu: +median(frames.filter((f) => f.length === n).map((f) => f[k].gpu)).toFixed(2) };
  }
  for (const sys of new Set(frames[0]?.map((p) => p.system))) {
    systems[sys] = { gpu: +median(frames.map((f) => f.filter((p) => p.system === sys).reduce((s, p) => s + p.gpu, 0))).toFixed(2) };
  }
  const total = +median(frames.map((f) => f.reduce((s, p) => s + p.gpu, 0))).toFixed(2);
  const cpu = await game.hook((h) => h.measure(60));
  console.table(rows);
  console.table(systems);
  log(`fight: ${frames.length} timed frames, gpu median ${total} ms; cpu ${cpu.frameMs} ms a frame (p95 ${cpu.p95Ms}), ${cpu.tris} tris, ${cpu.calls} calls`);
  await shots.json('fight.json', { renderer: r.renderer, dpr: o.dpr, total, systems, rows, cpu });
  game.assertClean();
  if (seen && !seen.ok) throw new Error('fight: the fight does not look as it did (tools/baselines/looks/fight.png; --save to accept)');
}

// Acceptance check 4: the frame rate of the production build at Retina resolution (a 14" MacBook Pro window)
// through a full day-and-night cycle, storm included, with all 21 ships sailing and every effect running.
// The clock is fast-forwarded, not the match. Frame times are rAF intervals (GPU timer queries read wrong on
// ANGLE/Metal); the render scale is the pipeline's dynamic resolution. Passes when every hour holds 60 fps:
// each hour's mean frame rate ≥ 57 fps, the whole run's mean ≥ 59 fps and its 1% low ≥ 50 fps.
//   npm run perf [-- --seconds 4] [-- --headed]
import { parseArgs } from 'node:util';
import { serve, launch, open, loopPilot } from './shot.ts';

const { values: a } = parseArgs({
  options: { seconds: { type: 'string', default: '4' }, seed: { type: 'string', default: '1' }, headed: { type: 'boolean', default: false } },
});

interface Segment {
  hour: number;
  frames: number[]; // rAF intervals, ms
  scale: number[]; // pipeline render scale per frame
}

const server = await serve(true);
const browser = await launch(a.headed);
let pass = false;
try {
  const { page, errors, external } = await open(browser, server.url, { seed: +a.seed!, w: 1512, h: 982, dpr: 2 });
  await page.evaluate((src) => (window as any).__game.setPilot((0, eval)(`(${src})`)()), loopPilot.toString());
  const segments: Segment[] = await page.evaluate(async (seconds) => {
    const g = (window as any).__game, pipeline = g.ctx.pipeline;
    const raf = () => new Promise<number>((done) => requestAnimationFrame(done));
    g.setHour(5);
    for (let t0 = await raf(), t = t0; t - t0 < 3000; t = await raf()); // warm up: shadow maps, resolution settling
    const out: Segment[] = [];
    for (let h = 5; h < 29; h++) {
      const seg: Segment = { hour: h % 24, frames: [], scale: [] };
      const t0 = await raf();
      for (let prev = t0, t = t0; t - t0 < seconds * 1000; prev = t) {
        g.setHour((h + (t - t0) / (seconds * 1000)) % 24);
        t = await raf();
        seg.frames.push(t - prev);
        seg.scale.push(pipeline.step / 20); // dynamic resolution, in twentieths of the device resolution
      }
      out.push(seg);
    }
    return out;
  }, +a.seconds!);

  const mean = (v: number[]) => v.reduce((s, x) => s + x, 0) / Math.max(1, v.length);
  const p99 = (v: number[]) => [...v].sort((x, y) => x - y)[Math.floor(v.length * 0.99)] ?? 0;
  const fps = (ms: number[]) => 1000 / mean(ms);
  const row = (label: string, s: Pick<Segment, 'frames' | 'scale'>) => console.log(
    `${label.padEnd(6)} ${fps(s.frames).toFixed(1).padStart(6)} ${(1000 / p99(s.frames)).toFixed(1).padStart(7)}` +
    ` ${Math.max(...s.frames).toFixed(1).padStart(7)}   ${mean(s.scale).toFixed(2)} (${Math.min(...s.scale).toFixed(2)}–${Math.max(...s.scale).toFixed(2)})`,
  );
  console.log('hour     fps  1%low  max ms   render scale');
  for (const s of segments) row(`${String(s.hour).padStart(2, '0')}:00`, s);
  const all = { frames: segments.flatMap((s) => s.frames), scale: segments.flatMap((s) => s.scale) };
  row('all', all);
  for (const e of errors) console.log(`console error: ${e}`);
  for (const u of external) console.log(`external request: ${u}`);
  pass = segments.every((s) => fps(s.frames) >= 57) && fps(all.frames) >= 59 && 1000 / p99(all.frames) >= 50
    && !errors.length && !external.length;
  console.log(pass ? 'PASS: holds 60 fps through the whole cycle' : 'FAIL');
} finally {
  await browser.close();
  await server.close();
}
process.exitCode = pass ? 0 : 1;

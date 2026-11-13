// The frame's budget, checked headless: four standard views (open sea under way; at the start, near its island; a
// dozen ships in view; the lobby), each held still (?pause) and read off the meter (src/meter.ts) once it has
// settled: a displayed frame's draw calls, triangles and render passes, each a second's mean. Fails (exit 1) if any
// view is over BUDGET. The counts are three's, so they do not depend on the machine: they move only when what is
// drawn changes (or the islands do: a new planet's land moves the triangles a little, not the draws).
//   node tools/budget.ts        (npm run budget)

import { launch } from './launch.ts';

/** Per displayed frame, every pass summed. The phone pays CPU for each draw before the GPU does anything. */
export const BUDGET = { draws: 100, triangles: 900_000, passes: 20 };

const VIEWS = {
  sea: 'screen=match&drive=150,1,14',
  island: 'screen=match',
  ships: 'screen=match&ships=12',
  lobby: 'screen=lobby',
};

const { browser, url, close } = await launch();
let over = false;
try {
  for (const [name, q] of Object.entries(VIEWS)) {
    const page = await browser.newPage({ viewport: { width: 956, height: 440 } });
    page.on('pageerror', (e) => console.error(`[${name}] ${e.message}`));
    await page.goto(`${url}?${q}&pause`);
    await page.waitForFunction(() => document.getElementById('meter')?.textContent, null, { timeout: 60000 });
    // the first reading holds the shaders' compiling; the second is a settled second's
    const first = await page.textContent('#meter');
    await page.waitForFunction((t) => document.getElementById('meter')?.textContent !== t, first, { timeout: 10000 });
    const text = (await page.textContent('#meter')) ?? '';
    await page.close();
    const m = /(\d+) draws (\d+)k tri (\d+) passes/.exec(text);
    if (!m) throw new Error(`[${name}] the meter reads '${text}'`);
    const seen = { draws: Number(m[1]), triangles: Number(m[2]) * 1000, passes: Number(m[3]) };
    const breaches = (Object.keys(BUDGET) as (keyof typeof BUDGET)[]).filter((k) => seen[k] > BUDGET[k]);
    over ||= breaches.length > 0;
    console.log(`${breaches.length ? 'OVER' : 'ok  '} ${name.padEnd(6)} ${seen.draws} draws  ${m[2]}k tri  ${seen.passes} passes` +
      (breaches.length ? `  (over: ${breaches.join(', ')})` : ''));
  }
} finally {
  await close();
}
console.log(`budget: ${BUDGET.draws} draws, ${BUDGET.triangles / 1000}k triangles, ${BUDGET.passes} passes a frame`);
process.exit(over ? 1 : 0);

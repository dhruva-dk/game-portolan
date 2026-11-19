// The frame's budget, checked headless: five standard views (open sea under way; at the start, off its coast; a
// dozen ships in view; the lobby; the full map open over the start), each held still (?pause) and read off the meter
// (src/meter.ts) once it has settled: a displayed frame's draw calls, triangles and render passes, each a second's
// mean. Fails (exit 1) if any view is over its budget (BUDGET, or the view's own). The counts are three's, so they do
// not depend on the machine: they move only when what is drawn changes (or the land does: a new planet's land moves
// the triangles a little, not the draws).
//   node tools/budget.ts        (npm run budget)

import { VIEW, launch } from './launch.ts';

/** Per displayed frame, every pass summed. The iPad pays CPU for each draw before the GPU does anything. */
export const BUDGET = { draws: 100, triangles: 900_000, passes: 20 };

type Budget = typeof BUDGET;
const MEASURES: readonly (keyof Budget)[] = ['draws', 'triangles', 'passes'];

/** Each view: its name, the switches that open it, and its own budget where it differs from BUDGET. */
const VIEWS: { name: string; q: string; own?: Partial<Budget> }[] = [
  { name: 'sea', q: 'screen=match&drive=150,1,14' },
  { name: 'coast', q: 'screen=match' },
  { name: 'ships', q: 'screen=match&ships=12' },
  { name: 'lobby', q: 'screen=lobby' },
  // The full map draws the whole planet from space at once, all its land and the sea round it, and nothing
  // else of the game (no ships close, no cloth, no loot): some 0.9–0.94 million triangles as it opens over the start,
  // against the 0.4–0.5 million of the views at sea. It is held to that, not to the sea's limit: a planet with more
  // land, or a finer mesh, shows here.
  { name: 'map', q: 'screen=match&map', own: { triangles: 1_000_000 } },
];

const { browser, url, close } = await launch();
let over = false;
try {
  for (const { name, q, own } of VIEWS) {
    const limit: Budget = { ...BUDGET, ...own };
    const page = await browser.newPage({ viewport: VIEW });
    page.on('pageerror', (e) => console.error(`[${name}] ${e.message}`));
    await page.goto(`${url}?${q}&pause`);
    await page.waitForFunction(() => document.getElementById('meter')?.dataset.line, null, { timeout: 60000 });
    // the first reading holds the shaders' compiling; the second is a settled second's
    const first = await page.getAttribute('#meter', 'data-line');
    await page.waitForFunction((t) => document.getElementById('meter')?.dataset.line !== t, first, { timeout: 10000 });
    const text = (await page.getAttribute('#meter', 'data-line')) ?? '';
    await page.close();
    const m = /(\d+) draws (\d+)k tri (\d+) passes/.exec(text);
    if (!m) throw new Error(`[${name}] the meter reads '${text}'`);
    const seen = { draws: Number(m[1]), triangles: Number(m[2]) * 1000, passes: Number(m[3]) };
    const breaches = MEASURES.filter((k) => seen[k] > limit[k]);
    over ||= breaches.length > 0;
    console.log(`${breaches.length ? 'OVER' : 'ok  '} ${name.padEnd(6)} ${seen.draws} draws  ${m[2]}k tri  ${seen.passes} passes` +
      (breaches.length ? `  (over: ${breaches.join(', ')})` : '') + (own ? `  (its own: ${limit.triangles / 1000}k tri)` : ''));
  }
} finally {
  await close();
}
console.log(`budget: ${BUDGET.draws} draws, ${BUDGET.triangles / 1000}k triangles, ${BUDGET.passes} passes a frame`);
process.exit(over ? 1 : 0);

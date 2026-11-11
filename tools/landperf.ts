// PROTOTYPE (land look): the sea's perf windows on the Mac's GPU with the land on and off, same view, fps uncapped.
//   node tools/landperf.ts [query ...]
import { launch, openGame, serve } from './harness.ts';

const views = process.argv.slice(2);
const queries = views.length ? views : ['hour=15&yaw=1.57&pitch=0.12&dist=40', 'hour=15&yaw=1.57&pitch=0.12&dist=40&land=0&R=10000'];
const server = await serve();
const { browser, renderer } = await launch();
console.log(renderer);
try {
  for (const query of queries) {
    const game = await openGame(browser, server.url, { device: 'ipad', query: Object.fromEntries(new URLSearchParams(`${query}&fps=0&throttle=0`)), hook: '__sea', dpr: 1 });
    const lines: string[] = [];
    game.page.on('console', (m) => { if (m.text().startsWith('perfjson')) lines.push(m.text().slice(9)); else if (m.text().startsWith('land:')) console.log('  ', m.text()); });
    await game.page.waitForFunction(() => (window as unknown as { __sea?: { ready: boolean } }).__sea?.ready, null, { timeout: 60000 });
    const t = Date.now();
    while (lines.length < 2 && Date.now() - t < 30000) await game.page.waitForTimeout(500);
    const w = JSON.parse(lines.at(-1) ?? '{}');
    console.log(query, JSON.stringify({ fps: w.fps, p50: w.p50, gpu: w.gpu, tris: w.tris, calls: w.calls, systems: w.systems }));
    await game.page.context().close();
  }
} finally {
  await browser.close();
  await server.close();
}

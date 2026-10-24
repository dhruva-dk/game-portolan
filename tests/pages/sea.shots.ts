// Captures the sea test page (tests/pages/sea.html): deck and high views over the Coral Atolls, a coast close up, the
// hull-down line of ships, a cube corner, the north pole and the planet's curve (frames at CSS resolution).
//   node tests/pages/sea.shots.ts [outDir] [--only=<substring>]     (default outDir: progress/shots, files wp13-*)
import { join } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { launch, openGame, root, serve, type DeviceName } from '../harness.ts';

const args = process.argv.slice(2);
const outDir = args.find((a) => !a.startsWith('--')) ?? join(root, 'progress/shots');
const only = args.find((a) => a.startsWith('--only='))?.slice(7) ?? '';
const SHOTS: { name: string; device: DeviceName; query: Record<string, string> }[] = [
  ...(['ipad', 'iphone'] as const).flatMap((device) => [
    { name: 'deck', device, query: { view: 'deck' } },
    { name: 'high', device, query: { view: 'high' } },
  ]),
  ...['coast', 'hull', 'seam', 'pole', 'curve'].map((view) => ({ name: view, device: 'ipad' as const, query: { view } })),
];

await mkdir(outDir, { recursive: true });
const server = await serve();
const { browser, renderer } = await launch();
console.log(`renderer: ${renderer}`);
try {
  for (const s of SHOTS) {
    const file = join(outDir, `wp13-${s.device}-${s.name}.png`);
    if (only && !file.includes(only)) continue;
    const game = await openGame(browser, `${server.url}tests/pages/sea.html`, { device: s.device, hook: '__sea', query: { clock: '12', ...s.query } });
    await game.until((g) => g.ready, undefined, 30000);
    await game.page.waitForTimeout(300);
    await game.page.screenshot({ path: file, scale: 'css' });
    game.assertClean();
    console.log(file, JSON.stringify(await game.hook((g) => ({ calls: g.calls, triangles: g.triangles, sea: g.seaTriangles, geoMs: Math.round(g.geoMs), seaMs: Math.round(g.seaMs) }))));
    await game.close();
  }
} finally {
  await browser.close();
  await server.close();
}

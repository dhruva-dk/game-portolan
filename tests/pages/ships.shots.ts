// Captures the shipwright's sheet (tests/pages/ships.html) at both devices: the four forms in three captains'
// pigments, the same sheet far off, the sail states, and a hero view of each form (frames at CSS resolution).
//   node tests/pages/ships.shots.ts [outDir] [--only=<substring>]     (default outDir: progress/shots, files wp18-*)
import { join } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { DEVICES, launch, openGame, root, serve, type DeviceName } from '../harness.ts';

const args = process.argv.slice(2);
const outDir = args.find((a) => !a.startsWith('--')) ?? join(root, 'progress/shots');
const only = args.find((a) => a.startsWith('--only='))?.slice(7) ?? '';
const SHOTS: { name: string; query: Record<string, string> }[] = [
  { name: 'sheet', query: { view: 'sheet' } },
  { name: 'far', query: { view: 'far' } },
  { name: 'states', query: { view: 'states', form: 'galleon' } },
  ...['pinnace', 'caravel', 'carrack', 'galleon'].map((form) => ({ name: `hero-${form}`, query: { view: 'hero', form } })),
];

await mkdir(outDir, { recursive: true });
const server = await serve();
const { browser, renderer } = await launch();
console.log(`renderer: ${renderer}`);
try {
  for (const device of Object.keys(DEVICES) as DeviceName[]) {
    for (const s of SHOTS) {
      const file = join(outDir, `wp18-${device}-${s.name}.png`);
      if (only && !file.includes(only)) continue;
      const game = await openGame(browser, `${server.url}tests/pages/ships.html`, { device, hook: '__ships', query: s.query });
      await game.until((g) => g.ready);
      await game.page.waitForTimeout(300);
      await game.page.screenshot({ path: file, scale: 'css' });
      game.assertClean();
      console.log(file, JSON.stringify(await game.hook((g) => ({ triangles: g.triangles, calls: g.calls }))));
      await game.close();
    }
  }
} finally {
  await browser.close();
  await server.close();
}

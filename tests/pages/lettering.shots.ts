// Captures the lettering specimen (tests/pages/lettering.html) at both devices: the specimen sheet, the names, the
// title lettering itself in, and the interface sizes at full device resolution for the legibility check.
//   node tests/pages/lettering.shots.ts [outDir] [--only=<substring>]     (default outDir: progress/shots, files wp04-*)
import { join } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { DEVICES, launch, openGame, root, serve, type DeviceName } from '../harness.ts';

const args = process.argv.slice(2);
const outDir = args.find((a) => !a.startsWith('--')) ?? join(root, 'progress/shots');
const only = args.find((a) => a.startsWith('--only='))?.slice(7) ?? '';

const SHOTS: { name: string; sheet: string; query?: Record<string, string | number>; device?: boolean }[] = [
  { name: 'specimen', sheet: 'specimen' },
  { name: 'names', sheet: 'names' },
  { name: 'title', sheet: 'title', query: { progress: 0.62, hour: 17.5 } },
  { name: 'frames', sheet: 'frames', query: { hour: 17.5 } },
  { name: 'small', sheet: 'small', device: true },
];

await mkdir(outDir, { recursive: true });
const server = await serve();
const { browser, renderer } = await launch();
console.log(`renderer: ${renderer}`);
try {
  for (const device of Object.keys(DEVICES) as DeviceName[]) {
    for (const s of SHOTS) {
      const file = join(outDir, `wp04-${device}-${s.name}.png`);
      if (only && !file.includes(only)) continue;
      const game = await openGame(browser, `${server.url}tests/pages/lettering.html`, {
        device, hook: '__lettering', query: { sheet: s.sheet, ...s.query },
      });
      await game.until((g) => g.ready);
      // interface sizes at device resolution (a crop, to keep progress/ light); the sheets at CSS resolution
      if (s.device) await game.page.screenshot({ path: file, clip: { x: 20, y: 20, width: 600, height: 240 } });
      else await game.page.screenshot({ path: file, scale: 'css' });
      game.assertClean();
      console.log(file, JSON.stringify(await game.hook((g) => g.stats())));
      await game.close();
    }
  }
} finally {
  await browser.close();
  await server.close();
}

// Captures the style gallery (tests/pages/style.html) at both devices: the deck view at four hours, the high and
// orbit views at golden hour, and a full-resolution detail of lines, hatching and washes.
//   node tests/pages/style.shots.ts [outDir] [--only=<substring>]     (default outDir: progress/shots, files wp02-*)
import { join } from 'node:path';
import { DEVICES, launch, openGame, root, serve, type DeviceName } from '../harness.ts';

const args = process.argv.slice(2);
const outDir = args.find((a) => !a.startsWith('--')) ?? join(root, 'progress/shots');
const only = args.find((a) => a.startsWith('--only='))?.slice(7) ?? '';

const SHOTS: { name: string; view: string; hour: number; ui?: boolean; detail?: boolean }[] = [
  { name: 'dawn', view: 'deck', hour: 6.4 },
  { name: 'midday', view: 'deck', hour: 12 },
  { name: 'golden', view: 'deck', hour: 17.5 },
  { name: 'night', view: 'deck', hour: 22 },
  { name: 'high', view: 'high', hour: 16, ui: false },
  { name: 'orbit', view: 'orbit', hour: 15, ui: false },
  { name: 'detail', view: 'deck', hour: 15.5, ui: false, detail: true },
];

const server = await serve();
const { browser, renderer } = await launch();
console.log(`renderer: ${renderer}`);
try {
  for (const device of Object.keys(DEVICES) as DeviceName[]) {
    for (const s of SHOTS) {
      const file = join(outDir, `wp02-${device}-${s.name}.png`);
      if (only && !file.includes(only)) continue;
      const game = await openGame(browser, `${server.url}tests/pages/style.html`, {
        device, hook: '__style', query: { view: s.view, hour: s.hour, ui: s.ui === false ? 0 : 1 },
      });
      await game.until((g) => g.ready);
      await game.page.waitForTimeout(400);
      if (s.detail) {
        const { width, height } = game.device;
        await game.page.screenshot({ path: file, clip: { x: width * 0.3, y: height * 0.38, width: width * 0.36, height: height * 0.4 } });
      } else await game.screenshot(file);
      game.assertClean();
      console.log(file, JSON.stringify(await game.hook((g) => g.stats())));
      await game.close();
    }
  }
} finally {
  await browser.close();
  await server.close();
}

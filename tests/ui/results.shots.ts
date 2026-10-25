// WP27 shots: the chest choice, the results (writing in and done), the career chart at 0, two thirds and all inked,
// and each first-voyage prompt, drawn by tests/ui/results.page.ts on the iPhone and the iPad and saved as
// progress/shots/wp27-<device>-<shot>.png (the contact sheet is gathered from them).
//   node tests/ui/results.shots.ts
import { join } from 'node:path';
import { launch, root, serve } from '../harness.ts';

const SHOTS: [string, 'iphone' | 'ipad'][] = [
  ['chest', 'iphone'], ['chest-gold', 'iphone'], ['results-mid', 'iphone'], ['results', 'iphone'], ['chart-0', 'iphone'], ['chart-23', 'iphone'], ['chart-100', 'iphone'],
  ...[0, 1, 2, 3, 4, 5, 6].map((k): [string, 'iphone'] => [`lesson-${k}`, 'iphone']),
  ['chest', 'ipad'], ['results-won', 'ipad'], ['chart-23', 'ipad'], ['lesson-3', 'ipad'],
];
const SIZE = { iphone: { width: 956, height: 440 }, ipad: { width: 1376, height: 1032 } };
const server = await serve();
const { browser } = await launch();
try {
  for (const [shot, dev] of SHOTS) {
    const page = await browser.newPage({ viewport: SIZE[dev], deviceScaleFactor: 2 });
    page.on('pageerror', (e) => console.error(`${dev} ${shot}: ${e.message}`));
    await page.goto(`${server.url}/tests/ui/results.html?shot=${shot}&dev=${dev}`);
    await page.waitForFunction(() => (window as unknown as { __wp27?: { done: boolean } }).__wp27?.done === true, null, { timeout: 90_000 });
    await page.screenshot({ path: join(root, 'progress/shots', `wp27-${dev}-${shot}.png`) });
    await page.close();
    console.log(`wp27-${dev}-${shot}.png`);
  }
} finally {
  await browser.close();
  await server.close();
}

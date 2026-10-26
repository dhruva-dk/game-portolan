import { join } from 'node:path';
import { launch, root, serve } from '../harness.ts';

const SHOTS: [string, 'iphone' | 'ipad'][] = [
  ['chest', 'iphone'], ['chest-gold', 'iphone'], ['results-mid', 'iphone'], ['results', 'iphone'], ['chart-0', 'iphone'], ['chart-23', 'iphone'], ['chart-100', 'iphone'],
  ...[0, 1, 2, 3, 4, 5, 6].map((k): [string, 'iphone'] => [`lesson-${k}`, 'iphone']),
  ['chest', 'ipad'], ['results-won', 'ipad'], ['chart-23', 'ipad'], ['lesson-3', 'ipad'],
];
const PART_B: [string, 'iphone' | 'ipad'][] = [
  ['chest-close', 'iphone'], ['chest-gold-close', 'iphone'], ['results-close', 'iphone'], ['chest-close', 'ipad'], ['chest-gold-close', 'ipad'], ['results-close', 'ipad'],
  ['next', 'iphone'], ['next', 'ipad'], ['chart-geo-0', 'iphone'], ['chart-geo-23', 'iphone'], ['chart-geo-100', 'iphone'], ['chart-geo-23', 'ipad'],
  ['unroll-0', 'iphone'], ['unroll-1', 'iphone'], ['unroll-2', 'iphone'], ['unroll-3', 'iphone'],
];
const SIZE = { iphone: { width: 956, height: 440, dpr: 3 }, ipad: { width: 1376, height: 1032, dpr: 2 } };
const server = await serve();
const { browser } = await launch();
try {
  for (const [shot, dev, part] of [...(process.env.WP27_SHOTS === 'b' ? [] : SHOTS.map(([a, b]) => [a, b, 'wp27'] as const)), ...PART_B.map(([a, b]) => [a, b, 'wp27b'] as const)]) {
    const { width, height, dpr } = SIZE[dev];
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: part === 'wp27' ? 2 : dpr });
    page.on('pageerror', (e) => console.error(`${dev} ${shot}: ${e.message}`));
    await page.goto(`${server.url}/tests/ui/results.html?shot=${shot}&dev=${dev}`);
    await page.waitForFunction(() => (window as unknown as { __wp27?: { done: boolean } }).__wp27?.done === true, null, { timeout: 90_000 });
    const clip = await page.evaluate(() => (window as unknown as { __wp27: { clip: { x: number; y: number; width: number; height: number } | null } }).__wp27.clip);
    await page.screenshot({ path: join(root, 'out/shots', `${part}-${dev}-${shot}.png`), ...(clip ? { clip } : {}) });
    await page.close();
    console.log(`${part}-${dev}-${shot}.png`);
  }
} finally {
  await browser.close();
  await server.close();
}

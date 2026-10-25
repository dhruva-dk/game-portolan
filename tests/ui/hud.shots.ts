// WP25 shots: the match HUD in calm, fight and storm on the iPhone and the iPad, the fight on the smallest iPhone
// (layout only), each saved and gathered into the contact sheet progress/shots/wp25-hud.png. node tests/ui/hud.shots.ts
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { root, serve } from '../harness.ts';

const DEVICES = {
  iphone: { width: 956, height: 440, scale: 1.5, safe: '0,62,20,62' },
  ipad: { width: 1376, height: 1032, scale: 1, safe: '0,0,25,0' },
  mini: { width: 812, height: 375, scale: 1.5, safe: '0,50,21,50' },
} as const;
const RUNS: [keyof typeof DEVICES, string][] = [['iphone', 'calm'], ['iphone', 'fight'], ['iphone', 'storm'], ['ipad', 'calm'], ['ipad', 'fight'], ['ipad', 'storm'], ['mini', 'fight']];

const server = await serve();
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const shots: { name: string; png: Buffer }[] = [];
try {
  for (const dev of ['iphone', 'ipad', 'mini'] as const) {
    const d = DEVICES[dev];
    const page = await browser.newPage({ viewport: { width: d.width, height: d.height }, deviceScaleFactor: d.scale, hasTouch: true });
    page.on('pageerror', (e) => console.error(dev, e.message));
    await page.goto(`${server.url}/tests/ui/hud.html?safe=${d.safe}`);
    await page.waitForFunction(() => (window as unknown as { __hudReady?: boolean }).__hudReady === true, null, { timeout: 180_000 });
    for (const [rd, scene] of RUNS) {
      if (rd !== dev) continue;
      await page.evaluate((s) => (window as unknown as { __hud: (s: string) => Promise<boolean> }).__hud(s), scene);
      const png = await page.screenshot({ timeout: 240_000 });
      const name = `wp25-${dev}-${scene}`;
      writeFileSync(join(root, 'progress/shots', `${name}.png`), png);
      shots.push({ name, png });
    }
    await page.close();
  }
  const sheet = await browser.newPage({ viewport: { width: 1320, height: 400 }, deviceScaleFactor: 1 });
  const cell = (s: { name: string; png: Buffer }) => `<figure><img src="data:image/png;base64,${s.png.toString('base64')}"><figcaption>${s.name}</figcaption></figure>`;
  await sheet.setContent(`<style>body{margin:0;background:#efe0c0;font:13px Georgia;display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:8px}figure{margin:0}img{width:100%;display:block}figcaption{color:#2a211c;padding:2px 0}</style>${shots.map(cell).join('')}`);
  writeFileSync(join(root, 'progress/shots/wp25-hud.png'), await sheet.screenshot({ fullPage: true }));
  console.log(`wrote ${shots.length} shots and progress/shots/wp25-hud.png`);
} finally {
  await browser.close();
  await (server as unknown as { close(): Promise<void> }).close();
}

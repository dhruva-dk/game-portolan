// Screenshots dev pages headlessly, with the GPU when there is one, and reports console errors.
//   node tests/tools/devshot.ts <out-dir> <page>[?query] [<page> ...] [--wait 8] [--width 1376 --height 1032]
import { parseArgs } from 'node:util';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { launch, serve } from '../harness.ts';

const { values: a, positionals } = parseArgs({
  allowPositionals: true,
  options: { wait: { type: 'string', default: '8' }, width: { type: 'string', default: '1376' }, height: { type: 'string', default: '1032' } },
});
const [out, ...pages] = positionals;
await mkdir(out, { recursive: true });
const server = await serve();
const { browser, renderer } = await launch();
console.log(`devshot: ${renderer}`);
try {
  for (const p of pages) {
    const page = await browser.newPage({ viewport: { width: Number(a.width), height: Number(a.height) }, deviceScaleFactor: 1 });
    const errors: string[] = [];
    page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`); });
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    await page.goto(new URL(p, server.url).href);
    await page.waitForTimeout(Number(a.wait) * 1000);
    const file = join(out, p.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') + '.png');
    await page.screenshot({ path: file });
    console.log(`${p} -> ${file}${errors.length ? `\n  ${errors.slice(0, 8).join('\n  ')}` : ''}`);
    await page.close();
  }
} finally {
  await browser.close();
  await server.close();
}

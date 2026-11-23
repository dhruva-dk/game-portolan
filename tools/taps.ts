// A screenshot after taps, for judging by eye what a screen does when touched
// (a breakdown opened, a folio over the page, a menu dropped).
//   node tools/taps.ts [--out=dir] query selector[@n] ...
//   e.g. node tools/taps.ts "screen=profile&meter" ".pf-why" ".cr-btn.harm"
// Opens the page at `query` as capture.ts does (the meter's first reading),
// then taps each selector in turn (its nth match with @n, from 0), waits for
// what the tap set going to settle, and writes <out>/<query>-<k>.png after the
// kth tap. --out=dir writes there (captures/).

import { mkdirSync } from 'node:fs';
import { VIEW, launch } from './launch.ts';

const out =
  process.argv.find((a) => a.startsWith('--out='))?.slice(6) ?? 'captures';
const [query = '', ...taps] = process.argv
  .slice(2)
  .filter((a) => !a.startsWith('--'));

const { browser, url, close } = await launch();
mkdirSync(out, { recursive: true });

try {
  const page = await browser.newPage({ viewport: VIEW });
  page.on('pageerror', (e) => console.error(e.message));
  await page.goto(`${url}?${query}`);
  await page.waitForFunction(
    () => document.getElementById('meter')?.dataset.line,
    null,
    { timeout: 60000 }
  );
  await page.waitForTimeout(1000);
  const name = query.replace(/[^\w.=-]+/g, '_') || 'default';
  for (const [k, tap] of taps.entries()) {
    const [selector, nth = '0'] = tap.split('@');
    await page.locator(selector).nth(Number(nth)).click();
    await page.waitForTimeout(400);
    const file = `${out}/${name}-${k + 1}.png`;
    await page.screenshot({ path: file });
    console.log(file, tap);
  }
} finally {
  await close();
}

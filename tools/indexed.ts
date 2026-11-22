// The IndexedDB store (src/store/indexed.ts) held to the same suite as the memory and faulty adapters
// (tests/store-suite.ts), in headless Chromium: Vite and Chromium (tools/launch.ts), the page module
// tools/indexed-page.ts, and the scripted commands made here in node (tests/career-kit.ts). Exit 1 if any test fails.
//   node tools/indexed.ts

import { launch } from './launch.ts';
import type { Outcome } from './indexed-page.ts';
import { script } from '../tests/career-kit.ts';

const commands = script(23, 36);
const { browser, url, close } = await launch();
let failed = 0;
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error(`[page] ${e.message}`));
  await page.goto(`${url}package.json`);
  const outcomes = await page.evaluate(
    async ([path, cs]): Promise<Outcome[]> => {
      const m: typeof import('./indexed-page.ts') = await import(path);
      return m.run(cs);
    },
    ['/tools/indexed-page.ts', commands] as const
  );
  for (const o of outcomes) {
    console.log(
      `${o.ok ? 'ok  ' : 'FAIL'} indexed: ${o.name} (${o.ms.toFixed(0)} ms)${o.error ? `\n     ${o.error}` : ''}`
    );
    if (!o.ok) failed++;
  }
  console.log(`${outcomes.length - failed} of ${outcomes.length} passed`);
} finally {
  await close();
}
process.exit(failed ? 1 : 0);

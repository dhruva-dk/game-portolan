// Cross-engine determinism (progress.html, Architecture A2): the determinism vectors of tests/sim/vectors.ts are
// bit-identical in Node and, run from a minified production bundle as the shipped game is, in Chromium (V8) and
// WebKit (JavaScriptCore, the engine of the iOS app's web view). Any mismatch is a blocker.
//   node --test tests/sim/determinism-vectors.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { chromium, webkit } from 'playwright';
import { build } from 'vite';
import { vectors } from './vectors.ts';

/** tests/sim/vectors.ts as one minified script that defines `portolanVectors`, built like the game. */
async function bundle(): Promise<string> {
  const result = await build({
    configFile: false,
    root: fileURLToPath(new URL('../..', import.meta.url)),
    publicDir: false,
    logLevel: 'warn',
    build: {
      write: false,
      minify: true,
      target: 'es2022',
      lib: { entry: fileURLToPath(new URL('./vectors.ts', import.meta.url)), formats: ['iife'], name: 'portolanVectors', fileName: 'vectors' },
    },
  });
  const [{ output }] = (Array.isArray(result) ? result : [result]) as { output: { code?: string }[] }[];
  return output[0].code!;
}

test('the determinism vectors are bit-identical in Node, Chromium and WebKit', async (t) => {
  const node = vectors();
  t.diagnostic(`Node ${process.version}: ${JSON.stringify(node)}`);
  assert.equal(node.resumed, node.match, 'a match resumed from a snapshot ends identical');
  const code = await bundle();

  for (const [name, engine] of [['Chromium', chromium], ['WebKit', webkit]] as const) {
    await t.test(name, async () => {
      const browser = await engine.launch();
      try {
        const page = await browser.newPage();
        await page.addScriptTag({ content: code });
        const got = await page.evaluate(() => (window as unknown as { portolanVectors: { vectors(): Record<string, string> } }).portolanVectors.vectors());
        t.diagnostic(`${name} ${browser.version()}: ${JSON.stringify(got)}`);
        assert.deepEqual(got, node);
      } finally {
        await browser.close();
      }
    });
  }
});

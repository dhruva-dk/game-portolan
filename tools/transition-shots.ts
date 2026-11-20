// Frames of the page from its first paint through the title's giving way to the
// lobby, for judging the load's end by eye: one screenshot every `every` ms
// (--every=, 250 by default) for `for` seconds (--for=, 30), at the iPad's
// screen (launch.ts VIEW), with the load's stages (load.ts) printed as they
// come.
//   node tools/transition-shots.ts [--out=dir] [query]    e.g. node tools/transition-shots.ts screen=title

import { mkdirSync } from 'node:fs';
import { DPR, VIEW, launch } from './launch.ts';

const flag = (name: string, fallback: number) =>
  Number(
    process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] ??
      fallback
  );
const every = flag('every', 250),
  seconds = flag('for', 30);
const out =
  process.argv.find((a) => a.startsWith('--out='))?.slice(6) ??
  'captures/transition';
const query =
  process.argv.slice(2).find((a) => !a.startsWith('--')) ?? 'screen=title';

const { browser, url, close } = await launch();
mkdirSync(out, { recursive: true });
try {
  const page = await browser.newPage({
    viewport: VIEW,
    deviceScaleFactor: DPR,
  });
  const began = Date.now();
  page.on(
    'console',
    (m) =>
      m.text().startsWith('load') &&
      console.log(`${Date.now() - began} ms  ${m.text()}`)
  );
  page.on('pageerror', (e) => console.error(e.message));
  void page.goto(`${url}?${query}`);
  for (let k = 0; Date.now() - began < seconds * 1000; k++) {
    const at = Date.now() - began;
    await page
      .screenshot({
        path: `${out}/${String(k).padStart(3, '0')}-${at}.png`,
        scale: 'css',
      })
      .catch(() => {});
    await page.waitForTimeout(Math.max(0, every - (Date.now() - began - at)));
  }
} finally {
  await close();
}

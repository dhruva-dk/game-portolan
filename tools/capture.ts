// Screenshots of the game in headless Chromium with WebGPU, for judging changes by eye.
//   node tools/capture.ts [--shots=n --every=ms] [query ...]      e.g. node tools/capture.ts t=10 t=15 t=18.6
// --shots takes n screenshots of each page, `every` ms apart (default 1), named <query>-<k>.png past the first.
// The page is the iPad Air's landscape screen (launch.ts VIEW). --dpr=2 shows it at the iPad's own pixel density: the
// frame is still drawn at its internal resolution (frame.ts SCALE) and the browser scales it up, as the iPad does. --out=dir writes there (captures/).
// Starts the Vite dev server, opens one page per query, waits for a second and a half of frames, writes
// captures/<query>.png.
// The frame rate is uncapped, so the FPS printed is a cost measure; GPU timestamps read 0 when uncapped.
// --passes prints the meter's split of a frame's draw calls by pass and by what is drawn (src/meter.ts).

import { mkdirSync } from 'node:fs';
import { VIEW, launch } from './launch.ts';

const flag = (name: string, fallback: number) => Number(process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] ?? fallback);
const shots = flag('shots', 1), every = flag('every', 500), dpr = flag('dpr', 1);
const out = process.argv.find((a) => a.startsWith('--out='))?.slice(6) ?? 'captures';
const split = process.argv.includes('--passes');
const queries = process.argv.slice(2).filter((a) => !a.startsWith('--'));
if (queries.length === 0) queries.push('');

const { browser, url, close } = await launch();
mkdirSync(out, { recursive: true });

try {
  for (const q of queries) {
    const page = await browser.newPage({ viewport: VIEW, deviceScaleFactor: dpr });
    page.on('console', (m) => ['error', 'warning'].includes(m.type()) && console.error(`[${q}] ${m.text()}`));
    page.on('pageerror', (e) => console.error(`[${q}] ${e.message}`));
    await page.goto(`${url}?${q}`);
    // the meter's first reading: a second of frames has run (the ground's bake comes first)
    await page.waitForFunction(() => document.getElementById('meter')?.textContent, null, { timeout: 60000 });
    await page.waitForTimeout(1500);
    for (let k = 0; k < shots; k++) {
      if (k > 0) await page.waitForTimeout(every);
      const file = `${out}/${q.replace(/[^\w.=-]+/g, '_') || 'default'}${k > 0 ? `-${k}` : ''}.png`;
      await page.screenshot({ path: file });
      console.log(file, await page.textContent('#meter'));
      if (split) console.log(await page.$eval('#meter', (m) => `${(m as HTMLElement).dataset.passes}\n--\n${(m as HTMLElement).dataset.objects}\n`));
    }
    await page.close();
  }
} finally {
  await close();
}

// Screenshots of the game in headless Chromium with WebGPU, for judging changes by eye.
//   node tools/capture.ts [--shots=n --every=ms] [query ...]      e.g. node tools/capture.ts t=10 t=15 t=18.6
// --shots takes n screenshots of each page, `every` ms apart (default 1), named <query>-<k>.png past the first.
// --dpr=2 shows the page at the iPad's own pixel density: the frame is still drawn at its internal resolution (frame.ts
// SCALE pixels a CSS pixel) and the browser scales it up, as the iPad does. --out=dir writes there (captures/).
// Starts the Vite dev server, opens one page per query at the iPad's page (launch.ts DEVICE), waits for a second and a
// half of frames, writes captures/<query>.png.
// Each shot also checks the page: every element of the UI layer (each HTML element, each sheet's <svg>, and each
// press-able region drawn in one) must lie within the 1180 × 820 page. One that does not is named, and the tool fails
// (exit 1) once every shot is taken. A shot of the office's page is checked further (checks.ts: no scrolling, tap
// targets 44 × 44 and 8 px apart, text 13 px and up at 7 : 1), and the screens' files for colour literals; any failure
// fails the tool. e.g. node tools/capture.ts screen=home screen=found screen=kit
// The frame rate is uncapped, so the FPS printed is a cost measure; GPU timestamps read 0 when uncapped.
// --passes prints the meter's split of a frame's draw calls by pass and by what is drawn (src/meter.ts).

import { mkdirSync } from 'node:fs';
import { literals, officeChecks } from './checks.ts';
import { DEVICE, launch } from './launch.ts';

const flag = (name: string, fallback: number) => Number(process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] ?? fallback);
const shots = flag('shots', 1), every = flag('every', 500), dpr = flag('dpr', 1);
const out = process.argv.find((a) => a.startsWith('--out='))?.slice(6) ?? 'captures';
const split = process.argv.includes('--passes');
const queries = process.argv.slice(2).filter((a) => !a.startsWith('--'));
if (queries.length === 0) queries.push('');

/** A box's slack past the page's edge, CSS px, for sub-pixel rounding. */
const SLACK = 0.5;

const { browser, url, close } = await launch();
mkdirSync(out, { recursive: true });
let outside = 0, failed = 0;

try {
  for (const q of queries) {
    const page = await browser.newPage({ viewport: { width: DEVICE.width, height: DEVICE.height }, deviceScaleFactor: dpr });
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
      // the UI layer's elements laid out (with a box) and not inside the page; what an <svg> draws is clipped to it, so
      // of its shapes only the regions a finger must reach are checked
      const off = await page.$$eval('.ui *', (els, { w, h, slack }) => els.flatMap((el) => {
        const drawn = el instanceof SVGElement && !(el instanceof SVGSVGElement && !(el.parentElement instanceof SVGElement));
        if (drawn && !el.classList.contains('press')) return [];
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return [];
        if (r.left >= -slack && r.top >= -slack && r.right <= w + slack && r.bottom <= h + slack) return [];
        // (a list's rows scrolled out of its panel are inside the page: the panel scrolls them in)
        for (let a = el.parentElement; a; a = a.parentElement) if (/(auto|scroll)/.test(getComputedStyle(a).overflowY)) return [];
        const name = `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${el.getAttribute('class') ? `.${el.getAttribute('class')!.trim().replace(/\s+/g, '.')}` : ''}`;
        return [`${name} at ${r.left.toFixed(0)},${r.top.toFixed(0)} to ${r.right.toFixed(0)},${r.bottom.toFixed(0)}`];
      }), { w: DEVICE.width, h: DEVICE.height, slack: SLACK });
      for (const o of off) console.error(`[${q}] outside the page: ${o}`);
      outside += off.length;
      // the office's page: scrolling, tap targets, text size and contrast (checks.ts)
      const office = await officeChecks(page);
      for (const o of office) console.error(`[${q}] ${o}`);
      failed += office.length;
    }
    await page.close();
  }
} finally {
  await close();
}
const named = literals();
for (const l of named) console.error(l);
if (outside > 0) console.error(`${outside} element(s) of the UI outside the ${DEVICE.width} × ${DEVICE.height} page`);
if (failed + named.length > 0) console.error(`${failed + named.length} failure(s) of the office's checks`);
if (outside + failed + named.length > 0) process.exit(1);

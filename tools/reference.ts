// Judge our render against the north-star screenshots by eye.
//   node tools/reference.ts [name ...]     names from PAIRS; default all
// For each pair: crops the north star to its UI-free scene region, captures the game at the matching camera
// and composes captures/reference/<name>.png with the north star left, ours right.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { launch } from './launch.ts';

// Camera pairs. Retune here. The north stars are 2602x2394; `crop` is the UI-free region in their pixels.
// Camera: x/y/z metres (island at z = -300, 70 m radius), look = pitch degrees, yaw = degrees (0 north), t = hours.
const PAIRS = [
  { name: 'sea', star: 'docs/north-star/sea.png', crop: { x: 400, y: 0, w: 1590, h: 2394 }, query: 't=15&wind=15&x=0&y=35&z=0&look=-20&yaw=180' },
  { name: 'island', star: 'docs/north-star/island.png', crop: { x: 400, y: 0, w: 1590, h: 2394 }, query: 't=15&wind=15&x=0&y=40&z=-110&look=-20&yaw=0' },
];

const only = process.argv.slice(2);
const pairs = PAIRS.filter((p) => only.length === 0 || only.includes(p.name));
const H = 1000; // height of each half in the composite, CSS pixels
mkdirSync('captures/reference', { recursive: true });
const { browser, url, close } = await launch();

try {
  for (const p of pairs) {
    const w = Math.round((H * p.crop.w) / p.crop.h);
    const game = await browser.newPage({ viewport: { width: w, height: H } });
    game.on('console', (m) => ['error', 'warning'].includes(m.type()) && console.error(`[${p.name}] ${m.text()}`));
    game.on('pageerror', (e) => console.error(`[${p.name}] ${e.message}`));
    await game.goto(`${url}?${p.query}`);
    await game.waitForTimeout(3000);
    const ours = (await game.screenshot()).toString('base64');
    await game.close();

    const { x, y, h: ch } = p.crop;
    const k = H / ch; // scale the north star to the same height
    const star = readFileSync(p.star).toString('base64');
    const page = await browser.newPage({ viewport: { width: 2 * w + 8, height: H } });
    await page.setContent(`<body style="margin:0;background:#000;display:flex;gap:8px">
      <div style="width:${w}px;height:${H}px;overflow:hidden;position:relative"><img src="data:image/png;base64,${star}"
        style="position:absolute;left:${-x * k}px;top:${-y * k}px;width:${2602 * k}px;height:${2394 * k}px"></div>
      <img src="data:image/png;base64,${ours}" style="width:${w}px;height:${H}px"></body>`);
    await page.evaluate(() => Promise.all([...document.images].map((i) => i.decode())));
    const file = `captures/reference/${p.name}.png`;
    writeFileSync(file, await page.screenshot());
    console.log(file);
    await page.close();
  }
} finally {
  await close();
}

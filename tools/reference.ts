// Judge our render against the north-star screenshots by eye.
//   node tools/reference.ts [name ...]     names from PAIRS; default all
// For each pair: crops the north star to its UI-free scene region, captures the game at the matching camera
// and composes captures/reference/<name>.png with the north star left, ours right.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { launch } from './launch.ts';

// Camera pairs. Retune here. The north stars are 2602x2394; `crop` is the UI-free region in their pixels.
// Camera: lat/lon degrees on the 554 m planet of the game's seed (world/planet.ts SEED: a degree is 9.67 m), alt
// metres, look = pitch degrees, yaw = compass degrees from local north, t = hours. The largest island's centre is at
// lat 8.74, lon −11.61, its south shore 71 m from it (tools/planet-map.ts lists the islands).
// sea: 35 m up over a bank 9 m deep, 220 m south-east of the island, looking 20° down toward a channel's edge 40–80 m
// ahead; island: 40 m up, 120 m south of the island's near shore, looking 20° down north at it.
const PAIRS = [
  { name: 'sea', star: 'docs/north-star/sea.png', crop: { x: 400, y: 0, w: 1590, h: 2394 }, query: 'wind=10&lat=25&lon=-14.6&alt=28&look=-27&yaw=150' },
  { name: 'island', star: 'docs/north-star/island.png', crop: { x: 400, y: 0, w: 1590, h: 2394 }, query: 'wind=10&lat=16.9&lon=-4.6&alt=15&look=-25&yaw=225' },
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
    // the meter's first reading: a second of frames has run (the ground's bake comes first)
    await game.waitForFunction(() => document.getElementById('meter')?.textContent, null, { timeout: 60000 });
    await game.waitForTimeout(2000);
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

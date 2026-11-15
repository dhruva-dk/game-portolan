// Captures of a planet of each biome (world/biome.ts: seedIn(name, 7), the planets tools/budget.ts --biomes judges), in
// headless Chromium with WebGPU, for judging them by eye: each from orbit (the arrival's first frame, held:
// ?screen=play&pause) and at sea level at her berth in the race, the eye come down behind her, her flight called once
// her hands are on her ship and at work mending on her deck (?flight=&job=mend), the look swung round to her beam
// (?swing=); set out on one contact sheet, a biome a row. The UI is hidden for the shots: the world is what is judged.
//   node tools/biomes.ts [--out=dir] [--only=name,name] [query ...]      e.g. node tools/biomes.ts --only=volcanicArc mood=dawn
// Writes <out>/biome-<name>-orbit.png, -sea.png and biome-sheet.png (captures/ by default), and prints the meter's
// reading for each.

import { mkdirSync, writeFileSync } from 'node:fs';
import { BIOMES, seedIn } from '../src/world/biome.ts';
import { DEVICE, launch } from './launch.ts';

const out = process.argv.find((a) => a.startsWith('--out='))?.slice(6) ?? 'captures';
const only = process.argv.find((a) => a.startsWith('--only='))?.slice(7).split(',');
const extra = process.argv.slice(2).filter((a) => !a.startsWith('--')).map((a) => `&${a}`).join('');
/** The two views: their switches, and how long the frames run past the meter's first reading (a second in) before
 *  the shot, ms: the arrival takes 2.8 s (play/arrival.ts), the flight is called at 4 s and comes in five
 *  (sim/flight.ts SERVICE.arrive). */
const VIEWS = [
  { name: 'orbit', q: 'screen=play&pause', wait: 1500 },
  { name: 'sea', q: 'screen=play&flight=4&job=mend&swing=-260,-60,10', wait: 12000 },
] as const;

const { browser, url, close } = await launch();
mkdirSync(out, { recursive: true });
const rows: { name: string; shots: Buffer[] }[] = [];
try {
  for (const b of BIOMES.filter((x) => !only || only.includes(x.name))) {
    const seed = seedIn(b.name, 7), shots: Buffer[] = [];
    for (const v of VIEWS) {
      const page = await browser.newPage({ viewport: { width: DEVICE.width, height: DEVICE.height } });
      page.on('console', (m) => ['error', 'warning'].includes(m.type()) && console.error(`[${b.name} ${v.name}] ${m.text()}`));
      page.on('pageerror', (e) => console.error(`[${b.name} ${v.name}] ${e.message}`));
      await page.goto(`${url}?${v.q}&seed=${seed}${extra}`);
      // the meter's first reading: the ground is baked and a second of frames has run
      await page.waitForFunction(() => document.getElementById('meter')?.textContent, null, { timeout: 120000 });
      await page.waitForTimeout(v.wait);
      // the world alone: the HUD and the race's first card hidden (the meter stays)
      await page.addStyleTag({ content: '.ui { display: none !important }' });
      await page.waitForTimeout(100);
      const file = `${out}/biome-${b.name}-${v.name}.png`;
      shots.push(await page.screenshot({ path: file }));
      console.log(file, `seed ${seed}`, await page.textContent('#meter'));
      await page.close();
    }
    rows.push({ name: b.name, shots });
  }
  // the contact sheet: a biome a row, from orbit and at sea side by side
  const sheet = await browser.newPage({ viewport: { width: 1180, height: 400 } });
  const cells = rows.map((r) => `<div class="name">${r.name}</div>${r.shots.map((png) => `<img src="data:image/png;base64,${png.toString('base64')}">`).join('')}`);
  await sheet.setContent(`<body style="margin:0;background:#222;color:#eee;font:14px sans-serif;display:grid;grid-template-columns:100px repeat(2,540px)">${cells.join('')}</body>`
    + '<style>img{width:540px;height:375px;object-fit:cover}.name{padding:8px}</style>');
  writeFileSync(`${out}/biome-sheet.png`, await sheet.screenshot({ fullPage: true }));
} finally {
  await close();
}

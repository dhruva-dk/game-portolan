// Captures of a crew's rookery in 3D (debug.ts ?screen=rookery-3d), in headless Chromium with WebGPU, for judging it by
// eye: the whole campus from orbit with six buildings at their third level and three under way; then every building
// at each of its levels, and under way to its next, each from close in (the view eased to it), set out on contact
// sheets (one per building: its levels 1, 2, 3 and under way).
//   node tools/rookery.ts [--out=dir] [query ...]      e.g. node tools/rookery.ts crew=12 emblem=3
// Writes <out>/rookery-*.png (captures/ by default), and prints the meter's reading for each.

import { mkdirSync, writeFileSync } from 'node:fs';
import { DEVICE, launch } from './launch.ts';

const out = process.argv.find((a) => a.startsWith('--out='))?.slice(6) ?? 'captures';
const extra = process.argv.slice(2).filter((a) => !a.startsWith('--')).join('&');
const BUILDINGS = ['factory', 'drawingLoft', 'testTank', 'foundry', 'sailingSchool', 'flightLoft', 'crowsNest', 'fishMarket', 'landingPad'];

declare global {
  /** What ?screen=rookery-3d puts on the page (debug.ts). */
  interface Window { rookery: { shown: boolean; select(b: string | null): void }; crew(changes: object): void }
}

const { browser, url, close } = await launch();
mkdirSync(out, { recursive: true });
try {
  const page = await browser.newPage({ viewport: { width: DEVICE.width, height: DEVICE.height } });
  page.on('console', (m) => ['error', 'warning'].includes(m.type()) && console.error(m.text()));
  page.on('pageerror', (e) => console.error(e.message));
  await page.goto(`${url}?screen=rookery-3d${extra ? `&${extra}` : ''}`);
  await page.waitForFunction(() => window.rookery?.shown, null, { timeout: 120000 });
  const shot = async (name: string, wait = 2500) => {
    await page.waitForTimeout(wait);
    const file = `${out}/rookery-${name}.png`;
    const png = await page.screenshot({ path: file });
    console.log(file, await page.textContent('#meter'));
    return png;
  };
  const act = (f: string, arg: unknown) => page.evaluate(([f, arg]) => {
    if (f === 'select') window.rookery.select(arg as string | null);
    else window.crew(arg as object);
  }, [f, arg] as const);
  await shot('overview', 3000);
  await act('select', 'foundry');
  await shot('foundry-under-way');
  // each building at each level, and under way to its next, seen close in
  const all = (level: number) => Object.fromEntries(BUILDINGS.map((b) => [b, level]));
  const sheets: Record<string, Buffer[]> = Object.fromEntries(BUILDINGS.map((b) => [b, []]));
  for (const level of [1, 2, 3]) {
    await act('crew', { levels: all(level), under: {} });
    await act('select', null);
    sheets[`level ${level}`] = [await shot(`level-${level}`)];
    for (const b of BUILDINGS) {
      await act('select', b);
      sheets[b].push(await shot(`${b}-${level}`, 2200));
    }
  }
  await act('crew', { levels: all(1), under: Object.fromEntries(BUILDINGS.map((b, i) => [b, { share: 0.35 + (i % 3) * 0.2, days: 3 + i }])) });
  for (const b of BUILDINGS) {
    await act('select', b);
    sheets[b].push(await shot(`${b}-rising`, 2200));
  }
  // the contact sheets: a building's four views side by side
  const sheet = await browser.newPage({ viewport: { width: 1180, height: 440 } });
  for (const b of BUILDINGS) {
    const imgs = sheets[b].map((png) => `<img src="data:image/png;base64,${png.toString('base64')}">`).join('');
    await sheet.setContent(`<body style="margin:0;background:#222;display:grid;grid-template-columns:repeat(2,590px)">${imgs}</body>`
      + '<style>img{width:590px;height:410px;object-fit:cover}</style>');
    writeFileSync(`${out}/rookery-sheet-${b}.png`, await sheet.screenshot({ fullPage: true }));
  }
} finally {
  await close();
}

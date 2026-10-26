import { join } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { launch, openGame, root, serve } from '../harness.ts';

const outDir = process.argv[2] ?? join(root, 'out/shots');
const only = process.argv[3] ?? '', tag = only ? `${only}-` : '';
const SHOTS: readonly (readonly [string, Record<string, string>])[] = ([
  ['ice-crown', { view: 'crown', hour: '23' }],
  ['crown-light-orbit', { view: 'mark', region: 'Ice', hour: '23' }],
  ['fjord', { view: 'fjord', hour: '8' }],
  ['great-falls-orbit', { view: 'mark', region: 'Fjords', hour: '8' }],
  ['basalt-hero', { view: 'basalt', hour: '16.5' }],
  ['basalt-weave', { view: 'weave', hour: '16.5' }],
  ['basalt-arch-orbit', { view: 'mark', region: 'Basalt', hour: '16.5' }],
  ['kelp-hero', { view: 'kelp', hour: '12' }],
  ['kelp-deck', { view: 'kelpdeck', hour: '12' }],
  ['kelp-cathedral-orbit', { view: 'mark', region: 'Kelp', hour: '12' }],
  ['amber-hero', { view: 'amber', hour: '17', tide: '-0.6' }],
  ['amber-pass-low', { view: 'amberpass', hour: '17', tide: '-0.6' }],
  ['amber-pass-high', { view: 'amberpass', hour: '17', tide: '0.6' }],
  ['amber-light-orbit', { view: 'mark', region: 'Amber', hour: '17', tide: '-0.6' }],
  ['amber-calm', { view: 'amber', hour: '17', tide: '-0.3', calm: '1' }],
  ['weeping-hero', { view: 'weeping', hour: '6' }],
  ['weeping-shore', { view: 'weepingshore', hour: '7' }],
  ['weeping-high', { view: 'mark', region: 'Weeping', hour: '9' }],
  ['weeping-orbit', { view: 'orbit', region: 'Weeping', hour: '9' }],
  ['weeping-night', { view: 'weeping', hour: '22' }],
  ['weeping-rain', { view: 'weeping', hour: '7', squall: '1' }],
  ['coral-hero', { view: 'coral', hour: '12', tide: '0.1', off: '-14', aim: '-14' }],
  ['coral-shore', { view: 'coralshore', hour: '15', tide: '-0.2' }],
  ['coral-high', { view: 'mark', region: 'Coral', hour: '12', tide: '0.1' }],
  ['coral-orbit', { view: 'mark', region: 'Coral', hour: '12', tide: '0.1', height: '135', pitch: '-1.4', back: '26', 'iphone:height': '110', 'iphone:back': '30', 'iphone:pitch': '-1.43' }],
  ['spice-hero', { view: 'spice', hour: '17.2' }],
  ['spice-sun', { view: 'spice', hour: '17.6', turn: 'sun', ox: '22', oy: '14', pitch: '-0.2' }],
  ['spice-shore', { view: 'spiceshore', hour: '16' }],
  ['spice-high', { view: 'mark', region: 'Spice', hour: '16' }],
  ['spice-orbit', { view: 'mark', region: 'Spice', hour: '16', height: '135', pitch: '-1.4', back: '26', 'iphone:height': '110', 'iphone:back': '30', 'iphone:pitch': '-1.43' }],
  ['fire-hero', { view: 'fire', hour: '18.6', caldera: '2.5' }],
  ['fire-high', { view: 'mark', region: 'Fire', hour: '17.4', caldera: '4' }],
  ['fire-orbit', { view: 'mark', region: 'Fire', hour: '17.4', caldera: '4', height: '135', pitch: '-1.4', back: '26', 'iphone:height': '110', 'iphone:back': '30', 'iphone:pitch': '-1.43' }],
] as const).filter(([name]) => name.startsWith(only));
await mkdir(outDir, { recursive: true });
const server = await serve();
const { browser, renderer } = await launch();
console.log(`renderer: ${renderer}`);
const url = `${server.url}tests/pages/sea.html`;

async function sheet(frames: string[], captions: string[], cols: number, W: number, path: string): Promise<void> {
  const page = await browser.newPage({ viewport: { width: cols * W, height: 400 } });
  await page.setContent(`<body style="margin:0;background:#efe0c0;display:grid;grid-template-columns:repeat(${cols},${W}px);font:13px Georgia,serif">${frames
    .map((f, k) => `<figure style="margin:0"><img width="${W}" style="display:block" src="data:image/png;base64,${f}"><figcaption style="height:20px;line-height:20px;text-align:center">${captions[k]}</figcaption></figure>`)
    .join('')}</body>`);
  await page.screenshot({ path, fullPage: true });
  await page.close();
}

try {
  const all: string[] = [], labels: string[] = [];
  for (const device of ['ipad', 'iphone'] as const) {
    const frames: string[] = [];
    for (const [name, query] of SHOTS) {
      const own = Object.entries(query).filter(([k]) => !k.includes(':')).concat(Object.entries(query).filter(([k]) => k.startsWith(`${device}:`)).map(([k, v]) => [k.slice(device.length + 1), v]));
      const game = await openGame(browser, url, { device, hook: '__sea', query: { ...Object.fromEntries(own), clock: '12' } });
      await game.until((g) => g.ready, undefined, 30000);
      await game.page.waitForTimeout(250);
      const png = await game.page.screenshot({ path: join(outDir, `wp16-${device}-${name}.png`), scale: 'css' });
      console.log(device, name, JSON.stringify(await game.hook((g) => ({ calls: g.calls, triangles: g.triangles, regions: g.regionTriangles }))));
      game.assertClean();
      await game.close();
      frames.push(png.toString('base64'));
      labels.push(`${device} · ${name}`);
    }
    await sheet(frames, SHOTS.map(([name]) => name), 2, device === 'ipad' ? 520 : 600, join(outDir, `wp16-${tag}${device}-sheet.png`));
    all.push(...frames);
  }
  await sheet(all, labels, 4, 420, join(outDir, `wp16-${tag}sheet.png`));
} finally {
  await browser.close();
  await server.close();
}

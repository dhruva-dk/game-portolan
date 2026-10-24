// Captures the terrain on the sea test page.
//   node tests/pages/terrain.shots.ts [outDir]            WP15 part A: a generic island (the Spice Isles) from deck,
//     high and orbit at dawn, midday and golden hour, at both devices (wp15-<device>-<view>-<hour>.png, and each
//     device's nine as a contact sheet, wp15-<device>-sheet.png)
//   node tests/pages/terrain.shots.ts <outDir> <prefix>   WP15d detail set: the iPad's deck, high and orbit views of
//     the Spice Isles, a Fjords cliff close-up, a beach cove and the Weeping Isle from orbit at 16:00
//     (<prefix>-<view>.png and <prefix>-sheet.png)
// Each frame logs draw calls, triangles, the terrain's share and GPU memory for A9 (the orbit view holds the whole region).
import { join } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { launch, openGame, root, serve } from '../harness.ts';

const outDir = process.argv[2] ?? join(root, 'progress/shots');
const prefix = process.argv[3];
const VIEWS = ['deck', 'high', 'orbit'] as const;
const HOURS = [['dawn', 6.5], ['midday', 12], ['golden', 18]] as const;
const DETAIL: readonly (readonly [string, Record<string, string>])[] = [
  ['deck', { view: 'deck', region: 'Spice', off: '34' }], ['high', { view: 'high', region: 'Spice' }],
  ['orbit', { view: 'orbit', region: 'Spice' }], ['cliff', { view: 'deck', region: 'Fjords', off: '7' }],
  ['cove', { view: 'coast' }], ['weeping', { view: 'orbit', region: 'Weeping' }],
];
await mkdir(outDir, { recursive: true });
const server = await serve();
const { browser, renderer } = await launch();
console.log(`renderer: ${renderer}`);
const url = `${server.url}tests/pages/sea.html`;

type Game = Awaited<ReturnType<typeof openGame>>;
type Browser = Awaited<ReturnType<typeof launch>>['browser'];
async function capture(game: Game, path: string, label: string): Promise<string> {
  await game.page.waitForTimeout(250);
  const png = await game.page.screenshot({ path, scale: 'css' });
  console.log(label, JSON.stringify(await game.hook((g) => ({
    calls: g.calls, triangles: g.triangles, terrain: g.terrainTriangles, chunks: g.chunks, terrainMB: +g.terrainMB.toFixed(1),
    textureMB: +g.textureMB.toFixed(1), targetMB: +g.targetMB.toFixed(1), terrainMs: Math.round(g.terrainMs),
  }))));
  return png.toString('base64');
}

async function sheet(b: Browser, frames: string[], captions: string[], W: number, path: string): Promise<void> {
  const page = await b.newPage({ viewport: { width: 3 * W, height: 600 } });
  await page.setContent(`<body style="margin:0;background:#efe0c0;display:grid;grid-template-columns:repeat(3,${W}px);font:13px Georgia,serif">${frames
    .map((f, k) => `<figure style="margin:0"><img width="${W}" style="display:block" src="data:image/png;base64,${f}"><figcaption style="height:20px;line-height:20px;text-align:center">${captions[k]}</figcaption></figure>`)
    .join('')}</body>`);
  await page.screenshot({ path, fullPage: true });
  await page.close();
}

try {
  if (prefix) {
    const frames: string[] = [];
    for (const [name, query] of DETAIL) {
      const game = await openGame(browser, url, { device: 'ipad', hook: '__sea', query: { ...query, clock: '12' } });
      await game.until((g) => g.ready, undefined, 30000);
      await game.hook((g, h) => g.setHour(h), 16);
      frames.push(await capture(game, join(outDir, `${prefix}-${name}.png`), name));
      game.assertClean();
      await game.close();
    }
    await sheet(browser, frames, DETAIL.map(([name]) => name), 460, join(outDir, `${prefix}-sheet.png`));
  } else {
    for (const device of ['ipad', 'iphone'] as const) {
      const frames: string[] = [], captions: string[] = [];
      for (const view of VIEWS) {
        const game = await openGame(browser, url, { device, hook: '__sea', query: { view, region: 'Spice', clock: '12', off: '34' } });
        await game.until((g) => g.ready, undefined, 30000);
        for (const [name, hour] of HOURS) {
          await game.hook((g, h) => g.setHour(h), hour);
          frames.push(await capture(game, join(outDir, `wp15-${device}-${view}-${name}.png`), `${device} ${view} ${name}`));
          captions.push(`${view} · ${name}`);
        }
        game.assertClean();
        await game.close();
      }
      await sheet(browser, frames, captions, device === 'ipad' ? 344 : 390, join(outDir, `wp15-${device}-sheet.png`));
    }
  }
} finally {
  await browser.close();
  await server.close();
}

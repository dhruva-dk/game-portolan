import { join } from 'node:path';
import { mkdir, readFile } from 'node:fs/promises';
import { launch, openGame, root, serve, type DeviceName } from '../harness.ts';

const args = process.argv.slice(2);
const outDir = args.find((a) => !a.startsWith('--')) ?? join(root, 'out/shots');
const only = args.find((a) => a.startsWith('--only='))?.slice(7) ?? '';
const VIEWS: [string, Record<string, string>][] = [
  ['dawn', { view: 'deck', hour: '6.3' }],
  ['midday', { view: 'deck', hour: '12' }],
  ['golden', { view: 'deck', hour: '18.2' }],
  ['night', { view: 'deck', hour: '22.5' }],
  ['calm', { view: 'deck', region: 'Glass', calm: '1', wind: '0.2', hour: '9' }],
  ['squall', { view: 'deck', squall: '1', wind: '1.4', hour: '15' }],
  ...['rock', 'coral', 'sand', 'kelp'].map((kind): [string, Record<string, string>] => [`floor-${kind}`, { view: 'floor', kind, hour: '11' }]),
  ['wake', { view: 'wake', hour: '10' }],
  ['lane', { view: 'lane', hour: '14' }],
  ['high', { view: 'high' }],
  ['pole', { view: 'pole' }],
];
const SHOTS: { name: string; device: DeviceName; query: Record<string, string> }[] = [
  ...(['ipad', 'iphone'] as const).flatMap((device) => VIEWS.map(([name, query]) => ({ name, device, query }))),
  ...['coast', 'hull', 'seam', 'curve'].map((view) => ({ name: view, device: 'ipad' as const, query: { view } })),
];

await mkdir(outDir, { recursive: true });
const server = await serve();
const { browser, renderer } = await launch();
console.log(`renderer: ${renderer}`);
const taken: Record<string, string[]> = { ipad: [], iphone: [] };
try {
  for (const s of SHOTS) {
    const file = join(outDir, `wp13-${s.device}-${s.name}.png`);
    if (only && !file.includes(only)) continue;
    const game = await openGame(browser, `${server.url}tests/pages/sea.html`, { device: s.device, hook: '__sea', query: { clock: '12', ...s.query } });
    await game.until((g) => g.ready, undefined, 30000);
    await game.page.waitForTimeout(300);
    await game.page.screenshot({ path: file, scale: 'css' });
    game.assertClean();
    taken[s.device].push(file);
    console.log(file, JSON.stringify(await game.hook((g) => ({
      calls: g.calls, triangles: g.triangles, sea: g.seaTriangles, textureMB: Math.round(g.textureMB * 10) / 10, targetMB: Math.round(g.targetMB * 10) / 10,
    }))));
    await game.close();
  }
  for (const [device, files] of Object.entries(taken)) {
    if (!files.length) continue;
    const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
    const cells = await Promise.all(files.map(async (f) =>
      `<figure><img src="data:image/png;base64,${(await readFile(f)).toString('base64')}"><figcaption>${f.split('/').pop()}</figcaption></figure>`));
    await page.setContent(`<style>body{margin:0;display:grid;grid-template-columns:repeat(4,1fr);gap:4px;background:#222;font:12px sans-serif;color:#ddd}figure{margin:0}img{width:100%;display:block}</style>${cells.join('')}`);
    await page.screenshot({ path: join(outDir, `wp13-${device}-sheet.png`), fullPage: true });
    await page.close();
  }
} finally {
  await browser.close();
  await server.close();
}

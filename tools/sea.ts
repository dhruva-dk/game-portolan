// Shots of the sea on the Mac's GPU, to hold against the north star: `node tools/sea.ts [name=query ...]`.
// Each shot opens the page with its query (hour, yaw, pitch, dist, freeze...), waits for the frames to settle and
// saves captures/sea/<name>.png. With no shots named, the standing set is taken.
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { launch, openGame, root, serve } from './harness.ts';

const STANDING: Record<string, string> = {
  afternoon: 'hour=15.5&yaw=0.55&pitch=0.16&dist=34',
  toward: 'hour=16.2&facesun&pitch=0.12&dist=30',
  low: 'hour=17.4&facesun&pitch=0.06&dist=30',
  dusk: 'hour=18.4&yaw=2.6&pitch=0.12&dist=40',
  high: 'hour=13&yaw=0.9&pitch=0.6&dist=160',
  orbit: 'hour=14&yaw=0.9&pitch=0.9&dist=5200',
  night: 'hour=23&yaw=0.5&pitch=0.15&dist=36',
};

const args = process.argv.slice(2);
const wait = Number(args.find((a) => a.startsWith('--wait='))?.slice(7) ?? 4000);
const named = args.filter((a) => !a.startsWith('--'));
const shots = named.length ? Object.fromEntries(named.map((a) => (a.includes('=') && !STANDING[a] ? [a.split('=')[0], a.slice(a.indexOf('=') + 1)] : [a, STANDING[a]]))) : STANDING;

const out = join(root, 'captures/sea');
await mkdir(out, { recursive: true });
const server = await serve();
const { browser, renderer } = await launch();
console.log(renderer);
try {
  for (const [name, query] of Object.entries(shots)) {
    const params = Object.fromEntries(new URLSearchParams(`${query}&freeze=1&fps=0`));
    const game = await openGame(browser, server.url, { device: 'ipad', query: params, hook: '__sea', dpr: 1 });
    const errors: string[] = [];
    game.page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.text().slice(0, 400)); });
    game.page.on('pageerror', (e) => errors.push(String(e).slice(0, 400)));
    const ok = await game.page.waitForFunction(() => (window as unknown as { __sea?: { ready: boolean } }).__sea?.ready, null, { timeout: 60000 }).then(() => true, () => false);
    await game.page.waitForTimeout(wait);
    const file = join(out, `${name}.png`);
    await game.page.screenshot({ path: file });
    console.log(`${name}: ${ok ? 'ok' : 'NOT READY'} ${file}`);
    for (const e of errors.slice(0, 12)) console.log(`  ! ${e}`);
    await game.page.context().close();
  }
} finally {
  await browser.close();
  await server.close();
}

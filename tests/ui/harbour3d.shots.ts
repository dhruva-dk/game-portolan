import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEVICES, launch, openGame, root, serve, type DeviceName } from '../harness.ts';
import { harbourLayout, type Page } from '../../src/ui/cards.ts';

type Scene = { look(f: number, p: [number, number] | null, m: string[]): unknown; show(s: number): void };
const wait = (ms: number) => new Promise((done) => setTimeout(done, ms));
const mid = (t: { x: number; y: number; width: number; height: number }) => ({ x: t.x + t.width / 2, y: t.y + t.height / 2 });
const server = await serve();
const { browser } = await launch();
const shots: { name: string; png: Buffer }[] = [];
try {
  for (const dev of ['iphone', 'ipad'] as DeviceName[]) {
    const d = DEVICES[dev];
    const view = { width: d.width, height: d.height, dpr: 2, safe: d.safeArea };
    const shoot = async (g: { screenshot(file: string): Promise<unknown> }, name: string) => {
      const file = join(root, 'out/shots', `wp26c-${dev}-${name}.png`);
      await g.screenshot(file);
      shots.push({ name: `${dev} ${name}`, png: readFileSync(file) });
    };
    const game = await openGame(browser, server.url, { device: dev });
    await game.until((g) => g.screen === 'title');
    await wait(1500);
    await game.tap({ x: d.width / 2, y: d.height / 2 });
    await game.until((g) => g.screen === 'harbour');
    await wait(4500);
    await shoot(game, 'harbour');
    const home = harbourLayout(view, 'home');
    for (const p of ['shipwright', 'gull', 'league', 'captains', 'settings'] as Page[]) {
      await game.tap(mid(home.targets.find((x) => x.id === `link:${p}`)!));
      await wait(2000);
      await shoot(game, p);
      await game.tap(mid(harbourLayout(view, p).targets.find((x) => x.id === 'back')!));
      await wait(700);
    }
    await game.tap(mid(home.targets.find((x) => x.id === 'link:shipwright')!));
    await wait(1200);
    const sw = harbourLayout(view, 'shipwright');
    for (const f of sw.targets.filter((x) => x.kind === 'form')) { await game.tap(mid(f)); await wait(600); }
    await game.tap(mid(sw.targets.find((x) => x.id === 'back')!));
    await wait(3500);
    await shoot(game, 'chosen');
    await game.page.close();
    const sc = await openGame(browser, `${server.url}tests/render/harbour.html`, { device: dev, hook: '__harbour' });
    await sc.page.evaluate(() => { const h = (window as unknown as { __harbour: Scene }).__harbour; h.look(0, null, []); h.show(3); });
    await shoot(sc, 'scene-pinnace');
    await sc.page.evaluate(() => { const h = (window as unknown as { __harbour: Scene }).__harbour; h.look(3, [2, 3], ['#2a6f5e', '#3657a8', '#b8473a']); h.show(3); });
    await shoot(sc, 'scene-galleon');
    await sc.page.close();
  }
  const sheet = await browser.newPage({ viewport: { width: 1600, height: 400 }, deviceScaleFactor: 1 });
  const cell = (s: { name: string; png: Buffer }) => `<figure><img src="data:image/png;base64,${s.png.toString('base64')}"><figcaption>${s.name}</figcaption></figure>`;
  await sheet.setContent(`<style>body{margin:0;background:#efe0c0;font:13px Georgia;display:grid;grid-template-columns:repeat(4,1fr);gap:8px;padding:8px}figure{margin:0}img{width:100%;display:block}</style>${shots.map(cell).join('')}`);
  writeFileSync(join(root, 'out/shots/wp26c-sheet.png'), await sheet.screenshot({ fullPage: true }));
  console.log(`wrote ${shots.length} shots and out/shots/wp26c-sheet.png`);
} finally {
  await browser.close();
  await server.close();
}

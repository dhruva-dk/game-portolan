// WP26 shots: the title, the harbour, the shipwright, the gull, the league, the nine and the settings on the iPhone
// and the iPad, reached by touch through the real app (the targets from cards.ts), saved as progress/shots/wp26-*.png
// and gathered into the contact sheet progress/shots/wp26-sheet.png.
//   node tests/ui/harbour.shots.ts
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEVICES, launch, openGame, root, serve, type DeviceName } from '../harness.ts';
import { harbourLayout, type Page } from '../../src/ui/cards.ts';

const wait = (ms: number) => new Promise((done) => setTimeout(done, ms));
const server = await serve();
const { browser } = await launch();
const shots: { name: string; png: Buffer }[] = [];
try {
  for (const dev of ['iphone', 'ipad'] as DeviceName[]) {
    const d = DEVICES[dev];
    const view = { width: d.width, height: d.height, dpr: 2, safe: d.safeArea };
    const game = await openGame(browser, server.url, { device: dev });
    const shoot = async (name: string) => {
      const file = join(root, 'progress/shots', `wp26-${dev}-${name}.png`);
      await game.screenshot(file);
      shots.push({ name: `${dev} ${name}`, png: readFileSync(file) });
    };
    await game.until((g) => g.screen === 'title');
    await wait(3800); // Portolan letters itself in
    await shoot('title');
    await game.tap({ x: d.width / 2, y: d.height / 2 });
    await game.until((g) => g.screen === 'harbour');
    await wait(3000);
    await shoot('harbour');
    const home = harbourLayout(view, 'home');
    for (const p of ['shipwright', 'gull', 'league', 'captains', 'settings'] as Page[]) {
      const t = home.targets.find((x) => x.id === `link:${p}`)!;
      await game.tap({ x: t.x + t.width / 2, y: t.y + t.height / 2 });
      await wait(1800);
      await shoot(p);
      const back = harbourLayout(view, p).targets.find((x) => x.id === 'back')!;
      await game.tap({ x: back.x + back.width / 2, y: back.y + back.height / 2 });
      await wait(600);
    }
  }
  const sheet = await browser.newPage({ viewport: { width: 1600, height: 400 }, deviceScaleFactor: 1 });
  const cell = (s: { name: string; png: Buffer }) => `<figure><img src="data:image/png;base64,${s.png.toString('base64')}"><figcaption>${s.name}</figcaption></figure>`;
  await sheet.setContent(`<style>body{margin:0;background:#efe0c0;font:13px Georgia;display:grid;grid-template-columns:repeat(4,1fr);gap:8px;padding:8px}figure{margin:0}img{width:100%;display:block}</style>${shots.map(cell).join('')}`);
  writeFileSync(join(root, 'progress/shots/wp26-sheet.png'), await sheet.screenshot({ fullPage: true }));
  console.log(`wrote ${shots.length} shots and progress/shots/wp26-sheet.png`);
} finally {
  await browser.close();
  await server.close();
}

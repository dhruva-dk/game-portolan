// WP30 part C: A9's budget over the standard views (tests/render/budget.html): the zoom's stops, each region from the
// deck, low along its shore, high over its coast and from orbit, and a ten-ship battle, on both devices. Prints a
// compact table (draws and triangles per device, the heaviest modules); every view must keep within 150 draws and
// 420k triangles (A9 is 200 / 500k: the rest is headroom). BUDGET_OUT=<file.json> writes the table; BUDGET_SHOTS=<dir>
// saves each deck and shore view there and, with BUDGET_BASE=<dir> from an earlier run, prints each one's pixel
// difference (mean over the frame, over its lower 40 % where the near field is, and the share of pixels that moved).
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { launch, openGame, serve, type DeviceName, type Launched, type Server } from '../harness.ts';

const TRIS = 420000, CALLS = 150;
type Row = { calls: number; tris: number; mods: Record<string, number>; z: number; alt: number };

let server: Server, launched: Launched;
before(async () => { server = await serve(); launched = await launch(); });
after(async () => { await launched.browser.close(); await server.close(); });

async function diff(a: string, b: string): Promise<{ all: number; near: number; moved: number }> {
  const url = async (f: string) => `data:image/png;base64,${(await readFile(f)).toString('base64')}`;
  const page = await launched.browser.newPage();
  const r = await page.evaluate(async ([a, b]) => {
    const load = (src: string) => new Promise<HTMLImageElement>((ok) => { const i = new Image(); i.onload = () => ok(i); i.src = src; });
    const px = (i: HTMLImageElement) => {
      const c = document.createElement('canvas');
      c.width = i.width; c.height = i.height;
      const g = c.getContext('2d')!;
      g.drawImage(i, 0, 0);
      return g.getImageData(0, 0, i.width, i.height).data;
    };
    const [ia, ib] = await Promise.all([load(a), load(b)]), da = px(ia), db = px(ib), W = ia.width, H = ia.height;
    let all = 0, near = 0, nn = 0, moved = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const k = (y * W + x) * 4, d = (Math.abs(da[k] - db[k]) + Math.abs(da[k + 1] - db[k + 1]) + Math.abs(da[k + 2] - db[k + 2])) / 3;
      all += d;
      if (d > 24) moved++;
      if (y > H * 0.6) { near += d; nn++; }
    }
    return { all: all / (W * H), near: near / nn, moved: moved / (W * H) };
  }, [await url(a), await url(b)]);
  await page.close();
  return r;
}

test('every standard view within 150 draws and 420k triangles on both devices (WP30 part C)', async () => {
  const rows = new Map<string, Partial<Record<DeviceName, Row>>>(), shots = process.env.BUDGET_SHOTS, base = process.env.BUDGET_BASE;
  if (shots) await mkdir(shots, { recursive: true });
  for (const device of ['iphone', 'ipad'] as DeviceName[]) {
    const game = await openGame(launched.browser, `${server.url}tests/render/budget.html`, { device, hook: '__budget' });
    await game.until((g) => g.ready, undefined, 240000);
    const views = await game.page.evaluate(() => (window as unknown as { __budget: { views(): string[] } }).__budget.views());
    for (const name of views) {
      const r = await game.page.evaluate((n) => (window as unknown as { __budget: { measure(n: string): Row } }).__budget.measure(n), name);
      rows.set(name, { ...rows.get(name), [device]: r });
      if (shots && /^(deck|shore|battle)/.test(name)) await game.page.screenshot({ path: join(shots, `${device}-${name.replace(/[^a-z0-9.]+/g, '-')}.png`), scale: 'css' });
    }
    game.assertClean();
    await game.page.close();
  }
  const k = (n: number) => `${(n / 1000).toFixed(0)}k`, over: string[] = [];
  console.log('view                       | iPhone draws tris | iPad draws tris | heaviest modules (iPad)');
  for (const [name, r] of rows) {
    const p = r.iphone!, d = r.ipad!;
    const top = Object.entries(d.mods).slice(0, 4).map(([m, t]) => `${m} ${k(t)}`).join(', ');
    const label = name.startsWith('zoom') ? `${name} z${d.z.toFixed(2)} ${d.alt.toFixed(0)}u` : name;
    console.log(`${label.padEnd(26)} | ${String(p.calls).padStart(5)} ${k(p.tris).padStart(6)}      | ${String(d.calls).padStart(5)} ${k(d.tris).padStart(6)}    | ${top}`);
    for (const [dev, x] of [['iphone', p], ['ipad', d]] as const) if (x.calls > CALLS || x.tris > TRIS) over.push(`${dev} ${name}: ${x.calls} draws, ${x.tris} tris`);
  }
  if (process.env.BUDGET_OUT) await writeFile(process.env.BUDGET_OUT, JSON.stringify(Object.fromEntries(rows), null, 1));
  if (shots && base) {
    for (const device of ['iphone', 'ipad']) for (const name of rows.keys()) {
      const f = `${device}-${name.replace(/[^a-z0-9.]+/g, '-')}.png`;
      if (!existsSync(join(base, f)) || !existsSync(join(shots, f))) continue;
      const r = await diff(join(base, f), join(shots, f));
      console.log(`diff ${f}: mean ${r.all.toFixed(2)}, near ${r.near.toFixed(2)}, moved ${(r.moved * 100).toFixed(2)} %`);
    }
  }
  assert.deepEqual(over, [], `views over ${CALLS} draws or ${TRIS / 1000}k triangles`);
});

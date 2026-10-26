import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CDPSession, Page } from 'playwright';
import { DEVICES, launch, root, serve } from '../harness.ts';

mkdirSync(join(root, 'out/shots'), { recursive: true });

type P = [number, number];
interface Tick { at: number; steer: number; sail: number; flags: number; consumable: number; aim: number; course: number }
interface Touch { at: number; phase: string; x: number; y: number }
interface Btn { kind: string; x: number; y: number }
interface Lay { buttons: Btn[]; stick: { x: number; y: number; width: number; height: number }; view: { width: number; height: number } }
type Win = any;

const server = await serve();
const { browser, gpu, renderer } = await launch();
if (!gpu) { console.error(`hud.touch: FAIL: no GPU WebGL (${renderer}); refusing to time touches under software rendering`); await browser.close(); await server.close(); process.exit(2); }
console.log(`renderer: ${renderer}`);
const lines: string[] = [];
let failed = 0;
const say = (l: string): void => { lines.push(l); console.log(l); };
const check = (name: string, ok: boolean, info = ''): void => { say(`${ok ? 'ok  ' : 'FAIL'} ${name}${info ? ` (${info})` : ''}`); if (!ok) failed++; };
const pts = (ps: P[]) => ps.map(([x, y], i) => ({ x, y, id: i, radiusX: 3, radiusY: 3, force: 1 }));

async function open(dev: 'iphone' | 'ipad', dpr: number): Promise<{ page: Page; cdp: CDPSession }> {
  const d = DEVICES[dev], s = d.safeArea;
  const context = await browser.newContext({ viewport: { width: d.width, height: d.height }, screen: { width: d.width, height: d.height }, deviceScaleFactor: dpr, isMobile: true, hasTouch: true });
  await context.addInitScript(() => {
    const p = { touches: [], ticks: [], raw: [] as { at: number; x: number; type: string }[] };
    (window as Win).__wp25 = p;
    for (const type of ['touchstart', 'touchmove', 'touchend']) {
      addEventListener(type, (e) => { const t = (e as TouchEvent).changedTouches[0]; p.raw.push({ at: e.timeStamp, x: t ? t.clientX : 0, type }); if (p.raw.length > 600) p.raw.splice(0, 300); }, { capture: true, passive: true });
    }
  });
  const page = await context.newPage();
  page.on('pageerror', (e) => console.error(dev, 'pageerror', e.message));
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: s.top, topMax: s.top, right: s.right, rightMax: s.right, bottom: s.bottom, bottomMax: s.bottom, left: s.left, leftMax: s.left } });
  await page.goto(`${server.url}/`);
  await page.waitForFunction(() => !!(window as Win).__portolan, null, { timeout: 180_000 });
  await page.waitForFunction(() => { try { (window as Win).__portolan.startMatch({ seed: 7 }); return true; } catch { return false; } }, null, { timeout: 300_000, polling: 1000 });
  await page.waitForFunction(() => { const p = (window as Win).__wp25; return !!p.layout && p.ticks.length > 30; }, null, { timeout: 300_000 });
  return { page, cdp };
}

const send = (cdp: CDPSession, type: 'touchStart' | 'touchMove' | 'touchEnd', ps: P[]) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts(ps) });
const frames = (page: Page, n: number): Promise<unknown> => page.evaluate((k) => new Promise((r) => { let i = 0; const f = (): void => { if (++i >= k) r(0); else requestAnimationFrame(f); }; requestAnimationFrame(f); }), Math.max(1, Math.round(n)));
async function stroke(page: Page, cdp: CDPSession, path: P[], ms: number): Promise<void> {
  const per = Math.max(1, Math.round(ms / 16.7 / path.length));
  await send(cdp, 'touchStart', [path[0]!]);
  await frames(page, per);
  for (let i = 1; i < path.length; i++) { await send(cdp, 'touchMove', [path[i]!]); await frames(page, per); }
  await send(cdp, 'touchEnd', []);
  await frames(page, 2);
}
const tap = (page: Page, cdp: CDPSession, p: P, ms = 60) => stroke(page, cdp, [p, p], ms);
const isOpen = (page: Page): Promise<boolean> => page.evaluate(() => (window as Win).__wp25.chartOpen());
async function closeChart(page: Page, cdp: CDPSession, W: number): Promise<void> {
  for (let k = 0; k < 3 && (await isOpen(page)); k++) {
    await tap(page, cdp, [W * 0.5, 10], 40);
    await page.waitForFunction(() => !(window as Win).__wp25.chartOpen(), null, { timeout: 10_000 }).catch(() => {});
  }
  await frames(page, 60);
}
const now = (page: Page): Promise<number> => page.evaluate(() => performance.now());
const since = (page: Page, t0: number): Promise<Tick[]> => page.evaluate((t) => (window as Win).__wp25.ticks.filter((k: Tick) => k.at >= t), t0);

async function suite(page: Page, cdp: CDPSession, tag: string): Promise<void> {
  const L: Lay = await page.evaluate(() => (window as Win).__wp25.layout);
  const W = L.view.width, H = L.view.height, S = L.stick;
  const s0: P = [S.x + S.width * 0.45, S.y + S.height * 0.55];
  const btn = (k: string): P => { const q = L.buttons.find((b) => b.kind === k)!; return [q.x, q.y]; };
  await closeChart(page, cdp, W);
  check(`${tag} compact chart mounted in its slot`, await page.evaluate(() => { const c = document.querySelector('canvas.compact-chart') as HTMLElement | null; return !!c && c.style.display !== 'none' && c.getBoundingClientRect().width > 40; }));
  const lat: number[] = [];
  for (let i = 0; i < 8; i++) {
    const dir = i % 2 ? -1 : 1;
    await send(cdp, 'touchStart', [s0]);
    await frames(page, 3);
    for (let k = 1; k <= 6; k++) { await send(cdp, 'touchMove', [[s0[0] + dir * 10 * k, s0[1]]]); await frames(page, 1); }
    await frames(page, 9);
    const r: { touches: Touch[]; ticks: Tick[] } = await page.evaluate(() => { const p = (window as Win).__wp25; return { touches: p.raw.slice(-16).map((q: { at: number; x: number; type: string }) => ({ at: q.at, x: q.x, y: 0, phase: q.type === 'touchstart' ? 'down' : q.type === 'touchmove' ? 'move' : 'up' })), ticks: p.ticks.slice(-90) }; });
    await send(cdp, 'touchEnd', []);
    await frames(page, 12);
    const di = r.touches.map((t) => t.phase).lastIndexOf('down'), x0 = r.touches[di]?.x ?? s0[0];
    const first = r.touches.slice(di).find((t) => t.phase === 'move' && Math.abs(t.x - x0) >= 8);
    const tick = first && r.ticks.find((k) => k.at >= first.at && k.steer !== 0 && Math.sign(k.steer) === dir);
    if (first && tick) lat.push(tick.at - first.at);
  }
  const gap: number = await page.evaluate(() => new Promise<number>((res) => { const t: number[] = []; const f = (x: number): void => { t.push(x); if (t.length < 61) requestAnimationFrame(f); else { const d = t.slice(1).map((v, i) => v - t[i]!).sort((a, b) => a - b); res(d[30]!); } }; requestAnimationFrame(f); }));
  lat.sort((a, b) => a - b);
  const med = lat[lat.length >> 1] ?? NaN, max = lat[lat.length - 1] ?? NaN;
  check(`${tag} steer (stick on the ${S.x > W / 3 ? 'right' : 'left'} half)`, lat.length >= 6, `${lat.length}/8`);
  say(`     latency touch→ShipInput: median ${med.toFixed(1)} ms, max ${max.toFixed(1)} ms; frame here ${gap.toFixed(1)} ms = ${(med / gap).toFixed(2)} frames; ${(med / (1000 / 60)).toFixed(2)} frames at 60 fps`);
  let t0 = await now(page);
  await stroke(page, cdp, [s0, [s0[0], s0[1] - 15], [s0[0], s0[1] - 35], [s0[0], s0[1] - 55]], 80);
  await frames(page, 24);
  check(`${tag} flick up (break off / sail up)`, (await since(page, t0)).some((k) => k.sail !== 0 || k.flags !== 0));
  await frames(page, 72);
  t0 = await now(page);
  await stroke(page, cdp, [s0, [s0[0], s0[1] + 15], [s0[0], s0[1] + 35], [s0[0], s0[1] + 55]], 80);
  await frames(page, 24);
  check(`${tag} sail step (flick down)`, (await since(page, t0)).some((k) => k.sail !== 0));
  t0 = await now(page); await tap(page, cdp, btn('aimed')); await frames(page, 21);
  check(`${tag} fire (aimed fitting tap)`, (await since(page, t0)).some((k) => k.flags !== 0 || k.aim >= 0));
  t0 = await now(page); await tap(page, cdp, btn('gull')); await frames(page, 21);
  check(`${tag} gull call (tap)`, (await since(page, t0)).some((k) => k.flags !== 0));
  const g = btn('gull');
  t0 = await now(page); await stroke(page, cdp, [g, [g[0] + (W / 2 - g[0]) * 0.3, g[1] - 40], [W * 0.5, H * 0.6], [W * 0.5, H * 0.64]], 320);
  check(`${tag} gull dive (drag onto the sea)`, (await since(page, t0)).some((k) => k.aim >= 0));
  t0 = await now(page); await tap(page, cdp, btn('c0')); await frames(page, 21);
  check(`${tag} consumable`, (await since(page, t0)).some((k) => k.consumable === 0));
  t0 = await now(page); await send(cdp, 'touchStart', [btn('home')]); await frames(page, 36);
  const held = await since(page, t0); await send(cdp, 'touchEnd', []); await frames(page, 12);
  check(`${tag} head home (held)`, held.some((k) => k.flags !== 0));
  const a: P = [S.x + S.width * 0.35, S.y + S.height * 0.5], b: P = [S.x + S.width * 0.6, S.y + S.height * 0.5];
  t0 = await now(page);
  await send(cdp, 'touchStart', [a]); await frames(page, 3); await send(cdp, 'touchStart', [a, b]);
  for (let k = 1; k <= 8; k++) { await send(cdp, 'touchMove', [[a[0] - 6 * k, a[1]], [b[0] + 6 * k, b[1]]]); await frames(page, 2); }
  await send(cdp, 'touchEnd', []); await frames(page, 18);
  check(`${tag} pinch never steers`, (await since(page, t0)).every((k) => k.steer === 0));
  await closeChart(page, cdp, W);
  t0 = await now(page);
  await tap(page, cdp, btn('chart'));
  await page.waitForFunction(() => (window as Win).__wp25.chartOpen(), null, { timeout: 8000 }).catch(() => {});
  check(`${tag} chart opens (tap the compact chart)`, await isOpen(page));
  await frames(page, 150);
  await stroke(page, cdp, [[W * 0.5, H * 0.5], [W * 0.54, H * 0.46], [W * 0.58, H * 0.42], [W * 0.62, H * 0.4], [W * 0.66, H * 0.37], [W * 0.7, H * 0.35]], 420);
  await frames(page, 9);
  await tap(page, cdp, [W * 0.5, 10]);
  await page.waitForFunction(() => !(window as Win).__wp25.chartOpen(), null, { timeout: 10_000 }).catch(() => {});
  check(`${tag} chart closes (tap the edge band)`, !(await page.evaluate(() => (window as Win).__wp25.chartOpen())));
  await frames(page, 150);
  const ct = await since(page, t0), n = ct.find((k) => k.course > 0)?.course ?? 0;
  check(`${tag} course drawn → ShipInput.course`, n > 0, `${n} cells`);
  check(`${tag} course kept by the validator (ship.course)`, (await page.evaluate(() => (window as Win).__wp25.course())) > 0);
  await closeChart(page, cdp, W);
}

async function shot(page: Page, name: string): Promise<Buffer> {
  await frames(page, 90);
  const png = await page.screenshot({ timeout: 240_000 });
  writeFileSync(join(root, 'out/shots', `${name}.png`), png);
  return png;
}
const left = (page: Page, on: boolean) => page.evaluate(async (v) => { const m = await import('/src/ui/settings.ts' as string); await m.setSettings({ leftHanded: v }); }, on);

const shots: { name: string; png: Buffer }[] = [];
try {
  const only = (process.env.WP25_DEVS ?? 'iphone,ipad').split(',');
  for (const [dev, dpr] of [['iphone', 3], ['ipad', 2]] as const) {
    if (!only.includes(dev)) continue;
    const { page, cdp } = await open(dev, dpr);
    await suite(page, cdp, dev);
    await left(page, true); await frames(page, 48);
    await suite(page, cdp, `${dev} left-handed`);
    shots.push({ name: `wp25b-${dev}-left`, png: await shot(page, `wp25b-${dev}-left`) });
    await left(page, false);
    shots.push({ name: `wp25b-${dev}-hud`, png: await shot(page, `wp25b-${dev}-hud`) });
    const Lr = await page.evaluate(() => (window as Win).__wp25.layout), c = Lr.compass, sl = Lr.sail;
    const x0 = Math.max(0, c.x - c.r - 24), y0 = Math.max(0, c.y - c.r - 24);
    const rose = await page.screenshot({ clip: { x: x0, y: y0, width: sl.x + sl.width + 24 - x0, height: 2 * c.r + 48 } });
    writeFileSync(join(root, 'out/shots', `wp25b-${dev}-rose.png`), rose);
    await page.context().close();
  }
  const sheet = await browser.newPage({ viewport: { width: 1400, height: 400 }, deviceScaleFactor: 1 });
  const cell = (s: { name: string; png: Buffer }) => `<figure><img src="data:image/png;base64,${s.png.toString('base64')}"><figcaption>${s.name}</figcaption></figure>`;
  await sheet.setContent(`<style>body{margin:0;background:#efe0c0;font:13px Georgia;display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:8px}figure{margin:0}img{width:100%;display:block}</style>${shots.map(cell).join('')}`);
  writeFileSync(join(root, 'out/shots/wp25b-sheet.png'), await sheet.screenshot({ fullPage: true }));
} finally {
  console.log(failed ? `${failed} FAILED` : 'all touch tests passed');
  await browser.close();
  await server.close();
}
process.exit(failed ? 1 : 0);

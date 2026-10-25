// WP25 part B: touch tests through the real app (headless Chromium, touch emulation through CDP
// Input.dispatchTouchEvent; the match screen's window.__wp25 probe logs each touch and each tick's ShipInput): steer,
// sail step, fire, gull call and dive, consumable, head home, chart open / course / close, pinch never steers; the
// touch → ShipInput latency; then the HUD shots progress/shots/wp25b-*.png. node tests/ui/hud.touch.ts
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type CDPSession, type Page } from 'playwright';
import { DEVICES, root, serve } from '../harness.ts';

type P = [number, number];
interface Tick { at: number; steer: number; sail: number; flags: number; consumable: number; aim: number; course: number }
interface Touch { at: number; phase: string; x: number; y: number }
interface Btn { kind: string; x: number; y: number }
interface Lay { buttons: Btn[]; stick: { x: number; y: number; width: number; height: number }; view: { width: number; height: number } }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Win = any;

const server = await serve();
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const lines: string[] = [];
let failed = 0;
const say = (l: string): void => { lines.push(l); console.log(l); };
const check = (name: string, ok: boolean, info = ''): void => { say(`${ok ? 'ok  ' : 'FAIL'} ${name}${info ? ` (${info})` : ''}`); if (!ok) failed++; };
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const pts = (ps: P[]) => ps.map(([x, y], i) => ({ x, y, id: i, radiusX: 3, radiusY: 3, force: 1 }));

async function open(dev: 'iphone' | 'ipad', dpr: number): Promise<{ page: Page; cdp: CDPSession }> {
  const d = DEVICES[dev], s = d.safeArea;
  const context = await browser.newContext({ viewport: { width: d.width, height: d.height }, screen: { width: d.width, height: d.height }, deviceScaleFactor: dpr, isMobile: true, hasTouch: true });
  await context.addInitScript(() => { (window as Win).__wp25 = { touches: [], ticks: [] }; });
  const page = await context.newPage();
  page.on('pageerror', (e) => console.error(dev, 'pageerror', e.message));
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: s.top, topMax: s.top, right: s.right, rightMax: s.right, bottom: s.bottom, bottomMax: s.bottom, left: s.left, leftMax: s.left } });
  await page.goto(`${server.url}/`);
  await page.waitForFunction(() => !!(window as Win).__portolan, null, { timeout: 180_000 });
  // the world arrives from its worker: start the match as soon as it has
  await page.waitForFunction(() => { try { (window as Win).__portolan.startMatch({ seed: 7 }); return true; } catch { return false; } }, null, { timeout: 300_000, polling: 1000 });
  await page.waitForFunction(() => { const p = (window as Win).__wp25; return !!p.layout && p.ticks.length > 30; }, null, { timeout: 300_000 });
  return { page, cdp };
}

const send = (cdp: CDPSession, type: 'touchStart' | 'touchMove' | 'touchEnd', ps: P[]) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts(ps) });
async function stroke(cdp: CDPSession, path: P[], ms: number): Promise<void> {
  await send(cdp, 'touchStart', [path[0]!]);
  for (let i = 1; i < path.length; i++) { await wait(ms / path.length); await send(cdp, 'touchMove', [path[i]!]); }
  await wait(16);
  await send(cdp, 'touchEnd', []);
}
const tap = (cdp: CDPSession, p: P, ms = 60) => stroke(cdp, [p, p], ms);
const now = (page: Page): Promise<number> => page.evaluate(() => performance.now());
const since = (page: Page, t0: number): Promise<Tick[]> => page.evaluate((t) => (window as Win).__wp25.ticks.filter((k: Tick) => k.at >= t), t0);

async function suite(page: Page, cdp: CDPSession, tag: string): Promise<void> {
  const L: Lay = await page.evaluate(() => (window as Win).__wp25.layout);
  const W = L.view.width, H = L.view.height, S = L.stick;
  const s0: P = [S.x + S.width * 0.45, S.y + S.height * 0.55];
  const btn = (k: string): P => { const q = L.buttons.find((b) => b.kind === k)!; return [q.x, q.y]; };
  check(`${tag} compact chart mounted in its slot`, await page.evaluate(() => { const c = document.querySelector('canvas.compact-chart') as HTMLElement | null; return !!c && c.style.display !== 'none' && c.getBoundingClientRect().width > 40; }));
  // steer, eight times, alternating: the latency from the touch that leaves the dead zone to the tick that carries it
  const lat: number[] = [];
  for (let i = 0; i < 8; i++) {
    const dir = i % 2 ? -1 : 1;
    await send(cdp, 'touchStart', [s0]);
    await wait(40);
    for (let k = 1; k <= 6; k++) { await send(cdp, 'touchMove', [[s0[0] + dir * 10 * k, s0[1]]]); await wait(16); }
    await wait(150);
    const r: { touches: Touch[]; ticks: Tick[] } = await page.evaluate(() => { const p = (window as Win).__wp25; return { touches: p.touches.slice(-16), ticks: p.ticks.slice(-60) }; });
    await send(cdp, 'touchEnd', []);
    await wait(200);
    const di = r.touches.map((t) => t.phase).lastIndexOf('down'), x0 = r.touches[di]?.x ?? s0[0];
    const first = r.touches.slice(di).find((t) => t.phase === 'move' && Math.abs(t.x - x0) >= 8);
    const tick = first && r.ticks.find((k) => k.at >= first.at && k.steer !== 0 && Math.sign(k.steer) === dir);
    if (first && tick) lat.push(tick.at - first.at);
  }
  const ticks: Tick[] = await page.evaluate(() => (window as Win).__wp25.ticks.slice(-120));
  const gaps = ticks.slice(1).map((k, i) => k.at - ticks[i]!.at).sort((a, b) => a - b), gap = gaps[gaps.length >> 1] ?? 0;
  lat.sort((a, b) => a - b);
  const med = lat[lat.length >> 1] ?? NaN, max = lat[lat.length - 1] ?? NaN;
  check(`${tag} steer (stick on the ${S.x > W / 3 ? 'right' : 'left'} half)`, lat.length >= 6, `${lat.length}/8`);
  say(`     latency touch→ShipInput: median ${med.toFixed(1)} ms, max ${max.toFixed(1)} ms; tick interval here ${gap.toFixed(1)} ms; ${(med / (1000 / 60)).toFixed(2)} frames at 60 fps`);
  let t0 = await now(page);
  await stroke(cdp, [s0, [s0[0], s0[1] - 15], [s0[0], s0[1] - 35], [s0[0], s0[1] - 55]], 80); // flick up: break off the current (or a sail step)
  await wait(400);
  check(`${tag} flick up (break off / sail up)`, (await since(page, t0)).some((k) => k.sail !== 0 || k.flags !== 0));
  await wait(1200);
  t0 = await now(page);
  await stroke(cdp, [s0, [s0[0], s0[1] + 15], [s0[0], s0[1] + 35], [s0[0], s0[1] + 55]], 80);
  await wait(400);
  check(`${tag} sail step (flick down)`, (await since(page, t0)).some((k) => k.sail !== 0));
  t0 = await now(page); await tap(cdp, btn('aimed')); await wait(350);
  check(`${tag} fire (aimed fitting tap)`, (await since(page, t0)).some((k) => k.flags !== 0 || k.aim >= 0));
  t0 = await now(page); await tap(cdp, btn('gull')); await wait(350);
  check(`${tag} gull call (tap)`, (await since(page, t0)).some((k) => k.flags !== 0));
  const g = btn('gull');
  t0 = await now(page); await stroke(cdp, [g, [g[0] + (W / 2 - g[0]) * 0.3, g[1] - 40], [W * 0.5, H * 0.42], [W * 0.5, H * 0.4]], 320); await wait(350);
  check(`${tag} gull dive (drag onto the sea)`, (await since(page, t0)).some((k) => k.aim >= 0));
  t0 = await now(page); await tap(cdp, btn('c0')); await wait(350);
  check(`${tag} consumable`, (await since(page, t0)).some((k) => k.consumable === 0));
  t0 = await now(page); await send(cdp, 'touchStart', [btn('home')]); await wait(600);
  const held = await since(page, t0); await send(cdp, 'touchEnd', []); await wait(200);
  check(`${tag} head home (held)`, held.some((k) => k.flags !== 0));
  // pinch on the stick's half: two fingers, the second 40 ms after the first, spread: the camera's, never the helm's
  const a: P = [S.x + S.width * 0.35, S.y + S.height * 0.5], b: P = [S.x + S.width * 0.6, S.y + S.height * 0.5];
  t0 = await now(page);
  await send(cdp, 'touchStart', [a]); await wait(40); await send(cdp, 'touchStart', [a, b]);
  for (let k = 1; k <= 8; k++) { await send(cdp, 'touchMove', [[a[0] - 6 * k, a[1]], [b[0] + 6 * k, b[1]]]); await wait(20); }
  await send(cdp, 'touchEnd', []); await wait(300);
  check(`${tag} pinch never steers`, (await since(page, t0)).every((k) => k.steer === 0));
  if (await page.evaluate(() => (window as Win).__wp25.chartOpen())) { await tap(cdp, [W * 0.5, 10]); await wait(2000); }
  // the chart: open from the compact chart, draw a course, close on the edge band; the course reaches the ship
  t0 = await now(page);
  await tap(cdp, btn('chart'));
  await page.waitForFunction(() => (window as Win).__wp25.chartOpen(), null, { timeout: 8000 }).catch(() => {});
  check(`${tag} chart opens (tap the compact chart)`, await page.evaluate(() => (window as Win).__wp25.chartOpen()));
  await wait(2500);
  await stroke(cdp, [[W * 0.5, H * 0.5], [W * 0.54, H * 0.46], [W * 0.58, H * 0.42], [W * 0.62, H * 0.4], [W * 0.66, H * 0.37], [W * 0.7, H * 0.35]], 420);
  await wait(150);
  await tap(cdp, [W * 0.5, 10]);
  await page.waitForFunction(() => !(window as Win).__wp25.chartOpen(), null, { timeout: 10_000 }).catch(() => {});
  check(`${tag} chart closes (tap the edge band)`, !(await page.evaluate(() => (window as Win).__wp25.chartOpen())));
  await wait(2500);
  const ct = await since(page, t0), n = ct.find((k) => k.course > 0)?.course ?? 0;
  check(`${tag} course drawn → ShipInput.course`, n > 0, `${n} cells`);
  check(`${tag} course kept by the validator (ship.course)`, (await page.evaluate(() => (window as Win).__wp25.course())) > 0);
}

async function shot(page: Page, name: string): Promise<Buffer> {
  await wait(1500);
  const png = await page.screenshot({ timeout: 240_000 });
  writeFileSync(join(root, 'progress/shots', `${name}.png`), png);
  return png;
}
const left = (page: Page, on: boolean) => page.evaluate(async (v) => { const m = await import('/src/ui/settings.ts' as string); await m.setSettings({ leftHanded: v }); }, on);

const shots: { name: string; png: Buffer }[] = [];
try {
  const only = (process.env.WP25_DEVS ?? 'iphone,ipad').split(',');
  for (const [dev, dpr] of [['iphone', 3], ['ipad', 2]] as const) {
    if (!only.includes(dev)) continue;
    const { page, cdp } = await open(dev, dpr);
    await page.evaluate(() => (window as Win).__portolan.pinRenderScale(0.34)); // swiftshader: keep the ticks near real time for the suite
    await suite(page, cdp, dev);
    await left(page, true); await wait(800);
    await suite(page, cdp, `${dev} left-handed`);
    await page.evaluate(() => (window as Win).__portolan.pinRenderScale(null));
    shots.push({ name: `wp25b-${dev}-left`, png: await shot(page, `wp25b-${dev}-left`) });
    await left(page, false);
    shots.push({ name: `wp25b-${dev}-hud`, png: await shot(page, `wp25b-${dev}-hud`) });
    await page.context().close();
  }
  const sheet = await browser.newPage({ viewport: { width: 1400, height: 400 }, deviceScaleFactor: 1 });
  const cell = (s: { name: string; png: Buffer }) => `<figure><img src="data:image/png;base64,${s.png.toString('base64')}"><figcaption>${s.name}</figcaption></figure>`;
  await sheet.setContent(`<style>body{margin:0;background:#efe0c0;font:13px Georgia;display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:8px}figure{margin:0}img{width:100%;display:block}</style>${shots.map(cell).join('')}`);
  writeFileSync(join(root, 'progress/shots/wp25b-sheet.png'), await sheet.screenshot({ fullPage: true }));
} finally {
  console.log(failed ? `${failed} FAILED` : 'all touch tests passed');
  await browser.close();
  await server.close();
}
process.exit(failed ? 1 : 0);

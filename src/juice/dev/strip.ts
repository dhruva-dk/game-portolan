// Frame strips of the juice bench, for tuning and for the reviewer: a contact sheet of frames across a moment, a
// timing chart of every channel at 60 Hz, and the effect log.
//
//   node src/juice/dev/strip.ts <recipe or sequence>... [--device ipad|iphone] [--frames 24] [--every 2] [--pre 2]
//                               [--light day|dusk] [--crop centre] [--thumb 0.25] [--cols 6] [--out <dir>]
//
// Frames are taken every `every` 60 Hz frames; `pre` frames come before the event. `--crop centre` keeps the middle
// of the screen at full size (for hit markers). Writes <out>/<name>-<device>.png and .log.txt.
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DEVICES, launch, serve, type DeviceName } from '../../../tests/harness.ts';

const argv = process.argv.slice(2);
const opts: Record<string, string> = {};
const names: string[] = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i].startsWith('--')) opts[argv[i].slice(2)] = argv[++i];
  else names.push(argv[i]);
}
const device = (opts.device ?? 'ipad') as DeviceName;
const frames = Number(opts.frames ?? 24);
const every = Number(opts.every ?? 2);
const pre = Number(opts.pre ?? 2);
const light = opts.light ?? 'day';
const crop = opts.crop ?? '';
const thumb = Number(opts.thumb ?? (crop ? 0.6 : 0.25));
const cols = Number(opts.cols ?? 6);
const out = opts.out ?? join(tmpdir(), 'portolan-juice-strips');
const extra = opts.query ?? '';
if (!names.length) {
  console.log('usage: node src/juice/dev/strip.ts <recipe>... [--device ipad|iphone] [--frames n] [--every n] [--light dusk] [--crop centre]');
  process.exit(1);
}

interface State { gameT: number; realT: number; scale: number; shake: number; rumble: number; fov: number; roll: number; pitch: number; add: number; tint: number; vig: number }
type Hook = { ready: boolean; play(n: string): void; step(dt?: number): void; state(): State; log(): string; clear(): void };
const hook = () => (window as unknown as { __juice: Hook }).__juice;

const server = await serve();
const { browser, renderer } = await launch();
console.log(`renderer: ${renderer}`);
const dev = DEVICES[device];
const ctx = await browser.newContext({ viewport: { width: dev.width, height: dev.height }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.error('page error:', e.message));
page.on('console', (m) => m.type() === 'error' && console.error('console:', m.text()));
await mkdir(out, { recursive: true });

const clip = crop === 'centre' ? { x: dev.width / 2 - 260, y: dev.height / 2 - 190, width: 520, height: 380 } : undefined;

for (const name of names) {
  await page.goto(`${server.url}dev/juice.html?strip=1&clean=1&light=${light}${extra ? '&' + extra : ''}`);
  await page.waitForFunction(() => (window as unknown as { __juice?: { ready: boolean } }).__juice?.ready);
  await page.evaluate(`(${hook})().step(1/60)`);
  await page.evaluate((src) => {
    const h = (0, eval)(src)();
    for (let i = 0; i < 30; i++) h.step(1 / 60);
    h.clear();
  }, `(${hook})`);
  const shots: { img: string; f: number; st: State }[] = [];
  const curve: State[] = [];
  let f = -pre * every;
  for (let c = 0; c < frames; c++) {
    if (c === pre) {
      await page.evaluate(([src, n]) => (0, eval)(src)().play(n), [`(${hook})`, name] as const);
    }
    const steps = c === 0 ? 0 : c === pre ? 1 : every;
    const sts = await page.evaluate(
      ([src, k]) => {
        const h = (0, eval)(src)();
        const r = [];
        for (let i = 0; i < k; i++) {
          h.step(1 / 60);
          r.push(h.state());
        }
        return r.length ? r : [h.state()];
      },
      [`(${hook})`, steps] as const,
    );
    curve.push(...(steps ? sts : []));
    if (c === pre) f = 0;
    else if (c > 0) f += every;
    const buf = await page.screenshot({ type: 'jpeg', quality: 82, clip });
    shots.push({ img: buf.toString('base64'), f, st: sts[sts.length - 1] });
  }
  const log = await page.evaluate((src) => (0, eval)(src)().log(), `(${hook})`);
  const w = Math.round((clip?.width ?? dev.width) * thumb), h = Math.round((clip?.height ?? dev.height) * thumb);
  const label = (s: { f: number; st: State }) =>
    `f${s.f >= 0 ? '+' : ''}${s.f} · ${Math.round((s.f * 1000) / 60)}ms · ×${s.st.scale.toFixed(2)} · shake ${(s.st.shake ** 2).toFixed(2)}${s.st.rumble > 0 ? ' rum ' + (s.st.rumble ** 2).toFixed(2) : ''} · fov ${s.st.fov.toFixed(1)} · fl ${Math.max(s.st.add, s.st.tint).toFixed(2)} · vg ${s.st.vig.toFixed(2)}`;
  const W = cols * (w + 6) + 10;
  const chart = chartSvg(curve, W - 20, 150);
  const html = `<html><body style="margin:0;background:#111;color:#ddd;font:12px ui-monospace,Menlo,monospace;padding:8px 5px">
    <div style="font:700 16px system-ui;margin:0 5px 6px">${name} · ${dev.label} · ${light} · every ${every} frames (${Math.round((every * 1000) / 60)} ms)</div>
    <div style="margin:0 5px 8px">${chart}</div>
    <div style="display:grid;grid-template-columns:repeat(${cols},${w}px);gap:6px">${shots
      .map((s) => `<div><img src="data:image/jpeg;base64,${s.img}" style="width:${w}px;height:${h}px;display:block;${s.f === 0 ? 'outline:2px solid #ff0' : ''}"><div style="font-size:${w < 300 ? 9 : 11}px;line-height:1.3;padding:2px 0">${label(s)}</div></div>`)
      .join('')}</div></body></html>`;
  const sheet = await ctx.newPage();
  await sheet.setViewportSize({ width: W, height: 400 });
  await sheet.setContent(html);
  const file = join(out, `${name}-${device}${light === 'dusk' ? '-dusk' : ''}${crop ? '-' + crop : ''}`);
  await sheet.screenshot({ path: `${file}.png`, fullPage: true });
  await sheet.close();
  await writeFile(`${file}.log.txt`, log + '\n');
  console.log(`${file}.png`);
}

await browser.close();
await server.close();

/** Every channel over time, one 60 Hz sample per point. */
function chartSvg(c: State[], w: number, h: number): string {
  const series: [string, string, (s: State) => number][] = [
    ['time scale', '#ffffff', (s) => s.scale],
    ['shake (trauma²)', '#ff9b3d', (s) => s.shake ** 2],
    ['rumble', '#ffe066', (s) => s.rumble ** 2],
    ['fov ±10°', '#4fc3ff', (s) => 0.5 - s.fov / 20],
    ['flash', '#ff7ad9', (s) => Math.max(s.add, s.tint)],
    ['vignette', '#ff4a4a', (s) => s.vig],
  ];
  const n = Math.max(2, c.length);
  const x = (i: number) => (i / (n - 1)) * w;
  const y = (v: number) => 6 + (1 - Math.max(0, Math.min(1, v))) * (h - 26);
  const ticks = Array.from({ length: Math.floor(n / 6) + 1 }, (_, i) => i * 6)
    .map((i) => `<line x1="${x(i)}" x2="${x(i)}" y1="6" y2="${h - 20}" stroke="#333"/><text x="${x(i) + 2}" y="${h - 22}" fill="#666" font-size="9">${Math.round((i * 1000) / 60)}</text>`)
    .join('');
  const paths = series
    .map(([, col, f]) => `<polyline fill="none" stroke="${col}" stroke-width="1.6" points="${c.map((s, i) => `${x(i).toFixed(1)},${y(f(s)).toFixed(1)}`).join(' ')}"/>`)
    .join('');
  const legend = series.map(([name, col], i) => `<text x="${8 + i * 140}" y="${h - 4}" fill="${col}" font-size="11">${name}</text>`).join('');
  return `<svg width="${w}" height="${h}" style="background:#1b1b1b;border-radius:6px">${ticks}${paths}${legend}</svg>`;
}

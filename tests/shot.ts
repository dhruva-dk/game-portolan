// Browser harness for the acceptance checks and captures, and a one-off screenshot tool:
//   node tests/shot.ts --out shot.png [--url http://localhost:5173] [--seed 1] [--hour 17.5]
//     [--cam '{"dist":22,"yaw":0,"pitch":0.3}'] [--advance 20] [--wait 3] [--w 1512] [--h 945] [--dpr 2]
//     [--eval "js run in the page after ready"] [--headed]
// The tool talks to a running dev server (npm start); prints console errors and warnings and the frame rate.
import { chromium, type Browser, type Page } from 'playwright';
import { createServer, build, preview } from 'vite';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import type { Sim } from '../src/sim.ts';

const root = fileURLToPath(new URL('..', import.meta.url));

/** Serve the game on a free port: the dev server, or a production build previewed from a temp dir. */
export async function serve(production = false): Promise<{ url: string; close: () => Promise<void> }> {
  if (!production) {
    const server = await createServer({ root, logLevel: 'warn', server: { port: 0, hmr: false, watch: null } });
    await server.listen();
    return { url: server.resolvedUrls!.local[0], close: () => server.close() };
  }
  const outDir = await mkdtemp(join(tmpdir(), 'ocean-planet-'));
  await build({ root, logLevel: 'warn', build: { outDir, emptyOutDir: true } });
  const server = await preview({ root, logLevel: 'warn', build: { outDir }, preview: { port: 0 } });
  return {
    url: server.resolvedUrls!.local[0],
    close: async () => {
      await server.close();
      await rm(outDir, { recursive: true, force: true });
    },
  };
}

/** Chromium on the real GPU (ANGLE over Metal on macOS). */
export function launch(headed = false): Promise<Browser> {
  return chromium.launch({
    headless: !headed,
    args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
  });
}

export interface Opened {
  page: Page;
  errors: string[]; // console errors and uncaught exceptions
  warnings: string[];
  external: string[]; // requests that left the page's origin
}

/** Wait until the game runs and the loading screen (the only element besides the canvas) has left. */
export async function playing(page: Page): Promise<void> {
  await page.waitForFunction(() => (window as any).__game?.ready && !document.querySelector('body > div'), null, { timeout: 180_000 });
}

/** Open the game and wait until it is playing (or, with ready = false, only until its hooks exist). */
export async function open(
  browser: Browser, url: string, { seed = 1, w = 1512, h = 945, dpr = 2, ready = true } = {},
): Promise<Opened> {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: dpr });
  const origin = new URL(url).origin;
  const errors: string[] = [], warnings: string[] = [], external: string[] = [];
  page.on('console', (m) => (m.type() === 'error' ? errors : m.type() === 'warning' ? warnings : []).push(m.text()));
  page.on('pageerror', (e) => errors.push(`${e.message}\n${e.stack}`));
  page.on('request', (r) => /^https?:/.test(r.url()) && new URL(r.url()).origin !== origin && external.push(r.url()));
  await page.goto(new URL(`?seed=${seed}`, url).href);
  if (ready) await playing(page);
  else await page.waitForFunction(() => (window as any).__game, null, { timeout: 180_000 });
  return { page, errors, warnings, external };
}

/**
 * A scripted captain for ship 0: it crosses its territory, runs out a few ship lengths, comes about
 * and steers back for its home port, so a run lays trails and closes loops. It reads only public ship
 * state and is self-contained, so a page can rebuild it from its source text.
 */
export function loopPilot(): (sim: Sim) => number {
  let outTicks = 0, legs = 0;
  return (sim) => {
    const s = sim.ships[0];
    if (!s.trail.length) {
      if (outTicks) legs++;
      outTicks = 0;
      return 0;
    }
    if (++outTicks < 60 + (legs % 3) * 30) return 0;
    // bearing of home in the ship's frame (port = up × fwd)
    const { pos: p, fwd: f, home: h } = s;
    const px = p.y * f.z - p.z * f.y, py = p.z * f.x - p.x * f.z, pz = p.x * f.y - p.y * f.x;
    const dx = h.x - p.x, dy = h.y - p.y, dz = h.z - p.z;
    let bearing = Math.atan2(dx * px + dy * py + dz * pz, dx * f.x + dy * f.y + dz * f.z);
    if (Math.abs(bearing) > 2.6) bearing = legs % 2 ? -Math.abs(bearing) : Math.abs(bearing);
    return Math.max(-1, Math.min(1, bearing * 2.2 - s.turn * 0.4));
  };
}

if (import.meta.main) {
  const { values: a } = parseArgs({
    options: {
      url: { type: 'string', default: 'http://localhost:5173' },
      out: { type: 'string', default: 'shot.png' },
      seed: { type: 'string', default: '1' },
      hour: { type: 'string' },
      cam: { type: 'string' },
      advance: { type: 'string', default: '0' },
      wait: { type: 'string', default: '3' },
      w: { type: 'string', default: '1512' },
      h: { type: 'string', default: '945' },
      dpr: { type: 'string', default: '2' },
      eval: { type: 'string' },
      headed: { type: 'boolean', default: false },
    },
  });
  const browser = await launch(a.headed);
  const { page, errors, warnings } = await open(browser, a.url!, { seed: +a.seed!, w: +a.w!, h: +a.h!, dpr: +a.dpr! });
  await page.evaluate(
    ({ hour, cam, advance, js }) => {
      const g = (window as any).__game;
      if (hour !== undefined) g.setHour(+hour);
      if (cam) g.setCamera(JSON.parse(cam));
      if (+advance) g.advance(+advance);
      if (js) (0, eval)(js);
    },
    { hour: a.hour, cam: a.cam, advance: a.advance, js: a.eval },
  );
  await page.waitForTimeout(+a.wait! * 1000);
  await page.screenshot({ path: a.out });
  const fps = await page.evaluate(() => (window as any).__game.fps());
  console.log(`saved ${a.out}  fps≈${fps.toFixed(1)}`);
  for (const e of [...errors, ...warnings].slice(0, 30)) console.log(e);
  await browser.close();
}

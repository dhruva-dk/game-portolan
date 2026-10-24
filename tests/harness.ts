// The browser harness every test and capture runs on: Chromium on the Mac's GPU, the game served by Vite,
// the supported devices emulated with touch and safe areas, a console that must stay clean, scripted touch
// gestures, waits on the game's debug hook, and CPU throttling.
//
//   const server = await serve();                       // or serve({ production: true }) for the built game
//   const { browser, renderer, gpu } = await launch();
//   const game = await openGame(browser, server.url, { device: 'iphone', query: { seed: 1 } });
//   await game.until((g) => g.ready);                   // g is window.__portolan
//   await game.drag({ x: 150, y: 300 }, { x: 150, y: 220 });
//   await game.screenshot('shots/iphone.png');
//   game.assertClean();                                 // no console errors, warnings, or network requests
import { chromium, type Browser, type CDPSession, type Page } from 'playwright';
import { createServer, build, preview } from 'vite';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = fileURLToPath(new URL('..', import.meta.url));

/** A supported device in landscape, as the game sees it inside the app: the whole screen, in CSS px. */
export interface Device {
  label: string;
  width: number;
  height: number;
  dpr: number;
  /** env(safe-area-inset-*) in landscape, as measured in the app on the iOS 26 Simulator (status bar hidden). */
  safeArea: { top: number; right: number; bottom: number; left: number };
  /** The iOS Simulator device type with the same screen, used by tests/ios.ts. */
  simulator: string;
}

/**
 * The devices every test and capture runs on, and the only place they are defined. Each matches an App Store
 * screenshot size, so every capture is ready for the store page, and the two span the supported range:
 * - iphone: iPhone 17 Pro Max, 2868×1320 px, the 6.9" size the App Store requires. Dynamic Island on the left or
 *   right edge, home indicator below.
 * - ipad: iPad Pro 13-inch (M5), 2752×2064 px, the largest supported iPad (the 13" size the App Store requires)
 *   and the resolution acceptance check 6 measures at. No notch; home indicator below.
 */
export const DEVICES = {
  iphone: {
    label: 'iPhone 17 Pro Max',
    width: 956,
    height: 440,
    dpr: 3,
    safeArea: { top: 0, right: 62, bottom: 20, left: 62 },
    simulator: 'com.apple.CoreSimulator.SimDeviceType.iPhone-17-Pro-Max',
  },
  ipad: {
    label: 'iPad Pro 13-inch (M5)',
    width: 1376,
    height: 1032,
    dpr: 2,
    safeArea: { top: 0, right: 0, bottom: 25, left: 0 },
    simulator: 'com.apple.CoreSimulator.SimDeviceType.iPad-Pro-13-inch-M5-12GB',
  },
} satisfies Record<string, Device>;

export type DeviceName = keyof typeof DEVICES;

export interface Server {
  url: string;
  close: () => Promise<void>;
}

/** Serve the game on a free port: the Vite dev server, or (production) a fresh build previewed from a temp dir. */
export async function serve({ production = false } = {}): Promise<Server> {
  if (!production) {
    const server = await createServer({ root, logLevel: 'warn', server: { port: 0, hmr: false, watch: null } });
    await server.listen();
    return { url: server.resolvedUrls!.local[0], close: () => server.close() };
  }
  const outDir = await mkdtemp(join(tmpdir(), 'portolan-build-'));
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

// Chromium on the real GPU: ANGLE over Metal. Headless Chromium otherwise falls back to SwiftShader, about ten
// times slower. Audio may start without a gesture, as it does in the app's web view.
const GPU_ARGS = ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'];
const SOFTWARE_ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
const COMMON_ARGS = ['--autoplay-policy=no-user-gesture-required'];

export interface Launched {
  browser: Browser;
  renderer: string; // the WebGL renderer string
  gpu: boolean; // false when only software rendering (SwiftShader) could be had
}

/** Launch Chromium with WebGL 2 on the GPU, falling back to SwiftShader (with a warning) if the GPU is unavailable. */
export async function launch({ headed = false } = {}): Promise<Launched> {
  for (const args of [GPU_ARGS, SOFTWARE_ARGS]) {
    const browser = await chromium.launch({ headless: !headed, args: [...args, ...COMMON_ARGS] });
    const page = await browser.newPage();
    const renderer = await webglRenderer(page);
    await page.close();
    const gpu = !!renderer && !/SwiftShader|llvmpipe|Software/i.test(renderer);
    if (gpu || (renderer && args === SOFTWARE_ARGS)) {
      if (!gpu) console.warn(`harness: no GPU WebGL, falling back to ${renderer}`);
      return { browser, renderer: renderer!, gpu };
    }
    await browser.close();
  }
  throw new Error('harness: Chromium has no WebGL 2, not even SwiftShader');
}

/** The unmasked WebGL 2 renderer string of a page, or null without WebGL 2. */
export function webglRenderer(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (!gl) return null;
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return renderer;
  });
}

export interface Point {
  x: number;
  y: number;
}

/** A finger on the screen: a stable id while it stays down, and its position in CSS px. */
export interface Finger extends Point {
  id: number;
}

export interface OpenOptions {
  device?: DeviceName;
  /** Search parameters for the game's URL, e.g. { seed: 1 }. */
  query?: Record<string, string | number | boolean>;
  /** The global the game exposes for tests. */
  hook?: string;
}

/** Open the game on an emulated device: viewport, pixel ratio, touch, landscape, and safe areas. */
export async function openGame(browser: Browser, url: string, options: OpenOptions = {}): Promise<Game> {
  const device: Device = DEVICES[options.device ?? 'ipad'];
  const context = await browser.newContext({
    viewport: { width: device.width, height: device.height },
    screen: { width: device.width, height: device.height },
    deviceScaleFactor: device.dpr,
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  const { top, right, bottom, left } = device.safeArea;
  await cdp.send('Emulation.setSafeAreaInsetsOverride', {
    insets: { top, topMax: top, right, rightMax: right, bottom, bottomMax: bottom, left, leftMax: left },
  });
  const target = new URL(url);
  for (const [k, v] of Object.entries(options.query ?? {})) target.searchParams.set(k, String(v));
  const game = new Game(page, cdp, device, options.hook ?? '__portolan', target.origin);
  await page.goto(target.href);
  return game;
}

/** A game page on an emulated device, with everything it logs and requests recorded. */
export class Game {
  readonly page: Page;
  readonly cdp: CDPSession;
  readonly device: Device;
  readonly hookName: string;
  readonly errors: string[] = []; // console errors and uncaught exceptions
  readonly warnings: string[] = [];
  readonly requests: string[] = []; // requests that left the page's origin, or failed: the game runs offline
  #fingers: Finger[] = [];

  constructor(page: Page, cdp: CDPSession, device: Device, hookName: string, origin: string) {
    this.page = page;
    this.cdp = cdp;
    this.device = device;
    this.hookName = hookName;
    page.on('console', (m) => {
      const where = m.location().url ? ` (${m.location().url}:${m.location().lineNumber})` : '';
      if (m.type() === 'error') this.errors.push(m.text() + where);
      else if (m.type() === 'warning') this.warnings.push(m.text() + where);
    });
    page.on('pageerror', (e) => this.errors.push(`${e.message}\n${e.stack}`));
    page.on('request', (r) => {
      const u = new URL(r.url());
      if (/^https?:$/.test(u.protocol) && u.origin !== origin) this.requests.push(r.url());
    });
    page.on('requestfailed', (r) => this.requests.push(`failed: ${r.url()} ${r.failure()?.errorText ?? ''}`));
  }

  /** Everything that must not happen: console errors and warnings, uncaught exceptions, stray requests. */
  problems(): string[] {
    return [
      ...this.errors.map((e) => `error: ${e}`),
      ...this.warnings.map((w) => `warning: ${w}`),
      ...this.requests.map((r) => `request: ${r}`),
    ];
  }

  /** Throw if anything in problems() happened. */
  assertClean(): void {
    const p = this.problems();
    if (p.length) throw new Error(`${p.length} console/network problem(s) on ${this.device.label}:\n${p.join('\n')}`);
  }

  /** Run fn(hook, arg) in the page, where hook is the game's debug global (window.__portolan by default). */
  hook<R, A = undefined>(fn: (hook: any, arg: A) => R, arg?: A): Promise<R> {
    return this.page.evaluate(
      ({ name, src, arg }) => (0, eval)(`(${src})`)((window as any)[name], arg),
      { name: this.hookName, src: fn.toString(), arg },
    );
  }

  /** Wait until fn(hook, arg) is truthy, checked every frame; a missing hook counts as not yet. */
  async until<A = undefined>(fn: (hook: any, arg: A) => unknown, arg?: A, timeout = 60_000): Promise<void> {
    await this.page.waitForFunction(
      ({ name, src, arg }) => {
        const hook = (window as any)[name];
        return hook !== undefined && !!(0, eval)(`(${src})`)(hook, arg);
      },
      { name: this.hookName, src: fn.toString(), arg },
      { timeout, polling: 'raf' },
    );
  }

  /** Save a screenshot at the device's full pixel resolution. */
  async screenshot(path: string): Promise<Buffer> {
    await mkdir(dirname(path), { recursive: true });
    return this.page.screenshot({ path });
  }

  /** Put exactly these fingers on the screen: new ids land, missing ids lift, the rest move. */
  async touch(fingers: Finger[]): Promise<void> {
    const points = fingers.map(({ id, x, y }) => ({ id, x, y, radiusX: 6, radiusY: 6, force: 1 }));
    const landing = fingers.some((f) => !this.#fingers.some((g) => g.id === f.id));
    this.#fingers = fingers.map((f) => ({ ...f }));
    await this.cdp.send('Input.dispatchTouchEvent', {
      type: !points.length ? 'touchEnd' : landing ? 'touchStart' : 'touchMove',
      touchPoints: points,
    });
  }

  /**
   * Fingers that land together, each follow a path (two or more points, or one to hold still) over `ms`
   * milliseconds of real time, one move per frame, and lift together. Fingers already held with touch() stay down.
   */
  async gesture(paths: Point[][], ms = 250): Promise<void> {
    const held = this.#fingers;
    const at = (path: Point[], t: number): Point => {
      const s = t * (path.length - 1), i = Math.min(Math.floor(s), path.length - 2);
      if (i < 0) return path[0];
      const f = s - i;
      return { x: path[i].x + (path[i + 1].x - path[i].x) * f, y: path[i].y + (path[i + 1].y - path[i].y) * f };
    };
    const fingers = (t: number) => paths.map((p, k) => ({ id: 1000 + k, ...at(p, t) }));
    await this.touch([...held, ...fingers(0)]);
    const steps = Math.max(1, Math.round(ms / 16));
    for (let i = 1; i <= steps; i++) {
      await this.page.waitForTimeout(ms / steps);
      await this.touch([...held, ...fingers(i / steps)]);
    }
    await this.touch(held);
  }

  tap(p: Point, ms = 60): Promise<void> {
    return this.gesture([[p]], ms);
  }

  drag(from: Point, to: Point, ms = 300): Promise<void> {
    return this.gesture([[from, to]], ms);
  }

  /** Two fingers either side of `center`, along `angle` (radians), spreading from one span to another (CSS px). */
  pinch(center: Point, fromSpan: number, toSpan: number, ms = 400, angle = 0): Promise<void> {
    const c = Math.cos(angle) / 2, s = Math.sin(angle) / 2;
    const end = (span: number, sign: number) => ({ x: center.x + sign * span * c, y: center.y + sign * span * s });
    return this.gesture([[end(fromSpan, -1), end(toSpan, -1)], [end(fromSpan, 1), end(toSpan, 1)]], ms);
  }

  /** Slow the CPU by `rate` (1 = off), e.g. to approximate the oldest supported device for the budgets check. */
  async throttleCPU(rate: number): Promise<void> {
    await this.cdp.send('Emulation.setCPUThrottlingRate', { rate });
  }

  close(): Promise<void> {
    return this.page.context().close();
  }
}

import { chromium, type Browser, type CDPSession, type Page } from 'playwright';
import { createServer, build, preview } from 'vite';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = fileURLToPath(new URL('..', import.meta.url));

export interface Device {
  label: string;
  width: number;
  height: number;
  dpr: number;
  safeArea: { top: number; right: number; bottom: number; left: number };
  simulator: string;
}

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

export async function serve({ production = false } = {}): Promise<Server> {
  if (!production) {
    const server = await createServer({ root, logLevel: 'warn', server: { port: 0, hmr: false, watch: null } });
    await server.listen();
    return { url: server.resolvedUrls!.local[0], close: () => server.close() };
  }
  const outDir = await mkdtemp(join(tmpdir(), 'tidefall-build-'));
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

const GPU_ARGS = ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'];
const SOFTWARE_ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
const COMMON_ARGS = ['--autoplay-policy=no-user-gesture-required'];

export interface Launched {
  browser: Browser;
  renderer: string;
  gpu: boolean;
}

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

export interface Finger extends Point {
  id: number;
}

export interface OpenOptions {
  device?: DeviceName;
  query?: Record<string, string | number | boolean>;
  hook?: string;
  /** The page under the server's root, such as 'dev/game.html'; the root page by default. */
  path?: string;
  /** Overrides the device's pixel ratio (captures use 1 to keep files small). */
  dpr?: number;
}

export async function openGame(browser: Browser, url: string, options: OpenOptions = {}): Promise<Game> {
  const device: Device = DEVICES[options.device ?? 'ipad'];
  const context = await browser.newContext({
    viewport: { width: device.width, height: device.height },
    screen: { width: device.width, height: device.height },
    deviceScaleFactor: options.dpr ?? device.dpr,
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  const { top, right, bottom, left } = device.safeArea;
  await cdp.send('Emulation.setSafeAreaInsetsOverride', {
    insets: { top, topMax: top, right, rightMax: right, bottom, bottomMax: bottom, left, leftMax: left },
  });
  const target = new URL(options.path ?? '', url);
  for (const [k, v] of Object.entries(options.query ?? {})) target.searchParams.set(k, String(v));
  const game = new Game(page, cdp, device, options.hook ?? '__portolan', target.origin);
  await page.goto(target.href);
  return game;
}

export class Game {
  readonly page: Page;
  readonly cdp: CDPSession;
  readonly device: Device;
  readonly hookName: string;
  readonly errors: string[] = [];
  readonly warnings: string[] = [];
  readonly requests: string[] = [];
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

  problems(): string[] {
    return [
      ...this.errors.map((e) => `error: ${e}`),
      ...this.warnings.map((w) => `warning: ${w}`),
      ...this.requests.map((r) => `request: ${r}`),
    ];
  }

  assertClean(): void {
    const p = this.problems();
    if (p.length) throw new Error(`${p.length} console/network problem(s) on ${this.device.label}:\n${p.join('\n')}`);
  }

  hook<R, A = undefined>(fn: (hook: any, arg: A) => R, arg?: A): Promise<R> {
    return this.page.evaluate(
      ({ name, src, arg }) => (0, eval)(`(${src})`)((window as any)[name], arg),
      { name: this.hookName, src: fn.toString(), arg },
    );
  }

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

  async screenshot(path: string): Promise<Buffer> {
    await mkdir(dirname(path), { recursive: true });
    return this.page.screenshot({ path });
  }

  async touch(fingers: Finger[]): Promise<void> {
    const points = fingers.map(({ id, x, y }) => ({ id, x, y, radiusX: 6, radiusY: 6, force: 1 }));
    const landing = fingers.some((f) => !this.#fingers.some((g) => g.id === f.id));
    this.#fingers = fingers.map((f) => ({ ...f }));
    await this.cdp.send('Input.dispatchTouchEvent', {
      type: !points.length ? 'touchEnd' : landing ? 'touchStart' : 'touchMove',
      touchPoints: points,
    });
  }

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

  pinch(center: Point, fromSpan: number, toSpan: number, ms = 400, angle = 0): Promise<void> {
    const c = Math.cos(angle) / 2, s = Math.sin(angle) / 2;
    const end = (span: number, sign: number) => ({ x: center.x + sign * span * c, y: center.y + sign * span * s });
    return this.gesture([[end(fromSpan, -1), end(toSpan, -1)], [end(fromSpan, 1), end(toSpan, 1)]], ms);
  }

  async throttleCPU(rate: number): Promise<void> {
    await this.cdp.send('Emulation.setCPUThrottlingRate', { rate });
  }

  close(): Promise<void> {
    return this.page.context().close();
  }
}

// What every capture shares: a server and a browser, the game page opened with its test hook, numbered frames written
// to captures/<name>/, the effect log beside them, and a contact sheet that tiles the frames into one PNG.
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import type { Browser } from 'playwright';
import { launch, openGame, root, serve, type DeviceName, type Game, type Server } from '../harness.ts';

export const CAPTURES = join(root, 'captures');

/** The page that runs the new app. */
export const APP_PAGE = 'dev/game.html';

export interface Rig {
  server: Server;
  browser: Browser;
  gpu: boolean;
  renderer: string;
  close(): Promise<void>;
}

export async function rig(headed = false): Promise<Rig> {
  const server = await serve();
  const { browser, gpu, renderer } = await launch({ headed });
  return {
    server, browser, gpu, renderer,
    close: async () => { await browser.close(); await server.close(); },
  };
}

export interface OpenAppOptions {
  device?: DeviceName;
  dpr?: number;
  query?: Record<string, string | number | boolean>;
}

/** Opens the app in capture mode (no title wait, a clean career, the loop driven by the hook) and waits for it. */
export async function openApp(r: Rig, o: OpenAppOptions = {}): Promise<Game> {
  const game = await openGame(r.browser, r.server.url, {
    device: o.device ?? 'ipad', dpr: o.dpr ?? 1, path: APP_PAGE, query: { capture: 1, ...o.query },
  });
  await game.until((h) => h.ready, undefined, 180_000);
  return game;
}

export class Shots {
  readonly dir: string;
  readonly frames: { file: string; label: string }[] = [];

  private constructor(dir: string) {
    this.dir = dir;
  }

  /** A fresh captures/<name>/ directory. */
  static async create(name: string): Promise<Shots> {
    const dir = join(CAPTURES, name);
    await rm(dir, { recursive: true, force: true });
    await mkdir(dir, { recursive: true });
    return new Shots(dir);
  }

  /** Saves the page as the next numbered frame. */
  async shot(game: Game, label: string, file?: string): Promise<string> {
    const name = file ?? `${String(this.frames.length).padStart(3, '0')}-${slug(label)}.png`;
    const path = join(this.dir, name);
    await game.page.screenshot({ path });
    this.frames.push({ file: path, label });
    return path;
  }

  async json(name: string, data: unknown): Promise<void> {
    await writeFile(join(this.dir, name), JSON.stringify(data, null, 2) + '\n');
  }

  async text(name: string, data: string): Promise<void> {
    await writeFile(join(this.dir, name), data);
  }

  /** Tiles every frame into contact.png. */
  async sheet(browser: Browser, columns = 4, labels = true): Promise<string> {
    return contactSheet(browser, this.frames, join(this.dir, 'contact.png'), columns, labels);
  }
}

export const slug = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);

/** Lays out frames as a grid of thumbnails with their labels, in a throwaway page, and screenshots it. */
export async function contactSheet(
  browser: Browser, frames: readonly { file: string; label: string }[], out: string, columns = 4, labels = true, thumb = 440,
): Promise<string> {
  const page = await browser.newPage({ deviceScaleFactor: 1, viewport: { width: columns * (thumb + 8) + 8, height: 200 } });
  try {
    const cells: string[] = [];
    for (const f of frames) {
      const b64 = (await readFile(f.file)).toString('base64');
      const caption = labels ? `<figcaption>${escape(f.label)}</figcaption>` : `<figcaption>${escape(basename(f.file, '.png').slice(0, 3))}</figcaption>`;
      cells.push(`<figure><img src="data:image/png;base64,${b64}">${caption}</figure>`);
    }
    await page.setContent(`<!doctype html><style>
      body { margin: 0; padding: 8px; background: #1b1d22; font: 13px/1.3 -apple-system, system-ui, sans-serif; color: #e8e4da; }
      main { display: grid; grid-template-columns: repeat(${columns}, ${thumb}px); gap: 8px; }
      figure { margin: 0; } img { width: ${thumb}px; display: block; border-radius: 3px; }
      figcaption { padding: 3px 2px 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    </style><main>${cells.join('')}</main>`);
    await page.waitForFunction(() => [...document.images].every((i) => i.complete));
    await page.screenshot({ path: out, fullPage: true });
  } finally {
    await page.close();
  }
  return out;
}

const escape = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** Deterministic shuffle for the blind test, so a seed gives the same order every time. */
export function shuffle<T>(items: readonly T[], seed: number): T[] {
  const a = items.slice();
  let s = seed >>> 0 || 1;
  const next = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 0x100000000);
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const log = (msg: string): void => console.log(`capture: ${msg}`);

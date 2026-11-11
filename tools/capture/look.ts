// How a frame looks against the committed one (tools/baselines/looks/<name>.png): both shrunk to 344 × 258 and cut
// into a 16 × 12 grid, the mean colour difference (0–255) of each cell. Rain, gulls and spray differ run to run, so
// a frame is judged by its worst cell against a tolerance: a lost effect (foam gone, a lantern dark) moves a cell by
// tens; noise by a few.
//
// With `save` the frame becomes the baseline (stored at half size).
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Browser } from 'playwright';
import { log } from './common.ts';

const LOOKS = join(import.meta.dirname, '..', 'baselines', 'looks');
/** A cell further off than this, on average over its pixels, fails the look. */
export const TOLERANCE = 14;

export interface Look {
  name: string;
  /** Mean difference over the whole frame. */
  mean: number;
  /** The worst cell, as column, row (from the top left) and its difference. */
  worst: { col: number; row: number; diff: number };
  ok: boolean;
}

export async function look(browser: Browser, shot: string, name: string, save = false): Promise<Look | null> {
  const baseline = join(LOOKS, `${name}.png`);
  const page = await browser.newPage();
  try {
    const png = (await readFile(shot)).toString('base64');
    if (save || !existsSync(baseline)) {
      const half: string = await page.evaluate(async (src) => {
        const img = new Image();
        img.src = `data:image/png;base64,${src}`;
        await img.decode();
        const c = document.createElement('canvas');
        c.width = img.width >> 1;
        c.height = img.height >> 1;
        const g = c.getContext('2d')!;
        g.imageSmoothingQuality = 'high';
        g.drawImage(img, 0, 0, c.width, c.height);
        return c.toDataURL('image/png').split(',')[1];
      }, png);
      await mkdir(dirname(baseline), { recursive: true });
      await writeFile(baseline, Buffer.from(half, 'base64'));
      log(`look ${name}: ${save ? 'saved' : 'no baseline yet, saved'} ${baseline}`);
      return null;
    }
    const base = (await readFile(baseline)).toString('base64');
    const r = await page.evaluate(async ([a, b]) => {
      const W = 344, H = 258, COLS = 16, ROWS = 12;
      const pixels = async (src: string) => {
        const img = new Image();
        img.src = `data:image/png;base64,${src}`;
        await img.decode();
        const c = document.createElement('canvas');
        c.width = W;
        c.height = H;
        const g = c.getContext('2d', { willReadFrequently: true })!;
        g.imageSmoothingQuality = 'high';
        g.drawImage(img, 0, 0, W, H);
        return g.getImageData(0, 0, W, H).data;
      };
      const [p, q] = [await pixels(a), await pixels(b)];
      const sums = new Float64Array(COLS * ROWS), counts = new Float64Array(COLS * ROWS);
      let total = 0;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        const d = (Math.abs(p[i] - q[i]) + Math.abs(p[i + 1] - q[i + 1]) + Math.abs(p[i + 2] - q[i + 2])) / 3;
        const k = Math.min(ROWS - 1, Math.floor((y * ROWS) / H)) * COLS + Math.min(COLS - 1, Math.floor((x * COLS) / W));
        sums[k] += d;
        counts[k]++;
        total += d;
      }
      let worst = 0;
      for (let k = 1; k < sums.length; k++) if (sums[k] / counts[k] > sums[worst] / counts[worst]) worst = k;
      return { mean: total / (W * H), col: worst % COLS, row: Math.floor(worst / COLS), diff: sums[worst] / counts[worst] };
    }, [png, base] as const);
    const result: Look = {
      name, mean: +r.mean.toFixed(1), worst: { col: r.col, row: r.row, diff: +r.diff.toFixed(1) }, ok: r.diff <= TOLERANCE,
    };
    log(`look ${name}: mean ${result.mean}, worst cell (${r.col}, ${r.row}) ${result.worst.diff} of ${TOLERANCE}${result.ok ? '' : '  DIFFERENT'}`);
    return result;
  } finally {
    await page.close();
  }
}

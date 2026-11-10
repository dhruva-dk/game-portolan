// Packs the land's scans for the GPU ahead of time. Each scan's albedo, height, normal, roughness and occlusion are
// composed into the two textures the land samples (src/render/land/scans.ts):
//   surface  the albedo (sRGB) and the height (linear, in alpha), for colour and for blending one layer into the next
//   detail   the normal's x and y (OpenGL convention), the roughness and the ambient occlusion, all linear
// each with its whole chain of mips, and every mip is encoded as ASTC 4×4 by Arm's encoder into public/scans/, which
// the build ships and git ignores. On the GPU a scan then takes a byte a texel rather than four, and is written into
// its slot as it arrives, with nothing to decode.
//
// The maps are read at the scan's size by a headless browser, so they are resized as the game always resized them.
// Only scans whose maps (or this file) changed since they were last packed are packed again. The vite config runs
// this before every build and dev server.
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import type { Browser } from 'playwright';
import { encodeAstc, mipChain } from './astc.ts';

const HERE = fileURLToPath(import.meta.url);
const ROOT = join(dirname(HERE), '..');
const SIZE = 1024;

const mtime = async (f: string): Promise<number> => (await stat(f).catch(() => null))?.mtimeMs ?? -1;

/** Packs every scan whose packing is missing or older than its maps. */
export async function packScans(): Promise<void> {
  const { SCANS } = await import('../src/render/land/library.ts');
  const self = Math.max(await mtime(HERE), await mtime(join(dirname(HERE), 'astc.ts')));
  const stale: typeof SCANS = [];
  for (const s of SCANS) {
    const out = join(ROOT, 'public', 'scans', s.key);
    const done = Math.min(await mtime(`${out}.surface.astc`), await mtime(`${out}.detail.astc`));
    const maps = Object.values(s.maps).filter(Boolean) as string[];
    const newest = Math.max(self, ...(await Promise.all(maps.map((m) => mtime(join(ROOT, 'public', m))))));
    if (done < newest) stale.push(s);
  }
  if (!stale.length) return;
  console.log(`packing ${stale.length} scans for the GPU`);

  const { chromium } = await import('playwright');
  const browser: Browser = await chromium.launch({ headless: true });
  const work = await mkdtemp(join(tmpdir(), 'portolan-scans-'));
  try {
    const page = await browser.newPage();
    const origin = 'https://scans.invalid/';
    await page.route(`${origin}**`, async (route) => {
      const path = decodeURIComponent(new URL(route.request().url()).pathname.slice(1));
      if (!path) return route.fulfill({ body: '<!doctype html>', contentType: 'text/html' });
      try {
        await route.fulfill({ body: await readFile(join(ROOT, 'public', path)), contentType: 'image/jpeg' });
      } catch {
        await route.fulfill({ status: 404 });
      }
    });
    await page.goto(origin);
    for (const s of stale) {
      // each map read at the scan's size, as one RGBA image each
      const read = async (url: keyof typeof s.maps): Promise<Uint8Array> => Buffer.from(await page.evaluate(async ([u, size]) => {
        const res = await fetch(u as string);
        if (!res.ok) throw new Error(`${u}: ${res.status}`);
        const b = await createImageBitmap(await res.blob(), { colorSpaceConversion: 'none', premultiplyAlpha: 'none', resizeWidth: size as number, resizeHeight: size as number, resizeQuality: 'high' });
        const canvas = new OffscreenCanvas(size as number, size as number);
        const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
        ctx.drawImage(b, 0, 0, size as number, size as number);
        const data = ctx.getImageData(0, 0, size as number, size as number).data;
        let bin = '';
        for (let i = 0; i < data.length; i += 0x8000) bin += String.fromCharCode(...data.subarray(i, i + 0x8000));
        return btoa(bin);
      }, [s.maps[url], SIZE] as const), 'base64');
      const a = await read('albedo'), n = await read('normal'), r = await read('roughness'), o = await read('ao');
      const h = s.maps.displacement ? await read('displacement') : null;
      const surface = new Uint8Array(SIZE * SIZE * 4), detail = new Uint8Array(SIZE * SIZE * 4);
      for (let i = 0; i < SIZE * SIZE; i++) {
        const p = i * 4;
        surface[p] = a[p]; surface[p + 1] = a[p + 1]; surface[p + 2] = a[p + 2];
        surface[p + 3] = h ? h[p] : 128;
        detail[p] = n[p]; detail[p + 1] = n[p + 1]; detail[p + 2] = r[p]; detail[p + 3] = o[p];
      }
      const out = join(ROOT, 'public', 'scans', s.key);
      await mkdir(dirname(out), { recursive: true });
      await writeFile(`${out}.surface.astc`, await encodeAstc(mipChain(surface, SIZE, SIZE, [true, true, true, false]), true, work, join(ROOT, 'node_modules', '.bin', 'astcenc')));
      await writeFile(`${out}.detail.astc`, await encodeAstc(mipChain(detail, SIZE, SIZE, [false, false, false, false]), false, work, join(ROOT, 'node_modules', '.bin', 'astcenc')));
      console.log(`  ${s.key}`);
    }
  } finally {
    await browser.close();
    await rm(work, { recursive: true, force: true });
  }
}

if (process.argv[1] === HERE) await packScans();

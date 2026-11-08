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
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import type { Browser } from 'playwright';

const run = promisify(execFile);
const HERE = fileURLToPath(import.meta.url);
const ROOT = join(dirname(HERE), '..');
const SIZE = 1024;

const TO_LINEAR = new Float32Array(256).map((_, i) => {
  const c = i / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
});
const TO_SRGB = new Uint8Array(4096).map((_, i) => {
  const l = i / 4095;
  const c = l <= 0.0031308 ? l * 12.92 : 1.055 * Math.pow(l, 1 / 2.4) - 0.055;
  return Math.round(Math.min(Math.max(c, 0), 1) * 255);
});

/** Halves an RGBA image, averaging each 2×2 block; channels flagged sRGB are averaged as light. */
function halve(src: Uint8Array, size: number, srgb: readonly boolean[]): Uint8Array {
  const h = size >> 1, out = new Uint8Array(h * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < h; x++) {
    const a = ((2 * y) * size + 2 * x) * 4, b = a + 4, c = a + size * 4, d = c + 4, o = (y * h + x) * 4;
    for (let k = 0; k < 4; k++) {
      if (srgb[k]) {
        const l = (TO_LINEAR[src[a + k]] + TO_LINEAR[src[b + k]] + TO_LINEAR[src[c + k]] + TO_LINEAR[src[d + k]]) * 0.25;
        out[o + k] = TO_SRGB[Math.round(l * 4095)];
      } else out[o + k] = (src[a + k] + src[b + k] + src[c + k] + src[d + k] + 2) >> 2;
    }
  }
  return out;
}

function chain(top: Uint8Array, size: number, srgb: readonly boolean[]): Uint8Array[] {
  const out = [top];
  for (let s = size; s > 1; s >>= 1) out.push(halve(out[out.length - 1], s, srgb));
  return out;
}

/** An uncompressed 32-bit TGA, top row first: what the encoder reads. */
function tga(rgba: Uint8Array, size: number): Uint8Array {
  const out = new Uint8Array(18 + rgba.length);
  out[2] = 2;
  out[12] = size & 255; out[13] = size >> 8;
  out[14] = size & 255; out[15] = size >> 8;
  out[16] = 32;
  out[17] = 0x28;
  for (let i = 0; i < rgba.length; i += 4) {
    out[18 + i] = rgba[i + 2]; out[19 + i] = rgba[i + 1]; out[20 + i] = rgba[i]; out[21 + i] = rgba[i + 3];
  }
  return out;
}

/** Every mip encoded, one after the next, without the encoder's headers. */
async function encode(mips: Uint8Array[], srgb: boolean, work: string): Promise<Uint8Array> {
  const bin = join(ROOT, 'node_modules', '.bin', 'astcenc');
  const parts: Uint8Array[] = [];
  for (let level = 0; level < mips.length; level++) {
    const size = SIZE >> level, src = join(work, `${level}.tga`), dst = join(work, `${level}.astc`);
    await writeFile(src, tga(mips[level], size));
    await run(bin, [srgb ? '-cs' : '-cl', src, dst, '4x4', '-medium', '-silent']);
    parts.push((await readFile(dst)).subarray(16));
  }
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}

const mtime = async (f: string): Promise<number> => (await stat(f).catch(() => null))?.mtimeMs ?? -1;

/** Packs every scan whose packing is missing or older than its maps. */
export async function packScans(): Promise<void> {
  const { SCANS } = await import('../src/render/land/library.ts');
  const self = await mtime(HERE);
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
      await writeFile(`${out}.surface.astc`, await encode(chain(surface, SIZE, [true, true, true, false]), true, work));
      await writeFile(`${out}.detail.astc`, await encode(chain(detail, SIZE, [false, false, false, false]), false, work));
      console.log(`  ${s.key}`);
    }
  } finally {
    await browser.close();
    await rm(work, { recursive: true, force: true });
  }
}

if (process.argv[1] === HERE) await packScans();

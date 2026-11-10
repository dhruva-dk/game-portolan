// Packs the selected opaque photographs at native size. Outputs are sibling .astc files, copied by Vite like scans.
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { PHOTOGRAPHS, type Photograph } from '../src/render/gpu/photographs.ts';
import { encodeAstc, mipChain } from './astc.ts';

const HERE = fileURLToPath(import.meta.url), ROOT = join(dirname(HERE), '..');
const mtime = async (file: string): Promise<number> => (await stat(file).catch(() => null))?.mtimeMs ?? -1;

export async function packPhotographs(photographs: readonly Photograph[] = PHOTOGRAPHS): Promise<void> {
  const implementation = Math.max(...await Promise.all([HERE, join(dirname(HERE), 'astc.ts'), join(ROOT, 'src/render/gpu/photographs.ts')].map(mtime)));
  const stale: Photograph[] = [];
  for (const p of photographs) {
    const input = join(ROOT, 'public', p.file), output = input.replace(/\.jpg$/, '.astc');
    if (await mtime(output) < Math.max(await mtime(input), implementation)) stale.push(p);
  }
  if (!stale.length) return;
  console.log(`packing ${stale.length} opaque photographs for the GPU`);
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: true });
  const work = await mkdtemp(join(tmpdir(), 'portolan-photographs-'));
  try {
    const page = await browser.newPage(), origin = 'https://photographs.invalid/';
    await page.route(`${origin}**`, async (route) => {
      const path = decodeURIComponent(new URL(route.request().url()).pathname.slice(1));
      if (!path) return route.fulfill({ body: '<!doctype html>', contentType: 'text/html' });
      try { await route.fulfill({ body: await readFile(join(ROOT, 'public', path)), contentType: 'image/jpeg' }); }
      catch { await route.fulfill({ status: 404 }); }
    });
    await page.goto(origin);
    for (const p of stale) {
      const image = await page.evaluate(async (url) => {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`${url}: ${response.status}`);
        const bitmap = await createImageBitmap(await response.blob(), { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
        const { width, height } = bitmap;
        const canvas = new OffscreenCanvas(width, height), context = canvas.getContext('2d', { willReadFrequently: true })!;
        context.drawImage(bitmap, 0, 0);
        const data = context.getImageData(0, 0, width, height).data;
        bitmap.close();
        // TextureLoader flips photographs at upload. ASTC blocks cannot flip, so store that same orientation here.
        const flipped = new Uint8Array(data.length), row = width * 4;
        for (let y = 0; y < height; y++) flipped.set(data.subarray(y * row, (y + 1) * row), (height - 1 - y) * row);
        let binary = '';
        for (let i = 0; i < flipped.length; i += 0x8000) binary += String.fromCharCode(...flipped.subarray(i, i + 0x8000));
        return { width, height, data: btoa(binary) };
      }, p.file);
      const data = Buffer.from(image.data, 'base64');
      const mips = mipChain(data, image.width, image.height, [p.srgb, p.srgb, p.srgb, false]);
      const packed = await encodeAstc(mips, p.srgb, work, join(ROOT, 'node_modules/.bin/astcenc'), true);
      const output = join(ROOT, 'public', p.file.replace(/\.jpg$/, '.astc'));
      await mkdir(dirname(output), { recursive: true });
      await writeFile(output, packed);
      console.log(`  ${p.file} ${image.width}×${image.height}`);
    }
  } finally {
    await browser.close();
    await rm(work, { recursive: true, force: true });
  }
}

if (process.argv[1] === HERE) {
  const selected = process.argv.slice(2);
  await packPhotographs(selected.length ? PHOTOGRAPHS.filter((p) => selected.some((s) => p.file.includes(s))) : PHOTOGRAPHS);
}

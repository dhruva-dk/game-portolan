// The scan packer's colour-aware mip chain and Arm ASTC 4×4 encoding, shared by terrain and static photographs.
import { execFile } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);
const TO_LINEAR = new Float32Array(256).map((_, i) => {
  const c = i / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
});
const TO_SRGB = new Uint8Array(4096).map((_, i) => {
  const l = i / 4095;
  const c = l <= 0.0031308 ? l * 12.92 : 1.055 * Math.pow(l, 1 / 2.4) - 0.055;
  return Math.round(Math.min(Math.max(c, 0), 1) * 255);
});

export interface Mip { data: Uint8Array; width: number; height: number }

/** Every mip, averaging colour in linear light and other channels directly. Rectangles keep their native aspect. */
export function mipChain(data: Uint8Array, width: number, height: number, srgb: readonly boolean[]): Mip[] {
  const out: Mip[] = [{ data, width, height }];
  while (width > 1 || height > 1) {
    const w = Math.max(1, width >> 1), h = Math.max(1, height >> 1), next = new Uint8Array(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const a = ((2 * y) * width + 2 * x) * 4;
      const b = a + (width > 1 ? 4 : 0), c = a + (height > 1 ? width * 4 : 0), d = c + (width > 1 ? 4 : 0);
      const o = (y * w + x) * 4;
      for (let k = 0; k < 4; k++) {
        if (srgb[k]) {
          const l = (TO_LINEAR[data[a + k]] + TO_LINEAR[data[b + k]] + TO_LINEAR[data[c + k]] + TO_LINEAR[data[d + k]]) * 0.25;
          next[o + k] = TO_SRGB[Math.round(l * 4095)];
        } else next[o + k] = (data[a + k] + data[b + k] + data[c + k] + data[d + k] + 2) >> 2;
      }
    }
    data = next; width = w; height = h;
    out.push({ data, width, height });
  }
  return out;
}

function tga({ data, width, height }: Mip): Uint8Array {
  const out = new Uint8Array(18 + data.length);
  out[2] = 2;
  out[12] = width & 255; out[13] = width >> 8;
  out[14] = height & 255; out[15] = height >> 8;
  out[16] = 32; out[17] = 0x28;
  for (let i = 0; i < data.length; i += 4) {
    out[18 + i] = data[i + 2]; out[19 + i] = data[i + 1]; out[20 + i] = data[i]; out[21 + i] = data[i + 3];
  }
  return out;
}

/** Raw mip blocks for terrain; photographs also retain the first ASTC header to describe their native dimensions. */
export async function encodeAstc(mips: readonly Mip[], srgb: boolean, work: string, bin: string, header = false): Promise<Uint8Array> {
  const parts: Uint8Array[] = [];
  for (let level = 0; level < mips.length; level++) {
    const src = join(work, `${level}.tga`), dst = join(work, `${level}.astc`);
    await writeFile(src, tga(mips[level]));
    await run(bin, [srgb ? '-cs' : '-cl', src, dst, '4x4', '-medium', '-silent']);
    const encoded = await readFile(dst);
    parts.push(header && level === 0 ? encoded : encoded.subarray(16));
  }
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}

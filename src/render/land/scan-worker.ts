// Decodes one scanned material off the main thread into the two textures the land samples, each with its whole chain
// of mips, filtered here so a slot can be filled without the GPU redoing every other slot's mips:
//   surface  the albedo (sRGB) and the height (linear, in alpha), for colour and for blending one layer into the next
//   detail   the normal's x and y (OpenGL convention), the roughness and the ambient occlusion, all linear
// It also works out the scan's mean albedo (linear), roughness and height, which is what the land shows far off.
import type { MaterialMaps } from '../materials/types.ts';

export interface ScanRequest { id: number; base: string; maps: MaterialMaps; size: number }
export interface ScanResult {
  id: number;
  surface: Uint8Array[];
  detail: Uint8Array[];
  /** Mean linear albedo (rgb), roughness and height. */
  mean: [number, number, number, number, number];
  error?: string;
}

const TO_LINEAR = new Float32Array(256).map((_, i) => {
  const c = i / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
});
const TO_SRGB = new Uint8Array(4096).map((_, i) => {
  const l = i / 4095;
  const c = l <= 0.0031308 ? l * 12.92 : 1.055 * Math.pow(l, 1 / 2.4) - 0.055;
  return Math.round(Math.min(Math.max(c, 0), 1) * 255);
});

/** A map decoded straight at `size` square: decoded whole, a scan's 2048² maps held 80 MB at once in each worker. */
async function bitmap(url: string, size: number): Promise<ImageBitmap> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return createImageBitmap(await res.blob(), { colorSpaceConversion: 'none', premultiplyAlpha: 'none', resizeWidth: size, resizeHeight: size, resizeQuality: 'high' });
}

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

self.onmessage = async (e: MessageEvent<ScanRequest>) => {
  const { id, base, maps, size } = e.data;
  try {
    const canvas = new OffscreenCanvas(size, size);
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    // one map at a time, each let go as soon as its texels are read
    const read = async (url: string): Promise<Uint8ClampedArray> => {
      const b = await bitmap(base + url, size);
      ctx.clearRect(0, 0, size, size);
      ctx.drawImage(b, 0, 0, size, size);
      b.close();
      return ctx.getImageData(0, 0, size, size).data;
    };
    const a = await read(maps.albedo), n = await read(maps.normal), r = await read(maps.roughness), o = await read(maps.ao);
    const h = maps.displacement ? await read(maps.displacement) : null;
    const surface = new Uint8Array(size * size * 4), detail = new Uint8Array(size * size * 4);
    for (let i = 0; i < size * size; i++) {
      const p = i * 4;
      surface[p] = a[p]; surface[p + 1] = a[p + 1]; surface[p + 2] = a[p + 2];
      surface[p + 3] = h ? h[p] : 128;
      detail[p] = n[p]; detail[p + 1] = n[p + 1]; detail[p + 2] = r[p]; detail[p + 3] = o[p];
    }
    const s = chain(surface, size, [true, true, true, false]);
    const d = chain(detail, size, [false, false, false, false]);
    const last = s[s.length - 1], lastD = d[d.length - 1];
    const mean: ScanResult['mean'] = [TO_LINEAR[last[0]], TO_LINEAR[last[1]], TO_LINEAR[last[2]], lastD[2] / 255, last[3] / 255];
    const result: ScanResult = { id, surface: s, detail: d, mean };
    (self as unknown as Worker).postMessage(result, [...s, ...d].map((x) => x.buffer));
  } catch (err) {
    const result: ScanResult = { id, surface: [], detail: [], mean: [0.2, 0.2, 0.2, 0.8, 0.5], error: String(err) };
    (self as unknown as Worker).postMessage(result);
  }
};

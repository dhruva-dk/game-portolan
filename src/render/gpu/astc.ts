// The static photographs' complete ASTC 4×4 mip chains. Decoding and mip generation happen at build time.
import { CompressedTexture, NoColorSpace, RGBA_ASTC_4x4_Format, SRGBColorSpace, type CompressedTextureMipmap } from 'three/webgpu';

/** The first ASTC header describes the base image; the rest is raw mip blocks, ending with the 1×1 level. */
export function parseAstc(data: Uint8Array): { width: number; height: number; mipmaps: CompressedTextureMipmap[] } {
  const u24 = (at: number): number => data[at] | data[at + 1] << 8 | data[at + 2] << 16;
  if (data.length < 16 || data[0] !== 0x13 || data[1] !== 0xab || data[2] !== 0xa1 || data[3] !== 0x5c
    || data[4] !== 4 || data[5] !== 4 || data[6] !== 1 || u24(13) !== 1) throw new Error('Invalid ASTC 4×4 photograph header');
  const width = u24(7), height = u24(10);
  if (!width || !height) throw new Error('Empty ASTC photograph');
  const mipmaps: CompressedTextureMipmap[] = [];
  let at = 16, w = width, h = height;
  for (;;) {
    const bytes = Math.ceil(w / 4) * Math.ceil(h / 4) * 16;
    if (at + bytes > data.length) throw new Error('Incomplete ASTC photograph mip chain');
    mipmaps.push({ data: data.subarray(at, at + bytes), width: w, height: h });
    at += bytes;
    if (w === 1 && h === 1) break;
    w = Math.max(1, w >> 1); h = Math.max(1, h >> 1);
  }
  if (at !== data.length) throw new Error('Unexpected ASTC photograph data after final mip');
  return { width, height, mipmaps };
}

/** Like TextureLoader.load, returns the held texture immediately and publishes it only once every mip is ready. */
export function loadAstc(url: string, srgb: boolean, onLoad?: (texture: CompressedTexture) => void, onError?: (error: unknown) => void): CompressedTexture {
  const texture = new CompressedTexture([], 0, 0);
  // Three's pending-image path allocates a shared 1×1 renderable default. Keep its RGBA format until the
  // payload is ready: a compressed-format default would request an invalid ASTC render attachment.
  texture.colorSpace = srgb ? SRGBColorSpace : NoColorSpace;
  // ASTC cannot flip at upload: the packer already gives these photographs TextureLoader's vertical orientation.
  const packed = url.replace(/\.jpg(?=$|[?#])/, '.astc');
  void fetch(packed).then(async (response) => {
    if (!response.ok) throw new Error(`${packed}: ${response.status}`);
    const { width, height, mipmaps } = parseAstc(new Uint8Array(await response.arrayBuffer()));
    texture.format = RGBA_ASTC_4x4_Format;
    texture.mipmaps = mipmaps;
    texture.image = { width, height };
    texture.needsUpdate = true;
    onLoad?.(texture);
  }).catch((error: unknown) => {
    if (onError) onError(error);
    else console.error('photograph', packed, error);
  });
  return texture;
}

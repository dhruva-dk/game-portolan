import {
  ClampToEdgeWrapping,
  DataTexture,
  LinearFilter,
  RedFormat,
  UnsignedByteType,
} from 'three/webgpu';
import { DEVICES, DEVICE_BOX } from '../../world/livery.ts';
import { signedField } from './field.ts';

export const ATLAS = { tile: 96, columns: 4, spread: 4 } as const;
export const ATLAS_ROWS = Math.ceil(DEVICES.length / ATLAS.columns);

function maskOf(device: string): Uint8Array {
  const { tile } = ATLAS,
    canvas = new OffscreenCanvas(tile, tile),
    g = canvas.getContext('2d', { willReadFrequently: true });
  const inside = new Uint8Array(tile * tile);
  if (!g) return inside;
  g.scale(tile / DEVICE_BOX.size, tile / DEVICE_BOX.size);
  g.fill(new Path2D(device));
  const pixels = g.getImageData(0, 0, tile, tile).data;
  for (let i = 0; i < inside.length; i++)
    inside[i] = pixels[i * 4 + 3] >= 128 ? 1 : 0;
  return inside;
}

export function emblemAtlas(): DataTexture {
  const { tile, columns, spread } = ATLAS,
    w = tile * columns,
    h = tile * ATLAS_ROWS,
    data = new Uint8Array(w * h),
    unit = DEVICE_BOX.size / tile;
  DEVICES.forEach((device, i) => {
    const field = signedField(maskOf(device), tile, tile),
      ox = (i % columns) * tile,
      oy = Math.floor(i / columns) * tile;
    for (let y = 0; y < tile; y++)
      for (let x = 0; x < tile; x++) {
        const d = (field[y * tile + x] * unit) / spread;
        data[(oy + y) * w + ox + x] = Math.round(
          255 * Math.min(1, Math.max(0, 0.5 - d / 2))
        );
      }
  });
  const t = new DataTexture(data, w, h, RedFormat, UnsignedByteType);
  t.minFilter = t.magFilter = LinearFilter;
  t.wrapS = t.wrapT = ClampToEdgeWrapping;
  t.generateMipmaps = false;
  t.flipY = false;
  t.needsUpdate = true;
  return t;
}

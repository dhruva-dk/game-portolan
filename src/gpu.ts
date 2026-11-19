// What a system asks of the GPU in a frame. Systems build their kernels and offscreen scenes once, and each frame say
// which are due; only the frame (frame.ts) runs them, in its own order. A system never holds the renderer. And the
// tables those kernels write (storageTable).

import {
  ClampToEdgeWrapping, HalfFloatType, LinearFilter, StorageTexture,
  type Camera, type ComputeNode, type MagnificationTextureFilter, type MinificationTextureFilter, type RenderTarget, type Scene,
  type Wrapping,
} from 'three/webgpu';

/** One compute pass: a kernel, or kernels dispatched one after another within it. */
export type Compute = ComputeNode | ComputeNode[];

/** How a storage table is read: its filter (min, if given, for minification), its wrap, whether three allots it a
 *  chain of mips, and its anisotropy. */
export interface TableReads {
  filter?: MagnificationTextureFilter;
  min?: MinificationTextureFilter;
  wrap?: Wrapping;
  mipmaps?: boolean;
  anisotropy?: number;
}

/** A width × height table of half floats a kernel writes: by default read linearly, clamped at its edges, no mips. */
export function storageTable(width: number, height: number, reads: TableReads = {}): StorageTexture {
  const { filter = LinearFilter, min = filter, wrap = ClampToEdgeWrapping, mipmaps = false, anisotropy } = reads;
  const t = new StorageTexture(width, height);
  t.type = HalfFloatType;
  t.magFilter = filter;
  t.minFilter = min;
  t.wrapS = t.wrapT = wrap;
  t.generateMipmaps = mipmaps;
  if (anisotropy !== undefined) t.anisotropy = anisotropy;
  return t;
}

/**
 * A scene drawn into a target of its own, cleared first: to `clear` (0xrrggbb and an alpha) if given, else to the
 * renderer's clear colour.
 */
export interface Draw {
  scene: Scene;
  camera: Camera;
  target: RenderTarget;
  clear?: { color: number; alpha: number };
}

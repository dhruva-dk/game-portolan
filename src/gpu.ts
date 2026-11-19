// What a system asks of the GPU in a frame. Systems build their kernels and offscreen scenes once, and each frame say
// which are due; only the frame (frame.ts) runs them, in its own order. A system never holds the renderer. And what
// the systems build their passes from, made once here: the tables their kernels write (storageTable), the blends of
// what they draw over the scene (additive, premultiplied) and the quad their sprites and ribbons are drawn on.

import {
  AddEquation, BufferAttribute, ClampToEdgeWrapping, CustomBlending, HalfFloatType, LinearFilter, OneFactor, OneMinusSrcAlphaFactor,
  StorageTexture,
  type BufferGeometry, type Camera, type ComputeNode, type MagnificationTextureFilter, type Material, type MinificationTextureFilter,
  type RenderTarget, type Scene, type Wrapping,
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

/** m, its colour added to what is drawn: light (a glow, a flash) or a mark summed into a map. */
export function additive<M extends Material>(m: M): M {
  m.blending = CustomBlending;
  m.blendEquation = AddEquation;
  m.blendSrc = m.blendDst = OneFactor;
  return m;
}

/** m, its colour premultiplied by its opacity: what it covers is dimmed by its opacity, and its colour added, so one
 *  draw holds both glows (no opacity, all added) and smoke (covering). */
export function premultiplied<M extends Material>(m: M): M {
  m.blending = CustomBlending;
  m.blendEquation = AddEquation;
  m.blendSrc = OneFactor;
  m.blendDst = OneMinusSrcAlphaFactor;
  return m;
}

/** g with a square of two triangles in its xy plane: x −1…1 and y `bottom`…1 (−1, a square about its middle; 0, a
 *  ribbon from its foot). */
export function quad<G extends BufferGeometry>(g: G, bottom = -1): G {
  g.setAttribute('position', new BufferAttribute(new Float32Array([-1, bottom, 0, 1, bottom, 0, 1, 1, 0, -1, 1, 0]), 3));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  return g;
}

/**
 * A scene drawn into a target of its own, cleared first: to `clear` (0xrrggbb and an alpha) if given, else to the
 * renderer's clear colour. three draws a scene through a camera, so one is always given, even where every mesh places
 * itself in the target (water/wake.ts) and the camera is never read.
 */
export interface Draw {
  scene: Scene;
  camera: Camera;
  target: RenderTarget;
  clear?: { color: number; alpha: number };
}

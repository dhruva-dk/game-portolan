// What a system asks of the GPU in a frame. Systems build their kernels and offscreen scenes once, and each frame say
// which are due; only the frame (frame.ts) runs them, in its own order. A system never holds the renderer.

import type { Camera, ComputeNode, RenderTarget, Scene } from 'three/webgpu';

/** One compute pass: a kernel, or kernels dispatched one after another within it. */
export type Compute = ComputeNode | ComputeNode[];

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

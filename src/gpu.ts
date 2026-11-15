// What a system asks of the GPU in a frame. Systems build their kernels and offscreen scenes once, and each frame say
// which are due; only the frame (frame.ts) runs them, in its own order. A system never holds the renderer.

import { InstancedMesh, Line, Mesh, Object3D, Points, type Camera, type ComputeNode, type RenderTarget, type Scene } from 'three/webgpu';

/** Anything of three's that frees what it holds on the GPU by its own public dispose(): a texture, a render target, a
 *  buffer attribute, a node, a pipeline. */
export interface Disposable { dispose(): void }

/**
 * Frees what a system made, each by three's own dispose (a new planet's frame is built and the old one let go: main.ts):
 * under each object, every drawn thing's geometry and material(s) (an instanced mesh its instances too); anything else
 * given, itself. A texture a material samples is not the material's to free: its maker passes it here too.
 */
export function release(...held: readonly (Object3D | Disposable)[]) {
  for (const h of held) {
    if (!(h instanceof Object3D)) {
      h.dispose();
      continue;
    }
    h.traverse((o) => {
      if (!(o instanceof Mesh || o instanceof Line || o instanceof Points)) return;
      o.geometry.dispose();
      for (const m of [o.material].flat()) m.dispose();
      if (o instanceof InstancedMesh) o.dispose();
    });
  }
}

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

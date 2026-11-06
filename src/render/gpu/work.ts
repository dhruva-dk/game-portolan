// GPU work queued for the frame by things that have no renderer of their own (the actors' particles): each runs once
// a frame, after the actors have moved and before the scene is drawn, so what it computes is what the frame shows.
import type { WebGPURenderer } from 'three/webgpu';

export type FrameWork = (renderer: WebGPURenderer) => void;

const queue = new Set<FrameWork>();

/** Runs `work` every frame from now on; returns what stops it. */
export function everyFrame(work: FrameWork): () => void {
  queue.add(work);
  return () => queue.delete(work);
}

/** The stage runs the queue once a frame, before it draws. */
export function runFrameWork(renderer: WebGPURenderer): void {
  for (const w of queue) w(renderer);
}

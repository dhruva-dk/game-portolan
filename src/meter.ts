import type { WebGPURenderer } from 'three/webgpu';

/**
 * Frame cost on the device: frames per second, CPU ms, and GPU ms for render and compute work.
 * GPU times need the WebGPU 'timestamp-query' feature; without it they read '–'.
 */
export function createMeter(renderer: WebGPURenderer, el: HTMLElement) {
  const gpu = renderer.hasFeature('timestamp-query');
  let frames = 0;
  let cpu = 0;
  let render = 0;
  let compute = 0;
  let last = performance.now();

  return {
    /** Call once per frame after all GPU work has been submitted. */
    async sample(cpuMs: number) {
      frames++;
      cpu += cpuMs;
      if (gpu) {
        render += (await renderer.resolveTimestampsAsync('render')) ?? 0;
        compute += (await renderer.resolveTimestampsAsync('compute')) ?? 0;
      }
      const now = performance.now();
      if (now - last < 1000) return;
      const f = (n: number) => (n / frames).toFixed(1);
      el.textContent =
        `${Math.round((frames * 1000) / (now - last))}  cpu ${f(cpu)}` +
        (gpu ? `  gpu ${f(render)} + ${f(compute)}` : '  gpu –');
      frames = cpu = render = compute = 0;
      last = now;
    },
  };
}

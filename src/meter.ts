import type { WebGPURenderer } from 'three/webgpu';

/**
 * Frame cost on the device: frames per second, CPU ms, and GPU ms for render and compute work, each a second's mean;
 * and the last frame's draw calls and triangles (thousands).
 * GPU times need the WebGPU 'timestamp-query' feature; without it they read '–'. They are three's: the durations of a
 * frame's passes, summed. One readback is in flight at a time and gives the frame it was asked for in; the GPU means
 * are over the frames read.
 */
export function createMeter(renderer: WebGPURenderer, el: HTMLElement) {
  const gpu = renderer.hasFeature('timestamp-query');
  let frames = 0;
  let cpu = 0;
  let last = performance.now();
  let reading = false;
  let read = 0, render = 0;
  let computed = 0, compute = 0;

  async function readGPU(withCompute: boolean) {
    reading = true;
    try {
      const [r, c] = await Promise.all([renderer.resolveTimestampsAsync('render'), renderer.resolveTimestampsAsync('compute')]);
      // added on arrival, to the second being counted then: a total read before the await and written back after it
      // would undo the reset of a second that ended meanwhile, and the reading would climb without end
      render += r ?? 0;
      read++;
      if (withCompute) {
        compute += c ?? 0;
        computed++;
      }
    } finally {
      reading = false;
    }
  }

  return {
    /** Call once per frame after all GPU work has been submitted. */
    sample(cpuMs: number) {
      frames++;
      cpu += cpuMs;
      // three repeats the last duration when nothing ran, so compute counts only for a frame that had some
      if (gpu && !reading) readGPU(renderer.info.compute.frameCalls > 0);
      const now = performance.now();
      if (now - last < 1000) return;
      const f = (n: number, of: number) => (of > 0 ? (n / of).toFixed(1) : '–');
      el.textContent =
        `${Math.round((frames * 1000) / (now - last))}  cpu ${f(cpu, frames)}` +
        (gpu ? `  gpu ${f(render, read)} + ${f(compute, computed)}` : '  gpu –') +
        `  ${renderer.info.render.calls} calls ${Math.round(renderer.info.render.triangles / 1000)}k tri`;
      frames = cpu = read = render = computed = compute = 0;
      last = now;
    },
  };
}

import {
  Frustum, InspectorBase, InstancedBufferGeometry, InstancedMesh, Matrix4, Mesh, Scene, type Camera, type Object3D, type RenderTarget, type WebGPURenderer,
} from 'three/webgpu';

/**
 * Frame cost on the device: frames per second, CPU ms (the whole frame's, and the frame's render call's), GPU ms for
 * render and compute work, each a second's mean; and the draw calls, triangles (thousands) and render passes of a
 * displayed frame, a second's mean.
 * GPU times need the WebGPU 'timestamp-query' feature; without it they read '–'. They are three's: the durations of a
 * frame's passes, summed. One readback is in flight at a time and gives the frame it was asked for in; the GPU means
 * are over the frames read.
 *
 * The counts are three's (renderer.info): `render.drawCalls` and `render.triangles` are reset as each frame of the
 * animation loop begins, so read after the frame they are that frame's, every pass and every offscreen draw summed.
 * (`render.calls` is not draw calls: it counts the renderer's render() calls since it was made, and never resets.)
 * Split by pass through three's public inspector (InspectorBase: each render() call, nested ones apart: the label is
 * the scene's name, or its type, and the target's size), and each scene's by what is in it to draw (each mesh's name,
 * else its type): the meshes shown, in the camera's view if culled by it, with instances to draw, counted as three
 * draws them; what a pass draws besides (its backdrop) is the gap between the two. The means per frame over the
 * last second are in the meter's data-passes and data-objects (tools/capture.ts prints them).
 */
interface Tally { draws: number; tris: number; runs: number }

class Passes extends InspectorBase {
  readonly passes = new Map<string, Tally>();
  readonly objects = new Map<string, Tally>();
  private readonly stack: { label: string; scene: Object3D; camera: Camera; draws: number; tris: number; inner: number; innerTris: number }[] = [];
  private readonly frustum = new Frustum();
  private readonly m = new Matrix4();
  constructor(private readonly info: WebGPURenderer['info']) { super(); }

  beginRender(_uid: string, scene: Scene, camera: Camera, target: RenderTarget | null) {
    const size = target ? `${target.width}×${target.height}` : 'screen';
    this.stack.push({ label: `${scene.name || scene.type} ${size}`, scene, camera, draws: this.info.render.drawCalls, tris: this.info.render.triangles, inner: 0, innerTris: 0 });
  }

  finishRender() {
    const p = this.stack.pop();
    if (!p) return;
    const draws = this.info.render.drawCalls - p.draws, tris = this.info.render.triangles - p.tris;
    add(this.passes, p.label, draws - p.inner, tris - p.innerTris);
    if (p.scene instanceof Scene) this.contents(p.scene, p.camera, p.label.split(' ')[0]);
    const outer = this.stack[this.stack.length - 1];
    if (outer) {
      outer.inner += draws;
      outer.innerTris += tris;
    }
  }


  /** What a scene has to draw, as three culls it. */
  private contents(scene: Scene, camera: Camera, pass: string) {
    this.frustum.setFromProjectionMatrix(this.m.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    scene.traverseVisible((o) => {
      if (!(o instanceof Mesh) || (o.frustumCulled && !this.frustum.intersectsObject(o))) return;
      const g = o.geometry, n = o instanceof InstancedMesh ? o.count : g instanceof InstancedBufferGeometry ? g.instanceCount : 1;
      const count = Math.min(g.index ? g.index.count : g.getAttribute('position').count, g.drawRange.count);
      if (n > 0) add(this.objects, `${pass}/${o.name || o.type}`, 1, (n * count) / 3);
    });
  }
}

function add(map: Map<string, Tally>, key: string, draws: number, tris: number) {
  const t = map.get(key) ?? { draws: 0, tris: 0, runs: 0 };
  t.draws += draws;
  t.tris += tris;
  t.runs++;
  map.set(key, t);
}

/** A tally's lines, per frame over `frames`, the most draws first. */
const lines = (map: Map<string, Tally>, frames: number) => [...map]
  .sort((a, b) => b[1].draws - a[1].draws)
  .map(([k, t]) => `${k}: ${(t.draws / frames).toFixed(1)} draws ${(t.tris / frames / 1000).toFixed(1)}k tri ${(t.runs / frames).toFixed(2)}×`)
  .join('\n');

export function createMeter(renderer: WebGPURenderer, el: HTMLElement) {
  const gpu = renderer.hasFeature('timestamp-query');
  const info = renderer.info;
  const passes = new Passes(info);
  renderer.inspector = passes;
  let frames = 0;
  let cpu = 0, inRender = 0, draws = 0, tris = 0, renders = 0;
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
    /** Call once per frame after all GPU work has been submitted: the frame's CPU ms, and its render call's. */
    sample(cpuMs: number, renderMs: number) {
      frames++;
      cpu += cpuMs;
      inRender += renderMs;
      draws += info.render.drawCalls;
      tris += info.render.triangles;
      renders += info.render.frameCalls;
      // three repeats the last duration when nothing ran, so compute counts only for a frame that had some
      if (gpu && !reading) readGPU(info.compute.frameCalls > 0);
      const now = performance.now();
      if (now - last < 1000) return;
      const f = (n: number, of: number) => (of > 0 ? (n / of).toFixed(1) : '–');
      el.textContent =
        `${Math.round((frames * 1000) / (now - last))}  cpu ${f(cpu, frames)} (${f(inRender, frames)})` +
        (gpu ? `  gpu ${f(render, read)} + ${f(compute, computed)}` : '  gpu –') +
        `  ${Math.round(draws / frames)} draws ${Math.round(tris / frames / 1000)}k tri ${Math.round(renders / frames)} passes`;
      el.dataset.passes = lines(passes.passes, frames);
      el.dataset.objects = lines(passes.objects, frames);
      passes.passes.clear();
      passes.objects.clear();
      frames = cpu = inRender = draws = tris = renders = read = render = computed = compute = 0;
      last = now;
    },
  };
}

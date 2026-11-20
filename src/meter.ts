import {
  Frustum,
  InspectorBase,
  InstancedBufferGeometry,
  InstancedMesh,
  Matrix4,
  Mesh,
  Scene,
  type Camera,
  type Object3D,
  type RenderTarget,
  type WebGPURenderer,
} from 'three/webgpu';

/**
 * Frame cost on the device: frames per second, CPU ms (the whole frame's, and
 * the frame's render call's), GPU ms for render and compute work, each a
 * second's mean; and the draw calls, triangles (thousands) and render passes of
 * a displayed frame, a second's mean. GPU times need the WebGPU
 * 'timestamp-query' feature; without it they read '–'. They are three's: the
 * durations of a frame's passes, summed. One readback is in flight at a time
 * and gives the frame it was asked for in; the GPU means are over the frames
 * read.
 *
 * The counts are three's (renderer.info): `render.drawCalls` and
 * `render.triangles` are reset as each frame of the animation loop begins, so
 * read after the frame they are that frame's, every pass and every offscreen
 * draw summed. (`render.calls` is not draw calls: it counts the renderer's
 * render() calls since it was made, and never resets.) Split by pass through
 * three's public inspector (InspectorBase: each render() call, nested ones
 * apart: the label is the scene's name, or its type, and the target's size),
 * and each scene's by what is in it to draw (each mesh's name, else its type):
 * the meshes shown, in the camera's view if culled by it, with instances to
 * draw, counted as three draws them; what a pass draws besides (its backdrop)
 * is the gap between the two. The means per frame over the last second are in
 * the meter's data-passes and data-objects (tools/capture.ts prints them).
 *
 * Shown, it is a panel in the screen's bottom-left corner (index.html #meter),
 * as the settings' stats switch or the debug page has it.
 */
interface Tally {
  draws: number;
  tris: number;
  runs: number;
}

/**
 * A render() call under way: its label, what it draws, and the counts when it
 * began and of the calls inside it.
 */
interface Open {
  label: string;
  scene: Object3D;
  camera: Camera;
  draws: number;
  tris: number;
  inner: number;
  innerTris: number;
}

class Passes extends InspectorBase {
  readonly passes = new Map<string, Tally>();
  readonly objects = new Map<string, Tally>();
  private readonly stack: Open[] = [];
  private readonly frustum = new Frustum();
  private readonly m = new Matrix4();
  constructor(private readonly info: WebGPURenderer['info']) {
    super();
  }

  override beginRender(
    _uid: string,
    scene: Scene,
    camera: Camera,
    target: RenderTarget | null
  ) {
    const size = target ? `${target.width}×${target.height}` : 'screen';
    const { drawCalls: draws, triangles: tris } = this.info.render;
    this.stack.push({
      label: `${scene.name || scene.type} ${size}`,
      scene,
      camera,
      draws,
      tris,
      inner: 0,
      innerTris: 0,
    });
  }

  override finishRender() {
    const p = this.stack.pop();
    if (!p) return;
    const draws = this.info.render.drawCalls - p.draws,
      tris = this.info.render.triangles - p.tris;
    add(this.passes, p.label, draws - p.inner, tris - p.innerTris);
    if (p.scene instanceof Scene)
      this.contents(p.scene, p.camera, p.label.split(' ')[0]);
    const outer = this.stack[this.stack.length - 1];
    if (outer) {
      outer.inner += draws;
      outer.innerTris += tris;
    }
  }

  /** What a scene has to draw, as three culls it. */
  private contents(scene: Scene, camera: Camera, pass: string) {
    this.frustum.setFromProjectionMatrix(
      this.m.multiplyMatrices(
        camera.projectionMatrix,
        camera.matrixWorldInverse
      )
    );
    scene.traverseVisible((o) => {
      if (
        !(o instanceof Mesh) ||
        (o.frustumCulled && !this.frustum.intersectsObject(o))
      )
        return;
      const g = o.geometry,
        n =
          o instanceof InstancedMesh
            ? o.count
            : g instanceof InstancedBufferGeometry
              ? g.instanceCount
              : 1;
      const count = Math.min(
        g.index ? g.index.count : g.getAttribute('position').count,
        g.drawRange.count
      );
      if (n > 0)
        add(this.objects, `${pass}/${o.name || o.type}`, 1, (n * count) / 3);
    });
  }
}

function add(
  map: Map<string, Tally>,
  key: string,
  draws: number,
  tris: number
) {
  const t = map.get(key) ?? { draws: 0, tris: 0, runs: 0 };
  t.draws += draws;
  t.tris += tris;
  t.runs++;
  map.set(key, t);
}

/** A tally's lines, per frame over `frames`, the most draws first. */
const lines = (map: Map<string, Tally>, frames: number) =>
  [...map]
    .sort((a, b) => b[1].draws - a[1].draws)
    .map(
      ([k, t]) =>
        `${k}: ${(t.draws / frames).toFixed(1)} draws ${(t.tris / frames / 1000).toFixed(1)}k tri ${(t.runs / frames).toFixed(2)}×`
    )
    .join('\n');

/** The frame rate the panel reads as on budget (the target's floor, 30), and as falling well short of it. */
const FPS = { good: 30, poor: 20 } as const;

/** The panel's rows: label, value, and a quieter note after it. Markup, as it is made only of the meter's own numbers
 *  and labels (nothing from outside the page) and only once a second: the panel is laid out afresh each time. */
function panel(
  fps: number,
  cpu: string,
  inRender: string,
  gpu: string | null,
  compute: string,
  draws: number,
  ktris: number,
  passes: number
) {
  const tone = fps >= FPS.good ? 'good' : fps >= FPS.poor ? 'fair' : 'poor';
  const row = (label: string, value: string, note = '') =>
    `<div><span>${label}</span><b>${value}</b><i>${note}</i></div>`;
  return (
    `<div class="fps ${tone}"><b>${fps}</b> fps</div>` +
    row('CPU', `${cpu} ms`, `render ${inRender} ms`) +
    row(
      'GPU',
      gpu === null ? 'n/a' : `${gpu} ms`,
      gpu === null ? '' : `+ ${compute} ms compute`
    ) +
    row('Draws', `${draws}`, `${passes} passes`) +
    row('Triangles', `${ktris}k`)
  );
}

/**
 * The meter on `el`: shown (show) as a panel of the frame's cost; its terse line, which the tools read, in
 * el.dataset.line whether shown or not. `split` installs the inspector that splits the draws by pass and by what is
 * drawn (el.dataset.passes, .objects): debugging only, as it walks each scene every render.
 */
export function createMeter(
  renderer: WebGPURenderer,
  el: HTMLElement,
  split: boolean
) {
  const gpu = renderer.hasFeature('timestamp-query');
  const info = renderer.info;
  const passes = new Passes(info);
  if (split) renderer.inspector = passes;
  let shown = false;
  let frames = 0;
  let cpu = 0,
    inRender = 0,
    draws = 0,
    tris = 0,
    renders = 0;
  let last = performance.now();
  let reading = false;
  let read = 0,
    render = 0;
  let computed = 0,
    compute = 0;

  async function readGPU(withCompute: boolean) {
    reading = true;
    try {
      const [r, c] = await Promise.all([
        renderer.resolveTimestampsAsync('render'),
        renderer.resolveTimestampsAsync('compute'),
      ]);
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
      const fps = Math.round((frames * 1000) / (now - last)),
        d = Math.round(draws / frames);
      const k = Math.round(tris / frames / 1000),
        p = Math.round(renders / frames);
      el.dataset.line =
        `${fps}  cpu ${f(cpu, frames)} (${f(inRender, frames)})` +
        (gpu
          ? `  gpu ${f(render, read)} + ${f(compute, computed)}`
          : '  gpu –') +
        `  ${d} draws ${k}k tri ${p} passes`;
      if (shown) {
        el.innerHTML = panel(
          fps,
          f(cpu, frames),
          f(inRender, frames),
          gpu ? f(render, read) : null,
          f(compute, computed),
          d,
          k,
          p
        );
      }
      if (split) {
        el.dataset.passes = lines(passes.passes, frames);
        el.dataset.objects = lines(passes.objects, frames);
      }
      passes.passes.clear();
      passes.objects.clear();
      frames =
        cpu =
        inRender =
        draws =
        tris =
        renders =
        read =
        render =
        computed =
        compute =
          0;
      last = now;
    },
    /** Shows the panel or hides it; it fills at the next second's reading. */
    show(on: boolean) {
      if (on === shown) return;
      shown = on;
      el.hidden = !on;
      if (!on) el.innerHTML = '';
    },
  };
}

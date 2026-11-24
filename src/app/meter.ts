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

interface Tally {
  draws: number;
  tris: number;
  runs: number;
}

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

const lines = (map: Map<string, Tally>, frames: number) =>
  [...map]
    .sort((a, b) => b[1].draws - a[1].draws)
    .map(
      ([k, t]) =>
        `${k}: ${(t.draws / frames).toFixed(1)} draws ${(t.tris / frames / 1000).toFixed(1)}k tri ${(t.runs / frames).toFixed(2)}×`
    )
    .join('\n');

const FPS = { good: 30, poor: 20 } as const;

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
    sample(cpuMs: number, renderMs: number) {
      frames++;
      cpu += cpuMs;
      inRender += renderMs;
      draws += info.render.drawCalls;
      tris += info.render.triangles;
      renders += info.render.frameCalls;
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
    show(on: boolean) {
      if (on === shown) return;
      shown = on;
      el.hidden = !on;
      if (!on) el.innerHTML = '';
    },
  };
}

// Preparation: every material's shaders and pipelines are built before the frame that first draws it, so no frame
// waits on a compile (on the iPad a pipeline built in the middle of a frame is a hitch of tens to hundreds of ms).
//
// One Preparation per renderer (Preparation.of), with two lanes:
//  - the scene lane builds render objects as a pass will draw them. A build borrows the renderer's target, outputs and
//    render context for each synchronous step and gives them back before anything else may run, so the frames go on
//    meanwhile; but two builds must never borrow them together, so the lane runs one job at a time. Background jobs
//    (the regions' sites) wait behind every other job, and build in one-millisecond slices with a presented frame
//    between them.
//  - the compute lane builds kernels, which borrow nothing, so it runs alongside the scene lane: a particle system's
//    kernels are never stuck behind a site's seconds of slices.
//
// Each job is logged as `prepare <label>: <seconds> s`, which tools/profile.ts reads from the device's console.
import type { Camera, ComputeNode, Material, Object3D, RenderTarget, Scene, WebGPURenderer } from 'three/webgpu';

type MRT = ReturnType<WebGPURenderer['getMRT']>;

export interface SceneJob {
  /** What the log calls it. */
  label: string;
  /** Everything under it is built. */
  root: Object3D;
  /** Seen through this camera, which should hold all of `root`: nothing is tested against its view. */
  camera: Camera;
  /** The scene whose lights `root` is lit by, when `root` is not that scene. */
  lights?: Scene | null;
  /** What `root` is drawn into, and with which outputs. */
  target: RenderTarget | null;
  mrt?: MRT | null;
  /** How deep in render calls `root` is drawn (three keeps a render context per depth); by default a render of its own. */
  depth?: number;
  /** Build what lies hidden under `root` too (its lights excepted: which lights shine is part of every material). */
  hidden?: boolean;
  /**
   * Gather `root` as a light's shadow pass draws it, with that light's shadow material: only what casts a shadow, each
   * with a copy of the material of its own. The pass swaps each caster's nodes onto the one shared material only while
   * it draws that caster, so three's queued builds would all see the bare material; the copies are built in its place,
   * and the builds and pipelines are kept by what they are, not by which material asked, so the pass finds them.
   */
  shadowMaterial?: Material;
  /** Not logged on its own (a job repeated many times): its seconds still add up in `took`. */
  quiet?: boolean;
  progress?: (f: number) => void;
}

/** One job at a time, urgent ones before background ones. A failed job fails its own promise and nothing else. */
export class Lane {
  readonly #urgent: (() => Promise<void>)[] = [];
  readonly #background: (() => Promise<void>)[] = [];
  #running = false;
  /** Jobs asked for and not yet finished. */
  #pending = 0;

  run<T>(work: () => Promise<T>, background = false): Promise<T> {
    this.#pending++;
    return new Promise<T>((resolve, reject) => {
      (background ? this.#background : this.#urgent).push(() => Promise.resolve().then(work).finally(() => { this.#pending--; }).then(resolve, reject));
      void this.#pump();
    });
  }

  get idle(): boolean {
    return this.#pending === 0;
  }

  async #pump(): Promise<void> {
    if (this.#running) return;
    this.#running = true;
    try {
      // the caller's own turn finishes before the first job starts
      await Promise.resolve();
      for (let next = this.#next(); next; next = this.#next()) await next();
    } finally {
      this.#running = false;
    }
  }

  #next() {
    return this.#urgent.shift() ?? this.#background.shift();
  }
}

/** When a background build gives a frame its turn: after each millisecond of work, until a frame has been presented
 *  (the browser's next animation frame, then a task: captures hold the game loop, so not the game's own frame). */
export interface Pacer { due(): boolean; wait(): Promise<void> }

export function framePacer(
  now: () => number = () => performance.now(),
  nextFrame: () => Promise<void> = () => new Promise<void>((resolve) => { requestAnimationFrame(() => { setTimeout(resolve, 0); }); }),
): Pacer {
  let since = now();
  return {
    due: () => now() - since >= 1,
    async wait() {
      await nextFrame();
      // the wait is the frame's, not the next slice's
      since = now();
    },
  };
}

/** The renderer's own state that three r187's compileAsync borrows, and the steps it borrows it in. */
interface Internals {
  _createObjectPipeline(object: Object3D, material: Material, ...rest: unknown[]): void;
  _renderContexts: { get(target: unknown, mrt: unknown, depth: number, camera: unknown): unknown };
  _precompilationState: unknown;
  _beginPreCompile(state: unknown): void;
  _finishPreCompile(): void;
  info: { calls: number };
}

const preparations = new WeakMap<WebGPURenderer, Preparation>();

export class Preparation {
  /** The one Preparation for `renderer`. */
  static of(renderer: WebGPURenderer): Preparation {
    let p = preparations.get(renderer);
    if (!p) preparations.set(renderer, (p = new Preparation(renderer)));
    return p;
  }

  readonly #renderer: WebGPURenderer;
  readonly #scene = new Lane();
  readonly #compute = new Lane();
  readonly #log: (line: string) => void;
  /** Seconds the finished jobs took, by label (a label used twice adds up). */
  readonly took = new Map<string, number>();

  constructor(renderer: WebGPURenderer, log: (line: string) => void = (line) => {
    if (import.meta.env?.VITE_RELEASE !== '1') console.info(line);
  }) {
    this.#renderer = renderer;
    this.#log = log;
  }

  /**
   * Builds everything under `job.root` as it will be drawn; resolves once its pipelines are made. A job given as a
   * function is described when its turn comes (null skips it). Background jobs wait behind every other job and build
   * in slices with a presented frame between them.
   */
  scene(job: SceneJob | (() => SceneJob | null), o: { background?: boolean } = {}): Promise<void> {
    return this.#scene.run(async () => {
      const j = typeof job === 'function' ? job() : job;
      if (!j) return;
      await this.#timed(j.label, () => prepareScene(this.#renderer, j, o.background ? framePacer() : undefined), j.quiet);
    }, o.background);
  }

  /** Builds compute kernels without running them. */
  compute(label: string, nodes: ComputeNode | ComputeNode[]): Promise<void> {
    return this.#compute.run(() => this.#timed(label, () => this.#renderer.compileComputeAsync(nodes)));
  }

  /** Whether both lanes have nothing left to do. */
  get idle(): boolean {
    return this.#scene.idle && this.#compute.idle;
  }

  async #timed(label: string, work: () => Promise<void>, quiet = false): Promise<void> {
    const since = performance.now();
    if (!quiet) this.#log(`prepare ${label}: start`);
    try { await work(); }
    finally {
      const s = (performance.now() - since) / 1000;
      this.took.set(label, (this.took.get(label) ?? 0) + s);
      if (!quiet) this.#log(`prepare ${label}: ${s.toFixed(2)} s`);
    }
  }
}

/**
 * Three r187's compileAsync, borrowing the renderer for `job`. It gathers the draws as a render would, then builds them
 * one at a time, each under the target, outputs and render context it was gathered with and with its own front or back
 * side, giving them back at every yield. Three cannot know two things this needs:
 *  - what to give back: it puts back the target set when the gathering began (here the job's, which no frame may draw
 *    into), so the frames' own is put back instead;
 *  - how deep the draws are made: the scene is drawn inside the frame's passes, and a render context is kept per depth.
 * Background jobs also swap three's eight-millisecond yields for the frame pacer.
 */
async function prepareScene(renderer: WebGPURenderer, job: SceneJob, pacer?: Pacer): Promise<void> {
  const r = renderer as unknown as Internals;
  const outsideTarget = renderer.getRenderTarget(), outsideMRT = renderer.getMRT();
  const contexts = r._renderContexts, get = contexts.get, finish = r._finishPreCompile, created = renderer.debug.onNodeBuilderCreated;
  r._finishPreCompile = function (this: Internals) {
    finish.call(this);
    renderer.setRenderTarget(outsideTarget);
    renderer.setMRT(outsideMRT);
  };
  if (pacer) {
    const paced = async () => {
      if (!pacer.due()) return;
      const state = r._precompilationState;
      r._finishPreCompile();
      try { await pacer.wait(); }
      finally { r._beginPreCompile(state); }
    };
    renderer.debug.onNodeBuilderCreated = (builder, object) => {
      created?.(builder, object);
      const b = builder as unknown as { buildAsync(yieldFn: () => Promise<void>): Promise<unknown> };
      const buildAsync = b.buildAsync.bind(b);
      b.buildAsync = async () => { await paced(); return buildAsync(paced); };
    };
  }
  // gathered as if shown: `root` itself, and with `hidden` everything under it but the lights
  const shown: Object3D[] = [];
  job.root.traverse((o) => {
    if (o.visible || (o !== job.root && (!job.hidden || (o as { isLight?: boolean }).isLight))) return;
    shown.push(o);
    o.visible = true;
  });
  // and nothing tested against the view: the tests would work out the bounds of every hidden thing at once (half a
  // second on the iPad), where the frames work each out when it is first seen
  const culled: Object3D[] = [];
  job.root.traverse((o) => {
    if (!o.frustumCulled) return;
    culled.push(o);
    o.frustumCulled = false;
  });
  // the shadow pass: the scene draws with its override, and only what casts a shadow is queued, each with its own copy
  const shadow = job.shadowMaterial, sceneOf = (job.lights ?? job.root) as Scene, overrideWas = sceneOf.overrideMaterial;
  if (shadow) {
    sceneOf.overrideMaterial = shadow;
    const queue = r._createObjectPipeline;
    r._createObjectPipeline = function (this: Internals, object, material, ...rest) {
      if (material !== shadow) return queue.call(this, object, material, ...rest);
      if (!object.castShadow) return;
      const own = material.clone();
      own.name = material.name;
      return queue.call(this, object, own, ...rest);
    };
  }
  const depth = job.depth;
  if (depth !== undefined) contexts.get = (target, mrt, _depth, camera) => get.call(contexts, target, mrt, depth, camera);
  renderer.setRenderTarget(job.target);
  renderer.setMRT(job.mrt ?? null);
  let built: Promise<void>;
  try {
    // the key of the scene's lights, which every material is built for, is worked out once per draw call and kept
    // until the next; the first material built sets the lights' nodes up and changes it, and with no draws between
    // them the rest would be built for the stale key and built again by the first frame: so each counts as a call
    built = renderer.compileAsync(job.root, job.camera, job.lights ?? null, (e: ProgressEvent) => {
      r.info.calls++;
      job.progress?.(e.loaded / Math.max(e.total, 1));
    });
  } finally {
    if (shadow) {
      sceneOf.overrideMaterial = overrideWas;
      delete (r as Partial<Internals>)._createObjectPipeline;
    }
    contexts.get = get;
    for (const o of shown) o.visible = false;
    for (const o of culled) o.frustumCulled = true;
    renderer.setRenderTarget(outsideTarget);
    renderer.setMRT(outsideMRT);
  }
  try {
    await built;
  } finally {
    r._finishPreCompile = finish;
    renderer.debug.onNodeBuilderCreated = created;
  }
}

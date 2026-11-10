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

// Compilation temporarily borrows renderer state. Scene warm-up and offscreen bakes must never borrow it together.
const preparing = new WeakMap<object, Promise<unknown>>();

/** Serializes asynchronous preparation on this renderer; a failed job does not strand later work. */
export function serializePreparation<T>(renderer: object, work: () => Promise<T>): Promise<T> {
  const run = (preparing.get(renderer) ?? Promise.resolve()).then(work);
  const tail = run.catch(() => {});
  preparing.set(renderer, tail);
  void tail.then(() => { if (preparing.get(renderer) === tail) preparing.delete(renderer); });
  return run;
}

/** The installed Three builder's async stages, with renderer state held only during each synchronous segment. */
interface StagedBuilder {
  renderer: WebGPURenderer;
  context: { position?: { isNode?: boolean } };
  flowNodes: Record<string, { build(builder: StagedBuilder): void }[]>;
  prebuild(): void;
  setBuildStage(stage: string | null): void;
  setShaderStage(stage: string | null): void;
  flowNodeFromShaderStage(stage: string, node: unknown): void;
  flowNode(node: unknown): void;
  buildCode(): void;
  buildUpdateNodes(): void;
}

type BuildTarget = ReturnType<WebGPURenderer['getRenderTarget']>;
type BuildMRT = ReturnType<WebGPURenderer['getMRT']> | null;

/**
 * Three r186's buildAsync yields between shader stages, but those stages read the renderer's target and MRT.
 * Borrow them for each segment and restore them before yielding, so normal frames can draw throughout preparation.
 * Keep this in step with NodeBuilder.buildAsync; the regression test compares their executed stages directly.
 */
export async function buildNodeForTargetAsync(
  nodeBuilder: object, target: BuildTarget, mrt: BuildMRT, context: unknown,
  yieldToMain: () => Promise<unknown> = () => {
    const scheduler = (globalThis as unknown as { scheduler?: { yield(): Promise<unknown> } }).scheduler;
    return scheduler ? scheduler.yield() : new Promise<void>((resolve) => { requestAnimationFrame(() => resolve()); });
  },
): Promise<object> {
  const builder = nodeBuilder as StagedBuilder;
  const renderer = builder.renderer;
  const internal = renderer as unknown as { _currentRenderContext: unknown };
  const segment = (work: () => void) => {
    const was = renderer.getRenderTarget(), mrtWas = renderer.getMRT(), contextWas = internal._currentRenderContext;
    renderer.setRenderTarget(target);
    renderer.setMRT(mrt);
    internal._currentRenderContext = context;
    try { work(); }
    finally {
      renderer.setRenderTarget(was);
      renderer.setMRT(mrtWas);
      internal._currentRenderContext = contextWas;
    }
  };
  segment(() => builder.prebuild());
  for (const buildStage of ['setup', 'analyze', 'generate']) {
    segment(() => {
      builder.setBuildStage(buildStage);
      if (builder.context.position?.isNode) builder.flowNodeFromShaderStage('vertex', builder.context.position);
    });
    for (const shaderStage of ['fragment', 'vertex', 'compute']) {
      segment(() => {
        builder.setShaderStage(shaderStage);
        for (const node of builder.flowNodes[shaderStage]!) {
          if (buildStage === 'generate') builder.flowNode(node);
          else node.build(builder);
        }
      });
      await yieldToMain();
    }
  }
  segment(() => {
    builder.setBuildStage(null);
    builder.setShaderStage(null);
    builder.buildCode();
    builder.buildUpdateNodes();
  });
  return nodeBuilder;
}

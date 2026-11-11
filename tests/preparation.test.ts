// Preparation: the lanes' order and failures, the background pacer, and the parts of three it borrows.
//   node --test tests/preparation.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Lane, framePacer } from '../src/render/gpu/preparation.ts';

test('a lane runs one job at a time, urgent before background, and a failure strands nothing', async () => {
  const lane = new Lane(), events: string[] = [];
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const first = lane.run(async () => { events.push('first'); await gate; throw new Error('failed bake'); });
  const rejected = assert.rejects(first, /failed bake/);
  const site = lane.run(async () => { events.push('site'); }, true);
  const actors = lane.run(async () => { events.push('actors'); return 42; });
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(events, ['first'], 'nothing starts while a job runs');
  assert.equal(lane.idle, false);
  release();
  await rejected;
  assert.equal(await actors, 42);
  await site;
  assert.deepEqual(events, ['first', 'actors', 'site'], 'what is asked for goes ahead of background work');
  assert.equal(lane.idle, true);
});

test('a job that throws before its first await fails only itself', async () => {
  const lane = new Lane();
  await assert.rejects(lane.run(() => { throw new Error('bad material'); }), /bad material/);
  assert.equal(await lane.run(async () => 'next'), 'next');
});

test('a job starts after the turn that asked for it', async () => {
  const lane = new Lane();
  let started = false;
  const job = lane.run(async () => { started = true; });
  assert.equal(started, false);
  await job;
  assert.equal(started, true);
});

test('the background pacer is due after each millisecond of work and not charged for the frame', async () => {
  let clock = 0, frames = 0, advance!: () => void;
  const pacer = framePacer(() => clock, () => {
    frames++;
    return new Promise<void>((resolve) => { advance = resolve; });
  });
  clock = 0.99;
  assert.equal(pacer.due(), false);
  clock = 1;
  assert.equal(pacer.due(), true);
  const waiting = pacer.wait();
  assert.equal(frames, 1);
  clock = 500;
  advance();
  await waiting;
  assert.equal(pacer.due(), false);
  clock = 501;
  assert.equal(pacer.due(), true);
});

test('the default pacer waits for an animation frame and then a task, not for a game frame', async (t) => {
  let animation!: FrameRequestCallback, task!: () => void;
  const original = Object.getOwnPropertyDescriptor(globalThis, 'requestAnimationFrame');
  Object.defineProperty(globalThis, 'requestAnimationFrame', { configurable: true, value: (cb: FrameRequestCallback) => { animation = cb; return 1; } });
  t.after(() => {
    if (original) Object.defineProperty(globalThis, 'requestAnimationFrame', original);
    else Reflect.deleteProperty(globalThis, 'requestAnimationFrame');
  });
  t.mock.method(globalThis, 'setTimeout', (cb: () => void) => { task = cb; return 1; });
  let resumed = false;
  const waiting = framePacer().wait().then(() => { resumed = true; });
  assert.equal(typeof animation, 'function');
  assert.equal(task, undefined);
  animation(1000);
  assert.equal(typeof task, 'function');
  await Promise.resolve();
  assert.equal(resumed, false);
  task();
  await waiting;
  assert.equal(resumed, true);
});

// The scene lane borrows three's own precompilation steps (src/render/gpu/preparation.ts prepareScene). A three upgrade
// that renames or reshapes them must fail here, not as hitches on the device.
test('the installed three still prepares in the steps Preparation borrows', async () => {
  const { WebGPURenderer, NodeBuilder } = await import('three/webgpu');
  const { default: RenderContexts } = await import('../node_modules/three/src/renderers/common/RenderContexts.js' as string);
  const R = WebGPURenderer.prototype as unknown as Record<string, unknown>;
  for (const name of ['_beginPreCompile', '_finishPreCompile', '_createObjectPipeline', 'compileAsync', 'compileComputeAsync']) {
    assert.equal(typeof R[name], 'function', name);
  }
  const compile = String(R.compileAsync), queue = String(R._createObjectPipeline), finish = String(R._finishPreCompile);
  assert.match(compile, /this\._beginPreCompile\( itemPrecompilationState \)/, 'each queued object is built under its own state');
  assert.match(compile, /getForRenderAsync\( renderObject, yieldPreCompile \)/, 'builds yield through a function that gives the state back');
  assert.match(queue, /useFrameBufferTarget: true,\s*renderTarget: this\.getRenderTarget\(\),\s*mrt: this\.getMRT\(\)/, 'objects keep the target they were gathered with');
  assert.match(finish, /this\.setRenderTarget\( outputRenderTarget/, 'finishing puts back the target set when the gathering began');
  assert.match(String((NodeBuilder.prototype as unknown as Record<string, unknown>).buildAsync), /^async buildAsync\( yieldFn/, 'builds take the yield');
  assert.match(String(RenderContexts.prototype.get), /^get\( renderTarget = null, mrt = null, callDepth = 0, camera = null \)/, 'render contexts are kept per depth');
});

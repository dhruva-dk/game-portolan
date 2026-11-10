import { test } from 'node:test';
import assert from 'node:assert/strict';
import { serializePreparation, sitePreparationYield } from '../src/render/gpu/work.ts';

test('preparation cannot borrow the same renderer concurrently, including after failure', async () => {
  const renderer = {}, events: string[] = [];
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const first = serializePreparation(renderer, async () => { events.push('first'); await gate; throw new Error('failed bake'); });
  const rejected = assert.rejects(first, /failed bake/);
  const second = serializePreparation(renderer, async () => { events.push('second'); return 42; });
  await Promise.resolve();
  assert.deepEqual(events, ['first']);
  await serializePreparation({}, async () => { events.push('independent'); });
  assert.deepEqual(events, ['first', 'independent']);
  release();
  await rejected;
  assert.equal(await second, 42);
  assert.deepEqual(events, ['first', 'independent', 'second']);
});

test('yielding node build matches installed Three stages and restores renderer state at every yield', async (t) => {
  const { NodeBuilder } = await import('three/webgpu');
  const { buildNodeForTargetAsync } = await import('../src/render/gpu/work.ts');
  const events: string[] = [];
  const target = {}, mrt = {}, context = {};
  let currentTarget: unknown = null, currentMRT: unknown = null;
  const renderer = {
    _currentRenderContext: null as unknown,
    getRenderTarget: () => currentTarget, getMRT: () => currentMRT,
    setRenderTarget: (value: unknown) => { currentTarget = value; }, setMRT: (value: unknown) => { currentMRT = value; },
  };
  const check = () => {
    assert.equal(currentTarget, target);
    assert.equal(currentMRT, mrt);
    assert.equal(renderer._currentRenderContext, context);
  };
  const record = (event: string) => { check(); events.push(event); };
  const builder = {
    renderer, context: { position: { isNode: true } },
    flowNodes: Object.fromEntries(['fragment', 'vertex', 'compute'].map((stage) => [stage, [{ build: () => record(`node ${stage}`) }]])),
    prebuild: () => record('prebuild'), setBuildStage: (stage: unknown) => record(`build ${stage}`),
    setShaderStage: (stage: unknown) => record(`shader ${stage}`), flowNodeFromShaderStage: () => record('position'),
    flowNode: () => record('flow'), buildCode: () => record('code'), buildUpdateNodes: () => record('updates'),
  };
  let yields = 0;
  await buildNodeForTargetAsync(builder, target as any, mrt as any, context, async () => {
    yields++;
    assert.equal(currentTarget, null);
    assert.equal(currentMRT, null);
    assert.equal(renderer._currentRenderContext, null);
  });
  assert.equal(yields, 9);
  const actual = [...events];
  events.length = 0;
  for (const [key, value] of [['self', globalThis], ['scheduler', { yield: async () => {} }]] as const) {
    const original = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, value });
    t.after(() => { if (original) Object.defineProperty(globalThis, key, original); else Reflect.deleteProperty(globalThis, key); });
  }
  currentTarget = target; currentMRT = mrt; renderer._currentRenderContext = context;
  await (NodeBuilder.prototype as any).buildAsync.call(builder);
  assert.deepEqual(actual, events, 'pin the actual installed Three build order');
});

test('yielding node build restores target and context after early, resumed, final and yield failures', async () => {
  const { buildNodeForTargetAsync } = await import('../src/render/gpu/work.ts');
  for (const failure of ['prebuild', 'resumed', 'code', 'yield']) {
    let target: unknown = null, mrt: unknown = null, stage: string | null = null;
    const renderer = {
      _currentRenderContext: null,
      getRenderTarget: () => target, getMRT: () => mrt,
      setRenderTarget: (v: unknown) => { target = v; }, setMRT: (v: unknown) => { mrt = v; },
    };
    const fail = () => { throw new Error('bad material'); };
    const builder = {
      renderer, context: {},
      prebuild() { if (failure === 'prebuild') fail(); },
      setBuildStage(value: string | null) { stage = value; }, setShaderStage() {},
      flowNodes: { fragment: [{ build() { if (failure === 'resumed' && stage === 'analyze') fail(); } }], vertex: [], compute: [] },
      flowNode() {}, buildCode() { if (failure === 'code') fail(); }, buildUpdateNodes() {},
    };
    await assert.rejects(buildNodeForTargetAsync(builder, {} as any, {} as any, {}, async () => {
      if (failure === 'yield') fail();
    }), /bad material/);
    assert.equal(target, null, failure); assert.equal(mrt, null, failure); assert.equal(renderer._currentRenderContext, null, failure);
  }
});


test('optional site preparation yields at its one millisecond budget and resets after the frame', async () => {
  let clock = 0, frames = 0, advance!: () => void;
  const yieldSite = sitePreparationYield(() => clock, () => {
    frames++;
    return new Promise<void>((resolve) => { advance = resolve; });
  });
  clock = 0.99;
  await yieldSite();
  assert.equal(frames, 0);
  clock = 1;
  let resumed = false;
  const waiting = yieldSite().then(() => { resumed = true; });
  await Promise.resolve();
  assert.equal(frames, 1);
  assert.equal(resumed, false);
  clock = 500; // browser/driver waiting is not charged against the next frame's CPU budget
  advance();
  await waiting;
  clock = 500.99;
  await yieldSite();
  assert.equal(frames, 1);
  clock = 501;
  const next = yieldSite();
  assert.equal(frames, 2);
  advance();
  await next;
});

test('optional site pacing waits for browser rAF followed by a task without needing a game frame', async (t) => {
  let clock = 0, animation!: FrameRequestCallback, task!: () => void;
  const original = Object.getOwnPropertyDescriptor(globalThis, 'requestAnimationFrame');
  Object.defineProperty(globalThis, 'requestAnimationFrame', { configurable: true, value: (callback: FrameRequestCallback) => {
    animation = callback;
    return 1;
  } });
  t.after(() => {
    if (original) Object.defineProperty(globalThis, 'requestAnimationFrame', original);
    else Reflect.deleteProperty(globalThis, 'requestAnimationFrame');
  });
  t.mock.method(globalThis, 'setTimeout', (callback: () => void) => { task = callback; return 1; });
  const yieldSite = sitePreparationYield(() => clock);
  clock = 2;
  let resumed = false;
  const pending = yieldSite().then(() => { resumed = true; });
  await Promise.resolve();
  assert.equal(typeof animation, 'function');
  assert.equal(task, undefined);
  animation(1000);
  await Promise.resolve();
  assert.equal(typeof task, 'function');
  assert.equal(resumed, false);
  task();
  await pending;
  assert.equal(resumed, true);
});

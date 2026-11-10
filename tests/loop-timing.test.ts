import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Loop, MAX_CATCH_UP, type Frame } from '../src/app/loop.ts';

test('wall timing records a full stall while simulation catch-up stays bounded', () => {
  const original = globalThis.requestAnimationFrame;
  let callback!: FrameRequestCallback;
  globalThis.requestAnimationFrame = (cb) => { callback = cb; return 1; };
  try {
    const frames: Frame[] = [];
    const loop = new Loop((frame) => frames.push({ ...frame }));
    let ticks = 0;
    loop.run({ step: () => { ticks++; return true; } });
    callback(0);
    callback(1500);
    assert.equal(frames.at(-1)!.wallDt, 1.5);
    assert.equal(frames.at(-1)!.realDt, 0.25);
    assert.equal(ticks, MAX_CATCH_UP);
    loop.suspended = true;
    callback(2000);
    loop.suspended = false;
    callback(10000);
    assert.equal(frames.at(-1)!.wallDt, 0, 'background time is not an interactive stall');
  } finally {
    globalThis.requestAnimationFrame = original;
  }
});

test('callback cadence includes capped frames and excludes time suspended', () => {
  const original = globalThis.requestAnimationFrame;
  let callback!: FrameRequestCallback;
  globalThis.requestAnimationFrame = (cb) => { callback = cb; return 1; };
  try {
    let drawn = 0;
    const loop = new Loop(() => drawn++);
    loop.frameRate = 40;
    loop.cadence = { callbacks: 0, elapsed: 0 };
    for (let i = 0; i <= 60; i++) callback(i * 1000 / 60);
    assert.equal(drawn, 31, 'a 60 Hz callback source cannot deliver evenly paced 40 FPS');
    assert.equal(loop.cadence.callbacks, 60);
    assert.equal(loop.cadence.elapsed, 1000);
    loop.suspended = true;
    callback(2000);
    loop.suspended = false;
    callback(10000);
    assert.equal(loop.cadence.elapsed, 1000);
  } finally {
    globalThis.requestAnimationFrame = original;
  }
});

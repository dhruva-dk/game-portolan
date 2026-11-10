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

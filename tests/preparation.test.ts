import { test } from 'node:test';
import assert from 'node:assert/strict';
import { serializePreparation } from '../src/render/gpu/work.ts';

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

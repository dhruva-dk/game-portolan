import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Vector2, type WebGPURenderer } from 'three/webgpu';
import { ClusteredLighting } from '../src/render/gpu/clusters.ts';

type Fitted = ReturnType<ClusteredLighting['createNode']> & {
  updateProgram(renderer: WebGPURenderer): void;
  customCacheKey(): number;
  _compute: { count: number; getCacheKey(): number };
  _lightIndexes: { value: { array: Int32Array } };
  _screenClusterIndex: unknown;
  _gridDimensions: { value: Vector2 };
};

function fixture() {
  const share = { scale: 0.66 };
  const size = new Vector2(1290, 2796);
  const renderer = { getDrawingBufferSize: (target: Vector2) => target.copy(size) } as WebGPURenderer;
  const node = new ClusteredLighting(share).createNode() as Fitted;
  node.updateProgram(renderer);
  return { share, size, renderer, node };
}

test('scale cycles preserve the installed Three lighting cache key and graph', () => {
  const { share, renderer, node } = fixture();
  const compute = node._compute, indexes = node._lightIndexes, fragment = node._screenClusterIndex;
  const key = node.customCacheKey();
  for (const scale of [0.627, 0.594, 0.429, 0.66, 0.627, 0.66]) {
    share.scale = scale;
    node.updateProgram(renderer);
    assert.equal(node.customCacheKey(), key, 'scale updates must not invalidate every lit material');
    assert.equal(node._compute, compute);
    assert.equal(node._lightIndexes, indexes);
    assert.equal(node._screenClusterIndex, fragment);
    const nx = Math.ceil(Math.floor(1290 * scale) / 32);
    const ny = Math.ceil(Math.floor(2796 * scale) / 32);
    assert.deepEqual(node._gridDimensions.value.toArray(), [nx, ny]);
    assert.equal(compute.count, nx * ny * 24, 'dispatch only the active grid');
    assert.ok(indexes.value.array.length >= compute.count * 32);
  }
});

test('resizing within reserved drawing-buffer capacity preserves the graph', () => {
  const { renderer, node, size } = fixture();
  const compute = node._compute;
  size.set(2796, 1290);
  node.updateProgram(renderer);
  assert.equal(node._compute, compute);
  assert.deepEqual(node._gridDimensions.value.toArray(), [58, 27]);
  size.set(1, 1);
  node.updateProgram(renderer);
  assert.deepEqual(node._gridDimensions.value.toArray(), [1, 1]);
  assert.equal(node._compute.count, 24);
  size.set(4000, 3000);
  node.updateProgram(renderer);
  assert.ok(node._lightIndexes.value.array.length >= node._compute.count * 32);
});

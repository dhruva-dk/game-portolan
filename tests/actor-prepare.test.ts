import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BufferGeometry, Float32BufferAttribute, Group, Texture, Vector3, type ComputeNode, type WebGPURenderer } from 'three/webgpu';
import { Cloth, ropeGeometry } from '../src/render/actors/cloth.ts';
import { Particles, SPRITE } from '../src/render/actors/particles.ts';
import { Ribbons } from '../src/render/actors/ribbons.ts';
import { runFrameWork } from '../src/render/gpu/work.ts';

function clothFixture(): Cloth {
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute([0, 1, 0, 1, 1, 0, 0, 2, 0, 1, 2, 0], 3));
  g.setAttribute('aPlane', new Float32BufferAttribute([0, 0, 1, 0, 0, 1, 1, 1], 2));
  g.setAttribute('aRig', new Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
  g.userData.grids = [{ kind: 0, base: 0, nu: 1, nv: 1, mastR: 0.1 }];
  g.computeBoundingSphere();
  return new Cloth(g, ropeGeometry([{ from: new Vector3(0, 2, 0), to: new Vector3(1, 0, 0), lee: true, mastZ: 0, swing: 1, slack: 1.1, radius: 0.01, main: 0 }]), new Texture());
}

test('actor preparation serializes all step/wipe/write graphs without dispatching or consuming pending inputs', async () => {
  const cloth = clothFixture(), particles = new Particles(4, 2, true, new Texture()), ribbons = new Ribbons(2, 4, true, new Texture());
  new Group().add(particles.mesh, ribbons.mesh);
  const slot = cloth.acquire();
  cloth.set(slot, 0, 1, new Vector3(1, 0, 0), 0, new Vector3(1, 0, 0), new Vector3(0, -9.8, 0), 0, 0, 1 / 30);
  particles.emit({ x: 0, y: 600, z: 0, life: 1, size: 1, r: 1, g: 1, b: 1, frame: SPRITE.puff });
  particles.update(1 / 30);
  ribbons.push(1, new Vector3(0, 600, 0), { width: 1, grow: 1, life: 1, r: 1, g: 1, b: 1, a: 1 });
  ribbons.update(1 / 30);
  const initialCounts = [particles.count, ribbons.count];
  let active = 0, peak = 0, dispatches = 0;
  const compiled: ComputeNode[] = [];
  const renderer = {
    async compileComputeAsync(node: ComputeNode) {
      active++;
      peak = Math.max(peak, active);
      assert.equal(node.isComputeNode, true);
      assert.equal(node.onInitFunction, null);
      compiled.push(node);
      await new Promise((resolve) => setTimeout(resolve, 0));
      active--;
    },
    compute() { dispatches++; },
  } as unknown as WebGPURenderer;
  const ready = Promise.all([cloth.prepare(renderer), particles.prepare(renderer), ribbons.prepare(renderer)]);
  runFrameWork(renderer); // a regular frame can arrive while native shader building has yielded
  assert.equal(dispatches, 0);
  await ready;
  assert.equal(compiled.length, 10); // four cloth and three kernels per effect pool
  assert.equal(new Set(compiled).size, 10);
  assert.equal(peak, 1);
  assert.equal(dispatches, 0);
  assert.deepEqual([particles.count, ribbons.count], initialCounts);
  await Promise.all([cloth.prepare(renderer), particles.prepare(renderer), ribbons.prepare(renderer)]);
  assert.equal(compiled.length, 10, 'preparation is idempotent');
  runFrameWork(renderer);
  assert.ok(dispatches > 0, 'the queued frame still runs after preparing');
});

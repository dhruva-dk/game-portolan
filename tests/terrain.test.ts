import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { MeshBasicMaterial, Vector3 } from 'three';
import { Terrain } from '../src/render/terrain.ts';
import { chunkVertices, type ChunkData, type ChunkRequest } from '../src/render/terrain-build.ts';
import { R } from '../src/sim/sphere.ts';

class FakeWorker {
  static all: FakeWorker[] = [];
  requests: ChunkRequest[] = [];
  onmessage!: (e: { data: ChunkData }) => void;
  constructor() { FakeWorker.all.push(this); }
  postMessage(req: ChunkRequest) { this.requests.push(req); }
  terminate() {}
  answer(req = this.requests.shift()!) { this.onmessage({ data: chunk(req.id) }); }
}
const chunk = (id: number): ChunkData => ({
  id, centre: [0, 0, 0], bound: [0, 0, 0, 1], minH: 0, maxH: 10,
  position: new Float32Array(chunkVertices() * 3), normal: new Float32Array(chunkVertices() * 3), weights: new Uint8Array(chunkVertices() * 16),
});
function fixture(t: TestContext) {
  const old = Object.getOwnPropertyDescriptor(globalThis, 'Worker');
  Object.defineProperty(globalThis, 'Worker', { configurable: true, writable: true, value: FakeWorker });
  FakeWorker.all = [];
  const terrain = new Terrain(new MeshBasicMaterial(), 4);
  terrain.minLevel = terrain.maxLevel = 1;
  t.after(() => {
    terrain.dispose();
    terrain.material.dispose();
    if (old) Object.defineProperty(globalThis, 'Worker', old); else Reflect.deleteProperty(globalThis, 'Worker');
  });
  // Ordinary private members are accessible here to check actual mesh lifetimes without a GPU or a worker runtime.
  const internals = terrain as any;
  for (const w of FakeWorker.all) while (w.requests.length) w.answer();
  const eye = internals.roots[0].dir.clone().multiplyScalar(R + 10) as Vector3;
  return { terrain, internals, eye };
}

test('roots resolve without update; completed detail meshes enter at most one per update', async (t) => {
  const { terrain, eye } = fixture(t);
  await terrain.faces;
  assert.equal(terrain.group.children.length, 6);
  terrain.update(eye);
  const requests = FakeWorker.all.flatMap((w) => w.requests.map((req) => ({ w, req })));
  assert.equal(requests.length, 4);
  for (const w of FakeWorker.all) while (w.requests.length) w.answer();
  assert.equal(terrain.group.children.length, 6, 'worker completion must not allocate all meshes immediately');
  assert.equal(terrain.busy, true);
  for (let i = 0; i < 4; i++) {
    const previous = terrain.group.children.length;
    terrain.update(eye);
    assert.ok(terrain.group.children.length <= previous + 1);
  }
  assert.equal(terrain.group.children.length, 10);
});

test('completed chunks from the old view are discarded without replacing parent fallback', (t) => {
  const { terrain, eye, internals } = fixture(t);
  terrain.update(eye);
  for (const w of FakeWorker.all) while (w.requests.length) w.answer();
  terrain.hold = true;
  terrain.update(eye.clone().negate());
  assert.equal(terrain.group.children.length, 6, 'old detail results must not upload after a camera move');
  assert.ok(internals.drawn.length > 0, 'coarse ready roots still cover the new view');
  assert.equal(internals.completed.length, 0);
});

test('unused detail cache expires by elapsed seconds, including at low update rates', (t) => {
  let now = 1000;
  t.mock.method(performance, 'now', () => now);
  const { terrain, internals, eye } = fixture(t);
  terrain.maxLevel = 0;
  const n = internals.node(0, 3, 0, 0, 0, 10);
  internals.accept(n, chunk(99));
  n.used = now;
  now += 9999;
  terrain.update(eye);
  assert.ok(n.mesh);
  now += 2;
  terrain.update(eye);
  assert.ok(!n.mesh, '10 seconds must expire without waiting for 300 updates');
});

test('resident detail bytes have an explicit ceiling and pressure evicts unused meshes first', (t) => {
  const { terrain, internals, eye } = fixture(t);
  terrain.maxLevel = 0;
  terrain.update(eye);
  const large = chunk(100);
  large.position = new Float32Array(2 * 1024 * 1024);
  const first = internals.node(0, 3, 0, 0, 0, 10);
  for (let i = 0; i < 8; i++) {
    const n = internals.node(0, 3, i, 0, 0, 10);
    internals.accept(n, large);
  }
  assert.ok(internals.residentBytes <= 48 * 1024 * 1024);
  assert.ok(!first.mesh);
  assert.equal(internals.roots.filter((n: any) => n.mesh).length, 6, 'retain planet coverage');
});

test('hold retains at most one completed result per worker and resumes with one admission', (t) => {
  const { terrain, internals, eye } = fixture(t);
  terrain.update(eye);
  for (const w of FakeWorker.all) while (w.requests.length) w.answer();
  terrain.hold = true;
  for (let i = 0; i < 20; i++) terrain.update(eye);
  assert.equal(internals.completed.length, 4);
  assert.equal(internals.inFlight.size, 0);
  assert.equal(FakeWorker.all.flatMap((w) => w.requests).length, 0, 'queued workers must not produce a growing backlog');
  const c = chunk(0);
  assert.equal(terrain.stats.queuedBytes, 4 * (c.position.byteLength + c.normal.byteLength + c.weights.byteLength));
  assert.equal(terrain.group.children.length, 6);
  terrain.hold = false;
  terrain.update(eye);
  assert.equal(terrain.group.children.length, 7);
  assert.equal(internals.completed.length + internals.inFlight.size + internals.idle.length, 4);
});

test('memory pressure refuses extra detail while retaining every currently needed mesh', (t) => {
  const { terrain, internals, eye } = fixture(t);
  terrain.maxLevel = 0;
  terrain.update(eye);
  const large = chunk(100);
  large.position = new Float32Array(2 * 1024 * 1024);
  const demanded = [];
  for (let i = 0; i < 8; i++) {
    const n = internals.node(0, 3, i, 0, 0, 10);
    n.needed = internals.frame;
    internals.accept(n, large);
    demanded.push(n);
  }
  assert.equal(demanded.filter((n) => n.mesh).length, 5);
  assert.equal(demanded[7].state, 0, 'rejected detail can be requested again later');
  assert.equal(internals.roots.filter((n: any) => n.mesh).length, 6);
  assert.ok(internals.residentBytes <= 48 * 1024 * 1024);
});

test('dispose drops queued data and ignores late worker completions', (t) => {
  const { terrain, internals, eye } = fixture(t);
  terrain.update(eye);
  FakeWorker.all[0]!.answer();
  assert.equal(internals.completed.length, 1);
  terrain.dispose();
  for (const w of FakeWorker.all) while (w.requests.length) w.answer();
  assert.equal(terrain.group.children.length, 0);
  assert.equal(internals.completed.length, 0);
  assert.equal(internals.residentBytes, 0);
});

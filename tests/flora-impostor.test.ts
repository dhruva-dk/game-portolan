import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BoxGeometry, Color, MeshStandardMaterial, RenderTarget, type Mesh, type Scene, type Texture, type Vector2, type WebGPURenderer } from 'three/webgpu';
import { ImpostorAtlas, VIEWS, type ImpostorSource } from '../src/render/flora/impostor.ts';
import { tag } from '../src/render/flora/tag.ts';

function rendererMock() {
  const originalTarget = new RenderTarget(2, 2);
  const originalMrt = {};
  let target: RenderTarget | null = originalTarget, mrt: unknown = originalMrt;
  const color = new Color(0x123456);
  let alpha = 0.7;
  const renders: { meshes: Mesh[]; clear: boolean; mipmaps: boolean[] }[] = [];
  const compiled: Mesh[] = [];
  const compiledTargets: RenderTarget[] = [];
  const copies: { from: Texture; to: Texture; at: Vector2; mipmaps: boolean }[] = [];
  const initialized: RenderTarget[] = [];
  let clears = 0;
  let pause: Promise<void> | null = null;
  let fail = false;
  const r = {
    autoClear: true,
    debug: { onNodeBuilderCreated: null },
    getRenderTarget: () => target,
    setRenderTarget: (t: RenderTarget | null) => { target = t; },
    getMRT: () => mrt,
    setMRT: (m: unknown) => { mrt = m; },
    getClearColor: (out: Color) => out.copy(color),
    getClearAlpha: () => alpha,
    setClearColor: (c: number | Color, a: number) => { color.set(c); alpha = a; },
    // three r187's precompilation: a snapshot of the target when gathering begins, set again for each queued object
    // and put back (that same snapshot) when each finishes
    info: { calls: 0 },
    _renderContexts: { get: () => ({}) },
    _precompilationState: null as { target: RenderTarget | null; mrt: unknown } | null,
    _beginPreCompile(state: { target: RenderTarget | null; mrt: unknown }) { target = state.target; mrt = state.mrt; r._precompilationState = state; },
    _finishPreCompile() { const s = r._precompilationState!; target = s.target; mrt = s.mrt; r._precompilationState = null; },
    compileAsync: async (scene: Scene) => {
      assert.notEqual(target, originalTarget);
      assert.equal(target!.width, 512);
      assert.equal(target!.height, 512);
      assert.equal(target!.depthBuffer, true);
      assert.ok(target!.textures.every((t) => !t.generateMipmaps), 'the scratch slot needs only its base level');
      assert.equal(mrt, null);
      compiledTargets.push(target!);
      const object = scene.children[0] as Mesh;
      compiled.push(object);
      const state = { target, mrt };
      r._beginPreCompile(state);
      r._finishPreCompile();
      await Promise.resolve();
      // the object, built between frames under the state it was gathered with
      r._beginPreCompile(state);
      assert.equal(target, compiledTargets.at(-1)); assert.equal(mrt, null);
      r._finishPreCompile();
      assert.equal(target, originalTarget, 'a frame drawn between builds draws where it would have');
      if (pause) await pause;
      if (fail) throw new Error('compile failed');
    },
    initRenderTarget: (rt: RenderTarget) => {
      assert.equal(rt.depthBuffer, false);
      assert.equal(rt.depthTexture, null);
      assert.ok(rt.textures.every((t) => t.generateMipmaps), 'allocate the complete destination mip chain');
      initialized.push(rt);
    },
    clear: (color: boolean, depth: boolean, stencil: boolean) => {
      assert.deepEqual([color, depth, stencil], [true, false, false]);
      clears++;
    },
    copyTextureToTexture: (from: Texture, to: Texture, region: null, at: Vector2) => {
      assert.equal(region, null);
      assert.equal(from.image.width, 512);
      assert.equal(from.image.height, 512);
      copies.push({ from, to, at: at.clone(), mipmaps: to.generateMipmaps });
    },
    render: (scene: Scene) => {
      assert.notEqual(target, originalTarget);
      assert.equal(mrt, null);
      renders.push({ meshes: [...scene.children] as Mesh[], clear: r.autoClear, mipmaps: target!.textures.map((t) => t.generateMipmaps) });
    },
  };
  return {
    r: r as unknown as WebGPURenderer, compiled, compiledTargets, renders, copies, initialized,
    clears: () => clears,
    pause: (p: Promise<void>) => { pause = p; },
    fail: () => { fail = true; },
    restored: () => {
      assert.equal(target, originalTarget);
      assert.equal(mrt, originalMrt);
      assert.equal(alpha, 0.7);
      assert.equal(color.getHex(), 0x123456);
      assert.equal(r.autoClear, true);
    },
  };
}

function sources() {
  const material = tag(new MeshStandardMaterial(), { kit: 'A' });
  let materialDisposed = 0, geometryDisposed = 0;
  material.addEventListener('dispose', () => { materialDisposed++; });
  const inputs: ImpostorSource[] = Array.from({ length: 2 }, (_, slot) => ({
    slot, centre: slot + 1, radius: slot + 3,
    parts: Array.from({ length: 2 }, () => {
      const geometry = new BoxGeometry();
      geometry.addEventListener('dispose', () => { geometryDisposed++; });
      return { geometry, material };
    }),
  }));
  return { inputs, materialDisposed: () => materialDisposed, geometryDisposed: () => geometryDisposed };
}

test('atlas bakes in a depth-bearing scratch slot, copies completed variants, and generates destination mips only at the end', async () => {
  const mock = rendererMock(), source = sources(), atlas = new ImpostorAtlas(2);
  let scratchDisposed = 0, bakeMaterialDisposed = 0;
  assert.equal(atlas.target.depthTexture, null);
  atlas.step(mock.r);
  assert.equal(mock.renders.length, 0);
  await atlas.prepare(mock.r, source.inputs);
  assert.equal(atlas.baked, false);
  assert.equal(mock.compiled.length, 4);
  mock.compiledTargets[0].addEventListener('dispose', () => { scratchDisposed++; });
  assert.equal(new Set(mock.compiled.map((m) => m.material)).size, 1, 'variant slot and bounds must not make fresh shader graphs');
  (mock.compiled[0].material as MeshStandardMaterial).addEventListener('dispose', () => { bakeMaterialDisposed++; });
  assert.equal(mock.renders.length, 0);
  assert.equal(source.geometryDisposed(), 0);
  mock.restored();
  for (let i = 0; i < 4; i++) {
    atlas.step(mock.r);
    assert.equal(mock.renders.length, i + 1);
    assert.equal(mock.renders[i].meshes.length, 1);
    assert.equal(mock.renders[i].meshes[0].count, VIEWS * VIEWS);
    assert.equal(mock.renders[i].clear, i % 2 === 0, 'clear scratch once per variant, retaining depth between parts');
    assert.deepEqual(mock.renders[i].mipmaps, [false, false]);
    assert.equal(mock.copies.length, Math.floor((i + 1) / 2) * 2);
    assert.equal(scratchDisposed, i === 3 ? 1 : 0);
    assert.equal(atlas.baked, i === 3);
    assert.equal(source.geometryDisposed(), i === 3 ? 4 : 0);
    mock.restored();
  }
  assert.equal(mock.initialized.length, 1);
  assert.equal(mock.initialized[0], atlas.target);
  assert.equal(mock.clears(), 1);
  assert.deepEqual(mock.copies.map((c) => c.mipmaps), [false, false, true, true]);
  assert.deepEqual(mock.copies.map((c) => c.at.toArray()), [[0, 512], [0, 512], [512, 512], [512, 512]]);
  assert.equal(bakeMaterialDisposed, 1);
  assert.equal(source.materialDisposed(), 0, 'source material belongs to the kits');
  atlas.step(mock.r);
  assert.equal(mock.renders.length, 4);
  atlas.dispose();
});

test('cancelling pending compilation prevents rendering and releases owned resources after compilation returns', async () => {
  const mock = rendererMock(), source = sources(), atlas = new ImpostorAtlas(2);
  let resume!: () => void;
  mock.pause(new Promise<void>((resolve) => { resume = resolve; }));
  const preparing = atlas.prepare(mock.r, source.inputs);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(mock.compiled.length, 1);
  mock.restored();
  atlas.dispose();
  atlas.dispose();
  atlas.step(mock.r);
  assert.equal(source.geometryDisposed(), 0, 'compilation still owns its source geometry');
  resume();
  await preparing;
  assert.equal(source.geometryDisposed(), 4);
  assert.equal(mock.renders.length, 0);
  assert.equal(atlas.baked, false);
  assert.equal(source.materialDisposed(), 0);
  mock.restored();
});

test('failed compilation restores renderer hooks and target and leaves the atlas unavailable', async () => {
  const mock = rendererMock(), source = sources(), atlas = new ImpostorAtlas(2);
  const internals = mock.r as unknown as { _finishPreCompile: unknown; debug: { onNodeBuilderCreated: unknown } };
  const finish = internals._finishPreCompile, created = internals.debug.onNodeBuilderCreated;
  mock.fail();
  await assert.rejects(atlas.prepare(mock.r, source.inputs), /compile failed/);
  assert.equal(internals._finishPreCompile, finish);
  assert.equal(internals.debug.onNodeBuilderCreated, created);
  atlas.step(mock.r);
  assert.equal(mock.renders.length, 0);
  assert.equal(atlas.baked, false);
  assert.equal(source.geometryDisposed(), 4);
  assert.equal(source.materialDisposed(), 0);
  mock.restored();
});


test('bake materials share structural graphs across source textures and use material references for bounds and translucency', async () => {
  const mock = rendererMock(), atlas = new ImpostorAtlas(2);
  const source = sources();
  const other = tag(new MeshStandardMaterial({ color: 0x00ff00 }), { kit: 'A', translucency: 0.8 });
  source.inputs[1].parts.forEach((p) => { p.material = other; });
  await atlas.prepare(mock.r, source.inputs);
  const materials = [...new Set(mock.compiled.map((m) => m.material as MeshStandardMaterial))];
  assert.equal(materials.length, 2);
  assert.equal(new Set(materials.map((m) => m.customProgramCacheKey())).size, 1);
  assert.notEqual(materials[0].userData.floraBakeView, materials[1].userData.floraBakeView);
  assert.equal(materials[0].userData.floraBakeThrough, 0);
  assert.equal(materials[1].userData.floraBakeThrough, 0.8);
  atlas.dispose();
});

test('scratch copies preserve atlas row order and leave the destination cleared only once', async () => {
  const mock = rendererMock(), source = sources(), atlas = new ImpostorAtlas(3);
  const third = { ...source.inputs[0], slot: 2, parts: source.inputs[0].parts.map((p) => ({ material: p.material, geometry: p.geometry.clone() })) };
  await atlas.prepare(mock.r, [...source.inputs, third]);
  for (let i = 0; i < 6; i++) atlas.step(mock.r);
  assert.equal(atlas.baked, true);
  assert.equal(mock.clears(), 1);
  assert.deepEqual(mock.copies.map((c) => c.at.toArray()), [[0, 512], [0, 512], [512, 512], [512, 512], [0, 0], [0, 0]]);
  assert.deepEqual(mock.copies.map((c) => c.mipmaps), [false, false, false, false, true, true]);
  assert.equal(new Set(mock.compiledTargets).size, 1, 'all variants reuse one slot-sized depth attachment');
  mock.restored();
  atlas.dispose();
});

// The reflection probe follows its sky, without repeating 27 render passes for an unchanged environment.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PMREMGenerator, PerspectiveCamera, RenderTarget, Vector3, type WebGPURenderer } from 'three/webgpu';
import { Atmosphere, CLEAR_AIR } from '../src/render/atmosphere/index.ts';
import { AURORA } from '../src/render/atmosphere/aurora.ts';
import { probeEye } from '../src/render/atmosphere/sky.ts';
import { EYE } from '../src/render/atmosphere/luts.ts';
import { P } from '../src/render/gpu/uniforms.ts';
import { R } from '../src/sim/sphere.ts';

function fixture(run: (a: Atmosphere, camera: PerspectiveCamera, captures: Vector3[], frame: (n?: number) => void) => void): void {
  const fromScene = PMREMGenerator.prototype.fromScene;
  const captures: Vector3[] = [];
  const vectors = [P.sunDir, P.moonDir, P.sunIlluminance, P.moonIlluminance, P.seaDeep];
  const saved = vectors.map((u) => (u.value as Vector3).clone());
  const phase = P.moonPhase.value, aurora = AURORA.strength.value;
  PMREMGenerator.prototype.fromScene = (_scene, _sigma, _near, _far, options) => {
    const o = options as { position: Vector3; renderTarget?: RenderTarget };
    captures.push(o.position.clone());
    return o.renderTarget ?? new RenderTarget(1, 1);
  };
  try {
    const renderer = { library: { addLight() {} }, compute() {}, shadowMap: {} } as unknown as WebGPURenderer;
    const a = new Atmosphere(renderer), camera = new PerspectiveCamera();
    camera.position.set(0, R + 10, 0);
    (P.sunDir.value as Vector3).set(0, 1, 0);
    (P.moonDir.value as Vector3).set(0, -1, 0);
    AURORA.strength.value = 0;
    run(a, camera, captures, (n = 1) => { for (let i = 0; i < n; i++) a.update(camera, 1 / 30); });
  } finally {
    PMREMGenerator.prototype.fromScene = fromScene;
    vectors.forEach((u, i) => (u.value as Vector3).copy(saved[i]));
    P.moonPhase.value = phase;
    AURORA.strength.value = aurora;
  }
}

test('stationary daylight keeps its filtered sky across ten seconds', () => fixture((_a, _camera, captures, frame) => {
  frame(300);
  assert.equal(captures.length, 1, 'unchanged daylight needs one capture, instead of fourteen');
}));

test('fast vertical drop and camera turns retain the surface reflection while eye uniforms follow immediately', () => fixture((_a, camera, captures, frame) => {
  camera.position.set(0, R + 5000, 0);
  frame();
  for (let i = 0; i < 90; i++) {
    camera.position.y = R + 5000 * (1 - i / 89);
    camera.rotation.y += 0.1;
    frame();
    assert.equal((EYE.position.value as Vector3).y, camera.position.y);
  }
  assert.equal(captures.length, 1);
  assert.equal(captures[0].length(), R + 2, 'probe stays at the existing sea-surface height');
  assert.equal((probeEye.value as Vector3).length(), R + 2);
}));

test('continuous orbital movement coalesces captures to at most once a second', () => fixture((_a, camera, captures, frame) => {
  for (let i = 0; i < 90; i++) {
    camera.position.set(Math.sin(i * 0.01), Math.cos(i * 0.01), 0).multiplyScalar(R + 1000);
    frame();
  }
  assert.ok(captures.length >= 2, 'changed ground frame refreshes the probe');
  assert.ok(captures.length <= 3, 'movement cannot request a full filtered sky every few frames');
}));

test('sun, moon, sea colour, illumination and aurora changes refresh within the bounded cadence', () => fixture((_a, _camera, captures, frame) => {
  frame(31);
  const changes = [
    () => (P.sunDir.value as Vector3).set(0.02, 1, 0).normalize(),
    () => (P.moonDir.value as Vector3).set(0.02, -1, 0).normalize(),
    () => (P.seaDeep.value as Vector3).multiplyScalar(1.1),
    () => (P.sunIlluminance.value as Vector3).multiplyScalar(1.1),
    () => { P.moonPhase.value = (P.moonPhase.value as number) - 0.1; },
    () => { AURORA.strength.value = 0.5; },
  ];
  for (const change of changes) {
    const before = captures.length;
    change(); frame(31);
    assert.equal(captures.length, before + 1);
  }
}));

test('night animation retains a two-second refresh and changed air invalidates immediately', () => fixture((a, _camera, captures, frame) => {
  (P.sunDir.value as Vector3).set(0, -1, 0);
  frame(301);
  assert.equal(captures.length, 6, 'night retains bounded updates for stars and aurora');
  const before = captures.length;
  a.air = { ...CLEAR_AIR };
  frame();
  assert.equal(captures.length, before + 1, 'new atmospheric tables invalidate the old filtered sky');
}));

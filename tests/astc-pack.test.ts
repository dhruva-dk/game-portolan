import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { mipChain, encodeAstc } from '../tools/astc.ts';
import { parseAstc } from '../src/render/gpu/astc.ts';
import { PHOTOGRAPHS } from '../src/render/gpu/photographs.ts';

test('rectangular mip packing keeps both axes through the one-pixel tail', () => {
  const pixels = new Uint8Array(4 * 8 * 4);
  for (let y = 0; y < 8; y++) for (let x = 0; x < 4; x++) pixels.set([y * 20, x * 40, 80, 255], (y * 4 + x) * 4);
  const levels = mipChain(pixels, 4, 8, [false, false, false, false]);
  assert.deepEqual(levels.map((m) => [m.width, m.height]), [[4, 8], [2, 4], [1, 2], [1, 1]]);
  assert.deepEqual([...levels[1].data.subarray(0, 4)], [10, 20, 80, 255]);
  assert.deepEqual([...levels.at(-1)!.data], [70, 60, 80, 255]);
});

test('color mips average light while normal channels keep their linear values', () => {
  const pixels = new Uint8Array([0, 0, 0, 255, 255, 255, 255, 255, 0, 0, 0, 255, 255, 255, 255, 255]);
  const color = mipChain(pixels, 2, 2, [true, true, true, false]).at(-1)!.data;
  const normal = mipChain(pixels, 2, 2, [false, false, false, false]).at(-1)!.data;
  assert.ok(color[0] >= 187 && color[0] <= 188);
  assert.deepEqual([...normal], [128, 128, 128, 255]);
  assert.equal(color[3], 255);
});

test('native ASTC encoding produces a complete rectangular chain with one base header', async () => {
  const work = await mkdtemp(join(tmpdir(), 'portolan-astc-test-'));
  try {
    const data = new Uint8Array(8 * 16 * 4).fill(255);
    const mips = mipChain(data, 8, 16, [true, true, true, false]);
    const encoded = await encodeAstc(mips, true, work, resolve('node_modules/.bin/astcenc'), true);
    const parsed = parseAstc(encoded);
    assert.deepEqual([parsed.width, parsed.height], [8, 16]);
    assert.deepEqual(parsed.mipmaps.map((m) => [m.width, m.height]), mips.map((m) => [m.width, m.height]));
    assert.equal(encoded.length, 16 + parsed.mipmaps.reduce((sum, m) => sum + m.data.length, 0));
    const raw = await encodeAstc(mips, true, work, resolve('node_modules/.bin/astcenc'));
    assert.deepEqual(raw, encoded.subarray(16), 'terrain retains its existing headerless chain format');
  } finally { await rm(work, { recursive: true, force: true }); }
});

test('static compression selects only the 59 unique opaque photographs and preserves linear normal metadata', () => {
  assert.equal(PHOTOGRAPHS.length, 59);
  assert.equal(new Set(PHOTOGRAPHS.map((p) => p.file)).size, 59);
  for (const p of PHOTOGRAPHS) {
    assert.equal(p.srgb, p.file.endsWith('_d.jpg'));
    assert.match(p.file, /^tex\/.+_(?:d|n)\.jpg$/);
  }
});

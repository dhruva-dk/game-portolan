import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LinearFilter, LinearMipmapLinearFilter, NoColorSpace, RepeatWrapping, RGBAFormat, RGBA_ASTC_4x4_Format, SRGBColorSpace } from 'three/webgpu';
import { loadAstc, parseAstc } from '../src/render/gpu/astc.ts';

function payload(width: number, height: number): Uint8Array {
  const levels: { width: number; height: number; bytes: number }[] = [];
  for (let w = width, h = height; ; w = Math.max(1, w >> 1), h = Math.max(1, h >> 1)) {
    levels.push({ width: w, height: h, bytes: Math.ceil(w / 4) * Math.ceil(h / 4) * 16 });
    if (w === 1 && h === 1) break;
  }
  const out = new Uint8Array(16 + levels.reduce((sum, l) => sum + l.bytes, 0));
  out.set([0x13, 0xab, 0xa1, 0x5c, 4, 4, 1]);
  const u24 = (at: number, value: number) => { out[at] = value; out[at + 1] = value >> 8; out[at + 2] = value >> 16; };
  u24(7, width); u24(10, height); u24(13, 1);
  let at = 16;
  levels.forEach((level, i) => { out.fill(i + 1, at, at + level.bytes); at += level.bytes; });
  return out;
}

test('ASTC parser preserves rectangular native dimensions and every mip down through 1 by 1', () => {
  const data = payload(1024, 2048), parsed = parseAstc(data);
  assert.deepEqual([parsed.width, parsed.height], [1024, 2048]);
  assert.equal(parsed.mipmaps.length, 12);
  assert.deepEqual(parsed.mipmaps.map((m) => [m.width, m.height]), [[1024, 2048], [512, 1024], [256, 512], [128, 256], [64, 128], [32, 64], [16, 32], [8, 16], [4, 8], [2, 4], [1, 2], [1, 1]]);
  parsed.mipmaps.forEach((m, i) => {
    assert.equal(m.data.byteLength, Math.ceil(m.width / 4) * Math.ceil(m.height / 4) * 16);
    assert.ok(m.data.every((value) => value === i + 1), `mip ${i} starts at the correct block offset`);
  });
});

test('ASTC parser rejects malformed headers and incomplete or extra mip blocks', () => {
  const original = payload(8, 16);
  for (const index of [0, 4, 5, 6, 13]) {
    const changed = original.slice(); changed[index]++;
    assert.throws(() => parseAstc(changed));
  }
  assert.throws(() => parseAstc(original.subarray(0, 15)));
  assert.throws(() => parseAstc(original.subarray(0, original.length - 1)));
  const extra = new Uint8Array(original.length + 16); extra.set(original);
  assert.throws(() => parseAstc(extra));
});

test('ASTC loading keeps flora unreadable until complete and preserves caller sampler settings', async () => {
  const fetchWas = globalThis.fetch;
  let deliver!: (response: Response) => void;
  const requested: string[] = [];
  globalThis.fetch = (async (url: unknown) => {
    requested.push(String(url));
    return new Promise<Response>((resolve) => { deliver = resolve; });
  }) as typeof fetch;
  try {
    let loaded!: () => void, failed!: (error: unknown) => void;
    const done = new Promise<void>((resolve, reject) => { loaded = resolve; failed = reject; });
    const texture = loadAstc('/tex/flora/a/cedar_bark_d.jpg', true, loaded, failed);
    // This is field.ts's readiness condition: width zero and no data must keep atlas baking gated.
    const ready = () => !!texture.image && (!!texture.image.data || texture.image.width > 0);
    assert.equal(ready(), false);
    assert.equal(texture.version, 0);
    assert.equal(texture.format, RGBAFormat, "pending material compilation must use the valid RGBA default texture");
    assert.equal(texture.mipmaps.length, 0);
    texture.wrapS = texture.wrapT = RepeatWrapping;
    texture.minFilter = LinearMipmapLinearFilter;
    texture.magFilter = LinearFilter;
    texture.anisotropy = 8;
    texture.repeat.set(2, 3);
    deliver(new Response(payload(8, 16)));
    await done;
    assert.deepEqual(requested, ['/tex/flora/a/cedar_bark_d.astc']);
    assert.equal(ready(), true);
    assert.deepEqual([texture.image.width, texture.image.height], [8, 16]);
    assert.equal(texture.mipmaps.length, 5);
    assert.equal(texture.format, RGBA_ASTC_4x4_Format);
    assert.equal(texture.colorSpace, SRGBColorSpace);
    assert.equal(texture.flipY, false, 'the packer provides the vertical flip; compressed uploads cannot flip pixels');
    assert.equal(texture.generateMipmaps, false);
    assert.deepEqual([texture.wrapS, texture.wrapT, texture.minFilter, texture.magFilter, texture.anisotropy], [RepeatWrapping, RepeatWrapping, LinearMipmapLinearFilter, LinearFilter, 8]);
    assert.deepEqual(texture.repeat.toArray(), [2, 3]);
  } finally { globalThis.fetch = fetchWas; }
});

test('linear normal maps use linear color space and malformed fetches never publish ready dimensions', async () => {
  const fetchWas = globalThis.fetch;
  try {
    globalThis.fetch = (async () => new Response(payload(4, 8))) as typeof fetch;
    let loaded!: () => void;
    const done = new Promise<void>((resolve) => { loaded = resolve; });
    const normal = loadAstc('/tex/flora/a/cedar_bark_n.jpg', false, loaded);
    await done;
    assert.equal(normal.colorSpace, NoColorSpace);
    assert.equal(normal.format, RGBA_ASTC_4x4_Format);
    globalThis.fetch = (async () => new Response(new Uint8Array(16))) as typeof fetch;
    let rejected!: () => void;
    const failure = new Promise<void>((resolve) => { rejected = resolve; });
    let onLoad = false;
    const bad = loadAstc('/tex/bad.jpg', true, () => { onLoad = true; }, rejected);
    await failure;
    assert.equal(onLoad, false);
    assert.equal(bad.image.width, 0);
    assert.equal(bad.mipmaps.length, 0);
  } finally { globalThis.fetch = fetchWas; }
});

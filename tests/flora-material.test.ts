import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DoubleSide, MeshStandardMaterial, Texture } from 'three/webgpu';
import { vec3, vec4, uint } from 'three/tsl';
import { floraMaterial, type FloraNodeMaterial, type FieldNodes } from '../src/render/flora/nodes.ts';
import { tag } from '../src/render/flora/tag.ts';

function field(): FieldNodes {
  return {
    copies: { element: () => vec4(0, 0, 0, 1) },
    shown: { element: () => uint(0) },
    base: { element: () => uint(0) },
    fade: { element: () => vec4(-1, 1, 100, 1) },
    eye: vec3(0),
  } as unknown as FieldNodes;
}
function leaf(translucency: number, color: number) {
  return tag(new MeshStandardMaterial({ map: new Texture(), color, side: DoubleSide, alphaTest: 0.45 }), {
    kit: 'D', cutout: 1024, translucency,
  });
}

test('different leaf textures and tints share a shader graph while retaining their material properties', () => {
  const f = field(), a = leaf(0.4, 0xff0000), b = leaf(0.7, 0x00ff00);
  const ma = floraMaterial(a, f), mb = floraMaterial(b, f);
  assert.notEqual(ma, mb);
  assert.equal(ma.customProgramCacheKey(), mb.customProgramCacheKey());
  assert.equal((ma as MeshStandardMaterial).map, a.map);
  assert.equal((mb as MeshStandardMaterial).map, b.map);
  assert.equal((ma as MeshStandardMaterial).color.getHex(), a.color.getHex());
  assert.equal((mb as MeshStandardMaterial).color.getHex(), b.color.getHex());
});

test('material reuse is scoped to the field buffers, and structural wind or leaf differences remain distinct', () => {
  const f = field(), a = leaf(0.4, 0xff0000);
  const m = floraMaterial(a, f);
  assert.equal(floraMaterial(a, f), m);
  assert.notEqual(floraMaterial(a, field()), m);
  const plain = tag(new MeshStandardMaterial(), { kit: 'D' });
  const otherWind = tag(new MeshStandardMaterial(), { kit: 'A' });
  assert.notEqual(floraMaterial(plain, f).customProgramCacheKey(), m.customProgramCacheKey());
  assert.notEqual(floraMaterial(plain, f).customProgramCacheKey(), floraMaterial(otherWind, f).customProgramCacheKey());
});


test('shared translucency follows the mesh material during a shadow override', () => {
  const f = field();
  const a = floraMaterial(leaf(0.4, 0xff0000), f) as FloraNodeMaterial;
  const b = floraMaterial(leaf(0.7, 0x00ff00), f) as FloraNodeMaterial;
  const source = a.through as unknown as {
    updateReference(state: unknown): void;
    getValueFromReference(): number;
  };
  const shadowMaterial = new MeshStandardMaterial(); // shadow overrides have none of the foliage's tag properties
  source.updateReference({ material: shadowMaterial, object: { material: a } });
  assert.equal(source.getValueFromReference(), 0.4);
  source.updateReference({ material: shadowMaterial, object: { material: b } });
  assert.equal(source.getValueFromReference(), 0.7);
});

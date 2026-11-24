import {
  ClampToEdgeWrapping,
  DataArrayTexture,
  HalfFloatType,
  LinearFilter,
  RGBAFormat,
  RedFormat,
  UnsignedByteType,
} from 'three/webgpu';
import { float, normalize, texture } from 'three/tsl';
import { faceUV } from '../view/cube.ts';
import type { Land } from '../../world/land.ts';
import { R } from '../../world/sphere.ts';
import {
  tangentFrame,
  type FloatNode,
  type Vec3Node,
  type Vec4Node,
} from '../tsl.ts';

const NODES = 768;
const TEXEL = ((Math.PI / 2) * R) / (NODES - 1);

export interface Ground {
  height(p: Vec3Node): FloatNode;
  cover(p: Vec3Node): Vec4Node;
  normal(p: Vec3Node): Vec3Node;
  ready: Promise<number>;
}

function layers(data: Uint16Array | Uint8Array, rgba: boolean) {
  const t = new DataArrayTexture(data, NODES, NODES, 6);
  t.format = rgba ? RGBAFormat : RedFormat;
  t.type = rgba ? UnsignedByteType : HalfFloatType;
  t.wrapS = t.wrapT = ClampToEdgeWrapping;
  t.magFilter = t.minFilter = LinearFilter;
  t.generateMipmaps = false;
  return t;
}

export function createGround(seed: number, land: Land): Ground {
  const heights = layers(new Uint16Array(6 * NODES * NODES), false);
  const covers = layers(new Uint8Array(6 * NODES * NODES * 4), true);
  const worker = new Worker(new URL('./bake.ts', import.meta.url), {
    type: 'module',
  });
  const ready = new Promise<number>((resolve, reject) => {
    worker.onmessage = (
      e: MessageEvent<{ height: Uint16Array; cover: Uint8Array; ms: number }>
    ) => {
      heights.image.data = e.data.height;
      covers.image.data = e.data.cover;
      heights.needsUpdate = covers.needsUpdate = true;
      worker.terminate();
      resolve(e.data.ms);
    };
    worker.onerror = (e) => reject(new Error(e.message));
  });
  worker.postMessage({ seed, land, n: NODES });

  const at = (p: Vec3Node) => {
    const { face, uv } = faceUV(normalize(p));
    return { face, st: uv.mul((0.5 * (NODES - 1)) / NODES).add(0.5) };
  };
  const read = (t: DataArrayTexture, p: Vec3Node): Vec4Node => {
    const { face, st } = at(p);
    return texture(t, st).depth(face).level(float(0));
  };
  const height = (p: Vec3Node): FloatNode => read(heights, p).x;
  return {
    height,
    cover: (p) => read(covers, p),
    normal: (p) => {
      const u = normalize(p);
      const { e1: t1, e2: t2 } = tangentFrame(u);
      const e = TEXEL / R;
      const d1 = height(u.add(t1.mul(e)))
        .sub(height(u.sub(t1.mul(e))))
        .div(2 * TEXEL);
      const d2 = height(u.add(t2.mul(e)))
        .sub(height(u.sub(t2.mul(e))))
        .div(2 * TEXEL);
      return normalize(u.sub(t1.mul(d1)).sub(t2.mul(d2)));
    },
    ready,
  };
}

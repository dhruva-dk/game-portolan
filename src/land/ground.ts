// The planet's ground for the shaders: world/planet.ts baked onto the six faces of the cube (bakeFaces, in a Worker:
// bake.ts) and read back by direction through view/cube.ts's faceUV, the same equi-angular mapping.
//
//   height  R16F, metres above the sea (half floats keep a centimetre to 16 m down and 3 cm in the deepest basins; 32-bit
//           floats can't be filtered in WebGPU without an optional feature)
//   cover   RGBA8: sea grass, rubble, the sand's mottling, the grass's clumps (planet.ts Cover)
//
// Each face is a layer of an array texture, its n × n nodes laid corner to corner on texel centres, so a face's edge
// nodes are the very directions its neighbour's are, holding the same values: read with clamp-to-edge and filtered
// within the face, the ground is continuous across every edge and corner. Read at mip 0 only (there are no mips:
// a face's texels are about a metre, finer than anything that would alias), which is safe in a vertex shader and
// needs no derivatives in a fragment's branches.

import { ClampToEdgeWrapping, DataArrayTexture, HalfFloatType, LinearFilter, RGBAFormat, RedFormat, UnsignedByteType } from 'three/webgpu';
import { abs, cross, float, normalize, select, texture, vec3 } from 'three/tsl';
import { faceUV } from '../view/cube';
import { R } from '../world/sphere';

type N = any;

/** Nodes along a face's edge: texels of about (π/2)·R / (n − 1), 1.1 m at R = 554. */
const NODES = 768;
/** A texel's width at a face's middle, metres. */
const TEXEL = ((Math.PI / 2) * R) / (NODES - 1);

export interface Ground {
  /** Metres above the sea at world position (or direction) p. */
  height(p: N): N;
  /** What lies on the ground at p: sea grass, rubble, mottling, clumps (each 0…1). */
  cover(p: N): N;
  /** The ground's normal at p (world), from its heights a texel either side. */
  normal(p: N): N;
  /** Resolves once the faces are baked and uploaded; how long the bake took, ms. */
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

export function createGround(seed: number): Ground {
  const heights = layers(new Uint16Array(6 * NODES * NODES), false);
  const covers = layers(new Uint8Array(6 * NODES * NODES * 4), true);
  const worker = new Worker(new URL('./bake.ts', import.meta.url), { type: 'module' });
  const ready = new Promise<number>((resolve, reject) => {
    worker.onmessage = (e: MessageEvent<{ height: Uint16Array; cover: Uint8Array; ms: number }>) => {
      heights.image.data = e.data.height;
      covers.image.data = e.data.cover;
      heights.needsUpdate = covers.needsUpdate = true;
      worker.terminate();
      resolve(e.data.ms);
    };
    worker.onerror = (e) => reject(new Error(e.message));
  });
  worker.postMessage({ seed, n: NODES });

  /** The texel coordinates on its face of direction p, and the face. */
  const at = (p: N) => {
    const { face, uv } = faceUV(normalize(p));
    return { face, st: uv.mul(0.5 * (NODES - 1) / NODES).add(0.5) };
  };
  const read = (t: DataArrayTexture, p: N): N => {
    const { face, st } = at(p);
    return texture(t, st).depth(face).level(float(0));
  };
  const height = (p: N): N => read(heights, p).x;
  return {
    height,
    cover: (p) => read(covers, p),
    normal: (p) => {
      // central differences a texel apart, along two tangents
      const u: N = normalize(p);
      const side: N = select(abs(u.y).lessThan(0.9), vec3(0, 1, 0), vec3(1, 0, 0));
      const t1 = normalize(cross(side, u)), t2 = cross(u, t1);
      const e = TEXEL / R;
      const d1 = height(u.add(t1.mul(e))).sub(height(u.sub(t1.mul(e)))).div(2 * TEXEL);
      const d2 = height(u.add(t2.mul(e))).sub(height(u.sub(t2.mul(e)))).div(2 * TEXEL);
      return normalize(u.sub(t1.mul(d1)).sub(t2.mul(d2)));
    },
    ready,
  };
}

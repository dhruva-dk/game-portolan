// A batch of camera-facing sprites laid out on the CPU and sorted back to front each frame, for the few big soft
// things (cloud puffs, rain curtains) whose overlaps must blend in order. Each instance is a few vec4 attributes;
// the first one's xyz is the instance's world position, which the sort reads.
import * as THREE from 'three';
import { instancedQuad, shaderMesh } from './common.ts';

export class SpriteBatch {
  readonly mesh: THREE.Mesh;
  readonly geometry: THREE.InstancedBufferGeometry;
  count = 0;
  private readonly stride: number;
  private readonly staging: Float32Array;
  private readonly attrs: THREE.InstancedBufferAttribute[];
  private readonly keys: Float32Array;
  private readonly order: number[] = [];
  readonly capacity: number;

  constructor(capacity: number, names: readonly string[], material: THREE.Material, renderOrder: number) {
    this.capacity = capacity;
    this.stride = names.length * 4;
    this.staging = new Float32Array(capacity * this.stride);
    this.keys = new Float32Array(capacity);
    this.geometry = instancedQuad(0);
    this.attrs = names.map((name) => {
      const a = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4);
      a.setUsage(THREE.DynamicDrawUsage);
      this.geometry.setAttribute(name, a);
      return a;
    });
    this.mesh = shaderMesh(this.geometry, material, renderOrder);
  }

  begin(): void {
    this.count = 0;
  }

  /** Room for one more instance: returns the offset to write its stride of floats at, or -1 when full. */
  slot(): number {
    if (this.count >= this.capacity) return -1;
    return this.count++ * this.stride;
  }

  get data(): Float32Array {
    return this.staging;
  }

  /** Sorts far to near from the eye and uploads. */
  end(eye: THREE.Vector3): void {
    const n = this.count, s = this.stride, st = this.staging, keys = this.keys, order = this.order;
    order.length = n;
    for (let i = 0; i < n; i++) {
      const o = i * s, dx = st[o] - eye.x, dy = st[o + 1] - eye.y, dz = st[o + 2] - eye.z;
      keys[i] = dx * dx + dy * dy + dz * dz;
      order[i] = i;
    }
    order.sort((a, b) => keys[b] - keys[a]);
    for (let k = 0; k < this.attrs.length; k++) {
      const arr = this.attrs[k].array as Float32Array;
      for (let i = 0; i < n; i++) {
        const src = order[i] * s + k * 4, dst = i * 4;
        arr[dst] = st[src];
        arr[dst + 1] = st[src + 1];
        arr[dst + 2] = st[src + 2];
        arr[dst + 3] = st[src + 3];
      }
      this.attrs[k].clearUpdateRanges();
      this.attrs[k].addUpdateRange(0, n * 4);
      this.attrs[k].needsUpdate = true;
    }
    this.geometry.instanceCount = n;
    this.mesh.visible = n > 0;
  }
}

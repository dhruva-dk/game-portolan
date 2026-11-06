// Damage numbers: blue for what the shield took, white for the hull, popping out of the hit and rising. Drawn as
// screen-sized glyphs anchored in the world, so they read the same at phone size near or far. One draw call.
import * as THREE from 'three';
import { rand } from './common.ts';
import { numberNodeMaterial } from './tsl/numbers.ts';

const GLYPHS = '0123456789+!';
const CAP = 256;

function makeDigits(): THREE.CanvasTexture {
  const C = 64, cv = document.createElement('canvas');
  cv.width = C * 4; cv.height = C * 4;
  const g = cv.getContext('2d')!;
  g.font = `900 ${C * 0.86}px system-ui, -apple-system, "Helvetica Neue", Arial, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  [...GLYPHS].forEach((ch, i) => {
    const x = (i % 4) * C + C / 2, y = Math.floor(i / 4) * C + C / 2 + C * 0.04;
    g.lineWidth = C * 0.16;
    g.strokeStyle = 'rgba(0,0,0,0.85)';
    g.strokeText(ch, x, y);
    g.fillStyle = '#fff';
    g.fillText(ch, x, y);
  });
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.NoColorSpace;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  return t;
}

interface Num { at: THREE.Vector3; up: THREE.Vector3; text: string; col: THREE.Color; age: number; size: number; jx: number }

export const SHIELD_BLUE = new THREE.Color(0.35, 0.72, 1.6);
export const HULL_WHITE = new THREE.Color(1.15, 1.15, 1.15);

export class Numbers {
  readonly mesh: THREE.Mesh;
  private readonly list: Num[] = [];
  private readonly anchor: THREE.InstancedBufferAttribute;
  private readonly glyph: THREE.InstancedBufferAttribute;
  private readonly col: THREE.InstancedBufferAttribute;
  private readonly geo: THREE.InstancedBufferGeometry;

  constructor() {
    const geo = (this.geo = new THREE.InstancedBufferGeometry());
    geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    const attr = (k: number) => new THREE.InstancedBufferAttribute(new Float32Array(CAP * k), k).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('iAnchor', (this.anchor = attr(3)));
    geo.setAttribute('iGlyph', (this.glyph = attr(3)));
    geo.setAttribute('iCol', (this.col = attr(4)));
    geo.instanceCount = 0;
    const m = numberNodeMaterial(makeDigits());
    this.mesh = new THREE.Mesh(geo, m);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 20;
  }

  /** A number at a world point: `shield` true for blue, false for white; crits come bigger with a bang. */
  add(at: THREE.Vector3, amount: number, shield: boolean, crit = false): void {
    if (amount <= 0) return;
    const up = at.clone().normalize();
    this.list.push({
      at: at.clone().addScaledVector(up, 2.5), up, text: Math.round(amount) + (crit ? '!' : ''),
      col: (shield ? SHIELD_BLUE : HULL_WHITE).clone(), age: 0, size: crit ? 0.06 : 0.045, jx: rand(-1.2, 1.2),
    });
    if (this.list.length > 48) this.list.shift();
  }

  update(dt: number): void {
    const A = this.anchor.array as Float32Array, G = this.glyph.array as Float32Array, C = this.col.array as Float32Array;
    let n = 0;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const d = this.list[i];
      d.age += dt;
      if (d.age > 1.1) { this.list.splice(i, 1); continue; }
      // pop big, settle, rise and fade
      const pop = d.age < 0.1 ? 1 + 0.7 * (1 - d.age / 0.1) : 1;
      const fade = 1 - THREE.MathUtils.smoothstep(d.age, 0.75, 1.1);
      const rise = 3.5 * (1 - (1 - Math.min(1, d.age / 1.1)) ** 2);
      const x = d.at.x + d.up.x * rise, y = d.at.y + d.up.y * rise, z = d.at.z + d.up.z * rise;
      const len = d.text.length;
      for (let k = 0; k < len && n < CAP; k++, n++) {
        A[n * 3] = x; A[n * 3 + 1] = y; A[n * 3 + 2] = z;
        G[n * 3] = k - (len - 1) / 2 + d.jx; G[n * 3 + 1] = GLYPHS.indexOf(d.text[k]); G[n * 3 + 2] = d.size * pop;
        C[n * 4] = d.col.r; C[n * 4 + 1] = d.col.g; C[n * 4 + 2] = d.col.b; C[n * 4 + 3] = fade;
      }
    }
    this.geo.instanceCount = n;
    for (const a of [this.anchor, this.glyph, this.col]) a.needsUpdate = true;
  }
}

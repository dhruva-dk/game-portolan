// Sprites by the thousand, ported from the rewrite's particles and set on the sphere: gravity pulls toward the
// planet's centre, spray that lands rides the sea surface, and the flat kind (rings, halos) lies in the water's
// tangent plane. Two pools: glow (added, for fire, sparks and light) and smoke (blended, lit by the sun where it is).
import * as THREE from 'three';
import { AU, TAU, seaRadius } from './common.ts';

/** Eight soft white shapes on a 4×2 sheet: puff, smoke, spark, ring, spray, star, shard, flame. */
export const SPRITE = { puff: 0, smoke: 1, spark: 2, ring: 3, spray: 4, star: 5, shard: 6, flame: 7 } as const;

function makeAtlas(): THREE.CanvasTexture {
  const C = 128, cv = document.createElement('canvas');
  cv.width = C * 4; cv.height = C * 2;
  const g = cv.getContext('2d')!;
  const cell = (i: number, draw: () => void) => {
    g.save();
    g.translate((i % 4) * C + C / 2, Math.floor(i / 4) * C + C / 2);
    g.beginPath(); g.rect(-C / 2, -C / 2, C, C); g.clip();
    draw();
    g.restore();
  };
  const blob = (x: number, y: number, r: number, a: number) => {
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, `rgba(255,255,255,${a})`);
    gr.addColorStop(0.5, `rgba(255,255,255,${a * 0.45})`);
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  };
  let s = 7;
  const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  cell(0, () => blob(0, 0, 60, 1));
  cell(1, () => { for (let k = 0; k < 22; k++) { const a = r() * TAU, d = r() * 26; blob(Math.cos(a) * d, Math.sin(a) * d, 18 + r() * 22, 0.32); } });
  cell(2, () => { blob(0, 0, 60, 0.5); blob(0, 0, 22, 1); });
  cell(3, () => {
    for (let k = 0; k < 6; k++) { g.strokeStyle = `rgba(255,255,255,${0.12 + k * 0.05})`; g.lineWidth = 14 - k * 2.2; g.beginPath(); g.arc(0, 0, 50, 0, TAU); g.stroke(); }
  });
  cell(4, () => { for (let k = 0; k < 40; k++) { const a = r() * TAU, d = Math.sqrt(r()) * 50; blob(Math.cos(a) * d, Math.sin(a) * d, 3 + r() * 7, 0.9); } });
  cell(5, () => {
    blob(0, 0, 30, 1);
    for (const ang of [0, Math.PI / 2]) {
      g.save(); g.rotate(ang);
      const gr = g.createLinearGradient(-60, 0, 60, 0);
      gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.beginPath(); g.ellipse(0, 0, 60, 4, 0, 0, TAU); g.fill();
      g.restore();
    }
  });
  cell(6, () => {
    g.fillStyle = '#fff';
    g.beginPath(); g.moveTo(-8, -54); g.lineTo(9, -40); g.lineTo(6, 50); g.lineTo(-3, 56); g.lineTo(-10, 20); g.closePath(); g.fill();
  });
  cell(7, () => {
    const gr = g.createRadialGradient(0, 18, 0, 0, 18, 46);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.6, 'rgba(255,255,255,0.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.beginPath(); g.moveTo(0, -58); g.bezierCurveTo(40, -10, 46, 30, 0, 62); g.bezierCurveTo(-46, 30, -40, -10, 0, -58); g.fill();
  });
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.NoColorSpace;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

const PART_VERT = /* glsl */ `
attribute vec4 iPos, iCol, iVel;
attribute vec3 iMisc;
uniform vec3 uSunDir, uSunColor;
varying vec4 vCol;
varying vec2 vUv;
varying float vFrame;
varying float vNear;
varying vec3 vLight;
void main() {
  vec3 wp = iPos.xyz;
  float size = iPos.w;
  vec2 q = position.xy;
  vec4 mv;
  vec3 up = normalize(wp);
  if (iMisc.z > 1.5) {
    // lying flat on the water
    vec3 t1 = normalize(cross(up, abs(up.y) > 0.9 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0))), t2 = cross(up, t1);
    float c = cos(iMisc.x), s = sin(iMisc.x);
    mv = viewMatrix * vec4(wp + (t1 * (c * q.x - s * q.y) + t2 * (s * q.x + c * q.y)) * size, 1.0);
  } else if (iMisc.z > 0.5) {
    // a streak trailing behind along the velocity, as seen on screen
    mv = viewMatrix * vec4(wp, 1.0);
    vec2 d = (mat3(viewMatrix) * iVel.xyz).xy;
    float L = length(d);
    vec2 dir = L > 1e-4 ? d / L : vec2(0.0, 1.0);
    float len = max(size, L * iVel.w);
    mv.xy += vec2(-dir.y, dir.x) * size * q.x + dir * len * (q.y - 1.0) * 0.5;
  } else {
    mv = viewMatrix * vec4(wp, 1.0);
    float c = cos(iMisc.x), s = sin(iMisc.x);
    mv.xy += vec2(c * q.x - s * q.y, s * q.x + c * q.y) * size;
  }
  gl_Position = projectionMatrix * mv;
  // anything brushing the lens thins out instead of filling the screen
  vNear = smoothstep(1.5, 8.0, -mv.z);
  vUv = q * 0.5 + 0.5;
  vCol = iCol;
  vFrame = iMisc.y;
  // smoke and spray are lit by the sun where they are, and the moon at night
  float day = smoothstep(-0.14, 0.15, dot(up, uSunDir));
  vLight = mix(vec3(0.07, 0.09, 0.15), uSunColor * 0.9 + vec3(0.18, 0.2, 0.24), day);
}`;

const PART_FRAG = /* glsl */ `
uniform sampler2D uAtlas;
varying vec4 vCol;
varying vec2 vUv;
varying float vFrame;
varying float vNear;
varying vec3 vLight;
void main() {
  vec2 cell = vec2(mod(vFrame, 4.0), floor(vFrame / 4.0 + 0.01));
  vec4 t = texture2D(uAtlas, (cell + 0.02 + vUv * 0.96) / vec2(4.0, 2.0));
  float a = t.a * vCol.a * vNear;
  if (a < 0.002) discard;
#ifdef GLOW
  gl_FragColor = vec4(vCol.rgb * a, 0.0);
#else
  gl_FragColor = vec4(vCol.rgb * vLight * a, a);
#endif
}`;

export interface Emit {
  x: number; y: number; z: number; vx?: number; vy?: number; vz?: number;
  life: number; size: number; grow?: number; // size at birth, and the factor it reaches at death (life 0: one frame)
  r: number; g: number; b: number; a?: number;
  frame: number; mode?: 0 | 1 | 2; stretch?: number; rot?: number; spin?: number;
  drag?: number; grav?: number; fadeIn?: number; float?: boolean;
}

const S = 23;

export class Particles {
  readonly mesh: THREE.Mesh;
  private n = 0;
  private readonly cap: number;
  private readonly f: Float32Array;
  private readonly pos: THREE.InstancedBufferAttribute;
  private readonly col: THREE.InstancedBufferAttribute;
  private readonly vel: THREE.InstancedBufferAttribute;
  private readonly misc: THREE.InstancedBufferAttribute;
  private readonly geo: THREE.InstancedBufferGeometry;
  readonly mat: THREE.ShaderMaterial;

  constructor(cap: number, glow: boolean, atlas: THREE.Texture) {
    this.cap = cap;
    this.f = new Float32Array(cap * S);
    const geo = (this.geo = new THREE.InstancedBufferGeometry());
    geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    const attr = (k: number) => { const a = new THREE.InstancedBufferAttribute(new Float32Array(cap * k), k); a.setUsage(THREE.DynamicDrawUsage); return a; };
    geo.setAttribute('iPos', (this.pos = attr(4)));
    geo.setAttribute('iCol', (this.col = attr(4)));
    geo.setAttribute('iVel', (this.vel = attr(4)));
    geo.setAttribute('iMisc', (this.misc = attr(3)));
    geo.instanceCount = 0;
    this.mat = new THREE.ShaderMaterial({
      vertexShader: PART_VERT, fragmentShader: PART_FRAG,
      uniforms: { uAtlas: { value: atlas }, uSunDir: AU.uSunDir, uSunColor: AU.uSunColor },
      defines: glow ? { GLOW: 1 } : {},
      transparent: true, depthWrite: false,
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor, blendDst: glow ? THREE.OneFactor : THREE.OneMinusSrcAlphaFactor,
    });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = glow ? 8 : 7;
  }

  get count(): number { return this.n; }

  emit(e: Emit): void {
    if (this.n >= this.cap) return;
    const o = this.n++ * S, f = this.f;
    f[o] = e.x; f[o + 1] = e.y; f[o + 2] = e.z;
    f[o + 3] = e.vx ?? 0; f[o + 4] = e.vy ?? 0; f[o + 5] = e.vz ?? 0;
    f[o + 6] = 0; f[o + 7] = e.life;
    f[o + 8] = e.size; f[o + 9] = e.grow ?? 1;
    f[o + 10] = e.r; f[o + 11] = e.g; f[o + 12] = e.b; f[o + 13] = e.a ?? 1;
    f[o + 14] = e.frame; f[o + 15] = e.mode ?? 0; f[o + 16] = e.stretch ?? 0;
    f[o + 17] = e.rot ?? Math.random() * TAU; f[o + 18] = e.spin ?? 0;
    f[o + 19] = e.drag ?? 0; f[o + 20] = e.grav ?? 0;
    f[o + 21] = e.float ? 1 : 0; f[o + 22] = e.fadeIn ?? 0.08;
  }

  update(dt: number): void {
    const f = this.f, P = this.pos.array as Float32Array, C = this.col.array as Float32Array, V = this.vel.array as Float32Array, M = this.misc.array as Float32Array;
    const p = { x: 0, y: 0, z: 0 };
    let w = 0;
    for (let i = 0; i < this.n; i++) {
      const o = i * S;
      const once = f[o + 7] === 0;
      if (!once) {
        f[o + 6] += dt;
        if (f[o + 6] >= f[o + 7]) { this.kill(i); i--; continue; }
        // drag, then gravity toward the planet's centre
        const drag = Math.max(0, 1 - f[o + 19] * dt);
        f[o + 3] *= drag; f[o + 4] *= drag; f[o + 5] *= drag;
        const r = Math.hypot(f[o], f[o + 1], f[o + 2]) || 1, ux = f[o] / r, uy = f[o + 1] / r, uz = f[o + 2] / r;
        const g = f[o + 20] * dt;
        f[o + 3] -= ux * g; f[o + 4] -= uy * g; f[o + 5] -= uz * g;
        f[o] += f[o + 3] * dt; f[o + 1] += f[o + 4] * dt; f[o + 2] += f[o + 5] * dt;
        f[o + 17] += f[o + 18] * dt;
        // spray that lands rides on the sea
        if (f[o + 21] > 0) {
          p.x = f[o]; p.y = f[o + 1]; p.z = f[o + 2];
          const sr = seaRadius(p) + 0.05, rr = Math.hypot(p.x, p.y, p.z);
          if (rr < sr) {
            const k = sr / rr;
            f[o] *= k; f[o + 1] *= k; f[o + 2] *= k;
            const vr = f[o + 3] * ux + f[o + 4] * uy + f[o + 5] * uz;
            if (vr < 0) { f[o + 3] -= ux * vr; f[o + 4] -= uy * vr; f[o + 5] -= uz * vr; }
          }
        }
      }
      const k = once ? 0 : f[o + 6] / f[o + 7];
      const fadeIn = f[o + 22];
      const alpha = f[o + 13] * (once ? 1 : Math.min(1, fadeIn > 0 ? k / fadeIn : 1) * (1 - k) * (1 - k * 0.3));
      const size = f[o + 8] * (1 + (f[o + 9] - 1) * (1 - (1 - k) * (1 - k)));
      const q = w * 4;
      P[q] = f[o]; P[q + 1] = f[o + 1]; P[q + 2] = f[o + 2]; P[q + 3] = size;
      C[q] = f[o + 10]; C[q + 1] = f[o + 11]; C[q + 2] = f[o + 12]; C[q + 3] = alpha;
      V[q] = f[o + 3]; V[q + 1] = f[o + 4]; V[q + 2] = f[o + 5]; V[q + 3] = f[o + 16];
      M[w * 3] = f[o + 17]; M[w * 3 + 1] = f[o + 14]; M[w * 3 + 2] = f[o + 15];
      w++;
      if (once) { this.kill(i); i--; }
    }
    this.geo.instanceCount = w;
    for (const a of [this.pos, this.col, this.vel]) { a.clearUpdateRanges(); a.addUpdateRange(0, w * 4); a.needsUpdate = true; }
    this.misc.clearUpdateRanges(); this.misc.addUpdateRange(0, w * 3); this.misc.needsUpdate = true;
  }

  /** Drops particle i by moving the last one into its place (so the caller re-visits i). */
  private kill(i: number): void {
    const last = --this.n;
    if (i !== last) this.f.copyWithin(i * S, last * S, last * S + S);
  }
}

export function makeParticles(): { glow: Particles; smoke: Particles } {
  const atlas = makeAtlas();
  return { glow: new Particles(6000, true, atlas), smoke: new Particles(4000, false, atlas) };
}

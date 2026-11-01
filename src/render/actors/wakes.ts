// Wakes: a ribbon of foam laid on the sea behind each ship, following the curved surface and its swell, spreading
// into a V as it ages and fading out. By day it is white foam lit by the sun; at night it glows in the colour of the
// ship's wake trail (a cosmetic), so ships stay readable in the dark. All ships draw in one call.
import * as THREE from 'three';
import { AU, SEA, sea } from './common.ts';
import type { WakeLook } from './cosmetics.ts';

const N = 48; // samples per wake
const MAX = 24; // ships
const LIFE = 6; // seconds a sample lives

interface Sample { dir: THREE.Vector3; side: THREE.Vector3; t: number; w: number; s: number }

class Trail {
  readonly samples: Sample[] = [];
  readonly color = new THREE.Color();
  glow = 1;
  last = new THREE.Vector3();
  lastT = -1;
  seen = 0;
}

const VERT = /* glsl */ `
attribute vec4 aData; // along (metres from the stern), across (-1..1), strength, age (0..1)
attribute vec4 aColor; // glow colour, glow amount
uniform vec3 uSunDir, uSunColor;
varying vec4 vData;
varying vec4 vColor;
varying vec3 vLight;
varying float vNight;
varying vec3 vW;
void main() {
  vData = aData;
  vColor = aColor;
  vW = position;
  float sunUp = dot(normalize(position), uSunDir);
  vNight = 1.0 - smoothstep(-0.14, 0.12, sunUp);
  vLight = mix(vec3(0.05, 0.07, 0.11), uSunColor * 0.85 + vec3(0.2, 0.22, 0.26), 1.0 - vNight);
  gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0);
}`;

const FRAG = /* glsl */ `
uniform sampler2D uNoise;
uniform float uTime;
varying vec4 vData;
varying vec4 vColor;
varying vec3 vLight;
varying float vNight;
void main() {
  float along = vData.x, across = vData.y, s = vData.z, age = vData.w;
  float n = texture2D(uNoise, vec2(along * 0.09, across * 0.35 + along * 0.02) + vec2(0.0, uTime * 0.02)).g;
  float n2 = texture2D(uNoise, vec2(along * 0.23 - uTime * 0.05, across * 0.9)).b;
  // the arms of the V bright at the edges, churned water down the middle, all breaking up as it ages
  float edge = smoothstep(0.55, 0.95, abs(across)) * (1.0 - smoothstep(0.95, 1.0, abs(across)));
  float churn = (1.0 - smoothstep(0.0, 0.6, abs(across))) * (1.0 - age * 0.7);
  float foam = (edge * 0.9 + churn * 0.8) * smoothstep(0.25 + age * 0.4, 0.75, n * 0.7 + n2 * 0.5);
  float a = foam * s * pow(1.0 - age, 1.5) * smoothstep(0.0, 2.5, along);
  if (a < 0.003) discard;
  vec3 col = vec3(0.92, 0.96, 1.0) * vLight;
  // at night, the spirit's own light in the water
  col += vColor.rgb * vColor.a * (0.25 + 2.2 * vNight);
  gl_FragColor = vec4(col * a, a * (1.0 - vNight * 0.6));
}`;

export class Wakes {
  readonly mesh: THREE.Mesh;
  private readonly trails = new Map<number, Trail>();
  private readonly slots: (Trail | null)[] = Array(MAX).fill(null);
  private readonly pos: Float32Array;
  private readonly data: Float32Array;
  private readonly col: Float32Array;
  private readonly geo: THREE.BufferGeometry;
  private readonly v = new THREE.Vector3();
  private frame = 0;

  constructor() {
    const verts = MAX * (N + 1) * 2;
    this.pos = new Float32Array(verts * 3);
    this.data = new Float32Array(verts * 4);
    this.col = new Float32Array(verts * 4);
    const idx: number[] = [];
    for (let s = 0; s < MAX; s++) for (let i = 0; i < N; i++) {
      const a = (s * (N + 1) + i) * 2, b = a + 2;
      idx.push(a, a + 1, b, a + 1, b + 1, b);
    }
    const g = (this.geo = new THREE.BufferGeometry());
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aData', new THREE.BufferAttribute(this.data, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    g.setIndex(idx);
    const m = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG,
      uniforms: { uSunDir: AU.uSunDir, uSunColor: AU.uSunColor, uNoise: AU.uNoise, uTime: AU.uTime },
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    this.mesh = new THREE.Mesh(g, m);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
  }

  /** Lays the wake for ship `id` this frame: its stern on the sea, the way it heads, its speed and the trail's look. */
  track(id: number, stern: THREE.Vector3, fwd: THREE.Vector3, speed: number, look: WakeLook, t: number, on: boolean): void {
    let tr = this.trails.get(id);
    if (!tr) {
      const slot = this.slots.indexOf(null);
      if (slot < 0) return;
      tr = new Trail();
      this.slots[slot] = tr;
      this.trails.set(id, tr);
    }
    tr.seen = this.frame;
    tr.color.setHex(look.color);
    tr.glow = look.glow;
    const dir = this.v.copy(stern).normalize();
    if (on && speed > 0.6 && (tr.lastT < 0 || t - tr.lastT > 0.12 || tr.last.distanceTo(stern) > 1.6)) {
      const side = new THREE.Vector3().crossVectors(dir, fwd).normalize();
      tr.samples.unshift({ dir: dir.clone(), side, t, w: 1.2 + Math.min(1, speed / 14) * 0.9, s: Math.min(1, speed / 9) });
      if (tr.samples.length > N) tr.samples.pop();
      tr.last.copy(stern);
      tr.lastT = t;
    }
  }

  update(t: number): void {
    const P = this.pos, D = this.data, C = this.col, R = SEA.radius + SEA.level, p = new THREE.Vector3(), c = new THREE.Vector3();
    for (let s = 0; s < MAX; s++) {
      const tr = this.slots[s];
      const base = s * (N + 1) * 2;
      // a wake whose ship is gone fades out, then frees its slot
      if (tr && this.frame - tr.seen > 2 && (tr.samples.length === 0 || t - tr.samples[0].t > LIFE)) {
        for (const [k, v] of this.trails) if (v === tr) this.trails.delete(k);
        this.slots[s] = null;
      }
      const list = this.slots[s]?.samples ?? [];
      while (list.length && t - list[list.length - 1].t > LIFE) list.pop();
      let along = 0;
      for (let i = 0; i <= N; i++) {
        const sm = list[Math.min(i, list.length - 1)];
        for (let side = 0; side < 2; side++) {
          const v = base + i * 2 + side;
          if (!sm) { D[v * 4 + 2] = 0; P[v * 3] = P[v * 3 + 1] = P[v * 3 + 2] = 0; continue; }
          const age = Math.min(1, (t - sm.t) / LIFE), hw = sm.w + age * 9;
          c.copy(sm.dir).multiplyScalar(R);
          p.copy(c).addScaledVector(sm.side, side ? hw : -hw).normalize().multiplyScalar(R);
          const h = R + sea.wave(p, t) + 0.08;
          p.normalize().multiplyScalar(h);
          P[v * 3] = p.x; P[v * 3 + 1] = p.y; P[v * 3 + 2] = p.z;
          D[v * 4] = along; D[v * 4 + 1] = side ? 1 : -1; D[v * 4 + 2] = i < list.length ? sm.s : 0; D[v * 4 + 3] = age;
          const tc = this.slots[s]!;
          C[v * 4] = tc.color.r; C[v * 4 + 1] = tc.color.g; C[v * 4 + 2] = tc.color.b; C[v * 4 + 3] = tc.glow;
        }
        if (i + 1 < list.length) along += list[i].dir.distanceTo(list[i + 1].dir) * R;
      }
    }
    for (const k of ['position', 'aData', 'aColor']) (this.geo.getAttribute(k) as THREE.BufferAttribute).needsUpdate = true;
    this.frame++;
  }
}

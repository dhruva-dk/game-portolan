// Everything that flashes, splashes, smokes and glows: particles, shot trails, shields, loot beacons, clams, glimmer,
// the storm wall and the Gale. Driven by the stage from the match's events; nothing here knows the rules.
import * as THREE from 'three';
import { GLOBE, patch, U, type Textures } from './engine.ts';
import { waveHeight, type Water } from './water.ts';

const TAU = Math.PI * 2;
const rand = (a: number, b: number) => a + Math.random() * (b - a);

// ---------------------------------------------------------------- the sprite atlas

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

// ---------------------------------------------------------------- particles

const PART_VERT = /* glsl */ `${GLOBE}
attribute vec4 iPos, iCol, iVel;
attribute vec3 iMisc;
varying vec4 vCol;
varying vec2 vUv;
varying float vFrame;
varying float vNear;
#include <fog_pars_vertex>
void main() {
  vec3 wp = iPos.xyz;
  float size = iPos.w;
  vec2 q = position.xy;
  vec4 mv;
  if (iMisc.z > 1.5) {
    // lying flat on the water
    float c = cos(iMisc.x), s = sin(iMisc.x);
    mv = viewMatrix * vec4(globePos(wp + vec3(c * q.x - s * q.y, 0.0, s * q.x + c * q.y) * size), 1.0);
  } else if (iMisc.z > 0.5) {
    // a streak trailing behind along the velocity, as seen on screen
    mv = viewMatrix * vec4(globePos(wp), 1.0);
    vec2 d = (mat3(viewMatrix) * globeDir(wp, iVel.xyz)).xy;
    float L = length(d);
    vec2 dir = L > 1e-4 ? d / L : vec2(0.0, 1.0);
    float len = max(size, L * iVel.w);
    mv.xy += vec2(-dir.y, dir.x) * size * q.x + dir * len * (q.y - 1.0) * 0.5;
  } else {
    mv = viewMatrix * vec4(globePos(wp), 1.0);
    float c = cos(iMisc.x), s = sin(iMisc.x);
    mv.xy += vec2(c * q.x - s * q.y, s * q.x + c * q.y) * size;
  }
  gl_Position = projectionMatrix * mv;
  // anything brushing the lens thins out instead of filling the screen
  vNear = smoothstep(1.5, 8.0, -mv.z);
  vUv = q * 0.5 + 0.5;
  vCol = iCol;
  vFrame = iMisc.y;
  #ifdef USE_FOG
  vFogWorld = wp;
  #endif
}`;

const PART_FRAG = /* glsl */ `
uniform sampler2D uAtlas;
uniform vec3 uLight;
varying vec4 vCol;
varying vec2 vUv;
varying float vFrame;
varying float vNear;
#include <fog_pars_fragment>
void main() {
  vec2 cell = vec2(mod(vFrame, 4.0), floor(vFrame / 4.0 + 0.01));
  vec4 t = texture(uAtlas, (cell + 0.02 + vUv * 0.96) / vec2(4.0, 2.0));
  float a = t.a * vCol.a * vNear;
  if (a < 0.002) discard;
#ifdef GLOW
  vec3 c = vCol.rgb * a;
  #ifdef USE_FOG
  c = atmosphere(c, vFogWorld) - atmosphere(vec3(0.0), vFogWorld);
  #endif
  gl_FragColor = vec4(c, 0.0);
#else
  vec3 c = vCol.rgb * uLight;
  #ifdef USE_FOG
  c = atmosphere(c, vFogWorld);
  #endif
  gl_FragColor = vec4(c * a, a);
#endif
}`;

interface Emit {
  x: number; y: number; z: number; vx?: number; vy?: number; vz?: number;
  life: number; size: number; grow?: number; // size at birth, and the factor it reaches at death
  r: number; g: number; b: number; a?: number;
  frame: number; mode?: 0 | 1 | 2; stretch?: number; rot?: number; spin?: number;
  drag?: number; grav?: number; fadeIn?: number; float?: boolean;
}

const S = 23;

class Particles {
  readonly mesh: THREE.Mesh;
  private n = 0;
  private readonly cap: number;
  private readonly f: Float32Array; // per particle: S floats
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
      uniforms: { ...U, uAtlas: { value: atlas }, uLight: { value: new THREE.Color(1, 1, 1) } },
      defines: glow ? { GLOW: 1 } : {},
      transparent: true, depthWrite: false, fog: true,
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor, blendDst: glow ? THREE.OneFactor : THREE.OneMinusSrcAlphaFactor,
    });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = glow ? 8 : 7;
    this.mesh.layers.set(1);
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

  update(dt: number, t: number): void {
    const f = this.f, P = this.pos.array as Float32Array, C = this.col.array as Float32Array, V = this.vel.array as Float32Array, M = this.misc.array as Float32Array;
    let w = 0;
    for (let i = 0; i < this.n; i++) {
      const o = i * S;
      const once = f[o + 7] === 0;
      if (!once) {
        f[o + 6] += dt;
        if (f[o + 6] >= f[o + 7]) { this.kill(i); i--; continue; }
        const drag = Math.max(0, 1 - f[o + 19] * dt);
        f[o + 3] *= drag; f[o + 4] = f[o + 4] * drag - f[o + 20] * dt; f[o + 5] *= drag;
        f[o + 0] += f[o + 3] * dt; f[o + 1] += f[o + 4] * dt; f[o + 2] += f[o + 5] * dt;
        f[o + 17] += f[o + 18] * dt;
        // spray that lands rides on the sea
        if (f[o + 21] > 0) { const h = waveHeight(f[o], f[o + 2], t) + 0.05; if (f[o + 1] < h) { f[o + 1] = h; f[o + 4] = 0; } }
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

// ---------------------------------------------------------------- shields

const SHIELD_VERT = /* glsl */ `${GLOBE}
varying vec3 vN, vV, vL;
void main() {
  vL = position;
  vec3 wp = (modelMatrix * vec4(position, 1.0)).xyz;
  vec4 mv = viewMatrix * vec4(globePos(wp), 1.0);
  vN = mat3(viewMatrix) * globeDir(wp, transpose(mat3(viewMatrix)) * (normalMatrix * normal));
  vV = -mv.xyz;
  gl_Position = projectionMatrix * mv;
}`;
const SHIELD_FRAG = /* glsl */ `
uniform float uAlpha, uAge, uBreak;
uniform vec3 uHit, uColor;
varying vec3 vN, vV, vL;
float hexEdge(vec2 p) {
  p *= vec2(1.0, 1.1547);
  vec2 a = mod(p, vec2(1.0, 1.732)) - vec2(0.5, 0.866);
  vec2 b = mod(p - vec2(0.5, 0.866), vec2(1.0, 1.732)) - vec2(0.5, 0.866);
  vec2 g = dot(a, a) < dot(b, b) ? a : b;
  vec2 h = abs(g);
  float d = max(dot(h, vec2(0.5, 0.866)), h.x);
  return smoothstep(0.4, 0.5, d);
}
void main() {
  vec3 n = normalize(vN), v = normalize(vV);
  float fres = pow(clamp(1.0 - abs(dot(n, v)), 0.0, 1.0), 2.2);
  vec3 dir = normalize(vL);
  vec2 hp = vec2(atan(dir.z, dir.x) * 2.6, dir.y * 4.0);
  float hex = hexEdge(hp * 1.6);
  float d = distance(dir, uHit);
  float ring = smoothstep(0.35, 0.0, abs(d - uAge * 3.5)) * (1.0 - uAge);
  float near = smoothstep(1.2, 0.0, d);
  float a = uAlpha * (fres * 0.9 + hex * (0.25 + near * 0.9 + ring * 2.0) + ring * 0.8 + near * 0.25);
  a *= 1.0 + uBreak * 2.0;
  gl_FragColor = vec4(uColor * a, 0.0);
}`;

class Shield {
  readonly mesh: THREE.Mesh;
  readonly u = { uAlpha: { value: 0 }, uAge: { value: 0 }, uBreak: { value: 0 }, uHit: { value: new THREE.Vector3(0, 0, 1) }, uColor: { value: new THREE.Color(0.35, 0.75, 1.6) } };
  ship = -1;
  age = 9;
  constructor(geo: THREE.BufferGeometry) {
    const m = new THREE.ShaderMaterial({ vertexShader: SHIELD_VERT, fragmentShader: SHIELD_FRAG, uniforms: { ...this.u, uGlobe: U.uGlobe }, transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, side: THREE.DoubleSide });
    this.mesh = new THREE.Mesh(geo, m);
    this.mesh.visible = false;
    this.mesh.layers.set(1);
    this.mesh.renderOrder = 9;
    this.mesh.scale.set(5.2, 6.5, 11);
  }
}

// ---------------------------------------------------------------- the storm wall

const STORM_VERT = /* glsl */ `${GLOBE}
varying vec2 vUv;
varying vec3 vWp;
void main() {
  vUv = uv;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWp = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * vec4(globePos(wp.xyz), 1.0);
}`;
const STORM_FRAG = /* glsl */ `
uniform float uRadius, uFlash, uOn;
varying vec2 vUv;
varying vec3 vWp;
#include <fog_pars_fragment>
void main() {
  float h = vUv.y;
  float around = vUv.x * uRadius * 6.2832;
  vec2 p = vec2(around / 90.0, h * 600.0 / 90.0);
  float n1 = texture(uNoise, p * 0.35 + vec2(uTime * 0.012, -uTime * 0.03)).r;
  float n2 = texture(uNoise, p * 0.9 + vec2(-uTime * 0.03, -uTime * 0.05) + n1 * 0.3).r;
  float n = n1 * 0.6 + n2 * 0.4;
  vec3 deep = vec3(0.2, 0.09, 0.38), bright = vec3(0.6, 0.4, 1.0);
  vec3 col = mix(deep, bright, smoothstep(0.15, 0.95, n));
  col += vec3(0.9, 0.7, 1.4) * smoothstep(0.035, 0.0, h) * 2.0;
  col *= 1.0 + uFlash * 4.0 * smoothstep(0.4, 0.9, n2);
  float dc = distance(cameraPosition.xz, vWp.xz);
  // far off it is one soft violet curtain, its churn only shows as it nears
  float churn = 1.0 - smoothstep(180.0, 520.0, dc);
  float a = (0.62 + 0.3 * churn * smoothstep(0.2, 0.8, n)) * smoothstep(1.0, 0.25, h);
  a *= mix(0.45, 1.0, smoothstep(6.0, 70.0, dc)) * mix(1.0, 0.7, 1.0 - churn) * uOn;
  // streaks of rain falling down the face
  float rain = texture(uNoise, vec2(around / 6.0, h * 40.0 + uTime * 1.5)).r;
  col += vec3(0.5, 0.45, 0.8) * smoothstep(0.7, 0.95, rain) * 0.6 * churn;
  #ifdef USE_FOG
  // the haze between
  col = mix(col, atmosphere(col, vWp), 0.55);
  #endif
  gl_FragColor = vec4(col * a, a);
}`;

// ---------------------------------------------------------------- the Gale

const GALE_FRAG = /* glsl */ `
uniform float uOn;
varying vec2 vUv;
varying vec3 vWp;
#include <fog_pars_fragment>
void main() {
  float s1 = texture(uNoise, vec2(vUv.x * 14.0 - uTime * 0.9, vUv.y * 2.0)).r;
  float s2 = texture(uNoise, vec2(vUv.x * 30.0 - uTime * 1.7, vUv.y * 5.0 + 0.3)).r;
  float streak = smoothstep(0.62, 0.9, s1) + smoothstep(0.7, 0.95, s2) * 0.8;
  float ends = smoothstep(0.0, 0.06, vUv.x) * smoothstep(1.0, 0.94, vUv.x);
  float a = (0.05 + streak * 0.55) * ends * uOn;
  vec3 col = mix(vec3(0.75, 0.95, 1.2), vec3(1.4, 1.3, 1.0), s2) * a;
  #ifdef USE_FOG
  col = atmosphere(col, vWp) - atmosphere(vec3(0.0), vWp);
  #endif
  gl_FragColor = vec4(col, 0.0);
}`;

// ---------------------------------------------------------------- loot on the water

const BEAM_VERT = /* glsl */ `${GLOBE}
attribute vec4 iBeam; // x, z, height, strength
attribute vec3 iColor;
varying vec2 vUv;
varying vec3 vC;
varying float vS;
varying vec3 vWp;
varying vec3 vN;
void main() {
  vUv = uv;
  vN = normalize(vec3(position.x, 0.0, position.z));
  vec3 wp = vec3(position.x + iBeam.x, position.y * iBeam.z, position.z + iBeam.y);
  vWp = wp;
  vC = iColor;
  vS = iBeam.w;
  gl_Position = projectionMatrix * viewMatrix * vec4(globePos(wp), 1.0);
}`;
const BEAM_FRAG = /* glsl */ `
varying vec2 vUv;
varying vec3 vC;
varying float vS;
varying vec3 vWp;
varying vec3 vN;
#include <fog_pars_fragment>
void main() {
  float a = pow(clamp(1.0 - vUv.y, 0.0, 1.0), 2.2) * vS;
  a *= 0.75 + 0.25 * sin(vUv.y * 40.0 - uTime * 6.0);
  // a soft column: bright down the core, nothing at the rim
  vec3 vd = normalize(cameraPosition - vWp);
  float core = abs(dot(normalize(vN), normalize(vec3(vd.x, 0.0, vd.z))));
  a *= core * core * 1.6;
  // a marker for the distance; up close the token itself speaks
  float dc = distance(cameraPosition, vWp);
  a *= smoothstep(10.0, 55.0, dc);
  vec3 col = vC * a;
  #ifdef USE_FOG
  col = atmosphere(col, vWp) - atmosphere(vec3(0.0), vWp);
  #endif
  gl_FragColor = vec4(col, 0.0);
}`;

export const RARITY_GLOW = [0xc9d1da, 0x55e05a, 0x3aa0ff, 0xb85cff, 0xffa21f].map((h) => new THREE.Color(h));

const TOKEN_KINDS = ['cannon', 'scatter', 'harpoon', 'mortar', 'repeater', 'glass', 'pearl', 'drift', 'heart'] as const;
export type TokenKind = (typeof TOKEN_KINDS)[number];
export interface LootLike { id: number; x: number; z: number; kind: TokenKind; rarity: number; age: number }
export interface ClamLike { id: number; x: number; z: number; open: boolean; openT: number }
export interface MoteLike { x: number; z: number; t: number }

/** A giant clam: a fluted shell half, hinge at the origin along x, opening toward +z. */
function shellGeometry(top: boolean): THREE.BufferGeometry {
  const W = 34, D = 14, pos: number[] = [], idx: number[] = [];
  const R = 2.3, H = 0.95;
  for (let j = 0; j <= D; j++) {
    const t = j / D;
    for (let i = 0; i <= W; i++) {
      const u = i / W, a = (u - 0.5) * Math.PI * 0.95;
      const flute = 1 + 0.07 * Math.cos(u * Math.PI * 14) * t;
      const r = R * t * flute;
      const x = Math.sin(a) * r * 1.15, z = Math.cos(a) * r;
      const bulge = Math.sin(Math.min(1, t * 1.05) * Math.PI * 0.85) * H * Math.cos(a * 0.9) * (0.85 + 0.15 * Math.cos(u * Math.PI * 14));
      pos.push(x, (top ? 1 : -1) * (bulge + 0.02), z + 0.1);
    }
  }
  for (let j = 0; j < D; j++) for (let i = 0; i < W; i++) {
    const a = j * (W + 1) + i, b = a + 1, c = a + W + 1, d = c + 1;
    if (top) idx.push(a, c, b, b, c, d); else idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function tokenGeometry(kind: TokenKind, barrels: Map<string, THREE.BufferGeometry>): THREE.BufferGeometry {
  switch (kind) {
    case 'glass': return new THREE.OctahedronGeometry(0.75, 0).scale(0.8, 1.3, 0.8);
    case 'pearl': return new THREE.SphereGeometry(0.62, 20, 14);
    case 'drift': return new THREE.CylinderGeometry(0.28, 0.34, 1.9, 9).rotateZ(Math.PI / 2);
    case 'heart': return new THREE.CylinderGeometry(0.42, 0.42, 1.3, 12).rotateZ(Math.PI / 2);
    default: {
      const g = barrels.get(kind)!.clone();
      g.computeBoundingBox();
      const c = g.boundingBox!.getCenter(new THREE.Vector3());
      return g.translate(-c.x, -c.y, -c.z).scale(1.15, 1.15, 1.15);
    }
  }
}

// ---------------------------------------------------------------- flotsam

interface Plank { x: number; y: number; z: number; vx: number; vy: number; vz: number; rx: number; ry: number; rz: number; wx: number; wy: number; wz: number; life: number; s: number }

// ---------------------------------------------------------------- Fx

export class Fx {
  readonly group = new THREE.Group();
  readonly glow: Particles;
  readonly smoke: Particles;
  private readonly water: Water;
  private readonly shields: Shield[] = [];
  private readonly storm: THREE.Mesh;
  private readonly stormU = { uRadius: { value: 100 }, uFlash: { value: 0 }, uOn: { value: 0 } };
  private readonly gale: THREE.Mesh;
  private readonly galeU = { uOn: { value: 0 } };
  private readonly planks: Plank[] = [];
  private readonly plankMesh: THREE.InstancedMesh;
  private readonly bolts: THREE.InstancedMesh;
  private readonly balls: THREE.InstancedMesh;
  private readonly tokens = new Map<TokenKind, THREE.InstancedMesh>();
  private readonly beams: THREE.Mesh;
  private readonly beamAttr: THREE.InstancedBufferAttribute;
  private readonly beamCol: THREE.InstancedBufferAttribute;
  private readonly clamBottom: THREE.InstancedMesh;
  private readonly clamTop: THREE.InstancedMesh;
  private readonly trails = new Map<number, [number, number, number, number]>();
  private readonly tmp = new THREE.Object3D();
  private time = 0;

  constructor(tex: Textures, water: Water, barrels: Map<string, THREE.BufferGeometry>) {
    this.water = water;
    const atlas = makeAtlas();
    this.glow = new Particles(5000, true, atlas);
    this.smoke = new Particles(3000, false, atlas);
    this.group.add(this.smoke.mesh, this.glow.mesh);

    const bubble = new THREE.SphereGeometry(1, 40, 24);
    for (let i = 0; i < 8; i++) { const s = new Shield(bubble); this.shields.push(s); this.group.add(s.mesh); }

    // the storm: an open cylinder, scaled to the circle each frame
    const cyl = new THREE.CylinderGeometry(1, 1, 1, 160, 8, true).translate(0, 0.5, 0);
    const sm = new THREE.ShaderMaterial({ vertexShader: STORM_VERT, fragmentShader: STORM_FRAG, uniforms: { ...U, ...this.stormU }, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: true, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor });
    this.storm = new THREE.Mesh(cyl, sm);
    this.storm.frustumCulled = false;
    this.storm.renderOrder = 6;
    this.group.add(this.storm);

    // the Gale: a long tube of streaming wind, laid along its line when the match begins
    const gm = new THREE.ShaderMaterial({ vertexShader: STORM_VERT, fragmentShader: GALE_FRAG, uniforms: { ...U, ...this.galeU }, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: true, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor });
    this.gale = new THREE.Mesh(new THREE.BufferGeometry(), gm);
    this.gale.frustumCulled = false;
    this.gale.renderOrder = 6;
    this.group.add(this.gale);

    // flotsam from sunk ships
    const wood = patch(new THREE.MeshStandardMaterial({ map: tex.maps.deck_d, color: 0x9a7b5a, roughness: 0.85 }), 'plank');
    this.plankMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 0.18, 2.4), wood, 220);
    this.plankMesh.count = 0;
    this.plankMesh.frustumCulled = false;
    this.plankMesh.castShadow = true;
    this.group.add(this.plankMesh);

    // heavy shot in flight: harpoon bolts and mortar shells
    const metal = patch(new THREE.MeshStandardMaterial({ color: 0x2a2a2e, metalness: 0.8, roughness: 0.35, emissive: 0xff6a20, emissiveIntensity: 0 }), 'shot');
    const bolt = new THREE.CylinderGeometry(0.09, 0.09, 4.2, 6).rotateX(Math.PI / 2);
    const tip = new THREE.ConeGeometry(0.28, 0.9, 6).rotateX(Math.PI / 2).translate(0, 0, 2.5);
    this.bolts = new THREE.InstancedMesh(mergeGeos([bolt, tip]), metal, 64);
    this.bolts.count = 0;
    this.bolts.frustumCulled = false;
    const ballMat = patch(new THREE.MeshStandardMaterial({ color: 0x1a1414, roughness: 0.5, emissive: 0xff5a10, emissiveIntensity: 2.5 }), 'ball');
    this.balls = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.75, 1), ballMat, 64);
    this.balls.count = 0;
    this.balls.frustumCulled = false;
    this.group.add(this.bolts, this.balls);

    // loot tokens: the weapon itself, or the repair, turning slowly over a beacon of its rarity
    for (const k of TOKEN_KINDS) {
      const base = k === 'glass' ? { color: 0x9fe8ff, roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.85 }
        : k === 'pearl' ? { color: 0xf1f4ff, roughness: 0.18, metalness: 0.2 }
          : k === 'drift' ? { color: 0x8b6a48, roughness: 0.9, map: tex.maps.bark_pine_d }
            : k === 'heart' ? { color: 0xc9a46a, roughness: 0.6, map: tex.maps.bark_cedar_d }
              : { color: 0x3c3a3a, roughness: 0.35, metalness: 0.85 };
      const m = patch(new THREE.MeshStandardMaterial({ ...base, emissive: 0xffffff, emissiveIntensity: k === 'drift' ? 0.08 : k === 'heart' ? 0.45 : 0.22 }), 'token', (s) => {
        s.fragmentShader = s.fragmentShader
          .replace('#include <color_fragment>', '')
          .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n#ifdef USE_INSTANCING_COLOR\ntotalEmissiveRadiance *= vColor;\n#endif');
      });
      const mesh = new THREE.InstancedMesh(tokenGeometry(k, barrels), m, 400);
      mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(400 * 3), 3);
      mesh.count = 0;
      mesh.frustumCulled = false;
      this.tokens.set(k, mesh);
      this.group.add(mesh);
    }
    const beamGeo = new THREE.InstancedBufferGeometry();
    const bc = new THREE.CylinderGeometry(0.5, 0.8, 1, 12, 1, true).translate(0, 0.5, 0);
    beamGeo.index = bc.index;
    beamGeo.setAttribute('position', bc.getAttribute('position'));
    beamGeo.setAttribute('uv', bc.getAttribute('uv'));
    this.beamAttr = new THREE.InstancedBufferAttribute(new Float32Array(600 * 4), 4);
    this.beamCol = new THREE.InstancedBufferAttribute(new Float32Array(600 * 3), 3);
    this.beamAttr.setUsage(THREE.DynamicDrawUsage);
    this.beamCol.setUsage(THREE.DynamicDrawUsage);
    beamGeo.setAttribute('iBeam', this.beamAttr);
    beamGeo.setAttribute('iColor', this.beamCol);
    beamGeo.instanceCount = 0;
    const bm = new THREE.ShaderMaterial({ vertexShader: BEAM_VERT, fragmentShader: BEAM_FRAG, uniforms: { ...U }, transparent: true, depthWrite: false, fog: true, side: THREE.DoubleSide, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor });
    this.beams = new THREE.Mesh(beamGeo, bm);
    this.beams.frustumCulled = false;
    this.beams.renderOrder = 6;
    this.group.add(this.beams);

    // giant clams in the shallows, pearly gold
    const shell = patch(new THREE.MeshStandardMaterial({ color: 0xe0b860, metalness: 0.65, roughness: 0.28, emissive: 0xffb040, emissiveIntensity: 0.12, side: THREE.DoubleSide }), 'clam');
    this.clamBottom = new THREE.InstancedMesh(shellGeometry(false), shell, 120);
    this.clamTop = new THREE.InstancedMesh(shellGeometry(true), shell, 120);
    for (const m of [this.clamBottom, this.clamTop]) { m.count = 0; m.frustumCulled = false; m.castShadow = true; m.receiveShadow = true; this.group.add(m); }
  }

  setEnv(env: THREE.Texture): void {
    for (const m of [this.clamTop.material, ...[...this.tokens.values()].map((t) => t.material), this.bolts.material] as THREE.MeshStandardMaterial[]) { m.envMap = env; m.needsUpdate = true; }
  }

  // ---------------------------------------------------------------- one-shot effects

  muzzle(kind: string, x: number, y: number, z: number, dx: number, dy: number, dz: number, scale = 1): void {
    const big = kind === 'mortar' ? 1.8 : kind === 'harpoon' ? 1.2 : kind === 'repeater' ? 0.45 : kind === 'scatter' ? 1.3 : 1;
    const s = big * scale;
    this.glow.emit({ x, y, z, life: 0.09, size: 1.6 * s, grow: 1.6, r: 6, g: 3.6, b: 1.4, frame: SPRITE.puff, fadeIn: 0 });
    this.glow.emit({ x: x + dx * 1.2 * s, y: y + dy * 1.2 * s, z: z + dz * 1.2 * s, vx: dx * 8, vy: dy * 8, vz: dz * 8, life: 0.08, size: 0.9 * s, grow: 2, r: 8, g: 4.5, b: 1.5, frame: SPRITE.flame, mode: 1, stretch: 0.25, fadeIn: 0 });
    const sparks = kind === 'repeater' ? 1 : 5;
    for (let i = 0; i < sparks; i++) {
      const sp = rand(15, 35);
      this.glow.emit({ x, y, z, vx: (dx + rand(-0.3, 0.3)) * sp, vy: (dy + rand(-0.1, 0.4)) * sp, vz: (dz + rand(-0.3, 0.3)) * sp, life: rand(0.15, 0.35), size: 0.07 * s, r: 7, g: 4, b: 1.4, frame: SPRITE.spark, mode: 1, stretch: 0.05, grav: 9, drag: 2, fadeIn: 0 });
    }
    const puffs = kind === 'repeater' ? (Math.random() < 0.3 ? 1 : 0) : 3;
    for (let i = 0; i < puffs; i++) {
      const sp = rand(2, 7) * s;
      this.smoke.emit({ x, y, z, vx: dx * sp + rand(-0.5, 0.5), vy: dy * sp + rand(0.3, 1.2), vz: dz * sp + rand(-0.5, 0.5), life: rand(1.2, 2.2), size: 0.8 * s, grow: 4, r: 0.85, g: 0.84, b: 0.82, a: 0.45, frame: SPRITE.smoke, drag: 1.4, spin: rand(-0.5, 0.5) });
    }
    if (big >= 1) this.water.stamp(x - dx * 2, z - dz * 2, 3 * s, 0.25, 0.6);
  }

  splash(x: number, z: number, big: number): void {
    const n = Math.round(10 + big * 22);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, out = rand(0.5, 3) * (0.6 + big * 0.4), up = rand(5, 13) * (0.5 + big * 0.7);
      this.smoke.emit({ x: x + Math.cos(a) * 0.6, y: 0.3, z: z + Math.sin(a) * 0.6, vx: Math.cos(a) * out, vy: up, vz: Math.sin(a) * out, life: rand(0.9, 1.5), size: rand(0.5, 1.1) * (0.6 + big * 0.6), grow: 2.2, r: 1.25, g: 1.32, b: 1.4, a: 0.8, frame: SPRITE.spray, grav: 16, drag: 0.6, float: true });
    }
    for (let i = 0; i < 4 + big * 4; i++) {
      const a = Math.random() * TAU;
      this.smoke.emit({ x, y: 0.4, z, vx: Math.cos(a) * 3, vy: rand(1, 3), vz: Math.sin(a) * 3, life: rand(1.4, 2.4), size: 1.2 + big, grow: 3, r: 1.2, g: 1.25, b: 1.3, a: 0.35, frame: SPRITE.smoke, drag: 1.2 });
    }
    this.smoke.emit({ x, y: 0.1, z, life: 1.4, size: 1 + big * 2, grow: 5, r: 1.3, g: 1.35, b: 1.4, a: 0.7, frame: SPRITE.ring, mode: 2, fadeIn: 0 });
    this.water.stamp(x, z, 3 + big * 6, 1, 1.5);
  }

  /** Shot striking a hull: splinters, sparks, a flash; crits burst gold. */
  hitShip(x: number, y: number, z: number, crit: boolean, big: number): void {
    const s = 0.7 + big * 0.8;
    this.glow.emit({ x, y, z, life: 0.12, size: 2.2 * s, grow: 1.5, r: crit ? 6 : 5, g: crit ? 5 : 2.6, b: crit ? 1.2 : 1, frame: SPRITE.puff, fadeIn: 0 });
    for (let i = 0; i < 9 * s; i++) {
      const a = Math.random() * TAU, sp = rand(8, 22);
      this.glow.emit({ x, y, z, vx: Math.cos(a) * sp, vy: rand(2, 14), vz: Math.sin(a) * sp, life: rand(0.25, 0.6), size: 0.07, r: crit ? 7 : 6, g: crit ? 6 : 3, b: crit ? 1.5 : 0.8, frame: SPRITE.spark, mode: 1, stretch: 0.045, grav: 18, drag: 1.5, fadeIn: 0 });
    }
    for (let i = 0; i < 6 * s; i++) {
      const a = Math.random() * TAU, sp = rand(3, 10);
      this.smoke.emit({ x, y, z, vx: Math.cos(a) * sp, vy: rand(3, 9), vz: Math.sin(a) * sp, life: rand(0.8, 1.6), size: rand(0.25, 0.5), r: 0.55, g: 0.4, b: 0.28, a: 1, frame: SPRITE.shard, grav: 16, spin: rand(-12, 12), float: true, fadeIn: 0 });
    }
    this.smoke.emit({ x, y, z, vy: 1.2, life: 1.6, size: 1.2 * s, grow: 3, r: 0.45, g: 0.42, b: 0.4, a: 0.55, frame: SPRITE.smoke, drag: 1, spin: rand(-0.4, 0.4) });
  }

  hitLand(x: number, y: number, z: number, big: number): void {
    for (let i = 0; i < 4 + big * 6; i++) {
      const a = Math.random() * TAU, sp = rand(1, 4) * (1 + big);
      this.smoke.emit({ x, y, z, vx: Math.cos(a) * sp, vy: rand(1, 4) * (1 + big), vz: Math.sin(a) * sp, life: rand(1.2, 2.4), size: 1 + big * 1.5, grow: 2.5, r: 0.62, g: 0.55, b: 0.46, a: 0.6, frame: SPRITE.smoke, drag: 1.3, grav: 1 });
    }
    for (let i = 0; i < 8 + big * 10; i++) {
      const a = Math.random() * TAU, sp = rand(4, 12);
      this.smoke.emit({ x, y, z, vx: Math.cos(a) * sp, vy: rand(4, 12), vz: Math.sin(a) * sp, life: rand(0.6, 1.1), size: rand(0.12, 0.28), r: 0.35, g: 0.3, b: 0.26, frame: SPRITE.spray, grav: 22, fadeIn: 0 });
    }
  }

  /** A mortar landing, or a ship going down: fireball, smoke column, shockwave, spray. */
  explode(x: number, y: number, z: number, size: number, onWater: boolean): void {
    this.glow.emit({ x, y: y + 1, z, life: 0.22, size: 9 * size, grow: 1.4, r: 5, g: 3, b: 1.4, frame: SPRITE.puff, fadeIn: 0 });
    for (let i = 0; i < 10 * size; i++) {
      const a = Math.random() * TAU, sp = rand(2, 8) * size;
      this.glow.emit({ x, y: y + 1, z, vx: Math.cos(a) * sp, vy: rand(2, 9) * size, vz: Math.sin(a) * sp, life: rand(0.35, 0.7), size: rand(1.4, 2.6) * size, grow: 1.8, r: 5, g: rand(1.8, 2.8), b: 0.6, frame: SPRITE.flame, drag: 2.5, spin: rand(-2, 2) });
    }
    for (let i = 0; i < 24 * size; i++) {
      const a = Math.random() * TAU, sp = rand(12, 34);
      this.glow.emit({ x, y: y + 1, z, vx: Math.cos(a) * sp, vy: rand(4, 26), vz: Math.sin(a) * sp, life: rand(0.5, 1.2), size: 0.1, r: 7, g: 3.6, b: 1, frame: SPRITE.spark, mode: 1, stretch: 0.04, grav: 20, drag: 0.8, fadeIn: 0 });
    }
    for (let i = 0; i < 12 * size; i++) {
      const a = Math.random() * TAU, sp = rand(1, 5) * size;
      const dark = rand(0.16, 0.3);
      this.smoke.emit({ x, y: y + 1, z, vx: Math.cos(a) * sp, vy: rand(3, 9) * size, vz: Math.sin(a) * sp, life: rand(2.5, 4.5), size: rand(2, 3.5) * size, grow: 2.6, r: dark, g: dark * 0.95, b: dark * 0.9, a: 0.75, frame: SPRITE.smoke, drag: 1.1, grav: -1.2, spin: rand(-0.3, 0.3), fadeIn: 0.12 });
    }
    if (onWater) {
      this.splash(x, z, 1.6 * size);
      this.smoke.emit({ x, y: 0.15, z, life: 0.9, size: 2 * size, grow: 9, r: 1.4, g: 1.4, b: 1.45, a: 0.8, frame: SPRITE.ring, mode: 2, fadeIn: 0 });
    }
  }

  shieldHit(ship: number, root: THREE.Object3D, x: number, y: number, z: number, broke: boolean): void {
    let s = this.shields.find((q) => q.ship === ship) ?? this.shields.reduce((a, b) => (a.age > b.age ? a : b));
    s.ship = ship;
    s.age = 0;
    s.u.uBreak.value = broke ? 1 : 0;
    s.mesh.visible = true;
    // the hit, in the bubble's own frame
    const local = root.worldToLocal(new THREE.Vector3(x, y, z));
    s.u.uHit.value.set(local.x / 5.2, (local.y - 3) / 6.5, local.z / 11).normalize();
    if (broke) {
      for (let i = 0; i < 40; i++) {
        const a = Math.random() * TAU, e = rand(-0.6, 1);
        const sp = rand(6, 16);
        this.glow.emit({ x: root.position.x + Math.cos(a) * 5, y: 3 + e * 5, z: root.position.z + Math.sin(a) * 8, vx: Math.cos(a) * sp, vy: e * sp * 0.6 + 4, vz: Math.sin(a) * sp, life: rand(0.5, 1), size: rand(0.25, 0.5), r: 0.8, g: 2.2, b: 4.5, frame: SPRITE.shard, grav: 12, spin: rand(-10, 10), fadeIn: 0 });
      }
    } else {
      for (let i = 0; i < 6; i++) {
        const a = Math.random() * TAU, sp = rand(3, 8);
        this.glow.emit({ x, y, z, vx: Math.cos(a) * sp, vy: rand(-2, 5), vz: Math.sin(a) * sp, life: rand(0.3, 0.55), size: 0.2, r: 1, g: 2.6, b: 5, frame: SPRITE.star, fadeIn: 0 });
      }
    }
  }

  /** A ship lost: the fire, the flotsam, and her wisp lantern rising free into the sky. */
  sink(x: number, z: number, heading: number): void {
    this.explode(x, 2, z, 1.4, true);
    for (let i = 0; i < 18; i++) {
      const a = Math.random() * TAU, sp = rand(3, 12);
      if (this.planks.length >= 220) this.planks.shift();
      this.planks.push({ x: x + Math.sin(heading) * rand(-6, 6), y: rand(1, 4), z: z + Math.cos(heading) * rand(-6, 6), vx: Math.cos(a) * sp, vy: rand(5, 14), vz: Math.sin(a) * sp, rx: rand(0, TAU), ry: rand(0, TAU), rz: rand(0, TAU), wx: rand(-6, 6), wy: rand(-4, 4), wz: rand(-6, 6), life: rand(14, 22), s: rand(0.6, 1.4) });
    }
  }

  /** The gust: a ring of wind round the hull and a spray off the bow. */
  gust(x: number, z: number, heading: number): void {
    const fx = Math.sin(heading), fz = Math.cos(heading);
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * TAU, r = rand(4, 9);
      this.glow.emit({ x: x + Math.cos(a) * r, y: rand(1, 9), z: z + Math.sin(a) * r, vx: -fx * rand(25, 40), vy: rand(-1, 2), vz: -fz * rand(25, 40), life: rand(0.25, 0.5), size: 0.08, r: 1.6, g: 1.9, b: 2.2, a: 0.8, frame: SPRITE.spark, mode: 1, stretch: 0.12, fadeIn: 0 });
    }
    for (let i = 0; i < 16; i++) {
      const side = i % 2 ? 1 : -1, sp = rand(5, 10);
      this.smoke.emit({ x: x + fx * 6, y: 0.6, z: z + fz * 6, vx: fz * side * sp + fx * 6, vy: rand(4, 8), vz: -fx * side * sp + fz * 6, life: rand(0.7, 1.2), size: 0.7, grow: 2.5, r: 1.3, g: 1.35, b: 1.4, a: 0.7, frame: SPRITE.spray, grav: 14, float: true });
    }
    this.smoke.emit({ x, y: 0.12, z, life: 0.8, size: 4, grow: 4, r: 1.2, g: 1.3, b: 1.4, a: 0.6, frame: SPRITE.ring, mode: 2, fadeIn: 0 });
    this.water.stamp(x, z, 12, 0.8, 1.2);
  }

  sparkle(x: number, y: number, z: number, color: THREE.Color, n = 18, spread = 2): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, sp = rand(1, 5);
      this.glow.emit({ x: x + Math.cos(a) * spread * Math.random(), y: y + rand(0, 1.5), z: z + Math.sin(a) * spread * Math.random(), vx: Math.cos(a) * sp, vy: rand(2, 7), vz: Math.sin(a) * sp, life: rand(0.5, 1.1), size: rand(0.25, 0.6), r: color.r * 3, g: color.g * 3, b: color.b * 3, frame: SPRITE.star, drag: 2, grav: 2, fadeIn: 0.05 });
    }
  }

  /** Smoke from a hurt ship, flames from a dying one; called each frame per ship. */
  wounded(x: number, y: number, z: number, hp: number, dt: number): void {
    if (hp > 0.6) return;
    const rate = (0.6 - hp) * 14;
    if (Math.random() < rate * dt) {
      const d = 0.22 + hp * 0.4;
      this.smoke.emit({ x: x + rand(-1, 1), y, z: z + rand(-1, 1), vx: rand(-0.5, 0.5), vy: rand(2, 4), vz: rand(-0.5, 0.5), life: rand(2, 3.5), size: 0.8, grow: 4, r: d, g: d * 0.95, b: d * 0.92, a: 0.6, frame: SPRITE.smoke, drag: 0.4, spin: rand(-0.5, 0.5) });
    }
    if (hp < 0.3 && Math.random() < (0.3 - hp) * 50 * dt) {
      this.glow.emit({ x: x + rand(-1.2, 1.2), y: y - 0.5, z: z + rand(-1.2, 1.2), vy: rand(2, 4), life: rand(0.35, 0.6), size: rand(0.5, 0.9), grow: 0.4, r: 5, g: 2.2, b: 0.6, frame: SPRITE.flame, fadeIn: 0.1 });
    }
  }

  /** The wake and the bow wave, stamped into the water's foam. */
  wake(x: number, z: number, heading: number, speed: number, dt: number): void {
    if (speed < 0.8) return;
    const fx = Math.sin(heading), fz = Math.cos(heading), k = Math.min(1, speed / 14);
    const sx = fz * 1.6, sz = -fx * 1.6;
    this.water.stamp(x - fx * 6 + sx, z - fz * 6 + sz, 1.3 + k * 0.9, 0.12 + k * 0.3, 0.35 * k);
    this.water.stamp(x - fx * 6 - sx, z - fz * 6 - sz, 1.3 + k * 0.9, 0.12 + k * 0.3, 0.35 * k);
    this.water.stamp(x + fx * 6.5, z + fz * 6.5, 1.2 + k * 0.8, 0.1 + k * 0.28, 0.45 * k);
    if (speed > 9 && Math.random() < (speed - 9) * 3 * dt) {
      const side = Math.random() < 0.5 ? -1 : 1, sp = rand(2, 4);
      this.smoke.emit({ x: x + fx * 6.5 + fz * side * 1.2, y: 0.4, z: z + fz * 6.5 - fx * side * 1.2, vx: fz * side * sp + fx * speed * 0.6, vy: rand(2, 4), vz: -fx * side * sp + fz * speed * 0.6, life: rand(0.5, 0.8), size: 0.5, grow: 2.2, r: 1.3, g: 1.35, b: 1.4, a: 0.55, frame: SPRITE.spray, grav: 12, float: true });
    }
  }

  // ---------------------------------------------------------------- per-frame state

  /** Shots in flight: tracers and trails for the light ones, real bolts and shells for the heavy. */
  shots(list: readonly { id: number; kind: string; rarity: number; x: number; y: number; z: number; vx: number; vy: number; vz: number }[]): void {
    let nb = 0, nm = 0;
    const seen = new Set<number>();
    for (const p of list) {
      seen.add(p.id);
      const prev = this.trails.get(p.id);
      const [px, py, pz] = prev ?? [p.x - p.vx * 0.016, p.y - p.vy * 0.016, p.z - p.vz * 0.016];
      const rc = RARITY_GLOW[p.rarity];
      switch (p.kind) {
        case 'cannon':
          this.glow.emit({ x: p.x, y: p.y, z: p.z, vx: p.vx, vy: p.vy, vz: p.vz, life: 0, size: 0.32, r: 6, g: 3.4, b: 1.2, frame: SPRITE.spark, mode: 1, stretch: 0.035 });
          this.trail(px, py, pz, p.x, p.y, p.z, 2.2, (x, y, z) => this.smoke.emit({ x, y, z, vy: 0.4, life: rand(0.5, 0.8), size: 0.25, grow: 4, r: 0.9, g: 0.88, b: 0.86, a: 0.3, frame: SPRITE.smoke, drag: 1.5 }));
          break;
        case 'repeater':
          this.glow.emit({ x: p.x, y: p.y, z: p.z, vx: p.vx, vy: p.vy, vz: p.vz, life: 0, size: 0.12, r: 6 * (0.6 + rc.r * 0.4), g: 4.6 * (0.6 + rc.g * 0.4), b: 1.6 + rc.b, frame: SPRITE.spark, mode: 1, stretch: 0.05 });
          break;
        case 'scatter':
          this.glow.emit({ x: p.x, y: p.y, z: p.z, vx: p.vx, vy: p.vy, vz: p.vz, life: 0, size: 0.12, r: 6, g: 3, b: 1, frame: SPRITE.spark, mode: 1, stretch: 0.03 });
          break;
        case 'harpoon': {
          if (nb < 64) {
            this.tmp.position.set(p.x, p.y, p.z);
            this.tmp.lookAt(p.x + p.vx, p.y + p.vy, p.z + p.vz);
            this.tmp.updateMatrix();
            this.bolts.setMatrixAt(nb++, this.tmp.matrix);
          }
          this.glow.emit({ x: p.x, y: p.y, z: p.z, vx: p.vx, vy: p.vy, vz: p.vz, life: 0, size: 0.1, r: 2.4, g: 2.8, b: 3.4, a: 0.7, frame: SPRITE.spark, mode: 1, stretch: 0.06 });
          this.trail(px, py, pz, p.x, p.y, p.z, 3, (x, y, z) => this.smoke.emit({ x, y, z, life: 0.5, size: 0.15, grow: 3, r: 1.2, g: 1.25, b: 1.3, a: 0.35, frame: SPRITE.puff }));
          break;
        }
        case 'mortar': {
          if (nm < 64) {
            this.tmp.position.set(p.x, p.y, p.z);
            this.tmp.rotation.set(this.time * 7, this.time * 5, 0);
            this.tmp.updateMatrix();
            this.balls.setMatrixAt(nm++, this.tmp.matrix);
          }
          this.trail(px, py, pz, p.x, p.y, p.z, 0.9, (x, y, z) => {
            this.glow.emit({ x, y, z, life: rand(0.15, 0.3), size: 0.9, grow: 0.3, r: 5, g: 2.2, b: 0.5, frame: SPRITE.flame, fadeIn: 0 });
            this.smoke.emit({ x, y, z, vy: 0.5, life: rand(1.2, 2), size: 0.6, grow: 4, r: 0.35, g: 0.33, b: 0.32, a: 0.45, frame: SPRITE.smoke, drag: 1, spin: rand(-0.5, 0.5) });
          });
          break;
        }
      }
      this.trails.set(p.id, [p.x, p.y, p.z, 0]);
    }
    for (const id of this.trails.keys()) if (!seen.has(id)) this.trails.delete(id);
    this.bolts.count = nb;
    this.balls.count = nm;
    this.bolts.instanceMatrix.needsUpdate = true;
    this.balls.instanceMatrix.needsUpdate = true;
  }

  private trail(ax: number, ay: number, az: number, bx: number, by: number, bz: number, step: number, f: (x: number, y: number, z: number) => void): void {
    const d = Math.hypot(bx - ax, by - ay, bz - az), n = Math.min(40, Math.floor(d / step));
    for (let i = 1; i <= n; i++) { const t = i / n; f(ax + (bx - ax) * t, ay + (by - ay) * t, az + (bz - az) * t); }
  }

  /** Floating loot: the item turning over its beacon. Clams sit in the shallows; glimmer sparks along their lanes. */
  loot(items: readonly LootLike[], clams: readonly ClamLike[], motes: readonly MoteLike[], eye: THREE.Vector3, ground: (x: number, z: number) => number): void {
    const t = this.time;
    const counts = new Map<TokenKind, number>();
    let nb = 0;
    const B = this.beamAttr.array as Float32Array, BC = this.beamCol.array as Float32Array;
    for (const l of items) {
      const d = Math.hypot(l.x - eye.x, l.z - eye.z);
      if (d > 520) continue;
      const c = RARITY_GLOW[l.rarity];
      if (nb < 600) {
        B[nb * 4] = l.x; B[nb * 4 + 1] = l.z; B[nb * 4 + 2] = 14 + l.rarity * 7; B[nb * 4 + 3] = (0.35 + l.rarity * 0.18) * (d > 300 ? 1.5 : 1);
        BC[nb * 3] = c.r * 1.6; BC[nb * 3 + 1] = c.g * 1.6; BC[nb * 3 + 2] = c.b * 1.6;
        nb++;
      }
      if (d > 260) continue;
      const mesh = this.tokens.get(l.kind)!;
      const i = counts.get(l.kind) ?? 0;
      if (i >= 400) continue;
      counts.set(l.kind, i + 1);
      const pop = Math.min(1, l.age * 2.5);
      const y = waveHeight(l.x, l.z, t) + 1.5 + Math.sin(t * 2 + l.id) * 0.25 + (1 - pop) * 2;
      this.tmp.position.set(l.x, y, l.z);
      this.tmp.rotation.set(l.kind === 'drift' || l.kind === 'heart' ? 0.3 : 0.15, t * 1.4 + l.id, 0);
      this.tmp.scale.setScalar(0.4 + pop * 0.6);
      this.tmp.updateMatrix();
      mesh.setMatrixAt(i, this.tmp.matrix);
      mesh.setColorAt(i, c);
      // a halo on the water under it
      if (d < 140) this.glow.emit({ x: l.x, y: y - 1.3, z: l.z, life: 0, size: 1.6 + Math.sin(t * 3 + l.id) * 0.15, r: c.r * 1.2, g: c.g * 1.2, b: c.b * 1.2, a: 0.7, frame: SPRITE.ring, mode: 2, rot: 0 });
    }
    for (const [k, mesh] of this.tokens) {
      mesh.count = counts.get(k) ?? 0;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    // clams: a hinged lid that swings open once
    let nc = 0;
    const gold = RARITY_GLOW[4];
    for (const c of clams) {
      const d = Math.hypot(c.x - eye.x, c.z - eye.z);
      if (d > 600) continue;
      const y = Math.max(ground(c.x, c.z), -1.4) - 0.1;
      const yaw = (c.id * 2.399) % TAU;
      this.tmp.position.set(c.x, y, c.z);
      this.tmp.rotation.set(0, yaw, 0);
      this.tmp.scale.setScalar(1);
      this.tmp.updateMatrix();
      this.clamBottom.setMatrixAt(nc, this.tmp.matrix);
      const open = c.open ? Math.min(1, c.openT * 2.5) : 0;
      const lid = open * 1.15 * (1 - 0.15 * Math.exp(-c.openT * 3) * Math.sin(c.openT * 20)) + (c.open ? 0 : 0.03 + 0.03 * Math.sin(t * 2.2 + c.id));
      this.tmp.rotation.set(-lid, yaw, 0, 'YXZ');
      this.tmp.updateMatrix();
      this.clamTop.setMatrixAt(nc, this.tmp.matrix);
      nc++;
      if (!c.open) {
        if (nb < 600) {
          B[nb * 4] = c.x; B[nb * 4 + 1] = c.z; B[nb * 4 + 2] = 22; B[nb * 4 + 3] = 0.8;
          BC[nb * 3] = gold.r * 1.8; BC[nb * 3 + 1] = gold.g * 1.6; BC[nb * 3 + 2] = gold.b * 1.2;
          nb++;
        }
        if (d < 120 && Math.random() < 0.08) this.glow.emit({ x: c.x + rand(-2, 2), y: y + rand(0.5, 2), z: c.z + rand(-2, 2), vy: rand(0.5, 1.5), life: rand(0.6, 1.2), size: rand(0.2, 0.45), r: 4, g: 3, b: 1.2, frame: SPRITE.star, fadeIn: 0.3 });
      } else if (open < 1 || c.openT < 4) {
        if (d < 120 && Math.random() < 0.3) this.glow.emit({ x: c.x, y: y + 0.8, z: c.z, vy: rand(1, 3), life: rand(0.5, 1), size: rand(0.2, 0.4), r: 3, g: 3, b: 3.6, frame: SPRITE.star });
      }
    }
    this.clamBottom.count = this.clamTop.count = nc;
    this.clamBottom.instanceMatrix.needsUpdate = this.clamTop.instanceMatrix.needsUpdate = true;
    // glimmer lanes
    for (const m of motes) {
      if (m.t > 0) continue;
      const d = Math.hypot(m.x - eye.x, m.z - eye.z);
      if (d > 300) continue;
      const y = waveHeight(m.x, m.z, t) + 1.1 + Math.sin(t * 3 + m.x) * 0.2;
      this.glow.emit({ x: m.x, y, z: m.z, life: 0, size: 0.75 + 0.15 * Math.sin(t * 5 + m.z), r: 4.2, g: 3.2, b: 1.2, a: Math.min(1, (300 - d) / 60), frame: SPRITE.star, rot: t + m.x });
      if (d < 150) this.glow.emit({ x: m.x, y: y - 0.95, z: m.z, life: 0, size: 1.1, r: 1.6, g: 1.2, b: 0.4, a: 0.45, frame: SPRITE.ring, mode: 2, rot: 0 });
    }
    const g = this.beams.geometry as THREE.InstancedBufferGeometry;
    g.instanceCount = nb;
    this.beamAttr.needsUpdate = true;
    this.beamCol.needsUpdate = true;
  }

  /** The storm's wall at its circle; `on` fades it in once the first circle is drawn. */
  setStorm(x: number, z: number, r: number, on: number, flash: number): void {
    this.storm.position.set(x, -2, z);
    this.storm.scale.set(Math.max(r, 1), 650, Math.max(r, 1));
    this.stormU.uRadius.value = Math.max(r, 1);
    this.stormU.uOn.value = on;
    this.stormU.uFlash.value = flash;
    this.storm.visible = on > 0.01;
  }

  /** Lays the Gale's tube along its line; `on` fades it. */
  setGale(ax: number, az: number, bx: number, bz: number, alt: number): void {
    const a = new THREE.Vector3(ax, alt, az), b = new THREE.Vector3(bx, alt, bz);
    const ext = b.clone().sub(a).multiplyScalar(0.15);
    this.gale.geometry.dispose();
    this.gale.geometry = new THREE.TubeGeometry(new THREE.LineCurve3(a.clone().sub(ext), b.clone().add(ext)), 64, 26, 16, false);
  }
  galeOn(on: number): void {
    this.galeU.uOn.value = on;
    this.gale.visible = on > 0.01;
  }

  /** Speed lines streaming past a falling or gusting ship. */
  windAround(x: number, y: number, z: number, vx: number, vy: number, vz: number, rate: number, dt: number): void {
    const n = rate * dt;
    for (let i = 0; i < n || Math.random() < n - i; i++) {
      const a = Math.random() * TAU, r = rand(5, 16);
      this.glow.emit({ x: x + Math.cos(a) * r, y: y + rand(-6, 8), z: z + Math.sin(a) * r, vx: -vx * 1.4, vy: -vy * 1.4, vz: -vz * 1.4, life: rand(0.2, 0.4), size: 0.04, r: 1.2, g: 1.35, b: 1.5, a: 0.35, frame: SPRITE.spark, mode: 1, stretch: 0.08, fadeIn: 0.2 });
      if (i > 60) break;
    }
  }

  update(dt: number, t: number, light: THREE.Color, focus: THREE.Vector3): void {
    this.time = t;
    // shields fade
    for (const s of this.shields) {
      if (s.age > 1) { s.mesh.visible = false; s.ship = -1; continue; }
      s.age += dt;
      s.u.uAge.value = s.age;
      s.u.uAlpha.value = Math.max(0, 1 - s.age * 1.6) * (1 + s.u.uBreak.value);
    }
    // flotsam bobs, drifts and sinks
    let np = 0;
    for (let i = this.planks.length - 1; i >= 0; i--) {
      const p = this.planks[i];
      p.life -= dt;
      if (p.life <= 0) { this.planks.splice(i, 1); continue; }
      const h = waveHeight(p.x, p.z, t) - (p.life < 3 ? (3 - p.life) * 0.6 : 0);
      if (p.y > h + 0.1) { p.vy -= 22 * dt; p.wx *= 0.995; }
      else {
        p.vy = (h - p.y) * 6;
        p.vx *= 1 - dt * 1.5; p.vz *= 1 - dt * 1.5;
        p.wx *= 1 - dt * 3; p.wz *= 1 - dt * 3; p.wy *= 1 - dt * 1;
        p.rx += (0 - Math.sin(p.rx) * 0.5) * dt; p.rz += (0 - Math.sin(p.rz) * 0.5) * dt;
      }
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      p.rx += p.wx * dt; p.ry += p.wy * dt; p.rz += p.wz * dt;
      if (Math.abs(p.x - focus.x) > 400 || Math.abs(p.z - focus.z) > 400) continue;
      this.tmp.position.set(p.x, p.y, p.z);
      this.tmp.rotation.set(p.rx, p.ry, p.rz);
      this.tmp.scale.set(p.s, 1, p.s);
      this.tmp.updateMatrix();
      this.plankMesh.setMatrixAt(np++, this.tmp.matrix);
    }
    this.plankMesh.count = np;
    this.plankMesh.instanceMatrix.needsUpdate = true;
    this.smoke.mat.uniforms.uLight.value.copy(light);
    this.glow.update(dt, t);
    this.smoke.update(dt, t);
  }

  /** Where a shield bubble sits: on its ship, each frame. */
  placeShields(at: (ship: number) => THREE.Object3D | null): void {
    for (const s of this.shields) {
      if (s.ship < 0) continue;
      const root = at(s.ship);
      if (!root) { s.mesh.visible = false; continue; }
      s.mesh.position.copy(root.position).y += 3;
      s.mesh.quaternion.copy(root.quaternion);
    }
  }
}

function mergeGeos(gs: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const pos: number[] = [], nor: number[] = [], idx: number[] = [];
  let off = 0;
  for (const g of gs) {
    const p = g.getAttribute('position'), n = g.getAttribute('normal');
    for (let i = 0; i < p.count; i++) { pos.push(p.getX(i), p.getY(i), p.getZ(i)); nor.push(n.getX(i), n.getY(i), n.getZ(i)); }
    if (g.index) for (let i = 0; i < g.index.count; i++) idx.push(g.index.getX(i) + off);
    else for (let i = 0; i < p.count; i++) idx.push(i + off);
    off += p.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setIndex(idx);
  return out;
}

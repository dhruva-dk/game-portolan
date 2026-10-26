import * as THREE from 'three';
import { inkMaterial } from '../style/glsl.ts';
import { PIGMENTS, type RGB } from '../style/palette.ts';
import type { GullMarks } from './harbourScene.ts';
import { FORM_NAMES, FORMS, type FormName } from './ships/forms.ts';
import { Ship } from './ships/shipwright.ts';

type Style = Parameters<typeof inkMaterial>[0];
type T3 = readonly [number, number, number];

export interface HarbourLook { readonly form: number; readonly pigments: readonly [RGB, RGB] | null; readonly marks: GullMarks }
export const HARBOUR_BUDGET = { calls: 150, triangles: 420_000 } as const;
export const BERTH = { quayZ: -2.1, quayY: 0.42, shipX: 0.4, nextX: -5.9, lampX: [-8.2, -4.4, -0.9, 3.2] } as const;
const LIGHTHOUSE = new THREE.Vector3(10.4, 0.45, -8.6);

const PIG = PIGMENTS as unknown as Record<string, RGB | undefined>;
const pig = (name: string, fallback: RGB): RGB => PIG[name] ?? fallback;
export const PLAYER_PIGMENTS: readonly [RGB, RGB] = [pig('ultramarine', [0.22, 0.32, 0.62]), pig('vermilion', [0.78, 0.26, 0.16])];
const NEIGHBOUR: readonly [RGB, RGB] = [pig('verdigris', [0.3, 0.55, 0.45]), pig('ochre', [0.8, 0.6, 0.3])];
const ROADS: readonly [RGB, RGB] = [pig('iron', [0.3, 0.27, 0.25]), pig('madder', [0.6, 0.25, 0.3])];

export function swellAt(x: number, z: number, t: number): number {
  return 0.035 * Math.sin(0.33 * x + 0.9 * t) + 0.022 * Math.sin(0.52 * z - 0.7 * t + 0.27 * x) + 0.01 * Math.sin(1.3 * x + 1.1 * z + 1.7 * t);
}

const SOLID_VERT =  `
attribute vec3 tint;
varying vec3 vN;
varying vec3 vC;
varying vec3 vW;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  vC = tint;
  vN = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const FLY_VERT =  `
attribute vec3 tint;
uniform float uFlap;
varying vec3 vN;
varying vec3 vC;
varying vec3 vW;
void main() {
  vec3 p = position;
  float s = abs(p.z);
  p.y += uFlap * s * 0.9;
  p.x -= abs(uFlap) * s * 0.12;
  vec4 w = modelMatrix * vec4(p, 1.0);
  vW = w.xyz;
  vC = tint;
  vN = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const SOLID_FRAG =  `
uniform vec3 uKey;
varying vec3 vN;
varying vec3 vC;
varying vec3 vW;
void main() {
  vec3 n = normalize(gl_FrontFacing ? vN : -vN);
  float lit = 0.58 + 0.42 * max(dot(n, uKey), 0.0);
  float haze = smoothstep(18.0, 130.0, length(vW - cameraPosition));
  writeInk(mix(vC * lit, vec3(0.66, 0.55, 0.56), haze * 0.6), n);
}`;
const WATER_VERT =  `
uniform float uClock;
varying vec3 vN;
varying vec3 vW;
float swell(vec2 p, float t) {
  return 0.035 * sin(0.33 * p.x + 0.9 * t) + 0.022 * sin(0.52 * p.y - 0.7 * t + 0.27 * p.x) + 0.01 * sin(1.3 * p.x + 1.1 * p.y + 1.7 * t);
}
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  float e = 0.08, h = swell(w.xz, uClock);
  float hx = swell(w.xz + vec2(e, 0.0), uClock), hz = swell(w.xz + vec2(0.0, e), uClock);
  w.y += h;
  vN = normalize(vec3(-(hx - h) / e, 1.0, -(hz - h) / e));
  vW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const WATER_FRAG =  `
uniform float uClock;
uniform float uQuay;
uniform vec3 uDeep;
uniform vec3 uShine;
uniform vec3 uWarm;
uniform vec4 uLampX;
varying vec3 vN;
varying vec3 vW;
void main() {
  vec3 n = normalize(vN);
  vec3 v = normalize(cameraPosition - vW);
  float f = pow(1.0 - max(dot(v, n), 0.0), 4.0);
  vec3 c = mix(uDeep, uShine, clamp(f * 1.3 + 0.06, 0.0, 1.0));
  float near = (1.0 - smoothstep(uQuay, uQuay + 10.0, vW.z)) * step(uQuay, vW.z);
  float glint = 0.0;
  for (int i = 0; i < 4; i++) {
    float lx = uLampX[i];
    glint += exp(-abs(vW.x - lx) * 3.2) * (0.5 + 0.5 * sin(vW.z * 7.0 + uClock * 1.6 + lx * 3.0 + 4.0 * n.x));
  }
  writeInk(c + uWarm * glint * near * 0.45, n);
}`;
const SKY_VERT =  `
varying vec3 vW;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const SKY_FRAG =  `
uniform vec3 uLow;
uniform vec3 uMid;
uniform vec3 uHigh;
uniform vec3 uGlowDir;
varying vec3 vW;
void main() {
  vec3 d = normalize(vW - cameraPosition);
  float h = clamp(d.y, -0.2, 1.0);
  vec3 c = mix(uLow, uMid, smoothstep(0.0, 0.14, h));
  c = mix(c, uHigh, smoothstep(0.12, 0.6, h));
  c += vec3(0.42, 0.2, 0.06) * pow(max(dot(d, uGlowDir), 0.0), 10.0);
  writeInk(c, -d);
}`;
const GLOW_VERT =  `
attribute vec3 centre;
attribute vec2 corner;
attribute vec2 sizePhase;
uniform float uClock;
varying vec2 vUv;
void main() {
  vec3 r = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 u = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  float ph = sizePhase.y;
  float s = sizePhase.x * (1.0 + 0.07 * sin(uClock * 2.3 + ph) + 0.03 * sin(uClock * 7.1 + ph * 2.0));
  vUv = corner;
  gl_Position = projectionMatrix * viewMatrix * vec4(centre + (r * corner.x + u * corner.y) * s, 1.0);
}`;
const GLOW_FRAG =  `
uniform vec3 uColour;
varying vec2 vUv;
void main() {
  float d = length(vUv);
  writeVeil(uColour, exp(-d * d * 4.5) * (1.0 - smoothstep(0.75, 1.0, d)) * 0.6);
}`;
const BEAM_VERT =  `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
}`;
const BEAM_FRAG =  `
uniform vec3 uColour;
varying vec2 vUv;
void main() {
  writeVeil(uColour, 0.24 * pow(vUv.y, 2.2));
}`;

const V = (x = 0, y = 0, z = 0): THREE.Vector3 => new THREE.Vector3(x, y, z);
const UP = V(0, 1, 0);
function M(x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx): THREE.Matrix4 {
  return new THREE.Matrix4().compose(V(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), V(sx, sy, sz));
}
function rand(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}
function quads(q: readonly (readonly [T3, T3, T3, T3])[]): THREE.BufferGeometry {
  const p: number[] = [];
  for (const [a, b, c, d] of q) p.push(...a, ...b, ...c, ...a, ...c, ...d);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  g.computeVertexNormals();
  return g;
}
function roof(w: number, d: number, h: number): THREE.BufferGeometry {
  const x = w / 2, z = d / 2;
  const A: T3 = [-x, 0, z], B: T3 = [x, 0, z], C: T3 = [x, h, 0], D: T3 = [-x, h, 0], E: T3 = [x, 0, -z], F: T3 = [-x, 0, -z];
  return quads([[A, B, C, D], [E, F, D, C], [B, E, C, C], [F, A, D, D]]);
}

class Kit {
  private readonly pos: number[] = [];
  private readonly nor: number[] = [];
  private readonly tint: number[] = [];
  private readonly c = new THREE.Color();
  add(g: THREE.BufferGeometry, m: THREE.Matrix4, hex: string): this {
    const ng = g.index ? g.toNonIndexed() : g;
    ng.applyMatrix4(m);
    const p = ng.getAttribute('position'), n = ng.getAttribute('normal'), c = this.c.set(hex);
    for (let i = 0; i < p.count; i++) {
      this.pos.push(p.getX(i), p.getY(i), p.getZ(i));
      this.nor.push(n.getX(i), n.getY(i), n.getZ(i));
      this.tint.push(c.r, c.g, c.b);
    }
    g.dispose();
    if (ng !== g) ng.dispose();
    return this;
  }
  box(x: number, y: number, z: number, sx: number, sy: number, sz: number, hex: string, ry = 0, rx = 0, rz = 0): this {
    return this.add(new THREE.BoxGeometry(1, 1, 1), M(x, y, z, rx, ry, rz, sx, sy, sz), hex);
  }
  cyl(x: number, y: number, z: number, rTop: number, rBot: number, h: number, seg: number, hex: string, rx = 0, rz = 0): this {
    return this.add(new THREE.CylinderGeometry(rTop, rBot, h, seg), M(x, y, z, rx, 0, rz), hex);
  }
  ball(x: number, y: number, z: number, sx: number, sy: number, sz: number, hex: string, seg = 8): this {
    return this.add(new THREE.SphereGeometry(1, seg, Math.max(4, seg >> 1)), M(x, y, z, 0, 0, 0, sx, sy, sz), hex);
  }
  rod(a: THREE.Vector3, b: THREE.Vector3, r: number, hex: string, seg = 4): this {
    const d = b.clone().sub(a), len = d.length();
    const m = new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), new THREE.Quaternion().setFromUnitVectors(UP, d.normalize()), V(1, 1, 1));
    return this.add(new THREE.CylinderGeometry(r, r, len, seg, 1, true), m, hex);
  }
  rope(a: THREE.Vector3, b: THREE.Vector3, sag: number, r: number, hex: string, n = 6): this {
    let prev = a;
    for (let i = 1; i <= n; i++) {
      const t = i / n, p = a.clone().lerp(b, t);
      p.y -= sag * 4 * t * (1 - t);
      this.rod(prev, p, r, hex, 3);
      prev = p;
    }
    return this;
  }
  get empty(): boolean { return this.pos.length === 0; }
  mesh(material: THREE.Material): THREE.Mesh {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('tint', new THREE.Float32BufferAttribute(this.tint, 3));
    g.computeBoundingSphere();
    return new THREE.Mesh(g, material);
  }
}

function free(o: THREE.Object3D, keep: ReadonlySet<THREE.Material>): void {
  o.traverse((c) => {
    const m = c as THREE.Mesh;
    if (!m.isMesh) return;
    m.geometry.dispose();
    for (const x of Array.isArray(m.material) ? m.material : [m.material]) if (!keep.has(x)) x.dispose();
  });
}

function mooredShip(style: Style, form: FormName, pigments: readonly [RGB, RGB], lod: 'hero' | 'mid' | 'far'): { ship: Ship; len: number; beam: number } {
  const ship = new Ship(style, { form, pigments, lods: [lod] });
  const st = ship.rig.state('reefed', 2.2, 0);
  for (const s of st.sails) (s as { set: number }).set = 0;
  ship.setRig(st, 0);
  ship.updateMatrixWorld(true);
  const size = new THREE.Box3().setFromObject(ship).getSize(V());
  if (size.z > size.x) ship.rotation.y = Math.PI / 2;
  const spec = FORMS[form], len = spec.length;
  return { ship, len, beam: spec.beam };
}

export class Harbour3D {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(40, 1, 0.1, 900);
  ship: Ship | null = null;
  shipForm: FormName = 'pinnace';
  shipPigments = '';
  gullKey = '';
  detail: number;
  private readonly style: Style;
  private readonly sun = V(-0.45, 0.62, 0.64).normalize();
  private readonly time = { value: 0 };
  private readonly mats: Record<'stone' | 'wood' | 'build' | 'rope' | 'far' | 'bird', THREE.ShaderMaterial>;
  private readonly keep: Set<THREE.Material>;
  private readonly world = new THREE.Group();
  private readonly boats = new THREE.Group();
  private readonly berth = new THREE.Group();
  private readonly lines = new THREE.Group();
  private readonly gull = new THREE.Group();
  private head: THREE.Object3D | null = null;
  private wings: THREE.Object3D[] = [];
  private readonly beam = new THREE.Group();
  private readonly fleet: { ship: Ship; x: number; z: number }[] = [];
  private readonly wild: { mesh: THREE.Mesh; flap: { value: number }; c: THREE.Vector3; r: number; w: number; a: number }[] = [];
  private readonly perch = V();
  private readonly target = V();
  private shipLen = 4;
  private shipBeam = 1.2;
  private open = 0;
  private aspect = 1;

  constructor(style: Style, look: HarbourLook, detail = 1) {
    this.style = style;
    this.detail = detail;
    const solid = (w: number, double = false): THREE.ShaderMaterial =>
      inkMaterial(style, { vertexShader: SOLID_VERT, fragmentShader: SOLID_FRAG, uniforms: { uKey: { value: this.sun } }, inkWeight: w, ...(double ? { side: THREE.DoubleSide } : {}) });
    this.mats = { stone: solid(1), wood: solid(1, true), build: solid(1.1, true), rope: solid(0.5), far: solid(0.6, true), bird: solid(0.8) };
    this.keep = new Set(Object.values(this.mats));
    this.scene.add(this.world, this.berth, this.lines, this.gull, this.beam);
    this.buildSky();
    this.buildWater();
    this.buildBeam();
    this.buildWorld();
    this.setCareer(look);
  }

  layout(width: number, height: number): void {
    this.aspect = width / Math.max(1, height);
    this.camera.aspect = this.aspect;
    this.camera.fov = this.aspect > 1.6 ? 40 : 48;
    this.camera.updateProjectionMatrix();
  }

  setCareer(look: HarbourLook): void {
    const form = FORM_NAMES[Math.max(0, Math.min(FORM_NAMES.length - 1, Math.round(look.form)))]!;
    const pigments = look.pigments ?? PLAYER_PIGMENTS;
    const pk = pigments.map((p) => p.map((v) => v.toFixed(3)).join(',')).join('/');
    if (!this.ship || form !== this.shipForm || pk !== this.shipPigments) {
      this.shipForm = form;
      this.shipPigments = pk;
      this.buildShip(form, pigments);
    }
    const gk = `${(look.marks.marks ?? []).join(',')}|${look.marks.goldTips ? 1 : 0}`;
    if (gk !== this.gullKey) {
      this.gullKey = gk;
      this.buildGull(look.marks);
    }
  }

  setDetail(detail: number): void {
    if (Math.abs(detail - this.detail) < 0.01) return;
    this.detail = detail;
    this.buildWorld();
  }

  frame(t: number, dt: number, still: boolean, open: number): void {
    this.time.value = t;
    this.open = still ? open : this.open + (open - this.open) * Math.min(1, dt * 2.4);
    const o = this.open, m = still ? 0 : 1, wide = this.aspect > 1.6;
    this.camera.position.set(
      0.9 + 1.3 * o + 0.4 * m * Math.sin(t * 0.071),
      1.62 + 0.2 * o + 0.12 * m * Math.sin(t * 0.053 + 1.3),
      (wide ? 6.6 : 7.8) - 0.6 * o + 0.25 * m * Math.sin(t * 0.041 + 0.4),
    );
    this.target.set(0.3 + 1.9 * o + 0.25 * m * Math.sin(t * 0.062 + 2.1), 1.25, -1.8);
    this.camera.lookAt(this.target);
    const k = still ? 0.5 : 1;
    if (this.ship) {
      const x0 = BERTH.shipX, z0 = this.berth.position.z, L = this.shipLen * 0.45, B = this.shipBeam * 0.5;
      const hb = swellAt(x0 + L, z0, t), hs = swellAt(x0 - L, z0, t), hp = swellAt(x0, z0 + B, t), hq = swellAt(x0, z0 - B, t);
      this.berth.position.y = k * 0.85 * (hb + hs + hp + hq) / 4;
      this.berth.rotation.z = k * 0.7 * Math.atan2(hb - hs, 2 * L);
      this.berth.rotation.x = -k * 0.9 * Math.atan2(hp - hq, 2 * B) + k * 0.006 * Math.sin(t * 0.8);
      this.ship.advance(dt);
      this.ship.setWind(0.9, 0.3, t);
    }
    for (const f of this.fleet) {
      f.ship.position.y = k * 0.8 * swellAt(f.x, f.z, t);
      f.ship.rotation.x = k * 0.015 * Math.sin(t * 0.6 + f.x);
      f.ship.advance(dt);
    }
    this.boats.position.y = k * 0.7 * swellAt(0, 1, t);
    this.boats.rotation.z = k * 0.004 * Math.sin(t * 0.9);
    this.beam.rotation.y = still ? 0.6 : t * 0.42;
    if (this.head) {
      this.head.rotation.y = still ? 0.3 : 0.75 * Math.sin(t * 0.5) * Math.max(0, Math.sin(t * 0.23 + 1));
      this.head.rotation.z = still ? 0 : 0.08 * Math.sin(t * 1.3);
    }
    const stretch = still ? 0 : Math.max(0, Math.sin(t * 0.7)) ** 40;
    this.wings.forEach((w, i) => { w.rotation.x = (i ? -1 : 1) * (1.25 - 1.05 * stretch); });
    this.gull.position.y = this.perch.y + (still ? 0 : 0.005 * Math.sin(t * 2.1));
    for (const b of this.wild) {
      const a = b.a + t * b.w * (still ? 0.3 : 1);
      b.mesh.position.set(b.c.x + Math.cos(a) * b.r, b.c.y + 0.5 * Math.sin(t * 0.3 + b.a), b.c.z + Math.sin(a) * b.r);
      b.mesh.rotation.set(-0.35 * Math.sign(b.w), -(a + Math.sign(b.w) * Math.PI / 2), 0, 'YXZ');
      b.flap.value = still ? 0.12 : Math.sin(t * 6.5 + b.a * 3) * (0.15 + 0.4 * Math.max(0, Math.sin(t * 0.4 + b.a)));
    }
  }

  dispose(): void {
    free(this.scene, new Set<THREE.Material>());
    this.scene.clear();
    this.ship = null;
  }

  private buildSky(): void {
    const c = (hex: string) => ({ value: new THREE.Color(hex) });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(500, 32, 16), inkMaterial(this.style, {
      vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, inkWeight: 0, side: THREE.BackSide,
      uniforms: { uLow: c('#f2b47c'), uMid: c('#cf9590'), uHigh: c('#5f6d8e'), uGlowDir: { value: V(-0.75, 0.04, -0.66).normalize() } },
    }));
    sky.frustumCulled = false;
    this.scene.add(sky);
  }

  private buildWater(): void {
    const g = new THREE.PlaneGeometry(320, 220, 200, 140);
    g.rotateX(-Math.PI / 2);
    g.translate(0, 0, -60);
    const water = new THREE.Mesh(g, inkMaterial(this.style, {
      vertexShader: WATER_VERT, fragmentShader: WATER_FRAG, inkWeight: 0.35,
      uniforms: {
        uClock: this.time, uQuay: { value: BERTH.quayZ }, uDeep: { value: new THREE.Color('#3d5367') }, uShine: { value: new THREE.Color('#dcaa84') },
        uWarm: { value: new THREE.Color('#ffc66e') }, uLampX: { value: new THREE.Vector4(...BERTH.lampX) },
      },
    }));
    water.frustumCulled = false;
    this.scene.add(water);
  }

  private buildBeam(): void {
    const g = new THREE.CylinderGeometry(0.1, 2.4, 28, 18, 1, true);
    g.translate(0, -14, 0);
    g.rotateZ(Math.PI / 2);
    const mat = inkMaterial(this.style, { vertexShader: BEAM_VERT, fragmentShader: BEAM_FRAG, veil: true, side: THREE.DoubleSide, uniforms: { uColour: { value: new THREE.Color('#ffe2a4') } } });
    mat.transparent = true;
    mat.depthWrite = false;
    for (const ry of [0, Math.PI]) {
      const b = new THREE.Mesh(g, mat);
      b.rotation.y = ry;
      b.frustumCulled = false;
      this.beam.add(b);
    }
    this.beam.position.set(LIGHTHOUSE.x, LIGHTHOUSE.y + 3.79, LIGHTHOUSE.z);
  }

  private glows(list: readonly (readonly [THREE.Vector3, number, number])[]): THREE.Mesh {
    const centre: number[] = [], corner: number[] = [], sp: number[] = [];
    const C = [[-1, -1], [1, -1], [1, 1], [-1, -1], [1, 1], [-1, 1]] as const;
    for (const [p, s, ph] of list) for (const [x, y] of C) { centre.push(p.x, p.y, p.z); corner.push(x, y); sp.push(s, ph); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(centre, 3));
    g.setAttribute('centre', new THREE.Float32BufferAttribute(centre, 3));
    g.setAttribute('corner', new THREE.Float32BufferAttribute(corner, 2));
    g.setAttribute('sizePhase', new THREE.Float32BufferAttribute(sp, 2));
    const mat = inkMaterial(this.style, { vertexShader: GLOW_VERT, fragmentShader: GLOW_FRAG, veil: true, uniforms: { uClock: this.time, uColour: { value: new THREE.Color('#ffc870') } } });
    mat.transparent = true;
    mat.depthWrite = false;
    const mesh = new THREE.Mesh(g, mat);
    mesh.frustumCulled = false;
    return mesh;
  }

  private buildWorld(): void {
    free(this.world, this.keep);
    this.world.clear();
    this.boats.clear();
    this.fleet.length = 0;
    for (const b of this.wild) { this.scene.remove(b.mesh); b.mesh.geometry.dispose(); (b.mesh.material as THREE.Material).dispose(); }
    this.wild.length = 0;
    const r = rand(1789), d = this.detail, Q = BERTH.quayZ, QY = BERTH.quayY;
    const pick = <T>(a: readonly T[]): T => a[Math.floor(r() * a.length)]!;
    const stone = new Kit(), wood = new Kit(), build = new Kit(), rope = new Kit(), far = new Kit(), boat = new Kit();
    const glow: [THREE.Vector3, number, number][] = [];
    stone.box(-4.5, (QY - 0.3) / 2, Q - 3, 21, QY + 0.3, 6, '#a39a8c');
    for (let row = 0; row < 3; row++) {
      for (let x = -15 + (row % 2) * 0.27; x < 6; ) {
        const w = 0.42 + r() * 0.3;
        stone.box(x + w / 2, -0.18 + row * 0.19 + 0.09, Q + 0.03, w - 0.03, 0.17, 0.07, pick(['#9c9284', '#a8a092', '#918879', '#b0a797']));
        x += w;
      }
    }
    stone.box(-4.5, -0.13, Q + 0.07, 21, 0.12, 0.03, '#5b5850');
    for (let x = -14.6; x < 6; x += 0.9) stone.box(x, QY + 0.03, Q - 0.12, 0.87, 0.07, 0.3, '#bab1a1');
    for (let i = 0; i < 4; i++) { const h = QY - 0.11 * (i + 1); stone.box(4.75, (h - 0.3) / 2, Q + 0.14 * i + 0.07, 0.8, h + 0.3, 0.14, '#a59c8e'); }
    const m0 = V(5.9, 0, Q - 0.3), m1 = V(LIGHTHOUSE.x, 0, LIGHTHOUSE.z);
    for (let i = 0, n = Math.round(70 * (0.5 + 0.5 * d)); i < n; i++) {
      const p = m0.clone().lerp(m1, r()), s = 0.35 + r() * 0.5, side = (r() - 0.5) * 1.8;
      stone.box(p.x + side * 0.7, 0.05 + r() * 0.35, p.z + side * 0.5, s, s * 0.7, s * 0.9, pick(['#8f877b', '#9d968a', '#7e786e']), r() * 3, (r() - 0.5) * 0.4, (r() - 0.5) * 0.4);
    }
    for (let i = 0; i < 6; i++) { const p = m0.clone().lerp(m1, (i + 0.5) / 6); stone.box(p.x, 0.38, p.z, 1.3, 0.16, 1.25, '#b3aa9a', Math.atan2(m1.x - m0.x, m1.z - m0.z)); }
    const L = LIGHTHOUSE;
    stone.box(L.x, L.y + 0.2, L.z, 1.3, 0.4, 1.3, '#a29a8b');
    for (let i = 0; i < 5; i++) {
      const r0 = 0.5 - 0.034 * i, r1 = r0 - 0.034;
      stone.cyl(L.x, L.y + 0.4 + 0.35 + i * 0.7, L.z, r1, r0, 0.7, 16, i % 2 ? '#b8473a' : '#e8ddc7');
    }
    build.box(L.x, L.y + 0.75, L.z + 0.47, 0.2, 0.42, 0.06, '#3a2b20');
    const top = L.y + 3.9;
    stone.cyl(L.x, top + 0.04, L.z, 0.48, 0.42, 0.08, 16, '#5f5a55');
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; rope.rod(V(L.x + Math.cos(a) * 0.45, top + 0.08, L.z + Math.sin(a) * 0.45), V(L.x + Math.cos(a) * 0.45, top + 0.3, L.z + Math.sin(a) * 0.45), 0.01, '#2b2724'); }
    rope.cyl(L.x, top + 0.3, L.z, 0.46, 0.46, 0.02, 16, '#2b2724');
    build.cyl(L.x, top + 0.29, L.z, 0.25, 0.25, 0.42, 12, '#ffe0a0');
    stone.cyl(L.x, top + 0.62, L.z, 0.04, 0.32, 0.26, 12, '#3f3a36');
    stone.ball(L.x, top + 0.78, L.z, 0.05, 0.05, 0.05, '#3f3a36', 6);
    glow.push([V(L.x, top + 0.3, L.z), 1.7, 0]);
    const F = Q - 2.5;
    let idx = 0;
    for (let x = -15; x < 4.6; idx++) {
      const w = 2.3 + r() * 1.1, h = 1.5 + r() * 1.1, cx = x + w / 2;
      build.box(cx, QY + h / 2, F - 1.1, w - 0.12, h, 2.2, pick(['#d9c4a0', '#c9a989', '#b8a48d', '#cdb79a']));
      const along = r() < 0.55, rh = 0.55 + r() * 0.3, rt = pick(['#7b4b36', '#5f4b40', '#6e5a47']);
      build.add(along ? roof(w + 0.1, 2.45, rh) : roof(2.45, w + 0.1, rh), M(cx, QY + h, F - 1.1, 0, along ? 0 : Math.PI / 2), rt);
      build.box(cx - w * 0.18, QY + 0.33, F + 0.01, 0.44, 0.66, 0.05, '#3b2b20');
      const n = Math.max(2, Math.floor(w / 0.72));
      for (let y = QY + 0.98; y + 0.22 < QY + h; y += 0.62) {
        for (let c = 0; c < n; c++) {
          const wx = cx - w / 2 + (c + 0.5) * (w / n), lit = r() < 0.45;
          if (y < QY + 1 && Math.abs(wx - (cx - w * 0.18)) < 0.4) continue;
          build.box(wx, y, F + 0.015, 0.25, 0.31, 0.04, lit ? '#f4c66c' : '#2f2a28');
          build.box(wx, y - 0.18, F + 0.03, 0.31, 0.035, 0.06, '#8a7a66');
          if (lit && r() < 0.5) glow.push([V(wx, y, F + 0.1), 0.32, r() * 6]);
        }
      }
      if (r() < 0.5) {
        wood.box(cx + w * 0.2, QY + h - 0.12, F + 0.25, 0.07, 0.07, 0.5, '#4a3626');
        rope.rope(V(cx + w * 0.2, QY + h - 0.12, F + 0.48), V(cx + w * 0.2, QY + 0.5, F + 0.5), 0, 0.008, '#6b5a40', 2);
      }
      if (r() < 0.6) build.box(cx + (r() - 0.5) * w * 0.6, QY + h + rh * 0.7, F - 1.1 - 0.4, 0.22, 0.6, 0.22, '#8a5a44');
      if (idx === 3) {
        wood.rod(V(cx + w / 2 - 0.25, QY + 1.35, F), V(cx + w / 2 - 0.25, QY + 1.35, F + 0.5), 0.015, '#2e2a27');
        build.box(cx + w / 2 - 0.25, QY + 1.13, F + 0.45, 0.5, 0.32, 0.03, '#8b3b2c');
        build.box(cx + w / 2 - 0.25, QY + 1.13, F + 0.47, 0.06, 0.2, 0.01, '#d7b45c');
        build.box(cx + w / 2 - 0.25, QY + 1.06, F + 0.47, 0.18, 0.04, 0.01, '#d7b45c');
      }
      x += w;
    }
    for (let x = -14.5; x < 5.6; x += 1.45) { stone.cyl(x, QY + 0.08, Q - 0.2, 0.05, 0.065, 0.16, 8, '#3a3633'); stone.ball(x, QY + 0.17, Q - 0.2, 0.06, 0.035, 0.06, '#3a3633', 8); }
    BERTH.lampX.forEach((x, i) => {
      const z = Q - 0.4;
      stone.cyl(x, QY + 0.5, z, 0.028, 0.045, 1.0, 6, '#2e2a27');
      stone.box(x, QY + 0.06, z, 0.16, 0.12, 0.16, '#3a3633');
      build.box(x, QY + 1.08, z, 0.15, 0.19, 0.15, '#f6cf78');
      stone.cyl(x, QY + 1.22, z, 0.02, 0.13, 0.1, 4, '#2e2a27', 0, 0);
      for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) rope.rod(V(x + dx * 0.075, QY + 0.98, z + dz * 0.075), V(x + dx * 0.075, QY + 1.18, z + dz * 0.075), 0.008, '#2b2724', 3);
      glow.push([V(x, QY + 1.08, z), 0.95, i * 1.7]);
    });
    const crane = V(-9.6, QY, Q - 0.5);
    wood.rod(crane, crane.clone().add(V(0, 2.1, 0)), 0.06, '#5a4230', 6);
    wood.rod(crane.clone().add(V(0, 1.7, 0)), crane.clone().add(V(0.9, 2.3, 1.1)), 0.04, '#5a4230', 5);
    rope.rope(crane.clone().add(V(0.9, 2.3, 1.1)), crane.clone().add(V(0.9, 1.0, 1.1)), 0, 0.008, '#6b5a40', 2);
    wood.box(crane.x + 0.9, QY + 0.88, crane.z + 1.1, 0.26, 0.22, 0.22, '#9a7650', 0.3);
    const crates = Math.round(18 * d), barrels = Math.round(16 * d), coils = Math.round(6 * d);
    for (let i = 0; i < crates; i++) {
      const x = -14 + r() * 18.5, z = Q - 0.85 - r() * 1.25, s = 0.17 + r() * 0.1, rot = r() * 0.5, tall = r() < 0.35 ? 2 : 1;
      for (let k = 0; k < tall; k++) {
        const y = QY + s / 2 + k * s, tint = pick(['#a5814f', '#8f6c45', '#b38f5d']);
        wood.box(x, y, z, s, s, s, tint, rot + k * 0.2);
        wood.box(x, y, z, s * 1.03, s * 0.14, s * 1.03, '#5a4130', rot + k * 0.2);
      }
    }
    for (let i = 0; i < barrels; i++) {
      const x = -14 + r() * 18.5, z = Q - 0.6 - r() * 1.4, lying = r() < 0.25;
      const t = pick(['#7a5536', '#6b4a30', '#86603e']);
      if (lying) { wood.cyl(x, QY + 0.1, z, 0.1, 0.1, 0.24, 10, t, 0, Math.PI / 2); continue; }
      wood.cyl(x, QY + 0.12, z, 0.1, 0.1, 0.24, 10, t);
      for (const y of [0.05, 0.19]) rope.cyl(x, QY + y, z, 0.104, 0.104, 0.02, 10, '#2f2a26');
    }
    for (let i = 0; i < coils; i++) {
      const x = -13 + r() * 17, z = Q - 0.45 - r() * 0.5;
      for (let k = 0; k < 2; k++) rope.add(new THREE.TorusGeometry(0.11 - k * 0.02, 0.022, 5, 14), M(x, QY + 0.022 + k * 0.04, z, Math.PI / 2), '#b39a6a');
    }
    for (const nx of [-12.6, 2.5]) {
      const z = Q - 1.6, a = V(nx, QY + 1.0, z), b = V(nx + 1.4, QY + 1.0, z);
      wood.rod(V(nx, QY, z), a, 0.03, '#5a4230').rod(V(nx + 1.4, QY, z), b, 0.03, '#5a4230').rod(a, b, 0.02, '#5a4230');
      for (let i = 1; i < 12; i++) { const x = nx + (i / 12) * 1.4; rope.rope(V(x, QY + 1.0, z), V(x, QY + 0.25 + 0.1 * Math.sin(i), z + 0.02), 0.04, 0.006, '#4e5a44', 3); }
      for (let j = 1; j < 5; j++) rope.rope(V(nx, QY + 1.0 - j * 0.16, z + 0.01), V(nx + 1.4, QY + 1.0 - j * 0.16, z + 0.01), 0.1, 0.006, '#4e5a44', 4);
      rope.ball(nx + 0.7, QY + 0.06, z + 0.45, 0.4, 0.09, 0.26, '#4e5a44', 8);
    }
    const hull = (x: number, z: number, len: number, ry: number, tint: string): void => {
      boat.add(new THREE.CylinderGeometry(0.28, 0.28, len, 8, 1, true, Math.PI / 2, Math.PI), M(x, 0.08, z, -Math.PI / 2, ry, Math.PI / 2, 1, 1, 1), tint);
      for (const t of [-0.25, 0, 0.25]) boat.box(x + Math.cos(ry) * t * len, 0.03, z - Math.sin(ry) * t * len, 0.07, 0.025, 0.5, '#8a6a44', ry);
      boat.box(x, 0.09, z, len, 0.03, 0.04, '#3a2b20', ry);
    };
    hull(3.9, Q + 0.45, 1.15, 0.08, '#6b8a7a');
    hull(-2.7, 2.3, 1.0, -0.5, '#b8473a');
    boat.ball(-2.1, 0.02, 2.6, 0.1, 0.12, 0.1, '#c04a36', 8);
    rope.rope(V(-2.25, 0.06, 2.45), V(-2.1, 0.1, 2.6), 0.02, 0.006, '#6b5a40', 2);
    const ridge = (z: number, base: number, amp: number, seed: number, tint: string): void => {
      const q: [T3, T3, T3, T3][] = [];
      const hgt = (x: number) => base + amp * (0.5 + 0.3 * Math.sin(x * 0.07 + seed) + 0.2 * Math.sin(x * 0.19 + seed * 2) + 0.1 * Math.sin(x * 0.41 + seed * 3));
      for (let x = -160; x < 160; x += 5) {
        const h0 = hgt(x), h1 = hgt(x + 5);
        q.push([[x, -1, z], [x + 5, -1, z], [x + 5, h1, z - 3], [x, h0, z - 3]]);
        q.push([[x, h0, z - 3], [x + 5, h1, z - 3], [x + 5, h1 * 0.6, z - 14], [x, h0 * 0.6, z - 14]]);
      }
      far.add(quads(q), new THREE.Matrix4(), tint);
    };
    ridge(-62, 2.5, 9, 1.3, '#8a7a8e');
    ridge(-100, 6, 16, 4.1, '#a597a6');
    for (let i = 0; i < Math.round(14 * d); i++) far.box(-38 + i * 1.6 + r(), 1.4 + r() * 0.5, -61.5, 1.2, 1.4 + r(), 0.8, pick(['#9c8c90', '#8e7f86']));
    far.box(-30, 3.6, -61.6, 1.0, 4.6, 1.0, '#8a7a82');
    far.cyl(-30, 6.6, -61.6, 0, 0.65, 1.6, 4, '#7a6a74');
    for (const [kit, mat] of [[stone, this.mats.stone], [wood, this.mats.wood], [build, this.mats.build], [rope, this.mats.rope], [far, this.mats.far]] as const) if (!kit.empty) this.world.add(kit.mesh(mat));
    this.boats.add(boat.mesh(this.mats.wood));
    this.world.add(this.boats, this.glows(glow));
    const next = mooredShip(this.style, 'caravel', NEIGHBOUR, 'mid');
    next.ship.position.set(BERTH.nextX, 0, Q + next.beam / 2 + 0.14);
    this.world.add(next.ship);
    this.fleet.push({ ship: next.ship, x: BERTH.nextX, z: next.ship.position.z });
    if (d >= 0.8) {
      const roads = mooredShip(this.style, 'galleon', ROADS, 'far');
      roads.ship.position.set(17, 0, -22);
      roads.ship.rotation.y += 0.6;
      this.world.add(roads.ship);
      this.fleet.push({ ship: roads.ship, x: 17, z: -22 });
    }
    const fly = new Kit();
    fly.ball(0, 0, 0, 0.14, 0.04, 0.045, '#ece6da', 8).ball(0.13, 0.02, 0, 0.035, 0.032, 0.032, '#ece6da', 6).box(-0.15, 0, 0, 0.08, 0.012, 0.06, '#9ea4aa');
    for (const s of [1, -1]) fly.box(0, 0.005, s * 0.21, 0.12, 0.012, 0.36, '#d8d6d0').box(-0.03, 0.005, s * 0.53, 0.09, 0.01, 0.3, '#34302c');
    const flyMesh = fly.mesh(this.mats.bird), flyGeo = flyMesh.geometry;
    const n = d >= 1 ? 6 : d >= 0.8 ? 4 : 3;
    for (let i = 0; i < n; i++) {
      const flap = { value: 0 };
      const mesh = new THREE.Mesh(flyGeo, inkMaterial(this.style, { vertexShader: FLY_VERT, fragmentShader: SOLID_FRAG, inkWeight: 0.8, uniforms: { uKey: { value: this.sun }, uFlap: flap } }));
      mesh.scale.setScalar(1.6);
      this.scene.add(mesh);
      this.wild.push({ mesh, flap, c: V(-2 + r() * 8, 3.6 + r() * 3, -5 - r() * 8), r: 2.5 + r() * 4, w: (r() < 0.5 ? -1 : 1) * (0.18 + r() * 0.15), a: r() * 6.28 });
    }
  }

  private buildShip(form: FormName, pigments: readonly [RGB, RGB]): void {
    if (this.ship) { this.berth.remove(this.ship); free(this.ship, this.keep); }
    free(this.lines, this.keep);
    this.lines.clear();
    const { ship, len, beam } = mooredShip(this.style, form, pigments, 'hero');
    this.ship = ship;
    this.shipLen = len;
    this.shipBeam = beam;
    const Q = BERTH.quayZ, QY = BERTH.quayY, x0 = BERTH.shipX, z0 = Q + beam / 2 + 0.14, rail = FORMS[form].rail;
    this.berth.position.set(x0, 0, z0);
    this.berth.add(ship);
    const wood = new Kit(), rope = new Kit();
    for (const s of [1, -1]) {
      const onShip = V(x0 + s * len * 0.42, rail, z0 - beam * 0.32), bollard = V(Math.round((x0 + s * len * 0.66 + 14.5) / 1.45) * 1.45 - 14.5, QY + 0.14, Q - 0.2);
      rope.rope(onShip, bollard, 0.12, 0.014, '#b39a6a', 8);
      rope.rope(V(x0 + s * len * 0.12, rail, z0 - beam * 0.4), V(x0 - s * len * 0.25, QY + 0.1, Q - 0.25), 0.08, 0.012, '#a08a5e', 6);
      rope.cyl(x0 + s * len * 0.22, 0.2, Q + 0.07, 0.06, 0.06, 0.22, 8, '#5a4a3a', Math.PI / 2);
    }
    const dx = x0 + len * 0.5 + 0.45, dz = z0 + beam * 0.5 + 0.45;
    for (const [ox, oz] of [[0, 0], [0.13, 0.06], [0.04, -0.12]] as const) wood.cyl(dx + ox, 0.15, dz + oz, 0.07, 0.08, 1.3, 8, '#5d4632');
    for (const y of [0.45, 0.68]) rope.cyl(dx + 0.06, y, dz, 0.2, 0.2, 0.04, 10, '#b39a6a');
    rope.rope(V(dx, 0.7, dz), V(x0 + len * 0.45, rail, z0 + beam * 0.3), 0.1, 0.012, '#b39a6a', 6);
    this.lines.add(wood.mesh(this.mats.wood), rope.mesh(this.mats.rope));
    this.perch.set(dx + 0.05, 0.8, dz - 0.02);
    this.gull.position.copy(this.perch);
  }

  private buildGull(marks: GullMarks): void {
    free(this.gull, this.keep);
    this.gull.clear();
    const body = new Kit(), head = new Kit();
    body.ball(0, 0.13, 0, 0.2, 0.085, 0.085, '#ece6da', 10).box(-0.21, 0.15, 0, 0.13, 0.02, 0.075, '#9ea4aa').box(-0.27, 0.15, 0, 0.03, 0.022, 0.07, '#262220');
    for (const s of [1, -1]) body.rod(V(0.01, 0, s * 0.03), V(0.02, 0.08, s * 0.03), 0.008, '#d07a35', 4).box(0.03, 0.004, s * 0.03, 0.05, 0.008, 0.03, '#d07a35');
    head.ball(0, 0, 0, 0.056, 0.052, 0.05, '#f1ece2', 10);
    head.add(new THREE.CylinderGeometry(0, 0.016, 0.075, 6), M(0.085, -0.008, 0, 0, 0, -Math.PI / 2), '#e0b040');
    head.ball(0.095, -0.016, 0, 0.007, 0.007, 0.007, '#c03a2a', 4);
    for (const s of [1, -1]) head.ball(0.03, 0.016, s * 0.042, 0.008, 0.008, 0.006, '#1e1a18', 4);
    const h = head.mesh(this.mats.bird);
    h.position.set(0.17, 0.215, 0);
    this.gull.add(body.mesh(this.mats.bird), h);
    this.head = h;
    this.wings = [];
    const tip = marks.goldTips ? '#c9a24a' : '#262220';
    for (const s of [1, -1]) {
      const w = new Kit();
      w.ball(-0.04, 0, 0, 0.17, 0.028, 0.055, '#9ea4aa', 10).box(-0.22, 0, 0, 0.12, 0.012, 0.04, tip);
      (marks.marks ?? []).forEach((c, i) => w.box(0.06 - i * 0.045, 0.02, 0, 0.03, 0.008, 0.075, c));
      const m = w.mesh(this.mats.bird);
      m.position.set(-0.01, 0.16, s * 0.075);
      this.gull.add(m);
      this.wings.push(m);
    }
    this.gull.scale.setScalar(1.4);
    this.gull.position.copy(this.perch);
  }
}

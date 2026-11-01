// The beacons' dev page: all 16 by day, dusk or night, close up on a turntable or from 330 m away over the curve
// of a 554 m planet at 8 m eye height (the chase camera's view). The HDR, bloom and ACES grade are a copy of the
// rewrite's engine post, so glow levels tuned here carry over.
//
// URL parameters:
//   time=night|dusk|day   the light (default night); keys 1, 2, 3 switch it
//   view=grid|far          grid: all 16 close up; far: all 16 from 330 m (default grid)
//   region=<RegionId>      one beacon full screen with orbit controls (view=far puts the camera 330 m off)
//   t=<seconds>            freeze the clock (for screenshots); spin=0 stops the turntable
//   seed=<n>               the build seed (default 1)
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { BEACON_LOOKS, beaconLight } from './index.ts';
import type { BeaconLook } from './look.ts';
import type { RegionId } from '../../sim/world/index.ts';

const R = 554;
const q = new URLSearchParams(location.search);
const ORDER: RegionId[] = [
  'iceCrown', 'fjords', 'mistwood', 'spires', 'narrows', 'basaltStacks', 'kelpShallows', 'blossomRun',
  'glassSea', 'jadeShoals', 'coralAtolls', 'spiceIsles', 'fireArchipelago', 'weepingIsle', 'mangroveLabyrinth', 'maelstrom',
];
const NAMES: Record<RegionId, string> = {
  iceCrown: 'the Ice Crown', fjords: 'the Fjords', mistwood: 'Mistwood', spires: 'the Spires', narrows: 'the Narrows',
  basaltStacks: 'the Basalt Stacks', kelpShallows: 'the Kelp Shallows', blossomRun: 'Blossom Run', glassSea: 'the Glass Sea',
  jadeShoals: 'the Jade Shoals', coralAtolls: 'the Coral Atolls', spiceIsles: 'the Spice Isles', fireArchipelago: 'the Fire Archipelago',
  weepingIsle: 'the Weeping Isle', mangroveLabyrinth: 'the Mangrove Labyrinth', maelstrom: 'the Maelstrom',
};

// ---------------------------------------------------------------- the post: HDR target, bloom, ACES (from src/gfx/engine.ts)

const FS_VERT = /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const fs = (frag: string, uniforms: Record<string, THREE.IUniform>, additive = false) => new THREE.ShaderMaterial({
  vertexShader: FS_VERT, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false,
  ...(additive ? { blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, blendEquation: THREE.AddEquation } : { blending: THREE.NoBlending }),
});
const PREFILTER = /* glsl */ `uniform sampler2D tSrc; uniform vec2 uTexel; uniform float uThreshold; varying vec2 vUv;
void main() {
  vec3 c = (texture(tSrc, vUv + uTexel * vec2(-1.0, -1.0)).rgb + texture(tSrc, vUv + uTexel * vec2(1.0, -1.0)).rgb
          + texture(tSrc, vUv + uTexel * vec2(-1.0, 1.0)).rgb + texture(tSrc, vUv + uTexel * vec2(1.0, 1.0)).rgb) * 0.25;
  if (any(isnan(c)) || any(isinf(c))) c = vec3(0.0);
  float br = max(c.r, max(c.g, c.b));
  float soft = clamp(br - uThreshold + 0.5, 0.0, 1.0); soft = soft * soft * 0.5;
  gl_FragColor = vec4(min(c * max(soft, br - uThreshold) / max(br, 1e-4), vec3(40.0)), 1.0);
}`;
const DOWN = /* glsl */ `uniform sampler2D tSrc; uniform vec2 uTexel; varying vec2 vUv;
void main() {
  vec2 t = uTexel;
  vec3 a = texture(tSrc, vUv + t * vec2(-2, -2)).rgb, b = texture(tSrc, vUv + t * vec2(0, -2)).rgb, c = texture(tSrc, vUv + t * vec2(2, -2)).rgb;
  vec3 d = texture(tSrc, vUv + t * vec2(-2, 0)).rgb, e = texture(tSrc, vUv).rgb, f = texture(tSrc, vUv + t * vec2(2, 0)).rgb;
  vec3 g = texture(tSrc, vUv + t * vec2(-2, 2)).rgb, h = texture(tSrc, vUv + t * vec2(0, 2)).rgb, i = texture(tSrc, vUv + t * vec2(2, 2)).rgb;
  vec3 j = texture(tSrc, vUv + t * vec2(-1, -1)).rgb, k = texture(tSrc, vUv + t * vec2(1, -1)).rgb;
  vec3 l = texture(tSrc, vUv + t * vec2(-1, 1)).rgb, m = texture(tSrc, vUv + t * vec2(1, 1)).rgb;
  gl_FragColor = vec4(e * 0.125 + (a + c + g + i) * 0.03125 + (b + d + f + h) * 0.0625 + (j + k + l + m) * 0.125, 1.0);
}`;
const UP = /* glsl */ `uniform sampler2D tSrc; uniform vec2 uTexel; uniform float uScatter; varying vec2 vUv;
void main() {
  vec2 t = uTexel;
  vec3 s = texture(tSrc, vUv + t * vec2(-1, -1)).rgb + texture(tSrc, vUv + t * vec2(1, -1)).rgb
         + texture(tSrc, vUv + t * vec2(-1, 1)).rgb + texture(tSrc, vUv + t * vec2(1, 1)).rgb;
  s += (texture(tSrc, vUv + t * vec2(0, -1)).rgb + texture(tSrc, vUv + t * vec2(0, 1)).rgb
      + texture(tSrc, vUv + t * vec2(-1, 0)).rgb + texture(tSrc, vUv + t * vec2(1, 0)).rgb) * 2.0;
  s += texture(tSrc, vUv).rgb * 4.0;
  gl_FragColor = vec4(s / 16.0 * uScatter, 1.0);
}`;
const COMPOSITE = /* glsl */ `uniform sampler2D tScene, tBloom; uniform float uExposure, uBloom, uSat, uContrast, uVignette; varying vec2 vUv;
vec3 RRTAndODTFit(vec3 v) { vec3 a = v * (v + 0.0245786) - 0.000090537; vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081; return a / b; }
vec3 aces(vec3 c) {
  const mat3 I = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
  const mat3 O = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
  return clamp(O * RRTAndODTFit(I * (c / 0.6)), 0.0, 1.0);
}
vec3 srgb(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
void main() {
  vec2 q = vUv - 0.5;
  vec3 c = (texture(tScene, vUv).rgb + texture(tBloom, vUv).rgb * uBloom) * uExposure;
  c = aces(c);
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(l), c, uSat);
  c = clamp((c - 0.5) * uContrast + 0.5, 0.0, 1.0);
  c *= 1.0 - dot(q * vec2(1.25, 1.0), q * vec2(1.25, 1.0)) * uVignette;
  gl_FragColor = vec4(srgb(clamp(c, 0.0, 1.0)), 1.0);
}`;

class Post {
  private target!: THREE.WebGLRenderTarget;
  private mips: THREE.WebGLRenderTarget[] = [];
  private w = 0;
  private h = 0;
  private readonly quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
  private readonly cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly fsScene = new THREE.Scene();
  private readonly pre = fs(PREFILTER, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uThreshold: { value: 1.1 } });
  private readonly down = fs(DOWN, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() } });
  private readonly up = fs(UP, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uScatter: { value: 0.85 } }, true);
  readonly comp = fs(COMPOSITE, {
    tScene: { value: null }, tBloom: { value: null }, uExposure: { value: 1 }, uBloom: { value: 0.6 }, uSat: { value: 1 },
    uContrast: { value: 1.05 }, uVignette: { value: 0.45 },
  });

  private readonly r: THREE.WebGLRenderer;

  constructor(r: THREE.WebGLRenderer) {
    this.r = r;
    this.quad.frustumCulled = false;
    this.fsScene.add(this.quad);
  }

  private size(w: number, h: number): void {
    if (w === this.w && h === this.h) return;
    this.w = w; this.h = h;
    this.target?.dispose();
    this.target = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: 4, depthBuffer: true });
    for (const m of this.mips) m.dispose();
    this.mips = [];
    let mw = w >> 1, mh = h >> 1;
    for (let i = 0; i < 6 && mw > 4 && mh > 4; i++, mw >>= 1, mh >>= 1) this.mips.push(new THREE.WebGLRenderTarget(mw, mh, { type: THREE.HalfFloatType, depthBuffer: false }));
  }

  private pass(m: THREE.ShaderMaterial, t: THREE.WebGLRenderTarget | null, clear = true): void {
    this.quad.material = m;
    this.r.setRenderTarget(t);
    if (clear) this.r.clear(true, false, false);
    this.r.render(this.fsScene, this.cam);
  }

  /** Renders the scene through bloom and the grade into the canvas rectangle (x, y, w, h) in drawing-buffer pixels. */
  render(scene: THREE.Scene, camera: THREE.Camera, g: Grade, x: number, y: number, w: number, h: number): void {
    const r = this.r;
    this.size(w, h);
    r.setScissorTest(false);
    r.setRenderTarget(this.target);
    r.setClearColor(0x000000, 1);
    r.clear(true, true, false);
    r.render(scene, camera);
    const m = this.mips;
    this.pre.uniforms.tSrc.value = this.target.texture;
    this.pre.uniforms.uTexel.value.set(1 / w, 1 / h);
    this.pre.uniforms.uThreshold.value = g.threshold;
    this.pass(this.pre, m[0]);
    for (let i = 1; i < m.length; i++) {
      this.down.uniforms.tSrc.value = m[i - 1].texture;
      this.down.uniforms.uTexel.value.set(1 / m[i - 1].width, 1 / m[i - 1].height);
      this.pass(this.down, m[i]);
    }
    for (let i = m.length - 2; i >= 0; i--) {
      this.up.uniforms.tSrc.value = m[i + 1].texture;
      this.up.uniforms.uTexel.value.set(1 / m[i + 1].width, 1 / m[i + 1].height);
      this.pass(this.up, m[i], false);
    }
    const u = this.comp.uniforms;
    u.tScene.value = this.target.texture;
    u.tBloom.value = m[0].texture;
    u.uExposure.value = g.exposure;
    u.uBloom.value = g.bloom;
    u.uSat.value = g.sat;
    this.quad.material = this.comp;
    r.setRenderTarget(null);
    r.setViewport(x, y, w, h);
    r.setScissor(x, y, w, h);
    r.setScissorTest(true);
    r.render(this.fsScene, this.cam);
    r.setScissorTest(false);
  }
}

// ---------------------------------------------------------------- the light: day, dusk and night, after the rewrite's moods

interface Grade { exposure: number; bloom: number; threshold: number; sat: number }
interface Mood {
  night: number; grade: Grade; sunElev: number; sunAz: number; sun: number; sunI: number;
  hemiSky: number; hemiGround: number; hemiI: number; zenith: number; horizon: number; sea: number; stars: number; fog: number;
}
const MOODS: Record<string, Mood> = {
  day: {
    night: 0, grade: { exposure: 0.95, bloom: 0.35, threshold: 1.1, sat: 1.06 }, sunElev: 38, sunAz: 140, sun: 0xfff0d8, sunI: 3.3,
    hemiSky: 0xbcd6ef, hemiGround: 0x46525a, hemiI: 1.1, zenith: 0x3f7fcf, horizon: 0xc6d9e8, sea: 0x1d5470, stars: 0, fog: 0xbcd0e0,
  },
  dusk: {
    night: 0.55, grade: { exposure: 1.0, bloom: 0.6, threshold: 1.1, sat: 1.05 }, sunElev: 3, sunAz: 255, sun: 0xffa45e, sunI: 2.4,
    hemiSky: 0x7c78a8, hemiGround: 0x2a2630, hemiI: 0.6, zenith: 0x1f2c58, horizon: 0xeea070, sea: 0x14304a, stars: 0.2, fog: 0x8a7890,
  },
  night: {
    night: 1, grade: { exposure: 1.35, bloom: 0.95, threshold: 1.1, sat: 1.0 }, sunElev: 32, sunAz: 210, sun: 0x9db3ff, sunI: 0.55,
    hemiSky: 0x2a3a66, hemiGround: 0x0a0e16, hemiI: 0.35, zenith: 0x02050c, horizon: 0x0d1830, sea: 0x06121e, stars: 1, fog: 0x0c1428,
  },
};

const SKY_VERT = /* glsl */ `varying vec3 vDir; void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const SKY_FRAG = /* glsl */ `uniform vec3 uZenith, uHorizon, uSunDir, uSun; uniform float uStars, uNight; varying vec3 vDir;
float h(vec3 p) { p = fract(p * vec3(0.1031, 0.1030, 0.0973)); p += dot(p, p.yxz + 33.33); return fract((p.x + p.y) * p.z); }
void main() {
  vec3 d = normalize(vDir);
  float up = max(d.y, 0.0);
  vec3 c = mix(uHorizon, uZenith, pow(up, 0.45));
  if (d.y < 0.0) c = uHorizon * 0.6;
  float s = max(dot(d, uSunDir), 0.0);
  c += uSun * (pow(s, mix(1200.0, 4000.0, uNight)) * mix(30.0, 1.5, uNight) + pow(s, 12.0) * 0.25 * (1.0 - uNight * 0.8));
  vec3 cell = floor(d * 380.0);
  float st = step(0.9965, h(cell)) * h(cell + 7.0);
  c += vec3(0.85, 0.9, 1.0) * st * uStars * 1.4 * smoothstep(0.0, 0.15, d.y);
  gl_FragColor = vec4(c, 1.0);
}`;

// ---------------------------------------------------------------- the scene

const canvas = document.querySelector('canvas')!;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.autoClear = false;
renderer.toneMapping = THREE.NoToneMapping;
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
const post = new Post(renderer);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x0c1428, 0.0011);
const sun = new THREE.DirectionalLight(0xffffff, 3);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -90, right: 90, top: 120, bottom: -40, near: 1, far: 600 });
sun.shadow.bias = -0.0005;
const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
const glowLight = new THREE.PointLight(0xffffff, 0, 160, 1.6);
scene.add(sun, sun.target, hemi, glowLight);

const skyU = {
  uZenith: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() }, uSunDir: { value: new THREE.Vector3() },
  uSun: { value: new THREE.Color() }, uStars: { value: 0 }, uNight: { value: 0 },
};
const sky = new THREE.Mesh(new THREE.SphereGeometry(4000, 48, 24),
  new THREE.ShaderMaterial({ vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, uniforms: skyU, side: THREE.BackSide, depthWrite: false, fog: false }));
sky.renderOrder = -10;
scene.add(sky);

// the sea: a sphere of the planet's radius, its top at the origin where every beacon stands
const seaMat = new THREE.MeshStandardMaterial({ color: 0x0a2233, roughness: 0.42, metalness: 0.0 });
const sea = new THREE.Mesh(new THREE.SphereGeometry(R, 256, 128), seaMat);
sea.position.set(0, -R, 0);
sea.receiveShadow = true;
scene.add(sea);

const seed = Number(q.get('seed') ?? 1);
const looks = ORDER.filter((id) => BEACON_LOOKS[id]).map((id) => ({ id, look: BEACON_LOOKS[id] as BeaconLook }));
const built = looks.map(({ id, look }) => {
  const obj = look.build(seed);
  obj.visible = false;
  scene.add(obj);
  return { id, look, obj };
});

let mood = MOODS[q.get('time') ?? 'night'] ?? MOODS.night;
function setMood(m: Mood): void {
  mood = m;
  const el = THREE.MathUtils.degToRad(m.sunElev), az = THREE.MathUtils.degToRad(m.sunAz);
  const dir = new THREE.Vector3(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az));
  sun.position.copy(dir).multiplyScalar(300);
  sun.color.setHex(m.sun);
  sun.intensity = m.sunI;
  hemi.color.setHex(m.hemiSky);
  hemi.groundColor.setHex(m.hemiGround);
  hemi.intensity = m.hemiI;
  skyU.uZenith.value.setHex(m.zenith);
  skyU.uHorizon.value.setHex(m.horizon);
  skyU.uSunDir.value.copy(dir);
  skyU.uSun.value.setHex(m.sun);
  skyU.uStars.value = m.stars;
  skyU.uNight.value = m.night;
  seaMat.color.setHex(m.sea);
  (scene.fog as THREE.FogExp2).color.setHex(m.fog);
}
setMood(mood);

// ---------------------------------------------------------------- cameras and layout

const region = q.get('region') as RegionId | null;
const single = region ? built.find((b) => b.id === region) : undefined;
const view = q.get('view') === 'far' ? 'far' : 'grid';
const frozen = q.has('t') ? Number(q.get('t')) : null;
const spin = q.get('spin') !== '0';
const camera = new THREE.PerspectiveCamera(45, 1, 0.5, 6000);
const labels = document.getElementById('labels')!;

/** A camera `dist` metres of arc from the beacon, `eye` metres above the sea, at bearing `phi`, looking at height `look`. */
function aim(cam: THREE.PerspectiveCamera, dist: number, eye: number, phi: number, look: number): void {
  const th = dist / R;
  const n = new THREE.Vector3(Math.sin(th) * Math.sin(phi), Math.cos(th), Math.sin(th) * Math.cos(phi));
  cam.position.copy(n).multiplyScalar(R + eye).add(new THREE.Vector3(0, -R, 0));
  cam.up.copy(n);
  cam.lookAt(0, look, 0);
}

function closeFrame(b: { look: BeaconLook }): { dist: number; eye: number; look: number } {
  const h = Math.min(b.look.height, 70);
  return { dist: h * 1.55 + 24, eye: 9, look: h * 0.42 };
}

let controls: OrbitControls | null = null;
if (single) {
  const f = closeFrame(single);
  if (view === 'far') aim(camera, 330, 8, 0, single.look.height * 0.55);
  else aim(camera, f.dist, f.eye, 0.4, f.look);
  if (view !== 'far') {
    controls = new OrbitControls(camera, canvas);
    controls.target.set(0, f.look, 0);
    controls.enableDamping = true;
    controls.update();
  }
}

function makeLabels(): void {
  labels.innerHTML = '';
  const cells = single ? [single] : built;
  for (const b of cells) {
    const d = document.createElement('div');
    d.className = 'label';
    d.innerHTML = `<b>${NAMES[b.id]}</b> · ${b.look.name}${single ? `<br><span>${b.look.what}</span>` : ''}`;
    labels.appendChild(d);
  }
}
makeLabels();

function resize(): void {
  renderer.setSize(innerWidth, innerHeight, false);
  const cols = single ? 1 : 4, rows = single ? 1 : 4;
  const els = labels.children;
  for (let i = 0; i < els.length; i++) {
    const e = els[i] as HTMLElement;
    e.style.left = `${((i % cols) / cols) * 100}%`;
    e.style.top = `${(Math.floor(i / cols) / rows) * 100}%`;
    e.style.width = `${100 / cols}%`;
  }
}
addEventListener('resize', resize);
resize();

addEventListener('keydown', (e) => {
  if (e.key === '1') setMood(MOODS.day);
  if (e.key === '2') setMood(MOODS.dusk);
  if (e.key === '3') setMood(MOODS.night);
});
for (const b of document.querySelectorAll<HTMLButtonElement>('button[data-time]')) b.onclick = () => setMood(MOODS[b.dataset.time!]);

// ---------------------------------------------------------------- the loop

const hook = { ready: false, frames: 0 };
(window as unknown as { __beacons: typeof hook }).__beacons = hook;
const start = performance.now();

function frame(): void {
  const t = frozen ?? (performance.now() - start) / 1000;
  controls?.update();
  const W = renderer.domElement.width, H = renderer.domElement.height;
  renderer.setScissorTest(false);
  renderer.setRenderTarget(null);
  renderer.setViewport(0, 0, W, H);
  renderer.setClearColor(0x000000, 1);
  renderer.clear();
  const cells = single ? [single] : built;
  const cols = single ? 1 : 4, rows = single ? 1 : 4;
  const cw = Math.floor(W / cols), ch = Math.floor(H / rows);
  for (const b of built) b.look.update(b.obj, t, mood.night);
  cells.forEach((b, i) => {
    for (const o of built) o.obj.visible = o === b;
    const cx = (i % cols) * cw, cy = H - (Math.floor(i / cols) + 1) * ch;
    camera.aspect = cw / ch;
    if (!single || view === 'far') {
      const turn = spin && frozen === null ? t * 0.12 : 0.5;
      if (view === 'far') { camera.fov = 50; aim(camera, 330, 8, turn * 0.3, b.look.height * 0.55); }
      else { camera.fov = 45; const f = closeFrame(b); aim(camera, f.dist, f.eye, turn + i * 0.4, f.look); }
    }
    camera.updateProjectionMatrix();
    // the beacon lights its surroundings through one point light that follows its pulse
    glowLight.color.setHex(b.look.color);
    glowLight.position.set(0, b.look.lightHeight, 0);
    glowLight.intensity = beaconLight(b.obj) * 600;
    sun.target.position.set(0, 0, 0);
    post.render(scene, camera, mood.grade, cx, cy, cw, ch);
  });
  hook.frames++;
  if (hook.frames > 3) hook.ready = true;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

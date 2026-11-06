// The beacons' dev page: all 16 by day, dusk or night, close up on a turntable or from 330 m away over the curve
// of a 554 m planet at 8 m eye height (the chase camera's view). On WebGPU like the planet: the cells are drawn into
// one HDR target, then bloomed and graded (ACES) as one picture. The lamps shine at their daylight scale under every
// light here, since nothing on this page adapts to the dark as the planet's exposure does.
//
// URL parameters:
//   time=night|dusk|day   the light (default night); keys 1, 2, 3 switch it
//   view=grid|far          grid: all 16 close up; far: all 16 from 330 m (default grid)
//   region=<RegionId>      one beacon full screen with orbit controls (view=far puts the camera 330 m off)
//   t=<seconds>            freeze the clock (for screenshots); spin=0 stops the turntable
//   seed=<n>               the build seed (default 1)
import * as THREE from 'three/webgpu';
import { Fn, dot, floor, fract, luminance, max, mix, normalize, positionLocal, pow, select, smoothstep, step, texture, uniform, vec3, vec4 } from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import type { Node } from 'three/webgpu';
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

// ---------------------------------------------------------------- the post: one HDR target for every cell, bloom, ACES

class Post {
  readonly target = new THREE.RenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
  readonly pipeline: THREE.RenderPipeline;
  private readonly gain = uniform(0.6);
  private readonly sat = uniform(1);
  private readonly glow: ReturnType<typeof bloom>;
  private readonly r: THREE.WebGPURenderer;

  constructor(r: THREE.WebGPURenderer) {
    this.r = r;
    const scene = texture(this.target.texture) as unknown as Node<'vec4'>;
    this.glow = bloom(scene, 1, 0.85, 1.1);
    const c = scene.rgb.add((this.glow as unknown as Node<'vec4'>).rgb.mul(this.gain));
    this.pipeline = new THREE.RenderPipeline(r);
    // the grade's saturation, before the renderer's own exposure and ACES curve
    this.pipeline.outputNode = vec4(mix(vec3(luminance(c)), c, this.sat), 1);
  }

  /** Readies the target for a frame of `w` × `h` drawing-buffer pixels, cleared. */
  begin(w: number, h: number): void {
    if (this.target.width !== w || this.target.height !== h) this.target.setSize(w, h);
    this.target.scissorTest = false;
    this.target.viewport.set(0, 0, w, h);
    this.r.setRenderTarget(this.target);
    this.r.setClearColor(0x000000, 1);
    this.r.clear();
  }

  /** Draws one cell, (x, y, w, h) from the top left. */
  cell(scene: THREE.Scene, camera: THREE.Camera, x: number, y: number, w: number, h: number): void {
    this.target.viewport.set(x, y, w, h);
    this.target.scissor.set(x, y, w, h);
    this.target.scissorTest = true;
    this.r.render(scene, camera);
  }

  /** Blooms and grades the whole grid onto the canvas. */
  end(g: Grade): void {
    this.r.setRenderTarget(null);
    this.r.toneMappingExposure = g.exposure;
    this.gain.value = g.bloom;
    this.sat.value = g.sat;
    (this.glow as unknown as { threshold: { value: number } }).threshold.value = g.threshold;
    this.pipeline.render();
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

const skyU = {
  uZenith: uniform(new THREE.Color()), uHorizon: uniform(new THREE.Color()), uSunDir: uniform(new THREE.Vector3()),
  uSun: uniform(new THREE.Color()), uStars: uniform(0), uNight: uniform(0),
};
const hash = (p: Node<'vec3'>): Node<'float'> => {
  const a = fract(p.mul(vec3(0.1031, 0.103, 0.0973))).toVar();
  a.addAssign(dot(a, a.yxz.add(33.33)));
  return fract(a.x.add(a.y).mul(a.z));
};
/** A gradient from the horizon to the zenith, the sun's disc and glow, and stars by night. */
const skyColour = Fn(() => {
  const d = normalize(positionLocal), up = max(d.y, 0);
  let c = select(d.y.lessThan(0), skyU.uHorizon.mul(0.6), mix(skyU.uHorizon, skyU.uZenith, pow(up, 0.45)));
  const s = max(dot(d, skyU.uSunDir), 0), n = skyU.uNight;
  c = c.add(skyU.uSun.mul(pow(s, mix(1200, 4000, n)).mul(mix(30, 1.5, n)).add(pow(s, 12).mul(0.25).mul(n.mul(-0.8).add(1)))));
  const cell = floor(d.mul(380));
  const star = step(0.9965, hash(cell)).mul(hash(cell.add(7)));
  return c.add(vec3(0.85, 0.9, 1).mul(star).mul(skyU.uStars).mul(1.4).mul(smoothstep(0, 0.15, d.y)));
});

// ---------------------------------------------------------------- the scene

const canvas = document.querySelector('canvas')!;
const renderer = new THREE.WebGPURenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
await renderer.init();
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.autoClear = false;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
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

const skyMat = new THREE.MeshBasicNodeMaterial({ side: THREE.BackSide, depthWrite: false, fog: false });
skyMat.colorNode = skyColour();
const sky = new THREE.Mesh(new THREE.SphereGeometry(4000, 48, 24), skyMat);
sky.renderOrder = -10;
scene.add(sky);

// the sea: a sphere of the planet's radius, its top at the origin where every beacon stands
const seaMat = new THREE.MeshStandardMaterial({ color: 0x0a2233, roughness: 0.42, metalness: 0.0 });
const sea = new THREE.Mesh(new THREE.SphereGeometry(R, 256, 128), seaMat);
sea.position.set(0, -R, 0);
sea.receiveShadow = true;
scene.add(sea);

const seed = Number(q.get('seed') ?? 1);
const looks = ORDER.map((id) => ({ id, look: BEACON_LOOKS[id] }));
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
  (skyU.uZenith.value as THREE.Color).setHex(m.zenith);
  (skyU.uHorizon.value as THREE.Color).setHex(m.horizon);
  (skyU.uSunDir.value as THREE.Vector3).copy(dir);
  (skyU.uSun.value as THREE.Color).setHex(m.sun);
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
  post.begin(W, H);
  const cells = single ? [single] : built;
  const cols = single ? 1 : 4, rows = single ? 1 : 4;
  const cw = Math.floor(W / cols), ch = Math.floor(H / rows);
  for (const b of built) b.look.update(b.obj, t, mood.night);
  cells.forEach((b, i) => {
    for (const o of built) o.obj.visible = o === b;
    const cx = (i % cols) * cw, cy = Math.floor(i / cols) * ch; // from the top left, as WebGPU counts
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
    post.cell(scene, camera, cx, cy, cw, ch);
  });
  post.end(mood.grade);
  hook.frames++;
  if (hook.frames > 3) hook.ready = true;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

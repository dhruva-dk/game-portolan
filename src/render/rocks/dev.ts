// The rock library's dev page (dev/rocks.html): every form in a grid, one form on a turntable at 10, 50 or 300 m,
// or a field of hundreds of instanced copies; day, dusk or night light; any level of detail; a sea-level slider.
//
// URL parameters: view=grid|one|field  form=<id>  seed=<n>  size=<m>  lod=0|1|2|auto  dist=10|50|300
//                 light=day|dusk|night  spin=0|1  sea=<m>  wire=1  region=<RegionId> (grid of one region's forms)
import * as THREE from 'three/webgpu';
import { pass } from 'three/tsl';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { SkyMesh } from 'three/addons/objects/SkyMesh.js';
import type { RegionId } from '../../sim/world/index.ts';
import { ROCKS, ROCK_UNIFORMS, buildLOD, instanceRocks, rockById, setRockTextureBase, skinFor, type RockForm, type Scatter } from './index.ts';
import type { Lod } from './mesh.ts';
import { rng } from './noise.ts';

setRockTextureBase('/tex/rocks/');

const q = new URLSearchParams(location.search);
const state = {
  view: q.get('view') ?? 'grid',
  form: q.get('form') ?? ROCKS[0].id,
  seed: Number(q.get('seed') ?? 1),
  size: q.has('size') ? Number(q.get('size')) : null as number | null,
  lod: (q.get('lod') ?? 'auto') as 'auto' | '0' | '1' | '2',
  dist: Number(q.get('dist') ?? 0),
  light: q.get('light') ?? 'day',
  spin: q.get('spin') !== '0',
  sea: Number(q.get('sea') ?? 0),
  wire: q.get('wire') === '1',
  region: q.get('region') as RegionId | null,
};

// ---------------------------------------------------------------- renderer, sky, light

const renderer = new THREE.WebGPURenderer({ antialias: true });
await renderer.init();
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
renderer.info.autoReset = false;
renderer.shadowMap.type = THREE.PCFShadowMap;
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 6000);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.autoRotateSpeed = 0.6;

const sky = new SkyMesh();
sky.scale.setScalar(5000);
const skyScene = new THREE.Scene();
skyScene.add(sky);
const sun = new THREE.DirectionalLight(0xffffff, 3);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.03;
scene.add(sun, sun.target);
const hemi = new THREE.HemisphereLight(0xbcd4ff, 0x3a3428, 0.4);
scene.add(hemi);
const pmrem = new THREE.PMREMGenerator(renderer);
let envRT: THREE.RenderTarget | null = null;

const LIGHTS: Record<string, { elev: number; az: number; sun: number; colour: number; hemi: number; turbidity: number; exposure: number; fog: number; daylight: number }> = {
  day: { elev: 38, az: 140, sun: 3.0, colour: 0xfff4e6, hemi: 0.5, turbidity: 4, exposure: 0.95, fog: 0xa9bccf, daylight: 1 },
  dusk: { elev: 4, az: 250, sun: 2.6, colour: 0xff9a52, hemi: 0.3, turbidity: 8, exposure: 1.1, fog: 0x8a6a62, daylight: 0.4 },
  night: { elev: -12, az: 300, sun: 0.45, colour: 0x8fa8ff, hemi: 0.15, turbidity: 2, exposure: 1.6, fog: 0x0d1420, daylight: 0 },
};

function applyLight(): void {
  const L = LIGHTS[state.light] ?? LIGHTS.day;
  const phi = THREE.MathUtils.degToRad(90 - L.elev), th = THREE.MathUtils.degToRad(L.az);
  const dir = new THREE.Vector3().setFromSphericalCoords(1, phi, th);
  (sky.sunPosition.value as THREE.Vector3).copy(dir);
  sky.turbidity.value = L.turbidity;
  sky.rayleigh.value = state.light === 'dusk' ? 2.5 : 1.2;
  sky.mieCoefficient.value = 0.005;
  sky.mieDirectionalG.value = 0.85;
  // at night the light is the moon: put it above the horizon opposite the sun
  const lightDir = state.light === 'night' ? new THREE.Vector3(-dir.x, 0.55, -dir.z).normalize() : dir;
  sun.position.copy(lightDir).multiplyScalar(400);
  sun.color.set(L.colour);
  sun.intensity = L.sun;
  hemi.intensity = L.hemi;
  renderer.toneMappingExposure = L.exposure;
  scene.fog = new THREE.FogExp2(L.fog, state.light === 'night' ? 0.0009 : 0.00035);
  if (envRT) envRT.dispose();
  envRT = pmrem.fromScene(skyScene as unknown as THREE.Scene, 0, 1, 6000);
  scene.environment = envRT.texture;
  scene.environmentIntensity = state.light === 'night' ? 0.15 : 1;
  scene.background = state.light === 'night' ? new THREE.Color(0x05080e) : null;
  ROCK_UNIFORMS.uDaylight.value = L.daylight;
}
scene.add(sky);

// ---------------------------------------------------------------- the sea and the bed

const water = new THREE.Mesh(
  new THREE.PlaneGeometry(8000, 8000).rotateX(-Math.PI / 2),
  new THREE.MeshStandardMaterial({ color: 0x1a5260, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.72 }),
);
water.receiveShadow = true;
water.renderOrder = 2;
const bed = new THREE.Mesh(new THREE.PlaneGeometry(8000, 8000).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x8a7a5c, roughness: 1 }));
bed.receiveShadow = true;
scene.add(water, bed);
function applySea(): void {
  water.position.y = state.sea;
  bed.position.y = state.sea - 5;
  ROCK_UNIFORMS.uSea.value.set(0, state.sea, 0, 0);
}

// ---------------------------------------------------------------- content

const content = new THREE.Group();
scene.add(content);
interface Label { el: HTMLDivElement; at: THREE.Vector3 }
const labels: Label[] = [];
const spinners: THREE.Object3D[] = [];

function label(html: string, at: THREE.Vector3): void {
  const el = document.createElement('div');
  el.className = 'label';
  el.innerHTML = html;
  document.body.append(el);
  labels.push({ el, at });
}

const typical = (r: RockForm) => state.size ?? r.sizes[0] + (r.sizes[1] - r.sizes[0]) * 0.3;
const lodOf = (): Lod | null => (state.lod === 'auto' ? null : (Number(state.lod) as Lod));

function make(r: RockForm, seed: number, size: number, region?: RegionId): THREE.Object3D {
  const opts = region ? { skin: skinFor(r, region) } : {};
  const lod = lodOf();
  const o = lod === null ? buildLOD(r, seed, size, opts) : r.build(seed, size, lod, opts);
  if (r.placement.afloat) o.position.y = 0;
  return o;
}

function footprint(o: THREE.Object3D): THREE.Box3 {
  return new THREE.Box3().setFromObject(o, true);
}

function clear(): void {
  for (const c of [...content.children]) {
    content.remove(c);
    c.traverse((m) => (m as THREE.Mesh).geometry?.dispose());
  }
  for (const l of labels) l.el.remove();
  labels.length = 0;
  spinners.length = 0;
}

function buildGrid(): void {
  const forms = state.region ? ROCKS.filter((r) => r.regions.includes(state.region!)) : ROCKS;
  let z = 0, maxX = 0;
  const rows: { x: number; objs: THREE.Object3D[]; r: RockForm; depth: number; h: number }[] = [];
  for (const r of forms) {
    const size = typical(r), objs: THREE.Object3D[] = [];
    let x = 0, depth = 0, h = 0;
    for (let k = 0; k < 3; k++) {
      const o = make(r, state.seed + k * 101, size, state.region ?? undefined);
      const b = footprint(o), w = b.max.x - b.min.x;
      o.position.x = x - b.min.x;
      x += w + Math.max(2, size * 0.25);
      depth = Math.max(depth, b.max.z - b.min.z);
      h = Math.max(h, b.max.y);
      objs.push(o);
    }
    rows.push({ x, objs, r, depth, h });
    maxX = Math.max(maxX, x);
  }
  for (const row of rows) {
    const off = -row.x / 2;
    z += row.depth / 2;
    for (const o of row.objs) {
      o.position.x += off;
      o.position.z = z;
      content.add(o);
      spinners.push(o);
    }
    label(`<b>${row.r.name}</b>${row.r.regions.length > 3 ? 'generic' : row.r.regions.join(', ')}`, new THREE.Vector3(off - 1, row.h + 1, z));
    z += row.depth / 2 + 4;
  }
  content.position.z = -z / 2;
  const span = Math.max(maxX, z);
  controls.target.set(0, 3, 0);
  camera.position.set(0, span * 0.55, span * 0.85);
}

function buildOne(): void {
  const r = rockById(state.form) ?? ROCKS[0];
  const size = typical(r);
  const o = make(r, state.seed, size, state.region ?? undefined);
  content.add(o);
  spinners.push(o);
  const b = footprint(o), h = Math.max(1, b.max.y), dist = state.dist || Math.max(8, size * 2.2);
  controls.target.set(0, Math.min(h * 0.45, dist * 0.25), 0);
  camera.position.set(dist * 0.8, Math.min(dist * 0.35, h * 0.4 + dist * 0.2) + 1.6, dist * 0.6);
  label(`<b>${r.name}</b>${r.sizeOf} ${size.toFixed(1)} m · seed ${state.seed}`, new THREE.Vector3(0, h + Math.max(0.5, h * 0.08), 0));
}

function buildField(): void {
  const r = rockById(state.form) ?? ROCKS[0];
  const rand = rng(state.seed * 7 + 3), items: Scatter[] = [];
  const mid = typical(r), extent = Math.max(60, mid * 14);
  const n = Math.min(400, Math.max(30, Math.floor((extent * extent) / (mid * mid * 6))));
  for (let i = 0; i < n; i++) {
    const size = r.sizes[0] + (r.sizes[1] - r.sizes[0]) * Math.pow(rand(), 2) * 0.7;
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3((rand() - 0.5) * extent, 0, (rand() - 0.5) * extent),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rand() * Math.PI * 2, 0)),
      new THREE.Vector3(1, 1, 1),
    );
    items.push({ seed: Math.floor(rand() * 1e6), size, matrix: m });
  }
  const lod = lodOf() ?? 1;
  const opts = state.region ? { skin: skinFor(r, state.region) } : {};
  content.add(instanceRocks(r, items, lod, { ...opts, variants: 6 }));
  controls.target.set(0, 2, 0);
  camera.position.set(extent * 0.45, extent * 0.22, extent * 0.55);
  label(`<b>${r.name}</b>${n} instanced copies · LOD ${lod}`, new THREE.Vector3(0, mid + 2, 0));
}

function rebuild(): void {
  clear();
  content.position.set(0, 0, 0);
  if (state.view === 'one') buildOne();
  else if (state.view === 'field') buildField();
  else buildGrid();
  if (state.wire) content.traverse((m) => {
    const mesh = m as THREE.Mesh;
    if (mesh.isMesh) mesh.material = new THREE.MeshBasicMaterial({ wireframe: true, color: 0xffffff });
  });
  controls.autoRotate = state.spin && state.view !== 'grid';
  controls.update();
  const s = Math.max(60, camera.position.distanceTo(controls.target) * 1.2);
  const c = sun.shadow.camera;
  c.left = c.bottom = -s;
  c.right = c.top = s;
  c.near = 1;
  c.far = 1200;
  c.updateProjectionMatrix();
  sun.target.position.copy(controls.target);
  sun.position.add(controls.target);
  syncUrl();
}

// ---------------------------------------------------------------- panel

function buttons(id: string, list: string[], get: () => string, set: (v: string) => void): void {
  const box = document.getElementById(id)!;
  box.innerHTML = '';
  for (const v of list) {
    const b = document.createElement('button');
    b.textContent = v;
    b.className = get() === v ? 'on' : '';
    b.onclick = () => {
      set(v);
      for (const c of box.children) c.className = c.textContent === get() ? 'on' : '';
    };
    box.append(b);
  }
}

function syncUrl(): void {
  const p = new URLSearchParams();
  p.set('view', state.view);
  p.set('form', state.form);
  p.set('seed', String(state.seed));
  p.set('lod', state.lod);
  p.set('light', state.light);
  if (state.dist) p.set('dist', String(state.dist));
  if (state.size) p.set('size', String(state.size));
  if (state.region) p.set('region', state.region);
  if (state.sea) p.set('sea', String(state.sea));
  if (!state.spin) p.set('spin', '0');
  history.replaceState(null, '', `?${p}`);
}

buttons('views', ['grid', 'one', 'field'], () => state.view, (v) => { state.view = v; rebuild(); });
buttons('lights', ['day', 'dusk', 'night'], () => state.light, (v) => { state.light = v; applyLight(); syncUrl(); });
buttons('lods', ['auto', '0', '1', '2'], () => state.lod, (v) => { state.lod = v as typeof state.lod; rebuild(); });
buttons('dists', ['10', '50', '300'], () => String(state.dist), (v) => { state.dist = Number(v); state.view = 'one'; rebuild(); });
const sel = document.getElementById('form') as HTMLSelectElement;
for (const r of ROCKS) sel.append(new Option(`${r.name} (${r.id})`, r.id));
sel.value = state.form;
sel.onchange = () => { state.form = sel.value; if (state.view === 'grid') state.view = 'one'; rebuild(); };
document.getElementById('seedUp')!.onclick = () => { state.seed++; rebuild(); };
document.getElementById('seedDown')!.onclick = () => { state.seed--; rebuild(); };
const seaIn = document.getElementById('sea') as HTMLInputElement;
seaIn.value = String(state.sea);
seaIn.oninput = () => { state.sea = Number(seaIn.value); applySea(); syncUrl(); };

// ---------------------------------------------------------------- loop

const pipeline = new THREE.RenderPipeline(renderer);
const scenePass = pass(scene, camera);
pipeline.outputNode = scenePass.add(bloom(scenePass, 0.25, 0.4, 3));

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

applyLight();
applySea();
rebuild();

const clock = new THREE.Timer(), v = new THREE.Vector3(), stats = document.getElementById('stats')!;
let frames = 0;
function frame(): void {
  clock.update();
  const dt = Math.min(0.05, clock.getDelta());
  if (state.spin && state.view === 'grid') for (const o of spinners) o.rotation.y += dt * 0.25;
  controls.update();
  content.updateMatrixWorld();
  renderer.info.reset();
  pipeline.render();
  for (const l of labels) {
    v.copy(l.at).applyMatrix4(content.matrixWorld).project(camera);
    const vis = v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1;
    l.el.style.display = vis ? '' : 'none';
    l.el.style.left = `${((v.x + 1) / 2) * innerWidth}px`;
    l.el.style.top = `${((1 - v.y) / 2) * innerHeight}px`;
  }
  if (++frames % 20 === 0) stats.textContent = `${(renderer.info.render.triangles / 1000).toFixed(1)}k tris · ${renderer.info.render.calls} calls`;
  requestAnimationFrame(frame);
}
THREE.DefaultLoadingManager.onLoad = () => {
  (window as unknown as { rocksReady: boolean }).rocksReady = true;
};
frame();

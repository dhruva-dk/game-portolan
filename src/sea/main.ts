// The sea, the sky and one ship to sail on them: the renderer, the camera round the ship, the helm and the frame.
//
// Each frame: the clock and the sun and moon move on; the ship sails and rides the swell; the sky traces its air and
// clouds and redoes a slice of the panorama the sea reflects; the waves move on; the scene is drawn (sky behind, then
// the sea and the ship hazed by the air between them and the eye); and over it the light shafts toward the sun, the
// bloom, and the tone map to the screen.
import {
  ACESFilmicToneMapping, AgXToneMapping, NeutralToneMapping, DirectionalLight, HemisphereLight, Matrix4, PerspectiveCamera, RenderPipeline, Scene, Vector2, Vector3,
  WebGPURenderer, type Node,
} from 'three/webgpu';
import { Fn, dot, exp, fract, clamp, min, pass, rtt, screenCoordinate, screenUV, smoothstep, uniform, vec2, vec3, vec4 } from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { R, U, bodies, dayFor } from './world.ts';
import { AIR_TOP, SKY, Sky, airFog, ambientCpu, background, transmittanceCpu } from './sky.ts';
import { CALM_SEA, Ocean } from './ocean.ts';
import { Ship } from './ship.ts';
import { shape } from '../render/gpu/shape.ts';
import { runFrameWork } from '../render/gpu/work.ts';
import { P } from '../render/gpu/uniforms.ts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Nd = any;

// the page's query, or one built in (for a device run: VITE_SEA_QUERY='fps=0' node tools/ios.ts ...)
const q = new URLSearchParams(location.search || (import.meta.env.VITE_SEA_QUERY as string | undefined) || '');
const num = (k: string, d: number) => (q.has(k) ? Number(q.get(k)) : d);
const touch = navigator.maxTouchPoints > 0;

/** A day's length, seconds of play. */
const DAY = num('day', 24 * 60);
/** The sun's light at the top of the air, in the scene's units (the exposure brings it to the screen). */
const SUN = new Vector3(1, 0.975, 0.94).multiplyScalar(20);
const MOON = new Vector3(0.78, 0.86, 1).multiplyScalar(20 * 0.012);

// ---------------------------------------------------------------- the renderer

const canvas = document.getElementById('view') as HTMLCanvasElement;
const gpu = (navigator as unknown as { gpu?: { requestAdapter(o: object): Promise<{ limits: Record<string, number> } | null> } }).gpu;
const adapter = await gpu?.requestAdapter({ powerPreference: 'high-performance' });
if (!adapter) throw new Error('needs WebGPU');
const renderer = new WebGPURenderer({
  canvas, antialias: false, alpha: false, depth: true, stencil: false, powerPreference: 'high-performance',
  requiredLimits: {
    maxComputeWorkgroupStorageSize: adapter.limits.maxComputeWorkgroupStorageSize,
    maxComputeInvocationsPerWorkgroup: adapter.limits.maxComputeInvocationsPerWorkgroup,
    maxStorageTexturesPerShaderStage: adapter.limits.maxStorageTexturesPerShaderStage,
    maxStorageBuffersPerShaderStage: adapter.limits.maxStorageBuffersPerShaderStage,
    maxSampledTexturesPerShaderStage: adapter.limits.maxSampledTexturesPerShaderStage,
    maxColorAttachmentBytesPerSample: adapter.limits.maxColorAttachmentBytesPerSample,
  },
} as ConstructorParameters<typeof WebGPURenderer>[0]);
await renderer.init();
renderer.info.autoReset = false;
const backend = renderer.backend as unknown as { device: Parameters<typeof shape.install>[0] };
shape.install(backend.device);
renderer.toneMapping = ({ agx: AgXToneMapping, neutral: NeutralToneMapping } as unknown as Record<string, typeof AgXToneMapping>)[q.get('tm') ?? ''] ?? ACESFilmicToneMapping;
renderer.toneMappingExposure = 1;
const dpr = Math.min(devicePixelRatio, 2);
renderer.setPixelRatio(dpr);
renderer.setSize(innerWidth, innerHeight, false);

// ---------------------------------------------------------------- the world

const scene = new Scene();
const camera = new PerspectiveCamera(55, innerWidth / innerHeight, 0.3, 10000);
const sky = new Sky(renderer);
const ocean = new Ocean();
ocean.sea = { ...CALM_SEA, wind: num('wind', 12), fetch: 40000, swell: 0.9, swellLength: 60, chop: 1.15 };
SKY.coverage.value = num('cover', 0.55);
scene.add(ocean.mesh);
const start = new Vector3(0.8, 0.12, 0.58).normalize();
const ship = new Ship(start);
scene.add(ship.model.root);

const sunLight = new DirectionalLight(0xffffff, 1);
const moonLight = new DirectionalLight(0xffffff, 1);
const skyLight = new HemisphereLight(0xffffff, 0x000000, 1);
scene.add(sunLight, sunLight.target, moonLight, moonLight.target, skyLight);
scene.backgroundNode = background();
scene.fogNode = airFog(sky);

// ---------------------------------------------------------------- the frame after the scene

const scale = num('scale', touch ? 0.72 : 1);
const scenePass = pass(scene, camera, { samples: 4 }) as Nd;
scenePass.setResolutionScale(scale);
const colour = scenePass.getTextureNode('output') as Nd;
const depth = scenePass.getTextureNode('depth') as Nd;
const exposed = colour.rgb.mul(U.exposure);

/** Light shafts: the bright sky round the sun, blurred twice toward it, what stands before it leaving its shadow. */
const SHAFT = { light: uniform(new Vector2(0.5, 0.5)), aspect: uniform(1), strength: uniform(0) };
const TAPS = 16, WEIGHTS = Array.from({ length: TAPS }, (_, i) => 0.92 ** i), TOTAL = WEIGHTS.reduce((s, w) => s + w, 0);
const shafts = (() => {
  const from = (uv: Nd): Nd => uv.sub(SHAFT.light).mul(vec2(SHAFT.aspect, 1));
  const mask = Fn(() => {
    const isSky = smoothstep(0.99999, 1, depth.r);
    const d = from(screenUV);
    const bright = clamp(exposed.sub(3), vec3(0), vec3(2));
    return vec4(bright.mul(isSky).mul(exp(dot(d, d).mul(-36))), 1);
  })();
  const noise = fract(fract(dot(screenCoordinate.xy, vec2(0.06711056, 0.00583715))).mul(52.9829189));
  const blur = (source: Nd, span: number, falloff: number): Nd => Fn(() => {
    const uv0 = screenUV;
    const step = SHAFT.light.sub(uv0).mul(span / TAPS).toVar();
    const uv = uv0.add(step.mul(noise)).toVar();
    let sum: Nd = vec3(0);
    for (const w of WEIGHTS) {
      sum = sum.add(source.sample(uv).rgb.mul(w));
      uv.addAssign(step);
    }
    const d = from(uv0);
    return vec4(sum.div(TOTAL).mul(exp(dot(d, d).mul(-falloff))), 1);
  })();
  const a = rtt(mask, null, null, { depthBuffer: false }) as Nd;
  const b = rtt(blur(a, 1, 0), null, null, { depthBuffer: false }) as Nd;
  const c = rtt(blur(b, 1 / TAPS, 1.5), null, null, { depthBuffer: false }) as Nd;
  const passes = [a, b, c];
  for (const p of passes) p.setResolutionScale(scale * 0.25);
  return { node: c.sample(screenUV).rgb.mul(SHAFT.strength) as Nd, passes };
})();

const glow = bloom(vec4(min(exposed, vec3(14)), 1) as Nd, 0.12, 0.5, 1.0) as Nd;
(glow as unknown as { setResolutionScale(s: number): void }).setResolutionScale(0.25);
const post = new RenderPipeline(renderer);
post.outputNode = vec4(exposed.add(glow.rgb).add(shafts.node), 1) as unknown as Node;

// ---------------------------------------------------------------- the helm and the camera

const rig = { yaw: num('yaw', 0.55), pitch: num('pitch', 0.16), dist: num('dist', 34) };
const helm = { throttle: num('throttle', 0.6), rudder: 0 };
const keys = new Set<string>();
addEventListener('keydown', (e) => keys.add(e.key.toLowerCase()));
addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));

const ui = document.getElementById('ui') as HTMLElement;
ui.innerHTML = `<style>
  .stick{position:fixed;width:132px;height:132px;margin:-66px 0 0 -66px;border-radius:50%;pointer-events:none;opacity:0;transition:opacity .2s;
    border:2px solid rgba(58,38,20,.75);box-shadow:inset 0 0 0 5px rgba(232,214,178,.22),0 0 0 1px rgba(232,214,178,.35);background:radial-gradient(circle,rgba(232,214,178,.12),rgba(232,214,178,.02) 70%)}
  .stick i{position:absolute;left:50%;top:50%;width:46px;height:46px;margin:-23px 0 0 -23px;border-radius:50%;border:2px solid rgba(58,38,20,.8);background:rgba(232,214,178,.35)}
  .rose{position:fixed;right:18px;top:18px;width:58px;height:58px;pointer-events:none;opacity:.85}
  .knots{position:fixed;left:20px;top:18px;font:600 20px/1 'Iowan Old Style','Palatino',serif;color:#3a2614;text-shadow:0 0 3px rgba(240,226,196,.9)}
</style><div class="stick"><i></i></div>
<svg class="rose" viewBox="-50 -50 100 100"><g fill="none" stroke="#3a2614" stroke-width="2"><circle r="30"/><circle r="24" stroke-width="1"/></g>
<g id="needle"><path d="M0-44L7 0L0 8L-7 0Z" fill="#8c2a1c" stroke="#3a2614" stroke-width="1.5"/><path d="M0 44L5 0L-5 0Z" fill="#e8d6b2" stroke="#3a2614" stroke-width="1.5"/></g></svg>
<div class="knots"></div>`;
const stickEl = ui.querySelector('.stick') as HTMLElement, knob = stickEl.querySelector('i') as HTMLElement;
const needle = ui.querySelector('#needle') as SVGGElement, knots = ui.querySelector('.knots') as HTMLElement;

const touches = new Map<number, { x: number; y: number; ox: number; oy: number; stick: boolean }>();
let pinch = 0;
const STICK = 56;
canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  const stick = e.pointerType !== 'mouse' && e.clientX < innerWidth * 0.45 && ![...touches.values()].some((t) => t.stick);
  touches.set(e.pointerId, { x: e.clientX, y: e.clientY, ox: e.clientX, oy: e.clientY, stick });
  if (stick) {
    stickEl.style.left = `${e.clientX}px`;
    stickEl.style.top = `${e.clientY}px`;
    stickEl.style.opacity = '1';
  }
  pinch = 0;
});
canvas.addEventListener('pointermove', (e) => {
  const t = touches.get(e.pointerId);
  if (!t) return;
  const dx = e.clientX - t.x, dy = e.clientY - t.y;
  t.x = e.clientX;
  t.y = e.clientY;
  if (t.stick) {
    let sx = t.x - t.ox, sy = t.y - t.oy;
    const l = Math.hypot(sx, sy);
    if (l > STICK) { sx *= STICK / l; sy *= STICK / l; }
    knob.style.transform = `translate(${sx}px,${sy}px)`;
    helm.rudder = -sx / STICK;
    helm.throttle = Math.min(1, Math.max(0, -sy / STICK));
    return;
  }
  const cams = [...touches.values()].filter((v) => !v.stick);
  if (cams.length >= 2) {
    const d = Math.hypot(cams[0].x - cams[1].x, cams[0].y - cams[1].y);
    if (pinch > 0) rig.dist = Math.min(9000, Math.max(9, rig.dist * (pinch / d)));
    pinch = d;
    return;
  }
  rig.yaw -= dx * 0.006;
  rig.pitch = Math.min(1.45, Math.max(-0.05, rig.pitch + dy * 0.005));
});
const up = (e: PointerEvent) => {
  const t = touches.get(e.pointerId);
  touches.delete(e.pointerId);
  pinch = 0;
  if (t?.stick) {
    stickEl.style.opacity = '0';
    knob.style.transform = '';
    helm.rudder = 0;
  }
};
canvas.addEventListener('pointerup', up);
canvas.addEventListener('pointercancel', up);
canvas.addEventListener('wheel', (e) => { rig.dist = Math.min(9000, Math.max(9, rig.dist * Math.exp(e.deltaY * 0.0015))); e.preventDefault(); }, { passive: false });
addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});

const side = new Vector3(), toEye = new Vector3(), focus = new Vector3(), lookAt = new Vector3(), shipUp = new Vector3();
const faceSun = q.has('facesun');
function placeCamera(): void {
  shipUp.copy(ship.up);
  side.crossVectors(shipUp, ship.fwd);
  if (faceSun) {
    const sun = U.sunDir.value as Vector3;
    rig.yaw = Math.atan2(-sun.dot(side), sun.dot(ship.fwd));
  }
  const cy = Math.cos(rig.yaw), sy = Math.sin(rig.yaw), cp = Math.cos(rig.pitch), sp = Math.sin(rig.pitch);
  toEye.copy(ship.fwd).multiplyScalar(-cy * cp).addScaledVector(side, sy * cp).addScaledVector(shipUp, sp).normalize();
  // close to her the eye looks at her rig; far out, at the planet's middle
  const out = Math.min(1, Math.max(0, (rig.dist - 400) / 3000));
  focus.copy(shipUp).multiplyScalar(R + 5 * (1 - out));
  lookAt.copy(focus).multiplyScalar(1 - out);
  camera.position.copy(focus).addScaledVector(toEye, rig.dist);
  // never under the waves
  const h = camera.position.length() - R;
  if (h < 2.5) camera.position.setLength(R + 2.5);
  camera.up.copy(shipUp);
  camera.lookAt(lookAt);
  const height = camera.position.length() - R;
  camera.near = Math.min(Math.max(0.25, height * 0.05, rig.dist * 0.01), 200);
  camera.far = rig.dist + 2 * (R + AIR_TOP);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
}

// ---------------------------------------------------------------- the clock and the light

let day = dayFor(num('hour', 15.5), start);
const frozen = q.has('freeze');
let time = 0;
const T = new Vector3(), A = new Vector3(), light = new Vector3(), unproject = new Matrix4(), rot = new Matrix4();

const lum = (v: Vector3) => 0.2126 * v.x + 0.7152 * v.y + 0.0722 * v.z;
let exposure = 0.5;

function lights(dt: number): number {
  const sun = U.sunDir.value as Vector3, moon = U.moonDir.value as Vector3;
  bodies(day, sun, moon);
  (U.sunLight.value as Vector3).copy(SUN);
  // the moon by its phase: full when it stands opposite the sun
  const phase = 0.5 - 0.5 * sun.dot(moon);
  (U.moonLight.value as Vector3).copy(MOON).multiplyScalar(phase);
  // the old ship materials read these
  (P.sunDir.value as Vector3).copy(sun);
  (P.moonDir.value as Vector3).copy(moon);
  const at = ship.up;
  const r = R + 4;
  const sunE = transmittanceCpu(r, at.dot(sun), T).multiply(SUN);
  const moonE = transmittanceCpu(r, at.dot(moon), A).multiply(U.moonLight.value as Vector3);
  sunLight.color.setRGB(sunE.x, sunE.y, sunE.z);
  sunLight.position.copy(at).multiplyScalar(R).addScaledVector(sun, 200);
  sunLight.target.position.copy(at).multiplyScalar(R);
  moonLight.color.setRGB(moonE.x, moonE.y, moonE.z);
  moonLight.position.copy(at).multiplyScalar(R).addScaledVector(moon, 200);
  moonLight.target.position.copy(at).multiplyScalar(R);
  sunLight.target.updateMatrixWorld();
  moonLight.target.updateMatrixWorld();
  // the sky's light, read back from the sky's own table
  const amb = new Vector3();
  if (sky.ambient) {
    ambientCpu(sky.ambient, at.dot(sun), light).multiply(SUN);
    amb.copy(light);
    ambientCpu(sky.ambient, at.dot(moon), light).multiply(U.moonLight.value as Vector3);
    amb.add(light);
  }
  skyLight.color.setRGB(amb.x, amb.y, amb.z);
  skyLight.groundColor.setRGB(amb.x * 0.12 + sunE.x * 0.01, amb.y * 0.14 + sunE.y * 0.012, amb.z * 0.18 + sunE.z * 0.014);
  skyLight.position.copy(at);
  // the eye adapts: a white surface lying open to the sky comes out a little under the screen's white
  const open = (lum(sunE) * Math.max(at.dot(sun), 0) + lum(amb) + lum(moonE) * Math.max(at.dot(moon), 0)) / Math.PI;
  const want = num('ev', 0) ? 2 ** num('ev', 0) : 0.62 / Math.max(open, 0.12);
  exposure += (want - exposure) * Math.min(1, dt * 1.5);
  U.exposure.value = exposure;
  return 1 - smooth(-0.08, 0.05, at.dot(sun));
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

const sv = new Vector3();
function aimShafts(): void {
  const sun = U.sunDir.value as Vector3;
  const up = ship.up;
  const elev = (Math.asin(Math.min(1, Math.max(-1, up.dot(sun)))) * 180) / Math.PI;
  const strength = smooth(-3, 2, elev) * (1 - 0.6 * smooth(15, 45, elev));
  const v = sv.copy(sun).transformDirection(camera.matrixWorldInverse);
  const amount = strength * smooth(0, 0.5, -v.z) * 0.1 * num('shafts', 1);
  const on = amount > 1e-3;
  SHAFT.strength.value = on ? amount : 0;
  for (const p of shafts.passes) p.autoUpdate = on;
  if (!on) return;
  const e = camera.projectionMatrix.elements;
  (SHAFT.light.value as Vector2).set(0.5 - (0.5 * (e[0] * v.x + e[8] * v.z)) / v.z, 0.5 + (0.5 * (e[5] * v.y + e[9] * v.z)) / v.z);
  SHAFT.aspect.value = camera.aspect;
}

// ---------------------------------------------------------------- the loop

await Promise.race([ship.ready, new Promise((ok) => setTimeout(ok, 4000))]);
await sky.init();
await ship.prepare(renderer);

const wind = new Vector3();
const perf = { t: 0, frames: 0, worst: 0, intervals: [] as number[] };
const cap = num('fps', touch ? 40 : 0);
let last = performance.now(), lastDrawn = 0;
const hook = { ready: false, frames: 0 };
(window as unknown as { __sea: object }).__sea = hook;

function frame(now: number): void {
  requestAnimationFrame(frame);
  if (cap > 0 && now - lastDrawn < 1000 / cap - 2) return;
  lastDrawn = now;
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  shape.frame('sea');
  logPerf(dt);
  renderer.info.reset();
  time += dt;
  if (!frozen) day = (day + dt / DAY) % 1;
  U.time.value = time;
  U.dt.value = dt;
  P.time.value = time;
  P.dt.value = dt;

  // the helm from the keys, where there are keys
  if (keys.size) {
    if (keys.has('w') || keys.has('arrowup')) helm.throttle = Math.min(1, helm.throttle + dt * 0.8);
    if (keys.has('s') || keys.has('arrowdown')) helm.throttle = Math.max(0, helm.throttle - dt * 0.8);
    helm.rudder = (keys.has('a') || keys.has('arrowleft') ? 1 : 0) - (keys.has('d') || keys.has('arrowright') ? 1 : 0);
  }
  ship.throttle = helm.throttle;
  ship.rudder = helm.rudder;
  const night = lights(dt);
  // the wind: steady from the waves' heading, carried to her as a tangent
  wind.set(-ship.up.z, 0, ship.up.x).normalize().multiplyScalar(-8);
  shape.system('ship');
  ship.update(dt, time, ocean, wind, night);
  runFrameWork(renderer);
  placeCamera();
  (U.eye.value as Vector3).copy(camera.position);
  rot.copy(camera.matrixWorldInverse).setPosition(0, 0, 0);
  unproject.multiplyMatrices(camera.projectionMatrix, rot).invert();
  (U.unproject.value as Matrix4).copy(unproject);

  shape.system('sky');
  const w = renderer.domElement.width * scale, h = renderer.domElement.height * scale;
  sky.resize(w, h, num('air', 4));
  sky.update(camera, ship.up, dt);
  shape.system('sea');
  ocean.update(renderer, camera.position, time, dt);
  aimShafts();
  shape.system('scene');
  post.render();

  // the instruments
  needle.setAttribute('transform', `rotate(${(-Math.atan2(ship.fwd.dot(northSide(ship.up)), ship.fwd.dot(northOf(ship.up))) * 180) / Math.PI})`);
  knots.textContent = `${Math.round(ship.speed * 1.944)}`;
  hook.frames++;
  if (hook.frames > 8) hook.ready = true;
}

const north = new Vector3(), east = new Vector3();
function northOf(up: Vector3): Vector3 {
  north.set(0, 1, 0).addScaledVector(up, -up.y);
  if (north.lengthSq() < 1e-6) north.set(1, 0, 0);
  return north.normalize();
}
function northSide(up: Vector3): Vector3 {
  return east.crossVectors(northOf(up), up);
}

function logPerf(dt: number): void {
  perf.t += dt;
  perf.frames++;
  if (perf.intervals.length < 2048) perf.intervals.push(dt * 1000);
  perf.worst = Math.max(perf.worst, dt);
  if (perf.t < 5) return;
  const s = perf.intervals.sort((a, b) => a - b);
  const pct = (p: number) => +(s[Math.min(s.length - 1, Math.ceil(s.length * p) - 1)] ?? 0).toFixed(1);
  const info = renderer.info.render as unknown as { triangles: number; drawCalls: number };
  console.info(`perfjson ${JSON.stringify({
    screen: 'sea', fps: +(perf.frames / perf.t).toFixed(1), p50: pct(0.5), p95: pct(0.95), p99: pct(0.99), worst: Math.round(perf.worst * 1000),
    scale, tris: info.triangles, calls: info.drawCalls, ...shape.brief(), pipelines: shape.pipelines,
  })}`);
  const lines = shape.report('sea').split('\n');
  for (let i = 0; i < lines.length; i += 24) console.info(lines.slice(i, i + 24).join('\n'));
  Object.assign(perf, { t: 0, frames: 0, worst: 0, intervals: [] });
}

requestAnimationFrame(frame);

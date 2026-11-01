// The weather's dev page: a camera on the sphere's surface (or in orbit), the stand-in planet, and toggles for
// every effect by day and by night. URL parameters (all optional):
//   spot=open|ice|arch|mistwood|orbit   where the camera starts (each has its own default hour and effects)
//   fx=fog,rain,thunder,calm,snow,ash,aurora,moonbow,mist,rays   effects on
//   place=ahead|over   systems in a fan ahead of the camera, or the first one over it
//   hour=0..24  intensity=0..1  surge=0..1 (Mistwood's mist)  drift=1 (systems move)
//   h= yaw= pitch=   camera height (m), heading (deg, 0 north) and pitch (deg)
//   strike=1   a strike ahead every few seconds
//   t=seconds  run the weather this long before the first frame;  pause=1  then hold time still
//   bolt=s     after t, call a strike ahead and run s seconds past its landing (negative: during the warning)
//   ui=0  hide the panel;  q=low  phone particle counts;  seed=n
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { frameAt, newFrame, placeOn, type Vec3Like, type WeatherKind } from '../common.ts';
import { createWeather, type WeatherSystem, type WeatherView } from '../index.ts';
import { buildStage } from './stage.ts';

const R = 554;
const params = new URLSearchParams(location.search);
const num = (k: string, d: number): number => (params.has(k) ? Number(params.get(k)) : d);

const latLon = (lat: number, lon: number): THREE.Vector3 => {
  const a = (lat * Math.PI) / 180, o = (lon * Math.PI) / 180;
  return new THREE.Vector3(Math.cos(a) * Math.cos(o), Math.sin(a), -Math.cos(a) * Math.sin(o));
};

const RING = 360 / 7;
const SPOTS = {
  mistwood: latLon(31, RING),
  arch: latLon(31, RING * 4),
  pole: new THREE.Vector3(0, 1, 0),
};

interface Preset { at: THREE.Vector3; yaw: number; pitch: number; h: number; hour: number; fx: string }
const f0 = newFrame(), tmp = new THREE.Vector3();
/** A point d metres from 'at' on bearing b (degrees from north). */
const offset = (at: Vec3Like, b: number, d: number): THREE.Vector3 => {
  frameAt(at, f0);
  const a = (b * Math.PI) / 180;
  return placeOn(f0, Math.sin(a) * d, Math.cos(a) * d, 0, R, new THREE.Vector3()).normalize();
};
const PRESETS: Record<string, Preset> = {
  open: { at: latLon(8, 128), yaw: 10, pitch: 6, h: 8, hour: 14, fx: 'thunder,rain,fog' },
  ice: { at: latLon(73, 10), yaw: -10, pitch: 22, h: 8, hour: 0.5, fx: 'aurora,snow' },
  arch: { at: offset(SPOTS.arch, 180, 95), yaw: 0, pitch: 6, h: 6, hour: 22.5, fx: 'moonbow' },
  mistwood: { at: offset(SPOTS.mistwood, 95, 190), yaw: 275, pitch: 4, h: 8, hour: 8, fx: 'mist,rays' },
  orbit: { at: latLon(20, 100), yaw: 0, pitch: -90, h: 1250, hour: 16.5, fx: 'thunder,rain,fog,calm,snow,ash,aurora' },
};

const spotName = params.get('spot') ?? 'open';
const preset = PRESETS[spotName] ?? PRESETS.open;
const fx = new Set((params.get('fx') ?? preset.fx).split(',').filter(Boolean));
const KINDS: WeatherKind[] = ['fog', 'rain', 'thunder', 'calm', 'snow', 'ash'];
const LOCALS = ['aurora', 'moonbow', 'mist', 'rays'];

// ---------------------------------------------------------------- renderer and scene

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.3, 30000);
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.5, 0.55, 1.15);
composer.addPass(bloom);
composer.addPass(new OutputPass());

let bolts = 0;
const weather = createWeather(scene, { radius: R, seed: num('seed', 1), quality: params.get('q') === 'low' ? 'low' : 'high', onBolt: () => bolts++ });
const isles = [0, 60, 130, 200, 250, 310].map((b, i) => offset(preset.at, b, 120 + i * 37));
const stage = buildStage(weather.shared, { arch: SPOTS.arch, mistwood: SPOTS.mistwood, pole: SPOTS.pole, isles });
scene.add(stage.group);
for (const m of stage.land) { weather.addIcing(m); weather.addWetness(m); }

// ---------------------------------------------------------------- camera on the sphere

const cam = { dir: preset.at.clone(), fwd: new THREE.Vector3(), h: num('h', preset.h), pitch: num('pitch', preset.pitch) };
{
  const f = frameAt(cam.dir, newFrame()), a = (num('yaw', preset.yaw) * Math.PI) / 180;
  cam.fwd.copy(f.n).multiplyScalar(Math.cos(a)).addScaledVector(f.e, Math.sin(a)).normalize();
}
function placeCamera(): void {
  camera.position.copy(cam.dir).multiplyScalar(R + cam.h);
  camera.up.copy(cam.dir);
  const p = (Math.max(-89.9, Math.min(89.9, cam.pitch)) * Math.PI) / 180;
  tmp.copy(cam.fwd).multiplyScalar(Math.cos(p)).addScaledVector(cam.dir, Math.sin(p));
  camera.lookAt(tmp.add(camera.position));
}
function move(forward: number, right: number): void {
  const side = tmp.crossVectors(cam.fwd, cam.dir).normalize();
  const step = new THREE.Vector3().copy(cam.fwd).multiplyScalar(forward).addScaledVector(side, right);
  const d = step.length();
  if (d < 1e-6) return;
  step.divideScalar(d);
  const a = d / R, c = Math.cos(a), s = Math.sin(a);
  const nd = cam.dir.clone().multiplyScalar(c).addScaledVector(step, s);
  const nf = step.clone().multiplyScalar(c).addScaledVector(cam.dir, -s);
  // keep the heading: carry fwd along the move
  const keep = cam.fwd.dot(step), across = cam.fwd.clone().addScaledVector(step, -keep);
  cam.fwd.copy(nf).multiplyScalar(keep).add(across).normalize();
  cam.dir.copy(nd).normalize();
  cam.fwd.addScaledVector(cam.dir, -cam.fwd.dot(cam.dir)).normalize();
}
function turn(deg: number): void {
  cam.fwd.applyAxisAngle(cam.dir, (-deg * Math.PI) / 180);
}

// ---------------------------------------------------------------- the view

let hour = num('hour', preset.hour), intensity = num('intensity', 1), surge = num('surge', 0.4);
const drift = params.get('drift') === '1';
const sunFrame = frameAt(preset.at, newFrame());
const sunDir = new THREE.Vector3();
/** The sun for the hour, as local solar time at the starting spot: east at six, high at noon, west at six. */
function sunFor(hr: number): THREE.Vector3 {
  const a = (2 * Math.PI * (hr - 6)) / 24, t = 0.42, { e, n, c } = sunFrame;
  return sunDir.copy(e).multiplyScalar(Math.cos(a)).addScaledVector(c, Math.sin(a) * Math.cos(t)).addScaledVector(n, -Math.sin(a) * Math.sin(t)).normalize();
}

const systems = new Map<WeatherKind, WeatherSystem>();
const RADII: Record<string, number> = { thunder: 125, fog: 120, calm: 140, rain: 110, snow: 115, ash: 110 };
function placeSystems(): void {
  systems.clear();
  const on = KINDS.filter((k) => fx.has(k)), over = params.get('place') === 'over';
  const f = frameAt(cam.dir, newFrame()), yaw = Math.atan2(cam.fwd.dot(f.e), cam.fwd.dot(f.n)) * 180 / Math.PI;
  on.forEach((kind, i) => {
    const b = yaw + (i - (on.length - 1) / 2) * 42, d = over && i === 0 ? 0 : cam.h > 300 ? 300 : 270;
    systems.set(kind, { id: i * 17 + kind.length, kind, at: offset(cam.dir, b, d), radius: RADII[kind], intensity, drift: { x: f.e.x * 3, y: f.e.y * 3, z: f.e.z * 3 } });
  });
}
placeSystems();

const raySpot = offset(cam.dir, 0, 1).clone();
function view(): WeatherView {
  for (const s of systems.values()) s.intensity = intensity;
  return {
    systems: [...systems.values()],
    sunDir: sunFor(hour),
    hour,
    wind: { x: cam.fwd.x * 2, y: cam.fwd.y * 2, z: cam.fwd.z * 2 },
    aurora: fx.has('aurora') ? 1 : 0,
    mist: fx.has('mist') ? { at: SPOTS.mistwood, radius: 85, amount: surge } : undefined,
    moonbow: fx.has('moonbow') ? { at: SPOTS.arch, radius: 30, amount: 1 } : undefined,
    rays: fx.has('rays') ? [{ at: SPOTS.mistwood, radius: 75, amount: 1 }, { at: offset(raySpot, 0, 110), radius: 60, amount: 0.8 }] : [],
  };
}

function strikeAhead(): void {
  const f = frameAt(cam.dir, newFrame()), yaw = Math.atan2(cam.fwd.dot(f.e), cam.fwd.dot(f.n)) * 180 / Math.PI;
  weather.strike(offset(cam.dir, yaw + (Math.random() - 0.5) * 50, 70 + Math.random() * 60), 1.6);
}

function stepWeather(dt: number): void {
  if (drift) {
    for (const s of systems.values()) {
      const at = s.at as THREE.Vector3, d = s.drift!, a = dt / R;
      at.addScaledVector(new THREE.Vector3(d.x, d.y, d.z), a).normalize();
    }
  }
  placeCamera();
  const local = weather.update(view(), dt, camera);
  stage.update(local, camera.position);
}

// ---------------------------------------------------------------- the panel

const ui = document.createElement('div');
ui.id = 'panel';
if (params.get('ui') === '0') ui.style.display = 'none';
document.body.appendChild(ui);
const check = (name: string): string => `<label><input type="checkbox" data-fx="${name}" ${fx.has(name) ? 'checked' : ''}>${name}</label>`;
ui.innerHTML = `
<h1>Weather</h1>
<div class="row">${KINDS.map(check).join('')}</div>
<div class="row">${LOCALS.map(check).join('')}</div>
<div class="row"><label><input type="checkbox" id="over" ${params.get('place') === 'over' ? 'checked' : ''}>first over me</label><button id="replace">place again</button></div>
<div class="row"><span>hour</span><input id="hour" type="range" min="0" max="24" step="0.05" value="${hour}"><b id="hourv"></b></div>
<div class="row"><button data-hour="12">day</button><button data-hour="18.4">dusk</button><button data-hour="23">night</button><button data-hour="5.6">dawn</button></div>
<div class="row"><span>intensity</span><input id="int" type="range" min="0" max="1" step="0.01" value="${intensity}"></div>
<div class="row"><span>mist surge</span><input id="surge" type="range" min="0" max="1" step="0.01" value="${surge}"></div>
<div class="row"><button id="strike">strike</button><label><input type="checkbox" id="auto" ${params.get('strike') === '1' ? 'checked' : ''}>auto</label></div>
<div class="row">${Object.keys(PRESETS).map((k) => `<button data-spot="${k}">${k}</button>`).join('')}</div>
<pre id="read"></pre>
<p class="help">drag to look · WASD to sail · Q/E or wheel to climb</p>`;
const $ = <T extends HTMLElement>(s: string): T => ui.querySelector(s) as T;
ui.querySelectorAll<HTMLInputElement>('input[data-fx]').forEach((el) => el.addEventListener('change', () => {
  if (el.checked) fx.add(el.dataset.fx!); else fx.delete(el.dataset.fx!);
  if (KINDS.includes(el.dataset.fx as WeatherKind)) placeSystems();
}));
$('#over').addEventListener('change', (e) => { params.set('place', (e.target as HTMLInputElement).checked ? 'over' : 'ahead'); placeSystems(); });
$('#replace').addEventListener('click', placeSystems);
$<HTMLInputElement>('#hour').addEventListener('input', (e) => { hour = Number((e.target as HTMLInputElement).value); });
ui.querySelectorAll<HTMLButtonElement>('button[data-hour]').forEach((b) => b.addEventListener('click', () => {
  hour = Number(b.dataset.hour);
  $<HTMLInputElement>('#hour').value = String(hour);
}));
$<HTMLInputElement>('#int').addEventListener('input', (e) => { intensity = Number((e.target as HTMLInputElement).value); });
$<HTMLInputElement>('#surge').addEventListener('input', (e) => { surge = Number((e.target as HTMLInputElement).value); });
$('#strike').addEventListener('click', strikeAhead);
ui.querySelectorAll<HTMLButtonElement>('button[data-spot]').forEach((b) => b.addEventListener('click', () => {
  const q = new URLSearchParams({ spot: b.dataset.spot! });
  location.search = q.toString();
}));

// drag to look, keys to sail
let drag: { x: number; y: number } | null = null;
renderer.domElement.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY }; });
addEventListener('pointerup', () => { drag = null; });
addEventListener('pointermove', (e) => {
  if (!drag) return;
  turn((e.clientX - drag.x) * 0.2);
  cam.pitch = Math.max(-89.9, Math.min(89.9, cam.pitch - (e.clientY - drag.y) * 0.2));
  drag = { x: e.clientX, y: e.clientY };
});
renderer.domElement.addEventListener('wheel', (e) => { cam.h = Math.max(1, Math.min(3000, cam.h * Math.exp(e.deltaY * 0.001))); }, { passive: true });
const keys = new Set<string>();
addEventListener('keydown', (e) => keys.add(e.key.toLowerCase()));
addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
});

// ---------------------------------------------------------------- loop

const hook = { frames: 0, ready: false, bolts: () => bolts, weather, counts: () => ({}) as unknown };
(window as unknown as { __weather: typeof hook }).__weather = hook;
const t0 = num('t', 2);
for (let k = 0; k < t0 * 30; k++) stepWeather(1 / 30);
if (params.has('bolt')) {
  const after = num('bolt', 0.05), f = frameAt(cam.dir, newFrame()), yaw = Math.atan2(cam.fwd.dot(f.e), cam.fwd.dot(f.n)) * 180 / Math.PI;
  weather.strike(offset(cam.dir, yaw + 8, 95), 1.6);
  const steps = Math.max(1, Math.round((1.6 + after) * 60));
  for (let k = 0; k < steps; k++) stepWeather((1.6 + after) / steps);
}
let paused = params.get('pause') === '1', nextStrike = 2, last = performance.now(), fpsT = 0, fpsN = 0, fps = 0;

function frame(now: number): void {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  const speed = (keys.has('shift') ? 4 : 1) * Math.max(10, cam.h * 0.6);
  if (keys.has('w')) move(speed * dt, 0);
  if (keys.has('s')) move(-speed * dt, 0);
  if (keys.has('a')) move(0, -speed * dt);
  if (keys.has('d')) move(0, speed * dt);
  if (keys.has('q')) cam.h = Math.max(1, cam.h * Math.exp(-dt));
  if (keys.has('e')) cam.h = Math.min(3000, cam.h * Math.exp(dt));
  if (!paused) {
    if ((ui.querySelector('#auto') as HTMLInputElement).checked && (nextStrike -= dt) < 0) { strikeAhead(); nextStrike = 3.5; }
    stepWeather(dt);
  } else placeCamera();
  composer.render();
  hook.frames++;
  hook.ready = hook.frames > 2;
  fpsN++; fpsT += dt;
  if (fpsT > 0.5) { fps = fpsN / fpsT; fpsN = 0; fpsT = 0; }
  const l = weather.local;
  $('#hourv').textContent = hour.toFixed(1);
  $('#read').textContent = `${fps.toFixed(0)} fps · ${renderer.info.render.calls} draws · bolts ${bolts}
fog ${l.fog.toFixed(2)} rain ${l.rain.toFixed(2)} thunder ${l.thunder.toFixed(2)}
snow ${l.snow.toFixed(2)} ash ${l.ash.toFixed(2)} calm ${l.calm.toFixed(2)}
night ${l.night.toFixed(2)} flash ${l.flash.toFixed(2)} ice ${weather.icing.value.toFixed(2)} wet ${weather.wetness.value.toFixed(2)}`;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
void paused;

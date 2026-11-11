import { WebGPURenderer } from 'three/webgpu';
import { createEnvironment, updateEnvironment } from './environment';
import { createFly } from './fly';
import { createFrame } from './frame';
import { createMeter } from './meter';
import { addProbe } from './probe';

const meterEl = document.getElementById('meter')!;

if (!navigator.gpu) {
  meterEl.textContent = 'no WebGPU';
  throw new Error('WebGPU unavailable');
}

const renderer = new WebGPURenderer({ antialias: false, trackTimestamp: true });
renderer.setPixelRatio(1);
document.body.appendChild(renderer.domElement);
await renderer.init();

const env = createEnvironment();
// Debug: ?t=hours sets the time of day (at longitude 0); ?wind=m/s the wind's speed; ?haze= the air's aerosol;
// ?lat=&lon= degrees put the camera over a point of the planet and ?alt= metres above the sea; ?yaw=deg turns it
// (clockwise from north: 90 east) and ?look=deg pitches it. The planet is 554 m in radius, so a degree is 9.67 m;
// the island's centre is at lat 12, lon 0, its coast about 70 m (7°) from it.
const params = new URLSearchParams(location.search);
const number = (name: string, fallback: number) => (params.has(name) ? Number(params.get(name)) : fallback);
if (params.has('t')) env.timeOfDay = Number(params.get('t'));
if (params.has('haze')) env.haze = Number(params.get('haze'));
if (params.has('wind')) env.wind.setLength(Number(params.get('wind')));
const frame = createFrame(renderer);
const meter = createMeter(renderer, meterEl);
const degrees = Math.PI / 180;
const fly = createFly(frame.camera, renderer.domElement, {
  lat: number('lat', -3.5) * degrees,
  lon: number('lon', 0) * degrees,
  height: number('alt', 10),
  bearing: number('yaw', 0) * degrees,
  pitch: number('look', -6) * degrees,
});
fly(0);
frame.camera.updateMatrixWorld();
if (params.has('probe')) addProbe(frame.scene, frame.sky.light, frame.camera.position);

frame.resize(innerWidth, innerHeight);
addEventListener('resize', () => frame.resize(innerWidth, innerHeight));

let last = performance.now();
renderer.setAnimationLoop(() => {
  const start = performance.now();
  const dt = Math.min((start - last) / 1000, 0.1);
  last = start;

  fly(dt);
  updateEnvironment(env, dt);
  frame.render(env, dt);

  meter.sample(performance.now() - start);
});

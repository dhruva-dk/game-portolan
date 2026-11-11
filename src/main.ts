import { WebGPURenderer } from 'three/webgpu';
import { createEnvironment, updateEnvironment } from './environment';
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
// Debug: ?t=hours sets the time of day; ?wind=m/s the wind's speed; ?look=deg pitches and ?yaw=deg turns the camera
// (0 north, 90 west); ?x=&y=&z= metres move it (the island lies 300 m north, at z = −300).
const params = new URLSearchParams(location.search);
if (params.has('t')) env.timeOfDay = Number(params.get('t'));
if (params.has('haze')) env.haze = Number(params.get('haze'));
if (params.has('wind')) env.wind.setLength(Number(params.get('wind')));
const frame = createFrame(renderer);
const meter = createMeter(renderer, meterEl);
if (params.has('probe')) addProbe(frame.scene, frame.sky.reflect);

frame.resize(innerWidth, innerHeight);
for (const axis of ['x', 'y', 'z'] as const) if (params.has(axis)) frame.camera.position[axis] = Number(params.get(axis));
frame.camera.rotation.set((Number(params.get('look') ?? -6) * Math.PI) / 180, (Number(params.get('yaw') ?? 0) * Math.PI) / 180, 0, 'YXZ');
addEventListener('resize', () => frame.resize(innerWidth, innerHeight));

let last = performance.now();
renderer.setAnimationLoop(() => {
  const start = performance.now();
  const dt = Math.min((start - last) / 1000, 0.1);
  last = start;

  updateEnvironment(env, dt);
  frame.render(env, dt);

  meter.sample(performance.now() - start);
});

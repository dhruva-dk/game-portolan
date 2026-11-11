import { WebGPURenderer } from 'three/webgpu';
import { createEnvironment, updateEnvironment } from './environment';
import { createFrame } from './frame';
import { createMeter } from './meter';

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
const frame = createFrame(renderer);
const meter = createMeter(renderer, meterEl);

frame.resize(innerWidth, innerHeight);
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

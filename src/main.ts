import { WebGPURenderer } from 'three/webgpu';
import { createEnvironment, updateEnvironment } from './environment';
import { createFly } from './fly';
import { createFrame } from './frame';
import { createMeter } from './meter';
import { addProbe } from './probe';
import { SEED } from './world/planet';
import { along, frameAt, scale, toChart } from './world/sphere';

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
// ?cloud= the cloud cover (0–1); ?seed= the planet's (world/planet.ts; SEED by default); ?lat=&lon= degrees put the camera over a point of the
// planet and ?alt= metres above the sea; ?yaw=deg turns it (clockwise from north: 90 east) and ?look=deg pitches it.
// The planet is 554 m in radius, so a degree is 9.67 m. By default the camera starts on the water south of the
// largest island, START metres off its coast, looking north at it (for seed 3 the island's centre is at lat 8.7,
// lon −11.6, its coast about 69 m out). `node tools/planet-map.ts <seed>` charts a planet and lists its islands.
const params = new URLSearchParams(location.search);
const number = (name: string, fallback: number) => (params.has(name) ? Number(params.get(name)) : fallback);
if (params.has('t')) env.timeOfDay = Number(params.get('t'));
if (params.has('haze')) env.haze = Number(params.get('haze'));
if (params.has('wind')) env.windSpeed = Number(params.get('wind'));
if (params.has('cloud')) env.cloudCoverage = Number(params.get('cloud'));
// ?debug=charts colours the sea by its charts' weights
const frame = createFrame(renderer, number('seed', SEED), params.get('debug') ?? '');
const meter = createMeter(renderer, meterEl);
const degrees = Math.PI / 180;
const START = 80;
const largest = frame.planet.islands[0], southward = scale(frameAt(largest.chart.at).north, -1);
const [cx, cz] = toChart(largest.chart, along(largest.chart.at, southward, 1).p);
const south = along(largest.chart.at, southward, largest.coast(Math.atan2(cz, cx)) + START).p;
const fly = createFly(frame.camera, renderer.domElement, {
  lat: params.has('lat') ? number('lat', 0) * degrees : Math.asin(south[1]),
  lon: params.has('lon') ? number('lon', 0) * degrees : Math.atan2(-south[2], south[0]),
  height: number('alt', 10),
  bearing: number('yaw', 0) * degrees,
  pitch: number('look', -6) * degrees,
});
fly(0);
frame.camera.updateMatrixWorld();
if (params.has('probe')) addProbe(frame.scene, frame.sky.light, frame.camera.position);

console.info(`ground baked in ${(await frame.ready).toFixed(0)} ms`);
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

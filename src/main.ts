import { WebGPURenderer } from 'three/webgpu';
import { createEnvironment, updateEnvironment } from './environment';
import { createFly } from './fly';
import { createFrame } from './frame';
import { createMeter } from './meter';
import { createGame } from './play/game';
import { addProbe } from './probe';
import { SEED } from './world/planet';
import { R, add, along, cross, dot, frameAt, normalize, scale, toChart, type Vec3 } from './world/sphere';

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
// The planet is 554 m in radius, so a degree is 9.67 m. By default the player's ship lies on the water south of the
// largest island, START metres off its coast, heading north toward it, the chase camera behind her (play/game.ts;
// ?drive= sails a debug drive first). ?fly, or any of lat, lon and alt, flies the debug camera (fly.ts) instead,
// starting there by default (for seed 3 the island's centre is at lat 8.7, lon −11.6, its coast about 69 m out).
// `node tools/planet-map.ts <seed>` charts a planet and lists its islands.
const params = new URLSearchParams(location.search);
const number = (name: string, fallback: number) => (params.has(name) ? Number(params.get(name)) : fallback);
if (params.has('t')) env.timeOfDay = Number(params.get('t'));
if (params.has('haze')) env.haze = Number(params.get('haze'));
if (params.has('wind')) env.windSpeed = Number(params.get('wind'));
if (params.has('cloud')) env.cloudCoverage = Number(params.get('cloud'));
// ?debug=charts colours the sea by its charts' weights; ?debug=wake shows the ships' marks on it (water/wake.ts)
const frame = createFrame(renderer, number('seed', SEED), params.get('debug') ?? '');
const meter = createMeter(renderer, meterEl);
const degrees = Math.PI / 180;
const START = 80;
const largest = frame.planet.islands[0], southward = scale(frameAt(largest.chart.at).north, -1);
const [cx, cz] = toChart(largest.chart, along(largest.chart.at, southward, 1).p);
const south = along(largest.chart.at, southward, largest.coast(Math.atan2(cz, cx)) + START).p;
const flying = params.has('fly') || ['lat', 'lon', 'alt'].some((k) => params.has(k));
function flyer() {
  const fly = createFly(frame.camera, renderer.domElement, {
    lat: params.has('lat') ? number('lat', 0) * degrees : Math.asin(south[1]),
    lon: params.has('lon') ? number('lon', 0) * degrees : Math.atan2(-south[2], south[0]),
    height: number('alt', 10),
    bearing: number('yaw', 0) * degrees,
    pitch: number('look', -6) * degrees,
  });
  return (dt: number) => {
    fly(dt);
    env.clock += dt;
  };
}
const move = flying ? flyer() : createGame(frame, env, renderer.domElement, { at: south, bearing: 0 }, params.get('drive') ?? '');
move(0);
frame.camera.updateMatrixWorld();
if (params.has('probe')) addProbe(frame.scene, frame.sky.light, frame.camera.position);

// ---- SCAFFOLDING (ships demo, until ships are placed for real): ?ships=N sets N galleons on the sea ahead of the
// default camera (south of the largest island, looking north) — 30, 60, 100, 150 m out and on past — at rest on the
// mean sea, each on her own heading and in her own colours (after the player's ship, in the game view); ?lod=0…3 draws
// them all at one level of detail.
{
  const ships = Math.min(number('ships', 0), flying ? 16 : 15), first = flying ? 0 : 1, { up, north } = frameAt(south);
  const paints: Vec3[] = [[0.3, 0.03, 0.02], [0.03, 0.06, 0.2], [0.42, 0.28, 0.05], [0.03, 0.14, 0.06], [0.02, 0.02, 0.02]];
  const sails: Vec3[] = [[0.62, 0.57, 0.46], [0.7, 0.68, 0.6], [0.5, 0.38, 0.25]];
  for (let i = 0; i < ships; i++) {
    const out = [30, 60, 100, 150][i] ?? 150 + (i - 3) * 40, side = i < 4 ? [0, -12, 25, -40][i] : (i % 2 ? 1 : -1) * 30 * i;
    const p = along(along(up, north, out).p, cross(north, up), side).p, u = normalize(p);
    const t = normalize(add(north, u, -dot(north, u))), heading = [1.9, -0.6, 2.8, 0.9][i % 4] + i;
    const forward = add(scale(t, Math.cos(heading)), cross(u, t), Math.sin(heading));
    frame.fleet.set(first + i, { position: scale(u, R), forward, up: u }, {
      paint: paints[i % paints.length], sail: sails[i % sails.length], band: i % 3 === 1, brace: ((i % 5) - 2) * 0.2,
    });
  }
  if (params.has('lod')) frame.fleet.pin(number('lod', 0));
}
// ---- end SCAFFOLDING

console.info(`ground baked in ${(await frame.ready).toFixed(0)} ms`);
frame.resize(innerWidth, innerHeight);
addEventListener('resize', () => frame.resize(innerWidth, innerHeight));

let last = performance.now();
renderer.setAnimationLoop(() => {
  const start = performance.now();
  const dt = Math.min((start - last) / 1000, 0.1);
  last = start;

  move(dt);
  const { x, y, z } = frame.camera.position;
  updateEnvironment(env, dt, [x, y, z], frame.wind);
  frame.render(env, dt);

  meter.sample(performance.now() - start);
});

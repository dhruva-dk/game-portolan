import { WebGPUCoordinateSystem, WebGPURenderer } from 'three/webgpu';
import { DEBUG, demoShips, flyer, probe, safeArea, switches } from './debug';
import { createEnvironment, updateEnvironment } from './environment';
import { createFrame } from './frame';
import { createMeter } from './meter';
import { createGame } from './play/game';
import { createPlaceholder } from './play/placeholder';
import { traceCoasts } from './ui/coasts';
import { createHud } from './ui/hud';
import { uiLayer } from './ui/ui';
import { sunPlaces } from './world/sun';
import { createWeather } from './world/weather';
import { along, frameAt, scale, toChart } from './world/sphere';

const meterEl = document.getElementById('meter')!;

if (!navigator.gpu) {
  meterEl.textContent = 'no WebGPU';
  throw new Error('WebGPU unavailable');
}

const renderer = new WebGPURenderer({ antialias: false, trackTimestamp: DEBUG });
document.body.appendChild(renderer.domElement);
await renderer.init();
// three's WebGPURenderer always installs a WebGL 2 fallback and takes it, with only a warning, when WebGPU gives it no
// adapter or device (no option turns that off); this game is WebGPU's alone, so that is a failure
if (renderer.coordinateSystem !== WebGPUCoordinateSystem) {
  meterEl.textContent = 'no WebGPU';
  throw new Error('WebGPU unavailable: three fell back to WebGL');
}

// The debug switches (?t=, ?seed=, ?fly, ?ships=, ...) are debug.ts's; in a release build they all read as defaults.
const frame = createFrame(renderer, switches.seed, switches.view);
const { mean, swing } = switches.weather;
const env = createEnvironment(sunPlaces(frame.planet.islands), createWeather(switches.seed, mean, swing), mean.wind);
if (switches.time !== null) env.timeOfDay = switches.time;
const meter = switches.meter ? createMeter(renderer, meterEl) : null;

// The player's ship lies on the water south of the largest island, START metres off its coast, heading north toward
// it, the chase camera behind her (play/game.ts).
const START = 80;
const largest = frame.planet.islands[0], southward = scale(frameAt(largest.chart.at).north, -1);
const [cx, cz] = toChart(largest.chart, along(largest.chart.at, southward, 1).p);
const south = along(largest.chart.at, southward, largest.coast(Math.atan2(cz, cx)) + START).p;

const others = demoShips(frame, south);
const game = switches.flying ? null : createGame(frame, env, renderer.domElement, { at: south, bearing: 0 }, switches.drive, others);
const move = game ?? flyer(frame, renderer.domElement, env, south);
move(0);
frame.camera.updateMatrixWorld();
probe(frame);

// The match's HUD over the world, fed by the game and, where the sim has nothing yet, the placeholder.
const placeholder = createPlaceholder(frame.planet.islands);
const layer = uiLayer();
safeArea(layer);
const hud = game && createHud(layer, traceCoasts(frame.planet.islands), {
  slot: (i) => placeholder.choose(i),
  gust: () => {},
  map: () => {},
});

console.info(`ground baked in ${(await frame.ready).toFixed(0)} ms`);
frame.resize(innerWidth, innerHeight);
addEventListener('resize', () => frame.resize(innerWidth, innerHeight));

let last = performance.now();
renderer.setAnimationLoop(() => {
  const start = performance.now();
  const dt = Math.min((start - last) / 1000, 0.1);
  last = start;

  move(dt);
  if (game && hud) hud.update(placeholder.state(game.status(), dt));
  const { x, y, z } = frame.camera.position;
  updateEnvironment(env, dt, [x, y, z], frame.wind);
  frame.render(env, dt);

  meter?.sample(performance.now() - start);
});

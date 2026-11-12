import { WebGPUCoordinateSystem, WebGPURenderer } from 'three/webgpu';
import { DEBUG, demoShips, flyer, probe, safeArea, switches } from './debug';
import { createEnvironment, updateEnvironment } from './environment';
import { createFrame } from './frame';
import { createStorm } from './sim/storm';
import { createMeter } from './meter';
import { createGame } from './play/game';
import { createPlaceholder } from './play/placeholder';
import { traceCoasts } from './ui/coasts';
import { createGlobe } from './ui/globe';
import { createFlow, isScreen, type Screen } from './ui/flow';
import { createHud, type HudState } from './ui/hud';
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
// The storm's safe cap by the match's clock (sim/storm.ts); ?storm=seconds holds it
const storm = createStorm(switches.seed, (p) => -frame.planet.height(p));
const START = 80;
const largest = frame.planet.islands[0], southward = scale(frameAt(largest.chart.at).north, -1);
const [cx, cz] = toChart(largest.chart, along(largest.chart.at, southward, 1).p);
const south = along(largest.chart.at, southward, largest.coast(Math.atan2(cz, cx)) + START).p;

const others = demoShips(frame, south);
// the match: its storm on its own clock, the bots' minds from its seed (the planet's, until matches are dealt)
const match = { seed: switches.seed, storm: (t: number) => storm(switches.storm ?? t), gun: switches.gun };
const game = switches.flying ? null : createGame(frame, env, renderer.domElement, { at: south, bearing: 0 }, switches.drive, others, match);
const move = game ?? flyer(frame, renderer.domElement, env, south);
move(0);
frame.camera.updateMatrixWorld();
probe(frame);

// The match's HUD over the world, fed by the game and, where the sim has nothing yet, the placeholder.
const placeholder = createPlaceholder();
const layer = uiLayer();
safeArea(layer);
const coasts = traceCoasts(frame.planet.islands);
const globe = createGlobe(coasts);
let shown: HudState | null = null;
const hud = createHud(layer, coasts, {
  slot: (i) => placeholder.choose(i),
  gust: () => {},
  fire: () => game?.fire(),
  map: () => shown && globe.show(shown),
});
// a release build opens at the title; the dev server at sea, unless ?screen= says otherwise (also map, rank, settings)
const start = switches.screen ?? (DEBUG ? 'match' : 'title');
const opens: Record<string, Screen | undefined> = { map: 'match', rank: 'lobby', settings: 'lobby' };
const flow = game ? createFlow(hud, globe, placeholder.career, isScreen(start) ? start : opens[start] ?? 'match') : null;
if (!game) hud.root.style.display = 'none';
if (start === 'rank' || start === 'settings') flow?.open(start);
if (start === 'result') flow?.end(4);
let opening = start === 'map';

console.info(`ground baked in ${(await frame.ready).toFixed(0)} ms`);
flow?.ready();
frame.resize(innerWidth, innerHeight);
addEventListener('resize', () => frame.resize(innerWidth, innerHeight));

let last = performance.now();
renderer.setAnimationLoop(() => {
  const start = performance.now();
  const dt = Math.min((start - last) / 1000, 0.1);
  last = start;

  move(dt);
  if (game && flow) {
    shown = placeholder.state(game.status());
    flow.update(dt, shown);
    if (opening) globe.show(shown);
    opening = false;
  }
  const { x, y, z } = frame.camera.position;
  updateEnvironment(env, dt, [x, y, z], frame.wind);
  // the world from the game's camera, or, while the full map is open, from its eye out in space
  const cap = game?.storm() ?? storm(switches.storm ?? env.clock);
  frame.render(env, dt, cap, globe.step(dt, cap));

  meter?.sample(performance.now() - start);
});

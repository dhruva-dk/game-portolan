import { WebGPUCoordinateSystem, WebGPURenderer } from 'three/webgpu';
import { DEBUG, demoShips, flyer, probe, safeArea, switches } from './debug';
import { createWorld } from './environment';
import { createFrame } from './frame';
import { createMeter } from './meter';
import { createGame } from './play/game';
import { createPlaceholder } from './play/placeholder';
import { createReferee } from './play/referee';
import { createMatches, startOf } from './play/setup';
import { PLAYER } from './sim/match';
import { chart as bakeChart } from './sim/route';
import { traceCoasts } from './ui/coasts';
import { createGale } from './ui/gale';
import { createGlobe } from './ui/globe';
import { createFlow, IN_MATCH, isScreen, type Screen } from './ui/flow';
import { createHud, type HudState } from './ui/hud';
import { uiLayer } from './ui/ui';
import { fromLatLon } from './world/sphere';

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
// The world, built once and handed to the frame that draws it and the game that runs on it.
const world = createWorld(switches.seed, switches.weather.mean, switches.weather.swing, switches.time ?? 15);
const start = startOf(world.planet);
const frame = createFrame(renderer, world, { view: switches.view, lod: switches.lod, cloth: switches.cloth, extras: probe(start.at) });
const meter = switches.meter ? createMeter(renderer, meterEl) : null;

const others = demoShips(start.at);
const matches = createMatches(switches.seed, world.planet, switches.storm, switches.gun);
// the bots' chart of open water, for routes round land (sim/route.ts): baked while the ground's worker bakes
// (frame.ready), in about a fifth of its time, so it holds back no frame
const charted = performance.now(), chart = bakeChart((p) => -world.planet.height(p));
console.info(`chart baked in ${(performance.now() - charted).toFixed(0)} ms`);
const game = switches.flying ? null : createGame(world, frame.anchors, chart, renderer.domElement, start, switches.drive, others, matches.first);
const referee = game ? createReferee(game) : null;
const source = game ?? flyer(renderer.domElement, start.at, others, matches.storm);

// The match's HUD over the world, fed by the game and, where the sim has nothing yet, the placeholder.
const placeholder = createPlaceholder();
const layer = uiLayer();
safeArea(layer);
const coasts = traceCoasts(world.planet.islands);
const globe = createGlobe(coasts);
let shown: HudState | null = null;
const hud = createHud(layer, coasts, {
  slot: (i) => placeholder.choose(i),
  gust: () => {},
  fire: () => game?.fire(),
  map: () => shown && globe.show(shown),
});
const gale = createGale(coasts, { dive: () => game?.dive(), map: () => shown && globe.show(shown) });
// a release build opens at the title; the dev server at sea, unless ?screen= says otherwise (also map, rank, settings)
const opening = switches.screen ?? (DEBUG ? 'match' : 'title');
const opens: Record<string, Screen | undefined> = { map: 'match', rank: 'lobby', settings: 'lobby' };
const first = isScreen(opening) ? opening : opens[opening] ?? 'match';
const flow = game && referee ? createFlow(hud, globe, gale, placeholder.career, first, {
  play() {
    game.drop(matches.deal());
    referee.begin(true);
  },
  home() {
    referee.end();
    game.anchor();
  },
  skip: () => referee.tap(),
}) : null;
if (!game) hud.root.style.display = 'none';
if (opening === 'rank' || opening === 'settings') flow?.open(opening);
if (opening === 'result') flow?.end(4);
// the match the page opens on: at sea with the debug ships (the dev server's default), in the Gale, or at its end
if (game && referee) {
  if (first === 'title' || first === 'lobby') game.anchor();
  else if (first === 'drop') {
    game.drop(matches.deal());
    referee.begin(true);
    if (switches.dive) game.dive();
    if (switches.mark) game.mark(fromLatLon(...(switches.mark.map((d) => (d * Math.PI) / 180) as [number, number])));
  } else if (first !== 'result') {
    referee.begin(false);
    if (first === 'spectate') game.scuttle(PLAYER, others.length ? 1 : null);
    if (first === 'won') others.forEach((_, i) => game.scuttle(i + 1, PLAYER));
  }
  for (let t = 0; t < switches.ahead; t += 0.1) {
    game.step(0.1);
    referee.update(0.1);
  }
}
let mapping = opening === 'map';
/** The match's screens follow its course (sim/match.ts); its end shows her place. */
const SHOWS = { dropping: 'drop', fighting: 'match', spectating: 'spectate', won: 'won' } as const;

console.info(`ground baked in ${(await frame.ready).toFixed(0)} ms`);
flow?.ready();
frame.resize(innerWidth, innerHeight);
addEventListener('resize', () => frame.resize(innerWidth, innerHeight));

let last = performance.now();
renderer.setAnimationLoop(() => {
  const now = performance.now();
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;

  source.step(dt);
  if (game && flow && referee) {
    const m = referee.update(dt);
    if (m?.done) {
      referee.end();
      flow.end(m.place ?? 1);
    } else if (m && IN_MATCH.includes(flow.screen) && flow.screen !== SHOWS[m.phase]) flow.go(SHOWS[m.phase]);
    shown = placeholder.state(game.status());
    const d = game.dropping();
    flow.update(dt, shown, d && { ...d, at: shown.at, heading: shown.heading });
    if (mapping) globe.show(shown);
    mapping = false;
  }
  // the world as the game (or the flyer) has it, seen from its eye or, while the full map is open, from the map's
  const scene = source.snapshot();
  frame.render({ ...scene, eye: globe.step(dt, scene.storm) ?? scene.eye }, dt);

  meter?.sample(performance.now() - now);
});

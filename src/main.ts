// The page: the world built once and the frame that draws it (stage), the game on it with the UI over it (play), and
// a frame drawn each time the screen is ready for one. How it is set up is the release's (RELEASE), and it opens at the
// title; only the page's debug switches change either (debug.ts scenario, the one way in).

import { WebGPUCoordinateSystem, WebGPURenderer } from 'three/webgpu';
import { createAudio } from './audio/audio';
import { scenario, type Played, type Setup, type Stage } from './debug';
import { createWorld } from './environment';
import { createFrame } from './frame';
import { loaded } from './load';
import { createMeter } from './meter';
import { createGame } from './play/game';
import { createPlaceholder } from './play/placeholder';
import { createReferee } from './play/referee';
import { createMatches, watersOf } from './play/setup';
import { SHIP } from './sim/handling';
import { SHIPS } from './sim/match';
import type { Snapshot } from './snapshot';
import { shoresOf } from './ui/coasts';
import { createGlobe } from './ui/globe';
import { createFlow } from './ui/flow';
import { createHud, type HudState } from './ui/hud';
import { createInput } from './ui/input';
import { createStick } from './ui/stick';
import { uiLayer } from './ui/ui';
import { SEED } from './world/planet';
import { MEAN, SWING } from './world/weather';

/** The release's setup. */
const RELEASE: Setup = {
  seed: SEED, land: 'islands', mean: MEAN, swing: SWING, hours: 16.3,
  drawing: { sea: 'water', fleet: SHIPS, length: SHIP.length, lod: null, cloth: true, bolt: false },
  meter: false, hold: null, gun: null,
};

loaded('script');

const meterEl = document.getElementById('meter')!;
/** Says so in the meter's corner, shown. */
const say = (text: string) => {
  meterEl.hidden = false;
  meterEl.textContent = text;
};

/** The world built on a setup, the frame that draws it, and the matches dealt on it. */
async function stage(setup: Setup): Promise<Stage> {
  if (!navigator.gpu) {
    say('no WebGPU');
    throw new Error('WebGPU unavailable');
  }
  // timestamps always: the stats may be switched on at any time (settings), and the meter resolves them every frame
  const renderer = new WebGPURenderer({ antialias: false, trackTimestamp: true });
  document.body.appendChild(renderer.domElement);
  await renderer.init();
  // three's WebGPURenderer always installs a WebGL 2 fallback and takes it, with only a warning, when WebGPU gives it
  // no adapter or device (no option turns that off); this game is WebGPU's alone, so that is a failure
  if (renderer.coordinateSystem !== WebGPUCoordinateSystem) {
    say('no WebGPU');
    throw new Error('WebGPU unavailable: three fell back to WebGL');
  }
  loaded('gpu');

  // The world, built once and handed to the frame that draws it and the game that runs on it.
  const world = createWorld(setup.seed, setup.land, setup.mean, setup.swing, setup.hours);
  loaded('world');
  const frame = createFrame(renderer, world, setup.drawing);
  loaded('frame');
  // the frame's cost: always shown on the debug page, split by pass there; else as the settings' stats switch has it
  const meter = createMeter(renderer, meterEl, setup.meter);
  meter.show(setup.meter);

  return {
    world, start: world.planet.start, canvas: renderer.domElement, anchors: frame.anchors, ready: frame.ready,
    stats: (on) => meter.show(setup.meter || on),
    matches: createMatches(setup.seed, world.planet, setup.hold, setup.gun),
    async draw(next: (dt: number) => Snapshot, drawn?: (canvas: HTMLCanvasElement) => void) {
      console.info(`ground baked in ${(await frame.ready).toFixed(0)} ms`);
      frame.resize(innerWidth, innerHeight);
      addEventListener('resize', () => frame.resize(innerWidth, innerHeight));
      let last = performance.now(), first = true;
      renderer.setAnimationLoop(() => {
        const now = performance.now();
        const dt = Math.min((now - last) / 1000, 0.1);
        last = now;
        const snapshot = next(dt), begun = performance.now();
        frame.render(snapshot, dt);
        const rendered = performance.now() - begun;
        drawn?.(renderer.domElement);
        meter.sample(performance.now() - now, rendered);
        if (first) loaded('first frame');
        first = false;
      });
    },
  };
}

/** The game on the stage, opening on the lobby's quiet sea, and its UI over the world, at the title. */
async function play(s: Stage): Promise<Played> {
  // the water sounded, for the bots' routes round land (sim/route.ts) and the ships' berths (sim/spawn.ts): in a
  // worker while the ground's bakes in another (frame.ready), in a fraction of its time
  const { waters, ms, berth } = await watersOf(s.world.seed, s.world.land);
  console.info(`water sounded in ${ms.toFixed(0)} ms`);
  loaded('sounded');
  // (each match's berths worked out in that worker ahead of PLAY)
  s.matches.berthBy(berth);
  const game = createGame(s.world, s.anchors, waters, s.start, s.matches.first);
  const referee = createReferee(game);

  // Her hands on the canvas, the stick drawn under the UI; the match's HUD over the world, fed by the game; her career
  // by what stands in for it (play/placeholder.ts: pending).
  const input = createInput(s.canvas, () => game.steering());
  const layer = uiLayer();
  const stick = createStick(layer);
  const pending = createPlaceholder();
  const shores = shoresOf(s.world.planet, s.world.land);
  const globe = createGlobe(shores.coasts);
  const hudState = (): HudState => ({ ...game.status(s.canvas.clientWidth, s.canvas.clientHeight), ...game.kit() });
  const map = () => globe.show(hudState());
  const hud = createHud(layer, shores, { slot: input.tap, gust: input.gust, fire: input.fire, map });
  // the sound, begun on her first touch; a tick for each tap on something of the UI's
  const audio = createAudio(s.world.planet.height);
  layer.addEventListener('pointerdown', (e) => {
    if (e.target instanceof Element && e.target.closest('.press')) audio.tap(flow.screen);
  }, true);
  const deal = () => {
    game.start(s.matches.deal());
    referee.begin();
  };
  const flow = createFlow(hud, globe, { now: pending.career, credit: pending.credit }, 'title', {
    play: deal,
    home() {
      referee.end();
      game.anchor();
    },
    watch: () => referee.watch(),
    switch: (by) => referee.switch(by),
  });
  void s.ready.then(() => {
    flow.ready();
    loaded('title');
  });
  loaded('play');

  return {
    game, referee, flow, play: deal, map,
    // the full map just opened, or a cross-fade waiting, holds the game's frame the moment it is drawn; the way home
    // counts the lobby's frames
    drawn: (canvas) => flow.drawn(canvas),
    next(dt: number): Snapshot {
      const hands = input.read();
      stick(game.steering() ? hands.stick : null);
      game.step(dt, hands);
      // her end, sunk or won, as the screens follow it
      flow.end(referee.update(dt));
      // the world as the game has it, seen from its eye or, while the full map is open, from the map's
      const scene = game.snapshot(), status = hudState();
      flow.update(dt, status, scene.sea, scene.own);
      // heard from the game's eye, even with the full map open over it; the sea going as the screens cover it
      audio.update({ scene, status, screen: flow.screen, map: globe.open, covered: flow.covered }, flow.settings.sound, dt);
      s.stats(flow.settings.stats);
      return { ...scene, eye: globe.step(dt, scene.storm) ?? scene.eye };
    },
  };
}

await scenario(RELEASE, stage, play);

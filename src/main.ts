// The page: the world built once and the frame that draws it (stage), the game on it with the UI over it (play), and
// a frame drawn each time the screen is ready for one. How it is set up is the release's (RELEASE), and it opens at the
// title; only the page's debug switches change either (debug.ts scenario, the one way in).

import { WebGPUCoordinateSystem, WebGPURenderer } from 'three/webgpu';
import { scenario, type Played, type Setup, type Stage } from './debug';
import { createWorld } from './environment';
import { createFrame } from './frame';
import { createMeter } from './meter';
import { createGame } from './play/game';
import { createPlaceholder } from './play/placeholder';
import { createReferee } from './play/referee';
import { createMatches, startOf, watersOf } from './play/setup';
import { SHIPS } from './sim/match';
import type { Snapshot } from './snapshot';
import { traceCoasts } from './ui/coasts';
import { createGlobe } from './ui/globe';
import { createFlow, IN_MATCH } from './ui/flow';
import { createHud, type HudState } from './ui/hud';
import { createInput } from './ui/input';
import { createStick } from './ui/stick';
import { uiLayer } from './ui/ui';
import { SEED } from './world/planet';
import { MEAN, SWING } from './world/weather';

/** The release's setup. */
const RELEASE: Setup = {
  seed: SEED, mean: MEAN, swing: SWING, hours: 16.3,
  drawing: { sea: 'water', fleet: SHIPS, lod: null, cloth: true },
  meter: false, hold: null, gun: null,
};

const meterEl = document.getElementById('meter')!;

/** The world built on a setup, the frame that draws it, and the matches dealt on it. */
async function stage(setup: Setup): Promise<Stage> {
  if (!navigator.gpu) {
    meterEl.textContent = 'no WebGPU';
    throw new Error('WebGPU unavailable');
  }
  const renderer = new WebGPURenderer({ antialias: false, trackTimestamp: setup.meter });
  document.body.appendChild(renderer.domElement);
  await renderer.init();
  // three's WebGPURenderer always installs a WebGL 2 fallback and takes it, with only a warning, when WebGPU gives it
  // no adapter or device (no option turns that off); this game is WebGPU's alone, so that is a failure
  if (renderer.coordinateSystem !== WebGPUCoordinateSystem) {
    meterEl.textContent = 'no WebGPU';
    throw new Error('WebGPU unavailable: three fell back to WebGL');
  }

  // The world, built once and handed to the frame that draws it and the game that runs on it.
  const world = createWorld(setup.seed, setup.mean, setup.swing, setup.hours);
  const frame = createFrame(renderer, world, setup.drawing);
  const meter = setup.meter ? createMeter(renderer, meterEl) : null;

  return {
    world, start: startOf(world.planet), canvas: renderer.domElement, anchors: frame.anchors, ready: frame.ready,
    matches: createMatches(setup.seed, world.planet, setup.hold, setup.gun),
    async draw(next: (dt: number) => Snapshot, drawn?: (canvas: HTMLCanvasElement) => void) {
      console.info(`ground baked in ${(await frame.ready).toFixed(0)} ms`);
      frame.resize(innerWidth, innerHeight);
      addEventListener('resize', () => frame.resize(innerWidth, innerHeight));
      let last = performance.now();
      renderer.setAnimationLoop(() => {
        const now = performance.now();
        const dt = Math.min((now - last) / 1000, 0.1);
        last = now;
        frame.render(next(dt), dt);
        drawn?.(renderer.domElement);
        meter?.sample(performance.now() - now);
      });
    },
  };
}

/** The match's screens follow its course (sim/match.ts); its end shows her place. */
const SHOWS = { fighting: 'match', spectating: 'spectate', won: 'won' } as const;

/** The game on the stage, opening on the lobby's quiet sea, and its UI over the world, at the title. */
async function play(s: Stage): Promise<Played> {
  // the water sounded, for the bots' routes round land (sim/route.ts) and the ships' berths (sim/spawn.ts): in a
  // worker while the ground's bakes in another (frame.ready), in a fraction of its time
  const { waters, ms } = await watersOf(s.world.seed);
  console.info(`water sounded in ${ms.toFixed(0)} ms`);
  const game = createGame(s.world, s.anchors, waters, s.start, s.matches.first);
  const referee = createReferee(game);

  // Her hands on the canvas, the stick drawn under the UI; the match's HUD over the world, fed by the game and, where
  // the game has nothing yet, by what stands in for it (play/placeholder.ts: pending).
  const input = createInput(s.canvas, () => game.steering());
  const layer = uiLayer();
  const stick = createStick(layer);
  const pending = createPlaceholder();
  const coasts = traceCoasts(s.world.planet.islands);
  const globe = createGlobe(coasts);
  const hudState = (): HudState => ({ ...game.status(), ...pending.kit() });
  const map = () => globe.show(hudState());
  const hud = createHud(layer, coasts, { slot: pending.choose, gust: pending.gust, fire: input.fire, map });
  const deal = () => {
    game.start(s.matches.deal());
    referee.begin();
  };
  const flow = createFlow(hud, globe, pending.career, 'title', {
    play: deal,
    home() {
      referee.end();
      game.anchor();
    },
    skip: () => referee.tap(),
  });
  void s.ready.then(() => flow.ready());

  return {
    game, referee, flow, play: deal, map,
    // the full map, just opened, holds the game's frame the moment it is drawn, to show round its panel
    drawn: (canvas) => globe.waiting && globe.hold(canvas),
    next(dt: number): Snapshot {
      const hands = input.read();
      stick(game.steering() ? hands.stick : null);
      game.step(dt, hands);
      const m = referee.update(dt);
      if (m?.done) {
        referee.end();
        flow.end(m.place ?? 1);
      } else if (m) {
        if (IN_MATCH.includes(flow.screen) && flow.screen !== SHOWS[m.phase]) flow.go(SHOWS[m.phase]);
        // sunk, by a ball, a ram or the storm alike: where she placed, over the ship she now watches
        if (m.phase === 'spectating' && m.place !== null) flow.sunk(m.place);
      }
      flow.update(dt, hudState());
      // the world as the game has it, seen from its eye or, while the full map is open, from the map's
      const scene = game.snapshot();
      return { ...scene, eye: globe.step(dt, scene.storm) ?? scene.eye };
    },
  };
}

await scenario(RELEASE, stage, play);

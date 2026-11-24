// The page: the world built once and the frame that draws it (stage), the game
// on it with the UI over it (play), and a frame drawn each time the screen is
// ready for one. How it is set up is the release's (RELEASE), and it opens at
// the title; only the page's debug switches change either (debug.ts scenario,
// the one way in, loaded only when debugging, so a release ships without it).

import { WebGPUCoordinateSystem, WebGPURenderer } from 'three/webgpu';
import { createAudio } from './audio/audio.ts';
import type { Hearing } from './audio/listen.ts';
import type { Played, Setup, Stage } from './debug.ts';

import { launched, roll, sail } from './address.ts';
import { linearToHex } from './colour.ts';
import { DYES } from './play/colours.ts';
import { SEED, createWorld } from './environment.ts';
import { createFrame } from './frame.ts';
import { loaded } from './load.ts';
import { createMeter } from './meter.ts';
import { fleetOf } from './play/fleet.ts';
import { createGame } from './play/game.ts';
import { surveyor } from './play/preview.ts';
import { createReferee } from './play/referee.ts';
import { createMatches, watersOf } from './play/setup.ts';
import { SHIPS } from './sim/match.ts';
import type { Snapshot } from './snapshot.ts';
import { shoresOf } from './ui/coasts.ts';
import { createGlobe } from './ui/globe.ts';
import { createFlow } from './ui/flow.ts';
import { createHud, type HudState } from './ui/hud.ts';
import { createTitle } from './ui/screens.ts';
import { createInput } from './ui/input.ts';
import { createStick } from './ui/stick.ts';
import { onPressed } from './ui/touch.ts';
import { onResize, uiLayer, view } from './ui/ui.ts';
import { seedOf } from './world/seeds.ts';
import { MEAN, SWING } from './world/weather.ts';

/**
 * Whether debugging is on: Vite's dev server, or ?debug in the page's query
 * (the one switch read here: the rest are debug.ts's, fetched only with it).
 */
const DEBUG =
  import.meta.env.DEV || new URLSearchParams(location.search).has('debug');

/**
 * The seed this page sails (address.ts): its ?seed=, or one rolled afresh; a
 * debug page with none stays on the planet the tools measure (SEED).
 */
const NAME = launched(() => (DEBUG ? String(SEED) : roll()));

/** The release's setup. */
const RELEASE: Setup = {
  seed: seedOf(NAME),
  name: NAME,
  mean: MEAN,
  swing: SWING,
  hours: 16.3,
  drawing: { sea: 'water', fleet: SHIPS, lod: null, cloth: true, bolt: false },
  meter: false,
  hold: null,
  gun: null,
};

loaded('script');

// the title, the one loading screen, painted first: the world's build holds the
// page some seconds, and till then there was only the page's bare parchment
const title = createTitle();
title.show(true, 0);
// (past the frame that paints it; a page opened unseen draws no frames, and
// goes on after a moment instead)
await new Promise((go) => {
  requestAnimationFrame(() => setTimeout(go));
  setTimeout(go, 250);
});
loaded('title shown');

const meterEl = document.getElementById('meter')!;
/** Says so in the meter's corner, shown. */
const say = (text: string) => {
  meterEl.hidden = false;
  meterEl.textContent = text;
};

/**
 * The world built on a setup, the frame that draws it, and the matches dealt on
 * it.
 */
async function stage(setup: Setup): Promise<Stage> {
  if (!navigator.gpu) {
    say('no WebGPU');
    throw new Error('WebGPU unavailable');
  }
  // timestamps always: the stats may be switched on at any time (settings), and
  // the meter resolves them every frame
  const renderer = new WebGPURenderer({
    antialias: false,
    trackTimestamp: true,
  });
  document.body.appendChild(renderer.domElement);
  await renderer.init();
  // three's WebGPURenderer always installs a WebGL 2 fallback and takes it,
  // with only a warning, when WebGPU gives it no adapter or device (no option
  // turns that off); this game is WebGPU's alone, so that is a failure
  if (renderer.coordinateSystem !== WebGPUCoordinateSystem) {
    say('no WebGPU');
    throw new Error('WebGPU unavailable: three fell back to WebGL');
  }
  loaded('gpu');

  // The world, built once and handed to the frame that draws it and the game
  // that runs on it.
  const world = createWorld(setup.seed, setup.mean, setup.swing, setup.hours);
  loaded('world');
  const frame = createFrame(renderer, world, setup.drawing);
  loaded('frame');
  // the frame's cost: always shown on the debug page, split by pass there; else
  // as the settings' stats switch has it
  const meter = createMeter(renderer, meterEl, setup.meter);
  meter.show(setup.meter);

  return {
    world,
    name: setup.name,
    start: world.planet.start,
    canvas: renderer.domElement,
    anchors: frame.anchors,
    ready: frame.ready,
    stats: (on) => meter.show(setup.meter || on),
    matches: createMatches(setup.seed, world.planet, setup.hold, setup.gun),
    async draw(
      next: (dt: number) => Snapshot,
      drawn?: (canvas: HTMLCanvasElement) => void
    ) {
      console.info(`ground baked in ${(await frame.ready).toFixed(0)} ms`);
      // the canvas the screen's size, as the UI's layer finds it (made first, if the debug page drew without it)
      uiLayer();
      const fit = () => frame.resize(view.w, view.h);
      fit();
      onResize(fit);
      let last = performance.now(),
        first = true;
      renderer.setAnimationLoop(() => {
        const now = performance.now();
        const dt = Math.min((now - last) / 1000, 0.1);
        last = now;
        const snapshot = next(dt);
        const begun = performance.now();
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
  // (the race's berths worked out in that worker ahead of PLAY)
  s.matches.berthRace(berth);
  const game = createGame(s.world, s.anchors, waters, s.start, s.matches.first);
  const referee = createReferee(game);

  // Her hands on the canvas, the stick drawn under the UI; the match's HUD over the world, fed by the game.
  const input = createInput(s.canvas, () => game.steering());
  const layer = uiLayer();
  const stick = createStick(layer);
  const shores = shoresOf(
    s.world.planet,
    s.world.coasts,
    s.world.land.stats.summit
  );
  const globe = createGlobe(shores.coasts);
  // what the HUD reads, the match's and her kit's in one object refilled each frame
  const status: HudState = Object.assign({}, game.status(), game.kit());
  const hudState = (): HudState =>
    Object.assign(status, game.status(view.w, view.h), game.kit());
  const map = () => globe.show(hudState());
  const hud = createHud(layer, shores, {
    slot: input.tap,
    gust: input.gust,
    fire: input.fire,
    map,
  });
  // the sound, begun on her first touch, hearing what it does in one object refilled each frame
  const audio = createAudio(s.world.planet.height);
  const survey = surveyor();
  const deal = () => {
    game.start(s.matches.race());
    referee.begin();
  };
  const flow = createFlow(
    hud,
    globe,
    'title',
    {
      play: deal,
      // home under the title, onto a new page: a new seed, or this one again
      home: () => sail(roll()),
      again: () => sail(s.name),
      watch: () => referee.watch(),
      switch: (by) => referee.switch(by),
      // the seed panel's: a seed's fleet at once, its planet surveyed in a worker as she types, a seed sailed
      seeds: {
        name: s.name,
        fleet: (name) => fleetOf(seedOf(name)),
        chart: survey,
        roll,
        sail,
      },
      // her livery's folio's: the set's dyes as the page shows them, hers worn on the game's ship
      wardrobe: {
        dyes: DYES.map((d) => ({
          name: d.name,
          dye: linearToHex(d.colour),
          mark: linearToHex(d.mark),
        })),
        worn: game.worn,
        wear: game.wear,
        broadside: game.broadside,
      },
    },
    title
  );
  // a tick for each tap on something of the UI's
  onPressed(layer, () => audio.tap(flow.screen));
  void s.ready.then(() => {
    flow.ready();
    loaded('title');
  });
  loaded('play');
  const hearing: Hearing = {
    scene: game.snapshot(),
    status,
    screen: flow.screen,
    map: false,
    covered: 0,
  };
  /** Whether the stats are shown, as last told the stage. */
  let stats: boolean | null = null;

  return {
    game,
    referee,
    flow,
    play: deal,
    map,
    // the full map just opened, or a cross-fade waiting, holds the game's frame the moment it is drawn; the way home
    // counts the lobby's frames
    drawn: (canvas) => flow.drawn(canvas),
    next(dt: number): Snapshot {
      const hands = input.read();
      stick(game.steering() ? hands.stick : null);
      game.step(dt, hands);
      // her end, sunk or won, as the screens follow it
      const end = referee.update(dt);
      flow.end(end);
      // the world as the game has it, seen from its eye or, while the full map is open, from the map's
      const scene = game.snapshot();
      flow.update(hudState(), scene.sea, scene.own);
      // heard from the game's eye, even with the full map open over it; the sea going as the screens cover it
      hearing.scene = scene;
      hearing.screen = flow.screen;
      hearing.map = globe.open;
      hearing.covered = flow.covered;
      audio.update(hearing, flow.settings.sound, dt);
      if (flow.settings.stats !== stats) s.stats((stats = flow.settings.stats));
      // (the game's snapshot is its own, refilled each frame: its eye is the map's while that is open)
      scene.eye = globe.step(dt, scene.storm) ?? scene.eye;
      return scene;
    },
  };
}

if (DEBUG) {
  const { scenario } = await import('./debug.ts');
  await scenario(RELEASE, stage, play, title);
} else {
  // as released: the game on the stage, opening at the title
  const s = await stage(RELEASE);
  const p = await play(s);
  await s.draw(p.next, p.drawn);
}

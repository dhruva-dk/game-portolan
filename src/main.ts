import { WebGPUCoordinateSystem, WebGPURenderer } from 'three/webgpu';
import { createAudio } from './audio/audio.ts';
import type { Hearing } from './audio/listen.ts';
import type { Played, Setup, Stage } from './debug.ts';

import { launched, roll, sail } from './address.ts';
import { linearToHex } from './color.ts';
import { DYES } from './play/colors.ts';
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

const DEBUG =
  import.meta.env.DEV || new URLSearchParams(location.search).has('debug');

const NAME = launched(() => (DEBUG ? String(SEED) : roll()));

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

const title = createTitle();
title.show(true, 0);
await new Promise((go) => {
  requestAnimationFrame(() => setTimeout(go));
  setTimeout(go, 250);
});
loaded('title shown');

const meterEl = document.getElementById('meter')!;
const say = (text: string) => {
  meterEl.hidden = false;
  meterEl.textContent = text;
};

async function stage(setup: Setup): Promise<Stage> {
  if (!navigator.gpu) {
    say('no WebGPU');
    throw new Error('WebGPU unavailable');
  }
  const renderer = new WebGPURenderer({
    antialias: false,
    trackTimestamp: true,
  });
  document.body.appendChild(renderer.domElement);
  await renderer.init();
  if (renderer.coordinateSystem !== WebGPUCoordinateSystem) {
    say('no WebGPU');
    throw new Error('WebGPU unavailable: three fell back to WebGL');
  }
  loaded('gpu');

  const world = createWorld(setup.seed, setup.mean, setup.swing, setup.hours);
  loaded('world');
  const frame = createFrame(renderer, world, setup.drawing);
  loaded('frame');
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

async function play(s: Stage): Promise<Played> {
  const { waters, ms, berth } = await watersOf(s.world.seed, s.world.land);
  console.info(`water sounded in ${ms.toFixed(0)} ms`);
  loaded('sounded');
  s.matches.berthRace(berth);
  const game = createGame(s.world, s.anchors, waters, s.start, s.matches.first);
  const referee = createReferee(game);

  const input = createInput(s.canvas, () => game.steering());
  const layer = uiLayer();
  const stick = createStick(layer);
  const shores = shoresOf(
    s.world.planet,
    s.world.coasts,
    s.world.land.stats.summit
  );
  const globe = createGlobe(shores.coasts);
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
      home: () => sail(roll()),
      again: () => sail(s.name),
      watch: () => referee.watch(),
      switch: (by) => referee.switch(by),
      seeds: {
        name: s.name,
        fleet: (name) => fleetOf(seedOf(name)),
        chart: survey,
        roll,
        sail,
      },
      wardrobe: {
        dyes: DYES.map((d) => ({
          name: d.name,
          dye: linearToHex(d.color),
          mark: linearToHex(d.mark),
        })),
        worn: game.worn,
        wear: game.wear,
        broadside: game.broadside,
      },
    },
    title
  );
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
  let stats: boolean | null = null;

  return {
    game,
    referee,
    flow,
    play: deal,
    map,
    drawn: (canvas) => flow.drawn(canvas),
    next(dt: number): Snapshot {
      const hands = input.read();
      stick(game.steering() ? hands.stick : null);
      game.step(dt, hands);
      const end = referee.update(dt);
      flow.end(end);
      const scene = game.snapshot();
      flow.update(hudState(), scene.sea, scene.own);
      hearing.scene = scene;
      hearing.screen = flow.screen;
      hearing.map = globe.open;
      hearing.covered = flow.covered;
      audio.update(hearing, flow.settings.sound, dt);
      if (flow.settings.stats !== stats) s.stats((stats = flow.settings.stats));
      scene.eye = globe.step(dt, scene.storm) ?? scene.eye;
      return scene;
    },
  };
}

if (DEBUG) {
  const { scenario } = await import('./debug.ts');
  await scenario(RELEASE, stage, play, title);
} else {
  const s = await stage(RELEASE);
  const p = await play(s);
  await s.draw(p.next, p.drawn);
}

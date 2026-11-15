// The page: the world and the frame that draws it (stage), the game on it with the UI over it (play), and a frame drawn
// each time the screen is ready for one; on each way home from a race a new planet made in the old one's place
// (restage), the renderer, the UI and the sound made once and kept. How it is set up is the release's (RELEASE), and it opens at the
// title; only the page's debug switches change either (debug.ts scenario, the one way in).

import { WebGPUCoordinateSystem, WebGPURenderer } from 'three/webgpu';
import { createAudio } from './audio/audio';
import { scenario, type Played, type Setup, type Stage } from './debug';
import { createWorld } from './environment';
import { createFrame } from './frame';
import { createMeter } from './meter';
import { createGame } from './play/game';
import { createReferee } from './play/referee';
import { createRookeryView, type RookeryView } from './play/rookery';
import { createMatches, startOf, watersOf } from './play/setup';
import { SHIP } from './sim/handling';
import { RIDE } from './sim/ride';
import { createRookeryLabels, nearest } from './ui/rookery';
import { createSwell } from './world/swell';
import { SHIPS } from './sim/match';
import type { Snapshot } from './snapshot';
import { traceCoasts } from './ui/coasts';
import { createGlobe } from './ui/globe';
import { createFlow } from './ui/flow';
import { createHud, type HudState } from './ui/hud';
import { createInput } from './ui/input';
import { createStick } from './ui/stick';
import { uiLayer } from './ui/ui';
import { SEED } from './world/planet';
import { hash } from './world/random';
import { MEAN, SWING } from './world/weather';

/** The release's setup. The frame is made once for the most ships a match puts to sea (SHIPS, a race card's eighty);
 *  each match's own count is its own (play/match.ts fleetOf). */
const RELEASE: Setup = {
  seed: SEED, mean: MEAN, swing: SWING, hours: 16.3,
  drawing: { sea: 'water', fleet: SHIPS, length: SHIP.length, lod: null, cloth: true, bolt: false },
  meter: false, hold: null, gun: null,
};

const meterEl = document.getElementById('meter')!;

/** A planet of `seed` on a setup: its world, the frame that draws it, where she lies at the start, the matches dealt on
 *  it. */
function planetOf(renderer: WebGPURenderer, setup: Setup, seed: number) {
  const world = createWorld(seed, setup.mean, setup.swing, setup.hours);
  const frame = createFrame(renderer, world, setup.drawing);
  return { world, frame, start: startOf(world.planet), matches: createMatches(seed, world.planet, setup.hold, setup.gun) };
}

/** A crew's campus planet of `seed` (world/rookery.ts) on a setup: its world and the frame that draws it, and what a
 *  race planet has kept from `was` (no match is dealt on a campus). */
function campusOf(renderer: WebGPURenderer, setup: Setup, seed: number, was: ReturnType<typeof planetOf>) {
  const world = createWorld(seed, setup.mean, setup.swing, setup.hours, true);
  return { ...was, world, frame: createFrame(renderer, world, setup.drawing) };
}

/** The renderer, made once; on it the planet of the setup's seed, and each one after it in its place (restage). */
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

  // The world, handed to the frame that draws it and the game that runs on it; a new one each race (restage). While
  // one is put away and the next made, nothing is drawn (held).
  let planet = planetOf(renderer, setup, setup.seed), held = false;
  const meter = setup.meter ? createMeter(renderer, meterEl) : null;

  return {
    get world() { return planet.world; },
    get start() { return planet.start; },
    get anchors() { return planet.frame.anchors; },
    get ready() { return planet.frame.ready; },
    get matches() { return planet.matches; },
    canvas: renderer.domElement,
    memory: () => ({ geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures }),
    async restage(seed: number, then: () => Promise<void>, campus = false) {
      held = true;
      planet.frame.dispose();
      planet = campus ? campusOf(renderer, setup, seed, planet) : planetOf(renderer, setup, seed);
      await then();
      console.info(`planet ${seed}: ground baked in ${(await planet.frame.ready).toFixed(0)} ms`);
      planet.frame.resize(innerWidth, innerHeight);
      held = false;
    },
    async draw(next: (dt: number) => Snapshot | null, drawn?: (canvas: HTMLCanvasElement) => void) {
      console.info(`ground baked in ${(await planet.frame.ready).toFixed(0)} ms`);
      planet.frame.resize(innerWidth, innerHeight);
      addEventListener('resize', () => held || planet.frame.resize(innerWidth, innerHeight));
      let last = performance.now();
      renderer.setAnimationLoop(() => {
        if (held) return;
        const frame = planet.frame;
        const now = performance.now();
        const dt = Math.min((now - last) / 1000, 0.1);
        last = now;
        // (none: the world is covered and not drawn this frame; the frame still counts for what waits on it)
        const snapshot = next(dt), begun = performance.now();
        if (snapshot) frame.render(snapshot, dt);
        const rendered = performance.now() - begun;
        drawn?.(renderer.domElement);
        meter?.sample(performance.now() - now, rendered);
      });
    },
  };
}

/** The game on the stage's planet, at anchor in the lobby's quiet sea: the water sounded, for the bots' routes round land
 *  (sim/route.ts) and the ships' berths (sim/spawn.ts), in a worker while the ground's bakes in another (frame.ready),
 *  in a fraction of its time, and kept to berth each match ahead of PLAY; the referee; the coasts for the maps. */
async function gameOn(s: Stage) {
  const { waters, ms, berth, close } = await watersOf(s.world.seed);
  console.info(`water sounded in ${ms.toFixed(0)} ms`);
  s.matches.berthBy(berth);
  const game = createGame(s.world, s.anchors, waters, s.start, s.matches.first);
  return { game, referee: createReferee(game), coasts: traceCoasts(s.world.planet.islands), close };
}

/** The game on the stage, opening on the lobby's quiet sea, and its UI over the world, at the title. Each way home
 *  from a race puts the planet away under the parchment and makes the next (its seed the first's hashed with the count
 *  of planets: the first race is on the planet the page opened on); what is made once reads the planet's through `on`. */
async function play(s: Stage): Promise<Played> {
  let on = await gameOn(s), planets = 0;
  const first = s.world.seed;
  // (under 2^20: the noise's seeding multiplies it, world/noise3.ts, and keeps every bit only below 2^53)
  const restage = (seed = hash(first, ++planets) % 2 ** 20) => s.restage(seed, async () => {
    on.close();
    on = await gameOn(s);
  });

  // Her hands on the canvas, the stick drawn under the UI; the match's HUD over the world, fed by the game.
  const input = createInput(s.canvas, () => on.game.steering());
  const layer = uiLayer();
  const stick = createStick(layer);
  const globe = createGlobe(() => on.coasts);
  const hudState = (): HudState => ({ ...on.game.status(s.canvas.clientWidth, s.canvas.clientHeight), ...on.game.kit() });
  const map = () => globe.show(hudState());
  const hud = createHud(layer, () => on.coasts, { slot: input.tap, gust: input.gust, fire: input.fire, map, flight: input.flight, call: input.call });
  // the sound, begun on her first touch; a tick for each tap on something of the UI's
  const audio = createAudio((p) => s.world.planet.height(p));
  layer.addEventListener('pointerdown', (e) => {
    if (e.target instanceof Element && e.target.closest('.press')) audio.tap(flow.screen);
  }, true);
  const deal = () => {
    on.game.start(s.matches.deal());
    on.referee.begin();
  };
  const flow = createFlow(hud, globe, 'title', {
    play: deal,
    home() {
      on.referee.end();
      // (drawn again, the new planet's lobby, once its ground is baked: the parchment lifts after its first frames)
      void restage();
    },
    watch: () => on.referee.watch(),
    switch: (by) => on.referee.switch(by),
    skip: () => on.referee.skip(),
  });
  void s.ready.then(() => flow.ready());

  // The rookery (play/rookery.ts): a crew's campus planet staged in the race planet's place (a race planet staged again
  // only once a race needs it: racing), its view drawn in place of the game's while it is shown, the slips over it
  let campus: { seed: number; view: RookeryView } | null = null, shown = false, clock = 0;
  const slips = createRookeryLabels(layer);
  const size = () => [s.canvas.clientWidth, s.canvas.clientHeight] as const;
  const rookery: Played['rookery'] = {
    async open(r) {
      const seed = r.seed % 2 ** 20;
      if (campus?.seed !== seed) {
        await s.restage(seed, async () => {
          const sea = createSwell(s.anchors, s.world.planet.height, s.world.climate.seaWind, { shortest: RIDE.shortest });
          campus = { seed, view: createRookeryView(s.world.campus!, sea.hull) };
        }, true);
      }
      campus!.view.show(r);
      shown = true;
    },
    show: (r) => campus?.view.show(r),
    select: (b) => campus?.view.select(b),
    get selected() { return campus?.view.selected ?? null; },
    anchors: () => campus?.view.anchors(...size()) ?? [],
    pick: (x, y) => nearest(rookery.anchors(), x, y)?.building ?? null,
    close() {
      shown = false;
      slips.update(null);
    },
    get shown() { return shown; },
  };
  const racing = async () => {
    if (!campus) return;
    rookery.close();
    campus = null;
    await restage();
  };

  return {
    get game() { return on.game; },
    get referee() { return on.referee; },
    flow, play: deal, map, restage, rookery, racing,
    // the full map just opened, or a cross-fade waiting, holds the game's frame the moment it is drawn; the way home
    // counts the lobby's frames
    drawn: (canvas) => flow.drawn(canvas),
    next(dt: number): Snapshot | null {
      const hands = input.read();
      if (shown && campus) {
        // the rookery's view, turned by the look's drag; the game not stepped meanwhile
        stick(null);
        campus.view.look(hands.look.x, hands.look.y);
        campus.view.step(dt);
        slips.update(campus.view.labels(...size()));
        return campus.view.snapshot((clock += dt));
      }
      const { game, referee } = on;
      stick(game.steering() ? hands.stick : null);
      game.step(dt, hands);
      // her end, sunk or won, as the screens follow it
      flow.end(referee.update(dt));
      // the world as the game has it, seen from its eye or, while the full map is open, from the map's
      const scene = game.snapshot(), status = hudState();
      flow.update(status, scene.sea, scene.own);
      // heard from the game's eye, even with the full map open over it; the sea going as the screens cover it
      audio.update({ scene, status, screen: flow.screen, map: globe.open, covered: flow.covered }, flow.settings.sound, dt);
      // Skip's parchment held over the world: the race run on under it, the world not drawn
      if (flow.hiding) return null;
      return { ...scene, eye: globe.step(dt, scene.storm) ?? scene.eye };
    },
  };
}

await scenario(RELEASE, stage, play);

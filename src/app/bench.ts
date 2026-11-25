import { createAudio } from '../audio/audio.ts';
import type { Hearing } from '../audio/listen.ts';
import { createGame } from '../play/game.ts';
import { IDLE, type End, type Screen, type SeaBubble } from '../play/player.ts';
import { createReferee } from '../play/referee.ts';
import { watersOf } from '../play/setup.ts';
import { loaded } from '../render/load.ts';
import type { Snapshot } from '../render/snapshot.ts';
import { shoresOf } from '../ui/base/coasts.ts';
import { createGlobe } from '../ui/base/globe.ts';
import { MOTION } from '../ui/base/house.ts';
import { onPressed } from '../ui/base/touch.ts';
import { fade, uiLayer, view } from '../ui/base/ui.ts';
import { createAfter } from '../ui/sea/after.ts';
import { createHud, type HudState } from '../ui/sea/hud.ts';
import { createInput } from '../ui/sea/input.ts';
import { createPause } from '../ui/sea/pause.ts';
import { createSettling } from '../ui/sea/settling.ts';
import { createStick } from '../ui/sea/stick.ts';
import { clamp, lerp } from '../world/scalar.ts';
import type { Played, Stage } from './debug.ts';
import { deviceStore, keepSettings, keptSettings } from './kept.ts';
import { RACE_SHIP, raceSetup } from './race.ts';
import { SETTLE } from './voyage.ts';

type Phase = 'sailing' | 'sunk' | 'watching' | 'settling' | 'over';

export async function bench(s: Stage): Promise<Played> {
  const { waters, ms } = await watersOf(s.world.seed, s.world.land);
  console.info(`water sounded in ${ms.toFixed(0)} ms`);
  loaded('sounded');
  const race = raceSetup(s.name, s.world.seed, undefined, s.gun);
  const game = createGame(s.world, s.anchors, waters, s.start, RACE_SHIP);
  const referee = createReferee(game);
  const device = deviceStore();
  let settings = keptSettings(device),
    forced: boolean | null = null,
    left: boolean | null = null,
    stats: boolean | null = null;
  const input = createInput(
    s.canvas,
    () => game.steering(),
    () => ({
      leftHanded: forced ?? settings.leftHanded,
      sensitivity: settings.sensitivity,
    })
  );
  const layer = uiLayer();
  const stick = createStick(layer);
  const shores = shoresOf(
    s.world.planet,
    s.world.coasts,
    s.world.land.stats.summit
  );
  const globe = createGlobe(shores.coasts);
  let said: SeaBubble | null = null,
    phase: Phase = 'sailing',
    paused = false,
    released = -Infinity,
    offered = false;
  const status: HudState = Object.assign(
    { bubble: said },
    game.status(),
    game.kit()
  );
  const hudState = (): HudState =>
    Object.assign(status, game.status(view.w, view.h), game.kit(), {
      bubble: said,
    });
  const map = () => globe.show(hudState());
  const pauseMatch = () => {
    if (paused || phase !== 'sailing') return;
    paused = true;
    input.fire(false);
    pause.open();
  };
  const hud = createHud(
    layer,
    shores,
    {
      heal: input.heal,
      gust: input.gust,
      fire: input.fire,
      aim: input.aim,
      map,
      pause: pauseMatch,
    },
    () => {
      said = null;
      if (phase === 'sailing') after.show(false);
    }
  );
  const after = createAfter({
    watch() {
      if (phase !== 'sunk') return;
      phase = 'watching';
      referee.watch();
      after.show(true, true);
    },
    result() {
      if (phase !== 'sunk' && phase !== 'watching') return;
      phase = 'settling';
      after.show(false);
      globe.close();
      fade(hud.root, false);
      settling.show(true);
    },
  });
  if (after.result) hud.beside('sunk', after.result);
  const settling = createSettling();
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pauseMatch();
  });
  const audio = createAudio(s.world.planet.height);
  const pause = createPause(
    {
      get: () => settings,
      set(next) {
        settings = { ...settings, ...next };
        keepSettings(device, settings);
      },
      heard(id) {
        if (id === 'sound') audio.sample();
      },
    },
    {
      resume() {
        paused = false;
        released = performance.now();
      },
      forfeit() {
        paused = false;
        released = -Infinity;
        game.forfeit();
      },
    }
  );
  const ended = (end: End) => {
    if (phase === 'sailing' && end.how !== 'won') {
      phase = 'sunk';
      paused = false;
      hud.watch(true);
      globe.close();
    }
    if (phase === 'sunk' && end.settled && !offered) {
      offered = true;
      after.show(true);
    }
  };
  const pace = () =>
    paused ? 0 : clamp((performance.now() - released) / MOTION.paused.release);
  const screenOf = (): Screen =>
    phase === 'sailing' ? 'match' : phase === 'watching' ? 'spectate' : 'sunk';
  onPressed(layer, () =>
    audio.tap(pause.state === 'playing' ? screenOf() : 'settings')
  );
  const hearing: Hearing = {
    scene: game.snapshot(),
    status,
    screen: 'match',
    map: false,
  };
  void s.ready.then(() => loaded('title'));
  loaded('play');

  const settle = (real: number): Snapshot => {
    const dt = game.hasten(SETTLE.slice);
    const end = referee.update(dt);
    const now = hudState();
    settling.update(now.storm, now.afloat);
    audio.update(hearing, 0, real);
    if (game.done() || end?.over) {
      phase = 'over';
      settling.settled();
    }
    return game.snapshot();
  };

  return {
    game,
    referee,
    race,
    map,
    pause: pauseMatch,
    hand: (on: boolean) => (forced = on),
    wingman: (seed: number | null) => hud.wingman(seed),
    say(id: SeaBubble | null) {
      said = id;
      after.show(id === 'sunk');
    },
    go(to: 'match' | 'sunk' | 'spectate' | 'over') {
      hud.watch(to !== 'match');
      fade(hud.root, to !== 'over');
      if (to === 'match') return;
      offered = true;
      if (to === 'over') {
        phase = 'over';
        settling.show(true);
        const now = hudState();
        settling.update(now.storm, now.afloat);
        settling.settled();
        return;
      }
      phase = to === 'sunk' ? 'sunk' : 'watching';
      if (to === 'spectate') referee.watch();
      after.show(true, to === 'spectate');
    },
    next(real: number): Snapshot {
      if (phase === 'settling') return settle(real);
      const k = pace(),
        dt = real * k,
        read = input.read(),
        hands = paused ? IDLE : read;
      stick(game.steering() && !paused ? hands.stick : null);
      game.step(dt, hands);
      const end = referee.update(dt);
      if (end) ended(end);
      const scene = game.snapshot();
      if (phase !== 'over') {
        hud.update(hudState(), scene.sea, scene.own, globe.open);
        globe.update(status);
      }
      hearing.scene = scene;
      hearing.screen = screenOf();
      hearing.map = globe.open;
      audio.update(
        hearing,
        settings.sound * lerp(MOTION.paused.duck, 1, k),
        real
      );
      const lefty = forced ?? settings.leftHanded;
      if (lefty !== left) {
        hud.hand((left = lefty));
        document.getElementById('meter')?.classList.toggle('right', lefty);
      }
      if (settings.stats !== stats) s.stats((stats = settings.stats));
      scene.eye = globe.step(dt, scene.storm) ?? scene.eye;
      return scene;
    },
    drawn(canvas) {
      if (globe.waiting) globe.hold(canvas);
    },
  };
}

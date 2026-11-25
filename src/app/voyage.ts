import type { Hearing } from '../audio/listen.ts';
import { matchSetup } from '../career/fit.ts';
import { seatHolder } from '../career/lookup.ts';
import { YOURS, type CareerState } from '../career/state.ts';
import { dressOf } from '../play/colors.ts';
import { IDLE, type End, type Screen } from '../play/player.ts';
import { createReferee } from '../play/referee.ts';
import { loaded } from '../render/load.ts';
import type { Snapshot } from '../render/snapshot.ts';
import type { MatchResult } from '../sim/result.ts';
import { shoresOf } from '../ui/base/coasts.ts';
import { createGlobe } from '../ui/base/globe.ts';
import { MOTION } from '../ui/base/house.ts';
import { onPressed } from '../ui/base/touch.ts';
import { fade, uiLayer, view } from '../ui/base/ui.ts';
import { createVeil } from '../ui/base/veil.ts';
import { createAfter } from '../ui/sea/after.ts';
import { createHud, type HudState } from '../ui/sea/hud.ts';
import { createPause } from '../ui/sea/pause.ts';
import { createSettling } from '../ui/sea/settling.ts';
import { createStick } from '../ui/sea/stick.ts';
import { clamp, lerp } from '../world/scalar.ts';
import type { Crew } from './ashore.ts';
import type { Stage } from './debug.ts';
import { deviceStore, keepSettings, keptSettings } from './kept.ts';

export const SETTLE = { slice: 12 } as const;

type Phase = 'sailing' | 'sunk' | 'watching' | 'settling' | 'over';

export type Voyage = {
  next(real: number): Snapshot | null;
  drawn(canvas: HTMLCanvasElement): void;
};

export async function voyage(
  s: Stage,
  crew: Crew,
  career: CareerState,
  o: {
    casting: boolean;
    ended(end: { result: MatchResult; settle(): Promise<void> }): void;
  }
): Promise<Voyage> {
  const { game, input, audio, berth } = crew;
  const setup = matchSetup(career, { hands: 'player' });
  const berthed = await berth(setup.match, setup.ships.length);
  const liveries = career.teams.map(dressOf);
  const device = deviceStore();
  let settings = keptSettings(device);
  input.fire(false);

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
  let phase: Phase = 'sailing',
    paused = false,
    released = -Infinity,
    offered = false,
    left: boolean | null = null,
    stats: boolean | null = null;

  const pauseMatch = () => {
    if (paused || phase !== 'sailing') return;
    paused = true;
    input.fire(false);
    pause.open();
  };
  const hud = createHud(layer, shores, {
    heal: input.heal,
    gust: input.gust,
    fire: input.fire,
    map: () => globe.show(hudState()),
    pause: pauseMatch,
  });
  fade(hud.root, false, 0);
  hud.wingman(seatHolder(career, YOURS, 'driver')?.portrait ?? null);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pauseMatch();
  });
  const referee = createReferee(game);
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
  const after = createAfter({
    watch() {
      if (phase !== 'sunk') return;
      phase = 'watching';
      referee.watch(() => game.leader());
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
  const settling = createSettling();
  const veil = createVeil();

  const begin = () => {
    game.start(setup, liveries, berthed);
    referee.begin();
    hud.watch(false);
    fade(hud.root, true);
  };
  if (o.casting)
    window.setTimeout(() => veil.cover(begin), MOTION.casting.leave);
  else begin();

  const finish = () => {
    if (phase === 'over') return;
    const was = phase;
    phase = 'over';
    after.show(false);
    const result = game.result();
    loaded('race ended');
    o.ended({
      result,
      async settle() {
        if (was === 'settling') {
          settling.settled();
          await new Promise((go) =>
            window.setTimeout(go, MOTION.settling.hold)
          );
        }
      },
    });
  };

  const ended = (end: End) => {
    if (phase === 'over' || phase === 'settling') return;
    if (end.how === 'won') {
      if (end.settled) finish();
      return;
    }
    if (phase === 'sailing') {
      phase = 'sunk';
      paused = false;
      hud.watch(true);
      globe.close();
    }
    if (end.over) {
      finish();
      return;
    }
    if (end.settled && !offered) {
      offered = true;
      after.show(true);
    }
  };

  const pace = () =>
    paused ? 0 : clamp((performance.now() - released) / MOTION.paused.release);
  const hearing: Hearing = {
    scene: game.snapshot(),
    status,
    screen: 'match',
    map: false,
    covered: 0,
  };
  const screenOf = (): Screen =>
    phase === 'sailing' ? 'match' : phase === 'watching' ? 'spectate' : 'sunk';
  onPressed(layer, () =>
    audio.tap(pause.state === 'playing' ? screenOf() : 'settings')
  );

  const settle = (real: number): null => {
    const dt = game.hasten(SETTLE.slice);
    const end = referee.update(dt);
    const now = hudState();
    settling.update(now.storm, now.afloat);
    audio.update(hearing, 0, real);
    if (game.done() || end?.over) finish();
    return null;
  };

  return {
    next(real: number): Snapshot | null {
      if (phase === 'settling') return settle(real);
      if (phase === 'over') return null;
      const k = pace(),
        dt = real * k,
        read = input.read(),
        hands = paused ? IDLE : read;
      stick(game.steering() && !paused ? hands.stick : null);
      game.step(dt, hands);
      const end = referee.update(dt);
      if (end) ended(end);
      const scene = game.snapshot();
      hud.update(hudState(), scene.sea, scene.own, globe.open);
      globe.update(status);
      hearing.scene = scene;
      hearing.screen = screenOf();
      hearing.map = globe.open;
      audio.update(
        hearing,
        settings.sound * lerp(MOTION.paused.duck, 1, k),
        real
      );
      if (settings.leftHanded !== left) hud.hand((left = settings.leftHanded));
      if (settings.stats !== stats) s.stats((stats = settings.stats));
      scene.eye = globe.step(dt, scene.storm) ?? scene.eye;
      return scene;
    },
    drawn(canvas) {
      if (globe.waiting) globe.hold(canvas);
      if (veil.waiting) veil.hold(canvas);
    },
  };
}

import { parseRecording } from '../sim/input.ts';
import { matchHash } from '../sim/state.ts';
import type { ScreenName } from '../ui/shell.ts';
import type { Game } from './game.ts';

function positive(name: string, n: number | null, integer: boolean): number | null {
  if (n !== null && !(n > 0 && (!integer || Number.isInteger(n)))) throw new RangeError(`${name}: ${n}`);
  return n;
}

export function installHooks(game: Game): void {
  const { loop, pipeline, shell } = game;
  const hooks = {
    get ready() { return game.ready; },
    get screen() { return shell.name; },
    get tick() { return game.session?.state.tick ?? -1; },
    get clock() { return loop.clock; },
    get paused() { return loop.paused; },
    get perf() { return { ...game.perf, ...loop.perf, ...pipeline.stats }; },
    startMatch({ seed, recording = null, stopAt = null }: { seed: number; recording?: unknown; stopAt?: number | null }) {
      if (stopAt !== null && !(Number.isInteger(stopAt) && stopAt >= 0)) throw new RangeError(`startMatch: stopAt ${stopAt}`);
      game.startMatch({ seed }, recording === null ? null : parseRecording(recording), stopAt);
    },
    setSpeed(n: number | null) { loop.speed = positive('setSpeed', n, true); },
    setFrameRate(fps: number | null) { loop.frameRate = positive('setFrameRate', fps, false); },
    pinRenderScale(s: number | null) { pipeline.pinScale(positive('pinRenderScale', s, false)); },
    setPaused(p: boolean) { loop.paused = p; },
    background: () => game.background(),
    resume: () => game.foreground(),
    matchHash: () => (game.session ? matchHash(game.session.state) : null),
    show: (name: Exclude<ScreenName, 'match'>) => game.show(name),
  };
  Object.defineProperty(window, '__portolan', { value: hooks });
}

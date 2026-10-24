// The test hooks, window.__portolan (A10). Tests drive and watch the game through them: they start, pace and pause
// matches, pin the render scale and send the app to the background and back. They never change a rule: a match
// started here is stepped by the same loop from the same inputs as one started from the harbour.
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
    /** The world has arrived and the screen the game opens on is up. */
    get ready() { return game.ready; },
    get screen() { return shell.name; },
    /** The running match's tick, or −1. */
    get tick() { return game.session?.state.tick ?? -1; },
    /** The render clock, seconds. */
    get clock() { return loop.clock; },
    get paused() { return loop.paused; },
    /** Startup and world timings, frame and tick times (ms) and the last frame's render counters. */
    get perf() { return { ...game.perf, ...loop.perf, ...pipeline.stats }; },
    /** A match from its seed; with a recording the player's ship replays it and holds still at stopAt. */
    startMatch({ seed, recording = null, stopAt = null }: { seed: number; recording?: unknown; stopAt?: number | null }) {
      if (stopAt !== null && !(Number.isInteger(stopAt) && stopAt >= 0)) throw new RangeError(`startMatch: stopAt ${stopAt}`);
      game.startMatch({ seed }, recording === null ? null : parseRecording(recording), stopAt);
    },
    /** Exactly n ticks every frame (null: real time). The match is the same at any speed. */
    setSpeed(n: number | null) { loop.speed = positive('setSpeed', n, true); },
    /** Draw at most fps frames a second (null: every display frame). */
    setFrameRate(fps: number | null) { loop.frameRate = positive('setFrameRate', fps, false); },
    /** Hold the render scale (captures use 1), or give it back to the dynamic controller with null. */
    pinRenderScale(s: number | null) { pipeline.pinScale(positive('pinRenderScale', s, false)); },
    /** Pause or unpause the match as the chart does: no ticks, the render clock stops. */
    setPaused(p: boolean) { loop.paused = p; },
    /** The app goes to the background; settles once the match is saved. Reload the page to relaunch the app. */
    background: () => game.background(),
    /** The app comes back without having been closed. */
    resume: () => game.foreground(),
    matchHash: () => (game.session ? matchHash(game.session.state) : null),
    /** Go to a screen other than the match, ending any match. */
    show: (name: Exclude<ScreenName, 'match'>) => game.show(name),
  };
  Object.defineProperty(window, '__portolan', { value: hooks });
}

// The game runtime: the loop, the screens, the world, the match in progress and its life across the app going to
// the background and coming back. The boot (main.ts), the screens and the test hooks drive the game through it.
import type { Lettering } from '../lettering/ink.ts';
import type { Pipeline } from '../render/pipeline.ts';
import { idleInput, type Recording } from '../sim/input.ts';
import { createMatch, type MatchSetup } from '../sim/state.ts';
import { Shell, type Runtime, type ScreenName } from '../ui/shell.ts';
import { Loop } from './loop.ts';
import { clearMatch, saveMatch, type SavedMatch } from './save.ts';
import { Session } from './session.ts';
import type { World, WorldMessage } from './worldWorker.ts';

export class Game implements Runtime {
  readonly pipeline: Pipeline;
  readonly loop: Loop;
  readonly shell: Shell;
  world: World | null = null;
  session: Session | null = null;
  /** The world has arrived and the screen the game opens on is up. */
  ready = false;
  /** Milliseconds from navigation start to the first frame of the title, and what the world cost. */
  readonly perf = { startup: 0, worldMs: 0, worldCached: false };

  constructor(canvas: HTMLCanvasElement, pipeline: Pipeline, lettering: Lettering) {
    this.pipeline = pipeline;
    this.shell = new Shell(canvas, { pipeline, lettering, runtime: this });
    this.shell.go('title');
    this.loop = new Loop((f) => {
      this.shell.frame(f);
      if (this.perf.startup === 0) this.perf.startup = performance.now();
    });
  }

  /** The world from the worker and the match saved when the app last went to the background, which resumes. */
  arrive(m: WorldMessage, saved: SavedMatch | null): void {
    this.world = m.world;
    this.perf.worldMs = m.ms;
    this.perf.worldCached = m.cached;
    if (saved) this.play(saved);
    this.ready = true;
  }

  setSail(): void {
    this.startMatch({ seed: crypto.getRandomValues(new Uint32Array(1))[0] }, null, null);
  }

  startMatch(setup: MatchSetup, recording: Recording | null, stopAt: number | null): void {
    this.play({ state: createMatch(setup), recording, stopAt });
  }

  show(name: Exclude<ScreenName, 'match'>): void {
    this.end();
    this.shell.go(name);
  }

  /** The app goes to the background: the match stops and is saved, settling once the save has committed. */
  async background(): Promise<void> {
    if (this.loop.suspended) return;
    this.loop.suspended = true;
    if (this.session) await saveMatch(this.session);
  }

  /** The app is back: the match continues from the tick it stopped on, and the snapshot is spent. */
  async foreground(): Promise<void> {
    if (!this.loop.suspended) return;
    this.loop.suspended = false;
    if (this.session) await clearMatch();
  }

  private play(m: SavedMatch): void {
    if (!this.world) throw new Error('play: the world has not arrived');
    this.session = new Session(m, idleInput); // the live input source until the match controls (WP25) supply it
    this.loop.run(this.session);
    this.shell.go('match');
    void clearMatch(); // a saved match is spent once it plays again, and a new match replaces it
  }

  private end(): void {
    if (!this.session) return;
    this.session = null;
    this.loop.run(null);
    void clearMatch();
  }
}

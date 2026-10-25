// The game runtime: the loop, the screens, the world, the match in progress and its life across the app going to
// the background and coming back. The boot (main.ts), the screens and the test hooks drive the game through it.
import type { Lettering } from '../lettering/ink.ts';
import type { Pipeline } from '../render/pipeline.ts';
import { applyResult } from '../career/progress.ts';
import { toSetup } from '../career/setup.ts';
import { newCareer, type Career } from '../career/state.ts';
import { over, result } from '../sim/end.ts';
import { seaFor } from '../sim/environment.ts';
import type { MatchState } from '../sim/state.ts';
import { idleInput, type Recording, type ShipInput } from '../sim/input.ts';
import { createMatch, type MatchSetup } from '../sim/state.ts';
import { Shell, type Runtime, type ScreenName } from '../ui/shell.ts';
import { Loop, type Stepper } from './loop.ts';
import { clearMatch, saveCareer, saveMatch, type SavedMatch } from './save.ts';
import { Session } from './session.ts';
import type { GameAudio } from '../audio/soundscape.ts';
import { applySettings, onSettings, settings } from '../ui/settings.ts';
import type { World, WorldMessage } from './worldWorker.ts';

const randomSeed = (): number => crypto.getRandomValues(new Uint32Array(1))[0];

export class Game implements Runtime {
  readonly pipeline: Pipeline;
  readonly loop: Loop;
  readonly shell: Shell;
  world: World | null = null;
  session: Session | null = null;
  /** The sound (WP28): unlocked on the first touch; null where Web Audio is unavailable. */
  /** The sound, woken after the title's first frame (its module and AudioContext cost ~0.2 s at boot). */
  audio: GameAudio | null = null;
  /** WP25: the player's input source and every tick's listener while the match screen is up (Runtime). */
  input: (() => ShipInput) | undefined;
  onTick: ((s: MatchState) => void) | null = null;
  /** The career (WP10): set sail fits out its next match, and a voyage's result comes home when its match ends. */
  career: Career | null = null;
  /** The world has arrived and the screen the game opens on is up. */
  ready = false;
  /** Milliseconds from navigation start to the first frame of the title, and what the world cost. */
  readonly perf = { startup: 0, worldMs: 0, worldCached: false };

  constructor(canvas: HTMLCanvasElement, pipeline: Pipeline, lettering: Lettering) {
    this.pipeline = pipeline;
    this.shell = new Shell(canvas, { pipeline, lettering, runtime: this });
    const quality = () => applySettings(settings(), { quality: pipeline }); // WP26 the graphics quality in force
    quality();
    onSettings(quality);
    this.shell.go('title');
    let held = false; // WP24: the screen's pause (the open chart) drives the loop on each change; test hooks may still pause it
    this.loop = new Loop((f) => {
      this.shell.frame(f);
      if (this.shell.paused !== held) { held = this.shell.paused; this.loop.paused = held; }
      this.audio?.frame(f.dt, this.session?.state ?? null);
      if (this.perf.startup === 0) {
        this.perf.startup = performance.now();
        void import('../audio/soundscape.ts').then((m) => { this.audio = m.GameAudio.create(); });
      }
    });
  }

  /** The world from the worker, the saved career (a new one when there is none) and the match saved when the app last
   * went to the background, which resumes. */
  arrive(m: WorldMessage, saved: SavedMatch | null, career: Career | null = null): void {
    this.world = m.world;
    this.career = career ?? newCareer(randomSeed());
    this.perf.worldMs = m.ms;
    this.perf.worldCached = m.cached;
    if (saved) this.play(saved);
    this.ready = true;
  }

  setSail(): void {
    if (!this.career) throw new Error('setSail: the career has not arrived');
    this.startMatch(toSetup(this.career, randomSeed()).setup, null, null);
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
    this.audio?.suspend();
    if (this.loop.suspended) return;
    this.loop.suspended = true;
    if (this.session) await saveMatch(this.session);
  }

  /** The app is back: the match continues from the tick it stopped on, and the snapshot is spent. */
  async foreground(): Promise<void> {
    this.audio?.resume();
    if (!this.loop.suspended) return;
    this.loop.suspended = false;
    if (this.session) await clearMatch();
  }

  private play(m: SavedMatch): void {
    if (!this.world) throw new Error('play: the world has not arrived');
    this.session = new Session(seaFor(this.world, m.state.seed), m, () => (this.input ?? idleInput)()); // the match controls (WP25) set `input`
    this.audio?.startMatch(this.session.sea);
    this.loop.run(this.stepper(this.session));
    this.shell.go('match');
    void clearMatch(); // a saved match is spent once it plays again, and a new match replaces it
  }

  /** The session as the loop steps it, its events heard after every tick (WP28). */
  private stepper(session: Session): Stepper {
    const audio = this.audio;
    return { step: () => { const moved = session.step(); if (moved) { audio?.tick(session.state); this.onTick?.(session.state); } return moved; } };
  }

  private end(): void {
    if (!this.session) return;
    const { state, recording } = this.session;
    if (this.career && recording === null && over(state)) { // a voyage the player sailed: its result comes home, saved on the device
      this.career = applyResult(this.career, result(state));
      void saveCareer(this.career);
    }
    this.audio?.endMatch();
    this.session = null;
    this.loop.run(null);
    void clearMatch();
  }
}

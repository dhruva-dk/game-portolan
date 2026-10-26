import type { Lettering } from '../lettering/ink.ts';
import type { Pipeline } from '../render/pipeline.ts';
import { draw } from '../career/league.ts';
import { applyResult } from '../career/progress.ts';
import { toSetup } from '../career/setup.ts';
import { newCareer, type Career } from '../career/state.ts';
import { newVoyage, observe, toLetter, type Voyage } from '../career/voyage.ts';
import { over, result } from '../sim/end.ts';
import { seaFor } from '../sim/environment.ts';
import type { Entry, MatchState } from '../sim/state.ts';
import { idleInput, type Recording, type ShipInput } from '../sim/input.ts';
import { createMatch, type MatchSetup } from '../sim/state.ts';
import { Shell, type Outcome, type Runtime, type ScreenName } from '../ui/shell.ts';
import { Loop, type Stepper } from './loop.ts';
import { clearMatch, saveCareer, saveMatch, type SavedMatch } from './save.ts';
import { Session } from './session.ts';
import type { GameAudio } from '../audio/soundscape.ts';
import { applySettings, onSettings, settings } from '../ui/settings.ts';
import { GULL_MOMENTS } from '../ui/results.ts';
import type { World, WorldMessage } from './worldWorker.ts';

const randomSeed = (): number => crypto.getRandomValues(new Uint32Array(1))[0];
const RUSH_MS = 30;

const news = (before: Career, v: Voyage): boolean =>
  v.seen.some((b, i) => (b & ~before.chart.seen[i]) !== 0) || toLetter(before, v).length > 0 || v.found.some((f, k) => f > 0 && before.chart.found[k] === 0);

export class Game implements Runtime {
  readonly pipeline: Pipeline;
  readonly loop: Loop;
  readonly shell: Shell;
  world: World | null = null;
  session: Session | null = null;
  audio: GameAudio | null = null;
  input: (() => ShipInput) | undefined;
  onTick: ((s: MatchState) => void) | null = null;
  career: Career | null = null;
  voyage: Voyage | null = null;
  outcome: Outcome | null = null;
  private gull: Entry[] = [];
  ready = false;
  readonly perf = { startup: 0, worldMs: 0, worldCached: false };

  constructor(canvas: HTMLCanvasElement, pipeline: Pipeline, lettering: Lettering) {
    this.pipeline = pipeline;
    this.shell = new Shell(canvas, { pipeline, lettering, runtime: this });
    const quality = () => applySettings(settings(), { quality: pipeline });
    quality();
    onSettings(quality);
    this.shell.go('title');
    let held = false;
    this.loop = new Loop((f) => {
      this.shell.frame(f);
      if (this.shell.paused !== held) { held = this.shell.paused; this.loop.paused = held; }
      this.loop.rate = this.shell.rate;
      this.audio?.frame(f.dt, this.session?.state ?? null, this.shell.name === 'match' ? this.shell.camera : null);
      if (this.perf.startup === 0) {
        this.perf.startup = performance.now();
        void import('../audio/soundscape.ts').then((m) => { this.audio = m.GameAudio.create(); });
      }
    });
  }

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

  skip(): void {
    if (this.session && !over(this.session.state)) this.loop.rush = RUSH_MS;
  }

  show(name: Exclude<ScreenName, 'match'>): void {
    this.end();
    this.shell.go(name);
  }

  async background(): Promise<void> {
    this.audio?.suspend();
    if (this.loop.suspended) return;
    this.loop.suspended = true;
    if (this.session) await saveMatch(this.session);
  }

  async foreground(): Promise<void> {
    this.audio?.resume();
    if (!this.loop.suspended) return;
    this.loop.suspended = false;
    if (this.session) await clearMatch();
  }

  private play(m: SavedMatch): void {
    if (!this.world) throw new Error('play: the world has not arrived');
    this.session = new Session(seaFor(this.world, m.state.seed), m, () => (this.input ?? idleInput)());
    this.voyage = m.recording === null ? newVoyage() : null;
    this.gull = [];
    this.audio?.startMatch(this.session.sea);
    this.loop.run(this.stepper(this.session));
    this.shell.go('match');
    void clearMatch();
  }

  private stepper(session: Session): Stepper {
    const audio = this.audio, voyage = this.voyage;
    return {
      step: () => {
        const moved = session.step();
        if (moved) {
          if (voyage) observe(voyage, session.sea, session.state);
          for (const e of session.state.events) if (e.ship === 0 && GULL_MOMENTS.includes(e.kind)) this.gull.push({ tick: session.state.tick, kind: e.kind, ship: e.ship, by: e.by, amount: e.amount });
          audio?.tick(session.state);
          this.onTick?.(session.state);
        }
        return moved;
      },
    };
  }

  private end(): void {
    if (!this.session) return;
    const { state, recording } = this.session, voyage = this.voyage;
    if (this.career && recording === null && voyage && over(state)) {
      const before = this.career, r = result(state);
      this.career = applyResult(before, r, voyage);
      this.outcome = { before, after: this.career, result: r, drawn: draw(before), voyage, gull: this.gull, charted: !news(before, voyage) };
      void saveCareer(this.career);
    }
    this.voyage = null;
    this.audio?.endMatch();
    this.session = null;
    this.loop.run(null);
    void clearMatch();
  }
}

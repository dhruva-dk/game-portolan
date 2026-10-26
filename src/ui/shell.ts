import type { ShipInput } from '../sim/input.ts';
import type { Entry, MatchState } from '../sim/state.ts';
import type * as THREE from 'three';
import type { Frame } from '../app/loop.ts';
import type { Session } from '../app/session.ts';
import type { World } from '../app/worldWorker.ts';
import type { Lettering } from '../lettering/ink.ts';
import type { Pipeline } from '../render/pipeline.ts';
import type { GameAudio } from '../audio/soundscape.ts';
import type { Career } from '../career/state.ts';
import type { Voyage } from '../career/voyage.ts';
import type { MatchResult } from '../sim/end.ts';
import { readView, type View } from './safeArea.ts';
import { harbour } from './harbour.ts';
import { match, results } from './screens.ts';
import { title } from './title.ts';

export type ScreenName = 'title' | 'harbour' | 'match' | 'results';

export interface Runtime {
  readonly world: World | null;
  readonly session: Session | null;
  setSail(): void;
  show(name: Exclude<ScreenName, 'match'>): void;
  input?: (() => ShipInput) | undefined;
  onTick?: ((s: MatchState) => void) | null;
  readonly career: Career | null;
  readonly audio: GameAudio | null;
  readonly voyage: Voyage | null;
  readonly outcome: Outcome | null;
  skip(): void;
}

export interface Outcome {
  readonly before: Career;
  readonly after: Career;
  readonly result: MatchResult;
  readonly drawn: readonly number[];
  readonly voyage: Voyage;
  readonly gull: readonly Entry[];
  charted: boolean;
}

export interface ScreenContext {
  readonly pipeline: Pipeline;
  readonly lettering: Lettering;
  readonly runtime: Runtime;
}

export interface Touch {
  readonly phase: 'down' | 'move' | 'up' | 'cancel';
  readonly id: number;
  readonly x: number;
  readonly y: number;
}

export interface Screen {
  readonly ui: THREE.Group;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  layout(view: View): void;
  frame(f: Frame): void;
  touch(t: Touch): void;
  paused?(): boolean;
  rate?(): number;
  dispose(): void;
}

const SCREENS: Readonly<Record<ScreenName, (ctx: ScreenContext) => Screen>> = { title, harbour, match, results };

const PHASES = { pointerdown: 'down', pointermove: 'move', pointerup: 'up', pointercancel: 'cancel' } as const;

export class Shell {
  private readonly ctx: ScreenContext;
  private view: View;
  private screen: Screen | null = null;
  private current: ScreenName | null = null;

  constructor(canvas: HTMLCanvasElement, ctx: ScreenContext) {
    this.ctx = ctx;
    this.view = this.resize();
    addEventListener('resize', () => {
      this.view = this.resize();
      this.screen?.layout(this.view);
    });
    for (const [type, phase] of Object.entries(PHASES)) {
      canvas.addEventListener(type, (e) => {
        const p = e as PointerEvent;
        this.screen?.touch({ phase, id: p.pointerId, x: p.clientX, y: p.clientY });
      });
    }
  }

  get name(): ScreenName | null {
    return this.current;
  }

  go(name: ScreenName): void {
    const { ui } = this.ctx.pipeline;
    if (this.screen) {
      ui.remove(this.screen.ui);
      this.screen.dispose();
    }
    this.screen = SCREENS[name](this.ctx);
    this.current = name;
    this.screen.layout(this.view);
    ui.add(this.screen.ui);
  }

  get paused(): boolean { return this.screen?.paused?.() ?? false; }

  get camera(): THREE.PerspectiveCamera | null { return this.screen?.camera ?? null; }

  get rate(): number { return this.screen?.rate?.() ?? 1; }

  frame(f: Frame): void {
    const s = this.screen!;
    s.frame(f);
    this.ctx.pipeline.render(s.scene, s.camera, f.dt);
  }

  private resize(): View {
    const v = readView();
    this.ctx.pipeline.setSize(v.width, v.height, v.dpr);
    this.ctx.lettering.setPixelRatio(v.dpr);
    return v;
  }
}

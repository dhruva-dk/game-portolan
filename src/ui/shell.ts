// The shell: the screens of the game and the one that is up. Screens are registered by name in SCREENS
// (append-only, A6) and move the game along: title → harbour → match → results → harbour. A screen is built each
// time it comes up and disposed when it goes; it owns its interface (a group of meshes in CSS px in the pipeline's
// ui scene) and the world scene drawn beneath it. The shell fits the canvas to the view and its safe area, hands
// each finger to the screen that is up, and draws that screen's frames.
import type { ShipInput } from '../sim/input.ts';
import type { MatchState } from '../sim/state.ts';
import type * as THREE from 'three';
import type { Frame } from '../app/loop.ts';
import type { Session } from '../app/session.ts';
import type { World } from '../app/worldWorker.ts';
import type { Lettering } from '../lettering/ink.ts';
import type { Pipeline } from '../render/pipeline.ts';
import { readView, type View } from './safeArea.ts';
import { harbour } from './harbour.ts'; // WP26
import { match, results } from './screens.ts';
import { title } from './title.ts'; // WP26

export type ScreenName = 'title' | 'harbour' | 'match' | 'results';

/** What screens ask of the game. */
export interface Runtime {
  readonly world: World | null;
  readonly session: Session | null;
  /** Start a new match from the harbour. */
  setSail(): void;
  /** Leave for a screen other than the match, ending any match. */
  show(name: Exclude<ScreenName, 'match'>): void;
  /** WP25: the player's input for the next tick, set by the match screen's controls (idle when unset). */
  input?: (() => ShipInput) | undefined;
  /** WP25: hears every tick's state after it steps (the haptics feel each tick's events). */
  onTick?: ((s: MatchState) => void) | null;
}

export interface ScreenContext {
  readonly pipeline: Pipeline;
  readonly lettering: Lettering;
  readonly runtime: Runtime;
}

/** A finger (or the mouse) on the screen, CSS px from the top left. */
export interface Touch {
  readonly phase: 'down' | 'move' | 'up' | 'cancel';
  readonly id: number;
  readonly x: number;
  readonly y: number;
}

export interface Screen {
  /** The interface: meshes in CSS px, origin at the top left. */
  readonly ui: THREE.Group;
  /** The world drawn beneath the interface. */
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  layout(view: View): void;
  frame(f: Frame): void;
  touch(t: Touch): void;
  /** WP24: true while the screen holds the match still (the open chart): the loop stops the ticks and the render clock. */
  paused?(): boolean;
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

  /** The screen that is up. */
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

  /** The current screen holds the match still (WP24: the chart is open). */
  get paused(): boolean { return this.screen?.paused?.() ?? false; }

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

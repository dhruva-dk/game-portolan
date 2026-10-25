// The minimal screens, lettered in the generated hand on a parchment page: the title writing itself, the harbour
// with its set-sail button, the match and the results. WP26 replaces the title and the harbour, WP27 the results;
// WP25 gives the match its controls and HUD. Each lays itself out inside the safe area.
import * as THREE from 'three';
import { InkText, type InkTextOptions } from '../lettering/ink.ts';
import { WorldView, type MatchFrame } from '../render/world.ts';
import { ButtonBase, Scrap } from './parchment.ts';
import { safeRect, type View } from './safeArea.ts';
import type { Screen, ScreenContext, Touch } from './shell.ts';

/** The screens drawn on the bare page have no world beneath them. */
const BARE = { scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera() };

function clear(ui: THREE.Group): void {
  for (const m of [...ui.children] as THREE.Mesh<THREE.BufferGeometry, THREE.Material>[]) {
    ui.remove(m);
    if (m instanceof InkText) m.dispose();
    else {
      m.geometry.dispose();
      m.material.dispose();
    }
  }
}

/** The whole view as one cut sheet of parchment. */
function page(ctx: ScreenContext, view: View): Scrap {
  const sheet = new Scrap(ctx.pipeline.style, { width: view.width, height: view.height, torn: [0, 0, 0, 0], age: 0.1 });
  sheet.position.set(view.width / 2, view.height / 2, 0);
  return sheet;
}

function letter(ctx: ScreenContext, content: string, o: InkTextOptions, x: number, y: number): InkText {
  const t = ctx.lettering.text(content, o);
  t.position.set(x, y, 0);
  t.renderOrder = 2;
  return t;
}

/** A screen on the bare page with one line of lettering in the middle, left by a tap. */
function notice(ctx: ScreenContext, content: string, size: number, swash: boolean, tapped: () => void): Screen & { word: () => InkText } {
  const ui = new THREE.Group();
  let word: InkText;
  return {
    ...BARE,
    ui,
    word: () => word,
    layout(view) {
      clear(ui);
      const r = safeRect(view);
      word = letter(ctx, content, { size: Math.min(r.height * size, r.width * size * 0.66), align: 'center', valign: 'middle', swash },
        r.x + r.width / 2, r.y + r.height / 2);
      ui.add(page(ctx, view), word);
    },
    frame() {},
    touch(t) {
      if (t.phase === 'up') tapped();
    },
    dispose: () => clear(ui),
  };
}

/** Portolan writes itself, stroke by stroke; a tap goes on to the harbour. */
export function title(ctx: ScreenContext): Screen {
  const screen = notice(ctx, 'Portolan', 0.3, true, () => ctx.runtime.show('harbour'));
  let start: number | null = null;
  screen.frame = (f) => {
    start ??= f.clock;
    const word = screen.word();
    word.progress = (f.clock - start) / word.duration;
  };
  return screen;
}

/** The set-sail button, waiting for the world. */
export function harbour(ctx: ScreenContext): Screen {
  const ui = new THREE.Group();
  let button: ButtonBase;
  let cx = 0, cy = 0, radius = 1;
  let finger: number | null = null; // the finger pressing the button
  const inside = (t: Touch) => Math.hypot(t.x - cx, t.y - cy) <= radius;
  return {
    ...BARE,
    ui,
    layout(view) {
      clear(ui);
      const r = safeRect(view);
      radius = Math.min(r.width, r.height) * 0.12;
      cx = r.x + r.width / 2;
      cy = r.y + r.height * 0.42;
      button = new ButtonBase(ctx.pipeline.style, radius);
      button.position.set(cx, cy, 0);
      button.renderOrder = 1;
      ui.add(page(ctx, view), button, letter(ctx, 'Set sail', { size: radius * 0.6, align: 'center', valign: 'top' }, cx, cy + radius * 1.4));
    },
    frame() {
      button.disabled = ctx.runtime.world ? 0 : 1;
      button.pressed = finger === null ? 0 : 1;
    },
    touch(t) {
      if (t.phase === 'down' && finger === null && inside(t)) finger = t.id;
      else if (t.id === finger && (t.phase === 'up' || t.phase === 'cancel')) {
        finger = null;
        if (t.phase === 'up' && inside(t) && ctx.runtime.world) ctx.runtime.setSail();
      }
    },
    dispose: () => clear(ui),
  };
}

/** The match in progress, drawn by the render modules; its interface and controls come with WP25. */
export function match(ctx: ScreenContext): Screen {
  const { world, session } = ctx.runtime;
  if (!world || !session) throw new Error('match: no match in progress');
  const view = new WorldView(ctx.pipeline, world);
  const frame: MatchFrame & { dt: number; clock: number; alpha: number } = { dt: 0, clock: 0, alpha: 1, state: session.state };
  return {
    ui: new THREE.Group(),
    scene: view.scene,
    camera: view.camera,
    layout: (v) => view.layout(v.width, v.height, v.safe),
    frame(f) {
      view.drive = true;
      frame.dt = f.dt;
      frame.clock = f.clock;
      frame.alpha = f.alpha;
      view.frame(frame);
    },
    touch(t) {
      view.rig.pinch.touch(t); // WP24: two fingers zoom deck ↔ chart; one finger is WP25's
    },
    dispose: () => view.dispose(),
  };
}

/** The voyage's end; a tap returns to the harbour. */
export function results(ctx: ScreenContext): Screen {
  return notice(ctx, 'The voyage ends', 0.12, false, () => ctx.runtime.show('harbour'));
}

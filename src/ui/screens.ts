// The minimal screens, lettered in the generated hand on a parchment page: the title writing itself, the harbour
// with its set-sail button, the match and the results. WP26 replaces the title and the harbour, WP27 the results;
// WP25 gives the match its controls and HUD. Each lays itself out inside the safe area.
import * as THREE from 'three';
import { InkText, type InkTextOptions } from '../lettering/ink.ts';
import { WorldView, type MatchFrame } from '../render/world.ts';
import { R, TERRITORY, cellOf } from '../sim/sphere.ts';
import { PHASE } from '../sim/state.ts';
import { Controls } from './controls.ts';
import { Haptics } from './haptics.ts';
import { HudState, hudLayout } from './hud.ts';
import { HudView } from './icons.ts';
import { ButtonBase, Scrap } from './parchment.ts';
import { safeRect, type View } from './safeArea.ts';
import { applySettings, onSettings, settings, type Settings } from './settings.ts';
import { CompactChart } from '../render/compactchart.ts';
import { COURSE, CourseDrawing } from '../render/course.ts';
import { prefersReducedMotion } from '../render/camera.ts';
import { TEAMS } from '../style/palette.ts';
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

/** WP25 part B: what the touch harness reads when it sets window.__wp25 before the game loads: each touch the match
 *  screen saw and each tick's input, by performance.now(), for the touch → ShipInput latency. */
interface Wp25Probe {
  touches: { at: number; id: number; phase: string; x: number; y: number }[];
  ticks: { at: number; steer: number; sail: number; flags: number; consumable: number; aim: number; course: number }[];
  layout?: ReturnType<typeof hudLayout>;
  chartOpen?: () => boolean;
  course?: () => number;
}

/** The match in progress, drawn by the render modules; its interface and controls come with WP25. */
export function match(ctx: ScreenContext): Screen {
  const { world, session } = ctx.runtime;
  if (!world || !session) throw new Error('match: no match in progress');
  const view = new WorldView(ctx.pipeline, world);
  const frame: MatchFrame & { dt: number; clock: number; alpha: number } = { dt: 0, clock: 0, alpha: 1, state: session.state };
  // WP25: the controls feed the session's input, the HUD reads the match, the haptics feel each tick's events
  const ui = new THREE.Group(), controls = new Controls(), hud = new HudView(ctx.pipeline.style, ctx.lettering), reading = new HudState(), haptics = new Haptics();
  ui.add(hud.group);
  // WP25 part B: the rival arrows wash in each captain's team pigment
  hud.pigment = (j) => {
    const c = TEAMS[j % TEAMS.length].primary as unknown as ArrayLike<number> & { r?: number; g?: number; b?: number };
    const r = c.r ?? c[0], g = c.g ?? c[1], b = c.b ?? c[2], k = 255;
    return `rgb(${Math.round(r * k)}, ${Math.round(g * k)}, ${Math.round(b * k)})`;
  };
  // WP26: the settings in force — haptics on or off, reduced motion for the camera's lift (WP24)
  // the settings in force and live: haptics, reduced motion (the switch ORs with the system's preference; WP24's paper
  // veil covers the lift's cut), handedness (WP25 part B: the controls and the HUD mirrored for the left hand)
  const rig = view.rig, probe = (globalThis as { __wp25?: Wp25Probe }).__wp25;
  let left = settings().leftHanded === true, lastView: Parameters<typeof hudLayout>[0] | null = null, chart: CompactChart | null = null;
  const motion = { set reducedMotion(v: boolean) { rig.reducedMotion = v || prefersReducedMotion(); } } as { reducedMotion: boolean };
  const apply = (s: Settings): void => {
    applySettings(s, { haptics, motion });
    if ((s.leftHanded === true) !== left) { left = s.leftHanded === true; if (lastView) relayout(lastView); }
  };
  apply(settings());
  const unsubscribe = onSettings(apply);
  const veil = document.createElement('div'); // the paper veil over a reduced-motion cut (the rig's zoom.veil, 1 → 0)
  Object.assign(veil.style, { position: 'fixed', inset: '0', background: '#efe0c0', opacity: '0', pointerEvents: 'none', zIndex: '3' });
  document.body.appendChild(veil);
  let veiled = -1;
  function relayout(v: Parameters<typeof hudLayout>[0]): void {
    lastView = v;
    const L = hudLayout(v, left);
    controls.reset();
    controls.layout = L;
    hud.setLayout(L);
    // WP24 part D's compact chart in its slot: a canvas over the scrap (zero GPU draws), player-centred, the visible
    // ships, the storm ring and the gull's marks; a tap on the slot is the controls' 'chart' and the rig opens the chart
    chart?.dispose();
    const px = Math.round(Math.min(L.chart.width - 16 * L.u, L.chart.height - 6 * L.u));
    chart = new CompactChart(px);
    Object.assign(chart.canvas.style, { position: 'fixed', left: `${L.chart.x + (L.chart.width - px) / 2}px`, top: `${L.chart.y + (L.chart.height - px) / 2}px`, pointerEvents: 'none', zIndex: '2' });
    chart.mount(document.body);
    if (probe) probe.layout = L;
  }
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), globe = new THREE.Sphere(new THREE.Vector3(), R), hit = new THREE.Vector3();
  let vw = 1, vh = 1;
  controls.pick = (x, y) => {
    ndc.set((x / vw) * 2 - 1, 1 - (y / vh) * 2);
    ray.setFromCamera(ndc, view.camera);
    return ray.ray.intersectSphere(globe, hit) ? cellOf(TERRITORY, hit) : -1;
  };
  controls.riding = () => session.state.ships[0].phase === PHASE.riding;
  controls.onAct = (a) => { haptics.play(a === 'sail' ? 'sail' : 'tap'); };
  // WP24 part D's course drawing on the open chart: one finger strokes a course (inked live through chart.draft), a tap
  // on the edge band or off the net closes the chart, a tap on the sea clears the course, a second finger makes it the
  // pinch's. The course reaches the ship as ShipInput.course on the next tick (the validator checks every cell).
  const course = new CourseDrawing(view.chart.net);
  view.chart.draft = course.points;
  let courseFinger = -1, fingers = 0, downX = 0, downY = 0, pendingCourse: number[] | null = null;
  const chartTouch = (t: Parameters<typeof rig.pinch.touch>[0]): void => {
    controls.reset();
    rig.pinch.touch(t);
    if (t.phase === 'down') fingers++;
    else if (t.phase === 'up' || t.phase === 'cancel') fingers = Math.max(0, fingers - 1);
    const at = performance.now() / 1000;
    if (fingers > 1 && courseFinger >= 0) { course.cancel(); courseFinger = -1; }
    else if (t.phase === 'down' && fingers === 1 && lastView) { courseFinger = t.id; downX = t.x; downY = t.y; course.down(t.x, t.y, at, view.camera, lastView); }
    else if (t.id === courseFinger && t.phase === 'move' && lastView) course.move(t.x, t.y, view.camera, lastView);
    else if (t.id === courseFinger && (t.phase === 'up' || t.phase === 'cancel')) {
      courseFinger = -1;
      if (t.phase === 'cancel' || !lastView) { course.cancel(); return; }
      const g = course.up(t.x, t.y, at, view.camera, lastView);
      if (g.kind === 'course') { pendingCourse = g.cells; haptics.play('tap'); }
      else if (g.kind === 'close') rig.zoom.close();
      else if (Math.hypot(t.x - downX, t.y - downY) < COURSE.tapMove && session.state.ships[0].course.length) { pendingCourse = []; haptics.play('tap'); }
    }
  };
  ctx.runtime.input = () => {
    const i = controls.input();
    if (pendingCourse) { i.course = pendingCourse; pendingCourse = null; }
    if (probe) {
      probe.ticks.push({ at: performance.now(), steer: i.steer, sail: i.sail, flags: i.flags, consumable: i.consumable, aim: i.aim, course: i.course ? i.course.length : -1 });
      if (probe.ticks.length > 900) probe.ticks.splice(0, 450);
    }
    return i;
  };
  controls.onChart = () => { rig.zoom.open(); };
  if (probe) { probe.chartOpen = () => rig.chartOpen; probe.course = () => session.state.ships[0].course.length; }
  ctx.runtime.onTick = (s) => haptics.events(s.events, 0);
  return {
    ui,
    scene: view.scene,
    camera: view.camera,
    layout(v) {
      view.layout(v.width, v.height, v.safe);
      vw = v.width; vh = v.height;
      relayout(v);
    },
    frame(f) {
      view.drive = true;
      frame.dt = f.dt;
      frame.clock = f.clock;
      frame.alpha = f.alpha;
      view.frame(frame);
      const m = reading.update(session.sea, session.state, 0);
      haptics.watch({ gullFlight: m.gull.flight, inHome: m.inHome, stormEdge: m.storm.edge });
      haptics.flush();
      hud.frame(m, controls.view(), f.dt);
      if (chart) { // the compact chart, hidden while the chart itself is open
        const open = rig.chartOpen;
        if ((chart.canvas.style.display === 'none') !== open) chart.canvas.style.display = open ? 'none' : 'block';
        if (!open) chart.draw(session.state, world, view.sight(session.state), f.clock, Math.min(3, devicePixelRatio || 1));
      }
      const vv = Math.round(Math.min(1, rig.zoom.veil * 1.15) * 100) / 100;
      if (vv !== veiled) { veiled = vv; veil.style.opacity = String(vv); }
    },
    touch(t) {
      if (probe) probe.touches.push({ at: performance.now(), id: t.id, phase: t.phase, x: t.x, y: t.y });
      if (rig.chartOpen) { chartTouch(t); return; }
      for (const c of controls.touch(t)) rig.pinch.touch(c); // WP24: two fingers zoom deck ↔ chart; one finger is WP25's
    },
    // WP24: opening the chart pauses the match; the world holds still mid-motion while the camera lifts (PROMPT.md)
    paused: () => view.rig.chartOpen,
    dispose: () => {
      ctx.runtime.input = undefined;
      ctx.runtime.onTick = null;
      hud.dispose();
      chart?.dispose();
      chart = null;
      veil.remove();
      unsubscribe();
      course.cancel();
      view.dispose();
    },
  };
}

/** The voyage's end; a tap returns to the harbour. */
export function results(ctx: ScreenContext): Screen {
  return notice(ctx, 'The voyage ends', 0.12, false, () => ctx.runtime.show('harbour'));
}

import * as THREE from 'three';
import { InkText, type InkTextOptions } from '../lettering/ink.ts';
import { WorldView, type MatchFrame } from '../render/world.ts';
import { draw } from '../career/league.ts';
import { LESSON } from '../career/voyage.ts';
import { over } from '../sim/end.ts';
import { R, TERRITORY, cellOf } from '../sim/sphere.ts';
import { PHASE, afloat, type MatchState } from '../sim/state.ts';
import { calmNow } from '../sim/storm.ts';
import { ChestChoice } from './chestChoice.ts';
import { Controls } from './controls.ts';
import { Haptics } from './haptics.ts';
import { HudState, hudLayout, type HudLayout } from './hud.ts';
import { HudView } from './icons.ts';
import { ButtonBase, Scrap } from './parchment.ts';
import { ResultsSheet, SkipCard, fateWords, resultsModel, skipLayout } from './results.ts';
import { safeRect, type Rect, type View } from './safeArea.ts';
import { applySettings, onSettings, settings, type Settings } from './settings.ts';
import { CompactChart } from '../render/compactchart.ts';
import { COURSE, CourseDrawing } from '../render/course.ts';
import { prefersReducedMotion } from '../render/camera.ts';
import { TEAMS } from '../style/palette.ts';
import type { Screen, ScreenContext, Touch } from './shell.ts';
import { TutorialOverlay, newTutorial, sense, type Moment } from './tutorial.ts';

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

export function harbour(ctx: ScreenContext): Screen {
  const ui = new THREE.Group();
  let button: ButtonBase;
  let cx = 0, cy = 0, radius = 1;
  let finger: number | null = null;
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

interface Wp25Probe {
  touches: { at: number; id: number; phase: string; x: number; y: number }[];
  ticks: { at: number; steer: number; sail: number; flags: number; consumable: number; aim: number; course: number }[];
  layout?: ReturnType<typeof hudLayout>;
  chartOpen?: () => boolean;
  course?: () => number;
}

interface Wp27Probe {
  lesson?: () => number;
  moment?: () => Moment | null;
  tutorial?: () => { shown: number[]; closed: number[] } | null;
  lessons?: () => number[];
  prompt?: () => Rect | null;
  chest?: () => { cards: Rect[]; later: Rect } | null;
  chip?: () => Rect | null;
  skip?: () => Rect | null;
  sunk?: () => number;
  afloat?: () => number;
  results?: () => { page: number; button: Rect | null };
}
const probe27 = (): Wp27Probe | undefined => (globalThis as { __wp27?: Wp27Probe }).__wp27;

const SINKING = { playOut: 3, skipAfter: 1.5, skipLate: 15, beat: 3, rushed: 0.6 } as const;
const SKIP_Z = 0.98;
const RING = 32, PLAY_CALM = 1;
const AXES = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
function playOut(state: MatchState, po: { toward: THREE.Vector3; ring: THREE.Vector3[]; ships: THREE.Vector3[] }, first: boolean): void {
  const c = calmNow(state), small = c.r < PLAY_CALM, me = state.ships[0].pos;
  if (first) po.toward.set(small ? c.at.x : me.x, small ? c.at.y : me.y, small ? c.at.z : me.z).normalize();
  po.ring.length = 0;
  if (small) {
    const [a, e1, e2] = AXES, cr = Math.cos(c.r), sr = Math.sin(c.r);
    a.set(c.at.x, c.at.y, c.at.z).normalize();
    e1.set(Math.abs(a.x) < 0.9 ? 1 : 0, Math.abs(a.x) < 0.9 ? 0 : 1, 0).addScaledVector(a, -e1.dot(a)).normalize();
    e2.crossVectors(a, e1);
    for (let i = 0; i < RING; i++) {
      const th = (i / RING) * Math.PI * 2;
      po.ring.push((RING_DIRS[i] ??= new THREE.Vector3()).copy(a).multiplyScalar(cr).addScaledVector(e1, Math.cos(th) * sr).addScaledVector(e2, Math.sin(th) * sr));
    }
  }
  po.ships.length = 0;
  state.ships.forEach((q, i) => { if (afloat(q)) po.ships.push((SHIP_DIRS[i] ??= new THREE.Vector3()).set(q.pos.x, q.pos.y, q.pos.z).normalize()); });
}
const RING_DIRS: THREE.Vector3[] = [], SHIP_DIRS: THREE.Vector3[] = [];

const banded = (v: View): View['safe'] => ({ ...v.safe, bottom: Math.max(v.safe.bottom, skipLayout(v).band) });

function chipOf(L: HudLayout): Rect {
  const w = 64 * L.u, h = Math.max(48, 52 * L.u), gap = 8 * L.u, c = L.chart;
  return { x: L.left ? c.x + c.width + gap : c.x - gap - w, y: c.y + (c.height - h) / 2, width: w, height: h };
}

export function match(ctx: ScreenContext): Screen {
  const { world, session } = ctx.runtime;
  if (!world || !session) throw new Error('match: no match in progress');
  const view = new WorldView(ctx.pipeline, world);
  const frame: MatchFrame & { dt: number; clock: number; alpha: number } = { dt: 0, clock: 0, alpha: 1, state: session.state };
  const ui = new THREE.Group(), controls = new Controls(), hud = new HudView(ctx.pipeline.style, ctx.lettering), reading = new HudState(), haptics = new Haptics();
  ui.add(hud.group);
  hud.pigment = (j) => {
    const c = TEAMS[j % TEAMS.length].primary as unknown as ArrayLike<number> & { r?: number; g?: number; b?: number };
    const r = c.r ?? c[0], g = c.g ?? c[1], b = c.b ?? c[2], k = 255;
    return `rgb(${Math.round(r * k)}, ${Math.round(g * k)}, ${Math.round(b * k)})`;
  };
  const rig = view.rig, probe = (globalThis as { __wp25?: Wp25Probe }).__wp25;
  let left = settings().leftHanded === true, lastView: Parameters<typeof hudLayout>[0] | null = null, chart: CompactChart | null = null;
  const motion = { set reducedMotion(v: boolean) { rig.reducedMotion = v || prefersReducedMotion(); } } as { reducedMotion: boolean };
  const apply = (s: Settings): void => {
    applySettings(s, { haptics, motion });
    if ((s.leftHanded === true) !== left) { left = s.leftHanded === true; if (lastView) relayout(lastView); }
  };
  apply(settings());
  const unsubscribe = onSettings(apply);
  const rt = ctx.runtime, tutor = session.state.tick === 0 && session.state.charm, p27 = probe27();
  const chest = new ChestChoice((c) => { const e = rt.audio?.engine; if (c === 'open') e?.chestOpen(chest.tier); else if (c !== 'confirm') e?.ui(c); }, tutor);
  const tutorial = tutor ? new TutorialOverlay(newTutorial(), left, (c) => rt.audio?.engine.ui(c)) : null;
  const skip = new SkipCard(() => { rushing = true; rt.skip(); }, (c) => rt.audio?.engine.ui(c));
  ui.add(chest.group);
  if (tutorial) ui.add(tutorial.group);
  const framed = { toward: new THREE.Vector3(), ring: [] as THREE.Vector3[], ships: [] as THREE.Vector3[] };
  let sunk = -1, ending = '', rushing = false, closing: number | null = null;
  let hudNow: HudLayout | null = null;
  if (p27) {
    p27.lesson = () => tutorial?.showing ?? -1;
    p27.moment = () => (rt.voyage ? sense(session.state, rt.voyage) : null);
    p27.tutorial = () => tutorial && { shown: [...tutorial.state.shown], closed: [...tutorial.state.closed] };
    p27.lessons = () => [...(rt.voyage?.lessons ?? [])];
    p27.prompt = () => tutorial?.card ?? null;
    p27.chest = () => { const l = chest.sheetLayout; return l && { cards: l.cards, later: l.later }; };
    p27.chip = () => chest.chipRect;
    p27.skip = () => (skip.group.visible ? skip.button : null);
    p27.sunk = () => sunk;
    p27.afloat = () => session.state.ships.filter(afloat).length;
  }
  const veil = document.createElement('div');
  Object.assign(veil.style, { position: 'fixed', inset: '0', background: '#efe0c0', opacity: '0', pointerEvents: 'none', zIndex: '3' });
  document.body.appendChild(veil);
  let veiled = -1;
  function relayout(v: Parameters<typeof hudLayout>[0]): void {
    lastView = v;
    const L = hudNow = hudLayout(v, left);
    controls.reset();
    controls.layout = L;
    hud.setLayout(L);
    chart?.dispose();
    const px = Math.round(Math.min(L.chart.width - 16 * L.u, L.chart.height - 6 * L.u));
    chart = new CompactChart(px);
    Object.assign(chart.canvas.style, { position: 'fixed', left: `${L.chart.x + (L.chart.width - px) / 2}px`, top: `${L.chart.y + (L.chart.height - px) / 2}px`, pointerEvents: 'none', zIndex: '2' });
    chart.mount(document.body);
    chest.layout(v, chipOf(L), L);
    tutorial?.layout(v, L);
    if (sunk >= 0) skip.layout(v);
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
    const i = controls.input(), pick = chest.take();
    if (pendingCourse) { i.course = pendingCourse; pendingCourse = null; }
    if (pick >= 0) i.chestPick = pick;
    if (probe) {
      probe.ticks.push({ at: performance.now(), steer: i.steer, sail: i.sail, flags: i.flags, consumable: i.consumable, aim: i.aim, course: i.course ? i.course.length : -1 });
      if (probe.ticks.length > 900) probe.ticks.splice(0, 450);
    }
    return i;
  };
  controls.onChart = () => { rig.zoom.open(); };
  if (probe) { probe.chartOpen = () => rig.chartOpen; probe.course = () => session.state.ships[0].course.length; }
  ctx.runtime.onTick = (s) => {
    haptics.events(s.events, 0);
    chest.watch(s.ships[0]);
    if (tutorial && rt.voyage) tutorial.update(s, rt.voyage);
  };
  return {
    ui,
    scene: view.scene,
    camera: view.camera,
    layout(v) {
      view.layout(v.width, v.height, sunk >= 0 ? banded(v) : v.safe);
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
      const state = session.state, gone = !afloat(state.ships[0]), open = rig.chartOpen;
      if (gone && sunk < 0) {
        sunk = 0;
        const fate = state.sunk.find((q) => q.ship === 0), c = rt.career;
        ending = fate && c ? fateWords(c, draw(c), fate.by, fate.cause) : 'Sunk';
        controls.reset();
        if (lastView) { skip.layout(lastView); view.layout(lastView.width, lastView.height, banded(lastView)); }
        skip.group.visible = false;
        ui.add(skip.group);
      }
      if (sunk >= 0) {
        playOut(state, framed, !rig.playOut);
        if (!rig.playOut) { view.chart.rootAt = framed.toward; rig.playOut = framed; }
        sunk += f.dt;
        skip.group.visible ||= sunk >= SINKING.skipAfter && (rig.z >= SKIP_Z || sunk >= SINKING.skipLate);
        skip.set(ending, state.ships.filter(afloat).length, rushing);
        if (skip.group.visible) skip.frame(f.dt);
      }
      hud.group.visible = !gone;
      chest.group.visible = !open && !gone;
      if (tutorial && chest.waiting && tutorial.showing === LESSON.chest) tutorial.fold();
      if (tutorial) tutorial.group.visible = !open && !gone && (!chest.open || tutorial.showing === LESSON.chest);
      chest.frame(f.dt);
      tutorial?.frame(f.dt);
      if (chart) {
        const sheet = chest.sheetLayout?.sheet, L = hudNow?.chart;
        const hide = open || gone || (!!sheet && !!L && sheet.x < L.x + L.width && L.x < sheet.x + sheet.width && sheet.y < L.y + L.height && L.y < sheet.y + sheet.height);
        if ((chart.canvas.style.display === 'none') !== hide) chart.canvas.style.display = hide ? 'none' : 'block';
        if (!hide) chart.draw(state, world, view.sight(state), f.clock, Math.min(3, devicePixelRatio || 1));
      }
      if (over(state) && (!gone || closing !== null || rig.chartOpen || rig.cine.opened)) {
        closing ??= gone ? SINKING.rushed : SINKING.beat;
        closing -= f.dt;
        if (closing <= 0) { closing = Infinity; queueMicrotask(() => rt.show('results')); }
      }
      const vv = Math.round(Math.min(1, rig.zoom.veil * 1.15) * 100) / 100;
      if (vv !== veiled) { veiled = vv; veil.style.opacity = String(vv); }
    },
    touch(t) {
      if (probe) probe.touches.push({ at: performance.now(), id: t.id, phase: t.phase, x: t.x, y: t.y });
      if (sunk >= 0) {
        if (!(skip.group.visible && skip.touch(t))) rig.pinch.touch(t);
        return;
      }
      if (!rig.chartOpen && (tutorial?.touch(t) || chest.touch(t))) return;
      if (rig.chartOpen) { chartTouch(t); return; }
      for (const c of controls.touch(t)) rig.pinch.touch(c);
    },
    paused: () => view.rig.chartOpen && sunk < 0,
    rate: () => (sunk >= 0 && view.rig.chartOpen ? SINKING.playOut : 1),
    dispose: () => {
      ctx.runtime.input = undefined;
      ctx.runtime.onTick = null;
      chest.dispose();
      tutorial?.dispose();
      skip.dispose();
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

export function results(ctx: ScreenContext): Screen {
  const rt = ctx.runtime, o = rt.outcome;
  if (!o) return notice(ctx, 'The voyage ends', 0.12, false, () => rt.show('harbour'));
  const ui = new THREE.Group(), back = new THREE.Group();
  const sheet = new ResultsSheet(resultsModel(o.before, o.after, o.result, o.drawn, o.voyage, o.gull), () => rt.show('harbour'), (c) => rt.audio?.engine.ui(c));
  ui.add(back, sheet.group);
  const p27 = probe27();
  if (p27) p27.results = () => ({ page: sheet.page, button: sheet.button });
  return {
    ...BARE,
    ui,
    layout(v) {
      clear(back);
      back.add(page(ctx, v));
      sheet.layout(v);
    },
    frame: (f) => sheet.frame(f.dt),
    touch: (t) => { sheet.touch(t); },
    dispose: () => {
      sheet.dispose();
      clear(back);
    },
  };
}

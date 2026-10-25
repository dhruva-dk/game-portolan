// WP27: the first voyage (PROMPT.md, The first voyage): a new career's first match, against the nine lowest captains at
// their gentlest (career/setup.ts; the first loop always succeeds, sim), teaches through play. Never a wall of text: at
// the right moment a scrap of parchment letters a few words, an inked hand's arrow runs to the control that does it and
// a ring pulses about it, and the scrap folds away as soon as the player has done it (WP10's Voyage records each LESSON
// as it happens). Seven moments, each shown at most once: leave the current, steer, close a loop, call the gull, choose
// from the chest, fire a broadside, run from the storm. The urgent three (storm, a rival in range, a chest on deck)
// hurry a calm one along; a tap folds the scrap early. The state is plain integers (ticks), saved with the match.
import * as THREE from 'three';
import type { Career } from '../career/state.ts';
import { LESSON, LESSONS, type Voyage } from '../career/voyage.ts';
import { drop, sheet, sheetMesh, type Sheet } from '../render/harbourScene.ts';
import { R } from '../sim/sphere.ts';
import { TICK, afloat, type MatchState } from '../sim/state.ts';
import { INK, nib, ring } from './icons.ts';
import { SEPIA, VERMILION, clamp01, clampRect, ease, inkRect, inset, inside, letter, quad, safeOf, scrap, type G, type Pt } from './inkpage.ts';
import type { Rect, View } from './safeArea.ts';
import type { Touch } from './shell.ts';

/** Seconds: the first prompt waits `open`; a prompt stays at least `hold`, at most `wait` (`hurry` with an urgent one due); `gap` between calm ones; a rival within `near` u is in range. */
export const TUTORIAL = { open: 4, hold: 3, wait: 16, hurry: 7, gap: 2, near: 30 } as const;

export type Anchor = 'stick' | 'home' | 'gull' | 'deck' | 'guns' | 'storm';
/** By LESSON, the words and the control they point at. */
export const PROMPTS: readonly { readonly words: string; readonly sub: string; readonly anchor: Anchor }[] = [
  { words: 'Leave the current', sub: 'steer out of the stream', anchor: 'stick' },
  { words: 'Steer with your thumb', sub: 'the sails set your speed', anchor: 'stick' },
  { words: 'Close a loop', sub: 'sail home to claim the sea', anchor: 'home' },
  { words: 'Call the gull', sub: 'it brings a chest', anchor: 'gull' },
  { words: 'Touch the one you want', sub: '', anchor: 'deck' }, // the sheet itself is headed "Choose one"
  { words: 'Fire a broadside', sub: 'turn your side to them', anchor: 'guns' },
  { words: 'Run from the storm', sub: 'keep inside the calm', anchor: 'storm' },
];

/** What the tutorial reads of a tick. */
export interface Moment {
  tick: number;
  breakOff: boolean;
  offer: boolean;
  rivalNear: boolean;
  stormNear: boolean;
  lessons: readonly number[];
}

export function sense(state: MatchState, v: Voyage): Moment {
  const me = state.ships[0], cosNear = Math.cos(TUTORIAL.near / R), lm = Math.hypot(me.pos.x, me.pos.y, me.pos.z) || 1;
  let near = false;
  for (let j = 1; j < state.ships.length && !near; j++) {
    const s = state.ships[j], ls = Math.hypot(s.pos.x, s.pos.y, s.pos.z) || 1;
    if (afloat(s) && (me.pos.x * s.pos.x + me.pos.y * s.pos.y + me.pos.z * s.pos.z) / (lm * ls) > cosNear) near = true;
  }
  return { tick: state.tick, breakOff: v.breakOff >= 0, offer: me.offer.length > 0, rivalNear: near && afloat(me), stormNear: v.storm > 0, lessons: v.lessons };
}

/** The tutorial's state: the lesson showing (−1 none) and since when; by LESSON the tick it was shown and folded (−1 not yet). */
export interface Tutorial {
  active: number;
  since: number;
  shown: number[];
  closed: number[];
}
export const newTutorial = (): Tutorial => ({ active: -1, since: 0, shown: new Array<number>(LESSONS).fill(-1), closed: new Array<number>(LESSONS).fill(-1) });
/** Only the career's first match teaches. */
export const isFirstVoyage = (career: Career): boolean => career.match === 0;

const ORDER = [LESSON.storm, LESSON.broadside, LESSON.chest, LESSON.gull, LESSON.loop, LESSON.steer, LESSON.breakOff];
const URGENT = new Set<number>([LESSON.storm, LESSON.broadside, LESSON.chest]);

function due(t: Tutorial, m: Moment, k: number): boolean {
  if (t.shown[k] >= 0 || m.lessons[k] >= 0) return false;
  const past = (j: number): boolean => t.closed[j] >= 0 || m.lessons[j] >= 0;
  switch (k) {
    case LESSON.breakOff: return m.tick * TICK >= TUTORIAL.open;
    case LESSON.steer: return past(LESSON.breakOff);
    case LESSON.loop: return past(LESSON.steer) && m.breakOff;
    case LESSON.gull: return past(LESSON.loop);
    case LESSON.chest: return m.offer;
    case LESSON.broadside: return m.rivalNear && past(LESSON.steer);
    case LESSON.storm: return m.stormNear;
  }
  return false;
}

function close(t: Tutorial, tick: number): void {
  t.closed[t.active] = tick;
  t.active = -1;
  t.since = tick;
}

/** One tick of the tutorial: the lesson to show now (−1 none). Each lesson is shown at most once. */
export function tutorialStep(t: Tutorial, m: Moment): number {
  if (t.active >= 0) {
    const k = t.active, held = (m.tick - t.since) * TICK;
    const done = m.lessons[k] >= 0 || (k === LESSON.chest && !m.offer);
    const urgent = !URGENT.has(k) && ORDER.some((j) => j !== k && URGENT.has(j) && due(t, m, j));
    if (!((done && held >= TUTORIAL.hold) || held >= (urgent ? TUTORIAL.hurry : TUTORIAL.wait))) return k;
    close(t, m.tick);
  }
  const quiet = t.closed.some((c) => c >= 0) && (m.tick - t.since) * TICK < TUTORIAL.gap;
  for (const k of ORDER) {
    if (due(t, m, k) && (!quiet || URGENT.has(k))) {
      t.active = k;
      t.shown[k] = m.tick;
      t.since = m.tick;
      return k;
    }
  }
  return -1;
}

/** A tap folds the scrap showing. */
export function dismiss(t: Tutorial, tick: number): void { if (t.active >= 0) close(t, tick); }
/** Every lesson learned or taught. */
export const tutorialOver = (t: Tutorial, lessons: readonly number[]): boolean => t.active < 0 && lessons.every((l, k) => l >= 0 || t.closed[k] >= 0);

export interface PromptLayout {
  lesson: number;
  /** The control pointed at. */
  at: { x: number; y: number };
  card: Rect;
  /** The sheet's bounds: the card, the arrow and the ring. */
  bounds: Rect;
  k: number;
}

/** Where the controls are on screen (the match screen gives the HUD's own layout, part B). */
export type Anchors = Partial<Record<Anchor, { x: number; y: number }>>;

/** Where the scrap and its arrow go for a lesson: at `anchors`' control, else the WP25 HUD's thumb zones, mirrored for the left-handed. */
export function promptLayout(view: View, lesson: number, leftHanded = false, anchors: Anchors = {}): PromptLayout {
  const s = safeOf(view), k = Math.max(1, Math.min(1.45, s.height / 420)), a = PROMPTS[lesson].anchor;
  const fx = (f: number): number => s.x + s.width * (leftHanded ? 1 - f : f);
  const at = anchors[a] ?? (a === 'stick' ? { x: fx(0.13), y: s.y + s.height * 0.74 }
    : a === 'guns' ? { x: fx(0.87), y: s.y + s.height * 0.74 }
    : a === 'gull' ? { x: fx(0.87), y: s.y + s.height * 0.42 }
    : a === 'home' ? { x: fx(0.95), y: s.y + s.height * 0.6 }
    : a === 'storm' ? { x: s.x + s.width * 0.5, y: s.y + 26 * k }
    : { x: s.x + s.width / 2, y: s.y + s.height / 2 });
  const w = 300 * k, h = (PROMPTS[lesson].sub ? 80 : 56) * k;
  let cx = at.x + (s.x + s.width / 2 - at.x) * 0.55, cy = at.y + (s.y + s.height * 0.42 - at.y) * 0.55;
  if (a === 'deck') {
    cx = s.x + w / 2 + 8 * k;
    cy = s.y + h / 2 + 8 * k;
  } else if (a === 'storm') cy = at.y + 70 * k + h / 2;
  const card = clampRect({ x: cx - w / 2, y: cy - h / 2, width: w, height: h }, inset(s, 4));
  const ringR = 40 * k, x0 = Math.min(card.x, at.x - ringR), y0 = Math.min(card.y, at.y - ringR);
  const x1 = Math.max(card.x + card.width, at.x + ringR), y1 = Math.max(card.y + card.height, at.y + ringR);
  const bounds = a === 'deck' ? inset(card, -6) : { x: x0 - 6, y: y0 - 6, width: x1 - x0 + 12, height: y1 - y0 + 12 };
  return { lesson, at, card, bounds, k };
}

function toward(r: Rect, p: { x: number; y: number }): Pt {
  const cx = r.x + r.width / 2, cy = r.y + r.height / 2, dx = p.x - cx, dy = p.y - cy;
  const f = Math.min(Math.abs((r.width / 2) / (dx || 1e-6)), Math.abs((r.height / 2) / (dy || 1e-6)));
  return [cx + dx * f, cy + dy * f];
}

/** A prompt `t` s after it appeared: the scrap, its words written in, the arrow drawn to the control, the ring pulsing. */
export function drawPrompt(g: G, pl: PromptLayout, t: number): void {
  const { card: r, k, at, lesson } = pl, P = PROMPTS[lesson], a = ease(t / 0.35);
  if (a <= 0) return;
  g.save();
  g.globalAlpha *= a;
  if (P.anchor !== 'deck') {
    const from = toward(r, at), dx = at.x - from[0], dy = at.y - from[1], len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len;
    const end: Pt = [at.x - ux * 34 * k, at.y - uy * 34 * k], mid: Pt = [(from[0] + end[0]) / 2 - uy * len * 0.16, (from[1] + end[1]) / 2 + ux * len * 0.16];
    const pa = clamp01((t - 0.25) / 0.6), curve = quad(from, mid, end, 20);
    nib(g, curve, 2.4 * k, pa, VERMILION);
    if (pa >= 1) {
      const [px, py] = curve[curve.length - 2], hx = end[0] - px, hy = end[1] - py, hl = Math.hypot(hx, hy) || 1, bx = hx / hl, by = hy / hl;
      nib(g, [[end[0] - bx * 12 * k - by * 7 * k, end[1] - by * 12 * k + bx * 7 * k], end, [end[0] - bx * 12 * k + by * 7 * k, end[1] - by * 12 * k - bx * 7 * k]], 2.2 * k, 1, VERMILION);
    }
    const pulse = 0.5 + 0.5 * Math.sin(t * 4.2);
    nib(g, ring(at.x, at.y, (28 + 5 * pulse) * k, 7 + lesson), 1.8 * k, clamp01((t - 0.6) / 0.6), VERMILION, 0.45 + 0.4 * pulse);
  }
  scrap(g, r, 600 + lesson);
  inkRect(g, inset(r, 4 * k), 610 + lesson, clamp01(t / 0.6), SEPIA, 1.1 * k);
  letter(g, P.words, r.x + r.width / 2, P.sub ? r.y + 30 * k : r.y + r.height / 2, { size: 25 * k, align: 'center', valign: 'middle', swash: true }, INK, clamp01((t - 0.15) / 0.9));
  if (P.sub) letter(g, P.sub, r.x + r.width / 2, r.y + 59 * k, { size: 15 * k, align: 'center', valign: 'middle' }, SEPIA, clamp01((t - 0.7) / 0.8));
  g.restore();
}

/** The first voyage in the match: feed it each tick's state and Voyage; it shows and folds the prompts. */
export class TutorialOverlay {
  readonly group = new THREE.Group();
  private sheet: Sheet | null = null;
  private mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> | null = null;
  private view: View | null = null;
  private pl: PromptLayout | null = null;
  private shown = -1;
  private t = 0;
  private acc = 0;
  private tick = 0;
  private anchors: Anchors = {};
  private finger = -1; // the finger that landed on the scrap

  readonly state: Tutorial;
  private readonly leftHanded: boolean;
  private readonly cue: (c: 'quill') => void;

  constructor(state: Tutorial = newTutorial(), leftHanded = false, cue: (c: 'quill') => void = () => {}) {
    this.state = state;
    this.leftHanded = leftHanded;
    this.cue = cue;
  }

  /** The lesson whose prompt is up (−1 none) and its scrap, which a tap folds. */
  get showing(): number { return this.shown; }
  get card(): Rect | null { return this.pl?.card ?? null; }

  update(match: MatchState, v: Voyage): number {
    this.tick = match.tick;
    const k = tutorialStep(this.state, sense(match, v));
    if (k !== this.shown) {
      this.shown = k;
      this.t = 0;
      if (k >= 0) this.cue('quill');
      this.rebuild();
    }
    return k;
  }

  /** The view, and where its controls are (the HUD's layout). */
  layout(view: View, anchors: Anchors = {}): void {
    this.view = view;
    this.anchors = anchors;
    this.rebuild();
  }

  /** True when the prompt took the touch: a finger that landed on its scrap, to its end; a tap there folds it. */
  touch(t: Touch): boolean {
    if (t.phase === 'down') {
      if (this.finger >= 0 || this.pl === null || !inside(this.pl.card, t.x, t.y)) return false;
      this.finger = t.id;
      return true;
    }
    if (t.id !== this.finger) return false;
    if (t.phase === 'move') return true;
    this.finger = -1;
    if (t.phase === 'up' && this.pl !== null && inside(this.pl.card, t.x, t.y)) {
      dismiss(this.state, this.tick);
      this.shown = -1;
      this.rebuild();
    }
    return true;
  }

  frame(dt: number): void {
    if (this.pl === null) return;
    this.t += dt;
    this.acc += dt;
    if (this.acc >= 1 / 20) {
      this.acc = 0;
      this.redraw();
    }
  }

  dispose(): void {
    drop(this.group);
    this.pl = null;
  }

  private rebuild(): void {
    drop(this.group);
    this.mesh = this.sheet = this.pl = null;
    if (this.shown < 0 || this.view === null) return;
    const pl = this.pl = promptLayout(this.view, this.shown, this.leftHanded, this.anchors), b = pl.bounds;
    this.sheet = sheet(b.width, b.height, 900_000, this.view.dpr);
    this.mesh = sheetMesh(this.sheet);
    this.mesh.position.set(b.x + b.width / 2, b.y + b.height / 2, 0);
    this.mesh.renderOrder = 40;
    this.group.add(this.mesh);
    this.redraw();
  }

  private redraw(): void {
    const s = this.sheet, pl = this.pl, m = this.mesh;
    if (!s || !pl || !m) return;
    s.g.clearRect(0, 0, s.w, s.h);
    s.g.save();
    s.g.translate(-pl.bounds.x, -pl.bounds.y);
    drawPrompt(s.g, pl, this.t);
    s.g.restore();
    if (m.material.map) m.material.map.needsUpdate = true;
  }
}

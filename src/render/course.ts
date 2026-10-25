// WP24 part D: drawing a course on the open chart with a finger, and the edge tap (PROMPT, The chart: "Drawing a
// course on the chart with a finger sets the ship's route. Tapping the chart's edge zooms back down to the deck, the
// match resumes, and the ship sails the drawn course until the player touches the stick again"). The stroke is
// unprojected onto the globe (Net.unproject), resampled every COURSE.spacing u along it and turned into territory
// cells: the same ShipInput.course a captain's helm draws (route.ts sails it until the stick is touched).
import * as THREE from 'three';
import { idleInput, type ShipInput } from '../sim/input.ts';
import { cellOf, R, TERRITORY } from '../sim/sphere.ts';
import type { RigView } from './camera.ts';
import type { Net } from './chart.ts';

/** u between the course's points; the most and least points; CSS px of the edge band; a tap's most travel and time. */
export const COURSE = { spacing: 6, most: 64, least: 2, edge: 30, tapMove: 12, tapTime: 0.4 } as const;

type XYZ = { x: number; y: number; z: number };

/** A stroke on the globe (directions in order) → course cells, every `spacing` u along it, at most `most`. */
export function courseCells(dirs: readonly XYZ[], spacing: number = COURSE.spacing, most: number = COURSE.most): number[] {
  let out: number[] = [];
  if (!dirs.length) return out;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), p = new THREE.Vector3();
  const push = (v: THREE.Vector3) => { const c = cellOf(TERRITORY, v); if (out[out.length - 1] !== c) out.push(c); };
  a.set(dirs[0].x, dirs[0].y, dirs[0].z).normalize();
  push(a);
  let acc = 0;
  for (let i = 1; i < dirs.length; i++) {
    b.set(dirs[i].x, dirs[i].y, dirs[i].z).normalize();
    const len = Math.acos(Math.min(1, Math.max(-1, a.dot(b)))) * R;
    let t = spacing - acc;
    while (t <= len) { p.copy(a).lerp(b, t / len).normalize(); push(p); t += spacing; }
    acc = len - (t - spacing);
    a.copy(b);
  }
  push(a);
  if (out.length > most) {
    const all = out;
    out = [];
    for (let k = 0; k < most; k++) { const c = all[Math.round((k * (all.length - 1)) / (most - 1))]; if (out[out.length - 1] !== c) out.push(c); }
  }
  return out.length >= COURSE.least ? out : [];
}

/** The input that sets a drawn course (the field a captain's helm fills). */
export function courseInput(cells: readonly number[]): ShipInput {
  return { ...idleInput(), course: cells.slice() };
}

/** In the edge band of the view, inside its safe area. */
export function atEdge(x: number, y: number, view: RigView, band: number = COURSE.edge): boolean {
  const s = view.safe;
  return x < s.left + band || x > view.width - s.right - band || y < s.top + band || y > view.height - s.bottom - band;
}

export type ChartGesture = { kind: 'course'; cells: number[]; input: ShipInput } | { kind: 'close' } | { kind: 'none' };

/**
 * One finger on the open chart (WP25 forwards it while rig.chartOpen and the pinch has not taken it): a stroke draws
 * a course (its points inked live through Chart.draft = points), a tap on the edge band or off the net closes the
 * chart (WP25: rig.zoom.close()). up() returns what the gesture was.
 */
export class CourseDrawing {
  readonly points: THREE.Vector3[] = [];
  private x0 = 0; private y0 = 0; private t0 = 0; private moved = 0; private active = false;
  readonly net: Net;
  private readonly tmp = new THREE.Vector3();
  constructor(net: Net) { this.net = net; }
  get drawing(): boolean { return this.active; }
  down(x: number, y: number, t: number, camera: THREE.PerspectiveCamera, view: RigView): void {
    this.points.length = 0;
    this.x0 = x; this.y0 = y; this.t0 = t; this.moved = 0; this.active = true;
    this.add(x, y, camera, view);
  }
  move(x: number, y: number, camera: THREE.PerspectiveCamera, view: RigView): void {
    if (!this.active) return;
    this.moved = Math.max(this.moved, Math.hypot(x - this.x0, y - this.y0));
    this.add(x, y, camera, view);
  }
  up(x: number, y: number, t: number, camera: THREE.PerspectiveCamera, view: RigView): ChartGesture {
    if (!this.active) return { kind: 'none' };
    this.move(x, y, camera, view);
    this.active = false;
    const tap = this.moved < COURSE.tapMove && t - this.t0 < COURSE.tapTime;
    if (tap) {
      this.points.length = 0;
      return atEdge(x, y, view) || !this.net.unproject(x, y, camera, view, this.tmp) ? { kind: 'close' } : { kind: 'none' };
    }
    const cells = courseCells(this.points);
    this.points.length = 0;
    return cells.length ? { kind: 'course', cells, input: courseInput(cells) } : { kind: 'none' };
  }
  cancel(): void { this.active = false; this.points.length = 0; }
  private add(x: number, y: number, camera: THREE.PerspectiveCamera, view: RigView): void {
    const d = this.net.unproject(x, y, camera, view, this.tmp);
    if (d) this.points.push(new THREE.Vector3(d.x, d.y, d.z));
  }
}

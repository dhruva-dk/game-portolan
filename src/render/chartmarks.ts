// WP24 part D: the chart's content past chart.ts's coasts, washes, roses and names: trails in sight (the player's
// solid vermilion, each rival's dashed in its own measure), the player's waters inked round their edge, the player's
// known loot (find sites and chests within sight of its deck or marked by its gull), a landmark vignette per region
// drawn in ink like the little pictures of a real portolan, the Great Current as a chart current (dashed banks and
// chevrons downstream), the drawn course and the stroke a finger is drawing. All screen-sized (px × pxU) into the
// marks mesh's builder, so none costs a draw. Shared with the compact chart (compactchart.ts): watersFor, knownLoot.
import * as THREE from 'three';
import type { World } from '../app/worldWorker.ts';
import { seaFor, type Sea } from '../sim/environment.ts';
import { gullMarks } from '../sim/gull.ts';
import { cellDir, neighbor, R, TERRITORY } from '../sim/sphere.ts';
import { PHASE, SHIPS, type MatchState } from '../sim/state.ts';
import { GREAT_CURRENT } from '../sim/tables.ts';
import { linearVec } from '../style/glsl.ts';
import { PIGMENTS } from '../style/palette.ts';
import { vert, type Builder, type Net } from './chart.ts';

const PLAYER = 0;
type XYZ = { x: number; y: number; z: number };
const V = () => new THREE.Vector3();
const solid = (c: Parameters<typeof linearVec>[0]): number[] => [...linearVec(c).toArray(), 2];

const waters = new WeakMap<object, { seed: number; sea: Sea }>();
/** The match's waters (environment.ts seaFor) for a world and seed, made once per match. */
export function watersFor(world: World, seed: number): Sea {
  const w = waters.get(world);
  if (w && w.seed === seed) return w.sea;
  const sea = seaFor(world, seed);
  waters.set(world, { seed, sea });
  return sea;
}

/** u: loot within this of the player's deck is known to its chart without the gull. */
export const KNOWN = { reach: 46 } as const;
export interface Loot { finds: number[]; chests: number[]; gullFinds: number[]; gullChests: number[] }
/** The player's known loot: find sites there to take and chests afloat, in sight of its deck or marked by its gull. */
export function knownLoot(sea: Sea, state: MatchState, out: Loot = { finds: [], chests: [], gullFinds: [], gullChests: [] }): Loot {
  gullMarks(sea, state, PLAYER, out.gullFinds, out.gullChests);
  out.finds.length = out.chests.length = 0;
  const me = state.ships[PLAYER].pos, cos = Math.cos(KNOWN.reach / R), lm = Math.hypot(me.x, me.y, me.z);
  const near = (p: XYZ) => (p.x * me.x + p.y * me.y + p.z * me.z) / (lm * Math.hypot(p.x, p.y, p.z)) >= cos;
  const sites = sea.geo.finds;
  for (let k = 0; k < sites.length; k++) if (state.finds[k] === 0 && (out.gullFinds.includes(k) || near(sites[k].pos))) out.finds.push(k);
  for (let c = 0; c < state.chests.length; c++) if (out.gullChests.includes(c) || near(state.chests[c].at)) out.chests.push(c);
  return out;
}

let edgeKey = '', edgeDirs: THREE.Vector3[] = [];
/** The cells on the edge of a ship's waters (owned, with a neighbour not), as directions; cached per tick. */
export function watersEdge(state: MatchState, owner = PLAYER + 1): THREE.Vector3[] {
  const key = `${state.seed}:${state.tick}:${owner}`;
  if (key === edgeKey) return edgeDirs;
  edgeKey = key;
  edgeDirs = [];
  const o = state.owner, n = TERRITORY.cells;
  for (let c = 0; c < n; c++) {
    if (o[c] !== owner) continue;
    for (let k = 0; k < 4; k++) if (o[neighbor(TERRITORY, c, k)] !== owner) { const v = V(); cellDir(TERRITORY, c, v); edgeDirs.push(v.normalize()); break; }
  }
  return edgeDirs;
}

const arc = (cx: number, cy: number, rx: number, ry: number, a0: number, a1: number, n = 14): number[] => {
  const o: number[] = [];
  for (let i = 0; i <= n; i++) { const a = a0 + ((a1 - a0) * i) / n; o.push(cx + rx * Math.cos(a), cy + ry * Math.sin(a)); }
  return o;
};
const spiral = (turns: number, r: number, n = 44): number[] => {
  const o: number[] = [];
  for (let i = 0; i <= n; i++) { const t = i / n, a = t * turns * 2 * Math.PI; o.push(r * t * Math.cos(a), r * t * 0.8 * Math.sin(a)); }
  return o;
};
/** Each region's landmark as a little ink drawing (polylines in a box −1..1, y up), by its perk. */
export const VIGNETTES: Record<string, readonly (readonly number[])[]> = {
  crownLight: [[-1, -0.8, -0.55, -0.55, 0.55, -0.55, 1, -0.8], [-0.3, -0.55, -0.18, 0.4, 0.18, 0.4, 0.3, -0.55], [-0.24, -0.15, 0.24, -0.15], [-0.21, 0.13, 0.21, 0.13], [-0.18, 0.4, -0.18, 0.62, 0.18, 0.62, 0.18, 0.4], [-0.26, 0.62, 0, 0.88, 0.26, 0.62], [0.32, 0.56, 0.95, 0.78], [-0.32, 0.56, -0.95, 0.78], [0.32, 0.46, 0.95, 0.32], [-0.32, 0.46, -0.95, 0.32]],
  greatFalls: [[-1, -0.8, -0.95, 0.55, -0.15, 0.62, 0, 0.5], [-0.1, 0.55, 0.05, 0.2, 0.1, -0.7], [0.05, 0.56, 0.25, 0.2, 0.32, -0.7], [0.2, 0.56, 0.45, 0.22, 0.54, -0.7], [-0.05, -0.8, 0.15, -0.66, 0.35, -0.8, 0.55, -0.66, 0.75, -0.8], [-0.8, 0.2, -0.45, 0.25], [-0.75, -0.25, -0.4, -0.2]],
  arch: [[-1, -0.8, -0.85, 0.45, -0.35, 0.8, 0.35, 0.8, 0.85, 0.45, 1, -0.8], arc(0, -0.8, 0.5, 1.05, 0, Math.PI), [-1, -0.9, 1, -0.9], [-0.6, 0.5, -0.3, 0.62], [0.3, 0.62, 0.6, 0.5]],
  kelpCathedral: [[-1, -0.85, 1, -0.85], [-0.6, -0.85, -0.72, -0.2, -0.52, 0.3, -0.66, 0.85], [0, -0.85, 0.1, -0.1, -0.08, 0.5, 0.04, 1], [0.6, -0.85, 0.5, -0.2, 0.7, 0.3, 0.56, 0.85], [-0.7, -0.2, -0.92, -0.04], [-0.55, 0.3, -0.33, 0.44], [0.1, -0.1, 0.32, 0.05], [-0.06, 0.48, -0.28, 0.62], [0.52, -0.2, 0.3, -0.05], [0.68, 0.3, 0.9, 0.45]],
  sandbarLight: [[-1, -0.7, -0.45, -0.48, 0.45, -0.48, 1, -0.7], [-0.15, -0.48, -0.1, 0.25, 0.1, 0.25, 0.15, -0.48], [-0.14, 0.25, 0, 0.45, 0.14, 0.25], [0.2, 0.32, 0.65, 0.45], [-0.2, 0.32, -0.65, 0.45], [-0.95, -0.85, -0.5, -0.8, 0, -0.85, 0.5, -0.8, 0.95, -0.85]],
  weepingIsle: [[-1, -0.7, -0.6, -0.42, 0.6, -0.42, 1, -0.7], [0, -0.42, 0.02, 0.42], [0.02, 0.42, -0.45, 0.55, -0.72, 0.02], [0.02, 0.42, 0.48, 0.55, 0.72, 0.02], [0.02, 0.46, -0.22, 0.66, -0.36, -0.1], [0.02, 0.46, 0.26, 0.66, 0.38, -0.1], [-0.55, -0.12, -0.55, -0.26], [0.56, -0.12, 0.56, -0.26]],
  whaleRoad: [[-1, -0.3, -0.62, 0.08, 0, 0.24, 0.5, 0.1, 0.8, -0.2], [0.8, -0.2, 1, 0.12], [0.8, -0.2, 1, -0.42], [-0.42, 0.16, -0.45, 0.66], [-0.45, 0.66, -0.7, 0.88], [-0.45, 0.66, -0.2, 0.88], [-1, -0.5, -0.6, -0.4, -0.2, -0.5, 0.2, -0.4, 0.6, -0.5, 1, -0.4]],
  caldera: [[-1, -0.8, -0.35, 0.4, -0.15, 0.3, 0.15, 0.3, 0.35, 0.4, 1, -0.8], [0, 0.36, -0.16, 0.6, 0.1, 0.8, -0.05, 1.02], [0.16, 0.4, 0.32, 0.6, 0.22, 0.86], [-0.1, 0.3, -0.32, -0.32], [0.12, 0.3, 0.26, -0.22], [-0.7, -0.5, -0.45, -0.1], [0.72, -0.5, 0.5, -0.1]],
  rootGate: [[-0.8, -0.8, -0.72, 0, -0.5, 0.58, 0, 0.84, 0.5, 0.58, 0.72, 0, 0.8, -0.8], [-0.72, 0, -1, -0.8], [-0.62, 0.3, -0.42, -0.8], [0.72, 0, 1, -0.8], [0.62, 0.3, 0.42, -0.8], [-0.95, 0.7, -0.45, 1, 0.45, 1, 0.95, 0.7]],
  greatLagoon: [arc(0, -0.2, 0.95, 0.55, 0.35, 2 * Math.PI - 0.05, 22), [0.45, -0.1, 0.5, 0.55], [0.5, 0.55, 0.22, 0.45], [0.5, 0.55, 0.8, 0.45], [0.5, 0.55, 0.38, 0.78], [0.5, 0.55, 0.66, 0.78]],
  spiceHarbour: [[-1, -0.6, 1, -0.6], [-0.75, -0.6, -0.75, 0.1, -0.35, 0.5, 0.05, 0.1, 0.05, -0.6], [-0.48, -0.6, -0.48, -0.25, -0.22, -0.25, -0.22, -0.6], [0.3, -0.6, 0.3, 0.55, 0.62, 0.55, 0.62, -0.6], arc(0.46, 0.55, 0.16, 0.26, 0, Math.PI, 8), [0.46, 0.81, 0.46, 1.02, 0.7, 0.95, 0.46, 0.89], [-1, -0.75, -0.6, -0.68, -0.2, -0.75]],
  eye: [spiral(2.6, 0.95), [-1, 0.9, -0.7, 0.7], [1, -0.9, 0.7, -0.7]],
};
/** CSS px: a vignette's half-size, its line's half-width, how far above its spot it stands (in half-sizes). */
export const VIGNETTE = { half: 7.5, line: 0.55, lift: 1.25 } as const;

/** Where a direction lands on its sheet (chart.ts's flat sheet space) into out; returns the sheet. */
function onSheet(net: Net, d: XYZ, out: THREE.Vector3): number {
  out.set(d.x, d.y, d.z).normalize();
  const k = net.sheetOf(out), c = net.centres[k];
  out.multiplyScalar(R / Math.max(0.2, out.dot(c)));
  return k;
}

/** A polyline of directions inked as a ribbon of half-width `half` (u), solid or dashed (dash, gap in u). */
export function stroke(b: Builder, net: Net, dirs: readonly XYZ[], half: number, col: readonly number[], dash = 0, gap = 0): void {
  const prev = V(), cur = V(), t = V(), side = V();
  let pk = -1, run = 0;
  for (let i = 0; i < dirs.length; i++) {
    const k = onSheet(net, dirs[i], cur), c = net.centres[k];
    if (i > 0 && k === pk) {
      const len = t.subVectors(cur, prev).length();
      if (len > 1e-6) {
        if (dash <= 0 || run % (dash + gap) < dash) {
          side.crossVectors(c, t).normalize().multiplyScalar(half);
          const q = [prev.clone().sub(side), cur.clone().sub(side), cur.clone().add(side), prev.clone().add(side)];
          for (const j of [0, 1, 2, 0, 2, 3]) vert(b, q[j], k, null, 0, col, 0, 0);
        }
        run += len;
      }
    }
    prev.copy(cur);
    pk = k;
  }
}

/** The sheet's screen up and right at sheet k (the net's fit up carried back through the sheet's pose). */
function sheetFrame(net: Net, k: number, fitUp: THREE.Vector3, up: THREE.Vector3, right: THREE.Vector3): void {
  const c = net.centres[k];
  up.copy(fitUp).applyMatrix3(new THREE.Matrix3().setFromMatrix4(net.final[k]).invert());
  up.addScaledVector(c, -up.dot(c)).normalize();
  right.crossVectors(up, c).normalize();
}

/** A drawing (polylines in −1..1) at a direction, s u to a unit, lifted `lift` units up the sheet. */
function picture(b: Builder, net: Net, at: XYZ, fitUp: THREE.Vector3, s: number, lines: readonly (readonly number[])[], half: number, col: readonly number[], lift = 0): void {
  const o = V(), k = onSheet(net, at, o), c = net.centres[k], up = V(), right = V();
  sheetFrame(net, k, fitUp, up, right);
  const P = (x: number, y: number) => o.clone().addScaledVector(right, x * s).addScaledVector(up, (y + lift) * s);
  for (const L of lines) for (let i = 0; i + 3 < L.length; i += 2) {
    const a = P(L[i], L[i + 1]), e = P(L[i + 2], L[i + 3]), t = e.clone().sub(a), len = t.length();
    if (len < 1e-6) continue;
    const side = new THREE.Vector3().crossVectors(c, t).normalize().multiplyScalar(half), ext = t.multiplyScalar((half * 0.7) / len);
    const q = [a.clone().sub(side).sub(ext), e.clone().sub(side).add(ext), e.clone().add(side).add(ext), a.clone().add(side).sub(ext)];
    for (const j of [0, 1, 2, 0, 2, 3]) vert(b, q[j], k, null, 0, col, 0, 0);
  }
}

/** A filled diamond of half-diagonal r (u) at a direction. */
function diamond(b: Builder, net: Net, at: XYZ, fitUp: THREE.Vector3, r: number, col: readonly number[]): void {
  const o = V(), k = onSheet(net, at, o), up = V(), right = V();
  sheetFrame(net, k, fitUp, up, right);
  const q = [o.clone().addScaledVector(up, r), o.clone().addScaledVector(right, r), o.clone().addScaledVector(up, -r), o.clone().addScaledVector(right, -r)];
  for (const j of [0, 1, 2, 0, 2, 3]) vert(b, q[j], k, null, 0, col, 0, 0);
}

const X_MARK = [[-1, -1, 1, 1], [-1, 1, 1, -1]];
const GULL_MARK = [[-1, 0.2, -0.5, 0.55, 0, 0.15, 0.5, 0.55, 1, 0.2]];
const WRECK_RING = Array.from({ length: 21 }, (_, i) => [Math.cos((i / 20) * Math.PI * 2), Math.sin((i / 20) * Math.PI * 2)]).flat();

/** The Great Current: its banks dashed and chevrons riding its middle downstream, every CURRENT_CHEVRON px. */
function current(b: Builder, net: Net, sea: Sea, pxU: number, col: readonly number[]): void {
  const pts = sea.current.points, n = Math.floor(pts.length / 3), half = GREAT_CURRENT.width / 2 / R;
  const P = (i: number, out: THREE.Vector3) => out.set(pts[3 * i], pts[3 * i + 1], pts[3 * i + 2]).normalize();
  const l: THREE.Vector3[] = [], r: THREE.Vector3[] = [], a = V(), bb = V(), t = V(), side = V();
  for (let i = 0; i < n; i++) {
    P(Math.max(0, i - 1), a); P(Math.min(n - 1, i + 1), bb);
    const p = P(i, V());
    t.subVectors(bb, a).normalize();
    side.crossVectors(p, t).normalize();
    l.push(p.clone().addScaledVector(side, half).normalize());
    r.push(p.clone().addScaledVector(side, -half).normalize());
  }
  stroke(b, net, l, 0.5 * pxU, col, 5 * pxU, 3 * pxU);
  stroke(b, net, r, 0.5 * pxU, col, 5 * pxU, 3 * pxU);
  const every = 46 * pxU, L = 4.5 * pxU / R;
  let run = every * 0.5;
  for (let i = 1; i < n; i++) {
    const p = P(i, V()), q = P(i - 1, V());
    run += Math.acos(Math.min(1, p.dot(q))) * R;
    if (run < every) continue;
    run = 0;
    t.subVectors(p, q).normalize();
    side.crossVectors(p, t).normalize();
    const tip = p.clone().addScaledVector(t, L).normalize();
    for (const sgn of [-1, 1]) stroke(b, net, [p.clone().addScaledVector(t, -L).addScaledVector(side, sgn * L).normalize(), tip], 0.7 * pxU, col);
    stroke(b, net, [p.clone().addScaledVector(t, -2.2 * L).normalize(), p.clone().addScaledVector(t, 0.4 * L).normalize()], 0.45 * pxU, col);
  }
}

const loot: Loot = { finds: [], chests: [], gullFinds: [], gullChests: [] };
const cellAt = (c: number) => cellDir(TERRITORY, c, V());

/** WP24 part D: everything chart.ts's ships() lays under the ship marks, for the player's sight `mask`. */
export function chartContent(b: Builder, net: Net, state: MatchState, world: World | null, mask: number, pxU: number, fitUp: THREE.Vector3, draft: readonly XYZ[]): void {
  const ink = solid(PIGMENTS.ironGall), mine = solid(PIGMENTS.vermilion), gold = solid(PIGMENTS.goldLeaf), stream = solid(PIGMENTS.indigo);
  const sea = world ? watersFor(world, state.seed) : null;
  if (sea) current(b, net, sea, pxU, stream);
  // the player's waters: a fine vermilion line round their edge, one dot a pixel along it
  const seen = new Set<string>(), q = 0.9 * pxU;
  const edge: THREE.Vector3[] = [];
  for (const d of watersEdge(state)) {
    const key = `${Math.round((d.x * R) / q)},${Math.round((d.y * R) / q)},${Math.round((d.z * R) / q)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    edge.push(d);
  }
  for (const d of edge) diamond(b, net, d, fitUp, 0.85 * pxU, mine);
  // trails in sight: the player's solid, each rival's dashed in its own measure
  for (let i = 0; i < SHIPS && i < state.ships.length; i++) {
    if (i !== PLAYER && !(mask & (1 << i))) continue;
    const laid = state.ships[i].laid;
    if (laid.length < 2) continue;
    const dirs = laid.map(cellAt);
    if (i === PLAYER) stroke(b, net, dirs, 0.95 * pxU, mine);
    else stroke(b, net, dirs, 0.75 * pxU, ink, (2.5 + (i % 4)) * pxU, 2.2 * pxU);
  }
  // WP27 (S-019): where the player went down, once she is gone and the match plays out on the chart: a vermilion cross
  // in a ring (chart.ts draws no hull for her then)
  const me = state.ships[PLAYER];
  if (me && me.phase === PHASE.sunk) {
    picture(b, net, me.pos, fitUp, 6 * pxU, X_MARK, 1.2 * pxU, mine);
    picture(b, net, me.pos, fitUp, 10 * pxU, [WRECK_RING], 0.8 * pxU, mine);
  }
  // the landmarks, each drawn standing over its spot
  if (sea) for (let k = 0; k < sea.geo.landmarks.length; k++) {
    const lines = VIGNETTES[sea.geo.landmarks[k].perk];
    if (!lines) continue;
    const at = cellAt(sea.marks[k]);
    picture(b, net, at, fitUp, VIGNETTE.half * pxU, lines, VIGNETTE.line * pxU, ink, VIGNETTE.lift);
    diamond(b, net, at, fitUp, 1.1 * pxU, ink);
  }
  // the player's known loot: find sites an ink cross on gold, chests a gold lozenge edged in ink; the gull's with its mark
  if (sea) {
    knownLoot(sea, state, loot);
    for (const k of loot.finds) {
      const at = sea.geo.finds[k].pos;
      diamond(b, net, at, fitUp, 2.6 * pxU, gold);
      picture(b, net, at, fitUp, 2.4 * pxU, X_MARK, 0.6 * pxU, ink);
      if (loot.gullFinds.includes(k)) picture(b, net, at, fitUp, 2.2 * pxU, GULL_MARK, 0.45 * pxU, ink, 2.2);
    }
    for (const c of loot.chests) {
      const at = state.chests[c].at;
      diamond(b, net, at, fitUp, 3.4 * pxU, ink);
      diamond(b, net, at, fitUp, 2.4 * pxU, gold);
      if (loot.gullChests.includes(c)) picture(b, net, at, fitUp, 2.2 * pxU, GULL_MARK, 0.45 * pxU, ink, 2.4);
    }
  }
  // the drawn course, dotted, and the stroke under the finger
  const course = state.ships[PLAYER].course;
  if (course.length > 1) stroke(b, net, course.map(cellAt), 0.8 * pxU, mine, 1.6 * pxU, 2.4 * pxU);
  if (draft.length > 1) stroke(b, net, draft, 0.8 * pxU, mine);
}

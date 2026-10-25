// The Amber Shoals (WP16 part D): tidal flats and sandbars in warm gold light round the Sandbar Light. The sea and
// the terrain already move the waterline with the WP6 tide (the bars emerge and drown, the sand darkens where wet);
// this module draws what the tide leaves behind and how it runs. On the sand: ripple marks along the contours,
// drainage channels holding water films down every flank, and shell-and-wrack drifts on the strandline, all bedded
// just over the drawn sand, so the terrain's drawn water covers each while the tide is over it and the ebb uncovers
// it. On the water: standing riffles over every bar wherever it is too shallow for a hull (the sim's own test,
// height above tide − DRAFT) and current streaks running through each inlet once its sill is deep enough to pass,
// flooding in on the rising tide and ebbing out on the falling, so the passages open and close exactly as the nav
// opens and closes them. The landmark, the Sandbar Light (the WP15 lighthouse at the spit's tip), is made the hero:
// sand drifts banked in its lee against the plinth, a revetment ring of dressed stones round its foot, tide-washed
// stones collared in weed, a line of set stones along the beach into the sea (drowned block by block as the tide
// makes), and its reflection
// drawn as an engraver draws one, in broken horizontal strokes across the wet sand and water toward the eye.
// Wading birds are WP23's: `feeding` holds the spots on the flats the ebb uncovers.
import * as THREE from 'three';
import { illustratedMaterial, type Style } from '../../style/glsl.ts';
import { PIGMENTS } from '../../style/palette.ts';
import { CLEAR, heightAt, toChart } from '../../sim/world/geography.ts';
import { DRAFT, REGIONS, TIDE } from '../../sim/world/regions.ts';
import { seas } from '../sea.ts';
import { layLighthouses, type Tower } from '../structures.ts';
import type { Swell, SwellSample } from '../swell.ts';
import { GROUND, terrains, type Ground, type Surface, type TerrainField } from '../terrain.ts';
import type { RenderContext, RenderModule } from '../world.ts';
import { chartDir, Draw, Kit, lift, pose, regionSeen, ring, seeded, vec, washOf, type V, type Wash } from './kit.ts';

const RI = REGIONS.findIndex((r) => r.id === 'amberShoals');
const REGION = REGIONS[RI];
const TAU = 2 * Math.PI;
/** Draped parts lie this far over the drawn sand (u): under the terrain's drawn water whenever the tide covers them. */
const DRAPE = 0.03;
/** Ripples and shell drifts are drawn within `near` u of the eye, riffles and streaks within `far`; grid steps (u)
 *  for ripples, shells and channel heads; the wind's lee (chart radians from east) the light's sand drifts trail to;
 *  reflection strokes. */
export const SHOALS = { near: 55, far: 130, ripple: 1.5, shell: 1.0, channel: 2.2, lee: 0.35, strokes: 18 } as const;

const W = {
  sand: washOf(PIGMENTS.ochre, 0.42), lee: washOf(PIGMENTS.umber, 0.42), film: washOf(PIGMENTS.leadWhite, 0.55),
  shell: washOf(PIGMENTS.leadWhite, 1.0), wrack: washOf(PIGMENTS.sepia, 0.85), foam: washOf(PIGMENTS.leadWhite, 1.1),
  streak: washOf(PIGMENTS.leadWhite, 0.6), stone: washOf(PIGMENTS.umber, 0.45), weed: washOf(PIGMENTS.verdigris, 0.95),
  block: washOf(PIGMENTS.leadWhite, 0.75), drift: washOf(PIGMENTS.ochre, 0.36), tower: washOf(PIGMENTS.leadWhite, 0.75),
  lamp: washOf(PIGMENTS.goldLeaf, 1.0),
};

/** How strongly the riffles over a bar show at water `depth` (u): > 0 only while it is too shallow for a hull. */
export const shoal = (depth: number): number => Math.min((depth - 0.04) / 0.12, (DRAFT - 0.02 - depth) / 0.12, 1);
/** Whether an inlet's sill at water `depth` (u, its highest floor across the nav's clearance) passes a hull. */
export const open = (depth: number): boolean => depth >= DRAFT + 0.02;

const Y_UP = vec(0, 1, 0), N1 = vec(), E1 = vec();

/** Builds a kit's triangles, each painted with the current wash (or by `pick`) and turned to face `up`. */
class Painter {
  wash: Wash = W.sand;
  pick: ((centre: V, normal: V) => Wash) | null = null;
  readonly kit = new Kit((c, n) => (this.pick ? this.pick(c, n) : this.wash));

  tri(a: V, b: V, c: V, up: V = Y_UP): void {
    N1.subVectors(b, a).cross(E1.subVectors(c, a));
    if (N1.dot(up) < 0) this.kit.tri(a, c, b);
    else this.kit.tri(a, b, c);
  }
}

/** A ridge along x at z(x), dying into the sand at both ends: its stoss face rising from `back` behind to the crest
 *  `h` high, its lee face falling to `front`, its foot `sink` under the surface. */
function ridge(p: Painter, x0: number, x1: number, n: number, z: (x: number) => number, back: number, front: number,
  h: number, sink: number, stoss: Wash, lee: Wash): void {
  const sec = (x: number): V[] => {
    const t = Math.sqrt(Math.max(Math.sin((Math.PI * (x - x0)) / (x1 - x0)), 0)), zc = z(x);
    return [vec(x, -sink, zc - back), vec(x, -sink + (h + sink) * t, zc), vec(x, -sink, zc + front)];
  };
  let a = sec(x0);
  for (let i = 1; i <= n; i++) {
    const b = sec(x0 + ((x1 - x0) * i) / n);
    p.wash = stoss;
    p.tri(a[0], a[1], b[1]);
    p.tri(a[0], b[1], b[0]);
    p.wash = lee;
    p.tri(a[1], a[2], b[2]);
    p.tri(a[1], b[2], b[1]);
    a = b;
  }
}

/** A dressed block from y0 to y1, half-widths hx and hz, its top edges bevelled by `bevel` (share of its height). */
function block(p: Painter, hx: number, hz: number, y0: number, y1: number, bevel: number, jig: () => number): void {
  const sq = (y: number, k: number): V[] =>
    [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sz]) => vec(sx * hx * k * jig(), y, sz * hz * k * jig()));
  p.kit.loft([sq(y0, 1), sq(y1 - bevel * (y1 - y0), 1), sq(y1, 1 - bevel)]);
}

/** Three sinuous wave-ripple crests along x, 0.46 apart down the slope (z), steep faces downslope. */
function rippleKit(): THREE.BufferGeometry {
  const p = new Painter(), rng = seeded(211);
  for (const z0 of [-0.46, 0, 0.46]) {
    const ph = rng() * TAU, a = 0.05 + 0.04 * rng(), x0 = -0.64 + 0.12 * rng(), x1 = 0.64 - 0.12 * rng();
    ridge(p, x0, x1, 6, (x) => z0 + a * Math.sin(5.5 * x + ph), 0.13, 0.07, 0.045, 0.03, W.sand, W.lee);
  }
  return p.kit.build();
}

/** A strandline drift: a bank of pale shell along the high-water mark, a dark line of wrack above it, loose shells. */
function shellKit(): THREE.BufferGeometry {
  const p = new Painter(), rng = seeded(223);
  ridge(p, -0.7, 0.7, 7, (x) => 0.05 * Math.sin(4 * x + 1), 0.07, 0.07, 0.03, 0.02, W.shell, W.shell);
  ridge(p, -0.55, 0.6, 6, (x) => -0.17 + 0.06 * Math.sin(3.3 * x), 0.05, 0.05, 0.035, 0.02, W.wrack, W.wrack);
  p.wash = W.shell;
  for (let i = 0; i < 7; i++) {
    const x = (rng() - 0.5) * 1.3, z = 0.1 + (rng() - 0.5) * 0.3, r = 0.03 + 0.02 * rng(), tip = vec(x, 0.03, z);
    const base = [0, 1, 2].map((k) => vec(x + r * Math.cos((k * TAU) / 3 + i), -0.02, z + r * Math.sin((k * TAU) / 3 + i)));
    for (let k = 0; k < 3; k++) p.tri(base[k], base[(k + 1) % 3], tip);
  }
  return p.kit.build();
}

/** A standing wave over a shoal: two foam crescents bowed downstream (+z), the lesser behind. */
function riffleKit(): THREE.BufferGeometry {
  const p = new Painter();
  for (const [z0, s] of [[0, 1], [-0.34, 0.68]] as const) {
    ridge(p, -0.5 * s, 0.5 * s, 6, (x) => z0 + 0.22 * s * (1 - ((2 * x) / s) ** 2), 0.05, 0.04, 0.03, 0.015, W.foam, W.foam);
  }
  return p.kit.build();
}

/** A current streak: a long thin line of drift on the water along x. */
function streakKit(): THREE.BufferGeometry {
  const p = new Painter();
  ridge(p, -0.5, 0.5, 6, () => 0, 0.024, 0.024, 0.01, 0.004, W.streak, W.streak);
  return p.kit.build();
}

/** A reflection stroke: a thin flat bar a unit long (x) and deep (z). */
function strokeKit(w: Wash): THREE.BufferGeometry {
  const p = new Painter();
  p.wash = w;
  block(p, 0.5, 0.5, -0.004, 0.006, 0, () => 1);
  return p.kit.build();
}

/** A sand drift: a low dome, its skirt sunk 0.6 of its height to bed it on uneven ground. */
function moundKit(): THREE.BufferGeometry {
  const p = new Painter(), ys = [-0.6, 0, 0.4, 0.72, 0.92, 1], rs = [1, 1, 0.86, 0.6, 0.33, 0.08];
  p.wash = W.drift;
  p.kit.loft(ys.map((y, i) => ring(12, y, (j) => rs[i] * (1 + 0.05 * Math.sin(j * 2.1 + i)))));
  return p.kit.build();
}

/** A tide-washed stone: rounded and irregular, a collar of weed just over the ground line, its crown bleached. */
function boulderKit(seed: number): THREE.BufferGeometry {
  const p = new Painter(), rng = seeded(seed), ys = [-0.75, -0.3, 0.1, 0.42, 0.62], rs = [0.7, 1, 0.98, 0.72, 0.3];
  const jit = Array.from({ length: ys.length * 8 }, () => 0.82 + 0.3 * rng());
  p.pick = (c) => (c.y < 0.3 ? W.weed : W.stone);
  p.kit.loft(ys.map((y, i) => ring(8, y, (j) => rs[i] * jit[i * 8 + j])));
  return p.kit.build();
}

/** A groyne block: a dressed stone, weed on its lower courses. */
function blockKit(): THREE.BufferGeometry {
  const p = new Painter(), rng = seeded(239);
  p.pick = (c) => (c.y < 0.05 ? W.weed : W.block);
  block(p, 1, 1, -0.5, 0.5, 0.16, () => 0.95 + 0.1 * rng());
  return p.kit.build();
}

export interface Spot { m: THREE.Matrix4; at: V }
/** A part bedded in the ground at `dir`: its lowest and highest points (u over mean sea level). */
export interface Bedded { m: THREE.Matrix4; dir: V; low: number; high: number }
/** A riffle over a bar: its floor (the sim's height), the flood's direction across the bar, turn and size. */
export interface Riffle { dir: V; floor: number; flow: V; yaw: number; size: number }
/** A streak through an inlet: where it crosses the sill, the sill's highest floor across the nav's clearance. */
export interface Streak { dir: V; floor: number; flow: V; phase: number; length: number }
export interface Channel { left: V[]; right: V[] }
export interface AmberPlan {
  tower: Tower;
  ripples: Spot[];
  shells: Spot[];
  channels: Channel[];
  riffles: Riffle[];
  streaks: Streak[];
  stones: Bedded[];
  blocks: Bedded[];
  drifts: Bedded[];
  feeding: V[];
}

const surfaceOut = (): Surface => ({ height: 0, normal: vec(), up: 1, ground: GROUND.beach as Ground, region: RI });

/** Lay out the region: the tide's marks on the sand, the riffles and streaks over the bars, the Sandbar Light's dressing. */
export function planAmber(field: TerrainField): AmberPlan {
  const geo = field.geo, rng = seeded(216), S = surfaceOut(), g = { x: 0, y: 0 };
  const ground = (x: number, y: number): number => field.surface(chartDir(RI, x, y), -10, S).height;
  const slope = (x: number, y: number): number => {
    g.x = (ground(x + 0.4, y) - ground(x - 0.4, y)) / 0.8;
    g.y = (ground(x, y + 0.4) - ground(x, y - 0.4)) / 0.8;
    return Math.hypot(g.x, g.y);
  };
  const tangent = (x: number, y: number, dx: number, dy: number): V => chartDir(RI, x + dx, y + dy).sub(chartDir(RI, x, y)).normalize();
  const mark = chartDir(RI, REGION.landmark.x, REGION.landmark.y);
  const tower = layLighthouses(geo, field).filter((t) => t.region === RI).sort((a, b) => b.up.dot(mark) - a.up.dot(mark))[0];
  if (!tower) throw new Error('planAmber: the Sandbar Light has no lighthouse');
  const { x: tx, y: ty } = toChart(RI, tower.up), s = tower.scale;
  const fromTower = (x: number, y: number) => Math.hypot(x - tx, y - ty);
  const spot = (x: number, y: number, h: number, yaw: number, k: number): Spot => {
    const dir = chartDir(RI, x, y), sl = slope(x, y), down = sl > 1e-3 ? tangent(x, y, -g.x / sl, -g.y / sl) : tangent(x, y, 1, 0);
    field.surface(dir, -10, S);
    const at = lift(dir, h);
    return { at, m: pose(new THREE.Matrix4(), at, S.normal, down, yaw, 0, k, 1, k) };
  };

  // ripple marks over the sand the tide uncovers and a little above it, along the contours
  const ripples: Spot[] = [], shells: Spot[] = [];
  for (let y = -62; y <= 62; y += SHOALS.ripple) {
    for (let x = -62; x <= 62; x += SHOALS.ripple) {
      const px = x + 0.7 * SHOALS.ripple * (rng() - 0.5), py = y + 0.7 * SHOALS.ripple * (rng() - 0.5);
      if (Math.hypot(px, py) > 64 || fromTower(px, py) < 4.6 * s) continue;
      const h = ground(px, py);
      if (h < -TIDE.amp - 0.05 || h > TIDE.amp + 0.35 || slope(px, py) > 0.5) continue;
      ripples.push(spot(px, py, h, 0.25 * (rng() - 0.5), 1 + 0.35 * rng()));
    }
  }
  // shell and wrack drifts along the strandline, the high-water mark
  for (let y = -62; y <= 62; y += SHOALS.shell) {
    for (let x = -62; x <= 62; x += SHOALS.shell) {
      const px = x + 0.6 * (rng() - 0.5), py = y + 0.6 * (rng() - 0.5), h = ground(px, py);
      if (h < TIDE.amp - 0.08 || h > TIDE.amp + 0.12 || rng() > 0.6 || fromTower(px, py) < 4.6 * s) continue;
      shells.push(spot(px, py, h, 0.3 * (rng() - 0.5), 0.9 + 0.3 * rng()));
    }
  }

  // drainage channels: from heads on the flats' flanks down the fall to the lowest water, meandering, a tributary
  // ending where it meets a channel already cut
  const channels: Channel[] = [], cut = new Set<number>();
  const key = (x: number, y: number) => Math.round(x * 2) * 4096 + Math.round(y * 2);
  for (let y = -62; y <= 62; y += SHOALS.channel) {
    for (let x = -62; x <= 62; x += SHOALS.channel) {
      let px = x + SHOALS.channel * (rng() - 0.5), py = y + SHOALS.channel * (rng() - 0.5);
      const h0 = ground(px, py), ph = rng() * TAU;
      if (rng() > 0.6 || h0 < -0.5 || h0 > 0.55 || fromTower(px, py) < 6 || Math.hypot(px, py) > 62) continue;
      const pts: { x: number; y: number }[] = [{ x: px, y: py }];
      for (let i = 0; i < 80; i++) {
        const sl = slope(px, py);
        if (sl < 0.004) break;
        const turn = 0.65 * Math.sin(0.5 * i + ph), c = Math.cos(turn), sn = Math.sin(turn), dx = -g.x / sl, dy = -g.y / sl;
        px += 0.45 * (dx * c - dy * sn);
        py += 0.45 * (dx * sn + dy * c);
        pts.push({ x: px, y: py });
        if (cut.has(key(px, py)) || ground(px, py) < -TIDE.amp - 0.2) break;
      }
      if (pts.length < 5) continue;
      for (const q of pts) cut.add(key(q.x, q.y));
      const left: V[] = [], right: V[] = [];
      pts.forEach((q, i) => {
        const a = pts[Math.max(i - 1, 0)], b = pts[Math.min(i + 1, pts.length - 1)], l = Math.hypot(b.x - a.x, b.y - a.y) || 1;
        const w = Math.min(0.16 + 0.02 * i, 0.7), ox = (-(b.y - a.y) / l) * w, oy = ((b.x - a.x) / l) * w;
        left.push(lift(chartDir(RI, q.x + ox, q.y + oy), ground(q.x + ox, q.y + oy) + DRAPE));
        right.push(lift(chartDir(RI, q.x - ox, q.y - oy), ground(q.x - ox, q.y - oy) + DRAPE));
      });
      channels.push({ left, right });
    }
  }

  // riffles over every bar, streaks through the four inlets between the barrier islands
  const riffles: Riffle[] = [], streaks: Streak[] = [];
  const sill = (x: number, y: number, nx: number, ny: number, ux: number, uy: number): number => {
    let top = -Infinity;
    for (let o = -CLEAR; o <= CLEAR; o++) for (let l = -1; l <= 1; l++) top = Math.max(top, heightAt(geo, chartDir(RI, x + nx * o + ux * l, y + ny * o + uy * l)));
    return top;
  };
  for (const st of REGION.strokes) {
    if (st.k !== 'bar') continue;
    const P = st.pts, n = P.length / 2;
    let mx = 0, my = 0;
    for (let i = 0; i < n; i++) { mx += P[2 * i] / n; my += P[2 * i + 1] / n; }
    const inlet = n === 2 && Math.hypot(mx, my) > 28 && Math.hypot(mx, my) < 45;
    for (let i = 0; i + 1 < n; i++) {
      const ax = P[2 * i], ay = P[2 * i + 1], bx = P[2 * i + 2], by = P[2 * i + 3], len = Math.hypot(bx - ax, by - ay);
      const ux = (bx - ax) / len, uy = (by - ay) / len;
      let nx = -uy, ny = ux;
      if (nx * (ax + bx) + ny * (ay + by) > 0) { nx = -nx; ny = -ny; } // the flood runs toward the basin's middle
      for (let d = 0.9; d < len; d += 1.8) {
        for (const o of [-1.3, -0.45, 0.45, 1.3]) {
          const along = d + 0.5 * (rng() - 0.5), off = o * st.w + 0.4 * (rng() - 0.5);
          const x = ax + ux * along + nx * off, y = ay + uy * along + ny * off, dir = chartDir(RI, x, y), floor = heightAt(geo, dir);
          if (floor > TIDE.amp - 0.05 || floor < -TIDE.amp - DRAFT) continue;
          riffles.push({ dir, floor, flow: tangent(x, y, nx, ny), yaw: 0.3 * (rng() - 0.5), size: 0.9 + 0.5 * rng() });
        }
      }
      if (!inlet) continue;
      for (let d = 0.2 * len; d <= 0.8 * len + 1e-6; d += len / 14) {
        const x = ax + ux * d, y = ay + uy * d, dir = chartDir(RI, x, y), floor = sill(x, y, nx, ny, ux, uy);
        for (let r = 0; r < 3; r++) streaks.push({ dir, floor, flow: tangent(x, y, nx, ny), phase: rng() * 14, length: 2.4 + 2 * rng() });
      }
    }
  }

  // the stone line: set stones from the light's foot along the beach into the sea, drowned block by block as the tide makes
  // (it runs where the beach shelves gentlest into the sea: the bearing with the longest run of intertidal sand)
  let best = 0, most = -1;
  for (let k = 0; k < 36; k++) {
    const a = (k / 36) * TAU;
    let run = 0, sea = false;
    for (let r = 4 * s + 1; r < 24; r += 0.95) {
      const h = ground(tx + r * Math.cos(a), ty + r * Math.sin(a));
      if (h > 1.6) break;
      if (h < -TIDE.amp - 0.9) { sea = true; break; }
      if (h < TIDE.amp + 0.3) run++;
    }
    if ((sea ? run + 100 : run) > most) { most = sea ? run + 100 : run; best = a; } // it must reach the sea
  }
  const gx = Math.cos(best), gy = Math.sin(best), blocks: Bedded[] = [];
  for (let r = 4 * s + 1; r < 24; r += 0.95) {
    const x = tx + gx * r + 0.08 * (rng() - 0.5), y = ty + gy * r + 0.08 * (rng() - 0.5), dir = chartDir(RI, x, y), h = ground(x, y);
    field.surface(dir, -10, S);
    const sx = 0.42 + 0.05 * rng(), sy = 0.62 + 0.1 * rng(), sz = 0.4 + 0.05 * rng(), o = h + 0.06;
    blocks.push({ dir, low: o - 0.5 * sy, high: o + 0.5 * sy, m: pose(new THREE.Matrix4(), lift(dir, o), S.normal, tangent(x, y, gx, gy), 0.1 * (rng() - 0.5), 0, sx, sy, sz) });
    if (h < -TIDE.amp - 0.9) break;
  }

  // the revetment: a ring of set stones round the light's foot, tide-washed where the beach falls away to the sea
  const ring0 = 4 * s, count = Math.round((TAU * ring0) / 0.95);
  for (let k = 0; k < count; k++) {
    const a = (k / count) * TAU;
    if (Math.abs(Math.atan2(Math.sin(a - best), Math.cos(a - best))) < 0.6 / ring0) continue; // the groyne's root
    const x = tx + ring0 * Math.cos(a), y = ty + ring0 * Math.sin(a), dir = chartDir(RI, x, y), h = ground(x, y);
    if (h < -TIDE.amp - 0.9) continue;
    field.surface(dir, -10, S);
    const sy = 0.7 + 0.1 * rng(), o = h + 0.1;
    blocks.push({ dir, low: o - 0.5 * sy, high: o + 0.5 * sy, m: pose(new THREE.Matrix4(), lift(dir, o), S.normal, tangent(x, y, -Math.sin(a), Math.cos(a)), 0.06 * (rng() - 0.5), 0, 0.4, sy, 0.47 + 0.03 * rng()) });
  }

  // tide-washed stones round the foot, half of them on the arcs of an older breakwater ring the sea has broken,
  // clear of the groyne, the tower's own boulders and each other
  const stones: Bedded[] = [], placed: number[] = [];
  for (let tries = 0; tries < 900 && stones.length < 72; tries++) {
    const old = tries % 2 === 0, a = rng() * TAU, r = old ? 7.5 * s + 0.7 * (rng() - 0.5) : 5 * s + 11 * rng() ** 1.4, x = tx + r * Math.cos(a), y = ty + r * Math.sin(a), h = ground(x, y);
    if (h < -TIDE.amp - 0.5 || h > 0.5) continue;
    const size = old ? 0.45 + 0.3 * rng() : (0.24 + 0.45 * rng()) * (1 - 0.4 * Math.min(r / 15, 1)), along = (x - tx) * gx + (y - ty) * gy;
    if (along > 0 && Math.abs((y - ty) * gx - (x - tx) * gy) < 1 + size) continue;
    let clash = false;
    for (let i = 0; i < placed.length && !clash; i += 3) clash = Math.hypot(placed[i] - x, placed[i + 1] - y) < 1.25 * (placed[i + 2] + size) + 0.1;
    if (clash) continue;
    placed.push(x, y, size);
    const dir = chartDir(RI, x, y), sy = size * (0.6 + 0.3 * rng()), o = h - 0.15 * sy;
    field.surface(dir, -10, S);
    stones.push({ dir, low: o - 0.75 * sy, high: o + 0.62 * sy, m: pose(new THREE.Matrix4(), lift(dir, o), S.normal, tangent(x, y, 1, 0), rng() * TAU, 0, size, sy, size * (0.8 + 0.3 * rng())) });
  }

  // sand drifts banked against the plinth and trailing to the lee
  const drifts: Bedded[] = [];
  for (let k = 0; k < 16; k++) {
    const a = SHOALS.lee + (k - 7.5) * 0.39 + 0.15 * (rng() - 0.5), lee = Math.max(Math.cos(a - SHOALS.lee), 0);
    const len = 0.8 + (0.4 + 1.8 * lee) * rng(), wide = 0.6 + 0.5 * rng(), tall = 0.22 + 0.3 * rng();
    const r = 1.45 * s + len * 0.5, ca = Math.cos(a), sa = Math.sin(a), x = tx + r * ca, y = ty + r * sa;
    let lo = Infinity, hi = -Infinity, mean = 0;
    for (let q = 0; q < 8; q++) {
      const b = (q * TAU) / 8, fx = len * Math.cos(b), fy = wide * Math.sin(b), h = ground(x + fx * ca - fy * sa, y + fx * sa + fy * ca);
      lo = Math.min(lo, h);
      hi = Math.max(hi, h);
      mean += h / 8;
    }
    if (hi - lo > 2.5 * tall || lo < 0.1) continue; // only on sand the neaps leave dry
    const dir = chartDir(RI, x, y), o = Math.min(mean, lo + 0.58 * tall);
    if (o + 0.75 * tall < ground(x, y)) continue; // its crown would be buried
    drifts.push({ dir, low: o - 0.6 * tall, high: o + tall, m: pose(new THREE.Matrix4(), lift(dir, o), dir, tangent(x, y, ca, sa), 0, 0, wide, tall, len) });
  }

  // where the waders feed: the flats the ebb uncovers inside each habitat
  const feeding: V[] = [];
  for (const f of REGION.fauna) {
    if (f.species !== 'wader') continue;
    for (let i = 0, n = 0; i < 8 * f.count && n < f.count; i++) {
      const a = rng() * TAU, r = f.r * Math.sqrt(rng()), x = f.x + r * Math.cos(a), y = f.y + r * Math.sin(a), h = ground(x, y);
      if (h < -TIDE.amp || h > 0.2) continue;
      feeding.push(chartDir(RI, x, y));
      n++;
    }
  }
  return { tower, ripples, shells, channels, riffles, streaks, stones, blocks, drifts, feeding };
}

/** Every channel as a ribbon of water film draped on the sand (world space, one draw). */
function channelGeometry(channels: readonly Channel[]): THREE.BufferGeometry {
  const p = new Painter(), up = vec();
  p.wash = W.film;
  for (const { left: L, right: Rt } of channels) {
    for (let i = 0; i + 1 < L.length; i++) {
      up.copy(L[i]).normalize();
      p.tri(L[i], Rt[i], Rt[i + 1], up);
      p.tri(L[i], Rt[i + 1], L[i + 1], up);
    }
  }
  return p.kit.build();
}

const T1 = vec(), T2 = vec(), T3 = vec(), T4 = vec(), T5 = vec();

export class AmberShoals {
  readonly group = new THREE.Group();
  /** Where WP23's waders feed: unit directions over the flats the ebb uncovers. */
  readonly feeding: readonly V[];
  readonly plan: AmberPlan;
  private readonly material: THREE.ShaderMaterial;
  private readonly ripples: Draw;
  private readonly shells: Draw;
  private readonly riffles: Draw;
  private readonly streaks: Draw;
  private readonly strokes: Draw[];
  private readonly fixed: Draw[];
  private readonly field: TerrainField;
  private readonly swell: Swell;
  private readonly sample: SwellSample = { height: 0, normal: vec() };
  private readonly S = surfaceOut();
  private readonly seen = vec(1e9, 0, 0);
  private readonly m = new THREE.Matrix4();
  private readonly R = lift(vec(1, 0, 0), 0).length();
  private level = NaN;
  /** +1 while the tide floods (streaks run in, riffles bow inward), −1 while it ebbs. */
  private flow = 1;

  constructor(style: Style, field: TerrainField, swell: Swell) {
    const plan = (this.plan = planAmber(field));
    this.feeding = plan.feeding;
    this.field = field;
    this.swell = swell;
    this.material = illustratedMaterial(style, { pigment: PIGMENTS.ochre, painted: true, side: THREE.DoubleSide });
    // draped marks sit a hair over the sand: pull them forward in depth so the terrain never shows through them
    this.material.polygonOffset = true;
    this.material.polygonOffsetFactor = -1;
    this.material.polygonOffsetUnits = -2;
    this.ripples = new Draw(rippleKit(), this.material, plan.ripples.length);
    this.shells = new Draw(shellKit(), this.material, plan.shells.length);
    this.riffles = new Draw(riffleKit(), this.material, plan.riffles.length);
    this.streaks = new Draw(streakKit(), this.material, plan.streaks.length);
    this.strokes = [W.tower, W.lamp].map((w) => new Draw(strokeKit(w), this.material, 2 * SHOALS.strokes));
    this.fixed = [
      new Draw(channelGeometry(plan.channels), this.material, 1).fill([new THREE.Matrix4()]),
      new Draw(boulderKit(31), this.material, plan.stones.length).fill(plan.stones.map((b) => b.m)),
      new Draw(blockKit(), this.material, plan.blocks.length).fill(plan.blocks.map((b) => b.m)),
      new Draw(moundKit(), this.material, plan.drifts.length).fill(plan.drifts.map((b) => b.m)),
    ];
    this.group.add(...[this.ripples, this.shells, this.riffles, this.streaks, ...this.strokes, ...this.fixed].map((d) => d.mesh));
  }

  /** The tide's marks within reach of the eye, the riffles and streaks at the tide's level, the light's reflection. */
  update(eye: V, clock: number): void {
    this.group.visible = regionSeen(RI, eye, 90);
    if (!this.group.visible) return;
    const level = this.swell.uniforms.uSeaLevel.value as number;
    if (Number.isFinite(this.level) && Math.abs(level - this.level) > 1e-6) this.flow = level > this.level ? 1 : -1;
    this.level = level;
    if (eye.distanceToSquared(this.seen) > 2.25) {
      this.seen.copy(eye);
      const r2 = SHOALS.near ** 2;
      this.ripples.begin();
      for (const sp of this.plan.ripples) if (eye.distanceToSquared(sp.at) < r2) this.ripples.add(sp.m);
      this.ripples.end();
      this.shells.begin();
      for (const sp of this.plan.shells) if (eye.distanceToSquared(sp.at) < r2) this.shells.add(sp.m);
      this.shells.end();
    }
    this.water(eye, clock, level);
    this.reflect(eye, clock, level);
  }

  /** The water at `dir` near the eye (riding the swell) or at the tide's level beyond: height into T5's caller. */
  private surfaceAt(eye: V, dir: V, clock: number, level: number): number {
    lift(dir, level, T4);
    if (eye.distanceToSquared(T4) > 1600) return level;
    this.swell.sample(dir, clock, this.sample);
    return this.sample.height;
  }

  private water(eye: V, clock: number, level: number): void {
    const far2 = SHOALS.far ** 2;
    this.riffles.begin();
    for (const r of this.plan.riffles) {
      const k = shoal(level - r.floor);
      if (k <= 0 || eye.distanceToSquared(lift(r.dir, level, T1)) > far2) continue;
      const h = this.surfaceAt(eye, r.dir, clock, level), up = h === level ? r.dir : this.sample.normal;
      T2.copy(r.flow).multiplyScalar(this.flow);
      const size = r.size * (0.55 + 0.45 * k) * (1 + 0.06 * Math.sin(clock * 2.3 + 40 * r.yaw));
      this.riffles.add(pose(this.m, lift(r.dir, h + 0.02, T1), up, T2, r.yaw, 0, size));
    }
    this.riffles.end();
    this.streaks.begin();
    const span = 14;
    for (const st of this.plan.streaks) {
      if (!open(level - st.floor)) continue;
      const f = ((clock * 0.7 + st.phase) % span) - span / 2, fade = Math.sin((Math.PI * (f + span / 2)) / span);
      T3.copy(st.flow).multiplyScalar((this.flow * f) / this.R).add(st.dir).normalize();
      if (fade < 0.05 || eye.distanceToSquared(lift(T3, level, T1)) > far2) continue;
      const h = this.surfaceAt(eye, T3, clock, level), up = h === level ? T3 : this.sample.normal;
      T2.copy(st.flow).multiplyScalar(this.flow);
      this.streaks.add(pose(this.m, lift(T3, h + 0.02, T1), up, T2, Math.PI / 2, 0, st.length * fade, 1, 1));
    }
    this.streaks.end();
  }

  /** The Sandbar Light mirrored in the wet sand and water between it and the eye, in broken horizontal strokes: the
   *  stroke for height z over the mirror lies s = d·z / (e + z) toward the eye (d the eye's distance, e its height). */
  private reflect(eye: V, clock: number, level: number): void {
    const t = this.plan.tower, up = t.up, R = this.R;
    for (const d of this.strokes) d.begin();
    const len = eye.length(), cosA = Math.min(T1.copy(eye).divideScalar(len).dot(up), 1), d = Math.acos(cosA) * R;
    const e = len - R - level, top = t.base + 7.3 * t.scale - level;
    if (d > 4 && d < 150 && e > 0.3 && top > 0) {
      const toward = T2.copy(T1).addScaledVector(up, -cosA).normalize(), across = T3.crossVectors(up, toward).normalize();
      const n = SHOALS.strokes, dz = top / n;
      for (let j = 0; j < n; j++) {
        const z = dz * (j + 0.5), local = (z + level - t.base) / t.scale;
        if (local < 0.3) continue; // the plinth's foot among its boulders
        const s = (d * z) / (e + z), ds = ((d * e) / (e + z) ** 2) * dz;
        T5.copy(up).addScaledVector(toward, s / R).normalize();
        const g = this.field.surface(T5, -10, this.S).height;
        if (g > level + 0.25) continue; // dry sand mirrors nothing
        const h = g > level ? g + DRAPE : this.surfaceAt(eye, T5, clock, level) + 0.02;
        const lamp = local > 5.1 && local < 6.6 ? 1 : 0;
        const w = (local < 0.66 ? 2.5 : local < 4.6 ? 2.0 - 0.17 * (local - 0.66) : local < 5.1 ? 2.1 : local < 6.6 ? 1.1 : 0.7) * t.scale;
        const jag = 0.8 + 0.3 * Math.sin(j * 2.7 + clock * 0.8), gap = 0.12 + 0.08 * Math.sin(j * 1.9);
        for (const side of [-1, 1]) {
          lift(T5, h, T4).addScaledVector(across, side * w * (0.25 + gap / 2) * jag);
          this.strokes[lamp].add(pose(this.m, T4, T5, toward, 0, 0, w * (0.5 - gap) * jag, 1, 0.5 * ds));
        }
      }
    }
    for (const d of this.strokes) d.end();
  }

  get triangles(): number {
    return this.group.visible ? [this.ripples, this.shells, this.riffles, this.streaks, ...this.strokes, ...this.fixed].reduce((s, d) => s + d.triangles, 0) : 0;
  }

  dispose(): void {
    this.material.dispose();
    for (const d of [this.ripples, this.shells, this.riffles, this.streaks, ...this.strokes, ...this.fixed]) d.mesh.geometry.dispose();
  }
}

/** The composition root's Amber Shoals (MODULES): the tide's marks, its riffles and streaks, the Sandbar Light. */
export function createAmberShoals(ctx: RenderContext): RenderModule {
  const sea = seas.get(ctx.scene), terrain = terrains.get(ctx.scene);
  if (!sea || !terrain) throw new Error('createAmberShoals: the sea and terrain are built first (MODULES order)');
  const amber = new AmberShoals(ctx.pipeline.style, terrain.field, sea.swell);
  ctx.scene.add(amber.group);
  return {
    frame() {
      amber.update(ctx.camera.position, ctx.pipeline.style.uniforms.uTime.value);
    },
    dispose() {
      ctx.scene.remove(amber.group);
      amber.dispose();
    },
  };
}

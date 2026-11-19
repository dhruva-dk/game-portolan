// The near ships' sails and pennants as cloth, simulated on the GPU: extended position-based dynamics (Macklin, Müller
// and Chentanez, "XPBD", MIG 2016) taken in many small steps of one Jacobi iteration each (Macklin et al., "Small
// Steps in Physics Simulation", SCA 2019), which converges well enough for canvas without colouring the constraints.
//
// Each berth (berths.ts) holds one ship's canvas (canvas.ts: the finest level's grids, a particle a vertex), in her own
// frame — a square sail's in its yard's, before the yard is braced — so her way over the sea moves nothing, and only
// what she feels reaches it, each frame from the fleet:
//   - her sails' wind (motion.ts's filling(), metres a second), gusting slowly and swirling along the canvas, so a
//     sail breathes as it fills, a slack one shivers and a pennant flutters. It presses on the cloth along its normal
//     as the square of the wind through it, and drags along it: a sail fills on whichever side the wind comes from,
//     and lifts and shakes where the wind runs along it;
//   - gravity, less her own acceleration (a turn, gathering way, the heave), as she tilts it;
//   - her roll and pitch: each particle is swung with her rig about her waterline, which throws the canvas aloft and
//     moves it through the air (a masthead goes metres a second as she rolls).
// The canvas is cut full (canvas.ts), so it fills to its drawn belly and no further; pushed together it buckles rather
// than shortening; the long-range attachments keep it from stretching, and a mast stands in it as a cylinder it lies
// against when it goes aback.
//
// Budget: 783 particles a ship, BERTHS (4) ships; SUBSTEPS (8) steps of two dispatches a frame, and one for the
// normals: 17 dispatches of 3132 threads, nothing when no berth is held. Nothing is read back: the cloth's material
// reads the particles straight from their buffers in the vertex stage (materials.ts).

import { Vector4, type StorageBufferNode } from 'three/webgpu';
import {
  Fn, If, Return, abs, cos, cross, dot, float, instanceIndex, int, length, max, normalize, select, sin, uniform, uniformArray,
  vec3, vec4, instancedArray,
} from 'three/tsl';
import type { Compute } from '../gpu.ts';
import type { Vec3 } from '../world/sphere.ts';
import { BERTHS } from './berths.ts';
import { cutCanvas } from './canvas.ts';
import { CLOTH } from './kit.ts';
import { maxInt, minInt, type FloatNode, type IntNode, type Vec3Node } from '../tsl.ts';

/** Steps a frame, each a prediction and one Jacobi pass; and the longest frame they cover, seconds. */
const SUBSTEPS = 8, LONGEST = 1 / 20;
/** Air pushing on canvas and on bunting, per (m/s)² through it: ½ρC over the cloth's weight a square metre. */
const PRESS_SAIL = 1.1, PRESS_FLAG = 3.2;
/** Air dragging along it, per (m/s)². */
const DRAG_SAIL = 0.02, DRAG_FLAG = 0.22;
/** The eddies in the wind over the canvas, as a share of its speed: everywhere (EDDY), and more where it runs along
 * the canvas rather than through it (LUFF), a sail's and a pennant's; their wavelengths, metres. */
const EDDY = 0.06, LUFF_SAIL = 0.45, LUFF_FLAG = 0.7, EDDY_WAVES = [2.6, 1.5];
/** The constraints: each neighbour's offset in the grid, its compliance (m/N), and whether it counts toward the
 * average (the bending ones are too soft to). */
const STENCIL: readonly (readonly [number, number, number, boolean])[] = [
  [1, 0, 1e-8, true], [-1, 0, 1e-8, true], [0, 1, 1e-8, true], [0, -1, 1e-8, true],
  [1, 1, 2e-6, true], [-1, -1, 2e-6, true], [1, -1, 2e-6, true], [-1, 1, 2e-6, true],
  [2, 0, 1e-4, false], [-2, 0, 1e-4, false], [0, 2, 1e-4, false], [0, -2, 1e-4, false],
];
/** How much softer canvas is pushed together than pulled apart. */
const BUCKLE = 400;
/** Over-relaxation of the averaged Jacobi corrections (Macklin et al., "Unified Particle Physics", 2014). */
const OMEGA = 1.5;
/** How fast the cloth's own motion dies away, per second; and the fastest it may move, m/s. */
const DAMPING = 1.2, FASTEST = 40;
/** How far off a mast's surface the canvas lies against it, metres. */
const CLEAR = 0.06;
/** Each berth's parameters, in vec4s (set()). */
const PARAMS = 5;

/**
 * The wind's slow breath at a time (seconds) for a ship's phase: its strength as a share of its mean. The fleet's far
 * ships' sails breathe with it too (materials.ts), so a ship's canvas does the same before and after it is simulated.
 */
export const breath = (clock: FloatNode, phase: FloatNode): FloatNode =>
  float(1).add(sin(clock.mul(0.83).add(phase)).mul(0.12)).add(sin(clock.mul(2.1).add(phase.mul(2.3))).mul(0.07));

/** A direction in her frame turned about the vertical by `angle`, as a square yard is braced (the port arm aft for
 *  positive): the cloth's and the drawn ship's (materials.ts). */
export const braced = (v: Vec3Node, angle: FloatNode): Vec3Node => {
  const c = cos(angle), s = sin(angle);
  return vec3(v.x.mul(c).add(v.z.mul(s)), v.y, v.x.negate().mul(s).add(v.z.mul(c)));
};
/** A point turned so about the vertical through z = pivot (its mast). */
export const bracedAbout = (p: Vec3Node, angle: FloatNode, pivot: FloatNode | number): Vec3Node =>
  braced(p.sub(vec3(0, 0, pivot)), angle).add(vec3(0, 0, pivot));

/** What a berth's ship feels this frame, in her own frame (x to port, y up, z forward). */
export interface Felt {
  /** Her yards' brace, radians. */
  brace: number;
  /** A phase of her own, radians, so no two ships' canvas moves in step. */
  phase: number;
  /** Her sails' wind (motion.ts's filling()), metres a second. */
  wind: Vec3;
  /** Gravity less her acceleration, m/s². */
  weight: Vec3;
  /** Her rate of turn (roll, pitch, yaw together), rad/s, and its rate of change, rad/s². */
  spin: Vec3;
  spinning: Vec3;
}

export type Cloth = ReturnType<typeof createCloth>;

export function createCloth() {
  const canvas = cutCanvas(), n = canvas.count, total = BERTHS * n;
  const X = instancedArray(total, 'vec4'), Vel = instancedArray(total, 'vec4'), P = instancedArray(total, 'vec4');
  const Nrm = instancedArray(total, 'vec4');
  const [tRest, tGrid, tCell, tMast] = [canvas.rest, canvas.grid, canvas.cell, canvas.mast].map((a) => instancedArray(a, 'vec4').toReadOnly());
  const values = Array.from({ length: BERTHS * PARAMS }, () => new Vector4());
  const params = uniformArray<'vec4'>(values, 'vec4');
  const h = uniform(1 / 240);
  /** Seconds, the cloth's own clock (the far ships' sails breathe on it too). */
  const clock = uniform(0);
  /** Each grid's first particle and last column and row, for the vertex stage to find its particles. */
  const grids = uniformArray<'vec4'>(canvas.grids.map((g) => new Vector4(g.first, g.columns, g.rows, g.kind)), 'vec4');

  /** Which berth and which particle of the canvas a thread is. */
  const where = () => {
    const id = int(instanceIndex);
    const slot = id.div(n);
    const t = id.sub(slot.mul(n));
    return { id, slot, t, base: slot.mul(n), p0: params.element(slot.mul(PARAMS)) };
  };
  /** The particle at column i, row j of the grid at `g0`, in the berth from `base`, in buffer B. */
  const at = (B: StorageBufferNode<'vec4'>, base: IntNode, g0: IntNode, row: IntNode, i: IntNode, j: IntNode): Vec3Node => B.element(base.add(g0).add(i).add(j.mul(row))).xyz;

  const predict = Fn(() => {
    const { id, slot, t, base, p0 } = where();
    If(p0.x.lessThan(0.5), () => { Return(); });
    const rest = tRest.element(t);
    If(p0.y.greaterThan(0.5), () => {
      X.element(id).assign(vec4(rest.xyz, 1));
      Vel.element(id).assign(vec4(0));
      P.element(id).assign(vec4(rest.xyz, 1));
      Return();
    });
    If(rest.w.lessThan(0.5), () => {
      P.element(id).assign(vec4(rest.xyz, 1));
      Return();
    });
    const g = tGrid.element(t), c = tCell.element(t), m = tMast.element(t);
    const g0 = int(g.x), nu = int(g.y), nv = int(g.z), row = nu.add(1), kind = g.w;
    const i = int(c.x), j = int(c.y);
    const x = X.element(id).xyz, v = Vel.element(id).xyz;
    // the cloth's normal here, across its neighbours (either way round: the wind presses on whichever side it meets)
    const tu = at(X, base, g0, row, minInt(i.add(1), nu), j).sub(at(X, base, g0, row, maxInt(i.sub(1), 0), j));
    const tv = at(X, base, g0, row, i, minInt(j.add(1), nv)).sub(at(X, base, g0, row, i, maxInt(j.sub(1), 0)));
    const nn = cross(tu, tv);
    const normal = nn.div(max(length(nn), 1e-6));
    // what she feels, from her frame to the sail's: a square sail's yard is braced
    const p1 = params.element(slot.mul(PARAMS).add(1)), p2 = params.element(slot.mul(PARAMS).add(2));
    const spin = params.element(slot.mul(PARAMS).add(3)).xyz, spinning = params.element(slot.mul(PARAMS).add(4)).xyz;
    const square = kind.lessThan(CLOTH.lateen - 0.5);
    const angle = select(square, p0.z, float(0));
    const r = bracedAbout(x, angle, m.z);
    // swung with her rig about her waterline: thrown outward and along, and carried through the air
    const swing = cross(spinning, r).add(cross(spin, cross(spin, r)));
    const weight = braced(p2.xyz.sub(swing), angle.negate());
    const wind = braced(p1.xyz.mul(breath(clock, p0.w)).sub(cross(spin, r)), angle.negate());
    // The wind's eddies, carried over the canvas at about its speed, pushing it in and out: a little everywhere, so
    // a full sail ripples, and hard where the wind runs along the canvas, so a sail edge-on to it lifts and shakes
    // and a pennant flutters.
    const flag = kind.greaterThan(CLOTH.pennant - 0.5), speed = length(wind), down = wind.div(max(speed, 1e-3));
    const along = length(wind.sub(normal.mul(dot(wind, normal))));
    const eddy = speed.mul(EDDY).add(along.mul(select(flag, float(LUFF_FLAG), float(LUFF_SAIL))));
    const [k1, k2] = EDDY_WAVES.map((l) => (2 * Math.PI) / l), s = dot(x, down), ph = p0.w;
    const swirl = normal.mul(eddy.mul(
      sin(s.mul(k1).add(x.y.mul(0.9)).sub(clock.mul(speed).mul(k1 * 0.7)).add(ph))
        .add(sin(s.mul(k2).sub(x.y.mul(1.4)).sub(clock.mul(speed).mul(k2 * 0.8)).add(ph.mul(1.7))).mul(0.5))));
    const air = wind.add(swirl).sub(v);
    const through = dot(air, normal);
    const push = normal.mul(through.mul(abs(through)).mul(select(flag, float(PRESS_FLAG), float(PRESS_SAIL))))
      .add(air.mul(length(air)).mul(select(flag, float(DRAG_FLAG), float(DRAG_SAIL))));
    const v1 = v.add(push.add(weight).mul(h)).mul(float(1).sub(h.mul(DAMPING)));
    const fast = length(v1);
    const v2 = select(fast.greaterThan(FASTEST), v1.mul(float(FASTEST).div(fast)), v1);
    P.element(id).assign(vec4(x.add(v2.mul(h)), 1));
  })().compute(total, [64]);

  const solve = Fn(() => {
    const { id, t, base, p0 } = where();
    If(p0.x.lessThan(0.5).or(p0.y.greaterThan(0.5)), () => { Return(); });
    const rest = tRest.element(t);
    const p = P.element(id).xyz.toVar();
    const before = X.element(id).xyz;
    If(rest.w.lessThan(0.5), () => {
      Vel.element(id).assign(vec4(p.sub(before).div(h), 0));
      X.element(id).assign(vec4(p, 1));
      Return();
    });
    const g = tGrid.element(t), c = tCell.element(t), m = tMast.element(t);
    const g0 = int(g.x), nu = int(g.y), nv = int(g.z), row = nu.add(1);
    const i = int(c.x), j = int(c.y);
    const sum = vec3(0).toVar(), count = float(0).toVar();
    const h2 = h.mul(h);
    for (const [di, dj, alpha, counts] of STENCIL) {
      const ii = i.add(di), jj = j.add(dj);
      If(ii.greaterThanEqual(0).and(ii.lessThanEqual(nu)).and(jj.greaterThanEqual(0)).and(jj.lessThanEqual(nv)), () => {
        const tq = g0.add(ii).add(jj.mul(row));
        const q = P.element(base.add(tq)).xyz;
        const restLength = length(tRest.element(tq).xyz.sub(rest.xyz));
        const dv = p.sub(q);
        const len = max(length(dv), 1e-6);
        const C = len.sub(restLength);
        // pushed together, canvas buckles
        const compliance = select(C.lessThan(0), float(alpha * (counts ? BUCKLE : 1)), float(alpha)).div(h2);
        const dl = C.negate().div(float(1).add(tRest.element(tq).w).add(compliance));
        sum.addAssign(dv.div(len).mul(dl));
        if (counts) count.addAssign(1);
      });
    }
    const x = p.add(sum.mul(float(OMEGA).div(max(count, 1)))).toVar();
    // never further from the nearest lashing than across the cloth as cut
    const pin = int(c.z);
    If(pin.greaterThanEqual(0), () => {
      const anchor = P.element(base.add(pin)).xyz;
      const off = x.sub(anchor), far = length(off), most = c.w.mul(1.01);
      If(far.greaterThan(most), () => { x.assign(anchor.add(off.mul(most.div(far)))); });
    });
    // the mast stands in the canvas: in a square sail's yard's frame it stands where the brace turns it back to
    If(m.y.greaterThan(0), () => {
      const square = g.w.lessThan(CLOTH.lateen - 0.5);
      const mast = bracedAbout(vec3(0, 0, m.x), select(square, p0.z.negate(), float(0)), m.z);
      const dx = x.x.sub(mast.x), dz = x.z.sub(mast.z), d = max(dx.mul(dx).add(dz.mul(dz)).sqrt(), 1e-5), keep = m.y.add(CLEAR);
      If(d.lessThan(keep), () => { x.assign(vec3(mast.x.add(dx.mul(keep.div(d))), x.y, mast.z.add(dz.mul(keep.div(d))))); });
    });
    Vel.element(id).assign(vec4(x.sub(before).div(h), 0));
    X.element(id).assign(vec4(x, 1));
  })().compute(total, [64]);

  // each particle's normal, as sheet() would give the drawn grid (kit.ts): (down the rows) × (along them), turned
  // as the grid was wound; where the grid closes to a point (the lateen's clew, a pennant's tip) taken a row or a
  // column short of it
  const normals = Fn(() => {
    const { id, t, base, p0 } = where();
    If(p0.x.lessThan(0.5), () => { Return(); });
    const g = tGrid.element(t), c = tCell.element(t), m = tMast.element(t);
    const g0 = int(g.x), nu = int(g.y), nv = int(g.z), row = nu.add(1), kind = g.w;
    const i = int(c.x), j = int(c.y);
    const ju = select(kind.greaterThan(CLOTH.lateen - 0.5).and(kind.lessThan(CLOTH.lateen + 0.5)).and(j.equal(nv)), nv.sub(1), j);
    const iv = select(kind.greaterThan(CLOTH.pennant - 0.5).and(i.equal(nu)), nu.sub(1), i);
    const du = at(X, base, g0, row, minInt(i.add(1), nu), ju).sub(at(X, base, g0, row, maxInt(i.sub(1), 0), ju));
    const dv = at(X, base, g0, row, iv, minInt(j.add(1), nv)).sub(at(X, base, g0, row, iv, maxInt(j.sub(1), 0)));
    Nrm.element(id).assign(vec4(normalize(cross(dv, du)).mul(m.w), 0));
  })().compute(total, [64]);

  const steps = [...Array.from({ length: SUBSTEPS }, () => [predict, solve]).flat(), normals];
  // what update returns: the steps, or none
  const due: Compute[] = [steps], idle: Compute[] = [];
  let live = false;
  /** A berth's k-th vec4 of parameters set to v (her frame) and 0. */
  const put = (k: number, v: Vec3) => values[k].set(v[0], v[1], v[2], 0);

  return {
    /** Particles a berth. */
    count: n,
    /** The particles' positions and normals, a berth after another, for the vertex stage. */
    positions: X.value,
    normals: Nrm.value,
    grids,
    clock,
    /**
     * Berth k this frame: empty (null), or a ship feeling `felt`, her cloth laid out as cut first if `fresh`. Every
     * berth is set every frame, before the update: a fresh berth is fresh for that frame's steps only.
     */
    set(k: number, felt: Felt | null, fresh = false) {
      const o = k * PARAMS;
      if (!felt) { values[o].set(0, 0, 0, 0); return; }
      values[o].set(1, fresh ? 1 : 0, felt.brace, felt.phase);
      put(o + 1, felt.wind);
      put(o + 2, felt.weight);
      put(o + 3, felt.spin);
      put(o + 4, felt.spinning);
      live = true;
    },
    /** Each frame, after the berths are set: the steps that move the cloth on dt seconds, in one pass; none while no
     * berth is held. */
    update(dt: number): Compute[] {
      clock.value += dt;
      if (!live || dt <= 0) return idle;
      h.value = Math.min(dt, LONGEST) / SUBSTEPS;
      live = false;
      return due;
    },
  };
}

// The open trails (snapshot.ts Sea trails): each a line in her colour along her trail near the eye, laid on the water as
// the waves move it and run on from its last point to her stern: drawn as the border is (claims.ts), a hard bright
// line the same width on the screen near and far, edges smoothed over a pixel, but broken into dashes that march
// along it toward her, so it reads as a border still being drawn. A trail ended by a loop closed
// joins up into a solid line and sinks into the new border as her colour floods in behind its front (ABSORB s); one
// cut, or its ship sunk, breaks up, its dashes shrinking away (DISSOLVE s).
//
// The ribbons are rebuilt each frame on the CPU from the trails within REACH m of the eye (a few thousand points at
// most), and only the part written is sent. Each vertex is lifted a hair over the water and drawn BIAS m nearer the
// eye along its own line of sight (the same pixel, nearer in depth), so the chop and wakes the waves' own read
// can't hide it while a real crest in front still does. Far off the ribbon is widened to keep a few pixels across.

import {
  BufferAttribute, BufferGeometry, DoubleSide, Mesh, MeshBasicNodeMaterial, Vector4,
} from 'three/webgpu';
import {
  Fn, attribute, cameraPosition, clamp, dot, float, fract, fwidth, int, max, min, mix, normalize, select, smoothstep, sqrt, uniform,
  uniformArray, varying, vec4,
} from 'three/tsl';
import { premultiplied } from '../gpu';
import type { Sky } from '../sky/sky';
import type { Sea, ShipDraw } from '../snapshot';
import type { FloatNode, Vec3Node } from '../tsl';
import type { Eye } from '../view/view';
import * as sphere from '../world/sphere';
import { LINE_HALF, OWN_WIDE, lineLight } from './claims';
import { createCursor } from './cursor';
import { whiteSurface } from './optics';

/** The most points drawn at once, over every ribbon. */
const POINTS = 16384;
/** The ribbon's half width near, m; lifted this high over the water, and drawn this much nearer the eye. */
const HALF = 0.6, LIFT = 0.05, BIAS = 0.3;
/** The pixels the ribbon keeps each side of its middle far off, however foreshortened. */
const KEEP_PX = 4;
// The line is the border's (claims.ts): its half width LINE_HALF pixels (hers OWN_WIDE times it) and its light.
/** The dashes: a dash and its gap every DASH m, the dash DUTY of it, marching toward her at MARCH m/s. */
const DASH = 5, DUTY = 0.65, MARCH = 3;
/** Trails are drawn within this many metres of the point under the eye. */
const REACH = 450;
/** Seconds a closed loop's line takes to sink into its border (its dashes joined in the first JOIN s); a cut one's to
 *  break up. */
const ABSORB = 0.9, JOIN = 0.15, DISSOLVE = 1.2;
/** The modes: open, sinking into a border, breaking up. */
const OPEN = 0, ABSORBED = 1, DISSOLVING = 2;
/** The ribbon's stern end lies this far forward of her stern, m: a little under her counter. */
const COUNTER = 2;

interface Ribbon { id: number; serial: number; points: readonly sphere.Vec3[]; mode: number; since: number }
/** A ship's open trail as last seen: a copy of its points (a trail's points only grow while its serial holds), and the
 *  frame it was last seen in. */
interface Open { serial: number; points: sphere.Vec3[]; seen: number }

/** The points of a ribbon, then the tail (her stern) if she has one. */
const pointOf = (points: readonly sphere.Vec3[], tail: sphere.Vec3 | undefined, k: number): sphere.Vec3 =>
  k < points.length ? points[k] : tail!;

/** sky: the light on the water; surface(up, cell): where the water lies over rest point `up` (world, m), its waves
 *  read as for a cell `cell` m across; length: a ship's overall, m; ships: the most there will be (each trail's
 *  colour is held by its ship's id, so no more than these have trails). */
export function createTrails(sky: Sky, surface: (up: Vec3Node, cell: FloatNode) => Vec3Node, length: number, ships: number) {
  /** The ribbon's stern end lies this far behind her middle. */
  const astern = length / 2 - COUNTER;
  const at = new BufferAttribute(new Float32Array(POINTS * 2 * 4), 4);
  const across = new BufferAttribute(new Float32Array(POINTS * 2 * 4), 4);
  const rib = new BufferAttribute(new Float32Array(POINTS * 2 * 4), 4);
  const index = new BufferAttribute(new Uint32Array(POINTS * 6), 1);
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', at);
  geometry.setAttribute('trailAcross', across);
  geometry.setAttribute('trailRib', rib);
  geometry.setIndex(index);
  geometry.setDrawRange(0, 0);
  const values = Array.from({ length: ships }, () => new Vector4());
  const colours = uniformArray<'vec4'>(values, 'vec4');
  const time = uniform(0);
  /** Radians a pixel of the screen spans, from the eye (the screen's size is fixed, so it only moves with the zoom). */
  const pixel = uniform(0);

  const m = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: DoubleSide });
  const a4 = attribute('position', 'vec4'), x4 = attribute('trailAcross', 'vec4'), r4 = attribute('trailRib', 'vec4');
  // r4: arc (m), the arc at her stern, her colour's slot, mode; x4.w: seconds since it closed
  const mode = r4.w, age = x4.w;
  // a few pixels each side however far or foreshortened (the eye's ray along the ribbon's width shrinks it)
  const rest = a4.xyz.mul(sphere.R), ray = cameraPosition.sub(rest);
  const seen = ray.length(), side = sqrt(float(1).sub(dot(x4.xyz, ray.div(seen)).pow(2)));
  const width = max(float(HALF), seen.mul(pixel.mul(KEEP_PX)).div(max(side, 0.15)));
  const dir = normalize(a4.xyz.add(x4.xyz.mul(a4.w.mul(width).div(sphere.R))));
  const water = surface(dir, float(1)).add(dir.mul(LIFT));
  m.positionNode = water.add(normalize(cameraPosition.sub(water)).mul(BIAS));
  const sideV = varying(a4.w), arc = varying(r4.x), head = varying(r4.y), slot = varying(r4.z), modeV = varying(mode);
  const ageV = varying(age), place = varying(water), up = varying(dir);
  m.colorNode = Fn(() => {
    const t = time, s = arc;
    const team = colours.element(int(slot.add(0.5)));
    const mine = team.w;
    // what the sun and sky give a white surface here: the line's light is set against it
    const white = whiteSurface(sky, place, up, sky.sunIlluminance(place));
    const light = lineLight(team.xyz).mul(white);
    // across: pixels from the middle
    const off = sideV.abs().div(max(fwidth(sideV), 1e-6));
    const cover = clamp(float(LINE_HALF).mul(mix(float(1), float(OWN_WIDE), mine)).sub(off).add(0.5), 0, 1);
    // along: the dashes marching toward her, joined once the loop closes, shrinking away once cut; seen from so far
    // that a dash is under a pixel or so, their mean
    const absorbed = modeV.equal(ABSORBED), dissolving = modeV.equal(DISSOLVING);
    const k = select(absorbed, min(ageV.div(ABSORB), 1), min(ageV.div(DISSOLVE), 1));
    const dissolved = select(dissolving, float(DUTY).mul(float(1).sub(k)), float(DUTY));
    const duty = select(absorbed, mix(float(DUTY), float(1.05), smoothstep(0, JOIN, ageV)), dissolved);
    const f = fract(s.sub(t.mul(MARCH)).div(DASH));
    const inside = select(f.lessThan(duty), min(f, duty.sub(f)), min(f.sub(duty), float(1).sub(f)).negate()).mul(DASH);
    const ps = max(fwidth(s), 1e-4);
    const dash = mix(clamp(inside.div(ps).add(0.5), 0, 1), min(duty, 1), smoothstep(DASH * 0.2, DASH * 0.6, ps));
    // the newest part rises out of her wake, the oldest leaves the border cleanly; sinking into the border, it fades
    const sunk = select(absorbed, float(1).sub(smoothstep(JOIN, 1, k)), float(1));
    const ends = smoothstep(0, 2, head.sub(s)).mul(smoothstep(0, 1, s)).mul(sunk);
    const a = cover.mul(dash).mul(ends);
    return vec4(light.mul(a), a);
  })();
  premultiplied(m);
  const mesh = new Mesh(geometry, m);
  mesh.frustumCulled = false;
  // after the sea
  mesh.renderOrder = 1;
  // drawn once (count) only while there is a trail: a draw of no indices is one WebGPU warns of
  mesh.count = 0;

  /** Ribbons ended and still fading; and the open trails as last seen, by ship's id. */
  const fading: Ribbon[] = [], open: (Open | undefined)[] = [];
  const cursor = createCursor();
  /** The ships that closed a loop in the changes just read. */
  const closed = new Uint8Array(ships);
  /** Each ship's stern, where her open trail runs on to (unit vectors), and whether she is afloat to have one. */
  const sterns = Array.from({ length: ships }, (): [number, number, number] => [0, 0, 0]), sternOn = new Uint8Array(ships);
  /** The point under the eye, a unit vector. */
  const under: [number, number, number] = [0, 1, 0];
  const buffers = [at, across, rib];
  let frame = 0;
  /** The ribbon's point and index buffers' fill, and the world's clock now: what `lay` writes into. */
  let v = 0, n = 0, now = 0, near = 0;
  const A = at.array, X = across.array, B = rib.array, I = index.array;

  /** A trail gone, or begun anew: sunk into the border if she closed a loop, else broken up. */
  function end(id: number, t: Open) {
    fading.push({ id, serial: t.serial, points: t.points, mode: closed[id] ? ABSORBED : DISSOLVING, since: now });
  }

  /** A ribbon laid along `points` and on to `tail` (her stern, if afloat), written straight into the buffers. */
  function lay(id: number, points: readonly sphere.Vec3[], tail: sphere.Vec3 | undefined, mode: number, since: number) {
    const count = points.length + (tail ? 1 : 0);
    if (count < 2 || v + count * 2 > POINTS * 2) return;
    let seen = false, total = 0;
    for (let k = 0; k < count; k++) {
      seen ||= sphere.dot(pointOf(points, tail, k), under) > near;
      if (k) total += sphere.distance(pointOf(points, tail, k - 1), pointOf(points, tail, k));
    }
    if (!seen) return;
    let s = 0;
    for (let k = 0; k < count; k++) {
      const p = pointOf(points, tail, k);
      if (k) s += sphere.distance(pointOf(points, tail, k - 1), p);
      // across the ribbon: the way along it (ahead less behind) crossed with up
      const ahead = pointOf(points, tail, Math.min(k + 1, count - 1)), behind = pointOf(points, tail, Math.max(k - 1, 0));
      const dx = ahead[0] - behind[0], dy = ahead[1] - behind[1], dz = ahead[2] - behind[2];
      const cx = p[1] * dz - p[2] * dy, cy = p[2] * dx - p[0] * dz, cz = p[0] * dy - p[1] * dx, l = Math.hypot(cx, cy, cz) || 1;
      for (let side = -1; side <= 1; side += 2, v++) {
        const o = v * 4;
        A[o] = p[0], A[o + 1] = p[1], A[o + 2] = p[2], A[o + 3] = side;
        X[o] = cx / l, X[o + 1] = cy / l, X[o + 2] = cz / l, X[o + 3] = now - since;
        B[o] = s, B[o + 1] = total, B[o + 2] = id, B[o + 3] = mode;
      }
      if (k) {
        const b = v - 4;
        I[n] = b, I[n + 1] = b + 1, I[n + 2] = b + 2, I[n + 3] = b + 1, I[n + 4] = b + 3, I[n + 5] = b + 2;
        n += 6;
      }
    }
  }

  return {
    mesh,
    /** Each frame: who holds the sea at the world's clock `clock` (s), the ships drawn (for each trail's run on to her
     *  stern), the eye, and whose ship is hers. */
    update(sea: Sea | undefined, clock: number, drawn: readonly ShipDraw[], eye: Readonly<Eye>, own: number | null) {
      // a new match's sea (or none): nothing of the last one's left to fade
      const { fresh, from } = cursor.read(sea);
      if (fresh) {
        fading.length = 0;
        open.length = 0;
      }
      if (!sea) {
        geometry.setDrawRange(0, 0);
        mesh.count = 0;
        return;
      }
      now = clock;
      time.value = clock;
      pixel.value = eye.pixel;
      closed.fill(0);
      for (let i = from; i < sea.changes.length; i++) {
        const k = sea.changes[i];
        if (k.kind === 'claim' && k.ship < ships) closed[k.ship] = 1;
      }
      frame++;
      for (let i = 0; i < sea.trails.length; i++) {
        const t = sea.trails[i], o = open[t.id];
        if (o && o.serial === t.serial && o.points.length <= t.points.length) {
          for (let k = o.points.length; k < t.points.length; k++) o.points.push(t.points[k]);
          o.seen = frame;
          continue;
        }
        if (o) end(t.id, o);
        open[t.id] = { serial: t.serial, points: t.points.slice(), seen: frame };
      }
      for (let id = 0; id < open.length; id++) {
        const o = open[id];
        if (!o || o.seen === frame) continue;
        end(id, o);
        open[id] = undefined;
      }
      let kept = 0;
      for (let i = 0; i < fading.length; i++) {
        const f = fading[i];
        if (now - f.since < (f.mode === ABSORBED ? ABSORB : DISSOLVE)) fading[kept++] = f;
      }
      fading.length = kept;
      for (let id = 0; id < sea.colours.length && id < values.length; id++) {
        const c = sea.colours[id];
        values[id].set(c[0], c[1], c[2], id === own ? 1 : 0);
      }

      const e = eye.position, el = 1 / Math.hypot(e[0], e[1], e[2]);
      under[0] = e[0] * el, under[1] = e[1] * el, under[2] = e[2] * el;
      near = Math.cos(REACH / sphere.R);
      sternOn.fill(0);
      for (let i = 0; i < drawn.length; i++) {
        const { id, pose } = drawn[i];
        if (!drawn[i].afloat || id >= ships) continue;
        const stern = sterns[id], p = pose.position, f = pose.forward;
        const x = p[0] - f[0] * astern, y = p[1] - f[1] * astern, z = p[2] - f[2] * astern, l = 1 / Math.hypot(x, y, z);
        stern[0] = x * l, stern[1] = y * l, stern[2] = z * l;
        sternOn[id] = 1;
      }
      v = n = 0;
      for (let id = 0; id < open.length; id++) {
        const t = open[id];
        if (t) lay(id, t.points, sternOn[id] ? sterns[id] : undefined, OPEN, now);
      }
      for (let i = 0; i < fading.length; i++) lay(fading[i].id, fading[i].points, undefined, fading[i].mode, fading[i].since);
      for (let i = 0; i < buffers.length; i++) {
        buffers[i].clearUpdateRanges();
        buffers[i].addUpdateRange(0, v * 4);
        buffers[i].needsUpdate = true;
      }
      index.clearUpdateRanges();
      index.addUpdateRange(0, n);
      index.needsUpdate = true;
      geometry.setDrawRange(0, n);
      mesh.count = n > 0 ? 1 : 0;
    },
  };
}

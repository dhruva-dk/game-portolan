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
  AddEquation, BufferAttribute, BufferGeometry, CustomBlending, DoubleSide, Mesh, MeshBasicNodeMaterial, OneFactor, OneMinusSrcAlphaFactor,
  Vector4,
} from 'three/webgpu';
import {
  Fn, attribute, cameraPosition, clamp, dot, float, fract, fwidth, int, max, min, mix, normalize, select, smoothstep, sqrt, uniform,
  uniformArray, varying, vec4,
} from 'three/tsl';
import type { Sky } from '../sky/sky';
import type { Sea, ShipDraw } from '../snapshot';
import { createCursor } from './cursor';
import { R, add, distance, dot as dotV, normalize as normalizeV, type Vec3 } from '../world/sphere';
import type { FloatNode, Vec3Node } from '../tsl';

/** The most points drawn at once, over every ribbon. */
const POINTS = 16384;
/** The ribbon's half width near, m; lifted this high over the water, and drawn this much nearer the eye. */
const HALF = 0.6, LIFT = 0.05, BIAS = 0.3;
/** Radians a pixel spans, about (the chase camera's field over the phone's 440 pixels), and the pixels the ribbon keeps
 *  each side of its middle far off, however foreshortened. */
const PIXEL = 0.0026, KEEP_PX = 4;
/** The line, as the border's (claims.ts): its half width, pixels (hers OWN_WIDE times it), and its light, as a share
 *  of what the sun and sky give a white surface once the colour's brightest channel is raised to 1. */
const LINE = 1.1, OWN_WIDE = 1.5, INK = 1;
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

interface Ribbon { id: number; serial: number; points: readonly Vec3[]; mode: number; since: number }

/** sky: the light on the water; surface(up, cell): where the water lies over rest point `up` (world, m), its waves
 *  read as for a cell `cell` m across; length: a ship's overall, m. */
export function createTrails(sky: Sky, surface: (up: Vec3Node, cell: FloatNode) => Vec3Node, length: number) {
  /** The ribbon's stern end lies this far behind her middle. */
  const astern = length / 2 - COUNTER;
  const at = new BufferAttribute(new Float32Array(POINTS * 2 * 4), 4), across = new BufferAttribute(new Float32Array(POINTS * 2 * 4), 4);
  const rib = new BufferAttribute(new Float32Array(POINTS * 2 * 4), 4);
  const index = new BufferAttribute(new Uint32Array(POINTS * 6), 1);
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', at);
  geometry.setAttribute('trailAcross', across);
  geometry.setAttribute('trailRib', rib);
  geometry.setIndex(index);
  geometry.setDrawRange(0, 0);
  const values = Array.from({ length: 256 }, () => new Vector4());
  const colours = uniformArray<'vec4'>(values, 'vec4');
  const time = uniform(0);

  const m = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: DoubleSide });
  const a4 = attribute('position', 'vec4'), x4 = attribute('trailAcross', 'vec4'), r4 = attribute('trailRib', 'vec4');
  // r4: arc (m), the arc at her stern, her colour's slot, mode; x4.w: seconds since it closed
  const mode = r4.w, age = x4.w;
  // a few pixels each side however far or foreshortened (the eye's ray along the ribbon's width shrinks it)
  const rest = a4.xyz.mul(R), ray = cameraPosition.sub(rest);
  const seen = ray.length(), side = sqrt(float(1).sub(dot(x4.xyz, ray.div(seen)).pow(2)));
  const width = max(float(HALF), seen.mul(PIXEL * KEEP_PX).div(max(side, 0.15)));
  const dir = normalize(a4.xyz.add(x4.xyz.mul(a4.w.mul(width).div(R))));
  const water = surface(dir, float(1)).add(dir.mul(LIFT));
  m.positionNode = water.add(normalize(cameraPosition.sub(water)).mul(BIAS));
  const sideV = varying(a4.w), arc = varying(r4.x), head = varying(r4.y), slot = varying(r4.z), modeV = varying(mode);
  const ageV = varying(age), place = varying(water), up = varying(dir);
  m.colorNode = Fn(() => {
    const t = time, s = arc;
    const team = colours.element(int(slot.add(0.5)));
    const mine = team.w;
    // what the sun and sky give a white surface here: the line's light is set against it
    const l = sky.sun(place);
    const white = sky.sunIlluminance(place).mul(max(dot(l, up), 0)).div(Math.PI).add(sky.ambient(place));
    const light = team.xyz.div(max(max(team.x, team.y), max(team.z, 0.02))).mul(INK).mul(white);
    // across: pixels from the middle
    const off = sideV.abs().div(max(fwidth(sideV), 1e-6));
    const cover = clamp(float(LINE).mul(mix(float(1), float(OWN_WIDE), mine)).sub(off).add(0.5), 0, 1);
    // along: the dashes marching toward her, joined once the loop closes, shrinking away once cut; seen from so far
    // that a dash is under a pixel or so, their mean
    const absorbed = modeV.equal(ABSORBED), dissolving = modeV.equal(DISSOLVING);
    const k = select(absorbed, min(ageV.div(ABSORB), 1), min(ageV.div(DISSOLVE), 1));
    const duty = select(absorbed, mix(float(DUTY), float(1.05), smoothstep(0, JOIN, ageV)), select(dissolving, float(DUTY).mul(float(1).sub(k)), float(DUTY)));
    const f = fract(s.sub(t.mul(MARCH)).div(DASH));
    const inside = select(f.lessThan(duty), min(f, duty.sub(f)), min(f.sub(duty), float(1).sub(f)).negate()).mul(DASH);
    const ps = max(fwidth(s), 1e-4);
    const dash = mix(clamp(inside.div(ps).add(0.5), 0, 1), min(duty, 1), smoothstep(DASH * 0.2, DASH * 0.6, ps));
    // the newest part rises out of her wake, the oldest leaves the border cleanly; sinking into the border, it fades
    const ends = smoothstep(0, 2, head.sub(s)).mul(smoothstep(0, 1, s)).mul(select(absorbed, float(1).sub(smoothstep(JOIN, 1, k)), float(1)));
    const a = cover.mul(dash).mul(ends);
    return vec4(light.mul(a), a);
  })();
  m.blending = CustomBlending;
  m.blendEquation = AddEquation;
  m.blendSrc = OneFactor;
  m.blendDst = OneMinusSrcAlphaFactor;
  const mesh = new Mesh(geometry, m);
  mesh.frustumCulled = false;
  // after the sea
  mesh.renderOrder = 1;
  // drawn once (count) only while there is a trail: a draw of no indices is one WebGPU warns of
  mesh.count = 0;

  /** Ribbons ended and still fading; the open trails as last seen, by ship, each a copy of its own (kept up by adding
   *  the points new since: a trail's points only grow while its serial holds), and the frame each was last seen in. */
  let fading: Ribbon[] = [];
  const open = new Map<number, { serial: number; points: Vec3[]; seen: number }>();
  const cursor = createCursor(), claimed = new Set<number>(), sterns = new Map<number, Vec3>();
  let frame = 0;

  return {
    mesh,
    /** Each frame: who holds the sea at the world's clock `now` (s), the ships drawn (for each trail's run on to her
     *  stern), the eye (world, m), and whose ship is hers. */
    update(sea: Sea | undefined, now: number, ships: readonly ShipDraw[], eye: Vec3, own: number | null) {
      // a new match's sea (or none): nothing of the last one's left to fade
      const { fresh, from } = cursor.read(sea);
      if (fresh) {
        fading = [];
        open.clear();
      }
      if (!sea) {
        geometry.setDrawRange(0, 0);
        mesh.count = 0;
        return;
      }
      time.value = now;
      // a trail gone, or begun anew: sunk into the border if she closed a loop, else broken up
      claimed.clear();
      for (let i = from; i < sea.changes.length; i++) {
        const k = sea.changes[i];
        if (k.kind === 'claim') claimed.add(k.ship);
      }
      const end = (id: number, t: { serial: number; points: Vec3[] }) =>
        fading.push({ id, serial: t.serial, points: t.points, mode: claimed.has(id) ? ABSORBED : DISSOLVING, since: now });
      frame++;
      for (const t of sea.trails) {
        const o = open.get(t.id);
        if (o && o.serial === t.serial && o.points.length <= t.points.length) {
          for (let k = o.points.length; k < t.points.length; k++) o.points.push(t.points[k]);
          o.seen = frame;
          continue;
        }
        if (o) end(t.id, o);
        open.set(t.id, { serial: t.serial, points: t.points.slice(), seen: frame });
      }
      for (const [id, o] of open) {
        if (o.seen === frame) continue;
        end(id, o);
        open.delete(id);
      }
      fading = fading.filter((f) => now - f.since < (f.mode === ABSORBED ? ABSORB : DISSOLVE));
      sea.colours.forEach((c, id) => {
        if (id < values.length) values[id].set(c[0], c[1], c[2], id === own ? 1 : 0);
      });

      const under = normalizeV(eye), near = Math.cos(REACH / R);
      sterns.clear();
      for (const k of ships) if (k.afloat) sterns.set(k.id, normalizeV(add(k.pose.position, k.pose.forward, -astern)));
      const A = at.array, X = across.array, B = rib.array, I = index.array;
      let v = 0, n = 0;
      /** A ribbon laid along `points` and on to `tail` (her stern, if afloat), written straight into the buffers. */
      const lay = (id: number, points: readonly Vec3[], tail: Vec3 | undefined, mode: number, since: number) => {
        const count = points.length + (tail ? 1 : 0), pt = (k: number) => (k < points.length ? points[k] : tail!);
        if (count < 2 || v + count * 2 > POINTS * 2) return;
        let seen = false, total = 0;
        for (let k = 0; k < count; k++) {
          seen ||= dotV(pt(k), under) > near;
          if (k) total += distance(pt(k - 1), pt(k));
        }
        if (!seen) return;
        let s = 0;
        for (let k = 0; k < count; k++) {
          const p = pt(k);
          if (k) s += distance(pt(k - 1), p);
          // across the ribbon: the way along it (ahead less behind) crossed with up
          const ahead = pt(Math.min(k + 1, count - 1)), behind = pt(Math.max(k - 1, 0));
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
      };
      for (const [id, t] of open) lay(id, t.points, sterns.get(id), OPEN, now);
      for (const f of fading) lay(f.id, f.points, undefined, f.mode, f.since);
      for (const b of [at, across, rib]) {
        b.clearUpdateRanges();
        b.addUpdateRange(0, v * 4);
        b.needsUpdate = true;
      }
      index.clearUpdateRanges();
      index.addUpdateRange(0, n);
      index.needsUpdate = true;
      geometry.setDrawRange(0, n);
      mesh.count = n > 0 ? 1 : 0;
    },
  };
}

// The open trails (snapshot.ts Sea trails): a glowing ribbon in her colour along each trail near the eye, laid on the
// water as the waves move it, and run on from its last point to her stern. The first game's (agent-initial
// src/territory.ts TRAIL_VERT, TRAIL_FRAG), in TSL: a thin hot core in a soft sheen of the colour, pulses running
// back along it, flicker on it, broken by the swell into stretches of light and flecks of foam, and only a breath of dye, so it reads as light on the water and not as paint. A trail
// ended by a loop closed sinks into the new border (ABSORB s); one cut, or its ship sunk, dies away and breaks up
// into foam (DISSOLVE s).
//
// The ribbons are rebuilt each frame on the CPU from the trails within REACH m of the eye (a few thousand points at
// most), and only the part written is sent. Each vertex is lifted a hair over the water and drawn BIAS m nearer the
// eye along its own line of sight (the same pixel, nearer in depth), so the chop and wakes the waves' own read
// can't hide it while a real crest in front still does.

import {
  AddEquation, BufferAttribute, BufferGeometry, CustomBlending, DoubleSide, Mesh, MeshBasicNodeMaterial, OneFactor, OneMinusSrcAlphaFactor,
  Vector4,
} from 'three/webgpu';
import {
  Fn, attribute, cameraPosition, dot, exp, float, int, max, min, mix, mx_noise_float, normalize, pow, select, sin, smoothstep, uniform,
  uniformArray, varying, vec3, vec4,
} from 'three/tsl';
import type { Sky } from '../sky/sky';
import type { Sea, ShipDraw } from '../snapshot';
import { createCursor } from './cursor';
import { R, add, distance, dot as dotV, normalize as normalizeV, type Vec3 } from '../world/sphere';
import type { FloatNode, Vec3Node } from '../tsl';

/** The most points drawn at once, over every ribbon. */
const POINTS = 16384;
/** Its half width, m; lifted this high over the water, and drawn this much nearer the eye. */
const HALF = 0.6, LIFT = 0.05, BIAS = 0.3;
/** Trails are drawn within this many metres of the point under the eye. */
const REACH = 450;
/** Seconds a closed loop's ribbon takes to sink into its border; a cut one's to break up into foam. */
const ABSORB = 0.7, DISSOLVE = 1.8;
/** The modes: open, sinking into a border, breaking up. */
const OPEN = 0, ABSORBED = 1, DISSOLVING = 2;
/** The glow, as a share of what the sun and sky give a white surface, once the colour is raised to a luminance of 1. */
const GLOW = 0.32;
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
  const width = float(HALF).mul(select(mode.equal(ABSORBED), float(1).sub(min(age.div(ABSORB), 1).mul(0.6)), select(mode.equal(DISSOLVING), min(age.div(DISSOLVE), 1).mul(0.6).add(1), float(1))));
  const dir = normalize(a4.xyz.add(x4.xyz.mul(a4.w.mul(width).div(R))));
  const water = surface(dir, float(1)).add(dir.mul(LIFT));
  m.positionNode = water.add(normalize(cameraPosition.sub(water)).mul(BIAS));
  const side = varying(a4.w), arc = varying(r4.x), head = varying(r4.y), slot = varying(r4.z), modeV = varying(mode), ageV = varying(age);
  const place = varying(water), up = varying(dir);
  m.colorNode = Fn(() => {
    const a = side.abs(), s = arc, t = time;
    const team = colours.element(int(slot.add(0.5))).xyz;
    const lum = max(dot(team, vec3(0.2126, 0.7152, 0.0722)), 0.02);
    // what the sun and sky give a white surface here: the glow is set against it
    const l = sky.sun(place);
    const white = sky.sunIlluminance(place).mul(max(dot(l, up), 0)).div(Math.PI).add(sky.ambient(place, up));
    const glow = team.div(lum).mul(0.3);
    // the newest part rises out of her wake, the oldest leaves the border cleanly
    const ends = smoothstep(0, 2, head.sub(s)).mul(smoothstep(0, 1, s));
    const core = exp(a.mul(a).mul(-60)).mul(0.5);
    const body = exp(a.mul(a).mul(-3.5)).mul(float(1).sub(smoothstep(0.75, 1, a)));
    const pulse = pow(sin(s.mul(0.7).add(t.mul(8))).mul(0.5).add(0.5), 8);
    const flick = mx_noise_float(vec3(s.mul(0.9).add(t.mul(4)), a.mul(3), t.mul(1.7))).mul(0.5).add(0.5);
    const beat = sin(t.mul(6.5)).mul(0.15).add(0.85);
    // broken by the swell: the light gathers on some stretches and all but goes on others, and foam flecks it
    const broken = smoothstep(0.25, 0.75, mx_noise_float(place.mul(0.3).add(vec3(t.mul(0.35), 0, t.mul(-0.2))))
      .mul(0.5).add(0.5)).mul(0.75).add(0.25);
    const fleck = smoothstep(0.6, 0.8, mx_noise_float(place.mul(1.7).add(vec3(0, t.mul(0.6), 0))).mul(0.5).add(0.5)).mul(body);
    const emit = glow.mul(body).mul(flick.mul(0.4).add(0.4).add(pulse)).add(mix(glow, vec3(1), 0.2).mul(core).mul(pulse.mul(1.4).add(1.4)))
      .mul(beat).mul(broken).mul(white).mul(GLOW).toVar();
    const alpha = body.mul(0.1).add(fleck.mul(0.45)).toVar();
    const dye = mix(team.mul(0.3), vec3(0.9), fleck.div(max(alpha.mul(2.2), 1e-3)).min(1)).mul(white).toVar();
    const k = select(modeV.equal(ABSORBED), min(ageV.div(ABSORB), 1), min(ageV.div(DISSOLVE), 1));
    const absorbed = modeV.equal(ABSORBED), dissolving = modeV.equal(DISSOLVING);
    // sinking into the border: it fades as it narrows
    emit.mulAssign(select(absorbed, float(1).sub(k), float(1)));
    alpha.mulAssign(select(absorbed, float(1).sub(k), float(1)));
    // breaking up: the glow dies away and the ribbon turns to lacy foam that thins out
    const n = mx_noise_float(place.mul(1.6).add(vec3(0, 0, t.mul(0.3)))).mul(0.5).add(0.5).add(float(1).sub(a).mul(0.2));
    const froth = smoothstep(k.mul(0.5).add(0.45), k.mul(0.5).add(0.6), n);
    const turn = smoothstep(0, 0.25, k);
    emit.mulAssign(select(dissolving, exp(k.mul(-3.5)), float(1)));
    dye.assign(select(dissolving, mix(dye, white.mul(0.9), turn), dye));
    alpha.assign(select(dissolving, mix(alpha, froth.mul(float(1).sub(smoothstep(0.7, 1, a))).mul(0.6), turn).mul(float(1).sub(k.mul(k))), alpha));
    return vec4(dye.mul(alpha).add(emit).mul(ends), alpha.mul(ends));
  })();
  m.blending = CustomBlending;
  m.blendEquation = AddEquation;
  m.blendSrc = OneFactor;
  m.blendDst = OneMinusSrcAlphaFactor;
  const mesh = new Mesh(geometry, m);
  mesh.frustumCulled = false;
  // after the sea
  mesh.renderOrder = 1;
  mesh.visible = false;

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
        mesh.visible = false;
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
      mesh.visible = n > 0;
    },
  };
}

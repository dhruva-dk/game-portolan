// The open trails (snapshot.ts Sea trails): a glowing ribbon in her colour along each trail near the eye, laid on the
// water as the waves move it, and run on from its last point to her stern. The first game's (agent-initial
// src/territory.ts TRAIL_VERT, TRAIL_FRAG), in TSL: a thin hot core in a soft sheen of the colour, pulses running
// back along it, flicker on it, and only a breath of dye, so it reads as light on the water and not as paint. A trail
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
import { R, add, cross, distance, dot as dotV, normalize as normalizeV, type Vec3 } from '../world/sphere';
import type { FloatNode, Vec3Node } from '../tsl';

/** The most points drawn at once, over every ribbon. */
const POINTS = 16384;
/** Its half width, m; lifted this high over the water, and drawn this much nearer the eye. */
const HALF = 0.7, LIFT = 0.05, BIAS = 0.3;
/** Trails are drawn within this many metres of the point under the eye. */
const REACH = 450;
/** Seconds a closed loop's ribbon takes to sink into its border; a cut one's to break up into foam. */
const ABSORB = 0.7, DISSOLVE = 1.8;
/** The modes: open, sinking into a border, breaking up. */
const OPEN = 0, ABSORBED = 1, DISSOLVING = 2;
/** The glow, as a share of what the sun and sky give a white surface, once the colour is raised to a luminance of 1. */
const GLOW = 0.5;
/** The ribbon's stern end lies this far behind her middle (half her length, less a little under her counter). */
const ASTERN = 11;

interface Ribbon { id: number; serial: number; points: readonly Vec3[]; mode: number; since: number }

/** sky: the light on the water; surface(up, cell): where the water lies over rest point `up` (world, m), its waves
 *  read as for a cell `cell` m across. */
export function createTrails(sky: Sky, surface: (up: Vec3Node, cell: FloatNode) => Vec3Node) {
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
    const core = exp(a.mul(a).mul(-150));
    const body = exp(a.mul(a).mul(-3.5)).mul(float(1).sub(smoothstep(0.75, 1, a)));
    const pulse = pow(sin(s.mul(0.7).add(t.mul(8))).mul(0.5).add(0.5), 8);
    const flick = mx_noise_float(vec3(s.mul(0.9).add(t.mul(4)), a.mul(3), t.mul(1.7))).mul(0.5).add(0.5);
    const beat = sin(t.mul(6.5)).mul(0.15).add(0.85);
    const emit = glow.mul(body).mul(flick.mul(0.4).add(0.4).add(pulse)).add(mix(glow, vec3(1), 0.2).mul(core).mul(pulse.mul(1.4).add(1.4)))
      .mul(beat).mul(white).mul(GLOW).toVar();
    const alpha = body.mul(0.12).toVar();
    const dye = team.mul(white).mul(0.3).toVar();
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

  /** Ribbons ended and still fading, and the open trails as last seen (by ship). */
  let fading: Ribbon[] = [];
  let open = new Map<number, { serial: number; points: readonly Vec3[] }>();
  let seq = -1;

  return {
    mesh,
    /** Each frame: who holds the sea, the ships drawn (for each trail's run on to her stern), the eye (world, m), and
     *  whose ship is hers. */
    update(sea: Sea | undefined, ships: readonly ShipDraw[], eye: Vec3, own: number | null) {
      if (!sea) {
        [fading, open] = [[], new Map()];
        geometry.setDrawRange(0, 0);
        mesh.visible = false;
        return;
      }
      time.value = sea.clock;
      // a trail gone: sunk into the border if she closed a loop, else broken up
      const now = new Map(sea.trails.map((t) => [t.id, t]));
      const claimed = new Set<number>();
      for (const k of sea.changes) if (k.seq > seq && k.kind === 'claim') claimed.add(k.ship);
      seq = Math.max(seq, ...sea.changes.map((k) => k.seq));
      for (const [id, t] of open) {
        const n = now.get(id);
        if (n && n.serial === t.serial) continue;
        fading.push({ id, serial: t.serial, points: t.points, mode: claimed.has(id) ? ABSORBED : DISSOLVING, since: sea.clock });
      }
      open = new Map(sea.trails.map((t) => [t.id, { serial: t.serial, points: t.points }]));
      fading = fading.filter((f) => sea.clock - f.since < (f.mode === ABSORBED ? ABSORB : DISSOLVE));
      sea.colours.forEach((c, id) => {
        if (id < values.length) values[id].set(c[0], c[1], c[2], id === own ? 1 : 0);
      });

      const under = normalizeV(eye), near = Math.cos(REACH / R);
      const stern = new Map(ships.filter((k) => k.afloat).map((k) => [k.id, normalizeV(add(k.pose.position, k.pose.forward, -ASTERN))]));
      const A = at.array, X = across.array, B = rib.array, I = index.array;
      let v = 0, n = 0;
      const lay = (r: Ribbon, tail: Vec3 | null) => {
        const pts = tail ? [...r.points, tail] : r.points;
        if (pts.length < 2 || !pts.some((p) => dotV(p, under) > near)) return;
        if (v + pts.length * 2 > POINTS * 2) return;
        let s = 0;
        const total = pts.reduce((sum, p, k) => sum + (k ? distance(pts[k - 1], p) : 0), 0);
        pts.forEach((p, k) => {
          if (k) s += distance(pts[k - 1], p);
          const ahead = pts[Math.min(k + 1, pts.length - 1)], behind = pts[Math.max(k - 1, 0)];
          const c = normalizeV(cross(p, add(ahead, behind, -1)));
          for (const side of [-1, 1]) {
            A.set([p[0], p[1], p[2], side], v * 4);
            X.set([c[0], c[1], c[2], sea.clock - r.since], v * 4);
            B.set([s, total, r.id, r.mode], v * 4);
            v++;
          }
          if (k) {
            const b = v - 4;
            I.set([b, b + 1, b + 2, b + 1, b + 3, b + 2], n);
            n += 6;
          }
        });
      };
      for (const t of sea.trails) lay({ id: t.id, serial: t.serial, points: t.points, mode: OPEN, since: sea.clock }, stern.get(t.id) ?? null);
      for (const f of fading) lay(f, null);
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

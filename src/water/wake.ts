// The marks the ships leave on the sea, for every ship at once: one small map round the point under the eye, on the
// eye's own chart (view.local: metres east and south along the sphere), drawn afresh each frame and read by the sea's
// shader where it lies. Its four channels, each summed over whatever is drawn there:
//   r  foam's cover: the ring round each waterline, the bow's breaking wave, the churned water astern
//   g  height of the wake's waves over the sea's, metres: the bow wave and the Kelvin wedge spreading off it
//   b  air worked into the water astern (0…1): it scatters more light back (the wake's pale turquoise) and calms
//      the ripples on the surface over it
//   a  the ships' shadows: each ship's outline cast along the sun's rays onto the sea under her
//
// Drawn into it, in one pass of three draws:
//   - each ship's wake, a ribbon along the path her bow has cut (sim/wake.ts), wide enough to hold her Kelvin wedge,
//     carrying across it how far out each point lies, and along it how long ago she passed and how fast she went.
//     Behind her stern the water churns, spreading slowly and fading over tens of seconds. The wedge's arms leave her
//     stem at 19.5° to her path (the Kelvin angle, tan 19.5° = 0.354): water she passed t seconds ago at speed v has
//     its arm v·t·0.354 out from her track, so the wedge bends round her turns as the real one does;
//   - a patch round each hull for what hugs her: foam along her waterline (ship/waterline.ts), thin at rest, heaped
//     at the bow with speed, the water piled against her bow and boiling up under her transom;
//   - each ship's farthest level of detail (a hull, masts and five sails), pressed flat onto the sea along the sun.
// Nothing here is a flat-world shortcut: the wake is laid along great circles and placed on the eye's chart, as the
// sea's own waves are, and the shadows are cast onto the sea's level at each ship.
//
// A texel is half a metre, which the foam's lace (foam.ts) dresses. The marks fade out toward REACH: from the chase
// camera the horizon lies a little past it, where a wake is a hair's breadth.

import {
  AddEquation, BufferAttribute, Color, BufferGeometry, CustomBlending, DoubleSide, DynamicDrawUsage, HalfFloatType,
  InstancedBufferGeometry, InstancedInterleavedBuffer, InterleavedBufferAttribute, LinearFilter, Mesh, MeshBasicNodeMaterial,
  OneFactor, OrthographicCamera, RGBAFormat, RenderTarget, Scene, type WebGPURenderer,
} from 'three/webgpu';
import {
  Fn, abs, attribute, cos, cross, dot, exp, float, max, normalize, saturate, select, sin, smoothstep, texture, vec2, vec3, vec4,
} from 'three/tsl';
import type { Environment } from '../environment';
import { PIVOT_Z, buildShip } from '../ship/build';
import { WATERLINE } from '../ship/waterline';
import { WAKE, laid, type WakePoint } from '../sim/wake';
import type { Sky } from '../sky/sky';
import type { View } from '../view/view';
import type { ShipPose } from '../world/pose';
import { R, add, along, cross as crossV, distance, dot as dotV, length, normalize as normalizeV, toChart, type Chart, type Vec3 } from '../world/sphere';
import { outside } from './hulls';

type N = any;

/** Texels across the map, and how far it reaches from the point under the eye, metres. */
const SIZE = 512, REACH = 128;
const TEXEL = (2 * REACH) / SIZE;
/** The speed at which a ship's wake is at its fullest, metres a second. */
const FULL = 10;
/** tan of the Kelvin angle, 19.47°. */
const KELVIN = Math.tan((19.47 * Math.PI) / 180);
/** Her waterline's length, metres. */
const LENGTH = WATERLINE.stem - WATERLINE.stern;

/** The churned water astern: its half-width under her transom, and how fast it spreads, metres a second. */
const CHURN = 1.6, SPREAD = 0.3;
/** The wedge's arms: their crests' height at full speed, metres, and how long they last, seconds (fading by e each FADE). */
const ARM = 0.18, ARM_LIFE = 14, ARM_FADE = 7;
/** The ribbon reaches this far past an arm's crest, metres, and at least this many of the churn's half-widths. */
const ARM_ROOM = 4, CHURN_ROOM = 2.6;
/** On the inside of a turn, the ribbon reaches this share of the way to its centre. */
const INSIDE = 0.8;
/** Foam round a waterline at rest, and the bow wave's height at full speed, metres. */
const LAPPING = 0.7, BOW = 0.45;
/** The patch round a hull: metres astern of her transom, ahead of her stem and out from her side. */
const PATCH = { astern: 7, ahead: 4, out: 4.5 };
/** The least the sun's rays may lie along the sea for her shadow: low suns stretch it no further. */
const LOW_SUN = 0.15;

const vertices = WAKE.most + 1;

const sq = (x: N): N => x.mul(x);

/** A ship as her marks need her: her pose, her velocity (world, metres a second) and her yards' brace (radians). */
export interface Afloat { pose: ShipPose; velocity: Vec3; look: { brace: number } }

/** A material that draws straight onto the map (the chart's metres in `at`) and adds what it draws to what is there. */
function marker(at: N, mark: N): MeshBasicNodeMaterial {
  const m = new MeshBasicNodeMaterial({ side: DoubleSide, depthTest: false, depthWrite: false });
  m.vertexNode = vec4(at.x.div(REACH), at.y.div(REACH), 0.5, 1);
  m.fragmentNode = mark;
  m.blending = CustomBlending;
  m.blendEquation = m.blendEquationAlpha = AddEquation;
  m.blendSrc = m.blendDst = m.blendSrcAlpha = m.blendDstAlpha = OneFactor;
  return m;
}

/** A dynamic float attribute of `n` items of `size`. */
const dynamic = (n: number, size: number) => new BufferAttribute(new Float32Array(n * size), size).setUsage(DynamicDrawUsage);

export type Wake = ReturnType<typeof createWake>;

/** capacity: the most ships. */
export function createWake(renderer: WebGPURenderer, view: View, sky: Sky, capacity: number) {
  const target = new RenderTarget(SIZE, SIZE, { type: HalfFloatType, format: RGBAFormat, depthBuffer: false });
  target.texture.minFilter = target.texture.magFilter = LinearFilter;
  target.texture.generateMipmaps = false;
  const scene = new Scene();
  // (unused: every draw places itself on the map)
  const camera = new OrthographicCamera();
  const clear = new Color();

  // ---- the wakes: ribbons along the bows' paths
  const trailGeometry = new BufferGeometry();
  const trailAt = dynamic(capacity * vertices * 2, 2), trailMark = dynamic(capacity * vertices * 2, 4);
  trailGeometry.setAttribute('at', trailAt);
  trailGeometry.setAttribute('mark', trailMark);
  trailGeometry.setIndex(new BufferAttribute(new Uint16Array(capacity * (vertices - 1) * 6), 1).setUsage(DynamicDrawUsage));
  const trails = new Mesh(trailGeometry, marker(attribute('at', 'vec2'), Fn(() => {
    // across: metres out from her track (+ to port); age: seconds since she passed; v: her speed then; run: metres
    // along the path from her stem now
    const m = attribute('mark', 'vec4'), across = m.x, age = m.y, v = m.z, run = m.w;
    const pace = saturate(v.div(FULL));
    const churned = exp(sq(across.div(age.mul(SPREAD).add(CHURN))).negate()).mul(smoothstep(LENGTH - 1, LENGTH + 3, run)).mul(pace);
    const foam = churned.mul(exp(age.div(-3)).mul(0.55).add(exp(age.div(-12)).mul(0.25))).toVar();
    const air = churned.mul(exp(age.div(-10)));
    // the arms: crests in echelon just inside each, as the bow wave spreads from her stem
    const off = abs(across).sub(v.mul(age).mul(KELVIN));
    const width = v.mul(age).mul(0.05).add(0.6);
    const life = exp(age.div(-ARM_FADE)).mul(smoothstep(ARM_LIFE, ARM_LIFE * 0.6, age)).mul(pace);
    const wave = exp(sq(off.div(width.mul(2))).negate()).mul(cos(off.mul(2 * Math.PI).div(v.mul(0.6).add(3))));
    const height = wave.mul(life).mul(ARM).div(v.mul(age).mul(0.06).add(1).sqrt());
    // the bow wave breaks white along the arms near her, and leaves a thin line of foam behind
    foam.addAssign(exp(sq(off.div(0.8)).negate()).mul(pace.mul(pace)).mul(exp(age.div(-1.5)).mul(0.9)));
    foam.addAssign(exp(sq(off.div(1.2)).negate()).mul(life).mul(0.15));
    return vec4(foam, height, air, 0);
  })()));

  // ---- what hugs each hull: a patch in her own frame
  const patchGeometry = new BufferGeometry();
  const patchAt = dynamic(capacity * 4, 2), patchMark = dynamic(capacity * 4, 4);
  patchGeometry.setAttribute('at', patchAt);
  patchGeometry.setAttribute('mark', patchMark);
  patchGeometry.setIndex(new BufferAttribute(new Uint16Array(Array.from({ length: capacity }, (_, i) => [0, 1, 2, 0, 2, 3].map((k) => k + 4 * i)).flat()), 1));
  const patches = new Mesh(patchGeometry, marker(attribute('at', 'vec2'), Fn(() => {
    // across and along: metres in her frame (to port, forward of her middle); her pace
    const m = attribute('mark', 'vec4'), across = m.x, ahead = m.y, pace = m.z;
    const d = outside(across, ahead);
    const fore = smoothstep(0.35, 0.95, ahead.sub(WATERLINE.stern).div(LENGTH));
    const ring = exp(sq(max(d, 0).div(pace.mul(fore).mul(1.4).add(0.8))).negate()).mul(smoothstep(-0.8, 0, d));
    // under her transom the water she drags along boils up
    const astern = float(WATERLINE.stern).sub(ahead);
    const boil = exp(sq(astern.sub(1.5).div(2.5)).negate()).mul(exp(sq(across.div(1.8)).negate())).mul(pace);
    const foam = ring.mul(pace.mul(fore.mul(0.9).add(0.35)).add(LAPPING)).add(boil.mul(0.5));
    const height = exp(sq(max(d, 0).div(1.8)).negate()).mul(fore.mul(fore)).mul(pace.mul(pace)).mul(BOW);
    return vec4(foam, height, ring.mul(pace).mul(0.7).add(boil), 0);
  })()));

  // ---- the shadows: each ship's farthest level pressed onto the sea along the sun
  const far = buildShip(3);
  const shadowGeometry = new InstancedBufferGeometry();
  {
    const parts = [far.body, far.cloth];
    const position = new Float32Array(parts.reduce((n, p) => n + p.position.length, 0));
    const part = new Uint8Array(parts.reduce((n, p) => n + p.part.length, 0));
    const index: number[] = [];
    let base = 0;
    for (const p of parts) {
      position.set(p.position, base * 3);
      part.set(p.part, base * 4);
      p.index.forEach((i) => index.push(i + base));
      base += p.vertices;
    }
    shadowGeometry.setAttribute('position', new BufferAttribute(position, 3));
    shadowGeometry.setAttribute('part', new BufferAttribute(part, 4, true));
    shadowGeometry.setIndex(index);
  }
  const poses = new InstancedInterleavedBuffer(new Float32Array(capacity * 12), 12).setUsage(DynamicDrawUsage);
  ['shadowAt', 'shadowFwd', 'shadowUp'].forEach((name, i) => shadowGeometry.setAttribute(name, new InterleavedBufferAttribute(poses, 4, i * 4)));
  shadowGeometry.instanceCount = 0;
  const shadowOn = Fn(() => {
    const at = attribute('shadowAt', 'vec4'), fwd = attribute('shadowFwd', 'vec4').xyz, up = attribute('shadowUp', 'vec4').xyz;
    const local = attribute('position', 'vec3'), part = attribute('part', 'vec4');
    // the square yards turned about their masts by her brace, as her materials turn them (ship/materials.ts)
    const pivot = part.y.mul(255).round();
    const angle = at.w.mul(part.z).mul(select(pivot.greaterThan(0.5), float(1), float(0)));
    const pz = select(pivot.greaterThan(1.5), float(PIVOT_Z[2]), float(PIVOT_Z[1]));
    const z = local.z.sub(pz), c = cos(angle), s = sin(angle);
    const braced = vec3(local.x.mul(c).add(z.mul(s)), local.y, local.x.negate().mul(s).add(z.mul(c)).add(pz));
    const p = at.xyz.add(cross(up, fwd).mul(braced.x)).add(up.mul(braced.y)).add(fwd.mul(braced.z));
    // along the sun's ray down to the sea's level at her
    const n = normalize(at.xyz);
    const drop = dot(p.sub(n.mul(R)), n).div(max(dot(sky.sun, n), LOW_SUN));
    return view.local(p.sub(sky.sun.mul(drop)));
  })();
  const shadows = new Mesh(shadowGeometry as BufferGeometry, marker(shadowOn, vec4(0, 0, 0, 1)));

  for (const mesh of [trails, patches, shadows]) {
    mesh.frustumCulled = false;
    scene.add(mesh);
  }

  /** Where world position p lies on the map, how much of its marks are left there, and the chart's axes at p. */
  const place = (p: N) => {
    const c = view.onEye(p);
    return {
      uv: vec2(c.q.x.div(2 * REACH).add(0.5), c.q.y.div(-2 * REACH).add(0.5)),
      fade: smoothstep(REACH, REACH * 0.8, max(abs(c.q.x), abs(c.q.y))),
      e1: c.e1,
      e2: c.e2,
    };
  };

  // ---- the CPU's half: each ship's wake laid as she goes, and the map's geometry from it
  const wakes: WakePoint[][] = [];
  const index = trailGeometry.index!.array as Uint16Array;

  /** One ship's ribbon from her stem now along her wake, from vertex `v0`; returns the vertices it took. */
  function ribbon(chart: Chart, points: readonly WakePoint[], now: number, v0: number): number {
    const at = trailAt.array as Float32Array, mark = trailMark.array as Float32Array;
    let run = 0;
    points.forEach((p, k) => {
      if (k > 0) run += distance(points[k - 1].at, p.at);
      // along the path toward her bow, from the points either side
      const ahead = points[Math.max(k - 1, 0)].at, behind = points[Math.min(k + 1, points.length - 1)].at;
      const t = add(ahead, behind, -1), side = normalizeV(crossV(p.at, add(t, p.at, -dotV(t, p.at))));
      const age = now - p.time, reach = p.speed * age * KELVIN;
      const half = Math.max(age < ARM_LIFE ? reach + ARM_ROOM : 0, (CHURN + SPREAD * age) * CHURN_ROOM);
      // On the inside of a turn the ribbon reaches no further than most of the way to the turn's centre, past which
      // it would fold back over itself. The turn here: how far the path bends between the stretches either side,
      // over their length (+ to port).
      const into = add(p.at, behind, -1), out = add(ahead, p.at, -1), lengths = length(into) * length(out);
      const bend = lengths > 0 ? dotV(crossV(into, out), p.at) / lengths / (((length(into) + length(out)) / 2) * R) : 0;
      for (const s of [1, -1]) {
        const i = v0 + 2 * k + (s > 0 ? 0 : 1);
        const reaches = s * bend > 0 ? Math.min(half, INSIDE / Math.abs(bend)) : half;
        at.set(toChart(chart, along(p.at, side, s * reaches).p), i * 2);
        mark.set([s * reaches, age, p.speed, run], i * 4);
      }
    });
    return 2 * points.length;
  }

  return {
    /**
     * The marks at world position p on the sea at rest, faded out toward the map's edges: foam, height, air and shadow
     * (vec4; the shadow softened over the three reads), and the height's slope there as a world vector (its gradient
     * along the sea). For the fragment stage.
     */
    read(p: N): { marks: N; slope: N } {
      const { uv, fade, e1, e2 } = place(p);
      const look = (o: N) => texture(target.texture, o).mul(fade);
      const here = look(uv), east = look(uv.add(vec2(1 / SIZE, 0))), south = look(uv.sub(vec2(0, 1 / SIZE)));
      const shadow = here.w.add(east.w).add(south.w).div(3);
      return {
        marks: vec4(here.xyz, shadow),
        slope: e1.mul(east.y.sub(here.y)).add(e2.mul(south.y.sub(here.y))).div(TEXEL),
      };
    },
    /** The wakes' height at world position p on the sea at rest, metres: for the vertex stage. */
    height: (p: N): N => {
      const { uv, fade } = place(p);
      return texture(target.texture, uv).level(float(0)).y.mul(fade);
    },
    /** Each frame, before the sea is drawn: the ships. */
    update(env: Environment, ships: readonly Afloat[]) {
      const eye = view.eye, chart: Chart = { at: eye.frame.up, axis: eye.frame.east };
      const now = env.clock;
      const patch = patchAt.array as Float32Array, patchM = patchMark.array as Float32Array;
      const shadow = poses.array as Float32Array;
      let vertex = 0, triangle = 0, near = 0;
      ships.forEach(({ pose, velocity, look }, i) => {
        const speed = length(velocity);
        const stem = normalizeV(add(pose.position, pose.forward, WATERLINE.stem));
        wakes[i] = laid(wakes[i] ?? [], stem, now, speed);
        // too far off the map for any of her marks to reach it
        if (distance(stem, eye.frame.up) > REACH * 1.5 + WAKE.most * 3) return;
        const points = [{ at: stem, time: now, speed }, ...wakes[i].filter((p, k) => k > 0 || distance(p.at, stem) > 0.05)];
        const took = ribbon(chart, points, now, vertex);
        for (let k = 0; k + 1 < took / 2; k++) {
          const a = vertex + 2 * k;
          index.set([a, a + 1, a + 2, a + 1, a + 3, a + 2], triangle * 3);
          triangle += 2;
        }
        vertex += took;
        // her patch, its corners in her frame and on the chart
        const port = crossV(pose.up, pose.forward), wide = WATERLINE.beam / 2 + PATCH.out;
        [[-wide, WATERLINE.stern - PATCH.astern], [wide, WATERLINE.stern - PATCH.astern], [wide, WATERLINE.stem + PATCH.ahead], [-wide, WATERLINE.stem + PATCH.ahead]]
          .forEach(([x, z], k) => {
            const corner = normalizeV(add(add(pose.position, port, x), pose.forward, z));
            patch.set(toChart(chart, corner), (near * 4 + k) * 2);
            patchM.set([x, z, Math.min(speed / FULL, 1), 0], (near * 4 + k) * 4);
          });
        shadow.set([...pose.position, look.brace, ...pose.forward, 0, ...pose.up, 0], near * 12);
        near++;
      });
      trailGeometry.setDrawRange(0, triangle * 3);
      patchGeometry.setDrawRange(0, near * 6);
      shadowGeometry.instanceCount = near;
      for (const a of [trailAt, trailMark, trailGeometry.index!, patchAt, patchMark]) a.needsUpdate = true;
      poses.needsUpdate = true;
      // cleared to nothing: no foam, no height, no air, no shadow
      const before = renderer.getRenderTarget(), alpha = renderer.getClearAlpha();
      renderer.getClearColor(clear);
      renderer.setRenderTarget(target);
      renderer.setClearColor(0x000000, 0);
      renderer.render(scene, camera);
      renderer.setClearColor(clear, alpha);
      renderer.setRenderTarget(before);
    },
  };
}

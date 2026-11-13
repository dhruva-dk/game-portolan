// The marks the ships leave on the sea, for every ship at once: one small map round the point under the eye, on the
// eye's own chart (view.local: metres east and south along the sphere), drawn afresh each frame and read by the sea's
// shader where it lies. Its four channels, each summed over whatever is drawn there:
//   r  foam's cover: the ring round each waterline, the bow's breaking wave, the churned water astern
//   g  height of the wake's waves over the sea's, metres: the bow wave and the Kelvin wedge spreading off it
//   b  air worked into the water astern (0…1): it scatters more light back (the wake's pale turquoise) and calms
//      the ripples on the surface over it
//   a  the ships' shadows: how much of the sun each ship's hull and canvas take from the sea under her (0…1)
//
// Drawn into it, in one pass of three draws:
//   - each ship's wake, a ribbon along the path her bow has cut (sim/wake.ts), wide enough to hold her Kelvin wedge,
//     carrying across it how far out each point lies, and along it how long ago she passed and how fast she went.
//     Behind her stern the water churns, spreading slowly and fading over tens of seconds, its edges ragged and the
//     foam on it breaking into patches as it ages. The wedge's arms leave her stem at 19.5° to her path (the Kelvin
//     angle, tan 19.5° = 0.354): water she passed t seconds ago at speed v has its arm v·t·0.354 out from her track,
//     so the wedge bends round her turns as the real one does. Each arm is a band of short crests in echelon, slanted
//     across it (as the divergent waves are near the cusp), which stand still in her frame; it widens as it spreads
//     and fades, and the foam its crests leave lies still in the water — a solid line where the bow wave breaks,
//     feathered into dashes along the crests behind, then breaking up into patches and gone. A rough sea (the wind)
//     breaks the arms up sooner and takes them sooner;
//   - a patch round each hull for what hugs her: foam along her waterline (ship/waterline.ts), thin at rest, heaped
//     at the bow with speed, the water piled against her bow and boiling up under her transom;
//   - each ship's third level of detail (her hull, spars and bellied sails), pressed flat onto the sea along the sun:
//     her hull takes all of the sun, her canvas all but what comes through it, and where they overlap (or two ships'
//     do) the darker is kept, not their sum.
// Nothing here is a flat-world shortcut: the wake is laid along great circles and placed on the eye's chart, as the
// sea's own waves are, and the shadows are cast onto the sea's level at each ship.
//
// A texel is half a metre, which the foam's lace (foam.ts) dresses. The marks fade out toward REACH: from the chase
// camera the horizon lies a little past it, where a wake is a hair's breadth.
//
// The shadows are read apart from the rest (`shade`): where the sun's ray through the water on the waves meets the
// sea's level, as they were cast — read under the water at rest instead, they swam with the waves and their edges
// tore into saw teeth across every crest — and softened over a couple of metres. A shadow on the sea is soft: what
// the eye sees of it is the light scattered back from under the surface, and the water under a shadow is lit by
// sunlight that came in beside it. A spar's or a sail's thin shadow edge-on to the sun is then a faint smudge, as it
// is from a deck; only the hull's and a broadside sail's are deep.
//
// With no ship near enough to mark it, the map isn't drawn at all and the sea is told it is empty: a pass that drew
// nothing would still be a pass, and one with no work in it leaves the GPU's timestamps for it unwritten (the frame
// meter would read whatever they last held).

import {
  AddEquation, BufferAttribute, BufferGeometry, CustomBlending, DoubleSide, DynamicDrawUsage, HalfFloatType,
  InstancedBufferGeometry, InstancedInterleavedBuffer, InterleavedBufferAttribute, LinearFilter, MaxEquation, Mesh, MeshBasicNodeMaterial,
  OneFactor, OrthographicCamera, RGBAFormat, RenderTarget, Scene,
} from 'three/webgpu';
import {
  Fn, abs, attribute, cos, cross, dot, exp, float, length as lengthN, max, mx_noise_float, normalize, saturate, select, sin, smoothstep,
  texture, uniform, vec2, vec3, vec4,
} from 'three/tsl';
import type { Environment } from '../environment';
import type { Draw } from '../gpu';
import { PIVOT_Z, buildShip } from '../ship/build';
import { THROUGH } from '../ship/materials';
import { WATERLINE } from '../ship/waterline';
import { WAKE, laid, type WakePoint } from '../sim/wake';
import type { Sky } from '../sky/sky';
import type { View } from '../view/view';
import type { ShipPose } from '../world/pose';
import { R, add, along, cross as crossV, distance, dot as dotV, length, normalize as normalizeV, toChart, type Chart, type Vec3 } from '../world/sphere';
import { outside } from './hulls';
import type { FloatNode, Vec2Node, Vec3Node, Vec4Node } from '../tsl';

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
/** The wedge's arms: their crests' height at full speed, metres, and how long they last in a calm, seconds (fading by
 * e each FADE); the share of that a rough sea takes. */
const ARM = 0.18, ARM_LIFE = 22, ARM_FADE = 10, ROUGH = 0.45;
/** An arm's half-width as it leaves her stem, metres, and how fast it widens, metres a second per metre a second of
 * her speed then. */
const ARM_WIDTH = 0.6, WIDEN = 0.03;
/** The ribbon reaches this many of an arm's half-widths past its crest (and at least ARM_ROOM metres), and at least
 * this many of the churn's half-widths. */
const ARM_REACH = 4, ARM_ROOM = 4, CHURN_ROOM = 2.6;
/** The wind at which the sea is at its roughest for the wakes, metres a second (calm below a quarter of it). */
const ROUGHEST = 14;
/** On the inside of a turn, the ribbon reaches this share of the way to its centre. */
const INSIDE = 0.8;
/** Foam round a waterline at rest, and the bow wave's height at full speed, metres. */
const LAPPING = 0.7, BOW = 0.45;
/** The patch round a hull: metres astern of her transom, ahead of her stem and out from her side. */
const PATCH = { astern: 7, ahead: 4, out: 4.5 };
/** The least the sun's rays may lie along the sea for her shadow: low suns stretch it no further. */
const LOW_SUN = 0.15;
/** A shadow is read as the mean of a SOFT × SOFT grid of taps a texel apart (each one filtered), so softened over about
 * SOFT + 1 texels. */
const SOFT = 3;

const vertices = WAKE.most + 1;

const sq = (x: FloatNode): FloatNode => x.mul(x);

/** A ship as her marks need her: her pose, her velocity (world, metres a second) and her yards' brace (radians). */
export interface Afloat { pose: ShipPose; velocity: Vec3; look: { brace: number } }

/** A material that draws straight onto the map (the chart's metres in `at`) and adds what it draws to what is there. */
function marker(at: Vec2Node, mark: Vec4Node): MeshBasicNodeMaterial {
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

/** The first `items` items of a buffer marked to go up to the GPU, and no more (none: nothing goes up). */
function sent(a: BufferAttribute | InstancedInterleavedBuffer, items: number) {
  const size = a instanceof BufferAttribute ? a.itemSize : a.stride;
  if (items <= 0) return;
  a.addUpdateRange(0, items * size);
  a.needsUpdate = true;
}

export type Wake = ReturnType<typeof createWake>;

/** capacity: the most ships. */
export function createWake(view: View, sky: Sky, capacity: number) {
  const target = new RenderTarget(SIZE, SIZE, { type: HalfFloatType, format: RGBAFormat, depthBuffer: false });
  target.texture.minFilter = target.texture.magFilter = LinearFilter;
  target.texture.generateMipmaps = false;
  const scene = new Scene();
  // (unused: every draw places itself on the map)
  const camera = new OrthographicCamera();
  /** The map's draw, cleared to nothing: no foam, no height, no air, no shadow. */
  const draw: Draw = { scene, camera, target, clear: { color: 0x000000, alpha: 0 } };
  /** 1 while the map holds this frame's marks, 0 while no ship is near enough to draw any. */
  const live = uniform(0);
  /** How rough the sea is, 0…1, by the wind. */
  const rough = uniform(0);

  // ---- the wakes: ribbons along the bows' paths
  const trailGeometry = new BufferGeometry();
  const trailAt = dynamic(capacity * vertices * 2, 2), trailMark = dynamic(capacity * vertices * 2, 4);
  const trailLaid = dynamic(capacity * vertices * 2, 1);
  trailGeometry.setAttribute('at', trailAt);
  trailGeometry.setAttribute('mark', trailMark);
  trailGeometry.setAttribute('laid', trailLaid);
  trailGeometry.setIndex(new BufferAttribute(new Uint16Array(capacity * (vertices - 1) * 6), 1).setUsage(DynamicDrawUsage));
  const trails = new Mesh(trailGeometry, marker(attribute('at', 'vec2'), Fn(() => {
    // across: metres out from her track (+ to port); age: seconds since she passed; v: her speed then; run: metres
    // along the path from her stem now; laid: metres along the path from where she began it (fixed in the water)
    const m = attribute('mark', 'vec4'), across = m.x, age = m.y, v = m.z, run = m.w, laid = attribute('laid', 'float');
    const pace = saturate(v.div(FULL)), calm = float(1).sub(rough.mul(ROUGH));
    // patches some metres across, fixed in the water: what is left of the foam breaks up along them
    const patchy = (size: number, salt: number): FloatNode => mx_noise_float(vec3(laid.div(size), across.div(size), salt));
    // the churned water astern, its edges ragged, its foam breaking up as it ages
    const spread = age.mul(SPREAD).add(CHURN).mul(patchy(5, 0.5).mul(0.3).add(1));
    const churned = exp(sq(across.div(spread)).negate()).mul(smoothstep(LENGTH - 1, LENGTH + 3, run)).mul(pace);
    const worn = age.div(24).add(rough.mul(0.2));
    const churnLeft = smoothstep(worn.sub(0.45), worn.sub(0.1), patchy(3, 1.5));
    const foam = churned.mul(exp(age.div(-3)).mul(0.55).add(exp(age.div(-12)).mul(0.25).mul(churnLeft))).toVar();
    const air = churned.mul(exp(age.div(-10)));
    // the arms: metres outside each's line, its half-width, and what is left of it
    const off = abs(across).sub(v.mul(age).mul(KELVIN));
    const width = v.mul(age).mul(WIDEN).add(ARM_WIDTH);
    const life = exp(age.div(calm.mul(-ARM_FADE))).mul(smoothstep(calm.mul(ARM_LIFE), calm.mul(ARM_LIFE * 0.5), age)).mul(pace);
    // its crests in echelon, slanted 35° across it, a wavelength apart that grows with her speed: standing in her
    // frame for the waves (by run), lying in the water for the foam they leave (by laid)
    const wavelength = v.mul(0.6).add(3);
    const slant = (along: FloatNode): FloatNode => cos(off.mul(0.82).add(along.mul(0.57)).mul(2 * Math.PI).div(wavelength));
    const band = exp(sq(off.div(width.mul(select(off.greaterThan(0), float(1), float(2))))).negate());
    const groups = mx_noise_float(vec2(run.div(14), 0.3)).mul(0.35).add(0.8);
    const height = band.mul(slant(run)).mul(groups).mul(life).mul(ARM).div(v.mul(age).mul(0.06).add(1).sqrt());
    // the bow wave breaks white along the arms near her, feathered along its crests; the foam it leaves widens, and
    // breaks up into patches the farther back it lies, and the rougher the sea
    const feathers = smoothstep(-0.2, 0.8, slant(laid));
    foam.addAssign(exp(sq(off.div(0.8)).negate()).mul(pace.mul(pace)).mul(exp(age.div(-1.5)).mul(0.9)).mul(feathers.mul(0.4).add(0.6)));
    const streak = width.mul(0.5).add(0.6), gone = age.div(calm.mul(ARM_LIFE)).add(rough.mul(0.2));
    const left = smoothstep(gone.sub(0.55), gone.sub(0.15), patchy(4, 2.5).mul(0.7).add(patchy(1.5, 3.5).mul(0.3)));
    foam.addAssign(exp(sq(off.div(streak)).negate()).mul(float(1.2).div(streak).sqrt()).mul(life).mul(feathers).mul(left).mul(0.3));
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

  // ---- the shadows: each ship's third level pressed onto the sea along the sun (its sails bellied, as the farthest
  // level's flat ones are not: edge-on to the sun, those cast only a line)
  const caster = buildShip(2);
  const shadowGeometry = new InstancedBufferGeometry();
  {
    // the hull's and spars' shadow is whole; the canvas lets some of the sun through
    const parts = [{ p: caster.body, dark: 1 }, { p: caster.cloth, dark: 1 - THROUGH }];
    const position = new Float32Array(parts.reduce((n, { p }) => n + p.position.length, 0));
    const part = new Uint8Array(parts.reduce((n, { p }) => n + p.part.length, 0));
    const dark = new Float32Array(parts.reduce((n, { p }) => n + p.vertices, 0));
    const index: number[] = [];
    let base = 0;
    for (const { p, dark: d } of parts) {
      position.set(p.position, base * 3);
      part.set(p.part, base * 4);
      dark.fill(d, base, base + p.vertices);
      p.index.forEach((i) => index.push(i + base));
      base += p.vertices;
    }
    shadowGeometry.setAttribute('position', new BufferAttribute(position, 3));
    shadowGeometry.setAttribute('part', new BufferAttribute(part, 4, true));
    shadowGeometry.setAttribute('dark', new BufferAttribute(dark, 1));
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
    const n = normalize(at.xyz), sun = sky.sun(at.xyz);
    const drop = dot(p.sub(n.mul(R)), n).div(max(dot(sun, n), LOW_SUN));
    return view.local(p.sub(sun.mul(drop)));
  })();
  const shadowMarker = marker(shadowOn, vec4(0, 0, 0, attribute('dark', 'float')));
  // the darkest shadow over each texel, not their sum (the other marks leave the shadows' channel as it is)
  shadowMarker.blendEquationAlpha = MaxEquation;
  const shadows = new Mesh(shadowGeometry as BufferGeometry, shadowMarker);

  for (const mesh of [trails, patches, shadows]) {
    mesh.frustumCulled = false;
    scene.add(mesh);
  }

  /** Where world position p lies on the map, how much of its marks are left there, and the chart's axes at p. */
  const place = (p: Vec3Node) => {
    const c = view.onEye(p);
    return {
      uv: vec2(c.q.x.div(2 * REACH).add(0.5), c.q.y.div(-2 * REACH).add(0.5)),
      fade: smoothstep(REACH, REACH * 0.8, max(abs(c.q.x), abs(c.q.y))).mul(live),
      e1: c.e1,
      e2: c.e2,
    };
  };

  // ---- the CPU's half: each ship's wake laid as she goes, and the map's geometry from it
  const wakes: WakePoint[][] = [];
  /** How far each ship's bow has gone since her wake began, metres; and where it was last frame. */
  const sailed: number[] = [], stems: (Vec3 | null)[] = [];
  const index = trailGeometry.index!.array as Uint16Array;

  /** One ship's ribbon from her stem now along her wake (`gone`: how far she has sailed it), from vertex `v0`;
   * returns the vertices it took. */
  function ribbon(chart: Chart, points: readonly WakePoint[], now: number, gone: number, v0: number): number {
    const at = trailAt.array as Float32Array, mark = trailMark.array as Float32Array, laid = trailLaid.array as Float32Array;
    let run = 0;
    points.forEach((p, k) => {
      if (k > 0) run += distance(points[k - 1].at, p.at);
      // along the path toward her bow, from the points either side
      const ahead = points[Math.max(k - 1, 0)].at, behind = points[Math.min(k + 1, points.length - 1)].at;
      const t = add(ahead, behind, -1), side = normalizeV(crossV(p.at, add(t, p.at, -dotV(t, p.at))));
      const age = now - p.time, reach = p.speed * age * KELVIN;
      const room = Math.max(ARM_ROOM, ARM_REACH * (ARM_WIDTH + WIDEN * p.speed * age));
      const half = Math.max(age < ARM_LIFE ? reach + room : 0, (CHURN + SPREAD * age) * CHURN_ROOM);
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
        laid[i] = gone - run;
      }
    });
    return 2 * points.length;
  }

  return {
    /**
     * The marks at world position p on the sea at rest, faded out toward the map's edges: foam, height and air
     * (vec3), and the height's slope there as a world vector (its gradient along the sea). For the fragment stage.
     */
    read(p: Vec3Node): { marks: Vec3Node; slope: Vec3Node } {
      const { uv, fade, e1, e2 } = place(p);
      const look = (o: Vec2Node) => texture(target.texture, o).mul(fade);
      const here = look(uv), east = look(uv.add(vec2(1 / SIZE, 0))), south = look(uv.sub(vec2(0, 1 / SIZE)));
      return {
        marks: here.xyz,
        slope: e1.mul(east.y.sub(here.y)).add(e2.mul(south.y.sub(here.y))).div(TEXEL),
      };
    },
    /** The share of the sun the ships' shadows take from world position p on the waves, 0…1, softened. For the
     * fragment stage. */
    shade(p: Vec3Node): FloatNode {
      // down the sun's ray to the sea's level, as the shadows were cast
      const up = normalize(p), sun = sky.sun(p);
      const { uv, fade } = place(p.sub(sun.mul(lengthN(p).sub(R).div(max(dot(sun, up), LOW_SUN)))));
      let sum: FloatNode = float(0);
      for (let i = 0; i < SOFT; i++) for (let j = 0; j < SOFT; j++) {
        sum = sum.add(texture(target.texture, uv.add(vec2(i - (SOFT - 1) / 2, j - (SOFT - 1) / 2).div(SIZE))).w);
      }
      return sum.mul(fade).div(SOFT * SOFT);
    },
    /** The wakes' height at world position p on the sea at rest, metres: for the vertex stage. */
    height: (p: Vec3Node): FloatNode => {
      const { uv, fade } = place(p);
      return texture(target.texture, uv).level(float(0)).y.mul(fade);
    },
    /** Each frame, before the sea is drawn: the ships. Returns the map's draw, or null when no ship is near. */
    update(env: Environment, ships: readonly Afloat[]): Draw | null {
      const eye = view.eye, chart: Chart = { at: eye.frame.up, axis: eye.frame.east };
      const now = env.clock;
      rough.value = Math.min(Math.max((env.windSpeed - ROUGHEST / 4) / (ROUGHEST * 0.75), 0), 1);
      const patch = patchAt.array as Float32Array, patchM = patchMark.array as Float32Array;
      const shadow = poses.array as Float32Array;
      let vertex = 0, triangle = 0, near = 0;
      ships.forEach(({ pose, velocity, look }, i) => {
        const speed = length(velocity);
        const stem = normalizeV(add(pose.position, pose.forward, WATERLINE.stem));
        const was = wakes[i];
        wakes[i] = laid(was ?? [], stem, now, speed);
        // a fresh wake starts the count again (and it goes round every 4 km, to keep its precision; the seam is
        // a jump in the patches' pattern, once in a long while)
        const fresh = !was?.length || !wakes[i].includes(was[0]) || !stems[i];
        sailed[i] = fresh ? 0 : (sailed[i] + distance(stems[i]!, stem)) % 4096;
        stems[i] = stem;
        // too far off the map for any of her marks to reach it
        if (distance(stem, eye.frame.up) > REACH * 1.5 + WAKE.most * 3) return;
        const points = [{ at: stem, time: now, speed }, ...wakes[i].filter((p, k) => k > 0 || distance(p.at, stem) > 0.05)];
        const took = ribbon(chart, points, now, sailed[i], vertex);
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
      // (a ship at rest lays no ribbon: then there is no trail to draw)
      trails.visible = triangle > 0;
      patchGeometry.setDrawRange(0, near * 6);
      shadowGeometry.instanceCount = near;
      // only what was written goes up: the buffers hold the most ships' worth
      ([[trailAt, vertex], [trailMark, vertex], [trailLaid, vertex], [trailGeometry.index!, triangle * 3], [patchAt, near * 4], [patchMark, near * 4], [poses, near]] as const)
        .forEach(([a, items]) => sent(a, items));
      live.value = near > 0 ? 1 : 0;
      return near > 0 ? draw : null;
    },
  };
}

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
  BufferAttribute, BufferGeometry, DoubleSide, DynamicDrawUsage, HalfFloatType, InstancedBufferGeometry, InstancedInterleavedBuffer,
  InterleavedBufferAttribute, LinearFilter, MaxEquation, Mesh, MeshBasicNodeMaterial, OrthographicCamera, RGBAFormat, RenderTarget, Scene,
} from 'three/webgpu';
import {
  Fn, abs, attribute, cos, cross, dot, exp, float, length, max, min, mix, mx_noise_float, normalize, saturate, select, sin, smoothstep,
  step, texture, uniform, vec2, vec3, vec4,
} from 'three/tsl';
import type { Environment } from '../environment.ts';
import { additive, type Draw } from '../gpu.ts';
import { PIVOT_Z, buildShip } from '../ship/build.ts';
import { THROUGH } from '../ship/materials.ts';
import { WATERLINE } from '../ship/waterline.ts';
import { WAKE, lay, type WakePoint } from '../sim/wake.ts';
import type { Sky } from '../sky/sky.ts';
import type { View } from '../view/view.ts';
import type { ShipPose } from '../world/pose.ts';
import { clamp } from '../world/scalar.ts';
import * as sphere from '../world/sphere.ts';
import type { FloatNode, Vec2Node, Vec3Node, Vec4Node } from '../tsl.ts';
import { outside } from './hulls.ts';
import { ARM_LIFE, ARM_WIDTH, CHURN, KELVIN, SPREAD, WIDEN, createRibbon, type Route } from './ribbon.ts';

/** Texels across the map, and how far it reaches from the point under the eye, metres. */
const SIZE = 512, REACH = 128;
const TEXEL = (2 * REACH) / SIZE;
/** The speed at which a ship's wake is at its fullest, metres a second. */
const FULL = 10;
/** Her waterline's length, metres. */
const LENGTH = WATERLINE.stem - WATERLINE.stern;

/** The churn's foam in tongues: TONGUE metres apart along her track, slanting back
 *  TONGUE_SLANT metres a metre out, its cover times TONGUE_CREST on them and TONGUE_LANE in the blue lanes between. */
const TONGUE = 3.5, TONGUE_SLANT = 1.2, TONGUE_CREST = 1.35, TONGUE_LANE = 0.2;
/** The wedge's arms: their crests' height at full speed, metres, and how long they last in a calm (ARM_LIFE, ribbon.ts),
 * fading by e each ARM_FADE seconds; the share of that a rough sea takes. */
const ARM = 0.18, ARM_FADE = 10, ROUGH = 0.45;
/** The bow wave's foam along the arms: how long it lasts, seconds (fading by e each), and its half-width, metres; and
 *  how white the streaks its crests leave behind it are, and how wide at most (metres): bold, so her wake reads as a
 *  short, wide white V hugging her stern, not two long thin arms running to the horizon: the streaks only a faint
 *  tail (water.ts draws foam WAKE_BOLD fuller, and the lobes cut it at about 0.28). Both fade by how far astern they
 *  lie, by e each BOW_REACH of her lengths, so whatever her speed her V is about three lengths long; the air astern
 *  by e each AIR_REACH, so no pale trail outruns it. */
const BOW_LIFE = 3, BOW_FOAM = 2.4, STREAK = 0.12, STREAK_WIDEST = 1.4, BOW_REACH = 1.5, AIR_REACH = 1.5;
/** The bow wave's foam: a whole white rim along each arm's line, RIM_SHARE of BOW_FOAM wide, and inside it the crests
 *  curling in, feathered, CURL_REACH of it, with blue between: neither loose flecks nor one flat band nor a chain of
 *  separate blobs; the curls near the rim, so seen from astern the V is two white arms with blue inside, not a white
 *  sheet. */
const RIM_SHARE = 0.3, CURL_REACH = 0.9;
/** The crests' feathering: where along each crest's wave (its cosine, −1…1) its foam begins and is whole. */
const FEATHER = [0.1, 0.6] as const;
/** The curls' cover, of the rim's: more than whole, so each crest prints white well in from the rim. */
const CURL = 1.8;
/** The wind at which the sea is at its roughest for the wakes, metres a second (calm below a quarter of it). */
const ROUGHEST = 14;
/** Foam round a waterline at rest: a thin collar, whole against her side, out LAPPING_OUT m; past it the water she
 *  stirs, AIR_OUT m out, pale with air at most LAPPING_AIR (optics.ts), so the white fades through turquoise to the
 *  sea rather than ending as a cut-out band. And the bow wave's height at full speed, metres. */
const LAPPING = 0.85, LAPPING_OUT = 0.6, AIR_OUT = 3, LAPPING_AIR = 0.6, BOW = 0.45;
/** The collar's reach swells and shrinks along her side by LAP_SCALLOP of itself, LAP_WAVE radians a metre. */
const LAP_SCALLOP = 0.6, LAP_WAVE = 2.1;
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
export interface Afloat { pose: ShipPose; velocity: sphere.Vec3; look: { brace: number } }

/** A material that draws straight onto the map (the chart's metres in `at`) and adds what it draws to what is there. */
function marker(at: Vec2Node, mark: Vec4Node): MeshBasicNodeMaterial {
  const m = additive(new MeshBasicNodeMaterial({ side: DoubleSide, depthTest: false, depthWrite: false }));
  m.vertexNode = vec4(at.x.div(REACH), at.y.div(REACH), 0.5, 1);
  m.fragmentNode = mark;
  return m;
}

/** A dynamic float attribute of `n` items of `size`, and the array it is written through. */
const dynamic = (n: number, size: number) => {
  const data = new Float32Array(n * size);
  return { data, attribute: new BufferAttribute(data, size).setUsage(DynamicDrawUsage) };
};

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
  trailGeometry.setAttribute('at', trailAt.attribute);
  trailGeometry.setAttribute('mark', trailMark.attribute);
  trailGeometry.setAttribute('laid', trailLaid.attribute);
  const trailIndex = new Uint16Array(capacity * (vertices - 1) * 6);
  const trailIndexAttribute = new BufferAttribute(trailIndex, 1).setUsage(DynamicDrawUsage);
  trailGeometry.setIndex(trailIndexAttribute);
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
    // its foam in tongues slanting out and back from her track, fixed in the water, blue lanes between them
    const tongue = cos(laid.add(abs(across).mul(TONGUE_SLANT)).add(patchy(2, 4.5).mul(1.5)).mul(2 * Math.PI / TONGUE));
    const tongues = mix(float(TONGUE_LANE), float(TONGUE_CREST), smoothstep(-0.25, 0.25, tongue));
    // (what lingers kept under the foam's half, so it ends cleanly, not in detached specks)
    const foam = churned.mul(exp(age.div(-3)).mul(0.3).add(exp(age.div(-12)).mul(0.1).mul(churnLeft))).mul(tongues).toVar();
    // (metres astern of her transom)
    const behind = max(run.sub(LENGTH), 0);
    const air = churned.mul(exp(age.div(-10))).mul(exp(behind.div(-AIR_REACH * LENGTH)));
    const astern = exp(behind.div(-BOW_REACH * LENGTH));
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
    const feathers = smoothstep(FEATHER[0], FEATHER[1], slant(laid));
    // a whole white rim along the arm's line, and inside it the crests curling in, feathered, blue between them
    const rim = exp(sq(off.div(BOW_FOAM * RIM_SHARE)).negate());
    const curls = exp(sq(off.div(BOW_FOAM * CURL_REACH)).negate()).mul(step(off, 0)).mul(feathers);
    foam.addAssign(max(rim, curls.mul(CURL)).mul(pace).mul(exp(age.div(-BOW_LIFE)).mul(0.9)).mul(astern));
    const streak = min(width.mul(0.5).add(0.6), STREAK_WIDEST), gone = age.div(calm.mul(ARM_LIFE)).add(rough.mul(0.2));
    const left = smoothstep(gone.sub(0.55), gone.sub(0.15), patchy(4, 2.5).mul(0.7).add(patchy(1.5, 3.5).mul(0.3)));
    const streaks = exp(sq(off.div(streak)).negate()).mul(float(1.2).div(streak).sqrt());
    foam.addAssign(streaks.mul(life).mul(feathers).mul(left).mul(STREAK).mul(astern));
    return vec4(foam, height, air, 0);
  })()));

  // ---- what hugs each hull: a patch in her own frame
  const patchGeometry = new BufferGeometry();
  const patchAt = dynamic(capacity * 4, 2), patchMark = dynamic(capacity * 4, 4);
  patchGeometry.setAttribute('at', patchAt.attribute);
  patchGeometry.setAttribute('mark', patchMark.attribute);
  const patchIndex = new Uint16Array(capacity * 6);
  for (let i = 0; i < capacity; i++) patchIndex.set([0, 1, 2, 0, 2, 3].map((k) => k + 4 * i), i * 6);
  patchGeometry.setIndex(new BufferAttribute(patchIndex, 1));
  const patches = new Mesh(patchGeometry, marker(attribute('at', 'vec2'), Fn(() => {
    // across and along: metres in her frame (to port, forward of her middle); her pace
    const m = attribute('mark', 'vec4'), across = m.x, ahead = m.y, pace = m.z;
    const d = outside(across, ahead);
    const fore = smoothstep(0.35, 0.95, ahead.sub(WATERLINE.stern).div(LENGTH));
    // the collar at rest scalloped along her side (each side its own), so it laps rather than lying as one cut ellipse
    const scallop = sin(ahead.mul(LAP_WAVE).add(step(0, across).mul(1.7))).mul(LAP_SCALLOP).add(1 - LAP_SCALLOP);
    const ring = exp(sq(max(d, 0).div(pace.mul(fore).mul(1.4).add(scallop.mul(LAPPING_OUT)))).negate()).mul(smoothstep(-0.8, 0, d));
    // under her transom the water she drags along boils up
    const astern = float(WATERLINE.stern).sub(ahead);
    const boil = exp(sq(astern.sub(1.5).div(2.5)).negate()).mul(exp(sq(across.div(1.8)).negate())).mul(pace);
    const foam = ring.mul(pace.mul(fore.mul(0.9).add(0.35)).add(LAPPING)).add(boil.mul(0.5));
    const height = exp(sq(max(d, 0).div(1.8)).negate()).mul(fore.mul(fore)).mul(pace.mul(pace)).mul(BOW);
    const stirred = exp(sq(max(d, 0).div(AIR_OUT)).negate()).mul(smoothstep(-0.8, 0, d)).mul(LAPPING_AIR);
    return vec4(foam, height, max(ring.mul(pace).mul(0.7).add(boil), stirred), 0);
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
  const shadowPoses = new Float32Array(capacity * 12);
  const poses = new InstancedInterleavedBuffer(shadowPoses, 12).setUsage(DynamicDrawUsage);
  ['shadowAt', 'shadowFwd', 'shadowUp'].forEach((name, i) => {
    shadowGeometry.setAttribute(name, new InterleavedBufferAttribute(poses, 4, i * 4));
  });
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
    const drop = dot(p.sub(n.mul(sphere.R)), n).div(max(dot(sun, n), LOW_SUN));
    return view.local(p.sub(sun.mul(drop)));
  })();
  const shadowMarker = marker(shadowOn, vec4(0, 0, 0, attribute('dark', 'float')));
  // the darkest shadow over each texel, not their sum (the other marks leave the shadows' channel as it is)
  shadowMarker.blendEquationAlpha = MaxEquation;
  const shadows = new Mesh(shadowGeometry, shadowMarker);

  for (const mesh of [trails, patches, shadows]) {
    mesh.frustumCulled = false;
    scene.add(mesh);
  }
  // (none drawn until there is something to draw: a draw of no indices is one WebGPU warns of)
  trails.count = patches.count = 0;

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
  const sailed = new Float64Array(capacity);
  /** Where each ship's bow was last frame (a unit vector), and where it is now. */
  const stems: (sphere.Out3 | undefined)[] = [], bow: sphere.Out3 = [0, 1, 0];
  /** The bow now: the newest point of the ribbon being drawn, which the wake kept so far (sim/wake.ts) goes on from. */
  const head: WakePoint = { at: [0, 1, 0], time: 0, speed: 0 };
  /** The chart the map is drawn on: the eye's. */
  const chart: sphere.Chart = { at: [0, 1, 0], axis: [1, 0, 0] };
  /** A point on a chart, metres (chartAt's out). */
  const onChart = new Float64Array(2);
  const patch = patchAt.data, patchM = patchMark.data;
  /** One ship's wake to lay as a ribbon: her bow now, then what the wake kept (sim/wake.ts). */
  const route: Route = { head, kept: [], skip: 0 };
  const ribbon = createRibbon(trailAt.data, trailMark.data, trailLaid.data);

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
      const { uv, fade } = place(p.sub(sun.mul(length(p).sub(sphere.R).div(max(dot(sun, up), LOW_SUN)))));
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
    /** The map's draw, due or not. */
    draw,
    /** Each frame, before the sea is drawn: the ships. Returns the map's draw, or null when no ship is near. */
    update(env: Environment, ships: readonly Afloat[]): Draw | null {
      const eye = view.eye, now = env.clock;
      chart.at = eye.frame.up;
      chart.axis = eye.frame.east;
      rough.value = clamp((env.windSpeed - ROUGHEST / 4) / (ROUGHEST * 0.75));
      let vertex = 0, triangle = 0, near = 0;
      for (let i = 0; i < ships.length; i++) {
        const { pose, velocity, look } = ships[i], pos = pose.position, fwd = pose.forward, up = pose.up;
        const speed = sphere.length(velocity);
        // her bow, a unit vector of its own: the wake keeps it
        const bx = pos[0] + fwd[0] * WATERLINE.stem, by = pos[1] + fwd[1] * WATERLINE.stem, bz = pos[2] + fwd[2] * WATERLINE.stem;
        const bl = 1 / Math.hypot(bx, by, bz), stem = bow;
        sphere.put(stem, bx * bl, by * bl, bz * bl);
        const last = stems[i], wake = (wakes[i] ??= []), on = lay(wake, stem, now, speed);
        // a fresh wake starts the count again (and it goes round every 4 km, to keep its precision; the seam is
        // a jump in the patches' pattern, once in a long while)
        sailed[i] = on && last ? (sailed[i] + sphere.distance(last, stem)) % 4096 : 0;
        if (last) sphere.put(last, stem[0], stem[1], stem[2]);
        else stems[i] = [stem[0], stem[1], stem[2]];
        // too far off the map for any of her marks to reach it
        if (sphere.distance(stem, eye.frame.up) > REACH * 1.5 + WAKE.most * 3) continue;
        head.at = stem;
        head.time = now;
        head.speed = speed;
        route.kept = wakes[i];
        route.skip = route.kept.length > 0 && sphere.distance(route.kept[0].at, stem) <= 0.05 ? 1 : 0;
        const took = ribbon(chart, route, now, sailed[i], vertex);
        for (let k = 0; k + 1 < took / 2; k++) {
          const a = vertex + 2 * k, t = triangle * 3;
          trailIndex[t] = a, trailIndex[t + 1] = a + 1, trailIndex[t + 2] = a + 2;
          trailIndex[t + 3] = a + 1, trailIndex[t + 4] = a + 3, trailIndex[t + 5] = a + 2;
          triangle += 2;
        }
        vertex += took;
        // her patch, its corners in her frame (x to port, z forward of her middle) and on the chart
        const wide = WATERLINE.beam / 2 + PATCH.out, pace = Math.min(speed / FULL, 1);
        const px = up[1] * fwd[2] - up[2] * fwd[1], py = up[2] * fwd[0] - up[0] * fwd[2], pz = up[0] * fwd[1] - up[1] * fwd[0];
        for (let k = 0; k < 4; k++) {
          const x = k === 1 || k === 2 ? wide : -wide, z = k < 2 ? WATERLINE.stern - PATCH.astern : WATERLINE.stem + PATCH.ahead;
          sphere.chartAt(chart, pos[0] + px * x + fwd[0] * z, pos[1] + py * x + fwd[1] * z, pos[2] + pz * x + fwd[2] * z, onChart);
          const corner = near * 4 + k;
          patch[corner * 2] = onChart[0];
          patch[corner * 2 + 1] = onChart[1];
          patchM[corner * 4] = x;
          patchM[corner * 4 + 1] = z;
          patchM[corner * 4 + 2] = pace;
          patchM[corner * 4 + 3] = 0;
        }
        const o = near * 12;
        shadowPoses[o] = pos[0], shadowPoses[o + 1] = pos[1], shadowPoses[o + 2] = pos[2], shadowPoses[o + 3] = look.brace;
        shadowPoses[o + 4] = fwd[0], shadowPoses[o + 5] = fwd[1], shadowPoses[o + 6] = fwd[2], shadowPoses[o + 7] = 0;
        shadowPoses[o + 8] = up[0], shadowPoses[o + 9] = up[1], shadowPoses[o + 10] = up[2], shadowPoses[o + 11] = 0;
        near++;
      }
      trailGeometry.setDrawRange(0, triangle * 3);
      // (a ship at rest lays no ribbon: then there is no trail to draw)
      trails.count = triangle > 0 ? 1 : 0;
      patchGeometry.setDrawRange(0, near * 6);
      patches.count = near > 0 ? 1 : 0;
      shadowGeometry.instanceCount = near;
      // only what was written goes up: the buffers hold the most ships' worth
      sent(trailAt.attribute, vertex);
      sent(trailMark.attribute, vertex);
      sent(trailLaid.attribute, vertex);
      sent(trailIndexAttribute, triangle * 3);
      sent(patchAt.attribute, near * 4);
      sent(patchMark.attribute, near * 4);
      sent(poses, near);
      live.value = near > 0 ? 1 : 0;
      return near > 0 ? draw : null;
    },
  };
}

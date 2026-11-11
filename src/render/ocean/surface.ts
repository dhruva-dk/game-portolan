// The sea's surface: a grid of rings round the point under the eye, moved by the waves and shaded as water.
//
// The waves are tiles in a plane; the sea is a sphere. The plane is laid on the sphere round an anchor fixed in the
// world by the azimuthal-equidistant map (distance from the anchor kept, bearing kept), which stretches nothing
// along the radius and only θ/sin θ across it: 1% at 130 m from the anchor, 6% at 330 m. Waves never slide with
// the eye. When the eye sails far from the anchor a new one is laid under it, its axes carried over from the old by
// parallel transport, and the sea is drawn from both for a few seconds, weighted cos/sin so the sum of two
// independent seas keeps the variance of one: the waves change their pattern without growing or calming.
//
// The shading is water's: the sky and the sun reflected by Fresnel (three's GGX, with the slopes' unresolved
// variance as roughness), with whatever stands over the water (hulls, shores, lanterns) found in the frame and put
// in for the sky it hides (reflect.ts), and under it the light that went into the water, the sea floor seen through the
// refracting surface and dimmed by Beer–Lambert over the path through the water, the water's own colour where the
// path is long, light through the thin crests where the sun is behind them, and the foam on top.
//
// Wakes, bow waves and splashes are wave particles (ripples.ts) drawn into a field round the point under the eye: the
// grid rises and falls with it, its slopes tilt the surface, and where its crests stand high they break white.
//
// Where the sea meets the land it surfs, as Sea of Thieves' shore does (Ang et al., SIGGRAPH 2018), from the
// coastline's signed distance field (coast.ts): the swell's lines come in over the shallows, closing up as the water
// shoals and breaking where it is shallow, and foam clings where the water runs out against whatever stands in it,
// found from the depth under the surface. At night the surf glows.
import { BufferGeometry, Float32BufferAttribute, Mesh, MeshPhysicalNodeMaterial, Vector2, Vector3, type Node, type Texture } from 'three/webgpu';
import {
  Fn, If, abs, atan, cameraFar, floor, fract, cameraNear, cameraPosition, cameraViewMatrix, clamp, cos, dot, exp, float, length, log2, max,
  min, mix, normalize, output, perspectiveDepthToViewZ, pow, positionGeometry, positionView, positionWorld, screenUV, select, sin,
  smoothstep, sqrt, texture, uniform, fwidth, int, varyingProperty, vec2, vec3, vec4, dFdx, dFdy,
} from 'three/tsl';
import { beneathColour, beneathDepth } from '../gpu/behind.ts';
import { hazeAt } from '../atmosphere/index.ts';
import { R } from '../../sim/sphere.ts';
import { CASCADES, N, SIZES } from './spectrum.ts';
import { LAYER, type Waves } from './waves.ts';
import { BODIES, moonlight, skyLight, sunlight } from '../atmosphere/light.ts';
import { sunShadow } from '../atmosphere/shadows.ts';
import { LAMP, P, shared } from '../gpu/uniforms.ts';
import type { Coast } from './coast.ts';
import type { Territory } from './territory.ts';
import type { Slicks } from './slicks.ts';
import { REACH } from './coastField.ts';
import { waterAt } from '../seaTint.ts';
import type { Flow } from './flow.ts';
import { SeaLight } from './light.ts';
import { RIPPLES, RIPPLE_SPAN } from './ripples.ts';

/** The surf: seconds between the lines of swell coming in, and how fast the lines close up toward the shore (the
 *  phase grows as √distance, so a line's spacing is 2√(d + 1) / SHOAL metres: two at the water's edge, ten 24 m out). */
const SURF_PERIOD = 7, SHOAL = 1;
/** The flow map's period, seconds: each of its two reads is carried down the current for this long before it jumps
 *  back. Long enough that the jump is rare, short enough that nothing is stretched past recognition. */
const FLOW_PERIOD = 2.4;
/** Water slower than this carries no foam of its own, m/s; faster than FAST it runs white: the Great Current's pace
 *  and below is quiet; the Maelstrom's whirl, and a lane running into the Great Current, are not. */
const SLOW = 4.4, FAST = 8;
/** How bright water under a captain's dye is against its own: a saturated hue carries a lot of light in one channel. */
const DYE = 0.7;
/** The sea shows shadows this near the eye, metres, beyond the coast's reach: past the nearer cascade. */
const SHADOWED_WITHIN = 80;
const LUMA = vec3(0.2126, 0.7152, 0.0722);

type F = Node<'float'>;
type V2 = Node<'vec2'>;
type V3 = Node<'vec3'>;

// ---------------------------------------------------------------- the grid

/** The grid's rings: 0.3 m apart under the eye, each 2.2% further than the last, out to the far side. */
const FIRST = 0.3;
const GROWTH = 1.022;
const SPOKES = 512;
/** The highest a crest stands over the sea's level, metres: past the horizon a crest this high can still show. */
const CREST = 4;

/**
 * How many of the grid's indices to draw for an eye `height` metres over the sea: the rings out to the horizon and
 * as far again as a crest past it could show over it, and two more for the waves' sideways reach. The rest lie on
 * the far side of the curve of the sea and are never seen; a deck's eye cuts close to half of them.
 */
export function gridToHorizon(height: number): number {
  const reach = R * (Math.acos(R / (R + Math.max(height, 0))) + Math.acos(R / (R + CREST)));
  const ring = Math.ceil(Math.log(1 + (reach * (GROWTH - 1)) / FIRST) / Math.log(GROWTH)) + 2;
  return 3 * SPOKES + 6 * SPOKES * Math.max(ring - 1, 0);
}

function polarGrid(): BufferGeometry {
  const rings: number[] = [];
  const end = Math.PI * R;
  for (let k = 1; ; k++) {
    const s = (FIRST * (Math.pow(GROWTH, k) - 1)) / (GROWTH - 1);
    if (s >= end * 0.998) { rings.push(end); break; }
    rings.push(s);
  }
  const pos: number[] = [0, 0, 0], idx: number[] = [];
  rings.forEach((r, k) => {
    for (let s = 0; s < SPOKES; s++) pos.push(r, 0, (s / SPOKES) * Math.PI * 2 + (k % 2) * (Math.PI / SPOKES));
  });
  for (let s = 0; s < SPOKES; s++) idx.push(0, 1 + ((s + 1) % SPOKES), 1 + s);
  for (let k = 1; k < rings.length; k++) for (let s = 0; s < SPOKES; s++) {
    const a = 1 + (k - 1) * SPOKES + s, b = 1 + (k - 1) * SPOKES + ((s + 1) % SPOKES), c = a + SPOKES, d = b + SPOKES;
    idx.push(a, b, c, b, d, c);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new Float32BufferAttribute(new Float32Array(pos.length).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  g.setIndex(idx);
  return g;
}

// ---------------------------------------------------------------- the frames

/** The grid's centre and axes, and the two frames the waves are laid in with their weights. */
export const FRAME = shared({
  nadir: uniform(new Vector3(0, 1, 0)),
  gridE1: uniform(new Vector3(1, 0, 0)),
  gridE2: uniform(new Vector3(0, 0, -1)),
  anchor0: uniform(new Vector3(0, 1, 0)),
  axis0: uniform(new Vector3(1, 0, 0)),
  anchor1: uniform(new Vector3(0, 1, 0)),
  axis1: uniform(new Vector3(1, 0, 0)),
  /** cos and sin of the crossfade's angle: (1, 0) with one frame. */
  weight: uniform(new Vector2(1, 0)),
});

/** The water's light (its colour and clarity are each region's: seaTint.ts waterAt). */
export const WATER = shared({
  /** The colour light takes through a thin crest. */
  crest: uniform(new Vector3(0.1, 0.55, 0.42)),
  foam: uniform(new Vector3(0.82, 0.86, 0.88)),
  /** The slope variance finer than the smallest cascade: the capillary ripples, raised by rain. */
  ripples: uniform(0.0012),
});

export interface Frame { anchor: Node<'vec3'>; axis: Node<'vec3'> }
export const FRAMES: Frame[] = [{ anchor: FRAME.anchor0, axis: FRAME.axis0 }, { anchor: FRAME.anchor1, axis: FRAME.axis1 }];

/** Where up lies in a frame, metres in its plane, and the plane's axes carried to up (for displacement and slope). */
export function inFrame(up: V3, f: Frame): { q: V2; e1: V3; e2: V3 } {
  const A = f.anchor, a1 = f.axis;
  const a2 = A.cross(a1);
  const c = dot(up, A);
  const d = up.sub(A.mul(c));
  const s = length(d);
  const dir = select(s.greaterThan(1e-7), d.div(max(s, 1e-7)), a1);
  const theta = atan(s, c);
  const cp = dot(dir, a1), sp = dot(dir, a2);
  const g = dir.mul(cos(theta)).sub(A.mul(sin(theta)));
  const t = A.cross(dir);
  return { q: vec2(cp, sp).mul(theta.mul(R)), e1: g.mul(cp).sub(t.mul(sp)), e2: g.mul(sp).add(t.mul(cp)) };
}

/** The wave field the sea is drawn from, once the ocean is built: what seaHeightNode reads. */
export const SEA_FIELD: { texture: Texture | null } = { texture: null };

/**
 * The sea's surface over `up` in metres from the planet's centre, as near as anything riding it needs: the level of
 * the tide, and the height of the waves of every cascade at their finest mip, in both frames. For
 * compute work (particles landing on the water); null until the ocean is built.
 */
export function seaHeightNode(up: V3): F | null {
  const tex = SEA_FIELD.texture;
  if (!tex) return null;
  const field = texture(tex);
  let h: F = float(0);
  FRAMES.forEach((f, k) => {
    const { q } = inFrame(up, f);
    let d: F = float(0);
    for (let c = 0; c < CASCADES; c++) d = d.add(field.sample(q.div(SIZES[c])).depth(int(LAYER.displacement + c)).level(float(0)).y);
    h = h.add(d.mul(k === 0 ? FRAME.weight.x : FRAME.weight.y));
  });
  return float(P.planet.y).add(h);
}

// ---------------------------------------------------------------- rain on the water

/** Three layers of drops, each landing once in each cell of a grid at its own rate and laying a ring that spreads and
 *  dies: their slope in the frame's plane, in metres per metre. */
const RAIN_LAYERS = [
  { cell: 0.45, rate: 1.7, offset: [0, 0] },
  { cell: 0.6, rate: 1.3, offset: [0.37, 0.71] },
  { cell: 0.8, rate: 1.05, offset: [0.83, 0.19] },
];

const hash2 = (p: V2): V2 => fract(sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))).mul(43758.5453));

function rainRings(q: V2): V2 {
  const slope = vec2(0).toVar();
  RAIN_LAYERS.forEach((l, k) => {
    const p = q.div(l.cell).add(vec2(l.offset[0], l.offset[1]));
    const cell = floor(p), f = fract(p);
    const start = hash2(cell.add(k * 17.3)).x;
    const clock = P.time.mul(l.rate).add(start);
    const age = fract(clock);
    // each time it lands somewhere new in the cell, kept off its sides so the ring stays inside it
    const at = hash2(cell.add(floor(clock).mul(vec2(3.1, 7.7))).add(k * 5.1)).mul(0.5).add(0.25);
    const d = f.sub(at).mul(l.cell);
    const r = length(d);
    // a crest and trough running out at 0.3 m/s, its wavelength about 4 cm, dying as it spreads
    const x = r.sub(age.mul(l.cell * 0.42));
    const k2 = 2 * Math.PI / 0.045, s2 = 0.0004;
    const env = exp(x.mul(x).div(-s2)).mul(float(1).sub(age).pow(2));
    const dh = cos(x.mul(k2)).mul(k2).sub(sin(x.mul(k2)).mul(x).mul(2 / s2)).mul(env).mul(0.0009);
    slope.addAssign(d.div(max(r, 1e-4)).mul(dh));
  });
  return slope;
}

// ---------------------------------------------------------------- the material

/** A map's rate of change across the pixel, along the screen's x and y. */
interface Rate { x: V2; y: V2 }

export function oceanSurface(waves: Waves, coast: Coast, noise: Texture, territory: Territory, flow: Flow, slicks: Slicks): Mesh {
  const mat = new MeshPhysicalNodeMaterial({ metalness: 0, ior: 1.333, specularIntensity: 1 });
  // the sea works out its own haze, once, under the surface (below): it is not something beneath itself either
  mat.fog = false;
  const airLoss = vec3(1).toVar('oceanAirLoss'), airLight = vec3(0).toVar('oceanAirLight');

  // ----- vertex: the grid on the sphere, moved by the waves
  const along = positionGeometry.x, bearing = positionGeometry.z;
  const th = along.div(R);
  const out = FRAME.gridE1.mul(cos(bearing)).add(FRAME.gridE2.mul(sin(bearing)));
  const up = FRAME.nadir.mul(cos(th)).add(out.mul(sin(th))).normalize();
  // the grid's spacing here, and the mip of each cascade that holds no wave shorter than four spacings
  const field = texture(waves.field);
  const sample = (uv: V2, layer: number) => field.sample(uv).depth(int(layer));
  // a read inside a branch that only some of a quad's pixels take has no derivatives of its own to choose its mip by
  // (WGSL leaves them undefined there): such a read is given its map's rate of change across the pixel, worked out
  // at the top of the fragment (colorNode), scaled as the read scales the map
  const sampleAcross = (uv: V2, layer: number, d: Rate, k: number) => field.sample(uv).depth(int(layer)).grad(d.x.mul(k), d.y.mul(k));
  const noiseMap = texture(noise);
  const noiseAcross = (uv: V2, d: Rate, k: number) => noiseMap.sample(uv).grad(d.x.mul(k), d.y.mul(k));
  const spacing = max(along.mul(GROWTH - 1).add(FIRST), sin(th).mul((R * 2 * Math.PI) / SPOKES));
  const displaced = (f: Frame) => {
    const { q, e1, e2 } = inFrame(up, f);
    const d = vec3(0).toVar();
    for (let c = 0; c < CASCADES; c++) {
      const lod = max(log2(spacing.div(SIZES[c] / N)).add(1), 0);
      d.addAssign(sample(q.div(SIZES[c]), LAYER.displacement + c).level(lod).xyz);
    }
    return { q, world: e1.mul(d.x).add(up.mul(d.y)).add(e2.mul(d.z)), height: d.y };
  };
  const vq = varyingProperty('vec4', 'vOceanQ');
  // the rates of change across the pixel of the two frames' maps and of the land's projection (surf)
  const landMap = positionWorld.xz.add(vec2(0.71, -0.53).mul(positionWorld.y));
  const D0: Rate = { x: dFdx(vq.xy).toVar('oceanD0x'), y: dFdy(vq.xy).toVar('oceanD0y') };
  const D1: Rate = { x: dFdx(vq.zw).toVar('oceanD1x'), y: dFdy(vq.zw).toVar('oceanD1y') };
  const DL: Rate = { x: dFdx(landMap).toVar('oceanDLx'), y: dFdy(landMap).toVar('oceanDLy') };
  const vRise = varyingProperty('float', 'vOceanRise');
  const vUp = varyingProperty('vec3', 'vOceanUp');
  const vLevel = varyingProperty('float', 'vOceanLevel');
  // the wakes' field: where this lies in it (and how far in from its edge), and the field's axes carried here
  const ripples = texture(RIPPLES.field);
  const vRipple = varyingProperty('vec3', 'vOceanRipple');
  const vRippleE1 = varyingProperty('vec3', 'vOceanRippleE1');
  const vRippleE2 = varyingProperty('vec3', 'vOceanRippleE2');
  // what changes over metres, not over a pixel, worked out at the grid's vertices and carried across its triangles:
  // the haze between the eye and the water, the sky's light falling into it, and this region's water
  const vAirLoss = varyingProperty('vec3', 'vOceanAirLoss');
  const vAirLight = varyingProperty('vec3', 'vOceanAirLight');
  const vSkyDown = varyingProperty('vec3', 'vOceanSkyDown');
  const vDeep = varyingProperty('vec3', 'vOceanDeep');
  const vExtinction = varyingProperty('vec3', 'vOceanExtinction');
  const near: Frame = { anchor: FRAME.nadir, axis: FRAME.gridE1 };
  mat.positionNode = Fn(() => {
    const a = displaced(FRAMES[0]);
    const q = vec4(a.q, 0, 0).toVar();
    const lift = a.world.mul(FRAME.weight.x).toVar();
    const rise = a.height.mul(FRAME.weight.x).toVar();
    If(FRAME.weight.y.greaterThan(0), () => {
      const b = displaced(FRAMES[1]);
      q.zw.assign(b.q);
      lift.addAssign(b.world.mul(FRAME.weight.y));
      rise.addAssign(b.height.mul(FRAME.weight.y));
    });
    // the wakes and splashes: the field is drawn in the grid's own map (its first row is the map's far side)
    const r = inFrame(up, near);
    const at = vec3(r.q.x.div(2 * RIPPLE_SPAN).add(0.5), float(0.5).sub(r.q.y.div(2 * RIPPLE_SPAN)),
      smoothstep(RIPPLE_SPAN, RIPPLE_SPAN * 0.8, max(abs(r.q.x), abs(r.q.y))));
    vRipple.assign(at);
    vRippleE1.assign(r.e1);
    vRippleE2.assign(r.e2);
    const wake = ripples.sample(at.xy).level(float(0)).x.mul(at.z);
    lift.addAssign(up.mul(wake));
    rise.addAssign(wake);
    // a calm stills the waves toward its middle
    const still = float(1).sub(flow.calmAt(up).mul(0.85));
    vq.assign(q);
    vRise.assign(rise.mul(still));
    vUp.assign(up);
    // on the sea's level: the tide's
    const level = float(P.planet.y).toVar();
    vLevel.assign(level.sub(R));
    const there = up.mul(level).add(lift.mul(still)).toVar();
    const air = hazeAt(there);
    vAirLoss.assign(air.loss);
    vAirLight.assign(air.light);
    vSkyDown.assign(skyLight(there, up));
    const water = waterAt(up);
    vDeep.assign(water.deep);
    vExtinction.assign(water.extinction);
    return there;
  })();

  // ----- fragment: the surface's slope, its unresolved roughness and its foam, worked out once at the top of the
  // fragment (the colour is the first thing three builds there) and read by the normal, roughness and backdrop
  const world = vec3(0).toVar('oceanNormal');
  const variance = float(0).toVar('oceanVariance');
  const foam = float(0).toVar('oceanFoam');
  const fold = float(1).toVar('oceanFold');
  const race = float(0).toVar('oceanRace');
  const wakeFoam = float(0).toVar('oceanWakeFoam');
  const surface = () => {
    const u = normalize(vUp);
    // the flow map's two reads: how far down the current each has been carried, seconds, and how much each counts;
    // worked out here, before any branch, so every branch that reads them finds them set
    const cycle = P.time.div(FLOW_PERIOD);
    const phase = vec2(fract(cycle), fract(cycle.add(0.5))).mul(FLOW_PERIOD).toVar('oceanFlowPhase');
    const w0 = float(1).sub(abs(fract(cycle).mul(2).sub(1)));
    const weights = vec2(w0, float(1).sub(w0)).toVar('oceanFlowWeights');
    const current = flow.at(u).toVar('oceanCurrent');
    const calm = flow.calmAt(u).toVar('oceanCalm');
    const shade = (q: V2, f: Frame, w: F, d: Rate) => {
      const { e1, e2 } = inFrame(u, f);
      const s = vec4(0).toVar();
      const dxz = float(0).toVar(), v = float(0).toVar(), white = float(0).toVar();
      // the current in this frame's plane: the shortest waves ride it, so they stream past whatever stands still
      const along = vec2(dot(current, e1), dot(current, e2));
      const moving = length(along).greaterThan(0.15);
      for (let c = 0; c < CASCADES; c++) {
        const uv = q.div(SIZES[c]);
        let sl: Node<'vec4'>, mo: Node<'vec4'>;
        if (c === CASCADES - 1) {
          const slv = vec4(0).toVar(), mov = vec4(0).toVar();
          If(moving, () => {
            const a = q.sub(along.mul(phase.x)).div(SIZES[c]), b = q.sub(along.mul(phase.y)).div(SIZES[c]);
            const k = 1 / SIZES[c];
            slv.assign(sampleAcross(a, LAYER.slope + c, d, k).mul(weights.x).add(sampleAcross(b, LAYER.slope + c, d, k).mul(weights.y)));
            mov.assign(sampleAcross(a, LAYER.moments + c, d, k).mul(weights.x).add(sampleAcross(b, LAYER.moments + c, d, k).mul(weights.y)));
          }).Else(() => {
            slv.assign(sampleAcross(uv, LAYER.slope + c, d, 1 / SIZES[c]));
            mov.assign(sampleAcross(uv, LAYER.moments + c, d, 1 / SIZES[c]));
          });
          sl = slv;
          mo = mov;
        } else {
          sl = sample(uv, LAYER.slope + c);
          mo = sample(uv, LAYER.moments + c);
        }
        s.addAssign(sl);
        dxz.addAssign(mo.w);
        v.addAssign(max(mo.x.sub(sl.x.mul(sl.x)), 0).add(max(mo.y.sub(sl.y.mul(sl.y)), 0)));
        white.addAssign(mo.z);
      }
      const sx = s.x.div(max(s.z.add(1), 0.2)), sz = s.y.div(max(s.w.add(1), 0.2));
      world.addAssign(e1.mul(sx).add(e2.mul(sz)).mul(w));
      variance.addAssign(v.mul(w.mul(w)));
      foam.addAssign(white.mul(w.mul(w)));
      fold.assign(min(fold, s.z.add(1).mul(s.w.add(1)).sub(dxz.mul(dxz))));
    };
    shade(vq.xy, FRAMES[0], FRAME.weight.x, D0);
    If(FRAME.weight.y.greaterThan(0), () => {
      shade(vq.zw, FRAMES[1], FRAME.weight.y, D1);
    });
    // a calm: the slopes, their unresolved spread and the breaking all stilled toward its middle
    const still = float(1).sub(calm.mul(0.85));
    world.mulAssign(still);
    variance.mulAssign(still.mul(still));
    foam.mulAssign(still);
    // fast water runs white: foam carried down the flow and drawn out along it, a short line integral of the noise
    // down the current (Cabral and Leedom, SIGGRAPH 1993) read at both of the flow map's phases
    const speed = length(current);
    const fast = smoothstep(SLOW, FAST, speed).toVar();
    If(fast.greaterThan(0.01), () => {
      const { e1, e2 } = inFrame(u, FRAMES[0]);
      const along = vec2(dot(current, e1), dot(current, e2));
      const dir = along.div(max(speed, 1e-3));
      const streak = (carried: F) => {
        const base = vq.xy.sub(along.mul(carried));
        let n: F = float(0);
        for (let k = -2; k <= 2; k++) n = n.add(noiseAcross(base.add(dir.mul(k * 0.9)).mul(0.11), D0, 0.11).g.mul(k === 0 ? 0.28 : k * k === 1 ? 0.2 : 0.16));
        return n;
      };
      const n = streak(phase.x).mul(weights.x).add(streak(phase.y).mul(weights.y));
      // and a finer grain carried with it, so the streaks' edges fray
      const fine = noiseAcross(vq.xy.sub(along.mul(phase.x)).mul(0.37), D0, 0.37).a.mul(weights.x)
        .add(noiseAcross(vq.xy.sub(along.mul(phase.y)).mul(0.37), D0, 0.37).a.mul(weights.y));
      const m = n.mul(0.75).add(fine.mul(0.25));
      const lace = smoothstep(float(0.66).sub(fast.mul(0.1)), float(0.76).sub(fast.mul(0.1)), m);
      const far = smoothstep(140, 420, length(positionWorld.sub(cameraPosition)));
      race.assign(mix(lace, fast.mul(0.22), far).mul(fast));
    });
    // the wakes' slopes, and white where their crests stand high
    If(vRipple.z.greaterThan(0), () => {
      const w = ripples.sample(vRipple.xy).level(float(0)).mul(vRipple.z);
      world.addAssign(vRippleE1.mul(w.y).add(vRippleE2.mul(w.z)).mul(still));
      const lace = noiseAcross(vq.xy.mul(0.31), D0, 0.31).a.add(w.w.mul(0.6));
      wakeFoam.assign(smoothstep(0.1, 0.32, w.x).mul(smoothstep(0.5, 0.72, lace)).mul(0.85));
    });
    // rain ringing the water near the eye, where the rings can be seen
    const near = smoothstep(45, 6, positionWorld.distance(cameraPosition)).mul(P.rain);
    If(near.greaterThan(0.01), () => {
      const { e1, e2 } = inFrame(u, FRAMES[0]);
      const g = rainRings(vq.xy).mul(near);
      world.addAssign(e1.mul(g.x).add(e2.mul(g.y)));
    });
    world.assign(normalize(u.sub(world)));
    surf(u);
  };

  // ----- the surf
  const shore = float(0).toVar('oceanShore');
  const shoreGlow = float(0).toVar('oceanShoreGlow');
  /** Whether the water here lies within the coast's reach, where cliffs and stacks throw their shadows on it. */
  const coastal = float(0).toVar('oceanCoastal');
  // ----- the captains' ink: their colour in the water they hold, and for the eye a line round it, plain by day and
  // faintly alight at night, a flood's bright edge as a closed loop inks the water, the trail each is laying, and the
  // ghost of one just washed out. Worked out once for the whole of the water's light (outputNode).
  const ink = (u: V3) => {
    const colour = vec3(0).toVar('oceanInk'), share = float(0).toVar('oceanInkShare'), glow = vec3(0).toVar('oceanInkGlow');
    const lineInk = vec3(0).toVar('oceanLineInk'), lineShare = float(0).toVar('oceanLineShare');
    // across the screen, here while control flow is still uniform; and the water's grain for the lines' ink
    const dx = dFdx(u), dy = dFdy(u);
    const p = positionWorld;
    const q = p.xz.add(vec2(0.71, -0.53).mul(p.y));
    const grain = noiseMap.sample(q.mul(0.045)).r;
    If(territory.on.greaterThan(0.5), () => {
      const t = territory.at(u, dx, dy, grain);
      If(t.cover.greaterThan(0.003).or(t.edge.greaterThan(0.003)), () => {
        const mine = t.mine, edge = min(t.edge, 1), crest = min(t.crest, 1);
        colour.assign(t.hue);
        share.assign(t.cover.mul(float(0.4).add(mine.mul(0.25)).add(edge.mul(0.2)).add(crest.mul(0.3))));
        glow.assign(t.hue.mul(t.cover.mul(float(0.03).add(mine.mul(0.05))).add(edge.mul(float(0.16).add(mine.mul(0.2)))).add(crest.mul(0.5))));
        lineInk.assign(t.hue);
        // a thin wash on the surface too, so the dye still reads where the water only mirrors the sky
        lineShare.assign(max(t.cover.mul(float(0.03).add(mine.mul(0.05))), max(edge.mul(float(0.35).add(mine.mul(0.5))), crest.mul(0.65))));
      });
      If(t.drain.greaterThan(0.01), () => {
        lineInk.assign(mix(lineInk, vec3(0.8, 0.84, 0.86), t.drain));
        lineShare.assign(max(lineShare, t.drain.mul(0.3)));
      });
      If(t.ghostLine.greaterThan(0.01), () => {
        lineInk.assign(mix(territory.colour(t.ghost), vec3(0.85, 0.88, 0.9), t.ghostPale));
        lineShare.assign(t.ghostLine.mul(0.8));
      });
      If(t.line.greaterThan(0.01), () => {
        const pulse = sin(P.time.mul(5).sub(dot(q, vec2(0.35)))).mul(0.2).add(0.8);
        const tc = territory.colour(t.trail);
        colour.assign(mix(colour, tc, t.line));
        share.assign(max(share, t.line.mul(0.85)));
        glow.addAssign(tc.mul(pulse).mul(t.line).mul(0.6));
        lineInk.assign(mix(lineInk, tc.mul(pulse), t.line));
        lineShare.assign(max(lineShare, t.line.mul(0.85)));
      });
    });
    return { colour, share, glow, lineInk, lineShare };
  };
  const surf = (u: V3) => {
    const p = positionWorld;
    const t = P.time;
    // the land's seamless projection of the world, and noise drifting on it at three scales
    const q = p.xz.add(vec2(0.71, -0.53).mul(p.y)).toVar();
    const n1 = noiseAcross(q.mul(0.045).add(vec2(t.mul(0.011), t.mul(-0.007))), DL, 0.045).g.toVar();
    // the water straight down from here to whatever the eye sees through it: the ground, a rock, a hull. A line
    // that dips under the surface and finds nothing (the sky past the curve of the sea, ground not built yet) comes
    // out over the surface again, and the water there is deep
    const zHere = positionView.z;
    const zFloor = perspectiveDepthToViewZ(beneathDepth().x, cameraNear, cameraFar);
    const floorAt = cameraPosition.add(p.sub(cameraPosition).mul(zFloor.div(zHere)));
    const drop = length(p).sub(length(floorAt));
    const under = select(drop.lessThan(0), float(1e3), drop).toVar();
    const c = coast.at(u);
    const d = c.y.toVar();
    If(under.lessThan(1.2).or(coast.on.greaterThan(0).and(d.lessThan(REACH - 4))), () => {
      coastal.assign(1);
      const n2 = noiseAcross(q.mul(0.13).sub(vec2(t.mul(0.017), t.mul(0.009))), DL, 0.13).b;
      const n3 = noiseAcross(q.mul(0.47).add(vec2(t.mul(0.023), t.mul(0.004))), DL, 0.47).a;
      // the depth by the grid, the field off where it has not arrived
      const depth = select(coast.on.greaterThan(0), vLevel.sub(c.x), float(50));
      const out = select(coast.on.greaterThan(0), max(d, 0), float(REACH));
      // the swell's lines, every SURF_PERIOD seconds, closing up as the water shoals and bent by the noise so no two
      // run alike; each a sharp front on its shoreward side and a tail behind
      const phase = sqrt(out.add(1)).mul(SHOAL).add(t.div(SURF_PERIOD)).add(n1.mul(1.4));
      const g = fract(phase);
      // a line thinner than a pixel is drawn as its average over the lines, so far off they do not break into dashes
      const line = mix(max(pow(float(1).sub(g), 7), smoothstep(0.955, 1, g)), float(0.15), smoothstep(0.08, 0.4, fwidth(phase)));
      // they break where the water is shallow, most in the last few metres, and break up along their length
      const shoal = smoothstep(2.8, 0.45, depth).mul(smoothstep(REACH - 4, 10, out));
      const broken = line.mul(shoal).mul(smoothstep(0.32, 0.62, n2.add(float(1).sub(g).mul(0.3))));
      // the water's edge, running up and back with each line's arrival
      const surge = sin(t.mul((2 * Math.PI) / SURF_PERIOD).add(n1.mul(6))).mul(0.5).add(0.5);
      const contact = smoothstep(mix(float(0.22), float(0.85), surge), 0.02, under);
      // and what the broken lines leave on the water as they spread out
      const left = smoothstep(16, 1.5, out).mul(smoothstep(0.35, 0.8, n1)).mul(0.5).mul(smoothstep(4, 1, depth));
      const density = clamp(broken.mul(0.95).add(contact).add(left), 0, 1);
      // foam is bubbles: a lace that thins as it spreads, eroded out of the noise; far off, only how much there is
      const lace = smoothstep(float(1).sub(density), float(1.14).sub(density), n3.mul(0.55).add(n2.mul(0.45)));
      const far = smoothstep(120, 420, length(p.sub(cameraPosition)));
      shore.assign(mix(lace.mul(density.sqrt()), density.mul(0.55), far));
      shoreGlow.assign(shore.mul(n1.add(0.6)));
    });
  };
  // the foam, and how much of the water it covers: the rest is the water itself
  const whiteness = clamp(foam.mul(1.4).add(smoothstep(0.35, -0.1, fold).mul(0.8)).add(shore).add(race).add(wakeFoam), 0, 1);
  mat.colorNode = Fn(() => {
    // every value the fragment's parts share is declared here, at the top: three (r187) takes a variable first met
    // inside a branch for that branch's own, and declares it again, at its starting value, where it is next read
    for (const v of [D0.x, D0.y, D1.x, D1.y, DL.x, DL.y, world, variance, foam, fold, race, wakeFoam, shore, shoreGlow, coastal, sunShade]) v.toStack();
    surface();
    return WATER.foam;
  })();
  mat.normalNode = cameraViewMatrix.mul(vec4(world, 0)).xyz.normalize();

  // roughness from the slopes' variance (Beckmann's α² = 2σ²), and rough where foam lies
  const sigma2 = variance.mul(0.5).add(WATER.ripples).add(P.rain.mul(0.004));
  const alpha = clamp(sigma2.mul(2).sqrt(), 0.02, 1);
  mat.roughnessNode = mix(alpha.sqrt(), float(0.9), whiteness);

  // the sun's shadow on the water, read once for its glitter and its body (SeaLight, the lighting works it out first),
  // and only where something can throw one that shows: near the eye (the ships', the gulls') and on the coast (the
  // cliffs'); the open sea further out lies in the sun
  const sunShade = float(1).toVar('oceanSunShade');
  const shade = () => {
    If(coastal.greaterThan(0).or(length(positionWorld.sub(cameraPosition)).lessThan(SHADOWED_WITHIN)), () => {
      sunShade.assign(sunShadow());
    });
    return sunShade;
  };
  mat.setupLightingModel = () => new SeaLight(
    shade,
    [mat.useClearcoat, mat.useSheen, mat.useIridescence, mat.useAnisotropy, mat.useTransmission, mat.useDispersion],
  );

  // ----- under the surface
  mat.backdropNode = Fn(() => {
    const p = positionWorld;
    const u = normalize(vUp);
    const v = normalize(cameraPosition.sub(p));
    const nv = max(dot(world, v), 0);
    // the haze between the eye and the water (from the vertices): the floor seen through the water takes it as
    // everything solid does, and the sea's whole light takes it again (outputNode)
    airLoss.assign(vAirLoss);
    airLight.assign(vAirLight);
    const fresnel = float(0.02).add(pow(float(1).sub(nv), 5).mul(0.98));
    // what reaches into the water from above: the sky, and the sun and moon by their height (each while it lights
    // anything in view), the sun's taken away where something stands between it and the water
    const sun = vec3(0).toVar(), down = vec3(vSkyDown).toVar();
    If(BODIES.sun.greaterThan(0.5), () => {
      sun.assign(sunlight.mul(sunShade));
      down.addAssign(sun.mul(max(dot(u, P.sunDir), 0)));
    });
    If(BODIES.moon.greaterThan(0.5), () => {
      down.addAssign(moonlight.mul(max(dot(u, P.moonDir), 0)));
    });
    // this region's water: its own colour, and how far the eye sees into it
    const water = { deep: vDeep, extinction: vExtinction };
    const body = down.mul(water.deep).div(Math.PI);
    // the floor through the surface, bent by its slope, and the path through the water to it
    const nViewXY = cameraViewMatrix.mul(vec4(world.sub(u), 0)).xy;
    const zHere = positionView.z;
    const bend = nViewXY.mul(0.12).div(max(zHere.negate().mul(0.05), 1));
    const behind = (uv: V2) => perspectiveDepthToViewZ(beneathDepth(uv).x, cameraNear, cameraFar);
    const bent = screenUV.add(bend);
    const uv = select(behind(bent).lessThan(zHere), bent, screenUV);
    const depthZ = max(zHere.sub(behind(uv)), 0);
    const path = depthZ.mul(length(positionView)).div(max(abs(zHere), 1e-3));
    const T = exp(water.extinction.mul(path).negate());
    const floor = beneathColour(uv).rgb.mul(airLoss).add(airLight);
    // the sun through a crest standing between it and the eye (after Atlas's water, GDC 2019)
    const toward = pow(clamp(dot(v, P.sunDir.negate()), 0, 1), 4);
    const thin = pow(clamp(float(0.5).sub(dot(P.sunDir, world).mul(0.5)), 0, 1), 3);
    const crest = clamp(vRise.mul(1.6).add(0.25), 0, 2);
    const through = sun.mul(WATER.crest).mul(toward.mul(thin).mul(crest).mul(0.09));
    // looking down into the water a little more of its own light comes back
    const sss = body.mul(mix(float(0.6), float(1.2), nv));
    return floor.mul(T).add(sss.add(through).mul(float(1).sub(T))).mul(float(1).sub(fresnel));
  })();
  mat.backdropAlphaNode = float(1).sub(whiteness);
  // the ink goes on last, over all the water's light: the dye turns its hue and keeps its brightness, so the waves and
  // the depth still read, and leaves the sun's glitter and the foam white; the lines lie on the water, lit as paper is;
  // and the ink's glow at night (actors' scale)
  mat.outputNode = Fn(() => {
    const u = normalize(vUp);
    const inked = ink(u);
    const lit = output.rgb.toVar();
    const bright = dot(lit, LUMA).toVar();
    const hue = inked.colour.div(max(dot(inked.colour, LUMA), 1e-3));
    const held = float(1).sub(smoothstep(0.5, 1.8, bright)).mul(float(1).sub(whiteness));
    const dyed = mix(lit, hue.mul(bright).mul(DYE), inked.share.mul(held));
    const light = vSkyDown.add(sunlight.mul(BODIES.sun).mul(max(dot(u, P.sunDir), 0))).add(moonlight.mul(BODIES.moon).mul(max(dot(u, P.moonDir), 0)));
    const ruled = mix(dyed, inked.lineInk.mul(light).div(Math.PI).mul(0.8), inked.lineShare.mul(float(1).sub(whiteness)));
    const filmed = slicks.over(ruled, u, vSkyDown, noise);
    return vec4(filmed.add(inked.glow.mul(P.night).mul(LAMP.mul(2.5))).mul(airLoss).add(airLight), output.a);
  })();
  // the surf's glow at night, the sea's own light (actors' scale)
  mat.emissiveNode = vec3(0.1, 0.75, 1.0).mul(shoreGlow.mul(P.night).mul(0.35)).mul(LAMP.mul(2.5));

  const mesh = new Mesh(polarGrid(), mat);
  mesh.frustumCulled = false;
  mesh.name = 'sea';
  return mesh;
}

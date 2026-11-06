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
// variance as roughness), and under it the light that went into the water, the sea floor seen through the
// refracting surface and dimmed by Beer–Lambert over the path through the water, the water's own colour where the
// path is long, light through the thin crests where the sun is behind them, and the foam on top.
//
// Where the sea meets the land it surfs, as Sea of Thieves' shore does (Ang et al., SIGGRAPH 2018), from the
// coastline's signed distance field (coast.ts): the swell's lines come in over the shallows, closing up as the water
// shoals and breaking where it is shallow, and foam clings where the water runs out against whatever stands in it,
// found from the depth under the surface. At night the surf glows.
import { BufferGeometry, Float32BufferAttribute, Mesh, MeshPhysicalNodeMaterial, Vector2, Vector3, type Node, type Texture } from 'three/webgpu';
import {
  Fn, If, abs, atan, cameraFar, floor, fract, cameraNear, cameraPosition, cameraViewMatrix, clamp, cos, dot, exp, float, length, log2, max,
  min, mix, normalize, perspectiveDepthToViewZ, pow, positionGeometry, positionView, positionWorld, screenUV, select, sin,
  smoothstep, sqrt, step, texture, uniform, fwidth, int, varyingProperty, vec2, vec3, vec4, viewportDepthTexture, viewportSharedTexture,
} from 'three/tsl';
import { R } from '../../sim/sphere.ts';
import { CASCADES, N, SIZES } from './spectrum.ts';
import { LAYER, type Waves } from './waves.ts';
import { skyLight, sunlight, moonlight } from '../atmosphere/light.ts';
import { sunShadow } from '../atmosphere/shadows.ts';
import { LAMP, P } from '../gpu/uniforms.ts';
import { seaLevelNode } from '../lift.ts';
import type { Coast } from './coast.ts';
import type { Territory } from './territory.ts';
import { REACH } from './coastField.ts';
import { waterAt } from '../seaTint.ts';

/** The surf: seconds between the lines of swell coming in, and how fast the lines close up toward the shore (the
 *  phase grows as √distance, so a line's spacing is 2√(d + 1) / SHOAL metres: two at the water's edge, ten 24 m out). */
const SURF_PERIOD = 7, SHOAL = 1;

type F = Node<'float'>;
type V2 = Node<'vec2'>;
type V3 = Node<'vec3'>;

// ---------------------------------------------------------------- the grid

/** The grid's rings: 0.3 m apart under the eye, each 2.2% further than the last, out to the far side. */
const FIRST = 0.3;
const GROWTH = 1.022;
const SPOKES = 512;

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
export const FRAME = {
  nadir: uniform(new Vector3(0, 1, 0)),
  gridE1: uniform(new Vector3(1, 0, 0)),
  gridE2: uniform(new Vector3(0, 0, -1)),
  anchor0: uniform(new Vector3(0, 1, 0)),
  axis0: uniform(new Vector3(1, 0, 0)),
  anchor1: uniform(new Vector3(0, 1, 0)),
  axis1: uniform(new Vector3(1, 0, 0)),
  /** cos and sin of the crossfade's angle: (1, 0) with one frame. */
  weight: uniform(new Vector2(1, 0)),
};

/** The water's light (its colour and clarity are each region's: seaTint.ts waterAt). */
export const WATER = {
  /** The colour light takes through a thin crest. */
  crest: uniform(new Vector3(0.1, 0.55, 0.42)),
  foam: uniform(new Vector3(0.82, 0.86, 0.88)),
  /** The slope variance finer than the smallest cascade: the capillary ripples, raised by rain. */
  ripples: uniform(0.0012),
};

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

export function oceanSurface(waves: Waves, coast: Coast, noise: Texture, territory: Territory): Mesh {
  const mat = new MeshPhysicalNodeMaterial({ metalness: 0, ior: 1.333, specularIntensity: 1 });
  mat.fog = true;
  // the surface is what the light under it passes through, not something beneath it
  mat.userData.seaSurface = true;

  // ----- vertex: the grid on the sphere, moved by the waves
  const along = positionGeometry.x, bearing = positionGeometry.z;
  const th = along.div(R);
  const out = FRAME.gridE1.mul(cos(bearing)).add(FRAME.gridE2.mul(sin(bearing)));
  const up = FRAME.nadir.mul(cos(th)).add(out.mul(sin(th))).normalize();
  // the grid's spacing here, and the mip of each cascade that holds no wave shorter than four spacings
  const field = texture(waves.field);
  const sample = (uv: V2, layer: number) => field.sample(uv).depth(int(layer));
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
  const vRise = varyingProperty('float', 'vOceanRise');
  const vUp = varyingProperty('vec3', 'vOceanUp');
  const vLevel = varyingProperty('float', 'vOceanLevel');
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
    vq.assign(q);
    vRise.assign(rise);
    vUp.assign(up);
    // on the sea's level: the tide's, raised or drawn down where the regions' events move the water
    const level = seaLevelNode(up).toVar();
    vLevel.assign(level.sub(R));
    return up.mul(level).add(lift);
  })();

  // ----- fragment: the surface's slope, its unresolved roughness and its foam, worked out once at the top of the
  // fragment (the colour is the first thing three builds there) and read by the normal, roughness and backdrop
  const world = vec3(0).toVar('oceanNormal');
  const variance = float(0).toVar('oceanVariance');
  const foam = float(0).toVar('oceanFoam');
  const fold = float(1).toVar('oceanFold');
  const surface = () => {
    const u = normalize(vUp);
    const shade = (q: V2, f: Frame, w: F) => {
      const { e1, e2 } = inFrame(u, f);
      const s = vec4(0).toVar();
      const dxz = float(0).toVar(), v = float(0).toVar(), white = float(0).toVar();
      for (let c = 0; c < CASCADES; c++) {
        const uv = q.div(SIZES[c]);
        const sl = sample(uv, LAYER.slope + c);
        const mo = sample(uv, LAYER.moments + c);
        s.addAssign(sl);
        dxz.addAssign(mo.w);
        v.addAssign(max(mo.x.sub(sl.x.mul(sl.x)), 0).add(max(mo.y.sub(sl.y.mul(sl.y)), 0)));
        white.addAssign(sample(uv, LAYER.displacement + c).w);
      }
      const sx = s.x.div(max(s.z.add(1), 0.2)), sz = s.y.div(max(s.w.add(1), 0.2));
      world.addAssign(e1.mul(sx).add(e2.mul(sz)).mul(w));
      variance.addAssign(v.mul(w.mul(w)));
      foam.addAssign(white.mul(w.mul(w)));
      fold.assign(min(fold, s.z.add(1).mul(s.w.add(1)).sub(dxz.mul(dxz))));
    };
    shade(vq.xy, FRAMES[0], FRAME.weight.x);
    If(FRAME.weight.y.greaterThan(0), () => {
      shade(vq.zw, FRAMES[1], FRAME.weight.y);
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
    ink(u);
  };

  // ----- the surf
  const shore = float(0).toVar('oceanShore');
  const shoreGlow = float(0).toVar('oceanShoreGlow');
  // ----- the captains' ink: their colour laid on the water they hold, deepest on its coast, and the trail each is
  // laying, pulsing along its length and glowing at night. The ink is a dye in the water rather than a paint on it:
  // its reflectance is near the sea's own, so the held water is the sea tinted, and the pen line round it darker.
  const inkColour = vec3(0).toVar('oceanInk');
  const inkShare = float(0).toVar('oceanInkShare');
  const inkGlow = vec3(0).toVar('oceanInkGlow');
  const ink = (u: V3) => {
    If(territory.on.greaterThan(0.5), () => {
      const p = positionWorld;
      const q = p.xz.add(vec2(0.71, -0.53).mul(p.y));
      const t = territory.at(u, noiseMap.sample(q.mul(0.045)).rg.sub(0.5));
      If(t.owner.greaterThan(0.5), () => {
        const mine = float(1).sub(step(0.5, abs(t.owner.sub(territory.me))));
        inkColour.assign(territory.colour(t.owner).mul(0.16));
        inkShare.assign(float(0.32).add(mine.mul(0.08)).add(t.edge.mul(0.4)));
      });
      If(t.trail.greaterThan(0.5), () => {
        const pulse = sin(P.time.mul(5).sub(dot(q, vec2(0.35)))).mul(0.25).add(0.75);
        const tc = territory.colour(t.trail);
        inkColour.assign(mix(inkColour, tc.mul(pulse).mul(0.3), float(0.6).div(max(inkShare.add(0.6), 0.6))));
        inkShare.assign(inkShare.add(float(0.6).mul(float(1).sub(inkShare))));
        inkGlow.assign(tc.mul(pulse).mul(0.6));
      });
    });
  };
  const noiseMap = texture(noise);
  const surf = (u: V3) => {
    const p = positionWorld;
    const t = P.time;
    // the land's seamless projection of the world, and noise drifting on it at three scales
    const q = p.xz.add(vec2(0.71, -0.53).mul(p.y)).toVar();
    const n1 = noiseMap.sample(q.mul(0.045).add(vec2(t.mul(0.011), t.mul(-0.007)))).g.toVar();
    // the water straight down from here to whatever the eye sees through it: the ground, a rock, a hull. A line
    // that dips under the surface and finds nothing (the sky past the curve of the sea, ground not built yet) comes
    // out over the surface again, and the water there is deep
    const zHere = positionView.z;
    const zFloor = perspectiveDepthToViewZ(viewportDepthTexture(screenUV).x, cameraNear, cameraFar);
    const floorAt = cameraPosition.add(p.sub(cameraPosition).mul(zFloor.div(zHere)));
    const drop = length(p).sub(length(floorAt));
    const under = select(drop.lessThan(0), float(1e3), drop).toVar();
    const c = coast.at(u);
    const d = c.y.toVar();
    If(under.lessThan(1.2).or(coast.on.greaterThan(0).and(d.lessThan(REACH - 4))), () => {
      const n2 = noiseMap.sample(q.mul(0.13).sub(vec2(t.mul(0.017), t.mul(0.009)))).b;
      const n3 = noiseMap.sample(q.mul(0.47).add(vec2(t.mul(0.023), t.mul(0.004)))).a;
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
  // the foam, over the ink, and how much of the water the two cover between them: the rest is the water itself
  const whiteness = clamp(foam.mul(1.4).add(smoothstep(0.35, -0.1, fold).mul(0.8)).add(shore), 0, 1);
  const covered = whiteness.add(inkShare.mul(float(1).sub(whiteness)));
  mat.colorNode = Fn(() => {
    surface();
    return mix(inkColour, WATER.foam, whiteness.div(max(covered, 1e-4)));
  })();
  mat.normalNode = cameraViewMatrix.mul(vec4(world, 0)).xyz.normalize();

  // roughness from the slopes' variance (Beckmann's α² = 2σ²), and rough where foam lies
  const sigma2 = variance.mul(0.5).add(WATER.ripples).add(P.rain.mul(0.004));
  const alpha = clamp(sigma2.mul(2).sqrt(), 0.02, 1);
  mat.roughnessNode = mix(alpha.sqrt(), float(0.9), whiteness);

  // ----- under the surface
  mat.backdropNode = Fn(() => {
    const p = positionWorld;
    const u = normalize(vUp);
    const v = normalize(cameraPosition.sub(p));
    const nv = max(dot(world, v), 0);
    const fresnel = float(0.02).add(pow(float(1).sub(nv), 5).mul(0.98));
    // what reaches into the water from above: the sky, and the sun and moon by their height, the sun's taken away
    // where something stands between it and the water
    const sun = sunlight.mul(sunShadow()).toVar();
    const down = skyLight(p, u)
      .add(sun.mul(max(dot(u, P.sunDir), 0)))
      .add(moonlight.mul(max(dot(u, P.moonDir), 0)));
    // this region's water: its own colour, and how far the eye sees into it
    const water = waterAt(u);
    const body = down.mul(water.deep).div(Math.PI);
    // the floor through the surface, bent by its slope, and the path through the water to it
    const nViewXY = cameraViewMatrix.mul(vec4(world.sub(u), 0)).xy;
    const zHere = positionView.z;
    const bend = nViewXY.mul(0.12).div(max(zHere.negate().mul(0.05), 1));
    const behind = (uv: V2) => perspectiveDepthToViewZ(viewportDepthTexture(uv).x, cameraNear, cameraFar);
    const bent = screenUV.add(bend);
    const uv = select(behind(bent).lessThan(zHere), bent, screenUV);
    const depthZ = max(zHere.sub(behind(uv)), 0);
    const path = depthZ.mul(length(positionView)).div(max(abs(zHere), 1e-3));
    const T = exp(water.extinction.mul(path).negate());
    const floor = viewportSharedTexture(uv).rgb;
    // the sun through a crest standing between it and the eye (after Atlas's water, GDC 2019)
    const toward = pow(clamp(dot(v, P.sunDir.negate()), 0, 1), 4);
    const thin = pow(clamp(float(0.5).sub(dot(P.sunDir, world).mul(0.5)), 0, 1), 3);
    const crest = clamp(vRise.mul(1.6).add(0.25), 0, 2);
    const through = sun.mul(WATER.crest).mul(toward.mul(thin).mul(crest).mul(0.09));
    // looking down into the water a little more of its own light comes back
    const sss = body.mul(mix(float(0.6), float(1.2), nv));
    return floor.mul(T).add(sss.add(through).mul(float(1).sub(T))).mul(float(1).sub(fresnel));
  })();
  mat.backdropAlphaNode = float(1).sub(covered);
  // the surf's glow at night, the sea's own light (actors' scale)
  mat.emissiveNode = vec3(0.1, 0.75, 1.0).mul(shoreGlow.mul(P.night).mul(0.35)).add(inkGlow.mul(P.night)).mul(LAMP.mul(2.5));

  const mesh = new Mesh(polarGrid(), mat);
  mesh.frustumCulled = false;
  mesh.receiveShadow = true;
  mesh.name = 'sea';
  return mesh;
}

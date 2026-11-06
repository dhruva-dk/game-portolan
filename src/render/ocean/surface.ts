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
import { BufferGeometry, Float32BufferAttribute, Mesh, MeshPhysicalNodeMaterial, Vector2, Vector3, type Node } from 'three/webgpu';
import {
  Fn, If, abs, atan, cameraFar, cameraNear, cameraPosition, cameraViewMatrix, clamp, cos, dot, exp, float, length, log2, max,
  min, mix, normalize, perspectiveDepthToViewZ, pow, positionGeometry, positionView, positionWorld, screenUV, select, sin,
  smoothstep, texture, uniform, int, varyingProperty, vec2, vec3, vec4, viewportDepthTexture, viewportSharedTexture,
} from 'three/tsl';
import { R } from '../../sim/sphere.ts';
import { CASCADES, N, SIZES } from './spectrum.ts';
import { LAYER, type Waves } from './waves.ts';
import { skyLight, sunlight, moonlight } from '../atmosphere/light.ts';
import { P } from '../gpu/uniforms.ts';

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

/** The water's colour and clarity where the eye is. */
export const WATER = {
  /** The deep water's own diffuse reflectance: the light that goes in and is scattered back out. */
  deep: P.seaDeep,
  /** Extinction per metre of path through the water. */
  extinction: uniform(new Vector3(0.42, 0.085, 0.055)),
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

// ---------------------------------------------------------------- the material

export function oceanSurface(waves: Waves): Mesh {
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
    return up.mul(R).add(lift);
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
    world.assign(normalize(u.sub(world)));
  };
  mat.colorNode = Fn(() => {
    surface();
    return WATER.foam;
  })();
  mat.normalNode = cameraViewMatrix.mul(vec4(world, 0)).xyz.normalize();

  // roughness from the slopes' variance (Beckmann's α² = 2σ²), and rough where foam lies
  const whiteness = clamp(foam.mul(1.4).add(smoothstep(0.35, -0.1, fold).mul(0.8)), 0, 1);
  const sigma2 = variance.mul(0.5).add(WATER.ripples);
  const alpha = clamp(sigma2.mul(2).sqrt(), 0.02, 1);
  mat.roughnessNode = mix(alpha.sqrt(), float(0.9), whiteness);

  // ----- under the surface
  mat.backdropNode = Fn(() => {
    const p = positionWorld;
    const u = normalize(vUp);
    const v = normalize(cameraPosition.sub(p));
    const nv = max(dot(world, v), 0);
    const fresnel = float(0.02).add(pow(float(1).sub(nv), 5).mul(0.98));
    // what reaches into the water from above: the sky, and the sun and moon by their height
    const down = skyLight(p, u)
      .add(sunlight.mul(max(dot(u, P.sunDir), 0)))
      .add(moonlight.mul(max(dot(u, P.moonDir), 0)));
    const body = down.mul(WATER.deep).div(Math.PI);
    // the floor through the surface, bent by its slope, and the path through the water to it
    const nViewXY = cameraViewMatrix.mul(vec4(world.sub(u), 0)).xy;
    const zHere = positionView.z;
    const bend = nViewXY.mul(0.12).div(max(zHere.negate().mul(0.05), 1));
    const behind = (uv: V2) => perspectiveDepthToViewZ(viewportDepthTexture(uv).x, cameraNear, cameraFar);
    const bent = screenUV.add(bend);
    const uv = select(behind(bent).lessThan(zHere), bent, screenUV);
    const depthZ = max(zHere.sub(behind(uv)), 0);
    const path = depthZ.mul(length(positionView)).div(max(abs(zHere), 1e-3));
    const T = exp(WATER.extinction.mul(path).negate());
    const floor = viewportSharedTexture(uv).rgb;
    // the sun through a crest standing between it and the eye (after Atlas's water, GDC 2019)
    const toward = pow(clamp(dot(v, P.sunDir.negate()), 0, 1), 4);
    const thin = pow(clamp(float(0.5).sub(dot(P.sunDir, world).mul(0.5)), 0, 1), 3);
    const crest = clamp(vRise.mul(1.6).add(0.25), 0, 2);
    const through = sunlight.mul(WATER.crest).mul(toward.mul(thin).mul(crest).mul(0.09));
    // looking down into the water a little more of its own light comes back
    const sss = body.mul(mix(float(0.6), float(1.2), nv));
    return floor.mul(T).add(sss.add(through).mul(float(1).sub(T))).mul(float(1).sub(fresnel));
  })();
  mat.backdropAlphaNode = float(1).sub(whiteness);

  const mesh = new Mesh(polarGrid(), mat);
  mesh.frustumCulled = false;
  mesh.receiveShadow = true;
  mesh.name = 'sea';
  return mesh;
}

// Cumulus, after Schneider ("The Real-Time Volumetric Cloudscapes of Horizon Zero Dawn", SIGGRAPH 2015) and
// Hillaire ("Physically Based Sky, Atmosphere and Cloud Rendering in Frostbite", SIGGRAPH 2016).
//
// A shell of cloud between BASE and TOP over the curved sea. Its shape: a weather map says where cloud may form,
// a Perlin-Worley volume gives the billows, a Worley volume erodes their edges. Its light: the sun through the
// cloud above each point (a short cone of taps toward the sun), scattered several times (Wrenninge's octaves), and
// the sky's ambient light, brighter toward the top.
//
// The cost is spread over frames. Each frame marches a quarter-resolution grid, each texel taking one of the 2×2
// half-resolution pixels it covers in turn; a resolve pass at half resolution keeps the rest from earlier frames,
// moved to where the camera now sees them (reprojected by the cloud's distance) and held to the new samples' range.
// After four frames every half-resolution pixel is fresh.
//
// The shell is the eye's, like the sky (view.toSky): Earth's curvature under it, its directions the sky's (x east, y
// up, z south, elevations stretched to put its horizon on the sea's). Its map slides under the eye as the eye moves
// over the planet. Units inside are kilometres, relative to the camera; Earth's centre is BOTTOM below the sea.

import {
  HalfFloatType, LinearFilter, Matrix4, NearestFilter, StorageTexture, Vector3, ClampToEdgeWrapping,
  type PerspectiveCamera, type WebGPURenderer,
} from 'three/webgpu';
import {
  Break, Fn, If, Loop, abs, clamp, dot, exp, float, fract, instanceIndex, int, ivec2, length, max, min, mix, normalize,
  pow, select, smoothstep, sqrt, texture, texture3D, textureLoad, textureStore, uniform, uvec2, vec2, vec3, vec4,
} from 'three/tsl';
import type { View } from '../view/view';
import { BOTTOM, MIE_EXTINCTION, RAYLEIGH_SCATTERING } from './atmosphere';
import { bakeCloudNoise, detailVolume, remap, shapeVolume, weatherMap } from './cloud-noise';
import { skyAmbientUp, skyRadiance, sunTransmittance } from './tables';

type N = any;

const loop = (name: string, count: number, body: (i: N) => void) =>
  (Loop as N)({ start: 0, end: count, type: 'int', condition: '<', name }, (v: N) => body(v[name]));

// ------------------------------------------------------------------ shape

/** The shell, km above the sea. */
const BASE = 1.5, TOP = 4.0;
/** Sizes of the patterns, km. */
const WEATHER_SCALE = 24, SHAPE_SCALE = 5, DETAIL_SCALE = 0.7;
/** Extinction of the densest cloud, per km. */
const SIGMA = 25;
/** The air's extinction between the eye and the clouds, per km: sea level's, a little thinner for the climb. */
const AIR_EXTINCTION = vec3(...RAYLEIGH_SCATTERING).add(MIE_EXTINCTION).mul(0.8);
/** Farthest distance marched, km; the clouds fade into the haze before it. */
const MAX_DISTANCE = 40;

// ------------------------------------------------------------------ per-frame inputs

const coverage = uniform(0.5);
/** How far the wind has carried the clouds, km. */
const drift = uniform(new Vector3());
/** Toward the sun, as the eye's sky shows it. */
const sunDir = uniform(new Vector3(0, 1, 0));
/** The eye: x and z where it is over the clouds' map, y its height above the sea; km. */
const eye = uniform(new Vector3());
/** Where it was over the map last frame. */
const previousEye = uniform(new Vector3());
const projectionInverse = uniform(new Matrix4());
const cameraWorld = uniform(new Matrix4());
const previousViewProjection = uniform(new Matrix4());
/** The eye's frame and its horizon's dip last frame, for finding where a cloud was seen then. */
const previousFrame = {
  east: uniform(new Vector3(1, 0, 0)), up: uniform(new Vector3(0, 1, 0)), south: uniform(new Vector3(0, 0, 1)), dip: uniform(0),
};
const frameIndex = uniform(0, 'uint');

/** Cloud density (0–1) at q, km relative to the eye. `fine` erodes the edges. */
function density(q: N, fine: boolean): N {
  const r0 = float(BOTTOM).add(eye.y);
  const altitude = length(vec3(q.x, q.y.add(r0), q.z)).sub(BOTTOM);
  const h = clamp(altitude.sub(BASE).div(TOP - BASE), 0, 1);
  const p = vec3(eye.x, 0, eye.z).add(q).add(drift);
  const weather = texture(weatherMap).sample(p.xz.div(WEATHER_SCALE)).level(float(0));
  const cover = clamp(remap(weather.r, float(1).sub(coverage), float(1), float(0), float(1)), 0, 1);
  // cumulus: a flat base, swelling, rounding off at a top set by the weather
  const top = mix(float(0.35), float(1), weather.g);
  const profile = smoothstep(0, 0.07, h).mul(smoothstep(top, top.mul(0.6), h));
  const n = texture3D(shapeVolume, p.div(SHAPE_SCALE)).level(float(0));
  const floorNoise = n.g.mul(0.625).add(n.b.mul(0.25)).add(n.a.mul(0.125));
  const billows = clamp(remap(n.r, floorNoise.sub(1), float(1), float(0), float(1)), 0, 1);
  let dense: N = clamp(remap(billows.mul(profile), float(1).sub(cover), float(1), float(0), float(1)), 0, 1).mul(cover);
  if (fine) {
    const d = texture3D(detailVolume, p.div(DETAIL_SCALE)).level(float(0));
    const df = d.r.mul(0.625).add(d.g.mul(0.25)).add(d.b.mul(0.125));
    // wispy toward the base, billowing higher up
    const erode = mix(df, float(1).sub(df), clamp(h.mul(5), 0, 1));
    dense = clamp(remap(dense, erode.mul(0.35), float(1), float(0), float(1)), 0, 1);
  }
  return dense;
}

/** Distance along unit d from the eye to the sphere of altitude a (km); the eye is below it. */
function toAltitude(d: N, a: number): N {
  const r0: N = float(BOTTOM).add(eye.y);
  const b: N = r0.mul(d.y);
  // c = r0² − r², written so it doesn't cancel
  const c = eye.y.sub(a).mul(r0.add(BOTTOM + a));
  const s: N = sqrt(max(b.mul(b).sub(c), 0));
  return (select as N)(b.greaterThan(0), c.negate().div(b.add(s)), b.negate().add(s));
}

const hg = (c: N, g: N): N => {
  const g2 = g.mul(g);
  return float(1 / (4 * Math.PI)).mul(float(1).sub(g2)).div(pow(float(1).add(g2).sub(g.mul(c).mul(2)), 1.5));
};

/**
 * Marches the shell along unit d from the eye. Returns the cloud's light (rgb, per unit sun) and the fraction of
 * what lies behind that survives (a), and through `distance` the transmittance-weighted distance of the cloud (km).
 */
function march(d: N, steps: number, jitter: N, distance: N): N {
  const L = vec3(0).toVar(), T = float(1).toVar();
  const near = toAltitude(d, BASE).toVar(), far = min(toAltitude(d, TOP), MAX_DISTANCE).toVar();
  const dt = max(far.sub(near), 0).div(steps).toVar();
  const cosSun = dot(d, sunDir);
  const weightSum = float(0).toVar(), distSum = float(0).toVar();
  // the sea hides the shell below the horizon
  If(d.y.greaterThan(-0.002).and(near.lessThan(MAX_DISTANCE)), () => {
    loop('cs', steps, (i) => {
      const t = near.add(float(i).add(jitter).mul(dt));
      const q = d.mul(t);
      const coarse = density(q, false);
      If(coarse.greaterThan(0.001), () => {
        const rho = density(q, true);
        If(rho.greaterThan(0.001), () => {
          // optical depth toward the sun through four taps, spaced wider as they go
          let tau: N = float(0);
          const taps = [0.06, 0.18, 0.42, 0.9];
          let prev = 0;
          for (const s of taps) {
            tau = tau.add(density(q.add(sunDir.mul(s)), false).mul(SIGMA * (s - prev)));
            prev = s;
          }
          // Wrenninge's octaves of multiple scattering: each weaker (a), reaching deeper (b = a, so energy is
          // conserved) and less forward (c = a) than the last
          let sun: N = float(0);
          for (let k = 0; k < 4; k++) {
            const a = 0.7 ** k;
            const phase = mix(hg(cosSun, float(0.8 * a)), hg(cosSun, float(-0.3 * a)), 0.3);
            sun = sun.add(exp(tau.mul(-a)).mul(phase).mul(a));
          }
          const powder = float(1).sub(exp(rho.mul(-SIGMA * 0.06)).mul(0.6));
          const altitude = length(vec3(q.x, q.y.add(eye.y).add(BOTTOM), q.z));
          const h = clamp(altitude.sub(BOTTOM + BASE).div(TOP - BASE), 0, 1);
          const sunLight = sunTransmittance(altitude, dot(normalize(vec3(q.x, q.y.add(eye.y).add(BOTTOM), q.z)), sunDir));
          const S = sunLight.mul(sun).mul(powder).add(skyAmbientUp.mul(mix(0.35, 1, h)));
          const stepT = exp(rho.mul(-SIGMA).mul(dt));
          const absorbed = T.mul(float(1).sub(stepT));
          L.addAssign(S.mul(absorbed));
          distSum.addAssign(t.mul(absorbed));
          weightSum.addAssign(absorbed);
          T.mulAssign(stepT);
          If(T.lessThan(0.01), () => { Break(); });
        });
      });
    });
  });
  distance.assign(select(weightSum.greaterThan(1e-4), distSum.div(max(weightSum, 1e-4)), float(MAX_DISTANCE)));
  // the air between the eye and the cloud: what the cloud hides of the far sky is replaced by the air's own glow
  const Tair = exp(AIR_EXTINCTION.mul(distance).negate());
  const glow = skyRadiance(normalize(vec3(d.x, max(d.y, 0), d.z)), sunDir);
  const seen = L.mul(Tair).add(glow.mul(float(1).sub(T)).mul(float(1).sub(Tair)));
  // toward the march's reach the clouds melt into the haze
  const fade = smoothstep(MAX_DISTANCE, MAX_DISTANCE * 0.6, distance);
  return vec4(seen.mul(fade), mix(float(1), T, fade));
}

/** The clouds along unit direction d from the eye, with a coarser march: light (rgb) and transmittance (a). */
export const cloudsAlong = (d: N, steps: number): N => march(d, steps, float(0.5), float(0).toVar());

// ------------------------------------------------------------------ the frame's targets and passes

function target(w: number, h: number, filter: typeof LinearFilter | typeof NearestFilter = LinearFilter): StorageTexture {
  const t = new StorageTexture(w, h);
  t.type = HalfFloatType;
  t.minFilter = t.magFilter = filter;
  t.wrapS = t.wrapT = ClampToEdgeWrapping;
  t.generateMipmaps = false;
  return t;
}

/** How much of a fresh sample goes into the history. */
const BLEND = 0.25;

/** The 2×2 cell each frame takes, in an order that spreads them. */
const LATTICE = [[0, 0], [1, 1], [1, 0], [0, 1]];

/** Interleaved gradient noise (Jimenez 2014), for the march's start. */
const ign = (p: N): N => fract(float(52.9829189).mul(fract(dot(p, vec2(0.06711056, 0.00583715)))));

function createPasses(width: number, height: number, view: View) {
  /** The sky's direction through the screen at uv. */
  const rayAt = (uv: N): N => {
    const ndc = vec4(uv.x.mul(2).sub(1), float(1).sub(uv.y.mul(2)), 1, 1);
    const camera = projectionInverse.mul(ndc);
    return view.toSky(cameraWorld.mul(vec4(camera.xyz.div(camera.w), 0)).xyz);
  };

  const HW = Math.max(1, Math.ceil(width / 2)), HH = Math.max(1, Math.ceil(height / 2));
  const MW = Math.ceil(HW / 2), MH = Math.ceil(HH / 2);
  const marched = target(MW, MH, NearestFilter);
  const marchedDistance = target(MW, MH, NearestFilter);
  const history = [target(HW, HH), target(HW, HH)];
  const historyDistance = [target(HW, HH, NearestFilter), target(HW, HH, NearestFilter)];
  const cell = uniform(new Vector3());

  const marchKernel = Fn(() => {
    const x = instanceIndex.mod(MW), y = instanceIndex.div(MW);
    const px = vec2(x, y).mul(2).add(cell.xy);
    const d = rayAt(px.add(0.5).div(vec2(HW, HH)));
    const distance = float(0).toVar();
    const result = march(d, 64, fract(ign(px).add(float(frameIndex).mul(0.618034))), distance);
    textureStore(marched, uvec2(x, y), result);
    textureStore(marchedDistance, uvec2(x, y), vec4(distance, 0, 0, 1));
  })().compute(MW * MH, [64]);

  // two resolves, one per direction of the history ping-pong
  const resolveKernels = [0, 1].map((write) => {
    const read = 1 - write;
    return Fn(() => {
      const x = instanceIndex.mod(HW), y = instanceIndex.div(HW);
      const m = ivec2(int(x).div(2), int(y).div(2));
      const fresh = int(x).mod(2).equal(int(cell.x)).and(int(y).mod(2).equal(int(cell.y)));
      const current = textureLoad(marched, m).toVar();
      const out = current.toVar();
      const outDistance = textureLoad(marchedDistance, m).x.toVar();
      // where this pixel's cloud was last frame, found by its distance now: seen from where the eye was over the
      // map then, and turned from that frame's sky back into the world, where last frame's camera saw it
      const uv = vec2(x, y).add(0.5).div(vec2(HW, HH));
      const then = rayAt(uv).mul(outDistance).add(eye).sub(previousEye);
      const clip = previousViewProjection.mul(vec4(view.fromSky(normalize(then), previousFrame), 0));
      const prev = vec2(clip.x.div(clip.w).mul(0.5).add(0.5), float(0.5).sub(clip.y.div(clip.w).mul(0.5)));
      const onScreen = prev.x.greaterThanEqual(0).and(prev.x.lessThanEqual(1))
        .and(prev.y.greaterThanEqual(0)).and(prev.y.lessThanEqual(1)).and(clip.w.greaterThan(0));
      If(onScreen, () => {
        const old = texture(history[read]).sample(prev).level(float(0));
        // the history is held to the range of this frame's samples round it (a little widened, since the samples
        // themselves are noisy), which rejects cloud that has moved or changed without pulling settled cloud about
        const lo = vec4(1e4).toVar(), hi = vec4(-1e4).toVar();
        for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
          const s = textureLoad(marched, (clamp as N)(m.add(ivec2(i, j)), ivec2(0, 0), ivec2(MW - 1, MH - 1)));
          lo.assign(min(lo, s));
          hi.assign(max(hi, s));
        }
        const margin = hi.sub(lo).mul(0.1);
        const held = clamp(old, lo.sub(margin), hi.add(margin));
        // a fresh sample is blended in, so its noise averages away over visits; the others keep the history
        out.assign(select(fresh, mix(held, current, BLEND), held));
      });
      textureStore(history[write], uvec2(x, y), out);
      textureStore(historyDistance[write], uvec2(x, y), vec4(outDistance, 0, 0, 1));
    })().compute(HW * HH, [64]);
  });

  return { marched, history, historyDistance, cell, marchKernel, resolveKernels };
}

// ------------------------------------------------------------------ cloud shadows

/** The shadow map covers this many km round the eye. */
const SHADOW_EXTENT = 8;
const SHADOW_N = 256;
const shadowMap = new StorageTexture(SHADOW_N, SHADOW_N);
shadowMap.type = HalfFloatType;
shadowMap.wrapS = shadowMap.wrapT = ClampToEdgeWrapping;
shadowMap.generateMipmaps = false;
/** Where the shadow map was centred when last drawn, km. */
const shadowCentre = uniform(new Vector3());

const shadowKernel = Fn(() => {
  const x = instanceIndex.mod(SHADOW_N), y = instanceIndex.div(SHADOW_N);
  const ground = vec2(x, y).add(0.5).div(SHADOW_N).sub(0.5).mul(SHADOW_EXTENT);
  // from the sea point up toward the sun, through the shell; positions relative to the eye
  const sea = vec3(ground.x.add(shadowCentre.x).sub(eye.x), eye.y.negate(), ground.y.add(shadowCentre.z).sub(eye.z));
  const up = max(sunDir.y, 0.05);
  const t0 = float(BASE).div(up), t1 = float(TOP).div(up);
  const STEPS = 12;
  const dt = t1.sub(t0).div(STEPS);
  const tau = float(0).toVar();
  loop('ss', STEPS, (i) => {
    // the eroded shape, as the eye sees it: the uneroded one is far fatter, and its shadow covers the sea
    tau.addAssign(density(sea.add(sunDir.mul(t0.add(float(i).add(0.5).mul(dt)))), true).mul(SIGMA).mul(dt));
  });
  // a soft floor: thick cloud still lets some light round it
  textureStore(shadowMap, uvec2(x, y), vec4(mix(0.15, 1, exp(tau.negate())), 0, 0, 1));
})().compute(SHADOW_N * SHADOW_N, [64]);

/** Fraction of the sun's light the clouds let through to world position p (metres), read where p lies on the eye's chart. */
const cloudShadow = (view: View) => (p: N): N => {
  const uv = view.local(p).mul(0.001).add(eye.xz).sub(shadowCentre.xz).div(SHADOW_EXTENT).add(0.5);
  const edge = smoothstep(0.5, 0.4, max(abs(uv.x.sub(0.5)), abs(uv.y.sub(0.5))));
  return mix(float(1), texture(shadowMap).sample(uv).level(float(0)).r, edge);
};

// ------------------------------------------------------------------ the system

export interface CloudInputs {
  coverage: number;
  /** m/s, east (x) and south (y). */
  wind: { x: number; y: number };
  /** Toward the sun, as the eye's sky shows it (view.toSky). */
  sunDirection: Vector3;
}

export function createClouds(renderer: WebGPURenderer, view: View) {
  bakeCloudNoise(renderer);

  let passes = createPasses(1, 1, view);
  let size = [0, 0];
  let frame = 0;
  let last: readonly number[] | null = null;
  const viewProjection = new Matrix4();
  const historyTexture = texture(passes.history[0]);
  const historyDistanceTexture = texture(passes.historyDistance[0]);

  return {
    /** The clouds' light (rgb) and what survives behind them (a), at half resolution, for the composite. */
    color: historyTexture,
    /** Distance to the clouds, km. */
    distance: historyDistanceTexture,
    shadow: cloudShadow(view),

    update(inputs: CloudInputs, camera: PerspectiveCamera, dt: number, width: number, height: number) {
      if (width !== size[0] || height !== size[1]) {
        size = [width, height];
        passes = createPasses(width, height, view);
        frame = 0;
      }
      coverage.value = inputs.coverage;
      drift.value.x += (inputs.wind.x * dt) / 1000;
      drift.value.z += (inputs.wind.y * dt) / 1000;
      drift.value.y += dt * 0.002; // the billows slowly turn over
      sunDir.value.copy(inputs.sunDirection);
      // the eye slides over the map as it moves over the planet, by its step along its own east and south
      const { position, frame: f, height: h } = view.eye;
      previousEye.value.copy(eye.value);
      if (last) {
        const step = [position[0] - last[0], position[1] - last[1], position[2] - last[2]];
        eye.value.x += (step[0] * f.east[0] + step[1] * f.east[1] + step[2] * f.east[2]) / 1000;
        eye.value.z -= (step[0] * f.north[0] + step[1] * f.north[1] + step[2] * f.north[2]) / 1000;
      }
      eye.value.y = h / 1000;
      if (!last) previousEye.value.copy(eye.value);
      last = position;
      projectionInverse.value.copy(camera.projectionMatrixInverse);
      cameraWorld.value.copy(camera.matrixWorld);
      frameIndex.value = frame;

      const [cx, cy] = LATTICE[frame % 4];
      passes.cell.value.set(cx, cy, 0);
      renderer.compute(passes.marchKernel);
      const write = frame % 2;
      renderer.compute(passes.resolveKernels[write]);
      historyTexture.value = passes.history[write];
      historyDistanceTexture.value = passes.historyDistance[write];

      if (frame % 4 === 0) {
        shadowCentre.value.set(Math.round(eye.value.x), 0, Math.round(eye.value.z));
        renderer.compute(shadowKernel);
      }

      previousViewProjection.value.copy(viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
      previousFrame.east.value.set(...f.east);
      previousFrame.up.value.set(...f.up);
      previousFrame.south.value.set(-f.north[0], -f.north[1], -f.north[2]);
      previousFrame.dip.value = view.eye.dip;
      frame++;
    },
  };
}

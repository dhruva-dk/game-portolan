// Cumulus, after Schneider ("The Real-Time Volumetric Cloudscapes of Horizon Zero Dawn", SIGGRAPH 2015; "Nubis",
// 2017) and Hillaire ("Physically Based Sky, Atmosphere and Cloud Rendering in Frostbite", SIGGRAPH 2016): what the
// cloud is at a point, and what the eye sees along a ray through it. clouds.ts spreads the rays over frames.
//
// Shape. A shell of cloud between BASE and TOP over the curved sea. A weather map (cloud-noise.ts) holds cumulus
// cells of three sizes, gathered into fields with clear sky between; the cover (0–1) sets how much of it may hold
// cloud, and past broken cover merges the cells into a layer. Where a cell is strong the cloud stands a few hundred
// metres, where weak it stays a low puff; bases are flat, thinning over their lowest metres. A Perlin-Worley
// volume gives the billows, a Worley volume erodes their edges: wisps toward the base, cauliflower higher up.
//
// Light. Per unit sun at the top of the air: the sun through the cloud toward it (a short cone of taps), scattered
// once with a two-lobed phase (the silver lining toward the sun) and many times — Wrenninge's octaves near the
// surface, and deep inside the diffused light of a two-stream slab, which falls off only as 1/(1 + ¾(1−g)τ) and so
// leaves bases grey rather than dark blue; the sky's light from above and the sea's from below, each through the
// cloud between. Then the air between the eye and the cloud: its extinction integrated in closed form up to the
// cloud's height, and its glow, so far clouds sink into the haze.
//
// The shell is the eye's, like the sky (view.toSky): Earth's curvature under it, its directions the sky's (x east, y
// up, z south, elevations stretched to put its horizon on the sea's). Its map slides under the eye as the eye moves
// over the planet. Units are kilometres, relative to the eye; Earth's centre is BOTTOM below the sea.

import { Vector3 } from 'three/webgpu';
import {
  Break, If, Loop, ceil, clamp, dot, exp, float, int, length, max, min, mix, normalize, pow, select, smoothstep, sqrt,
  texture, texture3D, uniform, vec3, vec4,
} from 'three/tsl';
import {
  BOTTOM, MIE_EXTINCTION, MIE_SCALE_HEIGHT, RAYLEIGH_SCALE_HEIGHT, RAYLEIGH_SCATTERING, SEA_ALBEDO,
} from './atmosphere';
import { POTENTIAL_DECILES, WEATHER_TILE, detailVolume, remap, shapeVolume, weatherMap } from './cloud-noise';
import { haze, skyAmbientUp, skyRadiance, sunTransmittance } from './tables';

type N = any;

const loop = (name: string, end: N, body: (i: N) => void) =>
  (Loop as N)({ start: int(0), end, type: 'int', condition: '<', name }, (v: N) => body(v[name]));
const fall = (a: number | N, b: number | N, x: N): N => float(1).sub(smoothstep(a, b, x));

// ------------------------------------------------------------------ constants

/** The shell, km above the sea: fair-weather cumulus, the trade wind's, capped by its inversion. */
export const BASE = 1.2, TOP = 2.0;
/** Tile sizes of the billows (250–60 m) and the erosion (100–25 m), km. The cells are cloud-noise.ts's. */
const SHAPE_SCALE = 1.0, DETAIL_SCALE = 0.4;
/** Extinction of the densest cloud, per km (cumulus: 50–100). */
export const SIGMA = 60;
/** The shaped noise's density past which the cloud is at its densest. */
const FULL = 0.35;
/** How far the large-scale field moves the threshold either way at middling cover, km of potential. */
const FIELD_SHIFT = 0.3;
/** How far below zero the threshold sinks at full cover, km: a little over BILLOW, so overcast is unbroken. */
const LAYER = 0.3;
/**
 * A cloud's top: DOME·p^¾ km over its cell's peak, p km of potential past the threshold — a third as tall as wide
 * for a cloud of 1–1.5 km, the most fair weather grows (cumulus humilis; mediocris would want towers this caps),
 * flatter still for the small puffs — falling to its edge as a quarter circle.
 */
const DOME = 0.6;
/** Height over which a cloud's base thins out to nothing, km: the condensation level is a few tens of metres deep. */
const BASE_FADE = 0.1;
/** Depth below a cloud's surface within which the billows carve it, km. */
const BILLOW = 0.25;
/** How much of the billows the erosion can take. */
const EROSION = 0.55;
/** Farthest distance marched, km: about where the shell's base meets the horizon (√(2·6360·1.2) = 124). */
export const MAX_DISTANCE = 120;
/** Past this distance the erosion is finer than a pixel, km; it is left out. */
const DETAIL_DISTANCE = 25;
/** Target step, km; a ray takes as many as its path through the shell needs, up to its cap. */
const STEP = 0.06;
/** Two-stream diffusion through cloud of asymmetry g: transmitted share 1/(1 + ¾(1−g)τ). */
export const DIFFUSION = 0.75 * (1 - 0.85);
/** Taps toward the sun, km, spaced wider as they go. */
const TAPS = [0.05, 0.15, 0.35, 0.8];

const hg = (c: N, g: number): N =>
  float((1 - g * g) / (4 * Math.PI)).div(pow(float(1 + g * g).sub(c.mul(2 * g)), 1.5));
/** Cloud's phase: a strong forward lobe and a weak back one (Hillaire 2016). */
const phase = (c: N, k: number): N => mix(hg(c, -0.3 * k), hg(c, 0.8 * k), 0.7);

export type CloudField = ReturnType<typeof createCloudField>;

/**
 * The cells' potential (km) above which cloud stands for a cover of k (0–1), read from the measured deciles: a share
 * k of the map passes it. Past broken cover the cells merge into a layer (stratocumulus): the threshold sinks below
 * zero, by up to LAYER at full cover, so even the gaps between cells lie that deep inside cloud and the billows no
 * longer open them. And how far the large-scale field moves it either way (km), most at middling cover.
 */
export function cloudThreshold(k: number): { threshold: number; fieldShift: number } {
  const x = Math.min(Math.max(1 - k, 0), 1) * 10;
  const i = Math.min(Math.floor(x), 9);
  const D = POTENTIAL_DECILES;
  const t = Math.min(Math.max((k - 0.6) / 0.4, 0), 1);
  const layer = LAYER * t * t * (3 - 2 * t);
  return { threshold: D[i] + (x - i) * (D[i + 1] - D[i]) - layer, fieldShift: FIELD_SHIFT * 4 * k * (1 - k) };
}

export function createCloudField() {
  const threshold = uniform(0.4);
  const fieldShift = uniform(0);
  const coverage = {
    set(k: number) {
      const c = cloudThreshold(k);
      threshold.value = c.threshold;
      fieldShift.value = c.fieldShift;
    },
  };
  /** How far the wind has carried the clouds, km. */
  const drift = uniform(new Vector3());
  /** Toward the sun, as the eye's sky shows it. */
  const sunDir = uniform(new Vector3(0, 1, 0));
  /** The eye: x and z where it is over the clouds' map, y its height above the sea; km. */
  const eye = uniform(new Vector3());

  /** Where q (km from the eye) lies on the map, and its height in the shell (0 at the base, 1 at the top). */
  const locate = (q: N) => {
    const altitude = length(vec3(q.x, q.y.add(eye.y).add(BOTTOM), q.z)).sub(BOTTOM);
    // the patterns are carried by the wind: what the map shows at a place now came from upwind
    return { p: vec3(eye.x, 0, eye.z).add(q).sub(drift), h: clamp(altitude.sub(BASE).div(TOP - BASE), 0, 1) };
  };

  /** The cloud's density (0–1) at q before erosion, its height in the shell and its dome's top there (fractions). */
  const coarse = (q: N) => {
    const { p, h } = locate(q);
    const w = texture(weatherMap).sample(p.xz.div(WEATHER_TILE)).level(float(0));
    // how far inside its cloud's edge the point lies, km: the fields of cloud lower the threshold, the clear skies
    // between raise it
    const shift = w.g.sub(0.5).mul(fieldShift).sub(threshold);
    const inside = w.r.add(shift);
    // each cloud a dome on a flat base: rounding over from its edge to a top above its cell's peak, the broad ones
    // towering and the small staying low; within BILLOW of its surface the billows decide whether a point is cloud,
    // so they carve the whole outline (Schneider 2017's dimensional profile)
    const peak = max(w.b.add(shift), inside);
    const s = clamp(inside.div(max(peak, 1e-3)), 0, 1);
    const dome = min(pow(max(peak, 0), 0.75).mul(DOME).mul(sqrt(s.mul(float(2).sub(s)))), TOP - BASE);
    const reach = clamp(min(dome.sub(h.mul(TOP - BASE)), inside).div(BILLOW), 0, 1);
    const dense = float(0).toVar();
    If(reach.greaterThan(0), () => {
      const n = texture3D(shapeVolume, p.div(SHAPE_SCALE)).level(float(0));
      const floorNoise = n.g.mul(0.625).add(n.b.mul(0.25)).add(n.a.mul(0.125));
      const billows = clamp(remap(n.r, floorNoise.sub(1), float(1), float(0), float(1)), 0, 1);
      // and a flat base, thinning out over its lowest BASE_FADE
      dense.assign(clamp(remap(billows, float(1).sub(reach), float(1), float(0), float(1)), 0, 1).mul(smoothstep(0, BASE_FADE / (TOP - BASE), h)));
    });
    return { dense, h, top: dome.div(TOP - BASE) };
  };

  /** Erodes a density at q: wisps toward the base, billows higher up. */
  const erode = (dense: N, q: N, h: N): N => {
    const { p } = locate(q);
    const d = texture3D(detailVolume, p.div(DETAIL_SCALE)).level(float(0));
    const df = d.r.mul(0.625).add(d.g.mul(0.25)).add(d.b.mul(0.125));
    const e = mix(df, float(1).sub(df), clamp(h.mul(4), 0, 1));
    return clamp(remap(dense, e.mul(EROSION), float(1), float(0), float(1)), 0, 1);
  };

  /** The eroded density at q. */
  const density = (q: N): N => {
    const c = coarse(q);
    return select(c.dense.greaterThan(0), erode(c.dense, q, c.h), float(0));
  };

  /** Distance along unit d from the eye to the sphere of altitude a (km); the eye is below it. */
  const toAltitude = (d: N, a: number): N => {
    const r0: N = float(BOTTOM).add(eye.y);
    const b: N = r0.mul(d.y);
    // c = r0² − r², written so it doesn't cancel
    const c = eye.y.sub(a).mul(r0.add(BOTTOM + a));
    const s: N = sqrt(max(b.mul(b).sub(c), 0));
    return (select as N)(b.greaterThan(0), c.negate().div(b.add(s)), b.negate().add(s));
  };

  /** Fraction of light surviving the air from the eye to `dist` km along d, per colour (closed form, flat air). */
  const airTransmittance = (d: N, dist: N): N => {
    const z = max(eye.y.add(d.y.mul(dist)).add(dist.mul(dist).div(2 * BOTTOM)), 0.01);
    // mean density over a straight climb from the sea to z: H(1 − e^(−z/H)) / z
    const mean = (H: number) => float(H).mul(float(1).sub(exp(z.negate().div(H)))).div(z);
    const ext = vec3(...RAYLEIGH_SCATTERING).mul(mean(RAYLEIGH_SCALE_HEIGHT)).add(haze.mul(MIE_EXTINCTION).mul(mean(MIE_SCALE_HEIGHT)));
    return exp(ext.mul(dist).negate());
  };

  /**
   * Marches the shell along unit d from the eye with up to `maxSteps` steps. Returns the cloud's light (rgb, per unit
   * sun) seen through the air, and the fraction of what lies behind that survives (a); through `distance` the
   * transmittance-weighted distance of the cloud (km). `detail` erodes the near cloud.
   */
  const march = (d: N, maxSteps: number, jitter: N, distance: N, detail: boolean): N => {
    const L = vec3(0).toVar(), T = float(1).toVar();
    const near = toAltitude(d, BASE).toVar(), far = min(toAltitude(d, TOP), MAX_DISTANCE).toVar();
    const span = max(far.sub(near), 0);
    const steps = int(clamp(ceil(span.div(STEP)), 8, maxSteps)).toVar();
    const dt = span.div(float(steps)).toVar();
    const cosSun = dot(d, sunDir);
    const single = phase(cosSun, 1).toVar();
    const weightSum = float(0).toVar(), distSum = float(0).toVar();
    // the sea's light, from the sun and the sky on it, seen from above (its radiance, E·albedo/π)
    const sea = sunTransmittance(float(BOTTOM), sunDir.y).mul(max(sunDir.y, 0)).mul(1 / Math.PI).add(skyAmbientUp).mul(SEA_ALBEDO);
    // the sea hides the shell below the horizon
    If(d.y.greaterThan(-0.002).and(near.lessThan(MAX_DISTANCE)), () => {
      loop('cs', steps, (i) => {
        const t = near.add(float(i).add(jitter).mul(dt));
        const q = d.mul(t);
        const c = coarse(q);
        If(c.dense.greaterThan(0.001), () => {
          const rho = c.dense.toVar();
          if (detail) If(t.lessThan(DETAIL_DISTANCE), () => { rho.assign(erode(c.dense, q, c.h)); });
          rho.assign(clamp(rho.div(FULL), 0, 1));
          If(rho.greaterThan(0.001), () => {
            // the nearest tap sees the eroded cloud, so the small billows shade one another
            const q1 = q.add(sunDir.mul(TAPS[0]));
            const c1 = coarse(q1);
            const first = c1.dense.toVar();
            if (detail) If(t.lessThan(DETAIL_DISTANCE).and(first.greaterThan(0)), () => { first.assign(erode(c1.dense, q1, c1.h)); });
            let tau: N = clamp(first.div(FULL), 0, 1).mul(SIGMA * TAPS[0]);
            for (let k = 1; k < TAPS.length; k++) {
              tau = tau.add(clamp(coarse(q.add(sunDir.mul(TAPS[k]))).dense.div(FULL), 0, 1).mul(SIGMA * (TAPS[k] - TAPS[k - 1])));
            }
            // multiple scattering: octaves near the surface, each weaker, reaching deeper and less forward (a = b = c),
            // and deep inside the diffused light of a slab of that depth; built up only past the first mean free paths
            let ms: N = float(0);
            for (let k = 1; k < 4; k++) {
              const a = 0.6 ** k;
              ms = ms.add(exp(tau.mul(-a)).mul(phase(cosSun, a)).mul(a));
            }
            ms = max(ms, float(1 / (4 * Math.PI)).div(tau.mul(DIFFUSION).add(1)));
            const powder = float(1).sub(exp(rho.mul(-SIGMA * 0.08)).mul(0.5));
            const radius = length(vec3(q.x, q.y.add(eye.y).add(BOTTOM), q.z));
            const sunLight = sunTransmittance(radius, dot(normalize(vec3(q.x, q.y.add(eye.y).add(BOTTOM), q.z)), sunDir));
            // the sky above and the sea below, half of each hemisphere's light, through the cloud between as a slab of
            // this density up to the cloud's top and down to its base
            const above = float(TOP - BASE).mul(max(c.top.sub(c.h), 0)).mul(rho).mul(SIGMA * DIFFUSION).add(1);
            const below = float(TOP - BASE).mul(c.h).mul(rho).mul(SIGMA * DIFFUSION).add(1);
            const S = sunLight.mul(exp(tau.negate()).mul(single).add(ms.mul(powder)))
              .add(skyAmbientUp.mul(0.5).div(above)).add(sea.mul(0.5).div(below));
            const stepT = exp(rho.mul(-SIGMA).mul(dt));
            const absorbed = T.mul(float(1).sub(stepT));
            L.addAssign(S.mul(absorbed));
            distSum.addAssign(t.mul(absorbed));
            weightSum.addAssign(absorbed);
            T.mulAssign(stepT);
            // a cloud this deep is opaque on through (its depth runs to tens): what is left is taken as gone, with
            // its share of light given to what was seen, else the sun's disc would shine through every cumulus
            If(T.lessThan(0.01), () => {
              L.divAssign(float(1).sub(T));
              T.assign(0);
              Break();
            });
          });
        });
      });
    });
    distance.assign(select(weightSum.greaterThan(1e-4), distSum.div(max(weightSum, 1e-4)), float(MAX_DISTANCE)));
    // the air between the eye and the cloud: what the cloud hides of the far sky is replaced by the air's own glow
    const Tair = airTransmittance(d, distance);
    const glow = skyRadiance(normalize(vec3(d.x, max(d.y, 0), d.z)), sunDir);
    const seen = L.mul(Tair).add(glow.mul(float(1).sub(T)).mul(float(1).sub(Tair)));
    // at the march's reach what little the haze leaves fades out
    const fade = fall(MAX_DISTANCE * 0.8, MAX_DISTANCE, distance);
    return vec4(seen.mul(fade), mix(float(1), T, fade));
  };

  return {
    inputs: { coverage, drift, sunDir, eye },
    density,
    toAltitude,
    march,
    /** The clouds along unit sky direction d from the eye, coarser (no erosion): light (rgb) and transmittance (a). */
    along: (d: N, steps: number): N => march(d, steps, float(0.5), float(0).toVar(), false),
  };
}

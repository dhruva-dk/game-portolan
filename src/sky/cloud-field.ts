// Cumulus, after Schneider ("The Real-Time Volumetric Cloudscapes of Horizon Zero Dawn", SIGGRAPH 2015; "Nubis",
// 2017) and Hillaire ("Physically Based Sky, Atmosphere and Cloud Rendering in Frostbite", SIGGRAPH 2016): what the
// cloud is at a point, and what the eye sees along a ray through it. clouds.ts spreads the rays over frames.
//
// Shape. A shell of cloud between BASE and TOP over the curved sea. A weather map (cloud-noise.ts) holds a potential:
// cumulus cells of three sizes, warped and roughened by noise so that the noise draws their outlines, gathered into
// fields with clear sky between; the cover (0–1) sets how much of it may hold cloud, and past broken cover merges
// them into a layer. Where the potential is deep the cloud stands a few hundred metres, at its fringes it stays a low,
// thin scrap whose base lifts toward its edge. A Perlin-Worley volume gives the billows, which carve top, sides and
// base alike; a Worley volume erodes their edges: wisps toward the base, cauliflower higher up.
//
// Light, as a painter's cumulus: two tones with a crisp edge between, and a crisp edge to the cloud itself. A point is
// lit where little cloud stands toward the sun (one tap), in the palette's cream (CLOUD) as bright as a white surface
// square to the sun; else in its rose, as bright as UNDERLIT of a white surface in the open. So lit sides are cream
// and bases rose. Then the air between the eye and the cloud: its extinction integrated in closed form up to the
// cloud's height, and its glow, so far clouds sink into the haze.
//
// The shell is the eye's, like the sky (view.toSky): Earth's curvature under it, its directions the sky's (x east, y
// up, z south, elevations stretched to put its horizon on the sea's). Its map slides under the eye as the eye moves
// over the planet. Units are kilometres, relative to the eye; Earth's centre is BOTTOM below the sea.

import { Vector3 } from 'three/webgpu';
import {
  Break, If, ceil, clamp, dot, exp, float, int, length, max, min, mix, normalize, pow, select, smoothstep, sqrt,
  texture, texture3D, uniform, vec3, vec4,
} from 'three/tsl';
import {
  BOTTOM, MIE_EXTINCTION, MIE_SCALE_HEIGHT, RAYLEIGH_SCALE_HEIGHT, RAYLEIGH_SCATTERING,
} from './atmosphere';
import { CLOUD } from '../palette';
import { POTENTIAL_DECILES, WEATHER_TILE, remap, type CloudNoise } from './cloud-noise';
import { loop, type FloatNode, type Vec3Node, type Vec4Node } from '../tsl';
import type { Tables } from './tables';

const fall = (a: number, b: number, x: FloatNode): FloatNode => float(1).sub(smoothstep(a, b, x));

// ------------------------------------------------------------------ constants

/** The shell, km above the sea: fair-weather cumulus, the trade wind's, capped by its inversion. */
export const BASE = 1.2, TOP = 2.6;
/** Tile sizes of the billows (250–60 m) and the erosion (100–25 m), km. The cells are cloud-noise.ts's. */
const SHAPE_SCALE = 1.0, DETAIL_SCALE = 0.4;
/** Extinction of the densest cloud, per km (cumulus: 50–100). */
export const SIGMA = 60;
/** The air between the eye and a cloud is taken as this share of its length: a painter's horizon cumulus stays crisp
 *  to its base (art/target/idea.png) where the whole air's would grey its lower half (review26). */
const CLOUD_AIR = 0.25;
/** The shaped noise's density past which the cloud is at its densest. */
const FULL = 0.35;
/**
 * The weather map drawn this many times larger than its tile (cloud-noise.ts), its potential with it: the same share
 * of sky in cloud, but gathered into a few big masses, as tall as they are broad, rather than a field of small puffs.
 * At this size they read as shapes at the phone's resolution, and their sunlit sides as broad blocks of light.
 */
const MASS = 5;
/** How far the large-scale field moves the threshold either way at middling cover, km of potential. */
const FIELD_SHIFT = 0.3;
/** How far below zero the threshold sinks at full cover, km: a little over BILLOW, so overcast is unbroken. */
const LAYER = 0.3;
/**
 * A cloud's top: about DOME·p^¾ km where it lies p km of potential inside its edge, easing into the shell's ceiling
 * (exponentially) — about half as tall as wide for a cloud
 * of 1–1.5 km (cumulus mediocris: art/target/idea.png's heaped clouds, where humilis read as flat smears, review25),
 * flatter still for the small puffs.
 */
const DOME = 1.4;
/** How far a cloud's base lifts at its edge, km, and how far in it has come down to the shell's base, km of potential. */
const LIFT = 0.15, MARGIN = 0.3;
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
/** The cloud's edge: where its density (of the full) crosses EDGE_AT, over EDGE_WIDTH either way. */
const EDGE_AT = 0.2, EDGE_WIDTH = 0.12;
/** The one tap toward the sun, km; the cloud there (of the full) past which a point is in shadow, and the edge's width:
 *  high enough that most of a cumulus is in the sun, cream over small cool bases as art/target/idea.png's, not the
 *  grey-mauve with thin cream rims review34 saw. */
const LIGHT_TAP = 0.1, SHADE_AT = 0.8, SHADE_EDGE = 0.1;
/** How much of the sun's own colour the cloud's lit tone keeps (the rest is the palette's cream at the sun's
 *  brightness); and how bright its shadow tone is, of what a white surface in the open gets. */
const WARMED = 0.8, UNDERLIT = 0.7;
const LUMA = vec3(0.2126, 0.7152, 0.0722);


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

/** tables: the air's (tables.ts); noise: the clouds' patterns (cloud-noise.ts). */
export function createCloudField(tables: Tables, noise: CloudNoise) {
  const { haze, skyAmbientUp, skyRadiance, sunTransmittance } = tables;
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
  const locate = (q: Vec3Node) => {
    const altitude = length(vec3(q.x, q.y.add(eye.y).add(BOTTOM), q.z)).sub(BOTTOM);
    // the patterns are carried by the wind: what the map shows at a place now came from upwind
    return { p: vec3(eye.x, 0, eye.z).add(q).sub(drift), h: clamp(altitude.sub(BASE).div(TOP - BASE), 0, 1) };
  };

  /** The cloud's density (0–1) at q before erosion, its height in the shell and its dome's top there (fractions). */
  const coarse = (q: Vec3Node) => {
    const { p, h } = locate(q);
    const w = texture(noise.weather).sample(p.xz.div(WEATHER_TILE * MASS)).level(float(0));
    // how far inside its cloud's edge the point lies, km: the fields of cloud lower the threshold, the clear skies
    // between raise it
    const shift = w.g.sub(0.5).mul(fieldShift).sub(threshold);
    const inside = w.r.add(shift).mul(MASS);
    // each cloud as tall as it lies deep inside its edge here, so its top follows the map's ragged potential: the
    // broad ones towering, the small and the fringes staying low; its base lifts toward its margins, which are thin;
    // within BILLOW of its surface, top, side or base, the billows decide whether a point is cloud, so they carve the
    // whole outline (Schneider 2017's dimensional profile)
    const z = h.mul(TOP - BASE);
    // eased into the shell's ceiling rather than cut at it, so the broad ones' crowns round off instead of standing
    // flat-topped with sheer sides, as boxes (review27's stepped clouds)
    const top = float(1).sub(exp(pow(max(inside, 0), 0.75).mul(-DOME / (TOP - BASE)))).mul(TOP - BASE);
    const bottom = min(fall(0, MARGIN, inside).mul(LIFT), top.mul(0.5));
    const reach = clamp(min(min(top.sub(z), z.sub(bottom).mul(2)), inside).div(BILLOW), 0, 1);
    const dense = float(0).toVar();
    If(reach.greaterThan(0), () => {
      const n = texture3D(noise.shape, p.div(SHAPE_SCALE)).level(float(0));
      const floorNoise = n.g.mul(0.625).add(n.b.mul(0.25)).add(n.a.mul(0.125));
      const billows = clamp(remap(n.r, floorNoise.sub(1), float(1), float(0), float(1)), 0, 1);
      // and a flat base, thinning out over its lowest BASE_FADE
      dense.assign(clamp(remap(billows, float(1).sub(reach), float(1), float(0), float(1)), 0, 1).mul(smoothstep(0, BASE_FADE / (TOP - BASE), h)));
    });
    return { dense, h, top: top.div(TOP - BASE), inside };
  };

  /** Erodes a density at q: wisps toward the base, billows higher up. */
  const erode = (dense: FloatNode, q: Vec3Node, h: FloatNode): FloatNode => {
    const { p } = locate(q);
    const d = texture3D(noise.detail, p.div(DETAIL_SCALE)).level(float(0));
    const df = d.r.mul(0.625).add(d.g.mul(0.25)).add(d.b.mul(0.125));
    const e = mix(df, float(1).sub(df), clamp(h.mul(4), 0, 1));
    return clamp(remap(dense, e.mul(EROSION), float(1), float(0), float(1)), 0, 1);
  };

  /** The cloud's density at q (0–1, of SIGMA), eroded, as the march sees it. */
  const density = (q: Vec3Node): FloatNode => {
    const c = coarse(q);
    return select(c.dense.greaterThan(0), clamp(erode(c.dense, q, c.h).div(FULL), 0, 1), float(0));
  };

  /** Distance along unit d from the eye to the sphere of altitude a (km); the eye is below it. */
  const toAltitude = (d: Vec3Node, a: number): FloatNode => {
    const r0 = float(BOTTOM).add(eye.y);
    const b = r0.mul(d.y);
    // c = r0² − r², written so it doesn't cancel
    const c = eye.y.sub(a).mul(r0.add(BOTTOM + a));
    const s = sqrt(max(b.mul(b).sub(c), 0));
    return select(b.greaterThan(0), c.negate().div(b.add(s)), b.negate().add(s));
  };

  /** Fraction of light surviving the air from the eye to `dist` km along d, per colour (closed form, flat air). */
  const airTransmittance = (d: Vec3Node, dist: FloatNode): Vec3Node => {
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
  const march = (d: Vec3Node, maxSteps: number, jitter: FloatNode, distance: FloatNode, detail: boolean): Vec4Node => {
    const L = vec3(0).toVar(), T = float(1).toVar();
    const near = toAltitude(d, BASE).toVar(), far = min(toAltitude(d, TOP), MAX_DISTANCE).toVar();
    const span = max(far.sub(near), 0);
    const steps = int(clamp(ceil(span.div(STEP)), 8, maxSteps)).toVar();
    const dt = span.div(float(steps)).toVar();
    const weightSum = float(0).toVar(), distSum = float(0).toVar();
    // what a white surface in the open gets from the sun and the sky (its radiance, E/π), in the cloud's shadow tone
    const open = sunTransmittance(float(BOTTOM), sunDir.y).mul(max(sunDir.y, 0)).mul(1 / Math.PI).add(skyAmbientUp);
    const under = vec3(dot(open, LUMA)).mul(vec3(...CLOUD.shadow)).mul(UNDERLIT).toVar();
    // the sea hides the shell below the horizon
    If(d.y.greaterThan(-0.002).and(near.lessThan(MAX_DISTANCE)), () => {
      loop('cs', steps, (i) => {
        const t = near.add(float(i).add(jitter).mul(dt));
        const q = d.mul(t);
        const c = coarse(q);
        If(c.dense.greaterThan(0.001), () => {
          const rho = c.dense.toVar();
          if (detail) If(t.lessThan(DETAIL_DISTANCE), () => { rho.assign(erode(c.dense, q, c.h)); });
          // the cloud's edge crisp: its density rises from nothing to full over a narrow step of the noise's
          rho.assign(smoothstep(EDGE_AT - EDGE_WIDTH, EDGE_AT + EDGE_WIDTH, rho.div(FULL)));
          If(rho.greaterThan(0.001), () => {
            // Two tones, as a painter's cumulus: lit where little cloud stands between the point and the sun (one tap
            // toward it), the edge between crisp; the sun's light in the cloud's cream (keeping WARMED of the sun's
            // own colour, so a low sun still warms it), as bright as a white surface square to it, over the shadow
            // tone, the palette's rose as bright as UNDERLIT of what a white surface in the open gets.
            const toward = clamp(coarse(q.add(sunDir.mul(LIGHT_TAP))).dense.div(FULL), 0, 1);
            const lit = float(1).sub(smoothstep(SHADE_AT - SHADE_EDGE, SHADE_AT + SHADE_EDGE, toward));
            const radius = length(vec3(q.x, q.y.add(eye.y).add(BOTTOM), q.z));
            const sunLight = sunTransmittance(radius, dot(normalize(vec3(q.x, q.y.add(eye.y).add(BOTTOM), q.z)), sunDir));
            const sunTone = mix(vec3(dot(sunLight, LUMA)), sunLight, WARMED).mul(vec3(...CLOUD.lit));
            const S = under.add(sunTone.mul(lit.mul(1 / Math.PI)));
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
    const Tair = airTransmittance(d, distance.mul(CLOUD_AIR));
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
    along: (d: Vec3Node, steps: number): Vec4Node => march(d, steps, float(0.5), float(0).toVar(), false),
  };
}

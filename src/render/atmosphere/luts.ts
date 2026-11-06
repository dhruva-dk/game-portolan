// The air's lookup tables, integrated on the GPU by compute shaders (Hillaire 2020):
//
//  - transmittance: how much light survives from a height along a direction to the top of the air;
//  - multiple scattering: the light scattered more than once, as a function of height and the sun's elevation, so
//    that every later integration gets all orders of scattering for the price of one;
//  - sky irradiance: the light the whole sky (and the sea under it) throws on a surface, as an ambient cube in a frame
//    turned toward the sun (the exact irradiance on faces turned up, down, sunward, away and aside), by height and the
//    sun's elevation, so a ship's sunward flank is brighter than its lee, her deck takes the blue overhead, and a point
//    on the night side gets the deep blue of its own dusk rather than the camera's noon. (An L1 harmonic was tried
//    first: the bright aureole round the sun drives it below zero on faces turned away, which went black);
//  - the sky view: the sky round the eye, every frame, with resolution packed round the horizon and the sun;
//  - aerial perspective: a froxel volume over the view of the light scattered in front of, and the light lost from,
//    everything at each distance, every frame; the fog every surface takes on is read from it.
//
// The first three depend on the air alone and are redone when the air changes. The last two follow the eye, the sun
// and the moon. The moon lights the sky by the same physics at its own (far smaller) illuminance, so a moonlit night
// has a real, dim blue sky with a glow round the moon.
import { HalfFloatType, Matrix4, Storage3DTexture, StorageArrayTexture, StorageTexture, Vector2, Vector3, type ComputeNode, type Node } from 'three/webgpu';
import {
  Fn, If, abs, acos, clamp, exp, float, globalId, int, max, mix, select, smoothstep, sqrt, storageTexture, texture, texture3D,
  textureStore, uint, uniform, uvec3, vec2, vec3, vec4, cos, sin,
} from 'three/tsl';
import { AIR, densities, distanceToTop, miePhase, raySphere, rayleighPhase, transmittanceParams, transmittanceUV } from './model.ts';
import { P } from '../gpu/uniforms.ts';
import { loop } from '../gpu/tsl.ts';

type F = Node<'float'>;
type V3 = Node<'vec3'>;

export const TRANSMITTANCE = new Vector2(256, 64);
export const MULTI = new Vector2(32, 32);
export const IRRADIANCE = new Vector2(32, 16);
export const SKY = new Vector2(192, 108);
export const MOON_SKY = new Vector2(96, 54);
/** The aerial perspective volume: columns across and up the screen, and slices in depth. */
export const AERIAL = new Vector3(32, 32, 32);

/** The sun's angular radius, radians: a little larger than Earth's, for a sun the eye finds at once. */
export const SUN_RADIUS = 0.0095;
export const MOON_RADIUS = 0.012;

function table(w: number, h: number): StorageTexture {
  const t = new StorageTexture(w, h);
  t.type = HalfFloatType;
  t.generateMipmaps = false;
  return t;
}

function layers(w: number, h: number, n: number): StorageArrayTexture {
  const t = new StorageArrayTexture(w, h, n);
  t.type = HalfFloatType;
  t.generateMipmaps = false;
  return t;
}

function volume(w: number, h: number, d: number): Storage3DTexture {
  const t = new Storage3DTexture(w, h, d);
  t.type = HalfFloatType;
  t.generateMipmaps = false;
  return t;
}

/** The layers of the irradiance table. */
export const IRRADIANCE_FACE = { up: 0, down: 1, toward: 2, away: 3, aside: 4 } as const;

export const tables = {
  transmittance: table(TRANSMITTANCE.x, TRANSMITTANCE.y),
  multi: table(MULTI.x, MULTI.y),
  /** The sky's irradiance on faces turned up, down, toward the light's azimuth, away from it, and aside (the layers
   *  of IRRADIANCE_FACE): one array, so the surfaces that read it hold one sampler for it rather than five. */
  irradiance: layers(IRRADIANCE.x, IRRADIANCE.y, 5),
  sky: table(SKY.x, SKY.y),
  moonSky: table(MOON_SKY.x, MOON_SKY.y),
  /** The aerial perspective: the light gathered in the first AERIAL.z slices and the light kept in the next as many,
   *  one volume so that every surface reading it holds one sampler for it rather than two. */
  aerial: volume(AERIAL.x, AERIAL.y, AERIAL.z * 2),
};

/** Where the eye is, and what the aerial perspective volume is laid over. Set by the atmosphere each frame. */
export const EYE = {
  position: uniform(new Vector3(0, 600, 0)),
  /** The camera's world matrix and the tangents of its half angles, for the volume's rays. */
  world: uniform(new Matrix4()),
  tan: uniform(new Vector2(1, 1)),
  /** The camera's view-projection, for finding a point's column in the volume. */
  viewProjection: uniform(new Matrix4()),
  /** How deep the volume reaches past where each ray enters the air, metres. */
  range: uniform(700),
};

// ---------------------------------------------------------------- texel ↔ unit range (Bruneton)

/** Maps a unit-range value so that 0 and 1 fall on the first and last texels' centres. */
const toSub = (x: F, n: number) => x.mul(1 - 1 / n).add(0.5 / n);
const fromSub = (u: F, n: number) => u.sub(0.5 / n).div(1 - 1 / n);

// ---------------------------------------------------------------- reading the tables

/** The light that survives from height r along a direction of zenith cosine mu to the top of the air. */
export const transmittance = Fn(([r, mu]: [F, F]) => {
  const uv = transmittanceUV(r, mu);
  return texture(tables.transmittance, vec2(toSub(uv.x, TRANSMITTANCE.x), toSub(uv.y, TRANSMITTANCE.y))).rgb;
});

/**
 * The share of a light at zenith cosine mu that reaches height r: the transmittance to the top, faded out as the light
 * sinks behind the planet's limb over the width of its disc, which is the soft terminator that crosses the planet.
 */
export const lightTransmittance = Fn(([r, mu, size]: [F, F, F]) => {
  const sinH = AIR.bottom.div(max(r, AIR.bottom));
  const horizon = sqrt(max(float(1).sub(sinH.mul(sinH)), 0)).negate();
  const seen = smoothstep(horizon.sub(size), horizon.add(size), mu);
  return transmittance(r, mu).mul(seen);
});

const msUV = (r: F, muS: F) => {
  const x = muS.mul(0.5).add(0.5);
  const y = r.sub(AIR.bottom).div(AIR.top.sub(AIR.bottom));
  return vec2(toSub(clamp(x, 0, 1), MULTI.x), toSub(clamp(y, 0, 1), MULTI.y));
};

/** The light scattered more than once toward a point at height r with the sun at zenith cosine muS, per unit sun. */
export const multipleScattering = Fn(([r, muS]: [F, F]) => texture(tables.multi, msUV(r, muS)).rgb);

const irradianceUV = (r: F, muS: F) => {
  const x = muS.mul(0.5).add(0.5);
  const y = r.sub(AIR.bottom).div(AIR.top.sub(AIR.bottom));
  return vec2(toSub(clamp(x, 0, 1), IRRADIANCE.x), toSub(clamp(y, 0, 1), IRRADIANCE.y));
};

/**
 * The irradiance the sky (and the sea and land below it) throws on a surface facing n at point p, from a light in
 * direction l, per unit of that light's illuminance.
 */
export const skyIrradiance = Fn(([p, n, l]: [V3, V3, V3]) => {
  const r = p.length();
  const up = p.div(r);
  const muS = up.dot(l);
  const across = l.sub(up.mul(muS));
  const toward = across.div(max(across.length(), 1e-4));
  const uv = irradianceUV(r, muS);
  const ny = n.dot(up), nt = n.dot(toward);
  const ns2 = max(float(1).sub(ny.mul(ny)).sub(nt.mul(nt)), 0);
  const face = (k: number) => texture(tables.irradiance, uv).depth(int(k)).rgb;
  const vertical = select(ny.greaterThan(0), face(IRRADIANCE_FACE.up), face(IRRADIANCE_FACE.down));
  const along = select(nt.greaterThan(0), face(IRRADIANCE_FACE.toward), face(IRRADIANCE_FACE.away));
  return vertical.mul(ny.mul(ny)).add(along.mul(nt.mul(nt))).add(face(IRRADIANCE_FACE.aside).mul(ns2));
});

// ---------------------------------------------------------------- the sky view's mapping (Hillaire)

/** The sky view table's coordinates for a direction from height r, given its zenith cosine and its azimuth's cosine
 *  from the light's. */
export const skyViewUV = Fn(([r, viewZenithCos, lightViewCos, w, h]: [F, F, F, F, F]) => {
  const rr = max(r, AIR.bottom.add(0.01));
  const vHorizon = sqrt(max(rr.mul(rr).sub(AIR.bottom.mul(AIR.bottom)), 0));
  const beta = acos(clamp(vHorizon.div(rr), -1, 1));
  const zenithHorizon = float(Math.PI).sub(beta);
  const zenith = acos(clamp(viewZenithCos, -1, 1));
  const above = float(0.5).mul(float(1).sub(sqrt(max(float(1).sub(zenith.div(zenithHorizon)), 0))));
  const below = float(0.5).add(float(0.5).mul(sqrt(max(zenith.sub(zenithHorizon).div(beta), 0))));
  const y = select(zenith.lessThan(zenithHorizon), above, below);
  const x = sqrt(clamp(lightViewCos.mul(-0.5).add(0.5), 0, 1));
  return vec2(x.mul(float(1).sub(float(1).div(w))).add(float(0.5).div(w)), y.mul(float(1).sub(float(1).div(h))).add(float(0.5).div(h)));
});

// ---------------------------------------------------------------- integration

/** What one step of a march through the air leaves: light gathered, and light kept. */
interface Medium {
  scattering: V3;
  extinction: V3;
  rayleigh: V3;
  mie: F;
}

const mediumAt = (h: F): Medium => {
  const d = densities(h);
  const rayleigh = AIR.rayleigh.mul(d.x);
  const mie = AIR.mieScattering.mul(d.y);
  const extinction = rayleigh.add(vec3(AIR.mieExtinction.mul(d.y))).add(AIR.ozone.mul(d.z));
  return { scattering: rayleigh.add(vec3(mie)), extinction, rayleigh, mie };
};

/** The light a sample at p scatters toward -d from a light in direction l, per unit of the light: once directly, and
 *  more than once through the multiple scattering table. */
const inscatter = (p: V3, d: V3, l: V3, m: Medium, size: F): V3 => {
  const r = p.length();
  const muL = p.div(r).dot(l);
  const c = d.dot(l);
  const direct = lightTransmittance(r, muL, size).mul(m.rayleigh.mul(rayleighPhase(c)).add(vec3(m.mie.mul(miePhase(c, AIR.mieG)))));
  return direct.add(multipleScattering(r, muL).mul(m.scattering));
};

/** Adds one step of length dt with source S and extinction e to light L and throughput T (Hillaire's energy-conserving
 *  integration of a constant source over the step). */
const step = (L: V3, T: V3, S: V3, e: V3, dt: F) => {
  const kept = exp(e.negate().mul(dt));
  const gathered = S.sub(S.mul(kept)).div(max(e, vec3(1e-7)));
  L.addAssign(T.mul(gathered));
  T.mulAssign(kept);
};

// ---------------------------------------------------------------- the kernels

const transmittanceKernel = Fn(() => {
  const id = globalId.xy;
  const x = fromSub(float(id.x).add(0.5).div(TRANSMITTANCE.x), TRANSMITTANCE.x);
  const y = fromSub(float(id.y).add(0.5).div(TRANSMITTANCE.y), TRANSMITTANCE.y);
  const rm = transmittanceParams(vec2(clamp(x, 0, 1), clamp(y, 0, 1)));
  const r = rm.x, mu = rm.y;
  const dist = distanceToTop(r, mu);
  const n = 48;
  const dt = dist.div(n);
  const depth = vec3(0).toVar();
  loop('s', n, (i) => {
    const t = float(i).add(0.5).mul(dt);
    const h = sqrt(r.mul(r).add(t.mul(t)).add(r.mul(mu).mul(t).mul(2))).sub(AIR.bottom);
    depth.addAssign(mediumAt(h).extinction.mul(dt));
  });
  // The light's path is lengthened toward the horizon. A planet this small holds only about eight zeniths of air
  // along the horizon where Earth holds nearly forty, so its low sun would stay white; this table is only ever read
  // for light on its way in (the sun and moon on a surface or on the air, and their discs), never for the eye's own
  // line of sight, so the haze between the eye and a ship keeps the true air while dusk goes gold and red.
  const sinH = AIR.bottom.div(r);
  const horizon = sqrt(max(float(1).sub(sinH.mul(sinH)), 0)).negate();
  const low = float(1).sub(smoothstep(0, 0.5, mu.sub(horizon)));
  const mass = float(1).add(AIR.lightAirMass.sub(1).mul(low.mul(low)));
  textureStore(tables.transmittance, id, vec4(exp(depth.mul(mass).negate()), 1));
});

const multiKernel = Fn(() => {
  const id = globalId.xy;
  const muS = clamp(fromSub(float(id.x).add(0.5).div(MULTI.x), MULTI.x), 0, 1).mul(2).sub(1);
  const height = clamp(fromSub(float(id.y).add(0.5).div(MULTI.y), MULTI.y), 0, 1);
  const r = mix(AIR.bottom.add(0.1), AIR.top.sub(0.1), height);
  const origin = vec3(0, r, 0);
  const sun = vec3(sqrt(max(float(1).sub(muS.mul(muS)), 0)), muS, 0);
  const sumL = vec3(0).toVar();
  const sumF = vec3(0).toVar();
  const rings = 8, spokes = 8, steps = 20;
  const iso = 1 / (4 * Math.PI);
  loop('ring', rings, (i) => {
    loop('spoke', spokes, (j) => {
      const cosT = float(1).sub(float(i).add(0.5).mul(2 / rings));
      const sinT = sqrt(max(float(1).sub(cosT.mul(cosT)), 0));
      const phi = float(j).add(0.5).mul((2 * Math.PI) / spokes);
      const d = vec3(sinT.mul(cos(phi)), cosT, sinT.mul(sin(phi)));
      const ground = raySphere(origin, d, AIR.bottom);
      const sky = raySphere(origin, d, AIR.top);
      const hits = ground.x.greaterThan(0);
      const tMax = select(hits, ground.x, sky.y);
      const dt = tMax.div(steps);
      const L = vec3(0).toVar();
      const T = vec3(1).toVar();
      const Fms = vec3(0).toVar();
      loop('s', steps, (k) => {
        const t = float(k).add(0.5).mul(dt);
        const p = origin.add(d.mul(t));
        const rp = p.length();
        const m = mediumAt(rp.sub(AIR.bottom));
        const muL = p.div(rp).dot(sun);
        const S = lightTransmittance(rp, muL, float(0.01)).mul(m.scattering).mul(iso);
        const kept = exp(m.extinction.negate().mul(dt));
        const e = max(m.extinction, vec3(1e-7));
        Fms.addAssign(T.mul(m.scattering.sub(m.scattering.mul(kept)).div(e)));
        L.addAssign(T.mul(S.sub(S.mul(kept)).div(e)));
        T.mulAssign(kept);
      });
      If(hits, () => {
        const g = origin.add(d.mul(tMax));
        const up = g.normalize();
        const muG = up.dot(sun);
        L.addAssign(T.mul(lightTransmittance(AIR.bottom, muG, float(0.01))).mul(max(muG, 0)).mul(AIR.groundAlbedo).div(Math.PI));
      });
      sumL.addAssign(L);
      sumF.addAssign(Fms);
    });
  });
  const count = rings * spokes;
  const L2 = sumL.div(count);
  const fms = sumF.div(count).mul(iso).mul(4 * Math.PI);
  textureStore(tables.multi, id, vec4(L2.div(max(vec3(1).sub(fms), vec3(1e-3))), 1));
});

const irradianceKernel = Fn(() => {
  const id = globalId.xy;
  const muS = clamp(fromSub(float(id.x).add(0.5).div(IRRADIANCE.x), IRRADIANCE.x), 0, 1).mul(2).sub(1);
  const height = clamp(fromSub(float(id.y).add(0.5).div(IRRADIANCE.y), IRRADIANCE.y), 0, 1);
  const r = mix(AIR.bottom.add(0.5), AIR.top.sub(0.5), height);
  const origin = vec3(0, r, 0);
  // the light's azimuth is +x; "up" is +y
  const sun = vec3(sqrt(max(float(1).sub(muS.mul(muS)), 0)), muS, 0);
  const eUp = vec3(0).toVar();
  const eDown = vec3(0).toVar();
  const eToward = vec3(0).toVar();
  const eAway = vec3(0).toVar();
  const eAside = vec3(0).toVar();
  const rings = 12, spokes = 16, steps = 16;
  const weight = (4 * Math.PI) / (rings * spokes);
  loop('ring', rings, (i) => {
    loop('spoke', spokes, (j) => {
      const cosT = float(1).sub(float(i).add(0.5).mul(2 / rings));
      const sinT = sqrt(max(float(1).sub(cosT.mul(cosT)), 0));
      const phi = float(j).add(0.5).mul((2 * Math.PI) / spokes);
      const d = vec3(sinT.mul(cos(phi)), cosT, sinT.mul(sin(phi)));
      const ground = raySphere(origin, d, AIR.bottom);
      const sky = raySphere(origin, d, AIR.top);
      const hits = ground.x.greaterThan(0);
      const tMax = select(hits, ground.x, sky.y);
      const L = vec3(0).toVar();
      const T = vec3(1).toVar();
      const prev = float(0).toVar();
      loop('s', steps, (k) => {
        const s = float(k).add(1).div(steps);
        const t1 = tMax.mul(s.mul(s));
        const dt = t1.sub(prev);
        const t = prev.add(dt.mul(0.5));
        const p = origin.add(d.mul(t));
        const m = mediumAt(p.length().sub(AIR.bottom));
        step(L, T, inscatter(p, d, sun, m, float(0.01)), m.extinction, dt);
        prev.assign(t1);
      });
      If(hits, () => {
        const g = origin.add(d.mul(tMax));
        const up = g.normalize();
        const muG = up.dot(sun);
        // the sea and land below: lit by the sun and, roughly, by a sky as bright as the one overhead here
        const lit = lightTransmittance(AIR.bottom, muG, float(0.01)).mul(max(muG, 0)).add(multipleScattering(AIR.bottom, muG).mul(0.5));
        L.addAssign(T.mul(lit).mul(AIR.groundAlbedo).div(Math.PI));
      });
      const Lw = L.mul(weight);
      eUp.addAssign(Lw.mul(max(d.y, 0)));
      eDown.addAssign(Lw.mul(max(d.y.negate(), 0)));
      eToward.addAssign(Lw.mul(max(d.x, 0)));
      eAway.addAssign(Lw.mul(max(d.x.negate(), 0)));
      eAside.addAssign(Lw.mul(abs(d.z)));
    });
  });
  const store = storageTexture(tables.irradiance);
  store.depth(int(IRRADIANCE_FACE.up)).store(id, vec4(eUp, 1));
  store.depth(int(IRRADIANCE_FACE.down)).store(id, vec4(eDown, 1));
  store.depth(int(IRRADIANCE_FACE.toward)).store(id, vec4(eToward, 1));
  store.depth(int(IRRADIANCE_FACE.away)).store(id, vec4(eAway, 1));
  // aside is the same on either side: the sky is symmetric about the light's vertical plane
  store.depth(int(IRRADIANCE_FACE.aside)).store(id, vec4(eAside.mul(0.5), 1));
});

/** The sky round the eye, lit by one light. Its rows pack the zenith-to-nadir circle tighter at the horizon, its
 *  columns the azimuth tighter toward the light. */
function skyKernel(target: StorageTexture, size: Vector2, light: Node<'vec3'>, illuminance: Node<'vec3'>, lightSize: number) {
  return Fn(() => {
    const id = globalId.xy;
    const x = clamp(fromSub(float(id.x).add(0.5).div(size.x), size.x), 0, 1);
    const y = clamp(fromSub(float(id.y).add(0.5).div(size.y), size.y), 0, 1);
    const eye = EYE.position;
    const r = max(eye.length(), AIR.bottom.add(0.5));
    const up = eye.div(eye.length());
    const vHorizon = sqrt(max(r.mul(r).sub(AIR.bottom.mul(AIR.bottom)), 0));
    const beta = acos(clamp(vHorizon.div(r), -1, 1));
    const zenithHorizon = float(Math.PI).sub(beta);
    const a = float(1).sub(y.mul(2));
    const b = y.mul(2).sub(1);
    const zenith = select(y.lessThan(0.5), zenithHorizon.mul(float(1).sub(a.mul(a))), zenithHorizon.add(beta.mul(b.mul(b))));
    const lightViewCos = x.mul(x).mul(2).sub(1).negate();
    const muL = up.dot(light);
    const local = vec3(sqrt(max(float(1).sub(muL.mul(muL)), 0)), muL, 0);
    const cosZ = cos(zenith), sinZ = sin(zenith);
    const sinA = sqrt(max(float(1).sub(lightViewCos.mul(lightViewCos)), 0));
    const d = vec3(sinZ.mul(lightViewCos), cosZ, sinZ.mul(sinA));
    const origin = vec3(0, r, 0);
    const ground = raySphere(origin, d, AIR.bottom);
    const sky = raySphere(origin, d, AIR.top);
    const tMax = select(ground.x.greaterThan(0), ground.x, max(sky.y, 0));
    const L = vec3(0).toVar();
    const T = vec3(1).toVar();
    const prev = float(0).toVar();
    const steps = 30;
    loop('s', steps, (i) => {
      const s = float(i).add(1).div(steps);
      const t1 = tMax.mul(s.mul(s));
      const dt = t1.sub(prev);
      const p = origin.add(d.mul(prev.add(dt.mul(0.5))));
      const m = mediumAt(p.length().sub(AIR.bottom));
      step(L, T, inscatter(p, d, local, m, float(lightSize)), m.extinction, dt);
      prev.assign(t1);
    });
    // below the horizon, the sea and land the ray meets, lit by the light and the sky; only reflections and the
    // environment probe ever see this half, the sea covers it in the view
    If(ground.x.greaterThan(0), () => {
      const g = origin.add(d.mul(tMax)).normalize();
      const muG = g.dot(local);
      const lit = lightTransmittance(AIR.bottom, muG, float(lightSize)).mul(max(muG, 0)).add(multipleScattering(AIR.bottom, muG).mul(0.5));
      L.addAssign(T.mul(lit).mul(AIR.groundAlbedo).div(Math.PI));
    });
    textureStore(target, id, vec4(L.mul(illuminance), 1));
  });
}

/** The aerial perspective volume: for each column of the view, march out through the slices, writing the light
 *  gathered and the light kept up to each slice's far edge. Both the sun and the moon light it. */
const aerialKernel = Fn(() => {
  const id = globalId.xy;
  const ndc = vec2(id).add(0.5).div(vec2(AERIAL.x, AERIAL.y)).mul(2).sub(1);
  const view = vec3(ndc.x.mul(EYE.tan.x), ndc.y.mul(EYE.tan.y), -1);
  const d = EYE.world.mul(vec4(view, 0)).xyz.normalize();
  const eye = EYE.position;
  const shell = raySphere(eye, d, AIR.top);
  const start = max(shell.x, 0);
  const missed = shell.y.lessThan(0);
  const L = vec3(0).toVar();
  const T = vec3(1).toVar();
  const prev = float(0).toVar();
  const sub = 3;
  loop('slice', AERIAL.z, (i) => {
    If(missed.not(), () => {
      const w = float(i).add(1).div(AERIAL.z);
      const t1 = w.mul(w).mul(EYE.range);
      const dt = t1.sub(prev).div(sub);
      loop('sub', sub, (k) => {
        const t = prev.add(dt.mul(float(k).add(0.5)));
        const p = eye.add(d.mul(start.add(t)));
        const m = mediumAt(p.length().sub(AIR.bottom));
        const S = inscatter(p, d, P.sunDir, m, float(SUN_RADIUS)).mul(P.sunIlluminance)
          .add(inscatter(p, d, P.moonDir, m, float(MOON_RADIUS)).mul(P.moonIlluminance).mul(P.moonPhase));
        step(L, T, S, m.extinction, dt);
      });
      prev.assign(t1);
    });
    textureStore(tables.aerial, uvec3(id.x, id.y, uint(i)), vec4(L, 1));
    textureStore(tables.aerial, uvec3(id.x, id.y, uint(i).add(AERIAL.z)), vec4(T, 1));
  });
});

/** A kernel dispatched over a w×h grid in groups of gw×gh threads. */
function dispatch(kernel: Node, w: number, h: number, gw = 8, gh = 8): ComputeNode {
  const k = kernel as unknown as { compute(size: number[], group: number[]): ComputeNode };
  return k.compute([Math.ceil(w / gw), Math.ceil(h / gh), 1], [gw, gh, 1]);
}

/** The compute passes, in the order they depend on one another. */
export const passes = {
  transmittance: dispatch(transmittanceKernel(), TRANSMITTANCE.x, TRANSMITTANCE.y),
  multi: dispatch(multiKernel(), MULTI.x, MULTI.y),
  irradiance: dispatch(irradianceKernel(), IRRADIANCE.x, IRRADIANCE.y),
  sky: dispatch(skyKernel(tables.sky, SKY, P.sunDir, P.sunIlluminance, SUN_RADIUS)(), SKY.x, SKY.y, 8, 4),
  moonSky: dispatch(skyKernel(tables.moonSky, MOON_SKY, P.moonDir, P.moonIlluminance.mul(P.moonPhase), MOON_RADIUS)(), MOON_SKY.x, MOON_SKY.y, 8, 4),
  aerial: dispatch(aerialKernel(), AERIAL.x, AERIAL.y),
};

// ---------------------------------------------------------------- reading the view tables

/** The sky's light along d from the eye, from the view tables (only meaningful while the eye is inside the air). */
export const skyFromTables = Fn(([d]: [V3]) => {
  const eye = EYE.position;
  const r = eye.length();
  const up = eye.div(r);
  const vz = up.dot(d);
  const across = d.sub(up.mul(vz));
  const acrossN = across.div(max(across.length(), 1e-5));
  const lightView = (l: V3) => {
    const la = l.sub(up.mul(up.dot(l)));
    return acrossN.dot(la.div(max(la.length(), 1e-5)));
  };
  const sun = texture(tables.sky, skyViewUV(r, vz, lightView(P.sunDir), float(SKY.x), float(SKY.y))).rgb;
  const moon = texture(tables.moonSky, skyViewUV(r, vz, lightView(P.moonDir), float(MOON_SKY.x), float(MOON_SKY.y))).rgb;
  return sun.add(moon);
});

/** The sky along d from an eye outside the air (or anywhere), marched directly: the light gathered (rgb) and how much
 *  of what lies beyond comes through (returned through the second output). */
export const skyMarched = Fn(([eye, d]: [V3, V3]) => {
  const shell = raySphere(eye, d, AIR.top);
  const L = vec3(0).toVar();
  const T = vec3(1).toVar();
  If(shell.y.greaterThan(0), () => {
    const start = max(shell.x, 0);
    const ground = raySphere(eye, d, AIR.bottom);
    const end = select(ground.x.greaterThan(0), ground.x, shell.y);
    const steps = 24;
    const dt = end.sub(start).div(steps);
    loop('s', steps, (i) => {
      const p = eye.add(d.mul(start.add(dt.mul(float(i).add(0.5)))));
      const m = mediumAt(p.length().sub(AIR.bottom));
      const S = inscatter(p, d, P.sunDir, m, float(SUN_RADIUS)).mul(P.sunIlluminance)
        .add(inscatter(p, d, P.moonDir, m, float(MOON_RADIUS)).mul(P.moonIlluminance).mul(P.moonPhase));
      step(L, T, S, m.extinction, dt);
    });
  });
  return vec4(L, T.dot(vec3(1 / 3)));
});

/** How much of the light from beyond the air reaches the eye along d (the sun's disc, the moon, the stars). */
export const viewTransmittance = Fn(([d]: [V3]) => {
  const eye = EYE.position;
  const r = eye.length();
  const T = vec3(0).toVar();
  If(r.lessThan(AIR.top), () => {
    T.assign(transmittance(r, eye.div(r).dot(d)));
  }).Else(() => {
    // from space, the ray crosses the shell: what it keeps is the transmittance from its nearest point outward, squared
    const b = eye.dot(d);
    const closest = eye.sub(d.mul(b));
    const rc = max(closest.length(), AIR.bottom);
    T.assign(select(b.lessThan(0), transmittance(rc, float(0)).mul(transmittance(rc, float(0))), vec3(1)));
  });
  const ground = raySphere(eye, d, AIR.bottom);
  return select(ground.x.greaterThan(0), vec3(0), T);
});

/** The aerial perspective between the eye and a point p it sees: rgb in-scattered light and rgb transmittance. */
export function aerialAt(p: V3): { light: V3; loss: V3 } {
  const eye = EYE.position;
  const v = p.sub(eye);
  const dist = v.length();
  const d = v.div(max(dist, 1e-4));
  const clip = EYE.viewProjection.mul(vec4(p, 1));
  const uv = clip.xy.div(max(abs(clip.w), 1e-4)).mul(0.5).add(0.5);
  const shell = raySphere(eye, d, AIR.top);
  const start = max(shell.x, 0);
  const w = sqrt(clamp(dist.sub(start).div(EYE.range), 0, 1));
  const half = 0.5 / AERIAL.z;
  // the slice, as a share of the light's half of the volume, kept off the half's edges so the filter never mixes in
  // the other half
  const z = clamp(w.sub(half), half, 1 - half).mul(0.5);
  const xy = vec2(clamp(uv.x, 0, 1), clamp(uv.y, 0, 1));
  // closer than the first slice's middle, fade the first slice's effect toward none
  const near = clamp(w.mul(AERIAL.z).mul(2), 0, 1);
  const light = texture3D(tables.aerial, vec3(xy, z)).rgb.mul(near);
  const loss = mix(vec3(1), texture3D(tables.aerial, vec3(xy, z.add(0.5))).rgb, near);
  const outside = shell.y.lessThan(0);
  return { light: select(outside, vec3(0), light), loss: select(outside, vec3(1), loss) };
}

// The atmosphere's lookup tables, integrated on the GPU (Hillaire 2020):
//   transmittance  256×64   light surviving from a height along a direction to the top of the air
//   multiple       32×32    light scattered more than once, per height and sun elevation
//   sky view       200×100  the sky's radiance round an eye at the sea, per direction relative to the sun
// The first two depend only on the air and are integrated once; the sky view is redone when the sun moves.
// Mappings and constants match atmosphere.ts, where the tests check them.

import {
  ClampToEdgeWrapping, HalfFloatType, LinearFilter, StorageTexture, type WebGPURenderer,
} from 'three/webgpu';
import {
  Fn, If, Loop, abs, acos, clamp, cos, dot, exp, float, instanceIndex, int, length, max, normalize, pow, select,
  sin, sqrt, texture, textureStore, uniform, uvec2, vec2, vec3, vec4,
} from 'three/tsl';
import * as A from './atmosphere';

// TSL nodes are dynamically typed; the tables are small enough that a loose alias reads better than casts.
type N = any;

/** A loop whose counter has its own name, so nested loops never read each other's counter. */
const loop = (name: string, count: number, body: (i: N) => void) =>
  (Loop as N)({ start: 0, end: count, type: 'int', condition: '<', name }, (v: N) => body(v[name]));

const H = Math.sqrt(A.TOP * A.TOP - A.BOTTOM * A.BOTTOM);
const RAYLEIGH = vec3(...A.RAYLEIGH_SCATTERING);
const OZONE = vec3(...A.OZONE_ABSORPTION);

const T_W = 256, T_H = 64, M_N = 32, V_W = 200, V_H = 100;

function table(w: number, h: number): StorageTexture {
  const t = new StorageTexture(w, h);
  t.type = HalfFloatType;
  t.minFilter = t.magFilter = LinearFilter;
  t.wrapS = t.wrapT = ClampToEdgeWrapping;
  t.generateMipmaps = false;
  return t;
}

const transmittanceTable = table(T_W, T_H);
const multipleTable = table(M_N, M_N);
const skyViewTable = table(V_W, V_H);

/** Nearest and farthest hits of a ray from o along unit d with a sphere of radius r at the origin; (-1,-1) if none. */
const raySphere = Fn(([o, d, r]: [N, N, N]) => {
  const b = dot(o, d), c = dot(o, o).sub(r.mul(r));
  const disc = b.mul(b).sub(c);
  const out = vec2(-1, -1).toVar();
  If(disc.greaterThanEqual(0), () => {
    const s = sqrt(disc);
    out.assign(vec2(b.negate().sub(s), b.negate().add(s)));
  });
  return out;
});

/** Rayleigh, Mie and ozone densities at height h. */
const densities = (h: N): N =>
  vec3(
    exp(h.negate().div(A.RAYLEIGH_SCALE_HEIGHT)),
    exp(h.negate().div(A.MIE_SCALE_HEIGHT)),
    max(float(1).sub(abs(h.sub(A.OZONE_CENTRE)).div(A.OZONE_HALF_WIDTH)), 0),
  );

const extinctionOf = (dens: N): N =>
  RAYLEIGH.mul(dens.x).add(float(A.MIE_EXTINCTION).mul(dens.y)).add(OZONE.mul(dens.z));

const rayleighPhase = (c: N): N => float(3 / (16 * Math.PI)).mul(c.mul(c).add(1));

/** Cornette-Shanks. */
const miePhase = (c: N): N => {
  const g = A.MIE_G, g2 = g * g;
  const k = (3 / (8 * Math.PI)) * (1 - g2) / (2 + g2);
  return float(k).mul(c.mul(c).add(1)).div(pow(float(1 + g2).sub(c.mul(2 * g)), 1.5));
};

const transmittanceUV = (r: N, mu: N): N => {
  const rho = sqrt(max(r.mul(r).sub(A.BOTTOM * A.BOTTOM), 0));
  const d = max(r.negate().mul(mu).add(sqrt(max(r.mul(r).mul(mu.mul(mu).sub(1)).add(A.TOP * A.TOP), 0))), 0);
  const dMin = float(A.TOP).sub(r), dMax = rho.add(H);
  return vec2(d.sub(dMin).div(dMax.sub(dMin)), rho.div(H));
};

/** Sunlight reaching radius r from a sun at cosine mu off the zenith; zero once the planet hides it. */
export const sunTransmittance = (radius: N, mu: N): N => {
  const r = float(radius);
  const horizon = sqrt(max(float(1).sub(float(A.BOTTOM * A.BOTTOM).div(r.mul(r))), 0)).negate();
  const t = texture(transmittanceTable).sample(transmittanceUV(r, mu)).level(float(0)).rgb;
  return select(mu.lessThan(horizon), vec3(0), t);
};

const multipleScattering = (r: N, muS: N): N =>
  texture(multipleTable)
    .sample(vec2(muS.mul(0.5).add(0.5), r.sub(A.BOTTOM).div(A.TOP - A.BOTTOM)))
    .level(float(0)).rgb;

const transmittanceKernel = Fn(() => {
  const x = instanceIndex.mod(T_W), y = instanceIndex.div(T_W);
  const u = float(x).add(0.5).div(T_W), v = float(y).add(0.5).div(T_H);
  const rho = v.mul(H), r = sqrt(rho.mul(rho).add(A.BOTTOM * A.BOTTOM));
  const dMin = float(A.TOP).sub(r), dMax = rho.add(H), d = dMin.add(u.mul(dMax.sub(dMin)));
  const mu = clamp(float(H * H).sub(rho.mul(rho)).sub(d.mul(d)).div(r.mul(d).mul(2)), -1, 1);
  const o = vec3(0, r, 0), dir = vec3(sqrt(max(float(1).sub(mu.mul(mu)), 0)), mu, 0);
  const STEPS = 40;
  const dt = d.div(STEPS);
  const depth = vec3(0).toVar();
  Loop(STEPS, ({ i }: { i: N }) => {
    const p = o.add(dir.mul(float(i).add(0.5).mul(dt)));
    depth.addAssign(extinctionOf(densities(length(p).sub(A.BOTTOM))).mul(dt));
  });
  textureStore(transmittanceTable, uvec2(x, y), vec4(exp(depth.negate()), 1));
})().compute(T_W * T_H, [64]);

/** Second-order light for an isotropic phase, and the transfer fms; Ψ = L₂ / (1 − fms) (Hillaire §5.5). */
const multipleKernel = Fn(() => {
  const x = instanceIndex.mod(M_N), y = instanceIndex.div(M_N);
  const muS = float(x).add(0.5).div(M_N).mul(2).sub(1);
  const r = float(A.BOTTOM).add(float(y).add(0.5).div(M_N).mul(A.TOP - A.BOTTOM));
  const o = vec3(0, r, 0), sun = vec3(sqrt(max(float(1).sub(muS.mul(muS)), 0)), muS, 0);
  const l2 = vec3(0).toVar(), fms = vec3(0).toVar();
  const DIRS = 64, STEPS = 20;
  loop('dir', DIRS, (dir) => {
    // Fibonacci sphere
    const k = float(dir).add(0.5);
    const z = float(1).sub(k.mul(2 / DIRS)), a = k.mul(Math.PI * (3 - Math.sqrt(5)));
    const s = sqrt(max(float(1).sub(z.mul(z)), 0));
    const d = vec3(s.mul(cos(a)), z, s.mul(sin(a))).toVar();
    const ground = raySphere(o, d, float(A.BOTTOM)).x.toVar();
    const hitsGround = ground.greaterThan(0);
    const tMax = select(hitsGround, ground, raySphere(o, d, float(A.TOP)).y);
    const dt = tMax.div(STEPS).toVar();
    const T = vec3(1).toVar();
    loop('step', STEPS, (step) => {
      const p = o.add(d.mul(float(step).add(0.5).mul(dt)));
      const rp = length(p);
      const dens = densities(rp.sub(A.BOTTOM));
      const scattering = RAYLEIGH.mul(dens.x).add(float(A.MIE_SCATTERING).mul(dens.y));
      const ext = extinctionOf(dens);
      const stepT = exp(ext.negate().mul(dt));
      const sunT = sunTransmittance(rp, dot(p.div(rp), sun));
      const S = scattering.mul(sunT).mul(1 / (4 * Math.PI));
      l2.addAssign(T.mul(S.sub(S.mul(stepT)).div(ext)));
      fms.addAssign(T.mul(scattering.sub(scattering.mul(stepT)).div(ext)));
      T.mulAssign(stepT);
    });
    If(hitsGround, () => {
      const p = o.add(d.mul(ground));
      const n = normalize(p);
      l2.addAssign(T.mul(sunTransmittance(float(A.BOTTOM), dot(n, sun))).mul(max(dot(n, sun), 0)).mul(A.GROUND_ALBEDO / Math.PI));
    });
  });
  l2.divAssign(DIRS);
  fms.divAssign(DIRS);
  textureStore(multipleTable, uvec2(x, y), vec4(l2.div(float(1).sub(fms)), 1));
})().compute(M_N * M_N, [64]);

// Sky view (Hillaire §5.3): latitude packed toward the horizon, longitude round the sun packed toward it.
const VIEW_R = A.BOTTOM + A.VIEW_HEIGHT;
const COS_BETA = Math.sqrt(VIEW_R * VIEW_R - A.BOTTOM * A.BOTTOM) / VIEW_R;
const BETA = Math.acos(COS_BETA);
const ZENITH_HORIZON = Math.PI - BETA;

/** Cosine of the sun's zenith angle the sky view was last integrated for. */
const sunCosZenith = uniform(1);

const skyViewKernel = Fn(() => {
  const x = instanceIndex.mod(V_W), y = instanceIndex.div(V_W);
  const u = float(x).add(0.5).div(V_W), v = float(y).add(0.5).div(V_H);
  const zenithAngle = float(0).toVar();
  If(v.lessThan(0.5), () => {
    const c = float(1).sub(v.mul(2));
    zenithAngle.assign(float(ZENITH_HORIZON).mul(float(1).sub(c.mul(c))));
  }).Else(() => {
    const c = v.mul(2).sub(1);
    zenithAngle.assign(float(ZENITH_HORIZON).add(float(BETA).mul(c.mul(c))));
  });
  const cosLight = u.mul(u).mul(2).sub(1).negate();
  const sz = sin(zenithAngle);
  const d = vec3(sz.mul(cosLight), cos(zenithAngle), sz.mul(sqrt(max(float(1).sub(cosLight.mul(cosLight)), 0))));
  const muS = sunCosZenith;
  const sun = vec3(sqrt(max(float(1).sub(muS.mul(muS)), 0)), muS, 0);
  const o = vec3(0, VIEW_R, 0);
  const ground = raySphere(o, d, float(A.BOTTOM)).x;
  const tMax = select(ground.greaterThan(0), ground, raySphere(o, d, float(A.TOP)).y);
  const c = dot(d, sun);
  const pR = rayleighPhase(c), pM = miePhase(c);
  const L = vec3(0).toVar(), T = vec3(1).toVar();
  const STEPS = 30;
  Loop(STEPS, ({ i }: { i: N }) => {
    // quadratic spacing: fine near the eye, coarse far away
    const t0 = float(i).div(STEPS), t1 = float(i).add(1).div(STEPS);
    const dt = t1.mul(t1).sub(t0.mul(t0)).mul(tMax);
    const t = t0.add(t1.sub(t0).mul(0.3));
    const p = o.add(d.mul(t.mul(t).mul(tMax)));
    const rp = length(p);
    const dens = densities(rp.sub(A.BOTTOM));
    const sR = RAYLEIGH.mul(dens.x), sM = float(A.MIE_SCATTERING).mul(dens.y);
    const ext = extinctionOf(dens);
    const stepT = exp(ext.negate().mul(dt));
    const muP = dot(p.div(rp), sun);
    const S = sR.mul(pR).add(sM.mul(pM)).mul(sunTransmittance(rp, muP))
      .add(sR.add(sM).mul(multipleScattering(rp, muP)));
    L.addAssign(T.mul(S.sub(S.mul(stepT)).div(ext)));
    T.mulAssign(stepT);
  });
  textureStore(skyViewTable, uvec2(x, y), vec4(L, 1));
})().compute(V_W * V_H, [64]);

/** The sky's radiance toward world direction dir (unit, y up) for a sun at sunDir, per unit sun illuminance. */
export const skyRadiance = (dir: N, sunDir: N): N => {
  const cosZenith = clamp(dir.y, -1, 1);
  const zenithAngle = acos(cosZenith);
  const v = float(0).toVar();
  If(zenithAngle.lessThan(ZENITH_HORIZON), () => {
    const c = sqrt(float(1).sub(zenithAngle.div(ZENITH_HORIZON)));
    v.assign(float(1).sub(c).mul(0.5));
  }).Else(() => {
    v.assign(sqrt(clamp(zenithAngle.sub(ZENITH_HORIZON).div(BETA), 0, 1)).mul(0.5).add(0.5));
  });
  const flat = (w: N) => w.xz.div(max(length(w.xz), 1e-4));
  const cosLight = dot(flat(dir), flat(sunDir));
  const u = sqrt(cosLight.mul(-0.5).add(0.5));
  // keep half a texel off each edge so the bilinear lookup never reads across the wrap
  const uv = vec2(clamp(u, 0.5 / V_W, 1 - 0.5 / V_W), clamp(v, 0.5 / V_H, 1 - 0.5 / V_H));
  return texture(skyViewTable).sample(uv).level(float(0)).rgb;
};

/** Radius of the eye for sampling transmittance from the sea. */
export const VIEW_RADIUS = VIEW_R;

export function createTables(renderer: WebGPURenderer) {
  renderer.compute(transmittanceKernel);
  renderer.compute(multipleKernel);
  let lastCos = NaN;
  return {
    /** Re-integrates the sky view when the sun has moved. */
    update(sunY: number) {
      if (Math.abs(sunY - lastCos) < 1e-4) return;
      lastCos = sunY;
      sunCosZenith.value = sunY;
      renderer.compute(skyViewKernel);
    },
  };
}

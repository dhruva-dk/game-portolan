// What the eye sees where nothing stands in front of it: the air's own light, and, through it, the sun's disc, the
// moon with its phase and its seas, the stars and the band of the galaxy turning with the hour, and the aurora.
//
// Inside the air the sky comes from the sky view tables; from orbit it is marched per pixel, which is only ever the
// thin rim round the globe and the black beyond.
import { Vector3, type Node } from 'three/webgpu';
import {
  Fn, If, abs, clamp, cos, dot, exp, float, floor, fract, max, mix, mx_fractal_noise_float, positionWorldDirection, pow,
  select, sin, smoothstep, sqrt, vec2, vec3, vec4, cross, normalize, length, uniform, renderGroup,
} from 'three/tsl';
import { AIR, raySphere } from './model.ts';
import { EYE, MOON_RADIUS, SUN_RADIUS, lightTransmittance, skyFromTables, skyIrradiance, skyMarched, viewTransmittance } from './luts.ts';
import { P } from '../gpu/uniforms.ts';
import { auroraAlong } from './aurora.ts';

type F = Node<'float'>;
type V3 = Node<'vec3'>;

/** How far the sky has turned since noon at longitude 0, radians: the stars wheel with the sun. */
export const skyTurn = uniform(0).setGroup(renderGroup);

/** Limb darkening's linear coefficient: the sun's rim is this much dimmer than its middle. */
const LIMB = 0.6;

/** The sun's disc, as radiance: its illuminance spread over its solid angle, darker toward the rim. */
export const sunDisc = Fn(([d]: [V3]) => {
  const c = d.dot(P.sunDir);
  const chord = sqrt(max(float(2).sub(c.mul(2)), 0));
  const x = chord.div(SUN_RADIUS);
  // the edge is softened by about a pixel at the deck's field of view
  const inside = float(1).sub(smoothstep(0.94, 1.0, x));
  const mu = sqrt(max(float(1).sub(x.mul(x)), 0));
  const limb = float(1).sub(float(LIMB).mul(float(1).sub(mu)));
  const radiance = P.sunIlluminance.div(Math.PI * SUN_RADIUS * SUN_RADIUS * (1 - LIMB / 3));
  return radiance.mul(limb.mul(inside));
});

/** The moon: a sphere far off lit by the sun, so its phase is simply where the sun is. Its face keeps to the eye, with
 *  dark seas and bright highlands. Returns radiance (rgb) and its coverage (a), since it hides the stars behind it. */
export const moonDisc = Fn(([d]: [V3]) => {
  const m = P.moonDir;
  const c = d.dot(m);
  const q = d.sub(m.mul(c)).div(MOON_RADIUS);
  const x = length(q);
  const cover = float(1).sub(smoothstep(0.93, 1.0, x)).mul(select(c.greaterThan(0), float(1), float(0)));
  const n = q.add(m.negate().mul(sqrt(max(float(1).sub(x.mul(x)), 0)))).normalize();
  // the moon's own frame, so its seas keep their places as it crosses the sky
  const face = m.negate();
  const east = normalize(cross(vec3(0, 1, 0), face).add(vec3(1e-4, 0, 0)));
  const north = cross(face, east);
  const local = vec3(n.dot(east), n.dot(north), n.dot(face));
  const seas = smoothstep(-0.05, 0.3, mx_fractal_noise_float(local.mul(1.6), 4, 2.1, 0.55, 1));
  const pits = smoothstep(0.35, 0.75, mx_fractal_noise_float(local.mul(9.0).add(7.3), 3, 2.2, 0.5, 1));
  const albedo = float(0.15).mul(float(1).sub(seas.mul(0.5))).mul(float(0.82).add(pits.mul(0.18)));
  // Lommel–Seeliger, the moon's own law: no darkening toward the rim, which is why a full moon looks like a flat coin
  const mu0 = max(n.dot(P.sunDir), 0);
  const muv = max(n.dot(face), 1e-3);
  const lit = mu0.div(mu0.add(muv)).mul(2);
  // earthshine on the dark part, from the lit planet behind the eye
  const shine = float(0.0025).mul(float(1).sub(mu0.mul(4)).max(0));
  const radiance = P.sunIlluminance.mul(albedo.div(Math.PI)).mul(lit.add(shine));
  return vec4(radiance.mul(cover), cover);
});

/** The cosine of the angle from the moon's middle past which its disc (and its soft edge) has nothing to draw. */
const MOON_NEAR = Math.cos(MOON_RADIUS * 1.05);

const hash = (p: V3): F => fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))).mul(43758.5453));

/** The galaxy's plane, fixed among the stars. */
const GALAXY = vec3(0.32, 0.78, 0.54).normalize();

/** The direction d as it sits among the stars: the sky turned back by the hour. */
const amongStars = (d: V3): V3 => {
  const a = skyTurn;
  const ca = cos(a), sa = sin(a);
  return vec3(d.x.mul(ca).sub(d.z.mul(sa)), d.y, d.z.mul(ca).add(d.x.mul(sa)));
};

/** The band of the galaxy: a diffuse glow along a great circle, torn by dark lanes of dust. */
const galaxy = (s: V3): { glow: V3; band: F } => {
  const lat = s.dot(GALAXY);
  const band = exp(lat.mul(lat).div(-0.035));
  const cloud = mx_fractal_noise_float(s.mul(5.0), 5, 2.0, 0.55, 1).mul(0.5).add(0.5);
  const dust = smoothstep(0.05, 0.45, mx_fractal_noise_float(s.mul(13.0).add(3.1), 4, 2.0, 0.5, 1));
  const core = exp(s.dot(vec3(0.8, -0.1, -0.59).normalize()).sub(1).mul(4));
  const glow = vec3(0.75, 0.8, 1.0).mul(band.mul(clamp(cloud, 0, 1)).mul(float(1).sub(dust.mul(0.7))).mul(core.mul(2).add(0.5)));
  return { glow: glow.mul(0.00012), band };
};

/** Stars: one at most in each cell of a grid on the cube round the sky, most too faint to see, a few bright, coloured
 *  by temperature, scintillating with the air. Denser along the galaxy. */
export const stars = Fn(([d]: [V3]) => {
  const s = amongStars(d);
  const a = abs(s);
  const onX = a.x.greaterThanEqual(a.y).and(a.x.greaterThanEqual(a.z));
  const onY = a.y.greaterThanEqual(a.z).and(onX.not());
  const face = select(onX, select(s.x.greaterThan(0), float(0), float(1)), select(onY, select(s.y.greaterThan(0), float(2), float(3)), select(s.z.greaterThan(0), float(4), float(5))));
  const major = select(onX, a.x, select(onY, a.y, a.z));
  const uv = select(onX, vec2(s.y, s.z), select(onY, vec2(s.x, s.z), vec2(s.x, s.y))).div(major);
  const N = 150;
  const g = uv.mul(0.5).add(0.5).mul(N);
  const cell = floor(g);
  const key = vec3(cell, face);
  const h1 = hash(key), h2 = hash(key.add(vec3(17.1, 3.7, 9.2))), h3 = hash(key.add(vec3(5.3, 41.9, 2.4))), h4 = hash(key.add(vec3(29.7, 13.1, 7.7)));
  const centre = cell.add(vec2(h1, h2).mul(0.6).add(0.2));
  // the angle across a cell shrinks toward a face's corners; correct the star's size for it
  const stretch = float(1).add(uv.dot(uv));
  const dist = length(g.sub(centre)).mul(2 / N).div(stretch);
  const { glow, band } = galaxy(s);
  const present = h3.lessThan(float(0.3).add(band.mul(0.35)));
  // a few bright, most faint: well below the day sky's light, and found again by the eye's adaptation at night
  const magnitude = pow(h4, 18).mul(0.05).add(pow(h4, 4).mul(0.002)).add(0.00012);
  const size = float(0.0009).add(pow(h4, 10).mul(0.0009));
  const core = exp(dist.mul(dist).div(size.mul(size)).negate());
  const tint = mix(vec3(1.0, 0.72, 0.5), vec3(0.72, 0.82, 1.0), smoothstep(0.2, 0.8, hash(key.add(vec3(2.2, 8.8, 1.1)))));
  // scintillation is strongest near the horizon, where the light crosses the most air
  const eye = EYE.position;
  const up = eye.div(max(eye.length(), 1));
  const low = float(1).sub(clamp(d.dot(up), 0, 1));
  const twinkle = float(1).sub(low.mul(0.45).mul(sin(P.time.mul(float(3).add(h1.mul(9))).add(h2.mul(60))).mul(0.5).add(0.5)));
  const star = tint.mul(magnitude.mul(core).mul(twinkle)).mul(select(present, float(1), float(0)));
  return star.add(glow);
});

/** Where the reflection probe is taken: over the sea below the eye, however high the eye is, since the probe is what
 *  the surfaces down there reflect. */
export const probeEye = uniform(new Vector3(0, 600, 0)).setGroup(renderGroup);

/** How much of the stars the eye makes out against the air's own light along the same line: a star is a point the
 *  eye must tell from its background, so they go out one by one as the twilight brightens, the faint first. */
const starsSeen = (L: V3) => float(1).sub(smoothstep(0.002, 0.025, dot(L, vec3(0.2126, 0.7152, 0.0722))));

/** The sky along d from the eye: the air's light, and what lies beyond it as much as the air lets through. */
export const skyRadiance = Fn(([d]: [V3]) => {
  const eye = EYE.position;
  const L = vec3(0).toVar();
  If(eye.length().lessThan(AIR.top.sub(0.5)), () => {
    L.assign(skyFromTables(d));
  }).Else(() => {
    L.assign(skyMarched(eye, d).rgb);
  });
  // the moon's face and the stars are worked out only where they show: the moon's within its disc, the stars where
  // the air is dark enough to make them out (by day, nowhere), so the sky pays for neither most of the time
  const beyond = sunDisc(d).add(auroraAlong(eye, d)).toVar();
  const hidden = float(0).toVar();
  If(d.dot(P.moonDir).greaterThan(MOON_NEAR), () => {
    const moon = moonDisc(d);
    beyond.addAssign(moon.rgb);
    hidden.assign(moon.a);
  });
  const seen = starsSeen(L).mul(float(1).sub(hidden)).toVar();
  If(seen.greaterThan(0), () => {
    beyond.addAssign(stars(d).mul(seen));
  });
  return L.add(viewTransmittance(d).mul(beyond));
});

/** The scene's background: the sky in every direction no surface covers. */
export const skyBackground = vec4(skyRadiance(positionWorldDirection), 1);

/** The sky the reflection probe is taken of, marched from the probe's own place. It leaves the sun's disc out: the
 *  sun's own light draws its highlight, sharp, and a disc blurred into the probe would only smear a second one. Below
 *  the horizon is the sea, as the sea looks from there: the sky mirrored in it by Fresnel's share, over the light the
 *  water scatters back up. (Left as the planet's dark ground, it put black flecks on every wave whose reflection
 *  dipped below the horizon.) */
export const probeBackground = Fn(() => {
  const d = positionWorldDirection;
  const eye = probeEye;
  const marched = skyMarched(eye, d);
  const ground = raySphere(eye, d, AIR.bottom);
  const beyond = vec3(0).toVar();
  If(ground.x.greaterThan(0), () => {
    const p = eye.add(d.mul(ground.x));
    const n = p.normalize();
    const cosI = max(d.dot(n).negate(), 0);
    const mirrored = d.add(n.mul(cosI.mul(2)));
    const fresnel = float(0.02).add(pow(float(1).sub(cosI), 5).mul(0.98));
    const sky = skyMarched(p.add(n.mul(0.05)), mirrored).rgb;
    const r = p.length();
    const body = (l: V3, illuminance: V3, size: number) =>
      skyIrradiance(p, n, l).add(lightTransmittance(r, n.dot(l), float(size)).mul(max(n.dot(l), 0))).mul(illuminance);
    const down = body(P.sunDir, P.sunIlluminance, SUN_RADIUS).add(body(P.moonDir, P.moonIlluminance.mul(P.moonPhase), MOON_RADIUS));
    beyond.assign(sky.mul(fresnel).add(down.mul(P.seaDeep).div(Math.PI).mul(float(1).sub(fresnel))));
  }).Else(() => {
    // the aurora too, which the sea under it mirrors
    beyond.assign(auroraAlong(eye, d));
    const hidden = float(0).toVar();
    If(d.dot(P.moonDir).greaterThan(MOON_NEAR), () => {
      const moon = moonDisc(d);
      beyond.addAssign(moon.rgb);
      hidden.assign(moon.a);
    });
    const seen = starsSeen(marched.rgb).mul(float(1).sub(hidden)).toVar();
    If(seen.greaterThan(0), () => {
      beyond.addAssign(stars(d).mul(seen));
    });
  });
  return vec4(marched.rgb.add(beyond.mul(marched.a)), 1);
})();

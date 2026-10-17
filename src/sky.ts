// Sky, atmosphere, celestial bodies, clouds, lightning, lighting, shadows and the day/weather clock.
// Owns the shared uniforms every custom shader reads, the light registry, and the GLSL helpers other
// modules include (COMMON_GLSL, WIND_GLSL, SKY_GLSL, SHADOW_GLSL, POINT_LIGHTS_GLSL).
//
// The sun and moon run on real arcs in a frame carried along with the player, so the local hour is the
// player's anywhere on the planet and the terminator is a true great circle. The atmosphere is a
// single-scattering Rayleigh/Mie/ozone shell rendered into a sky-view LUT each frame; clouds are a
// ray-marched shell at reduced resolution with temporal reprojection. A live sky cube (one face a
// frame, mipmapped) is both the reflection source and the image-based light. three's fog and light
// chunks are patched globally so every built-in material gets the same aerial perspective, planet
// shadow (terminator), atmospheric light colour, cloud shadows, sky light and night-side ambient.
import * as THREE from 'three';
import { SunLight } from 'three/addons/lights/SunLight.js';
import { R, Rng, smoothstep, wind, type V3 } from './sim.ts';
import { LAYER } from './post.ts';
import type { Ctx, Frame } from './main.ts';

/** Length of one full day/night loop in seconds at normal speed. */
export const CYCLE_SECONDS = 480;

/** A point light source registered by any module (lanterns, beacons, windows, lava). */
export interface LightSource {
  pos: THREE.Vector3; // world position, updated by the owner every frame
  color: THREE.Color; // linear RGB
  intensity: number; // owner-controlled, 0 = off; THREE.PointLight intensity (candela, physical decay 2)
  range: number; // world units, light reaches zero here
}

/** Lighting and weather state for the current frame. Read-only for every other module. */
export interface Env {
  hour: number; // local solar time at the player, 0..24
  sunDir: THREE.Vector3; // world-space unit vector towards the sun
  moonDir: THREE.Vector3; // world-space unit vector towards the moon
  ambient: THREE.Color; // average sky radiance over the upper hemisphere
  night: number; // 0 full day … 1 deep night (drives lanterns, beacons, bioluminescence)
  storm: number; // 0..1 storm intensity at the player
  rain: number; // 0..1
  wet: number; // 0..1 surface wetness, lags the rain and dries slowly through sunset
  lightning: number; // 0..1 flash brightness this frame (already scaled by distance)
  lightningPos: THREE.Vector3; // world position of the latest strike (middle of the channel)
  strikes: number; // strikes so far; a change means a new flash (thunder delay = distance / speed of sound)
  windDir: THREE.Vector3; // wind at the player (tangent, length = strength)
  exposure: number; // scene exposure for this hour; post applies it, then grades by hour/weather
}

/** Size of the point-light arrays in the shared uniforms. */
export const MAX_LIGHTS = 16;
/** Registry entries that also become real THREE.PointLights for the built-in materials. */
const POINT_LIGHTS = 6;

// ---------------------------------------------------------------------------------------------
// Sun and moon paths: a real arc about a celestial pole tilted by the latitude (noon sun at 60°), but
// the hour angle is a smooth curve through the hour rather than a straight line, so every hour lands on
// its look: the glow building at 4.8 (sun −14°), rose twilight at 5.5 (−5°), sunrise pastels at 6.5
// (+3°), golden light at 17.5 (+5°), the disc low in the chase view with the sky on fire at 18.8
// (−2.5°), blue hour at 19.6 (−12°); the sun lingers where the light is best. The moon is a waxing
// gibbous, up from late afternoon until it sets in the west during the pre-dawn glow.
const LAT = THREE.MathUtils.degToRad(27);
const SUN_DEC = THREE.MathUtils.degToRad(-2.9);
const MOON_DEC = THREE.MathUtils.degToRad(8);
const MOON_LAG = THREE.MathUtils.degToRad(170);
// [hour, sun hour angle in degrees]
const SOLAR: [number, number][] = [
  [0.2, -180], [4.8, -104.2], [5.5, -94.1], [6.5, -85.1], [9, -54], [12.2, 0], [17.5, 82.9], [18.8, 91.3], [19.6, 102], [23, 146.6],
];
/** Sun irradiance above the atmosphere (≈3 of white light at noon after extinction). */
const SUN_E = new THREE.Vector3(1.0, 1.12, 1.2).multiplyScalar(3.6);
/** Full-moon irradiance as a fraction of the sun's (stylised so a moonlit night reads), and its silver tint. */
const MOON_E = 0.11;
const MOON_TINT = new THREE.Vector3(0.8, 0.95, 1.25);

// Day pacing: [hour at knot, seconds to the next knot]. Golden hour, sunset and the storm get the most
// screen time; the hour is a monotone cubic through the knots so the sun never jerks.
const PACE: [number, number][] = [
  [3.8, 30], // pre-dawn: the glow builds on the curved horizon
  [4.8, 45], // dawn
  [6.5, 28], // morning
  [9.0, 28], // midday
  [12.5, 24], // the storm builds upwind
  [14.0, 60], // the storm
  [16.0, 26], // clearing
  [17.0, 65], // golden hour
  [18.2, 45], // sunset: the sky burns as the disc sinks towards the curved horizon
  [19.3, 36], // blue hour
  [20.4, 93], // night
];

// Fair-weather cloud cover and horizon haze (optical depth at the sea horizon) through the day.
const COVER: [number, number][] = [
  [0, 0.3], [4.8, 0.36], [7, 0.26], [10, 0.3], [12.5, 0.42], [16, 0.5], [17.4, 0.46], [18.8, 0.6], [20, 0.4], [21.5, 0.3], [24, 0.3],
];
const HAZE: [number, number][] = [
  [0, 1.0], [4.2, 1.2], [5.4, 1.6], [7, 0.8], [9, 0.45], [12, 0.45], [13.5, 0.8], [17.2, 1.2], [18.8, 1.4], [20, 1.2], [24, 1.0],
];
// Aerosol (Mie density multiplier): the dawn mist, and the warm haze that softens the golden hour and
// sets the sunset sky on fire.
const AEROSOL: [number, number][] = [
  [0, 1.2], [4.5, 1.5], [5.5, 2.0], [6.5, 1.6], [8, 1.1], [12.5, 1.0], [16, 1.3], [17.5, 1.8], [18.8, 3.0], [19.6, 1.8], [21, 1.3], [24, 1.2],
];
// Exposure by the sun's elevation (degrees): a deliberate curve rather than full adaptation, so night is
// dark and moonlit, blue hour deep, and a sunset sky never washes out.
const EXPOSURE: [number, number][] = [[-90, 2.3], [-25, 2.3], [-16, 2.2], [-10, 1.9], [-5, 1.65], [-1, 1.45], [3, 1.3], [10, 1.2], [22, 1.0], [90, 0.95]];
// Storm track: arc (radians) from the player to the storm centre, upwind positive. It crosses the
// player at 15:00 and spends the night on the far side of the planet.
const STORM: [number, number][] = [[3.8, Math.PI], [12, 0.95], [14, 0.25], [15, 0], [16, -0.25], [17, -0.75], [27.8, -Math.PI]];
// The storm cell: full overcast within 0.25 rad (50 units) of its centre, fading out by 0.55 rad.
const STORM_IN = Math.cos(0.25).toFixed(4);
const STORM_OUT = Math.cos(0.55).toFixed(4);

// ---------------------------------------------------------------------------------------------
// Atmosphere, in world units (R = 200 at sea level). Thick on purpose: the camera hovers a few percent
// of the radius above the sea, so it must sit in the lower atmosphere, and the shell glows from orbit.
const ATM = {
  hr: 13, // Rayleigh scale height
  hm: 3, // Mie (haze) scale height
  ho: 25, // ozone scale height
  top: R + 110,
  br: [0.0062, 0.0142, 0.0333], // Rayleigh scattering per unit at sea level
  bm: 0.009, // Mie scattering per unit at sea level (extinction bm / 0.9)
  bo: [0.0015, 0.0042, 0.0002], // ozone absorption: what keeps the twilight sky blue
};
const LUT_W = 192;
const LUT_H = 96;
const NOISE = 128;
const CUBE = 128;
const SHADOW_SIZE = 2048; // key-light shadow map per cascade (the two cascades sit side by side)
const COVER_RES = 256; // cumulus cover per cube face: ~1.4 units a texel at the cloud base, so domes never facet
const CLOUD_LO = 13; // lowest storm base
const CLOUD_HI = 63; // anvil tops
const CLOUD_ROWS = 360; // the cloud march resolution follows the view height, not the pixel ratio
const SUN_RADIUS = 0.0095; // radians
const MOON_RADIUS = 0.017;
const MOON_SKY = 0.2; // moonlight's share in the sky's own glow: dark night skies over moonlit seas
const SKY_MS = 0.06; // multiple-scattering fill, as a share of the direct light

const glslVec3 = (v: number[]) => `vec3(${v.map((x) => x.toPrecision(6)).join(', ')})`;

// ---------------------------------------------------------------------------------------------
/** Uniforms shared by reference across all custom shaders. Updated once per frame here. */
const U = {
  uTime: { value: 0 }, // render clock, seconds
  uSimTime: { value: 0 }, // sim clock, seconds (interpolated), drives the wind field
  uPlanetR: { value: R },
  uCamPos: { value: new THREE.Vector3() },
  uKeyDir: { value: new THREE.Vector3(0, 1, 0) }, // whichever of sun/moon lights the scene and casts the shadows
  // key irradiance at the player (linear, atmosphere and storm included; ~0 in the twilight handover)
  uKeyColor: { value: new THREE.Color(1, 1, 1) },
  uAmbient: { value: new THREE.Color(0.3, 0.4, 0.5) }, // = env.ambient (sky radiance)
  uNight: { value: 0 },
  uStorm: { value: 0 },
  uRain: { value: 0 },
  uLightning: { value: 0 },
  uLightningPos: { value: new THREE.Vector3() },
  // nearest registered point lights (lanterns, beacons, windows), intensity folded into colour,
  // faded out before they drop off the list; POINT_LIGHTS_GLSL declares and sums them
  uLightPos: { value: Array.from({ length: MAX_LIGHTS }, () => new THREE.Vector3()) },
  uLightColor: { value: Array.from({ length: MAX_LIGHTS }, () => new THREE.Color(0, 0, 0)) },
  uLightRange: { value: new Array<number>(MAX_LIGHTS).fill(1) },
  uLightCount: { value: 0 },
  // key-light cascaded shadow map (sampler2DShadow), valid once uShadowOn is 1; see SHADOW_GLSL
  tKeyShadow: { value: null as THREE.Texture | null },
  uKeyShadowMatrix: { value: new THREE.Matrix4() }, // near cascade
  uKeyShadowMatrixFar: { value: new THREE.Matrix4() },
  uKeyShadowSplit: { value: new THREE.Vector4() }, // near cascade: (unused, end, fade start) view depths
  uShadowOn: { value: 0 },
  // raw sky + clouds around the player, sampled with world directions (reflections)
  tSkyCube: { value: null as THREE.Texture | null },
  // everything SKY_GLSL needs; built-in materials receive the same object
  uSky: { value: skyState() },
};
export type SharedUniforms = typeof U;

function skyState() {
  return {
    sunDir: new THREE.Vector3(0, 1, 0),
    moonDir: new THREE.Vector3(0, -1, 0),
    sunE: SUN_E.clone(),
    moonE: new THREE.Vector3(),
    lutX: new THREE.Vector3(1, 0, 0), // sky-view LUT frame: towards the sun's azimuth, and across
    lutY: new THREE.Vector3(0, 0, 1),
    fogTint: new THREE.Vector3(1, 1, 1),
    sunHaze: new THREE.Vector3(), // warm forward-scattered haze around the sun
    stormCenter: new THREE.Vector3(0, -1, 0),
    focusUp: new THREE.Vector3(0, 1, 0), // the player's vertical
    fog: new THREE.Vector4(1.4, 3.5, 10, 1), // horizon optical depth, distance exponent, haze scale height, Mie density
    cloud: new THREE.Vector4(0.3, 0.85, 0, 0), // cover, shadow strength, noise drift, unused
    cloudRot: new THREE.Matrix3(), // world → wind-carried cloud field
    ambInv: 1, // 1 / daylight level at the player
    wet: 0,
    altMoon: 1, // 1 while the unshadowed second light is the moon
    lightning: 0, // flash brightness this frame (env.lightning)
    nearby: 1, // how much the player's sky is shared by everything around (1 near the sea, 0 from high up)
    reach: new THREE.Vector2(0.62, 0.9), // cosines of the angles from the player where that sharing ends / is full
    lut: null as THREE.Texture | null,
    trans: null as THREE.Texture | null, // optical depths by altitude and angle
    cover: null as THREE.Texture | null, // fair-weather cumulus cover by direction, baked from the noise
    env: null as THREE.Texture | null, // the live sky cube with mipmaps: image-based light for every material
    noise: null as THREE.Texture | null,
  };
}

// ---------------------------------------------------------------------------------------------
/** Hashes and noise shared by every shader. */
export const COMMON_GLSL = /* glsl */ `
float hash13(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float vnoise(vec3 p) {
  vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash13(i), hash13(i + vec3(1,0,0)), f.x), mix(hash13(i + vec3(0,1,0)), hash13(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash13(i + vec3(0,0,1)), hash13(i + vec3(1,0,1)), f.x), mix(hash13(i + vec3(0,1,1)), hash13(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float fbm(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * vnoise(p); p *= 2.03; a *= 0.5; } return s; }
const vec3 BIOLUM = vec3(0.1, 0.8, 1.0); // bioluminescence, shared by the sea and its sparks
`;

/** GLSL mirror of sim.ts wind(): vec3 windAt(vec3 unitDir, float simTime). Keep the two identical. */
export const WIND_GLSL = /* glsl */ `
vec3 windAt(vec3 p, float t) {
  float y = p.y, c2 = 1.0 - y * y;
  float zonal = -(8.0 * c2 * c2 - 8.0 * c2 + 1.0);
  float merid = -0.5 * y * (1.0 - 4.0 * y * y);
  vec3 w = vec3(zonal * p.z - merid * p.x * y, merid * c2, -zonal * p.x - merid * p.z * y);
  float ang = t * 0.013;
  vec3 A = vec3(cos(ang) * 0.8, 0.6, sin(ang) * 0.8);
  w += 0.45 * cross(A, p);
  float g = 1.0 + 0.22 * sin(t * 0.37 + p.x * 6.1 + p.z * 4.3) * sin(t * 0.23 + p.y * 5.7 - p.x * 3.1);
  return (w - dot(w, p) * p) * 0.9 * g;
}
`;

/**
 * Atmosphere, terminator, clouds and haze for any shader. Spread `...ctx.sky.u` into the uniforms
 * (it carries the `uSky` struct) and paste this once (it is include-guarded, and three's
 * <fog_pars_fragment> / <lights_pars_begin> chunks already contain it). Built-in materials get all of
 * this automatically. Functions:
 *   vec3 skyFog(vec3 color, vec3 worldPos)       aerial perspective seen from cameraPosition (apply last;
 *                                                affine in color, so premultiplied blends can split it)
 *   vec3 skyKeyVisibility(vec3 worldPos, vec3 L) planet shadow × atmospheric colour × cloud and storm
 *                                                shadow for the sun/moon in direction L; multiply the
 *                                                *unattenuated* light (uSky.sunE / uSky.moonE) by it
 *   float skyCloudShadow(vec3 worldPos, vec3 L)  soft fair-weather cloud shadow only (use with uKeyColor)
 *   float skyPlanetShadow(vec3 worldPos, vec3 L) 0 beyond the terminator (the light is below the horizon)
 *   vec3 skyTransmittance(vec3 worldPos, vec3 L) colour of light through the atmosphere
 *   float skyAmbientScale(vec3 worldPos)         ambient relative to the player's (dark on the night side)
 *   bool skySunKey(), vec3 skyFlash()            the sun is the key light; a lightning flash's irradiance
 *   vec3 skyFogColor(vec3 viewDir)               the horizon haze colour in a direction
 *   vec3 skyIrradiance(vec3 n), vec3 skyRadiance(vec3 viewRay, vec3 n, float roughness)
 *                                                sky light from the live cube (world space)
 */
export const SKY_GLSL = /* glsl */ `
#ifndef SKY_GLSL
#define SKY_GLSL
#define SKY_R ${R.toFixed(1)}
#define SKY_TOP ${ATM.top.toFixed(1)}
#define SKY_PI 3.14159265
#define SKY_HR ${ATM.hr.toFixed(1)}
#define SKY_HM ${ATM.hm.toFixed(1)}
#define SKY_HO ${ATM.ho.toFixed(1)}
#define SKY_BM ${ATM.bm.toPrecision(6)}
#define SKY_LUT_H ${LUT_H}.0
#define SKY_MS ${SKY_MS}
const vec3 SKY_BR = ${glslVec3(ATM.br)};
const vec3 SKY_BO = ${glslVec3(ATM.bo)};
struct SkyState {
  vec3 sunDir;
  vec3 moonDir;
  vec3 sunE;
  vec3 moonE;
  vec3 lutX;
  vec3 lutY;
  vec3 fogTint;
  vec3 sunHaze;
  vec3 stormCenter;
  vec3 focusUp;
  vec4 fog;
  vec4 cloud;
  mat3 cloudRot;
  vec2 reach;
  float ambInv;
  float wet;
  float altMoon;
  float lightning;
  float nearby;
  sampler2D lut;
  sampler2D trans;
  samplerCube cover;
  samplerCube env;
  highp sampler3D noise;
};
uniform SkyState uSky;

float skyHG(float mu, float g) {
  float g2 = g * g;
  return (1.0 - g2) / (4.0 * SKY_PI * pow(max(1.0 + g2 - 2.0 * g * mu, 1e-4), 1.5));
}
// The vertical light is reckoned against. Around the player it bends to the player's own, so the sea,
// clouds and air in view share the player's hour (golden light on every side, the whole sky burning at
// sunset); from high up, and beyond what the camera can see, the true curvature holds and the terminator
// is a true great circle.
vec3 skyLightUp(vec3 p) {
  vec3 u = normalize(p);
  return normalize(mix(u, uSky.focusUp, uSky.nearby * smoothstep(uSky.reach.x, uSky.reach.y, dot(u, uSky.focusUp))));
}
// light through the atmosphere from p towards L (Rayleigh, haze and ozone optical depths are tabulated)
vec3 skyTransmittance(vec3 p, vec3 L) {
  float r = max(length(p), SKY_R), mu = dot(skyLightUp(p), L);
  if (r > SKY_TOP) {
    float b = r * mu, d = b * b - r * r + SKY_TOP * SKY_TOP;
    if (d < 0.0 || mu > 0.0) return vec3(1.0);
    mu = (b - sqrt(d)) / SKY_TOP;
    r = SKY_TOP;
  }
  vec3 od = texture(uSky.trans, vec2(0.5 + 0.5 * sign(mu) * sqrt(abs(mu)), sqrt((r - SKY_R) / (SKY_TOP - SKY_R)))).rgb;
  return exp(-SKY_BR * od.x - SKY_BO * od.z - SKY_BM / 0.9 * uSky.fog.w * od.y);
}
// 0 where the planet hides the light from p; w is the half-width of the penumbra (sine of the angle)
float skyPlanetShadow(vec3 p, vec3 L, float w) {
  float r = max(length(p), SKY_R + 0.01), mu = dot(skyLightUp(p), L);
  float dip = sqrt(1.0 - SKY_R * SKY_R / (r * r));
  return smoothstep(-dip - w, -dip + w, mu);
}
float skyPlanetShadow(vec3 p, vec3 L) { return skyPlanetShadow(p, L, 0.01); }
float skyDaylight(float s) { return 0.015 + smoothstep(-0.32, 0.12, s); }
float skyAmbientScale(vec3 p) { return min(skyDaylight(dot(skyLightUp(p), uSky.sunDir)) * uSky.ambInv, 4.0); }
// true while the sun is the key light (the moon is then the unshadowed second one)
bool skySunKey() { return uSky.altMoon > 0.5; }
// light a lightning flash throws on everything, as irradiance
vec3 skyFlash() { return vec3(0.8, 0.85, 1.0) * (uSky.lightning * 2.0); }
float skyStorm(vec3 d) { return smoothstep(${STORM_OUT}, ${STORM_IN}, dot(d, uSky.stormCenter)); }
float skyCover(vec3 d) { return texture(uSky.cover, d).r; }
// image-based light from the live sky: the cube's mip chain stands in for the cosine and GGX lobes
vec3 skyIrradiance(vec3 n) {
  return SKY_PI * mix(textureLod(uSky.env, n, 5.0).rgb, textureLod(uSky.env, n, 6.0).rgb, 0.5);
}
vec3 skyRadiance(vec3 rd, vec3 n, float roughness) {
  vec3 r = normalize(mix(reflect(rd, n), n, roughness * roughness));
  return textureLod(uSky.env, r, clamp(7.5 * sqrt(roughness) - 0.5, 0.0, 7.0)).rgb;
}
float skyCloudShadow(vec3 p, vec3 L) {
  float rc = SKY_R + 28.0, b = dot(p, L), c = dot(p, p) - rc * rc, t = -b + sqrt(max(b * b - c, 0.0));
  return t > 0.0 ? 1.0 - uSky.cloud.y * smoothstep(0.1, 0.7, skyCover(normalize(p + L * t))) : 1.0;
}
vec3 skyKeyVisibility(vec3 p, vec3 L) {
  float s = skyPlanetShadow(p, L);
  if (s <= 0.0) return vec3(0.0);
  return s * skyTransmittance(p, L) * skyCloudShadow(p, L) * (1.0 - 0.88 * skyStorm(normalize(p)));
}
// the second, unshadowed body lights the far side of the planet (moon by day, sun by night)
vec3 skyAltVisibility(vec3 p, vec3 L) {
  float s = skyPlanetShadow(p, L) * (1.0 - uSky.altMoon * smoothstep(-0.12, 0.05, dot(skyLightUp(p), uSky.sunDir)));
  return s > 0.0 ? s * skyTransmittance(p, L) : vec3(0.0);
}
vec3 skyFogColor(vec3 rd) {
  float az = atan(dot(rd, uSky.lutY), dot(rd, uSky.lutX));
  vec3 c = texture(uSky.lut, vec2(az * (0.5 / SKY_PI) + 0.5, 0.5 + 1.0 / SKY_LUT_H)).rgb;
  return c * uSky.fogTint + uSky.sunHaze * skyHG(dot(rd, uSky.sunDir), 0.75);
}
// mean haze density (relative to sea level) along a straight segment of the given end altitudes
float skyHazeMean(float h0, float h1) {
  float H = uSky.fog.z, a0 = exp(-max(h0, 0.0) / H), a1 = exp(-max(h1, 0.0) / H);
  return abs(h1 - h0) > 0.01 ? H * (a0 - a1) / (h1 - h0) : a0;
}
// mean haze density along the chord from the eye, split where it passes closest to the sea
float skyHazeChord(vec3 rd, float L) {
  vec3 ro = cameraPosition;
  float tc = clamp(-dot(ro, rd), 0.0, L), h0 = length(ro) - SKY_R;
  float hc = length(ro + rd * tc) - SKY_R, h1 = length(ro + rd * L) - SKY_R;
  return (tc * skyHazeMean(h0, hc) + (L - tc) * skyHazeMean(hc, h1)) / max(L, 1e-3);
}
float skyHorizonDist() {
  float r0 = max(length(cameraPosition), SKY_R + 0.5);
  return sqrt(r0 * r0 - SKY_R * SKY_R) + 6.0;
}
// haze transmittance from the eye to p: dense towards the curved horizon, thin aloft, clear up close
float skyFogT(vec3 p) {
  vec3 d = p - cameraPosition;
  float L = length(d);
  return exp(-uSky.fog.x * pow(L / skyHorizonDist(), uSky.fog.y) * skyHazeChord(d / max(L, 1e-3), L));
}
// the same haze for a ray that never hits anything (the sky): the chord through the low air
float skyFogSkyT(vec3 rd) { return exp(-uSky.fog.x * skyHazeChord(rd, 2.0 * skyHorizonDist())); }
vec3 skyFog(vec3 col, vec3 p) {
  return mix(skyFogColor(normalize(p - cameraPosition)), col, skyFogT(p));
}
#endif
`;

/** Cascaded key-light shadow for custom shaders: float skyKeyShadow(vec3 worldPos, float viewDepth). */
export const SHADOW_GLSL = /* glsl */ `
uniform highp sampler2DShadow tKeyShadow;
uniform mat4 uKeyShadowMatrix;
uniform mat4 uKeyShadowMatrixFar;
uniform vec4 uKeyShadowSplit;
uniform float uShadowOn;
float skyShadowTap(mat4 m, vec3 p) {
  vec4 c = m * vec4(p, 1.0);
  c.xyz /= c.w;
  if (c.x < 0.0 || c.x > 1.0 || c.y < 0.0 || c.y > 1.0 || c.z > 1.0) return 1.0;
  vec2 o = vec2(0.5 / ${SHADOW_SIZE * 2}.0, 0.5 / ${SHADOW_SIZE}.0);
  return 0.25 * (texture(tKeyShadow, vec3(c.xy + o, c.z)) + texture(tKeyShadow, vec3(c.xy - o, c.z))
    + texture(tKeyShadow, vec3(c.xy + vec2(o.x, -o.y), c.z)) + texture(tKeyShadow, vec3(c.xy - vec2(o.x, -o.y), c.z)));
}
float skyKeyShadow(vec3 p, float viewDepth) {
  if (uShadowOn < 0.5) return 1.0;
  if (viewDepth < uKeyShadowSplit.z) return skyShadowTap(uKeyShadowMatrix, p);
  float far = skyShadowTap(uKeyShadowMatrixFar, p);
  return viewDepth < uKeyShadowSplit.y ? mix(skyShadowTap(uKeyShadowMatrix, p), far, smoothstep(uKeyShadowSplit.z, uKeyShadowSplit.y, viewDepth)) : far;
}
`;

/**
 * Registered point lights for custom shaders: vec3 skyPointLights(vec3 worldPos, vec3 normal, float wrap)
 * returns the irradiance (multiply by albedo / π); wrap 0 = Lambert, 1 = omnidirectional (mist, particles).
 */
export const POINT_LIGHTS_GLSL = /* glsl */ `
uniform vec3 uLightPos[${MAX_LIGHTS}];
uniform vec3 uLightColor[${MAX_LIGHTS}];
uniform float uLightRange[${MAX_LIGHTS}];
uniform int uLightCount;
vec3 skyPointLights(vec3 p, vec3 n, float wrap) {
  vec3 sum = vec3(0.0);
  for (int i = 0; i < ${MAX_LIGHTS}; i++) {
    if (i >= uLightCount) break;
    vec3 d = uLightPos[i] - p;
    float dist = max(length(d), 1e-3);
    float fall = pow(clamp(1.0 - pow(dist / uLightRange[i], 4.0), 0.0, 1.0), 2.0) / max(dist * dist, 0.01);
    sum += uLightColor[i] * fall * clamp((dot(n, d / dist) + wrap) / (1.0 + wrap), 0.0, 1.0);
  }
  return sum;
}
`;

// ---------------------------------------------------------------------------------------------
// Global patches: every built-in material gets the uSky struct, the haze, the terminator and the
// atmospheric colour on its directional lights, cloud shadows, and night-side ambient. The struct's
// value is a plain object, so three hands every material the same reference.
{
  const C = THREE.ShaderChunk;
  C.fog_pars_vertex = '#ifdef USE_FOG\nvarying vec3 vSkyWorld;\n#endif';
  C.fog_vertex = '#ifdef USE_FOG\nvSkyWorld = (mvPosition.xyz - viewMatrix[3].xyz) * mat3(viewMatrix);\n#endif';
  C.fog_pars_fragment = `${SKY_GLSL}\n#ifdef USE_FOG\nvarying vec3 vSkyWorld;\n#endif`;
  C.fog_fragment = '#ifdef USE_FOG\ngl_FragColor.rgb = skyFog(gl_FragColor.rgb, vSkyWorld);\n#endif';
  C.lights_pars_begin = SKY_GLSL + C.lights_pars_begin;
  C.lights_fragment_begin = C.lights_fragment_begin
    .replace('vec3 geometryPosition = - vViewPosition;', '$&\nvec3 skyWorld = (geometryPosition - viewMatrix[3].xyz) * mat3(viewMatrix);')
    .replace('getSunLightInfo( sunLight, directLight );', '$&\n\t\tdirectLight.color *= skyKeyVisibility( skyWorld, directLight.direction * mat3( viewMatrix ) );')
    .replace(
      'getDirectionalLightInfo( directionalLight, directLight );',
      '$&\n\t\tdirectLight.color *= skyAltVisibility( skyWorld, directLight.direction * mat3( viewMatrix ) );',
    );
  C.lights_fragment_maps += /* glsl */ `
#if !defined( USE_ENVMAP )
  #if defined( RE_IndirectDiffuse ) && ( defined( STANDARD ) || defined( LAMBERT ) || defined( PHONG ) )
  iblIrradiance += skyIrradiance( geometryNormal * mat3( viewMatrix ) );
  #endif
  #if defined( RE_IndirectSpecular )
  radiance += skyRadiance( -geometryViewDir * mat3( viewMatrix ), geometryNormal * mat3( viewMatrix ), material.roughness );
  #endif
#endif
`;
  C.lights_fragment_end = /* glsl */ `
#if defined( RE_IndirectDiffuse )
{
  float skyAmb = skyAmbientScale( skyWorld );
  irradiance *= skyAmb;
  iblIrradiance *= skyAmb;
  #if defined( RE_IndirectSpecular )
  radiance *= skyAmb;
  #endif
}
#endif
${C.lights_fragment_end}`;
  for (const lib of Object.values(THREE.ShaderLib)) lib.uniforms.uSky = U.uSky;
}

const WET_GLSL = /* glsl */ `
{
  // rain darkens porous surfaces and leaves a glossy film: puddles on the flat, streaks down the steep
  vec3 wPos = (-vViewPosition - viewMatrix[3].xyz) * mat3(viewMatrix);
  vec3 wUp = normalize(wPos);
  float facing = dot(normal * mat3(viewMatrix), wUp);
  float wet = uSky.wet * smoothstep(-0.6, 0.2, facing);
  if (wet > 0.0) {
    float pool = smoothstep(0.62, 0.9, facing) * smoothstep(0.45, 0.62, texture(uSky.noise, wPos * 0.07).a);
    float streak = (1.0 - smoothstep(0.3, 0.8, abs(facing))) * smoothstep(0.4, 0.7, texture(uSky.noise, (wPos - wUp * dot(wPos, wUp) * 0.92) * 0.35).g);
    diffuseColor.rgb *= mix(1.0, mix(0.86, 0.48, uWetPorosity), wet);
    roughnessFactor = mix(roughnessFactor, mix(mix(0.3, 0.12, max(pool, streak)), 0.04, pool), wet * mix(0.75, 1.0, max(pool, streak)));
  }
}
`;

/**
 * Wet darkening and gloss for standard materials (call once per material at build time). porosity 0 is
 * sealed (rock, painted wood: glossy film, little darkening) … 1 soaks up (sand, canvas, bark). Chains
 * onto any onBeforeCompile already set; patch afterwards the same way (keep the previous one and its
 * customProgramCacheKey) so neither clobbers the other.
 */
export function applyWeather(m: THREE.MeshStandardMaterial, porosity = 1): void {
  const compile = m.onBeforeCompile, key = m.customProgramCacheKey;
  const uniform = { value: porosity };
  m.onBeforeCompile = (shader, renderer) => {
    compile.call(m, shader, renderer);
    shader.uniforms.uWetPorosity = uniform;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uWetPorosity;')
      .replace('#include <lights_physical_fragment>', `${WET_GLSL}\n#include <lights_physical_fragment>`);
  };
  m.customProgramCacheKey = () => key.call(m) + '|wet';
}

// ---------------------------------------------------------------------------------------------
// Internal shaders.
// Single scattering through the shell (sun and moon, planet shadow, storm dimming, multi-scatter fill).
const SCATTER_GLSL = /* glsl */ `
float skyRayleigh(float mu) { return 0.0596831 * (1.0 + mu * mu); }
// haze droplets: a bright forward glow round the sun, and enough back-scatter that the haze takes the
// colour of the light all round the horizon
float skyMie(float mu) { return mix(skyHG(mu, 0.8), skyHG(mu, -0.3), 0.4); }
vec3 skyScatter(vec3 ro, vec3 rd, int n) {
  float b = dot(ro, rd), c = dot(ro, ro);
  float d = b * b - c + SKY_TOP * SKY_TOP;
  if (d <= 0.0) return vec3(0.0);
  float sq = sqrt(d), t0 = max(-b - sq, 0.0), t1 = -b + sq;
  float g = b * b - c + SKY_R * SKY_R;
  if (g > 0.0 && b < 0.0) t1 = min(t1, -b - sqrt(g));
  if (t1 <= t0) return vec3(0.0);
  float muS = dot(rd, uSky.sunDir), muM = dot(rd, uSky.moonDir);
  float prS = skyRayleigh(muS), prM = skyRayleigh(muM), pmS = skyMie(muS), pmM = skyMie(muM);
  vec3 moonE = uSky.moonE * ${MOON_SKY.toFixed(2)};
  // samples bunch up near the eye when it is inside the shell, where the haze is
  float k = c < SKY_TOP * SKY_TOP ? 1.6 : 1.0;
  vec3 sum = vec3(0.0), od = vec3(0.0);
  float prev = 0.0;
  for (int i = 1; i <= 64; i++) {
    if (i > n) break;
    float x = pow(float(i) / float(n), k), dt = (x - prev) * (t1 - t0);
    vec3 p = ro + rd * (t0 + (x + prev) * 0.5 * (t1 - t0));
    prev = x;
    float r = length(p), h = r - SKY_R;
    vec3 sR = SKY_BR * exp(-h / SKY_HR);
    float sM = SKY_BM * exp(-h / SKY_HM) * uSky.fog.w;
    vec3 ext = sR + sM / 0.9 + SKY_BO * exp(-h / SKY_HO);
    vec3 tv = exp(-od - 0.5 * ext * dt);
    od += ext * dt;
    // the planet's shadow on the air has a wide, soft edge (refraction, the sun's disc, scattered light)
    vec3 ls = uSky.sunE * skyTransmittance(p, uSky.sunDir) * skyPlanetShadow(p, uSky.sunDir, 0.05);
    vec3 lm = moonE * skyTransmittance(p, uSky.moonDir) * skyPlanetShadow(p, uSky.moonDir, 0.05);
    // multiple scattering: an isotropic fill, blue where the air scatters it, the light's own colour in haze
    vec3 scat = sR * (prS * ls + prM * lm) + sM * (pmS * ls + pmM * lm) + (sR * SKY_BR / SKY_BR.z + sM) * (ls + lm) * SKY_MS;
    // under the storm deck the sky's light is mostly cut off
    float dim = 1.0 - 0.8 * skyStorm(p / r) * (1.0 - smoothstep(30.0, 90.0, h));
    sum += tv * (scat * dim + sR * vec3(0.0004, 0.0006, 0.0011)) * dt;
  }
  return sum;
}
`;

// Full-screen triangle at the far plane; vDir is the world-space view ray of the rendering camera.
const FULLSCREEN_VERT = /* glsl */ `
uniform vec2 uJitter;
varying vec3 vDir;
varying vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  vec4 v = inverse(projectionMatrix) * vec4(position.xy + uJitter, 1.0, 1.0);
  vDir = (v.xyz / v.w) * mat3(viewMatrix);
  gl_Position = vec4(position.xy, 1.0, 1.0);
}
`;
const PASS_VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

// 3D → 3D hash (cell jitter for the noise, star placement)
const HASH_GLSL = /* glsl */ `
vec3 skyH3(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.xxy + p.yxx) * p.zyx);
}
`;

// Tileable cloud noise, one slice per draw. r: Perlin-Worley billows, g: Worley fbm, b: fine Worley
// fbm (erosion), a: smooth Perlin fbm (moon maria, puddles, the Milky Way's dust).
const NOISE_FRAG = /* glsl */ `
uniform float uZ;
varying vec2 vUv;
${HASH_GLSL}
float worley(vec3 x, float period) {
  vec3 p = floor(x), f = fract(x);
  float d = 1.0;
  for (int k = -1; k <= 1; k++) for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec3 o = vec3(i, j, k), r = o + skyH3(mod(p + o, period)) - f;
    d = min(d, dot(r, r));
  }
  return sqrt(d);
}
float grad(vec3 p, vec3 f, vec3 o, float period) { return dot(skyH3(mod(p + o, period)) * 2.0 - 1.0, f - o); }
float perlin(vec3 x, float period) {
  vec3 p = floor(x), f = fract(x), u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  return mix(mix(mix(grad(p, f, vec3(0, 0, 0), period), grad(p, f, vec3(1, 0, 0), period), u.x),
                 mix(grad(p, f, vec3(0, 1, 0), period), grad(p, f, vec3(1, 1, 0), period), u.x), u.y),
             mix(mix(grad(p, f, vec3(0, 0, 1), period), grad(p, f, vec3(1, 0, 1), period), u.x),
                 mix(grad(p, f, vec3(0, 1, 1), period), grad(p, f, vec3(1, 1, 1), period), u.x), u.y), u.z);
}
float perlinFbm(vec3 x, float period) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { s += a * perlin(x * period, period); period *= 2.0; a *= 0.5; }
  return clamp(s * 1.1 + 0.5, 0.0, 1.0);
}
float worleyFbm(vec3 x, float period) {
  return 1.0 - (worley(x * period, period) * 0.625 + worley(x * period * 2.0, period * 2.0) * 0.25 + worley(x * period * 4.0, period * 4.0) * 0.125);
}
void main() {
  vec3 x = vec3(vUv, uZ);
  float pf = perlinFbm(x, 4.0), wf = worleyFbm(x, 4.0);
  float pw = clamp((pf - (1.0 - wf)) / wf, 0.0, 1.0);
  gl_FragColor = vec4(mix(pw, wf, 0.35), worleyFbm(x, 8.0), worleyFbm(x, 16.0), perlinFbm(x, 8.0));
}
`;

// Optical depth to space by altitude (rows, sqrt-spaced) and zenith cosine (columns, sqrt-spaced
// around the horizon), from the Chapman grazing-incidence function (e^{y²}·erfc(y) approximation).
const TRANS_FRAG = /* glsl */ `
${SKY_GLSL}
varying vec2 vUv;
float skyCh(float X, float mu) {
  float y = sqrt(0.5 * X) * mu;
  return sqrt(2.0 * X) / (y + sqrt(y * y + 1.2732395));
}
float skyDepth(float r, float mu, float H) {
  float X = r / H, e = exp((SKY_R - r) / H);
  if (mu >= 0.0) return H * e * skyCh(X, mu);
  float st = sqrt(1.0 - mu * mu);
  return H * (2.0 * exp(min((SKY_R - r * st) / H, 30.0)) * skyCh(X * st, 0.0) - e * skyCh(X, -mu));
}
void main() {
  float s = vUv.x * 2.0 - 1.0, mu = sign(s) * s * s, r = SKY_R + vUv.y * vUv.y * (SKY_TOP - SKY_R);
  gl_FragColor = vec4(min(vec3(skyDepth(r, mu, SKY_HR), skyDepth(r, mu, SKY_HM), skyDepth(r, mu, SKY_HO)), 60000.0), 1.0);
}
`;

// Fair-weather cumulus cover by direction: cloud cells (~20 units) ringed by smaller satellites and ragged
// fragments, thinned or gathered by a slow large-scale field, so some stretches of sea stay clear while
// others crowd with cloud. The wide ramp leaves a fringe of thin cover that the march turns into wisps.
const COVER_FRAG = /* glsl */ `
${SKY_GLSL}
varying vec3 vDir;
void main() {
  vec3 q = uSky.cloudRot * normalize(vDir);
  float c = clamp(uSky.cloud.x + (texture(uSky.noise, q * 0.7).a - 0.5) * 1.3, 0.0, 1.0);
  float cells = texture(uSky.noise, q * 2.4 + 0.37).r * 0.55 + texture(uSky.noise, q * 6.5 + 0.71).g * 0.3
              + texture(uSky.noise, q * 3.1 + 0.19).b * 0.15;
  gl_FragColor = vec4(smoothstep(0.86 - c, 1.55 - c, cells), 0.0, 0.0, 1.0);
}
`;

const LUT_FRAG = /* glsl */ `
${SKY_GLSL}
${SCATTER_GLSL}
uniform vec3 uOrigin, uX, uY, uUp;
uniform float uEh;
varying vec2 vUv;
void main() {
  float az = (vUv.x - 0.5) * 2.0 * SKY_PI, s = abs(vUv.y - 0.5) * 2.0;
  float el = vUv.y > 0.5 ? uEh + (0.5 * SKY_PI - uEh) * s * s : uEh - (uEh + 0.5 * SKY_PI) * s * s;
  vec3 rd = cos(el) * (cos(az) * uX + sin(az) * uY) + sin(el) * uUp;
  gl_FragColor = vec4(skyScatter(uOrigin, rd, 30), 1.0);
}
`;

const SKY_FRAG = /* glsl */ `
${SKY_GLSL}
${SCATTER_GLSL}
uniform sampler2D tLut;
uniform vec3 uLutOrigin, uLutX, uLutY, uLutUp;
uniform float uLutEh;
uniform mat3 uStarRot;
uniform vec3 uMoonX, uMoonY;
uniform float uStars;
uniform float uSunDisc;
uniform float uTime;
uniform vec3 uSeaColor;
varying vec3 vDir;

vec2 lutUv(vec3 rd) {
  float az = atan(dot(rd, uLutY), dot(rd, uLutX)), el = asin(clamp(dot(rd, uLutUp), -1.0, 1.0));
  float v = el >= uLutEh
    ? max(0.5 + 0.5 * sqrt((el - uLutEh) / (0.5 * SKY_PI - uLutEh)), 0.5 + 0.5 / SKY_LUT_H)
    : min(0.5 - 0.5 * sqrt((uLutEh - el) / (uLutEh + 0.5 * SKY_PI)), 0.5 - 0.5 / SKY_LUT_H);
  return vec2(az * (0.5 / SKY_PI) + 0.5, v);
}
${HASH_GLSL}

// Stars on a cube-face grid, one per cell; px is the pixel's angular size so every star is a stable
// one-to-two pixel point. Brightness follows a power law, colour a spread of temperatures.
vec3 stars(vec3 d, float px, float horizon) {
  vec3 a = abs(d);
  float face;
  vec2 uv;
  if (a.x > a.y && a.x > a.z) { face = sign(d.x); uv = d.yz / a.x; }
  else if (a.y > a.z) { face = 2.0 + sign(d.y); uv = d.zx / a.y; }
  else { face = 4.0 + sign(d.z); uv = d.xy / a.z; }
  vec3 col = vec3(0.0);
  for (int l = 0; l < 2; l++) {
    float cells = l == 0 ? 70.0 : 230.0;
    vec2 g = (uv * 0.5 + 0.5) * cells, id = floor(g);
    vec3 h = skyH3(vec3(id, face * 17.0 + float(l) * 131.0));
    vec2 off = (g - id - 0.15 - 0.7 * h.xy) * (2.0 / cells);
    float mag = l == 0 ? pow(h.z, 7.0) * 1.6 : pow(h.z, 5.0) * 0.2 * step(0.45, h.x);
    float tw = 1.0 + 0.45 * horizon * sin(uTime * (3.0 + 9.0 * h.x) + h.y * 40.0);
    vec3 tint = mix(vec3(1.0, 0.72, 0.5), vec3(0.72, 0.82, 1.0), h.y) * 0.6 + 0.4;
    col += tint * mag * tw * exp(-dot(off, off) / (px * px * 0.6));
  }
  return col;
}
vec3 milkyWay(vec3 c) {
  float b = dot(c, normalize(vec3(0.32, 0.58, 0.75)));
  float bulge = exp(-4.0 * (1.0 - dot(c, normalize(vec3(0.83, -0.46, 0.0)))));
  float band = exp(-b * b / (0.03 + 0.05 * bulge));
  if (band < 0.01) return vec3(0.0);
  float n1 = texture(uSky.noise, c * 1.3).a, n2 = texture(uSky.noise, c * 3.7 + 0.5).a;
  float dust = smoothstep(0.48, 0.68, n2) * exp(-b * b / 0.004);
  return mix(vec3(0.6, 0.7, 1.0), vec3(1.0, 0.85, 0.66), bulge) * band * (0.4 + 0.9 * n1) * (1.0 - 0.8 * dust) * (1.0 + 2.5 * bulge);
}

void main() {
  vec3 rd = normalize(vDir), ro = cameraPosition;
  // a pixel's angular size, held to a floor so stars keep their size on dense displays
  float px = max(length(fwidth(rd)), 0.0008);
  bool lut = distance(ro, uLutOrigin) < 0.35 * (length(uLutOrigin) - SKY_R) + 8.0;
  vec3 col = lut ? texture(tLut, lutUv(rd)).rgb : skyScatter(ro, rd, 16);
  float b = dot(ro, rd), g = b * b - dot(ro, ro) + SKY_R * SKY_R;
  if (g > 0.0 && b < 0.0) {
    // the sea, for the reflection cube's lower half: Fresnel sky over deep water
    vec3 n = normalize(ro + rd * (-b - sqrt(g)));
    float f = 0.02 + 0.98 * pow(1.0 - max(dot(-rd, n), 0.0), 5.0);
    vec3 rr = reflect(rd, n);
    col += f * texture(tLut, lutUv(rr)).rgb + (1.0 - f) * uSeaColor;
  } else {
    vec3 tv = skyTransmittance(ro, rd);
    // sun: limb-darkened disc, far brighter than anything else so bloom picks it up
    float as = sqrt(max(2.0 - 2.0 * dot(rd, uSky.sunDir), 0.0));
    if (as < ${(SUN_RADIUS * 2).toFixed(4)} * uSunDisc) {
      float x = min(as / ${SUN_RADIUS}, 1.0);
      vec3 limb = pow(vec3(sqrt(1.0 - x * x)), vec3(0.38, 0.5, 0.68));
      col += uSky.sunE * tv * limb * (1.0 - smoothstep(${SUN_RADIUS} - px, ${SUN_RADIUS} + px, as)) * 60.0;
    }
    // moon: sunlit sphere with maria and craters, earthshine on the dark side
    float am = sqrt(max(2.0 - 2.0 * dot(rd, uSky.moonDir), 0.0));
    float disc = 1.0 - smoothstep(${MOON_RADIUS} - px, ${MOON_RADIUS} + px, am);
    if (disc > 0.0) {
      vec2 q = vec2(dot(rd, uMoonX), dot(rd, uMoonY)) / ${MOON_RADIUS};
      vec3 m = vec3(q, sqrt(max(1.0 - dot(q, q), 0.0)));
      vec3 n = uMoonX * m.x + uMoonY * m.y - uSky.moonDir * m.z;
      float maria = smoothstep(0.42, 0.6, texture(uSky.noise, m * 0.32 + 0.21).a);
      float w = texture(uSky.noise, m * 0.6 + 0.4).g;
      float crater = smoothstep(0.55, 0.7, w) - 0.6 * smoothstep(0.75, 0.9, w);
      float alb = 0.13 * (1.0 - 0.42 * maria) * (0.85 + 0.3 * crater);
      float mu0 = max(dot(n, uSky.sunDir), 0.0), mu1 = max(m.z, 0.05);
      float lit = 2.0 * mu0 / (mu0 + mu1);
      col = mix(col, col * 0.3, disc) + disc * tv * alb * (uSky.sunE * lit * 0.6 + vec3(0.05, 0.07, 0.1));
    } else if (uStars > 0.001) {
      vec3 c = uStarRot * rd;
      float horizon = 1.0 - smoothstep(0.0, 0.5, dot(rd, uLutUp) - uLutEh);
      col += tv * uStars * (stars(c, px, horizon) * 0.14 + milkyWay(c) * 0.008);
    }
  }
  if (g <= 0.0 || b >= 0.0) col = mix(skyFogColor(rd), col, skyFogSkyT(rd));
  // relative dither so the 8-bit grade never bands the gradients
  vec2 fc = gl_FragCoord.xy;
  float n = fract(52.9829189 * fract(dot(fc, vec2(0.06711056, 0.00583715)))) + fract(52.9829189 * fract(dot(fc + 17.0, vec2(0.00583715, 0.06711056))));
  gl_FragColor = vec4(col * (1.0 + (n - 1.0) * 0.03), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

// The cloud shell: fair-weather cumulus carried by the wind, and the storm's towering overcast with
// its anvil. Lit by the sun or moon (light march + multiple-scattering octaves) and the sky.
const CLOUD_FRAG = /* glsl */ `
${SKY_GLSL}
uniform vec3 uFocus;
uniform vec3 uLightDir, uLightE;
uniform vec3 uAmbTop, uAmbBottom;
uniform float uFrame;
uniform float uSteps;
uniform vec3 uStormX; // turning reference direction across the storm centre, for its spiral arms
varying vec3 vDir;
layout(location = 0) out vec4 oColor;
#ifndef CUBE
layout(location = 1) out vec4 oDepth;
#endif

// cumulus cover, the storm's overcast and its towering core, and the cloud base over a direction
struct Column { float cover; float storm; float core; float base; float band; };
Column column(vec3 d) {
  // the storm winds its outer cloud into three slowly turning spiral arms, frayed by the noise, with clear
  // lanes of sea between them rather than standing as a disc
  vec3 k = uSky.stormCenter;
  float th = atan(dot(d, cross(k, uStormX)), dot(d, uStormX) + 1e-5), rho = acos(clamp(dot(d, k), -1.0, 1.0));
  float n = texture(uSky.noise, uSky.cloudRot * d * 2.2 + 0.13).a;
  float band = smoothstep(0.3, 0.7, 0.5 + 0.5 * cos(3.0 * th - 14.0 * rho + 5.0 * (n - 0.5)));
  float s0 = skyStorm(d), storm = clamp(s0 * 1.6 - (1.0 - band) * 1.2 * (1.0 - 0.5 * s0), 0.0, 1.0);
  float core = smoothstep(${Math.cos(0.5).toFixed(4)}, ${Math.cos(0.05).toFixed(4)}, dot(d, k));
  // the air sinking between the arms clears the fair-weather cumulus there
  float cover = skyCover(d) * (1.0 - 0.85 * smoothstep(0.0, 0.6, s0));
  return Column(cover, storm, core, SKY_R + mix(20.0, ${CLOUD_LO.toFixed(1)}, storm), band);
}
float shape(vec3 p, float r, Column c, bool detail) {
  float hh = r - c.base;
  if (hh <= 0.0 || hh >= ${(CLOUD_HI - CLOUD_LO).toFixed(1)}) return 0.0;
  // cumulus: flat bases under domes as tall as the cell is strong; the storm: a low overcast deck,
  // a towering core and the anvil spreading under the tropopause. Every top boils with billows.
  vec3 q = uSky.cloudRot * p * ${(1 / R).toFixed(6)};
  vec4 n = texture(uSky.noise, q * 4.0 + vec3(0.0, uSky.cloud.z, 0.0));
  float boil = (n.g - 0.5) * 9.0 + (n.r - 0.5) * 7.0;
  // bases are ragged: they lift and thin over a few units with the billows, so no deck ends in a flat cut
  float foot = smoothstep(0.0, 2.5 + 2.5 * c.storm, hh - (1.5 + 2.5 * c.storm) * n.r);
  float dome = 12.0 * c.cover * (2.0 - c.cover) + boil * c.cover;
  float body = foot * smoothstep(hh - 2.0, hh + 3.0, dome);
  // the overcast thins towards its edges instead of ending as a slab
  float tops = 4.0 + 8.0 * sqrt(c.storm) + 32.0 * smoothstep(0.65, 1.0, c.core) + 0.5 * boil + 9.0 * (c.band - 0.5);
  float deck = c.storm * foot * smoothstep(hh - 3.0, hh + 3.0, tops);
  // the anvil canopy: a smooth lens under the tropopause over the core, thinning out into the spiral bands
  float aw = smoothstep(0.2, 0.85, c.core * (0.6 + 0.6 * c.band));
  float lo = 39.0 - 7.0 * aw, hi = 40.0 + 6.0 * aw + 0.15 * boil;
  float anvil = aw * aw * smoothstep(lo - 3.0, lo + 2.0, hh) * (1.0 - smoothstep(hi - 2.0, hi + 3.0, hh));
  // nothing reaches the top of the shell, so no tower is ever cut flat
  body = max(body, max(deck, anvil)) * (1.0 - smoothstep(42.0, 49.0, hh));
  float h = hh / 50.0, calm = 1.0 - 0.85 * aw * smoothstep(30.0, 38.0, hh);
  float v = clamp(body * 1.5 - (1.0 - n.g) * 0.55 * calm, 0.0, 1.0);
  if (detail && v > 0.0 && v < 0.6) {
    float e = texture(uSky.noise, q * 11.0 - vec3(uSky.cloud.z * 3.0, 0.0, 0.0)).b;
    v = clamp(v - (1.0 - e) * 0.5 * (1.3 - h), 0.0, 1.0);
  }
  // weak cells are thin and translucent, so fields thin out into wisps rather than ending in cotton balls
  return v * mix(mix(0.3, 1.0, smoothstep(0.05, 0.6, c.cover)), 2.4, c.storm);
}
vec2 sphere(vec3 ro, vec3 rd, float r) {
  float b = dot(ro, rd), d = b * b - dot(ro, ro) + r * r;
  if (d < 0.0) return vec2(1e9, -1e9);
  d = sqrt(d);
  return vec2(-b - d, -b + d);
}
void main() {
  vec3 ro = cameraPosition, rd = normalize(vDir);
  float r0 = length(ro);
  vec2 o = sphere(ro, rd, SKY_R + ${CLOUD_HI.toFixed(1)}), ib = sphere(ro, rd, SKY_R + ${CLOUD_LO.toFixed(1)}), gr = sphere(ro, rd, SKY_R);
  float t0 = max(o.x, 0.0), t1 = o.y;
  if (gr.x > 0.0) t1 = min(t1, gr.x);
  // the air under the lowest cloud base is skipped, and the ray marches on beyond it
  vec2 hollow = vec2(max(ib.x, 0.0), max(ib.y, 0.0));
  float skip = max(min(hollow.y, t1) - max(hollow.x, t0), 0.0);
  vec3 L = vec3(0.0);
  float T = 1.0, D = 0.0;
  if (t1 - t0 - skip > 0.0) {
    float dt = (t1 - t0 - skip) / clamp((t1 - t0 - skip) / 1.7, 20.0, uSteps);
    float jit = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))) + uFrame * 0.618034);
    float t = t0 + dt * jit;
    // the phase (three scattering orders) and the light's colour hardly change along one ray
    float mu = dot(rd, uLightDir);
    vec3 ph = vec3(mix(skyHG(mu, 0.8), skyHG(mu, -0.25), 0.3), 0.45 * mix(skyHG(mu, 0.4), skyHG(mu, -0.12), 0.3), 0.2 * mix(skyHG(mu, 0.2), skyHG(mu, -0.06), 0.3));
    vec3 sun = vec3(-1.0);
    // the line of sight to the ship stays clear when the camera looks down through the deck
    vec3 ab = uFocus - ro;
    float abl = max(dot(ab, ab), 1e-3);
    // from up among the clouds, the nearest thin to mist rather than standing close as solid puffs
    float above = smoothstep(15.0, 30.0, r0 - SKY_R);
    for (int i = 0; i < 160; i++) {
      if (t > hollow.x && t < hollow.y) t += hollow.y - hollow.x;
      if (t > t1 || T < 0.015) break;
      vec3 p = ro + rd * t;
      float r = length(p);
      t += dt;
      Column c = column(p / r);
      // clear air: stride on
      if (max(c.cover, c.storm) < 0.02 || r < c.base) { t += dt; continue; }
      float dens = shape(p, r, c, true);
      if (dens <= 0.0) continue;
      #ifndef CUBE
      vec3 ap = p - ro;
      float k = clamp(dot(ap, ab) / abl, 0.0, 1.0);
      dens *= mix(mix(0.05, 0.6, smoothstep(60.0, 400.0, sqrt(abl))), 1.0, smoothstep(4.0, 9.0 + 0.03 * sqrt(abl), length(ap - ab * k)) * smoothstep(2.0, 10.0, t));
      dens *= mix(1.0, smoothstep(8.0, 70.0, t), above);
      #endif
      float sig = dens * 0.5;
      // light march towards the sun or moon on the coarse shape
      float odl = 0.0, prev = 0.0;
      for (int j = 0; j < 4; j++) {
        float tl = (1.6 + 5.0 * c.storm) * pow(2.1, float(j) + jit - 0.5);
        vec3 pl = p + uLightDir * tl;
        odl += shape(pl, length(pl), c, false) * (tl - prev);
        prev = tl;
      }
      odl *= 0.5;
      // sunlight reaches the clouds through the air as if they stood a quarter as high, which gives
      // them the gold of the hour and the red of sunset instead of the white of the thin upper air
      if (sun.x < 0.0) sun = uLightE * skyTransmittance(p * ((SKY_R + 0.25 * (r - SKY_R)) / r), uLightDir) * 2.4;
      // the planet's shadow falls across a cloud deck as a broad dusk, never as a line
      float lum = dot(ph, exp(-odl * vec3(1.0, 0.4, 0.16))) * skyPlanetShadow(p, uLightDir, 0.08);
      lum *= 1.0 - exp(-sig * 4.0);
      float hf = clamp((r - c.base) / mix(20.0, 50.0, c.storm), 0.0, 1.0);
      vec3 amb = mix(uAmbBottom, uAmbTop, sqrt(hf)) * skyAmbientScale(p) * (1.0 - 0.6 * c.storm * (1.0 - hf));
      vec3 S = (sun * lum + amb) * sig;
      float tr = exp(-sig * dt);
      L += T * (S - S * tr) / sig;
      D += (t - dt) * T * (1.0 - tr);
      T *= tr;
    }
    if (T < 1.0) {
      float depth = D / (1.0 - T), ft = skyFogT(ro + rd * depth);
      L = L * ft + skyFogColor(rd) * (1.0 - T) * (1.0 - ft);
    }
  }
  oColor = vec4(L, T);
  #ifndef CUBE
  oDepth = vec4(D, 0.0, 0.0, 1.0);
  #endif
}
`;

// Temporal accumulation: reproject last frame's clouds through their depth, clamp to this frame's
// neighbourhood so nothing ghosts, blend in a little of the new jittered march.
const RESOLVE_FRAG = /* glsl */ `
uniform sampler2D tColor, tDepth, tHistColor, tHistDepth;
uniform mat4 uPrevViewProj;
uniform vec2 uTexel;
uniform float uHistory;
varying vec3 vDir;
varying vec2 vUv;
layout(location = 0) out vec4 oColor;
layout(location = 1) out vec4 oDepth;
void main() {
  float dep = texture(tDepth, vUv).r;
  // this frame through a small tent, so the jittered march never shows as a dither while the camera
  // sweeps faster than the history can follow
  vec4 cur = vec4(0.0), lo = vec4(1e9), hi = vec4(-1e9);
  float a = 1.0;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec4 s = texture(tColor, vUv + vec2(i, j) * uTexel);
    if (i == 0 && j == 0) a = s.a;
    cur += s * (2.0 - abs(float(i))) * (2.0 - abs(float(j))) / 16.0;
    lo = min(lo, s);
    hi = max(hi, s);
  }
  float dist = a < 0.999 ? dep / (1.0 - a) : 5000.0;
  vec4 pc = uPrevViewProj * vec4(cameraPosition + normalize(vDir) * dist, 1.0);
  vec2 puv = pc.xy / pc.w * 0.5 + 0.5;
  float w = uHistory * step(0.0, pc.w) * step(0.0, puv.x) * step(puv.x, 1.0) * step(0.0, puv.y) * step(puv.y, 1.0);
  vec4 hist = clamp(texture(tHistColor, puv), lo - 0.02, hi + 0.02);
  float hdep = texture(tHistDepth, puv).r;
  oColor = mix(cur, hist, 0.88 * w);
  oDepth = vec4(mix(dep, hdep, 0.88 * w), 0.0, 0.0, 1.0);
}
`;

// Clouds over the scene at their own depth, with the lightning glowing inside them. The reduced-resolution
// march is upsampled with a Catmull-Rom filter (five bilinear taps), so silhouettes stay soft, never blocky.
const COMPOSITE_FRAG = /* glsl */ `
uniform sampler2D tColor, tDepth;
uniform mat4 uProj;
uniform vec3 uFlashPos, uFlashColor;
varying vec3 vDir;
varying vec2 vUv;
vec4 upsample(sampler2D t, vec2 uv) {
  vec2 size = vec2(textureSize(t, 0)), px = 1.0 / size, pos = uv * size, c = floor(pos - 0.5) + 0.5, f = pos - c;
  vec2 w0 = f * (-0.5 + f * (1.0 - 0.5 * f)), w1 = 1.0 + f * f * (-2.5 + 1.5 * f);
  vec2 w2 = f * (0.5 + f * (2.0 - 1.5 * f)), w3 = f * f * (-0.5 + 0.5 * f), w12 = w1 + w2;
  vec2 t0 = (c - 1.0) * px, t3 = (c + 2.0) * px, t12 = (c + w2 / w12) * px;
  vec4 o = texture(t, vec2(t12.x, t0.y)) * (w12.x * w0.y) + texture(t, vec2(t0.x, t12.y)) * (w0.x * w12.y)
         + texture(t, t12) * (w12.x * w12.y) + texture(t, vec2(t3.x, t12.y)) * (w3.x * w12.y)
         + texture(t, vec2(t12.x, t3.y)) * (w12.x * w3.y);
  return o / (w12.x * w0.y + w0.x * w12.y + w12.x * w12.y + w3.x * w12.y + w12.x * w3.y);
}
void main() {
  vec4 c = upsample(tColor, vUv);
  c.a = clamp(c.a, 0.0, 1.0);
  c.rgb = max(c.rgb, 0.0);
  if (c.a > 0.996) discard;
  vec3 wp = cameraPosition + normalize(vDir) * max(upsample(tDepth, vUv).r, 0.0) / (1.0 - c.a);
  c.rgb += uFlashColor * (1.0 - c.a) * exp(-distance(wp, uFlashPos) / 34.0);
  vec4 clip = uProj * viewMatrix * vec4(wp, 1.0);
  gl_FragDepth = clamp(clip.z / clip.w * 0.5 + 0.5, 0.0, 1.0);
  gl_FragColor = c;
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

// Lightning: camera-facing ribbons with a white-violet core and a wide halo; dimmed where the clouds
// stand in front of the channel.
const BOLT_VERT = /* glsl */ `
attribute vec3 aDir;
attribute vec3 aSide;
varying float vSide;
varying float vBright;
varying float vDepth;
void main() {
  vec3 side = normalize(cross(aDir, cameraPosition - position));
  vec4 mv = viewMatrix * vec4(position + side * aSide.x * aSide.y, 1.0);
  vSide = aSide.x;
  vBright = aSide.z;
  vDepth = length(mv.xyz);
  gl_Position = projectionMatrix * mv;
}
`;
const BOLT_FRAG = /* glsl */ `
uniform float uBolt;
uniform sampler2D tCloud, tCloudDepth;
uniform vec2 uResolution;
varying float vSide;
varying float vBright;
varying float vDepth;
void main() {
  float s2 = vSide * vSide;
  vec3 col = vec3(0.78, 0.82, 1.0) * (exp(-s2 * 40.0) * 60.0 + exp(-s2 * 4.0) * 3.0) * vBright * uBolt;
  #ifdef CLOUDED
  vec2 uv = gl_FragCoord.xy / uResolution;
  vec4 c = texture(tCloud, uv);
  if (c.a < 0.999 && texture(tCloudDepth, uv).r / (1.0 - c.a) < vDepth) col *= c.a;
  #endif
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

// ---------------------------------------------------------------------------------------------
/** A periodic monotone cubic (Fritsch–Butland slopes) through knots; y gains `rise` over each period of x. */
class Curve {
  private readonly x: number[] = [];
  private readonly y: number[] = [];
  private readonly m: number[] = [];
  private readonly period: number;

  constructor(knots: [number, number][], period: number, rise: number) {
    this.period = period;
    for (const [x, y] of knots) {
      this.x.push(x);
      this.y.push(y);
    }
    this.x.push(knots[0][0] + period);
    this.y.push(knots[0][1] + rise);
    const n = knots.length, len = (k: number) => this.x[k + 1] - this.x[k];
    const sec = (k: number) => (this.y[k + 1] - this.y[k]) / len(k);
    for (let k = 0; k <= n; k++) {
      const a = (k + n - 1) % n, b = k % n;
      const w1 = 2 * len(b) + len(a), w2 = len(b) + 2 * len(a);
      this.m.push((w1 + w2) / (w1 / sec(a) + w2 / sec(b)));
    }
  }

  /** y at x; x wraps into the first period, y is not wrapped. */
  at(x: number): number {
    const x0 = this.x[0], u = x0 + ((((x - x0) % this.period) + this.period) % this.period);
    let k = 0;
    while (this.x[k + 1] <= u) k++;
    return this.segment(k, (u - this.x[k]) / (this.x[k + 1] - this.x[k]));
  }

  /** x in the first period where the curve reaches y (y taken within the first period's range). */
  inverse(y: number): number {
    let k = 0;
    while (this.y[k + 1] <= y) k++;
    let lo = 0, hi = 1;
    for (let i = 0; i < 30; i++) {
      const mid = (lo + hi) / 2;
      if (this.segment(k, mid) < y) lo = mid;
      else hi = mid;
    }
    return this.x[k] + ((lo + hi) / 2) * (this.x[k + 1] - this.x[k]);
  }

  private segment(k: number, t: number): number {
    const d = this.x[k + 1] - this.x[k], t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * this.y[k] + (t3 - 2 * t2 + t) * d * this.m[k]
      + (-2 * t3 + 3 * t2) * this.y[k + 1] + (t3 - t2) * d * this.m[k + 1];
  }
}

// The clock: cycle phase → hour (the pacing), and hour → the sun's hour angle.
const CLOCK = new Curve(
  PACE.map(([h], i): [number, number] => [PACE.slice(0, i).reduce((t, [, d]) => t + d, 0) / CYCLE_SECONDS, h]),
  1,
  24,
);
const SUN_PATH = new Curve(SOLAR, 24, 360);
/** Hours since the first pacing knot (3.8 … 27.8), the clock's monotone timeline. */
function unwrap(hour: number): number {
  return hour < PACE[0][0] ? hour + 24 : hour;
}
/** Piecewise-linear lookup in a [hour, value] table. */
function track(table: [number, number][], h: number): number {
  let i = 1;
  while (i < table.length - 1 && table[i][0] < h) i++;
  const [h0, v0] = table[i - 1], [h1, v1] = table[i];
  return v0 + (v1 - v0) * THREE.MathUtils.clamp((h - h0) / (h1 - h0), 0, 1);
}


// TS twins of the GLSL optics, for the CPU-side light colours, ambient and haze.
function ch(X: number, mu: number): number {
  const y = Math.sqrt(0.5 * X) * mu;
  return Math.sqrt(2 * X) / (y + Math.sqrt(y * y + 1.2732395));
}
function depth(r: number, mu: number, H: number): number {
  const X = r / H, e = Math.exp((R - r) / H);
  if (mu >= 0) return e * ch(X, mu);
  const st = Math.sqrt(1 - mu * mu);
  return 2 * Math.exp(Math.min((R - r * st) / H, 30)) * ch(X * st, 0) - e * ch(X, -mu);
}
function transmittance(r: number, mu: number, out: THREE.Vector3): THREE.Vector3 {
  const dr = ATM.hr * depth(r, mu, ATM.hr), dO = ATM.ho * depth(r, mu, ATM.ho);
  const dm = (ATM.bm / 0.9) * ATM.hm * U.uSky.value.fog.w * depth(r, mu, ATM.hm);
  return out.set(
    Math.exp(-ATM.br[0] * dr - ATM.bo[0] * dO - dm),
    Math.exp(-ATM.br[1] * dr - ATM.bo[1] * dO - dm),
    Math.exp(-ATM.br[2] * dr - ATM.bo[2] * dO - dm),
  );
}
function planetShadow(r: number, mu: number, w: number): number {
  const dip = Math.sqrt(Math.max(0, 1 - (R * R) / (r * r)));
  return smoothstep(-dip - w, -dip + w, mu);
}
const daylight = (s: number) => 0.015 + smoothstep(-0.32, 0.12, s);
const hg = (mu: number, g: number) => (1 - g * g) / (4 * Math.PI * Math.pow(Math.max(1 + g * g - 2 * g * mu, 1e-4), 1.5));
const mie = (mu: number) => 0.6 * hg(mu, 0.8) + 0.4 * hg(mu, -0.3);
const luminance = (r: number, g: number, b: number) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const DEG = 180 / Math.PI;

// ---------------------------------------------------------------------------------------------
const MAX_SEGMENTS = 240;
const BOLT_ATTRIBUTES = ['position', 'aDir', 'aSide'];
const SEA_TINT = new THREE.Vector3(0.012, 0.05, 0.075);

export class Sky {
  readonly u = U;
  readonly env: Env = {
    hour: 17.5, sunDir: new THREE.Vector3(0, 1, 0), moonDir: new THREE.Vector3(0, -1, 0),
    ambient: new THREE.Color(0.3, 0.4, 0.5),
    night: 0, storm: 0, rain: 0, wet: 0, lightning: 0, lightningPos: new THREE.Vector3(), strikes: 0,
    windDir: new THREE.Vector3(), exposure: 1,
  };
  readonly lights = new Set<LightSource>();
  /** Raw sky + clouds around the player (world directions, HDR, one face refreshed per frame). */
  private readonly cube: THREE.CubeTexture;

  private readonly renderer: THREE.WebGLRenderer;
  private readonly rng: Rng; // lightning: seeded, so captures replay the same strikes
  private readonly key = new SunLight(0xffffff, 0);
  private readonly alt = new THREE.DirectionalLight(0xffffff, 0);
  private readonly fill = new THREE.HemisphereLight(0xffffff, 0xffffff, 0);
  private readonly points: THREE.PointLight[] = [];
  private readonly picked: (LightSource | null)[] = new Array(MAX_LIGHTS + 1).fill(null);
  private readonly pickedScore = new Float32Array(MAX_LIGHTS + 1);

  // the player's frame, carried along the sphere
  private readonly up = new THREE.Vector3();
  private readonly north = new THREE.Vector3();
  private readonly east = new THREE.Vector3();
  private readonly stormAxis = new THREE.Vector3();
  private framed = false;
  private lastPhase = -1;
  private readonly cloudQ = new THREE.Quaternion();

  // GPU passes
  private readonly pass = new THREE.Mesh(new THREE.BufferGeometry());
  private readonly passScene = new THREE.Scene();
  private readonly passCam = new THREE.Camera();
  private readonly lutMain: THREE.WebGLRenderTarget[];
  private readonly lutFocus: THREE.WebGLRenderTarget;
  private readonly lutMat: THREE.ShaderMaterial;
  private readonly skyMat: THREE.ShaderMaterial;
  private readonly skyCubeMat: THREE.ShaderMaterial;
  private readonly cubeRT: THREE.WebGLCubeRenderTarget;
  private readonly cubeCam: THREE.CubeCamera;
  private readonly cubeScene = new THREE.Scene();
  private cubeFace = 0;
  private coverFace = 0;
  private cubeTurn = 0;
  private boltBuilt = false;
  private lutFlip = 0;
  private readonly coverRT: THREE.WebGLCubeRenderTarget;
  private readonly coverMat: THREE.ShaderMaterial;
  private readonly skyMats: THREE.ShaderMaterial[];
  private readonly cloudMat: THREE.ShaderMaterial;
  private readonly cloudCubeMat: THREE.ShaderMaterial;
  private readonly resolveMat: THREE.ShaderMaterial;
  private readonly compositeMat: THREE.ShaderMaterial;
  private cloudCur: THREE.WebGLRenderTarget | null = null;
  private cloudHist: THREE.WebGLRenderTarget[] = [];
  private cloudFrame = 0;
  private readonly prevViewProj = new THREE.Matrix4();
  private camera: THREE.Camera | null = null;

  // lightning
  private readonly bolt: THREE.BufferGeometry;
  private readonly boltMat: THREE.ShaderMaterial;
  private readonly boltCubeMat: THREE.ShaderMaterial;
  private readonly boltMesh: THREE.Mesh;
  private readonly boltCube: THREE.Mesh;
  private readonly segPos: Float32Array;
  private readonly segDir: Float32Array;
  private readonly segSide: Float32Array;
  // channel points by branch depth: 64, 16 and 4 segments
  private readonly chain = [new Float32Array(65 * 3), new Float32Array(17 * 3), new Float32Array(5 * 3)];
  private segments = 0;
  private strikeAt = -100;
  private nextStrike = 0;
  private readonly strokes = new Float32Array(4);
  private strikeGain = 1;

  // scratch
  private readonly v1 = new THREE.Vector3();
  private readonly v2 = new THREE.Vector3();
  private readonly v3 = new THREE.Vector3();
  private readonly t1 = new THREE.Vector3();
  private readonly q1 = new THREE.Quaternion();
  private readonly m4 = new THREE.Matrix4();
  private readonly w: V3 = { x: 0, y: 0, z: 0 };
  private readonly sunT = new THREE.Vector3();
  private readonly moonT = new THREE.Vector3();
  private readonly amb = new THREE.Vector3();
  // sunlight at the eye's height over the player (0 once the disc is hidden from there), and moonlight
  // there (phase and silver tint included)
  private readonly sunColor = new THREE.Color();
  private readonly moonColor = new THREE.Color();
  private readonly sea = new THREE.Vector3();
  private readonly dir = new THREE.Vector3();
  private readonly ray = new THREE.Vector3();
  private readonly sp = new THREE.Vector3();
  private readonly st = new THREE.Vector3();
  private readonly lu = new THREE.Vector3();
  private readonly ends = Array.from({ length: 6 }, () => new THREE.Vector3());
  private readonly buffer = new THREE.Vector2();

  constructor(ctx: Ctx) {
    this.renderer = ctx.pipeline.renderer;
    this.rng = new Rng(ctx.seed ^ 0x1197);
    const scene = ctx.scene;
    scene.background = null;
    scene.fog = new THREE.Fog(0, 1, 2); // switches the patched fog chunks on; the parameters are unused

    // full-screen triangle shared by every pass and sky mesh
    const tri = new THREE.BufferGeometry();
    tri.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    this.pass.geometry = tri;
    this.pass.frustumCulled = false;
    this.pass.layers.enableAll(); // cloud passes render with the game camera while the pipeline narrows its layers
    this.passScene.add(this.pass);

    // cloud noise, generated once on the GPU
    const noise = new THREE.WebGL3DRenderTarget(NOISE, NOISE, NOISE, { depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
    noise.texture.wrapS = noise.texture.wrapT = noise.texture.wrapR = THREE.RepeatWrapping;
    const noiseMat = new THREE.ShaderMaterial({ vertexShader: PASS_VERT, fragmentShader: NOISE_FRAG, uniforms: { uZ: { value: 0 } } });
    this.pass.material = noiseMat;
    for (let z = 0; z < NOISE; z++) {
      noiseMat.uniforms.uZ.value = (z + 0.5) / NOISE;
      this.renderer.setRenderTarget(noise, z);
      this.renderer.render(this.passScene, this.passCam);
    }
    this.renderer.setRenderTarget(null);
    noiseMat.dispose();
    const sky = U.uSky.value;
    sky.noise = noise.texture;

    const trans = new THREE.WebGLRenderTarget(256, 64, { type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
    const transMat = new THREE.ShaderMaterial({ vertexShader: PASS_VERT, fragmentShader: TRANS_FRAG });
    this.pass.material = transMat;
    this.renderer.setRenderTarget(trans);
    this.renderer.render(this.passScene, this.passCam);
    this.renderer.setRenderTarget(null);
    transMat.dispose();
    sky.trans = trans.texture;

    const lutTarget = () => {
      const t = new THREE.WebGLRenderTarget(LUT_W, LUT_H, { type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
      t.texture.wrapS = THREE.RepeatWrapping;
      return t;
    };
    this.lutMain = [lutTarget(), lutTarget()];
    this.lutFocus = lutTarget();
    sky.lut = this.lutMain[0].texture;
    this.lutMat = new THREE.ShaderMaterial({
      vertexShader: PASS_VERT, fragmentShader: LUT_FRAG,
      uniforms: { uSky: U.uSky, uOrigin: { value: new THREE.Vector3() }, uX: { value: new THREE.Vector3() }, uY: { value: new THREE.Vector3() }, uUp: { value: new THREE.Vector3() }, uEh: { value: 0 } },
    });

    // the sky dome: drawn after the opaque scene, only where nothing else is
    const skyUniforms = (lut: THREE.WebGLRenderTarget) => ({
      uSky: U.uSky, uTime: U.uTime, tLut: { value: lut.texture as THREE.Texture },
      uLutOrigin: { value: new THREE.Vector3() }, uLutX: { value: new THREE.Vector3() }, uLutY: { value: new THREE.Vector3() },
      uLutUp: { value: new THREE.Vector3() }, uLutEh: { value: 0 }, uStarRot: { value: new THREE.Matrix3() },
      uMoonX: { value: new THREE.Vector3() }, uMoonY: { value: new THREE.Vector3() }, uStars: { value: 0 }, uSunDisc: { value: 1 },
      uSeaColor: { value: new THREE.Vector3() }, uJitter: { value: new THREE.Vector2() },
    });
    const skyMaterial = (lut: THREE.WebGLRenderTarget) => new THREE.ShaderMaterial({
      vertexShader: FULLSCREEN_VERT, fragmentShader: SKY_FRAG, uniforms: skyUniforms(lut), depthWrite: false, side: THREE.DoubleSide,
    });
    this.skyMat = skyMaterial(this.lutMain[0]);
    this.skyCubeMat = skyMaterial(this.lutFocus);
    this.skyCubeMat.uniforms.uSunDisc.value = 0; // the key light's specular already draws the sun in reflections
    this.skyMats = [this.skyMat, this.skyCubeMat];
    const dome = new THREE.Mesh(tri, this.skyMat);
    dome.frustumCulled = false;
    dome.renderOrder = 1e6;
    scene.add(dome);

    // clouds
    const stormX = { value: new THREE.Vector3(1, 0, 0) };
    const cloudUniforms = () => ({
      uSky: U.uSky, uStormX: stormX, uFocus: { value: new THREE.Vector3() },
      uLightDir: { value: new THREE.Vector3() }, uLightE: { value: new THREE.Vector3() },
      uAmbTop: { value: new THREE.Vector3() }, uAmbBottom: { value: new THREE.Vector3() },
      uFrame: { value: 0 }, uSteps: { value: 56 }, uJitter: { value: new THREE.Vector2() },
    });
    this.cloudMat = new THREE.ShaderMaterial({
      vertexShader: FULLSCREEN_VERT, fragmentShader: CLOUD_FRAG, uniforms: cloudUniforms(), glslVersion: THREE.GLSL3, depthTest: false, depthWrite: false,
    });
    this.cloudCubeMat = new THREE.ShaderMaterial({
      vertexShader: FULLSCREEN_VERT, fragmentShader: CLOUD_FRAG, uniforms: cloudUniforms(), glslVersion: THREE.GLSL3, defines: { CUBE: '' },
      depthTest: false, depthWrite: false, transparent: true, side: THREE.DoubleSide,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.SrcAlphaFactor,
    });
    this.cloudCubeMat.uniforms.uSteps.value = 28;
    this.resolveMat = new THREE.ShaderMaterial({
      vertexShader: FULLSCREEN_VERT, fragmentShader: RESOLVE_FRAG, glslVersion: THREE.GLSL3, depthTest: false, depthWrite: false,
      uniforms: {
        tColor: { value: null }, tDepth: { value: null }, tHistColor: { value: null }, tHistDepth: { value: null },
        uPrevViewProj: { value: this.prevViewProj }, uTexel: { value: new THREE.Vector2() }, uHistory: { value: 0 }, uJitter: { value: new THREE.Vector2() },
      },
    });
    this.compositeMat = new THREE.ShaderMaterial({
      vertexShader: FULLSCREEN_VERT, fragmentShader: COMPOSITE_FRAG, transparent: true, depthWrite: false,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.SrcAlphaFactor,
      uniforms: {
        tColor: { value: null }, tDepth: { value: null }, uProj: { value: new THREE.Matrix4() }, uFlashPos: U.uLightningPos, uFlashColor: { value: new THREE.Vector3() },
        uJitter: { value: new THREE.Vector2() },
      },
    });
    const clouds = new THREE.Mesh(tri, this.compositeMat);
    clouds.frustumCulled = false;
    clouds.renderOrder = -100; // first of the layer, under rain, spray and mist
    clouds.layers.set(LAYER.OVER);
    clouds.onBeforeRender = (renderer, _scene, camera) => this.renderClouds(renderer, camera);
    scene.add(clouds);

    // reflection cube: sky, clouds and the lightning around the player
    this.cubeRT = new THREE.WebGLCubeRenderTarget(CUBE, { type: THREE.HalfFloatType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false });
    this.cube = this.cubeRT.texture;
    U.tSkyCube.value = sky.env = this.cube;
    this.coverRT = new THREE.WebGLCubeRenderTarget(COVER_RES, { type: THREE.HalfFloatType, generateMipmaps: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false });
    sky.cover = this.coverRT.texture;
    this.coverMat = new THREE.ShaderMaterial({ vertexShader: FULLSCREEN_VERT, fragmentShader: COVER_FRAG, uniforms: { uSky: U.uSky, uJitter: { value: new THREE.Vector2() } }, side: THREE.DoubleSide });
    this.cubeCam = new THREE.CubeCamera(0.1, 10, this.cubeRT);
    this.cubeCam.coordinateSystem = THREE.WebGLCoordinateSystem;
    this.cubeCam.updateCoordinateSystem();
    const skyCube = new THREE.Mesh(tri, this.skyCubeMat);
    const cloudCube = new THREE.Mesh(tri, this.cloudCubeMat);
    skyCube.frustumCulled = cloudCube.frustumCulled = false;
    cloudCube.renderOrder = 1;
    this.cubeScene.add(skyCube, cloudCube);

    // lightning channel geometry, rewritten for each strike
    this.segPos = new Float32Array(MAX_SEGMENTS * 12);
    this.segDir = new Float32Array(MAX_SEGMENTS * 12);
    this.segSide = new Float32Array(MAX_SEGMENTS * 12);
    const index: number[] = [];
    for (let s = 0; s < MAX_SEGMENTS; s++) index.push(s * 4, s * 4 + 1, s * 4 + 2, s * 4 + 2, s * 4 + 1, s * 4 + 3);
    this.bolt = new THREE.BufferGeometry();
    this.bolt.setIndex(index);
    this.bolt.setAttribute('position', new THREE.BufferAttribute(this.segPos, 3).setUsage(THREE.DynamicDrawUsage));
    this.bolt.setAttribute('aDir', new THREE.BufferAttribute(this.segDir, 3).setUsage(THREE.DynamicDrawUsage));
    this.bolt.setAttribute('aSide', new THREE.BufferAttribute(this.segSide, 3).setUsage(THREE.DynamicDrawUsage));
    this.bolt.setDrawRange(0, 0);
    const boltMaterial = (clouded: boolean) => new THREE.ShaderMaterial({
      vertexShader: BOLT_VERT, fragmentShader: BOLT_FRAG, defines: clouded ? { CLOUDED: '' } : {},
      uniforms: { uBolt: { value: 0 }, tCloud: { value: null }, tCloudDepth: { value: null }, uResolution: { value: new THREE.Vector2(1, 1) } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    this.boltMat = boltMaterial(true);
    this.boltCubeMat = boltMaterial(false);
    this.boltMat.uniforms.uBolt = this.boltCubeMat.uniforms.uBolt;
    this.boltMesh = new THREE.Mesh(this.bolt, this.boltMat);
    this.boltCube = new THREE.Mesh(this.bolt, this.boltCubeMat);
    this.boltMesh.frustumCulled = this.boltCube.frustumCulled = false;
    this.boltMesh.renderOrder = -50; // just after the clouds
    this.boltMesh.layers.set(LAYER.OVER);
    this.boltMesh.visible = this.boltCube.visible = false;
    this.boltCube.renderOrder = 2;
    scene.add(this.boltMesh);
    this.cubeScene.add(this.boltCube);

    // lights: the key (sun or moon) casts cascaded shadows; the other body lights the far side
    const shadow = this.key.shadow;
    shadow.mapSize.set(SHADOW_SIZE, SHADOW_SIZE);
    shadow.bias = -0.0003;
    shadow.normalBias = 0.035;
    shadow.radius = 2.5;
    shadow.camera.near = 0.5;
    shadow.autoUpdate = false;
    this.key.castShadow = true;
    U.uKeyShadowMatrix.value = shadow.getMatrix(0);
    U.uKeyShadowMatrixFar.value = shadow.getMatrix(1);
    U.uKeyShadowSplit.value = (shadow as unknown as { _cascadeData: THREE.Vector4[] })._cascadeData[0];
    // until the first shadow render, bind a compare-mode depth texture so shadow samplers never see a colour one
    const placeholder = new THREE.DepthTexture(1, 1);
    placeholder.compareFunction = THREE.LessEqualCompare;
    ctx.pipeline.renderer.initRenderTarget(new THREE.WebGLRenderTarget(1, 1, { depthTexture: placeholder }));
    U.tKeyShadow.value = placeholder;
    scene.add(this.key, this.alt, this.fill);
    for (let i = 0; i < POINT_LIGHTS; i++) {
      const p = new THREE.PointLight(0xffffff, 0, 1, 2);
      this.points.push(p);
      scene.add(p);
    }
    for (const l of [this.key, this.alt, this.fill, ...this.points]) l.layers.enableAll(); // lit in the WATER/OVER pass too
  }

  /** Map the cycle phase (0..1) to local hour and back, so main can set an hour directly. */
  hourOf(phase: number): number {
    return CLOCK.at(phase) % 24;
  }
  phaseOf(hour: number): number {
    return CLOCK.inverse(unwrap(((hour % 24) + 24) % 24));
  }

  update(f: Frame): void {
    const env = this.env, sky = U.uSky.value;
    const jump = this.lastPhase < 0 || Math.abs(f.cycle - this.lastPhase) > 0.004;
    this.lastPhase = f.cycle;
    this.camera = f.camera;
    this.carryFrame(f.focus);
    const hour = (env.hour = this.hourOf(f.cycle));
    const h = unwrap(hour);

    // sun and moon on their arcs around the celestial pole tilted by the latitude
    const ha = THREE.MathUtils.degToRad(SUN_PATH.at(hour));
    this.body(ha, SUN_DEC, env.sunDir);
    this.body(ha - MOON_LAG, MOON_DEC, env.moonDir);
    const sinS = env.sunDir.dot(this.up), sinM = env.moonDir.dot(this.up);

    // weather
    const off = track(STORM, h);
    const storm = (env.storm = smoothstep(+STORM_OUT, +STORM_IN, Math.cos(off)));
    env.rain = smoothstep(0.55, 0.9, storm);
    env.wet = hour < 16.3 ? smoothstep(13.3, 13.9, hour) : smoothstep(19.4, 16.3, hour);
    wind(this.up, f.simTime, this.w);
    env.windDir.set(this.w.x, this.w.y, this.w.z);
    // the storm comes from upwind; its approach bearing follows the wind slowly
    this.v1.copy(env.windDir).negate().normalize();
    if (this.v1.lengthSq() > 0.5) this.stormAxis.lerp(this.v1, 1 - Math.exp(-f.dt * 0.03)).projectOnPlane(this.up).normalize();
    sky.stormCenter.copy(this.up).multiplyScalar(Math.cos(off)).addScaledVector(this.stormAxis, Math.sin(off));
    const arms = this.cloudMat.uniforms.uStormX.value as THREE.Vector3;
    arms.crossVectors(this.up, this.stormAxis).normalize().applyAxisAngle(sky.stormCenter, f.t * 0.012);
    // the cloud field rides the wind at the player as a rigid rotation of the shell
    const ws = env.windDir.length();
    if (ws > 1e-4) {
      this.v1.crossVectors(this.up, env.windDir).normalize();
      this.cloudQ.premultiply(this.q1.setFromAxisAngle(this.v1, (ws * 2.6 * f.dt) / (R + 30))).normalize();
    }
    sky.cloudRot.setFromMatrix4(this.m4.makeRotationFromQuaternion(this.q1.copy(this.cloudQ).invert()));
    sky.cloud.set(track(COVER, hour) * (1 - 0.3 * storm), 0.82, f.t * 0.0015, 0);
    sky.fog.set(track(HAZE, hour) + 2.6 * storm, 2.2, 4, track(AEROSOL, hour) + 3 * storm);
    sky.wet = env.wet;
    sky.focusUp.copy(this.up);
    // the shared sky gives way to the true terminator as the camera rises, and in the globe menu
    sky.nearby = f.paused ? 0 : 1 - smoothstep(200, 500, f.camera.position.distanceTo(f.focus));
    // the higher the camera, the farther it sees and the farther the shared sky reaches, so a swoop over
    // the sea keeps the hour's light out to the horizon
    const reach = 0.45 + 0.65 * smoothstep(15, 60, f.camera.position.length() - R);
    sky.reach.set(Math.cos(reach + 0.45), Math.cos(reach));

    this.light(f, sinS, sinM, storm);
    this.lightning(f, storm);
    this.pickLights(f.camera.position);

    // shared uniforms
    U.uTime.value = f.t;
    U.uSimTime.value = f.simTime;
    U.uCamPos.value.copy(f.camera.position);
    U.uAmbient.value.copy(env.ambient);
    U.uNight.value = env.night;
    U.uStorm.value = storm;
    U.uRain.value = env.rain;
    U.uLightning.value = U.uSky.value.lightning = env.lightning;
    const map = this.key.shadow.map;
    if (map?.depthTexture) {
      U.tKeyShadow.value = map.depthTexture;
      U.uShadowOn.value = 1;
    }

    this.renderSky(f, jump);
  }

  /** Carry the north/east tangents with the focus (parallel transport), so the sky never spins. */
  private carryFrame(focus: THREE.Vector3): void {
    this.v1.copy(focus).normalize();
    if (!this.framed) {
      this.up.copy(this.v1);
      this.north.set(0, 1, 0).projectOnPlane(this.up);
      if (this.north.lengthSq() < 1e-6) this.north.set(0, 0, 1).projectOnPlane(this.up);
      this.north.normalize();
      this.stormAxis.copy(this.north).negate();
      this.framed = true;
    } else if (this.v1.dot(this.up) > -0.999) {
      this.q1.setFromUnitVectors(this.up, this.v1);
      this.north.applyQuaternion(this.q1);
      this.stormAxis.applyQuaternion(this.q1);
      this.up.copy(this.v1);
    }
    this.north.projectOnPlane(this.up).normalize();
    this.east.crossVectors(this.north, this.up);
  }

  /** Direction of a body at hour angle ha and declination dec in the player's sky. */
  private body(ha: number, dec: number, out: THREE.Vector3): THREE.Vector3 {
    const cl = Math.cos(LAT), sl = Math.sin(LAT);
    // celestial equator: noon meridian point S0 and east; pole A
    this.v2.copy(this.up).multiplyScalar(cl).addScaledVector(this.north, -sl);
    this.v3.copy(this.north).multiplyScalar(cl).addScaledVector(this.up, sl);
    return out.copy(this.v2).multiplyScalar(Math.cos(ha) * Math.cos(dec))
      .addScaledVector(this.east, -Math.sin(ha) * Math.cos(dec))
      .addScaledVector(this.v3, Math.sin(dec)).normalize();
  }

  /** Key/alt/fill lights, CPU light colours, ambient, haze and exposure. */
  private light(f: Frame, sinS: number, sinM: number, storm: number): void {
    const env = this.env, sky = U.uSky.value;
    // light as it reaches the eye's height: what the camera sees falling on sails and spray, so the
    // colours stay those of the disc in view until it sets behind the curved horizon
    const r = R + THREE.MathUtils.clamp(f.camera.position.length() - R, 0.5, 10);
    transmittance(r, sinS, this.sunT).multiplyScalar(planetShadow(r, sinS, 0.01));
    transmittance(r, sinM, this.moonT).multiplyScalar(planetShadow(r, sinM, 0.01));
    // the moon's phase follows its angle from the sun (Lambert sphere)
    const alpha = Math.acos(THREE.MathUtils.clamp(-env.sunDir.dot(env.moonDir), -1, 1));
    const phase = ((Math.PI - alpha) * Math.cos(alpha) + Math.sin(alpha)) / Math.PI;
    sky.sunDir.copy(env.sunDir);
    sky.moonDir.copy(env.moonDir);
    sky.moonE.copy(SUN_E).multiply(MOON_TINT).multiplyScalar(MOON_E * phase);
    const dim = 1 - 0.88 * storm;
    const sunColor = this.sunColor
      .setRGB(SUN_E.x * this.sunT.x, SUN_E.y * this.sunT.y, SUN_E.z * this.sunT.z).multiplyScalar(dim);
    const moonColor = this.moonColor
      .setRGB(sky.moonE.x * this.moonT.x, sky.moonE.y * this.moonT.y, sky.moonE.z * this.moonT.z).multiplyScalar(dim);

    // handover: the sun keys until nothing near the player sees it, the moon after; both are dark at
    // the swap, so the shadow direction changes unseen
    const sunW = smoothstep(-0.33, -0.25, sinS), moonW = smoothstep(-0.34, -0.45, sinS) * smoothstep(-0.05, 0.08, sinM);
    const sunKey = sunW > 0;
    U.uKeyDir.value.copy(sunKey ? env.sunDir : env.moonDir);
    U.uKeyColor.value.copy(sunKey ? sunColor : moonColor).multiplyScalar(sunKey ? sunW : moonW);
    this.key.position.copy(U.uKeyDir.value);
    if (sunKey) this.key.color.setRGB(SUN_E.x, SUN_E.y, SUN_E.z).multiplyScalar(sunW);
    else this.key.color.setRGB(sky.moonE.x, sky.moonE.y, sky.moonE.z).multiplyScalar(moonW);
    this.key.intensity = 1;
    this.alt.position.copy(sunKey ? env.moonDir : env.sunDir);
    if (sunKey) this.alt.color.setRGB(sky.moonE.x, sky.moonE.y, sky.moonE.z);
    else this.alt.color.setRGB(SUN_E.x, SUN_E.y, SUN_E.z);
    this.alt.intensity = 1;
    sky.altMoon = sunKey ? 1 : 0;
    this.key.shadow.needsUpdate = true;
    this.key.shadow.camera.far = 150 + 1.3 * f.camera.position.distanceTo(f.focus);

    // sky radiance at a few directions around the player: ambient, the haze colour, cloud lighting
    const o = this.v3.copy(this.up).multiplyScalar(R + 2);
    const amb = this.amb.set(0, 0, 0);
    let wsum = 0;
    for (let i = 0; i < 9; i++) {
      const el = i === 0 ? Math.PI / 2 : i < 5 ? 0.6 : 0.04, az = (i % 4) * (Math.PI / 2);
      this.dir.copy(this.north).multiplyScalar(Math.cos(az) * Math.cos(el)).addScaledVector(this.east, Math.sin(az) * Math.cos(el)).addScaledVector(this.up, Math.sin(el));
      const c = this.scatter(o, this.dir);
      const wt = i < 5 ? 1 : 0.5;
      amb.addScaledVector(c, wt);
      wsum += wt;
    }
    amb.multiplyScalar(1 / wsum);
    // storm overcast: dimmer, greyer
    const grey = luminance(amb.x, amb.y, amb.z);
    amb.lerp(this.v2.set(grey, grey * 1.04, grey * 1.1), storm * 0.7).multiplyScalar(1 - 0.72 * storm);
    env.ambient.setRGB(amb.x, amb.y, amb.z);
    sky.fogTint.set(1, 1, 1).lerp(this.v2.set(0.3, 0.33, 0.37), storm);
    sky.sunHaze.copy(this.sunT).multiply(SUN_E).multiplyScalar(0.05 * (1 - storm));
    sky.ambInv = 1 / daylight(sinS);
    env.night = smoothstep(0.05, -0.36, sinS);

    // fill keeps shadow sides readable: a share of the sky light by day, more at night, and the flash
    const nightFill = smoothstep(-0.1, -0.4, sinS);
    const k = 0.5 + 1.6 * nightFill;
    this.fill.position.copy(this.up);
    this.fill.color.setRGB(amb.x * Math.PI * k + 0.003 * nightFill, amb.y * Math.PI * k + 0.0045 * nightFill, amb.z * Math.PI * k + 0.009 * nightFill);
    const sea = this.sea.copy(SEA_TINT).multiplyScalar(grey * 3 + luminance(sunColor.r, sunColor.g, sunColor.b) * 0.06);
    this.fill.groundColor.setRGB(sea.x * k, sea.y * k, sea.z * k);
    this.fill.intensity = 1 + env.lightning * 25;
    (this.skyMat.uniforms.uSeaColor.value as THREE.Vector3).copy(sea);
    (this.skyCubeMat.uniforms.uSeaColor.value as THREE.Vector3).copy(sea);

    // exposure along the hour's curve, a little higher under the storm and on moonless nights; from high
    // up it follows how much of the planet in view is in daylight
    const cam = f.camera.position, high = smoothstep(200, 500, cam.distanceTo(f.focus));
    const lit = smoothstep(-0.55, 0.35, this.v2.copy(cam).normalize().dot(env.sunDir));
    const local = track(EXPOSURE, Math.asin(sinS) * DEG) * (1 + 0.45 * storm) * (1 + 0.2 * env.night * (1 - smoothstep(-0.05, 0.3, sinM)));
    env.exposure = THREE.MathUtils.lerp(local, THREE.MathUtils.lerp(2.1, 1, lit), high);

    // clouds take light from the sun until it is gone from their height, then from the moon
    const cloudSun = sinS > -0.5;
    const cu = this.cloudMat.uniforms, cc = this.cloudCubeMat.uniforms;
    (cu.uLightDir.value as THREE.Vector3).copy(cloudSun ? env.sunDir : env.moonDir);
    (cu.uLightE.value as THREE.Vector3).copy(cloudSun ? SUN_E : sky.moonE).multiplyScalar(cloudSun ? 1 : smoothstep(-0.5, -0.62, sinS));
    (cu.uAmbTop.value as THREE.Vector3).copy(amb).multiplyScalar(1.15);
    (cu.uAmbBottom.value as THREE.Vector3).copy(sea).multiplyScalar(1.6).addScaledVector(amb, 0.35);
    (cu.uFocus.value as THREE.Vector3).copy(f.focus);
    (cc.uLightDir.value as THREE.Vector3).copy(cu.uLightDir.value);
    (cc.uLightE.value as THREE.Vector3).copy(cu.uLightE.value);
    (cc.uAmbTop.value as THREE.Vector3).copy(cu.uAmbTop.value);
    (cc.uAmbBottom.value as THREE.Vector3).copy(cu.uAmbBottom.value);
    const flash = this.compositeMat.uniforms.uFlashColor.value as THREE.Vector3;
    flash.set(0.75, 0.8, 1).multiplyScalar(env.lightning * 2.5);
  }

  /** Twin of skyLightUp() in SKY_GLSL. */
  private lightUp(p: THREE.Vector3): THREE.Vector3 {
    const sky = U.uSky.value, u = this.lu.copy(p).normalize();
    return u.lerp(sky.focusUp, sky.nearby * smoothstep(sky.reach.x, sky.reach.y, u.dot(sky.focusUp))).normalize();
  }

  /** CPU single scattering along one ray (sun and moon), the twin of skyScatter() in the LUT. */
  private scatter(o: THREE.Vector3, d: THREE.Vector3): THREE.Vector3 {
    const env = this.env, sky = U.uSky.value, out = this.ray.set(0, 0, 0);
    const b = o.dot(d), c = o.lengthSq();
    const t1 = -b + Math.sqrt(b * b - c + ATM.top * ATM.top);
    const muS = d.dot(env.sunDir), muM = d.dot(env.moonDir);
    const prS = 0.0596831 * (1 + muS * muS), prM = 0.0596831 * (1 + muM * muM), pmS = mie(muS), pmM = mie(muM);
    let od0 = 0, od1 = 0, od2 = 0;
    const n = 10, p = this.sp;
    for (let i = 0; i < n; i++) {
      const t = ((i + 0.5) / n) ** 1.6 * t1, dt = (((i + 1) / n) ** 1.6 - (i / n) ** 1.6) * t1;
      p.copy(o).addScaledVector(d, t);
      const r = p.length(), hh = r - R;
      const dr = Math.exp(-hh / ATM.hr), dm = Math.exp(-hh / ATM.hm) * sky.fog.w, dO = Math.exp(-hh / ATM.ho);
      const e0 = ATM.br[0] * dr + dm * ATM.bm / 0.9 + ATM.bo[0] * dO;
      const e1 = ATM.br[1] * dr + dm * ATM.bm / 0.9 + ATM.bo[1] * dO;
      const e2 = ATM.br[2] * dr + dm * ATM.bm / 0.9 + ATM.bo[2] * dO;
      const tv0 = Math.exp(-od0 - 0.5 * e0 * dt), tv1 = Math.exp(-od1 - 0.5 * e1 * dt), tv2 = Math.exp(-od2 - 0.5 * e2 * dt);
      od0 += e0 * dt; od1 += e1 * dt; od2 += e2 * dt;
      const lu = this.lightUp(p), ms = lu.dot(env.sunDir), mm = lu.dot(env.moonDir);
      const ls = transmittance(r, ms, this.st).multiply(SUN_E).multiplyScalar(planetShadow(r, ms, 0.05));
      const lsx = ls.x, lsy = ls.y, lsz = ls.z;
      const lm = transmittance(r, mm, this.st).multiply(sky.moonE).multiplyScalar(planetShadow(r, mm, 0.05) * MOON_SKY);
      const sM = ATM.bm * dm;
      out.x += tv0 * (ATM.br[0] * dr * (prS * lsx + prM * lm.x) + sM * (pmS * lsx + pmM * lm.x) + (ATM.br[0] * dr * ATM.br[0] / ATM.br[2] + sM) * (lsx + lm.x) * SKY_MS) * dt;
      out.y += tv1 * (ATM.br[1] * dr * (prS * lsy + prM * lm.y) + sM * (pmS * lsy + pmM * lm.y) + (ATM.br[1] * dr * ATM.br[1] / ATM.br[2] + sM) * (lsy + lm.y) * SKY_MS) * dt;
      out.z += tv2 * (ATM.br[2] * dr * (prS * lsz + prM * lm.z) + sM * (pmS * lsz + pmM * lm.z) + (ATM.br[2] * dr + sM) * (lsz + lm.z) * SKY_MS) * dt;
    }
    return out;
  }

  /** Strikes while the storm is overhead: a branching bolt (or a flash inside the cloud) and its glow. */
  private lightning(f: Frame, storm: number): void {
    const env = this.env;
    if (storm > 0.75 && f.t > this.nextStrike) {
      this.strike(f);
      this.nextStrike = f.t + 3 + (-Math.log(1 - this.rng.next()) * 60) / (3 + 8 * (storm - 0.75));
    } else if (storm <= 0.75) this.nextStrike = Math.max(this.nextStrike, f.t + 2);
    const age = f.t - this.strikeAt;
    let flash = 0;
    for (const s of this.strokes) if (age >= s) flash = Math.max(flash, Math.exp(-(age - s) / 0.05));
    if (age < 0.08) flash = Math.max(flash, 0.25 * (age / 0.08));
    env.lightning = flash * this.strikeGain;
    U.uLightningPos.value.copy(env.lightningPos);
    this.boltMat.uniforms.uBolt.value = flash;
    this.boltMesh.visible = this.boltCube.visible = this.segments > 0 && flash > 0.01;
  }

  private strike(f: Frame): void {
    const env = this.env;
    this.strikeAt = f.t;
    env.strikes++;
    const n = 2 + this.rng.int(3);
    for (let i = 0; i < 4; i++) this.strokes[i] = i < n ? i * (0.06 + this.rng.next() * 0.1) : 1e9;
    // somewhere under the storm around the player, rarely right on top
    const az = this.rng.next() * Math.PI * 2, dist = 30 + this.rng.next() * 90;
    this.v1.copy(this.north).multiplyScalar(Math.cos(az)).addScaledVector(this.east, Math.sin(az));
    const ground = this.ends[1].copy(this.up).applyAxisAngle(this.v3.crossVectors(this.up, this.v1).normalize(), dist / R).multiplyScalar(R);
    const top = this.ends[0].copy(ground).normalize().multiplyScalar(R + CLOUD_LO + 2 + this.rng.next() * 4)
      .addScaledVector(this.v1, (this.rng.next() - 0.5) * 16);
    this.strikeGain = THREE.MathUtils.clamp(70 / ground.distanceTo(f.camera.position), 0.25, 1);
    env.lightningPos.copy(ground).lerp(top, 0.7);
    this.segments = 0;
    if (this.rng.next() < 0.7) this.channel(top, ground, 6, 0, 0.7, 1);
    for (const name of BOLT_ATTRIBUTES) {
      const a = this.bolt.getAttribute(name) as THREE.BufferAttribute;
      a.clearUpdateRanges();
      a.addUpdateRange(0, this.segments * 12);
      a.needsUpdate = true;
    }
    this.bolt.setDrawRange(0, this.segments * 6);
  }

  /** Jagged channel by midpoint displacement, forking into thinner, dimmer branches. */
  private channel(from: THREE.Vector3, to: THREE.Vector3, levels: number, depth: number, width: number, bright: number): void {
    const pts = this.chain[depth], n = 1 << levels;
    pts[0] = from.x; pts[1] = from.y; pts[2] = from.z;
    pts[n * 3] = to.x; pts[n * 3 + 1] = to.y; pts[n * 3 + 2] = to.z;
    const len = from.distanceTo(to);
    for (let step = n; step > 1; step >>= 1) {
      const amp = len * (step / n) * 0.22;
      for (let i = step >> 1; i < n; i += step) {
        const a = (i - (step >> 1)) * 3, b = (i + (step >> 1)) * 3, m = i * 3;
        for (let c = 0; c < 3; c++) pts[m + c] = (pts[a + c] + pts[b + c]) / 2 + (this.rng.next() - 0.5) * amp;
      }
    }
    for (let i = 0; i < n && this.segments < MAX_SEGMENTS; i++) {
      const k = i / n, s = this.segments * 12, a = i * 3, b = a + 3;
      for (let v = 0; v < 4; v++) {
        const o = s + v * 3, p = v < 2 ? a : b;
        for (let c = 0; c < 3; c++) {
          this.segPos[o + c] = pts[p + c];
          this.segDir[o + c] = pts[b + c] - pts[a + c];
        }
        this.segSide[o] = v % 2 ? 1 : -1;
        this.segSide[o + 1] = width * (1 - 0.5 * k);
        this.segSide[o + 2] = bright * (1 - 0.4 * k);
      }
      this.segments++;
      if (depth < 2 && this.rng.next() < (depth === 0 ? 0.14 : 0.1)) {
        const start = this.ends[2 + depth * 2].fromArray(pts, a), end = this.ends[3 + depth * 2];
        end.set(this.rng.next() - 0.5, this.rng.next() - 0.5, this.rng.next() - 0.5).multiplyScalar(1.6)
          .add(this.v2.subVectors(to, from).normalize()).normalize()
          .multiplyScalar(len * (1 - k) * (0.25 + this.rng.next() * 0.3)).add(start);
        this.channel(start, end, levels - 2, depth + 1, width * 0.55, bright * 0.5);
      }
    }
  }

  /** The nearest registered lights, by distance beyond their reach from the camera. */
  private pickLights(ref: THREE.Vector3): void {
    const best = this.picked, score = this.pickedScore, cap = MAX_LIGHTS + 1;
    let count = 0;
    for (const l of this.lights) {
      if (l.intensity <= 0) continue;
      const s = l.pos.distanceTo(ref) - l.range;
      if (count === cap && s >= score[cap - 1]) continue;
      let i = count < cap ? count++ : cap - 1;
      for (; i > 0 && score[i - 1] > s; i--) {
        best[i] = best[i - 1];
        score[i] = score[i - 1];
      }
      best[i] = l;
      score[i] = s;
    }
    // lights fade out before they drop off the list, so none pops
    const fade = (i: number, n: number) => (count > n ? THREE.MathUtils.clamp((score[n] - score[i]) / 8, 0, 1) : 1);
    const n = Math.min(count, MAX_LIGHTS);
    for (let i = 0; i < MAX_LIGHTS; i++) {
      const l = best[i];
      if (i < n && l) {
        U.uLightPos.value[i].copy(l.pos);
        U.uLightColor.value[i].copy(l.color).multiplyScalar(l.intensity * fade(i, MAX_LIGHTS));
        U.uLightRange.value[i] = l.range;
      }
    }
    U.uLightCount.value = n;
    for (let i = 0; i < POINT_LIGHTS; i++) {
      const p = this.points[i], l = best[i];
      if (i < count && l) {
        p.position.copy(l.pos);
        p.color.copy(l.color);
        p.intensity = l.intensity * fade(i, POINT_LIGHTS);
        p.distance = l.range;
      } else p.intensity = 0;
    }
  }

  /** Sky-view LUTs, star and moon frames, the cumulus cover, one sky-cube face per frame. */
  private renderSky(f: Frame, jump: boolean): void {
    const renderer = this.renderer, env = this.env, sky = U.uSky.value;
    const target = renderer.getRenderTarget(), face = renderer.getActiveCubeFace(), mip = renderer.getActiveMipmapLevel();
    const lut = (origin: THREE.Vector3, rt: THREE.WebGLRenderTarget, mat: THREE.ShaderMaterial) => {
      const lu = this.lutMat.uniforms, mu = mat.uniforms;
      const up = (lu.uUp.value as THREE.Vector3).copy(origin).normalize();
      const x = (lu.uX.value as THREE.Vector3).copy(env.sunDir).projectOnPlane(up);
      if (x.lengthSq() < 1e-8) x.copy(this.north);
      x.normalize();
      (lu.uY.value as THREE.Vector3).crossVectors(up, x);
      (lu.uOrigin.value as THREE.Vector3).copy(origin);
      lu.uEh.value = -Math.acos(Math.min(R / Math.max(origin.length(), R + 0.01), 1));
      (mu.uLutOrigin.value as THREE.Vector3).copy(origin);
      (mu.uLutX.value as THREE.Vector3).copy(x);
      (mu.uLutY.value as THREE.Vector3).copy(lu.uY.value);
      (mu.uLutUp.value as THREE.Vector3).copy(up);
      mu.uLutEh.value = lu.uEh.value;
      this.pass.material = this.lutMat;
      renderer.setRenderTarget(rt);
      renderer.render(this.passScene, this.passCam);
    };
    // the haze in every material samples the main LUT, so it is double-buffered
    const main = this.lutMain[(this.lutFlip ^= 1)];
    lut(f.camera.position, main, this.skyMat);
    sky.lut = this.skyMat.uniforms.tLut.value = main.texture;
    sky.lutX.copy(this.skyMat.uniforms.uLutX.value);
    sky.lutY.copy(this.skyMat.uniforms.uLutY.value);
    // the reflection cube looks out from the sea at the player: its own LUT once the camera is away
    const eye = this.t1.copy(this.up).multiplyScalar(R + 2);
    const near = f.camera.position.distanceTo(eye) < 30;
    if (near) {
      const mu = this.skyCubeMat.uniforms, su = this.skyMat.uniforms;
      mu.tLut.value = main.texture;
      (mu.uLutOrigin.value as THREE.Vector3).copy(su.uLutOrigin.value);
      (mu.uLutX.value as THREE.Vector3).copy(su.uLutX.value);
      (mu.uLutY.value as THREE.Vector3).copy(su.uLutY.value);
      (mu.uLutUp.value as THREE.Vector3).copy(su.uLutUp.value);
      mu.uLutEh.value = su.uLutEh.value;
    } else {
      this.skyCubeMat.uniforms.tLut.value = this.lutFocus.texture;
      lut(eye, this.lutFocus, this.skyCubeMat);
    }

    // stars turn with the sky about the celestial pole; the moon keeps one face to the planet
    const ha = THREE.MathUtils.degToRad(SUN_PATH.at(env.hour));
    const pole = this.v3.copy(this.north).multiplyScalar(Math.cos(LAT)).addScaledVector(this.up, Math.sin(LAT));
    const c1 = this.v2.copy(this.up).multiplyScalar(Math.cos(LAT)).addScaledVector(this.north, -Math.sin(LAT)).multiplyScalar(Math.cos(ha)).addScaledVector(this.east, -Math.sin(ha));
    const c2 = this.v1.crossVectors(pole, c1);
    const night = smoothstep(-0.3, -0.55, env.sunDir.dot(this.up));
    const moonGlare = smoothstep(-0.1, 0.3, env.moonDir.dot(this.up)) * 0.45;
    for (const m of this.skyMats) {
      (m.uniforms.uStarRot.value as THREE.Matrix3).set(c1.x, c1.y, c1.z, c2.x, c2.y, c2.z, pole.x, pole.y, pole.z);
      const mx = (m.uniforms.uMoonX.value as THREE.Vector3).crossVectors(env.moonDir, pole).normalize();
      (m.uniforms.uMoonY.value as THREE.Vector3).crossVectors(mx, env.moonDir).normalize();
      m.uniforms.uStars.value = night * (1 - moonGlare) * (1 - env.storm);
    }

    // the cumulus cover and the sky cube from the sea at the player (whose mips light every material)
    // change slowly: one face of one of them a frame, everything after a jump. A cube is unbound from
    // the shared struct while it is being drawn into.
    this.cubeCam.position.copy(eye);
    this.cubeCam.updateMatrixWorld(true);
    const turn = (this.cubeTurn ^= 1);
    if (jump || turn === 0) {
      this.pass.material = this.coverMat;
      sky.cover = null;
      for (let i = 0; i < (jump ? 6 : 1); i++) {
        this.coverFace = (this.coverFace + 1) % 6;
        renderer.setRenderTarget(this.coverRT, this.coverFace);
        renderer.render(this.passScene, this.cubeCam.children[this.coverFace] as THREE.Camera);
      }
      sky.cover = this.coverRT.texture;
    }
    if (jump || turn === 1) {
      sky.env = null;
      // the first full redraw also builds the bolt's program (drawing nothing), never mid-storm
      const bolt = this.boltCube.visible;
      this.boltCube.visible ||= !this.boltBuilt;
      this.boltBuilt = true;
      for (let i = 0; i < (jump ? 6 : 1); i++) {
        this.cubeFace = (this.cubeFace + 1) % 6;
        renderer.setRenderTarget(this.cubeRT, this.cubeFace);
        renderer.render(this.cubeScene, this.cubeCam.children[this.cubeFace] as THREE.Camera);
      }
      this.boltCube.visible = bolt;
      sky.env = this.cube;
    }
    renderer.setRenderTarget(target, face, mip);
  }

  /** Clouds for the main view: march at reduced resolution, accumulate over frames, then composite. */
  private renderClouds(renderer: THREE.WebGLRenderer, camera: THREE.Camera): void {
    if (camera !== this.camera) return;
    const target = renderer.getRenderTarget(), face = renderer.getActiveCubeFace(), mip = renderer.getActiveMipmapLevel();
    const size = target ? this.buffer.set(target.width, target.height) : renderer.getDrawingBufferSize(this.buffer);
    const s = Math.min(0.5, CLOUD_ROWS / size.y), w = Math.ceil(size.x * s), h = Math.ceil(size.y * s);
    if (!this.cloudCur || this.cloudCur.width !== w || this.cloudCur.height !== h) {
      const make = () => new THREE.WebGLRenderTarget(w, h, { count: 2, type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
      this.cloudCur?.dispose();
      for (const t of this.cloudHist) t.dispose();
      this.cloudCur = make();
      this.cloudHist = [make(), make()];
      this.resolveMat.uniforms.uHistory.value = 0;
      this.boltMat.uniforms.uResolution.value.set(size.x, size.y);
    }
    const frame = this.cloudFrame++;
    const jit = this.cloudMat.uniforms.uJitter.value as THREE.Vector2;
    jit.set((((frame * 0.7548777) % 1) - 0.5) * 2 / w, (((frame * 0.5698403) % 1) - 0.5) * 2 / h);
    this.cloudMat.uniforms.uFrame.value = frame % 64;
    this.pass.material = this.cloudMat;
    renderer.setRenderTarget(this.cloudCur);
    renderer.render(this.passScene, camera);
    const hist = this.cloudHist[frame & 1], next = this.cloudHist[(frame + 1) & 1];
    const ru = this.resolveMat.uniforms;
    ru.tColor.value = this.cloudCur.textures[0];
    ru.tDepth.value = this.cloudCur.textures[1];
    ru.tHistColor.value = hist.textures[0];
    ru.tHistDepth.value = hist.textures[1];
    (ru.uTexel.value as THREE.Vector2).set(1 / w, 1 / h);
    this.pass.material = this.resolveMat;
    renderer.setRenderTarget(next);
    renderer.render(this.passScene, camera);
    ru.uHistory.value = 1;
    this.compositeMat.uniforms.tColor.value = this.boltMat.uniforms.tCloud.value = next.textures[0];
    this.compositeMat.uniforms.tDepth.value = this.boltMat.uniforms.tCloudDepth.value = next.textures[1];
    (this.compositeMat.uniforms.uProj.value as THREE.Matrix4).copy(camera.projectionMatrix);
    this.prevViewProj.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    renderer.setRenderTarget(target, face, mip);
  }
}

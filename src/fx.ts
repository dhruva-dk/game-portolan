// Particles and weather effects: smoke, embers and ash, waterfall mist and rainbows, sunbeam dust, sea mist,
// crest and bow spray, rain streaks, curtains and splash crowns, driftwood and kelp, ice floes and bergs,
// wreck debris and oil slicks, bioluminescent sparks.
// Continuous effects are closed-form functions of time evaluated in vertex shaders, one-off bursts are records
// in a GPU ring buffer, and only what must react to ships (floating objects, mist banks) is stepped on the CPU.
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { R, HN, Rng, smoothstep, wind, cellOf, type V3, type SimEvent } from './sim.ts';
import { cask, driftwood as craftDriftwood, fbm, GeometrySink, rough, tube } from './craft.ts';
import { swell, SCENE_DEPTH_GLSL, SWELL_GLSL, SWELL_UNIFORMS } from './ocean.ts';
import { LAYER, loadTexture } from './post.ts';
import { COMMON_GLSL, WIND_GLSL, SKY_GLSL, SHADOW_GLSL, POINT_LIGHTS_GLSL, type LightSource } from './sky.ts';
import { teamColor } from './ships.ts';
import type { Ctx, Frame } from './main.ts';
import woodColorUrl from './assets/wood_weathered_color.jpg';
import woodNormalUrl from './assets/wood_weathered_normal.jpg';
import woodArmUrl from './assets/wood_weathered_arm.jpg';

/** A fixed particle source published by terrain.ts and structures.ts (volcano, chimneys, waterfall, beacons). */
export interface Emitter {
  kind: 'smoke' | 'embers' | 'mist' | 'steam';
  pos: THREE.Vector3; // world position of the source
  size: number; // world units, scales rate and plume size
}

const WIND_DRIFT = 3.5; // world units/s of drift per unit of wind strength
const GRAVITY = 14; // the swell's gravity (ocean.ts), so spray falls back in time with the waves


// ---------------------------------------------------------------------------------------------
// Shared GLSL. Lighting matches the world's: the key light (sun or moon) through the atmosphere with planet,
// cloud and shadow-map shadowing, sky ambient for the spot, the registered point lights, lightning. Haze is
// sky.ts's aerial perspective, evaluated per vertex and split into transmittance and in-scatter so it applies
// to premultiplied colour.
const FX_GLSL = /* glsl */ `
const float WIND_DRIFT = ${WIND_DRIFT.toFixed(1)};
const float GRAVITY = ${GRAVITY.toFixed(1)};
uniform float uTime;
uniform float uSimTime;
uniform float uPlanetR;
uniform vec3 uCamPos;
uniform vec3 uKeyDir;
uniform vec3 uKeyColor;
uniform vec3 uAmbient;
uniform float uNight;
uniform float uStorm;
uniform vec3 uFocus;
uniform vec2 uResolution;
varying float vFogT;
varying vec3 vFogS;
${COMMON_GLSL}
${WIND_GLSL}
${SWELL_GLSL}
${SKY_GLSL}
${SHADOW_GLSL}
${POINT_LIGHTS_GLSL}
// Henyey-Greenstein phase normalised so isotropic scattering is 1 (particle light is radiance, not per steradian).
float hg(float c, float g) {
  return 4.0 * SKY_PI * skyHG(c, g);
}
// Key radiance reflected by a white Lambertian surface facing the light at p (sun or moon, unshadowed by geometry).
vec3 keyLight(vec3 p) {
  return (skySunKey() ? uSky.sunE : uSky.moonE) * skyKeyVisibility(p, uKeyDir) / SKY_PI;
}
// Everything else that lights a white particle at p: sky, lamps and beacons from all sides, lightning.
vec3 fillLight(vec3 p) {
  return uAmbient * skyAmbientScale(p) + skyPointLights(p, vec3(0.0), 1.0) * (2.0 / SKY_PI)
       + skyFlash();
}
// Radiance scattered toward the eye by unit-albedo droplets or smoke at p, viewed along 'view'.
vec3 litMedium(vec3 p, vec3 view, float g, float shadow) {
  return keyLight(p) * (shadow * hg(dot(view, uKeyDir), g)) + fillLight(p);
}
// Primary bow ~42° from the antisolar point (red outside), the fainter reversed secondary ~51°.
vec3 rainbow(vec3 view) {
  float a = degrees(acos(clamp(dot(view, -uKeyDir), -1.0, 1.0)));
  vec3 p = (a - vec3(42.2, 41.4, 40.6)) / 0.75;
  vec3 s = (a - vec3(50.6, 51.5, 52.4)) / 0.95;
  return exp(-p * p) + 0.3 * exp(-s * s);
}
// A lattice of cells on the plane of the cube face under 'centre', so sites stay fixed in the world while the
// camera moves. Returns instance 'idx' of an n×n window as (cell xy, face sign, face axis).
vec4 latticeCell(vec3 centre, float idx, float n, float cell) {
  vec3 a = abs(centre);
  float axis = a.x > a.y && a.x > a.z ? 0.0 : a.y > a.z ? 1.0 : 2.0;
  vec3 q = axis == 0.0 ? centre.yzx : axis == 1.0 ? centre.zxy : centre;
  return vec4(floor(q.xy / cell) + vec2(mod(idx, n), floor(idx / n)) - floor(n * 0.5), sign(q.z), axis);
}
// Unit direction of the face-plane point 'uv' (world units) projected onto the sphere.
vec3 latticeDir(vec4 info, vec2 uv) {
  vec3 q = vec3(uv, info.z * sqrt(max(uPlanetR * uPlanetR - dot(uv, uv), 0.0)));
  return normalize(info.w == 0.0 ? q.zxy : info.w == 1.0 ? q.yzx : q);
}
`;

const FX_VERT = /* glsl */ `
#define CULL { gl_Position = vec4(0.0, 0.0, 2.0, 1.0); return; }
vec3 camX() { return vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]); }
vec3 camY() { return vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]); }
float pixelsPerUnit(float dist) { return projectionMatrix[1][1] * uResolution.y * 0.5 / dist; }
float shadowAt(vec3 p) { return skyKeyShadow(p, -(viewMatrix * vec4(p, 1.0)).z); }
`;

/** Ends a vertex main(): projects 'wp' and evaluates the haze toward it. */
const PROJECT = /* glsl */ `
  vec4 mvPosition = viewMatrix * vec4(wp, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  vFogT = skyFogT(wp);
  vFogS = skyFogColor(normalize(wp - cameraPosition)) * (1.0 - vFogT);
`;

const FX_FRAG = /* glsl */ `
${SCENE_DEPTH_GLSL}
uniform sampler2D tPuff;
uniform sampler2D tNoise;
// Fade toward opaque geometry behind the fragment (soft particles).
float sceneSoft(float viewZ, float range) {
  return clamp((sceneDepth(gl_FragCoord.xy / uResolution) - viewZ) / range, 0.0, 1.0);
}
`;

/** Ends a fragment main(): 'col' is premultiplied radiance, 'alpha' coverage. */
const OUT = /* glsl */ `
  gl_FragColor = vec4(col * vFogT + vFogS * alpha, alpha);
`;

// ---------------------------------------------------------------------------------------------
// Smoke, steam and waterfall mist: one plume per emitter. Particle i of n is born at phase i/n of its life,
// rises buoyantly while it slows, and is carried further downwind the higher it gets, so the plume bends over.
// Puffs overlap many deep, grow, thin out and shear along the wind, and their edges are eroded by noise, so the
// plume reads as one continuous billowing body rather than a string of sprites.
const PLUME_VS = /* glsl */ `
attribute vec4 aRand;
uniform vec3 uSrc;
uniform vec4 uShape; // life (s), buoyant rise, source size, density
uniform vec4 uShape2; // outward billow, forward scattering
uniform vec3 uGlowPos; // the fire under the smoke
uniform vec4 uGlow; // its colour × intensity, range
varying vec2 vUv;
varying vec2 vAtlas;
varying vec2 vErode;
varying vec3 vAxX;
varying vec3 vAxY;
varying vec3 vWorld;
varying vec3 vKey;
varying vec3 vAmb;
varying float vPhase;
varying float vAlpha;
varying float vViewZ;
void main() {
  float life = uShape.x * (0.85 + 0.3 * aRand.z);
  float age = fract(uTime / life + aRand.x);
  float t = age * life;
  vec3 up = normalize(uSrc);
  vec3 e1 = normalize(cross(up, abs(up.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
  vec3 e2 = cross(up, e1);
  float ang = aRand.y * 6.2832;
  vec3 side = e1 * cos(ang) + e2 * sin(ang);
  vec3 w = windAt(up, uSimTime) * WIND_DRIFT;
  float r = uShape.z * (0.5 + 3.0 * sqrt(age)) * (0.7 + 0.6 * aRand.w) + 0.08 * t;
  vec3 turb = vec3(vnoise(vec3(aRand.yz * 31.0, t * 0.3)), vnoise(vec3(aRand.zw * 31.0, t * 0.3 + 5.0)),
                   vnoise(vec3(aRand.wy * 31.0, t * 0.3 + 9.0))) - 0.5;
  vec3 c = uSrc + up * (uShape.y * (1.0 - exp(-3.0 * age)) / 0.95) + w * t * (0.2 + 0.8 * smoothstep(0.0, 0.4, age))
         + side * (uShape.z * aRand.z * 0.7 + uShape2.x * (1.0 - exp(-t * 0.8))) + turb * r * 1.1;
  // young puffs tumble at random; older ones lie along the wind as seen on screen and shear out with it
  float dist = length(c - uCamPos);
  vec3 toC = (c - uCamPos) / dist, ws = w - dot(w, toC) * toC;
  float wl = length(ws);
  vec3 wx = wl > 1e-3 ? ws / wl : camX(), wy = cross(toC, wx);
  float tilt = (aRand.w - 0.5) * 3.0 * (1.0 - age) + t * (aRand.y - 0.5) * 0.2;
  vAxX = wx * cos(tilt) + wy * sin(tilt);
  vAxY = wy * cos(tilt) - wx * sin(tilt);
  float shear = 1.0 + 1.4 * age * min(wl / WIND_DRIFT, 1.0);
  vUv = position.xy;
  float v = floor(fract(aRand.y * 7.0) * 4.0);
  vAtlas = (position.xy * 0.5 + 0.5 + vec2(mod(v, 2.0), floor(v * 0.5))) * 0.5;
  vErode = position.xy * 0.22 * vec2(shear, 1.0) + aRand.zw * 7.0 + vec2(age * 0.25, 0.0);
  vec3 wp = c + (vAxX * position.x * shear + vAxY * position.y) * r;
  vWorld = wp;
  vAlpha = uShape.w * smoothstep(0.0, 0.07, age) * pow(1.0 - age, 1.4) * smoothstep(r * 0.3, r * 1.5, dist);
  vKey = keyLight(c) * shadowAt(c);
  vPhase = hg(dot((c - uCamPos) / dist, uKeyDir), uShape2.y);
  float gd = distance(c, uGlowPos);
  float reach = pow(clamp(1.0 - pow(gd / uGlow.w, 4.0), 0.0, 1.0), 2.0);
  vAmb = fillLight(c) + uGlow.rgb * (2.0 / SKY_PI) * reach / max(gd * gd, 4.0);
  ${PROJECT}
  vViewZ = -mvPosition.z;
}
`;

const PLUME_FS = /* glsl */ `
uniform vec3 uAlbedo;
uniform float uSoft; // > 0: soften against the scene and the sea over this many units (mist at the water)
uniform float uBow; // rainbow strength
varying vec2 vUv;
varying vec2 vAtlas;
varying vec2 vErode;
varying vec3 vAxX;
varying vec3 vAxY;
varying vec3 vWorld;
varying vec3 vKey;
varying vec3 vAmb;
varying float vPhase;
varying float vAlpha;
varying float vViewZ;
void main() {
  vec4 tx = texture2D(tPuff, vAtlas);
  float ero = texture2D(tNoise, vErode).a;
  float alpha = tx.r * smoothstep(0.1, 0.8, tx.r + ero * 0.7 - 0.3) * vAlpha;
  if (alpha < 0.002) discard;
  vec2 g = tx.gb * 2.0 - 1.0;
  vec3 toCam = normalize(uCamPos - vWorld);
  vec3 n = normalize(vAxX * (g.x + vUv.x * 0.6) + vAxY * (g.y + vUv.y * 0.6) + toCam * 0.5);
  float diff = max(0.5 + 0.5 * dot(n, uKeyDir), 0.0);
  vec3 col = uAlbedo * (vKey * (diff * 0.9 + vPhase * exp(-tx.r * 2.0) * 0.6) + vAmb);
  if (uSoft > 0.0) alpha *= sceneSoft(vViewZ, uSoft) * smoothstep(0.0, uSoft, length(vWorld) - uPlanetR);
  col = col * alpha + rainbow(-toCam) * vKey * (uBow * alpha);
  ${OUT}
}
`;

// Embers and ash from a caldera: embers are flung up, cool from yellow-white to deep red and fall back; ash flakes
// shed from high in the plume flutter down far downwind.
const EMBER_VS = /* glsl */ `
attribute vec4 aRand;
uniform vec3 uSrc;
uniform vec4 uShape; // life (s), rise, source size
varying vec2 vUv;
varying vec3 vCol;
varying float vAlpha;
void main() {
  bool ash = aRand.y < 0.4;
  float life = uShape.x * (ash ? 2.6 : 0.5 + 0.7 * aRand.z);
  float age = fract(uTime / life + aRand.x);
  float t = age * life;
  vec3 up = normalize(uSrc);
  vec3 e1 = normalize(cross(up, abs(up.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
  vec3 e2 = cross(up, e1);
  float ang = aRand.y * 6.2832 * 7.0;
  vec3 side = e1 * cos(ang) + e2 * sin(ang);
  vec3 w = windAt(up, uSimTime) * WIND_DRIFT;
  vec3 c;
  float size;
  if (ash) {
    c = uSrc + up * (uShape.y * (0.8 + 1.6 * aRand.w) - 0.45 * t) + w * (t + 3.0) * 0.9
      + side * (uShape.z * 2.5 * aRand.z + 0.3 * sin(t * 2.3 + aRand.x * 40.0));
    size = 0.04 + 0.05 * aRand.w;
  } else {
    float h = uShape.y * (0.25 + 0.75 * aRand.w) * (1.0 - exp(-t / 1.1)) - 0.6 * t * t;
    c = uSrc + up * h + side * uShape.z * (0.3 + 0.8 * aRand.z) * (0.4 + 0.5 * t) + w * t * 0.6;
    size = 0.1 + 0.12 * aRand.z;
  }
  float dist = length(c - uCamPos);
  float grow = max(1.0, (ash ? 1.6 : 2.6) / (size * pixelsPerUnit(dist)));
  vec3 wp = c + (camX() * position.x + camY() * position.y) * size * grow;
  float fade = smoothstep(0.0, 0.05, age) * smoothstep(1.0, 0.8, age) / (grow * grow);
  if (ash) {
    vec3 view = (c - uCamPos) / dist;
    vec3 light = litMedium(c, view, 0.3, 1.0);
    vAlpha = 0.9 * fade * (0.6 + 0.4 * abs(sin(t * 3.0 + aRand.z * 20.0)));
    vCol = light * 0.12 * vAlpha;
  } else {
    float T = exp(-t / (0.6 + 1.6 * aRand.w)) * (0.85 + 0.15 * sin(t * 23.0 + aRand.z * 60.0));
    vCol = vec3(1.0, 0.22 + 0.6 * T, 0.04 + 0.4 * T * T) * (40.0 * T * T * T + 3.0 * T) * fade;
    vAlpha = 0.0;
  }
  vUv = position.xy;
  ${PROJECT}
}
`;

const EMBER_FS = /* glsl */ `
varying vec2 vUv;
varying vec3 vCol;
varying float vAlpha;
void main() {
  float r2 = dot(vUv, vUv);
  if (r2 > 1.0) discard;
  float d = (1.0 - r2) * (1.0 - r2);
  vec3 col = vCol * d;
  float alpha = vAlpha * d;
  ${OUT}
}
`;

// ---------------------------------------------------------------------------------------------
// Bursts: a ring buffer of one-off events (spray, boiling foam, surge columns, sparks, splashes). Each record
// expands into BURST_PARTS particles flown ballistically with drag toward the wind.
const BURSTS = 640;
const BURST_PARTS = 16;
const BURST = { spray: 0, boil: 1, column: 2, spark: 3, splash: 4 } as const;
type BurstKind = (typeof BURST)[keyof typeof BURST];

const BURST_VS = /* glsl */ `
attribute vec4 aA; // origin on the water, birth time
attribute vec4 aB; // tangent direction, strength
attribute vec4 aC; // kind, seed, water radius at the origin, size scale
varying vec2 vUv;
varying vec3 vCol;
varying vec3 vEmit;
varying float vAlpha;
varying float vWaterH;
varying float vViewZ;
void main() {
  float idx = position.z;
  float t = uTime - aA.w;
  if (t < 0.0 || t > 9.0) CULL
  float kind = aC.x;
  vec4 h = vec4(hash13(vec3(aC.y, idx, 1.7)), hash13(vec3(idx, aC.y, 5.3)), hash13(vec3(aC.y + 3.1, idx * 1.3, 2.1)),
                hash13(vec3(idx + 7.7, aC.y, 9.9)));
  vec3 up = normalize(aA.xyz);
  vec3 fw = aB.xyz;
  vec3 sd = cross(up, fw);
  float s = aB.w;
  float ang = h.y * 6.2832;
  vec3 radial = fw * cos(ang) + sd * sin(ang);
  bool mist = idx >= ${BURST_PARTS - 4}.0 && kind != ${BURST.spark}.0 && kind != ${BURST.boil}.0;
  float delay = h.w * 0.15, life = 0.8 + 0.7 * h.x, size = 0.15 + 0.3 * h.z, drag = 1.2, grav = 1.0, alpha = 0.75;
  float glow = 1.0;
  vec3 p0 = aA.xyz, v0;
  if (kind == ${BURST.spray}.0) {
    v0 = up * (2.0 + 5.0 * h.x) * s + fw * (1.5 + 4.0 * h.z) * s + sd * (h.y - 0.5) * 5.0 * s;
  } else if (kind == ${BURST.boil}.0) {
    delay = h.w * 0.4;
    life = 0.9 + h.x;
    p0 += radial * sqrt(h.z) * s;
    v0 = up * (h.w > 0.7 ? 1.5 + 3.0 * h.x : 0.3);
    size = 0.08 + 0.14 * h.x;
    alpha = 0.55;
    grav = 0.5;
  } else if (kind == ${BURST.column}.0) {
    delay = h.w * 0.3;
    life = 1.3 + h.x;
    v0 = up * (5.0 + 9.0 * h.x) * s + radial * (1.0 + 3.0 * h.z) * s;
    size = 0.35 + 0.5 * h.z;
  } else if (kind == ${BURST.spark}.0) {
    delay = h.w * 0.25;
    life = 1.0 + 1.5 * h.x;
    p0 += fw * (h.z - 0.5) * s * 2.0 + sd * (h.y - 0.5) * s;
    v0 = sd * (h.y - 0.5);
    grav = 0.0;
    size = 0.03 + 0.03 * h.z;
    alpha = 0.0;
    glow = 2.5;
  } else {
    delay = h.w * 0.05;
    life = 0.6 + 0.5 * h.x;
    v0 = up * (2.0 + 4.0 * h.x) * s + radial * (1.5 + 2.0 * h.z) * s;
    size = 0.12 + 0.2 * h.z;
  }
  if (mist) {
    life *= 2.5;
    size *= 3.0;
    drag = 2.5;
    grav = 0.05;
    alpha = 0.22;
    glow = 0.0;
    v0 *= 0.6;
  }
  size *= aC.w;
  float tl = t - delay;
  if (tl < 0.0 || tl > life) CULL
  float a = tl / life;
  vec3 wv = windAt(up, uSimTime) * WIND_DRIFT * (mist ? 0.8 : 0.3);
  vec3 term = wv - up * (GRAVITY * grav / drag);
  float ek = exp(-drag * tl);
  vec3 p = p0 + term * tl + (v0 - term) * (1.0 - ek) / drag;
  vec3 vel = term + (v0 - term) * ek;
  if (dot(p, up) - aC.z < -0.4) CULL
  vec3 toCam = uCamPos - p;
  float dist = length(toCam);
  toCam /= dist;
  vec3 vs = vel - dot(vel, toCam) * toCam;
  float vl = length(vs);
  vec3 ax = vl > 1e-3 ? vs / vl : camY();
  vec3 ay = cross(toCam, ax);
  float sz = size * (mist ? 1.0 + 1.5 * a : 1.0);
  float grow = max(1.0, 1.5 / (sz * pixelsPerUnit(dist)));
  sz *= grow;
  vec3 wp = p + ax * position.y * (sz + vl * 0.05) + ay * position.x * sz;
  float fade = smoothstep(0.0, 0.06, a) * pow(1.0 - a, 1.4) / (grow * grow);
  vec3 light = litMedium(p, -toCam, 0.6, shadowAt(p));
  vAlpha = alpha * fade;
  vCol = light * 0.85 * vAlpha;
  vEmit = BIOLUM * (uNight * glow * 3.0 * fade * (0.6 + 0.4 * sin(uTime * 13.0 + h.x * 40.0)));
  vUv = position.xy;
  vWaterH = dot(wp, up) - aC.z;
  ${PROJECT}
  vViewZ = -mvPosition.z;
}
`;

const BURST_FS = /* glsl */ `
varying vec2 vUv;
varying vec3 vCol;
varying vec3 vEmit;
varying float vAlpha;
varying float vWaterH;
varying float vViewZ;
void main() {
  float r2 = dot(vUv, vUv);
  if (r2 > 1.0) discard;
  float d = (1.0 - r2) * (1.0 - r2);
  d *= smoothstep(-0.02, 0.08, vWaterH) * sceneSoft(vViewZ, 0.3);
  vec3 col = (vCol + vEmit) * d;
  float alpha = vAlpha * d;
  ${OUT}
}
`;

// ---------------------------------------------------------------------------------------------
// Rain: streaks in a world-anchored box around the camera, curtains sweeping across the sea, splash crowns.
// Lattice effects draw one instance per cell of an N×N window (see latticeCell).
const CURTAIN_N = 12;
const SPLASH_N = 40;
const SPRAY_N = 34;
const RAIN_VS = /* glsl */ `
attribute vec4 aRand;
uniform float uRainNear;
varying vec2 vUv;
varying vec3 vCol;
varying float vAlpha;
const float BOX = 16.0;
void main() {
  if (aRand.w > uRainNear) CULL // the heavier the rain, the more drops
  vec3 up = normalize(uCamPos);
  vec3 vel = windAt(up, uSimTime) * WIND_DRIFT - up * 6.0;
  float period = BOX / 6.0;
  float ph = fract(uTime / period + aRand.w * 7.31);
  vec3 p = uCamPos + mod(aRand.xyz * BOX + vel * ph * period - uCamPos, BOX) - 0.5 * BOX;
  vec3 toCam = uCamPos - p;
  float dist = length(toCam);
  if (dist < 0.8 || dist > BOX * 0.48) CULL
  toCam /= dist;
  float fade = smoothstep(0.8, 2.5, dist) * (1.0 - smoothstep(BOX * 0.28, BOX * 0.48, dist))
             * smoothstep(0.0, 0.06, ph) * smoothstep(1.0, 0.94, ph) * smoothstep(-0.2, 0.4, length(p) - uPlanetR);
  vec3 ax = normalize(vel - dot(vel, toCam) * toCam);
  vec3 ay = normalize(cross(toCam, ax));
  float wdt = max(0.003, 0.7 / pixelsPerUnit(dist));
  vec3 wp = p + ax * position.y * length(vel) * 0.025 + ay * position.x * wdt;
  vAlpha = 0.5 * fade * 0.003 / wdt;
  vCol = (uAmbient * 2.2 + uKeyColor * (hg(-dot(toCam, uKeyDir), 0.75) * 0.08)
       + skyFlash()) * vAlpha;
  vUv = position.xy;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
  vFogT = 1.0;
  vFogS = vec3(0.0);
}
`;

const RAIN_FS = /* glsl */ `
varying vec2 vUv;
varying vec3 vCol;
varying float vAlpha;
void main() {
  float d = (1.0 - vUv.x * vUv.x) * smoothstep(1.0, 0.2, abs(vUv.y));
  vec3 col = vCol * d;
  float alpha = vAlpha * d;
  ${OUT}
}
`;

const CURTAIN_VS = /* glsl */ `
uniform float uCurtain;
varying vec2 vUv;
varying vec3 vWorld;
varying vec3 vCol;
varying vec3 vSun;
varying float vAlpha;
varying float vSeed;
varying float vWidth;
varying float vViewZ;
const float N = ${CURTAIN_N}.0, CELL = 24.0, LIFE = 50.0, HEIGHT = 24.0;
void main() {
  if (uCurtain <= 0.0) CULL
  vec3 centre = normalize(uFocus) * uPlanetR;
  vec4 info = latticeCell(centre, float(gl_InstanceID), N, CELL);
  vec3 id = vec3(info.xy, info.w * 2.0 + info.z);
  float h0 = hash13(id);
  float cyc = uTime / LIFE + h0 * 7.0;
  float k = floor(cyc), a = fract(cyc);
  if (hash13(id + k * 0.31 + 0.7) > uCurtain * 0.3) CULL
  vec2 jit = vec2(hash13(id + k + 1.1), hash13(id - k + 2.3));
  vec3 dir = latticeDir(info, (info.xy + jit) * CELL);
  dir = normalize(dir + windAt(dir, uSimTime) * (WIND_DRIFT * 0.5 * a * LIFE / uPlanetR));
  vec3 base = dir * (uPlanetR - 1.0);
  vec3 toCam = uCamPos - base;
  float dist = length(toCam);
  if (skyFogT(base + dir * 8.0) < 0.03) CULL
  vec3 right = normalize(cross(dir, toCam));
  float width = 14.0 + 16.0 * hash13(id + k + 4.4);
  vec3 wp = base + right * position.x * width * 0.5 + dir * (position.y * 0.5 + 0.5) * HEIGHT;
  vWorld = wp;
  vUv = vec2(position.x, position.y * 0.5 + 0.5);
  vSeed = hash13(id + k);
  vWidth = width;
  vAlpha = smoothstep(0.0, 0.2, a) * smoothstep(1.0, 0.8, a) * smoothstep(20.0, 45.0, dist) * min(uCurtain * 1.5, 1.0);
  vec3 mid = base + dir * 20.0;
  vCol = 0.6 * (fillLight(mid) * 1.1 + keyLight(mid) * 0.25);
  vSun = keyLight(mid) * (shadowAt(mid) * (1.0 - uStorm) * (1.0 - uStorm));
  ${PROJECT}
  vViewZ = -mvPosition.z;
}
`;

const CURTAIN_FS = /* glsl */ `
varying vec2 vUv;
varying vec3 vWorld;
varying vec3 vCol;
varying vec3 vSun;
varying float vAlpha;
varying float vSeed;
varying float vWidth;
varying float vViewZ;
void main() {
  float shape = smoothstep(1.0, 0.35, abs(vUv.x)) * smoothstep(1.0, 0.55, vUv.y) * smoothstep(0.0, 0.06, vUv.y)
              * vAlpha;
  if (shape < 0.004) discard;
  float x = vUv.x * vWidth;
  float streak = texture2D(tNoise, vec2(x / 30.0 + vSeed, vUv.y * 28.0 / 20.0 + uTime * 6.0 / 20.0)).b;
  float body = texture2D(tNoise, vec2(x / 70.0 + vSeed * 3.0 + uTime * 0.004, vUv.y * 0.3 + uTime * 0.01)).r;
  float d = shape * smoothstep(0.2, 0.75, body) * (0.5 + 0.5 * streak) * sceneSoft(vViewZ, 8.0);
  float alpha = d * 0.55;
  vec3 col = vCol * alpha;
  if (vSun.g > 1e-3) col += rainbow(normalize(vWorld - uCamPos)) * vSun * (alpha * 0.35);
  ${OUT}
}
`;

const SPLASH_VS = /* glsl */ `
uniform float uSplash;
varying vec2 vUv;
varying vec3 vCol;
varying vec3 vEmit;
varying float vAlpha;
varying float vRise;
varying float vSeed;
const float N = ${SPLASH_N}.0, CELL = 1.15, LIFE = 0.36;
void main() {
  vec3 centre = normalize(mix(uCamPos, uFocus, 0.6)) * uPlanetR;
  vec4 info = latticeCell(centre, float(gl_InstanceID), N, CELL);
  vec3 id = vec3(info.xy, info.w * 2.0 + info.z);
  float h0 = hash13(id);
  float period = 0.5 + 0.6 * h0;
  float cyc = (uTime + h0 * 17.0) / period;
  float k = floor(cyc);
  float a = fract(cyc) * period / LIFE;
  float h1 = hash13(id + k * 0.137 + 3.1);
  if (a > 1.0 || h1 > uSplash) CULL
  vec3 dir = latticeDir(info, (info.xy + vec2(hash13(id + k + 0.5), hash13(id - k - 0.5))) * CELL);
  float edge = length(dir * uPlanetR - centre) / (N * CELL * 0.5);
  if (edge > 1.0) CULL
  vec3 n;
  vec3 base = dir * uPlanetR + swell(dir, uTime, uSimTime, n);
  float s = 0.7 + 0.6 * hash13(id + k * 1.7);
  vec3 wp = base + normalize(cross(n, uCamPos - base)) * position.x * 0.09 * s
         + n * (position.y * 0.5 + 0.5) * 0.24 * s;
  vRise = a;
  vSeed = h1 * 40.0;
  vUv = position.xy;
  float fade = pow(1.0 - a, 1.2) * smoothstep(1.0, 0.75, edge);
  vAlpha = fade;
  vCol = (uKeyColor * (0.5 / SKY_PI) + uAmbient + skyFlash()) * 0.8;
  vEmit = BIOLUM * uNight * 2.5 * fade;
  ${PROJECT}
}
`;

// the crown of droplets flung out at impact, then the jet that rises from the collapsing crater
const SPLASH_FS = /* glsl */ `
varying vec2 vUv;
varying vec3 vCol;
varying vec3 vEmit;
varying float vAlpha;
varying float vRise;
varying float vSeed;
void main() {
  float y = vUv.y * 0.5 + 0.5, a = vRise, d = 0.0;
  for (int i = 0; i < 4; i++) {
    float fi = float(i), ph = fract(vSeed * 0.37 + fi * 0.29);
    vec2 c = vec2((fi - 1.5) * 0.45 * (0.3 + a), 0.12 + 0.55 * sin(min(a * 2.2, 3.1416)) * (0.6 + 0.4 * ph));
    vec2 q = (vec2(vUv.x, y) - c) / vec2(0.16, 0.08);
    d += exp(-dot(q, q)) * step(a, 0.6);
  }
  float jx = vUv.x / 0.12;
  d += 0.8 * exp(-jx * jx) * step(y, 0.95 * sin(clamp((a - 0.35) * 2.5, 0.0, 3.1416))) * step(0.35, a);
  float alpha = d * vAlpha * 0.8;
  vec3 col = vCol * alpha + vEmit * d * vAlpha;
  ${OUT}
}
`;

// Spray torn off breaking whitecaps by the wind and thrown up by the surf on every shore, in a lattice around
// the view; at night both sparkle with bioluminescence.
const SPRAY_VS = /* glsl */ `
uniform float uGale; // 0 calm … 1 whole gale
varying vec2 vAtlas;
varying vec3 vCol;
varying vec3 vEmit;
varying float vAlpha;
varying float vWaterH;
varying float vViewZ;
const float N = ${SPRAY_N}.0, CELL = 3.2, LIFE = 1.5;
void main() {
  vec3 centre = normalize(mix(uCamPos, uFocus, 0.5)) * uPlanetR;
  vec4 info = latticeCell(centre, float(gl_InstanceID), N, CELL);
  vec3 id = vec3(info.xy, info.w * 2.0 + info.z);
  float h0 = hash13(id);
  float period = LIFE * (1.3 + 1.2 * h0);
  float cyc = (uTime + h0 * 31.0) / period;
  float k = floor(cyc);
  float tl = fract(cyc) * period;
  if (tl > LIFE) CULL
  vec3 dir = latticeDir(info, (info.xy + vec2(hash13(id + k + 1.3), hash13(id - k - 2.1))) * CELL);
  float edge = length(dir * uPlanetR - centre) / (N * CELL * 0.5);
  float roll = hash13(id + k * 0.173 + 0.5), gale = uGale * 0.6, surfShare = 0.3 + 0.7 * uGale;
  // sites that could throw spray neither off a whitecap nor in the surf skip the swell altogether
  if (edge > 1.0 || roll > surfShare) CULL
  float tb = uTime - tl, fold;
  vec3 n;
  vec4 sea;
  vec2 surfing;
  vec3 crest = dir * uPlanetR + swellFull(dir, tb, uSimTime, n, fold, sea, surfing);
  // whitecaps by the ocean's own measure (folding crests), and the breaking surf
  float cap = whitecap(fold, dot(crest, dir) - uPlanetR, 0.05);
  float brk = surfing.x;
  if (sea.x > -0.3 || roll > max(gale * cap, brk * surfShare)) CULL
  vec3 w = windAt(dir, uSimTime);
  float ws = length(w);
  vec3 wd = w / max(ws, 1e-3);
  float a = tl / LIFE;
  vec3 p = crest + wd * (ws * WIND_DRIFT * 1.3 * tl)
         + dir * (1.2 * sin(a * 3.1416) * (0.6 + h0) * (0.4 + 0.6 * max(uGale, brk)));
  vec3 toCam = uCamPos - p;
  float dist = length(toCam);
  toCam /= dist;
  vec3 ax = wd - dot(wd, toCam) * toCam;
  ax = length(ax) > 1e-3 ? normalize(ax) : camX();
  vec3 ay = cross(toCam, ax);
  float sz = (0.4 + 1.4 * a) * (0.7 + 0.6 * h0);
  vec3 wp = p + ax * position.x * sz * 2.4 + ay * position.y * sz;
  float v = floor(h0 * 4.0);
  vAtlas = (position.xy * 0.5 + 0.5 + vec2(mod(v, 2.0), floor(v * 0.5))) * 0.5;
  float fade = smoothstep(0.0, 0.12, a) * pow(1.0 - a, 1.6) * smoothstep(1.0, 0.7, edge);
  vAlpha = 0.75 * fade * (0.35 + 0.65 * uGale);
  vCol = litMedium(p, -toCam, 0.7, 1.0) * 1.3 * vAlpha;
  vEmit = BIOLUM * (uNight * 6.0 * fade * (1.0 - a));
  vWaterH = dot(wp - crest, n);
  ${PROJECT}
  vViewZ = -mvPosition.z;
}
`;

const SPRAY_FS = /* glsl */ `
varying vec2 vAtlas;
varying vec3 vCol;
varying vec3 vEmit;
varying float vAlpha;
varying float vWaterH;
varying float vViewZ;
void main() {
  float d = texture2D(tPuff, vAtlas).r * smoothstep(-0.05, 0.25, vWaterH) * sceneSoft(vViewZ, 0.5);
  vec3 col = (vCol + vEmit) * d;
  float alpha = vAlpha * d;
  ${OUT}
}
`;

// ---------------------------------------------------------------------------------------------
// Low sea mist: CPU-placed banks drawn as an upright veil (seen from the side) cross-faded with a flat sheet
// (seen from above), so a bank reads as a lying layer from every angle.
const MIST_VS = /* glsl */ `
attribute vec4 aBank; // position on the sea, width
attribute vec4 aBank2; // height, seed, opacity
varying vec2 vUv;
varying vec3 vWorld;
varying vec3 vKey;
varying vec3 vAmb;
varying float vAlpha;
varying float vSeed;
varying float vFlat;
varying float vViewZ;
void main() {
  if (aBank2.z < 0.002) CULL
  vec3 up = normalize(aBank.xyz);
  vec3 toCam = normalize(uCamPos - aBank.xyz);
  float down = abs(dot(toCam, up));
  vec3 wp;
  if (position.z < 0.5) {
    vec3 right = normalize(cross(up, toCam));
    wp = aBank.xyz + right * position.x * aBank.w * 0.5 + up * (position.y * 0.5 + 0.42) * aBank2.x;
    vAlpha = aBank2.z * 0.28 * (1.0 - smoothstep(0.3, 0.85, down));
  } else {
    vec3 e1 = normalize(cross(up, abs(up.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
    wp = aBank.xyz + up * aBank2.x * 0.5 + (e1 * position.x + cross(up, e1) * position.y) * aBank.w * 0.5;
    vAlpha = aBank2.z * 0.16 * smoothstep(0.2, 0.75, down);
  }
  vFlat = position.z;
  vUv = position.xy;
  vSeed = aBank2.y;
  vWorld = wp;
  vKey = keyLight(aBank.xyz + up * aBank2.x);
  vAmb = uAmbient * skyAmbientScale(aBank.xyz) + skyFlash();
  ${PROJECT}
  vViewZ = -mvPosition.z;
}
`;

const MIST_FS = /* glsl */ `
varying vec2 vUv;
varying vec3 vWorld;
varying vec3 vKey;
varying vec3 vAmb;
varying float vAlpha;
varying float vSeed;
varying float vFlat;
varying float vViewZ;
void main() {
  vec2 q = vFlat > 0.5 ? vUv * 0.5 : vec2(vUv.x * 0.7, vUv.y * 0.2);
  float n1 = texture2D(tNoise, q * 0.5 + vSeed + uTime * vec2(0.004, 0.0015)).r;
  float n2 = texture2D(tNoise, q * 1.3 - vSeed + uTime * vec2(-0.006, 0.003)).g;
  float shape = vFlat > 0.5 ? 1.0 - smoothstep(0.1, 1.0, length(vUv))
              : (1.0 - smoothstep(0.2, 1.0, abs(vUv.x))) * (1.0 - smoothstep(-0.4, 1.0, vUv.y))
                * smoothstep(-1.0, -0.7, vUv.y);
  float alpha = shape * smoothstep(-0.2, 1.1, n1 * 0.6 + n2 * 0.5) * vAlpha * smoothstep(1.5, 6.0, vViewZ);
  if (alpha < 0.002) discard;
  alpha *= sceneSoft(vViewZ, 3.0) * smoothstep(-0.3, 0.8, length(vWorld) - uPlanetR);
  vec3 view = normalize(vWorld - uCamPos);
  vec3 lamps = skyPointLights(vWorld, vec3(0.0), 1.0) * (3.0 / SKY_PI);
  vec3 col = 0.9 * (vKey * hg(dot(view, uKeyDir), 0.5) + vAmb + lamps) * alpha;
  ${OUT}
}
`;

// Dust motes: specks in a world-anchored box around the view that only glow where the key shadow map says
// they are sunlit, strongly forward-scattering, so they gather in the beams between palms, sails and rigging.
const MOTE_VS = /* glsl */ `
attribute vec4 aRand;
uniform float uMotes;
varying vec2 vUv;
varying vec3 vCol;
const float BOX = 22.0;
void main() {
  if (aRand.w > uMotes) CULL
  float life = 7.0 + 5.0 * aRand.z;
  float cyc = uTime / life + aRand.x * 13.0;
  float k = floor(cyc), a = fract(cyc);
  vec3 rnd = vec3(hash13(vec3(aRand.yz, k)), hash13(vec3(aRand.zy, k + 0.5)), hash13(vec3(aRand.xw, k + 0.25)));
  vec3 centre = mix(uCamPos, uFocus, 0.45);
  vec3 rel = mod(rnd * BOX * 3.7 - centre, BOX) - 0.5 * BOX;
  vec3 p = centre + rel;
  p += windAt(normalize(p), uSimTime) * (0.25 * a * life) + 0.15 * sin(vec3(1.3, 1.7, 1.1) * uTime * 0.7 + rnd * 20.0);
  vec3 toCam = uCamPos - p;
  float dist = length(toCam);
  float size = 0.02;
  float grow = max(1.0, 1.3 / (size * pixelsPerUnit(dist)));
  vec3 wp = p + (camX() * position.x + camY() * position.y) * size * grow;
  vec3 b = abs(rel) / BOX;
  float fade = smoothstep(0.0, 0.2, a) * smoothstep(1.0, 0.8, a)
             * (1.0 - smoothstep(0.38, 0.5, max(b.x, max(b.y, b.z))))
             * smoothstep(0.2, 0.8, length(p) - uPlanetR) * smoothstep(0.5, 2.0, dist) / (grow * grow);
  float glint = 0.6 + 0.4 * sin(uTime * 2.0 + aRand.y * 30.0);
  vCol = keyLight(p) * (shadowAt(p) * hg(-dot(toCam / dist, uKeyDir), 0.75) * fade * 0.5 * glint);
  vUv = position.xy;
  ${PROJECT}
}
`;

const MOTE_FS = /* glsl */ `
varying vec2 vUv;
varying vec3 vCol;
void main() {
  float r2 = dot(vUv, vUv);
  if (r2 > 1.0) discard;
  vec3 col = vCol * (1.0 - r2) * (1.0 - r2);
  float alpha = 0.0;
  ${OUT}
}
`;

// Oil slick of a wreck: a disc riding the swell with thin-film interference colours over a dark sheen.
const SLICK_VS = /* glsl */ `
uniform vec4 uSlick; // centre direction, birth time
varying vec2 vLocal;
varying vec3 vWorld;
varying vec3 vN;
varying float vAge;
void main() {
  vec3 up = uSlick.xyz;
  vec3 e1 = normalize(cross(up, abs(up.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
  float age = uTime - uSlick.w;
  vec2 q = position.xy * (2.0 + 2.6 * sqrt(max(age, 0.0)));
  vec3 dir = normalize(up * uPlanetR + e1 * q.x + cross(up, e1) * q.y);
  vec3 n;
  vec3 wp = dir * (uPlanetR + 0.04) + swell(dir, uTime, uSimTime, n);
  vLocal = position.xy;
  vWorld = wp;
  vN = n;
  vAge = age;
  ${PROJECT}
}
`;

const SLICK_FS = /* glsl */ `
uniform float uSeed;
varying vec2 vLocal;
varying vec3 vWorld;
varying vec3 vN;
varying float vAge;
void main() {
  float r = length(vLocal);
  float n = texture2D(tNoise, vLocal * 0.45 + uSeed).r, n2 = texture2D(tNoise, vLocal * 1.1 - uSeed + vAge * 0.004).g;
  // patchy, broken film that thickens toward the wreck and fades as it spreads
  float m = smoothstep(0.55, 0.75, n * 0.7 + n2 * 0.3 + 0.7 - r) * smoothstep(0.0, 2.0, vAge)
          * (1.0 - smoothstep(18.0, 32.0, vAge));
  if (m < 0.003) discard;
  vec3 view = normalize(vWorld - uCamPos);
  float cv = abs(dot(view, vN)), fres = 0.04 + 0.96 * pow(1.0 - cv, 5.0);
  // thin-film interference: broad bands that shift with the film's thickness and the viewing angle
  vec3 film = 0.5 + 0.5 * cos(6.2832 * ((n2 * 0.8 + n * 0.5 + r * 0.4) * 2.0 / max(cv, 0.3) + vec3(0.0, 0.33, 0.67)));
  film = mix(vec3(dot(film, vec3(0.333))), film, 0.7);
  vec3 sky = uAmbient * skyAmbientScale(vWorld)
          + keyLight(vWorld) * pow(max(dot(reflect(view, vN), uKeyDir), 0.0), 48.0) * 20.0;
  // the oil dulls and darkens the water under it; only its reflection carries colour
  float alpha = m * 0.6;
  vec3 col = film * sky * (0.06 + fres) * 1.8 * m;
  ${OUT}
}
`;

// Floating objects ride the swell on the GPU: lift to the surface under the instance centre, tilt to its normal.
const FLOAT_PARS = /* glsl */ `
attribute vec4 aFloat; // depth below the floating line, how far it tilts with the swell, bob phase
uniform float uTime;
uniform float uSimTime;
${WIND_GLSL}
${SWELL_GLSL}
void floatPose(out mat3 tilt, out float lift) {
  mat3 im = mat3(instanceMatrix);
  vec3 up = normalize(instanceMatrix[3].xyz);
  vec3 n;
  vec3 d = swell(up, uTime, uSimTime, n);
  vec3 nl = normalize(transpose(im) * normalize(mix(up, n, aFloat.y)));
  vec3 k = vec3(nl.z, 0.0, -nl.x);
  mat3 K = mat3(0.0, k.z, -k.y, -k.z, 0.0, k.x, k.y, -k.x, 0.0);
  tilt = mat3(1.0) + K + K * K / (1.0 + nl.y);
  lift = (dot(d, up) - aFloat.x + 0.03 * sin(uTime * 1.9 + aFloat.z)) / length(im[0]);
}
`;

function floatOnSwell(m: THREE.Material, u: Record<string, THREE.IUniform>): THREE.Material {
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, SWELL_UNIFORMS, { uTime: u.uTime, uSimTime: u.uSimTime });
    s.vertexShader = s.vertexShader
      .replace('#include <common>', `#include <common>\n${FLOAT_PARS}`)
      .replace('#include <beginnormal_vertex>', `mat3 fTilt; float fLift; floatPose(fTilt, fLift);
#define FLOAT_POSED
vec3 objectNormal = fTilt * vec3(normal);
#ifdef USE_TANGENT
vec3 objectTangent = fTilt * vec3(tangent.xyz);
#endif`)
      .replace('#include <begin_vertex>', `#ifndef FLOAT_POSED
mat3 fTilt; float fLift; floatPose(fTilt, fLift);
#endif
vec3 transformed = fTilt * vec3(position) + vec3(0.0, fLift, 0.0);`);
  };
  return m;
}

// ---------------------------------------------------------------------------------------------
// Procedural textures: a 2×2 atlas of billowy puffs (density + outward normal hint) and a tileable noise
// (billows, finer billows, vertical streaks, detail).
function dataTexture(data: Uint8Array, size: number): THREE.DataTexture {
  const t = new THREE.DataTexture(data, size, size);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
}

function puffAtlas(): THREE.DataTexture {
  const S = 128, W = S * 2, dens = new Float32Array(W * W), data = new Uint8Array(W * W * 4);
  for (let v = 0; v < 4; v++) {
    const ox = (v % 2) * S, oy = (v >> 1) * S;
    for (let j = 0; j < S; j++) {
      for (let i = 0; i < S; i++) {
        const x = ((i + 0.5) / S) * 2 - 1, y = ((j + 0.5) / S) * 2 - 1, r2 = x * x + y * y;
        const n = fbm(x * 2.2 + v * 9.1 + 50, y * 2.2 + v * 4.7 + 50, 0, v * 101, 5, 256, 256);
        const d = (1 - r2) * 1.1 + (n - 0.5) * 1.7 - 0.2;
        dens[(oy + j) * W + ox + i] = smoothstep(0, 1, d) * smoothstep(1, 0.6, Math.sqrt(r2));
      }
    }
  }
  for (let j = 0; j < W; j++) {
    for (let i = 0; i < W; i++) {
      const k = j * W + i;
      const gx = dens[k + (i % S < S - 1 ? 1 : 0)] - dens[k - (i % S > 0 ? 1 : 0)];
      const gy = dens[k + (j % S < S - 1 ? W : 0)] - dens[k - (j % S > 0 ? W : 0)];
      data[k * 4] = dens[k] * 255;
      data[k * 4 + 1] = Math.min(255, Math.max(0, 128 - gx * 760));
      data[k * 4 + 2] = Math.min(255, Math.max(0, 128 - gy * 760));
      data[k * 4 + 3] = 255;
    }
  }
  return dataTexture(data, W);
}

function noiseTexture(): THREE.DataTexture {
  const S = 128, data = new Uint8Array(S * S * 4);
  const stretch = (v: number) => Math.min(255, Math.max(0, ((v - 0.5) * 2.4 + 0.5) * 255));
  for (let j = 0; j < S; j++) {
    for (let i = 0; i < S; i++) {
      const x = i / S, y = j / S, k = (j * S + i) * 4;
      data[k] = stretch(fbm(x * 4, y * 4, 0, 1, 5, 4, 4));
      data[k + 1] = stretch(fbm(x * 8, y * 8, 0, 2, 4, 8, 8));
      data[k + 2] = stretch(fbm(x * 32, y * 2, 0, 3, 3, 32, 2));
      data[k + 3] = stretch(fbm(x * 16, y * 16, 0, 4, 3, 16, 16));
    }
  }
  return dataTexture(data, S);
}

// ---------------------------------------------------------------------------------------------
// Procedural meshes for floating things.
const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3(), tmpC = new THREE.Vector3();

/** Vertex colours from a function of position (wood is white so the texture shows, iron bands dark). */
function paint(g: THREE.BufferGeometry, fn: (p: THREE.Vector3) => THREE.Color): THREE.BufferGeometry {
  const pos = g.attributes.position, col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) fn(tmpC.fromBufferAttribute(pos, i)).toArray(col, i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

const WHITE = new THREE.Color(1, 1, 1);
const IRON = new THREE.Color(0.16, 0.15, 0.15);

/** A bleached, gnarled log (craft.ts). */
function driftwood(rng: Rng): THREE.BufferGeometry {
  const L = 2.2 + rng.next() * 1.4, r0 = 0.11 + 0.06 * rng.next(), g = new GeometrySink((s, t) => [s, t / (Math.PI * 2 * r0)]);
  craftDriftwood(g, rng, L, r0);
  return paint(g.build(), () => new THREE.Color(0xf2ebe0));
}

/** A cooper's cask (craft.ts) with iron hoops, floating on its side. */
function barrel(): THREE.BufferGeometry {
  const h = 0.36, staves = new GeometrySink(), hoops = new GeometrySink();
  cask(staves, hoops, h, 0.104, 0.13);
  return mergeGeometries([paint(staves.build(), () => WHITE), paint(hoops.build(), () => IRON)])
    .translate(0, -h / 2, 0).rotateZ(Math.PI / 2).translate(0, 0.04, 0);
}

/** A hull plank with both ends broken off. */
function plank(rng: Rng): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(1.2, 0.05, 0.2, 8, 1, 3), pos = g.attributes.position, ph = rng.next() * 9;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    if (Math.abs(x) > 0.55) pos.setX(i, x + Math.sign(x) * 0.09 * Math.sin(z * 37 + ph + Math.sign(x) * 2));
  }
  g.computeVertexNormals();
  return paint(g, () => new THREE.Color(0xdcb994));
}

/** A broken spar: tapered pole, splintered end, an iron band. */
function spar(rng: Rng): THREE.BufferGeometry {
  const L = 2.8 + rng.next() * 0.8;
  const path = Array.from({ length: 6 }, (_, i) => new THREE.Vector3((i / 5 - 0.5) * L, 0, 0.02 * Math.sin(i)));
  const r = (i: number) => 0.075 - i * 0.004, g = new GeometrySink((s, t) => [s, t / (Math.PI * 2 * r(0))]);
  tube(g, path, r, 8, { shape: rough(rng, 6, 8, 0.08), caps: [0.02 + r(0) * 0.3, 0.25 + r(5) * 0.3] });
  return paint(g.build(), (p) => (Math.abs(p.x + L * 0.3) < 0.04 ? IRON : new THREE.Color(0xcfa983)));
}

/** A hatch grating: two layers of crossed slats. */
function grating(): THREE.BufferGeometry {
  const slats: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 4; k++) {
    slats.push(new THREE.BoxGeometry(0.6, 0.035, 0.07).translate(0, 0, (k - 1.5) * 0.16));
    slats.push(new THREE.BoxGeometry(0.07, 0.035, 0.6).translate((k - 1.5) * 0.16, 0.035, 0));
  }
  return paint(mergeGeometries(slats), () => new THREE.Color(0xc9a782));
}

/** A torn scrap of sail canvas, crumpled on the water. */
function sailScrap(rng: Rng): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(1.1, 0.8, 10, 8).rotateX(-Math.PI / 2), pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), edge = Math.abs(x) > 0.54 || Math.abs(z) > 0.39;
    const k = edge ? 0.8 + 0.25 * rng.next() : 1;
    pos.setXYZ(i, x * k, 0.03 + 0.035 * Math.sin(x * 7 + z * 5) + 0.02 * Math.sin(z * 13), z * k);
  }
  g.computeVertexNormals();
  return g;
}

/** A raft of torn-loose kelp: a tangle of long wavy blades lying roughly along the drift, beaded with gas bladders. */
function kelpRaft(rng: Rng): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (let f = 0; f < 16; f++) {
    const th = (rng.next() - 0.5) * 1.3 + (f % 3 === 0 ? Math.PI : 0);
    const len = 1.4 + 1.3 * rng.next(), w0 = 0.05 + 0.04 * rng.next();
    const dir = new THREE.Vector3(Math.cos(th), 0, Math.sin(th)), perp = new THREE.Vector3(-dir.z, 0, dir.x);
    const start = new THREE.Vector3((rng.next() - 0.5) * 1.6, 0, (rng.next() - 0.5) * 0.7);
    start.addScaledVector(dir, -len * 0.5);
    const ph = rng.next() * 6, wav = 4 + 4 * rng.next(), pos: number[] = [], idx: number[] = [];
    const tint = new THREE.Color(0x5e4e17).lerp(new THREE.Color(0x8f7a2c), rng.next());
    for (let i = 0; i <= 16; i++) {
      const s = i / 16, w = w0 * Math.min(1, s * 6) * (1 - 0.6 * s) * (1 + 0.35 * Math.sin(s * 40 + ph));
      const c = start.clone().addScaledVector(dir, s * len).addScaledVector(perp, 0.14 * Math.sin(s * wav + ph));
      c.y = 0.012 + 0.01 * Math.sin(s * 11 + ph);
      pos.push(...c.clone().addScaledVector(perp, w).toArray(), ...c.addScaledVector(perp, -w).toArray());
      if (i < 16) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
      if (f % 4 === 1 && i % 5 === 2) {
        const b = new THREE.SphereGeometry(0.035 + 0.025 * rng.next(), 6, 4).translate(c.x, 0.02, c.z);
        b.deleteAttribute('uv');
        parts.push(paint(b, () => new THREE.Color(0x4a3f12)));
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    parts.push(paint(g, () => tint));
  }
  return mergeGeometries(parts);
}

/** A sea-ice floe: an irregular snow-topped slab with a bevelled rim and a turquoise underwater skirt. */
function floe(rng: Rng): THREE.BufferGeometry {
  const n = 20, ph = [rng.next(), rng.next(), rng.next()].map((v) => v * 6.3);
  const rad = Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    const wobble = 0.12 * Math.sin(a * 2 + ph[0]) + 0.08 * Math.sin(a * 3 + ph[1]) + 0.05 * Math.sin(a * 5 + ph[2]);
    return 0.85 + wobble + 0.04 * rng.next();
  });
  const top = 0.1;
  // rings: [radius factor, height, colour]; the first three form the top, the rest the walls (own vertices = crisp rim)
  const rings: [number, number, THREE.Color][] = [
    [0.5, top + 0.035, new THREE.Color(0xf4f8fc)], [0.92, top, new THREE.Color(0xe8f1f8)],
    [1.0, top - 0.04, new THREE.Color(0xc8e2ee)], [1.0, top - 0.04, new THREE.Color(0xa9d4e4)],
    [1.01, 0, new THREE.Color(0x7cc0d4)], [1.07, -0.3, new THREE.Color(0x3d9cb3)],
    [0.85, -0.6, new THREE.Color(0x2a7d99)],
  ];
  const pos: number[] = [0, top + 0.05, 0], col: number[] = [1, 1, 1], idx: number[] = [];
  for (const [k, y, c] of rings) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2, r = rad[i] * k + (y > top - 0.05 && k < 1 ? 0.03 * rng.next() : 0);
      pos.push(Math.cos(a) * r, y + (k < 1 ? 0.012 * rng.next() : 0), Math.sin(a) * r);
      col.push(c.r, c.g, c.b);
    }
  }
  const ring = (k: number, i: number) => 1 + k * n + (i % n);
  for (let i = 0; i < n; i++) idx.push(0, ring(0, i + 1), ring(0, i));
  for (const k of [0, 1, 3, 4, 5]) {
    for (let i = 0; i < n; i++) {
      idx.push(ring(k, i), ring(k, i + 1), ring(k + 1, i), ring(k, i + 1), ring(k + 1, i + 1), ring(k + 1, i));
    }
  }
  const bottom = pos.length / 3;
  pos.push(0, -0.62, 0);
  col.push(...new THREE.Color(0x2a7d99).toArray());
  for (let i = 0; i < n; i++) idx.push(bottom, ring(6, i), ring(6, i + 1));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** A small iceberg: a lumpy, wind-carved mass, taller above the water and flaring below it, snow on the flats. */
function berg(rng: Rng): THREE.BufferGeometry {
  const g = mergeVertices(new THREE.IcosahedronGeometry(1, 4).deleteAttribute('normal').deleteAttribute('uv'));
  const pos = g.attributes.position, v = new THREE.Vector3();
  const waves = Array.from({ length: 10 }, (_, i) => [
    new THREE.Vector3(rng.next() - 0.5, (rng.next() - 0.5) * 0.6, rng.next() - 0.5).normalize(),
    1.5 * 1.45 ** i, rng.next() * 6.3,
  ] as const);
  const col = new Float32Array(pos.count * 3), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    let r = 1;
    for (const [d, f, p] of waves) r += (0.22 / f) * Math.abs(Math.sin(v.dot(d) * f * 2 + p)) * 2 - 0.22 / f;
    v.multiplyScalar(r);
    if (v.y > 0) v.y = Math.min(v.y * 1.6 + 0.2, 1.4 + 0.25 * Math.sin(v.x * 2.3 + v.z * 1.7));
    else v.set(v.x * 1.25, v.y * 1.2, v.z * 1.25);
    pos.setXYZ(i, v.x, v.y, v.z);
    // compacted blue ice in bands, brighter snow higher up, turquoise below the waterline
    const band = 0.5 + 0.5 * Math.sin(v.y * 9 + Math.sin(v.x * 4) * 1.5);
    if (v.y < 0) c.copy(new THREE.Color(0x3aa0b8)).lerp(new THREE.Color(0x1f7290), Math.min(1, -v.y));
    else c.copy(new THREE.Color(0xe9f3f8)).lerp(new THREE.Color(0x9fd0e6), band * 0.55);
    c.toArray(col, i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  // snow settles on whatever faces up
  const nrm = g.attributes.normal;
  for (let i = 0; i < pos.count; i++) {
    if (pos.getY(i) < 0.2 || nrm.getY(i) < 0.6) continue;
    c.fromArray(col, i * 3).lerp(WHITE, smoothstep(0.6, 0.85, nrm.getY(i))).toArray(col, i * 3);
  }
  return g;
}

// ---------------------------------------------------------------------------------------------
/** Shared plumbing: uniforms every effect reads, and factories for materials and meshes. */
class Kit {
  readonly ctx: Ctx;
  /** fx-only uniforms, updated by Fx.update */
  readonly fx = {
    tPuff: { value: puffAtlas() },
    tNoise: { value: noiseTexture() },
    uFocus: { value: new THREE.Vector3() },
  };
  readonly u: Record<string, THREE.IUniform>;
  /** Seeded, so captures of the same match are reproducible. */
  readonly random: () => number;
  private readonly objects: THREE.Object3D[] = [];

  constructor(ctx: Ctx) {
    this.ctx = ctx;
    const rng = new Rng(ctx.seed ^ 0xf1ec);
    this.random = () => rng.next();
    this.u = { ...ctx.sky.u, ...ctx.pipeline.u, ...SWELL_UNIFORMS, ...this.fx };
  }

  material(vertex: string, fragment: string, uniforms: Record<string, THREE.IUniform> = {}): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
      uniforms: { ...this.u, ...uniforms },
      vertexShader: FX_GLSL + FX_VERT + vertex,
      fragmentShader: FX_GLSL + FX_FRAG + fragment,
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    });
  }

  mesh(geometry: THREE.BufferGeometry, material: THREE.Material, layer: number, order = 0): THREE.Mesh {
    const m = new THREE.Mesh(geometry, material);
    m.frustumCulled = false;
    m.matrixAutoUpdate = false;
    m.layers.set(layer);
    m.renderOrder = order;
    return this.add(m);
  }

  add<T extends THREE.Object3D>(object: T): T {
    this.objects.push(object);
    this.ctx.scene.add(object);
    return object;
  }

  /** Compile every fx program now, as the pipeline's HDR scene target will use it, so none compiles mid-game
   * (most effects stay hidden for minutes, until their hour or event comes round). */
  warm(): void {
    const r = this.ctx.pipeline.renderer, camera = new THREE.PerspectiveCamera();
    const target = new THREE.WebGLRenderTarget(1, 1);
    camera.layers.enableAll();
    r.setRenderTarget(target);
    for (const o of this.objects) r.compile(o, camera, this.ctx.scene);
    r.setRenderTarget(null);
    target.dispose();
  }
}

/** `instances` instances of `per` unit quads; position.xy is the corner in [-1, 1], position.z the quad index. */
function quads(per: number, instances: number, attrs: Record<string, THREE.BufferAttribute> = {}) {
  const g = new THREE.InstancedBufferGeometry(), pos = new Float32Array(per * 12), idx: number[] = [];
  for (let q = 0; q < per; q++) {
    pos.set([-1, -1, q, 1, -1, q, 1, 1, q, -1, 1, q], q * 12);
    idx.push(q * 4, q * 4 + 1, q * 4 + 2, q * 4, q * 4 + 2, q * 4 + 3);
  }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(idx);
  for (const k in attrs) g.setAttribute(k, attrs[k]);
  g.instanceCount = instances;
  return g;
}

/** A per-instance vec4 the CPU rewrites as it goes. */
function dynamicAttr(n: number): THREE.InstancedBufferAttribute {
  return new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4).setUsage(THREE.DynamicDrawUsage);
}

function randomAttr(n: number, rng: Rng, phase = false): THREE.InstancedBufferAttribute {
  const a = new Float32Array(n * 4);
  for (let i = 0; i < a.length; i++) a[i] = rng.next();
  if (phase) for (let i = 0; i < n; i++) a[i * 4] = (i + 0.5 * a[i * 4]) / n; // evenly spaced births
  return new THREE.InstancedBufferAttribute(a, 4);
}

/** Can the camera see anything within `reach` of `p` over the planet's limb? */
function aboveHorizon(cam: THREE.Vector3, p: THREE.Vector3, reach: number): boolean {
  const hc = Math.sqrt(Math.max(0, cam.lengthSq() - R * R)), hp = Math.sqrt(Math.max(0, p.lengthSq() - R * R));
  return cam.distanceTo(p) < hc + hp + reach;
}

function randomDir(rnd: () => number, out: THREE.Vector3): THREE.Vector3 {
  const y = rnd() * 2 - 1, a = rnd() * Math.PI * 2, r = Math.sqrt(1 - y * y);
  return out.set(r * Math.cos(a), y, r * Math.sin(a));
}

/** Move unit direction `p` by `dist` world units along the sea toward tangent `t`. */
function slide(p: THREE.Vector3, t: THREE.Vector3, dist: number): THREE.Vector3 {
  return p.multiplyScalar(R).addScaledVector(t, dist).normalize();
}

/** Any unit tangent at `p`. */
function tangent(p: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
  return out.set(0, 1, 0).addScaledVector(p, -p.y).lengthSq() > 1e-4 ? out.normalize() : out.set(1, 0, 0);
}

// ---------------------------------------------------------------------------------------------
interface Plume {
  e: Emitter;
  mesh: THREE.Mesh;
  centre: THREE.Vector3;
  reach: number;
  glow: THREE.Vector4 | null; // uGlow value (smoke and steam)
  light: LightSource | null; // the fire under the smoke (beacon, caldera glow), if one is registered there
}

/** Smoke, steam, waterfall mist, embers and ash for every emitter terrain.ts and structures.ts publish. */
class Plumes {
  private readonly kit: Kit;
  private readonly list: Plume[] = [];

  constructor(kit: Kit) {
    this.kit = kit;
    for (const e of [...kit.ctx.terrain.emitters, ...kit.ctx.structures.emitters]) this.add(e);
    // the fire that lights a plume from below: the nearest registered light within reach of its source
    for (const p of this.list) {
      let best = 2 + 1.5 * p.e.size;
      for (const l of kit.ctx.sky.lights) {
        const d = l.pos.distanceTo(p.e.pos);
        if (d < best) [best, p.light] = [d, l];
      }
    }
  }

  private add(e: Emitter): void {
    const s = e.size, up = e.pos.clone().normalize(), kit = this.kit;
    const rng = new Rng(Math.round(e.pos.x * 997 + e.pos.y * 131 + e.pos.z * 17) >>> 0);
    const shape = new THREE.Vector4(), shape2 = new THREE.Vector4(), albedo = new THREE.Color();
    if (e.kind === 'embers') {
      shape.set(4 + 0.5 * s, 8 + 5 * s, s, 0);
      const mesh = kit.mesh(quads(1, 320, { aRand: randomAttr(320, rng) }), kit.material(EMBER_VS, EMBER_FS, {
        uSrc: { value: e.pos }, uShape: { value: shape },
      }), LAYER.WORLD, 1);
      const centre = e.pos.clone().addScaledVector(up, shape.y);
      this.list.push({ e, mesh, centre, reach: shape.y * 3 + 30, glow: null, light: null });
      return;
    }
    let count: number, layer: number = LAYER.WORLD, soft = 0, bow = 0;
    if (e.kind === 'smoke') {
      // wood smoke from chimneys and beacons is pale and thin; the caldera's is a dark, sulphurous column
      const big = smoothstep(1.5, 5, s), small = Math.min(s, 1);
      count = Math.round(64 + 90 * big);
      shape.set(7 + 4 * small + 30 * big, 3 + 6 * small + 40 * big, 0.35 + 0.45 * s, 0.2 + 0.18 * big);
      shape2.set(0, 0.35, 0, 0);
      albedo.copy(new THREE.Color(0xc9c9cb)).lerp(new THREE.Color(0x9a928a), big);
    } else if (e.kind === 'steam') {
      count = 30;
      shape.set(3 + 2 * s, 2 + 4 * s, 0.6 * s, 0.3);
      shape2.set(0, 0.5, 0, 0);
      albedo.setScalar(0.9);
    } else {
      count = 64;
      shape.set(4 + s, 1 + s, 0.6 * s, 0.3);
      shape2.set(s, 0.6, 0, 0);
      albedo.setScalar(0.88);
      layer = LAYER.OVER;
      soft = 1.5;
      bow = 1;
    }
    const glow = new THREE.Vector4(0, 0, 0, 1);
    const mesh = kit.mesh(quads(1, count, { aRand: randomAttr(count, rng, true) }), kit.material(PLUME_VS, PLUME_FS, {
      uSrc: { value: e.pos }, uShape: { value: shape }, uShape2: { value: shape2 }, uGlow: { value: glow },
      uGlowPos: { value: new THREE.Vector3() }, uAlbedo: { value: albedo }, uSoft: { value: soft },
      uBow: { value: bow },
    }), layer, 1);
    const reach = shape.y + shape.x * WIND_DRIFT * 1.5;
    this.list.push({ e, mesh, centre: e.pos.clone().addScaledVector(up, shape.y * 0.6), reach, glow, light: null });
  }

  update(f: Frame): void {
    const cam = f.camera.position;
    for (const p of this.list) {
      p.mesh.visible = aboveHorizon(cam, p.centre, p.reach) && cam.distanceTo(p.centre) < 1500;
      if (!p.glow || !p.light) continue;
      // the fire's light caught in its own smoke, beyond what the shared lamp list gives (and kept far away):
      // a warm tint by day, stylised up after dark so plumes read as lit from below
      const k = p.light.intensity * (0.25 + 2 * f.env.night);
      p.glow.set(p.light.color.r * k, p.light.color.g * k, p.light.color.b * k, p.light.range);
      ((p.mesh.material as THREE.ShaderMaterial).uniforms.uGlowPos.value as THREE.Vector3).copy(p.light.pos);
    }
  }
}

// ---------------------------------------------------------------------------------------------
class Bursts {
  private readonly a: THREE.InstancedBufferAttribute;
  private readonly b: THREE.InstancedBufferAttribute;
  private readonly c: THREE.InstancedBufferAttribute;
  private readonly random: () => number;
  private head = 0;
  private dirty = false;

  constructor(kit: Kit) {
    this.random = kit.random;
    this.a = dynamicAttr(BURSTS);
    this.b = dynamicAttr(BURSTS);
    this.c = dynamicAttr(BURSTS);
    for (let i = 0; i < BURSTS; i++) this.a.setW(i, -1e4);
    const geometry = quads(BURST_PARTS, BURSTS, { aA: this.a, aB: this.b, aC: this.c });
    kit.mesh(geometry, kit.material(BURST_VS, BURST_FS), LAYER.OVER, 3);
  }

  /** `at` is a point on the water surface, `dir` a unit tangent there. */
  emit(kind: BurstKind, at: THREE.Vector3, dir: THREE.Vector3, strength: number, scale: number, t: number): void {
    const i = this.head;
    this.head = (i + 1) % BURSTS;
    this.a.setXYZW(i, at.x, at.y, at.z, t);
    this.b.setXYZW(i, dir.x, dir.y, dir.z, strength);
    this.c.setXYZW(i, kind, this.random() * 512, at.length(), scale);
    this.dirty = true;
  }

  flush(): void {
    if (!this.dirty) return;
    this.a.needsUpdate = this.b.needsUpdate = this.c.needsUpdate = true;
    this.dirty = false;
  }
}

// ---------------------------------------------------------------------------------------------
interface Bank {
  p: THREE.Vector3;
  width: number;
  height: number;
  seed: number;
  age: number;
  life: number;
  weight: number; // thicker over lagoons and shallows
}
const BANKS = 56;

class SeaMist {
  private readonly ctx: Ctx;
  private readonly banks: Bank[] = [];
  private readonly a: THREE.InstancedBufferAttribute;
  private readonly b: THREE.InstancedBufferAttribute;
  private readonly mesh: THREE.Mesh;
  private readonly random: () => number;
  private started = false;

  constructor(kit: Kit) {
    this.ctx = kit.ctx;
    this.random = kit.random;
    this.a = dynamicAttr(BANKS);
    this.b = dynamicAttr(BANKS);
    for (let i = 0; i < BANKS; i++) {
      const seed = this.random() * 10;
      this.banks.push({ p: new THREE.Vector3(), width: 0, height: 0, seed, age: 0, life: 1, weight: 0 });
    }
    const geometry = quads(2, BANKS, { aBank: this.a, aBank2: this.b });
    this.mesh = kit.mesh(geometry, kit.material(MIST_VS, MIST_FS), LAYER.OVER, 1);
  }

  private respawn(b: Bank, focus: THREE.Vector3, initial: boolean): void {
    const up = tmpA.copy(focus).normalize();
    for (let tries = 0; tries < 8; tries++) {
      const a = this.random() * Math.PI * 2, d = 6 + 190 * Math.sqrt(this.random());
      const t = tangent(up, tmpB).applyAxisAngle(up, a);
      b.p.copy(up);
      slide(b.p, t, d);
      const h = this.ctx.world.heights[cellOf(b.p, HN)];
      b.weight = h < -0.5 ? (h > -14 ? 1 : 0.45) : 0;
      if (b.weight > 0) break;
    }
    b.width = 35 + 55 * this.random();
    b.height = 3 + 4 * this.random();
    b.life = 70 + 80 * this.random();
    b.age = initial ? this.random() * b.life : 0;
  }

  update(f: Frame, amount: number): void {
    this.mesh.visible = amount > 0.01;
    if (!this.mesh.visible) return;
    const w = tmpC;
    for (let i = 0; i < BANKS; i++) {
      const b = this.banks[i];
      b.age += f.dt;
      const far = b.p.distanceTo(tmpA.copy(f.focus).normalize()) * R > 230;
      if (!this.started || b.age > b.life || far) this.respawn(b, f.focus, !this.started);
      wind(b.p, f.simTime, w);
      slide(b.p, w, WIND_DRIFT * 0.6 * f.dt);
      const env = smoothstep(0, 0.15, b.age / b.life) * smoothstep(1, 0.8, b.age / b.life);
      this.a.setXYZW(i, b.p.x * R, b.p.y * R, b.p.z * R, b.width);
      this.b.setXYZW(i, b.height, b.seed, amount * b.weight * env, 0);
    }
    this.started = true;
    this.a.needsUpdate = this.b.needsUpdate = true;
  }
}

// ---------------------------------------------------------------------------------------------
interface Floater {
  kind: number; // index into Floats.kinds
  p: THREE.Vector3; // unit direction of the centre
  v: THREE.Vector3; // tangent velocity, world units/s
  yaw: number;
  spin: number; // rad/s
  r: number; // footprint radius, world units
  scale: number;
  follow: number; // how far it tilts with the swell
  drift: number; // response to the wind
  phase: number;
  age: number;
  life: number; // seconds left, Infinity for permanent drifters
  style: number; // STYLE
  color: THREE.Color; // instance tint (sail scraps take their ship's colour)
  active: boolean;
}
const STYLE = { none: 0, surface: 1, drop: 2 } as const; // debris bobs up from a wreck; calved ice tips in

interface FloatKind {
  mesh: THREE.InstancedMesh;
  attr: THREE.InstancedBufferAttribute;
  items: Floater[];
  ice: boolean;
}

const DEBRIS = [
  'plank', 'plank', 'barrel', 'plank', 'spar', 'barrel', 'grating',
  'plank', 'scrap', 'barrel', 'plank', 'spar', 'grating', 'plank',
];

/** Driftwood, kelp rafts, ice floes and bergs, and wreck debris: instanced meshes riding the swell, drifting
 * with the wind, shoved aside by hulls, kept off the land, and (ice) kept apart from each other. */
class Floats {
  private readonly ctx: Ctx;
  private readonly splash: (at: THREE.Vector3, size: number) => void;
  private readonly random: () => number;
  private readonly kinds: FloatKind[] = [];
  private readonly byName = new Map<string, Floater[]>();
  private readonly near: Floater[] = [];
  private calveIn = 10;
  private readonly m = new THREE.Matrix4();
  private readonly scale = new THREE.Vector3();
  private readonly w = new THREE.Vector3();
  private readonly fwd = new THREE.Vector3();
  private readonly side = new THREE.Vector3();
  private readonly old = new THREE.Vector3();

  constructor(kit: Kit, onSplash: (at: THREE.Vector3, size: number) => void) {
    this.ctx = kit.ctx;
    this.splash = onSplash;
    this.random = kit.random;
    const rng = new Rng(kit.ctx.seed ^ 0xf10a7);
    const wood = floatOnSwell(new THREE.MeshStandardMaterial({
      map: loadTexture(woodColorUrl, true), normalMap: loadTexture(woodNormalUrl, false),
      roughnessMap: loadTexture(woodArmUrl, false), aoMap: loadTexture(woodArmUrl, false),
      vertexColors: true, roughness: 0.75,
    }), kit.u);
    const kelp = floatOnSwell(
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, side: THREE.DoubleSide }), kit.u,
    );
    const ice = floatOnSwell(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3 }), kit.u);
    const canvas = floatOnSwell(new THREE.MeshStandardMaterial({ roughness: 0.85, side: THREE.DoubleSide }), kit.u);
    const defs: [string, THREE.BufferGeometry, THREE.Material, number][] = [
      ['drift', driftwood(rng), wood, 22], ['drift', driftwood(rng), wood, 22], ['drift', driftwood(rng), wood, 22],
      ['kelp', kelpRaft(rng), kelp, 26], ['kelp', kelpRaft(rng), kelp, 26],
      ['floe', floe(rng), ice, 30], ['floe', floe(rng), ice, 30],
      ['floe', floe(rng), ice, 30], ['floe', floe(rng), ice, 30],
      ['berg', berg(rng), ice, 6], ['berg', berg(rng), ice, 6], ['berg', berg(rng), ice, 6],
      ['plank', plank(rng), wood, 36], ['barrel', barrel(), wood, 24], ['spar', spar(rng), wood, 12],
      ['grating', grating(), wood, 12], ['scrap', sailScrap(rng), canvas, 6],
    ];
    for (const [name, geo, mat, cap] of defs) {
      const attr = dynamicAttr(cap);
      geo.setAttribute('aFloat', attr);
      const mesh = new THREE.InstancedMesh(geo, mat, cap);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.receiveShadow = true;
      if (name === 'scrap') mesh.setColorAt(0, WHITE);
      kit.add(mesh);
      const kind = this.kinds.length, items: Floater[] = [];
      for (let i = 0; i < cap; i++) {
        items.push({
          kind, p: new THREE.Vector3(), v: new THREE.Vector3(), yaw: rng.next() * 6.3, spin: 0, r: 1, scale: 1,
          follow: 1, drift: 0.06, phase: rng.next() * 6.3, age: 0, life: Infinity, style: STYLE.none,
          color: new THREE.Color(1, 1, 1), active: false,
        });
      }
      this.kinds.push({ mesh, attr, items, ice: name === 'floe' || name === 'berg' });
      this.byName.set(name, [...(this.byName.get(name) ?? []), ...items]);
    }
    this.scatter(rng);
  }

  /** Is a footprint of radius r at p wholly on open water? Buoys, poles, piers and huts all stand in water too
   * shallow to navigate, so this keeps floating things off them as well as off every shore and rock. */
  private clear(p: THREE.Vector3, r: number): boolean {
    return this.ctx.world.coastAt(p) > r + 0.4;
  }

  /** Seeded placement of the permanent drifters: wood and kelp across open water, pack ice around polar bergs. */
  private scatter(rng: Rng): void {
    const world = this.ctx.world, rnd = () => rng.next();
    const place = (it: Floater, pick: (p: THREE.Vector3) => boolean) => {
      for (let tries = 0; tries < 200 && !it.active; tries++) it.active = pick(it.p) && this.clear(it.p, it.r + 1);
    };
    for (const it of this.byName.get('berg')!) {
      Object.assign(it, { scale: 2.4 + rng.next() * 2.4, follow: 0.12, drift: 0.02 });
      it.r = it.scale * 1.15;
      place(it, (p) => world.climate(randomDir(rnd, p)) > 1.7);
    }
    for (const it of this.byName.get('floe')!) {
      Object.assign(it, { scale: 1.2 + rng.next() * rng.next() * 3.5, follow: 0.8, drift: 0.05 });
      it.r = it.scale * 0.95;
      place(it, (p) => world.climate(this.nearBerg(p, rng.next() < 0.6 ? 8 + rng.next() * 30 : -1, rnd)) > 1.5);
    }
    for (const it of this.byName.get('drift')!) {
      it.r = 1.4;
      it.spin = (rng.next() - 0.5) * 0.05;
      place(it, (p) => world.climate(randomDir(rnd, p)) < 1.6);
    }
    for (const it of this.byName.get('kelp')!) {
      it.r = 1.1;
      it.spin = (rng.next() - 0.5) * 0.05;
      place(it, (p) => Math.abs(world.climate(randomDir(rnd, p)) - 1) < 0.5);
    }
  }

  /** A random spot `dist` units from a random active berg (anywhere if dist < 0 or there is none). */
  private nearBerg(p: THREE.Vector3, dist: number, rnd: () => number): THREE.Vector3 {
    const bergs = this.byName.get('berg')!, b = bergs[Math.floor(rnd() * bergs.length)];
    if (dist < 0 || !b.active) return randomDir(rnd, p);
    return slide(p.copy(b.p), tangent(b.p, tmpA).applyAxisAngle(b.p, rnd() * 6.3), dist + b.r);
  }

  /** An idle item of a kind, or else the one closest to fading out. */
  private claim(name: string): Floater {
    let best = this.byName.get(name)![0];
    for (const it of this.byName.get(name)!) {
      if (!it.active) return it;
      if (it.life < best.life) best = it;
    }
    return best;
  }

  /** Throw the next piece of a wreck into the sea around the hull; sail scraps take the ship's colour. */
  debris(piece: number, at: THREE.Vector3, fwd: THREE.Vector3, length: number, color: THREE.Color): void {
    const name = DEBRIS[piece % DEBRIS.length], it = this.claim(name);
    const up = tmpA.copy(at).normalize(), side = tmpB.crossVectors(up, fwd);
    const a = this.random() * Math.PI * 2, d = 0.5 + this.random() * 0.6;
    const ca = Math.cos(a), sa = Math.sin(a);
    it.r = name === 'spar' ? 1.4 : name === 'plank' ? 0.6 : 0.35;
    it.p.copy(at).addScaledVector(fwd, ca * d * length * 0.5).addScaledVector(side, sa * d * length * 0.25).normalize();
    if (!this.clear(it.p, it.r)) it.p.copy(up); // a wreck close inshore keeps its debris over its own hull
    it.v.copy(fwd).multiplyScalar(ca).addScaledVector(side, sa).multiplyScalar(0.6 + this.random() * 0.9);
    Object.assign(it, {
      yaw: this.random() * 6.3, spin: (this.random() - 0.5) * 0.6, scale: 1, follow: 1, drift: 0.08, age: 0,
      life: 30 + this.random() * 6, style: STYLE.surface, active: true,
    });
    it.color.copy(name === 'scrap' ? color : WHITE);
  }

  /** A berg near the view sheds a floe, which tips into the sea beside it and drifts off. */
  private calve(cam: THREE.Vector3): void {
    let berg: Floater | null = null, best = 170;
    for (const it of this.byName.get('berg')!) {
      const d = cam.distanceTo(tmpA.copy(it.p).multiplyScalar(R));
      if (it.active && d < best && aboveHorizon(cam, tmpA, 8)) [best, berg] = [d, it];
    }
    if (!berg) return;
    let floe = this.claim('floe');
    if (floe.active) {
      for (const it of this.byName.get('floe')!) if (cam.distanceTo(tmpA.copy(it.p).multiplyScalar(R)) > 250) floe = it;
    }
    const out = tangent(berg.p, tmpB).applyAxisAngle(berg.p, this.random() * Math.PI * 2);
    const scale = 0.9 + this.random() * 1.2, at = slide(tmpC.copy(berg.p), out, berg.r + scale * 0.85);
    if (!this.clear(at, scale)) return;
    Object.assign(floe, {
      scale, r: scale * 0.95, spin: (this.random() - 0.5) * 0.3, age: 0, life: Infinity, style: STYLE.drop,
      active: true,
    });
    floe.p.copy(at);
    floe.v.copy(out).multiplyScalar(1.2);
    this.splash(floe.p, floe.scale);
  }

  update(f: Frame): void {
    const cam = f.camera.position, dt = f.dt, world = this.ctx.world;
    this.calveIn -= dt;
    if (this.calveIn <= 0) {
      this.calveIn = 15 + this.random() * 20;
      this.calve(cam);
    }
    this.near.length = 0;
    for (const kind of this.kinds) {
      let n = 0;
      for (const it of kind.items) {
        if (!it.active || cam.distanceTo(tmpA.copy(it.p).multiplyScalar(R)) > 320) continue;
        it.age += dt;
        it.life -= dt;
        if (it.life <= 0) {
          // melted ice reappears out of sight around some berg; debris is gone
          this.nearBerg(it.p, 10 + this.random() * 25, this.random);
          const away = cam.distanceTo(tmpA.copy(it.p).multiplyScalar(R)) > 250;
          it.active = kind.ice && away && world.climate(it.p) > 1.5 && this.clear(it.p, it.r);
          it.life = Infinity;
          it.style = STYLE.none;
          continue;
        }
        wind(it.p, f.simTime, this.w);
        it.v.lerp(this.w.multiplyScalar(WIND_DRIFT * it.drift), Math.min(1, dt * 0.4));
        it.yaw += it.spin * dt;
        it.spin *= Math.exp(-dt * 0.2);
        this.old.copy(it.p);
        this.push(it, f);
        slide(it.p, it.v, dt);
        it.v.addScaledVector(it.p, -it.v.dot(it.p));
        // never onto a shore, rock or post: refuse any step that closes on one while within reach of it
        const room = world.coastAt(it.p);
        if (room < it.r + 0.4 && room < world.coastAt(this.old)) {
          it.p.copy(this.old);
          it.v.multiplyScalar(-0.3);
        }
        this.near.push(it);
        if (kind.ice && it.life === Infinity && world.climate(it.p) < 1.3) it.life = 10; // melts in warmer water
        if (aboveHorizon(cam, tmpA.copy(it.p).multiplyScalar(R), it.r * 3)) this.write(kind, n++, it);
      }
      kind.mesh.count = n;
      kind.mesh.visible = n > 0;
      if (!n) continue;
      kind.mesh.instanceMatrix.needsUpdate = true;
      kind.attr.needsUpdate = true;
      if (kind.mesh.instanceColor) kind.mesh.instanceColor.needsUpdate = true;
    }
    this.separate();
  }

  /** Hulls shove floating things aside: anything inside a ship's waterline ellipse is moved to its rim. */
  private push(it: Floater, f: Frame): void {
    const wp = tmpA.copy(it.p).multiplyScalar(R);
    for (const pose of f.poses) {
      if (!pose.visible) continue;
      const L = pose.length, d = tmpB.subVectors(wp, pose.pos);
      if (d.lengthSq() > (L + it.r) * (L + it.r)) continue;
      this.side.crossVectors(pose.up, pose.fwd);
      const z = d.dot(pose.fwd), x = d.dot(this.side), a = L * 0.5 + it.r * 0.6, b = L * 0.17 + it.r * 0.6;
      const e = (z / a) ** 2 + (x / b) ** 2;
      if (e >= 1) continue;
      const k = 1 / Math.sqrt(Math.max(e, 1e-4)), out = Math.sign(x) || 1;
      wp.copy(pose.pos).addScaledVector(pose.fwd, z * k).addScaledVector(this.side, x * k);
      it.p.copy(wp).normalize();
      it.v.copy(pose.fwd).multiplyScalar(pose.speed * 0.4).addScaledVector(this.side, out * (1.2 + pose.speed * 0.15));
      it.spin += (this.random() - 0.5) * 0.5;
    }
  }

  /** Keep floating things near the view from interpenetrating; the lighter one gives way. */
  private separate(): void {
    const near = this.near;
    for (let i = 0; i < near.length; i++) {
      const a = near[i];
      for (let j = i + 1; j < near.length; j++) {
        const b = near[j];
        const d = tmpA.subVectors(b.p, a.p).multiplyScalar(R), l = d.length(), min = a.r + b.r;
        if (l >= min || l < 1e-5) continue;
        const share = a.scale * a.scale / (a.scale * a.scale + b.scale * b.scale), k = (min - l) / l / R;
        a.p.addScaledVector(d, -k * (1 - share)).normalize();
        b.p.addScaledVector(d, k * share).normalize();
      }
    }
  }

  private write(kind: FloatKind, i: number, it: Floater): void {
    const up = it.p, fwd = tangent(up, this.fwd).applyAxisAngle(up, it.yaw), right = this.side.crossVectors(up, fwd);
    this.m.makeBasis(right, up, fwd).scale(this.scale.setScalar(it.scale)).setPosition(tmpB.copy(up).multiplyScalar(R));
    kind.mesh.setMatrixAt(i, this.m);
    let depth = 0;
    if (it.style === STYLE.surface) depth += Math.max(0, 1 - it.age / 2.5) * 0.6;
    if (it.style === STYLE.drop) depth -= Math.max(0, 1 - it.age / 1.1) ** 2 * it.scale * 0.8;
    if (it.life < 8) depth += ((8 - it.life) / 8) * 0.9 * it.scale;
    kind.attr.setXYZW(i, depth, it.follow, it.phase, 0);
    if (kind.mesh.instanceColor) kind.mesh.setColorAt(i, it.color);
  }
}

// ---------------------------------------------------------------------------------------------
class Slicks {
  private readonly mats: THREE.ShaderMaterial[] = [];
  private readonly meshes: THREE.Mesh[] = [];
  private readonly random: () => number;
  private next = 0;

  constructor(kit: Kit) {
    this.random = kit.random;
    const geo = new THREE.RingGeometry(0, 1, 40, 10);
    for (let i = 0; i < 4; i++) {
      const mat = kit.material(SLICK_VS, SLICK_FS, {
        uSlick: { value: new THREE.Vector4(0, 1, 0, -1e4) }, uSeed: { value: this.random() * 9 },
      });
      this.mats.push(mat);
      const mesh = kit.mesh(geo, mat, LAYER.OVER, 0);
      mesh.visible = false;
      this.meshes.push(mesh);
    }
  }

  start(dir: V3, t: number): void {
    const m = this.mats[this.next];
    (m.uniforms.uSlick.value as THREE.Vector4).set(dir.x, dir.y, dir.z, t);
    m.uniforms.uSeed.value = this.random() * 9;
    this.next = (this.next + 1) % this.mats.length;
  }

  update(t: number): void {
    for (let i = 0; i < this.mats.length; i++) {
      this.meshes[i].visible = t - (this.mats[i].uniforms.uSlick.value as THREE.Vector4).w < 33;
    }
  }
}

// ---------------------------------------------------------------------------------------------
interface Wreck {
  ship: number;
  t0: number;
  at: THREE.Vector3; // on the water where it went down
  fwd: THREE.Vector3;
  color: THREE.Color;
  boil: number; // countdown to the next boil/vent burst
  pieces: number; // debris thrown so far
  plunged: boolean;
}

interface ShipState {
  pitch: number;
  cool: number; // bow spray cooldown
  spark: number; // wake spark countdown
  rising: number; // render time of the last respawn
}

/** All particles and weather effects. */
export class Fx {
  private readonly ctx: Ctx;
  private readonly kit: Kit;
  private readonly plumes: Plumes;
  private readonly bursts: Bursts;
  private readonly mist: SeaMist;
  private readonly floats: Floats;
  private readonly slicks: Slicks;
  private readonly rain: THREE.Mesh;
  private readonly curtains: THREE.Mesh;
  private readonly splashes: THREE.Mesh;
  private readonly spray: THREE.Mesh;
  private readonly motes: THREE.Mesh;
  private readonly wrecks: Wreck[] = [];
  private readonly ships: ShipState[];
  private readonly random: () => number;
  private readonly sw = new THREE.Vector4();
  private readonly p0 = new THREE.Vector3();
  private readonly p1 = new THREE.Vector3();
  private readonly d0 = new THREE.Vector3();
  private readonly d1 = new THREE.Vector3();

  constructor(ctx: Ctx) {
    this.ctx = ctx;
    const kit = (this.kit = new Kit(ctx)), rng = new Rng(ctx.seed ^ 0xf00d);
    this.random = kit.random;
    this.plumes = new Plumes(kit);
    this.bursts = new Bursts(kit);
    this.mist = new SeaMist(kit);
    this.slicks = new Slicks(kit);
    this.floats = new Floats(kit, (dir, size) => {
      const at = this.water(dir, this.p1);
      this.bursts.emit(BURST.splash, at, tangent(dir, this.d1), 0.7 + 0.2 * size, 1.5 * size, this.kit.u.uTime.value);
      this.bursts.emit(BURST.boil, at, this.d1, size * 1.2, 1, this.kit.u.uTime.value);
    });
    const u = (v: number) => ({ value: v });
    const drops = quads(1, 5000, { aRand: randomAttr(5000, rng) });
    this.rain = kit.mesh(drops, kit.material(RAIN_VS, RAIN_FS, { uRainNear: u(0) }), LAYER.OVER, 5);
    const sheets = kit.material(CURTAIN_VS, CURTAIN_FS, { uCurtain: u(0) });
    this.curtains = kit.mesh(quads(1, CURTAIN_N ** 2), sheets, LAYER.OVER, 4);
    const crowns = kit.material(SPLASH_VS, SPLASH_FS, { uSplash: u(0) });
    this.splashes = kit.mesh(quads(1, SPLASH_N ** 2), crowns, LAYER.OVER, 2);
    this.spray = kit.mesh(quads(1, SPRAY_N ** 2), kit.material(SPRAY_VS, SPRAY_FS, { uGale: u(0) }), LAYER.OVER, 2);
    const motes = quads(1, 1400, { aRand: randomAttr(1400, rng) });
    this.motes = kit.mesh(motes, kit.material(MOTE_VS, MOTE_FS, { uMotes: u(0) }), LAYER.OVER, 6);
    this.ships = ctx.sim.ships.map(() => ({ pitch: 0, cool: 0, spark: 0, rising: -1e4 }));
    for (let i = 0; i < 6; i++) {
      this.wrecks.push({
        ship: -1, t0: -1e4, at: new THREE.Vector3(), fwd: new THREE.Vector3(), color: new THREE.Color(),
        boil: 0, pieces: 99, plunged: true,
      });
    }
    kit.warm();
  }

  /** Set a mesh's strength uniform and draw it only while it shows. */
  private static gate(m: THREE.Mesh, name: string, v: number): void {
    (m.material as THREE.ShaderMaterial).uniforms[name].value = v;
    m.visible = v > 0.001;
  }

  /** Point on the water surface above unit direction `dir`. */
  private water(dir: V3, out: THREE.Vector3): THREE.Vector3 {
    swell(dir, this.kit.u.uTime.value, this.kit.u.uSimTime.value, this.sw);
    return out.set(dir.x, dir.y, dir.z).normalize().multiplyScalar(R + this.sw.w);
  }

  update(f: Frame): void {
    const env = f.env, fx = this.kit.fx, cam = f.camera.position, alt = cam.length() - R;
    fx.uFocus.value.copy(f.focus);

    Fx.gate(this.rain, 'uRainNear', env.rain * (1 - smoothstep(25, 70, alt)));
    Fx.gate(this.splashes, 'uSplash', env.rain * (1 - smoothstep(60, 150, alt)));
    Fx.gate(this.curtains, 'uCurtain', smoothstep(0.15, 0.8, env.storm) * (1 - smoothstep(300, 600, alt)));
    const gale = Math.min(1, smoothstep(1.0, 1.8, env.windDir.length()) * 0.5 + env.storm);
    (this.spray.material as THREE.ShaderMaterial).uniforms.uGale.value = gale;
    this.spray.visible = alt < 150;
    // motes: strongest with a low sun, near land
    const up = this.p0.copy(f.focus).normalize(), sunUp = up.dot(env.sunDir);
    const golden = smoothstep(0.0, 0.08, sunUp) * (1 - smoothstep(0.3, 0.6, sunUp)) + 0.15 * smoothstep(0.0, 0.3, sunUp);
    const land = 1 - smoothstep(8, 60, this.ctx.world.coastAt(up));
    Fx.gate(this.motes, 'uMotes', golden * (0.35 + 0.65 * land) * (1 - env.storm) * (1 - smoothstep(40, 90, alt)));
    // low mist: thick at dawn, thin by midday, back at night and under the storm
    const h = env.hour;
    const dawn = smoothstep(4.2, 5.6, h) * (1 - smoothstep(8.0, 10.5, h));
    const mist = Math.min(1, 0.1 + 0.9 * dawn + 0.4 * env.night + 0.35 * env.storm);
    this.mist.update(f, mist * (1 - smoothstep(250, 500, alt)));

    for (const e of f.events) this.event(e, f);
    this.shipEffects(f);
    this.plumes.update(f);
    this.floats.update(f);
    this.slicks.update(f.t);
    this.bursts.flush();
  }

  private event(e: SimEvent, f: Frame): void {
    const t = f.t, poses = f.poses;
    if (e.type === 'sink') {
      const w = this.wrecks.reduce((a, b) => (b.t0 < a.t0 ? b : a));
      const L = poses[e.ship].length;
      Object.assign(w, { ship: e.ship, t0: t, boil: 0, pieces: 0, plunged: false });
      this.water(e.pos, w.at);
      w.fwd.set(e.fwd.x, e.fwd.y, e.fwd.z);
      teamColor(e.ship, w.color).lerp(new THREE.Color(0xe9dfc8), 0.25);
      const up = this.p0.copy(w.at).normalize();
      for (let k = 0; k < 3; k++) {
        this.bursts.emit(BURST.spray, w.at, this.d0.copy(w.fwd).applyAxisAngle(up, k * 2.1), 1.2, L / 5, t);
      }
      this.bursts.emit(BURST.boil, w.at, w.fwd, L * 0.4, L / 5, t);
      this.slicks.start(e.pos, t + 0.5);
    } else if (e.type === 'respawn') {
      const s = this.ctx.sim.ships[e.ship], L = poses[e.ship].length, at = this.water(s.pos, this.p1);
      this.ships[e.ship].rising = t;
      const fw = this.d0.set(s.fwd.x, s.fwd.y, s.fwd.z);
      this.bursts.emit(BURST.column, at, fw, 1.2, L / 4, t);
      this.bursts.emit(BURST.splash, at, fw, 1.0, L / 3, t);
      this.bursts.emit(BURST.boil, at, fw, L * 0.45, L / 5, t);
    } else if (e.type === 'bump') {
      const a = poses[e.a], b = poses[e.b];
      if (!a.visible || !b.visible) return;
      const at = this.water(this.p0.addVectors(a.pos, b.pos).normalize(), this.p1);
      const dir = this.d0.subVectors(a.pos, b.pos);
      dir.addScaledVector(this.p0, -dir.dot(this.p0)).normalize();
      const s = THREE.MathUtils.clamp(e.strength / 8, 0.3, 1.4); // closing speed, u/s
      this.bursts.emit(BURST.spray, at, dir, s, (a.length + b.length) / 10, t);
      this.bursts.emit(BURST.spray, at, dir.negate(), s, (a.length + b.length) / 10, t);
    } else if (e.type === 'ground') {
      const p = poses[e.ship];
      if (!p.visible) return;
      const bow = this.d1.set(0, 0, 1).applyQuaternion(p.quat);
      const at = this.water(this.p0.copy(p.pos).addScaledVector(bow, p.length * 0.5).normalize(), this.p1);
      const s = THREE.MathUtils.clamp(e.strength / 6, 0.4, 1.5); // impact speed, u/s
      this.bursts.emit(BURST.spray, at, this.d0.copy(p.fwd), s, p.length / 4, t);
      this.bursts.emit(BURST.splash, at, p.fwd, 0.9, p.length / 4, t);
    }
  }

  /** Bow spray in chop, bioluminescent wake sparks at night, the sinking and respawn sequences. */
  private shipEffects(f: Frame): void {
    const t = f.t, env = f.env, cam = f.camera.position, dt = Math.max(f.dt, 1e-3);
    for (const p of f.poses) {
      const st = this.ships[p.id];
      if (!p.visible) continue;
      const bow = this.d1.set(0, 0, 1).applyQuaternion(p.quat);
      const pitch = Math.asin(THREE.MathUtils.clamp(bow.dot(p.up), -1, 1));
      const plunge = Math.max(0, (st.pitch - pitch) / dt);
      st.pitch = pitch;
      st.cool -= dt;
      st.spark -= dt;
      if (cam.distanceTo(p.pos) > 150 || p.sink > 0) continue;
      const L = p.length, side = this.d0.crossVectors(p.up, p.fwd);
      // bow driving down into a crest, or a random slam in a storm sea
      let s = plunge * 1.6 * (p.speed / 9);
      if (this.random() < dt * env.storm * 1.5 * (p.speed / 9)) s = Math.max(s, 0.5 + 0.6 * env.storm * this.random());
      if (s > 0.25 && st.cool <= 0) {
        st.cool = 0.3;
        const at = this.water(this.p0.copy(p.pos).addScaledVector(p.fwd, L * 0.48).normalize(), this.p1);
        for (let k = -1; k <= 1; k += 2) {
          const dir = this.p0.copy(p.fwd).multiplyScalar(0.6).addScaledVector(side, k * 0.8).normalize();
          this.bursts.emit(BURST.spray, at, dir, Math.min(1.4, s), L / 5, t);
        }
      }
      if (env.night > 0.2 && p.speed > 2 && st.spark <= 0 && cam.distanceTo(p.pos) < 90) {
        st.spark = 0.09;
        const k = this.random();
        const along = k < 0.4 ? 0.45 : k < 0.7 ? 0.1 : -0.5, out = k < 0.7 ? (this.random() < 0.5 ? -1 : 1) * 0.18 : 0;
        const spot = this.p0.copy(p.pos).addScaledVector(p.fwd, along * L).addScaledVector(side, out * L).normalize();
        const at = this.water(spot, this.p1);
        this.bursts.emit(BURST.spark, at, p.fwd, L * 0.25, 1, t);
      }
      // surging up through its respawn burst
      const age = t - st.rising;
      if (age < 2.5 && st.cool <= 0) {
        st.cool = 0.14;
        const along = (this.random() - 0.5) * L * 0.8, k = this.random() < 0.5 ? -1 : 1;
        const spot = this.p0.copy(p.pos).addScaledVector(p.fwd, along).addScaledVector(side, k * L * 0.17).normalize();
        const at = this.water(spot, this.p1);
        this.bursts.emit(BURST.spray, at, this.p0.copy(side).multiplyScalar(k), 0.8 * (1 - age / 2.5), L / 5, t);
      }
    }
    for (const w of this.wrecks) this.wreck(w, f);
  }

  private wreck(w: Wreck, f: Frame): void {
    const t = f.t, age = t - w.t0;
    if (age > 40) return;
    const pose = f.poses[w.ship], L = pose.length;
    const sinking = pose.visible && pose.sink > 0 && pose.sink < 1;
    const progress = sinking ? pose.sink : Math.min(1, age / 8);
    const centre = sinking ? pose.pos : w.at;
    const up = this.p0.copy(centre).normalize(), side = this.d0.crossVectors(up, w.fwd);
    w.boil -= f.dt;
    if (age < 11 && w.boil <= 0) {
      w.boil = 0.12;
      const fade = 1 - age / 12;
      const spot = this.d1.copy(centre).addScaledVector(w.fwd, (this.random() - 0.5) * L * 0.8);
      const at = this.water(spot.addScaledVector(side, (this.random() - 0.5) * L * 0.3).normalize(), this.p1);
      this.bursts.emit(BURST.boil, at, w.fwd, L * 0.2 * fade + 0.3, L / 6, t);
      if (this.random() < 0.3 * fade) {
        const dir = tangent(up, this.d1).applyAxisAngle(up, this.random() * 6.3);
        this.bursts.emit(BURST.spray, at, dir, 0.6 * fade, L / 6, t);
      }
    }
    if (progress > 0.85 && !w.plunged) {
      w.plunged = true;
      const at = this.water(up, this.p1);
      this.bursts.emit(BURST.column, at, w.fwd, 0.45, L / 5, t);
      this.bursts.emit(BURST.splash, at, w.fwd, 1.0, L / 4, t);
    }
    if (progress > 0.2 && w.pieces < DEBRIS.length && age > 1 + w.pieces * 0.3) {
      this.floats.debris(w.pieces++, w.at, w.fwd, L, w.color);
    }
  }
}

// Sky and light on the sphere, ported from the rewrite's src/gfx/sky.ts. The rewrite picked one of five moods for a
// match; here the mood comes from the sun's height where the camera is (from the match hour and the planet's tilt)
// plus the weather it is in. The dome draws the sky from the sea and gives way to space, stars and the planet's
// glowing limb as the camera climbs. One sun and a moon light the planet; planet.ts darkens the far side.
import * as THREE from 'three';
import { U, newGrade, type Grade } from './engine.ts';

// ---------------------------------------------------------------- the sun, the moon and the stars

const TAU = Math.PI * 2;

const DEG = Math.PI / 180;

/**
 * The sun's direction in the planet's frame. `hour` is the local solar time at longitude `lon` (degrees; 0 by
 * default, so then it is the planet's own clock): the sun stands over longitude lon - (hour - 12) × 15°, moving
 * west. `tilt` is the sun's latitude in degrees (positive: northern summer, midnight sun on the Ice Crown; negative:
 * polar night there). The same rule as the app's sunFor().
 */
export function sunDirection(hour: number, tilt: number, out = new THREE.Vector3(), lon = 0): THREE.Vector3 {
  const l = (lon - (hour - 12) * 15) * DEG, t = tilt * DEG, c = Math.cos(t);
  return out.set(c * Math.cos(l), Math.sin(t), -c * Math.sin(l));
}

/** The moon: nearly opposite the sun, a nearly full moon that lights the night side. */
export function moonDirection(hour: number, tilt: number, out = new THREE.Vector3(), lon = 0): THREE.Vector3 {
  const l = (lon - (hour - 12) * 15) * DEG + Math.PI + 0.45, lat = -tilt * DEG * 0.6 + 0.12, c = Math.cos(lat);
  return out.set(c * Math.cos(l), Math.sin(lat), -c * Math.sin(l));
}

/** How far the stars have turned with the hour, about the planet's axis. */
export const starSpin = (hour: number): number => (hour / 24) * TAU;

// ---------------------------------------------------------------- moods

/** A mood: the rewrite's weather presets, now chosen by the sun's height and the weather. Colours are sRGB hex. */
interface Mood {
  zenith: number; horizon: number; fogSun: number; fog: number; falloff: number; mist: number; mistFall: number;
  cloud: number; cloudLit: number; cloudShade: number; streak: number;
  reflect: number; chop: number;
  exposure: number; bloom: number; sat: number; contrast: number; lift: number; gain: number; warm: number;
  stars: number; night: number;
}
const COLOURS = new Set<keyof Mood>(['zenith', 'horizon', 'fogSun', 'cloudLit', 'cloudShade', 'lift', 'gain']);

const NIGHT: Mood = {
  zenith: 0x060a1a, horizon: 0x1b2440, fogSun: 0x30406a, fog: 0.0016, falloff: 0.01, mist: 0.006, mistFall: 0.2,
  cloud: 0.32, cloudLit: 0x4a5878, cloudShade: 0x0c1020, streak: 0.7, reflect: 1, chop: 0.6,
  exposure: 1.35, bloom: 0.95, sat: 1.0, contrast: 1.05, lift: 0x0a1020, gain: 0xeef2ff, warm: 0, stars: 1, night: 1,
};
const DUSK: Mood = {
  zenith: 0x1e2448, horizon: 0x8a5a68, fogSun: 0xd08060, fog: 0.0015, falloff: 0.01, mist: 0.006, mistFall: 0.2,
  cloud: 0.45, cloudLit: 0xc07a70, cloudShade: 0x3a3050, streak: 0.8, reflect: 1, chop: 0.65,
  exposure: 1.15, bloom: 0.75, sat: 1.0, contrast: 1.06, lift: 0x1a1428, gain: 0xfff0e8, warm: 0.4, stars: 0.5, night: 0.6,
};
const GOLDEN: Mood = {
  zenith: 0x5d5a8e, horizon: 0xf2b38a, fogSun: 0xffc184, fog: 0.0015, falloff: 0.01, mist: 0.006, mistFall: 0.22,
  cloud: 0.5, cloudLit: 0xffc49a, cloudShade: 0x6c5b80, streak: 0.8, reflect: 1, chop: 0.7,
  exposure: 1.0, bloom: 0.6, sat: 1.05, contrast: 1.07, lift: 0x22162c, gain: 0xfff0e0, warm: 0.6, stars: 0, night: 0,
};
const DAWN: Mood = {
  zenith: 0x6c80a3, horizon: 0xaab3c3, fogSun: 0xe9cfc2, fog: 0.0012, falloff: 0.011, mist: 0.009, mistFall: 0.16,
  cloud: 0.62, cloudLit: 0xf0e7ec, cloudShade: 0x7f8799, streak: 1, reflect: 1, chop: 0.6,
  exposure: 1.0, bloom: 0.45, sat: 0.97, contrast: 1.06, lift: 0x182233, gain: 0xfff6ee, warm: 0.2, stars: 0, night: 0,
};
const MORNING: Mood = {
  zenith: 0x4a7cc2, horizon: 0xbfd2e2, fogSun: 0xf3ead8, fog: 0.0011, falloff: 0.009, mist: 0.004, mistFall: 0.25,
  cloud: 0.38, cloudLit: 0xffffff, cloudShade: 0x93a3b8, streak: 0.4, reflect: 0.85, chop: 0.8,
  exposure: 0.95, bloom: 0.35, sat: 1.08, contrast: 1.05, lift: 0x101a26, gain: 0xfffaf2, warm: 0.15, stars: 0, night: 0,
};
const NOON: Mood = {
  ...MORNING, zenith: 0x3a70c0, horizon: 0xb8d0e6, fogSun: 0xf6f0e0, fog: 0.001, cloud: 0.35, cloudShade: 0x9aaabd,
  exposure: 0.92, bloom: 0.3, warm: 0.05,
};
/** Weather overlays, blended in by how deep the camera is in a system. */
const SQUALL: Mood = {
  zenith: 0x5b646e, horizon: 0x939ca2, fogSun: 0xa9b0b4, fog: 0.0034, falloff: 0.008, mist: 0.02, mistFall: 0.12,
  cloud: 1, cloudLit: 0xa4abb2, cloudShade: 0x4b525a, streak: 0.3, reflect: 0.7, chop: 1.6,
  exposure: 1.05, bloom: 0.3, sat: 0.82, contrast: 1.08, lift: 0x121a1e, gain: 0xf2f6fa, warm: 0, stars: 0, night: 0,
};
const FOGGY: Mood = {
  ...DAWN, zenith: 0x8a96a8, horizon: 0xb4bcc6, fog: 0.0045, falloff: 0.012, mist: 0.04, mistFall: 0.1, cloud: 0.8, sat: 0.88, warm: 0,
};
const SNOWY: Mood = { ...SQUALL, zenith: 0x8c97a6, horizon: 0xc8d0da, fogSun: 0xe0e6ee, cloudLit: 0xdde3ea, cloudShade: 0x7b8592, sat: 0.8, exposure: 1.0 };
const ASHY: Mood = {
  ...SQUALL, zenith: 0x4a3e3a, horizon: 0x8a6a58, fogSun: 0xd0804a, fog: 0.004, cloudLit: 0x9a7a6a, cloudShade: 0x3a2a26, sat: 0.9, warm: 0.5,
};

const mixMood = (a: Mood, b: Mood, t: number, out: Mood): Mood => {
  const ca = new THREE.Color(), cb = new THREE.Color();
  for (const k of Object.keys(a) as (keyof Mood)[]) {
    if (COLOURS.has(k)) out[k] = ca.setHex(a[k]).lerp(cb.setHex(b[k]), t).getHex();
    else out[k] = a[k] + (b[k] - a[k]) * t;
  }
  return out;
};

const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** The mood at a sun height e (the sine of its elevation), rising or setting. */
function moodAt(e: number, rising: boolean, out: Mood): Mood {
  const low = rising ? DAWN : GOLDEN;
  if (e < -0.2) return Object.assign(out, NIGHT);
  if (e < -0.06) return mixMood(NIGHT, DUSK, smooth(-0.2, -0.06, e), out);
  if (e < 0.04) return mixMood(DUSK, low, smooth(-0.06, 0.04, e), out);
  if (e < 0.3) return mixMood(low, MORNING, smooth(0.04, 0.3, e), out);
  return mixMood(MORNING, NOON, smooth(0.3, 0.7, e), out);
}

// ---------------------------------------------------------------- the air's colours by sun height (planet.ts)

/** Rows of uKey: sRGB hex and intensity at the sun heights -0.25, -0.08, 0, 0.12, 0.45. */
const KEYS: [number, number][][] = [
  // fog: the horizon's air
  [[0x0c1226, 1], [0x2a2848, 1], [0xb07868, 1], [0xd8b898, 1], [0xb8cce0, 1]],
  // the sun's colour after the air (the sun light itself is white)
  [[0xff4a1a, 1], [0xff5a28, 1], [0xff8a50, 1], [0xffc890, 1], [0xfff4e6, 1]],
  // the sky's light from above: moonlit at night
  [[0x33456e, 0.75], [0x3c3c6c, 0.8], [0x7a7a9a, 0.9], [0x98aac8, 1.0], [0xa0c0e8, 1.15]],
  // the light off the ground
  [[0x0b0f14, 0.6], [0x16161e, 0.7], [0x2e2a28, 0.8], [0x46483a, 0.9], [0x506a3a, 1.0]],
];

// ---------------------------------------------------------------- the dome

const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = vec4(p.xy, p.w * 0.99999, p.w);
}`;

const SKY_FRAG = /* glsl */ `
#include <planet>
uniform vec3 uZenith, uHorizon, uSunColor, uCloudLit, uCloudShade, uMoonColor;
uniform float uCloud, uStreak, uStars, uFlash, uSpace, uStarSpin;
varying vec3 vDir;
float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
vec3 starField(vec3 d, float density, float scale) {
  vec3 c = floor(d * scale);
  float st = hash(c);
  vec3 f = fract(d * scale) - 0.5;
  float tw = 0.65 + 0.35 * sin(uTime * 2.0 + st * 40.0);
  return vec3(0.9, 0.95, 1.0) * step(density, st) * smoothstep(0.5, 0.0, length(f)) * (0.4 + 0.6 * fract(st * 91.0)) * tw;
}
void main() {
  vec3 d = normalize(vDir);
  vec3 up = normalize(cameraPosition);
  float alt = max(length(cameraPosition) - uPlanet.y, 0.0);
  // the sea's horizon sinks below level as the eye climbs
  float h = dot(d, up) + sqrt(2.0 * alt / uPlanet.x);
  float s = max(dot(d, uSunDir), 0.0);
  float sunUp = dot(up, uSunDir);
  vec3 sky = mix(uHorizon, uZenith, pow(clamp(h, 0.0, 1.0), 0.45));
  vec3 fog = mix(uFogColor, uFogSun * keyAt(1, sunUp), pow(s, 6.0) * 0.85 + pow(s, 32.0) * 0.15);
  sky = mix(fog, sky, smoothstep(-0.02, 0.22, h));
  // the sun
  float disc = smoothstep(0.99955, 0.99975, s);
  vec3 sunC = keyAt(1, sunUp);
  sky += sunC * (disc * 40.0 + pow(s, 10.0) * 0.35 + pow(s, 3.0) * 0.12) * smoothstep(-0.01, 0.02, h);
  // the moon: a lit ball, its phase from where the sun is
  float m = dot(d, uMoonDir);
  float moonR = 0.012;
  vec3 moon = vec3(0.0);
  if (m > cos(moonR * 1.2)) {
    vec3 q = (d - uMoonDir * m) / moonR;
    float q2 = dot(q, q);
    if (q2 < 1.0) {
      vec3 n = q - uMoonDir * sqrt(1.0 - q2);
      float lit = smoothstep(-0.05, 0.2, dot(n, uSunDir));
      float mar = texture(uNoise, q.xy * 0.4 + 0.3).r;
      moon = uMoonColor * (0.04 + lit * (2.6 - mar * 1.2)) * smoothstep(1.0, 0.92, q2);
    }
  }
  moon += uMoonColor * pow(max(m, 0.0), 400.0) * 0.25;
  // clouds on a shell 500 m up, anchored to the planet so they hold still as you sail under them
  vec3 o = cameraPosition;
  float Rc = uPlanet.x + 500.0, b = dot(o, d), c2 = dot(o, o) - Rc * Rc, disc2 = b * b - c2;
  float cover = 0.0, thick = 0.0, n = 0.0;
  if (disc2 > 0.0 && c2 < 0.0) {
    vec3 hp = o + d * (-b + sqrt(disc2));
    vec2 uv = hp.xz * 0.0011 + hp.y * vec2(0.0007, -0.0009);
    vec2 drift = uTime * vec2(0.0035, 0.0012);
    vec2 su = uv * mix(vec2(1.0), vec2(0.28, 1.6), uStreak);
    n = texture(uNoise, su * 0.9 + drift).r * 0.55 + texture(uNoise, su * 2.3 + drift * 1.7).g * 0.3 + texture(uNoise, uv * 7.0 + drift * 2.5).b * 0.15;
    cover = smoothstep(1.0 - uCloud * 0.85 - 0.1, 1.08 - uCloud * 0.6, n + 0.12 * uCloud);
    cover *= smoothstep(0.0, 0.12, h);
    thick = smoothstep(0.35, 0.9, n);
  }
  vec3 cl = mix(uCloudLit, uCloudShade, thick * 0.85);
  cl += sunC * pow(s, 8.0) * (1.0 - thick) * 0.8 * (1.0 - uNight * 0.6);
  cl = mix(cl, fog, smoothstep(0.25, 0.0, h) * 0.85);
  sky = mix(sky + moon * (1.0 - uSpace), cl, cover * 0.94);
  // stars, turning with the hour
  vec3 ds = vec3(cos(uStarSpin) * d.x + sin(uStarSpin) * d.z, d.y, -sin(uStarSpin) * d.x + cos(uStarSpin) * d.z);
  if (uStars > 0.0) {
    sky += starField(ds, 0.9965, 260.0) * uStars * 2.5 * smoothstep(0.02, 0.25, h) * (1.0 - cover);
    float band = exp(-pow(dot(ds, normalize(vec3(0.3, 0.4, 0.86))) * 4.0, 2.0)) * texture(uNoise, ds.xz * 1.5).g;
    sky += vec3(0.25, 0.28, 0.4) * band * uStars * 0.25 * smoothstep(0.0, 0.3, h) * (1.0 - cover);
  }
  sky += vec3(0.75, 0.8, 1.0) * uFlash * (0.4 + cover);
  // high up, the sky gives way to space, and the globe wears a rim of air, bright on its day side
  if (uSpace > 0.0) {
    vec3 sp = vec3(0.004, 0.006, 0.016) + starField(ds, 0.997, 300.0) * 3.0;
    float band = exp(-pow(dot(ds, normalize(vec3(0.3, 0.4, 0.86))) * 3.5, 2.0)) * smoothstep(0.35, 0.8, texture(uNoise, ds.xz * 2.5 + ds.y * 0.7).g);
    sp += vec3(0.16, 0.15, 0.26) * band * 0.18;
    float dc = length(cameraPosition);
    float a = asin(clamp(uPlanet.x / dc, 0.0, 1.0)), ang = acos(clamp(dot(d, -cameraPosition / dc), -1.0, 1.0));
    float over = max(ang - a, 0.0) / max(a, 0.05);
    vec3 limbN = normalize(cameraPosition + d * dc * cos(a));
    float day = smoothstep(-0.3, 0.25, dot(limbN, uSunDir));
    vec3 rim = mix(vec3(0.45, 0.68, 1.0), keyAt(0, dot(limbN, uSunDir)), 0.35) * (exp(-over * 30.0) * 1.6 + exp(-over * 6.0) * 0.35) * (0.05 + day);
    // the sun and moon hang in space too
    sp += vec3(1.0, 0.97, 0.92) * (disc * 40.0 + pow(s, 200.0) * 0.6) + moon;
    sky = mix(sky, sp + rim, uSpace);
  }
  gl_FragColor = vec4(sky, 1.0);
}`;

export class Sky {
  readonly group = new THREE.Group();
  readonly sun = new THREE.DirectionalLight(0xffffff, 3.2);
  readonly moon = new THREE.DirectionalLight(0x9db3ff, 0.55);
  readonly dome: THREE.Mesh;
  readonly grade: Grade = newGrade();
  /** Water look at the camera: how mirror-like and how choppy. */
  readonly water = { reflect: 1, chop: 1 };
  /** How dark it is where the camera is, 0 day to 1 night. */
  night = 0;
  /** How far up into space the camera is, 0 at sea to 1 in orbit. */
  space = 0;
  flash = 0;
  /** Whether the shadow map is worth drawing this frame. */
  shadows = true;
  private readonly mood: Mood = { ...MORNING };
  private readonly domeU: Record<string, THREE.IUniform>;
  private readonly tmp = new THREE.Vector3();

  constructor(shadowSize: number) {
    this.domeU = {
      ...U, uZenith: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() }, uCloudLit: { value: new THREE.Color() },
      uCloudShade: { value: new THREE.Color() }, uCloud: { value: 0.5 }, uStreak: { value: 1 }, uStars: { value: 0 }, uFlash: { value: 0 },
      uSpace: { value: 0 }, uStarSpin: { value: 0 }, uMoonColor: { value: new THREE.Color(0xd8e0ff) },
    };
    this.dome = new THREE.Mesh(
      new THREE.SphereGeometry(1, 48, 24),
      new THREE.ShaderMaterial({ vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, uniforms: this.domeU, side: THREE.BackSide, depthWrite: false, depthTest: true }),
    );
    (this.dome.material as THREE.Material).userData.planet = true;
    this.dome.scale.setScalar(1000);
    this.dome.frustumCulled = false;
    this.dome.renderOrder = -10;
    this.group.add(this.dome);

    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(shadowSize, shadowSize);
    const sc = this.sun.shadow.camera;
    sc.left = -95; sc.right = 95; sc.top = 95; sc.bottom = -95; sc.near = 1; sc.far = 900;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.04;
    this.sun.shadow.radius = 2;
    this.group.add(this.sun, this.sun.target, this.moon, this.moon.target);

    const keys = U.uKey.value;
    KEYS.forEach((row, k) => row.forEach(([hex, i], j) => keys[k * 5 + j].setHex(hex).multiplyScalar(i)));
  }

  /**
   * Sets the light for a frame. sun and moon are unit directions; eye is the camera; weather is how deep the camera
   * is in each kind of system (0..1); rising says whether the sun is climbing where the camera is.
   */
  update(dt: number, eye: THREE.Vector3, focus: THREE.Vector3, sun: THREE.Vector3, moon: THREE.Vector3, hour: number, rising: boolean, weather: Partial<Record<'fog' | 'rain' | 'thunder' | 'snow' | 'ash' | 'calm', number>>): void {
    U.uSunDir.value.copy(sun);
    U.uMoonDir.value.copy(moon);
    const up = this.tmp.copy(eye).normalize();
    const R = U.uPlanet.value.x, alt = eye.length() - R;
    this.space = smooth(220, 1100, alt);
    const e = up.dot(sun);
    // the mood where the camera is; from orbit, a clear morning's grade
    const md = moodAt(e, rising, this.mood);
    const ground = 1 - this.space;
    const rain = Math.max(weather.rain ?? 0, weather.thunder ?? 0) * ground, fog = (weather.fog ?? 0) * ground;
    const snow = (weather.snow ?? 0) * ground, ash = (weather.ash ?? 0) * ground, calm = (weather.calm ?? 0) * ground;
    if (rain > 0.01) mixMood(md, SQUALL, rain * 0.9, md);
    if (snow > 0.01) mixMood(md, SNOWY, snow * 0.85, md);
    if (ash > 0.01) mixMood(md, ASHY, ash * 0.85, md);
    if (fog > 0.01) mixMood(md, FOGGY, fog * 0.9, md);
    if (this.space > 0) mixMood(md, MORNING, this.space, md);
    // night still counts in fog and rain
    const dark = smooth(0.05, -0.18, e) * ground;
    md.night = Math.max(md.night, dark);
    md.stars = Math.max(md.stars * (1 - Math.max(rain, fog, snow) * 0.9), 0);
    this.night = md.night;
    U.uNight.value = md.night;
    U.uFogColor.value.setHex(md.horizon);
    U.uFogSun.value.setHex(md.fogSun).multiplyScalar(0.6);
    U.uFogDensity.value = md.fog * ground + 0.0004 * this.space;
    U.uFogFalloff.value = md.falloff;
    U.uMist.value.set(md.mist * ground, md.mistFall, 1, 0);
    // the sun's colour where the camera is, for effects that light themselves
    const k = U.uKey.value, kc = new THREE.Color();
    const ks = [-0.25, -0.08, 0, 0.12, 0.45];
    let j = 0;
    while (j < 4 && e > ks[j + 1]) j++;
    const t = j >= 4 ? 0 : Math.min(1, Math.max(0, (e - ks[j]) / (ks[j + 1] - ks[j])));
    kc.copy(k[5 + j]).lerp(k[5 + Math.min(4, j + 1)], t);
    U.uSunColor.value.copy(kc).multiplyScalar(smooth(-0.06, 0.06, e) * (1 - rain * 0.6) + 0.15 * md.night);
    const d = this.domeU;
    d.uZenith.value.setHex(md.zenith);
    d.uHorizon.value.setHex(md.horizon);
    d.uCloudLit.value.setHex(md.cloudLit);
    d.uCloudShade.value.setHex(md.cloudShade);
    d.uCloud.value = md.cloud * (1 - calm * 0.7);
    d.uStreak.value = md.streak;
    d.uStars.value = md.stars;
    d.uSpace.value = this.space;
    d.uStarSpin.value = (hour / 24) * TAU;
    this.dome.position.copy(eye);
    // overcast skies dim the sun and fill in the shade
    this.sun.intensity = 3.2 * (1 - rain * 0.6 - snow * 0.4 - fog * 0.35 - ash * 0.4);
    this.moon.intensity = 0.55 * (1 - Math.max(rain, fog) * 0.5);
    // the lights hang over the focus so the shadow box follows it; snapped to texels so shadows do not crawl
    const sc = this.sun.shadow.camera;
    const texel = (sc.right * 2) / this.sun.shadow.mapSize.x;
    const f = this.tmp.copy(focus);
    f.set(Math.round(f.x / texel) * texel, Math.round(f.y / texel) * texel, Math.round(f.z / texel) * texel);
    this.sun.target.position.copy(f);
    this.sun.position.copy(f).addScaledVector(sun, 400);
    this.moon.target.position.copy(f);
    this.moon.position.copy(f).addScaledVector(moon, 400);
    // toggling castShadow recompiles every material, so shadows fade instead; `shadows` says whether to draw them
    const lit = smooth(-0.05, 0.08, up.copy(focus).normalize().dot(sun)) * smooth(0.4, 0.6, ground);
    this.sun.shadow.intensity = lit;
    this.shadows = lit > 0.01;
    this.water.reflect = md.reflect;
    this.water.chop = md.chop * (1 + rain * 0.6) * (1 - calm * 0.7);
    // lightning in thunder
    const thunder = (weather.thunder ?? 0) * ground;
    if (thunder > 0.3 && Math.random() < dt / 9) this.flash = 1;
    this.flash = Math.max(0, this.flash - dt * 3.5);
    const fl = this.flash > 0.7 || (this.flash > 0.3 && this.flash < 0.45) ? this.flash : 0;
    d.uFlash.value = fl;
    U.uFlash.value = fl;
    const g = this.grade;
    g.exposure = md.exposure; g.bloom = md.bloom; g.sat = md.sat; g.contrast = md.contrast; g.warm = md.warm;
    g.lift.setHex(md.lift).multiplyScalar(0.6);
    g.gain.setHex(md.gain);
  }
}

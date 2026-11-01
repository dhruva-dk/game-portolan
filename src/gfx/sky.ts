// Sky, light and weather: five moods drawn from the references, the sun or moon with soft shadows, and the air's
// drifting life (petals, rain, fireflies, pollen, snow, embers), all on the GPU.
import * as THREE from 'three';
import { GLOBE, Globe, U, type Grade } from './engine.ts';

export interface Weather {
  name: string;
  sunElev: number; sunAz: number; sun: number; sunI: number;
  zenith: number; horizon: number; fogSun: number; fog: number; falloff: number; mist: number; mistFall: number;
  cloud: number; cloudLit: number; cloudShade: number; streak: number;
  hemiSky: number; hemiGround: number; hemiI: number;
  deep: number; shallow: number; reflect: number; chop: number;
  exposure: number; bloom: number; sat: number; contrast: number; lift: number; gain: number; warm: number;
  rain: number; petals: number; fireflies: number; motes: number; stars: number; night: number;
}

export const WEATHERS: Weather[] = [
  {
    name: 'Misty Dawn', sunElev: 10, sunAz: 115, sun: 0xffd2bc, sunI: 2.2,
    zenith: 0x6c80a3, horizon: 0xaab3c3, fogSun: 0xe9cfc2, fog: 0.0012, falloff: 0.011, mist: 0.011, mistFall: 0.16,
    cloud: 0.62, cloudLit: 0xf0e7ec, cloudShade: 0x7f8799, streak: 1,
    hemiSky: 0xaab5cc, hemiGround: 0x4e5a3e, hemiI: 1.25,
    deep: 0x23383f, shallow: 0x5b8580, reflect: 1, chop: 0.6,
    exposure: 1.0, bloom: 0.45, sat: 0.97, contrast: 1.06, lift: 0x182233, gain: 0xfff6ee, warm: 0.2,
    rain: 0, petals: 1, fireflies: 0, motes: 0.4, stars: 0, night: 0,
  },
  {
    name: 'Clear Morning', sunElev: 34, sunAz: 140, sun: 0xfff0d8, sunI: 3.3,
    zenith: 0x4a7cc2, horizon: 0xbfd2e2, fogSun: 0xf3ead8, fog: 0.0011, falloff: 0.009, mist: 0.005, mistFall: 0.25,
    cloud: 0.38, cloudLit: 0xffffff, cloudShade: 0x93a3b8, streak: 0.4,
    hemiSky: 0x9ec0e6, hemiGround: 0x506a3a, hemiI: 1.1,
    deep: 0x1b4554, shallow: 0x3c9c98, reflect: 0.85, chop: 0.8,
    exposure: 0.95, bloom: 0.35, sat: 1.08, contrast: 1.05, lift: 0x101a26, gain: 0xfffaf2, warm: 0.15,
    rain: 0, petals: 0.7, fireflies: 0, motes: 0.6, stars: 0, night: 0,
  },
  {
    name: 'Golden Hour', sunElev: 5, sunAz: 255, sun: 0xffa45e, sunI: 3.0,
    zenith: 0x5d5a8e, horizon: 0xf2b38a, fogSun: 0xffc184, fog: 0.0015, falloff: 0.01, mist: 0.008, mistFall: 0.22,
    cloud: 0.5, cloudLit: 0xffc49a, cloudShade: 0x6c5b80, streak: 0.8,
    hemiSky: 0xb4a2c4, hemiGround: 0x4a3e2e, hemiI: 1.0,
    deep: 0x2a2c44, shallow: 0x6a7a74, reflect: 1, chop: 0.7,
    exposure: 1.0, bloom: 0.6, sat: 1.05, contrast: 1.07, lift: 0x22162c, gain: 0xfff0e0, warm: 0.6,
    rain: 0, petals: 0.6, fireflies: 0.15, motes: 0.8, stars: 0, night: 0,
  },
  {
    name: 'Rain Squall', sunElev: 30, sunAz: 160, sun: 0xd4dbe2, sunI: 0.9,
    zenith: 0x5b646e, horizon: 0x939ca2, fogSun: 0xa9b0b4, fog: 0.0034, falloff: 0.008, mist: 0.02, mistFall: 0.12,
    cloud: 1, cloudLit: 0xa4abb2, cloudShade: 0x4b525a, streak: 0.3,
    hemiSky: 0x9aa6b2, hemiGround: 0x3b4436, hemiI: 1.5,
    deep: 0x253237, shallow: 0x4f6966, reflect: 0.7, chop: 1.6,
    exposure: 1.05, bloom: 0.3, sat: 0.82, contrast: 1.08, lift: 0x121a1e, gain: 0xf2f6fa, warm: 0,
    rain: 1, petals: 0.2, fireflies: 0, motes: 0, stars: 0, night: 0,
  },
  {
    name: 'Starlit Night', sunElev: 32, sunAz: 210, sun: 0x9db3ff, sunI: 0.75,
    zenith: 0x060a1a, horizon: 0x1b2440, fogSun: 0x30406a, fog: 0.0016, falloff: 0.01, mist: 0.012, mistFall: 0.2,
    cloud: 0.32, cloudLit: 0x4a5878, cloudShade: 0x0c1020, streak: 0.7,
    hemiSky: 0x33456e, hemiGround: 0x0b0f14, hemiI: 0.9,
    deep: 0x040a14, shallow: 0x0f2a36, reflect: 1, chop: 0.6,
    exposure: 1.35, bloom: 0.95, sat: 1.0, contrast: 1.05, lift: 0x0a1020, gain: 0xeef2ff, warm: 0,
    rain: 0, petals: 0.3, fireflies: 1, motes: 0, stars: 1, night: 1,
  },
];

const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;

const SKY_FRAG = /* glsl */ `
uniform vec3 uZenith, uHorizon, uFogColor, uFogSun, uSunDir, uSunColor, uCloudLit, uCloudShade;
uniform float uCloud, uStreak, uStars, uTime, uFlash, uNight, uSpace;
uniform vec4 uPlanet; // the globe's centre and radius, for its limb seen from above
uniform sampler2D uNoise;
varying vec3 vDir;
float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  float s = max(dot(d, uSunDir), 0.0);
  vec3 sky = mix(uHorizon, uZenith, pow(clamp(h, 0.0, 1.0), 0.45));
  vec3 fog = mix(uFogColor, uFogSun, pow(s, 6.0) * 0.85 + pow(s, 32.0) * 0.15);
  sky = mix(fog, sky, smoothstep(-0.02, 0.22, h));
  // sun or moon
  float disc = smoothstep(0.99955, 0.99975, s);
  sky += uSunColor * (disc * mix(40.0, 6.0, uNight) + pow(s, 10.0) * 0.35 + pow(s, 3.0) * 0.12 * (1.0 - uNight));
  // clouds on a dome
  vec2 uv = d.xz / (max(h, 0.0) + 0.09);
  vec2 drift = uTime * vec2(0.0035, 0.0012);
  vec2 su = uv * mix(vec2(1.0), vec2(0.28, 1.6), uStreak);
  float n = texture(uNoise, su * 0.05 + drift).r * 0.55 + texture(uNoise, su * 0.13 + drift * 1.7).g * 0.3 + texture(uNoise, uv * 0.42 + drift * 2.5).b * 0.15;
  float cover = smoothstep(1.0 - uCloud * 0.85 - 0.1, 1.08 - uCloud * 0.6, n + 0.12 * uCloud);
  cover *= smoothstep(0.0, 0.12, h);
  float thick = smoothstep(0.35, 0.9, n);
  vec3 cl = mix(uCloudLit, uCloudShade, thick * 0.85);
  cl += uSunColor * pow(s, 8.0) * (1.0 - thick) * 0.8 * (1.0 - uNight * 0.6);
  cl = mix(cl, fog, smoothstep(0.25, 0.0, h) * 0.85);
  sky = mix(sky, cl, cover * 0.94);
  // stars
  if (uStars > 0.0) {
    vec3 c = floor(d * 260.0);
    float st = hash(c);
    float tw = 0.6 + 0.4 * sin(uTime * 2.0 + st * 40.0);
    float star = step(0.9965, st) * tw * smoothstep(0.02, 0.25, h) * (1.0 - cover);
    vec3 f = fract(d * 260.0) - 0.5;
    star *= smoothstep(0.5, 0.0, length(f));
    sky += vec3(0.9, 0.95, 1.0) * star * uStars * 2.5;
    // the milky band
    float band = exp(-pow(dot(d, normalize(vec3(0.3, 0.4, 0.86))) * 4.0, 2.0)) * texture(uNoise, d.xz * 1.5).g;
    sky += vec3(0.25, 0.28, 0.4) * band * uStars * 0.25 * smoothstep(0.0, 0.3, h) * (1.0 - cover);
  }
  sky += vec3(0.75, 0.8, 1.0) * uFlash * (0.4 + cover);
  // high up the sky gives way to space, and the globe wears a rim of air, bright on its day side
  if (uSpace > 0.0) {
    vec3 sp = vec3(0.004, 0.006, 0.016);
    vec3 c = floor(d * 300.0);
    float st = hash(c);
    vec3 f = fract(d * 300.0) - 0.5;
    sp += vec3(0.9, 0.95, 1.0) * step(0.997, st) * smoothstep(0.5, 0.0, length(f)) * (0.5 + 0.5 * fract(st * 91.0)) * 3.0;
    float band = exp(-pow(dot(d, normalize(vec3(0.3, 0.4, 0.86))) * 3.5, 2.0)) * smoothstep(0.35, 0.8, texture(uNoise, d.xz * 2.5 + d.y * 0.7).g);
    sp += vec3(0.16, 0.15, 0.26) * band * 0.18;
    vec3 toC = uPlanet.xyz - cameraPosition;
    float dc = length(toC);
    float a = asin(clamp(uPlanet.w / dc, 0.0, 1.0)), b = acos(clamp(dot(d, toC / dc), -1.0, 1.0));
    float over = max(b - a, 0.0) / max(a, 0.05);
    vec3 limbN = normalize(cameraPosition + d * dc * cos(a) - uPlanet.xyz);
    float day = smoothstep(-0.35, 0.25, dot(limbN, uSunDir));
    vec3 rim = mix(uHorizon, vec3(0.45, 0.68, 1.0), 0.5) * (exp(-over * 30.0) * 1.6 + exp(-over * 6.0) * 0.35) * (0.08 + day);
    sky = mix(sky, sp + rim, uSpace);
  }
  gl_FragColor = vec4(sky, 1.0);
}`;

const AIR_VERT = /* glsl */ `${GLOBE}
attribute vec4 aSeed;
uniform float uTime, uBox, uFall, uSize, uKind, uAmount;
uniform vec3 uOrigin;
uniform vec2 uWind;
varying vec2 vUv;
varying float vFade;
varying float vShade;
#include <fog_pars_vertex>
void main() {
  vUv = uv;
  float t = uTime;
  vec3 p = aSeed.xyz * uBox;
  vec3 vel = vec3(uWind.x * 0.6, -uFall * (0.7 + 0.6 * aSeed.w), uWind.y * 0.6);
  if (uKind == 2.0) vel = vec3(sin(t * 0.3 + aSeed.w * 30.0) * 0.6, sin(t * 0.7 + aSeed.w * 9.0) * 0.25, cos(t * 0.25 + aSeed.w * 20.0) * 0.6);
  if (uKind == 4.0) vel.y = 1.8 + aSeed.w * 2.0;
  p += vel * t;
  if (uKind == 0.0 || uKind == 3.0) p.xz += vec2(sin(t * 1.3 + aSeed.w * 20.0), cos(t * 1.1 + aSeed.w * 13.0)) * 0.6;
  p = mod(p - uOrigin + uBox * 0.5, uBox) - uBox * 0.5 + uOrigin;
  if (uKind == 2.0) p.y = fract(aSeed.y * 7.0) * 6.5 + 0.7 + sin(t * 0.9 + aSeed.w * 50.0) * 0.4;
  vec3 rel = p - uOrigin;
  float edge = 1.0 - smoothstep(0.32, 0.5, max(abs(rel.x), abs(rel.z)) / uBox);
  vFade = edge * step(aSeed.w, uAmount);
  vec3 globeFlat = p;
  vec4 mv = viewMatrix * vec4(globePos(p), 1.0);
  vec2 corner = position.xy * uSize * (0.6 + 0.8 * fract(aSeed.w * 13.7));
  if (uKind == 1.0) {
    // rain: a streak, stretched along its fall in screen space
    vec4 mv2 = viewMatrix * vec4(globePos(p + vec3(0.0, 0.9, 0.0)), 1.0);
    vec2 axis = normalize(mv2.xy - mv.xy + 1e-5);
    vec2 side = vec2(-axis.y, axis.x);
    mv.xy += side * position.x * 0.012 + (mv2.xy - mv.xy) * (position.y + 0.5);
    mv.z += (mv2.z - mv.z) * (position.y + 0.5);
  } else if (uKind == 0.0) {
    float a = t * (1.5 + aSeed.w * 2.0) + aSeed.x * 40.0;
    float c = cos(a), s = sin(a);
    corner = vec2(corner.x * c - corner.y * s, (corner.x * s + corner.y * c) * (0.35 + 0.65 * abs(sin(a * 0.7))));
    mv.xy += corner;
    vShade = 0.6 + 0.4 * sin(a * 0.7);
  } else {
    mv.xy += corner;
  }
  vec4 mvPosition = mv;
  gl_Position = projectionMatrix * mv;
  #include <fog_vertex>
}`;

const AIR_FRAG = /* glsl */ `
uniform float uKind, uNight;
uniform vec3 uColor, uSunColor;
varying vec2 vUv;
varying float vFade;
varying float vShade;
#include <fog_pars_fragment>
void main() {
  if (vFade <= 0.0) discard;
  vec2 q = vUv - 0.5;
  float a;
  vec3 col = uColor;
  if (uKind == 0.0) {
    // a petal: a notched teardrop
    vec2 p = q * vec2(1.0, 1.4);
    a = smoothstep(0.5, 0.42, length(p) + 0.18 * abs(p.x) - 0.12 * p.y);
    a *= 1.0 - smoothstep(0.03, 0.0, abs(p.x)) * step(0.32, p.y);
    col *= mix(0.7, 1.15, vShade) * (0.7 + 0.3 * (1.0 - length(q) * 1.6));
    col += uSunColor * 0.08 * vShade;
  } else if (uKind == 1.0) {
    a = (1.0 - abs(q.x) * 2.0) * smoothstep(0.5, 0.2, abs(q.y)) * 0.35;
  } else {
    a = exp(-dot(q, q) * 28.0);
    if (uKind == 2.0) a *= 0.55 + 0.45 * sin(uTime * 3.0 + gl_FragCoord.x * 0.01);
  }
  a *= vFade;
  if (a < 0.01) discard;
  gl_FragColor = vec4(col, a);
  #include <fog_fragment>
  if (uKind >= 2.0) gl_FragColor.rgb *= a;
}`;

interface Air { mesh: THREE.Mesh; u: Record<string, THREE.IUniform>; base: number }

function air(kind: number, count: number, box: number, fall: number, size: number, color: number, additive: boolean): Air {
  const g = new THREE.InstancedBufferGeometry();
  const quad = new THREE.PlaneGeometry(1, 1);
  g.index = quad.index;
  g.setAttribute('position', quad.getAttribute('position'));
  g.setAttribute('uv', quad.getAttribute('uv'));
  const seed = new Float32Array(count * 4);
  for (let i = 0; i < seed.length; i++) seed[i] = Math.random();
  g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 4));
  g.instanceCount = count;
  const u = {
    ...U, uBox: { value: box }, uFall: { value: fall }, uSize: { value: size }, uKind: { value: kind }, uAmount: { value: 0 },
    uOrigin: { value: new THREE.Vector3() }, uColor: { value: new THREE.Color(color) },
  };
  const m = new THREE.ShaderMaterial({
    vertexShader: AIR_VERT, fragmentShader: AIR_FRAG, uniforms: u, transparent: true, depthWrite: false, fog: true,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(g, m);
  mesh.frustumCulled = false;
  mesh.renderOrder = 5;
  mesh.layers.set(1);
  return { mesh, u, base: 0 };
}

export class Sky {
  readonly group = new THREE.Group();
  readonly sun = new THREE.DirectionalLight(0xffffff, 3);
  readonly hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
  readonly dome: THREE.Mesh;
  readonly grade: Grade = {
    exposure: 1, bloom: 0.5, threshold: 1.1, sat: 1, contrast: 1, vignette: 0.55,
    lift: new THREE.Color(), gain: new THREE.Color(1, 1, 1), warm: 0,
  };
  readonly water = { deep: new THREE.Color(), shallow: new THREE.Color(), reflect: 1, chop: 1 };
  weather: Weather = WEATHERS[0];
  private readonly domeU: Record<string, THREE.IUniform>;
  private readonly airs: Record<'petals' | 'rain' | 'fireflies' | 'motes' | 'snow' | 'embers', Air>;
  flash = 0;
  private nextBolt = 6;
  /** Regional weights for the air near the camera, set by the scene. */
  region = { snow: 0, ash: 0, blossom: 0 };

  constructor(shadowSize: number) {
    this.domeU = {
      ...U, uZenith: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() }, uCloudLit: { value: new THREE.Color() },
      uCloudShade: { value: new THREE.Color() }, uCloud: { value: 0.5 }, uStreak: { value: 1 }, uStars: { value: 0 }, uFlash: { value: 0 },
      uSpace: { value: 0 }, uPlanet: { value: new THREE.Vector4() },
    };
    this.dome = new THREE.Mesh(
      new THREE.SphereGeometry(1, 48, 24),
      new THREE.ShaderMaterial({ vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, uniforms: this.domeU, side: THREE.BackSide, depthWrite: false, depthTest: true }),
    );
    this.dome.scale.setScalar(9000);
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
    this.group.add(this.sun, this.sun.target, this.hemi);

    this.airs = {
      petals: air(0, 900, 70, 0.7, 0.16, 0xf6b9c8, false),
      rain: air(1, 4500, 60, 22, 1, 0xb8c6d4, false),
      fireflies: air(2, 520, 110, 0, 0.32, 0xd8ff7a, true),
      motes: air(3, 500, 50, 0.08, 0.06, 0xfff2c8, true),
      snow: air(3, 2200, 60, 1.4, 0.09, 0xffffff, false),
      embers: air(4, 600, 70, 0, 0.12, 0xff7a2a, true),
    };
    for (const a of Object.values(this.airs)) this.group.add(a.mesh);
    this.set(WEATHERS[0]);
  }

  set(w: Weather): void {
    this.weather = w;
    const el = THREE.MathUtils.degToRad(w.sunElev), az = THREE.MathUtils.degToRad(w.sunAz);
    U.uSunDir.value.set(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)).normalize();
    U.uSunColor.value.setHex(w.sun).multiplyScalar(w.night ? 0.6 : 1);
    U.uFogColor.value.setHex(w.horizon);
    U.uFogSun.value.setHex(w.fogSun);
    U.uFogDensity.value = w.fog;
    U.uFogFalloff.value = w.falloff;
    U.uMist.value.set(w.mist, w.mistFall, 1, 0);
    U.uNight.value = w.night;
    const d = this.domeU;
    d.uZenith.value.setHex(w.zenith);
    d.uHorizon.value.setHex(w.horizon);
    d.uCloudLit.value.setHex(w.cloudLit);
    d.uCloudShade.value.setHex(w.cloudShade);
    d.uCloud.value = w.cloud;
    d.uStreak.value = w.streak;
    d.uStars.value = w.stars;
    this.sun.color.setHex(w.sun);
    this.sun.intensity = w.sunI;
    this.hemi.color.setHex(w.hemiSky);
    this.hemi.groundColor.setHex(w.hemiGround);
    this.hemi.intensity = w.hemiI;
    this.water.deep.setHex(w.deep);
    this.water.shallow.setHex(w.shallow);
    this.water.reflect = w.reflect;
    this.water.chop = w.chop;
    const g = this.grade;
    g.exposure = w.exposure; g.bloom = w.bloom; g.sat = w.sat; g.contrast = w.contrast; g.warm = w.warm;
    g.lift.setHex(w.lift).multiplyScalar(0.6);
    g.gain.setHex(w.gain);
    this.airs.petals.base = w.petals;
    this.airs.rain.base = w.rain;
    this.airs.fireflies.base = w.fireflies;
    this.airs.motes.base = w.motes;
    this.airs.snow.base = 1;
    this.airs.embers.base = 1;
  }

  /** Follows the camera: the dome, the shadow box round the focus, the air round the eye. */
  update(dt: number, eye: THREE.Vector3, focus: THREE.Vector3): void {
    this.dome.position.copy(eye);
    this.domeU.uSpace.value = Globe.on ? THREE.MathUtils.smoothstep(eye.y, 260, 1300) : 0;
    this.domeU.uPlanet.value.set(Globe.fx, -Globe.R, Globe.fz, Globe.R);
    const sd = U.uSunDir.value;
    // snap the shadow box to its texels so shadows do not crawl
    const texel = (this.sun.shadow.camera.right * 2) / this.sun.shadow.mapSize.x;
    const f = focus.clone();
    f.x = Math.round(f.x / texel) * texel;
    f.z = Math.round(f.z / texel) * texel;
    this.sun.target.position.copy(f);
    this.sun.position.copy(f).addScaledVector(sd, 400);
    const w = this.weather, r = this.region;
    const amounts = {
      petals: w.petals * (0.25 + 0.75 * r.blossom) * (1 - r.snow) * (1 - r.ash),
      rain: w.rain * (1 - r.snow * 0.5),
      fireflies: w.fireflies * (1 - r.snow),
      motes: w.motes * (1 - r.snow),
      snow: Math.max(r.snow, 0) * (w.rain ? 1 : 0.7),
      embers: r.ash,
    };
    for (const [k, a] of Object.entries(this.airs) as [keyof typeof amounts, Air][]) {
      const amt = amounts[k];
      a.u.uAmount.value += (amt - a.u.uAmount.value) * Math.min(1, dt * 1.5);
      a.mesh.visible = a.u.uAmount.value > 0.01;
      a.u.uOrigin.value.copy(eye);
      if (k === 'fireflies') a.u.uOrigin.value.y = 0;
    }
    // lightning in a squall
    if (w.rain > 0.5) {
      this.nextBolt -= dt;
      if (this.nextBolt < 0) { this.flash = 1; this.nextBolt = 7 + Math.random() * 14; }
    }
    this.flash = Math.max(0, this.flash - dt * 3.5);
    const fl = this.flash > 0.7 || (this.flash > 0.3 && this.flash < 0.45) ? this.flash : 0;
    this.domeU.uFlash.value = fl;
    this.hemi.intensity = w.hemiI * (1 + fl * 2);
  }

  /** True for the moment after lightning struck, so the caller can play thunder. */
  get struck(): boolean {
    return this.flash > 0.97;
  }
}

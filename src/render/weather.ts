// Weather (WP21): the sim's spells drawn on the page. Fog is paper left unpainted: a pale wall standing on the curved
// sea round every bank, dense where the sim hides what lies inside (WEATHER.veil), so a ship or lantern in it is
// hidden from outside exactly as the sight system hides it. Rain is fine diagonal pen strokes, slanted by the wind, in
// layered curtains round the eye and hanging under the cloud base of distant squalls; squalls gust and roughen the sea
// (the sea's squall state), calms lay it flat as a mirror (its calm state); spray is flicked lead white torn off by
// the wind; ash is grey wash (setAsh, WP17's Fire Archipelago); lightning is a crack of gold leaf. Sight shortens in
// fog, squall and storm by the sim's own factors, drawn as veils of paper closing in round the eye.
//
// Air is the one place the renderer reads the wind and weather over the eye (S-005): the sim's windAt and skyAt at the
// camera's foot whenever a match exists, a steady fair trade wind round the planet's axis otherwise. The sea, the sky's
// clouds, the rain, the spray and the storm all read it.
import * as THREE from 'three';
import type { World } from '../app/worldWorker.ts';
import { newWind, seaFor, tideOf, windAt, type Sea as Waters } from '../sim/environment.ts';
import { R } from '../sim/sphere.ts';
import { SHIPS, type MatchState, type Spell } from '../sim/state.ts';
import { calmNow } from '../sim/storm.ts';
import { SIGHT, SPELL, STORM, WEATHER } from '../sim/tables.ts';
import { newSight, survey } from '../sim/visibility.ts';
import { newSky, skyAt, vigour } from '../sim/weather.ts';
import { inkMaterial, linearVec, transmittanceVec, type Style } from '../style/glsl.ts';
import { hex, STORM_SLATE } from '../style/palette.ts';
import type { RenderContext, RenderModule } from './world.ts';

const AXIS = new THREE.Vector3(0, 1, 0);
/** u over which the storm's depth eases in across its wall (outside → inside). */
const STORM_EDGE = 14;

/** The wind and weather over the eye this frame. */
export class Air {
  readonly foot = new THREE.Vector3(0, 0, 1);
  /** Downwind, a unit tangent at the foot. */
  readonly toward = new THREE.Vector3(1, 0, 0);
  /** Fair = 1 (windAt's strength: gusts and squalls more, calms less). */
  strength = 1;
  gust = 0;
  /** The sim's weather at the foot (skyAt). */
  readonly sky = newSky();
  /** 0 outside the storm, 1 inside, eased across its wall. */
  storm = 0;
  /** How far the eye sees, u: the sim's SIGHT.clear by the weather's and the storm's factors. */
  range = SIGHT.clear;
  /** The eye's height over the sea, u: the veil of short sight lifts off high cameras (sight is a lookout's, on deck). */
  altitude = 0;
  /** The sea's state for Sea.setWeather: the weather's, heaving and grey in the storm. */
  readonly sea = { rough: 1, calm: 0, squall: 0 };
  waters: Waters | null = null;
  private readonly wind = newWind();
  private seed = Number.NaN;

  update(world: World, state: MatchState | null, eye: THREE.Vector3): this {
    const ship = state?.ships[0]?.pos;
    if (eye.lengthSq() > 1e-9) this.foot.copy(eye).normalize();
    else if (ship) this.foot.set(ship.x, ship.y, ship.z).normalize(); // before anything places the camera
    else this.foot.set(0, 0, 1);
    this.altitude = Math.max(0, eye.length() - R);
    this.toward.crossVectors(AXIS, this.foot);
    if (this.toward.lengthSq() < 1e-8) this.toward.set(1, 0, 0).addScaledVector(this.foot, -this.foot.x);
    this.toward.normalize();
    const sky = this.sky;
    if (!state) {
      Object.assign(sky, newSky());
      this.strength = 1;
      this.gust = 0;
      this.storm = 0;
      this.waters = null;
    } else {
      if (!this.waters || this.seed !== state.seed) {
        this.waters = seaFor(world, state.seed);
        this.seed = state.seed;
      }
      const w = windAt(this.waters, state, this.foot, this.wind), v = w.v, m = Math.hypot(v.x, v.y, v.z);
      if (m > 1e-9) this.toward.set(v.x / m, v.y / m, v.z / m);
      this.strength = w.strength;
      this.gust = w.gust;
      skyAt(state, this.foot, sky);
      const calm = calmNow(state), f = this.foot;
      const out = (Math.acos(Math.max(-1, Math.min(1, f.x * calm.at.x + f.y * calm.at.y + f.z * calm.at.z))) - calm.r) * R;
      this.storm = THREE.MathUtils.smoothstep(out, -STORM_EDGE / 2, STORM_EDGE / 2);
    }
    const st = this.storm;
    this.range = SIGHT.clear * sky.sight * (1 - (1 - STORM.sight) * st);
    this.sea.rough = sky.rough + (2.2 - sky.rough) * st;
    this.sea.calm = sky.calm * (1 - st);
    this.sea.squall = Math.max(sky.squall, st);
    return this;
  }
}

const airs = new WeakMap<THREE.Object3D, Air>();

/** The scene's air, shared by every module that draws with the wind or the weather. */
export function airOf(scene: THREE.Object3D): Air {
  let air = airs.get(scene);
  if (!air) airs.set(scene, (air = new Air()));
  return air;
}

/**
 * The angular radius inside which a fog spell hides what lies in it — where the sim's depthIn reaches WEATHER.veil —
 * or 0 while it is too thin to hide anything.
 */
export function fogAngle(spell: Spell): number {
  const v = vigour(spell);
  if (spell.kind !== SPELL.fog || v < WEATHER.veil) return 0;
  const chord = spell.r * Math.sqrt(Math.max(0, 1 - WEATHER.veil / (v * WEATHER.core)));
  return 2 * Math.asin(Math.min(1, chord / (2 * R)));
}

const hash = (n: number): number => {
  const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
};

// ---------------------------------------------------------------------------------------------------------------
// Curtains: bands standing on the sea round a circle on the sphere (a fog bank's wall, a squall's rain under its
// cloud base, the storm's wall, its announced front, the rain round the eye), placed in the vertex shader from one
// instance each, so they cost no uploads but a few floats and stand on the curve: hull-down like anything else.

export const CURTAIN = { fog: 0, squall: 1, storm: 2, front: 3, rain: 4 } as const;

/** The uniforms every curtain shares (one set per module). */
export function weatherUniforms() {
  return {
    uSeaR: { value: R },
    uWindT: { value: new THREE.Vector3() },
    uFlash: { value: 0 },
    uRain: { value: 0 },
    uAsh: { value: 0 },
    uVeil: { value: 0 },
    uRange: { value: SIGHT.clear },
    uGrey: { value: 0 },
    uSlate: { value: transmittanceVec(STORM_SLATE) },
    uWet: { value: transmittanceVec(hex('#2a3150')) },
    uLead: { value: linearVec(hex('#f7f3e8')) },
    uGold: { value: linearVec(hex('#e8b850')) },
  };
}
export type WeatherUniforms = ReturnType<typeof weatherUniforms>;

/** The veil of short sight from the air: how much paper closes in, how far off, and how grey. */
export function setSight(u: WeatherUniforms, air: Air): void {
  u.uVeil.value = Math.min(1, Math.max(0, 1.15 * (1 - air.range / SIGHT.clear))) * (1 - THREE.MathUtils.smoothstep(air.altitude, 8, 30));
  u.uRange.value = air.range;
  u.uGrey.value = Math.max(air.sky.squall, air.storm);
}

const NOISE_GLSL = /* glsl */ `
float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vn(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) { return 0.5 * vn(p) + 0.25 * vn(p * 2.03 + 1.7) + 0.125 * vn(p * 4.01 + 3.1) + 0.0625 * vn(p * 8.1 + 5.3); }
float pen(float sd, float css) {
  float px = abs(sd) / max(fwidth(sd), 1e-6) / uRenderPx;
  return 1.0 - smoothstep(0.5 * css - 0.5 / uRenderPx, 0.5 * css + 0.5 / uRenderPx, px);
}
// fine pen strokes of rain on a sheet with coordinates st (u): columns sp apart, dashes about len long falling at
// fall u/s, leaning by slant; thinned to an even grey where the columns crowd closer than a few CSS px
float rain(vec2 st, float sp, float len, float fall, float slant, float css, float seed) {
  vec2 r = vec2(st.x - st.y * slant, st.y + uTime * fall);
  float col = floor(r.x / sp), hx = h21(vec2(col, seed));
  float y = r.y / len + hx * 17.0, seg = floor(y), fy = fract(y), hs = h21(vec2(col * 1.31, seg + seed));
  float on = step(0.4, hs) * smoothstep(0.0, 0.1, fy) * (1.0 - smoothstep(0.45, 0.5 + 0.35 * hs, fy));
  float upx = max(fwidth(r.x), 1e-5) * uRenderPx;
  float line = 1.0 - smoothstep(0.5 * css - 0.5, 0.5 * css + 0.5, abs(r.x - (col + 0.25 + 0.5 * hx) * sp) / upx);
  float apart = sp / upx;
  return mix(0.18 * css / max(apart, 1e-3), line * on, smoothstep(2.5, 6.0, apart));
}
`;

/** The rain round the eye, u: the curtain drawn (its radius), and the far one found along each ray through it (radius, top). */
const RAIN = { near: 7, far: 22, top: 40 };

const CURTAIN_VERTEX = /* glsl */ `
in vec4 aCentre; // the circle's centre (unit) and angular radius
in vec4 aShape;  // height (u), strength, seed, foot below the sea (u)
uniform float uSeaR;
out vec3 vWorld;
out vec3 vNormal;
out vec2 vAt;
out vec4 vShape;
out float vCirc;
out vec3 vAxis;
void main() {
  vec3 c = aCentre.xyz;
  vAxis = c;
  vec3 e1 = normalize(abs(c.y) < 0.9 ? cross(vec3(0.0, 1.0, 0.0), c) : cross(vec3(1.0, 0.0, 0.0), c)), e2 = cross(c, e1);
  float th = position.x * 6.2831853, rho = aCentre.w;
  vec3 radial = cos(th) * e1 + sin(th) * e2;
  vWorld = (cos(rho) * c + sin(rho) * radial) * (uSeaR + aShape.w + position.y * (aShape.x - aShape.w));
  vNormal = cos(rho) * radial - sin(rho) * c;
  vCirc = 6.2831853 * uSeaR * sin(rho);
  vAt = position.xy;
  vShape = aShape;
  gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0);
}`;

const CURTAIN_FRAGMENT = /* glsl */ `
in vec3 vWorld;
in vec3 vNormal;
in vec2 vAt;
in vec4 vShape;
in float vCirc;
in vec3 vAxis;
uniform float uSeaR;
uniform vec3 uWindT;
uniform float uFlash;
uniform float uRain;
uniform float uAsh;
uniform float uVeil;
uniform float uRange;
uniform float uGrey;
uniform vec3 uSlate;
uniform vec3 uWet;
uniform vec3 uLead;
uniform vec3 uGold;
${NOISE_GLSL}
void main() {
  float s = vAt.x * vCirc, h = vAt.y, H = vShape.x, hu = h * H, seed = vShape.z;
  vec3 up = normalize(vWorld), tang = normalize(cross(up, vNormal));
  float slant = clamp(dot(uWindT, tang), -1.6, 1.6) * 0.42;
  Paper q = paperPlain(vWorld, vNormal);
  vec3 paper = parchment(q);
  vec2 hc = vec2(s, hu), hx = dFdx(hc), hy = dFdy(hc);
  mat2 tilt = rot2(0.3);
  float a;
  vec3 col;
#if KIND == 0
  // fog: paper left unpainted, rolling at its top, with the merest cool breath where it thins
  float roll = fbm(vec2(s / 16.0 + uTime * 0.04, seed));
  float top = 0.58 + 0.3 * roll;
  float body = 1.0 - smoothstep(top - 0.25, top + 0.02, h + 0.1 * (fbm(hc / 6.0 + uTime * 0.02) - 0.5));
  a = vShape.y * body;
  col = glaze(mix(paper, paper * uSkyHorizon / uPaper, 0.2 * h), uSlate, 0.05 + 0.1 * (1.0 - body), 0.0, q);
#elif KIND == 1
  // a squall: grey sheets and pen strokes of rain hanging under a dark cloud base hatched beneath, inked along its top
  float roll = fbm(vec2(s / 18.0 - uTime * 0.03, seed));
  float base = 0.64 + 0.05 * (roll - 0.5), top = base + 0.12 + 0.22 * roll;
  float cloud = smoothstep(base - 0.01, base + 0.02, h) * (1.0 - smoothstep(top - 0.02, top, h));
  float sheet = smoothstep(0.35, 0.8, fbm(vec2((s - hu * slant) / 20.0, seed + uTime * 0.015)));
  float hang = smoothstep(0.0, 0.06, h) * (1.0 - smoothstep(base - 0.08, base, h));
  float strokes = rain(hc, 0.5, 3.5, 14.0, slant, 0.8, seed);
  a = vShape.y * max(cloud * 0.92, hang * sheet * (0.3 + 0.4 * strokes));
  col = glaze(paper, uSlate, mix(0.8, 1.7, cloud), 0.0, q);
  float under = cloud * (1.0 - smoothstep(base, base + 0.1, h));
  col = mix(col, hatchInk(0.7), under * hatching(tilt * hc, tilt * hx, tilt * hy, 0.8, seed));
  col = mix(col, hatchInk(0.85), (1.0 - cloud) * strokes);
  col = mix(col, uInk, cloud * pen((top - h) * H, 1.3));
#elif KIND == 2
  // the storm: a wall of wet, bleeding ink under rolling masses hatched beneath, driving rain, lit by the lightning;
  // from the calm it looms dark, from inside it is rain and slate
  bool calmSide = gl_FrontFacing;
  float roll = fbm(vec2(s / 34.0 - uTime * 0.05, seed)), roll2 = fbm(vec2(s / 11.0 + uTime * 0.08, seed + 3.0));
  float top = 0.5 + 0.34 * roll + 0.12 * roll2, billow = top - h;
  float wet = fbm(vec2(s / 9.0, hu / 9.0 + uTime * 0.25));
  float runs = smoothstep(0.62, 0.95, vn(vec2(s / 1.7, hu / 26.0 + uTime * 0.35)));
  float feather = smoothstep(0.0, 0.05 + 0.08 * runs, h + 0.03 * wet);
  float inMass = smoothstep(-0.01, 0.05, billow + 0.04 * runs);
  a = vShape.y * inMass * feather * (calmSide ? 0.96 : 0.8);
  float d = 1.2 + 0.9 * wet + 0.5 * runs - 0.7 * smoothstep(0.66, 0.9, q.bloom);
  col = glaze(paper, uWet, d * (calmSide ? 1.0 : 0.5), 0.8 * (1.0 - smoothstep(0.0, 0.07, billow)), q);
  if (!calmSide) col = glaze(col, uSlate, 0.7, 0.0, q);
  float row = fract(h * 3.2 + 0.8 * roll), under = smoothstep(0.55, 0.95, row) * step(0.0, billow);
  col = mix(col, hatchInk(0.9), 0.8 * under * hatching(tilt * hc, tilt * hx, tilt * hy, 0.85, seed));
  float drive = rain(hc, 0.42, 4.5, 26.0, slant + 0.55, 0.85, seed);
  col = mix(col, mix(uLead, uSilver, uNight), 0.5 * drive * step(0.0, billow));
  col = mix(col, uGold, uFlash * 0.45 * (0.4 + 0.6 * wet) * step(0.0, billow));
  col = mix(col, uInk, pen(billow * H, 1.8));
#elif KIND == 3
  // the announced front: a low bank of wet ink on the horizon, hatched, inked along its top
  float roll = fbm(vec2(s / 22.0, seed));
  float bank = 0.42 + 0.38 * roll - h;
  a = vShape.y * smoothstep(-0.01, 0.04, bank) * smoothstep(0.0, 0.06, h);
  col = glaze(paper, uWet, 0.8 + 0.5 * roll, 0.6 * (1.0 - smoothstep(0.0, 0.08, bank)), q);
  col = mix(col, hatchInk(0.8), hatching(tilt * hc, tilt * hx, tilt * hy, 0.7, seed));
  col = mix(col, uInk, pen(bank * H, 1.4));
#else
  // rain round the eye in one pass: near, long dark strokes on this curtain; far, a finer, greyer curtain found along the
  // same ray, so the two layers keep their parallax without a second full-screen layer; ash falls as slow grey flecks
  vec3 rd = normalize(vWorld - cameraPosition), o2 = cameraPosition - vAxis * dot(cameraPosition, vAxis), d2 = rd - vAxis * dot(rd, vAxis);
  float A = max(dot(d2, d2), 1e-6), B = dot(o2, d2), tf = (-B + sqrt(max(B * B - A * (dot(o2, o2) - ${(RAIN.far ** 2).toFixed(1)}), 0.0))) / A;
  vec3 pf = cameraPosition + rd * tf, rf = normalize(o2 + d2 * tf);
  vec3 e1 = normalize(abs(vAxis.y) < 0.9 ? cross(vec3(0.0, 1.0, 0.0), vAxis) : cross(vec3(1.0, 0.0, 0.0), vAxis)), e2 = cross(vAxis, e1);
  float hf = (length(pf) - uSeaR - vShape.w) / (${RAIN.top.toFixed(1)} - vShape.w);
  vec2 hcf = vec2(mod(atan(dot(rf, e2), dot(rf, e1)), 6.2831853) * ${RAIN.far.toFixed(1)}, hf * ${RAIN.top.toFixed(1)});
  float rn = rain(hc, 0.45, 3.0, 22.0, slant * 1.2, 0.9, seed), rfar = rain(hcf, 0.3, 1.8, 16.0, slant * 1.2, 0.6, seed + 1.4);
  float fadeN = smoothstep(0.0, 0.05, h) * (1.0 - smoothstep(0.6, 1.0, h)), fadeF = smoothstep(0.0, 0.05, hf) * (1.0 - smoothstep(0.6, 1.0, hf));
  float an = fadeN * (uRain * 0.65 * rn + uAsh * (0.2 + 0.5 * rain(hc, 0.5, 0.25, 1.4, slant * 2.0, 1.4, seed + 9.0)));
  float af = fadeF * (uRain * (0.12 + 0.45 * rfar) + uAsh * (0.2 + 0.5 * rain(hcf, 0.5, 0.25, 1.4, slant * 2.0, 1.4, seed + 10.4)));
  a = an + af * (1.0 - an);
  float kn = clamp(1.5 * rn * uRain, 0.0, 1.0), kf = clamp(1.5 * rfar * uRain, 0.0, 1.0);
  col = mix(glaze(paper, uSlate, 1.0 + uAsh, 0.0, q), mix(hatchInk(0.75), uSilver, 0.6 * uNight), (kn * an + kf * af * (1.0 - an)) / max(a, 1e-3));
#endif
  // what lies beyond the eye's short sight sinks into the same veil of paper as the sea there
  float veil = uVeil * smoothstep(0.3 * uRange, 1.1 * uRange, distance(vWorld, cameraPosition)) * 0.9;
  col = mix(col, glaze(paper, uSlate, 1.4 * uGrey, 0.0, q), veil);
  if (a < 0.02) discard;
  writeVeil(col, clamp(a, 0.0, 1.0));
}`;

/** One kind of curtain, up to `max` at once, `around` × `rows` cells each; one draw call. */
export class Curtains {
  readonly mesh: THREE.Mesh;
  private readonly geometry = new THREE.InstancedBufferGeometry();
  private readonly centre: THREE.InstancedBufferAttribute;
  private readonly shape: THREE.InstancedBufferAttribute;
  private readonly cells: number;
  private n = 0;

  constructor(style: Style, kind: number, max: number, around: number, rows: number, uniforms: WeatherUniforms, side: THREE.Side, order: number) {
    const pos: number[] = [], index: number[] = [];
    for (let j = 0; j <= rows; j++) for (let i = 0; i <= around; i++) pos.push(i / around, (j / rows) ** 1.3, 0);
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < around; i++) {
        const a = j * (around + 1) + i, b = a + around + 1;
        index.push(a, a + 1, b, a + 1, b + 1, b);
      }
    }
    this.cells = around * rows;
    this.geometry.setIndex(index);
    this.geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    this.centre = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.shape = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.geometry.setAttribute('aCentre', this.centre);
    this.geometry.setAttribute('aShape', this.shape);
    this.geometry.instanceCount = 0;
    this.mesh = new THREE.Mesh(this.geometry, inkMaterial(style, {
      vertexShader: CURTAIN_VERTEX, fragmentShader: CURTAIN_FRAGMENT, uniforms, defines: { KIND: kind }, veil: true, side,
    }));
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = order;
    this.mesh.visible = false;
  }

  get max(): number {
    return this.centre.count;
  }

  get triangles(): number {
    return this.mesh.visible ? 2 * this.cells * this.n : 0;
  }

  begin(): void {
    this.n = 0;
  }

  /** A curtain round `at` (unit) of angular radius rho, `height` u tall over a foot `under` u below the sea. */
  add(at: { readonly x: number; readonly y: number; readonly z: number }, rho: number, height: number, strength: number, seed: number, under = -0.6): void {
    if (this.n >= this.max) return;
    this.centre.setXYZW(this.n, at.x, at.y, at.z, rho);
    this.shape.setXYZW(this.n, height, strength, seed, under);
    this.n++;
  }

  end(): void {
    this.geometry.instanceCount = this.n;
    this.mesh.visible = this.n > 0;
    this.centre.needsUpdate = this.shape.needsUpdate = this.n > 0;
  }

  dispose(): void {
    this.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}

// ---------------------------------------------------------------------------------------------------------------
// The veil of short sight: two paper shells round the eye, each hiding a share of everything beyond it (the outer one
// lays two shares in one pass).

const VEIL_VERTEX = /* glsl */ `
in float aReach;
in float aLayers;
uniform float uRange;
out vec3 vDir;
out float vK;
out float vLayers;
void main() {
  vDir = position;
  vK = aReach;
  vLayers = aLayers;
  gl_Position = projectionMatrix * viewMatrix * vec4(cameraPosition + position * aReach * uRange, 1.0);
  gl_Position.z = min(gl_Position.z, 0.99999 * gl_Position.w); // beyond the far plane the shell stays whole, not cut to a ring
}`;

const VEIL_FRAGMENT = /* glsl */ `
in vec3 vDir;
in float vK;
in float vLayers;
uniform float uVeil;
uniform float uGrey;
uniform vec3 uSlate;
${NOISE_GLSL}
void main() {
  Paper q = paperPlain(vDir * 40.0, vDir);
  float n = fbm(vDir.xz * 5.0 + vDir.y * 3.0 + vK * 3.1 + uTime * 0.02);
  writeVeil(glaze(parchment(q), uSlate, 1.4 * uGrey, 0.0, q), 1.0 - pow(1.0 - uVeil * (0.36 + 0.3 * n), vLayers));
}`;

/** The shells' reaches (× the sight range), and the shares of veil each lays. */
const REACHES = [0.45, 0.9];
const LAYERS = [1, 2];

// ---------------------------------------------------------------------------------------------------------------
// Spray: lead-white flecks flicked off the crests round the eye on a world-anchored lattice, carried downwind.

const SPRAY = 240;

const SPRAY_VERTEX = /* glsl */ `
in vec4 aFleck; // place in the lattice cell, share, phase
uniform vec3 uFoot;
uniform vec3 uWindT;
uniform float uSpray;
uniform float uSeaR;
uniform float uTime;
out vec2 vUv;
out float vA;
const float CELL = 30.0;
void main() {
  vec3 o = vec3(aFleck.x, aFleck.y, fract(aFleck.z * 7.13 + aFleck.w)) * CELL, foot = uFoot * uSeaR;
  vec3 base = normalize(o + CELL * floor((foot - o) / CELL + 0.5)) * uSeaR, up = normalize(base);
  vec3 dw = uWindT - up * dot(uWindT, up);
  float w = length(dw), t = fract(uTime / (0.7 + 0.6 * aFleck.z) + aFleck.w);
  dw = w > 1e-4 ? dw / w : normalize(cross(up, vec3(0.0, 1.0, 0.0)) + 1e-4);
  float run = 1.5 + 3.0 * w, hop = (0.5 + 0.8 * aFleck.z) * (0.6 + 0.4 * w);
  vec3 p = base + dw * t * run + up * (0.15 + 4.0 * hop * t * (1.0 - t));
  vec3 vel = dw * run + up * 4.0 * hop * (1.0 - 2.0 * t), toEye = normalize(cameraPosition - p);
  vec3 along = vel - toEye * dot(vel, toEye);
  along = length(along) > 1e-4 ? normalize(along) : up;
  float on = step(aFleck.z, uSpray) * sin(3.14159 * t);
  vUv = position.xy;
  vA = on;
  vec3 wp = p + (along * position.x * (1.8 + 1.4 * w) + cross(toEye, along) * position.y) * 0.035 * on * (0.6 + 0.6 * fract(aFleck.z * 13.0));
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}`;

const SPRAY_FRAGMENT = /* glsl */ `
in vec2 vUv;
in float vA;
uniform vec3 uLead;
void main() {
  float d = length(vec2(vUv.x * (1.0 + 0.4 * vUv.x), vUv.y)) - 0.8, aa = fwidth(d);
  float fill = 1.0 - smoothstep(-aa, aa, d), rim = 1.0 - smoothstep(0.0, 1.5 * aa, abs(d + 0.12));
  if (fill < 0.01 || vA < 0.01) discard;
  writeVeil(mix(uLead, uInk, 0.5 * rim), fill * min(vA * 1.5, 1.0));
}`;

// ---------------------------------------------------------------------------------------------------------------
// Lightning: a crack of gold leaf, a jagged bolt with a branch, struck on the render clock at a place the caller picks.

const BOLT_VERTEX = /* glsl */ `
uniform vec3 uBase;
uniform vec3 uUp;
uniform float uHeight;
out vec3 vWorld;
out vec3 vN;
void main() {
  vec3 toEye = normalize(cameraPosition - uBase), side = normalize(cross(uUp, toEye));
  float w = uHeight * 0.005 * (1.4 - 0.7 * position.y);
  vWorld = uBase + uUp * position.y * uHeight + side * (position.x * uHeight + position.z * w);
  vN = normalize(toEye + side * position.z * 0.8);
  gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0);
}`;

const BOLT_FRAGMENT = /* glsl */ `
in vec3 vWorld;
in vec3 vN;
uniform vec3 uUp;
void main() {
  vec3 n = normalize(vN);
  writeInk(mix(goldLeaf(n, normalize(cameraPosition - vWorld), uUp, vWorld, n), vec3(1.0, 0.86, 0.5), 0.35), n);
}`;

function boltGeometry(seed: number): THREE.BufferGeometry {
  const pos: number[] = [], index: number[] = [];
  let k = seed;
  const strand = (x0: number, y0: number, n: number, lean: number): void => {
    const first = pos.length / 3;
    let x = x0;
    for (let i = 0; i <= n; i++) {
      const y = y0 * (1 - i / n);
      if (i > 0) x += (hash(k++) - 0.5) * 0.09 + lean;
      pos.push(x, y, -1, x, y, 1);
      if (i > 0) {
        const a = first + 2 * (i - 1);
        index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
  };
  strand(0, 1, 26, 0);
  const at = pos.length / 3 / 2; // the branch leaves the bolt a third of the way down
  strand(pos[(Math.floor(at / 3) * 2) * 3], 1 - 9 / 26, 10, 0.025);
  const g = new THREE.BufferGeometry();
  g.setIndex(index);
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return g;
}

export class Lightning {
  readonly mesh: THREE.Mesh;
  /** 0…1: the flash of the strike now (curtains light with it). */
  flash = 0;
  private readonly u = { uBase: { value: new THREE.Vector3() }, uUp: { value: new THREE.Vector3(0, 1, 0) }, uHeight: { value: 30 } };
  private readonly seed: number;

  constructor(style: Style, seed: number) {
    this.seed = seed;
    this.mesh = new THREE.Mesh(boltGeometry(seed), inkMaterial(style, {
      vertexShader: BOLT_VERTEX, fragmentShader: BOLT_FRAGMENT, uniforms: this.u, inkWeight: 0.7, side: THREE.DoubleSide,
    }));
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
  }

  private start(k: number, period: number): number {
    return (k + 0.1 + 0.6 * hash(k * 7.31 + this.seed)) * period;
  }

  /** The render clock of the first strike at or after `clock`, striking every `period` s. */
  next(clock: number, period: number): number {
    const k = Math.floor(clock / period), s = this.start(k, period);
    return s >= clock ? s : this.start(k + 1, period);
  }

  /**
   * The bolt at render clock `clock`: one strike each `period` s, at the place `place` picks from a share 0…1 (into base
   * and up; it returns the bolt's height, u), or none when place is null.
   */
  update(clock: number, period: number, place: ((pick: number, base: THREE.Vector3, up: THREE.Vector3) => number) | null): void {
    const k = Math.floor(clock / period), dt = clock - this.start(k, period), on = place !== null && dt >= 0 && dt < 0.34;
    this.flash = on ? Math.exp(-dt * 8) : 0;
    this.mesh.visible = on && (dt < 0.07 || dt > 0.12);
    if (on) this.u.uHeight.value = place(hash(k * 3.7 + this.seed), this.u.uBase.value, this.u.uUp.value);
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}

// ---------------------------------------------------------------------------------------------------------------
// The weather module

/** Spells drawn while their edge lies within this many u of the eye's foot (the horizon from the highest camera). */
const REACH = 420;
const MAX_SPELLS = 16;

export class Weather {
  readonly group = new THREE.Group();
  readonly u = weatherUniforms();
  readonly fog: Curtains;
  readonly squalls: Curtains;
  readonly rain: Curtains;
  readonly lightning: Lightning;
  private readonly veil: THREE.Mesh;
  private readonly spray: THREE.Mesh;
  private readonly local = { uFoot: { value: new THREE.Vector3() }, uSpray: { value: 0 } };
  private readonly sight = Array.from({ length: SHIPS }, newSight);
  private surveyed: { state: MatchState | null; tick: number } = { state: null, tick: -1 };
  private ash = 0;
  private bolt: Spell | null = null;
  private readonly tan = new THREE.Vector3();

  constructor(style: Style) {
    const u = this.u;
    // banks and squalls are tens of u across: 64 cells round keep each circle true to a tenth of a u (the wall needs 320)
    this.fog = new Curtains(style, CURTAIN.fog, MAX_SPELLS, 64, 6, u, THREE.FrontSide, 2);
    this.squalls = new Curtains(style, CURTAIN.squall, MAX_SPELLS, 64, 8, u, THREE.FrontSide, 2);
    this.rain = new Curtains(style, CURTAIN.rain, 1, 48, 4, u, THREE.BackSide, 5);
    this.lightning = new Lightning(style, 11);
    const sphere = new THREE.SphereGeometry(1, 40, 20), vg = new THREE.InstancedBufferGeometry();
    vg.index = sphere.index;
    vg.setAttribute('position', sphere.getAttribute('position'));
    vg.setAttribute('aReach', new THREE.InstancedBufferAttribute(Float32Array.from(REACHES).reverse(), 1));
    vg.setAttribute('aLayers', new THREE.InstancedBufferAttribute(Float32Array.from(LAYERS).reverse(), 1));
    vg.instanceCount = REACHES.length;
    this.veil = new THREE.Mesh(vg, inkMaterial(style, { vertexShader: VEIL_VERTEX, fragmentShader: VEIL_FRAGMENT, uniforms: u, veil: true, side: THREE.BackSide }));
    this.veil.renderOrder = 1.5; // before the curtains, which veil themselves by distance
    const quad = new THREE.PlaneGeometry(2, 2), sg = new THREE.InstancedBufferGeometry();
    sg.index = quad.index;
    sg.setAttribute('position', quad.getAttribute('position'));
    let k = 3;
    sg.setAttribute('aFleck', new THREE.InstancedBufferAttribute(Float32Array.from({ length: SPRAY * 4 }, () => hash(k++)), 4));
    sg.instanceCount = SPRAY;
    this.spray = new THREE.Mesh(sg, inkMaterial(style, {
      vertexShader: SPRAY_VERTEX, fragmentShader: SPRAY_FRAGMENT, uniforms: { ...u, ...this.local }, veil: true, side: THREE.DoubleSide,
    }));
    this.spray.renderOrder = 6;
    for (const m of [this.veil, this.spray]) m.frustumCulled = false;
    this.group.add(this.fog.mesh, this.squalls.mesh, this.rain.mesh, this.veil, this.spray, this.lightning.mesh);
  }

  /** Ash falling over the eye, 0…1 (WP17: the Fire Archipelago): grey wash and slow grey flecks. */
  setAsh(strength: number): void {
    this.ash = strength;
  }

  /** Whether the player (ship 0) sees ship j this tick, by the sim's sight: WP18 draws only these, lanterns included. */
  sees(j: number): boolean {
    return j === 0 || ((this.sight[0].ships | this.sight[0].marks) & (1 << j)) !== 0;
  }

  get triangles(): number {
    const veil = this.veil.visible ? REACHES.length * (this.veil.geometry.index!.count / 3) : 0;
    return this.fog.triangles + this.squalls.triangles + this.rain.triangles + veil + (this.spray.visible ? 2 * SPRAY : 0);
  }

  frame(air: Air, state: MatchState, clock: number): void {
    const u = this.u, foot = air.foot;
    u.uSeaR.value = R + tideOf(state);
    u.uWindT.value.copy(air.toward).multiplyScalar(air.strength);
    setSight(u, air);
    this.local.uFoot.value.copy(foot);
    // fog banks and squalls standing on the sea from the horizon in
    this.fog.begin();
    this.squalls.begin();
    let boltApart = Infinity;
    this.bolt = null;
    for (let k = 0; k < state.weather.length; k++) {
      const spell = state.weather[k], vig = vigour(spell);
      if ((spell.kind !== SPELL.fog && spell.kind !== SPELL.squall) || vig < 0.01) continue;
      const at = spell.at, d = Math.acos(Math.max(-1, Math.min(1, foot.x * at.x + foot.y * at.y + foot.z * at.z))) * R, apart = d - spell.r;
      if (apart > REACH) continue;
      // a curtain is never seen from within: under it, the rain round the eye and the short sight take over
      const rho = spell.kind === SPELL.fog ? fogAngle(spell) : 0, ring = rho > 0 ? rho * R : (spell.kind === SPELL.fog ? 0.6 : 0.8) * spell.r;
      const out = THREE.MathUtils.smoothstep(d, ring, ring + 12);
      if (out <= 0) continue;
      if (spell.kind === SPELL.fog) {
        this.fog.add(at, ring / R, 8 + 0.12 * spell.r, (rho > 0 ? 0.97 : 0.5 * vig) * out, k * 1.37);
      } else {
        this.squalls.add(at, ring / R, 30, vig * out, k * 1.37);
        if (vig > 0.6 && apart < Math.min(boltApart, 160)) {
          boltApart = apart;
          this.bolt = spell;
        }
      }
    }
    this.fog.end();
    this.squalls.end();
    // rain round the eye, short sight, spray
    const rain = Math.max(air.sky.squall, air.storm);
    u.uRain.value = rain;
    u.uAsh.value = this.ash;
    this.rain.begin();
    if (rain > 0.02 || this.ash > 0.02) {
      this.rain.add(foot, RAIN.near / R, 30, 1, 1.3, -3);
    }
    this.rain.end();
    this.veil.visible = u.uVeil.value > 0.01;
    const spray = (0.06 + 0.25 * Math.max(air.strength - 1, 0) + 0.5 * air.sky.squall + 0.8 * air.storm + 0.3 * air.gust) * (1 - air.sky.calm);
    this.local.uSpray.value = Math.min(1, spray);
    this.spray.visible = spray > 0.01;
    // lightning in the nearest squall in its prime
    const bolt = this.bolt;
    this.lightning.update(clock, 4.5, bolt && ((pick, base, up) => {
      const tan = this.tan.set(bolt.at.y, -bolt.at.x, 0.3).normalize(), a = pick * Math.PI * 2, off = (0.5 * pick * bolt.r) / R;
      tan.applyAxisAngle(up.set(bolt.at.x, bolt.at.y, bolt.at.z), a).addScaledVector(up, -tan.dot(up)).normalize();
      up.multiplyScalar(Math.cos(off)).addScaledVector(tan, Math.sin(off)).normalize();
      base.copy(up).multiplyScalar(u.uSeaR.value);
      return 24;
    }));
    // the player's sight, once a tick
    const s = this.surveyed;
    if (air.waters && (s.state !== state || s.tick !== state.tick)) {
      survey(air.waters, state, this.sight);
      s.state = state;
      s.tick = state.tick;
    }
  }

  dispose(): void {
    this.fog.dispose();
    this.squalls.dispose();
    this.rain.dispose();
    this.lightning.dispose();
    for (const m of [this.veil, this.spray]) {
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    }
  }
}

/** Each scene's weather (WP18 asks it which ships the player sees). */
export const weathers = new WeakMap<THREE.Object3D, Weather>();

/** The composition root's weather (MODULES). */
export function createWeather(ctx: RenderContext): RenderModule {
  const weather = new Weather(ctx.pipeline.style);
  weathers.set(ctx.scene, weather);
  ctx.scene.add(weather.group);
  return {
    frame(f) {
      weather.frame(airOf(ctx.scene).update(ctx.world, f.state, ctx.camera.position), f.state, f.clock);
    },
    dispose() {
      ctx.scene.remove(weather.group);
      weathers.delete(ctx.scene);
      weather.dispose();
    },
  };
}

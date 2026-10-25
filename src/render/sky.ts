// The sky (WP14): a watercolour wash on parchment, deepening toward the zenith in three laid washes whose edges waver
// and pool where they dried, flushed toward a low sun with the hour's glow (rose and pale gold at dawn, amber and
// vermilion at the golden hour, violet at the blue hour); clouds outlined in ink and shaded by hatching, drifting with
// the sim's wind; the sun a gold-leaf disc with drawn rays, as on a chart's border; by night gold-leaf stars in the
// turning heavens and a silver moon. Sky.update sets the hour for every material through the light (render/light.ts),
// and the sea (render/sea.ts) pales into the same horizon wash. createSky is the composition root's module (MODULES).
import * as THREE from 'three';
import { inkMaterial, transmittanceVec, type Style } from '../style/glsl.ts';
import { hex, STORM_SLATE } from '../style/palette.ts';
import { R } from '../sim/sphere.ts';
import { DAY } from '../sim/tables.ts';
import { hourOf } from '../sim/weather.ts';
import type { Geography } from '../sim/world/geography.ts';
import { AURORA_GLSL, Beams, glslLinear, Lights, MAX_HALOS } from './light.ts';
import { airOf } from './weather.ts';
import type { RenderContext, RenderModule } from './world.ts';

const { smoothstep } = THREE.MathUtils;

/** Angular radii (rad) of the sun's disc and the moon. */
const SUN_R = 0.05, MOON_R = 0.036;
/** Star lattice cells per cube-face unit of the heavens (≈ 1.7° a cell), and the share of cells holding a star. */
const STAR_CELLS = 26, STAR_SHARE = 0.22;
/**
 * The clouds: how many, the cap round the eye they live in (rad), their heights and half-widths (u), and how fast a
 * fair wind carries them (u/s).
 */
export const CLOUDS = { count: 28, cap: 0.55, low: 10, high: 20, small: 6, large: 14, drift: 1.6 };

// an anti-aliased pen line `css` CSS px wide along the zero set of sd
const PEN_GLSL = /* glsl */ `
float penLine(float sd, float css) {
  float px = abs(sd) / max(fwidth(sd), 1e-6) / uRenderPx;
  return 1.0 - smoothstep(0.5 * css - 0.5 / uRenderPx, 0.5 * css + 0.5 / uRenderPx, px);
}
`;

const DOME_VERTEX = /* glsl */ `
out vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * viewMatrix * vec4(cameraPosition + position, 1.0);
}`;

const DOME_FRAGMENT = /* glsl */ `
in vec3 vDir;
uniform vec3 uUp;
uniform vec3 uSunDir;
uniform vec3 uSunX;
uniform vec3 uSunY;
uniform vec3 uMoonDir;
uniform vec3 uMoonX;
uniform vec3 uMoonY;
uniform mat3 uCelestial;
uniform float uGlowAmt;
uniform float uSunVis;
uniform float uMoonVis;
uniform float uStarVis;
uniform float uGrey;
uniform vec3 uSlate;
uniform float uAurora;
const float RAY_STEP = 6.2831853 / 16.0;
const vec3 PALE_GOLD = ${glslLinear(hex('#f5dc96'))};
${PEN_GLSL}
${AURORA_GLSL}
float hashC(float x) { return fract(sin(x * 91.7 + 13.1) * 43758.5453); }
// the outline of a bank of cumulus along the horizon: domes in n cells round it (rad above the horizon)
float cumulusTop(float az, float n, float flat_, float seed) {
  float cw = 6.2831853 / n, u = az / cw, ci = floor(u), top = 0.0;
  for (int k = -2; k <= 2; k++) {
    float c = mod(ci + float(k), n) + seed * 17.0, r = cw * (0.7 + 0.9 * hashC(c));
    float dx = az - (ci + float(k) + 0.5 + 0.5 * (hashC(c * 1.7) - 0.5)) * cw;
    top = max(top, step(0.3, hashC(c * 2.3)) * (0.5 * r * hashC(c * 2.9) + flat_ * sqrt(max(r * r - dx * dx, 0.0))));
  }
  return top;
}
void main() {
  vec3 d = normalize(vDir);
  float el = dot(d, uUp);
  vec3 tw = triWeights(d, 4.0);
  Paper q = paperPlain(d * 400.0, d);
  float wob = tri(tPaper, d * 2.2, tw).b - 0.5, fine = tri(tPaper, d * 9.0, tw).g - 0.5;
  vec3 fwd = -vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2]);
  // gold leaf on the page glints as the page tilts: here, as the view turns
  vec3 tilt = normalize(-d + 1.5 * (fwd - d));

  // the horizon wash over the whole sky (the colour the far sea pales into), then the zenith laid over it as one graded
  // wash, wet in wet: strongest overhead, thinning to the haze at the horizon, its load uneven with the brush and the
  // paper, a soft backrun here and there, and one wavering pooled edge high up where the second pass dried
  vec3 col = glaze(parchment(q), uSkyHorizon / uPaper, 1.0, 0.0, q);
  vec3 tz = uSkyZenith / max(uSkyHorizon, vec3(1e-3));
  // (elevation counted from the sea's horizon, which dips below the eye's level as the eye climbs over the globe)
  float eh = el + sqrt(max(1.0 - pow(${R.toFixed(1)} / max(length(cameraPosition), ${R.toFixed(1)}), 2.0), 0.0));
  float eg = max(eh + 0.025 * wob + 0.004 * fine, 0.0);
  float dz = 0.06 + 0.94 * (1.0 - exp(-eg * 2.4)) * (1.0 + 0.12 * wob);
  float e2 = eh - 0.42 - 0.06 * wob - 0.006 * fine, fw2 = fwidth(e2), in2 = smoothstep(-fw2, fw2, e2);
  dz += 0.1 * in2;
  float pool = in2 * (1.0 - smoothstep(0.0, 0.012 + 0.015 * q.bloom, e2));
  Paper qz = q; // laid evenly: the paper's mottle only breathes in it, never blotches
  qz.mottle = 0.5 + 0.35 * (q.mottle - 0.5);
  qz.bloom = 0.5 + 0.35 * (q.bloom - 0.5);
  col = glaze(col, tz, dz, 0.2 * pool, qz);
  // trade-wind cloud over the horizon by day: banks of cumulus heaped along the sky's foot, the paper left white in them
  // with their bellies glazed blue-grey, softening into the haze with distance; never inked (they are far)
  vec3 hn = normalize(d - el * uUp + 1e-5), hw = triWeights(hn, 4.0);
  float bank = smoothstep(0.4, 0.6, tri(tPaper, hn * 1.1, hw).b);
  vec3 ax = normalize(cross(uUp, abs(uUp.z) < 0.9 ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0))), ay = cross(uUp, ax);
  float caz = atan(dot(d, ay), dot(d, ax));
  // heaped domes, big then small on their shoulders, as a watercolourist rounds a cumulus' head
  float big = cumulusTop(caz, 240.0, 1.0, 1.0), small = cumulusTop(caz + 0.004, 640.0, 1.0, 7.0);
  float top = bank * (big + small * step(0.004, big)), base = 0.004 + 0.002 * wob;
  float cd = min(top - eh, eh - base), cfw = fwidth(cd);
  // (a sea-level view's: from high over the globe the banks would stand on the limb as peaks)
  float low = 1.0 - smoothstep(8.0, 24.0, length(cameraPosition) - ${R.toFixed(1)});
  float cloud = smoothstep(-cfw, cfw, cd) * step(0.002, top) * uSunVis * (1.0 - uGrey) * low;
  if (cloud > 0.0) {
    float belly = 1.0 - smoothstep(0.0, 0.6 * top, eh), rim = 1.0 - smoothstep(0.0, 0.004, cd);
    vec3 cc = glaze(parchment(q), uSlate / uPaper, 0.22 * belly + 0.05, 0.5 * rim, q);
    cc = mix(cc, col, 0.2 + 0.25 * (1.0 - bank));
    col = mix(col, cc, cloud);
  }

  // the low sky toward the sun runs into the hour's glow, wet in wet, pale gold close round the sun
  vec3 hd = d - el * uUp, hs = uSunDir - dot(uSunDir, uUp) * uUp;
  float az = dot(hd, hs) * inversesqrt(max(dot(hd, hd) * dot(hs, hs), 1e-8)) * 0.5 + 0.5;
  float glow = uGlowAmt * az * az * (1.0 - smoothstep(-0.04, 0.3 + 0.1 * wob, el - 0.22 * pow(az, 4.0)));
  col = mix(col, glaze(parchment(q), mix(uSkyGlow, PALE_GOLD, pow(az, 16.0) * 0.7) / uPaper, 1.0, 0.3 * glow, q), glow);
  col = mix(col, glaze(parchment(q), uSlate, 0.9, 0.0, q), uGrey);

  // the sun: a gold-leaf disc with a double rim and sixteen drawn rays, straight and flaming by turns, the paper
  // left bare round it
  float cs = dot(d, uSunDir);
  vec2 sp = vec2(dot(d, uSunX), dot(d, uSunY)) / max(cs, 0.05) / ${SUN_R};
  float sr = length(sp), sa = atan(sp.y, sp.x);
  float k = floor(sa / RAY_STEP + 0.5), da = sa - k * RAY_STEP, flame = mod(k, 2.0);
  float rlen = mix(1.6, 1.2, flame), rt = clamp((sr - 1.0) / rlen, 0.0, 1.0);
  float ray = max(abs(da * sr - flame * 0.17 * sin(rt * 9.42) * rt) - mix(0.16, 0.12, flame) * (1.0 - rt), sr - 1.0 - rlen);
  // the far hemisphere is masked after the derivatives are taken: a jump in sun there inked its rim, a dotted great
  // circle across the sky
  float sunVis = uSunVis * step(0.0, cs), sun = min(sr - 1.0, ray), fs = fwidth(sun);
  float leaf = (1.0 - smoothstep(-fs, fs, sun)) * sunVis;
  col = mix(col, parchment(q), (1.0 - smoothstep(1.4, 4.0 + 1.2 * wob, sr)) * sunVis * (0.4 + 0.2 * (1.0 - uGlowAmt)));
  if (cs > 0.9) {
    vec3 n = normalize(-uSunDir + (sp.x * uSunX + sp.y * uSunY) * (0.45 * step(sr, 1.0)));
    col = mix(col, goldLeaf(n, tilt, normalize(uUp - uSunDir), vec3(sp * 0.45, 1.0), vec3(0.0, 0.0, 1.0)), leaf);
  }
  col = mix(col, uInk, (penLine(sun, 1.5) + penLine(sr - 0.8, 0.7) * step(sr, 1.0)) * sunVis);

  // the moon in silver, its limb hatched, the sky lifted round it
  float cm = dot(d, uMoonDir);
  vec2 mp = vec2(dot(d, uMoonX), dot(d, uMoonY)) / max(cm, 0.05) / ${MOON_R};
  float moonVis = uMoonVis * step(0.0, cm), mr = length(mp), fm = fwidth(mr);
  vec2 mh = rot2(0.5) * mp * 30.0, mhx = dFdx(mh), mhy = dFdy(mh);
  col = mix(col, uSilver * 0.55 + col * 0.45, (1.0 - smoothstep(1.2, 4.0 + wob, mr)) * 0.3 * moonVis);
  if (cm > 0.9) {
    float maria = smoothstep(0.5, 0.75, texture(tMarks, mp * 0.18 + 0.31).g);
    vec3 face = wash(uSilver, uSlate, 0.35 * maria + 0.1 * (texture(tPaper, mp * 0.3).r - 0.5));
    face = mix(face, hatchInk(0.3), 0.8 * hatching(mh, mhx, mhy, smoothstep(0.55, 1.0, mr) * 0.5, 9.0));
    col = mix(col, face, (1.0 - smoothstep(1.0 - fm, 1.0 + fm, mr)) * moonVis);
  }
  col = mix(col, uInk, penLine(mr - 1.0, 1.2) * moonVis);

  // gold-leaf stars, fixed in the heavens as they turn with the hour: four points, eight on the brightest
  if (uStarVis > 0.0) {
    vec3 c = uCelestial * d, ac = abs(c);
    vec3 f3 = ac.x >= ac.y && ac.x >= ac.z ? vec3(c.yz / ac.x, c.x > 0.0 ? 0.0 : 1.0)
            : ac.y >= ac.z ? vec3(c.zx / ac.y, c.y > 0.0 ? 2.0 : 3.0) : vec3(c.xy / ac.z, c.z > 0.0 ? 4.0 : 5.0);
    vec2 g = f3.xy * ${STAR_CELLS.toFixed(1)}, cell = floor(g), gw = fwidth(g), key = cell + f3.z * 101.0;
    if (hash12(key) < ${STAR_SHARE}) {
      float big = pow(hash12(key + 3.7), 4.0), s = mix(0.07, 0.2, big);
      vec2 x = (g - cell - 0.5 - (vec2(hash12(key + 1.3), hash12(key + 8.9)) - 0.5) * 0.5) / s, xr = rot2(0.785) * x * 1.6;
      float sd = sqrt(abs(x.x)) + sqrt(abs(x.y)) - 1.0;
      sd = min(sd, big > 0.3 ? sqrt(abs(xr.x)) + sqrt(abs(xr.y)) - 1.0 : 1.0);
      float aa = length(gw) / s * 1.2, star = (1.0 - smoothstep(-aa, aa, sd)) * uStarVis * smoothstep(0.0, 0.08, el);
      vec3 n = normalize(-d + vec3(hash12(key + 5.1) - 0.5, hash12(key + 6.2) - 0.5, 0.0) * 0.6);
      col = mix(col, goldLeaf(n, tilt, uUp, vec3(x * 0.2 + key * 0.37, 1.0), vec3(0.0, 0.0, 1.0)), star);
      col = mix(col, uInk, (1.0 - smoothstep(0.0, 2.0 * aa, abs(sd))) * step(0.3, big) * 0.7 * uStarVis);
    }
  }
  writeInk(aurora(col, d, uUp, uAurora), -d);
}`;

const CLOUD_VERTEX = /* glsl */ `
in vec4 aCloud; // centre (world), half-width (u; 0 = hidden)
in float aSeed;
out vec2 vUv;
out vec3 vRight;
out vec3 vUp;
out vec3 vToEye;
out vec3 vWorld;
out float vSize;
flat out float vSeed;
uniform float uSeaR;
void main() {
  // never between the camera and the action (S-001): a cloud near the line of sight down to the sea in view slides
  // clear of it, so the ship and its trail always show; clouds toward the horizon, off that line, stay where they are
  vec3 c = aCloud.xyz, fwd = -vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2]);
  float bq = dot(cameraPosition, fwd), disc = bq * bq - dot(cameraPosition, cameraPosition) + uSeaR * uSeaR;
  float reach = disc > 0.0 ? max(-bq - sqrt(disc), 0.0) : 0.0, ahead = dot(c - cameraPosition, fwd);
  vec3 off = c - cameraPosition - fwd * clamp(ahead, 0.0, reach);
  float d = length(off), push = reach > 0.0 && ahead > 0.0 ? max(1.05 * aCloud.w + 0.18 * min(ahead, reach) - d, 0.0) : 0.0;
  c += (d > 1e-3 ? off / d : normalize(c)) * push;
  vec3 toEye = normalize(cameraPosition - c), right = cross(normalize(c), toEye);
  right = dot(right, right) < 1e-6 ? normalize(cross(vec3(0.0, 0.0, 1.0), toEye) + vec3(1e-4, 0.0, 0.0)) : normalize(right);
  vUv = position.xy;
  vRight = right;
  vUp = cross(toEye, right);
  vToEye = toEye;
  vSize = aCloud.w;
  vSeed = aSeed;
  // a cloud stands in the sky: seen from below or level, or low over far water; one the eye looks down on from high
  // above would lie flat on the sea as a paper disc, so it thins away as the eye rises over it
  float seen = 1.0 - smoothstep(0.12, 0.3, dot(toEye, normalize(c)));
  vWorld = c + (right * position.x + vUp * position.y) * aCloud.w * seen;
  gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0);
}`;

// a cumulus: a row of rounded bumps over a flat, wavering base, outlined in ink (heavier on the shadowed side), curls
// drawn where one bump turns under the next, shaded by hatching and a cool glaze, its belly flushed by a low sun,
// picked out in silver by the moon, and fading into the horizon wash with distance
const CLOUD_FRAGMENT = /* glsl */ `
in vec2 vUv;
in vec3 vRight;
in vec3 vUp;
in vec3 vToEye;
in vec3 vWorld;
in float vSize;
flat in float vSeed;
uniform float uGlowAmt;
uniform float uGrey;
uniform vec3 uSlate;
${PEN_GLSL}
void main() {
  vec2 uv = vUv;
  float base = -0.32 + 0.025 * sin(uv.x * 7.0 + vSeed * 9.0);
  float s[6], cy[6];
  float body = 1e3, nr = 1.0;
  vec2 nc = vec2(0.0);
  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    float x = -0.66 + fi * 0.264 + (hash11(vSeed * 17.0 + fi * 3.7) - 0.5) * 0.12;
    float r = (0.2 + 0.17 * hash11(vSeed * 5.3 + fi * 11.1)) * (1.0 - 0.55 * abs(x));
    vec2 cc = vec2(x, base + r * (0.45 + 0.4 * hash11(vSeed + fi * 1.9)));
    s[i] = length(uv - cc) - r;
    cy[i] = cc.y;
    if (s[i] < body) { body = s[i]; nc = cc; nr = r; }
  }
  float sd = max(body, base - uv.y), crease = 0.0;
  for (int i = 0; i < 6; i++) {
    float others = 1e3;
    for (int j = 0; j < 6; j++) if (j != i) others = min(others, s[j]);
    crease = max(crease, penLine(s[i], 0.7) * step(others, -0.02) * step(base + 0.05, uv.y) * step(uv.y, cy[i]));
  }

  vec2 n2 = (uv - nc) / nr;
  float under = smoothstep(0.16, 0.0, uv.y - base);
  n2 = mix(n2, vec2(0.3 * n2.x, -0.9), under);
  float nz = sqrt(max(1.0 - dot(n2, n2), 0.05));
  vec3 n = normalize(vRight * n2.x + vUp * n2.y + vToEye * nz);
  float ndl = dot(n, uSun), tone = clamp(lightTone(ndl, nz) + 0.3 * under, 0.0, 1.0);
  Paper q = paperAt(vec3(uv * vSize, vSeed * 37.0), vec3(0.0, 0.0, 1.0), 0.0);
  vec3 col = sunGlaze(shadeGlaze(parchment(q), tone, q), ndl, tone);
  col = mix(col, glaze(col, uSkyGlow / uPaper, 0.9, 0.0, q), uGlowAmt * (0.35 + 0.65 * under));
  col = mix(col, glaze(col, uSlate, 0.8, 0.0, q), uGrey);
  vec2 hc = rot2(0.6 + vSeed) * uv * vSize, hx = dFdx(hc), hy = dFdy(hc);
  col = mix(col, hatchInk(tone), hatching(hc, hx, hy, tone, vSeed * 13.0));
  float lit = smoothstep(0.3, 0.95, ndl) * uNight;
  col = mix(col, uSilver, 0.7 * hatching(rot2(0.6) * hc, rot2(0.6) * hx, rot2(0.6) * hy, lit * 0.3, vSeed + 11.0));
  col = mix(col, uSilver, lit * 0.5 * (1.0 - smoothstep(0.0, 0.06, -sd)));
  float far = smoothstep(70.0, 200.0, length(vWorld - cameraPosition));
  col = mix(col, uSkyHorizon * parchment(q) / uPaper, far * 0.45);
  float ink = max(penLine(sd, mix(1.1, 2.1, tone)), 0.6 * crease) * (1.0 - 0.6 * far);
  col = mix(col, uInk, ink);
  if (sd > 0.0 && ink < 0.02) discard;
  writeInk(col, n);
}`;

/** The weather over the eye, as the sky reads it. */
export interface SkyWeather {
  /** The wind at the eye's foot: a world tangent vector whose length is its strength (fair = 1). */
  readonly wind: THREE.Vector3;
  /** 0…1 (skyAt): squalls crowd and grey the sky, calms clear it. */
  readonly squall: number;
  readonly calm: number;
}

const tmp = new THREE.Vector3(), turn = new THREE.Matrix4(), turn3 = new THREE.Matrix3(), frame3 = new THREE.Matrix3();
const POLE = new THREE.Vector3(0, Math.cos(DAY.tilt), Math.sin(DAY.tilt)); // the heavens' axis in the local sky frame

/** x, y: an orthonormal frame across `dir` with y toward the zenith. */
function across(dir: THREE.Vector3, up: THREE.Vector3, x: THREE.Vector3, y: THREE.Vector3): void {
  y.copy(up).addScaledVector(dir, -up.dot(dir));
  if (y.lengthSq() < 1e-8) y.set(1, 0, 0).addScaledVector(dir, -dir.x);
  y.normalize();
  x.crossVectors(y, dir);
}

export class Sky {
  readonly group = new THREE.Group();
  /** The light registry: ships add their lanterns here. */
  readonly lights: Lights;
  private readonly style: Style;
  readonly beams: Beams;
  private readonly dome: THREE.Mesh;
  private readonly clouds: THREE.Mesh;
  private readonly cloudAttr = new THREE.InstancedBufferAttribute(new Float32Array(CLOUDS.count * 4), 4);
  private readonly dirs = Array.from({ length: CLOUDS.count }, () => new THREE.Vector3());
  private readonly heights: number[] = [];
  private readonly sizes: number[] = [];
  private readonly shown: number[] = [];
  private readonly rng: () => number;
  private clock = Number.NaN;
  private readonly u = {
    uUp: { value: new THREE.Vector3() }, uSunDir: { value: new THREE.Vector3() }, uSunX: { value: new THREE.Vector3() },
    uSunY: { value: new THREE.Vector3() }, uMoonDir: { value: new THREE.Vector3() }, uMoonX: { value: new THREE.Vector3() },
    uMoonY: { value: new THREE.Vector3() }, uCelestial: { value: new THREE.Matrix3() }, uGlowAmt: { value: 0 },
    uSunVis: { value: 0 }, uMoonVis: { value: 0 }, uStarVis: { value: 0 }, uGrey: { value: 0 }, uAurora: { value: 0 },
    uSlate: { value: transmittanceVec(STORM_SLATE) }, uSeaR: { value: R },
  };

  constructor(style: Style, geo: Geography, seed = 7) {
    this.style = style;
    let a = seed >>> 0;
    this.rng = () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = Math.imul(a ^ (a >>> 15), a | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    this.lights = new Lights(style);
    this.beams = new Beams(style, geo, this.lights);
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(1500, 64, 32), inkMaterial(style, {
      vertexShader: DOME_VERTEX, fragmentShader: DOME_FRAGMENT, uniforms: this.u, id: 0, inkWeight: 0, side: THREE.BackSide,
    }));
    this.dome.frustumCulled = false;
    this.dome.renderOrder = 1; // after the opaque world, so only the sky's own pixels are shaded
    const quad = new THREE.PlaneGeometry(2, 1.2), g = new THREE.InstancedBufferGeometry();
    g.index = quad.index;
    g.setAttribute('position', quad.getAttribute('position'));
    g.setAttribute('aCloud', this.cloudAttr.setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(Float32Array.from({ length: CLOUDS.count }, () => this.rng() * 10), 1));
    g.instanceCount = CLOUDS.count;
    for (let k = 0; k < CLOUDS.count; k++) {
      this.heights.push(CLOUDS.low + (CLOUDS.high - CLOUDS.low) * this.rng());
      this.sizes.push(CLOUDS.small + (CLOUDS.large - CLOUDS.small) * this.rng() ** 1.5);
      this.shown.push(0);
    }
    this.clouds = new THREE.Mesh(g, inkMaterial(style, {
      vertexShader: CLOUD_VERTEX, fragmentShader: CLOUD_FRAGMENT, uniforms: this.u, id: 0, inkWeight: 0, side: THREE.DoubleSide,
    }));
    this.clouds.frustumCulled = false;
    this.group.add(this.dome, this.clouds, this.beams.mesh, this.lights.halos);
  }

  /** Triangles the sky submits (by night; the beams are hidden by day). */
  get triangles(): number {
    return this.dome.geometry.index!.count / 3 + CLOUDS.count * 2 + this.beams.triangles + 2 * MAX_HALOS;
  }

  /** The aurora's strength over the eye, 0…1: WP16 raises it by night near the Ice Crown. */
  setAurora(strength: number): void {
    this.u.uAurora.value = strength;
  }

  /** The sky at `hour` over the eye; `clock` is the render clock (the clouds drift by its steps). */
  update(hour: number, clock: number, eye: THREE.Vector3, w: SkyWeather): void {
    this.lights.set(hour, eye);
    const s = this.lights.sky, u = this.u, h = s.sunHeight, first = Number.isNaN(this.clock);
    const dt = first ? 0 : Math.min(Math.max(clock - this.clock, 0), 0.1);
    this.clock = clock;
    this.drift(dt, w, first);
    this.beams.setLit(s.lit);
    u.uUp.value.copy(s.up);
    u.uSunDir.value.copy(s.sun);
    across(s.sun, s.up, u.uSunX.value, u.uSunY.value);
    u.uMoonDir.value.copy(s.moon);
    across(s.moon, s.up, u.uMoonX.value, u.uMoonY.value);
    u.uGlowAmt.value = smoothstep(h, -0.32, -0.02) * (1 - smoothstep(h, 0.05, 0.45));
    u.uSunVis.value = smoothstep(h, -0.06, 0);
    u.uMoonVis.value = 1 - smoothstep(h, -0.2, 0.05);
    u.uStarVis.value = smoothstep(this.style.uniforms.uNight.value, 0.35, 0.9);
    u.uGrey.value = 0.55 * w.squall;
    // world → the heavens: into the local sky frame (east, north, up), then turned back by the hour about the pole
    const { east: e, north: n, up } = s;
    frame3.set(e.x, e.y, e.z, n.x, n.y, n.z, up.x, up.y, up.z);
    turn3.setFromMatrix4(turn.makeRotationAxis(POLE, (2 * Math.PI * (hour - DAY.sunrise)) / 24));
    u.uCelestial.value.multiplyMatrices(turn3, frame3);
  }

  /** Carry the clouds on the wind; those blown out of the cap come back in on its far side. */
  private drift(dt: number, w: SkyWeather, first: boolean): void {
    const s = this.lights.sky, foot = s.up, cap = Math.cos(CLOUDS.cap), a = this.cloudAttr.array as Float32Array;
    const cover = Math.min(Math.max(0.62 + 0.38 * w.squall - 0.45 * w.calm, 0.1), 1) * CLOUDS.count;
    for (let k = 0; k < CLOUDS.count; k++) {
      const p = this.dirs[k], r = R + this.heights[k];
      if (first || p.dot(foot) < Math.cos(CLOUDS.cap * 1.4)) {
        const az = this.rng() * Math.PI * 2, off = CLOUDS.cap * Math.sqrt(this.rng());
        p.copy(foot).multiplyScalar(Math.cos(off)).addScaledVector(s.east, Math.sin(off) * Math.cos(az))
          .addScaledVector(s.north, Math.sin(off) * Math.sin(az));
      }
      tmp.copy(w.wind).addScaledVector(p, -w.wind.dot(p));
      p.addScaledVector(tmp, (dt * CLOUDS.drift) / r).normalize();
      const pf = p.dot(foot);
      if (pf < cap) p.negate().addScaledVector(foot, 2 * pf);
      const target = k < cover ? 1 : 0;
      this.shown[k] = first ? target : this.shown[k] + Math.max(-dt * 0.2, Math.min(dt * 0.2, target - this.shown[k]));
      const size = this.sizes[k] * this.shown[k] * smoothstep(p.dot(foot), cap, Math.cos(CLOUDS.cap * 0.85));
      a[k * 4] = p.x * r;
      a[k * 4 + 1] = p.y * r;
      a[k * 4 + 2] = p.z * r;
      a[k * 4 + 3] = size;
    }
    this.cloudAttr.needsUpdate = true;
  }

  dispose(): void {
    for (const m of [this.dome, this.clouds]) {
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    }
    this.beams.dispose();
    this.lights.dispose();
  }
}

/** The composition root's sky (MODULES): the hour, the wind and the weather over the camera's foot, every frame. */
/** Each scene's sky, for the modules built after it (structures register their lamps in its lights). */
export const skies = new WeakMap<THREE.Object3D, Sky>();

export function createSky(ctx: RenderContext): RenderModule {
  const sky = new Sky(ctx.pipeline.style, ctx.world.geo);
  skies.set(ctx.scene, sky);
  ctx.scene.add(sky.group);
  const w = { wind: new THREE.Vector3(), squall: 0, calm: 0 };
  return {
    frame(f) {
      const air = airOf(ctx.scene).update(ctx.world, f.state, ctx.camera.position);
      w.wind.copy(air.toward).multiplyScalar(air.strength);
      w.squall = Math.max(air.sky.squall, air.storm);
      w.calm = air.sky.calm * (1 - air.storm);
      sky.update(hourOf(f.state), f.clock, ctx.camera.position, w);
    },
    dispose() {
      ctx.scene.remove(sky.group);
      sky.dispose();
    },
  };
}

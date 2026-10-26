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
 * The clouds, drawn on the sky behind everything: how many; the elevations (rad above the sea's horizon) of the lowest
 * and highest bases, the farthest crowding toward the horizon (one level base seen in perspective: a field of cumulus
 * has many far clouds to a few near, `crowd` the power that sets how many); each one's half-width as a multiple of its
 * base's elevation (its own size over the base's height: most small, a few great towers), easing toward the widest; the
 * height (u) of that base over the eye, so the wind (u/s at fair) turns each across the sky as its distance says; how
 * far out (u) they are drawn; the eye's heights (u over the sea) between which they thin away (from high the world is
 * seen from above the weather).
 */
export const CLOUDS = {
  count: 56, low: 0.014, high: 0.3, crowd: 3, wide: [0.9, 4.0], widest: 0.5, base: 12, drift: 1.6, dist: 1400, fade: [45, 140],
};

// an anti-aliased pen line `css` CSS px wide along the zero set of sd
const PEN_GLSL = /* glsl */ `
float penLine(float sd, float css) {
  float px = abs(sd) / max(fwidth(sd), 1e-6) / uRenderPx;
  return 1.0 - smoothstep(0.5 * css - 0.5 / uRenderPx, 0.5 * css + 0.5 / uRenderPx, px);
}
`;

// the sun's disc and its sixteen rays, straight and flaming by turns: a distance in disc radii (< 0 on the leaf), and
// (sp) the place on the plate in disc radii from its centre; the sky draws it, and a cloud drifting across leaves it
const SUN_GLSL = /* glsl */ `
const float RAY_STEP = 6.2831853 / 16.0;
float sunShape(vec3 d, vec3 sd, vec3 sx, vec3 sy, out vec2 sp) {
  sp = vec2(dot(d, sx), dot(d, sy)) / max(dot(d, sd), 0.05) / ${SUN_R};
  float sr = length(sp), sa = atan(sp.y, sp.x);
  float k = floor(sa / RAY_STEP + 0.5), da = sa - k * RAY_STEP, flame = mod(k, 2.0);
  float rlen = mix(1.6, 1.2, flame), rt = clamp((sr - 1.0) / rlen, 0.0, 1.0);
  float ray = max(abs(da * sr - flame * 0.17 * sin(rt * 9.42) * rt) - mix(0.16, 0.12, flame) * (1.0 - rt), sr - 1.0 - rlen);
  return min(sr - 1.0, ray);
}`;

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
${SUN_GLSL}
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
    // a dome raised on its own pedestal, which falls away with it (a pedestal held outside it would end in a cliff
    // at the next cell's edge: S-021's vertical edge); its flanks ease in at the foot
    float dome = sqrt(max(r * r - dx * dx, 0.0)) * smoothstep(1.0, 0.75, abs(dx) / r);
    top = max(top, step(0.3, hashC(c * 2.3)) * (0.5 * hashC(c * 2.9) * dome + flat_ * dome));
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
  // paper, a soft backrun here and there, and a second pass high up that thins into the first with no edge
  vec3 col = glaze(parchment(q), uSkyHorizon / uPaper, 1.0, 0.0, q);
  vec3 tz = uSkyZenith / max(uSkyHorizon, vec3(1e-3));
  // (elevation counted from the sea's horizon, which dips below the eye's level as the eye climbs over the globe)
  float eh = el + sqrt(max(1.0 - pow(${R.toFixed(1)} / max(length(cameraPosition), ${R.toFixed(1)}), 2.0), 0.0));
  float eg = max(eh + 0.025 * wob + 0.004 * fine, 0.0);
  float dz = 0.06 + 0.94 * (1.0 - exp(-eg * 2.4)) * (1.0 + 0.12 * wob);
  // (the second pass laid wet in wet, so it fades out into the first with no edge where it ends: S-029 13)
  float e2 = eh - 0.42 - 0.06 * wob - 0.006 * fine;
  dz += 0.1 * smoothstep(-0.16, 0.2, e2);
  Paper qz = q; // laid evenly: the paper's mottle only breathes in it, never blotches
  qz.mottle = 0.5 + 0.35 * (q.mottle - 0.5);
  qz.bloom = 0.5 + 0.35 * (q.bloom - 0.5);
  col = glaze(col, tz, dz, 0.0, qz);
  // trade-wind cloud over the horizon by day: banks of cumulus heaped along the sky's foot, the paper left white in them
  // with their bellies glazed blue-grey, softening into the haze with distance; never inked (they are far)
  vec3 ax = normalize(cross(uUp, abs(uUp.z) < 0.9 ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0))), ay = cross(uUp, ax);
  float caz = atan(dot(d, ay), dot(d, ax));
  // where the banks stand round the horizon, and how they swell and dwindle away along it: slowly, so a bank never
  // ends in a sheer side (S-021, S-027; whole turns of the horizon, so no seam where the bearing wraps)
  float bank = smoothstep(0.42, 0.78, 0.5 + 0.24 * sin(3.0 * caz + 1.3) + 0.16 * sin(7.0 * caz + 4.1) + 0.1 * sin(12.0 * caz + 0.7));
  // heaped domes, big then small on their shoulders, as a watercolourist rounds a cumulus' head
  float big = cumulusTop(caz, 240.0, 0.7, 1.0), small = cumulusTop(caz + 0.004, 640.0, 0.8, 7.0);
  float top = bank * (big + small * smoothstep(0.002, 0.008, big)), base = 0.004 + 0.002 * wob;
  float cd = min(top - eh, eh - base), cfw = fwidth(cd);
  // (a sea-level view's: from high over the globe the banks would stand on the limb as peaks)
  float low = 1.0 - smoothstep(8.0, 24.0, length(cameraPosition) - ${R.toFixed(1)});
  float cloud = smoothstep(-cfw, cfw, cd) * step(0.002, top) * uSunVis * (1.0 - uGrey) * low;
  if (cloud > 0.0) {
    float belly = 1.0 - smoothstep(0.0, 0.6 * top, eh), rim = 1.0 - smoothstep(0.0, 0.004, cd);
    vec3 cc = glaze(parchment(q), uSlate / uPaper, 0.22 * belly + 0.05, 0.5 * rim, q);
    cc = mix(cc, col, 0.25 + 0.3 * belly + 0.25 * (1.0 - bank)); // into the horizon's haze toward the foot
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
  vec2 sp;
  float sun = sunShape(d, uSunDir, uSunX, uSunY, sp), sr = length(sp);
  // the far hemisphere is masked after the derivatives are taken: a jump in sun there inked its rim, a dotted great
  // circle across the sky
  float sunVis = uSunVis * step(0.0, cs), fs = fwidth(sun);
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
in vec4 aCloud; // the direction from the eye to the cloud's centre (world, unit), its angular half-width (rad; 0 = hidden)
in vec2 aSeed; // its seed, and how high it towers (0 a flat fair-weather cloud … 1 a towering cumulus)
out vec2 vUv;
out vec3 vRight;
out vec3 vUp;
out vec3 vToEye;
out float vSize;
out float vFar;
out vec3 vDir;
flat out float vSeed;
flat out float vTall;
uniform vec3 uUp;
uniform float uNight;
void main() {
  // drawn on the sky itself, far out along its direction: every island, grove, ship and mast stands in front of it and
  // hides it, so no cloud ever sits on the action or swallows a grove; nearer (larger) clouds a little in front of farther
  float dist = ${CLOUDS.dist.toFixed(1)} - 400.0 * min(aCloud.w, 0.25);
  vec3 toEye = -aCloud.xyz, right = normalize(cross(uUp, toEye) + vec3(1e-5, 0.0, 0.0));
  vUv = position.xy;
  vRight = right;
  vUp = cross(toEye, right);
  vToEye = toEye;
  vSize = aCloud.w * 80.0; // pen and paper scale: hatching keeps one pitch on the page whatever the cloud's size
  vFar = 1.0 - smoothstep(0.025, 0.11, aCloud.w);
  vSeed = aSeed.x;
  vTall = aSeed.y;
  // by day the farthest, low on the horizon, drawn wider than tall: low, distant banks, flat along their bases
  vec3 p = cameraPosition + aCloud.xyz * dist + (right * position.x * (1.0 + 0.8 * vFar * (1.0 - uNight)) + vUp * position.y) * aCloud.w * dist;
  vDir = p - cameraPosition;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`;

// a cumulus as an engraver draws it from life (S-027): a few towers of unequal size heaped on one flat base, each a
// leaning stack of rounded masses, crowded by billows of many sizes (some proud of the outline, some heaped across the
// face), so no outline is an even scallop and no part floats free as a disc; outlined with a broken pen line found on
// the shadowed side and lost on the lit; a fine line where one billow turns under the next; strokes following each
// billow round in its shade and laid level along the base; a flat, hazy belly on a level base that thins into the sky;
// opaque, so a nearer cloud hides the one behind it; flushed by a low sun, silver by the moon; the farther (smaller,
// lower) the paler
const CLOUD_FRAGMENT = /* glsl */ `
in vec2 vUv;
in vec3 vRight;
in vec3 vUp;
in vec3 vToEye;
in float vSize;
in float vFar;
in vec3 vDir;
flat in float vSeed;
flat in float vTall;
uniform vec3 uSunDir;
uniform vec3 uSunX;
uniform vec3 uSunY;
uniform float uSunVis;
uniform float uGlowAmt;
uniform float uGrey;
uniform vec3 uSlate;
uniform float uCloudVis;
// the shade of a cloud under a low sun: violet-grey, the sky's blue and the glow's rose mixed in it
const vec3 DUSK_VIOLET = ${glslLinear(hex('#9a809e'))};
const vec3 PALE_GOLD = ${glslLinear(hex('#f5dc96'))};
${PEN_GLSL}
${SUN_GLSL}
// the cauliflower along a billow's edge: small round billows of uneven height and width (t in cells), a cusp between
// each, some cells left plain; 0…1
float scallop(float t, float seed) {
  float i = floor(t), x = fract(t) * 2.0 - 1.0, h = hash11(i * 3.17 + seed);
  return step(0.22, h) * (0.35 + 0.65 * h) * sqrt(max(1.0 - x * x, 0.0));
}
float along1(float t, float seed) { // smooth 0…1 noise along a contour
  float i = floor(t), f = fract(t);
  return mix(hash11(i * 1.7 + seed), hash11((i + 1.0) * 1.7 + seed), f * f * (3.0 - 2.0 * f));
}
// a few fine strokes flicked into a cloud's shade, along c.y: about 6 CSS px apart, each broken into short tapered
// lengths with half of them left out (cdx, cdy: dFdx(c), dFdy(c))
float flicks(vec2 c, vec2 cdx, vec2 cdy, float seed) {
  float px = max(abs(cdx.x) + abs(cdy.x), 1e-6), S = 6.0 * px * uRenderPx, i = floor(c.x / S + 0.5);
  float y = c.y / (4.0 * S) + 7.0 * hash11(i * 0.713 + seed), j = floor(y), fy = fract(y);
  float keep = step(0.5, hash11(i * 1.37 + j * 0.53 + seed)), taper = sqrt(max(sin(3.14159265 * fy), 0.0));
  return keep * clamp(0.32 * uRenderPx * taper - abs(c.x - i * S) / px + 0.5, 0.0, 1.0);
}
float sminC(float a, float b, float k) { float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0); return mix(b, a, h) - k * h * (1.0 - h); }
const int HEADS = 4, BILLOWS = 36;
void main() {
  vec2 uv = vUv, duvx = dFdx(uv), duvy = dFdy(uv);
  // the condensation level: one flat base under the whole heap, only breathing a little along its length
  float base = -0.32 + 0.014 * (along1(uv.x * 7.0, vSeed * 5.0) - 0.5);
  if (uv.y < base - max(0.03, 3.0 * max(length(duvx), length(duvy)))) discard; // (nothing hangs below the base)
  // the heads: a few towers of unequal size shouldering one another along the base, one within built higher than the
  // rest; the near clouds tower, the far are mostly low fair-weather heaps (the sky's own choice, vTall)
  float tall = vTall, peak = 0.6 + 1.8 * hash11(vSeed * 3.1);
  vec3 hd[HEADS];
  float run = 0.0, lo = 0.0, hi = 0.0, up = 0.0;
  for (int i = 0; i < HEADS; i++) {
    float fi = float(i), h1 = hash11(vSeed * 17.0 + fi * 3.7), h2 = hash11(vSeed * 5.3 + fi * 11.1);
    float h3 = hash11(vSeed * 2.3 + fi * 5.9), env = exp(-(fi - peak) * (fi - peak) / 1.4);
    float r = (0.07 + 0.14 * h2) * (0.6 + 0.6 * env);
    if (i > 0) run += (hd[i - 1].z + r) * (0.45 + 0.4 * h1);
    hd[i] = vec3(run, r * (0.25 + 0.55 * h3) + (0.02 + 0.5 * tall) * env, r);
    up = max(up, hd[i].y + r);
  }
  lo = hd[0].x - hd[0].z;
  hi = hd[HEADS - 1].x + hd[HEADS - 1].z;
  float sc = min(min(1.0, 1.66 / (hi - lo)), 0.7 / up), mid = 0.5 * (lo + hi) + 0.08 * (hash11(vSeed * 8.1) - 0.5);
  // each head a rounded crown on a column standing on the base; a low shoulder along the base joins them into one heap
  float sd = 1e3, zw = -1e3, z2 = -1e3, wr = 1.0, wy = 0.0, wi = 0.0, ms = 1e3;
  vec2 wc = vec2(0.0);
  vec4 nb = vec4(0.0, 0.0, 1.0, 0.0); // the mass whose edge is nearest: its centre, radius and the run along it
  for (int i = 0; i < HEADS; i++) {
    hd[i] = vec3((hd[i].x - mid) * sc, base + hd[i].y * sc, hd[i].z * sc);
    // a tower is a stack of rounded masses pushed a little aside, the crown the broadest, never a straight column;
    // it is shaded as one mass (from its leaning axis), so the stack never reads as balls set one on another
    vec2 foot = vec2(0.0);
    for (int k = 0; k < 3; k++) {
      float fk = float(k), t = fk * 0.5, g1 = hash11(vSeed * 9.7 + float(i) * 4.1 + fk * 1.3);
      float r = hd[i].z * mix(0.82 + 0.2 * g1, 1.0, t);
      vec2 a = vec2(hd[i].x + (g1 - 0.5) * 0.7 * hd[i].z * (1.0 - t), mix(base + 0.3 * r, hd[i].y, t));
      if (k == 0) foot = a;
      float sk = length(uv - a) - r;
      sd = sminC(sd, sk, 0.07 * sc);
      if (sk < ms) { ms = sk; nb = vec4(a, r, 0.0); }
    }
    vec2 ab = hd[i].xy - foot, a = foot + ab * clamp(dot(uv - foot, ab) / max(dot(ab, ab), 1e-6), 0.0, 1.0);
    float r = hd[i].z, dd = length(uv - a), s = dd - r, z = sqrt(max(r * r - dd * dd, 0.0)) - 0.35 * (hd[i].y - base);
    if (s < 0.0 && z > zw) { z2 = zw; zw = z; wc = a; wr = r; wi = float(i); }
    else if (s < 0.0) z2 = max(z2, z);
  }
  float shR = (0.055 + 0.04 * hash11(vSeed * 6.7)) * sc / 0.8;
  {
    vec2 a = vec2(clamp(uv.x, hd[0].x, hd[HEADS - 1].x), base + 0.4 * shR), dv = uv - a;
    float dd = length(dv), s = dd - shR, z = sqrt(max(shR * shR - dd * dd, 0.0)) + 0.02;
    sd = sminC(sd, s, 0.04 * sc);
    if (s < ms) { ms = s; nb = vec4(a, shR, a.x); }
    if (s < 0.0 && z > zw) { z2 = zw; zw = z; wc = a; wr = shR; wy = 0.0; wi = 9.0; }
    else if (s < 0.0) z2 = max(z2, z);
  }
  // the billows crowding each head's crown and shoulders, many small to a few large, some standing proud of the
  // outline and some heaped across the face in front, never evenly spaced
  for (int i = 0; i < BILLOWS; i++) {
    float fi = float(i), b1 = hash11(vSeed * 13.1 + fi * 7.3), b2 = hash11(vSeed * 3.7 + fi * 2.9);
    float b3 = hash11(vSeed * 6.1 + fi * 1.7), b4 = hash11(vSeed * 1.9 + fi * 5.3);
    int j = b3 < 0.3 ? int(peak + 0.5) : int(mod(fi + floor(b2 * 2.0), float(HEADS)));
    vec3 p = hd[j];
    float side = float(j) - 1.5, th = (b1 - 0.5) * 2.9 + 0.3 * side;
    if (b4 > 0.62) { // on the shoulder of the tower below the crown, out to one side
      float rm = 0.9 * p.z;
      p = vec3(p.x, mix(base + 0.3 * rm, p.y, 0.5), p.z);
      th = sign(b1 - 0.5 + 0.2 * side) * (1.0 + 0.6 * b2);
    }
    float rs = p.z * (0.1 + 0.45 * b2 * b2), sink = 0.25 + 0.4 * b4;
    vec2 c = p.xy + (p.z - sink * rs) * vec2(sin(th), cos(th));
    rs = min(rs, min(0.94 - abs(c.x), 0.54 - c.y));
    rs = min(rs, max((c.y - base) / 0.55, 0.0));
    rs *= step(0.022, rs); // (none too small to draw: a speck, not a billow)
    vec2 dv = uv - c;
    float dd = length(dv), s = dd - rs, rr = p.z - sink * rs;
    float z = sqrt(max(rs * rs - dd * dd, 0.0)) + 0.8 * sqrt(max(p.z * p.z - rr * rr, 0.0)) - 0.35 * (p.y - base);
    sd = sminC(sd, s, 0.01 * sc);
    if (s < ms) { ms = s; nb = vec4(c, rs, 0.0); }
    if (s < 0.0 && z > zw) { z2 = zw; zw = z; wc = c; wr = rs; wi = 20.0 + fi; }
    else if (s < 0.0) z2 = max(z2, z);
  }
  // by day lit as an illustrator sets the light: from the sun's side of the plate and from above, whether the sun stands
  // before or behind the cloud, so the crowns are lit and the base in shade; a low sun lights them from the side and a
  // little from below
  vec2 s2 = vec2(dot(uSun, vRight), dot(uSun, vUp));
  float gold = smoothstep(0.05, 0.5, uGlowAmt) * (1.0 - uNight); // the low sun's hour
  vec2 l2 = normalize(s2 * inversesqrt(max(dot(s2, s2), 1e-6)) + vec2(0.0, mix(0.8, -0.15, gold)));

  // the cauliflower (S-029 3): small billows of uneven size breaking the outline, crowded on the lit crowns, fewer on the
  // shaded flank, none along the flat base, so no flank runs straight and no crown is a smooth heap; never finer than
  // the pen can draw (on a far cloud they merge into its heads)
  vec2 dm = uv - nb.xy;
  float pxu = max(length(duvx), length(duvy)) * uRenderPx, cell = clamp(7.0 * pxu, 0.03, 0.08);
  float ct = (atan(-dm.x, dm.y) * nb.z + nb.w) / cell;
  ct += 1.6 * along1(ct * 0.31, vSeed * 2.7); // (cells stretched and crowded by turns: no even scallop)
  float cauli = max(scallop(ct, vSeed * 7.1), 0.75 * scallop(ct * 1.7 + 0.43, vSeed * 3.3));
  float litSide = smoothstep(-0.4, 0.6, dot(dm / max(length(dm), 1e-5), l2));
  float bump = cell * 0.6 * smoothstep(base + 0.03, base + 0.18, uv.y) * (0.45 + 0.55 * litSide) * (1.0 - 0.8 * vFar);
  sd -= bump * (cauli - 0.3);

  // where one billow turns under the next: the depth between the two nearest surfaces closes to nothing
  float crease = penLine(zw - z2, 0.7) * step(-1e2, z2) * smoothstep(-0.1, -0.5, (uv.y - wc.y) / wr)
    * smoothstep(0.35, 0.6, along1(atan(uv.y - wc.y, uv.x - wc.x) * 3.0, vSeed + wi)); // (broken: a turn, not a ring)

  // the form: each billow rounded on its own, the whole heap turned as one mass, the belly flat and facing down
  vec2 dvw = uv - wc;
  float dw = max(length(dvw), 1e-5);
  vec2 dir = dvw / dw;
  vec2 nl = zw > -1e2 ? dvw / wr : vec2(0.0);
  vec2 n2 = 0.4 * nl + 0.6 * vec2(uv.x / 0.85, (uv.y - base - 0.22) / 0.5);
  // the shade under the heap grades up into its body over a ragged band, never a ruled line, and climbs into the
  // undersides of the lowest billows, so its upper edge follows their rounds
  float lift = uv.y - base, band = 0.2 + 0.12 * along1(uv.x * 4.0 + 3.0, vSeed * 2.0);
  float under = pow(smoothstep(band, 0.0, lift), 1.4);
  under = max(under, 0.5 * smoothstep(-0.2, -0.85, nl.y) * smoothstep(0.42, 0.1, lift));
  n2 = mix(n2, vec2(0.25 * n2.x, -0.9), under);
  n2 *= min(1.0, 0.97 * inversesqrt(max(dot(n2, n2), 1e-6)));
  float nz = sqrt(max(1.0 - dot(n2, n2), 0.05));
  vec3 n = normalize(vRight * n2.x + vUp * n2.y + vToEye * nz);
  float ndl = mix(dot(n, uSun), dot(n2, l2) + 0.1 * nz - 0.05, 1.0 - uNight), tone = clamp(lightTone(ndl, nz) + 0.3 * under, 0.0, 1.0);
  Paper q = paperAt(vec3(uv * vSize, vSeed * 37.0), vec3(0.0, 0.0, 1.0), 0.0);
  // the sun's side in the plate, and the angle round the billow measured from the side away from it (so the seam of
  // the strokes that follow the billow round lies on its lit side, where none are laid)
  vec2 away = -s2 * inversesqrt(max(dot(s2, s2), 1e-6));
  if (dot(s2, s2) < 1e-4) away = vec2(0.0, -1.0);
  float ang = atan(away.x * dir.y - away.y * dir.x, dot(away, dir));
  // strokes following the billow's round: across them its radius, along them its arc (the column's height continues it)
  vec2 rc = vec2(dw, ang * wr + wy) * vSize;
  vec2 rdx = vec2(dot(dir, duvx), (dir.x * duvx.y - dir.y * duvx.x) * wr / dw + (wy != 0.0 ? duvx.y : 0.0)) * vSize;
  vec2 rdy = vec2(dot(dir, duvy), (dir.x * duvy.y - dir.y * duvy.x) * wr / dw + (wy != 0.0 ? duvy.y : 0.0)) * vSize;
  // (laid near level, as the engraver lays a cloud's shade: along the base, curving round the flank)
  vec2 hc = rot2(1.45 + 0.35 * uv.x + 0.2 * hash11(vSeed * 7.7)) * uv * vSize, hx = dFdx(hc), hy = dFdy(hc);
  float fw = fwidth(sd);
  float pen = penLine(sd, mix(0.8, 1.9, tone) * (1.0 - 0.4 * vFar)), fine = penLine(sd, mix(1.1, 0.5, vFar));
  float onBase = smoothstep(base + 0.02, base + 0.09, uv.y);
  float arc = ang * wr * 14.0 + wi * 7.0;
  // the foot: the base is a level line into the haze, softly, a little ragged
  float foot = smoothstep(base - 0.012, base + 0.03 + 0.03 * vFar, uv.y);
  // a lost edge on the lit side, a found one on the shaded
  float litEdge = smoothstep(-0.1, 0.5, ndl);
  float inside = 1.0 - smoothstep(-fw * (1.0 + 2.5 * litEdge), fw, sd);

  // by night, as the first pass drew them: moonlit, the shade hatched, silver on the side the moon lights
  vec3 mc = sunGlaze(shadeGlaze(parchment(q), tone, q), ndl, tone);
  mc = mix(mc, glaze(mc, uSkyGlow / uPaper, 0.9, 0.0, q), uGlowAmt * (0.3 + 0.7 * max(under, smoothstep(0.0, 0.8, ndl))));
  mc = mix(mc, glaze(mc, uSlate, 0.5, 0.0, q), 0.4 * under * (1.0 - uNight));
  mc = mix(mc, glaze(mc, uSlate, 0.8, 0.0, q), uGrey);
  float ht = min(smoothstep(0.58, 1.0, tone), 0.6) * (1.0 - 0.6 * vFar); // one family of strokes, never crossed
  mc = mix(mc, hatchInk(0.6 * ht), hatching(hc, hx, hy, ht, vSeed * 13.0) * 0.75 * (1.0 - 0.4 * vFar));
  float lit = smoothstep(0.3, 0.95, ndl) * uNight;
  mc = mix(mc, uSilver, 0.7 * hatching(rot2(0.6) * hc, rot2(0.6) * hx, rot2(0.6) * hy, lit * 0.3, vSeed + 11.0));
  mc = mix(mc, uSilver, lit * 0.5 * (1.0 - smoothstep(0.0, 0.06, -sd)));
  mc = mix(mc, uSkyHorizon * parchment(q) / uPaper, 0.4 * vFar);
  float open = smoothstep(0.3, 0.45, along1(arc, vSeed * 3.0) + 0.4 * tone - 0.1);
  float nInk = max(pen * open * onBase, 0.6 * crease * smoothstep(0.3, 0.6, tone)) * (1.0 - 0.5 * vFar);
  mc = mix(mc, uInk, nInk);
  float na = max(inside * foot * (0.25 + 0.75 * smoothstep(0.0, 0.14, lift)) * (1.0 - 0.4 * vFar), nInk);

  // by day (S-024, S-025, S-027): the lit crowns left as paper, a pale warm breath on them; the side turned from the
  // sun and the flat base modelled in a cool transparent wash, pooled a little darker where it dried against the paper;
  // fine strokes following each billow round in its deepest shade and laid level along the base; a fine pen line,
  // found on the shaded side and lost on the lit; opaque, so the nearer hides the farther. The hour's colour over all.
  // The farther (smaller, lower) the paler and less drawn, until near the horizon they are hazy banks in the hour's
  // glow, never dark shapes on a skyline
  float turned = 1.0 - smoothstep(-0.3, 0.25, ndl);
  float shade = clamp(0.8 * turned + 0.75 * under, 0.0, 1.0) * (1.0 - 0.5 * vFar);
  // a cloud toward a low sun is lit through: its face in shade, its edge on the sun's side burning gold
  float toSun = smoothstep(0.55, 0.95, dot(uSun, -vToEye)) * gold;
  shade = mix(shade, max(shade, 0.65), toSun);
  float cool = shade * (1.0 - 0.3 * gold);
  // (pooled where the wash dried against the paper: at the edge of the turned side's shade, following the billows)
  float pool = smoothstep(0.18, 0.34, 0.8 * turned + 0.1 * (q.bloom - 0.5)) * (1.0 - smoothstep(0.34, 0.5, 0.8 * turned));
  // (cool: the slate and the sky's own blue, reflected into the shade; under a low sun, rose-violet, the glow in it)
  vec3 dusk = mix(DUSK_VIOLET, uSkyGlow, 0.4) / uPaper;
  vec3 dc = glaze(parchment(q), mix(mix(uSlate, uSkyHorizon / uPaper, 0.5), dusk, gold), 0.5 * cool, 0.5 * pool, q);
  dc = wash(dc, uShade, (0.22 * cool + 0.14 * under) * (1.0 - 0.5 * gold));
  // the low sun's warmth: amber and pale gold on the faces it lights, from the side and below, only a breath in the shade
  float warm = smoothstep(-0.1, 0.7, ndl) * (1.0 - 0.7 * shade);
  dc = mix(dc, glaze(dc, mix(uSkyGlow, PALE_GOLD, 0.35 * warm) / uPaper, 0.9, 0.0, q), max(uGlowAmt, gold) * (0.2 + 0.8 * warm));
  float rimLit = toSun * (1.0 - smoothstep(0.0, 0.05, -sd)) * (0.3 + 0.7 * litSide);
  dc = mix(dc, glaze(parchment(q), mix(PALE_GOLD, uSkyGlow, 0.45) / uPaper, 0.8, 0.0, q), rimLit);
  dc = sunGlaze(dc, ndl, shade);
  dc = mix(dc, glaze(dc, uSlate, 0.8, 0.0, q), uGrey);
  float hm = smoothstep(0.45, 0.9, shade) * (1.0 - vFar) * (1.0 - gold * 0.3);
  float strokes = mix(flicks(rc, rdx, rdy, vSeed * 13.0 + wi), flicks(hc, hx, hy, vSeed * 13.0), max(under, step(wi, 19.5)));
  dc = mix(dc, hatchInk(0.1), strokes * hm * 0.4);
  dc = mix(dc, uSkyHorizon * parchment(q) / uPaper, 0.55 * vFar + 0.2 * under * vFar);
  // the pen: a fine broken line round the whole cloud, firm on the shaded side, light and often lost on the lit crowns;
  // a fine line where one billow turns under the next
  float found = mix(0.4, 1.0, smoothstep(0.3, 0.85, turned)) * smoothstep(0.3, 0.46, along1(arc * 1.3, vSeed * 3.0 + 1.0) + 0.25 * turned);
  float dInk = max(fine * found * onBase * 0.75, 0.4 * crease * smoothstep(0.15, 0.6, shade + 0.25) * onBase) * (1.0 - 0.7 * vFar);
  dc = mix(dc, hatchInk(0.35), dInk);
  float da = inside * foot * (0.97 - 0.12 * vFar);

  vec3 col = mix(dc, mc, uNight);
  float a = mix(da, na, uNight) * uCloudVis;
  // the sun stands over a cloud drifting across it, a gold-leaf emblem as on a chart's border (so the low sun's frames
  // keep their sun, S-028): the cloud left out where its disc, rays and their pen line are drawn, and lit round it as
  // the sun shines through a cloud's thin edge
  vec3 dv = normalize(vDir);
  vec2 ssp;
  float sunS = sunShape(dv, uSunDir, uSunX, uSunY, ssp), fss = fwidth(sunS);
  float sunOn = uSunVis * step(0.0, dot(dv, uSunDir));
  col = mix(col, glaze(parchment(q), PALE_GOLD / uPaper, 0.6, 0.0, q), sunOn * 0.7 * (1.0 - smoothstep(1.2, 4.5, length(ssp))));
  a *= 1.0 - sunOn * (1.0 - smoothstep(1.5 * fss * uRenderPx, 3.0 * fss * uRenderPx, sunS));
  if (a < 0.004) discard;
  writeVeil(col, a);
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
  private readonly az: number[] = [];
  private readonly bases: number[] = [];
  private readonly widths: number[] = [];
  /** The order the clouds come in as the sky fills (a squall brings them all, a calm leaves few), near and far mixed. */
  private readonly rank: number[] = [];
  private readonly shown: number[] = [];
  private readonly rng: () => number;
  private clock = Number.NaN;
  private readonly u = {
    uUp: { value: new THREE.Vector3() }, uSunDir: { value: new THREE.Vector3() }, uSunX: { value: new THREE.Vector3() },
    uSunY: { value: new THREE.Vector3() }, uMoonDir: { value: new THREE.Vector3() }, uMoonX: { value: new THREE.Vector3() },
    uMoonY: { value: new THREE.Vector3() }, uCelestial: { value: new THREE.Matrix3() }, uGlowAmt: { value: 0 },
    uSunVis: { value: 0 }, uMoonVis: { value: 0 }, uStarVis: { value: 0 }, uGrey: { value: 0 }, uAurora: { value: 0 },
    uSlate: { value: transmittanceVec(STORM_SLATE) }, uCloudVis: { value: 1 },
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
    // a field of cumulus over the sea, one level base seen in perspective (S-029 3): many far, low and small, fewer
    // nearer, higher and larger, a few great towers overhead; each its own size, the near ones towering, the far mostly
    // low fair-weather heaps. Farthest first (drawn first, so the nearer lie over them). Every depth is spread round
    // the horizon, unevenly, and so is every share of them the sky shows as it fills, so whichever way the eye turns it
    // sees near and far clouds (S-028 8)
    const n = CLOUDS.count, form = new Float32Array(n * 2), deal = (): number[] => {
      const o = Array.from({ length: n }, (_, i) => i); // (each depth, bearing and turn dealt once: no lattice, no row)
      for (let i = n - 1; i > 0; i--) {
        const j = Math.floor(this.rng() * (i + 1));
        [o[i], o[j]] = [o[j], o[i]];
      }
      return o;
    }, bearing = deal(), turn = deal();
    for (let k = 0; k < n; k++) {
      const r = (k + 0.5 + 0.9 * (this.rng() - 0.5)) / n, b = CLOUDS.low + (CLOUDS.high - CLOUDS.low) * r ** CLOUDS.crowd;
      const big = this.rng(), size = CLOUDS.wide[0] + (CLOUDS.wide[1] - CLOUDS.wide[0]) * big;
      this.az.push((2 * Math.PI * (bearing[k] + this.rng())) / n);
      this.bases.push(b);
      this.widths.push(CLOUDS.widest * Math.tanh((b * size) / CLOUDS.widest)); // (never all one size at the widest)
      this.shown.push(0);
      this.rank.push((turn[k] + this.rng()) / n);
      form[k * 2] = this.rng() * 10;
      form[k * 2 + 1] = Math.min(0.08 + 0.15 * this.rng() + 0.4 * big + 0.5 * smoothstep(b, 0.03, 0.18) * Math.sqrt(this.rng()), 1);
    }
    g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(form, 2));
    g.instanceCount = n;
    this.clouds = new THREE.Mesh(g, inkMaterial(style, {
      vertexShader: CLOUD_VERTEX, fragmentShader: CLOUD_FRAGMENT, uniforms: this.u, side: THREE.DoubleSide, veil: true,
    }));
    this.clouds.renderOrder = 1; // over the dome
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
    this.drift(dt, w, first, eye);
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

  /**
   * Turn the clouds across the sky on the wind, each as fast as its distance allows; squalls bring the near ones in,
   * calms leave only the far. Each base stands its elevation above the sea's horizon, which dips as the eye climbs.
   */
  private drift(dt: number, w: SkyWeather, first: boolean, eye: THREE.Vector3): void {
    const s = this.lights.sky, a = this.cloudAttr.array as Float32Array, er = eye.length();
    const dip = Math.acos(Math.min(R / Math.max(er, R), 1)), n = CLOUDS.count;
    this.u.uCloudVis.value = 1 - smoothstep(er - R, CLOUDS.fade[0], CLOUDS.fade[1]);
    // by day a fair sky mostly clear (S-024), most of its clouds far and small; by night about as many as the first
    // pass drew
    const fair = 0.7 - 0.36 * this.style.uniforms.uNight.value;
    const cover = Math.min(Math.max(fair + (1 - fair) * w.squall - 0.45 * fair * w.calm / 0.62, 0.08), 1);
    for (let k = 0; k < n; k++) {
      const b = this.bases[k], wd = this.widths[k];
      let az = this.az[k];
      const across = -w.wind.dot(s.east) * Math.sin(az) + w.wind.dot(s.north) * Math.cos(az);
      az = this.az[k] = (az + (dt * CLOUDS.drift * across * b) / CLOUDS.base) % (Math.PI * 2);
      const target = this.rank[k] < cover ? 1 : 0;
      this.shown[k] = first ? target : this.shown[k] + Math.max(-dt * 0.2, Math.min(dt * 0.2, target - this.shown[k]));
      const el = b - dip + 0.32 * wd, ce = Math.cos(el);
      tmp.copy(s.east).multiplyScalar(Math.cos(az) * ce).addScaledVector(s.north, Math.sin(az) * ce).addScaledVector(s.up, Math.sin(el));
      a[k * 4] = tmp.x;
      a[k * 4 + 1] = tmp.y;
      a[k * 4 + 2] = tmp.z;
      a[k * 4 + 3] = wd * this.shown[k];
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

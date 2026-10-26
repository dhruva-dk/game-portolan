// The one style module's shader half: the GLSL every material, effect and interface element draws with, the shared
// uniforms that carry the hour and the generated textures, and the material factories. A material never invents its
// own paper, ink, hatching or wash: it calls these, so the whole frame is one illustrator's hand.
//
// Every scene material writes two targets (render/pipeline.ts): the colour it painted (display sRGB; alpha is the
// "veil", how much of the ink composite's lines may show through) and an aux target the composite finds lines in:
// view-space normal (octahedral), an ink id (material boundaries get thin lines, sky is 0) and an ink weight.
//
// Anchoring. Paper, hatching and granulation are sampled in an anchor frame that moves with the surface: the planet
// frame (world space: the planet is centred at the origin and never moves) for sea and terrain, the object frame for
// ships and props, the view direction for the sky. Grain size is held steady on screen by choosing, per pixel, the
// power-of-two octave of the anchor frame whose tile spans PAPER_TILE_CSS CSS px, and cross-fading to the next: the
// grain breathes as the camera dollies but never slides. Hatching nests its octaves the same way (every second line
// of one octave is a line of the next), so strokes are preserved as they thin out with distance.
import * as THREE from 'three';
import {
  PIGMENTS, hourPalette, toLinear, transmittance, hex, TEAM_KEEP, WATERS_COVER, TRAIL_DENSITY,
  type RGB, type HourPalette,
} from './palette.ts';
import { createStyleTextures, type StyleTextures } from './textures.ts';

/** On-screen size of one paper-grain tile, CSS px. */
export const PAPER_TILE_CSS = 280;
/** Finest hatch spacing, CSS px; strokes thin out to twice this before the octave changes. */
export const HATCH_SPACING_CSS = 4.6;
/** World units per tile of the foxing and stain marks: two incommensurate scales, so the pattern never repeats. */
export const MARK_SCALES: readonly [number, number] = [41, 67];
/** How many lamps (render/light.ts) lay their warm pools through candle() at once: the nearest to the eye. */
export const MAX_GLOWS = 8;

const glslVec3 = (c: RGB) => `vec3(${c.map((x) => x.toFixed(5)).join(', ')})`;
const lin = (c: RGB) => glslVec3(toLinear(c));

// ---------------------------------------------------------------------------------------------------------------
// Shared uniforms

export interface StyleUniforms {
  [name: string]: THREE.IUniform;
  tPaper: THREE.IUniform<THREE.Texture>;
  tMarks: THREE.IUniform<THREE.Texture>;
  uSun: THREE.IUniform<THREE.Vector3>; // world direction toward the sun (the moon by night)
  uPaper: THREE.IUniform<THREE.Vector3>; // linear: bare parchment under the hour's light
  uInk: THREE.IUniform<THREE.Vector3>; // linear
  uShade: THREE.IUniform<THREE.Vector3>; // transmittance of the shade glaze
  uSunTint: THREE.IUniform<THREE.Vector3>; // transmittance of the lit-side glaze
  uLow: THREE.IUniform<number>; // 0 with the sun high (and by night) … 1 with it low: raking warm light, cool shade, cast shade
  uSilver: THREE.IUniform<THREE.Vector3>; // linear: night highlight ink
  uNight: THREE.IUniform<number>;
  uRenderPx: THREE.IUniform<number>; // render pixels per CSS px (device pixel ratio × render scale)
  uTime: THREE.IUniform<number>; // render clock, seconds; it stops while the chart is open
  uSkyZenith: THREE.IUniform<THREE.Vector3>; // linear: the hour's sky wash high and low, and its glow toward a low sun
  uSkyHorizon: THREE.IUniform<THREE.Vector3>;
  uSkyGlow: THREE.IUniform<THREE.Vector3>;
  uGlows: THREE.IUniform<THREE.Vector4[]>; // the nearest lamps (render/light.ts): world position, reach (0 = unlit)
}

export interface Style {
  readonly textures: StyleTextures;
  /** Spread into every style material's uniforms; the members are shared by reference. */
  readonly uniforms: StyleUniforms;
  /** The palette of the hour last set. */
  readonly palette: HourPalette;
  setHour(hour: number): void;
}

export function createStyle(): Style {
  const textures = createStyleTextures();
  const v = () => new THREE.Vector3();
  const uniforms: StyleUniforms = {
    tPaper: { value: textures.paper },
    tMarks: { value: textures.marks },
    uSun: { value: new THREE.Vector3(0, 1, 0) },
    uPaper: { value: v() },
    uInk: { value: v() },
    uShade: { value: v() },
    uSunTint: { value: v() },
    uLow: { value: 0 },
    uSilver: { value: v() },
    uNight: { value: 0 },
    uRenderPx: { value: 1 },
    uTime: { value: 0 },
    uSkyZenith: { value: v() },
    uSkyHorizon: { value: v() },
    uSkyGlow: { value: v() },
    uGlows: { value: Array.from({ length: MAX_GLOWS }, () => new THREE.Vector4()) },
  };
  const style = {
    textures,
    uniforms,
    palette: hourPalette(12),
    setHour(hour: number) {
      const p = hourPalette(hour);
      style.palette = p;
      uniforms.uPaper.value.fromArray(toLinear(p.paper));
      uniforms.uInk.value.fromArray(toLinear(p.ink));
      uniforms.uShade.value.fromArray(toLinear(p.shade));
      uniforms.uSunTint.value.fromArray(toLinear(p.sunTint));
      uniforms.uSilver.value.fromArray(toLinear(p.silver));
      uniforms.uNight.value = p.night;
      uniforms.uSkyZenith.value.fromArray(toLinear(p.skyZenith));
      uniforms.uSkyHorizon.value.fromArray(toLinear(p.skyHorizon));
      uniforms.uSkyGlow.value.fromArray(toLinear(p.skyGlow));
    },
  };
  style.setHour(12);
  return style;
}

/** Linear-light vector of an sRGB colour, for uniforms. */
export function linearVec(c: RGB): THREE.Vector3 {
  return new THREE.Vector3().fromArray(toLinear(c));
}

/** Wash transmittance of a pigment authored as its appearance on midday parchment, for uniforms. */
export function transmittanceVec(c: RGB): THREE.Vector3 {
  return new THREE.Vector3().fromArray(transmittance(c));
}

// ---------------------------------------------------------------------------------------------------------------
// GLSL

/** Colour arithmetic and hashing, for any shader (the composite and the interface include it too). */
export const COLOUR_GLSL = /* glsl */ `
vec3 toLinear(vec3 c) { return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }
vec3 toDisplay(vec3 c) {
  c = clamp(c, 0.0, 1.0);
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}
// a transparent wash of transmittance t at density d over ground g (linear light): g · t^d
vec3 wash(vec3 g, vec3 t, float d) { return g * pow(max(t, vec3(1e-4)), vec3(max(d, 0.0))); }
float hash11(float p) { p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
float hash12(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
mat2 rot2(float a) { float c = cos(a), s = sin(a); return mat2(c, s, -s, c); }
`;

const UNIFORMS_GLSL = /* glsl */ `
uniform sampler2D tPaper;
uniform sampler2D tMarks;
uniform vec3 uSun;
uniform vec3 uPaper;
uniform vec3 uInk;
uniform vec3 uShade;
uniform vec3 uSunTint;
uniform float uLow;
uniform vec3 uSilver;
uniform float uNight;
uniform float uRenderPx;
uniform float uTime;
uniform vec3 uSkyZenith;
uniform vec3 uSkyHorizon;
uniform vec3 uSkyGlow;
uniform vec4 uGlows[${MAX_GLOWS}];
`;

/** Everything a style shader draws with. Requires the uniforms above (included by inkMaterial and uiMaterial). */
export const STYLE_GLSL = /* glsl */ `
${UNIFORMS_GLSL}
${COLOUR_GLSL}
const float PAPER_TILE = ${PAPER_TILE_CSS.toFixed(1)};
const float HATCH_SPACING = ${HATCH_SPACING_CSS.toFixed(2)};
const vec2 MARK_SCALES = vec2(${MARK_SCALES[0].toFixed(1)}, ${MARK_SCALES[1].toFixed(1)});
const vec3 FOX_T = ${glslVec3(transmittance(hex('#9a6a42')))};
const vec3 STAIN_T = ${glslVec3(transmittance(hex('#c9a46c')))};
const vec3 SEPIA_T = ${glslVec3(transmittance(PIGMENTS.sepia))};

vec3 triWeights(vec3 n, float k) { vec3 w = pow(abs(n), vec3(k)); return w / (w.x + w.y + w.z); }
vec4 triLod(sampler2D t, vec3 p, vec3 w, float lod) {
  return textureLod(t, p.yz, lod) * w.x + textureLod(t, p.zx, lod) * w.y + textureLod(t, p.xy, lod) * w.z;
}
vec4 tri(sampler2D t, vec3 p, vec3 w) { return texture(t, p.yz) * w.x + texture(t, p.zx) * w.y + texture(t, p.xy) * w.z; }
// tri with explicit gradients (dx, dy: dFdx(p), dFdy(p) taken outside), so it may sit in a branch (WP30b).
vec4 triGrad(sampler2D t, vec3 p, vec3 w, vec3 dx, vec3 dy) {
  return textureGrad(t, p.yz, dx.yz, dy.yz) * w.x + textureGrad(t, p.zx, dx.zx, dy.zx) * w.y + textureGrad(t, p.xy, dx.xy, dy.xy) * w.z;
}

// ---- paper -----------------------------------------------------------------------------------------------
struct Paper { float fibre; float grain; float mottle; float bloom; float fox; float stain; };

// The parchment at anchor-frame point p with anchor-frame normal n. marks scales the stains and foxing (1 on the
// planet; less on small objects, where a spot would look like damage). Call outside any branch (derivatives).
// The paper's grain fields (fibre, grain, mottle, bloom) at p, triplanar weights w.
vec4 paperGrain(vec3 p, vec3 w) {
  float upx = max(length(dFdx(p)), length(dFdy(p)));             // anchor units per render pixel
  float k = log2(max(upx * uRenderPx * PAPER_TILE, 1e-5));
  float lo = floor(k), f = k - lo, s0 = exp2(lo);
  float lod = max(log2(512.0 / (PAPER_TILE * uRenderPx)), 0.0);  // the tile always spans PAPER_TILE CSS px
  vec4 g = mix(triLod(tPaper, p / s0, w, lod), triLod(tPaper, p / (2.0 * s0) + 0.371, w, lod), f);
  g = (g - 0.5) * inversesqrt(f * f + (1.0 - f) * (1.0 - f)) + 0.5; // two independent octaves average to less contrast
  return g;
}
Paper paperAt(vec3 p, vec3 n, float marks) {
  vec3 w = triWeights(n, 4.0);
  vec4 g = paperGrain(p, w);
  vec4 m0 = tri(tMarks, p / MARK_SCALES.x, w), m1 = tri(tMarks, p / MARK_SCALES.y + 0.5, w);
  return Paper(g.r, g.g, g.b, g.a, max(m0.r, m1.r * 0.75) * marks, max(m0.g, m1.g) * marks);
}
// paperAt(p, n, 0.0) without the marks' six taps, for what never carries stains or foxing (veils, WP30a).
Paper paperPlain(vec3 p, vec3 n) {
  vec4 g = paperGrain(p, triWeights(n, 4.0));
  return Paper(g.r, g.g, g.b, g.a, 0.0, 0.0);
}

// Bare parchment (linear) under the hour's light: fibre and mottle, water stains, foxing.
vec3 parchment(Paper q) {
  vec3 c = uPaper * (1.0 + (q.fibre - 0.5) * 0.09 + (q.mottle - 0.5) * 0.12);
  c = wash(c, STAIN_T, q.stain * 0.4);
  return wash(c, FOX_T, q.fox * 0.45);
}

// Density multiplier for granulation: pigment settles into the tooth, more the deeper the wash.
float granulation(Paper q, float density) { return 1.0 + (q.grain - 0.5) * 0.55 * clamp(density - 0.2, 0.0, 1.2); }

// The style's wash: a transparent glaze of pigment transmittance t at density d over ground (linear: parchment(q), or
// an earlier glaze). It only darkens what lies beneath, so the paper's tone, fibres and stains show through every
// colour. The load is uneven (the brush's charge, and backruns where the wash bloomed), all fixed to the paper; it
// granulates where deep; and a dark pigment is laid no deeper than GLAZE_FLOOR of the ground's value, so that its
// hatching still carries the shadow. pool (washPool, or a wash edge of the caller's own) adds the darker ring where
// the drying pigment gathered.
const float GLAZE_FLOOR = 0.2;
vec3 glaze(vec3 ground, vec3 t, float d, float pool, Paper q) {
  if (d <= 0.0) return ground; // nothing laid (the wash below would multiply by t⁰ = 1): often a whole surface (WP30a)
  d = min(d, log(GLAZE_FLOOR) / log(clamp(dot(t, vec3(0.2126, 0.7152, 0.0722)), 1e-3, 0.999)));
  float bloom = smoothstep(0.64, 0.68, q.bloom) * smoothstep(0.3, 0.9, d);
  float load = (1.0 + (q.mottle - 0.5) * 0.35 + (q.bloom - 0.5) * 0.2)
             * (1.0 - 0.18 * bloom + bloom * (1.0 - bloom));
  return wash(ground, t, d * load * (1.0 + pool) * granulation(q, d));
}

// ---- hatching --------------------------------------------------------------------------------------------
// One stroke of a family: line index i at fine spacing S (continuous spacing Sc, octave fraction f), lines running
// along y and spaced across x. px is x's change per render pixel. w: stroke width as a fraction of the spacing.
float hatchStroke(float x, float y, float i, float S, float Sc, float f, float px, float w, float seed) {
  float key = i * S;                                  // the line's position: the same at every octave
  float h1 = hash11(key * 0.7317 + seed), h2 = hash11(key * 1.3791 + seed + 0.5);
  float fade = mod(i, 2.0) > 0.5 ? 1.0 - f : 1.0;     // every second line fades as the spacing doubles
  int ii = int(i);
  float rank = ii == 0 ? 6.0 : min(log2(float(ii & -ii)), 6.0);
  float len = S * exp2(rank) * (14.0 + 10.0 * h1);    // a line keeps its own stroke length at every octave
  float sy = y / len + h2 * 13.0, seg = floor(sy), fy = fract(sy);
  float hs = hash11(seg * 0.9173 + key * 0.3833 + seed);
  float gap = 0.03 + 0.06 * hs;
  float taper = fy < gap ? 0.0 : sqrt(sin(3.14159265 * (fy - gap) / (1.0 - gap)));
  float wobble = (textureLod(tPaper, vec2(y / (len * 0.8), key * 0.0731 + seed), 0.0).a - 0.5) * 0.16 * Sc;
  float dist = abs(x - key - (h1 - 0.5) * 0.1 * Sc - wobble) / px;
  float halfw = 0.5 * w * Sc / px * taper * (0.82 + 0.36 * hs);
  return fade * (0.85 + 0.3 * h2) * clamp(halfw - dist + 0.5, 0.0, 1.0);
}

float hatchFamily(float x, float y, float px, float w, float seed) {
  float k = max(log2(px * uRenderPx * HATCH_SPACING), -10.0);
  float lo = floor(k), f = k - lo, S = exp2(lo), Sc = exp2(k);
  float i0 = floor(x / S);
  return max(hatchStroke(x, y, i0, S, Sc, f, px, w, seed), hatchStroke(x, y, i0 + 1.0, S, Sc, f, px, w, seed));
}

// Ink coverage of hand hatching at tone (0 in full light, 1 in deepest shade) over hatch coordinates c (anchor
// units; the first family's strokes run along c.y, following the form). cdx, cdy: dFdx(c), dFdy(c), taken outside
// any branch. Parallel strokes come in as the light falls away, thicken, then cross, then cross again.
float hatching(vec2 c, vec2 cdx, vec2 cdy, float tone, float seed) {
  float cov = 0.0;
  float t1 = smoothstep(0.06, 0.7, tone);
  if (t1 > 0.0) {
    float px = abs(cdx.x) + abs(cdy.x);
    cov = min(t1 * 3.0, 1.0) * hatchFamily(c.x, c.y, px, mix(0.12, 0.44, t1), seed);
  }
  float t2 = smoothstep(0.68, 1.0, tone);
  if (t2 > 0.0) {
    vec2 d = vec2(0.3420, 0.9397);                  // 70° across the first family, near the form's fall
    float px = abs(dot(cdx, d)) + abs(dot(cdy, d));
    float h = min(t2 * 1.6, 1.0) * hatchFamily(dot(c, d), dot(c, vec2(-d.y, d.x)), px, mix(0.08, 0.26, t2), seed + 7.3);
    cov = 1.0 - (1.0 - cov) * (1.0 - h);
  }
  float t3 = smoothstep(0.88, 1.0, tone);
  if (t3 > 0.0) {
    vec2 d = vec2(0.7071, 0.7071);                  // diagonally across both
    float px = abs(dot(cdx, d)) + abs(dot(cdy, d));
    float h = min(t3 * 2.5, 1.0) * hatchFamily(dot(c, d), dot(c, vec2(-d.y, d.x)), px, mix(0.12, 0.28, t3), seed + 3.1);
    cov = 1.0 - (1.0 - cov) * (1.0 - h);
  }
  return cov;
}

// Hatching ink: light tones are drawn with diluted ink, the deepest with full iron-gall.
vec3 hatchInk(float tone) { return mix(wash(uPaper, SEPIA_T, 1.4), uInk, 0.45 + 0.55 * tone); }

// The form's tone from the light: 0 facing the sun, 1 turned fully away; light reflected from the sea and sky lifts
// the shadow again toward the silhouette, so the core of the shadow sits just past the terminator, as drawn.
// With the sun low (uLow) the light rakes: the terminator tightens, so what faces the sun stays lit and what turns
// from it falls into shade sooner, and the contrast grows as the sun sinks.
float lightTone(float ndl, float nv) {
  float t = 1.0 - smoothstep(mix(-0.45, -0.22, uLow), mix(0.75, 0.42, uLow), ndl);
  return t * (1.0 - 0.38 * pow(1.0 - nv, 2.0) * smoothstep(0.1, -0.4, ndl));
}

// ---- washes ----------------------------------------------------------------------------------------------
// The shade glaze over the side turned from the light, kept light because the hatching carries the shadow: flat, with
// a frilled edge where it backed into the drying
// wash (bloom) and pigment pooled darker along that edge. Returns the glazed colour.
// With the sun low the glaze reaches further round the form and lies deeper: the cool side of a raking light.
vec3 shadeGlaze(vec3 col, float tone, Paper q) {
  float g = smoothstep(0.5 - 0.12 * uLow, 0.62 - 0.12 * uLow, tone + (q.bloom - 0.5) * 0.22);
  float rim = g * (1.0 - g) * 4.0;
  return wash(col, uShade, (g * 0.42 + rim * 0.3) * (1.0 + 1.1 * uLow));
}

// How much darker a wash pools toward the silhouette: a narrow rim of steady on-screen width where the drying
// pigment gathered at the wash's edge (from how fast n·v falls to 0, in pixels), over a broad gentle deepening.
// Call outside any branch (derivatives).
float washPool(vec3 n, vec3 v, Paper q) {
  float nv = abs(dot(n, v));
  float px = nv / max(fwidth(nv), 1e-4) / uRenderPx;            // CSS px to the silhouette
  float ring = 1.0 - smoothstep(1.5, 7.0 + 5.0 * q.bloom, px);
  return ring * ring * 0.9 + pow(1.0 - nv, 3.0) * 0.25;
}

// The lit side's warm glaze (strong at golden hour, nothing at midday). With the sun low, everything turned toward it
// takes the glaze in full, however obliquely the light falls: the warm side of a raking light.
vec3 sunGlaze(vec3 col, float ndl, float tone) {
  float lit = mix(clamp(ndl, 0.0, 1.0), smoothstep(-0.05, 0.4, ndl), uLow);
  return wash(col, uSunTint, lit * (1.0 - tone) * (0.7 + 0.5 * uLow));
}

// Lamplight by night: within each lamp's reach (uGlows) the page is seen as by candlelight, the hour's cool paper
// relit warm. Every scene material calls it last, at its world position; by day every reach is 0.
vec3 candle(vec3 col, vec3 p) {
  float g = 0.0;
  for (int i = 0; i < ${MAX_GLOWS}; i++) {
    float f = max(1.0 - distance(p, uGlows[i].xyz) / max(uGlows[i].w, 1e-3), 0.0) * step(1e-3, uGlows[i].w);
    g += f * f;
  }
  return mix(col, col * ${lin(hex('#f4d6a2'))} / max(uPaper, vec3(0.02)), min(g, 1.0) * 0.85);
}

// ---- gold leaf -------------------------------------------------------------------------------------------
// Burnished gold leaf, the only thing that shines: a crinkled mirror, deep where it reflects the sea and bright where
// it reflects the sky and the sun, so it catches the light as the camera moves. p, an: anchor-frame position and
// normal (the crinkle sticks to the leaf); up: the local sky direction.
vec3 goldLeaf(vec3 n, vec3 v, vec3 up, vec3 p, vec3 an) {
  vec4 c = tri(tPaper, p * 3.0, triWeights(an, 4.0));
  vec3 nn = normalize(n + (vec3(c.b, c.a, c.r) - 0.5) * 0.35);
  vec3 r = reflect(-v, nn);
  float sky = dot(r, up), sun = max(dot(r, uSun), 0.0);
  vec3 col = mix(${lin(hex('#6a4914'))}, ${lin(hex('#d09a34'))}, smoothstep(-0.5, 0.15, sky));
  col = mix(col, ${lin(hex('#f4d77e'))}, clamp(smoothstep(0.2, 0.75, sky) * 0.85 + smoothstep(0.7, 0.96, sun) * 0.7, 0.0, 1.0));
  return col + ${lin(hex('#fff6dc'))} * (pow(sun, 60.0) * 0.8 + pow(sun, 700.0) * 3.0) * (1.0 - uNight * 0.6);
}

// ---- teams -----------------------------------------------------------------------------------------------
// Mirrors palette.ts: teamBody, watersColour, trailColour; and the trail patterns of TRAIL_PATTERNS.
const float TEAM_KEEP = ${TEAM_KEEP.toFixed(3)};
const float WATERS_COVER = ${WATERS_COVER.toFixed(3)};
const float TRAIL_DENSITY = ${TRAIL_DENSITY.toFixed(3)};
vec3 teamBody(vec3 teamLin, vec3 teamT, float density) { return mix(wash(uPaper, teamT, density), teamLin, TEAM_KEEP); }
vec3 watersColour(vec3 ground, vec3 teamLin, vec3 teamT) { return mix(ground, teamBody(teamLin, teamT, 1.0), WATERS_COVER); }
vec3 trailColour(vec3 teamLin, vec3 teamT) { return teamBody(teamLin, teamT, TRAIL_DENSITY); }
${TRAIL_GLSL()}
`;

/** GLSL of trailPattern(pattern, s, t, aa): mirrors palette.ts trailCoverage. */
function TRAIL_GLSL(): string {
  return /* glsl */ `
float capsule(vec2 q, float len, float r) { q.x -= clamp(q.x, 0.0, len); return length(q) - r; }
float trailPattern(int pattern, float s, float t, float aa) {
  float d;
  if (pattern == 0) d = abs(t) - 0.22;
  else if (pattern == 1) d = capsule(vec2(mod(s, 2.6), t), 1.5, 0.22);
  else if (pattern == 2) d = length(vec2(mod(s, 1.0) - 0.5, t)) - 0.26;
  else if (pattern == 3) d = abs(abs(t) - 0.3) - 0.09;
  else if (pattern == 4) { float m = mod(s, 3.4); d = min(capsule(vec2(m, t), 1.6, 0.2), length(vec2(m - 2.55, t)) - 0.2); }
  else if (pattern == 5) d = capsule(vec2(mod(s, 5.2), t), 4.0, 0.2);
  else if (pattern == 6) d = min(abs(t) - 0.065, abs(abs(t) - 0.38) - 0.065);
  else if (pattern == 7) { vec2 q = vec2(mod(s, 1.4) - 0.7, t); d = abs(length(q / vec2(0.62, 0.3)) - 1.0) * 0.3 - 0.07; }
  else if (pattern == 8) { float a = 6.2831853 / 2.2; d = abs(t - 0.3 * sin(a * s)) / sqrt(1.0 + pow(0.3 * a * cos(a * s), 2.0)) - 0.1; }
  else { float m = mod(s, 1.6) / 1.6; float z = 0.32 * (abs(m * 4.0 - 2.0) - 1.0); d = abs(t - z) * 0.78 - 0.1; }
  return clamp(0.5 - d / aa, 0.0, 1.0);
}
`;
}

/** The two outputs of every scene material, and how it writes them. */
const OUTPUT_GLSL = /* glsl */ `
layout(location = 0) out vec4 outColor;
layout(location = 1) out vec4 outAux;
uniform float uInkId;
uniform float uInkWeight;
vec2 octEncode(vec3 n) {
  n /= abs(n.x) + abs(n.y) + abs(n.z);
  vec2 e = n.z >= 0.0 ? n.xy : (1.0 - abs(n.yx)) * vec2(n.x >= 0.0 ? 1.0 : -1.0, n.y >= 0.0 ? 1.0 : -1.0);
  return e * 0.5 + 0.5;
}
// An opaque surface: its colour (linear) and world normal; the composite inks its silhouettes and creases.
void writeInk(vec3 colour, vec3 worldNormal) {
  outColor = vec4(toDisplay(colour), 1.0);
  outAux = vec4(octEncode(normalize(mat3(viewMatrix) * worldNormal)), uInkId / 255.0, uInkWeight / 4.0);
}
// A veil laid over the scene (fog, smoke, washes over the sea): blends its colour (linear) by alpha and hides the ink
// beneath it by the same amount; it is never inked itself.
void writeVeil(vec3 colour, float alpha) {
  outColor = vec4(toDisplay(colour), alpha);
  outAux = vec4(0.0);
}
`;

// ---------------------------------------------------------------------------------------------------------------
// Materials

let nextInkId = 0;

export interface InkMaterialOptions {
  /** Complete vertex shader (three supplies the matrices and attributes). */
  vertexShader: string;
  /** Fragment shader; STYLE_GLSL and the outputs are prepended. It must end in writeInk or writeVeil. */
  fragmentShader: string;
  uniforms?: Record<string, THREE.IUniform>;
  defines?: Record<string, string | number | boolean>;
  /** 1–255: surfaces with different ids get a line where they meet. By default each material has its own. */
  id?: number;
  /** Ink weight of this material's lines, 0–4 (1 = the standard line). */
  inkWeight?: number;
  /** Laid over the scene after the opaque pass; see writeVeil. */
  veil?: boolean;
  side?: THREE.Side;
}

/** A scene material in the style: writes both pipeline targets through writeInk or writeVeil. */
export function inkMaterial(style: Style, o: InkMaterialOptions): THREE.ShaderMaterial {
  const m = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: o.vertexShader,
    fragmentShader: STYLE_GLSL + OUTPUT_GLSL + o.fragmentShader,
    uniforms: {
      ...style.uniforms,
      uInkId: { value: o.id ?? (nextInkId++ % 255) + 1 },
      uInkWeight: { value: o.inkWeight ?? 1 },
      ...o.uniforms,
    },
    defines: o.defines ?? {},
    side: o.side ?? THREE.FrontSide,
  });
  if (o.veil) {
    // colour blends by alpha; the colour target's alpha (the veil) becomes (1 − a)·veil; aux (written as 0) is kept
    m.transparent = true;
    m.depthWrite = false;
    m.blending = THREE.CustomBlending;
    m.blendSrc = THREE.SrcAlphaFactor;
    m.blendDst = THREE.OneMinusSrcAlphaFactor;
    m.blendSrcAlpha = THREE.ZeroFactor;
    m.blendDstAlpha = THREE.OneMinusSrcAlphaFactor;
  }
  return m;
}

export interface IllustratedOptions {
  /** A surface's own drawing (GLSL in main, before the hatching: it may change col, tone and the hatch coordinates hc,
   *  hdx, hdy; vWorld, n, v, q and, when painted, vPaint are in scope), e.g. structures.ts' coursed masonry. */
  surface?: string;
  /** The pigment, as it looks on midday parchment at density 1 (a PIGMENTS entry or any palette colour). */
  pigment: RGB;
  /** Wash density: below 1 a thin tint, above 1 deep and granulating. */
  density?: number;
  /**
   * How hatching follows the form. 'contour' (default): strokes run round the form along level lines of `axis`
   * (anchor frame), like the cross-contours of an engraving: for towers, rocks, terrain, hulls. 'uv': strokes run
   * along the geometry's u, with `scale` the anchor-unit size of the uv square. `angle` turns the strokes (radians).
   */
  hatch?: { mode?: 'contour' | 'uv'; axis?: readonly [number, number, number]; scale?: readonly [number, number]; angle?: number };
  /** The frame the paper and hatching are anchored to: the planet ('world', default) or the object itself. */
  anchor?: 'world' | 'object';
  /** Gold leaf instead of a wash. */
  gold?: boolean;
  /** Per-vertex pigments (aPaint, aTint) with per-instance stone and accent (aStone, aAccent) instead of one pigment. */
  painted?: boolean;
  /** Strength of stains and foxing, default 1 on the planet frame and 0.3 on the object frame. */
  marks?: number;
  inkWeight?: number;
  id?: number;
  side?: THREE.Side;
}

const ILLUSTRATED_VERT = /* glsl */ `
out vec3 vWorld;
out vec3 vNormal;
out vec3 vAnchor;
out vec3 vAnchorN;
out vec2 vUv;
#ifdef PAINTED
in vec4 aPaint; // pigment transmittance, wash density (below 0: gold leaf)
in float aTint; // 0: the part's own pigment, 1: the instance's stone, 2: its accent
in vec3 aStone;
in vec3 aAccent;
out vec4 vPaint;
out float vTint;
#endif
void main() {
#ifdef USE_INSTANCING
  mat4 model = modelMatrix * instanceMatrix;
#else
  mat4 model = modelMatrix;
#endif
  vec4 w = model * vec4(position, 1.0);
  vWorld = w.xyz;
  vNormal = normalize(mat3(model) * normal);
#ifdef PAINTED
  vPaint = vec4(aTint > 1.5 ? aAccent : aTint > 0.5 ? aStone : aPaint.rgb, aPaint.w);
  vTint = aTint;
#endif
#ifdef ANCHOR_OBJECT
  vAnchor = position * length(model[0].xyz);
#ifdef USE_INSTANCING
  vAnchor += instanceMatrix[3].xyz; // each instance on its own stretch of the sheet
#endif
  vAnchorN = normal;
#else
  vAnchor = w.xyz;
  vAnchorN = vNormal;
#endif
  vUv = uv;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

const ILLUSTRATED_FRAG = /* glsl */ `
in vec3 vWorld;
in vec3 vNormal;
in vec3 vAnchor;
in vec3 vAnchorN;
in vec2 vUv;
uniform vec3 uPigment;
uniform float uDensity;
uniform vec3 uHatchAxis;
uniform vec2 uHatchScale;
uniform float uHatchAngle;
uniform float uMarks;
uniform float uSeed;
#ifdef PAINTED
in vec4 vPaint;
in float vTint;
#endif
void main() {
  float facing = gl_FrontFacing ? 1.0 : -1.0;
  vec3 n = normalize(vNormal) * facing, an = normalize(vAnchorN) * facing;
  vec3 v = normalize(cameraPosition - vWorld);
  Paper q = paperAt(vAnchor, an, uMarks);
#ifdef HATCH_UV
  vec2 hc = vec2(vUv.y * uHatchScale.y, vUv.x * uHatchScale.x);
#else
  vec3 side = normalize(cross(uHatchAxis, abs(uHatchAxis.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
  vec2 hc = vec2(dot(vAnchor, uHatchAxis), dot(vAnchor, side) + 0.7 * dot(vAnchor, cross(uHatchAxis, side)));
#endif
  hc = rot2(uHatchAngle) * hc;
  vec2 hdx = dFdx(hc), hdy = dFdy(hc);
  float ndl = dot(n, uSun), tone = lightTone(ndl, abs(dot(n, v)));
#if defined(PAINTED)
  vec3 col;
  if (vPaint.w < 0.0) {
    col = goldLeaf(n, v, normalize(vWorld), vAnchor, an);
    tone *= 0.6;
  } else {
    col = glaze(parchment(q), vPaint.rgb, vPaint.w, washPool(n, v, q), q);
    col = sunGlaze(shadeGlaze(col, tone, q), ndl, tone);
  }
#elif defined(GOLD)
  vec3 col = goldLeaf(n, v, normalize(vWorld), vAnchor, an);
  tone *= 0.6;
#else
  vec3 col = glaze(parchment(q), uPigment, uDensity, washPool(n, v, q), q);
  col = sunGlaze(shadeGlaze(col, tone, q), ndl, tone);
#endif
  /*SURFACE*/
  col = mix(col, hatchInk(tone), hatching(hc, hdx, hdy, tone, uSeed));
  if (uNight > 0.0) {
    // by candlelight the lit side is picked out in silver ink instead of left bare
    float lit = smoothstep(0.3, 0.95, ndl) * uNight;
    col = mix(col, uSilver, 0.65 * hatching(rot2(0.6) * hc, rot2(0.6) * hdx, rot2(0.6) * hdy, lit * 0.26, uSeed + 11.0));
  }
  writeInk(candle(col, vWorld), n);
}
`;

let nextSeed = 0;

/**
 * The style's standard material for solid things: a transparent glaze of pigment over world-anchored parchment
 * (uneven, pooled into a dried ring at the silhouette, granulating where deep; dark pigments laid thin), a light shade
 * glaze with a bloomed edge, the hour's warm glaze on the lit side,
 * and hatching that follows the form, deepening to cross-hatching as the light falls away. Or gold leaf.
 */
export function illustratedMaterial(style: Style, o: IllustratedOptions): THREE.ShaderMaterial {
  const objectFrame = o.anchor === 'object';
  const h = o.hatch ?? {};
  const defines: Record<string, boolean> = {};
  if (objectFrame) defines.ANCHOR_OBJECT = true;
  if (h.mode === 'uv') defines.HATCH_UV = true;
  if (o.gold) defines.GOLD = true;
  if (o.painted) defines.PAINTED = true;
  return inkMaterial(style, {
    vertexShader: ILLUSTRATED_VERT,
    fragmentShader: o.surface ? ILLUSTRATED_FRAG.replace('/*SURFACE*/', o.surface) : ILLUSTRATED_FRAG,
    defines,
    id: o.id,
    inkWeight: o.inkWeight,
    side: o.side,
    uniforms: {
      uPigment: { value: transmittanceVec(o.pigment) },
      uDensity: { value: o.density ?? 1 },
      uHatchAxis: { value: new THREE.Vector3(...(h.axis ?? [0, 1, 0])).normalize() },
      uHatchScale: { value: new THREE.Vector2(...(h.scale ?? [1, 1])) },
      uHatchAngle: { value: h.angle ?? 0 },
      uMarks: { value: o.marks ?? (objectFrame ? 0.3 : 1) },
      uSeed: { value: (nextSeed++ * 17.31) % 97 },
    },
  });
}

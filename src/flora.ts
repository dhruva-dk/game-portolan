// Vegetation and natural ground cover, all modelled here in code: hand-placed hero palms, mangroves on arching
// prop roots, broadleaf jungle, wind-sculpted pines, dune scrub, beach grass, ferns, flowering shrubs, cliff
// vines, mossy boulders, driftwood, tide pools, and kelp and coral heads in the shallows.
// Every species is a few LOD meshes drawn instanced; instances are binned into island tiles that are frustum-
// and horizon-culled each frame. One vertex program bends every plant in the shared gusting wind (trunk bend,
// branch sway and leaf flutter at their own rates), and foliage transmits the key light when backlit.
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { R, HN, Rng, mix, smoothstep, wind, type V3 } from './sim.ts';
import { driftwood as craftDriftwood, sampleCube, TANGENT_NORMAL_GLSL, tube as craftTube, vnoise } from './craft.ts';
import type { Island, World } from './world.ts';
import { COMMON_GLSL, WIND_GLSL, applyWeather } from './sky.ts';
import { loadTexture } from './post.ts';
import type { Ctx, Frame } from './main.ts';
import palmBarkCol from './assets/bark_palm_color.jpg';
import palmBarkNrm from './assets/bark_palm_normal.jpg';
import pineBarkCol from './assets/bark_pine_color.jpg';
import pineBarkNrm from './assets/bark_pine_normal.jpg';
import woodCol from './assets/wood_weathered_color.jpg';
import woodNrm from './assets/wood_weathered_normal.jpg';
import rockCol from './assets/rock_coast_color.jpg';
import rockNrm from './assets/rock_coast_normal.jpg';
import mossCol from './assets/moss_color.jpg';
import mossNrm from './assets/moss_normal.jpg';

// Surface kinds a vertex can carry (aMat.x). Bark kinds sample their scanned set with a normal map; LEAF and CARD
// sample the painted foliage atlas (alpha-tested, translucent); CARD keeps its crown-volume normal on both faces.
const M = { PALM: 0, BARK: 1, WOOD: 2, LEAF: 3, SOLID: 4, BLADE: 5, CARD: 6, BRAIN: 7, POOL: 8 } as const;
const ATLAS = 2048; // foliage atlas size, pixels

const QROT_GLSL = /* glsl */ `vec3 qrot(vec4 q, vec3 v) { return v + 2.0 * cross(q.xyz, cross(q.xyz, v) + q.w * v); }`;

// ---------------------------------------------------------------------------------------------
// Shaders. Instances carry base position + scale, an orientation quaternion, a shape vector (lean, curl, trunk
// height, random) and a tint (rgb, flower hue). Vertices carry their spine parameter s, branch and leaf weights
// and a phase; positions are stored relative to their point on the trunk spine, so the shader can stretch, lean
// and bend the trunk per instance and carry everything attached along with it.
const VERT_PARS = /* glsl */ `
attribute vec4 aSpine;
attribute vec3 aMat;
attribute vec4 aPos;
attribute vec4 aRot;
attribute vec4 aShape;
attribute vec4 aTint;
uniform float uTime;
uniform float uSimTime;
uniform float uStorm;
uniform vec3 uCamPos;
uniform vec2 uFade;
varying vec2 vFUv;
varying vec2 vMat;
varying vec3 vLocal;
varying vec4 vTint;
#ifdef ROCK
varying vec3 vLocalN;
varying vec4 vRot;
varying float vMoss;
#endif
${COMMON_GLSL}
${WIND_GLSL}
${QROT_GLSL}
// the rotation that takes +Y onto the unit vector T
vec3 tiltTo(vec3 v, vec3 T) {
  vec3 a = vec3(T.z, 0.0, -T.x);
  return v * T.y + cross(a, v) + a * (dot(a, v) / (1.0 + T.y));
}
void floraDeform(inout vec3 p, inout vec3 n) {
  vFUv = uv;
  vMat = aMat.xy;
  vTint = aTint;
  // a species may carry several crowns (aMat.z = 1, 2 …); each instance keeps the one its tint.w selects
  float sc = aMat.z > 0.5 && abs(aMat.z - 1.0 - aTint.w) > 0.5 ? 0.0 : aPos.w;
#ifdef FADE
  // ground cover thins out with distance: each instance shrinks away at its own threshold
  float k = clamp((uFade.y - distance(aPos.xyz, uCamPos)) / (uFade.y - uFade.x), 0.0, 1.0);
  sc *= smoothstep(aShape.w * 0.75, aShape.w * 0.75 + 0.25, k);
#endif
#ifdef ROCK
  vLocal = p * aShape.xyz * sc;
  vLocalN = normalize(n / aShape.xyz);
  vRot = aRot;
  p = qrot(aRot, vLocal) + aPos.xyz;
  n = qrot(aRot, vLocalN);
  vMoss = aTint.w * smoothstep(0.1, 0.75, dot(n, normalize(aPos.xyz)));
#else
  vLocal = p;
  vec3 up = normalize(aPos.xyz);
  vec3 w = windAt(up, uSimTime);
  float wl = length(w);
  vec3 wn = w / max(wl, 1e-4);
  vec3 wloc = qrot(vec4(-aRot.xyz, aRot.w), wn);
  vec2 wd = wloc.xz / max(length(wloc.xz), 1e-4);
  float ph = aShape.w * 6.2832 + aSpine.w;
  float t = uTime;
  float s = aSpine.x, H = aShape.z;
  vec3 q = p * sc;
#ifdef KELP
  // stipes stream with the swell's to-and-fro over a slow drift; blades ripple
  float surge = sin(t * 0.75 + dot(aPos.xyz, vec3(0.37, 0.21, 0.29)) + aShape.w * 2.0);
  vec2 bend = wd * (0.16 + 0.3 * surge) * (1.0 + 1.5 * uStorm);
  q.xz += wd * aSpine.y * 0.22 * sin(t * 1.3 + ph);
  q += n * aSpine.z * 0.03 * sin(t * 3.1 + ph * 3.0);
  vec2 D = bend * H * pow(s, 1.5) * 0.6;
  vec2 dD = bend * H * 0.9 * sqrt(s);
#else
  // gust fronts roll downwind across the island; the storm multiplies everything
  float gust = vnoise(vec3(dot(aPos.xyz, wn) * 0.09 - t * 0.85, dot(aPos.xyz, cross(up, wn)) * 0.09, 0.5));
  float strength = wl * (0.35 + 1.3 * gust) * (1.0 + 2.6 * uStorm);
  // fixed rates blended by the storm (never a time-varying frequency, which would sweep the phase)
  float osc = mix(sin(t * 1.7 + ph) * 0.6 + sin(t * 2.9 + ph * 1.7) * 0.4,
                  sin(t * 3.6 + ph) * 0.6 + sin(t * 5.3 + ph * 1.3) * 0.4, uStorm);
  // in the storm the fronds stream flat downwind and the trunks bow hard, still pumping in the gusts
  q.xz += wd * aSpine.y * (strength * (0.05 + 0.045 * osc) + 0.3 * uStorm);
  q.y += aSpine.y * strength * 0.035 * sin(t * 2.3 + ph + 1.0);
  q += n * aSpine.z * strength * 0.02 * sin(t * 10.0 + ph * 5.0 + dot(p, vec3(7.0)));
  float g = mix(s, s * (2.0 - s), aShape.y), gd = mix(1.0, 2.0 - 2.0 * s, aShape.y);
  vec2 bend = wd * (strength * (0.022 + 0.012 * mix(sin(t * 0.8 + ph), sin(t * 1.7 + ph), uStorm))
    + uStorm * (0.2 + 0.07 * sin(t * 1.3 + ph)));
  vec2 D = vec2(aShape.x * g, 0.0) * H + bend * H * s * s;
  vec2 dD = vec2(aShape.x * gd, 0.0) * H + bend * H * 2.0 * s;
#endif
  // the foot stays level so a leaning trunk still meets the ground all round
  float level = smoothstep(0.0, 0.1, s);
  vec3 T = normalize(vec3(dD.x * level, H, dD.y * level));
  p = tiltTo(q, T) + vec3(D.x, H * s, D.y);
  n = tiltTo(n, T);
  p = qrot(aRot, p) + aPos.xyz;
  n = qrot(aRot, n);
#endif
}
`;

const ALPHA_GLSL = /* glsl */ `
uniform sampler2D tLeaf;
bool floraLeaf(float m) { return abs(m - ${M.LEAF}.0) < 0.5 || abs(m - ${M.CARD}.0) < 0.5; }
// alpha-tested mips lose coverage with distance; scale alpha up with the mip level to keep crowns full
float floraCoverage(float a, vec2 uv) {
  vec2 d = max(abs(dFdx(uv)), abs(dFdy(uv))) * ${ATLAS}.0;
  return a * (1.0 + 0.2 * max(0.0, log2(max(d.x, d.y))));
}
`;

const FRAG_PARS = /* glsl */ `
${ALPHA_GLSL}
uniform sampler2D tPalm;
uniform sampler2D tPalmN;
uniform sampler2D tBark;
uniform sampler2D tBarkN;
uniform sampler2D tWood;
uniform sampler2D tWoodN;
uniform float uTime;
varying vec2 vFUv;
varying vec2 vMat;
varying vec3 vLocal;
varying vec4 vTint;
float floraTrans = 0.0;
float floraRough = 0.85;
vec3 floraTN = vec3(0.0, 0.0, 1.0);
${TANGENT_NORMAL_GLSL}
vec3 floraFlower(float h) {
  return h < 0.22 ? vec3(0.85, 0.04, 0.05) : h < 0.42 ? vec3(0.95, 0.3, 0.5) : h < 0.6 ? vec3(0.98, 0.72, 0.08)
    : h < 0.8 ? vec3(0.62, 0.12, 0.7) : vec3(1.0, 0.95, 0.9);
}
`;

const FRAG_MAP = /* glsl */ `
vec4 floraTex = vec4(1.0);
float fm = vMat.x;
vec3 floraTintC = mix(vec3(1.0), vTint.rgb, vMat.y);
if (fm < ${M.WOOD}.5) {
  vec3 nt;
  if (fm < ${M.PALM}.5) { floraTex = texture2D(tPalm, vFUv); nt = texture2D(tPalmN, vFUv).xyz; }
  else if (fm < ${M.BARK}.5) { floraTex = texture2D(tBark, vFUv); nt = texture2D(tBarkN, vFUv).xyz; }
  else { floraTex = texture2D(tWood, vFUv); nt = texture2D(tWoodN, vFUv).xyz; floraRough = 0.75; }
  floraTN = nt * 2.0 - 1.0;
  floraTN.xy *= 1.4;
} else if (floraLeaf(fm)) {
  floraTex = texture2D(tLeaf, vFUv);
  if (floraCoverage(floraTex.a, vFUv) < 0.5) discard;
  // petals are painted white in the atlas and take each shrub's own hue
  float petal = smoothstep(0.45, 0.7, min(floraTex.r, floraTex.b));
  floraTex.rgb = mix(floraTex.rgb * floraTintC, floraFlower(vTint.w) * floraTex.g, petal);
  floraTrans = (1.0 - 0.5 * petal) * mix(0.3, 1.0, vMat.y); // dead fronds (untinted) are dry and dull
  floraRough = 0.55;
} else if (fm < ${M.SOLID}.5) {
  floraTex.rgb = floraTintC;
} else if (fm < ${M.BLADE}.5) {
  floraTex.rgb = floraTintC;
  floraTrans = 0.85;
  floraRough = 0.6;
} else if (fm < ${M.BRAIN}.5) {
  // brain coral: maze-like meanders, faded out before they would alias
  vec3 q = vLocal * 60.0;
  float maze = sin(q.x + 2.2 * sin(q.z * 0.37) + 1.3 * sin(q.y * 0.53)) * sin(q.z + 2.0 * sin(q.x * 0.41));
  float aa = 1.0 - smoothstep(0.4, 1.2, length(fwidth(q)));
  floraTex.rgb = floraTintC * mix(0.85, 0.6 + 0.45 * smoothstep(-0.2, 0.4, maze), aa);
} else {
  // tide-pool water: a still dark mirror over pale sand, ruffled by the breeze
  vec2 rp = vLocal.xz * 7.0;
  float tt = uTime;
  floraTN = normalize(vec3(
    0.05 * (cos(rp.x * 1.3 + tt * 1.7) + cos(rp.x * 0.7 + rp.y * 1.1 - tt * 1.3)),
    0.05 * (cos(rp.y * 1.5 - tt * 1.5) + cos(rp.y * 0.6 - rp.x * 0.9 + tt * 1.1)), 1.0));
  floraTex.rgb = vec3(0.16, 0.2, 0.17);
  floraRough = 0.03;
}
diffuseColor.rgb *= floraTex.rgb;
`;

const FRAG_NORMAL = /* glsl */ `
bool floraFlat = vMat.x > ${M.BRAIN}.5; // tide-pool water ripples in its own plane
if (vMat.x < ${M.WOOD}.5 || floraFlat) {
  normal = tangentNormal(normal, -vViewPosition, floraFlat ? vLocal.xz : vFUv, floraTN);
} else if (abs(vMat.x - ${M.CARD}.0) < 0.5) {
  normal *= faceDirection; // crown cards keep their outward volume normal on both faces
}
`;

// Light through the leaf: diffuse transmission from behind plus a forward-scattered glow toward a viewer looking
// into the light. Riding on RE_Direct means it is shadowed and coloured exactly like the direct light.
const FRAG_TRANSLUCENT = /* glsl */ `
void RE_Direct_Flora(const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal,
    const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material,
    inout ReflectedLight reflectedLight) {
  RE_Direct_Physical(directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material,
    reflectedLight);
  float back = saturate(-dot(geometryNormal, directLight.direction));
  float glow = pow(saturate(dot(-geometryViewDir, directLight.direction)), 4.0);
  vec3 tc = material.diffuseColor * vec3(1.15, 1.2, 0.5) + vec3(0.012, 0.016, 0.0);
  reflectedLight.directDiffuse += floraTrans * directLight.color * tc * RECIPROCAL_PI * (0.7 * back + 3.0 * glow);
}
#undef RE_Direct
#define RE_Direct RE_Direct_Flora
#undef RE_IndirectSpecular
`;

// Plants are rough and cover much of the screen, so instead of the full image-based specular (a prefiltered sky
// lookup per pixel) they catch the sky's irradiance as a Fresnel sheen, which grows as rain lowers the roughness.
const FRAG_SHEEN = /* glsl */ `
{
  float fresnel = 0.04 + 0.96 * pow(1.0 - saturate(dot(geometryNormal, geometryViewDir)), 5.0);
  reflectedLight.indirectSpecular += iblIrradiance * RECIPROCAL_PI * fresnel * (1.0 - material.roughness);
}
`;

const ROCK_PARS = /* glsl */ `
uniform sampler2D tRock;
uniform sampler2D tRockN;
uniform sampler2D tMoss;
uniform sampler2D tMossN;
varying vec3 vLocal;
varying vec3 vLocalN;
varying vec4 vRot;
varying vec4 vTint;
varying float vMoss;
vec3 floraRockN = vec3(0.0, 1.0, 0.0);
float floraRough = 0.9;
${QROT_GLSL}
`;

// Scanned coastal rock projected triplanar in the rock's own frame (whiteout-blended normals), moss on its crown.
const ROCK_MAP = /* glsl */ `
vec3 N0 = normalize(vLocalN);
vec3 bw = pow(abs(N0), vec3(4.0));
bw /= bw.x + bw.y + bw.z;
vec3 lp = vLocal * 0.75;
vec3 rc = texture2D(tRock, lp.zy).rgb * bw.x + texture2D(tRock, lp.xz).rgb * bw.y + texture2D(tRock, lp.xy).rgb * bw.z;
vec3 nx = texture2D(tRockN, lp.zy).xyz * 2.0 - 1.0;
vec3 ny = texture2D(tRockN, lp.xz).xyz * 2.0 - 1.0;
vec3 nz = texture2D(tRockN, lp.xy).xyz * 2.0 - 1.0;
vec3 rn = normalize(vec3(nx.xy + N0.zy, abs(nx.z) * N0.x).zyx * bw.x + vec3(ny.xy + N0.xz, abs(ny.z) * N0.y).xzy * bw.y
  + vec3(nz.xy + N0.xy, abs(nz.z) * N0.z) * bw.z);
float moss = smoothstep(0.42, 0.62, vMoss + (texture2D(tMoss, lp.xz * 0.23).g - 0.35) * 0.9);
vec3 mc = texture2D(tMoss, lp.xz * 1.3).rgb * vec3(0.95, 1.0, 0.75);
vec3 mn = texture2D(tMossN, lp.xz * 1.3).xyz * 2.0 - 1.0;
diffuseColor.rgb *= mix(rc * vTint.rgb, mc, moss);
floraRockN = normalize(mix(rn, normalize(vec3(mn.x, abs(mn.z), mn.y) + N0), moss));
floraRough = mix(0.86, 0.97, moss);
`;

/** Shared state for every flora program: the sky's shared uniforms by reference, plus our textures. */
function floraUniforms(ctx: Ctx, tex: Record<string, THREE.Texture>): Record<string, THREE.IUniform> {
  const u: Record<string, THREE.IUniform> = { ...ctx.sky.u };
  for (const k in tex) u[k] = { value: tex[k] };
  return u;
}

type Variant = { fade?: number; kelp?: boolean; rock?: boolean; leaves?: boolean }; // leaves: alpha-tested foliage
/**
 * The lit material, the depth material that casts its shadow, and for alpha-tested foliage a depth-only prepass:
 * crowns overlap many layers deep, so the lit pass tests against the prepass depth and shades each pixel once.
 */
interface FloraMaterial {
  mat: THREE.MeshStandardMaterial;
  depth: THREE.Material;
  pre: THREE.Material | null;
}

/** A standard material running the flora vertex program, and the depth material that casts its shadow. */
function makeMaterial(base: Record<string, THREE.IUniform>, v: Variant): FloraMaterial {
  const defines: Record<string, string> = {};
  if (v.fade) defines.FADE = '';
  if (v.kelp) defines.KELP = '';
  if (v.rock) defines.ROCK = '';
  const u = { ...base, uFade: { value: new THREE.Vector2((v.fade ?? 1) * 0.72, v.fade ?? 1) } };
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, side: v.rock ? THREE.FrontSide : THREE.DoubleSide,
    roughness: 1 });
  mat.defines = defines;
  applyWeather(mat, v.rock ? 0.6 : 1);
  const weather = mat.onBeforeCompile.bind(mat);
  mat.onBeforeCompile = (sh, r) => {
    weather(sh, r);
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\n${VERT_PARS}`)
      .replace('#include <beginnormal_vertex>',
        'vec3 objectNormal = normal;\nvec3 floraP = position;\nfloraDeform(floraP, objectNormal);')
      .replace('#include <begin_vertex>', 'vec3 transformed = floraP;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\n${v.rock ? ROCK_PARS : FRAG_PARS}`)
      .replace('#include <map_fragment>', v.rock ? ROCK_MAP : FRAG_MAP)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = floraRough;')
      .replace('#include <normal_fragment_maps>', v.rock
        ? 'normal = normalize((viewMatrix * vec4(qrot(vRot, floraRockN), 0.0)).xyz);'
        : FRAG_NORMAL);
    if (!v.rock) sh.fragmentShader = sh.fragmentShader
      .replace('#include <lights_physical_pars_fragment>',
        `#include <lights_physical_pars_fragment>\n${FRAG_TRANSLUCENT}`)
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>\n${FRAG_SHEEN}`);
  };
  const key = `flora${Object.keys(defines).join('')}`;
  mat.customProgramCacheKey = () => key;

  const depth = new THREE.MeshDepthMaterial();
  depth.defines = defines;
  depth.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\n${VERT_PARS}`)
      .replace('#include <begin_vertex>',
        'vec3 transformed = position;\nvec3 floraN = normal;\nfloraDeform(transformed, floraN);');
    if (!v.rock) sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\n${ALPHA_GLSL}\nvarying vec2 vFUv;\nvarying vec2 vMat;`)
      .replace('#include <alphatest_fragment>',
        'if (floraLeaf(vMat.x) && floraCoverage(texture2D(tLeaf, vFUv).a, vFUv) < 0.5) discard;');
  };
  depth.customProgramCacheKey = () => `${key}depth`;
  if (!v.leaves) return { mat, depth, pre: null };
  // the prepass sits a hair behind, so the lit pass always passes its depth test on the same surface
  const pre = new THREE.MeshDepthMaterial({ colorWrite: false, side: THREE.DoubleSide, polygonOffset: true,
    polygonOffsetFactor: 1, polygonOffsetUnits: 2 });
  pre.defines = defines;
  pre.onBeforeCompile = depth.onBeforeCompile;
  pre.customProgramCacheKey = () => `${key}pre`;
  mat.depthWrite = false;
  return { mat, depth, pre };
}

// ---------------------------------------------------------------------------------------------
// The foliage atlas, painted once at boot: palm leaflets and fronds, broadleaf, temperate and mangrove leaf
// sprays, pine needles, fern fronds, flowering and sea-grape twigs, ivy, kelp blades and sea fans. Colour and
// coverage are painted separately so mip levels average to leaf colour, never to a dark background.
type Region = readonly [number, number, number, number]; // x, y, w, h in atlas pixels
const REG = {
  leaflet: [0, 0, 128, 1024],
  frond: [128, 0, 512, 1024],
  broad: [640, 0, 512, 512],
  temperate: [1152, 0, 512, 512],
  pine: [1664, 0, 384, 512],
  fern: [640, 512, 256, 512],
  flower: [896, 512, 512, 512],
  scrub: [1408, 512, 512, 512],
  kelp: [1920, 512, 128, 512],
  vine: [0, 1024, 512, 512],
  mangrove: [512, 1024, 512, 512],
  dead: [1024, 1024, 512, 1024],
  fan: [1536, 1024, 512, 512],
} as const satisfies Record<string, Region>;

/** Atlas UV of a point in a region; fv = 0 at the region's base (bottom edge), 1 at its top. */
function regUV(r: Region, fu: number, fv: number): [number, number] {
  return [(r[0] + fu * r[2]) / ATLAS, (r[1] + (1 - fv) * r[3]) / ATLAS];
}

type RGB = readonly [number, number, number]; // sRGB 0..1
type C2D = CanvasRenderingContext2D;
/** Paints into the colour canvas (col = true) or the coverage canvas (white = opaque). */
type Draw = (g: C2D, col: boolean) => void;

const css = (c: RGB, k = 1, a = 1) =>
  `rgba(${c.map((v) => Math.round(Math.min(1, Math.max(0, v * k)) * 255)).join(',')},${a})`;
const shift = (c: RGB, rng: Rng, amt: number): RGB => {
  const k = 1 + rng.range(-amt, amt), hue = rng.range(-amt, amt) * 0.6;
  return [c[0] * k * (1 + hue), c[1] * k, c[2] * k * (1 - hue)];
};

interface Leaf {
  len: number;
  w: number; // half-width
  peak?: number; // where along the leaf it is widest
  tip?: number; // >1 sharper tip
  serr?: number; // toothed margin
  round?: boolean;
}

function leafWidth(s: Leaf, t: number): number {
  if (s.round) return Math.sqrt(Math.max(0, 1 - (2 * t - 1) ** 2));
  const p = Math.log(0.5) / Math.log(s.peak ?? 0.4);
  return Math.pow(Math.sin(Math.PI * Math.pow(t, p)), s.tip ?? 0.8);
}

function leafPath(g: C2D, s: Leaf): void {
  const n = 30;
  g.beginPath();
  g.moveTo(0, 0);
  for (const side of [1, -1]) {
    for (let i = 1; i < n; i++) {
      const k = side > 0 ? i : n - i, t = k / n;
      const x = s.w * leafWidth(s, t) * (s.serr ? 1 + s.serr * (k % 2 ? 0.09 : -0.09) : 1);
      g.lineTo(side * x, -s.len * t);
    }
    g.lineTo(0, side > 0 ? -s.len : 0);
  }
  g.closePath();
}

/** A leaf blade from (0,0) toward -y with a shaded body, a midrib and paired veins. */
function leaf(s: Leaf, c: RGB, veins = 0, rib?: RGB): Draw {
  const rc = rib ?? ([c[0] * 1.5 + 0.12, c[1] * 1.35 + 0.1, c[2] * 1.2 + 0.05] as RGB);
  return (g, col) => {
    leafPath(g, s);
    if (!col) {
      g.fillStyle = '#fff';
      g.fill();
      return;
    }
    g.lineWidth = 5;
    g.strokeStyle = css(c, 0.8);
    g.stroke();
    const gr = g.createLinearGradient(-s.w, -s.len * 0.1, s.w * 0.7, -s.len);
    gr.addColorStop(0, css(c, 0.68));
    gr.addColorStop(0.5, css(c, 1));
    gr.addColorStop(1, css(c, 1.2));
    g.fillStyle = gr;
    g.fill();
    g.strokeStyle = css(rc, 1, 0.8);
    g.lineWidth = Math.max(1, s.w * 0.09);
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(0, -s.len * 0.94);
    g.stroke();
    g.lineWidth = Math.max(0.7, s.w * 0.04);
    g.strokeStyle = css(rc, 1, 0.32);
    for (let k = 1; k <= veins; k++) {
      const t = k / (veins + 1), y = -s.len * t, x = s.w * 0.85 * leafWidth(s, Math.min(1, t + 0.08));
      g.beginPath();
      for (const sd of [1, -1]) {
        g.moveTo(0, y);
        g.quadraticCurveTo(sd * x * 0.5, y - s.len * 0.03, sd * x, y - s.len * 0.1);
      }
      g.stroke();
    }
  };
}

/** A stroked line (twig, stem, rachis) in both canvases. */
function stroke(pts: number[], width: number, c: RGB, taper = 1): Draw {
  return (g, col) => {
    g.strokeStyle = col ? css(c) : '#fff';
    g.lineCap = 'round';
    const n = pts.length / 2 - 1;
    for (let i = 0; i < n; i++) {
      g.lineWidth = width * (1 - (1 - taper) * (i / n));
      g.beginPath();
      g.moveTo(pts[i * 2], pts[i * 2 + 1]);
      g.lineTo(pts[i * 2 + 2], pts[i * 2 + 3]);
      g.stroke();
    }
  };
}

class Painter {
  private readonly col: C2D;
  private readonly cov: C2D;

  constructor() {
    const make = () => {
      const c = document.createElement('canvas');
      c.width = c.height = ATLAS;
      return c.getContext('2d', { willReadFrequently: true })!;
    };
    this.col = make();
    this.cov = make();
    this.cov.fillStyle = '#000';
    this.cov.fillRect(0, 0, ATLAS, ATLAS);
  }

  /** Clip both canvases to a region, fill its colour with the average tone, and paint inside it. */
  region(r: Region, bg: RGB, paint: () => void): void {
    for (const g of [this.col, this.cov]) {
      g.save();
      g.beginPath();
      g.rect(r[0], r[1], r[2], r[3]);
      g.clip();
    }
    this.col.fillStyle = css(bg);
    this.col.fillRect(r[0], r[1], r[2], r[3]);
    paint();
    this.col.restore();
    this.cov.restore();
  }

  at(x: number, y: number, ang: number, d: Draw): void {
    for (const [g, col] of [[this.col, true], [this.cov, false]] as const) {
      g.save();
      g.translate(x, y);
      g.rotate(ang);
      d(g, col);
      g.restore();
    }
  }

  texture(): THREE.DataTexture {
    const c = this.col.getImageData(0, 0, ATLAS, ATLAS).data, a = this.cov.getImageData(0, 0, ATLAS, ATLAS).data;
    for (let i = 3; i < c.length; i += 4) c[i] = a[i - 3];
    const t = new THREE.DataTexture(new Uint8Array(c.buffer), ATLAS, ATLAS);
    t.colorSpace = THREE.SRGBColorSpace;
    t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.magFilter = THREE.LinearFilter;
    t.anisotropy = 8;
    t.needsUpdate = true;
    return t;
  }
}

/** Leaves scattered along twigs radiating from a region's base, darker underneath, brighter on top. */
function spray(p: Painter, r: Region, rng: Rng, n: number, twigs: number, s: () => Leaf, c: RGB, twig: RGB,
  veins: number): void {
  const bx = r[0] + r[2] / 2, by = r[1] + r[3] - 6;
  const ends: number[][] = [];
  for (let k = 0; k < twigs; k++) {
    const a = -Math.PI / 2 + (k / Math.max(1, twigs - 1) - 0.5) * 1.6 + rng.range(-0.15, 0.15);
    const l = r[3] * rng.range(0.55, 0.8);
    const pts = [bx, by, bx + Math.cos(a) * l * 0.5 + rng.range(-10, 10), by + Math.sin(a) * l * 0.5,
      bx + Math.cos(a) * l, by + Math.sin(a) * l];
    p.at(0, 0, 0, stroke(pts, 7, twig, 0.4));
    ends.push(pts);
  }
  for (let i = 0; i < n; i++) {
    const tw = ends[i % twigs], t = rng.range(0.25, 1);
    const x = tw[0] + (tw[4] - tw[0]) * t + rng.range(-26, 26), y = tw[1] + (tw[5] - tw[1]) * t + rng.range(-26, 26);
    const ta = Math.atan2(tw[5] - tw[1], tw[4] - tw[0]) + Math.PI / 2;
    const ang = ta + (rng.next() < 0.5 ? -1 : 1) * rng.range(0.3, 1.3);
    const shade = 0.62 + 0.5 * (i / n);
    p.at(x, y, ang, leaf(s(), shift([c[0] * shade, c[1] * shade, c[2] * shade], rng, 0.12), veins));
  }
}

function paintAtlas(): THREE.DataTexture {
  const p = new Painter(), rng = new Rng(0xf10a);

  // one palm leaflet filling its strip, base at the bottom
  const lf = REG.leaflet;
  p.region(lf, [0.33, 0.47, 0.16], () => {
    p.at(lf[0] + lf[2] / 2, lf[1] + lf[3] - 2, 0,
      leaf({ len: lf[3] - 6, w: lf[2] * 0.42, peak: 0.45, tip: 0.7 }, [0.36, 0.52, 0.16], 0, [0.75, 0.74, 0.36]));
  });

  // a whole frond seen from above: rachis up the middle, leaflets swept toward the tip
  const paintFrond = (r: Region, c: RGB, rachis: RGB, sweep: number, width: number, gaps: number) => {
    const cx = r[0] + r[2] / 2, by = r[1] + r[3] - 4;
    for (let i = 0; i < 64; i++) {
      const t = 0.05 + (0.93 * i) / 63, y = by - t * (r[3] - 20);
      const len = Math.min(r[2] * 0.48 / Math.sin(sweep),
        265 * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.07)), 0.55)) * rng.range(0.85, 1.08);
      for (const sd of [1, -1]) {
        if (rng.next() < gaps) continue;
        p.at(cx + sd * 3, y, sd * (sweep + rng.range(-0.08, 0.08)),
          leaf({ len, w: width * rng.range(0.8, 1.15), peak: 0.4, tip: 0.7 }, shift(c, rng, 0.14)));
      }
    }
    p.at(0, 0, 0, stroke([cx, by + 4, cx, by - (r[3] - 30) * 0.5, cx, r[1] + 12], 11, rachis, 0.2));
  };
  p.region(REG.frond, [0.3, 0.44, 0.14],
    () => paintFrond(REG.frond, [0.34, 0.5, 0.15], [0.6, 0.6, 0.28], 0.95, 8, 0.05));
  p.region(REG.dead, [0.38, 0.33, 0.26],
    () => paintFrond(REG.dead, [0.42, 0.36, 0.28], [0.46, 0.41, 0.33], 0.35, 5, 0.25));

  const b = REG.broad;
  p.region(b, [0.2, 0.36, 0.1], () =>
    spray(p, b, rng, 95, 5, () => ({ len: rng.range(62, 92), w: rng.range(18, 26), peak: 0.42, tip: 1.3 }),
      [0.24, 0.47, 0.12], [0.3, 0.24, 0.15], 5));
  const tp = REG.temperate;
  p.region(tp, [0.26, 0.42, 0.13], () =>
    spray(p, tp, rng, 150, 5, () => ({ len: rng.range(44, 64), w: rng.range(15, 21), peak: 0.45, serr: 1 }),
      [0.32, 0.52, 0.16], [0.32, 0.25, 0.16], 4));
  const mg = REG.mangrove;
  p.region(mg, [0.16, 0.3, 0.1], () =>
    spray(p, mg, rng, 90, 5, () => ({ len: rng.range(55, 78), w: rng.range(18, 23), peak: 0.5, tip: 0.5 }),
      rng.next() < 0.5 ? [0.2, 0.36, 0.11] : [0.26, 0.4, 0.14], [0.28, 0.22, 0.14], 3));
  const sc = REG.scrub;
  p.region(sc, [0.36, 0.44, 0.17], () =>
    spray(p, sc, rng, 34, 4, () => ({ len: rng.range(72, 105), w: rng.range(34, 48), round: true }),
      [0.42, 0.52, 0.18], [0.45, 0.28, 0.18], 4));

  // flowering shrub: dark leaves with white five-petal blossoms that take their colour in the shader
  const fl = REG.flower;
  p.region(fl, [0.18, 0.33, 0.1], () => {
    spray(p, fl, rng, 40, 4, () => ({ len: rng.range(70, 98), w: rng.range(24, 32), peak: 0.4, tip: 1.1 }),
      [0.2, 0.38, 0.11], [0.3, 0.22, 0.14], 3);
    for (let i = 0; i < 9; i++) {
      const x = fl[0] + rng.range(70, fl[2] - 70), y = fl[1] + rng.range(60, fl[3] - 150), rot = rng.range(0, 6.28),
        sz = rng.range(0.8, 1.15);
      for (let k = 0; k < 5; k++) p.at(x, y, rot + (k * Math.PI * 2) / 5,
        leaf({ len: 46 * sz, w: 20 * sz, peak: 0.6, round: false, tip: 0.5 }, [0.97, 0.96, 0.95], 3,
          [0.85, 0.85, 0.85]));
      p.at(x, y, rot, leaf({ len: 22 * sz, w: 3, peak: 0.5 }, [0.95, 0.8, 0.2], 0, [0.95, 0.75, 0.2]));
    }
  });

  // pine: a twig with needle fascicles, fresh growth paler at the tip
  const pn = REG.pine;
  p.region(pn, [0.12, 0.22, 0.1], () => {
    const cx = pn[0] + pn[2] / 2, by = pn[1] + pn[3] - 4;
    const twig = (x0: number, y0: number, a: number, l: number, needle: number) => {
      p.at(0, 0, 0, stroke([x0, y0, x0 + Math.sin(a) * l, y0 - Math.cos(a) * l], 6, [0.3, 0.22, 0.14], 0.5));
      for (let d = 0; d < l; d += 5) {
        const x = x0 + Math.sin(a) * d, y = y0 - Math.cos(a) * d, t = d / l;
        const c: RGB = t > 0.82 ? [0.26, 0.42, 0.18] : [0.12, 0.26, 0.11];
        for (const sd of [1, -1]) {
          const na = a + sd * rng.range(0.45, 1.1) * (1 - 0.4 * t);
          p.at(x, y, na,
            stroke([0, 0, 0, -needle * (1 - 0.35 * t) * rng.range(0.8, 1.1)], 3.2, shift(c, rng, 0.15), 0.6));
        }
      }
    };
    twig(cx, by, 0, pn[3] - 40, 78);
    for (let k = 0; k < 4; k++) twig(cx, by - 70 - k * 85, (k % 2 ? 1 : -1) * rng.range(0.6, 0.9), rng.range(110, 160),
      52);
  });

  // fern frond: pinnae of lobed leaflets, longest a third of the way up
  const fn = REG.fern;
  p.region(fn, [0.2, 0.4, 0.12], () => {
    const cx = fn[0] + fn[2] / 2, by = fn[1] + fn[3] - 4;
    for (let i = 0; i < 26; i++) {
      const t = 0.05 + (0.93 * i) / 25, y = by - t * (fn[3] - 16);
      const len = 118 * Math.pow(Math.sin(Math.PI * Math.min(1, t * 0.85 + 0.12)), 0.8) * (1 - 0.35 * t);
      for (const sd of [1, -1]) p.at(cx, y, sd * (1.25 - 0.4 * t),
        leaf({ len, w: 13, peak: 0.3, serr: 2 }, shift([0.27, 0.5, 0.14], rng, 0.1), 0));
    }
    p.at(0, 0, 0, stroke([cx, by + 4, cx, fn[1] + 10], 5, [0.25, 0.35, 0.12], 0.3));
  });

  // kelp blade: a long ruffled ribbon with its gas bladder at the base
  const kp = REG.kelp;
  p.region(kp, [0.58, 0.46, 0.18], () => {
    p.at(kp[0] + kp[2] / 2, kp[1] + kp[3] - 30, 0,
      leaf({ len: kp[3] - 40, w: kp[2] * 0.4, peak: 0.35, serr: 2.2, tip: 0.6 }, [0.66, 0.52, 0.2], 0,
        [0.78, 0.64, 0.3]));
    p.at(kp[0] + kp[2] / 2, kp[1] + kp[3] - 2, 0, leaf({ len: 38, w: 16, round: true }, [0.72, 0.55, 0.2]));
  });

  // ivy: winding stems with lobed leaves
  const vn = REG.vine;
  p.region(vn, [0.15, 0.3, 0.1], () => {
    for (let k = 0; k < 5; k++) {
      let x = vn[0] + 50 + k * 100 + rng.range(-20, 20), y = vn[1] + vn[3] - 4, a = rng.range(-0.3, 0.3);
      for (let i = 0; i < 16; i++) {
        const nx = x + Math.sin(a) * 34, ny = y - Math.cos(a) * 34;
        p.at(0, 0, 0, stroke([x, y, nx, ny], 4, [0.26, 0.22, 0.12]));
        p.at(nx, ny, a + (i % 2 ? 1 : -1) * rng.range(0.7, 1.3),
          leaf({ len: rng.range(40, 58), w: rng.range(20, 27), peak: 0.3, tip: 0.6 },
            shift([0.17, 0.36, 0.12], rng, 0.15), 3));
        x = nx; y = ny; a += rng.range(-0.45, 0.45);
      }
    }
  });

  // sea fan: a branching lattice
  const sf = REG.fan;
  p.region(sf, [0.75, 0.68, 0.78], () => {
    const branch = (x: number, y: number, a: number, l: number, w: number, depth: number): void => {
      const nx = x + Math.sin(a) * l, ny = y - Math.cos(a) * l;
      p.at(0, 0, 0, stroke([x, y, nx, ny], w, [0.85, 0.78, 0.86]));
      if (depth === 0) return;
      for (const sd of [-1, 1]) branch(nx, ny, a + sd * rng.range(0.2, 0.45), l * rng.range(0.7, 0.85), w * 0.75,
        depth - 1);
    };
    for (let k = -2; k <= 2; k++) branch(sf[0] + sf[2] / 2, sf[1] + sf[3] - 4, k * 0.38, 120, 9, 4);
    for (let i = 0; i < 70; i++) {
      const a = rng.range(-1.1, 1.1), d0 = rng.range(80, 420);
      const x0 = sf[0] + sf[2] / 2 + Math.sin(a) * d0, y0 = sf[1] + sf[3] - Math.cos(a) * d0;
      const b2 = a + rng.range(0.1, 0.2), d1 = d0 + rng.range(-20, 20);
      p.at(0, 0, 0,
        stroke([x0, y0, sf[0] + sf[2] / 2 + Math.sin(b2) * d1, sf[1] + sf[3] - Math.cos(b2) * d1], 3,
          [0.8, 0.72, 0.82]));
    }
  });

  return p.texture();
}

// ---------------------------------------------------------------------------------------------
// Geometry. All plants are built around a vertical trunk spine of nominal height `trunk`; each vertex is stored
// relative to its spine point (0, s·trunk, 0) so instances can set their own trunk height, lean and curl.
type Vec = THREE.Vector3;
const vec = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const UP = vec(0, 1, 0);
const col = (r: number, g: number, b: number) => new THREE.Color(r, g, b); // linear

class Mesher {
  private readonly raw: number[] = [];
  private readonly a = { position: [] as number[], normal: [] as number[], uv: [] as number[], color: [] as number[],
    aSpine: [] as number[], aMat: [] as number[] };
  private readonly idx: number[] = [];
  private n = 0;
  private readonly trunk: number;
  /** Crown variant tag for vertices added from now on: 0 shared by all instances, k shown only by variant k. */
  variant = 0;

  constructor(trunk = 1) {
    this.trunk = trunk;
  }

  /** Index the next vertex will get. */
  get next(): number {
    return this.n;
  }

  /** s: spine parameter; bw/lw: branch-sway and leaf-flutter weights; tint: how much the instance tint applies. */
  vert(p: Vec, nrm: Vec, u: number, v: number, c: THREE.Color, mat: number, s = 0, bw = 0, lw = 0, ph = 0,
    tint = 0): number {
    const a = this.a;
    this.raw.push(p.x, p.y, p.z);
    a.position.push(p.x, p.y - s * this.trunk, p.z);
    a.normal.push(nrm.x, nrm.y, nrm.z);
    a.uv.push(u, v);
    a.color.push(c.r, c.g, c.b);
    a.aSpine.push(s, bw, lw, ph);
    a.aMat.push(mat, tint, this.variant);
    return this.n++;
  }

  /** A triangle wound so that its front face looks along `facing`. */
  tri(i: number, j: number, k: number, facing: Vec): void {
    const r = this.raw;
    const ax = r[j * 3] - r[i * 3], ay = r[j * 3 + 1] - r[i * 3 + 1], az = r[j * 3 + 2] - r[i * 3 + 2];
    const bx = r[k * 3] - r[i * 3], by = r[k * 3 + 1] - r[i * 3 + 1], bz = r[k * 3 + 2] - r[i * 3 + 2];
    const d = (ay * bz - az * by) * facing.x + (az * bx - ax * bz) * facing.y + (ax * by - ay * bx) * facing.z;
    if (d >= 0) this.idx.push(i, j, k);
    else this.idx.push(i, k, j);
  }

  /** A triangle already wound counter-clockwise seen from its front. */
  wound(i: number, j: number, k: number): void {
    this.idx.push(i, j, k);
  }

  quad(i: number, j: number, k: number, l: number, facing: Vec): void {
    this.tri(i, j, k, facing);
    this.tri(i, k, l, facing);
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry(), a = this.a;
    g.setAttribute('position', new THREE.Float32BufferAttribute(a.position, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(a.normal, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(a.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(a.color, 3));
    g.setAttribute('aSpine', new THREE.Float32BufferAttribute(a.aSpine, 4));
    g.setAttribute('aMat', new THREE.Float32BufferAttribute(a.aMat, 3));
    g.setIndex(this.idx);
    return g;
  }
}

interface Ring {
  p: Vec;
  r: number;
  s: number;
  c: THREE.Color;
  bw?: number;
}
interface TubeOpt {
  radial: number;
  mat: number;
  uRep?: number; // texture repeats around
  vScale?: number; // texture repeats per unit length
  shape?: (a: number, i: number) => number; // radius multiplier by angle (buttresses, flutes)
  ph?: number;
}

/** A craft tube through the rings, written with each ring's colour, spine parameter and sway weight. */
function tube(m: Mesher, rings: Ring[], o: TubeOpt): void {
  craftTube({
    vert: (p, n, s, t, i) => {
      const rg = rings[i];
      return m.vert(p, n, s * (o.uRep ?? 1), t * (o.vScale ?? 1), rg.c, o.mat, rg.s, rg.bw ?? 0, 0, o.ph ?? 0);
    },
    tri: (a, b, c) => m.wound(a, b, c),
  }, rings.map((r) => r.p), (i) => rings[i].r, o.radial, { shape: o.shape });
}

interface Path {
  pts: Vec[];
  tans: Vec[];
}

/** A drooping arc (frond rachis, fern frond, grass blade): starts at `elev` and bends down by `droop` radians. */
function arc(base: Vec, az: number, elev: number, droop: number, len: number, n: number, pow = 1.6): Path {
  const pts = [base.clone()], tans: Vec[] = [];
  for (let i = 0; i <= n; i++) {
    const e = elev - droop * Math.pow(i / n, pow);
    tans.push(vec(Math.cos(e) * Math.cos(az), Math.sin(e), Math.cos(e) * Math.sin(az)));
    if (i < n) pts.push(pts[i].clone().addScaledVector(tans[i], len / n));
  }
  return { pts, tans };
}

/** Point and tangent at fraction t along a path. */
function along(p: Path, t: number): [Vec, Vec] {
  const f = t * (p.pts.length - 1), i = Math.min(p.pts.length - 2, Math.floor(f)), k = f - i;
  return [p.pts[i].clone().lerp(p.pts[i + 1], k), p.tans[i].clone().lerp(p.tans[i + 1], k).normalize()];
}

interface Strip {
  halfW: (t: number) => number;
  fold: number; // each half hangs down by this angle (a roof-shaped fold)
  reg: Region;
  c: THREE.Color;
  s: number;
  bw: (t: number) => number;
  lw?: number;
  ph: number;
  tint?: number;
}

/** A folded textured strip along a path: the two halves hang from the midrib like a frond's leaflets. */
function ribbon(m: Mesher, path: Path, side: Vec, o: Strip): void {
  const n = path.pts.length, cf = Math.cos(o.fold), sf = Math.sin(o.fold);
  let prev: number[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1), P = path.pts[i], T = path.tans[i];
    const S = side.clone().addScaledVector(T, -side.dot(T)).normalize(), Nf = vec().crossVectors(S, T).normalize();
    const hw = o.halfW(t), nl = Nf.clone().multiplyScalar(cf).addScaledVector(S, -sf),
      nr = Nf.clone().multiplyScalar(cf).addScaledVector(S, sf);
    const L = P.clone().addScaledVector(S, -hw * cf).addScaledVector(Nf, -hw * sf);
    const Rr = P.clone().addScaledVector(S, hw * cf).addScaledVector(Nf, -hw * sf);
    const bw = o.bw(t), lw = (o.lw ?? 1) * t, tint = o.tint ?? 1;
    const v = (p: Vec, nn: Vec, fu: number) => {
      const [u, w] = regUV(o.reg, fu, t);
      return m.vert(p, nn, u, w, o.c, M.LEAF, o.s, bw, lw * (fu === 0.5 ? 0.3 : 1), o.ph, tint);
    };
    const row = [v(L, nl, 0), v(P, nl, 0.5), v(P, nr, 0.5), v(Rr, nr, 1)];
    if (i) {
      m.quad(prev[0], prev[1], row[1], row[0], nl);
      m.quad(prev[2], prev[3], row[3], row[2], nr);
    }
    prev = row;
  }
}

/** A flat textured card; n is the shading normal (crown cards point it away from the crown centre). */
function card(m: Mesher, c: Vec, ax: Vec, ay: Vec, n: Vec, reg: Region, color: THREE.Color, s: number, bw: number,
  ph: number, mat: number = M.CARD): void {
  const ids = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([i, j]) => {
    const [u, v] = regUV(reg, (i + 1) / 2, (j + 1) / 2);
    return m.vert(c.clone().addScaledVector(ax, i).addScaledVector(ay, j), n, u, v, color, mat, s, bw,
      0.4 + 0.3 * (j + 1), ph, 1);
  });
  m.quad(ids[0], ids[1], ids[2], ids[3], vec().crossVectors(ax, ay));
}

/** A UV ellipsoid, or its upper half (coconuts, coral domes). */
function ball(m: Mesher, c: Vec, r: Vec, seg: number, rows: number, color: THREE.Color, mat: number, s = 0, bw = 0,
  ph = 0, hemi = false): void {
  const base = m.next, d = vec(), p = vec();
  const lat = (j: number) => -Math.PI / 2 + Math.PI * (hemi ? 0.5 + (0.5 * j) / rows : j / rows);
  const dir = (j: number, i: number) => d.set(Math.cos(lat(j)) * Math.cos((i / seg) * Math.PI * 2), Math.sin(lat(j)),
    Math.cos(lat(j)) * Math.sin((i / seg) * Math.PI * 2));
  for (let j = 0; j <= rows; j++) {
    for (let i = 0; i <= seg; i++) {
      dir(j, i);
      p.set(d.x * r.x, d.y * r.y, d.z * r.z).add(c);
      m.vert(p, vec(d.x / r.x, d.y / r.y, d.z / r.z).normalize(), i / seg, j / rows, color, mat, s, bw, 0, ph);
    }
  }
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < seg; i++) {
      const a = base + j * (seg + 1) + i, b = a + seg + 1;
      m.quad(a, a + 1, b + 1, b, dir(j + 0.5, i + 0.5).clone());
    }
  }
}

/** One palm leaflet: a narrow blade V-folded along its midrib, sagging toward its tip. */
function leaflet(m: Mesher, B: Vec, dir: Vec, Nf: Vec, len: number, w: number, sag: number, c: THREE.Color, bw: number,
  ph: number): void {
  const W = vec().crossVectors(Nf, dir).normalize(), NL = vec().crossVectors(dir, W).normalize();
  const mid = B.clone().addScaledVector(dir, len * 0.5).addScaledVector(UP, -sag * len * 0.22);
  const end = B.clone().addScaledVector(dir, len).addScaledVector(UP, -sag * len * 0.75);
  const v = (p: Vec, n: Vec, fu: number, fv: number) => {
    const [u, vv] = regUV(REG.leaflet, fu, fv);
    return m.vert(p, n, u, vv, c, M.LEAF, 1, bw + len * 0.4 * fv, fv, ph, 1);
  };
  const b = v(B, NL, 0.5, 0);
  const l = v(mid.clone().addScaledVector(W, -w), NL.clone().addScaledVector(W, 0.35).normalize(), 0, 0.5);
  const k = v(mid.clone().addScaledVector(NL, -w * 0.3), NL, 0.5, 0.5);
  const r = v(mid.clone().addScaledVector(W, w), NL.clone().addScaledVector(W, -0.35).normalize(), 1, 0.5);
  const e = v(end, NL, 0.5, 1);
  m.tri(b, l, k, NL);
  m.tri(b, k, r, NL);
  m.tri(l, e, k, NL);
  m.tri(k, e, r, NL);
}

function randomUnit(rng: Rng): Vec {
  const z = rng.range(-1, 1), a = rng.range(0, Math.PI * 2), r = Math.sqrt(1 - z * z);
  return vec(r * Math.cos(a), z, r * Math.sin(a));
}

/** Leaf cards spread through an ellipsoidal cluster, shaded as part of the whole crown's volume. */
function cluster(m: Mesher, rng: Rng, c: Vec, r: number, flat: number, crown: Vec, n: number, size: number,
  reg: Region, s: number, bw: number): void {
  for (let k = 0; k < n; k++) {
    const o = randomUnit(rng);
    const p = c.clone().add(vec(o.x * r * 0.6, o.y * r * 0.6 * flat, o.z * r * 0.6));
    const out = p.clone().sub(crown).normalize();
    const nn = randomUnit(rng).multiplyScalar(0.7).addScaledVector(out, 1).addScaledVector(UP, 0.5).normalize();
    let ay = out.clone().addScaledVector(nn, -out.dot(nn));
    if (ay.lengthSq() < 1e-4) ay = randomUnit(rng).cross(nn);
    ay.normalize().multiplyScalar(size);
    const ax = vec().crossVectors(ay, nn).normalize().multiplyScalar(size);
    const tone = rng.range(0.82, 1.12);
    card(m, p, ax, ay, nn.clone().lerp(out, 0.65).normalize(), reg,
      col(tone, tone * rng.range(0.97, 1.05), tone * 0.95), s, bw, rng.range(0, 6.28));
  }
}

// ---- palms ---------------------------------------------------------------------------------------
interface PalmStyle {
  fronds: number;
  nuts: number;
  dead: number;
  droop: number;
  len: number;
  seed: number;
}
const PALM_H = 3.2;
const PALMS: PalmStyle[] = [
  { fronds: 15, nuts: 9, dead: 2, droop: 1, len: 1.8, seed: 11 },
  { fronds: 19, nuts: 4, dead: 3, droop: 1.25, len: 1.6, seed: 23 },
];
const NUTS = [col(0.17, 0.26, 0.04), col(0.38, 0.33, 0.06), col(0.22, 0.12, 0.05)];

// a swollen bole at the foot (buried a little), slender above, narrowing under the crown
const palmRadius = (s: number) => 0.1 * (1 + 1.1 * Math.exp(-s * 14)) * (1 - 0.3 * s);

/**
 * Coconut palm: one ringed trunk carrying every crown style, each tagged so an instance shows only its own.
 * lod 0: geometric leaf-scar rings, fronds of individual leaflets, nuts, dead fronds; 1: textured fronds; 2: far.
 */
function palm(lod: number): THREE.BufferGeometry {
  const m = new Mesher(PALM_H);
  // the scanned bark is dark; palm trunks weather to a pale grey
  const bark = col(3.4, 3.1, 2.75), foot = col(1.7, 1.6, 1.25);
  // trunk: leaf-scar rings in the geometry up close (ridge, shoulder, groove), the bark texture alone further out
  const rings: Ring[] = [], nR = [30, 14, 4][lod];
  const prof = lod ? [[0, 1, 1]] : [[0, 1, 1], [0.58, 0.985, 0.9], [0.84, 0.915, 0.55]];
  for (let k = 0; k <= nR; k++) {
    for (const [f, rr, shade] of k < nR ? prof : [[0, 1, 1]]) {
      const s = (k + f) / nR;
      rings.push({ p: vec(0, s * PALM_H, 0), r: palmRadius(s) * rr, s,
        c: bark.clone().multiplyScalar(shade).lerp(foot, smoothstep(0.1, 0, s) * 0.7) });
    }
  }
  tube(m, rings, { radial: [10, 8, 5][lod], mat: M.PALM, vScale: 1.25 });
  PALMS.forEach((st, k) => {
    m.variant = k + 1;
    palmCrown(m, st, lod);
  });
  return m.build();
}

function palmCrown(m: Mesher, st: PalmStyle, lod: number): void {
  const rng = new Rng(st.seed), rt = palmRadius(1);
  for (let i = 0; i < st.fronds; i++) {
    const age = i / (st.fronds - 1); // 0 the young upright spear … 1 the oldest, hanging lowest
    const az = i * 2.39996 + rng.range(-0.15, 0.15);
    const elev = mix(1.2, -0.05, age) + rng.range(-0.12, 0.12);
    const droop = (mix(0.45, 1.45, age) + rng.range(-0.15, 0.15)) * st.droop;
    const len = st.len * mix(0.72, 1.05, Math.min(1, age * 1.7)) * rng.range(0.9, 1.08);
    if (lod === 2 && i % 2) continue;
    const base = vec(Math.cos(az) * 0.05, PALM_H + 0.03 - 0.14 * age, Math.sin(az) * 0.05);
    const path = arc(base, az, elev, droop, len, [9, 7, 4][lod]);
    const side = vec(-Math.sin(az), 0, Math.cos(az)), ph = i * 1.37;
    const tone = col(1.12, 1.1, 0.88).lerp(col(0.92, 0.82, 0.58), age);
    const bw = (t: number) => len * 0.6 * Math.pow(t, 1.5);
    if (lod < 2) {
      const sheath = vec(Math.cos(az) * rt * 0.5, PALM_H - 0.22 - 0.12 * age, Math.sin(az) * rt * 0.5);
      tube(m, [
        { p: sheath, r: 0.05, s: 1, c: col(1.7, 1.35, 0.95) },
        { p: base, r: 0.032, s: 1, c: col(1.8, 1.65, 1.0) },
        { p: path.pts[1], r: 0.02, s: 1, c: col(1.5, 1.7, 0.8), bw: bw(1 / (path.pts.length - 1)) },
      ], { radial: lod ? 3 : 5, mat: M.PALM, vScale: 2, ph });
    }
    if (lod > 0) {
      ribbon(m, path, side,
        { halfW: () => 0.37 * (len / 1.8), fold: 0.6 + 0.35 * age, reg: REG.frond, c: tone, s: 1, bw, ph });
      continue;
    }
    const n = path.pts.length - 1;
    tube(m, path.pts.map((p, k) => ({ p, r: 0.022 * (1 - (0.75 * k) / n), s: 1, c: col(0.5, 0.5, 0.2),
      bw: bw(k / n) })), { radial: 3, mat: M.SOLID, ph });
    const pairs = 30;
    for (let j = 0; j < pairs; j++) {
      const t = 0.1 + (0.88 * j) / (pairs - 1);
      const [P, T] = along(path, t);
      const S = side.clone().addScaledVector(T, -side.dot(T)).normalize(), Nf = vec().crossVectors(S, T).normalize();
      const pr = Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.08)), 0.55);
      const ll = 0.44 * (len / 1.8) * (0.25 + 0.75 * pr), fwd = 0.85 + 0.3 * t, dr = mix(0.3, 0.85, age) + 0.25 * t;
      for (const sg of [1, -1]) {
        const dir = T.clone().multiplyScalar(Math.cos(fwd)).addScaledVector(S, sg * Math.sin(fwd));
        dir.multiplyScalar(Math.cos(dr)).addScaledVector(Nf, -Math.sin(dr)).normalize();
        leaflet(m, P.clone().addScaledVector(S, sg * 0.012), dir, Nf, ll, 0.034 * (0.55 + 0.45 * pr), 0.3 + 0.35 * age,
          tone, bw(t), ph + j * 0.37 + sg);
      }
    }
  }
  if (lod === 2) return;

  // a cluster of nuts tucked under the crown, and old fronds hanging dead along the trunk (on the side away from
  // where the trunk curves back, so they never cross it)
  const nr = new Rng(st.seed + 1);
  for (let k = 0; k < (lod ? Math.min(3, st.nuts) : st.nuts); k++) {
    const tier = k % 2, a = k * 2.4 + nr.range(-0.3, 0.3), r = nr.range(0.068, 0.085), d = rt + r + 0.012 + tier * 0.02;
    const c = vec(Math.cos(a) * d, PALM_H - 0.1 - tier * 0.13 - nr.range(0, 0.04), Math.sin(a) * d);
    ball(m, c, vec(r, r * 1.15, r), lod ? 5 : 7, lod ? 3 : 5, NUTS[nr.int(3)], M.SOLID, 1, 0.02);
  }
  const dr = new Rng(st.seed + 2);
  for (let k = 0; k < st.dead; k++) {
    const az = dr.range(-1.1, 1.1), base = vec(Math.cos(az) * 0.09, PALM_H - 0.2, Math.sin(az) * 0.09);
    const path = arc(base, az, -1.05 - dr.range(0, 0.3), 0.25, st.len * 0.75, lod ? 4 : 8, 1);
    ribbon(m, path, vec(-Math.sin(az), 0, Math.cos(az)), {
      halfW: (t) => 0.2 * (1 - 0.5 * t), fold: 1, reg: REG.dead, c: col(0.72, 0.64, 0.56), s: 1,
      bw: (t) => 0.3 * t, lw: 0.3, ph: k * 2.1, tint: 0,
    });
  }
}

// ---- broadleaf trees -------------------------------------------------------------------------------
interface TreeStyle {
  trunk: number; // height of the fork
  radius: number;
  limbs: number;
  fork: number; // lowest limb, fraction of the trunk
  spread: [number, number]; // limb angle from vertical
  limbLen: [number, number];
  cluster: number; // leaf-cluster radius
  flat: number; // cluster vertical squash
  reg: Region;
  tropical: boolean; // buttress roots and lianas
  seed: number;
}
const JUNGLE: TreeStyle = {
  trunk: 2.6, radius: 0.16, limbs: 5, fork: 0.62, spread: [0.85, 1.2], limbLen: [1.5, 2.2], cluster: 1.3, flat: 0.6,
  reg: REG.broad, tropical: true, seed: 101,
};
const OAK: TreeStyle = {
  trunk: 2.1, radius: 0.14, limbs: 5, fork: 0.5, spread: [0.45, 0.85], limbLen: [1.2, 1.7], cluster: 0.85, flat: 0.85,
  reg: REG.temperate, tropical: false, seed: 202,
};

function treeGeo(st: TreeStyle, lod: number): THREE.BufferGeometry {
  const rng = new Rng(st.seed), m = new Mesher(st.trunk), H = st.trunk,
    bark = st.tropical ? col(2.3, 2.5, 2.8) : col(1.5, 1.6, 1.8);
  // skeleton, identical for every LOD
  const limbs: { s: number; len: number; pts: Vec[]; subs: Vec[][]; tips: { c: Vec; r: number }[] }[] = [];
  for (let k = 0; k < st.limbs; k++) {
    const s = mix(st.fork, 1, k / (st.limbs - 1)) * rng.range(0.95, 1);
    const az = (k / st.limbs) * Math.PI * 2 + rng.range(-0.4, 0.4), sp = rng.range(...st.spread),
      len = rng.range(...st.limbLen);
    const d = vec(Math.sin(sp) * Math.cos(az), Math.cos(sp), Math.sin(sp) * Math.sin(az)), o = vec(0, s * H, 0);
    const pts = [0, 1, 2, 3].map((i) =>
      o.clone().addScaledVector(d, (len * i) / 3).addScaledVector(UP, len * 0.15 * (i / 3) ** 2));
    const subs: Vec[][] = [],
      tips = [{ c: pts[3].clone().addScaledVector(UP, 0.15), r: st.cluster * rng.range(0.95, 1.2) }];
    for (const [from, turn] of [[2, 0.6], [3, -0.55]]) {
      const sd = d.clone().applyAxisAngle(UP, turn + rng.range(-0.2, 0.2));
      sd.y += 0.4;
      sd.normalize();
      const sl = len * rng.range(0.4, 0.55), p0 = pts[from];
      const sub = [p0.clone(), p0.clone().addScaledVector(sd, sl * 0.5),
        p0.clone().addScaledVector(sd, sl).addScaledVector(UP, sl * 0.1)];
      subs.push(sub);
      tips.push({ c: sub[2].clone().addScaledVector(UP, 0.1), r: st.cluster * rng.range(0.85, 1.1) });
    }
    limbs.push({ s, len, pts, subs, tips });
  }
  const crown = vec();
  limbs.forEach((l) => l.tips.forEach((t) => crown.addScaledVector(t.c, 1 / (limbs.length * 3))));
  const topC = vec(0, crown.y + st.cluster * 0.5, 0);
  crown.y -= 0.5;

  // trunk: buttress fins or a root flare, finer rows near the ground where the shape changes fastest
  const rows = [12, 5, 2][lod], rs: number[] = [];
  for (let k = 0; k <= rows; k++) rs.push((k / rows) ** 1.6);
  const shape = lod === 2 ? undefined : st.tropical
    ? (a: number, i: number) => 1 + 2.4 * Math.exp(-rs[i] * 11) * Math.pow(Math.max(0, Math.cos(5 * a + 0.5)), 6)
    : (a: number, i: number) => 1 + 0.4 * Math.exp(-rs[i] * 14) * (0.6 + 0.4 * Math.cos(4 * a + 1));
  tube(m, rs.map((s) => ({ p: vec(0, s * H, 0), r: st.radius * (1 - 0.3 * s), s,
    c: bark.clone().multiplyScalar(mix(0.75, 1, smoothstep(0, 0.3, s))) })),
    { radial: [16, 8, 4][lod], mat: M.BARK, uRep: 2, vScale: 0.8, shape });

  const frng = new Rng(st.seed + 7);
  for (const l of limbs) {
    const bw = (i: number, n: number) => (l.len * 0.35 * i) / n;
    if (lod < 2) {
      tube(m, l.pts.map((p, i) => ({ p, r: st.radius * 0.55 * (1 - (0.6 * i) / 3), s: l.s, c: bark, bw: bw(i, 3) })),
        { radial: lod ? 4 : 6, mat: M.BARK, uRep: 1, vScale: 0.8 });
      if (lod === 0) for (const sub of l.subs) tube(m,
        sub.map((p, i) => ({ p, r: st.radius * 0.28 * (1 - 0.6 * i / 2), s: l.s, c: bark,
          bw: l.len * 0.35 })), { radial: 4, mat: M.BARK, uRep: 1, vScale: 0.8 });
      for (const t of l.tips) cluster(m, frng, t.c, t.r, st.flat, crown, lod ? 4 : 9, t.r * (lod ? 1 : 0.62), st.reg,
        l.s, l.len * 0.35 + 0.1);
    } else {
      const c = vec(), span = vec();
      l.tips.forEach((t) => c.addScaledVector(t.c, 1 / 3));
      l.tips.forEach((t) => span.max(vec(Math.abs(t.c.x - c.x), Math.abs(t.c.y - c.y),
        Math.abs(t.c.z - c.z)).addScalar(t.r * 0.85)));
      cluster(m, frng, c, Math.max(span.x, span.z) * 0.8, st.flat, crown, 3, Math.max(span.x, span.z) * 0.9, st.reg,
        l.s, l.len * 0.35);
    }
  }
  cluster(m, frng, topC, st.cluster * 1.1, st.flat, crown, [9, 4, 3][lod], st.cluster * [0.68, 1, 1.1][lod],
    st.reg, 1, 0.3);

  if (st.tropical && lod === 0) {
    // lianas looping down from the first limbs, ivy climbing the bole above the buttresses
    for (const l of limbs.slice(0, 2)) {
      const a = l.pts[1], b = vec(a.x * 1.15, a.y * 0.5, a.z * 1.15), side = vec(-a.z, 0, a.x).normalize();
      const pts = [0, 1, 2, 3, 4, 5].map((i) =>
        a.clone().lerp(b, i / 5).addScaledVector(side, Math.sin((Math.PI * i) / 5) * 0.2));
      tube(m, pts.map((p, i) => ({ p, r: 0.016, s: l.s, c: bark, bw: 0.1 + i * 0.06 })),
        { radial: 3, mat: M.BARK, vScale: 0.8 });
      for (let i = 1; i < 6; i++) {
        const out = vec(pts[i].x, 0, pts[i].z).normalize();
        card(m, pts[i], vec().crossVectors(UP, out).multiplyScalar(0.13), vec(0, 0.15, 0), out, REG.vine, col(1, 1, 1),
          l.s, 0.1 + i * 0.06, i, M.LEAF);
      }
    }
    for (let k = 0; k < 12; k++) {
      const y = 0.9 + k * 0.17, a = k * 1.3, out = vec(Math.cos(a), 0, Math.sin(a)), s = y / H;
      const p = out.clone().multiplyScalar(st.radius * (1 - 0.3 * s) + 0.015).setY(y);
      card(m, p, vec().crossVectors(UP, out).multiplyScalar(0.075), vec(0, 0.11, 0), out, REG.vine, col(1, 1, 1), s, 0,
        k, M.LEAF);
    }
  }
  return m.build();
}

// ---- wind-sculpted pine: lean is per instance (downwind along +x); the crown is flagged toward +x --------
const PINE_H = 4.4;
function pine(lod: number): THREE.BufferGeometry {
  const rng = new Rng(303), m = new Mesher(PINE_H), H = PINE_H, bark = col(1.3, 1.35, 1.5);
  const rad = (s: number) => 0.13 * (1 - 0.88 * s) + 0.012 + 0.07 * Math.exp(-s * 14);
  const rows = [16, 6, 3][lod];
  tube(m, Array.from({ length: rows + 1 }, (_, k) => {
    const s = k / rows;
    return { p: vec(0, s * H, 0), r: rad(s), s, c: bark };
  }), { radial: [9, 6, 4][lod], mat: M.BARK, uRep: 2, vScale: 0.9 });

  const brs: { s: number; pts: Vec[]; len: number; dir: Vec }[] = [];
  for (let w = 0; w < 12; w++) {
    const s = 0.24 + 0.74 * (w / 11) + rng.range(-0.015, 0.015), phi0 = rng.range(0, Math.PI * 2);
    for (let k = 0; k < 5; k++) {
      const phi = phi0 + k * 1.2566 + rng.range(-0.25, 0.25);
      const lee = smoothstep(-0.45, 0.9, Math.cos(phi)); // the windward side is stunted, more so higher up
      const reach = 0.25 + 1.55 * Math.pow(1 - s, 0.85);
      const len = reach * mix(1, 0.15 + 0.85 * lee, 0.35 + 0.65 * s) * rng.range(0.8, 1.15) + 0.12;
      const e = mix(-0.45, 0.05, s) + rng.range(-0.1, 0.1);
      const dir = vec(Math.cos(e) * Math.cos(phi), Math.sin(e), Math.cos(e) * Math.sin(phi)), o = vec(0, s * H, 0);
      const pts = [0, 1, 2, 3].map((i) =>
        o.clone().addScaledVector(dir, (len * i) / 3).addScaledVector(UP, len * 0.18 * (i / 3) ** 2));
      brs.push({ s, len, dir, pts });
    }
  }
  const crng = new Rng(304), needle = (r: Rng) => col(r.range(0.85, 1.1), r.range(0.9, 1.1), r.range(0.85, 1));
  if (lod < 2) {
    for (const b of brs) {
      const bw = (i: number) => (b.len * 0.4 * i) / 3;
      if (lod === 0) tube(m,
        b.pts.map((p, i) => ({ p, r: rad(b.s) * 0.35 * (1 - (0.7 * i) / 3) + 0.006, s: b.s, c: bark,
          bw: bw(i) })), { radial: 3, mat: M.BARK, vScale: 0.9 });
      const n = lod ? 1 : b.len > 0.8 ? 3 : 2, side = vec().crossVectors(UP, b.dir).normalize();
      for (let k = 0; k < n; k++) {
        const t = 0.3 + (0.7 * (k + 0.5)) / n, [p] = along({ pts: b.pts, tans: b.pts.map(() => b.dir) }, t);
        const hl = (b.len * 0.7 * 0.65) / n + 0.08, hw = 0.16 + 0.12 * b.len;
        const ay = b.dir.clone().multiplyScalar(hl), out = vec(p.x, 0.5, p.z).normalize();
        for (const twist of lod ? [0] : [0, 1.3]) {
          const ax = side.clone().applyAxisAngle(b.dir, twist + crng.range(-0.2, 0.2)).multiplyScalar(hw);
          const nn = vec().crossVectors(ax, ay).normalize();
          if (nn.y < 0) nn.negate();
          card(m, p, ax, ay, nn.lerp(out, 0.6).normalize(), REG.pine, needle(crng), b.s, bw(3 * t),
            crng.range(0, 6.28));
        }
      }
    }
    // the leader, swept leeward
    for (const twist of [0, 1.6]) {
      const ay = vec(0.45, 1, 0).normalize().multiplyScalar(0.32),
        ax = vec(0, 0, 0.2).applyAxisAngle(ay.clone().normalize(), twist);
      card(m, vec(0.1, H + 0.22, 0), ax, ay, vec(0.3, 1, 0).normalize(), REG.pine, needle(crng), 1, 0.25, 1.1);
    }
    if (lod === 0) {
      // dead stubs on the windward side, where the gales strip the branches
      for (let k = 0; k < 6; k++) {
        const s = 0.08 + k * 0.05, phi = Math.PI + rng.range(-0.8, 0.8), l = rng.range(0.18, 0.4);
        const d = vec(Math.cos(phi), rng.range(-0.3, 0.1), Math.sin(phi)).normalize(), o = vec(0, s * H, 0);
        tube(m, [o, o.clone().addScaledVector(d, l)].map((p, i) => ({ p, r: i ? 0.006 : rad(s) * 0.25, s, c: bark })),
          { radial: 3, mat: M.BARK, vScale: 0.9 });
      }
    }
  } else {
    // far: crossed needle cards spanning each third of the flagged crown, like a miniature of the tree
    for (const [lo, hi] of [[0.2, 0.5], [0.5, 0.78], [0.78, 1.01]]) {
      const tips = brs.filter((b) => b.s >= lo && b.s < hi).map((b) => b.pts[2]);
      const c = vec(), span = vec(0.2, 0.2, 0.2);
      tips.forEach((p) => c.addScaledVector(p, 1 / tips.length));
      tips.forEach((p) => span.max(vec(Math.abs(p.x - c.x), Math.abs(p.y - c.y), Math.abs(p.z - c.z))));
      for (let k = 0; k < 3; k++) {
        const a = (k * Math.PI) / 3, out = vec(Math.cos(a), 0, Math.sin(a));
        card(m, c, out.clone().multiplyScalar(Math.max(span.x, span.z) + 0.3), vec(0, span.y + 0.35, 0), vec(0, 1, 0),
          REG.pine, needle(crng), (lo + hi) / 2, 0.4, lo * 9);
      }
    }
  }
  return m.build();
}

// ---- mangrove: prop roots arch out of the trunk into the tide; dense low crown ------------------------
const MANGROVE_H = 2.6;
function mangrove(lod: number): THREE.BufferGeometry {
  const rng = new Rng(404), m = new Mesher(MANGROVE_H), H = MANGROVE_H;
  const bark = col(1.8, 1.9, 2.1), wet = col(1.0, 1.05, 1.1);
  tube(m, [0.3, 0.6, 0.9, 1.2, 1.45].map((y) => ({ p: vec(0, y, 0), r: 0.075 - y * 0.012, s: y / H, c: bark })),
    { radial: [8, 5, 4][lod], mat: M.BARK, uRep: 1, vScale: 0.9 });
  const roots = [12, 6, 0][lod];
  for (let k = 0; k < roots; k++) {
    const az = (k / roots) * Math.PI * 2 + rng.range(-0.2, 0.2), ya = rng.range(0.45, 1.2);
    const rho = 0.55 + (ya - 0.45) * 0.9 + rng.range(0, 0.3), az2 = az + rng.range(-0.25, 0.25);
    const a = vec(Math.cos(az) * 0.05, ya, Math.sin(az) * 0.05),
      b = vec(Math.cos(az2) * rho, -0.3, Math.sin(az2) * rho);
    const ctl = a.clone().add(vec(Math.cos(az) * rho * 0.5, 0.25, Math.sin(az) * rho * 0.5));
    const bez = (t: number) =>
      a.clone().multiplyScalar((1 - t) ** 2).addScaledVector(ctl, 2 * t * (1 - t)).addScaledVector(b, t * t);
    const pts = Array.from({ length: lod ? 5 : 8 }, (_, i) => bez(i / (lod ? 4 : 7)));
    tube(m, pts.map((p) => ({ p, r: 0.034 - 0.012 * (p.y < 0.3 ? 1 : 0), s: 0, c: p.y < 0.35 ? wet : bark })),
      { radial: lod ? 3 : 5, mat: M.BARK, vScale: 0.9 });
    if (lod === 0 && k % 2 === 0) {
      const p0 = bez(0.45), end = vec(Math.cos(az2) * (rho + 0.35), -0.3, Math.sin(az2) * (rho + 0.35));
      const mid = p0.clone().lerp(end, 0.5).add(vec(Math.cos(az) * 0.15, 0.1, Math.sin(az) * 0.15));
      tube(m, [p0, mid, end].map((p) => ({ p, r: 0.018, s: 0, c: p.y < 0.35 ? wet : bark })),
        { radial: 3, mat: M.BARK, vScale: 0.9 });
    }
  }
  const tips: { c: Vec; r: number }[] = [];
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 + rng.range(-0.3, 0.3), d = k ? rng.range(0.5, 1.1) : 0;
    tips.push({ c: vec(Math.cos(a) * d, k ? rng.range(1.75, 2.35) : 2.55, Math.sin(a) * d), r: rng.range(0.6, 0.75) });
  }
  const crown = vec(0, 1.8, 0), frng = new Rng(405);
  for (const t of tips) {
    const s = Math.min(1, t.c.y / H);
    if (t.c.x !== 0 && lod < 2) {
      const fork = vec(0, 1.35, 0), limb = [fork, t.c.clone().lerp(fork, 0.4), t.c];
      tube(m, limb.map((p, i) => ({ p, r: 0.045 - i * 0.015, s: p.y / H, c: bark })),
        { radial: 3, mat: M.BARK, vScale: 0.9 });
    }
    cluster(m, frng, t.c, t.r, 0.75, crown, [8, 4, 2][lod], t.r * [0.62, 0.9, 1.1][lod], REG.mangrove, s, 0.25);
  }
  return m.build();
}

// ---- shrubs, scrub, ferns, grass, vines --------------------------------------------------------------
/** A domed bush of leaf cards on a few woody stems. */
function bush(reg: Region, n: number, rad: number, ht: number, size: number, seed: number,
  stems: boolean): THREE.BufferGeometry {
  const rng = new Rng(seed), m = new Mesher(ht), center = vec(0, ht * 0.25, 0);
  if (stems) {
    for (let k = 0; k < 5; k++) {
      const a = rng.range(0, Math.PI * 2), tip = vec(Math.cos(a) * rad * 0.6, ht * 0.7, Math.sin(a) * rad * 0.6);
      const stem = [vec(0, -0.05, 0), tip.clone().multiplyScalar(0.5), tip];
      tube(m, stem.map((p, i) => ({ p, r: 0.025 - i * 0.008, s: Math.max(0, p.y / ht), c: col(1.5, 1.4, 1.3) })),
        { radial: 3, mat: M.BARK, vScale: 1.5 });
    }
  }
  for (let k = 0; k < n; k++) {
    const a = rng.range(0, Math.PI * 2), y = ht * (0.2 + 0.8 * Math.pow(rng.next(), 0.6));
    const rr = rad * Math.sqrt(Math.max(0.05, 1 - (y / ht) ** 2)) * rng.range(0.55, 1);
    const p = vec(Math.cos(a) * rr, y, Math.sin(a) * rr), out = p.clone().sub(center).normalize();
    const nn = out.clone().addScaledVector(UP, 0.5).add(randomUnit(rng).multiplyScalar(0.4)).normalize();
    const ay = out.clone().addScaledVector(nn, -out.dot(nn)).normalize().multiplyScalar(size);
    const ax = vec().crossVectors(ay, nn).normalize().multiplyScalar(size);
    const tone = rng.range(0.85, 1.1);
    card(m, p, ax, ay, nn.lerp(out, 0.6).normalize(), reg, col(tone, tone, tone * 0.95), y / ht, (y / ht) * 0.4,
      rng.range(0, 6.28));
  }
  return m.build();
}

function fern(): THREE.BufferGeometry {
  const rng = new Rng(505), m = new Mesher(1);
  for (let k = 0; k < 9; k++) {
    const az = (k / 9) * Math.PI * 2 + rng.range(-0.25, 0.25), len = rng.range(0.55, 0.78);
    const path = arc(vec(Math.cos(az) * 0.03, 0.02, Math.sin(az) * 0.03), az, rng.range(0.85, 1.2),
      rng.range(1.3, 1.8), len, 6);
    ribbon(m, path, vec(-Math.sin(az), 0, Math.cos(az)), {
      halfW: (t) => 0.13 * (len / 0.66) * Math.min(1, t * 6 + 0.2), fold: 0.25, reg: REG.fern, c: col(1, 1, 1), s: 0,
      bw: (t) => len * 0.5 * t ** 1.5, ph: k * 1.7,
    });
  }
  return m.build();
}

/** A tuft of blades, olive at the root, straw-tipped. */
function grass(): THREE.BufferGeometry {
  const rng = new Rng(606), m = new Mesher(1);
  const cb = col(0.12, 0.14, 0.05), cm = col(0.3, 0.37, 0.1), ct = col(0.55, 0.5, 0.22);
  for (let k = 0; k < 13; k++) {
    const az = rng.range(0, Math.PI * 2), r0 = rng.range(0, 0.07), len = rng.range(0.28, 0.55),
      w = rng.range(0.012, 0.02);
    const path = arc(vec(Math.cos(az) * r0, -0.03, Math.sin(az) * r0), az, rng.range(1.0, 1.4), rng.range(0.5, 1.1),
      len, 4, 2);
    const side = vec(-Math.sin(az), 0, Math.cos(az));
    let prev: number[] = [];
    for (let i = 0; i <= 4; i++) {
      const t = i / 4, P = path.pts[i],
        N = vec().crossVectors(side, path.tans[i]).normalize().lerp(UP, 0.5).normalize();
      const c = t < 0.5 ? cb.clone().lerp(cm, t * 2) : cm.clone().lerp(ct, t * 2 - 1), hw = w * (1 - t * 0.9);
      const v = (o: number, u: number) => m.vert(P.clone().addScaledVector(side, o), N, u, t, c, M.BLADE, 0,
        len * t * t, t * 0.5, k * 1.3, 1);
      const row = i < 4 ? [v(-hw, 0), v(hw, 1)] : [v(0, 0.5)];
      if (i) {
        if (row.length === 2) m.quad(prev[0], prev[1], row[1], row[0], N);
        else m.tri(prev[0], prev[1], row[0], N);
      }
      prev = row;
    }
  }
  return m.build();
}

/**
 * Vines draped down a rock face: the instance's +y is the rock normal and -z runs down the fall line. Strands of
 * leaves stand off the rock at different depths, tipped out and up like shingles, so the drape has relief.
 */
function vines(): THREE.BufferGeometry {
  const rng = new Rng(808), m = new Mesher(1);
  for (let k = 0; k < 4; k++) {
    const x0 = -0.45 + k * 0.3 + rng.range(-0.08, 0.08);
    for (let i = 0; i < 7; i++) {
      const depth = rng.range(0.03, 0.2), size = rng.range(0.13, 0.2);
      const p = vec(x0 + Math.sin(i * 1.3 + k * 2) * 0.07, depth, 0.25 - i * 0.24);
      const nn = UP.clone().applyAxisAngle(vec(1, 0, 0), rng.range(0.3, 0.7)).applyAxisAngle(UP, rng.range(-0.6, 0.6));
      const ay = vec(0, 0, -1).projectOnPlane(nn).normalize().multiplyScalar(size);
      card(m, p, vec().crossVectors(ay, nn).normalize().multiplyScalar(size), ay, nn, REG.vine, col(1, 1, 1), 0,
        0.05 + depth * 0.5, rng.range(0, 6.28), M.LEAF);
    }
  }
  return m.build();
}

// ---- beach and shore -----------------------------------------------------------------------------------
/** A bleached log (craft.ts) lying along +x, 1.6 long, its centreline near y = 0. */
function driftwood(): THREE.BufferGeometry {
  const m = new Mesher(1), c = col(3.0, 3.1, 3.3);
  craftDriftwood({ vert: (p, n, s, t) => m.vert(p, n, s, t * 1.4, c, M.WOOD), tri: (a, b, k) => m.wound(a, b, k) },
    new Rng(707), 1.6, 0.085);
  return m.build();
}

/** Tide-pool water: a unit disc, slightly lobed, at the instance base. */
function poolDisc(): THREE.BufferGeometry {
  const m = new Mesher(1), c = col(1, 1, 1), centre = m.vert(vec(), UP, 0, 0, c, M.POOL);
  const ring = Array.from({ length: 20 }, (_, i) => {
    const a = (i / 20) * Math.PI * 2, r = 1 + 0.08 * Math.sin(a * 3 + 1);
    return m.vert(vec(Math.cos(a) * r, 0, Math.sin(a) * r), UP, 0, 0, c, M.POOL);
  });
  ring.forEach((v, i) => m.tri(centre, v, ring[(i + 1) % 20], UP));
  return m.build();
}

// ---- underwater ----------------------------------------------------------------------------------------
/**
 * Giant kelp trailing along +x (instances face the prevailing current): a holdfast of tendrils gripping the rock,
 * a sinuous stipe of unit nominal height (instances stretch it to the depth), strap blades that all stream
 * downstream from gas bladders at their bases, and long blades lying out along the surface as a floating mat.
 */
function kelp(): THREE.BufferGeometry {
  const rng = new Rng(909), m = new Mesher(1), stem = col(0.5, 0.38, 0.12), gold = col(1.4, 1.25, 1);
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + rng.range(-0.3, 0.3), d = vec(Math.cos(a), 0, Math.sin(a));
    tube(m, [vec(0, 0.05, 0), d.clone().multiplyScalar(0.08).setY(0), d.clone().multiplyScalar(0.14).setY(-0.06)]
      .map((p, i) => ({ p, r: [0.014, 0.01, 0.005][i], s: 0, c: stem })), { radial: 3, mat: M.SOLID });
  }
  tube(m, Array.from({ length: 9 }, (_, k) => {
    const s = k / 8;
    return { p: vec(0.03 * Math.sin(s * 9), s, 0.03 * Math.sin(s * 7 + 1)), r: 0.014, s, c: stem };
  }), { radial: 3, mat: M.SOLID });
  const blade = (s: number, spread: number, elev: number, len: number, halfW: number, ph: number) => {
    const az = rng.range(-spread, spread), path = arc(vec(0, s, 0), az, elev, -0.2, len, 4);
    ribbon(m, path, vec(-Math.sin(az), 0, Math.cos(az)),
      { halfW: (t) => halfW * (1 - 0.5 * t), fold: 0.1, reg: REG.kelp, c: gold, s, bw: (t) => t * 0.3, ph });
  };
  for (let k = 0; k < 5; k++) blade(0.18 + k * 0.15 + rng.range(-0.02, 0.02), 0.45, rng.range(0.45, 0.8),
    rng.range(0.4, 0.55), 0.045, k);
  // the canopy fans out from the top of the stipe, so the mat has no single knot where the blades meet
  for (let k = 0; k < 3; k++) blade(0.9 + k * 0.04, 0.55, rng.range(0.02, 0.12), rng.range(0.9, 1.5), 0.05, k + 5);
  return m.build();
}

const CORAL: THREE.Color[] = [
  col(0.55, 0.4, 0.2), col(0.42, 0.16, 0.38), col(0.62, 0.28, 0.26),
  col(0.3, 0.38, 0.2), col(0.18, 0.32, 0.4), col(0.7, 0.42, 0.16),
];

/** A coral head: 0 brain dome ringed with finger coral, 1 staghorn thicket, 2 table coral with sea fans. */
function coral(variant: number): THREE.BufferGeometry {
  const rng = new Rng(1000 + variant), m = new Mesher(1), pick = () => CORAL[rng.int(CORAL.length)].clone();
  const fingers = (n: number, rMin: number, rMax: number) => {
    for (let k = 0; k < n; k++) {
      const a = rng.range(0, Math.PI * 2), d = rng.range(rMin, rMax), h = rng.range(0.25, 0.6), base = pick(),
        tip = base.clone().lerp(col(0.9, 0.85, 0.7), 0.6);
      const o = vec(Math.cos(a) * d, -0.08, Math.sin(a) * d),
        lean = vec(Math.cos(a), 0, Math.sin(a)).multiplyScalar(0.08);
      tube(m, [0, 0.5, 0.9, 1].map((t) => ({ p: o.clone().addScaledVector(lean, t).setY(-0.08 + h * t),
        r: t < 1 ? 0.05 : 0.015, s: 0, c: base.clone().lerp(tip, t) })), { radial: 5, mat: M.SOLID });
    }
  };
  if (variant === 0) {
    ball(m, vec(0, -0.12, 0), vec(0.55, 0.42, 0.5), 14, 6, pick(), M.BRAIN, 0, 0, 0, true);
    fingers(7, 0.55, 0.85);
  } else if (variant === 1) {
    const base = pick(), tip = base.clone().lerp(col(0.95, 0.9, 0.8), 0.7);
    const grow = (o: Vec, d: Vec, len: number, r: number, depth: number, t0: number): void => {
      const e = o.clone().addScaledVector(d, len), t1 = t0 + 0.34;
      tube(m, [o, o.clone().lerp(e, 0.5), e].map((p, i) => ({ p, r: r * (1 - 0.25 * i), s: 0,
        c: base.clone().lerp(tip, mix(t0, t1, i / 2)) })), { radial: 4, mat: M.SOLID });
      if (depth === 0) return;
      for (const sd of [-1, 1]) {
        const nd = d.clone().applyAxisAngle(vec(-d.z, 0, d.x).normalize(),
          rng.range(-0.3, 0.2)).applyAxisAngle(UP, sd * rng.range(0.3, 0.6));
        grow(e, nd.normalize(), len * rng.range(0.65, 0.85), r * 0.7, depth - 1, t1);
      }
    };
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + rng.range(-0.3, 0.3), el = rng.range(0.6, 1.1);
      grow(vec(Math.cos(a) * 0.08, -0.1, Math.sin(a) * 0.08),
        vec(Math.cos(el) * Math.cos(a), Math.sin(el), Math.cos(el) * Math.sin(a)), 0.32, 0.035, 2, 0);
    }
  } else {
    const c = pick();
    const stalk = [vec(0, -0.1, 0), vec(0, 0.15, 0), vec(0, 0.28, 0)];
    tube(m, stalk.map((p, i) => ({ p, r: [0.09, 0.06, 0.08][i], s: 0, c })), { radial: 6, mat: M.SOLID });
    // the table: a wavy plate with a rim, top and underside
    const rows = 3, seg = 14, top: number[][] = [], bot: number[][] = [];
    for (let j = 0; j <= rows; j++) {
      const r = 0.08 + (0.38 * j) / rows;
      top.push([]);
      bot.push([]);
      for (let i = 0; i <= seg; i++) {
        const a = (i / seg) * Math.PI * 2, rr = r * (1 + 0.12 * Math.sin(a * 7 + 1) * (j / rows));
        const y = 0.3 + 0.06 * (j / rows) ** 2 + 0.03 * Math.sin(a * 5) * (j / rows);
        const p = vec(Math.cos(a) * rr, y, Math.sin(a) * rr),
          shade = c.clone().multiplyScalar(0.45 + 0.25 * (j / rows));
        top[j].push(m.vert(p, UP, 0, 0, shade, M.SOLID));
        bot[j].push(m.vert(p.clone().setY(y - 0.045), UP.clone().negate(), 0, 0, c.clone().multiplyScalar(0.45),
          M.SOLID));
      }
    }
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < seg; i++) {
        m.quad(top[j][i], top[j][i + 1], top[j + 1][i + 1], top[j + 1][i], UP);
        m.quad(bot[j][i], bot[j][i + 1], bot[j + 1][i + 1], bot[j + 1][i], UP.clone().negate());
      }
    }
    for (let i = 0; i < seg; i++) {
      const a = ((i + 0.5) / seg) * Math.PI * 2;
      m.quad(top[rows][i], top[rows][i + 1], bot[rows][i + 1], bot[rows][i], vec(Math.cos(a), 0, Math.sin(a)));
    }
    for (let k = 0; k < 2; k++) {
      const a = rng.range(0, Math.PI * 2), o = vec(Math.cos(a) * 0.6, 0.2, Math.sin(a) * 0.6),
        out = vec(Math.cos(a), 0, Math.sin(a));
      card(m, o, vec().crossVectors(UP, out).multiplyScalar(0.3), vec(0, 0.3, 0), out, REG.fan,
        k ? CORAL[1] : CORAL[2], 0, 0, 0, M.LEAF);
    }
    for (let k = 0; k < 3; k++) {
      const a = rng.range(0, Math.PI * 2), d = rng.range(0.35, 0.6), r = rng.range(0.12, 0.18);
      ball(m, vec(Math.cos(a) * d, -0.06, Math.sin(a) * d), vec(r, r * 0.8, r), 10, 4, pick(), M.SOLID, 0, 0, 0, true);
    }
    fingers(4, 0.5, 0.7);
  }
  return m.build();
}

// ---- rocks -----------------------------------------------------------------------------------------------
const noise2 = (x: number, y: number, seed: number) => vnoise(x, y, 0.5, seed);

/** A weathered boulder: a lumpy sphere with a flattened, bedded base, about unit radius. */
function rock(detail: number, seed: number): THREE.BufferGeometry {
  const src = new THREE.IcosahedronGeometry(1, detail);
  src.deleteAttribute('normal');
  src.deleteAttribute('uv');
  const g = mergeVertices(src), pos = g.attributes.position as THREE.BufferAttribute, v = vec(), n = pos.count;
  const color: number[] = [];
  for (let i = 0; i < n; i++) {
    v.fromBufferAttribute(pos, i);
    const d = 1 + 0.6 * (vnoise(v.x * 1.6 + 5, v.y * 1.6, v.z * 1.6, seed) - 0.5)
      + 0.18 * (vnoise(v.x * 4.2, v.y * 4.2, v.z * 4.2, seed + 1) - 0.5);
    v.multiplyScalar(d);
    if (v.y < -0.3) v.y = -0.3 + (v.y + 0.3) * 0.3;
    pos.setXYZ(i, v.x, v.y, v.z);
    const ao = 0.5 + 0.5 * smoothstep(-0.45, 0.7, v.y);
    color.push(ao, ao, ao);
  }
  g.computeVertexNormals();
  g.setAttribute('color', new THREE.Float32BufferAttribute(color, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2));
  g.setAttribute('aSpine', new THREE.Float32BufferAttribute(new Float32Array(n * 4), 4));
  g.setAttribute('aMat', new THREE.Float32BufferAttribute(new Float32Array(n * 3), 3));
  return g;
}

// ---------------------------------------------------------------------------------------------
// Instancing. A species owns one mesh per LOD; its instances are sorted by tile so whole visible tiles copy into
// the LOD buffers as blocks, and only tiles straddling a LOD boundary are split instance by instance.
const STRIDE = 16; // aPos xyzw, aRot xyzw, aShape xyzw, aTint xyzw
const TILE = 24;

interface Tile {
  sphere: THREE.Sphere;
  top: Vec; // highest point anything in the tile can reach, for the horizon test
  dist: number;
}

interface Lod {
  geo: THREE.BufferGeometry;
  to: number; // drawn while nearer than this
  shadow: boolean;
  receive?: boolean; // takes shadows; defaults to every LOD but the farthest, which lies beyond the cascades
}

class Species {
  private raw: number[] = [];
  private tiles: number[] = [];
  private data = new Float32Array(0);
  private start = new Int32Array(1);
  private readonly meshes: THREE.Mesh[] = [];
  private readonly bufs: THREE.InstancedInterleavedBuffer[] = [];
  private readonly counts: number[];
  private readonly lods: Lod[];
  private readonly mat: FloraMaterial;

  constructor(lods: Lod[], mat: FloraMaterial) {
    this.lods = lods;
    this.mat = mat;
    this.counts = lods.map(() => 0);
  }

  add(tile: number, v: number[]): void {
    this.raw.push(...v);
    this.tiles.push(tile);
  }

  finish(scene: THREE.Scene, tileCount: number): void {
    const n = this.tiles.length;
    this.start = new Int32Array(tileCount + 1);
    for (const t of this.tiles) this.start[t + 1]++;
    for (let i = 0; i < tileCount; i++) this.start[i + 1] += this.start[i];
    const fill = this.start.slice(0, tileCount);
    this.data = new Float32Array(n * STRIDE);
    this.tiles.forEach((t, i) => this.data.set(this.raw.slice(i * STRIDE, (i + 1) * STRIDE), fill[t]++ * STRIDE));
    this.raw = [];
    this.tiles = [];
    for (const lod of this.lods) {
      const g = new THREE.InstancedBufferGeometry();
      g.index = lod.geo.index;
      for (const k in lod.geo.attributes) g.setAttribute(k, lod.geo.attributes[k]);
      const buf = new THREE.InstancedInterleavedBuffer(new Float32Array(Math.max(1, n) * STRIDE), STRIDE, 1);
      buf.setUsage(THREE.DynamicDrawUsage);
      ['aPos', 'aRot', 'aShape', 'aTint'].forEach((name, i) => g.setAttribute(name,
        new THREE.InterleavedBufferAttribute(buf, 4, i * 4)));
      g.instanceCount = 0;
      const mesh = new THREE.Mesh(g, this.mat.mat);
      mesh.frustumCulled = false;
      mesh.matrixAutoUpdate = false;
      mesh.castShadow = lod.shadow;
      mesh.receiveShadow = lod.receive ?? lod.to !== Infinity;
      mesh.customDepthMaterial = this.mat.depth;
      mesh.visible = false;
      if (this.mat.pre) {
        const pre = new THREE.Mesh(g, this.mat.pre);
        pre.frustumCulled = false;
        pre.matrixAutoUpdate = false;
        pre.renderOrder = -1;
        mesh.add(pre);
      }
      scene.add(mesh);
      this.meshes.push(mesh);
      this.bufs.push(buf);
    }
  }

  private lodAt(d: number): number {
    let k = 0;
    while (k < this.lods.length && d >= this.lods[k].to) k++;
    return k;
  }

  /** The globe menu sees the whole planet: every tree in its far LOD, no ground cover. */
  selectAll(): void {
    const far = this.lods[this.lods.length - 1].to === Infinity ? this.lods.length - 1 : -1,
      n = this.data.length / STRIDE;
    this.counts.fill(0);
    if (far >= 0) {
      (this.bufs[far].array as Float32Array).set(this.data);
      this.counts[far] = n;
    }
    this.upload();
  }

  /** Refill the LOD buffers from the visible tiles for a camera at c. */
  select(c: Vec, tiles: Tile[], visible: number[]): void {
    const data = this.data, last = this.lods[this.lods.length - 1].to;
    this.counts.fill(0);
    for (const t of visible) {
      const a = this.start[t], b = this.start[t + 1];
      if (a === b) continue;
      const tile = tiles[t], near = tile.dist - tile.sphere.radius;
      if (near > last) continue;
      const k0 = this.lodAt(near), k1 = this.lodAt(tile.dist + tile.sphere.radius);
      if (k0 === k1) {
        this.put(k0, a, b);
        continue;
      }
      for (let i = a; i < b; i++) {
        const o = i * STRIDE, dx = data[o] - c.x, dy = data[o + 1] - c.y, dz = data[o + 2] - c.z;
        const k = this.lodAt(Math.sqrt(dx * dx + dy * dy + dz * dz));
        if (k < this.lods.length) this.put(k, i, i + 1);
      }
    }
    this.upload();
  }

  /** Append instances a..b to LOD k's buffer. */
  private put(k: number, a: number, b: number): void {
    (this.bufs[k].array as Float32Array).set(this.data.subarray(a * STRIDE, b * STRIDE), this.counts[k] * STRIDE);
    this.counts[k] += b - a;
  }

  private upload(): void {
    for (let k = 0; k < this.meshes.length; k++) {
      const buf = this.bufs[k], n = this.counts[k];
      buf.clearUpdateRanges();
      buf.addUpdateRange(0, n * STRIDE);
      buf.needsUpdate = true;
      (this.meshes[k].geometry as THREE.InstancedBufferGeometry).instanceCount = n;
      this.meshes[k].visible = n > 0;
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Placement. Each island is surveyed on a local grid (the world's baked heights, the signed distance to the
// waterline, slope); species are planted by rules over that survey, every base sits on the exact world.height,
// and nothing is planted on another plant, a rock, a landmark site or another island's ground.
const STEP = 0.75;

/** Two-pass chamfer distance from every cell to the nearest cell where `mask` is set. */
function chamfer(mask: Uint8Array, n: number): Float32Array {
  const d = new Float32Array(n * n), a = STEP, b = STEP * Math.SQRT2;
  for (let i = 0; i < d.length; i++) d[i] = mask[i] ? 0 : 1e9;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const k = j * n + i;
      if (i > 0) d[k] = Math.min(d[k], d[k - 1] + a);
      if (j > 0) {
        d[k] = Math.min(d[k], d[k - n] + a);
        if (i > 0) d[k] = Math.min(d[k], d[k - n - 1] + b);
        if (i < n - 1) d[k] = Math.min(d[k], d[k - n + 1] + b);
      }
    }
  }
  for (let j = n - 1; j >= 0; j--) {
    for (let i = n - 1; i >= 0; i--) {
      const k = j * n + i;
      if (i < n - 1) d[k] = Math.min(d[k], d[k + 1] + a);
      if (j < n - 1) {
        d[k] = Math.min(d[k], d[k + n] + a);
        if (i < n - 1) d[k] = Math.min(d[k], d[k + n + 1] + b);
        if (i > 0) d[k] = Math.min(d[k], d[k + n - 1] + b);
      }
    }
  }
  return d;
}

class Survey {
  readonly c: Vec;
  readonly e1: Vec;
  readonly e2: Vec;
  readonly half: number;
  readonly n: number;
  readonly h: Float32Array;
  readonly shore: Float32Array; // signed distance to the waterline, positive on land

  constructor(world: World, isl: Island) {
    const c = (this.c = vec(isl.center.x, isl.center.y, isl.center.z));
    this.e1 = (Math.abs(c.y) < 0.9 ? vec(c.z, 0, -c.x) : vec(0, -c.z, c.y)).normalize();
    this.e2 = vec().crossVectors(c, this.e1);
    this.half = isl.radius;
    const n = (this.n = Math.ceil((2 * this.half) / STEP) + 1);
    this.h = new Float32Array(n * n);
    const land = new Uint8Array(n * n), sea = new Uint8Array(n * n), p = vec();
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const k = j * n + i,
          h = sampleCube(world.heights, HN, this.dir(-this.half + i * STEP, -this.half + j * STEP, p));
        this.h[k] = h;
        land[k] = h > 0 ? 1 : 0;
        sea[k] = 1 - land[k];
      }
    }
    const toSea = chamfer(sea, n), toLand = chamfer(land, n);
    this.shore = new Float32Array(n * n);
    for (let k = 0; k < n * n; k++) this.shore[k] = land[k] ? toSea[k] - STEP / 2 : STEP / 2 - toLand[k];
  }

  /** Unit direction of local point (x, y). */
  dir(x: number, y: number, out = vec()): Vec {
    return out.copy(this.c).multiplyScalar(R).addScaledVector(this.e1, x).addScaledVector(this.e2, y).normalize();
  }

  /** World tangent of local direction (dx, dy). */
  tangent(dx: number, dy: number): Vec {
    return this.e1.clone().multiplyScalar(dx).addScaledVector(this.e2, dy);
  }

  private at(a: Float32Array, x: number, y: number): number {
    const n = this.n, fx = Math.min(n - 1.001, Math.max(0, (x + this.half) / STEP)),
      fy = Math.min(n - 1.001, Math.max(0, (y + this.half) / STEP));
    const i = Math.floor(fx), j = Math.floor(fy), tx = fx - i, ty = fy - j, k = j * n + i;
    return mix(mix(a[k], a[k + 1], tx), mix(a[k + n], a[k + n + 1], tx), ty);
  }

  height(x: number, y: number): number {
    return this.at(this.h, x, y);
  }

  shoreAt(x: number, y: number): number {
    return this.at(this.shore, x, y);
  }

  /** Uphill gradient. */
  grad(x: number, y: number): [number, number] {
    return [(this.height(x + STEP, y) - this.height(x - STEP, y)) / (2 * STEP),
      (this.height(x, y + STEP) - this.height(x, y - STEP)) / (2 * STEP)];
  }

  slope(x: number, y: number): number {
    const [gx, gy] = this.grad(x, y);
    return Math.hypot(gx, gy);
  }
}

/** A capsule nothing may grow in: around landmarks, along lava flows, streams, piers and the reef channel. */
interface Keepout {
  a: Vec;
  b: Vec;
  r: number;
}

function keepouts(world: World): Keepout[] {
  const W = (v: V3) => vec(v.x, v.y, v.z).multiplyScalar(R);
  const off = (p: V3, f: V3, d: number) => vec(p.x + (f.x * d) / R, p.y + (f.y * d) / R,
    p.z + (f.z * d) / R).normalize().multiplyScalar(R);
  const out: Keepout[] = [];
  const disc = (p: V3, r: number) => out.push({ a: W(p), b: W(p), r });
  for (const s of world.sites) {
    switch (s.kind) {
      case 'lighthouse': disc(s.pos, s.size + 2.5); break;
      case 'village': disc(s.pos, s.size + 1.5); break;
      case 'hut': disc(s.pos, s.size + 1.2); break;
      case 'stack': disc(s.pos, s.size + 1.5); break;
      case 'caldera': disc(s.pos, s.size * 1.7); break;
      case 'buoy': case 'pole': disc(s.pos, 2); break;
      case 'pier': out.push({ a: W(s.pos), b: off(s.pos, s.facing, s.size), r: 1.8 }); break;
      case 'waterfall': out.push({ a: off(s.pos, s.facing, -17), b: off(s.pos, s.facing, 3), r: 3.2 }); break;
      case 'arch': out.push({ a: off(s.pos, s.facing, -s.size / 2), b: off(s.pos, s.facing, s.size / 2),
        r: 4.5 }); break;
      case 'channel': out.push({ a: off(s.pos, s.facing, -16), b: off(s.pos, s.facing, 16), r: 7 }); break;
      case 'lavaflow': {
        const path = s.path ?? [];
        for (let i = 1; i < path.length; i++) out.push({ a: W(path[i - 1]), b: W(path[i]), r: 4.5 });
        break;
      }
    }
  }
  return out;
}

/** Prevailing wind direction: the shared wind averaged over one turn of its wandering vortex. */
function prevailing(p: Vec): Vec {
  const w = vec(), acc = vec();
  for (let k = 0; k < 8; k++) acc.add(wind(p, k * 60.4, w));
  return acc.normalize();
}

const basis = new THREE.Matrix4();
/** Orientation with local +y along `up` and local +x toward `fwd`. */
function orient(up: Vec, fwd: Vec): THREE.Quaternion {
  const x = fwd.clone().addScaledVector(up, -fwd.dot(up)).normalize(), z = vec().crossVectors(x, up);
  return new THREE.Quaternion().setFromRotationMatrix(basis.makeBasis(x, up, z));
}

type Kind = 'palm' | 'mangrove' | 'jungle' | 'oak' | 'pine' | 'scrub' | 'shrub' | 'fern' | 'grass' | 'vine'
  | 'drift' | 'pool' | 'kelp' | 'coral0' | 'coral1' | 'coral2' | 'rockA' | 'rockB';

class Planter {
  private readonly rng: Rng;
  private readonly seed: number;
  private readonly occ = new Map<number, number[]>();
  private readonly trop: boolean;
  private readonly polar: boolean;
  private readonly cold: number; // 0 at the warm edge of the temperate band … 1 at its polar edge
  private readonly keep: Keepout[];
  private readonly rivals: Island[];
  private readonly tileN: number;
  private readonly world: World;
  private readonly isl: Island;
  private readonly f: Survey;
  private readonly sp: Record<Kind, Species>;
  private readonly tile0: number;

  constructor(world: World, isl: Island, f: Survey, sp: Record<Kind, Species>, tile0: number, keep: Keepout[]) {
    this.world = world;
    this.isl = isl;
    this.f = f;
    this.sp = sp;
    this.tile0 = tile0;
    this.seed = isl.seed >>> 0;
    this.rng = new Rng(isl.seed ^ 0xf10a);
    this.trop = isl.climate === 'tropical';
    this.polar = isl.climate === 'polar';
    this.cold = smoothstep(0.5, 0.8, Math.abs(isl.center.y));
    const c = f.c.clone().multiplyScalar(R);
    this.keep = keep.filter((k) => Math.min(k.a.distanceTo(c), k.b.distanceTo(c)) < isl.radius + k.r + 30);
    this.rivals = world.islands.filter((o) => o !== isl
      && f.c.distanceTo(vec(o.center.x, o.center.y, o.center.z)) * R < o.radius + isl.radius);
    this.tileN = Math.ceil((2 * f.half) / TILE);
  }

  plant(): void {
    this.pools();
    this.boulders();
    this.palms();
    this.mangroves();
    this.forest();
    this.driftwood();
    this.shrubs();
    this.cliffVines();
    this.cover();
    this.underwater();
  }

  // ---- bookkeeping -------------------------------------------------------------------------------------
  private scan(step: number, fn: (x: number, y: number) => void): void {
    const h = this.f.half;
    for (let y = -h; y < h; y += step) for (let x = -h; x < h; x += step) fn(x + this.rng.range(0, step),
      y + this.rng.range(0, step));
  }

  private occupied(x: number, y: number, r: number): boolean {
    const cx = Math.floor(x / 3), cy = Math.floor(y / 3);
    for (let j = cy - 1; j <= cy + 1; j++) {
      for (let i = cx - 1; i <= cx + 1; i++) {
        const l = this.occ.get(j * 4096 + i);
        if (l) for (let k = 0; k < l.length; k += 3) if (Math.hypot(l[k] - x, l[k + 1] - y) < l[k + 2] + r) return true;
      }
    }
    return false;
  }

  private claim(x: number, y: number, r: number): void {
    const key = Math.floor(y / 3) * 4096 + Math.floor(x / 3), l = this.occ.get(key);
    if (l) l.push(x, y, r);
    else this.occ.set(key, [x, y, r]);
  }

  private blocked(p: Vec, extra: number): boolean {
    const q = p.clone().multiplyScalar(R), ab = vec(), aq = vec();
    for (const k of this.keep) {
      ab.subVectors(k.b, k.a);
      aq.subVectors(q, k.a);
      const t = ab.lengthSq() > 0 ? Math.min(1, Math.max(0, aq.dot(ab) / ab.lengthSq())) : 0;
      if (aq.addScaledVector(ab, -t).length() < k.r + extra) return true;
    }
    return false;
  }

  /** Ground that belongs to this island (overlapping footprints go to whichever island is relatively nearer). */
  private own(p: Vec): boolean {
    const mine = p.distanceTo(this.f.c) / this.isl.radius;
    return this.rivals.every((o) => Math.hypot(p.x - o.center.x, p.y - o.center.y, p.z - o.center.z) / o.radius > mine);
  }

  private free(x: number, y: number, p: Vec, r: number, keep: number): boolean {
    return this.own(p) && !this.occupied(x, y, r) && !this.blocked(p, keep);
  }

  private emit(kind: Kind, x: number, y: number, p: Vec, base: number, q: THREE.Quaternion, scale: number,
    shape: number[], tint: number[]): void {
    const tx = Math.min(this.tileN - 1, Math.max(0, Math.floor((x + this.f.half) / TILE)));
    const ty = Math.min(this.tileN - 1, Math.max(0, Math.floor((y + this.f.half) / TILE)));
    const w = p.clone().multiplyScalar(R + base);
    this.sp[kind].add(this.tile0 + ty * this.tileN + tx, [w.x, w.y, w.z, scale, q.x, q.y, q.z, q.w, ...shape, ...tint]);
  }

  private spin(p: Vec): THREE.Quaternion {
    const a = this.rng.range(0, Math.PI * 2);
    return orient(p, this.f.tangent(Math.cos(a), Math.sin(a)));
  }

  /** Exact ground normal at p, from the world's height field. */
  private normal(x: number, y: number): Vec {
    const e = 0.3, h = (dx: number, dy: number) => this.world.height(this.f.dir(x + dx, y + dy));
    const gx = (h(e, 0) - h(-e, 0)) / (2 * e), gy = (h(0, e) - h(0, -e)) / (2 * e);
    return this.f.dir(x, y).addScaledVector(this.f.e1, -gx).addScaledVector(this.f.e2, -gy).normalize();
  }

  private tint(base: number[], amt: number, w = 0): number[] {
    const k = 1 + this.rng.range(-amt, amt);
    return [base[0] * k * (1 + this.rng.range(-amt, amt)), base[1] * k, base[2] * k * (1 + this.rng.range(-amt, amt)),
      w];
  }

  /** Fraction of the horizon around (x, y) that is open water: high on points, spits and motus. */
  private openWater(x: number, y: number): number {
    let n = 0;
    for (let k = 0; k < 12; k++) if (this.f.height(x + Math.cos(k * 0.5236) * 6, y + Math.sin(k * 0.5236) * 6) < 0) n++;
    return n / 12;
  }

  private rockType(): number[] {
    const r = this.isl.rock;
    return r === 'basalt' ? [0.42, 0.42, 0.45] : r === 'sandstone' ? [1.05, 0.9, 0.74] : [1.1, 1.06, 0.96];
  }

  // ---- rules -------------------------------------------------------------------------------------------------
  /** Rock pools on flat shore ledges: the water sits at the lowest ground of the bowl, ringed by rocks. */
  private pools(): void {
    const { f, rng } = this;
    const rocky = this.isl.rock !== 'limestone' ? 0.45 : 0.15;
    this.scan(3, (x, y) => {
      const h = f.height(x, y), sd = f.shoreAt(x, y);
      if (h < -0.05 || h > 0.5 || sd < -0.3 || sd > 2.5 || f.slope(x, y) > 0.22 || rng.next() > rocky) return;
      const p = f.dir(x, y), r = rng.range(0.45, 0.85);
      if (!this.free(x, y, p, r + 0.3, 1)) return;
      let low = this.world.height(p);
      for (let k = 0; k < 8; k++) low = Math.min(low,
        this.world.height(f.dir(x + Math.cos(k * 0.785) * r, y + Math.sin(k * 0.785) * r)));
      this.emit('pool', x, y, p, low + 0.03, this.spin(p), r, [0, 0, 1, rng.next()], [1, 1, 1, 0]);
      const n = Math.round(5 + r * 6), tone = this.rockType();
      for (let k = 0; k < n; k++) {
        const a = ((k + rng.range(-0.25, 0.25)) / n) * Math.PI * 2, rr = r * rng.range(1.0, 1.18),
          size = r * rng.range(0.24, 0.34);
        const rx = x + Math.cos(a) * rr, ry = y + Math.sin(a) * rr, q = f.dir(rx, ry);
        this.emit(rng.next() < 0.5 ? 'rockA' : 'rockB', rx, ry, q,
          Math.max(low + 0.03, this.world.height(q)) - size * 0.2, this.spin(q), size,
          [rng.range(0.9, 1.2), rng.range(0.5, 0.7), rng.range(0.9, 1.2),
            rng.next()], this.tint(tone.map((v) => v * 0.7), 0.08, 0));
      }
      this.claim(x, y, r + 0.4);
    });
  }

  private boulders(): void {
    const { f, rng, polar } = this, tone = this.rockType();
    this.scan(2.6, (x, y) => {
      const h = f.height(x, y), sd = f.shoreAt(x, y), sl = f.slope(x, y);
      if (h < -1.5 || sl < 0.08 || sl > 1.3) return;
      const shore = Math.abs(sd) < 2.5 && (this.isl.rock !== 'limestone' || sl > 0.25);
      const floor = h > 1.2 && sd > 3 && !polar;
      if (rng.next() > (polar ? 0.22 : shore ? 0.32 : floor ? 0.12 : 0)) return;
      const p = f.dir(x, y), size = shore ? rng.range(0.25, 0.9) : rng.range(0.3, 1.1);
      if (!this.free(x, y, p, size * 0.9, size)) return;
      const sy = rng.range(0.5, 0.9), up = this.normal(x, y).lerp(p, 0.5).normalize();
      const moss = floor ? rng.range(0.55, 1) : polar ? rng.range(0, 0.25) : 0;
      this.emit(rng.next() < 0.5 ? 'rockA' : 'rockB', x, y, p, this.world.height(p) - size * sy * 0.35,
        orient(up, this.f.tangent(rng.range(-1, 1), rng.range(-1, 1))),
        size, [rng.range(0.8, 1.3), sy, rng.range(0.8, 1.3), rng.next()], this.tint(tone, 0.1, moss));
      this.claim(x, y, size * 0.9);
    });
  }

  /**
   * Hero palms. Candidates on the sand and the first rise behind it are ranked by how coastal and how exposed they
   * are (points, spits and motus first) and by a clumping field, so palms gather in groves on beach crests and
   * crowd the motus. Near the water they lean seaward, far enough that their crowns hang out over the sea.
   */
  private palms(): void {
    if (!this.trop) return;
    const { f, rng } = this, cands: { x: number; y: number; score: number }[] = [];
    this.scan(1.1, (x, y) => {
      const h = f.height(x, y), sd = f.shoreAt(x, y);
      if (h < 0.4 || h > 7 || sd < 0.5 || sd > 14 || f.slope(x, y) > 0.55) return;
      const clump = noise2(x * 0.11, y * 0.11, this.seed);
      cands.push({ x, y,
        score: Math.exp(-sd / 4) * (0.5 + this.openWater(x, y)) * (0.3 + clump) * rng.range(0.7, 1.3) });
    });
    cands.sort((a, b) => b.score - a.score);
    const low = ['atoll', 'greatAtoll', 'cay'].includes(this.isl.kind);
    const want = Math.round(cands.length * (low ? 0.3 : 0.16));
    let n = 0;
    for (const c of cands) {
      if (n >= want) break;
      if (this.palm(c.x, c.y, false)) n++;
    }
  }

  private palm(x: number, y: number, inland: boolean): boolean {
    const { f, rng } = this, p = f.dir(x, y);
    if (!this.free(x, y, p, 0.55, 0.8)) return false;
    const [gx, gy] = f.grad(x, y);
    let ax = -gx, ay = -gy;
    if (Math.hypot(ax, ay) < 0.02) [ax, ay] = [x, y];
    const a = Math.atan2(ay, ax) + rng.range(-0.5, 0.5);
    [ax, ay] = [Math.cos(a), Math.sin(a)];
    const coastal = inland ? 0 : smoothstep(5, 1.2, f.shoreAt(x, y));
    let lean = coastal * rng.range(0.35, 0.95) + (1 - coastal) * rng.range(0.02, 0.22);
    const curl = rng.range(0.5, 1), H = rng.range(2.4, 4.1), sc = rng.range(0.88, 1.12), h0 = this.world.height(p);
    // the trunk must clear the ground it leans across, and the crown must not come down on a landmark
    const clear = () => [0.25, 0.5, 0.75, 1].every((t) => {
      const off = lean * H * mix(t, t * (2 - t), curl), px = x + ax * off, py = y + ay * off;
      return f.height(px, py) - h0 < H * t - 0.4 && !this.blocked(f.dir(px, py), 1.2);
    });
    while (!clear()) {
      if (lean < 0.02) return false;
      lean *= 0.5;
    }
    const q = orient(p, f.tangent(ax, ay)), crown = rng.next() < 0.6 ? 0 : 1;
    this.emit('palm', x, y, p, h0 - 0.12, q, sc, [lean, curl, H, rng.next()],
      [mix(0.88, 1.08, rng.next()), mix(0.95, 1.08, rng.next()), mix(0.72, 0.95, rng.next()), crown]);
    this.claim(x, y, 0.45);
    return true;
  }

  /** Mangrove stands in the sheltered shallows of the warm islands. */
  private mangroves(): void {
    if (!this.trop || this.isl.kind === 'volcano') return;
    const { f, rng } = this;
    this.scan(1.45, (x, y) => {
      const h = f.height(x, y), sd = f.shoreAt(x, y);
      if (h < -0.7 || h > 0.12 || sd < -4 || sd > 0.6 || f.slope(x, y) > 0.3
        || noise2(x * 0.07, y * 0.07, this.seed + 3) < 0.5) return;
      const p = f.dir(x, y);
      if (!this.free(x, y, p, 0.9, 1.5)) return;
      const sc = rng.range(0.8, 1.2);
      this.emit('mangrove', x, y, p, this.world.height(p) - 0.05, this.spin(p), sc,
        [0, 0, MANGROVE_H * sc, rng.next()], this.tint([0.95, 1, 0.9], 0.08));
      this.claim(x, y, 0.8 * sc);
    });
  }

  /** Jungle in the tropics; broadleaf woods giving way to wind-bent pines with latitude and altitude. */
  private forest(): void {
    const { f, rng, isl, trop, polar } = this;
    if (isl.kind === 'cay' || isl.kind === 'atoll' || isl.kind === 'greatAtoll') return;
    this.scan(trop ? 1.3 : 1.7, (x, y) => {
      const h = f.height(x, y), sd = f.shoreAt(x, y), sl = f.slope(x, y),
        grove = noise2(x * 0.05, y * 0.05, this.seed + 5);
      if (h < (trop ? 1.8 : 1.3) + grove * 0.6 || sd < 2.5 || sl > (trop ? 3 : 2.2)) return;
      // a closed canopy on the slopes; on rock steeper than ~60° only the odd tree clings on
      let dens = (trop ? 0.65 + 0.5 * grove : 0.45 + 0.7 * grove) * (sl > 1.6 ? 0.35 : 1) * (polar ? 0.18 : 1);
      if (isl.kind === 'volcano') dens *= smoothstep(isl.peak * 0.45, isl.peak * 0.2, h);
      if (rng.next() > dens) return;
      const p = f.dir(x, y);
      if (!this.free(x, y, p, 0.6, 1.2)) return;
      if (trop) {
        if (rng.next() < 0.08) this.palm(x, y, true);
        else this.broadleaf('jungle', JUNGLE, x, y, p);
      } else if (polar || this.cold + h / 30
        + (noise2(x * 0.04, y * 0.04, this.seed + 6) - 0.5) * 0.5 > 0.5) this.pine(x, y, p, polar);
      else this.broadleaf('oak', OAK, x, y, p);
    });
  }

  private broadleaf(kind: Kind, st: TreeStyle, x: number, y: number, p: Vec): void {
    // a layered stand: the odd emergent above the canopy, young trees in its shade, small trees clinging to rock
    const { f, rng } = this, r = rng.next(), [gx, gy] = f.grad(x, y), sl = Math.hypot(gx, gy);
    const sc = sl > 1.6 ? rng.range(0.45, 0.75)
      : r < 0.08 ? rng.range(1.35, 1.6) : r < 0.28 ? rng.range(0.45, 0.65) : rng.range(0.75, 1.15);
    // lean out over the fall: over a drop (the slope a few units off) trees reach out, then curve back up
    const e = 2.5, wx = (f.height(x + e, y) - f.height(x - e, y)) / (2 * e);
    const wy = (f.height(x, y + e) - f.height(x, y - e)) / (2 * e);
    const lean = Math.min(0.42, 0.05 * sl + 0.14 * Math.max(0, Math.hypot(wx, wy) - 0.8));
    const palette = st.tropical
      ? [[0.8, 0.95, 0.72], [1.08, 1.1, 0.7], [0.72, 0.95, 0.9], [0.95, 1.0, 0.8], [1.2, 0.95, 0.62]]
      : [[0.95, 1.0, 0.8], [1.1, 1.05, 0.7], [0.85, 0.95, 0.75], [1.15, 0.92, 0.6]];
    this.emit(kind, x, y, p, this.world.height(p) - (0.15 + 0.25 * sl) * sc, orient(p, f.tangent(-wx + 1e-3, -wy)), sc,
      [lean, 0.8, st.trunk * sc * rng.range(0.9, 1.1), rng.next()], this.tint(palette[rng.int(palette.length)], 0.07));
    this.claim(x, y, 0.45 * sc);
  }

  private pine(x: number, y: number, p: Vec, polar: boolean): void {
    const { f, rng } = this, sc = rng.range(0.65, 1.15) * (polar ? 0.7 : 1);
    const exposure = Math.min(1, smoothstep(8, 1, f.shoreAt(x, y)) + f.height(x, y) / 20);
    this.emit('pine', x, y, p, this.world.height(p) - (0.12 + 0.15 * f.slope(x, y)) * sc, orient(p, prevailing(p)), sc,
      [0.05 + 0.22 * exposure + rng.range(0, 0.05), rng.range(0.2, 0.6), PINE_H * sc,
        rng.next()], this.tint([0.9, 1, 0.92], 0.08));
    this.claim(x, y, 0.4 * sc);
  }

  /** Driftwood along the strand line, bedded into the sand at both ends. */
  private driftwood(): void {
    const { f, rng } = this;
    this.scan(4, (x, y) => {
      const h = f.height(x, y);
      if (h < 0.15 || h > 0.9 || f.shoreAt(x, y) > 3 || f.slope(x, y) > 0.4 || rng.next() > 0.3) return;
      const p = f.dir(x, y);
      if (!this.free(x, y, p, 1, 1)) return;
      const [gx, gy] = f.grad(x, y), a = Math.atan2(gx, -gy) + rng.range(-0.4, 0.4), ax = Math.cos(a), ay = Math.sin(a);
      const sc = rng.range(0.7, 1.3), half = 0.8 * sc;
      const ha = this.world.height(f.dir(x - ax * half, y - ay * half)),
        hb = this.world.height(f.dir(x + ax * half, y + ay * half));
      const axis = f.tangent(ax, ay).multiplyScalar(2 * half).addScaledVector(p, hb - ha).normalize();
      const up = p.clone().addScaledVector(axis, -p.dot(axis)).normalize();
      this.emit('drift', x, y, p, Math.max((ha + hb) / 2, this.world.height(p) - 0.03) + 0.07 * sc * 0.35,
        orient(up, axis), sc, [0, 0, 1, rng.next()], this.tint([1, 1, 1], 0.08));
      this.claim(x, y, half);
    });
  }

  /** Scrub on the dunes behind the beach; flowering shrubs along forest edges and clearings. */
  private shrubs(): void {
    const { f, rng } = this;
    this.scan(1.25, (x, y) => {
      const h = f.height(x, y), sd = f.shoreAt(x, y), sl = f.slope(x, y);
      if (!this.polar && h > 0.35 && h < 3.5 && sd > 1.2 && sd < 11 && sl < 0.45) {
        if (noise2(x * 0.13, y * 0.13, this.seed + 7) < 0.45 || rng.next() > 0.55) return;
        const p = f.dir(x, y);
        if (!this.free(x, y, p, 0.5, 1)) return;
        const sc = rng.range(0.7, 1.3);
        this.emit('scrub', x, y, p, this.world.height(p) - 0.04, this.spin(p), sc, [0, 0, SCRUB_H * sc, rng.next()],
          this.tint([1, 1, 0.9], 0.1));
        this.claim(x, y, 0.45 * sc);
      } else if (!this.polar && h > 1 && sd > 2.5 && sd < 16 && sl < 1.2 && rng.next() < 0.12) {
        const p = f.dir(x, y);
        if (!this.free(x, y, p, 0.45, 1)) return;
        const sc = rng.range(0.8, 1.2);
        this.emit('shrub', x, y, p, this.world.height(p) - 0.04, this.spin(p), sc, [0, 0, SHRUB_H * sc, rng.next()],
          this.tint([1, 1, 1], 0.08, rng.next()));
        this.claim(x, y, 0.4 * sc);
      }
    });
  }

  /** Vine curtains hung down rock faces: clump after clump down the fall line, each on the rock's own surface. */
  private cliffVines(): void {
    if (this.polar) return;
    const { f, rng } = this;
    this.scan(this.trop ? 1.6 : 2.2, (x, y) => {
      if (f.height(x, y) < 1.5 || f.slope(x, y) < 1.8 || rng.next() > 0.5) return;
      if (noise2(x * 0.12, y * 0.12, this.seed + 11) < 0.4) return;
      for (let k = 0, cx = x, cy = y; k < 6; k++) {
        const p = f.dir(cx, cy), h = this.world.height(p);
        if (h < 0.6 || f.slope(cx, cy) < 1.2 || !this.free(cx, cy, p, 0.1, 0.8)) break;
        // local +y is the rock normal and +z runs up the fall line, so +x = y × z
        const n = this.normal(cx, cy), q = orient(n, vec().crossVectors(n, p.clone().projectOnPlane(n)));
        this.emit('vine', cx, cy, p, h - 0.02, q, rng.range(0.9, 1.2), [0, 0, 1, rng.next()],
          this.tint([1, 1, 1], 0.1));
        this.claim(cx, cy, 0.15);
        const [gx, gy] = f.grad(cx, cy), gl = Math.hypot(gx, gy) || 1;
        cx -= (gx / gl) * 0.4;
        cy -= (gy / gl) * 0.4;
      }
    });
  }

  /** Beach and dune grass in clumps, meadow grass on open temperate and polar ground, ferns on the forest floor. */
  private cover(): void {
    const { f, rng, trop, polar } = this;
    this.scan(0.6, (x, y) => {
      const h = f.height(x, y), sd = f.shoreAt(x, y), sl = f.slope(x, y);
      if (h < 0.2 || sl > 1.4) return;
      const dune = h < 3.5 && sd > 0.7 && sd < 12 && sl < 0.6, meadow = !trop && h > 1 && sl < 1.1;
      if ((dune || meadow) && noise2(x * 0.2, y * 0.2, this.seed + 9) > 0.5 && rng.next() < 0.65) {
        const p = f.dir(x, y);
        if (!this.free(x, y, p, 0.15, 0.6)) return;
        const up = this.normal(x, y).lerp(p, 0.6).normalize();
        this.emit('grass', x, y, p, this.world.height(p) - 0.02,
          orient(up, f.tangent(rng.range(-1, 1), rng.range(-1, 1))), rng.range(0.7, 1.4),
          [0, 0, 1, rng.next()], this.tint(polar ? [0.95, 0.88, 0.72] : dune ? [1.1, 1.0, 0.8] : [0.88, 1.05, 0.8],
            0.1));
        return;
      }
      if (!polar && h > 1.2 && sd > 3 && rng.next() < 0.1 && noise2(x * 0.05, y * 0.05, this.seed + 5) > 0.4) {
        const p = f.dir(x, y);
        if (!this.free(x, y, p, 0.6, 0.6)) return;
        this.emit('fern', x, y, p, this.world.height(p) - 0.03, this.spin(p), rng.range(0.8, 1.4),
          [0, 0, 1, rng.next()], this.tint([0.95, 1.05, 0.9], 0.1));
        this.claim(x, y, 0.5);
      }
    });
  }

  /** Coral heads in the warm shallows, kelp forests in the temperate ones. */
  private underwater(): void {
    const { f, rng } = this;
    if (this.trop) {
      this.scan(1.5, (x, y) => {
        const h = f.height(x, y);
        if (h > -0.9 || h < -6.5 || noise2(x * 0.09, y * 0.09, this.seed + 13) < 0.4 || rng.next() > 0.4) return;
        const p = f.dir(x, y);
        if (!this.free(x, y, p, 0.7, 1.2)) return;
        const ground = this.world.height(p), sc = Math.min(rng.range(0.6, 1.5), (-ground - 0.5) / 0.7);
        if (sc < 0.4) return;
        this.emit(`coral${[0, 0, 1, 1, 2][rng.int(5)]}` as Kind, x, y, p, ground - 0.06, this.spin(p), sc,
          [0, 0, 1, rng.next()], this.tint([1, 1, 1], 0.15));
        this.claim(x, y, 0.65 * sc);
      });
    } else if (!this.polar) {
      this.scan(1.05, (x, y) => {
        const h = f.height(x, y);
        if (h > -1.4 || h < -9.5 || noise2(x * 0.06, y * 0.06, this.seed + 15) < 0.5 || rng.next() > 0.6) return;
        const p = f.dir(x, y);
        if (!this.free(x, y, p, 0.25, 0.6)) return;
        const ground = this.world.height(p);
        // the whole bed streams one way with the current; the tops reach up to lie just under the surface
        this.emit('kelp', x, y, p, ground - 0.05, orient(p, prevailing(p)), rng.range(0.8, 1.25),
          [0, 0, -ground - rng.range(0.3, 0.5), rng.next()], this.tint([1, 1, 1], 0.12));
        this.claim(x, y, 0.25);
      });
    }
  }
}

// ---------------------------------------------------------------------------------------------
const SCRUB_H = 0.6;
const SHRUB_H = 0.85;
const sea = R - 1; // the swell's troughs: anything wholly behind this ball is below the horizon
const tmpA = vec(), tmpB = vec();

/** True when even the tile's nearest, highest point is hidden behind the curve of the sea from c. */
function beyondHorizon(c: Vec, t: Tile): boolean {
  const p = tmpA.subVectors(c, t.top);
  p.multiplyScalar(Math.min(1, t.sphere.radius / p.length())).add(t.top);
  const d = tmpB.subVectors(p, c), k = Math.min(1, Math.max(0, -c.dot(d) / d.lengthSq()));
  return d.multiplyScalar(k).add(c).lengthSq() < sea * sea;
}

export class Flora {
  private readonly species: Species[];
  private readonly tiles: Tile[] = [];
  private readonly vis: Uint8Array;
  private readonly visible: number[] = [];
  private readonly frustum = new THREE.Frustum();
  private readonly pv = new THREE.Matrix4();
  private readonly last = vec(1e9, 0, 0);
  private globe = false; // the globe menu is open

  constructor(ctx: Ctx) {
    const u = floraUniforms(ctx, {
      tLeaf: paintAtlas(),
      tPalm: loadTexture(palmBarkCol, true), tPalmN: loadTexture(palmBarkNrm, false),
      tBark: loadTexture(pineBarkCol, true), tBarkN: loadTexture(pineBarkNrm, false),
      tWood: loadTexture(woodCol, true), tWoodN: loadTexture(woodNrm, false),
      tRock: loadTexture(rockCol, true), tRockN: loadTexture(rockNrm, false),
      tMoss: loadTexture(mossCol, true), tMossN: loadTexture(mossNrm, false),
    });
    const plain = makeMaterial(u, { leaves: true });
    const tree = (geo: (lod: number) => THREE.BufferGeometry, near: number, mid: number) =>
      new Species([{ geo: geo(0), to: near, shadow: true }, { geo: geo(1), to: mid, shadow: true },
        { geo: geo(2), to: Infinity, shadow: false }], plain);
    // kelp is seen only through the water, where a shadow on it would never read
    const cover = (geo: THREE.BufferGeometry, to: number, v: Variant = {}) =>
      new Species([{ geo, to, shadow: false, receive: !v.kelp }], makeMaterial(u, { ...v, fade: to }));
    const rocks = (seed: number) => new Species([{ geo: rock(2, seed), to: 50, shadow: true },
      { geo: rock(1, seed), to: 140, shadow: false }], makeMaterial(u, { rock: true, fade: 140 }));
    const sp: Record<Kind, Species> = {
      palm: tree(palm, 26, 80),
      mangrove: tree(mangrove, 30, 85),
      jungle: tree((l) => treeGeo(JUNGLE, l), 34, 70),
      oak: tree((l) => treeGeo(OAK, l), 34, 70),
      pine: tree(pine, 34, 75),
      scrub: new Species([
        { geo: bush(REG.scrub, 18, 0.65, SCRUB_H, 0.3, 11, true), to: 35, shadow: false },
        { geo: bush(REG.scrub, 7, 0.65, SCRUB_H, 0.42, 11, false), to: 95, shadow: false },
      ], makeMaterial(u, { fade: 95, leaves: true })),
      shrub: cover(bush(REG.flower, 16, 0.55, SHRUB_H, 0.27, 12, true), 55, { leaves: true }),
      fern: cover(fern(), 45, { leaves: true }),
      grass: cover(grass(), 34),
      vine: cover(vines(), 55, { leaves: true }),
      drift: cover(driftwood(), 90),
      pool: cover(poolDisc(), 90),
      kelp: cover(kelp(), 42, { kelp: true }),
      coral0: cover(coral(0), 55),
      coral1: cover(coral(1), 55),
      coral2: cover(coral(2), 55, { leaves: true }),
      rockA: rocks(1),
      rockB: rocks(2),
    };
    const world = ctx.world, keep = keepouts(world);
    for (const isl of world.islands) {
      const f = new Survey(world, isl), tile0 = this.tiles.length, n = Math.ceil((2 * f.half) / TILE);
      for (let ty = 0; ty < n; ty++) {
        for (let tx = 0; tx < n; tx++) {
          const x0 = -f.half + tx * TILE, y0 = -f.half + ty * TILE, d = f.dir(x0 + TILE / 2, y0 + TILE / 2);
          let top = 0;
          for (let y = y0; y <= y0 + TILE; y += 2 * STEP) {
            for (let x = x0; x <= x0 + TILE; x += 2 * STEP) top = Math.max(top, f.height(x, y));
          }
          // tallest plant ~9 units; palms overhang their tile by up to ~4
          this.tiles.push({ sphere: new THREE.Sphere(d.clone().multiplyScalar(R + top / 2),
            TILE * 0.71 + 4 + top / 2 + 9), top: d.clone().multiplyScalar(R + top + 9), dist: 0 });
        }
      }
      new Planter(world, isl, f, sp, tile0, keep).plant();
    }
    this.vis = new Uint8Array(this.tiles.length);
    this.species = Object.values(sp);
    for (const s of this.species) s.finish(ctx.scene, this.tiles.length);
  }

  update(f: Frame): void {
    if (f.paused) {
      if (!this.globe) for (const s of this.species) s.selectAll();
      this.globe = true;
      return;
    }
    if (this.globe) {
      this.globe = false;
      this.last.set(1e9, 0, 0);
    }
    const cam = f.camera, c = cam.position;
    cam.updateMatrixWorld();
    this.frustum.setFromProjectionMatrix(this.pv.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
    let changed = c.distanceToSquared(this.last) > 1;
    this.visible.length = 0;
    for (let i = 0; i < this.tiles.length; i++) {
      const t = this.tiles[i];
      t.dist = c.distanceTo(t.sphere.center);
      const v = this.frustum.intersectsSphere(t.sphere) && !beyondHorizon(c, t) ? 1 : 0;
      if (v !== this.vis[i]) {
        this.vis[i] = v;
        changed = true;
      }
      if (v) this.visible.push(i);
    }
    if (!changed) return;
    this.last.copy(c);
    for (const s of this.species) s.select(c, this.tiles, this.visible);
  }
}

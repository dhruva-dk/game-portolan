// The rock material: three's standard material, patched to texture itself from scanned photographs by triplanar
// projection in the rock's own space (so textures stick to moving floes and to instanced copies), with a close-up
// detail normal at 10 m, a large-scale variation that breaks tiling at 50 m, a cover layer (moss, snow, turf) on
// faces that look up, and wetness that darkens and glosses the rock toward the waterline.
//
// The sea is described once for every rock by ROCK_UNIFORMS.uSea: (centre, radius) of the sea sphere, or, with a
// radius of 0, a flat sea at y = centre.y. The integration step points it at the planet and adds the tide.
import * as THREE from 'three';
import { sharedUniforms } from '../planet.ts';
import { SKINS, type Skin, type SkinId, type TexId } from './skins.ts';

/** Uniforms every rock material shares by reference. */
export const ROCK_UNIFORMS = {
  /** xyz: the sea's centre; w: its radius (0 means a flat sea at y = centre.y). Tide moves the radius. */
  uSea: { value: new THREE.Vector4(0, 0, 0, 0) },
  uTime: { value: 0 },
  /** Daylight 0..1: scales the light ice seems to hold inside, so it does not glow at night. */
  uDaylight: { value: 1 },
  /** Distances in metres over which the close-up detail normal fades out. */
  uDetailFade: { value: new THREE.Vector2(10, 32) },
};

let base = 'tex/rocks/';
/** Where the rock textures are served from: 'tex/rocks/' relative to the page by default, like the game's other textures. */
export function setRockTextureBase(url: string): void {
  base = url.endsWith('/') ? url : url + '/';
}

const loader = new THREE.TextureLoader();
const textures = new Map<string, THREE.Texture>();
const loading: Promise<void>[] = [];
/** Settles once every rock texture asked for so far has loaded (or failed), so a still is never shot of black rock. */
export const rockTexturesReady = (): Promise<void[]> => Promise.all(loading);
let anisotropy = 8;
/** Caps the anisotropic filtering of every rock texture loaded from now on. */
export function setRockAnisotropy(n: number): void {
  anisotropy = n;
}

function texture(id: TexId, kind: 'd' | 'n'): THREE.Texture {
  const key = `${id}_${kind}`;
  let t = textures.get(key);
  if (!t) {
    let done!: () => void;
    loading.push(new Promise<void>((ok) => (done = ok)));
    t = loader.load(`${base}${key}.jpg`, done, undefined, done);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = kind === 'd' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.anisotropy = anisotropy;
    textures.set(key, t);
  }
  return t;
}

const VERT_PARS = /* glsl */ `
attribute vec4 aRock;
varying vec4 vRock;
varying vec3 vRP;
varying vec3 vRN;
varying vec3 vWP;
varying vec3 vAxX;
varying vec3 vAxY;
varying vec3 vAxZ;
`;

const VERT_MAIN = /* glsl */ `
{
  mat4 rockM = modelMatrix;
  vec3 rockOff = vec3(0.0);
  #ifdef USE_INSTANCING
  rockM = modelMatrix * instanceMatrix;
  rockOff = vec3(float(gl_InstanceID)) * vec3(3.17, 1.93, 2.71);
  #endif
  vec3 sx = rockM[0].xyz, sy = rockM[1].xyz, sz = rockM[2].xyz;
  vec3 rs = vec3(length(sx), length(sy), length(sz));
  vRP = position * rs + rockOff;
  vRN = normal / rs;
  vAxX = sx / rs.x;
  vAxY = sy / rs.y;
  vAxZ = sz / rs.z;
  vWP = (rockM * vec4(position, 1.0)).xyz;
  vRock = aRock;
}
`;

const FRAG_PARS = /* glsl */ `
uniform sampler2D uAlb, uNrm, uOvAlb, uOvNrm;
uniform vec4 uSea;
${sharedUniforms('float', 'uTime')}
uniform float uDaylight;
uniform vec2 uDetailFade;
uniform vec2 uScale;        // texture repeats per metre, u and v
uniform vec3 uTint;
uniform vec3 uGrade;        // saturation, contrast, brightness
uniform vec2 uRough;        // dry, wet
uniform vec3 uWet;          // spray height above the sea (m), wet everywhere 0..1, normal strength
uniform vec4 uAlgae;        // rgb, amount
uniform vec4 uCover;        // amount, up threshold, softness, repeats per metre
uniform vec3 uCoverTint;
uniform vec4 uBand;         // period (m), strength, warp, seed
uniform vec3 uBandA, uBandB, uBandC;
uniform vec3 uGlow;
uniform vec4 uIce;          // deep colour, strength
uniform float uStreak;
uniform vec3 uPieceA, uPieceB, uPieceC, uPieceD;
varying vec4 vRock;
varying vec3 vRP;
varying vec3 vRN;
varying vec3 vWP;
varying vec3 vAxX;
varying vec3 vAxY;
varying vec3 vAxZ;

float rockLum(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
float rockHash(float n) { return fract(sin(n) * 43758.5453); }
vec3 rockNrm(vec4 t) { return t.xyz * 2.0 - 1.0; }

// triplanar albedo and normal, whiteout-blended, in the rock's own space
void rockTriplanar(vec3 p, vec3 n, float detail, out vec3 alb, out vec3 nOut, out float macro) {
  vec3 w = pow(abs(n), vec3(4.0));
  w /= (w.x + w.y + w.z);
  vec3 sg = vec3(n.x < 0.0 ? -1.0 : 1.0, n.y < 0.0 ? -1.0 : 1.0, n.z < 0.0 ? -1.0 : 1.0);
  vec2 uvX = vec2(p.z * sg.x, p.y) * uScale;
  vec2 uvY = vec2(p.x * sg.y, p.z) * uScale;
  vec2 uvZ = vec2(-p.x * sg.z, p.y) * uScale;
  alb = texture2D(uAlb, uvX).rgb * w.x + texture2D(uAlb, uvY).rgb * w.y + texture2D(uAlb, uvZ).rgb * w.z;
  vec3 tX = rockNrm(texture2D(uNrm, uvX)), tY = rockNrm(texture2D(uNrm, uvY)), tZ = rockNrm(texture2D(uNrm, uvZ));
  if (detail > 0.01) {
    const float D = 4.37;
    tX.xy += rockNrm(texture2D(uNrm, uvX * D + 0.31)).xy * detail * 0.6;
    tY.xy += rockNrm(texture2D(uNrm, uvY * D + 0.57)).xy * detail * 0.6;
    tZ.xy += rockNrm(texture2D(uNrm, uvZ * D + 0.13)).xy * detail * 0.6;
  }
  tX.xy *= uWet.z; tY.xy *= uWet.z; tZ.xy *= uWet.z;
  tX.x *= sg.x; tY.x *= sg.y; tZ.x *= -sg.z;
  vec3 an = abs(n);
  tX = vec3(tX.xy + n.zy, an.x * tX.z);
  tY = vec3(tY.xy + n.xz, an.y * tY.z);
  tZ = vec3(tZ.xy + n.xy, an.z * tZ.z);
  nOut = normalize(tX.zyx * w.x + tY.xzy * w.y + tZ.xyz * w.z);
  // the same photograph sampled ten times larger: patches of light and dark that hide the tiling from afar
  vec2 uvM = (w.y > max(w.x, w.z) ? uvY : w.x > w.z ? uvX : uvZ) * 0.093 + 0.37;
  macro = rockLum(texture2D(uAlb, uvM).rgb);
}
`;

const FRAG_MAP = /* glsl */ `
vec3 rN = normalize(vRN);
float rDist = length(vWP - cameraPosition);
float rDetail = 1.0 - smoothstep(uDetailFade.x, uDetailFade.y, rDist);
vec3 rAlb, rNO; float rMacro;
rockTriplanar(vRP, rN, rDetail, rAlb, rNO, rMacro);
vec3 rUp = uSea.w > 0.0 ? normalize(vWP - uSea.xyz) : vec3(0.0, 1.0, 0.0);
float rH = uSea.w > 0.0 ? length(vWP - uSea.xyz) - uSea.w : vWP.y - uSea.y;
vec3 rGeoW = normalize(vAxX * rN.x + vAxY * rN.y + vAxZ * rN.z);
float rFacing = dot(rGeoW, rUp);
float rCav = vRock.x;
float rVar = rMacro - 0.45;

// grade the photograph toward the region's rock
vec3 rA = rAlb * uTint;
float rL = rockLum(rA);
rA = mix(vec3(rL), rA, uGrade.x);
rA *= pow(max(rL, 1e-3) / 0.25, uGrade.y - 1.0) * uGrade.z;
rA *= 0.82 + rVar * 0.9;
rA *= 0.92 + 0.16 * vRock.w;

#ifdef ROCK_PIECES
{
  float k = vRock.w * 3.999;
  vec3 a = k < 1.0 ? uPieceA : k < 2.0 ? uPieceB : k < 3.0 ? uPieceC : uPieceD;
  vec3 b = k < 1.0 ? uPieceB : k < 2.0 ? uPieceC : k < 3.0 ? uPieceD : uPieceA;
  rA *= mix(a, b, smoothstep(0.6, 1.0, fract(k)));
}
#endif

#ifdef ROCK_BANDS
{
  // strata follow height above the sea, so neighbouring rocks share their bands like one wall; a form that builds
  // its own layers passes each layer's colour key in aRock.z instead
  float bz = (rH + rVar * uBand.z) / uBand.x;
  float bf = fract(bz);
  float h0 = rockHash(floor(bz) + uBand.w), h1 = rockHash(floor(bz) + 1.0 + uBand.w);
  float k0 = vRock.z > 0.001 ? vRock.z : h0, k1 = vRock.z > 0.001 ? vRock.z : h1;
  vec3 c0 = k0 < 0.4 ? uBandA : k0 < 0.75 ? uBandB : uBandC;
  vec3 c1 = k1 < 0.4 ? uBandA : k1 < 0.75 ? uBandB : uBandC;
  vec3 bc = mix(c0, c1, smoothstep(0.82, 1.0, bf));
  // fine laminations inside each band
  bc *= 1.0 + 0.14 * (rockHash(floor(bz * 5.0) + 7.0) - 0.5);
  rA = mix(rA, rA * bc, uBand.y);
}
#endif

#ifdef ROCK_ICE
{
  // ice: blue in the body, white where it is cracked or crusted, a little light held inside
  float veins = smoothstep(0.35, 0.8, rockLum(rAlb));
  rA = mix(uIce.rgb * (0.55 + rVar), vec3(0.86, 0.93, 1.0), veins * 0.75 + vRock.z * 0.5);
}
#endif

// cavities: dark cracks and undersides
rA *= 1.0 - rCav * 0.62;

// wetness: dark and glossy toward the sea, wet in cracks, wet streaks down cliff faces
float rWet = 1.0 - smoothstep(0.0, uWet.x * (0.55 + rMacro * 0.9) + 0.05, rH);
rWet = max(rWet, uWet.y * (0.75 + 0.25 * rCav));
#ifdef ROCK_STREAKS
{
  vec2 su = vec2(dot(vRP.xz, vec2(0.71, 0.7)) * 0.11, vRP.y * 0.006 + uTime * 0.015);
  float st = texture2D(uAlb, su).g;
  float streak = smoothstep(0.42, 0.62, st) * uStreak;
  rWet = max(rWet, streak);
  rA *= 1.0 - streak * 0.35;
}
#endif
rWet = clamp(rWet + rCav * 0.25 * step(rH, uWet.x * 2.0), 0.0, 1.0);
float rUnder = smoothstep(0.05, -0.35, rH);
float rTideBand = smoothstep(-1.2, -0.25, rH) * smoothstep(0.7, 0.05, rH);
vec3 rWetA = rA * mix(1.0, 0.42, rWet);
rWetA = mix(vec3(rockLum(rWetA)), rWetA, 1.0 + rWet * 0.25);
// growth at the tide line and below it
rWetA = mix(rWetA, uAlgae.rgb * (0.6 + rMacro), uAlgae.a * max(rTideBand, rUnder * 0.7) * smoothstep(0.25, 0.6, rMacro + rCav * 0.4));
rA = rWetA;

// cover (moss, snow, turf) on faces that look up, above the spray
float rCover = 0.0;
vec3 rCovN = vec3(0.0, 1.0, 0.0);
#ifdef ROCK_COVER
{
  float lift = smoothstep(uWet.x * 0.5, uWet.x * 0.5 + 1.2, rH);
  rCover = smoothstep(uCover.y - uCover.z, uCover.y + uCover.z, rFacing + (rMacro - 0.45) * 0.6 + rCav * 0.15);
  rCover *= uCover.x * vRock.y * lift;
  vec2 cuv = vRP.xz * uCover.w;
  vec3 cA = texture2D(uOvAlb, cuv).rgb * uCoverTint;
  rCovN = rockNrm(texture2D(uOvNrm, cuv));
  float edge = smoothstep(0.0, 0.35, rCover);
  rCover = edge;
  rA = mix(rA, cA * mix(1.0, 0.7, rWet * 0.5), rCover);
}
#endif
diffuseColor.rgb = rA;
`;

const FRAG_ROUGH = /* glsl */ `
float roughnessFactor = mix(uRough.x + (0.45 - rockLum(rAlb)) * 0.2, uRough.y, rWet * (1.0 - rCover * 0.6));
roughnessFactor = mix(roughnessFactor, 0.85, rCover * 0.8);
roughnessFactor = clamp(roughnessFactor, 0.04, 1.0);
`;

const FRAG_NORMAL = /* glsl */ `
{
  vec3 nR = rNO;
  #ifdef ROCK_COVER
  nR = normalize(mix(nR, normalize(rN + vec3(rCovN.x, 0.0, rCovN.y) * 0.6), rCover * 0.7));
  #endif
  vec3 nW = normalize(vAxX * nR.x + vAxY * nR.y + vAxZ * nR.z);
  normal = normalize((viewMatrix * vec4(nW, 0.0)).xyz);
}
`;

const FRAG_EMIT = /* glsl */ `
#include <emissivemap_fragment>
#ifdef ROCK_GLOW
{
  float pulse = 0.75 + 0.25 * sin(uTime * 1.3 + vWP.x * 0.37 + vWP.z * 0.23);
  float pores = smoothstep(0.32, 0.05, rockLum(rAlb)) * 0.6 + rCav * 0.8;
  float glow = vRock.z * pores * pulse;
  totalEmissiveRadiance += uGlow * glow * (1.0 - rUnder);
}
#endif
#ifdef ROCK_ICE
totalEmissiveRadiance += uIce.rgb * uIce.a * uDaylight * (1.0 - rCav) * (0.4 + 0.6 * (1.0 - abs(rFacing))) * (1.0 - rCover);
#endif
`;

const FRAG_AO = /* glsl */ `
#include <aomap_fragment>
{
  float rAO = 1.0 - rCav * 0.75;
  reflectedLight.indirectDiffuse *= rAO;
  reflectedLight.indirectSpecular *= rAO;
}
`;

const materials = new Map<SkinId, THREE.MeshStandardMaterial>();

const col = (c: readonly number[]) => new THREE.Color(c[0], c[1], c[2]);
const vec3 = (c: readonly number[]) => new THREE.Vector3(c[0], c[1], c[2]);

/** The material for a skin, built once and shared. */
export function rockMaterial(id: SkinId): THREE.MeshStandardMaterial {
  let m = materials.get(id);
  if (m) return m;
  m = buildMaterial(id, SKINS[id]);
  materials.set(id, m);
  return m;
}

function buildMaterial(id: SkinId, s: Skin): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ roughness: s.rough[0], metalness: 0, name: `rock:${id}` });
  const defines: Record<string, string> = {};
  if (s.cover) defines.ROCK_COVER = '';
  if (s.bands) defines.ROCK_BANDS = '';
  if (s.glow) defines.ROCK_GLOW = '';
  if (s.ice) defines.ROCK_ICE = '';
  if (s.streak) defines.ROCK_STREAKS = '';
  if (s.pieces) defines.ROCK_PIECES = '';
  m.defines = defines;
  const tile = s.tile, aspect = s.aspect ?? 1;
  const uniforms = {
    ...ROCK_UNIFORMS,
    uAlb: { value: texture(s.tex, 'd') },
    uNrm: { value: texture(s.tex, 'n') },
    uOvAlb: { value: s.cover ? texture(s.cover.tex, 'd') : null },
    uOvNrm: { value: s.cover ? texture(s.cover.tex, 'n') : null },
    uScale: { value: new THREE.Vector2(1 / tile, 1 / (tile * aspect)) },
    uTint: { value: vec3(s.tint) },
    uGrade: { value: new THREE.Vector3(s.grade?.[0] ?? 1, s.grade?.[1] ?? 1, s.grade?.[2] ?? 1) },
    uRough: { value: new THREE.Vector2(s.rough[0], s.rough[1]) },
    uWet: { value: new THREE.Vector3(s.spray, s.wetAll ?? 0, s.normal ?? 1) },
    uAlgae: { value: new THREE.Vector4(...(s.algae?.[0] ?? [0, 0, 0]), s.algae?.[1] ?? 0) },
    uCover: { value: new THREE.Vector4(s.cover?.amount ?? 0, s.cover?.up ?? 0.7, s.cover?.soft ?? 0.15, 1 / (s.cover?.tile ?? 2)) },
    uCoverTint: { value: vec3(s.cover?.tint ?? [1, 1, 1]) },
    uBand: { value: new THREE.Vector4(s.bands?.period ?? 1, s.bands?.strength ?? 0, s.bands?.warp ?? 0, s.bands?.seed ?? 0) },
    uBandA: { value: vec3(s.bands?.colours[0] ?? [1, 1, 1]) },
    uBandB: { value: vec3(s.bands?.colours[1] ?? [1, 1, 1]) },
    uBandC: { value: vec3(s.bands?.colours[2] ?? [1, 1, 1]) },
    uGlow: { value: col(s.glow ?? [0, 0, 0]) },
    uIce: { value: new THREE.Vector4(...(s.ice?.deep ?? [0, 0, 0]), s.ice?.inner ?? 0) },
    uStreak: { value: s.streak ?? 0 },
    uPieceA: { value: vec3(s.pieces?.[0] ?? [1, 1, 1]) },
    uPieceB: { value: vec3(s.pieces?.[1] ?? [1, 1, 1]) },
    uPieceC: { value: vec3(s.pieces?.[2] ?? [1, 1, 1]) },
    uPieceD: { value: vec3(s.pieces?.[3] ?? [1, 1, 1]) },
  };
  m.onBeforeCompile = (sh) => {
    // on the planet, its own clock (given by engine.ts's patchAll before this runs) is the one the rock keeps
    for (const [k, v] of Object.entries(uniforms)) if (!(k in sh.uniforms)) sh.uniforms[k] = v;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\n' + VERT_PARS)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + VERT_MAIN);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + FRAG_PARS)
      .replace('#include <map_fragment>', FRAG_MAP)
      .replace('#include <roughnessmap_fragment>', FRAG_ROUGH)
      .replace('#include <normal_fragment_maps>', FRAG_NORMAL)
      .replace('#include <emissivemap_fragment>', FRAG_EMIT)
      .replace('#include <aomap_fragment>', FRAG_AO);
  };
  m.customProgramCacheKey = () => 'rock:' + Object.keys(defines).sort().join(',');
  m.userData.rockUniforms = uniforms;
  return m;
}

/** A still, dark, glassy surface for the water that lies in tide pools and at cliff feet. */
let poolMat: THREE.MeshStandardMaterial | null = null;
export function poolMaterial(): THREE.MeshStandardMaterial {
  if (!poolMat) {
    poolMat = new THREE.MeshStandardMaterial({ color: 0x0b2a2c, roughness: 0.04, metalness: 0, transparent: true, opacity: 0.82, name: 'rock:pool' });
  }
  return poolMat;
}

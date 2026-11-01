// The land's materials: the rewrite's scanned layers (src/gfx/land.ts) splatted by slope, height and shore, now on
// the sphere. Each region picks its own placeholder material set; chunks carry the world's region blend per vertex,
// and the shader blends the two strongest regions, so sets mix across every border.
import * as THREE from 'three';
import { REGIONS, type RegionId } from '../sim/world/index.ts';
import { LAYER, patch, type LayerName, type Textures } from './engine.ts';

type RGB = [number, number, number];

/** A placeholder material set: which scanned layer plays each role, and how it is tinted (linear multipliers). */
export interface MaterialSet {
  /** Open ground, and a second ground layer in noisy patches. */
  flat: LayerName; alt: LayerName;
  /** Steep slopes, with the ledge layer on their shelves. */
  cliff: LayerName; ledge: LayerName;
  /** The beach band and the sea floor. */
  shore: LayerName;
  /** Ground above the snowline. */
  high: LayerName;
  tints: { flat: RGB; alt: RGB; cliff: RGB; shore: RGB };
  /** Height in metres where `high` takes over. */
  snowline: number;
  /** Raises (or lowers) the slope at which ground turns to cliff. */
  cliffBias: number;
}

/** Placeholder sets, one per region, from the textures in public/tex. Their own scanned materials come later. */
export const MATERIAL_SETS: Record<RegionId, MaterialSet> = {
  iceCrown: { flat: 'snow', alt: 'snow', cliff: 'cliff', ledge: 'snow', shore: 'snow', high: 'snow', tints: { flat: [1.05, 1.08, 1.15], alt: [0.82, 0.9, 1.05], cliff: [0.8, 0.92, 1.15], shore: [0.85, 0.92, 1.05] }, snowline: -60, cliffBias: 0.06 },
  fjords: { flat: 'grass', alt: 'forest', cliff: 'cliff', ledge: 'moss', shore: 'pebbles', high: 'snow', tints: { flat: [0.75, 0.78, 0.7], alt: [0.55, 0.65, 0.5], cliff: [0.85, 0.87, 0.9], shore: [0.8, 0.82, 0.85] }, snowline: 140, cliffBias: -0.04 },
  mistwood: { flat: 'moss', alt: 'forest', cliff: 'lichen', ledge: 'moss', shore: 'moss', high: 'moss', tints: { flat: [0.55, 0.7, 0.6], alt: [0.45, 0.55, 0.45], cliff: [0.6, 0.68, 0.62], shore: [0.4, 0.45, 0.38] }, snowline: 999, cliffBias: 0 },
  spires: { flat: 'grass', alt: 'forest', cliff: 'cliff', ledge: 'moss', shore: 'sand', high: 'cliff', tints: { flat: [0.8, 0.95, 0.65], alt: [0.5, 0.6, 0.48], cliff: [1.35, 1.3, 1.2], shore: [1.15, 1.12, 1.05] }, snowline: 999, cliffBias: -0.06 },
  narrows: { flat: 'sand', alt: 'grass', cliff: 'cliff', ledge: 'forest', shore: 'sand', high: 'cliff', tints: { flat: [1.05, 0.72, 0.45], alt: [0.75, 0.75, 0.45], cliff: [1.3, 0.78, 0.45], shore: [1.1, 0.85, 0.6] }, snowline: 999, cliffBias: -0.05 },
  basaltStacks: { flat: 'grass', alt: 'grass', cliff: 'cliff', ledge: 'grass', shore: 'pebbles', high: 'grass', tints: { flat: [0.7, 1.15, 0.45], alt: [0.6, 1.0, 0.4], cliff: [0.32, 0.33, 0.36], shore: [0.4, 0.4, 0.42] }, snowline: 999, cliffBias: -0.02 },
  kelpShallows: { flat: 'grass', alt: 'grass', cliff: 'cliff', ledge: 'moss', shore: 'pebbles', high: 'grass', tints: { flat: [1.0, 1.0, 0.55], alt: [0.85, 0.85, 0.45], cliff: [0.9, 0.88, 0.8], shore: [0.95, 0.9, 0.7] }, snowline: 999, cliffBias: 0.02 },
  blossomRun: { flat: 'grass', alt: 'forest', cliff: 'cliff', ledge: 'grass', shore: 'pebbles', high: 'grass', tints: { flat: [0.95, 1.05, 0.6], alt: [1.25, 0.7, 0.8], cliff: [1.0, 0.95, 0.9], shore: [1.0, 0.98, 0.95] }, snowline: 999, cliffBias: 0.04 },
  glassSea: { flat: 'sand', alt: 'grass', cliff: 'cliff', ledge: 'grass', shore: 'sand', high: 'sand', tints: { flat: [1.3, 1.28, 1.2], alt: [0.9, 1.0, 0.6], cliff: [1.2, 1.18, 1.1], shore: [1.35, 1.32, 1.25] }, snowline: 999, cliffBias: 0.04 },
  jadeShoals: { flat: 'sand', alt: 'grass', cliff: 'sand', ledge: 'grass', shore: 'sand', high: 'sand', tints: { flat: [1.25, 0.95, 0.55], alt: [0.95, 0.95, 0.55], cliff: [1.1, 0.85, 0.5], shore: [1.2, 0.98, 0.65] }, snowline: 999, cliffBias: 0.06 },
  coralAtolls: { flat: 'sand', alt: 'grass', cliff: 'pebbles', ledge: 'grass', shore: 'sand', high: 'grass', tints: { flat: [1.35, 1.3, 1.2], alt: [0.75, 1.05, 0.5], cliff: [1.35, 1.0, 0.9], shore: [1.4, 1.3, 1.22] }, snowline: 999, cliffBias: 0.02 },
  spiceIsles: { flat: 'forest', alt: 'grass', cliff: 'burnt', ledge: 'forest', shore: 'burnt', high: 'forest', tints: { flat: [0.45, 0.75, 0.38], alt: [0.6, 0.95, 0.4], cliff: [1.25, 0.55, 0.35], shore: [1.2, 0.6, 0.4] }, snowline: 999, cliffBias: 0 },
  fireArchipelago: { flat: 'burnt', alt: 'burnt', cliff: 'cliff', ledge: 'burnt', shore: 'pebbles', high: 'burnt', tints: { flat: [0.55, 0.5, 0.48], alt: [0.75, 0.62, 0.55], cliff: [0.3, 0.27, 0.26], shore: [0.28, 0.27, 0.27] }, snowline: 999, cliffBias: -0.04 },
  weepingIsle: { flat: 'moss', alt: 'forest', cliff: 'cliff', ledge: 'moss', shore: 'pebbles', high: 'moss', tints: { flat: [0.6, 1.0, 0.55], alt: [0.5, 0.75, 0.45], cliff: [0.45, 0.5, 0.46], shore: [0.45, 0.47, 0.45] }, snowline: 999, cliffBias: -0.08 },
  mangroveLabyrinth: { flat: 'forest', alt: 'moss', cliff: 'burnt', ledge: 'moss', shore: 'burnt', high: 'forest', tints: { flat: [0.65, 0.68, 0.42], alt: [0.6, 0.62, 0.4], cliff: [0.75, 0.62, 0.45], shore: [0.7, 0.58, 0.4] }, snowline: 999, cliffBias: 0.04 },
  maelstrom: { flat: 'grass', alt: 'lichen', cliff: 'cliff', ledge: 'grass', shore: 'pebbles', high: 'lichen', tints: { flat: [0.55, 0.65, 0.48], alt: [0.7, 0.72, 0.75], cliff: [0.62, 0.68, 0.78], shore: [0.62, 0.64, 0.68] }, snowline: 120, cliffBias: -0.04 },
};

const TERRAIN_FRAG = /* glsl */ `
uniform sampler2DArray uTerr, uTerrN;
uniform vec4 uSetL[16]; // layers: flat, alt, cliff, shore
uniform vec4 uSetM[16]; // layer high, layer ledge, snowline, cliff bias
uniform vec3 uSetT[64]; // tints: flat, alt, cliff, shore
varying vec4 vW0, vW1, vW2, vW3;
varying vec3 vWP, vWN;
vec2 pn(vec3 p) { return p.xz + p.y * vec2(0.71, -0.53); }
vec3 triW(vec3 n) { vec3 w = pow(abs(n), vec3(6.0)); w /= w.x + w.y + w.z; return w * step(0.02, w) / max(dot(w, step(0.02, w)), 1e-3); }
vec3 triA(float layer, vec3 p, vec3 w, float s) {
  vec3 c = vec3(0.0);
  if (w.x > 0.0) c += texture(uTerr, vec3(p.zy * s, layer)).rgb * w.x;
  if (w.y > 0.0) c += texture(uTerr, vec3(p.xz * s, layer)).rgb * w.y;
  if (w.z > 0.0) c += texture(uTerr, vec3(p.xy * s, layer)).rgb * w.z;
  return c;
}
// whiteout-blended triplanar normals, in world space
vec3 triN(float layer, vec3 p, vec3 n, vec3 w, float s, float k) {
  vec3 r = vec3(0.0);
  if (w.x > 0.0) { vec3 t = texture(uTerrN, vec3(p.zy * s, layer)).xyz * 2.0 - 1.0; t.xy *= k; t = vec3(t.xy + n.zy, abs(t.z) * n.x); r += t.zyx * w.x; }
  if (w.y > 0.0) { vec3 t = texture(uTerrN, vec3(p.xz * s, layer)).xyz * 2.0 - 1.0; t.xy *= k; t = vec3(t.xy + n.xz, abs(t.z) * n.y); r += t.xzy * w.y; }
  if (w.z > 0.0) { vec3 t = texture(uTerrN, vec3(p.xy * s, layer)).xyz * 2.0 - 1.0; t.xy *= k; t = vec3(t.xy + n.xy, abs(t.z) * n.z); r += t.xyz * w.z; }
  return normalize(r);
}
// one region's ground at a point
void regionGround(int r, vec3 wp, vec3 gn, vec3 w, float slope, float alt, vec3 nz, float far, out vec3 alb, out vec3 nW) {
  vec4 L = uSetL[r], M = uSetM[r];
  float s = 0.21;
  float cliff = smoothstep(0.26 + M.w, 0.46 + M.w, slope + (nz.y - 0.5) * 0.22);
  float shore = 1.0 - smoothstep(0.4, 1.8 + nz.x * 2.4, alt + (nz.z - 0.5) * 0.8);
  float high = smoothstep(M.z, M.z + 25.0, alt + nz.x * 30.0) * (1.0 - cliff * 0.6);
  float altW = smoothstep(0.42, 0.66, nz.x + nz.y * 0.3 - 0.12);
  float nk = mix(1.0, 0.35, far);
  vec3 a = triA(L.x, wp, w, s) * uSetT[r * 4];
  if (altW > 0.01) a = mix(a, triA(L.y, wp, w, s * 0.8) * uSetT[r * 4 + 1], altW);
  if (shore > 0.01) a = mix(a, triA(L.w, wp, w, s * 1.2) * uSetT[r * 4 + 3], shore);
  if (high > 0.01) a = mix(a, triA(M.x, wp, w, s * 0.7), high);
  vec3 n = cliff < 0.99 ? triN(L.x, wp, gn, w, s, nk) : gn;
  if (cliff > 0.01) {
    // cliffs: sharper side projections, the ledge layer on their shelves
    vec3 cw = triW(gn * vec3(1.0, 0.6, 1.0));
    vec3 ca = triA(L.z, wp, cw, 0.07) * uSetT[r * 4 + 2];
    float ledge = smoothstep(0.62, 0.42, slope) * smoothstep(0.3, 0.7, nz.y);
    if (ledge > 0.01) ca = mix(ca, triA(M.y, wp, w, 0.12), ledge * 0.7);
    a = mix(a, ca, cliff);
    n = normalize(mix(n, triN(L.z, wp, gn, cw, 0.07, nk), cliff));
  }
  a *= mix(0.82, 1.12, nz.y);
  alb = a;
  nW = n;
}
void terrainSurface(out vec3 alb, out vec3 nW, out float rough, out vec3 glow) {
  vec3 wp = vWP;
  vec3 gn = normalize(vWN);
  vec3 up = normalize(wp);
  float alt = length(wp) - uPlanet.x;
  float slope = 1.0 - dot(gn, up);
  float dist = length(wp - cameraPosition);
  float far = smoothstep(60.0, 260.0, dist);
  vec2 q = pn(wp);
  vec3 nz = vec3(texture(uNoise, q * 0.0045).r, texture(uNoise, q * 0.031).g, texture(uNoise, q * 0.11).b);
  vec3 w = triW(gn);
  // the two strongest regions here
  float ws[16] = float[16](vW0.x, vW0.y, vW0.z, vW0.w, vW1.x, vW1.y, vW1.z, vW1.w, vW2.x, vW2.y, vW2.z, vW2.w, vW3.x, vW3.y, vW3.z, vW3.w);
  int ra = 0, rb = 0; float wa = -1.0, wb = -1.0;
  for (int i = 0; i < 16; i++) {
    float x = ws[i];
    if (x > wa) { rb = ra; wb = wa; ra = i; wa = x; } else if (x > wb) { rb = i; wb = x; }
  }
  float tb = clamp(wb / max(wa + wb, 1e-4), 0.0, 0.5);
  // dither the border a little so the blend reads as mixed ground, not a smear
  tb = clamp(tb + (nz.z - 0.5) * 0.5 * smoothstep(0.0, 0.15, tb) * smoothstep(0.5, 0.35, tb), 0.0, 1.0);
  vec3 a, n;
  regionGround(ra, wp, gn, w, slope, alt, nz, far, a, n);
  if (tb > 0.01) {
    vec3 a2, n2;
    regionGround(rb, wp, gn, w, slope, alt, nz, far, a2, n2);
    a = mix(a, a2, tb);
    n = normalize(mix(n, n2, tb));
  }
  // the water's edge: a wet band above it, surf washing up and back, caustics below
  float lvl = uPlanet.y - uPlanet.x;
  float above = alt - lvl;
  float fn = texture(uNoise, q * 0.11 + vec2(uTime * 0.01, 0.0)).b;
  float wet = smoothstep(1.3, 0.0, above + (fn - 0.5) * 0.4);
  a *= mix(1.0, 0.55, wet);
  rough = mix(0.95, 0.3, wet);
  float surge = 0.25 * sin(uTime * 1.1 + fn * 5.0) - 0.05;
  float swash = smoothstep(0.35, 0.0, abs(above - surge)) * smoothstep(0.35, 0.65, fn + 0.15) * smoothstep(-2.0, 0.0, above);
  float band = smoothstep(0.8, 1.0, sin(-above * 4.0 - uTime * 1.6 + fn * 4.0)) * smoothstep(-1.6, -0.2, above) * step(above, 0.0) * smoothstep(0.35, 0.7, fn);
  float foam = clamp(swash * 0.9 + band * 0.4, 0.0, 1.0);
  a = mix(a, vec3(0.9, 0.93, 0.95), foam);
  rough = mix(rough, 0.6, foam);
  glow = vec3(0.0);
  float e = dot(up, uSunDir);
  if (above < 0.0) {
    vec2 bq = q * 0.19;
    float c1 = texture(uNoise, bq + uTime * vec2(0.021, 0.013)).g;
    float c2 = texture(uNoise, bq * 1.2 - uTime * vec2(0.017, 0.024)).g;
    float caustic = pow(smoothstep(0.16, 0.0, abs(c1 - c2)), 2.0) * 1.6 * exp(above * 0.25) * smoothstep(0.0, -0.3, above);
    glow = a * caustic * keyAt(1, e) * max(e, 0.0) * planetShade(wp, uSunDir) * 0.9;
  }
  // at night the surf glows
  glow += vec3(0.1, 0.75, 1.0) * foam * uNight * 0.35 * (0.6 + fn);
  // tangent detail fades with distance
  nW = normalize(mix(n, gn, far * 0.5));
  alb = a;
}`;

/** The terrain material: a standard material whose albedo, normal and roughness come from terrainSurface(). */
export function terrainMaterial(tex: Textures): THREE.MeshStandardMaterial {
  const setL: THREE.Vector4[] = [], setM: THREE.Vector4[] = [], setT: THREE.Color[] = [];
  for (let r = 0; r < 16; r++) {
    const m = MATERIAL_SETS[REGIONS[Math.min(r, REGIONS.length - 1)].id];
    setL.push(new THREE.Vector4(LAYER[m.flat], LAYER[m.alt], LAYER[m.cliff], LAYER[m.shore]));
    setM.push(new THREE.Vector4(LAYER[m.high], LAYER[m.ledge], m.snowline, m.cliffBias));
    for (const t of [m.tints.flat, m.tints.alt, m.tints.cliff, m.tints.shore]) setT.push(new THREE.Color(...t));
  }
  const m = new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0 });
  return patch(m, 'planet-terrain', (s) => {
    s.uniforms.uTerr = { value: tex.terrain };
    s.uniforms.uTerrN = { value: tex.terrainN };
    s.uniforms.uSetL = { value: setL };
    s.uniforms.uSetM = { value: setM };
    s.uniforms.uSetT = { value: setT };
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 aW0, aW1, aW2, aW3;\nvarying vec4 vW0, vW1, vW2, vW3;\nvarying vec3 vWP, vWN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWP = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvWN = normalize(mat3(modelMatrix) * objectNormal);\nvW0 = aW0; vW1 = aW1; vW2 = aW2; vW3 = aW3;');
    s.fragmentShader = s.fragmentShader
      .replace('#include <fog_pars_fragment>', '#include <fog_pars_fragment>\n#include <planet>\n' + TERRAIN_FRAG)
      .replace('#include <map_fragment>', 'vec3 tAlb, tN, tGlow; float tRough;\nterrainSurface(tAlb, tN, tRough, tGlow);\ndiffuseColor.rgb = tAlb;')
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = tRough;')
      .replace('#include <normal_fragment_maps>', 'normal = normalize((viewMatrix * vec4(tN, 0.0)).xyz);')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += tGlow;')
      // skylight scattered off the hills around: slopes turned from the sun stay readable instead of crushing to black
      .replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\nreflectedLight.indirectDiffuse *= 2.2;');
  });
}

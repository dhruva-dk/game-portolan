// The dev page for the southern material library (dev/materials-south.html). Each region's set is painted on
// a test patch that climbs from the seabed through the wet shore and a beach, up a slope and a cliff, to a
// flat top. The Fire Archipelago's patch also carries a glowing lava flow down to the sea.
//
// URL parameters (the same as dev/materials-north.html):
//   ?region=<id>   one region up close, with its scans listed (default: all eight in a grid)
//   &light=dusk    start at dusk (default day); the button switches
//   &cam=far|mid|near   about 130 m, 50 m or 10 m from the ground (single region only; default far)
//   &roles=1       paint each role a flat colour instead of its scan, to check where the roles fall
//   &spin=0        stop the turntable; &angle=<deg> sets where the camera stands
//   &res=<px>      texture size the page uploads (default 2048 for one region, 512 for the grid)
import * as THREE from 'three';
import { FIRE_LAVA_FLOW, REGION_MATERIALS, type GlowLayer } from './south.ts';
import { MATERIAL_ROLES, setScans, type MaterialLayer, type MaterialRole, type MaterialSet, type SouthRegionId } from './types.ts';

const params = new URLSearchParams(location.search);
const only = params.get('region') as SouthRegionId | null;
const regions = (only ? [only] : Object.keys(REGION_MATERIALS)) as SouthRegionId[];
const RES = Number(params.get('res') ?? (only ? 2048 : 512));
const PATCH = 100; // metres on a side

/** Each region's water: colour, and how fast light dies with depth (per metre), only to judge the seabed. */
const WATER: Record<SouthRegionId, { colour: number; murk: number }> = {
  glassSea: { colour: 0x9ccbd4, murk: 0.06 },
  jadeShoals: { colour: 0x6cc9a6, murk: 0.16 },
  coralAtolls: { colour: 0x22c6c4, murk: 0.12 },
  spiceIsles: { colour: 0x1d8a60, murk: 0.3 },
  fireArchipelago: { colour: 0x16191b, murk: 0.9 },
  weepingIsle: { colour: 0x1c3f7c, murk: 0.4 },
  mangroveLabyrinth: { colour: 0x5a4022, murk: 1.0 },
  maelstrom: { colour: 0x14223d, murk: 0.55 },
};

// ---------------------------------------------------------------- the test patch

const ss = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** Ground height above the sea: the shore runs along z, and the land climbs toward +x to a cliff and a top. */
function patchHeight(x: number, z: number): number {
  const u = x + 6 * Math.sin(z * 0.06) + 2 * Math.sin(z * 0.21 + 1);
  const bumps = Math.sin(x * 0.37 + z * 0.13) * Math.sin(z * 0.29 - x * 0.17);
  return -6.5 + 5.3 * ss(-50, -10, u) + 2.8 * ss(-12, 4, u) + 7.5 * ss(4, 22, u) + 15 * ss(23, 30, u)
    + 0.5 * bumps * ss(-30, -4, u) * (1 - ss(-4, 0, u)) + 0.9 * bumps * ss(8, 18, u) * (1 - ss(20, 23, u)) + 0.7 * bumps * ss(32, 40, u);
}

function terrainGeometry(): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(PATCH, PATCH, 240, 240);
  g.rotateX(-Math.PI / 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setY(i, patchHeight(p.getX(i), p.getZ(i)));
  g.computeVertexNormals();
  return g;
}

function waterGeometry(): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(PATCH, PATCH, 120, 120);
  g.rotateX(-Math.PI / 2);
  const p = g.attributes.position;
  const depth = new Float32Array(p.count);
  for (let i = 0; i < p.count; i++) depth[i] = -patchHeight(p.getX(i), p.getZ(i));
  g.setAttribute('depth', new THREE.BufferAttribute(depth, 1));
  return g;
}

// ---------------------------------------------------------------- textures

async function loadImage(path: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.src = '/' + path;
  await img.decode();
  return img;
}

interface SetTextures {
  albedo: THREE.DataArrayTexture;
  normal: THREE.DataArrayTexture;
  /** Roughness, AO and height in R, G and B. */
  rha: THREE.DataArrayTexture;
  emissive: THREE.Texture;
  layerOf: Map<string, number>;
}

function arrayTexture(data: Uint8Array, n: number, srgb: boolean): THREE.DataArrayTexture {
  const t = new THREE.DataArrayTexture(data, RES, RES, n);
  t.format = THREE.RGBAFormat;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

const black = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
black.needsUpdate = true;

/** Packs a set's scans (and the lava, when given) into three array textures. */
async function setTextures(set: MaterialSet, extra?: GlowLayer): Promise<SetTextures> {
  const scans: MaterialLayer[] = [...setScans(set).values()];
  if (extra) scans.push(extra);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = RES;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const pixels = (img: HTMLImageElement) => { ctx.drawImage(img, 0, 0, RES, RES); return ctx.getImageData(0, 0, RES, RES).data; };
  const L = RES * RES * 4, n = scans.length;
  const albedo = new Uint8Array(L * n), normal = new Uint8Array(L * n), rha = new Uint8Array(L * n);
  const layerOf = new Map<string, number>();
  for (let i = 0; i < n; i++) {
    const m = scans[i].maps;
    const [a, nr, r, ao, h] = await Promise.all([m.albedo, m.normal, m.roughness, m.ao, m.displacement ?? m.ao].map(loadImage));
    albedo.set(pixels(a), i * L);
    normal.set(pixels(nr), i * L);
    const R = pixels(r).slice(), A = pixels(ao).slice(), H = pixels(h);
    for (let k = 0; k < L; k += 4) { rha[i * L + k] = R[k]; rha[i * L + k + 1] = A[k]; rha[i * L + k + 2] = H[k]; rha[i * L + k + 3] = 255; }
    layerOf.set(scans[i].scan, i);
  }
  let emissive: THREE.Texture = black;
  if (extra) {
    emissive = new THREE.Texture(await loadImage(extra.emissive));
    emissive.wrapS = emissive.wrapT = THREE.RepeatWrapping;
    emissive.colorSpace = THREE.SRGBColorSpace;
    emissive.anisotropy = 8;
    emissive.needsUpdate = true;
  }
  return { albedo: arrayTexture(albedo, n, true), normal: arrayTexture(normal, n, false), rha: arrayTexture(rha, n, false), emissive, layerOf };
}

// ---------------------------------------------------------------- the ground shader

// Role order matches MATERIAL_ROLES: beach, seabed, cliff, slope, top, wetShore; index 6 is the lava flow.
const GROUND_FRAG = /* glsl */ `
precision highp sampler2DArray;
uniform sampler2DArray uAlb, uNrm, uRha;
uniform sampler2D uEmis;
uniform float uLayer[7], uScale[7], uWet[7], uNScale[7];
uniform vec3 uTint[7];
uniform vec3 uGlow;
uniform float uLava, uRoles;
varying vec3 vWP;
varying vec3 vWN;
varying vec3 vLP;

float hash12(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1, 0)), u.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), u.x), u.y);
}

struct Tap { vec3 alb; vec3 n; float rough; float ao; float h; vec3 e; };

// One planar tap. t and b are the world directions of the texture's u and v. Taps run inside branches,
// so they take explicit gradients worked out where control flow is uniform.
// Anti-tiling (after Inigo Quilez's texture-no-tile): a slow noise picks between two random offsets of the
// scan, so the repeat grid never lines up. The renderer needs the same, or something like it.
Tap tap(int i, vec2 uv, vec2 gx, vec2 gy, vec3 t, vec3 b, vec3 gn) {
  float L = uLayer[i];
  float l = vnoise(uv * 0.35 + float(i) * 17.0) * 6.0;
  float ia = floor(l), f = fract(l);
  vec2 oa = fract(sin(vec2(3.0, 7.0) * ia) * 43.7), ob = fract(sin(vec2(3.0, 7.0) * (ia + 1.0)) * 43.7);
  vec4 aA = textureGrad(uAlb, vec3(uv + oa, L), gx, gy), aB = textureGrad(uAlb, vec3(uv + ob, L), gx, gy);
  float m = smoothstep(0.25, 0.75, f - 0.15 * dot(aA.rgb - aB.rgb, vec3(1.0)));
  Tap o;
  o.e = i == 6 ? mix(textureGrad(uEmis, uv + oa, gx, gy).rgb, textureGrad(uEmis, uv + ob, gx, gy).rgb, m) : vec3(0.0);
  o.alb = min(mix(aA.rgb, aB.rgb, m) * uTint[i], vec3(0.95));
  vec3 tn = mix(textureGrad(uNrm, vec3(uv + oa, L), gx, gy).xyz, textureGrad(uNrm, vec3(uv + ob, L), gx, gy).xyz, m) * 2.0 - 1.0;
  tn.xy *= uNScale[i];
  o.n = normalize(t * tn.x + b * tn.y + gn * max(tn.z, 0.15));
  vec3 r = mix(textureGrad(uRha, vec3(uv + oa, L), gx, gy).rgb, textureGrad(uRha, vec3(uv + ob, L), gx, gy).rgb, m);
  o.rough = r.r; o.ao = r.g; o.h = r.b;
  // wet: darker and glossier
  o.alb *= mix(1.0, 0.55, uWet[i]);
  o.rough = mix(o.rough, 0.15, uWet[i]);
  return o;
}

// Planar from above for the ground roles; two side projections for the cliff. The arrays keep the image's
// top row at v = 0, so the image's "up" (the normal map's +green) runs toward -v.
Tap layerTap(int i, vec3 wp, vec3 dx, vec3 dy, vec3 gn, bool side) {
  float k = 1.0 / uScale[i];
  if (!side) {
    vec3 t = normalize(vec3(1.0, 0.0, 0.0) - gn * gn.x), b = normalize(vec3(0.0, 0.0, -1.0) + gn * gn.z);
    return tap(i, wp.xz * k, dx.xz * k, dy.xz * k, t, b, gn);
  }
  vec3 an = abs(gn);
  vec2 w = an.xz / max(an.x + an.z, 1e-3);
  w = w * w; w /= w.x + w.y;
  float sx = gn.x < 0.0 ? -1.0 : 1.0, sz = gn.z < 0.0 ? -1.0 : 1.0;
  // v = -y keeps the scan upright on the face, and u runs to the viewer's right
  vec3 up = normalize(vec3(0.0, 1.0, 0.0) - gn * gn.y);
  Tap a = tap(i, vec2(-wp.z * sx, -wp.y) * k, vec2(-dx.z * sx, -dx.y) * k, vec2(-dy.z * sx, -dy.y) * k, normalize(vec3(0.0, 0.0, -sx) + gn * gn.z * sx), up, gn);
  Tap c = tap(i, vec2(wp.x * sz, -wp.y) * k, vec2(dx.x * sz, -dx.y) * k, vec2(dy.x * sz, -dy.y) * k, normalize(vec3(sz, 0.0, 0.0) - gn * gn.x * sz), up, gn);
  Tap o;
  o.e = a.e * w.x + c.e * w.y;
  o.alb = a.alb * w.x + c.alb * w.y; o.n = normalize(a.n * w.x + c.n * w.y);
  o.rough = a.rough * w.x + c.rough * w.y; o.ao = a.ao * w.x + c.ao * w.y; o.h = a.h * w.x + c.h * w.y;
  return o;
}

const vec3 ROLE_COLOURS[7] = vec3[7](vec3(0.95, 0.8, 0.35), vec3(0.15, 0.35, 0.9), vec3(0.45, 0.45, 0.48),
  vec3(0.45, 0.8, 0.25), vec3(0.08, 0.45, 0.12), vec3(0.3, 0.85, 0.9), vec3(1.0, 0.25, 0.05));

void groundSurface(out vec3 alb, out vec3 nW, out float rough, out float ao, out vec3 emis) {
  vec3 wp = vWP, gn = normalize(vWN);
  vec3 dx = dFdx(wp), dy = dFdy(wp);
  float h = vLP.y;
  float slope = 1.0 - gn.y;
  float nz = (vnoise(vLP.xz * 0.12) - 0.5) + (vnoise(vLP.xz * 0.41 + 7.0) - 0.5) * 0.5;
  // where each role falls: the sea floor, the wet band, then the land by height and steepness
  float sea = 1.0 - smoothstep(-1.1, -0.3, h + nz * 0.5);
  float wet = (1.0 - sea) * (1.0 - smoothstep(0.35, 1.15, h + nz * 0.5));
  float land = 1.0 - sea - wet;
  float cliff = smoothstep(0.36, 0.52, slope + nz * 0.07);
  float flatness = 1.0 - smoothstep(0.07, 0.18, slope + nz * 0.04);
  float shore = 1.0 - smoothstep(2.2, 3.8, h + nz * 1.2);
  float high = smoothstep(16.0, 21.0, h + nz * 2.0);
  float w[7];
  w[0] = land * (1.0 - cliff) * shore;
  w[1] = sea;
  w[2] = land * cliff;
  w[3] = land * (1.0 - cliff) * (1.0 - shore) * (1.0 - high * flatness);
  w[4] = land * (1.0 - cliff) * (1.0 - shore) * high * flatness;
  w[5] = wet;
  // the lava channel runs from the top down to the sea, and dies in the water
  float lz = 14.0 + 6.0 * sin(vLP.x * 0.05 + 0.4);
  float lavaMask = uLava * (1.0 - smoothstep(2.5, 5.0, abs(vLP.z - lz) + nz * 2.0)) * smoothstep(-0.6, 0.4, h);
  w[6] = lavaMask;
  // sample every role that shows, then blend by weight sharpened by each scan's own height
  Tap t[7];
  float a[7];
  float best = -1.0;
  for (int i = 0; i < 7; i++) {
    a[i] = 0.0;
    if (w[i] < 0.003) continue;
    t[i] = layerTap(i, wp, dx, dy, gn, i == 2 || (i == 6 && slope > 0.3));
    a[i] = w[i] + t[i].h * 0.6 * w[i];
    best = max(best, a[i]);
  }
  float sum = 0.0;
  alb = vec3(0.0); vec3 n = vec3(0.0); rough = 0.0; ao = 0.0; emis = vec3(0.0);
  for (int i = 0; i < 7; i++) {
    if (a[i] <= 0.0) continue;
    float k = max(a[i] - (best - 0.18), 0.0);
    if (k <= 0.0) continue;
    vec3 c = uRoles > 0.5 ? ROLE_COLOURS[i] : t[i].alb;
    alb += c * k; n += t[i].n * k; rough += t[i].rough * k; ao += t[i].ao * k;
    if (uRoles < 0.5) emis += t[i].e * uGlow * k;
    sum += k;
  }
  alb /= sum; nW = normalize(n); rough /= sum; ao /= sum; emis /= sum;
  // a slow brightness drift, so the far ground is never one flat colour
  if (uRoles < 0.5) alb *= mix(0.84, 1.1, vnoise(vLP.xz * 0.025) * 0.6 + vnoise(vLP.xz * 0.09 + 3.0) * 0.4);
}`;

const rolesUniform = { value: params.get('roles') === '1' ? 1 : 0 };
const sunUniform = { value: new THREE.Vector3() };

function groundMaterial(set: MaterialSet, tex: SetTextures, origin: THREE.Vector3, lava?: GlowLayer): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0 });
  const layers: MaterialLayer[] = MATERIAL_ROLES.map((r) => set.layers[r]);
  layers.push(lava ?? set.layers.slope);
  const uniforms = {
    uAlb: { value: tex.albedo }, uNrm: { value: tex.normal }, uRha: { value: tex.rha }, uEmis: { value: tex.emissive },
    uLayer: { value: layers.map((l) => tex.layerOf.get(l.scan)!) },
    uScale: { value: layers.map((l) => l.scale) },
    uWet: { value: layers.map((l) => l.wet) },
    uNScale: { value: layers.map((l) => l.normalScale ?? 1) },
    uTint: { value: layers.map((l) => new THREE.Vector3(...l.tint)) },
    uGlow: { value: new THREE.Vector3(...(lava?.glow ?? [0, 0, 0])) },
    uLava: { value: lava ? 1 : 0 },
    uRoles: rolesUniform,
    uOrigin: { value: origin },
  };
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, uniforms);
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uOrigin;\nvarying vec3 vWP;\nvarying vec3 vWN;\nvarying vec3 vLP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWP = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvLP = vWP - uOrigin;\nvWN = normalize(mat3(modelMatrix) * objectNormal);');
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\n' + GROUND_FRAG)
      .replace('#include <map_fragment>', 'vec3 gAlb, gN, gEmis; float gRough, gAO;\ngroundSurface(gAlb, gN, gRough, gAO, gEmis);\ndiffuseColor.rgb = gAlb;')
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = gRough;')
      .replace('#include <normal_fragment_maps>', 'normal = normalize((viewMatrix * vec4(gN, 0.0)).xyz);')
      .replace('#include <emissivemap_fragment>', 'totalEmissiveRadiance += gEmis;')
      .replace('#include <aomap_fragment>', 'reflectedLight.indirectDiffuse *= gAO;\nreflectedLight.indirectSpecular *= gAO;\nreflectedLight.directDiffuse *= mix(1.0, gAO, 0.5);');
  };
  m.customProgramCacheKey = () => 'ground-south';
  return m;
}

function waterMaterial(colour: number, murk: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uColour: { value: new THREE.Color(colour) }, uMurk: { value: murk }, uSun: sunUniform },
    vertexShader: /* glsl */ `
      attribute float depth; varying float vDepth; varying vec3 vWP;
      void main() { vDepth = depth; vec4 w = modelMatrix * vec4(position, 1.0); vWP = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColour; uniform float uMurk; uniform vec3 uSun; varying float vDepth; varying vec3 vWP;
      void main() {
        if (vDepth < 0.0) discard;
        vec3 v = normalize(cameraPosition - vWP);
        float path = vDepth / max(v.y, 0.2);
        float a = 1.0 - exp(-path * uMurk);
        float fres = pow(1.0 - max(v.y, 0.0), 5.0);
        vec3 c = uColour * (0.3 + 0.7 * max(uSun.y, 0.06)) + fres * 0.3;
        gl_FragColor = vec4(c, clamp(0.12 + a * 0.85 + fres * 0.4, 0.0, 0.97));
        #include <colorspace_fragment>
      }`,
  });
}

// ---------------------------------------------------------------- the scene

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.3, 3000);
const sun = new THREE.DirectionalLight(0xffffff, 3);
const hemi = new THREE.HemisphereLight(0xbcd4ff, 0x3a3226, 0.9);
scene.add(sun, sun.target, hemi);

const LIGHTS = {
  day: { elev: 48, az: 140, colour: 0xfff3e0, power: 3.2, sky: 0xaecbec, ground: 0x4c4438, hemi: 1.0, bg: 0x93b7dc, exposure: 1.0 },
  dusk: { elev: 7, az: 215, colour: 0xff9550, power: 2.4, sky: 0x676c9c, ground: 0x2c2230, hemi: 0.55, bg: 0x3e3e5c, exposure: 1.25 },
};
let light: keyof typeof LIGHTS = params.get('light') === 'dusk' ? 'dusk' : 'day';
function applyLight(): void {
  const L = LIGHTS[light];
  const e = THREE.MathUtils.degToRad(L.elev), a = THREE.MathUtils.degToRad(L.az);
  sun.position.set(Math.cos(e) * Math.cos(a), Math.sin(e), Math.cos(e) * Math.sin(a)).multiplyScalar(400);
  sunUniform.value.copy(sun.position).normalize();
  sun.color.set(L.colour);
  sun.intensity = L.power;
  hemi.color.set(L.sky);
  hemi.groundColor.set(L.ground);
  hemi.intensity = L.hemi;
  scene.background = new THREE.Color(L.bg);
  scene.fog = new THREE.Fog(L.bg, 450, 1700);
  renderer.toneMappingExposure = L.exposure;
}
applyLight();

const COLS = 4, GAP = 24;
const labels: { el: HTMLDivElement; pos: THREE.Vector3 }[] = [];
const terrainGeo = terrainGeometry(), waterGeo = waterGeometry();

/** Small tinted swatches of a region's scans, with the roles each one paints. */
function legend(set: MaterialSet, lava?: GlowLayer): void {
  const box = document.getElementById('legend')!;
  const roles = new Map<string, MaterialRole[]>();
  for (const r of MATERIAL_ROLES) roles.set(set.layers[r].scan, [...(roles.get(set.layers[r].scan) ?? []), r]);
  const rows: [MaterialLayer, string][] = [...setScans(set).values()].map((l) => [l, roles.get(l.scan)!.join(', ')]);
  if (lava) rows.push([lava, 'lava flow (extra)']);
  for (const [layer, what] of rows) {
    const row = document.createElement('div');
    row.className = 'row';
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d')!;
    loadImage(layer.maps.albedo).then((img) => {
      g.drawImage(img, 0, 0, 64, 64);
      const d = g.getImageData(0, 0, 64, 64);
      const toLin = (v: number) => (v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
      const toSrgb = (v: number) => 255 * (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055);
      for (let k = 0; k < d.data.length; k += 4) for (let j = 0; j < 3; j++) d.data[k + j] = toSrgb(Math.min(0.95, toLin(d.data[k + j]) * layer.tint[j]));
      g.putImageData(d, 0, 0);
    });
    const text = document.createElement('div');
    const id = layer.source.split('/').pop();
    text.innerHTML = `<b>${layer.scan}</b> <span>${id}</span><br>${what} · ${layer.scale} m${layer.wet ? ` · wet ${layer.wet}` : ''}`;
    row.append(c, text);
    box.appendChild(row);
  }
}

async function build(): Promise<void> {
  const status = document.getElementById('status')!;
  for (let i = 0; i < regions.length; i++) {
    const id = regions[i];
    status.textContent = `loading ${id} (${i + 1}/${regions.length})`;
    const col = i % COLS, row = Math.floor(i / COLS);
    const origin = only ? new THREE.Vector3() : new THREE.Vector3((col - (COLS - 1) / 2) * (PATCH + GAP), 0, (row - 0.5) * (PATCH + GAP));
    const set = REGION_MATERIALS[id];
    const lava = id === 'fireArchipelago' ? FIRE_LAVA_FLOW : undefined;
    const tex = await setTextures(set, lava);
    const ground = new THREE.Mesh(terrainGeo, groundMaterial(set, tex, origin, lava));
    ground.position.copy(origin);
    const water = new THREE.Mesh(waterGeo, waterMaterial(WATER[id].colour, WATER[id].murk));
    water.position.copy(origin);
    scene.add(ground, water);
    const el = document.createElement('div');
    el.className = 'label';
    el.textContent = id;
    document.body.appendChild(el);
    labels.push({ el, pos: origin.clone().add(new THREE.Vector3(0, 36, -PATCH / 2)) });
    if (only) legend(set, lava);
  }
  status.textContent = '';
  (window as unknown as { ready: boolean }).ready = true;
}

const CAMS = {
  grid: { dist: 330, height: 210, look: new THREE.Vector3(0, 0, 0) },
  far: { dist: 125, height: 70, look: new THREE.Vector3(0, 6, 0) },
  mid: { dist: 50, height: 22, look: new THREE.Vector3(6, 4, 4) },
  near: { dist: 13, height: 6, look: new THREE.Vector3(-4, 0.5, 6) },
};
const camKey = only ? ((params.get('cam') as keyof typeof CAMS | null) ?? 'far') : 'grid';
const spin = params.get('spin') !== '0';
const startAngle = Number(params.get('angle') ?? (only ? 200 : 180));
const t0 = performance.now();

function frame(): void {
  const c = CAMS[camKey];
  const ang = THREE.MathUtils.degToRad(startAngle) + (spin ? ((performance.now() - t0) / 1000) * 0.08 : 0);
  camera.position.set(c.look.x + Math.cos(ang) * c.dist, c.look.y + c.height, c.look.z + Math.sin(ang) * c.dist);
  if (only) camera.position.y = Math.max(camera.position.y, patchHeight(camera.position.x, camera.position.z) + 2);
  camera.lookAt(c.look);
  renderer.render(scene, camera);
  for (const l of labels) {
    const p = l.pos.clone().project(camera);
    l.el.style.display = p.z < 1 ? '' : 'none';
    l.el.style.transform = `translate(-50%, -50%) translate(${(p.x * 0.5 + 0.5) * innerWidth}px, ${(-p.y * 0.5 + 0.5) * innerHeight}px)`;
  }
  requestAnimationFrame(frame);
}

function controls(): void {
  const bar = document.getElementById('bar')!;
  const link = (label: string, q: Record<string, string | null>) => {
    const a = document.createElement('a');
    const u = new URLSearchParams(location.search);
    for (const [k, v] of Object.entries(q)) if (v === null) u.delete(k); else u.set(k, v);
    a.href = '?' + u.toString();
    a.textContent = label;
    if ((q.region ?? null) === only && 'region' in q) a.className = 'on';
    bar.appendChild(a);
  };
  link('grid', { region: null, cam: null });
  for (const id of Object.keys(REGION_MATERIALS)) link(id, { region: id });
  const b = document.createElement('button');
  const name = () => (b.textContent = light === 'day' ? 'dusk' : 'day');
  name();
  b.onclick = () => { light = light === 'day' ? 'dusk' : 'day'; applyLight(); name(); };
  bar.appendChild(b);
  if (only) for (const k of ['far', 'mid', 'near'] as const) link(k, { cam: k });
  link(rolesUniform.value ? 'scans' : 'roles', { roles: rolesUniform.value ? null : '1' });
}

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});

controls();
frame();
build();

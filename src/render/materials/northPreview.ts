// The dev page for the northern material library (dev/materials-north.html). Each region's set is painted
// on a test patch of ground that runs from the seabed through the wet shore, a beach and a slope to a cliff
// and a flat top, under a sun that switches between day and dusk.
//
// URL parameters:
//   ?region=<id>   one region up close (default: all eight in a grid)
//   &light=dusk    start at dusk (default day)
//   &cam=near      a low camera at the shore, about 10 m from the ground (single region only)
//   &cam=mid       about 50 m out
//   &roles=1       paint each role a flat colour instead of its scan, to check where the roles fall
//   &spin=0        stop the turntable
//   &res=<px>      texture size the page uploads (default 2048 for one region, 512 for the grid)
import * as THREE from 'three';
import { REGION_MATERIALS } from './north.ts';
import { MATERIAL_ROLES, setScans, type MaterialSet, type NorthRegionId } from './types.ts';

const params = new URLSearchParams(location.search);
const only = params.get('region') as NorthRegionId | null;
const regions = (only ? [only] : Object.keys(REGION_MATERIALS)) as NorthRegionId[];
const RES = Number(params.get('res') ?? (only ? 2048 : 512));
const PATCH = 100; // metres on a side

// Water colours from the portraits, only to judge the seabed role through the water.
const WATER: Record<NorthRegionId, number> = {
  iceCrown: 0x5d7486, fjords: 0x5fb3b0, mistwood: 0x14231d, spires: 0x2f9a98,
  narrows: 0x1f4b33, basaltStacks: 0x4c6460, kelpShallows: 0x6f7a3a, blossomRun: 0x7fb0d8,
};

// ---------------------------------------------------------------- the test patch

const ss = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** Ground height, metres above the sea, on a patch whose shore runs along z and rises toward +x. */
function patchHeight(x: number, z: number): number {
  const u = x + 5 * Math.sin(z * 0.07) + 2.5 * Math.sin(z * 0.19 + 1.3);
  const bumps = 0.6 * Math.sin(x * 0.31 + z * 0.17) * Math.sin(z * 0.27 - x * 0.11);
  return -7 + 6.4 * ss(-48, -14, u) + 2.6 * ss(-16, -1, u) + 8 * ss(0, 17, u) + 15 * ss(20, 26, u) + bumps * ss(-20, 0, u) + 1.2 * bumps * ss(26, 34, u);
}

function terrainGeometry(): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(PATCH, PATCH, 220, 220);
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

// ---------------------------------------------------------------- texture arrays

async function loadImage(path: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.src = '/' + path;
  await img.decode();
  return img;
}

interface SetTextures { albedo: THREE.DataArrayTexture; normal: THREE.DataArrayTexture; rad: THREE.DataArrayTexture; layerOf: Map<string, number> }

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

/** Packs a set's scans into three arrays: albedo, normal, and roughness / AO / height in R / G / B. */
async function setTextures(set: MaterialSet): Promise<SetTextures> {
  const scans = [...setScans(set).values()];
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = RES;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const px = (img: HTMLImageElement) => { ctx.clearRect(0, 0, RES, RES); ctx.drawImage(img, 0, 0, RES, RES); return ctx.getImageData(0, 0, RES, RES).data; };
  const L = RES * RES * 4, n = scans.length;
  const albedo = new Uint8Array(L * n), normal = new Uint8Array(L * n), rad = new Uint8Array(L * n);
  const layerOf = new Map<string, number>();
  for (let i = 0; i < n; i++) {
    const m = scans[i].maps;
    const [a, nr, r, ao, d] = await Promise.all([m.albedo, m.normal, m.roughness, m.ao, m.displacement ?? m.ao].map(loadImage));
    albedo.set(px(a), i * L);
    normal.set(px(nr), i * L);
    const R = px(r).slice(), A = px(ao).slice(), D = px(d);
    for (let k = 0; k < L; k += 4) { rad[i * L + k] = R[k]; rad[i * L + k + 1] = A[k]; rad[i * L + k + 2] = D[k]; rad[i * L + k + 3] = 255; }
    layerOf.set(scans[i].scan, i);
  }
  return { albedo: arrayTexture(albedo, n, true), normal: arrayTexture(normal, n, false), rad: arrayTexture(rad, n, false), layerOf };
}

// ---------------------------------------------------------------- the ground shader

const GROUND_FRAG = /* glsl */ `
precision highp sampler2DArray;
uniform sampler2DArray uAlb, uNrm, uRad;
uniform float uLayer[6], uScale[6], uWet[6], uNScale[6];
uniform vec3 uTint[6];
uniform float uRoles;
varying vec3 vWP;
varying vec3 vWN;
varying vec3 vLP;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
vec3 nrmT(vec4 t) { return vec3(t.xy * 2.0 - 1.0, t.z * 2.0 - 1.0); }

struct Tap { vec3 alb; vec3 n; float rough; float ao; float h; };

// one planar tap; t and b are the world directions of the texture's u and v. Taps run inside branches,
// so they take explicit gradients (gx, gy) worked out where control flow is uniform.
Tap tap(int i, vec2 uv, vec2 gx, vec2 gy, vec3 t, vec3 b, vec3 gn) {
  float L = uLayer[i];
  Tap o;
  o.alb = textureGrad(uAlb, vec3(uv, L), gx, gy).rgb * uTint[i];
  vec3 tn = nrmT(textureGrad(uNrm, vec3(uv, L), gx, gy));
  tn.xy *= uNScale[i];
  o.n = normalize(t * tn.x + b * tn.y + gn * max(tn.z, 0.15));
  vec3 r = textureGrad(uRad, vec3(uv, L), gx, gy).rgb;
  o.rough = r.r; o.ao = r.g; o.h = r.b;
  // wet: darker and glossier
  o.alb *= mix(1.0, 0.5, uWet[i]);
  o.rough = mix(o.rough, 0.12, uWet[i]);
  return o;
}

// planar from above for the ground roles, two side projections for the cliff
Tap layerTap(int i, vec3 wp, vec3 dx, vec3 dy, vec3 gn, bool cliff) {
  float k = 1.0 / uScale[i];
  if (!cliff) {
    vec3 t = normalize(vec3(1.0, 0.0, 0.0) - gn * gn.x), b = normalize(vec3(0.0, 0.0, 1.0) - gn * gn.z);
    return tap(i, wp.xz * k, dx.xz * k, dy.xz * k, t, b, gn);
  }
  vec3 an = abs(gn);
  vec2 w = an.xz / max(an.x + an.z, 1e-3);
  float sx = gn.x < 0.0 ? -1.0 : 1.0, sz = gn.z < 0.0 ? -1.0 : 1.0;
  vec3 up = normalize(vec3(0.0, 1.0, 0.0) - gn * gn.y);
  Tap a = tap(i, vec2(wp.z * sx, wp.y) * k, vec2(dx.z * sx, dx.y) * k, vec2(dy.z * sx, dy.y) * k, normalize(vec3(0.0, 0.0, sx) - gn * gn.z * sx), up, gn);
  Tap c = tap(i, vec2(-wp.x * sz, wp.y) * k, vec2(-dx.x * sz, dx.y) * k, vec2(-dy.x * sz, dy.y) * k, normalize(vec3(-sz, 0.0, 0.0) + gn * gn.x * sz), up, gn);
  Tap o;
  o.alb = a.alb * w.x + c.alb * w.y; o.n = normalize(a.n * w.x + c.n * w.y);
  o.rough = a.rough * w.x + c.rough * w.y; o.ao = a.ao * w.x + c.ao * w.y; o.h = a.h * w.x + c.h * w.y;
  return o;
}

const vec3 ROLE_COLOURS[6] = vec3[6](vec3(0.9, 0.8, 0.4), vec3(0.2, 0.4, 0.9), vec3(0.5, 0.5, 0.5), vec3(0.4, 0.8, 0.3), vec3(0.1, 0.5, 0.1), vec3(0.3, 0.8, 0.9));

void groundSurface(out vec3 alb, out vec3 nW, out float rough, out float ao) {
  vec3 wp = vWP, gn = normalize(vWN);
  vec3 dx = dFdx(wp), dy = dFdy(wp);
  float h = vLP.y;
  float slope = 1.0 - gn.y;
  float n1 = vnoise(vLP.xz * 0.11), n2 = vnoise(vLP.xz * 0.37 + 7.0);
  float nz = (n1 - 0.5) + (n2 - 0.5) * 0.5;
  // role weights, in MATERIAL_ROLES order: beach, seabed, cliff, slope, top, wetShore
  float wSea = 1.0 - smoothstep(-1.3, -0.5, h + nz * 0.6);
  float wWet = (1.0 - wSea) * (1.0 - smoothstep(0.5, 1.3, h + nz * 0.5));
  float land = 1.0 - wSea - wWet;
  float cliff = smoothstep(0.3, 0.42, slope + nz * 0.06);
  float slopeW = smoothstep(0.035, 0.08, slope + nz * 0.04) * (1.0 - cliff);
  float flat_ = 1.0 - cliff - slopeW;
  float low = 1.0 - smoothstep(2.4, 4.0, h + nz * 1.5);
  float w[6];
  w[0] = land * (flat_ + slopeW * 0.6) * low;
  w[3] = land * slopeW * (1.0 - low * 0.6);
  w[1] = wSea;
  w[2] = land * cliff;
  w[4] = land * flat_ * (1.0 - low);
  w[5] = wWet;
  // sample every role that shows, then blend by weight sharpened by each scan's own height
  Tap t[6];
  float best = -1.0;
  float a[6];
  for (int i = 0; i < 6; i++) {
    a[i] = 0.0;
    if (w[i] < 0.003) continue;
    t[i] = layerTap(i, wp, dx, dy, gn, i == 2);
    a[i] = w[i] + t[i].h * 0.6 * w[i];
    best = max(best, a[i]);
  }
  float sum = 0.0;
  alb = vec3(0.0); vec3 n = vec3(0.0); rough = 0.0; ao = 0.0;
  for (int i = 0; i < 6; i++) {
    if (a[i] <= 0.0) continue;
    float k = max(a[i] - (best - 0.18), 0.0);
    if (k <= 0.0) continue;
    vec3 c = uRoles > 0.5 ? ROLE_COLOURS[i] : t[i].alb;
    alb += c * k; n += t[i].n * k; rough += t[i].rough * k; ao += t[i].ao * k;
    sum += k;
  }
  alb /= sum; nW = normalize(n); rough /= sum; ao /= sum;
}`;

function groundMaterial(set: MaterialSet, tex: SetTextures, origin: THREE.Vector3): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0 });
  const layers = MATERIAL_ROLES.map((r) => set.layers[r]);
  const uniforms = {
    uAlb: { value: tex.albedo }, uNrm: { value: tex.normal }, uRad: { value: tex.rad },
    uLayer: { value: layers.map((l) => tex.layerOf.get(l.scan)!) },
    uScale: { value: layers.map((l) => l.scale) },
    uWet: { value: layers.map((l) => l.wet) },
    uNScale: { value: layers.map((l) => l.normalScale ?? 1) },
    uTint: { value: layers.map((l) => new THREE.Vector3(...l.tint)) },
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
      .replace('#include <map_fragment>', 'vec3 gAlb, gN; float gRough, gAO;\ngroundSurface(gAlb, gN, gRough, gAO);\ndiffuseColor.rgb = gAlb;')
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = gRough;')
      .replace('#include <normal_fragment_maps>', 'normal = normalize((viewMatrix * vec4(gN, 0.0)).xyz);')
      .replace('#include <aomap_fragment>', 'reflectedLight.indirectDiffuse *= gAO;\nreflectedLight.indirectSpecular *= gAO;\nreflectedLight.directDiffuse *= mix(1.0, gAO, 0.5);');
  };
  m.customProgramCacheKey = () => 'ground-north';
  return m;
}

function waterMaterial(colour: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uColour: { value: new THREE.Color(colour) }, uSun: sunUniform },
    vertexShader: /* glsl */ `
      attribute float depth; varying float vDepth; varying vec3 vWP;
      void main() { vDepth = depth; vec4 w = modelMatrix * vec4(position, 1.0); vWP = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColour; uniform vec3 uSun; varying float vDepth; varying vec3 vWP;
      void main() {
        if (vDepth < 0.0) discard;
        float a = 1.0 - exp(-vDepth * 0.32);
        vec3 v = normalize(cameraPosition - vWP);
        float fres = pow(1.0 - max(v.y, 0.0), 4.0);
        vec3 c = uColour * (0.35 + 0.65 * max(uSun.y, 0.05)) + fres * 0.25;
        gl_FragColor = vec4(c, clamp(a * 0.85 + fres * 0.3, 0.0, 0.97));
        #include <colorspace_fragment>
      }`,
  });
}

// ---------------------------------------------------------------- the scene

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.5, 3000);
const sun = new THREE.DirectionalLight(0xffffff, 3);
const hemi = new THREE.HemisphereLight(0xbcd4ff, 0x3a3226, 0.9);
scene.add(sun, sun.target, hemi);
const rolesUniform = { value: params.get('roles') === '1' ? 1 : 0 };
const sunUniform = { value: new THREE.Vector3() };

const LIGHTS = {
  day: { elev: 42, az: 140, colour: 0xfff4e2, power: 3.2, sky: 0xa9c6e8, ground: 0x4a4236, hemi: 1.0, bg: 0x8fb3d9, exposure: 1.0 },
  dusk: { elev: 7, az: 215, colour: 0xff9a52, power: 2.4, sky: 0x6a6f9e, ground: 0x2c2230, hemi: 0.55, bg: 0x40405e, exposure: 1.25 },
};
let light: keyof typeof LIGHTS = params.get('light') === 'dusk' ? 'dusk' : 'day';
function applyLight(): void {
  const L = LIGHTS[light];
  const e = THREE.MathUtils.degToRad(L.elev), a = THREE.MathUtils.degToRad(L.az);
  sun.position.set(Math.cos(e) * Math.cos(a), Math.sin(e), Math.cos(e) * Math.sin(a)).multiplyScalar(400);
  sunUniform.value.copy(sun.position).normalize();
  sun.color.set(L.colour); sun.intensity = L.power;
  hemi.color.set(L.sky); hemi.groundColor.set(L.ground); hemi.intensity = L.hemi;
  scene.background = new THREE.Color(L.bg);
  scene.fog = new THREE.Fog(L.bg, 400, 1600);
  renderer.toneMappingExposure = L.exposure;
}
applyLight();

const COLS = 4, GAP = 40;
const labels: { el: HTMLDivElement; pos: THREE.Vector3 }[] = [];
const centre = new THREE.Vector3();
const terrainGeo = terrainGeometry(), waterGeo = waterGeometry();

async function build(): Promise<void> {
  const status = document.getElementById('status')!;
  for (let i = 0; i < regions.length; i++) {
    const id = regions[i];
    status.textContent = `loading ${id} (${i + 1}/${regions.length})`;
    // the grid: two rows going inland (x), four patches along each shore (z), all facing the camera
    const col = i % COLS, row = Math.floor(i / COLS);
    const origin = only ? new THREE.Vector3() : new THREE.Vector3((row - 0.5) * (PATCH + GAP), 0, (col - (COLS - 1) / 2) * (PATCH + GAP));
    const set = REGION_MATERIALS[id];
    const tex = await setTextures(set);
    const ground = new THREE.Mesh(terrainGeo, groundMaterial(set, tex, origin));
    ground.position.copy(origin);
    const water = new THREE.Mesh(waterGeo, waterMaterial(WATER[id]));
    water.position.copy(origin);
    scene.add(ground, water);
    const el = document.createElement('div');
    el.className = 'label';
    el.textContent = id;
    document.body.appendChild(el);
    labels.push({ el, pos: origin.clone().add(new THREE.Vector3(-PATCH / 2, 2, 0)) });
  }
  status.textContent = '';
  (window as unknown as { ready: boolean }).ready = true;
}

const CAMS = {
  grid: { dist: 300, height: 260, look: new THREE.Vector3(10, 0, 0) },
  far: { dist: 125, height: 70, look: new THREE.Vector3(0, 6, 0) },
  mid: { dist: 52, height: 22, look: new THREE.Vector3(4, 4, 0) },
  near: { dist: 14, height: 7, look: new THREE.Vector3(-8, 0.5, 0) },
};
const camKey = only ? ((params.get('cam') as keyof typeof CAMS | null) ?? 'far') : 'grid';
const spin = params.get('spin') !== '0';
const startAngle = Number(params.get('angle') ?? (only ? 200 : 180));
const spinRate = only ? 0.08 : 0;
const t0 = performance.now();
function frame(): void {
  const c = CAMS[camKey];
  const ang = THREE.MathUtils.degToRad(startAngle) + (spin ? ((performance.now() - t0) / 1000) * spinRate : 0);
  camera.position.set(c.look.x + Math.cos(ang) * c.dist, c.look.y + c.height, c.look.z + Math.sin(ang) * c.dist).add(centre);
  if (camKey === 'near') camera.position.y = Math.max(camera.position.y, patchHeight(camera.position.x, camera.position.z) + 2);
  camera.lookAt(c.look.clone().add(centre));
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
void build();
frame();

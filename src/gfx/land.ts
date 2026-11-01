// The land: splatted terrain, the far mountain ring, trees and bushes built from code, grass, boulders, the falls,
// the arch and the volcano's lava. Every mesh here is generated.
import * as THREE from 'three';
import { ARCH, CELL, HALF, PLACES, PLAY_R, RES, TREE, noise, rng, sampleHeight, type Tree, type World } from '../world.ts';
import { GLOBE, LAYER, U, patch, type Shader, type Textures } from './engine.ts';

// ---------------------------------------------------------------- data textures

export function heightTexture(world: World): THREE.DataTexture {
  const data = new Uint16Array(RES * RES);
  for (let i = 0; i < data.length; i++) data[i] = THREE.DataUtils.toHalfFloat(world.heights[i]);
  const t = new THREE.DataTexture(data, RES, RES, THREE.RedFormat, THREE.HalfFloatType);
  t.magFilter = t.minFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.needsUpdate = true;
  return t;
}

/** Forest shade and blossom carpets rasterised from the trees into the splat map. */
function splatTexture(world: World): THREE.DataTexture {
  const s = world.splat;
  const stamp = (x: number, z: number, rad: number, ch: number, amt: number) => {
    const cx = (x + HALF) / CELL, cz = (z + HALF) / CELL, r = rad / CELL;
    for (let iz = Math.max(0, Math.floor(cz - r)); iz <= Math.min(RES - 1, Math.ceil(cz + r)); iz++) {
      for (let ix = Math.max(0, Math.floor(cx - r)); ix <= Math.min(RES - 1, Math.ceil(cx + r)); ix++) {
        const d = Math.hypot(ix - cx, iz - cz) / r;
        if (d >= 1) continue;
        const i = (iz * RES + ix) * 4 + ch;
        s[i] = Math.min(255, s[i] + amt * (1 - d * d));
      }
    }
  };
  for (const t of world.trees) {
    if (t.kind === TREE.cherry) stamp(t.x, t.z, 7 * t.s, 3, 120);
    else if (t.kind !== TREE.bush) stamp(t.x, t.z, 5.5 * t.s, 0, 95);
  }
  const tex = new THREE.DataTexture(s, RES, RES, THREE.RGBAFormat);
  tex.magFilter = tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

// ---------------------------------------------------------------- terrain

const TERRAIN_FRAG = /* glsl */ `
uniform sampler2DArray uTerr, uTerrN;
uniform sampler2D uSplat;
uniform float uHalf;
varying vec3 vWP;
varying vec3 vWN;
vec3 nrmT(vec4 t) { return vec3(t.xy * 2.0 - 1.0, t.z * 2.0 - 1.0); }
void sampleTop(int layer, vec2 uv, float w, inout vec3 alb, inout vec3 n) {
  if (w < 0.004) return;
  alb += texture(uTerr, vec3(uv, float(layer))).rgb * w;
  n += nrmT(texture(uTerrN, vec3(uv, float(layer)))) * w;
}
void terrainSurface(vec3 wp, vec3 gn, out vec3 alb, out vec3 nW, out float rough) {
  vec2 suv = (wp.xz + uHalf) / (2.0 * uHalf);
  vec4 sp = texture(uSplat, suv) * step(0.0, suv.x) * step(suv.x, 1.0) * step(0.0, suv.y) * step(suv.y, 1.0);
  float dist = length(wp - cameraPosition);
  float wild = smoothstep(${PLAY_R + 40}.0, ${PLAY_R + 160}.0, length(wp.xz));
  float n1 = texture(uNoise, wp.xz * 0.0045).r;
  float n2 = texture(uNoise, wp.xz * 0.031).g;
  float n3 = texture(uNoise, wp.xz * 0.11).b;
  float slope = 1.0 - gn.y;
  float h = wp.y;
  float cliff = smoothstep(mix(0.26, 0.42, wild), mix(0.46, 0.62, wild), slope + (n2 - 0.5) * 0.22);
  float shore = 1.0 - smoothstep(0.5, 2.0 + n1 * 2.6, h + (n3 - 0.5) * 0.8);
  float snow = max(sp.g / 1.0, smoothstep(300.0, 380.0, h + n1 * 80.0)) * (1.0 - cliff * 0.7);
  float ash = sp.b;
  float forest = max(smoothstep(0.05, 0.6, sp.r), wild * smoothstep(0.3, 0.5, n1 + n2 * 0.25) * smoothstep(290.0, 230.0, h + n1 * 70.0));
  forest *= 1.0 - ash;
  float bloom = sp.a;
  float pebble = shore * smoothstep(0.42, 0.62, n1 + n3 * 0.2);
  float sand = shore - pebble;
  float land = 1.0 - shore;
  // scales: a near tile and a far one, mixed to hide repetition
  float far = smoothstep(60.0, 260.0, dist);
  vec2 uvA = wp.xz * 0.21, uvB = wp.xz * 0.043;
  vec3 a = vec3(0.0), n = vec3(0.0);
  float wGrass = land * (1.0 - forest) * (1.0 - ash);
  float wForest = land * forest * (1.0 - ash);
  float wBurnt = (land + sand * 0.6) * ash;
  float wSand = sand * (1.0 - ash * 0.6);
  sampleTop(${LAYER.grass}, mix(uvA, uvB, far), wGrass, a, n);
  sampleTop(${LAYER.forest}, mix(uvA, uvB, far) * 1.3, wForest, a, n);
  sampleTop(${LAYER.burnt}, uvA, wBurnt, a, n);
  sampleTop(${LAYER.sand}, uvA * 1.2, wSand, a, n);
  sampleTop(${LAYER.pebbles}, uvA * 1.6, pebble, a, n);
  float wsum = max(wGrass + wForest + wBurnt + wSand + pebble, 1e-3);
  a /= wsum; n /= wsum;
  // colour the photographs toward the painting: lush yellow-greens, cool shadows
  vec3 grassTint = mix(vec3(0.78, 1.0, 0.5), vec3(0.6, 0.82, 0.45), n1);
  a = mix(a, a * grassTint * 1.25, wGrass / wsum * 0.85);
  a = mix(a, a * vec3(0.55, 0.62, 0.42), wForest / wsum);
  a = mix(a, mix(a, vec3(0.9, 0.62, 0.7) * 0.85, 0.55), bloom * land * (1.0 - forest * 0.4) * smoothstep(0.35, 0.6, n3));
  a *= mix(0.82, 1.12, n2);
  // cliffs: two side projections, lichen and moss on the ledges
  if (cliff > 0.004) {
    vec3 an = abs(gn);
    vec2 wts = an.xz / max(an.x + an.z, 1e-3);
    vec2 uvX = vec2(wp.z, wp.y) * 0.07, uvZ = vec2(wp.x, wp.y) * 0.07;
    vec3 ca = texture(uTerr, vec3(uvX, float(${LAYER.cliff}))).rgb * wts.x + texture(uTerr, vec3(uvZ, float(${LAYER.cliff}))).rgb * wts.y;
    vec3 cn = nrmT(texture(uTerrN, vec3(uvX, float(${LAYER.cliff})))) * wts.x + nrmT(texture(uTerrN, vec3(uvZ, float(${LAYER.cliff})))) * wts.y;
    vec3 la = texture(uTerr, vec3(uvX * 1.7, float(${LAYER.lichen}))).rgb * wts.x + texture(uTerr, vec3(uvZ * 1.7, float(${LAYER.lichen}))).rgb * wts.y;
    ca = mix(ca * vec3(0.78, 0.8, 0.82), la, smoothstep(0.3, 0.7, n2) * 0.6);
    ca = mix(vec3(dot(ca, vec3(0.33))), ca, 0.55) * vec3(0.9, 0.95, 1.0);
    float ledge = smoothstep(0.62, 0.42, slope) * (1.0 - ash);
    vec3 mo = texture(uTerr, vec3(wp.xz * 0.12, float(${LAYER.moss}))).rgb * vec3(0.8, 1.05, 0.55);
    ca = mix(ca, mo, ledge * 0.75);
    ca = mix(ca, ca * vec3(0.35, 0.32, 0.3), ash);
    a = mix(a, ca, cliff);
    n = mix(n, cn, cliff);
  }
  // a forest seen from afar is its canopy: dark crowns in clumps, catching light on their tops
  float canopy = forest * (1.0 - cliff * 0.8) * smoothstep(90.0, 320.0, dist);
  if (canopy > 0.004) {
    float cl = texture(uNoise, wp.xz * 0.09).a * 0.6 + texture(uNoise, wp.xz * 0.023).b * 0.4;
    vec3 crown = mix(vec3(0.035, 0.07, 0.05), vec3(0.11, 0.17, 0.08), smoothstep(0.3, 0.75, cl)) * mix(0.8, 1.25, n1);
    a = mix(a, crown, canopy);
    n = mix(n, vec3((cl - 0.5) * 1.5, (n2 - 0.5) * 1.5, 1.0), canopy);
  }
  // snow last
  if (snow > 0.004) {
    vec3 sa = texture(uTerr, vec3(wp.xz * 0.15, float(${LAYER.snow}))).rgb * vec3(0.95, 0.97, 1.05);
    float sn = smoothstep(0.15, 0.55, snow + (n3 - 0.5) * 0.3) * smoothstep(0.75, 0.35, slope);
    a = mix(a, sa, sn);
    n = mix(n, vec3(0.0, 0.0, 1.0), sn * 0.6);
  }
  // the wet line at the shore
  float wet = smoothstep(1.4, 0.1, h);
  a *= mix(1.0, 0.55, wet);
  rough = mix(0.95, 0.35, wet);
  // tangent space (x along world x, y along world z) onto the geometric normal
  n.xy *= mix(1.0, 0.35, far);
  vec3 t = normalize(vec3(1.0, 0.0, 0.0) - gn * gn.x);
  vec3 b = normalize(cross(t, gn));
  nW = normalize(t * n.x + b * -n.y + gn * max(n.z, 0.2));
  alb = a;
}`;

export function terrainMaterial(tex: Textures, splat: THREE.Texture): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0 });
  return patch(m, 'terrain', (s) => {
    s.uniforms.uTerr = { value: tex.terrain };
    s.uniforms.uTerrN = { value: tex.terrainN };
    s.uniforms.uSplat = { value: splat };
    s.uniforms.uHalf = { value: HALF };
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWP;\nvarying vec3 vWN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWP = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvWN = normalize(mat3(modelMatrix) * objectNormal);');
    // after the atmosphere chunk, which declares the noise and sun uniforms the surface reads
    s.fragmentShader = s.fragmentShader
      .replace('#include <fog_pars_fragment>', '#include <fog_pars_fragment>\n' + TERRAIN_FRAG)
      .replace('#include <map_fragment>', 'vec3 tAlb, tN; float tRough;\nterrainSurface(vWP, normalize(vWN), tAlb, tN, tRough);\ndiffuseColor.rgb = tAlb;')
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = tRough;')
      .replace('#include <normal_fragment_maps>', 'normal = normalize((viewMatrix * vec4(globeDir(vWP, tN), 0.0)).xyz);')
      // skylight scattered off the hills around: slopes turned from the sun stay readable instead of crushing to black
      .replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\nreflectedLight.indirectDiffuse *= 2.2;');
  });
}

function terrainChunks(world: World, mat: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  const H = world.heights, N = 50, chunks = (RES - 1) / N;
  const nrm = (ix: number, iz: number): [number, number, number] => {
    const l = H[iz * RES + Math.max(0, ix - 1)], r = H[iz * RES + Math.min(RES - 1, ix + 1)];
    const d = H[Math.max(0, iz - 1) * RES + ix], u = H[Math.min(RES - 1, iz + 1) * RES + ix];
    const nx = l - r, nz = d - u, ny = 2 * CELL, len = Math.hypot(nx, ny, nz);
    return [nx / len, ny / len, nz / len];
  };
  for (let cz = 0; cz < chunks; cz++) for (let cx = 0; cx < chunks; cx++) {
    const pos: number[] = [], nor: number[] = [], idx: number[] = [];
    for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
      const ix = cx * N + i, iz = cz * N + j;
      pos.push(-HALF + ix * CELL, H[iz * RES + ix], -HALF + iz * CELL);
      nor.push(...nrm(ix, iz));
    }
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const a = j * (N + 1) + i, b = a + 1, c = a + N + 1, d = c + 1;
      const hs = [pos[a * 3 + 1], pos[b * 3 + 1], pos[c * 3 + 1], pos[d * 3 + 1]];
      if (Math.max(...hs) < -1.6) continue;
      const mx = pos[a * 3] + CELL / 2, mz = pos[a * 3 + 2] + CELL / 2;
      if (Math.hypot(mx, mz) > HALF + 4) continue;
      idx.push(a, c, b, b, c, d);
    }
    if (!idx.length) continue;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    geo.setIndex(idx);
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    g.add(mesh);
  }
  return g;
}

// ---------------------------------------------------------------- flora

/** The leaf atlas, painted in code: broadleaf, blossom, conifer sprig and pine tufts in a 2x2 grid. */
function paintFoliage(size = 1024): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const r = rng(31);
  const S = size / 2;
  const hsl = (h: number, s: number, l: number, a = 1) => `hsla(${h},${s}%,${l}%,${a})`;
  const leaf = (x: number, y: number, len: number, wid: number, ang: number, fill: string, rib?: string) => {
    g.save(); g.translate(x, y); g.rotate(ang);
    g.beginPath(); g.moveTo(0, 0);
    g.quadraticCurveTo(len * 0.45, -wid, len, 0); g.quadraticCurveTo(len * 0.45, wid, 0, 0);
    g.fillStyle = fill; g.fill();
    if (rib) { g.strokeStyle = rib; g.lineWidth = 1; g.beginPath(); g.moveTo(0, 0); g.lineTo(len * 0.9, 0); g.stroke(); }
    g.restore();
  };
  const twigs = (x0: number, y0: number, n: number, col: string) => {
    g.strokeStyle = col; g.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (r() - 0.5) * 2.4, l = S * (0.25 + r() * 0.2);
      g.lineWidth = 3 + r() * 3;
      g.beginPath(); g.moveTo(x0 + S / 2, y0 + S * 0.92);
      g.quadraticCurveTo(x0 + S / 2 + Math.cos(a) * l * 0.5 + (r() - 0.5) * 30, y0 + S * 0.92 + Math.sin(a) * l * 0.5, x0 + S / 2 + Math.cos(a) * l, y0 + S * 0.92 + Math.sin(a) * l * 1.4);
      g.stroke();
    }
  };
  const inBlob = (x0: number, y0: number, k: number) => {
    for (;;) {
      const a = r() * Math.PI * 2, d = Math.sqrt(r()) * S * k;
      const x = x0 + S / 2 + Math.cos(a) * d, y = y0 + S / 2 + Math.sin(a) * d * 0.9;
      return [x, y, d / (S * k)];
    }
  };
  // broadleaf (0,0)
  {
    const x0 = 0, y0 = 0;
    twigs(x0, y0, 5, '#3d2c1e');
    for (let i = 0; i < 230; i++) {
      const [x, y, d] = inBlob(x0, y0, 0.44);
      const l = 26 + r() * 20, front = r();
      leaf(x, y, l, l * 0.38, r() * Math.PI * 2, hsl(88 + r() * 30, 38 + r() * 20, 20 + front * 26 - d * 6), hsl(80, 30, 45, 0.5));
    }
  }
  // blossom (1,0)
  {
    const x0 = S, y0 = 0;
    twigs(x0, y0, 6, '#3a2420');
    for (let i = 0; i < 40; i++) { const [x, y] = inBlob(x0, y0, 0.42); leaf(x, y, 18 + r() * 10, 6, r() * 6.28, hsl(95, 40, 38)); }
    for (let i = 0; i < 330; i++) {
      const [x, y, d] = inBlob(x0, y0, 0.45);
      const pr = 7 + r() * 5, l = 74 + r() * 18 - d * 10, h = 338 + r() * 18, sat = 45 + r() * 35;
      for (let p = 0; p < 5; p++) {
        const a = (p / 5) * Math.PI * 2 + r();
        g.fillStyle = hsl(h, sat, l);
        g.beginPath(); g.ellipse(x + Math.cos(a) * pr * 0.6, y + Math.sin(a) * pr * 0.6, pr * 0.62, pr * 0.42, a, 0, Math.PI * 2); g.fill();
      }
      g.fillStyle = hsl(345, 60, 52); g.beginPath(); g.arc(x, y, pr * 0.22, 0, Math.PI * 2); g.fill();
    }
  }
  // conifer sprig (0,1): a frond along x, needles drooping
  {
    const x0 = 0, y0 = S;
    for (let b = 0; b < 4; b++) {
      const yb = y0 + S * (0.22 + b * 0.19) + (r() - 0.5) * 20;
      g.strokeStyle = '#2b2018'; g.lineWidth = 4;
      g.beginPath(); g.moveTo(x0 + 6, yb); g.quadraticCurveTo(x0 + S * 0.5, yb + 18, x0 + S * 0.96, yb + 40 + r() * 20); g.stroke();
      for (let i = 0; i < 260; i++) {
        const t = r(), x = x0 + 6 + t * S * 0.9, y = yb + t * t * 46 + (r() - 0.5) * 6;
        const side = r() < 0.5 ? -1 : 1, l = (16 + r() * 22) * (1 - t * 0.45), a = side * (0.5 + r() * 0.7) + 0.35;
        g.strokeStyle = hsl(148 + r() * 22, 28 + r() * 18, 12 + r() * 18 + (side > 0 ? 6 : 0));
        g.lineWidth = 2 + r() * 1.5;
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l * 0.5, y + Math.sin(a) * l); g.stroke();
      }
    }
  }
  // pine tufts (1,1)
  {
    const x0 = S, y0 = S;
    g.strokeStyle = '#33261c'; g.lineWidth = 6;
    g.beginPath(); g.moveTo(x0 + S * 0.05, y0 + S * 0.55); g.quadraticCurveTo(x0 + S * 0.5, y0 + S * 0.62, x0 + S * 0.95, y0 + S * 0.5); g.stroke();
    for (let k = 0; k < 34; k++) {
      const cx = x0 + S * (0.1 + r() * 0.8), cy = y0 + S * (0.3 + r() * 0.4);
      for (let i = 0; i < 46; i++) {
        const a = -Math.PI * (0.05 + r() * 0.9), l = 30 + r() * 46;
        g.strokeStyle = hsl(108 + r() * 25, 30 + r() * 20, 16 + r() * 20);
        g.lineWidth = 2;
        g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * l, cy + Math.sin(a) * l * 0.8); g.stroke();
      }
    }
  }
  return c;
}

const ATLAS = { broad: [0, 0], blossom: [1, 0], sprig: [0, 1], tuft: [1, 1] } as const;
type Cell = keyof typeof ATLAS;
const BARK = { sakura: 1, pine: 2, cedar: 3 } as const;

class Geo {
  pos: number[] = []; nor: number[] = []; uv: number[] = []; ao: number[] = []; layer: number[] = []; sway: number[] = []; idx: number[] = [];
  private v(p: THREE.Vector3, n: THREE.Vector3, u: number, v: number, ao: number, layer: number, sway: number): number {
    this.pos.push(p.x, p.y, p.z); this.nor.push(n.x, n.y, n.z); this.uv.push(u, v); this.ao.push(ao); this.layer.push(layer); this.sway.push(sway);
    return this.pos.length / 3 - 1;
  }
  /** A generalised cylinder along a path, its frame carried along by parallel transport. */
  tube(path: THREE.Vector3[], radii: number[], sides: number, bark: number, swayAt: (y: number) => number, uScale = 1): void {
    let normal = new THREE.Vector3(1, 0, 0);
    const base = this.pos.length / 3;
    let len = 0;
    for (let i = 0; i < path.length; i++) {
      const t = (i < path.length - 1 ? path[i + 1].clone().sub(path[i]) : path[i].clone().sub(path[i - 1])).normalize();
      normal.sub(t.clone().multiplyScalar(normal.dot(t))).normalize();
      if (normal.lengthSq() < 0.5) normal = new THREE.Vector3(0, 0, 1).cross(t).normalize();
      const bin = t.clone().cross(normal);
      if (i > 0) len += path[i].distanceTo(path[i - 1]);
      for (let s = 0; s <= sides; s++) {
        const a = (s / sides) * Math.PI * 2;
        const n = normal.clone().multiplyScalar(Math.cos(a)).addScaledVector(bin, Math.sin(a));
        this.v(path[i].clone().addScaledVector(n, radii[i]), n, (s / sides) * uScale, len * 0.35, 0.55 + 0.45 * Math.min(1, path[i].y / 4), bark, swayAt(path[i].y));
      }
    }
    for (let i = 0; i < path.length - 1; i++) for (let s = 0; s < sides; s++) {
      const a = base + i * (sides + 1) + s, b = a + 1, c = a + sides + 1, d = c + 1;
      this.idx.push(a, c, b, b, c, d);
    }
  }
  /** A foliage card: a quad in the atlas cell, its normals bent out from the crown so the canopy shades as a mass. */
  card(c: THREE.Vector3, right: THREE.Vector3, up: THREE.Vector3, w: number, h: number, cell: Cell, crown: THREE.Vector3, sway: number, ao: number, anchorLeft = false): void {
    const [cx, cy] = ATLAS[cell];
    const u0 = cx * 0.5 + 0.004, u1 = cx * 0.5 + 0.496, v0 = cy * 0.5 + 0.004, v1 = cy * 0.5 + 0.496;
    const corners = anchorLeft
      ? [[0, -0.5, u0, v1], [1, -0.5, u1, v1], [1, 0.5, u1, v0], [0, 0.5, u0, v0]]
      : [[-0.5, -0.5, u0, v1], [0.5, -0.5, u1, v1], [0.5, 0.5, u1, v0], [-0.5, 0.5, u0, v0]];
    const face = right.clone().cross(up).normalize();
    const ids = corners.map(([x, y, u, v]) => {
      const p = c.clone().addScaledVector(right, x * w).addScaledVector(up, y * h);
      const n = p.clone().sub(crown).normalize().multiplyScalar(0.8).addScaledVector(face, 0.2).normalize();
      const shade = ao * (0.65 + 0.35 * THREE.MathUtils.clamp(p.clone().sub(crown).normalize().y * 0.5 + 0.5, 0, 1));
      return this.v(p, n, u, v, shade, 0, sway);
    });
    this.idx.push(ids[0], ids[1], ids[2], ids[0], ids[2], ids[3]);
  }
  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('aAO', new THREE.Float32BufferAttribute(this.ao, 1));
    g.setAttribute('aLayer', new THREE.Float32BufferAttribute(this.layer, 1));
    g.setAttribute('aSway', new THREE.Float32BufferAttribute(this.sway, 1));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** A random card orientation round a point, facing loosely outward from the crown. */
function scatterCard(geo: Geo, r: () => number, p: THREE.Vector3, crown: THREE.Vector3, size: number, cell: Cell, sway: number, ao: number, flat = 0): void {
  const out = p.clone().sub(crown);
  if (out.lengthSq() < 1e-4) out.set(r() - 0.5, 0.3, r() - 0.5);
  out.normalize();
  const dir = V(r() - 0.5, r() - 0.5, r() - 0.5).normalize().multiplyScalar(0.8).add(out).normalize();
  if (flat) dir.lerp(V(0, 1, 0), flat).normalize();
  const tmp = Math.abs(dir.y) > 0.9 ? V(1, 0, 0) : V(0, 1, 0);
  const right = tmp.clone().cross(dir).normalize();
  const up = dir.clone().cross(right).normalize();
  const a = r() * Math.PI * 2;
  const r2 = right.clone().multiplyScalar(Math.cos(a)).addScaledVector(up, Math.sin(a));
  const u2 = dir.clone().cross(r2).normalize();
  geo.card(p, r2, u2, size, size, cell, crown, sway, ao);
}

function clump(geo: Geo, r: () => number, c: THREE.Vector3, rad: V3, n: number, size: number, cell: Cell, crown: THREE.Vector3, swayK: number, flat = 0): void {
  for (let i = 0; i < n; i++) {
    const d = V(r() * 2 - 1, r() * 2 - 1, r() * 2 - 1);
    if (d.lengthSq() > 1) { i--; continue; }
    const p = c.clone().add(V(d.x * rad[0], d.y * rad[1], d.z * rad[2]));
    const depth = 1 - d.length();
    scatterCard(geo, r, p, crown, size * (0.8 + r() * 0.45), cell, swayK * Math.max(0.2, p.y / 10), 1 - depth * 0.45, flat);
  }
}
type V3 = [number, number, number];

function branchPath(from: THREE.Vector3, dir: THREE.Vector3, len: number, bend: number, r: () => number, steps = 5): THREE.Vector3[] {
  const pts = [from.clone()];
  const d = dir.clone().normalize();
  const p = from.clone();
  for (let i = 1; i <= steps; i++) {
    d.add(V((r() - 0.5) * bend, (r() - 0.35) * bend * 0.6, (r() - 0.5) * bend)).normalize();
    p.addScaledVector(d, len / steps);
    pts.push(p.clone());
  }
  return pts;
}
const taper = (n: number, a: number, b: number) => Array.from({ length: n }, (_, i) => a + (b - a) * (i / (n - 1)));

/** Each species, at two levels of detail. Heights are in metres before the instance's own scale. */
function buildSpecies(kind: number, variant: number, lod: 0 | 1): THREE.BufferGeometry {
  const r = rng(kind * 977 + variant * 131 + 7);
  const g = new Geo();
  const cardK = lod ? 0.28 : 1; // far trees: fewer, larger cards
  const sz = lod ? 1.7 : 1;
  const sides = lod ? 3 : 6;
  const swayY = (h: number) => (y: number) => Math.pow(Math.max(0, y) / h, 1.5);
  switch (kind) {
    case TREE.conifer:
    case TREE.snowfir: {
      const H = 16 + r() * 8, R = 2.3 + r() * 0.8; // tall and slender, like the cedars in the valley
      const lean = V((r() - 0.5) * 0.06, 1, (r() - 0.5) * 0.06).normalize();
      const trunk = Array.from({ length: 6 }, (_, i) => lean.clone().multiplyScalar((H * i) / 5));
      g.tube(trunk, taper(6, 0.42, 0.04), sides, BARK.cedar, swayY(H), 1);
      const whorls = lod ? 6 : 15;
      for (let k = 0; k < whorls; k++) {
        const t = k / (whorls - 1), y = H * (0.16 + 0.82 * t), rad = R * Math.pow(1 - t, 0.85) + 0.5;
        const n = Math.max(3, Math.round((rad * 2.4 + 2) * (lod ? 0.6 : 1)));
        const axis = lean.clone().multiplyScalar(y);
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2 + k * 0.7 + r() * 0.4;
          const out = V(Math.cos(a), 0, Math.sin(a));
          const droop = -0.35 - r() * 0.3;
          const right = out.clone().add(V(0, droop, 0)).normalize();
          const up = V(-Math.sin(a), 0, Math.cos(a)).cross(right).normalize().negate();
          const w = rad * (1.1 + r() * 0.3) * (lod ? 1.15 : 1), h = rad * 0.85 * (lod ? 1.3 : 1) + 0.6;
          const c = axis.clone().addScaledVector(out, 0.15);
          g.card(c, right, up.lengthSq() > 0 ? up : V(0, 1, 0), w, h, 'sprig', axis.clone().add(V(0, -0.6, 0)), Math.pow(y / H, 1.4), 0.55 + 0.45 * t, true);
        }
      }
      clump(g, r, lean.clone().multiplyScalar(H * 0.99), [0.5, 1.0, 0.5], lod ? 1 : 4, 1.4, 'sprig', lean.clone().multiplyScalar(H * 0.9), 1);
      break;
    }
    case TREE.cherry: {
      const H = 4.8 + r() * 1.6;
      const trunk = branchPath(V(0, 0, 0), V((r() - 0.5) * 0.4, 1, (r() - 0.5) * 0.4), H * 0.55, 0.35, r, 4);
      g.tube(trunk, taper(5, 0.38, 0.24), sides, BARK.sakura, swayY(9), 1);
      const top = trunk[trunk.length - 1];
      const crown = top.clone().add(V(0, 2.2, 0));
      const nb = 4 + Math.floor(r() * 2);
      for (let b = 0; b < nb; b++) {
        const a = (b / nb) * Math.PI * 2 + r() * 0.8;
        const path = branchPath(top, V(Math.cos(a), 0.55 + r() * 0.5, Math.sin(a)), 3.4 + r() * 1.6, 0.4, r, 4);
        g.tube(path, taper(5, 0.2, 0.05), lod ? 3 : 5, BARK.sakura, swayY(9));
        const end = path[path.length - 1];
        clump(g, r, end.clone().add(V(0, 0.4, 0)), [2.3, 1.4, 2.3], Math.round(26 * cardK), 2.1 * sz, 'blossom', crown, 0.8);
        clump(g, r, path[2].clone().add(V(0, 0.8, 0)), [1.6, 1.0, 1.6], Math.round(12 * cardK), 1.9 * sz, 'blossom', crown, 0.6);
      }
      clump(g, r, crown.clone().add(V(0, 0.8, 0)), [2.4, 1.2, 2.4], Math.round(20 * cardK), 2.1 * sz, 'blossom', crown, 0.8);
      break;
    }
    case TREE.broadleaf:
    case TREE.maple: {
      const H = 5 + r() * 2;
      const trunk = branchPath(V(0, 0, 0), V((r() - 0.5) * 0.2, 1, (r() - 0.5) * 0.2), H * 0.7, 0.2, r, 4);
      g.tube(trunk, taper(5, 0.4, 0.2), sides, BARK.pine, swayY(11), 1);
      const top = trunk[trunk.length - 1];
      const crown = top.clone().add(V(0, 2.5, 0));
      const n = 7;
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2 + r(), d = k === 0 ? 0 : 2.4 + r() * 0.9;
        const c = crown.clone().add(V(Math.cos(a) * d, k === 0 ? 1.6 : (r() - 0.4) * 2.2, Math.sin(a) * d));
        if (k > 0 && !lod) g.tube([top.clone(), top.clone().lerp(c, 0.7)], [0.16, 0.06], 4, BARK.pine, swayY(11));
        clump(g, r, c, [2.4, 1.9, 2.4], Math.round(22 * cardK), 2.0 * sz, 'broad', crown, 0.7);
      }
      break;
    }
    case TREE.pine: {
      const H = 6 + r() * 3;
      const lean = V((r() - 0.5) * 1.2, 1, (r() - 0.5) * 1.2);
      const trunk = branchPath(V(0, 0, 0), lean, H, 0.7, r, 6);
      g.tube(trunk, taper(7, 0.36, 0.1), sides, BARK.pine, swayY(10), 1);
      const pads = 4 + Math.floor(r() * 3);
      for (let k = 0; k < pads; k++) {
        const from = trunk[2 + Math.floor(r() * 4)];
        const a = r() * Math.PI * 2;
        const path = branchPath(from, V(Math.cos(a), 0.15 + r() * 0.3, Math.sin(a)), 2 + r() * 2.5, 0.5, r, 3);
        if (!lod || k < 2) g.tube(path, taper(4, 0.14, 0.05), lod ? 3 : 4, BARK.pine, swayY(10));
        const end = path[path.length - 1];
        clump(g, r, end.clone().add(V(0, 0.35, 0)), [1.9, 0.45, 1.9], Math.round(16 * cardK) + 1, 1.7 * sz, 'tuft', end.clone().add(V(0, -1.2, 0)), 0.6, 0.65);
      }
      const top = trunk[trunk.length - 1];
      clump(g, r, top.clone().add(V(0, 0.3, 0)), [2.2, 0.55, 2.2], Math.round(18 * cardK) + 1, 1.8 * sz, 'tuft', top.clone().add(V(0, -1.2, 0)), 0.7, 0.6);
      break;
    }
    case TREE.snag: {
      const H = 7 + r() * 5;
      const trunk = branchPath(V(0, 0, 0), V((r() - 0.5) * 0.3, 1, (r() - 0.5) * 0.3), H, 0.25, r, 5);
      g.tube(trunk, taper(6, 0.34, 0.05), sides, BARK.pine, swayY(30), 1);
      for (let b = 0; b < (lod ? 2 : 5); b++) {
        const from = trunk[2 + Math.floor(r() * 3)], a = r() * Math.PI * 2;
        g.tube(branchPath(from, V(Math.cos(a), 0.5 + r(), Math.sin(a)), 1.5 + r() * 2.5, 0.6, r, 3), taper(4, 0.1, 0.02), 3, BARK.pine, swayY(30));
      }
      break;
    }
    case TREE.bush: {
      const blossom = variant % 2 === 1;
      const c = V(0, 0.7, 0);
      clump(g, r, c, [1.4, 0.8, 1.4], Math.round(16 * (lod ? 0.4 : 1)), 1.3 * (lod ? 1.4 : 1), blossom ? 'blossom' : 'broad', V(0, -0.3, 0), 0.25);
      break;
    }
  }
  return g.build();
}

const FLORA_VERT_HEAD = /* glsl */ `
attribute float aAO;
attribute float aLayer;
attribute float aSway;
attribute vec4 aTint;
uniform float uTime;
uniform vec2 uWind, uDrift;
uniform sampler2D uNoise;
varying vec2 vUvF;
varying float vLayer;
varying float vAO;
varying vec4 vTint;
`;
const FLORA_VERT_BODY = /* glsl */ `
vUvF = uv;
vLayer = aLayer;
vAO = aAO;
vTint = aTint;
// the wind turned into the tree's own frame (each is planted at its own turn), so they all lean the same way
#ifdef USE_INSTANCING
vec3 iPos = instanceMatrix[3].xyz;
vec2 wl = vec2(dot(uWind, normalize(instanceMatrix[0].xz)), dot(uWind, normalize(instanceMatrix[2].xz)));
#else
vec3 iPos = vec3(0.0);
vec2 wl = uWind;
#endif
float gust = texture(uNoise, iPos.xz * 0.004 - uDrift * 0.02).r;
float ph = dot(iPos.xz, vec2(0.13, 0.17));
float sw = aSway * (0.25 + gust * 0.9);
transformed.x += (sin(uTime * 1.3 + ph) * 0.18 + wl.x * 0.25 * gust) * sw;
transformed.z += (cos(uTime * 1.1 + ph * 1.3) * 0.14 + wl.y * 0.25 * gust) * sw;
if (aLayer < 0.5) transformed += normal * sin(uTime * 4.0 + position.x * 3.0 + position.y * 2.0 + ph) * 0.05 * aSway;
`;

function floraHook(s: Shader, arr: THREE.DataArrayTexture, depth: boolean): void {
  s.uniforms.uFlora = { value: arr };
  s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\n' + FLORA_VERT_HEAD).replace('#include <begin_vertex>', '#include <begin_vertex>\n' + FLORA_VERT_BODY);
  s.fragmentShader = s.fragmentShader
    .replace('#include <common>', '#include <common>\nuniform sampler2DArray uFlora;\nvarying vec2 vUvF;\nvarying float vLayer;\nvarying float vAO;\nvarying vec4 vTint;')
    .replace('#include <map_fragment>', /* glsl */ `
      vec4 fTex = texture(uFlora, vec3(vUvF, vLayer));
      // mipmaps average the leaves' alpha away; restore coverage so far crowns stay full
      vec2 tdx = dFdx(vUvF * 1024.0), tdy = dFdy(vUvF * 1024.0);
      fTex.a *= 1.0 + max(0.0, 0.5 * log2(max(dot(tdx, tdx), dot(tdy, tdy)))) * 0.3;
      diffuseColor *= fTex;
      ${depth ? '' : /* glsl */ `
      diffuseColor.rgb *= vTint.rgb * vAO;
      float snowUp = clamp(normalize((vec4(vNormal, 0.0) * viewMatrix).xyz).y, 0.0, 1.0);
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.92, 0.95, 1.0), vTint.a * smoothstep(0.1, 0.7, snowUp + fTex.g));`}
    `);
  if (!depth) {
    s.fragmentShader = s.fragmentShader
      .replace('#include <normal_fragment_begin>', 'float faceDirection = 1.0;\nvec3 normal = normalize(vNormal);\nvec3 nonPerturbedNormal = normal;')
      .replace('#include <opaque_fragment>', /* glsl */ `
        vec3 vdir = normalize(vFogWorld - cameraPosition);
        float back = pow(max(dot(vdir, uSunDir), 0.0), 3.0);
        outgoingLight += diffuseColor.rgb * uSunColor * (vLayer < 0.5 ? (back * 0.55 + 0.05) : 0.0);
        #include <opaque_fragment>`)
      .replace('#include <common>', '#include <common>\nuniform vec3 uSunColor;');
  }
}

export interface FloraSet { group: THREE.Group; update(focus: THREE.Vector3, force?: boolean): void }

export function floraArray(tex: Textures): THREE.DataArrayTexture {
  const atlas = paintFoliage();
  const imgs = [atlas, tex.maps.bark_sakura_d.image, tex.maps.bark_pine_d.image, tex.maps.bark_cedar_d.image] as CanvasImageSource[];
  const size = 1024, canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const data = new Uint8Array(size * size * 4 * imgs.length);
  imgs.forEach((img, i) => {
    ctx.clearRect(0, 0, size, size);
    ctx.drawImage(img, 0, 0, size, size);
    data.set(ctx.getImageData(0, 0, size, size).data, i * size * size * 4);
  });
  const arr = new THREE.DataArrayTexture(data, size, size, imgs.length);
  arr.format = THREE.RGBAFormat;
  arr.colorSpace = THREE.SRGBColorSpace;
  arr.wrapS = arr.wrapT = THREE.RepeatWrapping;
  arr.minFilter = THREE.LinearMipmapLinearFilter;
  arr.magFilter = THREE.LinearFilter;
  arr.generateMipmaps = true;
  arr.anisotropy = 4;
  arr.needsUpdate = true;
  return arr;
}

const TINTS: Record<number, (t: number) => [number, number, number, number]> = {
  [TREE.conifer]: (t) => [0.8 + t * 0.25, 0.9 + t * 0.2, 0.85 + t * 0.2, 0],
  [TREE.snowfir]: (t) => [0.85, 0.95, 1.0, 0.65 + t * 0.3],
  [TREE.cherry]: (t) => [1.0, 0.92 + t * 0.12, 0.95 + t * 0.1, 0],
  [TREE.broadleaf]: (t) => [0.95 + t * 0.25, 1.0 + t * 0.15, 0.7 + t * 0.2, 0],
  [TREE.maple]: (t) => [2.2 + t * 0.6, 0.55 + t * 0.3, 0.35, 0],
  [TREE.pine]: (t) => [0.85 + t * 0.15, 0.95 + t * 0.1, 0.85, 0],
  [TREE.snag]: () => [0.22, 0.2, 0.19, 0],
  [TREE.bush]: (t) => [0.9 + t * 0.3, 0.95 + t * 0.2, 0.75, 0],
};

export function buildFlora(world: World, arr: THREE.DataArrayTexture, msaa: boolean): FloraSet {
  const group = new THREE.Group();
  const mat = patch(new THREE.MeshStandardMaterial({ roughness: 0.82, metalness: 0, side: THREE.DoubleSide, alphaTest: 0.42, alphaToCoverage: msaa }), 'flora', (s) => floraHook(s, arr, false));
  const depthMat = patch(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, alphaTest: 0.42, side: THREE.DoubleSide }), 'flora-depth', (s) => floraHook(s, arr, true));
  const VARIANTS = 2, R0 = 120;
  type Slot = { meshes: [THREE.InstancedMesh, THREE.InstancedMesh]; trees: number[] };
  const slots = new Map<number, Slot>();
  const mats = new Float32Array(world.trees.length * 16), tints = new Float32Array(world.trees.length * 4);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), ps = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  world.trees.forEach((t: Tree, i) => {
    q.setFromAxisAngle(up, t.rot);
    const s = t.kind === TREE.conifer || t.kind === TREE.snowfir ? t.s : t.s * 1.05;
    m4.compose(ps.set(t.x, t.y - 0.25, t.z), q, sc.set(s, s * (0.9 + t.tint * 0.2), s));
    m4.toArray(mats, i * 16);
    tints.set(TINTS[t.kind](t.tint), i * 4);
    const key = t.kind * 10 + (Math.floor(t.tint * 997) % VARIANTS);
    let slot = slots.get(key);
    if (!slot) {
      const kind = t.kind, variant = key % 10;
      const geos = [buildSpecies(kind, variant, 0), buildSpecies(kind, variant, 1)];
      const meshes = geos.map((geo, lod) => {
        const cap = world.trees.filter((u) => u.kind * 10 + (Math.floor(u.tint * 997) % VARIANTS) === key).length;
        const im = new THREE.InstancedMesh(geo, mat, cap);
        geo.setAttribute('aTint', new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4));
        im.customDepthMaterial = depthMat;
        im.castShadow = lod === 0;
        im.receiveShadow = lod === 0;
        im.frustumCulled = false;
        im.count = 0;
        group.add(im);
        return im;
      }) as unknown as [THREE.InstancedMesh, THREE.InstancedMesh];
      slot = { meshes, trees: [] };
      slots.set(key, slot);
    }
    slot.trees.push(i);
  });
  const last = new THREE.Vector3(1e9, 0, 0);
  return {
    group,
    update(focus, force = false) {
      if (!force && last.distanceToSquared(focus) < 100) return;
      last.copy(focus);
      for (const slot of slots.values()) {
        const counts = [0, 0];
        for (const i of slot.trees) {
          const t = world.trees[i];
          const lod = (t.x - focus.x) ** 2 + (t.z - focus.z) ** 2 < R0 * R0 ? 0 : 1;
          const im = slot.meshes[lod], k = counts[lod]++;
          (im.instanceMatrix.array as Float32Array).set(mats.subarray(i * 16, i * 16 + 16), k * 16);
          ((im.geometry.getAttribute('aTint') as THREE.InstancedBufferAttribute).array as Float32Array).set(tints.subarray(i * 4, i * 4 + 4), k * 4);
        }
        slot.meshes.forEach((im, lod) => {
          im.count = counts[lod];
          im.instanceMatrix.needsUpdate = true;
          im.geometry.getAttribute('aTint').needsUpdate = true;
        });
      }
    },
  };
}

// ---------------------------------------------------------------- rocks

function rockGeometry(seed: number): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(1, 3);
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  const o = seed * 13.1;
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = noise(v.x * 1.3 + o, v.y * 1.3) * 0.5 + noise(v.y * 1.1 - o, v.z * 1.4) * 0.5 + noise(v.z * 2.7 + o, v.x * 2.9) * 0.25;
    let s = 1 + n * 0.28;
    // strata and flattened faces
    s *= 1 - 0.08 * Math.abs(Math.sin(v.y * 6 + o));
    v.multiplyScalar(s);
    v.y = v.y > 0 ? v.y * (0.62 + (seed % 3) * 0.12) : v.y * 0.5;
    v.x *= 1.15 + (seed % 2) * 0.25;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

function rockMaterial(tex: Textures): THREE.MeshStandardMaterial {
  return patch(new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0 }), 'rock', (s) => {
    s.uniforms.uTerr = { value: tex.terrain };
    s.uniforms.uTerrN = { value: tex.terrainN };
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vOP;\nvarying vec3 vON;\nvarying vec3 vWorldUp;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvOP = position * 0.9;\nvON = normal;\n#ifdef USE_INSTANCING\nvWorldUp = normalize(mat3(modelMatrix * instanceMatrix) * normal);\n#else\nvWorldUp = normalize(mat3(modelMatrix) * normal);\n#endif');
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2DArray uTerr, uTerrN;\nvarying vec3 vOP;\nvarying vec3 vON;\nvarying vec3 vWorldUp;')
      .replace('#include <map_fragment>', /* glsl */ `
        vec3 an = abs(normalize(vON)); an /= an.x + an.y + an.z;
        vec3 rk = texture(uTerr, vec3(vOP.zy * 0.5, ${LAYER.lichen}.0)).rgb * an.x + texture(uTerr, vec3(vOP.xz * 0.5, ${LAYER.cliff}.0)).rgb * an.y + texture(uTerr, vec3(vOP.xy * 0.5, ${LAYER.lichen}.0)).rgb * an.z;
        vec3 mo = texture(uTerr, vec3(vOP.xz * 0.6, ${LAYER.moss}.0)).rgb * vec3(0.75, 1.0, 0.5);
        float mossy = smoothstep(0.25, 0.75, normalize(vWorldUp).y);
        diffuseColor.rgb = mix(rk * vec3(0.8, 0.82, 0.84), mo, mossy * 0.85);
        diffuseColor.rgb *= mix(0.7, 1.0, smoothstep(-0.6, 0.4, vOP.y));`);
  });
}

export function buildRocks(world: World, mat: THREE.Material): THREE.Group {
  const group = new THREE.Group();
  const geos = [0, 1, 2, 3].map(rockGeometry);
  const buckets: Tree[][] = [[], [], [], []];
  for (const r of world.rocks) buckets[r.kind % 4].push(r);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  buckets.forEach((list, k) => {
    const im = new THREE.InstancedMesh(geos[k], mat, list.length);
    list.forEach((r, i) => {
      q.setFromEuler(e.set((r.tint - 0.5) * 0.4, r.rot, (r.tint - 0.5) * 0.3));
      const s = r.s;
      m4.compose(new THREE.Vector3(r.x, r.y - s * 0.25, r.z), q, new THREE.Vector3(s, s, s));
      im.setMatrixAt(i, m4);
    });
    im.castShadow = true;
    im.receiveShadow = true;
    im.computeBoundingSphere();
    group.add(im);
  });
  return group;
}

// ---------------------------------------------------------------- grass

const GRASS_VERT = /* glsl */ `${GLOBE}
attribute vec4 aBlade; // local x, local z, random, height
attribute vec2 aTile;
uniform sampler2D uHeight, uSplat;
uniform float uHalf, uTile, uTime, uDensity;
uniform vec2 uWind, uDrift;
uniform vec3 uFocus;
uniform sampler2D uNoise;
varying float vT;
varying float vRand;
varying vec3 vN;
varying float vFade;
#include <fog_pars_vertex>
void main() {
  vec2 wxz = aTile + aBlade.xy;
  vec2 tuv = (wxz + uHalf) / (2.0 * uHalf);
  float h = texture(uHeight, tuv).r;
  vec4 sp = texture(uSplat, tuv);
  float hx = texture(uHeight, tuv + vec2(1.0 / 800.0, 0.0)).r - h;
  float hz = texture(uHeight, tuv + vec2(0.0, 1.0 / 800.0)).r - h;
  float slope = length(vec2(hx, hz)) / 2.5;
  float n = texture(uNoise, wxz * 0.021).r;
  float dens = smoothstep(0.7, 1.6, h) * smoothstep(40.0, 18.0, h) * smoothstep(0.75, 0.35, slope);
  dens *= (1.0 - sp.g) * (1.0 - sp.b) * (1.0 - smoothstep(0.3, 0.9, sp.r) * 0.85);
  dens *= smoothstep(0.25, 0.55, n + 0.15) * uDensity;
  float d = length(wxz - uFocus.xz);
  vFade = smoothstep(uTile * 5.6, uTile * 4.2, d);
  float keep = step(aBlade.z, dens * vFade);
  float t = position.y;
  vT = t;
  vRand = aBlade.z;
  float hh = aBlade.w * (0.7 + n * 0.9) * keep;
  float w = 0.07 * (1.0 - t) * keep;
  float gust = texture(uNoise, wxz * 0.012 - uDrift * 0.05).r;
  vec2 bend = (uWind * (0.5 + gust * 1.4) + vec2(sin(uTime * 2.1 + wxz.x * 0.6), cos(uTime * 1.7 + wxz.y * 0.5)) * 0.15) * t * t * hh * 0.55;
  float ang = aBlade.z * 31.0;
  vec2 side = vec2(cos(ang), sin(ang));
  vec3 p = vec3(wxz.x + side.x * position.x * w + bend.x, h + t * hh - 0.05, wxz.y + side.y * position.x * w + bend.y);
  vN = normalize(vec3(-side.y, 0.6, side.x) + vec3(bend.x, 0.0, bend.y) * 0.5);
  vec3 globeFlat = p;
  vec4 mvPosition = viewMatrix * vec4(globePos(p), 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const GRASS_FRAG = /* glsl */ `
uniform vec3 uSunColor, uHemiSky, uHemiGround, uBase, uTip;
varying float vT;
varying float vRand;
varying vec3 vN;
varying float vFade;
#include <fog_pars_fragment>
void main() {
  vec3 col = mix(uBase, uTip * (0.85 + vRand * 0.3), smoothstep(0.0, 1.0, vT));
  vec3 n = normalize(vN);
  float diff = max(dot(n, uSunDir), 0.0) * 0.6 + 0.4;
  vec3 vdir = normalize(vFogWorld - cameraPosition);
  float back = pow(max(dot(vdir, uSunDir), 0.0), 4.0) * vT;
  vec3 light = uSunColor * diff * 0.75 + mix(uHemiGround, uHemiSky, 0.5 + 0.5 * vT) * 0.9;
  vec3 c = col * light * (0.45 + 0.55 * vT) + col * uSunColor * back * 0.6;
  gl_FragColor = vec4(c, 1.0);
  #include <fog_fragment>
}`;

export class Grass {
  readonly mesh: THREE.InstancedMesh;
  private readonly u: Record<string, THREE.IUniform>;
  private readonly tile = 12;
  private readonly side = 13;
  constructor(heightTex: THREE.Texture, splat: THREE.Texture, sky: { hemi: THREE.HemisphereLight }, density: number) {
    const blades = Math.round(1400 * Math.max(0.3, density));
    const quad = new THREE.BufferGeometry();
    // a blade: five vertices up a tapering strip
    quad.setAttribute('position', new THREE.Float32BufferAttribute([-1, 0, 0, 1, 0, 0, -0.8, 0.45, 0, 0.8, 0.45, 0, 0, 1, 0], 3));
    quad.setIndex([0, 1, 2, 2, 1, 3, 2, 3, 4]);
    const g = new THREE.InstancedBufferGeometry();
    // one instance is a tile; blades are baked into the base geometry
    const pos: number[] = [], idx: number[] = [], blade: number[] = [];
    const r = rng(5);
    for (let b = 0; b < blades; b++) {
      const lx = r() * this.tile, lz = r() * this.tile, rnd = r(), hgt = 0.45 + r() * 0.75;
      const base = pos.length / 3;
      const qp = quad.getAttribute('position').array;
      for (let v = 0; v < 5; v++) { pos.push(qp[v * 3], qp[v * 3 + 1], 0); blade.push(lx, lz, rnd, hgt); }
      for (const i of quad.index!.array) idx.push(base + i);
    }
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aBlade', new THREE.Float32BufferAttribute(blade, 4));
    g.setIndex(idx);
    const n = this.side * this.side;
    g.setAttribute('aTile', new THREE.InstancedBufferAttribute(new Float32Array(n * 2), 2));
    this.u = {
      ...U, uHeight: { value: heightTex }, uSplat: { value: splat }, uHalf: { value: HALF }, uTile: { value: this.tile },
      uFocus: { value: new THREE.Vector3() }, uDensity: { value: 1 }, uHemiSky: { value: sky.hemi.color }, uHemiGround: { value: sky.hemi.groundColor },
      uBase: { value: new THREE.Color(0x27361a) }, uTip: { value: new THREE.Color(0xb9c76a) },
    };
    const mat = new THREE.ShaderMaterial({ vertexShader: GRASS_VERT, fragmentShader: GRASS_FRAG, uniforms: this.u, side: THREE.DoubleSide, fog: true });
    this.mesh = new THREE.InstancedMesh(g, mat, n);
    this.mesh.frustumCulled = false;
    this.mesh.layers.set(1);
  }
  update(focus: THREE.Vector3, night: number): void {
    const t = this.tile, ox = Math.floor(focus.x / t) - (this.side >> 1), oz = Math.floor(focus.z / t) - (this.side >> 1);
    const a = this.mesh.geometry.getAttribute('aTile') as THREE.InstancedBufferAttribute;
    for (let j = 0; j < this.side; j++) for (let i = 0; i < this.side; i++) a.setXY(j * this.side + i, (ox + i) * t, (oz + j) * t);
    a.needsUpdate = true;
    this.u.uFocus.value.copy(focus);
    this.u.uTip.value.setHex(night ? 0x4a6a5a : 0xbfcf6c);
  }
}

// ---------------------------------------------------------------- set pieces: falls, arch, lava

const FALLS_VERT = /* glsl */ `${GLOBE}
varying vec2 vUv;
#include <fog_pars_vertex>
void main() { vUv = uv; vec3 globeFlat = (modelMatrix * vec4(position, 1.0)).xyz; vec4 mvPosition = viewMatrix * vec4(globePos(globeFlat), 1.0); gl_Position = projectionMatrix * mvPosition;
#include <fog_vertex>
}`;
const FALLS_FRAG = /* glsl */ `
uniform vec3 uSunColor;
varying vec2 vUv;
#include <fog_pars_fragment>
void main() {
  float s1 = texture(uNoise, vec2(vUv.x * 2.0, vUv.y * 0.6 + uTime * 0.55)).r;
  float s2 = texture(uNoise, vec2(vUv.x * 5.0 + 0.3, vUv.y * 1.4 + uTime * 0.9)).g;
  float streak = smoothstep(0.35, 0.75, s1 * 0.6 + s2 * 0.5);
  float edge = smoothstep(0.0, 0.12, vUv.x) * smoothstep(1.0, 0.88, vUv.x);
  vec3 c = mix(vec3(0.55, 0.68, 0.72), vec3(0.95, 0.98, 1.0), streak);
  c *= 0.55 + 0.5 * uSunColor;
  float a = edge * (0.55 + 0.45 * streak) * smoothstep(1.0, 0.92, vUv.y);
  gl_FragColor = vec4(c, a);
  #include <fog_fragment>
}`;

const LAVA_FRAG = /* glsl */ `
varying vec2 vUv;
#include <fog_pars_fragment>
void main() {
  vec2 p = vUv - 0.5;
  float n = texture(uNoise, vUv * 1.4 + vec2(uTime * 0.01, -uTime * 0.013)).r * 0.6 + texture(uNoise, vUv * 4.0 - uTime * 0.02).g * 0.4;
  float crust = smoothstep(0.45, 0.62, n);
  vec3 hot = mix(vec3(6.0, 1.6, 0.25), vec3(9.0, 4.0, 1.0), smoothstep(0.2, 0.0, n));
  vec3 c = mix(hot, vec3(0.08, 0.04, 0.03), crust);
  float a = smoothstep(0.5, 0.42, length(p));
  gl_FragColor = vec4(c, a);
  #include <fog_fragment>
}`;

export function buildSetPieces(world: World, rockMat: THREE.Material): { group: THREE.Group; lavaAt: THREE.Vector3; fallsAt: THREE.Vector3 } {
  const group = new THREE.Group();
  const f = world.falls;
  // the falls: a sheet that leaves the rim, arcs out and drops into its pool
  {
    const W = 16, segs = 28, pos: number[] = [], uv: number[] = [], idx: number[] = [];
    const out = new THREE.Vector2(f.dirx, f.dirz).normalize(), side = new THREE.Vector2(-out.y, out.x);
    for (let i = 0; i <= segs; i++) {
      const t = i / segs, y = f.top + 1 - t * (f.top + 2.5);
      const reach = 2 + Math.sqrt(t) * 9;
      for (let j = 0; j <= 6; j++) {
        const s = (j / 6 - 0.5) * W * (1 + t * 0.35);
        pos.push(f.x + out.x * (reach - 6) + side.x * s, y, f.z + out.y * (reach - 6) + side.y * s);
        uv.push(j / 6, t * 3);
      }
    }
    for (let i = 0; i < segs; i++) for (let j = 0; j < 6; j++) { const a = i * 7 + j, b = a + 1, c = a + 7, d = c + 1; idx.push(a, c, b, b, c, d); }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    const m = new THREE.ShaderMaterial({ vertexShader: FALLS_VERT, fragmentShader: FALLS_FRAG, uniforms: { ...U }, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: true });
    const mesh = new THREE.Mesh(geo, m);
    mesh.renderOrder = 3;
    group.add(mesh);
  }
  // the arch: a rough stone tube over the cove's mouth
  {
    const a = new THREE.Vector3(ARCH.ax, 0, ARCH.az), b = new THREE.Vector3(ARCH.bx, 0, ARCH.bz);
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 24; i++) {
      const t = i / 24;
      const p = new THREE.Vector3().lerpVectors(a, b, t);
      p.y = 6 + (ARCH.height - 6) * Math.sin(t * Math.PI) ** 0.75;
      pts.push(p);
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    const geo = new THREE.TubeGeometry(curve, 60, 1, 14, false);
    const p = geo.getAttribute('position') as THREE.BufferAttribute;
    const v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      const seg = Math.floor(i / 15) / 60;
      const c = curve.getPoint(seg);
      const d = v.clone().sub(c);
      const thick = 6.5 + 4.5 * Math.pow(Math.abs(seg - 0.5) * 2, 2.5);
      const n = 1 + 0.25 * noise(v.x * 0.15, v.y * 0.15 + v.z * 0.1) + 0.1 * noise(v.x * 0.5, v.z * 0.5);
      d.multiplyScalar(thick * n);
      d.y *= 0.8;
      p.setXYZ(i, c.x + d.x, c.y + d.y, c.z + d.z);
    }
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, rockMat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  // the lava pool in Cinder Peak's crater
  const cp = PLACES.find((p) => p.biome === 'volcanic')!;
  let lowest = Infinity;
  for (let dz = -20; dz <= 20; dz += 2) for (let dx = -20; dx <= 20; dx += 2) lowest = Math.min(lowest, sampleHeight(world.heights, cp.x + dx, cp.z + dz));
  const lavaAt = new THREE.Vector3(cp.x, lowest + 1.2, cp.z);
  {
    const geo = new THREE.CircleGeometry(30, 40).rotateX(-Math.PI / 2);
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(Array.from(geo.getAttribute('position').array).flatMap((_, i, a) => (i % 3 === 0 ? [a[i] / 60 + 0.5, a[i + 2] / 60 + 0.5] : [])), 2));
    const m = new THREE.ShaderMaterial({ vertexShader: FALLS_VERT, fragmentShader: LAVA_FRAG, uniforms: { ...U }, transparent: true, depthWrite: false, fog: true });
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.copy(lavaAt);
    group.add(mesh);
  }
  return { group, lavaAt, fallsAt: new THREE.Vector3(f.x + f.dirx * 6, 0, f.z + f.dirz * 6) };
}

export class Land {
  readonly group = new THREE.Group();
  readonly heightTex: THREE.DataTexture;
  readonly splatTex: THREE.DataTexture;
  readonly flora: FloraSet;
  readonly grass: Grass;
  readonly lavaAt: THREE.Vector3;
  readonly fallsAt: THREE.Vector3;
  constructor(world: World, tex: Textures, sky: { hemi: THREE.HemisphereLight }, quality: { msaa: number; grass: number }) {
    this.heightTex = heightTexture(world);
    this.splatTex = splatTexture(world);
    this.group.add(terrainChunks(world, terrainMaterial(tex, this.splatTex)));
    this.flora = buildFlora(world, floraArray(tex), quality.msaa > 0);
    this.group.add(this.flora.group);
    const rock = rockMaterial(tex);
    this.group.add(buildRocks(world, rock));
    this.grass = new Grass(this.heightTex, this.splatTex, sky, quality.grass);
    this.group.add(this.grass.mesh);
    const sp = buildSetPieces(world, rock);
    this.group.add(sp.group);
    this.lavaAt = sp.lavaAt;
    this.fallsAt = sp.fallsAt;
  }
  update(focus: THREE.Vector3, night: number): void {
    this.flora.update(focus);
    this.grass.update(focus, night);
  }
}

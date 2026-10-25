// The Fjords, WP16 part A. Sheer walls streaked with falls: every cascade of the geography and a streak down each
// tall wall leaves its lip in a free-fall curve, pushed clear of the rock (or hugging a steep face), widening as it
// drops into the sea: lead-white strands running down a pale verdigris body, ink between them, ragged edges, a foot
// broken into spray. The Great Falls, the landmark, is a broad curtain between two ribbons, fed by a river across the
// plateau, under a plume of spray that reads from orbit. Mist lies in the narrow channels (paper left unpainted,
// thickest in the morning) and curls off every foot; boulders lie fallen at the cliff feet. The terrain draws the
// walls' strata, fissures and scree washes; flora plants the dark pines.
import * as THREE from 'three';
import { illustratedMaterial, inkMaterial, linearVec, transmittanceVec, type Style } from '../../style/glsl.ts';
import { PIGMENTS } from '../../style/palette.ts';
import { R } from '../../sim/sphere.ts';
import { chartTangent, coastAt, heightAt, regionOf } from '../../sim/world/geography.ts';
import { REGIONS } from '../../sim/world/regions.ts';
import { terrains, type Surface, type TerrainField } from '../terrain.ts';
import type { RenderContext, RenderModule } from '../world.ts';
import { chartDir, Draw, Kit, lift, pose, regionSeen, ring, seeded, vec, washOf, type V } from './kit.ts';

const RI = REGIONS.findIndex((r) => r.id === 'fjords');
const MARK = REGIONS[RI].landmark;
/** A fall: rows down it and columns across; how far out its lip and foot are sought (u); how far it keeps off the
 *  rock (u); how far it is thrown out per √u of drop; how much it widens to its foot. */
const FALL = { rows: 18, cols: 5, reach: 12, clear: 0.35, throw: 0.32, spread: 0.35 } as const;
/** Streaks down the tall walls: how many are sought, their spacing and the least wall height (u). */
const STREAKS = { count: 44, spacing: 5, wall: 7 } as const;
/** The Great Falls: its curtain's width, its flanking ribbons' offset and width, the river feeding it (rows, 1 u apart). */
const GREAT = { width: 4.2, flank: 3.3, flankWidth: 1.2, river: 7 } as const;
/** Fallen boulders: at most, how far inland the wall is looked for and how tall it stands (u). */
const SCREE = { most: 600, inland: 2.5, wall: 5 } as const;

export interface ArcPoint { readonly d: number; readonly y: number }
export interface FallSite { readonly site: V; readonly f: V; readonly width: number; readonly river: number; readonly spray: number }

const S: Surface = { height: 0, normal: vec(), up: 1, ground: 0, region: 0 };
/** The unit direction d u out along f and l u along s from site. */
export const toward = (site: V, f: V, s: V, d: number, l: number, o = vec()): V =>
  o.copy(site).multiplyScalar(R).addScaledVector(f, d).addScaledVector(s, l).normalize();
export const sideOf = (site: V, f: V): V => vec().crossVectors(site, f).normalize();
const widthAt = (w: number, i: number) => w * (1 + FALL.spread * (i / FALL.rows));

/** A fall's profile out along f from its site: from its lip (where the ground first drops away) down a free-fall
 *  curve, pushed out wherever any of its width would touch the rock, to 0.8 u below mean sea over open water. */
export function arcOf(field: TerrainField, site: V, f: V, width: number): ArcPoint[] | null {
  const s = sideOf(site, f), q = vec(), g = (d: number, l = 0) => field.surface(toward(site, f, s, d, l, q), 0, S).height;
  const hs = Array.from({ length: 61 }, (_, i) => g(-1 + 0.2 * i));
  const lip = hs.findIndex((h, i) => i + 4 < hs.length && h > 2 && h - hs[i + 4] > 1.2);
  if (lip < 0) return null;
  const dLip = -1 + 0.2 * lip, top = hs[lip], arc: ArcPoint[] = [];
  let d = dLip;
  for (let i = 0; i <= FALL.rows; i++) {
    const y = top + 0.05 - (top + 0.85) * (i / FALL.rows), half = widthAt(width, i) / 2;
    const blocked = () => [-half, 0, half].some((l) => (y > 0.3 ? g(d, l) > y - FALL.clear : g(d, l) > 0.05));
    d = Math.max(d, dLip + 0.05 + FALL.throw * Math.sqrt(Math.max(top - y, 0)));
    while (d < dLip + FALL.reach && blocked()) d += 0.12;
    if (d >= dLip + FALL.reach) return null;
    arc.push({ d, y });
  }
  return arc;
}

/** A fall's rows of points, top to bottom: `river` rows draped over the ground upstream, its lip, then its arc. */
export function fallRows(field: TerrainField, site: V, f: V, width: number, arc: readonly ArcPoint[], river: number): V[][] {
  const s = sideOf(site, f), lip = arc[0].d, rows: V[][] = [];
  const row = (d: number, y: number | null, w: number) => Array.from({ length: FALL.cols }, (_, c) => {
    const u = c / (FALL.cols - 1), bow = y === null ? 0 : 0.1 * w * (1 - (2 * u - 1) ** 2), p = toward(site, f, s, d + bow, (u - 0.5) * w);
    return lift(p, y ?? field.surface(p, 0, S).height + 0.2);
  });
  for (let i = river; i >= 0; i--) rows.push(row(lip - 0.5 - i, null, width * (1 - (0.45 * i) / Math.max(river, 1))));
  arc.forEach((a, i) => rows.push(row(a.d, a.y, widthAt(width, i))));
  return rows;
}

/** Streaks down the tall walls: sites just inland of the shore atop its cliffs, facing down the coast's slope to the
 *  water, spaced from each other and from `taken`. */
function streaksOf(field: TerrainField, taken: readonly V[], rng: () => number): FallSite[] {
  const geo = field.geo, found: { p: V; x: number; y: number; k: number }[] = [], near = [...taken], out: FallSite[] = [];
  for (let x = -80; x <= 80; x += 1) {
    for (let y = -80; y <= 80; y += 1) {
      const p = chartDir(RI, x, y), c = coastAt(geo, p);
      if (c > -0.6 || c < -1.6 || regionOf(p) !== RI || field.surface(p, 0, S).height < STREAKS.wall) continue;
      found.push({ p, x, y, k: rng() });
    }
  }
  for (const { p, x, y } of found.sort((a, b) => a.k - b.k)) {
    if (out.length >= STREAKS.count) break;
    if (near.some((q) => q.angleTo(p) * R < STREAKS.spacing)) continue;
    near.push(p);
    const g = (dx: number, dy: number) => coastAt(geo, chartDir(RI, x + dx, y + dy)), f = vec();
    chartTangent(RI, p, (Math.atan2(g(0.5, 0) - g(-0.5, 0), g(0, 0.5) - g(0, -0.5)) * 180) / Math.PI, f);
    out.push({ site: p, f, width: 0.25 + 0.4 * rng(), river: 0, spray: 0 });
  }
  return out;
}

/** Vertices with named float attributes and triangles, merged into one geometry. */
export class Batch {
  readonly data: Record<string, number[]> = {};
  readonly index: number[] = [];
  private readonly sizes: Record<string, number>;

  constructor(sizes: Record<string, number>) {
    this.sizes = sizes;
    for (const k of Object.keys(sizes)) this.data[k] = [];
  }

  get vertices(): number {
    return this.data.position.length / 3;
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    for (const [k, n] of Object.entries(this.sizes)) g.setAttribute(k, new THREE.Float32BufferAttribute(this.data[k], n));
    g.setIndex(this.index);
    return g;
  }
}

export function addStrip(b: Batch, rows: V[][], width: number, seed: number): void {
  const base = b.vertices, cols = rows[0].length, mid = cols >> 1, len = [0];
  for (let i = 1; i < rows.length; i++) len.push(len[i - 1] + rows[i][mid].distanceTo(rows[i - 1][mid]));
  const total = len[len.length - 1];
  rows.forEach((r, i) => r.forEach((p, c) => {
    b.data.position.push(p.x, p.y, p.z);
    b.data.aFall.push(c / (cols - 1), len[i], total, width);
    b.data.aSeed.push(seed);
  }));
  for (let i = 0; i + 1 < rows.length; i++) {
    for (let c = 0; c + 1 < cols; c++) {
      const a = base + i * cols + c;
      b.index.push(a, a + cols, a + 1, a + 1, a + cols, a + cols + 1);
    }
  }
}

export function addPuff(b: Batch, p: V, w: number, h: number, seed: number, spray: number): void {
  const base = b.vertices;
  for (const [x, y] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    b.data.position.push(p.x, p.y, p.z);
    b.data.aCorner.push(x, y);
    b.data.aPuff.push(w, h, seed, spray);
  }
  b.index.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

const NOISE_GLSL = /* glsl */ `
float fjHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float fjNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
  return mix(mix(fjHash(i), fjHash(i + vec2(1.0, 0.0)), u.x), mix(fjHash(i + vec2(0.0, 1.0)), fjHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fjFbm(vec2 p) { return 0.5 * fjNoise(p) + 0.3 * fjNoise(p * 2.07 + 5.3) + 0.2 * fjNoise(p * 4.11 + 1.7); }
`;

export const FALL_VERT = /* glsl */ `
in vec4 aFall;
in float aSeed;
out vec3 vWorld;
out vec3 vNormal;
out vec4 vFall;
out float vSeed;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  vNormal = normalize(mat3(modelMatrix) * normal);
  vFall = aFall;
  vSeed = aSeed;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

// Falling water: strands of lead white running down a pale verdigris body, fine ink between them, ragged edges and a
// foot broken into spray; shaded like a form, silvered by night.
export const FALL_FRAG = NOISE_GLSL + /* glsl */ `
in vec3 vWorld;
in vec3 vNormal;
in vec4 vFall; // across 0…1, arc length down it, its whole length, its width (u)
in float vSeed;
uniform vec3 uBody;
uniform vec3 uFoam;
void main() {
  vec3 n = normalize(vNormal) * (gl_FrontFacing ? 1.0 : -1.0);
  vec3 v = normalize(cameraPosition - vWorld);
  Paper q = paperAt(vWorld, n, 0.3);
  float across = vFall.x * vFall.w * 6.0 + vSeed * 13.0, down = vFall.y - uTime * 2.4;
  float strand = fjFbm(vec2(across, down * 0.3));
  float streak = fjNoise(vec2(across * 2.2, down * 1.1));
  float line = 1.0 - smoothstep(0.0, 1.5 * fwidth(streak), abs(streak - 0.66));
  float foot = smoothstep(0.82, 1.0, vFall.y / vFall.z);
  float rag = 0.8 + 0.2 * fjNoise(vec2(down * 1.6, vSeed * 7.0 + vFall.x * 4.0)) - 0.7 * foot * fjNoise(vec2(across * 1.3, down * 2.0));
  if (abs(vFall.x - 0.5) * 2.0 > rag) discard;
  float load = smoothstep(0.35, 0.65, strand);
  vec3 col = glaze(parchment(q), uBody, 0.45 * (1.0 - load) + 0.1, 0.0, q);
  col = mix(col, uFoam, 0.7 * load + 0.25 * foot);
  col = mix(col, hatchInk(0.45), 0.5 * line * (1.0 - foot));
  col = shadeGlaze(col, 0.6 * lightTone(dot(n, uSun), abs(dot(n, v))), q);
  if (uNight > 0.0) col = mix(col, uSilver, 0.3 * uNight * load);
  writeInk(candle(col, vWorld), n);
}
`;

export const VEIL_VERT = /* glsl */ `
uniform float uTime;
in vec2 aCorner;
in vec4 aPuff; // half-width, half-height (u), seed, spray (1) or mist (0)
out vec2 vCorner;
out vec3 vWorld;
out vec2 vPuff;
void main() {
  vec3 c = (modelMatrix * vec4(position, 1.0)).xyz;
  vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  float swell = 1.0 + 0.2 * aPuff.w * sin(uTime * 0.7 + aPuff.z * 6.3);
  vWorld = c + (right * aCorner.x * aPuff.x + up * aCorner.y * aPuff.y) * swell;
  vCorner = aCorner;
  vPuff = aPuff.zw;
  gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0);
}
`;

// Mist and spray: paper left unpainted (spray whiter, rising), its billows edged here and there with an inked curl.
export const VEIL_FRAG = NOISE_GLSL + /* glsl */ `
in vec2 vCorner;
in vec3 vWorld;
in vec2 vPuff;
uniform float uMist;
uniform vec3 uFoam;
void main() {
  float spray = vPuff.y;
  vec2 q = vCorner * vec2(1.4, 1.0) + vec2(vPuff.x * 17.0 + uTime * 0.04, vPuff.x * 9.0 - uTime * mix(0.03, 0.22, spray));
  float shape = (1.0 - length(vCorner * vec2(1.0, 1.2)) + (fjFbm(q * 1.6) - 0.5) * 0.9) * smoothstep(-1.0, -0.4, vCorner.y);
  float body = smoothstep(0.0, 0.5, shape);
  float curl = (1.0 - smoothstep(0.0, 1.4 * fwidth(shape), abs(shape - 0.08))) * smoothstep(0.5, 0.62, fjNoise(q * 2.7 + 3.1));
  vec3 col = mix(mix(uPaper, uFoam, 0.25 + 0.5 * spray), uSilver, 0.3 * uNight);
  col = mix(col, uInk, 0.5 * curl);
  writeVeil(candle(col, vWorld), clamp((0.55 * body + 0.35 * curl) * mix(uMist, 0.85, spray), 0.0, 1.0));
}
`;

const STONE = washOf(PIGMENTS.sepia, 0.55), LIT = washOf(PIGMENTS.umber, 0.42), WET = washOf(PIGMENTS.sepia, 0.85);

/** A boulder 1 across, bedded 0.5 below its rest. */
function boulderKit(): THREE.BufferGeometry {
  const rng = seeded(61), k = 7, rad = Array.from({ length: k }, () => 0.75 + 0.35 * rng());
  const at = (s: number, y: number) => ring(k, y, (j) => rad[j] * s * (0.9 + 0.2 * rng()));
  return new Kit((c, n) => (c.y < 0.05 ? WET : n.y > 0.6 ? LIT : STONE)).loft([at(0.7, -0.5), at(1, 0), at(0.85, 0.45), at(0.5, 0.72)]).build();
}

/** Boulders fallen at the cliff feet along the shore, each bedded below the lowest ground round it. */
function screeOf(field: TerrainField): THREE.Matrix4[] {
  const geo = field.geo, rng = seeded(71), sites: V[] = [], fwd = vec(), sd = vec(), q = vec(), out: THREE.Matrix4[] = [];
  for (let x = -80; x <= 80; x += 0.8) {
    for (let y = -80; y <= 80; y += 0.8) {
      const px = x + (rng() - 0.5) * 0.7, py = y + (rng() - 0.5) * 0.7, p = chartDir(RI, px, py), c = coastAt(geo, p);
      if (c < -1.2 || c > 0.2 || regionOf(p) !== RI) continue;
      const wall = Math.max(...[[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => heightAt(geo, chartDir(RI, px + dx * SCREE.inland, py + dy * SCREE.inland))));
      if (wall > SCREE.wall) sites.push(p);
    }
  }
  const stride = Math.max(1, sites.length / SCREE.most);
  for (let i = 0; i < sites.length; i += stride) {
    const p = sites[Math.floor(i)], sc = 0.25 + 0.85 * rng() ** 2;
    chartTangent(RI, p, 0, fwd);
    sd.crossVectors(p, fwd);
    let low = field.surface(p, 0, S).height;
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * 2 * Math.PI;
      q.copy(p).multiplyScalar(R).addScaledVector(fwd, sc * Math.cos(a)).addScaledVector(sd, sc * Math.sin(a)).normalize();
      low = Math.min(low, field.surface(q, 0, S).height);
    }
    out.push(pose(new THREE.Matrix4(), lift(p, low - 0.1 * sc), p, fwd, rng() * 6.3, (rng() - 0.5) * 0.5, sc * (0.9 + 0.4 * rng()), sc * (0.6 + 0.3 * rng()), sc * (0.9 + 0.3 * rng())));
  }
  return out;
}

export class Fjords {
  readonly group = new THREE.Group();
  private readonly style: Style;
  private readonly mist = { value: 0.5 };
  private readonly materials: THREE.Material[];
  private readonly count: number;

  constructor(style: Style, field: TerrainField) {
    const geo = field.geo, rng = seeded(83), mark = chartDir(RI, MARK.x, MARK.y), sites: FallSite[] = [];
    this.style = style;
    const cascades = geo.cascades.filter((c) => c.region === RI).map((c) => ({ site: vec(c.pos.x, c.pos.y, c.pos.z), f: vec(c.facing.x, c.facing.y, c.facing.z) }));
    const great = cascades.reduce((a, b) => (b.site.angleTo(mark) < a.site.angleTo(mark) ? b : a));
    for (const c of cascades) {
      if (c !== great) {
        sites.push({ ...c, width: 1.2 + 0.6 * rng(), river: 0, spray: 1 });
        continue;
      }
      sites.push({ ...c, width: GREAT.width, river: GREAT.river, spray: 2 });
      const s = sideOf(c.site, c.f);
      for (const k of [-1, 1]) sites.push({ site: toward(c.site, c.f, s, -0.4, k * GREAT.flank), f: c.f, width: GREAT.flankWidth, river: 0, spray: 1 });
    }
    sites.push(...streaksOf(field, sites.map((x) => x.site), rng));
    const falls = new Batch({ position: 3, aFall: 4, aSeed: 1 }), puffs = new Batch({ position: 3, aCorner: 2, aPuff: 4 });
    for (const x of sites) {
      const arc = arcOf(field, x.site, x.f, x.width);
      if (!arc) continue;
      addStrip(falls, fallRows(field, x.site, x.f, x.width, arc, x.river), x.width, rng());
      const foot = arc.find((a) => a.y < 0.2) ?? arc[arc.length - 1], s = sideOf(x.site, x.f), base = toward(x.site, x.f, s, foot.d + 0.4, 0);
      if (x.spray === 2) {
        for (let k = 0; k < 6; k++) {
          addPuff(puffs, lift(toward(x.site, x.f, s, foot.d + 0.5 + 2 * rng(), (rng() - 0.5) * x.width * 1.6), 1.2 + rng()), 2.2 + 1.8 * rng(), 1.6 + rng(), rng(), 1);
        }
        for (let k = 1; k <= 3; k++) addPuff(puffs, lift(base, 3.5 * k), 3 + 2 * k, 2.5 + k, rng(), 1);
      } else {
        const w = 0.5 + 1.3 * x.width;
        addPuff(puffs, lift(base, 0.5 + 0.4 * w), w, 0.5 + 0.5 * w, rng(), 1);
      }
    }
    const banks: V[] = [];
    for (let x = -76; x <= 76; x += 2) {
      for (let y = -76; y <= 76; y += 2) {
        const p = chartDir(RI, x, y), c = coastAt(geo, p);
        if (c < 1.5 || c > 5 || heightAt(geo, p) > -1 || regionOf(p) !== RI || banks.some((b) => b.angleTo(p) * R < 7)) continue;
        if ([[6, 0], [-6, 0], [0, 6], [0, -6]].filter(([dx, dy]) => coastAt(geo, chartDir(RI, x + dx, y + dy)) < 0.5).length < 2) continue;
        banks.push(p);
        for (let k = 0; k < 2; k++) {
          addPuff(puffs, lift(chartDir(RI, x + (rng() - 0.5) * 4, y + (rng() - 0.5) * 4), 1 + 0.6 * rng()), Math.min(1.3 * c, 5) * (0.8 + 0.4 * rng()), 0.8 + 0.5 * rng(), rng(), 0);
        }
      }
    }
    const foam = { value: linearVec(PIGMENTS.leadWhite) };
    const water = inkMaterial(style, { vertexShader: FALL_VERT, fragmentShader: FALL_FRAG, side: THREE.DoubleSide,
      uniforms: { uFoam: foam, uBody: { value: transmittanceVec(PIGMENTS.verdigris) } } });
    const veil = inkMaterial(style, { vertexShader: VEIL_VERT, fragmentShader: VEIL_FRAG, veil: true, side: THREE.DoubleSide, uniforms: { uFoam: foam, uMist: this.mist } });
    const stone = illustratedMaterial(style, { pigment: PIGMENTS.sepia, painted: true, anchor: 'object', side: THREE.DoubleSide });
    const scree = new Draw(boulderKit(), stone, SCREE.most + 1).fill(screeOf(field)), strips = falls.build();
    strips.computeVertexNormals();
    const meshes = [new THREE.Mesh(strips, water), new THREE.Mesh(puffs.build(), veil), scree.mesh];
    for (const m of meshes) m.frustumCulled = false;
    this.group.add(...meshes);
    this.materials = [water, veil, stone];
    this.count = falls.index.length / 3 + puffs.index.length / 3 + scree.triangles;
  }

  /** Shown when the region can be in view; the mist thickest in the morning and by night. */
  update(eye: V): void {
    this.group.visible = regionSeen(RI, eye, 90);
    const { hour, night } = this.style.palette, sm = THREE.MathUtils.smoothstep;
    this.mist.value = 0.2 + 0.4 * sm(hour, 4.5, 6.5) * (1 - sm(hour, 9, 11.5)) + 0.2 * night;
  }

  get triangles(): number {
    return this.group.visible ? this.count : 0;
  }

  dispose(): void {
    for (const m of this.materials) m.dispose();
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry.dispose();
    });
  }
}

/** The composition root's Fjords (MODULES). */
export function createFjords(ctx: RenderContext): RenderModule {
  const terrain = terrains.get(ctx.scene);
  if (!terrain) throw new Error('createFjords: the terrain is built first (MODULES order)');
  const fjords = new Fjords(ctx.pipeline.style, terrain.field);
  ctx.scene.add(fjords.group);
  return {
    frame() {
      fjords.update(ctx.camera.position);
    },
    dispose() {
      ctx.scene.remove(fjords.group);
      fjords.dispose();
    },
  };
}

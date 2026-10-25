// WP24: the chart. The globe and the chart are the same world drawn two ways (A8): twelve pentagonal sheets, one per
// region — the dodecahedron dual to the region icosahedron, so every region sits at the centre of its own sheet and
// every cut runs through open sea halfway between regions. As z passes orbit the chart globe soaks through the
// shaded world, each sheet flattens (sphere → gnomonic plane, so the sheets close into a dodecahedron) and the
// sheets unfold about their hinges along a spanning tree — two flowers of 1 + 5 joined at one edge, the player's
// region at the centre of the first — coming to rest flat on parchment like printed globe gores. Drawn on them:
// coastlines in ink with the shore's rings of fine lines, land in an ochre wash, territory washes (WP20's cube),
// a wind rose at each region with its 32 rhumbs (black winds, green half-winds, red quarter-winds), region names in
// the generated cancelleresca, and the ships the player can see as small inked silhouettes with short heading
// arrows. Five draw calls.
import * as THREE from 'three';
import type { World } from '../app/worldWorker.ts';
import { layoutText, rasterizeText } from '../lettering/text.ts';
import { cellOf, fromLatLon, R, TERRITORY } from '../sim/sphere.ts';
import { PHASE, SHIPS, type MatchState } from '../sim/state.ts';
import type { Sight } from '../sim/visibility.ts';
import { REGIONS } from '../sim/world/regions.ts';
import { newStormView, stormView, type Calm } from '../sim/storm.ts';
import { inkMaterial, linearVec, type Style } from '../style/glsl.ts';
import { PIGMENTS } from '../style/palette.ts';
import { cubeTexture } from './swell.ts';
import { FORM_NAMES } from './ships/forms.ts';
import { silhouetteRect, silhouetteTexture } from './ships/silhouettes.ts';
import type { RigView } from './camera.ts';
import { chartContent } from './chartmarks.ts';
import { EMBLEMS, emblemRect, emblemTexture, PLAYER_EMBLEM } from './ships/emblems.ts';

const SHEETS = 12, PLAYER = 0, LAYER_CHART = 1;
const V = () => new THREE.Vector3();
const AXIS_N = new THREE.Vector3(0, 1, 0);
const clamp = (x: number, a: number, b: number) => (x < a ? a : x > b ? b : x);
const ease = (x: number) => { const t = clamp(x, 0, 1); return t * t * (3 - 2 * t); };

/** The dodecahedral net: its sheets, hinges, spanning tree and per-sheet transforms (12 uniforms). */
export class Net {
  readonly centres: THREE.Vector3[] = [];
  /** Dodecahedron vertices on the unit sphere (the icosahedron's face centres) and scaled onto the face planes. */
  readonly corners: THREE.Vector3[] = [];
  readonly vertices: THREE.Vector3[] = [];
  /** Each sheet's five corners, counter-clockwise seen from outside. */
  readonly faces: number[][] = [];
  readonly adj: number[][] = [];
  readonly mats: THREE.Matrix4[] = Array.from({ length: SHEETS }, () => new THREE.Matrix4());
  readonly final: THREE.Matrix4[] = Array.from({ length: SHEETS }, () => new THREE.Matrix4());
  root = -1;
  readonly parent: number[] = new Array(SHEETS).fill(-1);
  order: number[] = [];
  readonly normal = V();
  private readonly hinge: { a: THREE.Vector3; axis: THREE.Vector3; angle: number }[] = [];
  private fitKey = '';
  private readonly fitOut = { centre: V(), up: V(), right: V(), dist: 1000, width: 0, height: 0 };

  constructor(centres?: readonly THREE.Vector3[]) {
    for (let k = 0; k < SHEETS; k++) this.centres.push(centres ? centres[k].clone().normalize() : (() => { const v = V(); fromLatLon((REGIONS[k].lat * Math.PI) / 180, (REGIONS[k].lon * Math.PI) / 180, v); return v.normalize(); })());
    const c = this.centres;
    for (let i = 0; i < SHEETS; i++) { this.adj.push([]); this.faces.push([]); }
    for (let i = 0; i < SHEETS; i++) for (let j = 0; j < SHEETS; j++) if (i !== j && c[i].dot(c[j]) > 0.2) this.adj[i].push(j);
    for (let i = 0; i < SHEETS; i++) for (const j of this.adj[i]) for (const k of this.adj[j]) {
      if (!(i < j && j < k) || !this.adj[i].includes(k)) continue;
      const p = V().add(c[i]).add(c[j]).add(c[k]).normalize(), n = this.corners.length;
      this.corners.push(p);
      this.vertices.push(p.clone().multiplyScalar(R / p.dot(c[i])));
      this.faces[i].push(n); this.faces[j].push(n); this.faces[k].push(n);
    }
    for (let i = 0; i < SHEETS; i++) {
      const [e, nn] = this.basis(i, AXIS_N);
      this.faces[i].sort((a, b) => Math.atan2(this.corners[a].dot(nn), this.corners[a].dot(e)) - Math.atan2(this.corners[b].dot(nn), this.corners[b].dot(e)));
    }
    this.layout(0);
  }

  /** An in-plane basis (east, north) for sheet k with north as near `hint` as the plane allows. */
  basis(k: number, hint: THREE.Vector3): [THREE.Vector3, THREE.Vector3] {
    const c = this.centres[k], n = hint.clone().addScaledVector(c, -hint.dot(c));
    if (n.lengthSq() < 1e-6) n.copy(this.centres[(k + 1) % SHEETS]).addScaledVector(c, -this.centres[(k + 1) % SHEETS].dot(c));
    n.normalize();
    return [V().crossVectors(n, c).normalize(), n];
  }

  sheetOf(dir: { x: number; y: number; z: number }): number {
    let best = -2, k = 0;
    for (let i = 0; i < SHEETS; i++) {
      const c = this.centres[i], d = c.x * dir.x + c.y * dir.y + c.z * dir.z;
      if (d > best) { best = d; k = i; }
    }
    return k;
  }

  /** The two corners sheets i and j share (their hinge), or null. */
  edge(i: number, j: number): [number, number] | null {
    const s = this.faces[i].filter((a) => this.faces[j].includes(a));
    return s.length === 2 ? [s[0], s[1]] : null;
  }

  /** Lays the net out with `root` at the centre of the first flower. */
  layout(root: number): void {
    if (root === this.root) return;
    this.root = root;
    const c = this.centres, ring1 = [...this.adj[root]].sort((a, b) => a - b);
    let anti = 0;
    for (let i = 0; i < SHEETS; i++) if (c[i].dot(c[root]) < c[anti].dot(c[root])) anti = i;
    const ring2 = [...this.adj[anti]].sort((a, b) => a - b);
    const x = ring1[0], y = ring2.find((k) => this.adj[x].includes(k))!;
    this.parent.fill(-1);
    for (const k of ring1) this.parent[k] = root;
    this.parent[y] = x;
    this.parent[anti] = y;
    for (const k of ring2) if (k !== y) this.parent[k] = anti;
    this.order = [root, ...ring1, y, anti, ...ring2.filter((k) => k !== y)];
    this.hinge.length = 0;
    for (let k = 0; k < SHEETS; k++) {
      const p = this.parent[k];
      if (p < 0) { this.hinge.push({ a: V(), axis: V(), angle: 0 }); continue; }
      const [a] = this.edge(k, p)!;
      this.hinge.push({ a: this.vertices[a].clone(), axis: V().crossVectors(c[k], c[p]).normalize(), angle: Math.acos(clamp(c[k].dot(c[p]), -1, 1)) });
    }
    this.normal.copy(c[root]);
    this.pose(1, this.final);
    this.pose(0, this.mats);
    this.fitKey = '';
  }

  /** Per-sheet transforms at unfold u (0 the closed dodecahedron, 1 flat in the root's plane). */
  pose(u: number, out: THREE.Matrix4[] = this.mats): void {
    const m = new THREE.Matrix4(), t = new THREE.Matrix4();
    for (const k of this.order) {
      if (this.parent[k] < 0) { out[k].identity(); continue; }
      const h = this.hinge[k];
      m.makeTranslation(h.a.x, h.a.y, h.a.z).multiply(t.makeRotationAxis(h.axis, h.angle * u)).multiply(t.makeTranslation(-h.a.x, -h.a.y, -h.a.z));
      out[k].multiplyMatrices(out[this.parent[k]], m);
    }
  }

  /** Where a sphere direction lies on the net at flatten `flat` with the current pose. */
  toNet(dir: { x: number; y: number; z: number }, flat: number, out: THREE.Vector3): THREE.Vector3 {
    const k = this.sheetOf(dir), c = this.centres[k];
    out.set(dir.x, dir.y, dir.z).normalize();
    const d = Math.max(0.2, out.dot(c));
    return out.multiplyScalar(R * (1 - flat) + (R / d) * flat).applyMatrix4(this.mats[k]);
  }

  /** The sphere direction under a point of the flat chart (unfold 1), or null off the net. */
  fromNet(p: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 | null {
    const inv = new THREE.Matrix4(), q = V();
    for (let k = 0; k < SHEETS; k++) {
      q.copy(p).applyMatrix4(inv.copy(this.final[k]).invert());
      if (Math.abs(q.dot(this.centres[k]) - R) > 1) continue;
      q.normalize();
      if (this.sheetOf(q) === k) return out.copy(q);
    }
    return null;
  }

  /** The framing of the flat chart for a camera and view: centre, up (north-ish, the net's long axis across), distance. */
  fit(camera: THREE.PerspectiveCamera, view: RigView): { centre: THREE.Vector3; up: THREE.Vector3; right: THREE.Vector3; dist: number } {
    const key = `${this.root}:${camera.fov}:${view.width}x${view.height}:${view.safe.left},${view.safe.right},${view.safe.top},${view.safe.bottom}`;
    const o = this.fitOut;
    if (key === this.fitKey) return o;
    this.fitKey = key;
    const n = this.normal, [e, nn] = this.basis(this.root, AXIS_N), pts: THREE.Vector3[] = [];
    for (let k = 0; k < SHEETS; k++) for (const a of this.faces[k]) pts.push(this.vertices[a].clone().applyMatrix4(this.final[k]));
    // the long axis by the in-plane covariance
    let mx = 0, my = 0;
    for (const p of pts) { mx += p.dot(e); my += p.dot(nn); }
    mx /= pts.length; my /= pts.length;
    let sxx = 0, sxy = 0, syy = 0;
    for (const p of pts) { const x = p.dot(e) - mx, y = p.dot(nn) - my; sxx += x * x; sxy += x * y; syy += y * y; }
    const a = 0.5 * Math.atan2(2 * sxy, sxx - syy), long = e.clone().multiplyScalar(Math.cos(a)).addScaledVector(nn, Math.sin(a));
    o.up.crossVectors(n, long).normalize();
    if (o.up.dot(nn) < 0) o.up.negate();
    o.right.crossVectors(o.up, n).normalize();
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const p of pts) { const x = p.dot(o.right), y = p.dot(o.up); x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    o.width = x1 - x0; o.height = y1 - y0;
    o.centre.copy(n).multiplyScalar(R).addScaledVector(o.right, (x0 + x1) / 2 - n.clone().multiplyScalar(R).dot(o.right)).addScaledVector(o.up, (y0 + y1) / 2 - n.clone().multiplyScalar(R).dot(o.up));
    const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2), W = Math.max(1, view.width), H = Math.max(1, view.height);
    const sw = (W - view.safe.left - view.safe.right) / W, sh = (H - view.safe.top - view.safe.bottom) / H;
    o.dist = 1.05 * Math.max(o.height / 2 / (tanV * sh), o.width / 2 / (tanV * (W / H) * sw));
    return o;
  }

  /** The sphere direction under a screen point of the open chart (course drawing, the edge tap), or null off the net. */
  unproject(x: number, y: number, camera: THREE.PerspectiveCamera, view: RigView, out: THREE.Vector3): THREE.Vector3 | null {
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2((x / view.width) * 2 - 1, 1 - (y / view.height) * 2), camera);
    const plane = new THREE.Plane(this.normal.clone(), -R), hit = V();
    if (!ray.ray.intersectPlane(plane, hit)) return null;
    return this.fromNet(hit, out);
  }
}

// --- geometry: every layer carries a sphere direction and a sheet, so one vertex function morphs them all --------

export interface Builder { dir: number[]; sheet: number[]; perp: number[]; side: number[]; colour: number[]; uv: number[] }
export const builder = (): Builder => ({ dir: [], sheet: [], perp: [], side: [], colour: [], uv: [] });
export function vert(b: Builder, p: THREE.Vector3, k: number, perp: THREE.Vector3 | null, side: number, col: readonly number[], u: number, v: number): void {
  const d = p.clone().normalize();
  b.dir.push(d.x, d.y, d.z); b.sheet.push(k);
  b.perp.push(perp ? perp.x : 0, perp ? perp.y : 0, perp ? perp.z : 0); b.side.push(side);
  b.colour.push(col[0], col[1], col[2], col[3]); b.uv.push(u, v);
}
function geometry(b: Builder): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry(), n = b.sheet.length, pos = new Float32Array(n * 3);
  for (let i = 0; i < n * 3; i++) pos[i] = b.dir[i] * R;
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('dir', new THREE.Float32BufferAttribute(b.dir, 3));
  g.setAttribute('sheet', new THREE.Float32BufferAttribute(b.sheet, 1));
  g.setAttribute('perp', new THREE.Float32BufferAttribute(b.perp, 3));
  g.setAttribute('sideW', new THREE.Float32BufferAttribute(b.side, 1));
  g.setAttribute('colour', new THREE.Float32BufferAttribute(b.colour, 4));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
  return g;
}

const VERT = /* glsl */ `
in vec3 dir;
in float sheet;
in vec3 perp;
in float sideW;
in vec4 colour;
uniform mat4 uSheet[12];
uniform vec3 uCentre[12];
uniform float uFlat, uLayer, uPxU;
out vec3 vDir;
out vec3 vNormal;
out vec4 vColour;
out vec2 vUv;
void main() {
  int k = int(sheet + 0.5);
  vec3 c = uCentre[k];
  float d = max(dot(dir, c), 0.2);
  vec3 up = normalize(mix(dir, c, uFlat));
  vec3 p = mix(dir * ${R}.0, dir * (${R}.0 / d), uFlat) + perp * sideW * uPxU + up * uLayer;
  vNormal = normalize(mat3(uSheet[k]) * up);
  vDir = dir;
  vColour = colour;
  vUv = uv;
  gl_Position = projectionMatrix * viewMatrix * (uSheet[k] * vec4(p, 1.0));
}`;

const NOISE = /* glsl */ `
in vec3 vDir;
in vec3 vNormal;
in vec4 vColour;
in vec2 vUv;
float h3(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float vn(vec3 x) {
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h3(i), h3(i + vec3(1, 0, 0)), f.x), mix(h3(i + vec3(0, 1, 0)), h3(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(h3(i + vec3(0, 0, 1)), h3(i + vec3(1, 0, 1)), f.x), mix(h3(i + vec3(0, 1, 1)), h3(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
float inkLine(float x, float px) { float w = max(fwidth(x), 1e-5); return 1.0 - smoothstep(px - 0.6, px + 0.6, abs(x) / w); }
`;

const SHEET_FRAG = NOISE + /* glsl */ `
uniform samplerCube tGeo;
uniform samplerCube tTerr;
uniform float uHasTerr, uReveal;
uniform vec3 uCInk, uCSepia, uCLand, uCHill, uCParch, uCSea, uCDeep;
uniform float uMatch;
void main() {
  vec3 n = normalize(vDir);
  vec4 g = texture(tGeo, n);
  float coast = (g.r * 255.0 - 128.0) * 0.5, height = g.g * 64.0;
  // the swap (A8), no dissolve: the chart's ink settles first on the coasts the shaded world already shows (the same
  // geography cube, so the lines land where the world's shores are), then its paper spreads out over the sea as one
  // wet front by distance from shore, land and shallows first, the deep sea last
  float soak = clamp(abs(coast) / 60.0, 0.0, 1.0) * 0.86 + vn(n * 71.0) * 0.14, edge = uReveal * 1.25 - 0.05 - soak;
  if (edge < 0.0) discard;
  float front = (1.0 - smoothstep(0.0, 0.08, edge)) * step(uReveal, 0.999);
  float grain = vn(n * 1300.0) * 0.5 + vn(n * 420.0) * 0.5;
  vec3 col = uCParch * (0.95 + 0.07 * grain);
  col *= 1.0 - 0.06 * smoothstep(0.55, 0.9, vn(n * 7.0)) - 0.04 * smoothstep(0.6, 0.95, vn(n * 31.0 + 4.0));
  float land = 1.0 - smoothstep(-0.35, 0.35, coast);
  col = mix(col, col * uCLand, land);
  col = mix(col, col * uCHill, land * smoothstep(3.0, 30.0, height));
  // land hatched along one diagonal, denser on the heights
  float hatch = inkLine(fract(dot(n, vec3(0.7, 0.5, -0.5)) * 520.0 + 0.5) - 0.5, 0.35) * land * smoothstep(1.0, 18.0, height);
  // the shore's rings of fine lines spreading out from the coast
  float q = coast / 1.6, ring = coast > 0.8 && coast < 12.0 ? inkLine((fract(q + 0.5) - 0.5) * 1.6, 0.42) * (1.0 - coast / 12.0) : 0.0;
  float line = max(inkLine(coast, 1.05), max(ring * 0.55, hatch * 0.35));
  vec4 t = texture(tTerr, n);
  col *= mix(vec3(1.0), t.rgb, uHasTerr * 0.85);
  // the gore's border: a pooled edge and a fine sepia rule
  float e = vColour.x;
  col *= 1.0 - 0.1 * (1.0 - smoothstep(0.0, 7.0, e));
  col = mix(col, uCSepia, inkLine(e - 1.2, 0.5) * 0.7);
  // A8's matched swap (WP24 part D): where the front has just passed, the paper still carries the shaded world's own
  // colour fields at orbit (the sea's wash, shallow to deep by distance from shore, the land's tint) and settles to the
  // chart's as the front moves on, so the change reads as ink settling into the same picture, not a crossfade
  vec3 world = uCParch * mix(uCSea, uCDeep, smoothstep(2.0, 50.0, coast)) * (0.96 + 0.06 * grain);
  world = mix(world, uCParch * uCLand * 0.92, land);
  col = mix(col, world, uMatch * (1.0 - smoothstep(0.0, 0.45, edge)));
  col = mix(col, uCInk, line);
  col = mix(col, col * 0.78, front);
  writeInk(col, vNormal);
}`;

const LINE_FRAG = NOISE + /* glsl */ `
uniform float uAlpha;
void main() {
  float a = vColour.a * uAlpha * (1.0 - smoothstep(0.55, 1.0, abs(vUv.y)));
  if (a < 0.004) discard;
  writeVeil(vColour.rgb, a);
}`;

const TEX_FRAG = NOISE + /* glsl */ `
uniform sampler2D tMap;
uniform float uAlpha, uMode;
void main() {
  vec4 t = texture(tMap, vUv);
  // labels: r coverage, g coverage bled into the paper; marks: the atlas alpha; solid ink where colour.a > 1.5
  float cov = vColour.a > 1.5 ? 1.0 : uMode < 0.5 ? max(t.r, t.g * 0.35) : t.a;
  float a = cov * uAlpha;
  if (a < 0.004) discard;
  writeVeil(vColour.rgb, a);
}`;

const BACK_FRAG = NOISE + /* glsl */ `
uniform vec3 uCParch;
void main() {
  vec3 p = vDir;
  float grain = vn(p * 0.9) * 0.5 + vn(p * 0.31) * 0.5;
  vec3 col = uCParch * (0.93 + 0.07 * grain) * (1.0 - 0.06 * smoothstep(0.55, 0.9, vn(p * 0.006)));
  writeInk(col, vec3(0.0, 0.0, 1.0));
}`;

/** The geography as a cube texture in the TERRITORY layout: r coast distance (128 + 2u), g height (u·4), b region. */
export function geographyCube(world: World): THREE.CubeTexture {
  const N = TERRITORY.n, NN = N * N, geo = world.geo, faces: Uint8Array[] = [];
  for (let f = 0; f < 6; f++) {
    const out = new Uint8Array(NN * 4);
    for (let row = 0; row < N; row++) for (let col = 0; col < N; col++) {
      const c = f * NN + row * N + col, o = ((N - 1 - row) * N + col) * 4;
      out[o] = clamp(Math.round(128 + geo.coast[c] * 2), 0, 255);
      out[o + 1] = clamp(Math.round(Math.max(0, geo.heights[c]) * 4), 0, 255);
      out[o + 2] = geo.region[c] * 20;
      out[o + 3] = 255;
    }
    faces.push(out);
  }
  return cubeTexture(faces, THREE.UnsignedByteType);
}

/** The ships the player's chart shows: those in its sight or marked, never the sunk; its own always. */
export function chartShips(state: MatchState, sight: Sight | null): number {
  let mask = 1 << PLAYER;
  if (sight) mask |= sight.ships | sight.marks;
  for (let i = 0; i < SHIPS && i < state.ships.length; i++) if (state.ships[i].phase === PHASE.sunk && i !== PLAYER) mask &= ~(1 << i);
  return mask;
}

export interface ChartFrame { z: number; flat: number; unfold: number; reveal: number }

/** The chart's meshes and their per-frame state (layer 1: the camera shows it only once the zoom is under way). */
export class Chart {
  readonly net: Net;
  readonly group = new THREE.Group();
  readonly uniforms = {
    uSheet: { value: [] as THREE.Matrix4[] },
    uCentre: { value: [] as THREE.Vector3[] },
    uFlat: { value: 0 },
    uPxU: { value: 1 },
  };
  readonly sheets: THREE.Mesh;
  readonly lines: THREE.Mesh;
  readonly labels: THREE.Mesh;
  readonly marks: THREE.Mesh;
  readonly back: THREE.Mesh;
  /** The ships drawn on the chart last frame (bits by ship). */
  drawn = 0;
  /** WP24 part D: the captains' emblems flown over the ship marks (one draw, the sails' emblem atlas). */
  readonly emblems: THREE.Mesh;
  /** WP24 part D: the stroke a finger is drawing (sphere directions; course.ts CourseDrawing.points), inked live. */
  draft: readonly { x: number; y: number; z: number }[] = [];
  private readonly world: World | null;
  private readonly emblemGeo: THREE.BufferGeometry;
  private readonly geo: THREE.CubeTexture | null;
  private readonly markGeo: THREE.BufferGeometry;
  private labelRoot = -1;
  /** WP24 part C: the smallest name's capitals on the open chart, CSS px (the browser test holds it ≥ 11). */
  capPx = 0;
  private labelPx = 0;
  private readonly labelForm: number[][] = [];
  private readonly stormV = newStormView();
  private readonly labelSize: [number, number, number, number, number][] = [];

  constructor(style: Style, world: World | null, net = new Net()) {
    this.net = net;
    this.uniforms.uSheet.value = net.mats;
    this.uniforms.uCentre.value = net.centres;
    const lin = (k: keyof typeof PIGMENTS) => linearVec(PIGMENTS[k]);
    const parch = new THREE.Vector3(0.83, 0.69, 0.45), common = { ...this.uniforms };
    this.geo = world ? geographyCube(world) : null;
    const mat = (frag: string, extra: Record<string, THREE.IUniform>, layer: number, veil: boolean, id?: number) => inkMaterial(style, {
      vertexShader: VERT, fragmentShader: frag, veil, id, inkWeight: 0.8,
      uniforms: { ...common, uLayer: { value: layer }, ...extra },
    });
    // the sheets: each pentagon a fan of five subdivided triangles in its gnomonic plane
    const sb = builder(), M = 28;
    for (let k = 0; k < SHEETS; k++) {
      const c = net.centres[k].clone().multiplyScalar(R), f = net.faces[k], vs = f.map((a) => net.vertices[a]);
      const edgeDist = (p: THREE.Vector3) => {
        let d = Infinity;
        for (let i = 0; i < 5; i++) {
          const a = vs[i], b = vs[(i + 1) % 5], ab = b.clone().sub(a), t = clamp(p.clone().sub(a).dot(ab) / ab.lengthSq(), 0, 1);
          d = Math.min(d, p.distanceTo(a.clone().addScaledVector(ab, t)));
        }
        return d;
      };
      for (let i = 0; i < 5; i++) {
        const a = vs[i], b = vs[(i + 1) % 5], P = (u: number, v: number) => c.clone().addScaledVector(a.clone().sub(c), u).addScaledVector(b.clone().sub(c), v);
        for (let x = 0; x < M; x++) for (let y = 0; y < M - x; y++) {
          const tri = (p: THREE.Vector3[]) => { for (const q of p) vert(sb, q, k, null, 0, [edgeDist(q), 0, 0, 0], 0, 0); };
          const u0 = x / M, v0 = y / M, d = 1 / M;
          tri([P(u0, v0), P(u0 + d, v0), P(u0, v0 + d)]);
          if (x + y < M - 1) tri([P(u0 + d, v0), P(u0 + d, v0 + d), P(u0, v0 + d)]);
        }
      }
    }
    this.sheets = new THREE.Mesh(geometry(sb), mat(SHEET_FRAG, {
      tGeo: { value: this.geo }, tTerr: { value: this.geo }, uHasTerr: { value: 0 }, uReveal: { value: 0 }, uMatch: { value: 0 }, uCSea: { value: tint(PIGMENTS.verdigris, 0.32) }, uCDeep: { value: tint(PIGMENTS.ultramarine, 0.42) },
      uCInk: { value: lin('ironGall') }, uCSepia: { value: lin('sepia') }, uCLand: { value: new THREE.Vector3(1.0, 0.86, 0.6) },
      uCHill: { value: new THREE.Vector3(0.82, 0.7, 0.55) }, uCParch: { value: parch },
    }, 0, false));
    this.sheets.renderOrder = 10;
    // wind roses and rhumbs, oriented to each sheet's north (toward the Ice Crown)
    const lb = builder(), ink = [...lin('ironGall').toArray(), 0.85], green = [...lin('verdigris').toArray(), 0.75], red = [...lin('vermilion').toArray(), 0.7];
    const gold = [...lin('ochre').toArray(), 0.95], paper = [...parch.toArray(), 0.95];
    for (let k = 0; k < SHEETS; k++) {
      const c = net.centres[k].clone().multiplyScalar(R), [e, nn] = net.basis(k, AXIS_N), vs = net.faces[k].map((a) => net.vertices[a]);
      const at = (ang: number, r: number) => c.clone().addScaledVector(nn, Math.cos(ang) * r).addScaledVector(e, Math.sin(ang) * r);
      for (let w = 0; w < 32; w++) {
        const ang = (w / 32) * Math.PI * 2, dir = at(ang, 1).sub(c);
        // out to the sheet's edge
        let reach = 400;
        for (let i = 0; i < 5; i++) {
          const a = vs[i].clone().sub(c), b = vs[(i + 1) % 5].clone().sub(c), ab = b.clone().sub(a);
          const den = dir.dot(new THREE.Vector3().crossVectors(net.centres[k], ab).normalize());
          const num = a.dot(new THREE.Vector3().crossVectors(net.centres[k], ab).normalize());
          if (Math.abs(den) > 1e-6 && num / den > 0) reach = Math.min(reach, num / den);
        }
        const col = w % 4 === 0 ? ink : w % 2 === 0 ? green : red, px = w % 4 === 0 ? 0.75 : w % 2 === 0 ? 0.6 : 0.5;
        const perp = new THREE.Vector3().crossVectors(net.centres[k], dir).normalize(), p0 = at(ang, 6), p1 = at(ang, reach - 0.5);
        for (const [p, s] of [[p0, -1], [p1, -1], [p1, 1], [p0, -1], [p1, 1], [p0, 1]] as const) vert(lb, p, k, perp, s * px, col, 0, s);
      }
      // the rose: sixteen points, two-tone (dark and light halves), on a gold ring
      for (let w = 0; w < 16; w++) {
        const ang = (w / 16) * Math.PI * 2, len = w % 4 === 0 ? 24 : w % 2 === 0 ? 16 : 10, half = (w % 4 === 0 ? 0.13 : 0.16) * Math.PI;
        const tip = at(ang, len), l = at(ang - half, len * 0.24), r = at(ang + half, len * 0.24);
        for (const p of [c, l, tip]) vert(lb, p, k, null, 0, w % 4 === 0 ? ink : w % 2 === 0 ? green : red, 0, 0);
        for (const p of [c, tip, r]) vert(lb, p, k, null, 0, paper, 0, 0);
      }
      for (let w = 0; w < 48; w++) {
        const a0 = (w / 48) * Math.PI * 2, a1 = ((w + 1) / 48) * Math.PI * 2;
        const q = [at(a0, 7.2), at(a1, 7.2), at(a1, 8.4), at(a0, 8.4)];
        for (const p of [q[0], q[1], q[2], q[0], q[2], q[3]]) vert(lb, p, k, null, 0, gold, 0, 0);
      }
    }
    this.lines = new THREE.Mesh(geometry(lb), mat(LINE_FRAG, { uAlpha: { value: 0 } }, 0.5, true));
    this.lines.renderOrder = 11;
    // region names: one atlas, quads laid out per root so they read upright on the open chart
    // WP24 part C: a name with a space also has a two-line form, for a sheet too narrow for it on one
    const opts = { size: 44, align: 'center', valign: 'middle', swash: true } as const;
    const forms = REGIONS.slice(0, SHEETS).map((r) => {
      const one = rasterizeText(layoutText(r.name, opts), 2);
      const two = r.name.includes(' ') ? rasterizeText(layoutText(r.name, { ...opts, maxWidth: one.width * 0.31 }), 2) : null;
      return two && two.width < one.width * 0.8 ? [one, two] : [one];
    });
    let at = 0;
    for (const f of forms) { this.labelForm.push(f.map((_, i) => at + i)); at += f.length; }
    const rasters = forms.flat();
    const W = Math.max(...rasters.map((r) => r.width)), Hs = rasters.reduce((s, r) => s + r.height + 2, 0), atlas = new Uint8Array(W * Hs * 4);
    let row = 0;
    for (const r of rasters) {
      for (let y = 0; y < r.height; y++) atlas.set(r.data.subarray(y * r.width * 4, (y + 1) * r.width * 4), ((row + y) * W + Math.floor((W - r.width) / 2)) * 4);
      this.labelSize.push([row / Hs, (row + r.height) / Hs, r.width / W, r.width, r.height]);
      row += r.height + 2;
    }
    const tex = new THREE.DataTexture(atlas, W, Hs, THREE.RGBAFormat);
    tex.magFilter = tex.minFilter = THREE.LinearFilter;
    tex.needsUpdate = true;
    const aspect = rasters.map((r) => r.width / r.height);
    this.labels = new THREE.Mesh(new THREE.BufferGeometry(), mat(TEX_FRAG, { tMap: { value: tex }, uAlpha: { value: 0 }, uMode: { value: 0 } }, 0.9, true));
    this.labels.userData.aspect = aspect;
    this.labels.renderOrder = 12;
    // ships in sight: rebuilt each frame (≤ 10 marks and arrows)
    this.markGeo = geometry(builder());
    this.marks = new THREE.Mesh(this.markGeo, mat(TEX_FRAG, { tMap: { value: silhouetteTexture() }, uAlpha: { value: 0 }, uMode: { value: 1 } }, 1.3, true));
    this.marks.renderOrder = 13;
    this.world = world;
    this.emblemGeo = geometry(builder());
    this.emblems = new THREE.Mesh(this.emblemGeo, mat(TEX_FRAG, { tMap: { value: emblemTexture() }, uAlpha: { value: 0 }, uMode: { value: 1 } }, 1.3, true));
    this.emblems.renderOrder = 14;
    // the parchment the net comes to rest on, far beneath the closed globe
    this.back = new THREE.Mesh(new THREE.BufferGeometry(), mat(BACK_FRAG, { uCParch: { value: parch.clone().multiplyScalar(0.97) } }, 0, false, 254));
    for (const m of [this.back, this.sheets, this.lines, this.labels, this.marks, this.emblems]) {
      m.frustumCulled = false;
      m.layers.set(LAYER_CHART);
      this.group.add(m);
    }
    this.group.layers.set(LAYER_CHART);
  }

  /** Re-lays the names and the parchment for the current root (on the chart they read upright). */
  private relabel(camera: THREE.PerspectiveCamera, view: RigView, pxU: number): void {
    const net = this.net, fit = net.fit(camera, view), b = builder(), ink = [...linearVec(PIGMENTS.ironGall).toArray(), 1];
    const inv = new THREE.Matrix3();
    // WP24 part C: names sized in screen px on the open chart (capitals 12–18 CSS px by the sheet's size on screen) and
    // fitted to their sheet: the band clear of the wind rose where the sheet is widest, on one line or two, centred on
    // that band's chord; shrunk to fit, never under 11 px (capPx records the smallest)
    const capPx = Math.min(18, Math.max(12, (0.095 * 247) / pxU)), ku = (capPx * pxU) / LABEL_CAP_RPX, floor = 11 / capPx;
    let least = Infinity;
    for (let k = 0; k < SHEETS; k++) {
      // the chart's up carried back into sheet k's folded plane
      const m = inv.setFromMatrix4(net.final[k]).invert(), up = fit.up.clone().applyMatrix3(m), c = net.centres[k];
      up.addScaledVector(c, -up.dot(c)).normalize();
      const right = new THREE.Vector3().crossVectors(up, c).normalize();
      const poly = net.faces[k].map((i): [number, number] => { const q = net.corners[i], p = q.clone().multiplyScalar(R / q.dot(c)); return [p.dot(right), p.dot(up)]; });
      let best = { score: -Infinity, s: 0.4, x: 0, y: -66, form: this.labelForm[k][0] };
      for (const form of this.labelForm[k]) {
        if (best.s >= floor) break;
        const w = this.labelSize[form][3] * ku, h = this.labelSize[form][4] * ku;
        for (const side of [-1, 1]) for (let d = 0; d <= 40; d += 5) {
          const y = side * (LABEL_ROSE + h / 2 + d), lo = chordAt(poly, y - h / 2), hi = chordAt(poly, y + h / 2);
          if (!lo || !hi) continue;
          const x0 = Math.max(lo[0], hi[0]), x1 = Math.min(lo[1], hi[1]), s = Math.min(1, ((x1 - x0) * 0.9) / w);
          const score = s - d * 1e-3 - (side > 0 ? 0.02 : 0);
          if (score > best.score) best = { score, s, x: (x0 + x1) / 2, y, form };
        }
      }
      const [v0, v1, uw, wr, hr] = this.labelSize[best.form], sc = Math.max(floor, best.s), w = wr * ku * sc, h = hr * ku * sc;
      least = Math.min(least, capPx * sc);
      const u0 = 0.5 - uw / 2, u1 = 0.5 + uw / 2, o = c.clone().multiplyScalar(R).addScaledVector(right, best.x).addScaledVector(up, best.y);
      const P = (x: number, y: number) => o.clone().addScaledVector(right, x * w / 2).addScaledVector(up, y * h / 2);
      const q: [THREE.Vector3, number, number][] = [[P(-1, 1), u0, v0], [P(1, 1), u1, v0], [P(1, -1), u1, v1], [P(-1, -1), u0, v1]];
      for (const i of [0, 3, 1, 1, 3, 2]) vert(b, q[i][0], k, null, 0, ink, q[i][1], q[i][2]);
    }
    this.capPx = least;
    this.labelPx = pxU;
    this.labels.geometry.dispose();
    this.labels.geometry = geometry(b);
    // the parchment: a wide sheet 2.4 R beneath the root's plane, its own grain coordinates in vDir
    const g = new THREE.BufferGeometry(), n = net.normal, s = Math.max(fit.dist * 3, 4000);
    const base = fit.centre.clone().addScaledVector(n, -2.4 * R), pos: number[] = [], dir: number[] = [];
    for (const [x, y] of [[-1, -1], [1, -1], [1, 1], [-1, -1], [1, 1], [-1, 1]]) {
      const p = base.clone().addScaledVector(fit.right, x * s).addScaledVector(fit.up, y * s);
      pos.push(p.x, p.y, p.z);
      dir.push(x * s, y * s, 0);
    }
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('dir', new THREE.Float32BufferAttribute(dir, 3));
    g.setAttribute('sheet', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0], 1));
    g.setAttribute('perp', new THREE.Float32BufferAttribute(new Array(18).fill(0), 3));
    g.setAttribute('sideW', new THREE.Float32BufferAttribute(new Array(6).fill(0), 1));
    g.setAttribute('colour', new THREE.Float32BufferAttribute(new Array(24).fill(0), 4));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(new Array(12).fill(0), 2));
    this.back.geometry.dispose();
    this.back.geometry = g;
    const bm = this.back.material as THREE.ShaderMaterial;
    if (bm.vertexShader !== BACK_VERT) { bm.vertexShader = BACK_VERT; bm.needsUpdate = true; }
    this.labelRoot = net.root;
  }

  /** Lays the ships in sight on the net: a silhouette and a short inked heading arrow each, sized in screen px. */
  private ships(state: MatchState, mask: number, camera: THREE.PerspectiveCamera, view: RigView): void {
    const net = this.net, fit = net.fit(camera, view), b = builder(), pxU = this.uniforms.uPxU.value;
    const ink = [...linearVec(PIGMENTS.ironGall).toArray(), 2], mine = [...linearVec(PIGMENTS.vermilion).toArray(), 2];
    const inv = new THREE.Matrix3(), p = V();
    this.drawn = 0;
    // WP24 part D: under the ships, the current, the player's waters, trails, landmarks, loot and the course
    chartContent(b, net, state, this.world, mask, pxU, fit.up, this.draft);
    const eb = builder();
    for (let i = 0; i < SHIPS && i < state.ships.length; i++) {
      if (!(mask & (1 << i))) continue;
      const ship = state.ships[i], k = net.sheetOf(ship.pos), c = net.centres[k];
      this.drawn |= 1 << i;
      const up = fit.up.clone().applyMatrix3(inv.setFromMatrix4(net.final[k]).invert());
      up.addScaledVector(c, -up.dot(c)).normalize();
      const right = new THREE.Vector3().crossVectors(up, c).normalize();
      p.set(ship.pos.x, ship.pos.y, ship.pos.z).normalize();
      const o = p.clone().multiplyScalar(R / Math.max(0.2, p.dot(c)));
      const head = i === PLAYER ? ship.head : ship.captain.intent;
      const hd = new THREE.Vector3(head.x, head.y, head.z).addScaledVector(c, -(head.x * c.x + head.y * c.y + head.z * c.z));
      if (hd.lengthSq() < 1e-10) hd.copy(up); else hd.normalize();
      const s = 9 * pxU, flip = hd.dot(right) < 0 ? -1 : 1, rect = silhouetteRect(FORM_NAMES[ship.form] ?? 'caravel', 'profile');
      const col = i === PLAYER ? mine : ink;
      const Q = (x: number, y: number) => o.clone().addScaledVector(right, x * s).addScaledVector(up, y * s + s * 0.6);
      const sil = [...ink.slice(0, 3), 1];
      const q: [THREE.Vector3, number, number][] = [
        [Q(-flip, 1), rect.x, rect.y + rect.w], [Q(flip, 1), rect.x + rect.z, rect.y + rect.w],
        [Q(flip, -1), rect.x + rect.z, rect.y], [Q(-flip, -1), rect.x, rect.y],
      ];
      for (const j of [0, 3, 1, 1, 3, 2]) vert(b, q[j][0], k, null, 0, sil, q[j][1], q[j][2]);
      // WP24 part D: the captain's emblem flown over the hull (the player's gull), from the sails' atlas
      const em = i === PLAYER ? PLAYER_EMBLEM : ship.pattern > 0 ? EMBLEMS[(ship.pattern - 1) % EMBLEMS.length] : null;
      if (em) {
        const er = emblemRect(em), es = 4.4 * pxU, ec = [...col.slice(0, 3), 1];
        const E = (x: number, y: number) => o.clone().addScaledVector(right, x * es).addScaledVector(up, y * es + s * 2.3);
        const eq: [THREE.Vector3, number, number][] = [[E(-1, 1), er.x, er.y + er.w], [E(1, 1), er.x + er.z, er.y + er.w], [E(1, -1), er.x + er.z, er.y], [E(-1, -1), er.x, er.y]];
        for (const j of [0, 3, 1, 1, 3, 2]) vert(eb, eq[j][0], k, null, 0, ec, eq[j][1], eq[j][2]);
      }
      // the arrow: a shaft and a head from the hull along where it is heading
      const side = new THREE.Vector3().crossVectors(c, hd).normalize(), L = 22 * pxU, wS = 0.9 * pxU, wH = 3.6 * pxU;
      const a0 = o.clone().addScaledVector(hd, 4 * pxU), a1 = o.clone().addScaledVector(hd, L - 6 * pxU), tip = o.clone().addScaledVector(hd, L);
      const sh = [a0.clone().addScaledVector(side, -wS), a1.clone().addScaledVector(side, -wS), a1.clone().addScaledVector(side, wS), a0.clone().addScaledVector(side, wS)];
      for (const j of [0, 1, 2, 0, 2, 3]) vert(b, sh[j], k, null, 0, col, 0, 0);
      for (const v of [a1.clone().addScaledVector(side, -wH), tip, a1.clone().addScaledVector(side, wH)]) vert(b, v, k, null, 0, col, 0, 0);
    }
    this.stormMarks(b, state, pxU);
    const g = geometry(b);
    for (const name of ['position', 'dir', 'sheet', 'perp', 'sideW', 'colour', 'uv']) this.markGeo.setAttribute(name, g.getAttribute(name));
    this.markGeo.setDrawRange(0, b.sheet.length);
    const eg = geometry(eb);
    for (const name of ['position', 'dir', 'sheet', 'perp', 'sideW', 'colour', 'uv']) this.emblemGeo.setAttribute(name, eg.getAttribute(name));
    this.emblemGeo.setDrawRange(0, eb.sheet.length);
  }
  /** WP24 part C: the storm on the chart, screen-sized like the ships: the wall (the calm's edge) inked with hatching
   *  toward the storm, and the next shrink, once announced, as a dashed vermilion ring. */
  private stormMarks(b: Builder, state: MatchState, pxU: number): void {
    const v = stormView(state, this.stormV);
    const wall = [...linearVec(PIGMENTS.ironGall).toArray(), 2], next = [...linearVec(PIGMENTS.vermilion).toArray(), 2];
    if (v.calm.r < Math.PI - 1e-3) this.ring(b, v.calm, wall, 1.3 * pxU, false, 7 * pxU);
    if (v.announced && v.next.r < v.calm.r - 1e-4) this.ring(b, v.next, next, 0.8 * pxU, true, 0);
  }

  private ring(b: Builder, calm: Calm, col: readonly number[], half: number, dash: boolean, tick: number): void {
    const net = this.net, a = new THREE.Vector3(calm.at.x, calm.at.y, calm.at.z).normalize();
    const e1 = new THREE.Vector3().crossVectors(a, Math.abs(a.y) < 0.9 ? AXIS_N : new THREE.Vector3(1, 0, 0)).normalize();
    const e2 = new THREE.Vector3().crossVectors(a, e1), cr = Math.cos(calm.r), sr = Math.sin(calm.r);
    const d = V(), out = V(), prev = V(), cur = V(), side = V(), t = V(), N = 240;
    let pk = -1;
    for (let i = 0; i <= N; i++) {
      const th = (i / N) * Math.PI * 2, ct = Math.cos(th), st = Math.sin(th);
      d.copy(a).multiplyScalar(cr).addScaledVector(e1, ct * sr).addScaledVector(e2, st * sr);
      const k = net.sheetOf(d), c = net.centres[k];
      cur.copy(d).multiplyScalar(R / Math.max(0.2, d.dot(c)));
      const len = t.subVectors(cur, prev).length();
      if (i > 0 && k === pk && len > 1e-6 && (!dash || i % 4 < 2)) {
        side.crossVectors(c, t).normalize().multiplyScalar(half);
        const q = [prev.clone().sub(side), cur.clone().sub(side), cur.clone().add(side), prev.clone().add(side)];
        for (const j of [0, 1, 2, 0, 2, 3]) vert(b, q[j], k, null, 0, col, 0, 0);
        if (tick > 0 && i % 3 === 0) {
          // a hatch toward the storm along the cap's outward tangent, raked a little along the wall
          out.copy(a).multiplyScalar(-sr).addScaledVector(e1, ct * cr).addScaledVector(e2, st * cr);
          out.addScaledVector(c, -out.dot(c)).normalize();
          const tip = cur.clone().addScaledVector(out, tick).addScaledVector(t, (0.35 * tick) / len), w = t.clone().multiplyScalar((half * 0.6) / len);
          const hq = [cur.clone().sub(w), tip.clone().addScaledVector(w, -0.3), tip.clone().addScaledVector(w, 0.3), cur.clone().add(w)];
          for (const j of [0, 1, 2, 0, 2, 3]) vert(b, hq[j], k, null, 0, col, 0, 0);
        }
      }
      prev.copy(cur);
      pk = k;
    }
  }


  /** One frame of the chart at zoom z (camera.ts zoomPhases), for the player's sight. */
  frame(state: MatchState, f: ChartFrame, camera: THREE.PerspectiveCamera, view: RigView, sight: Sight | null, territory: THREE.CubeTexture | null): void {
    const net = this.net, u = this.uniforms;
    if (f.z <= 0) {
      const p = state.ships[PLAYER].pos;
      net.layout(net.sheetOf(p));
    }
    net.pose(f.unfold);
    u.uFlat.value = f.flat;
    const dist = f.z < 0.5 ? camera.position.length() - R : camera.position.dot(net.normal) - R;
    u.uPxU.value = (2 * Math.max(1, dist) * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)) / Math.max(1, view.height);
    const pxU = u.uPxU.value as number;
    if (this.labelRoot !== net.root || (f.unfold > 0.5 && Math.abs(pxU - this.labelPx) > 0.03 * pxU)) this.relabel(camera, view, pxU);
    const sm = this.sheets.material as THREE.ShaderMaterial;
    sm.uniforms.uReveal.value = f.reveal;
    sm.uniforms.uMatch.value = ease((0.5 - f.z) / 0.1);
    sm.uniforms.tTerr.value = territory ?? this.geo;
    sm.uniforms.uHasTerr.value = territory ? 1 : 0;
    // over the world the soaking globe is laid on top; once the world is gone the sheets test depth among themselves
    sm.depthFunc = f.z < 0.5 ? THREE.AlwaysDepth : THREE.LessEqualDepth;
    (this.lines.material as THREE.ShaderMaterial).uniforms.uAlpha.value = ease((f.z - 0.42) / 0.14);
    (this.labels.material as THREE.ShaderMaterial).uniforms.uAlpha.value = ease((f.unfold - 0.55) / 0.4);
    (this.marks.material as THREE.ShaderMaterial).uniforms.uAlpha.value = ease((f.z - 0.4) / 0.12);
    (this.emblems.material as THREE.ShaderMaterial).uniforms.uAlpha.value = ease((f.z - 0.4) / 0.12);
    this.back.visible = f.z >= 0.5;
    if (f.z > 0.3) this.ships(state, chartShips(state, sight), camera, view);
    else this.drawn = 0;
  }

  dispose(): void {
    this.group.removeFromParent();
    for (const m of [this.back, this.sheets, this.lines, this.labels, this.marks, this.emblems]) { m.geometry.dispose(); (m.material as THREE.Material).dispose(); }
    this.geo?.dispose();
  }
}

const BACK_VERT = /* glsl */ `
in vec3 dir;
out vec3 vDir;
out vec3 vNormal;
out vec4 vColour;
out vec2 vUv;
void main() {
  vDir = dir; vNormal = vec3(0.0, 0.0, 1.0); vColour = vec4(0.0); vUv = vec2(0.0);
  gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0);
}`;

/** The x extent of a convex polygon's chord at height y, or null off it. */
function chordAt(poly: readonly [number, number][], y: number): [number, number] | null {
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < poly.length; i++) {
    const [ax, ay] = poly[i], [bx, by] = poly[(i + 1) % poly.length];
    if ((ay - y) * (by - y) > 0 || ay === by) continue;
    const x = ax + ((y - ay) / (by - ay)) * (bx - ax);
    lo = Math.min(lo, x);
    hi = Math.max(hi, x);
  }
  return hi > lo ? [lo, hi] : null;
}
/** A name's capitals in its raster (0.6 em at 44 px, pixel ratio 2), and the wind rose's clear radius on a sheet, u. */
const LABEL_CAP_RPX = 0.6 * 44 * 2, LABEL_ROSE = 40;

export const CHART_LAYER = LAYER_CHART;
/** A multiplicative tint: white toward a pigment by k (linear). */
function tint(c: Parameters<typeof linearVec>[0], k: number): THREE.Vector3 {
  const [r, g, b] = linearVec(c).toArray();
  return new THREE.Vector3(1 + (r - 1) * k, 1 + (g - 1) * k, 1 + (b - 1) * k);
}
/** Height of the ground under a unit direction, u above mean sea level (the camera's collision). */
export function groundOf(world: World): (dir: { x: number; y: number; z: number }) => number {
  return (dir) => world.geo.heights[cellOf(TERRITORY, dir)];
}

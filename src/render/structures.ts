// Lighthouses and harbours (WP15 part B). A lighthouse stands on every placed headland light of the geography and
// a harbour lies at every placed anchorage: of unknown origin, well kept and warmly lit, with no sign that anyone
// ever lived here (no doors, paths, houses or signs). The lighthouses are one family drawn as an engraver draws
// from life: a rock-cut plinth laid in courses, a tapering shaft of hatched masonry courses weathered darker toward
// its foot, window slits under drip hoods on the seaward side, a band of the region's accent, a corbelled gallery on
// its brackets with an iron rail, a lantern room glazed between iron bars, a verdigris cupola, a gold-leaf ball and
// vane; boulders lie round its foot. It is seated on the terrain's own surface and seats the WP14 beam and lamp in
// its lantern (Beams.seat), so the beams turn from the lanterns. A harbour is natural: a mole of
// boulders curving out from the shore round the anchorage to a mouth on the open side, stone bollards on its rocks,
// driftwood posts and standing stones at the water's edge, rocks along the waterline, and a lamp of the lighthouses'
// family on the mole head, registered in the sky's lamps. Everything is drawn by one painted illustrated material
// (per-vertex pigments, per-instance stone and accent from the region's palette) in six instanced draw calls; a
// lighthouse is drawn whole near the eye and as a clean silhouette further off, and not at all once its lantern has
// dropped below the eye's horizon (hull-down by real geometry before that: the plinth goes first, the lantern last).
import * as THREE from 'three';
import { illustratedMaterial, transmittanceVec, type Style } from '../style/glsl.ts';
import { mix, PIGMENTS, type RGB } from '../style/palette.ts';
import type { V3 } from '../sim/math.ts';
import { R, TERRITORY, gnomonicDir } from '../sim/sphere.ts';
import { heightAt, regionOf, type Geography } from '../sim/world/geography.ts';
import { REGIONS, TIDE } from '../sim/world/regions.ts';
import type { Beams, Lamp, Lights } from './light.ts';
import { seas } from './sea.ts';
import { skies } from './sky.ts';
import { exposedOf, sandTops, shoreExposure, terrains, type Surface, type TerrainField } from './terrain.ts';
import type { RenderContext, RenderModule } from './world.ts';

/** A lighthouse in its own frame (u, before the site's scale): the lantern's centre `lamp` over the base, the plinth
 *  sunk `plinth` below it, the footprint's radius `foot`; stood back from a cliff's edge by up to `setBack` u; drawn
 *  whole within `near` u of the eye. */
export const TOWER = { lamp: 6, plinth: 2.7, foot: 1.3, setBack: 4, near: 80 } as const;
/** A harbour: rays cast round the anchorage for the shore, the mole's radius (share of the harbour's), the spacing
 *  of its boulders (u), the longest arm (rad), the lamp's height in its own frame and its reach. */
/** Spice Harbour's built mole: its arms from the flanks `land` rad off the mouth to `mouth` rad, at `r` of the
 *  harbour's radius, its wall `half` u either side of its line, its coping over mean sea (u). */
export const MOLE = { land: 1.55, mouth: 1.08, r: 1.3, half: 0.95, coping: TIDE.amp + 0.4 } as const;
export const HARBOUR = { rays: 32, mole: 0.85, spacing: 1.25, arm: 2.2, lamp: 1.91, reach: 10 } as const;
/** A lagoon harbour's jetty: from the nearest shore `long` u out (no nearer the anchorage than `reach` of its radius),
 *  `half` u either side of its line, in runs of about `run` u. */
export const JETTY = { long: 4.5, reach: 0.45, half: 0.75, run: 0.9, coping: TIDE.amp + 1.1 } as const;

type Paint = readonly [RGB | 'stone' | 'accent' | 'gold', number];
const IRON: Paint = [PIGMENTS.ironGall, 0.85], GLASS: Paint = [PIGMENTS.ochre, 0.3], COPPER: Paint = [PIGMENTS.verdigris, 0.75];
const GOLD: Paint = ['gold', 0], OWN = new THREE.Vector3(1, 1, 1);

/** A kit of parts merged into one geometry, each vertex with its paint (transmittance, density; below 0 gold leaf)
 *  and tint (0 its own pigment, 1 the instance's stone, 2 its accent). `weather` sets the density by height. */
class Kit {
  private readonly pos: number[] = [];
  private readonly nor: number[] = [];
  private readonly paint: number[] = [];
  private readonly tint: number[] = [];
  private readonly index: number[] = [];

  add(g: THREE.BufferGeometry, [pigment, density]: Paint, flat = false, weather?: (y: number) => number): this {
    const geom = flat && g.index ? g.toNonIndexed() : g;
    if (flat) geom.computeVertexNormals();
    const p = geom.getAttribute('position'), n = geom.getAttribute('normal'), idx = geom.index, base = this.pos.length / 3;
    const own = typeof pigment === 'string' ? OWN : transmittanceVec(pigment);
    const tint = pigment === 'stone' ? 1 : pigment === 'accent' ? 2 : 0;
    for (let i = 0; i < p.count; i++) {
      this.pos.push(p.getX(i), p.getY(i), p.getZ(i));
      this.nor.push(n.getX(i), n.getY(i), n.getZ(i));
      this.paint.push(own.x, own.y, own.z, pigment === 'gold' ? -1 : weather ? weather(p.getY(i)) : density);
      this.tint.push(tint);
    }
    for (let i = 0; i < (idx ? idx.count : p.count); i++) this.index.push(base + (idx ? idx.getX(i) : i));
    g.dispose();
    geom.dispose();
    return this;
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('aPaint', new THREE.Float32BufferAttribute(this.paint, 4));
    g.setAttribute('aTint', new THREE.Float32BufferAttribute(this.tint, 1));
    g.setIndex(this.index);
    return g;
  }
}

const v2 = (r: number, y: number) => new THREE.Vector2(r, y);
const cyl = (top: number, bottom: number, y0: number, y1: number, sides: number, open = false) =>
  new THREE.CylinderGeometry(top, bottom, y1 - y0, sides, 1, open).translate(0, (y0 + y1) / 2, 0);
const ring = (r: number, tube: number, y: number, sides: number) =>
  new THREE.TorusGeometry(r, tube, 3, sides).rotateX(Math.PI / 2).translate(0, y, 0);
const box = (w: number, h: number, d: number, x: number, y: number, z: number, turn = 0) =>
  new THREE.BoxGeometry(w, h, d).translate(0, 0, z).rotateY(turn).translate(x, y, 0);
const hash = (x: number, y: number, z: number) => {
  const s = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453;
  return s - Math.floor(s);
};
/** A profile laid in courses: `courses` stones high from y0 to y1, each joint a small inked notch. */
function coursed(radius: (y: number) => number, y0: number, y1: number, courses: number): THREE.Vector2[] {
  const h = (y1 - y0) / courses, pts = [v2(radius(y0), y0)];
  for (let c = 1; c < courses; c++) {
    const y = y0 + c * h;
    pts.push(v2(radius(y - 0.035), y - 0.035), v2(radius(y) - 0.04, y), v2(radius(y + 0.035), y + 0.035));
  }
  pts.push(v2(radius(y1), y1));
  return pts;
}

const shaftR = (y: number) => 0.64 + 0.34 * Math.pow(1 - (y - 0.66) / 3.94, 1.4);
/** Weathering: the shaft's wash deepens toward its foot, where spray and rain run down it. */
const weathered = (y: number) => 0.4 + 0.3 * Math.pow(Math.max(0, 1 - y / 4.6), 2);

function lighthouseKit(): THREE.BufferGeometry {
  const k = new Kit()
    .add(new THREE.LatheGeometry(coursed((y) => 1.18 + 0.32 * ((0.5 - y) / 3.2), -TOWER.plinth, 0.5, 5), 8), ['stone', 0.8], true)
    .add(cyl(1.27, 1.27, 0.5, 0.66, 8), ['stone', 0.95], true)
    .add(new THREE.LatheGeometry(coursed(shaftR, 0.66, 4.6, 9), 16), ['stone', 0.42], false, weathered)
    .add(cyl(shaftR(4.22) + 0.03, shaftR(3.92) + 0.03, 3.92, 4.22, 16, true), ['accent', 0.7]);
  // window slits on the seaward side under their drip hoods
  for (const y of [1.9, 3.2]) {
    k.add(box(0.13, 0.44, 0.12, 0, y, shaftR(y) - 0.03), IRON).add(box(0.24, 0.06, 0.16, 0, y + 0.27, shaftR(y + 0.27)), ['stone', 0.7]);
  }
  // the corbelled gallery on sixteen brackets, its deck and iron rail
  const cove: THREE.Vector2[] = [];
  for (let i = 0; i <= 6; i++) {
    const t = (i / 6) * (Math.PI / 2);
    cove.push(v2(0.64 + 0.36 * (1 - Math.cos(t)), 4.6 + 0.4 * Math.sin(t)));
  }
  cove.push(v2(1.04, 5.0), v2(1.04, 5.09), v2(0.5, 5.09));
  k.add(new THREE.LatheGeometry(cove, 16), ['stone', 0.55]);
  for (let i = 0; i < 16; i++) {
    const a = ((i + 0.5) / 16) * Math.PI * 2;
    k.add(box(0.09, 0.34, 0.26, 0, 4.82, 0.78, a), ['stone', 0.62], true);
    k.add(box(0.04, 0.36, 0.04, 0, 5.27, 0.98, (i / 16) * Math.PI * 2), IRON);
  }
  k.add(ring(0.98, 0.024, 5.45, 24), IRON).add(ring(0.98, 0.016, 5.28, 24), IRON);
  // the lantern room: its wall, the glazing between bars, the cupola, ball and vane
  k.add(cyl(0.58, 0.62, 5.09, 5.45, 16), ['stone', 0.65]).add(cyl(0.53, 0.53, 5.45, 6.55, 8, true), GLASS, true);
  for (let i = 0; i < 8; i++) k.add(box(0.05, 1.1, 0.05, 0, 6.0, 0.54, (i / 8) * Math.PI * 2), IRON);
  return k
    .add(ring(0.545, 0.028, 5.47, 8), IRON).add(ring(0.545, 0.02, 6.0, 8), IRON).add(ring(0.545, 0.028, 6.53, 8), IRON)
    .add(cyl(0.7, 0.7, 6.55, 6.62, 8), COPPER, true)
    .add(cyl(0.07, 0.64, 6.62, 7.08, 8), COPPER, true)
    .add(new THREE.SphereGeometry(0.11, 10, 6).translate(0, 7.18, 0), GOLD)
    .add(cyl(0.014, 0.014, 7.25, 7.62, 4), GOLD)
    .add(box(0.01, 0.09, 0.26, 0, 7.5, 0.1), GOLD)
    .build();
}

/** The far lighthouse: the same silhouette in a few faces, the lantern kept. */
function farKit(): THREE.BufferGeometry {
  return new Kit()
    .add(cyl(1.18, 1.5, -TOWER.plinth, 0.66, 6), ['stone', 0.8], true)
    .add(cyl(0.64, 0.98, 0.66, 4.6, 8), ['stone', 0.42], false, weathered)
    .add(cyl(1.04, 0.66, 4.6, 5.09, 8), ['stone', 0.55], true)
    .add(cyl(0.55, 0.55, 5.09, 6.55, 8), GLASS, true)
    .add(cyl(0.07, 0.68, 6.55, 7.08, 8), COPPER, true)
    .add(new THREE.SphereGeometry(0.13, 6, 4).translate(0, 7.18, 0), GOLD)
    .build();
}

/** A harbour lamp of the same family: a coursed stone pillar, a small glazed lantern, a verdigris cap, gold ball. */
function lampKit(): THREE.BufferGeometry {
  const k = new Kit()
    .add(new THREE.LatheGeometry(coursed((y) => 0.42 - 0.04 * (y + 1.2), -1.2, 1.55, 6), 8), ['stone', 0.6], true)
    .add(cyl(0.4, 0.4, 1.55, 1.68, 8), ['stone', 0.85], true)
    .add(cyl(0.22, 0.22, 1.68, 2.14, 6, true), GLASS, true)
    .add(ring(0.23, 0.02, 1.7, 6), IRON).add(ring(0.23, 0.02, 2.12, 6), IRON)
    .add(cyl(0.04, 0.31, 2.14, 2.4, 6), COPPER, true)
    .add(new THREE.SphereGeometry(0.06, 8, 5).translate(0, 2.46, 0), GOLD);
  for (let i = 0; i < 6; i++) k.add(box(0.035, 0.46, 0.035, 0, 1.91, 0.225, (i / 6) * Math.PI * 2), IRON);
  return k.build();
}

/** Dressed stone drawn as coursed ashlar at world scale, whatever a run's stretch (S-020: stretched block geometry and
 *  the material's level hatch read as lumber): courses ~0.24 u high of blocks 0.45–0.8 u long, perpends staggered
 *  course by course, each block its own grey-ochre load, its arrises worn (joints broken, the lower edge in shadow, the
 *  upper caught by the light); a dark wet band up to high water and olive weed below mean sea with a ragged fringe;
 *  the shade hatched near upright, never along the courses like wood grain. `all`: every surface of the kit is stone;
 *  otherwise only the painted parts tinted with the region's stone (a lamp's pillar). For `illustratedMaterial`'s
 *  `surface` (painted materials). */
export function masonrySurface(all: boolean): string {
  return /* glsl */ `{
    float hgt = length(vWorld) - ${R.toFixed(1)};
    vec3 upw = normalize(vWorld), ta = abs(cross(upw, n)), ua = abs(upw);
    float vert = 1.0 - smoothstep(0.55, 0.8, abs(dot(n, upw)));
    float m = ${all ? '1.0' : 'step(0.5, vTint) * step(vTint, 1.5)'};
    // along the face: the world axis most along it, less its rise with height, so the perpends stand upright
    vec3 ax = ta.x > ta.y && ta.x > ta.z ? vec3(1.0, 0.0, 0.0) : ta.y > ta.z ? vec3(0.0, 1.0, 0.0) : vec3(0.0, 0.0, 1.0);
    float s = dot(vWorld, ax) - dot(upw, ax) * hgt;
    vec2 top = ua.y > max(ua.x, ua.z) ? vWorld.xz : ua.x > ua.z ? vWorld.yz : vWorld.xy;
    float cy = mix(top.y / 0.7, hgt / 0.24, vert), course = floor(cy);
    float sl = mix(top.x, s, vert) / (0.45 + 0.35 * hash11(course * 3.17 + 0.4)) + hash11(course * 7.13 + 1.0), bx = floor(sl);
    float fy = fract(cy), fx = fract(sl), bh = hash12(vec2(course, bx) + 0.37), bk = hash12(vec2(bx, course) + 5.1);
    // each block its own load, cooler or warmer, lighter or darker; the arrises worn
    col = mix(col, mix(col, vec3(dot(col, vec3(0.3, 0.45, 0.25))), 0.35) * vec3(0.92, 0.95, 1.02), m * (0.45 + 0.4 * bh));
    col *= 1.0 - m * (0.1 * bk + 0.16 * vert * (1.0 - smoothstep(0.0, 0.22, fy)) + 0.06 * (1.0 - smoothstep(0.0, 0.08, min(fx, 1.0 - fx))));
    col = mix(col, vec3(1.0), m * vert * 0.07 * smoothstep(0.82, 1.0, fy));
    float jy = min(fy, 1.0 - fy) / max(fwidth(cy), 1e-4), jx = min(fx, 1.0 - fx) / max(fwidth(sl), 1e-4);
    float worn = smoothstep(0.2, 0.42, q.mottle + 0.25 * (bh - 0.5));
    float joint = (1.0 - smoothstep(0.35 * uRenderPx, 0.35 * uRenderPx + 1.0, min(jy, jx))) * worn;
    col = mix(col, hatchInk(0.75), m * 0.8 * joint);
    // wet and dark up to high water, weed below mean sea, its fringe ragged
    float wet = vert * (1.0 - smoothstep(${TIDE.amp.toFixed(2)} - 0.05, ${TIDE.amp.toFixed(2)} + 0.3 + 0.2 * (q.bloom - 0.5), hgt));
    col *= 1.0 - m * 0.55 * wet;
    float weed = vert * (1.0 - smoothstep(0.02, 0.14, hgt - 0.22 * hash11(floor(s * 14.0)) + 0.1 * (q.mottle - 0.5)));
    col = mix(col, vec3(0.2, 0.25, 0.12), m * 0.8 * weed);
    // shade hatched near upright down each face
    vec2 mc = vec2(s + 0.3 * hgt, hgt), mdx = dFdx(mc), mdy = dFdy(mc);
    float k = step(0.5, m * vert);
    hc = mix(hc, mc, k); hdx = mix(hdx, mdx, k); hdy = mix(hdy, mdy, k);
    tone *= 1.0 - 0.3 * k; // the joints carry the face, the hatching only its shade
  }`;
}

/** A boulder: a jagged faceted stone, its wash darker low down where the sea wets it. */
function rockKit(): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(1, 1), p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), j = 0.76 + 0.36 * hash(x, y, z);
    p.setXYZ(i, x * j, y * j, z * j);
  }
  g.computeVertexNormals();
  return new Kit().add(g, ['stone', 0.6], false, (y) => 0.5 + 0.35 * Math.max(0, -y)).build();
}

/** A bollard of natural stone, worn to a waist where the lines have run. */
function bollardKit(): THREE.BufferGeometry {
  const g = new THREE.LatheGeometry([v2(0.24, -0.5), v2(0.25, 0), v2(0.17, 0.22), v2(0.15, 0.32), v2(0.21, 0.44), v2(0.18, 0.56), v2(0.02, 0.6)], 8);
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) p.setX(i, p.getX(i) * (0.9 + 0.2 * hash(p.getX(i), p.getY(i), p.getZ(i))));
  return new Kit().add(g, ['stone', 0.7], true).build();
}

/** A run of a lagoon jetty 1 long on z: coral rag dressed in courses (masonrySurface), the coping overhanging both
 *  faces (one long stone across, plain: the courses' world-squared joints read as a lattice on a flat top), a footing
 *  course set out at the foot; y from the footing (−1.6) to the coping (0). */
const COPING: RGB = mix(mix(PIGMENTS.leadWhite, PIGMENTS.ochre, 0.3), PIGMENTS.sepia, 0.1);
function jettyKit(): THREE.BufferGeometry {
  const h = JETTY.half;
  return new Kit()
    .add(box(2 * h - 0.12, 1.5, 1, 0, -0.83, 0), ['stone', 0.55], true)
    .add(box(2 * h + 0.06, 0.12, 1.02, 0, -0.06, 0), [COPING, 0.5], true)
    .add(box(2 * h + 0.14, 0.2, 1, 0, -1.5, 0), ['stone', 0.6], true)
    .build();
}

/** The foam round a jetty's run at the waterline, 1 long on z: a broken ribbon of lead white either side, lapping
 *  out from the face. */
function lapKit(): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry(), pos: number[] = [], h = JETTY.half - 0.06, n = 6;
  for (const side of [-1, 1]) for (let i = 0; i < n; i++) {
    const z0 = -0.5 + i / n, z1 = z0 + 1 / n, w0 = 0.12 + 0.22 * hash(side, i, 1), w1 = 0.12 + 0.22 * hash(side, i + 1, 1);
    const a = [side * h, 0, z0], b = [side * h, 0, z1], c = [side * (h + w1), 0, z1], d = [side * (h + w0), 0, z0];
    pos.push(...a, ...b, ...c, ...a, ...c, ...d);
  }
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return new Kit().add(g, [PIGMENTS.leadWhite, 0.15], true).build();
}

/** A driftwood post, bleached and bent. */
function postKit(): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(0.08, 0.13, 2.4, 6, 4).translate(0, 0.4, 0), p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) p.setX(i, p.getX(i) + 0.07 * Math.sin(p.getY(i) * 1.7));
  return new Kit().add(g, [PIGMENTS.sepia, 0.5], true, (y) => 0.45 + 0.3 * Math.max(0, -y)).build();
}

// ---------------------------------------------------------------------------------------------------------------
// Siting

export interface Tower {
  readonly region: number;
  readonly up: THREE.Vector3;
  /** The lantern's centre, where its WP14 beam turns and its lamp glows. */
  readonly lamp: THREE.Vector3;
  /** Base height over mean sea level (u), the site's scale, and the lowest and highest ground round the footprint. */
  readonly base: number;
  readonly scale: number;
  readonly low: number;
  readonly high: number;
  readonly matrix: THREE.Matrix4;
  /** The boulders round its foot. */
  readonly rocks: THREE.Matrix4[];
  /** Angle from the lighthouse to its own sea horizon (rad): once it is further beyond the eye's, it has dropped. */
  readonly drop: number;
}

export interface Mooring {
  readonly region: number;
  /** The anchorage (unit direction), the tangent from it out through the mouth, the harbour's radius. */
  readonly pos: THREE.Vector3;
  readonly mouth: THREE.Vector3;
  readonly r: number;
  readonly lamp: THREE.Vector3;
  readonly lampMatrix: THREE.Matrix4;
  readonly rocks: THREE.Matrix4[];
  readonly bollards: THREE.Matrix4[];
  readonly posts: THREE.Matrix4[];
  /** A lagoon harbour's jetty: its runs of dressed coral rag, and the foam lapping their faces. */
  readonly jetty: THREE.Matrix4[];
  readonly lap: THREE.Matrix4[];
}

const unit = (p: V3) => new THREE.Vector3(p.x, p.y, p.z).normalize();
const newSurface = (): Surface => ({ height: 0, normal: new THREE.Vector3(), up: 1, ground: 0, region: 0 });
function seeded(seed: number): () => number {
  let a = seed * 0x9e3779b1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** The tangent frame at unit `up`: f along `facing`, s = up × f. */
function tangents(up: THREE.Vector3, facing: V3): [THREE.Vector3, THREE.Vector3] {
  const f = new THREE.Vector3(facing.x, facing.y, facing.z);
  f.addScaledVector(up, -f.dot(up)).normalize();
  return [f, new THREE.Vector3().crossVectors(up, f)];
}
/** The unit direction `t` u from `up` along the tangent at angle `a` from f toward s. */
const along = (up: THREE.Vector3, f: THREE.Vector3, s: THREE.Vector3, a: number, t: number) =>
  up.clone().multiplyScalar(R).addScaledVector(f, Math.cos(a) * t).addScaledVector(s, Math.sin(a) * t).normalize();
/** A part stood at unit `p`, `h` u over mean sea level: its y up the radius, its z along `fwd` turned `yaw`. */
function stand(p: THREE.Vector3, fwd: THREE.Vector3, h: number, scale: THREE.Vector3, yaw = 0, tilt = 0): THREE.Matrix4 {
  const f = fwd.clone().addScaledVector(p, -fwd.dot(p)).normalize(), s = new THREE.Vector3().crossVectors(p, f);
  const z = f.multiplyScalar(Math.cos(yaw)).addScaledVector(s, Math.sin(yaw)), x = new THREE.Vector3().crossVectors(p, z);
  const m = new THREE.Matrix4().makeBasis(x, p, z).setPosition(p.clone().multiplyScalar(R + h));
  if (tilt) m.multiply(new THREE.Matrix4().makeRotationX(tilt));
  return m.scale(scale);
}
/** A boulder of size `sc` at unit `p`, bedded into the ground (or the sea floor) under it. */
function boulder(p: THREE.Vector3, f: THREE.Vector3, sc: number, rng: () => number, ground: number, rise: number): THREE.Matrix4 {
  const size = new THREE.Vector3(sc * (0.9 + 0.4 * rng()), sc * (0.55 + 0.3 * rng()), sc * (0.9 + 0.4 * rng()));
  return stand(p, f, Math.max(rise, ground - 0.3 * size.y), size, rng() * 6.283, (rng() - 0.5) * 0.4);
}

/** Every headland light's lighthouse, seated on the ground under its centre: its plinth bedded below the lowest ground
 *  round it, and no deeper into the rising ground than the slope forces. */
export function layLighthouses(geo: Geography, field: TerrainField): Tower[] {
  const S = newSurface();
  return geo.lights.map((l, i) => {
    const light = unit(l.pos), [f0, s0] = tangents(light, l.facing), rng = seeded(1000 + i);
    // a light on a cliff's edge is stood back from it until its footprint is ground a plinth can bed in
    let site = { up: light, low: 0, high: Infinity, centre: 0 };
    for (let d = 0; d <= TOWER.setBack && site.high - site.low > TOWER.plinth * 0.7; d += 0.25) {
      const p = d ? along(light, f0, s0, Math.PI, d) : light, [f1, s1] = tangents(p, l.facing), centre = field.surface(p, 0, S).height;
      let low = centre, high = centre;
      for (let k = 0; k < 8; k++) {
        const h = field.surface(along(p, f1, s1, (k * Math.PI) / 4, TOWER.foot), 0, S).height;
        low = Math.min(low, h);
        high = Math.max(high, h);
      }
      if (high - low < site.high - site.low) site = { up: p, low, high, centre };
    }
    const { up, low, high, centre } = site, [f, s] = tangents(up, l.facing);
    const scale = 0.9 + 0.25 * rng(), lift = TOWER.plinth * scale * 0.95;
    const base = Math.min(low + lift, Math.max(high - 1.4 * scale, centre)), lampH = base + TOWER.lamp * scale;
    const rocks = Array.from({ length: 7 }, (_, k) => {
      const p = along(up, f, s, k * 0.9 + rng(), (1.7 + 1.2 * rng()) * scale);
      return boulder(p, f, (0.35 + 0.4 * rng()) * scale, rng, field.surface(p, 0, S).height, -Infinity);
    });
    return {
      region: l.region, up, lamp: up.clone().multiplyScalar(R + lampH), base, scale, low, high, rocks,
      matrix: stand(up, f, base, new THREE.Vector3(scale, scale, scale)),
      drop: Math.acos(R / (R + lampH + 1.2 * scale)),
    };
  });
}

/** Every anchorage's harbour: the shore found by rays, a mole of boulders round the open side to a mouth, the lamp
 *  on the mole head (on the nearest shore in a closed cove), bollards, posts and standing stones to moor to. */
export function layHarbours(geo: Geography, field: TerrainField): Mooring[] {
  const S = newSurface(), n = HARBOUR.rays, step = (2 * Math.PI) / n;
  return geo.harbours.map((hb, index) => {
    const rng = seeded(index + 1), up = unit(hb.pos), [f, s] = tangents(up, hb.facing), r = hb.r, mole = r * HARBOUR.mole;
    // a coral lagoon is its own breakwater (S-021: a ring of boulders inside it read as a necklace of nuggets): no mole,
    // a jetty of dressed coral rag out from the nearest shore instead, the lamp on its head
    // Spice Harbour's mole is built (spiceIsles.ts lays its dressed stone): here only its rubble toe, stones a man can
    // heave, along two short arms from the flanks that leave the mouth wide open (MOLE: angles off the mouth, radius)
    const built = REGIONS[regionOf(hb.pos)]?.id === 'spiceIsles';
    const coral = REGIONS[regionOf(hb.pos)]?.flora.includes('coral') ?? false, k = coral ? 0.4 : built ? 0.3 : 1;
    const ground = (p: THREE.Vector3) => field.surface(p, -TIDE.amp, S).height;
    const shore = Array.from({ length: n }, (_, a) => {
      for (let t = 0.6; t <= 1.6 * r; t += 0.4) if (heightAt(geo, along(up, f, s, a * step, t)) > 0) return t;
      return Infinity;
    });
    const open = shore.map((t) => t > 1.1 * r), allOpen = open.every(Boolean);
    const shoreAt = (a: number): number => {
      for (let t = MOLE.r * r; t <= 2.2 * r; t += 0.25) if (heightAt(geo, along(up, f, s, a, t)) > 0) return t + 0.5;
      return MOLE.r * r;
    };
    // the widest run of open rays is the way out: the mouth at its middle, the mole's arms either side
    let start = 0, len = 0;
    for (let a = 0; a < n; a++) {
      if (!open[a] || open[(a + n - 1) % n]) continue;
      let k = 0;
      while (k < n && open[(a + k) % n]) k++;
      if (k > len) [start, len] = [a, k];
    }
    const mouthA = allOpen ? 0 : (start + (len - 1) / 2) * step, half = allOpen ? 0.4 : Math.min(0.4, len * step * 0.2);
    const arms: [number, number, number][] = []; // land end angle, mouth end angle, land end radius
    if (built) arms.push([-MOLE.land, -MOLE.mouth, shoreAt(-MOLE.land)], [MOLE.land, MOLE.mouth, shoreAt(MOLE.land)]);
    else if (coral) { /* the jetty, below */ }
    else if (allOpen) arms.push([mouthA - half - HARBOUR.arm, mouthA - half, mole], [mouthA + half + HARBOUR.arm, mouthA + half, mole]);
    else if (len > 0) {
      arms.push([(start - 0.5) * step, mouthA - half, Math.min(shore[(start + n - 1) % n] + 0.6, 1.2 * r)]);
      arms.push([(start + len - 0.5) * step, mouthA + half, Math.min(shore[(start + len) % n] + 0.6, 1.2 * r)]);
    }
    const rocks: THREE.Matrix4[] = [], bollards: THREE.Matrix4[] = [], posts: THREE.Matrix4[] = [], jetty: THREE.Matrix4[] = [], lap: THREE.Matrix4[] = [];
    let head: { p: THREE.Vector3; top: number; span: number } | null = null;
    const nearest = shore.reduce((b, t, a) => (t < shore[b] ? a : b), 0);
    if (coral && shore[nearest] < Infinity) {
      // from half a pace up the shore out over the water, its runs standing on the floor (their footing bedded), the
      // coping clear of high water; rubble at the foot of each face, a bollard every other run, the lamp on the head
      const a = nearest * step, from = shore[nearest] + 0.5, to = Math.max(JETTY.reach * r, shore[nearest] - JETTY.long);
      const n = Math.max(2, Math.round((from - to) / JETTY.run)), len = (from - to) / n;
      const dir = f.clone().multiplyScalar(Math.cos(a)).addScaledVector(s, Math.sin(a));
      for (let i = 0; i < n; i++) {
        const t = from - (i + 0.5) * len, p = along(up, f, s, a, t), g = ground(p);
        jetty.push(stand(p, dir, JETTY.coping, new THREE.Vector3(1, Math.max(0.4, (JETTY.coping - g + 0.3) / 1.6), len * 1.04)));
        if (g < -TIDE.amp) lap.push(stand(p, dir, 0, new THREE.Vector3(1, 1, len)));
        for (const side of [-1, 1]) {
          const q = along(up, f, s, a + side * (JETTY.half + 0.15 + 0.2 * rng()) / t, t + (rng() - 0.5) * len);
          rocks.push(boulder(q, f, (0.6 + 0.5 * rng()) * k, rng, ground(q), -Infinity));
        }
        if (i % 2 === 1) bollards.push(stand(along(up, f, s, a + ((i % 4 === 1 ? 1 : -1) * (JETTY.half - 0.25)) / t, t), f, JETTY.coping, new THREE.Vector3(0.7, 0.7, 0.7), rng() * 6.283));
      }
      // the head: a last run across the line, wider, the lamp on it
      const p = along(up, f, s, a, to + 0.1);
      jetty.push(stand(p, dir, JETTY.coping, new THREE.Vector3(1.5, Math.max(0.4, (JETTY.coping - ground(p) + 0.3) / 1.6), 1.25)));
      lap.push(stand(p, dir, 0, new THREE.Vector3(1.5, 1, 1.25)));
      head = { p, top: JETTY.coping, span: 0 };
    }
    for (const [landA, mouthEnd, landR] of arms) {
      let from = landA, rFrom = landR;
      if (Math.abs(mouthEnd - from) > HARBOUR.arm) [from, rFrom] = [mouthEnd - Math.sign(mouthEnd - from) * HARBOUR.arm, mole];
      const end = built ? MOLE.r * r : mole, span = mouthEnd - from, count = Math.max(2, Math.ceil((Math.abs(span) * end) / (HARBOUR.spacing * k)));
      for (let i = 0; i <= count; i++) {
        const u = i / count, a = from + span * u, rad = THREE.MathUtils.lerp(rFrom, end, u * u * (3 - 2 * u));
        if (built) {
          // the toe: stones either side of the dressed wall, under its face; the head's lamp on the coping
          for (const side of [-1, 1]) for (let j = 0; j < 2; j++) {
            const p = along(up, f, s, a + (rng() - 0.5) * 0.05, rad + side * (MOLE.half + 0.25 * rng()));
            rocks.push(boulder(p, f, (0.8 + 0.6 * rng()) * k, rng, ground(p), -Infinity));
          }
          const p = along(up, f, s, a, rad);
          if (i === count && (!head || Math.abs(span) > head.span)) head = { p, top: MOLE.coping, span: Math.abs(span) };
          else if (i % 3 === 1) bollards.push(stand(p, f, MOLE.coping - 0.05, new THREE.Vector3(0.7, 0.7, 0.7), rng() * 6.283));
          continue;
        }
        for (let row = 0; row < 3; row++) {
          if (row && rng() < 0.35) continue;
          const sc = (i === count && !row ? 1.7 : 0.8 + 0.55 * rng()) * (row ? 0.6 : 1) * k;
          const p = along(up, f, s, a + (rng() - 0.5) * 0.04, rad + (row ? (row === 1 ? -1 : 1) * (0.8 + 0.3 * rng()) * k : (rng() - 0.5) * 0.4 * k));
          const m = boulder(p, f, sc, rng, ground(p), 0.2 + 0.3 * rng()), top = m.elements[12] * p.x + m.elements[13] * p.y + m.elements[14] * p.z - R;
          rocks.push(m);
          const crown = top + 0.75 * new THREE.Vector3().setFromMatrixColumn(m, 1).length();
          if (i === count && !row && (!head || Math.abs(span) > head.span)) head = { p, top: crown, span: Math.abs(span) };
          else if (!row && i % 4 === 2) bollards.push(stand(p, f, crown - 0.05, new THREE.Vector3(1, 1, 1), rng() * 6.283));
        }
      }
    }
    // rocks along the waterline of the sheltered shore, and something to moor to at the water's edge
    const land = shore.map((t, a) => ({ t, a })).filter((x) => x.t < Infinity).sort((x, y) => x.t - y.t), taken: number[] = [];
    for (const { t, a } of land) {
      if (!built && rng() < 0.6) {
        const p = along(up, f, s, (a + rng() - 0.5) * step, t + (rng() - 0.6) * 0.8);
        rocks.push(boulder(p, f, (0.35 + 0.45 * rng()) * k, rng, ground(p), -Infinity));
      }
      if (taken.length >= Math.min(5, Math.max(2, hb.moorings))) continue;
      if (taken.some((b) => Math.min(Math.abs(a - b), n - Math.abs(a - b)) < 2)) continue;
      taken.push(a);
      const p = along(up, f, s, a * step, t - 0.4), h = ground(p);
      if (taken.length % 2) posts.push(stand(p, f, h, new THREE.Vector3(1, 1, 1), rng() * 6.283, (rng() - 0.5) * 0.25));
      else rocks.push(stand(p, f, h + 0.3, new THREE.Vector3(0.32, 0.85, 0.32), rng() * 6.283));
    }
    let lampP: THREE.Vector3, lampH: number;
    if (head) [lampP, lampH] = [head.p, head.top];
    else {
      const near = land[0] ?? { t: 0, a: 0 };
      lampP = along(up, f, s, near.a * step, near.t + 0.8);
      lampH = ground(lampP);
    }
    return {
      region: hb.region, pos: up, r, rocks, bollards, posts, jetty, lap,
      mouth: f.clone().multiplyScalar(Math.cos(mouthA)).addScaledVector(s, Math.sin(mouthA)),
      lamp: lampP.clone().multiplyScalar(R + lampH + HARBOUR.lamp),
      lampMatrix: stand(lampP, f, lampH, new THREE.Vector3(1, 1, 1)),
    };
  });
}

/** The boulders heaped at the foot of every point the sea has bared (terrain.ts EXPOSED, S-028 (1)): `per` expected
 *  per cell of the territory grid where the shore is bared, from just under the highest water (`low` u: never standing
 *  out in the sea without its foam) up to `high` u, the largest lowest; in heaps of `heap` cells a side, each seen within `near` u of the eye. */
export const SHORE_ROCKS = { per: 0.4, low: TIDE.amp - 0.15, high: 1.3, size: [0.12, 0.45], heap: 16, near: 110 } as const;
export interface Heap {
  readonly region: number;
  readonly up: THREE.Vector3;
  /** Its first boulder's seat on the sphere of radius R. */
  readonly pos: THREE.Vector3;
  readonly rocks: THREE.Matrix4[];
}
export function layShoreRocks(geo: Geography, field: TerrainField): Heap[] {
  const N = TERRITORY.n, NN = N * N, H = field.relief, S = newSurface(), heaps = new Map<number, Heap>(), d = { x: 0, y: 0, z: 0 };
  const exposed = REGIONS.map((r) => exposedOf(r) > 0), ang = (x: number) => Math.tan(((x / N) * 2 - 1) * (Math.PI / 4));
  for (let c = 0; c < H.length; c++) {
    const ri = geo.region[c], h = H[c];
    if (!exposed[ri] || h < SHORE_ROCKS.low - 0.4 || h > SHORE_ROCKS.high || Math.abs(geo.coast[c]) > 3) continue;
    const f = Math.floor(c / NN), j = Math.floor((c % NN) / N), i = c % N;
    gnomonicDir(f, ang(i + 0.5), ang(j + 0.5), d);
    const bare = sandTops(REGIONS[ri], shoreExposure(geo, d, ri))[2];
    if (bare < 0.6) continue;
    const rng = seeded(c + 7919), n = Math.floor(SHORE_ROCKS.per * bare * (1.3 - 0.6 * smoothstep(SHORE_ROCKS.low, SHORE_ROCKS.high, h)) + rng());
    for (let k = 0; k < n; k++) {
      gnomonicDir(f, ang(i + rng()), ang(j + rng()), d);
      const p = unit(d), g = field.surface(p, 0, S).height;
      if (g < SHORE_ROCKS.low || g > SHORE_ROCKS.high || S.up < 0.5) continue;
      const lo = 1 - smoothstep(SHORE_ROCKS.low, SHORE_ROCKS.high, g), t = rng();
      const sc = SHORE_ROCKS.size[0] + (SHORE_ROCKS.size[1] - SHORE_ROCKS.size[0]) * t * t * (0.45 + 0.55 * lo);
      const key = f * 1e6 + Math.floor(j / SHORE_ROCKS.heap) * 1e3 + Math.floor(i / SHORE_ROCKS.heap);
      let heap = heaps.get(key);
      if (!heap) heaps.set(key, (heap = { region: ri, up: p.clone(), pos: p.clone().multiplyScalar(R), rocks: [] }));
      heap.rocks.push(boulder(p, tangents(p, Math.abs(p.y) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 })[0], sc, rng, g, -Infinity));
    }
  }
  return [...heaps.values()];
}
const smoothstep = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// ---------------------------------------------------------------------------------------------------------------
// Drawing

/** One instanced draw of a kit, each instance with its region's stone and accent. */
class Instances {
  readonly mesh: THREE.InstancedMesh;
  private readonly stone: THREE.InstancedBufferAttribute;
  private readonly accent: THREE.InstancedBufferAttribute;

  constructor(geometry: THREE.BufferGeometry, material: THREE.Material, capacity: number) {
    const c = Math.max(capacity, 1);
    this.stone = new THREE.InstancedBufferAttribute(new Float32Array(c * 3), 3);
    this.accent = new THREE.InstancedBufferAttribute(new Float32Array(c * 3), 3);
    geometry.setAttribute('aStone', this.stone);
    geometry.setAttribute('aAccent', this.accent);
    this.mesh = new THREE.InstancedMesh(geometry, material, c);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
  }

  set(k: number, m: THREE.Matrix4, stone: THREE.Vector3, accent: THREE.Vector3): void {
    this.mesh.setMatrixAt(k, m);
    this.stone.setXYZ(k, stone.x, stone.y, stone.z);
    this.accent.setXYZ(k, accent.x, accent.y, accent.z);
  }

  commit(count: number): void {
    this.mesh.count = count;
    this.mesh.visible = count > 0;
    this.mesh.instanceMatrix.needsUpdate = this.stone.needsUpdate = this.accent.needsUpdate = true;
  }

  get triangles(): number {
    return (this.mesh.geometry.index!.count / 3) * this.mesh.count;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.mesh.dispose();
  }
}

export class Structures {
  readonly group = new THREE.Group();
  readonly towers: Tower[];
  readonly harbours: Mooring[];
  readonly heaps: Heap[];
  private readonly material: THREE.ShaderMaterial;
  private readonly masonry: THREE.ShaderMaterial;
  private readonly lapping: THREE.ShaderMaterial;
  /** Near and far lighthouses, rocks, bollards, posts, harbour lamps, lagoon jetties and their foam: eight draw calls. */
  private readonly draws: Instances[];
  private readonly stone: THREE.Vector3[];
  private readonly rag: THREE.Vector3;
  private readonly accent: THREE.Vector3[];
  private readonly dark: THREE.Vector3[];
  /** Per lighthouse 0 dropped, 1 near, 2 far; then per harbour 0 dropped, 1 seen. */
  private readonly state: Int8Array;
  private readonly lamps: Lamp[];
  private readonly lights: Lights;
  private readonly eye = new THREE.Vector3();
  private horizon = 0;

  /** `level`: the sea's level uniform (the tide), shared so a jetty's foam laps its faces at every tide. */
  constructor(style: Style, geo: Geography, field: TerrainField, lights: Lights, beams: Beams, level: { value: number } = { value: 0 }) {
    this.towers = layLighthouses(geo, field);
    this.towers.forEach((t, i) => beams.seat(i, t.lamp));
    this.harbours = layHarbours(geo, field);
    this.heaps = layShoreRocks(geo, field);
    this.lights = lights;
    this.material = illustratedMaterial(style, { pigment: PIGMENTS.ochre, painted: true, anchor: 'object', side: THREE.DoubleSide });
    // the harbour lamps' pillars in coursed masonry (their stone-tinted parts), the boulders and bollards natural stone
    this.masonry = illustratedMaterial(style, { pigment: PIGMENTS.ochre, painted: true, anchor: 'object', side: THREE.DoubleSide, surface: masonrySurface(false) });
    // the foam round a jetty floats on the tide: its parts raised by the sea's level along their up (scaled 1 there)
    this.lapping = illustratedMaterial(style, { pigment: PIGMENTS.ochre, painted: true, anchor: 'object', side: THREE.DoubleSide });
    const vs = this.lapping.vertexShader, at = 'vec4 w = model * vec4(position, 1.0);';
    if (!vs.includes(at) || !vs.includes('void main() {')) throw new Error('Structures: the illustrated vertex shader changed; the jetty foam cannot ride the tide');
    this.lapping.vertexShader = vs.replace('void main() {', 'uniform float uLevel;\nvoid main() {').replace(at, 'vec4 w = model * vec4(position + vec3(0.0, uLevel + 0.03, 0.0), 1.0);');
    this.lapping.uniforms.uLevel = level;
    // the region's land pigment lightened toward a warm limestone, and its accent for the band
    this.stone = REGIONS.map((r) => transmittanceVec(PIGMENTS[r.pigments.land]).lerp(transmittanceVec(PIGMENTS.ochre), 0.45));
    // a lagoon harbour's stone is the reef's own: coral rag, bleached cream-grey (never the land's golden limestone)
    this.rag = transmittanceVec(mix(mix(PIGMENTS.leadWhite, PIGMENTS.ochre, 0.32), PIGMENTS.sepia, 0.14));
    this.accent = REGIONS.map((r) => transmittanceVec(PIGMENTS[r.pigments.accent]));
    // a bared point's boulders are the shore's own dark rock (terrain.ts: the crags' rock, the sea's wet band low on each)
    this.dark = REGIONS.map((r) => { const t = transmittanceVec(mix(mix(PIGMENTS[r.pigments.land], PIGMENTS.sepia, 0.6), PIGMENTS.ultramarine, 0.3)); return t.set(t.x ** 3, t.y ** 3, t.z ** 3); });
    const t = this.towers.length, hs = this.harbours, sum = <T>(xs: T[], k: (x: T) => number) => xs.reduce((a, x) => a + k(x), 0);
    this.draws = [
      new Instances(lighthouseKit(), this.material, t),
      new Instances(farKit(), this.material, t),
      new Instances(rockKit(), this.material, sum(hs, (m) => m.rocks.length) + sum(this.towers, (tw) => tw.rocks.length) + sum(this.heaps, (hp) => hp.rocks.length)),
      new Instances(bollardKit(), this.material, sum(hs, (m) => m.bollards.length)),
      new Instances(postKit(), this.material, sum(hs, (m) => m.posts.length)),
      new Instances(lampKit(), this.masonry, hs.length),
      new Instances(jettyKit(), this.masonry, sum(hs, (m) => m.jetty.length)),
      new Instances(lapKit(), this.lapping, sum(hs, (m) => m.lap.length)),
    ];
    this.lamps = hs.map((h) => lights.add({ pos: h.lamp, reach: HARBOUR.reach }));
    this.state = new Int8Array(t + hs.length + this.heaps.length).fill(-1);
    this.group.add(...this.draws.map((d) => d.mesh));
  }

  /** Each lighthouse whole near the eye and a silhouette further off; lighthouses and harbours left out once they
   *  have dropped below the eye's horizon (instances are rewritten only when that changes). */
  update(eye: THREE.Vector3): void {
    this.eye.copy(eye);
    this.horizon = Math.acos(Math.min(1, R / eye.length()));
    const t = this.towers.length;
    let changed = false;
    for (let i = 0; i < this.state.length; i++) {
      let c: number;
      if (i < t) {
        const tw = this.towers[i];
        c = this.dropped(tw.up, tw.drop) ? 0 : tw.lamp.distanceTo(eye) < TOWER.near * (this.state[i] === 1 ? 1.1 : 1) ? 1 : 2;
      } else if (i < t + this.harbours.length) {
        const h = this.harbours[i - t];
        c = this.dropped(h.pos, Math.acos(R / h.lamp.length())) ? 0 : 1;
      } else {
        const hp = this.heaps[i - t - this.harbours.length];
        c = this.dropped(hp.up, 0.01) || hp.pos.distanceTo(this.eye) > SHORE_ROCKS.near * (this.state[i] === 1 ? 1.1 : 1) ? 0 : 1;
      }
      if (c !== this.state[i]) [this.state[i], changed] = [c, true];
    }
    if (changed) this.refill();
  }

  /** Whether a thing at unit `up`, `drop` rad from its own sea horizon, lies below the eye's. */
  private dropped(up: THREE.Vector3, drop: number): boolean {
    return Math.acos(THREE.MathUtils.clamp(up.dot(this.eye) / this.eye.length(), -1, 1)) > this.horizon + drop;
  }

  private refill(): void {
    const [near, far, rocks, bollards, posts, lamps, jetty, lap] = this.draws, c = [0, 0, 0, 0, 0, 0, 0, 0], t = this.towers.length;
    this.towers.forEach((tw, i) => {
      const v = this.state[i], st = this.stone[tw.region], ac = this.accent[tw.region];
      if (!v) return;
      (v === 1 ? near : far).set(c[v - 1]++, tw.matrix, st, ac);
      for (const m of tw.rocks) rocks.set(c[2]++, m, st, ac);
    });
    this.harbours.forEach((h, k) => {
      const st = REGIONS[h.region].flora.includes('coral') ? this.rag : this.stone[h.region], ac = this.accent[h.region];
      if (!this.state[t + k]) return;
      for (const m of h.rocks) rocks.set(c[2]++, m, st, ac);
      for (const m of h.bollards) bollards.set(c[3]++, m, st, ac);
      for (const m of h.posts) posts.set(c[4]++, m, st, ac);
      lamps.set(c[5]++, h.lampMatrix, st, ac);
      for (const m of h.jetty) jetty.set(c[6]++, m, st, ac);
      for (const m of h.lap) lap.set(c[7]++, m, st, ac);
    });
    this.heaps.forEach((hp, k) => {
      if (this.state[t + this.harbours.length + k]) for (const m of hp.rocks) rocks.set(c[2]++, m, this.dark[hp.region], this.accent[hp.region]);
    });
    this.draws.forEach((d, j) => d.commit(c[j]));
  }

  /** Triangles submitted this frame. */
  get triangles(): number {
    return this.draws.reduce((a, d) => a + d.triangles, 0);
  }

  dispose(): void {
    for (const l of this.lamps) this.lights.remove(l);
    for (const d of this.draws) d.dispose();
    this.material.dispose();
    this.masonry.dispose();
    this.lapping.dispose();
  }
}

/** The composition root's lighthouses and harbours (MODULES): they stand on the terrain and light the sky's lamps. */
export function createStructures(ctx: RenderContext): RenderModule {
  const sky = skies.get(ctx.scene), terrain = terrains.get(ctx.scene);
  if (!sky || !terrain) throw new Error('createStructures: the sky and the terrain are built first (MODULES order)');
  const structures = new Structures(ctx.pipeline.style, ctx.world.geo, terrain.field, sky.lights, sky.beams, seas.get(ctx.scene)?.swell.uniforms.uSeaLevel);
  ctx.scene.add(structures.group);
  return {
    frame() {
      structures.update(ctx.camera.position);
    },
    dispose() {
      ctx.scene.remove(structures.group);
      structures.dispose();
    },
  };
}

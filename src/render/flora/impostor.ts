// Octahedral impostors for the plants in the distance (Brucks, "Realistic Foliage Imposter and Forest Rendering in
// UE4", GDC 2018). Each variant of a tall plant is drawn once, at load, from 8 × 8 directions over the upper
// hemisphere, laid out on a hemi-octahedron so that neighbouring cells look from neighbouring directions; what is
// kept per texel is the plant's own colour and coverage, and its normal, how much light comes through it and its
// depth, in that view's own frame. A copy far enough away is then one quad turned to the eye: the three views nearest
// the direction it is seen from are found on the grid, the quad's pixel is followed into each view's plane (so the
// views agree on where a branch is), and the three are blended by how near each is. Its normal comes back into the
// world and it is lit as the other levels are, by the sun, the sky and the shadows, its leaves letting light through
// from behind; snow and rain lie on it as they do on the plant.
//
// The bake draws every view of a variant in one instanced draw per mesh: each instance is one view, and its vertex
// stage projects the plant orthographically along that view straight into the view's cell of the variant's slot in the
// atlas, so the whole forest is baked in a few dozen draws into one render target with two textures (Wronski's MRT
// impostor bake does the same with a camera per view). Colour is kept as its square root, for the dark greens' sake
// in eight bits.
import {
  Color, DoubleSide, LinearFilter, LinearMipmapLinearFilter, Mesh, MeshBasicNodeMaterial, OrthographicCamera, RenderTarget, Scene,
  UnsignedByteType, type BufferGeometry, type Material, type MeshStandardMaterial, type Node, type Texture, type WebGPURenderer,
} from 'three/webgpu';
import {
  Discard, Fn, If, abs, attribute, cameraPosition, cameraViewMatrix, cross, dFdx, dFdy, diffuseColor, dot, float, floor, fract,
  instanceIndex, length, log2, max, min, mix, mrt, normalGeometry, normalize, positionGeometry, positionPrevious, positionWorld,
  select, smoothstep, sqrt, step, texture, uv, varying, vec2, vec3, vec4,
} from 'three/tsl';
import { P } from '../gpu/uniforms.ts';
import { FloraNodeMaterial, copyOf, door, turn, unturn, type FieldNodes } from './nodes.ts';
import { tagOf } from './tag.ts';

type F = Node<'float'>;
type V2 = Node<'vec2'>;
type V3 = Node<'vec3'>;
type V4 = Node<'vec4'>;

/** Views along each side of the grid, and texels along each side of a view. */
export const VIEWS = 8;
const TEXELS = 64;
/** A variant's slot in the atlas, texels square. */
const SLOT = VIEWS * TEXELS;
/** How many texels tall a plant may stand on screen before its impostor is too soft to show it: the impostor takes
 *  over where the plant's bounding sphere would cover this many pixels of a view as wide as it is tall. */
export const SHARP = 80;

/** The direction a point of the unit square stands for on the hemi-octahedron (y ≥ 0). */
function hemiOct(g: V2): V3 {
  const c = g.mul(2).sub(1);
  const x = c.x.add(c.y).mul(0.5), z = c.x.sub(c.y).mul(0.5);
  return normalize(vec3(x, float(1).sub(abs(x)).sub(abs(z)), z));
}

/** The point of the unit square a direction (y ≥ 0) stands at. */
function hemiOctOf(d: V3): V2 {
  const s = d.div(abs(d.x).add(abs(d.y)).add(abs(d.z)));
  return vec2(s.x.add(s.z), s.x.sub(s.z)).mul(0.5).add(0.5);
}

/** A view's frame: across and up its picture, for a view looking back along `f`. */
function frameOf(f: V3): { x: V3; y: V3 } {
  const x = normalize(cross(vec3(0, 1, 0), f));
  return { x, y: cross(f, x) };
}

/** The view a cell of the grid holds. */
const viewAt = (cell: V2): V3 => hemiOct(cell.add(0.5).div(VIEWS));

/** One variant to bake: its meshes in the plant's frame, the sphere round it (centre up its axis, and radius), and
 *  its slot in the atlas. */
export interface ImpostorSource {
  slot: number;
  parts: readonly { material: Material; geometry: BufferGeometry }[];
  centre: number;
  radius: number;
}

export class ImpostorAtlas {
  readonly target: RenderTarget;
  /** Slots along each side. */
  readonly side: number;
  baked = false;

  constructor(count: number) {
    this.side = Math.max(1, Math.ceil(Math.sqrt(count)));
    const size = this.side * SLOT;
    this.target = new RenderTarget(size, size, { count: 2, type: UnsignedByteType, depthBuffer: true });
    const [albedo, info] = this.target.textures;
    albedo.name = 'albedo';
    info.name = 'info';
    for (const t of this.target.textures) {
      t.generateMipmaps = true;
      t.minFilter = LinearMipmapLinearFilter;
      t.magFilter = LinearFilter;
    }
  }

  get albedo(): Texture {
    return this.target.textures[0];
  }

  get info(): Texture {
    return this.target.textures[1];
  }

  /** Where slot `n` sits, in slots across and up. */
  slotAt(n: number): [number, number] {
    return [n % this.side, Math.floor(n / this.side)];
  }

  /** Draws every variant's views into the atlas, all at once. */
  bake(renderer: WebGPURenderer, sources: readonly ImpostorSource[]): void {
    const scene = new Scene();
    const made: Material[] = [];
    for (const s of sources) {
      const slot = this.slotAt(s.slot);
      for (const p of s.parts) {
        // (the drips falling from leaf tips are not part of the plant's picture)
        if (!tagOf(p.material)) continue;
        if (!p.geometry.getAttribute('normal')) p.geometry.computeVertexNormals();
        const m = bakeMaterial(p.material, p.geometry, slot, this.side, s.centre, s.radius);
        made.push(m);
        const mesh = new Mesh(p.geometry, m);
        mesh.count = VIEWS * VIEWS;
        mesh.frustumCulled = false;
        scene.add(mesh);
      }
    }
    const camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const was = renderer.getRenderTarget(), mrtWas = renderer.getMRT(), autoWas = renderer.autoClear;
    const clearWas = renderer.getClearColor(new Color()), alphaWas = renderer.getClearAlpha();
    renderer.setMRT(null);
    renderer.setRenderTarget(this.target);
    renderer.setClearColor(0x000000, 0);
    renderer.autoClear = true;
    renderer.render(scene, camera);
    renderer.setRenderTarget(was);
    renderer.setMRT(mrtWas);
    renderer.setClearColor(clearWas, alphaWas);
    renderer.autoClear = autoWas;
    for (const m of made) m.dispose();
    for (const s of sources) for (const p of s.parts) p.geometry.dispose();
    this.baked = true;
  }
}

/**
 * The material a plant's mesh is baked with: its colour as the kit made it (map, colour, vertex colours) and its
 * cut-out, unlit, written into the atlas with its normal in each view's frame. Instance n is view n.
 */
function bakeMaterial(src: Material, g: BufferGeometry, slot: [number, number], side: number, centre: number, radius: number): MeshBasicNodeMaterial {
  const s = src as MeshStandardMaterial, t = tagOf(src);
  const m = new MeshBasicNodeMaterial();
  m.name = 'flora:bake';
  m.map = s.map ?? null;
  if (s.color) m.color.copy(s.color);
  m.vertexColors = g.hasAttribute('color');
  m.side = DoubleSide;
  const cutout = t?.cutout !== undefined && !!s.map;
  m.alphaTest = cutout ? 0.4 : s.alphaTest || 0;
  if (cutout) {
    // the cards' coverage kept at the size a view sees them (as the plant's own material keeps it in the distance)
    const size = vec2((t!.cutout as number) > 0 ? (t!.cutout as number) : 512);
    m.opacityNode = Fn(() => {
      const fx = dFdx(uv().mul(size)), fy = dFdy(uv().mul(size));
      return log2(max(dot(fx, fx), dot(fy, fy))).mul(0.5).max(0).mul(0.3).add(1);
    })();
  }

  const k = instanceIndex;
  const cell = vec2(float(k.mod(VIEWS)), float(k.div(VIEWS)));
  const f = viewAt(cell), fr = frameOf(f);
  const p = positionGeometry.sub(vec3(0, centre, 0));
  m.vertexNode = Fn(() => {
    const x = dot(p, fr.x).div(radius), y = dot(p, fr.y).div(radius), z = dot(p, f).div(radius);
    const X = x.mul(0.5).add(0.5).add(cell.x).div(VIEWS).add(slot[0]).div(side).mul(2).sub(1);
    const Y = y.mul(0.5).add(0.5).add(cell.y).div(VIEWS).add(slot[1]).div(side).mul(2).sub(1);
    return vec4(X, Y, z.mul(-0.5).add(0.5), 1);
  })();
  const n0 = varying(vec3(dot(normalGeometry, fr.x), dot(normalGeometry, fr.y), dot(normalGeometry, f)), 'vBakeN') as unknown as V3;
  const depth = varying(dot(p, f).div(radius), 'vBakeZ') as unknown as F;
  const n1 = normalize(n0);
  // a card seen from behind shows its other face, turned to the eye; a crown's cards keep the crown's normal
  const n = t?.crownNormals ? n1 : select(n1.z.lessThan(0), n1.negate(), n1);
  const through = float(t?.translucency ?? 0);
  m.mrtNode = mrt({
    albedo: vec4(sqrt(max(diffuseColor.rgb, 0)), 1),
    info: vec4(n.xy.mul(0.5).add(0.5), through, depth.mul(0.5).add(0.5)),
  });
  return m;
}

/**
 * The impostors' material: one quad a copy, turned to the eye, showing the three views nearest the way it is seen
 * from, blended. Its vertices carry aImp: the variant's slot (across, up), its sphere's radius and centre height.
 */
export function impostorMaterial(f: FieldNodes, atlas: ImpostorAtlas): Material {
  const m = new FloraNodeMaterial();
  m.name = 'flora:impostor';
  m.side = DoubleSide;
  m.roughness = 0.85;
  m.metalness = 0;
  m.alphaTest = 0.5;

  const c = copyOf(f);
  const imp = attribute<'vec4'>('aImp') as unknown as V4;
  const R = imp.z;
  const up = turn(c.q, vec3(0, 1, 0));
  const centre = c.at.add(up.mul(imp.w.mul(c.size)));
  const toEye = cameraPosition.sub(centre);
  const e = normalize(toEye);
  // the quad: across the line of sight, its up the plant's own (or, looking straight down on it, the way it faces)
  const lift = up.sub(e.mul(dot(up, e)));
  const ahead = turn(c.q, vec3(0, 0, 1));
  const ub = normalize(select(dot(lift, lift).greaterThan(1e-6), lift, ahead.sub(e.mul(dot(ahead, e)))));
  const rb = cross(ub, e);
  const corner = positionGeometry.xy;
  const world = centre.add(rb.mul(corner.x).add(ub.mul(corner.y)).mul(R.mul(c.size)));
  m.positionNode = Fn(() => {
    const at = world.toVar();
    positionPrevious.assign(at);
    return at;
  })();

  // the views: the eye in the plant's frame (from its centre, at its size), on the grid
  const eyeL = unturn(c.q, toEye).div(c.size);
  const look = normalize(vec3(eyeL.x, max(eyeL.y, 0.001), eyeL.z));
  const g = hemiOctOf(look).mul(VIEWS).sub(0.5).clamp(0, VIEWS - 1);
  const base = min(floor(g), VIEWS - 2), fr = g.sub(base);
  const upper = fr.x.greaterThan(fr.y);
  const k0 = base, k1 = base.add(select(upper, vec2(1, 0), vec2(0, 1))), k2 = base.add(1);
  const w = select(upper, vec3(float(1).sub(fr.x), fr.x.sub(fr.y), fr.y), vec3(float(1).sub(fr.y), fr.y.sub(fr.x), fr.x));
  // this corner's ray from the eye, followed into each view's plane through the centre
  const ray = unturn(c.q, world.sub(centre)).div(c.size).sub(eyeL);
  const onView = (k: V2): V2 => {
    const v = viewAt(k), b = frameOf(v);
    const hit = eyeL.add(ray.mul(dot(eyeL, v).negate().div(dot(ray, v))));
    return vec2(dot(hit, b.x), dot(hit, b.y)).div(R).mul(0.5).add(0.5);
  };
  // (packed four to a varying: a vertex stage may hand on only sixteen)
  const vA = varying(vec4(onView(k0), onView(k1)), 'vImpA') as unknown as V4;
  const vB = varying(vec4(onView(k2), k0), 'vImpB') as unknown as V4;
  const vC = varying(vec4(w, R.mul(c.size)), 'vImpC') as unknown as V4;
  const vD = varying(vec4(imp.xy, c.shown, c.odd), 'vImpD') as unknown as V4;
  const vE = varying(vec4(select(upper, float(1), float(0)), fract(float(c.id).mul(0.6180339887)), 0, 0), 'vImpE') as unknown as V4;
  const vQ = varying(c.q, 'vImpQ') as unknown as V4;
  const vK0 = vB.zw, vK1 = vK0.add(select(vE.x.greaterThan(0.5), vec2(1, 0), vec2(0, 1))), vK2 = vK0.add(1);
  const vW = vC.xyz, vR = vC.w, vSlot = vD.xy, vShown = vD.z, vOdd = vD.w, vSeed = vE.y;

  // ---- the three views, blended by nearness and each by its own coverage
  const side = atlas.side;
  const sample = (k: V2, u: V2, wk: F) => {
    const inside = step(0, u.x).mul(step(0, u.y)).mul(step(u.x, 1)).mul(step(u.y, 1));
    const a = vSlot.add(k.add(u.clamp(0.002, 0.998)).div(VIEWS)).div(side);
    const at = vec2(a.x, float(1).sub(a.y));
    const col = texture(atlas.albedo, at) as unknown as V4, info = texture(atlas.info, at) as unknown as V4;
    const cover = col.a.mul(inside).mul(wk);
    const v = viewAt(k), b = frameOf(v);
    const nf = info.xy.mul(2).sub(1);
    const n = b.x.mul(nf.x).add(b.y.mul(nf.y)).add(v.mul(sqrt(max(float(1).sub(dot(nf, nf)), 0))));
    return { cover, rgb: col.rgb.mul(col.rgb), n, through: info.z, depth: info.w.mul(2).sub(1), at };
  };
  const s0 = sample(vK0, vA.xy, vW.x), s1 = sample(vK1, vA.zw, vW.y), s2 = sample(vK2, vB.xy, vW.z);
  const cover = s0.cover.add(s1.cover).add(s2.cover).toVar('impCover');
  const share = max(cover, 1e-4);
  const blend = <T extends Node>(f0: T, f1: T, f2: T): T =>
    (f0 as unknown as V3).mul(s0.cover).add((f1 as unknown as V3).mul(s1.cover)).add((f2 as unknown as V3).mul(s2.cover)).div(share) as unknown as T;
  const rgb = blend(s0.rgb, s1.rgb, s2.rgb);
  const nLocal = normalize(blend(s0.n, s1.n, s2.n).add(vec3(0, 1e-4, 0)));
  const through = blend(s0.through as unknown as V3, s1.through as unknown as V3, s2.through as unknown as V3) as unknown as F;
  const depth = blend(s0.depth as unknown as V3, s1.depth as unknown as V3, s2.depth as unknown as V3) as unknown as F;
  const nWorld = normalize(turn(vQ, nLocal)).toVar('impN');

  m.normalNode = normalize(cameraViewMatrix.mul(vec4(nWorld, 0)).xyz);
  m.colorNode = Fn(() => {
    const col = rgb.mul(vSeed.mul(0.22).add(0.89)).toVar();
    // snow settling on what faces up, rain darkening it, as on the plants themselves
    const skyward = dot(nWorld, normalize(positionWorld)).clamp(0, 1);
    const snow = smoothstep(0.35, 0.8, skyward).mul(P.snow).mul(smoothstep(-0.5, 0.5, length(positionWorld).sub(P.planet.y)));
    col.assign(mix(col, vec3(0.86, 0.89, 0.93), snow.mul(0.85)));
    col.mulAssign(mix(1, 0.72, P.rain.mul(skyward.mul(0.6).add(0.4))));
    return col;
  })();
  m.through = through.mul(0.8);
  // the shadows it receives are read where its pixel really stands, before or behind the quad
  m.receivedShadowPositionNode = positionWorld.add(normalize(cameraPosition.sub(positionWorld)).mul(depth.mul(vR)));
  m.opacityNode = Fn(() => {
    // the coverage a view's mip averages away in the distance, kept (Castaño, as the plants' cards do)
    const px = s0.at.mul(side * SLOT);
    const fx = dFdx(px), fy = dFdy(px);
    const keep = log2(max(dot(fx, fx), dot(fy, fy))).mul(0.5).max(0).mul(0.25).add(1);
    const nd = door();
    If(select(vOdd.greaterThan(0.5), nd.oneMinus(), nd).greaterThanEqual(vShown), () => {
      Discard();
    });
    return cover.mul(keep);
  })();
  return m;
}

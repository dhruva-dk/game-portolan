// The plants' materials as nodes. Each kit's material is remade from what the kit wrote on it
// (tag.ts): the same photographs and painted atlases, the same per-vertex wind weights read by the same motion, and
// the same surface touches (snow and moss on the upper faces, the tide's stain, bleached driftwood, coral's grooves).
//
// Where each copy of a plant stands is not in a matrix but in the field's buffers (field.ts): the vertex finds its
// copy through the list the cull pass wrote for its level of detail, and turns, sizes and places the plant from the
// copy's quaternion, size and place. The wind is worked out in the plant's own frame, as the kits do it, and moves
// the vertex before it is placed.
//
// The wind is layered (Sousa, "Vegetation Procedural Animation and Shading in Crysis", GPU Gems 3, 2007): the whole
// plant leans and sways with gusts that roll across the land downwind, branches bob on their own beat, and leaves
// shiver along their normals; each kit weights the layers with its own attributes. Thin leaves pass light through
// from behind: a back-lit glow toward the sun and a wrapped term through the blade (Barré-Brisebois and Bouchard,
// "Approximating Translucency for a Fast, Cheap and Convincing Subsurface Scattering Look", GDC 2011), added to each
// light's direct term so the shadow maps and the clouds' shade darken it as they darken the leaf.
//
// Cut-out cards keep their coverage in the distance, where mipmapping averages a card's alpha away (Castaño, "Computing
// Alpha Mipmaps", 2010, as a coverage boost by the texel footprint). Neighbouring levels of detail cross-fade over a
// band with complementary screen-door masks that turn every frame, which the temporal upscaler gathers into a blend.
import {
  MeshBasicNodeMaterial, MeshStandardNodeMaterial, PhysicalLightingModel, DoubleSide, FrontSide,
  type LightingModelDirectInput, type Material, type MeshStandardMaterial, type Node, type NodeBuilder,
} from 'three/webgpu';
import {
  Discard, Fn, If, abs, attribute, cos, cross, dFdx, dFdy, diffuseColor, dot, float, floor, fract, fwidth, instanceIndex,
  interleavedGradientNoise, length, log2, materialColor, materialRoughness, max, min, mix, normalGeometry, normalLocal,
  normalView, normalViewGeometry, normalize, positionGeometry, positionView, positionViewDirection, positionWorld, screenCoordinate,
  int, select, sign, sin, smoothstep, step, texture, textureSize, uint, uv, varying, vec2, vec3, vec4, cameraPosition,
  positionPrevious,
} from 'three/tsl';
import { P } from '../gpu/uniforms.ts';
import { thinCloudLight } from '../atmosphere/light.ts';
import { tagOf, type FloraTag } from './tag.ts';

type F = Node<'float'>;
type V3 = Node<'vec3'>;
type V4 = Node<'vec4'>;
type U = Node<'uint'>;

/** What the field hands every plant material: its buffers, and the eye the levels of detail are judged from. */
export interface FieldNodes {
  /** Two vec4 per copy: place and size, then the turn. */
  copies: { element(i: U): V4 };
  /** The copies each level of detail draws this frame, bucket after bucket. */
  shown: { element(i: U): U };
  /** Per bucket: where its list starts. */
  base: { element(i: U): U };
  /** Per bucket: the fade in (start, width) and out (end, width) over the distance from the eye. */
  fade: { element(i: U): V4 };
  eye: V3;
}

/** v turned by the quaternion q. */
export const turn = (q: V4, v: V3): V3 => {
  const t = cross(q.xyz, v).mul(2);
  return v.add(t.mul(q.w)).add(cross(q.xyz, t));
};
/** v turned back by q. */
export const unturn = (q: V4, v: V3): V3 => turn(vec4(q.xyz.negate(), q.w), v);

/** Levels of detail: three built from the plant, then its impostor (impostor.ts). A bucket is a variant's level,
 *  variant × LEVELS + level. */
export const LEVELS = 4;

/** The copy this vertex belongs to: its place, size and turn, its bucket and how much of it this level shows. */
export interface Copy {
  at: V3;
  size: F;
  q: V4;
  id: U;
  /** The level's share of the plant at this distance, 0…1, and which way its screen-door runs. */
  shown: F;
  odd: F;
}

export function copyOf(f: FieldNodes): Copy {
  const bucket = uint(attribute<'float'>('aBucket') as unknown as F);
  const id = f.shown.element(f.base.element(bucket).add(instanceIndex));
  const a = f.copies.element(id.mul(2)), q = f.copies.element(id.mul(2).add(1));
  const fade = f.fade.element(bucket);
  const d = length(a.xyz.sub(f.eye));
  const shown = min(d.sub(fade.x).div(fade.y), fade.z.sub(d).div(fade.w)).clamp(0, 1);
  // (neighbouring levels' screen-doors run opposite ways, so where both draw they never cover the same pixel)
  const odd = float(bucket.mod(LEVELS).mod(2));
  return { at: a.xyz, size: a.w, q, id, shown, odd };
}

// ---------------------------------------------------------------- the wind, kit by kit, in the plant's own frame

interface WindIn {
  p: V3;
  n: V3;
  /** The copy's place in the world. */
  o: V3;
  /** The wind's way in the plant's frame, flattened onto its ground, and the way across it. */
  wl: V3;
  ws: V3;
  /** The wind's way in the world. */
  wd: V3;
  t: F;
  /** Wind speed, m/s. */
  speed: F;
  q: V4;
  size: F;
}

/** Kit A: aWind = (bend, phase, branch bob, flutter); strength 0 calm, 1 a fresh breeze, 2 a gale. */
function windA(w: WindIn): V3 {
  const a = attribute<'vec4'>('aWind') as unknown as V4;
  const { p, n, o, wl, ws, wd, t } = w;
  const k = w.speed.div(9).clamp(0, 2.2);
  const seed = dot(o, vec3(0.131, 0.173, 0.117));
  const g = dot(o, wd).mul(0.045).sub(t.mul(1.1));
  const gust = sin(g).mul(sin(g.mul(0.43).add(seed))).mul(0.38).add(0.62);
  const sway = sin(t.mul(0.7).add(seed)).mul(0.3).add(sin(t.mul(1.73).add(seed.mul(2.3))).mul(0.12));
  const lean = wl.mul(gust.add(sway)).add(ws.mul(sin(t.mul(0.53).add(seed.mul(1.9))).mul(0.22))).mul(a.x.mul(k));
  const bend = vec3(0, a.x.mul(a.x).mul(k).mul(k).mul(0.02).negate(), 0);
  const ph = t.mul(2.3).add(a.y).add(seed);
  const bob = vec3(0, sin(ph), 0).add(wl.mul(sin(ph.mul(0.8).add(1)).mul(0.6))).mul(a.z.mul(k).mul(gust.add(0.4)));
  const flutter = n.mul(sin(t.mul(8).add(a.y.mul(3)).add(dot(p, vec3(2.1, 1.7, 2.9)))).mul(a.w.mul(k).mul(gust)));
  return lean.add(bend).add(bob).add(flutter);
}

/** Kit B: aWind = (bend, branch, hz·100 + phase, flutter); in the air, under the water, or at the surface. */
function windB(w: WindIn, mode: 'air' | 'submerged' | 'surface'): V3 {
  const a = attribute<'vec4'>('aWind') as unknown as V4;
  const { p, n, o, wl: wd, ws: side, t } = w;
  const str = w.speed.div(9).clamp(0, 2.2);
  const hz = floor(a.z).mul(0.01);
  const ph = fract(a.z).mul(6.2832).add(dot(o, vec3(0.071, 0.053, 0.067)));
  const along = dot(o, w.wd);
  const gust = sin(along.mul(0.045).sub(t.mul(0.9))).mul(sin(t.mul(0.23).add(dot(o, vec3(0.011, 0.017, 0.013))))).mul(0.38).add(0.62);
  const air: F = mode === 'air' ? float(1) : mode === 'submerged' ? float(0) : smoothstep(-0.3, 0.6, p.y);
  let d: V3 = vec3(0);
  if (mode !== 'submerged') {
    const lean = str.mul(gust.mul(0.45).add(0.7));
    const osc = sin(t.mul(hz).mul(6.2832).add(ph.mul(0.25))).mul(str.mul(0.3).add(0.12)).mul(gust);
    let m = wd.mul(a.x.mul(lean.add(osc)));
    m = m.add(side.mul(a.x).mul(sin(t.mul(hz).mul(4.7).add(ph.mul(0.5)))).mul(str.mul(0.12).add(0.04)));
    const bs = sin(t.mul(hz).mul(13).add(ph)).mul(str.mul(gust).mul(0.6).add(0.25));
    m = m.add(wd.mul(str.mul(0.4).add(0.35)).add(side.mul(0.6)).mul(a.y).mul(bs));
    m = m.add(n.mul(a.w).mul(sin(t.mul(hz.mul(9).add(7)).add(ph.mul(3)).add(dot(p, vec3(2.1, 1.7, 2.3))))).mul(str.mul(0.8).add(0.2)));
    d = d.add(m.mul(air));
  }
  if (mode !== 'air') {
    // the swell: a slow to-and-fro along the waves, which run with the wind, plus ribbons rippling
    const sw = sin(t.mul(0.8).sub(along.mul(0.07)).add(p.y.mul(0.12)).add(ph.mul(0.15)));
    let s = wd.mul(a.x).mul(sw).mul(str.mul(0.65).add(0.35));
    s = s.add(side.mul(a.x).mul(0.35).mul(sin(t.mul(0.55).add(ph.mul(0.3)))));
    s = s.add(side.mul(0.7).add(wd.mul(0.3)).mul(a.y).mul(sin(t.mul(1.3).add(ph).add(p.y.mul(0.9)))));
    s = s.add(n.mul(a.w).mul(sin(t.mul(2.2).add(ph.mul(2)).add(p.y.mul(2.6)).add(p.x.mul(1.3)))));
    if (mode === 'surface') {
      // what floats at the surface rides the waves up and down
      const top = smoothstep(0.25, 1.2, abs(p.y)).oneMinus();
      const wp = o.add(turn(w.q, p.mul(w.size)));
      s = s.add(vec3(0, top.mul(0.09).mul(sin(t.mul(1.1).add(dot(wp, vec3(0.31, 0.27, 0.23))))).mul(str.mul(0.6).add(0.4)), 0));
    }
    d = d.add(s.mul(air.oneMinus()));
  }
  // a bent stem drops toward its anchor rather than stretching
  const h = max(abs(p.y), 0.4);
  const dd = dot(d.xz, d.xz);
  return d.sub(vec3(0, sign(p.y.add(1e-4)).mul(min(dd.div(h.mul(2)), h.mul(0.5))), 0));
}

/** Kit C: aSway, aFlutter; strength 0 calm to 1 a gale; corals rock with the swell instead. */
function windC(w: WindIn, surge: boolean): V3 {
  const sway = attribute<'float'>('aSway') as unknown as F, flutter = attribute<'float'>('aFlutter') as unknown as F;
  const { p, n, o, wl, ws, t } = w;
  const s = w.speed.div(18).clamp(0, 1);
  const ph = dot(o, vec3(0.137, 0.091, 0.113));
  let d: V3;
  if (surge) {
    const sg = sin(t.mul(0.9).add(ph)).add(sin(t.mul(2.3).add(ph.mul(1.7))).mul(0.35));
    d = wl.mul(sg).add(ws.mul(sin(t.mul(0.7).add(ph.mul(2.1))).mul(0.3))).mul(sway).mul(s.mul(0.7).add(0.3));
  } else {
    const gust = sin(t.mul(0.63).add(ph)).mul(sin(t.mul(0.21).add(ph.mul(0.7)))).mul(0.4).add(0.6);
    const lean = s.mul(s).mul(gust);
    const swing = s.add(0.15).mul(sin(t.mul(1.7).add(ph.mul(3.1))).mul(0.22).add(sin(t.mul(2.9).add(ph.mul(1.3))).mul(0.08)));
    const across = s.add(0.15).mul(sin(t.mul(1.3).add(ph.mul(2.3)))).mul(0.1);
    d = wl.mul(lean.add(swing)).add(ws.mul(across)).mul(sway);
    d = d.sub(vec3(0, sway.mul(lean).mul(lean).mul(0.3), 0));
  }
  const shiver = sin(t.mul(s.mul(3).add(6)).add(dot(p, vec3(1.9, 2.3, 1.7))).add(ph.mul(5)));
  return d.add(n.mul(flutter).mul(s.add(0.2)).mul(shiver));
}

/** Kit D: aWind = (bend, flutter, phase); strength 0 calm to 1 a gale. Gusts travel downwind as a wave. */
function windD(w: WindIn): V3 {
  const a = attribute<'vec3'>('aWind') as unknown as V3;
  const { p, n, o, t } = w;
  const wd = w.wl.xz;
  const ph = dot(o, vec3(0.071, 0.053, 0.089));
  const wave = dot(o, w.wd).mul(0.05).sub(t.mul(1.1));
  const gust = sin(wave).mul(sin(wave.mul(0.43).add(ph.mul(2)))).mul(0.5).add(0.5);
  const st = w.speed.div(18).clamp(0, 1);
  const lean = st.mul(gust.mul(0.75).add(0.45));
  const osc = st.mul(0.35).add(0.08).mul(sin(t.mul(fract(ph.mul(7.31)).mul(0.6).add(1.1)).add(ph.mul(6.2831)).add(a.z.mul(0.8))));
  const wob = st.mul(0.2).add(0.04).mul(sin(t.mul(0.83).add(ph.mul(3.7))));
  const off = wd.mul(lean.add(osc)).add(vec2(wd.y.negate(), wd.x).mul(wob)).mul(a.x);
  const drop = dot(off, off).mul(0.4).div(max(abs(p.y), 0.4));
  const fl = a.y.mul(st.mul(1.1).add(0.15)).mul(gust.mul(0.7).add(0.5));
  const shiver = sin(t.mul(6.1).add(a.z.mul(6.2831)).add(ph.mul(3))).add(sin(t.mul(9.7).add(a.z.mul(15))).mul(0.6));
  const sx = off.x.add(wd.x.mul(shiver).mul(0.02).mul(fl)), sz = off.y.add(wd.y.mul(shiver).mul(0.02).mul(fl));
  return vec3(sx, drop.negate(), sz).add(n.mul(shiver.mul(0.045).mul(fl)));
}

// ---------------------------------------------------------------- surfaces

/** A hash and value noise for coral skins, as the kit draws them. */
const cHash = (p: V3): F => {
  const q = fract(p.mul(0.3183099).add(0.1)).mul(17);
  return fract(q.x.mul(q.y).mul(q.z).mul(q.x.add(q.y).add(q.z)));
};
const cNoise = (x: V3): F => {
  const i = floor(x), f0 = fract(x), f = f0.mul(f0).mul(f0.mul(-2).add(3));
  const c = (a: number, b: number, d: number): F => cHash(i.add(vec3(a, b, d)));
  const x00 = mix(c(0, 0, 0), c(1, 0, 0), f.x), x10 = mix(c(0, 1, 0), c(1, 1, 0), f.x);
  const x01 = mix(c(0, 0, 1), c(1, 0, 1), f.x), x11 = mix(c(0, 1, 1), c(1, 1, 1), f.x);
  return mix(mix(x00, x10, f.y), mix(x01, x11, f.y), f.z);
};
/** -1 in a groove or pore to 1 on a ridge or a cup's rim, flattened where the pattern is finer than a pixel. */
function coralHeight(p: V3, c: NonNullable<FloraTag['coral']>): F {
  if (c.kind === 'brain') {
    const n = cNoise(p.mul(c.freq)).mul(0.62).add(cNoise(p.mul(c.freq * 2.1).add(7)).mul(0.28)).add(cNoise(p.mul(c.freq * 4.3)).mul(0.1));
    const f = n.mul(10);
    return cos(f.mul(6.2832)).mul(smoothstep(0.2, 0.55, fwidth(f)).oneMinus());
  }
  const v = cNoise(p.mul(c.freq)).mul(0.75).add(cNoise(p.mul(c.freq * 2.3).add(3)).mul(0.25));
  const h = smoothstep(0.5, 0.68, v).mul(2).sub(1).sub(smoothstep(0.72, 0.8, v).mul(0.8));
  return h.mul(smoothstep(0.08, 0.25, fwidth(v)).oneMinus());
}
/** The normal bent by a height's screen-space slope (Mikkelsen, "Bump Mapping Unparametrized Surfaces on the GPU"). */
function bump(n: V3, h: F, k: number): V3 {
  const sx = dFdx(positionView), sy = dFdy(positionView);
  const r1 = cross(sy, n), r2 = cross(n, sx);
  const det = dot(sx, r1);
  const grad = r1.mul(dFdx(h)).add(r2.mul(dFdy(h))).mul(sign(det)).mul(k);
  return normalize(n.mul(abs(det)).sub(grad));
}

/** Leaves: each light's direct term gains what comes through the blade from behind. */
export class LeafLight extends PhysicalLightingModel {
  readonly #through: F;
  constructor(through: F) {
    super();
    this.#through = through;
  }
  override direct(input: LightingModelDirectInput, builder: NodeBuilder): void {
    super.direct(input, builder);
    const lightDirection = input.lightDirection as unknown as V3, lightColor = input.lightColor as unknown as V3;
    const reflectedLight = input.reflectedLight as unknown as { directDiffuse: V3 };
    const away = lightDirection.negate();
    const back = dot(positionViewDirection, away).clamp(0, 1).pow(3);
    const thru = dot(normalView, away).clamp(0, 1);
    reflectedLight.directDiffuse.addAssign(diffuseColor.rgb.mul(lightColor).mul(back.mul(0.55).add(thru.mul(0.3))).mul(this.#through));
  }
}

export class FloraNodeMaterial extends MeshStandardNodeMaterial {
  through: F | null = null;
  turnNormal: (() => void) | null = null;
  override setupLightingModel(): PhysicalLightingModel {
    return this.through ? new LeafLight(this.through) : super.setupLightingModel();
  }
  override setupPosition(builder: NodeBuilder): ReturnType<MeshStandardNodeMaterial['setupPosition']> {
    this.turnNormal?.();
    return super.setupPosition(builder);
  }
}

/** The screen-door noise for the level-of-detail cross-fade, turned every frame. */
export const door = (): F => interleavedGradientNoise(screenCoordinate.xy.add(vec2(float(P.frame).mul(5.588238), float(P.frame).mul(3.1415))));

const made = new Map<Material, Material>();

/** The node twin of a kit's plant material, placed by the field. One per source material; shared by every copy. */
export function floraMaterial(src: Material, f: FieldNodes): Material {
  const hit = made.get(src);
  if (hit) return hit;
  const t = tagOf(src);
  const m = t ? standard(src as MeshStandardMaterial, t, f) : drips(f);
  made.set(src, m);
  return m;
}

function standard(src: MeshStandardMaterial, t: FloraTag, f: FieldNodes): Material {
  const m = new FloraNodeMaterial();
  m.name = 'flora:' + (src.name || t.kit);
  m.map = src.map;
  m.normalMap = src.normalMap;
  m.normalScale.copy(src.normalScale);
  m.color.copy(src.color);
  m.roughness = src.roughness;
  m.metalness = src.metalness;
  m.emissive.copy(src.emissive);
  m.side = src.side;
  // the screen-door needs a cut-out on every material
  m.alphaTest = src.alphaTest || 0.01;
  m.vertexColors = false;

  const c = copyOf(f);
  const vShown = varying(c.shown, 'vFloraShown') as unknown as F;
  const vOdd = varying(c.odd, 'vFloraOdd') as unknown as F;
  const vSeed = varying(fract(float(c.id).mul(0.6180339887)), 'vFloraSeed') as unknown as F;
  const vUp = varying(normalGeometry.y, 'vFloraUp') as unknown as F;

  // ---- the vertex: the wind in the plant's frame, then the copy's turn, size and place
  m.turnNormal = () => {
    normalLocal.assign(turn(c.q, normalGeometry));
  };
  m.positionNode = Fn(() => {
    const p = positionGeometry, n = normalGeometry;
    const speed = length(P.wind);
    const wd = P.wind.div(max(speed, 1e-3));
    const local = unturn(c.q, wd);
    const flat = vec3(local.x, 0, local.z);
    const wl = select(dot(flat, flat).greaterThan(1e-8), normalize(flat), vec3(1, 0, 0));
    const ws = vec3(wl.z.negate(), 0, wl.x);
    const w: WindIn = { p, n, o: c.at, wl, ws, wd, t: P.time, speed, q: c.q, size: c.size };
    const off = t.kit === 'A' ? windA(w) : t.kit === 'B' ? windB(w, t.mode ?? 'air') : t.kit === 'C' ? windC(w, !!t.surge) : windD(w);
    // (each copy is placed by this node, not by a matrix: its place is where it was, for the motion vectors)
    const at = c.at.add(turn(c.q, p.add(off).mul(c.size))).toVar();
    positionPrevious.assign(at);
    return at;
  })();

  // ---- the surface
  m.colorNode = Fn((_: unknown, builder: NodeBuilder) => {
    const col = (materialColor as unknown as V4).toVar();
    if (t.cover) {
      const cv = t.cover;
      const ct = texture(cv.map, uv().mul(cv.scale)) as unknown as V4;
      const low = (texture(cv.map, uv().mul(cv.scale * 0.13).add(0.37)) as unknown as V4).g;
      const aCover = attribute<'float'>('aCover') as unknown as F;
      const fc0 = aCover.mul(mix(0.45, 1, smoothstep(0.5, 0.9, vUp.mul(0.5).add(0.5)))).add(step(0.999, aCover));
      const fc = smoothstep(0.32, 0.55, fc0.add(ct.g.sub(0.5).mul(0.5)).add(low.sub(0.5).mul(0.9)).clamp(0, 1));
      col.rgb.assign(mix(col.rgb, ct.rgb.mul(vec3(cv.tint.r, cv.tint.g, cv.tint.b)), fc));
    }
    if (t.moss) {
      const ms = t.moss;
      const moss = (texture(ms.map, uv().mul(1.3).add(0.37)) as unknown as V4).rgb;
      const lump = moss.g.mul(1.6).sub(0.45);
      const extra = builder.geometry.hasAttribute('aMoss') ? (attribute<'float'>('aMoss') as unknown as F).mul(0.9) : float(0);
      const k = smoothstep(0.05, 0.5, vUp.mul(ms.amount).add(extra).add(lump.mul(0.45)).sub(0.2)).clamp(0, 1);
      col.rgb.assign(mix(col.rgb, moss.mul(vec3(ms.tint.r, ms.tint.g, ms.tint.b)), k));
    }
    if (t.tide) {
      // under water: dark and slick; the band the tide covers: a green-brown stain; above: dry
      const seaH = length(positionWorld).sub(P.planet.y);
      const under = smoothstep(-0.15, 0.1, seaH).oneMinus();
      const band = smoothstep(-0.2, 0.05, seaH).mul(smoothstep(0.55, 1.1, seaH).oneMinus());
      col.rgb.assign(mix(col.rgb, col.rgb.mul(vec3(0.55, 0.6, 0.42)), band.mul(0.8)).mul(mix(1, 0.45, under)));
    }
    if (builder.geometry.hasAttribute('color')) col.rgb.mulAssign(attribute<'vec3'>('color') as unknown as V3);
    if (t.bleach) col.rgb.assign(mix(col.rgb, vec3(dot(col.rgb, vec3(0.3, 0.59, 0.11)).mul(2.2)), t.bleach));
    if (t.coral) {
      const h = coralHeight(varying(positionGeometry, 'vCoralP') as unknown as V3, t.coral);
      col.rgb.mulAssign(t.coral.kind === 'brain' ? h.mul(0.22).add(0.78) : h.mul(0.15).add(0.85));
    }
    // no two copies quite the same
    col.rgb.mulAssign(vSeed.mul(0.22).add(0.89));
    // the weather on the faces that look up: snow settling, rain wetting
    const skyward = dot(normalWorldOf(), normalize(positionWorld)).clamp(0, 1);
    const snow = smoothstep(0.35, 0.8, skyward).mul(P.snow).mul(smoothstep(-0.5, 0.5, length(positionWorld).sub(P.planet.y)));
    col.rgb.assign(mix(col.rgb, vec3(0.86, 0.89, 0.93), snow.mul(0.85)));
    col.rgb.mulAssign(mix(1, 0.72, P.rain.mul(skyward.mul(0.6).add(0.4))));
    return col;
  })();

  m.roughnessNode = Fn(() => {
    let r: F = materialRoughness as unknown as F;
    if (t.tide) {
      const seaH = length(positionWorld).sub(P.planet.y);
      const wet = max(smoothstep(-0.15, 0.1, seaH).oneMinus(), smoothstep(-0.2, 0.05, seaH).mul(smoothstep(0.55, 1.1, seaH).oneMinus()).mul(0.7));
      r = mix(r, 0.28, wet);
    }
    return mix(r, 0.3, P.rain.mul(0.65));
  })();

  // coverage: cut-outs kept in the distance and faded edge-on, and the screen-door between levels of detail
  m.opacityNode = Fn(() => {
    let a: F = float(1);
    if (t.cutout !== undefined && src.map) {
      const size = t.cutout > 0 ? vec2(t.cutout) : vec2(textureSize(texture(src.map), int(0)) as unknown as Node<'ivec2'>);
      const fx = dFdx(uv().mul(size)), fy = dFdy(uv().mul(size));
      a = log2(max(dot(fx, fx), dot(fy, fy))).mul(0.5).max(0).mul(t.kit === 'C' ? 0.22 : 0.28).add(1);
    }
    if (t.edgeFade) {
      const face = normalize(cross(dFdx(positionView), dFdy(positionView)));
      a = a.mul(smoothstep(0.12, 0.42, abs(dot(face, normalize(positionView)))));
    }
    const n = door();
    If(select(vOdd.greaterThan(0.5), n.oneMinus(), n).greaterThanEqual(vShown), () => {
      Discard();
    });
    return a;
  })();

  if (t.crownNormals) m.normalNode = normalViewGeometry;
  if (t.coral) {
    const coral = t.coral;
    m.normalNode = Fn(() => bump(normalView, coralHeight(varying(positionGeometry, 'vCoralP') as unknown as V3, coral), coral.bump))();
  }
  if (t.translucency) m.through = float(t.translucency);
  m.side = src.side === DoubleSide ? DoubleSide : FrontSide;
  return m;
}

/** The surface's normal in the world, before any map: what the weather lands on. */
const normalWorldOf = (): V3 => normalize(varying(normalLocal, 'vFloraN') as unknown as V3);

/** Drops falling from leaf tips, over and over, as thin streaks turned to the eye; lit as mist is. */
function drips(f: FieldNodes): Material {
  const m = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false });
  m.name = 'flora:drips';
  const c = copyOf(f);
  const drip = attribute<'vec3'>('aDrip') as unknown as V3, fall = attribute<'float'>('aFall') as unknown as F;
  const period = fall.mul(0.25).add(2.6);
  const tt = fract(P.time.div(period).add(drip.z)).mul(period);
  const y = tt.mul(tt).mul(4.9), v = tt.mul(9.8);
  const alpha = smoothstep(fall.mul(0.8), fall, y).oneMinus().mul(step(0.05, tt));
  m.positionNode = Fn(() => {
    const p = positionGeometry;
    const local = vec3(p.x, p.y.sub(min(y, fall)).add(drip.y.mul(v.mul(0.018).add(0.03))), p.z);
    const world = c.at.add(turn(c.q, local.mul(c.size)));
    const toEye = normalize(cameraPosition.sub(world));
    const across = normalize(cross(turn(c.q, vec3(0, 1, 0)), toEye));
    const at = world.add(across.mul(drip.x.mul(0.007))).toVar();
    positionPrevious.assign(at);
    return at;
  })();
  const va = varying(alpha.mul(c.shown), 'vDripA') as unknown as F;
  m.colorNode = Fn(() => thinCloudLight(positionWorld).mul(0.9).add(vec3(0.02, 0.025, 0.03).mul(P.night.oneMinus())))();
  m.opacityNode = va.mul(0.55);
  m.alphaTest = 0.01;
  return m;
}

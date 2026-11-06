// The rock material as nodes: the same scanned photographs projected three ways in the rock's
// own space, graded toward the region's rock, wetted and grown over toward the waterline, banded, iced or glowing as
// its skin says, with the cover layer on faces that look up. It follows material.ts line for line; what differs is
// where the rock's own space comes from and the scale of the light it gives off.
//
// The rock's space is its geometry's, scaled to metres: for an instanced rock the instance's matrix is read here from
// the same buffer three's instancing reads, so the photograph rides a turning floe instead of swimming over it, and
// each copy is offset into a different patch of it. Light the rock gives off (hot cracks, the light ice seems to hold)
// is set at the lamps' scale, as every glow on the planet is, so it reads the same against noon and moonlight.
import { MeshStandardNodeMaterial, type InstancedMesh, type Node, type NodeBuilder, type Texture } from 'three/webgpu';
import {
  Fn, abs, attribute, buffer, cameraPosition, cameraViewMatrix, clamp, dot, float, floor, fract, instanceIndex, length, max, mix,
  modelWorldMatrix, normalGeometry, normalize, positionGeometry, positionLocal, positionWorld, pow, reference, select, sin, smoothstep,
  step, texture, varyingProperty, vec2, vec3, vec4,
} from 'three/tsl';
import { marksAt, scorch } from '../gpu/marks.ts';
import { LAMP, P } from '../gpu/uniforms.ts';
import type { Skin, SkinId, TexId } from './skins.ts';

type F = Node<'float'>;
type V2 = Node<'vec2'>;
type V3 = Node<'vec3'>;
type V4 = Node<'vec4'>;
type RGB = readonly [number, number, number];

/** What the material reads that the frame moves: the sea (centre, radius; radius 0 for a flat sea at centre.y), how
 *  much daylight there is, and the distances over which the close-up detail fades. */
export interface RockShared {
  uSea: { value: { x: number; y: number; z: number; w: number } };
  uDaylight: { value: number };
  uDetailFade: { value: { x: number; y: number } };
}

const lum = (c: V3): F => dot(c, vec3(0.299, 0.587, 0.114));
const hash = (n: F): F => fract(sin(n).mul(43758.5453));
const unpack = (t: V4): V3 => t.xyz.mul(2).sub(1);
const rgb = (c: RGB): V3 => vec3(c[0], c[1], c[2]);
/** a when k < 1, b when k < 2, c when k < 3, else d. */
const pick4 = (k: F, a: V3, b: V3, c: V3, d: V3): V3 => select(k.lessThan(1), a, select(k.lessThan(2), b, select(k.lessThan(3), c, d)));
/** a under 0.4, b under 0.75, else c. */
const pick3 = (k: F, a: V3, b: V3, c: V3): V3 => select(k.lessThan(0.4), a, select(k.lessThan(0.75), b, c));

/** The node material for a skin; `tex` loads one of the photographs, `shared` is what every rock reads. */
export function rockNodeMaterial(id: SkinId, s: Skin, tex: (id: TexId, kind: 'd' | 'n') => Texture, shared: RockShared): MeshStandardNodeMaterial {
  const m = new MeshStandardNodeMaterial({ roughness: s.rough[0], metalness: 0, name: `rock:${id}` });
  const alb = tex(s.tex, 'd'), nrm = tex(s.tex, 'n');
  const scale = vec2(1 / s.tile, 1 / (s.tile * (s.aspect ?? 1)));
  const sea = reference('value', 'vec4', shared.uSea) as unknown as V4;
  const daylight = reference('value', 'float', shared.uDaylight) as unknown as F;
  const fade = reference('value', 'vec2', shared.uDetailFade) as unknown as V2;
  const grade = s.grade ?? [1, 1, 1];
  const [spray, wetAll, strength] = [s.spray, s.wetAll ?? 0, s.normal ?? 1];

  // what the vertex stage hands on: the rock's space and its axes in the world
  const vRP = varyingProperty('vec3', 'vRockP') as unknown as V3;
  const vRN = varyingProperty('vec3', 'vRockN') as unknown as V3;
  const vAxX = varyingProperty('vec3', 'vRockAxX') as unknown as V3;
  const vAxY = varyingProperty('vec3', 'vRockAxY') as unknown as V3;
  const vAxZ = varyingProperty('vec3', 'vRockAxZ') as unknown as V3;
  const vRock = varyingProperty('vec4', 'vRockData') as unknown as V4;

  m.positionNode = Fn((_: unknown, builder: NodeBuilder) => {
    const obj = builder.object as InstancedMesh;
    let M = modelWorldMatrix as unknown as Node<'mat4'>, off: V3 = vec3(0);
    const count = obj.isInstancedMesh ? Math.max(obj.instanceMatrix.count, 1) : 0;
    const limit = (builder as unknown as { getUniformBufferLimit(): number }).getUniformBufferLimit();
    // the instance's own matrix, as three's instancing reads it while the buffer fits a uniform block (a floe ring's
    // worth always does); past that the rock's space is the mesh's, which still holds still on a rock that does
    if (count && count * 64 <= limit) {
      const im = (buffer(obj.instanceMatrix.array, 'mat4', count) as unknown as { element(i: unknown): Node<'mat4'> }).element(instanceIndex);
      M = M.mul(im) as unknown as Node<'mat4'>;
      off = vec3(float(instanceIndex)).mul(vec3(3.17, 1.93, 2.71));
    }
    const axis = (x: number, y: number, z: number): V3 => (M.mul(vec4(x, y, z, 0)) as unknown as V4).xyz;
    const sx = axis(1, 0, 0), sy = axis(0, 1, 0), sz = axis(0, 0, 1);
    const rs = vec3(length(sx), length(sy), length(sz));
    const local = count && count * 64 > limit;
    vRP.assign(local ? positionLocal : positionGeometry.mul(rs).add(off));
    vRN.assign(normalGeometry.div(rs));
    vAxX.assign(sx.div(rs.x));
    vAxY.assign(sy.div(rs.y));
    vAxZ.assign(sz.div(rs.z));
    vRock.assign(attribute<'vec4'>('aRock') as unknown as V4);
    return positionLocal;
  })();

  // ---- the triplanar photograph, whiteout-blended, in the rock's own space
  const rN = normalize(vRN);
  const detail = smoothstep(fade.x, fade.y, length(positionWorld.sub(cameraPosition))).oneMinus();
  const w0 = pow(abs(rN), vec3(4)), w = w0.div(w0.x.add(w0.y).add(w0.z));
  const sg = step(0, rN).mul(2).sub(1);
  const p = vRP;
  const uvX = vec2(p.z.mul(sg.x), p.y).mul(scale), uvY = vec2(p.x.mul(sg.y), p.z).mul(scale), uvZ = vec2(p.x.negate().mul(sg.z), p.y).mul(scale);
  const A = (u: V2): V3 => (texture(alb, u) as unknown as V4).rgb;
  const N = (u: V2): V3 => unpack(texture(nrm, u) as unknown as V4);
  const rAlb = A(uvX).mul(w.x).add(A(uvY).mul(w.y)).add(A(uvZ).mul(w.z));
  const D = 4.37;
  // each face's normal with the close-up detail laid over it, scaled by the skin's strength and turned to its face
  const face = (t: V3, d: V3, flip: F): V3 => {
    const xy = t.xy.add(d.xy.mul(detail).mul(0.6)).mul(strength);
    return vec3(xy.x.mul(flip), xy.y, t.z);
  };
  const tX0 = face(N(uvX), N(uvX.mul(D).add(0.31)), sg.x);
  const tY0 = face(N(uvY), N(uvY.mul(D).add(0.57)), sg.y);
  const tZ0 = face(N(uvZ), N(uvZ.mul(D).add(0.13)), sg.z.negate());
  const an = abs(rN);
  const tX = vec3(tX0.xy.add(rN.zy), an.x.mul(tX0.z));
  const tY = vec3(tY0.xy.add(rN.xz), an.y.mul(tY0.z));
  const tZ = vec3(tZ0.xy.add(rN.xy), an.z.mul(tZ0.z));
  const rNO = normalize(tX.zyx.mul(w.x).add(tY.xzy.mul(w.y)).add(tZ.xyz.mul(w.z)));
  // the same photograph sampled ten times larger: patches of light and dark that hide the tiling from afar
  const uvM = select(w.y.greaterThan(max(w.x, w.z)), uvY, select(w.x.greaterThan(w.z), uvX, uvZ)).mul(0.093).add(0.37);
  const macro = lum(A(uvM));

  // ---- where the rock stands against the sea
  const wp = positionWorld;
  const round = sea.w.greaterThan(0);
  const rUp = select(round, normalize(wp.sub(sea.xyz)), vec3(0, 1, 0));
  const rH = select(round, length(wp.sub(sea.xyz)).sub(sea.w), wp.y.sub(sea.y));
  const rGeoW = normalize(vAxX.mul(rN.x).add(vAxY.mul(rN.y)).add(vAxZ.mul(rN.z)));
  const rFacing = dot(rGeoW, rUp);
  const rCav = vRock.x;
  const rVar = macro.sub(0.45);

  // grade the photograph toward the region's rock
  let rA: V3 = rAlb.mul(rgb(s.tint));
  const rL = lum(rA);
  rA = mix(vec3(rL), rA, grade[0]);
  rA = rA.mul(pow(max(rL, 1e-3).div(0.25), grade[1] - 1).mul(grade[2]));
  rA = rA.mul(rVar.mul(0.9).add(0.82)).mul(vRock.w.mul(0.16).add(0.92));

  if (s.pieces) {
    const [a, b, c, d] = s.pieces.map(rgb), k = vRock.w.mul(3.999);
    rA = rA.mul(mix(pick4(k, a, b, c, d), pick4(k, b, c, d, a), smoothstep(0.6, 1, fract(k))));
  }
  if (s.bands) {
    // strata follow height above the sea, so neighbouring rocks share their bands like one wall; a form that builds
    // its own layers passes each layer's colour key in aRock.z instead
    const B = s.bands, [ca, cb, cc] = B.colours.map(rgb);
    const bz = rH.add(rVar.mul(B.warp)).div(B.period), bf = fract(bz);
    const own = vRock.z.greaterThan(0.001);
    const k0 = select(own, vRock.z, hash(floor(bz).add(B.seed))), k1 = select(own, vRock.z, hash(floor(bz).add(1 + B.seed)));
    // fine laminations inside each band
    const bc = mix(pick3(k0, ca, cb, cc), pick3(k1, ca, cb, cc), smoothstep(0.82, 1, bf)).mul(hash(floor(bz.mul(5)).add(7)).sub(0.5).mul(0.14).add(1));
    rA = mix(rA, rA.mul(bc), B.strength);
  }
  if (s.ice) {
    // ice: blue in the body, white where it is cracked or crusted
    const veins = smoothstep(0.35, 0.8, lum(rAlb));
    rA = mix(rgb(s.ice.deep).mul(rVar.add(0.55)), vec3(0.86, 0.93, 1), veins.mul(0.75).add(vRock.z.mul(0.5)));
  }
  // cavities: dark cracks and undersides
  rA = rA.mul(rCav.mul(-0.62).add(1));

  // wetness: dark and glossy toward the sea, wet in cracks, wet streaks down cliff faces
  let rWet: F = smoothstep(0, macro.mul(0.9).add(0.55).mul(spray).add(0.05), rH).oneMinus();
  rWet = max(rWet, rCav.mul(0.25).add(0.75).mul(wetAll));
  if (s.streak) {
    const su = vec2(dot(p.xz, vec2(0.71, 0.7)).mul(0.11), p.y.mul(0.006).add(P.time.mul(0.015)));
    const streak = smoothstep(0.42, 0.62, (texture(alb, su) as unknown as V4).g).mul(s.streak);
    rWet = max(rWet, streak);
    rA = rA.mul(streak.mul(-0.35).add(1));
  }
  rWet = clamp(rWet.add(rCav.mul(0.25).mul(step(rH, spray * 2))), 0, 1);
  const rUnder = smoothstep(0.05, -0.35, rH);
  const rTideBand = smoothstep(-1.2, -0.25, rH).mul(smoothstep(0.7, 0.05, rH));
  let rWetA: V3 = rA.mul(mix(1, 0.42, rWet));
  rWetA = mix(vec3(lum(rWetA)), rWetA, rWet.mul(0.25).add(1));
  // growth at the tide line and below it
  if (s.algae) {
    const [ac, amount] = s.algae;
    rWetA = mix(rWetA, rgb(ac).mul(macro.add(0.6)), max(rTideBand, rUnder.mul(0.7)).mul(smoothstep(0.25, 0.6, macro.add(rCav.mul(0.4)))).mul(amount));
  }
  rA = rWetA;

  // cover (moss, snow, turf) on faces that look up, above the spray
  let rCover: F = float(0), rCovN: V3 = vec3(0, 1, 0);
  if (s.cover) {
    const C = s.cover, cuv = p.xz.mul(1 / C.tile);
    const lift = smoothstep(spray * 0.5, spray * 0.5 + 1.2, rH);
    const raw = smoothstep(C.up - C.soft, C.up + C.soft, rFacing.add(macro.sub(0.45).mul(0.6)).add(rCav.mul(0.15))).mul(C.amount).mul(vRock.y).mul(lift);
    rCover = smoothstep(0, 0.35, raw);
    rCovN = unpack(texture(tex(C.tex, 'n'), cuv) as unknown as V4);
    const cA = (texture(tex(C.tex, 'd'), cuv) as unknown as V4).rgb.mul(rgb(C.tint));
    rA = mix(rA, cA.mul(mix(1, 0.7, rWet.mul(0.5))), rCover);
  }
  // the scars of the match, where shot and fire struck it (gpu/marks.ts)
  const scar = vec4(marksAt(wp, macro));
  const scarred = scorch(rA, float(0), scar, macro);
  rA = scarred.albedo;
  m.colorNode = vec4(rA, 1);

  const rough = mix(rLumRough(s, rAlb), s.rough[1], rWet.mul(rCover.mul(-0.6).add(1)));
  m.roughnessNode = clamp(mix(mix(rough, 0.85, rCover.mul(0.8)), 0.95, max(scar.x, scar.y)), 0.04, 1);

  let nR: V3 = rNO;
  if (s.cover) nR = normalize(mix(nR, normalize(rN.add(vec3(rCovN.x, 0, rCovN.y).mul(0.6))), rCover.mul(0.7)));
  const nW = normalize(vAxX.mul(nR.x).add(vAxY.mul(nR.y)).add(vAxZ.mul(nR.z)));
  m.normalNode = normalize((cameraViewMatrix.mul(vec4(nW, 0)) as unknown as V4).xyz);

  // light given off, at the lamps' scale: hot cracks breathing, and the light ice seems to hold by day
  let glow: V3 = vec3(0);
  if (s.glow) {
    const pulse = sin(P.time.mul(1.3).add(wp.x.mul(0.37)).add(wp.z.mul(0.23))).mul(0.25).add(0.75);
    const pores = smoothstep(0.32, 0.05, lum(rAlb)).mul(0.6).add(rCav.mul(0.8));
    glow = glow.add(rgb(s.glow).mul(vRock.z.mul(pores).mul(pulse)).mul(rUnder.oneMinus()));
  }
  if (s.ice) {
    glow = glow.add(rgb(s.ice.deep).mul(s.ice.inner).mul(daylight).mul(rCav.oneMinus())
      .mul(abs(rFacing).oneMinus().mul(0.6).add(0.4)).mul(rCover.oneMinus()));
  }
  glow = glow.add(scarred.glow.mul(1.6));
  m.emissiveNode = glow.mul(LAMP).mul(2.5);
  // the cavities keep the sky's light out
  m.aoNode = rCav.mul(-0.75).add(1);
  return m;
}

/** Dry roughness, a little smoother on the pale parts of the photograph. */
const rLumRough = (s: Skin, a: V3): F => float(0.45).sub(lum(a)).mul(0.2).add(s.rough[0]);

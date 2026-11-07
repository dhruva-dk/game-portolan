// The land's material. Every fragment works out what the ground is where it stands, from the two regions whose ground
// meets there (the chunk carries all sixteen regions' weights per vertex) and, in each, which of six roles it plays:
// flat high ground, a slope, a cliff, a beach, the shore the tide and the spray keep wet, or the seabed. Of those up
// to twelve candidates the three that matter most are painted, each a scanned material from the region's set
// (scans.ts streams them in), projected along the world's three axes so cliffs never smear, and blended by their
// height maps: sand settles between the pebbles and the grass gives out round the stones rather than fading across
// them (the height-lerp of "Advanced Terrain Texture Splatting", Mikkelsen 2016).
//
// On top, the weather writes into it, as Lagarde's "Water drop" series (2013) has it: water darkens a porous surface
// and smooths it to a film, and in rain it stands in the hollows as puddles; snow settles on whatever faces up; moss
// grows on the shaded faces of rock in the damp regions; salt dries white in a band above the tideline.
//
// Under the sea the light that reaches it is the sea's business (ocean/beneath.ts), not the ground's.
import { MeshStandardNodeMaterial, Vector4, type Node, type Texture } from 'three/webgpu';
import {
  Fn, If, abs, attribute, cameraPosition, cameraViewMatrix, clamp, cos, dFdx, dFdy, dot, float, floor, fract, int, length, max, mix, mod,
  normalWorldGeometry, normalize, positionWorld, pow, select, sin, smoothstep, sqrt, step, texture, uniform, uniformArray, vec2, vec3, vec4, renderGroup,
} from 'three/tsl';
import { REGIONS } from '../../sim/world/index.ts';
import { LAMP, P } from '../gpu/uniforms.ts';
import { marksAt, scorch } from '../gpu/marks.ts';
import { refractedShadowPosition } from '../ocean/beneath.ts';
import { seaLevelNode } from '../lift.ts';
import { MOSS, ROLE, ROLE_COUNT } from './library.ts';
import type { ScanCache } from './scans.ts';

type F = Node<'float'>;
type I = Node<'int'>;
type V2 = Node<'vec2'>;
type V3 = Node<'vec3'>;

/** Past this distance the ground is painted with its scans' means alone; the textures fade out over the last part. */
const FAR = 230;
const FADE = 70;
/** Metres under the sea past which the seabed's scans are left off (from half as deep they fade). */
const DEEP = 12;
/** How far the height maps push one layer into the next, and over how much height they blend. */
const HEIGHT_PUSH = 0.65;
const HEIGHT_SOFT = 0.18;
/** The candidates painted at a fragment. */
const PAINTED = 3;

const SNOW = vec3(0.82, 0.86, 0.93);
const MOSS_COLOUR = vec3(0.045, 0.075, 0.022);
const SALT = vec3(0.42, 0.42, 0.39);
/** Foam on the sand. */
const SURF = vec3(0.9, 0.93, 0.95);

/** How far a hex on a wall may turn, as a share of a full turn: a little, so strata stay roughly level. */
const WALL_SPIN = 0.08;
/** How sharply one hex gives way to the next (Mikkelsen's exponent), and how much the height map has a say. */
const HEX_SHARP = 7;
const HEX_HEIGHT = 0.6;
/** Hexes this many texture repeats across, vertex to vertex. */
const HEX_SIZE = 1.25;

interface HexSample { surface: Node<'vec4'>; detail: Node<'vec4'>; tilt: V2 }

/** A slice of the scan arrays sampled with Mikkelsen's hex tiling ("Practical Real-Time Hex-Tiling", JCGT 2022):
 *  the plane is cut into hexes, each showing the texture turned and shifted at random, and blended into its
 *  neighbours over narrow seams where the higher of the two (by the height map) wins. No repeat is ever seen, and
 *  where one hex has the fragment to itself, as most do, only one sample is taken. Returns the surface and detail
 *  texels and the normal's tilt in the plane's own axes, turned back from each hex's rotation. */
function hexTiled(surface: ReturnType<typeof texture>, detail: ReturnType<typeof texture>, layer: I, stIn: V2, gxIn: V2, gyIn: V2, spin: number): HexSample {
  // (TSL assigns a node shared by several branches where it is first used, which may be inside one of them: anything
  // the branches below share is made a variable here, before them)
  const st = vec2(stIn).toVar(), gx = vec2(gxIn).toVar(), gy = vec2(gyIn).toVar();
  // the triangle grid, skewed so its triangles are unit right triangles
  const g = st.mul((2 * Math.sqrt(3)) / HEX_SIZE);
  const skew = vec2(g.x.sub(g.y.mul(0.57735027)), g.y.mul(1.15470054)).toVar();
  const base = floor(skew).toVar();
  const f = fract(skew).toVar();
  const z = float(1).sub(f.x).sub(f.y);
  const s = step(float(0), z.negate()).toVar();
  const s2 = s.mul(2).sub(1);
  const w = vec3(z.negate().mul(s2), s.sub(f.y.mul(s2)), s.sub(f.x.mul(s2)));
  const verts = [base.add(vec2(s, s)), base.add(vec2(s, float(1).sub(s))), base.add(vec2(float(1).sub(s), s))].map((v) => vec2(v).toVar());
  const sharp = pow(w, vec3(HEX_SHARP));
  const wb = sharp.div(sharp.x.add(sharp.y).add(sharp.z)).toVar();
  const wbs = [wb.x, wb.y, wb.z];
  const S = vec4(0).toVar(), D = vec4(0).toVar(), T = vec2(0).toVar(), total = float(0).toVar();
  verts.forEach((v, i) => {
    If(wbs[i].greaterThan(0.01), () => {
      const h = fract(sin(vec2(dot(mod(v, 289), vec2(127.1, 311.7)), dot(mod(v, 289), vec2(269.5, 183.3)))).mul(43758.5453)).toVar();
      const angle = h.x.sub(0.5).mul(2 * Math.PI * spin);
      const c = cos(angle).toVar(), sn = sin(angle).toVar();
      const turn = (x: V2): V2 => vec2(c.mul(x.x).sub(sn.mul(x.y)), sn.mul(x.x).add(c.mul(x.y)));
      // the hex's centre, back in the texture's own coordinates
      const centre = vec2(v.x.add(v.y.mul(0.5)), v.y.mul(0.8660254)).mul(HEX_SIZE / (2 * Math.sqrt(3))).toVar();
      const at = turn(st.sub(centre)).add(centre).add(h.yx.mul(vec2(1, 1.37))).toVar();
      const ga = turn(gx).toVar(), gb = turn(gy).toVar();
      const sv = vec4(surface.sample(at).depth(layer).grad(ga, gb) as unknown as Node<'vec4'>).toVar();
      const dv = vec4(detail.sample(at).depth(layer).grad(ga, gb) as unknown as Node<'vec4'>).toVar();
      const weight = wbs[i].mul(mix(float(1), sv.a, HEX_HEIGHT)).toVar();
      S.addAssign(sv.mul(weight));
      D.addAssign(dv.mul(weight));
      // the normal map is OpenGL's (green up the image), and the image's top row is at v = 0, so v runs down it
      const tilt = vec2(dv.x.mul(2).sub(1), float(1).sub(dv.y.mul(2))).toVar();
      // turned back: the hex's texture x runs along turn⁻¹ in the plane
      T.addAssign(vec2(c.mul(tilt.x).add(sn.mul(tilt.y)), sn.negate().mul(tilt.x).add(c.mul(tilt.y))).mul(weight));
      total.addAssign(weight);
    });
  });
  const inv = float(1).div(max(total, 1e-5)).toVar();
  return { surface: S.mul(inv), detail: D.mul(inv), tilt: T.mul(inv) };
}

/** The lab's switch for looking inside the land's shading. */
export const LAND = { debug: uniform(0, 'int') };
const ROLE_COLOURS: [number, number, number][] = [[0.1, 0.4, 0.05], [0.45, 0.4, 0.05], [0.3, 0.3, 0.3], [0.6, 0.5, 0.3], [0.05, 0.15, 0.5], [0.4, 0.05, 0.4]];

const luma = (c: V3): F => dot(c, vec3(0.2126, 0.7152, 0.0722));

/** One vec4 of a uniform array, at an index worked out in the shader. */
const element = (array: { element(i: I): unknown }, at: I): Node<'vec4'> => array.element(at) as Node<'vec4'>;

export function landMaterial(scans: ScanCache, noise: Texture): MeshStandardNodeMaterial {
  const mat = new MeshStandardNodeMaterial({ roughness: 0.9, metalness: 0 });
  mat.fog = true;
  // under the sea the sun's shadow is read along its bent path
  (mat as unknown as { receivedShadowPositionNode: Node }).receivedShadowPositionNode = refractedShadowPosition(positionWorld);
  const surfaceMap = texture(scans.surface);
  const detailMap = texture(scans.detail);
  const noiseMap = texture(noise);
  const moss = uniformArray(REGIONS.map((r) => new Vector4(MOSS[r.id] ?? 0, 0, 0, 0)), 'vec4').setGroup(renderGroup);

  // what the lighting reads, worked out once at the top of the fragment
  const albedo = vec3(0).toVar('landAlbedo');
  const normal = vec3(0, 1, 0).toVar('landNormal');
  const rough = float(0.9).toVar('landRough');
  const occlusion = float(1).toVar('landOcclusion');
  const glow = float(0).toVar('landGlow');
  const heat = vec3(0).toVar('landHeat');

  const weightsOf = (): F[] => {
    const out: F[] = [];
    for (let k = 0; k < 4; k++) {
      const v = attribute(`aW${k}`, 'vec4');
      out.push(v.x, v.y, v.z, v.w);
    }
    return out;
  };

  const ground = () => {
    // (TSL assigns a node shared by several branches where it is first used, which may be inside one of them: so
    // whatever the branches below share is made a variable out here, where every fragment runs)
    const p = vec3(positionWorld).toVar('landP');
    const gn = normalize(normalWorldGeometry).toVar('landGn');
    const r = length(p).toVar();
    const up = p.div(r).toVar('landUp');
    // (the share table by texel loads: the land is out of samplers)
    const above = r.sub(seaLevelNode(up, true)).toVar('landAbove');
    const slope = float(1).sub(dot(gn, up)).toVar();
    const dist = length(p.sub(cameraPosition)).toVar('landDist');
    // noise at three scales, in a projection of the world that has no seams
    const q = p.xz.add(vec2(0.71, -0.53).mul(p.y)).toVar();
    const n = vec3(noiseMap.sample(q.mul(0.0045)).r, noiseMap.sample(q.mul(0.031)).g, noiseMap.sample(q.mul(0.11)).b).toVar('landNoise');
    // and the lie of the land, at scales no scan holds: a hundred metres and more, and ten
    const broad = vec4(noiseMap.sample(q.mul(0.0021))).toVar('landBroad');
    const patchy = vec4(noiseMap.sample(q.mul(0.013))).toVar('landPatchy');

    // ----- the two regions whose ground meets here
    const w = weightsOf();
    const ra = int(0).toVar(), rb = int(0).toVar();
    const wa = float(-1).toVar(), wb = float(-1).toVar();
    w.forEach((x, i) => {
      If(x.greaterThan(wa), () => {
        rb.assign(ra);
        wb.assign(wa);
        ra.assign(i);
        wa.assign(x);
      }).ElseIf(x.greaterThan(wb), () => {
        rb.assign(i);
        wb.assign(x);
      });
    });
    const share = clamp(wb.div(max(wa.add(wb), 1e-4)), 0, 0.5).toVar();
    // a border reads as mixed ground, not a smear: dither the share with the noise where it is between
    const tb = clamp(share.add(n.z.sub(0.5).mul(0.6).mul(smoothstep(0, 0.12, share)).mul(smoothstep(0.5, 0.3, share))), 0, 1).toVar('landTb');

    // ----- the roles, laid one over the next
    // slope is 1 − cos of the ground's tilt: the slope's ground takes over from about 30°, the cliff's from 50°
    const cliff = smoothstep(0.34, 0.5, slope.add(n.y.sub(0.5).mul(0.18)));
    // the slope's ground (scree, earth, bare rock) also breaks through the flat in patches
    const patches = smoothstep(0.64, 0.76, patchy.g.add(broad.r.sub(0.5).mul(0.35))).mul(0.75);
    const sloped = max(smoothstep(0.13, 0.24, slope.add(n.x.sub(0.5).mul(0.12))), patches);
    const beach = float(1).sub(smoothstep(1.4, float(2.6).add(n.x.mul(1.6)), above)).mul(float(1).sub(sloped.mul(0.7)));
    const wet = float(1).sub(smoothstep(0.15, 0.75, above.add(n.z.sub(0.5).mul(0.5))));
    const seabed = float(1).sub(smoothstep(-1.6, -0.5, above.add(n.z.sub(0.5).mul(0.7))));
    const roles: F[] = [float(1), float(0), float(0), float(0), float(0), float(0)];
    const lay = (role: number, t: F) => {
      for (let k = 0; k < ROLE_COUNT; k++) roles[k] = roles[k].mul(float(1).sub(t));
      roles[role] = roles[role].add(t);
    };
    lay(ROLE.slope, sloped);
    lay(ROLE.beach, beach);
    lay(ROLE.wetShore, wet);
    lay(ROLE.seabed, seabed);
    lay(ROLE.cliff, cliff);
    const roleW = roles.map((x) => x.toVar());

    // ----- the three strongest of the twelve candidates
    const pick = Array.from({ length: PAINTED }, () => ({ at: int(0).toVar(), w: float(0).toVar() }));
    const offer = (at: I, x: F) => {
      If(x.greaterThan(pick[0].w), () => {
        pick[2].at.assign(pick[1].at); pick[2].w.assign(pick[1].w);
        pick[1].at.assign(pick[0].at); pick[1].w.assign(pick[0].w);
        pick[0].at.assign(at); pick[0].w.assign(x);
      }).ElseIf(x.greaterThan(pick[1].w), () => {
        pick[2].at.assign(pick[1].at); pick[2].w.assign(pick[1].w);
        pick[1].at.assign(at); pick[1].w.assign(x);
      }).ElseIf(x.greaterThan(pick[2].w), () => {
        pick[2].at.assign(at); pick[2].w.assign(x);
      });
    };
    for (let k = 0; k < ROLE_COUNT; k++) {
      offer(ra.mul(ROLE_COUNT).add(k), roleW[k].mul(float(1).sub(tb)));
      offer(rb.mul(ROLE_COUNT).add(k), roleW[k].mul(tb));
    }

    // ----- painting one candidate
    // the gradients of the world position, taken here where every fragment of a quad runs, so the samples inside the
    // branches below can be filtered with them
    const dpx = vec3(0).toVar('landDpx'), dpy = vec3(0).toVar('landDpy');
    dpx.assign(dFdx(p));
    dpy.assign(dFdy(p));
    const tri = pow(abs(gn), vec3(6)).toVar();
    const triW = tri.div(tri.x.add(tri.y).add(tri.z)).toVar('landTriplanar');
    // the scans' grain is left off with distance, and under the sea once the water over it is deep enough to hide it:
    // the seabed through deep water shows only its colour, and painting it (three scans a pixel, each along up to
    // three axes) was most of what the land cost the iPad, the open sea's floor being most of the screen
    const detailFade = float(1).sub(smoothstep(FAR - FADE, FAR, dist)).mul(smoothstep(-DEEP, -DEEP / 2, above)).toVar('landDetail');
    const flatten = mix(float(1), float(0.45), smoothstep(30, 160, dist)).toVar();
    const broadly = smoothstep(18, 80, dist).toVar();
    const facesX = triW.x.greaterThan(triW.y).and(triW.x.greaterThan(triW.z)).toVar();
    const facesY = triW.y.greaterThan(triW.z).toVar();
    const broadUv = select(facesX, p.zy, select(facesY, p.xz, p.xy)).toVar();
    const broadGx = select(facesX, dpx.zy, select(facesY, dpx.xz, dpx.xy)).toVar();
    const broadGy = select(facesX, dpy.zy, select(facesY, dpy.xz, dpy.xy)).toVar();

    interface Paint { colour: V3; height: F; normal: V3; rough: F; ao: F; wet: F }
    const paint = (at: I): Paint => {
      const look = vec4(element(scans.paint, at)).toVar();
      const far = vec4(element(scans.far, at)).toVar();
      const feel = vec4(element(scans.feel, at)).toVar();
      const colour = vec3(far.rgb).toVar();
      const height = float(feel.w).toVar();
      const nrm = vec3(gn).toVar();
      const rgh = float(feel.z).toVar();
      const ao = float(1).toVar();
      If(far.w.greaterThanEqual(0).and(detailFade.greaterThan(0)), () => {
        const layer = int(far.w).toVar();
        const k = float(1).div(look.w).toVar();
        const s = vec4(0).toVar();
        const d = vec4(0).toVar();
        const nAcc = vec3(0).toVar();
        const strength = feel.y.mul(flatten).toVar();
        // one projection: the surface along an axis, hex-tiled, its normal turned into the world (Golus's whiteout
        // blend); `spin` is how freely the hexes turn, less on the walls, whose strata keep to the level
        const project = (uv: V2, gx: V2, gy: V2, weight: F, toWorld: (t: V3) => V3, axisN: V2, axisZ: F, spin: number) => {
          If(weight.greaterThan(0.002), () => {
            const t = hexTiled(surfaceMap, detailMap, layer, uv.mul(k), gx.mul(k), gy.mul(k), spin);
            s.addAssign(t.surface.mul(weight));
            d.addAssign(t.detail.mul(weight));
            const t2 = t.tilt.mul(strength);
            const tz = sqrt(max(float(1).sub(dot(t2, t2)), 0));
            const blended = vec3(t2.add(axisN), tz.mul(axisZ));
            nAcc.addAssign(toWorld(blended).mul(weight));
          });
        };
        project(p.zy, dpx.zy, dpy.zy, triW.x, (t) => vec3(t.z, t.y, t.x), gn.zy, gn.x, WALL_SPIN);
        project(p.xz, dpx.xz, dpy.xz, triW.y, (t) => vec3(t.x, t.z, t.y), gn.xz, gn.y, 1);
        project(p.xy, dpx.xy, dpy.xy, triW.z, (t) => vec3(t.x, t.y, t.z), gn.xy, gn.z, WALL_SPIN);
        // further off, the scan's own light and dark at seven times its size, over its mean, so the ground keeps its
        // character where the mips have flattened it (sampled once, along the plane the ground faces most)
        If(broadly.greaterThan(0), () => {
          const wide = k.div(7);
          const big = (surfaceMap.sample(broadUv.mul(wide)).depth(layer).grad(broadGx.mul(wide), broadGy.mul(wide)) as unknown as Node<'vec4'>).rgb;
          const mean = far.rgb.div(max(look.rgb, vec3(1e-3)));
          const ratio = clamp(luma(big).div(max(luma(mean), 1e-3)), 0.45, 1.8);
          s.assign(vec4(s.rgb.mul(mix(float(1), ratio, broadly.mul(0.7))), s.a));
        });
        colour.assign(mix(far.rgb, s.rgb.mul(look.rgb), detailFade));
        height.assign(mix(feel.w, s.a, detailFade));
        nrm.assign(normalize(mix(gn, normalize(nAcc), detailFade)));
        rgh.assign(mix(feel.z, d.z, detailFade));
        ao.assign(mix(float(1), d.w, detailFade));
      });
      return { colour, height, normal: nrm, rough: rgh, ao, wet: feel.x };
    };

    const painted = pick.map((c) => {
      const out = { colour: vec3(0).toVar(), height: float(0).toVar(), normal: vec3(gn).toVar(), rough: float(0.9).toVar(), ao: float(1).toVar(), wet: float(0).toVar() };
      If(c.w.greaterThan(0.004), () => {
        const s = paint(c.at);
        out.colour.assign(s.colour);
        out.height.assign(s.height);
        out.normal.assign(s.normal);
        out.rough.assign(s.rough);
        out.ao.assign(s.ao);
        out.wet.assign(s.wet);
      });
      return out;
    });

    // ----- blended by height
    const lift = painted.map((s, i) => pick[i].w.add(s.height.mul(HEIGHT_PUSH)).mul(select(pick[i].w.greaterThan(0.004), float(1), float(0))).toVar());
    const soft = mix(float(HEIGHT_SOFT), float(0.5), smoothstep(15, 120, dist));
    const top = max(max(lift[0], lift[1]), lift[2]).sub(soft);
    const b = lift.map((x) => max(x.sub(top), 0));
    const total = max(b[0].add(b[1]).add(b[2]), 1e-5);
    const share3 = b.map((x) => x.div(total));
    const sum3 = (f: (s: (typeof painted)[number]) => V3): V3 =>
      f(painted[0]).mul(share3[0]).add(f(painted[1]).mul(share3[1])).add(f(painted[2]).mul(share3[2]));
    const sum1 = (f: (s: (typeof painted)[number]) => F): F =>
      f(painted[0]).mul(share3[0]).add(f(painted[1]).mul(share3[1])).add(f(painted[2]).mul(share3[2]));
    const a = sum3((s) => s.colour).toVar();
    const h = sum1((s) => s.height).toVar();
    const nb = normalize(sum3((s) => s.normal)).toVar();
    const rg = sum1((s) => s.rough).toVar();
    const ao = sum1((s) => s.ao).toVar();
    const layerWet = sum1((s) => s.wet);

    // ----- the lie of the land: drier and lusher ground, lighter and darker, in sweeps a hundred metres across, and
    // what grows (or is bare) varies most
    const living = clamp(roleW[ROLE.top].add(roleW[ROLE.slope].mul(0.7)), 0, 1);
    const green = clamp(a.g.sub(max(a.r, a.b)).div(max(a.g, 1e-3)).mul(4), 0, 1);
    const dry = smoothstep(0.42, 0.85, broad.g.add(patchy.a.sub(0.5).mul(0.3))).mul(living).mul(green).mul(0.7);
    a.assign(mix(a, vec3(luma(a)).mul(vec3(1.32, 1.08, 0.58)), dry));
    a.assign(a.mul(mix(float(0.74), float(1.2), broad.r).mul(mix(float(0.9), float(1.08), patchy.b))));

    // ----- the weather
    const facing = dot(nb, up);
    const cliffShare = roleW[ROLE.cliff];
    const rocky = clamp(cliffShare.add(roleW[ROLE.wetShore]), 0, 1);

    // moss on the shaded faces of rock: those turned from the sun's usual path, toward the nearer pole, and low in
    // their own relief, where the damp stays
    const mossHere = mix(element(moss, ra).x, element(moss, rb).x, tb);
    const pole = vec3(0, select(up.y.lessThan(0), float(-1), float(1)), 0);
    const poleward = normalize(pole.sub(up.mul(dot(pole, up))).add(vec3(1e-4, 0, 0)));
    const shaded = smoothstep(-0.1, 0.6, dot(nb, poleward)).mul(float(1).sub(ao.mul(0.6)).add(0.4));
    const mossy = clamp(mossHere.mul(cliffShare.add(roleW[ROLE.slope].mul(0.35))).mul(shaded)
      .mul(smoothstep(0.35, 0.65, n.y.add(float(0.55).sub(h).mul(0.8)))).mul(smoothstep(1.5, 3, above)), 0, 1);
    a.assign(mix(a, MOSS_COLOUR.mul(mix(float(0.8), float(1.25), n.z)), mossy));
    rg.assign(mix(rg, float(0.92), mossy));

    // salt, dried white on the rock in a band above the tideline, on the ridges of its relief
    const band = smoothstep(0.35, 0.9, above).mul(float(1).sub(smoothstep(1.3, float(2.2).add(n.x.mul(1.2)), above)));
    const salt = clamp(band.mul(rocky).mul(smoothstep(0.5, 0.8, h.add(n.z.sub(0.5).mul(0.7)).add(n.y.sub(0.5).mul(0.4)))).mul(0.55), 0, 1);
    a.assign(mix(a, SALT, salt));
    rg.assign(mix(rg, float(0.75), salt));

    // wetness: the layer's own, the spray's and the tide's band over the sea, and the rain on whatever faces up
    const spray = float(1).sub(smoothstep(0.1, float(1.1).add(n.x.mul(0.7)), above));
    const rained = P.rain.mul(smoothstep(-0.3, 0.5, facing));
    const wetness = clamp(max(max(layerWet, spray), rained.mul(0.9)), 0, 1);
    // a porous surface darkens as its pores fill; the film of water on top is glossy
    a.assign(a.mul(mix(float(1), float(0.45), wetness.mul(float(1).sub(salt.mul(0.6))))));
    rg.assign(mix(rg, float(0.14), wetness));
    // puddles stand in the hollows of level ground in the rain
    const level = smoothstep(0.9, 0.97, dot(gn, up));
    const puddle = P.rain.mul(level).mul(smoothstep(0.45, 0.3, h.add(n.y.sub(0.5).mul(0.35)))).mul(smoothstep(0.2, 0.6, above));
    a.assign(a.mul(mix(float(1), float(0.6), puddle)));
    rg.assign(mix(rg, float(0.03), puddle));
    nb.assign(normalize(mix(nb, gn, puddle)));

    // snow on whatever faces up, deepest in the hollows the wind fills
    const snowy = clamp(P.snow.mul(1.6).sub(float(1).sub(smoothstep(0.45, 0.85, facing.add(n.y.sub(0.5).mul(0.3))))).sub(h.mul(0.35)), 0, 1)
      .mul(smoothstep(0.2, 0.8, above));
    a.assign(mix(a, SNOW, snowy));
    rg.assign(mix(rg, float(0.55), snowy));
    nb.assign(normalize(mix(nb, gn, snowy.mul(0.7))));
    ao.assign(mix(ao, float(1), snowy));

    // the scars of the match: where shot and fire struck, the ground is charred for the rest of it (gpu/marks.ts)
    const scar = vec4(marksAt(p, n.z)).toVar('landScar');
    const scarred = scorch(a, rg, scar, n.z);
    a.assign(scarred.albedo);
    rg.assign(scarred.rough);
    heat.assign(scarred.glow.mul(smoothstep(-0.3, 0.2, above)));

    // the surf on the sand: the swash running up the shore and back with the waves, and a band of foam in the wash
    // just under the water's edge, where the sea's own surf (ocean/surface.ts) meets the land; at night it glows
    const fn = noiseMap.sample(q.mul(0.11).add(vec2(P.time.mul(0.01), 0))).b;
    const surge = sin(P.time.mul(1.1).add(fn.mul(5))).mul(0.25).sub(0.05);
    const swash = smoothstep(0.35, 0, abs(above.sub(surge))).mul(smoothstep(0.35, 0.65, fn.add(0.15))).mul(smoothstep(-2, 0, above));
    const wash = smoothstep(0.8, 1, sin(above.mul(-4).sub(P.time.mul(1.6)).add(fn.mul(4))))
      .mul(smoothstep(-1.6, -0.2, above)).mul(step(above, 0)).mul(smoothstep(0.35, 0.7, fn));
    const surf = clamp(swash.mul(0.9).add(wash.mul(0.4)), 0, 1).mul(float(1).sub(snowy));
    a.assign(mix(a, SURF, surf));
    rg.assign(mix(rg, float(0.6), surf));
    glow.assign(surf.mul(fn.add(0.6)));

    albedo.assign(a);
    // the lab's looks inside: 1 the roles, 2 the nearer region, 3 the strongest candidate's scan untinted, 4 its slot,
    // 5 the axis the ground is projected along (red x, green y, blue z, grey between)
    If(LAND.debug.equal(1), () => {
      albedo.assign(ROLE_COLOURS.reduce((c, col, k) => c.add(vec3(...col).mul(roleW[k])), vec3(0) as V3));
    }).ElseIf(LAND.debug.equal(2), () => {
      albedo.assign(vec3(fract(float(ra).mul(0.618)), fract(float(ra).mul(0.381).add(0.3)), fract(float(ra).mul(0.211).add(0.6))).mul(0.6));
    }).ElseIf(LAND.debug.equal(3), () => {
      albedo.assign(painted[0].colour.div(max(element(scans.paint, pick[0].at).rgb, vec3(1e-3))));
    }).ElseIf(LAND.debug.equal(5), () => {
      albedo.assign(select(triW.x.greaterThan(0.5), vec3(0.6, 0, 0), select(triW.y.greaterThan(0.5), vec3(0, 0.6, 0), select(triW.z.greaterThan(0.5), vec3(0, 0, 0.6), vec3(0.6)))));
    }).ElseIf(LAND.debug.equal(4), () => {
      const slot = element(scans.far, pick[0].at).w;
      albedo.assign(select(slot.lessThan(0), vec3(0.6, 0, 0), vec3(fract(slot.mul(0.618)), fract(slot.mul(0.381).add(0.3)), 0.4).mul(0.6)));
    });
    normal.assign(nb);
    rough.assign(clamp(rg, 0.03, 1));
    occlusion.assign(ao);
  };

  mat.colorNode = Fn(() => {
    ground();
    return albedo;
  })();
  mat.normalNode = cameraViewMatrix.mul(vec4(normal, 0)).xyz.normalize();
  mat.roughnessNode = rough;
  mat.aoNode = occlusion;
  // the surf's glow at night, the sea's own light (actors' scale)
  mat.emissiveNode = vec3(0.1, 0.75, 1.0).mul(glow.mul(P.night).mul(0.35)).add(heat.mul(1.6)).mul(LAMP.mul(2.5));
  return mat;
}

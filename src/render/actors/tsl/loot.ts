// The loot's marks as node materials. The cask or crate itself is plain lit wood. Round it an iron outline, an
// inverted hull swollen a couple of pixels whatever the range, so the piece reads as inked on the sea. Over it a
// column of hatching in its rarity's ink: short strokes scrolling upward, one a row, each its own length and lean,
// thinning up the column and into a plain line of its colour far off, crossed in the player's reach. The hatching
// is written on the screen (the stage's overlay, after the exposure and the tone curve) so its ink is the chart's own
// by day and by night, and is hidden behind the world by the scene's own depth, read back from its pass.
import {
  BackSide, MeshBasicNodeMaterial, MeshStandardNodeMaterial, NormalBlending, type Color, type Texture,
} from 'three/webgpu';
import {
  abs, attribute, cameraFar, cameraNear, cameraPosition, cameraProjectionMatrix, clamp, cross, dot, float, floor, fract, hash, length, max, mix,
  modelWorldMatrix, normalLocal, normalize, perspectiveDepthToViewZ, positionLocal, positionView, positionWorld, screenSize, screenUV,
  select, smoothstep, sqrt, texture, uv, varying, vec3, vec4,
} from 'three/tsl';
import { P } from '../../gpu/uniforms.ts';
import type { F, V2, V4 } from './kit.ts';

/** Metres a pixel of the pass being drawn covers at a distance from the eye. */
const metresPerPixel = (d: F): F =>
  d.mul(2).div((cameraProjectionMatrix as unknown as { element(i: number): V4 }).element(1).y.mul(screenSize.y));

/** The piece's own wood, lit as the ships are. */
export function woodNodeMaterial(colour: number, roughness: number): MeshStandardNodeMaterial {
  return new MeshStandardNodeMaterial({ color: colour, roughness, metalness: 0 });
}

/** The ink line round a piece: its back faces pushed out along the normals by `px` pixels of the scene's pass. */
export function outlineNodeMaterial(ink: Color, px: number): MeshBasicNodeMaterial {
  const m = new MeshBasicNodeMaterial({ side: BackSide });
  m.fog = false;
  const wp = modelWorldMatrix.mul(vec4(positionLocal, 1)).xyz;
  m.positionNode = positionLocal.add(normalize(normalLocal).mul(metresPerPixel(cameraPosition.distance(wp)).mul(px)));
  m.colorNode = vec3(ink.r, ink.g, ink.b);
  return m;
}

/** Metres of the column one stroke row takes. */
const ROW = 0.42;

/**
 * The column of hatching, one instanced quad a piece: iFoot its foot on the water (w a phase of its own), iInk its
 * ink (w 1 in the player's reach), iSize its height and width in metres. `sceneDepth` is the scene pass's depth, for
 * the column to be hidden where the world stands in front of it; without it the column is drawn over everything.
 */
export function hatchNodeMaterial(sceneDepth: Texture | null): MeshBasicNodeMaterial {
  const m = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, depthTest: false, blending: NormalBlending });
  m.fog = false;
  const foot = attribute<'vec4'>('iFoot') as V4, ink = attribute<'vec4'>('iInk') as V4, size = attribute<'vec2'>('iSize') as V2;
  const q = uv();
  // the column stands on its foot's up, turned to face the eye, and is never under five pixels wide
  const up = normalize(foot.xyz), toEye = cameraPosition.sub(foot.xyz);
  const right = normalize(cross(up, toEye));
  const mpp = varying(metresPerPixel(length(toEye)), 'vLootMpp');
  const w = varying(max(size.y, mpp.mul(5)), 'vLootW');
  m.positionNode = foot.xyz.add(up.mul(q.y.mul(size.x))).add(right.mul(q.x.sub(0.5).mul(w)));

  const near = ink.w;
  // the column's own metres, scrolled upward
  const y = q.y.mul(size.x).sub(P.time.mul(mix(1.2, 2.4, near))).add(foot.w);
  const x = q.x.sub(0.5).mul(w);
  // a row is never under seven pixels, a stroke never under two and a half wide, so the hatching keeps its weight as
  // it recedes; ends and edges soften over about a pixel, and each stroke lies on a pale fringe of lead white, the
  // body a pen leaves, which lifts the ink off dark water
  const row = varying(max(float(ROW), mpp.mul(7)), 'vLootRow');
  const thick = max(float(0.1), mpp.mul(2.5)), soft = mpp;
  /** One short stroke a row, leaning `lean` of the width, its length and lean a little its own: the ink, and the
   *  fringe round it. */
  const strokes = (ym: F, lean: number): [F, F] => {
    const r = ym.div(row), k = floor(r), fy = fract(r);
    const h1 = hash(k.add(foot.w.mul(31.7))), h2 = hash(k.mul(7.3).add(2.1)), h3 = hash(k.mul(3.9).add(foot.w));
    // the stroke spans about half the width, set somewhere across it
    const span = w.mul(lean).mul(h1.mul(0.5).add(0.6));
    const xl = h3.sub(0.5).mul(w.sub(abs(span))).mul(0.9).add(fy.sub(0.5).mul(span));
    const len = h2.mul(0.5).add(0.45), lo = float(0.5).sub(len.mul(0.5)), hi = float(0.5).add(len.mul(0.5));
    const along = smoothstep(0, soft.div(row), fy.sub(lo)).mul(smoothstep(0, soft.div(row), hi.sub(fy)));
    const dx = abs(x.sub(xl));
    return [smoothstep(thick.add(soft), thick.sub(soft.mul(0.5)), dx).mul(along), smoothstep(thick.add(soft.mul(3)), thick, dx).mul(along)];
  };
  const [ink1, fringe1] = strokes(y, 0.5);
  // in the player's reach the hatching is crossed
  const [ink2, fringe2] = strokes(y.add(row.mul(0.5)), -0.5);
  // the ink thins toward the top of the column; far off, as the column narrows under some twenty pixels, the strokes
  // give way to a line of the colour, fringed the same
  const rise = float(1).sub(smoothstep(0.55, 1, q.y));
  const detail = varying(clamp(w.div(mpp).sub(8).div(16), 0, 1), 'vLootDetail');
  const dq = abs(q.x.sub(0.5));
  const lineInk = smoothstep(0.5, 0.25, dq), lineFringe = smoothstep(0.5, 0.42, dq);
  const inked = mix(lineInk, max(ink1, ink2.mul(near)), detail), fringed = mix(lineFringe, max(fringe1, fringe2.mul(near)), detail);
  let a: F = max(inked, fringed.mul(0.55)).mul(rise).mul(mix(0.9, 1, near));
  const colour = mix(vec3(0.97, 0.93, 0.82), ink.rgb, inked.div(max(fringed, 0.001)));
  if (sceneDepth) {
    const z = perspectiveDepthToViewZ(texture(sceneDepth, screenUV), cameraNear, cameraFar);
    a = select(positionView.z.lessThan(z.sub(0.6)), float(0), a);
  }
  // the sea writes no depth, so the planet's own curve hides what stands beyond the horizon: the eye's ray to the
  // fragment meets the sea's sphere first
  const rs = (P.planet as unknown as V4).y.sub(0.5);
  const toHere = positionWorld.sub(cameraPosition), reach = length(toHere), dir = toHere.div(reach);
  const b = dot(cameraPosition, dir), disc = b.mul(b).sub(dot(cameraPosition, cameraPosition).sub(rs.mul(rs)));
  const hit = b.negate().sub(sqrt(max(disc, 0)));
  a = select(disc.greaterThan(0).and(hit.greaterThan(0)).and(hit.lessThan(reach)), float(0), a);
  m.colorNode = colour;
  m.opacityNode = a;
  m.alphaTest = 0.004;
  return m;
}

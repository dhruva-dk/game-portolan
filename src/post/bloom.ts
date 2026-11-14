// Bloom: light brighter than any surface (the loot's beams, lightning, a gun's flash, the sun and its glints on the
// sea) spilling softly round itself, as it does in a lens and in the eye. A surface in the sun, however pale, is under
// its knee: flat colours stay flat. A dual filter at low resolution: the scene's light over a soft knee is
// taken down to a quarter of the frame's size in one step of four bilinear taps (a 4×4 box), each tap weighted by
// 1/(1 + its brightness) so a single sparkling pixel of glint cannot flash a whole block (Karis); then halved three
// times more with the same four taps, and brought back up, each level a tent of four taps over the one below plus
// its own. What comes out is a quarter of the frame's size, read bilinearly.
//
// Cost at the phone's 956×440: 7 passes of 4–5 taps, the largest 239×110 — about 0.2 M taps a frame.

import type { TextureNode } from 'three/webgpu';
import { Fn, abs, dFdx, dFdy, float, luminance, rtt, smoothstep, uv, vec2, vec4 } from 'three/tsl';
import type { FloatNode, Vec4Node } from '../tsl';

/** The soft knee, in the scene's light per unit sun times the exposure's 2^stops (so in what the eye sees): bloom
 *  starts at KNEE[0] and takes everything past KNEE[1]. White foam in the open is 1. */
const KNEE = [1.15, 2.4] as const;

/** Four bilinear taps at the corners of a square round uv, `spread` of this pass's own pixels out: in a source twice
 *  as fine (spread ½: one of its texels), a 4×4 box of it; in one half as fine (spread 1), a tent. */
const four = (t: TextureNode, spread: number, karis: boolean): Vec4Node => {
  const d = vec2(abs(dFdx(uv().x)), abs(dFdy(uv().y))).mul(spread);
  const taps = [vec2(-1, -1), vec2(1, -1), vec2(-1, 1), vec2(1, 1)].map((o) => t.sample(uv().add(o.mul(d))).rgb);
  if (!karis) return vec4(taps[0].add(taps[1]).add(taps[2]).add(taps[3]).mul(0.25), 1);
  const w = taps.map((c) => float(1).div(luminance(c).add(1)));
  const sum = taps[0].mul(w[0]).add(taps[1].mul(w[1])).add(taps[2].mul(w[2])).add(taps[3].mul(w[3]));
  return vec4(sum.div(w[0].add(w[1]).add(w[2]).add(w[3])), 1);
};

/** The bloom of `scene` (the frame's linear light, full size) at `gain` (the exposure, a factor on that light). */
export function bloom(scene: TextureNode, gain: FloatNode): TextureNode {
  const knee = Fn(() => {
    const c = four(scene, 1 / 4, true).rgb;
    const y = luminance(c).mul(gain);
    return vec4(c.mul(smoothstep(KNEE[0], KNEE[1], y)), 1);
  })();
  const q = (node: Vec4Node, scale: number) => rtt(node, null, null, { resolutionScale: scale, depthBuffer: false });
  const d1 = q(knee, 1 / 4), d2 = q(four(d1, 1 / 2, false), 1 / 8), d3 = q(four(d2, 1 / 2, false), 1 / 16), d4 = q(four(d3, 1 / 2, false), 1 / 32);
  const up = (low: TextureNode, same: TextureNode, scale: number) =>
    q(vec4(four(low, 1, false).rgb.add(same.sample(uv()).rgb), 1), scale);
  const u3 = up(d4, d3, 1 / 16), u2 = up(u3, d2, 1 / 8);
  return up(u2, d1, 1 / 4);
}

/** The bloom's levels, summed in what bloom() gives: divide by this for their mean. */
export const BLOOM_LEVELS = 4;

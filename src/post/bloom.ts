import type { TextureNode } from 'three/webgpu';
import {
  Fn,
  abs,
  dFdx,
  dFdy,
  float,
  luminance,
  rtt,
  smoothstep,
  uv,
  vec2,
  vec4,
} from 'three/tsl';
import type { FloatNode, Vec4Node } from '../tsl.ts';

const KNEE = [1.15, 2.4] as const;

const four = (t: TextureNode, spread: number, karis: boolean): Vec4Node => {
  const d = vec2(abs(dFdx(uv().x)), abs(dFdy(uv().y))).mul(spread);
  const taps = [vec2(-1, -1), vec2(1, -1), vec2(-1, 1), vec2(1, 1)].map(
    (o) => t.sample(uv().add(o.mul(d))).rgb
  );
  if (!karis)
    return vec4(taps[0].add(taps[1]).add(taps[2]).add(taps[3]).mul(0.25), 1);
  const w = taps.map((c) => float(1).div(luminance(c).add(1)));
  const sum = taps[0]
    .mul(w[0])
    .add(taps[1].mul(w[1]))
    .add(taps[2].mul(w[2]))
    .add(taps[3].mul(w[3]));
  return vec4(sum.div(w[0].add(w[1]).add(w[2]).add(w[3])), 1);
};

export function bloom(scene: TextureNode, gain: FloatNode): TextureNode {
  const knee = Fn(() => {
    const c = four(scene, 1 / 4, true).rgb;
    const y = luminance(c).mul(gain);
    return vec4(c.mul(smoothstep(KNEE[0], KNEE[1], y)), 1);
  })();
  const q = (node: Vec4Node, scale: number) =>
    rtt(node, null, null, { resolutionScale: scale, depthBuffer: false });
  const down = (fine: TextureNode, scale: number) =>
    q(four(fine, 1 / 2, false), scale);
  const d1 = q(knee, 1 / 4),
    d2 = down(d1, 1 / 8),
    d3 = down(d2, 1 / 16),
    d4 = down(d3, 1 / 32);
  const up = (low: TextureNode, same: TextureNode, scale: number) =>
    q(vec4(four(low, 1, false).rgb.add(same.sample(uv()).rgb), 1), scale);
  const u3 = up(d4, d3, 1 / 16),
    u2 = up(u3, d2, 1 / 8);
  return up(u2, d1, 1 / 4);
}

export const BLOOM_LEVELS = 4;

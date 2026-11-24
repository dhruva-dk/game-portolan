import {
  abs,
  float,
  max,
  min,
  mix,
  saturate,
  sin,
  smoothstep,
  texture,
} from 'three/tsl';
import type { Read } from '../view/charts.ts';
import { CASCADES } from '../../world/cascades.ts';
import { FOAMING, type Waves } from './waves.ts';
import type { FloatNode } from '../tsl.ts';

const LOBE = 1.6,
  BENT = 0.9;
const SCALLOP = 0.8;
const CRISP = 0.03;
const LINE = 0.3,
  EDGE = 0.012;
const AIR = 0.7,
  PLUME = 1;

export function createFoam(waves: Waves) {
  return (
    c: Read,
    other: FloatNode,
    thickness: FloatNode,
    footprint: FloatNode
  ): { foam: FloatNode; air: FloatNode } => {
    let whitecap: FloatNode = float(0);
    CASCADES.slice(0, FOAMING).forEach((L, k) => {
      whitecap = whitecap.add(
        texture(waves.displacement[k], c.q.div(L)).grad(
          c.dx.div(L),
          c.dy.div(L)
        ).w
      );
    });
    const cover = saturate(whitecap.add(other));
    const swash = smoothstep(0, EDGE, thickness).mul(
      smoothstep(LINE, LINE * 0.3, thickness)
    );
    const all = saturate(max(cover, swash));
    const u = c.q.mul(Math.PI / LOBE);
    const field = abs(sin(u.x.add(sin(u.y.mul(0.7)).mul(BENT)))).mul(
      abs(sin(u.y.mul(0.8).add(sin(u.x.mul(0.6)).mul(BENT))))
    );
    const fine = smoothstep(LOBE * 0.25, LOBE * 1.5, footprint);
    const cutAt = all
      .add(mix(field, float(0.4), fine).sub(0.5).mul(SCALLOP))
      .sub(0.5);
    const w = min(
      max(mix(float(CRISP), float(0.5), fine), footprint.mul(SCALLOP / LOBE)),
      0.5
    );
    const foam = smoothstep(w.negate(), w, cutAt).mul(smoothstep(0, 0.05, all));
    return { foam, air: cover.mul(AIR).mul(saturate(thickness.div(PLUME))) };
  };
}

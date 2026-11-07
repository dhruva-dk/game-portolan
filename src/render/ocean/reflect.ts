// What the sea mirrors besides the sky: ships, islands, rocks and the lanterns, found in the frame already drawn.
//
// Stochastic screen-space reflections (Stachowiak, "Stochastic Screen-Space Reflections", SIGGRAPH 2015), cut down
// for water. From each fragment of the sea a ray is reflected about the wave's normal (tilted a little at random by
// the surface's unresolved roughness, a fresh tilt each frame, which the upscaler's history averages into the
// glossy blur), and marched through the depth of the scene drawn before the sea in steps that lengthen with
// distance, since the far shore is wide and the near hull is close. Where a step passes just behind a surface the
// march backs up and halves in on it, and the colour drawn there is what the ray sees. Nothing in the depth is
// water, so the sea never finds itself.
//
// What it finds stands in for the sky's reflection in the light the surface sends back (the sea's lighting model
// below swaps it into the environment's radiance before the GGX split-sum weighs it), so a dark hull darkens the
// water under it where an added term could only brighten it. It gives way to the sky probe toward the frame's
// edges, where a ray runs off what was drawn; with distance along the ray; and on rays turned back toward the eye,
// which a single view cannot see. The march is skipped wherever the water reflects almost nothing (Fresnel looking
// down into it), which is most of the sea near the ship.
import { PhysicalLightingModel, type NodeBuilder, type Node } from 'three/webgpu';
import {
  Break, Fn, If, Loop, cameraFar, cameraNear, cameraProjectionMatrix, cameraViewMatrix, cameraWorldMatrix, clamp, float, interleavedGradientNoise, length, max,
  min, mix, normalize, perspectiveDepthToViewZ, positionView, reflect, screenCoordinate, select, smoothstep, vec2, vec3, vec4,
} from 'three/tsl';
import { beneathColour, beneathDepth } from '../gpu/behind.ts';
import { P } from '../gpu/uniforms.ts';
import { PARKED } from '../gpu/parked.ts';

type F = Node<'float'>;
type V3 = Node<'vec3'>;
type V4 = Node<'vec4'>;

/** Steps along the ray, the first one's length (m) and how much longer each is than the last. */
const STEPS = 15;
const FIRST = 0.35;
const GROW = 1.5;
/** Halvings onto a surface once a step has passed behind it. */
const REFINE = 4;
/** The reflection gives way to the sky beyond this share of the ray's reach. */
const REACH = FIRST * ((GROW ** STEPS - 1) / (GROW - 1));

/**
 * The reflection seen at this fragment of the sea: colour, and how much of the sky's reflection it replaces.
 * `normal` is the surface's normal in the world, `rough` its GGX α, `fresnel` how much it reflects looking this way.
 */
export function seaReflection(normal: V3, rough: F, fresnel: F): V4 {
  // parked, the sea mirrors the sky's probe alone
  if (PARKED.seaReflections) return vec4(0);
  return Fn(() => {
    const out = vec4(0).toVar('seaReflect');
    If(fresnel.greaterThan(0.05), () => {
      const pv = positionView;
      // the normal tilted at random within the roughness, differently each frame
      const s = screenCoordinate.xy.add(P.frame.mul(5.588238));
      const jitter = vec3(interleavedGradientNoise(s), interleavedGradientNoise(s.add(vec2(17.3, 41.9))), interleavedGradientNoise(s.add(vec2(83.1, 7.7))))
        .sub(0.5).mul(rough.mul(0.9));
      const n = normalize(cameraViewMatrix.mul(vec4(normal, 0)).xyz.add(jitter));
      const r = reflect(normalize(pv), n).toVar();
      // turned back toward the eye: what it would find is behind what the frame shows
      const away = smoothstep(0.55, 0.1, r.z);
      If(away.greaterThan(0), () => {
        const start = interleavedGradientNoise(s.add(vec2(3.7, 61.3)));
        const t = float(FIRST).mul(start.add(0.5)).toVar(), dt = float(FIRST).toVar();
        const hitT = float(-1).toVar();
        const behind = (at: V3) => {
          const clip = cameraProjectionMatrix.mul(vec4(at, 1));
          const uv = clip.xy.div(clip.w).mul(vec2(0.5, -0.5)).add(0.5);
          const depth = beneathDepth(uv).x;
          const scene = perspectiveDepthToViewZ(depth, cameraNear, cameraFar);
          // what the frame shows there, in the world: the sky (at the far plane) and the seabed seen through the
          // water (the sea itself is not in the depth) are nothing a ray from above the water could meet
          const seen = cameraWorldMatrix.mul(vec4(at.mul(scene.div(at.z)), 1)).xyz;
          const solid = depth.lessThan(0.99999).and(length(seen).greaterThan(P.planet.y.sub(0.3)));
          return { uv, gap: select(solid, scene.sub(at.z), float(-1)), scene, w: clip.w };
        };
        const last = float(0).toVar();
        Loop(STEPS, () => {
          const at = pv.add(r.mul(t));
          const { uv, gap, scene, w } = behind(at);
          If(w.lessThan(0.01).or(uv.x.lessThan(0)).or(uv.x.greaterThan(1)).or(uv.y.lessThan(0)).or(uv.y.greaterThan(1)), () => { Break(); });
          // behind a surface, by no more than the step could have carried it past one, nor more than a thing that
          // far off is likely to be thick: a hit
          If(gap.greaterThan(0).and(gap.lessThan(min(max(dt.mul(1.5), 0.4), scene.negate().mul(0.12).add(1.5)))), () => {
            hitT.assign(t);
            Break();
          });
          last.assign(t);
          dt.mulAssign(GROW);
          t.addAssign(dt);
        });
        If(hitT.greaterThan(0), () => {
          // halve in on it between the last step in front and the first behind
          const lo = last.toVar(), hi = hitT.toVar();
          Loop(REFINE, () => {
            const mid = lo.add(hi).mul(0.5);
            const { gap } = behind(pv.add(r.mul(mid)));
            If(gap.greaterThan(0), () => { hi.assign(mid); }).Else(() => { lo.assign(mid); });
          });
          const { uv } = behind(pv.add(r.mul(hi)));
          const edge = smoothstep(0, 0.07, min(min(uv.x, float(1).sub(uv.x)), min(uv.y, float(1).sub(uv.y))));
          const far = smoothstep(1, 0.6, hi.div(REACH));
          out.assign(vec4(beneathColour(uv).rgb, clamp(edge.mul(far).mul(away), 0, 1)));
        });
      });
    });
    return out;
  })() as unknown as V4;
}

/** The sea's light: three's physical model, with what the sea reflects of the frame put in for the sky behind it. */
export class SeaLight extends PhysicalLightingModel {
  readonly #reflection: () => V4;

  constructor(reflection: () => V4, flags: boolean[]) {
    super(...(flags as [boolean, boolean, boolean, boolean, boolean, boolean]));
    this.#reflection = reflection;
  }

  indirectSpecular(builder: NodeBuilder): void {
    const radiance = (builder.context as unknown as { radiance: V3 }).radiance;
    const found = this.#reflection();
    radiance.assign(mix(radiance, found.rgb, found.a));
    (PhysicalLightingModel.prototype as unknown as { indirectSpecular(b: NodeBuilder): void }).indirectSpecular.call(this, builder);
  }
}

// The moonbow under Moonbow Arch. The swell breaks on the arch's feet and throws spray up into
// the passage, where it hangs and drifts on the wind. The spray is a thin cloud of drops, lit by the sun, the moon and
// the sky as mist is. Where the eye looks about 42 degrees from the point opposite the light, the drops send the light
// back as a bow: violet inside, red outside, a fainter reversed bow near 51 degrees, the dark band between, and the
// sky inside the bow a little brighter. The bow lives in the drops, so it is as strong as the spray is thick there and
// comes and goes with the puffs. By day the sun makes it a full rainbow. The moon's bow is as coloured, but the eye
// sees it nearly white, so at night it is drawn nearly white.
//
// A real bow forms only where the light is behind the eye and the spray ahead, at the right height. So that the arch
// always shows its bow, the bow's geometry is steered. Its light comes from behind the eye, at the height that lays
// the 42-degree circle across the middle of the spray. The real sun or moon still decides how much light there is
// to make it, after the air and the clouds between.
import { Group, InstancedBufferAttribute, InstancedBufferGeometry, Float32BufferAttribute, Mesh, MeshBasicNodeMaterial, NormalBlending, DoubleSide, Vector3 } from 'three/webgpu';
import type { Node } from 'three/webgpu';
import {
  Fn, acos, attribute, cameraFar, cameraNear, cameraPosition, cameraWorldMatrix, clamp, dot, exp, float, fract, max, mix,
  modelViewMatrix, modelWorldMatrixInverse, perspectiveDepthToViewZ, positionGeometry, positionView, positionWorld,
  select, sin, smoothstep, texture, uniform, varying, vec2, vec3, vec4, cos,
  positionPrevious,
} from 'three/tsl';
import { overDepth } from '../gpu/behind.ts';
import { R } from '../../sim/sphere.ts';
import { LANDMARKS, REGIONS } from '../../sim/world/index.ts';
import { P } from '../gpu/uniforms.ts';
import { sharedNoise } from '../gpu/noise.ts';
import { thinCloudLight } from '../atmosphere/light.ts';
import { lightTransmittance, MOON_RADIUS, SUN_RADIUS } from '../atmosphere/luts.ts';
import { moonShade, sunShade } from '../atmosphere/shade.ts';
import { stand } from './landmarks.ts';

type F = Node<'float'>;
type V2 = Node<'vec2'>;
type V3 = Node<'vec3'>;
type V4 = Node<'vec4'>;

const DEG = Math.PI / 180;
/** The puffs of spray in the air at once. */
const PUFFS = 170;
/** Where the swell breaks: the arch's feet stand at x = ±FOOT, about REACH across, in the arch's own frame. */
const FOOT = 28, REACH = 10.5;
/** The height of the middle of the spray, where the bow is laid across it. */
const MIDDLE = 11;
/** The drops' light toward the bow per unit of the light on them, at the bow's brightest. */
const BOW = 0.8;
/** The bow's radius, degrees: the angle between the light's antipode and the bow's middle. */
const RADIUS = 41.4;
/** The eye stops working the spray out from this far. */
const FAR = 900;

/** The bow's colour across a band, from 0 at violet to 1 at red. */
const spectrum = (x: F): V3 =>
  vec3(
    smoothstep(0.42, 0.85, x).add(smoothstep(0.18, 0, x).mul(0.55)),
    smoothstep(0.12, 0.48, x).mul(smoothstep(0.98, 0.58, x)),
    smoothstep(0.58, 0.12, x),
  );
const band = (x: F): F => smoothstep(-0.12, 0.12, x).mul(smoothstep(1.12, 0.88, x));

/** The light the drops at p send toward the eye per unit of the direct light on them, at angle degrees from the
 *  light's antipode: the primary bow, the secondary reversed and fainter, the brighter sky inside the primary. */
const bowAt = (angle: F): V3 => {
  const x1 = angle.sub(40.4).div(2.2), x2 = float(53.8).sub(angle).div(3.4);
  return spectrum(x1).mul(band(x1)).add(spectrum(x2).mul(band(x2)).mul(0.25)).add(smoothstep(40.5, 33, angle).mul(0.12));
};

export class Moonbow {
  readonly group = new Group();
  /** Where the bow's light comes from, steered behind the eye; world space. */
  readonly #light = uniform(new Vector3(0, 1, 0));
  /** How much spray the surf throws, 0 to 1. */
  readonly #amount = uniform(0.7);
  readonly #centre = new Vector3();
  readonly #eyeUp = new Vector3();
  readonly #to = new Vector3();

  constructor() {
    this.group.name = 'moonbow';
    const lm = LANDMARKS.find((l) => REGIONS[l.region].id === 'basaltStacks');
    if (!lm) return;
    stand(this.group, lm.pos, lm.facing, R);
    this.#centre.set(lm.pos.x, lm.pos.y, lm.pos.z).normalize().multiplyScalar(R + MIDDLE);

    const g = new InstancedBufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    const seeds = new Float32Array(PUFFS * 4);
    let s = 0x2545f491;
    for (let i = 0; i < seeds.length; i++) { s = (s * 1664525 + 1013904223) >>> 0; seeds[i] = s / 4294967296; }
    g.setAttribute('aSeed', new InstancedBufferAttribute(seeds, 4));
    g.instanceCount = PUFFS;
    const mesh = new Mesh(g, this.#material());
    mesh.frustumCulled = false;
    mesh.renderOrder = 6;
    this.group.add(mesh);
  }

  #material(): MeshBasicNodeMaterial {
    const m = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: DoubleSide, blending: NormalBlending });
    const seed = attribute<'vec4'>('aSeed') as V4;
    const noise = sharedNoise();
    // each puff's life: thrown up off the break, swelling and thinning as it climbs and drifts downwind
    const life = seed.x.mul(4).add(6);
    const age = fract(P.time.div(life).add(seed.y));
    // two in three are thrown off the feet, the rest off the swell running through the passage
    const side = select(fract(seed.z.mul(7.7)).lessThan(0.5), float(-1), float(1));
    const atFoot = seed.z.lessThan(0.67);
    const a = seed.w.mul(Math.PI * 2);
    const footX = side.mul(float(FOOT - REACH).add(cos(a).mul(2.5)));
    const footZ = sin(a).mul(REACH * 0.8);
    const passX = fract(seed.w.mul(7.31)).sub(0.5).mul(2 * (FOOT - REACH) * 0.9);
    const passZ = fract(seed.w.mul(3.17)).sub(0.5).mul(36);
    const x0 = select(atFoot, footX, passX), z0 = select(atFoot, footZ, passZ);
    const wind = modelWorldMatrixInverse.mul(vec4(P.wind, 0)).xyz;
    const climb = float(1).sub(exp(age.mul(-2.2))).mul(fract(seed.x.mul(13.7)).mul(16).add(7));
    const drift = wind.mul(age.mul(life).mul(0.35));
    const centre = vec3(x0.add(drift.x).sub(side.mul(age).mul(select(atFoot, float(6), float(0)))), climb.add(1), z0.add(drift.z));
    const size = age.mul(6.5).add(2).mul(fract(seed.y.mul(5.3)).mul(0.6).add(0.7));
    const alpha = sin(age.mul(Math.PI)).mul(smoothstep(0, 0.08, age)).mul(this.#amount).mul(0.12);

    // a camera-facing quad round the puff's centre
    const mv = modelViewMatrix.mul(vec4(centre, 1));
    const q = positionGeometry.xy;
    const world = cameraWorldMatrix.mul(vec4(mv.xy.add(q.mul(size)), mv.z, 1));
    m.positionNode = Fn(() => {
      const at = modelWorldMatrixInverse.mul(world).xyz.toVar();
      positionPrevious.assign(at);
      return at;
    })();

    const vq = varying(q, 'vSprayQ') as unknown as V2;
    const va = varying(alpha, 'vSprayA') as unknown as F;
    const vseed = varying(seed.x, 'vSpraySeed') as unknown as F;
    const vsize = varying(size, 'vSpraySize') as unknown as F;
    const r2 = dot(vq, vq);
    // the puff: soft at the rim, torn by noise that turns slowly with it
    const tear = texture(noise, vq.mul(0.35).add(vec2(vseed.mul(7.1), P.time.mul(0.01)))).r
      .mul(0.65).add(texture(noise, vq.mul(0.9).add(vec2(P.time.mul(0.017), vseed.mul(3.3)))).g.mul(0.35));
    const shape = smoothstep(1, 0.1, r2).mul(smoothstep(0.4, 0.85, tear.add(float(0.32).sub(r2.mul(0.5)))));
    // soft where it meets the rock and the water
    const behind = perspectiveDepthToViewZ(overDepth().x, cameraNear, cameraFar);
    const soft = clamp(positionView.z.sub(behind).div(max(vsize.mul(0.4), 1)), 0, 1);
    // and thin up close, so the eye sails through it rather than into a wall
    const near = smoothstep(1, 6, positionView.z.negate());
    m.opacityNode = clamp(shape.mul(va).mul(soft).mul(near), 0, 1);
    m.alphaTest = 0.002;

    m.colorNode = Fn(() => {
      const p = positionWorld;
      const r = p.length(), up = p.div(r);
      // the direct light on the drops, after the air and the clouds over them
      const sun = lightTransmittance(r, up.dot(P.sunDir), float(SUN_RADIUS)).mul(P.sunIlluminance).mul(sunShade(p));
      const moon = lightTransmittance(r, up.dot(P.moonDir), float(MOON_RADIUS)).mul(P.moonIlluminance).mul(P.moonPhase).mul(moonShade(p));
      const view = p.sub(cameraPosition).normalize();
      const angle = acos(clamp(view.dot(this.#light.negate()), -1, 1)).mul(1 / DEG);
      const bow = bowAt(angle);
      // the eye's rods see the moon's bow nearly white
      const moonShare = dot(moon, vec3(0.3)).div(max(dot(sun.add(moon), vec3(0.3)), 1e-9));
      const seen = mix(bow, vec3(dot(bow, vec3(0.36))), moonShare.mul(0.6));
      return thinCloudLight(p).mul(0.92).add(seen.mul(sun.add(moon)).mul(BOW));
    })();
    return m;
  }

  /** Steers the bow's light for the eye, and stops working the spray out when the eye is far. wind: m/s. */
  update(eye: Vector3, wind: number): void {
    const far = eye.distanceTo(this.#centre) > FAR;
    this.group.visible = !far && this.group.children.length > 0;
    if (!this.group.visible) return;
    this.#amount.value = 0.6 + 0.4 * Math.min(1, wind / 12);
    // the light behind the eye, at the height that lays the bow across the middle of the spray
    const up = this.#eyeUp.copy(eye).normalize(), to = this.#to.copy(this.#centre).sub(eye).normalize();
    const rise = Math.asin(Math.max(-1, Math.min(1, to.dot(up))));
    const el = Math.max(0.07, Math.min(0.7, RADIUS * DEG - rise));
    to.addScaledVector(up, -to.dot(up));
    if (to.lengthSq() < 1e-8) to.set(1, 0, 0).addScaledVector(up, -up.x);
    to.normalize().negate();
    (this.#light.value as Vector3).copy(to).multiplyScalar(Math.cos(el)).addScaledVector(up, Math.sin(el)).normalize();
  }
}


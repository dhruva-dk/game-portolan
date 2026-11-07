// How the air lights every surface. Three lights, all worked out per fragment from where it is on the sphere:
//
//  - the sun: a directional light whose colour is the sun's light after the air between it and that fragment, faded
//    over the sun's disc as it sinks behind the limb, so dawn is red on the eastern capes while the sea behind is
//    still in night, and the terminator is a soft band across the globe; and after the clouds over it (shade.ts);
//  - the moon: the same, at the moon's illuminance and phase;
//    each worked out only while its body lights anything the eye can see (bodiesFor): by day the moon is under the
//    horizon of everything in view, and at night so is the sun, and neither is paid for then;
//  - the sky: the light of the whole sky and the sea under it on a surface facing its normal (an ambient cube from the
//    irradiance tables), and the sky's reflection in glossy surfaces (a filtered probe of the sky round the eye,
//    turned to each fragment's own horizon and coloured by its own sky).
import {
  AnalyticLightNode, DirectionalLight, DirectionalLightNode, Light, type Node, type NodeBuilder, type Texture, type Vector3,
} from 'three/webgpu';
import {
  Fn, If, cameraWorldMatrix, clamp, float, max, mix, normalView, normalWorld, pmremTexture, positionViewDirection, positionWorld,
  int, pow, roughness, texture, uniform, vec2, vec3,
} from 'three/tsl';
import { AIR } from './model.ts';
import { IRRADIANCE, IRRADIANCE_FACE, MOON_RADIUS, SUN_RADIUS, lightTransmittance, skyIrradiance, tables } from './luts.ts';
import { P, shared } from '../gpu/uniforms.ts';
import { probeEye } from './sky.ts';
import { bodyShades } from './shade.ts';

type V3 = Node<'vec3'>;

/** 1 while the sun's light, and the moon's, reaches anything the eye can see. */
export const BODIES = shared({ sun: uniform(1), moon: uniform(1) });

/** How far below the eye's horizon a body has gone (the sine of its height) when it lights nothing in view, not even
 *  the tops of the spires against the sky: where the clouds take their light from the moon, too. */
const GONE = -0.55;

/** Which bodies light anything in view from an eye whose up is `up`. */
export function bodiesFor(up: Vector3, sun: Vector3, moon: Vector3): void {
  BODIES.sun.value = up.dot(sun) > GONE ? 1 : 0;
  BODIES.moon.value = up.dot(moon) > GONE && (P.moonPhase.value as number) > 0 ? 1 : 0;
}

/** The sun's light as it arrives at the fragment being shaded. */
export const sunlight = Fn(() => {
  const p = positionWorld;
  const r = p.length();
  return lightTransmittance(r, p.div(r).dot(P.sunDir), SUN_RADIUS).mul(P.sunIlluminance).mul(bodyShades(p).sun);
})();

/** The moon's light as it arrives at the fragment being shaded. */
export const moonlight = Fn(() => {
  const p = positionWorld;
  const r = p.length();
  return lightTransmittance(r, p.div(r).dot(P.moonDir), MOON_RADIUS).mul(P.moonIlluminance).mul(P.moonPhase).mul(bodyShades(p).moon);
})();

/** The faint light left when neither sun nor moon is up: the stars and the glow of the high air. */
const NIGHT_FLOOR = vec3(0.0009, 0.0012, 0.0022);

/** Lightning's light thrown down from the clouds it flashes through, at a flash of 1: a sheet of it over everything,
 *  coming from above, a little round the sides and hardly from below. */
const FLASH_LIGHT = vec3(0.72, 0.78, 1).mul(5);

/** The sky's irradiance on a surface at p facing n, from the sun and the moon, and lightning's flash. */
export const skyLight = Fn(([p, n]: [V3, V3]) => {
  const flash = FLASH_LIGHT.mul(P.flash).mul(n.dot(p.normalize()).mul(0.45).add(0.55));
  return skyIrradiance(p, n, P.sunDir).mul(P.sunIlluminance)
    .add(skyIrradiance(p, n, P.moonDir).mul(P.moonIlluminance).mul(P.moonPhase))
    .add(NIGHT_FLOOR)
    .add(flash);
});

/** The sky's overall brightness straight up at p: what the probe of the eye's sky is scaled by elsewhere. */
const zenithLight = (p: V3): V3 => {
  const r = p.length();
  const up = p.div(r);
  const y = clamp(r.sub(AIR.bottom).div(AIR.top.sub(AIR.bottom)), 0, 1).mul(1 - 1 / IRRADIANCE.y).add(0.5 / IRRADIANCE.y);
  const at = (l: V3) => vec2(clamp(up.dot(l).mul(0.5).add(0.5), 0, 1).mul(1 - 1 / IRRADIANCE.x).add(0.5 / IRRADIANCE.x), y);
  const upward = (l: V3) => texture(tables.irradiance, at(l)).depth(int(IRRADIANCE_FACE.up)).rgb;
  return upward(P.sunDir).mul(P.sunIlluminance)
    .add(upward(P.moonDir).mul(P.moonIlluminance).mul(P.moonPhase))
    .add(NIGHT_FLOOR);
};

/**
 * Turns a direction at the fragment's place into the same direction at the eye's: the rotation that takes the
 * fragment's up to the eye's. The probe was taken round the eye; this is how a cliff on the far side of the bay sees
 * its own sky above it and the sea below it in the probe, rather than the eye's sea.
 */
const toEyeFrame = (v: V3, up: V3, eyeUp: V3): V3 => {
  const w = up.cross(eyeUp);
  const c = up.dot(eyeUp);
  return v.mul(c).add(w.cross(v)).add(w.mul(w.dot(v)).div(max(c.add(1), 1e-3)));
};

/** The light the sky throws on everything the scene draws: diffuse from the irradiance table, specular from the
 *  probe. Added to the scene as a light; three finds its node through the library (see Atmosphere). */
export class SkyLight extends Light {
  readonly isSkyLight = true;
  /** The filtered probe of the sky round the eye, a PMREM; null until the first is taken. */
  probe: Texture | null = null;

  constructor() {
    super(0xffffff, 1);
    (this as { type: string }).type = 'SkyLight';
  }
}

export class SkyLightNode extends AnalyticLightNode<SkyLight> {
  static get type(): string {
    return 'SkyLightNode';
  }

  setup(builder: NodeBuilder): null {
    const context = builder.context as unknown as { irradiance: V3; iblIrradiance: V3; radiance: V3 };
    const material = builder.material as { isMeshStandardNodeMaterial?: boolean };
    const p = positionWorld;
    const n = normalWorld;
    const diffuse = skyLight(p, n);
    if (!material.isMeshStandardNodeMaterial) {
      context.irradiance.addAssign(diffuse);
      return null;
    }
    // in the standard model the image-based irradiance is shared out between the diffuse and the multiply-scattered
    // specular, so the sky's diffuse goes there and nothing goes to the plain irradiance
    context.iblIrradiance.addAssign(diffuse);
    const probe = this.light?.probe;
    if (!probe) return null;
    const reflected = positionViewDirection.negate().reflect(normalView);
    const lobe = pow(roughness, 4).mix(reflected, normalView).normalize().transformDirection(cameraWorldMatrix);
    const up = p.normalize();
    const eye = probeEye;
    const eyeUp = eye.normalize();
    const turned = toEyeFrame(lobe, up, eyeUp);
    const here = zenithLight(p);
    const there = zenithLight(eye);
    const scale = clamp(here.div(max(there, vec3(1e-6))), vec3(0), vec3(4));
    // close to the eye the probe is right as it is; the scaling takes over with distance
    const near = clamp(p.sub(eye).length().div(120), 0, 1);
    const radiance = pmremTexture(probe, turned, roughness).rgb.mul(mix(vec3(1), scale, near));
    context.radiance.addAssign(radiance);
    return null;
  }
}

/** A body in the sky's light, its colour taken per fragment through the air, worked out only while `on`. */
export class BodyLight extends DirectionalLight {
  readonly colorNode: V3;
  readonly on: Node<'float'>;

  constructor(colour: V3, on: Node<'float'>) {
    super(0xffffff, 1);
    this.colorNode = colour;
    this.on = on;
  }
}

export class BodyLightNode extends DirectionalLightNode {
  static get type(): string {
    return 'BodyLightNode';
  }

  setup(builder: NodeBuilder): undefined {
    If((this.light as BodyLight).on.greaterThan(0.5), () => {
      super.setup(builder);
    });
    return undefined;
  }
}

/**
 * The light a thin cloud at p sends to the eye per unit of its albedo: the sun and the moon through the air and after
 * the clouds over it, and the sky's light from above and below, scattered about evenly so a quarter of what falls on
 * it from each side comes back. For smoke, mist, spray and falling water.
 */
export const thinCloudLight = (p: V3): V3 => {
  const r = p.length(), up = p.div(r);
  const shade = bodyShades(p);
  const sun = lightTransmittance(r, up.dot(P.sunDir), float(SUN_RADIUS)).mul(P.sunIlluminance).mul(shade.sun);
  const moon = lightTransmittance(r, up.dot(P.moonDir), float(MOON_RADIUS)).mul(P.moonIlluminance).mul(P.moonPhase).mul(shade.moon);
  const sky = skyLight(p, up).add(skyLight(p, up.negate())).mul(0.5);
  return sun.add(moon).mul(0.25).add(sky.div(Math.PI));
};

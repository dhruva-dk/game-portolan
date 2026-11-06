// The uniforms every shader on the planet shares, as TSL nodes. The stage sets their values once a frame; materials,
// the sky, the sea and the effects read the same nodes, so they all stand in the same light, wind and tide.
//
// The planet's centre is the world origin. Nothing uses a global "up": every shader works out its own up from where
// it is on the sphere, which is how one sun leaves half the planet dark and how the same shaders hold from the deck
// and from orbit.
import { Vector3, Vector4 } from 'three/webgpu';
import { mix, uniform, uniformArray } from 'three/tsl';
import { R } from '../../sim/sphere.ts';

export const MAX_LIFTS = 5;

export const P = {
  /** Seconds on the clock every animated thing shares. */
  time: uniform(0),
  /** Seconds since the last frame. */
  dt: uniform(1 / 60),
  /** Counts the frames drawn, wrapping at 64: what turns the noise that the temporal upscaler gathers. */
  frame: uniform(0),
  /** Unit vector toward the sun, in the planet's frame. */
  sunDir: uniform(new Vector3(0.3, 0.5, 0.2).normalize()),
  /** Unit vector toward the moon. */
  moonDir: uniform(new Vector3(-0.3, -0.5, -0.2).normalize()),
  /** The sun's illuminance above the air, linear RGB: the one number that sets how bright the day is. */
  sunIlluminance: uniform(new Vector3(6, 6, 6)),
  /** The moon's, before its phase and the air. */
  moonIlluminance: uniform(new Vector3(0.55, 0.62, 0.8).multiplyScalar(0.06)),
  /** How full the moon is from here, 0 new to 1 full. */
  moonPhase: uniform(1),
  /** x: the ground's radius, y: the sea's radius (radius plus tide), z: the tide, w: the air's top radius. */
  planet: uniform(new Vector4(R, R, 0, R + 180)),
  /** The wind at the camera, a tangent in metres per second. */
  wind: uniform(new Vector3(4, 0, 2)),
  /** How far the wind has carried things so far: what ripples, clouds and leaves scroll by. */
  drift: uniform(new Vector3()),
  /** 1 where it is night at the camera. */
  night: uniform(0),
  /** Lightning's flash, 0…1, and its colour. */
  flash: uniform(0),
  /** The safe circle: centre (unit vector) and the cosine of its angular radius; stormOn is 0 before it forms. */
  storm: uniform(new Vector4(0, 1, 0, -2)),
  stormOn: uniform(0),
  /** How rough the sea is where the camera is, 0 glass to 1 a gale, from the wind and the weather. */
  seaState: uniform(0.4),
  /** The deep sea's own diffuse reflectance where the camera is: the light that goes into the water and is scattered
   *  back out of it, which is the sea's colour wherever the floor is too deep to see. */
  seaDeep: uniform(new Vector3(0.0045, 0.022, 0.034)),
  /** Rain falling where the camera is, 0…1: wet surfaces, rings on the sea. */
  rain: uniform(0),
  /** Snow settling where the camera is, 0…1. */
  snow: uniform(0),
  /** How far the camera is up into space, 0 at sea to 1 in orbit. */
  space: uniform(0),
  /** The water the regions' events move: each disc's middle (xyz) and how far it moves the sea now (w), and its
   *  radius, fade and region channel; liftOn says whether any moves it at all. */
  liftAt: uniformArray(Array.from({ length: MAX_LIFTS }, () => new Vector4()), 'vec4'),
  liftR: uniformArray(Array.from({ length: MAX_LIFTS }, () => new Vector4(1, 1, 0, 0)), 'vec4'),
  liftOn: uniform(0),
};

/** Lightning striking now, as the bolts set it (actors/lightning.ts): where its channel enters the cloud, and how
 *  bright its stroke is, 0…1. The clouds light up round it, and the whole sky flashes by how near it is. */
export const STRIKE = { top: new Vector3(), foot: new Vector3(), light: 0 };

/** The values behind P, for code on the CPU that needs them. */
export const values = {
  get sun(): Vector3 { return P.sunDir.value as Vector3; },
  get moon(): Vector3 { return P.moonDir.value as Vector3; },
  get planet(): Vector4 { return P.planet.value as Vector4; },
};

/**
 * What a lamp's light is scaled by: the lanterns, the wisps, embers and glowing loot. The eye adapts across a range of
 * light the lamps don't (the day is some thousand times brighter than the night), so a lamp kept at one luminance is
 * lost by day and blinding at night. Each glow is given as it should read against a lit deck, and this scales it from
 * a lamp that still shows in daylight to one that holds its own against the night once the eye has adapted.
 */
export const LAMP = mix(0.4, 0.005, P.night);

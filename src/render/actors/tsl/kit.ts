// What the actors' node materials share: their uniforms, read straight from the records the actors already keep (so a
// ship's colours, damage and hit flash are set once and both renderers see them), a chain of cases for shaders that
// colour by part, and a dither for fading a surface out without blending it.
import type { Node, Texture } from 'three/webgpu';
import { interleavedGradientNoise, reference, screenCoordinate, select, texture } from 'three/tsl';
import { P } from '../../gpu/uniforms.ts';

export type F = Node<'float'>;
export type V2 = Node<'vec2'>;
export type V3 = Node<'vec3'>;
export type V4 = Node<'vec4'>;
export type B = Node<'bool'>;

/** An actor's uniforms: the same `{ value }` records its WebGL shaders are given. */
export type Uniforms = Record<string, { value: unknown }>;

/** Reads one of an actor's uniforms each time the object is drawn. */
export function read(u: Uniforms, name: string, type: 'float'): F;
export function read(u: Uniforms, name: string, type: 'vec2'): V2;
export function read(u: Uniforms, name: string, type: 'vec3' | 'color'): V3;
export function read(u: Uniforms, name: string, type: 'vec4'): V4;
export function read(u: Uniforms, name: string, type: string): Node {
  if (!(name in u)) throw new Error(`the actor has no uniform ${name}`);
  return reference('value', type, u[name]) as unknown as Node;
}

/** Samples one of an actor's textures at `at`, following the record when the texture in it is swapped. */
export function readTexture(u: Uniforms, name: string, at: V2): V4 {
  if (!(name in u)) throw new Error(`the actor has no uniform ${name}`);
  const node = texture(u[name].value as Texture, at) as unknown as V4 & { onObjectUpdate(f: () => unknown): unknown };
  node.onObjectUpdate(() => u[name].value);
  return node;
}

/** The first case whose test holds, else the fallback: a chain of selects, with no branches for a shared node to be
 *  emitted inside. */
export function pick<T extends Node>(cases: readonly (readonly [B, T])[], fallback: T): T {
  let out = fallback as Node;
  for (let i = cases.length - 1; i >= 0; i--) out = select(cases[i][0], cases[i][1], out);
  return out as T;
}

/**
 * A threshold for fading a surface out without blending it, 0…1 at this pixel: where it is below the fade, the pixel
 * is dropped. Interleaved gradient noise (Jimenez 2014) moved on each frame, so the temporal upscaler gathers the
 * dropped pixels into an even see-through rather than the fixed grid an ordered dither leaves.
 */
export function dither(): F {
  return interleavedGradientNoise(screenCoordinate.xy.add(P.frame.mul(5.588238)));
}

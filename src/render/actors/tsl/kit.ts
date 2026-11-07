// What the actors' node materials share: their uniforms, read straight from the records the actors already keep (so a
// ship's colours, damage and hit flash are set once and both renderers see them), a chain of cases for shaders that
// colour by part, and a dither for fading a surface out without blending it.
import type { Node, Texture } from 'three/webgpu';
import { interleavedGradientNoise, materialEmissive, positionPrevious, reference, screenCoordinate, select, texture } from 'three/tsl';
import { LAMP } from '../../gpu/uniforms.ts';
import { P } from '../../gpu/uniforms.ts';

export type F = Node<'float'>;
export type V2 = Node<'vec2'>;
export type V3 = Node<'vec3'>;
export type V4 = Node<'vec4'>;
export type B = Node<'bool'>;

/** An actor's uniforms: `{ value }` records the actor sets each frame and its nodes read. */
export type Uniforms = Record<string, { value: unknown }>;

/** Uniforms marked by drawnUniforms. */
const DRAWN = new WeakSet<Uniforms>();

/**
 * Uniforms read from whichever object is being drawn, which carries its actor's own in userData.u: a material made
 * from these serves every actor of a kind, and is built once for all of them rather than once each (three keys a
 * material by its nodes, and every actor's uniforms are nodes of their own). `template` gives the names, the types
 * and the values the material is first built with.
 */
export function drawnUniforms(template: Uniforms): Uniforms {
  const u = { ...template };
  DRAWN.add(u);
  return u;
}

/** Reads one of an actor's uniforms each time the object is drawn. */
export function read(u: Uniforms, name: string, type: 'float'): F;
export function read(u: Uniforms, name: string, type: 'vec2'): V2;
export function read(u: Uniforms, name: string, type: 'vec3' | 'color'): V3;
export function read(u: Uniforms, name: string, type: 'vec4'): V4;
export function read(u: Uniforms, name: string, type: string): Node {
  if (!(name in u)) throw new Error(`the actor has no uniform ${name}`);
  if (DRAWN.has(u)) return reference(`userData.u.${name}.value`, type, null) as unknown as Node;
  return reference('value', type, u[name]) as unknown as Node;
}

/** One of an actor's uniform arrays, read each time the object is drawn. */
export function readArray(u: Uniforms, name: string, type: 'vec4'): Node & { element(i: unknown): Node } {
  if (!(name in u)) throw new Error(`the actor has no uniform ${name}`);
  const path = DRAWN.has(u) ? `userData.u.${name}.value` : 'value';
  return reference(path, type, DRAWN.has(u) ? null : u[name]) as unknown as Node & { element(i: unknown): Node };
}

/** Samples one of an actor's textures at `at`, following the record when the texture in it is swapped. */
export function readTexture(u: Uniforms, name: string, at: V2): V4 {
  if (!(name in u)) throw new Error(`the actor has no uniform ${name}`);
  const node = texture(u[name].value as Texture, at) as unknown as V4 & { onObjectUpdate(f: (frame: { object: { userData: { u: Uniforms } } | null }) => unknown): unknown };
  node.onObjectUpdate(DRAWN.has(u) ? ({ object }) => object!.userData.u[name].value : () => u[name].value);
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

/**
 * Moves a vertex to `p` in its object's own space as of the frame before as well, and returns `p`. Called inside a
 * position node's Fn, before an instance's matrix if there is one. The motion vectors are worked out from the
 * previous position, and left alone that is the raw geometry: they would carry the whole of a sail's belly or a
 * sprite's corner as motion, and the upscaler would draw the history from the wrong place. A shape's own motion
 * between two frames is a few centimetres at most, so only the object's motion is counted.
 */
export function moved(p: V3): V3 {
  positionPrevious.assign(p);
  return p;
}

/**
 * The glow of a plain lit material (its emissive colour, intensity and map) at the lamps' scale, for an eye that
 * adapts from noon to moonlight: GL's fixed exposure took an emissive as it was.
 */
export function lampEmissive(): V3 {
  return (materialEmissive as unknown as V3).mul(LAMP).mul(2.5);
}

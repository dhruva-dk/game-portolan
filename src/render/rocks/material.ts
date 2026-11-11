// The rock material: a standard node material (nodes.ts) that textures itself from scanned photographs by triplanar
// projection in the rock's own space (so textures stick to moving floes and to instanced copies), with a close-up
// detail normal at 10 m, a large-scale variation that breaks tiling at 50 m, a cover layer (moss, snow, turf) on
// faces that look up, and wetness that darkens and glosses the rock toward the waterline.
//
// The sea is described once for every rock by ROCK_UNIFORMS.uSea: (centre, radius) of the sea sphere, or, with a
// radius of 0, a flat sea at y = centre.y. The integration step points it at the planet and adds the tide.
import * as THREE from 'three';
import { loadAstc } from '../gpu/astc.ts';
import { SKINS, type SkinId, type TexId } from './skins.ts';
import { rockNodeMaterial } from './nodes.ts';

/** Uniforms every rock material shares by reference. */
export const ROCK_UNIFORMS = {
  /** xyz: the sea's centre; w: its radius (0 means a flat sea at y = centre.y). Tide moves the radius. */
  uSea: { value: new THREE.Vector4(0, 0, 0, 0) },
  /** Daylight 0..1: scales the light ice seems to hold inside, so it does not glow at night. */
  uDaylight: { value: 1 },
  /** Distances in metres over which the close-up detail normal fades out. */
  uDetailFade: { value: new THREE.Vector2(10, 32) },
};

let base = 'tex/rocks/';
/** Where the rock textures are served from: 'tex/rocks/' relative to the page by default, like the game's other textures. */
export function setRockTextureBase(url: string): void {
  base = url.endsWith('/') ? url : url + '/';
}

const textures = new Map<string, THREE.Texture>();
const loading: Promise<void>[] = [];
/** Settles once every rock texture asked for so far has loaded (or failed), so a still is never shot of black rock. */
export const rockTexturesReady = (): Promise<void[]> => Promise.all(loading);
let anisotropy = 8;
/** Caps the anisotropic filtering of every rock texture loaded from now on. */
export function setRockAnisotropy(n: number): void {
  anisotropy = n;
}

function texture(id: TexId, kind: 'd' | 'n'): THREE.Texture {
  const key = `${id}_${kind}`;
  let t = textures.get(key);
  if (!t) {
    let done!: () => void;
    loading.push(new Promise<void>((ok) => (done = ok)));
    t = loadAstc(`${base}${key}.jpg`, kind === 'd', done, done);
    t.name = `rock/${key}`;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = kind === 'd' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.anisotropy = anisotropy;
    textures.set(key, t);
  }
  return t;
}

const materials = new Map<string, THREE.MeshStandardMaterial>();

/** The material for a skin, built once and shared; `floats` for a floe riding the water, which the tide leaves no mark on. */
export function rockMaterial(id: SkinId, floats = false): THREE.MeshStandardMaterial {
  const key = floats ? `${id}:floats` : id;
  let m = materials.get(key);
  if (m) return m;
  m = (rockNodeMaterial(id, SKINS[id], texture, ROCK_UNIFORMS, floats) as unknown as THREE.MeshStandardMaterial);
  materials.set(key, m);
  return m;
}

/** A still, dark, glassy surface for the water that lies in tide pools and at cliff feet. */
let poolMat: THREE.MeshStandardMaterial | null = null;
export function poolMaterial(): THREE.MeshStandardMaterial {
  if (!poolMat) {
    poolMat = new THREE.MeshStandardMaterial({ color: 0x0b2a2c, roughness: 0.04, metalness: 0, transparent: true, opacity: 0.82, name: 'rock:pool' });
  }
  return poolMat;
}

// Debug only (?probe): grey blocks at 30, 60, 100 and 150 m north of where she (or the flyer) starts, lit by the sky's light,
// to judge the light and the haze; and a mirror and a rough sphere 60 m north, to judge the sky's reflection. Each
// stands upright on the sphere.

import { BoxGeometry, Matrix4, Mesh, MeshBasicNodeMaterial, SphereGeometry, Vector3 } from 'three/webgpu';
import { dot, float, max, normalWorld, positionWorld, reflectVector, vec3 } from 'three/tsl';
import type { Sky } from './sky/sky';
import { add, along, frameAt, length, normalize, place, type Vec3 } from './world/sphere';

/** The probe's meshes, standing north of `eye` (world metres), for the frame to stand in its scene. */
export function probeMeshes(sky: Sky, eye: Vec3): Mesh[] {
  const meshes: Mesh[] = [];
  const f = frameAt(eye);
  /** Stands a mesh `north` and `east` metres from under the eye, its foot `height` up, upright there. */
  const stand = (mesh: Mesh, north: number, east: number, height: number) => {
    const out = add(add([0, 0, 0], f.north, north), f.east, east);
    const metres = length(out);
    const at: Vec3 = metres > 0 ? along(f.up, normalize(out), metres).p : f.up;
    const g = frameAt(at);
    mesh.matrixAutoUpdate = false;
    mesh.matrix.makeBasis(new Vector3(...g.east), new Vector3(...g.up), new Vector3(...g.north).negate())
      .setPosition(...place(at, height))
      .multiply(new Matrix4().makeRotationY(0.6));
    meshes.push(mesh);
  };
  for (const [roughness, x] of [[0, -12], [0.35, 12]]) {
    const m = new MeshBasicNodeMaterial();
    m.colorNode = sky.reflect(reflectVector, float(roughness));
    stand(new Mesh(new SphereGeometry(8, 64, 32), m), 60, x, 8);
  }
  const material = new MeshBasicNodeMaterial();
  const albedo = vec3(0.5);
  const p = positionWorld;
  material.colorNode = albedo.mul(sky.sunIlluminance(p).mul(sky.cloudShadow(p)).mul(max(dot(normalWorld, sky.sun(p)), 0)).add(sky.ambient(p, normalWorld)));
  for (const [metres, x] of [[30, -12], [60, 25], [100, -40], [150, 60]]) {
    const size = metres / 10;
    stand(new Mesh(new BoxGeometry(size, size * 1.5, size), material), metres, x, size * 0.75 - 1);
  }
  return meshes;
}

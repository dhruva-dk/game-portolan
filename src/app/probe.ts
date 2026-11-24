import {
  BoxGeometry,
  Matrix4,
  Mesh,
  MeshBasicNodeMaterial,
  SphereGeometry,
  Vector3,
} from 'three/webgpu';
import {
  dot,
  float,
  max,
  normalWorld,
  positionWorld,
  reflectVector,
  vec3,
} from 'three/tsl';
import type { Sky } from '../render/sky/sky.ts';
import {
  add,
  along,
  frameAt,
  length,
  normalize,
  place,
  type Vec3,
} from '../world/sphere.ts';

export function probeMeshes(sky: Sky, eye: Vec3): Mesh[] {
  const meshes: Mesh[] = [];
  const f = frameAt(eye);
  const stand = (mesh: Mesh, north: number, east: number, height: number) => {
    const out = add(add([0, 0, 0], f.north, north), f.east, east);
    const meters = length(out);
    const at: Vec3 = meters > 0 ? along(f.up, normalize(out), meters).p : f.up;
    const g = frameAt(at);
    mesh.matrixAutoUpdate = false;
    mesh.matrix
      .makeBasis(
        new Vector3(...g.east),
        new Vector3(...g.up),
        new Vector3(...g.north).negate()
      )
      .setPosition(...place(at, height))
      .multiply(new Matrix4().makeRotationY(0.6));
    meshes.push(mesh);
  };
  for (const [roughness, x] of [
    [0, -12],
    [0.35, 12],
  ]) {
    const m = new MeshBasicNodeMaterial();
    m.colorNode = sky.reflect(reflectVector, float(roughness));
    stand(new Mesh(new SphereGeometry(8, 64, 32), m), 60, x, 8);
  }
  const material = new MeshBasicNodeMaterial();
  const albedo = vec3(0.5);
  const p = positionWorld;
  const sun = sky
    .sunIlluminance(p)
    .mul(sky.cloudShadow(p))
    .mul(max(dot(normalWorld, sky.sun(p)), 0));
  material.colorNode = albedo.mul(sun.add(sky.ambient(p, normalWorld)));
  for (const [meters, x] of [
    [30, -12],
    [60, 25],
    [100, -40],
    [150, 60],
  ]) {
    const size = meters / 10;
    stand(
      new Mesh(new BoxGeometry(size, size * 1.5, size), material),
      meters,
      x,
      size * 0.75 - 1
    );
  }
  return meshes;
}

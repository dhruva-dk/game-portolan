// Debug only (?probe): grey blocks at 0.3, 1, 3 and 8 km, lit by the sky's light, to judge the light and the haze.

import { BoxGeometry, Mesh, MeshBasicNodeMaterial, type Scene } from 'three/webgpu';
import { dot, max, normalWorld, positionWorld, vec3 } from 'three/tsl';
import { ambient, cloudShadow, sunDirection, sunIlluminance } from './sky/sky';

export function addProbe(scene: Scene) {
  const material = new MeshBasicNodeMaterial();
  const albedo = vec3(0.5);
  material.colorNode = albedo.mul(sunIlluminance.mul(cloudShadow(positionWorld)).mul(max(dot(normalWorld, sunDirection), 0)).add(ambient(normalWorld)));
  for (const [km, x] of [[0.3, -0.12], [1, 0.25], [3, -0.6], [8, 1.5]]) {
    const size = 30 * km;
    const box = new Mesh(new BoxGeometry(size, size * 1.5, size), material);
    box.position.set(x * 1000 * km, size * 0.75 - 5, -1000 * km);
    box.rotation.y = 0.6;
    scene.add(box);
  }
}

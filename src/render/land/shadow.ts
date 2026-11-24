import {
  DepthTexture,
  DoubleSide,
  FloatType,
  InstancedMesh,
  LessEqualCompare,
  Matrix4,
  MeshBasicNodeMaterial,
  OrthographicCamera,
  RedFormat,
  RenderTarget,
  Scene,
  Vector3,
  WebGPUCoordinateSystem,
} from 'three/webgpu';
import { float, select, texture, uniform, vec2, vec3, vec4 } from 'three/tsl';
import type { Draw } from '../gpu.ts';
import { place, type Chart } from '../../world/sphere.ts';
import type { Instances } from './site.ts';
import type { FloatNode, Vec3Node } from '../tsl.ts';

const SIZE = 2048;
const SPAN = 200;
const OFFSET = 0.12;
const BIAS = 0.3 / (2 * SPAN);
const MOVED = 0.002;

export interface Shade {
  chart: Chart;
  reach: number;
}

interface Shadow {
  visible(p: Vec3Node, n: Vec3Node): FloatNode;
  cast(...casters: Instances[]): void;
  update(sun: Vector3, place: Shade | null): Draw | null;
}

export function createShadow(): Shadow {
  const target = new RenderTarget(SIZE, SIZE, { format: RedFormat });
  target.depthTexture = new DepthTexture(SIZE, SIZE, FloatType);
  target.depthTexture.compareFunction = LessEqualCompare;
  const camera = new OrthographicCamera(-1, 1, 1, -1, 1, 2 * SPAN);
  camera.coordinateSystem = WebGPUCoordinateSystem;
  const scene = new Scene();
  const draw: Draw = { scene, camera, target };
  const black = new MeshBasicNodeMaterial({ side: DoubleSide });
  black.colorNode = vec3(0);

  const matrix = uniform(new Matrix4());
  const map = texture<'float'>(target.depthTexture);
  const stands: { stand: InstancedMesh; caster: Instances }[] = [];
  const center = new Vector3(),
    up = new Vector3(),
    north = new Vector3(),
    axis = new Vector3(),
    last = new Vector3();
  let covered: Shade | null = null;

  return {
    visible(p, n) {
      const clip = matrix.mul(vec4(p.add(n.mul(OFFSET)), 1));
      const uv = vec2(clip.x.mul(0.5).add(0.5), clip.y.mul(-0.5).add(0.5));
      const ref = clip.z.sub(BIAS);
      const texel = 1 / SIZE;
      const lit = [
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ]
        .map(
          ([x, y]): FloatNode =>
            map
              .sample(uv.add(vec2(x * texel * 0.75, y * texel * 0.75)))
              .compare(ref)
        )
        .reduce((a, b) => a.add(b))
        .mul(0.25);
      const inside = uv.x
        .greaterThan(0)
        .and(uv.x.lessThan(1))
        .and(uv.y.greaterThan(0))
        .and(uv.y.lessThan(1))
        .and(clip.z.greaterThan(0))
        .and(clip.z.lessThan(1));
      return select(inside, lit, float(1));
    },
    cast(...casters) {
      for (const caster of casters) {
        const m = caster.mesh,
          stand = new InstancedMesh(m.geometry, black, m.instanceMatrix.count);
        stand.instanceMatrix = caster.casting().matrices;
        stand.frustumCulled = false;
        stands.push({ stand, caster });
        scene.add(stand);
      }
    },
    update(sun, shade) {
      if (!shade || (shade === covered && sun.angleTo(last) < MOVED))
        return null;
      if (shade !== covered) {
        covered = shade;
        camera.left = camera.bottom = -shade.reach;
        camera.right = camera.top = shade.reach;
        center.set(...place(shade.chart.at, 0));
        up.set(...shade.chart.at);
        north.copy(up).cross(axis.set(...shade.chart.axis));
      }
      for (const { stand, caster } of stands)
        stand.count = caster.casting().count;
      last.copy(sun);
      camera.position.copy(center).addScaledVector(sun, SPAN);
      camera.up.copy(Math.abs(sun.dot(up)) > 0.99 ? north : up);
      camera.lookAt(center);
      camera.updateMatrixWorld();
      camera.updateProjectionMatrix();
      matrix.value.multiplyMatrices(
        camera.projectionMatrix,
        camera.matrixWorldInverse
      );
      return draw;
    },
  };
}
